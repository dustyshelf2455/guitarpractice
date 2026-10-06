// Text notations for the full-screen card: tab for licks, chord charts for
// songs, and strumming patterns. Each one is stored as plain text, so it can be
// typed or pasted, and is normalised to one canonical form on save.
// Pure functions, no DOM.

const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // pitch classes, low E (0) to high e (5)
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TAB_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']; // top line first
const MAX_TAB_EVENTS = 48;

// ------------------------------------------------------------------ tab

// A tab line: dashes and frets, with or without a string name ("e|-3-3-2-|").
const isTabLine = (line) => (/-{2,}/.test(line) || /^\s*[A-Ga-g][#b]?\s*\|.*-/.test(line))
  && /^\s*(?:[A-Ga-g][#b]?\s*)?[|:]?[-0-9hpbrsx~|/\\.()\s]*$/.test(line);
const stripLabel = (line) => line.trim().replace(/^[A-Ga-g][#b]?\s*(?=[|:-])/, '').replace(/^[|:]/, '').replace(/\|\s*$/, '');

/** Read a fret number at `i`: two digits when they make a fret up to 24. */
function readFret(row, i) {
  const two = row.slice(i, i + 2);
  if (/^\d\d$/.test(two) && Number(two) <= 24) return two;
  return row[i];
}

/**
 * Read standard 6-line ASCII tab (high e on top). Several systems (blocks of
 * six lines) are read one after the other. Returns events in playing order:
 * { notes: [{ string, fret, tech?, bend?, release?, vib? }], bar? } — or [] if
 * there is no tab in the text. `fret` is a number, or 'x' for a muted note.
 */
export function parseTab(text) {
  const lines = String(text || '').split(/\r?\n/);
  const systems = [];
  let run = [];
  for (const line of [...lines, '']) {
    if (isTabLine(line)) run.push(line);
    else {
      for (let k = 0; k + 6 <= run.length; k += 6) systems.push(run.slice(k, k + 6));
      run = [];
    }
  }
  const events = [];
  for (const system of systems) {
    const rows = system.map(stripLabel);
    const width = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => r.padEnd(width, '-'));
    let bar = false;
    for (let c = 0; c < width; c++) {
      if (padded.some((r) => r[c] === '|')) {
        if (events.length) bar = true;
        continue;
      }
      const notes = [];
      padded.forEach((row, r) => {
        const ch = row[c];
        const prev = row[c - 1] ?? '-';
        const isNumber = /\d/.test(ch) && !/\d/.test(prev);
        const isMute = /x/i.test(ch) && !/\d/.test(prev);
        if (!isNumber && !isMute) return;
        if (isNumber && (prev === 'b' || prev === 'r')) return; // a bend target, not a new note
        const fretText = isNumber ? readFret(row, c) : 'x';
        const note = { string: 5 - r, fret: isNumber ? Number(fretText) : 'x' };
        if ('hp/\\s'.includes(prev) && prev !== '-') note.tech = prev === 's' ? '/' : prev;
        let j = c + fretText.length;
        const bend = /^b(\d{1,2})/.exec(row.slice(j));
        if (bend) { note.bend = Number(bend[1]); j += bend[0].length; }
        const rel = /^r(\d{1,2})/.exec(row.slice(j));
        if (rel) { note.release = Number(rel[1]); j += rel[0].length; }
        if (row[j] === '~') note.vib = true;
        notes.push(note);
      });
      if (!notes.length) continue;
      const event = { notes: notes.sort((a, b) => b.string - a.string) };
      if (bar) event.bar = true;
      bar = false;
      events.push(event);
      if (events.length >= MAX_TAB_EVENTS) return events;
    }
  }
  return events;
}

function noteText(n) {
  return `${n.fret}${n.bend != null ? `b${n.bend}` : ''}${n.release != null ? `r${n.release}` : ''}${n.vib ? '~' : ''}`;
}

/** Events back to tidy 6-line tab, so every stored tab reads the same way. */
export function serialiseTab(events) {
  const rows = TAB_LABELS.map(() => '-');
  for (const ev of events) {
    if (ev.bar) for (let r = 0; r < 6; r++) rows[r] += '|-';
    const width = Math.max(...ev.notes.map((n) => noteText(n).length));
    for (let r = 0; r < 6; r++) {
      const n = ev.notes.find((x) => x.string === 5 - r);
      // A technique takes the dash just before its note: "0h2", "5/7".
      if (n && n.tech) rows[r] = rows[r].slice(0, -1) + n.tech;
      rows[r] += (n ? noteText(n) : '').padEnd(width, '-') + '-';
    }
  }
  return rows.map((row, r) => `${TAB_LABELS[r]}|${row}|`).join('\n');
}

// ------------------------------------------------------------------ tab rhythm

const RHYTHM_BEATS = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

/**
 * An optional rhythm for a tab: one value per note, "w h q e s" (whole to
 * sixteenth) with "." for dotted, e.g. "q e e q | e e q". Bar lines are
 * ignored (the tab has its own). Returns [{ value, dotted, beats }], or null
 * if it isn't a rhythm or the count doesn't match `count` notes.
 */
export function parseRhythm(text, count) {
  const tokens = String(text || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length !== count || !tokens.every((t) => /^[whqes]\.?$/i.test(t))) return null;
  return tokens.map((t) => {
    const value = t[0].toLowerCase();
    const dotted = t.length === 2;
    return { value, dotted, beats: RHYTHM_BEATS[value] * (dotted ? 1.5 : 1) };
  });
}

/** The canonical rhythm text ("q e e q"), or '' when it doesn't fit the tab. */
export function normaliseRhythm(text, count) {
  const list = parseRhythm(text, count);
  return list ? list.map((r) => r.value + (r.dotted ? '.' : '')).join(' ') : '';
}

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/**
 * Note names of a tab, in order ("G A B", or "B+D" for notes played together).
 * A sharp or flat follows the line: A# rising to B, Eb falling to D; otherwise
 * flats in flat-sounding keys (Bb or Eb present and no F#), sharps elsewhere.
 */
export function tabNoteNames(events) {
  const pcs = events.map((ev) => ev.notes.filter((n) => n.fret !== 'x').map((n) => (OPEN_STRINGS[n.string] + n.fret) % 12).reverse());
  const all = new Set(pcs.flat());
  const flatKey = !all.has(6) && (all.has(10) || all.has(3));
  return pcs.map((list, k) => {
    const next = pcs.slice(k + 1).find((p) => p.length)?.[0];
    return list.map((pc) => {
      if (!BLACK_KEYS.has(pc)) return SHARP_NAMES[pc];
      const step = next == null ? 0 : (next - pc + 12) % 12;
      const flat = step === 11 || (step !== 1 && flatKey);
      return (flat ? FLAT_NAMES : SHARP_NAMES)[pc];
    }).join('+');
  }).filter(Boolean);
}

// ------------------------------------------------------------------ chord charts

// A chord symbol as written on chord sheets: G, F#m7, Cadd9, Dsus4, G/B, Bb7, E7#9, Edim, N.C.
const CHORD_SYMBOL = /^(?:N\.?C\.?|[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|Δ)?(?:\d{1,2})?(?:(?:sus|add|maj|b|#|♭|♯)\d{1,2}|sus|\+)*(?:\/[A-G][#b♯♭]?)?)$/;
const REPEAT = /^\(?[x×]\d\)?$|^\(?\d[x×]\)?$/i;
const SECTION = '(?:intro|verse|chorus|pre-?chorus|bridge|solo|outro|interlude|instrumental|break|tag|coda|ending|refrain|hook|turnaround|a part|b part|part [a-d]|riff|middle 8|post-?chorus)';
const SECTION_WORDS = new RegExp(`^${SECTION}\\b`, 'i');
// A bare heading line: "Chorus", "Verse 2", "Bridge (x2)".
const SECTION_LINE = new RegExp(`^${SECTION}(?:\\s*\\d+)?(?:\\s*\\(?[x×]\\d\\)?)?:?$`, 'i');
const META_WORDS = /^(?:capo|key|tuning|tempo|bpm|time|feel|strumming|strum)$/i;

export const isChordSymbol = (token) => CHORD_SYMBOL.test(token);

/** Split a line into chart tokens; bars ("|") become their own tokens. */
function chartTokens(line) {
  return line.replace(/\|/g, ' | ').split(/\s+/).filter(Boolean);
}

/** A line of chords: chord symbols, bars, repeats and beat slashes only, with at least one chord. */
function isChordLine(line) {
  const tokens = chartTokens(line);
  return tokens.some(isChordSymbol)
    && tokens.every((t) => isChordSymbol(t) || t === '|' || t === '/' || t === '%' || t === '-' || REPEAT.test(t) || /^[()]$/.test(t));
}

/**
 * Turn a chord chart, or a whole chord sheet pasted from a website, into a
 * compact chart: "Section: chords" lines, plus "Capo: 2"-style details.
 * Lyrics and other text lines are dropped, so only chords and section names
 * are kept. Repeated sections and rows are folded. Idempotent.
 */
export function cleanChart(text) {
  const meta = [];
  const sections = []; // { label, rows: [string] }
  let current = null;
  const section = (label) => {
    current = { label, rows: [] };
    sections.push(current);
  };
  const addRow = (line) => {
    if (!current) section('');
    const row = chartTokens(line).join(' ');
    const last = current.rows[current.rows.length - 1];
    const base = (s) => s.replace(/\s*\(?[x×](\d)\)?$/i, '');
    if (last && base(last) === row) {
      const n = Number((/[x×](\d)\)?$/i.exec(last) || [0, 1])[1]) + 1;
      current.rows[current.rows.length - 1] = `${row} x${n}`;
    } else current.rows.push(row);
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (!line || isTabLine(line)) continue;
    const bracket = /^\[([^\]]{1,30})\]\s*(.*)$/.exec(line); // [Verse 1]
    if (bracket) {
      section(bracket[1].trim());
      if (bracket[2] && isChordLine(bracket[2])) addRow(bracket[2]);
      continue;
    }
    const capo = /^capo\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*fret)?$/i.exec(line);
    if (capo) { meta.push(['Capo', capo[1]]); continue; }
    const labelled = /^([^:]{1,30}):\s*(.*)$/.exec(line);
    if (labelled && !isChordSymbol(labelled[1].trim())) {
      const [, label, body] = labelled;
      if (META_WORDS.test(label.trim())) {
        if (body.trim()) meta.push([label.trim().replace(/^./, (c) => c.toUpperCase()), body.trim()]);
        continue;
      }
      if (isChordLine(body)) { section(label.trim()); addRow(body); continue; }
      if (SECTION_WORDS.test(label.trim())) {
        section(label.trim());
        if (body.trim()) current.rows.push(body.trim().slice(0, 60));
        continue;
      }
    }
    if (SECTION_LINE.test(line)) { section(line.replace(/:$/, '')); continue; }
    if (isChordLine(line)) addRow(line);
    // Anything else (lyrics, comments) is left out.
  }

  // One flowing row per section (a pasted sheet has a short chord line per
  // lyric line), with a repeating phrase folded: "G C G D G C G D" -> "G C G D x2".
  for (const s of sections) {
    const chordRows = s.rows.filter(isChordLine);
    if (chordRows.length < 2 || chordRows.length !== s.rows.length) continue;
    const barred = s.rows.some((r) => r.includes('|'));
    const tokens = [];
    for (const row of s.rows) {
      // Rows written in bars stay in bars when joined.
      if (barred && tokens.length && tokens[tokens.length - 1] !== '|') tokens.push('|');
      tokens.push(...chartTokens(row));
    }
    s.rows = wrapRow(foldRepeats(tokens));
  }
  // Drop a section that repeats an earlier one of the same kind ("Verse 2" = "Verse 1").
  const kind = (label) => label.replace(/\s*\d+$/, '').toLowerCase();
  const kept = [];
  for (const s of sections) {
    if (!s.rows.length) continue;
    if (kept.some((k) => kind(k.label) === kind(s.label) && k.rows.join('\n') === s.rows.join('\n'))) continue;
    kept.push(s);
  }
  // "Verse 1" is just "Verse" when it's the only verse left.
  for (const s of kept) {
    if (/\s1$/.test(s.label) && kept.filter((k) => kind(k.label) === kind(s.label)).length === 1) s.label = s.label.replace(/\s1$/, '');
  }
  const out = [];
  const seenMeta = new Set();
  for (const [k, v] of meta) {
    if (seenMeta.has(k.toLowerCase())) continue;
    seenMeta.add(k.toLowerCase());
    out.push(`${k}: ${v}`);
  }
  for (const s of kept) {
    s.rows.forEach((row, i) => out.push(i === 0 && s.label ? `${s.label}: ${row}` : row));
  }
  return out.slice(0, 40).join('\n');
}

/** "G C G D G C G D" -> "G C G D x2" (only for plain lists of chords). */
function foldRepeats(tokens) {
  if (tokens.length < 4 || !tokens.every(isChordSymbol)) return tokens;
  for (let p = 2; p <= tokens.length / 2; p++) {
    if (tokens.length % p) continue;
    const chunk = tokens.slice(0, p).join(' ');
    let same = true;
    for (let i = p; i < tokens.length && same; i += p) same = tokens.slice(i, i + p).join(' ') === chunk;
    if (same) return [...tokens.slice(0, p), `x${tokens.length / p}`];
  }
  return tokens;
}

/** Split a long row of tokens into rows of at most eight chords. */
function wrapRow(tokens) {
  const rows = [];
  let row = [];
  let chords = 0;
  for (const t of tokens) {
    if (isChordSymbol(t) && chords === 8) {
      rows.push(row.join(' '));
      row = [];
      chords = 0;
    }
    if (isChordSymbol(t)) chords++;
    row.push(t);
  }
  if (row.length) rows.push(row.join(' '));
  return rows;
}

/**
 * A clean chart read for display: { meta: [[label, value]], sections:
 * [{ label, rows: [[token]] }], chords: [unique chord symbols] }.
 */
export function readChart(text) {
  const chart = { meta: [], sections: [], chords: [] };
  let current = null;
  for (const line of cleanChart(text).split('\n').filter(Boolean)) {
    const labelled = /^([^:]{1,30}):\s*(.*)$/.exec(line);
    if (labelled && META_WORDS.test(labelled[1])) { chart.meta.push([labelled[1], labelled[2]]); continue; }
    let body = line;
    if (labelled && !isChordSymbol(labelled[1].trim())) {
      current = { label: labelled[1], rows: [] };
      chart.sections.push(current);
      body = labelled[2];
    } else if (!current) {
      current = { label: '', rows: [] };
      chart.sections.push(current);
    }
    current.rows.push(isChordLine(body) ? chartTokens(body) : [body]);
  }
  for (const s of chart.sections) {
    for (const row of s.rows) for (const t of row) if (isChordSymbol(t) && !/^N/.test(t) && !chart.chords.includes(t)) chart.chords.push(t);
  }
  return chart;
}

// ------------------------------------------------------------------ strumming patterns

const STRUM_LENGTHS = new Set([3, 4, 6, 8, 12, 16]);

/** Slots per beat for a pattern length: quarters, eighths or sixteenths. */
export function strumSubdivision(length) {
  return length <= 4 ? 1 : length <= 8 ? 2 : 4;
}

/** Count labels for each slot: "1 & 2 &" or "1 e & a". */
export function strumCounts(length) {
  const per = strumSubdivision(length);
  const subs = per === 1 ? [''] : per === 2 ? ['', '&'] : ['', 'e', '&', 'a'];
  return Array.from({ length }, (_, i) => (i % per === 0 ? String(i / per + 1) : subs[i % per]));
}

/** A clean pattern: D, U, X (muted "chuck") or - (miss) per slot, or null. */
export function normaliseStrum(pattern) {
  const p = String(pattern || '').toUpperCase().replace(/[^DUX-]/g, '');
  return STRUM_LENGTHS.has(p.length) && /[DUX]/.test(p) ? p : null;
}

/**
 * Read a strumming pattern from text: "D DU UDU", "D-DU-UDU",
 * "down-down-up-up-down-up", "down strums on every beat". Strokes follow the
 * hand: downs fall on the beat, ups on the "&", so gaps are filled in.
 */
export function readStrum(text) {
  const t = String(text || '');
  const waltz = /\b3\/4\b|waltz/i.test(t);
  if (/\bdown(?:\s*strums?)?\s+(?:on\s+)?every beat\b|\bevery beat\b.*\bdown/i.test(t)) return waltz ? 'DDD' : 'DDDD';
  let strokes = null;
  const words = /\b(?:down|up)(?:[\s,–-]+(?:down|up))+\b/i.exec(t);
  if (words) strokes = words[0].toLowerCase().match(/down|up/g).map((w) => (w === 'down' ? 'D' : 'U')).join('');
  if (!strokes) {
    const compact = /(?:^|[\s(:,])([DUX][DUX\s-]*[DUX])(?=$|[\s),.;])/.exec(t);
    if (compact && /^[DUX-]+$/.test(compact[1].replace(/\s/g, '')) && compact[1].replace(/[\s-]/g, '').length >= 3) {
      const grid = compact[1].replace(/\s/g, '');
      if (grid.includes('-') && STRUM_LENGTHS.has(grid.length)) return grid;
      strokes = compact[1].replace(/[\s-]/g, '');
    }
  }
  if (!strokes) return null;
  let slots = '';
  for (const s of strokes) {
    const downSlot = slots.length % 2 === 0;
    if ((s === 'U') === downSlot) slots += '-'; // the hand passes without hitting
    slots += s;
  }
  const length = waltz && slots.length <= 6 ? 6 : slots.length <= 8 ? 8 : 16;
  return slots.length <= length ? slots.padEnd(length, '-') : null;
}
