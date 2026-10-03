// The app must work offline after the first load (service worker precache).
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/offline.cjs
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8080/';
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  const ready = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  check(ready, 'service worker installed and active');
  await page.reload();
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the service worker');

  // Start a block, go offline, reload: the app and the running session come back.
  await page.locator('.tile-main').nth(0).click();
  await page.waitForSelector('.tile[data-state="running"]');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.tile[data-state]', { timeout: 5000 });
  check((await page.locator('.tile').count()) === 12, 'app loads offline');
  check((await page.locator('.tile').nth(0).getAttribute('data-state')) === 'running', 'running block restored offline');
  await page.goto(`${BASE}#/stats`);
  await page.waitForSelector('.page-title');
  check(true, 'stats screen loads offline');

  const manifest = await page.evaluate(() => document.querySelector('link[rel=manifest]').href);
  check(manifest.endsWith('manifest.webmanifest'), 'manifest linked');
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
