import { nextId } from './annees.js';
import { exiger } from './auth.js';
import { echeancierProvisoire, fraisEcheances, tarifFor } from './modalites.js';
import { synchroniserFrais } from './tarifs.js';

// Nouvelle inscription ou réinscription : déduit de l'historique de l'élève (inscription dans une autre année)
export function typeInscription(state, eleveId, anneeId) {
  return state.inscriptions.some((i) => i.eleveId === Number(eleveId) && i.anneeId !== Number(anneeId)) ? 'reinscription' : 'nouvelle';
}

// Frais ponctuels de l'inscription : frais d'inscription ou de réinscription (ceux de la classe s'ils sont définis
// dans son tarif, sinon ceux de l'année) et frais annexes du tarif. Chaque ligne n'est créée qu'une fois (code stable).
export function ajouterFraisInscription(state, inscription) {
  const avant = fraisEcheances(inscription).length;
  synchroniserFrais(state, inscription, tarifFor(state, inscription));
  return fraisEcheances(inscription).length > avant ? fraisEcheances(inscription)[0] : null;
}

export function createInscription(state, payload = {}) {
  exiger('eleves.gerer');
  const eleveId = Number(payload.eleveId || 0);
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 0);
  if (!state.annees.some((a) => a.id === anneeId)) return null;
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
  exiger('eleves.gerer');
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
  exiger('eleves.gerer');
  const targetId = Number(id);
  const index = state.inscriptions.findIndex((inscription) => inscription.id === targetId);
  if (index === -1) return false;
  if (!force && state.paiements.some((p) => p.inscriptionId === targetId)) return false;

  state.inscriptions.splice(index, 1);
  return true;
}

export function validerInscription(state, id, role = 'comptable') {
  exiger('eleves.gerer');
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

// proposerClasse(state, inscription, anneeId) : règle de passage (modules/passage.js), injectée pour éviter un import circulaire
export function reinscrireEleve(state, inscriptionId, proposerClasse = null) {
  exiger('eleves.gerer');
  const original = state.inscriptions.find((item) => item.id === Number(inscriptionId));
  if (!original) return null;

  const nextYear = Number(state.anneeActiveId || original.anneeId || 1);
  if (nextYear === original.anneeId) return null;
  if (state.inscriptions.some((i) => i.eleveId === original.eleveId && i.anneeId === nextYear)) return null;
  // Classe de destination : niveau supérieur si l'élève est admis (passage automatique), sinon classe de même nom
  const source = state.classes.find((c) => c.id === original.classeId);
  const classe = (original.decision?.statut === 'admis' && proposerClasse ? proposerClasse(state, original, nextYear) : null)
    || state.classes.find((c) => c.anneeId === nextYear && String(c.nom).toLocaleLowerCase('fr') === String(source?.nom || '').toLocaleLowerCase('fr'));
  if (!classe) return null;
  const { decision, origineInscriptionId, ...base } = original;
  const duplicate = {
    ...base,
    id: nextId(state.inscriptions),
    anneeId: nextYear,
    classeId: classe.id,
    origineInscriptionId: original.id,
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
