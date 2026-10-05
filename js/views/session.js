// Session screen: session clock, 3x4 grid of blocks, bottom toolbar, and the
// full-screen focus view for the block being practised (route #/block/N).
// Tile DOM nodes are created once and updated in place, so the clock refresh
// is cheap and keyboard/screen-reader focus is never lost.

import { el, icon, fmtClock, fmtDuration, fmtDate, mean, setDigits } from '../util.js';
import { tileRemaining, sessionRemaining, masterState, completedCount, TILE_MS } from '../engine.js';
import { ratingSheet, confirmSheet, iconButton } from './sheets.js';
import { createFocus } from './focus.js';
import { editItemSheet } from './settings.js';

const STATE_LABEL = {
  idle: 'Not started',
  running: 'Running',
  paused: 'Paused',
  timeup: "Time's up",
  completed: 'Done',
};

export function sessionView(app, ctx) {
  const { navigate, openMetronome, announce } = ctx;
  const clock = el('div', { class: 'clock', role: 'timer', 'aria-label': 'Session time remaining' });
  const headSub = el('div', { class: 'head-sub' });
  const masterBtn = el('button', { class: 'master-btn', type: 'button', onclick: onMaster });
  const progressFill = el('span', { class: 'progress-fill' });
  const progress = el('div', {
    class: 'progress',
    role: 'progressbar',
    'aria-label': 'Blocks completed',
    'aria-valuemin': '0',
    'aria-valuemax': '12',
  }, progressFill);
  const progressLabel = el('span', { class: 'progress-label' });
  const doneSummary = el('div', { class: 'done-summary' });
  const progressRow = el('div', { class: 'progress-row' }, progress, progressLabel);

  const head = el('header', { class: 'session-head' },
    el('div', { class: 'head-row' }, el('div', { class: 'clock-wrap' }, clock, doneSummary), masterBtn),
    progressRow,
    headSub,
  );

  const grid = el('ol', { class: 'grid', 'aria-label': 'Practice blocks' });
  const tiles = [];
  for (let i = 0; i < 12; i++) {
    const t = makeTile(i);
    tiles.push(t);
    grid.append(t.li);
  }

  const metroBtn = el('button', { class: 'bar-btn metro-btn', type: 'button', onclick: () => openMetronome() },
    icon('metronome'), el('span', { class: 'metro-label', text: 'Metronome' }));
  const endBtn = el('button', { class: 'bar-btn end-btn', type: 'button', onclick: onEnd }, icon('flag'), el('span', { text: 'End' }));
  const bar = el('nav', { class: 'session-bar', 'aria-label': 'Session tools' },
    metroBtn,
    endBtn,
    el('span', { class: 'bar-spacer' }),
    iconButton('stats', 'Stats', () => navigate('#/stats'), 'bar-icon'),
    iconButton('settings', 'Settings', () => navigate('#/settings'), 'bar-icon'),
  );

  const focus = createFocus({
    collapse: () => ctx.back('#/'),
    primary: onFocusPrimary,
    finish: () => onFinish(focusIndex),
    reroll: () => focusIndex != null && onSwap(focusIndex),
    lock: async () => {
      const i = focusIndex;
      if (i == null) return;
      const next = !app.isLocked(i);
      if (await app.setLocked(i, next)) announce(next ? 'Locked to your board' : 'Unlocked');
    },
    openMetronome: () => openMetronome(),
    edit: () => {
      const t = focusIndex != null ? app.boardTiles()[focusIndex] : null;
      const item = t && t.item_id ? app.item(t.item_id) : null;
      if (item) editItemSheet(app, item, { fromBlock: true });
    },
  });
  let focusIndex = null;
  let origin = null; // tile rect captured at tap time, for the grow animation

  const root = el('div', { class: 'screen session-screen' }, head, grid, bar, focus.root);

  // List layout: six rows fill the space between header and toolbar; the rest scroll.
  function sizeRows() {
    if (app.settings.layout !== 'list') {
      grid.style.removeProperty('--row-h');
      return;
    }
    const cs = getComputedStyle(grid);
    const h = grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.rowGap) || 8;
    if (h > 0) grid.style.setProperty('--row-h', `${Math.floor((h - gap * 5) / 6)}px`);
  }
  if (globalThis.ResizeObserver) new ResizeObserver(sizeRows).observe(grid);

  function makeTile(i) {
    // One label line: the area's colour as a dot, then the subtype (the area's
    // name joins it in the list layout, where there is room).
    const sub = el('span', { class: 'tile-sub' });
    const area = el('span', { class: 'tile-area' });
    const text = el('span', { class: 'tile-text' });
    const hint = el('span', { class: 'tile-hint', text: 'Add items in Settings' });
    const time = el('span', { class: 'tile-time' });
    const status = el('span', { class: 'tile-status' });
    const lockMark = icon('lock', 'tile-lock');
    lockMark.hidden = true;
    const main = el('button', { class: 'tile-main', type: 'button', onclick: () => onTap(i) },
      el('span', { class: 'tile-meta' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), sub, area, lockMark),
      text, hint,
      el('span', { class: 'tile-foot' }, time, status),
    );
    const swap = el('button', {
      class: 'tile-action tile-swap',
      type: 'button',
      'aria-label': 'Re-roll: another item from the same list',
      title: 'Re-roll',
      onclick: () => onSwap(i),
    }, icon('dice'));
    const finish = el('button', { class: 'tile-finish', type: 'button', onclick: () => onFinish(i) }, 'Finish');
    const link = el('a', { class: 'tile-link', target: '_blank', rel: 'noopener noreferrer' }, icon('link'));
    const li = el('li', { class: 'tile' }, main, swap, finish, link);
    return { li, main, area, sub, text, hint, time, status, swap, finish, link, lockMark };
  }

  // ---- actions ----

  async function onTap(i) {
    // A block opens full screen; nothing starts until Begin (or Resume) is tapped there.
    const t = app.boardTiles()[i];
    if (!t) return;
    if (app.mode !== 'done' && ['idle', 'paused', 'running'].includes(t.state)) {
      openFocus(i);
      return;
    }
    const r = await app.tapTile(i); // time's up: complete and rate; done: rate
    if (r.action === 'completed' || r.action === 'rate') rate(r.session, r.index);
  }

  async function onFinish(i) {
    if (i == null) return;
    const r = await app.completeTile(i);
    if (r.action === 'completed') rate(r.session, r.index);
  }

  /**
   * Rate a block. Rated from its full-screen view, it shrinks back to the grid
   * so you pick what's next. The sheet also offers to reopen the block
   * (continue, or do it over).
   */
  function rate(session, index) {
    const tile = session.tiles[index];
    const fromFocus = focusIndex === index;
    const done = () => {
      if (fromFocus && focusIndex === index) ctx.back('#/');
      else tiles[index].main.focus({ preventScroll: true });
    };
    const reopen = app.canReopen(session.id, index) ? {
      remainingMs: TILE_MS - tile.elapsed_seconds * 1000,
      onReopen: async (restart) => {
        ctx.refreshAudio?.();
        if (await app.reopenTile(session.id, index, { restart }) && focusIndex !== index) openFocus(index);
      },
    } : null;
    // Lock it to its slot (the board of the session in view only).
    const onBoard = session === app.boardSession();
    const lock = onBoard && (app.isLocked(index) || app.canLock(index)) ? {
      locked: app.isLocked(index),
      onToggle: async (next) => {
        await app.setLocked(index, next);
        announce(next ? `Locked: ${tile.item_text} stays on your board` : 'Unlocked');
      },
    } : null;
    ratingSheet({
      tile,
      reopen,
      lock,
      onRate: async (n) => {
        await app.rateTile(session.id, index, n);
        done();
      },
      onDismiss: done,
    });
  }

  function openFocus(i) {
    const li = tiles[i].li;
    origin = { rect: li.getBoundingClientRect(), bg: getComputedStyle(li).backgroundColor };
    navigate(`#/block/${i}`);
  }

  async function onFocusPrimary() {
    const i = focusIndex;
    if (i == null || app.mode === 'done') return;
    const st = app.boardTiles()[i]?.state;
    if (st === 'idle' || st === 'paused') ctx.refreshAudio?.(); // inside the tap, for iOS audio
    const r = await app.tapTile(i); // begin / pause / resume, or complete when time is up
    if (r.action === 'completed') rate(r.session, r.index);
    else if (r.action === 'paused') announce('Paused');
  }

  /** Show the focus view for block i, or the grid when i is null (driven by the route). */
  function setFocus(i) {
    if (i != null) {
      const t = app.mode === 'done' ? null : app.boardTiles()[i];
      if (!t || t.state === 'completed') {
        if (focusIndex == null) ctx.replace('#/');
        return;
      }
    }
    if (i === focusIndex) return;
    const prev = focusIndex;
    focusIndex = i;
    for (const part of [head, grid, bar]) part.inert = i != null;
    if (i != null) {
      update();
      const from = origin || (root.isConnected ? { rect: tiles[i].li.getBoundingClientRect(), bg: null } : null);
      focus.show(from && from.rect, from && from.bg);
      origin = null;
    } else {
      update();
      const li = prev != null ? tiles[prev].li : null;
      focus.hide(li && li.getBoundingClientRect(), li && getComputedStyle(li).backgroundColor);
      if (li) tiles[prev].main.focus({ preventScroll: true });
    }
  }

  async function onSwap(i) {
    if (await app.swap(i)) announce(`Re-rolled: ${app.boardTiles()[i].item_text}`);
  }

  async function onMaster() {
    if (app.mode === 'done') {
      await app.newSession();
      return;
    }
    if (app.active && masterState(app.active) === 'paused') ctx.refreshAudio?.(); // inside the tap, for iOS audio
    const state = await app.masterToggle();
    if (state === 'paused') announce('Paused');
    else if (state === 'running') openFocus(app.active.running);
  }

  async function onEnd() {
    const s = app.active;
    if (!s) return;
    const done = completedCount(s);
    const ok = await confirmSheet({
      title: 'End this session?',
      body: done
        ? `${done} of ${s.tiles.length} blocks done. It will be saved as a partial session.`
        : 'No blocks are completed yet, so this session will be discarded.',
      confirmLabel: done ? 'End and save' : 'Discard session',
      cancelLabel: 'Keep practising',
      danger: !done,
    });
    if (ok) await app.endSession();
  }

  // ---- rendering ----

  function update(now = app.clock()) {
    const mode = app.mode;
    const session = app.boardSession();
    const board = app.boardTiles();
    root.dataset.mode = mode;
    const list = app.settings.layout === 'list';
    if (root.classList.contains('layout-list') !== list) {
      root.classList.toggle('layout-list', list);
      requestAnimationFrame(sizeRows);
    }

    // Header
    const done = session ? completedCount(session) : 0;
    const total = board.length || 12;
    progress.setAttribute('aria-valuenow', String(done));
    progressFill.style.transform = `scaleX(${done / total})`;
    progressLabel.textContent = `${done} of ${total}`;

    if (mode === 'done') {
      clock.hidden = true;
      doneSummary.hidden = false;
      const avg = mean(session.tiles.map((t) => t.rating));
      doneSummary.replaceChildren(
        el('div', { class: 'done-title', text: session.status === 'complete' ? 'Session complete' : 'Session saved' }),
        el('div', { class: 'done-detail', text: [
          fmtDuration(session.total_active_seconds),
          avg != null ? `★ ${avg.toFixed(1)}` : null,
          session.status === 'partial' ? 'partial' : null,
        ].filter(Boolean).join(' · ') }),
      );
      masterBtn.hidden = false;
      masterBtn.className = 'master-btn';
      masterBtn.replaceChildren(icon('plus'), el('span', { text: 'New' }));
      masterBtn.setAttribute('aria-label', 'Start a new session');
      headSub.textContent = 'Tap a finished block to change its rating';
    } else {
      clock.hidden = false;
      doneSummary.hidden = true;
      const remaining = session ? sessionRemaining(session, now) : total * TILE_MS;
      setDigits(clock, fmtClock(remaining));
      const ms = session ? masterState(session) : 'idle';
      masterBtn.hidden = ms === 'idle';
      masterBtn.className = `master-btn ${ms === 'running' ? 'is-running' : 'is-paused'}`;
      masterBtn.replaceChildren(icon(ms === 'running' ? 'pause' : 'play'), el('span', { text: ms === 'running' ? 'Pause' : 'Resume' }));
      masterBtn.setAttribute('aria-label', ms === 'running' ? 'Pause session' : 'Resume session');
      if (mode === 'plan') headSub.textContent = `${fmtDate(app.today, app.today)} · Tap any block to start`;
      else if (ms === 'idle') headSub.textContent = remaining === 0 ? 'Tap finished blocks to complete them' : 'Tap a block to continue';
      else headSub.textContent = '';
    }
    endBtn.hidden = mode !== 'active';
    progressRow.hidden = mode === 'plan';
    headSub.hidden = !headSub.textContent;

    // Tiles
    for (let i = 0; i < tiles.length; i++) {
      const view = tiles[i];
      const t = board[i];
      view.li.hidden = !t;
      if (!t) continue;
      updateTile(view, t, i, now, mode);
    }

    // Focus view
    if (focusIndex != null) {
      const t = board[focusIndex];
      if (!t) {
        ctx.replace('#/');
        return;
      }
      const area = t.area_id ? app.area(t.area_id) : null;
      const item = t.item_id ? app.item(t.item_id) : null;
      focus.update(t, session, area ? area.color : null, t.area_id ? (area ? area.name : t.area_name) : 'Other', now, item, {
        canReroll: app.canSwap(focusIndex),
        locked: app.isLocked(focusIndex),
        canLock: app.canLock(focusIndex),
      });
    }
  }

  function updateTile(v, t, i, now, mode) {
    // After a session ends, unfinished blocks simply read as not done.
    const state = mode === 'done' && t.state !== 'completed' ? 'idle' : t.state;
    v.li.dataset.state = state;
    const area = t.area_id ? app.area(t.area_id) : null;
    v.li.dataset.color = area && area.color != null ? String(area.color) : 'none';
    const areaName = t.area_id ? (area ? area.name : t.area_name) : 'Other';
    v.sub.textContent = t.subtype_name || areaName;
    v.area.textContent = t.subtype_name ? areaName : '';
    v.text.textContent = t.item_text;
    v.hint.hidden = !t.empty || state === 'completed';

    const remaining = tileRemaining(t, now);
    if (state === 'completed') {
      v.time.replaceChildren(icon('check', 'done-check'), fmtClock(t.elapsed_seconds * 1000));
      v.status.replaceChildren(...(t.rating ? [icon('star', 'star-sm'), String(t.rating)] : []));
    } else if (state === 'timeup') {
      v.time.textContent = '';
      v.status.textContent = "Time's up";
    } else if (state === 'paused') {
      v.time.textContent = fmtClock(remaining);
      v.status.textContent = '';
    } else if (mode === 'done') {
      v.time.textContent = '';
      v.status.textContent = 'Not done';
    } else {
      v.time.textContent = fmtClock(remaining);
      v.status.textContent = '';
    }

    const canSwap = mode !== 'done' && state === 'idle' && app.canSwap(i);
    const canFinish = mode === 'active' && state === 'paused' && TILE_MS - remaining >= 1000;
    v.swap.hidden = !canSwap;
    v.finish.hidden = !canFinish;
    v.finish.setAttribute('aria-label', `Finish ${t.item_text} early`);
    // Links come from the library, so one added mid-session shows straight away.
    const item = t.item_id ? app.item(t.item_id) : null;
    const url = item ? item.url : t.url;
    v.link.hidden = !url;
    if (url) {
      v.link.href = url;
      v.link.setAttribute('aria-label', `Open link for ${t.item_text}`);
    }
    v.li.classList.toggle('has-finish', canFinish);
    v.li.classList.toggle('has-link', !!url);
    v.li.classList.toggle('has-swap', canSwap);
    const locked = app.isLocked(i);
    v.li.classList.toggle('is-locked', locked);
    v.lockMark.hidden = !locked;

    const action = {
      idle: mode === 'done' ? '' : 'Tap to open it, then Begin.',
      running: 'Tap to open full screen.',
      paused: 'Tap to open it, then Resume.',
      timeup: 'Tap to complete and rate.',
      completed: 'Tap to change the rating or reopen it.',
    }[state];
    const timeText = state === 'completed'
      ? `${fmtDuration(t.elapsed_seconds)} practised${t.rating ? `, rated ${t.rating} of 5` : ', not rated'}`
      : `${fmtClock(remaining)} left`;
    v.main.setAttribute('aria-label', [
      `Block ${i + 1}: ${t.item_text}`,
      [areaName, t.subtype_name].filter(Boolean).join(', '),
      STATE_LABEL[state],
      app.isLocked(i) ? 'Locked to your board' : null,
      timeText,
      action,
    ].filter(Boolean).join('. '));
    v.main.disabled = mode === 'done' && state !== 'completed';
  }

  /** Called once a second while a block runs: only the moving numbers change. */
  function tick(now = app.clock()) {
    const s = app.active;
    if (!s || s.running == null) return;
    setDigits(clock, fmtClock(sessionRemaining(s, now)));
    const i = s.running;
    const t = s.tiles[i];
    if (t.state === 'running') tiles[i].time.textContent = fmtClock(tileRemaining(t, now));
    if (focusIndex != null) focus.tick(s.tiles[focusIndex], s, now);
  }

  return { root, update, tick, setFocus, title: 'Timebox' };
}
