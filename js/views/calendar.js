import { addDays, daysInMonth, fmt, isoFromParts, startOfWeek, WEEKDAYS_SHORT, weekday } from '../dates.js';
import { byId } from '../model.js';
import { dayOffEntries, eventsOn } from '../schedule.js';
import { openClosureForm, openEventForm } from '../forms.js';
import { esc, ICONS } from '../ui.js';
import { renderDay } from './agenda.js';

const view = { year: null, month: null, selected: null };

function ensure(today) {
  if (!view.selected) {
    view.selected = today;
    view.year = Number(today.slice(0, 4));
    view.month = Number(today.slice(5, 7));
  }
}

function shiftMonth(delta) {
  let m = view.month + delta;
  let y = view.year;
  if (m < 1) {
    m = 12;
    y--;
  }
  if (m > 12) {
    m = 1;
    y++;
  }
  view.year = y;
  view.month = m;
  const day = Math.min(Number(view.selected.slice(8)), daysInMonth(y, m));
  view.selected = isoFromParts(y, m, day);
}

function dayClasses(state, date, today) {
  const cls = ['day'];
  const entries = dayOffEntries(state, date);
  if (date.slice(0, 7) !== `${view.year}-${String(view.month).padStart(2, '0')}`) cls.push('is-other');
  if (weekday(date) >= 6) cls.push('is-weekend');
  if (entries.some((e) => e.kind === 'ferien')) cls.push('is-ferien');
  if (entries.some((e) => e.kind === 'feiertag')) cls.push('is-feiertag');
  else if (entries.some((e) => e.kind === 'schulfrei' || e.kind === 'closure')) cls.push('is-frei');
  if (date === today) cls.push('is-today');
  if (date === view.selected) cls.push('is-selected');
  return { cls: cls.join(' '), entries };
}

function renderMonth(state, today) {
  const first = isoFromParts(view.year, view.month, 1);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((weekday(first) - 1 + daysInMonth(view.year, view.month)) / 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(gridStart, i);
    const { cls, entries } = dayClasses(state, date, today);
    const events = eventsOn(state, date);
    const colors = events.slice(0, 4).map((o) => byId(state.kids, o.event.kidIds?.[0])?.color || 'var(--accent)');
    const label = [fmt.full(date), ...entries.map((e) => e.title), events.length ? `${events.length} ${events.length === 1 ? 'Termin' : 'Termine'}` : '']
      .filter(Boolean)
      .join(', ');
    cells.push(`<button type="button" class="${cls}" data-action="select" data-date="${date}" aria-label="${esc(label)}"${date === view.selected ? ' aria-pressed="true"' : ''}>
      <span class="day__n">${Number(date.slice(8))}</span>
      <span class="day__dots">${colors.map((c) => `<i class="dot" style="--c:${esc(c)}"></i>`).join('')}</span>
    </button>`);
  }
  return `<div class="month" data-swipe>
    ${WEEKDAYS_SHORT.map((d) => `<span class="month__wd" aria-hidden="true">${d}</span>`).join('')}
    ${cells.join('')}
  </div>`;
}

export default {
  name: 'kalender',
  title: 'Kalender',
  fab: { label: 'Termin', run: () => openEventForm(null, { date: view.selected }) },

  render({ state, device, today, route }) {
    ensure(today);
    if (route.param && /^\d{4}-\d{2}-\d{2}$/.test(route.param) && route.param !== view.selected) {
      view.selected = route.param;
      view.year = Number(route.param.slice(0, 4));
      view.month = Number(route.param.slice(5, 7));
    }
    const sel = view.selected;
    const entries = dayOffEntries(state, sel);
    return `
      <header class="page-head">
        <h1 class="page-title">${esc(fmt.monthYear(view.year, view.month))}</h1>
        <div class="page-head__actions">
          <button type="button" class="icon-btn" data-action="prev" aria-label="Voriger Monat">${ICONS.chevronLeft}</button>
          <button type="button" class="btn btn--small btn--ghost" data-action="today">Heute</button>
          <button type="button" class="icon-btn" data-action="next" aria-label="Nächster Monat">${ICONS.chevronRight}</button>
        </div>
      </header>
      ${renderMonth(state, today)}
      <p class="legend"><span class="legend__item legend__item--ferien">Ferien</span><span class="legend__item legend__item--feiertag">Feiertag</span><span class="legend__item legend__item--frei">schulfrei / freier Tag</span></p>
      <section class="section" aria-labelledby="sel-title">
        <div class="section-head">
          <h2 id="sel-title">${esc(fmt.full(sel))}</h2>
          <button type="button" class="btn btn--small btn--soft" data-action="add-event">${ICONS.plus}Termin</button>
        </div>
        ${entries.length ? `<ul class="holiday-list">${entries.map((e) => `<li class="holiday holiday--${e.kind}">${esc(e.title)}${e.kind === 'closure' && e.kidIds?.length ? ` · ${esc(e.kidIds.map((id) => byId(state.kids, id)?.name).filter(Boolean).join(', '))}` : ''}${e.kind === 'closure' ? ` <button type="button" class="link-btn" data-action="edit-closure" data-id="${esc(e.id)}">bearbeiten</button>` : ''}</li>`).join('')}</ul>` : ''}
        ${renderDay(state, sel, { meId: device.meId })}
        <button type="button" class="link-btn link-btn--muted" data-action="add-closure">Freien Tag eintragen (z. B. schulautonom)</button>
      </section>`;
  },

  mount(root, ctx) {
    const grid = root.querySelector('[data-swipe]');
    if (!grid) return;
    let x0 = null;
    let y0 = null;
    grid.addEventListener('touchstart', (e) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        shiftMonth(dx < 0 ? 1 : -1);
        ctx.rerender();
      }
    }, { passive: true });
  },

  onAction(action, el, ctx) {
    if (action === 'prev' || action === 'next') {
      shiftMonth(action === 'next' ? 1 : -1);
      ctx.rerender();
    } else if (action === 'today') {
      view.selected = null;
      ensure(ctx.today);
      ctx.rerender();
    } else if (action === 'select') {
      const date = el.dataset.date;
      view.selected = date;
      view.year = Number(date.slice(0, 4));
      view.month = Number(date.slice(5, 7));
      ctx.rerender();
      document.getElementById('sel-title')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (action === 'add-event') {
      openEventForm(null, { date: view.selected });
    } else if (action === 'add-closure') {
      openClosureForm(null, { date: view.selected });
    } else if (action === 'edit-closure') {
      openClosureForm(byId(ctx.state.closures, el.dataset.id));
    }
  },
};
