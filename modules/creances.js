import { todayISO } from './utils.js';
import { echeancierSituation, resteEcheance, ordreEcheances, libelleEcheance } from './allocation.js';
import { modaliteActuelle } from './modalites.js';
import { detteRestante } from './reliquats.js';
import { totalEnAttente } from './attente.js';

// Créances scolaires : pour chaque inscription, ce qui est attendu, réglé et restant, les échéances dépassées,
// leur ancienneté et les réductions accordées. Tout est recalculé à partir des échéanciers et des paiements valides.

export const STATUTS_CREANCE = { retard: 'En retard', partiel: 'Partiellement payé', impaye: 'Aucun paiement', solde: 'Soldé' };
export const ANCIENNETES = [['', 'Toutes'], ['30', 'Retard de plus de 30 jours'], ['60', 'Plus de 60 jours'], ['90', 'Plus de 90 jours']];

const jours = (fromIso, toIso) => Math.max(Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000), 0);

export function creanceInscription(state, inscription, today = todayISO()) {
  const sit = echeancierSituation(inscription, today);
  const ordered = ordreEcheances(inscription);
  const enRetard = ordered.filter((e) => resteEcheance(e) > 0 && e.dateLimite && e.dateLimite < today);
  const plusAncienne = enRetard[0]?.dateLimite || '';
  const prochaine = ordered.find((e) => resteEcheance(e) > 0 && (!e.dateLimite || e.dateLimite >= today)) || null;
  const remise = (inscription.echeances || []).reduce((s, e) => s + Number(e.remise || 0), 0);
  return {
    inscription,
    eleve: state.eleves.find((e) => e.id === inscription.eleveId) || null,
    classe: state.classes.find((c) => c.id === inscription.classeId) || null,
    modalite: modaliteActuelle(inscription),
    attendu: sit.total, paye: sit.paye, reste: sit.reste, taux: sit.taux,
    retardMontant: enRetard.reduce((s, e) => s + resteEcheance(e), 0), echeancesEnRetard: enRetard,
    joursRetard: plusAncienne ? jours(plusAncienne, today) : 0, plusAncienne,
    prochaine, prochaineMontant: prochaine ? resteEcheance(prochaine) : 0,
    mensualitesImpayees: ordered.filter((e) => e.mensualite && resteEcheance(e) > 0).length,
    tranchesPartielles: ordered.filter((e) => !e.mensualite && e.type !== 'frais' && Number(e.montantPaye || 0) > 0 && resteEcheance(e) > 0).length,
    remise, reduction: inscription.reduction || null,
    enAttente: totalEnAttente(state, inscription.id),
    dette: detteRestante(state, inscription.eleveId, inscription.id),
    statut: sit.total > 0 && sit.reste === 0 ? 'solde' : enRetard.length ? 'retard' : sit.paye > 0 ? 'partiel' : 'impaye'
  };
}

// Liste filtrée des créances. f = { yearId, category, classId, statut, anciennete, reduction, search, soldes }
export function listeCreances(state, f = {}, today = todayISO()) {
  const search = String(f.search || '').trim().toLocaleLowerCase('fr');
  const anciennete = Number(f.anciennete || 0);
  return state.inscriptions
    .filter((i) => (!f.yearId || i.anneeId === Number(f.yearId)) && (!f.classId || i.classeId === Number(f.classId)))
    .filter((i) => !['transfere', 'abandon'].includes(i.statut) || (i.echeances || []).some((e) => resteEcheance(e) > 0))
    .map((i) => creanceInscription(state, i, today))
    .filter((c) => (!f.category || c.classe?.categorie === f.category)
      && (f.soldes || c.reste > 0)
      && (!f.statut || c.statut === f.statut)
      && (!anciennete || c.joursRetard > anciennete)
      && (!f.reduction || c.reduction)
      && (!search || `${c.eleve?.matricule || ''} ${c.eleve?.prenom || ''} ${c.eleve?.nom || ''} ${c.eleve?.nom || ''} ${c.eleve?.prenom || ''}`.toLocaleLowerCase('fr').includes(search)))
    .sort((a, b) => b.retardMontant - a.retardMontant || b.reste - a.reste || String(a.eleve?.nom || '').localeCompare(String(b.eleve?.nom || ''), 'fr'));
}

const totaux = (list) => ({
  nombre: list.length,
  attendu: list.reduce((s, c) => s + c.attendu, 0), paye: list.reduce((s, c) => s + c.paye, 0), reste: list.reduce((s, c) => s + c.reste, 0),
  retard: list.reduce((s, c) => s + c.retardMontant, 0), enRetard: list.filter((c) => c.retardMontant > 0).length, remise: list.reduce((s, c) => s + c.remise, 0)
});

export function syntheseCreances(list) {
  return totaux(list);
}

// Regroupement par classe (ou par année) : effectif concerné, attendu, réglé, reste et retard
export function creancesParClasse(state, list) {
  const map = new Map();
  list.forEach((c) => {
    const key = c.inscription.classeId;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  return [...map.entries()].map(([id, items]) => ({ classe: state.classes.find((c) => c.id === id) || null, ...totaux(items) }))
    .sort((a, b) => b.reste - a.reste);
}

export function creancesParAnnee(state, today = todayISO()) {
  return state.annees.map((a) => {
    const list = listeCreances(state, { yearId: a.id }, today);
    return { annee: a, ...totaux(list) };
  }).filter((r) => r.nombre > 0);
}

// Échéances en retard d'une créance, sous forme lisible pour la lettre de relance
export function lignesRelance(creance) {
  return creance.echeancesEnRetard.map((e) => ({ libelle: libelleEcheance(e), dateLimite: e.dateLimite, reste: resteEcheance(e) }));
}
