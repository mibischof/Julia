// Datums-Helfer. Tage werden überall als lokale ISO-Strings "YYYY-MM-DD"
// geführt, Uhrzeiten als "HH:MM". Wochentage nach ISO: 1 = Montag … 7 = Sonntag.

const LOCALE = 'de-AT';

export const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Anzahl Tage von a nach b (b − a). Rundung gleicht Sommerzeit-Sprünge aus. */
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function weekday(s) {
  const w = parseISO(s).getDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(s) {
  return addDays(s, 1 - weekday(s));
}

/** month: 1–12 */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function isoFromParts(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function dateTime(dateStr, timeStr = '00:00') {
  const d = parseISO(dateStr);
  const [h, m] = timeStr.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function addMinutesToTime(t, n) {
  return minToTime(timeToMin(t) + n);
}

export function inRange(s, from, to) {
  return s >= from && s <= to;
}

/** Ostersonntag (gregorianisch, Algorithmus nach Meeus/Jones/Butcher). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoFromParts(year, month, day);
}

/** n-ter Wochentag (ISO) eines Monats, z. B. zweiter Montag im Februar. */
export function nthWeekdayOfMonth(year, month, isoWeekday, n) {
  const first = isoFromParts(year, month, 1);
  const offset = (isoWeekday - weekday(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

/** Erster Tag ≥ from, der auf den gegebenen ISO-Wochentag fällt. */
export function nextWeekdayOnOrAfter(from, isoWeekday) {
  return addDays(from, (isoWeekday - weekday(from) + 7) % 7);
}

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const formatters = new Map();
function formatter(options) {
  const key = JSON.stringify(options);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(LOCALE, options));
  return formatters.get(key);
}

export const fmt = {
  /** "Montag, 12. Oktober" */
  full: (s) => `${WEEKDAYS_LONG[weekday(s) - 1]}, ${formatter({ day: 'numeric', month: 'long' }).format(parseISO(s))}`,
  /** "Mo, 12.10." */
  short: (s) => {
    const d = parseISO(s);
    return `${WEEKDAYS_SHORT[weekday(s) - 1]}, ${d.getDate()}.${d.getMonth() + 1}.`;
  },
  /** "12.10.2026" */
  numeric: (s) => {
    const d = parseISO(s);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  },
  /** "12. Okt." */
  dayMonthShort: (s) => formatter({ day: 'numeric', month: 'short' }).format(parseISO(s)),
  /** "Oktober 2026" (in Österreich: "Jänner") */
  monthYear: (year, month) => formatter({ month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)),
  time: (t) => t,
};

/** Beschreibt einen Tag relativ zu heute: "Heute", "Morgen" oder "Mo, 12.10.". */
export function relativeDay(s, today) {
  const diff = diffDays(today, s);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return fmt.short(s);
}
