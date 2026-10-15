import { escapeHtml, formatMoney, formatDateFr } from './utils.js';
import { inscriptionSituation, STATUT_LABELS, studentOf, yearLabel, classOf, labelEcheance, scopeInscriptions } from './finance.js';
import { buildReceiptData, receiptHtml, RECEIPT_CSS } from './recus.js';
import { ensureReceiptNumber } from './paiements.js';
import { paymentAllocations, allocationLabel } from './allocation.js';

function modal(title, subtitle, body) {
  const root = document.getElementById('modal-root');
  if (!root) return false;
  root.innerHTML = `<div class="modal-backdrop" data-modal-close>
    <section class="student-modal" role="dialog" aria-modal="true">
      <header class="modal-header"><div><span class="eyebrow">Consultation</span><h2>${escapeHtml(title)}</h2><span class="meta">${escapeHtml(subtitle)}</span></div>
      <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>${body}</section></div>`;
  return true;
}

const money = (state, v) => `${formatMoney(v)} ${escapeHtml(state.config.devise)}`;
const table = (head, rows, empty) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;

function showClasse(state, id) {
  const c = state.classes.find((x) => x.id === id);
  if (!c) return false;
  const list = state.inscriptions.filter((i) => i.classeId === id);
  const sits = list.map((i) => ({ i, s: inscriptionSituation(state, i) }));
  const due = sits.reduce((a, x) => a + x.s.total, 0); const paid = sits.reduce((a, x) => a + x.s.paye, 0);
  return modal(c.nom, `${c.categorie} · ${yearLabel(state, c.anneeId)}`, `
    <div class="profile-section"><div class="profile-grid">
      <div class="profile-metric"><span>Effectif</span><strong>${list.length} / ${c.capacite}</strong></div>
      <div class="profile-metric"><span>Frais attendus</span><strong>${money(state, due)}</strong></div>
      <div class="profile-metric"><span>Encaissé</span><strong>${money(state, paid)}</strong></div>
      <div class="profile-metric"><span>Recouvrement</span><strong>${due ? Math.round(paid / due * 100) : 0}%</strong></div></div></div>
    <div class="profile-section"><h3>Élèves de la classe</h3>${table(['Matricule', 'Élève', 'Payé', 'Reste', 'Situation'],
      sits.map(({ i, s }) => { const e = studentOf(state, i); return `<tr><td>${escapeHtml(e?.matricule || '—')}</td><td>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')}</td><td>${money(state, s.paye)}</td><td>${money(state, s.reste)}</td><td>${STATUT_LABELS[s.statut]}</td></tr>`; }), 'Aucun élève inscrit.')}</div>`);
}

function showTarif(state, id) {
  const t = state.tarifs.find((x) => x.id === id);
  if (!t) return false;
  const nb = state.inscriptions.filter((i) => i.classeId === t.classeId && i.anneeId === t.anneeId).length;
  return modal(`Frais — ${classOf(state, t.classeId)?.nom || '—'}`, `${yearLabel(state, t.anneeId)} · ${nb} élève(s) concerné(s)`, `
    <div class="profile-section"><div class="profile-metric"><span>Montant annuel</span><strong>${money(state, t.montantAnnuel)}</strong></div>
    <p class="meta">${Number(t.montantMensuel) > 0 ? `Paiement mensuel : ${t.nbMois} × ${money(state, t.montantMensuel)} = ${money(state, t.montantMensuel * t.nbMois)}${t.moisDebut ? `, 1ère mensualité le ${escapeHtml(formatDateFr(t.moisDebut))}` : ''}.` : 'Paiement mensuel non proposé pour cette classe.'}</p>
    <h3>Tranches</h3>${table(['Tranche', 'Montant', 'Date d’échéance'], (t.tranches || []).map((tr) => `<tr><td>${escapeHtml(tr.libelle)}</td><td>${money(state, tr.montant)}</td><td>${escapeHtml(formatDateFr(tr.dateLimite))}</td></tr>`), 'Aucune tranche.')}</div>`);
}

function showAnnee(state, id) {
  const a = state.annees.find((x) => x.id === id);
  if (!a) return false;
  const list = scopeInscriptions(state, { yearId: id });
  const sits = list.map((i) => inscriptionSituation(state, i));
  const due = sits.reduce((s, x) => s + x.total, 0); const paid = sits.reduce((s, x) => s + x.paye, 0);
  return modal(`Année ${a.annee}`, `${formatDateFr(a.dateDebut)} → ${formatDateFr(a.dateFin)} · ${a.statut}`, `
    <div class="profile-section"><div class="profile-grid">
      <div class="profile-metric"><span>Classes</span><strong>${state.classes.filter((c) => c.anneeId === id).length}</strong></div>
      <div class="profile-metric"><span>Inscriptions</span><strong>${list.length}</strong></div>
      <div class="profile-metric"><span>Attendu / encaissé</span><strong>${money(state, due)} / ${money(state, paid)}</strong></div>
      <div class="profile-metric"><span>Recouvrement</span><strong>${due ? Math.round(paid / due * 100) : 0}%</strong></div></div></div>`);
}

function showPaiement(state, id) {
  const p = state.paiements.find((x) => x.id === id);
  if (!p) return false;
  const d = p.numeroRecu ? buildReceiptData(state, p) : null;
  const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
  const e = studentOf(state, inscription);
  const imputation = paymentAllocations(p).map((a) => `${allocationLabel(inscription, a)} : ${money(state, a.montant)}`).join(' · ');
  return modal(`Paiement ${p.numeroRecu || `#${p.id}`}`, p.annule ? 'ANNULÉ' : 'Validé', `
    <div class="profile-section"><dl class="detail-list">
      <dt>Élève</dt><dd>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')} (${escapeHtml(e?.matricule || '—')})</dd>
      <dt>Classe / année</dt><dd>${escapeHtml(classOf(state, inscription?.classeId)?.nom || '—')} · ${escapeHtml(yearLabel(state, inscription?.anneeId))}</dd>
      <dt>Imputation</dt><dd>${escapeHtml(imputation || '—')}</dd>
      <dt>Montant</dt><dd>${money(state, p.montant)}</dd>
      <dt>Date / mode</dt><dd>${escapeHtml(formatDateFr(p.datePaiement))} · ${escapeHtml(p.mode)}</dd>
      <dt>Référence / caissier</dt><dd>${escapeHtml(p.reference || '—')} · caissier : ${escapeHtml(p.caissier || '—')}${p.utilisateur ? ` · saisi par ${escapeHtml(p.utilisateur)}` : ''}</dd>
      ${d ? `<dt>Cumul payé / solde après paiement</dt><dd>${money(state, d.cumulAnnee)} / ${money(state, d.soldeAnnee)}</dd>` : ''}
      ${p.annule ? `<dt>Annulation</dt><dd>${escapeHtml(p.motif)} (${escapeHtml(formatDateFr(p.dateAnnulation))})</dd>` : ''}
    </dl>${p.annule ? '' : `<div class="form-actions"><button class="primary-btn small-btn" data-action="paiement:receipt:${p.id}">Voir le reçu</button></div>`}</div>`);
}

// Aperçu du reçu à l'écran : même rendu que l'impression (un exemplaire), avec bouton d'impression
export function showReceiptPreview(state, id) {
  const payment = state.paiements.find((p) => p.id === Number(id));
  if (!payment || payment.annule) return false;
  ensureReceiptNumber(state, payment);
  const { data, html } = receiptHtml(state, payment, 1);
  return modal(`Reçu ${data.numero}`, `${data.eleve} · ${formatMoney(data.montant)} ${state.config.devise}`, `
    <style>${RECEIPT_CSS} .receipt-preview .rc-sheet { height: auto; } .receipt-preview .rc-copy { border: 1px solid #e5e7eb; border-radius: 8px; }</style>
    <div class="receipt-preview">${html}</div>
    <div class="form-actions"><button class="primary-btn small-btn" data-action="paiement:print:${payment.id}">Imprimer (2 exemplaires)</button></div>`);
}

export function showDetail(state, kind, id) {
  const n = Number(id);
  if (kind === 'classe') return showClasse(state, n);
  if (kind === 'tarif') return showTarif(state, n);
  if (kind === 'annee') return showAnnee(state, n);
  if (kind === 'paiement') return showPaiement(state, n);
  return false;
}
