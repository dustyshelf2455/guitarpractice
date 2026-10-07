// End-to-end check for the repertoire songs built from Ben's tabs: each opens
// on a songs block with its chord chart or chord boxes, notes and tab link.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/songs.cjs
const { chromium, devices } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../screenshots');
// [item id, screenshot name, chord names expected on the card]
const SONGS = [
  ['songs-3', 'alison', ['B', 'A', 'C♯m', 'F♯m', 'G♯m', 'E', 'D', 'G♯7']],
  ['songs-5', 'i-dont-mind', ['G', 'Em', 'D', 'C']],
];
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
    for (const [id, name, chords] of SONGS) {
      // Use the block already showing the song, else roll the first songs block to it.
      const i = await app((id) => {
        const tiles = window.timebox.app.boardTiles();
        const on = tiles.findIndex((t) => t.item_id === id);
        return on >= 0 ? on : tiles.findIndex((t) => t.subtype_id === 'songs');
      }, id);
      const rolled = await app(async ([i, id]) => {
        const a = window.timebox.app;
        for (let n = 0; n < 200 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
        return a.boardTiles()[i].item_id === id;
      }, [i, id]);
      check(rolled, `${name} on a songs block (${scheme})`);
      await page.locator('.tile').nth(i).click();
      await until(() => page.locator('.focus .chord-name').first().isVisible());
      const names = await page.locator('.focus .chord-name').allTextContents();
      check(names.join(' ') === chords.join(' '), `chord boxes: ${names.join(' ')}`);
      check(await page.locator('.focus').getByText('tabs.ultimate-guitar.com').isVisible(), 'tab link shown');
      const fits = await app(() => document.documentElement.scrollWidth <= window.innerWidth);
      check(fits, 'fits the phone width');
      await page.screenshot({ path: path.join(SHOTS, 'songs', `${name}-${scheme}.png`), fullPage: true });
      await page.goBack().catch(() => {});
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
