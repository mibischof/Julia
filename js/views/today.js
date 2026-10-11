import { addDays, diffDays, fmt, pad, relativeDay, toISO, WEEKDAYS_LONG, weekday } from '../dates.js';
import { holidaysInRange } from '../holidays.js';
import { byId } from '../model.js';
import { remindersBetween, upcomingEvents } from '../schedule.js';
import { notificationSupport } from '../reminders.js';
import { openEventForm } from '../forms.js';
import { esc, ICONS } from '../ui.js';
import { renderDay } from './agenda.js';

/** "Herbstferien in 16 Tagen" bzw. "Herbstferien · noch 3 Tage" */
function holidayLine(state, today) {
  const ferien = holidaysInRange(state.settings.bundesland, today, addDays(today, 240)).filter((e) => e.kind === 'ferien');
  const current = ferien.find((e) => e.start <= today && e.end >= today);
  if (current) {
    const left = diffDays(today, current.end);
    return `${esc(current.title)} · ${left === 0 ? 'letzter Tag' : `noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`}`;
  }
  const next = ferien.find((e) => e.start > today);
  if (!next) return '';
  const days = diffDays(today, next.start);
  return `${esc(next.title)} ab ${esc(fmt.short(next.start))} · in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

function setupSteps(state, device) {
  const hasSchoolKid = state.kids.some((k) => k.type === 'schule');
  return [
    { done: state.members.length > 0, label: 'Erwachsene anlegen', hint: 'Wer holt die Kinder ab?', action: 'add-member' },
    { done: !!device.meId, label: 'Sag, wer du bist', hint: 'Dann erinnert dich die App nur an deine Abholungen.', action: 'choose-me' },
    { done: state.kids.length > 0, label: 'Kinder anlegen', hint: 'Schule oder Kindergarten, mit eigener Farbe.', action: 'add-kid' },
    { done: state.pickups.length > 0, label: 'Abholzeiten eintragen', hint: 'Welcher Tag, wann, wer.', action: 'add-pickup' },
    { done: state.lessons.length > 0 || (state.kids.length > 0 && !hasSchoolKid), label: 'Stundenplan eintragen', hint: 'Zeigt dir den Schulschluss.', action: 'go-timetable' },
    { done: device.notifications && notificationSupport() === 'granted', label: 'Erinnerungen erlauben', hint: 'Benachrichtigungen auf diesem Gerät.', action: 'enable-notifications' },
  ];
}

function renderSetup(state, device) {
  const steps = setupSteps(state, device);
  if (device.setupDismissed || steps.every((s) => s.done)) return '';
  const empty = !state.members.length && !state.kids.length;
  const firstOpen = steps.findIndex((s) => !s.done);
  return `<section class="card setup" aria-labelledby="setup-title">
    <div class="setup__head">
      <h2 id="setup-title">${empty ? 'Willkommen im Familienplaner' : 'Fast fertig eingerichtet'}</h2>
      <button type="button" class="link-btn" data-action="dismiss-setup">Ausblenden</button>
    </div>
    <ol class="setup__steps">
      ${steps
        .map(
          (s, i) => `<li class="${s.done ? 'is-done' : ''}${i === firstOpen ? ' is-next' : ''}">
            <span class="setup__n">${s.done ? ICONS.check : i + 1}</span>
            ${s.done ? `<span class="setup__label">${esc(s.label)}</span>` : `<button type="button" class="setup__btn" data-action="${s.action}"><span class="setup__label">${esc(s.label)}</span><small>${esc(s.hint)}</small></button>`}
          </li>`,
        )
        .join('')}
    </ol>
    ${empty ? `<button type="button" class="btn btn--ghost btn--block" data-action="load-demo">Mit Beispieldaten ausprobieren</button>` : ''}
  </section>`;
}

function renderNextReminder(state, device) {
  if (!state.pickups.length && !state.events.some((e) => e.reminderMinutes !== null && e.reminderMinutes !== undefined)) return '';
  const now = new Date();
  const next = remindersBetween(state, device.meId, now, new Date(now.getTime() + 7 * 86400000))[0];
  const support = notificationSupport();
  const enabled = device.notifications && support === 'granted';
  const when = next ? `${relativeDay(toISO(next.at), toISO(now))}, ${pad(next.at.getHours())}:${pad(next.at.getMinutes())}` : '';
  return `<div class="reminder-line${enabled ? '' : ' is-off'}">
    ${ICONS.bell}
    <span>${next ? `Nächste Erinnerung${device.meId ? ' für dich' : ''}: <strong>${esc(when)}</strong> · ${esc(next.title)}` : 'Keine Erinnerungen in den nächsten 7 Tagen.'}</span>
    ${enabled ? '' : `<button type="button" class="btn btn--small btn--soft" data-action="enable-notifications">Einschalten</button>`}
  </div>`;
}

function renderUpcoming(state, today) {
  const from = addDays(today, 2);
  const list = upcomingEvents(state, from, 14);
  if (!list.length) return '';
  return `<section class="section" aria-labelledby="soon-title">
    <div class="section-head"><h2 id="soon-title">Demnächst</h2></div>
    <ul class="soon">${list
      .map((o) => {
        const ev = o.event;
        const kids = (ev.kidIds || []).map((id) => byId(state.kids, id)).filter(Boolean);
        return `<li><button type="button" class="soon__btn" data-action="open-event" data-id="${esc(ev.id)}" data-date="${esc(o.date)}">
          <span class="soon__date"><b>${esc(fmt.short(o.shownOn).split(',')[0])}</b>${esc(fmt.short(o.shownOn).split(', ')[1])}</span>
          <span class="soon__main"><span class="soon__title">${kids.map((k) => `<i class="dot" style="--c:${esc(k.color)}"></i>`).join('')}${esc(ev.title)}</span>
          <span class="soon__meta">${o.allDay ? 'ganztägig' : esc(o.time)}${kids.length ? ` · ${esc(kids.map((k) => k.name).join(', '))}` : ''}</span></span>
        </button></li>`;
      })
      .join('')}</ul>
  </section>`;
}

export default {
  name: 'heute',
  title: 'Heute',
  fab: { label: 'Termin', run: (ctx) => openEventForm(null, { date: ctx.today }) },

  render({ state, device, today }) {
    const tomorrow = addDays(today, 1);
    const meId = device.meId;
    const me = byId(state.members, meId);
    const line = holidayLine(state, today);
    return `
      <section class="hero">
        <p class="hero__wd">${esc(WEEKDAYS_LONG[weekday(today) - 1])}${me ? ` · Hallo ${esc(me.name)}` : ''}</p>
        <h1 class="hero__date">${esc(fmt.full(today).split(', ')[1])}</h1>
        ${line ? `<p class="hero__ferien">${ICONS.sun}<span>${line}</span></p>` : ''}
      </section>
      ${renderSetup(state, device)}
      ${renderNextReminder(state, device)}
      <section class="section" aria-labelledby="today-title">
        <div class="section-head"><h2 id="today-title">Heute</h2></div>
        ${renderDay(state, today, { meId, emptyText: weekday(today) >= 6 ? 'Wochenende. Nichts eingetragen.' : 'Heute ist nichts eingetragen.' })}
      </section>
      <section class="section" aria-labelledby="tomorrow-title">
        <div class="section-head"><h2 id="tomorrow-title">Morgen <small>${esc(fmt.short(tomorrow))}</small></h2></div>
        ${renderDay(state, tomorrow, { meId, emptyText: 'Morgen ist nichts eingetragen.' })}
      </section>
      ${renderUpcoming(state, today)}`;
  },
};
