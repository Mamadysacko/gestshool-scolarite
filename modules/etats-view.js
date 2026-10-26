import { escapeHtml, formatMoney, todayISO, downloadCsv, downloadExcel } from './utils.js';
import { ETATS, GRANULARITES, construireEtat, descriptionFiltres, filtresEtatsDefaut, budgetDe } from './etats.js';
import { CATEGORIES } from './classes.js';
import { MODES_PAIEMENT } from './paiements.js';
import { comptesActifs } from './comptes.js';
import { enteteHtml, enteteLignes } from './entete.js';
import { printDocument } from './print.js';
import { can } from './auth.js';

// Page « États financiers » : choix du rapport, filtres, tableau, exports (PDF par impression, Excel, CSV).

export const etatsFilters = { type: 'attendus', yearId: 0, category: '', classId: 0, from: '', to: '', agent: '', mode: '', compteId: 0, gran: 'mois', search: '' };

export function resetEtatsFilters(state) {
  Object.assign(etatsFilters, filtresEtatsDefaut(state), { type: etatsFilters.type || 'attendus' });
}

// Filtres utiles par rapport (les autres sont masqués pour éviter toute confusion)
const FILTRES = {
  attendus: ['yearId', 'category', 'classId'], debiteurs: ['yearId', 'category', 'classId', 'search'], retards: ['yearId', 'category', 'classId', 'from', 'to'],
  reductions: ['yearId', 'category', 'classId'], recettes: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'mode', 'compteId', 'gran'],
  agents: ['yearId', 'category', 'classId', 'from', 'to', 'mode', 'compteId'], modes: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'compteId'],
  depenses: ['yearId', 'from', 'to', 'agent', 'mode', 'compteId', 'gran'], 'journal-caisse': ['compteId', 'from', 'to', 'agent'], tresorerie: ['yearId', 'from', 'to'],
  clotures: ['compteId', 'from', 'to', 'agent'], comparaison: [], budget: ['yearId'], annulations: ['yearId', 'from', 'to', 'agent'],
  transactions: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'mode', 'compteId']
};

const cellule = (v, money) => (money && typeof v === 'number' ? formatMoney(v) : escapeHtml(v === null || v === undefined ? '' : String(v)));

export function renderEtatsOutput(state) {
  const out = document.getElementById('etats-output');
  if (!out) return;
  const e = construireEtat(state, etatsFilters);
  const devise = escapeHtml(state.config.devise || '');
  const money = new Set(e.money || []);
  out.innerHTML = `
    <div class="r-title"><h3>${escapeHtml(e.titre)}${e.sousTitre ? ` — ${escapeHtml(e.sousTitre)}` : ''}</h3><span class="meta">${escapeHtml(descriptionFiltres(state, etatsFilters))} · montants en ${devise || 'devise de l’établissement'}</span></div>
    ${can('export') ? `<div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="etats:print">Imprimer / PDF</button><button type="button" class="secondary-btn small-btn" data-action="etats:excel">Excel</button><button type="button" class="secondary-btn small-btn" data-action="etats:csv">CSV</button></div>` : ''}
    <div class="table-wrap"><table>
      <thead><tr>${e.colonnes.map((c, i) => `<th class="${money.has(i) ? 'num' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${e.lignes.map((l) => `<tr>${l.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${e.colonnes.length}" class="meta">Aucune donnée pour ces filtres.</td></tr>`}</tbody>
      ${e.total ? `<tfoot><tr>${e.total.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}"><b>${cellule(v, money.has(i))}</b></td>`).join('')}</tr></tfoot>` : ''}
    </table></div>
    ${(e.notes || []).filter(Boolean).map((n) => `<p class="meta">${escapeHtml(n)}</p>`).join('')}
    ${e.id === 'budget' && can('scolarite.parametrer') ? budgetForm(state) : ''}`;
}

function budgetForm(state) {
  const anneeId = Number(etatsFilters.yearId) || state.anneeActiveId;
  if (!anneeId) return '';
  const b = budgetDe(state, anneeId);
  return `<details class="panel" open><summary><b>Saisir le budget prévisionnel de l’année</b></summary>
    <form class="form-grid compact" data-form="budget" autocomplete="off">
      <input type="hidden" name="anneeId" value="${anneeId}" />
      <label>Recettes de scolarité prévues <input name="recettesScolarite" type="number" min="0" step="1" value="${b.recettesScolarite}" /></label>
      <label>Autres recettes prévues <input name="autresRecettes" type="number" min="0" step="1" value="${b.autresRecettes}" /></label>
      <label class="span-all">Dépenses prévues par catégorie (une ligne « Catégorie = montant »)
        <textarea name="depenses" rows="6">${escapeHtml(b.depenses.map((d) => `${d.categorie} = ${d.montant}`).join(String.fromCharCode(10)))}</textarea></label>
      <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Enregistrer le budget</button></div>
    </form></details>`;
}

export function renderEtats(state) {
  const section = document.getElementById('etats');
  if (!section) return;
  const f = etatsFilters;
  const visibles = new Set(FILTRES[f.type] || []);
  const show = (k) => (visibles.has(k) ? '' : 'hidden');
  const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === Number(f.yearId)) && (!f.category || c.categorie === f.category));
  const agents = [...new Set([...state.paiements, ...state.depenses].map((p) => p.utilisateur || p.caissier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const groupes = [...new Set(ETATS.map((e) => e.groupe))];
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Comptabilité et rapports</span><h2>États financiers</h2></div></div>
    <div class="panel">
      <p class="meta">Gestion de trésorerie et de recouvrement : ces états ne constituent pas une comptabilité générale (pas de plan comptable ni d’écritures en partie double) et ne prétendent à aucune conformité comptable ou fiscale. Ils peuvent être remis au comptable de l’établissement.</p>
      ${groupes.map((g) => `<div class="report-tabs"><span class="eyebrow">${escapeHtml(g)}</span>${ETATS.filter((e) => e.groupe === g).map((e) => `<button type="button" class="tab-btn ${e.id === f.type ? 'active' : ''}" data-etat="${e.id}">${escapeHtml(e.label)}</button>`).join('')}</div>`).join('')}
      <div class="advanced-search">
        <label ${show('yearId')}>Année scolaire <select data-ef="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === Number(f.yearId) ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
        <label ${show('category')}>Catégorie <select data-ef="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${c === f.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label>
        <label ${show('classId')}>Classe <select data-ef="classId"><option value="0">Toutes</option>${classes.map((c) => `<option value="${c.id}" ${c.id === Number(f.classId) ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></label>
        <label ${show('from')}>Du <input type="date" data-ef="from" value="${escapeHtml(f.from)}" /></label>
        <label ${show('to')}>Au <input type="date" data-ef="to" value="${escapeHtml(f.to)}" /></label>
        <label ${show('agent')}>Agent <select data-ef="agent"><option value="">Tous</option>${agents.map((a) => `<option value="${escapeHtml(a)}" ${a === f.agent ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
        <label ${show('mode')}>Mode de paiement <select data-ef="mode"><option value="">Tous</option>${Object.entries(MODES_PAIEMENT).map(([k, l]) => `<option value="${k}" ${k === f.mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label ${show('compteId')}>Compte <select data-ef="compteId"><option value="0">${f.type === 'journal-caisse' ? 'Compte principal' : 'Tous'}</option>${comptesActifs(state).map((c) => `<option value="${c.id}" ${c.id === Number(f.compteId) ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
        <label ${show('gran')}>Regrouper <select data-ef="gran">${Object.entries(GRANULARITES).map(([k, l]) => `<option value="${k}" ${k === f.gran ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label ${show('search')}>Élève <input type="search" data-ef="search" value="${escapeHtml(f.search)}" placeholder="Nom ou matricule" /></label>
      </div>
      <div id="etats-output"></div>
    </div>`;
  renderEtatsOutput(state);
}

export function setEtatsFilter(state, key, value) {
  etatsFilters[key] = ['yearId', 'classId', 'compteId'].includes(key) ? Number(value || 0) : value;
  if (key === 'yearId' || key === 'category') { etatsFilters.classId = 0; renderEtats(state); return; }
  if (key === 'search') { renderEtatsOutput(state); return; }
  renderEtatsOutput(state);
}

export function selectEtat(state, type) {
  etatsFilters.type = ETATS.some((e) => e.id === type) ? type : 'attendus';
  renderEtats(state);
}

// Lignes exportées : en-tête de l'établissement, titre, filtres, colonnes, données (montants bruts), total
export function lignesExport(state, f = etatsFilters) {
  const e = construireEtat(state, f);
  const marque = (row, kind) => Object.assign([...row], { kind });
  return { e, rows: [marque([`${e.titre}${e.sousTitre ? ` — ${e.sousTitre}` : ''}`], 'title'), marque([descriptionFiltres(state, f)], 'section'), marque([`Édité le ${new Date().toLocaleString('fr-FR')}`], 'section'), [], marque(e.colonnes, 'head'), ...e.lignes, ...(e.total ? [marque(e.total, 'foot')] : [])] };
}

export function exportEtat(state, format) {
  const { e, rows } = lignesExport(state);
  const base = `${e.id}-${todayISO()}`;
  if (format === 'csv') downloadCsv(`${base}.csv`, rows);
  else downloadExcel(`${base}.xls`, e.titre, [...enteteLignes(state.config).map((r) => Object.assign(r, { kind: 'entete' })), [], ...rows]);
  return e;
}

export function printEtat(state) {
  const e = construireEtat(state, etatsFilters);
  const money = new Set(e.money || []);
  const html = `${enteteHtml(state.config, { compact: true })}
    <div class="r-title"><h2>${escapeHtml(e.titre)}${e.sousTitre ? ` — ${escapeHtml(e.sousTitre)}` : ''}</h2><span>${escapeHtml(descriptionFiltres(state, etatsFilters))}</span></div>
    <table><thead><tr>${e.colonnes.map((c, i) => `<th class="${money.has(i) ? 'num' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${e.lignes.map((l) => `<tr>${l.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr>`).join('')}</tbody>
      ${e.total ? `<tfoot><tr>${e.total.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr></tfoot>` : ''}</table>
    ${(e.notes || []).filter(Boolean).map((n) => `<p>${escapeHtml(n)}</p>`).join('')}
    <p>Édité le ${escapeHtml(new Date().toLocaleString('fr-FR'))} — montants en ${escapeHtml(state.config.devise || '')}</p>`;
  return printDocument({ title: e.titre, html, page: e.colonnes.length > 7 ? 'A4 landscape' : 'A4 portrait', fileName: `${e.id}-${todayISO()}` }) ? e : null;
}
