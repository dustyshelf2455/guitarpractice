// Settings: slot template, library (areas, subtypes, items), appearance, data.

import { el, icon, fmtDate, localDate } from '../util.js';
import { ITEM_SOFT_LIMIT } from '../defaults.js';
import { buildExport, parseFile, planImport } from '../transfer.js';
import { openSheet, confirmSheet, toast, iconButton } from './sheets.js';
import { page, section, swatch, linkRow, emptyState } from './common.js';
import { diagramEditor } from './diagram-editor.js';

const APP_VERSION = '1.0.0';

/** <optgroup> per area with its subtypes, for slot pickers. */
function subtypeOptions(app, selectedId) {
  return areaGroups(app)
    .map(({ area, subtypes }) => ({
      area,
      subtypes: subtypes.concat(app.library.subtypes.filter((s) => s.archived && s.id === selectedId
        && (s.area_id || null) === (area ? area.id : null))),
    }))
    .filter((g) => g.subtypes.length)
    .map(({ area, subtypes }) => el('optgroup', { label: area ? area.name : 'Other' },
      subtypes.map((s) => el('option', { value: s.id, selected: s.id === selectedId }, s.name))));
}

function areaGroups(app, { archived = false } = {}) {
  const groups = app.sortedAreas().map((a) => ({ area: a, subtypes: app.subtypesOf(a.id, { archived }) }));
  const known = new Set(app.library.areas.map((a) => a.id));
  const other = app.library.subtypes
    .filter((s) => !!s.archived === archived && (!s.area_id || !known.has(s.area_id)))
    .sort((a, b) => a.order - b.order);
  groups.push({ area: null, subtypes: other });
  return groups;
}

// ------------------------------------------------------------------ main page

export function settingsView(app, ctx) {
  // Slots: area label above a subtype picker grouped by area.
  const slotList = el('ol', { class: 'list card' });
  const last = app.library.slots.length - 1;
  app.library.slots.forEach((slot, i) => {
    const sub = app.subtype(slot.subtype_id);
    const area = sub && sub.area_id ? app.area(sub.area_id) : null;
    const select = el('select', {
      class: 'input',
      'aria-label': `Slot ${i + 1}`,
      dataset: { key: `slot-${i}` },
      onchange: (e) => app.setSlotSubtype(i, e.target.value),
    }, subtypeOptions(app, slot.subtype_id));
    slotList.append(el('li', {},
      el('div', { class: 'row slot-row' },
        el('span', { class: 'slot-num', text: String(i + 1) }),
        el('span', { class: 'row-main' },
          el('span', { class: 'slot-area' }, swatch(area ? area.color : null), area ? area.name : 'Other'),
          select,
        ),
        el('span', { class: 'row-actions' },
          iconButton('up', `Move slot ${i + 1} up`, () => app.moveSlot(i, -1), '', { disabled: i === 0, dataset: { key: `slot-up-${i}` } }),
          iconButton('down', `Move slot ${i + 1} down`, () => app.moveSlot(i, 1), '', { disabled: i === last, dataset: { key: `slot-down-${i}` } }),
        ),
      )));
  });

  // Balance summary under the slots: how the hour splits across areas.
  const counts = new Map();
  for (const slot of app.library.slots) {
    const sub = app.subtype(slot.subtype_id);
    const area = sub && sub.area_id ? app.area(sub.area_id) : null;
    const name = area ? area.name : 'Other';
    counts.set(name, (counts.get(name) || 0) + 5);
  }
  const balance = el('p', { class: 'section-note' },
    [...counts.entries()].map(([name, min]) => `${name} ${min}m`).join(' · '));

  // Library
  const lib = el('div', { class: 'card' });
  for (const { area, subtypes } of areaGroups(app)) {
    if (!subtypes.length) continue;
    lib.append(el('div', { class: 'group-title' }, swatch(area ? area.color : null), area ? area.name : 'Other'));
    const list = el('div', { class: 'list' });
    for (const s of subtypes) {
      const n = app.itemsOf(s.id).length;
      const slots = app.slotsUsing(s.id);
      list.append(linkRow(ctx, `#/settings/subtype/${encodeURIComponent(s.id)}`, s.name,
        `${n} item${n === 1 ? '' : 's'}${slots ? ` · ${slots} slot${slots === 1 ? '' : 's'}` : ''}`));
    }
    lib.append(list);
  }
  const archivedSubs = app.library.subtypes.filter((s) => s.archived);
  if (archivedSubs.length) {
    lib.append(el('details', { class: 'more' },
      el('summary', {}, `Archived subtypes (${archivedSubs.length})`),
      el('div', { class: 'list' }, archivedSubs.map((s) =>
        linkRow(ctx, `#/settings/subtype/${encodeURIComponent(s.id)}`, s.name, 'Archived'))),
    ));
  }
  lib.append(el('div', { class: 'list' }, linkRow(ctx, '#/settings/areas', 'Areas and subtypes', 'Add, rename or regroup')));

  // Appearance
  const choice = (key, label, options) => el('div', { class: 'card-pad metro-row' },
    el('span', { class: 'field-label', text: label }),
    el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
      options.map(([value, text]) => el('button', {
        type: 'button', role: 'radio', class: 'seg', dataset: { key: `${key}-${value}` },
        'aria-checked': String(app.settings[key] === value),
        onclick: () => app.updateSettings({ [key]: value }),
      }, text))));
  const appearance = el('div', { class: 'card appearance' },
    choice('skin', 'Style', [['lounge', 'Lounge'], ['classic', 'Classic']]),
    choice('theme', 'Theme', [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']]),
    choice('layout', 'Blocks', [['grid', 'Grid'], ['list', 'List']]),
  );

  // Data
  const fileInput = el('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importFile(app, file);
    },
  });

  const root = page(ctx, { title: 'Settings', parent: '#/' },
    section('Practice slots',
      app.active ? el('p', { class: 'notice', text: 'A session is in progress. Slot changes apply from your next session.' }) : null,
      el('p', { class: 'section-note', text: 'Twelve 5-minute blocks, in this order. Pick what each block practises.' }),
      slotList,
      balance,
    ),
    section('Library', lib),
    section('Appearance', appearance),
    section('Your data',
      el('p', { class: 'section-note', text: 'Everything is stored on this device only. Export a backup now and then.' }),
      el('div', { class: 'button-stack' },
        el('button', { class: 'btn', type: 'button', dataset: { key: 'export' }, onclick: () => exportData(app) }, 'Export backup (JSON)'),
        el('button', {
          class: 'btn', type: 'button', dataset: { key: 'import' },
          onclick: () => (app.active ? toast('Finish or end the current session before importing.') : fileInput.click()),
        }, 'Import from a backup…'),
        el('button', { class: 'btn', type: 'button', dataset: { key: 'reset' }, onclick: () => resetDefaults(app) }, 'Reset library to defaults…'),
        fileInput,
      ),
    ),
    section('About', el('div', { class: 'about' },
      el('p', { text: `Timebox ${APP_VERSION}. Practice areas follow Justin Guitar's practice guidance: Technique, Knowledge, Repertoire, Time and Improvisation.` }),
      el('p', { text: `Storage: ${app.store.kind === 'indexeddb' ? 'IndexedDB' : app.store.kind === 'localstorage' ? 'local storage' : 'not available (nothing is saved)'}. Install Timebox to your home screen so the browser keeps your data.` }),
    )),
  );
  return { root, title: 'Settings' };
}

// ------------------------------------------------------------------ subtype editor

export function subtypeEditorView(app, ctx, subtypeId) {
  const sub = app.subtype(subtypeId);
  if (!sub) {
    return { root: page(ctx, { title: 'Not found', parent: '#/settings' }, emptyState('This subtype no longer exists.')), title: 'Not found' };
  }
  const items = app.itemsOf(sub.id);
  const archived = app.itemsOf(sub.id, { archived: true });

  const list = el('ol', { class: 'list' });
  items.forEach((it, i) => {
    list.append(el('li', {},
      el('div', { class: 'row' },
        el('button', {
          class: 'row-main row-link', type: 'button', dataset: { key: `item-${it.id}` },
          'aria-label': `Edit ${it.text}`,
          onclick: () => editItemSheet(app, it),
        },
        el('span', { class: 'row-title' }, it.text, it.url ? el('span', { class: 'sr-only', text: ' (has link)' }) : null),
        el('span', { class: 'row-sub' },
          it.url ? [icon('link'), ' '] : null,
          [it.diagrams && it.diagrams.length ? 'Diagram' : null,
            it.last_completed_at ? `Last done ${fmtDate(localDate(it.last_completed_at))}` : 'Not done yet'].filter(Boolean).join(' · ')),
        ),
        el('span', { class: 'row-actions' },
          iconButton('up', `Move ${it.text} up`, () => app.moveItem(it.id, -1), '', { disabled: i === 0, dataset: { key: `up-${it.id}` } }),
          iconButton('down', `Move ${it.text} down`, () => app.moveItem(it.id, 1), '', { disabled: i === items.length - 1, dataset: { key: `down-${it.id}` } }),
        ),
      )));
  });

  const addInput = el('input', {
    class: 'input', type: 'text', placeholder: 'Add an item…', 'aria-label': `New ${sub.name} item`,
    enterkeyhint: 'done', dataset: { key: 'add-item' }, maxlength: '200',
  });
  const addHint = el('p', { class: 'field-hint', hidden: true });
  addInput.addEventListener('input', () => lengthHint(addInput.value, addHint));
  const add = async () => {
    const text = addInput.value.trim();
    if (!text) return;
    await app.addItem(sub.id, text);
    toast(`Added “${text}”`);
  };
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add();
  });

  const nameInput = el('input', {
    class: 'input', type: 'text', value: sub.name, maxlength: '60', dataset: { key: 'sub-name' },
    onchange: (e) => e.target.value.trim() && app.updateSubtype(sub.id, { name: e.target.value.trim() }),
  });
  const areaSelect = el('select', {
    class: 'input', dataset: { key: 'sub-area' },
    onchange: (e) => app.updateSubtype(sub.id, { area_id: e.target.value || null }),
  },
  app.sortedAreas().map((a) => el('option', { value: a.id, selected: a.id === sub.area_id }, a.name)),
  el('option', { value: '', selected: !sub.area_id || !app.area(sub.area_id) }, 'None (Other)'));

  const slots = app.slotsUsing(sub.id);
  const archiveBtn = sub.archived
    ? el('button', { class: 'btn btn-small', type: 'button', onclick: () => app.setSubtypeArchived(sub.id, false) }, 'Restore subtype')
    : el('button', {
      class: 'btn btn-small', type: 'button', disabled: slots > 0,
      onclick: async () => {
        if (await confirmSheet({ title: `Archive “${sub.name}”?`, body: 'It disappears from pickers. History and items are kept, and you can restore it.', confirmLabel: 'Archive' })) {
          await app.setSubtypeArchived(sub.id, true);
          ctx.back('#/settings');
        }
      },
    }, 'Archive subtype');

  const root = page(ctx, { title: sub.name, parent: '#/settings' },
    section(null,
      el('div', { class: 'card' },
        items.length ? list : emptyState('No items yet', 'Blocks for this subtype will show its name until you add some.'),
        el('div', { class: 'add-row' }, addInput, el('button', { class: 'btn', type: 'button', 'aria-label': 'Add item', onclick: add }, icon('plus'))),
        el('div', { style: { padding: '0 12px 12px' } }, addHint),
      ),
      el('p', { class: 'section-note', style: { marginTop: '10px' }, text: 'Blocks rotate through items: whichever was completed longest ago comes up next. Tap an item to edit it or add a link.' }),
    ),
    archived.length ? section(`Archived (${archived.length})`,
      el('ol', { class: 'list card' }, archived.map((it) => el('li', {},
        el('div', { class: 'row' },
          el('span', { class: 'row-main' }, el('span', { class: 'row-title', text: it.text })),
          el('button', { class: 'btn btn-small', type: 'button', dataset: { key: `restore-${it.id}` }, onclick: () => app.setItemArchived(it.id, false) }, 'Restore'),
        )))),
    ) : null,
    section('Subtype',
      el('div', { class: 'card card-pad' },
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Name' }), nameInput),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Area' }), areaSelect),
        el('div', { class: 'field' }, archiveBtn,
          slots && !sub.archived ? el('p', { class: 'field-hint', text: `Used by ${slots} slot${slots === 1 ? '' : 's'}. Reassign them to archive this subtype.` }) : null),
      ),
    ),
  );
  return { root, title: sub.name };
}

function lengthHint(text, hintEl) {
  const n = text.trim().length;
  hintEl.hidden = n <= ITEM_SOFT_LIMIT - 5;
  hintEl.classList.toggle('warn', n > ITEM_SOFT_LIMIT);
  hintEl.textContent = n > ITEM_SOFT_LIMIT
    ? `${n}/${ITEM_SOFT_LIMIT}: may be cut off on the block. Shorter reads better.`
    : `${n}/${ITEM_SOFT_LIMIT}`;
}

function editItemSheet(app, item) {
  const text = el('input', { class: 'input', type: 'text', value: item.text, maxlength: '200', enterkeyhint: 'done' });
  const hint = el('p', { class: 'field-hint', hidden: true });
  text.addEventListener('input', () => lengthHint(text.value, hint));
  lengthHint(item.text, hint);
  const url = el('input', {
    class: 'input', type: 'url', value: item.url || '', placeholder: 'https://… (backing track, tab, video)',
    inputmode: 'url', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
  });
  const diagrams = diagramEditor(item.diagrams, () => text.value);
  text.addEventListener('change', () => diagrams.refresh());
  let sheet;
  const save = async () => {
    const value = text.value.trim();
    if (!value) return;
    sheet.close();
    await app.updateItem(item.id, { text: value, url: url.value, diagrams: diagrams.value() });
  };
  sheet = openSheet({
    title: 'Edit item',
    className: 'item-sheet',
    content: [
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'What to practise' }), text, hint),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Link (optional)' }), url),
      el('div', { class: 'field' }, diagrams.node),
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Save'),
      ),
      el('button', {
        class: 'text-btn', type: 'button',
        onclick: async () => {
          sheet.close();
          await app.setItemArchived(item.id, true);
          toast(`Archived “${item.text}”. History is kept.`);
        },
      }, 'Archive this item'),
    ],
  });
  text.addEventListener('keydown', (e) => e.key === 'Enter' && save());
}

// ------------------------------------------------------------------ areas & subtypes

export function areasView(app, ctx) {
  const areaList = el('ol', { class: 'list card' });
  for (const a of app.sortedAreas()) {
    const subs = app.subtypesOf(a.id).length;
    areaList.append(el('li', {}, el('div', { class: 'row' },
      swatch(a.color),
      el('button', {
        class: 'row-main row-link', type: 'button', dataset: { key: `area-${a.id}` }, 'aria-label': `Rename ${a.name}`,
        onclick: () => renameSheet('Rename area', a.name, (name) => app.renameArea(a.id, name)),
      }, el('span', { class: 'row-title', text: a.name }), el('span', { class: 'row-sub', text: `${subs} subtype${subs === 1 ? '' : 's'}` })),
      iconButton('close', `Delete ${a.name}`, async () => {
        const ok = await confirmSheet({
          title: `Delete “${a.name}”?`,
          body: 'Its subtypes and items stay, grouped under Other. Past sessions keep their history.',
          confirmLabel: 'Delete area', danger: true,
        });
        if (ok) app.deleteArea(a.id);
      }),
    )));
  }

  const newArea = el('input', { class: 'input', type: 'text', placeholder: 'New area, e.g. Ear Training', maxlength: '60', dataset: { key: 'new-area' }, enterkeyhint: 'done' });
  const addArea = async () => {
    if (!newArea.value.trim()) return;
    const a = await app.addArea(newArea.value);
    toast(`Added area “${a.name}”`);
  };
  newArea.addEventListener('keydown', (e) => e.key === 'Enter' && addArea());

  const newSub = el('input', { class: 'input', type: 'text', placeholder: 'New subtype name', maxlength: '60', dataset: { key: 'new-sub' } });
  const subArea = el('select', { class: 'input', 'aria-label': 'Area for new subtype' },
    app.sortedAreas().map((a) => el('option', { value: a.id }, a.name)),
    el('option', { value: '' }, 'None (Other)'));
  const addSub = async () => {
    if (!newSub.value.trim()) return;
    const s = await app.addSubtype(newSub.value, subArea.value);
    ctx.navigate(`#/settings/subtype/${encodeURIComponent(s.id)}`);
  };

  const root = page(ctx, { title: 'Areas and subtypes', parent: '#/settings' },
    section('Areas',
      areaList,
      el('div', { class: 'card add-row', style: { marginTop: '10px', borderTop: '1px solid var(--border)' } },
        newArea, el('button', { class: 'btn', type: 'button', 'aria-label': 'Add area', onclick: addArea }, icon('plus'))),
    ),
    section('New subtype',
      el('div', { class: 'card card-pad' },
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Name' }), newSub),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'Area' }), subArea),
        el('div', { class: 'field' }, el('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: addSub }, 'Add subtype')),
      ),
      el('p', { class: 'section-note', style: { marginTop: '10px' }, text: 'To use a new subtype, assign it to a slot under Practice slots.' }),
    ),
  );
  return { root, title: 'Areas and subtypes' };
}

function renameSheet(title, current, onSave) {
  const input = el('input', { class: 'input', type: 'text', value: current, maxlength: '60', enterkeyhint: 'done' });
  let sheet;
  const save = () => {
    const v = input.value.trim();
    sheet.close();
    if (v && v !== current) onSave(v);
  };
  sheet = openSheet({
    title,
    content: [
      input,
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Save'),
      ),
    ],
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  input.focus();
}

// ------------------------------------------------------------------ data

async function exportData(app) {
  const data = buildExport(app.snapshot());
  const json = JSON.stringify(data, null, 1);
  const name = `timebox-backup-${localDate()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  // On phones the share sheet ("Save to Files") is more reliable than a download.
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Timebox backup' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast(`Exported ${data.sessions.length} sessions`);
}

async function importFile(app, file) {
  const text = await file.text();
  const parsed = parseFile(text);
  if (parsed.errors.length) {
    let sheet;
    sheet = openSheet({
      title: 'Can’t import this file',
      content: [
        el('ul', {}, parsed.errors.map((e) => el('li', { text: e }))),
        el('p', { text: 'Nothing was changed.' }),
        el('div', { class: 'sheet-actions' }, el('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'OK')),
      ],
    });
    return;
  }
  const incoming = parsed.data;
  let mode = 'merge';
  const summary = el('ul', { class: 'import-summary' });
  const confirm = el('button', { class: 'btn btn-primary', type: 'button' });
  const modeGroup = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Import mode' });
  const modes = [['merge', 'Merge'], ['replace', 'Replace']];
  for (const [value, label] of modes) {
    modeGroup.append(el('button', { type: 'button', role: 'radio', class: 'seg', dataset: { mode: value }, onclick: () => { mode = value; render(); } }, label));
  }
  const explain = el('p');
  function render() {
    const plan = planImport(app.snapshot(), incoming, mode);
    summary.replaceChildren(...plan.lines.map((l) => el('li', { text: l })));
    for (const b of modeGroup.children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    explain.textContent = mode === 'merge'
      ? 'Adds anything in the file that isn’t on this device. Nothing here is overwritten.'
      : 'Deletes everything on this device and uses the file instead.';
    confirm.textContent = mode === 'merge' ? (plan.changes ? 'Merge' : 'Nothing to merge') : 'Replace everything';
    confirm.disabled = !plan.changes;
    confirm.className = `btn ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`;
    confirm.onclick = async () => {
      sheet.close();
      await app.replaceAll(plan.result);
      toast(mode === 'merge' ? 'Backup merged' : 'Data replaced from backup');
    };
  }
  const when = incoming.exported_at ? new Date(incoming.exported_at) : null;
  let sheet;
  render();
  sheet = openSheet({
    title: 'Import backup',
    content: [
      el('p', { text: `${file.name}${when && !Number.isNaN(when.getTime()) ? `, exported ${when.toLocaleString()}` : ''}: ${incoming.sessions.length} sessions, ${incoming.library.items.length} library items.` }),
      modeGroup,
      explain,
      summary,
      el('div', { class: 'sheet-actions' }, el('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Cancel'), confirm),
    ],
  });
}

async function resetDefaults(app) {
  const ok = await confirmSheet({
    title: 'Reset library to defaults?',
    body: [
      'Slots, areas, subtypes and library items go back to the starter set. Items you added will be gone from the library.',
      'Your session history and stats are kept. Consider exporting a backup first.',
    ],
    confirmLabel: 'Reset library',
    danger: true,
  });
  if (!ok) return;
  await app.resetLibrary();
  toast('Library reset to defaults');
}
