// Hand-rolled inline SVG charts. Thin marks, recessive axes, text in text
// colours, a tap/hover tooltip on every mark, and a table view for each chart.

import { el, svg, fmtShortDate, fmtDate, fmtDuration, monthName } from './util.js';

// ---- tooltip ----

function withTooltip(container) {
  const tip = el('div', { class: 'tooltip', hidden: true, role: 'status' });
  container.append(tip);
  let active = null;
  const show = (target) => {
    if (active) active.classList.remove('active-mark');
    active = target;
    const box = target.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const half = tip.offsetWidth / 2 + 2;
    const x = Math.min(Math.max(box.left + box.width / 2 - host.left, half), host.width - half);
    tip.style.left = `${x}px`;
    tip.style.top = `${box.top - host.top}px`;
    const mark = target.dataset.mark && container.querySelector(`[data-id="${target.dataset.mark}"]`);
    if (mark) {
      mark.classList.add('active-mark');
      active = mark;
    }
  };
  const hide = () => {
    tip.hidden = true;
    if (active) active.classList.remove('active-mark');
    active = null;
  };
  container.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t && e.pointerType === 'mouse') show(t);
  });
  container.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && !e.relatedTarget?.closest?.('[data-tip]')) hide();
  });
  container.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) show(t);
    else hide();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!container.contains(e.target)) hide();
  });
}

function tableView(caption, head, rows) {
  return el('details', { class: 'table-toggle' },
    el('summary', {}, 'Show as table'),
    el('table', { class: 'data-table' },
      el('caption', { class: 'sr-only', text: caption }),
      el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i ? 'num' : '', text: h })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el('td', { class: i ? 'num' : '', text: String(c) }))))),
    ),
  );
}

/** Column path with a 4px rounded data end and a square baseline end. */
function columnPath(x, y, w, h, rounded) {
  if (h <= 0) return '';
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h}V${y + r}${r ? `Q${x},${y} ${x + r},${y}` : ''}H${x + w - r}${r ? `Q${x + w},${y} ${x + w},${y + r}` : ''}V${y + h}Z`;
}

// ---- sessions per week (stacked: complete + partial) ----

export function weeklyChart(rows) {
  const W = 340;
  const H = 150;
  const left = 20;
  const top = 10;
  const bottom = 22;
  const plotH = H - top - bottom;
  const max = Math.max(2, ...rows.map((r) => r.complete + r.partial));
  const band = (W - left) / rows.length;
  const barW = Math.min(18, band * 0.62);
  const y = (v) => top + plotH - (v / max) * plotH;

  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Sessions per week, last ${rows.length} weeks` });
  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];
  for (const t of ticks) {
    g.append(svg('line', { class: t === 0 ? 'baseline' : 'grid-line', x1: left, x2: W, y1: y(t), y2: y(t) }));
    g.append(svg('text', { x: left - 6, y: y(t) + 3.5, 'text-anchor': 'end', text: String(t) }));
  }
  rows.forEach((r, i) => {
    const x = left + i * band + (band - barW) / 2;
    const total = r.complete + r.partial;
    const hc = (r.complete / max) * plotH;
    const hp = (r.partial / max) * plotH;
    const gap = r.complete && r.partial ? 2 : 0;
    if (r.complete) g.append(svg('path', { class: 'mark-complete', d: columnPath(x, y(r.complete), barW, hc, !r.partial) }));
    if (r.partial) g.append(svg('path', { class: 'mark-partial', d: columnPath(x, y(total), barW, hp - gap, true) }));
    if (i % 3 === 2 || i === 0) {
      g.append(svg('text', { x: x + barW / 2, y: H - 6, 'text-anchor': 'middle', text: i === rows.length - 1 ? 'This wk' : fmtShortDate(r.week) }));
    }
    const label = `Week of ${fmtShortDate(r.week)}: ${total ? `${r.complete} complete, ${r.partial} partial` : 'no sessions'}`;
    g.append(svg('rect', { class: 'hit', x: left + i * band, y: top, width: band, height: plotH, 'data-tip': label }));
  });

  const chart = el('div', { class: 'chart' }, g);
  withTooltip(chart);
  return el('div', {},
    chart,
    el('div', { class: 'legend' },
      el('span', { class: 'legend-key' }, el('span', { class: 'legend-swatch', style: { background: 'var(--c0)' } }), 'Complete'),
      el('span', { class: 'legend-key' }, el('span', { class: 'legend-swatch', style: { background: 'var(--series-partial)' } }), 'Partial'),
    ),
    tableView('Sessions per week', ['Week of', 'Complete', 'Partial'], rows.map((r) => [fmtShortDate(r.week), r.complete, r.partial])),
  );
}

// ---- calendar heatmap (practice minutes per day) ----

function level(seconds) {
  const m = seconds / 60;
  if (m <= 0) return 0;
  if (m < 15) return 1;
  if (m < 30) return 2;
  if (m < 50) return 3;
  return 4;
}

export function heatmapChart(days, today) {
  const weeks = days.length / 7;
  const cell = 17;
  const gap = 3;
  const left = 18;
  const top = 16;
  const W = left + weeks * (cell + gap);
  const H = top + 7 * (cell + gap);
  const g = svg('svg', { class: 'heat', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Practice calendar, last ${weeks} weeks` });
  ['M', '', 'W', '', 'F', '', ''].forEach((d, i) => d && g.append(svg('text', { x: 0, y: top + i * (cell + gap) + 12, text: d })));
  // Month labels sit over the week containing the 1st; the first column gets
  // one too unless a new month starts right after it (they would collide).
  const firstOfMonth = (w) => days.slice(w * 7, w * 7 + 7).find((d) => d.date.endsWith('-01'));
  for (let w = 0; w < weeks; w++) {
    const first = firstOfMonth(w);
    const lead = w === 0 && !first && !firstOfMonth(1) && !firstOfMonth(2);
    if (first || lead) g.append(svg('text', { x: left + w * (cell + gap), y: 10, text: monthName((first || days[0]).date) }));
    for (let k = 0; k < 7; k++) {
      const d = days[w * 7 + k];
      const x = left + w * (cell + gap);
      const y = top + k * (cell + gap);
      if (d.future) continue;
      const lvl = level(d.seconds);
      g.append(svg('rect', {
        class: `cell lvl-${lvl}${d.date === today ? ' today' : ''}`,
        x, y, width: cell, height: cell, rx: 3,
        'data-tip': `${fmtDate(d.date, today)}: ${d.seconds ? fmtDuration(d.seconds) : 'no practice'}`,
      }));
    }
  }
  const chart = el('div', { class: 'chart' }, g);
  withTooltip(chart);
  const legend = el('div', { class: 'legend', 'aria-hidden': 'true' },
    el('span', { text: 'Less' }),
    ...[0, 1, 2, 3, 4].map((l) => el('span', { class: 'legend-swatch', style: { background: `var(--seq-${l})` } })),
    el('span', { text: 'More' }),
  );
  legend.style.gap = '4px';
  legend.style.alignItems = 'center';
  const practiced = days.filter((d) => d.seconds > 0);
  return el('div', {},
    chart,
    legend,
    tableView('Practice by day', ['Day', 'Time'], practiced.slice().reverse().map((d) => [fmtDate(d.date, today), fmtDuration(d.seconds)])),
  );
}

// ---- rating line (one series, y fixed 1..5) ----

export function ratingChart(series, { label = 'Average rating per session', minPoints = 3 } = {}) {
  if (series.length < minPoints) return null;
  const W = 340;
  const H = 150;
  const left = 20;
  const right = 8;
  const top = 10;
  const bottom = 22;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const n = series.length;
  const x = (i) => left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => top + plotH - ((v - 1) / 4) * plotH;

  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  for (let t = 1; t <= 5; t++) {
    g.append(svg('line', { class: t === 1 ? 'baseline' : 'grid-line', x1: left, x2: W - right, y1: y(t), y2: y(t) }));
    g.append(svg('text', { x: left - 6, y: y(t) + 3.5, 'text-anchor': 'end', text: String(t) }));
  }
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  g.append(svg('polyline', { class: 'line', points: pts }));
  const showAll = n <= 24;
  series.forEach((p, i) => {
    if (showAll || i === n - 1) g.append(svg('circle', { class: 'marker', 'data-id': `pt-${i}`, cx: x(i), cy: y(p.avg), r: 4 }));
  });
  g.append(svg('text', { x: left, y: H - 6, text: fmtShortDate(series[0].date) }));
  g.append(svg('text', { x: W - right, y: H - 6, 'text-anchor': 'end', text: fmtShortDate(series[n - 1].date) }));
  // Hit bands: one per point, wider than the marker.
  series.forEach((p, i) => {
    const x0 = i === 0 ? left : (x(i - 1) + x(i)) / 2;
    const x1 = i === n - 1 ? W - right : (x(i) + x(i + 1)) / 2;
    g.append(svg('rect', {
      class: 'hit', x: x0, y: top, width: Math.max(1, x1 - x0), height: plotH,
      'data-tip': `${fmtShortDate(p.date)}: ★ ${p.avg.toFixed(1)}`, 'data-mark': showAll ? `pt-${i}` : null,
    }));
  });
  const chart = el('div', { class: 'chart' }, g);
  withTooltip(chart);
  return el('div', {},
    chart,
    tableView(label, ['Session', 'Rating'], series.slice().reverse().map((p) => [fmtShortDate(p.date), p.avg.toFixed(1)])),
  );
}

// ---- sparkline (ratings, chronological) ----

export function sparkline(values, { width = 64, height = 20, label, last = 20 } = {}) {
  const v = values.filter((x) => typeof x === 'number').slice(-last);
  if (v.length < 2) return null;
  const pad = 2.5;
  const x = (i) => pad + (i / (v.length - 1)) * (width - pad * 2);
  const y = (r) => pad + (1 - (r - 1) / 4) * (height - pad * 2);
  return svg('svg', {
    class: 'spark', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': label || `Rating trend: ${v.join(', ')}`,
  },
  svg('line', { class: 'spark-mid', x1: 0, x2: width, y1: y(3), y2: y(3) }),
  svg('polyline', { points: v.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ') }),
  svg('circle', { cx: x(v.length - 1), cy: y(v[v.length - 1]), r: 2.5 }));
}

