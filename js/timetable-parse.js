// Macht aus den Wörtern der Texterkennung (mit Position) einen Stundenplan.
// Spalten kommen von den Wochentagen ("Mo", "Dienstag" …), Zeilen von den
// Stundennummern ("1.", "2") oder Uhrzeiten am linken Rand. Fächer werden
// unscharf mit bekannten Namen und Kürzeln abgeglichen, damit auch
// halb lesbare Handschrift noch zum richtigen Fach führt.

export const SUBJECTS = [
  { name: 'Deutsch', aliases: ['d', 'deu', 'deutsch', 'dt'] },
  { name: 'Mathematik', aliases: ['m', 'ma', 'mathe', 'mathematik', 'rechnen'] },
  { name: 'Sachunterricht', aliases: ['su', 'sachu', 'sachunterricht', 'sach'] },
  { name: 'Englisch', aliases: ['e', 'en', 'engl', 'englisch'] },
  { name: 'Bewegung und Sport', aliases: ['bsp', 'bus', 'turnen', 'sport', 'bewegung', 'bewegung und sport', 'leibesübungen'] },
  { name: 'Musik', aliases: ['me', 'mu', 'musik', 'musikerziehung', 'singen'] },
  { name: 'Kunst und Gestaltung', aliases: ['be', 'kg', 'kug', 'kunst', 'zeichnen', 'kunst und gestaltung', 'bildnerische erziehung'] },
  { name: 'Technik und Design', aliases: ['we', 'tw', 'teg', 'td', 'werken', 'technik', 'technik und design', 'textiles werken'] },
  { name: 'Religion', aliases: ['r', 'rel', 'reli', 'rk', 'religion'] },
  { name: 'Ethik', aliases: ['eth', 'ethik'] },
  { name: 'Lesen', aliases: ['les', 'lesen'] },
  { name: 'Schreiben', aliases: ['schreiben', 'schr'] },
  { name: 'Förderunterricht', aliases: ['fö', 'förder', 'förderunterricht', 'fu'] },
  { name: 'Nachmittagsbetreuung', aliases: ['nmb', 'gts', 'betreuung', 'nachmittagsbetreuung', 'hort'] },
  { name: 'Biologie', aliases: ['bio', 'biologie', 'bu'] },
  { name: 'Geografie', aliases: ['geo', 'gw', 'geografie', 'geographie'] },
  { name: 'Geschichte', aliases: ['gsk', 'ges', 'gesch', 'geschichte'] },
  { name: 'Physik', aliases: ['ph', 'phy', 'physik'] },
  { name: 'Chemie', aliases: ['ch', 'chemie'] },
  { name: 'Informatik', aliases: ['inf', 'info', 'informatik', 'dgb', 'digitale grundbildung'] },
];

const DAYS = [
  ['mo', 'montag'],
  ['di', 'dienstag'],
  ['mi', 'mittwoch'],
  ['do', 'donnerstag'],
  ['fr', 'freitag'],
];

/** Kleinbuchstaben, typische Verwechslungen der Texterkennung ausgleichen. */
export function normalizeToken(text) {
  return text
    .toLowerCase()
    .replace(/[|!]/g, 'l')
    .replace(/0/g, 'o')
    .replace(/(?<=[a-zäöüß])1|1(?=[a-zäöüß])/g, 'l')
    .replace(/[^a-zäöüß ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function similarity(a, b) {
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * Bestes Fach zu einem erkannten Text, oder null.
 * Kürzel (bis 3 Buchstaben) müssen genau passen, längere Wörter dürfen abweichen.
 */
export function matchSubject(text, extra = []) {
  const norm = normalizeToken(text);
  if (!norm) return null;
  const candidates = [norm, ...norm.split(' ').filter((w) => w.length >= 4)];
  let best = null;
  const lists = [...SUBJECTS, ...extra.map((name) => ({ name, aliases: [name.toLowerCase()] }))];
  for (const s of lists) {
    for (const alias of s.aliases) {
      for (const c of candidates) {
        let score = 0;
        if (alias.length <= 3) {
          score = c === alias ? 1 : 0;
        } else if (c.length >= 3) {
          score = similarity(c, alias);
          // Abgeschnittener Anfang eines langen Namens ("Sachunt")
          if (c.length >= 4 && alias.startsWith(c)) score = Math.max(score, 0.8);
        }
        if (score >= 0.66 && (!best || score > best.score)) best = { name: s.name, score };
      }
    }
  }
  return best;
}

function dayOf(text) {
  const norm = normalizeToken(text).replace(/ /g, '');
  if (!norm) return 0;
  for (let i = 0; i < DAYS.length; i++) {
    const [short, long] = DAYS[i];
    if (norm === short || norm === long) return i + 1;
    if (norm.length >= 5 && similarity(norm, long) >= 0.7) return i + 1;
  }
  return 0;
}

const TIME_RE = /(\d{1,2})[.:,](\d{2})/g;

function timesIn(text) {
  const out = [];
  for (const m of text.matchAll(TIME_RE)) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 6 && h <= 19 && min < 60) out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return out;
}

function periodNumberOf(text) {
  const m = text.trim().match(/^(\d{1,2})[.,:)]?$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : 0;
}

const center = (w) => ({ x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2 });
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Gerade y = a + b·x durch die Punkte (kleinste Quadrate). */
function fitLine(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  const b = den ? num / den : 0;
  return { a: my - b * mx, b };
}

/** Zeilen nach y gruppieren (Wörter mit ähnlicher Höhe gehören zusammen). */
function clusterRows(items, tolerance) {
  const sorted = [...items].sort((a, b) => a.c.y - b.c.y);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && it.c.y - last.y <= tolerance) {
      last.items.push(it);
      last.y = last.items.reduce((s, x) => s + x.c.y, 0) / last.items.length;
    } else {
      rows.push({ y: it.c.y, items: [it] });
    }
  }
  return rows;
}

/**
 * @param words  [{ text, conf, x0, y0, x1, y1 }] aus der Texterkennung
 * @param opts   { knownSubjects: [] } zusätzliche Fächer, die schon im Plan stehen
 * @returns { lessons: [{ weekday, period, subject, confidence, raw }], periods, info }
 */
export function parseTimetable(words, { knownSubjects = [] } = {}) {
  const items = words
    .filter((w) => w.text && w.text.trim())
    .map((w) => ({ ...w, text: w.text.trim(), c: center(w), h: w.y1 - w.y0 }));
  const info = { days: 0, rows: 0, method: '' };
  if (!items.length) return { lessons: [], periods: null, info };
  const wordHeight = median(items.map((i) => i.h)) || 20;

  // 1) Wochentage als Spaltenköpfe
  const dayCandidates = items.map((it) => ({ it, day: dayOf(it.text) })).filter((d) => d.day);
  const headerY = median(dayCandidates.map((d) => d.it.c.y));
  const headers = new Map();
  for (const d of dayCandidates) {
    const cur = headers.get(d.day);
    if (!cur || Math.abs(d.it.c.y - headerY) < Math.abs(cur.c.y - headerY)) headers.set(d.day, d.it);
  }
  for (const [day, it] of headers) {
    if (Math.abs(it.c.y - headerY) > wordHeight * 3) headers.delete(day);
  }
  info.days = headers.size;
  const headerSet = new Set(headers.values());

  // Schräg fotografiert? Neigung aus der Wochentag-Zeile herausrechnen.
  if (headers.size >= 3) {
    const tilt = fitLine([...headers.values()].map((it) => [it.c.x, it.c.y])).b;
    const angle = Math.atan(tilt);
    if (Math.abs(angle) > 0.003 && Math.abs(angle) < 0.35) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const it of items) it.c = { x: it.c.x * cos + it.c.y * sin, y: -it.c.x * sin + it.c.y * cos };
      info.angle = Math.round((angle * 180) / Math.PI * 10) / 10;
    }
  }

  const isTimeOrNumber = (it) => periodNumberOf(it.text) || timesIn(it.text).length || /^[\d.:,\-–— ]+$/.test(it.text);
  let colCenter;
  let colWidth;
  if (headers.size >= 2) {
    const fit = fitLine([...headers].map(([day, it]) => [day, it.c.x]));
    colCenter = (day) => fit.a + fit.b * day;
    colWidth = Math.abs(fit.b);
    info.method = 'wochentage';
  } else {
    // Ohne Kopfzeile: Fächer verteilen sich über fünf gleich breite Spalten
    const content = items.filter((it) => !isTimeOrNumber(it) && matchSubject(it.text, knownSubjects));
    if (content.length < 3) return { lessons: [], periods: null, info };
    const minX = Math.min(...content.map((i) => i.c.x));
    const maxX = Math.max(...content.map((i) => i.c.x));
    colWidth = (maxX - minX) / 4 || 1;
    colCenter = (day) => minX + (day - 1) * colWidth;
    info.method = 'verteilung';
  }
  const top = headers.size ? Math.max(...[...headers.values()].map((h) => h.c.y + h.h / 2)) : -Infinity;
  const leftEdge = colCenter(1) - colWidth * 0.55;

  // 2) Zeilen: Stundennummern oder Uhrzeiten links von Montag
  const labels = items.filter((it) => !headerSet.has(it) && it.c.x < leftEdge && it.c.y > top);
  const numbered = labels.map((it) => ({ it, n: periodNumberOf(it.text) })).filter((l) => l.n);
  let rowCenter;
  let rowHeight;
  let rowCount;
  const rowLabels = new Map();
  if (numbered.length >= 2) {
    const fit = fitLine(numbered.map((l) => [l.n, l.it.c.y]));
    rowHeight = Math.abs(fit.b) || wordHeight * 2;
    rowCenter = (p) => fit.a + fit.b * (p + 1);
    // Auch Zeilen mitnehmen, deren Nummer nicht erkannt wurde
    const lastContent = Math.max(
      0,
      ...items
        .filter((it) => it.c.x >= leftEdge && it.c.y > top)
        .map((it) => Math.round((it.c.y - fit.a) / (fit.b || 1)))
        .filter((n) => n >= 1 && n <= 12),
    );
    rowCount = Math.max(...numbered.map((l) => l.n), lastContent);
    info.method += '+nummern';
  } else {
    const timeRows = clusterRows(labels.filter((it) => timesIn(it.text).length), wordHeight * 1.2).filter((r) => r.items.length);
    if (timeRows.length >= 2) {
      // Pro Stunde stehen oft zwei Uhrzeiten untereinander: zusammenfassen
      const gaps = timeRows.slice(1).map((r, i) => r.y - timeRows[i].y);
      const step = median(gaps);
      const merged = clusterRows(timeRows.map((r) => ({ c: { y: r.y }, row: r })), step * 0.6);
      const centers = merged.map((m) => m.y);
      rowHeight = merged.length > 1 ? median(centers.slice(1).map((y, i) => y - centers[i])) : wordHeight * 3;
      // Zeilen ohne erkannte Uhrzeit, aber mit Inhalt darunter ergänzen
      const lowest = Math.max(...items.filter((it) => it.c.x >= leftEdge && !isTimeOrNumber(it)).map((it) => it.c.y));
      while (centers.length < 12 && lowest > centers[centers.length - 1] + rowHeight * 0.6) {
        centers.push(centers[centers.length - 1] + rowHeight);
      }
      rowCenter = (p) => centers[p];
      rowCount = centers.length;
      info.method += '+uhrzeiten';
    } else {
      const content = items.filter((it) => !headerSet.has(it) && it.c.y > top && it.c.x >= leftEdge && !isTimeOrNumber(it));
      const rows = clusterRows(content, wordHeight * 1.1);
      const centers = rows.map((r) => r.y);
      rowCenter = (p) => centers[p];
      rowHeight = centers.length > 1 ? median(centers.slice(1).map((y, i) => y - centers[i])) : wordHeight * 3;
      rowCount = centers.length;
      info.method += '+zeilen';
    }
  }
  info.rows = rowCount;
  if (!rowCount) return { lessons: [], periods: null, info };

  // Uhrzeiten der Stunden
  for (const it of labels) {
    const t = timesIn(it.text);
    if (!t.length) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let p = 0; p < rowCount; p++) {
      const d = Math.abs(it.c.y - rowCenter(p));
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best >= 0 && bestDist < rowHeight * 0.75) rowLabels.set(best, [...(rowLabels.get(best) || []), ...t.map((time) => ({ time, y: it.c.y, x: it.c.x }))]);
  }
  let periods = null;
  if (rowLabels.size >= Math.max(2, rowCount / 2)) {
    periods = [];
    for (let p = 0; p < rowCount; p++) {
      const t = (rowLabels.get(p) || []).sort((a, b) => a.y - b.y || a.x - b.x).map((x) => x.time);
      periods.push(t.length >= 2 && t[1] > t[0] ? { start: t[0], end: t[1] } : null);
    }
    if (periods.filter(Boolean).length < 2) periods = null;
  }

  // 3) Wörter den Zellen zuordnen
  const cells = new Map();
  for (const it of items) {
    if (headerSet.has(it) || it.c.y <= top || it.c.x < leftEdge || isTimeOrNumber(it)) continue;
    let day = Math.round((it.c.x - colCenter(1)) / (colWidth || 1)) + 1;
    if (day < 1 || day > 5 || Math.abs(it.c.x - colCenter(day)) > colWidth * 0.62) continue;
    let period = -1;
    let bestDist = Infinity;
    for (let p = 0; p < rowCount; p++) {
      const d = Math.abs(it.c.y - rowCenter(p));
      if (d < bestDist) {
        bestDist = d;
        period = p;
      }
    }
    if (period < 0 || bestDist > rowHeight * 0.62) continue;
    const key = `${day}:${period}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(it);
  }

  // 4) Fächer erkennen
  const lessons = [];
  for (const [key, list] of cells) {
    const [weekday, period] = key.split(':').map(Number);
    list.sort((a, b) => a.c.y - b.c.y || a.c.x - b.c.x);
    const raw = list.map((w) => w.text).join(' ');
    const conf = list.reduce((s, w) => s + (w.conf ?? 50), 0) / list.length / 100;
    const match = matchSubject(raw, knownSubjects) || list.map((w) => matchSubject(w.text, knownSubjects)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
    if (match) {
      lessons.push({ weekday, period, subject: match.name, confidence: Math.min(1, (match.score + conf) / 2), raw });
    } else {
      const letters = normalizeToken(raw).replace(/ /g, '');
      if (letters.length >= 3 && conf >= 0.6) {
        const text = raw.replace(/[^\p{L}\p{N} .\-/]/gu, '').trim();
        lessons.push({ weekday, period, subject: text.charAt(0).toUpperCase() + text.slice(1), confidence: conf * 0.5, raw });
      }
    }
  }
  lessons.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
  return { lessons, periods, info };
}
