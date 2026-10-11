// Berechnet, was an einem Tag passiert: freie Tage, Stundenplan, Abholungen,
// Termine (inkl. Wiederholungen) und fällige Erinnerungen. Reine Funktionen,
// damit sie ohne Browser getestet werden können.

import { addDays, dateTime, diffDays, toISO, weekday } from './dates.js';
import { holidaysOn } from './holidays.js';
import { byId, overrideId } from './model.js';

function closureCovers(c, date) {
  return c.start <= date && (c.end || c.start) >= date;
}

/** Freie Tage, die das Kind an `date` betreffen, oder null. */
export function kidDayOff(state, kid, date) {
  for (const c of state.closures) {
    if (closureCovers(c, date) && (!c.kidIds?.length || c.kidIds.includes(kid.id))) {
      return { id: c.id, title: c.title, kind: 'closure', scope: 'kids' };
    }
  }
  for (const h of holidaysOn(state.settings.bundesland, date)) {
    if (h.scope === 'all' || kid.followsSchoolHolidays) return h;
  }
  return null;
}

/** Ferien, Feiertage und eigene freie Tage an `date` (für die Kalenderanzeige). */
export function dayOffEntries(state, date) {
  const custom = state.closures
    .filter((c) => closureCovers(c, date))
    .map((c) => ({ id: c.id, title: c.title, kind: 'closure', scope: 'kids', kidIds: c.kidIds || [], start: c.start, end: c.end || c.start }));
  return [...holidaysOn(state.settings.bundesland, date), ...custom];
}

function isGeneralDayOff(state, date) {
  if (holidaysOn(state.settings.bundesland, date).length) return true;
  return state.closures.some((c) => closureCovers(c, date) && !c.kidIds?.length);
}

export function lessonsForWeekday(state, kid, wd) {
  const periods = kid.periods || [];
  return state.lessons
    .filter((l) => l.kidId === kid.id && l.weekday === wd && periods[l.period])
    .sort((a, b) => a.period - b.period)
    .map((l) => ({ ...l, start: periods[l.period].start, end: periods[l.period].end }));
}

/** Schultag eines Kindes: freier Tag, Stunden, Beginn und Schulschluss. */
export function schoolDay(state, kid, date) {
  const dayOff = kidDayOff(state, kid, date);
  const lessons = dayOff ? [] : lessonsForWeekday(state, kid, weekday(date));
  return {
    kid,
    date,
    dayOff,
    lessons,
    start: lessons[0]?.start || null,
    end: lessons.length ? lessons[lessons.length - 1].end : null,
  };
}

const byTime = (a, b) => (a.time || '').localeCompare(b.time || '');

/**
 * Alle Abholungen an `date`, auch entfallene.
 * status: 'active' | 'cancelled' (abgesagt) | 'dayoff' (freier Tag)
 */
export function pickupsOn(state, date) {
  const wd = weekday(date);
  const out = [];
  for (const p of state.pickups) {
    if (!p.weekdays?.includes(wd)) continue;
    if (p.validFrom && date < p.validFrom) continue;
    if (p.validUntil && date > p.validUntil) continue;
    const kid = byId(state.kids, p.kidId);
    if (!kid) continue;
    const override = byId(state.pickupOverrides, overrideId(p.id, date));
    const dayOff = p.skipOnDayOff !== false ? kidDayOff(state, kid, date) : null;
    const memberId = override && 'memberId' in override ? override.memberId : p.memberId;
    out.push({
      key: `p:${p.id}:${date}`,
      type: 'pickup',
      pickup: p,
      kid,
      date,
      time: override?.time || p.time,
      place: p.place || '',
      memberId: memberId || null,
      override,
      dayOff,
      status: override?.cancelled ? 'cancelled' : dayOff ? 'dayoff' : 'active',
    });
  }
  return out.sort(byTime);
}

/** Beginnt an `start` ein Vorkommen des (ggf. wiederholten) Termins? */
export function occursOn(state, ev, start) {
  if (start < ev.date) return false;
  if (ev.repeatUntil && start > ev.repeatUntil) return false;
  if (ev.exdates?.includes(start)) return false;
  const repeat = ev.repeat || 'none';
  let match = false;
  if (repeat === 'none') match = start === ev.date;
  else if (repeat === 'weekly') match = diffDays(ev.date, start) % 7 === 0;
  else if (repeat === 'biweekly') match = diffDays(ev.date, start) % 14 === 0;
  else if (repeat === 'monthly') match = start.slice(8) === ev.date.slice(8);
  else if (repeat === 'yearly') match = start.slice(5) === ev.date.slice(5);
  if (!match) return false;
  if (repeat !== 'none' && ev.skipSchoolHolidays && isGeneralDayOff(state, start)) return false;
  return true;
}

/** Termine, die `date` berühren (mehrtägige Termine an jedem ihrer Tage). */
export function eventsOn(state, date) {
  const out = [];
  for (const ev of state.events) {
    const span = ev.allDay && ev.endDate && ev.endDate > ev.date ? diffDays(ev.date, ev.endDate) : 0;
    for (let off = 0; off <= span; off++) {
      const start = off ? addDays(date, -off) : date;
      if (occursOn(state, ev, start)) {
        out.push({
          key: `e:${ev.id}:${start}`,
          type: 'event',
          event: ev,
          date: start,
          endDate: addDays(start, span),
          multiDay: span > 0,
          dayIndex: off,
          allDay: !!ev.allDay,
          time: ev.allDay ? '' : ev.start || '',
          end: ev.allDay ? '' : ev.end || '',
        });
        break;
      }
    }
  }
  return out.sort((a, b) => (a.allDay === b.allDay ? byTime(a, b) : a.allDay ? -1 : 1));
}

/** Termine ab `from` für die nächsten `days` Tage, jedes Vorkommen einmal. */
export function upcomingEvents(state, from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    for (const o of eventsOn(state, d)) {
      if (o.date === d || i === 0) out.push({ ...o, shownOn: d });
    }
  }
  return out;
}

export function memberName(state, id) {
  return byId(state.members, id)?.name || '';
}

function leadFor(state, pickup) {
  const lead = pickup.leadMinutes === undefined ? state.settings.defaultLeadMinutes : pickup.leadMinutes;
  return lead === null || lead === '' || Number.isNaN(Number(lead)) ? null : Number(lead);
}

/** Zeitpunkt, zu dem an einen Termin erinnert wird, oder null. */
export function eventReminderAt(occ) {
  const min = occ.event.reminderMinutes;
  if (min === null || min === undefined || min === '') return null;
  const base = occ.allDay ? dateTime(occ.date, '08:00') : dateTime(occ.date, occ.time || '08:00');
  return new Date(base.getTime() - Number(min) * 60000);
}

export function pickupReminderAt(state, occ) {
  const lead = leadFor(state, occ.pickup);
  if (lead === null) return null;
  return new Date(dateTime(occ.date, occ.time).getTime() - lead * 60000);
}

/** Betrifft eine Erinnerung die Person `meId`? Ohne Zuständigkeit: alle. */
function concerns(meId, memberId) {
  return !meId || !memberId || memberId === meId;
}

/**
 * Erinnerungen mit Zeitpunkt in (from, to] für die Person `meId`.
 * Abholungen: nur wer zuständig ist. Termine: wer begleitet, sonst alle.
 */
export function remindersBetween(state, meId, from, to) {
  const out = [];
  const lastDay = toISO(new Date(to.getTime() + 3 * 86400000));
  for (let d = toISO(from); d <= lastDay; d = addDays(d, 1)) {
    for (const p of pickupsOn(state, d)) {
      if (p.status !== 'active' || !concerns(meId, p.memberId)) continue;
      const at = pickupReminderAt(state, p);
      if (!at || at <= from || at > to) continue;
      out.push({
        key: p.key,
        at,
        kind: 'pickup',
        title: `${p.kid.name} abholen um ${p.time}`,
        body: [p.place, p.memberId ? `Zuständig: ${memberName(state, p.memberId)}` : ''].filter(Boolean).join(' · '),
        date: d,
      });
    }
    for (const e of eventsOn(state, d)) {
      if (e.date !== d || !concerns(meId, e.event.memberId)) continue;
      const at = eventReminderAt(e);
      if (!at || at <= from || at > to) continue;
      const kids = (e.event.kidIds || []).map((id) => byId(state.kids, id)?.name).filter(Boolean);
      out.push({
        key: e.key,
        at,
        kind: 'event',
        title: e.allDay ? e.event.title : `${e.time} ${e.event.title}`,
        body: [kids.join(', '), e.event.location].filter(Boolean).join(' · '),
        date: d,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
