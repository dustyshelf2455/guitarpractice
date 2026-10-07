// Diagram editor for a library item: list, preview, edit and remove diagrams,
// accept a suggestion from the item's text, or build one: a scale, arpeggio,
// chord shapes, a song's chord chart, a tab, or a strumming pattern.

import { el, icon } from '../util.js';
import {
  ROOTS, SCALES, ARPEGGIOS, pretty, positionLabel, normaliseDiagram, describeDiagram, suggestDiagram,
  chordTokens, chordShape,
} from '../music.js';
import { cleanChart, strumCounts, parseTab, parseRhythm } from '../notation.js';
import { renderDiagram } from '../diagrams.js';

const MAX = 6;
const POSITIONS = ['open', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const TYPES = [
  ['scale', 'Scale'],
  ['arpeggio', 'Arpeggio'],
  ['chords', 'Chord shapes'],
  ['progression', 'Song chord chart'],
  ['tab', 'Tab (a lick or riff)'],
  ['strum', 'Strumming pattern'],
];
const STRUM_SIZES = [[8, '4/4, eighths'], [6, '3/4, eighths'], [16, '4/4, sixteenths'], [4, '4/4, quarters']];
const STROKES = { D: ['↓', 'Down'], U: ['↑', 'Up'], X: ['×', 'Muted chuck'], '-': ['·', 'Miss'] };
const NEXT_STROKE = { D: 'U', U: 'X', X: '-', '-': 'D' };
const TAB_EXAMPLE = 'e|-----------------|\nB|-----------------|\nG|-----------------|\nD|-------0-2-------|\nA|---0h2-----------|\nE|-3---------------|';

function select(label, options, value, onchange) {
  return el('label', { class: 'field diagram-field' },
    el('span', { class: 'field-label', text: label }),
    el('select', { class: 'input', onchange: (e) => onchange(e.target.value) },
      options.map(([v, text]) => el('option', { value: String(v), selected: String(v) === String(value) }, text))));
}

function segmented(label, options, value, onchange) {
  return el('div', { class: 'field diagram-field' },
    el('span', { class: 'field-label', text: label }),
    el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
      options.map(([v, text]) => el('button', {
        type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(v === value), onclick: () => onchange(v),
      }, text))));
}

function textarea(value, props) {
  const node = el('textarea', { class: 'input', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', ...props });
  node.value = value;
  return node;
}

/** A fresh draft, or one filled from an existing diagram (for editing). */
function draftFrom(d) {
  const draft = {
    type: 'scale', root: 'C', scale: 'major', quality: 'major', position: 'open', labels: 'notes',
    chords: '', chart: '', tab: '', rhythm: '', strum: 'D-DU-UDU', accents: [],
  };
  if (!d) return draft;
  draft.type = d.type;
  if (d.type === 'scale' || d.type === 'arpeggio') Object.assign(draft, { root: d.root, position: d.position, labels: d.labels });
  if (d.type === 'scale') draft.scale = d.scale;
  if (d.type === 'arpeggio') draft.quality = d.quality;
  if (d.type === 'chords') draft.chords = d.chords.join(' ');
  if (d.type === 'progression') Object.assign(draft, { chart: d.text, shapes: d.shapes || [] });
  if (d.type === 'tab') Object.assign(draft, { tab: d.tab, rhythm: d.rhythm || '' });
  if (d.type === 'strum') Object.assign(draft, { strum: d.pattern, accents: [...(d.accents || [])] });
  return draft;
}

/**
 * getText(): current item text (for suggestions).
 * Returns { node, value(), refresh() } where value() is the list of diagrams to save.
 */
export function diagramEditor(initial, getText) {
  const diagrams = (initial || []).map(normaliseDiagram).filter(Boolean);
  let building = false;
  let editing = null; // index of the diagram being edited
  let draft = draftFrom(null);

  const node = el('div', { class: 'diagram-editor' });

  function draftDiagram() {
    switch (draft.type) {
      case 'chords': return normaliseDiagram({ type: 'chords', chords: chordTokens(draft.chords) });
      case 'progression': return normaliseDiagram({ type: 'progression', text: draft.chart, shapes: draft.shapes });
      case 'tab': return normaliseDiagram({ type: 'tab', tab: draft.tab, rhythm: draft.rhythm });
      case 'strum': return normaliseDiagram({ type: 'strum', pattern: draft.strum, accents: draft.accents });
      default: {
        const position = draft.position === 'open' ? 'open' : Number(draft.position);
        return normaliseDiagram(draft.type === 'scale'
          ? { type: 'scale', root: draft.root, scale: draft.scale, position, labels: draft.labels }
          : { type: 'arpeggio', root: draft.root, quality: draft.quality, position, labels: draft.labels });
      }
    }
  }

  function open(index) {
    editing = index;
    draft = draftFrom(index == null ? null : diagrams[index]);
    building = true;
    render();
  }

  function close() {
    building = false;
    editing = null;
    render();
  }

  function render() {
    const parts = [el('span', { class: 'field-label', text: 'Diagrams (shown full screen)' })];

    // Current diagrams with previews.
    diagrams.forEach((d, i) => {
      if (building && editing === i) return;
      parts.push(el('div', { class: 'diagram-item' },
        el('div', { class: 'diagram-item-head' },
          el('span', { class: 'diagram-item-title', text: describeDiagram(d) }),
          el('span', { class: 'diagram-item-actions' },
            // Progressions by number come with the starter items; there's no builder for them.
            building || d.type === 'numbers' ? null : el('button', {
              class: 'text-btn', type: 'button', 'aria-label': `Edit ${describeDiagram(d)}`, onclick: () => open(i),
            }, 'Edit'),
            el('button', {
              class: 'text-btn', type: 'button', 'aria-label': `Remove ${describeDiagram(d)}`,
              onclick: () => {
                diagrams.splice(i, 1);
                if (editing != null && editing > i) editing--;
                render();
              },
            }, 'Remove'))),
        renderDiagram(d)));
    });
    if (!diagrams.length && !building) parts.push(el('p', { class: 'field-hint', text: 'No diagram yet.' }));

    // A suggestion from the text, when it adds something new.
    const suggestion = normaliseDiagram(suggestDiagram(getText()));
    const already = suggestion && diagrams.some((d) => JSON.stringify(d) === JSON.stringify(suggestion));
    if (suggestion && !already && diagrams.length < MAX && !building) {
      parts.push(el('div', { class: 'diagram-suggest' },
        el('span', {}, 'Suggested: ', el('strong', { text: describeDiagram(suggestion) })),
        el('button', {
          class: 'btn btn-small', type: 'button',
          onclick: () => { diagrams.push(suggestion); render(); },
        }, icon('plus'), 'Add')));
    }

    if (building) parts.push(builder());
    else if (diagrams.length < MAX) {
      parts.push(el('button', { class: 'btn btn-small diagram-add', type: 'button', onclick: () => open(null) }, icon('plus'), 'Add a diagram'));
    }
    node.replaceChildren(...parts);
  }

  function builder() {
    const set = (key) => (v) => { draft[key] = v; render(); };
    const fields = [select('Type', TYPES, draft.type, set('type'))];
    const preview = el('div', { class: 'diagram-preview' });
    const saveBtn = el('button', {
      class: 'btn btn-small btn-primary', type: 'button',
      onclick: () => {
        const d = draftDiagram();
        if (!d) return;
        if (editing == null) diagrams.push(d);
        else diagrams[editing] = d;
        close();
      },
    }, editing == null ? 'Add diagram' : 'Save diagram');
    const refreshPreview = () => {
      const d = draftDiagram();
      preview.replaceChildren(...(d ? [renderDiagram(d)] : []));
      saveBtn.disabled = !d;
      return d;
    };
    const finish = () => {
      fields.push(preview, el('div', { class: 'diagram-actions' },
        el('button', { class: 'btn btn-small', type: 'button', onclick: close }, 'Cancel'),
        saveBtn));
      queueMicrotask(refreshPreview);
      return el('div', { class: 'diagram-builder' }, fields);
    };

    if (draft.type === 'chords') {
      const input = el('input', {
        class: 'input', type: 'text', value: draft.chords, placeholder: 'e.g. C G Am F',
        autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
      });
      const status = el('p', { class: 'field-hint' });
      const refresh = () => {
        draft.chords = input.value;
        const unknown = chordTokens(input.value).filter((t) => !chordShape(t));
        status.textContent = unknown.length
          ? `Don't know: ${unknown.join(', ')}. Try names like C, Am, G7, Fmaj7, Dsus4, or add :E / :A for a barre shape (G:E).`
          : 'Add :E or :A for a barre shape, e.g. G:E.';
        status.classList.toggle('warn', unknown.length > 0);
        refreshPreview();
      };
      input.addEventListener('input', refresh);
      fields.push(el('label', { class: 'field diagram-field' }, el('span', { class: 'field-label', text: 'Chords' }), input), status);
      queueMicrotask(() => { refresh(); input.focus({ preventScroll: true }); });
      return finish();
    }

    if (draft.type === 'progression') {
      const area = textarea(draft.chart, { rows: '8', placeholder: 'Capo: 2\nIntro: G C G D\nVerse: G C G D x2\nChorus: C G D G' });
      const status = el('p', { class: 'field-hint' });
      const tidy = () => {
        const clean = cleanChart(area.value);
        if (clean && clean !== area.value) area.value = clean;
        draft.chart = area.value;
        const ok = refreshPreview();
        status.textContent = ok ? 'One line per section. Lyrics and other text are left out.' : 'No chords found yet.';
        status.classList.toggle('warn', !ok && !!area.value.trim());
      };
      area.addEventListener('input', () => { draft.chart = area.value; refreshPreview(); });
      area.addEventListener('paste', () => setTimeout(tidy, 0)); // a pasted chord sheet is tidied straight away
      area.addEventListener('blur', tidy);
      fields.push(
        el('label', { class: 'field diagram-field' }, el('span', { class: 'field-label', text: 'Chords by section' }), area),
        el('p', { class: 'field-hint', text: 'Type “Verse: G C G D”, one section per line, or paste a whole chord sheet (from Ultimate Guitar, say). Only the chords and section names are kept; lyrics are left out.' }),
        status,
      );
      return finish();
    }

    if (draft.type === 'tab') {
      const area = textarea(draft.tab, { class: 'input tab-input', rows: '7', placeholder: TAB_EXAMPLE, wrap: 'off' });
      const status = el('p', { class: 'field-hint' });
      area.addEventListener('input', () => {
        draft.tab = area.value;
        const ok = refreshPreview();
        status.textContent = ok || !area.value.trim() ? '' : 'No tab found yet: it needs six lines, high e on top.';
        status.classList.toggle('warn', !ok && !!area.value.trim());
      });
      const rhythm = el('input', { class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'q e e q q' });
      rhythm.value = draft.rhythm;
      const rhythmStatus = el('p', { class: 'field-hint' });
      const checkRhythm = () => {
        const notes = parseTab(draft.tab).length;
        const values = draft.rhythm.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        const bad = !!draft.rhythm.trim() && notes > 0 && !parseRhythm(draft.rhythm, notes);
        rhythmStatus.textContent = bad ? `The rhythm needs one value per note: ${values} for ${notes} notes, or a letter it doesn't know.` : '';
        rhythmStatus.classList.toggle('warn', bad);
      };
      rhythm.addEventListener('input', () => {
        draft.rhythm = rhythm.value;
        refreshPreview();
        checkRhythm();
      });
      area.addEventListener('input', checkRhythm);
      fields.push(
        el('label', { class: 'field diagram-field' }, el('span', { class: 'field-label', text: 'Tab' }), area),
        el('p', { class: 'field-hint', text: 'Six lines, high e on top. h hammer-on, p pull-off, / and \\ slides, 7b9 bend, 7b9r7 bend and release, ~ vibrato.' }),
        status,
        el('label', { class: 'field diagram-field' }, el('span', { class: 'field-label', text: 'Rhythm (optional)' }), rhythm),
        el('p', { class: 'field-hint', text: 'One per note, drawn under the tab: w whole, h half, q quarter, e eighth, s sixteenth; add . for dotted.' }),
        rhythmStatus,
      );
      checkRhythm();
      return finish();
    }

    if (draft.type === 'strum') {
      const n = draft.strum.length;
      const counts = strumCounts(n);
      fields.push(select('Bar', STRUM_SIZES, n, (value) => {
        const len = Number(value);
        draft.strum = Array.from({ length: len }, (_, i) => draft.strum[i] || (i % 2 ? 'U' : 'D')).join('');
        draft.accents = draft.accents.filter((i) => i < len);
        render();
      }));
      const slots = el('div', { class: 'strum-editor', style: `--slots: ${Math.min(n, 8)}` },
        [...draft.strum].map((c, i) => el('div', { class: 'strum-edit-slot' },
          el('button', {
            class: 'strum-edit-stroke', type: 'button', 'aria-label': `${counts[i]}: ${STROKES[c][1]}. Tap to change.`,
            onclick: () => {
              const chars = [...draft.strum];
              chars[i] = NEXT_STROKE[chars[i]];
              draft.strum = chars.join('');
              render();
            },
          }, STROKES[c][0]),
          el('button', {
            class: 'strum-edit-accent', type: 'button', 'aria-pressed': String(draft.accents.includes(i)),
            'aria-label': `Accent ${counts[i]}`,
            onclick: () => {
              draft.accents = draft.accents.includes(i) ? draft.accents.filter((k) => k !== i) : [...draft.accents, i];
              render();
            },
          }, '>'),
          el('span', { class: 'strum-edit-count', text: counts[i] }))));
      fields.push(el('div', { class: 'field diagram-field' },
        el('span', { class: 'field-label', text: 'Strokes (tap to change: down, up, muted, miss)' }), slots));
      return finish();
    }

    fields.push(
      el('div', { class: 'diagram-grid' },
        select('Root', ROOTS.map((r) => [r, pretty(r)]), draft.root, set('root')),
        draft.type === 'scale'
          ? select('Scale', Object.entries(SCALES).map(([k, v]) => [k, v.name]), draft.scale, set('scale'))
          : select('Arpeggio', Object.entries(ARPEGGIOS).map(([k, v]) => [k, v.name]), draft.quality, set('quality')),
        select('Position', POSITIONS.map((p) => [p, positionLabel(p).replace(/^./, (c) => c.toUpperCase())]), draft.position, set('position')),
      ),
      segmented('Dots show', [['notes', 'Note names'], ['intervals', 'Intervals']], draft.labels, set('labels')),
    );
    return finish();
  }

  render();
  return { node, value: () => diagrams.slice(), refresh: render };
}
