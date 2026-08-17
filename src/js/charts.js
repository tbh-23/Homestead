// Tiny dependency-free inline-SVG charts. Each function returns an SVG *string*
// so it can be dropped straight into a template literal (app views or a printable
// report window). No external libraries — the app has no build step.

// Escape text that goes inside SVG (labels can be user/topic derived).
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// A multi-series line/area chart.
// series: [{ color, label?, points: [{ x, y }] }] where x is a 0..1 position
// (caller maps time/index to 0..1) and y is a raw value. yMax auto-derives.
export function lineChart(series, { w = 320, h = 130, pad = 10, yMax = null, area = true, baseline = true } = {}) {
  const clean = (series || []).filter(s => s && s.points && s.points.length);
  const ys = clean.flatMap(s => s.points.map(p => p.y));
  const max = yMax != null ? yMax : Math.max(1, ...ys);
  const X = t => pad + Math.max(0, Math.min(1, t)) * (w - 2 * pad);
  const Y = v => (h - pad) - (v / max) * (h - 2 * pad);

  if (!clean.length) {
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img"></svg>`;
  }

  let body = '';
  if (baseline) {
    body += `<line x1="${pad}" y1="${Y(0)}" x2="${w - pad}" y2="${Y(0)}" stroke="#ece7dd" stroke-width="1"/>`;
  }
  for (const s of clean) {
    const pts = s.points.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`);
    const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p).join(' ');
    if (area && pts.length > 1) {
      const areaPath = `M${X(s.points[0].x).toFixed(1)},${Y(0).toFixed(1)} `
        + s.points.map(p => `L${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
        + ` L${X(s.points[s.points.length - 1].x).toFixed(1)},${Y(0).toFixed(1)} Z`;
      body += `<path d="${areaPath}" fill="${s.color}" fill-opacity="0.10"/>`;
    }
    body += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    // Emphasize the last point.
    const last = s.points[s.points.length - 1];
    body += `<circle cx="${X(last.x).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="2.6" fill="${s.color}"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" preserveAspectRatio="none">${body}</svg>`;
}

// Vertical bar chart for a small set of labeled values (e.g. test scores over
// time). items: [{ value, color, label? }]. Values are 0..100 by default.
export function barChart(items, { w = 320, h = 130, pad = 12, yMax = 100, gap = 6 } = {}) {
  const list = items || [];
  if (!list.length) return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"></svg>`;
  const innerW = w - 2 * pad;
  const bw = Math.max(3, (innerW - gap * (list.length - 1)) / list.length);
  const Y = v => (h - pad) - (Math.max(0, Math.min(yMax, v)) / yMax) * (h - 2 * pad);
  let body = `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#ece7dd" stroke-width="1"/>`;
  list.forEach((it, i) => {
    const x = pad + i * (bw + gap);
    const y = Y(it.value);
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(h - pad - y).toFixed(1)}" rx="2" fill="${it.color || '#3f7d5e'}"/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img">${body}</svg>`;
}

// A horizontal labeled progress bar row (used in the printable report).
export function barRow({ label, value, total, pct, color = '#3f7d5e', w = 520 }) {
  const p = pct != null ? pct : (total ? Math.round((value / total) * 100) : 0);
  return `<div class="barrow">
    <div class="barrow-head"><span>${esc(label)}</span><span class="barrow-val">${value != null && total != null ? `${value}/${total} · ` : ''}${p}%</span></div>
    <div class="barrow-track"><div class="barrow-fill" style="width:${p}%;background:${color}"></div></div>
  </div>`;
}
