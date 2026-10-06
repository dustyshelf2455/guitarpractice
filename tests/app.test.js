import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../js/state.js';
import { SCHEMA_VERSION } from '../js/defaults.js';
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

test('a block finished by mistake reopens, and its item keeps its place in the rotation', async () => {
  const { make, clock } = setup();
  let app = await make();
  const itemId = app.boardTiles()[2].item_id;
  await app.tapTile(2);
  clock.now += MIN;
  await app.tapTile(2); // pause
  const r = await app.completeTile(2);
  assert.equal(r.action, 'completed');
  assert.equal(app.item(itemId).last_completed_at, clock.now);
  assert.ok(app.canReopen(r.session.id, 2));
  assert.equal(app.canReopen(r.session.id, 3), false, 'not finished, nothing to reopen');

  clock.now += 5000;
  assert.ok(await app.reopenTile(r.session.id, 2));
  const t = app.active.tiles[2];
  assert.equal(t.state, 'running', 'continues straight away');
  assert.equal(app.item(itemId).last_completed_at, null, 'never completed after all');
  clock.now += 30_000;
  assert.equal(TILE_MS - (t.elapsed_ms + (clock.now - t.run_started_at)), 3.5 * MIN);

  await app.tapTile(2); // pause
  await app.completeTile(2);
  assert.ok(await app.reopenTile(r.session.id, 2, { restart: true }));
  app = await make();
  assert.equal(app.active.tiles[2].state, 'running');
  assert.equal(app.active.tiles[2].elapsed_ms, 0, 'do it over: from 5:00');
});

test('reopening the last block brings a finished session back', async () => {
  const { make, clock } = setup();
  let app = await make();
  for (let i = 0; i < 12; i++) {
    await app.tapTile(i);
    clock.now += TILE_MS + 2000;
    await app.tick();
    await app.tapTile(i);
  }
  assert.equal(app.mode, 'done');
  const s = app.doneSession;
  const itemId = s.tiles[11].item_id;
  assert.ok(app.canReopen(s.id, 11));
  assert.ok(await app.reopenTile(s.id, 11, { restart: true }));
  assert.equal(app.mode, 'active');
  assert.equal(app.active.id, s.id);
  assert.equal(app.active.status, 'active');
  assert.equal(app.active.tiles[11].state, 'running');
  assert.equal(app.item(itemId).last_completed_at, null);
  app = await make();
  assert.equal(app.mode, 'active', 'survives a reload');
  assert.equal(app.sessions.length, 1, 'still one session, not a copy');

  clock.now += TILE_MS + 2000;
  await app.tick();
  await app.tapTile(11);
  assert.equal(app.mode, 'done');
  assert.equal(app.doneSession.status, 'complete');
});

test('older sessions cannot be reopened', async () => {
  const { make, clock } = setup();
  const app = await make();
  await app.tapTile(0);
  clock.now += MIN;
  await app.tapTile(0);
  await app.completeTile(0);
  const old = await app.endSession();
  await app.newSession();
  await app.tapTile(1); // a new session is under way
  assert.equal(app.canReopen(old.id, 0), false);
  assert.equal(await app.reopenTile(old.id, 0), false);
});

test('locking a block: it stays on the board every day until unlocked, and cannot be re-rolled', async () => {
  const { make, clock } = setup();
  let app = await make();
  const songId = app.boardTiles()[6].item_id;
  assert.ok(app.canLock(6) && !app.isLocked(6));
  assert.ok(app.canSwap(6));
  assert.ok(await app.setLocked(6, true));
  assert.ok(app.isLocked(6));
  assert.equal(app.canSwap(6), false, 'no re-roll on a locked block');
  assert.equal(await app.swap(6), false);

  // Practise it today (session, completion, end), then next days it is still there.
  await app.tapTile(6);
  clock.now += TILE_MS + 1000;
  await app.tick();
  await app.tapTile(6);
  await app.endSession();
  for (const day of [4, 5, 6]) {
    clock.now = at(2026, 10, day, 18);
    app = await make();
    assert.equal(app.boardTiles()[6].item_id, songId, `day ${day}: locked song still on the board`);
    assert.ok(app.isLocked(6));
  }
  // The lock survives export and import.
  const file = JSON.stringify(buildExport(app.snapshot()));
  assert.equal(parseFile(file).data.library.slots[6].lock, songId);

  // Changing the slot's subtype, or archiving the item, releases the lock.
  await app.setLocked(6, false);
  assert.equal(app.isLocked(6), false);
  assert.ok(app.canSwap(6), 're-roll is back');
  await app.setLocked(6, true);
  assert.equal(await app.setItemArchived(songId, true), true, 'archiving reports the released lock');
  assert.equal(app.library.slots[6].lock, undefined);
  await app.setItemArchived(songId, false);
  await app.setLocked(6, true);
  await app.setSlotSubtype(6, 'warmup');
  assert.equal(app.library.slots[6].lock, undefined);
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

test('upgrading to v4 puts a lick in today\'s plan, unless a session is under way', async () => {
  const { defaultLibrary } = await import('../js/defaults.js');
  const { generatePlan } = await import('../js/plan.js');
  const v3 = () => {
    const lib = defaultLibrary();
    lib.subtypes = lib.subtypes.filter((st) => st.id !== 'licks');
    lib.items = lib.items.filter((i) => i.subtype_id !== 'licks');
    lib.slots[11].subtype_id = 'backing';
    return lib;
  };
  const store = memoryStore();
  const lib = v3();
  await store.putMany({ meta: { schema_version: 3, library: lib, settings: {} } });
  await store.put('plans', generatePlan(lib, '2026-10-04'));
  const app = new App(store, () => at(2026, 10, 4, 18));
  await app.load();
  assert.equal(app.boardTiles()[11].subtype_id, 'licks');
  assert.equal(app.boardTiles()[11].item_id, 'licks-1');

  // Mid-session: the session keeps its blocks; the slots still change for next time.
  const { createSession } = await import('../js/engine.js');
  const { snapshotEntry } = await import('../js/plan.js');
  const busy = memoryStore();
  const lib2 = v3();
  const plan = generatePlan(lib2, '2026-10-04');
  await busy.putMany({ meta: { schema_version: 3, library: lib2, settings: {} } });
  await busy.put('plans', plan);
  await busy.put('sessions', createSession({ id: 's1', date: plan.date, now: at(2026, 10, 4, 17), entries: plan.entries.map((e) => snapshotEntry(lib2, e)) }));
  const app2 = new App(busy, () => at(2026, 10, 4, 18));
  await app2.load();
  assert.equal(app2.mode, 'active');
  assert.equal(app2.boardTiles()[11].subtype_id, 'backing', 'the session in progress is left alone');
  assert.equal(app2.library.slots[11].subtype_id, 'licks', 'slots upgraded for the next plan');
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
  assert.equal(await store.get('meta', 'schema_version'), SCHEMA_VERSION);
  assert.equal(app.library.slots[11].subtype_id, 'licks', 'untouched slots get the Licks slot');
  assert.ok(app.item('chords-8'), 'walk-ups added');
  assert.equal((await store.get('meta', 'library')).items.find((i) => i.id === 'scales-1').diagrams.length, 1, 'migrated library saved');
  assert.equal(app.settings.theme, 'dark', 'settings untouched');
});

test('backup reminder: due after practice or edits, cleared by a backup, kept through a restore', async () => {
  const { make, clock } = setup();
  let app = await make();
  assert.equal(app.looksNew, true);
  assert.equal(app.backupStatus().due, false, 'nothing to lose on a fresh install');

  // One session, never backed up: due straight away.
  await app.tapTile(0);
  clock.now += 2 * MIN;
  await app.completeTile(0);
  assert.equal(app.backupStatus().due, false, 'a session in progress is not counted yet');
  await app.endSession();
  let st = app.backupStatus();
  assert.equal(st.sessions, 1);
  assert.equal(st.due, true);
  assert.equal(app.looksNew, false);

  // Backing up clears it; it survives a restart.
  await app.markBackedUp();
  app = await make();
  st = app.backupStatus();
  assert.equal(st.at, clock.now);
  assert.deepEqual([st.sessions, st.edits, st.due], [0, 0, false]);

  // A library edit is owed, but not due until a week has passed.
  await app.addItem('scales', 'E major scale');
  st = app.backupStatus();
  assert.deepEqual([st.edits, st.due], [1, false]);
  clock.now += 7 * 24 * 60 * MIN;
  assert.equal(app.backupStatus().due, true, 'a week later it is due');
  assert.equal(app.backupStatus().days, 7);

  // Restoring keeps the backup record it is given.
  const file = parseFile(JSON.stringify(buildExport(app.snapshot(), clock.now)));
  await app.replaceAll(file.data, { at: clock.now, edits: 0 });
  app = await make();
  assert.equal(app.backupStatus().due, false);
  assert.equal(app.sessions.length, 1);
});

test('backup reminder: five sessions since the last backup make it due within the week', async () => {
  const { make, clock } = setup();
  const app = await make();
  await app.markBackedUp();
  for (let n = 0; n < 5; n++) {
    clock.now += 60 * MIN;
    await app.tapTile(n);
    clock.now += 2 * MIN;
    await app.completeTile(n);
    await app.endSession();
    if (app.mode === 'done') await app.newSession();
    assert.equal(app.backupStatus().due, n === 4, `due only at the fifth session (after ${n + 1})`);
  }
});
