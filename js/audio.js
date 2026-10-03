// Sound: audio unlock (needed on iOS), the time-up chime, and the metronome.
//
// The chime for a running block is scheduled on the audio clock as soon as the
// block starts, so it rings on time even if JavaScript timers are throttled.
// If that wasn't possible (audio suspended), the app plays it when it notices.

let ctx = null;
let master = null;

function context() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a user gesture. Safe to call often. */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  // A silent buffer played inside the gesture fully unlocks iOS Safari.
  if (!unlockAudio.done) {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
    unlockAudio.done = true;
  }
}

export function audioRunning() {
  return !!ctx && ctx.state === 'running';
}

function tone(c, freq, start, duration, peak, out = master, type = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  return osc;
}

/** A soft three-note bell. Returns the oscillators so a scheduled chime can be cancelled. */
function chimeAt(when) {
  const c = context();
  if (!c) return [];
  const t = Math.max(c.currentTime, when);
  return [
    tone(c, 880, t, 1.2, 0.35),
    tone(c, 1318.5, t + 0.16, 1.2, 0.3),
    tone(c, 1760, t + 0.32, 1.6, 0.25),
  ];
}

export function playChime() {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  chimeAt(c.currentTime + 0.02);
}

// ---- scheduled chime for the running block ----

let scheduled = null; // { at (epoch ms), nodes }

/** Schedule the chime for wall-clock time `at`. Replaces any earlier schedule. */
export function scheduleChime(at) {
  if (scheduled && scheduled.at === at) return;
  cancelChime();
  const c = context();
  if (!c || c.state !== 'running') return;
  const delay = (at - Date.now()) / 1000;
  if (delay < 0.05) return;
  scheduled = { at, nodes: chimeAt(c.currentTime + delay) };
}

export function cancelChime() {
  if (!scheduled) return;
  for (const n of scheduled.nodes) {
    try {
      n.stop();
    } catch {
      /* already stopped */
    }
  }
  scheduled = null;
}

/** True if the chime for this time-up moment was already scheduled on the audio clock. */
export function chimeWasScheduledFor(at) {
  return !!scheduled && scheduled.at === at && audioRunning();
}

export function vibrate() {
  try {
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  } catch {
    /* unsupported */
  }
}

// ---- metronome (lookahead scheduler, "a tale of two clocks") ----

export const metronome = {
  playing: false,
  bpm: 70,
  beats: 4, // 0 = no accent grouping
  accent: true,
  onBeat: null, // (beatIndex) => void, called close to when each click sounds
  _timer: null,
  _next: 0,
  _beat: 0,

  start() {
    const c = context();
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    this.playing = true;
    this._beat = 0;
    this._next = c.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  },

  stop() {
    this.playing = false;
    clearInterval(this._timer);
    this._timer = null;
  },

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(260, Math.round(bpm)));
  },

  _schedule() {
    const c = ctx;
    if (!c || !this.playing) return;
    while (this._next < c.currentTime + 0.12) {
      const beat = this._beat;
      const strong = this.accent && this.beats > 1 && beat % this.beats === 0;
      tone(c, strong ? 1500 : 1000, this._next, 0.05, strong ? 0.6 : 0.4, master, 'square');
      if (this.onBeat) {
        const delayMs = Math.max(0, (this._next - c.currentTime) * 1000);
        setTimeout(() => this.playing && this.onBeat && this.onBeat(beat), delayMs);
      }
      this._next += 60 / this.bpm;
      this._beat = beat + 1;
    }
  },
};
