export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateFr(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n, final) {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    return u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) {
    const r = n - 60;
    return r === 11 ? 'soixante et onze' : `soixante-${below100(r, final)}`;
  }
  if (n === 80) return final ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${below100(n - 80, final)}`;
}

function below1000(n, final) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h === 1) parts.push('cent');
  else if (h > 1) parts.push(`${UNITS[h]} cent${r === 0 && final ? 's' : ''}`);
  if (r > 0) parts.push(below100(r, final));
  return parts.join(' ');
}

export function numberToFrench(value) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'zéro';
  const parts = [];
  for (const [size, name] of [[1e9, 'milliard'], [1e6, 'million']]) {
    const count = Math.floor(n / size);
    if (count) {
      parts.push(`${below1000(count, false)} ${name}${count > 1 ? 's' : ''}`);
      n %= size;
    }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
    n %= 1000;
  }
  if (n) parts.push(below1000(n, true));
  return parts.join(' ');
}

export function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(filename, `﻿${csv}`, 'text/csv;charset=utf-8');
}

// Excel ouvre nativement un tableau HTML enregistré en .xls ; les lignes marquées (kind) reçoivent une mise en forme
const XLS_STYLE = {
  entete: 'font-weight:bold;font-size:13pt;color:#1e3a8a',
  title: 'font-weight:bold;font-size:15pt;color:#7c3aed',
  section: 'font-weight:bold;font-size:12pt;color:#c2410c',
  kpi: 'font-weight:bold;background:#faf5ff',
  head: 'font-weight:bold;color:#ffffff;background:#7c3aed;border:1px solid #5b21b6',
  foot: 'font-weight:bold;background:#fff7ed;border:1px solid #fdba74'
};

export function downloadExcel(filename, title, rows) {
  const body = rows.map((row, index) => {
    const kind = row.kind || (index === 0 && !rows.some((r) => r.kind) ? 'head' : '');
    const style = XLS_STYLE[kind] || '';
    const tag = kind === 'head' ? 'th' : 'td';
    return `<tr>${row.map((cell) => {
      const numeric = typeof cell === 'number';
      const cellStyle = `${style};${numeric ? 'text-align:right;mso-number-format:"#,##0"' : ''};${!kind && row.length > 1 ? 'border:1px solid #e5e7eb' : ''}`;
      return `<${tag} style='${cellStyle}'>${escapeHtml(cell)}</${tag}>`;
    }).join('')}</tr>`;
  }).join('');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body><table style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">${body}</table></body></html>`;
  downloadBlob(filename, `﻿${html}`, 'application/vnd.ms-excel;charset=utf-8');
}
