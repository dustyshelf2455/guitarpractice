// End-to-end check for Eric Haugen's open position pentatonics: the set shape's
// dots, the dashed passing notes, unused strings marked ×, and the neck fitting the phone.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/pentatonics.cjs
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
    const i = await app(() => window.timebox.app.boardTiles().findIndex((t) => t.subtype_id === 'scales'));
    for (const [id, dots, passing, muted, name] of [['scales-6', 9, 2, 1, 'c-major'], ['scales-12', 11, 2, 1, 'a-major'], ['scales-9', 8, 2, 2, 'd-minor']]) {
      const rolled = await app(async ([i, id]) => {
        const a = window.timebox.app;
        for (let n = 0; n < 200 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
        return a.boardTiles()[i].item_id === id;
      }, [i, id]);
      check(rolled, `${id} on the scales block (${scheme})`);
      await page.locator('.tile').nth(i).click();
      await until(() => page.locator('.focus .board-v').isVisible());
      const neck = page.locator('.focus .board-v');
      check((await neck.locator('.board-dot').count()) === dots + passing, `${id}: ${dots} shape dots and ${passing} passing notes`);
      check((await neck.locator('.board-dot.passing').count()) === passing, `${id}: passing notes drawn dashed`);
      check((await neck.locator('.board-muted').count()) === muted, `${id}: ${muted} unused string(s) marked`);
      check(await page.locator('.focus .diagram-passing').isVisible(), `${id}: caption names the passing note`);
      const fits = await app(() => { const r = document.querySelector('.focus .board-v').getBoundingClientRect(); return r.right <= window.innerWidth && r.bottom <= window.innerHeight; });
      check(fits, `${id}: neck fits the phone screen`);
      await page.screenshot({ path: path.join(SHOTS, 'pentatonics', `${name}-${scheme}.png`) });
      await page.goBack();
      await page.waitForSelector('.tile[data-state]');
    }
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
