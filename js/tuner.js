// Pitch detection for the tuner (no DOM, so it's testable in Node).
//
// detectPitch uses the McLeod pitch method: a normalised autocorrelation whose
// first strong peak is the period. It copes with a guitar's loud overtones
// (which fool a plain "biggest peak" search into octave errors) and gives a
// clarity score, so noise and decaying strings can be ignored.

/** Standard tuning, low to high: name, MIDI note, frequency (A4 = 440). */
export const STANDARD = [
  { name: 'E', label: 'Low E', midi: 40 },
  { name: 'A', label: 'A', midi: 45 },
  { name: 'D', label: 'D', midi: 50 },
  { name: 'G', label: 'G', midi: 55 },
  { name: 'B', label: 'B', midi: 59 },
  { name: 'E', label: 'High E', midi: 64 },
].map((s, i) => ({ ...s, index: i, freq: midiFreq(s.midi) }));

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function midiFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Cents from `ref` up to `freq` (negative when flat). */
export function centsOff(freq, ref) {
  return 1200 * Math.log2(freq / ref);
}

/** The nearest note to a frequency: { name, octave, midi, cents }. */
export function noteOf(freq) {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return { name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, midi, cents: (exact - midi) * 100 };
}

/** The string a frequency is closest to (in pitch, not hertz), and how far off it is. */
export function nearestString(freq, strings = STANDARD) {
  let best = strings[0];
  for (const s of strings) if (Math.abs(centsOff(freq, s.freq)) < Math.abs(centsOff(freq, best.freq))) best = s;
  return { string: best, cents: centsOff(freq, best.freq) };
}

/**
 * The fundamental frequency of `buf` (Float32Array of samples), or null when
 * it's too quiet or too noisy to tell. Returns { freq, clarity }.
 * Searches minFreq..maxFreq (defaults cover a guitar, with room for a string
 * tuned well down or up).
 */
export function detectPitch(buf, sampleRate, { minFreq = 60, maxFreq = 1000, minRms = 0.008, minClarity = 0.8 } = {}) {
  const n = buf.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / n) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  const w = n - maxLag; // the same window for every lag, so values are comparable
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i < w; i++) {
      const a = buf[i];
      const b = buf[i + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Peaks: the highest point of each positive stretch after the curve first dips below zero.
  const peaks = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  while (tau <= maxLag) {
    while (tau <= maxLag && nsdf[tau] <= 0) tau++;
    let best = -1;
    while (tau <= maxLag && nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
      tau++;
    }
    if (best >= minLag) peaks.push(best);
  }
  if (!peaks.length) return null;

  const top = Math.max(...peaks.map((p) => nsdf[p]));
  const pick = peaks.find((p) => nsdf[p] >= 0.9 * top);
  // Parabolic interpolation around the peak for sub-sample accuracy.
  const y0 = nsdf[pick - 1], y1 = nsdf[pick], y2 = nsdf[pick + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const clarity = y1 - 0.25 * (y0 - y2) * shift;
  if (clarity < minClarity) return null;
  return { freq: sampleRate / (pick + shift), clarity: Math.min(1, clarity) };
}

/** Median of a short list (steadies the needle against the odd stray reading). */
export function median(list) {
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
