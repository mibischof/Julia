import { addDays, fmt, relativeDay, WEEKDAYS_LONG } from '../dates.js';
import { byId } from '../model.js';
import { pickupsOn } from '../schedule.js';
import { dot, openPickupForm } from '../forms.js';
import { esc, ICONS } from '../ui.js';
import { renderDay } from './agenda.js';

function leadText(state, p) {
  const lead = p.leadMinutes === undefined ? state.settings.defaultLeadMinutes : p.leadMinutes;
  if (lead === null || lead === '') return 'ohne Erinnerung';
  return Number(lead) === 0 ? 'Erinnerung zur Abholzeit' : `Erinnerung ${lead} Min. vorher`;
}

function renderWeekPlan(state, meId) {
  const days = [1, 2, 3, 4, 5, 6, 7]
    .map((wd) => ({ wd, rules: state.pickups.filter((p) => p.weekdays.includes(wd)).sort((a, b) => a.time.localeCompare(b.time)) }))
    .filter((d) => d.wd <= 5 || d.rules.length);
  return `<div class="week">${days
    .map(
      ({ wd, rules }) => `<div class="week__row">
        <span class="week__day">${esc(WEEKDAYS_LONG[wd - 1].slice(0, 2))}</span>
        <ul class="week__rules">${
          rules.length
            ? rules
                .map((p) => {
                  const kid = byId(state.kids, p.kidId);
                  const member = byId(state.members, p.memberId);
                  return `<li><button type="button" class="rule" data-action="edit-pickup" data-id="${esc(p.id)}" title="${esc(leadText(state, p))}">
                    <span class="rule__time">${esc(p.time)}</span>
                    <span class="rule__kid">${dot(kid?.color)}${esc(kid?.name || '?')}</span>
                    <span class="rule__who${member && member.id === meId ? ' is-mine' : ''}${member ? '' : ' is-open'}" style="--c:${esc(member?.color || 'var(--muted)')}">${member ? (member.id === meId ? 'Du' : esc(member.name)) : 'offen'}</span>
                  </button></li>`;
                })
                .join('')
            : `<li class="week__empty">–</li>`
        }</ul>
      </div>`,
    )
    .join('')}</div>`;
}

function renderStats(state, today) {
  const counts = new Map();
  for (let i = 0; i < 7; i++) {
    for (const p of pickupsOn(state, addDays(today, i))) {
      if (p.status !== 'active') continue;
      counts.set(p.memberId || '', (counts.get(p.memberId || '') || 0) + 1);
    }
  }
  if (!counts.size) return '';
  const parts = [...counts.entries()].map(([id, n]) => {
    const m = byId(state.members, id);
    return `<span class="stat">${dot(m?.color || 'var(--muted)')}${esc(m?.name || 'offen')} <b>${n}×</b></span>`;
  });
  return `<p class="stats"><span class="stats__label">Nächste 7 Tage</span>${parts.join('')}</p>`;
}

export default {
  name: 'abholen',
  title: 'Abholen',
  fab: { label: 'Abholzeit', run: () => openPickupForm() },

  render({ state, device, today }) {
    const meId = device.meId;
    const me = byId(state.members, meId);
    const head = `<header class="page-head"><h1 class="page-title">Abholen</h1></header>`;
    if (!state.kids.length) {
      return `${head}<div class="empty-state"><p>Lege zuerst ein Kind an. Danach trägst du hier ein, wer an welchem Tag wann abholt.</p>
        <button type="button" class="btn btn--primary" data-action="add-kid">${ICONS.plus}Kind hinzufügen</button></div>`;
    }
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      if (pickupsOn(state, date).length) days.push(date);
    }
    return `${head}
      <p class="me-line">${
        me
          ? `Erinnerungen auf diesem Gerät für <button type="button" class="who-btn" data-action="choose-me" aria-label="${esc(me.name)}, ändern">${dot(me.color)}${esc(me.name)}</button>`
          : `<button type="button" class="btn btn--small btn--soft" data-action="choose-me">Wer bist du?</button> Dann erinnert dich die App nur an deine Abholungen.`
      }</p>
      ${
        state.pickups.length
          ? `<section class="section" aria-labelledby="next-title">
          <div class="section-head"><h2 id="next-title">Die nächsten Tage</h2></div>
          ${renderStats(state, today)}
          ${days
            .map((d) => {
              const label = relativeDay(d, today);
              return `<h3 class="day-head">${esc(label)}${label === fmt.short(d) ? '' : ` <small>${esc(fmt.short(d))}</small>`}</h3>
                ${renderDay(state, d, { meId, types: ['pickup'], showOff: false })}`;
            })
            .join('')}
          <p class="hint">Tippe auf eine Abholung, um sie für einen Tag zu tauschen, die Zeit zu ändern oder abzusagen.</p>
        </section>`
          : ''
      }
      <section class="section" aria-labelledby="week-title">
        <div class="section-head"><h2 id="week-title">Wochenplan</h2>
          <button type="button" class="btn btn--small btn--soft" data-action="add-pickup">${ICONS.plus}Abholzeit</button></div>
        ${state.pickups.length ? renderWeekPlan(state, meId) : `<div class="empty-state"><p>Noch keine Abholzeiten. Trag ein, wer welches Kind an welchem Wochentag abholt.</p></div>`}
      </section>`;
  },

  onAction(action, el, ctx) {
    if (action === 'edit-pickup') openPickupForm(byId(ctx.state.pickups, el.dataset.id));
  },
};
