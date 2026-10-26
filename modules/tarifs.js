import { nextId } from './annees.js';
import { arrondir, repartir, regleArrondi } from './arrondi.js';
import { buildEcheances, hasValidPayments, modalitesDisponibles, echeancierProvisoire, fraisEcheances, nextEcheanceId } from './modalites.js';
import { repartirReduction } from './reductions.js';
import { currentUser, exiger } from './auth.js';

// Tarifs : un tarif par classe et par année scolaire (historisation naturelle : chaque année garde ses tarifs).
// Une modification n'est JAMAIS rétroactive pour un élève qui a déjà payé : ses échéances (son engagement) restent
// telles qu'elles étaient. Seuls les élèves inscrits sans aucun paiement peuvent être réalignés, sur demande.
// Chaque modification conserve la version précédente du tarif dans son historique.

// Montant mensuel proposé : montant annuel réparti sur le nombre de mois, arrondi selon la règle « mensualités »
// (par défaut au franc supérieur) ; l'écart d'arrondi est absorbé par la dernière mensualité de l'échéancier.
export function autoMontantMensuel(total, nbMois, regle = { pas: 1, sens: 'superieur' }) {
  const months = Math.min(Math.max(Number(nbMois || 0), 1), 12);
  return arrondir(Number(total || 0) / months, regle);
}

function mensuelFields(payload, fallback = {}) {
  return {
    montantMensuel: Math.max(Math.floor(Number(payload.montantMensuel ?? fallback.montantMensuel ?? 0)), 0),
    nbMois: Math.min(Math.max(Number(payload.nbMois || fallback.nbMois || 9), 1), 12),
    moisDebut: payload.moisDebut !== undefined ? payload.moisDebut : (fallback.moisDebut || '')
  };
}

const montantOuNull = (value) => (value === null || value === undefined || String(value).trim() === '' ? null : Math.max(Math.floor(Number(value) || 0), 0));

const slug = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'frais';

// Frais annexes (tenue, cantine, transport, fournitures…) : obligatoires pour chaque élève de la classe
export function normalizeAnnexes(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((a) => ({ libelle: String(a?.libelle || '').trim().slice(0, 60), montant: Math.max(Math.floor(Number(a?.montant) || 0), 0), code: a?.code }))
    .filter((a) => a.libelle && a.montant > 0)
    .map((a) => {
      let code = a.code && !seen.has(a.code) ? String(a.code) : `annexe-${slug(a.libelle)}`;
      for (let n = 2; seen.has(code); n += 1) code = `annexe-${slug(a.libelle)}-${n}`;
      seen.add(code);
      return { code, libelle: a.libelle, montant: a.montant };
    });
}

// Champs complémentaires d'un tarif (frais propres à la classe, annexes, plafond de remise)
function extraFields(payload, fallback = {}) {
  const pct = payload.remiseMaxPct !== undefined ? Number(payload.remiseMaxPct) : Number(fallback.remiseMaxPct || 0);
  return {
    fraisInscription: payload.fraisInscription !== undefined ? montantOuNull(payload.fraisInscription) : (fallback.fraisInscription ?? null),
    fraisReinscription: payload.fraisReinscription !== undefined ? montantOuNull(payload.fraisReinscription) : (fallback.fraisReinscription ?? null),
    fraisAnnexes: normalizeAnnexes(payload.fraisAnnexes !== undefined ? payload.fraisAnnexes : fallback.fraisAnnexes),
    remiseMaxPct: Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100)
  };
}

// Mise à niveau des tarifs existants (idempotente)
export function ensureTarifsHistorises(state) {
  state.tarifs.forEach((t) => {
    Object.assign(t, extraFields({}, t));
    if (!Array.isArray(t.historique)) t.historique = [];
  });
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

// Répartition automatique : tiers arrondis selon la règle « tranches », le reliquat va à la dernière tranche
// (la somme des trois tranches est toujours égale au montant annuel).
export function autoTrancheMontants(total, regle = { pas: 1, sens: 'inferieur' }) {
  return repartir(Number(total || 0), 3, regle);
}

export function autoTranches(state, anneeId, montantAnnuel) {
  const annee = state.annees.find((a) => a.id === Number(anneeId));
  const dates = autoTrancheDates(annee);
  const montants = autoTrancheMontants(montantAnnuel, regleArrondi(state.config, 'tranches'));
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

// Photographie d'un tarif, conservée dans son historique avant chaque modification
function version(tarif) {
  const { historique, ...rest } = tarif;
  return structuredClone(rest);
}

function archiver(tarif, motif) {
  tarif.historique = [...(tarif.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif, avant: version(tarif) }];
}

export function createTarif(state, payload = {}) {
  exiger('scolarite.parametrer');
  const classeId = Number(payload.classeId || 0);
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 0);
  if (!state.annees.some((a) => a.id === anneeId)) return null;
  if (!classeId || !anneeId) return null;
  const classe = state.classes.find((c) => c.id === classeId);
  if (classe && classe.anneeId !== anneeId) return null; // une classe appartient à une seule année scolaire

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
    ...extraFields(payload),
    actif: true,
    historique: existingIndex >= 0 ? [...(state.tarifs[existingIndex].historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif: 'Remplacement', avant: version(state.tarifs[existingIndex]) }] : [],
    creeLe: existingIndex >= 0 ? state.tarifs[existingIndex].creeLe : new Date().toISOString()
  };

  if (existingIndex >= 0) {
    state.tarifs[existingIndex] = item;
    return item;
  }

  state.tarifs.push(item);
  return item;
}

export function updateTarif(state, id, payload = {}) {
  exiger('scolarite.parametrer');
  const item = state.tarifs.find((tarif) => tarif.id === Number(id));
  if (!item) return null;
  archiver(item, 'Modification');

  item.classeId = Number(payload.classeId || item.classeId);
  item.anneeId = Number(payload.anneeId || item.anneeId);
  item.montantAnnuel = Number(payload.montantAnnuel || item.montantAnnuel || 0);
  item.tranches = normalizeTranches(payload.tranches || item.tranches || []);
  item.actif = payload.actif !== undefined ? payload.actif : item.actif;
  Object.assign(item, mensuelFields(payload, item), extraFields(payload, item));
  item.modifieLe = new Date().toISOString();
  delete item.mensuel;

  return item;
}

// Reprise d'un tarif vers l'année active : il s'applique à la classe de même nom de l'année active.
// Refus si cette classe n'existe pas ou a déjà un tarif (jamais de doublon classe / année).
export function duplicateTarif(state, id, anneeCibleId = state.anneeActiveId) {
  exiger('scolarite.parametrer');
  const existing = state.tarifs.find((item) => item.id === Number(id));
  if (!existing) return null;
  const cible = Number(anneeCibleId || 0);
  if (!cible || cible === existing.anneeId) return null;
  const source = state.classes.find((c) => c.id === existing.classeId);
  const classe = state.classes.find((c) => c.anneeId === cible && String(c.nom).toLocaleLowerCase('fr') === String(source?.nom || '').toLocaleLowerCase('fr'));
  if (!classe || state.tarifs.some((t) => t.classeId === classe.id && t.anneeId === cible)) return null;
  const annee = state.annees.find((a) => a.id === cible);
  const dates = autoTrancheDates(annee);
  const { historique, id: ancienId, creeLe, modifieLe, ...rest } = structuredClone(existing);
  const item = {
    ...rest,
    id: nextId(state.tarifs),
    classeId: classe.id,
    anneeId: cible,
    // Les dates d'échéance suivent la nouvelle année scolaire
    tranches: rest.tranches.map((tranche, i) => ({ ...tranche, dateLimite: dates[i] || '' })),
    moisDebut: '',
    historique: [],
    repriseDe: ancienId,
    creeLe: new Date().toISOString()
  };
  state.tarifs.push(item);
  return item;
}

export function deleteTarif(state, id) {
  exiger('scolarite.parametrer');
  const targetId = Number(id);
  const index = state.tarifs.findIndex((item) => item.id === targetId);
  if (index === -1) return false;

  state.tarifs.splice(index, 1);
  return true;
}

// Frais ponctuels dus par un élève d'après le tarif de sa classe (frais propres à la classe, sinon ceux de l'année) :
// frais d'inscription ou de réinscription, puis frais annexes. Codes stables : une ligne n'est jamais créée deux fois.
export function fraisAttendus(state, inscription, tarif) {
  const annee = state.annees.find((a) => a.id === inscription.anneeId);
  const reinscription = inscription.type === 'reinscription';
  const propre = tarif ? (reinscription ? tarif.fraisReinscription : tarif.fraisInscription) : null;
  const montant = Number((propre ?? (reinscription ? annee?.fraisReinscription : annee?.fraisInscription)) || 0);
  const lignes = montant > 0 ? [{ code: 'inscription', libelle: reinscription ? 'Frais de réinscription' : 'Frais d’inscription', montant }] : [];
  return [...lignes, ...(tarif?.fraisAnnexes || [])];
}

// Ancienne échéance de frais sans code : c'est le frais d'inscription / réinscription
const codeFrais = (echeance) => echeance.fraisCode || 'inscription';

// Aligne les échéances de frais d'une inscription sur les frais attendus.
// Lignes absentes : ajoutées. Inscription SANS paiement : montants mis à jour et lignes devenues inutiles retirées.
// Inscription avec paiement : rien n'est modifié ni retiré (engagement en cours conservé).
export function synchroniserFrais(state, inscription, tarif) {
  const attendus = fraisAttendus(state, inscription, tarif);
  const paye = hasValidPayments(state, inscription);
  const actuels = fraisEcheances(inscription);
  let changes = 0;
  let id = nextEcheanceId(state, inscription);
  const garder = [];
  actuels.forEach((e) => {
    const voulu = attendus.find((a) => a.code === codeFrais(e));
    if (!voulu) { if (paye || Number(e.montantPaye || 0) > 0) garder.push(e); else changes += 1; return; }
    if (!paye && Number(e.montant) !== voulu.montant) { e.montant = voulu.montant; e.libelle = voulu.libelle; changes += 1; }
    garder.push(e);
  });
  attendus.forEach((a) => {
    if (garder.some((e) => codeFrais(e) === a.code)) return;
    if (paye && a.code === 'inscription') return; // jamais de frais d'inscription ajoutés après coup à un élève qui paie déjà
    garder.push({ id: id++, type: 'frais', fraisCode: a.code, trancheId: 0, montant: a.montant, montantPaye: 0, remise: 0, statut: 'impayee', dateLimite: inscription.dateInscription || '', libelle: a.libelle });
    changes += 1;
  });
  inscription.echeances = [...garder, ...(inscription.echeances || []).filter((e) => e.type !== 'frais')];
  return changes;
}

// Élèves concernés par un tarif : { sansPaiement, avecPaiement }
export function inscriptionsDuTarif(state, tarif) {
  const list = state.inscriptions.filter((i) => i.classeId === tarif.classeId && i.anneeId === tarif.anneeId);
  return { sansPaiement: list.filter((i) => !hasValidPayments(state, i)), avecPaiement: list.filter((i) => hasValidPayments(state, i)) };
}

// Répercute un tarif (créé ou modifié) sur les élèves inscrits dans sa classe et son année QUI N'ONT ENCORE RIEN PAYÉ :
// frais et échéancier reconstruits dans la modalité choisie (ou provisoire par tranches), réduction réappliquée.
// Les élèves ayant déjà payé gardent intégralement leur engagement (aucune modification rétroactive).
export function propagateTarif(state, tarif) {
  const { sansPaiement, avecPaiement } = inscriptionsDuTarif(state, tarif);
  const dispo = modalitesDisponibles(tarif);
  sansPaiement.forEach((inscription) => {
    synchroniserFrais(state, inscription, tarif);
    if (inscription.modalite && dispo[inscription.modalite]) {
      inscription.echeances = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, inscription.modalite)];
      repartirReduction(inscription);
    } else echeancierProvisoire(state, inscription, tarif);
  });
  return { misesAJour: sansPaiement.length, preservees: avecPaiement.length };
}
