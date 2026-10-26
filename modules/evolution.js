import { buckets, bucketOf } from './rapports-periodiques.js';
import { todayISO } from './utils.js';

// Séries temporelles des montants (paiements, dépenses…) et comparaison avec la période précédente.
export const GRANULARITES_EVOLUTION = [['jour', 'Par jour'], ['semaine', 'Par semaine'], ['mois', 'Par mois']];

function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function joursPeriode(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
}

// Période précédente de même durée, se terminant la veille du début
export function periodePrecedente(from, to) {
  const n = joursPeriode(from, to);
  return { from: shiftDays(from, -n), to: shiftDays(from, -1) };
}

// Normalise une période : dates valides, début ≤ fin, au plus ~5 ans
export function normaliserPeriode(from, to) {
  const today = todayISO();
  let f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : `${today.slice(0, 4)}-01-01`;
  let t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
  if (f > t) [f, t] = [t, f];
  if (joursPeriode(f, t) > 1830) f = shiftDays(t, -1829);
  return { from: f, to: t };
}

// Somme des montants par intervalle (tous les intervalles de la période, même vides)
export function serie(items, dateOf, amountOf, from, to, gran) {
  const slots = buckets(from, to, gran);
  items.forEach((item) => {
    const date = dateOf(item);
    if (!date || date < from || date > to) return;
    const slot = slots.get(bucketOf(date, gran).key);
    if (slot) slot.value += Number(amountOf(item) || 0);
  });
  return [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, s]) => ({ key, label: s.label, value: s.value }));
}

// Évolution sur la période + série de la période précédente, alignées intervalle par intervalle
export function evolutionComparee(items, dateOf, amountOf, from, to, gran) {
  const courante = serie(items, dateOf, amountOf, from, to, gran);
  const prev = periodePrecedente(from, to);
  const precedente = serie(items, dateOf, amountOf, prev.from, prev.to, gran);
  const offset = Math.max(precedente.length - courante.length, 0);
  return {
    courante, precedente: precedente.slice(offset), periodePrecedente: prev,
    total: courante.reduce((s, x) => s + x.value, 0), totalPrecedent: precedente.reduce((s, x) => s + x.value, 0)
  };
}

export function variation(actuel, precedent) {
  if (!precedent) return actuel ? null : 0;
  return Math.round((actuel - precedent) / precedent * 100);
}
