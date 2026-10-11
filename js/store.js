// Speichert die Familiendaten lokal im Browser. Geräte-spezifische Angaben
// ("Ich bin …", Benachrichtigungen) liegen getrennt und werden nicht geteilt.

import { COLLECTIONS, emptyState, mergeStates, normalize, uid } from './model.js';

const DATA_KEY = 'familienplaner:data:v1';
const DEVICE_KEY = 'familienplaner:device:v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('Speichern fehlgeschlagen', err);
    return false;
  }
}

let state = normalize(read(DATA_KEY));
let device = { meId: null, notifications: false, fired: {}, setupDismissed: false, ...(read(DEVICE_KEY) || {}) };
const listeners = new Set();
let saveFailed = false;

function notify() {
  for (const fn of listeners) fn(state, device);
}

function commit() {
  saveFailed = !write(DATA_KEY, state);
  notify();
}

export const getState = () => state;
export const getDevice = () => device;
export const lastSaveFailed = () => saveFailed;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Mehrere Änderungen in einem Schritt speichern.
 * mutate(({ upsert, remove, settings }) => { … })
 */
export function mutate(fn) {
  const now = Date.now();
  const draft = { ...state, tombstones: { ...state.tombstones } };
  const saved = [];
  const ops = {
    upsert(col, item) {
      if (!COLLECTIONS.includes(col)) throw new Error(`Unbekannte Sammlung ${col}`);
      const next = { ...item, id: item.id || uid(), updatedAt: now };
      const list = draft[col];
      const i = list.findIndex((x) => x.id === next.id);
      draft[col] = i >= 0 ? list.map((x, j) => (j === i ? next : x)) : [...list, next];
      saved.push(next);
      return next;
    },
    remove(col, id) {
      draft[col] = draft[col].filter((x) => x.id !== id);
      draft.tombstones[id] = now;
    },
    settings(patch) {
      draft.settings = { ...draft.settings, ...patch, updatedAt: now };
    },
  };
  fn(ops);
  state = draft;
  commit();
  return saved;
}

export const upsert = (col, item) => mutate((ops) => ops.upsert(col, item))[0];
export const remove = (col, id) => mutate((ops) => ops.remove(col, id));
export const updateSettings = (patch) => mutate((ops) => ops.settings(patch));

export function setDevice(patch) {
  device = { ...device, ...patch };
  write(DEVICE_KEY, device);
  notify();
}

/** Gerätedaten ändern, ohne die Oberfläche neu zu zeichnen (z. B. Erinnerungsprotokoll). */
export function setDeviceQuiet(patch) {
  device = { ...device, ...patch };
  write(DEVICE_KEY, device);
}

export function exportData() {
  return JSON.stringify({ app: 'familienplaner', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/**
 * Datei einlesen. mode 'merge' führt mit den eigenen Daten zusammen,
 * 'replace' ersetzt sie vollständig.
 */
export function importData(text, mode = 'merge') {
  const parsed = JSON.parse(text);
  const incoming = parsed && parsed.app === 'familienplaner' ? parsed.data : parsed;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.kids)) {
    throw new Error('Das ist keine Familienplaner-Datei.');
  }
  state = mode === 'replace' ? normalize(incoming) : mergeStates(state, incoming);
  commit();
  return state;
}

export function replaceState(next) {
  state = normalize(next);
  commit();
}

export function resetAll() {
  state = emptyState();
  device = { meId: null, notifications: false, fired: {}, setupDismissed: false };
  write(DEVICE_KEY, device);
  commit();
}

// Änderungen aus einem anderen Tab übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DATA_KEY) {
      state = normalize(read(DATA_KEY));
      notify();
    } else if (e.key === DEVICE_KEY) {
      device = { ...device, ...(read(DEVICE_KEY) || {}) };
      notify();
    }
  });
}
