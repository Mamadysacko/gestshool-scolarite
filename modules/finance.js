import { todayISO } from './utils.js';
import { resteEcheance, echeanceDu, recomputeAll } from './allocation.js';

export function echeanceReste(echeance) {
  return resteEcheance(echeance);
}

export function determineEcheanceStatus(echeance, today = todayISO()) {
  const montant = echeanceDu(echeance);
  const paye = Number(echeance.montantPaye || 0);
  if (montant <= 0 || paye >= montant) return 'payee';
  if (echeance.dateLimite && echeance.dateLimite < today) return 'en_retard';
  return paye > 0 ? 'partielle' : 'impayee';
}

export function reconcileInscriptionStatus(inscription) {
  if (['transfere', 'termine', 'abandon'].includes(inscription.statut)) return inscription.statut;
  const echeances = inscription.echeances || [];
  if (!echeances.length) { inscription.statut = 'inscrit'; return inscription.statut; }
  if (echeances.every((e) => e.statut === 'payee')) inscription.statut = 'payee';
  else if (echeances.some((e) => e.statut === 'en_retard')) inscription.statut = 'en_retard';
  else if (echeances.some((e) => Number(e.montantPaye || 0) > 0)) inscription.statut = 'partielle';
  else inscription.statut = 'inscrit';
  return inscription.statut;
}

// Recalcule statuts d'échéances et d'inscriptions : à appeler au chargement et après chaque opération,
// car un retard apparaît avec le temps, sans aucun enregistrement.
export function refreshStatuses(state) {
  const today = todayISO();
  recomputeAll(state);
  state.inscriptions.forEach((inscription) => {
    (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e, today); });
    reconcileInscriptionStatus(inscription);
  });
}

export function activePayments(state, inscriptionId) {
  return state.paiements.filter((p) => !p.annule && (inscriptionId === undefined || p.inscriptionId === inscriptionId));
}

export function inscriptionSituation(state, inscription, today = todayISO()) {
  const echeances = inscription.echeances || [];
  const total = echeances.reduce((s, e) => s + echeanceDu(e), 0);
  const paye = echeances.reduce((s, e) => s + Math.min(Number(e.montantPaye || 0), echeanceDu(e)), 0);
  const reste = Math.max(total - paye, 0);
  const enRetard = echeances.filter((e) => echeanceReste(e) > 0 && e.dateLimite && e.dateLimite < today);
  const retardMontant = enRetard.reduce((s, e) => s + echeanceReste(e), 0);
  const prochaine = echeances.filter((e) => echeanceReste(e) > 0 && !(e.dateLimite && e.dateLimite < today))
    .sort((a, b) => String(a.dateLimite || '9').localeCompare(String(b.dateLimite || '9')))[0] || null;
  let statut = 'partiel';
  if (total > 0 && reste === 0) statut = 'a_jour';
  else if (enRetard.length) statut = 'retard';
  return { total, paye, reste, taux: total ? Math.round(paye / total * 100) : 0, statut, enRetard, retardMontant, prochaine };
}

export const STATUT_LABELS = { a_jour: 'À jour', partiel: 'Partiellement payé', retard: 'En retard' };

export function scopeInscriptions(state, { yearId = 0, classId = 0, category = '' } = {}) {
  return state.inscriptions.filter((inscription) => {
    if (yearId && inscription.anneeId !== yearId) return false;
    if (classId && inscription.classeId !== classId) return false;
    if (category && state.classes.find((c) => c.id === inscription.classeId)?.categorie !== category) return false;
    return true;
  });
}

export function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

export function sumPayments(payments) {
  return payments.reduce((s, p) => s + Number(p.montant || 0), 0);
}

export function labelEcheance(echeance) {
  return echeance ? (echeance.libelle || `Tranche ${echeance.trancheId}`) : '—';
}

export function studentOf(state, inscription) {
  return state.eleves.find((e) => e.id === inscription?.eleveId);
}

export function yearLabel(state, id) {
  return state.annees.find((a) => a.id === id)?.annee || '—';
}

export function classOf(state, id) {
  return state.classes.find((c) => c.id === id);
}

// Cumul des paiements valides d'une inscription jusqu'à un paiement donné (inclus)
export function cumulUntil(state, payment) {
  return state.paiements
    .filter((p) => !p.annule && p.inscriptionId === payment.inscriptionId && p.id <= payment.id)
    .reduce((s, p) => s + Number(p.montant || 0), 0);
}
