export const DEFAULT_BACKGROUND = 'meeting';

export function backgroundChoiceModels(backgrounds = []) {
  return backgrounds.map((item) => ({
    id: String(item.id),
    label: item.label ?? String(item.id),
    preview: item.preview ?? `./backgrounds/${item.id}.svg`,
  }));
}

export function selectedBackground(container) {
  return container.dataset.background || DEFAULT_BACKGROUND;
}

export function selectBackground(container, id) {
  container.dataset.background = id;
  for (const button of container.querySelectorAll('button[data-background]')) {
    button.setAttribute('aria-pressed', String(button.dataset.background === id));
  }
}

export function mountBackgroundChoices(container, backgrounds, selected, onSelect) {
  const choices = backgroundChoiceModels(backgrounds);
  container.hidden = choices.length === 0;
  container.replaceChildren(...choices.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'background-choice secondary'; button.dataset.background = choice.id;
    const image = document.createElement('img'); image.src = choice.preview; image.alt = '';
    const label = document.createElement('span'); label.textContent = choice.label;
    button.append(image, label);
    button.addEventListener('click', () => { selectBackground(container, choice.id); onSelect(choice.id); });
    return button;
  }));
  const available = choices.some((choice) => choice.id === selected) ? selected : choices.find((choice) => choice.id === DEFAULT_BACKGROUND)?.id ?? choices[0]?.id;
  if (available) selectBackground(container, available);
}
