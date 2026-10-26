import { nextId } from './annees.js';
import { exiger } from './auth.js';

// Catégories d'enseignement proposées à une nouvelle installation : modifiables par l'établissement
// (Administration → Paramètres financiers). CATEGORIES est mis à jour sur place : tous les écrans voient la liste courante.
export const CATEGORIES_DEFAUT = ['Maternelle', 'Primaire', 'Collège', 'Lycée'];
export const CATEGORIES = [...CATEGORIES_DEFAUT];

const nettoyer = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().slice(0, 40)).filter(Boolean))];

// Liste effective : celle de la configuration, complétée des catégories déjà portées par des classes (jamais perdues)
export function syncCategories(state) {
  const configured = nettoyer(state.config.categories);
  const used = nettoyer(state.classes.map((c) => c.categorie)).filter((c) => !configured.includes(c));
  state.config.categories = configured.length || used.length ? [...configured, ...used] : [...CATEGORIES_DEFAUT];
  CATEGORIES.splice(0, CATEGORIES.length, ...state.config.categories);
  return CATEGORIES;
}

// Remplace la liste ; une catégorie utilisée par une classe ne peut pas être retirée
export function setCategories(state, list) {
  exiger('admin');
  const next = nettoyer(list);
  if (!next.length) throw new Error('Gardez au moins une catégorie d’enseignement.');
  const missing = nettoyer(state.classes.map((c) => c.categorie)).filter((c) => !next.includes(c));
  if (missing.length) throw new Error(`Catégorie(s) utilisée(s) par des classes : ${missing.join(', ')}.`);
  state.config.categories = next;
  return syncCategories(state);
}

export function createClasse(state, payload = {}) {
  exiger('scolarite.parametrer');
  const nom = String(payload.nom || '').trim();
  if (!nom) return null;
  const anneeId = Number(payload.anneeId || state.anneeActiveId || 0);
  if (!state.annees.some((a) => a.id === anneeId)) return null; // une classe appartient toujours à une année existante
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
  exiger('scolarite.parametrer');
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
  exiger('scolarite.parametrer');
  const targetId = Number(id);
  const index = state.classes.findIndex((item) => item.id === targetId);
  if (index === -1) return false;
  if (state.inscriptions.some((i) => i.classeId === targetId) || state.eleves.some((e) => e.classeId === targetId)) return false;

  state.classes.splice(index, 1);
  state.tarifs = state.tarifs.filter((tarif) => tarif.classeId !== targetId);
  state.programmes = (state.programmes || []).filter((p) => p.classeId !== targetId);
  return true;
}
