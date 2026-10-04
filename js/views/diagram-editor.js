// Diagram editor for a library item: list, preview and remove diagrams, accept
// a suggestion from the item's text, or build one (scale, arpeggio, chords).

import { el, icon } from '../util.js';
import {
  ROOTS, SCALES, ARPEGGIOS, pretty, positionLabel, normaliseDiagram, describeDiagram, suggestDiagram,
  chordTokens, chordShape,
} from '../music.js';
import { renderDiagram } from '../diagrams.js';

const MAX = 6;
const POSITIONS = ['open', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

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

/**
 * getText(): current item text (for suggestions).
 * Returns { node, value() } where value() is the list of diagrams to save.
 */
export function diagramEditor(initial, getText) {
  let diagrams = (initial || []).map(normaliseDiagram).filter(Boolean);
  let building = false;
  const draft = { type: 'scale', root: 'C', scale: 'major', quality: 'major', position: 'open', labels: 'notes', chords: '' };

  const node = el('div', { class: 'diagram-editor' });

  function draftDiagram() {
    if (draft.type === 'chords') {
      return normaliseDiagram({ type: 'chords', chords: chordTokens(draft.chords) });
    }
    const position = draft.position === 'open' ? 'open' : Number(draft.position);
    return normaliseDiagram(draft.type === 'scale'
      ? { type: 'scale', root: draft.root, scale: draft.scale, position, labels: draft.labels }
      : { type: 'arpeggio', root: draft.root, quality: draft.quality, position, labels: draft.labels });
  }

  function render() {
    const parts = [el('span', { class: 'field-label', text: 'Diagrams (shown full screen)' })];

    // Current diagrams with previews.
    diagrams.forEach((d, i) => {
      parts.push(el('div', { class: 'diagram-item' },
        el('div', { class: 'diagram-item-head' },
          el('span', { class: 'diagram-item-title', text: describeDiagram(d) }),
          el('button', {
            class: 'text-btn', type: 'button', 'aria-label': `Remove ${describeDiagram(d)}`,
            onclick: () => { diagrams.splice(i, 1); render(); },
          }, 'Remove')),
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
      parts.push(el('button', {
        class: 'btn btn-small diagram-add', type: 'button',
        onclick: () => { building = true; render(); },
      }, icon('plus'), 'Add a diagram'));
    }
    node.replaceChildren(...parts);
  }

  function builder() {
    const set = (key) => (v) => { draft[key] = v; render(); };
    const fields = [
      segmented('Type', [['scale', 'Scale'], ['arpeggio', 'Arpeggio'], ['chords', 'Chords']], draft.type, set('type')),
    ];
    if (draft.type === 'chords') {
      const input = el('input', {
        class: 'input', type: 'text', value: draft.chords, placeholder: 'e.g. C G Am F',
        autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
      });
      const status = el('p', { class: 'field-hint' });
      const preview = el('div', { class: 'diagram-preview' });
      const refresh = () => {
        draft.chords = input.value;
        const tokens = chordTokens(input.value);
        const unknown = tokens.filter((t) => !chordShape(t));
        status.textContent = unknown.length
          ? `Don't know: ${unknown.join(', ')}. Try names like C, Am, G7, Fmaj7, Dsus4, or add :E / :A for a barre shape (G:E).`
          : 'Add :E or :A for a barre shape, e.g. G:E.';
        status.classList.toggle('warn', unknown.length > 0);
        const d = draftDiagram();
        preview.replaceChildren(...(d ? [renderDiagram(d)] : []));
        addBtn.disabled = !d;
      };
      input.addEventListener('input', refresh);
      const addBtn = addButton();
      fields.push(el('label', { class: 'field diagram-field' }, el('span', { class: 'field-label', text: 'Chords' }), input), status, preview, actions(addBtn));
      queueMicrotask(() => { refresh(); input.focus({ preventScroll: true }); });
      return el('div', { class: 'diagram-builder' }, fields);
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
    const d = draftDiagram();
    fields.push(el('div', { class: 'diagram-preview' }, d ? renderDiagram(d) : null));
    const addBtn = addButton();
    addBtn.disabled = !d;
    fields.push(actions(addBtn));
    return el('div', { class: 'diagram-builder' }, fields);
  }

  function addButton() {
    return el('button', {
      class: 'btn btn-small btn-primary', type: 'button',
      onclick: () => {
        const d = draftDiagram();
        if (!d) return;
        diagrams.push(d);
        building = false;
        render();
      },
    }, 'Add diagram');
  }

  function actions(addBtn) {
    return el('div', { class: 'diagram-actions' },
      el('button', { class: 'btn btn-small', type: 'button', onclick: () => { building = false; render(); } }, 'Cancel'),
      addBtn);
  }

  render();
  return { node, value: () => diagrams.slice(), refresh: render };
}
