const FRONT_SEATS = Object.freeze({
  1: Object.freeze([450]),
  2: Object.freeze([300, 600]),
  3: Object.freeze([200, 450, 700]),
});
export const FRONT_BACKGROUNDS = Object.freeze(['meeting', 'skyline', 'modern', 'boardroom', 'situation', 'bunker']);

export function frontSeats(count) {
  const seats = FRONT_SEATS[count];
  if (!seats) throw new RangeError('front layout supports 1, 2 or 3 seats');
  return [...seats];
}

export function createFrontScene({ seats = 1, speaker = -1, ownSide = false, reducedMotion = null, tableColor = null, chairColor = null, background = 'meeting' } = {}) {
  const centers = frontSeats(seats);
  if (!Number.isInteger(speaker) || speaker < -1 || speaker >= seats) {
    throw new RangeError('speaker must be -1 or a front seat index');
  }
  if (!FRONT_BACKGROUNDS.includes(background)) throw new RangeError('unknown front background');
  return Object.freeze({ layout: 'front', seats, seatCenters: centers, speaker, ownSide: Boolean(ownSide), reducedMotion: reducedMotion == null ? null : Boolean(reducedMotion), tableColor, chairColor, background });
}

function write(instance, kind, name, value) {
  const property = instance?.[kind]?.(name);
  if (property) property.value = value;
}

export function applyFrontScene({ room, people, scene }) {
  if (!room || !Array.isArray(people)) throw new TypeError('room and people are required');
  if (people.length !== scene.seats) throw new RangeError('people count must match scene seats');
  write(room, 'boolean', 'ownSide', scene.ownSide);
  write(room, 'enum', 'background', scene.background);
  if (scene.reducedMotion != null) write(room, 'boolean', 'reducedMotion', scene.reducedMotion);
  if (scene.tableColor != null) write(room, 'color', 'tableColor', scene.tableColor);
  people.forEach((person, index) => {
    write(person, 'boolean', 'speaker', scene.speaker === index);
    if (scene.reducedMotion != null) write(person, 'boolean', 'reducedMotion', scene.reducedMotion);
    if (scene.chairColor != null) write(person, 'color', 'chairColor', scene.chairColor);
  });
  return scene;
}

