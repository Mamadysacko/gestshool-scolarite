import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser, exiger } from './auth.js';
import { todayISO } from './utils.js';
import { createPaiement, validatePaiement, MODES_PAIEMENT } from './paiements.js';
import { planPourModalite } from './modalites.js';
import { previewPaiement } from './allocation.js';
import { compteOf, compteParDefaut } from './comptes.js';

// Règlements en attente : chèque remis mais pas encore crédité, virement annoncé, paiement électronique à vérifier.
// Ils sont enregistrés à part (registre « paiementsEnAttente ») et n'entrent dans AUCUN total — encaissé, solde de
// l'élève, caisse, rapports — tant qu'ils ne sont pas confirmés. Confirmé : un vrai paiement est créé (reçu numéroté,
// imputation, soldes). Rejeté (chèque impayé…) : la ligne reste dans le registre avec son motif.

export const STATUTS_ATTENTE = { en_attente: 'En attente', confirme: 'Confirmé', rejete: 'Rejeté' };
export const MODES_ATTENTE = ['cheque', 'virement', 'mobile_money', 'carte'];

const text = (v) => String(v ?? '').trim();

export const attentesOuvertes = (state, inscriptionId) => (state.paiementsEnAttente || [])
  .filter((a) => a.statut === 'en_attente' && (inscriptionId === undefined || a.inscriptionId === Number(inscriptionId)));

export const totalEnAttente = (state, inscriptionId) => attentesOuvertes(state, inscriptionId).reduce((s, a) => s + Number(a.montant || 0), 0);

function numeroAttente(state, date) {
  const year = String(date || todayISO()).slice(0, 4);
  if (!state.compteursAttente || typeof state.compteursAttente !== 'object') state.compteursAttente = {};
  const next = Number(state.compteursAttente[year] || 0) + 1;
  state.compteursAttente[year] = next;
  return `ATT-${year}-${String(next).padStart(6, '0')}`;
}

// Contrôles identiques à un paiement (élève, montant, modalité, année ouverte…), plus : moyen non comptant,
// référence obligatoire et montant cumulé des règlements en attente qui ne dépasse pas le solde restant.
export function validateAttente(state, payload = {}) {
  if (!MODES_ATTENTE.includes(payload.mode)) return { ok: false, message: 'Seuls un chèque, un virement, un paiement électronique ou par carte peuvent être mis en attente.' };
  if (!text(payload.reference)) return { ok: false, message: 'La référence (n° de chèque, de transaction…) est obligatoire pour un règlement en attente.' };
  if (payload.token && (state.paiementsEnAttente || []).some((a) => a.token === payload.token)) return { ok: false, message: 'Ce règlement a déjà été enregistré (double soumission évitée).' };
  const check = validatePaiement(state, { ...payload, token: '' }, { ignoreDuplicate: true });
  if (!check.ok) return check;
  const inscription = state.inscriptions.find((i) => i.id === Number(payload.inscriptionId));
  const plan = planPourModalite(state, inscription, payload.modalite || inscription.modalite);
  const reste = plan.ok ? previewPaiement({ echeances: plan.echeances }, 0).before.reste : 0;
  const deja = totalEnAttente(state, inscription.id);
  if (Number(payload.montant) + deja > reste) {
    return { ok: false, message: `Avec les règlements déjà en attente (${deja.toLocaleString('fr-FR')}), ce montant dépasserait le solde restant de l’élève (${reste.toLocaleString('fr-FR')}).` };
  }
  return { ok: true };
}

export function enregistrerAttente(state, payload = {}) {
  exiger('paiements.encaisser');
  const check = validateAttente(state, payload);
  if (!check.ok) throw new Error(check.message);
  return withTransaction(state, () => {
    const inscription = state.inscriptions.find((i) => i.id === Number(payload.inscriptionId));
    const user = currentUser();
    const date = payload.datePaiement || todayISO();
    const attente = {
      id: nextId(state.paiementsEnAttente), numero: numeroAttente(state, date), inscriptionId: inscription.id, anneeId: inscription.anneeId,
      montant: Number(payload.montant), mode: payload.mode, reference: text(payload.reference), payeur: text(payload.payeur), motifPaiement: text(payload.motifPaiement),
      observation: text(payload.observation), modalite: payload.modalite || inscription.modalite || '', reliquatId: Number(payload.reliquatId) || 0,
      compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode)?.id || 0, dateReception: date, statut: 'en_attente',
      utilisateur: user?.nom || '', utilisateurId: user?.id || 0, token: payload.token || '', creeLe: Date.now()
    };
    state.paiementsEnAttente.push(attente);
    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    logOperation(state, 'attente', `${attente.numero} — ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'élève'} — ${MODES_PAIEMENT[attente.mode]} ${attente.reference} en attente de confirmation`, attente.montant);
    return attente;
  });
}

// Confirmation : le paiement réel est créé à la date d'encaissement (crédit effectif), avec toutes les règles habituelles
export function confirmerAttente(state, id, { dateEncaissement = todayISO(), compteId = 0 } = {}) {
  exiger('paiements.encaisser');
  const attente = (state.paiementsEnAttente || []).find((a) => a.id === Number(id));
  if (!attente || attente.statut !== 'en_attente') throw new Error('Règlement introuvable ou déjà traité.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEncaissement) || dateEncaissement > todayISO()) throw new Error('Date d’encaissement invalide (pas de date future).');
  if (dateEncaissement < attente.dateReception) throw new Error('La date d’encaissement ne peut pas précéder la date de réception.');
  const compte = compteOf(state, compteId || attente.compteId);
  if (!compte || compte.actif === false) throw new Error('Compte destinataire introuvable ou désactivé.');
  const payload = {
    inscriptionId: attente.inscriptionId, montant: attente.montant, mode: attente.mode, reference: attente.reference, payeur: attente.payeur,
    motifPaiement: attente.motifPaiement, observation: attente.observation, modalite: attente.modalite, reliquatId: attente.reliquatId,
    compteId: compte.id, datePaiement: dateEncaissement, attenteId: attente.id
  };
  const check = validatePaiement(state, payload, { ignoreDuplicate: true });
  if (!check.ok) throw new Error(check.message);
  return withTransaction(state, () => {
    const payment = createPaiement(state, payload, { ignoreDuplicate: true });
    if (!payment) throw new Error('Le paiement n’a pas pu être créé.');
    Object.assign(attente, { statut: 'confirme', paiementId: payment.id, numeroRecu: payment.numeroRecu, compteId: compte.id, dateConfirmation: dateEncaissement, confirmePar: currentUser()?.nom || '' });
    logOperation(state, 'attente', `${attente.numero} confirmé — reçu ${payment.numeroRecu}`, attente.montant);
    return payment;
  });
}

export function rejeterAttente(state, id, motif) {
  exiger('paiements.annuler');
  const attente = (state.paiementsEnAttente || []).find((a) => a.id === Number(id));
  if (!attente || attente.statut !== 'en_attente') throw new Error('Règlement introuvable ou déjà traité.');
  if (!text(motif)) throw new Error('Le motif du rejet est obligatoire (ex. chèque sans provision).');
  return withTransaction(state, () => {
    Object.assign(attente, { statut: 'rejete', motif: text(motif), dateRejet: todayISO(), rejetePar: currentUser()?.nom || '' });
    logOperation(state, 'attente', `${attente.numero} rejeté — ${attente.motif}`, attente.montant);
    return attente;
  });
}
