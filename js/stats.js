// Statistics over saved sessions. Pure functions; the views only format.
//
// Definitions:
//   practice day     a day with at least one completed block
//   appearances      times an item/subtype/area was on a session board
//   completion rate  completed / appearances
//   practice time    all time spent in blocks, completed or not

import { addDays, daysBetween, weekStart, mean } from './util.js';

export const OTHER = 'other';

function finished(sessions) {
  return sessions.filter((s) => s.status === 'complete' || s.status === 'partial');
}

export function practiceDays(sessions) {
  const days = new Set();
  for (const s of finished(sessions)) if (s.tiles.some((t) => t.completed)) days.add(s.date);
  return days;
}

export function streaks(days, today) {
  // The current streak survives until the end of today even if today isn't done yet.
  let current = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of [...days].sort()) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest };
}

/** Sessions per week (Monday start) for the last `weeks` weeks, oldest first. */
export function weeklySessions(sessions, today, weeks = 12) {
  const thisWeek = weekStart(today);
  const rows = Array.from({ length: weeks }, (_, i) => ({
    week: addDays(thisWeek, -7 * (weeks - 1 - i)),
    complete: 0,
    partial: 0,
  }));
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  for (const s of finished(sessions)) {
    const row = byWeek.get(weekStart(s.date));
    if (row) row[s.status]++;
  }
  return rows;
}

/** Practice seconds per day for a calendar grid ending with the current week. */
export function heatmap(sessions, today, weeks = 13) {
  const end = addDays(weekStart(today), 6);
  const start = addDays(end, -(weeks * 7 - 1));
  const seconds = new Map();
  const completedDays = practiceDays(sessions);
  for (const s of finished(sessions)) {
    seconds.set(s.date, (seconds.get(s.date) || 0) + (s.total_active_seconds || 0));
  }
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    days.push({
      date,
      seconds: seconds.get(date) || 0,
      practiced: completedDays.has(date),
      future: date > today,
    });
  }
  return days;
}

export function totals(sessions) {
  const done = finished(sessions);
  let tiles = 0;
  let completed = 0;
  for (const s of done) {
    tiles += s.tiles.length;
    completed += s.tiles.filter((t) => t.completed).length;
  }
  return {
    seconds: done.reduce((a, s) => a + (s.total_active_seconds || 0), 0),
    sessions: done.length,
    complete: done.filter((s) => s.status === 'complete').length,
    partial: done.filter((s) => s.status === 'partial').length,
    tiles,
    completed,
    completionRate: tiles ? completed / tiles : null,
  };
}

/** Average rating per session (sessions with at least one rating), oldest first. */
export function ratingSeries(sessions) {
  return finished(sessions)
    .slice()
    .sort((a, b) => a.started_at - b.started_at)
    .map((s) => ({ id: s.id, date: s.date, avg: mean(s.tiles.map((t) => t.rating)) }))
    .filter((p) => p.avg != null);
}

export function overallRating(sessions) {
  return mean(finished(sessions).flatMap((s) => s.tiles.map((t) => t.rating)));
}

function emptyGroup(key, name) {
  return {
    key,
    name,
    seconds: 0,
    appearances: 0,
    completed: 0,
    ratings: [], // chronological
    lastPracticed: null,
    bySession: [], // [{ date, avg }] chronological, for trends
  };
}

function finishGroup(g) {
  g.avgRating = mean(g.ratings);
  g.completionRate = g.appearances ? g.completed / g.appearances : null;
  return g;
}

/**
 * Group every block by a key. `keyOf(tile)` returns [key, name] or null to skip.
 * Names come from the most recent snapshot, unless `nameOf(key)` knows better.
 */
function groupTiles(sessions, keyOf, nameOf = () => null) {
  const groups = new Map();
  const ordered = finished(sessions).slice().sort((a, b) => a.started_at - b.started_at);
  for (const s of ordered) {
    const perSession = new Map();
    for (const t of s.tiles) {
      const k = keyOf(t);
      if (!k) continue;
      const [key, snapName] = k;
      if (!groups.has(key)) groups.set(key, emptyGroup(key, snapName));
      const g = groups.get(key);
      g.name = snapName || g.name;
      g.seconds += t.elapsed_seconds || 0;
      g.appearances++;
      if (t.completed) g.completed++;
      if (t.rating != null) {
        g.ratings.push(t.rating);
        if (!perSession.has(key)) perSession.set(key, []);
        perSession.get(key).push(t.rating);
      }
      if ((t.completed || t.elapsed_seconds > 0) && (!g.lastPracticed || s.date > g.lastPracticed)) {
        g.lastPracticed = s.date;
      }
    }
    for (const [key, ratings] of perSession) groups.get(key).bySession.push({ date: s.date, avg: mean(ratings) });
  }
  for (const g of groups.values()) {
    g.name = nameOf(g.key) || g.name;
    finishGroup(g);
  }
  return [...groups.values()];
}

const areaKey = (t) => t.area_id || OTHER;
const subtypeKey = (t) => t.subtype_id || `name:${t.subtype_name}`;

export function byArea(sessions, library) {
  const names = new Map(library.areas.map((a) => [a.id, a.name]));
  const groups = groupTiles(
    sessions,
    (t) => [areaKey(t), t.area_id ? t.area_name : 'Other'],
    (key) => (key === OTHER ? 'Other' : names.get(key)),
  );
  const total = groups.reduce((a, g) => a + g.seconds, 0);
  const order = new Map(library.areas.map((a) => [a.id, a.order]));
  for (const g of groups) {
    g.share = total ? g.seconds / total : 0;
    const area = library.areas.find((a) => a.id === g.key);
    g.color = area ? area.color : null;
  }
  // Library order, with "Other" and retired areas last.
  return groups.sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9) || b.seconds - a.seconds);
}

export function subtypesInArea(sessions, library, areaId) {
  const names = new Map(library.subtypes.map((s) => [s.id, s.name]));
  const inArea = sessions.map((s) => ({ ...s, tiles: s.tiles.filter((t) => areaKey(t) === areaId) }));
  return groupTiles(inArea, (t) => [subtypeKey(t), t.subtype_name || 'Untitled'], (k) => names.get(k))
    .sort((a, b) => b.seconds - a.seconds);
}

export function itemsInSubtype(sessions, library, subtypeKeyValue) {
  const lib = new Map(library.items.map((it) => [it.id, it]));
  const inSub = sessions.map((s) => ({ ...s, tiles: s.tiles.filter((t) => subtypeKey(t) === subtypeKeyValue && t.item_id) }));
  const groups = groupTiles(inSub, (t) => [t.item_id, t.item_text], (k) => lib.get(k)?.text);
  for (const g of groups) g.archived = !!lib.get(g.key)?.archived;
  return groups.sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
}

/** Items with at least `minRatings` ratings, lowest average first. */
export function lowestRated(sessions, library, { minRatings = 2, limit = 5 } = {}) {
  const lib = new Map(library.items.map((it) => [it.id, it]));
  return groupTiles(sessions, (t) => (t.item_id ? [t.item_id, t.item_text] : null), (k) => lib.get(k)?.text)
    .filter((g) => g.ratings.length >= minRatings && !lib.get(g.key)?.archived)
    .sort((a, b) => a.avgRating - b.avgRating || b.ratings.length - a.ratings.length)
    .slice(0, limit)
    .map((g) => {
      const tile = finished(sessions).flatMap((s) => s.tiles).find((t) => t.item_id === g.key);
      return { ...g, subtypeKey: tile ? subtypeKey(tile) : null, areaKey: tile ? areaKey(tile) : null };
    });
}

export { subtypeKey, areaKey };
