import { escapeHtml, formatMoney, todayISO } from './utils.js';
import { COLORS, MONTHS, short, lineChart, groupedBars, donut, classBars } from './charts.js';
import { situationCaisse } from './tresorerie.js';
import { situationReliquat } from './reliquats.js';
import { inscriptionSituation, scopeInscriptions, sumPayments, STATUT_LABELS, labelEcheance } from './finance.js';

export function renderDashboard(state, filters = {}) {
  const section = document.getElementById('dashboard');
  const devise = state.config.devise;
  const yearId = filters.yearId === undefined ? Number(state.anneeActiveId || 0) : Number(filters.yearId || 0);
  const classId = Number(filters.classId || 0);
  const category = filters.category || '';
  const today = todayISO();

  const inscriptions = scopeInscriptions(state, { yearId, classId, category });
  const ids = new Set(inscriptions.map((i) => i.id));
  const payments = state.paiements.filter((p) => !p.annule && ids.has(p.inscriptionId));
  const sits = inscriptions.map((i) => ({ i, s: inscriptionSituation(state, i) }));
  const attendu = sits.reduce((a, x) => a + x.s.total, 0);
  const encaisse = sits.reduce((a, x) => a + x.s.paye, 0);
  const reste = Math.max(attendu - encaisse, 0);
  const taux = attendu ? Math.round(encaisse / attendu * 100) : 0;
  const count = (k) => sits.filter((x) => x.s.statut === k).length;

  const caisse = situationCaisse(state, { yearId });
  const dettes = (state.reliquats || []).map((r) => situationReliquat(state, r)).filter((r) => r.reste > 0);
  const recetteJour = sumPayments(payments.filter((p) => p.datePaiement === today));
  const recetteMois = sumPayments(payments.filter((p) => String(p.datePaiement).slice(0, 7) === today.slice(0, 7)));
  const recetteAnnee = sumPayments(payments.filter((p) => String(p.datePaiement).slice(0, 4) === today.slice(0, 4)));

  const days = Array.from({ length: 30 }, (_, n) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - n));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, full: iso, value: sumPayments(payments.filter((p) => p.datePaiement === iso)) };
  });
  const months = Array.from({ length: 12 }, (_, n) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (11 - n), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label: `${MONTHS[d.getMonth()]}`, key, encaisse: sumPayments(payments.filter((p) => String(p.datePaiement).slice(0, 7) === key)) };
  });

  const tranches = new Map();
  sits.forEach(({ i }) => (i.echeances || []).forEach((e) => {
    const key = `${String(e.trancheId).padStart(2, '0')}|${labelEcheance(e)}`;
    const g = tranches.get(key) || { label: labelEcheance(e), attendu: 0, encaisse: 0 };
    g.attendu += Number(e.montant || 0); g.encaisse += Number(e.montantPaye || 0);
    tranches.set(key, g);
  }));
  const trancheRows = [...tranches.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);

  const classRows = state.classes.filter((c) => (!yearId || c.anneeId === yearId) && (!classId || c.id === classId) && (!category || c.categorie === category)).map((c) => {
    const list = sits.filter((x) => x.i.classeId === c.id);
    const a = list.reduce((s, x) => s + x.s.total, 0); const p = list.reduce((s, x) => s + x.s.paye, 0);
    return { label: c.nom, attendu: a, encaisse: p, rate: a ? Math.round(p / a * 100) : 0, effectif: list.length };
  });

  const categories = [...new Set(state.classes.filter((c) => !yearId || c.anneeId === yearId).map((c) => c.categorie))];
  const classes = state.classes.filter((c) => (!yearId || c.anneeId === yearId) && (!category || c.categorie === category));
  const selectedClass = state.classes.find((c) => c.id === classId);
  const lateList = sits.filter((x) => x.s.statut === 'retard').sort((a, b) => b.s.retardMontant - a.s.retardMontant).slice(0, 6);

  section.innerHTML = `
    <div class="panel dashboard-filter-panel">
      <div class="dashboard-heading">
        <div><span class="eyebrow">Pilotage financier</span><h2>Situation de l'établissement</h2></div>
        <div class="filter-grid" style="grid-template-columns:repeat(3,minmax(130px,1fr))">
          <label>Année scolaire
            <select data-dashboard-filter="year"><option value="0" ${!yearId ? 'selected' : ''}>Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
          </label>
          <label>Niveau
            <select data-dashboard-filter="category"><option value="">Tous</option>${categories.map((c) => `<option value="${escapeHtml(c)}" ${c === category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
          </label>
          <label>Classe (tapez pour filtrer)
            <input type="search" data-dashboard-filter="class" list="dash-classes" placeholder="Toutes" value="${escapeHtml(selectedClass?.nom || '')}" autocomplete="off" />
            <datalist id="dash-classes">${classes.map((c) => `<option value="${escapeHtml(c.nom)}"></option>`).join('')}</datalist>
          </label>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat-card accent-purple"><div class="icon">🎯</div><div><span>Montant attendu</span><strong>${formatMoney(attendu)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card accent-green"><div class="icon">💰</div><div><span>Montant encaissé</span><strong>${formatMoney(encaisse)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card accent-red"><div class="icon">⏳</div><div><span>Reste à percevoir</span><strong>${formatMoney(reste)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card accent-orange"><div class="icon">📈</div><div><span>Taux de recouvrement</span><strong>${taux}%</strong></div></article>
    </div>
    <div class="stats-grid">
      <article class="stat-card accent-green"><div><span>Élèves à jour</span><strong>${count('a_jour')}</strong></div></article>
      <article class="stat-card accent-gold"><div><span>Partiellement payés</span><strong>${count('partiel')}</strong></div></article>
      <article class="stat-card accent-red"><div><span>En retard</span><strong>${count('retard')}</strong></div></article>
      <article class="stat-card accent-blue"><div><span>Recettes : jour · mois · année</span><strong class="small-figures">${short(recetteJour)} · ${short(recetteMois)} · ${short(recetteAnnee)}</strong></div></article>
    </div>

    <div class="stats-grid">
      <article class="stat-card accent-green"><div><span>Recettes encaissées (année)</span><strong>${formatMoney(caisse.recettes)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Dépenses enregistrées</span><strong>${formatMoney(caisse.depenses)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card ${caisse.solde < 0 ? 'accent-red' : 'accent-purple'}"><div><span>Solde disponible (caisse)</span><strong>${formatMoney(caisse.solde)} ${escapeHtml(devise)}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Dettes antérieures à recouvrer</span><strong>${formatMoney(dettes.reduce((sum, r) => sum + r.reste, 0))} ${escapeHtml(devise)}</strong><small class="meta">${dettes.length} élève(s)</small></div></article>
    </div>

    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Recettes journalières</h3><span class="meta">30 derniers jours</span></div>${lineChart(days, devise)}</div>
      <div class="panel"><div class="panel-header"><h3>Recettes mensuelles</h3><span class="meta">12 derniers mois</span></div>${groupedBars(months.map((m) => ({ label: m.label, encaisse: m.encaisse })), devise, [{ key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }])}</div>
      <div class="panel"><div class="panel-header"><h3>Statut des élèves</h3></div>${donut([
        { label: STATUT_LABELS.a_jour, value: count('a_jour'), color: COLORS.a_jour },
        { label: STATUT_LABELS.partiel, value: count('partiel'), color: COLORS.partiel },
        { label: STATUT_LABELS.retard, value: count('retard'), color: COLORS.retard }])}</div>
      <div class="panel"><div class="panel-header"><h3>Performance par tranche</h3>
        <ul class="legend inline"><li><i style="background:${COLORS.attendu}"></i>Attendu</li><li><i style="background:${COLORS.encaisse}"></i>Encaissé</li></ul></div>
        ${trancheRows.length ? groupedBars(trancheRows, devise, [{ key: 'attendu', name: 'Attendu', color: COLORS.attendu }, { key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }]) : '<p class="meta">Aucune échéance.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Recouvrement par classe</h3></div>${classBars(classRows)}</div>
      <div class="panel"><div class="panel-header"><h3>Plus gros retards</h3><span class="badge warning">${count('retard')} élève(s)</span></div>
        <div class="list-stack">${lateList.map(({ i, s }) => {
          const e = state.eleves.find((x) => x.id === i.eleveId);
          return `<div class="list-item"><div><strong>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')}</strong><div class="meta">${escapeHtml(state.classes.find((c) => c.id === i.classeId)?.nom || '—')} · ${s.enRetard.length} échéance(s)</div></div><span class="badge danger">${formatMoney(s.retardMontant)} ${escapeHtml(devise)}</span></div>`;
        }).join('') || '<p class="meta">Aucun retard de paiement.</p>'}</div></div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Indicateurs par classe</h3><span class="meta">Effectif, encaissements et recouvrement</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Classe</th><th>Effectif</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>Recouvrement</th></tr></thead>
        <tbody>${classRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.effectif}</td><td>${formatMoney(r.attendu)} ${escapeHtml(devise)}</td><td>${formatMoney(r.encaisse)} ${escapeHtml(devise)}</td><td>${formatMoney(Math.max(r.attendu - r.encaisse, 0))} ${escapeHtml(devise)}</td><td><span class="badge ${r.rate >= 75 ? 'ok' : 'warning'}">${r.rate}%</span></td></tr>`).join('') || '<tr><td colspan="6">Aucune classe pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
