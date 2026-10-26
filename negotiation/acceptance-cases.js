import { normalizePhotoPng } from './image-normalizer.js';

export const acceptanceCases = [
  ['default-seat', '1 · Standard, ein Platz', 'Ausgangszustand einer nativen Person.'],
  ['three-presets', '2 · Drei unabhängige Presets', 'Drei getrennte Personeninstanzen und Namen.'],
  ['extreme-build', '3 · Extrembau + Fragehand', 'Maximale Statur mit laufender ask-Aktion.'],
  ['appearance', '4 · Haare, Kopfbedeckung, Brille/Bart', 'Drei kontrastierende Erscheinungsbilder.'],
  ['photo-flag-talk', '5 · Foto, Flagge + Sprechen', 'Foto-Bindung, Länderflagge und talk-Aktion.'],
  ['break-sequence', '6 · Kaffee → Telefon → Neutral', 'Automatische Folge bis zum Neutralzustand.'],
  ['write-sign-reset', '7 · Notiz → Unterschrift → Reset', 'Schreiben, unterschreiben und zurücksetzen.'],
  ['nod-shake', '8 · Nicken/Schütteln wiederholen', 'Wiederholte Zustimmung und Ablehnung.'],
  ['reduced-motion', '9 · Reduced Motion während Aktion', 'Reduced Motion wird während push aktiviert.'],
  ['room-details', '10 · Eigene Seite, Namen, Farben, Tischflaggen', 'Raum- und Personenattribute gemeinsam prüfen.'],
];

const rgba = (hex) => (0xff000000 | Number.parseInt(hex.slice(1), 16)) >>> 0;
const actionDuration = (manifest, id) => {
  const seconds = Number(manifest.actions?.find((action) => action.id === id)?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Manifestdauer für ${id} fehlt.`);
  return seconds * 1000;
};
const wait = (delay, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, delay);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Abgebrochen', 'AbortError')); }, { once: true });
});

function set(session, name, value) {
  const instance = session.instance;
  const aliases = { head: 'headwear', cloth: 'clothColor' };
  const setters = {
    boolean: () => { instance.boolean(name).value = value; },
    number: () => { instance.number(name).value = value; },
    color: () => { instance.color(name).value = rgba(value); },
    enumcustom: () => { instance.enum(name).value = value; },
    string: () => { instance.string(name).value = value; },
  };
  const descriptor = session.descriptors.find((item) => (item.name ?? item.id) === name)
    ?? session.descriptors.find((item) => (item.name ?? item.id) === aliases[name]);
  if (descriptor) name = descriptor.name ?? descriptor.id;
  const setter = setters[String(descriptor?.type ?? '').toLowerCase()];
  if (!setter) throw new Error(`${name} ist in diesem Build nicht konfigurierbar.`);
  setter();
}

function configure(session, values) {
  for (const [name, value] of Object.entries(values)) set(session, name, value);
}

function trigger(session, action) {
  session.instance.enum('action').value = action;
  session.instance.trigger('playAction').trigger();
}

async function sequence(session, actions, context) {
  for (const action of actions) {
    if (context.signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    trigger(session, action);
    context.report(`${action} läuft`);
    await wait(actionDuration(context.manifest(), action), context.signal);
  }
  trigger(session, 'none');
}

async function bindPhoto(session, context) {
  const response = await fetch('./photo-review.png', { cache: 'no-store' });
  if (!response.ok) throw new Error('Prüffoto fehlt.');
  const image = await context.rive.decodeImage(await normalizePhotoPng(await response.blob()));
  session.instance.image('photo').value = image;
  session.assets.push(image);
}

export async function runAcceptanceCase(id, context) {
  const seats = ['three-presets', 'appearance', 'room-details'].includes(id) ? 3 : id === 'photo-flag-talk' ? 2 : 1;
  await context.ensureSeats(seats);
  if (context.signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
  const [a, b, c] = context.sessions();
  context.report('Konfiguration wird angewendet …');
  if (id === 'three-presets') {
    context.applyPreset(a, 'person01'); context.applyPreset(b, 'person02'); context.applyPreset(c, 'person03');
  } else if (id === 'extreme-build') {
    configure(a, { build: 1.12, mood: 'surprised' }); trigger(a, 'ask');
  } else if (id === 'appearance') {
    configure(a, { hair: 'long', outfit: 'suit', glasses: true }); configure(b, { hair: 'bald', head: 'turban', beard: true }); configure(c, { hair: 'bun', head: 'headset', outfit: 'knit' });
  } else if (id === 'photo-flag-talk') {
    await bindPhoto(a, context); configure(a, { display: 'photo', speaker: true }); configure(b, { display: 'flag', country: 'jp', tableFlags: true }); trigger(a, 'talk'); trigger(b, 'talk');
  } else if (id === 'break-sequence') await sequence(a, ['coffee', 'phone'], context);
  else if (id === 'write-sign-reset') await sequence(a, ['note', 'sign'], context);
  else if (id === 'nod-shake') await sequence(a, ['nod', 'nod', 'shake', 'shake'], context);
  else if (id === 'reduced-motion') {
    configure(a, { reducedMotion: false }); trigger(a, 'push'); context.report('push läuft normal …');
    await wait(500, context.signal); configure(a, { reducedMotion: true }); context.report('Reduced Motion während push aktiviert …');
    await wait(Math.max(0, actionDuration(context.manifest(), 'push') - 500), context.signal); trigger(a, 'none');
  }
  else if (id === 'room-details') {
    configure(a, { name: 'Einkauf', cloth: '#284d6f', tableFlags: true, country: 'de' }); configure(b, { name: 'Lieferant', cloth: '#813f36', tableFlags: true, country: 'fr' }); configure(c, { name: 'Moderation', cloth: '#45634c', tableFlags: true, country: 'jp' }); context.configureRoom('#927052', true);
  }
  context.refresh();
  context.report('Startfall angewendet · Ergebnis bleibt bis zur Sichtprüfung offen.');
}
