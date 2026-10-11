// Eingabeformulare (als Bottom-Sheets) für Personen, Kinder, Abholzeiten,
// Termine, Stundenplan und freie Tage.

import { addMinutesToTime, fmt, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './dates.js';
import { byId, COLORS, DEFAULT_PERIODS, KID_TYPES, overrideId, REPEAT_LABELS } from './model.js';
import { lessonsForWeekday } from './schedule.js';
import { getDevice, getState, mutate, remove, setDevice, upsert } from './store.js';
import { choose, confirmAction, esc, openSheet, toast } from './ui.js';

// ---------- Bausteine ----------

export const dot = (color) => `<i class="dot" style="--c:${esc(color || 'var(--accent)')}"></i>`;

const field = (label, control, hint = '') =>
  `<label class="field"><span class="field__label">${esc(label)}</span>${control}${hint ? `<span class="field__hint">${hint}</span>` : ''}</label>`;

const group = (label, content, hint = '') =>
  `<fieldset class="field"><legend class="field__label">${esc(label)}</legend>${content}${hint ? `<span class="field__hint">${hint}</span>` : ''}</fieldset>`;

const chip = (type, name, value, label, checked, color) =>
  `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${color ? dot(color) : ''}${esc(label)}</span></label>`;

const colorPicker = (selected) =>
  `<div class="swatches">${COLORS.map(
    (c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}"${c === selected ? ' checked' : ''} aria-label="Farbe ${c}"><span></span></label>`,
  ).join('')}</div>`;

const select = (name, options, selected, attrs = '') =>
  `<select name="${name}" id="f-${name}" ${attrs}>${options
    .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;

const memberChips = (name, selected, { allowNone = true, noneLabel = 'Noch offen' } = {}) => {
  const { members } = getState();
  return `<div class="chips">${members.map((m) => chip('radio', name, m.id, m.name, m.id === selected, m.color)).join('')}${
    allowNone ? chip('radio', name, '', noneLabel, !selected) : ''
  }</div>`;
};

const kidChips = (type, name, selectedIds) => {
  const { kids } = getState();
  return `<div class="chips">${kids.map((k) => chip(type, name, k.id, k.name, selectedIds.includes(k.id), k.color)).join('')}</div>`;
};

const weekdayChips = (name, selected, days = [1, 2, 3, 4, 5, 6, 7]) =>
  `<div class="chips chips--days">${days.map((d) => chip('checkbox', name, d, WEEKDAYS_SHORT[d - 1], selected.includes(d))).join('')}</div>`;

const val = (form, name) => (form.elements[name]?.value ?? '').trim();
const radio = (form, name) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
const checked = (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
const isOn = (form, name) => !!form.elements[name]?.checked;

function showError(form, message) {
  let el = form.querySelector('.form-error');
  if (!el) {
    el = document.createElement('p');
    el.className = 'form-error';
    el.setAttribute('role', 'alert');
    form.querySelector('.sheet__body').prepend(el);
  }
  el.textContent = message;
  el.scrollIntoView({ block: 'nearest' });
  return false;
}

function nextFreeColor(list) {
  const used = new Set(list.map((x) => x.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[list.length % COLORS.length];
}

const LEAD_OPTIONS = [
  ['', 'Keine Erinnerung'],
  ['0', 'Zur Abholzeit'],
  ['5', '5 Min. vorher'],
  ['10', '10 Min. vorher'],
  ['15', '15 Min. vorher'],
  ['20', '20 Min. vorher'],
  ['30', '30 Min. vorher'],
  ['45', '45 Min. vorher'],
  ['60', '1 Std. vorher'],
];

const EVENT_REMINDER_OPTIONS = [
  ['', 'Keine'],
  ['0', 'Zum Beginn'],
  ['10', '10 Min. vorher'],
  ['30', '30 Min. vorher'],
  ['60', '1 Std. vorher'],
  ['120', '2 Std. vorher'],
  ['1440', '1 Tag vorher'],
  ['2880', '2 Tage vorher'],
];

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// ---------- Personen ----------

export function openMemberForm(member = null) {
  const state = getState();
  const isNew = !member;
  const m = member || { name: '', color: nextFreeColor(state.members) };
  openSheet({
    title: isNew ? 'Person hinzufügen' : 'Person bearbeiten',
    body: `
      ${field('Name', `<input name="name" id="f-name" required maxlength="40" value="${esc(m.name)}" placeholder="z. B. Mama, Papa, Oma" autocomplete="off"${isNew ? ' autofocus' : ''}>`)}
      ${group('Farbe', colorPicker(m.color))}
      ${
        isNew && !getDevice().meId
          ? `<label class="check"><input type="checkbox" name="isMe" id="f-isMe" checked><span>Das bin ich (auf diesem Gerät)</span></label>`
          : ''
      }`,
    actions: isNew ? [] : [{ id: 'delete', label: 'Löschen', kind: 'danger' }],
    onSubmit(form) {
      const saved = upsert('members', { ...m, name: val(form, 'name'), color: radio(form, 'color') || m.color });
      if (isOn(form, 'isMe')) setDevice({ meId: saved.id });
      toast(isNew ? `${saved.name} hinzugefügt` : 'Gespeichert');
    },
    async onAction(id, _form, close) {
      if (id !== 'delete') return;
      const ok = await confirmAction({
        title: `${m.name} löschen?`,
        message: 'Abholungen, für die diese Person zuständig war, sind danach „noch offen“.',
      });
      if (!ok) return;
      mutate(({ upsert: put, remove: del }) => {
        for (const p of getState().pickups) if (p.memberId === m.id) put('pickups', { ...p, memberId: null });
        for (const o of getState().pickupOverrides) if (o.memberId === m.id) del('pickupOverrides', o.id);
        for (const e of getState().events) if (e.memberId === m.id) put('events', { ...e, memberId: null });
        del('members', m.id);
      });
      if (getDevice().meId === m.id) setDevice({ meId: null });
      close();
      toast(`${m.name} gelöscht`);
    },
  });
}

export function openMeSheet() {
  const { members } = getState();
  if (!members.length) {
    openMemberForm();
    return;
  }
  openSheet({
    title: 'Wer nutzt dieses Gerät?',
    body: `<p class="sheet__message">Erinnerungen an Abholungen bekommst du nur, wenn du zuständig bist.</p>
      ${memberChips('me', getDevice().meId, { allowNone: false })}`,
    submitLabel: 'Übernehmen',
    onSubmit(form) {
      const me = radio(form, 'me');
      if (!me) return showError(form, 'Bitte eine Person wählen.');
      setDevice({ meId: me });
      toast(`Hallo ${byId(getState().members, me)?.name}!`);
    },
  });
}

// ---------- Kinder ----------

export function openKidForm(kid = null) {
  const state = getState();
  const isNew = !kid;
  const k = kid || { name: '', color: nextFreeColor(state.kids), type: 'schule', institution: '', className: '', followsSchoolHolidays: true };
  openSheet({
    title: isNew ? 'Kind hinzufügen' : `${k.name} bearbeiten`,
    body: `
      ${field('Name', `<input name="name" id="f-name" required maxlength="40" value="${esc(k.name)}" autocomplete="off"${isNew ? ' autofocus' : ''}>`)}
      ${group('Farbe', colorPicker(k.color))}
      ${group('Geht in', `<div class="chips">${Object.entries(KID_TYPES).map(([v, l]) => chip('radio', 'type', v, l, k.type === v)).join('')}</div>`)}
      <div class="field-row">
        ${field('Einrichtung', `<input name="institution" id="f-institution" maxlength="60" value="${esc(k.institution)}" placeholder="z. B. VS Lind">`)}
        ${field('Klasse/Gruppe', `<input name="className" id="f-className" maxlength="20" value="${esc(k.className)}" placeholder="z. B. 2b">`)}
      </div>
      <label class="check"><input type="checkbox" name="followsSchoolHolidays" id="f-follows"${k.followsSchoolHolidays ? ' checked' : ''}>
        <span>Schulferien gelten<small>An Ferien- und schulfreien Tagen entfallen Unterricht und Abholungen. Gesetzliche Feiertage gelten immer.</small></span></label>`,
    actions: isNew ? [] : [{ id: 'delete', label: 'Löschen', kind: 'danger' }],
    onMount(form) {
      let touched = false;
      form.elements.followsSchoolHolidays.addEventListener('change', () => (touched = true));
      form.addEventListener('change', (e) => {
        if (e.target.name === 'type' && !touched) {
          form.elements.followsSchoolHolidays.checked = e.target.value === 'schule' || e.target.value === 'hort';
        }
      });
    },
    onSubmit(form) {
      const saved = upsert('kids', {
        ...k,
        periods: k.periods || DEFAULT_PERIODS,
        name: val(form, 'name'),
        color: radio(form, 'color') || k.color,
        type: radio(form, 'type') || 'schule',
        institution: val(form, 'institution'),
        className: val(form, 'className'),
        followsSchoolHolidays: isOn(form, 'followsSchoolHolidays'),
      });
      toast(isNew ? `${saved.name} hinzugefügt` : 'Gespeichert');
    },
    async onAction(id, _form, close) {
      if (id !== 'delete') return;
      const ok = await confirmAction({
        title: `${k.name} löschen?`,
        message: 'Stundenplan, Foto und Abholzeiten dieses Kindes werden ebenfalls gelöscht. Termine bleiben erhalten.',
      });
      if (!ok) return;
      mutate(({ upsert: put, remove: del }) => {
        const s = getState();
        for (const l of s.lessons) if (l.kidId === k.id) del('lessons', l.id);
        for (const ph of s.photos || []) if (ph.kidId === k.id) del('photos', ph.id);
        for (const p of s.pickups) {
          if (p.kidId !== k.id) continue;
          for (const o of s.pickupOverrides) if (o.pickupId === p.id) del('pickupOverrides', o.id);
          del('pickups', p.id);
        }
        for (const e of s.events) if (e.kidIds?.includes(k.id)) put('events', { ...e, kidIds: e.kidIds.filter((x) => x !== k.id) });
        for (const c of s.closures) if (c.kidIds?.includes(k.id)) put('closures', { ...c, kidIds: c.kidIds.filter((x) => x !== k.id) });
        del('kids', k.id);
      });
      close();
      toast(`${k.name} gelöscht`);
    },
  });
}

// ---------- Abholzeiten ----------

function schoolEndHint(kid, days) {
  if (!kid) return '';
  const state = getState();
  const ends = days
    .map((d) => {
      const lessons = lessonsForWeekday(state, kid, d);
      return lessons.length ? `${WEEKDAYS_SHORT[d - 1]} ${lessons[lessons.length - 1].end}` : null;
    })
    .filter(Boolean);
  return ends.length ? `Schulschluss laut Stundenplan: ${ends.join(' · ')}` : '';
}

export function openPickupForm(pickup = null, defaults = {}) {
  const state = getState();
  const isNew = !pickup;
  const firstKid = state.kids[0];
  const p = pickup || {
    kidId: defaults.kidId || firstKid?.id || '',
    weekdays: defaults.weekday ? [defaults.weekday] : [1, 2, 3, 4, 5],
    time: '12:00',
    place: (byId(state.kids, defaults.kidId) || firstKid)?.institution || '',
    memberId: getDevice().meId || null,
    leadMinutes: state.settings.defaultLeadMinutes,
    skipOnDayOff: true,
    note: '',
  };
  if (!state.kids.length) {
    toast('Lege zuerst ein Kind an.');
    openKidForm();
    return;
  }
  const places = [...new Set([...state.kids.map((k) => k.institution), ...state.pickups.map((x) => x.place)].filter(Boolean))];
  openSheet({
    title: isNew ? 'Abholzeit hinzufügen' : 'Abholzeit bearbeiten',
    body: `
      ${group('Kind', kidChips('radio', 'kidId', [p.kidId]))}
      ${group('An diesen Tagen', weekdayChips('weekdays', p.weekdays))}
      <div class="field-row">
        ${field('Uhrzeit', `<input type="time" name="time" id="f-time" required value="${esc(p.time)}">`)}
        ${field('Erinnerung', select('leadMinutes', LEAD_OPTIONS, p.leadMinutes ?? ''))}
      </div>
      <p class="field__hint" data-school-end></p>
      ${field('Ort', `<input name="place" id="f-place" maxlength="60" value="${esc(p.place)}" list="dl-places" placeholder="z. B. Volksschule, Musikschule"><datalist id="dl-places">${places.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`)}
      ${group('Wer holt ab?', memberChips('memberId', p.memberId), 'Nur diese Person bekommt die Erinnerung. Einzelne Tage tauschst du direkt in der Übersicht.')}
      <label class="check"><input type="checkbox" name="skipOnDayOff" id="f-skip"${p.skipOnDayOff !== false ? ' checked' : ''}>
        <span>Entfällt an freien Tagen<small>Ferien, Feiertage und eingetragene freie Tage des Kindes</small></span></label>
      ${field('Notiz', `<input name="note" id="f-note" maxlength="120" value="${esc(p.note)}" placeholder="z. B. Turnsackerl mitnehmen">`)}`,
    actions: isNew ? [] : [{ id: 'delete', label: 'Löschen', kind: 'danger' }],
    onMount(form) {
      const hint = form.querySelector('[data-school-end]');
      const update = () => {
        const kid = byId(getState().kids, radio(form, 'kidId'));
        const text = schoolEndHint(kid, checked(form, 'weekdays').map(Number));
        hint.innerHTML = text ? `${esc(text)} <button type="button" class="link-btn" data-take-end>übernehmen</button>` : '';
        hint.hidden = !text;
      };
      update();
      form.addEventListener('change', (e) => {
        if (e.target.name === 'kidId' && isNew) {
          const kid = byId(getState().kids, e.target.value);
          if (kid?.institution && (!form.elements.place.value || places.includes(form.elements.place.value))) form.elements.place.value = kid.institution;
        }
        if (e.target.name === 'kidId' || e.target.name === 'weekdays') update();
      });
      hint.addEventListener('click', (e) => {
        if (!e.target.closest('[data-take-end]')) return;
        const kid = byId(getState().kids, radio(form, 'kidId'));
        const days = checked(form, 'weekdays').map(Number);
        const lessons = days.map((d) => lessonsForWeekday(getState(), kid, d)).find((l) => l.length);
        if (lessons) form.elements.time.value = lessons[lessons.length - 1].end;
      });
    },
    onSubmit(form) {
      const kidId = radio(form, 'kidId');
      const weekdays = checked(form, 'weekdays').map(Number).sort();
      if (!kidId) return showError(form, 'Bitte ein Kind wählen.');
      if (!weekdays.length) return showError(form, 'Bitte mindestens einen Wochentag wählen.');
      upsert('pickups', {
        ...p,
        kidId,
        weekdays,
        time: val(form, 'time'),
        place: val(form, 'place'),
        memberId: radio(form, 'memberId') || null,
        leadMinutes: numOrNull(val(form, 'leadMinutes')),
        skipOnDayOff: isOn(form, 'skipOnDayOff'),
        note: val(form, 'note'),
      });
      toast('Abholzeit gespeichert');
    },
    async onAction(id, _form, close) {
      if (id !== 'delete') return;
      const ok = await confirmAction({ title: 'Abholzeit löschen?', message: 'Die Regel und alle Änderungen an einzelnen Tagen werden gelöscht.' });
      if (!ok) return;
      mutate(({ remove: del }) => {
        for (const o of getState().pickupOverrides) if (o.pickupId === p.id) del('pickupOverrides', o.id);
        del('pickups', p.id);
      });
      close();
      toast('Abholzeit gelöscht');
    },
  });
}

/** Eine Abholung an einem bestimmten Tag ändern: tauschen, Zeit, absagen. */
export function openPickupDay(occ) {
  const state = getState();
  const p = occ.pickup;
  const ov = occ.override;
  const ruleWho = byId(state.members, p.memberId)?.name || 'noch offen';
  openSheet({
    title: `${occ.kid.name} abholen`,
    body: `
      <p class="sheet__message"><strong>${esc(fmt.full(occ.date))}</strong><br>
        Normalerweise ${esc(p.weekdays.map((d) => WEEKDAYS_SHORT[d - 1]).join(', '))} um ${esc(p.time)} · ${esc(ruleWho)}</p>
      ${occ.dayOff ? `<p class="notice notice--off">${esc(occ.dayOff.title)}: Diese Abholung entfällt automatisch.</p>` : ''}
      ${group('Wer holt an diesem Tag ab?', memberChips('memberId', occ.memberId))}
      ${field('Uhrzeit an diesem Tag', `<input type="time" name="time" id="f-time" required value="${esc(occ.time)}">`)}
      <label class="check"><input type="checkbox" name="cancelled" id="f-cancelled"${ov?.cancelled ? ' checked' : ''}><span>An diesem Tag nicht abholen</span></label>`,
    actions: [
      ...(ov ? [{ id: 'reset', label: 'Wie üblich', kind: 'ghost' }] : []),
      { id: 'rule', label: 'Regel bearbeiten', kind: 'ghost' },
    ],
    onSubmit(form) {
      const memberId = radio(form, 'memberId') || null;
      const time = val(form, 'time');
      const cancelled = isOn(form, 'cancelled');
      const id = overrideId(p.id, occ.date);
      if (!cancelled && time === p.time && memberId === (p.memberId || null)) {
        if (ov) remove('pickupOverrides', id);
      } else {
        const next = { id, pickupId: p.id, date: occ.date };
        if (memberId !== (p.memberId || null)) next.memberId = memberId;
        if (time !== p.time) next.time = time;
        if (cancelled) next.cancelled = true;
        upsert('pickupOverrides', next);
      }
      toast('Für diesen Tag gespeichert');
    },
    onAction(id, _form, close) {
      if (id === 'reset') {
        remove('pickupOverrides', overrideId(p.id, occ.date));
        close();
        toast('Zurückgesetzt');
      }
      if (id === 'rule') {
        close();
        openPickupForm(p);
      }
    },
  });
}

/** „Ich übernehme“: Abholung an einem Tag der Person auf diesem Gerät zuteilen. */
export function takeOverPickup(occ) {
  const meId = getDevice().meId;
  if (!meId) {
    openMeSheet();
    return;
  }
  const p = occ.pickup;
  const id = overrideId(p.id, occ.date);
  const base = occ.override ? { ...occ.override } : { id, pickupId: p.id, date: occ.date };
  if (meId === p.memberId && !base.time && !base.cancelled) {
    remove('pickupOverrides', id);
  } else {
    base.memberId = meId;
    upsert('pickupOverrides', base);
  }
  toast(`Du holst ${occ.kid.name} ${fmt.short(occ.date)} ab`);
}

// ---------- Termine ----------

const EVENT_SUGGESTIONS = ['Kinderarzt', 'Zahnarzt', 'Kindergeburtstag', 'Training', 'Musikschule', 'Elternabend', 'Elternsprechtag', 'Schulausflug', 'Schularbeit', 'Turnen', 'Schwimmkurs'];

export function openEventForm(event = null, { date, kidIds = [], occDate = null } = {}) {
  const state = getState();
  const isNew = !event;
  const e = event || {
    title: '',
    kidIds,
    date,
    endDate: '',
    allDay: false,
    start: '15:00',
    end: '16:00',
    location: '',
    memberId: null,
    reminderMinutes: 60,
    repeat: 'none',
    repeatUntil: '',
    skipSchoolHolidays: false,
    note: '',
    exdates: [],
  };
  const titles = [...new Set([...EVENT_SUGGESTIONS, ...state.events.map((x) => x.title)])];
  openSheet({
    title: isNew ? 'Neuer Termin' : 'Termin bearbeiten',
    body: `
      ${field('Was?', `<input name="title" id="f-title" required maxlength="80" value="${esc(e.title)}" list="dl-titles" autocomplete="off"${isNew ? ' autofocus' : ''}><datalist id="dl-titles">${titles.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>`)}
      ${state.kids.length ? group('Für', kidChips('checkbox', 'kidIds', e.kidIds || [])) : ''}
      <label class="check"><input type="checkbox" name="allDay" id="f-allDay"${e.allDay ? ' checked' : ''}><span>Ganztägig</span></label>
      <div class="field-row">
        ${field('Datum', `<input type="date" name="date" id="f-date" required value="${esc(e.date)}">`)}
        <div data-when="allday">${field('Bis (optional)', `<input type="date" name="endDate" id="f-endDate" value="${esc(e.endDate || '')}">`)}</div>
      </div>
      <div class="field-row" data-when="timed">
        ${field('Von', `<input type="time" name="start" id="f-start" value="${esc(e.start || '')}">`)}
        ${field('Bis', `<input type="time" name="end" id="f-end" value="${esc(e.end || '')}">`)}
      </div>
      ${field('Ort', `<input name="location" id="f-location" maxlength="80" value="${esc(e.location)}">`)}
      ${state.members.length ? group('Wer begleitet?', memberChips('memberId', e.memberId, { noneLabel: 'Egal / alle' }), 'Bekommt die Erinnerung. Bei „Egal / alle“ werden alle erinnert.') : ''}
      <div class="field-row">
        ${field('Erinnerung', select('reminderMinutes', EVENT_REMINDER_OPTIONS, e.reminderMinutes ?? ''), '<span data-when="allday">Ganztägig: ausgehend von 8:00 Uhr</span>')}
        ${field('Wiederholen', select('repeat', Object.entries(REPEAT_LABELS), e.repeat || 'none'))}
      </div>
      <div data-when="repeat" class="stack">
        ${field('Wiederholen bis (optional)', `<input type="date" name="repeatUntil" id="f-repeatUntil" value="${esc(e.repeatUntil || '')}">`)}
        <label class="check"><input type="checkbox" name="skipSchoolHolidays" id="f-skipHol"${e.skipSchoolHolidays ? ' checked' : ''}><span>Entfällt in den Ferien und an Feiertagen</span></label>
      </div>
      ${field('Notiz', `<textarea name="note" id="f-note" rows="2" maxlength="500">${esc(e.note || '')}</textarea>`)}`,
    actions: isNew ? [] : [{ id: 'delete', label: 'Löschen', kind: 'danger' }],
    onMount(form) {
      const sync = () => {
        const allDay = form.elements.allDay.checked;
        const repeat = form.elements.repeat.value !== 'none';
        form.querySelectorAll('[data-when="allday"]').forEach((el) => (el.hidden = !allDay));
        form.querySelectorAll('[data-when="timed"]').forEach((el) => (el.hidden = allDay));
        form.querySelectorAll('[data-when="repeat"]').forEach((el) => (el.hidden = !repeat));
      };
      sync();
      form.addEventListener('change', (ev) => {
        sync();
        // Endzeit mitschieben, wenn die Startzeit geändert wird
        if (ev.target.name === 'start' && form.elements.start.value) {
          const end = form.elements.end.value;
          if (!end || end <= form.elements.start.value) form.elements.end.value = addMinutesToTime(form.elements.start.value, 60);
        }
      });
    },
    onSubmit(form) {
      const allDay = isOn(form, 'allDay');
      const dateValue = val(form, 'date');
      const endDate = allDay ? val(form, 'endDate') : '';
      if (endDate && endDate < dateValue) return showError(form, 'Das Ende liegt vor dem Beginn.');
      const start = val(form, 'start');
      const end = val(form, 'end');
      if (!allDay && !start) return showError(form, 'Bitte eine Uhrzeit angeben oder „Ganztägig“ wählen.');
      if (!allDay && end && end < start) return showError(form, 'Die Endzeit liegt vor der Startzeit.');
      const repeat = val(form, 'repeat') || 'none';
      upsert('events', {
        ...e,
        title: val(form, 'title'),
        kidIds: checked(form, 'kidIds'),
        allDay,
        date: dateValue,
        endDate: endDate && endDate > dateValue ? endDate : '',
        start: allDay ? '' : start,
        end: allDay ? '' : end,
        location: val(form, 'location'),
        memberId: radio(form, 'memberId') || null,
        reminderMinutes: numOrNull(val(form, 'reminderMinutes')),
        repeat,
        repeatUntil: repeat === 'none' ? '' : val(form, 'repeatUntil'),
        skipSchoolHolidays: repeat !== 'none' && isOn(form, 'skipSchoolHolidays'),
        note: val(form, 'note'),
        exdates: e.exdates || [],
      });
      toast('Termin gespeichert');
    },
    async onAction(id, _form, close) {
      if (id !== 'delete') return;
      if (e.repeat && e.repeat !== 'none' && occDate) {
        const answer = await choose({
          title: 'Wiederholten Termin löschen',
          message: `${e.title} am ${fmt.short(occDate)}`,
          options: [
            { id: 'one', label: 'Nur diesen Termin', kind: 'danger' },
            { id: 'all', label: 'Alle Termine der Serie', kind: 'danger' },
            { id: 'no', label: 'Abbrechen', kind: 'ghost' },
          ],
        });
        if (answer === 'one') upsert('events', { ...e, exdates: [...(e.exdates || []), occDate] });
        if (answer === 'all') remove('events', e.id);
        if (answer === 'one' || answer === 'all') {
          close();
          toast('Gelöscht');
        }
        return;
      }
      const ok = await confirmAction({ title: 'Termin löschen?', message: e.title });
      if (!ok) return;
      remove('events', e.id);
      close();
      toast('Termin gelöscht');
    },
  });
}

// ---------- Stundenplan ----------

const SUBJECTS = ['Deutsch', 'Mathematik', 'Sachunterricht', 'Englisch', 'Bewegung und Sport', 'Musik', 'Kunst und Gestaltung', 'Technik und Design', 'Religion', 'Ethik', 'Lesen', 'Biologie', 'Geografie', 'Geschichte', 'Physik', 'Informatik'];

export function openLessonForm(kid, wd, period) {
  const state = getState();
  const lesson = state.lessons.find((l) => l.kidId === kid.id && l.weekday === wd && l.period === period);
  const p = kid.periods[period];
  const l = lesson || { kidId: kid.id, weekday: wd, period, subject: '', room: '', note: '' };
  const subjects = [...new Set([...state.lessons.filter((x) => x.kidId === kid.id).map((x) => x.subject), ...SUBJECTS])];
  const otherDays = [1, 2, 3, 4, 5].filter((d) => d !== wd);
  openSheet({
    title: `${WEEKDAYS_LONG[wd - 1]}, ${period + 1}. Stunde`,
    body: `
      <p class="sheet__message">${esc(kid.name)} · ${esc(p.start)}–${esc(p.end)}</p>
      ${field('Fach', `<input name="subject" id="f-subject" required maxlength="40" value="${esc(l.subject)}" list="dl-subjects" autocomplete="off" autofocus><datalist id="dl-subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`)}
      <div class="field-row">
        ${field('Kürzel', `<input name="short" id="f-short" maxlength="7" value="${esc(l.short || '')}" placeholder="automatisch">`, 'Für schmale Bildschirme')}
        ${field('Raum', `<input name="room" id="f-room" maxlength="20" value="${esc(l.room)}">`)}
      </div>
      ${field('Notiz', `<input name="note" id="f-note" maxlength="60" value="${esc(l.note)}" placeholder="z. B. Turnsackerl">`)}
      ${group('Gleiche Stunde auch eintragen am', weekdayChips('copyDays', [], otherDays))}`,
    actions: lesson ? [{ id: 'delete', label: 'Stunde leeren', kind: 'danger' }] : [],
    onSubmit(form) {
      const data = { subject: val(form, 'subject'), short: val(form, 'short'), room: val(form, 'room'), note: val(form, 'note') };
      const copyDays = checked(form, 'copyDays').map(Number);
      mutate(({ upsert: put }) => {
        put('lessons', { ...l, ...data });
        for (const d of copyDays) {
          const existing = getState().lessons.find((x) => x.kidId === kid.id && x.weekday === d && x.period === period);
          put('lessons', { ...(existing || { kidId: kid.id, weekday: d, period }), ...data });
        }
      });
    },
    onAction(id, _form, close) {
      if (id === 'delete') {
        remove('lessons', lesson.id);
        close();
      }
    },
  });
}

function periodRow(i, p) {
  return `<div class="period-row" data-period-row>
    <span class="period-row__n">${i + 1}.</span>
    <input type="time" name="pstart" aria-label="${i + 1}. Stunde Beginn" required value="${esc(p.start)}">
    <span aria-hidden="true">–</span>
    <input type="time" name="pend" aria-label="${i + 1}. Stunde Ende" required value="${esc(p.end)}">
  </div>`;
}

export function openPeriodsForm(kid) {
  const periods = kid.periods?.length ? kid.periods : DEFAULT_PERIODS;
  openSheet({
    title: 'Stundenraster',
    body: `
      <p class="sheet__message">Beginn und Ende jeder Unterrichtsstunde von ${esc(kid.name)}. Nachmittagsbetreuung kannst du als eigene Stunden anhängen.</p>
      <div class="period-list" data-period-list>${periods.map((p, i) => periodRow(i, p)).join('')}</div>
      <div class="row-actions">
        <button type="button" class="btn btn--ghost" data-add-period>+ Stunde</button>
        <button type="button" class="btn btn--ghost" data-remove-period>Letzte entfernen</button>
      </div>`,
    onMount(form) {
      const list = form.querySelector('[data-period-list]');
      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-add-period]')) {
          const rows = list.querySelectorAll('[data-period-row]');
          const lastEnd = rows.length ? rows[rows.length - 1].querySelector('[name="pend"]').value || '12:00' : '08:00';
          const start = rows.length ? addMinutesToTime(lastEnd, 5) : lastEnd;
          list.insertAdjacentHTML('beforeend', periodRow(rows.length, { start, end: addMinutesToTime(start, 50) }));
        }
        if (e.target.closest('[data-remove-period]')) {
          const rows = list.querySelectorAll('[data-period-row]');
          if (rows.length > 1) rows[rows.length - 1].remove();
        }
      });
    },
    onSubmit(form) {
      const starts = [...form.querySelectorAll('[name="pstart"]')].map((i) => i.value);
      const ends = [...form.querySelectorAll('[name="pend"]')].map((i) => i.value);
      const next = starts.map((start, i) => ({ start, end: ends[i] }));
      const bad = next.findIndex((p, i) => p.end <= p.start || (i > 0 && p.start < next[i - 1].end));
      if (bad >= 0) return showError(form, `${bad + 1}. Stunde: Zeiten passen nicht zusammen.`);
      mutate(({ upsert: put, remove: del }) => {
        put('kids', { ...kid, periods: next });
        for (const l of getState().lessons) if (l.kidId === kid.id && l.period >= next.length) del('lessons', l.id);
      });
      toast('Stundenraster gespeichert');
    },
  });
}

// ---------- Freie Tage ----------

export function openClosureForm(closure = null, { date } = {}) {
  const isNew = !closure;
  const c = closure || { title: '', start: date || '', end: '', kidIds: [] };
  const state = getState();
  openSheet({
    title: isNew ? 'Freier Tag' : 'Freien Tag bearbeiten',
    body: `
      <p class="sheet__message">Für schulautonome Tage, Schließtage im Kindergarten oder Ähnliches. Abholungen entfallen dann automatisch.</p>
      ${field('Bezeichnung', `<input name="title" id="f-title" required maxlength="60" value="${esc(c.title)}" list="dl-closures" autocomplete="off"${isNew ? ' autofocus' : ''}><datalist id="dl-closures"><option value="Schulautonomer Tag"><option value="Kindergarten geschlossen"><option value="Fenstertag"></datalist>`)}
      <div class="field-row">
        ${field('Von', `<input type="date" name="start" id="f-start" required value="${esc(c.start)}">`)}
        ${field('Bis (optional)', `<input type="date" name="end" id="f-end" value="${esc(c.end || '')}">`)}
      </div>
      ${state.kids.length ? group('Gilt für', kidChips('checkbox', 'kidIds', c.kidIds || []), 'Nichts gewählt: gilt für alle Kinder.') : ''}`,
    actions: isNew ? [] : [{ id: 'delete', label: 'Löschen', kind: 'danger' }],
    onSubmit(form) {
      const start = val(form, 'start');
      const end = val(form, 'end');
      if (end && end < start) return showError(form, 'Das Ende liegt vor dem Beginn.');
      upsert('closures', { ...c, title: val(form, 'title'), start, end: end && end > start ? end : '', kidIds: checked(form, 'kidIds') });
      toast('Freier Tag gespeichert');
    },
    onAction(id, _form, close) {
      if (id === 'delete') {
        remove('closures', c.id);
        close();
        toast('Gelöscht');
      }
    },
  });
}

