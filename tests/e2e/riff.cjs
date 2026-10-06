// End-to-end check for a lick with its rhythm drawn under the tab (Life of
// Sin): two rows split at the bar lines, stems and beams under each, bends.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/riff.cjs
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
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const app = (fn, arg) => page.evaluate(fn, arg);

    await page.goto(BASE);
    await page.waitForSelector('.tile[data-state]');
    const i = await app(() => window.timebox.app.boardTiles().findIndex((t) => t.subtype_id === 'licks'));
    const rolled = await app(async ([i, id]) => {
      const a = window.timebox.app;
      for (let n = 0; n < 200 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
      return a.boardTiles()[i].item_id === id;
    }, [i, 'licks-13']);
    check(rolled, `Life of Sin on the licks block (${scheme})`);

    await page.locator('.tile').nth(i).click();
    await until(() => page.locator('.focus .diagram-tab').isVisible());
    const rows = page.locator('.focus .diagram-tab svg.tab');
    check((await rows.count()) === 2, 'two rows, split at the bar line');
    check((await rows.nth(0).locator('.tab-stem').count()) === 6 && (await rows.nth(1).locator('.tab-stem').count()) === 8, 'a stem under every note');
    check((await rows.nth(1).locator('.tab-beam').count()) === 3, 'eighths beamed in pairs by beat');
    check((await rows.nth(1).locator('.tab-arrow').count()) === 4, 'four half-step bends');
    const fits = await app(() => [...document.querySelectorAll('.focus .diagram-tab svg.tab')].every((s) => s.getBoundingClientRect().right <= window.innerWidth));
    check(fits, 'tab fits the phone width');
    await page.screenshot({ path: path.join(SHOTS, 'riff', `life-of-sin-${scheme}.png`), fullPage: true });
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
