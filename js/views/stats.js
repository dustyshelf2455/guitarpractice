// Stats and history: consistency, totals, ratings, areas with drill-down
// (area -> subtypes -> items), weak spots, and the session log.

import { el, icon, fmtDuration, fmtDate, fmtShortDate, fmtTimeOfDay, fmtRating, mean } from '../util.js';
import * as S from '../stats.js';
import { weeklyChart, heatmapChart, ratingChart, sparkline } from '../charts.js';
import { ratingSheet } from './sheets.js';
import { page, section, swatch, linkRow, emptyState } from './common.js';

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);

function tabs(ctx, current) {
  const tab = (hash, key, label) => el('a', {
    class: 'seg tab', href: hash, 'aria-current': current === key ? 'page' : null,
    onclick: (e) => {
      e.preventDefault();
      ctx.replace(hash);
    },
  }, label);
  return el('nav', { class: 'segmented tabs', 'aria-label': 'Stats sections' },
    tab('#/stats', 'stats', 'Overview'),
    tab('#/history', 'history', 'History'));
}

function stat(label, value, unit, note) {
  return el('div', { class: 'card stat' },
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-value' }, value, unit ? el('span', { class: 'stat-unit', text: unit }) : null),
    note ? el('div', { class: 'stat-note', text: note }) : null,
  );
}

function ratingText(avg) {
  return avg == null ? 'No ratings' : `★ ${fmtRating(avg)}`;
}

/** Done N× · 80% completed · ★ 3.5 · last 2 Oct */
function metrics(g) {
  return el('span', { class: 'metrics' },
    el('span', {}, el('b', { text: `${g.completed}×` }), ' done'),
    el('span', {}, el('b', { text: pct(g.completionRate) }), ' completed'),
    el('span', {}, el('b', { text: g.avgRating == null ? '–' : `★ ${fmtRating(g.avgRating)}` })),
    g.lastPracticed ? el('span', {}, `last ${fmtShortDate(g.lastPracticed)}`) : null,
  );
}

function finishedSessions(app) {
  return app.sessions.filter((s) => s.status !== 'active');
}

// ------------------------------------------------------------------ overview

export function statsView(app, ctx) {
  const sessions = finishedSessions(app);
  const today = app.today;
  const days = S.practiceDays(sessions);
  const { current, longest } = S.streaks(days, today);
  const totals = S.totals(sessions);
  const overall = S.overallRating(sessions);
  const series = S.ratingSeries(sessions);
  const areas = S.byArea(sessions, app.library);
  const low = S.lowestRated(sessions, app.library);

  const consistency = section('Consistency',
    el('div', { class: 'stat-grid' },
      stat('Current streak', String(current), current === 1 ? 'day' : 'days', current ? null : days.has(today) ? null : 'Practise today to start one'),
      stat('Longest streak', String(longest), longest === 1 ? 'day' : 'days'),
    ),
    el('div', { class: 'card card-pad', style: { marginTop: '0.5rem' } },
      el('h3', { class: 'stat-label', style: { marginBottom: '0.625rem' }, text: 'Sessions per week' }),
      weeklyChart(S.weeklySessions(sessions, today)),
    ),
    el('div', { class: 'card card-pad', style: { marginTop: '0.5rem' } },
      el('h3', { class: 'stat-label', style: { marginBottom: '0.625rem' }, text: 'Practice calendar' }),
      heatmapChart(S.heatmap(sessions, today), today),
    ),
  );

  if (!sessions.length) {
    const root = page(ctx, { title: 'Stats', parent: '#/' },
      tabs(ctx, 'stats'),
      el('div', { class: 'card', style: { marginTop: '1rem' } },
        emptyState('No sessions yet', 'Complete a block and your stats start here. A day counts toward your streak once any block is done.')),
      consistency,
    );
    return { root, title: 'Stats' };
  }

  const lineChart = ratingChart(series);
  const ratingCard = el('div', { class: 'card card-pad', style: { marginTop: '0.5rem' } },
    el('h3', { class: 'stat-label', style: { marginBottom: '0.625rem' }, text: 'Average rating per session' }),
    lineChart || el('p', { class: 'section-note', style: { margin: 0 }, text: series.length
      ? `${series.length} rated session${series.length === 1 ? '' : 's'} so far. The trend appears after 3.`
      : 'Rate blocks as you finish them to see a trend here.' }),
  );

  const areaCard = el('div', { class: 'card' });
  for (const g of areas) {
    const spark = sparkline(g.bySession.map((p) => p.avg), { label: `${g.name} rating trend` });
    areaCard.append(el('a', { class: 'share-row', href: `#/stats/area/${encodeURIComponent(g.key)}`, dataset: { key: `area-${g.key}` } },
      el('div', { class: 'share-top' },
        swatch(g.color),
        el('span', { class: 'share-name', text: g.name }),
        el('span', { class: 'share-value', text: `${pct(g.share)} · ${fmtDuration(g.seconds)}` }),
        icon('chevron', 'chev'),
      ),
      el('div', { class: 'share-bar', 'aria-hidden': 'true' },
        el('div', { class: 'share-fill', dataset: { color: g.color == null ? 'none' : String(g.color) }, style: { width: `${Math.max(1, g.share * 100)}%` } })),
      el('div', { class: 'share-meta' },
        el('span', { text: ratingText(g.avgRating) }),
        el('span', { text: `${pct(g.completionRate)} completed` }),
        spark,
      ),
    ));
  }

  const lowList = low.length
    ? el('div', { class: 'card list' }, low.map((g) => linkRow(ctx,
      g.subtypeKey ? `#/stats/subtype/${encodeURIComponent(g.subtypeKey)}` : '#/stats',
      g.name, null,
      el('span', { class: 'rating-inline' }, `★ ${fmtRating(g.avgRating)}`, el('span', { class: 'sr-only', text: ` from ${g.ratings.length} ratings` })))))
    : el('div', { class: 'card' }, emptyState('Nothing stands out yet', 'Items show up here once they have at least two ratings.'));

  const root = page(ctx, { title: 'Stats', parent: '#/' },
    tabs(ctx, 'stats'),
    consistency,
    section('Totals',
      el('div', { class: 'stat-grid' },
        stat('Practice time', fmtDuration(totals.seconds)),
        stat('Sessions', String(totals.sessions), null, `${totals.complete} complete · ${totals.partial} partial`),
        stat('Blocks completed', pct(totals.completionRate), null, `${totals.completed} of ${totals.tiles}`),
        stat('Average rating', overall == null ? '–' : fmtRating(overall), overall == null ? null : 'of 5'),
      ),
    ),
    section('Ratings', ratingCard),
    section('By area',
      el('p', { class: 'section-note', text: 'Share of practice time. Tap an area to see its subtypes and items.' }),
      areaCard,
    ),
    section('Weak spots',
      el('p', { class: 'section-note', text: 'Lowest-rated items (at least two ratings).' }),
      lowList,
    ),
  );
  return { root, title: 'Stats' };
}

// ------------------------------------------------------------------ area drill-down

export function areaView(app, ctx, areaKey) {
  const sessions = finishedSessions(app);
  const area = S.byArea(sessions, app.library).find((g) => g.key === areaKey);
  if (!area) {
    return { root: page(ctx, { title: 'Area', parent: '#/stats' }, emptyState('No practice logged for this area yet.')), title: 'Area' };
  }
  const subs = S.subtypesInArea(sessions, app.library, areaKey);
  const trend = ratingChart(area.bySession, { label: `${area.name} rating per session` });
  const list = el('div', { class: 'card list' }, subs.map((g) => el('a', {
    class: 'row row-link', href: `#/stats/subtype/${encodeURIComponent(g.key)}`, dataset: { key: g.key },
  },
  el('span', { class: 'row-main' }, el('span', { class: 'row-title', text: g.name }), metrics(g)),
  sparkline(g.bySession.map((p) => p.avg), { label: `${g.name} rating trend` }),
  icon('chevron', 'chev'))));

  const root = page(ctx, { title: area.name, parent: '#/stats' },
    el('div', { class: 'stat-grid', style: { marginTop: '0.5rem' } },
      stat('Practice time', fmtDuration(area.seconds), null, `${pct(area.share)} of all practice`),
      stat('Average rating', area.avgRating == null ? '–' : fmtRating(area.avgRating), area.avgRating == null ? null : 'of 5', `${pct(area.completionRate)} of blocks completed`),
    ),
    section('Rating trend', el('div', { class: 'card card-pad' }, trend || el('p', { class: 'section-note', style: { margin: 0 },
      text: 'The trend appears once this area has ratings from 3 sessions.' }))),
    section('Subtypes', list),
  );
  return { root, title: area.name };
}

export function subtypeStatsView(app, ctx, subKey) {
  const sessions = finishedSessions(app);
  const tile = sessions.flatMap((s) => s.tiles).find((t) => S.subtypeKey(t) === subKey);
  const areaKey = tile ? S.areaKey(tile) : null;
  const sub = areaKey ? S.subtypesInArea(sessions, app.library, areaKey).find((g) => g.key === subKey) : null;
  if (!sub) {
    return { root: page(ctx, { title: 'Subtype', parent: '#/stats' }, emptyState('No practice logged for this subtype yet.')), title: 'Subtype' };
  }
  const items = S.itemsInSubtype(sessions, app.library, subKey);
  const list = items.length
    ? el('ol', { class: 'card list' }, items.map((g) => el('li', {}, el('div', { class: 'row' },
      el('span', { class: 'row-main' },
        el('span', { class: 'row-title' }, g.name, g.archived ? el('span', { class: 'badge', text: 'Archived' }) : null),
        metrics(g)),
      sparkline(g.ratings, { label: `${g.name} ratings` }),
    ))))
    : el('div', { class: 'card' }, emptyState('No items logged', 'Blocks here had no library item.'));

  const root = page(ctx, { title: sub.name, parent: `#/stats/area/${encodeURIComponent(areaKey)}` },
    el('div', { class: 'stat-grid', style: { marginTop: '0.5rem' } },
      stat('Practice time', fmtDuration(sub.seconds), null, `${sub.appearances} block${sub.appearances === 1 ? '' : 's'}`),
      stat('Average rating', sub.avgRating == null ? '–' : fmtRating(sub.avgRating), sub.avgRating == null ? null : 'of 5', `${pct(sub.completionRate)} completed`),
    ),
    section('Items', list),
  );
  return { root, title: sub.name };
}

// ------------------------------------------------------------------ history

export function historyView(app, ctx) {
  const sessions = finishedSessions(app).slice().sort((a, b) => b.started_at - a.started_at);
  const list = sessions.length
    ? el('div', { class: 'card list' }, sessions.map((s) => {
      const done = s.tiles.filter((t) => t.completed).length;
      const avg = mean(s.tiles.map((t) => t.rating));
      return linkRow(ctx, `#/history/${encodeURIComponent(s.id)}`,
        [`${fmtDate(s.date, app.today)} · ${fmtTimeOfDay(s.started_at)}`, s.status === 'partial' ? el('span', { class: 'badge', text: 'Partial' }) : null],
        [fmtDuration(s.total_active_seconds), `${done}/${s.tiles.length} blocks`, avg == null ? null : `★ ${fmtRating(avg)}`].filter(Boolean).join(' · '));
    }))
    : el('div', { class: 'card' }, emptyState('No sessions yet', 'Finished and ended sessions are listed here.'));
  const root = page(ctx, { title: 'Stats', parent: '#/' }, tabs(ctx, 'history'), section(null, list));
  return { root, title: 'History' };
}

export function sessionDetailView(app, ctx, id) {
  const s = app.sessions.find((x) => x.id === id && x.status !== 'active');
  if (!s) return { root: page(ctx, { title: 'Session', parent: '#/history' }, emptyState('Session not found.')), title: 'Session' };
  const done = s.tiles.filter((t) => t.completed).length;
  const avg = mean(s.tiles.map((t) => t.rating));
  const rows = s.tiles.map((t, i) => {
    const area = t.area_id ? app.area(t.area_id) : null;
    const state = t.completed ? fmtDuration(t.elapsed_seconds) : t.elapsed_seconds ? `${fmtDuration(t.elapsed_seconds)}, not finished` : 'Not started';
    return el('li', {}, el('div', { class: 'row tile-row' },
      swatch(area ? area.color : null),
      el('span', { class: 'row-main' },
        el('span', { class: 'row-title', text: t.item_text }),
        el('span', { class: 'row-sub', text: [t.subtype_name, t.area_name || 'Other', state].filter(Boolean).join(' · ') }),
      ),
      t.completed
        ? el('button', {
          class: 'chip', type: 'button', dataset: { key: `rate-${i}` },
          'aria-label': t.rating ? `Rated ${t.rating} of 5. Change rating` : 'Not rated. Add rating',
          onclick: () => ratingSheet({ tile: t, onRate: (n) => app.rateTile(s.id, i, n) }),
        }, t.rating ? [icon('star', 'star-sm'), ` ${t.rating}`] : 'Rate')
        : null,
    ));
  });
  const root = page(ctx, { title: fmtDate(s.date, app.today), parent: '#/history' },
    el('div', { class: 'stat-grid', style: { marginTop: '0.5rem' } },
      stat('Time', fmtDuration(s.total_active_seconds), null, `Started ${fmtTimeOfDay(s.started_at)}`),
      stat('Blocks', `${done}/${s.tiles.length}`, null, s.status === 'complete' ? 'Complete session' : 'Partial session'),
    ),
    avg != null ? el('p', { class: 'section-note', style: { marginTop: '0.625rem' }, text: `Average rating ★ ${fmtRating(avg)}` }) : null,
    section('Blocks', el('ol', { class: 'card list' }, rows)),
  );
  return { root, title: fmtDate(s.date, app.today) };
}
