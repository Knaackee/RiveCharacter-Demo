export function optionPresentation(manifest, field, option) {
  const value = String(option?.value ?? option);
  const suppliedLabel = option?.label;
  if (field === 'preset') {
    const preset = manifest?.presets?.find((item) => item.id === value);
    return { value, label: preset?.name ? `${preset.name} (${value})` : suppliedLabel ?? value };
  }
  if (field === 'action') {
    const action = manifest?.actions?.find((item) => item.id === value);
    const label = action?.label ?? action?.name ?? suppliedLabel ?? value;
    return { value, label: label === value ? value : `${label} (${value})` };
  }
  return { value, label: suppliedLabel ?? value };
}
