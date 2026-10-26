import { escapeHtml, formatDateFr, todayISO, downloadExcel } from './utils.js';
import { enteteHtml, enteteLignes } from './entete.js';
import { printDocument } from './print.js';
import { can } from './auth.js';

// Présentation uniforme de toutes les listes (tableaux marqués data-list="…") :
// barre d'outils (nombre de résultats, Ajouter, Excel, PDF / Imprimer), pagination et lignes par page.
// La pagination s'applique APRÈS les filtres de la page (lignes masquées par un filtre exclues) ; les exports
// reprennent toutes les lignes filtrées (toutes pages), jamais les lignes masquées par un filtre.
const SIZES = [10, 25, 50, 100];
const pages = new Map();
let ctx = { state: null };

const isEmptyRow = (row) => row.cells.length === 1 && row.cells[0].colSpan > 1;
const visibleRows = (table) => [...(table.tBodies[0]?.rows || [])].filter((r) => !r.hidden && !isEmptyRow(r));

function toolbarHtml(table, info) {
  const add = table.dataset.listAdd;
  return `<div class="list-toolbar-info"><b>${info.total}</b> ${info.total > 1 ? 'résultats' : 'résultat'}${info.pages > 1 ? ` · ${info.from}–${info.to}` : ''}</div>
    <div class="list-toolbar-actions">
      ${add && can('write') ? `<button type="button" class="primary-btn small-btn" data-list-add="${escapeHtml(add)}">+ Ajouter</button>` : ''}
      ${can('export') ? `<button type="button" class="secondary-btn small-btn" data-list-export="excel" data-list-id="${escapeHtml(table.dataset.list)}" ${info.total ? '' : 'disabled'}>Excel</button>
      <button type="button" class="secondary-btn small-btn" data-list-export="pdf" data-list-id="${escapeHtml(table.dataset.list)}" ${info.total ? '' : 'disabled'}>PDF / Imprimer</button>` : ''}
    </div>`;
}

function pagerHtml(table, info) {
  if (info.total <= SIZES[0]) return '';
  const id = escapeHtml(table.dataset.list);
  return `<label class="list-size">Lignes par page <select data-list-size="${id}">${SIZES.map((s) => `<option value="${s}" ${s === info.size ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <div class="list-pages" role="navigation" aria-label="Pagination">
      <button type="button" class="secondary-btn small-btn" data-list-page="${id}" data-to="prev" ${info.page === 0 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
      <span>Page ${info.page + 1} / ${info.pages}</span>
      <button type="button" class="secondary-btn small-btn" data-list-page="${id}" data-to="next" ${info.page >= info.pages - 1 ? 'disabled' : ''} aria-label="Page suivante">›</button>
    </div>`;
}

function setHtml(el, html) {
  if (el.innerHTML !== html) el.innerHTML = html; // évite toute boucle avec l'observateur de mutations
}

function enhance(table) {
  const id = table.dataset.list;
  const wrap = table.closest('.table-wrap') || table;
  const rows = visibleRows(table);
  const st = pages.get(id) || { page: 0, size: 25, total: -1 };
  if (st.total !== rows.length) st.page = 0; // nouveau filtre : retour à la première page
  st.total = rows.length;
  const nbPages = Math.max(1, Math.ceil(rows.length / st.size));
  st.page = Math.min(st.page, nbPages - 1);
  pages.set(id, st);
  [...(table.tBodies[0]?.rows || [])].forEach((r) => r.classList.remove('pg-off'));
  rows.forEach((r, i) => r.classList.toggle('pg-off', i < st.page * st.size || i >= (st.page + 1) * st.size));
  const info = { total: rows.length, page: st.page, pages: nbPages, size: st.size, from: rows.length ? st.page * st.size + 1 : 0, to: Math.min((st.page + 1) * st.size, rows.length) };
  let bar = wrap.previousElementSibling;
  if (!bar?.matches?.(`.list-toolbar[data-for="${CSS.escape(id)}"]`)) {
    bar = document.createElement('div');
    bar.className = 'list-toolbar';
    bar.dataset.for = id;
    wrap.before(bar);
  }
  setHtml(bar, toolbarHtml(table, info));
  let pager = wrap.nextElementSibling;
  if (!pager?.matches?.(`.list-pager[data-for="${CSS.escape(id)}"]`)) {
    pager = document.createElement('div');
    pager.className = 'list-pager';
    pager.dataset.for = id;
    wrap.after(pager);
  }
  setHtml(pager, pagerHtml(table, info));
}

export function enhanceLists(root = document) {
  root.querySelectorAll('table[data-list]').forEach(enhance);
}

// Colonnes exportées : toutes sauf « Actions » et les colonnes sans titre (photo, sélection)
function exportColumns(table) {
  return [...table.tHead.rows[0].cells].map((th, i) => ({ i, label: th.textContent.trim() })).filter((c) => c.label && !/^actions?$/i.test(c.label) && !table.tHead.rows[0].cells[c.i].hasAttribute('data-noexport'));
}

const cellText = (cell) => (cell?.innerText || cell?.textContent || '').replace(/\s+/g, ' ').trim();

// Montant « 1 200 000 GNF » → nombre (mis en forme par Excel)
function asValue(text, devise) {
  const t = text.replace(new RegExp(`\\s*${devise}$`), '');
  return /^-?[\d\s  ]+$/.test(t) && /\d/.test(t) ? Number(t.replace(/[\s  ]/g, '')) : text;
}

// Filtres actifs du panneau de la liste (libellé : valeur), repris dans l'en-tête des exports
function filtersSummary(table) {
  // Les filtres peuvent être dans un panneau distinct de celui du tableau : on parcourt toute la page
  const page = table.closest('.content-section') || table.closest('.panel');
  const parts = [];
  page?.querySelectorAll('.advanced-search label, .search-bar label').forEach((label) => {
    const field = label.querySelector('input, select');
    if (!field || !field.value || field.type === 'hidden') return;
    const name = (label.childNodes[0]?.textContent || '').trim();
    const value = field.tagName === 'SELECT' ? field.selectedOptions[0]?.textContent : field.value;
    if (name && value && !/^tou(te)?s$/i.test(value)) parts.push(`${name} : ${field.type === 'date' ? formatDateFr(value) : value}`);
  });
  return parts.join(' · ');
}

export function exportList(id, format) {
  const table = document.querySelector(`table[data-list="${CSS.escape(id)}"]`);
  if (!table || !ctx.state || !can('export')) return false;
  const devise = ctx.state.config.devise;
  const cols = exportColumns(table);
  const rows = visibleRows(table).map((r) => cols.map((c) => cellText(r.cells[c.i])));
  const title = table.dataset.listTitle || 'Liste';
  const filtres = filtersSummary(table);
  const fileBase = `${title}-${todayISO()}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-');
  if (format === 'excel') {
    const tag = (row, kind) => Object.assign(row, { kind });
    const data = [...enteteLignes(ctx.state.config).map((l) => tag(l, 'entete')), [], tag([title], 'title'), [filtres || 'Aucun filtre'], [`Généré le ${formatDateFr(todayISO())} · ${rows.length} ligne(s)`], [],
      tag(cols.map((c) => c.label), 'head'), ...rows.map((r) => r.map((v) => asValue(v, devise)))];
    downloadExcel(`${fileBase}.xls`, title, data);
    return true;
  }
  const html = `${enteteHtml(ctx.state.config)}
    <div class="r-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(filtres || 'Aucun filtre')}</span><span>Généré le ${escapeHtml(formatDateFr(todayISO()))} · ${rows.length} ligne(s)</span></div>
    <table><thead><tr>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td class="${typeof asValue(v, devise) === 'number' ? 'num' : ''}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return printDocument({ title, html, css: '#print-root td { font-size: 10px; } #print-root th { font-size: 9px; }', page: cols.length > 7 ? 'A4 landscape' : 'A4 portrait', fileName: fileBase });
}

let timer = null;
export function bindLists(state) {
  ctx = { state };
  const main = document.querySelector('.main-panel') || document.body;
  // Toute mise à jour d'une liste (rendu, filtre) réapplique la pagination
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => enhanceLists(), 30); })
    .observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const pageBtn = event.target.closest('[data-list-page]');
    if (pageBtn) {
      const st = pages.get(pageBtn.dataset.listPage);
      if (st) { st.page += pageBtn.dataset.to === 'next' ? 1 : -1; enhanceLists(); }
      return;
    }
    const exp = event.target.closest('[data-list-export]');
    if (exp) { exportList(exp.dataset.listId, exp.dataset.listExport); return; }
    const add = event.target.closest('[data-list-add]');
    if (add) {
      const form = document.querySelector(add.dataset.listAdd);
      form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form?.querySelector('input:not([type=hidden]), select')?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('change', (event) => {
    const sel = event.target instanceof Element ? event.target.closest('[data-list-size]') : null;
    if (!sel) return;
    const st = pages.get(sel.dataset.listSize);
    if (st) { st.size = Number(sel.value); st.page = 0; enhanceLists(); }
  });
}
