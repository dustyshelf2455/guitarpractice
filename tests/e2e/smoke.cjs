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

  // Tap tile 1: it starts and opens full screen.
  const item1 = await tile(0).locator('.tile-text').textContent();
  await tap(0);
  check(await stateIs(0, 'running'), 'tile 1 running');
  check(await focusOpen(), 'tapping a block opens it full screen');
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
  check(await stateIs(0, 'paused') && await stateIs(1, 'running'), 'starting tile 2 pauses tile 1');
  check(await focusOpen() && page.url().endsWith('#/block/1'), 'tile 2 opens full screen');
  await page.clock.runFor(5 * MIN + 1000);
  check((await focusState('timeup')) === 'timeup', 'tile 2 reaches time-up in focus');
  check((await text(page.locator('.clock'), '53:59')) === '53:59', 'session clock stopped at 53:59');
  check((await page.locator('.focus-primary').textContent()).includes('Finish'), 'primary button offers Finish and rate');
  await shot('04-focus-timeup');

  // Finish and rate from the focus view, then it returns to the grid.
  await primary();
  await page.waitForSelector('dialog.rating-sheet[open]');
  await shot('05-rating');
  await rateWith(4);
  check(await focusOpen(false), 'rating returns to the grid');
  check(await stateIs(1, 'completed'), 'tile 2 completed');
  check((await text(tile(1).locator('.tile-status'), '4')) === '4', 'tile 2 shows rating 4');
  check((await text(page.locator('.progress-label'), '1 of 12')) === '1 of 12', 'progress 1 of 12');

  // Pause in focus, then resume from the grid's master button (which reopens focus).
  await tap(2);
  await focusOpen();
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
  await page.goto(BASE);
  await page.waitForSelector('[data-mode="done"]');
  await page.locator('.master-btn').click(); // New
  await page.waitForSelector('[data-mode="plan"]');
  for (let i = 0; i < 12; i++) {
    await tap(i);
    await focusOpen();
    await page.clock.runFor(5 * MIN);
    if (i === 6) {
      await page.reload();
      await page.waitForSelector('.tile[data-state]');
      await focusOpen();
    }
    await focusState('timeup');
    await primary();
    await rateWith((i % 5) + 1);
    await focusOpen(false);
  }
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
