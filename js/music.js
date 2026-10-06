// Music theory for the diagrams: spelled scales, arpeggios, fretboard
// positions, chord shapes, and parsing. Pure functions, no DOM.
//
// Diagram data stored on a library item (item.diagrams is a list):
//   { type: 'scale',    root: 'C', scale: 'major',  position: 'open' | 1..12, labels: 'notes' | 'intervals' }
//   { type: 'arpeggio', root: 'C', quality: 'major', position: 'open' | 1..12, labels: 'notes' | 'intervals' }
//   { type: 'chords',   chords: ['C', 'G', 'Am', 'F:E'] }   ':E' / ':A' asks for that barre shape,
//                                                         'G=xxx433' a written-out voicing (triads)
//   { type: 'run',      notes: [[string, fret], ...] }      a bass run / walk-up, in playing order
//   { type: 'numbers',  key: 'G', progressions: [{ name, bars: 'I | vi | IV | V7' }] }
//                                                         progressions by number, shown in a key you pick

import { parseTab, serialiseTab, cleanChart, readChart, normaliseStrum, readStrum } from './notation.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Standard tuning, low E to high E.
export const TUNING = [4, 9, 2, 7, 11, 4];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

export const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Each scale is a list of [degree index, semitones above the root], which lets
// notes be spelled properly (one letter per degree: F major has Bb, not A#).
export const SCALES = {
  major: { name: 'Major', steps: [[0, 0], [1, 2], [2, 4], [3, 5], [4, 7], [5, 9], [6, 11]] },
  natural_minor: { name: 'Natural minor', steps: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7], [5, 8], [6, 10]] },
  harmonic_minor: { name: 'Harmonic minor', steps: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7], [5, 8], [6, 11]] },
  melodic_minor: { name: 'Melodic minor', steps: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7], [5, 9], [6, 11]] },
  major_pentatonic: { name: 'Major pentatonic', steps: [[0, 0], [1, 2], [2, 4], [4, 7], [5, 9]] },
  minor_pentatonic: { name: 'Minor pentatonic', steps: [[0, 0], [2, 3], [3, 5], [4, 7], [6, 10]] },
  blues: { name: 'Blues', steps: [[0, 0], [2, 3], [3, 5], [4, 6], [4, 7], [6, 10]] },
  dorian: { name: 'Dorian', steps: [[0, 0], [1, 2], [2, 3], [3, 5], [4, 7], [5, 9], [6, 10]] },
  phrygian: { name: 'Phrygian', steps: [[0, 0], [1, 1], [2, 3], [3, 5], [4, 7], [5, 8], [6, 10]] },
  lydian: { name: 'Lydian', steps: [[0, 0], [1, 2], [2, 4], [3, 6], [4, 7], [5, 9], [6, 11]] },
  mixolydian: { name: 'Mixolydian', steps: [[0, 0], [1, 2], [2, 4], [3, 5], [4, 7], [5, 9], [6, 10]] },
  locrian: { name: 'Locrian', steps: [[0, 0], [1, 1], [2, 3], [3, 5], [4, 6], [5, 8], [6, 10]] },
};

export const ARPEGGIOS = {
  major: { name: 'Major', steps: [[0, 0], [2, 4], [4, 7]] },
  minor: { name: 'Minor', steps: [[0, 0], [2, 3], [4, 7]] },
  '7': { name: 'Dominant 7', steps: [[0, 0], [2, 4], [4, 7], [6, 10]] },
  maj7: { name: 'Major 7', steps: [[0, 0], [2, 4], [4, 7], [6, 11]] },
  m7: { name: 'Minor 7', steps: [[0, 0], [2, 3], [4, 7], [6, 10]] },
  dim: { name: 'Diminished', steps: [[0, 0], [2, 3], [4, 6]] },
  aug: { name: 'Augmented', steps: [[0, 0], [2, 4], [4, 8]] },
  m7b5: { name: 'Half-diminished', steps: [[0, 0], [2, 3], [4, 6], [6, 10]] },
};

// ------------------------------------------------------------------ notes

export function parseNote(name) {
  const m = /^([A-Ga-g])([#b♯♭]{0,2})$/.exec(String(name || '').trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let acc = 0;
  for (const c of m[2]) acc += c === '#' || c === '♯' ? 1 : -1;
  return { letter, acc, pc: (NATURAL[letter] + acc + 12) % 12 };
}

export function noteName(letter, acc) {
  return letter + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
}

/** Pretty form for display: C#, Bb -> C♯, B♭. */
export function pretty(name) {
  return String(name)
    .replace(/([A-G])(#+)/g, (_, l, a) => l + '♯'.repeat(a.length))
    .replace(/([A-G])(b+)/g, (_, l, a) => l + '♭'.repeat(a.length));
}

function spell(root, degree, semitones) {
  const r = parseNote(root);
  const letter = LETTERS[(LETTERS.indexOf(r.letter) + degree) % 7];
  const target = (r.pc + semitones) % 12;
  let acc = (target - NATURAL[letter] + 12) % 12;
  if (acc > 6) acc -= 12;
  return { name: noteName(letter, acc), pc: target };
}

function intervalName(degree, semitones) {
  let acc = semitones - MAJOR_STEPS[degree];
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  return (acc < 0 ? '♭'.repeat(-acc) : '♯'.repeat(acc)) + (degree + 1);
}

/** The notes of a scale or arpeggio, spelled: [{ name, pc, interval, root }]. */
export function tones(root, steps) {
  if (!parseNote(root)) return [];
  return steps.map(([degree, semis]) => {
    const n = spell(root, degree, semis);
    return { name: n.name, pc: n.pc, interval: intervalName(degree, semis), root: semis === 0 };
  });
}

export function scaleTones(root, scale) {
  return SCALES[scale] ? tones(root, SCALES[scale].steps) : [];
}

export function arpeggioTones(root, quality) {
  return ARPEGGIOS[quality] ? tones(root, ARPEGGIOS[quality].steps) : [];
}

// ------------------------------------------------------------------ fretboard

/** Fret window for a position: 'open' is frets 0-3; a number n is frets n..n+3. */
export function positionWindow(position) {
  if (position === 'open' || position === 0) return [0, 3];
  const n = Math.max(1, Math.min(12, Number(position) || 1));
  return [n, n + 3];
}

/** Every fretted note of the tone set inside the window: [{ string, fret, name, interval, root }]. */
export function fretboardNotes(toneList, position) {
  const [lo, hi] = positionWindow(position);
  const byPc = new Map(toneList.map((t) => [t.pc, t]));
  const notes = [];
  TUNING.forEach((open, string) => {
    for (let fret = lo; fret <= hi; fret++) {
      const t = byPc.get((open + fret) % 12);
      if (t) notes.push({ string, fret, name: t.name, interval: t.interval, root: t.root });
    }
  });
  return { notes, window: [lo, hi] };
}

/** Fret of a pitch class on the low E string, 0-11. */
export function lowEFret(pc) {
  return (pc - TUNING[0] + 12) % 12;
}

// ------------------------------------------------------------------ chords

// frets low E -> high e (-1 = muted), fingers (0 = none), barre { fret, from, to } (string indexes).
const OPEN_CHORDS = {
  C: ['x32010', '032010'],
  A: ['x02220', '001230'],
  G: ['320003', '210003'],
  E: ['022100', '023100'],
  D: ['xx0232', '000132'],
  Am: ['x02210', '002310'],
  Em: ['022000', '023000'],
  Dm: ['xx0231', '000231'],
  A7: ['x02020', '002030'],
  B7: ['x21202', '021304'],
  C7: ['x32310', '032410'],
  D7: ['xx0212', '000213'],
  E7: ['020100', '020100'],
  G7: ['320001', '320001'],
  Am7: ['x02010', '002010'],
  Em7: ['020000', '020000'],
  Dm7: ['xx0211', '000211'],
  Cmaj7: ['x32000', '032000'],
  Fmaj7: ['xx3210', '003210'],
  Amaj7: ['x02120', '002130'],
  Dmaj7: ['xx0222', '000111'],
  Gmaj7: ['320002', '320001'],
  Asus2: ['x02200', '001200'],
  Asus4: ['x02230', '001230'],
  Dsus2: ['xx0230', '000130'],
  Dsus4: ['xx0233', '000134'],
  Esus4: ['022200', '023400'],
  Cadd9: ['x32033', '021034'],
  E5: ['022xxx', '011000'],
  A5: ['x022xx', '001100'],
};

// Movable barre shapes: frets relative to the root fret r (null = muted).
const SHAPES = {
  E: {
    '': { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: [0, 5] },
    m: { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: [0, 5] },
    '7': { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barre: [0, 5] },
    m7: { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: [0, 5] },
    maj7: { frets: [0, null, 1, 1, 0, null], fingers: [1, 0, 3, 4, 2, 0], barre: null },
    sus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: [0, 5] },
    '5': { frets: [0, 2, 2, null, null, null], fingers: [1, 3, 4, 0, 0, 0], barre: null },
  },
  A: {
    '': { frets: [null, 0, 2, 2, 2, 0], fingers: [0, 1, 3, 3, 3, 1], barre: [1, 5] },
    m: { frets: [null, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1], barre: [1, 5] },
    '7': { frets: [null, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1], barre: [1, 5] },
    m7: { frets: [null, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1], barre: [1, 5] },
    maj7: { frets: [null, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1], barre: [1, 5] },
    sus2: { frets: [null, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1], barre: [1, 5] },
    sus4: { frets: [null, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1], barre: [1, 5] },
    '5': { frets: [null, 0, 2, 2, null, null], fingers: [0, 1, 3, 4, 0, 0], barre: null },
  },
};

const QUALITY_ALIASES = {
  '': '', M: '', maj: '', major: '',
  m: 'm', min: 'm', minor: 'm', '-': 'm',
  '7': '7', dom7: '7',
  maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  add9: 'add9', '5': '5',
};

/** 'F#m7:A' -> { root: 'F#', quality: 'm7', shape: 'A', name: 'F#m7' } or null. */
export function parseChord(token) {
  const m = /^([A-G][#b♯♭]?)([A-Za-z0-9Δ+\-]*)(?::([EA]))?$/.exec(String(token || '').trim());
  if (!m) return null;
  const root = m[1].replace('♯', '#').replace('♭', 'b');
  if (!(m[2] in QUALITY_ALIASES)) return null;
  const quality = QUALITY_ALIASES[m[2]];
  return { root, quality, shape: m[3] || null, name: root + quality };
}

function fromStrings(frets, fingers) {
  return {
    frets: [...frets].map((c) => (c === 'x' ? -1 : Number(c))),
    fingers: [...fingers].map(Number),
  };
}

/**
 * A playable shape for a chord name: open shape when there is one (and no barre
 * shape was asked for), otherwise the lower of the E- and A-shape barres.
 * Returns { name, frets, fingers, barre: { fret, from, to } | null, label } or null.
 */
export function chordShape(token) {
  const custom = customVoicing(token);
  if (custom) return custom;
  const c = parseChord(token);
  if (!c) return null;
  const pc = parseNote(c.root).pc;
  if (!c.shape) {
    const open = Object.entries(OPEN_CHORDS).find(([name]) => {
      const p = parseChord(name);
      return p && p.quality === c.quality && parseNote(p.root).pc === pc;
    });
    if (open) {
      const s = fromStrings(open[1][0], open[1][1]);
      return { name: c.name, ...s, barre: null, label: c.name };
    }
  }
  const options = ['E', 'A']
    .filter((sh) => !c.shape || c.shape === sh)
    .filter((sh) => SHAPES[sh][c.quality])
    .map((sh) => {
      let r = (pc - (sh === 'E' ? 4 : 9) + 12) % 12;
      if (r === 0) r = 12; // the open version is a different shape; play it up the neck
      return { sh, r };
    })
    .sort((a, b) => a.r - b.r);
  if (!options.length) return null;
  const { sh, r } = options[0];
  const tpl = SHAPES[sh][c.quality];
  return {
    name: c.name,
    frets: tpl.frets.map((f) => (f == null ? -1 : r + f)),
    fingers: tpl.fingers,
    barre: tpl.barre ? { fret: r, from: tpl.barre[0], to: tpl.barre[1] } : null,
    label: c.shape ? `${c.name} · ${sh} shape` : c.name,
    shape: c.shape ? sh : null,
  };
}

// A written-out voicing: 'G=xxx433' (low E to high e), or 'G=x.x.x.12.12.10' once a
// fret reaches 10; '~xxx211' adds fingers. Used for triads and other small shapes.
const INVERSIONS = { 0: 'root position', 3: '1st inversion', 4: '1st inversion', 7: '2nd inversion', 10: '3rd inversion', 11: '3rd inversion' };

function customVoicing(token) {
  const m = /^([A-G][#b♯♭]?[A-Za-z0-9Δ+\-]*)=([x\d.]+)(?:~([\d.]+))?$/.exec(String(token || '').trim());
  if (!m) return null;
  const c = parseChord(m[1]);
  const split = (s) => (s.includes('.') ? s.split('.') : [...s]);
  const frets = split(m[2]).map((f) => (f === 'x' ? -1 : Number(f)));
  if (!c || c.shape || frets.length !== 6 || frets.some((f) => !Number.isInteger(f) || f > 17) || frets.every((f) => f < 0)) return null;
  const fingers = m[3] ? split(m[3]).map(Number) : [];
  const lowest = frets.findIndex((f) => f >= 0);
  const bass = (TUNING[lowest] + frets[lowest] - parseNote(c.root).pc + 24) % 12;
  return {
    name: c.name, frets,
    fingers: fingers.length === 6 && fingers.every((f) => Number.isInteger(f) && f >= 0 && f <= 4) ? fingers : [0, 0, 0, 0, 0, 0],
    barre: null, label: c.name, shape: null, note: INVERSIONS[bass] || null,
  };
}

// ------------------------------------------------------------------ progressions by number

// Keys offered for 'numbers' diagrams, spelled the way guitarists read them.
export const PROGRESSION_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 'bVII', 'ii', 'V7', 'IVmaj7' -> { acc, degree, minor, seventh } or null. Lower case is minor. */
export function parseNumeral(token) {
  const m = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(7|maj7)?$/.exec(String(token || '').trim());
  if (!m) return null;
  return {
    acc: m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0,
    degree: NUMERALS.indexOf(m[2].toUpperCase()),
    minor: m[2] === m[2].toLowerCase(),
    seventh: m[3] || '',
  };
}

/** The chord a numeral stands for in a major key: numeralChord('G', 'VI7') -> 'E7'. */
export function numeralChord(key, token) {
  const n = parseNumeral(token);
  if (!n || !parseNote(key)) return null;
  const spelled = spell(key, n.degree, (MAJOR_STEPS[n.degree] + n.acc + 12) % 12);
  // Cb, Fbb and friends read as B, Eb...: no guitarist names a chord that way.
  const note = /^(Cb|Fb|E#|B#)$|bb|##/.test(spelled.name) ? PROGRESSION_KEYS[spelled.pc] : spelled.name;
  return note + (n.minor ? 'm' : '') + n.seventh;
}

/** Numerals for display: 'bVII' -> '♭VII'. */
export function prettyNumeral(token) {
  return String(token).replace(/^b/, '♭').replace(/^#/, '♯');
}

/** 'I | IV V7 | I' -> [['I'], ['IV', 'V7'], ['I']]: bars, each a list of numerals. */
export function numeralBars(text) {
  return String(text || '').split('|')
    .map((bar) => bar.trim().split(/\s+/).filter((t) => parseNumeral(t)))
    .filter((bar) => bar.length);
}

/** Split "C, G to Am - F" into chord tokens. */
export function chordTokens(text) {
  return String(text || '')
    .split(/[\s,;/|]+|\bto\b|(?<=[A-Za-z0-9])-(?=[A-G])|→/)
    .map((s) => s.trim().replace(/:$/, ''))
    .filter((s) => /[A-Za-z0-9]/.test(s));
}

// ------------------------------------------------------------------ runs (walk-ups, bass runs)

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The notes of a run in order: [{ string, fret, name, order, last }]. */
export function runNotes(d) {
  return d.notes.map(([string, fret], i) => ({
    string, fret, name: SHARP_NAMES[(TUNING[string] + fret) % 12], order: i + 1, last: i === d.notes.length - 1,
  }));
}

/** Fret window that shows every note of a run (open position when it uses open strings). */
export function runWindow(d) {
  const frets = d.notes.map(([, f]) => f);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  return lo === 0 || lo <= 1 ? [0, Math.max(3, hi)] : [lo, Math.max(lo + 3, hi)];
}

// ------------------------------------------------------------------ validation & description

const POSITIONS = new Set(['open', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

/** Clean a stored diagram; null if it isn't one we can draw. */
export function normaliseDiagram(d) {
  if (!d || typeof d !== 'object') return null;
  const labels = d.labels === 'intervals' ? 'intervals' : 'notes';
  const position = POSITIONS.has(d.position) ? d.position : 'open';
  if (d.type === 'scale' && parseNote(d.root) && SCALES[d.scale]) {
    return { type: 'scale', root: noteName(parseNote(d.root).letter, parseNote(d.root).acc), scale: d.scale, position, labels };
  }
  if (d.type === 'arpeggio' && parseNote(d.root) && ARPEGGIOS[d.quality]) {
    return { type: 'arpeggio', root: noteName(parseNote(d.root).letter, parseNote(d.root).acc), quality: d.quality, position, labels };
  }
  if (d.type === 'chords' && Array.isArray(d.chords)) {
    const chords = d.chords.map(String).filter((t) => chordShape(t)).slice(0, 8);
    return chords.length ? { type: 'chords', chords } : null;
  }
  if (d.type === 'run' && Array.isArray(d.notes)) {
    const notes = d.notes
      .filter((n) => Array.isArray(n) && Number.isInteger(n[0]) && Number.isInteger(n[1]) && n[0] >= 0 && n[0] <= 5 && n[1] >= 0 && n[1] <= 15)
      .map(([string, fret]) => [string, fret])
      .slice(0, 12);
    return notes.length >= 2 ? { type: 'run', notes } : null;
  }
  if (d.type === 'tab' && typeof d.tab === 'string') {
    const events = parseTab(d.tab);
    return events.length ? { type: 'tab', tab: serialiseTab(events) } : null;
  }
  if (d.type === 'progression' && typeof d.text === 'string') {
    const text = cleanChart(d.text.slice(0, 20000));
    return readChart(text).chords.length ? { type: 'progression', text } : null;
  }
  if (d.type === 'numbers' && Array.isArray(d.progressions)) {
    const key = PROGRESSION_KEYS.find((k) => k === d.key) || 'G';
    const progressions = d.progressions
      .filter((p) => p && typeof p.bars === 'string' && numeralBars(p.bars).length)
      .map((p) => ({ name: String(p.name || '').slice(0, 80), bars: numeralBars(p.bars).map((bar) => bar.join(' ')).join(' | ') }))
      .slice(0, 8);
    return progressions.length ? { type: 'numbers', key, progressions } : null;
  }
  if (d.type === 'strum') {
    const pattern = normaliseStrum(d.pattern);
    if (!pattern) return null;
    const accents = [...new Set((Array.isArray(d.accents) ? d.accents : []).filter((i) => Number.isInteger(i) && i >= 0 && i < pattern.length && pattern[i] !== '-'))].sort((a, b) => a - b);
    return accents.length ? { type: 'strum', pattern, accents } : { type: 'strum', pattern };
  }
  return null;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function positionLabel(position) {
  return position === 'open' ? 'open position' : `${ordinal(position)} fret`;
}

export function describeDiagram(d) {
  if (d.type === 'scale') return `${pretty(d.root)} ${SCALES[d.scale].name.toLowerCase()} scale, ${positionLabel(d.position)}`;
  if (d.type === 'arpeggio') return `${pretty(d.root)} ${ARPEGGIOS[d.quality].name.toLowerCase()} arpeggio, ${positionLabel(d.position)}`;
  if (d.type === 'chords') return `Chords: ${d.chords.map((c) => { const s = chordShape(c); return pretty(s.label) + (s.note ? ` (${s.note})` : ''); }).join(', ')}`;
  if (d.type === 'run') return `Bass run: ${runNotes(d).map((n) => pretty(n.name)).join(' → ')}`;
  if (d.type === 'tab') return `Tab: ${parseTab(d.tab).length} notes`;
  if (d.type === 'progression') return `Chord chart: ${readChart(d.text).chords.map(pretty).join(', ')}`;
  if (d.type === 'numbers') return `Progressions: ${d.progressions.map((p) => p.name || numeralBars(p.bars).flat().map(prettyNumeral).join('-')).join(', ')}`;
  if (d.type === 'strum') return `Strumming: ${d.pattern.split('').map((c) => ({ D: '↓', U: '↑', X: '×', '-': '·' })[c]).join(' ')}`;
  return '';
}

// ------------------------------------------------------------------ suggestions from item text

const SCALE_WORDS = [
  [/natural minor/i, 'natural_minor'],
  [/harmonic minor/i, 'harmonic_minor'],
  [/melodic minor/i, 'melodic_minor'],
  [/minor pentatonic|min(?:or)? pent/i, 'minor_pentatonic'],
  [/major pentatonic|maj(?:or)? pent/i, 'major_pentatonic'],
  [/\bblues\b/i, 'blues'],
  [/\bdorian\b/i, 'dorian'],
  [/\bphrygian\b/i, 'phrygian'],
  [/\blydian\b/i, 'lydian'],
  [/\bmixolydian\b/i, 'mixolydian'],
  [/\blocrian\b/i, 'locrian'],
  [/\bmajor\b/i, 'major'],
  [/\bminor\b/i, 'natural_minor'],
];

function positionFrom(text, rootPc, pentatonic) {
  if (/\bopen\b/i.test(text)) return 'open';
  const pos = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:position|fret)\b|\bfret\s+(\d{1,2})\b/i.exec(text);
  if (pos) {
    const n = Number(pos[1] || pos[2]);
    if (n >= 1 && n <= 12) return n;
  }
  const f = lowEFret(rootPc);
  if (/\bbox\s*1\b/i.test(text) || pentatonic) return f === 0 ? 'open' : f;
  return 'open';
}

/** Best guess at a diagram from an item's text, or null. */
export function suggestDiagram(text) {
  const t = String(text || '');
  // Arpeggio: "C major arpeggio", "Am7 arpeggio"
  // (Note names must be capitals, so the word "a" is never read as the note A.)
  const arp = /\b([A-G][#b]?)(m7b5|maj7|m7|7|m|dim|aug)?\s*([Mm]ajor|[Mm]inor|[Dd]ominant 7|maj7|m7)?\s+[Aa]rpeggio/.exec(t);
  if (arp) {
    const root = arp[1];
    const word = (arp[3] || '').toLowerCase();
    const quality = arp[2] ? { m: 'minor', m7: 'm7', '7': '7', maj7: 'maj7', dim: 'dim', aug: 'aug', m7b5: 'm7b5' }[arp[2]]
      : word === 'minor' ? 'minor' : word === 'dominant 7' ? '7' : word === 'maj7' ? 'maj7' : word === 'm7' ? 'm7' : 'major';
    const n = parseNote(root);
    if (n) return { type: 'arpeggio', root, quality, position: positionFrom(t, n.pc, false), labels: 'notes' };
  }
  // Triads: "Build a major triad (1-3-5)"
  if (/\btriad\b/i.test(t)) {
    const minor = /\bminor\b/i.test(t);
    const r = /\b([A-G][#b]?)\s+(?:major|minor)?\s*triad/.exec(t);
    return { type: 'arpeggio', root: r ? r[1] : 'C', quality: minor ? 'minor' : 'major', position: 'open', labels: 'intervals' };
  }
  // Scale: a root note followed by a scale name.
  const capital = (m) => m && /^[A-G]/.test(m[1]);
  const scaleMatch = [...t.matchAll(/\b([A-G][#b]?)\s+(natural minor|harmonic minor|melodic minor|minor pentatonic|major pentatonic|min(?:or)? pent|maj(?:or)? pent|blues|dorian|phrygian|lydian|mixolydian|locrian|major|minor)\b/gi)].find(capital)
    || [...t.matchAll(/\b(?:blues|jam|solo)\s+in\s+([A-G][#b]?)\b/gi)].find(capital);
  if (scaleMatch && /scale|pentatonic|pent|blues|mode|dorian|phrygian|lydian|mixolydian|locrian|box|position/i.test(t)) {
    const root = scaleMatch[1];
    const n = parseNote(root);
    const kind = (SCALE_WORDS.find(([re]) => re.test(scaleMatch[2] || t)) || [null, 'major'])[1];
    if (n) {
      const pent = kind === 'minor_pentatonic' || kind === 'major_pentatonic' || kind === 'blues';
      return { type: 'scale', root, scale: kind, position: positionFrom(t, n.pc, pent), labels: 'notes' };
    }
  }
  // Strumming: a written pattern ("D DU UDU", "down-down-up").
  if (/strum|\bD[\s-]?D?U|\bdown\b/i.test(t)) {
    const pattern = readStrum(t);
    if (pattern) return { type: 'strum', pattern };
  }
  // Chords: only when the text is clearly about chords or chord changes.
  if (/chord|change|progression|picking|crosspick|strum/i.test(t)) {
    const find = (s) => chordTokens(s.replace(/\(.*?\)/g, ' ')).filter((tok) => /^[A-G]/.test(tok) && chordShape(tok));
    let chords = t.includes(':') ? find(t.slice(t.indexOf(':') + 1)) : [];
    if (!chords.length) chords = find(t);
    const unique = [...new Set(chords)];
    if (unique.length) return { type: 'chords', chords: unique.slice(0, 8) };
  }
  return null;
}
