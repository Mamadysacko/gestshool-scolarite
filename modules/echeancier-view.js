import { escapeHtml, formatMoney, formatDateFr } from './utils.js';
import { echeancierSituation, STATUT_ECHEANCE_LABELS, STATUT_GLOBAL_LABELS } from './allocation.js';

const BADGE = { soldee: 'ok', partielle: 'warning', impayee: 'neutral', retard: 'danger' };
const GLOBAL_BADGE = { solde: 'ok', partiel: 'warning', impaye: 'neutral', retard: 'danger' };

export const progressBar = (percent, cls = '') => `<div class="progress-track ${cls}" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(Math.max(percent, 0), 100)}%"></i></div>`;

export function globalBadge(sit) {
  return `<span class="badge ${GLOBAL_BADGE[sit.statut]}">${STATUT_GLOBAL_LABELS[sit.statut]}</span>`;
}

// Tableau de l'échéancier : montant dû, payé, reste, statut et barre de progression par tranche / mensualité,
// suivi d'une barre de progression globale pour l'année scolaire.
export function echeancierHtml(state, inscription, { anneeLabel = '', highlight = [] } = {}) {
  const sit = echeancierSituation(inscription);
  const devise = escapeHtml(state.config.devise);
  if (!sit.lignes.length) return '<p class="meta">Aucun frais configuré pour cette inscription.</p>';
  const marked = new Set(highlight);
  const rows = sit.lignes.map((l) => `<tr class="${l.courante ? 'row-current' : ''} ${marked.has(l.echeance.id) ? 'row-hit' : ''}">
    <td><b>${escapeHtml(l.libelle)}</b>${l.courante ? ' <span class="badge info">en cours</span>' : ''}<div class="meta">Échéance ${escapeHtml(formatDateFr(l.echeance.dateLimite))}</div></td>
    <td class="num">${formatMoney(l.du)}</td><td class="num">${formatMoney(l.paye)}</td><td class="num">${formatMoney(l.reste)}</td>
    <td><span class="badge ${BADGE[l.statut]}">${STATUT_ECHEANCE_LABELS[l.statut]}</span>${l.avance ? `<div class="meta">dont ${formatMoney(l.avance)} payés d’avance</div>` : ''}</td>
    <td class="bar-cell">${progressBar(l.taux, l.statut === 'retard' ? 'late' : '')}<span class="meta">${l.taux}%</span></td></tr>`).join('');
  return `<div class="table-wrap"><table class="echeancier">
      <thead><tr><th>${anneeLabel ? escapeHtml(anneeLabel) : 'Échéance'}</th><th>Dû</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Avancement</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total année</td><td class="num">${formatMoney(sit.total)}</td><td class="num">${formatMoney(sit.paye)}</td><td class="num">${formatMoney(sit.reste)} ${devise}</td><td>${globalBadge(sit)}</td><td class="bar-cell">${progressBar(sit.taux)}<span class="meta">${sit.taux}%</span></td></tr></tfoot>
    </table></div>
    <div class="echeancier-notes">
      <span>Soldées : <b>${sit.nbSoldees}/${sit.nbEcheances}</b></span>
      ${sit.nbRetards ? `<span class="late-note">En retard : <b>${formatMoney(sit.retardMontant)} ${devise}</b> (${sit.nbRetards})</span>` : '<span>Aucun retard</span>'}
      <span>Payé d’avance sur les échéances suivantes : <b>${formatMoney(sit.avanceMontant)} ${devise}</b></span>
    </div>`;
}

// Détail d'une imputation : montant affecté à chaque tranche / mensualité
export function allocationTableHtml(state, allocations) {
  const devise = escapeHtml(state.config.devise);
  if (!allocations.length) return '';
  return `<table class="alloc"><thead><tr><th>Imputé sur</th><th>Montant</th><th>Reste après</th></tr></thead><tbody>${allocations.map((a) => `<tr><td>${escapeHtml(a.libelle)}</td><td class="num">${formatMoney(a.montant)} ${devise}</td><td class="num">${a.soldee ? '<span class="badge ok">Soldée</span>' : `${formatMoney(a.resteApres)} ${devise}`}</td></tr>`).join('')}</tbody></table>`;
}
