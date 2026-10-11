// Fotos verkleinern und für die Texterkennung aufbereiten. Alles passiert im
// Browser, das Foto verlässt das Gerät nicht.

export async function fileToBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // Drehung aus den Kameradaten (EXIF) wird dabei berücksichtigt
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // ältere Safari-Versionen: unten über <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bild auf höchstens `maxSide` Pixel (längste Seite) verkleinern. */
export function scaled(source, maxSide) {
  const w = source.width;
  const h = source.height;
  const f = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * f);
  canvas.height = Math.round(h * f);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function toJpeg(canvas, quality = 0.72) {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Graustufen und adaptive Schwelle (Bradley): gleicht Schatten und
 * ungleichmäßiges Licht auf Handyfotos aus. Liefert ein Schwarz-Weiß-Bild.
 */
export function binarize(canvas) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];

  // Integralbild für schnelle Mittelwerte
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const s = Math.max(15, Math.round(Math.max(w, h) / 24));
  const half = s >> 1;
  const t = 0.16;
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const count = (x1 - x0) * (y1 - y0);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const v = gray[y * w + x] * count < sum * (1 - t) ? 0 : 255;
      const k = (y * w + x) * 4;
      out.data[k] = out.data[k + 1] = out.data[k + 2] = v;
      out.data[k + 3] = 255;
    }
  }
  const result = document.createElement('canvas');
  result.width = w;
  result.height = h;
  result.getContext('2d').putImageData(out, 0, 0);
  return result;
}
