import { nextId } from './annees.js';
import { echeancierProvisoire, nextEcheanceId } from './modalites.js';

// Nouvelle inscription ou réinscription : déduit de l'historique de l'élève (inscription dans une autre année)
export function typeInscription(state, eleveId, anneeId) {
  return state.inscriptions.some((i) => i.eleveId === Number(eleveId) && i.anneeId !== Number(anneeId)) ? 'reinscription' : 'nouvelle';
}

// Frais d'inscription ou de réinscription de l'année concernée : une échéance unique, créée une seule fois
// (aucun doublon possible), au montant configuré pour l'année au moment de l'inscription.
export function ajouterFraisInscription(state, inscription) {
  if ((inscription.echeances || []).some((e) => e.type === 'frais')) return null;
  const annee = state.annees.find((a) => a.id === inscription.anneeId);
  const reinscription = inscription.type === 'reinscription';
  const montant = Number((reinscription ? annee?.fraisReinscription : annee?.fraisInscription) || 0);
  if (montant <= 0) return null;
  const echeance = {
    id: nextEcheanceId(state, inscription), type: 'frais', trancheId: 0, montant, montantPaye: 0, remise: 0, statut: 'impayee',
    dateLimite: inscription.dateInscription, libelle: reinscription ? 'Frais de réinscription' : 'Frais d’inscription'
  };
  inscription.echeances = [echeance, ...(inscription.echeances || [])];
  return echeance;
}

export function createInscription(state, payload = {}) {
  const eleveId = Number(payload.eleveId || 0);
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
  const classeId = Number(payload.classeId || 0);

  if (!eleveId || !classeId || !anneeId) return null;
  // Un élève ne peut être inscrit qu'une fois par année scolaire
  if (state.inscriptions.some((i) => i.eleveId === eleveId && i.anneeId === anneeId)) return null;

  const item = {
    id: nextId(state.inscriptions),
    eleveId,
    anneeId,
    classeId,
    type: payload.type === 'nouvelle' || payload.type === 'reinscription' ? payload.type : typeInscription(state, eleveId, anneeId),
    statut: payload.statut || 'inscrit',
    dateInscription: payload.dateInscription || new Date().toISOString().slice(0, 10),
    modalite: null,
    echeances: []
  };

  state.inscriptions.push(item);
  ajouterFraisInscription(state, item);
  return item;
}

export function updateInscription(state, id, payload = {}) {
  const item = state.inscriptions.find((inscription) => inscription.id === Number(id));
  if (!item) return null;

  item.anneeId = Number(payload.anneeId || item.anneeId);
  item.classeId = Number(payload.classeId || item.classeId);
  item.type = payload.type || item.type;
  item.statut = payload.statut || item.statut;

  return item;
}

// Refus si un paiement (même annulé) existe : l'historique comptable est conservé.
export function deleteInscription(state, id, force = false) {
  const targetId = Number(id);
  const index = state.inscriptions.findIndex((inscription) => inscription.id === targetId);
  if (index === -1) return false;
  if (!force && state.paiements.some((p) => p.inscriptionId === targetId)) return false;

  state.inscriptions.splice(index, 1);
  return true;
}

export function validerInscription(state, id, role = 'comptable') {
  const item = state.inscriptions.find((inscription) => inscription.id === Number(id));
  if (!item || item.validee) return null;
  item.validee = true;
  item.dateValidation = new Date().toISOString().slice(0, 10);
  item.validePar = role;
  return item;
}

// L'inscription ne fixe plus la modalité de règlement : elle crée seulement un échéancier provisoire par tranches
// (montants attendus et retards visibles). Le choix mensuel / tranches se fait au premier paiement.
export function generateEcheancesForInscription(state, inscriptionId, tarif) {
  const inscription = state.inscriptions.find((item) => item.id === Number(inscriptionId));
  if (!inscription) return [];
  echeancierProvisoire(state, inscription, tarif);
  return inscription.echeances;
}

export function reinscrireEleve(state, inscriptionId) {
  const original = state.inscriptions.find((item) => item.id === Number(inscriptionId));
  if (!original) return null;

  const nextYear = Number(state.anneeActiveId || original.anneeId || 1);
  if (state.inscriptions.some((i) => i.eleveId === original.eleveId && i.anneeId === nextYear)) return null;
  const duplicate = {
    ...original,
    id: nextId(state.inscriptions),
    anneeId: nextYear,
    type: 'reinscription',
    statut: 'inscrit',
    dateInscription: new Date().toISOString().slice(0, 10),
    validee: false,
    dateValidation: '',
    validePar: '',
    modalite: null,
    echeances: []
  };

  state.inscriptions.push(duplicate);
  ajouterFraisInscription(state, duplicate);

  const tarif = state.tarifs.find((item) => item.classeId === duplicate.classeId && item.anneeId === duplicate.anneeId);
  if (tarif) {
    generateEcheancesForInscription(state, duplicate.id, tarif);
  }

  return duplicate;
}
