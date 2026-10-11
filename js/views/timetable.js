import { WEEKDAYS_SHORT, weekday } from '../dates.js';
import { byId, KID_TYPES } from '../model.js';
import { openKidForm, openLessonForm, openPeriodsForm, dot } from '../forms.js';
import { esc, ICONS } from '../ui.js';
import { shortSubject, subjectHue } from '../subjects.js';
import { kidPhoto, openPhotoImport, openPhotoViewer } from '../photo-import.js';

let selectedKidId = null;

function subjectLabel(lesson) {
  const short = lesson.short || shortSubject(lesson.subject);
  const cls = `tt__subject${short.length >= 7 ? ' tt__subject--long' : ''}`;
  if (short === lesson.subject) return `<span class="${cls}" lang="de">${esc(lesson.subject)}</span>`;
  return `<span class="${cls}" lang="de"><span class="tt__full">${esc(lesson.subject)}</span><span class="tt__short" aria-hidden="true">${esc(short)}</span></span>`;
}

function renderGrid(state, kid, today) {
  const periods = kid.periods || [];
  const todayWd = weekday(today);
  const lessonAt = new Map(state.lessons.filter((l) => l.kidId === kid.id).map((l) => [`${l.weekday}:${l.period}`, l]));
  const ends = [1, 2, 3, 4, 5].map((wd) => {
    let lastPeriod = -1;
    periods.forEach((_, i) => {
      if (lessonAt.has(`${wd}:${i}`)) lastPeriod = i;
    });
    return lastPeriod >= 0 ? periods[lastPeriod].end : '';
  });

  return `<div class="tt-wrap">
    <table class="tt">
      <caption class="visually-hidden">Stundenplan ${esc(kid.name)}</caption>
      <thead><tr><th scope="col"><span class="visually-hidden">Stunde</span></th>${[1, 2, 3, 4, 5]
        .map((wd) => `<th scope="col"${wd === todayWd ? ' class="is-today"' : ''}>${WEEKDAYS_SHORT[wd - 1]}</th>`)
        .join('')}</tr></thead>
      <tbody>
        ${periods
          .map(
            (p, i) => `<tr>
          <th scope="row" class="tt__period"><span class="tt__n">${i + 1}.</span><span class="tt__time">${esc(p.start)}<br>${esc(p.end)}</span></th>
          ${[1, 2, 3, 4, 5]
            .map((wd) => {
              const l = lessonAt.get(`${wd}:${i}`);
              const label = `${WEEKDAYS_SHORT[wd - 1]} ${i + 1}. Stunde${l ? `: ${l.subject}` : ', frei'}`;
              return `<td${wd === todayWd ? ' class="is-today"' : ''}><button type="button" class="tt__cell${l ? '' : ' is-empty'}" data-action="lesson" data-wd="${wd}" data-period="${i}" aria-label="${esc(label)}"${
                l ? ` style="--h:${subjectHue(l.subject)}"` : ''
              }>${l ? `${subjectLabel(l)}${l.room || l.note ? `<small>${esc([l.room, l.note].filter(Boolean).join(' · '))}</small>` : ''}` : '<span aria-hidden="true">+</span>'}</button></td>`;
            })
            .join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot><tr><th scope="row" class="tt__period"><span class="tt__n">Ende</span></th>${ends
        .map((e, i) => `<td class="tt__end${i + 1 === todayWd ? ' is-today' : ''}">${esc(e || '–')}</td>`)
        .join('')}</tr></tfoot>
    </table>
  </div>`;
}

export default {
  name: 'stundenplan',
  title: 'Stundenplan',

  render({ state, today, route }) {
    if (route.param && byId(state.kids, route.param)) selectedKidId = route.param;
    if (!byId(state.kids, selectedKidId)) {
      selectedKidId = (state.kids.find((k) => k.type === 'schule') || state.kids[0])?.id || null;
    }
    const kid = byId(state.kids, selectedKidId);
    const head = `<header class="page-head"><h1 class="page-title">Stundenplan</h1></header>`;
    if (!kid) {
      return `${head}<div class="empty-state"><p>Lege zuerst ein Kind an. Danach trägst du hier den Stundenplan ein.</p>
        <button type="button" class="btn btn--primary" data-action="add-kid">${ICONS.plus}Kind hinzufügen</button></div>`;
    }
    const tabs =
      state.kids.length > 1
        ? `<div class="segmented" role="tablist">${state.kids
            .map(
              (k) => `<button type="button" role="tab" class="segmented__btn" aria-selected="${k.id === kid.id}" data-action="select-kid" data-id="${esc(k.id)}">${dot(k.color)}${esc(k.name)}</button>`,
            )
            .join('')}</div>`
        : '';
    const info = [KID_TYPES[kid.type], kid.institution, kid.className].filter(Boolean).join(' · ');
    const hasPlan = kid.type === 'schule' || kid.type === 'hort';
    const photo = kidPhoto(state, kid.id);
    const hasLessons = state.lessons.some((l) => l.kidId === kid.id);
    const photoBar = `<div class="photo-bar">
        <label class="btn ${hasLessons ? 'btn--soft' : 'btn--primary'} file-btn">${ICONS.camera}${photo ? 'Neues Foto' : 'Stundenplan abfotografieren'}
          <input type="file" accept="image/*" id="f-timetable-photo" data-change="timetable-photo" aria-label="Foto oder Screenshot vom Stundenplan aufnehmen oder auswählen"></label>
        ${
          photo
            ? `<button type="button" class="photo-thumb" data-action="view-photo" aria-label="Foto vom Stundenplan ansehen"><img src="${photo.dataUrl}" alt=""></button>
               <button type="button" class="btn btn--small btn--ghost" data-action="edit-with-photo">${ICONS.image}Mit Foto nachtragen</button>`
            : ''
        }
      </div>`;
    return `${head}${tabs}
      <div class="kid-line">${dot(kid.color)}<span><strong>${esc(kid.name)}</strong>${info ? ` · ${esc(info)}` : ''}</span>
        <button type="button" class="link-btn" data-action="edit-kid" data-id="${esc(kid.id)}">bearbeiten</button></div>
      ${
        hasPlan
          ? `${photoBar}
          ${hasLessons || photo ? '' : '<p class="hint">Fotografiere den Stundenplan oder wähle einen Screenshot aus einer Stundenplan-App (z. B. Schooly). Die App liest die Fächer aus, so gut es geht, und du korrigierst mit ein paar Tipps. Oder tippe unten direkt auf die Stunden.</p>'}
          ${renderGrid(state, kid, today)}
          <p class="hint">Tippe auf eine Stunde, um das Fach einzutragen. Gleiche Fächer bekommen dieselbe Farbe.</p>
          <button type="button" class="btn btn--ghost" data-action="periods">Stundenraster: ${kid.periods.length} Stunden, ${esc(kid.periods[0]?.start || '')}–${esc(kid.periods[kid.periods.length - 1]?.end || '')}</button>`
          : `<div class="empty-state"><p>${esc(kid.name)} geht in ${kid.type === 'krippe' ? 'die Krippe' : 'den Kindergarten'}, da gibt es keinen Stundenplan. Bring- und Abholzeiten trägst du unter „Abholen“ ein.</p>
            <button type="button" class="btn btn--primary" data-action="go-pickups">Zu den Abholzeiten</button></div>`
      }`;
  },

  onAction(action, el, ctx) {
    const kid = byId(ctx.state.kids, selectedKidId);
    if (action === 'select-kid') {
      selectedKidId = el.dataset.id;
      ctx.navigate(`#/stundenplan/${selectedKidId}`);
    } else if (action === 'lesson' && kid) {
      openLessonForm(kid, Number(el.dataset.wd), Number(el.dataset.period));
    } else if (action === 'periods' && kid) {
      openPeriodsForm(kid);
    } else if (action === 'edit-kid' && kid) {
      openKidForm(kid);
    } else if (action === 'view-photo' && kid) {
      openPhotoViewer(kid);
    } else if (action === 'edit-with-photo' && kid) {
      openPhotoImport(kid);
    }
  },

  onChange(e, ctx) {
    if (e.target.dataset.change !== 'timetable-photo') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    const kid = byId(ctx.state.kids, selectedKidId);
    if (file && kid) openPhotoImport(kid, file);
  },
};
