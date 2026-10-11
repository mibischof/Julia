// Tagesablauf: Schule, Abholungen und Termine eines Tages als Zeitleiste.
// Wird in "Heute" und im Kalender verwendet.

import { weekday } from '../dates.js';
import { byId } from '../model.js';
import { eventsOn, memberName, pickupsOn, schoolDay } from '../schedule.js';
import { esc, ICONS } from '../ui.js';
import { dot } from '../forms.js';

/** Alle Einträge eines Tages, nach Uhrzeit sortiert. */
export function dayItems(state, date) {
  const items = [];
  const off = [];
  const isWeekday = weekday(date) <= 5;
  for (const kid of state.kids) {
    const day = schoolDay(state, kid, date);
    if (day.dayOff && isWeekday) off.push({ kid, title: day.dayOff.title });
    if (day.lessons.length) {
      items.push({ type: 'school', time: day.start, end: day.end, kid, lessons: day.lessons });
    }
  }
  for (const p of pickupsOn(state, date)) items.push(p);
  for (const e of eventsOn(state, date)) items.push(e);
  items.sort((a, b) => {
    const ta = a.allDay ? '' : a.time || '';
    const tb = b.allDay ? '' : b.time || '';
    return ta.localeCompare(tb);
  });
  return { items, off };
}

function kidDots(state, ids) {
  return ids
    .map((id) => byId(state.kids, id))
    .filter(Boolean)
    .map((k) => dot(k.color))
    .join('');
}

function renderItem(state, item, meId) {
  if (item.type === 'school') {
    const subjects = [...new Set(item.lessons.map((l) => l.subject))].join(', ');
    return `<li class="item item--school" style="--kid:${esc(item.kid.color)}">
      <button type="button" class="item__btn" data-action="open-school" data-kid="${esc(item.kid.id)}">
        <span class="item__time">${esc(item.time)}<small>${esc(item.end)}</small></span>
        <span class="item__main">
          <span class="item__title">${esc(item.kid.name)} · ${item.lessons.length} ${item.lessons.length === 1 ? 'Stunde' : 'Stunden'}</span>
          <span class="item__meta">${esc(subjects)}</span>
        </span>
      </button>
    </li>`;
  }

  if (item.type === 'pickup') {
    const mine = meId && item.memberId === meId;
    const who = item.memberId ? memberName(state, item.memberId) : 'noch offen';
    const member = byId(state.members, item.memberId);
    const offText = item.status === 'dayoff' ? `Entfällt: ${item.dayOff.title}` : item.status === 'cancelled' ? 'Abgesagt' : '';
    const changed = item.override && item.status === 'active' ? '<span class="tag">geändert</span>' : '';
    return `<li class="item item--pickup${mine ? ' is-mine' : ''}${offText ? ' is-off' : ''}" style="--kid:${esc(item.kid.color)}">
      <button type="button" class="item__btn" data-action="open-pickup" data-id="${esc(item.pickup.id)}" data-date="${esc(item.date)}">
        <span class="item__time">${esc(item.time)}</span>
        <span class="item__main">
          <span class="item__title">${ICONS.pickup}${esc(item.kid.name)} abholen ${changed}</span>
          <span class="item__meta">${offText ? esc(offText) : `${item.place ? `${esc(item.place)} · ` : ''}<span class="who" style="--c:${esc(member?.color || 'var(--muted)')}">${mine ? 'Du' : esc(who)}</span>`}</span>
        </span>
      </button>
      ${
        item.status === 'active' && meId && !mine
          ? `<button type="button" class="btn btn--small btn--soft" data-action="take-pickup" data-id="${esc(item.pickup.id)}" data-date="${esc(item.date)}" aria-label="Übernehmen: ${esc(item.kid.name)} abholen um ${esc(item.time)}">${ICONS.swap}Übernehmen</button>`
          : ''
      }
    </li>`;
  }

  const ev = item.event;
  const member = byId(state.members, ev.memberId);
  const span = item.multiDay ? `Tag ${item.dayIndex + 1}` : '';
  const meta = [
    item.allDay ? (span || 'ganztägig') : item.end ? `bis ${item.end}` : '',
    ev.location,
    member ? (meId === member.id ? 'mit dir' : `mit ${member.name}`) : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  const color = byId(state.kids, ev.kidIds?.[0])?.color || 'var(--accent)';
  return `<li class="item item--event${item.allDay ? ' is-allday' : ''}" style="--kid:${esc(color)}">
    <button type="button" class="item__btn" data-action="open-event" data-id="${esc(ev.id)}" data-date="${esc(item.date)}">
      <span class="item__time">${item.allDay ? '<span class="item__allday">ganzt.</span>' : esc(item.time)}</span>
      <span class="item__main">
        <span class="item__title">${kidDots(state, ev.kidIds || [])}${esc(ev.title)}${ev.repeat && ev.repeat !== 'none' ? `<span class="item__repeat" title="Wiederholt sich">${ICONS.repeat}</span>` : ''}</span>
        ${meta ? `<span class="item__meta">${meta}</span>` : ''}
      </span>
    </button>
  </li>`;
}

/** HTML für einen Tag. Leere Tage zeigen `emptyText`. */
export function renderDay(state, date, { meId, emptyText = 'Nichts geplant.', types = null, showOff = true } = {}) {
  const day = dayItems(state, date);
  const items = types ? day.items.filter((i) => types.includes(i.type)) : day.items;
  const off = showOff ? day.off : [];
  const offHtml = off.length
    ? `<ul class="off-list">${off.map((o) => `<li class="off-chip" style="--kid:${esc(o.kid.color)}">${dot(o.kid.color)}${esc(o.kid.name)}: ${esc(o.title)}</li>`).join('')}</ul>`
    : '';
  if (!items.length) return `${offHtml}<p class="empty-line">${esc(emptyText)}</p>`;
  return `${offHtml}<ul class="agenda">${items.map((i) => renderItem(state, i, meId)).join('')}</ul>`;
}
