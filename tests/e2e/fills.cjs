// End-to-end check for the acoustic fills (Licks): a four-bar tab with its
// rhythm, the chord box and the pentatonic shape the fills come from.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/fills.cjs
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
    for (const [id, name, tabs] of [['licks-14', 'fills-c', 4], ['licks-18', 'fills-e', 5], ['licks-22', 'sweet-virginia', 5]]) {
      const rolled = await app(async ([i, id]) => {
        const a = window.timebox.app;
        for (let n = 0; n < 300 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
        return a.boardTiles()[i].item_id === id;
      }, [i, id]);
      check(rolled, `${id} on the licks block (${scheme})`);
      await page.locator('.tile').nth(i).click();
      await until(() => page.locator('.focus .diagram-tab').first().isVisible());
      const figs = page.locator('.focus .diagram-tab');
      check((await figs.count()) === tabs, `${id}: ${tabs} tabs (${await figs.count()})`);
      const titles = await figs.locator('.diagram-title').allTextContents();
      check(titles.length === tabs && titles.every((t) => t.trim()), `${id}: every tab titled (${titles.map((t) => t.slice(0, 20)).join(' / ')})`);
      check((await page.locator('.focus .diagram-tab .tab-stem').count()) >= 40, `${id}: rhythm drawn`);
      if (id === 'licks-18') check((await page.locator('.focus .tab-tech', { hasText: '¼' }).count()) === 2, 'two quarter-step curls in the blues lick');
      const fits = await app(() => [...document.querySelectorAll('.focus .diagram-tab svg.tab')].every((s) => s.getBoundingClientRect().right <= window.innerWidth));
      check(fits, `${id}: tabs fit the phone width`);
      await page.screenshot({ path: path.join(SHOTS, 'fills', `${name}-${scheme}.png`), fullPage: true });
      await page.goto(BASE);
      await page.waitForSelector('.tile[data-state]');
    }
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
