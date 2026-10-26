export const PHOTO_SIZE = 80;

export function coverCrop(width, height, size = PHOTO_SIZE) {
  if (![width, height, size].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError('Bildmaße müssen positiv sein.');
  const side = Math.min(width, height);
  return { sourceX: (width - side) / 2, sourceY: (height - side) / 2, sourceSize: side, targetSize: size };
}

function encodePng(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) reject(new Error('Das normalisierte Foto konnte nicht als PNG kodiert werden.'));
    else resolve(blob);
  }, 'image/png'));
}

/** Center-crop a host image and encode the native photo contract's exact 80×80 PNG input. */
export async function normalizePhotoPng(source, { decode = createImageBitmap, createCanvas = () => document.createElement('canvas') } = {}) {
  const bitmap = await decode(source);
  try {
    const crop = coverCrop(bitmap.width, bitmap.height);
    const canvas = createCanvas();
    canvas.width = PHOTO_SIZE; canvas.height = PHOTO_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D-Canvas für die Fotonormalisierung fehlt.');
    context.drawImage(bitmap, crop.sourceX, crop.sourceY, crop.sourceSize, crop.sourceSize, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    return new Uint8Array(await (await encodePng(canvas)).arrayBuffer());
  } finally { bitmap.close?.(); }
}
