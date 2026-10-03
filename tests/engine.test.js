import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_MS, createSession, startTile, pauseTile, masterPause, masterResume, masterState,
  completeTile, rateTile, endSession, settle, tileElapsed, tileRemaining,
  sessionRemaining, sessionElapsed, isStale, completedCount,
} from '../js/engine.js';

const T0 = Date.UTC(2026, 9, 3, 18, 0, 0);
const SEC = 1000;
const MIN = 60 * SEC;

function entries(n = 12) {
  return Array.from({ length: n }, (_, i) => ({ slot_id: `slot-${i + 1}`, item_id: `item-${i}`, item_text: `Item ${i}` }));
}
function fresh() {
  return createSession({ id: 's1', date: '2026-10-03', entries: entries(), now: T0 });
}
// Simulate a reload: the session only survives as JSON.
const reload = (s) => JSON.parse(JSON.stringify(s));

test('new session starts at 60:00 with every tile idle', () => {
  const s = fresh();
  assert.equal(sessionRemaining(s, T0), 60 * MIN);
  assert.ok(s.tiles.every((t) => t.state === 'idle' && tileRemaining(t, T0) === TILE_MS));
  assert.equal(masterState(s), 'idle');
});

test('a running tile counts down from timestamps, not ticks', () => {
  const s = fresh();
  startTile(s, 0, T0);
  assert.equal(s.tiles[0].state, 'running');
  assert.equal(tileRemaining(s.tiles[0], T0 + 90 * SEC), TILE_MS - 90 * SEC);
  assert.equal(sessionRemaining(s, T0 + 90 * SEC), 60 * MIN - 90 * SEC);
  assert.equal(masterState(s), 'running');
});

test('pause and resume bank elapsed time exactly', () => {
  const s = fresh();
  startTile(s, 2, T0);
  pauseTile(s, 2, T0 + 40 * SEC);
  assert.equal(s.tiles[2].state, 'paused');
  assert.equal(tileElapsed(s.tiles[2], T0 + 10 * MIN), 40 * SEC, 'no time passes while paused');
  startTile(s, 2, T0 + 10 * MIN);
  assert.equal(tileElapsed(s.tiles[2], T0 + 10 * MIN + 20 * SEC), 60 * SEC);
});

test('starting another tile pauses the running one (only one runs)', () => {
  const s = fresh();
  startTile(s, 0, T0);
  startTile(s, 5, T0 + 30 * SEC);
  assert.equal(s.tiles[0].state, 'paused');
  assert.equal(s.tiles[0].elapsed_ms, 30 * SEC);
  assert.equal(s.tiles[5].state, 'running');
  assert.equal(s.running, 5);
  assert.equal(s.tiles.filter((t) => t.state === 'running').length, 1);
  assert.equal(sessionElapsed(s, T0 + 60 * SEC), 60 * SEC);
});

test('tile reaches time-up at exactly 5:00 with no overtime', () => {
  const s = fresh();
  startTile(s, 0, T0);
  assert.deepEqual(settle(s, T0 + TILE_MS - 1), []);
  const later = T0 + TILE_MS + 3 * MIN; // e.g. screen was locked
  const events = settle(s, later);
  assert.equal(events.length, 1);
  assert.equal(events[0].at, T0 + TILE_MS, 'time-up is stamped when it really happened');
  assert.equal(s.tiles[0].state, 'timeup');
  assert.equal(tileElapsed(s.tiles[0], later), TILE_MS);
  assert.equal(sessionRemaining(s, later), 55 * MIN, 'session clock stops with the tile');
  assert.equal(masterState(s), 'idle');
});

test('time-up accounts for time banked before a pause', () => {
  const s = fresh();
  startTile(s, 1, T0);
  pauseTile(s, 1, T0 + 2 * MIN);
  startTile(s, 1, T0 + 10 * MIN);
  const events = settle(s, T0 + 20 * MIN);
  assert.equal(events[0].at, T0 + 13 * MIN);
});

test('master pause pauses the active tile; resume restores that tile', () => {
  const s = fresh();
  startTile(s, 3, T0);
  assert.equal(masterPause(s, T0 + 50 * SEC), true);
  assert.equal(s.tiles[3].state, 'paused');
  assert.equal(masterState(s), 'paused');
  assert.equal(sessionRemaining(s, T0 + 20 * MIN), 60 * MIN - 50 * SEC);
  assert.equal(masterResume(s, T0 + 20 * MIN), true);
  assert.equal(s.tiles[3].state, 'running');
  assert.equal(tileElapsed(s.tiles[3], T0 + 20 * MIN + 10 * SEC), 60 * SEC);
});

test('pausing a tile by tapping it also makes it the master-resume target', () => {
  const s = fresh();
  startTile(s, 4, T0);
  pauseTile(s, 4, T0 + 5 * SEC);
  assert.equal(masterState(s), 'paused');
  masterResume(s, T0 + 6 * SEC);
  assert.equal(s.running, 4);
});

test('master resume does nothing once the paused tile was completed', () => {
  const s = fresh();
  startTile(s, 0, T0);
  masterPause(s, T0 + 10 * SEC);
  completeTile(s, 0, T0 + 11 * SEC);
  assert.equal(masterState(s), 'idle');
  assert.equal(masterResume(s, T0 + 12 * SEC), false);
});

test('state survives a reload mid-run and keeps counting', () => {
  let s = fresh();
  startTile(s, 0, T0);
  pauseTile(s, 0, T0 + 1 * MIN);
  startTile(s, 1, T0 + 2 * MIN);
  s = reload(s);
  assert.equal(s.tiles[1].state, 'running');
  assert.equal(tileElapsed(s.tiles[1], T0 + 3 * MIN), 1 * MIN);
  assert.equal(sessionRemaining(s, T0 + 3 * MIN), 58 * MIN);
  s = reload(s);
  const events = settle(s, T0 + 9 * MIN);
  assert.equal(events[0].index, 1);
  assert.equal(s.tiles[0].state, 'paused');
  assert.equal(s.tiles[0].elapsed_ms, 1 * MIN);
});

test('clock going backwards never produces negative elapsed time', () => {
  const s = fresh();
  startTile(s, 0, T0);
  assert.equal(tileElapsed(s.tiles[0], T0 - 30 * SEC), 0);
  pauseTile(s, 0, T0 - 30 * SEC);
  assert.equal(s.tiles[0].elapsed_ms, 0);
});

test('completing early records actual elapsed seconds', () => {
  const s = fresh();
  startTile(s, 0, T0);
  pauseTile(s, 0, T0 + 132.4 * SEC);
  assert.equal(completeTile(s, 0, T0 + 200 * SEC), true);
  assert.equal(s.tiles[0].state, 'completed');
  assert.equal(s.tiles[0].elapsed_seconds, 132);
  assert.equal(s.tiles[0].completed_at, T0 + 200 * SEC);
});

test('idle and completed tiles cannot be completed or restarted', () => {
  const s = fresh();
  assert.equal(completeTile(s, 0, T0), false);
  startTile(s, 0, T0);
  settle(s, T0 + TILE_MS);
  completeTile(s, 0, T0 + TILE_MS + 1);
  assert.equal(startTile(s, 0, T0 + TILE_MS + 2), false);
  assert.equal(completeTile(s, 0, T0 + TILE_MS + 3), false);
});

test('ratings: 1-5 or null only, completed tiles only', () => {
  const s = fresh();
  assert.equal(rateTile(s, 0, 4), false);
  startTile(s, 0, T0);
  completeTile(s, 0, T0 + MIN);
  assert.equal(rateTile(s, 0, 0), false);
  assert.equal(rateTile(s, 0, 6), false);
  assert.equal(rateTile(s, 0, 2.5), false);
  assert.equal(rateTile(s, 0, 5), true);
  assert.equal(s.tiles[0].rating, 5);
  assert.equal(rateTile(s, 0, null), true);
  assert.equal(s.tiles[0].rating, null);
});

test('a full 12-block session ends complete with 60 minutes logged', () => {
  const s = fresh();
  let now = T0;
  for (let i = 0; i < 12; i++) {
    startTile(s, i, now);
    now += TILE_MS + 4 * SEC; // the user taps a few seconds after the chime
    settle(s, now);
    assert.equal(s.tiles[i].state, 'timeup');
    completeTile(s, i, now);
    rateTile(s, i, (i % 5) + 1);
  }
  assert.equal(completedCount(s), 12);
  assert.equal(sessionRemaining(s, now), 0);
  endSession(s, now);
  assert.equal(s.status, 'complete');
  assert.equal(s.total_active_seconds, 3600);
});

test('ending early saves a partial session and banks the running tile', () => {
  const s = fresh();
  startTile(s, 0, T0);
  completeTile(s, 0, T0 + 3 * MIN);
  startTile(s, 1, T0 + 4 * MIN);
  endSession(s, T0 + 5 * MIN);
  assert.equal(s.status, 'partial');
  assert.equal(s.tiles[1].state, 'paused');
  assert.equal(s.tiles[1].elapsed_seconds, 60);
  assert.equal(s.total_active_seconds, 240);
  assert.equal(s.ended_at, T0 + 5 * MIN);
  assert.equal(s.running, null);
});

test('stale detection: abandoned yesterday vs. crossing midnight', () => {
  const s = fresh(); // date 2026-10-03
  startTile(s, 0, T0);
  pauseTile(s, 0, T0 + MIN);
  assert.equal(isStale(s, '2026-10-03', T0 + 5 * 3600 * SEC), false, 'same day never stale');
  assert.equal(isStale(s, '2026-10-04', T0 + 30 * MIN), false, 'recent activity: crossing midnight');
  assert.equal(isStale(s, '2026-10-04', T0 + 14 * 3600 * SEC), true, 'next morning: abandoned');
  startTile(s, 0, T0 + 14 * 3600 * SEC);
  assert.equal(isStale(s, '2026-10-04', T0 + 14 * 3600 * SEC + MIN), false, 'running tile never stale');
});

test('timers stay exact over a long session with irregular wake-ups', () => {
  // Simulates a throttled/locked device: the app only "wakes" at random moments.
  const s = fresh();
  let now = T0;
  let expectedMs = 0;
  for (let i = 0; i < 12; i++) {
    startTile(s, i, now);
    const run = 287_345 + i * 1_013; // just under 5 min each
    let t = now;
    while (t < now + run) {
      t += Math.floor(17_000 + (i * 7919) % 50_000);
      settle(s, Math.min(t, now + run));
    }
    now += run;
    pauseTile(s, i, now);
    expectedMs += run;
    completeTile(s, i, now);
  }
  assert.equal(sessionElapsed(s, now), expectedMs);
  assert.ok(Math.abs(sessionRemaining(s, now) - (60 * MIN - expectedMs)) < 1);
});
