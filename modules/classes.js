import { nextId } from './annees.js';

export const CATEGORIES = ['Primaire', 'Collège', 'Lycée'];

export function createClasse(state, payload = {}) {
  const nom = String(payload.nom || '').trim();
  if (!nom) return null;
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
  if (state.classes.some((c) => c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;

  const item = {
    id: nextId(state.classes),
    nom,
    categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : CATEGORIES[0],
    anneeId,
    capacite: Number(payload.capacite || 0),
    active: payload.active !== false
  };

  state.classes.push(item);
  return item;
}

export function updateClasse(state, id, payload = {}) {
  const item = state.classes.find((classe) => classe.id === Number(id));
  if (!item) return null;
  const nom = String(payload.nom || item.nom).trim();
  const anneeId = Number(payload.anneeId || item.anneeId);
  if (state.classes.some((c) => c.id !== item.id && c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;

  Object.assign(item, {
    nom,
    categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : item.categorie,
    anneeId,
    capacite: Number(payload.capacite || item.capacite),
    active: payload.active !== undefined ? payload.active : item.active
  });

  return item;
}

// Refus si des élèves ou des inscriptions (donc des paiements) dépendent de la classe.
export function deleteClasse(state, id) {
  const targetId = Number(id);
  const index = state.classes.findIndex((item) => item.id === targetId);
  if (index === -1) return false;
  if (state.inscriptions.some((i) => i.classeId === targetId) || state.eleves.some((e) => e.classeId === targetId)) return false;

  state.classes.splice(index, 1);
  state.tarifs = state.tarifs.filter((tarif) => tarif.classeId !== targetId);
  return true;
}
