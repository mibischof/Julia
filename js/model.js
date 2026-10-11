// Datenmodell und Zusammenführen von Datenständen (z. B. Import vom Handy des
// Partners). Jeder Datensatz trägt `updatedAt`; Löschungen werden als
// Grabsteine (`tombstones`) gemerkt, damit sie beim Zusammenführen nicht wieder
// auftauchen. Dieselbe Logik lässt sich später für einen Server-Sync nutzen.

export const SCHEMA_VERSION = 1;

export const COLLECTIONS = ['members', 'kids', 'lessons', 'pickups', 'pickupOverrides', 'events', 'closures', 'photos'];

// Markerfarben: kräftig genug für Punkte und Ränder, in hell und dunkel lesbar
export const COLORS = ['#E5484D', '#F76B15', '#D9A300', '#30A46C', '#12A594', '#0091FF', '#8E4EC6', '#D6409F'];

export const DEFAULT_PERIODS = [
  { start: '08:00', end: '08:50' },
  { start: '08:55', end: '09:45' },
  { start: '10:00', end: '10:50' },
  { start: '10:55', end: '11:45' },
  { start: '11:50', end: '12:40' },
  { start: '12:45', end: '13:35' },
];

export const KID_TYPES = {
  schule: 'Schule',
  kindergarten: 'Kindergarten',
  krippe: 'Krippe',
  hort: 'Hort',
};

export const REPEAT_LABELS = {
  none: 'Nie',
  weekly: 'Jede Woche',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Jeden Monat',
  yearly: 'Jedes Jahr',
};

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    settings: { bundesland: 'K', defaultLeadMinutes: 15, updatedAt: 0 },
    members: [],
    kids: [],
    lessons: [],
    pickups: [],
    pickupOverrides: [],
    events: [],
    closures: [],
    photos: [],
    tombstones: {},
  };
}

/** Füllt fehlende Felder auf, damit ältere oder fremde Dateien geladen werden können. */
export function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const state = { ...base, schema: SCHEMA_VERSION };
  state.settings = { ...base.settings, ...(raw.settings || {}) };
  state.tombstones = { ...(raw.tombstones || {}) };
  for (const col of COLLECTIONS) {
    state[col] = Array.isArray(raw[col]) ? raw[col].filter((x) => x && typeof x.id === 'string') : [];
  }
  state.kids = state.kids.map((k) => ({
    type: 'schule',
    followsSchoolHolidays: k.type ? k.type === 'schule' || k.type === 'hort' : true,
    periods: DEFAULT_PERIODS,
    ...k,
  }));
  state.pickups = state.pickups.map((p) => ({ weekdays: [], skipOnDayOff: true, ...p }));
  state.events = state.events.map((e) => ({ kidIds: [], repeat: 'none', exdates: [], ...e }));
  state.closures = state.closures.map((c) => ({ kidIds: [], ...c }));
  return state;
}

const TOMBSTONE_TTL = 400 * 86400000;

/**
 * Führt zwei Datenstände zusammen. Pro Datensatz gewinnt die neuere Fassung;
 * ein Grabstein, der neuer ist als der Datensatz, entfernt ihn.
 */
export function mergeStates(a, b, now = Date.now()) {
  const left = normalize(a);
  const right = normalize(b);
  const tombstones = { ...left.tombstones };
  for (const [id, ts] of Object.entries(right.tombstones)) {
    if (!(tombstones[id] >= ts)) tombstones[id] = ts;
  }
  for (const [id, ts] of Object.entries(tombstones)) {
    if (now - ts > TOMBSTONE_TTL) delete tombstones[id];
  }

  const merged = { ...emptyState(), tombstones };
  merged.settings = (right.settings.updatedAt || 0) > (left.settings.updatedAt || 0) ? right.settings : left.settings;

  for (const col of COLLECTIONS) {
    const byId = new Map();
    for (const item of [...left[col], ...right[col]]) {
      const existing = byId.get(item.id);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) byId.set(item.id, item);
    }
    merged[col] = [...byId.values()].filter((item) => !(tombstones[item.id] >= (item.updatedAt || 0)));
  }
  return merged;
}

/** Stabile Id für eine geänderte Abholung an einem bestimmten Tag. */
export function overrideId(pickupId, date) {
  return `${pickupId}@${date}`;
}

export function byId(list, id) {
  return list.find((x) => x.id === id) || null;
}
