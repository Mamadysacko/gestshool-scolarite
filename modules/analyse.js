import { escapeHtml, formatMoney } from './utils.js';
import { inscriptionSituation, scopeInscriptions, sumPayments, studentOf, classOf, yearLabel } from './finance.js';
import { CATEGORIES } from './classes.js';
import { COLORS, MONTHS, lineChart, groupedBars, donut } from './charts.js';

export const DIMENSIONS = [
  { id: 'categorie', label: 'Formation' },
  { id: 'classe', label: 'Classe' },
  { id: 'eleve', label: 'Élève' },
  { id: 'annee', label: 'Année scolaire' }
];

const PALETTE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];

export function defaultAnalyseFilters(state) {
  return { dim: 'categorie', yearId: Number(state.anneeActiveId || 0), category: '', search: '' };
}

function groupLabel(state, dim, inscription) {
  const classe = classOf(state, inscription.classeId);
  if (dim === 'categorie') return classe?.categorie || '—';
  if (dim === 'classe') return classe?.nom || '—';
  if (dim === 'annee') return yearLabel(state, inscription.anneeId);
  const s = studentOf(state, inscription);
  return s ? `${s.matricule} — ${s.prenom} ${s.nom}` : '—';
}

// Agrégation financière par dimension d'analyse (formation, classe, élève, année scolaire)
export function groupFinance(state, dim, { yearId = 0, category = '', search = '' } = {}) {
  const q = String(search || '').trim().toLocaleLowerCase('fr');
  const inscriptions = scopeInscriptions(state, { yearId: dim === 'annee' ? 0 : yearId, category });
  const groups = new Map();
  inscriptions.forEach((inscription) => {
    const label = groupLabel(state, dim, inscription);
    if (q && !label.toLocaleLowerCase('fr').includes(q)) return;
    const g = groups.get(label) || { label, effectif: 0, attendu: 0, encaisse: 0, soldes: 0, partiels: 0, retards: 0, ids: [] };
    const s = inscriptionSituation(state, inscription);
    g.effectif += 1; g.attendu += s.total; g.encaisse += s.paye; g.ids.push(inscription.id);
    if (s.statut === 'a_jour') g.soldes += 1; else if (s.statut === 'retard') g.retards += 1; else g.partiels += 1;
    groups.set(label, g);
  });
  return [...groups.values()].map((g) => ({ ...g, reste: Math.max(g.attendu - g.encaisse, 0), taux: g.attendu ? Math.round(g.encaisse / g.attendu * 100) : 0 }))
    .sort((a, b) => b.encaisse - a.encaisse || a.label.localeCompare(b.label, 'fr'));
}

function monthlyPoints(state, ids) {
  const set = new Set(ids);
  const payments = state.paiements.filter((p) => !p.annule && set.has(p.inscriptionId));
  const now = new Date();
  return Array.from({ length: 12 }, (_, n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - n), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label: MONTHS[d.getMonth()], full: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: sumPayments(payments.filter((p) => String(p.datePaiement).slice(0, 7) === key)) };
  });
}

function shareSegments(rows) {
  const top = rows.filter((r) => r.encaisse > 0).slice(0, 5);
  const others = rows.filter((r) => r.encaisse > 0).slice(5).reduce((s, r) => s + r.encaisse, 0);
  const segments = top.map((r, i) => ({ label: r.label.length > 24 ? `${r.label.slice(0, 23)}…` : r.label, value: r.encaisse, color: PALETTE[i] }));
  if (others) segments.push({ label: 'Autres', value: others, color: PALETTE[5] });
  return segments;
}

export function renderAnalyseBody(state, f) {
  const out = document.getElementById('analyse-output');
  if (!out) return;
  const devise = escapeHtml(state.config.devise);
  const rows = groupFinance(state, f.dim, f);
  const attendu = rows.reduce((s, r) => s + r.attendu, 0);
  const encaisse = rows.reduce((s, r) => s + r.encaisse, 0);
  const ids = rows.flatMap((r) => r.ids);
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const chartRows = rows.slice(0, 10).map((r) => ({ label: r.label, attendu: r.attendu, encaisse: r.encaisse }));
  const shown = [...rows].sort((a, b) => b.reste - a.reste).slice(0, 150);
  out.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Frais attendus</span><strong>${money(attendu)}</strong></div></article>
      <article class="stat-card accent-green"><div><span>Encaissé</span><strong>${money(encaisse)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Reste à percevoir</span><strong>${money(Math.max(attendu - encaisse, 0))}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Taux de recouvrement</span><strong>${attendu ? Math.round(encaisse / attendu * 100) : 0}%</strong></div></article>
    </div>
    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Attendu et encaissé</h3>
        <ul class="legend inline"><li><i style="background:${COLORS.attendu}"></i>Attendu</li><li><i style="background:${COLORS.encaisse}"></i>Encaissé</li></ul></div>
        ${chartRows.length ? groupedBars(chartRows, state.config.devise, [{ key: 'attendu', name: 'Attendu', color: COLORS.attendu }, { key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }]) : '<p class="meta">Aucune donnée.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Répartition des encaissements</h3></div>${donut(shareSegments(rows), 'encaissé', (v) => `${formatMoney(v)} ${state.config.devise}`)}</div>
      <div class="panel"><div class="panel-header"><h3>Évolution des encaissements</h3><span class="meta">12 derniers mois</span></div>${lineChart(monthlyPoints(state, ids), state.config.devise)}</div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Détail par ${escapeHtml(DIMENSIONS.find((d) => d.id === f.dim).label.toLowerCase())}</h3><span class="meta">${rows.length} ligne(s)${rows.length > shown.length ? ` — ${shown.length} affichées` : ''}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>${escapeHtml(DIMENSIONS.find((d) => d.id === f.dim).label)}</th><th>Inscrits</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>Taux</th><th>À jour</th><th>Partiels</th><th>En retard</th></tr></thead>
        <tbody>${shown.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.effectif}</td><td class="num">${money(r.attendu)}</td><td class="num">${money(r.encaisse)}</td><td class="num">${money(r.reste)}</td><td><span class="badge ${r.taux >= 75 ? 'ok' : 'warning'}">${r.taux}%</span></td><td>${r.soldes}</td><td>${r.partiels}</td><td>${r.retards}</td></tr>`).join('') || '<tr><td colspan="9">Aucune donnée pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

export function renderAnalyse(state, f) {
  const section = document.getElementById('analyse');
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Direction et comptabilité</span><h2>Analyse financière</h2></div></div>
    <div class="panel">
      <div class="report-tabs" role="tablist">
        ${DIMENSIONS.map((d) => `<button type="button" role="tab" class="tab-btn ${d.id === f.dim ? 'active' : ''}" data-an-dim="${d.id}">${d.label}</button>`).join('')}
      </div>
      <div class="advanced-search">
        <label>Année scolaire
          <select data-an="yearId" ${f.dim === 'annee' ? 'disabled' : ''}><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
        </label>
        <label>Catégorie
          <select data-an="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </label>
        <label>Recherche <input type="search" data-an="search" placeholder="Filtrer les lignes…" value="${escapeHtml(f.search)}" autocomplete="off" /></label>
      </div>
    </div>
    <div id="analyse-output"></div>`;
  renderAnalyseBody(state, f);
}
