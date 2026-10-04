// Real-time check of the scheduled chime logic (no fake clock: it compares the
// audio clock with the wall clock). Usage: NODE_PATH=$(npm root -g) node tests/e2e/audio.cjs
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8080/';
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.tile[data-state]');
  const r = await page.evaluate(async () => {
    const a = await import('./js/audio.js');
    let stops = 0;
    const orig = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (...args) {
      if (args.length === 0) stops++; // explicit cancels (scheduled stops pass a time)
      return orig.apply(this, args);
    };
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    a.unlockAudio();
    await sleep(200);
    const out = { running: a.audioRunning() };

    // 1. The chime rings at its time; cancelling afterwards must not cut it or allow a second one.
    const at1 = Date.now() + 400;
    a.scheduleChime(at1);
    await sleep(500);
    a.cancelChime();
    out.rangCounted = a.chimeWasScheduledFor(at1);
    out.stopsAfterRing = stops;

    // 2. Cancelling before it starts (e.g. pause) silences it and doesn't count as rung.
    const at2 = Date.now() + 3000;
    a.scheduleChime(at2);
    await sleep(100);
    a.cancelChime();
    out.cancelledCounted = a.chimeWasScheduledFor(at2);
    out.stopsAfterCancel = stops;

    // 3. Rescheduling for the same moment is a no-op (no churn every second).
    const at3 = Date.now() + 3000;
    a.scheduleChime(at3);
    a.scheduleChime(at3);
    out.stopsAfterSame = stops;
    a.cancelChime();
    return out;
  });
  // Metronome: wooden clicks from pre-rendered buffers, on tempo.
  const m = await page.evaluate(async () => {
    const a = await import('./js/audio.js');
    const starts = [];
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, ...rest) {
      if (this.buffer && this.buffer.duration > 0.1 && this.buffer.duration < 0.2) starts.push(when);
      return orig.call(this, when, ...rest);
    };
    a.metronome.setBpm(120);
    a.metronome.beats = 4;
    a.metronome.accent = true;
    a.metronome.start();
    await new Promise((res) => setTimeout(res, 1600));
    a.metronome.stop();
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    return { clicks: starts.length, gaps };
  });
  check(m.clicks >= 3, `metronome schedules wooden clicks (${m.clicks})`);
  check(m.gaps.every((g) => Math.abs(g - 0.5) < 0.001), `clicks are exactly 0.5 s apart at 120 bpm (${m.gaps.map((g) => g.toFixed(3)).join(', ')})`);

  check(r.running, 'audio context running after unlock');
  check(r.rangCounted, 'a chime that rang counts as played (no double chime)');
  check(r.stopsAfterRing === 0, 'cancelling after it started does not cut it off');
  check(!r.cancelledCounted, 'a cancelled chime does not count as played');
  check(r.stopsAfterCancel === 3, 'cancelling before it starts silences all three notes');
  check(r.stopsAfterSame === 3, 'rescheduling the same moment does not restart it');
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
