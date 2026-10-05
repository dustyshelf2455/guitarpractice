// End-to-end checks for backing up and restoring: the board's backup reminder,
// the restore offer on a fresh install, and a full restore into a new device.
// Needs a static server on BASE.
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/backup.cjs
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8080/';
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
  const errors = [];
  const open = async () => {
    const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE);
    await page.waitForSelector('.tile[data-state]');
    return { context, page };
  };
  const beacon = (page) => page.evaluate(() => {
    const row = document.querySelector('.beacon-row');
    return row && !row.hidden ? { kind: row.dataset.kind, text: row.textContent } : null;
  });

  // A fresh install offers a restore.
  const a = await open();
  let b = await beacon(a.page);
  check(b && b.kind === 'restore' && /Restore a backup/.test(b.text), `fresh install offers a restore (${JSON.stringify(b)})`);

  // Practise one block and end the session: the reminder appears.
  await a.page.evaluate(async () => {
    const app = window.timebox.app;
    await app.tapTile(0);
    await new Promise((r) => setTimeout(r, 1200));
    await app.completeTile(0);
    await app.rateTile(app.active.id, 0, 4);
    await app.endSession();
  });
  check(await until(async () => (await beacon(a.page))?.kind === 'backup'), 'reminder shows after the first session');
  b = await beacon(a.page);
  check(/Back up · 1 session/.test(b.text), `reminder says what is unsaved (${b.text})`);
  const box = await a.page.locator('.beacon').boundingBox();
  check(box && box.y < 200 && box.height >= 28, `reminder sits in the header and is tappable (${JSON.stringify(box)})`);

  // Tap it: a backup file is saved and the reminder goes away.
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.locator('.beacon').click()]);
  const file = path.join(os.tmpdir(), `timebox-backup-e2e-${Date.now()}.json`);
  await download.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(data.app === 'timebox' && data.sessions.length === 1, 'backup file holds the session');
  check(await until(async () => (await beacon(a.page)) === null), 'reminder clears after backing up');
  await a.page.reload();
  await a.page.waitForSelector('.tile[data-state]');
  check((await beacon(a.page)) === null, 'still clear after a restart');
  await a.page.goto(`${BASE}#/settings`);
  await a.page.waitForSelector('.page-title');
  const summary = await a.page.locator('[data-key="backup-summary"]').textContent();
  check(/Last backed up today\. Nothing has changed since\./.test(summary), `Settings says when (${summary})`);
  await a.context.close();

  // A new device (the icon was deleted): restore from the board.
  const n = await open();
  await n.page.locator('.beacon-row input[type=file]').setInputFiles(file);
  await n.page.waitForSelector('dialog[open] .import-summary');
  const checked = await n.page.locator('dialog[open] .seg[aria-checked="true"]').textContent();
  check(checked === 'Replace', `a fresh install restores by replacing (${checked})`);
  await n.page.locator('dialog[open] .btn-danger').click();
  check(await until(() => n.page.evaluate(() => window.timebox.app.sessions.length === 1)), 'session restored');
  check(await until(async () => (await beacon(n.page)) === null), 'no reminder right after a restore');
  await n.page.reload();
  await n.page.waitForSelector('.tile[data-state]');
  check(await n.page.evaluate(() => window.timebox.app.sessions.length === 1), 'restored data survives a restart');
  await n.context.close();

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  fs.unlinkSync(file);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
