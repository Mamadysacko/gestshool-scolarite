import { escapeHtml, formatMoney, todayISO } from './utils.js';
import { COLORS, MONTHS, short, groupedBars, donut, multiLineChart, legendHtml } from './charts.js';
import { evolutionComparee, normaliserPeriode, variation, GRANULARITES_EVOLUTION } from './evolution.js';
import { CATEGORIES } from './classes.js';
import { situationCaisse, depensesFiltrees, paymentYear } from './tresorerie.js';
import { situationReliquat } from './reliquats.js';
import { inscriptionSituation, scopeInscriptions, sumPayments, labelEcheance } from './finance.js';
import { echeanceDu, resteEcheance } from './allocation.js';
import { soldesComptes, TYPES_COMPTE } from './comptes.js';
import { MODES_PAIEMENT } from './paiements.js';
import { attentesOuvertes } from './attente.js';
import { occurrencesDues } from './depenses.js';
import { can, allowedPages } from './auth.js';

// Tableau de bord financier : tous les indicateurs sont calculés à partir des données réelles (aucun chiffre fixe).
// Deux familles de filtres :
//  - le PÉRIMÈTRE (année, catégorie, classe, élève) s'applique aux montants attendus, encaissés et restants ;
//  - les FLUX (période, moyen de paiement, agent d'encaissement) s'appliquent aux encaissements de la période,
//    aux répartitions par moyen et par agent et à la courbe d'évolution.

export const JOURS_ECHEANCES_PROCHES = 15;
const MODE_COLORS = { espece: '#16a34a', virement: '#2563eb', cheque: '#7c3aed', mobile_money: '#f97316', carte: '#0891b2' };

const ajouterJours = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Mise en route : les étapes de paramétrage dans l'ordre, avec leur état et un accès direct à la bonne page.
// Le panneau disparaît dès que tout est en place.
export function etapesMiseEnRoute(state) {
  const annee = state.annees.find((a) => a.id === state.anneeActiveId);
  const classes = state.classes.filter((c) => c.anneeId === state.anneeActiveId && c.active !== false);
  const sansTarif = classes.filter((c) => !state.tarifs.some((t) => t.classeId === c.id && t.anneeId === state.anneeActiveId));
  const inscrits = state.inscriptions.filter((i) => i.anneeId === state.anneeActiveId);
  const ids = new Set(inscrits.map((i) => i.id));
  return [
    { page: 'config', admin: true, titre: 'Renseigner l’établissement', aide: 'Nom, adresse, téléphone, devise et logo (en-tête des reçus et rapports).', fait: Boolean(String(state.config.nom || '').trim() && String(state.config.devise || '').trim() && String(state.config.telephone || state.config.adresse || '').trim()) },
    { page: 'annees', titre: 'Créer l’année scolaire', aide: 'Dates, frais d’inscription et de réinscription, puis « Définir active ».', fait: Boolean(annee) },
    { page: 'classes', titre: 'Créer les classes', aide: 'Une carte par classe, avec sa catégorie d’enseignement (modifiable dans les paramètres financiers).', fait: classes.length > 0 },
    { page: 'tarifs', titre: 'Fixer les tarifs', aide: sansTarif.length && classes.length ? `${sansTarif.length} classe(s) sans tarif : ${sansTarif.slice(0, 4).map((c) => c.nom).join(', ')}${sansTarif.length > 4 ? '…' : ''}` : 'Montant annuel, tranches, mensualités, frais annexes et remise maximale par classe.', fait: classes.length > 0 && !sansTarif.length },
    { page: 'config-finances', admin: true, titre: 'Configurer les comptes financiers', aide: 'Caisse, banque, Mobile Money et leurs soldes d’ouverture ; catégories de dépenses.', fait: (state.comptes || []).length > 1 || (state.comptes || []).some((c) => Number(c.soldeInitial) > 0), facultatif: true },
    { page: 'eleves', titre: 'Enregistrer et inscrire les élèves', aide: `${inscrits.length} élève(s) inscrit(s) cette année.`, fait: inscrits.length > 0 },
    { page: 'paiements', titre: 'Encaisser un premier paiement', aide: 'Le reçu numéroté s’affiche aussitôt.', fait: state.paiements.some((p) => !p.annule && ids.has(p.inscriptionId)) },
    { page: 'personnel', titre: 'Enregistrer le personnel (paie)', aide: 'Salaire mensuel, ou paiement à l’heure pour les enseignants.', fait: state.personnel.length > 0, facultatif: true }
  ];
}

function miseEnRouteHtml(state, peutEcrire, estAdmin) {
  if (!peutEcrire) return '';
  const etapes = etapesMiseEnRoute(state).filter((e) => !e.admin || estAdmin);
  const faites = etapes.filter((e) => e.fait).length;
  if (etapes.filter((e) => !e.facultatif).every((e) => e.fait)) return '';
  const prochaine = etapes.find((e) => !e.fait && !e.facultatif) || etapes.find((e) => !e.fait);
  return `<section class="panel setup-guide" id="mise-en-route">
    <div class="panel-header"><div><span class="eyebrow">Mise en route</span><h3>Paramétrez votre établissement étape par étape</h3></div>
      <span class="setup-progress"><b>${faites}</b> / ${etapes.length} étape(s)</span></div>
    <div class="setup-bar"><i style="width:${Math.round(faites / etapes.length * 100)}%"></i></div>
    <ol class="setup-steps">${etapes.map((e, i) => `<li class="${e.fait ? 'done' : e === prochaine ? 'next' : ''}">
      <span class="setup-num">${e.fait ? '✓' : i + 1}</span>
      <div><b>${escapeHtml(e.titre)}</b>${e.facultatif ? ' <small class="meta">(facultatif)</small>' : ''}<div class="meta">${escapeHtml(e.aide)}</div></div>
      ${e.fait ? '<span class="badge ok">Fait</span>' : `<button type="button" class="${e === prochaine ? 'primary-btn' : 'secondary-btn'} small-btn" data-nav="${e.page}">${e === prochaine ? 'Commencer' : 'Ouvrir'}</button>`}</li>`).join('')}</ol>
    <p class="meta">Besoin d’aide ? Tapez votre question dans <button type="button" class="link-btn" data-nav="aide">Centre d’aide</button> (ex. « inscrire un élève », « encaisser un chèque »).</p>
  </section>`;
}

// Calculs du tableau de bord (sans rendu) : utilisés par l'écran et par les tests
export function indicateursDashboard(state, filters = {}, today = todayISO()) {
  const yearId = filters.yearId === undefined ? Number(state.anneeActiveId || 0) : Number(filters.yearId || 0);
  const classId = Number(filters.classId || 0);
  const category = filters.category || '';
  const eleveId = Number(filters.eleveId || 0);
  const from = filters.from || '';
  const to = filters.to || '';
  const mode = filters.mode || '';
  const agent = filters.agent || '';

  const inscriptions = scopeInscriptions(state, { yearId, classId, category }).filter((i) => !eleveId || i.eleveId === eleveId);
  const ids = new Set(inscriptions.map((i) => i.id));
  const sits = inscriptions.map((i) => ({ i, s: inscriptionSituation(state, i, today) }));
  const attendu = sits.reduce((a, x) => a + x.s.total, 0);
  const encaisse = sits.reduce((a, x) => a + x.s.paye, 0);
  const reste = Math.max(attendu - encaisse, 0);

  // Prévu à date : ce qui devait être payé aujourd'hui (échéances échues) et ce qui l'a réellement été
  const echeances = inscriptions.flatMap((i) => i.echeances || []);
  const echues = echeances.filter((e) => e.dateLimite && e.dateLimite <= today);
  const prevuADate = echues.reduce((s, e) => s + echeanceDu(e), 0);
  const realiseADate = echues.reduce((s, e) => s + Math.min(Number(e.montantPaye || 0), echeanceDu(e)), 0);
  const limiteProche = ajouterJours(today, JOURS_ECHEANCES_PROCHES);
  const proches = echeances.filter((e) => resteEcheance(e) > 0 && e.dateLimite && e.dateLimite >= today && e.dateLimite <= limiteProche);
  const retards = sits.filter((x) => x.s.retardMontant > 0);
  const reductions = inscriptions.filter((i) => i.reduction);

  // Flux de la période (paiements valides du périmètre, filtrés par période, moyen et agent)
  const paiementsPerimetre = state.paiements.filter((p) => !p.annule && ids.has(p.inscriptionId));
  const flux = paiementsPerimetre.filter((p) => (!from || p.datePaiement >= from) && (!to || p.datePaiement <= to) && (!mode || p.mode === mode) && (!agent || (p.utilisateur || p.caissier) === agent));
  const parMode = Object.keys(MODES_PAIEMENT).map((k) => ({ cle: k, label: MODES_PAIEMENT[k], value: sumPayments(flux.filter((p) => (p.mode || 'espece') === k)), color: MODE_COLORS[k] })).filter((x) => x.value > 0);
  const agents = new Map();
  flux.forEach((p) => { const nom = p.utilisateur || p.caissier || '—'; agents.set(nom, (agents.get(nom) || 0) + Number(p.montant || 0)); });
  const parAgent = [...agents.entries()].map(([label, value]) => ({ label, encaisse: value })).sort((a, b) => b.encaisse - a.encaisse);

  // Caisse et trésorerie : sur l'année choisie (toutes les opérations de l'établissement)
  const yearOfPayment = (p) => paymentYear(state, p);
  const recettesJour = sumPayments(state.paiements.filter((p) => !p.annule && p.datePaiement === today && (!yearId || yearOfPayment(p) === yearId)));
  const depensesJour = depensesFiltrees(state, { yearId, from: today, to: today }).reduce((s, d) => s + Number(d.montant || 0), 0);
  const depensesPeriode = depensesFiltrees(state, { yearId, from, to }).reduce((s, d) => s + Number(d.montant || 0), 0);
  const caisse = situationCaisse(state, { yearId });
  const dettes = (state.reliquats || []).map((r) => situationReliquat(state, r)).filter((r) => r.reste > 0);
  const attentes = attentesOuvertes(state).filter((a) => !yearId || a.anneeId === yearId);

  return {
    yearId, classId, category, eleveId, inscriptions, sits, attendu, encaisse, reste, taux: attendu ? Math.round(encaisse / attendu * 100) : 0,
    prevuADate, realiseADate, tauxRealisation: prevuADate ? Math.round(realiseADate / prevuADate * 100) : 100,
    retardMontant: retards.reduce((s, x) => s + x.s.retardMontant, 0), nbRetards: retards.length,
    prochesMontant: proches.reduce((s, e) => s + resteEcheance(e), 0), nbProches: proches.length,
    facturesImpayees: sits.filter((x) => x.s.reste > 0).length, nbFactures: sits.filter((x) => x.s.total > 0).length,
    reductionsMontant: inscriptions.reduce((s, i) => s + (i.echeances || []).reduce((t, e) => t + Number(e.remise || 0), 0), 0), nbReductions: reductions.length,
    flux, fluxTotal: sumPayments(flux), parMode, parAgent, paiementsPerimetre,
    recettesJour, depensesJour, depensesPeriode, caisse, dettes, attentes, attentesMontant: attentes.reduce((s, a) => s + Number(a.montant || 0), 0)
  };
}

// Une ligne par année scolaire : recouvrement de la scolarité et trésorerie de l'année
export function parAnnee(state, today = todayISO()) {
  return state.annees.map((annee) => {
    const sits = state.inscriptions.filter((i) => i.anneeId === annee.id).map((i) => inscriptionSituation(state, i, today));
    const attendu = sits.reduce((s, x) => s + x.total, 0);
    const encaisse = sits.reduce((s, x) => s + x.paye, 0);
    const caisse = situationCaisse(state, { yearId: annee.id });
    return { annee, attendu, encaisse, reste: Math.max(attendu - encaisse, 0), taux: attendu ? Math.round(encaisse / attendu * 100) : 0, depenses: caisse.depenses, solde: caisse.solde };
  });
}

const card = (accent, label, value, meta = '') => `<article class="stat-card ${accent}"><div><span>${label}</span><strong>${value}</strong>${meta ? `<small class="meta">${meta}</small>` : ''}</div></article>`;

export function renderDashboard(state, filters = {}) {
  const section = document.getElementById('dashboard');
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const today = todayISO();
  const k = indicateursDashboard(state, filters, today);
  const { yearId, classId, category, sits } = k;
  const pages = allowedPages();
  const voitTresorerie = can('admin') || pages.includes('depenses');
  const count = (statut) => sits.filter((x) => x.s.statut === statut).length;
  const vide = !state.inscriptions.length && !state.paiements.length && !state.depenses.length;

  // Évolution des paiements dans le temps : période et granularité choisies, comparaison avec la période précédente
  const periode = normaliserPeriode(filters.evoFrom, filters.evoTo);
  const gran = ['jour', 'semaine', 'mois'].includes(filters.evoGran) ? filters.evoGran : 'mois';
  const compare = filters.evoCompare !== false;
  const evoSource = k.paiementsPerimetre.filter((p) => (!filters.mode || p.mode === filters.mode) && (!filters.agent || (p.utilisateur || p.caissier) === filters.agent));
  const evo = evolutionComparee(evoSource, (p) => p.datePaiement, (p) => p.montant, periode.from, periode.to, gran);
  const evoSeries = [{ name: 'Période sélectionnée', color: COLORS.encaisse }, ...(compare ? [{ name: 'Période précédente', color: COLORS.attendu, dashed: true }] : [])];
  const evoPoints = evo.courante.map((b, i) => ({ label: b.label, full: b.label, values: [b.value, ...(compare ? [evo.precedente[i]?.value || 0] : [])] }));
  const evoVar = variation(evo.total, evo.totalPrecedent);
  const frDate = (iso) => iso.split('-').reverse().join('/');
  const months = Array.from({ length: 12 }, (_, n) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (11 - n), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label: `${MONTHS[d.getMonth()]}`, key, encaisse: sumPayments(evoSource.filter((p) => String(p.datePaiement).slice(0, 7) === key)) };
  });

  const tranches = new Map();
  sits.forEach(({ i }) => (i.echeances || []).forEach((e) => {
    const key = `${String(e.trancheId).padStart(2, '0')}|${labelEcheance(e)}`;
    const g = tranches.get(key) || { label: labelEcheance(e), attendu: 0, encaisse: 0 };
    g.attendu += echeanceDu(e); g.encaisse += Math.min(Number(e.montantPaye || 0), echeanceDu(e));
    tranches.set(key, g);
  }));
  const trancheRows = [...tranches.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);

  const classRows = state.classes.filter((c) => (!yearId || c.anneeId === yearId) && (!classId || c.id === classId) && (!category || c.categorie === category)).map((c) => {
    const list = sits.filter((x) => x.i.classeId === c.id);
    const a = list.reduce((s, x) => s + x.s.total, 0); const p = list.reduce((s, x) => s + x.s.paye, 0);
    return { label: c.nom, categorie: c.categorie, attendu: a, encaisse: p, rate: a ? Math.round(p / a * 100) : 0, effectif: list.length, retard: list.reduce((s, x) => s + x.s.retardMontant, 0) };
  }).filter((r) => !k.eleveId || r.effectif);

  // Répartitions en montants (encaissé / reste), jamais en nombre d'élèves
  const parCategorie = CATEGORIES.map((cat) => {
    const list = sits.filter((x) => state.classes.find((c) => c.id === x.i.classeId)?.categorie === cat);
    const a = list.reduce((t, x) => t + x.s.total, 0);
    const p = list.reduce((t, x) => t + x.s.paye, 0);
    return { label: cat, encaisse: p, reste: Math.max(a - p, 0) };
  }).filter((r) => r.encaisse || r.reste);
  const topClasses = [...classRows].sort((a, b) => b.attendu - a.attendu).slice(0, 10).map((r) => ({ label: r.label, encaisse: r.encaisse, reste: Math.max(r.attendu - r.encaisse, 0) }));
  const duoSeries = [{ key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }, { key: 'reste', name: 'Reste à recouvrer', color: COLORS.attendu }];

  const categories = [...new Set(state.classes.filter((c) => !yearId || c.anneeId === yearId).map((c) => c.categorie))];
  const classes = state.classes.filter((c) => (!yearId || c.anneeId === yearId) && (!category || c.categorie === category));
  const selectedClass = state.classes.find((c) => c.id === classId);
  const selectedEleve = state.eleves.find((e) => e.id === k.eleveId);
  const elevesScope = [...new Set(scopeInscriptions(state, { yearId, classId, category }).map((i) => i.eleveId))].map((id) => state.eleves.find((e) => e.id === id)).filter(Boolean);
  const agentsConnus = [...new Set(state.paiements.map((p) => p.utilisateur || p.caissier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const lateList = sits.filter((x) => x.s.retardMontant > 0).sort((a, b) => b.s.retardMontant - a.s.retardMontant).slice(0, 6);
  const comptes = voitTresorerie ? soldesComptes(state) : [];
  const recurrentes = voitTresorerie ? occurrencesDues(state, today) : [];
  const fluxLabel = filters.from || filters.to ? `du ${filters.from ? frDate(filters.from) : 'début'} au ${filters.to ? frDate(filters.to) : 'aujourd’hui'}` : 'toutes dates';

  section.innerHTML = `
    ${miseEnRouteHtml(state, can('write'), can('admin'))}
    <div class="panel dashboard-filter-panel">
      <div class="dashboard-heading">
        <div><span class="eyebrow">Pilotage financier</span><h2>Situation financière de l’établissement</h2></div>
        <div class="filter-grid dashboard-filters">
          <label>Année scolaire
            <select data-dashboard-filter="year"><option value="0" ${!yearId ? 'selected' : ''}>Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
          </label>
          <label>Catégorie
            <select data-dashboard-filter="category"><option value="">Toutes</option>${categories.map((c) => `<option value="${escapeHtml(c)}" ${c === category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
          </label>
          <label>Classe (tapez pour filtrer)
            <input type="search" data-dashboard-filter="class" list="dash-classes" placeholder="Toutes" value="${escapeHtml(selectedClass?.nom || '')}" autocomplete="off" />
            <datalist id="dash-classes">${classes.map((c) => `<option value="${escapeHtml(c.nom)}"></option>`).join('')}</datalist>
          </label>
          <label>Élève (nom ou matricule)
            <input type="search" data-dashboard-filter="eleve" list="dash-eleves" placeholder="Tous" value="${escapeHtml(selectedEleve ? `${selectedEleve.matricule} — ${selectedEleve.prenom} ${selectedEleve.nom}` : '')}" autocomplete="off" />
            <datalist id="dash-eleves">${elevesScope.slice(0, 400).map((e) => `<option value="${escapeHtml(`${e.matricule} — ${e.prenom} ${e.nom}`)}"></option>`).join('')}</datalist>
          </label>
          <label>Encaissements du <input type="date" data-dashboard-filter="from" value="${escapeHtml(filters.from || '')}" max="${today}" /></label>
          <label>au <input type="date" data-dashboard-filter="to" value="${escapeHtml(filters.to || '')}" max="${today}" /></label>
          <label>Moyen de paiement
            <select data-dashboard-filter="mode"><option value="">Tous</option>${Object.entries(MODES_PAIEMENT).map(([v, l]) => `<option value="${v}" ${v === filters.mode ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </label>
          <label>Agent d’encaissement
            <select data-dashboard-filter="agent"><option value="">Tous</option>${agentsConnus.map((a) => `<option value="${escapeHtml(a)}" ${a === filters.agent ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select>
          </label>
        </div>
      </div>
      ${filters.from || filters.to || filters.mode || filters.agent || k.eleveId ? '<div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="dashboard:reset">Effacer les filtres</button></div>' : ''}
    </div>

    ${vide ? `<div class="panel empty-state"><span class="empty-icon" aria-hidden="true">📊</span><h3>Aucune donnée financière pour le moment</h3>
      <p class="meta">Les indicateurs se rempliront automatiquement dès les premières inscriptions, les premiers paiements et les premières dépenses. Aucun chiffre n’est inventé : tout est calculé à partir de vos enregistrements.</p></div>` : ''}

    <h3 class="dash-section-title">Recouvrement de la scolarité</h3>
    <div class="stats-grid">
      ${card('accent-purple', 'Total attendu', money(k.attendu), k.reductionsMontant ? `net de ${money(k.reductionsMontant)} de réductions` : 'frais d’inscription, annexes et scolarité')}
      ${card('accent-green', 'Total encaissé', money(k.encaisse))}
      ${card('accent-red', 'Reste à recouvrer', money(k.reste))}
      ${card('accent-orange', 'Taux de recouvrement', `${k.taux} %`)}
    </div>
    <div class="stats-grid">
      ${card('accent-red', 'Créances en retard', money(k.retardMontant), `${k.nbRetards} élève(s)`)}
      ${card('accent-gold', `Échéances des ${JOURS_ECHEANCES_PROCHES} prochains jours`, money(k.prochesMontant), `${k.nbProches} échéance(s)`)}
      ${card('accent-blue', 'Factures impayées', `${k.facturesImpayees} / ${k.nbFactures}`, 'inscriptions avec un solde restant')}
      ${card(k.tauxRealisation >= 90 ? 'accent-green' : 'accent-orange', 'Prévu à date / réalisé', `${k.tauxRealisation} %`, `${money(k.realiseADate)} sur ${money(k.prevuADate)} échus`)}
    </div>

    <h3 class="dash-section-title">Caisse et trésorerie</h3>
    <div class="stats-grid">
      ${card('accent-green', 'Recettes de la journée', money(k.recettesJour))}
      ${card('accent-red', 'Dépenses de la journée', money(k.depensesJour))}
      ${card('accent-red', `Total des dépenses${filters.from || filters.to ? ' (période)' : ''}`, money(k.depensesPeriode))}
      ${card(k.caisse.solde < 0 ? 'accent-red' : 'accent-purple', 'Solde de trésorerie', money(k.caisse.solde), 'ouverture + recettes − dépenses de l’année')}
    </div>
    <div class="stats-grid">
      ${card('accent-blue', `Encaissements (${escapeHtml(fluxLabel)})`, money(k.fluxTotal), `${k.flux.length} paiement(s)${filters.mode ? ` · ${escapeHtml(MODES_PAIEMENT[filters.mode])}` : ''}${filters.agent ? ` · ${escapeHtml(filters.agent)}` : ''}`)}
      ${card('accent-gold', 'Règlements en attente', money(k.attentesMontant), `${k.attentes.length} chèque(s) / virement(s) non confirmé(s) — hors totaux`)}
      ${card('accent-orange', 'Dettes antérieures à recouvrer', money(k.dettes.reduce((sum, r) => sum + r.reste, 0)), `${k.dettes.length} élève(s)`)}
      ${card('accent-green', 'Élèves à jour', `${count('a_jour')} / ${sits.length}`, `${count('partiel')} partiellement · ${count('retard')} en retard`)}
    </div>

    ${voitTresorerie ? `<div class="panel">
      <div class="panel-header"><h3>Soldes des comptes financiers</h3><span class="meta">Solde initial + encaissements − dépenses ± virements internes (toutes années)</span></div>
      <div class="table-wrap"><table><thead><tr><th>Compte</th><th>Type</th><th>Solde initial</th><th>Encaissements</th><th>Dépenses</th><th>Virements nets</th><th>Solde</th></tr></thead>
        <tbody>${comptes.map((c) => `<tr><td><b>${escapeHtml(c.compte.libelle)}</b>${c.compte.actif === false ? ' <span class="badge neutral">désactivé</span>' : ''}</td><td>${escapeHtml(TYPES_COMPTE[c.compte.type])}</td><td class="num">${money(c.soldeInitial)}</td><td class="num">${money(c.encaissements + c.autres)}</td><td class="num">${money(c.depenses)}</td><td class="num">${money(c.entrants - c.sortants)}</td><td class="num"><b class="${c.solde < 0 ? 'neg' : ''}">${money(c.solde)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6">Total des comptes</td><td class="num"><b>${money(comptes.reduce((s, c) => s + c.solde, 0))}</b></td></tr></tfoot></table></div>
      ${recurrentes.length ? `<p class="meta">⏰ ${recurrentes.length} dépense(s) récurrente(s) à enregistrer (${money(recurrentes.reduce((s, o) => s + o.recurrente.montant, 0))}) — <button type="button" class="link-btn" data-nav="depenses">Ouvrir les dépenses</button></p>` : ''}
    </div>` : ''}

    <div class="panel evolution-panel">
      <div class="panel-header"><h3>Évolution des encaissements</h3>${legendHtml(evoSeries)}</div>
      <div class="advanced-search compact-filters">
        <label>Du <input type="date" data-dashboard-evo="evoFrom" value="${escapeHtml(periode.from)}" max="${today}" /></label>
        <label>Au <input type="date" data-dashboard-evo="evoTo" value="${escapeHtml(periode.to)}" max="${today}" /></label>
        <label>Regrouper <select data-dashboard-evo="evoGran">${GRANULARITES_EVOLUTION.map(([key, l]) => `<option value="${key}" ${key === gran ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check-row"><input type="checkbox" data-dashboard-evo="evoCompare" ${compare ? 'checked' : ''} /> Comparer à la période précédente</label>
      </div>
      <div class="evolution-figures">
        <span>Encaissé sur la période : <b>${money(evo.total)}</b></span>
        ${compare ? `<span>Période précédente (${frDate(evo.periodePrecedente.from)} → ${frDate(evo.periodePrecedente.to)}) : <b>${money(evo.totalPrecedent)}</b></span>
          <span class="badge ${evoVar === null || evoVar >= 0 ? 'ok' : 'danger'}">${evoVar === null ? 'Nouvelle période' : `${evoVar >= 0 ? '+' : ''}${evoVar} %`}</span>` : ''}
      </div>
      ${multiLineChart(evoPoints, evoSeries, devise)}
    </div>

    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Encaissements par mois</h3><span class="meta">12 derniers mois</span></div>${groupedBars(months.map((m) => ({ label: m.label, encaisse: m.encaisse })), devise, [{ key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }])}</div>
      <div class="panel"><div class="panel-header"><h3>Répartition par moyen de paiement</h3><span class="meta">${escapeHtml(fluxLabel)}</span></div>
        ${k.parMode.length ? donut(k.parMode, devise || 'total', (v) => money(v)) : '<p class="meta">Aucun encaissement pour cette sélection.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Encaissé et reste à recouvrer</h3></div>${donut([
        { label: 'Encaissé', value: k.encaisse, color: COLORS.encaisse },
        { label: 'Reste à recouvrer', value: k.reste, color: COLORS.attendu }], 'attendu', (v) => money(v))}</div>
      <div class="panel"><div class="panel-header"><h3>Encaissements par agent</h3><span class="meta">${escapeHtml(fluxLabel)}</span></div>
        ${k.parAgent.length ? groupedBars(k.parAgent.slice(0, 8), devise, [{ key: 'encaisse', name: 'Encaissé', color: '#2563eb' }]) : '<p class="meta">Aucun encaissement pour cette sélection.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Encaissé et reste par catégorie</h3>${legendHtml(duoSeries)}</div>
        ${parCategorie.length ? groupedBars(parCategorie, devise, duoSeries) : '<p class="meta">Aucune donnée pour cette sélection.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Attendu et encaissé par échéance</h3>${legendHtml([{ name: 'Attendu', color: COLORS.attendu }, { name: 'Encaissé', color: COLORS.encaisse }])}</div>
        ${trancheRows.length ? groupedBars(trancheRows.slice(0, 14), devise, [{ key: 'attendu', name: 'Attendu', color: COLORS.attendu }, { key: 'encaisse', name: 'Encaissé', color: COLORS.encaisse }]) : '<p class="meta">Aucune échéance.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Encaissé et reste par classe</h3><span class="meta">10 classes au plus fort montant attendu</span></div>
        ${topClasses.length ? groupedBars(topClasses, devise, duoSeries) : '<p class="meta">Aucune classe pour cette sélection.</p>'}</div>
      <div class="panel"><div class="panel-header"><h3>Plus gros retards</h3><span class="badge warning">${k.nbRetards} élève(s)</span></div>
        <div class="list-stack">${lateList.map(({ i, s }) => {
          const e = state.eleves.find((x) => x.id === i.eleveId);
          return `<div class="list-item"><div><strong>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')}</strong><div class="meta">${escapeHtml(state.classes.find((c) => c.id === i.classeId)?.nom || '—')} · ${s.enRetard.length} échéance(s)</div></div><span class="badge danger">${money(s.retardMontant)}</span></div>`;
        }).join('') || '<p class="meta">Aucun retard de paiement.</p>'}</div>
        ${lateList.length ? '<p class="meta"><button type="button" class="link-btn" data-nav="creances">Voir toutes les créances</button></p>' : ''}</div>
    </div>

    ${state.annees.length ? `<div class="panel">
      <div class="panel-header"><h3>Résultats par année scolaire</h3><span class="meta">Scolarité attendue et encaissée, dépenses et solde de trésorerie de chaque année</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Année</th><th>Statut</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>Recouvrement</th><th>Dépenses</th><th>Solde de l’année</th></tr></thead>
        <tbody>${parAnnee(state, today).map((r) => `<tr><td>${escapeHtml(r.annee.annee)}</td><td>${escapeHtml({ ouverte: 'Ouverte', cloturee: 'Clôturée', preparation: 'En préparation' }[r.annee.statut] || r.annee.statut || '—')}</td><td class="num">${money(r.attendu)}</td><td class="num">${money(r.encaisse)}</td><td class="num">${money(r.reste)}</td><td><span class="badge ${r.taux >= 75 ? 'ok' : 'warning'}">${r.taux} %</span></td><td class="num">${money(r.depenses)}</td><td class="num"><b class="${r.solde < 0 ? 'neg' : ''}">${money(r.solde)}</b></td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-header"><h3>Résultats par classe</h3><span class="meta">Effectif, attendu, encaissé, retard et recouvrement</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Classe</th><th>Catégorie</th><th>Effectif</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>En retard</th><th>Recouvrement</th></tr></thead>
        <tbody>${classRows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.categorie)}</td><td>${r.effectif}</td><td class="num">${money(r.attendu)}</td><td class="num">${money(r.encaisse)}</td><td class="num">${money(Math.max(r.attendu - r.encaisse, 0))}</td><td class="num">${money(r.retard)}</td><td><span class="badge ${r.rate >= 75 ? 'ok' : 'warning'}">${r.rate} %</span></td></tr>`).join('') || '<tr><td colspan="8">Aucune classe pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
