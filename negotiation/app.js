import { sceneAssets } from './asset-cache.js';
import { applyPhase, cancelRecipe, dispatchEvent, eventRecipes, phaseRecipes } from './host-recipes.js';
import { acceptanceCases, runAcceptanceCase } from './acceptance-cases.js';
import { runDataProbe } from './data-probe.js';
import { createExclusiveRun, createGenerationGuard } from './lifecycle.js';
import { people, reviewCases as legacyCases } from './review-data.js';
import { acceptanceRecords, loadReviewState } from './review-state.js';
import { applyFrontScene, createFrontScene } from './scene-contract.js';
import { applyPreset } from './preset-contract.js';
import { normalizePhotoPng } from './image-normalizer.js';
import { resetSceneControls } from './scene-controls.js';
import { optionPresentation } from './option-contract.js';
import { mountBackgroundChoices, selectedBackground } from './background-controls.js';
const DESIGNER_ROOT = './reference/characters';
const STORAGE_KEY = 'rive-character.negotiation24.review.v3';
const PREVIOUS_STORAGE_KEYS = ['rive-character.negotiation24.review.v2', 'rive-character.negotiation24.review.v1'];
const $ = (id) => document.getElementById(id);
let selectedPerson = 0;
let selectedView = 'front';
let nativeManifest = null;
let nativeSessions = [];
let roomSessions = [];
let activeParticipant = 0;
let nativeLoadRevision = 0;
let dataProbeSession = null;
let nativePalettes = null;
const sourcePalettePromise = fetch('./reference/palettes.json').then((response) => response.ok ? response.json() : null).catch(() => null);
const acceptanceRuns = createExclusiveRun((busy) => document.querySelectorAll('#acceptance-cases button').forEach((button) => { button.disabled = busy; }));
let review = loadReviewState(localStorage, STORAGE_KEY, PREVIOUS_STORAGE_KEYS);
function logHostEvent(detail) {
  const item = document.createElement('li');
  const seat = detail.seat;
  const source = detail.source.type === 'event' ? detail.source.id : `${detail.source.id} · ${detail.source.mood}`;
  const phase = detail.phase === 'scheduledEnd' ? 'geplantes Ende erreicht (kein natives End-Event)' : detail.phase === 'cancelled' ? `abgebrochen · ${detail.reason}` : 'gestartet';
  item.textContent = `${new Date().toLocaleTimeString('de-DE')} · Person ${seat} · ${source} · ${detail.action} · ${phase}`;
  $('event-log').prepend(item);
  while ($('event-log').children.length > 12) $('event-log').lastElementChild.remove();
}

function runHostRecipe(kind) {
  try {
    const seat = activeParticipant + 1;
    const options = { session: nativeSessions[activeParticipant], manifest: nativeManifest, emit: (detail) => logHostEvent({ ...detail, seat }) };
    const result = kind === 'phase'
      ? applyPhase({ ...options, phase: $('phase-select').value })
      : dispatchEvent({ ...options, event: $('event-select').value });
    $('native-status').textContent = `Person ${activeParticipant + 1} · ${result.action} gestartet · Host-Rezept.`;
    mountControls(nativeSessions[activeParticipant].descriptors, nativeSessions[activeParticipant]);
  } catch (error) { $('native-status').textContent = `Host-Rezept nicht verfügbar: ${error.message}`; }
}

function sourceUrl(personIndex = selectedPerson, view = selectedView) {
  return `${DESIGNER_ROOT}/${people[personIndex][0]}-${view}.svg`;
}

function renderSource() {
  const [slug, name] = people[selectedPerson];
  const image = $('source-image');
  image.src = sourceUrl();
  image.alt = `${name}, unveränderte SVG-Referenz, ${selectedView === 'front' ? 'Vorderansicht' : selectedView === 'turn-left' ? 'Drehung links' : 'Drehung rechts'}`;
  $('source-name').textContent = name;
  $('source-count').textContent = `${String(selectedPerson + 1).padStart(2, '0')} / 20`;
  document.querySelectorAll('.view-tabs button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === selectedView)));
  document.querySelectorAll('.reference-card').forEach((button, index) => button.setAttribute('aria-pressed', String(index === selectedPerson)));
}

function renderReferences() {
  $('reference-grid').replaceChildren(...people.map(([slug, name], index) => {
    const button = document.createElement('button');
    button.className = 'reference-card';
    button.type = 'button';
    button.setAttribute('aria-pressed', String(index === selectedPerson));
    const image = document.createElement('img');
    image.src = `${DESIGNER_ROOT}/${slug}-front.svg`;
    image.alt = '';
    image.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = name;
    button.append(image, label);
    button.addEventListener('click', () => { selectedPerson = index; renderSource(); $('source-name').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    return button;
  }));
}

function saveReview() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
  $('save-status').textContent = `Lokal gespeichert · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

function exportReview() {
  const payload = {
    schema: 'negotiation24-review/3', exportedAt: new Date().toISOString(),
    native: nativeManifest ? { available: true, profile: $('native-profile').value, participants: nativeSessions.length, manifest: nativeManifest } : { available: false },
    implementationBoundary: { layout: 'front', uLayout: 'excluded' },
    sourceReference: { person: people[selectedPerson][0], view: selectedView },
    cases: acceptanceRecords(acceptanceCases, review),
    previousReviewNotes: legacyCases.flatMap(([id, title]) => review[id]?.notes ? [{ id, title, notes: review[id].notes }] : []),
  };
  const href = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href, download: `negotiation24-review-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  URL.revokeObjectURL(href);
  $('save-status').textContent = 'JSON exportiert.';
}

function contractValue(manifest, ...paths) {
  for (const path of paths) {
    let value = manifest;
    for (const segment of path.split('.')) value = value?.[segment];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function controlsFrom(manifest) {
  const value = contractValue(manifest, 'controls', 'properties', 'native.controls', 'contract.controls', 'propertyDescriptors');
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value).map(([name, descriptor]) => ({ name, ...descriptor }));
  return [];
}

function fieldType(descriptor) { return String(descriptor.type ?? descriptor.kind ?? '').toLowerCase(); }

function readManifestedValue(descriptor, context) {
  const name = descriptor.name ?? descriptor.id;
  const type = fieldType(descriptor);
  if (!context.instance || !name) return descriptor.default;
  if (type.includes('bool')) return context.instance.boolean(name)?.value;
  if (type.includes('number') || type.includes('float') || type.includes('int')) return context.instance.number(name)?.value;
  if (type.includes('color')) return context.instance.color(name)?.value;
  if (type.includes('enum')) return context.instance.enum(name)?.value;
  if (type.includes('string')) return context.instance.string(name)?.value;
  return descriptor.default;
}

async function setManifestedValue(descriptor, value, context) {
  const name = descriptor.name ?? descriptor.id;
  if (!name) throw new Error('Steuerung ohne Feldnamen.');
  const type = fieldType(descriptor);
  if (descriptor.target === 'stateMachine' || descriptor.kind === 'input') {
    const input = context.inputs.find((candidate) => candidate.name === name);
    if (!input) throw new Error(`State-Machine-Feld ${name} fehlt.`);
    if (type.includes('trigger')) input.fire(); else input.value = value;
    return;
  }
  if (!context.instance) throw new Error(`ViewModel für ${name} ist nicht verfügbar.`);
  if (type.includes('bool')) context.instance.boolean(name).value = Boolean(value);
  else if (type.includes('number') || type.includes('float') || type.includes('int')) context.instance.number(name).value = Number(value);
  else if (type.includes('color')) context.instance.color(name).value = (0xff000000 | Number.parseInt(String(value).slice(1), 16)) >>> 0;
  else if (type.includes('trigger')) context.instance.trigger(name).trigger();
  else if (type.includes('enum')) context.instance.enum(name).value = String(value);
  else if (type.includes('string')) context.instance.string(name).value = String(value);
  else if (type.includes('image')) {
    const image = await rive.decodeImage(await normalizePhotoPng(value));
    context.instance.image(name).value = image;
    context.assets.push(image);
  } else throw new Error(`Nicht unterstützter manifestierter Typ: ${descriptor.type ?? descriptor.kind}`);
}

function mountControls(descriptors, context) {
  const list = $('control-list');
  list.replaceChildren();
  for (const descriptor of descriptors) {
    const name = descriptor.name ?? descriptor.id;
    const type = fieldType(descriptor);
    if (!name || !type || type.includes('list')) continue;
    const label = document.createElement('label');
    label.className = 'control-field';
    label.append(document.createTextNode(descriptor.label ?? name));
    let control;
    const current = readManifestedValue(descriptor, context);
    if (type.includes('bool')) {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = Boolean(current);
      control.addEventListener('change', () => applyControl(descriptor, control.checked, context));
    } else if (type.includes('enum') && Array.isArray(descriptor.values ?? descriptor.options)) {
      control = document.createElement('select');
      control.replaceChildren(...(descriptor.values ?? descriptor.options).map((value) => { const option = optionPresentation(nativeManifest, name, value); return new Option(option.label, option.value); }));
      control.value = current ?? descriptor.default ?? '';
      control.addEventListener('change', () => applyControl(descriptor, control.value, context));
    } else if (type.includes('number') || type.includes('float') || type.includes('int')) {
      const [rangeMin, rangeMax] = descriptor.range ?? [];
      control = document.createElement('input'); Object.assign(control, { type: 'range', min: descriptor.min ?? rangeMin ?? 0, max: descriptor.max ?? rangeMax ?? 100, step: descriptor.step ?? (rangeMax - rangeMin <= 2 ? .05 : 1), value: current ?? descriptor.default ?? 0 });
      control.addEventListener('input', () => applyControl(descriptor, Number(control.value), context));
    } else if (type.includes('color')) {
      control = document.createElement('input'); control.type = 'color';
      control.value = Number.isFinite(current) ? `#${(current >>> 0).toString(16).padStart(8, '0').slice(2)}` : (descriptor.default ?? '#000000');
      control.addEventListener('input', () => applyControl(descriptor, control.value, context));
    } else if (type.includes('trigger')) {
      control = document.createElement('button'); control.type = 'button'; control.textContent = descriptor.actionLabel ?? 'Auslösen';
      control.addEventListener('click', () => applyControl(descriptor, true, context));
    } else if (type.includes('string')) {
      control = document.createElement('input'); control.type = 'text'; control.value = current ?? descriptor.default ?? '';
      control.addEventListener('change', () => applyControl(descriptor, control.value, context));
    } else if (type.includes('image')) {
      control = document.createElement('input'); control.type = 'file'; control.accept = 'image/png,image/jpeg,image/webp';
      control.addEventListener('change', () => control.files?.[0] && applyControl(descriptor, control.files[0], context));
    } else continue;
    control.setAttribute('aria-label', name); label.append(control); list.append(label);
  }
  $('native-controls').hidden = list.childElementCount === 0;
}

async function applyControl(descriptor, value, context) {
  try {
    if ((descriptor.name ?? descriptor.id) === 'preset') { applyPreset(nativeManifest, context, String(value), nativePalettes); mountControls(context.descriptors, context); }
    else await setManifestedValue(descriptor, value, context);
    $('native-status').textContent = `Person ${activeParticipant + 1} · ${descriptor.label ?? descriptor.name} gesetzt · native Laufzeit.`;
  }
  catch (error) { $('native-status').textContent = `Steuerung nicht verfügbar: ${error.message}`; }
}

function cleanupNative() {
  disposeNativeCollections(nativeSessions, roomSessions);
  $('native-canvases').replaceChildren();
}

function disposeNativeCollections(peopleSessions, roomLayerSessions) {
  for (const session of peopleSessions.splice(0)) {
    cancelRecipe(session, 'disposed');
    session.runtime.cleanup();
    for (const asset of session.assets) asset.unref?.();
    session.wrap.remove();
  }
  for (const session of roomLayerSessions.splice(0)) { session.runtime.cleanup(); session.canvas.remove(); }
}

function selectParticipant(index) {
  activeParticipant = Math.min(index, nativeSessions.length - 1);
  document.querySelectorAll('.native-canvas-wrap').forEach((node, seat) => node.classList.toggle('active', seat === activeParticipant));
  document.querySelectorAll('.participant-tabs button').forEach((button, seat) => button.setAttribute('aria-pressed', String(seat === activeParticipant)));
  const session = nativeSessions[activeParticipant];
  if (session) mountControls(session.descriptors, session);
}

function renderParticipantTabs() {
  $('participant-tabs').replaceChildren(...nativeSessions.map((session, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = String(index + 1); button.className = 'secondary';
    button.setAttribute('aria-label', `Person ${index + 1} bearbeiten`);
    button.addEventListener('click', () => selectParticipant(index));
    return button;
  }));
  const selectedSpeaker = Number($('scene-speaker').value);
  $('scene-speaker').replaceChildren(new Option('Niemand', '-1'), ...nativeSessions.map((_, index) => new Option(`Person ${index + 1}`, String(index))));
  $('scene-speaker').value = selectedSpeaker >= 0 && selectedSpeaker < nativeSessions.length ? String(selectedSpeaker) : '-1';
  selectParticipant(Math.min(activeParticipant, nativeSessions.length - 1));
}

function renderReadiness(manifest, descriptors, profile) {
  const rows = [];
  const independent = manifest.instances?.independentPerParticipant === true;
  rows.push([false, profile === 'production' && independent ? 'Front 1–3: Vertrag vorhanden · finale Sichtprüfung ausstehend.' : 'Front 1–3: Produktionsnachweis ausstehend.']);
  const hostReady = profile === 'production' && ['action', 'playAction', 'mood'].every((name) => descriptors.some((item) => (item.name ?? item.id) === name));
  rows.push([false, hostReady ? 'Phasen/Ereignisse: Host-Rezepte konfiguriert · finale Prüfung ausstehend.' : 'Phasen/Ereignisse: Host-Rezepte für diesen Build nicht verfügbar.']);
  const imageReady = descriptors.some((descriptor) => fieldType(descriptor).includes('image'));
  rows.push([false, imageReady ? 'Foto-/Bildbindung ist im Vertrag aufgeführt · Laufzeitprüfung ausstehend.' : 'Foto-/Flaggenbild: nicht im Vertrag aufgeführt.']);
  const listReady = descriptors.some((descriptor) => fieldType(descriptor).includes('list'));
  rows.push([false, listReady ? 'Listenbindung ist im Vertrag aufgeführt · Prüfung ausstehend.' : 'Listenbindung: nicht Teil dieses nativen Builds.']);
  rows.push([false, `Human Acceptance: ${manifest.humanAcceptance ?? 'pending'}.`]);
  $('contract-readiness').replaceChildren(...rows.map(([ready, text]) => {
    const row = document.createElement('span'); row.className = ready ? 'ready' : 'pending'; row.textContent = text; return row;
  }));
}

function createNativeSession(buffer, contract, seat, placement, target) {
  return new Promise((resolve, reject) => {
    const wrap = document.createElement('div'); wrap.className = 'native-canvas-wrap';
    if (placement) {
      wrap.style.left = `${placement.left / 9}%`;
      wrap.style.top = `${placement.top / 4.7}%`;
      wrap.style.width = `${placement.width / 9}%`;
      wrap.style.height = `${placement.height / 4.7}%`;
    }
    const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = 540;
    canvas.setAttribute('aria-label', `Native Rive Person ${seat + 1}`); wrap.append(canvas); target.append(wrap);
    let localRuntime;
    const options = {
      buffer: buffer.slice(0), canvas, artboard: contract.artboard, autoplay: true, autoBind: false,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoadError: () => { localRuntime?.cleanup(); wrap.remove(); reject(new Error(`Person ${seat + 1} konnte nicht geladen werden.`)); },
      onLoad: () => {
        try {
          let instance = null;
          if (contract.viewModel) {
            instance = localRuntime.viewModelByName(contract.viewModel)?.instanceByName(contract.instanceName);
            if (!instance) throw new Error(`ViewModel ${contract.viewModel}/${contract.instanceName} fehlt.`);
            localRuntime.bindViewModelInstance(instance);
          }
          localRuntime.resizeDrawingSurfaceToCanvas();
          const needsInputs = contract.descriptors.some((descriptor) => descriptor.target === 'stateMachine' || descriptor.kind === 'input');
          const inputs = contract.stateMachine && needsInputs ? localRuntime.stateMachineInputs(contract.stateMachine) ?? [] : [];
          resolve({ runtime: localRuntime, instance, inputs, assets: [], descriptors: contract.descriptors, wrap });
        } catch (error) { localRuntime.cleanup(); wrap.remove(); reject(error); }
      },
    };
    if (contract.stateMachine) options.stateMachine = contract.stateMachine;
    localRuntime = new rive.Rive(options);
  });
}

function createRoomSession(buffer, manifest, artboard, foreground, target) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = manifest.dimensions;
    canvas.className = `native-room-canvas${foreground ? ' foreground' : ''}`;
    canvas.setAttribute('aria-label', foreground ? 'Native Front Own Side' : 'Native Front Room');
    target.append(canvas);
    let localRuntime;
    localRuntime = new rive.Rive({
      buffer: buffer.slice(0), canvas, artboard, stateMachine: manifest.stateMachine, autoplay: true, autoBind: false,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoadError: () => { localRuntime?.cleanup(); canvas.remove(); reject(new Error(`${artboard} konnte nicht geladen werden.`)); },
      onLoad: () => {
        try {
          const model = localRuntime.viewModelByName(manifest.viewModel);
          const instance = model?.defaultInstance() ?? model?.instanceByName('Default');
          if (!instance) throw new Error(`${manifest.viewModel}/Default fehlt.`);
          localRuntime.bindViewModelInstance(instance);
          instance.boolean('ownSide').value = foreground && $('own-side').checked;
          localRuntime.resizeDrawingSurfaceToCanvas();
          resolve({ runtime: localRuntime, instance, foreground, canvas });
        } catch (error) { localRuntime.cleanup(); canvas.remove(); reject(error); }
      },
    });
  });
}

function applyRoomControls() {
  if (!roomSessions.length || !nativeSessions.length) return;
  const color = (hex) => (0xff000000 | Number.parseInt(hex.slice(1), 16)) >>> 0;
  const tableColor = color($('table-color').value);
  const scene = createFrontScene({ seats: nativeSessions.length, speaker: Number($('scene-speaker').value), ownSide: $('own-side').checked, tableColor, chairColor: color($('scene-chair-color').value), background: selectedBackground($('background-choices')) });
  const foreground = roomSessions.find((session) => session.foreground) ?? roomSessions[0];
  applyFrontScene({ room: foreground.instance, people: nativeSessions.map((session) => session.instance), scene });
  for (const session of roomSessions) {
    session.instance.color('tableColor').value = tableColor;
    session.instance.boolean('ownSide').value = session.foreground && $('own-side').checked;
    const background = session.instance.enum('background'); if (background) background.value = scene.background;
  }
}

async function loadNative({ allowFallback = true, resetScene = false } = {}) {
  if (resetScene) resetSceneControls($);
  const revision = ++nativeLoadRevision;
  const loadPeople = [], loadRooms = [], loadTarget = document.createDocumentFragment();
  const stale = () => revision !== nativeLoadRevision;
  const abandon = () => disposeNativeCollections(loadPeople, loadRooms);
  const guard = createGenerationGuard(revision, () => nativeLoadRevision, abandon);
  cleanupNative(); nativeManifest = null; nativePalettes = null; activeParticipant = 0;
  $('native-controls').hidden = true; $('control-list').replaceChildren(); $('contract-readiness').replaceChildren();
  $('native-message').hidden = false; $('native-message').textContent = 'Prüffall wird vorbereitet …';
  $('native-status').textContent = 'Szeneneinstellungen werden geladen; bereits geladene Animationen werden wiederverwendet.';
  const profile = $('native-profile').value;
  const mount = profile === 'production' ? './native/' : './probe/';
  try {
    const response = await fetch(`${mount}manifest.json`, { cache: 'no-store' });
    if (stale()) { abandon(); return; }
    if (!response.ok) {
      if (allowFallback && profile === 'production' && response.status === 404) {
        $('native-profile').value = 'debug';
        await loadNative({ allowFallback: false });
        return;
      }
      throw new Error(response.status === 404 ? 'Der gewählte native Build ist noch nicht bereit.' : `Manifest antwortet mit ${response.status}.`);
    }
    const manifest = await response.json();
    if (stale()) { abandon(); return; }
    const palettes = (await sourcePalettePromise)?.palettes;
    if (stale()) { abandon(); return; }
    const descriptors = controlsFrom(manifest);
    const contract = {
      artboard: contractValue(manifest, 'artboard', 'native.artboard', 'contract.artboard') ?? 'SMPerson',
      stateMachine: contractValue(manifest, 'stateMachine', 'stateMachineName', 'native.stateMachine', 'contract.stateMachine'),
      viewModel: contractValue(manifest, 'viewModel', 'viewModelName', 'native.viewModel', 'contract.viewModel'),
      instanceName: contractValue(manifest, 'instance', 'instanceName', 'defaultInstance', 'instances.default', 'native.instance', 'contract.instance') ?? 'Default',
      descriptors,
    };
    const rivPath = contractValue(manifest, 'riv', 'rivPath', 'native.riv', 'files.riv') ?? 'person.riv';
    const rivUrl = rivPath.startsWith('/') ? rivPath : `${mount}${rivPath.replace(/^\.\//, '')}`;
    const assetResponse = await sceneAssets.fetch(rivUrl);
    if (stale()) { abandon(); return; }
    if (!assetResponse.ok) throw new Error(`RIV antwortet mit ${assetResponse.status}.`);
    const buffer = await assetResponse.arrayBuffer();
    if (stale()) { abandon(); return; }
    const count = Number($('participant-count').value);
    let roomManifest = null;
    if (profile === 'production') {
      const [roomManifestResponse, roomAssetResponse] = await Promise.all([
        fetch('./native/front-room-manifest.json', { cache: 'no-store' }),
        sceneAssets.fetch('./native/front-room.riv'),
      ]);
      if (stale()) { abandon(); return; }
      if (!roomManifestResponse.ok || !roomAssetResponse.ok) throw new Error('Der native Front-Room-Build ist unvollständig.');
      roomManifest = await roomManifestResponse.json();
      if (stale()) { abandon(); return; }
      const roomBuffer = await roomAssetResponse.arrayBuffer();
      if (stale()) { abandon(); return; }
      if (!await guard.retain(createRoomSession(roomBuffer, roomManifest, roomManifest.artboards[0], false, loadTarget), loadRooms)) return;
    }
    for (let seat = 0; seat < count; seat += 1) {
      const center = roomManifest?.seatCenters?.[String(count)]?.[seat];
      const placement = center == null ? null : { left: center - roomManifest.personSize[0] / 2, top: roomManifest.personTop, width: roomManifest.personSize[0], height: roomManifest.personSize[1] };
      if (!await guard.retain(createNativeSession(buffer, contract, seat, placement, loadTarget), loadPeople)) return;
    }
    if (roomManifest) {
      const roomResponse = await sceneAssets.fetch('./native/front-room.riv');
      if (stale()) { abandon(); return; }
      const roomBuffer = await roomResponse.arrayBuffer();
      if (stale()) { abandon(); return; }
      if (!await guard.retain(createRoomSession(roomBuffer, roomManifest, roomManifest.artboards[1], true, loadTarget), loadRooms)) return;
      const initial = loadRooms[0].instance.color('tableColor')?.value;
      if (Number.isFinite(initial)) $('table-color').value = `#${(initial >>> 0).toString(16).padStart(8, '0').slice(2)}`;
    }
    if (stale()) { abandon(); return; }
    nativeSessions = loadPeople; roomSessions = loadRooms;
    const canvasHost = $('native-canvases'); canvasHost.replaceChildren(loadTarget);
    canvasHost.dataset.profile = profile; canvasHost.style.setProperty('--seats', count);
    [...nativeSessions, ...roomSessions].forEach((session) => session.runtime.resizeDrawingSurfaceToCanvas());
    $('room-controls').hidden = !roomManifest;
    if (roomManifest) mountBackgroundChoices($('background-choices'), roomManifest.backgrounds, selectedBackground($('background-choices')), applyRoomControls);
    if (roomManifest) applyRoomControls();
    nativeManifest = manifest; nativePalettes = palettes;
    $('host-recipes').hidden = profile !== 'production';
    renderParticipantTabs(); renderReadiness(manifest, descriptors, profile);
    $('native-message').hidden = true;
    $('native-status').textContent = `Bereit · ${count} ${count === 1 ? 'Person' : 'Personen'} · Web-Vorschau.`;
  } catch (error) {
    abandon();
    if (stale()) return;
    cleanupNative();
    $('native-message').hidden = false; $('native-message').textContent = 'Szene konnte nicht geladen werden';
    $('native-status').textContent = error.message;
  }
}

function renderAcceptanceCases() {
  $('acceptance-cases').replaceChildren(...acceptanceCases.map(([id, label, description]) => {
    const row = document.createElement('article'); row.className = `acceptance-case ${review[id]?.status ?? 'open'}`;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.textContent = label;
    button.addEventListener('click', () => startAcceptanceCase(id));
    const hint = document.createElement('p'); hint.textContent = description;
    const result = document.createElement('select'); result.setAttribute('aria-label', `Ergebnis ${label}`);
    result.replaceChildren(new Option('Offen', 'open'), new Option('Bestanden', 'passed'), new Option('Fehlgeschlagen', 'failed'));
    result.value = review[id]?.status ?? 'open';
    const notes = document.createElement('textarea'); notes.setAttribute('aria-label', `Notizen ${label}`);
    notes.placeholder = 'Sichtbare Beobachtung oder Abweichung …'; notes.value = review[id]?.notes ?? '';
    const persist = () => { review[id] = { status: result.value, notes: notes.value }; row.className = `acceptance-case ${result.value}`; saveReview(); };
    result.addEventListener('change', persist); notes.addEventListener('input', persist);
    row.append(button, hint, result, notes); return row;
  }));
  const legacy = legacyCases.flatMap(([id, title]) => review[id]?.notes ? [[title, review[id].notes]] : []);
  $('legacy-review').hidden = legacy.length === 0;
  $('legacy-notes').replaceChildren(...legacy.map(([title, notes]) => { const p = document.createElement('p'); p.textContent = `${title}: ${notes}`; return p; }));
  $('hide-passed').checked = Boolean(review.preferences?.hidePassed);
  $('acceptance-cases').classList.toggle('hide-passed', $('hide-passed').checked);
  saveReview();
}

async function startAcceptanceCase(id) {
  const run = acceptanceRuns.begin(), controller = run.controller;
  try {
    await runAcceptanceCase(id, {
      rive, signal: controller.signal, manifest: () => nativeManifest,
      ensureSeats: async (seats) => { $('native-profile').value = 'production'; $('participant-count').value = String(seats); await loadNative({ allowFallback: false, resetScene: true }); if (!nativeSessions.length) throw new Error('Native Personen konnten nicht geladen werden.'); },
      sessions: () => nativeSessions,
      report: (message) => { $('acceptance-status').textContent = message; },
      configureRoom: (color, ownSide) => { $('table-color').value = color; $('own-side').checked = ownSide; applyRoomControls(); },
      applyPreset: (session, preset) => applyPreset(nativeManifest, session, preset, nativePalettes),
      refresh: () => renderParticipantTabs(),
    });
  } catch (error) {
    if (error.name !== 'AbortError') $('acceptance-status').textContent = `Startfall nicht verfügbar: ${error.message}`;
  } finally {
    run.finish();
  }
}

function cancelAcceptance() { acceptanceRuns.cancel(); }
document.querySelectorAll('.view-tabs button').forEach((button) => button.addEventListener('click', () => { selectedView = button.dataset.view; renderSource(); }));
$('native-profile').addEventListener('change', () => { cancelAcceptance(); loadNative({ allowFallback: false }); });
$('participant-count').addEventListener('change', () => { cancelAcceptance(); loadNative({ allowFallback: false }); });
$('reload-native').addEventListener('click', () => { cancelAcceptance(); sceneAssets.clear(); loadNative({ allowFallback: false }); });
$('reset-native').addEventListener('click', () => { cancelAcceptance(); loadNative({ allowFallback: false, resetScene: true }); });
$('table-color').addEventListener('input', applyRoomControls);
$('scene-chair-color').addEventListener('input', applyRoomControls);
$('scene-speaker').addEventListener('change', applyRoomControls);
$('own-side').addEventListener('change', applyRoomControls);
$('apply-phase').addEventListener('click', () => runHostRecipe('phase'));
$('dispatch-event').addEventListener('click', () => runHostRecipe('event'));
$('run-data-probe').addEventListener('click', async () => { dataProbeSession = await runDataProbe(rive, $('data-probe-status'), $('data-probe-canvas'), dataProbeSession); });
$('hide-passed').addEventListener('change', () => { review.preferences = { ...review.preferences, hidePassed: $('hide-passed').checked }; $('acceptance-cases').classList.toggle('hide-passed', $('hide-passed').checked); saveReview(); });
$('export-review').addEventListener('click', exportReview);
window.addEventListener('resize', () => nativeSessions.forEach((session) => session.runtime.resizeDrawingSurfaceToCanvas()));
window.addEventListener('pagehide', (event) => { if (!event.persisted) { cleanupNative(); dataProbeSession?.runtime.cleanup(); dataProbeSession?.image.unref?.(); } });
rive.RuntimeLoader.setWasmUrl('./vendor/rive.wasm');
$('phase-select').replaceChildren(...Object.keys(phaseRecipes).map((value) => new Option(value, value)));
$('event-select').replaceChildren(...Object.keys(eventRecipes).map((value) => new Option(value, value)));
renderReferences(); renderSource(); renderAcceptanceCases(); loadNative();
