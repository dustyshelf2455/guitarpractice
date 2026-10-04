import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../js/state.js';
import { memoryStore } from '../js/store.js';
import { TILE_MS, sessionRemaining } from '../js/engine.js';
import { buildExport, parseFile, planImport } from '../js/transfer.js';

const MIN = 60_000;
// Local-time timestamps so date boundaries match the app's local calendar.
const at = (y, mo, d, h, m = 0, s = 0) => new Date(y, mo - 1, d, h, m, s).getTime();

function setup(start = at(2026, 10, 3, 18)) {
  const clock = { now: start };
  const store = memoryStore();
  const make = async () => {
    const app = new App(store, () => clock.now);
    await app.load();
    return app;
  };
  return { clock, store, make };
}

test('first run seeds defaults and a stable plan for today', async () => {
  const { make, clock } = setup();
  const app = await make();
  assert.equal(app.mode, 'plan');
  assert.equal(app.boardTiles().length, 12);
  const first = app.boardTiles().map((t) => t.item_id);
  clock.now += 3 * 3600 * 1000;
  const again = await make();
  assert.deepEqual(again.boardTiles().map((t) => t.item_id), first, 'reopening the same day shows the same plan');
});

test('tapping a tile starts the session; state survives closing the app', async () => {
  const { make, clock } = setup();
  let app = await make();
  assert.equal((await app.tapTile(0)).action, 'started');
  assert.equal(app.mode, 'active');
  clock.now += 2 * MIN;
  await app.tapTile(3); // switches: tile 0 pauses
  clock.now += 1 * MIN;
  app = await make(); // "close and reopen"
  assert.equal(app.active.tiles[0].state, 'paused');
  assert.equal(app.active.tiles[3].state, 'running');
  assert.equal(sessionRemaining(app.active, clock.now), 57 * MIN);
});

test('time-up while the app was closed is restored, then tap completes and rates', async () => {
  const { make, clock } = setup();
  let app = await make();
  await app.tapTile(0);
  clock.now += 9 * MIN;
  app = await make();
  assert.equal(app.active.tiles[0].state, 'timeup');
  const r = await app.tapTile(0);
  assert.equal(r.action, 'completed');
  await app.rateTile(r.session.id, 0, 4);
  app = await make();
  assert.equal(app.active.tiles[0].rating, 4);
  assert.equal(app.active.tiles[0].elapsed_seconds, 300);
  assert.equal(app.library.items.find((i) => i.id === app.active.tiles[0].item_id).last_completed_at, clock.now);
});

test('full session: 12 blocks complete, saved as complete, done screen, rotation next day', async () => {
  const { make, clock } = setup();
  const app = await make();
  const planned = app.boardTiles().map((t) => t.item_id);
  for (let i = 0; i < 12; i++) {
    await app.tapTile(i);
    clock.now += TILE_MS + 2000;
    await app.tick();
    const r = await app.tapTile(i);
    assert.equal(r.action, 'completed');
    await app.rateTile(r.session.id, i, 3);
  }
  assert.equal(app.active, null);
  assert.equal(app.mode, 'done');
  const s = app.doneSession;
  assert.equal(s.status, 'complete');
  assert.equal(s.total_active_seconds, 3600);
  assert.ok(s.tiles.every((t) => t.rating === 3));

  clock.now = at(2026, 10, 4, 9);
  const next = await (async () => { const a = new App(app.store, () => clock.now); await a.load(); return a; })();
  assert.equal(next.mode, 'plan');
  const tomorrow = next.boardTiles().map((t) => t.item_id);
  assert.notDeepEqual(tomorrow, planned);
  assert.ok(!tomorrow.slice(4, 8).some((id) => planned.includes(id)), 'yesterday\'s songs rotate out');
});

test('master pause and resume through the app', async () => {
  const { make, clock } = setup();
  const app = await make();
  assert.equal(await app.masterToggle(), 'idle');
  await app.tapTile(5);
  clock.now += 30_000;
  assert.equal(await app.masterToggle(), 'paused');
  clock.now += 10 * MIN;
  assert.equal(await app.masterToggle(), 'running');
  assert.equal(app.active.running, 5);
  clock.now += 30_000;
  assert.equal(sessionRemaining(app.active, clock.now), 59 * MIN);
});

test('end session: partial is saved; nothing completed is discarded', async () => {
  const { make, clock } = setup();
  let app = await make();
  await app.tapTile(0);
  clock.now += MIN;
  assert.equal(await app.endSession(), null, 'nothing completed -> discarded');
  assert.equal(app.sessions.length, 0);
  assert.equal(app.mode, 'plan');

  await app.tapTile(1);
  clock.now += MIN;
  await app.tapTile(1); // pause
  await app.completeTile(1); // finish early
  const saved = await app.endSession();
  assert.equal(saved.status, 'partial');
  app = await make();
  assert.equal(app.sessions.length, 1);
  assert.equal(app.mode, 'done');
  await app.newSession();
  assert.equal(app.mode, 'plan');
  assert.notEqual(app.boardTiles()[1].item_id, saved.tiles[1].item_id, 'completed item rotated out of the new plan');
});

test('swap persists, works on idle tiles mid-session, never on started ones', async () => {
  const { make } = setup();
  let app = await make();
  const before = app.boardTiles()[4].item_id;
  assert.equal(await app.swap(4), true);
  const after = app.boardTiles()[4].item_id;
  assert.notEqual(after, before);
  app = await make();
  assert.equal(app.boardTiles()[4].item_id, after, 'swap survives reload');
  await app.tapTile(0);
  assert.equal(app.canSwap(0), false);
  assert.equal(await app.swap(0), false);
  assert.equal(await app.swap(5), true);
  assert.equal(app.active.tiles[5].item_id, app.currentPlan.entries[5].item_id);
});

test('a session crossing midnight keeps its plan; an abandoned one closes as partial', async () => {
  const { make, clock } = setup(at(2026, 10, 3, 23, 50));
  let app = await make();
  await app.tapTile(0);
  clock.now = at(2026, 10, 3, 23, 56);
  await app.tick();
  await app.tapTile(0); // complete
  await app.tapTile(1);
  clock.now = at(2026, 10, 4, 0, 3);
  app = await make();
  assert.equal(app.mode, 'active', 'still the same session after midnight');
  assert.equal(app.active.date, '2026-10-03');
  assert.equal(app.active.tiles[1].state, 'timeup');

  clock.now = at(2026, 10, 4, 9);
  app = await make();
  assert.equal(app.active, null);
  assert.equal(app.mode, 'plan');
  assert.equal(app.sessions[0].status, 'partial');
  assert.equal(app.today, '2026-10-04');
  assert.ok(app.plans.has('2026-10-04'));
});

test('library edits: new items fill an empty subtype, slot changes reconcile the plan', async () => {
  const { make } = setup();
  const app = await make();
  for (const it of app.library.items.filter((i) => i.subtype_id === 'scales')) await app.setItemArchived(it.id, true);
  assert.equal(app.boardTiles()[2].empty, true);
  const item = await app.addItem('scales', 'B minor scale');
  assert.equal(app.boardTiles()[2].item_id, item.id);
  await app.setSlotSubtype(11, 'warmup');
  assert.equal(app.boardTiles()[11].subtype_id, 'warmup');
  await app.moveSlot(0, 1);
  assert.equal(app.boardTiles()[0].subtype_id, 'picking');
});

test('export -> import (replace) round-trips everything', async () => {
  const { make, clock } = setup();
  const app = await make();
  await app.tapTile(0);
  clock.now += TILE_MS;
  const r = await app.tapTile(0);
  await app.rateTile(r.session.id, 0, 5);
  await app.endSession();
  await app.addItem('songs', 'New song', 'youtube.com/watch?v=x');
  await app.updateSettings({ theme: 'light' });

  const text = JSON.stringify(buildExport(app.snapshot(), clock.now));
  const parsed = parseFile(text);
  assert.deepEqual(parsed.errors, []);

  const other = setup();
  const fresh = await other.make();
  const plan = planImport(fresh.snapshot(), parsed.data, 'replace');
  await fresh.replaceAll(plan.result);
  assert.equal(fresh.sessions.length, 1);
  assert.equal(fresh.sessions[0].tiles[0].rating, 5);
  assert.equal(fresh.settings.theme, 'light');
  const song = fresh.library.items.find((i) => i.text === 'New song');
  assert.equal(song.url, 'https://youtube.com/watch?v=x');
  assert.deepEqual(fresh.library, app.library);
});

test('import (merge) adds missing sessions and items, keeps local data', async () => {
  const a = setup();
  const appA = await a.make();
  await appA.tapTile(0);
  a.clock.now += TILE_MS;
  await appA.tapTile(0);
  await appA.endSession();
  await appA.addItem('songs', 'Song from phone A');

  const b = setup(at(2026, 10, 3, 8));
  const appB = await b.make();
  await appB.tapTile(2);
  b.clock.now += TILE_MS;
  await appB.tapTile(2);
  await appB.endSession();
  await appB.setSlotSubtype(0, 'songs');

  const parsed = parseFile(JSON.stringify(buildExport(appA.snapshot())));
  const plan = planImport(appB.snapshot(), parsed.data, 'merge');
  assert.equal(plan.changes, true);
  assert.match(plan.lines[0], /Add 1 session/);
  await appB.replaceAll(plan.result);
  assert.equal(appB.sessions.length, 2);
  assert.ok(appB.library.items.some((i) => i.text === 'Song from phone A'));
  assert.equal(appB.library.slots[0].subtype_id, 'songs', 'local slots kept');

  // Merging the same file again changes nothing.
  const again = planImport(appB.snapshot(), parsed.data, 'merge');
  assert.equal(again.changes, false);
});

test('import validation rejects bad files with readable reasons', () => {
  assert.deepEqual(parseFile('not json').errors, ['This file is not valid JSON.']);
  assert.match(parseFile('{"app":"other"}').errors[0], /not a Timebox export/);
  assert.match(parseFile(JSON.stringify({ app: 'timebox', schema_version: 99 })).errors[0], /newer version/);
  const bad = {
    app: 'timebox', schema_version: 1,
    library: { areas: [], subtypes: [{ id: 'x', name: 'X' }], items: [{ id: 'i', subtype_id: 'nope', text: 'T' }], slots: [] },
  };
  const errs = parseFile(JSON.stringify(bad)).errors;
  assert.ok(errs.some((e) => /unknown subtype/.test(e)));
  assert.ok(errs.some((e) => /Expected 12 slots/.test(e)));
});

test('imported links are sanitised: no javascript: URLs', () => {
  const data = {
    app: 'timebox', schema_version: 1,
    library: {
      areas: [], subtypes: [{ id: 'x', name: 'X' }],
      items: [{ id: 'i', subtype_id: 'x', text: 'T', url: 'javascript:alert(1)' }],
      slots: Array.from({ length: 12 }, (_, i) => ({ slot_id: `s${i}`, subtype_id: 'x' })),
    },
  };
  const parsed = parseFile(JSON.stringify(data));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.library.items[0].url, '');
});

test('an installed v1 app gets starter diagrams on upgrade, and keeps them', async () => {
  const { defaultLibrary } = await import('../js/defaults.js');
  const store = memoryStore();
  const v1 = defaultLibrary();
  for (const it of v1.items) delete it.diagrams;
  await store.putMany({ meta: { schema_version: 1, library: v1, settings: { theme: 'dark' } } });
  const app = new App(store, () => at(2026, 10, 4, 9));
  await app.load();
  assert.equal(app.item('chords-1').diagrams[0].chords.length, 5);
  assert.equal(await store.get('meta', 'schema_version'), 2);
  assert.equal((await store.get('meta', 'library')).items.find((i) => i.id === 'scales-1').diagrams.length, 1, 'migrated library saved');
  assert.equal(app.settings.theme, 'dark', 'settings untouched');
});
