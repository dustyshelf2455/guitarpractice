// End-to-end check for Closer to Fine (Indigo Girls) on a songs block: the four
// capo-2 shapes with the top two strings held at the 3rd fret, and the strum.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/closer.cjs
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
    const i = await app(() => window.timebox.app.boardTiles().findIndex((t) => t.subtype_id === 'songs'));
    const rolled = await app(async ([i, id]) => {
      const a = window.timebox.app;
      for (let n = 0; n < 200 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
      return a.boardTiles()[i].item_id === id;
    }, [i, 'songs-11']);
    check(rolled, `Closer to Fine on a songs block (${scheme})`);

    await page.locator('.tile').nth(i).click();
    await until(() => page.locator('.focus .diagram-progression').isVisible());
    const names = await page.locator('.focus .diagram-progression .chord-name').allTextContents();
    check(names.join(' ') === 'G A7sus4 Cadd9 Dsus4 D Dsus2 C', `chord boxes from the chart: ${names.join(' ')}`);
    const g = await app(() => [...document.querySelectorAll('.focus .diagram-progression .chord')][0].querySelectorAll('.chord-dot').length);
    check(g === 4, 'G drawn with the B and e strings held at the 3rd fret (4 fretted notes)');
    check((await page.locator('.focus .diagram-strum').count()) === 1, 'strum pattern shown');
    check(await page.locator('.focus').getByText(/capo on the 2nd fret/i).isVisible(), 'notes mention the capo');
    await page.screenshot({ path: path.join(SHOTS, 'closer', `closer-to-fine-${scheme}.png`), fullPage: true });
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
