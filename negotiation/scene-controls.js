import { DEFAULT_BACKGROUND, selectBackground } from './background-controls.js';

export const FRONT_SCENE_DEFAULTS = Object.freeze({
  tableColor: '#d7cab4',
  chairColor: '#b1b4ba',
  speaker: '-1',
  ownSide: false,
  background: DEFAULT_BACKGROUND,
});

export function resetSceneControls(getControl, defaults = FRONT_SCENE_DEFAULTS) {
  getControl('table-color').value = defaults.tableColor;
  getControl('scene-chair-color').value = defaults.chairColor;
  getControl('scene-speaker').value = String(defaults.speaker);
  getControl('own-side').checked = Boolean(defaults.ownSide);
  selectBackground(getControl('background-choices'), defaults.background);
  return defaults;
}
