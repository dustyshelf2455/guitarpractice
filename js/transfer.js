// Export / import: schema validation, migration, merge and replace planning.
// Everything here is pure so it can be tested without a browser.

import { SCHEMA_VERSION, SLOT_COUNT, defaultSettings } from './defaults.js';
import { endSession, completedCount } from './engine.js';
import { safeUrl, clone } from './util.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v) => v == null || isNum(v);

/** Upgrade older data to the current schema. v1 is the first version. */
export function migrate(data) {
  const out = clone(data);
  // Future migrations go here, e.g. if (out.schema_version < 2) { ...; out.schema_version = 2; }
  out.schema_version = SCHEMA_VERSION;
  return out;
}

/** Fill optional fields and clean values that will be rendered. */
export function normaliseLibrary(lib) {
  const out = clone(lib);
  out.areas = out.areas.map((a, i) => ({
    id: a.id,
    name: String(a.name).slice(0, 60),
    color: Number.isInteger(a.color) ? a.color : null,
    order: isNum(a.order) ? a.order : i,
  }));
  out.subtypes = out.subtypes.map((s, i) => ({
    id: s.id,
    name: String(s.name).slice(0, 60),
    area_id: s.area_id || null,
    order: isNum(s.order) ? s.order : i,
    archived: !!s.archived,
  }));
  out.items = out.items.map((it, i) => ({
    id: it.id,
    subtype_id: it.subtype_id,
    text: String(it.text).slice(0, 200),
    url: safeUrl(it.url),
    order: isNum(it.order) ? it.order : i,
    archived: !!it.archived,
    last_completed_at: isNum(it.last_completed_at) ? it.last_completed_at : null,
  }));
  out.slots = out.slots.map((s) => ({ slot_id: s.slot_id, subtype_id: s.subtype_id }));
  return out;
}

export function buildExport(snapshot, now = Date.now()) {
  return {
    app: 'timebox',
    schema_version: SCHEMA_VERSION,
    exported_at: new Date(now).toISOString(),
    library: snapshot.library,
    settings: snapshot.settings,
    plans: snapshot.plans,
    sessions: snapshot.sessions,
  };
}

/** Validate parsed JSON. Returns a list of human-readable problems (empty = OK). */
export function validate(data) {
  const errors = [];
  const err = (msg) => errors.length < 8 && errors.push(msg);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['This file is not a Timebox export.'];
  if (data.app !== 'timebox') err('This file is not a Timebox export.');
  if (!Number.isInteger(data.schema_version) || data.schema_version < 1) err('Missing or invalid schema version.');
  else if (data.schema_version > SCHEMA_VERSION) err('This file comes from a newer version of Timebox. Update the app first.');
  if (errors.length) return errors;

  const lib = data.library;
  if (!lib || typeof lib !== 'object') return ['Missing library.'];
  for (const key of ['areas', 'subtypes', 'items', 'slots']) {
    if (!Array.isArray(lib[key])) err(`Library is missing its ${key} list.`);
  }
  if (errors.length) return errors;

  const unique = (list, what) => {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) err(`Duplicate ${what} id "${x.id}".`);
      seen.add(x.id);
    }
    return seen;
  };
  lib.areas.forEach((a, i) => { if (!isStr(a?.id) || !isStr(a?.name)) err(`Area ${i + 1} needs an id and a name.`); });
  lib.subtypes.forEach((s, i) => {
    if (!isStr(s?.id) || !isStr(s?.name)) err(`Subtype ${i + 1} needs an id and a name.`);
    else if (s.area_id != null && !isStr(s.area_id)) err(`Subtype "${s.name}" has an invalid area.`);
  });
  lib.items.forEach((it, i) => {
    if (!isStr(it?.id) || !isStr(it?.subtype_id) || !isStr(it?.text)) err(`Item ${i + 1} needs an id, subtype and text.`);
    else if (!optNum(it.last_completed_at)) err(`Item "${it.text}" has an invalid last-completed date.`);
  });
  if (errors.length) return errors;
  unique(lib.areas, 'area');
  const subIds = unique(lib.subtypes, 'subtype');
  unique(lib.items, 'item');
  for (const it of lib.items) if (!subIds.has(it.subtype_id)) err(`Item "${it.text}" belongs to an unknown subtype.`);
  if (lib.slots.length !== SLOT_COUNT) err(`Expected ${SLOT_COUNT} slots, found ${lib.slots.length}.`);
  lib.slots.forEach((s, i) => {
    if (!isStr(s?.slot_id) || !subIds.has(s?.subtype_id)) err(`Slot ${i + 1} refers to an unknown subtype.`);
  });

  if (data.settings != null && typeof data.settings !== 'object') err('Settings are invalid.');
  if (!Array.isArray(data.plans ?? [])) err('Plans must be a list.');
  else for (const p of data.plans ?? []) {
    if (!p || !DATE_RE.test(p.date) || !Array.isArray(p.entries)) { err('A daily plan is malformed.'); break; }
  }
  if (!Array.isArray(data.sessions ?? [])) err('Sessions must be a list.');
  else {
    const seen = new Set();
    for (const s of data.sessions ?? []) {
      if (!s || !isStr(s.id) || !DATE_RE.test(s.date) || !isNum(s.started_at) || !Array.isArray(s.tiles)) {
        err('A session is malformed.');
        break;
      }
      if (seen.has(s.id)) err(`Duplicate session id "${s.id}".`);
      seen.add(s.id);
      const badTile = s.tiles.find((t) => !t || !isStr(t.slot_id) || !isNum(t.elapsed_seconds ?? 0)
        || !(t.rating == null || (Number.isInteger(t.rating) && t.rating >= 1 && t.rating <= 5)));
      if (badTile) { err(`Session on ${s.date} has a malformed block.`); break; }
    }
  }
  return errors;
}

/** Fill in fields so imported sessions behave like ones recorded here. */
function normaliseSession(s) {
  const out = clone(s);
  out.tiles = out.tiles.map((t) => ({
    slot_id: t.slot_id,
    item_id: t.item_id ?? null,
    item_text: String(t.item_text ?? ''),
    subtype_id: t.subtype_id ?? null,
    subtype_name: String(t.subtype_name ?? ''),
    area_id: t.area_id ?? null,
    area_name: String(t.area_name ?? ''),
    url: safeUrl(t.url),
    empty: !!t.empty,
    state: t.state ?? (t.completed ? 'completed' : 'idle'),
    elapsed_ms: isNum(t.elapsed_ms) ? t.elapsed_ms : (t.elapsed_seconds ?? 0) * 1000,
    run_started_at: isNum(t.run_started_at) ? t.run_started_at : null,
    timeup_at: t.timeup_at ?? null,
    elapsed_seconds: t.elapsed_seconds ?? 0,
    completed: !!t.completed,
    rating: t.rating ?? null,
    completed_at: t.completed_at ?? null,
  }));
  out.running = Number.isInteger(out.running) ? out.running : null;
  out.last_tile = Number.isInteger(out.last_tile) ? out.last_tile : null;
  out.last_activity_at = out.last_activity_at ?? out.ended_at ?? out.started_at;
  out.ended_at = out.ended_at ?? null;
  out.total_active_seconds = out.total_active_seconds ?? 0;
  if (!['complete', 'partial', 'active'].includes(out.status)) out.status = 'partial';
  // A session that was still in progress when exported is closed where it stopped.
  if (out.status === 'active') {
    endSession(out, out.last_activity_at);
    if (completedCount(out) === 0) return null;
  }
  return out;
}

export function parseFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { errors: ['This file is not valid JSON.'] };
  }
  const errors = validate(data);
  if (errors.length) return { errors };
  const migrated = migrate(data);
  return {
    errors: [],
    data: {
      library: normaliseLibrary(migrated.library),
      settings: { ...defaultSettings(), ...(migrated.settings || {}) },
      plans: (migrated.plans || []).map((p) => ({ date: p.date, entries: p.entries, swap_seen: p.swap_seen || {} })),
      sessions: (migrated.sessions || []).map(normaliseSession).filter(Boolean),
      exported_at: data.exported_at,
    },
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Work out what an import would do, without doing it.
 * mode 'replace': incoming data replaces everything.
 * mode 'merge': adds sessions, plans and library entries we don't have; keeps
 * everything local (slots, settings, existing items) as it is.
 */
export function planImport(current, incoming, mode) {
  if (mode === 'replace') {
    const lines = [
      `Replace ${plural(current.sessions.length, 'session')} with ${plural(incoming.sessions.length, 'session')}.`,
      `Replace your library (${plural(current.library.items.length, 'item')}) with ${plural(incoming.library.items.length, 'item')}.`,
      'Replace your slots, areas, subtypes and settings.',
    ];
    return { lines, result: incoming, changes: true };
  }

  const out = clone(current);
  const sessionIds = new Set(out.sessions.map((s) => s.id));
  const newSessions = incoming.sessions.filter((s) => !sessionIds.has(s.id));
  out.sessions.push(...clone(newSessions));
  out.sessions.sort((a, b) => a.started_at - b.started_at);

  const planDates = new Set(out.plans.map((p) => p.date));
  const newPlans = incoming.plans.filter((p) => !planDates.has(p.date));
  out.plans.push(...clone(newPlans));

  const addMissing = (key) => {
    const have = new Set(out.library[key].map((x) => x.id));
    const add = incoming.library[key].filter((x) => !have.has(x.id));
    out.library[key].push(...clone(add));
    return add.length;
  };
  const areas = addMissing('areas');
  const subtypes = addMissing('subtypes');
  const items = addMissing('items');

  // Rotation memory: keep the most recent completion from either side.
  let rotation = 0;
  const incomingItems = new Map(incoming.library.items.map((it) => [it.id, it]));
  for (const it of out.library.items) {
    const other = incomingItems.get(it.id);
    if (other && other.last_completed_at != null && (it.last_completed_at == null || other.last_completed_at > it.last_completed_at)) {
      it.last_completed_at = other.last_completed_at;
      rotation++;
    }
  }

  const skipped = incoming.sessions.length - newSessions.length;
  const lines = [
    `Add ${plural(newSessions.length, 'session')}${skipped ? ` (${skipped} already here, skipped)` : ''}.`,
    `Add ${plural(items, 'library item')}, ${plural(subtypes, 'subtype')} and ${plural(areas, 'area')}.`,
  ];
  if (newPlans.length) lines.push(`Add ${plural(newPlans.length, 'daily plan')}.`);
  if (rotation) lines.push(`Update rotation dates on ${plural(rotation, 'item')}.`);
  lines.push('Your slots, settings and existing items stay as they are.');
  const changes = newSessions.length + newPlans.length + areas + subtypes + items + rotation > 0;
  return { lines, result: out, changes };
}
