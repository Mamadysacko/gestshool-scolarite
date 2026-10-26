import { escapeHtml, formatMoney, formatDateFr } from './utils.js';
import { situationReliquat, STATUT_RELIQUAT, soldesReportables } from './reliquats.js';
import { studentOf, classOf } from './finance.js';
import { can } from './auth.js';

// Page « Dettes antérieures » : registre des soldes reportés d'une année sur l'autre.
export const detteFilters = { search: '', statut: 'en_cours', reportCible: 0, reportSelection: [] };
const BADGE = { du: 'danger', partiel: 'warning', solde: 'ok' };
const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';

function rows(state) {
  const q = detteFilters.search.trim().toLocaleLowerCase('fr');
  return (state.reliquats || []).map((r) => situationReliquat(state, r)).filter((r) => {
    if (detteFilters.statut === 'en_cours' && r.statut === 'solde') return false;
    if (detteFilters.statut === 'solde' && r.statut !== 'solde') return false;
    if (!q) return true;
    const s = studentOf(state, r.inscription);
    return `${s?.prenom || ''} ${s?.nom || ''} ${s?.matricule || ''}`.toLocaleLowerCase('fr').includes(q);
  }).sort((a, b) => b.reste - a.reste || a.id - b.id);
}

export function renderDettesOutput(state) {
  const out = document.getElementById('dettes-output');
  if (!out) return;
  const devise = escapeHtml(state.config.devise);
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const all = (state.reliquats || []).map((r) => situationReliquat(state, r));
  const list = rows(state);
  const writable = can('write');
  out.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Dettes reportées</span><strong>${all.length}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Montant reporté</span><strong>${money(all.reduce((s, r) => s + r.montantReporte, 0))}</strong></div></article>
      <article class="stat-card accent-green"><div><span>Remboursé</span><strong>${money(all.reduce((s, r) => s + r.rembourse, 0))}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Reste à recouvrer</span><strong>${money(all.reduce((s, r) => s + r.reste, 0))}</strong></div></article>
    </div>
    <div class="table-wrap"><table class="data-list" data-list="dettes" data-list-title="Dettes des années précédentes">
      <thead><tr><th>Élève</th><th>Année d’origine</th><th>Classe d’origine</th><th>Reporté le</th><th>Reporté sur</th><th>Montant initial</th><th>Réglé avant report</th><th>Montant reporté</th><th>Remboursé</th><th>Reste dû</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${list.map((r) => {
        const s = studentOf(state, r.inscription);
        return `<tr>
          <td><b>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</b><div class="meta">${escapeHtml(s?.matricule || '—')}</div></td>
          <td>${escapeHtml(yearName(state, r.anneeOrigineId))}</td><td>${escapeHtml(classOf(state, r.inscription?.classeId)?.nom || '—')}</td>
          <td>${escapeHtml(formatDateFr(r.dateReport))}</td><td>${escapeHtml(r.anneeReportId ? yearName(state, r.anneeReportId) : 'Année active')}</td>
          <td class="num">${r.montantInitial !== undefined ? money(r.montantInitial) : '—'}</td><td class="num">${r.regleAvantReport !== undefined ? money(r.regleAvantReport) : '—'}</td>
          <td class="num">${money(r.montantReporte)}</td><td class="num">${money(r.rembourse)}</td><td class="num"><b>${money(r.reste)}</b></td>
          <td><span class="badge ${BADGE[r.statut]}">${STATUT_RELIQUAT[r.statut]}</span></td>
          <td><button class="action-btn" data-action="dette:view:${r.id}">Historique</button>${writable && r.reste > 0 ? `<button class="action-btn" data-action="dette:pay:${r.id}">Encaisser</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="12">Aucune dette antérieure pour cette sélection.</td></tr>'}</tbody>
    </table></div>`;
}

// Reprise explicite des soldes d'années antérieures sur une année choisie (sélection multiple)
function reportPanel(state) {
  const cibleId = Number(detteFilters.reportCible) || state.anneeActiveId;
  detteFilters.reportCible = cibleId;
  const list = soldesReportables(state, cibleId);
  const sel = new Set((detteFilters.reportSelection || []).map(Number).filter((id) => list.some((x) => x.inscription.id === id)));
  detteFilters.reportSelection = [...sel];
  const devise = escapeHtml(state.config.devise);
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const total = list.filter((x) => sel.has(x.inscription.id)).reduce((s, x) => s + x.reste, 0);
  return `<div class="panel" id="report-soldes">
    <div class="panel-header"><h3>Reporter des soldes impayés</h3><span class="meta">Procédure explicite : seuls les soldes cochés sont repris sur l’année choisie</span></div>
    <div class="advanced-search"><label>Reporter sur l’année <select data-dettes-report="cible">${state.annees.map((a) => `<option value="${a.id}" ${a.id === cibleId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label></div>
    <div class="table-wrap"><table class="data-list" data-list="soldes-reportables" data-list-title="Soldes impayés reportables">
      <thead><tr><th data-noexport><input type="checkbox" data-dettes-report-all aria-label="Tout cocher" /></th><th>Élève</th><th>Année d’origine</th><th>Classe</th><th>Montant initial</th><th>Déjà réglé</th><th>Solde à reporter</th><th>Inscrit sur l’année cible</th></tr></thead>
      <tbody>${list.map((x) => `<tr><td><input type="checkbox" data-dettes-report-check="${x.inscription.id}" ${sel.has(x.inscription.id) ? 'checked' : ''} aria-label="Reporter" /></td>
        <td><b>${escapeHtml(x.eleve ? `${x.eleve.prenom} ${x.eleve.nom}` : '—')}</b><div class="meta">${escapeHtml(x.eleve?.matricule || '—')}</div></td><td>${escapeHtml(yearName(state, x.inscription.anneeId))}</td>
        <td>${escapeHtml(classOf(state, x.inscription.classeId)?.nom || '—')}</td><td class="num">${money(x.total)}</td><td class="num">${money(x.paye)}</td><td class="num"><b>${money(x.reste)}</b></td><td>${x.inscritCible ? 'Oui' : 'Non'}</td></tr>`).join('') || '<tr><td colspan="8">Aucun solde impayé d’une année antérieure à reporter.</td></tr>'}</tbody>
    </table></div>
    <div class="form-actions"><button type="button" class="primary-btn" data-action="dettes:reporter" ${sel.size ? '' : 'disabled'}>Reporter ${sel.size} solde(s) (${money(total)}) sur ${escapeHtml(yearName(state, cibleId))}</button></div>
  </div>`;
}

export function renderDettes(state) {
  const section = document.getElementById('dettes');
  if (!section) return;
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Recouvrement</span><h2>Dettes des années précédentes</h2></div></div>
    <div class="panel">
      <p class="meta">Un solde impayé n’est reporté que sur décision explicite (panneau « Reporter des soldes impayés » ci-dessous). La dette reste rattachée à l’année d’origine, avec son montant initial et ce qui avait déjà été réglé (aucun double comptage) ; ses règlements sont encaissés sur l’année de report et tracés ici.</p>
      <div class="advanced-search">
        <label>Recherche <input type="search" data-dettes="search" value="${escapeHtml(detteFilters.search)}" placeholder="Nom ou matricule" autocomplete="off" /></label>
        <label>Statut <select data-dettes="statut">${[['en_cours', 'Restant à recouvrer'], ['solde', 'Soldées'], ['', 'Toutes']].map(([v, l]) => `<option value="${v}" ${v === detteFilters.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div id="dettes-output"></div>
    </div>
    ${can('write') ? reportPanel(state) : ''}`;
  renderDettesOutput(state);
}

// Historique d'une dette : report et chaque règlement (n° de reçu, date, montant)
export function showDetteDetail(state, id) {
  const record = (state.reliquats || []).find((r) => r.id === Number(id));
  const root = document.getElementById('modal-root');
  if (!record || !root) return false;
  const r = situationReliquat(state, record);
  const s = studentOf(state, r.inscription);
  const money = (v) => `${formatMoney(v)} ${escapeHtml(state.config.devise)}`;
  root.innerHTML = `<div class="modal-backdrop" data-modal-close>
    <section class="student-modal" role="dialog" aria-modal="true">
      <header class="modal-header"><div><span class="eyebrow">Dette antérieure</span><h2>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')} — ${escapeHtml(yearName(state, r.anneeOrigineId))}</h2>
        <span class="meta">Reportée le ${escapeHtml(formatDateFr(r.dateReport))} · ${STATUT_RELIQUAT[r.statut]}</span></div>
        <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
      <div class="profile-section"><div class="profile-grid">
        <div class="profile-metric"><span>Montant reporté</span><strong>${money(r.montantReporte)}</strong></div>
        <div class="profile-metric"><span>Remboursé</span><strong>${money(r.rembourse)}</strong></div>
        <div class="profile-metric"><span>Reste dû</span><strong>${money(r.reste)}</strong></div></div></div>
      <div class="profile-section"><h3>Règlements</h3><div class="table-wrap"><table><thead><tr><th>N° reçu</th><th>Date</th><th>Montant</th><th>Encaissé sur</th></tr></thead>
        <tbody>${r.reglements.map((p) => `<tr><td>${escapeHtml(p.numeroRecu || '—')}</td><td>${escapeHtml(formatDateFr(p.datePaiement))}</td><td>${money(p.montant)}</td><td>${escapeHtml(yearName(state, p.anneeEncaissementId))}</td></tr>`).join('') || '<tr><td colspan="4">Aucun règlement pour le moment.</td></tr>'}</tbody></table></div></div>
    </section></div>`;
  return true;
}
