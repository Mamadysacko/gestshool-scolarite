import { escapeHtml, formatMoney, formatDateFr, todayISO } from './utils.js';
import { can } from './auth.js';
import { CATEGORIES } from './classes.js';
import { CONTRATS, STATUTS_EMPLOYE, MODES_REMUNERATION, nomEmploye, typeOf, isEnseignant, libelleAffectation, estPayeALHeure, affectationsHorairesDuMois, heuresDuMois, heuresVerrouillees, remunerationDefinie } from './personnel.js';
import { STATUTS_PAIE, calculAffiche, syntheseMois, recapAnnuel, anneePourMois } from './paie.js';
import { programmeDeClasse } from './programme.js';
import { STATUTS_AVANCE, MODES_REMBOURSEMENT, soldeAvance, totalPreleve, totalExceptionnel, construireEcheancier } from './avances.js';
import { moisLabel } from './bulletin-paie.js';
import { regleArrondi } from './arrondi.js';
import { groupedBars, donut, COLORS } from './charts.js';

// État d'affichage des pages de paie (mémorisé avec le reste de l'interface)
export const paieView = {
  mois: todayISO().slice(0, 7), search: '', statut: '', detailId: 0,
  personnelSearch: '', personnelType: '', personnelStatut: 'actif',
  affAnnee: 0, affEnseignant: 0, affEmploye: 0, affClasses: [], affMatieres: [], affLignes: [], affSalle: '', remEmploye: 0,
  avanceStatut: 'en_cours', rapType: 'mensuel', rapAnnee: 0, rapEmploye: 0
};

const PALETTE = ['#7c3aed', '#f97316', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af', '#db2777', '#0891b2'];
const BADGE_PAIE = { brouillon: 'neutral', validee: 'warning', payee: 'ok', annulee: 'danger' };
const BADGE_AVANCE = { demandee: 'info', approuvee: 'warning', refusee: 'danger', versee: 'warning', soldee: 'ok', annulee: 'neutral' };
const opt = (value, label, selected) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
const devise = (state) => escapeHtml(state.config.devise);
const money = (state, v) => `${formatMoney(v)} ${devise(state)}`;
const btn = (action, label, cls = '') => `<button type="button" class="action-btn ${cls}" data-action="${action}">${label}</button>`;

// ───────────────────────────── Tableau de bord ─────────────────────────────
export function renderPaieDashboard(state) {
  const section = document.getElementById('paie-dashboard');
  if (!section) return;
  const mois = paieView.mois;
  const actifs = state.personnel.filter((e) => e.statut === 'actif');
  const m = syntheseMois(state, mois);
  const anneeScolaire = anneePourMois(state, mois);
  const annee = anneeScolaire?.annee || mois.slice(0, 4);
  const recap = recapAnnuel(state, anneeScolaire ? anneeScolaire.id : mois.slice(0, 4));
  const avancesEnCours = state.avances.filter((a) => a.statut === 'versee');
  const demandes = state.avances.filter((a) => a.statut === 'demandee' || a.statut === 'approuvee');
  const parType = state.typesEmploye.map((t, i) => ({ label: t.libelle, value: actifs.filter((e) => e.typeEmployeId === t.id).length, color: PALETTE[i % PALETTE.length] })).filter((x) => x.value);
  const sansPaie = actifs.filter((e) => !m.paies.some((x) => x.paie.employeId === e.id));
  const dans30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();
  const cddFin = actifs.filter((e) => e.contrat?.fin && e.contrat.fin <= dans30);
  const enseignantsSansAffectation = actifs.filter((e) => isEnseignant(state, e) && !state.affectations.some((a) => a.employeId === e.id && a.actif));
  const sansRemuneration = actifs.filter((e) => !remunerationDefinie(e));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Tableau de bord de la paie</h2></div>
      <label class="inline-filter">Mois <input type="month" data-pv="mois" value="${escapeHtml(mois)}" max="${todayISO().slice(0, 7)}" /></label></div>
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Effectif actif</span><strong>${actifs.length}</strong><small class="meta">${state.personnel.length} fiche(s) au total</small></div></article>
      <article class="stat-card accent-orange"><div><span>Masse salariale brute — ${escapeHtml(moisLabel(mois))}</span><strong>${money(state, m.brut)}</strong><small class="meta">Net : ${money(state, m.net)}</small></div></article>
      <article class="stat-card accent-green"><div><span>Payé ce mois</span><strong>${money(state, m.paye)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>En attente de paiement</span><strong>${money(state, m.aPayer)}</strong><small class="meta">${m.brouillons} brouillon(s) · ${sansPaie.length} sans paie préparée</small></div></article>
    </div>
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Net de l’année ${escapeHtml(annee)} (validé)</span><strong>${money(state, recap.total.net)}</strong></div></article>
      <article class="stat-card accent-green"><div><span>Payé en ${escapeHtml(annee)}</span><strong>${money(state, recap.total.paye)}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Avances en cours</span><strong>${money(state, avancesEnCours.reduce((s, a) => s + soldeAvance(a), 0))}</strong><small class="meta">${avancesEnCours.length} avance(s) · ${demandes.length} à traiter</small></div></article>
      <article class="stat-card accent-red"><div><span>Retenues + avances du mois</span><strong>${money(state, m.retenues + m.avances)}</strong></div></article>
    </div>
    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Masse salariale ${escapeHtml(annee)}</h3>
        <ul class="legend inline"><li><i style="background:${COLORS.attendu}"></i>Brut</li><li><i style="background:${COLORS.encaisse}"></i>Net payé</li></ul></div>
        ${groupedBars(recap.mois.map((x) => ({ label: `${moisLabel(x.mois).slice(0, 4)}.`, brut: x.brut, paye: x.paye })), state.config.devise, [{ key: 'brut', name: 'Brut', color: COLORS.attendu }, { key: 'paye', name: 'Net payé', color: COLORS.encaisse }])}</div>
      <div class="panel"><div class="panel-header"><h3>Effectif par type d’employé</h3></div>${parType.length ? donut(parType, 'employés') : '<p class="meta">Aucun employé actif.</p>'}</div>
    </div>
    <div class="panel"><div class="panel-header"><h3>Points d’attention</h3></div>
      <ul class="list-stack plain">
        ${sansPaie.length ? `<li class="list-item"><span>${sansPaie.length} employé(s) actif(s) sans paie préparée pour ${escapeHtml(moisLabel(mois))}</span><button class="action-btn" data-nav="paie">Préparer la paie</button></li>` : ''}
        ${demandes.length ? `<li class="list-item"><span>${demandes.length} avance(s) en attente d’approbation ou de versement</span><button class="action-btn" data-nav="avances">Voir les avances</button></li>` : ''}
        ${cddFin.map((e) => `<li class="list-item"><span>Contrat de ${escapeHtml(nomEmploye(e))} se terminant le ${escapeHtml(formatDateFr(e.contrat.fin))}</span><button class="action-btn" data-action="employe:view:${e.id}">Fiche</button></li>`).join('')}
        ${enseignantsSansAffectation.map((e) => `<li class="list-item"><span>Enseignant sans affectation active : ${escapeHtml(nomEmploye(e))}</span><button class="action-btn" data-nav="affectations">Affecter</button></li>`).join('')}
        ${sansRemuneration.map((e) => `<li class="list-item"><span>Rémunération à définir : ${escapeHtml(nomEmploye(e))}</span><button class="action-btn" data-action="remuneration:edit:${e.id}">Définir</button></li>`).join('')}
        ${!sansPaie.length && !demandes.length && !cddFin.length && !enseignantsSansAffectation.length && !sansRemuneration.length ? '<li class="meta">Rien à signaler.</li>' : ''}
      </ul></div>`;
}

// ───────────────────────────── Personnel ─────────────────────────────
function remunerationHtml(state, e) {
  const r = e.remuneration;
  if (!remunerationDefinie(e)) return '<span class="badge warning">À définir</span>';
  return r.mode === 'horaire' ? `${money(state, r.tauxHoraire)} / heure<div class="meta">Payé à l’heure</div>` : `${money(state, r.salaireBase)} / mois`;
}

// Procédure de paie du personnel : rappel des 4 étapes en tête des pages concernées
export function procedurePaieHtml(state, courante) {
  const actifs = state.personnel.filter((e) => e.statut === 'actif');
  const etapes = [
    { n: 1, page: 'personnel', t: 'Fiche employé', d: `${actifs.length} employé(s) actif(s)` },
    { n: 2, page: 'affectations', t: 'Affectation', d: 'enseignants : classes et matières' },
    { n: 3, page: 'remunerations', t: 'Rémunération', d: `${actifs.filter((e) => !remunerationDefinie(e)).length} à définir` },
    { n: 4, page: 'paie', t: 'Paie de chaque mois', d: 'heures, primes, validation, paiement' }
  ];
  return `<ol class="passage-steps paie-steps">${etapes.map((e) => `<li class="${e.n === courante ? 'current' : ''}"><span>${e.n}</span><div><b>${e.n === courante ? e.t : `<button type="button" class="link-btn" data-nav="${e.page}">${e.t}</button>`}</b><small>${e.d}</small></div></li>`).join('')}</ol>`;
}

// ───────────────────────────── Rémunérations ─────────────────────────────
// Définies une fois par employé (puis modifiées si besoin), séparément de la fiche : salaire mensuel ou tarif
// horaire (enseignants), prime fixe. Toute modification est historisée et soumise à l'administrateur.
function remunerationForm(state) {
  const actifs = state.personnel.filter((e) => e.statut === 'actif').sort((a, b) => Number(remunerationDefinie(a)) - Number(remunerationDefinie(b)) || a.nom.localeCompare(b.nom, 'fr'));
  const e = state.personnel.find((x) => x.id === Number(paieView.remEmploye)) || null;
  const r = e?.remuneration || {};
  const mode = r.mode === 'horaire' ? 'horaire' : 'fixe';
  const enseignant = e ? isEnseignant(state, e) : false;
  return `<form class="form-grid compact" data-form="remuneration" autocomplete="off">
    <label class="span-two">Employé <select name="employeId" data-rem-employe required><option value="">— Choisir —</option>${actifs.map((x) => opt(x.id, `${nomEmploye(x)} (${x.matricule}) — ${typeOf(state, x)?.libelle || ''}${remunerationDefinie(x) ? '' : ' · à définir'}`, paieView.remEmploye)).join('')}</select></label>
    ${e ? `<label>Mode de rémunération <select name="mode" data-pe-mode>${opt('fixe', MODES_REMUNERATION.fixe, mode)}${enseignant ? opt('horaire', `${MODES_REMUNERATION.horaire} (enseignant collège / lycée)`, mode) : ''}</select></label>
    <label data-mode-field="fixe" ${mode === 'fixe' ? '' : 'hidden'}>Salaire mensuel <input name="salaireBase" type="number" min="0" step="1" value="${escapeHtml(r.salaireBase || '')}" /></label>
    <label data-mode-field="horaire" ${mode === 'horaire' ? '' : 'hidden'}>Tarif horaire <input name="tauxHoraire" type="number" min="0" step="1" value="${escapeHtml(r.tauxHoraire || '')}" placeholder="Montant payé par heure" /></label>
    <label>Prime fixe mensuelle <input name="primeFixe" type="number" min="0" step="1" value="${escapeHtml(r.primeFixe || 0)}" /></label>
    <label>Libellé de la prime <input name="libellePrime" type="text" value="${escapeHtml(r.libellePrime || '')}" placeholder="Primes et indemnités" /></label>
    ${remunerationDefinie(e) ? '<label class="span-two">Motif du changement <input name="motif" type="text" placeholder="Ex : augmentation annuelle, nouveau contrat…" /></label>' : ''}
    <p class="meta span-all">${enseignant ? 'Payé à l’heure : le salaire de chaque mois = heures dispensées (saisies dans Paie mensuelle) × tarif horaire. ' : ''}La modification nécessite l’autorisation d’un administrateur ; elle est historisée et ne change jamais une paie déjà validée.</p>
    <div class="form-actions span-all"><button type="submit" class="primary-btn">${remunerationDefinie(e) ? 'Enregistrer la modification' : 'Définir la rémunération'}</button><button type="button" class="secondary-btn" data-action="remuneration:clear:0">Annuler</button></div>` : '<p class="meta span-all">Choisissez un employé : sa rémunération actuelle s’affiche pour être définie ou modifiée.</p>'}
  </form>`;
}

export function renderRemunerations(state) {
  const section = document.getElementById('remunerations');
  if (!section) return;
  const actifs = state.personnel.filter((e) => e.statut === 'actif');
  const aDefinir = actifs.filter((e) => !remunerationDefinie(e));
  const fixes = actifs.filter((e) => remunerationDefinie(e) && e.remuneration.mode === 'fixe');
  const horaires = actifs.filter((e) => remunerationDefinie(e) && e.remuneration.mode === 'horaire');
  const masse = fixes.reduce((s, e) => s + Number(e.remuneration.salaireBase || 0) + Number(e.remuneration.primeFixe || 0), 0);
  const derniere = (e) => [...(e.historique || [])].reverse().find((h) => h.type === 'remuneration');
  const list = [...actifs].sort((a, b) => Number(remunerationDefinie(a)) - Number(remunerationDefinie(b)) || a.nom.localeCompare(b.nom, 'fr'));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Rémunérations</h2></div><span class="meta">Étape 3 : conditions de rémunération de chaque employé</span></div>
    ${procedurePaieHtml(state, 3)}
    <div class="stats-grid">
      <article class="stat-card ${aDefinir.length ? 'accent-red' : 'accent-green'}"><div><span>Rémunérations à définir</span><strong>${aDefinir.length}</strong><small class="meta">sur ${actifs.length} employé(s) actif(s)</small></div></article>
      <article class="stat-card accent-purple"><div><span>Salaires mensuels</span><strong>${fixes.length}</strong><small class="meta">${money(state, masse)} par mois (primes fixes comprises)</small></div></article>
      <article class="stat-card accent-orange"><div><span>Enseignants payés à l’heure</span><strong>${horaires.length}</strong><small class="meta">montant variable selon les heures du mois</small></div></article>
    </div>
    ${can('write') ? `<div class="panel section-form" id="remuneration-form"><div class="panel-header"><h3>Définir ou modifier une rémunération</h3><span class="meta">Autorisation de l’administrateur</span></div>${remunerationForm(state)}</div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Rémunérations du personnel actif</h3><span class="meta">Montants de référence utilisés pour préparer la paie de chaque mois</span></div>
      <div class="table-wrap"><table class="data-list" data-list="remunerations" data-list-title="Rémunérations du personnel">
        <thead><tr><th>Matricule</th><th>Employé</th><th>Type · fonction</th><th>Mode</th><th class="num">Montant de référence</th><th class="num">Prime fixe</th><th>Dernière modification</th><th>Actions</th></tr></thead>
        <tbody>${list.map((e) => { const h = derniere(e); const r = e.remuneration; const ok = remunerationDefinie(e); return `<tr>
          <td>${escapeHtml(e.matricule)}</td><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(typeOf(state, e)?.libelle || '—')}<div class="meta">${escapeHtml(e.fonction)}</div></td>
          <td>${ok ? escapeHtml(MODES_REMUNERATION[r.mode]) : '<span class="badge warning">À définir</span>'}</td>
          <td class="num">${ok ? (r.mode === 'horaire' ? `${formatMoney(r.tauxHoraire)} / h` : formatMoney(r.salaireBase)) : '—'}</td><td class="num">${ok && r.primeFixe ? formatMoney(r.primeFixe) : '—'}</td>
          <td>${h ? `${escapeHtml(new Date(h.horodatage).toLocaleDateString('fr-FR'))}<div class="meta">${escapeHtml(h.par || '—')}${h.motif ? ` · ${escapeHtml(h.motif)}` : ''}</div>` : '—'}</td>
          <td>${can('write') ? btn(`remuneration:edit:${e.id}`, ok ? 'Modifier' : 'Définir', ok ? '' : 'primary') : ''}${btn(`employe:view:${e.id}`, 'Historique')}</td></tr>`; }).join('') || '<tr><td colspan="8">Aucun employé actif : enregistrez d’abord les fiches dans « Personnel ».</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// Fiche employé : n'affiche que le champ du mode choisi (salaire mensuel ou tarif horaire)
export function syncModeRemuneration(form) {
  const mode = form?.querySelector('[name="mode"]')?.value || 'fixe';
  form?.querySelectorAll('[data-mode-field]').forEach((el) => { el.hidden = el.dataset.modeField !== mode; });
}

function employeForm(state) {
  const types = state.typesEmploye.filter((t) => t.actif);
  return `<form class="form-grid compact" data-form="employe" autocomplete="off">
    <p class="meta span-all form-section-title">Identité et contacts</p>
    <label>Matricule <input name="matricule" type="text" placeholder="EMP-AAAA-NNNN (automatique)" /></label>
    <label>Prénom <input name="prenom" type="text" required /></label>
    <label>Nom <input name="nom" type="text" required /></label>
    <label>Sexe <select name="sexe"><option value="M">Masculin</option><option value="F">Féminin</option></select></label>
    <label>Date de naissance <input name="dateNaissance" type="date" /></label>
    <label>Téléphone <input name="telephone" type="tel" /></label>
    <label>E-mail <input name="email" type="email" /></label>
    <label>Adresse <input name="adresse" type="text" /></label>
    <label>Photo (300 Ko max.) <input name="photo" type="file" accept="image/*" /></label>
    <p class="meta span-all form-section-title">Poste et contrat</p>
    <label>Type d’employé <select name="typeEmployeId" required>${types.map((t) => opt(t.id, t.libelle, '')).join('')}</select></label>
    <label>Fonction <input name="fonction" type="text" placeholder="Par défaut : le type d’employé" /></label>
    <label>Contrat <select name="contratType">${Object.entries(CONTRATS).map(([k, v]) => opt(k, v, 'cdi')).join('')}</select></label>
    <label>Début du contrat <input name="contratDebut" type="date" /></label>
    <label>Fin du contrat <input name="contratFin" type="date" /></label>
    <label>Date d’embauche <input name="dateEmbauche" type="date" value="${todayISO()}" /></label>
    <label>Statut <select name="statut">${Object.entries(STATUTS_EMPLOYE).map(([k, v]) => opt(k, v, 'actif')).join('')}</select></label>
    <p class="meta span-all">La fiche ne contient que les informations administratives. Étapes suivantes : affectation (enseignants), puis <b>Rémunérations</b> (salaire mensuel ou tarif horaire, fixé par l’administrateur), puis chaque mois <b>Paie mensuelle</b>.</p>
    <div class="form-actions span-all"><button type="submit" class="primary-btn" data-submit-label>Enregistrer l’employé</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
  </form>`;
}

export function renderPersonnel(state) {
  const section = document.getElementById('personnel');
  if (!section) return;
  const q = paieView.personnelSearch.trim().toLocaleLowerCase('fr');
  const list = state.personnel.filter((e) => (!paieView.personnelType || e.typeEmployeId === Number(paieView.personnelType)) && (!paieView.personnelStatut || e.statut === paieView.personnelStatut)
    && (!q || `${e.matricule} ${e.prenom} ${e.nom} ${e.fonction} ${e.telephone}`.toLocaleLowerCase('fr').includes(q)));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Personnel</h2></div><span class="meta">${state.personnel.length} fiche(s)</span></div>
    ${procedurePaieHtml(state, 1)}
    ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Fiche employé</h3><span class="meta">Identité, poste et contrat — la rémunération se définit à l’étape suivante</span></div>${employeForm(state)}</div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Liste du personnel</h3></div>
      <div class="advanced-search">
        <label>Recherche <input type="search" data-pv="personnelSearch" value="${escapeHtml(paieView.personnelSearch)}" placeholder="Nom, matricule, fonction…" /></label>
        <label>Type <select data-pv="personnelType"><option value="">Tous</option>${state.typesEmploye.map((t) => opt(t.id, t.libelle, paieView.personnelType)).join('')}</select></label>
        <label>Statut <select data-pv="personnelStatut"><option value="">Tous</option>${Object.entries(STATUTS_EMPLOYE).map(([k, v]) => opt(k, v, paieView.personnelStatut)).join('')}</select></label>
      </div>
      <div class="table-wrap"><table class="data-list" data-list="personnel" data-list-title="Liste du personnel" data-list-add="#personnel form[data-form=employe]">
        <thead><tr><th></th><th>Matricule</th><th>Employé</th><th>Type · fonction</th><th>Contrat</th><th>Rémunération</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <td>${e.photo ? `<img class="emp-photo" src="${escapeHtml(e.photo)}" alt="" />` : `<span class="emp-photo emp-initiales">${escapeHtml(`${e.prenom[0] || ''}${e.nom[0] || ''}`)}</span>`}</td>
          <td><b>${escapeHtml(e.matricule)}</b></td><td>${escapeHtml(nomEmploye(e))}<div class="meta">${escapeHtml(e.telephone || e.email || '')}</div></td>
          <td>${escapeHtml(typeOf(state, e)?.libelle || '—')}<div class="meta">${escapeHtml(e.fonction)}</div></td>
          <td>${escapeHtml(CONTRATS[e.contrat.type])}<div class="meta">${escapeHtml(formatDateFr(e.contrat.debut))}${e.contrat.fin ? ` → ${escapeHtml(formatDateFr(e.contrat.fin))}` : ''}</div></td>
          <td>${remunerationHtml(state, e)}${e.remuneration.primeFixe ? `<div class="meta">+ ${money(state, e.remuneration.primeFixe)} de primes</div>` : ''}</td>
          <td><span class="badge ${e.statut === 'actif' ? 'ok' : e.statut === 'suspendu' ? 'warning' : 'neutral'}">${STATUTS_EMPLOYE[e.statut]}</span></td>
          <td>${btn(`employe:view:${e.id}`, 'Fiche')}${can('write') ? btn(`employe:edit:${e.id}`, 'Modifier') + btn(`remuneration:edit:${e.id}`, remunerationDefinie(e) ? 'Rémunération' : 'Définir la rémunération', remunerationDefinie(e) ? '' : 'primary') : ''}</td></tr>`).join('') || '<tr><td colspan="8">Aucun employé pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Types d’employés</h3><span class="meta">Personnalisables ; le type « enseignant » ouvre les affectations</span></div>
      <div class="chip-list">${state.typesEmploye.map((t) => `<span class="type-chip ${t.actif ? '' : 'inactive'}">${escapeHtml(t.libelle)}${t.enseignant ? ' <small>enseignant</small>' : ''}${can('write') ? ` <button type="button" class="link-btn" data-action="typeemploye:toggle:${t.id}">${t.actif ? 'désactiver' : 'réactiver'}</button>` : ''}</span>`).join('')}</div>
      ${can('write') ? `<form class="form-grid compact" data-form="type-employe" autocomplete="off">
        <label>Nouveau type <input name="libelle" type="text" required placeholder="Ex : Chauffeur, Cuisinier…" /></label>
        <label class="check-row"><input type="checkbox" name="enseignant" /> Fonction d’enseignement</label>
        <div class="form-actions"><button type="submit" class="secondary-btn">Ajouter le type</button></div></form>` : ''}
    </div>`;
}

// Fiche détaillée : identité, historique (contrats, salaires, fonctions), affectations, paies, avances
export function showEmployeDetail(state, id) {
  const e = state.personnel.find((x) => x.id === Number(id));
  const root = document.getElementById('modal-root');
  if (!e || !root) return false;
  const paies = state.paies.filter((p) => p.employeId === e.id).sort((a, b) => b.mois.localeCompare(a.mois) || b.id - a.id);
  const affs = state.affectations.filter((a) => a.employeId === e.id);
  const avances = state.avances.filter((a) => a.employeId === e.id);
  const heures = (state.heuresRealisees || []).filter((h) => h.employeId === e.id && Array.isArray(h.lignes)).sort((a, b) => b.mois.localeCompare(a.mois));
  const fmtHist = (h) => (h.type === 'creation' ? h.detail : `${{ remuneration: 'Rémunération', fonction: 'Fonction', contrat: 'Contrat', type: 'Type', statut: 'Statut' }[h.type] || h.type} : ${h.avant} → ${h.apres}`);
  root.innerHTML = `<div class="modal-backdrop" data-modal-close><section class="student-modal" role="dialog" aria-modal="true">
    <header class="modal-header"><div class="emp-head">${e.photo ? `<img class="emp-photo large" src="${escapeHtml(e.photo)}" alt="" />` : ''}<div><span class="eyebrow">${escapeHtml(e.matricule)}</span><h2>${escapeHtml(nomEmploye(e))}</h2>
      <span class="meta">${escapeHtml(e.fonction)} · ${escapeHtml(CONTRATS[e.contrat.type])} · ${STATUTS_EMPLOYE[e.statut]}</span></div></div>
      <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
    <div class="profile-section"><div class="profile-grid">
      <div class="profile-metric"><span>${e.remuneration.mode === 'horaire' ? 'Tarif horaire' : 'Salaire mensuel'}</span><strong>${e.remuneration.mode === 'horaire' ? (e.remuneration.tauxHoraire ? `${money(state, e.remuneration.tauxHoraire)} / h` : 'À définir') : (e.remuneration.salaireBase ? money(state, e.remuneration.salaireBase) : 'À définir')}</strong></div>
      <div class="profile-metric"><span>Primes fixes</span><strong>${money(state, e.remuneration.primeFixe)}</strong></div>
      <div class="profile-metric"><span>Solde des avances</span><strong>${money(state, avances.filter((a) => a.statut === 'versee').reduce((s, a) => s + soldeAvance(a), 0))}</strong></div></div></div>
    <div class="profile-section"><h3>Historique (contrats, salaires, fonctions)</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Modification</th><th>Par</th></tr></thead>
      <tbody>${[...e.historique].reverse().map((h) => `<tr><td>${escapeHtml(new Date(h.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(fmtHist(h))}</td><td>${escapeHtml(h.par || '—')}</td></tr>`).join('')}</tbody></table></div></div>
    ${heures.length ? `<div class="profile-section"><h3>Heures dispensées par mois</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th>Détail</th><th class="num">Heures</th><th class="num">Tarif</th><th>Saisies</th></tr></thead>
      <tbody>${heures.map((h) => `<tr><td>${escapeHtml(moisLabel(h.mois))}</td><td>${escapeHtml(h.lignes.map((l) => `${l.libelle} : ${l.heures} h`).join(' ; ') || '—')}</td><td class="num">${h.totalHeures}</td><td class="num">${formatMoney(h.tauxHoraire)}</td>
        <td>${h.historique.map((x) => `<div class="meta">${escapeHtml(new Date(x.horodatage).toLocaleString('fr-FR'))} · ${escapeHtml(x.par || '—')} : ${escapeHtml(x.avant ? `${x.avant} → ${x.apres}` : x.apres)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${affs.length ? `<div class="profile-section"><h3>Affectations (toutes années)</h3><div class="table-wrap"><table><thead><tr><th>Année</th><th>Affectation</th><th>État</th></tr></thead>
      <tbody>${affs.map((a) => `<tr><td>${escapeHtml(state.annees.find((y) => y.id === a.anneeId)?.annee || '—')}</td><td>${escapeHtml(libelleAffectation(state, a))}</td><td>${a.actif ? 'Active' : `Clôturée le ${escapeHtml(formatDateFr(a.dateFin))}`}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="profile-section"><h3>Paies</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th>N°</th><th>Brut</th><th>Net</th><th>Statut</th><th></th></tr></thead>
      <tbody>${paies.map((p) => { const c = calculAffiche(state, p); return `<tr><td>${escapeHtml(moisLabel(p.mois))}</td><td>${escapeHtml(p.numero || '—')}</td><td>${money(state, c?.brut)}</td><td>${money(state, c?.net)}</td><td><span class="badge ${BADGE_PAIE[p.statut]}">${STATUTS_PAIE[p.statut]}</span></td><td>${p.statut === 'validee' || p.statut === 'payee' ? btn(`paie:bulletin:${p.id}`, 'Bulletin') : ''}</td></tr>`; }).join('') || '<tr><td colspan="6">Aucune paie.</td></tr>'}</tbody></table></div></div>
  </section></div>`;
  return true;
}

// ───────────────────────────── Affectations ─────────────────────────────
// Enseignant et année choisis une fois ; primaire : titulaire d'une classe ; collège / lycée : on coche des classes,
// les matières proposées sont celles de leur programme, puis les lignes (classe × matière) sont vérifiées et
// ajustées (salle, retrait) avant d'être enregistrées toutes ensemble.
const lignesAffectation = () => (Array.isArray(paieView.affLignes) ? paieView.affLignes : []);

// Conflits d'une ligne avec les affectations actives de l'année
export function etatLigneAffectation(state, anneeId, employeId, ligne) {
  const actives = state.affectations.filter((a) => a.actif && a.anneeId === anneeId && a.classeId === Number(ligne.classeId) && Number(a.matiereId || 0) === Number(ligne.matiereId || 0));
  if (actives.some((a) => a.employeId === employeId)) return { ok: false, texte: 'Déjà enregistrée pour cet enseignant' };
  const autre = actives.find((a) => a.employeId !== employeId);
  if (autre) return { ok: false, texte: `Déjà assurée par ${nomEmploye(state.personnel.find((e) => e.id === autre.employeId))}` };
  return { ok: true, texte: 'À enregistrer' };
}

export function affectationFormHtml(state) {
  const anneeId = Number(paieView.affAnnee || state.anneeActiveId);
  const enseignants = state.personnel.filter((e) => e.statut === 'actif' && isEnseignant(state, e));
  const choisi = enseignants.find((e) => e.id === Number(paieView.affEmploye)) || null;
  const classesAnnee = state.classes.filter((c) => c.anneeId === anneeId && c.active !== false);
  const primaires = classesAnnee.filter((c) => c.categorie === 'Primaire');
  const secondaires = classesAnnee.filter((c) => c.categorie !== 'Primaire');
  const cochees = (paieView.affClasses || []).map(Number).filter((id) => secondaires.some((c) => c.id === id));
  const proposees = new Map();
  cochees.forEach((cid) => programmeDeClasse(state, cid).forEach((p) => {
    const g = proposees.get(p.matiereId) || { matiere: p.matiere, classes: [] };
    g.classes.push(state.classes.find((c) => c.id === cid)?.nom);
    proposees.set(p.matiereId, g);
  }));
  const sansProgramme = cochees.filter((cid) => !programmeDeClasse(state, cid).length).map((cid) => state.classes.find((c) => c.id === cid)?.nom);
  const matieresCochees = (paieView.affMatieres || []).map(Number);
  const lignes = lignesAffectation();
  const salles = [...new Set(state.affectations.map((a) => a.salle).filter(Boolean))];
  const titulaire = primaires.map((c) => ({ c, t: state.affectations.find((a) => a.actif && a.anneeId === anneeId && a.classeId === c.id && !a.matiereId) }));
  const aEnregistrer = lignes.filter((l) => etatLigneAffectation(state, anneeId, Number(paieView.affEmploye), l).ok).length;
  return `${choisi ? `<div class="prefill-banner" role="status"><div><b>${escapeHtml(nomEmploye(choisi))}</b> · ${escapeHtml(choisi.matricule)} · ${escapeHtml(choisi.fonction)}${choisi.remuneration.mode === 'horaire' ? ` · payé à l’heure (${formatMoney(choisi.remuneration.tauxHoraire)} ${devise(state)} / h)` : choisi.remuneration.salaireBase ? ` · ${formatMoney(choisi.remuneration.salaireBase)} ${devise(state)} / mois` : ''}</div>
      <span class="meta">Enseignant présélectionné : choisissez sa classe (primaire) ou cochez ses classes et matières (collège / lycée), puis enregistrez toutes les lignes en une fois.</span>
      <span><button type="button" class="link-btn" data-action="affectation:clear:0">Choisir un autre enseignant</button>${state.affectations.some((a) => a.employeId === choisi.id && a.actif) ? ` · <button type="button" class="secondary-btn small-btn" data-action="remuneration:edit:${choisi.id}">Étape suivante : ${remunerationDefinie(choisi) ? 'vérifier' : 'définir'} sa rémunération →</button>` : ''}</span></div>` : ''}
    <div class="aff-builder">
      <div class="form-grid compact">
        <label>Année scolaire <select data-af="affAnnee">${state.annees.map((a) => opt(a.id, a.annee, anneeId)).join('')}</select></label>
        <label>Enseignant <select data-af="affEmploye"><option value="">— Choisir —</option>${enseignants.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, paieView.affEmploye)).join('')}</select></label>
      </div>
      <fieldset class="aff-block"><legend>Primaire — titulaire d’une classe</legend>
        ${primaires.length ? `<div class="form-grid compact">
          <label>Classe <select data-af-primaire><option value="">— Choisir —</option>${titulaire.map(({ c, t }) => opt(c.id, `${c.nom}${t ? ` — titulaire : ${nomEmploye(state.personnel.find((e) => e.id === t.employeId))}` : ''}`, '')).join('')}</select></label>
          <div class="form-actions"><button type="button" class="secondary-btn" data-action="affectation:titulaire">Affecter comme titulaire</button></div></div>
          <p class="meta">Au primaire, un enseignant est titulaire d’une seule classe et chaque classe n’a qu’un titulaire.</p>` : '<p class="meta">Aucune classe de primaire pour cette année.</p>'}
      </fieldset>
      <fieldset class="aff-block"><legend>Collège / Lycée — plusieurs classes, matières et niveaux</legend>
        <p class="aff-step">1. Classes</p>
        <div class="check-grid">${secondaires.map((c) => `<label class="check-chip ${cochees.includes(c.id) ? 'on' : ''}"><input type="checkbox" data-af-classe value="${c.id}" ${cochees.includes(c.id) ? 'checked' : ''} /> ${escapeHtml(c.nom)} <small>${escapeHtml(c.categorie)} · ${programmeDeClasse(state, c.id).length} matière(s)</small></label>`).join('') || '<span class="meta">Aucune classe de collège ou de lycée pour cette année.</span>'}</div>
        ${sansProgramme.length ? `<p class="form-warning">Aucune matière au programme de ${escapeHtml(sansProgramme.join(', '))} : définissez d’abord le programme (Scolarité › Classes › Programme).</p>` : ''}
        <p class="aff-step">2. Matières enseignées <span class="meta">(uniquement celles au programme des classes cochées)</span></p>
        <div class="check-grid">${[...proposees.entries()].sort((a, b) => a[1].matiere.nom.localeCompare(b[1].matiere.nom, 'fr')).map(([id, g]) => `<label class="check-chip ${matieresCochees.includes(id) ? 'on' : ''}"><input type="checkbox" data-af-matiere value="${id}" ${matieresCochees.includes(id) ? 'checked' : ''} /> ${escapeHtml(g.matiere.nom)} <small>${escapeHtml(g.classes.join(', '))}</small></label>`).join('') || '<span class="meta">Cochez une ou plusieurs classes.</span>'}</div>
        <div class="form-grid compact">
          <label>Salle (facultatif) <input data-af="affSalle" type="text" list="aff-salles" value="${escapeHtml(paieView.affSalle || '')}" placeholder="Ex : B12, Labo…" /><datalist id="aff-salles">${salles.map((x) => `<option value="${escapeHtml(x)}"></option>`).join('')}</datalist></label>
          <div class="form-actions"><button type="button" class="secondary-btn" data-action="affectation:ajouter-lignes" ${cochees.length && matieresCochees.length ? '' : 'disabled'}>3. Ajouter les lignes classe × matière</button></div>
        </div>
      </fieldset>
      <div class="aff-lignes">
        <div class="panel-header"><h3>Lignes à enregistrer</h3><span class="meta">${lignes.length} ligne(s) · ${aEnregistrer} valide(s)</span></div>
        <div class="table-wrap"><table><thead><tr><th>Classe</th><th>Niveau</th><th>Matière</th><th>Salle</th><th>Contrôle</th><th></th></tr></thead>
          <tbody>${lignes.map((l, i) => {
            const c = state.classes.find((x) => x.id === Number(l.classeId));
            const etat = etatLigneAffectation(state, anneeId, Number(paieView.affEmploye), l);
            return `<tr><td>${escapeHtml(c?.nom || '—')}</td><td>${escapeHtml(c?.categorie || '—')}</td><td>${escapeHtml(state.matieres.find((m) => m.id === Number(l.matiereId))?.nom || '—')}</td>
              <td><input class="cell-input" type="text" data-af-ligne-salle="${i}" value="${escapeHtml(l.salle || '')}" list="aff-salles" aria-label="Salle" /></td>
              <td><span class="badge ${etat.ok ? 'ok' : 'warning'}">${escapeHtml(etat.texte)}</span></td>
              <td><button type="button" class="action-btn delete" data-action="affectation:retirer-ligne:${i}">Retirer</button></td></tr>`;
          }).join('') || '<tr><td colspan="6">Aucune ligne : cochez des classes et des matières puis « Ajouter les lignes ».</td></tr>'}</tbody></table></div>
        <div class="form-actions"><button type="button" class="primary-btn" data-action="affectation:enregistrer" ${choisi && aEnregistrer ? '' : 'disabled'}>Enregistrer ${aEnregistrer || ''} affectation(s)</button>
          ${lignes.length ? '<button type="button" class="secondary-btn" data-action="affectation:vider">Vider la liste</button>' : ''}</div>
      </div>
    </div>`;
}

export function renderAffectations(state) {
  const section = document.getElementById('affectations');
  if (!section) return;
  if (!paieView.affAnnee) paieView.affAnnee = state.anneeActiveId;
  const list = state.affectations.filter((a) => a.anneeId === Number(paieView.affAnnee) && (!paieView.affEnseignant || a.employeId === Number(paieView.affEnseignant)));
  const enseignants = state.personnel.filter((e) => isEnseignant(state, e));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Affectations des enseignants</h2></div></div>
    ${procedurePaieHtml(state, 2)}
    ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Nouvelles affectations</h3><span class="meta">Plusieurs classes, matières et niveaux en une seule validation</span></div><div data-aff-form>${affectationFormHtml(state)}</div></div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Affectations de l’année ${escapeHtml(state.annees.find((a) => a.id === Number(paieView.affAnnee))?.annee || '')}</h3><span class="meta">${list.length} affectation(s) · historique conservé par année</span></div>
      <div class="advanced-search"><label>Enseignant <select data-pv="affEnseignant"><option value="">Tous</option>${enseignants.map((e) => opt(e.id, nomEmploye(e), paieView.affEnseignant)).join('')}</select></label></div>
      <div class="table-wrap"><table class="data-list" data-list="affectations" data-list-title="Affectations des enseignants" data-list-add="#affectations .aff-builder">
        <thead><tr><th>Enseignant</th><th>Niveau</th><th>Classe · matière · salle</th><th>Coefficient</th><th>État</th><th>Actions</th></tr></thead>
        <tbody>${list.map((a) => {
          const e = state.personnel.find((x) => x.id === a.employeId);
          const coef = a.matiereId ? programmeDeClasse(state, a.classeId).find((p) => p.matiereId === a.matiereId)?.coefficient : '';
          return `<tr><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(state.classes.find((c) => c.id === a.classeId)?.categorie || '—')}</td><td>${escapeHtml(libelleAffectation(state, a))}</td>
            <td>${coef || '—'}</td><td><span class="badge ${a.actif ? 'ok' : 'neutral'}">${a.actif ? 'Active' : `Clôturée${a.dateFin ? ` le ${escapeHtml(formatDateFr(a.dateFin))}` : ''}`}</span></td>
            <td>${a.actif && can('write') ? btn(`affectation:close:${a.id}`, 'Clôturer', 'delete') : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="6">Aucune affectation pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>
    <p class="meta">Les matières et le programme de chaque classe se gèrent dans <button type="button" class="link-btn" data-nav="classes">Scolarité › Classes</button>.</p>`;
}

// ───────────────────────────── Paie mensuelle ─────────────────────────────
function variablesRows(list, kind) {
  const rows = [...list, { libelle: '', montant: '' }];
  return rows.map((l) => `<div class="var-row"><input name="${kind}Libelle" type="text" value="${escapeHtml(l.libelle)}" placeholder="Libellé" /><input name="${kind}Montant" type="number" min="0" step="1" value="${escapeHtml(l.montant)}" placeholder="Montant" /></div>`).join('');
}

function paieDetailHtml(state, paie) {
  const c = calculAffiche(state, paie);
  const brouillon = paie.statut === 'brouillon';
  const employe = state.personnel.find((e) => e.id === paie.employeId);
  // Enseignant payé à l'heure : une ligne par affectation (heures du mois × tarif horaire)
  const horaire = c.lignes.some((l) => l.type === 'heures') || c.mode === 'horaire';
  const cols = horaire ? '<td></td><td></td>' : '';
  const saisie = c.mode === 'horaire' ? heuresDuMois(state, paie.employeId, paie.mois) : null;
  return `<div class="panel paie-detail" id="paie-detail">
    <div class="panel-header"><h3>${escapeHtml(nomEmploye(c.employe))} — ${escapeHtml(moisLabel(paie.mois))}</h3>
      <span class="badge ${BADGE_PAIE[paie.statut]}">${STATUTS_PAIE[paie.statut]}${paie.numero ? ` · ${escapeHtml(paie.numero)}` : ''}</span></div>
    ${c.alertes.length ? `<div class="form-warning">${c.alertes.map(escapeHtml).join('<br>')}</div>` : ''}
    ${!brouillon ? '<p class="meta">Montants figés à la validation : une modification ultérieure du salaire ou des affectations ne change pas cette paie.</p>' : ''}
    <div class="table-wrap"><table>
      <thead><tr><th>Élément</th>${horaire ? '<th class="num">Heures dispensées</th><th class="num">Tarif horaire</th>' : ''}<th class="num">Montant</th></tr></thead>
      <tbody>${c.lignes.map((l) => (l.type === 'heures'
        ? `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${l.heures}</td><td class="num">${formatMoney(l.taux)}</td><td class="num">${formatMoney(l.montant)}</td></tr>`
        : `<tr><td>${escapeHtml(l.libelle)}</td>${cols}<td class="num">${formatMoney(l.montant)}</td></tr>`)).join('')}
        ${horaire && !c.lignes.length ? `<tr><td colspan="4" class="meta">Aucune heure saisie pour ce mois.</td></tr>` : ''}
        ${c.primes.map((l) => `<tr><td>+ ${escapeHtml(l.libelle)}${l.fixe ? ' <small class="meta">(fiche employé)</small>' : ''}</td>${cols}<td class="num">${formatMoney(l.montant)}</td></tr>`).join('')}
        ${c.retenues.map((l) => `<tr><td>− ${escapeHtml(l.libelle)}${l.fixe ? ' <small class="meta">(ancienne retenue fixe)</small>' : ''}</td>${cols}<td class="num">−${formatMoney(l.montant)}</td></tr>`).join('')}
        ${c.avances.map((a) => `<tr><td>− Remboursement d’avance n°${a.avanceId}${a.reporte ? ` <small class="meta">(dû ${formatMoney(a.du)}, ${formatMoney(a.reporte)} reporté)</small>` : ''}</td>${cols}<td class="num">−${formatMoney(a.montant)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td${horaire ? ' colspan="3"' : ''}>${horaire && c.totalHeures ? `${c.totalHeures} h · ` : ''}Brut ${money(state, c.brut)} · Retenues ${money(state, c.totalRetenues)} · Avances ${money(state, c.totalAvances)} — <b>Net à payer</b></td><td class="num">${money(state, c.net)}</td></tr></tfoot>
    </table></div>
    ${saisie ? `<details class="heures-trace"><summary>Historique des heures de ${escapeHtml(moisLabel(paie.mois))} (${saisie.historique.length} saisie(s))</summary>
      <ul class="list-stack plain">${[...saisie.historique].reverse().map((x) => `<li class="meta">${escapeHtml(new Date(x.horodatage).toLocaleString('fr-FR'))} · ${escapeHtml(x.par || '—')} — ${escapeHtml(x.avant ? `${x.avant} → ${x.apres}` : `saisie : ${x.apres}`)}</li>`).join('')}</ul></details>` : ''}
    ${brouillon && can('write') ? `<form class="form-grid compact" data-form="paie-variables" data-paie="${paie.id}">
      <div><b>Primes du mois</b>${variablesRows(paie.variables.primes, 'prime')}</div>
      <div><b>Autres retenues du mois</b> <small class="meta">(uniquement celles autorisées)</small>${variablesRows(paie.variables.retenues, 'retenue')}</div>
      <div class="form-actions span-all"><button type="submit" class="secondary-btn">Enregistrer et recalculer</button></div></form>` : ''}
    <div class="form-actions">${actionsPaie(paie)}${employe ? btn(`employe:view:${employe.id}`, 'Fiche employé') : ''}</div>
  </div>`;
}

function actionsPaie(paie) {
  if (!can('write')) return paie.statut === 'validee' || paie.statut === 'payee' ? btn(`paie:bulletin:${paie.id}`, 'Bulletin') : '';
  const parts = [];
  if (paie.statut === 'brouillon') parts.push(btn(`paie:valider:${paie.id}`, 'Valider'));
  if (paie.statut === 'validee') parts.push(btn(`paie:payer:${paie.id}`, 'Marquer payée'));
  if (paie.statut === 'validee' || paie.statut === 'payee') parts.push(btn(`paie:bulletin:${paie.id}`, 'Bulletin'));
  if (paie.statut !== 'annulee') parts.push(btn(`paie:annuler:${paie.id}`, 'Annuler', 'delete'));
  return parts.join('');
}

// Heures du mois des enseignants payés à l'heure : une saisie par affectation (collège / lycée) et par mois.
// Enregistrer de nouveau le même mois met à jour la saisie (historique conservé) ; verrouillée après validation.
export function heuresMoisHtml(state, mois) {
  const enseignants = state.personnel.filter((e) => estPayeALHeure(e) && (e.statut === 'actif' || state.paies.some((p) => p.employeId === e.id && p.mois === mois && p.statut !== 'annulee')))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (!enseignants.length) return '';
  const editable = can('write');
  const rows = enseignants.map((e) => {
    const saisie = heuresDuMois(state, e.id, mois);
    const verrou = heuresVerrouillees(state, e.id, mois);
    const valeur = (affectationId) => saisie?.lignes.find((l) => l.affectationId === affectationId)?.heures ?? '';
    const lignes = [...affectationsHorairesDuMois(state, e.id, mois).map((a) => ({ id: a.id, libelle: libelleAffectation(state, a) })), { id: 0, libelle: 'Autres heures (hors affectation)' }];
    const input = (l) => `<input class="cell-input heures-input" type="number" min="0" max="300" step="0.5" name="h-${e.id}-${l.id}" value="${escapeHtml(valeur(l.id))}" ${verrou || !editable ? 'disabled' : ''} aria-label="Heures ${escapeHtml(l.libelle)}" />`;
    const total = saisie?.totalHeures || 0;
    return `<tr class="${verrou ? 'row-locked' : ''}"><td><b>${escapeHtml(nomEmploye(e))}</b><div class="meta">${escapeHtml(e.matricule)} · ${money(state, e.remuneration.tauxHoraire)} / h</div></td>
      <td><div class="heures-grid">${lignes.map((l) => `<label class="heures-cell"><span>${escapeHtml(l.libelle)}</span>${input(l)}</label>`).join('')}</div></td>
      <td class="num"><b>${total}</b> h</td><td class="num"><b>${formatMoney(Math.round(total * Number(e.remuneration.tauxHoraire || 0)))}</b></td>
      <td>${verrou ? '<span class="badge ok">Paie validée — verrouillé</span>' : saisie ? `<span class="badge info">Enregistré</span><div class="meta">${saisie.historique.length > 1 ? `${saisie.historique.length - 1} mise(s) à jour · ` : ''}${escapeHtml(new Date(saisie.modifieLe || saisie.saisiLe).toLocaleString('fr-FR'))}</div>` : '<span class="badge warning">À saisir</span>'}</td></tr>`;
  }).join('');
  return `<form class="panel heures-panel" data-form="heures-mois" data-mois="${escapeHtml(mois)}" autocomplete="off">
    <div class="panel-header"><h3>Heures du mois — enseignants payés à l’heure</h3><span class="meta">${escapeHtml(moisLabel(mois))} · une seule saisie par enseignant et par mois</span></div>
    <div class="table-wrap"><table><thead><tr><th>Enseignant</th><th>Heures dispensées par affectation</th><th class="num">Total</th><th class="num">Salaire du mois</th><th>État</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="meta">Le salaire du mois = heures dispensées × tarif horaire de la fiche. Une nouvelle saisie du même mois remplace la précédente et garde la trace de l’ancienne valeur (date, auteur). Une fois la paie validée, les heures sont verrouillées : annulez la paie pour les corriger.</p>
    ${editable ? '<div class="form-actions"><button type="submit" class="primary-btn small-btn">Enregistrer les heures du mois</button></div>' : ''}
  </form>`;
}

export function renderPaieOutput(state) {
  const out = document.getElementById('paie-output');
  if (!out) return;
  const m = syntheseMois(state, paieView.mois);
  const q = paieView.search.trim().toLocaleLowerCase('fr');
  const rows = state.paies.filter((p) => p.mois === paieView.mois && (!paieView.statut || p.statut === paieView.statut)).map((p) => ({ p, c: calculAffiche(state, p) }))
    .filter(({ c }) => !q || `${c.employe.matricule} ${c.employe.prenom} ${c.employe.nom} ${c.employe.fonction}`.toLocaleLowerCase('fr').includes(q))
    .sort((a, b) => a.c.employe.nom.localeCompare(b.c.employe.nom, 'fr'));
  const detail = state.paies.find((p) => p.id === paieView.detailId && p.mois === paieView.mois);
  out.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Paies du mois</span><strong>${m.nb}</strong><small class="meta">${m.brouillons} brouillon(s)</small></div></article>
      <article class="stat-card accent-orange"><div><span>Brut</span><strong>${money(state, m.brut)}</strong><small class="meta">Primes ${money(state, m.primes)}</small></div></article>
      <article class="stat-card accent-red"><div><span>Retenues + avances</span><strong>${money(state, m.retenues + m.avances)}</strong></div></article>
      <article class="stat-card accent-green"><div><span>Net (payé / à payer)</span><strong>${money(state, m.net)}</strong><small class="meta">${money(state, m.paye)} payé · ${money(state, m.aPayer)} à payer</small></div></article>
    </div>
    ${heuresMoisHtml(state, paieView.mois)}
    <div class="table-wrap"><table class="data-list" data-list="paies" data-list-title="Paie mensuelle">
      <thead><tr><th>Matricule</th><th>Employé</th><th>Mode</th><th class="num">Brut</th><th class="num">Primes</th><th class="num">Retenues</th><th class="num">Avances</th><th class="num">Net</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${rows.map(({ p, c }) => `<tr class="${p.statut === 'annulee' ? 'cancelled' : ''} ${p.id === paieView.detailId ? 'row-current' : ''}">
        <td>${escapeHtml(c.employe.matricule)}</td><td>${escapeHtml(nomEmploye(c.employe))}<div class="meta">${escapeHtml(c.employe.fonction)}</div></td><td>${escapeHtml(c.modeLibelle || '')}${c.mode === 'horaire' ? `<div class="meta">${c.totalHeures || 0} h × ${formatMoney(c.tauxHoraire)}</div>` : ''}</td>
        <td class="num">${formatMoney(c.brut)}</td><td class="num">${formatMoney(c.totalPrimes)}</td><td class="num">${formatMoney(c.totalRetenues)}</td><td class="num">${formatMoney(c.totalAvances)}</td><td class="num"><b>${formatMoney(c.net)}</b></td>
        <td><span class="badge ${BADGE_PAIE[p.statut]}">${STATUTS_PAIE[p.statut]}</span>${c.alertes.length && p.statut === 'brouillon' ? ' <span class="badge warning" title="' + escapeHtml(c.alertes.join(' ')) + '">!</span>' : ''}</td>
        <td>${btn(`paie:detail:${p.id}`, 'Détail')}${actionsPaie(p)}</td></tr>`).join('') || '<tr><td colspan="10">Aucune paie pour ce mois : cliquez sur « Préparer la paie du mois ».</td></tr>'}</tbody>
    </table></div>
    ${detail ? paieDetailHtml(state, detail) : ''}`;
}

export function renderPaieMensuelle(state) {
  const section = document.getElementById('paie');
  if (!section) return;
  const brouillons = state.paies.filter((p) => p.mois === paieView.mois && p.statut === 'brouillon').length;
  const imprimables = state.paies.filter((p) => p.mois === paieView.mois && (p.statut === 'validee' || p.statut === 'payee')).length;
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Paie mensuelle</h2></div></div>
    ${procedurePaieHtml(state, 4)}
    ${(() => { const manquantes = state.personnel.filter((e) => e.statut === 'actif' && !remunerationDefinie(e)); return manquantes.length ? `<p class="form-warning">${manquantes.length} employé(s) sans rémunération définie (${escapeHtml(manquantes.slice(0, 4).map(nomEmploye).join(', '))}${manquantes.length > 4 ? '…' : ''}) : leur paie ne pourra pas être validée. <button type="button" class="link-btn" data-nav="remunerations">Définir les rémunérations</button></p>` : ''; })()}
    <div class="panel">
      <div class="advanced-search">
        <label>Mois <input type="month" data-pv="mois" value="${escapeHtml(paieView.mois)}" max="${todayISO().slice(0, 7)}" /></label>
        <label>Recherche <input type="search" data-pv="search" value="${escapeHtml(paieView.search)}" placeholder="Employé, matricule…" /></label>
        <label>Statut <select data-pv="statut"><option value="">Tous</option>${Object.entries(STATUTS_PAIE).map(([k, v]) => opt(k, v, paieView.statut)).join('')}</select></label>
      </div>
      <div class="form-actions report-actions">
        ${can('write') ? '<button class="primary-btn small-btn" data-action="paie:preparer">Préparer la paie du mois</button>' : ''}
        ${can('write') && brouillons ? `<button class="secondary-btn small-btn" data-action="paie:valider-tout">Valider les ${brouillons} brouillon(s)</button>` : ''}
        ${imprimables ? `<button class="secondary-btn small-btn" data-action="paie:bulletins-mois">Imprimer les ${imprimables} bulletin(s) du mois</button>` : ''}
      </div>
      <p class="meta">Brouillon : recalculé automatiquement (salaire mensuel ou heures du mois × tarif horaire, primes, retenues saisies, avances). Validation : montants figés et prélèvements d’avances appliqués (administrateur). Paiement : sortie de caisse enregistrée en dépense « Salaires et indemnités ».</p>
      <div id="paie-output"></div>
    </div>`;
  renderPaieOutput(state);
}

// ───────────────────────────── Avances sur salaire ─────────────────────────────
export function avancePreviewHtml(state, form) {
  const get = (n) => form.querySelector(`[name="${n}"]`)?.value;
  try {
    const ech = construireEcheancier(get('montantDemande'), get('modeRemboursement'), get('valeur'), get('moisDebut'), regleArrondi(state.config, 'avances'));
    return `<p class="meta">Échéancier proposé : ${ech.map((e) => `${escapeHtml(moisLabel(e.mois))} ${formatMoney(e.montant)}`).join(' · ')} (${ech.length} prélèvement(s), dernière mensualité ajustée)</p>`;
  } catch (error) {
    return `<p class="meta">${escapeHtml(error.message)}</p>`;
  }
}

export function renderAvances(state) {
  const section = document.getElementById('avances');
  if (!section) return;
  const actifs = state.personnel.filter((e) => e.statut !== 'sorti');
  const filtre = paieView.avanceStatut;
  const list = state.avances.filter((a) => (filtre === 'en_cours' ? ['demandee', 'approuvee', 'versee'].includes(a.statut) : !filtre || a.statut === filtre)).sort((a, b) => b.id - a.id);
  const all = state.avances.filter((a) => a.statut === 'versee' || a.statut === 'soldee');
  const next = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Avances sur salaire</h2></div></div>
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Avances versées</span><strong>${money(state, all.reduce((s, a) => s + a.montantAutorise, 0))}</strong></div></article>
      <article class="stat-card accent-green"><div><span>Remboursé (paie + exceptionnel)</span><strong>${money(state, all.reduce((s, a) => s + totalPreleve(a) + totalExceptionnel(a), 0))}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Solde restant</span><strong>${money(state, all.reduce((s, a) => s + soldeAvance(a), 0))}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>À traiter</span><strong>${state.avances.filter((a) => a.statut === 'demandee' || a.statut === 'approuvee').length}</strong></div></article>
    </div>
    ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Demande d’avance</h3><span class="meta">Approbation et versement par un administrateur</span></div>
      <form class="form-grid compact" data-form="avance" autocomplete="off">
        <label>Employé <select name="employeId" required><option value="">— Choisir —</option>${actifs.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, '')).join('')}</select></label>
        <label>Montant demandé <input name="montantDemande" type="number" min="1" step="1" required data-av /></label>
        <label>Date de la demande <input name="dateDemande" type="date" value="${todayISO()}" max="${todayISO()}" /></label>
        <label>Motif <input name="motif" type="text" /></label>
        <label>Remboursement <select name="modeRemboursement" data-av>${Object.entries(MODES_REMBOURSEMENT).map(([k, v]) => opt(k, v, 'mensualite')).join('')}</select></label>
        <label>Mensualité ou durée (mois) <input name="valeur" type="number" min="1" step="1" required data-av /></label>
        <label>Premier prélèvement <input name="moisDebut" type="month" value="${next}" required data-av /></label>
        <div class="span-all" data-av-preview><p class="meta">Saisissez le montant et le mode : l’échéancier s’affiche ici.</p></div>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer la demande</button></div>
      </form></div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Avances</h3></div>
      <div class="advanced-search"><label>Statut <select data-pv="avanceStatut">${[['en_cours', 'En cours (à traiter ou en remboursement)'], ['', 'Toutes'], ...Object.entries(STATUTS_AVANCE)].map(([k, v]) => opt(k, v, filtre)).join('')}</select></label></div>
      <div class="table-wrap"><table class="data-list" data-list="avances" data-list-title="Avances sur salaire" data-list-add="#avances form[data-form=avance]">
        <thead><tr><th>N°</th><th>Employé</th><th>Demande</th><th class="num">Demandé</th><th class="num">Autorisé</th><th>Remboursement</th><th class="num">Remboursé</th><th class="num">Solde</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${list.map((a) => {
          const e = state.personnel.find((x) => x.id === a.employeId);
          const acts = [btn(`avance:detail:${a.id}`, 'Détail')];
          if (can('write')) {
            if (a.statut === 'demandee') acts.push(btn(`avance:approuver:${a.id}`, 'Approuver'), btn(`avance:refuser:${a.id}`, 'Refuser', 'delete'));
            if (a.statut === 'approuvee') acts.push(btn(`avance:verser:${a.id}`, 'Verser'));
            if (a.statut === 'versee') acts.push(btn(`avance:exceptionnel:${a.id}`, 'Remboursement exceptionnel'));
          }
          return `<tr><td>${a.id}</td><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(formatDateFr(a.dateDemande))}${a.motif ? `<div class="meta">${escapeHtml(a.motif)}</div>` : ''}</td>
            <td class="num">${formatMoney(a.montantDemande)}</td><td class="num">${a.montantAutorise ? formatMoney(a.montantAutorise) : '—'}</td>
            <td>${escapeHtml(MODES_REMBOURSEMENT[a.modeRemboursement] || '')}<div class="meta">${a.echeancier.length ? `${a.echeancier.length} échéance(s) dès ${escapeHtml(moisLabel(a.echeancier[0].mois))}` : ''}</div></td>
            <td class="num">${formatMoney(totalPreleve(a) + totalExceptionnel(a))}</td><td class="num"><b>${formatMoney(soldeAvance(a))}</b></td>
            <td><span class="badge ${BADGE_AVANCE[a.statut]}">${STATUTS_AVANCE[a.statut]}</span></td><td>${acts.join('')}</td></tr>`;
        }).join('') || '<tr><td colspan="10">Aucune avance pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// Détail d'une avance : échéancier (avec reports), prélèvements et historique complet
export function showAvanceDetail(state, id) {
  const a = state.avances.find((x) => x.id === Number(id));
  const root = document.getElementById('modal-root');
  if (!a || !root) return false;
  const e = state.personnel.find((x) => x.id === a.employeId);
  const STATUT_ECH = { prevue: 'Prévue', prelevee: 'Prélevée', partielle: 'Partielle', reportee: 'Reportée', remboursee: 'Remboursée' };
  root.innerHTML = `<div class="modal-backdrop" data-modal-close><section class="student-modal" role="dialog" aria-modal="true">
    <header class="modal-header"><div><span class="eyebrow">Avance n°${a.id}</span><h2>${escapeHtml(nomEmploye(e))}</h2><span class="meta">${STATUTS_AVANCE[a.statut]} · ${escapeHtml(MODES_REMBOURSEMENT[a.modeRemboursement] || '')}</span></div>
      <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
    <div class="profile-section"><div class="profile-grid">
      <div class="profile-metric"><span>Autorisé</span><strong>${money(state, a.montantAutorise)}</strong></div>
      <div class="profile-metric"><span>Prélevé sur paie</span><strong>${money(state, totalPreleve(a))}</strong></div>
      <div class="profile-metric"><span>Remboursement exceptionnel</span><strong>${money(state, totalExceptionnel(a))}</strong></div>
      <div class="profile-metric"><span>Solde</span><strong>${money(state, soldeAvance(a))}</strong></div></div></div>
    ${a.echeancier.length ? `<div class="profile-section"><h3>Échéancier</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th class="num">Montant</th><th class="num">Prélevé</th><th>Statut</th><th></th></tr></thead>
      <tbody>${a.echeancier.map((x, i) => `<tr><td>${escapeHtml(moisLabel(x.mois))}${x.origine ? ` <small class="meta">(report de ${escapeHtml(moisLabel(x.origine))})</small>` : ''}</td><td class="num">${formatMoney(x.montant)}</td><td class="num">${formatMoney(x.preleve)}</td><td>${STATUT_ECH[x.statut] || x.statut}</td>
        <td>${a.statut === 'versee' && x.montant - x.preleve > 0 && can('write') ? btn(`avance:reporter:${a.id}:${i}`, 'Reporter') : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="profile-section"><h3>Historique</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th class="num">Montant</th><th>Par</th></tr></thead>
      <tbody>${[...(a.historique || [])].reverse().map((h) => `<tr><td>${escapeHtml(new Date(h.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(h.detail)}</td><td class="num">${h.montant ? formatMoney(h.montant) : ''}</td><td>${escapeHtml(h.par || '—')}</td></tr>`).join('')}</tbody></table></div></div>
  </section></div>`;
  return true;
}

// ───────────────────────────── Bulletins et récapitulatifs ─────────────────────────────
export const RAPPORTS_PAIE = [['mensuel', 'Récapitulatif mensuel'], ['annuel', 'Récapitulatif de l’année scolaire'], ['individuel', 'Récapitulatif individuel (année scolaire)']];

// Données d'un rapport de paie (tableau + totaux), réutilisées pour l'écran, l'Excel et le PDF
export function rapportPaie(state) {
  const v = paieView;
  if (v.rapType === 'mensuel') {
    const m = syntheseMois(state, v.mois);
    const rows = m.paies.filter((x) => x.paie.statut !== 'brouillon').map(({ paie, calcul }) => [calcul.employe.matricule, nomEmploye(calcul.employe), calcul.employe.fonction, calcul.brut, calcul.totalPrimes, calcul.totalRetenues, calcul.totalAvances, calcul.net, STATUTS_PAIE[paie.statut]]);
    const sum = (i) => rows.reduce((s, r) => s + r[i], 0);
    return { title: `Récapitulatif de la paie — ${moisLabel(v.mois)}`, head: ['Matricule', 'Employé', 'Fonction', 'Brut', 'Primes', 'Retenues', 'Avances', 'Net', 'Statut'], money: [3, 4, 5, 6, 7], rows, foot: ['TOTAL', `${rows.length} paie(s)`, '', sum(3), sum(4), sum(5), sum(6), sum(7), ''], note: 'Paies validées et payées (brouillons exclus).' };
  }
  const employe = v.rapType === 'individuel' ? state.personnel.find((e) => e.id === Number(v.rapEmploye)) : null;
  const anneeRap = state.annees.find((a) => a.id === Number(v.rapAnnee)) || anneePourMois(state, v.mois) || state.annees.find((a) => a.id === state.anneeActiveId);
  const r = recapAnnuel(state, anneeRap ? anneeRap.id : new Date().getFullYear(), employe ? employe.id : 0);
  const libelleAnnee = anneeRap ? `de l’année scolaire ${anneeRap.annee}` : '';
  const rows = r.mois.map((x) => [moisLabel(x.mois), x.nb, x.brut, x.primes, x.retenues, x.avances, x.net, x.paye, x.net - x.paye]);
  return {
    title: employe ? `Récapitulatif ${libelleAnnee} — ${nomEmploye(employe)} (${employe.matricule})` : `Récapitulatif de la paie ${libelleAnnee}`,
    head: ['Mois', 'Paies', 'Brut', 'Primes', 'Retenues', 'Avances', 'Net', 'Payé', 'Reste à payer'], money: [2, 3, 4, 5, 6, 7, 8], rows,
    foot: ['TOTAL', r.total.nb, r.total.brut, r.total.primes, r.total.retenues, r.total.avances, r.total.net, r.total.paye, r.total.net - r.total.paye], note: 'Paies validées et payées (brouillons exclus).'
  };
}

export function renderPaieRapports(state) {
  const section = document.getElementById('paie-rapports');
  if (!section) return;
  const v = paieView;
  const r = rapportPaie(state);
  const cell = (val, i) => (r.money.includes(i) ? `<td class="num">${formatMoney(val)}</td>` : `<td>${escapeHtml(val)}</td>`);
  const imprimables = state.paies.filter((p) => p.mois === v.mois && (p.statut === 'validee' || p.statut === 'payee'));
  const anneeRap = Number(v.rapAnnee) || anneePourMois(state, v.mois)?.id || state.anneeActiveId;
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Bulletins et récapitulatifs</h2></div></div>
    <div class="panel">
      <div class="report-tabs" role="tablist">${RAPPORTS_PAIE.map(([k, l]) => `<button type="button" class="tab-btn ${k === v.rapType ? 'active' : ''}" data-paie-rapport="${k}">${l}</button>`).join('')}</div>
      <div class="advanced-search">
        <label ${v.rapType === 'mensuel' ? '' : 'hidden'}>Mois <input type="month" data-pv="mois" value="${escapeHtml(v.mois)}" max="${todayISO().slice(0, 7)}" /></label>
        <label ${v.rapType === 'mensuel' ? 'hidden' : ''}>Année scolaire <select data-pv="rapAnnee">${state.annees.map((y) => opt(y.id, y.annee, anneeRap)).join('')}</select></label>
        <label ${v.rapType === 'individuel' ? '' : 'hidden'}>Employé <select data-pv="rapEmploye"><option value="">— Choisir —</option>${state.personnel.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, v.rapEmploye)).join('')}</select></label>
      </div>
      <div class="form-actions report-actions">
        <button class="secondary-btn small-btn" data-action="paierapport:pdf">PDF / Imprimer</button>
        <button class="secondary-btn small-btn" data-action="paierapport:excel">Excel</button>
        ${v.rapType === 'mensuel' && imprimables.length ? `<button class="primary-btn small-btn" data-action="paie:bulletins-mois">Imprimer les ${imprimables.length} bulletin(s) de ${escapeHtml(moisLabel(v.mois))}</button>` : ''}
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      ${v.rapType === 'individuel' && !v.rapEmploye ? '<p class="meta">Choisissez un employé.</p>' : `<div class="table-wrap"><table>
        <thead><tr>${r.head.map((h, i) => `<th class="${r.money.includes(i) ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${r.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${r.head.length}">Aucune paie validée pour cette sélection.</td></tr>`}</tbody>
        <tfoot><tr>${r.foot.map(cell).join('')}</tr></tfoot></table></div>
      <p class="meta">${escapeHtml(r.note)}</p>`}
      ${v.rapType === 'mensuel' ? `<h3>Bulletins individuels</h3><div class="chip-list">${imprimables.map((p) => `<button type="button" class="action-btn" data-action="paie:bulletin:${p.id}">${escapeHtml(p.numero)} — ${escapeHtml(nomEmploye(p.calcul.employe))}</button>`).join('') || '<span class="meta">Aucun bulletin validé ce mois-ci.</span>'}</div>` : ''}
    </div>`;
}

export function renderPaie(state) {
  renderPaieDashboard(state);
  renderPersonnel(state);
  renderAffectations(state);
  renderRemunerations(state);
  renderPaieMensuelle(state);
  renderAvances(state);
  renderPaieRapports(state);
}

