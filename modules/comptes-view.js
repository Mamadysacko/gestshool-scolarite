import { escapeHtml, formatMoney, formatDateFr, todayISO } from './utils.js';
import { soldesComptes, comptesActifs, compteLabel, TYPES_COMPTE } from './comptes.js';
import { can } from './auth.js';

// Page « Comptes et virements » : soldes de chaque caisse / compte et virements internes (dépôt en banque,
// approvisionnement de caisse). Les comptes se créent dans Administration → Paramètres financiers.

export function comptesTableHtml(state, { actions = false } = {}) {
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const soldes = soldesComptes(state);
  return `<div class="table-wrap"><table class="data-list" data-list="comptes" data-list-title="Comptes financiers">
    <thead><tr><th>Compte</th><th>Type</th><th>N° / référence</th><th>Solde initial</th><th>Encaissements</th><th>Autres entrées</th><th>Dépenses</th><th>Virements reçus</th><th>Virements émis</th><th>Solde</th>${actions ? '<th>Actions</th>' : ''}</tr></thead>
    <tbody>${soldes.map((s) => `<tr class="${s.compte.actif === false ? 'cancelled' : ''}">
      <td><b>${escapeHtml(s.compte.libelle)}</b>${s.compte.principal ? ' <span class="badge info">principal</span>' : ''}${s.compte.actif === false ? ' <span class="badge neutral">désactivé</span>' : ''}</td>
      <td>${escapeHtml(TYPES_COMPTE[s.compte.type])}</td><td>${escapeHtml(s.compte.numero || '—')}</td>
      <td class="num">${money(s.soldeInitial)}</td><td class="num">${money(s.encaissements)}</td><td class="num">${money(s.autres)}</td><td class="num">${money(s.depenses)}</td>
      <td class="num">${money(s.entrants)}</td><td class="num">${money(s.sortants)}</td><td class="num"><b class="${s.solde < 0 ? 'neg' : ''}">${money(s.solde)}</b></td>
      ${actions ? `<td><button class="action-btn" data-action="compte:edit:${s.compte.id}">Modifier</button>${s.compte.principal ? '' : `<button class="action-btn" data-action="compte:toggle:${s.compte.id}">${s.compte.actif === false ? 'Réactiver' : 'Désactiver'}</button>`}</td>` : ''}
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="9">Total de tous les comptes</td><td class="num"><b>${money(soldes.reduce((t, s) => t + s.solde, 0))}</b></td>${actions ? '<td></td>' : ''}</tr></tfoot>
  </table></div>`;
}

export function renderComptes(state) {
  const section = document.getElementById('comptes');
  if (!section) return;
  const devise = escapeHtml(state.config.devise || '');
  const actifs = comptesActifs(state);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const virements = [...(state.virements || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Trésorerie</span><h2>Comptes financiers et virements internes</h2></div>
      ${can('admin') ? '<button type="button" class="secondary-btn small-btn" data-nav="config-finances">Gérer les comptes</button>' : ''}</div>
    <div class="panel">
      <div class="panel-header"><h3>Soldes des comptes</h3><span class="meta">Solde = solde initial + encaissements + autres entrées − dépenses + virements reçus − virements émis (opérations annulées exclues)</span></div>
      ${comptesTableHtml(state)}
    </div>
    ${can('write') ? `<div class="panel section-form">
      <div class="panel-header"><h3>Virement interne</h3><span class="meta">Dépôt de la caisse en banque, retrait pour approvisionner la caisse… Les recettes et dépenses ne changent pas.</span></div>
      ${actifs.length < 2 ? '<p class="meta">Créez au moins deux comptes (ex. Caisse principale et Banque) dans Administration → Paramètres financiers pour enregistrer un virement.</p>' : `
      <form class="form-grid compact" data-form="virement" autocomplete="off">
        <input type="hidden" name="token" value="${token}" />
        <label>Du compte <select name="deId" required>${actifs.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
        <label>Vers le compte <select name="versId" required>${actifs.map((c, i) => `<option value="${c.id}" ${i === 1 ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
        <label>Montant (${devise}) <input name="montant" type="number" min="1" step="1" required /></label>
        <label>Date <input name="date" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
        <label class="span-two">Motif <input name="motif" type="text" required placeholder="Ex. dépôt des recettes de la semaine" /></label>
        <label>Référence (bordereau…) <input name="reference" type="text" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer le virement</button></div>
      </form>`}
    </div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Historique des virements internes</h3><span class="meta">${virements.length} virement(s) · annulations conservées</span></div>
      <div class="table-wrap"><table class="data-list" data-list="virements" data-list-title="Virements internes">
        <thead><tr><th>N°</th><th>Date</th><th>De</th><th>Vers</th><th>Montant</th><th>Motif</th><th>Saisi par</th><th>État</th><th>Actions</th></tr></thead>
        <tbody>${virements.map((v) => `<tr class="${v.annule ? 'cancelled' : ''}"><td>${escapeHtml(v.numero)}</td><td>${escapeHtml(formatDateFr(v.date))}</td>
          <td>${escapeHtml(compteLabel(state, v.deId))}</td><td>${escapeHtml(compteLabel(state, v.versId))}</td><td class="num">${formatMoney(v.montant)} ${devise}</td>
          <td>${escapeHtml(v.motif)}${v.reference ? `<div class="meta">Réf. ${escapeHtml(v.reference)}</div>` : ''}</td><td>${escapeHtml(v.utilisateur || '—')}</td>
          <td><span class="badge ${v.annule ? 'danger' : 'ok'}">${v.annule ? 'Annulé' : 'Validé'}</span>${v.annule ? `<div class="meta">${escapeHtml(v.motifAnnulation || '')}</div>` : ''}</td>
          <td>${!v.annule && can('write') ? `<button class="action-btn delete" data-action="virement:cancel:${v.id}">Annuler</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">Aucun virement interne.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
