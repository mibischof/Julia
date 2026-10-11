import { addDays, fmt } from '../dates.js';
import { BUNDESLAENDER, holidaysInRange, schoolStart } from '../holidays.js';
import { byId, KID_TYPES } from '../model.js';
import { buildIcs } from '../ics.js';
import { notificationSupport, showNotification } from '../reminders.js';
import { dot, openClosureForm, openKidForm, openMemberForm } from '../forms.js';
import { exportData, getDevice, importData, resetAll, setDevice, updateSettings } from '../store.js';
import { choose, confirmAction, esc, ICONS, readFile, shareOrDownload, toast } from '../ui.js';

const isStandalone = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let showAllHolidays = false;

function currentSchoolYear(code, today) {
  const y = Number(today.slice(0, 4));
  return today >= schoolStart(code, y) ? y : y - 1;
}

function renderDevice(state, device, ctx) {
  const support = notificationSupport();
  const enabled = device.notifications && support === 'granted';
  let notifyHtml;
  if (support === 'unsupported') {
    notifyHtml = isIOS() && !isStandalone()
      ? 'Am iPhone gibt es Benachrichtigungen nur, wenn die App auf dem Home-Bildschirm installiert ist (siehe unten).'
      : 'Dieser Browser unterstützt keine Benachrichtigungen.';
    notifyHtml = `<p class="hint">${notifyHtml}</p>`;
  } else if (support === 'denied') {
    notifyHtml = `<p class="hint">Benachrichtigungen sind für diese App blockiert. Erlaube sie in den Einstellungen des Browsers bzw. des Handys.</p>`;
  } else if (enabled) {
    notifyHtml = `<div class="row-actions"><span class="status status--on">${ICONS.check}Eingeschaltet</span>
      <button type="button" class="btn btn--small btn--ghost" data-action="test-notification">Test senden</button>
      <button type="button" class="btn btn--small btn--ghost" data-action="disable-notifications">Ausschalten</button></div>`;
  } else {
    notifyHtml = `<button type="button" class="btn btn--soft" data-action="enable-notifications">${ICONS.bell}Benachrichtigungen einschalten</button>`;
  }

  let installHtml = '';
  if (!isStandalone()) {
    installHtml = ctx.installPrompt
      ? `<button type="button" class="btn btn--ghost" data-action="install">App installieren</button>`
      : isIOS()
        ? `<p class="hint"><strong>Als App installieren:</strong> In Safari unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen. Danach die App vom Home-Bildschirm aus öffnen.</p>`
        : `<p class="hint"><strong>Als App installieren:</strong> Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.</p>`;
  }

  return `<section class="card" aria-labelledby="dev-title">
    <h2 id="dev-title" class="card__title">Dieses Gerät</h2>
    <div class="card__row">
      <span class="card__label">Ich bin</span>
      <div class="chips">${state.members
        .map((m) => `<button type="button" class="chip-btn${m.id === device.meId ? ' is-active' : ''}" data-action="set-me" data-id="${esc(m.id)}" aria-pressed="${m.id === device.meId}">${dot(m.color)}${esc(m.name)}</button>`)
        .join('')}${state.members.length ? '' : '<button type="button" class="btn btn--small btn--soft" data-action="add-member">Person anlegen</button>'}</div>
    </div>
    <div class="card__row card__row--stack">
      <span class="card__label">Erinnerungen</span>
      ${notifyHtml}
      <p class="hint">Ohne Server kommen Erinnerungen nur, solange die App geöffnet ist oder im Hintergrund noch läuft. Damit dich das Handy auch bei geschlossener App erinnert, nutze unten den Kalender-Export.</p>
    </div>
    ${installHtml ? `<div class="card__row card__row--stack">${installHtml}</div>` : ''}
  </section>`;
}

function renderFamily(state) {
  const people = state.members
    .map((m) => `<li><button type="button" class="list-row" data-action="edit-member" data-id="${esc(m.id)}">${dot(m.color)}<span class="list-row__main">${esc(m.name)}</span>${ICONS.edit}</button></li>`)
    .join('');
  const kids = state.kids
    .map(
      (k) => `<li><button type="button" class="list-row" data-action="edit-kid" data-id="${esc(k.id)}">${dot(k.color)}<span class="list-row__main">${esc(k.name)}<small>${esc(
        [KID_TYPES[k.type], k.institution, k.className].filter(Boolean).join(' · '),
      )}</small></span>${ICONS.edit}</button></li>`,
    )
    .join('');
  return `<section class="card" aria-labelledby="fam-title">
    <h2 id="fam-title" class="card__title">Familie</h2>
    <h3 class="card__sub">Erwachsene</h3>
    ${people ? `<ul class="list">${people}</ul>` : '<p class="hint">Noch niemand angelegt.</p>'}
    <button type="button" class="btn btn--small btn--ghost" data-action="add-member">${ICONS.plus}Person</button>
    <h3 class="card__sub">Kinder</h3>
    ${kids ? `<ul class="list">${kids}</ul>` : '<p class="hint">Noch keine Kinder angelegt.</p>'}
    <button type="button" class="btn btn--small btn--ghost" data-action="add-kid">${ICONS.plus}Kind</button>
  </section>`;
}

function renderHolidays(state, today) {
  const code = state.settings.bundesland;
  const year = currentSchoolYear(code, today);
  const from = schoolStart(code, year);
  const to = addDays(schoolStart(code, year + 1), -1);
  const list = holidaysInRange(code, from, to).filter((e) => showAllHolidays || e.end >= today);
  const closures = [...state.closures].sort((a, b) => a.start.localeCompare(b.start)).filter((c) => (c.end || c.start) >= addDays(today, -60));
  const range = (e) => (e.start === e.end || !e.end ? fmt.short(e.start) : `${fmt.short(e.start)} – ${fmt.short(e.end)}`);
  return `<section class="card" aria-labelledby="hol-title">
    <h2 id="hol-title" class="card__title">Ferien &amp; freie Tage</h2>
    <label class="field"><span class="field__label">Bundesland</span>
      <select id="f-bundesland" data-change="bundesland">${BUNDESLAENDER.map((b) => `<option value="${b.code}"${b.code === code ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    </label>
    <h3 class="card__sub">Eigene freie Tage</h3>
    ${
      closures.length
        ? `<ul class="list">${closures
            .map(
              (c) => `<li><button type="button" class="list-row" data-action="edit-closure" data-id="${esc(c.id)}"><span class="list-row__main">${esc(c.title)}<small>${esc(range(c))}${
                c.kidIds?.length ? ` · ${esc(c.kidIds.map((id) => byId(state.kids, id)?.name).filter(Boolean).join(', '))}` : ' · alle Kinder'
              }</small></span>${ICONS.edit}</button></li>`,
            )
            .join('')}</ul>`
        : '<p class="hint">Schulautonome Tage und Schließtage vom Kindergarten hier eintragen.</p>'
    }
    <button type="button" class="btn btn--small btn--ghost" data-action="add-closure">${ICONS.plus}Freier Tag</button>
    <h3 class="card__sub">Schuljahr ${year}/${String(year + 1).slice(2)}</h3>
    <ul class="holiday-table">${list
      .map((e) => `<li class="holiday-table__row holiday--${e.kind}"><span>${esc(e.title)}</span><span class="holiday-table__date">${esc(range(e))}</span></li>`)
      .join('')}</ul>
    <button type="button" class="link-btn" data-action="toggle-holidays">${showAllHolidays ? 'Nur kommende zeigen' : 'Auch vergangene zeigen'}</button>
    <p class="hint">Berechnet nach dem Schulzeitgesetz. Schulautonome Tage legt jede Schule selbst fest.</p>
  </section>`;
}

function renderExport(state, device) {
  const me = byId(state.members, device.meId);
  return `<section class="card" aria-labelledby="ics-title">
    <h2 id="ics-title" class="card__title">Im Handy-Kalender erinnern</h2>
    <p class="hint">Erstellt eine Kalenderdatei mit Abholungen und Terminen samt Erinnerungen. Öffne sie am Handy und füge sie deinem Kalender hinzu. Nach Änderungen einfach neu erstellen.</p>
    <div class="field-row">
      <label class="field"><span class="field__label">Abholungen</span>
        <select id="f-ics-pickups">
          <option value="mine"${me ? ' selected' : ''}>${me ? `Nur meine (${esc(me.name)})` : 'Nur meine'}</option>
          <option value="all"${me ? '' : ' selected'}>Alle</option>
          <option value="none">Keine</option>
        </select></label>
      <label class="field"><span class="field__label">Zeitraum</span>
        <select id="f-ics-days"><option value="31">1 Monat</option><option value="92" selected>3 Monate</option><option value="183">6 Monate</option></select></label>
    </div>
    <button type="button" class="btn btn--soft" data-action="export-ics">Kalenderdatei erstellen</button>
  </section>`;
}

function renderData(state) {
  const empty = !state.members.length && !state.kids.length;
  return `<section class="card" aria-labelledby="data-title">
    <h2 id="data-title" class="card__title">Daten teilen &amp; sichern</h2>
    <p class="hint">Alles bleibt auf diesem Gerät. Um die Daten auf ein zweites Handy zu bringen, die Datei dort importieren. Beim Zusammenführen gewinnt jeweils die neuere Änderung.</p>
    <div class="row-actions">
      <button type="button" class="btn btn--soft" data-action="export-data">Datei erstellen</button>
      <label class="btn btn--ghost file-btn">Datei importieren<input type="file" id="f-import" accept=".json,application/json" data-change="import"></label>
    </div>
    <div class="row-actions">
      ${empty ? '<button type="button" class="btn btn--small btn--ghost" data-action="load-demo">Beispieldaten laden</button>' : ''}
      <button type="button" class="btn btn--small btn--danger" data-action="reset">Alle Daten löschen</button>
    </div>
  </section>`;
}

export default {
  name: 'mehr',
  title: 'Mehr',

  render(ctx) {
    const { state, device, today } = ctx;
    return `<header class="page-head"><h1 class="page-title">Einstellungen</h1></header>
      <div class="stack-lg">
        ${renderDevice(state, device, ctx)}
        ${renderFamily(state)}
        ${renderHolidays(state, today)}
        ${renderExport(state, device)}
        ${renderData(state)}
        <p class="footnote">Familienplaner ${esc(ctx.version)} · Gemeinsamer Sync und Push-Nachrichten folgen mit dem Backend.</p>
      </div>`;
  },

  async onAction(action, el, ctx) {
    const { state } = ctx;
    switch (action) {
      case 'set-me':
        setDevice({ meId: el.dataset.id });
        break;
      case 'edit-member':
        openMemberForm(byId(state.members, el.dataset.id));
        break;
      case 'edit-kid':
        openKidForm(byId(state.kids, el.dataset.id));
        break;
      case 'add-closure':
        openClosureForm();
        break;
      case 'edit-closure':
        openClosureForm(byId(state.closures, el.dataset.id));
        break;
      case 'toggle-holidays':
        showAllHolidays = !showAllHolidays;
        ctx.rerender();
        break;
      case 'test-notification': {
        const ok = await showNotification('So sieht eine Erinnerung aus', { body: 'Lena abholen um 12:35 · Volksschule', tag: 'test' });
        if (!ok) toast('Die Benachrichtigung konnte nicht angezeigt werden.');
        break;
      }
      case 'disable-notifications':
        setDevice({ notifications: false });
        break;
      case 'install':
        if (ctx.installPrompt) {
          ctx.installPrompt.prompt();
          await ctx.installPrompt.userChoice.catch(() => null);
          ctx.clearInstallPrompt();
        }
        break;
      case 'export-ics': {
        const pickups = document.getElementById('f-ics-pickups').value;
        const days = Number(document.getElementById('f-ics-days').value);
        const ics = buildIcs(state, { meId: getDevice().meId, pickups, days, from: ctx.today });
        const result = await shareOrDownload('familienplaner.ics', ics, 'text/calendar');
        if (result === 'downloaded') toast('Kalenderdatei gespeichert. Öffne sie, um sie dem Kalender hinzuzufügen.');
        break;
      }
      case 'export-data': {
        const result = await shareOrDownload(`familienplaner-${ctx.today}.json`, exportData(), 'application/json');
        if (result === 'downloaded') toast('Datei gespeichert');
        break;
      }
      case 'reset': {
        const ok = await confirmAction({
          title: 'Alle Daten löschen?',
          message: 'Familie, Stundenpläne, Abholzeiten und Termine werden auf diesem Gerät gelöscht. Erstelle vorher eine Datei, wenn du sie behalten willst.',
          confirmLabel: 'Alles löschen',
        });
        if (ok) {
          resetAll();
          toast('Alle Daten gelöscht');
        }
        break;
      }
      default:
    }
  },

  async onChange(e, ctx) {
    const kind = e.target.dataset.change;
    if (kind === 'bundesland') {
      updateSettings({ bundesland: e.target.value });
      toast('Ferien aktualisiert');
    }
    if (kind === 'import') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      let text;
      try {
        text = await readFile(file);
        JSON.parse(text);
      } catch {
        toast('Die Datei konnte nicht gelesen werden.');
        return;
      }
      const hasData = ctx.state.members.length || ctx.state.kids.length;
      const mode = hasData
        ? await choose({
            title: 'Datei importieren',
            message: 'Wie sollen die Daten übernommen werden?',
            options: [
              { id: 'merge', label: 'Mit meinen Daten zusammenführen', kind: 'primary' },
              { id: 'replace', label: 'Meine Daten ersetzen', kind: 'danger' },
              { id: 'cancel', label: 'Abbrechen', kind: 'ghost' },
            ],
          })
        : 'replace';
      if (!mode || mode === 'cancel') return;
      try {
        const next = importData(text, mode);
        toast(`Importiert: ${next.kids.length} Kinder, ${next.pickups.length} Abholzeiten, ${next.events.length} Termine`);
      } catch (err) {
        toast(err.message || 'Import fehlgeschlagen.');
      }
    }
  },
};
