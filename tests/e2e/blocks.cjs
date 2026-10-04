// End-to-end checks for opening blocks: nothing starts until Begin, re-roll
// before you begin, and locking a block to the board across days.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/blocks.cjs
const { chromium, devices } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../screenshots');
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(25);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const app = (fn, arg) => page.evaluate(fn, arg);
  const tile = (i) => page.locator('.tile').nth(i);
  const text = (i) => tile(i).locator('.tile-text').textContent();
  const focusOpen = (want = true) => until(async () => (await page.locator('.focus').isVisible()) === want);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  await page.clock.install({ time: new Date('2026-10-03T17:59:00') });
  await page.clock.pauseAt(new Date('2026-10-03T18:00:00'));
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');

  // Open the strumming block: it waits for Begin; re-roll it from inside.
  const before = await text(8);
  await page.locator('.tile-main').nth(8).click();
  check(await focusOpen(), 'block opens full screen');
  check((await app(() => window.timebox.app.mode)) === 'plan', 'no session started just by opening a block');
  const title = () => page.locator('.focus-title').textContent();
  const reroll = async () => {
    const was = await title();
    await page.locator('.focus-reroll').click();
    return until(async () => (await title()) !== was);
  };
  check(await reroll() && (await title()) !== before, 'Re-roll shows another item from the same list');
  let again = true;
  for (let k = 0; k < 8; k++) again = again && await reroll();
  check(again, 'and again, as often as you like');
  const kept = await title();
  await page.locator('.focus-back').click();
  await focusOpen(false);
  check((await text(8)) === kept, 'the grid keeps the re-rolled item');
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForSelector('.tile[data-state]');
  check((await text(8)) === kept, 'and so does a reload');

  // Lock a song from its full-screen block.
  const song = await text(6);
  await page.locator('.tile-main').nth(6).click();
  await focusOpen();
  await page.locator('.focus-lock').click();
  check(await until(async () => (await page.locator('.focus-lock').getAttribute('aria-pressed')) === 'true'), 'Lock pressed');
  check(!(await page.locator('.focus-reroll').isVisible()), 'a locked block offers no re-roll');
  await page.locator('.focus-back').click();
  await focusOpen(false);
  check(await until(async () => (await tile(6).getAttribute('class')).includes('is-locked')), 'the tile shows it is locked');
  check(await tile(6).locator('.tile-lock').isVisible(), 'with a padlock');
  check(!(await tile(6).locator('.tile-swap').isVisible()), 'and no re-roll button');
  await shot('13-locked-tile');

  // The next days: the song is still in its slot.
  await page.waitForTimeout(150);
  for (const day of ['2026-10-04T18:00:00', '2026-10-05T18:00:00']) {
    await page.clock.pauseAt(new Date(day));
    await page.reload();
    await page.waitForSelector('.tile[data-state]');
    check((await text(6)) === song && (await tile(6).getAttribute('class')).includes('is-locked'), `still locked on ${day.slice(0, 10)}`);
  }

  // Settings shows the lock on its slot, and can release it.
  await page.goto(`${BASE}#/settings`);
  await page.waitForSelector('.slot-lock');
  check((await page.locator('.slot-lock-text').textContent()).includes(song), 'Settings shows the locked slot');
  check(await page.locator('select[aria-label="Slot 7"]').isDisabled(), 'its subtype is fixed while locked');
  await page.locator('[aria-label="Unlock slot 7"]').click();
  check(await until(() => app(() => !window.timebox.app.library.slots[6].lock)), 'Unlock in Settings releases it');

  // Lock from the rating sheet at the end of a block.
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  await page.locator('.tile-main').nth(4).click();
  await focusOpen();
  await page.locator('.focus-primary').click(); // Begin
  await page.clock.runFor(60_000);
  await page.locator('.focus-primary').click(); // Pause
  await page.locator('.focus-finish').click();
  await page.waitForSelector('dialog.rating-sheet[open] .rating-lock');
  await page.locator('dialog.rating-sheet .rating-lock').click();
  check(await until(() => app(() => window.timebox.app.isLocked(4))), 'Lock from the rating sheet');
  await shot('14-rating-lock');
  await page.locator('dialog.rating-sheet .star').nth(3).click();
  await focusOpen(false);
  check(await until(async () => (await tile(4).getAttribute('class')).includes('is-locked')), 'the finished block shows the lock');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
