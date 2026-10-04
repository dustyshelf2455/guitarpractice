// Focus view: the block you are working on, full screen. It grows out of its
// tile and shrinks back into it. A big countdown ring is the main control:
// tap it (or the button below) to pause and resume.

import { el, svg, icon, fmtClock, setDigits } from '../util.js';
import { tileRemaining, sessionRemaining, completedCount, TILE_MS } from '../engine.js';
import { renderDiagrams } from '../diagrams.js';

const R = 46;

/** Sixty minute-style ticks inside the ring (only shown by some styles). */
function dialTicks() {
  const g = svg('g', { class: 'ring-ticks' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const r1 = major ? 39.2 : 40.8;
    const r2 = 42.4;
    g.append(svg('line', {
      class: major ? 'tick major' : 'tick',
      x1: (50 + r1 * Math.cos(a)).toFixed(2), y1: (50 + r1 * Math.sin(a)).toFixed(2),
      x2: (50 + r2 * Math.cos(a)).toFixed(2), y2: (50 + r2 * Math.sin(a)).toFixed(2),
    }));
  }
  return g;
}
const CIRCUMFERENCE = 2 * Math.PI * R;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * handlers: { collapse(), primary(), finish(), openMetronome(), edit() }
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
  const chips = el('div', { class: 'focus-chips' }, link, editBtn);
  // Your own notes for this item (tap to edit).
  const notes = el('button', { class: 'focus-notes', type: 'button', hidden: true, onclick: () => handlers.edit() });

  const ring = svg('circle', {
    class: 'ring-fg', cx: 50, cy: 50, r: R,
    'stroke-dasharray': CIRCUMFERENCE.toFixed(2), 'stroke-dashoffset': '0',
  });
  const time = el('span', { class: 'focus-time' });
  const state = el('span', { class: 'focus-state' });
  // The dial duplicates the labelled primary button as a big tap target, so it
  // stays out of the accessibility tree and the tab order.
  const dial = el('button', { class: 'focus-dial', type: 'button', tabindex: '-1', 'aria-hidden': 'true', onclick: handlers.primary },
    svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
      dialTicks(),
      svg('circle', { class: 'ring-bg', cx: 50, cy: 50, r: R }),
      ring),
    el('span', { class: 'focus-readout' }, time, state),
  );
  const timer = el('div', { class: 'focus-timer', role: 'timer', 'aria-live': 'off' }, dial);

  // Scale shapes and chord charts for the item (see js/diagrams.js).
  const details = el('div', { class: 'focus-details', hidden: true });
  let detailsKey = '';

  const primary = el('button', { class: 'btn btn-primary focus-primary', type: 'button', onclick: handlers.primary });
  const finish = el('button', { class: 'btn focus-finish', type: 'button', onclick: handlers.finish }, icon('check'), 'Finish');
  const actions = el('div', { class: 'focus-actions' }, primary, finish);

  // Layout: header; the exercise and its diagrams fill the middle; a compact
  // dock at the bottom holds the dial and the buttons, within thumb reach.
  const inner = el('div', { class: 'focus-inner' },
    head,
    el('div', { class: 'focus-body' },
      el('div', { class: 'focus-hero' }, meta, title, chips),
      details,
      notes),
    el('div', { class: 'focus-dock' }, timer, actions),
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
    root.hidden = false;
    root.style.pointerEvents = '';
    ring.classList.add('no-anim');
    requestAnimationFrame(() => ring.classList.remove('no-anim'));
    if (fromRect && fromRect.width && !reducedMotion()) {
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

  function setRing(t, now) {
    const elapsed = TILE_MS - tileRemaining(t, now);
    ring.setAttribute('stroke-dashoffset', ((elapsed / TILE_MS) * CIRCUMFERENCE).toFixed(2));
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

  /** `item` is the library item behind the block (null for an empty slot). */
  function update(t, session, color, areaName, now, item) {
    if (!t) return;
    setDetails(item ? item.diagrams : [], t.item_text);
    const noteText = item && item.notes ? item.notes : '';
    if (notes.textContent !== noteText) notes.textContent = noteText;
    notes.hidden = !noteText;
    notes.setAttribute('aria-label', `Your notes: ${noteText}. Tap to edit.`);
    editBtn.hidden = !item;
    editText.textContent = noteText ? 'Edit' : 'Add notes';
    root.classList.toggle('has-notes', !!noteText);
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
    setRing(t, now);

    const label = {
      idle: ['play', 'Start'],
      running: ['pause', 'Pause'],
      paused: ['play', 'Resume'],
      timeup: ['check', 'Finish and rate'],
      completed: ['check', 'Done'],
    }[t.state];
    primary.replaceChildren(icon(label[0]), label[1]);
    primary.disabled = t.state === 'completed';
    finish.hidden = !(t.state === 'paused' && TILE_MS - remaining >= 1000);
    timer.setAttribute('aria-label', `${fmtClock(remaining)} left${state.textContent ? `, ${state.textContent}` : ''}`);

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
    setRing(t, now);
    if (session) sessionInfo.textContent = `${fmtClock(sessionRemaining(session, now))} left · ${completedCount(session)} of ${session.tiles.length}`;
  }

  return { root, show, hide, update, tick, details };
}
