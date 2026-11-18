// Eric Haugen's "How to Create Tasteful Acoustic Fills" (open position), transcribed
// note for note from the lesson's tab sheet, for the Licks cards licks-14 to licks-22.
//
// Each passage is a list of bars; each bar is "rhythm:notes" tokens. Rhythm is w h q e s
// (whole to sixteenth). Notes are a string letter (E A D G B e, low to high) and a fret,
// or x for a muted string, joined with + when played together. Before a note, h p / \ is a
// hammer-on, pull-off, slide up or slide down into it (the note is not picked again);
// after it, bN is a bend to fret N (to the same fret: a quarter-step curl).
// Rests in the sheet aren't drawn: the notes keep their own lengths.

import { serialiseTab } from './notation.js';

const STRINGS = { E: 0, A: 1, D: 2, G: 3, B: 4, e: 5 };

/** A tab diagram from bars of tokens, with its rhythm and an optional title. */
export function fillTab(title, ...bars) {
  const events = [];
  const rhythm = [];
  bars.forEach((bar, b) => bar.trim().split(/\s+/).forEach((token, i) => {
    const [value, chord] = token.split(':');
    const notes = chord.split('+').map((n) => {
      const m = /^([hp/\\]?)([EADGBe])(\d+|x)(?:b(\d+))?$/.exec(n);
      if (!m) throw new Error(`Bad fill note: ${n}`);
      return {
        string: STRINGS[m[2]], fret: m[3] === 'x' ? 'x' : Number(m[3]),
        ...(m[1] ? { tech: m[1] } : {}), ...(m[4] ? { bend: Number(m[4]) } : {}),
      };
    }).sort((x, y) => y.string - x.string);
    events.push(b && !i ? { notes, bar: true } : { notes });
    rhythm.push(value);
  }));
  return { type: 'tab', tab: serialiseTab(events), rhythm: rhythm.join(' '), ...(title ? { title } : {}) };
}

// The chord bars the lesson comes back to: bass, two eighth-note strums, the other bass, a strum.
const bar = (bass, alt, top) => `q:${bass} e:${top} e:${top} q:${alt} q:${top}`;
const C = 'D2+G0+B1';
const G = 'G0+B0+e3';
const D = 'G2+B3+e2';
const A = 'D2+G2+B2';
const E = 'D2+G1+B0+e0';
const AM = 'D2+G2+B1';
const DM = 'G2+B3+e1';
const EM = 'D2+G0+B0+e0';

// Sweet Virginia (Rolling Stones), capo 2, as the sheet has it: 20 bars, four to a tab.
const SV = [
  `q:E3+D0+G0+B0 e:${G} e:${G} q:D0 q:${G}`,
  'q:D0 e:G2+B1+e2 e:G2+B1+e2 q:A0 q:D0+G2+B1',
  `q:E3 e:${G} e:${G} q:A3 e:${C} e:${C}`,
  `q:E3 e:${G} e:${G} e:A0 e:G0 e:A2 e:G0`,
  `q:A3 e:${C} e:${C} e:E3 e:G0 q:A2`,
  `q:A0 e:${A} e:${A} e:E0 e:D0 q:E2`,
  `q:E3 q:${G} e:A1 e:hA2 e:D0 e:G0`,
  `q:E3 e:${G} e:${G} e:A0 e:G0 e:A2 e:G0`,
  `q:A3 e:${C} e:${C} q:A3 q:A2`,
  `q:A0 e:${A} e:${A} e:E0 e:D2 q:E2`,
  `q:E3 q:${G} e:B3 e:G3 e:B0 e:G3`,
  'e:\\G2 e:G0 e:D2 e:D0 e:G0 e:D0 e:A2 e:G0',
  `q:A3 e:${C} e:${C} e:E3 e:G0 q:A2`,
  `q:A0 e:${A} e:${A} e:E0 e:D2 q:E2`,
  `q:E3 e:${G} e:${G} e:D3+G0+B0 e:D3+G0+B0 q:D3+G0+B0`,
  `q:A3 e:${C} e:${C} e:G3+B1 q:G2+B1`,
  `q:E3 q:${G} e:e1 q:e0`,
  'e:D0 e:B3 e:G2 e:D0 e:B1 e:G3 e:\\G2 e:G0',
  `q:E3 e:${G} e:${G} q:A3 e:${C} e:${C}`,
  `q:E3 e:${G} e:${G} e:A0 e:G0 e:A2 e:G0`,
];

export const SWEET_VIRGINIA = [0, 4, 8, 12, 16].map((k) => fillTab(`Bars ${k + 1}–${k + 4}`, ...SV.slice(k, k + 4)));

/** Per chord: the scale run, the pentatonic fills, the chromatic run and chromatic fills. */
export const FILLS = {
  C: [
    fillTab('C major pentatonic', 'e:A3 e:D0 e:D2 e:G0 e:G2 e:B1'),
    fillTab('Fill, then with crosspicking', `q:A3 q:${C} q:E3 q:${C}`, 'q:A3 q:D0 q:D2 q:G0',
      bar('A3', 'E3', C), 'e:A3 e:B1 e:D0 e:B1 e:D2 e:B1 q:G0'),
    fillTab('Chromatic run', 'e:A3 e:D0 e:D1 e:D2 e:G0 e:G2 e:B1 e:B3', 'e:/B4 e:e0 e:e3 e:B4 e:e0 e:B4 e:\\B3 e:B1',
      `e:G2 e:G0 e:D2 e:D1 e:pD0 e:A3 q:${C}`),
    fillTab('Chromatic fills', `q:A3 q:${C} q:E3 q:${C}`, `q:A3 e:${C} e:D1 e:/D2 e:G0 e:G2 e:B1`,
      `q:A3 q:${C} q:E3 q:${C}`, `q:A3 q:${C} e:G0 e:D1 e:pD0 e:A3`),
  ],
  G: [
    fillTab('G major pentatonic', 'e:E3 e:A0 e:A2 e:D0 e:D2 e:G0 e:G2 e:B0', 'e:B3 e:e0 e:e3 e:e0 e:B3 e:B0 e:G2 e:G0',
      'e:D2 e:D0 e:A2 e:A0 q:E3 q:D0+G0+B0+e3'),
    fillTab('With crosspicking', bar('E3', 'D0', G), 'e:E3 e:G0 e:A0 e:G0 e:A2 e:G0 e:D0 e:G0'),
    fillTab('Chromatic run', 'e:E3 e:A0 e:A1 e:A2 e:D0 e:D2 e:G0 e:G2', 'e:G3 e:B0 e:B3 e:e0 q:e3'),
    fillTab('Chromatic fills', bar('E3', 'D0', G), `q:E3 e:${G} e:A1 e:hA2 e:D0 e:D2 e:G0`,
      bar('E3', 'D0', G), `q:E3 q:${G} e:B3 e:G3 e:\\G2 e:G0`),
  ],
  D: [
    fillTab('D major pentatonic', 'q:D0 q:D2 q:D4 q:G2', 'q:B0 q:B3 q:e0', 'e:e2 e:e0 e:B3 e:B0 e:G2 e:D4 e:D2 e:D0',
      'e:A2 e:A0 e:E2 e:E0 h:D0+G2+B3'),
    fillTab('With crosspicking', bar('D0', 'A0', D), 'e:D0 e:B3 e:D2 e:B3 e:D4 e:B3 q:G2'),
    fillTab('D run', `q:A0 q:${D} s:e1 s:e2 s:e3 s:e1 s:he2 s:B3 s:pB1 s:D2`,
      's:B3 s:B1 s:G2 s:G1 s:pG0 s:D3 s:/D4 s:D0 s:A2 s:A0 s:D0 s:A0 s:E1 s:hE2 s:A0 s:D0'),
    fillTab('Chromatic D run', 'e:D0 e:D2 e:D3 e:D4 e:G2 e:B0 e:B3 e:e0', 'e:e1 q:e2 e:e1 e:he2 e:e1 e:e0 e:B3',
      'q:G2 e:G1 e:G0 e:D3 e:/D4 e:D0 e:A2', 'e:D0 e:A2 e:pA0 e:E3 q:D0 e:E1 e:hE2', 'e:A0 e:D0 q:G2'),
    fillTab('Chromatic fills', bar('D0', 'A0', D), `q:D0 e:${D} e:D3 e:/D4 e:G2 e:B0 e:B3`,
      bar('D0', 'A0', D), `q:D0 q:${D} e:G2 e:D3 e:\\D2 e:D0`),
  ],
  E: [
    fillTab('E major pentatonic', 'q:E0 q:E2 q:E4 q:A2', 'q:A4 q:D2', 'q:D2 q:D4 q:G1 q:B0', 'q:B2 q:e0',
      'q:D2 q:D4 q:G1 q:B0', 'q:B2 q:e0'),
    fillTab('E blues lick', 'e:e3b3 e:e0 e:B3 e:B0 e:G3 e:G2 e:pG0 e:D2', 'e:D0 e:A2 e:A1 e:pA0 q:E3b3 q:E0'),
    fillTab('With crosspicking', bar('E0', 'A2', E), 'e:D2 e:e0 e:D4 e:e0 e:G1 e:e0 q:B0'),
    fillTab('Chromatic run', 'e:E0 e:E2 e:E3 e:E4 e:A2 e:A4 e:D2 e:D4', 'e:G0 e:G1 e:B0 e:B2 e:e0 e:e2 e:e3 e:e4'),
    fillTab('Chromatic fills', bar('E0', 'A2', E), `q:E0 e:${E} e:G0 e:hG1 e:B0 e:B2 e:e0`,
      bar('E0', 'A2', E), `q:E0 q:${E} e:A2 e:E3 e:\\E2 e:E0`),
  ],
  A: [
    fillTab('A major pentatonic', 'e:A0 e:A2 e:A4 e:D2 e:D4 q:G2 e:B0', 'e:B2 e:e0 e:e2 e:e5 e:e2 e:e0 e:B2 e:B0',
      'e:G2 e:D4 e:D2 e:A4 e:A2 e:A0 e:E2 e:E0', `q:A0 q:${A}`),
    fillTab('With crosspicking', bar('A0', 'E0', A), 'e:A0 e:G2 e:A2 e:G2 e:A4 e:G2 q:D2'),
    fillTab('Chromatic run', 'e:A0 e:A2 e:A3 e:A4 e:D2 e:D4 e:G2 e:B0', 'e:B1 e:B2 e:e0 e:e2 q:e5'),
    fillTab('Chromatic fills', 'e:A3 e:hA4 e:D2 e:D4 e:G2', bar('A0', 'E0', A), 'q:A0 q:Dx+Gx e:e0 e:B1 e:pB0 e:G2'),
  ],
  Am: [
    fillTab('A minor pentatonic', 'e:A0 e:A3 e:D0 e:D2 e:G0 e:G2 e:B1 e:B3', 'e:e0 e:e3 e:e0 e:B3 e:B1 e:G2 e:G0 e:D2',
      `e:D0 e:A3 e:A0 e:E3 q:A0 q:${AM}`),
    fillTab('With crosspicking', bar('A0', 'E0', AM), 'e:A0 e:G2 e:A3 e:G2 e:D0 e:G2 q:A3'),
    fillTab('Chromatic run', 'e:A0 e:A3 e:D0 e:D1 e:D2 e:G0 e:G2 e:B1', 'e:B3 e:B4 e:e0 e:e3 e:B4 e:\\B3 e:B1 e:G2',
      'e:G0 e:D2 e:D1 e:pD0 e:A3 e:A0 e:E3 e:A0', `e:A3 e:A0 q:${AM}`),
    fillTab('Chromatic fill', bar('A0', 'E0', AM), 'q:A0 e:G0 e:D2 e:D1 e:pD0 q:A3'),
  ],
  Dm: [
    fillTab('D minor pentatonic', 'e:D0 e:D3 e:G0 e:G2 e:B1 e:B3 e:e1 e:B3', 'e:B1 e:G2 e:G0 e:D3 e:D0 e:A3 e:A0 e:E3',
      `q:E1 q:D0+${DM}`),
    fillTab('With crosspicking', bar('D0', 'A0', DM), 'e:D0 e:B3 e:D3 e:B3 e:G0 e:B3 q:D3'),
    fillTab('Chromatic run', 'e:D0 e:D3 e:G0 e:G1 e:G2 e:B1 e:B3 e:e1', 'e:e3 e:e4 e:\\e3 e:e1 e:B3 e:B1 e:G2 e:G1',
      `e:D3 e:D0 q:${DM}`),
    fillTab('Chromatic fill', bar('D0', 'A0', DM), 'q:D0 e:B1 e:G2 e:G1 e:pG0 q:D3'),
  ],
  Em: [
    fillTab('E minor pentatonic', 'e:E0 e:E3 e:A0 e:A2 e:D0 e:D2 e:G0 e:G2', 'e:B0 e:B3 e:e0 e:e3 e:e0 e:B3 e:B0 e:G2',
      `e:G0 e:D2 e:D0 e:A2 e:A0 e:E3 e:E0 e:${EM}`),
    fillTab('With crosspicking', bar('E0', 'A2', EM), 'e:D2 e:e0 e:G0 e:e0 e:G2 e:e0 q:G0'),
    fillTab('Chromatic run', 'e:E0 e:E3 e:A0 e:A1 e:A2 e:D0 e:D2 e:G0', 'e:G2 e:G3 e:B0 e:B3 e:B0 e:G3 e:G2 e:G0',
      'e:D2 e:D0 e:A2 e:A1 e:A0 e:E3b3 e:E0 e:A2+D2+G1+B0+e0'),
    fillTab('Chromatic fill', bar('E0', 'A2', EM), 'q:E0 e:B3 e:B0 e:G3 e:G2 q:G0'),
  ],
};
