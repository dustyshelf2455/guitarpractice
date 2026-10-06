// End-to-end checks for the progressions-by-number exercises: the key menu
// re-spells every chord, the key is remembered, and two chord slots can each
// be locked to one of the two sets.
// Needs a static server on BASE. Usage: NODE_PATH=$(npm root -g) node tests/e2e/progressions.cjs
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

  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');

  // Make the 5th slot a second Chords slot, then roll each onto one of the sets.
  await app(() => window.timebox.app.setSlotSubtype(4, 'chords'));
  const rollTo = (i, id) => app(async ([i, id]) => {
    const a = window.timebox.app;
    for (let n = 0; n < 200 && a.boardTiles()[i].item_id !== id; n++) if (!(await a.swap(i))) return false;
    return a.boardTiles()[i].item_id === id;
  }, [i, id]);
  check(await rollTo(3, 'chords-29'), 'set 1 on the chords block');
  check(await rollTo(4, 'chords-30'), 'set 2 on the second chords block');

  await tile(3).click();
  await until(() => page.locator('.focus .diagram-numbers').isVisible());
  const progs = page.locator('.focus .numbers-prog');
  check((await progs.count()) === 5, 'five progressions');
  const chordsOf = (n) => progs.nth(n).locator('.numbers-chord').allTextContents();
  const numsOf = (n) => progs.nth(n).locator('.numbers-numeral').allTextContents();
  check((await numsOf(1)).join(' ') === 'I vi IV V', 'numbers shown');
  check((await chordsOf(1)).join(' ') === 'G Em C D', 'chords in G by default');
  await page.screenshot({ path: path.join(SHOTS, 'progressions-1-G.png'), fullPage: true });

  await page.locator('.focus .numbers-key-select').selectOption('A');
  check((await chordsOf(1)).join(' ') === 'A F♯m D E', 'chords follow the key menu');
  check((await chordsOf(4)).join(' ') === 'A G D A', '♭VII in A is G');
  check(await page.locator('.focus .diagram-numbers .chord').count() > 4, 'chord boxes for the key');
  await wait(1200); // a few clock ticks: the menu keeps its key
  check(await page.locator('.focus .numbers-key-select').inputValue() === 'A', 'key survives the clock ticking');
  await page.screenshot({ path: path.join(SHOTS, 'progressions-1-A.png'), fullPage: true });

  await page.locator('.focus-lock').click();
  check(await until(() => app(() => window.timebox.app.isLocked(3))), 'set 1 locks');
  await page.locator('.focus-back').click();
  await until(async () => !(await page.locator('.focus').isVisible()));

  await tile(4).click();
  await until(() => page.locator('.focus .diagram-numbers').isVisible());
  check(await page.locator('.focus .numbers-key-select').inputValue() === 'A', 'the other set opens in the key last picked');
  check((await chordsOf(4)).join(' ') === 'Am G F E7', 'minor walk-down in A');
  await page.screenshot({ path: path.join(SHOTS, 'progressions-2-A.png'), fullPage: true });
  await page.locator('.focus-lock').click();
  check(await until(() => app(() => window.timebox.app.isLocked(4))), 'set 2 locks too');

  check(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
