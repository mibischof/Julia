// Texterkennung mit Tesseract.js, komplett auf dem Gerät. Die Dateien (ca. 5 MB)
// werden erst beim ersten Foto geladen und danach vom Service Worker gecacht.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

import { binarize, grayscale, isDark } from './photo.js';
import { parseTimetable } from './timetable-parse.js';

async function startWorker(onStep) {
  const { default: Tesseract } = await import(`${BASE}tesseract.esm.min.js`);
  return Tesseract.createWorker('deu', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: `${BASE}tesseract-core-simd-lstm.wasm.js`,
    langPath: `${BASE}lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m) => onStep?.(m.status, m.progress || 0),
  });
}

async function readWords(worker, image, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
  const words = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const w of line.words || []) {
          words.push({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
        }
      }
    }
  }
  return words;
}

/** Erkennt Wörter mit Position: [{ text, conf, x0, y0, x1, y1 }] */
export async function recognizeWords(image, { psm = '11' } = {}) {
  const worker = await startWorker();
  try {
    return await readWords(worker, image, psm);
  } finally {
    await worker.terminate();
  }
}

const quality = (r) => r.lessons.reduce((s, l) => s + l.confidence, 0);

/**
 * Liest einen Stundenplan aus einem Bild (Canvas).
 * Fotos werden zuerst schwarz-weiß aufbereitet, Screenshots zuerst nur in
 * Graustufen (farbige Kästchen mit weißer Schrift). Dunkle Bilder werden
 * invertiert. Ist das Ergebnis schwach, folgt ein zweiter Durchgang mit der
 * anderen Aufbereitung; das bessere Ergebnis gewinnt.
 * onProgress(anteil 0–1, text)
 */
export async function recognizeTimetable(source, { screenshot = false, knownSubjects = [], onProgress } = {}) {
  const dark = isDark(source);
  const variants = screenshot ? [() => grayscale(source, dark), () => binarize(source, dark)] : [() => binarize(source, dark), () => grayscale(source, dark)];
  let pass = 0;
  const steps = {
    'loading tesseract core': [0, 0.3, 'Texterkennung wird geladen'],
    'loading language traineddata': [0.3, 0.45, 'Sprachdaten werden geladen'],
    'initializing api': [0.45, 0.5, 'Wird vorbereitet'],
  };
  const worker = await startWorker((status, progress) => {
    if (!onProgress) return;
    if (steps[status]) {
      const [a, b, text] = steps[status];
      onProgress(a + (b - a) * progress, text);
    } else if (status === 'recognizing text') {
      onProgress(pass === 0 ? 0.5 + 0.4 * progress : 0.9 + 0.1 * progress, pass === 0 ? 'Text wird erkannt' : 'Zweiter Durchgang');
    }
  });
  try {
    let best = null;
    for (pass = 0; pass < variants.length; pass++) {
      const result = parseTimetable(await readWords(worker, variants[pass](), '11'), { knownSubjects });
      if (!best || quality(result) > quality(best)) best = result;
      const avg = best.lessons.length ? quality(best) / best.lessons.length : 0;
      if (best.lessons.length >= 6 && avg >= 0.8) break;
    }
    return best;
  } finally {
    await worker.terminate();
  }
}
