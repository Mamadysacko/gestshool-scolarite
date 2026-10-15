import { todayISO } from './utils.js';

// Règles d'imputation des paiements sur l'échéancier d'une inscription (tranches ou mensualités).
// Un paiement est toujours rattaché à UNE inscription, donc à UNE année scolaire : le surplus ne passe jamais
// sur une autre année. Les paiements enregistrés (non annulés) sont la source de vérité des montants payés.

const num = (value) => Number(value || 0);

export function echeanceDu(echeance) { return num(echeance.montant) - num(echeance.remise); }

export function resteEcheance(echeance) { return Math.max(echeanceDu(echeance) - num(echeance.montantPaye), 0); }

// Échéances dans l'ordre de règlement : numéro de tranche / de mensualité, puis ordre d'enregistrement
export function ordreEcheances(inscription) {
  return (inscription.echeances || [])
    .map((echeance, index) => ({ echeance, index }))
    .sort((a, b) => num(a.echeance.trancheId) - num(b.echeance.trancheId) || a.index - b.index)
    .map((entry) => entry.echeance);
}

export function libelleEcheance(echeance) {
  return echeance ? (echeance.libelle || `Tranche ${echeance.trancheId}`) : '—';
}

// Imputations d'un paiement ; les anciens paiements (une seule échéance) sont lus comme une imputation unique.
export function paymentAllocations(payment) {
  if (Array.isArray(payment.allocations) && payment.allocations.length) return payment.allocations;
  return payment.echeanceId ? [{ echeanceId: payment.echeanceId, montant: num(payment.montant) }] : [];
}

// Répartit `montant` sur la première échéance impayée, puis la suivante, etc.
// Retourne les lignes d'imputation et le montant qui n'a pu être imputé (surplus au-delà de l'année).
export function allocate(echeances, montant) {
  let left = Math.floor(num(montant));
  const allocations = [];
  for (const echeance of echeances) {
    if (left <= 0) break;
    const reste = resteEcheance(echeance);
    if (reste <= 0) continue;
    const part = Math.min(reste, left);
    allocations.push({ echeanceId: echeance.id, libelle: libelleEcheance(echeance), montant: part, resteApres: reste - part, soldee: part === reste });
    left -= part;
  }
  return { allocations, nonImpute: left };
}

// Recalcule le montant payé de chaque échéance à partir des paiements valides (les annulés sont ignorés mais conservés).
export function recomputeInscription(state, inscription) {
  const paid = new Map();
  state.paiements.forEach((payment) => {
    if (payment.annule || payment.inscriptionId !== inscription.id) return;
    paymentAllocations(payment).forEach((a) => paid.set(a.echeanceId, (paid.get(a.echeanceId) || 0) + num(a.montant)));
  });
  (inscription.echeances || []).forEach((echeance) => { echeance.montantPaye = paid.get(echeance.id) || 0; });
}

export function recomputeAll(state) {
  state.inscriptions.forEach((inscription) => recomputeInscription(state, inscription));
}

export function statutEcheance(echeance, today = todayISO()) {
  const du = echeanceDu(echeance);
  const paye = num(echeance.montantPaye);
  if (du <= 0 || paye >= du) return 'soldee';
  if (echeance.dateLimite && echeance.dateLimite < today) return 'retard';
  return paye > 0 ? 'partielle' : 'impayee';
}

export const STATUT_ECHEANCE_LABELS = { soldee: 'Soldée', partielle: 'Partielle', impayee: 'Impayée', retard: 'En retard' };

// Situation détaillée de l'échéancier : échéance courante, soldes, retards et montants déjà payés d'avance.
export function echeancierSituation(inscription, today = todayISO()) {
  const ordered = ordreEcheances(inscription);
  const firstOpen = ordered.findIndex((e) => resteEcheance(e) > 0);
  const lignes = ordered.map((echeance, index) => {
    const du = echeanceDu(echeance);
    const paye = Math.min(num(echeance.montantPaye), du);
    const statut = statutEcheance(echeance, today);
    return {
      echeance, libelle: libelleEcheance(echeance), du, paye, reste: Math.max(du - paye, 0), taux: du ? Math.round(paye / du * 100) : 100,
      statut, enRetard: statut === 'retard', courante: index === firstOpen, avance: firstOpen !== -1 && index > firstOpen ? paye : 0
    };
  });
  const total = lignes.reduce((s, l) => s + l.du, 0);
  const paye = lignes.reduce((s, l) => s + l.paye, 0);
  const courante = lignes.find((l) => l.courante) || null;
  return {
    lignes, total, paye, reste: Math.max(total - paye, 0), taux: total ? Math.round(paye / total * 100) : 0,
    courante, nbSoldees: lignes.filter((l) => l.statut === 'soldee').length, nbEcheances: lignes.length,
    retardMontant: lignes.filter((l) => l.enRetard).reduce((s, l) => s + l.reste, 0), nbRetards: lignes.filter((l) => l.enRetard).length,
    avanceMontant: lignes.reduce((s, l) => s + l.avance, 0),
    statut: total > 0 && paye >= total ? 'solde' : lignes.some((l) => l.enRetard) ? 'retard' : paye > 0 ? 'partiel' : 'impaye'
  };
}

export const STATUT_GLOBAL_LABELS = { solde: 'Soldé', retard: 'En retard', partiel: 'Partiellement payé', impaye: 'Aucun paiement' };

// Simulation d'un paiement (sans rien modifier) pour l'aperçu du formulaire et la validation
export function previewPaiement(inscription, montant, today = todayISO()) {
  const copy = { echeances: (inscription.echeances || []).map((e) => ({ ...e })) };
  const ordered = ordreEcheances(copy);
  const { allocations, nonImpute } = allocate(ordered, montant);
  const before = echeancierSituation(inscription, today);
  allocations.forEach((a) => { const e = copy.echeances.find((x) => x.id === a.echeanceId); e.montantPaye = num(e.montantPaye) + a.montant; });
  const after = echeancierSituation(copy, today);
  return { allocations, nonImpute, before, after };
}

// Libellé d'une imputation : celui enregistré avec le paiement, sinon celui de l'échéance actuelle
export function allocationLabel(inscription, allocation) {
  return allocation.libelle || libelleEcheance((inscription?.echeances || []).find((e) => e.id === allocation.echeanceId));
}
