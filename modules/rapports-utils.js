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
  if (withDates) parts.push(periodeDuRapport(state, f).libelle);
  return parts.join(' · ');
}

export function expenseFilters(state, f) {
  const p = periodeDuRapport(state, f);
  return { yearId: f.yearId, from: p.from, to: p.to, categorie: f.categorieDepense, demandeur: f.demandeur };
}

export function expenseSubtitle(state, f) {
  const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, periodeDuRapport(state, f).libelle];
  if (f.categorieDepense) parts.push(`Catégorie : ${f.categorieDepense}`);
  if (f.demandeur) parts.push(`Demandeur : ${f.demandeur}`);
  return parts.join(' · ');
}

// ── Période d'un rapport : journalier (une date), hebdomadaire (semaine ISO, lundi → dimanche), mensuel (du 1er au
// dernier jour du mois), annuel (dates officielles de l'année scolaire) ou période personnalisée. Les données sont
// filtrées strictement entre ces deux dates incluses : aucune opération d'un autre jour, d'une autre semaine ou
// d'un autre mois n'est comptée. ──
export const PERIODICITES = [['jour', 'Journalier'], ['semaine', 'Hebdomadaire'], ['mois', 'Mensuel'], ['annee', 'Annuel (année scolaire)'], ['perso', 'Période personnalisée']];
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Semaine ISO « 2026-W42 » → lundi et dimanche
export function bornesSemaine(semaine) {
  const m = /^(\d{4})-W(\d{2})$/.exec(semaine || '');
  if (!m) return null;
  const year = Number(m[1]); const week = Number(m[2]);
  const jan4 = new Date(year, 0, 4);
  const lundi = new Date(jan4);
  lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);
  return { from: isoDate(lundi), to: isoDate(dimanche) };
}

export function semaineDe(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${pad(Math.ceil(((date - yearStart) / 86400000 + 1) / 7))}`;
}

export function bornesMois(mois) {
  const m = /^(\d{4})-(\d{2})$/.exec(mois || '');
  if (!m) return null;
  const dernier = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return { from: `${mois}-01`, to: `${mois}-${pad(dernier)}` };
}

export function periodeDuRapport(state, f, today = new Date().toISOString().slice(0, 10)) {
  const gran = PERIODICITES.some(([k]) => k === f.gran) ? f.gran : 'mois';
  if (gran === 'jour') { const d = /^\d{4}-\d{2}-\d{2}$/.test(f.refJour || '') ? f.refJour : today; return { gran, from: d, to: d, libelle: `Journée du ${formatDateFr(d)}` }; }
  if (gran === 'semaine') { const w = bornesSemaine(f.refSemaine) || bornesSemaine(semaineDe(today)); return { gran, ...w, libelle: `Semaine du ${formatDateFr(w.from)} au ${formatDateFr(w.to)}` }; }
  if (gran === 'mois') { const b = bornesMois(f.refMois) || bornesMois(today.slice(0, 7)); return { gran, ...b, libelle: `Mois du ${formatDateFr(b.from)} au ${formatDateFr(b.to)}` }; }
  if (gran === 'annee') {
    const annee = state.annees.find((a) => a.id === Number(f.yearId)) || state.annees.find((a) => a.id === state.anneeActiveId);
    return { gran, from: annee?.dateDebut || '', to: annee?.dateFin || '', libelle: annee ? `Année scolaire ${annee.annee}${annee.dateDebut ? ` (${formatDateFr(annee.dateDebut)} → ${formatDateFr(annee.dateFin)})` : ''}` : 'Toute la période' };
  }
  return { gran, from: f.from || '', to: f.to || '', libelle: f.from || f.to ? `Période du ${f.from ? formatDateFr(f.from) : '…'} au ${f.to ? formatDateFr(f.to) : '…'}` : 'Toute la période' };
}

// Granularité des tableaux d'évolution selon la période
export function granulariteTableau(p) {
  if (p.gran === 'annee') return 'mois';
  if (p.gran === 'perso' && p.from && p.to) {
    const jours = (new Date(p.to) - new Date(p.from)) / 86400000;
    return jours > 120 ? 'mois' : jours > 31 ? 'semaine' : 'jour';
  }
  return 'jour';
}
