// Fächer: Kurzformen für schmale Bildschirme und gleichbleibende Farben.

// Kurzformen, wie man sie in Österreich sagt
const SHORT = {
  mathematik: 'Mathe',
  sachunterricht: 'SU',
  englisch: 'Engl.',
  'bewegung und sport': 'Turnen',
  'kunst und gestaltung': 'Kunst',
  'bildnerische erziehung': 'BE',
  'technik und design': 'Werken',
  musikerziehung: 'Musik',
  religion: 'Reli',
  biologie: 'Bio',
  geografie: 'Geo',
  geschichte: 'Gesch.',
  informatik: 'Info',
  nachmittagsbetreuung: 'NMB',
};

export function shortSubject(subject) {
  const s = subject.trim();
  const known = SHORT[s.toLowerCase()];
  if (known) return known;
  if (s.length <= 7) return s;
  const words = s.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 1) return words.map((w) => w[0].toUpperCase()).join('').slice(0, 4);
  return `${s.slice(0, 5)}.`;
}

/** Gleiches Fach → gleicher Farbton. */
export function subjectHue(subject) {
  let h = 0;
  for (const ch of subject.toLowerCase()) h = (h * 31 + ch.codePointAt(0)) % 3600;
  return Math.round(h / 10);
}
