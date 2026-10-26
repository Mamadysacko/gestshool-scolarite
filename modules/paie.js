import { nextId, anneeCouvrantMois, anneeDeLOperation } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';
import { createDepense, cancelDepense } from './depenses.js';
import { nomEmploye, typeOf, MODES_REMUNERATION, heuresDuMois } from './personnel.js';
import { prelevementsDus, appliquerPrelevement, annulerPrelevements } from './avances.js';

// Paie mensuelle. Cycle : brouillon (recalculé à chaque affichage) → validée (copie figée des montants,
// numéro attribué, prélèvements d'avances appliqués) → payée (sortie de caisse = dépense liée). Annulation tracée.
// Une seule paie non annulée par employé et par mois : aucune double paie possible.
export const STATUTS_PAIE = { brouillon: 'Brouillon', validee: 'Validée — à payer', payee: 'Payée', annulee: 'Annulée' };

const money = (v) => Math.floor(Number(v || 0));
const par = () => currentUser()?.nom || '';

export function isMois(mois) { return /^\d{4}-\d{2}$/.test(mois || ''); }

// Année scolaire couvrant un mois (pour les récapitulatifs et la trésorerie), sinon l'année active
export function anneePourMois(state, mois) {
  return anneeCouvrantMois(state, mois);
}

// Année scolaire à laquelle une paie est rattachée : celle qui couvre le mois si elle n'est pas clôturée,
// sinon l'année active (une sortie de caisse n'est jamais enregistrée sur une année clôturée)
export function anneeDeLaPaie(state, mois) {
  return anneeDeLOperation(state, `${mois}-01`);
}

// Mois d'une année scolaire, de la rentrée à la fin d'année (pour les récapitulatifs par année scolaire)
export function moisDeLAnnee(annee) {
  if (!annee?.dateDebut || !annee?.dateFin) return [];
  const out = [];
  let [y, m] = annee.dateDebut.slice(0, 7).split('-').map(Number);
  const fin = annee.dateFin.slice(0, 7);
  for (let guard = 0; guard < 24; guard += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > fin) break;
    out.push(key);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function paieDuMois(state, employeId, mois) {
  return state.paies.find((p) => p.employeId === Number(employeId) && p.mois === mois && p.statut !== 'annulee') || null;
}

function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => ({ libelle: String(l.libelle || '').trim(), montant: money(l.montant) })).filter((l) => l.libelle && l.montant > 0);
}

// Calcul complet (pur, ne modifie rien) :
//  net = salaire mensuel (ou heures du mois × tarif horaire) + primes (fixe de la fiche + primes du mois)
//        − retenues saisies pour le mois − avances dues
// Aucune retenue n'est appliquée sans avoir été saisie explicitement dans la paie du mois.
export function calculerPaie(state, employeId, mois, variables = {}) {
  const employe = state.personnel.find((e) => e.id === Number(employeId));
  if (!employe) throw new Error('Employé introuvable.');
  if (!isMois(mois)) throw new Error('Mois invalide.');
  const r = employe.remuneration;
  const horaire = r.mode === 'horaire';
  const taux = money(r.tauxHoraire);
  // Payé à l'heure : une ligne par affectation saisie pour le mois (heures × tarif horaire), sinon salaire mensuel
  const saisie = horaire ? heuresDuMois(state, employe.id, mois) : null;
  const lignes = horaire
    ? (saisie?.lignes || []).map((l) => ({ type: 'heures', libelle: l.libelle, heures: l.heures, taux, montant: Math.round(l.heures * taux), affectationId: l.affectationId }))
    : [{ type: 'base', libelle: 'Salaire mensuel', montant: money(r.salaireBase) }];
  const totalHeures = horaire ? Math.round((saisie?.lignes || []).reduce((s, l) => s + l.heures, 0) * 100) / 100 : 0;
  const primes = [...(r.primeFixe > 0 ? [{ libelle: r.libellePrime, montant: money(r.primeFixe), fixe: true }] : []), ...cleanLines(variables.primes)];
  const retenues = cleanLines(variables.retenues);
  const base = lignes.reduce((s, l) => s + l.montant, 0);
  const totalPrimes = primes.reduce((s, l) => s + l.montant, 0);
  const totalRetenues = retenues.reduce((s, l) => s + l.montant, 0);
  const brut = base + totalPrimes;
  const netAvantAvances = brut - totalRetenues;
  // Avances : prélèvement dû du mois, limité au net disponible (le reste est reporté automatiquement au mois suivant)
  let disponible = Math.max(netAvantAvances, 0);
  const avances = prelevementsDus(state, employe.id, mois).map((d) => {
    const preleve = Math.min(d.du, disponible);
    disponible -= preleve;
    return { avanceId: d.avanceId, du: d.du, montant: preleve, reporte: d.du - preleve };
  });
  const totalAvances = avances.reduce((s, a) => s + a.montant, 0);
  const alertes = [];
  const remunerationDefinie = horaire ? taux > 0 && totalHeures > 0 : money(r.salaireBase) > 0;
  if (horaire && taux <= 0) alertes.push('Rémunération non définie : fixez le tarif horaire dans Paie du personnel › Rémunérations.');
  else if (horaire && totalHeures <= 0) alertes.push(`Aucune heure saisie pour ${mois} : enregistrez d’abord les heures du mois de cet enseignant.`);
  if (!horaire && money(r.salaireBase) <= 0) alertes.push('Rémunération non définie : fixez le salaire dans Paie du personnel › Rémunérations avant de valider la paie.');
  if (netAvantAvances < 0) alertes.push('Les retenues dépassent le salaire brut : la paie ne peut pas être validée.');
  if (avances.some((a) => a.reporte > 0)) alertes.push('Net insuffisant : une partie du prélèvement d’avance est reportée au mois suivant.');
  if (employe.statut !== 'actif') alertes.push(`Employé ${employe.statut === 'suspendu' ? 'suspendu' : 'sorti'}.`);
  return {
    employe: { id: employe.id, matricule: employe.matricule, nom: employe.nom, prenom: employe.prenom, fonction: employe.fonction, type: typeOf(state, employe)?.libelle || '', contrat: { ...employe.contrat } },
    mode: r.mode, modeLibelle: MODES_REMUNERATION[r.mode], tauxHoraire: horaire ? taux : 0, totalHeures, heuresId: saisie?.id || 0, lignes, primes, retenues, avances,
    base, totalPrimes, totalRetenues, brut, totalAvances, net: netAvantAvances - totalAvances, alertes, valide: netAvantAvances >= 0 && remunerationDefinie
  };
}

// Calcul affiché : copie figée pour une paie validée / payée, recalcul en direct pour un brouillon
export function calculAffiche(state, paie) {
  return paie.statut === 'brouillon' ? calculerPaie(state, paie.employeId, paie.mois, paie.variables) : paie.calcul;
}

function findPaie(state, id) {
  const paie = state.paies.find((p) => p.id === Number(id));
  if (!paie) throw new Error('Paie introuvable.');
  return paie;
}

// Prépare les brouillons du mois pour les employés actifs (ou une sélection) qui n'ont pas encore de paie ce mois-là
export function preparerPaies(state, mois, employeIds = null) {
  if (!isMois(mois)) throw new Error('Choisissez un mois valide.');
  if (mois > todayISO().slice(0, 7)) throw new Error('On ne prépare pas la paie d’un mois futur.');
  return withTransaction(state, () => {
    const cibles = state.personnel.filter((e) => e.statut === 'actif' && (!employeIds || employeIds.includes(e.id)));
    const crees = [];
    cibles.forEach((e) => {
      if (paieDuMois(state, e.id, mois)) return; // jamais deux paies pour le même mois
      const paie = { id: nextId(state.paies), employeId: e.id, mois, anneeId: anneeDeLaPaie(state, mois), statut: 'brouillon', variables: { primes: [], retenues: [] }, creeLe: Date.now(), creePar: par(), historique: [] };
      state.paies.push(paie);
      crees.push(paie);
    });
    if (crees.length) logOperation(state, 'paie', `Paie de ${mois} préparée pour ${crees.length} employé(s)`);
    return crees;
  });
}

export function majVariables(state, id, variables = {}) {
  const paie = findPaie(state, id);
  if (paie.statut !== 'brouillon') throw new Error('Seule une paie en brouillon peut être modifiée.');
  paie.variables = { primes: cleanLines(variables.primes), retenues: cleanLines(variables.retenues) };
  return paie;
}

function numeroPaie(state, mois) {
  const key = mois;
  const used = state.paies.filter((p) => p.numero?.startsWith(`BP-${mois}-`)).reduce((m, p) => Math.max(m, Number(p.numero.split('-').pop()) || 0), 0);
  const next = Math.max(Number(state.compteursPaie[key] || 0), used) + 1;
  state.compteursPaie[key] = next;
  return `BP-${mois}-${String(next).padStart(4, '0')}`;
}

// Validation : recalcul final, copie figée, numéro, prélèvements d'avances appliqués — tout ou rien
export function validerPaie(state, id) {
  const paie = findPaie(state, id);
  if (paie.statut !== 'brouillon') throw new Error('Cette paie est déjà validée ou annulée.');
  return withTransaction(state, () => {
    const calcul = calculerPaie(state, paie.employeId, paie.mois, paie.variables);
    if (!calcul.valide) throw new Error(calcul.alertes[0]);
    calcul.avances.filter((a) => a.montant > 0).forEach((a) => appliquerPrelevement(state, a.avanceId, paie.id, paie.mois, a.montant));
    Object.assign(paie, { statut: 'validee', calcul, numero: numeroPaie(state, paie.mois), validePar: par(), dateValidation: todayISO() });
    paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'validation', net: calcul.net });
    logOperation(state, 'paie', `Paie ${paie.numero} — ${nomEmploye(calcul.employe)} validée (net ${calcul.net})`, calcul.net);
    return paie;
  });
}

// Paiement : enregistre la sortie de caisse (dépense « Salaires et indemnités » liée à la paie)
export function payerPaie(state, id, { date = todayISO(), moyen = 'espece' } = {}) {
  const paie = findPaie(state, id);
  if (paie.statut !== 'validee') throw new Error('Seule une paie validée peut être marquée payée.');
  if (date > todayISO()) throw new Error('La date de paiement ne peut pas être dans le futur.');
  return withTransaction(state, () => {
    let depense = null;
    if (paie.calcul.net > 0) {
      depense = createDepense(state, {
        // Trésorerie : la sortie de caisse est rattachée à l'année scolaire de la paie (mois couvert par l'année)
        anneeId: paie.anneeId || anneeDeLaPaie(state, paie.mois),
        date, categorie: 'Salaires et indemnités', description: `Salaire ${paie.mois} — ${nomEmploye(paie.calcul.employe)} (${paie.numero})`,
        montant: paie.calcul.net, beneficiaire: nomEmploye(paie.calcul.employe), demandeur: 'Paie du personnel', reference: paie.numero, mode: moyen, source: { type: 'paie', id: paie.id }
      }, { ignoreDuplicate: true });
      if (!depense) throw new Error('Paiement impossible : la dépense n’a pas pu être enregistrée (année clôturée ?).');
    }
    Object.assign(paie, { statut: 'payee', datePaiement: date, moyenPaiement: moyen, payePar: par(), depenseId: depense?.id || 0 });
    paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'paiement', date });
    logOperation(state, 'paie', `Paie ${paie.numero} payée (${moyen})`, paie.calcul.net);
    return paie;
  });
}

// Annulation : la ligne et son numéro restent ; prélèvements d'avances rendus ; dépense liée annulée
export function annulerPaie(state, id, motif) {
  const paie = findPaie(state, id);
  if (paie.statut === 'annulee') throw new Error('Cette paie est déjà annulée.');
  if (!String(motif || '').trim()) throw new Error('Le motif d’annulation est obligatoire.');
  return withTransaction(state, () => {
    if (paie.statut === 'validee' || paie.statut === 'payee') annulerPrelevements(state, paie.id);
    if (paie.depenseId) cancelDepense(state, paie.depenseId, `Paie ${paie.numero} annulée — ${motif}`, { systeme: true });
    const avant = paie.statut;
    Object.assign(paie, { statut: 'annulee', motifAnnulation: String(motif).trim(), dateAnnulation: todayISO(), annulePar: par() });
    paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'annulation', avant, motif });
    logOperation(state, 'annulation', `Paie ${paie.numero || `#${paie.id}`} (${paie.mois}) annulée — ${motif}`, paie.calcul?.net || 0);
    return paie;
  });
}

// ── Synthèses (tableau de bord et rapports) ──
export function syntheseMois(state, mois) {
  const paies = state.paies.filter((p) => p.mois === mois && p.statut !== 'annulee').map((p) => ({ paie: p, calcul: calculAffiche(state, p) }));
  const sum = (key, filter = () => true) => paies.filter(filter).reduce((s, x) => s + Number(x.calcul[key] || 0), 0);
  return {
    paies, nb: paies.length,
    brut: sum('brut'), primes: sum('totalPrimes'), retenues: sum('totalRetenues'), avances: sum('totalAvances'), net: sum('net'),
    paye: sum('net', (x) => x.paie.statut === 'payee'), aPayer: sum('net', (x) => x.paie.statut === 'validee'), brouillons: paies.filter((x) => x.paie.statut === 'brouillon').length
  };
}

// Récapitulatif d'une année scolaire (de la rentrée à la fin d'année) : une ligne par mois.
// `annee` est l'identifiant d'une année scolaire ; une année civile (« 2026 ») reste acceptée.
export function recapAnnuel(state, annee, employeId = 0) {
  const scolaire = state.annees.find((a) => a.id === Number(annee) && String(annee).length < 4);
  const listeMois = scolaire ? moisDeLAnnee(scolaire) : Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
  const paies = state.paies.filter((p) => listeMois.includes(p.mois) && p.statut !== 'annulee' && p.statut !== 'brouillon' && (!employeId || p.employeId === Number(employeId)));
  const mois = listeMois.map((m) => {
    const list = paies.filter((p) => p.mois === m);
    const s = (k) => list.reduce((t, p) => t + Number(p.calcul[k] || 0), 0);
    return { mois: m, nb: list.length, brut: s('brut'), primes: s('totalPrimes'), retenues: s('totalRetenues'), avances: s('totalAvances'), net: s('net'), paye: list.filter((p) => p.statut === 'payee').reduce((t, p) => t + p.calcul.net, 0) };
  });
  const total = mois.reduce((t, m) => ({ nb: t.nb + m.nb, brut: t.brut + m.brut, primes: t.primes + m.primes, retenues: t.retenues + m.retenues, avances: t.avances + m.avances, net: t.net + m.net, paye: t.paye + m.paye }), { nb: 0, brut: 0, primes: 0, retenues: 0, avances: 0, net: 0, paye: 0 });
  return { mois, total };
}
