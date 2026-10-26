import { formatMoney, formatDateFr, todayISO } from './utils.js';
import { scopeInscriptions, inRange, sumPayments, inscriptionSituation, classOf, yearLabel } from './finance.js';
import { COLORS, MONTHS, lineChart, groupedBars, donut } from './charts.js';
import { paymentAllocations } from './allocation.js';
import { MODALITES, modaliteActuelle } from './modalites.js';
import { recettesFiltrees } from './tresorerie.js';
import { periodeDuRapport, granulariteTableau, PERIODICITES } from './rapports-utils.js';

const MOYENS = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte' };

// Statistiques détaillées des paiements de la période : moyens, nature (frais / scolarité / dettes), modalités, meilleures journées
function statistiquesPaiements(payments, byId) {
  const total = sumPayments(payments);
  const group = (keyFn) => {
    const map = new Map();
    payments.forEach((p) => {
      const parts = keyFn(p);
      (Array.isArray(parts) ? parts : [[parts, Number(p.montant || 0)]]).forEach(([label, amount]) => {
        const g = map.get(label) || { label, count: 0, value: 0 };
        g.count += 1; g.value += amount;
        map.set(label, g);
      });
    });
    return [...map.values()].sort((a, b) => b.value - a.value).map((g) => ({ cells: [g.label, g.count, g.value, pct(g.value, total)] }));
  };
  // Nature : un règlement de dette compte en « Dettes antérieures » ; sinon chaque imputation selon l'échéance réglée
  const nature = (p) => {
    if (p.reliquatId) return [['Dettes antérieures', Number(p.montant || 0)]];
    const inscription = byId.get(p.inscriptionId);
    return paymentAllocations(p).map((a) => {
      const e = (inscription?.echeances || []).find((x) => x.id === a.echeanceId);
      return [e?.type === 'frais' ? 'Frais d’inscription / réinscription' : 'Scolarité', Number(a.montant || 0)];
    });
  };
  const days = new Map();
  payments.forEach((p) => days.set(p.datePaiement, (days.get(p.datePaiement) || 0) + Number(p.montant || 0)));
  const topDays = [...days.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    count: payments.length, total,
    moyenne: payments.length ? Math.round(total / payments.length) : 0,
    max: payments.reduce((m, p) => Math.max(m, Number(p.montant || 0)), 0),
    payeurs: new Set(payments.map((p) => byId.get(p.inscriptionId)?.eleveId)).size,
    joursActifs: days.size,
    moyenneJour: days.size ? Math.round(total / days.size) : 0,
    moyens: group((p) => MOYENS[p.mode] || p.mode || '—'),
    nature: group(nature),
    modalites: group((p) => MODALITES[p.modalite || modaliteActuelle(byId.get(p.inscriptionId) || {})] || 'Non précisée'),
    topDays: topDays.map(([date, value], i) => ({ cells: [i + 1, formatDateFr(date), days.size ? payments.filter((p) => p.datePaiement === date).length : 0, value] }))
  };
}

const PALETTE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];
export const GRANULARITES = [{ id: 'jour', label: 'Journalier' }, { id: 'semaine', label: 'Hebdomadaire' }, { id: 'mois', label: 'Mensuel' }, { id: 'annee', label: 'Annuel' }];

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

export function bucketOf(iso, gran) {
  const [y, m, d] = iso.split('-').map(Number);
  if (gran === 'annee') return { key: String(y), label: String(y) };
  if (gran === 'jour') return { key: iso.slice(0, 10), label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
  if (gran === 'mois') return { key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}` };
  const w = isoWeek(new Date(y, m - 1, d));
  return { key: `${w.year}-S${String(w.week).padStart(2, '0')}`, label: `S${w.week} ${w.year}` };
}

// Tous les intervalles entre deux dates, y compris ceux sans encaissement
export function buckets(from, to, gran) {
  const out = new Map();
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let guard = 0; cursor <= end && guard < 4000; guard += 1) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const b = bucketOf(iso, gran);
    if (!out.has(b.key)) out.set(b.key, { ...b, value: 0, count: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

const pct = (part, whole) => (whole ? `${Math.round(part / whole * 100)}%` : '—');
const variation = (now, before) => (before ? `${now >= before ? '+' : ''}${Math.round((now - before) / before * 100)}%` : '—');

function distribution(payments, inscriptionById, state, labelFn) {
  const map = new Map();
  payments.forEach((p) => {
    const label = labelFn(inscriptionById.get(p.inscriptionId));
    const g = map.get(label) || { label, value: 0, count: 0 };
    g.value += Number(p.montant || 0); g.count += 1;
    map.set(label, g);
  });
  const total = sumPayments(payments);
  return [...map.values()].sort((a, b) => b.value - a.value).map((g) => ({ cells: [g.label, g.count, g.value, pct(g.value, total)] }));
}

export function buildPeriodique(state, f, subtitle) {
  const periode = periodeDuRapport(state, f);
  const gran = granulariteTableau(periode);
  const from = periode.from || `${new Date().getFullYear()}-01-01`;
  const to = periode.to || todayISO();
  const inscriptions = scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category });
  // Toutes les inscriptions (une dette antérieure réglée cette année porte sur une inscription d'une autre année)
  const byId = new Map(state.inscriptions.map((i) => [i.id, i]));
  const allPayments = recettesFiltrees(state, { yearId: f.yearId, classId: f.classId, category: f.category });
  const payments = allPayments.filter((p) => inRange(p.datePaiement, from, to));
  const sits = inscriptions.map((i) => inscriptionSituation(state, i));
  const attendu = sits.reduce((s, x) => s + x.total, 0);
  const encaisseTotal = sits.reduce((s, x) => s + x.paye, 0);
  const encaissePeriode = sumPayments(payments);
  const integral = sits.filter((s) => s.total > 0 && s.reste === 0).length;
  const partial = sits.filter((s) => s.paye > 0 && s.reste > 0).length;
  const none = sits.filter((s) => s.paye === 0 && s.total > 0).length;

  const bucketMap = buckets(from, to, gran);
  payments.forEach((p) => {
    const b = bucketOf(p.datePaiement, gran);
    const slot = bucketMap.get(b.key);
    if (slot) { slot.value += Number(p.montant || 0); slot.count += 1; }
  });
  const series = [...bucketMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  let cumul = 0;
  const evolutionRows = series.map((b, i) => { cumul += b.value; return { cells: [b.label, b.count, b.value, variation(b.value, series[i - 1]?.value), cumul] }; });

  const catLabel = (i) => classOf(state, i.classeId)?.categorie || '—';
  const categories = distribution(payments, byId, state, catLabel);
  const palette = (rows) => rows.slice(0, 6).map((r, k) => ({ label: r.cells[0], value: r.cells[2], color: PALETTE[k] }));

  // Comparaison des mêmes mois d'une année civile à l'autre (toutes données du périmètre)
  const years = [...new Set(allPayments.map((p) => String(p.datePaiement).slice(0, 4)))].sort().slice(-3);
  const monthTable = MONTHS.map((label, m) => {
    const row = { label };
    years.forEach((y) => {
      row[`y${y}`] = sumPayments(allPayments.filter((p) => String(p.datePaiement).slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`));
    });
    return row;
  });
  const yearColors = [COLORS.attendu, '#16a34a', COLORS.encaisse].slice(3 - years.length);
  const monthSeries = years.map((y, i) => ({ key: `y${y}`, name: y, color: yearColors[i] }));

  const stats = statistiquesPaiements(payments, byId);
  const sections = [
    { title: `Évolution des encaissements (${GRANULARITES.find((g) => g.id === gran).label.toLowerCase()})`, head: ['Période', 'Paiements', 'Encaissé', 'Variation', 'Cumul'], money: [2, 4], rows: evolutionRows,
      foot: ['TOTAL', payments.length, encaissePeriode, '', ''], empty: 'Aucun encaissement.',
      chart: lineChart(series.map((b) => ({ label: b.label, full: b.label, value: b.value })), state.config.devise) },
    { title: 'Répartition par formation (catégorie)', head: ['Formation', 'Paiements', 'Encaissé', 'Part'], money: [2], rows: categories, foot: ['TOTAL', payments.length, encaissePeriode, '100%'], empty: 'Aucun encaissement.',
      chart: donut(palette(categories), 'encaissé', (v) => `${formatMoney(v)} ${state.config.devise}`) },
    { title: 'Classement des formations par recettes', head: ['Rang', 'Formation', 'Encaissé', 'Part'], money: [2], rows: categories.map((r, i) => ({ cells: [i + 1, r.cells[0], r.cells[2], r.cells[3]] })), empty: 'Aucun encaissement.',
      chart: categories.length ? groupedBars(categories.map((r) => ({ label: r.cells[0], v: r.cells[2] })), state.config.devise, [{ key: 'v', name: 'Encaissé', color: COLORS.encaisse }]) : '' },
    { title: 'Répartition par classe', head: ['Classe', 'Paiements', 'Encaissé', 'Part'], money: [2], rows: distribution(payments, byId, state, (i) => { const c = classOf(state, i.classeId); return c ? c.nom : '—'; }), empty: 'Aucun encaissement.' },
    { title: 'Répartition par année scolaire', head: ['Année scolaire', 'Paiements', 'Encaissé', 'Part'], money: [2], rows: distribution(payments, byId, state, (i) => yearLabel(state, i.anneeId)), empty: 'Aucun encaissement.' },
    { title: 'Comparaison des recettes mois par mois', head: ['Mois', ...years], money: years.map((_, i) => i + 1), rows: monthTable.map((r) => ({ cells: [r.label, ...years.map((y) => r[`y${y}`])] })),
      foot: ['TOTAL', ...years.map((y) => monthTable.reduce((s, r) => s + r[`y${y}`], 0))], empty: 'Aucune donnée.',
      chart: years.length ? groupedBars(monthTable, state.config.devise, monthSeries) : '', legend: monthSeries.map((s) => ({ name: s.name, color: s.color })) }
  ];

  return {
    title: `Rapport financier ${(PERIODICITES.find(([k]) => k === periode.gran)?.[1] || '').toLowerCase()}`,
    subtitle: `${subtitle} · ${periode.libelle}`,
    kpis: [['Frais attendus', attendu, true], ['Encaissé sur la période', encaissePeriode, true], ['Reste à payer (cumul)', Math.max(attendu - encaisseTotal, 0), true], ['Taux de recouvrement', pct(encaisseTotal, attendu)],
      ['Paiements sur la période', stats.count], ['Paiement moyen', stats.moyenne, true], ['Plus gros paiement', stats.max, true], ['Élèves payeurs', stats.payeurs],
      ['Jours avec encaissement', stats.joursActifs], ['Moyenne par jour encaissé', stats.moyenneJour, true],
      ['Élèves soldés', integral], ['Élèves partiels', partial], ['Aucun paiement', none]],
    sections: [...sections,
      { title: 'Paiements par moyen de paiement', head: ['Moyen', 'Paiements', 'Encaissé', 'Part'], money: [2], rows: stats.moyens, foot: ['TOTAL', stats.count, stats.total, '100%'], empty: 'Aucun encaissement.',
        chart: stats.moyens.length ? donut(stats.moyens.slice(0, 6).map((r, k) => ({ label: r.cells[0], value: r.cells[2], color: PALETTE[k] })), 'encaissé', (v) => `${formatMoney(v)} ${state.config.devise}`) : '' },
      { title: 'Encaissements par nature', head: ['Nature', 'Imputations', 'Montant', 'Part'], money: [2], rows: stats.nature, foot: ['TOTAL', '', stats.total, '100%'], empty: 'Aucun encaissement.' },
      { title: 'Encaissements par modalité de règlement', head: ['Modalité', 'Paiements', 'Encaissé', 'Part'], money: [2], rows: stats.modalites, foot: ['TOTAL', stats.count, stats.total, '100%'], empty: 'Aucun encaissement.' },
      { title: 'Meilleures journées d’encaissement', head: ['Rang', 'Date', 'Paiements', 'Encaissé'], money: [3], rows: stats.topDays, empty: 'Aucun encaissement.' }],
    portrait: true
  };
}
