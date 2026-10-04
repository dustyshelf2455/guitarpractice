// Small shared helpers. Nothing here touches the DOM at import time, so the
// pure modules that use it can be unit-tested in Node.

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date for a timestamp, as 'YYYY-MM-DD'. */
export function localDate(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

/** Whole days from date a to date b (b - a). DST-safe. */
export function daysBetween(a, b) {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function addDays(dateStr, n) {
  const [y, m, d] = parts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(dateStr) {
  const [y, m, d] = parts(dateStr);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr) {
  return addDays(dateStr, -weekday(dateStr));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthName(dateStr) {
  return MONTHS[parts(dateStr)[1] - 1];
}

/** 'Mon 3 Oct' style, with the year added when it is not the current one. */
export function fmtDate(dateStr, today = localDate()) {
  const [y, m, d] = parts(dateStr);
  const base = `${DAYS[weekday(dateStr)]} ${d} ${MONTHS[m - 1]}`;
  return y === parts(today)[0] ? base : `${base} ${y}`;
}

export function fmtShortDate(dateStr) {
  const [, m, d] = parts(dateStr);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Countdown text. Rounds up so a fresh tile reads 5:00 and only a finished one 0:00. */
export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** Human duration from seconds: '45s', '25m', '1h 05m', '12h'. */
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h >= 10) return `${h}h`;
  return rem ? `${h}h ${pad(rem)}m` : `${h}h`;
}

export function fmtTimeOfDay(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

export function fmtRating(r) {
  return r == null || Number.isNaN(r) ? '–' : r.toFixed(1);
}

export function uid(prefix = '') {
  const c = globalThis.crypto;
  const raw = c && c.randomUUID
    ? c.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return prefix + raw;
}

export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function mean(values) {
  const v = values.filter((x) => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Only http(s) links are ever rendered, so imported data can't smuggle in javascript: URLs. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let raw = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** First "NN bpm" in a string, if any (used to preset the metronome). */
export function parseBpm(text) {
  const m = /(\d{2,3})\s*bpm/i.exec(text || '');
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 30 && n <= 260 ? n : null;
}

// ---- DOM helpers (only called in the browser) ----

/** Create an element. Strings become text nodes, never HTML. */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  appendChildren(node, children);
  return node;
}

function applyProps(node, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
}

function appendChildren(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
}

/**
 * Show a clock string with each digit in its own fixed-width slot, so
 * proportional display fonts don't make the countdown jiggle.
 */
export function setDigits(node, text) {
  if (node.dataset.text === text) return;
  node.dataset.text = text;
  node.replaceChildren(...[...text].map((ch) => {
    const span = document.createElement('span');
    span.className = /\d/.test(ch) ? 'dg' : 'dg-sep';
    span.textContent = ch;
    return span;
  }));
}

// Icons: tiny inline SVG paths, stroked with currentColor.
const ICONS = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  stats: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  metronome: '<path d="M9 3h6l4 18H5z"/><path d="M12 15l5-8"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}
