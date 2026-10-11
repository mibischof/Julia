// Kalenderdatei (.ics) mit Abholungen und Terminen inklusive Alarmen. Damit
// erinnert der Handy-Kalender auch dann, wenn die App geschlossen ist.

import { addDays, dateTime, pad, todayISO } from './dates.js';
import { byId } from './model.js';
import { eventsOn, memberName, pickupsOn } from './schedule.js';

function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const dateValue = (iso) => iso.replaceAll('-', '');

export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Zeilen über 75 Byte nach RFC 5545 umbrechen, ohne UTF-8-Zeichen zu zerteilen. */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // Folgezeilen beginnen mit einem Leerzeichen
    if (bytes + len > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function alarm(lines, trigger, description) {
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(description)}`, 'END:VALARM');
}

function minutesTrigger(minBefore) {
  if (minBefore === 0) return 'PT0M';
  return minBefore > 0 ? `-PT${minBefore}M` : `PT${-minBefore}M`;
}

/**
 * @param {object} state
 * @param {object} opts
 *   meId     – Person auf diesem Gerät
 *   pickups  – 'mine' | 'all' | 'none'
 *   from     – erster Tag (ISO), Standard heute
 *   days     – Anzahl Tage
 */
export function buildIcs(state, { meId = null, pickups = 'mine', from = todayISO(), days = 120, now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Familienplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Familienplaner',
  ];
  const stamp = utcStamp(now);
  const defaultLead = state.settings.defaultLeadMinutes;

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);

    if (pickups !== 'none') {
      for (const p of pickupsOn(state, day)) {
        if (p.status !== 'active') continue;
        if (pickups === 'mine' && meId && p.memberId && p.memberId !== meId) continue;
        const start = dateTime(day, p.time);
        const end = new Date(start.getTime() + 15 * 60000);
        const who = p.memberId ? memberName(state, p.memberId) : '';
        lines.push(
          'BEGIN:VEVENT',
          `UID:${p.key.replace(/:/g, '-')}@familienplaner`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${utcStamp(start)}`,
          `DTEND:${utcStamp(end)}`,
          `SUMMARY:${escapeText(`Abholen: ${p.kid.name}${pickups === 'all' && who ? ` (${who})` : ''}`)}`,
        );
        if (p.place) lines.push(`LOCATION:${escapeText(p.place)}`);
        if (who) lines.push(`DESCRIPTION:${escapeText(`Zuständig: ${who}`)}`);
        const lead = p.pickup.leadMinutes === undefined ? defaultLead : p.pickup.leadMinutes;
        if (lead !== null && lead !== '') alarm(lines, minutesTrigger(Number(lead)), `${p.kid.name} abholen um ${p.time}`);
        lines.push('END:VEVENT');
      }
    }

    for (const e of eventsOn(state, day)) {
      if (e.date !== day) continue;
      const ev = e.event;
      const kids = (ev.kidIds || []).map((id) => byId(state.kids, id)?.name).filter(Boolean);
      lines.push('BEGIN:VEVENT', `UID:${e.key.replace(/:/g, '-')}@familienplaner`, `DTSTAMP:${stamp}`);
      if (e.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${dateValue(day)}`, `DTEND;VALUE=DATE:${dateValue(addDays(e.endDate, 1))}`);
      } else {
        const start = dateTime(day, e.time || '08:00');
        const end = e.end && e.end > e.time ? dateTime(day, e.end) : new Date(start.getTime() + 60 * 60000);
        lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
      }
      lines.push(`SUMMARY:${escapeText(kids.length ? `${ev.title} (${kids.join(', ')})` : ev.title)}`);
      if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
      const desc = [ev.memberId ? `Begleitung: ${memberName(state, ev.memberId)}` : '', ev.note || ''].filter(Boolean).join('\n');
      if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
      const min = ev.reminderMinutes;
      if (min !== null && min !== undefined && min !== '') {
        // Ganztägig: Erinnerung relativ zu 8:00 Uhr am Tag
        alarm(lines, minutesTrigger(e.allDay ? Number(min) - 480 : Number(min)), ev.title);
      }
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
