import { escapeHtml, formatMoney, formatDateFr, todayISO, downloadExcel } from './utils.js';
import { recettesFiltrees, depensesFiltrees, entreesFiltrees, somme, situationCaisse } from './tresorerie.js';
import { scopeInscriptions, yearLabel } from './finance.js';
import { echeanceDu, paymentAllocations, ordreEcheances, libelleEcheance } from './allocation.js';
import { CATEGORIES } from './classes.js';
import { normaliserPeriode, periodePrecedente, serie, variation, GRANULARITES_EVOLUTION } from './evolution.js';
import { COLORS, groupedBars, donut, multiLineChart, legendHtml } from './charts.js';
import { enteteHtml, enteteLignes } from './entete.js';
import { printDocument } from './print.js';

// Analyse « Paiements & dépenses · Encaissements » : encaissements réellement enregistrés, montants attendus,
// dépenses définitives et avances sur salaire (créances sur le personnel, distinguées des charges).
export const encFilters = { yearId: 0, from: '', to: '', category: '', classId: 0, gran: 'mois', compare: true };

// Nature comptable d'une dépense : une avance sur salaire est une créance à récupérer, pas une charge définitive
export function natureDepense(d) {
  if (d.source?.type === 'avance' || d.categorie === 'Avances sur salaire') return 'avance';
  if (d.source?.type === 'paie' || d.categorie === 'Salaires et indemnités') return 'salaire';
  return 'autre';
}

function groupeEcheance(e) {
  if (e.type === 'frais') return { key: '00', label: 'Frais d’inscription / réinscription' };
  if (e.mensualite) return { key: '50', label: 'Mensualités' };
  return { key: String(e.trancheId).padStart(2, '0'), label: libelleEcheance(e) };
}

function totauxPeriode(state, f, from, to) {
  const paiements = recettesFiltrees(state, { yearId: f.yearId, classId: f.classId, category: f.category, from, to });
  const depenses = depensesFiltrees(state, { yearId: f.yearId, from, to });
  const entrees = entreesFiltrees(state, { yearId: f.yearId, from, to });
  const avances = depenses.filter((d) => natureDepense(d) === 'avance');
  const salaires = depenses.filter((d) => natureDepense(d) === 'salaire');
  const definitives = depenses.filter((d) => natureDepense(d) !== 'avance');
  const encaissements = somme(paiements, 'montant');
  const remboursements = somme(entrees, 'montant');
  return {
    paiements, depenses, entrees, nbPaiements: paiements.length,
    encaissements, depensesDefinitives: somme(definitives, 'montant'), salaires: somme(salaires, 'montant'), avances: somme(avances, 'montant'), remboursements,
    // Trésorerie : tout ce qui entre moins tout ce qui sort (avances comprises, l'argent est sorti de la caisse)
    soldeNet: encaissements + remboursements - somme(depenses, 'montant'),
    // Résultat : produits encaissés moins charges définitives (l'avance n'est pas une charge)
    resultat: encaissements - somme(definitives, 'montant')
  };
}

export function analyseEncaissements(state, filters = encFilters) {
  const f = { ...encFilters, ...filters };
  const { from, to } = normaliserPeriode(f.from, f.to);
  const gran = ['jour', 'semaine', 'mois'].includes(f.gran) ? f.gran : 'mois';
  const courant = totauxPeriode(state, f, from, to);
  const prev = periodePrecedente(from, to);
  const precedent = totauxPeriode(state, f, prev.from, prev.to);

  // Attendu (échéances du périmètre) et réellement encaissé
  const inscriptions = scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category });
  const echeances = inscriptions.flatMap((i) => ordreEcheances(i).map((e) => ({ i, e })));
  const duPeriode = echeances.filter(({ e }) => e.dateLimite && e.dateLimite >= from && e.dateLimite <= to);
  const attenduPeriode = duPeriode.reduce((s, { e }) => s + echeanceDu(e), 0);
  const regleSurPeriode = duPeriode.reduce((s, { e }) => s + Math.min(Number(e.montantPaye || 0), echeanceDu(e)), 0);
  const attenduTotal = echeances.reduce((s, { e }) => s + echeanceDu(e), 0);
  const regleTotal = echeances.reduce((s, { e }) => s + Math.min(Number(e.montantPaye || 0), echeanceDu(e)), 0);

  // Encaissements de la période imputés par échéance (pour la répartition par tranche)
  const encaisseParEcheance = new Map();
  courant.paiements.forEach((p) => paymentAllocations(p).forEach((a) => {
    const key = `${p.inscriptionId}:${a.echeanceId}`;
    encaisseParEcheance.set(key, (encaisseParEcheance.get(key) || 0) + Number(a.montant || 0));
  }));
  const tranches = new Map();
  echeances.forEach(({ i, e }) => {
    const g = groupeEcheance(e);
    const row = tranches.get(g.key) || { key: g.key, label: g.label, attendu: 0, encaisse: 0, reste: 0 };
    row.attendu += echeanceDu(e);
    row.encaisse += encaisseParEcheance.get(`${i.id}:${e.id}`) || 0;
    row.reste += Math.max(echeanceDu(e) - Number(e.montantPaye || 0), 0);
    tranches.set(g.key, row);
  });
  const classeDe = (p) => state.classes.find((c) => c.id === state.inscriptions.find((i) => i.id === p.inscriptionId)?.classeId);
  const parCategorie = CATEGORIES.map((cat) => {
    const list = echeances.filter(({ i }) => state.classes.find((c) => c.id === i.classeId)?.categorie === cat);
    return {
      label: cat, encaisse: courant.paiements.filter((p) => classeDe(p)?.categorie === cat).reduce((s, p) => s + Number(p.montant || 0), 0),
      attendu: list.reduce((s, { e }) => s + echeanceDu(e), 0), reste: list.reduce((s, { e }) => s + Math.max(echeanceDu(e) - Number(e.montantPaye || 0), 0), 0)
    };
  }).filter((r) => r.encaisse || r.attendu);

  // Évolution par intervalle et tableau de trésorerie
  const date = (x) => x.datePaiement || x.date;
  const montant = (x) => x.montant;
  const sEnc = serie(courant.paiements, date, montant, from, to, gran);
  const sDep = serie(courant.depenses.filter((d) => natureDepense(d) !== 'avance'), date, montant, from, to, gran);
  const sAv = serie(courant.depenses.filter((d) => natureDepense(d) === 'avance'), date, montant, from, to, gran);
  const sRemb = serie(courant.entrees, date, montant, from, to, gran);
  const sPrev = serie(precedent.paiements, date, montant, prev.from, prev.to, gran);
  const offset = Math.max(sPrev.length - sEnc.length, 0);
  let cumul = 0;
  const periodes = sEnc.map((b, k) => {
    const solde = b.value + sRemb[k].value - sDep[k].value - sAv[k].value;
    cumul += solde;
    return { label: b.label, encaissements: b.value, depenses: sDep[k].value, avances: sAv[k].value, remboursements: sRemb[k].value, solde, cumul, precedent: sPrev[k + offset]?.value || 0 };
  });

  // Soldes de caisse (tout l'établissement) : ouverture au début de la période, clôture à la fin
  const caisse = situationCaisse(state, { yearId: f.yearId, from, to });
  return {
    filtres: { ...f, from, to, gran }, periodePrecedente: prev, courant, precedent, caisse,
    attendu: { periode: attenduPeriode, reglePeriode: regleSurPeriode, ecartPeriode: attenduPeriode - regleSurPeriode, total: attenduTotal, regleTotal, resteTotal: attenduTotal - regleTotal },
    parCategorie, parTranche: [...tranches.values()].sort((a, b) => a.key.localeCompare(b.key)), periodes,
    comparaison: ['encaissements', 'depensesDefinitives', 'avances', 'remboursements', 'soldeNet', 'resultat'].map((k) => ({ cle: k, actuel: courant[k], precedent: precedent[k], variation: variation(courant[k], precedent[k]) }))
  };
}

const LIBELLES = { encaissements: 'Encaissements réels', depensesDefinitives: 'Dépenses définitives', avances: 'Avances sur salaire versées', remboursements: 'Remboursements d’avances', soldeNet: 'Flux net de trésorerie', resultat: 'Résultat (hors avances)' };
const fr = (iso) => formatDateFr(iso);
const pct = (v) => (v === null ? 'nouveau' : `${v >= 0 ? '+' : ''}${v} %`);

function sousTitre(state, a) {
  const f = a.filtres;
  const parts = [`Période : ${fr(f.from)} → ${fr(f.to)}`, `Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`];
  if (f.category) parts.push(`Catégorie : ${f.category}`);
  if (f.classId) parts.push(`Classe : ${state.classes.find((c) => c.id === f.classId)?.nom || '—'}`);
  return parts.join(' · ');
}

// Tableaux de l'analyse (écran, PDF et Excel partagent exactement les mêmes données)
function tables(state, a) {
  return [
    { title: 'Comparaison avec la période précédente', head: ['Indicateur', `Période (${fr(a.filtres.from)} → ${fr(a.filtres.to)})`, `Précédente (${fr(a.periodePrecedente.from)} → ${fr(a.periodePrecedente.to)})`, 'Variation'], money: [1, 2],
      rows: a.comparaison.map((c) => [LIBELLES[c.cle], c.actuel, c.precedent, pct(c.variation)]) },
    { title: 'Évolution de la trésorerie par période', head: ['Période', 'Encaissements', 'Dépenses définitives', 'Avances versées', 'Remboursements', 'Solde net', 'Cumul'], money: [1, 2, 3, 4, 5, 6],
      rows: a.periodes.map((p) => [p.label, p.encaissements, p.depenses, p.avances, p.remboursements, p.solde, p.cumul]),
      foot: ['TOTAL', a.courant.encaissements, a.courant.depensesDefinitives, a.courant.avances, a.courant.remboursements, a.courant.soldeNet, ''] },
    { title: 'Encaissements par catégorie', head: ['Catégorie', 'Encaissé sur la période', 'Montant attendu (année)', 'Reste à percevoir'], money: [1, 2, 3],
      rows: a.parCategorie.map((r) => [r.label, r.encaisse, r.attendu, r.reste]),
      foot: ['TOTAL', a.parCategorie.reduce((s, r) => s + r.encaisse, 0), a.parCategorie.reduce((s, r) => s + r.attendu, 0), a.parCategorie.reduce((s, r) => s + r.reste, 0)] },
    { title: 'Encaissements par tranche', head: ['Tranche / échéance', 'Encaissé sur la période', 'Montant attendu', 'Reste à percevoir'], money: [1, 2, 3],
      rows: a.parTranche.map((r) => [r.label, r.encaisse, r.attendu, r.reste]),
      foot: ['TOTAL', a.parTranche.reduce((s, r) => s + r.encaisse, 0), a.parTranche.reduce((s, r) => s + r.attendu, 0), a.parTranche.reduce((s, r) => s + r.reste, 0)] }
  ];
}

function kpis(a) {
  return [
    ['Encaissements réels', a.courant.encaissements, `${a.courant.nbPaiements} paiement(s) enregistré(s)`],
    ['Dépenses définitives', a.courant.depensesDefinitives, `dont salaires ${formatMoney(a.courant.salaires)}`],
    ['Avances sur salaire (créances)', a.courant.avances, `remboursé en caisse : ${formatMoney(a.courant.remboursements)}`],
    ['Flux net de trésorerie', a.courant.soldeNet, 'entrées − sorties de la période (hors solde d’ouverture)'],
    ['Solde de caisse en fin de période', a.caisse.solde, `ouverture ${formatMoney(a.caisse.ouverture)} + flux net de la période`],
    ['Résultat (hors avances)', a.courant.resultat, 'encaissements − dépenses définitives'],
    ['Écart attendu / encaissé', a.attendu.ecartPeriode, `échéances de la période : ${formatMoney(a.attendu.periode)} attendus`]
  ];
}

function tableHtml(t, devise) {
  const cell = (v, i) => (t.money.includes(i) && typeof v === 'number' ? `<td class="num">${formatMoney(v)}</td>` : `<td>${escapeHtml(v)}</td>`);
  return `<h4 class="ae-table-title">${escapeHtml(t.title)}</h4><div class="table-wrap"><table>
    <thead><tr>${t.head.map((h, i) => `<th class="${t.money.includes(i) ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${t.head.length}">Aucune donnée pour cette sélection.</td></tr>`}</tbody>
    ${t.foot && t.rows.length ? `<tfoot><tr>${t.foot.map(cell).join('')}</tr></tfoot>` : ''}</table></div><p class="meta">Montants en ${escapeHtml(devise)}.</p>`;
}

function chartsHtml(state, a) {
  const devise = state.config.devise;
  const evoSeries = [{ name: 'Encaissements', color: COLORS.encaisse }, { name: 'Dépenses définitives', color: COLORS.retard }, ...(a.filtres.compare ? [{ name: 'Encaissements période précédente', color: COLORS.attendu, dashed: true }] : [])];
  const evoPoints = a.periodes.map((p) => ({ label: p.label, full: p.label, values: [p.encaissements, p.depenses, ...(a.filtres.compare ? [p.precedent] : [])] }));
  const duo = [{ key: 'encaisse', name: 'Encaissé (période)', color: COLORS.encaisse }, { key: 'reste', name: 'Reste à percevoir', color: COLORS.attendu }];
  const depenses = [['Salaires', a.courant.salaires, '#7c3aed'], ['Autres dépenses', a.courant.depensesDefinitives - a.courant.salaires, '#dc2626'], ['Avances sur salaire', a.courant.avances, '#d97706']]
    .filter(([, v]) => v > 0).map(([label, value, color]) => ({ label, value, color }));
  return `<div class="panel"><div class="panel-header"><h3>Évolution des encaissements et des dépenses</h3>${legendHtml(evoSeries)}</div>${multiLineChart(evoPoints, evoSeries, devise)}</div>
    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Par catégorie</h3>${legendHtml(duo)}</div>${a.parCategorie.length ? groupedBars(a.parCategorie, devise, duo) : '<p class="meta">Aucune donnée.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Par tranche</h3>${legendHtml(duo)}</div>${a.parTranche.length ? groupedBars(a.parTranche.map((r) => ({ ...r, label: r.label.replace('Frais d’inscription / réinscription', 'Inscription') })), devise, duo) : '<p class="meta">Aucune échéance.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Sorties de caisse par nature</h3></div>${depenses.length ? donut(depenses, 'sorties', (v) => `${formatMoney(v)} ${devise}`) : '<p class="meta">Aucune sortie de caisse sur la période.</p>'}</div>
    </div>`;
}

export function renderAnalyseEncaissementsOutput(state) {
  const out = document.getElementById('ae-output');
  if (!out) return;
  const a = analyseEncaissements(state);
  const devise = escapeHtml(state.config.devise);
  out.innerHTML = `
    <p class="meta ae-subtitle">${escapeHtml(sousTitre(state, a))}</p>
    <div class="stats-grid ae-kpis">${kpis(a).map(([label, value, note]) => `<article class="stat-card ${value < 0 ? 'accent-red' : 'accent-purple'}"><div><span>${escapeHtml(label)}</span><strong>${formatMoney(value)} ${devise}</strong><small class="meta">${escapeHtml(note)}</small></div></article>`).join('')}</div>
    <div class="panel ae-attendu"><div class="panel-header"><h3>Montants attendus et réellement encaissés</h3></div>
      <div class="ae-attendu-grid">
        <div><span>Échéances arrivant à terme sur la période</span><b>${formatMoney(a.attendu.periode)} ${devise}</b><small>réglées : ${formatMoney(a.attendu.reglePeriode)} · écart : ${formatMoney(a.attendu.ecartPeriode)}</small></div>
        <div><span>Attendu sur l’ensemble du périmètre</span><b>${formatMoney(a.attendu.total)} ${devise}</b><small>réglé : ${formatMoney(a.attendu.regleTotal)} · reste : ${formatMoney(a.attendu.resteTotal)}</small></div>
        <div><span>Encaissé sur la période (réel)</span><b>${formatMoney(a.courant.encaissements)} ${devise}</b><small>paiements validés uniquement, annulés exclus</small></div>
      </div>
      <p class="meta">Un montant « attendu » n’est pas un encaissement : seuls les paiements enregistrés comptent dans la trésorerie.</p></div>
    ${chartsHtml(state, a)}
    <div class="panel">${tables(state, a).map((t) => tableHtml(t, state.config.devise)).join('')}</div>`;
}

export function renderAnalyseEncaissements(state) {
  const section = document.getElementById('encaissements-analyse');
  if (!section) return;
  const f = encFilters;
  if (!f.from) Object.assign(f, normaliserPeriode('', ''));
  const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === f.yearId) && (!f.category || c.categorie === f.category));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Trésorerie</span><h2>Analyse des encaissements</h2></div>
      <div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="ae:pdf">PDF / Imprimer</button><button type="button" class="secondary-btn small-btn" data-action="ae:excel">Excel</button></div></div>
    <div class="panel">
      <div class="advanced-search">
        <label>Année scolaire <select data-ae="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
        <label>Du <input type="date" data-ae="from" value="${escapeHtml(f.from)}" max="${todayISO()}" /></label>
        <label>Au <input type="date" data-ae="to" value="${escapeHtml(f.to)}" max="${todayISO()}" /></label>
        <label>Catégorie <select data-ae="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Classe <select data-ae="classId"><option value="0">Toutes</option>${classes.map((c) => `<option value="${c.id}" ${c.id === f.classId ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></label>
        <label>Regrouper <select data-ae="gran">${GRANULARITES_EVOLUTION.map(([k, l]) => `<option value="${k}" ${k === f.gran ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check-row"><input type="checkbox" data-ae="compare" ${f.compare ? 'checked' : ''} /> Comparer à la période précédente</label>
      </div>
      <p class="meta">La catégorie et la classe filtrent les encaissements et les montants attendus ; les dépenses concernent tout l’établissement.</p>
    </div>
    <div id="ae-output"></div>`;
  renderAnalyseEncaissementsOutput(state);
}

export function setEncFilter(state, key, target) {
  if (key === 'compare') encFilters.compare = target.checked;
  else if (key === 'yearId' || key === 'classId') encFilters[key] = Number(target.value || 0);
  else encFilters[key] = target.value;
  if (key === 'yearId' || key === 'category') { encFilters.classId = 0; renderAnalyseEncaissements(state); return; }
  renderAnalyseEncaissementsOutput(state);
}

// Exports : mêmes chiffres que l'écran, filtres et période indiqués
export function exportAnalyseEncaissements(state, format) {
  const a = analyseEncaissements(state);
  const title = 'Analyse des encaissements et des dépenses';
  const sub = sousTitre(state, a);
  const fileBase = `Analyse-encaissements-${a.filtres.from}-${a.filtres.to}`;
  if (format === 'excel') {
    const tag = (row, kind) => Object.assign(row, { kind });
    const rows = [...enteteLignes(state.config).map((l) => tag(l, 'entete')), [], tag([title], 'title'), [sub], [`Généré le ${formatDateFr(todayISO())}`], []];
    kpis(a).forEach(([label, value, note]) => rows.push(tag([label, value, note], 'kpi')));
    tables(state, a).forEach((t) => {
      rows.push([], tag([t.title], 'section'), tag([...t.head], 'head'), ...t.rows.map((r) => [...r]));
      if (t.foot && t.rows.length) rows.push(tag([...t.foot], 'foot'));
    });
    downloadExcel(`${fileBase}.xls`, title, rows);
    return true;
  }
  const devise = state.config.devise;
  const html = `${enteteHtml(state.config)}
    <div class="r-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span><span>Généré le ${escapeHtml(formatDateFr(todayISO()))}</span></div>
    <div class="r-kpis">${kpis(a).map(([label, value, note]) => `<div>${escapeHtml(label)}<strong>${formatMoney(value)} ${escapeHtml(devise)}</strong><small>${escapeHtml(note)}</small></div>`).join('')}</div>
    <div class="r-group">${chartsHtml(state, a).replace(/<div class="chart-grid">[\s\S]*$/, '')}</div>
    ${tables(state, a).map((t) => `<div class="r-group">${tableHtml(t, devise)}</div>`).join('')}`;
  return printDocument({ title, html, css: '#print-root .r-kpis { flex-wrap: wrap; } #print-root .r-kpis div { min-width: 30%; } #print-root .r-kpis small { display: block; color: #6b7280; font-size: 9px; } #print-root .chart { max-width: 640px; margin: 0 auto; display: block; } #print-root .ae-table-title { margin: 10px 0 4px; color: #1e3a8a; } #print-root .legend { display: flex; gap: 10px; list-style: none; padding: 0; font-size: 10px; } #print-root .legend i { display: inline-block; width: 10px; height: 10px; margin-right: 4px; } #print-root .panel-header h3 { font-size: 13px; margin: 6px 0; }', fileName: fileBase });
}
