// Default areas, subtypes, starter library and slot template.
// Ids are stable so "Reset to defaults" and import/merge behave predictably.

export const SCHEMA_VERSION = 1;
export const SLOT_COUNT = 12;

const AREAS = [
  ['technique', 'Technique'],
  ['knowledge', 'Knowledge'],
  ['repertoire', 'Repertoire'],
  ['time', 'Time'],
  ['improvisation', 'Improvisation'],
];

const SUBTYPES = [
  ['warmup', 'Warm-up', 'technique'],
  ['picking', 'Picking', 'technique'],
  ['scales', 'Scales', 'knowledge'],
  ['chords', 'Chords and arpeggios', 'knowledge'],
  ['songs', 'Songs', 'repertoire'],
  ['strumming', 'Strumming', 'time'],
  ['riffs', 'Riffs and licks', 'time'],
  ['backing', 'Backing track', 'improvisation'],
];

const LIBRARY = {
  warmup: [
    'Spider walk, frets 1-4, all strings',
    'Chromatic 1-2-3-4 on each string',
    'Fretting-hand stretches, slow',
    'Finger independence, pairs 1-3 and 2-4',
    'Hammer-ons and pull-offs, 1-2-3-4',
    'Slow chromatic run up and down the neck',
  ],
  picking: [
    'Travis picking G-C-D, fingerstyle',
    'Travis picking G-C-D, flatpick',
    'Crosspick C: 654, 543, 432, 321 and back',
    'Crosspick D: 654, 543, 432, 321 and back',
    'Crosspick G: 654, 543, 432, 321 and back',
  ],
  scales: [
    'C major scale, open position',
    'D major scale, open position',
    'G major scale, open position',
    'E minor pentatonic, open position',
    'A minor pentatonic',
  ],
  chords: [
    'Open chords: C, G, D, Em, Am',
    'F barre chord, 1st fret',
    'Chord changes: C to G to Am to F',
    'C major arpeggio, open position',
    'Build a major triad (1-3-5)',
    'Seventh chords: A7, D7, E7',
    'Barre shapes: E shape and A shape',
  ],
  songs: [
    'Lefty - Long Black Veil',
    'Elliott Smith - Condor Avenue',
    'Elvis Costello - Alison',
    'Nico - These Days',
    "Sturgill Simpson - I Don't Mind",
    'Tyler Childers - Lady May',
    'Tyler Childers - Feathered Indians',
    'Blaze Foley - Cold Cold World',
    'Tom Dooley',
    "St. Anne's Reel",
  ],
  strumming: [
    'Down strums on every beat, 70 bpm',
    'Down-down-up-up-down-up, 70 bpm',
    'Muted-string strumming, 80 bpm',
    'Strumming with chord changes, 60 bpm',
    'Accent beats 2 and 4, 70 bpm',
    'Count aloud while strumming',
  ],
  riffs: [
    'Pentatonic lick in 8th notes, 60 bpm',
    'A known riff on the metronome',
    'Clap the rhythm, then play it',
    'Speed a lick up by 5 bpm',
    'Play a riff on the off-beat',
  ],
  backing: [
    'A minor pentatonic over an Am track',
    'Solo using only 3 notes',
    'Call and response with yourself',
    'Blues in A, box 1 over a shuffle',
    'One-note solo, vary the rhythm',
    'Start and end phrases on the root',
  ],
};

const SLOTS = [
  'warmup', 'picking', 'scales', 'chords',
  'songs', 'songs', 'songs', 'songs',
  'strumming', 'riffs', 'backing', 'backing',
];

export function defaultLibrary() {
  return {
    areas: AREAS.map(([id, name], i) => ({ id, name, color: i, order: i })),
    subtypes: SUBTYPES.map(([id, name, area_id], i) => ({ id, name, area_id, order: i, archived: false })),
    items: Object.entries(LIBRARY).flatMap(([subtype_id, texts]) =>
      texts.map((text, i) => ({
        id: `${subtype_id}-${i + 1}`,
        subtype_id,
        text,
        url: '',
        order: i,
        archived: false,
        last_completed_at: null,
      })),
    ),
    slots: SLOTS.map((subtype_id, i) => ({ slot_id: `slot-${i + 1}`, subtype_id })),
  };
}

export function defaultSettings() {
  return {
    theme: 'auto', // 'auto' | 'dark' | 'light'
    metronome: { bpm: 70, beats: 4, accent: true },
  };
}

export const ITEM_SOFT_LIMIT = 45;
export const AREA_COLOR_COUNT = 8;
