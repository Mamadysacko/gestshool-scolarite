import { exiger, controleActif } from './auth.js';
import { consommerLicence } from './licences.js';

export function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export function createAnnee(state, payload = {}) {
  exiger('scolarite.parametrer');
  const annee = String(payload.annee || '').trim();
  if (!annee || state.annees.some((item) => item.annee === annee)) return null;
  // Chaque nouvelle année scolaire consomme une clé de licence (contrôle appliqué dès que l'application est en service)
  const licence = controleActif() || payload.cleLicence ? consommerLicence(state, payload.cleLicence, annee) : null;

  const item = {
    id: nextId(state.annees),
    annee,
    dateDebut: payload.dateDebut || '',
    dateFin: payload.dateFin || '',
    statut: payload.statut || 'preparation',
    soldeInitial: Math.max(Number(payload.soldeInitial || 0), 0),
    fraisInscription: Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0),
    fraisReinscription: Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0),
    licence: licence ? { n: licence.n, empreinte: licence.empreinte, date: licence.date } : null
  };

  state.annees.push(item);
  if (item.statut === 'ouverte') {
    state.annees.forEach((year) => {
      if (year.id !== item.id && year.statut === 'ouverte') {
        year.statut = 'cloturee';
      }
    });
  }

  if (!state.anneeActiveId) {
    state.anneeActiveId = item.id;
  }

  return item;
}

export function updateAnneeStatus(state, id, status) {
  exiger('scolarite.parametrer');
  const annee = state.annees.find((item) => item.id === Number(id));
  if (!annee) return null;
  annee.statut = status;

  if (status === 'ouverte') {
    state.annees.forEach((item) => {
      if (item.id !== annee.id && item.statut === 'ouverte') {
        item.statut = 'cloturee';
      }
    });
  }

  if (status === 'ouverte' || status === 'preparation') {
    state.anneeActiveId = annee.id;
  }

  return annee;
}

export function updateAnnee(state, id, payload = {}) {
  exiger('scolarite.parametrer');
  const annee = state.annees.find((item) => item.id === Number(id));
  const label = String(payload.annee || '').trim();
  if (!annee || !label) return null;
  if (state.annees.some((item) => item.id !== annee.id && item.annee === label)) return null;
  annee.annee = label;
  annee.dateDebut = payload.dateDebut || '';
  annee.dateFin = payload.dateFin || '';
  if (payload.soldeInitial !== undefined) annee.soldeInitial = Math.max(Number(payload.soldeInitial || 0), 0);
  // Les nouveaux montants s'appliquent aux inscriptions futures : un frais déjà enregistré n'est jamais modifié
  if (payload.fraisInscription !== undefined) annee.fraisInscription = Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0);
  if (payload.fraisReinscription !== undefined) annee.fraisReinscription = Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0);
  return annee;
}

// Refus si des classes ou des inscriptions (donc l'historique financier) dépendent de l'année.
export function deleteAnnee(state, id) {
  exiger('scolarite.parametrer');
  const targetId = Number(id);
  const index = state.annees.findIndex((item) => item.id === targetId);
  if (index === -1) return false;
  if (state.classes.some((c) => c.anneeId === targetId) || state.inscriptions.some((i) => i.anneeId === targetId)) return false;

  state.annees.splice(index, 1);
  state.tarifs = state.tarifs.filter((tarif) => tarif.anneeId !== targetId);
  if (state.anneeActiveId === targetId) state.anneeActiveId = state.annees[0]?.id || null;
  return true;
}

export function setAnneeActive(state, id) {
  const targetId = Number(id);
  const annee = state.annees.find((item) => item.id === targetId);
  if (!annee) return null;
  state.anneeActiveId = targetId;
  return annee;
}

export function getAnneeActive(state) {
  return state.annees.find((item) => item.id === Number(state.anneeActiveId)) || state.annees[0] || null;
}

// Année scolaire couvrant un mois « AAAA-MM » (dates officielles), sinon l'année active
export function anneeCouvrantMois(state, mois) {
  const first = `${mois}-01`;
  return state.annees.find((a) => a.dateDebut && a.dateFin && a.dateDebut.slice(0, 7) <= mois && first <= a.dateFin) || state.annees.find((a) => a.id === state.anneeActiveId) || null;
}

// Année à laquelle rattacher une opération de caisse datée (paie, avance, remboursement) : celle qui couvre la date
// si elle n'est pas clôturée, sinon l'année active (aucune écriture sur une année clôturée)
export function anneeDeLOperation(state, date) {
  const annee = anneeCouvrantMois(state, String(date || '').slice(0, 7));
  return annee && annee.statut !== 'cloturee' ? annee.id : Number(state.anneeActiveId || annee?.id || 0);
}
