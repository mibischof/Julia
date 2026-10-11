// "Stundenplan vom Foto": Foto speichern, Text erkennen, Ergebnis neben dem
// Foto prüfen und mit Antippen korrigieren (Fach wählen → Stunden antippen).

import { addMinutesToTime, WEEKDAYS_SHORT } from './dates.js';
import { byId, DEFAULT_PERIODS } from './model.js';
import { binarize, fileToBitmap, scaled, toJpeg } from './photo.js';
import { getState, lastSaveFailed, mutate } from './store.js';
import { parseTimetable, SUBJECTS } from './timetable-parse.js';
import { shortSubject, subjectHue } from './subjects.js';
import { esc, ICONS, openSheet, toast } from './ui.js';

const COMMON = ['Deutsch', 'Mathematik', 'Sachunterricht', 'Englisch', 'Bewegung und Sport', 'Musik', 'Kunst und Gestaltung', 'Technik und Design', 'Religion', 'Lesen'];

export const photoId = (kidId) => `foto@${kidId}`;

export function kidPhoto(state, kidId) {
  return byId(state.photos || [], photoId(kidId));
}

/**
 * Öffnet den Import. Mit `file` wird ein neues Foto verarbeitet,
 * ohne `file` wird das gespeicherte Foto zum Nachtragen angezeigt.
 */
export async function openPhotoImport(kid, file = null) {
  const state = getState();
  const existing = kidPhoto(state, kid.id);
  let periods = (kid.periods?.length ? kid.periods : DEFAULT_PERIODS).map((p) => ({ ...p }));
  const grid = new Map();
  for (const l of state.lessons.filter((x) => x.kidId === kid.id)) {
    grid.set(`${l.weekday}:${l.period}`, { subject: l.subject, unsure: false, keep: l });
  }
  let active = null;
  let photoUrl = existing?.dataUrl || '';
  let detectedTimes = null;
  let busy = !!file;
  const extraSubjects = new Set([...grid.values()].map((c) => c.subject).filter((s) => !COMMON.includes(s)));

  const palette = () => {
    const subjects = [...COMMON, ...extraSubjects];
    return `${subjects
      .map(
        (s) => `<button type="button" class="pal${active === s ? ' is-active' : ''}" data-pal="${esc(s)}" style="--h:${subjectHue(s)}" aria-pressed="${active === s}">${esc(s)}</button>`,
      )
      .join('')}
      <button type="button" class="pal pal--erase${active === '' ? ' is-active' : ''}" data-pal="" aria-pressed="${active === ''}">Leeren</button>
      <button type="button" class="pal pal--add" data-add-subject>${ICONS.plus}Anderes Fach</button>`;
  };

  const table = () => `<table class="tt tt--edit">
      <thead><tr><th></th>${[1, 2, 3, 4, 5].map((d) => `<th>${WEEKDAYS_SHORT[d - 1]}</th>`).join('')}</tr></thead>
      <tbody>${periods
        .map(
          (p, i) => `<tr><th class="tt__period"><span class="tt__n">${i + 1}.</span><span class="tt__time">${esc(p.start)}<br>${esc(p.end)}</span></th>${[1, 2, 3, 4, 5]
            .map((d) => {
              const c = grid.get(`${d}:${i}`);
              return `<td><button type="button" class="tt__cell${c ? '' : ' is-empty'}${c?.unsure ? ' is-unsure' : ''}" data-cell="${d}:${i}"${c ? ` style="--h:${subjectHue(c.subject)}"` : ''} aria-label="${WEEKDAYS_SHORT[d - 1]} ${i + 1}. Stunde: ${esc(c?.subject || 'frei')}${c?.unsure ? ', unsicher' : ''}"><span class="tt__subject${c && shortSubject(c.subject).length >= 7 ? ' tt__subject--long' : ''}" lang="de">${c ? esc(shortSubject(c.subject)) : ''}</span></button></td>`;
            })
            .join('')}</tr>`,
        )
        .join('')}</tbody></table>`;

  const body = `
    <figure class="pi-photo${photoUrl ? '' : ' is-empty'}" data-photo>
      ${photoUrl ? `<img src="${photoUrl}" alt="Foto vom Stundenplan">` : '<span>Foto wird vorbereitet …</span>'}
      <figcaption>Tippen zum Vergrößern</figcaption>
    </figure>
    <div class="pi-status" data-status role="status">${file ? '<div class="progress"><span style="width:2%"></span></div><p>Foto wird vorbereitet …</p>' : '<p>Fach unten wählen, dann die Stunden im Plan antippen.</p>'}</div>
    <div class="pi-palette" data-palette>${palette()}</div>
    <div class="tt-wrap" data-grid>${table()}</div>
    <div class="row-actions">
      <button type="button" class="btn btn--small btn--ghost" data-add-row>${ICONS.plus}Stunde</button>
      <button type="button" class="btn btn--small btn--ghost" data-remove-row>Letzte Stunde entfernen</button>
    </div>
    <label class="check" data-times hidden><input type="checkbox" name="useTimes" id="f-useTimes" checked><span>Erkannte Uhrzeiten übernehmen<small data-times-text></small></span></label>`;

  const { form, dialog } = openSheet({
    title: `Stundenplan ${kid.name}`,
    body,
    full: true,
    submitLabel: 'Übernehmen',
    actions: file ? [{ id: 'photo-only', label: 'Nur Foto speichern', kind: 'ghost' }] : [],
    onSubmit() {
      if (busy) {
        toast('Einen Moment, die Erkennung läuft noch.');
        return false;
      }
      save(true);
    },
    onAction(id, _form, close) {
      if (id === 'photo-only' && !busy) {
        save(false);
        close();
      }
    },
  });

  const $ = (sel) => form.querySelector(sel);
  const redrawGrid = () => ($('[data-grid]').innerHTML = table());
  const redrawPalette = () => ($('[data-palette]').innerHTML = palette());
  const setStatus = (html) => ($('[data-status]').innerHTML = html);

  function save(withPlan) {
    const now = getState();
    const nextPeriods = periods.map((p, i) => {
      const t = detectedTimes?.[i];
      return form.elements.useTimes?.checked && !$('[data-times]').hidden && t ? { start: t.start, end: t.end } : p;
    });
    mutate(({ upsert, remove }) => {
      if (photoUrl) upsert('photos', { id: photoId(kid.id), kidId: kid.id, dataUrl: photoUrl });
      if (!withPlan) return;
      upsert('kids', { ...byId(now.kids, kid.id), periods: nextPeriods });
      for (const l of now.lessons) if (l.kidId === kid.id) remove('lessons', l.id);
      for (const [key, c] of grid) {
        const [weekday, period] = key.split(':').map(Number);
        if (period >= nextPeriods.length) continue;
        const keep = c.keep && c.keep.subject === c.subject ? c.keep : {};
        upsert('lessons', { room: '', note: '', ...keep, id: undefined, kidId: kid.id, weekday, period, subject: c.subject });
      }
    });
    if (lastSaveFailed()) {
      toast('Der Speicher am Gerät ist voll. Das Foto konnte nicht gespeichert werden.', { timeout: 8000 });
    } else {
      toast(withPlan ? 'Stundenplan gespeichert' : 'Foto gespeichert');
    }
  }

  form.addEventListener('click', (e) => {
    const pal = e.target.closest('[data-pal]');
    if (pal) {
      active = active === pal.dataset.pal ? null : pal.dataset.pal;
      redrawPalette();
      return;
    }
    if (e.target.closest('[data-add-subject]')) {
      openSheet({
        title: 'Anderes Fach',
        body: `<label class="field"><span class="field__label">Fach</span><input name="subject" id="f-new-subject" required maxlength="40" autocomplete="off" autofocus list="dl-all-subjects"><datalist id="dl-all-subjects">${SUBJECTS.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist></label>`,
        submitLabel: 'Hinzufügen',
        onSubmit(f) {
          const name = f.elements.subject.value.trim();
          if (!name) return false;
          if (!COMMON.includes(name)) extraSubjects.add(name);
          active = name;
          redrawPalette();
        },
      });
      return;
    }
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      if (active === null) {
        toast('Wähle zuerst oben ein Fach (oder „Leeren“).');
        $('[data-palette]').classList.add('is-hint');
        setTimeout(() => $('[data-palette]')?.classList.remove('is-hint'), 900);
        return;
      }
      const key = cell.dataset.cell;
      if (active === '') grid.delete(key);
      else grid.set(key, { subject: active, unsure: false, keep: grid.get(key)?.keep });
      redrawGrid();
      return;
    }
    if (e.target.closest('[data-photo]') && photoUrl) {
      $('[data-photo]').classList.toggle('is-zoomed');
      return;
    }
    if (e.target.closest('[data-add-row]')) {
      const last = periods[periods.length - 1] || { end: '07:55' };
      const start = addMinutesToTime(last.end, 5);
      periods.push({ start, end: addMinutesToTime(start, 50) });
      redrawGrid();
      return;
    }
    if (e.target.closest('[data-remove-row]') && periods.length > 1) {
      periods.pop();
      for (const key of [...grid.keys()]) if (Number(key.split(':')[1]) >= periods.length) grid.delete(key);
      redrawGrid();
    }
  });

  if (!file) return;

  // ---------- Foto verarbeiten ----------
  const progress = (share, text) =>
    setStatus(`<div class="progress"><span style="width:${Math.max(2, Math.round(share * 100))}%"></span></div><p>${esc(text)} …</p>`);
  try {
    const bitmap = await fileToBitmap(file);
    photoUrl = toJpeg(scaled(bitmap, 1400), 0.72);
    const fig = $('[data-photo]');
    fig.classList.remove('is-empty');
    fig.innerHTML = `<img src="${photoUrl}" alt="Foto vom Stundenplan"><figcaption>Tippen zum Vergrößern</figcaption>`;

    const { recognizeWords } = await import('./ocr.js');
    const source = scaled(bitmap, 2000);
    bitmap.close?.();
    const known = [...extraSubjects];
    progress(0.02, 'Texterkennung wird geladen');
    let result = parseTimetable(await recognizeWords(binarize(source), { onProgress: (p, t) => progress(p * 0.9, t) }), { knownSubjects: known });
    if (result.lessons.length < 4) {
      // Zweiter Versuch mit dem unbearbeiteten Foto
      progress(0.9, 'Zweiter Versuch');
      const second = parseTimetable(await recognizeWords(source, { onProgress: (p) => progress(0.9 + p * 0.1, 'Zweiter Versuch') }), { knownSubjects: known });
      if (second.lessons.length > result.lessons.length) result = second;
    }
    if (!dialog.open) return;

    if (result.lessons.length >= 3) {
      grid.clear();
      const rows = Math.max(periods.length, ...result.lessons.map((l) => l.period + 1));
      while (periods.length < rows) {
        const last = periods[periods.length - 1];
        const start = addMinutesToTime(last.end, 5);
        periods.push({ start, end: addMinutesToTime(start, 50) });
      }
      for (const l of result.lessons) {
        grid.set(`${l.weekday}:${l.period}`, { subject: l.subject, unsure: l.confidence < 0.75 });
        if (!COMMON.includes(l.subject)) extraSubjects.add(l.subject);
      }
      detectedTimes = result.periods;
      if (detectedTimes?.filter(Boolean).length >= 2) {
        const label = $('[data-times]');
        label.hidden = false;
        label.querySelector('[data-times-text]').textContent = detectedTimes
          .map((t, i) => (t ? `${i + 1}. ${t.start}–${t.end}` : null))
          .filter(Boolean)
          .join(' · ');
      }
      const unsure = result.lessons.filter((l) => l.confidence < 0.75).length;
      setStatus(
        `<p class="pi-result"><strong>${result.lessons.length} Stunden erkannt.</strong> Bitte mit dem Foto vergleichen${
          unsure ? `, besonders die ${unsure} gelb markierten` : ''
        }. Zum Korrigieren oben ein Fach wählen und die Stunde antippen.</p>`,
      );
      redrawPalette();
      redrawGrid();
    } else {
      setStatus(
        `<p class="pi-result">Die Schrift konnte nicht sicher gelesen werden${grid.size ? '. Der bisherige Plan bleibt stehen' : ''}. Wähle oben ein Fach und tippe die Stunden im Plan an, das Foto hast du dabei im Blick.</p>`,
      );
    }
  } catch (err) {
    console.error('Texterkennung', err);
    if (dialog.open) {
      setStatus(
        `<p class="pi-result">Die Texterkennung ist gerade nicht verfügbar${navigator.onLine === false ? ' (beim ersten Mal braucht sie Internet)' : ''}. Du kannst die Fächer trotzdem mit Antippen eintragen.</p>`,
      );
    }
  } finally {
    busy = false;
  }
}

/** Gespeichertes Foto groß anzeigen. */
export function openPhotoViewer(kid) {
  const photo = kidPhoto(getState(), kid.id);
  if (!photo) return;
  openSheet({
    title: `Foto: Stundenplan ${kid.name}`,
    full: true,
    body: `<figure class="pi-photo pi-photo--view" data-photo><img src="${photo.dataUrl}" alt="Foto vom Stundenplan ${esc(kid.name)}"><figcaption>Tippen zum Vergrößern</figcaption></figure>`,
    actions: [
      { id: 'delete', label: 'Foto löschen', kind: 'danger' },
      { id: 'edit', label: 'Plan damit nachtragen', kind: 'ghost' },
    ],
    onMount(form) {
      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-photo]')) form.querySelector('[data-photo]').classList.toggle('is-zoomed');
      });
    },
    onAction(id, _form, close) {
      if (id === 'delete') {
        mutate(({ remove }) => remove('photos', photo.id));
        close();
        toast('Foto gelöscht');
      }
      if (id === 'edit') {
        close();
        openPhotoImport(kid);
      }
    },
  });
}
