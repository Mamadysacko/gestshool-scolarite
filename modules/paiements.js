import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { reconcileInscriptionStatus, determineEcheanceStatus } from './finance.js';
import { allocate, ordreEcheances, recomputeInscription, previewPaiement, echeancierSituation } from './allocation.js';
import { planPourModalite, appliquerModalite, MODALITES, modaliteActuelle } from './modalites.js';
import { reliquatOf, anneeEncaissement } from './reliquats.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function findInscription(state, inscriptionId) {
  return state.inscriptions.find((item) => item.id === Number(inscriptionId));
}

// Numéro de reçu unique, séquentiel par année civile : REC-2026-000001.
// Attribué une seule fois par paiement ; une réimpression réutilise le même numéro.
export function ensureReceiptNumber(state, payment) {
  if (payment.numeroRecu) return payment.numeroRecu;
  const year = String(payment.datePaiement || todayISO()).slice(0, 4);
  if (!state.compteursRecu || typeof state.compteursRecu !== 'object') state.compteursRecu = {};
  const used = state.paiements
    .map((p) => p.numeroRecu)
    .filter((n) => typeof n === 'string' && n.startsWith(`REC-${year}-`))
    .reduce((max, n) => Math.max(max, Number(n.split('-')[2]) || 0), 0);
  const next = Math.max(Number(state.compteursRecu[year] || 0), used) + 1;
  state.compteursRecu[year] = next;
  payment.numeroRecu = `REC-${year}-${String(next).padStart(6, '0')}`;
  return payment.numeroRecu;
}

// Nom du caissier affiché sur les reçus : celui de la configuration, sinon l'utilisateur connecté
export function cashierName(state) {
  return String(state.config.caissier || '').trim() || currentUser()?.nom || 'Caissier';
}

// Modalité demandée pour ce paiement : celle du formulaire, sinon celle déjà fixée pour l'inscription
// Un paiement sur une inscription dont le solde a été reporté est toujours un règlement de dette antérieure
function reliquatDuPaiement(state, inscription, payload) {
  if (payload.reliquatId) return (state.reliquats || []).find((r) => r.id === Number(payload.reliquatId)) || null;
  return reliquatOf(state, inscription.id);
}

// Modalité demandée : celle du formulaire, sinon celle de l'inscription ; pour une dette, celle de l'échéancier d'origine
function modaliteDemandee(inscription, payload, reliquat = null) {
  return payload.modalite || inscription.modalite || (reliquat ? modaliteActuelle(inscription) || 'tranches' : '');
}

export function validatePaiement(state, payload = {}, { ignoreDuplicate = false } = {}) {
  const montant = Number(payload.montant);
  const date = payload.datePaiement || todayISO();
  const inscription = findInscription(state, payload.inscriptionId);

  if (!inscription) return { ok: false, message: 'Sélectionnez un élève inscrit.' };
  if (!Number.isFinite(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être supérieur à zéro.' };
  if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier de francs.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de paiement invalide.' };
  if (date > todayISO()) return { ok: false, message: 'La date de paiement ne peut pas être dans le futur.' };

  const annee = state.annees.find((a) => a.id === inscription.anneeId);
  const reliquat = reliquatDuPaiement(state, inscription, payload);
  if (payload.reliquatId && (!reliquat || reliquat.inscriptionId !== inscription.id)) return { ok: false, message: 'Dette antérieure introuvable pour cet élève.' };
  // Une année clôturée n'accepte plus de paiement, sauf le règlement de ses dettes reportées
  if (annee?.statut === 'cloturee' && !reliquat) return { ok: false, message: `L’année ${annee.annee} est clôturée : aucun paiement ne peut y être enregistré.` };

  const plan = planPourModalite(state, inscription, modaliteDemandee(inscription, payload, reliquat));
  if (!plan.ok) return { ok: false, message: plan.message };

  const { nonImpute, before } = previewPaiement({ echeances: plan.echeances }, montant);
  if (before.reste <= 0) return { ok: false, message: 'Les frais de cette année scolaire sont déjà soldés.' };
  if (nonImpute > 0) {
    return { ok: false, message: `Le montant dépasse le solde de l’année scolaire (${before.reste.toLocaleString('fr-FR')} ${state.config.devise}). Un excédent n’est jamais reporté sur une autre année.` };
  }

  if (payload.token && state.paiements.some((p) => p.token === payload.token)) {
    return { ok: false, message: 'Ce formulaire a déjà été enregistré (double soumission évitée).' };
  }
  const now = Date.now();
  const similar = state.paiements.some((p) => !p.annule && p.inscriptionId === inscription.id
    && Number(p.montant) === montant && p.datePaiement === date && now - Number(p.creeLe || 0) < DUPLICATE_WINDOW_MS);
  if (similar && !ignoreDuplicate) return { ok: false, duplicate: true, message: 'Un paiement identique vient d’être enregistré pour cet élève.' };
  return { ok: true };
}

// Applique la modalité de règlement, enregistre le paiement et l'impute : tout réussit ou rien n'est modifié.
export function createPaiement(state, payload = {}, options = {}) {
  if (!validatePaiement(state, payload, options).ok) return null;
  return withTransaction(state, () => {
    const inscription = findInscription(state, payload.inscriptionId);
    const reliquat = reliquatDuPaiement(state, inscription, payload);
    const modalite = modaliteDemandee(inscription, payload, reliquat);
    appliquerModalite(state, inscription, modalite, currentUser()?.nom || '');
    const montant = Number(payload.montant);
    const { allocations, nonImpute } = allocate(ordreEcheances(inscription), montant);
    if (nonImpute > 0 || !allocations.length) throw new Error('Imputation impossible');
    const user = currentUser();

    const payment = {
      id: nextId(state.paiements),
      inscriptionId: inscription.id,
      anneeId: inscription.anneeId,
      // Trésorerie : un règlement de dette est encaissé sur l'année du report, pas sur l'année d'origine
      anneeEncaissementId: reliquat ? anneeEncaissement(state, reliquat) : inscription.anneeId,
      reliquatId: reliquat ? reliquat.id : 0,
      modalite,
      echeanceId: allocations[0].echeanceId,
      // Le libellé est conservé : l'historique reste lisible même si l'échéancier change plus tard
      allocations: allocations.map(({ echeanceId, montant: part, libelle }) => ({ echeanceId, montant: part, libelle })),
      montant,
      mode: payload.mode || 'espece',
      reference: payload.reference || '',
      payeur: payload.payeur || '',
      motifPaiement: payload.motifPaiement || '',
      caissier: cashierName(state),
      utilisateur: user?.nom || '',
      utilisateurId: user?.id || 0,
      datePaiement: payload.datePaiement || todayISO(),
      annule: false,
      motif: '',
      token: payload.token || '',
      creeLe: Date.now()
    };
    state.paiements.push(payment);
    ensureReceiptNumber(state, payment);
    if (!payment.reference) payment.reference = payment.numeroRecu;

    recomputeInscription(state, inscription);
    (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
    reconcileInscriptionStatus(inscription);

    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    logOperation(state, 'paiement', `Reçu ${payment.numeroRecu} — ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'élève'} — ${reliquat ? 'Règlement de dette antérieure' : MODALITES[modalite]} — ${allocations.map((a) => `${a.libelle} ${a.montant.toLocaleString('fr-FR')}`).join(' + ')} (${payment.mode})`, montant);
    return payment;
  });
}

// Changement de modalité sans nouveau paiement : nouvel échéancier, paiements existants réimputés (tracé)
export function changerModalite(state, inscriptionId, modalite) {
  const inscription = findInscription(state, inscriptionId);
  if (!inscription) return null;
  return withTransaction(state, () => {
    const avant = modaliteActuelle(inscription);
    const plan = appliquerModalite(state, inscription, modalite, currentUser()?.nom || '');
    recomputeInscription(state, inscription);
    (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
    reconcileInscriptionStatus(inscription);
    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    logOperation(state, 'paiement', `Modalité de ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève'} : ${MODALITES[avant] || 'à choisir'} → ${MODALITES[modalite]}${plan.reimputations ? ` (${plan.reimputations.size} paiement(s) réimputé(s))` : ''}`);
    return inscription;
  });
}

// L'annulation conserve la ligne, son numéro de reçu et ses imputations : la trace comptable reste complète.
export function cancelPaiement(state, id, motif = 'Annulation manuelle') {
  const payment = state.paiements.find((item) => item.id === Number(id));
  if (!payment || payment.annule) return null;
  return withTransaction(state, () => {
    payment.annule = true;
    payment.motif = motif;
    payment.dateAnnulation = todayISO();
    payment.annuleePar = currentUser()?.nom || '';
    const inscription = findInscription(state, payment.inscriptionId);
    if (inscription) {
      recomputeInscription(state, inscription);
      (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
      reconcileInscriptionStatus(inscription);
    }
    logOperation(state, 'annulation', `Reçu ${payment.numeroRecu || payment.id} annulé — ${motif}`, payment.montant);
    return payment;
  });
}

export function getSoldeInscription(state, inscriptionId) {
  const inscription = findInscription(state, inscriptionId);
  if (!inscription) return { total: 0, paye: 0, restant: 0 };
  const s = echeancierSituation(inscription);
  return { total: s.total, paye: s.paye, restant: s.reste };
}
