// End-to-end checks for Settings: library editing, links, slots, theme,
// export/import and reset. Needs a static server on BASE.
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/settings.cjs
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
  const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const app = (fn) => page.evaluate(fn);

  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');

  // Add an item to Scales.
  await page.goto(`${BASE}#/settings/subtype/scales`);
  await page.waitForSelector('input[placeholder="Add an item…"]');
  await page.fill('input[placeholder="Add an item…"]', 'B minor scale, 2nd position');
  await page.keyboard.press('Enter');
  check(await until(async () => (await page.locator('.row-title', { hasText: 'B minor scale' }).count()) === 1), 'item added to Scales');
  check(await until(async () => (await page.evaluate(() => document.activeElement?.dataset?.key)) === 'add-item'), 'focus stays in the add field for the next item');

  // Edit the first item: add a link.
  await page.locator('.row-link', { hasText: 'C major scale' }).click();
  await page.waitForSelector('dialog[open] input[type=url]');
  await page.fill('dialog[open] input[type=url]', 'example.com/c-major');
  await page.locator('dialog[open] .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.item('scales-1').url === 'https://example.com/c-major')), 'link saved and normalised to https');

  // The tile on the session screen shows the link.
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  const link = page.locator('.tile').nth(2).locator('.tile-link');
  check(await link.isVisible(), 'tile shows link control');
  check((await link.getAttribute('href')) === 'https://example.com/c-major', 'tile link points at the item URL');

  // Archive an item: it leaves today's plan.
  await page.goto(`${BASE}#/settings/subtype/warmup`);
  await page.locator('.row-link', { hasText: 'Spider walk' }).click();
  await page.locator('dialog[open] .text-btn', { hasText: 'Archive' }).click();
  check(await until(async () => (await page.locator('details, .section-title', { hasText: 'Archived (1)' }).count()) > 0), 'archived item listed under Archived');
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  check(!(await page.locator('.tile').nth(0).locator('.tile-text').textContent()).includes('Spider walk'), 'archived item replaced on today\'s plan');

  // Slots: change slot 12 to Warm-up, move slot 1 down.
  await page.goto(`${BASE}#/settings`);
  await page.waitForSelector('select[aria-label="Slot 12"]');
  await page.selectOption('select[aria-label="Slot 12"]', 'warmup');
  check(await until(() => app(() => window.timebox.app.library.slots[11].subtype_id === 'warmup')), 'slot 12 reassigned');
  await page.locator('[aria-label="Move slot 1 down"]').click();
  check(await until(() => app(() => window.timebox.app.library.slots[0].subtype_id === 'picking')), 'slot moved');
  check(await until(async () => (await page.evaluate(() => document.activeElement?.dataset?.key)) === 'slot-down-0'), 'focus kept on the move button');

  // Theme.
  await page.locator('.seg', { hasText: 'Light' }).click();
  check(await until(async () => (await page.getAttribute('html', 'data-theme')) === 'light'), 'light theme applied');
  await page.locator('.seg', { hasText: 'Auto' }).click();
  check(await until(async () => (await page.getAttribute('html', 'data-theme')) === null), 'auto theme clears override');

  // Export.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Export backup' }).click()]);
  const file = path.join(os.tmpdir(), `timebox-e2e-${Date.now()}.json`);
  await download.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(data.app === 'timebox' && data.library.items.length === 51, `export has the library (${data.library.items.length} items)`);

  // Reset to defaults.
  await page.locator('button', { hasText: 'Reset library' }).click();
  await page.locator('dialog[open] .btn-danger').click();
  check(await until(() => app(() => window.timebox.app.library.items.length === 50 && window.timebox.app.library.slots[11].subtype_id === 'backing')), 'reset restores starter library and slots');

  // Import (merge) brings the added item back without touching slots.
  await page.setInputFiles('input[type=file]', file);
  await page.waitForSelector('dialog[open] .import-summary');
  const summary = await page.locator('dialog[open] .import-summary').textContent();
  check(/Add 1 library item/.test(summary), `merge summary shown before confirming (${summary.slice(0, 60)}…)`);
  await page.locator('dialog[open] .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.library.items.some((i) => i.text.startsWith('B minor')))), 'merge added the item');
  check(await app(() => window.timebox.app.library.slots[11].subtype_id === 'backing'), 'merge kept local slots');

  // Data survives a restart.
  await page.reload();
  await page.waitForSelector('.page-title');
  check(await app(() => window.timebox.app.library.items.some((i) => i.text.startsWith('B minor'))), 'data survives reload');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  fs.unlinkSync(file);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
