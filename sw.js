// Service Worker: hält die App offline verfügbar und öffnet sie beim Tippen
// auf eine Benachrichtigung. Bei jeder Änderung an Dateien VERSION erhöhen.
// Die Texterkennung (vendor/) wird nicht vorab geladen, sondern beim ersten
// Foto geholt und dann ebenfalls gecacht.

const VERSION = 'v1.1.0';
const CACHE = `familienplaner-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/bricolage-grotesque-latin.woff2',
  './fonts/figtree-latin.woff2',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-96.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/dates.js',
  './js/demo.js',
  './js/forms.js',
  './js/holidays.js',
  './js/ics.js',
  './js/model.js',
  './js/ocr.js',
  './js/photo.js',
  './js/photo-import.js',
  './js/reminders.js',
  './js/schedule.js',
  './js/store.js',
  './js/subjects.js',
  './js/timetable-parse.js',
  './js/ui.js',
  './js/views/agenda.js',
  './js/views/calendar.js',
  './js/views/more.js',
  './js/views/pickups.js',
  './js/views/timetable.js',
  './js/views/today.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('familienplaner-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Zuerst aus dem Cache, im Hintergrund aktualisieren
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const response = await network;
      if (response) return response;
      if (request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus();
        return existing.navigate?.(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
