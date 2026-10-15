import { nextId } from './annees.js';
import { buildEcheances, hasValidPayments, modalitesDisponibles, modaliteActuelle, echeancierProvisoire, fraisEcheances } from './modalites.js';

// Montant mensuel proposé : montant annuel réparti sur le nombre de mois, arrondi au franc supérieur
export function autoMontantMensuel(total, nbMois) {
  const months = Math.min(Math.max(Number(nbMois || 0), 1), 12);
  return Math.ceil(Number(total || 0) / months);
}

function mensuelFields(payload, fallback = {}) {
  return {
    montantMensuel: Math.max(Math.floor(Number(payload.montantMensuel ?? fallback.montantMensuel ?? 0)), 0),
    nbMois: Math.min(Math.max(Number(payload.nbMois || fallback.nbMois || 9), 1), 12),
    moisDebut: payload.moisDebut !== undefined ? payload.moisDebut : (fallback.moisDebut || '')
  };
}

function addMonthsIso(iso, count) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + count, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d || 1, last));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Échéances par défaut : 1 mois après la rentrée, puis tous les tiers de l'année scolaire (plafonnées à la fin d'année).
export function autoTrancheDates(annee) {
  if (!annee || !annee.dateDebut) return ['', '', ''];
  const fin = annee.dateFin || '';
  const span = fin ? Math.max(Math.round((new Date(fin) - new Date(annee.dateDebut)) / (30.44 * 86400000)), 3) : 9;
  const step = Math.floor(span / 3);
  return [0, 1, 2].map((k) => {
    const due = addMonthsIso(annee.dateDebut, 1 + k * step);
    return fin && due > fin ? fin : due;
  });
}

// Répartition automatique : tiers égaux, le reliquat va à la dernière tranche.
export function autoTrancheMontants(total) {
  const base = Math.floor(Number(total || 0) / 3);
  return [base, base, Number(total || 0) - 2 * base];
}

export function autoTranches(state, anneeId, montantAnnuel) {
  const annee = state.annees.find((a) => a.id === Number(anneeId));
  const dates = autoTrancheDates(annee);
  const montants = autoTrancheMontants(montantAnnuel);
  return [1, 2, 3].map((num, i) => ({ num, libelle: `${num === 1 ? '1ère' : num + 'ème'} tranche`, montant: montants[i], dateLimite: dates[i] }));
}

function normalizeTranches(payload = []) {
  const source = Array.isArray(payload) && payload.length ? payload : [
    { num: 1, libelle: '1ère tranche', montant: 0, dateLimite: '' },
    { num: 2, libelle: '2ème tranche', montant: 0, dateLimite: '' },
    { num: 3, libelle: '3ème tranche', montant: 0, dateLimite: '' }
  ];

  return source.map((tranche, index) => ({
    id: tranche.id || index + 1,
    num: Number(tranche.num || index + 1),
    libelle: tranche.libelle || `Tranche ${index + 1}`,
    montant: Number(tranche.montant || 0),
    dateLimite: tranche.dateLimite || ''
  }));
}

export function createTarif(state, payload = {}) {
  const classeId = Number(payload.classeId || 0);
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
  if (!classeId || !anneeId) return null;

  const existingIndex = state.tarifs.findIndex((item) => item.classeId === classeId && item.anneeId === anneeId);
  const baseMontant = Number(payload.montantAnnuel || 0);
  const auto = autoTranches(state, anneeId, baseMontant);
  const given = Array.isArray(payload.tranches) && payload.tranches.length ? payload.tranches : auto;
  const tranches = normalizeTranches(given.map((tranche, index) => ({ ...tranche, dateLimite: tranche.dateLimite || auto[index]?.dateLimite || '' })));

  const item = {
    id: existingIndex >= 0 ? state.tarifs[existingIndex].id : nextId(state.tarifs),
    classeId,
    anneeId,
    montantAnnuel: baseMontant,
    tranches,
    ...mensuelFields(payload),
    actif: true
  };

  if (existingIndex >= 0) {
    state.tarifs[existingIndex] = item;
    return item;
  }

  state.tarifs.push(item);
  return item;
}

export function updateTarif(state, id, payload = {}) {
  const item = state.tarifs.find((tarif) => tarif.id === Number(id));
  if (!item) return null;

  item.classeId = Number(payload.classeId || item.classeId);
  item.anneeId = Number(payload.anneeId || item.anneeId);
  item.montantAnnuel = Number(payload.montantAnnuel || item.montantAnnuel || 0);
  item.tranches = normalizeTranches(payload.tranches || item.tranches || []);
  item.actif = payload.actif !== undefined ? payload.actif : item.actif;
  Object.assign(item, mensuelFields(payload, item));
  delete item.mensuel;

  return item;
}

export function duplicateTarif(state, id) {
  const existing = state.tarifs.find((item) => item.id === Number(id));
  if (!existing) return null;

  const nextYear = Number(state.anneeActiveId || existing.anneeId || 1);
  const item = {
    ...existing,
    id: nextId(state.tarifs),
    anneeId: nextYear,
    tranches: existing.tranches.map((tranche) => ({ ...tranche, id: Number(tranche.id || 1) }))
  };

  state.tarifs.push(item);
  return item;
}

export function deleteTarif(state, id) {
  const targetId = Number(id);
  const index = state.tarifs.findIndex((item) => item.id === targetId);
  if (index === -1) return false;

  state.tarifs.splice(index, 1);
  return true;
}

// Répercute un tarif (créé ou modifié) sur les inscriptions de sa classe et de son année :
//  - sans paiement valide : l'échéancier est reconstruit dans sa modalité (ou provisoire « tranches » si non choisie) ;
//  - avec paiements : on met à jour les dates (tranches) et les montants des échéances encore non payées.
export function propagateTarif(state, tarif) {
  let touched = 0;
  const dispo = modalitesDisponibles(tarif);
  state.inscriptions.filter((i) => i.classeId === tarif.classeId && i.anneeId === tarif.anneeId).forEach((inscription) => {
    const modalite = modaliteActuelle(inscription);
    if (!hasValidPayments(state, inscription)) {
      if (inscription.modalite && dispo[inscription.modalite]) inscription.echeances = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, inscription.modalite)];
      else echeancierProvisoire(state, inscription, tarif);
      touched += 1;
      return;
    }
    (inscription.echeances || []).filter((e) => e.type !== 'frais').forEach((echeance) => {
      const unpaid = !Number(echeance.montantPaye || 0);
      if (modalite === 'mensuel') {
        if (unpaid && dispo.mensuel && Number(echeance.montant) !== Number(tarif.montantMensuel)) { echeance.montant = Number(tarif.montantMensuel); touched += 1; }
        return;
      }
      const tranche = tarif.tranches.find((tr) => tr.num === echeance.trancheId);
      if (!tranche) return;
      if (echeance.dateLimite !== tranche.dateLimite) { echeance.dateLimite = tranche.dateLimite; touched += 1; }
      if (unpaid && Number(echeance.montant) !== Number(tranche.montant)) { echeance.montant = Number(tranche.montant); touched += 1; }
    });
  });
  return touched;
}
