// Tuner: a fake microphone plays a slightly flat A string; the tuner should
// pick the A, say to tune up, and let go of the microphone when closed. Then a
// refused microphone shows the explanation and a Try again button.
// Usage: NODE_PATH=$(npm root -g) node tests/e2e/tuner.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.BASE || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '../../screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

// A 16-bit mono WAV of a plucked-ish tone with overtones.
function wav(freq, seconds = 6, rate = 48000) {
  const n = seconds * rate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    let v = 0;
    [1, 0.7, 0.5, 0.3].forEach((a, h) => (v += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / rate)));
    data.writeInt16LE(Math.round(v * 0.25 * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

(async () => {
  const file = path.join(os.tmpdir(), 'timebox-tuner-a-flat.wav');
  fs.writeFileSync(file, wav(110 * 2 ** (-15 / 1200)));
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`],
  });
  const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  await context.grantPermissions(['microphone']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  await page.evaluate(() => {
    const orig = MediaStreamTrack.prototype.stop;
    window.stoppedTracks = 0;
    MediaStreamTrack.prototype.stop = function () { window.stoppedTracks++; return orig.call(this); };
  });

  const btn = page.locator('.session-bar [aria-label="Tuner"]');
  check(await btn.isVisible(), 'Tuner button on the bottom row');
  const box = await btn.boundingBox();
  check(box && box.x + box.width <= 390, 'bottom row fits a phone width');
  await page.screenshot({ path: path.join(SHOTS, 'tuner-board.png') });
  await btn.click();
  await page.waitForSelector('dialog.tuner-sheet.listening', { timeout: 5000 });
  await page.waitForSelector('dialog.tuner-sheet.hearing', { timeout: 8000 });
  await page.waitForTimeout(600);
  const msg = await page.locator('.tuner-message').textContent();
  check(/Tune A up/.test(msg), `flat A says tune up (${msg})`);
  const cents = await page.locator('.tuner-readout-cents').textContent();
  const c = Number(cents.replace('−', '-').replace(/[^0-9-]/g, ''));
  check(c <= -12 && c >= -18, `reads about 15 cents flat (${cents})`);
  check(await page.locator('.tuner-string.heard').getAttribute('aria-label') === 'A string', 'A string highlighted');
  const x = await page.locator('.tuner-bubble').evaluate((b) => b.style.getPropertyValue('--x'));
  check(parseFloat(x) < 50, `needle on the flat side (${x})`);
  await page.screenshot({ path: path.join(SHOTS, 'tuner-hearing.png') });

  // Lock to the D string: the A now reads as far below D.
  await page.locator('.tuner-string[aria-label="D string"]').click();
  await page.waitForTimeout(500);
  check(/Tune D up/.test(await page.locator('.tuner-message').textContent()), 'locked to D: tune D up');
  check(/Tuning the D string/.test(await page.locator('.tuner-mode').textContent()), 'mode line names D');
  await page.locator('.tuner-string[aria-label="D string"]').click();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.locator('dialog.tuner-sheet').count() === 0, 'sheet closes');
  check(await page.evaluate(() => window.stoppedTracks) >= 1, 'microphone released on close');

  // A refused microphone.
  const p2 = await context.newPage();
  await p2.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
  });
  await p2.goto(BASE);
  await p2.waitForSelector('.tile[data-state]');
  await p2.locator('.session-bar [aria-label="Tuner"]').click();
  await p2.waitForSelector('.tuner-message.problem');
  check(/needs the microphone/.test(await p2.locator('.tuner-message').textContent()), 'denied: explains');
  check(await p2.locator('.tuner-retry').isVisible(), 'denied: Try again shown');
  await p2.screenshot({ path: path.join(SHOTS, 'tuner-denied.png') });

  check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
