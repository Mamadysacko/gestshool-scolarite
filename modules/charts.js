import { escapeHtml, formatMoney } from './utils.js';

export const COLORS = { encaisse: '#f97316', attendu: '#7c3aed', a_jour: '#16a34a', partiel: '#d97706', retard: '#dc2626', grid: '#e5e7eb', ink: '#6b7280' };
export const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '')} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v)));

function chartFrame(inner, w, h) {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function yGrid(max, w, top, bottom, left) {
  return [0, 0.5, 1].map((r) => {
    const y = bottom - (bottom - top) * r;
    return `<line x1="${left}" x2="${w - 8}" y1="${y}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/><text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="13" fill="${COLORS.ink}">${short(max * r)}</text>`;
  }).join('');
}

export function lineChart(points, devise) {
  const w = 560; const h = 230; const left = 52; const top = 12; const bottom = 190;
  const max = Math.max(...points.map((p) => p.value), 100);
  const x = (i) => left + (points.length === 1 ? 0 : (w - left - 14) * i / (points.length - 1));
  const y = (v) => bottom - (bottom - top) * v / max;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;
  const step = Math.ceil(points.length / 8);
  return chartFrame(`${yGrid(max, w, top, bottom, left)}
    <path d="${area}" fill="${COLORS.encaisse}" opacity=".12"/>
    <path d="${path}" fill="none" stroke="${COLORS.encaisse}" stroke-width="2" stroke-linejoin="round"/>
    ${points.map((p, i) => `<g><circle cx="${x(i)}" cy="${y(p.value)}" r="${p.value ? 3 : 0}" fill="${COLORS.encaisse}" stroke="#fff" stroke-width="2"/><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="10" fill="transparent"><title>${escapeHtml(p.full)} : ${formatMoney(p.value)} ${escapeHtml(devise)}</title></circle></g>`).join('')}
    ${points.map((p, i) => ((i % step === 0 && (points.length - 1 - i >= step * 0.6 || i === points.length - 1)) || i === points.length - 1 ? `<text x="${x(i)}" y="216" text-anchor="${i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}" font-size="13" fill="${COLORS.ink}">${escapeHtml(p.label)}</text>` : '')).join('')}`, w, h);
}

export function groupedBars(groups, devise, series) {
  const w = 560; const h = 240; const left = 52; const top = 12; const bottom = 196;
  const max = Math.max(...groups.flatMap((g) => series.map((s) => g[s.key])), 100);
  const slot = (w - left - 10) / Math.max(groups.length, 1);
  const bw = Math.min(26, slot / (series.length + 1));
  return chartFrame(`${yGrid(max, w, top, bottom, left)}
    ${groups.map((g, gi) => series.map((s, si) => {
      const bh = Math.max((bottom - top) * g[s.key] / max, g[s.key] ? 2 : 0);
      const bx = left + slot * gi + slot / 2 - (series.length * bw) / 2 + si * bw;
      return `<rect x="${bx.toFixed(1)}" y="${(bottom - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${s.color}"><title>${escapeHtml(g.label)} — ${s.name} : ${formatMoney(g[s.key])} ${escapeHtml(devise)}</title></rect>`;
    }).join('')).join('')}
    ${groups.map((g, gi) => `<text x="${left + slot * gi + slot / 2}" y="222" text-anchor="middle" font-size="13" fill="${COLORS.ink}">${escapeHtml(g.label.length > 11 ? `${g.label.slice(0, 10)}…` : g.label)}</text>`).join('')}`, w, h);
}

export function donut(segments, unit = 'élèves', fmt = (v) => v) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 52; const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = total ? segments.filter((s) => s.value).map((s) => {
    const len = c * s.value / total;
    const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${escapeHtml(s.label)} : ${s.value} (${Math.round(s.value / total * 100)}%)</title></circle>`;
    offset += len;
    return el;
  }).join('') : `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${COLORS.grid}" stroke-width="22"/>`;
  return `<div class="donut-wrap">${chartFrame(`${rings}<text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="#1f2937">${unit === 'élèves' ? total : short(total)}</text><text x="70" y="84" text-anchor="middle" font-size="13" fill="${COLORS.ink}">${escapeHtml(unit)}</text>`, 140, 140)}
    <ul class="legend">${segments.map((s) => `<li><i style="background:${s.color}"></i>${escapeHtml(s.label)} <b>${escapeHtml(String(fmt(s.value)))}</b></li>`).join('')}</ul></div>`;
}

export function classBars(rows) {
  if (!rows.length) return '<p class="meta">Aucune classe pour cette sélection.</p>';
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" title="${escapeHtml(r.label)} : ${r.rate}% recouvré">
    <span class="hbar-label">${escapeHtml(r.label)}</span>
    <span class="hbar-track"><i style="width:${Math.min(r.rate, 100)}%"></i></span>
    <span class="hbar-val">${r.rate}%</span></div>`).join('')}</div>`;
}


// Courbes à plusieurs séries (ex. période sélectionnée / période précédente, encaissements / dépenses).
// points : [{ label, full, values: [v1, v2…] }] ; series : [{ name, color, dashed }]
export function multiLineChart(points, series, devise) {
  if (!points.length) return '<p class="meta">Aucune donnée pour cette période.</p>';
  const w = 560; const h = 240; const left = 56; const top = 12; const bottom = 196;
  const max = Math.max(...points.flatMap((p) => p.values), 100);
  const x = (i) => left + (points.length === 1 ? (w - left - 14) / 2 : (w - left - 14) * i / (points.length - 1));
  const y = (v) => bottom - (bottom - top) * v / max;
  const step = Math.ceil(points.length / 8);
  const lines = series.map((s, k) => {
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[k] || 0).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.values[k] || 0).toFixed(1)}" r="${points.length > 40 ? 0 : 3}" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(p.full || p.label)} — ${escapeHtml(s.name)} : ${formatMoney(p.values[k] || 0)} ${escapeHtml(devise)}</title></circle>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="6 5"' : ''}/>${dots}`;
  }).join('');
  const area = series[0] ? `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[0] || 0).toFixed(1)}`).join(' ')} L${x(points.length - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z" fill="${series[0].color}" opacity=".08"/>` : '';
  const labels = points.map((p, i) => ((i % step === 0 && points.length - 1 - i >= step * 0.6) || i === points.length - 1 ? `<text x="${x(i).toFixed(1)}" y="220" text-anchor="${i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}" font-size="12" fill="${COLORS.ink}">${escapeHtml(p.label)}</text>` : '')).join('');
  return chartFrame(`${yGrid(max, w, top, bottom, left)}${area}${lines}${labels}`, w, h);
}

// Légende courte pour les graphiques à plusieurs séries
export function legendHtml(series) {
  return `<ul class="legend inline">${series.map((s) => `<li><i style="background:${s.color}${s.dashed ? ';opacity:.6' : ''}"></i>${escapeHtml(s.name)}</li>`).join('')}</ul>`;
}
