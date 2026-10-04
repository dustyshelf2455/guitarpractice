// Bottom sheets built on <dialog>: rating, confirm, and a generic container.

import { el, icon, fmtDuration, fmtClock } from '../util.js';

/**
 * Open a modal bottom sheet. Tapping the backdrop or pressing Escape dismisses it.
 * Returns { dialog, body, close(value) }; onClose(value) runs once when it closes
 * (value is undefined when dismissed).
 */
export function openSheet({ title, label, className = '', onClose, content = [] }) {
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = el('div', { class: 'sheet-body' }, content);
  const dialog = el('dialog', {
    class: `sheet ${className}`.trim(),
    'aria-labelledby': title ? titleId : null,
    'aria-label': title ? null : label,
  },
  el('div', { class: 'sheet-panel' },
    el('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    title ? el('h2', { class: 'sheet-title', id: titleId, text: title }) : null,
    body,
  ));
  let result;
  let closed = false;
  const close = (value) => {
    if (closed) return;
    result = value;
    dialog.close();
  };
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(undefined); // backdrop
  });
  dialog.addEventListener('close', () => {
    if (closed) return;
    closed = true;
    dialog.remove();
    if (onClose) onClose(result);
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, close };
}

const RATING_WORDS = ['', 'Rough', 'Shaky', 'OK', 'Good', 'Nailed it'];

/**
 * Star rating sheet. onRate(n) on a star; onDismiss() if closed without choosing.
 * With `reopen` ({ remainingMs, onReopen(restart) }) it also offers to continue
 * the block or do it over, for a block finished by mistake. With `lock`
 * ({ locked, onToggle(next) }) it offers to lock the block to the board.
 */
export function ratingSheet({ tile, onRate, onDismiss, reopen, lock }) {
  const current = tile.rating;
  const meta = [tile.subtype_name, tile.area_name].filter(Boolean).join(' · ');
  const caption = el('div', { class: 'stars-scale', 'aria-hidden': 'true' },
    el('span', { text: RATING_WORDS[1] }), el('span', { text: RATING_WORDS[5] }));
  const stars = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Rating, 1 to 5 stars' });
  let sheet;
  for (let n = 1; n <= 5; n++) {
    const btn = el('button', {
      class: `star${current && n <= current ? ' on' : ''}`,
      type: 'button',
      role: 'radio',
      'aria-checked': String(current === n),
      'aria-label': `${n} star${n > 1 ? 's' : ''}, ${RATING_WORDS[n]}`,
      onclick: () => sheet.close(n),
      onpointerenter: (e) => e.pointerType === 'mouse' && preview(n),
      onpointerleave: () => preview(current || 0),
    }, icon('star'));
    stars.append(btn);
  }
  function preview(n) {
    [...stars.children].forEach((b, i) => b.classList.toggle('on', i < n));
  }
  let lockBtn = null;
  if (lock) {
    let locked = lock.locked;
    const paint = () => {
      lockBtn.replaceChildren(icon(locked ? 'lock' : 'unlock'), locked ? 'Locked to your board · Unlock' : 'Lock it to your board');
      lockBtn.setAttribute('aria-pressed', String(locked));
    };
    lockBtn = el('button', {
      class: 'btn btn-small rating-lock', type: 'button',
      onclick: async () => {
        locked = !locked;
        paint();
        await lock.onToggle(locked);
      },
    });
    paint();
  }
  sheet = openSheet({
    title: current ? 'Change rating' : 'How did it go?',
    className: 'rating-sheet',
    content: [
      el('p', { class: 'rating-item', text: tile.item_text }),
      el('p', { class: 'rating-meta', text: `${meta}${meta ? ' · ' : ''}${fmtDuration(tile.elapsed_seconds)}` }),
      stars,
      caption,
      el('button', {
        class: 'text-btn rating-skip',
        type: 'button',
        text: current ? 'Keep current rating' : 'Skip rating',
        onclick: () => sheet.close(undefined),
      }),
      lockBtn ? el('div', { class: 'rating-lock-row' },
        lockBtn,
        el('p', { class: 'field-hint', text: 'A locked block keeps this item every day until you unlock it.' })) : null,
      reopen ? el('div', { class: 'reopen' },
        el('p', { class: 'reopen-label', text: 'Not finished after all?' }),
        el('div', { class: 'reopen-actions' },
          reopen.remainingMs >= 1000 ? el('button', {
            class: 'btn btn-small', type: 'button', onclick: () => sheet.close('continue'),
          }, icon('play'), `Continue · ${fmtClock(reopen.remainingMs)} left`) : null,
          el('button', { class: 'btn btn-small', type: 'button', onclick: () => sheet.close('restart') }, icon('restart'), 'Do it over'),
        )) : null,
    ],
    onClose: (value) => {
      if (value === 'continue' || value === 'restart') reopen.onReopen(value === 'restart');
      else if (value) onRate(value);
      else if (onDismiss) onDismiss();
    },
  });
  if (current) stars.children[current - 1].focus({ preventScroll: true });
  return sheet;
}

/** Resolves true if confirmed. */
export function confirmSheet({ title, body, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let sheet;
    const confirm = el('button', {
      class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
      type: 'button',
      text: confirmLabel,
      onclick: () => sheet.close(true),
    });
    sheet = openSheet({
      title,
      className: 'confirm-sheet',
      content: [
        ...(Array.isArray(body) ? body : [body]).map((b) => (typeof b === 'string' ? el('p', { text: b }) : b)),
        el('div', { class: 'sheet-actions' },
          el('button', { class: 'btn', type: 'button', text: cancelLabel, onclick: () => sheet.close(false) }),
          confirm,
        ),
      ],
      onClose: (v) => resolve(v === true),
    });
    confirm.focus({ preventScroll: true });
  });
}

/** Brief, non-blocking message at the bottom of the screen. */
export function toast(message) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = el('div', { class: 'toast', text: message });
  host.append(t);
  setTimeout(() => t.remove(), 3200);
}

export function iconButton(name, label, onclick, cls = '', props = {}) {
  return el('button', { class: `icon-btn ${cls}`.trim(), type: 'button', 'aria-label': label, title: label, onclick, ...props }, icon(name));
}
