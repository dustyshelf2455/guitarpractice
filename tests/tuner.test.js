import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD, detectPitch, nearestString, noteOf, centsOff, median } from '../js/tuner.js';

const SR = 48000;

// A plucked-string-like tone: a fundamental with strong overtones, a little noise.
function tone(freq, { n = 4096, harmonics = [1, 0.8, 0.6, 0.4, 0.3], noise = 0.01, seed = 1 } = {}) {
  const buf = new Float32Array(n);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, h) => (v += a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR + h)));
    buf[i] = 0.2 * v + noise * rand();
  }
  return buf;
}

test('standard tuning frequencies', () => {
  assert.deepEqual(STANDARD.map((s) => s.name).join(''), 'EADGBE');
  assert.ok(Math.abs(STANDARD[0].freq - 82.41) < 0.01);
  assert.ok(Math.abs(STANDARD[1].freq - 110) < 1e-9);
  assert.ok(Math.abs(STANDARD[5].freq - 329.63) < 0.01);
});

test('finds each open string to within a cent, overtones and all', () => {
  for (const s of STANDARD) {
    const hit = detectPitch(tone(s.freq), SR);
    assert.ok(hit, `${s.label}: no pitch`);
    assert.ok(Math.abs(centsOff(hit.freq, s.freq)) < 1, `${s.label}: ${hit.freq}`);
  }
});

test('a loud second harmonic is not mistaken for the octave', () => {
  const hit = detectPitch(tone(82.41, { harmonics: [0.4, 1, 0.5, 0.3] }), SR);
  assert.ok(Math.abs(centsOff(hit.freq, 82.41)) < 2, String(hit.freq));
});

test('reads a slightly flat or sharp string correctly', () => {
  const flat = 110 * 2 ** (-12 / 1200);
  const hit = detectPitch(tone(flat), SR);
  const { string, cents } = nearestString(hit.freq);
  assert.equal(string.label, 'A');
  assert.ok(Math.abs(cents + 12) < 1, String(cents));
  const sharp = detectPitch(tone(196 * 2 ** (20 / 1200)), SR);
  assert.ok(Math.abs(nearestString(sharp.freq).cents - 20) < 1);
});

test('silence and noise give no reading', () => {
  assert.equal(detectPitch(new Float32Array(4096), SR), null);
  assert.equal(detectPitch(tone(110, { harmonics: [], noise: 0.3 }), SR), null);
});

test('nearest string goes by pitch, and note names', () => {
  assert.equal(nearestString(95).string.label, 'Low E'); // 95 Hz is nearer E2 than A2 in cents
  assert.equal(nearestString(100).string.label, 'A');
  assert.equal(nearestString(300).string.label, 'High E');
  assert.deepEqual(({ ...noteOf(440), cents: 0 }), { name: 'A', octave: 4, midi: 69, cents: 0 });
  assert.equal(noteOf(82.41).name + noteOf(82.41).octave, 'E2');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});
