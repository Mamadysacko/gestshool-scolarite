import { inRange } from './finance.js';

// Trésorerie théorique : Solde disponible = solde d'ouverture + recettes encaissées − dépenses enregistrées.
// Les recettes ne sont JAMAIS comptées comme des dépenses ; les paiements et dépenses annulés sont exclus des totaux.

const num = (v) => Number(v || 0);

export function paymentYear(state, payment) {
  // Année d'encaissement : un règlement de dette antérieure compte dans la trésorerie de l'année où il est reçu
  return payment.anneeEncaissementId || payment.anneeId || state.inscriptions.find((i) => i.id === payment.inscriptionId)?.anneeId || 0;
}

// Paiements valides filtrés par année (toutes si 0), période, classe et catégorie
export function recettesFiltrees(state, { yearId = 0, from = '', to = '', classId = 0, category = '' } = {}) {
  return state.paiements.filter((p) => {
    if (p.annule) return false;
    if (yearId && paymentYear(state, p) !== yearId) return false;
    if (!inRange(p.datePaiement, from, to)) return false;
    if (classId || category) {
      const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
      const classe = state.classes.find((c) => c.id === inscription?.classeId);
      if (classId && inscription?.classeId !== classId) return false;
      if (category && classe?.categorie !== category) return false;
    }
    return true;
  });
}

export function depensesFiltrees(state, { yearId = 0, from = '', to = '', categorie = '', demandeur = '' } = {}) {
  const who = String(demandeur || '').trim().toLocaleLowerCase('fr');
  return state.depenses.filter((d) => {
    if (d.annule) return false;
    if (yearId && d.anneeId !== yearId) return false;
    if (!inRange(d.date, from, to)) return false;
    if (categorie && d.categorie !== categorie) return false;
    if (who && !String(d.demandeur || '').toLocaleLowerCase('fr').includes(who)) return false;
    return true;
  });
}

// Autres entrées de caisse (ex. remboursement d'avance sur salaire en espèces)
export function entreesFiltrees(state, { yearId = 0, from = '', to = '' } = {}) {
  return (state.entreesCaisse || []).filter((e) => (!yearId || e.anneeId === yearId) && inRange(e.date, from, to));
}

export const somme = (list, key) => list.reduce((s, item) => s + num(item[key]), 0);

export function soldeOuvertureBase(state, yearId = 0) {
  return state.annees.filter((a) => !yearId || a.id === yearId).reduce((s, a) => s + num(a.soldeInitial), 0);
}

// Situation de caisse sur un périmètre : le solde reporté inclut les mouvements antérieurs à la date de début.
export function situationCaisse(state, { yearId = 0, from = '', to = '' } = {}) {
  let ouverture = soldeOuvertureBase(state, yearId);
  if (from) {
    const before = new Date(`${from}T00:00:00`);
    before.setDate(before.getDate() - 1);
    const veille = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-${String(before.getDate()).padStart(2, '0')}`;
    ouverture += somme(recettesFiltrees(state, { yearId, to: veille }), 'montant') + somme(entreesFiltrees(state, { yearId, to: veille }), 'montant') - somme(depensesFiltrees(state, { yearId, to: veille }), 'montant');
  }
  const recettes = somme(recettesFiltrees(state, { yearId, from, to }), 'montant');
  const depenses = somme(depensesFiltrees(state, { yearId, from, to }), 'montant');
  const autres = somme(entreesFiltrees(state, { yearId, from, to }), 'montant');
  return { ouverture, recettes, autres, depenses, solde: ouverture + recettes + autres - depenses };
}
