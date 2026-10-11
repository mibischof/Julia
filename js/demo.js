// Beispieldaten zum Ausprobieren. Termine werden relativ zu heute angelegt.

import { addDays, nextWeekdayOnOrAfter, todayISO } from './dates.js';
import { emptyState, normalize, uid } from './model.js';

export function demoState(today = todayISO()) {
  const now = Date.now();
  const s = emptyState();
  const id = () => uid();
  const mama = { id: id(), name: 'Mama', color: '#D6409F', updatedAt: now };
  const papa = { id: id(), name: 'Papa', color: '#0091FF', updatedAt: now };
  const lena = {
    id: id(),
    name: 'Lena',
    color: '#F76B15',
    type: 'schule',
    institution: 'Volksschule',
    className: '2b',
    followsSchoolHolidays: true,
    periods: [
      { start: '07:50', end: '08:40' },
      { start: '08:45', end: '09:35' },
      { start: '09:55', end: '10:45' },
      { start: '10:50', end: '11:40' },
      { start: '11:45', end: '12:35' },
    ],
    updatedAt: now,
  };
  const max = {
    id: id(),
    name: 'Max',
    color: '#30A46C',
    type: 'kindergarten',
    institution: 'Kindergarten',
    className: 'Igelgruppe',
    followsSchoolHolidays: false,
    updatedAt: now,
  };
  s.members = [mama, papa];
  s.kids = [lena, max];

  const plan = {
    1: ['Deutsch', 'Mathematik', 'Sachunterricht', 'Bewegung und Sport', 'Bewegung und Sport'],
    2: ['Mathematik', 'Deutsch', 'Englisch', 'Musik'],
    3: ['Deutsch', 'Mathematik', 'Religion', 'Kunst und Gestaltung', 'Kunst und Gestaltung'],
    4: ['Lesen', 'Mathematik', 'Sachunterricht', 'Deutsch'],
    5: ['Mathematik', 'Deutsch', 'Technik und Design', 'Religion'],
  };
  for (const [wd, subjects] of Object.entries(plan)) {
    subjects.forEach((subject, period) => {
      s.lessons.push({ id: id(), kidId: lena.id, weekday: Number(wd), period, subject, room: '', note: subject === 'Bewegung und Sport' ? 'Turnsackerl' : '', updatedAt: now });
    });
  }

  s.pickups = [
    { id: id(), kidId: lena.id, weekdays: [1, 3], time: '12:35', place: 'Volksschule', memberId: mama.id, leadMinutes: 15, skipOnDayOff: true, note: '', updatedAt: now },
    { id: id(), kidId: lena.id, weekdays: [2, 4, 5], time: '11:40', place: 'Volksschule', memberId: papa.id, leadMinutes: 15, skipOnDayOff: true, note: '', updatedAt: now },
    { id: id(), kidId: max.id, weekdays: [1, 2, 3, 4, 5], time: '13:00', place: 'Kindergarten', memberId: papa.id, leadMinutes: 20, skipOnDayOff: true, note: '', updatedAt: now },
  ];

  const tuesday = nextWeekdayOnOrAfter(addDays(today, 1), 2);
  s.events = [
    { id: id(), title: 'Schwimmkurs', kidIds: [lena.id], date: tuesday, start: '16:00', end: '16:45', allDay: false, location: 'Hallenbad', memberId: mama.id, reminderMinutes: 60, repeat: 'weekly', repeatUntil: '', skipSchoolHolidays: true, note: 'Badesachen', exdates: [], updatedAt: now },
    { id: id(), title: 'Kinderarzt', kidIds: [max.id], date: addDays(today, 3), start: '09:30', end: '10:00', allDay: false, location: 'Ordination Dr. Huber', memberId: papa.id, reminderMinutes: 1440, repeat: 'none', repeatUntil: '', skipSchoolHolidays: false, note: 'E-Card und Impfpass', exdates: [], updatedAt: now },
    { id: id(), title: 'Kindergeburtstag Sophie', kidIds: [lena.id], date: addDays(today, 6), start: '14:00', end: '17:00', allDay: false, location: '', memberId: null, reminderMinutes: 1440, repeat: 'none', repeatUntil: '', skipSchoolHolidays: false, note: 'Geschenk besorgen', exdates: [], updatedAt: now },
    { id: id(), title: 'Elternabend', kidIds: [lena.id], date: addDays(today, 9), start: '19:00', end: '20:30', allDay: false, location: 'Volksschule', memberId: null, reminderMinutes: 120, repeat: 'none', repeatUntil: '', skipSchoolHolidays: false, note: '', exdates: [], updatedAt: now },
  ];
  s.settings = { ...s.settings, updatedAt: now };
  return { state: normalize(s), meId: mama.id };
}
