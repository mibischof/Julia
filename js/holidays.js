// Schulferien, Feiertage und schulfreie Tage in Österreich, berechnet nach den
// Regeln des Schulzeitgesetzes. Schulautonome Tage legt jede Schule selbst fest;
// die trägt man in der App als "freie Tage" ein.
//
// Jeder Eintrag: { id, title, start, end, kind, scope }
//   kind:  'ferien' | 'feiertag' | 'schulfrei'
//   scope: 'all'    → gilt für alle (gesetzlicher Feiertag, auch Kindergarten)
//          'school' → gilt nur für Kinder, bei denen "Schulferien gelten" aktiv ist

import { addDays, easterSunday, isoFromParts, nextWeekdayOnOrAfter, nthWeekdayOfMonth } from './dates.js';

export const BUNDESLAENDER = [
  { code: 'B', name: 'Burgenland' },
  { code: 'K', name: 'Kärnten' },
  { code: 'N', name: 'Niederösterreich' },
  { code: 'O', name: 'Oberösterreich' },
  { code: 'S', name: 'Salzburg' },
  { code: 'St', name: 'Steiermark' },
  { code: 'T', name: 'Tirol' },
  { code: 'V', name: 'Vorarlberg' },
  { code: 'W', name: 'Wien' },
];

const EAST = new Set(['W', 'N', 'B']);

// Woche der Semesterferien im Februar (1. = erste Februarwoche)
const SEMESTER_WEEK = { W: 1, N: 1, B: 2, K: 2, S: 2, T: 2, V: 2, O: 3, St: 3 };

// Festtag des Landespatrons (schulfrei)
const PATRON = {
  K: [3, 19, 'Hl. Josef'],
  St: [3, 19, 'Hl. Josef'],
  T: [3, 19, 'Hl. Josef'],
  V: [3, 19, 'Hl. Josef'],
  O: [5, 4, 'Hl. Florian'],
  S: [9, 24, 'Hl. Rupert'],
  W: [11, 15, 'Hl. Leopold'],
  N: [11, 15, 'Hl. Leopold'],
  B: [11, 11, 'Hl. Martin'],
};

/** Erster Schultag des Schuljahres, das im September `year` beginnt. */
export function schoolStart(code, year) {
  return nthWeekdayOfMonth(year, 9, 1, EAST.has(code) ? 1 : 2);
}

function entry(title, start, end, kind, scope) {
  return { id: `h:${kind}:${start}`, title, start, end, kind, scope };
}

/** Ferien des Schuljahres, das im September `year` beginnt. */
export function schoolYearHolidays(code, year) {
  const next = year + 1;
  const easter = easterSunday(next);
  const pentecost = addDays(easter, 49);
  const semesterStart = nthWeekdayOfMonth(next, 2, 1, SEMESTER_WEEK[code] ?? 2);
  // Sommerferien beginnen am Samstag zwischen 28.6. und 4.7. (Ost) bzw. 5.7. und 11.7. (West)
  const summerStart = nextWeekdayOnOrAfter(isoFromParts(next, EAST.has(code) ? 6 : 7, EAST.has(code) ? 28 : 5), 6);
  const summerEnd = addDays(schoolStart(code, next), -1);
  return [
    entry('Herbstferien', isoFromParts(year, 10, 27), isoFromParts(year, 10, 31), 'ferien', 'school'),
    entry('Weihnachtsferien', isoFromParts(year, 12, 24), isoFromParts(next, 1, 6), 'ferien', 'school'),
    entry('Semesterferien', semesterStart, addDays(semesterStart, 5), 'ferien', 'school'),
    entry('Osterferien', addDays(easter, -8), addDays(easter, 1), 'ferien', 'school'),
    entry('Pfingstferien', addDays(pentecost, -1), addDays(pentecost, 1), 'ferien', 'school'),
    entry('Sommerferien', summerStart, summerEnd, 'ferien', 'school'),
  ];
}

/** Gesetzliche Feiertage und landesweit schulfreie Tage eines Kalenderjahres. */
export function publicHolidays(code, year) {
  const easter = easterSunday(year);
  const day = (m, d) => isoFromParts(year, m, d);
  const list = [
    ['Neujahr', day(1, 1)],
    ['Heilige Drei Könige', day(1, 6)],
    ['Ostermontag', addDays(easter, 1)],
    ['Staatsfeiertag', day(5, 1)],
    ['Christi Himmelfahrt', addDays(easter, 39)],
    ['Pfingstmontag', addDays(easter, 50)],
    ['Fronleichnam', addDays(easter, 60)],
    ['Mariä Himmelfahrt', day(8, 15)],
    ['Nationalfeiertag', day(10, 26)],
    ['Allerheiligen', day(11, 1)],
    ['Mariä Empfängnis', day(12, 8)],
    ['Christtag', day(12, 25)],
    ['Stefanitag', day(12, 26)],
  ].map(([title, d]) => entry(title, d, d, 'feiertag', 'all'));

  list.push(entry('Allerseelen (schulfrei)', day(11, 2), day(11, 2), 'schulfrei', 'school'));
  const patron = PATRON[code];
  if (patron) {
    const d = day(patron[0], patron[1]);
    list.push(entry(`${patron[2]} (Landespatron, schulfrei)`, d, d, 'schulfrei', 'school'));
  }
  if (code === 'K') {
    list.push(entry('Tag der Volksabstimmung (schulfrei)', day(10, 10), day(10, 10), 'schulfrei', 'school'));
  }
  return list;
}

const cache = new Map();

/** Alle Einträge, die das Kalenderjahr `year` berühren, sortiert nach Beginn. */
export function holidaysForYear(code, year) {
  const key = `${code}:${year}`;
  if (cache.has(key)) return cache.get(key);
  const from = isoFromParts(year, 1, 1);
  const to = isoFromParts(year, 12, 31);
  const list = [...schoolYearHolidays(code, year - 1), ...schoolYearHolidays(code, year), ...publicHolidays(code, year)]
    .filter((e) => e.end >= from && e.start <= to)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  cache.set(key, list);
  return list;
}

export function holidaysInRange(code, from, to) {
  const out = [];
  const seen = new Set();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const e of holidaysForYear(code, y)) {
      if (e.end >= from && e.start <= to && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
  }
  return out;
}

/** Einträge, die den Tag `date` abdecken (Feiertage zuerst). */
export function holidaysOn(code, date) {
  return holidaysForYear(code, Number(date.slice(0, 4)))
    .filter((e) => e.start <= date && e.end >= date)
    .sort((a, b) => (a.kind === 'feiertag' ? -1 : 0) - (b.kind === 'feiertag' ? -1 : 0));
}
