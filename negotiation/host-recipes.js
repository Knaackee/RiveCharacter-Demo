export const eventRecipes = Object.freeze({
  offerMade: 'push',
  counterOffer: 'point',
  questionAsked: 'ask',
  noteTaken: 'note',
  agreement: 'handshake',
  breakRequested: 'coffee',
  walkout: 'stand',
  signed: 'sign',
});

export const phaseRecipes = Object.freeze({
  'Begrüßung': { action: 'talk', mood: 'friendly' },
  'Positionen': { action: 'point', mood: 'neutral' },
  'Angebot': { action: 'push', mood: 'content' },
  'Gegenangebot': { action: 'point', mood: 'thoughtful' },
  'Einwand': { action: 'ask', mood: 'tense' },
  'Pause': { action: 'coffee', mood: 'thoughtful' },
  'Einigung': { action: 'handshake', mood: 'content' },
  'Abbruch': { action: 'stand', mood: 'tense' },
});

function durationFor(manifest, action) {
  const descriptor = manifest.actions?.find((item) => item.id === action);
  const duration = Number(descriptor?.duration);
  if (!descriptor || !Number.isFinite(duration) || duration <= 0) throw new Error(`Keine gültige Manifestdauer für ${action}.`);
  return duration;
}

const pending = new WeakMap();
const browserScheduler = { set: (callback, delay) => setTimeout(callback, delay), clear: (timer) => clearTimeout(timer) };

export function cancelRecipe(session, reason = 'cancelled') {
  const current = session && pending.get(session);
  if (!current) return false;
  current.scheduler.clear(current.timer);
  pending.delete(session);
  current.emit({ phase: 'cancelled', action: current.action, source: current.source, duration: current.duration, reason });
  return true;
}

function play(session, manifest, action, emit, source, scheduler = browserScheduler) {
  if (!session?.instance) throw new Error('Keine aktive native Person.');
  const actionField = session.instance.enum('action');
  const trigger = session.instance.trigger('playAction');
  if (!actionField || !trigger) throw new Error('action/playAction fehlt im nativen Vertrag.');
  const duration = durationFor(manifest, action);
  cancelRecipe(session, 'replaced');
  actionField.value = action;
  trigger.trigger();
  emit({ phase: 'start', action, source, duration });
  const record = { action, duration, source, emit, scheduler, timer: null };
  record.timer = scheduler.set(() => {
    if (pending.get(session) !== record) return;
    pending.delete(session);
    emit({ phase: 'scheduledEnd', action, source, duration });
  }, duration * 1000);
  pending.set(session, record);
  return { action, duration };
}

export function dispatchEvent({ event, session, manifest, emit, scheduler }) {
  const action = eventRecipes[event];
  if (!action) throw new Error(`Kein Host-Rezept für ${event}.`);
  return play(session, manifest, action, emit, { type: 'event', id: event }, scheduler);
}

export function applyPhase({ phase, session, manifest, emit, scheduler }) {
  const recipe = phaseRecipes[phase];
  if (!recipe) throw new Error(`Kein Host-Rezept für ${phase}.`);
  const mood = session?.instance?.enum('mood');
  if (!mood) throw new Error('mood fehlt im nativen Vertrag.');
  mood.value = recipe.mood;
  return play(session, manifest, recipe.action, emit, { type: 'phase', id: phase, mood: recipe.mood }, scheduler);
}

