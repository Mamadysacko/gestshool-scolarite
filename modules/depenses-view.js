import { escapeHtml, formatMoney, formatDateFr, todayISO, numberToFrench } from './utils.js';
import { CATEGORIES_DEPENSE, ensureExpenseNumber } from './depenses.js';
import { situationCaisse } from './tresorerie.js';
import { printDocument } from './print.js';
import { enteteHtml } from './entete.js';
import { can } from './auth.js';

export const depenseFilters = { yearId: 0, from: '', to: '', categorie: '', demandeur: '' };
const MAX_PIECE_BYTES = 300 * 1024;

export function resetDepenseFilters(state) {
  Object.assign(depenseFilters, { yearId: Number(state.anneeActiveId || 0), from: '', to: '', categorie: '', demandeur: '' });
}

// Lit la pièce justificative (image ou PDF léger) pour la conserver avec la dépense
export function readPiece(file) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (file.size > MAX_PIECE_BYTES) { reject(new Error('Pièce trop lourde (300 Ko maximum).')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ nom: file.name, type: file.type, data: String(reader.result) });
    reader.onerror = () => reject(new Error('Lecture de la pièce impossible.'));
    reader.readAsDataURL(file);
  });
}

export function categoriesInUse(state) {
  return [...new Set([...CATEGORIES_DEPENSE, ...state.depenses.map((d) => d.categorie)])].sort((a, b) => a.localeCompare(b, 'fr'));
}

const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';

export function renderDepenseOutput(state) {
  const out = document.getElementById('depense-output');
  if (!out) return;
  const f = depenseFilters;
  const devise = escapeHtml(state.config.devise);
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const caisse = situationCaisse(state, { yearId: f.yearId, from: f.from, to: f.to });
  const list = state.depenses
    .filter((d) => (!f.yearId || d.anneeId === f.yearId) && (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to) && (!f.categorie || d.categorie === f.categorie)
      && (!f.demandeur || String(d.demandeur).toLocaleLowerCase('fr').includes(f.demandeur.toLocaleLowerCase('fr'))))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  const admin = can('admin');
  out.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card accent-green"><div><span>Recettes encaissées</span><strong>${money(caisse.recettes)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Dépenses</span><strong>${money(caisse.depenses)}</strong></div></article>
      <article class="stat-card accent-purple"><div><span>Solde d’ouverture</span><strong>${money(caisse.ouverture)}</strong></div></article>
      <article class="stat-card ${caisse.solde < 0 ? 'accent-red' : 'accent-orange'}"><div><span>Solde disponible</span><strong>${money(caisse.solde)}</strong></div></article>
    </div>
    <p class="meta">Solde disponible = solde d’ouverture + recettes encaissées − dépenses enregistrées (paiements et dépenses annulés exclus).</p>
    <div class="table-wrap"><table>
      <thead><tr><th>N°</th><th>Date</th><th>Année</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire</th><th>Demandé par</th><th>Montant</th><th>État</th><th>Actions</th></tr></thead>
      <tbody>${list.map((d) => `<tr class="${d.annule ? 'cancelled' : ''}">
        <td>${escapeHtml(d.numero)}</td><td>${escapeHtml(formatDateFr(d.date))}</td><td>${escapeHtml(yearName(state, d.anneeId))}</td><td>${escapeHtml(d.categorie)}</td>
        <td>${escapeHtml(d.description)}${d.reference ? `<div class="meta">Réf. ${escapeHtml(d.reference)}</div>` : ''}${d.piece ? `<div class="meta"><a href="${escapeHtml(d.piece.data)}" download="${escapeHtml(d.piece.nom)}">📎 ${escapeHtml(d.piece.nom)}</a></div>` : ''}${(d.historique || []).length ? `<div class="meta">${d.historique.length} correction(s) tracée(s)</div>` : ''}</td>
        <td>${escapeHtml(d.beneficiaire || '—')}</td><td>${escapeHtml(d.demandeur)}</td><td class="num">${money(d.montant)}</td>
        <td><span class="badge ${d.annule ? 'danger' : 'ok'}">${d.annule ? 'Annulée' : 'Validée'}</span>${d.annule ? `<div class="meta">${escapeHtml(d.motif)}</div>` : ''}</td>
        <td>${d.annule ? '' : `<button class="action-btn" data-action="depense:receipt:${d.id}">Reçu</button>${admin ? `<button class="action-btn" data-action="depense:edit:${d.id}">Corriger</button><button class="action-btn delete" data-action="depense:cancel:${d.id}">Annuler</button>` : ''}`}</td>
      </tr>`).join('') || '<tr><td colspan="10">Aucune dépense pour cette sélection.</td></tr>'}</tbody>
    </table></div>`;
}

export function renderDepenses(state) {
  const section = document.getElementById('depenses');
  if (!section) return;
  if (!depenseFilters.yearId) resetDepenseFilters(state);
  const f = depenseFilters;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const writable = can('write');
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Trésorerie</span><h2>Dépenses et reçus de dépense</h2></div></div>
    ${writable ? `<div class="panel section-form">
      <div class="panel-header"><h3>Enregistrer une dépense</h3><span class="meta">Les recettes ne sont jamais enregistrées comme dépenses</span></div>
      <form class="form-grid compact" data-form="depense" autocomplete="off">
        <input type="hidden" name="token" value="${token}" />
        <label>Année scolaire <select name="anneeId">${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
        <label>Date <input name="date" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
        <label>Catégorie <input name="categorie" list="dep-categories" required placeholder="Choisir ou saisir" /><datalist id="dep-categories">${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist></label>
        <label>Montant (${escapeHtml(state.config.devise)}) <input name="montant" type="number" min="1" step="1" required /></label>
        <label class="span-two">Description <input name="description" type="text" required /></label>
        <label>Bénéficiaire <input name="beneficiaire" type="text" placeholder="Fournisseur, personne…" /></label>
        <label>Demandé par <input name="demandeur" type="text" required /></label>
        <label>N° de référence (facture, bon…) <input name="reference" type="text" /></label>
        <label>Pièce justificative (300 Ko max.) <input name="piece" type="file" accept="image/*,application/pdf" /></label>
        <label class="check-row"><input type="checkbox" name="imprimer" checked /> Imprimer le reçu de dépense</label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn" data-submit-label>Enregistrer la dépense</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
      </form>
    </div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Historique des dépenses</h3></div>
      <div class="advanced-search">
        <label>Année scolaire <select data-df="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
        <label>Du <input type="date" data-df="from" value="${escapeHtml(f.from)}" /></label>
        <label>Au <input type="date" data-df="to" value="${escapeHtml(f.to)}" /></label>
        <label>Catégorie <select data-df="categorie"><option value="">Toutes</option>${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}" ${c === f.categorie ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label>
        <label>Demandeur <input type="search" data-df="demandeur" value="${escapeHtml(f.demandeur)}" placeholder="Nom…" /></label>
      </div>
      <div id="depense-output"></div>
    </div>`;
  renderDepenseOutput(state);
}

function capitalize(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }

export function expenseAmountInWords(amount, devise) {
  const n = Math.floor(Number(amount) || 0);
  const unit = devise === 'GNF' ? `franc${n > 1 ? 's' : ''} guinéen${n > 1 ? 's' : ''}` : devise;
  return `${capitalize(numberToFrench(n))} ${unit}`;
}

const RECEIPT_CSS = `
  #print-root .dp-sheet { width: 210mm; box-sizing: border-box; padding: 8mm 12mm; }
  #print-root .dp-title { text-align: center; margin: 10px 0 6px; font-size: 16px; color: #fff; background: #7c3aed; padding: 5px; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #print-root .dp-refrow { display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; }
  #print-root .dp-refrow b { color: #c2410c; font-size: 15px; }
  #print-root .dp-body p { display: flex; gap: 10px; align-items: baseline; margin: 0; padding: 7px 0; border-bottom: 1px dotted #9ca3af; font-size: 13px; }
  #print-root .dp-body p span { flex: none; width: 34mm; color: #6b7280; font-size: 11px; }
  #print-root .dp-amount b { font-size: 20px; color: #c2410c; }
  #print-root .dp-sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16mm; font-size: 11px; }
  #print-root .dp-sign div { border-top: 1px solid #111827; padding-top: 4px; text-align: center; height: 22mm; }
`;

export function printExpenseReceipt(state, id) {
  const d = state.depenses.find((x) => x.id === Number(id));
  if (!d || d.annule) return false;
  ensureExpenseNumber(state, d);
  const c = state.config;
  const devise = escapeHtml(c.devise);
  const html = `<div class="dp-sheet">
    ${enteteHtml(c, { compact: true })}
    <div class="dp-refrow"><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}</span><span>Année scolaire : ${escapeHtml(yearName(state, d.anneeId))}</span></div>
    <h2 class="dp-title">REÇU DE DÉPENSE</h2>
    <div class="dp-body">
      <p class="dp-amount"><span>Montant</span><b>${formatMoney(d.montant)} ${devise}</b></p>
      <p><span>En lettres</span><b>${escapeHtml(expenseAmountInWords(d.montant, c.devise))}</b></p>
      <p><span>Catégorie</span><b>${escapeHtml(d.categorie)}</b></p>
      <p><span>Description</span><b>${escapeHtml(d.description)}</b></p>
      <p><span>Bénéficiaire</span><b>${escapeHtml(d.beneficiaire || '—')}</b></p>
      <p><span>Demandé par</span><b>${escapeHtml(d.demandeur)}</b></p>
      ${d.reference ? `<p><span>Référence</span><b>${escapeHtml(d.reference)}</b></p>` : ''}
      <p><span>Caissier</span><b>${escapeHtml(d.caissier || '—')}</b></p>
    </div>
    <div class="dp-sign"><div>Le demandeur</div><div>Le bénéficiaire</div><div>Le caissier</div><div>Le directeur / visa</div></div>
  </div>`;
  return printDocument({ title: `Dépense ${d.numero}`, html, css: RECEIPT_CSS });
}

export function setDepenseFilter(key, value) {
  depenseFilters[key] = key === 'yearId' ? Number(value || 0) : value;
}

