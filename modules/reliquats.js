import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { echeancierSituation } from './allocation.js';
import { todayISO } from './utils.js';

// Reliquats (dettes des années précédentes).
// La dette reste portée par l'inscription d'origine (ses échéances impayées) : c'est l'unique source de vérité,
// ce qui empêche de compter la même somme due deux fois (ancienne année + nouvelle année).
// Le registre `state.reliquats` trace le report : montant reporté, date, année de report ; les règlements sont
// des paiements ordinaires sur l'inscription d'origine, marqués `reliquatId` et encaissés sur l'année de report.

function annee(state, id) { return state.annees.find((a) => a.id === id) || null; }

// Ordre chronologique des années : date de rentrée, sinon libellé (« 2025-2026 » < « 2026-2027 »)
function anneeKey(state, id) {
  const a = annee(state, id);
  return a ? `${a.dateDebut || ''}|${a.annee}` : '';
}

export function estAnterieure(state, anneeA, anneeB) {
  return anneeKey(state, anneeA) < anneeKey(state, anneeB);
}

export function reliquatOf(state, inscriptionId) {
  return (state.reliquats || []).find((r) => r.inscriptionId === Number(inscriptionId)) || null;
}

// Report EXPLICITE des soldes impayés : rien n'est reporté automatiquement. L'établissement choisit, dans la page
// « Dettes antérieures », les soldes d'années antérieures à reprendre sur une année donnée. Chaque report garde
// son origine (année, classe), le montant initial, ce qui avait déjà été réglé et le solde reporté ; un même solde
// n'est jamais reporté deux fois.
export function soldesReportables(state, cibleId) {
  return state.inscriptions.filter((i) => estAnterieure(state, i.anneeId, Number(cibleId)) && !reliquatOf(state, i.id)).map((inscription) => {
    const sit = echeancierSituation(inscription);
    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    const inscritCible = state.inscriptions.some((j) => j.eleveId === inscription.eleveId && j.anneeId === Number(cibleId));
    return { inscription, eleve, total: sit.total, paye: sit.paye, reste: sit.reste, inscritCible };
  }).filter((x) => x.reste > 0).sort((x, y) => anneeKey(state, x.inscription.anneeId).localeCompare(anneeKey(state, y.inscription.anneeId)) || String(x.eleve?.nom).localeCompare(String(y.eleve?.nom), 'fr'));
}

export function reporterSoldes(state, cibleId, inscriptionIds = []) {
  if (!Array.isArray(state.reliquats)) state.reliquats = [];
  const cible = annee(state, Number(cibleId));
  if (!cible) throw new Error('Année de report introuvable.');
  const created = [];
  inscriptionIds.map(Number).forEach((id) => {
    const inscription = state.inscriptions.find((i) => i.id === id);
    if (!inscription) throw new Error('Inscription introuvable.');
    if (!estAnterieure(state, inscription.anneeId, cible.id)) throw new Error('Seul le solde d’une année antérieure peut être reporté.');
    if (reliquatOf(state, id)) return; // déjà reporté : jamais deux fois
    const sit = echeancierSituation(inscription);
    if (sit.reste <= 0) return;
    const record = {
      id: nextId(state.reliquats), eleveId: inscription.eleveId, inscriptionId: inscription.id, anneeOrigineId: inscription.anneeId, classeOrigineId: inscription.classeId,
      anneeReportId: cible.id, montantInitial: sit.total, regleAvantReport: sit.paye, montantReporte: sit.reste, dateReport: todayISO(), creeLe: Date.now()
    };
    state.reliquats.push(record);
    created.push(record);
    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    logOperation(state, 'reliquat', `Solde impayé ${annee(state, inscription.anneeId)?.annee || ''} de ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève'} reporté sur ${cible.annee}`, sit.reste);
  });
  return created;
}

// Montant reporté, remboursé (règlements validés) et reste dû calculé sur l'inscription d'origine
export function situationReliquat(state, record) {
  const inscription = state.inscriptions.find((i) => i.id === record.inscriptionId);
  const reste = inscription ? echeancierSituation(inscription).reste : 0;
  const reglements = state.paiements.filter((p) => !p.annule && p.reliquatId === record.id).sort((a, b) => a.id - b.id);
  const rembourse = reglements.reduce((s, p) => s + Number(p.montant || 0), 0);
  return { ...record, inscription, reste, rembourse, reglements, statut: reste <= 0 ? 'solde' : rembourse > 0 ? 'partiel' : 'du' };
}

export const STATUT_RELIQUAT = { du: 'Dû', partiel: 'Partiellement remboursé', solde: 'Soldé' };

export function reliquatsEleve(state, eleveId) {
  return (state.reliquats || []).filter((r) => r.eleveId === Number(eleveId)).map((r) => situationReliquat(state, r));
}

// Dette antérieure encore due par un élève (hors inscription donnée)
export function detteRestante(state, eleveId, saufInscriptionId = 0) {
  return reliquatsEleve(state, eleveId).filter((r) => r.inscriptionId !== saufInscriptionId).reduce((s, r) => s + r.reste, 0);
}

// Année sur laquelle un règlement de dette est encaissé (trésorerie) : celle du report, sinon l'année active
export function anneeEncaissement(state, record) {
  return record.anneeReportId || state.anneeActiveId || record.anneeOrigineId;
}
