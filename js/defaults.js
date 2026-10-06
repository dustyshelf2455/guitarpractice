// Default areas, subtypes, starter library and slot template.
// Ids are stable so "Reset to defaults" and import/merge behave predictably.

import { parseTab, serialiseTab, normaliseRhythm } from './notation.js';

export const SCHEMA_VERSION = 7;
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
  ['riffs', 'Riffs', 'time'],
  ['backing', 'Backing track', 'improvisation'],
  ['licks', 'Licks', 'improvisation'],
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
    // Walk-ups and walk-downs linking G, C and D (bluegrass and Americana rhythm).
    'Walk-up G to C: G-A-B-C',
    'Walk-down C to G: C-B-A-G',
    'Walk-up G to D: G-A-B-C-D',
    'Walk-down D to G: D-C-B-A-G',
    'Walk-up D to G: D-E-F#-G',
    'Walk-ups in G-C-G-D-G, 70 bpm',
    // Triads and seventh chords for country and bluegrass rhythm, all at 80 bpm.
    'G triads up the neck, top 3 strings, 80 bpm',
    'C triads up the neck, top 3 strings, 80 bpm',
    'D triads up the neck, top 3 strings, 80 bpm',
    'G-C-D triads, frets 2-5, 80 bpm',
    'G-C-D triads, frets 5-9, 80 bpm',
    'A-D-E triads, top 3 strings, 80 bpm',
    'G-C-D triads, strings D-G-B, 80 bpm',
    'G, C and D triad arpeggios, 80 bpm',
    'Open sevenths in G: G7, C7, D7, 80 bpm',
    'Key of E: E, A, B7, 80 bpm',
    'Seven to one: D7-G, A7-D, E7-A, B7-E, 80 bpm',
    'Salty Dog changes: G-E7-A7-D7, 80 bpm',
    'Barre sevenths: G7, C7, D7, 80 bpm',
    'G7, C7, D7 on the top 4 strings, 80 bpm',
    'G7, C7 and D7 arpeggios, 80 bpm',
    // Progressions by number, in whatever key is picked on the block.
    'Five progressions to know, set 1, 80 bpm',
    'Five progressions to know, set 2, 80 bpm',
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
    'Make up a strum pattern, play a song with it',
  ],
  riffs: [
    'Pentatonic lick in 8th notes, 60 bpm',
    'A known riff on the metronome',
    'Clap the rhythm, then play it',
    'Speed a lick up by 5 bpm',
    'Play a riff on the off-beat',
  ],
  // Stock licks, mostly around G, C and D. Tabs and notes are in STARTER_DIAGRAMS / STARTER_NOTES.
  licks: [
    'Bluegrass G run (Lester Flatt)',
    'Folk hammer-ons on an open C chord',
    'Blues: C minor pentatonic run, 8th fret',
    'Country pull-off cascade in C',
    'Bluegrass C run',
    'Find a new lick on YouTube and learn it',
    'Blues turnaround in G, into D7',
    'Bluegrass D run, back to G',
    'Hammer-on, pull-off fill over G',
    'Double-stop lick in G, Chuck Berry style',
    'Blues bend-and-release lick in G',
    'Fiddle-tune line in G, eighth notes',
    'Life of Sin intro (Sturgill Simpson), 100 bpm',
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

const LICK_IDS = LIBRARY.licks.map((_, i) => `licks-${i + 1}`);

// Diagrams for starter items (shown on the full-screen card). See js/music.js.
const chords = (...list) => [{ type: 'chords', chords: list }];
const scale = (root, kind, position) => [{ type: 'scale', root, scale: kind, position, labels: 'notes' }];
const arpeggio = (root, quality, position, labels = 'notes') => [{ type: 'arpeggio', root, quality, position, labels }];
// A run: [string, fret] in playing order (strings 0 = low E ... 5 = high e), then the two chords it links.
const run = (notes, from, to) => [{ type: 'run', notes }, { type: 'chords', chords: [from, to] }];
// A strumming pattern: one character per slot (D down, U up, X muted chuck, - miss).
const strum = (pattern, accents) => ({ type: 'strum', pattern, ...(accents ? { accents } : {}) });
const chart = (text) => [{ type: 'progression', text }];
// Progressions by number: [name, bars], bars split by '|'; the block has a menu to pick the key.
const numbers = (...list) => [{ type: 'numbers', key: 'G', progressions: list.map(([name, bars]) => ({ name, bars })) }];
// A lick: tab plus the chord(s) it sits over.
const lick = (tab, ...chordList) => [
  { type: 'tab', tab: serialiseTab(parseTab(tab)) },
  ...(chordList.length ? [{ type: 'chords', chords: chordList }] : []),
];
// A lick with its rhythm drawn under the tab (one value per note, see parseRhythm).
const timedLick = (tab, rhythm, ...chordList) => {
  const [first, ...rest] = lick(tab, ...chordList);
  return [{ ...first, rhythm: normaliseRhythm(rhythm, parseTab(tab).length) }, ...rest];
};

export const STARTER_DIAGRAMS = {
  'picking-1': chords('G', 'C', 'D'),
  'picking-2': chords('G', 'C', 'D'),
  'picking-3': chords('C'),
  'picking-4': chords('D'),
  'picking-5': chords('G'),
  'scales-1': scale('C', 'major', 'open'),
  'scales-2': scale('D', 'major', 'open'),
  'scales-3': scale('G', 'major', 'open'),
  'scales-4': scale('E', 'minor_pentatonic', 'open'),
  'scales-5': scale('A', 'minor_pentatonic', 5),
  'chords-1': chords('C', 'G', 'D', 'Em', 'Am'),
  'chords-2': chords('F'),
  'chords-3': chords('C', 'G', 'Am', 'F'),
  'chords-4': arpeggio('C', 'major', 'open'),
  'chords-5': arpeggio('C', 'major', 'open', 'intervals'),
  'chords-6': chords('A7', 'D7', 'E7'),
  'chords-7': chords('G:E', 'C:A'),
  'chords-8': run([[0, 3], [1, 0], [1, 2], [1, 3]], 'G', 'C'), // G A B -> C
  'chords-9': run([[1, 3], [1, 2], [1, 0], [0, 3]], 'C', 'G'), // C B A -> G
  'chords-10': run([[0, 3], [1, 0], [1, 2], [1, 3], [2, 0]], 'G', 'D'), // G A B C -> D
  'chords-11': run([[2, 0], [1, 3], [1, 2], [1, 0], [0, 3]], 'D', 'G'), // D C B A -> G
  'chords-12': run([[2, 0], [2, 2], [2, 4], [3, 0]], 'D', 'G'), // D E F# -> G
  'chords-13': chords('G', 'C', 'D'),
  // Written-out voicings, low E to high e (see customVoicing in js/music.js).
  'chords-14': chords('G=xxx433~000211', 'G=xxx787~000132', 'G=x.x.x.12.12.10~000231'),
  'chords-15': chords('C=xxx010~000010', 'C=xxx553~000231', 'C=xxx988~000211'),
  'chords-16': chords('D=xxx232~000132', 'D=xxx775~000231', 'D=x.x.x.11.10.10~000211'),
  'chords-17': chords('G=xxx433~000211', 'C=xxx553~000231', 'D=xxx232~000132'),
  'chords-18': chords('G=xxx787~000132', 'C=xxx988~000211', 'D=xxx775~000231'),
  'chords-19': chords('A=xxx655~000211', 'D=xxx775~000231', 'E=xxx454~000132'),
  'chords-20': chords('G=xx543x~003210', 'C=xx555x~001110', 'D=xx423x~003120'),
  'chords-21': [...arpeggio('G', 'major', 'open', 'intervals'), ...arpeggio('C', 'major', 'open', 'intervals'), ...arpeggio('D', 'major', 'open', 'intervals')],
  'chords-22': chords('G7', 'C7', 'D7'),
  'chords-23': chords('E', 'A', 'B7'),
  'chords-24': chords('D7', 'G', 'A7', 'D', 'E7', 'A', 'B7', 'E'),
  'chords-25': chords('G', 'E7', 'A7', 'D7'),
  'chords-26': chords('G7:E', 'C7:A', 'D7:A'),
  'chords-27': chords('G7=xx5767~001324', 'C7=xx5556~001112', 'D7=xx4535~002314'),
  'chords-28': [...arpeggio('G', '7', 'open', 'intervals'), ...arpeggio('C', '7', 'open', 'intervals'), ...arpeggio('D', '7', 'open', 'intervals')],
  'chords-29': numbers(
    ['12-bar blues, quick change', 'I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7'],
    ['I-vi-IV-V, the fifties ballad', 'I | vi | IV | V'],
    ['I-V-vi-IV', 'I | V | vi | IV'],
    ['Freight Train: the III7 detour', 'I | I | V7 | V7 | V7 | V7 | I | I | III7 | III7 | IV | IV | I | V7 | I | I'],
    ['Mixolydian ♭VII', 'I | bVII | IV | I'],
  ),
  'chords-30': numbers(
    ['8-bar blues', 'I7 | V7 | IV7 | IV7 | I7 | V7 | I7 IV7 | I7 V7'],
    ['I-vi-ii-V turnaround', 'I | vi | ii | V7'],
    ['II7 to V7', 'I | I | II7 | II7 | V7 | V7 | I | I'],
    ['Minor iv, gospel and country ballads', 'I | I7 | IV | iv | I | V7 | I | I'],
    ['Minor key walk-down', 'i | bVII | bVI | V7'],
  ),
  'strumming-1': [strum('DDDD')],
  'strumming-2': [strum('D-DU-UDU')],
  'strumming-3': [strum('DUDUDUDU')],
  'strumming-4': [strum('D-DU-UDU'), { type: 'chords', chords: ['G', 'C', 'D'] }],
  'strumming-5': [strum('DUDUDUDU', [2, 6])],
  'strumming-6': [strum('D-DU-UDU')],
  // Tom Dooley: the usual two-chord version (traditional).
  'songs-9': chart('Key: G\nVerse and chorus: G | G | G | D7 | D7 | D7 | D7 | G'),
  'licks-1': lick(`
e|---------------|
B|---------------|
G|-------------0-|
D|---------0-2---|
A|---0h1/2-------|
E|-3-------------|`, 'G'),
  'licks-2': lick(`
e|-------------0-|
B|---------0h1---|
G|-------0-------|
D|---0h2---------|
A|-3-------------|
E|---------------|`, 'C'),
  'licks-3': lick(`
e|-8--------------|
B|---11-8---------|
G|--------10-8----|
D|-------------10-|
A|----------------|
E|----------------|`, 'C7'),
  'licks-4': lick(`
e|-3p0---------------|
B|-----3p1-----------|
G|---------2p0-------|
D|-------------2p0---|
A|-----------------3-|
E|-------------------|`, 'C'),
  'licks-5': lick(`
e|---------------|
B|-------------1-|
G|---------0-2---|
D|---0h1/2-------|
A|-3-------------|
E|---------------|`, 'C'),
  'licks-7': lick(`
e|-3-3-3-3-2-|
B|-6-5-4-3-1-|
G|---------2-|
D|---------0-|
A|-----------|
E|-----------|`, 'G7', 'D7'),
  'licks-8': lick(`
e|-------------|
B|-------------|
G|-------------|
D|-----------0-|
A|-----0h2p0---|
E|-0h2---------|`, 'D', 'G'),
  'licks-9': lick(`
e|-----------------|
B|-----------------|
G|-------0---------|
D|---0h2---2p0-----|
A|-------------2---|
E|-3-------------3-|`, 'G'),
  'licks-10': lick(`
e|-------------|
B|-3---3-1-0---|
G|-3h4-4-2-0---|
D|-------------|
A|-------------|
E|-----------3-|`, 'G'),
  'licks-11': lick(`
e|-------------------|
B|-6b8r6-3-----------|
G|---------5b7r5-3---|
D|-----------------5-|
A|-------------------|
E|-------------------|`, 'G7'),
  'licks-12': lick(`
e|-----------------------------------|
B|-----------------3-1-0-------------|
G|---------------0-------2-0---------|
D|---------0-2-4-------------2-0-----|
A|---0-2-3-----------------------2---|
E|-3-------------------------------3-|`, 'G'),
  // Sturgill Simpson, Life of Sin: the intro lick, bars 2-3, landing on the verse's open E.
  'licks-13': timedLick(`
e|-0---0-------0---0---0---|-------------------------------|---|
B|/5---5---p0--3---3---0---|-------------------------------|---|
G|-------------------------|-2b3-2---2b3-2---2b3-2---------|---|
D|-------------------------|-------------------------------|---|
A|-------------------------|-------------------------------|---|
E|-------------------------|---------------------------3b4-|-0-|`,
  'q e e q e e | e e e e e e q | q', 'E'),
  'riffs-1': scale('A', 'minor_pentatonic', 5),
  'backing-1': scale('A', 'minor_pentatonic', 5),
  'backing-4': scale('A', 'blues', 5),
};

/** Notes that come with starter items (instructions, practice tips). */
export const STARTER_NOTES = {
  'strumming-3': 'Rest your fretting hand lightly across all the strings so every strum is a muted chuck. Keep the hand moving down and up; it\'s all about the groove.',
  'licks-1': 'Bluegrass, beginner. The classic way to end a phrase in G. Strum G, then play the run in one bar at about 70 bpm: pick the low G and the open A, and let the hammer-on and slide sound A♯ and B. Let the open G ring at the end.',
  'licks-2': 'Folk, beginner. Hold a full C chord. Lift your middle and index fingers and hammer them back on, letting everything ring. The same trick works on G: A string, open, hammer onto fret 2.',
  'licks-3': 'Blues, beginner. All in the C minor pentatonic box at the 8th fret: index finger on 8, ring or pinky on 10 and 11. Over a slow C7 or a 12-bar in C at 60–70 bpm; let the last C ring with a little vibrato.',
  'licks-4': 'Country, beginner. Pure C major pentatonic, down through the C chord. Pick only the first note on each string and pull off with a small downward flick so the open string rings. Start slowly, then aim for an even four notes per beat.',
  'licks-5': 'Bluegrass, beginner. The G run moved up a string to end on C: same shape, same feel. Keep the ring finger on the A string, 3rd fret. Use it at the end of a C bar, about 70 bpm.',
  'licks-6': 'Search YouTube for a lick lesson ("bluegrass G lick", "blues lick in C", "country lick in G") and learn one new lick in five minutes, slowly. Like it? Add it to Licks in Settings, with the video link and the tab.',
  'licks-7': 'Blues, beginner (a three-fret stretch). For the last two bars of a 12-bar in G: hold the high G and walk the B string down F, E, E♭, D, picking both strings each time, then strum D7. Start at 60 bpm.',
  'licks-8': 'Bluegrass, beginner. Ends a phrase on the D chord before going back to G. Pick only three times (low E, A, D) and let the hammer-ons and pull-off do the rest. 60–80 bpm.',
  'licks-9': 'Bluegrass, beginner. Up with a hammer-on, back down with a pull-off, all G major pentatonic. Play it between strums of G at 60–80 bpm; the hammered and pulled notes should be as loud as the picked ones.',
  'licks-10': 'Country or rock, intermediate. Lay your index finger across fret 3 of the G and B strings and hammer the middle finger onto the G string, 4th fret: the bluesy minor third snaps into the major third. Pick both strings together, about 70 bpm over G.',
  'licks-11': 'Blues, intermediate. Check each bend\'s target first by fretting it (B string 8 = G, G string 7 = D), then bend to that pitch and release in time. Over a G7 vamp at 60–70 bpm. On an acoustic, half-step bends are fine.',
  'licks-13': 'Country, intermediate. The intro to Sturgill Simpson\'s Life of Sin (High Top Mountain), key of E, no capo. Bar 1: let the open high e ring over everything. Slide into the B string, 5th fret, pick it again and pull off to the open B, then 3rd fret twice and open. Bar 2: on the G string, 2nd fret, bend a half step (A up to A♯) on every other eighth note, then bend the low E, 3rd fret, a half step (G up to G♯) on beat 4, pulling the string toward the floor, and land on open E. Check the targets first by fretting them: G string 3, low E 4. Start at 100 bpm; the record is 169. Once it\'s clean three times in a row, go up 5–10 bpm.',
  'licks-12': 'Bluegrass, intermediate. Up the G major scale, then down through the chord tones. Strict alternate picking: down on the beat, up on the "and". Start at 60 bpm in eighth notes and work up.',
  'chords-14': 'Three shapes of the same G chord on the G, B and high e strings, low to high up the neck. Pick each one as a 3-note arpeggio, then strum it four times, one bar each at 80 bpm, and slide to the next. Say which note is the root (G) in every shape. These small shapes are what a second guitar or mandolin-style rhythm plays over a band.',
  'chords-15': 'The same idea in C: three shapes on the top three strings, open, 5th fret and 8th fret. One bar of quarter-note strums on each at 80 bpm, up the neck and back down. Mute the lower strings with the side of your picking hand.',
  'chords-16': 'The same idea in D: the top of the open D chord, then 5th fret and 10th fret. One bar each at 80 bpm, up and back down. Find the D (the root) in each shape before you start.',
  'chords-17': 'I, IV and V in G without moving your hand: G, C and D all sit between the 2nd and 5th frets. Two bars of each at 80 bpm, G-C-G-D-G. Notice how few fingers move between shapes; keep the ones that stay.',
  'chords-18': 'G, C and D again, now between the 5th and 9th frets. Two bars each at 80 bpm, G-C-G-D-G. Then try mixing this set with the one at frets 2-5 so the chords climb as the song goes on.',
  'chords-19': 'I, IV and V in A, the other big bluegrass key (Salty Dog, Ragtime Annie). All three shapes sit between the 4th and 7th frets. Two bars of each at 80 bpm: A-D-A-E-A.',
  'chords-20': 'G, C and D on the middle three strings (D, G, B), between the 2nd and 5th frets. Mute the low E with your fretting thumb or a fingertip and skip the high e. One bar each at 80 bpm, then G-C-G-D-G.',
  'chords-21': 'Play each triad up and down in quarter notes at 80 bpm: root, 3rd, 5th, then on to the next octave, using only the notes on the board. Say the interval as you play it. Once it\'s even, play two notes per click.',
  'chords-22': 'The dominant seventh (♭7) gives country and bluegrass changes their pull. One bar of quarter-note strums on each at 80 bpm, G7-C7-G7-D7-G7. Keep the G7 shape close to G so you can switch between them in a song.',
  'chords-23': 'The I, IV and V7 in E, a common key for country and blues singers. B7 is the tricky one: get all four fingers down together. Two bars each at 80 bpm: E-A-E-B7-E.',
  'chords-24': 'Every dominant seventh wants to resolve to the chord a fourth above. Play each pair as one bar of the 7th, then one bar of where it goes, at 80 bpm: D7 to G, A7 to D, E7 to A, B7 to E.',
  'chords-25': 'The ragtime progression behind Salty Dog Blues and lots of fiddle tunes: G, then a chain of sevenths that each lead to the next (E7, A7, D7) and home to G. Two bars each at 80 bpm, with a boom-chuck: bass note on 1 and 3, strum on 2 and 4.',
  'chords-26': 'G7 with the E-shape barre at the 3rd fret, C7 with the A shape at the 3rd fret, and D7 with the A shape at the 5th. Closed shapes let you chop: squeeze on beats 2 and 4 and release so the chord stops short. One bar each at 80 bpm.',
  'chords-27': 'Four-note sevenths on the D, G, B and high e strings, all around the 5th fret, so the changes barely move. Two bars each at 80 bpm: G7-C7-G7-D7-G7. Good for a lighter rhythm sound or backing a fiddle.',
  'chords-28': 'Play each dominant seventh arpeggio up and down in quarter notes at 80 bpm: 1, 3, 5, ♭7. Listen for the ♭7, the note that makes it want to move on. Then do two notes per click.',
  'chords-29': 'Pick a key from the menu, then about a minute per progression at 80 bpm, one strum or boom-chuck per beat, four beats to a bar. Say the numbers out loud as you change. The quick change goes to IV in bar 2; Freight Train (Elizabeth Cotten) takes the III7, a major chord on the 3rd, back to IV; the ♭VII is the borrowed chord in Old Joe Clark. Once a progression is easy, change the key.',
  'chords-30': 'Pick a key, then about a minute per progression at 80 bpm, four beats to a bar; a bar with two numbers gets two beats each. The II7 is a major chord on the 2nd that pushes to the V. In the minor iv, the IV turns minor for a bar before home. The last one is in minor: key of A means A minor (Am-G-F-E7). Say the numbers as you play.',
  'strumming-7': 'Make up a strumming pattern on the spot: keep your hand swinging down and up in time, and choose which strums hit the strings. Then play a song you know with it (G, C and D cover plenty) and keep it going for the whole five minutes. Like it? Add it to this item as a strumming pattern.',
};

/** Links that come with starter items. */
const STARTER_LINKS = {
  'licks-6': 'https://www.youtube.com/results?search_query=easy+guitar+lick+lesson',
};

/** Starter items added in a later schema version: [version, ids]. */
export const ADDED_ITEMS = [
  [3, ['chords-8', 'chords-9', 'chords-10', 'chords-11', 'chords-12', 'chords-13']],
  [4, ['strumming-7', ...LICK_IDS]],
  [5, Array.from({ length: 15 }, (_, i) => `chords-${i + 14}`)],
  [6, ['chords-29', 'chords-30']],
  [7, ['licks-13']],
];

/** A starter item as shipped, by id (used to add new starter items to existing libraries). */
export function starterItem(id) {
  const m = /^(.+)-(\d+)$/.exec(id);
  const text = starterText(id);
  if (!m || !text) return null;
  return {
    id, subtype_id: m[1], text, url: STARTER_LINKS[id] || '', notes: STARTER_NOTES[id] || '',
    diagrams: structuredClone(STARTER_DIAGRAMS[id] || []),
    order: Number(m[2]) - 1, archived: false, last_completed_at: null,
  };
}

/** Starter text by item id, so migrations can tell untouched starter items apart. */
export function starterText(id) {
  const m = /^(.+)-(\d+)$/.exec(id);
  return m && LIBRARY[m[1]] ? LIBRARY[m[1]][Number(m[2]) - 1] ?? null : null;
}

const SLOTS = [
  'warmup', 'picking', 'scales', 'chords',
  'songs', 'songs', 'songs', 'songs',
  'strumming', 'riffs', 'backing', 'licks',
];

/** The slots as shipped before v4 (the last one became Licks). */
export const SLOTS_V3 = [...SLOTS.slice(0, 11), 'backing'];

export function defaultLibrary() {
  return {
    areas: AREAS.map(([id, name], i) => ({ id, name, color: i, order: i })),
    subtypes: SUBTYPES.map(([id, name, area_id], i) => ({ id, name, area_id, order: i, archived: false })),
    items: Object.entries(LIBRARY).flatMap(([subtype_id, texts]) =>
      texts.map((text, i) => ({
        id: `${subtype_id}-${i + 1}`,
        subtype_id,
        text,
        url: STARTER_LINKS[`${subtype_id}-${i + 1}`] || '',
        notes: STARTER_NOTES[`${subtype_id}-${i + 1}`] || '',
        diagrams: structuredClone(STARTER_DIAGRAMS[`${subtype_id}-${i + 1}`] || []),
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
    skin: 'lounge', // 'lounge' | 'classic'
    layout: 'grid', // 'grid' | 'list'
    metronome: { bpm: 70, beats: 4, accent: true, auto: true }, // auto: starts and stops with each block
  };
}

export const ITEM_SOFT_LIMIT = 45;
export const NOTES_LIMIT = 4000;
export const AREA_COLOR_COUNT = 8;
