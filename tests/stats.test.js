import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLibrary } from '../js/defaults.js';
import {
  practiceDays, streaks, weeklySessions, heatmap, totals, ratingSeries, overallRating,
  byArea, subtypesInArea, itemsInSubtype, lowestRated,
} from '../js/stats.js';

let n = 0;
function session(date, tiles, status = 'partial') {
  n++;
  const s = {
    id: `s${n}`,
    date,
    started_at: Date.parse(`${date}T18:00:00Z`) + n,
    status,
    tiles: tiles.map((t, i) => ({
      slot_id: `slot-${i + 1}`,
      item_id: null,
      item_text: '',
      subtype_id: null,
      subtype_name: '',
      area_id: null,
      area_name: '',
      elapsed_seconds: 300,
      completed: true,
      rating: null,
      ...t,
    })),
  };
  s.total_active_seconds = s.tiles.reduce((a, t) => a + t.elapsed_seconds, 0);
  return s;
}

const warm = { item_id: 'warmup-1', item_text: 'Spider walk', subtype_id: 'warmup', subtype_name: 'Warm-up', area_id: 'technique', area_name: 'Technique' };
const song = { item_id: 'songs-1', item_text: 'Long Black Veil', subtype_id: 'songs', subtype_name: 'Songs', area_id: 'repertoire', area_name: 'Repertoire' };
const custom = { item_id: null, item_text: 'Ear stuff', subtype_id: 't-ear', subtype_name: 'Ear', area_id: null, area_name: '' };

test('practice days need at least one completed block', () => {
  const s = [
    session('2026-10-01', [{ completed: false, elapsed_seconds: 120 }]),
    session('2026-10-02', [{ completed: true }]),
    { ...session('2026-10-03', [{ completed: true }]), status: 'active' },
  ];
  assert.deepEqual([...practiceDays(s)], ['2026-10-02']);
});

test('streaks: current counts through yesterday; longest across gaps', () => {
  const days = new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-01', '2026-10-02']);
  assert.deepEqual(streaks(days, '2026-10-03'), { current: 2, longest: 4 });
  assert.deepEqual(streaks(days, '2026-10-04'), { current: 0, longest: 4 });
  days.add('2026-10-03');
  assert.deepEqual(streaks(days, '2026-10-03'), { current: 3, longest: 4 });
  assert.deepEqual(streaks(new Set(), '2026-10-03'), { current: 0, longest: 0 });
});

test('streaks are DST-safe and span month/year boundaries', () => {
  const days = new Set(['2026-12-30', '2026-12-31', '2027-01-01', '2026-03-28', '2026-03-29', '2026-03-30']);
  assert.equal(streaks(days, '2027-01-01').current, 3);
  assert.equal(streaks(days, '2027-01-01').longest, 3);
});

test('weekly sessions: 12 Monday-start buckets, complete vs partial', () => {
  const rows = weeklySessions([
    session('2026-10-03', [{}], 'complete'), // Saturday
    session('2026-09-28', [{}], 'partial'), // Monday same week
    session('2026-09-27', [{}], 'complete'), // Sunday previous week
    session('2026-01-01', [{}], 'complete'), // out of range
  ], '2026-10-03');
  assert.equal(rows.length, 12);
  assert.equal(rows[11].week, '2026-09-28');
  assert.deepEqual([rows[11].complete, rows[11].partial], [1, 1]);
  assert.deepEqual([rows[10].complete, rows[10].partial], [1, 0]);
  assert.equal(rows.reduce((a, r) => a + r.complete + r.partial, 0), 3);
});

test('heatmap: 13 full weeks ending this Sunday, future days flagged', () => {
  const days = heatmap([session('2026-10-02', [{ elapsed_seconds: 600 }])], '2026-10-03');
  assert.equal(days.length, 91);
  assert.equal(days[days.length - 1].date, '2026-10-04');
  assert.equal(days[days.length - 1].future, true);
  const d = days.find((x) => x.date === '2026-10-02');
  assert.equal(d.seconds, 600);
  assert.equal(d.practiced, true);
});

test('totals and completion rate', () => {
  const t = totals([
    session('2026-10-01', [{}, { completed: false, elapsed_seconds: 0 }], 'partial'),
    session('2026-10-02', [{}, {}], 'complete'),
  ]);
  assert.equal(t.sessions, 2);
  assert.equal(t.complete, 1);
  assert.equal(t.partial, 1);
  assert.equal(t.completionRate, 0.75);
  assert.equal(t.seconds, 900);
});

test('ratings: overall average and per-session series skip unrated sessions', () => {
  const s = [
    session('2026-10-01', [{ rating: 2 }, { rating: 4 }]),
    session('2026-10-02', [{ rating: null }]),
    session('2026-10-03', [{ rating: 5 }]),
  ];
  assert.equal(overallRating(s), 11 / 3);
  assert.deepEqual(ratingSeries(s).map((p) => p.avg), [3, 5]);
});

test('by area: time share, untagged under Other, current names win', () => {
  const lib = defaultLibrary();
  lib.areas.find((a) => a.id === 'technique').name = 'Tech';
  const s = [
    session('2026-10-01', [{ ...warm, rating: 3 }, { ...song, rating: 5 }, { ...song, rating: 4, elapsed_seconds: 600 }]),
    session('2026-10-02', [{ ...custom, rating: 1 }]),
  ];
  const areas = byArea(s, lib);
  const names = areas.map((a) => a.name);
  assert.deepEqual(names, ['Tech', 'Repertoire', 'Other']);
  const rep = areas.find((a) => a.key === 'repertoire');
  assert.equal(rep.seconds, 900);
  assert.equal(rep.share, 900 / 1500);
  assert.equal(rep.avgRating, 4.5);
  assert.equal(areas.find((a) => a.key === 'other').avgRating, 1);
});

test('drill-down: subtypes in an area, items in a subtype', () => {
  const lib = defaultLibrary();
  const s = [
    session('2026-10-01', [{ ...song, rating: 2 }, { ...song, item_id: 'songs-2', item_text: 'Condor Avenue', rating: 4 }]),
    session('2026-10-02', [{ ...song, rating: 4 }, { ...song, item_id: 'songs-2', item_text: 'Condor Avenue', completed: false, elapsed_seconds: 0 }]),
  ];
  const subs = subtypesInArea(s, lib, 'repertoire');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].appearances, 4);
  assert.equal(subs[0].completionRate, 0.75);
  const items = itemsInSubtype(s, lib, 'songs');
  const veil = items.find((i) => i.key === 'songs-1');
  assert.equal(veil.name, 'Lefty - Long Black Veil', 'current library text');
  assert.deepEqual(veil.ratings, [2, 4]);
  assert.equal(veil.lastPracticed, '2026-10-02');
  const condor = items.find((i) => i.key === 'songs-2');
  assert.equal(condor.completionRate, 0.5);
  assert.equal(condor.lastPracticed, '2026-10-01');
});

test('lowest-rated items need two ratings and skip archived items', () => {
  const lib = defaultLibrary();
  const s = [
    session('2026-10-01', [{ ...warm, rating: 2 }, { ...song, rating: 1 }]),
    session('2026-10-02', [{ ...warm, rating: 3 }]),
  ];
  const low = lowestRated(s, lib);
  assert.deepEqual(low.map((g) => g.key), ['warmup-1']);
  assert.equal(low[0].avgRating, 2.5);
  lib.items.find((i) => i.id === 'warmup-1').archived = true;
  assert.deepEqual(lowestRated(s, lib), []);
});
