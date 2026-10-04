// Entry point: boot, hash routing, the clock loop, chime/vibration, wake lock, theme.

import { App } from './state.js';
import { openStore, requestPersistence } from './store.js';
import { TILE_MS, tileElapsed, sessionElapsed } from './engine.js';
import { el } from './util.js';
import {
  unlockAudio, resumeAudio, freshAudio, playChime, vibrate, scheduleChime, cancelChime, chimeWasScheduledFor, metronome,
} from './audio.js';
import { setWakeLock } from './wakelock.js';
import { sessionView } from './views/session.js';
import { openMetronomeSheet } from './views/metronome.js';
import { statsView, areaView, subtypeStatsView, historyView, sessionDetailView } from './views/stats.js';
import { settingsView, subtypeEditorView, areasView } from './views/settings.js';

const root = document.getElementById('app');
const live = el('div', { class: 'sr-only', 'aria-live': 'assertive' });
document.body.append(live);

function announce(message) {
  live.textContent = '';
  setTimeout(() => (live.textContent = message), 50);
}

let app;
let view = null; // { root, update?, tick?, title }
let viewKey = '';
const navStack = [location.hash || '#/'];
let replacing = false;

const ctx = {
  navigate: (hash) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  /** Go up to `parent`: use real history when we just came from there (so the
   *  phone's back gesture stays in step), otherwise replace this entry. */
  back: (parent = '#/') => {
    if (navStack.length > 1 && navStack[navStack.length - 2] === parent) history.back();
    else ctx.replace(parent);
  },
  /** Switch screens without adding a history entry (tabs). */
  replace: (hash) => {
    if (location.hash === hash) return;
    replacing = true;
    location.replace(hash);
  },
  openMetronome: () => openMetronomeSheet(app, { onChange: syncSideEffects }),
  /** Called inside the tap that starts a block: a fresh audio engine so its chime will sound. */
  refreshAudio: () => {
    if (!metronome.playing) freshAudio();
  },
  announce,
  get app() {
    return app;
  },
};

const ROUTES = [
  [/^#?\/?$/, () => sessionView(app, ctx)],
  [/^#\/stats$/, () => statsView(app, ctx)],
  [/^#\/stats\/area\/([^/]+)$/, (id) => areaView(app, ctx, decodeURIComponent(id))],
  [/^#\/stats\/subtype\/([^/]+)$/, (id) => subtypeStatsView(app, ctx, decodeURIComponent(id))],
  [/^#\/history$/, () => historyView(app, ctx)],
  [/^#\/history\/([^/]+)$/, (id) => sessionDetailView(app, ctx, decodeURIComponent(id))],
  [/^#\/settings$/, () => settingsView(app, ctx)],
  [/^#\/settings\/areas$/, () => areasView(app, ctx)],
  [/^#\/settings\/subtype\/([^/]+)$/, (id) => subtypeEditorView(app, ctx, decodeURIComponent(id))],
];

/** '#/' is the grid; '#/block/N' is block N full screen on top of it. */
function sessionRoute(hash) {
  if (!hash || hash === '#' || hash === '#/') return { focus: null };
  const m = /^#\/block\/(\d+)$/.exec(hash);
  return m ? { focus: Number(m[1]) } : null;
}

function resolve(hash) {
  for (const [re, make] of ROUTES) {
    const m = re.exec(hash || '#/');
    if (m) return () => make(...m.slice(1));
  }
  return ROUTES[0][1];
}

/** Build the view for the current route (or refresh it in place). */
function render() {
  const key = location.hash || '#/';
  const sr = sessionRoute(key);
  // Opening or closing the focus view keeps the session screen (and its grid) mounted.
  if (sr && view && view.setFocus) {
    viewKey = key;
    view.update();
    view.setFocus(sr.focus);
    return;
  }
  if (view && viewKey === key && view.update) {
    view.update();
    return;
  }
  const scroll = viewKey === key ? window.scrollY : 0;
  const focusKey = document.activeElement?.dataset?.key;
  view = sr ? sessionView(app, ctx) : resolve(key)();
  viewKey = key;
  root.replaceChildren(view.root);
  if (view.update) view.update();
  if (sr) view.setFocus(sr.focus);
  document.title = view.title && view.title !== 'Timebox' ? `${view.title} · Timebox` : 'Timebox';
  window.scrollTo(0, scroll);
  if (focusKey) root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

/** Views without an in-place update are rebuilt, keeping scroll and focus. */
function rerender() {
  if (view && view.update) view.update();
  else {
    viewKey = '';
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
}

// ---- metronome pulse: a pendulum glow across the top of the screen ----

const glow = el('span', { class: 'beat-glow' });
const bob = el('span', { class: 'beat-bob' }, glow);
const rail = el('div', { class: 'beat-rail', 'aria-hidden': 'true' }, bob);
document.body.append(rail);
const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');

metronome.onBeat((beat, strong) => {
  const beatMs = 60000 / metronome.bpm;
  // A tick lands as the bob reaches one end; it then swings to the other end for the next.
  if (!stillMotion.matches) {
    const travel = Math.max(0, rail.clientWidth - bob.offsetWidth);
    const from = beat % 2 === 0 ? 0 : travel;
    bob.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${travel - from}px)` }],
      { duration: beatMs, easing: 'cubic-bezier(0.37, 0, 0.63, 1)', fill: 'forwards' });
  }
  glow.animate([
    { opacity: 1, transform: strong ? 'scale(1.35, 2.2)' : 'scale(1.1, 1.5)', filter: 'brightness(1.25)' },
    { opacity: 0.6, transform: 'none', filter: 'none' },
  ], { duration: Math.min(beatMs * 0.75, 480), easing: 'ease-out' });
});

// ---- side effects that follow the session state ----

function syncSideEffects() {
  const s = app.active;
  const running = s && s.running != null ? s.tiles[s.running] : null;
  if (running && running.state === 'running') {
    scheduleChime(running.run_started_at + (TILE_MS - running.elapsed_ms));
  } else {
    cancelChime();
  }
  setWakeLock(!!running || metronome.playing);
  scheduleFrame();
  document.documentElement.classList.toggle('metro-on', metronome.playing);
  const label = root.querySelector('.metro-label');
  if (label) label.textContent = metronome.playing ? `${metronome.bpm} bpm` : 'Metronome';
}

function handleEvents(events) {
  const now = Date.now();
  for (const e of events) {
    if (e.type !== 'timeup') continue;
    const recent = now - e.at < 30_000;
    if (recent && !chimeWasScheduledFor(e.at)) playChime();
    if (recent) vibrate();
    const tile = app.boardTiles()[e.index];
    if (tile) announce(`Time's up: ${tile.item_text}. Tap it to finish.`);
  }
}

// ---- clock loop: the only thing that "ticks" is the display ----

// The display refreshes exactly when a shown second changes (tile or session
// clock), so countdowns flip on time and the phone wakes once a second at most.
let frameTimer = null;

function scheduleFrame() {
  clearTimeout(frameTimer);
  frameTimer = null;
  const s = app.active;
  const t = s && s.running != null ? s.tiles[s.running] : null;
  if (!t || t.state !== 'running') return;
  const now = Date.now();
  const toNext = (ms) => 1000 - (ms % 1000);
  const delay = Math.min(toNext(tileElapsed(t, now)), toNext(sessionElapsed(s, now)));
  frameTimer = setTimeout(frame, delay + 4);
}

async function frame() {
  if (app.active && app.active.running != null) {
    const events = await app.tick();
    if (events.length) handleEvents(events);
    else if (view && view.tick) view.tick();
  }
  scheduleFrame();
}

// Returning to the app (or the 30 s check): settle timers and roll the day over.
// Only the session screen refreshes here; other screens rebuild only when data
// actually changed (via the app's change event), so typing is never interrupted.
async function catchUp() {
  resumeAudio();
  const events = await app.refresh();
  handleEvents(events);
  if (view && view.update) view.update();
  syncSideEffects();
}

// ---- theme & style ----

const CHROME = {
  lounge: { dark: '#121a16', light: '#f2ebdb' },
  classic: { dark: '#0d0d0d', light: '#f9f9f7' },
};

function applyTheme() {
  const theme = app ? app.settings.theme : 'auto';
  const skin = app && app.settings.skin === 'classic' ? 'classic' : 'lounge';
  const html = document.documentElement;
  if (theme === 'auto') delete html.dataset.theme;
  else html.dataset.theme = theme;
  html.dataset.skin = skin;
  try {
    localStorage.setItem('timebox-theme', theme);
    localStorage.setItem('timebox-skin', skin);
  } catch {
    /* private mode */
  }
  const dark = theme === 'dark' || (theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const mode = theme === 'auto' ? (meta.media.includes('light') ? 'light' : 'dark') : dark ? 'dark' : 'light';
    meta.content = CHROME[skin][mode];
  }
}

// ---- boot ----

async function boot() {
  const store = await openStore();
  app = new App(store);
  await app.load();
  applyTheme();

  app.on((type) => {
    if (type === 'settings') applyTheme();
    rerender();
    syncSideEffects();
  });

  window.addEventListener('hashchange', () => {
    // A back gesture shouldn't leave a sheet floating over the new screen.
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const hash = location.hash || '#/';
    if (replacing) navStack[navStack.length - 1] = hash;
    else if (navStack[navStack.length - 2] === hash) navStack.pop();
    else navStack.push(hash);
    replacing = false;
    render();
    syncSideEffects();
    window.scrollTo(0, 0);
  });

  // Unlock audio on every gesture until it's running (iOS needs a gesture each time it suspends).
  // iOS only counts some events as activation for audio, so listen to several.
  const unlock = () => unlockAudio();
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') catchUp();
  });
  window.addEventListener('pageshow', catchUp);
  window.addEventListener('focus', catchUp);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

  setInterval(catchUp, 30_000); // midnight rollover, stale sessions

  render();
  syncSideEffects();
  const events = await app.refresh();
  handleEvents(events);

  requestPersistence();
  if (store.kind === 'memory') {
    root.prepend(el('p', { class: 'banner', text: 'This browser is blocking storage, so nothing will be saved.' }));
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
  }
}

boot().catch((err) => {
  console.error(err);
  root.replaceChildren(el('div', { class: 'boot-error' },
    el('h1', { text: 'Timebox could not start' }),
    el('p', { text: String(err && err.message ? err.message : err) }),
  ));
});

// Exposed for end-to-end tests and debugging in the console.
window.timebox = { get app() { return app; } };
