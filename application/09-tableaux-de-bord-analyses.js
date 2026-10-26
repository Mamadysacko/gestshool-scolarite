// GEST SCHOOL SCOLARITÉ · 09-tableaux-de-bord-analyses.js
// Pilotage : tableau de bord, graphiques, évolutions et analyses financières
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/dashboard.js, ./modules/charts.js, ./modules/evolution.js, ./modules/analyse.js, ./modules/analyse-encaissements.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/dashboard.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, todayISO } = require("./utils.js");
    const { COLORS, MONTHS, short, groupedBars, donut, multiLineChart, legendHtml } = require("./charts.js");
    const { evolutionComparee, normaliserPeriode, variation, GRANULARITES_EVOLUTION } = require("./evolution.js");
    const { CATEGORIES } = require("./classes.js");
    const { situationCaisse, depensesFiltrees, paymentYear } = require("./tresorerie.js");
    const { situationReliquat } = require("./reliquats.js");
    const { inscriptionSituation, scopeInscriptions, sumPayments, labelEcheance } = require("./finance.js");
    const { echeanceDu, resteEcheance } = require("./allocation.js");
    const { soldesComptes, TYPES_COMPTE } = require("./comptes.js");
    const { MODES_PAIEMENT } = require("./paiements.js");
    const { attentesOuvertes } = require("./attente.js");
    const { occurrencesDues } = require("./depenses.js");
    const { can, allowedPages } = require("./auth.js");
    // Tableau de bord financier : tous les indicateurs sont calculés à partir des données réelles (aucun chiffre fixe).
    // Deux familles de filtres :
    //  - le PÉRIMÈTRE (année, catégorie, classe, élève) s'applique aux montants attendus, encaissés et restants ;
    //  - les FLUX (période, moyen de paiement, agent d'encaissement) s'appliquent aux encaissements de la période,
    //    aux répartitions par moyen et par agent et à la courbe d'évolution.
    
    const JOURS_ECHEANCES_PROCHES = 15;
    const MODE_COLORS = { espece: '#16a34a', virement: '#2563eb', cheque: '#7c3aed', mobile_money: '#f97316', carte: '#0891b2' };
    
    const ajouterJours = (iso, n) => {
      const d = new Date(`${iso}T00:00:00`);
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    // Mise en route : les étapes de paramétrage dans l'ordre, avec leur état et un accès direct à la bonne page.
    // Le panneau disparaît dès que tout est en place.
    function etapesMiseEnRoute(state) {
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
    function indicateursDashboard(state, filters = {}, today = todayISO()) {
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
    function parAnnee(state, today = todayISO()) {
      return state.annees.map((annee) => {
        const sits = state.inscriptions.filter((i) => i.anneeId === annee.id).map((i) => inscriptionSituation(state, i, today));
        const attendu = sits.reduce((s, x) => s + x.total, 0);
        const encaisse = sits.reduce((s, x) => s + x.paye, 0);
        const caisse = situationCaisse(state, { yearId: annee.id });
        return { annee, attendu, encaisse, reste: Math.max(attendu - encaisse, 0), taux: attendu ? Math.round(encaisse / attendu * 100) : 0, depenses: caisse.depenses, solde: caisse.solde };
      });
    }
    
    const card = (accent, label, value, meta = '') => `<article class="stat-card ${accent}"><div><span>${label}</span><strong>${value}</strong>${meta ? `<small class="meta">${meta}</small>` : ''}</div></article>`;
    
    function renderDashboard(state, filters = {}) {
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
    
    Object.assign(exports, { JOURS_ECHEANCES_PROCHES, etapesMiseEnRoute, indicateursDashboard, parAnnee, renderDashboard });
  };
  factories['./modules/charts.js'] = (require, exports) => {
    const { escapeHtml, formatMoney } = require("./utils.js");
    const COLORS = { encaisse: '#f97316', attendu: '#7c3aed', a_jour: '#16a34a', partiel: '#d97706', retard: '#dc2626', grid: '#e5e7eb', ink: '#6b7280' };
    const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '')} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v)));
    
    function chartFrame(inner, w, h) {
      return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
    }
    
    function yGrid(max, w, top, bottom, left) {
      return [0, 0.5, 1].map((r) => {
        const y = bottom - (bottom - top) * r;
        return `<line x1="${left}" x2="${w - 8}" y1="${y}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/><text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="13" fill="${COLORS.ink}">${short(max * r)}</text>`;
      }).join('');
    }
    
    function lineChart(points, devise) {
      const w = 560; const h = 230; const left = 52; const top = 12; const bottom = 190;
      const max = Math.max(...points.map((p) => p.value), 100);
      const x = (i) => left + (points.length === 1 ? 0 : (w - left - 14) * i / (points.length - 1));
      const y = (v) => bottom - (bottom - top) * v / max;
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
      const area = `${path} L${x(points.length - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z`;
      const step = Math.ceil(points.length / 8);
      return chartFrame(`${yGrid(max, w, top, bottom, left)}
        <path d="${area}" fill="${COLORS.encaisse}" opacity=".12"/>
        <path d="${path}" fill="none" stroke="${COLORS.encaisse}" stroke-width="2" stroke-linejoin="round"/>
        ${points.map((p, i) => `<g><circle cx="${x(i)}" cy="${y(p.value)}" r="${p.value ? 3 : 0}" fill="${COLORS.encaisse}" stroke="#fff" stroke-width="2"/><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="10" fill="transparent"><title>${escapeHtml(p.full)} : ${formatMoney(p.value)} ${escapeHtml(devise)}</title></circle></g>`).join('')}
        ${points.map((p, i) => ((i % step === 0 && (points.length - 1 - i >= step * 0.6 || i === points.length - 1)) || i === points.length - 1 ? `<text x="${x(i)}" y="216" text-anchor="${i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}" font-size="13" fill="${COLORS.ink}">${escapeHtml(p.label)}</text>` : '')).join('')}`, w, h);
    }
    
    function groupedBars(groups, devise, series) {
      const w = 560; const h = 240; const left = 52; const top = 12; const bottom = 196;
      const max = Math.max(...groups.flatMap((g) => series.map((s) => g[s.key])), 100);
      const slot = (w - left - 10) / Math.max(groups.length, 1);
      const bw = Math.min(26, slot / (series.length + 1));
      return chartFrame(`${yGrid(max, w, top, bottom, left)}
        ${groups.map((g, gi) => series.map((s, si) => {
          const bh = Math.max((bottom - top) * g[s.key] / max, g[s.key] ? 2 : 0);
          const bx = left + slot * gi + slot / 2 - (series.length * bw) / 2 + si * bw;
          return `<rect x="${bx.toFixed(1)}" y="${(bottom - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${s.color}"><title>${escapeHtml(g.label)} — ${s.name} : ${formatMoney(g[s.key])} ${escapeHtml(devise)}</title></rect>`;
        }).join('')).join('')}
        ${groups.map((g, gi) => `<text x="${left + slot * gi + slot / 2}" y="222" text-anchor="middle" font-size="13" fill="${COLORS.ink}">${escapeHtml(g.label.length > 11 ? `${g.label.slice(0, 10)}…` : g.label)}</text>`).join('')}`, w, h);
    }
    
    function donut(segments, unit = 'élèves', fmt = (v) => v) {
      const total = segments.reduce((s, x) => s + x.value, 0);
      const r = 52; const c = 2 * Math.PI * r;
      let offset = 0;
      const rings = total ? segments.filter((s) => s.value).map((s) => {
        const len = c * s.value / total;
        const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${escapeHtml(s.label)} : ${s.value} (${Math.round(s.value / total * 100)}%)</title></circle>`;
        offset += len;
        return el;
      }).join('') : `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${COLORS.grid}" stroke-width="22"/>`;
      return `<div class="donut-wrap">${chartFrame(`${rings}<text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="#1f2937">${unit === 'élèves' ? total : short(total)}</text><text x="70" y="84" text-anchor="middle" font-size="13" fill="${COLORS.ink}">${escapeHtml(unit)}</text>`, 140, 140)}
        <ul class="legend">${segments.map((s) => `<li><i style="background:${s.color}"></i>${escapeHtml(s.label)} <b>${escapeHtml(String(fmt(s.value)))}</b></li>`).join('')}</ul></div>`;
    }
    
    function classBars(rows) {
      if (!rows.length) return '<p class="meta">Aucune classe pour cette sélection.</p>';
      return `<div class="hbars">${rows.map((r) => `<div class="hbar" title="${escapeHtml(r.label)} : ${r.rate}% recouvré">
        <span class="hbar-label">${escapeHtml(r.label)}</span>
        <span class="hbar-track"><i style="width:${Math.min(r.rate, 100)}%"></i></span>
        <span class="hbar-val">${r.rate}%</span></div>`).join('')}</div>`;
    }
    
    
    // Courbes à plusieurs séries (ex. période sélectionnée / période précédente, encaissements / dépenses).
    // points : [{ label, full, values: [v1, v2…] }] ; series : [{ name, color, dashed }]
    function multiLineChart(points, series, devise) {
      if (!points.length) return '<p class="meta">Aucune donnée pour cette période.</p>';
      const w = 560; const h = 240; const left = 56; const top = 12; const bottom = 196;
      const max = Math.max(...points.flatMap((p) => p.values), 100);
      const x = (i) => left + (points.length === 1 ? (w - left - 14) / 2 : (w - left - 14) * i / (points.length - 1));
      const y = (v) => bottom - (bottom - top) * v / max;
      const step = Math.ceil(points.length / 8);
      const lines = series.map((s, k) => {
        const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[k] || 0).toFixed(1)}`).join(' ');
        const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.values[k] || 0).toFixed(1)}" r="${points.length > 40 ? 0 : 3}" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(p.full || p.label)} — ${escapeHtml(s.name)} : ${formatMoney(p.values[k] || 0)} ${escapeHtml(devise)}</title></circle>`).join('');
        return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="6 5"' : ''}/>${dots}`;
      }).join('');
      const area = series[0] ? `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[0] || 0).toFixed(1)}`).join(' ')} L${x(points.length - 1).toFixed(1)},${bottom} L${x(0).toFixed(1)},${bottom} Z" fill="${series[0].color}" opacity=".08"/>` : '';
      const labels = points.map((p, i) => ((i % step === 0 && points.length - 1 - i >= step * 0.6) || i === points.length - 1 ? `<text x="${x(i).toFixed(1)}" y="220" text-anchor="${i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}" font-size="12" fill="${COLORS.ink}">${escapeHtml(p.label)}</text>` : '')).join('');
      return chartFrame(`${yGrid(max, w, top, bottom, left)}${area}${lines}${labels}`, w, h);
    }
    
    // Légende courte pour les graphiques à plusieurs séries
    function legendHtml(series) {
      return `<ul class="legend inline">${series.map((s) => `<li><i style="background:${s.color}${s.dashed ? ';opacity:.6' : ''}"></i>${escapeHtml(s.name)}</li>`).join('')}</ul>`;
    }
    
    Object.assign(exports, { COLORS, MONTHS, short, lineChart, groupedBars, donut, classBars, multiLineChart, legendHtml });
  };
  factories['./modules/evolution.js'] = (require, exports) => {
    const { buckets, bucketOf } = require("./rapports-periodiques.js");
    const { todayISO } = require("./utils.js");
    // Séries temporelles des montants (paiements, dépenses…) et comparaison avec la période précédente.
    const GRANULARITES_EVOLUTION = [['jour', 'Par jour'], ['semaine', 'Par semaine'], ['mois', 'Par mois']];
    
    function shiftDays(iso, days) {
      const d = new Date(`${iso}T00:00:00`);
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    
    function joursPeriode(from, to) {
      return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
    }
    
    // Période précédente de même durée, se terminant la veille du début
    function periodePrecedente(from, to) {
      const n = joursPeriode(from, to);
      return { from: shiftDays(from, -n), to: shiftDays(from, -1) };
    }
    
    // Normalise une période : dates valides, début ≤ fin, au plus ~5 ans
    function normaliserPeriode(from, to) {
      const today = todayISO();
      let f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : `${today.slice(0, 4)}-01-01`;
      let t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
      if (f > t) [f, t] = [t, f];
      if (joursPeriode(f, t) > 1830) f = shiftDays(t, -1829);
      return { from: f, to: t };
    }
    
    // Somme des montants par intervalle (tous les intervalles de la période, même vides)
    function serie(items, dateOf, amountOf, from, to, gran) {
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
    function evolutionComparee(items, dateOf, amountOf, from, to, gran) {
      const courante = serie(items, dateOf, amountOf, from, to, gran);
      const prev = periodePrecedente(from, to);
      const precedente = serie(items, dateOf, amountOf, prev.from, prev.to, gran);
      const offset = Math.max(precedente.length - courante.length, 0);
      return {
        courante, precedente: precedente.slice(offset), periodePrecedente: prev,
        total: courante.reduce((s, x) => s + x.value, 0), totalPrecedent: precedente.reduce((s, x) => s + x.value, 0)
      };
    }
    
    function variation(actuel, precedent) {
      if (!precedent) return actuel ? null : 0;
      return Math.round((actuel - precedent) / precedent * 100);
    }
    
    Object.assign(exports, { GRANULARITES_EVOLUTION, joursPeriode, periodePrecedente, normaliserPeriode, serie, evolutionComparee, variation });
  };
  factories['./modules/analyse.js'] = (require, exports) => {
    const { escapeHtml, formatMoney } = require("./utils.js");
    const { inscriptionSituation, scopeInscriptions, sumPayments, studentOf, classOf, yearLabel } = require("./finance.js");
    const { CATEGORIES } = require("./classes.js");
    const { COLORS, MONTHS, lineChart, groupedBars, donut } = require("./charts.js");
    const DIMENSIONS = [
      { id: 'categorie', label: 'Formation' },
      { id: 'classe', label: 'Classe' },
      { id: 'eleve', label: 'Élève' },
      { id: 'annee', label: 'Année scolaire' }
    ];
    
    const PALETTE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];
    
    function defaultAnalyseFilters(state) {
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
    function groupFinance(state, dim, { yearId = 0, category = '', search = '' } = {}) {
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
    
    function renderAnalyseBody(state, f) {
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
          <div class="table-wrap"><table class="data-list" data-list="analyse" data-list-title="Analyse financière détaillée">
            <thead><tr><th>${escapeHtml(DIMENSIONS.find((d) => d.id === f.dim).label)}</th><th>Inscrits</th><th>Attendu</th><th>Encaissé</th><th>Reste</th><th>Taux</th><th>À jour</th><th>Partiels</th><th>En retard</th></tr></thead>
            <tbody>${shown.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.effectif}</td><td class="num">${money(r.attendu)}</td><td class="num">${money(r.encaisse)}</td><td class="num">${money(r.reste)}</td><td><span class="badge ${r.taux >= 75 ? 'ok' : 'warning'}">${r.taux}%</span></td><td>${r.soldes}</td><td>${r.partiels}</td><td>${r.retards}</td></tr>`).join('') || '<tr><td colspan="9">Aucune donnée pour cette sélection.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    function renderAnalyse(state, f) {
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
    
    Object.assign(exports, { DIMENSIONS, defaultAnalyseFilters, groupFinance, renderAnalyseBody, renderAnalyse });
  };
  factories['./modules/analyse-encaissements.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO, downloadExcel } = require("./utils.js");
    const { recettesFiltrees, depensesFiltrees, entreesFiltrees, somme, situationCaisse } = require("./tresorerie.js");
    const { scopeInscriptions, yearLabel } = require("./finance.js");
    const { echeanceDu, paymentAllocations, ordreEcheances, libelleEcheance } = require("./allocation.js");
    const { CATEGORIES } = require("./classes.js");
    const { normaliserPeriode, periodePrecedente, serie, variation, GRANULARITES_EVOLUTION } = require("./evolution.js");
    const { COLORS, groupedBars, donut, multiLineChart, legendHtml } = require("./charts.js");
    const { enteteHtml, enteteLignes } = require("./entete.js");
    const { printDocument } = require("./print.js");
    // Analyse « Paiements & dépenses · Encaissements » : encaissements réellement enregistrés, montants attendus,
    // dépenses définitives et avances sur salaire (créances sur le personnel, distinguées des charges).
    const encFilters = { yearId: 0, from: '', to: '', category: '', classId: 0, gran: 'mois', compare: true };
    
    // Nature comptable d'une dépense : une avance sur salaire est une créance à récupérer, pas une charge définitive
    function natureDepense(d) {
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
    
    function analyseEncaissements(state, filters = encFilters) {
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
    
    function renderAnalyseEncaissementsOutput(state) {
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
    
    function renderAnalyseEncaissements(state) {
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
    
    function setEncFilter(state, key, target) {
      if (key === 'compare') encFilters.compare = target.checked;
      else if (key === 'yearId' || key === 'classId') encFilters[key] = Number(target.value || 0);
      else encFilters[key] = target.value;
      if (key === 'yearId' || key === 'category') { encFilters.classId = 0; renderAnalyseEncaissements(state); return; }
      renderAnalyseEncaissementsOutput(state);
    }
    
    // Exports : mêmes chiffres que l'écran, filtres et période indiqués
    function exportAnalyseEncaissements(state, format) {
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
    
    Object.assign(exports, { encFilters, natureDepense, analyseEncaissements, renderAnalyseEncaissementsOutput, renderAnalyseEncaissements, setEncFilter, exportAnalyseEncaissements });
  };
})(window.IBK_APP.factories);

