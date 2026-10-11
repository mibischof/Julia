// Einstieg: Router, Navigation, gemeinsame Aktionen, Service Worker, Erinnerungen.

import { todayISO } from './dates.js';
import { demoState } from './demo.js';
import { byId } from './model.js';
import { pickupsOn } from './schedule.js';
import * as store from './store.js';
import { notificationSupport, requestNotificationPermission, showNotification, startReminderLoop } from './reminders.js';
import { openEventForm, openKidForm, openMemberForm, openMeSheet, openPickupDay, openPickupForm, takeOverPickup } from './forms.js';
import { ICONS, toast } from './ui.js';
import today from './views/today.js';
import calendar from './views/calendar.js';
import timetable from './views/timetable.js';
import pickups from './views/pickups.js';
import more from './views/more.js';

const VERSION = '1.1.0';

const ROUTES = { heute: today, kalender: calendar, stundenplan: timetable, abholen: pickups, mehr: more };
const TABS = [
  ['heute', 'Heute', ICONS.today],
  ['kalender', 'Kalender', ICONS.calendar],
  ['stundenplan', 'Stundenplan', ICONS.timetable],
  ['abholen', 'Abholen', ICONS.pickup],
  ['mehr', 'Mehr', ICONS.more],
];

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const fab = document.getElementById('fab');

let installPrompt = null;
let lastRoute = null;
let lastToday = todayISO();

function parseRoute() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : 'heute', param: param ? decodeURIComponent(param) : null };
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function context() {
  return {
    state: store.getState(),
    device: store.getDevice(),
    today: todayISO(),
    route: parseRoute(),
    version: VERSION,
    installPrompt,
    clearInstallPrompt: () => {
      installPrompt = null;
      render();
    },
    navigate,
    rerender: render,
  };
}

function render() {
  const ctx = context();
  const view = ROUTES[ctx.route.name];
  const sameRoute = lastRoute === ctx.route.name;
  const scrollY = window.scrollY;
  viewEl.innerHTML = view.render(ctx);
  view.mount?.(viewEl, ctx);
  viewEl.dataset.view = ctx.route.name;

  for (const a of tabbar.querySelectorAll('a')) {
    if (a.dataset.route === ctx.route.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view.fab) {
    fab.hidden = false;
    fab.querySelector('span').textContent = view.fab.label;
    fab.setAttribute('aria-label', `${view.fab.label} hinzufügen`);
  } else {
    fab.hidden = true;
  }
  document.title = ctx.route.name === 'heute' ? 'Familienplaner' : `${view.title} · Familienplaner`;
  window.scrollTo(0, sameRoute ? scrollY : 0);
  lastRoute = ctx.route.name;
}

async function enableNotifications() {
  const support = notificationSupport();
  if (support === 'unsupported') {
    toast('Benachrichtigungen gehen hier nicht. Am iPhone die App zuerst zum Home-Bildschirm hinzufügen.', { timeout: 7000 });
    navigate('#/mehr');
    return;
  }
  const result = await requestNotificationPermission();
  if (result === 'granted') {
    store.setDevice({ notifications: true });
    showNotification('Erinnerungen sind eingeschaltet', { body: 'So meldet sich der Familienplaner.', tag: 'welcome' });
  } else {
    toast('Benachrichtigungen wurden nicht erlaubt. Du kannst sie in den Browser-Einstellungen freigeben.', { timeout: 7000 });
  }
}

function findPickup(state, el) {
  return pickupsOn(state, el.dataset.date).find((p) => p.pickup.id === el.dataset.id);
}

/** Aktionen, die in mehreren Ansichten vorkommen. */
function handleCommon(action, el, ctx) {
  const { state } = ctx;
  switch (action) {
    case 'open-pickup': {
      const occ = findPickup(state, el);
      if (occ) openPickupDay(occ);
      return true;
    }
    case 'take-pickup': {
      const occ = findPickup(state, el);
      if (occ) takeOverPickup(occ);
      return true;
    }
    case 'open-event': {
      const ev = byId(state.events, el.dataset.id);
      if (ev) openEventForm(ev, { occDate: el.dataset.date });
      return true;
    }
    case 'open-school':
      navigate(`#/stundenplan/${encodeURIComponent(el.dataset.kid)}`);
      return true;
    case 'add-member':
      openMemberForm();
      return true;
    case 'add-kid':
      openKidForm();
      return true;
    case 'add-pickup':
      openPickupForm();
      return true;
    case 'choose-me':
      openMeSheet();
      return true;
    case 'enable-notifications':
      enableNotifications();
      return true;
    case 'go-timetable':
      navigate('#/stundenplan');
      return true;
    case 'go-pickups':
      navigate('#/abholen');
      return true;
    case 'dismiss-setup':
      store.setDevice({ setupDismissed: true });
      return true;
    case 'load-demo': {
      const demo = demoState(ctx.today);
      store.replaceState(demo.state);
      store.setDevice({ meId: demo.meId });
      toast('Beispieldaten geladen. Unter „Mehr“ kannst du sie wieder löschen.', { timeout: 6000 });
      return true;
    }
    default:
      return false;
  }
}

function setupShell() {
  tabbar.innerHTML = TABS.map(([route, label, icon]) => `<a href="#/${route}" data-route="${route}">${icon}<span>${label}</span></a>`).join('');
  fab.innerHTML = `${ICONS.plus}<span></span>`;

  viewEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !viewEl.contains(el)) return;
    const ctx = context();
    if (handleCommon(el.dataset.action, el, ctx)) return;
    ROUTES[ctx.route.name].onAction?.(el.dataset.action, el, ctx);
  });
  viewEl.addEventListener('change', (e) => {
    if (!e.target.dataset.change) return;
    const ctx = context();
    ROUTES[ctx.route.name].onChange?.(e, ctx);
  });
  fab.addEventListener('click', () => {
    const ctx = context();
    ROUTES[ctx.route.name].fab?.run(ctx);
  });

  window.addEventListener('hashchange', render);
  store.subscribe(render);

  // Tageswechsel um Mitternacht
  setInterval(() => {
    const t = todayISO();
    if (t !== lastToday) {
      lastToday = t;
      render();
    }
  }, 60 * 1000);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if (parseRoute().name === 'mehr') render();
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    const offerUpdate = (worker) => {
      toast('Eine neue Version ist da.', { actionLabel: 'Aktualisieren', onAction: () => worker.postMessage('skipWaiting'), timeout: 0 });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  } catch (err) {
    console.warn('Service Worker nicht verfügbar', err);
  }
}

setupShell();
render();
registerServiceWorker();
navigator.storage?.persist?.().catch(() => {});

startReminderLoop({
  getState: store.getState,
  getDevice: store.getDevice,
  setDeviceQuiet: store.setDeviceQuiet,
  onInApp(reminder) {
    if (document.visibilityState === 'visible') toast(`Erinnerung: ${reminder.title}`, { timeout: 12000 });
  },
});
