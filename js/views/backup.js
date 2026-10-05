// Backing up and restoring: save everything to a file (the share sheet on a
// phone, so it can go to iCloud Drive), restore from one, and the reminder
// that shows on the board when a backup is due.

import { el, icon, localDate } from '../util.js';
import { buildExport, parseFile, planImport } from '../transfer.js';
import { openSheet, toast } from './sheets.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Save a backup file. Returns true when it was saved (not cancelled). */
export async function exportData(app) {
  const now = app.clock();
  const data = buildExport(app.snapshot(), now);
  const json = JSON.stringify(data, null, 1);
  const name = `timebox-backup-${localDate(now)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  // On phones the share sheet ("Save to Files") is more reliable than a download.
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Timebox backup' });
        await app.markBackedUp(now);
        toast('Backup saved');
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await app.markBackedUp(now);
  toast(`Backed up ${plural(data.sessions.length, 'session')}`);
  return true;
}

/** A hidden file picker that restores the chosen backup. Click it to choose. */
export function restoreInput(app) {
  return el('input', {
    type: 'file', accept: 'application/json,.json', hidden: true, dataset: { key: 'restore-file' },
    onchange: (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importFile(app, file);
    },
  });
}

export async function importFile(app, file) {
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
  const when = incoming.exported_at ? new Date(incoming.exported_at) : null;
  const fileTime = when && !Number.isNaN(when.getTime()) ? when.getTime() : null;
  // A fresh install has nothing worth merging into: replacing is what restores it.
  let mode = app.looksNew ? 'replace' : 'merge';
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
      // The file is a backup of what it holds: after a replace (or on a device that
      // had never been backed up) nothing is owed until something changes.
      const backup = (mode === 'replace' || app.backup.at == null) && fileTime != null
        ? { at: fileTime, edits: 0 }
        : app.backup;
      await app.replaceAll(plan.result, backup);
      toast(mode === 'merge' ? 'Backup merged' : 'Restored from backup');
    };
  }
  let sheet;
  render();
  sheet = openSheet({
    title: 'Restore from a backup',
    content: [
      el('p', { text: `${file.name}${fileTime != null ? `, saved ${when.toLocaleString()}` : ''}: ${plural(incoming.sessions.length, 'session')}, ${plural(incoming.library.items.length, 'library item')}.` }),
      modeGroup,
      explain,
      summary,
      el('div', { class: 'sheet-actions' }, el('button', { class: 'btn', type: 'button', onclick: () => sheet.close() }, 'Cancel'), confirm),
    ],
  });
}

/** "Last backed up 3 days ago" and the like, for Settings. */
export function backupSummary(app) {
  const st = app.backupStatus();
  if (st.at == null) return 'Not backed up yet.';
  const ago = st.days === 0 ? 'today' : st.days === 1 ? 'yesterday' : `${st.days} days ago`;
  const owed = [st.sessions ? plural(st.sessions, 'session') : null, st.edits ? plural(st.edits, 'library change') : null].filter(Boolean);
  return `Last backed up ${ago}.${owed.length ? ` Since then: ${owed.join(', ')}.` : ' Nothing has changed since.'}`;
}

/**
 * The line under the board's header: a nudge to back up when one is due, or,
 * on a fresh install, a way to bring a backup back. Hidden otherwise.
 */
export function backupBeacon(app) {
  const label = el('span', { class: 'beacon-label' });
  const input = restoreInput(app);
  let kind = null;
  const btn = el('button', {
    class: 'beacon', type: 'button', dataset: { key: 'beacon' },
    onclick: () => (kind === 'restore' ? input.click() : exportData(app)),
  }, icon('save'), label);
  const root = el('div', { class: 'beacon-row' }, btn, input);
  function update() {
    const st = app.backupStatus();
    kind = app.active ? null : st.due ? 'backup' : app.looksNew && st.edits === 0 ? 'restore' : null;
    root.hidden = !kind;
    root.dataset.kind = kind || '';
    if (kind === 'restore') {
      label.textContent = 'Restore a backup';
      btn.setAttribute('aria-label', 'Reinstalled? Restore your data from a backup file');
    } else if (kind === 'backup') {
      const what = [st.sessions ? plural(st.sessions, 'session') : null, st.edits ? plural(st.edits, 'change') : null].filter(Boolean).join(', ');
      label.textContent = `Back up · ${what}`;
      btn.setAttribute('aria-label', `Back up now: ${what} ${st.at == null ? 'not backed up yet' : `since your last backup ${st.days >= 2 ? `${st.days} days ago` : ''}`}`.trim());
    }
  }
  return { root, update };
}
