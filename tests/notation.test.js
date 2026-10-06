import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTab, parseRhythm, normaliseRhythm, serialiseTab, tabNoteNames, cleanChart, readChart, isChordSymbol, readStrum, normaliseStrum, strumCounts,
} from '../js/notation.js';
import { normaliseDiagram, describeDiagram } from '../js/music.js';

const G_RUN = `
e|-----------------|
B|-----------------|
G|-----------------|
D|-------0-2-------|
A|---0h2-----------|
E|-3---------------|`;

test('tab: notes in playing order, with hammer-ons and note names', () => {
  const events = parseTab(G_RUN);
  assert.deepEqual(events.map((e) => e.notes.map((n) => `${n.string}:${n.fret}${n.tech || ''}`).join(' ')), ['0:3', '1:0', '1:2h', '2:0', '2:2']);
  assert.deepEqual(tabNoteNames(events), ['G', 'A', 'B', 'D', 'E']);
});

test('tab: tidy form round-trips; bends, releases, slides, double stops, bars, two-digit frets', () => {
  const tab = `e|--8b10r8--5-----|---------|
B|-----------8~---|--10/12--|
G|---------------7|---------|
D|----------------|---------|
A|----------------|---------|
E|----------------|---------|`;
  const events = parseTab(tab);
  assert.equal(events.length, 6);
  assert.deepEqual(events[0].notes[0], { string: 5, fret: 8, bend: 10, release: 8 });
  assert.equal(events[2].notes[0].vib, true);
  assert.equal(events[4].bar, true, 'a bar line before the slide');
  assert.deepEqual(events[5].notes[0], { string: 4, fret: 12, tech: '/' });
  const clean = serialiseTab(events);
  assert.deepEqual(parseTab(clean), events);
  assert.equal(serialiseTab(parseTab(clean)), clean, 'stable');
  const stop = parseTab('e|--5--|\nB|--5--|\nG|-----|\nD|-----|\nA|-----|\nE|-----|');
  assert.deepEqual(tabNoteNames(stop), ['E+A'], 'notes played together');
  const blues = parseTab('e|-8-----------|\nB|---11-8------|\nG|--------10-8-|\nD|-------------|\nA|-------------|\nE|-------------|');
  assert.deepEqual(tabNoteNames(blues), ['C', 'Bb', 'G', 'F', 'Eb'], 'flats in a flat key');
  const run = parseTab('e|-------|\nB|-------|\nG|-------|\nD|-------|\nA|-0h1/2-|\nE|-------|');
  assert.deepEqual(tabNoteNames(run), ['A', 'A#', 'B'], 'sharp on the way up');
});

test('tab: text that is not tab yields nothing; labels and missing labels both work', () => {
  assert.deepEqual(parseTab('Just some words\nabout a lick'), []);
  assert.equal(parseTab(G_RUN.replace(/^[eBGDAE]\|/gm, '|')).length, 5);
  assert.equal(normaliseDiagram({ type: 'tab', tab: 'nope' }), null);
  assert.equal(describeDiagram(normaliseDiagram({ type: 'tab', tab: G_RUN })), 'Tab: 5 notes');
});

test('chord symbols: what chord sheets use, and not ordinary words', () => {
  for (const c of ['G', 'F#m7', 'Cadd9', 'Dsus4', 'G/B', 'Bb7', 'E7#9', 'Am7/G', 'C#m7b5', 'N.C.', 'Fmaj7', 'Asus2']) assert.ok(isChordSymbol(c), c);
  for (const w of ['Am I', 'Be', 'Dad', 'And', 'Go', 'Bed', 'Em,', 'x2']) assert.ok(!isChordSymbol(w), w);
});

test('a pasted chord sheet keeps chords and section names, never lyrics', () => {
  const sheet = `Capo: 2nd fret
[Intro]
G  C  G  D
[Verse 1]
G         C
Walking down the line tonight
G         D
Thinking of the road
G         C
Lyric words again
G         D
And more of them here
[Chorus]
C    G
A line we sing
D    G
[Verse 2]
G C
words
G D
words
G C
w
G D
[Chorus]
C G
D G
Bridge
Em C G D
Am I the one`;
  const chart = cleanChart(sheet);
  assert.equal(chart, 'Capo: 2\nIntro: G C G D\nVerse: G C G D x2\nChorus: C G D G\nBridge: Em C G D');
  for (const word of ['Walking', 'road', 'sing', 'words', 'Am I']) assert.ok(!chart.includes(word), `no lyric "${word}"`);
  assert.equal(cleanChart(chart), chart, 'idempotent');
  const read = readChart(chart);
  assert.deepEqual(read.meta, [['Capo', '2']]);
  assert.deepEqual(read.sections.map((s) => s.label), ['Intro', 'Verse', 'Chorus', 'Bridge']);
  assert.deepEqual(read.chords, ['G', 'C', 'D', 'Em']);
});

test('typed chord charts: bars, repeats, notes for a section, several rows', () => {
  const typed = 'Key: G\nVerse: G | G | C | G\nD | C | G | G\nSolo: same as the verse\nOutro: G C G (x2)';
  const chart = cleanChart(typed);
  assert.equal(chart, 'Key: G\nVerse: G | G | C | G | D | C | G | G\nSolo: same as the verse\nOutro: G C G (x2)');
  const d = normaliseDiagram({ type: 'progression', text: typed });
  assert.equal(describeDiagram(d), 'Chord chart: G, C, D');
  assert.equal(normaliseDiagram({ type: 'progression', text: 'Only words here' }), null);
});

test('strumming: written patterns become slots, with downs on the beat', () => {
  assert.equal(readStrum('Down-down-up-up-down-up, 70 bpm'), 'D-DU-UDU');
  assert.equal(readStrum('Strum D DU UDU'), 'D-DU-UDU');
  assert.equal(readStrum('Pattern: D-DU-UDU'), 'D-DU-UDU');
  assert.equal(readStrum('Down strums on every beat, 70 bpm'), 'DDDD');
  assert.equal(readStrum('Waltz: D DU DU'), 'D-DUDU');
  assert.equal(readStrum('D major scale'), null);
  assert.equal(readStrum('Open chords: C, G, D'), null);
  assert.equal(normaliseStrum('d-du-udu'), 'D-DU-UDU');
  assert.equal(normaliseStrum('DDUDU'), null, 'five slots is not a bar');
  assert.deepEqual(strumCounts(8), ['1', '&', '2', '&', '3', '&', '4', '&']);
  assert.deepEqual(strumCounts(16).slice(0, 4), ['1', 'e', '&', 'a']);
  assert.deepEqual(strumCounts(4), ['1', '2', '3', '4']);
  assert.deepEqual(normaliseDiagram({ type: 'strum', pattern: 'DUDUDUDU', accents: [2, 6, 6, 40] }), { type: 'strum', pattern: 'DUDUDUDU', accents: [2, 6] });
});

test('tab rhythm: one value per note, dotted allowed, kept only when it fits the tab', () => {
  assert.deepEqual(parseRhythm('q e. | s', 3).map((r) => r.beats), [1, 0.75, 0.25]);
  assert.equal(parseRhythm('q e e', 2), null);
  assert.equal(parseRhythm('q x', 2), null);
  assert.equal(normaliseRhythm('Q  e | E', 3), 'q e e');
  const tab = 'e|-0-0-|\nB|-----|\nG|-----|\nD|-----|\nA|-----|\nE|-----|';
  assert.equal(normaliseDiagram({ type: 'tab', tab, rhythm: 'q q' }).rhythm, 'q q');
  assert.equal(normaliseDiagram({ type: 'tab', tab, rhythm: 'q q q' }).rhythm, undefined);
});
