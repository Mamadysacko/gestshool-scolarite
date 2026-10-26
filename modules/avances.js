import { nextId, anneeDeLOperation } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';
import { nomEmploye } from './personnel.js';
import { createDepense } from './depenses.js';
import { repartir, regleArrondi } from './arrondi.js';

// Avances sur salaire (module unique, pas de prêts séparés).
// Invariant vérifié par les tests : montant autorisé = prélevé sur paie + remboursé en exceptionnel + solde restant.
export const STATUTS_AVANCE = { demandee: 'Demandée', approuvee: 'Approuvée', refusee: 'Refusée', versee: 'Versée — en remboursement', soldee: 'Soldée', annulee: 'Annulée' };
export const MODES_REMBOURSEMENT = { mensualite: 'Prélèvement mensuel fixe', duree: 'Durée définie' };
const MAX_MOIS = 36;

const money = (v) => Math.floor(Number(v || 0));
const par = () => currentUser()?.nom || '';

export function moisSuivant(mois, n = 1) {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Échéancier automatique ; la dernière mensualité absorbe l'arrondi (ajustement)
export function construireEcheancier(montant, mode, valeur, moisDebut, regle = { pas: 1, sens: 'inferieur' }) {
  const total = money(montant);
  const v = money(valeur);
  if (total <= 0) throw new Error('Le montant doit être supérieur à zéro.');
  if (!/^\d{4}-\d{2}$/.test(moisDebut || '')) throw new Error('Choisissez le mois du premier prélèvement.');
  let montants;
  if (mode === 'mensualite') {
    if (v <= 0) throw new Error('Indiquez le montant du prélèvement mensuel.');
    const n = Math.ceil(total / v);
    if (n > MAX_MOIS) throw new Error(`Remboursement trop long (${n} mois, maximum ${MAX_MOIS}) : augmentez la mensualité.`);
    montants = Array.from({ length: n }, (_, i) => (i === n - 1 ? total - v * (n - 1) : v));
  } else if (mode === 'duree') {
    if (v < 1 || v > MAX_MOIS) throw new Error(`La durée doit être comprise entre 1 et ${MAX_MOIS} mois.`);
    if (Math.floor(total / v) <= 0) throw new Error('Durée trop longue pour ce montant.');
    montants = repartir(total, v, regle);
  } else {
    throw new Error('Choisissez le mode de remboursement.');
  }
  return montants.map((m, i) => ({ mois: moisSuivant(moisDebut, i), montant: m, preleve: 0, statut: 'prevue' }));
}

export function soldeAvance(avance) {
  return (avance.echeancier || []).reduce((s, e) => s + Math.max(e.montant - e.preleve, 0), 0);
}

export function totalPreleve(avance) {
  return (avance.prelevements || []).filter((p) => !p.annule).reduce((s, p) => s + p.montant, 0);
}

export function totalExceptionnel(avance) {
  return (avance.exceptionnels || []).reduce((s, x) => s + x.montant, 0);
}

function trace(avance, type, detail, montant = 0) {
  avance.historique = [...(avance.historique || []), { horodatage: new Date().toISOString(), par: par(), type, detail, montant }];
}

function findAvance(state, id) {
  const avance = state.avances.find((a) => a.id === Number(id));
  if (!avance) throw new Error('Avance introuvable.');
  return avance;
}

function nomDe(state, avance) {
  return nomEmploye(state.personnel.find((e) => e.id === avance.employeId));
}

export function demanderAvance(state, payload = {}) {
  const employe = state.personnel.find((e) => e.id === Number(payload.employeId));
  if (!employe) throw new Error('Choisissez un employé.');
  if (employe.statut === 'sorti') throw new Error('Cet employé a quitté l’établissement.');
  const montant = money(payload.montantDemande);
  if (montant <= 0) throw new Error('Le montant demandé doit être supérieur à zéro.');
  const date = payload.dateDemande || todayISO();
  if (date > todayISO()) throw new Error('La date de demande ne peut pas être dans le futur.');
  // Simulation de l'échéancier proposé (validée à l'approbation)
  construireEcheancier(montant, payload.modeRemboursement, payload.valeur, payload.moisDebut, regleArrondi(state.config, 'avances'));
  return withTransaction(state, () => {
    const avance = {
      id: nextId(state.avances), employeId: employe.id, dateDemande: date, montantDemande: montant, motif: String(payload.motif || '').trim(),
      modeRemboursement: payload.modeRemboursement, valeur: money(payload.valeur), moisDebut: payload.moisDebut,
      statut: 'demandee', montantAutorise: 0, echeancier: [], prelevements: [], exceptionnels: [], historique: [], creeLe: Date.now()
    };
    trace(avance, 'demande', `Demande de ${montant}`, montant);
    state.avances.push(avance);
    logOperation(state, 'avance', `Demande d’avance de ${nomEmploye(employe)}`, montant);
    return avance;
  });
}

// Approbation : montant autorisé (≤ demandé) et échéancier définitif
export function approuverAvance(state, id, payload = {}) {
  const avance = findAvance(state, id);
  if (avance.statut !== 'demandee') throw new Error('Seule une demande en attente peut être approuvée.');
  const montant = money(payload.montantAutorise || avance.montantDemande);
  if (montant <= 0 || montant > avance.montantDemande) throw new Error('Le montant autorisé doit être positif et ne pas dépasser le montant demandé.');
  const mode = payload.modeRemboursement || avance.modeRemboursement;
  const valeur = payload.valeur || avance.valeur;
  const moisDebut = payload.moisDebut || avance.moisDebut;
  const echeancier = construireEcheancier(montant, mode, valeur, moisDebut, regleArrondi(state.config, 'avances'));
  return withTransaction(state, () => {
    Object.assign(avance, { statut: 'approuvee', montantAutorise: montant, modeRemboursement: mode, valeur: money(valeur), moisDebut, echeancier, approuvePar: par(), dateApprobation: todayISO() });
    trace(avance, 'approbation', `Autorisée : ${montant} en ${echeancier.length} prélèvement(s)`, montant);
    logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} approuvée (${echeancier.length} mois)`, montant);
    return avance;
  });
}

export function refuserAvance(state, id, motif) {
  const avance = findAvance(state, id);
  if (avance.statut !== 'demandee') throw new Error('Seule une demande en attente peut être refusée.');
  if (!String(motif || '').trim()) throw new Error('Le motif du refus est obligatoire.');
  return withTransaction(state, () => {
    avance.statut = 'refusee';
    trace(avance, 'refus', String(motif).trim());
    logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} refusée — ${motif}`, avance.montantDemande);
    return avance;
  });
}

// Versement : sortie de caisse enregistrée comme dépense liée (non modifiable depuis la page Dépenses)
export function verserAvance(state, id, { date = todayISO() } = {}) {
  const avance = findAvance(state, id);
  if (avance.statut !== 'approuvee') throw new Error('L’avance doit être approuvée avant d’être versée.');
  if (date > todayISO()) throw new Error('La date de versement ne peut pas être dans le futur.');
  return withTransaction(state, () => {
    const depense = createDepense(state, {
      anneeId: anneeDeLOperation(state, date), date, categorie: 'Avances sur salaire', description: `Avance sur salaire — ${nomDe(state, avance)}`,
      montant: avance.montantAutorise, beneficiaire: nomDe(state, avance), demandeur: 'Paie du personnel', reference: `AVANCE-${avance.id}`,
      source: { type: 'avance', id: avance.id }
    }, { ignoreDuplicate: true });
    if (!depense) throw new Error('Versement impossible : la dépense n’a pas pu être enregistrée (année clôturée ?).');
    Object.assign(avance, { statut: 'versee', dateVersement: date, depenseId: depense.id });
    trace(avance, 'versement', `Versée le ${date} (dépense ${depense.numero})`, avance.montantAutorise);
    logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} versée`, avance.montantAutorise);
    return avance;
  });
}

// Prélèvement dû pour un mois : échéances de ce mois ou antérieures non encore prélevées (reports compris)
export function prelevementsDus(state, employeId, mois) {
  return state.avances.filter((a) => a.employeId === Number(employeId) && a.statut === 'versee').map((avance) => {
    const du = avance.echeancier.filter((e) => e.mois <= mois).reduce((s, e) => s + Math.max(e.montant - e.preleve, 0), 0);
    return { avanceId: avance.id, du: Math.min(du, soldeAvance(avance)) };
  }).filter((x) => x.du > 0);
}

// Applique un prélèvement validé avec une paie (échéances dans l'ordre) ; refuse tout double prélèvement
export function appliquerPrelevement(state, avanceId, paieId, mois, montant) {
  const avance = findAvance(state, avanceId);
  if ((avance.prelevements || []).some((p) => p.paieId === paieId && !p.annule)) throw new Error('Double prélèvement refusé : cette paie a déjà prélevé sur cette avance.');
  let left = money(montant);
  const parts = [];
  for (const [index, e] of avance.echeancier.entries()) {
    if (left <= 0) break;
    if (e.mois > mois) break;
    const reste = e.montant - e.preleve;
    if (reste <= 0) continue;
    const part = Math.min(reste, left);
    e.preleve += part;
    e.statut = e.preleve >= e.montant ? 'prelevee' : 'partielle';
    parts.push({ index, montant: part });
    left -= part;
  }
  if (left > 0) throw new Error('Prélèvement supérieur au montant dû.');
  avance.prelevements = [...(avance.prelevements || []), { paieId, mois, montant: money(montant), parts, horodatage: new Date().toISOString() }];
  trace(avance, 'prelevement', `Prélèvement sur la paie de ${mois}`, money(montant));
  if (soldeAvance(avance) === 0) { avance.statut = 'soldee'; trace(avance, 'solde', 'Avance entièrement remboursée'); }
  return avance;
}

// Annulation d'une paie : ses prélèvements sont rendus (historique conservé, marqué annulé)
export function annulerPrelevements(state, paieId) {
  state.avances.forEach((avance) => {
    (avance.prelevements || []).filter((p) => p.paieId === paieId && !p.annule).forEach((p) => {
      p.parts.forEach(({ index, montant }) => {
        const e = avance.echeancier[index];
        e.preleve -= montant;
        e.statut = e.preleve <= 0 ? 'prevue' : 'partielle';
      });
      p.annule = true;
      if (avance.statut === 'soldee') avance.statut = 'versee';
      trace(avance, 'annulation-prelevement', `Prélèvement de ${p.mois} annulé avec sa paie`, p.montant);
    });
  });
}

// Report : le reste d'une échéance est déplacé à la fin de l'échéancier
export function reporterEcheance(state, avanceId, index) {
  const avance = findAvance(state, avanceId);
  if (avance.statut !== 'versee') throw new Error('Seule une avance en remboursement peut être reportée.');
  const e = avance.echeancier[Number(index)];
  if (!e) throw new Error('Échéance introuvable.');
  const reste = e.montant - e.preleve;
  if (reste <= 0) throw new Error('Cette échéance est déjà prélevée.');
  return withTransaction(state, () => {
    const last = avance.echeancier[avance.echeancier.length - 1].mois;
    e.montant = e.preleve;
    e.statut = e.preleve > 0 ? 'prelevee' : 'reportee';
    e.reporte = (e.reporte || 0) + reste;
    avance.echeancier.push({ mois: moisSuivant(last), montant: reste, preleve: 0, statut: 'prevue', origine: e.mois });
    trace(avance, 'report', `Échéance de ${e.mois} reportée en ${moisSuivant(last)}`, reste);
    logOperation(state, 'avance', `Report d’échéance d’avance — ${nomDe(state, avance)} (${e.mois} → ${moisSuivant(last)})`, reste);
    return avance;
  });
}

// Remboursement exceptionnel en espèces : entrée de caisse, réduit les dernières échéances (durée raccourcie)
export function rembourserExceptionnel(state, avanceId, { montant, date = todayISO() }) {
  const avance = findAvance(state, avanceId);
  if (avance.statut !== 'versee') throw new Error('Seule une avance en remboursement peut recevoir un remboursement exceptionnel.');
  const value = money(montant);
  if (value <= 0 || value > soldeAvance(avance)) throw new Error(`Le montant doit être compris entre 1 et le solde restant (${soldeAvance(avance)}).`);
  if (date > todayISO()) throw new Error('La date ne peut pas être dans le futur.');
  return withTransaction(state, () => {
    let left = value;
    for (let i = avance.echeancier.length - 1; i >= 0 && left > 0; i -= 1) {
      const e = avance.echeancier[i];
      const reste = e.montant - e.preleve;
      if (reste <= 0) continue;
      const part = Math.min(reste, left);
      e.montant -= part;
      e.rembourseExceptionnel = (e.rembourseExceptionnel || 0) + part;
      e.statut = e.montant <= e.preleve ? (e.preleve > 0 ? 'prelevee' : 'remboursee') : e.statut;
      left -= part;
    }
    avance.exceptionnels = [...(avance.exceptionnels || []), { date, montant: value, par: par() }];
    state.entreesCaisse.push({ id: nextId(state.entreesCaisse), date, anneeId: anneeDeLOperation(state, date), montant: value, libelle: `Remboursement d’avance — ${nomDe(state, avance)}`, source: { type: 'avance', id: avance.id } });
    trace(avance, 'exceptionnel', `Remboursement exceptionnel le ${date}`, value);
    if (soldeAvance(avance) === 0) { avance.statut = 'soldee'; trace(avance, 'solde', 'Avance entièrement remboursée'); }
    logOperation(state, 'avance', `Remboursement exceptionnel d’avance — ${nomDe(state, avance)}`, value);
    return avance;
  });
}
