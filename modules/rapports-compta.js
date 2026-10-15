import { formatMoney, todayISO } from './utils.js';
import { inRange, sumPayments, labelEcheance, studentOf, classOf, echeanceReste } from './finance.js';
import { depensesFiltrees, recettesFiltrees, situationCaisse, somme } from './tresorerie.js';
import { bucketOf, buckets } from './rapports-periodiques.js';
import { echeancierSituation, STATUT_ECHEANCE_LABELS, paymentAllocations, allocationLabel } from './allocation.js';
import { COLORS, groupedBars, donut } from './charts.js';
import { studentName, scoped, pct, subtitle, expenseFilters, expenseSubtitle } from './rapports-utils.js';

const PIE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];

// Recettes et dépenses d'une journée (ou d'une période) avec la synthèse de caisse
export function buildJournalier(state, f) {
  const ids = new Map(scoped(state, f).map((i) => [i.id, i]));
  const payments = state.paiements.filter((p) => !p.annule && ids.has(p.inscriptionId) && inRange(p.datePaiement, f.from, f.to));
  const groups = new Map();
  payments.forEach((p) => {
    const inscription = ids.get(p.inscriptionId);
    const classe = classOf(state, inscription.classeId);
    const key = `${classe?.categorie || ''}|${classe?.nom || ''}`;
    if (!groups.has(key)) groups.set(key, { classe, items: [] });
    groups.get(key).items.push({ p, inscription });
  });
  const rows = [];
  [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')).forEach(([, { classe, items }]) => {
    items.sort((a, b) => String(a.p.datePaiement).localeCompare(String(b.p.datePaiement)) || a.p.id - b.p.id).forEach(({ p, inscription }) => {
      const detail = paymentAllocations(p).map((a) => allocationLabel(inscription, a)).join(' + ');
      rows.push({ cells: [`${classe?.nom || '—'} (${classe?.categorie || '—'})`, p.datePaiement, p.numeroRecu || '—', studentOf(state, inscription)?.matricule || '—', studentName(state, inscription), detail, p.mode, p.caissier || '—', p.montant] });
    });
    rows.push({ cls: 'sub', cells: [`Sous-total ${classe?.nom || ''}`, '', '', '', '', '', '', `${items.length} paiement(s)`, sumPayments(items.map((i) => i.p))] });
  });
  const total = sumPayments(payments);
  const expenses = depensesFiltrees(state, { yearId: f.yearId, from: f.from, to: f.to }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totalDep = somme(expenses, 'montant');
  const caisse = situationCaisse(state, { yearId: f.yearId, from: f.from, to: f.to });
  return {
    title: 'Recettes et dépenses', subtitle: subtitle(state, f, true),
    kpis: [['Recettes', total, true], ['Dépenses', totalDep, true], ['Résultat de la période', total - totalDep, true], ['Solde disponible', caisse.solde, true]],
    sections: [
      { title: 'Recettes (encaissements)', head: ['Classe', 'Date', 'N° reçu', 'Matricule', 'Élève', 'Imputé sur', 'Mode', 'Caissier', 'Montant'],
        money: [8], rows, foot: ['TOTAL RECETTES', '', '', '', '', '', '', `${payments.length} paiement(s)`, total], empty: 'Aucun paiement sur cette période.' },
      { title: 'Dépenses', head: ['N°', 'Date', 'Catégorie', 'Description', 'Bénéficiaire', 'Demandé par', 'Montant'], money: [6],
        rows: expenses.map((d) => ({ cells: [d.numero, d.date, d.categorie, d.description, d.beneficiaire || '—', d.demandeur, d.montant] })),
        foot: ['TOTAL DÉPENSES', '', '', '', '', `${expenses.length} dépense(s)`, totalDep], empty: 'Aucune dépense sur cette période.' },
      { title: 'Synthèse de caisse', head: ['Élément', 'Montant'], money: [1], rows: [
        { cells: ['Solde d’ouverture', caisse.ouverture] }, { cells: ['+ Recettes', caisse.recettes] }, { cells: ['− Dépenses', caisse.depenses] }],
      foot: ['SOLDE DISPONIBLE', caisse.solde], empty: '' }
    ]
  };
}

function groupExpenses(list, keyFn) {
  const map = new Map();
  list.forEach((d) => {
    const k = keyFn(d) || '—';
    const g = map.get(k) || { label: k, nb: 0, total: 0 };
    g.nb += 1; g.total += Number(d.montant || 0);
    map.set(k, g);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Onglet « Aperçu des dépenses » : par catégorie, par demandeur et historique détaillé
export function buildDepenses(state, f) {
  const list = depensesFiltrees(state, expenseFilters(f)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = somme(list, 'montant');
  const caisse = situationCaisse(state, { yearId: f.yearId, from: f.from, to: f.to });
  const byCat = groupExpenses(list, (d) => d.categorie);
  const byWho = groupExpenses(list, (d) => d.demandeur);
  const rowsOf = (groups) => groups.map((g) => ({ cells: [g.label, g.nb, g.total, pct(g.total, total)] }));
  return {
    title: 'Aperçu des dépenses', subtitle: expenseSubtitle(state, f),
    kpis: [['Total des recettes', caisse.recettes, true], ['Total des dépenses', caisse.depenses, true], ['Solde d’ouverture', caisse.ouverture, true], ['Solde disponible', caisse.solde, true]],
    sections: [
      { title: 'Dépenses par catégorie', head: ['Catégorie', 'Nombre', 'Montant', 'Part'], money: [2], rows: rowsOf(byCat), foot: ['TOTAL', list.length, total, '100%'], empty: 'Aucune dépense.',
        chart: byCat.length ? donut(byCat.slice(0, 6).map((g, i) => ({ label: g.label, value: g.total, color: PIE[i] })), 'dépensé', (v) => `${formatMoney(v)} ${state.config.devise}`) : '' },
      { title: 'Dépenses par demandeur', head: ['Demandé par', 'Nombre', 'Montant', 'Part'], money: [2], rows: rowsOf(byWho), foot: ['TOTAL', list.length, total, '100%'], empty: 'Aucune dépense.' },
      { title: 'Historique des dépenses', head: ['N°', 'Date', 'Catégorie', 'Description', 'Bénéficiaire', 'Demandé par', 'Référence', 'Montant'], money: [7],
        rows: list.map((d) => ({ cells: [d.numero, d.date, d.categorie, d.description, d.beneficiaire || '—', d.demandeur, d.reference || '—', d.montant] })),
        foot: ['TOTAL', '', '', '', '', '', `${list.length} dépense(s)`, total], empty: 'Aucune dépense pour cette sélection.' }
    ]
  };
}

// Flux de trésorerie mensuel ou annuel : recettes, dépenses, résultat et solde cumulé
export function buildTresorerie(state, f) {
  const gran = ['jour', 'semaine', 'mois', 'annee'].includes(f.gran) ? f.gran : 'mois';
  const all = [...recettesFiltrees(state, { yearId: f.yearId }).map((p) => p.datePaiement), ...depensesFiltrees(state, { yearId: f.yearId }).map((d) => d.date)].sort();
  const today = todayISO();
  const from = f.from || all[0] || today;
  const to = f.to || today;
  const slots = buckets(from, to, gran);
  const add = (date, key, amount) => {
    const slot = slots.get(bucketOf(date, gran).key);
    if (slot) slot[key] = (slot[key] || 0) + Number(amount || 0);
  };
  recettesFiltrees(state, { yearId: f.yearId, from, to }).forEach((p) => add(p.datePaiement, 'rec', p.montant));
  depensesFiltrees(state, { yearId: f.yearId, from, to }).forEach((d) => add(d.date, 'dep', d.montant));
  const caisse = situationCaisse(state, { yearId: f.yearId, from: f.from, to });
  let cumul = caisse.ouverture;
  const series = [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => s);
  const rows = series.map((s) => {
    const rec = s.rec || 0;
    const dep = s.dep || 0;
    cumul += rec - dep;
    return { cells: [s.label, rec, dep, rec - dep, cumul] };
  });
  return {
    title: `Flux de trésorerie ${{ jour: 'journalier', semaine: 'hebdomadaire', mois: 'mensuel', annee: 'annuel' }[gran]}`, subtitle: expenseSubtitle(state, f),
    kpis: [['Solde d’ouverture', caisse.ouverture, true], ['Recettes', caisse.recettes, true], ['Dépenses', caisse.depenses, true], ['Solde disponible', caisse.solde, true]],
    sections: [{
      title: 'Recettes, dépenses et solde par période', head: ['Période', 'Recettes', 'Dépenses', 'Résultat', 'Solde cumulé'], money: [1, 2, 3, 4], rows,
      foot: ['TOTAL', caisse.recettes, caisse.depenses, caisse.recettes - caisse.depenses, caisse.solde], empty: 'Aucun mouvement.',
      legend: [{ name: 'Recettes', color: COLORS.encaisse }, { name: 'Dépenses', color: COLORS.attendu }],
      chart: rows.length ? groupedBars(series.map((s) => ({ label: s.label, rec: s.rec || 0, dep: s.dep || 0 })), state.config.devise, [{ key: 'rec', name: 'Recettes', color: COLORS.encaisse }, { key: 'dep', name: 'Dépenses', color: COLORS.attendu }]) : ''
    }]
  };
}

// Statut des tranches / mensualités + ponctualité (calculés à partir des imputations réelles)
export function buildEcheances(state, f) {
  const groups = new Map();
  const status = new Map();
  scoped(state, f).forEach((inscription) => {
    const pays = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id);
    echeancierSituation(inscription).lignes.forEach(({ echeance: e, statut }) => {
      const key = `${String(e.trancheId).padStart(2, '0')}|${labelEcheance(e)}`;
      const g = groups.get(key) || { attendu: 0, aTemps: 0, retard: 0 };
      const st = status.get(key) || { soldee: 0, partielle: 0, impayee: 0, retard: 0, reste: 0 };
      st[statut] += 1;
      st.reste += echeanceReste(e);
      status.set(key, st);
      g.attendu += Number(e.montant || 0);
      pays.forEach((p) => paymentAllocations(p).filter((a) => a.echeanceId === e.id).forEach((a) => {
        if (!e.dateLimite || p.datePaiement <= e.dateLimite) g.aTemps += Number(a.montant || 0);
        else g.retard += Number(a.montant || 0);
      }));
      groups.set(key, g);
    });
  });
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, g]) => {
    const impaye = Math.max(g.attendu - g.aTemps - g.retard, 0);
    return { cells: [key.split('|')[1], g.attendu, g.aTemps, pct(g.aTemps, g.attendu), g.retard, pct(g.retard, g.attendu), impaye, pct(impaye, g.attendu)], g };
  });
  const t = rows.reduce((a, r) => ({ attendu: a.attendu + r.g.attendu, aTemps: a.aTemps + r.g.aTemps, retard: a.retard + r.g.retard }), { attendu: 0, aTemps: 0, retard: 0 });
  const impayeTotal = Math.max(t.attendu - t.aTemps - t.retard, 0);
  const statusRows = [...status.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, s]) => ({ cells: [key.split('|')[1], s.soldee, s.partielle, s.impayee, s.retard, s.reste] }));
  const sum = (i) => statusRows.reduce((a, r) => a + r.cells[i], 0);
  return {
    title: 'Statut des tranches et mensualités', subtitle: subtitle(state, f, false),
    kpis: [['Payé dans les délais', pct(t.aTemps, t.attendu)], ['Payé après la date limite', pct(t.retard, t.attendu)], ['Non payé', pct(impayeTotal, t.attendu)]],
    sections: [
      { title: 'Statut par tranche / mensualité', head: ['Tranche', ...['soldee', 'partielle', 'impayee', 'retard'].map((k) => STATUT_ECHEANCE_LABELS[k]), 'Reste dû'], money: [5], rows: statusRows,
        foot: ['TOTAL', sum(1), sum(2), sum(3), sum(4), sum(5)], empty: 'Aucune échéance pour cette sélection.' },
      { title: 'Ponctualité des paiements', head: ['Tranche', 'Attendu', 'Payé avant/à la date limite', '%', 'Payé après la date limite', '%', 'Non payé', '%'],
        money: [1, 2, 4, 6], rows, foot: ['TOTAL', t.attendu, t.aTemps, pct(t.aTemps, t.attendu), t.retard, pct(t.retard, t.attendu), impayeTotal, pct(impayeTotal, t.attendu)], empty: 'Aucune échéance pour cette sélection.' }
    ]
  };
}
