// Timer engine. Pure functions over a plain, JSON-serialisable session object.
//
// Time is never counted in ticks. A running tile stores when it started
// (run_started_at) and how much time it had banked before that (elapsed_ms);
// everything is derived from `now`. That keeps timers exact when the browser
// throttles background tabs, the screen locks, or the app is reloaded.
//
// Tile states: idle -> running <-> paused -> time-up -> completed.
// The session clock is simply (tiles x 5:00) minus the time spent in tiles,
// so it can only move while a tile is running.

export const TILE_MS = 5 * 60 * 1000;

export function newTile(entry) {
  return {
    slot_id: entry.slot_id,
    item_id: entry.item_id ?? null,
    item_text: entry.item_text ?? '',
    subtype_id: entry.subtype_id ?? null,
    subtype_name: entry.subtype_name ?? '',
    area_id: entry.area_id ?? null,
    area_name: entry.area_name ?? '',
    url: entry.url ?? '',
    empty: !!entry.empty,
    state: 'idle',
    elapsed_ms: 0,
    run_started_at: null,
    timeup_at: null,
    elapsed_seconds: 0,
    completed: false,
    rating: null,
    completed_at: null,
  };
}

export function createSession({ id, date, entries, now }) {
  return {
    id,
    date,
    started_at: now,
    ended_at: null,
    status: 'active',
    total_active_seconds: 0,
    tiles: entries.map(newTile),
    running: null, // index of the running tile
    last_tile: null, // index of the tile the master button resumes
    last_activity_at: now,
  };
}

export function sessionLengthMs(s) {
  return s.tiles.length * TILE_MS;
}

export function tileElapsed(tile, now) {
  let ms = tile.elapsed_ms;
  if (tile.state === 'running' && tile.run_started_at != null) {
    ms += Math.max(0, now - tile.run_started_at);
  }
  return Math.min(ms, TILE_MS);
}

export function tileRemaining(tile, now) {
  return TILE_MS - tileElapsed(tile, now);
}

export function sessionElapsed(s, now) {
  return s.tiles.reduce((sum, t) => sum + tileElapsed(t, now), 0);
}

export function sessionRemaining(s, now) {
  return sessionLengthMs(s) - sessionElapsed(s, now);
}

export function completedCount(s) {
  return s.tiles.filter((t) => t.completed).length;
}

export function allCompleted(s) {
  return s.tiles.every((t) => t.completed);
}

/**
 * Bring the session up to date with `now`: a running tile whose five minutes
 * have passed moves to time-up. Returns the transitions that happened so the
 * caller can chime (or not, if the time-up happened long ago).
 */
export function settle(s, now) {
  const events = [];
  const i = s.running;
  if (i == null) return events;
  const t = s.tiles[i];
  if (t.state !== 'running') {
    s.running = null;
    return events;
  }
  if (t.elapsed_ms + Math.max(0, now - t.run_started_at) >= TILE_MS) {
    t.timeup_at = t.run_started_at + (TILE_MS - t.elapsed_ms);
    t.elapsed_ms = TILE_MS;
    t.run_started_at = null;
    t.state = 'timeup';
    s.running = null;
    s.last_activity_at = t.timeup_at;
    events.push({ type: 'timeup', index: i, at: t.timeup_at });
  }
  return events;
}

/** Bank the running tile's time and pause it. */
function stopRunning(s, now) {
  const i = s.running;
  if (i == null) return;
  const t = s.tiles[i];
  t.elapsed_ms = tileElapsed(t, now);
  t.run_started_at = null;
  t.state = 'paused';
  s.running = null;
}

/** Start an idle tile or resume a paused one. Any other running tile is paused. */
export function startTile(s, i, now) {
  settle(s, now);
  const t = s.tiles[i];
  if (!t || (t.state !== 'idle' && t.state !== 'paused')) return false;
  if (s.running != null && s.running !== i) stopRunning(s, now);
  t.state = 'running';
  t.run_started_at = now;
  s.running = i;
  s.last_tile = i;
  s.last_activity_at = now;
  return true;
}

export function pauseTile(s, i, now) {
  settle(s, now);
  if (s.running !== i) return false;
  stopRunning(s, now);
  s.last_activity_at = now;
  return true;
}

/** Master pause: pauses whichever tile is running. */
export function masterPause(s, now) {
  settle(s, now);
  if (s.running == null) return false;
  s.last_tile = s.running;
  stopRunning(s, now);
  s.last_activity_at = now;
  return true;
}

/** Master resume: restarts the tile that was last active, if it is still paused. */
export function masterResume(s, now) {
  settle(s, now);
  const i = s.last_tile;
  if (i == null || s.tiles[i].state !== 'paused') return false;
  return startTile(s, i, now);
}

/** 'running' | 'paused' (resumable) | 'idle'. Call settle() first. */
export function masterState(s) {
  if (!s || s.status !== 'active') return 'idle';
  if (s.running != null) return 'running';
  if (s.last_tile != null && s.tiles[s.last_tile].state === 'paused') return 'paused';
  return 'idle';
}

/** Complete a time-up tile, or finish a paused/running tile early. */
export function completeTile(s, i, now) {
  settle(s, now);
  const t = s.tiles[i];
  if (!t || !['running', 'paused', 'timeup'].includes(t.state)) return false;
  if (s.running === i) stopRunning(s, now);
  t.state = 'completed';
  t.completed = true;
  t.completed_at = now;
  t.elapsed_seconds = Math.round(t.elapsed_ms / 1000);
  if (s.last_tile === i) s.last_tile = null;
  s.last_activity_at = now;
  return true;
}

export function rateTile(s, i, rating) {
  const t = s.tiles[i];
  if (!t || !t.completed) return false;
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return false;
  t.rating = rating;
  return true;
}

/** End the session. Complete if every tile is completed, otherwise partial. */
export function endSession(s, now) {
  settle(s, now);
  stopRunning(s, now);
  let totalMs = 0;
  for (const t of s.tiles) {
    t.elapsed_seconds = Math.round(t.elapsed_ms / 1000);
    totalMs += t.elapsed_ms;
  }
  s.total_active_seconds = Math.round(totalMs / 1000);
  s.ended_at = now;
  s.status = allCompleted(s) ? 'complete' : 'partial';
  s.running = null;
  s.last_tile = null;
  s.last_activity_at = now;
  return s;
}

/**
 * A session from an earlier day that nobody has touched for an hour was
 * abandoned, not crossing midnight. It gets closed as partial.
 */
export const STALE_AFTER_MS = 60 * 60 * 1000;

export function isStale(s, today, now) {
  if (!s || s.status !== 'active' || s.date >= today) return false;
  if (s.running != null && s.tiles[s.running].state === 'running') return false;
  return now - (s.last_activity_at ?? s.started_at) >= STALE_AFTER_MS;
}
