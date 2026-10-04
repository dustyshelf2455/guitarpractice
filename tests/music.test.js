import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleTones, arpeggioTones, fretboardNotes, chordShape, parseChord, chordTokens, runNotes, runWindow,
  suggestDiagram, normaliseDiagram, describeDiagram, pretty, STRING_NAMES,
} from '../js/music.js';
import { defaultLibrary, STARTER_DIAGRAMS, SCHEMA_VERSION } from '../js/defaults.js';
import { migrate, parseFile } from '../js/transfer.js';

const names = (list) => list.map((t) => t.name).join(' ');
const frets = (s) => s.frets.map((f) => (f < 0 ? 'x' : f)).join('');

test('scales are spelled with one letter per degree', () => {
  assert.equal(names(scaleTones('C', 'major')), 'C D E F G A B');
  assert.equal(names(scaleTones('F', 'major')), 'F G A Bb C D E');
  assert.equal(names(scaleTones('D', 'major')), 'D E F# G A B C#');
  assert.equal(names(scaleTones('F#', 'major')), 'F# G# A# B C# D# E#');
  assert.equal(names(scaleTones('Eb', 'dorian')), 'Eb F Gb Ab Bb C Db');
  assert.equal(names(scaleTones('A', 'harmonic_minor')), 'A B C D E F G#');
  assert.equal(names(scaleTones('E', 'minor_pentatonic')), 'E G A B D');
  assert.equal(names(scaleTones('G', 'major_pentatonic')), 'G A B D E');
  assert.equal(names(scaleTones('A', 'blues')), 'A C D Eb E G');
});

test('intervals and arpeggios', () => {
  assert.deepEqual(scaleTones('A', 'blues').map((t) => t.interval), ['1', '♭3', '4', '♭5', '5', '♭7']);
  assert.equal(names(arpeggioTones('C', '7')), 'C E G Bb');
  assert.equal(names(arpeggioTones('B', 'm7b5')), 'B D F A');
  assert.deepEqual(arpeggioTones('C', 'major').map((t) => t.interval), ['1', '3', '5']);
});

test('fretboard positions: open C major and the A minor pentatonic box', () => {
  const c = fretboardNotes(scaleTones('C', 'major'), 'open');
  const at = (s, f) => c.notes.find((n) => n.string === s && n.fret === f)?.name;
  assert.equal(at(1, 3), 'C'); // A string, 3rd fret
  assert.equal(at(4, 1), 'C'); // B string, 1st fret
  assert.equal(at(0, 0), 'E');
  assert.equal(at(3, 1), undefined, 'G# is not in C major');
  assert.ok(c.notes.filter((n) => n.root).every((n) => n.name === 'C'));

  const box = fretboardNotes(scaleTones('A', 'minor_pentatonic'), 5);
  assert.deepEqual(box.window, [5, 8]);
  assert.equal(box.notes.length, 12);
  for (let s = 0; s < 6; s++) assert.equal(box.notes.filter((n) => n.string === s).length, 2, `two notes on ${STRING_NAMES[s]}`);
});

test('chord shapes: open first, barres otherwise, shape requests honoured', () => {
  assert.equal(frets(chordShape('C')), 'x32010');
  assert.equal(frets(chordShape('G')), '320003');
  assert.equal(frets(chordShape('B7')), 'x21202');
  const f = chordShape('F');
  assert.equal(frets(f), '133211');
  assert.deepEqual(f.barre, { fret: 1, from: 0, to: 5 });
  assert.equal(frets(chordShape('Bm')), 'x24432');
  assert.equal(frets(chordShape('C#m')), 'x46654');
  assert.equal(frets(chordShape('Bb')), 'x13331');
  assert.equal(frets(chordShape('G:E')), '355433');
  assert.equal(frets(chordShape('C:A')), 'x35553');
  assert.equal(chordShape('E:E').frets[0], 12, 'E shape for E itself goes up the neck');
  assert.equal(frets(chordShape('Db')), frets(chordShape('C#')), 'enharmonic roots share shapes');
  assert.equal(chordShape('Cdim'), null);
  assert.equal(chordShape('Hm'), null);
});

test('chord parsing and token splitting', () => {
  assert.deepEqual(parseChord('F#m7'), { root: 'F#', quality: 'm7', shape: null, name: 'F#m7' });
  assert.equal(parseChord('Cmaj7').quality, 'maj7');
  assert.equal(parseChord('CM7').quality, 'maj7');
  assert.equal(parseChord('Bb:A').shape, 'A');
  assert.deepEqual(chordTokens('C, G to Am - F'), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(chordTokens('G-C-D'), ['G', 'C', 'D']);
});

test('suggestions read scales, arpeggios and chords from item text', () => {
  const d = (t) => {
    const s = suggestDiagram(t);
    return s ? describeDiagram(normaliseDiagram(s)) : null;
  };
  assert.equal(d('C major scale, open position'), 'C major scale, open position');
  assert.equal(d('A minor pentatonic'), 'A minor pentatonic scale, 5th fret');
  assert.equal(d('B minor scale, 2nd position'), 'B natural minor scale, 2nd fret');
  assert.equal(d('Blues in A, box 1 over a shuffle'), 'A blues scale, 5th fret');
  assert.equal(d('C major arpeggio, open position'), 'C major arpeggio, open position');
  assert.equal(d('Open chords: C, G, D, Em, Am'), 'Chords: C, G, D, Em, Am');
  assert.equal(d('Travis picking G-C-D, fingerstyle'), 'Chords: G, C, D');
  assert.equal(d('Crosspick D: 654, 543, 432, 321 and back'), 'Chords: D');
  assert.equal(d('Solo over a minor blues'), null, '"a" is not the note A');
  assert.equal(d('Elvis Costello - Alison'), null);
  assert.equal(d('Down strums on every beat, 70 bpm'), null);
});

test('normaliseDiagram rejects junk and keeps valid data', () => {
  assert.equal(normaliseDiagram(null), null);
  assert.equal(normaliseDiagram({ type: 'scale', root: 'H', scale: 'major' }), null);
  assert.equal(normaliseDiagram({ type: 'scale', root: 'C', scale: 'nope' }), null);
  assert.deepEqual(normaliseDiagram({ type: 'scale', root: 'c#', scale: 'major', position: 99 }),
    { type: 'scale', root: 'C#', scale: 'major', position: 'open', labels: 'notes' });
  assert.deepEqual(normaliseDiagram({ type: 'chords', chords: ['C', 'Xyz', 'G'] }), { type: 'chords', chords: ['C', 'G'] });
  assert.equal(normaliseDiagram({ type: 'chords', chords: ['Xyz'] }), null);
  assert.equal(pretty('Bb'), 'B♭');
  assert.equal(pretty('F#m7 · A shape'), 'F♯m7 · A shape');
});

test('every starter diagram is valid', () => {
  for (const [id, list] of Object.entries(STARTER_DIAGRAMS)) {
    for (const d of list) assert.deepEqual(normaliseDiagram(d), d, id);
  }
  assert.equal(defaultLibrary().items.filter((i) => i.diagrams.length).length, Object.keys(STARTER_DIAGRAMS).length);
});

test('v1 -> v2 migration adds diagrams only to untouched starter items', () => {
  const lib = defaultLibrary();
  for (const it of lib.items) delete it.diagrams; // what a v1 install has
  lib.items.find((i) => i.id === 'scales-2').text = 'D major scale, 2nd position'; // edited by the user
  lib.items.push({ id: 'i-custom', subtype_id: 'scales', text: 'B minor scale', order: 9, archived: false, last_completed_at: null });
  const out = migrate({ schema_version: 1, library: lib, settings: {}, sessions: [], plans: [] });
  const item = (id) => out.library.items.find((i) => i.id === id);
  assert.equal(out.schema_version, SCHEMA_VERSION);
  assert.deepEqual(item('scales-1').diagrams, STARTER_DIAGRAMS['scales-1']);
  assert.deepEqual(item('scales-2').diagrams, [], 'edited starter item left alone');
  assert.deepEqual(item('i-custom').diagrams, []);
  assert.deepEqual(item('songs-1').diagrams, []);
});

test('diagrams round-trip through export/import and junk is dropped', () => {
  const lib = defaultLibrary();
  lib.items[0].diagrams = [{ type: 'chords', chords: ['G', 'nope'] }, { type: 'bogus' }];
  const file = JSON.stringify({ app: 'timebox', schema_version: 2, library: lib, settings: {}, plans: [], sessions: [] });
  const parsed = parseFile(file);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.data.library.items[0].diagrams, [{ type: 'chords', chords: ['G'] }]);
  assert.deepEqual(parsed.data.library.items.find((i) => i.id === 'scales-1').diagrams, STARTER_DIAGRAMS['scales-1']);
});

test('walk-up runs: notes in playing order, open-position window', () => {
  const g2c = STARTER_DIAGRAMS['chords-8'][0];
  assert.deepEqual(runNotes(g2c).map((n) => n.name), ['G', 'A', 'B', 'C']);
  assert.deepEqual(runWindow(g2c), [0, 3]);
  assert.equal(runNotes(g2c).at(-1).last, true);
  assert.deepEqual(runNotes(STARTER_DIAGRAMS['chords-12'][0]).map((n) => n.name), ['D', 'E', 'F#', 'G']);
  assert.deepEqual(runWindow(STARTER_DIAGRAMS['chords-12'][0]), [0, 4]);
  assert.equal(describeDiagram(STARTER_DIAGRAMS['chords-11'][0]), 'Bass run: D → C → B → A → G');
  assert.equal(normaliseDiagram({ type: 'run', notes: [[0, 3]] }), null, 'a run needs two notes');
  assert.deepEqual(normaliseDiagram({ type: 'run', notes: [[0, 3], [9, 1], [1, 0]] }), { type: 'run', notes: [[0, 3], [1, 0]] });
});

test('v2 -> v3 migration adds the walk-ups to Chords and arpeggios, once', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !/^chords-(8|9|1[0-3])$/.test(i.id)); // a v2 library
  lib.items.push({ id: 'i-mine', subtype_id: 'chords', text: 'My own chord drill', order: 20, archived: false, last_completed_at: 5, diagrams: [] });
  const out = migrate({ schema_version: 2, library: lib, settings: {}, sessions: [], plans: [] });
  const added = out.library.items.filter((i) => /^chords-(8|9|1[0-3])$/.test(i.id));
  assert.equal(added.length, 6);
  assert.ok(added.every((i) => i.order > 20 && i.subtype_id === 'chords' && i.last_completed_at === null));
  assert.equal(added[0].text, 'Walk-up G to C: G-A-B-C');
  assert.equal(added[0].diagrams[0].type, 'run');
  const again = migrate({ ...out, schema_version: 2 });
  assert.equal(again.library.items.filter((i) => i.id === 'chords-8').length, 1, 'never duplicated');
  const noChords = defaultLibrary();
  noChords.subtypes = noChords.subtypes.filter((st) => st.id !== 'chords');
  noChords.items = noChords.items.filter((i) => i.subtype_id !== 'chords');
  assert.ok(!migrate({ schema_version: 2, library: noChords }).library.items.some((i) => i.id === 'chords-8'), 'skipped if the subtype is gone');
});
