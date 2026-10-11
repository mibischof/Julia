import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeStates, overrideId } from '../js/model.js';
import { eventsOn, kidDayOff, pickupsOn, remindersBetween, schoolDay } from '../js/schedule.js';
import { buildIcs, foldLine } from '../js/ics.js';
import { dateTime } from '../js/dates.js';

function fixture() {
  return normalize({
    settings: { bundesland: 'K', defaultLeadMinutes: 15 },
    members: [{ id: 'mama', name: 'Mama' }, { id: 'papa', name: 'Papa' }],
    kids: [
      { id: 'lena', name: 'Lena', type: 'schule', followsSchoolHolidays: true },
      { id: 'max', name: 'Max', type: 'kindergarten', followsSchoolHolidays: false },
    ],
    lessons: [
      { id: 'l1', kidId: 'lena', weekday: 1, period: 0, subject: 'Deutsch' },
      { id: 'l2', kidId: 'lena', weekday: 1, period: 4, subject: 'Turnen' },
    ],
    pickups: [
      { id: 'p1', kidId: 'lena', weekdays: [1, 3, 5], time: '12:40', place: 'Volksschule', memberId: 'mama' },
      { id: 'p2', kidId: 'max', weekdays: [1, 2, 3, 4, 5], time: '13:00', place: 'Kindergarten', memberId: 'papa', leadMinutes: 30 },
    ],
    events: [
      { id: 'e1', title: 'Schwimmkurs', kidIds: ['lena'], date: '2026-10-13', start: '16:00', end: '17:00', repeat: 'weekly', skipSchoolHolidays: true, reminderMinutes: 60 },
      { id: 'e2', title: 'Skikurs', kidIds: ['lena'], date: '2027-02-08', endDate: '2027-02-12', allDay: true, reminderMinutes: 1440 },
      { id: 'e3', title: 'Geburtstag Oma', date: '2026-03-31', repeat: 'yearly', allDay: true },
    ],
  });
}

test('Schultag: Stunden und Schulschluss', () => {
  const s = fixture();
  const day = schoolDay(s, s.kids[0], '2026-10-12');
  assert.equal(day.lessons.length, 2);
  assert.equal(day.start, '08:00');
  assert.equal(day.end, '12:40');
});

test('Herbstferien: Schulkind frei, Kindergarten nicht', () => {
  const s = fixture();
  assert.equal(kidDayOff(s, s.kids[0], '2026-10-28').title, 'Herbstferien');
  assert.equal(kidDayOff(s, s.kids[1], '2026-10-28'), null);
  // Nationalfeiertag gilt für alle
  assert.equal(kidDayOff(s, s.kids[1], '2026-10-26').title, 'Nationalfeiertag');
  const pickups = pickupsOn(s, '2026-10-28');
  assert.equal(pickups.find((p) => p.kid.id === 'lena').status, 'dayoff');
  assert.equal(pickups.find((p) => p.kid.id === 'max').status, 'active');
});

test('Abholung tauschen und absagen', () => {
  const s = fixture();
  s.pickupOverrides.push({ id: overrideId('p1', '2026-10-12'), pickupId: 'p1', date: '2026-10-12', memberId: 'papa' });
  s.pickupOverrides.push({ id: overrideId('p2', '2026-10-12'), pickupId: 'p2', date: '2026-10-12', cancelled: true });
  const [lena, max] = pickupsOn(s, '2026-10-12');
  assert.equal(lena.memberId, 'papa');
  assert.equal(lena.status, 'active');
  assert.equal(max.status, 'cancelled');
});

test('Wiederkehrende Termine, Ferien ausgelassen', () => {
  const s = fixture();
  assert.equal(eventsOn(s, '2026-10-20').length, 1);
  assert.equal(eventsOn(s, '2026-10-27').length, 0, 'Herbstferien');
  assert.equal(eventsOn(s, '2026-10-21').length, 0);
  assert.equal(eventsOn(s, '2028-03-31')[0].event.id, 'e3');
  const ski = eventsOn(s, '2027-02-10');
  assert.equal(ski.length, 1);
  assert.equal(ski[0].date, '2027-02-08');
  assert.equal(ski[0].dayIndex, 2);
});

test('Erinnerungen nur für die zuständige Person', () => {
  const s = fixture();
  const from = dateTime('2026-10-12', '00:00');
  const to = dateTime('2026-10-12', '23:59');
  const mama = remindersBetween(s, 'mama', from, to).map((r) => r.title);
  const papa = remindersBetween(s, 'papa', from, to).map((r) => r.title);
  assert.deepEqual(mama, ['Lena abholen um 12:40']);
  assert.deepEqual(papa, ['Max abholen um 13:00']);
  const papaAt = remindersBetween(s, 'papa', from, to)[0].at;
  assert.equal(papaAt.getHours() * 60 + papaAt.getMinutes(), 12 * 60 + 30);
});

test('Termin-Erinnerung (Ganztag: 1 Tag vorher um 8:00)', () => {
  const s = fixture();
  const list = remindersBetween(s, 'mama', dateTime('2027-02-07', '00:00'), dateTime('2027-02-07', '23:59'));
  const ski = list.find((r) => r.kind === 'event');
  assert.equal(ski.title, 'Skikurs');
  assert.equal(ski.at.getHours(), 8);
});

test('Zusammenführen: neuere Fassung gewinnt, Löschungen bleiben gelöscht', () => {
  const a = fixture();
  const b = fixture();
  a.kids[0] = { ...a.kids[0], name: 'Lena A', updatedAt: 10 };
  b.kids[0] = { ...b.kids[0], name: 'Lena B', updatedAt: 20 };
  b.events = b.events.filter((e) => e.id !== 'e3');
  b.tombstones.e3 = Date.now();
  const m = mergeStates(a, b);
  assert.equal(m.kids.find((k) => k.id === 'lena').name, 'Lena B');
  assert.equal(m.events.some((e) => e.id === 'e3'), false);
  assert.equal(m.events.length, 2);
});

test('Kalenderdatei', () => {
  const s = fixture();
  const ics = buildIcs(s, { meId: 'mama', from: '2026-10-12', days: 7, now: new Date(Date.UTC(2026, 9, 11)) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:Abholen: Lena/);
  assert.doesNotMatch(ics, /SUMMARY:Abholen: Max/, 'Max holt Papa ab');
  assert.match(ics, /SUMMARY:Schwimmkurs \(Lena\)/);
  assert.match(ics, /TRIGGER:-PT15M/);
  const all = buildIcs(s, { pickups: 'all', from: '2026-10-12', days: 1 });
  assert.match(all, /SUMMARY:Abholen: Max \(Papa\)/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('Zeilenumbruch in Kalenderdatei zerteilt keine Umlaute', () => {
  const folded = foldLine('DESCRIPTION:' + 'ä'.repeat(60));
  const unfolded = folded.split('\r\n ').join('');
  assert.equal(unfolded, 'DESCRIPTION:' + 'ä'.repeat(60));
});
