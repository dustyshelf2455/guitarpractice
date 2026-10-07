// Draws diagrams as inline SVG: a horizontal fretboard for scales and
// arpeggios (high e on top, as in tab), and chord boxes for chords.
// Roots are solid; every dot is labelled, so nothing relies on colour.

import { el, svg } from './util.js';
import {
  scaleTones, arpeggioTones, fretboardNotes, chordShape, parseChord, describeDiagram, pretty, STRING_NAMES, runNotes, runWindow,
  PROGRESSION_KEYS, numeralBars, numeralChord, prettyNumeral,
} from './music.js';
import {
  parseTab, parseRhythm, tabNoteNames, readChart, isChordSymbol, strumCounts, strumSubdivision,
} from './notation.js';

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
  if (d.type === 'tab') return tabDiagram(d);
  if (d.type === 'progression') return progressionDiagram(d);
  if (d.type === 'numbers') return numbersDiagram(d);
  if (d.type === 'strum') return strumDiagram(d);
  const toneList = d.type === 'scale' ? scaleTones(d.root, d.scale) : arpeggioTones(d.root, d.quality);
  if (!toneList.length) return null;
  const title = describeDiagram(d);
  const repeat = plain(title) === plain(itemText);
  return el('figure', { class: 'diagram diagram-board' },
    el('figcaption', { class: 'diagram-title' },
      repeat ? null : title.replace(/^./, (c) => c.toUpperCase()),
      el('span', { class: 'diagram-notes', text: toneList.map((t) => pretty(d.labels === 'intervals' ? t.interval : t.name)).join(' ') })),
    boards({ ...fretboardNotes(toneList, d.position), marksOpen: true }, (n) => (d.labels === 'intervals' ? n.interval : pretty(n.name)), title, upright));
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

/**
 * Both board drawings get one empty fret past the notes so the shape of the
 * neck reads. With `marksOpen` (scales, arpeggios) an open string that isn't
 * in the set gets an ×, so every open string says whether it's in or out.
 */
function boards(data, labelOf, title, upright) {
  const [lo, hi] = data.window;
  data = { ...data, window: [lo, hi + 1], muted: data.marksOpen && lo === 0 ? openStringsOut(data.notes) : [] };
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

const openStringsOut = (notes) => [0, 1, 2, 3, 4, 5].filter((s) => !notes.some((n) => n.string === s && n.fret === 0));
const dotClass = (n) => `board-dot${n.root ? ' root' : ''}${n.fret === 0 ? ' open' : ''}`;
const ariaNotes = (title, notes, muted) => `${title}. ${notes.length} notes: ${notes.map((n) => `${STRING_NAMES[n.string]} string ${n.fret === 0 ? 'open' : `fret ${n.fret}`} ${n.name}`).join(', ')}`
  + (muted.length ? `. Open ${muted.map((s) => STRING_NAMES[s]).join(', ')} not in it` : '');

function fretboard({ notes, window: [lo, hi], muted }, labelOf, title) {
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
    'aria-label': ariaNotes(title, notes, muted),
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
  for (const s of muted) g.append(svg('text', { class: 'board-muted', x: x(0), y: y(s) + 4.5, 'text-anchor': 'middle', text: '×' }));
  // Notes.
  for (const n of notes) {
    const label = labelOf(n);
    g.append(svg('g', { class: dotClass(n) },
      svg('circle', { cx: x(n.fret), cy: y(n.string), r }),
      svg('text', { x: x(n.fret), y: y(n.string) + 3.3, 'text-anchor': 'middle', text: label })));
  }
  return g;
}

/** The same notes on an upright neck: strings run down the page, low E on the left, nut at the top. */
function fretboardUpright({ notes, window: [lo, hi], muted }, labelOf, title) {
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
    'aria-label': ariaNotes(title, notes, muted),
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
  for (const s of muted) g.append(svg('text', { class: 'board-muted', x: x(s), y: y(0) + 8, 'text-anchor': 'middle', text: '×' }));
  for (const n of notes) {
    g.append(svg('g', { class: dotClass(n) },
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
  const rows = Math.max(4, max - start + 2); // an empty fret past the shape
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
    shape.shape ? el('span', { class: 'chord-shape', text: `${shape.shape} shape` })
      : shape.note ? el('span', { class: 'chord-shape', text: shape.note }) : null);
}

// ------------------------------------------------------------------ tab (licks)

const BEND_WORDS = { 1: '½', 2: 'full', 3: '1½', 4: '2' };

/** A lick as tab: six lines, high e on top, wrapped into rows of up to eight notes (at bar lines when it has them). */
function tabDiagram(d) {
  const events = parseTab(d.tab);
  if (!events.length) return null;
  const rhythm = parseRhythm(d.rhythm, events.length);
  // Where each note falls in its bar, in beats, so eighths in one beat share a beam.
  let pos = 0;
  const beats = events.map((ev, k) => {
    if (ev.bar) pos = 0;
    const at = pos;
    pos += rhythm ? rhythm[k].beats : 1;
    return at;
  });
  const rows = tabRows(events);
  const per = Math.max(...rows.map(([a, b]) => b - a));
  const names = tabNoteNames(events);
  const systems = rows.map(([a, b]) => tabSystem(events.slice(a, b), per, a === 0,
    rhythm && rhythm.slice(a, b).map((r, i) => ({ ...r, at: beats[a + i] }))));
  return el('figure', { class: 'diagram diagram-tab', role: 'img', 'aria-label': `Tab, ${events.length} notes: ${names.map(pretty).join(', ')}` },
    events.length <= 16 ? el('figcaption', { class: 'diagram-title' }, el('span', { class: 'diagram-notes', text: names.map(pretty).join(' ') })) : null,
    systems);
}

/** [start, end) of each row: whole bars, packed up to eight notes; otherwise even rows of up to eight. */
function tabRows(events) {
  const bars = [];
  events.forEach((ev, k) => { if (k === 0 || ev.bar) bars.push([k, k]); bars[bars.length - 1][1] = k + 1; });
  if (bars.length > 1 && bars.every(([a, b]) => b - a <= 8)) {
    const rows = [];
    for (const [a, b] of bars) {
      const last = rows[rows.length - 1];
      if (last && b - last[0] <= 8) last[1] = b;
      else rows.push([a, b]);
    }
    return rows;
  }
  const rowCount = Math.ceil(events.length / 8);
  const per = Math.ceil(events.length / rowCount);
  const rows = [];
  for (let k = 0; k < events.length; k += per) rows.push([k, Math.min(k + per, events.length)]);
  return rows;
}

function tabSystem(events, per, first, rhythm) {
  const col = 34;
  const left = 24;
  const top = 26;
  const gap = 17;
  const W = left + 14 + per * col;
  const H = top + gap * 5 + (rhythm ? 32 : 10);
  const x = (k) => left + 16 + k * col;
  const y = (string) => top + (5 - string) * gap;
  // Sized by its length, so fret numbers read the same size in every lick.
  const g = svg('svg', { class: 'tab', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', style: `width: ${(W * 0.1).toFixed(2)}rem` });
  for (let s = 0; s < 6; s++) {
    g.append(svg('line', { class: 'tab-line', x1: left, x2: W - 2, y1: y(s), y2: y(s) }));
    g.append(svg('text', { class: 'tab-label', x: 8, y: y(s) + 4, 'text-anchor': 'middle', text: STRING_NAMES[s] }));
  }
  g.append(svg('line', { class: first ? 'tab-start' : 'tab-bar', x1: left, x2: left, y1: y(5), y2: y(0) }));
  if (rhythm) tabRhythm(g, rhythm, x, y(0));
  events.forEach((ev, k) => {
    if (ev.bar && k > 0) {
      // Clear of a bend arrow on the note before.
      const bx = x(k) - col / 2 + (events[k - 1].notes.some((n) => n.bend != null) ? 5 : 0);
      g.append(svg('line', { class: 'tab-bar', x1: bx, x2: bx, y1: y(5), y2: y(0) }));
    }
    for (const n of ev.notes) {
      const cx = x(k);
      const cy = y(n.string);
      // A slide into the first note of a row comes from nowhere: a short stroke before it.
      if (n.tech === '/' && k === 0) g.append(svg('line', { class: 'tab-slide', x1: cx - 13, x2: cx - 8, y1: cy + 4, y2: cy - 3 }));
      if (n.tech && k > 0) {
        const px = x(k - 1);
        if (n.tech === '/' || n.tech === '\\') {
          const up = n.tech === '/';
          g.append(svg('line', { class: 'tab-slide', x1: px + 9, x2: cx - 9, y1: cy + (up ? 4 : -4), y2: cy + (up ? -4 : 4) }));
        } else {
          g.append(svg('path', { class: 'tab-slur', d: `M${px + 3} ${cy - 9} Q${(px + cx) / 2} ${cy - 17} ${cx - 3} ${cy - 9}` }));
          g.append(svg('text', { class: 'tab-tech', x: (px + cx) / 2, y: cy - 16, 'text-anchor': 'middle', text: n.tech }));
        }
      }
      g.append(svg('text', { class: 'tab-num', x: cx, y: cy + 5, 'text-anchor': 'middle', text: n.fret === 'x' ? '×' : String(n.fret) }));
      if (n.bend != null) {
        const amount = BEND_WORDS[n.bend - n.fret] || `+${n.bend - n.fret}`;
        g.append(svg('path', { class: 'tab-bend', d: `M${cx + 9} ${cy - 1} Q${cx + 15} ${cy - 2} ${cx + 15} ${cy - 13}` }));
        g.append(svg('path', { class: 'tab-arrow', d: `M${cx + 11.5} ${cy - 10} L${cx + 15} ${cy - 15} L${cx + 18.5} ${cy - 10} Z` }));
        g.append(svg('text', { class: 'tab-tech', x: cx + 15, y: cy - 18, 'text-anchor': 'middle', text: n.release != null ? `${amount} ↓` : amount }));
      }
      if (n.vib) g.append(svg('text', { class: 'tab-tech', x: cx, y: cy - 10, 'text-anchor': 'middle', text: '∿' }));
    }
  });
  return g;
}

/** Rhythm under the tab, as in printed tab: stems, with eighths and sixteenths in one beat beamed together. */
function tabRhythm(g, rhythm, x, bottom) {
  const y1 = bottom + 10;
  const y2 = bottom + 28;
  const beamed = (r) => r.value === 'e' || r.value === 's';
  rhythm.forEach((r, k) => {
    if (r.value === 'w') return;
    g.append(svg('line', { class: 'tab-stem', x1: x(k), x2: x(k), y1: r.value === 'h' ? y1 + 9 : y1, y2 }));
    if (r.dotted) g.append(svg('circle', { class: 'tab-dot', cx: x(k) + 5, cy: y2 - 3, r: 1.6 }));
  });
  // Group beamable notes that share a beat.
  const groups = [];
  rhythm.forEach((r, k) => {
    const last = groups[groups.length - 1];
    if (!beamed(r)) return;
    if (last && last[last.length - 1] === k - 1 && Math.floor(rhythm[k - 1].at) === Math.floor(r.at)) last.push(k);
    else groups.push([k]);
  });
  for (const group of groups) {
    if (group.length === 1) {
      const k = group[0];
      const flags = rhythm[k].value === 's' ? 2 : 1;
      for (let f = 0; f < flags; f++) {
        g.append(svg('path', { class: 'tab-flag', d: `M${x(k)} ${y2 - f * 5} q 5 -3 8 -9` }));
      }
      continue;
    }
    const a = group[0];
    const b = group[group.length - 1];
    g.append(svg('rect', { class: 'tab-beam', x: x(a), y: y2 - 3, width: x(b) - x(a), height: 3 }));
    // A second beam between neighbouring sixteenths, or a stub on a lone one.
    group.forEach((k, i) => {
      if (rhythm[k].value !== 's') return;
      const next = group[i + 1];
      if (next != null && rhythm[next].value === 's') {
        g.append(svg('rect', { class: 'tab-beam', x: x(k), y: y2 - 8, width: x(next) - x(k), height: 3 }));
      } else if (!(i > 0 && rhythm[group[i - 1]].value === 's')) {
        const dir = i === group.length - 1 ? -1 : 1;
        g.append(svg('rect', { class: 'tab-beam', x: dir > 0 ? x(k) : x(k) - 8, y: y2 - 8, width: 8, height: 3 }));
      }
    });
  }
}

// ------------------------------------------------------------------ chord charts (songs)

/** A song's chords by section, with a chord box for each chord it uses. */
function progressionDiagram(d) {
  const chart = readChart(d.text);
  if (!chart.chords.length) return null;
  const token = (t) => {
    if (t === '|') return el('span', { class: 'prog-bar', 'aria-hidden': 'true' });
    if (/^\(?[x×]\d\)?$/i.test(t)) return el('span', { class: 'prog-repeat', text: `×${t.replace(/\D/g, '')}` });
    if (isChordSymbol(t)) return el('span', { class: 'prog-chord', text: pretty(t) });
    return el('span', { class: 'prog-text', text: t });
  };
  const seen = new Set();
  const written = new Map((d.shapes || []).map(chordShape).filter(Boolean).map((s) => [s.name, s]));
  const boxes = chart.chords
    .map((c) => written.get(parseChord(c)?.name) || chordShape(c.replace(/\/.*/, '')))
    .filter((shape) => shape && !seen.has(shape.name) && seen.add(shape.name))
    .slice(0, 10)
    .map(chordBox);
  return el('figure', { class: 'diagram diagram-progression' },
    chart.meta.length ? el('p', { class: 'prog-meta' },
      chart.meta.map(([k, v]) => el('span', { class: 'prog-meta-item' }, el('span', { class: 'prog-meta-key', text: k }), ` ${v}`))) : null,
    el('div', { class: 'prog-sections' },
      chart.sections.map((s) => el('div', { class: 'prog-section' },
        el('span', { class: 'prog-label', text: s.label }),
        el('div', { class: 'prog-rows' }, s.rows.map((row) => el('div', { class: 'prog-row' }, row.map(token))))))),
    boxes.length ? el('div', { class: 'chord-row prog-boxes' }, boxes) : null);
}

// ------------------------------------------------------------------ progressions by number

// The key last picked on any progressions diagram, so every one opens in it.
const KEY_STORE = 'timebox-progression-key';
function savedKey() {
  try { return localStorage.getItem(KEY_STORE); } catch { return null; }
}
function saveKey(key) {
  try { localStorage.setItem(KEY_STORE, key); } catch { /* private mode: the menu still works */ }
}

/**
 * Progressions written in numbers, with the chords for the key picked from the
 * menu under each number, and a chord box for every chord they use.
 */
function numbersDiagram(d) {
  let key = PROGRESSION_KEYS.includes(savedKey()) ? savedKey() : d.key;
  const menu = el('select', {
    class: 'input numbers-key-select', 'aria-label': 'Key',
    onchange: (e) => { key = e.target.value; saveKey(key); draw(); },
  }, PROGRESSION_KEYS.map((k) => el('option', { value: k, selected: k === key }, pretty(k))));
  const list = el('ol', { class: 'numbers-list' });
  const boxes = el('div', { class: 'chord-row prog-boxes' });

  function draw() {
    list.replaceChildren(...d.progressions.map((p) => el('li', { class: 'numbers-prog' },
      p.name ? el('span', { class: 'numbers-name', text: p.name }) : null,
      el('div', { class: 'numbers-bars' }, numeralBars(p.bars).map((bar) => el('span', { class: 'numbers-bar' },
        bar.map((t) => el('span', { class: 'numbers-step' },
          el('span', { class: 'numbers-numeral', text: prettyNumeral(t) }),
          el('span', { class: 'numbers-chord', text: pretty(numeralChord(key, t)) })))))))));
    const seen = new Set();
    boxes.replaceChildren(...d.progressions.flatMap((p) => numeralBars(p.bars).flat())
      .map((t) => chordShape(numeralChord(key, t)))
      .filter((shape) => shape && !seen.has(shape.name) && seen.add(shape.name))
      .slice(0, 12)
      .map(chordBox));
  }
  draw();
  return el('figure', { class: 'diagram diagram-numbers' },
    el('label', { class: 'numbers-key' }, el('span', { class: 'numbers-key-label', text: 'Key of' }), menu),
    list, boxes);
}

// ------------------------------------------------------------------ strumming patterns

/**
 * Down and up arrows for each slot of the bar, with the count underneath.
 * Slots carry data-i so the metronome can light them in time (see main.js).
 */
function strumDiagram(d) {
  const n = d.pattern.length;
  const counts = strumCounts(n);
  const per = strumSubdivision(n);
  const accents = new Set(d.accents || []);
  const sw = 40;
  const W = n * sw;
  const H = 104;
  const g = svg('svg', { class: 'strum', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  [...d.pattern].forEach((c, i) => {
    const cx = i * sw + sw / 2;
    const slot = svg('g', { class: `strum-slot${i % per === 0 ? ' beat' : ''}${accents.has(i) ? ' accent' : ''}`, 'data-i': i });
    slot.append(svg('rect', { class: 'strum-hit', x: i * sw + 3, y: 4, width: sw - 6, height: 78, rx: 8 }));
    if (c === '-') {
      slot.append(svg('circle', { class: 'strum-rest', cx, cy: 45, r: 2.8 }));
    } else {
      const down = c !== 'U';
      const head = down ? `M${cx - 10} 62 L${cx} 77 L${cx + 10} 62 Z` : `M${cx - 10} 30 L${cx} 15 L${cx + 10} 30 Z`;
      slot.append(svg('line', { class: 'strum-shaft', x1: cx, x2: cx, y1: down ? 18 : 72, y2: down ? 66 : 26 }));
      slot.append(svg('path', { class: 'strum-head', d: head }));
      if (c === 'X') slot.append(svg('path', { class: 'strum-mute', d: `M${cx - 8} 38 L${cx + 8} 52 M${cx + 8} 38 L${cx - 8} 52` }));
      if (accents.has(i)) slot.append(svg('text', { class: 'strum-accent', x: cx, y: 12, 'text-anchor': 'middle', text: '>' }));
    }
    slot.append(svg('text', { class: 'strum-count', x: cx, y: 99, 'text-anchor': 'middle', text: counts[i] }));
    g.append(slot);
  });
  const words = [...d.pattern].map((c, i) => `${counts[i]} ${({ D: 'down', U: 'up', X: 'chuck', '-': 'miss' })[c]}${accents.has(i) ? ' accented' : ''}`);
  return el('figure', { class: 'diagram diagram-strum', dataset: { per: String(per) }, role: 'img', 'aria-label': `Strumming pattern: ${words.join(', ')}` }, g);
}
