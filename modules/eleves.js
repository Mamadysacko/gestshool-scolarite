import { nextId } from './annees.js';

function generateMatricule(state) {
  const year = new Date().getFullYear();
  const prefix = `IBK-${year}-`;
  const existing = state.eleves
    .map((eleve) => eleve.matricule || '')
    .filter((m) => m.startsWith(prefix))
    .map((m) => parseInt(m.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function createEleve(state, payload = {}) {
  const nom = String(payload.nom || '').trim();
  const prenom = String(payload.prenom || '').trim();
  if (!nom || !prenom) return null;

  const item = {
    id: nextId(state.eleves),
    matricule: (payload.matricule && String(payload.matricule).trim()) ? String(payload.matricule).trim() : generateMatricule(state),
    nom,
    prenom,
    sexe: payload.sexe || 'M',
    dateNaissance: payload.dateNaissance || '',
    telephone: payload.telephone || '',
    email: payload.email || '',
    parent: payload.parent || '',
    adresse: payload.adresse || '',
    classeId: Number(payload.classeId || 0),
    actif: payload.actif !== false
  };

  state.eleves.push(item);
  return item;
}

export function updateEleve(state, id, payload = {}) {
  const item = state.eleves.find((eleve) => eleve.id === Number(id));
  if (!item) return null;

  Object.assign(item, {
    matricule: payload.matricule || item.matricule,
    nom: payload.nom || item.nom,
    prenom: payload.prenom || item.prenom,
    sexe: payload.sexe || item.sexe,
    dateNaissance: payload.dateNaissance || item.dateNaissance,
    telephone: payload.telephone || item.telephone,
    email: payload.email || item.email,
    parent: payload.parent || item.parent,
    adresse: payload.adresse || item.adresse,
    classeId: Number(payload.classeId || item.classeId),
    actif: payload.actif !== undefined ? payload.actif : item.actif
  });

  return item;
}

export function toggleEleveState(state, id) {
  const item = state.eleves.find((eleve) => eleve.id === Number(id));
  if (!item) return null;
  item.actif = !item.actif;
  return item;
}

export function deleteEleve(state, id) {
  const targetId = Number(id);
  const index = state.eleves.findIndex((item) => item.id === targetId);
  if (index === -1) return false;

  state.eleves.splice(index, 1);
  state.inscriptions = state.inscriptions.filter((inscription) => inscription.eleveId !== targetId);
  return true;
}
