// Texterkennung mit Tesseract.js, komplett auf dem Gerät. Die Dateien (ca. 5 MB)
// werden erst beim ersten Foto geladen und danach vom Service Worker gecacht.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

/**
 * Erkennt Wörter mit Position.
 * onProgress(anteil 0–1, text) für die Fortschrittsanzeige.
 * @returns [{ text, conf, x0, y0, x1, y1 }]
 */
export async function recognizeWords(image, { onProgress, psm = '11' } = {}) {
  const { default: Tesseract } = await import(`${BASE}tesseract.esm.min.js`);
  const steps = {
    'loading tesseract core': [0, 0.3, 'Texterkennung wird geladen'],
    'loading language traineddata': [0.3, 0.45, 'Sprachdaten werden geladen'],
    'initializing api': [0.45, 0.5, 'Wird vorbereitet'],
    'recognizing text': [0.5, 1, 'Text wird erkannt'],
  };
  const worker = await Tesseract.createWorker('deu', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: `${BASE}tesseract-core-simd-lstm.wasm.js`,
    langPath: `${BASE}lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m) => {
      const step = steps[m.status];
      if (step && onProgress) onProgress(step[0] + (step[1] - step[0]) * (m.progress || 0), step[2]);
    },
  });
  try {
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
  } finally {
    await worker.terminate();
  }
}
