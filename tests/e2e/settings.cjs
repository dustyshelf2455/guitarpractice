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

  // A new item that names a scale gets its diagram automatically.
  await page.fill('input[placeholder="Add an item…"]', 'B minor scale, 2nd position');
  await page.keyboard.press('Enter');
  check(await until(() => app(() => {
    const it = window.timebox.app.library.items.find((i) => i.text === 'B minor scale, 2nd position');
    return it && it.diagrams.length === 1 && it.diagrams[0].scale === 'natural_minor' && it.diagrams[0].position === 2;
  })), 'new scale item gets a suggested diagram');

  // Build a chord diagram in the editor.
  await page.locator('.row-link', { hasText: 'A minor pentatonic' }).first().click();
  await page.waitForSelector('dialog[open] .diagram-editor');
  check(await page.locator('dialog[open] .diagram-item .board').isVisible(), 'editor previews the existing diagram');
  await page.locator('dialog[open] .diagram-add').click();
  await page.locator('dialog[open] .diagram-builder select').first().selectOption('chords');
  await page.fill('dialog[open] .diagram-builder input', 'Am Dm7 E7 Xq');
  check(await until(async () => /Don't know: Xq/.test(await page.locator('dialog[open] .diagram-builder .field-hint').textContent())), 'unknown chord names are flagged');
  await page.fill('dialog[open] .diagram-builder input', 'Am Dm7 E7');
  check(await until(async () => (await page.locator('dialog[open] .diagram-preview .chord').count()) === 3), 'live preview of three chord boxes');
  await page.locator('dialog[open] .diagram-builder .btn-primary').click();
  await page.locator('dialog[open] .sheet-actions .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.item('scales-5').diagrams.length === 2)), 'chord diagram saved alongside the scale');

  // A lick of your own: notes and a pasted tab.
  await page.goto(`${BASE}#/settings/subtype/licks`);
  await page.waitForSelector('input[placeholder="Add an item…"]');
  await page.fill('input[placeholder="Add an item…"]', 'My new lick');
  await page.keyboard.press('Enter');
  await until(async () => (await page.locator('.row-title', { hasText: 'My new lick' }).count()) === 1);
  await page.locator('.row-link', { hasText: 'My new lick' }).click();
  await page.waitForSelector('dialog[open] .diagram-editor');
  await page.fill('dialog[open] textarea.notes-input', 'From a YouTube lesson. Slow first.');
  await page.locator('dialog[open] .diagram-add').click();
  await page.locator('dialog[open] .diagram-builder select').first().selectOption('tab');
  await page.fill('dialog[open] .diagram-builder textarea', 'e|---------|\nB|-----1---|\nG|-0h2-----|\nD|---------|\nA|---------|\nE|---------|');
  check(await until(async () => (await page.locator('dialog[open] .diagram-preview .tab').count()) === 1), 'pasted tab previews');
  await page.locator('dialog[open] .diagram-builder .btn-primary').click();
  await page.locator('dialog[open] .sheet-actions .btn-primary').click();
  check(await until(() => app(() => {
    const it = window.timebox.app.library.items.find((i) => i.text === 'My new lick');
    return it && it.notes === 'From a YouTube lesson. Slow first.' && it.diagrams[0]?.type === 'tab';
  })), 'lick saved with notes and tab');

  // A song: paste a chord sheet; only chords and sections are kept.
  await page.goto(`${BASE}#/settings/subtype/songs`);
  await page.locator('.row-link', { hasText: 'These Days' }).click();
  await page.waitForSelector('dialog[open] .diagram-editor');
  await page.locator('dialog[open] .diagram-add').click();
  await page.locator('dialog[open] .diagram-builder select').first().selectOption('progression');
  const sheet = '[Verse]\nG        C\nplaceholder lyric words\nD        G\nmore placeholder words\n[Chorus]\nC   D\nsung words';
  await page.locator('dialog[open] .diagram-builder textarea').fill(sheet);
  await page.locator('dialog[open] .diagram-builder textarea').blur();
  check(await until(async () => (await page.locator('dialog[open] .diagram-builder textarea').inputValue()) === 'Verse: G C D G\nChorus: C D'), 'pasted chord sheet tidied, lyrics left out');
  await page.locator('dialog[open] .diagram-builder .btn-primary').click();
  await page.locator('dialog[open] .sheet-actions .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.item('songs-4').diagrams[0]?.text === 'Verse: G C D G\nChorus: C D')), 'chord chart saved');

  // A strumming pattern: tap a slot to change it.
  await page.goto(`${BASE}#/settings/subtype/strumming`);
  await page.locator('.row-link', { hasText: 'Count aloud' }).click();
  await page.waitForSelector('dialog[open] .diagram-editor');
  await page.locator('dialog[open] .diagram-item .text-btn', { hasText: 'Edit' }).click();
  await page.locator('dialog[open] .strum-edit-stroke').nth(1).click(); // miss -> down
  await page.locator('dialog[open] .strum-edit-accent').nth(0).click();
  await page.locator('dialog[open] .diagram-builder .btn-primary').click();
  await page.locator('dialog[open] .sheet-actions .btn-primary').click();
  check(await until(() => app(() => {
    const d = window.timebox.app.item('strumming-6').diagrams[0];
    return d.pattern === 'DDDU-UDU' && d.accents?.[0] === 0;
  })), 'strumming pattern edited by tapping');

  // Edit the first item: add a link.
  await page.goto(`${BASE}#/settings/subtype/scales`);
  await page.locator('.row-link', { hasText: 'C major scale' }).click();
  await page.waitForSelector('dialog[open] input[type=url]');
  await page.fill('dialog[open] input[type=url]', 'example.com/c-major');
  await page.locator('dialog[open] .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.item('scales-1').url === 'https://example.com/c-major')), 'link saved and normalised to https');
  await page.waitForTimeout(150); // let the IndexedDB write commit before reloading

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
  await page.waitForTimeout(150);
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

  // Style and layout.
  check((await page.getAttribute('html', 'data-skin')) === 'lounge', 'lounge style is the default');
  await page.locator('.seg', { hasText: 'Classic' }).click();
  check(await until(async () => (await page.getAttribute('html', 'data-skin')) === 'classic'), 'classic style can be chosen');
  await page.locator('.seg', { hasText: 'Lounge' }).click();
  check(await until(async () => (await page.getAttribute('html', 'data-skin')) === 'lounge'), 'and switched back');
  await page.locator('.seg', { hasText: 'List' }).click();
  await until(() => app(() => window.timebox.app.settings.layout === 'list'));
  await page.waitForTimeout(100);
  await page.goto(BASE);
  await page.waitForSelector('.layout-list .tile[data-state]');
  const rows = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    const box = grid.getBoundingClientRect();
    const tiles = [...grid.querySelectorAll('.tile')].map((t) => t.getBoundingClientRect());
    return { full: tiles.filter((r) => r.bottom <= box.bottom + 1).length, scrolls: grid.scrollHeight > grid.clientHeight, width: tiles[0].width / box.width };
  });
  check(rows.full === 6 && rows.scrolls && rows.width > 0.9, `list layout shows six full-width rows and scrolls (${JSON.stringify(rows)})`);
  await page.goto(`${BASE}#/settings`);
  await page.waitForSelector('.page-title');
  await page.locator('.seg', { hasText: 'Grid' }).click();
  check(await until(() => app(() => window.timebox.app.settings.layout === 'grid')), 'grid layout restored');

  // Export.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Back up now' }).click()]);
  const file = path.join(os.tmpdir(), `timebox-e2e-${Date.now()}.json`);
  await download.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(data.app === 'timebox' && data.library.items.length === 89, `export has the library (${data.library.items.length} items)`);

  // Reset to defaults.
  await page.locator('button', { hasText: 'Reset library' }).click();
  await page.locator('dialog[open] .btn-danger').click();
  check(await until(() => app(() => window.timebox.app.library.items.length === 86 && window.timebox.app.library.slots[11].subtype_id === 'licks')), 'reset restores starter library and slots');

  // Import (merge) brings the added item back without touching slots.
  await page.setInputFiles('input[type=file]', file);
  await page.waitForSelector('dialog[open] .import-summary');
  const summary = await page.locator('dialog[open] .import-summary').textContent();
  check(/Add 3 library items/.test(summary), `merge summary shown before confirming (${summary.slice(0, 60)}…)`);
  await page.locator('dialog[open] .btn-primary').click();
  check(await until(() => app(() => window.timebox.app.library.items.some((i) => i.text.startsWith('B minor')))), 'merge added the item');
  check(await app(() => window.timebox.app.library.slots[11].subtype_id === 'licks'), 'merge kept local slots');

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
