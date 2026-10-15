import { formatDateFr } from './utils.js';
import { scopeInscriptions, studentOf, yearLabel, classOf } from './finance.js';

export function studentName(state, inscription) {
  const s = studentOf(state, inscription);
  return s ? `${s.prenom} ${s.nom}` : '—';
}

function searchOk(state, inscription, q) {
  if (!q) return true;
  const s = studentOf(state, inscription);
  return `${s?.prenom || ''} ${s?.nom || ''} ${s?.matricule || ''}`.toLocaleLowerCase('fr').includes(q);
}

// Inscriptions concernées par les filtres année / catégorie / classe / recherche
export function scoped(state, f) {
  const q = String(f.search || '').trim().toLocaleLowerCase('fr');
  return scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category }).filter((i) => searchOk(state, i, q));
}

export const pct = (part, whole) => (whole ? `${Math.round(part / whole * 100)}%` : '—');

export function subtitle(state, f, withDates) {
  const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, `Classe : ${f.classId ? classOf(state, f.classId)?.nom : 'toutes'}`];
  if (withDates) parts.push(f.from === f.to ? `Date : ${formatDateFr(f.from)}` : `Période : ${formatDateFr(f.from)} → ${formatDateFr(f.to)}`);
  return parts.join(' · ');
}

export function expenseFilters(f) {
  return { yearId: f.yearId, from: f.from, to: f.to, categorie: f.categorieDepense, demandeur: f.demandeur };
}

export function expenseSubtitle(state, f) {
  const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, f.from || f.to ? `Période : ${f.from ? formatDateFr(f.from) : '…'} → ${f.to ? formatDateFr(f.to) : '…'}` : 'Toute la période'];
  if (f.categorieDepense) parts.push(`Catégorie : ${f.categorieDepense}`);
  if (f.demandeur) parts.push(`Demandeur : ${f.demandeur}`);
  return parts.join(' · ');
}
