// End-to-end smoke test in headless Chromium with a phone viewport and a fake clock.
// Needs a static server on BASE (default http://localhost:8080/).
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/smoke.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIN = 60_000;
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: process.env.SCHEME || 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // Taps are async (each change is saved before the UI updates), so poll briefly.
  const settle = async (fn, want, ms = 3000) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) {
      v = await fn();
      if (v === want) return v;
      await new Promise((r) => setTimeout(r, 25));
    }
    return v;
  };
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const tile = (i) => page.locator('.tile').nth(i);
  const state = (i) => tile(i).getAttribute('data-state');
  const tap = (i) => page.locator('.tile-main').nth(i).click();
  const stateIs = async (i, want) => (await settle(() => state(i), want)) === want;
  const text = (loc, want) => settle(() => loc.textContent(), want);
  const focusOpen = async (want = true) => (await settle(() => page.locator('.focus').isVisible(), want)) === want;
  const focusState = (want) => settle(() => page.locator('.focus').getAttribute('data-state'), want);
  const primary = () => page.locator('.focus-primary').click();
  const back = () => page.locator('.focus-back').click();
  const rateWith = async (stars) => {
    await page.waitForSelector('dialog.rating-sheet[open]');
    await page.locator('dialog.rating-sheet .star').nth(stars - 1).click();
    await page.waitForSelector('dialog.rating-sheet', { state: 'detached' });
  };

  // A paused fake clock: time only moves when the test says so (also across reloads).
  await page.clock.install({ time: new Date('2026-10-03T17:59:00') });
  await page.clock.pauseAt(new Date('2026-10-03T18:00:00'));
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  check((await page.locator('.tile').count()) === 12, '12 tiles render');
  check((await page.locator('.clock').textContent()) === '60:00', 'session clock starts at 60:00');
  check(!(await page.locator('.focus').isVisible()), 'no focus view before starting');
  await shot('01-plan');

  // Swap tile 5 before starting.
  const before = await tile(4).locator('.tile-text').textContent();
  await tile(4).locator('.tile-swap').click();
  const after = await text(tile(4).locator('.tile-text'), '__never__', 300);
  check(before !== after, `swap changed tile 5 (${before} -> ${after})`);

  // Tap tile 1: it opens full screen, ready; Begin starts it.
  const item1 = await tile(0).locator('.tile-text').textContent();
  await tap(0);
  check(await focusOpen(), 'tapping a block opens it full screen');
  check((await focusState('idle')) === 'idle' && (await state(0)) === 'idle', 'opening a block does not start it');
  check((await page.locator('.focus-primary').textContent()).includes('Begin'), 'primary button says Begin');
  check(await page.locator('.focus-reroll').isVisible(), 'a block not yet begun can be re-rolled');
  await primary();
  check(await stateIs(0, 'running'), 'Begin: tile 1 running');
  check(page.url().endsWith('#/block/0'), 'focus view has its own route (back gesture closes it)');
  check((await page.locator('.focus-title').textContent()) === item1, 'focus view shows the item');
  await page.clock.runFor(61_100); // the display refreshes just after each second boundary
  { const v = await text(page.locator('.focus-time'), '3:59'); check(v === '3:59', `focus countdown 3:59 (${v})`); }
  { const v = await text(page.locator('.focus-session'), '58:59 left · 0 of 12'); check(v === '58:59 left · 0 of 12', `session time in focus header (${v})`); }
  check((await page.locator('.focus-primary').textContent()).includes('Pause'), 'primary button says Pause');
  await shot('02-focus-running');

  // Back to the grid: the block keeps running there.
  await back();
  check(await focusOpen(false), '"All blocks" returns to the grid');
  check((await state(0)) === 'running', 'block keeps running behind the grid');
  check((await text(tile(0).locator('.tile-time'), '3:59')) === '3:59', 'grid tile shows the same time');
  await shot('03-grid-running');

  // Tapping the running tile reopens it; starting another pauses the first.
  await tap(0);
  check(await focusOpen(), 'tapping the running tile reopens it');
  await back();
  await focusOpen(false);
  await tap(1);
  await focusOpen();
  await primary();
  check(await stateIs(0, 'paused') && await stateIs(1, 'running'), 'starting tile 2 pauses tile 1');
  check(await focusOpen() && page.url().endsWith('#/block/1'), 'tile 2 opens full screen');
  await page.clock.runFor(5 * MIN + 1000);
  check((await focusState('timeup')) === 'timeup', 'tile 2 reaches time-up in focus');
  check((await text(page.locator('.clock'), '53:59')) === '53:59', 'session clock stopped at 53:59');
  check((await page.locator('.focus-primary').textContent()).includes('Finish'), 'primary button offers Finish and rate');
  const metroOn = () => page.evaluate(() => document.documentElement.classList.contains('metro-on'));
  check(await metroOn(), 'the metronome plays on at time-up');
  await shot('04-focus-timeup');

  // Finish and rate from the focus view, then it returns to the grid.
  await primary();
  await page.waitForSelector('dialog.rating-sheet[open]');
  check((await settle(metroOn, false)) === false, 'Finish and rate stops the metronome');
  await shot('05-rating');
  await rateWith(4);
  check(await focusOpen(false) && !page.url().includes('#/block'), 'rating from the block returns to the board');
  check(await stateIs(2, 'idle'), 'the next block waits on the board, not started');
  check(await stateIs(1, 'completed'), 'tile 2 completed');
  check((await text(tile(1).locator('.tile-status'), '4')) === '4', 'tile 2 shows rating 4');
  check((await text(page.locator('.progress-label'), '1 of 12')) === '1 of 12', 'progress 1 of 12');

  // Pause in focus, then resume from the grid's master button (which reopens focus).
  await tap(2);
  await focusOpen();
  await primary(); // Begin
  check(await page.locator('.focus .board-v').isVisible(), 'scale block shows its fretboard, upright in portrait');
  check(!(await page.locator('.focus .board-h').isVisible()), 'the sideways neck is hidden in portrait');
  check((await page.locator('.focus .board-v .board-dot.root').count()) === 2, 'C major open position: two root Cs');
  { const box = await page.locator('.focus-dock').boundingBox(); check(box.height <= 96, `the timer strip is slim (${Math.round(box.height)}px)`); }
  {
    const fit = await page.evaluate(() => {
      const body = document.querySelector('.focus-body');
      const board = document.querySelector('.focus .board-v').getBoundingClientRect();
      return { scrolls: body.scrollHeight > body.clientHeight + 1, inView: board.bottom <= body.getBoundingClientRect().bottom + 1 };
    });
    check(!fit.scrolls && fit.inView, `the whole fretboard is in view without scrolling (${JSON.stringify(fit)})`);
  }
  await page.clock.runFor(30_000);
  await primary();
  check(await stateIs(2, 'paused'), 'Pause in focus pauses tile 3');
  check((await focusState('paused')) === 'paused', 'focus shows paused state');
  await shot('06-focus-paused');
  await page.clock.runFor(10 * MIN);
  check((await text(page.locator('.clock'), '53:29')) === '53:29', 'clock frozen while paused');
  await back();
  await focusOpen(false);
  await page.locator('.master-btn').click();
  check(await stateIs(2, 'running'), 'master resume restarts tile 3');
  check(await focusOpen(), 'master resume opens it full screen');

  // Reload mid-run: exact state (and the focus view) comes back.
  await page.clock.runFor(15_000);
  await page.reload();
  await page.waitForSelector('.tile[data-state="running"]');
  check(await focusOpen(), 'focus view restored after reload');
  check((await state(0)) === 'paused' && (await state(1)) === 'completed' && (await state(2)) === 'running', 'state restored after reload');
  { const v = await text(page.locator('.clock'), '53:14'); check(v === '53:14', `clock restored after reload (${v})`); }
  check((await tile(1).locator('.tile-status').textContent()).trim() === '4', 'rating restored after reload');

  // Pause tile 3, go back, finish tile 1 early from the grid.
  await primary();
  await stateIs(2, 'paused');
  await back();
  await focusOpen(false);
  await tile(0).locator('.tile-finish').click();
  await page.waitForSelector('dialog.rating-sheet[open]');
  await page.locator('dialog.rating-sheet .rating-skip').click();
  await page.waitForSelector('dialog.rating-sheet', { state: 'detached' });
  check(await stateIs(0, 'completed'), 'tile 1 finished early, rating skipped');
  check(!(await page.locator('.focus').isVisible()), 'finishing from the grid stays on the grid');

  // Finished by mistake: reopen it from the rating sheet and carry on.
  await tap(0);
  await page.waitForSelector('dialog.rating-sheet[open] .reopen');
  await shot('07a-reopen');
  const cont = page.locator('dialog.rating-sheet .reopen .btn', { hasText: 'Continue' });
  check((await cont.textContent()).includes('3:59 left'), 'reopen offers to continue with the time left');
  await cont.click();
  check(await stateIs(0, 'running'), 'continue: block 1 running again');
  check(await focusOpen() && page.url().endsWith('#/block/0'), 'continue opens it full screen');
  check((await text(page.locator('.focus-time'), '3:59')) === '3:59', 'continues from 3:59');
  await page.clock.runFor(20_000);
  await primary(); // pause
  await focusState('paused');
  await page.locator('.focus-finish').click();
  await page.waitForSelector('dialog.rating-sheet[open] .reopen');
  await page.locator('dialog.rating-sheet .reopen .btn', { hasText: 'Do it over' }).click();
  await page.waitForSelector('dialog.rating-sheet', { state: 'detached' });
  check((await focusState('running')) === 'running', 'do it over: running again, still full screen');
  check((await text(page.locator('.focus-time'), '5:00')) === '5:00', 'do it over starts from 5:00');

  // The metronome follows the block: Do it over began it; Pause stops it, Resume starts it again.
  const metro = () => page.evaluate(async () => {
    const { metronome } = await import('./js/audio.js');
    return { playing: metronome.playing, level: metronome.level, bpm: metronome.bpm };
  });
  const playing = (want) => settle(async () => (await metro()).playing, want);
  check(await playing(true), 'metronome started with the block');
  check((await text(page.locator('.focus-metro-bpm'), '70')) === '70', 'block header shows the tempo');
  await primary(); // pause
  check(!(await playing(false)), 'Pause stops the metronome');
  await primary(); // resume
  check(await playing(true), 'Resume starts it again');
  await page.clock.runFor(5 * MIN + 1000);
  await focusState('timeup');
  { const m = await settle(async () => (await metro()).level, 0.5); check(m === 0.5, `metronome at half volume at time-up (${m})`); }
  check((await metro()).playing, 'metronome keeps playing at time-up');
  await back();
  await focusOpen(false);
  check(!(await settle(async () => (await metro()).playing, false)), 'back on the grid: metronome stopped');
  check(!(await page.evaluate(() => document.documentElement.classList.contains('metro-on'))), 'beat pulse gone');
  await tap(0);
  await page.waitForSelector('dialog.rating-sheet[open]');
  await page.locator('dialog.rating-sheet .rating-skip').click();
  await page.waitForSelector('dialog.rating-sheet', { state: 'detached' });
  check(await stateIs(0, 'completed'), 'block 1 finished again');

  // Tempo: the one you last chose carries from block to block, unless a block names its own.
  await page.evaluate(() => window.timebox.app.updateSettings({ metronome: { ...window.timebox.app.settings.metronome, bpm: 92 } }));
  await tap(3);
  await focusOpen();
  await primary();
  check((await settle(async () => (await metro()).bpm, 92)) === 92, 'a block without a tempo uses the last one chosen (92)');
  await back();
  await focusOpen(false);
  check(!(await playing(false)), 'stopped on the grid');
  const strumText = await tile(8).locator('.tile-text').textContent();
  await tap(8);
  await focusOpen();
  await primary();
  check((await settle(async () => (await metro()).bpm, 70)) === 70, `a block that names its tempo uses it (${strumText})`);
  await primary(); // pause
  await back();
  await focusOpen(false);
  check(await stateIs(3, 'paused'), 'beginning another block paused the first');

  // Metronome sheet opens and closes.
  await page.locator('.metro-btn').click();
  await page.waitForSelector('dialog.metro-sheet[open]');
  await shot('07-metronome');
  await page.keyboard.press('Escape');

  // End session (partial).
  await page.locator('.end-btn').click();
  await page.waitForSelector('dialog.confirm-sheet[open]');
  await page.locator('dialog.confirm-sheet .btn-primary').click();
  await page.waitForSelector('[data-mode="done"]');
  check((await page.locator('.done-title').textContent()) === 'Session saved', 'done screen after ending');
  await shot('08-done');

  // A stale focus route falls back to the grid.
  await page.goto(`${BASE}#/block/3`);
  check(await focusOpen(false), 'focus route without an active session shows the grid');

  // Stats and settings screens render.
  await page.goto(`${BASE}#/stats`);
  await page.waitForSelector('.page-title');
  await page.locator('.share-row').first().click();
  await page.waitForSelector('.page-title');
  await page.goto(`${BASE}#/history`);
  await page.waitForSelector('.page-title');
  await page.locator('.row-link').first().click();
  await page.goto(`${BASE}#/settings`);
  await page.waitForSelector('.page-title');

  // A full 12-block session from a fresh plan, with a reload halfway through.
  // (Metronome off for this run: under the fake clock every click would be simulated.)
  await page.evaluate(() => window.timebox.app.updateSettings({ metronome: { ...window.timebox.app.settings.metronome, auto: false } }));
  await page.goto(BASE);
  await page.waitForSelector('[data-mode="done"]');
  await page.locator('.master-btn').click(); // New
  await page.waitForSelector('[data-mode="plan"]');
  for (let i = 0; i < 12; i++) {
    await focusOpen(false);
    await tap(i);
    await focusOpen();
    check(page.url().endsWith(`#/block/${i}`), `block ${i + 1} is open`);
    await primary(); // Begin
    if (i === 3) {
      check((await page.locator('.focus .chord').count()) === 5, 'chord block shows five chord boxes');
      await shot('10-focus-chords');
    }
    if (i === 8) {
      check((await page.locator('.focus .diagram-strum .strum-slot').count()) >= 4, 'strumming block shows its pattern as arrows');
      await shot('11-focus-strum');
    }
    if (i === 11) {
      check(await page.locator('.focus .diagram-tab .tab').isVisible(), 'lick block shows its tab');
      check((await page.locator('.focus-title').textContent()).includes('G run'), 'the last slot is a lick');
      await page.locator('.focus-edit').click();
      await page.waitForSelector('dialog.item-sheet[open]');
      check(!(await page.locator('dialog.item-sheet .text-btn', { hasText: 'Archive' }).count()), 'no archiving from a running block');
      await page.fill('dialog.item-sheet textarea.notes-input', 'Got it at 80 bpm.');
      await page.locator('dialog.item-sheet .sheet-actions .btn-primary').click();
      check((await text(page.locator('.focus-notes'), 'Got it at 80 bpm.')) === 'Got it at 80 bpm.', 'notes added from the block show on it');
      await shot('12-focus-lick');
    }
    await page.clock.runFor(5 * MIN);
    if (i === 6) {
      await page.reload();
      await page.waitForSelector('.tile[data-state]');
      await focusOpen();
    }
    await focusState('timeup');
    await primary();
    await rateWith((i % 5) + 1);
    check(await focusOpen(false), `rating block ${i + 1} returns to the board`);
  }
  check(await focusOpen(false), 'after the last block, back to the grid');
  check((await text(page.locator('.done-title'), 'Session complete')) === 'Session complete', 'full session ends complete');
  const last = await page.evaluate(() => {
    const s = window.timebox.app.doneSession;
    return { secs: s.total_active_seconds, rated: s.tiles.filter((t) => t.rating).length, status: s.status };
  });
  check(last.secs === 3600 && last.rated === 12 && last.status === 'complete', `exactly 60:00 logged, 12 ratings (${JSON.stringify(last)})`);
  await shot('09-full-session-done');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
