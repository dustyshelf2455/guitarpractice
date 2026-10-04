// Draws diagrams as inline SVG: a horizontal fretboard for scales and
// arpeggios (high e on top, as in tab), and chord boxes for chords.
// Roots are solid; every dot is labelled, so nothing relies on colour.

import { el, svg } from './util.js';
import {
  scaleTones, arpeggioTones, fretboardNotes, chordShape, describeDiagram, pretty, STRING_NAMES, runNotes, runWindow,
} from './music.js';

const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9#♯♭]+/g, ' ').trim();

/**
 * One diagram. `itemText` lets the caption skip a description that just
 * repeats the item. With `upright`, fretboards are drawn both across (for
 * landscape) and as an upright neck (for portrait); CSS shows the one that fits.
 */
export function renderDiagram(d, itemText = '', { upright = false } = {}) {
  if (!d) return null;
  if (d.type === 'chords') return chordsDiagram(d);
  if (d.type === 'run') return runDiagram(d, upright);
  const toneList = d.type === 'scale' ? scaleTones(d.root, d.scale) : arpeggioTones(d.root, d.quality);
  if (!toneList.length) return null;
  const title = describeDiagram(d);
  const repeat = plain(title) === plain(itemText);
  return el('figure', { class: 'diagram diagram-board' },
    el('figcaption', { class: 'diagram-title' },
      repeat ? null : title.replace(/^./, (c) => c.toUpperCase()),
      el('span', { class: 'diagram-notes', text: toneList.map((t) => pretty(d.labels === 'intervals' ? t.interval : t.name)).join(' ') })),
    boards(fretboardNotes(toneList, d.position), (n) => (d.labels === 'intervals' ? n.interval : pretty(n.name)), title, upright));
}

/** A walk-up or bass run: numbered in playing order; the note it lands on is solid. */
function runDiagram(d, upright) {
  const notes = runNotes(d);
  const title = describeDiagram(d);
  return el('figure', { class: 'diagram diagram-board diagram-run' },
    el('figcaption', { class: 'diagram-title' },
      el('span', { class: 'diagram-notes', text: notes.map((n) => pretty(n.name)).join(' → ') })),
    boards({ notes: notes.map((n) => ({ ...n, root: n.last })), window: runWindow(d) }, (n) => String(n.order), title, upright));
}

function boards(data, labelOf, title, upright) {
  const across = fretboard(data, labelOf, title);
  if (!upright) return across;
  across.classList.add('board-h');
  return [across, fretboardUpright(data, labelOf, title)];
}

export function renderDiagrams(list, itemText = '', options = {}) {
  const nodes = (list || []).map((d) => renderDiagram(d, itemText, options)).filter(Boolean);
  return nodes.length ? nodes : null;
}

// ------------------------------------------------------------------ fretboard

function fretboard({ notes, window: [lo, hi] }, labelOf, title) {
  const open = lo === 0;
  const first = open ? 1 : lo;
  const cols = hi - first + 1;
  const W = 340;
  const left = open ? 42 : 26;
  const right = 6;
  const top = 12;
  const gap = 22;
  const bottom = 27;
  const H = top + gap * 5 + bottom;
  const cw = (W - left - right) / cols;
  const y = (string) => top + (5 - string) * gap;
  const x = (fret) => (fret === 0 ? left - 16 : left + (fret - first + 0.5) * cw);
  const r = Math.min(10, cw * 0.32);

  const g = svg('svg', {
    class: 'board', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${title}. ${notes.length} notes: ${notes.map((n) => `${STRING_NAMES[n.string]} string fret ${n.fret} ${n.name}`).join(', ')}`,
  });
  // Frets, nut, strings.
  for (let k = 0; k <= cols; k++) {
    const nut = k === 0 && first === 1;
    g.append(svg('line', { class: nut ? 'board-nut' : 'board-fret', x1: left + k * cw, x2: left + k * cw, y1: y(5), y2: y(0) }));
  }
  for (let s = 0; s < 6; s++) {
    g.append(svg('line', { class: 'board-string', x1: open ? left - 26 : left, x2: W - right, y1: y(s), y2: y(s) }));
    g.append(svg('text', { class: 'board-label', x: 2, y: y(s) + 3.5, text: STRING_NAMES[s] }));
  }
  for (let k = 0; k < cols; k++) {
    g.append(svg('text', { class: 'board-label', x: left + (k + 0.5) * cw, y: H - 5, 'text-anchor': 'middle', text: String(first + k) }));
  }
  // Notes.
  for (const n of notes) {
    const label = labelOf(n);
    g.append(svg('g', { class: n.root ? 'board-dot root' : 'board-dot' },
      svg('circle', { cx: x(n.fret), cy: y(n.string), r }),
      svg('text', { x: x(n.fret), y: y(n.string) + 3.3, 'text-anchor': 'middle', text: label })));
  }
  return g;
}

/** The same notes on an upright neck: strings run down the page, low E on the left, nut at the top. */
function fretboardUpright({ notes, window: [lo, hi] }, labelOf, title) {
  const open = lo === 0;
  const first = open ? 1 : lo;
  const rows = hi - first + 1;
  const W = 312;
  const left = 48; // room for the fret numbers beside the low E dots
  const right = 24;
  const top = open ? 58 : 34;
  const rh = 52;
  const H = top + rows * rh + 8;
  const sx = (W - left - right) / 5;
  const x = (string) => left + string * sx;
  const y = (fret) => (fret === 0 ? top - 21 : top + (fret - first + 0.5) * rh);
  const r = Math.min(16, sx * 0.33, rh * 0.31);

  const g = svg('svg', {
    class: 'board board-v', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${title}. ${notes.length} notes: ${notes.map((n) => `${STRING_NAMES[n.string]} string fret ${n.fret} ${n.name}`).join(', ')}`,
  });
  for (let s = 0; s < 6; s++) {
    g.append(svg('text', { class: 'board-label', x: x(s), y: 12, 'text-anchor': 'middle', text: STRING_NAMES[s] }));
    g.append(svg('line', { class: 'board-string', x1: x(s), x2: x(s), y1: open ? top - 34 : top, y2: top + rows * rh }));
  }
  for (let k = 0; k <= rows; k++) {
    const nut = k === 0 && first === 1;
    g.append(svg('line', { class: nut ? 'board-nut' : 'board-fret', x1: x(0), x2: x(5), y1: top + k * rh, y2: top + k * rh }));
  }
  for (let k = 0; k < rows; k++) {
    g.append(svg('text', { class: 'board-label', x: 13, y: top + (k + 0.5) * rh + 4.5, 'text-anchor': 'middle', text: String(first + k) }));
  }
  for (const n of notes) {
    g.append(svg('g', { class: n.root ? 'board-dot root' : 'board-dot' },
      svg('circle', { cx: x(n.string), cy: y(n.fret), r }),
      svg('text', { x: x(n.string), y: y(n.fret) + r * 0.36, 'text-anchor': 'middle', 'font-size': (r * 0.95).toFixed(1), text: labelOf(n) })));
  }
  return g;
}

// ------------------------------------------------------------------ chord boxes

function chordsDiagram(d) {
  const boxes = d.chords.map((token) => chordBox(chordShape(token))).filter(Boolean);
  if (!boxes.length) return null;
  return el('figure', { class: 'diagram diagram-chords' },
    el('div', { class: 'chord-row' }, boxes));
}

export function chordBox(shape) {
  if (!shape) return null;
  const fretted = shape.frets.filter((f) => f > 0);
  const max = fretted.length ? Math.max(...fretted) : 0;
  const start = max <= 4 ? 1 : Math.min(...fretted);
  const rows = Math.max(4, max - start + 1);
  const W = 76;
  const left = 15;
  const sx = 10;
  const top = 20;
  const gap = 15;
  const H = top + rows * gap + 6;
  const x = (s) => left + s * sx;
  const cy = (f) => top + (f - start + 0.5) * gap;

  const g = svg('svg', {
    class: 'chordbox', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${shape.label} chord, frets ${shape.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`,
  });
  for (let k = 0; k <= rows; k++) {
    g.append(svg('line', { class: k === 0 && start === 1 ? 'board-nut' : 'board-fret', x1: x(0), x2: x(5), y1: top + k * gap, y2: top + k * gap }));
  }
  for (let s = 0; s < 6; s++) g.append(svg('line', { class: 'board-string', x1: x(s), x2: x(s), y1: top, y2: top + rows * gap }));
  if (start > 1) g.append(svg('text', { class: 'board-label', x: x(0) - 4, y: cy(start) + 3, 'text-anchor': 'end', text: `${start}` }));

  shape.frets.forEach((f, s) => {
    if (f < 0) g.append(svg('text', { class: 'chord-mark', x: x(s), y: top - 6, 'text-anchor': 'middle', text: '×' }));
    else if (f === 0) g.append(svg('circle', { class: 'chord-open', cx: x(s), cy: top - 9, r: 3 }));
  });
  const b = shape.barre;
  if (b) {
    g.append(svg('rect', { class: 'chord-barre', x: x(b.from) - 5, y: cy(b.fret) - 5, width: x(b.to) - x(b.from) + 10, height: 10, rx: 5 }));
  }
  shape.frets.forEach((f, s) => {
    if (f <= 0) return;
    const onBarre = b && f === b.fret && s >= b.from && s <= b.to;
    if (!onBarre) g.append(svg('circle', { class: 'chord-dot', cx: x(s), cy: cy(f), r: 5 }));
    const finger = shape.fingers[s];
    if (finger && !(onBarre && s !== b.from)) {
      g.append(svg('text', { class: 'chord-finger', x: x(s), y: cy(f) + 2.4, 'text-anchor': 'middle', text: String(finger) }));
    }
  });
  return el('figure', { class: 'chord' },
    el('figcaption', { class: 'chord-name', text: pretty(shape.name) }),
    g,
    shape.shape ? el('span', { class: 'chord-shape', text: `${shape.shape} shape` }) : null);
}
