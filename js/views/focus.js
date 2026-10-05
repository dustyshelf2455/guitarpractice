// Focus view: the block you are working on, full screen. It grows out of its
// tile and shrinks back into it. The exercise and its diagram get the screen;
// a slim strip at the bottom holds the countdown (tap it to pause or resume),
// a thin progress line, and the buttons.

import { el, icon, fmtClock, setDigits } from '../util.js';
import { tileRemaining, sessionRemaining, completedCount, TILE_MS } from '../engine.js';
import { renderDiagrams } from '../diagrams.js';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * handlers: { collapse(), primary(), finish(), reroll(), lock(), openMetronome(), edit() }
 * Returns { root, show(fromRect, fromBg), hide(toRect, toBg), update(tile, session, now), tick(tile, session, now) }
 */
export function createFocus(handlers) {
  const sessionInfo = el('span', { class: 'focus-session' });
  const head = el('header', { class: 'focus-head' },
    el('button', { class: 'focus-back', type: 'button', onclick: handlers.collapse },
      icon('down'), el('span', { text: 'All blocks' })),
    sessionInfo,
    el('button', { class: 'focus-metro', type: 'button', 'aria-label': 'Metronome', title: 'Metronome', onclick: handlers.openMetronome },
      icon('metronome'), el('span', { class: 'focus-metro-bpm' })),
  );

  const area = el('span', { class: 'focus-area' });
  const sub = el('span', { class: 'focus-sub' });
  const meta = el('div', { class: 'focus-meta' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), area, sub);
  const title = el('h2', { class: 'focus-title', id: 'focus-title' });
  const linkText = el('span');
  const link = el('a', { class: 'chip focus-link', target: '_blank', rel: 'noopener noreferrer' }, icon('link'), linkText);
  const editText = el('span');
  const editBtn = el('button', { class: 'chip focus-edit', type: 'button', onclick: () => handlers.edit() }, icon('edit'), editText);
  // Lock: this slot keeps this item every day until unlocked.
  const lockText = el('span');
  const lockIcon = el('span', { class: 'lock-icon' });
  const lockBtn = el('button', { class: 'chip focus-lock', type: 'button', onclick: () => handlers.lock() }, lockIcon, lockText);
  const chips = el('div', { class: 'focus-chips' }, link, editBtn, lockBtn);
  // Your own notes for this item (tap to edit).
  const notes = el('button', { class: 'focus-notes', type: 'button', hidden: true, onclick: () => handlers.edit() });

  // Progress: a thin line along the top of the strip, filling as the block runs.
  const fill = el('span', { class: 'focus-track-fill' });
  const track = el('span', { class: 'focus-track', 'aria-hidden': 'true' }, fill);
  const time = el('span', { class: 'focus-time' });
  const state = el('span', { class: 'focus-state' });
  // The clock duplicates the labelled primary button as a big tap target, so it
  // stays out of the accessibility tree and the tab order.
  const clock = el('button', { class: 'focus-clock', type: 'button', tabindex: '-1', 'aria-hidden': 'true', onclick: handlers.primary },
    time, state);
  const timer = el('div', { class: 'focus-timer', role: 'timer', 'aria-live': 'off' }, clock);

  // Scale shapes and chord charts for the item (see js/diagrams.js).
  const details = el('div', { class: 'focus-details', hidden: true });
  let detailsKey = '';

  const primary = el('button', { class: 'btn btn-primary focus-primary', type: 'button', onclick: handlers.primary });
  const finish = el('button', { class: 'btn focus-finish', type: 'button', onclick: handlers.finish }, icon('check'), el('span', { class: 'btn-label' }, 'Finish'));
  // Before it starts: not in the mood for this one? Another from the same list.
  const reroll = el('button', { class: 'btn focus-reroll', type: 'button', onclick: handlers.reroll }, icon('dice'), el('span', { class: 'btn-label' }, 'Re-roll'));
  const actions = el('div', { class: 'focus-actions' }, primary, finish, reroll);
  // When the labels don't all fit beside the clock, the secondary button drops
  // to just its icon rather than cutting a word short.
  function fitActions() {
    if (root.hidden) return;
    actions.classList.remove('is-compact');
    const cut = [...actions.querySelectorAll('.btn-label')].some((l) => l.offsetParent && l.scrollWidth > l.clientWidth + 0.5);
    actions.classList.toggle('is-compact', cut);
  }
  if (globalThis.ResizeObserver) new ResizeObserver(fitActions).observe(actions);

  // Layout: header; the exercise and its diagrams fill the middle; a compact
  // strip at the bottom holds the clock and the buttons, within thumb reach.
  const inner = el('div', { class: 'focus-inner' },
    head,
    el('div', { class: 'focus-body' },
      el('div', { class: 'focus-hero' }, meta, title, chips),
      details,
      notes),
    el('div', { class: 'focus-dock' }, track, timer, actions),
  );
  const root = el('section', { class: 'focus', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'focus-title', hidden: true }, inner);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handlers.collapse();
    }
  });

  let anim = null;
  const insetOf = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 14px)`;
  const FULL = 'inset(0px 0px 0px 0px round 0px)';

  function show(fromRect, fromBg) {
    if (anim) anim.cancel();
    const wasOpen = !root.hidden;
    root.hidden = false;
    root.style.pointerEvents = '';
    fill.classList.add('no-anim');
    requestAnimationFrame(() => fill.classList.remove('no-anim'));
    if (wasOpen) {
      // Already open on another block: it slides in where the last one was.
      inner.getAnimations().forEach((a) => a.cancel());
      if (!reducedMotion()) {
        inner.animate([{ opacity: 0, transform: 'translateX(2.5rem)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, easing: 'cubic-bezier(0.2, 0.75, 0.2, 1)' });
      }
    } else if (fromRect && fromRect.width && !reducedMotion()) {
      const pageBg = getComputedStyle(root).backgroundColor;
      anim = root.animate(
        [{ clipPath: insetOf(fromRect), backgroundColor: fromBg || pageBg }, { clipPath: FULL, backgroundColor: pageBg }],
        { duration: 280, easing: 'cubic-bezier(0.2, 0.75, 0.2, 1)' },
      );
      inner.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, delay: 70, easing: 'ease-out', fill: 'backwards' });
    }
    primary.focus({ preventScroll: true });
  }

  function hide(toRect, toBg) {
    if (root.hidden) return;
    if (anim) anim.cancel();
    // Never block taps on the grid while shrinking.
    root.style.pointerEvents = 'none';
    if (toRect && toRect.width && !reducedMotion()) {
      const pageBg = getComputedStyle(root).backgroundColor;
      inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      anim = root.animate(
        [{ clipPath: FULL, backgroundColor: pageBg }, { clipPath: insetOf(toRect), backgroundColor: toBg || pageBg }],
        { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
      );
      anim.onfinish = () => {
        root.hidden = true;
        root.style.pointerEvents = '';
        inner.getAnimations().forEach((a) => a.cancel());
        anim = null;
      };
    } else {
      root.hidden = true;
      root.style.pointerEvents = '';
    }
  }

  function setProgress(t, now) {
    const elapsed = t.state === 'completed' ? TILE_MS : TILE_MS - tileRemaining(t, now);
    fill.style.transform = `scaleX(${(elapsed / TILE_MS).toFixed(4)})`;
  }

  function setDetails(diagrams, itemText) {
    const key = JSON.stringify([diagrams || [], itemText]);
    if (key === detailsKey) return;
    detailsKey = key;
    const nodes = renderDiagrams(diagrams, itemText, { upright: true });
    details.replaceChildren(...(nodes || []));
    details.hidden = !nodes;
    details.classList.toggle('multi', !!nodes && nodes.length > 1);
    root.classList.toggle('has-details', !!nodes);
  }

  /**
   * `item` is the library item behind the block (null for an empty slot);
   * `opts`: { canReroll, locked, canLock }.
   */
  function update(t, session, color, areaName, now, item, opts = {}) {
    if (!t) return;
    setDetails(item ? item.diagrams : [], t.item_text);
    const noteText = item && item.notes ? item.notes : '';
    if (notes.textContent !== noteText) notes.textContent = noteText;
    notes.hidden = !noteText;
    notes.setAttribute('aria-label', `Your notes: ${noteText}. Tap to edit.`);
    editBtn.hidden = !item;
    editText.textContent = noteText ? 'Edit' : 'Add notes';
    root.classList.toggle('has-notes', !!noteText);
    lockBtn.hidden = !opts.locked && !opts.canLock;
    if (lockBtn.dataset.locked !== String(!!opts.locked)) {
      lockBtn.dataset.locked = String(!!opts.locked);
      lockIcon.replaceChildren(icon(opts.locked ? 'lock' : 'unlock'));
      lockText.textContent = opts.locked ? 'Locked' : 'Lock';
      lockBtn.setAttribute('aria-pressed', String(!!opts.locked));
      lockBtn.setAttribute('aria-label', opts.locked
        ? 'Locked: this block keeps this item every day. Tap to unlock.'
        : 'Lock: keep this item in this block every day until you unlock it');
    }
    root.classList.toggle('is-locked', !!opts.locked);
    reroll.hidden = !(t.state === 'idle' && opts.canReroll);
    root.dataset.state = t.state;
    root.dataset.color = color == null ? 'none' : String(color);
    area.textContent = areaName;
    sub.textContent = t.subtype_name ? `· ${t.subtype_name}` : '';
    title.textContent = t.item_text;

    const url = item ? item.url : t.url;
    link.hidden = !url;
    if (url) {
      link.href = url;
      let host = 'Open link';
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        /* keep default */
      }
      linkText.textContent = host;
      link.setAttribute('aria-label', `Open link: ${host}`);
    }

    const remaining = tileRemaining(t, now);
    setDigits(time, t.state === 'completed' ? fmtClock(t.elapsed_seconds * 1000) : fmtClock(remaining));
    state.textContent = { idle: 'Ready', running: '', paused: 'Paused', timeup: "Time's up", completed: 'Done' }[t.state] || '';
    setProgress(t, now);

    const label = {
      idle: ['play', 'Begin'],
      running: ['pause', 'Pause'],
      paused: ['play', 'Resume'],
      timeup: ['check', 'Finish and rate'],
      completed: ['check', 'Done'],
    }[t.state];
    primary.replaceChildren(icon(label[0]), el('span', { class: 'btn-label' }, label[1]));
    primary.disabled = t.state === 'completed';
    finish.hidden = !(t.state === 'paused' && TILE_MS - remaining >= 1000);
    fitActions();
    timer.setAttribute('aria-label', `${fmtClock(remaining)} left${state.textContent ? `, ${state.textContent}` : ''}`);

    sessionInfo.hidden = !session; // nothing to show before the session starts
    if (session) {
      const done = completedCount(session);
      const left = session.status === 'active' ? `${fmtClock(sessionRemaining(session, now))} left · ` : '';
      sessionInfo.textContent = `${left}${done} of ${session.tiles.length}`;
    }
  }

  /** Once a second while running: only the moving parts. */
  function tick(t, session, now) {
    if (!t || t.state !== 'running') return;
    setDigits(time, fmtClock(tileRemaining(t, now)));
    setProgress(t, now);
    if (session) sessionInfo.textContent = `${fmtClock(sessionRemaining(session, now))} left · ${completedCount(session)} of ${session.tiles.length}`;
  }

  return { root, show, hide, update, tick, details };
}
