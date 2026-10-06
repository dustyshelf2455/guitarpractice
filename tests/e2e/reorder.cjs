// Rearranging the board: press and hold a block, drag it with a finger, drop it.
// Real touch events through CDP on a phone viewport, so the page can't scroll instead.
// Needs a static server on BASE (default http://localhost:8080/).
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/reorder.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: process.env.SCHEME || 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });
  const centre = async (i) => {
    const b = await page.locator('.tile').nth(i).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const texts = () => page.locator('.tile .tile-text').allTextContents();
  /** Hold on block `from` for `hold` ms, then drag to block `to` in steps and lift. */
  async function dragTouch(from, to, { hold = 500, shotName } = {}) {
    const a = await centre(from);
    const b = await centre(to);
    await touch('touchStart', a.x, a.y);
    await wait(hold);
    const steps = 12;
    for (let k = 1; k <= steps; k++) {
      await touch('touchMove', a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
      await wait(16);
    }
    if (shotName) await page.screenshot({ path: path.join(SHOTS, `${shotName}.png`) });
    await touch('touchEnd');
    await wait(450);
  }

  await page.clock.install({ time: new Date('2026-10-03T17:59:00') });
  await page.clock.resume();
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  const start = await texts();

  // Hold and drag block 1 to block 6: blocks 2-6 slide back one place.
  await dragTouch(0, 5, { shotName: 'reorder-mid-drag' });
  let now = await texts();
  check(JSON.stringify(now) === JSON.stringify([start[1], start[2], start[3], start[4], start[5], start[0], ...start.slice(6)]),
    'block 1 dropped on block 6; the ones between slid along');
  check(!(await page.locator('.focus').isVisible()), 'dropping does not open the block');
  check(await page.locator('.tile[style*="transform"]').count() === 0 || (await page.locator('.tile').evaluateAll((ls) => ls.every((l) => !l.style.transform))), 'no tile left offset after the drop');
  await page.screenshot({ path: path.join(SHOTS, 'reorder-after.png') });

  // A quick swipe (no hold) moves nothing.
  const prev = await texts();
  await dragTouch(2, 8, { hold: 30 });
  check(JSON.stringify(await texts()) === JSON.stringify(prev), 'a swipe without holding moves nothing');

  // A plain tap still opens the block.
  await page.locator('.tile-main').nth(0).tap();
  await wait(400);
  check(await page.locator('.focus').isVisible(), 'a tap still opens a block');
  await page.locator('.focus-back').click();
  await wait(400);

  // The order survives a reload.
  now = await texts();
  await page.reload();
  await page.waitForSelector('.tile[data-state]');
  check(JSON.stringify(await texts()) === JSON.stringify(now), 'order survives reopening the app');

  // Mid-session: start block 1, then move it; it keeps running in its new place.
  await page.locator('.tile-main').nth(0).tap();
  await page.locator('.focus-primary').click();
  await page.locator('.focus-back').click();
  await wait(400);
  const running = (await texts())[0];
  await dragTouch(0, 11);
  check((await page.locator('.tile').nth(11).getAttribute('data-state')) === 'running', 'running block keeps running after a move');
  check((await texts())[11] === running, 'running block now sits in the last place');

  // Mouse too (desktop browsers): press, hold, drag.
  const before = await texts();
  const a = await centre(1);
  const b = await centre(3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await wait(500);
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await wait(450);
  const after = await texts();
  check(after[3] === before[1] && after[1] === before[2], 'mouse drag moves a block too');

  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
