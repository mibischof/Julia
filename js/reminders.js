// Erinnerungen ohne Server: Solange die App offen ist (oder im Hintergrund
// noch läuft), prüft sie jede halbe Minute, ob etwas fällig ist, und zeigt eine
// Benachrichtigung. Für Erinnerungen bei geschlossener App gibt es den
// Kalender-Export; echte Push-Nachrichten kommen mit dem späteren Backend.

import { remindersBetween } from './schedule.js';

const CHECK_EVERY_MS = 30 * 1000;
const MAX_LATE_MS = 30 * 60 * 1000; // verpasste Erinnerungen bis 30 Min. nachholen

export function notificationSupport() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showNotification(title, { body = '', tag } = {}) {
  if (notificationSupport() !== 'granted') return false;
  const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', renotify: true, data: { url: './#/heute' } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // ohne Service Worker weiter unten versuchen
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Startet die Prüfschleife.
 * onInApp(reminder) zeigt den Hinweis zusätzlich in der App an.
 */
export function startReminderLoop({ getState, getDevice, setDeviceQuiet, onInApp }) {
  let timer = null;

  async function check() {
    const device = getDevice();
    const now = new Date();
    const last = device.lastReminderCheck ? new Date(device.lastReminderCheck) : new Date(now.getTime() - CHECK_EVERY_MS);
    const from = new Date(Math.max(last.getTime(), now.getTime() - MAX_LATE_MS));
    const due = remindersBetween(getState(), device.meId, from, now);
    const fired = { ...(device.fired || {}) };

    for (const r of due) {
      const key = `${r.key}@${r.at.getTime()}`;
      if (fired[key]) continue;
      fired[key] = now.getTime();
      const sent = device.notifications ? await showNotification(r.title, { body: r.body, tag: r.key }) : false;
      onInApp?.(r, { sent });
    }

    // Protokoll klein halten
    for (const [key, ts] of Object.entries(fired)) {
      if (now.getTime() - ts > 3 * 86400000) delete fired[key];
    }
    setDeviceQuiet({ fired, lastReminderCheck: now.toISOString() });
  }

  const run = () => check().catch((err) => console.error('Erinnerungen', err));
  run();
  timer = setInterval(run, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  return () => clearInterval(timer);
}
