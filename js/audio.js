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

// A silent buffer played inside a gesture fully unlocks iOS Safari.
function prime(c) {
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

/** Call from a user gesture. Safe to call often. */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().catch(() => {});
    prime(c);
  } else if (!unlockAudio.done) {
    prime(c);
    unlockAudio.done = true;
  }
}

/**
 * Start over with a new audio engine. Call from a user gesture (starting the
 * metronome or a block). iOS can leave a page's audio context "running" but
 * silent after it has been idle or interrupted by another app; a fresh one,
 * created inside a tap, always plays. Any scheduled chime is dropped, and the
 * caller reschedules it.
 */
export function freshAudio() {
  const old = ctx;
  ctx = null;
  master = null;
  clicks = null;
  scheduled = null;
  unlockAudio.done = false;
  const c = context();
  if (c) {
    prime(c);
    unlockAudio.done = true;
    if (c.state !== 'running') c.resume().catch(() => {});
  }
  if (old && old.state !== 'closed') old.close().catch(() => {});
  return c;
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
//
// The audio clock stops while iOS suspends audio (screen locked, app in the
// background), so a chime scheduled before a suspension would ring late after
// it. `drift` compares the audio clock with the wall clock to catch that.

let scheduled = null; // { at: epoch ms, ctxTime, nodes }
let rang = null; // `at` of the last scheduled chime that actually started

function drift() {
  if (!scheduled || !ctx) return Infinity;
  return Math.abs(ctx.currentTime + (scheduled.at - Date.now()) / 1000 - scheduled.ctxTime);
}

function started() {
  return !!scheduled && !!ctx && ctx.state === 'running' && ctx.currentTime >= scheduled.ctxTime - 0.02;
}

/** Schedule the chime for wall-clock time `at`. Replaces any earlier schedule. */
export function scheduleChime(at) {
  if (scheduled && scheduled.at === at && audioRunning() && drift() < 0.25) return;
  cancelChime();
  const c = context();
  if (!c) return;
  if (c.state !== 'running') {
    // Resuming is asynchronous; try again once audio is running.
    c.resume().then(() => {
      if (!scheduled && c.state === 'running') scheduleChime(at);
    }).catch(() => {});
    return;
  }
  const delay = (at - Date.now()) / 1000;
  if (delay < 0.05) return;
  const ctxTime = c.currentTime + delay;
  scheduled = { at, ctxTime, nodes: chimeAt(ctxTime) };
}

/**
 * Drop the scheduled chime. One that has already started is left to ring out
 * (and remembered, so it isn't played twice); one still waiting is silenced,
 * which also stops a chime the suspended audio clock would play late.
 */
export function cancelChime() {
  if (!scheduled) return;
  if (started()) {
    rang = scheduled.at;
  } else {
    for (const n of scheduled.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
  }
  scheduled = null;
}

/** True if the chime for this time-up moment rang (or is ringing) from the audio clock. */
export function chimeWasScheduledFor(at) {
  return rang === at || (!!scheduled && scheduled.at === at && started());
}

/** Try to resume audio after the app comes back (iOS may still need a tap). */
export function resumeAudio() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function vibrate() {
  try {
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  } catch {
    /* unsupported */
  }
}

// ---- wooden click ----
//
// A wooden metronome "tock" is a short, heavily damped knock: a hollow body
// resonance, a brighter wooden partial, and a tiny click where the stick lands.
// Rendered once per sample rate into buffers, so every beat is identical and cheap.

export async function renderClick(sampleRate, accent) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const length = Math.ceil(sampleRate * 0.12);
  const oc = new OAC(1, length, sampleRate);
  const out = oc.createGain();
  out.gain.value = accent ? 1 : 0.7;
  const soften = oc.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 6500;
  soften.Q.value = 0.5;
  out.connect(soften).connect(oc.destination);

  const pitch = accent ? 1.16 : 1; // the accented beat knocks a little higher
  const mode = (freq, amp, decay) => {
    const o = oc.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.06, 0); // wood settles slightly flat after the strike
    o.frequency.exponentialRampToValueAtTime(freq, 0.012);
    const g = oc.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(amp, 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0001, decay);
    o.connect(g).connect(out);
    o.start(0);
    o.stop(decay + 0.01);
  };
  mode(1050 * pitch, 0.55, 0.055); // the block
  mode(2580 * pitch, 0.18, 0.022); // bright wooden overtone
  mode(380 * pitch, 0.32, 0.035); // hollow body

  // The stick: a few milliseconds of band-passed noise.
  const noise = oc.createBuffer(1, Math.ceil(sampleRate * 0.01), sampleRate);
  const data = noise.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  const src = oc.createBufferSource();
  src.buffer = noise;
  const band = oc.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200 * pitch;
  band.Q.value = 0.9;
  const ng = oc.createGain();
  ng.gain.setValueAtTime(0.5, 0);
  ng.gain.exponentialRampToValueAtTime(0.0001, 0.006);
  src.connect(band).connect(ng).connect(out);
  src.start(0);

  return oc.startRendering();
}

let clicks = null; // { rate, normal, accent }

async function clickBuffers(c) {
  if (clicks && clicks.rate === c.sampleRate) return clicks;
  const [normal, accent] = await Promise.all([renderClick(c.sampleRate, false), renderClick(c.sampleRate, true)]);
  clicks = { rate: c.sampleRate, normal, accent };
  return clicks;
}

function playBuffer(c, buffer, when) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start(when);
}

// ---- metronome (lookahead scheduler, "a tale of two clocks") ----

export const metronome = {
  playing: false,
  bpm: 70,
  beats: 4, // 0 = no accent grouping
  accent: true,
  listeners: new Set(), // (beatIndex, strong) => void, called close to when each click sounds
  _timer: null,
  _next: 0,
  _beat: 0,

  start() {
    const c = context();
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    this.playing = true;
    this._beat = 0;
    this._next = c.currentTime + 0.1;
    clickBuffers(c).then(() => {
      if (!this.playing || this._timer) return;
      this._next = Math.max(this._next, c.currentTime + 0.05);
      this._timer = setInterval(() => this._schedule(), 25);
      this._schedule();
    });
  },

  stop() {
    this.playing = false;
    clearInterval(this._timer);
    this._timer = null;
  },

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(260, Math.round(bpm)));
  },

  /** Listen for beats; returns a function that stops listening. */
  onBeat(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  _schedule() {
    const c = ctx;
    if (!c || !this.playing) return;
    while (this._next < c.currentTime + 0.12) {
      const beat = this._beat;
      const strong = this.accent && this.beats > 1 && beat % this.beats === 0;
      playBuffer(c, strong ? clicks.accent : clicks.normal, this._next);
      if (this.listeners.size) {
        const delayMs = Math.max(0, (this._next - c.currentTime) * 1000);
        setTimeout(() => {
          if (!this.playing) return;
          for (const fn of this.listeners) fn(beat, strong);
        }, delayMs);
      }
      this._next += 60 / this.bpm;
      this._beat = beat + 1;
    }
  },
};
