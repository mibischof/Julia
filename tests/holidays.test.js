import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysOn, schoolStart, schoolYearHolidays, publicHolidays } from '../js/holidays.js';
import { easterSunday } from '../js/dates.js';

const range = (list, title) => {
  const e = list.find((x) => x.title === title);
  return e && [e.start, e.end];
};

test('Ostersonntag', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2028), '2028-04-16');
});

// Offizielle Termine Kärnten 2026/27 (Bildungsministerium)
test('Kärnten 2026/27 entspricht dem Ferienkalender', () => {
  const list = schoolYearHolidays('K', 2026);
  assert.deepEqual(range(list, 'Herbstferien'), ['2026-10-27', '2026-10-31']);
  assert.deepEqual(range(list, 'Weihnachtsferien'), ['2026-12-24', '2027-01-06']);
  assert.deepEqual(range(list, 'Semesterferien'), ['2027-02-08', '2027-02-13']);
  assert.deepEqual(range(list, 'Osterferien'), ['2027-03-20', '2027-03-29']);
  assert.deepEqual(range(list, 'Pfingstferien'), ['2027-05-15', '2027-05-17']);
  assert.deepEqual(range(list, 'Sommerferien'), ['2027-07-10', '2027-09-12']);
  assert.equal(schoolStart('K', 2026), '2026-09-14');
  assert.equal(schoolStart('K', 2027), '2027-09-13');
});

test('Ost-Bundesländer: Sommer und Semester früher', () => {
  const wien = schoolYearHolidays('W', 2026);
  assert.deepEqual(range(wien, 'Semesterferien'), ['2027-02-01', '2027-02-06']);
  assert.deepEqual(range(wien, 'Sommerferien'), ['2027-07-03', '2027-09-05']);
  const stmk = schoolYearHolidays('St', 2026);
  assert.deepEqual(range(stmk, 'Semesterferien'), ['2027-02-15', '2027-02-20']);
});

test('Sommerferien 2026 (Ost und West)', () => {
  assert.deepEqual(range(schoolYearHolidays('W', 2025), 'Sommerferien'), ['2026-07-04', '2026-09-06']);
  assert.deepEqual(range(schoolYearHolidays('K', 2025), 'Sommerferien'), ['2026-07-11', '2026-09-13']);
});

test('Feiertage und schulfreie Tage in Kärnten', () => {
  const list = publicHolidays('K', 2027);
  const has = (title, date) => assert.ok(list.some((e) => e.title.startsWith(title) && e.start === date), `${title} ${date}`);
  has('Christi Himmelfahrt', '2027-05-06');
  has('Fronleichnam', '2027-05-27');
  has('Hl. Josef', '2027-03-19');
  has('Tag der Volksabstimmung', '2027-10-10');
  has('Allerseelen', '2027-11-02');
});

test('holidaysOn findet Ferien über den Jahreswechsel', () => {
  assert.equal(holidaysOn('K', '2027-01-04')[0].title, 'Weihnachtsferien');
  assert.equal(holidaysOn('K', '2026-12-31')[0].title, 'Weihnachtsferien');
  // Feiertag steht vor den Ferien
  assert.equal(holidaysOn('K', '2027-01-06')[0].title, 'Heilige Drei Könige');
  assert.equal(holidaysOn('K', '2026-10-21').length, 0);
});
