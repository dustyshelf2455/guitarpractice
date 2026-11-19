import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleTones, arpeggioTones, fretboardNotes, chordShape, parseChord, chordTokens, runNotes, runWindow,
  suggestDiagram, normaliseDiagram, describeDiagram, pretty, STRING_NAMES,
  numeralChord, numeralBars, parseNumeral, PROGRESSION_KEYS, parseNote, shapeNotes,
} from '../js/music.js';
import { defaultLibrary, STARTER_DIAGRAMS, STARTER_NOTES, STARTER_NOTES_V7, STARTER_V9, SCHEMA_VERSION, FILLS_V12, PENT_V13 } from '../js/defaults.js';
import { migrate, parseFile, fingerprint } from '../js/transfer.js';
import { parseTab } from '../js/notation.js';
import { parseBpm, blockBpm } from '../js/util.js';

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
  assert.equal(d('Down strums on every beat, 70 bpm'), 'Strumming: ↓ ↓ ↓ ↓');
  assert.equal(d('Strum D DU UDU, 80 bpm'), 'Strumming: ↓ · ↓ ↑ · ↑ ↓ ↑');
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

test('v3 -> v4 migration: Licks subtype and slot, strumming patterns, notes, untouched items only', () => {
  const lib = defaultLibrary();
  // What a v3 install has: no Licks, the old slot list and names, no strum diagrams or notes.
  lib.subtypes = lib.subtypes.filter((st) => st.id !== 'licks');
  lib.subtypes.find((st) => st.id === 'riffs').name = 'Riffs and licks';
  lib.items = lib.items.filter((i) => i.subtype_id !== 'licks' && i.id !== 'strumming-7');
  for (const it of lib.items) {
    delete it.notes;
    if (/^(strumming|songs)-/.test(it.id)) it.diagrams = [];
  }
  lib.slots[11].subtype_id = 'backing';
  lib.items.find((i) => i.id === 'strumming-2').text = 'My own pattern'; // edited by the user
  const out = migrate({ schema_version: 3, library: lib, settings: {}, sessions: [], plans: [] }).library;
  const item = (id) => out.items.find((i) => i.id === id);
  assert.ok(out.subtypes.some((st) => st.id === 'licks' && st.area_id === 'improvisation'));
  assert.equal(out.subtypes.find((st) => st.id === 'riffs').name, 'Riffs');
  assert.equal(out.slots[11].subtype_id, 'licks');
  assert.deepEqual(item('strumming-1').diagrams, [{ type: 'strum', pattern: 'DDDD' }]);
  assert.deepEqual(item('strumming-2').diagrams, [], 'edited item left alone');
  assert.ok(item('strumming-7').notes.startsWith('Make up a strumming pattern'));
  assert.ok(item('licks-1').diagrams.some((d) => d.type === 'tab'));
  assert.equal(item('songs-9').diagrams[0].type, 'progression');

  const custom = defaultLibrary();
  custom.slots[11].subtype_id = 'songs';
  custom.subtypes = custom.subtypes.filter((st) => st.id !== 'licks');
  custom.items = custom.items.filter((i) => i.subtype_id !== 'licks');
  const kept = migrate({ schema_version: 3, library: custom }).library;
  assert.equal(kept.slots[11].subtype_id, 'songs', 'customised slots are never changed');
  assert.ok(kept.items.some((i) => i.subtype_id === 'licks'), 'the licks are still added');
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

test('written-out voicings: frets, fingers, inversion, and only chord tones', () => {
  const g = chordShape('G=xxx433~000211');
  assert.equal(frets(g), 'xxx433');
  assert.deepEqual(g.fingers, [0, 0, 0, 2, 1, 1]);
  assert.equal(g.note, '1st inversion');
  assert.equal(chordShape('G=x.x.x.12.12.10').note, 'root position');
  assert.equal(chordShape('C=xxx010').note, '2nd inversion');
  assert.equal(chordShape('G=xxx43'), null, 'six strings needed');
  assert.equal(chordShape('Hm=xxx433'), null);
  assert.deepEqual(normaliseDiagram({ type: 'chords', chords: ['D7=xx4535'] }), { type: 'chords', chords: ['D7=xx4535'] });
  assert.match(describeDiagram({ type: 'chords', chords: ['G=xxx433'] }), /G \(1st inversion\)/);
  // Every written-out starter voicing plays its chord's notes and nothing else.
  const QUALITY = { '': 'major', m: 'minor', '7': '7' };
  const STEPS = { sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 2, 4, 7] };
  for (const list of Object.values(STARTER_DIAGRAMS)) {
    for (const d of list) {
      if (d.type !== 'chords' && !d.shapes) continue;
      for (const tok of (d.chords || d.shapes).filter((t) => t.includes('='))) {
        const s = chordShape(tok);
        const c = parseChord(tok.split('=')[0]);
        const want = new Set(STEPS[c.quality]
          ? STEPS[c.quality].map((n) => (parseNote(c.root).pc + n) % 12)
          : arpeggioTones(c.root, QUALITY[c.quality]).map((t) => t.pc));
        const got = new Set(s.frets.map((f, i) => (f < 0 ? null : ([4, 9, 2, 7, 11, 4][i] + f) % 12)).filter((p) => p != null));
        assert.deepEqual([...got].sort(), [...want].sort(), tok);
      }
    }
  }
});

test('v4 -> v5 migration adds the triad and seventh exercises at 80 bpm', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !/^chords-(1[4-9]|2[0-8])$/.test(i.id));
  const out = migrate({ schema_version: 4, library: lib, settings: {}, sessions: [], plans: [] });
  const added = out.library.items.filter((i) => /^chords-(1[4-9]|2[0-8])$/.test(i.id));
  assert.equal(added.length, 15);
  assert.ok(added.every((i) => /\b80 bpm$/.test(i.text) && i.diagrams.length && i.notes));
});

test('progressions by number: numerals become chords in any key', () => {
  const inKey = (key, text) => numeralBars(text).flat().map((t) => numeralChord(key, t)).join(' ');
  assert.equal(inKey('G', 'I | vi | IV | V7'), 'G Em C D7');
  assert.equal(inKey('C', 'I | VI7 | II7 | V7 | III7'), 'C A7 D7 G7 E7');
  assert.equal(inKey('A', 'I | bVII | IV | iv'), 'A G D Dm');
  assert.equal(inKey('A', 'i | bVII | bVI | V7'), 'Am G F E7');
  assert.equal(inKey('F', 'I7 | IV7 | ii | iii'), 'F7 Bb7 Gm Am');
  assert.equal(inKey('Db', 'bVII | bVI'), 'B A', 'no Cb or Bbb');
  assert.deepEqual(numeralBars('I | IV V7 | nonsense | I'), [['I'], ['IV', 'V7'], ['I']]);
  assert.equal(parseNumeral('Q'), null);
  // Every chord in every starter progression, in every key, has a chord box.
  for (const list of Object.values(STARTER_DIAGRAMS)) {
    for (const d of list.filter((x) => x.type === 'numbers')) {
      assert.deepEqual(normaliseDiagram(d), d, 'starter progressions are stored clean');
      for (const key of PROGRESSION_KEYS) {
        for (const p of d.progressions) for (const t of numeralBars(p.bars).flat()) assert.ok(chordShape(numeralChord(key, t)), `${t} in ${key}`);
      }
    }
  }
  assert.equal(normaliseDiagram({ type: 'numbers', key: 'H', progressions: [{ name: 'x', bars: 'I | V' }] }).key, 'G');
  assert.equal(normaliseDiagram({ type: 'numbers', key: 'G', progressions: [{ bars: 'nope' }] }), null);
});

test('v5 -> v6 migration adds the two progression exercises', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !['chords-29', 'chords-30'].includes(i.id));
  const out = migrate({ schema_version: 5, library: lib, settings: {}, sessions: [], plans: [] });
  const added = out.library.items.filter((i) => ['chords-29', 'chords-30'].includes(i.id));
  assert.equal(added.length, 2);
  assert.ok(added.every((i) => i.subtype_id === 'chords' && i.diagrams[0].progressions.length === 5 && i.notes));
});

test('v7 -> v8: the Life of Sin lick gets its new notes and link, unless edited', () => {
  const lib = defaultLibrary();
  const lick = lib.items.find((i) => i.id === 'licks-13');
  Object.assign(lick, { notes: STARTER_NOTES_V7['licks-13'], url: '' }); // as shipped in v7
  let out = migrate({ schema_version: 7, library: lib, settings: {}, sessions: [], plans: [] });
  let item = out.library.items.find((i) => i.id === 'licks-13');
  assert.equal(item.notes, STARTER_NOTES['licks-13']);
  assert.match(item.notes, /Laur Joamets/);
  assert.match(item.url, /^https:\/\//);
  Object.assign(lick, { notes: 'my own notes', url: '' });
  out = migrate({ schema_version: 7, library: lib, settings: {}, sessions: [], plans: [] });
  item = out.library.items.find((i) => i.id === 'licks-13');
  assert.equal(item.notes, 'my own notes', 'edited notes left alone');
});

test('v8 -> v9: Closer to Fine joins Songs, with its chord-change exercise', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !['songs-11', 'chords-31'].includes(i.id));
  const out = migrate({ schema_version: 8, library: lib, settings: {}, sessions: [], plans: [] });
  const song = out.library.items.find((i) => i.id === 'songs-11');
  const drill = out.library.items.find((i) => i.id === 'chords-31');
  assert.equal(song.text, 'Indigo Girls - Closer to Fine');
  assert.match(song.url, /^https:\/\/tabs\.ultimate-guitar\.com\//);
  assert.equal(drill.subtype_id, 'chords');
  assert.equal(song.diagrams[0].type, 'progression');
  assert.match(song.diagrams[0].text, /Pre-chorus: D Cadd9 G/);
  for (const it of [song, drill]) {
    assert.deepEqual((it.diagrams[0].chords || it.diagrams[0].shapes).map((t) => chordShape(t).name), ['G', 'A7sus4', 'Cadd9', 'Dsus4', 'D', 'Dsus2']);
    assert.equal(it.diagrams[1].type, 'strum');
    assert.match(it.notes, /capo/i);
  }
});

test('v9 -> v10: Alison gets its chart, notes and link unless edited, plus a barre exercise', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => i.id !== 'chords-32');
  const song = lib.items.find((i) => i.id === 'songs-3');
  Object.assign(song, { diagrams: [], notes: '', url: '' }); // as shipped before v10
  let out = migrate({ schema_version: 9, library: lib, settings: {}, sessions: [], plans: [] });
  let item = out.library.items.find((i) => i.id === 'songs-3');
  assert.equal(item.diagrams[0].type, 'progression');
  assert.match(item.diagrams[0].text, /Chorus: A E A B \| G#m G#7 C#m B/);
  assert.match(item.notes, /barre/);
  assert.match(item.url, /alison/);
  assert.ok(out.library.items.some((i) => i.id === 'chords-32'));
  Object.assign(song, { notes: 'mine', text: 'Alison, my way' });
  out = migrate({ schema_version: 9, library: lib, settings: {}, sessions: [], plans: [] });
  item = out.library.items.find((i) => i.id === 'songs-3');
  assert.equal(item.notes, 'mine', 'renamed songs left alone');
  assert.deepEqual(item.diagrams, []);
});

test('v9 -> v10: Closer to Fine gets the full chart from the tab, unless edited', () => {
  const lib = defaultLibrary();
  for (const id of ['songs-11', 'chords-31']) Object.assign(lib.items.find((i) => i.id === id), structuredClone(STARTER_V9[id]));
  const song = lib.items.find((i) => i.id === 'songs-11');
  let out = migrate({ schema_version: 9, library: lib, settings: {}, sessions: [], plans: [] });
  let item = out.library.items.find((i) => i.id === 'songs-11');
  assert.equal(item.diagrams[0].type, 'progression');
  assert.deepEqual(item.diagrams[0].shapes, normaliseDiagram(item.diagrams[0]).shapes, 'shapes survive normalising');
  assert.match(item.notes, /Dadd11/);
  assert.match(out.library.items.find((i) => i.id === 'chords-31').notes, /Dsus2/);
  song.notes = 'mine';
  out = migrate({ schema_version: 9, library: lib, settings: {}, sessions: [], plans: [] });
  item = out.library.items.find((i) => i.id === 'songs-11');
  assert.equal(item.notes, 'mine', 'edited notes left alone');
  assert.equal(item.diagrams[0].type, 'progression', 'untouched diagrams still updated');
});

test('open position pentatonics: every shape note is in its scale, passing notes are not', () => {
  const ids = ['scales-4', ...Array.from({ length: 8 }, (_, i) => `scales-${i + 6}`)];
  for (const id of ids) {
    const d = STARTER_DIAGRAMS[id][0];
    assert.ok(d.shape.length >= 8 && d.passing.length === 2, id);
    const { notes, window } = shapeNotes(d, scaleTones(d.root, d.scale));
    assert.equal(notes.length, d.shape.length + d.passing.length);
    assert.equal(window[0], 0, `${id} is open position`);
    assert.ok(notes.some((n) => n.root), `${id} has its root`);
  }
  const names = (id) => shapeNotes(STARTER_DIAGRAMS[id][0], scaleTones(STARTER_DIAGRAMS[id][0].root, STARTER_DIAGRAMS[id][0].scale)).notes;
  assert.deepEqual(names('scales-6').filter((n) => n.passing).map((n) => [n.name, n.interval]), [['Eb', '♭3'], ['Eb', '♭3']]);
  assert.deepEqual(names('scales-7').filter((n) => n.passing).map((n) => [n.name, n.interval]), [['Eb', '♭5'], ['Eb', '♭5']]);
  assert.deepEqual(names('scales-13').filter((n) => n.passing).map((n) => n.name), ['Ab', 'Ab']);
  assert.deepEqual(shapeNotes(STARTER_DIAGRAMS['scales-12'][0], scaleTones('A', 'major_pentatonic')).window, [0, 5]);
  // Off-scale shape notes and in-scale passing notes are dropped.
  const d = normaliseDiagram({ type: 'scale', root: 'C', scale: 'major_pentatonic', position: 'open', labels: 'notes', shape: [[1, 3], [1, 2], [2, 0], [2, 2]], passing: [[2, 1], [2, 2]] });
  assert.deepEqual(d.shape, [[1, 3], [2, 0], [2, 2]]);
  assert.deepEqual(d.passing, [[2, 1]]);
});

test('v10 -> v11 migration adds the open pentatonics and reshapes E minor', () => {
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !/^scales-([6-9]|1[0-3])$/.test(i.id));
  const em = lib.items.find((i) => i.id === 'scales-4');
  em.diagrams = [{ type: 'scale', root: 'E', scale: 'minor_pentatonic', position: 'open', labels: 'notes' }];
  em.notes = '';
  const out = migrate({ schema_version: 10, library: lib, settings: {}, sessions: [], plans: [] });
  const added = out.library.items.filter((i) => /^scales-([6-9]|1[0-3])$/.test(i.id));
  assert.equal(added.length, 8);
  assert.ok(added.every((i) => /open position$/.test(i.text) && i.diagrams[0].shape && i.notes));
  const em2 = out.library.items.find((i) => i.id === 'scales-4');
  assert.deepEqual(em2.diagrams, STARTER_DIAGRAMS['scales-4']);
  assert.match(em2.notes, /Haugen/);
});

test('v11 -> v12 migration adds the acoustic fills to Licks, as tabs with rhythms and titles', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `licks-${i + 14}`);
  const lib = defaultLibrary();
  lib.items = lib.items.filter((i) => !ids.includes(i.id));
  const mine = lib.items.find((i) => i.id === 'licks-13');
  mine.notes = 'my own note';
  const out = migrate({ schema_version: 11, library: lib, settings: {}, sessions: [], plans: [] });
  const added = out.library.items.filter((i) => ids.includes(i.id));
  assert.equal(added.length, 9);
  for (const it of added) {
    const tabs = it.diagrams.filter((d) => d.type === 'tab');
    assert.ok(tabs.length >= 4 && it.diagrams.length <= 6, `${it.id}: 4-5 tabs and a chord box`);
    assert.ok(tabs.every((t) => t.rhythm && t.title), `${it.id}: every tab has a rhythm that fits and a title`);
    assert.match(it.notes, /Haugen/);
    assert.match(it.text, /\d+ bpm/);
  }
  assert.equal(out.library.items.find((i) => i.id === 'licks-13').notes, 'my own note', 'existing notes are kept');
});

test('the fills follow Eric Haugen\'s tab: Sweet Virginia is 20 bars, bar lengths add up', () => {
  const sv = STARTER_DIAGRAMS['licks-22'].filter((d) => d.type === 'tab');
  assert.equal(sv.length, 5);
  assert.equal(sv.map((t) => parseTab(t.tab).filter((e, k) => k === 0 || e.bar).length).reduce((a, b) => a + b), 20);
  // Bar 1 opens on the full G (low G with the open D, G and B), bar 18 is the D7 run.
  assert.deepEqual(parseTab(sv[0].tab)[0].notes.map((n) => `${n.string}:${n.fret}`), ['4:0', '3:0', '2:0', '0:3']);
  assert.match(sv[4].tab.split('\n')[2], /3\\2/, 'B♭ slides down to A on the G string in bar 18');
});

test('v12 -> v13 migration swaps untouched fills cards for the note-for-note versions', () => {
  const lib = defaultLibrary();
  const old = lib.items.find((i) => i.id === 'licks-22');
  const edited = lib.items.find((i) => i.id === 'licks-14');
  // As shipped in v12: a fingerprint match stands in for the old content.
  Object.assign(old, { text: FILLS_V12['licks-22'][0], diagrams: [{ type: 'tab', tab: 'e|-0-|\nB|---|\nG|---|\nD|---|\nA|---|\nE|---|' }], notes: '' });
  edited.notes = 'Ben\'s note';
  const out = migrate({ schema_version: 12, library: lib, settings: {}, sessions: [], plans: [] });
  const sv = out.library.items.find((i) => i.id === 'licks-22');
  assert.equal(sv.text, 'Sweet Virginia fills, capo 2, 80 bpm');
  assert.equal(out.library.items.find((i) => i.id === 'licks-14').notes, 'Ben\'s note', 'an edited note is kept');
  assert.equal(fingerprint('Acoustic fills over C, 70 bpm').length > 0, true);
});

test('v13 -> v14 migration shortens untouched pentatonic titles and notes, keeps edits', () => {
  const lib = defaultLibrary();
  const c = lib.items.find((i) => i.id === 'scales-6');
  const a = lib.items.find((i) => i.id === 'scales-7');
  Object.assign(c, { text: PENT_V13['scales-6'][0], notes: PENT_V13['scales-6'][1] });
  Object.assign(a, { text: 'A minor pentatonic, open, my way', notes: 'Ben\'s note' });
  const out = migrate({ schema_version: 13, library: lib, settings: {}, sessions: [], plans: [] });
  const item = (id) => out.library.items.find((i) => i.id === id);
  assert.equal(PENT_V13['scales-6'][0], 'C major pentatonic, open position, 70 bpm');
  assert.equal(item('scales-6').text, 'C major pentatonic, open position');
  assert.equal(item('scales-6').notes, STARTER_NOTES['scales-6']);
  assert.ok(STARTER_NOTES['scales-6'].length < PENT_V13['scales-6'][1].length * 0.75, 'notes are shorter');
  assert.equal(item('scales-7').text, 'A minor pentatonic, open, my way', 'an edited title is kept');
  assert.equal(item('scales-7').notes, 'Ben\'s note', 'an edited note is kept');
});

test('a block takes its tempo from its title, or else its notes', () => {
  assert.equal(parseBpm('Walk-ups in G-C-G-D-G, 70 bpm'), 70);
  assert.equal(parseBpm('Over a G7 vamp at 60–70 bpm'), 60, 'a range gives its start');
  assert.equal(blockBpm({ item_text: 'C major pentatonic, open position' }, { notes: STARTER_NOTES['scales-6'] }), 70);
  assert.equal(blockBpm({ item_text: 'Sweet Virginia fills, capo 2, 80 bpm' }, { notes: 'The record is about 107 bpm.' }), 80, 'the title wins');
  assert.equal(blockBpm({ item_text: 'Open chords' }, null), null);
});
