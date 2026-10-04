import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLibrary } from '../js/defaults.js';
import {
  generatePlan, rotationOrder, swapCandidate, applySwap, reconcilePlan,
  markCompleted, snapshotEntry, refreshIdleTiles, activeItems,
} from '../js/plan.js';
import { createSession, startTile } from '../js/engine.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 3, 18);

const ids = (plan) => plan.entries.map((e) => e.item_id);

test('default plan: one item per slot, in slot order, no repeats', () => {
  const lib = defaultLibrary();
  const plan = generatePlan(lib, '2026-10-03');
  assert.equal(plan.entries.length, 12);
  assert.deepEqual(ids(plan), [
    'warmup-1', 'picking-1', 'scales-1', 'chords-1',
    'songs-1', 'songs-2', 'songs-3', 'songs-4',
    'strumming-1', 'riffs-1', 'backing-1', 'backing-2',
  ]);
  assert.equal(new Set(ids(plan)).size, 12);
});

test('same day, same library -> same plan (stable)', () => {
  const lib = defaultLibrary();
  assert.deepEqual(generatePlan(lib, '2026-10-03'), generatePlan(lib, '2026-10-03'));
});

test('rotation: never-completed first, then oldest completion, ties by library order', () => {
  const items = [
    { id: 'a', order: 0, last_completed_at: 300 },
    { id: 'b', order: 1, last_completed_at: null },
    { id: 'c', order: 2, last_completed_at: 100 },
    { id: 'd', order: 3, last_completed_at: null },
    { id: 'e', order: 4, last_completed_at: 100 },
  ];
  assert.deepEqual(rotationOrder(items).map((i) => i.id), ['b', 'd', 'c', 'e', 'a']);
});

test('completed items rotate to the back across days', () => {
  const lib = defaultLibrary();
  const day1 = generatePlan(lib, '2026-10-03');
  for (const e of day1.entries) markCompleted(lib, e.item_id, T0);
  const day2 = generatePlan(lib, '2026-10-04');
  assert.deepEqual(ids(day2).slice(4, 8), ['songs-5', 'songs-6', 'songs-7', 'songs-8']);
  assert.equal(day2.entries[0].item_id, 'warmup-2');
  assert.equal(day2.entries[10].item_id, 'backing-3');
});

test('skipped items stay next in line; skipped days change nothing', () => {
  const lib = defaultLibrary();
  const day1 = generatePlan(lib, '2026-10-03');
  // Only the first song was completed; songs 2-4 were skipped.
  markCompleted(lib, 'songs-1', T0);
  // Nothing on 10-04 or 10-05; next practice is 10-06.
  const day4 = generatePlan(lib, '2026-10-06');
  assert.deepEqual(ids(day4).slice(4, 8), ['songs-2', 'songs-3', 'songs-4', 'songs-5']);
  assert.equal(day4.entries[0].item_id, day1.entries[0].item_id, 'uncompleted warm-up is still first');
});

test('a small subtype repeats evenly instead of leaving slots empty', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((it) => it.subtype_id !== 'songs' || ['songs-1', 'songs-2'].includes(it.id));
  const plan = generatePlan(lib, '2026-10-03');
  assert.deepEqual(ids(plan).slice(4, 8), ['songs-1', 'songs-2', 'songs-1', 'songs-2']);
});

test('archived items are never picked; an empty subtype yields a null item', () => {
  const lib = defaultLibrary();
  for (const it of lib.items) if (it.subtype_id === 'scales') it.archived = true;
  lib.items.find((it) => it.id === 'warmup-1').archived = true;
  const plan = generatePlan(lib, '2026-10-03');
  assert.equal(plan.entries[0].item_id, 'warmup-2');
  assert.equal(plan.entries[2].item_id, null);
  const snap = snapshotEntry(lib, plan.entries[2]);
  assert.equal(snap.empty, true);
  assert.equal(snap.item_text, 'Scales');
  assert.equal(snap.area_name, 'Knowledge');
});

test('swap cycles through candidates, skipping items already on the plan', () => {
  const lib = defaultLibrary();
  const plan = generatePlan(lib, '2026-10-03');
  const shown = [];
  for (let i = 0; i < 8; i++) shown.push(applySwap(lib, plan, 'slot-5').id);
  // Songs 2-4 are on other slots. Fresh candidates first: 5..10, then cycle.
  assert.deepEqual(shown.slice(0, 6), ['songs-5', 'songs-6', 'songs-7', 'songs-8', 'songs-9', 'songs-10']);
  assert.ok(!shown.includes('songs-2') && !shown.includes('songs-3') && !shown.includes('songs-4'));
  assert.equal(shown[6], 'songs-1', 'cycles back round, original included');
  assert.equal(shown[7], 'songs-5');
});

test('swap uses rotation order and is unavailable without alternatives', () => {
  const lib = defaultLibrary();
  markCompleted(lib, 'warmup-2', T0 - DAY);
  const plan = generatePlan(lib, '2026-10-03');
  assert.equal(plan.entries[0].item_id, 'warmup-1');
  assert.equal(swapCandidate(lib, plan, 'slot-1').item.id, 'warmup-3', 'recently completed warmup-2 goes last');
  lib.items = lib.items.filter((it) => it.subtype_id !== 'picking' || it.id === 'picking-1');
  const plan2 = generatePlan(lib, '2026-10-03');
  assert.equal(swapCandidate(lib, plan2, 'slot-2'), null);
});

test('swapped item is persisted on the plan entry', () => {
  const lib = defaultLibrary();
  const plan = generatePlan(lib, '2026-10-03');
  applySwap(lib, plan, 'slot-1');
  const reloaded = JSON.parse(JSON.stringify(plan));
  assert.equal(reloaded.entries[0].item_id, 'warmup-2');
  assert.equal(applySwap(lib, reloaded, 'slot-1').id, 'warmup-3');
});

test('reconcile follows slot changes and fills newly-stocked subtypes', () => {
  const lib = defaultLibrary();
  for (const it of lib.items) if (it.subtype_id === 'scales') it.archived = true;
  let plan = generatePlan(lib, '2026-10-03');
  applySwap(lib, plan, 'slot-1');
  assert.equal(plan.entries[2].item_id, null);
  // User adds a scale, changes slot 12 to Warm-up and swaps slot order 1<->2.
  lib.items.push({ id: 'new-scale', subtype_id: 'scales', text: 'B minor', order: 9, archived: false, last_completed_at: null });
  lib.slots[11].subtype_id = 'warmup';
  [lib.slots[0], lib.slots[1]] = [lib.slots[1], lib.slots[0]];
  plan = reconcilePlan(lib, plan);
  assert.equal(plan.entries[0].slot_id, 'slot-2');
  assert.equal(plan.entries[1].item_id, 'warmup-2', 'kept the swapped item');
  assert.equal(plan.entries[2].item_id, 'new-scale');
  assert.equal(plan.entries[11].subtype_id, 'warmup');
  assert.notEqual(plan.entries[11].item_id, 'warmup-2', 'no duplicate with slot 1');
  assert.deepEqual(plan.swap_seen['slot-1'], ['warmup-1', 'warmup-2']);
});

test('midnight rollover: a session keeps the plan of the day it started', () => {
  const lib = defaultLibrary();
  const plan = generatePlan(lib, '2026-10-03');
  const session = createSession({
    id: 's', date: plan.date, now: T0,
    entries: plan.entries.map((e) => snapshotEntry(lib, e)),
  });
  startTile(session, 0, T0);
  const tomorrow = generatePlan(lib, '2026-10-04');
  // The next day's plan is independent; the running session still holds its own items.
  assert.equal(session.date, '2026-10-03');
  assert.equal(session.tiles[0].item_id, 'warmup-1');
  assert.equal(tomorrow.date, '2026-10-04');
});

test('idle tiles pick up library edits, started tiles keep their snapshot', () => {
  const lib = defaultLibrary();
  const plan = generatePlan(lib, '2026-10-03');
  const s = createSession({ id: 's', date: plan.date, now: T0, entries: plan.entries.map((e) => snapshotEntry(lib, e)) });
  startTile(s, 0, T0);
  lib.items.find((it) => it.id === 'warmup-1').text = 'Renamed warm-up';
  lib.items.find((it) => it.id === 'picking-1').text = 'Renamed picking';
  refreshIdleTiles(lib, s, plan);
  assert.equal(s.tiles[0].item_text, 'Spider walk, frets 1-4, all strings');
  assert.equal(s.tiles[1].item_text, 'Renamed picking');
});

test('starter library matches the spec', () => {
  const lib = defaultLibrary();
  const count = (id) => activeItems(lib, id).length;
  assert.deepEqual(
    ['warmup', 'picking', 'scales', 'chords', 'songs', 'strumming', 'riffs', 'backing'].map(count),
    [6, 5, 5, 13, 10, 6, 5, 6],
  );
  assert.ok(lib.items.every((it) => it.text.length <= 45));
  const areaCount = {};
  for (const slot of lib.slots) {
    const area = lib.subtypes.find((s) => s.id === slot.subtype_id).area_id;
    areaCount[area] = (areaCount[area] || 0) + 1;
  }
  assert.deepEqual(areaCount, { technique: 2, knowledge: 2, repertoire: 4, time: 2, improvisation: 2 });
});
