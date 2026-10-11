import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSubject, parseTimetable } from '../js/timetable-parse.js';

test('Fächer werden auch mit Lesefehlern erkannt', () => {
  assert.equal(matchSubject('Deutsch').name, 'Deutsch');
  assert.equal(matchSubject('Deufsch').name, 'Deutsch');
  assert.equal(matchSubject('Matbe').name, 'Mathematik');
  assert.equal(matchSubject('SU').name, 'Sachunterricht');
  assert.equal(matchSubject('Turnen').name, 'Bewegung und Sport');
  assert.equal(matchSubject('Reli').name, 'Religion');
  assert.equal(matchSubject('Zeichnen').name, 'Kunst und Gestaltung');
  assert.equal(matchSubject('Engl.').name, 'Englisch');
  assert.equal(matchSubject('xq'), null);
  assert.equal(matchSubject('Schach', ['Schach']).name, 'Schach');
});

// Baut Wörter wie aus der Texterkennung: Tabelle mit Kopfzeile, Nummern und Fächern
function sheet({ angle = 0, numbers = true, times = true } = {}) {
  const words = [];
  const rad = (angle * Math.PI) / 180;
  const put = (text, cx, cy, conf = 90) => {
    const x = cx * Math.cos(rad) - cy * Math.sin(rad);
    const y = cx * Math.sin(rad) + cy * Math.cos(rad);
    const w = text.length * 14;
    words.push({ text, conf, x0: x - w / 2, x1: x + w / 2, y0: y - 14, y1: y + 14 });
  };
  ['Mo', 'Di', 'Mi', 'Do', 'Fr'].forEach((d, i) => put(d, 300 + i * 200, 100));
  const plan = [
    ['Deutsch', 'Mathe', 'Deutsch', 'Lesen', 'Mathe'],
    ['Mathe', 'Deutsch', 'Mathe', 'Mathe', 'Deutsch'],
    ['SU', 'Engl.', 'Reli', 'SU', 'Werken'],
    ['Turnen', 'Musik', 'Zeichnen', 'Deutsch', 'Reli'],
  ];
  const t = [['7:50', '8:40'], ['8:45', '9:35'], ['9:55', '10:45'], ['10:50', '11:40']];
  plan.forEach((row, p) => {
    const y = 200 + p * 100;
    if (numbers) put(`${p + 1}.`, 90, y - 20);
    if (times) put(`${t[p][0]}–${t[p][1]}`, 90, y + 15);
    row.forEach((s, d) => put(s, 300 + d * 200 + (p % 2 ? 12 : -10), y + (d % 2 ? 8 : -6), s === 'Reli' ? 70 : 88));
  });
  return words;
}

test('Raster aus Wochentagen und Stundennummern', () => {
  const { lessons, periods, info } = parseTimetable(sheet());
  assert.equal(info.days, 5);
  assert.equal(lessons.length, 20);
  const at = (d, p) => lessons.find((l) => l.weekday === d && l.period === p)?.subject;
  assert.equal(at(1, 0), 'Deutsch');
  assert.equal(at(5, 2), 'Technik und Design');
  assert.equal(at(3, 3), 'Kunst und Gestaltung');
  assert.deepEqual(periods[0], { start: '07:50', end: '08:40' });
  assert.deepEqual(periods[3], { start: '10:50', end: '11:40' });
});

test('Schräg fotografiert (4°) landet trotzdem in den richtigen Zellen', () => {
  const { lessons, info } = parseTimetable(sheet({ angle: 4 }));
  assert.equal(info.angle, 4);
  assert.equal(lessons.length, 20);
  assert.equal(lessons.find((l) => l.weekday === 5 && l.period === 3).subject, 'Religion');
});

test('Ohne Nummern und Uhrzeiten: Zeilen aus dem Inhalt', () => {
  const { lessons } = parseTimetable(sheet({ numbers: false, times: false }));
  assert.equal(lessons.length, 20);
  assert.equal(lessons.find((l) => l.weekday === 2 && l.period === 2).subject, 'Englisch');
});

test('App-Screenshot: Navigationsleiste unten wird nicht zur Stunde', () => {
  const words = [];
  const put = (text, cx, cy) => words.push({ text, conf: 92, x0: cx - text.length * 7, x1: cx + text.length * 7, y0: cy - 14, y1: cy + 14 });
  put('9:41', 80, 40);
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((d, i) => put(d, 260 + i * 200, 300));
  const t = ['07:50', '08:45', '09:55'];
  t.forEach((time, p) => {
    put(time, 80, 420 + p * 230);
    ['Deutsch', 'Mathe', 'Englisch', 'Musik', 'Lesen'].forEach((s, d) => {
      put(s, 260 + d * 200, 400 + p * 230);
      put('HUB', 260 + d * 200, 440 + p * 230);
    });
  });
  ['Heute', 'Woche', 'Aufgaben', 'Noten'].forEach((s, i) => put(s, 150 + i * 280, 2400));
  const { lessons, info } = parseTimetable(words);
  assert.equal(info.days, 5);
  assert.equal(info.rows, 3);
  assert.equal(lessons.length, 15);
  assert.ok(lessons.every((l) => !['Woche', 'Aufgaben', 'Noten'].includes(l.subject)));
  assert.equal(lessons.find((l) => l.weekday === 3 && l.period === 0).subject, 'Englisch');
});

test('Nur Beginnzeiten: Ende bleibt offen', () => {
  const words = [];
  const put = (text, cx, cy) => words.push({ text, conf: 92, x0: cx - text.length * 7, x1: cx + text.length * 7, y0: cy - 14, y1: cy + 14 });
  ['Mo', 'Di', 'Mi', 'Do', 'Fr'].forEach((d, i) => put(d, 260 + i * 200, 100));
  ['07:50', '08:45', '09:55'].forEach((time, p) => {
    put(time, 80, 220 + p * 150);
    ['Deutsch', 'Mathe', 'SU', 'Musik', 'Lesen'].forEach((s, d) => put(s, 260 + d * 200, 215 + p * 150));
  });
  const { periods } = parseTimetable(words);
  assert.deepEqual(periods, [{ start: '07:50', end: null }, { start: '08:45', end: null }, { start: '09:55', end: null }]);
});

test('Ohne erkennbare Tabelle kein Ergebnis', () => {
  const { lessons } = parseTimetable([{ text: 'Hallo', conf: 90, x0: 0, x1: 50, y0: 0, y1: 20 }]);
  assert.equal(lessons.length, 0);
});
