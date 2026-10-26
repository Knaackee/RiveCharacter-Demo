const fieldMap = Object.freeze({
  id: 'preset', type: 'type', skin: 'skin', hairc: 'hairColor', cloth: 'cloth', headc: 'headColor', pin: 'country',
});

const colorValue = (value) => (0xff000000 | Number.parseInt(String(value).replace('#', ''), 16)) >>> 0;

export function presetValues(manifest, presetId, palettes) {
  const preset = manifest.presets?.find((item) => item.id === presetId);
  if (!preset) throw new RangeError(`Preset ${presetId} fehlt im Manifest.`);
  const values = {};
  for (const [source, value] of Object.entries(preset)) {
    const target = fieldMap[source] ?? source;
    if (['instance', 'instanceName', 'photo'].includes(source)) continue;
    values[target] = value;
  }
  values.skin = palettes?.skin?.[preset.skin];
  values.hairColor = palettes?.hair?.[preset.hairc];
  values.head = preset.head || 'none';
  values.country = preset.pin || 'none';
  if (!values.skin || !values.hairColor) throw new Error(`Farbpaletten für ${presetId} fehlen.`);
  return values;
}

export function applyPreset(manifest, session, presetId, palettes) {
  const values = presetValues(manifest, presetId, palettes);
  const descriptors = new Map(session.descriptors.map((item) => [item.name ?? item.id, item]));
  for (const [name, value] of Object.entries(values)) {
    const type = String(descriptors.get(name)?.type ?? '').toLowerCase();
    if (type.includes('bool')) session.instance.boolean(name).value = Boolean(value);
    else if (type.includes('number')) session.instance.number(name).value = Number(value);
    else if (type.includes('color')) session.instance.color(name).value = colorValue(value);
    else if (type.includes('enum')) session.instance.enum(name).value = String(value);
    else if (type.includes('string')) session.instance.string(name).value = String(value);
  }
  return values;
}
