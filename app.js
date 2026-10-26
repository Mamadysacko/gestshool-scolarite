import { loadState, saveState, exportStateToFile, importStateFromFile, blankState, migrateState, stateWasCreated } from './storage.js';
import { renderPaiements, showStudentProfile, exportPaymentsCsv, exportStudentsCsv } from './ui.js';
import { renderAnnees, renderClasses, renderEleves, renderInscriptions, renderTarifs, programmeView, passageView, imprimerListeReinscrits } from './modules/views.js';
import { setDecision, inscrireAdmis, candidatsPassage, recapReinscription, classeProposee, DECISIONS } from './modules/passage.js';
import { definirResponsable, responsablePrincipal, nomContact } from './modules/contacts.js';
import { definirProgramme, copierProgramme } from './modules/programme.js';
import { reconduire, anneePrecedente, apercuReconduction, texteBilan, OPTIONS_RECONDUCTION } from './modules/reconduction.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderConfig, dataFileStatusHtml } from './modules/config-view.js';
import { renderDepenses, renderDepenseOutput, setDepenseFilter, resetDepenseFilters, readPiece, printExpenseReceipt } from './modules/depenses-view.js';
import { createDepense, updateDepense, cancelDepense, validateDepense } from './modules/depenses.js';
import { createSafetyBackup, readSafetyBackup, deleteSafetyBackup, deleteAllSafetyBackups, listSafetyBackups } from './modules/sauvegardes.js';
import { showLogin } from './modules/login-view.js';
import { renderAide, bindAide, openAideForPage, getAideView, setAideView } from './modules/aide-view.js';
import { loadUiState, saveUiState, pickKnown } from './modules/ui-state.js';
import { NAV_GROUPS, groupOfPage, pageLabel, PAGE_ICONS } from './modules/navigation.js';
import { renderDettes, renderDettesOutput, showDetteDetail, detteFilters } from './modules/dettes-view.js';
import { soldesReportables, reporterSoldes } from './modules/reliquats.js';
import { paieFormHandlers, handlePaieClick, handlePaieInput } from './modules/paie-actions.js';
import { renderPaie, paieView, syncModeRemuneration } from './modules/paie-views.js';
import { bindLists, enhanceLists } from './modules/listes.js';
import { renderAnalyseEncaissements, setEncFilter, exportAnalyseEncaissements, encFilters } from './modules/analyse-encaissements.js';
import { depenseFilters } from './modules/depenses-view.js';
import { REPORT_TYPES } from './modules/rapports.js';
import { DIMENSIONS } from './modules/analyse.js';
import { withTransaction } from './modules/transaction.js';
import { previewPaiement } from './modules/allocation.js';
import { renderAnalyse, renderAnalyseBody, defaultAnalyseFilters } from './modules/analyse.js';
import { renderRapports, renderReportOutput, defaultReportFilters, selectReportType, exportReport, printReport, printReminders } from './modules/rapports.js';
import { printReceipt, printInvoice } from './modules/recus.js';
import { bindPaymentForm, selectStudentForPayment, selectDebtForPayment } from './modules/paiement-form.js';
import { initAutoBackup, scheduleBackup, exportNoteText, backupStatus, onBackupStatus, linkDataFolder, reconnectDataFolder, unlinkDataFolder, readLinkedData, flushBackup, blockBackup, writeBackupFile, backupFileName, dataFilePrompted, markDataFilePrompted, DATA_FILE_NAME } from './modules/backup.js';
import { logOperation } from './modules/audit.js';
import { initCloud } from './modules/cloud.js';
import { refreshStatuses } from './modules/finance.js';
import { createAnnee, updateAnnee, updateAnneeStatus, deleteAnnee, setAnneeActive } from './modules/annees.js';
import { createClasse, updateClasse, deleteClasse } from './modules/classes.js';
import { createEleve, updateEleve, toggleEleveState, deleteEleve } from './modules/eleves.js';
import { createInscription, deleteInscription, validerInscription, generateEcheancesForInscription, reinscrireEleve } from './modules/inscriptions.js';
import { createTarif, updateTarif, duplicateTarif, deleteTarif, propagateTarif, autoTrancheDates, autoTrancheMontants, autoMontantMensuel } from './modules/tarifs.js';
import { createPaiement, validatePaiement, cancelPaiement, ensureReceiptNumber, changerModalite } from './modules/paiements.js';
import { MODALITES } from './modules/modalites.js';
import { confirmDialog, notify } from './modules/dialog.js';
import { touchSession, requireAdmin, can, currentUser, allowedPages, endSession, authenticate, createUser, changePassword, setUserActive, setUserRole, ROLES, publicUsers, passwordProblem, saveRole, deleteRole, resetRoles, roleOf } from './modules/auth.js';
import { showDetail, showReceiptPreview, showExpenseReceiptPreview } from './modules/details.js';
import { formatMoney, todayISO, escapeHtml, downloadCsv } from './modules/utils.js';
import { telechargerArchive, lireFichier, appliquerParametres, empreinteDonnees } from './modules/archive.js';
import { ouvrirCaisse, fermerCaisse, rouvrirCaisse, rapprocher } from './modules/caisse.js';
import { renderCaisse, caisseView, majEcart, printPvCloture, printJournalDuJour } from './modules/caisse-view.js';
import { renderEtats, renderEtatsOutput, etatsFilters, resetEtatsFilters, setEtatsFilter, selectEtat, exportEtat, printEtat } from './modules/etats-view.js';
import { enregistrerBudget, ETATS } from './modules/etats.js';
import { synchroniserLicences, verifierCle, ajouterCle, modifierCle, revoquerCle, supprimerCle } from './modules/licences.js';
import { renderLicences } from './modules/licences-view.js';
import { surveillerFormulaires, ouvrirFormulaire } from './modules/formulaires.js';
import { supprimerComptesNonSuperAdmin } from './modules/auth.js';
import { onSecurityEvent, exiger, avecAutorisation, PERMISSIONS_SENSIBLES, permissionLabel, activerControleDroits, definirEtablissement, rattacherComptes, estSuperAdmin } from './modules/auth.js';
import { renderCreances, renderCreancesOutput, creanceFilters, resetCreanceFilters, setCreanceFilter, printRelances, printEtatRecouvrement, exportCreancesCsv } from './modules/creances-view.js';
import { renderComptes } from './modules/comptes-view.js';
import { createCompte, updateCompte, setCompteActif, compteOf, createVirement, validateVirement, cancelVirement, compteParDefaut, comptesActifs } from './modules/comptes.js';
import { enregistrerAttente, validateAttente, confirmerAttente, rejeterAttente } from './modules/attente.js';
import { corrigerPaiement, MODES_PAIEMENT } from './modules/paiements.js';
import { accorderReduction, retirerReduction, TYPES_REDUCTION, MODES_REDUCTION, reductionLabel } from './modules/reductions.js';
import { createRecurrente, setRecurrenteActive, enregistrerOccurrence, ignorerOccurrence } from './modules/depenses.js';
import { setCategories } from './modules/classes.js';
import { setCategoriesDepense } from './modules/depenses.js';
import { inscriptionsDuTarif } from './modules/tarifs.js';
import { tarifFor } from './modules/modalites.js';
import { regleArrondi, ecartArrondi, normaliserArrondis } from './modules/arrondi.js';

const appState = loadState();
// Licences : utilisations et liste noire fusionnées avec les registres du navigateur (jamais libérées)
synchroniserLicences(appState);

// Événements de sécurité (connexions, refus, autorisations administrateur) inscrits au journal des opérations
onSecurityEvent(({ detail, utilisateur }) => {
  logOperation(appState, 'securite', detail);
  const last = appState.journal[appState.journal.length - 1];
  if (last && utilisateur && !last.utilisateur) last.utilisateur = utilisateur;
  saveState(appState);
  // Journal d'audit affiché : mis à jour aussitôt (un refus doit être visible sans recharger)
  if (document.getElementById('config-journal')?.innerHTML) renderConfig(appState);
});

// Les anciens paiements reçoivent leur numéro de reçu une seule fois, dans l'ordre chronologique
function ensureAllReceiptNumbers() {
  [...appState.paiements]
    .sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)) || a.id - b.id)
    .forEach((payment) => ensureReceiptNumber(appState, payment));
}

ensureAllReceiptNumbers();
refreshStatuses(appState);

const dashboardFilters = { yearId: Number(appState.anneeActiveId || 0), classId: 0, category: '', eleveId: 0, from: '', to: '', mode: '', agent: '', evoFrom: `${todayISO().slice(0, 4)}-01-01`, evoTo: todayISO(), evoGran: 'mois', evoCompare: true };
const reportFilters = defaultReportFilters(appState);
const analyseFilters = defaultAnalyseFilters(appState);

const ok = (message) => notify('success', message);
const ko = (message) => notify('error', message);

// ---------- Année scolaire affichée ----------
// Toutes les pages affichent par défaut les données de l'année ACTIVE. Dès qu'une autre année est activée
// (depuis l'en-tête ou la page Années scolaires, un import, une restauration…), filtres, périodes et listes
// basculent automatiquement sur la nouvelle année.
let shownYearId = 0;

// Période par défaut d'une année : de la rentrée à aujourd'hui (les règlements tardifs, encaissés après la
// fin d'année, restent visibles). Mois de paie : le mois courant, ou le dernier mois d'une année terminée.
function yearPeriod(id) {
  const annee = appState.annees.find((a) => a.id === Number(id));
  const today = todayISO();
  const from = annee?.dateDebut && annee.dateDebut <= today ? annee.dateDebut : `${today.slice(0, 4)}-01-01`;
  const mois = (annee?.dateFin && annee.dateFin < today ? annee.dateFin : today).slice(0, 7);
  return { from, to: today, mois };
}

function applyActiveYear() {
  const id = Number(appState.anneeActiveId || 0);
  shownYearId = id;
  const { from, to, mois } = yearPeriod(id);
  Object.assign(dashboardFilters, { yearId: id, classId: 0, category: '', eleveId: 0, evoFrom: from, evoTo: to });
  resetCreanceFilters(appState);
  resetEtatsFilters(appState);
  Object.assign(reportFilters, { yearId: id, classId: 0, from, to });
  Object.assign(analyseFilters, { yearId: id, category: '' });
  Object.assign(encFilters, { yearId: id, classId: 0, category: '', from, to });
  resetDepenseFilters(appState);
  Object.assign(paieView, { affAnnee: id, mois, rapAnnee: 0, affClasses: [], affMatieres: [], affLignes: [] });
  Object.assign(listFilters, { studentClass: '', studentYear: String(id), inscYear: String(id), payYear: String(id) });
  Object.assign(detteFilters, { reportCible: id, reportSelection: [] });
  Object.assign(passageView, { cibleId: 0, sourceId: 0, selection: [], classes: {}, filtre: '' });
}

function renderYearSwitch() {
  const box = document.getElementById('yearSwitch');
  if (!box) return;
  const active = appState.annees.find((a) => a.id === Number(appState.anneeActiveId));
  const statut = { ouverte: 'ouverte', cloturee: 'clôturée', preparation: 'en préparation' }[active?.statut] || '';
  box.innerHTML = `<span>Année scolaire</span>
    <select id="activeYearSelect" aria-label="Année scolaire active" ${can('write') ? '' : 'disabled title="Seuls l’administrateur et le comptable changent l’année active"'}>
      ${appState.annees.map((a) => `<option value="${a.id}" ${a.id === active?.id ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('') || '<option value="">Aucune année</option>'}
    </select>
    ${statut ? `<small class="badge ${active.statut === 'ouverte' ? 'ok' : active.statut === 'cloturee' ? 'neutral' : 'warning'}">${statut}</small>` : ''}
    ${appState.annees.length ? '' : `${can('write') ? '<button type="button" class="link-btn" data-nav="annees">Créer la première année</button>' : ''}`}`;
}

async function switchActiveYear(id) {
  const annee = appState.annees.find((a) => a.id === Number(id));
  if (!annee || annee.id === Number(appState.anneeActiveId)) { renderYearSwitch(); return; }
  const done = await runOperation({
    title: 'Changer l’année active', silent: true,
    exec: () => { setAnneeActive(appState, annee.id); logOperation(appState, 'annee', `Année active : ${annee.annee}`); return true; },
    success: `Année ${annee.annee} active : toutes les pages affichent désormais ses données`
  });
  if (!done) renderYearSwitch();
}

function updateRoleUi() {
  const me = currentUser();
  // Carte utilisateur du bas de la barre latérale : initiales, nom, rôle
  const label = document.getElementById('roleLabel');
  if (label && me) label.textContent = ROLES[me.role] || me.role;
  const nom = document.getElementById('userName');
  if (nom && me) nom.textContent = me.nom;
  const avatar = document.getElementById('userAvatar');
  if (avatar && me) avatar.textContent = String(me.nom || me.username).split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';
  const carte = document.querySelector('.user-card');
  if (carte && me) carte.title = `${me.nom} — ${ROLES[me.role] || me.role}`;
  const pages = allowedPages();
  document.querySelectorAll('.nav-btn[data-group]').forEach((button) => {
    const group = NAV_GROUPS.find((g) => g.id === button.dataset.group);
    button.hidden = !group || !group.pages.some(([id]) => pages.includes(id));
  });
  const active = document.querySelector('.content-section.active')?.id;
  if (active) renderSubtabs(active);
  document.querySelectorAll('.top-actions').forEach((box) => { box.hidden = !can('write'); });
  document.body.classList.toggle('no-export', !can('export'));
  document.body.classList.toggle('read-only', !can('write'));
}

function renderAll() {
  renderDashboard(appState, dashboardFilters);
  renderAnalyse(appState, analyseFilters);
  renderAnnees(appState);
  renderClasses(appState);
  renderEleves(appState);
  renderInscriptions(appState);
  renderTarifs(appState);
  renderPaiements(appState);
  renderCreances(appState);
  renderComptes(appState);
  renderCaisse(appState);
  renderEtats(appState);
  renderLicences(appState);
  renderRapports(appState, reportFilters);
  renderDepenses(appState);
  renderDettes(appState);
  renderAnalyseEncaissements(appState);
  renderPaie(appState);
  renderConfig(appState);
  renderDataFileChip();
  renderAide(appState);
  renderYearSwitch();
  const schoolName = document.getElementById('schoolName');
  if (schoolName) schoolName.textContent = String(appState.config.nom || '').trim() || 'Établissement non configuré';
  updateRoleUi();
  restoreListFilters();
  enhanceLists();
}

// Point d'entrée unique après toute opération : numéros, statuts, sauvegarde, copies de secours puis rendu
// de tous les écrans (soldes, tableau de bord et rapports restent ainsi toujours cohérents).
function updateAndRender() {
  ensureAllReceiptNumbers();
  refreshStatuses(appState);
  synchroniserLicences(appState);
  if (Number(appState.anneeActiveId || 0) !== shownYearId) applyActiveYear();
  if (!saveState(appState)) ko('Sauvegarde impossible : stockage du navigateur plein');
  scheduleBackup(appState);
  renderAll();
}

// Autorisation administrateur si nécessaire, puis confirmation. Les opérations courantes (`silent`) n'ouvrent
// aucune fenêtre : seules les opérations sensibles (suppression, annulation, réinitialisation, finances) demandent confirmation.
async function ask(options) {
  if (options.admin && !(await requireAdmin(appState, options.adminReason, { reauth: Boolean(options.reauth), superadmin: Boolean(options.superadmin) }))) {
    ko(options.superadmin ? 'Autorisation refusée : opération réservée au super administrateur.' : 'Autorisation refusée : action réservée à l’administrateur.');
    return { ok: false, value: '' };
  }
  if (options.silent) return { ok: true, value: '', values: {} };
  return confirmDialog(options);
}

function replaceState(next) {
  Object.keys(appState).forEach((key) => delete appState[key]);
  Object.assign(appState, next);
}

// Contrôle de rôle, confirmation éventuelle, exécution « tout ou rien », journal, puis message de réussite ou d'échec
// Contrôle des droits (en plus de celui des fonctions métier) :
//  - `permission` détenue : l'opération s'exécute (l'accord d'un administrateur n'est plus nécessaire) ;
//  - permission ordinaire manquante : refus journalisé, sans contournement possible ;
//  - permission SENSIBLE manquante, ou `admin: true` sans permission précisée : accord d'un administrateur
//    (identifiants saisis), puis exécution sous cette autorisation, tracée dans le journal ;
//  - `superadmin: true` : seul un super administrateur peut autoriser (opérations système).
async function runOperation({ title, message, confirmLabel, danger, admin, adminReason, reauth, silent, field, fields, exec, success, failure, permission = '', superadmin = false }) {
  if (sessionLost()) return false;
  if (!can('write') && !superadmin) { ko('Votre rôle ne permet pas de modifier les données.'); return false; }
  const detient = permission ? can(permission) : false;
  if (permission && !detient && !PERMISSIONS_SENSIBLES.includes(permission)) {
    try { exiger(permission); } catch (error) { ko(error.message); }
    return false;
  }
  const accordRequis = superadmin ? (!can('superadmin') || reauth) : permission ? (!detient || Boolean(reauth)) : Boolean(admin);
  const raison = adminReason || (permission ? `Votre rôle ne comprend pas le droit « ${permissionLabel(permission)} » : l’accord d’un administrateur est nécessaire.` : undefined);
  const answer = await ask({ title, message, confirmLabel, danger, admin: accordRequis, adminReason: raison, reauth, superadmin, silent, field, fields });
  if (!answer.ok) return false;
  // Accord obtenu pour un utilisateur qui ne détient pas le droit : exécution sous autorisation (journalisée par requireAdmin)
  const sousAutorisation = accordRequis && !(superadmin ? can('superadmin') : permission ? detient : can('admin'));
  let result;
  try {
    const run = () => withTransaction(appState, () => exec(answer.value, answer.values || {}));
    result = sousAutorisation ? avecAutorisation(run) : run();
  } catch (error) {
    ko(`${failure || 'Opération impossible'} (${error.message})`);
    return false;
  }
  if (result === false || result === null || result === undefined) {
    ko(failure || 'L’opération a échoué.');
    return false;
  }
  updateAndRender();
  ok(success);
  return true;
}

// Dernière page consultée dans chaque onglet principal (un clic sur l'onglet y ramène)
const lastPageOfGroup = {};

// Sous-onglets de l'onglet principal courant, affichés en haut de la page (seulement les pages autorisées)
function renderSubtabs(pageId) {
  const bar = document.getElementById('subtabs');
  const group = groupOfPage(pageId);
  if (!bar || !group) return;
  const pages = group.pages.filter(([id]) => allowedPages().includes(id));
  bar.hidden = pages.length < 2;
  bar.innerHTML = pages.map(([id, label]) => `<button type="button" class="subtab-btn ${id === pageId ? 'active' : ''}" data-target="${id}" role="tab" aria-selected="${id === pageId}"><span class="subtab-icon" aria-hidden="true">${PAGE_ICONS[id] || '•'}</span><span class="subtab-label">${label}</span></button>`).join('');
}

// Affiche une page (sous-onglet) : contrôle des droits, onglet principal actif, titre, adresse, état mémorisé
// Contexte transmis au module de paie : mêmes mécanismes de droits, transactions, journal et rendu
function paieCtx() {
  // Opérations de paie : droit « Paie du personnel » exigé par défaut
  return { state: appState, runOperation: (options) => runOperation({ permission: 'paie.gerer', ...options }), ko, ok, goTo, resetForm, fillForm, enterEditMode, readPiece };
}

function goTo(sectionId) {
  if (!allowedPages().includes(sectionId)) return false;
  const group = groupOfPage(sectionId);
  if (!group) return false;
  lastPageOfGroup[group.id] = sectionId;
  // Changer de page ferme toute fenêtre ouverte (aperçu de reçu, fiche…) : elle ne doit jamais masquer la nouvelle page
  const modal = document.getElementById('modal-root');
  if (modal?.innerHTML) modal.innerHTML = '';
  document.querySelectorAll('.nav-btn[data-group]').forEach((btn) => btn.classList.toggle('active', btn.dataset.group === group.id));
  document.querySelectorAll('.content-section').forEach((section) => {
    section.classList.toggle('active', section.id === sectionId);
    section.classList.toggle('hidden', section.id !== sectionId);
  });
  renderSubtabs(sectionId);
  const title = document.getElementById('pageTitle');
  if (title) title.textContent = group.pages.length > 1 ? `${group.label} · ${pageLabel(sectionId)}` : group.label;
  toggleSidebar(false);
  if (window.location.hash !== `#${sectionId}`) history.replaceState(null, '', `#${sectionId}`);
  schedulePersist();
  return true;
}

function openGroup(groupId) {
  const group = NAV_GROUPS.find((g) => g.id === groupId);
  if (!group) return;
  const pages = group.pages.map(([id]) => id).filter((id) => allowedPages().includes(id));
  goTo(pages.includes(lastPageOfGroup[groupId]) ? lastPageOfGroup[groupId] : pages[0]);
}

function findByName(list, text) {
  const t = String(text || '').trim().toLocaleLowerCase('fr');
  return t ? list.find((item) => item.nom.toLocaleLowerCase('fr') === t) : null;
}

function findStudent(text) {
  const t = String(text || '').trim().toLocaleLowerCase('fr');
  if (!t) return null;
  const label = (e) => `${e.matricule} — ${e.prenom} ${e.nom}`.toLocaleLowerCase('fr');
  const exact = appState.eleves.filter((e) => label(e) === t || e.matricule.toLocaleLowerCase('fr') === t);
  if (exact.length === 1) return exact[0];
  const partial = appState.eleves.filter((e) => label(e).includes(t));
  return partial.length === 1 ? partial[0] : null;
}

const studentLabel = (e) => `${e.matricule} — ${e.prenom} ${e.nom}`;
const className = (id) => appState.classes.find((c) => c.id === Number(id))?.nom || '—';
const classesOfActiveYear = () => appState.classes.filter((c) => c.anneeId === appState.anneeActiveId);

function resetForm(form) {
  form?.querySelectorAll('input[type="hidden"]').forEach((input) => { input.value = ''; });
  if (!form) return;
  form.reset();
  delete form.dataset.editId;
  form.querySelectorAll('[data-touched]').forEach((input) => delete input.dataset.touched);
  const cancel = form.querySelector('[data-action="form:reset"]');
  if (cancel) cancel.hidden = true;
  const submit = form.querySelector('[data-submit-label]');
  if (submit && submit.dataset.defaultLabel) submit.textContent = submit.dataset.defaultLabel;
  if (form.querySelector('[data-pe-mode]')) syncModeRemuneration(form);
}

function enterEditMode(form, id, label) {
  ouvrirFormulaire(form);
  form.dataset.editId = String(id);
  const cancel = form.querySelector('[data-action="form:reset"]');
  if (cancel) cancel.hidden = false;
  const submit = form.querySelector('[data-submit-label]');
  if (submit) {
    if (!submit.dataset.defaultLabel) submit.dataset.defaultLabel = submit.textContent;
    submit.textContent = label;
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function fillForm(form, values) {
  ouvrirFormulaire(form);
  Object.entries(values).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value ?? '';
  });
}

function filterRows(selector, predicate, countSelector) {
  const rows = [...document.querySelectorAll(selector)];
  let visible = 0;
  rows.forEach((row) => {
    const matches = predicate(row);
    row.hidden = !matches;
    if (matches) visible += 1;
  });
  const count = document.querySelector(countSelector);
  if (count) count.textContent = `${visible} résultat(s)`;
}

const listFilters = { studentSearch: '', studentClass: '', studentStatus: '', studentYear: '', inscYear: '', paySearch: '', payFrom: '', payTo: '', payStatus: '', payYear: '' };
const LIST_FIELDS = {
  studentSearch: '[data-student-search]', studentClass: '[data-student-class]', studentStatus: '[data-student-status]', studentYear: '[data-student-year]',
  inscYear: '[data-insc-year]',
  paySearch: '[data-payment-search]', payFrom: '[data-payment-from]', payTo: '[data-payment-to]', payStatus: '[data-payment-status]', payYear: '[data-payment-year]'
};
// Filtre « année » d'une ligne : 'all' = toutes les années ; sinon l'année choisie (une ligne peut relever de plusieurs années)
const yearMatches = (row, year) => !year || year === 'all' || (row.dataset.years || '').split(' ').includes(year);

function readListFilters() {
  Object.entries(LIST_FIELDS).forEach(([key, selector]) => {
    const input = document.querySelector(selector);
    if (input) listFilters[key] = input.value;
  });
}

// Après chaque rendu (opération, actualisation) : on remet les filtres saisis et on les réapplique
function restoreListFilters() {
  Object.entries(LIST_FIELDS).forEach(([key, selector]) => {
    const input = document.querySelector(selector);
    if (!input || !listFilters[key]) return;
    if (input.tagName === 'SELECT' && ![...input.options].some((o) => o.value === listFilters[key])) { listFilters[key] = ''; return; }
    input.value = listFilters[key];
  });
  applyStudentFilters();
  applyPaymentFilters();
  applyInscriptionFilters();
}

// Journal des opérations : recherche libre et type d'opération
function applyJournalFilters() {
  const q = String(document.querySelector('[data-journal-search]')?.value || '').trim().toLocaleLowerCase('fr');
  const type = document.querySelector('[data-journal-type]')?.value || '';
  const user = document.querySelector('[data-journal-user]')?.value || '';
  const from = document.querySelector('[data-journal-from]')?.value || '';
  const to = document.querySelector('[data-journal-to]')?.value || '';
  filterRows('[data-journal-row]', (row) => (!q || row.dataset.search.includes(q)) && (!type || row.dataset.type === type) && (!user || row.dataset.user === user)
    && (!from || row.dataset.date >= from) && (!to || row.dataset.date <= to));
}

function applyInscriptionFilters() {
  readListFilters();
  filterRows('[data-insc-row]', (row) => yearMatches(row, listFilters.inscYear), '[data-insc-count]');
}

function applyStudentFilters() {
  readListFilters();
  const search = listFilters.studentSearch.trim().toLocaleLowerCase('fr');
  const classId = listFilters.studentClass;
  const status = listFilters.studentStatus;
  filterRows('[data-student-row]', (row) =>
    (!search || row.dataset.search.includes(search))
    && (!classId || row.dataset.class === classId)
    && yearMatches(row, listFilters.studentYear)
    && (!status || row.dataset.status === status), '[data-student-count]');
}

function applyPaymentFilters() {
  readListFilters();
  const search = listFilters.paySearch.trim().toLocaleLowerCase('fr');
  const from = listFilters.payFrom;
  const to = listFilters.payTo;
  const status = listFilters.payStatus;
  filterRows('[data-payment-row]', (row) =>
    (!search || row.dataset.search.includes(search))
    && (!from || row.dataset.date >= from)
    && (!to || row.dataset.date <= to)
    && yearMatches(row, listFilters.payYear)
    && (!status || row.dataset.status === status), '[data-payment-count]');
}

function bindMenu() {
  // Menu principal : une seule source (NAV_GROUPS), affiché selon les pages autorisées du rôle (updateRoleUi)
  const nav = document.getElementById('mainNav');
  if (nav) nav.innerHTML = NAV_GROUPS.map((g, i) => `<button class="nav-btn ${i === 0 ? 'active' : ''}" type="button" data-group="${g.id}" data-icon="${g.icon}" title="${escapeHtml(g.label)}"><span class="nav-label">${escapeHtml(g.label)}</span></button>`).join('');
  document.querySelectorAll('.nav-btn[data-group]').forEach((button) => {
    button.addEventListener('click', () => openGroup(button.dataset.group));
  });
  document.getElementById('subtabs')?.addEventListener('click', (event) => {
    const tab = event.target instanceof Element ? event.target.closest('.subtab-btn[data-target]') : null;
    if (tab) goTo(tab.dataset.target);
  });
  // Saisie manuelle de l'adresse ou bouton précédent : seules les pages autorisées sont ouvertes
  window.addEventListener('hashchange', () => {
    const target = window.location.hash.slice(1);
    if (allowedPages().includes(target)) goTo(target);
  });

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.open === 'new-eleve' ? 'eleves' : 'inscriptions';
      goTo(target);
      ouvrirFormulaire(document.querySelector(`#${target} form[data-form]`));
      document.querySelector(`#${target} .section-form`)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function bindGlobalActions() {
  // Barre latérale rétractable (grand écran) : préférence mémorisée sur ce poste
  const reduire = (actif) => {
    document.body.classList.toggle('sidebar-reduite', actif);
    const bouton = document.getElementById('sidebarCollapse');
    if (bouton) {
      bouton.textContent = actif ? '»' : '«';
      bouton.title = actif ? 'Déployer le menu' : 'Réduire le menu';
      bouton.setAttribute('aria-label', bouton.title);
      bouton.setAttribute('aria-expanded', String(!actif));
    }
    try { localStorage.setItem('gss_sidebar_reduite', actif ? '1' : '0'); } catch (error) { /* préférence facultative */ }
  };
  let preference = false;
  try { preference = localStorage.getItem('gss_sidebar_reduite') === '1'; } catch (error) { preference = false; }
  reduire(preference);
  document.getElementById('sidebarCollapse')?.addEventListener('click', () => reduire(!document.body.classList.contains('sidebar-reduite')));

  // Restauration (données complètes) ou import de paramètres depuis la page « Sauvegardes et restauration »
  document.addEventListener('change', async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('#importDataInput, [data-restore-input]')) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) await restaurerDepuisFichier(file);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => { endSession({ volontaire: true }); saveState(appState); window.location.reload(); });
  document.getElementById('dataFileChip')?.addEventListener('click', async (event) => {
    const todo = event.currentTarget.dataset.do;
    if (todo === 'reconnect') await reconnectFlow();
    else if (todo === 'link') await linkDataFolderFlow();
    else if (goTo('config-donnees')) document.querySelector('[data-datafile-status]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('menuToggle')?.addEventListener('click', () => toggleSidebar());
  // Aide contextuelle : fiches de la page affichée
  document.getElementById('helpBtn')?.addEventListener('click', () => {
    const current = document.querySelector('.content-section.active')?.id || '';
    goTo('aide');
    openAideForPage(current);
  });
  document.getElementById('sidebarScrim')?.addEventListener('click', () => toggleSidebar(false));
}

// Restauration encadrée : fichier vérifié (format, version, empreinte, structure), établissement comparé, doublon
// détecté, confirmation explicite avec mot de passe d'un super administrateur, copie de sécurité et fichier de
// sauvegarde des données actuelles AVANT le remplacement. En cas d'échec, rien n'est modifié.
async function restaurerDepuisFichier(file) {
  if (!can('admin')) { ko('Restauration réservée aux administrateurs.'); return; }
  let archive;
  try { archive = await lireFichier(file); } catch (error) {
    logOperation(appState, 'restauration', `Fichier « ${file.name} » refusé : ${error.message}`); saveState(appState);
    ko(`Restauration refusée : ${error.message}`); return;
  }
  if (archive.type === 'parametres') {
    await runOperation({
      title: 'Importer des paramètres', message: `Appliquer les paramètres de « ${archive.etablissementNom || file.name} » (identité, en-tête, catégories, règles, comptes manquants) ? Aucune donnée scolaire ni financière n’est modifiée.`, confirmLabel: 'Appliquer', admin: true,
      exec: () => { const r = appliquerParametres(appState, archive.data); replaceState(migrateState(appState)); logOperation(appState, 'restauration', `Paramètres importés depuis ${file.name} (${r.comptesAjoutes} compte(s) ajouté(s))`, 0, { cible: file.name }); return true; },
      success: 'Paramètres appliqués', failure: 'Import des paramètres impossible'
    });
    return;
  }
  if (empreinteDonnees(archive.data) === empreinteDonnees(appState)) { ok('Ce fichier contient exactement les données actuelles : rien à restaurer.'); return; }
  const autreEtablissement = archive.etablissementId && archive.etablissementId !== appState.config.etablissementId;
  const r = { eleves: archive.data.eleves.length, paiements: archive.data.paiements.length, depenses: archive.data.depenses.length };
  const before = structuredClone(appState);
  const done = await runOperation({
    title: autreEtablissement ? 'Restaurer les données d’un AUTRE établissement' : 'Restaurer une sauvegarde',
    message: `${autreEtablissement ? `Ce fichier appartient à un autre établissement (« ${archive.etablissementNom || 'sans nom'} »). Les comptes de ce poste y seront rattachés. ` : ''}Remplacer TOUTES les données actuelles (${appState.eleves.length} élève(s), ${appState.paiements.length} paiement(s)) par « ${file.name} » (${r.eleves} élève(s), ${r.paiements} paiement(s), ${r.depenses} dépense(s)${archive.legacy ? ', ancien format sans empreinte' : `, format ${archive.version}, intégrité vérifiée`}) ? Une copie de sécurité des données actuelles est créée avant.`,
    confirmLabel: 'Restaurer', danger: true, superadmin: true, reauth: true,
    fields: [{ name: 'phrase', label: 'Tapez RESTAURER pour confirmer', required: true }],
    exec: (phrase) => {
      if (String(phrase).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() !== 'RESTAURER') throw new Error('mot de confirmation incorrect');
      createSafetyBackup(appState, `Avant restauration de ${file.name}`, currentUser()?.nom);
      const journalAvant = appState.journal;
      replaceState(archive.data);
      if (autreEtablissement) rattacherComptes(appState.config.etablissementId);
      definirEtablissement(appState.config.etablissementId);
      logOperation(appState, 'restauration', `Restauration de « ${file.name} »${archive.legacy ? ' (ancien format)' : ` (empreinte ${archive.empreinte.slice(0, 12)}…)`}${autreEtablissement ? ' — données d’un autre établissement' : ''} ; ${journalAvant.length} ligne(s) du journal précédent conservées dans la copie de sécurité`, 0, { cible: file.name, avant: { eleves: before.eleves.length, paiements: before.paiements.length }, apres: r });
      return true;
    },
    success: 'Données restaurées (copie de sécurité des données précédentes conservée)', failure: 'Restauration impossible — aucune donnée modifiée'
  });
  if (done) { await backupFileBefore('avant-restauration', before); await flushBackup(appState); }
}

function toggleSidebar(force) {
  const open = force === undefined ? !document.body.classList.contains('sidebar-open') : force;
  document.body.classList.toggle('sidebar-open', open);
  document.getElementById('menuToggle')?.setAttribute('aria-expanded', String(open));
}

// ---------- Fichier de données permanent ----------
const resumeDonnees = (data) => ({ eleves: (data.eleves || []).length, inscriptions: (data.inscriptions || []).length, paiements: (data.paiements || []).length, depenses: (data.depenses || []).length });
const resumeTexte = (data) => { const r = resumeDonnees(data); return `${r.eleves} élève(s), ${r.inscriptions} inscription(s), ${r.paiements} paiement(s), ${r.depenses} dépense(s)`; };

// Pastille de la barre latérale et encadré de la configuration : état du fichier de données
function renderDataFileChip(b = backupStatus()) {
  const chip = document.getElementById('dataFileChip');
  if (chip) {
    chip.hidden = false;
    if (b.needsPermission) {
      chip.className = 'datafile-chip warn';
      chip.dataset.do = 'reconnect';
      chip.innerHTML = `<b>⚠ Fichier de données à reconnecter</b>Cliquez pour autoriser l’accès au dossier « ${escapeHtml(b.folderName)} »`;
    } else if (b.linked) {
      chip.className = `datafile-chip ${b.error ? 'warn' : 'ok'}`;
      chip.dataset.do = 'config';
      chip.innerHTML = `<b>💾 ${escapeHtml(b.mode === 'dossier' ? DATA_FILE_NAME : b.folderName)}</b>${b.error ? `⚠ ${escapeHtml(b.error)}` : b.lastAt ? `Enregistré automatiquement à ${escapeHtml(b.lastAt)}` : `Dossier « ${escapeHtml(b.folderName)} »`}`;
    } else if (can('admin')) {
      chip.className = 'datafile-chip warn';
      chip.dataset.do = b.supported ? 'link' : 'config';
      chip.innerHTML = `<b>💾 Aucun fichier de données</b>${b.supported ? 'Cliquez pour le créer' : 'Navigateur non compatible : utilisez Chrome ou Edge'}`;
    } else chip.hidden = true;
    // Barre réduite : seule l'icône reste visible, le détail passe en infobulle
    chip.dataset.icone = b.needsPermission || !b.linked || b.error ? '⚠' : '💾';
    chip.title = chip.textContent.trim();
  }
  const panel = document.querySelector('[data-datafile-status]');
  if (panel) panel.innerHTML = dataFileStatusHtml(b);
}

// Copie de sauvegarde datée : dans le dossier lié (sous-dossier « sauvegardes »), sinon téléchargée
async function backupFileBefore(motif, snapshot = appState) {
  const name = backupFileName(motif);
  try {
    const path = await writeBackupFile(snapshot, name);
    if (path) return path;
  } catch (error) { console.error('Sauvegarde dans le dossier impossible', error); }
  try { exportStateToFile(snapshot, name); return `Téléchargements/${name}`; } catch (error) { return ''; }
}

async function linkDataFolderFlow({ first = false } = {}) {
  let res;
  try { res = await linkDataFolder(); } catch (error) {
    if (error?.name === 'AbortError') { if (first) ok('Vous pourrez créer le fichier de données plus tard : Sauvegardes et restauration.'); return false; }
    ko(error.message);
    return false;
  }
  blockBackup(true);
  try {
    if (res.existing) {
      const choice = await confirmDialog({
        title: 'Fichier de données existant',
        message: `Le dossier « ${res.name} » contient déjà ${DATA_FILE_NAME} (enregistré le ${new Date(res.existing.date).toLocaleString('fr-FR')} : ${resumeTexte(res.existing.data)}). Données actuelles : ${resumeTexte(appState)}.`,
        confirmLabel: 'Valider',
        fields: [{ name: 'choix', label: 'Que faire ?', value: first && stateWasCreated() ? 'charger' : 'garder', options: [['charger', 'Charger les données du fichier (les données actuelles sont sauvegardées avant)'], ['garder', 'Garder les données actuelles (l’ancien fichier est copié dans « sauvegardes »)']] }]
      });
      if (!choice.ok) { await unlinkDataFolder(); ko('Dossier non lié : aucun fichier modifié.'); return false; }
      if (choice.values.choix === 'charger') {
        await backupFileBefore('avant-chargement-du-fichier');
        createSafetyBackup(appState, `Avant chargement de ${DATA_FILE_NAME}`, currentUser()?.nom);
        replaceState(migrateState(res.existing.data));
        logOperation(appState, 'sauvegarde', `Données chargées depuis ${res.name}/${DATA_FILE_NAME}`);
      } else {
        await writeBackupFile(res.existing.data, backupFileName('ancien-fichier'));
      }
    }
    logOperation(appState, 'sauvegarde', `Fichier de données lié : ${res.name}/${DATA_FILE_NAME}`);
  } finally { blockBackup(false); }
  updateAndRender();
  await flushBackup(appState);
  const b = backupStatus();
  if (b.error) ko(`Fichier lié, mais écriture impossible : ${b.error}`);
  else ok(`Fichier de données créé et lié : ${res.name}/${DATA_FILE_NAME} — enregistrement automatique activé`);
  return true;
}

// Le navigateur ne contenait aucune donnée mais le fichier lié en contient : proposer de les recharger
let restoreOffered = false;
async function offerRestoreFromFile() {
  if (!stateWasCreated() || restoreOffered) { blockBackup(false); return false; }
  const found = await readLinkedData();
  restoreOffered = true;
  const r = found ? resumeDonnees(found.data) : null;
  if (!r || (!r.eleves && !r.inscriptions && !r.paiements && !r.depenses)) { blockBackup(false); return false; }
  const answer = await confirmDialog({
    title: 'Recharger les données du fichier',
    message: `Le navigateur ne contient aucune donnée, mais le fichier de données lié en contient (enregistré le ${new Date(found.date).toLocaleString('fr-FR')} : ${resumeTexte(found.data)}). Les recharger ?`,
    confirmLabel: 'Recharger les données'
  });
  if (answer.ok) {
    replaceState(migrateState(found.data));
    logOperation(appState, 'sauvegarde', `Données rechargées depuis ${DATA_FILE_NAME}`);
  } else {
    // Le fichier va être réécrit : son contenu est d'abord conservé dans « sauvegardes »
    await backupFileBefore('fichier-non-recharge', found.data);
  }
  blockBackup(false);
  updateAndRender();
  await flushBackup(appState);
  if (answer.ok) ok('Données rechargées depuis le fichier de données');
  return answer.ok;
}

async function reconnectFlow() {
  let granted = false;
  try { granted = await reconnectDataFolder(); } catch (error) { granted = false; }
  if (!granted) { ko('Accès au dossier non autorisé : le fichier de données n’est pas mis à jour.'); return; }
  await offerRestoreFromFile();
  await flushBackup(appState);
  ok('Fichier de données reconnecté — enregistrement automatique repris');
}

// Toute première ouverture (administrateur) : création du fichier de données dans un dossier choisi
async function firstOpenDataFile() {
  if (!can('admin') || dataFilePrompted()) return;
  const b = backupStatus();
  markDataFilePrompted();
  if (b.linked || b.needsPermission) return;
  if (!b.supported) { ko('Ce navigateur ne peut pas lier un fichier de données : utilisez Chrome ou Edge (ou l’export manuel).'); return; }
  const answer = await confirmDialog({
    title: 'Créer le fichier de données',
    message: `Première ouverture : choisissez un dossier (par exemple Documents). L’application y crée le fichier « ${DATA_FILE_NAME} » et l’enregistre automatiquement après chaque opération. Ce lien est permanent : il reste en place après une réinitialisation, et chaque réinitialisation crée automatiquement un fichier de sauvegarde dans le sous-dossier « sauvegardes ».`,
    confirmLabel: 'Choisir le dossier et créer le fichier'
  });
  if (!answer.ok) { ok('Vous pourrez créer le fichier de données plus tard : Sauvegardes et restauration.'); return; }
  await linkDataFolderFlow({ first: true });
}

async function startDataFile() {
  onBackupStatus((b) => renderDataFileChip(b));
  if (stateWasCreated()) blockBackup(true); // rien n'est écrit avant d'avoir proposé de recharger le fichier
  const b = await initAutoBackup();
  if (b.linked) await offerRestoreFromFile();
  else if (!b.needsPermission) blockBackup(false);
  if (b.needsPermission) ko(`Fichier de données : cliquez sur « Fichier de données à reconnecter » (barre latérale) pour reprendre l’enregistrement automatique dans « ${b.folderName} ».`);
  scheduleBackup(appState);
  await firstOpenDataFile();
}

// Réinitialisation complète : administrateur authentifié + mot de passe + mot de confirmation, copie de sécurité obligatoire
async function resetAllData() {
  if (!can('superadmin')) { ko('Réinitialisation réservée au super administrateur.'); return; }
  const answer = await confirmDialog({
    title: 'Réinitialiser toutes les données',
    message: `TOUTES les données seront effacées : établissement et paramètres, comptes financiers, années, classes, tarifs, élèves, paiements, dépenses, caisse, paie et journal. Les ${publicUsers().filter((u) => !u.proprietaire && u.role !== 'superadmin').length} compte(s) utilisateur seront SUPPRIMÉS (ils ne figurent pas dans les sauvegardes) ; seuls les super administrateurs sont conservés. Une copie de sécurité et un fichier de sauvegarde des données sont créés avant l’effacement.`,
    confirmLabel: 'Effacer les données', danger: true,
    fields: [
      { name: 'password', label: 'Votre mot de passe de super administrateur', type: 'password', required: true },
      { name: 'phrase', label: 'Tapez RÉINITIALISER pour confirmer', required: true },
      { name: 'purge', label: 'Supprimer aussi les anciennes copies de sécurité (la copie créée maintenant est toujours conservée)', type: 'checkbox' }
    ]
  });
  if (!answer.ok) return;
  const me = currentUser();
  const check = authenticate(me.username, answer.values.password);
  if (!check.ok || check.user.id !== me.id) { ko('Mot de passe incorrect : réinitialisation annulée.'); return; }
  const phrase = String(answer.values.phrase).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (phrase !== 'REINITIALISER') { ko('Mot de confirmation incorrect : réinitialisation annulée.'); return; }
  let backup;
  try { backup = createSafetyBackup(appState, 'Avant réinitialisation complète', me.nom); } catch (error) {
    ko(`Copie de sécurité impossible (${error.message}) : réinitialisation annulée, aucune donnée effacée.`);
    return;
  }
  // Fichier de sauvegarde automatique (dossier de données lié, sinon téléchargement) AVANT tout effacement
  const fichier = await backupFileBefore('avant-reinitialisation');
  if (answer.values.purge) listSafetyBackups().filter((b) => b.id !== backup.id).forEach((b) => deleteSafetyBackup(b.id));
  replaceState(blankState(appState));
  // Comptes utilisateurs : seuls les super administrateurs (et le compte de l'éditeur) sont conservés
  const comptesSupprimes = supprimerComptesNonSuperAdmin();
  logOperation(appState, 'reinitialisation', `Réinitialisation complète par ${me.nom} : toutes les données effacées, ${comptesSupprimes.length} compte(s) utilisateur supprimé(s) (copie de sécurité n°${backup.id}${fichier ? ` · fichier ${fichier}` : ''})`);
  resetDepenseFilters(appState);
  dashboardFilters.classId = 0;
  updateAndRender();
  // Le fichier de données reste lié : il reçoit immédiatement l'état réinitialisé
  await flushBackup(appState);
  ok(`Données réinitialisées — sauvegarde créée : ${fichier || 'copie de sécurité dans Sauvegardes et restauration'}`);
}

// Liste de classes dépendante de l'année et de la catégorie choisies dans le même formulaire
function refreshClassList(form, listId) {
  const list = document.getElementById(listId);
  if (!list || !form) return;
  const yearSelect = form.querySelector('[data-year-for]');
  const yearId = yearSelect ? Number(yearSelect.value) : appState.anneeActiveId;
  const category = form.querySelector('[data-cat-for]')?.value || '';
  list.innerHTML = appState.classes
    .filter((c) => c.anneeId === yearId && (!category || c.categorie === category))
    .map((c) => `<option value="${c.nom.replace(/"/g, '&quot;')}"></option>`).join('');
  const input = form.querySelector('[name="classeText"]');
  if (input) input.value = '';
}

// Après l'ajout d'une classe : page des frais déjà remplie (année, catégorie, classe), curseur sur le montant annuel
function redirectToTarif(classe) {
  goTo('tarifs');
  const form = ouvrirFormulaire(document.querySelector('#tarifs form[data-form="tarif"]'));
  if (!form) return;
  form.querySelector('[name="anneeId"]').value = String(classe.anneeId);
  const category = form.querySelector('[data-cat-for]');
  if (category) category.value = classe.categorie;
  refreshClassList(form, 'tarif-classes');
  form.querySelector('[name="classeText"]').value = classe.nom;
  fillTarifDates(form);
  const existing = appState.tarifs.find((t) => t.classeId === classe.id && t.anneeId === classe.anneeId);
  if (existing) ko('Des frais existent déjà pour cette classe : utilisez « Modifier » dans la liste.');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector('[name="montantAnnuel"]')?.focus();
}

// Après une inscription : page des paiements avec l'élève, sa classe et son échéancier déjà affichés
function redirectToPayment(inscription) {
  const eleve = appState.eleves.find((e) => e.id === inscription.eleveId);
  if (!eleve) return;
  const hasTarif = appState.tarifs.some((t) => t.classeId === inscription.classeId && t.anneeId === inscription.anneeId);
  if (!hasTarif && !(inscription.echeances || []).length) {
    ko('Aucun frais configuré pour cette classe : définissez d’abord ses tarifs.');
    const classe = appState.classes.find((c) => c.id === inscription.classeId);
    if (classe) redirectToTarif(classe);
    return;
  }
  goTo('paiements');
  if (!selectStudentForPayment(appState, inscription.id)) return;
  const form = ouvrirFormulaire(document.querySelector('#paiements form[data-form="paiement"]'));
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector('[name="montant"]')?.focus();
}

function redirectToEnrollment(eleve) {
  goTo('inscriptions');
  const form = ouvrirFormulaire(document.querySelector('#inscriptions form[data-form="inscription"]'));
  if (!form) return;
  form.querySelector('[name="eleveText"]').value = studentLabel(eleve);
  const classe = appState.classes.find((c) => c.id === eleve.classeId && c.anneeId === appState.anneeActiveId);
  form.querySelector('[name="classeText"]').value = classe ? classe.nom : '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector(classe ? 'button[type="submit"]' : '[name="classeText"]')?.focus();
}

async function submitAnnee(form, formData) {
  const payload = { cleLicence: String(formData.get('cleLicence') || '').trim(), annee: String(formData.get('annee') || '').trim(), dateDebut: formData.get('dateDebut'), dateFin: formData.get('dateFin'), statut: formData.get('statut') || 'preparation', soldeInitial: Number(formData.get('soldeInitial') || 0), fraisInscription: Number(formData.get('fraisInscription') || 0), fraisReinscription: Number(formData.get('fraisReinscription') || 0) };
  if (payload.dateDebut && payload.dateFin && payload.dateFin <= payload.dateDebut) { ko('La date de fin doit suivre la date de rentrée.'); return; }
  if (payload.soldeInitial < 0) { ko('Le solde d’ouverture ne peut pas être négatif.'); return; }
  if ([payload.fraisInscription, payload.fraisReinscription].some((v) => v < 0 || !Number.isInteger(v))) { ko('Les frais d’inscription et de réinscription doivent être des montants entiers positifs.'); return; }
  const editId = Number(form.dataset.editId || 0);
  // Reconduction (création uniquement) : classes, programmes, frais, affectations de l'année choisie
  const sourceId = editId ? 0 : Number(formData.get('reconduireDepuis') || 0);
  const options = Object.fromEntries(OPTIONS_RECONDUCTION.map(([k]) => [k, formData.get(`reconduire_${k}`) === 'on']));
  let bilan = null;
  const done = await runOperation({
    title: editId ? 'Modifier l’année scolaire' : 'Ajouter l’année scolaire', silent: true,
    admin: Boolean(editId), adminReason: 'La modification d’une année scolaire est réservée à l’administrateur.',
    exec: () => {
      const item = editId ? updateAnnee(appState, editId, payload) : createAnnee(appState, payload);
      if (item) logOperation(appState, 'annee', `${editId ? 'Modification' : 'Création'} de l’année ${item.annee}${item.licence && !editId ? ` — clé de licence n° ${item.licence.n} consommée (empreinte ${item.licence.empreinte})` : ''}`, 0, { cible: item.annee });
      if (item && sourceId) {
        bilan = reconduire(appState, { sourceId, cibleId: item.id, ...options });
        logOperation(appState, 'annee', `Reconduction ${appState.annees.find((a) => a.id === sourceId)?.annee} → ${item.annee} : ${texteBilan(bilan)}`);
      }
      return item;
    },
    success: editId ? 'Année modifiée' : 'Année ajoutée — clé de licence consommée', failure: 'Année refusée'
  });
  if (!done) return;
  resetForm(document.querySelector('form[data-form="annee"]'));
  if (bilan) ok(`Année ${payload.annee} créée — reconduction : ${texteBilan(bilan)}${bilan.ignores.length ? ` (${bilan.ignores.length} affectation(s) ignorée(s))` : ''}`);
}

// Reconduction à la demande vers une année existante (ce qui existe déjà n'est jamais dupliqué)
async function reconduireVers(annee) {
  const precedente = anneePrecedente(appState, annee.id);
  const autres = appState.annees.filter((a) => a.id !== annee.id);
  if (!autres.length) { ko('Aucune autre année à reconduire.'); return; }
  const source = precedente || autres[0];
  const a = apercuReconduction(appState, source.id, annee.id);
  await runOperation({
    title: `Reconduire vers ${annee.annee}`, confirmLabel: 'Reconduire', admin: true, adminReason: 'La reconduction d’une année est réservée à l’administrateur.',
    message: `Copier les données de référence de l’année choisie vers ${annee.annee}. Depuis ${source.annee} : ${a.classes} classe(s) dont ${a.nouvellesClasses} à créer, ${a.programmes} programme(s), ${a.tarifs} tarif(s), ${a.affectations} affectation(s). Rien n’est dupliqué et aucune opération (inscription, paiement, dette…) n’est copiée.`,
    fields: [{ name: 'source', label: 'Depuis l’année', options: autres.map((y) => [y.id, y.annee]), value: source.id },
      ...OPTIONS_RECONDUCTION.map(([k, l]) => ({ name: k, label: l, type: 'checkbox', checked: k !== 'affectations' }))],
    exec: (_, v) => {
      const bilan = reconduire(appState, { sourceId: Number(v.source), cibleId: annee.id, classes: v.classes, programmes: v.programmes, tarifs: v.tarifs, affectations: v.affectations });
      logOperation(appState, 'annee', `Reconduction vers ${annee.annee} : ${texteBilan(bilan)}`);
      setTimeout(() => ok(`Reconduction terminée : ${texteBilan(bilan)}`), 50);
      return true;
    },
    success: 'Reconduction effectuée', failure: 'Reconduction impossible'
  });
}

async function submitClasse(form, formData) {
  const payload = {
    nom: formData.get('nom'), categorie: formData.get('categorie'),
    anneeId: Number(formData.get('anneeId')), capacite: Number(formData.get('capacite') || 0)
  };
  const editId = Number(form.dataset.editId || 0);
  let savedClasse = null;
  const done = await runOperation({
    title: editId ? 'Modifier la classe' : 'Ajouter la classe', silent: true,
    exec: () => {
      const item = editId ? updateClasse(appState, editId, payload) : createClasse(appState, payload);
      savedClasse = item;
      if (item) logOperation(appState, 'classe', `${editId ? 'Modification' : 'Création'} de la classe ${item.nom}`);
      return item;
    },
    success: editId ? 'Classe modifiée' : 'Classe ajoutée — définissez maintenant ses frais', failure: 'Classe refusée : nom vide ou déjà utilisé pour cette année'
  });
  if (!done) return;
  resetForm(document.querySelector('form[data-form="classe"]'));
  if (!editId && savedClasse) redirectToTarif(savedClasse);
}

async function submitEleve(form, formData) {
  const classText = String(formData.get('classeText') || '').trim();
  const classe = classText ? findByName(classesOfActiveYear(), classText) : null;
  if (classText && !classe) { ko('Classe introuvable pour l’année active : choisissez-la dans les suggestions.'); return; }
  const payload = {
    matricule: formData.get('matricule'), nom: formData.get('nom'), prenom: formData.get('prenom'), sexe: formData.get('sexe'),
    dateNaissance: formData.get('dateNaissance'), telephone: formData.get('telephone'), email: formData.get('email'),
    adresse: formData.get('adresse'), classeId: classe ? classe.id : 0
  };
  const responsable = {
    contactId: formData.get('contactId'), nom: formData.get('parentNom'), prenom: formData.get('parentPrenom'), lien: formData.get('parentLien'),
    telephone: formData.get('parentTel'), telephone2: formData.get('parentTel2'), adresse: formData.get('parentAdresse'),
    urgenceNom: formData.get('urgenceNom') || '', urgenceTelephone: formData.get('urgenceTelephone') || ''
  };
  const editId = Number(form.dataset.editId || 0);
  let saved = null;
  const done = await runOperation({
    title: editId ? 'Modifier la fiche élève' : 'Ajouter l’élève', silent: true,
    exec: () => {
      saved = editId ? updateEleve(appState, editId, payload) : createEleve(appState, payload);
      if (saved) definirResponsable(appState, saved, responsable);
      if (saved) logOperation(appState, 'eleve', `${editId ? 'Modification' : 'Création'} de ${saved.prenom} ${saved.nom} (${saved.matricule})`);
      return saved;
    },
    success: editId ? 'Fiche élève modifiée' : 'Élève enregistré — poursuivez avec son inscription', failure: 'Fiche refusée : nom, prénom ou matricule invalide ou déjà utilisé'
  });
  if (!done) return;
  resetForm(document.querySelector('form[data-form="eleve"]'));
  if (!editId && saved) redirectToEnrollment(saved);
}

async function submitInscription(form, formData) {
  const anneeId = Number(formData.get('anneeId'));
  const eleve = findStudent(formData.get('eleveText'));
  const classe = findByName(appState.classes.filter((c) => c.anneeId === anneeId), formData.get('classeText'));
  if (!eleve) { ko('Élève introuvable : choisissez-le dans les suggestions.'); return; }
  if (!classe) { ko('Classe introuvable pour cette année scolaire.'); return; }
  let created = null;
  const done = await runOperation({
    title: 'Ajouter l’inscription', silent: true,
    exec: () => {
      const inscription = createInscription(appState, { eleveId: eleve.id, anneeId, classeId: classe.id, type: formData.get('type') || 'auto', statut: formData.get('statut') || 'inscrit' });
      if (!inscription) return false;
      const tarif = appState.tarifs.find((item) => item.anneeId === anneeId && item.classeId === classe.id);
      if (tarif) generateEcheancesForInscription(appState, inscription.id, tarif);
      eleve.classeId = classe.id;
      logOperation(appState, 'inscription', `${eleve.prenom} ${eleve.nom} inscrit en ${classe.nom}${tarif ? '' : ' (aucun tarif configuré)'}`);
      created = inscription;
      return inscription;
    },
    success: 'Inscription enregistrée — choisissez la modalité de règlement lors du premier paiement', failure: 'Inscription refusée : cet élève est déjà inscrit pour cette année'
  });
  if (done && created) redirectToPayment(created);
}

async function submitTarif(form, formData) {
  const anneeId = Number(formData.get('anneeId'));
  const annee = appState.annees.find((a) => a.id === anneeId);
  const classe = findByName(appState.classes.filter((c) => c.anneeId === anneeId), formData.get('classeText'));
  if (!classe) { ko('Classe introuvable pour cette année scolaire.'); return; }
  const annual = Number(formData.get('montantAnnuel') || 0);
  let amounts = [1, 2, 3].map((n) => Number(formData.get(`tranche${n}`) || 0));
  if (amounts.every((v) => !v)) amounts = autoTrancheMontants(annual, regleArrondi(appState.config, 'tranches'));
  if (amounts.reduce((a, b) => a + b, 0) !== annual) { ko('La somme des 3 tranches doit être égale au montant annuel.'); return; }
  const dates = [1, 2, 3].map((n) => formData.get(`dateTranche${n}`) || '');
  const editId = Number(form.dataset.editId || 0);
  const existing = appState.tarifs.find((t) => t.classeId === classe.id && t.anneeId === anneeId);
  if (!editId && existing) { ko('Un tarif existe déjà pour cette classe : utilisez « Modifier ».'); return; }

  const baseline = editId ? (appState.tarifs.find((t) => t.id === editId)?.tranches || []).map((t) => t.dateLimite) : autoTrancheDates(annee);
  const datesChanged = dates.some((d, i) => d && d !== (baseline[i] || ''));
  const monthlyRaw = String(formData.get('montantMensuel') ?? '').trim();
  const nbMois = Number(formData.get('nbMois') || 9);
  const montantMensuel = monthlyRaw === '' ? autoMontantMensuel(annual, nbMois, regleArrondi(appState.config, 'mensualites')) : Number(monthlyRaw);
  if (!annual || annual <= 0 || !Number.isInteger(annual)) { ko('Le montant annuel doit être un nombre entier supérieur à zéro.'); return; }
  if (!Number.isInteger(montantMensuel) || montantMensuel < 0) { ko('Le montant mensuel doit être un nombre entier positif (0 pour ne pas proposer le paiement mensuel).'); return; }
  if (!Number.isInteger(nbMois) || nbMois < 1 || nbMois > 12) { ko('Le nombre de mensualités doit être compris entre 1 et 12.'); return; }
  if (amounts.some((v) => v < 0 || !Number.isInteger(v))) { ko('Chaque tranche doit être un montant entier positif.'); return; }
  // Cohérence : un total mensuel différent du montant annuel est possible (frais majorés), mais doit être confirmé.
  // Un simple écart d'arrondi (absorbé par la dernière mensualité) est seulement signalé dans le récapitulatif.
  const gap = montantMensuel * nbMois - annual;
  if (montantMensuel > 0 && gap !== 0 && !ecartArrondi(montantMensuel, nbMois, annual, regleArrondi(appState.config, 'mensualites'))) {
    const confirmed = await confirmDialog({
      title: 'Montant mensuel différent du montant annuel',
      message: `En paiement mensuel, l’élève paiera ${nbMois} × ${formatMoney(montantMensuel)} = ${formatMoney(montantMensuel * nbMois)} ${appState.config.devise}, soit ${gap > 0 ? '+' : ''}${formatMoney(gap)} par rapport au montant annuel (${formatMoney(annual)}). Confirmer ce montant mensuel ?`,
      confirmLabel: 'Confirmer'
    });
    if (!confirmed.ok) return;
  }
  // Frais complémentaires : vide = frais de l'année ; annexes « Libellé = montant », une par ligne
  const optionnel = (name) => { const v = String(formData.get(name) ?? '').trim(); return v === '' ? null : Number(v); };
  const fraisInscription = optionnel('fraisInscription');
  const fraisReinscription = optionnel('fraisReinscription');
  if ([fraisInscription, fraisReinscription].some((v) => v !== null && (!Number.isInteger(v) || v < 0))) { ko('Les frais d’inscription et de réinscription doivent être des montants entiers positifs (ou vides).'); return; }
  const remiseMaxPct = Number(formData.get('remiseMaxPct') || 0);
  if (!Number.isFinite(remiseMaxPct) || remiseMaxPct < 0 || remiseMaxPct > 100) { ko('La remise maximale doit être comprise entre 0 et 100 %.'); return; }
  const annexesLignes = String(formData.get('fraisAnnexes') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fraisAnnexes = [];
  for (const ligne of annexesLignes) {
    const m = /^(.+?)\s*[=:]\s*([\d\s.]+)$/.exec(ligne);
    const montant = m ? Number(m[2].replace(/[\s.]/g, '')) : NaN;
    if (!m || !Number.isInteger(montant) || montant <= 0) { ko(`Frais annexe illisible : « ${ligne} ». Écrivez une ligne par frais, sous la forme « Libellé = montant ».`); return; }
    fraisAnnexes.push({ libelle: m[1].trim(), montant });
  }
  const payload = {
    classeId: classe.id, anneeId, montantAnnuel: annual, montantMensuel,
    nbMois, moisDebut: formData.get('moisDebut') || '',
    tranches: amounts.map((montant, i) => ({ num: i + 1, libelle: `${i === 0 ? '1ère' : `${i + 1}ème`} tranche`, montant, dateLimite: dates[i] })),
    fraisInscription, fraisReinscription, remiseMaxPct, fraisAnnexes
  };
  const concernes = editId ? inscriptionsDuTarif(appState, appState.tarifs.find((t) => t.id === editId)) : { sansPaiement: [], avecPaiement: [] };
  const done = await runOperation({
    title: editId ? 'Modifier les frais' : 'Ajouter les frais', permission: 'scolarite.parametrer', silent: !editId, admin: datesChanged || Boolean(editId),
    adminReason: 'La modification des montants et des dates d’échéance est réservée à l’administrateur.',
    message: `${editId ? 'Enregistrer les nouveaux frais' : 'Enregistrer les frais'} de ${classe.nom} : ${formatMoney(annual)} ${appState.config.devise} en 3 tranches${montantMensuel ? ` ou ${nbMois} × ${formatMoney(montantMensuel)} par mois` : ''}${fraisAnnexes.length ? `, plus ${fraisAnnexes.length} frais annexe(s)` : ''} ?${editId && concernes.avecPaiement.length ? ` Les ${concernes.avecPaiement.length} élève(s) ayant déjà payé gardent leur engagement actuel (aucune modification rétroactive).` : ''} La version précédente reste dans l’historique du tarif.`,
    fields: editId && concernes.sansPaiement.length ? [{ name: 'propager', type: 'checkbox', checked: true, label: `Appliquer aussi le nouveau tarif aux ${concernes.sansPaiement.length} élève(s) inscrit(s) qui n’ont encore rien payé` }] : null,
    exec: (_value, values = {}) => {
      const item = editId ? updateTarif(appState, editId, payload) : createTarif(appState, payload);
      if (!item) return false;
      // Nouveau tarif : les élèves déjà inscrits sans paiement reçoivent leur échéancier. Modification : sur demande seulement.
      const result = !editId || values.propager ? propagateTarif(appState, item) : { misesAJour: 0, preservees: inscriptionsDuTarif(appState, item).avecPaiement.length };
      logOperation(appState, 'tarif', `Frais de ${classe.nom} ${editId ? 'modifiés' : 'configurés'} (${result.misesAJour} échéancier(s) réaligné(s), ${result.preservees} engagement(s) conservé(s))`, annual);
      return item;
    },
    success: editId ? 'Tarif modifié — version précédente historisée' : 'Frais enregistrés', failure: 'Frais refusés'
  });
  if (done) resetForm(document.querySelector('form[data-form="tarif"]'));
}

async function submitPaiement(form, formData) {
  const payload = {
    inscriptionId: Number(formData.get('inscriptionId')), montant: Number(formData.get('montant')),
    mode: formData.get('mode') || 'espece', reference: String(formData.get('reference') || '').trim(), payeur: String(formData.get('payeur') || '').trim(),
    motifPaiement: String(formData.get('motifPaiement') || '').trim(), modalite: formData.get('modalite') || '', reliquatId: Number(formData.get('reliquatId') || 0),
    datePaiement: formData.get('datePaiement') || '', token: formData.get('token') || '',
    compteId: Number(formData.get('compteId') || 0), observation: String(formData.get('observation') || '').trim()
  };
  // Chèque non crédité, virement annoncé : enregistré en attente, hors totaux jusqu'à confirmation
  if (formData.get('enAttente') === 'on') {
    const attente = validateAttente(appState, payload);
    if (!attente.ok) { ko(attente.message); return; }
    const fait = await runOperation({
      title: 'Règlement en attente', silent: true, permission: 'paiements.encaisser',
      exec: () => enregistrerAttente(appState, payload),
      success: 'Règlement enregistré en attente de confirmation — il sera compté dès son encaissement confirmé', failure: 'Règlement non enregistré'
    });
    if (fait) goTo('paiements');
    return;
  }
  const check = validatePaiement(appState, payload);
  if (!check.ok) {
    if (!check.duplicate) { ko(check.message); return; }
    const again = await confirmDialog({ title: 'Doublon possible', message: `${check.message} Enregistrer quand même ?`, confirmLabel: 'Enregistrer', danger: true });
    if (!again.ok) return;
    payload.token = '';
    payload.ignoreDuplicate = true;
  }
  let created = null;
  const done = await runOperation({
    title: 'Enregistrer le paiement', silent: true, permission: 'paiements.encaisser',
    exec: () => { created = createPaiement(appState, payload, { ignoreDuplicate: Boolean(payload.ignoreDuplicate) }); return created; },
    success: 'Paiement enregistré et réparti automatiquement — soldes et statuts mis à jour', failure: 'Paiement non enregistré'
  });
  // Reçu affiché automatiquement, uniquement si le paiement a réellement été enregistré
  if (done && created) showReceiptPreview(appState, created.id);
}

async function submitDepense(form, formData) {
  const editId = Number(form.dataset.editId || 0);
  const payload = {
    anneeId: Number(formData.get('anneeId')), date: formData.get('date') || todayISO(), categorie: formData.get('categorie'), montant: Number(formData.get('montant')),
    description: formData.get('description'), beneficiaire: formData.get('beneficiaire'), demandeur: formData.get('demandeur'), reference: formData.get('reference'), mode: formData.get('mode') || 'espece',
    compteId: Number(formData.get('compteId') || 0), observation: String(formData.get('observation') || '').trim(),
    token: formData.get('token') || ''
  };
  try { payload.piece = await readPiece(formData.get('piece')?.size ? formData.get('piece') : null); } catch (error) { ko(error.message); return; }
  const check = validateDepense(appState, editId ? { ...payload, token: '' } : payload);
  if (!check.ok && !(editId && check.duplicate)) {
    if (!check.duplicate) { ko(check.message); return; }
    const again = await confirmDialog({ title: 'Doublon possible', message: `${check.message} Enregistrer quand même ?`, confirmLabel: 'Enregistrer', danger: true });
    if (!again.ok) return;
    payload.token = '';
  }
  let created = null;
  const done = await runOperation({
    title: editId ? 'Corriger la dépense' : 'Enregistrer la dépense', silent: !editId, permission: editId ? 'depenses.corriger' : 'depenses.saisir',
    message: 'L’état précédent de la dépense est conservé dans son historique.', confirmLabel: 'Enregistrer la correction',
    field: editId ? { label: 'Motif de la correction (obligatoire)', required: true } : null,
    exec: (motif) => { created = editId ? updateDepense(appState, editId, { ...payload, motifCorrection: motif }) : createDepense(appState, payload, { ignoreDuplicate: !payload.token }); return created; },
    success: editId ? 'Dépense corrigée (historique conservé)' : 'Dépense enregistrée — solde de caisse mis à jour', failure: 'Dépense non enregistrée'
  });
  if (!done) return;
  resetForm(document.querySelector('form[data-form="depense"]'));
  if (!editId && created) showExpenseReceiptPreview(appState, created.id);
}

// ---------- Comptes financiers, catégories, virements internes, dépenses récurrentes ----------
async function submitCompte(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  const editId = Number(form.dataset.editId || 0);
  const payload = { libelle: formData.get('libelle'), type: formData.get('type'), numero: formData.get('numero'), soldeInitial: Number(formData.get('soldeInitial') || 0) };
  const done = await runOperation({
    title: editId ? 'Modifier le compte' : 'Créer le compte', silent: !editId, admin: true,
    message: 'L’ancienne valeur (dont le solde initial) reste tracée dans l’historique du compte.',
    exec: () => (editId ? updateCompte(appState, editId, payload) : createCompte(appState, payload)),
    success: editId ? 'Compte modifié' : 'Compte créé', failure: 'Compte refusé'
  });
  if (done) resetForm(form);
}

async function submitReferentiels(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  const lignes = (name) => String(formData.get(name) || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  await runOperation({
    title: 'Catégories', silent: true, admin: true,
    exec: () => {
      setCategories(appState, lignes('categories'));
      setCategoriesDepense(appState, lignes('categoriesDepense'));
      logOperation(appState, 'config', `Catégories mises à jour (${appState.config.categories.length} d’enseignement, ${appState.config.categoriesDepense.length} de dépenses)`);
      return true;
    },
    success: 'Catégories enregistrées', failure: 'Catégories refusées'
  });
}

async function submitVirement(form, formData) {
  const payload = { deId: Number(formData.get('deId')), versId: Number(formData.get('versId')), montant: Number(formData.get('montant')), date: formData.get('date') || todayISO(), motif: formData.get('motif'), reference: formData.get('reference'), token: formData.get('token') || '' };
  const check = validateVirement(appState, payload);
  if (!check.ok) { ko(check.message); return; }
  await runOperation({
    title: 'Virement interne', permission: 'tresorerie.virements', message: `Transférer ${formatMoney(payload.montant)} ${appState.config.devise} de « ${compteOf(appState, payload.deId)?.libelle} » vers « ${compteOf(appState, payload.versId)?.libelle} » ?`, confirmLabel: 'Enregistrer le virement',
    exec: () => createVirement(appState, payload), success: 'Virement enregistré — soldes des comptes mis à jour', failure: 'Virement refusé'
  });
}

async function submitRecurrente(form, formData) {
  const payload = Object.fromEntries(['libelle', 'categorie', 'montant', 'beneficiaire', 'frequence', 'jour', 'dateDebut', 'dateFin', 'mode', 'compteId'].map((k) => [k, formData.get(k) ?? '']));
  const done = await runOperation({ title: 'Dépense récurrente', silent: true, permission: 'depenses.saisir', exec: () => createRecurrente(appState, payload), success: 'Dépense récurrente créée : ses échéances seront signalées', failure: 'Dépense récurrente refusée' });
  if (done) resetForm(form);
}

// ---------- Licences ----------
async function submitVerifierLicence(form, formData) {
  try {
    const r = verifierCle(appState, formData.get('cle'));
    logOperation(appState, 'licence', `Vérification d’une clé de licence : ${r.valide ? `clé n° ${r.n} valide` : 'refusée'}`);
    saveState(appState);
    if (r.valide) ok(r.message); else ko(r.message);
  } catch (error) { ko(error.message); }
}

async function submitAjouterLicence(form, formData) {
  let ajout = null;
  const done = await runOperation({
    title: 'Ajouter une clé de licence', silent: true, superadmin: true,
    exec: () => { ajout = ajouterCle(appState, Object.fromEntries(['cle', 'libelle', 'etablissement', 'expireLe', 'notes'].map((k) => [k, formData.get(k) || '']))); logOperation(appState, 'licence', `Clé de licence n° ${ajout.n} ajoutée (empreinte ${ajout.empreinte})`, 0, { cible: `Licence ${ajout.n}` }); return ajout; },
    success: 'Clé ajoutée au catalogue', failure: 'Clé refusée'
  });
  // La clé en clair n'est montrée qu'une seule fois : elle n'est enregistrée nulle part
  if (done && ajout) await confirmDialog({ title: `Clé de licence n° ${ajout.n}`, message: `Notez cette clé maintenant et transmettez-la à l’établissement : elle ne sera plus jamais affichée. ${ajout.cle}`, confirmLabel: 'J’ai noté la clé' });
}

// ---------- Caisse, rapprochements, budget ----------
async function submitOuvertureCaisse(form, formData) {
  await runOperation({
    title: 'Ouvrir la caisse', silent: true, permission: 'caisse.operer',
    exec: () => ouvrirCaisse(appState, { compteId: Number(formData.get('compteId')), date: formData.get('date') || todayISO(), montantCompte: formData.get('montantCompte'), justification: formData.get('justification') }),
    success: 'Caisse ouverte — fond de caisse consigné', failure: 'Ouverture refusée'
  });
}

async function submitFermetureCaisse(form, formData) {
  const session = (appState.sessionsCaisse || []).find((s) => s.id === Number(formData.get('sessionId')));
  if (!session) return;
  let fermee = null;
  const done = await runOperation({
    title: 'Fermer la caisse', permission: 'caisse.operer', confirmLabel: 'Fermer et verrouiller la journée',
    message: `Fermer la journée du ${session.date.split('-').reverse().join('/')} ? Les opérations de cette caisse jusqu’à cette date seront verrouillées (seule une réouverture motivée permettra de les modifier).`,
    exec: () => { fermee = fermerCaisse(appState, session.id, { montantCompte: formData.get('montantCompte'), justification: formData.get('justification'), billetage: formData.get('billetage') }); return fermee; },
    success: 'Caisse fermée — procès-verbal disponible dans l’historique', failure: 'Fermeture refusée'
  });
  if (done && fermee && can('export')) printPvCloture(appState, fermee.id);
}

async function submitOptionCaisse(form, formData) {
  await runOperation({
    title: 'Option de caisse', silent: true, admin: true,
    exec: () => { const avant = appState.config.caisseObligatoire; appState.config.caisseObligatoire = formData.get('caisseObligatoire') === 'on'; logOperation(appState, 'config', `Caisse obligatoire : ${appState.config.caisseObligatoire ? 'activée' : 'désactivée'}`, 0, { cible: 'Option de caisse', avant: { caisseObligatoire: avant }, apres: { caisseObligatoire: appState.config.caisseObligatoire } }); return true; },
    success: 'Option enregistrée', failure: 'Option refusée'
  });
}

async function submitRapprochement(form, formData) {
  await runOperation({
    title: 'Rapprochement bancaire', silent: true, permission: 'caisse.operer',
    exec: () => rapprocher(appState, { compteId: Number(formData.get('compteId')), date: formData.get('date') || todayISO(), soldeReleve: formData.get('soldeReleve'), justification: formData.get('justification'), reference: formData.get('reference') }),
    success: 'Rapprochement enregistré', failure: 'Rapprochement refusé'
  });
}

async function submitBudget(form, formData) {
  const lignes = String(formData.get('depenses') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const depenses = [];
  for (const ligne of lignes) {
    const m = /^(.+?)\s*[=:]\s*([\d\s.]+)$/.exec(ligne);
    if (!m) { ko(`Ligne de budget illisible : « ${ligne} » (forme attendue : Catégorie = montant).`); return; }
    depenses.push({ categorie: m[1].trim(), montant: Number(m[2].replace(/[\s.]/g, '')) });
  }
  await runOperation({
    title: 'Budget prévisionnel', silent: true, permission: 'scolarite.parametrer',
    exec: () => enregistrerBudget(appState, Number(formData.get('anneeId')), { recettesScolarite: formData.get('recettesScolarite') || 0, autresRecettes: formData.get('autresRecettes') || 0, depenses }),
    success: 'Budget enregistré — comparaison prévu / réalisé mise à jour', failure: 'Budget refusé'
  });
}

// ---------- Règles d'arrondi des montants ----------
async function submitArrondis(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  const regles = normaliserArrondis(Object.fromEntries(['tranches', 'mensualites', 'avances'].map((k) => [k, { pas: Number(formData.get(`pas_${k}`)), sens: formData.get(`sens_${k}`) }])));
  await runOperation({
    title: 'Règles d’arrondi', silent: true,
    exec: () => { appState.config.arrondis = regles; logOperation(appState, 'config', `Arrondis : tranches ${regles.tranches.pas}, mensualités ${regles.mensualites.pas}, avances ${regles.avances.pas}`); return true; },
    success: 'Règles d’arrondi enregistrées', failure: 'Règles refusées'
  });
}

// ---------- Programme des classes (matières, coefficients, volume horaire) ----------
async function submitProgramme(form, formData) {
  const classeId = Number(form.dataset.classe);
  const classe = appState.classes.find((c) => c.id === classeId);
  const lignes = formData.getAll('matiere').map((id) => ({ matiereId: Number(id), coefficient: formData.get(`coef-${id}`) || 1, heuresHebdo: formData.get(`heures-${id}`) || 0 }));
  await runOperation({
    title: 'Programme de la classe', silent: true,
    exec: () => { const prog = definirProgramme(appState, classeId, lignes); logOperation(appState, 'classe', `Programme de ${classe?.nom} : ${prog.length} matière(s)`); return true; },
    success: `Programme de ${classe?.nom || 'la classe'} enregistré (${lignes.length} matière(s))`, failure: 'Programme refusé'
  });
}

// ---------- Rôles : modifiables à tout moment par l'administrateur ----------
function describeRole(role) {
  return `${role.pages.length} page(s), ${role.permissions.length} action(s) autorisée(s)${role.write ? '' : ' — lecture seule'}`;
}

async function submitRole(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  const id = String(formData.get('id') || '');
  try {
    const avant = roleOf(id);
    const role = saveRole({ id, label: formData.get('label'), pages: formData.getAll('pages'), permissions: formData.getAll('permissions') });
    logOperation(appState, 'role', `Rôle « ${role.label} » modifié (${describeRole(role)})`, 0, { cible: `Rôle ${role.label}`, avant: avant ? { pages: avant.pages, permissions: avant.permissions } : null, apres: { pages: role.pages, permissions: role.permissions } });
    updateAndRender();
    ok(`Rôle « ${role.label} » enregistré — appliqué immédiatement`);
  } catch (error) { ko(error.message); }
}

async function submitRoleNew(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  const modele = roleOf(String(formData.get('modele') || 'lecture')) || roleOf('lecture');
  try {
    const role = saveRole({ label: formData.get('label'), pages: modele.pages, permissions: modele.permissions });
    logOperation(appState, 'role', `Rôle « ${role.label} » créé à partir de « ${modele.label} »`);
    updateAndRender();
    document.querySelector(`#roles-panel form[data-form="role"] input[name="id"][value="${CSS.escape(role.id)}"]`)?.closest('form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ok(`Rôle « ${role.label} » créé : ajustez ses pages et ses droits puis enregistrez`);
  } catch (error) { ko(error.message); }
}

async function changeUserRole(select) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); updateAndRender(); return; }
  const user = publicUsers().find((u) => u.id === Number(select.dataset.userRole));
  if (!user || user.role === select.value) return;
  const answer = await confirmDialog({ title: 'Changer le rôle', message: `Attribuer le rôle « ${ROLES[select.value]} » à ${user.nom} (actuellement « ${ROLES[user.role]} ») ? Le changement s’applique immédiatement.`, confirmLabel: 'Changer le rôle' });
  if (!answer.ok) { select.value = user.role; return; }
  try {
    setUserRole(user.id, select.value);
    logOperation(appState, 'utilisateur', `Rôle de « ${user.username} » : ${ROLES[user.role]} → ${ROLES[select.value]}`);
    updateAndRender();
    ok(`${user.nom} a maintenant le rôle « ${ROLES[select.value]} »`);
  } catch (error) { select.value = user.role; ko(error.message); }
}

async function submitUtilisateur(form, formData) {
  if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
  try {
    const user = createUser({ username: formData.get('username'), nom: formData.get('nom'), role: formData.get('role'), password: String(formData.get('password') || '') });
    logOperation(appState, 'utilisateur', `Compte « ${user.username} » créé (${ROLES[user.role]})`);
    form.reset();
    updateAndRender();
    ok('Utilisateur créé');
  } catch (error) { ko(error.message); }
}

async function submitConfig(form, formData) {
  await runOperation({
    title: 'Modifier la configuration', silent: true, admin: true,
    adminReason: 'La modification de la configuration est réservée à l’administrateur.',
    exec: () => {
      const text = (name, max = 200) => String(formData.get(name) || '').trim().slice(0, max);
      if (!text('nom')) throw new Error('le nom de l’établissement est obligatoire');
      if (!text('devise')) throw new Error('la devise est obligatoire');
      appState.config = {
        ...appState.config,
        nom: text('nom', 120), sigle: text('sigle', 12).toUpperCase(), codeEcole: text('codeEcole', 30), devise: text('devise', 10), caissier: text('caissier', 80), adresse: text('adresse'),
        telephone: text('telephone', 80), email: text('email', 120),
        entete: {
          tutelle: text('tutelle', 600).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8),
          slogan: text('slogan', 120), telephones: text('telephones', 120), email: text('enteteEmail', 120), pays: text('pays', 40),
          drapeau: text('drapeau', 60).split(/[\s,;]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 3),
          initialesColorees: formData.get('initialesColorees') === 'on'
        }
      };
      logOperation(appState, 'config', 'Configuration de l’établissement modifiée');
      return true;
    },
    success: 'Établissement enregistré — le nom du caissier apparaît sur tous les reçus', failure: 'Configuration refusée'
  });
}

// Dates d'échéance proposées selon l'année scolaire choisie (champs encore non modifiés à la main)
// Récapitulatif en direct : somme des tranches et total en paiement mensuel, comparés au montant annuel
function tarifFigures(form) {
  const annual = Number(form.querySelector('[name="montantAnnuel"]').value || 0);
  const tranches = [1, 2, 3].reduce((s, n) => s + Number(form.querySelector(`[name="tranche${n}"]`).value || 0), 0);
  const monthly = Number(form.querySelector('[name="montantMensuel"]').value || 0);
  const months = Number(form.querySelector('[name="nbMois"]').value || 0);
  return { annual, tranches, monthly, months, monthlyTotal: monthly * months };
}

function updateTarifInfo(form) {
  const info = form?.querySelector('[data-tarif-info]');
  if (!info) return;
  const f = tarifFigures(form);
  const devise = appState.config.devise;
  if (!f.annual) { info.textContent = 'Saisissez le montant annuel : les tranches et le montant mensuel sont proposés automatiquement.'; info.className = 'meta span-all'; return; }
  const parts = [`Tranches : ${formatMoney(f.tranches)} / ${formatMoney(f.annual)} ${devise}${f.tranches === f.annual ? ' ✓' : ' — la somme doit être égale au montant annuel'}`];
  if (f.monthly > 0) {
    const gap = f.monthlyTotal - f.annual;
    const arrondi = ecartArrondi(f.monthly, f.months, f.annual, regleArrondi(appState.config, 'mensualites'));
    parts.push(arrondi
      ? `Mensuel : ${f.months - 1} × ${formatMoney(f.monthly)} + 1 × ${formatMoney(f.annual - f.monthly * (f.months - 1))} = ${formatMoney(f.annual)} ${devise} ✓ (arrondi absorbé par la dernière mensualité)`
      : `Mensuel : ${f.months} × ${formatMoney(f.monthly)} = ${formatMoney(f.monthlyTotal)} ${devise}${gap ? ` (écart de ${gap > 0 ? '+' : ''}${formatMoney(gap)} avec le montant annuel)` : ' ✓'}`);
    f.arrondi = arrondi;
  } else parts.push('Paiement mensuel non proposé (montant mensuel à 0)');
  info.textContent = parts.join(' · ');
  info.className = `meta span-all ${f.tranches !== f.annual ? 'form-error' : (f.monthly > 0 && f.monthlyTotal !== f.annual && !f.arrondi ? 'form-warning' : 'form-ok')}`;
}

function fillTarifDates(form) {
  if (form.dataset.editId) return;
  const annee = appState.annees.find((a) => a.id === Number(form.querySelector('[name="anneeId"]').value));
  autoTrancheDates(annee).forEach((date, i) => {
    const input = form.querySelector(`[name="dateTranche${i + 1}"]`);
    if (input && !input.dataset.touched) input.value = date;
  });
}

function wireForms() {
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    if (form.dataset.busy || sessionLost()) return;
    const formData = new FormData(form);
    const handlers = { annee: submitAnnee, classe: submitClasse, eleve: submitEleve, inscription: submitInscription, tarif: submitTarif, paiement: submitPaiement, config: submitConfig, depense: submitDepense, utilisateur: submitUtilisateur, programme: submitProgramme, arrondis: submitArrondis, role: submitRole, 'role-new': submitRoleNew, compte: submitCompte, referentiels: submitReferentiels, virement: submitVirement, recurrente: submitRecurrente, 'caisse-ouverture': submitOuvertureCaisse, 'caisse-fermeture': submitFermetureCaisse, 'caisse-option': submitOptionCaisse, rapprochement: submitRapprochement, budget: submitBudget, 'licence-verifier': submitVerifierLicence, 'licence-ajouter': submitAjouterLicence, ...paieFormHandlers(paieCtx()) };
    const handler = handlers[form.dataset.form];
    if (!handler) return;
    form.dataset.busy = '1';
    const buttons = [...form.querySelectorAll('button[type="submit"]')].filter((b) => !b.disabled);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await handler(form, formData);
    } catch (error) {
      console.error(error);
      ko(`Erreur inattendue : ${error.message}`);
    } finally {
      delete form.dataset.busy;
      // Le formulaire peut avoir été redessiné entre-temps : on ne réactive que s'il est encore affiché
      if (form.isConnected) buttons.forEach((b) => { b.disabled = false; });
    }
  });

  document.addEventListener('input', (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (handlePaieInput(paieCtx(), event)) return;
    if (t.matches('[data-student-search]')) applyStudentFilters();
    if (t.matches('[data-journal-search]')) applyJournalFilters();
    if (t.matches('[data-contact-search]')) {
      const form = t.closest('form');
      const contact = (appState.contacts || []).find((c) => `${nomContact(c)} — ${c.telephone || 'sans téléphone'}` === t.value);
      if (form && contact) {
        fillForm(form, { contactId: contact.id, parentNom: contact.nom, parentPrenom: contact.prenom, parentTel: contact.telephone, parentTel2: contact.telephone2, parentAdresse: contact.adresse });
        notify('success', `Famille de ${nomContact(contact)} reprise : complétez seulement le lien avec l’élève`);
      }
    }
    if (t.matches('[data-payment-search]')) applyPaymentFilters();

    // Calcul automatique des tranches (tiers égaux) tant que l'utilisateur ne les a pas saisies lui-même
    if (t.matches('form[data-form="tarif"] [name^="tranche"], form[data-form="tarif"] [name^="dateTranche"], form[data-form="tarif"] [name="montantMensuel"]')) t.dataset.touched = '1';
    if (t.matches('form[data-form="tarif"] [name="montantAnnuel"]')) {
      const form = t.closest('form');
      const montants = autoTrancheMontants(Number(t.value || 0), regleArrondi(appState.config, 'tranches'));
      [1, 2, 3].forEach((n, i) => {
        const input = form.querySelector(`[name="tranche${n}"]`);
        if (input && !input.dataset.touched) input.value = montants[i] || '';
      });
      fillTarifDates(form);
    }
    if (t.matches('form[data-form="tarif"] [name="montantAnnuel"], form[data-form="tarif"] [name="nbMois"]')) {
      const form = t.closest('form');
      const monthly = form.querySelector('[name="montantMensuel"]');
      const annual = Number(form.querySelector('[name="montantAnnuel"]').value || 0);
      if (monthly && !monthly.dataset.touched) monthly.value = annual ? autoMontantMensuel(annual, form.querySelector('[name="nbMois"]').value, regleArrondi(appState.config, 'mensualites')) : '';
    }
    if (t.matches('form[data-form="tarif"] input')) updateTarifInfo(t.closest('form'));

    // Filtrage immédiat des rapports (le champ garde le focus : seul le résultat est redessiné)
    if (t.matches('[data-rf]')) {
      const key = t.dataset.rf;
      if (key === 'search') reportFilters.search = t.value;
      else if (key === 'classe') reportFilters.classId = findByName(appState.classes.filter((c) => !reportFilters.yearId || c.anneeId === reportFilters.yearId), t.value)?.id || 0;
      else if (['from', 'to', 'dateRef', 'refJour', 'refSemaine', 'refMois'].includes(key)) reportFilters[key] = t.value;
      else if (key === 'gran') { reportFilters.gran = t.value; renderRapports(appState, reportFilters); return; }
      else if (key === 'category') { reportFilters.category = t.value; reportFilters.classId = 0; renderRapports(appState, reportFilters); return; }
      else return;
      renderReportOutput(appState, reportFilters);
    }
    if (t.matches('[data-df="demandeur"]')) { setDepenseFilter('demandeur', t.value); renderDepenseOutput(appState); }
    if (t.matches('[data-rf="demandeur"]')) { reportFilters.demandeur = t.value; renderReportOutput(appState, reportFilters); }
    if (t.matches('[data-dettes]')) { detteFilters[t.dataset.dettes] = t.value; renderDettesOutput(appState); }
    if (t.matches('[data-an="search"]')) { analyseFilters.search = t.value; renderAnalyseBody(appState, analyseFilters); }
    if (t.matches('[data-cr="search"]')) { creanceFilters.search = t.value; renderCreancesOutput(appState); }
    if (t.matches('[data-ef="search"]')) { setEtatsFilter(appState, 'search', t.value); }
    if (t.matches('[data-caisse-compte]')) majEcart(t, appState.config.devise || '');
    if (t.matches('#quickSearch')) renderQuickSearch(t.value);
    if (t.matches('[data-dashboard-filter="eleve"]')) {
      const typed = t.value.trim().toLocaleLowerCase('fr');
      const eleve = appState.eleves.find((e) => `${e.matricule} — ${e.prenom} ${e.nom}`.toLocaleLowerCase('fr') === typed || String(e.matricule).toLocaleLowerCase('fr') === typed);
      if (eleve || !typed) {
        dashboardFilters.eleveId = eleve?.id || 0;
        renderDashboard(appState, dashboardFilters);
        const input = document.querySelector('[data-dashboard-filter="eleve"]');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    }
    if (t.matches('[data-dashboard-filter="class"]')) {
      dashboardFilters.classId = findByName(appState.classes.filter((c) => !dashboardFilters.yearId || c.anneeId === dashboardFilters.yearId), t.value)?.id || 0;
      if (dashboardFilters.classId || !t.value) {
        renderDashboard(appState, dashboardFilters);
        const input = document.querySelector('[data-dashboard-filter="class"]');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    }
  });

  document.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('#activeYearSelect')) { switchActiveYear(target.value); return; }
    if (target.matches('[data-journal-type], [data-journal-user], [data-journal-from], [data-journal-to]')) { applyJournalFilters(); return; }
    // Passage et réinscriptions
    // Report explicite des soldes impayés (page Dettes antérieures)
    if (target.matches('[data-dettes-report="cible"]')) { detteFilters.reportCible = Number(target.value); detteFilters.reportSelection = []; renderDettes(appState); return; }
    if (target.matches('[data-dettes-report-check], [data-dettes-report-all]')) {
      const ids = target.matches('[data-dettes-report-all]') ? [...document.querySelectorAll('[data-dettes-report-check]')].map((c) => Number(c.dataset.dettesReportCheck)) : [Number(target.dataset.dettesReportCheck)];
      const sel = new Set((detteFilters.reportSelection || []).map(Number));
      ids.forEach((i) => (target.checked ? sel.add(i) : sel.delete(i)));
      detteFilters.reportSelection = [...sel];
      renderDettes(appState); return;
    }
    if (target.matches('[data-passage]')) {
      passageView[target.dataset.passage] = target.dataset.passage === 'filtre' ? target.value : Number(target.value);
      if (target.dataset.passage !== 'filtre') passageView.selection = [];
      renderInscriptions(appState); restoreListFilters(); return;
    }
    if (target.matches('[data-passage-check], [data-passage-all]')) {
      const ids = target.matches('[data-passage-all]') ? [...document.querySelectorAll('[data-passage-check]')].map((c) => Number(c.dataset.passageCheck)) : [Number(target.dataset.passageCheck)];
      const sel = new Set((passageView.selection || []).map(Number));
      ids.forEach((id) => (target.checked ? sel.add(id) : sel.delete(id)));
      passageView.selection = [...sel];
      renderInscriptions(appState); restoreListFilters(); return;
    }
    if (target.matches('[data-passage-classe]')) { passageView.classes = { ...(passageView.classes || {}), [target.dataset.passageClasse]: Number(target.value) }; renderInscriptions(appState); restoreListFilters(); return; }
    if (target.matches('[data-decision]')) {
      const id = Number(target.dataset.decision);
      await runOperation({ title: 'Décision de passage', silent: true, exec: () => { setDecision(appState, id, target.value); return true; }, success: target.value ? `Décision enregistrée : ${DECISIONS[target.value]}` : 'Décision retirée', failure: 'Décision refusée' });
      return;
    }
    if (target.matches('[data-prog-classe]')) { programmeView.classeId = Number(target.value); renderClasses(appState); document.getElementById('programme-panel')?.scrollIntoView({ block: 'start' }); return; }
    if (target.matches('[data-user-role]')) { changeUserRole(target); return; }
    if (target.matches('[data-student-class], [data-student-status], [data-student-year]')) applyStudentFilters();
    if (target.matches('[data-insc-year]')) applyInscriptionFilters();
    if (target.matches('[data-payment-from], [data-payment-to], [data-payment-status], [data-payment-year]')) applyPaymentFilters();

    // Année / catégorie → ne proposer que les classes correspondantes
    if (target.matches('[data-year-for], [data-cat-for]')) {
      refreshClassList(target.closest('form'), target.dataset.yearFor || target.dataset.catFor);
      if (target.matches('form[data-form="tarif"] [data-year-for]')) fillTarifDates(target.closest('form'));
    }

    if (target.matches('[data-df]') && target.dataset.df !== 'demandeur') { setDepenseFilter(target.dataset.df, target.value); renderDepenseOutput(appState); }
    if (target.matches('[data-rf="categorieDepense"]')) { reportFilters.categorieDepense = target.value; renderReportOutput(appState, reportFilters); }
    if (target.matches('[data-an="yearId"]')) { analyseFilters.yearId = Number(target.value || 0); renderAnalyseBody(appState, analyseFilters); }
    if (target.matches('[data-an="category"]')) { analyseFilters.category = target.value; renderAnalyseBody(appState, analyseFilters); }
    if (target.matches('[data-rf="gran"], [data-rf="category"]')) {
      reportFilters[target.dataset.rf] = target.value;
      if (target.dataset.rf === 'category') reportFilters.classId = 0;
      renderRapports(appState, reportFilters);
    }
    if (target.matches('[data-rf="yearId"]')) { reportFilters.yearId = Number(target.value || 0); reportFilters.classId = 0; renderRapports(appState, reportFilters); }
    // Courbe d'évolution des paiements : période, regroupement et comparaison
    if (target.matches('[data-ae]')) { setEncFilter(appState, target.dataset.ae, target); return; }
    if (target.matches('[data-dashboard-evo]')) {
      const key = target.dataset.dashboardEvo;
      dashboardFilters[key] = key === 'evoCompare' ? target.checked : target.value;
      renderDashboard(appState, dashboardFilters);
      return;
    }
    if (target.matches('[data-dashboard-filter="year"]')) { dashboardFilters.yearId = Number(target.value || 0); dashboardFilters.classId = 0; dashboardFilters.eleveId = 0; renderDashboard(appState, dashboardFilters); }
    if (target.matches('[data-dashboard-filter="from"], [data-dashboard-filter="to"], [data-dashboard-filter="mode"], [data-dashboard-filter="agent"]')) { dashboardFilters[target.dataset.dashboardFilter] = target.value; renderDashboard(appState, dashboardFilters); return; }
    if (target.matches('[data-cr]') && target.dataset.cr !== 'search') { setCreanceFilter(appState, target.dataset.cr, target); return; }
    if (target.matches('[data-ef]') && target.dataset.ef !== 'search') { setEtatsFilter(appState, target.dataset.ef, target.value); return; }
    if (target.matches('[data-cv]')) { caisseView[target.dataset.cv] = target.dataset.cv === 'compteId' ? Number(target.value || 0) : target.value; renderCaisse(appState); return; }
    if (target.matches('[data-dep-mode]')) {
      const compte = target.closest('form')?.querySelector('[name="compteId"]');
      if (compte) compte.value = String(compteParDefaut(appState, target.value)?.id || compte.value);
    }
    if (target.matches('[data-dashboard-filter="category"]')) { dashboardFilters.category = target.value; dashboardFilters.classId = 0; renderDashboard(appState, dashboardFilters); }

    if (target.matches('[data-logo-input], [data-armoiries-input]')) {
      const file = target.files?.[0];
      const key = target.matches('[data-logo-input]') ? 'logo' : 'armoiries';
      if (!file) return;
      if (file.size > 600 * 1024) { ko('Image trop lourde (600 Ko maximum).'); target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = async () => {
        if (!(await requireAdmin(appState))) { ko('Autorisation refusée.'); return; }
        appState.config[key] = String(reader.result);
        logOperation(appState, 'config', `Image « ${key} » mise à jour`);
        updateAndRender();
        ok('Image enregistrée');
      };
      reader.readAsDataURL(file);
    }
  });

  document.addEventListener('click', handleClick);
  // Échap ferme la fenêtre ouverte (fiche, aperçu de reçu ou de bulletin)
  document.addEventListener('keydown', (event) => {
    const root = document.getElementById('modal-root');
    if (event.key === 'Escape' && root?.innerHTML && !document.querySelector('.dialog-backdrop')) root.innerHTML = '';
  });
}

async function handleClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches('[data-modal-close]')) { document.getElementById('modal-root').innerHTML = ''; return; }

  const navLink = event.target.closest('[data-nav]');
  if (navLink) { goTo(navLink.dataset.nav); return; }
  if (await handlePaieClick(paieCtx(), event)) return;

  const tab = event.target.closest('[data-report-type]');
  if (tab) { selectReportType(reportFilters, tab.dataset.reportType); renderRapports(appState, reportFilters); return; }

  const etatTab = event.target.closest('[data-etat]');
  if (etatTab) { selectEtat(appState, etatTab.dataset.etat); return; }
  const quick = event.target.closest('[data-quick]');
  if (quick) { await ouvrirResultatRapide(quick.dataset.quick); return; }
  if (!event.target.closest('.quick-search')) { const box = document.getElementById('quickResults'); if (box) box.hidden = true; }

  const anTab = event.target.closest('[data-an-dim]');
  if (anTab) { analyseFilters.dim = anTab.dataset.anDim; renderAnalyse(appState, analyseFilters); return; }

  const filter = event.target.closest('[data-class-filter]');
  if (filter) {
    document.querySelectorAll('[data-class-filter]').forEach((b) => b.classList.toggle('active', b === filter));
    let visible = 0;
    document.querySelectorAll('[data-class-card]').forEach((card) => {
      const show = !filter.dataset.classFilter || card.dataset.cat === filter.dataset.classFilter;
      card.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.querySelector('[data-class-count]');
    if (count) count.textContent = `${visible} classe(s)`;
    return;
  }

  const btn = event.target.closest('button');
  const action = btn?.dataset.action;
  if (!action) return;
  const [scope, type, rawId] = action.split(':');
  const id = Number(rawId);

  if (action === 'form:reset') { resetForm(btn.closest('form')); return; }
  // Exports et impressions de listes / rapports : droit « Exporter et imprimer » du rôle
  if (/^(paiement:export-csv|ae:(pdf|excel)|report:(students-csv|pdf|excel|csv|print-reminders)|paierapport:)/.test(action) && !can('export')) { ko('Votre rôle ne permet pas d’exporter ni d’imprimer les listes et rapports.'); return; }
  if (action === 'paiement:export-csv') {
    exportPaymentsCsv(appState, {
      search: document.querySelector('[data-payment-search]')?.value, from: document.querySelector('[data-payment-from]')?.value,
      to: document.querySelector('[data-payment-to]')?.value, status: document.querySelector('[data-payment-status]')?.value,
      year: document.querySelector('[data-payment-year]')?.value
    });
    ok('Liste des paiements exportée en CSV');
    return;
  }
  if (action === 'ae:pdf' || action === 'ae:excel') { exportAnalyseEncaissements(appState, action === 'ae:pdf' ? 'pdf' : 'excel'); if (action === 'ae:excel') ok('Export Excel prêt'); return; }
  if (action === 'report:students-csv') { exportStudentsCsv(appState); ok('Liste des élèves exportée'); return; }
  if (action === 'report:pdf') { if (!printReport(appState, reportFilters)) ko('Impression impossible'); return; }
  if (action === 'report:excel') { exportReport(appState, reportFilters, 'excel'); ok('Export Excel prêt'); return; }
  if (action === 'report:csv') { exportReport(appState, reportFilters, 'csv'); ok('Export CSV prêt'); return; }
  if (action === 'report:print-reminders') { if (!printReminders(appState, reportFilters)) ko('Aucune fiche à imprimer'); return; }
  // Licences : gestion du catalogue (compte propriétaire, vérifié aussi dans le module)
  if (scope === 'licence') {
    const n = id;
    const actions = {
      modifier: { title: `Modifier la clé n° ${n}`, fields: [{ name: 'libelle', label: 'Libellé' }, { name: 'etablissement', label: 'Établissement destinataire' }, { name: 'expireLe', label: 'Expire le (AAAA-MM-JJ, vide : sans limite)' }, { name: 'notes', label: 'Notes' }], exec: (v, vals) => modifierCle(appState, n, Object.fromEntries(Object.entries(vals).filter(([, x]) => x !== ''))), detail: 'modifiée' },
      desactiver: { title: `Désactiver la clé n° ${n}`, message: 'Suspension réversible : la clé ne sera plus acceptée jusqu’à sa réactivation.', exec: () => modifierCle(appState, n, { statut: 'suspendue' }), detail: 'désactivée' },
      reactiver: { title: `Réactiver la clé n° ${n}`, message: 'La clé redevient utilisable.', exec: () => modifierCle(appState, n, { statut: 'active' }), detail: 'réactivée' },
      revoquer: { title: `Révoquer la clé n° ${n}`, message: 'Révocation DÉFINITIVE : la clé reste visible mais n’est plus jamais acceptée.', danger: true, field: { label: 'Motif (obligatoire)', required: true }, exec: (motif) => revoquerCle(appState, n, motif), detail: 'révoquée' },
      supprimer: { title: `Supprimer la clé n° ${n}`, message: 'La clé est retirée du catalogue, archivée et placée en liste noire. Les années et les données sont conservées.', danger: true, field: { label: 'Motif', required: true }, exec: (motif) => supprimerCle(appState, n, motif), detail: 'supprimée (liste noire)' }
    };
    const a = actions[type];
    if (!a) return;
    await runOperation({
      title: a.title, message: a.message, danger: a.danger, field: a.field, fields: a.fields, confirmLabel: 'Confirmer', superadmin: true,
      exec: (v, vals) => { const r = a.exec(v, vals); logOperation(appState, 'licence', `Clé de licence n° ${n} ${a.detail}${v && type !== 'modifier' ? ` — ${v}` : ''}`, 0, { cible: `Licence ${n}` }); return r; },
      success: `Clé n° ${n} ${a.detail}`, failure: 'Opération refusée'
    });
    return;
  }
  // Caisse : réouverture d'exception, procès-verbal, journal du jour
  if (scope === 'caisse') {
    if (type === 'rouvrir') {
      await runOperation({
        title: 'Rouvrir la journée de caisse', permission: 'tresorerie.corriger', danger: true, confirmLabel: 'Rouvrir',
        message: 'La clôture actuelle est conservée dans l’historique ; la journée devra être refermée après correction.', field: { label: 'Motif de la réouverture (obligatoire)', required: true },
        exec: (motif) => rouvrirCaisse(appState, id, motif), success: 'Journée rouverte — corrigez puis refermez la caisse', failure: 'Réouverture refusée'
      });
      return;
    }
    if (!can('export')) { ko('Votre rôle ne permet pas d’imprimer.'); return; }
    if (type === 'pv') { if (!printPvCloture(appState, id)) ko('Procès-verbal indisponible.'); return; }
    if (type === 'print-journal') { printJournalDuJour(appState, caisseView.jour); return; }
    return;
  }
  // États financiers : exports (droit « Exporter », journalisés)
  if (scope === 'etats') {
    if (!can('export')) { ko('Votre rôle ne permet pas d’exporter ni d’imprimer.'); return; }
    const e = type === 'print' ? printEtat(appState) : exportEtat(appState, type === 'csv' ? 'csv' : 'excel');
    if (e) { logOperation(appState, 'export', `État « ${e.titre} » ${type === 'print' ? 'imprimé' : `exporté (${type.toUpperCase()})`} — ${e.lignes.length} ligne(s)`, 0, { cible: e.titre }); saveState(appState); }
    return;
  }
  if (action === 'journal:csv') {
    if (!can('export')) { ko('Votre rôle ne permet pas d’exporter.'); return; }
    const rows = [['Date et heure', 'Opération', 'Utilisateur', 'Enregistrement', 'Détail', 'Avant', 'Après', 'Montant']];
    [...appState.journal].reverse().forEach((j) => rows.push([j.horodatage, j.type, j.utilisateur || '', j.cible || '', j.detail, j.avant ? JSON.stringify(j.avant) : '', j.apres ? JSON.stringify(j.apres) : '', j.montant || 0]));
    downloadCsv(`journal-audit-${todayISO()}.csv`, rows);
    logOperation(appState, 'export', `Journal d’audit exporté (${rows.length - 1} ligne(s))`);
    saveState(appState);
    return;
  }
  if (action === 'dashboard:reset') {
    Object.assign(dashboardFilters, { eleveId: 0, from: '', to: '', mode: '', agent: '' });
    renderDashboard(appState, dashboardFilters);
    return;
  }
  // Créances : états imprimables, relances (papier) et encaissement direct
  if (scope === 'creances') {
    if (['print-etat', 'print-relances', 'csv', 'relance'].includes(type) && !can('export')) { ko('Votre rôle ne permet pas d’imprimer ni d’exporter.'); return; }
    if (type === 'print-etat') { if (!printEtatRecouvrement(appState)) ko('Aucune créance à imprimer.'); return; }
    if (type === 'print-relances') { if (!printRelances(appState)) ko('Aucun élève en retard dans la sélection.'); return; }
    if (type === 'relance') { if (!printRelances(appState, id)) ko('Aucune échéance en retard pour cet élève.'); return; }
    if (type === 'csv') { ok(`${exportCreancesCsv(appState)} créance(s) exportée(s) en CSV`); return; }
    if (type === 'encaisser') { const inscription = appState.inscriptions.find((i) => i.id === id); if (inscription) redirectToPayment(inscription); return; }
    return;
  }
  if (action === 'tarif:reprendre') {
    const actives = appState.anneeActiveId;
    const sources = appState.annees.filter((a) => a.id !== actives && appState.tarifs.some((t) => t.anneeId === a.id));
    if (!sources.length) { ko('Aucune autre année n’a de tarifs.'); return; }
    const defaut = anneePrecedente(appState, actives);
    await runOperation({
      title: 'Reprendre des tarifs', permission: 'scolarite.parametrer', message: 'Les tarifs de l’année choisie sont recopiés sur les classes de même nom de l’année active qui n’ont pas encore de tarif (dates d’échéance recalculées). Rien n’est modifié pour les classes déjà tarifées.',
      confirmLabel: 'Reprendre les tarifs', fields: [{ name: 'source', label: 'Année d’origine', options: sources.map((a) => [a.id, a.annee]), value: defaut && sources.some((s) => s.id === defaut.id) ? defaut.id : sources[0].id }],
      exec: (source) => {
        const repris = appState.tarifs.filter((t) => t.anneeId === Number(source)).map((t) => duplicateTarif(appState, t.id, actives)).filter(Boolean);
        if (!repris.length) throw new Error('aucune classe de même nom sans tarif dans l’année active');
        repris.forEach((t) => propagateTarif(appState, t));
        logOperation(appState, 'tarif', `${repris.length} tarif(s) repris de l’année ${appState.annees.find((a) => a.id === Number(source))?.annee}`);
        return repris;
      },
      success: 'Tarifs repris sur l’année active', failure: 'Reprise impossible'
    });
    return;
  }
  if (scope === 'compte') {
    const compte = compteOf(appState, id);
    if (!compte || !can('admin')) { ko('Réservé à l’administrateur.'); return; }
    if (type === 'edit') {
      const form = document.querySelector('form[data-form="compte"]');
      fillForm(form, { libelle: compte.libelle, type: compte.type, numero: compte.numero, soldeInitial: compte.soldeInitial });
      enterEditMode(form, id, 'Enregistrer le compte');
      return;
    }
    if (type === 'toggle') {
      await runOperation({ title: compte.actif === false ? 'Réactiver le compte' : 'Désactiver le compte', message: `${compte.actif === false ? 'Réactiver' : 'Désactiver'} « ${compte.libelle} » ? Son historique est conservé.`, admin: true, exec: () => setCompteActif(appState, id, compte.actif === false), success: 'Compte mis à jour', failure: 'Opération refusée' });
    }
    return;
  }
  if (scope === 'virement' && type === 'cancel') {
    const virement = (appState.virements || []).find((v) => v.id === id);
    await runOperation({
      title: 'Annuler le virement', permission: 'tresorerie.corriger', message: `Annuler le virement ${virement?.numero || id} ? Il reste dans l’historique et les soldes des deux comptes sont recalculés.`, confirmLabel: 'Annuler le virement', danger: true, admin: true,
      adminReason: 'L’annulation d’un virement interne est réservée à l’administrateur.', field: { label: 'Motif (obligatoire)', required: true },
      exec: (motif) => cancelVirement(appState, id, motif), success: 'Virement annulé', failure: 'Annulation impossible'
    });
    return;
  }
  if (scope === 'paiement' && type === 'correct') {
    const p = appState.paiements.find((x) => x.id === id);
    if (!p || p.annule) return;
    const answer = await confirmDialog({
      title: `Corriger le paiement ${p.numeroRecu || id}`,
      message: 'Seules les informations sans effet sur le montant ni sur l’élève sont modifiables. Pour une erreur de montant ou d’élève, annulez le paiement puis enregistrez le bon. L’état précédent reste dans l’historique.',
      confirmLabel: 'Continuer',
      fields: [
        { name: 'mode', label: 'Moyen de paiement', options: Object.entries(MODES_PAIEMENT), value: p.mode },
        { name: 'compteId', label: 'Compte destinataire', options: comptesActifs(appState).map((c) => [c.id, c.libelle]), value: p.compteId },
        { name: 'datePaiement', label: 'Date du paiement', type: 'date', value: p.datePaiement, required: true },
        { name: 'reference', label: 'Référence', value: p.reference || '' },
        { name: 'payeur', label: 'Payeur', value: p.payeur || '' },
        { name: 'motifPaiement', label: 'Description', value: p.motifPaiement || '' },
        { name: 'observation', label: 'Observation', value: p.observation || '' },
        { name: 'motif', label: 'Motif de la correction (obligatoire)', required: true }
      ]
    });
    if (!answer.ok) return;
    const { motif, ...champs } = answer.values;
    await runOperation({
      title: 'Corriger le paiement', silent: true, permission: 'paiements.corriger', adminReason: 'La correction d’un paiement est réservée à l’administrateur (l’ancienne valeur reste tracée).',
      exec: () => corrigerPaiement(appState, id, champs, motif), success: 'Paiement corrigé — historique conservé', failure: 'Correction refusée'
    });
    return;
  }
  if (scope === 'attente') {
    const a = (appState.paiementsEnAttente || []).find((x) => x.id === id);
    if (!a) return;
    if (type === 'confirm') {
      let payment = null;
      const done = await runOperation({
        title: 'Confirmer l’encaissement', permission: 'paiements.encaisser', message: `Le règlement ${a.numero} (${formatMoney(a.montant)} ${appState.config.devise}, réf. ${a.reference}) a-t-il été effectivement crédité ? Un reçu numéroté sera créé à la date d’encaissement.`, confirmLabel: 'Confirmer',
        fields: [{ name: 'date', label: 'Date d’encaissement', type: 'date', value: todayISO(), required: true }, { name: 'compteId', label: 'Compte crédité', options: comptesActifs(appState).map((c) => [c.id, c.libelle]), value: a.compteId }],
        exec: (date, values) => { payment = confirmerAttente(appState, id, { dateEncaissement: date, compteId: Number(values.compteId) }); return payment; },
        success: 'Encaissement confirmé — reçu émis, soldes mis à jour', failure: 'Confirmation impossible'
      });
      if (done && payment) showReceiptPreview(appState, payment.id);
    }
    if (type === 'reject') {
      await runOperation({
        title: 'Rejeter le règlement', permission: 'paiements.annuler', message: `Rejeter ${a.numero} (chèque impayé, virement non reçu…) ? La ligne reste dans le registre avec son motif ; le solde de l’élève ne change pas.`, confirmLabel: 'Rejeter', danger: true,
        field: { label: 'Motif (obligatoire)', required: true }, exec: (motif) => rejeterAttente(appState, id, motif), success: 'Règlement rejeté', failure: 'Rejet impossible'
      });
    }
    return;
  }
  if (scope === 'inscription' && type === 'reduction') {
    const inscription = appState.inscriptions.find((i) => i.id === id);
    if (!inscription) return;
    const eleve = appState.eleves.find((e) => e.id === inscription.eleveId);
    const tarif = tarifFor(appState, inscription);
    const r = inscription.reduction;
    const answer = await confirmDialog({
      title: `Réduction — ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'élève'}`,
      message: `${r ? `Réduction actuelle : ${reductionLabel(r)} (${r.motif}). ` : ''}Remise plafonnée à ${Number(tarif?.remiseMaxPct || 0)} % par le tarif de la classe. Bourse et exonération : accord d’un administrateur. La réduction ne porte que sur la scolarité restant à payer.`,
      confirmLabel: 'Continuer',
      fields: [
        { name: 'type', label: 'Décision', options: [...Object.entries(TYPES_REDUCTION), ...(r ? [['retirer', 'Retirer la réduction actuelle']] : [])], value: r?.type || 'remise' },
        { name: 'mode', label: 'Calcul', options: Object.entries(MODES_REDUCTION), value: r?.mode || 'pourcentage' },
        { name: 'valeur', label: 'Valeur (pourcentage ou montant ; ignorée pour une exonération)', type: 'number', value: r?.valeur ?? '' },
        { name: 'motif', label: 'Motif (obligatoire)', required: true },
        { name: 'reference', label: 'Référence de la décision (facultatif)' }
      ]
    });
    if (!answer.ok) return;
    const v = answer.values;
    const exceptionnel = v.type !== 'remise';
    await runOperation({
      title: 'Réduction', silent: true, permission: exceptionnel || (r && r.type !== 'remise') ? 'reductions.exceptionnelles' : 'reductions.accorder',
      exec: () => {
        const avant = r ? reductionLabel(r) : 'aucune';
        if (v.type === 'retirer') retirerReduction(appState, inscription, v.motif);
        else accorderReduction(appState, inscription, { type: v.type, mode: v.mode, valeur: Number(v.valeur), motif: v.motif, reference: v.reference }, tarif);
        logOperation(appState, 'reduction', `${eleve ? `${eleve.prenom} ${eleve.nom}` : 'Élève'} : ${avant} → ${inscription.reduction ? reductionLabel(inscription.reduction) : 'aucune'} — ${v.motif}`, inscription.reduction?.montant || 0);
        return true;
      },
      success: v.type === 'retirer' ? 'Réduction retirée — échéancier recalculé' : 'Réduction accordée — échéancier et solde recalculés', failure: 'Réduction refusée'
    });
    return;
  }
  if (scope === 'recurrente') {
    const periode = action.split(':')[3] || '';
    const r = (appState.depensesRecurrentes || []).find((x) => x.id === id);
    if (!r) return;
    if (type === 'toggle') { await runOperation({ title: 'Dépense récurrente', silent: true, permission: 'depenses.saisir', exec: () => setRecurrenteActive(appState, id, !r.actif), success: r.actif ? 'Dépense récurrente suspendue' : 'Dépense récurrente réactivée' }); return; }
    if (type === 'ignorer') { await runOperation({ title: 'Ignorer l’échéance', permission: 'depenses.saisir', message: `Ne pas enregistrer l’échéance ${periode} de « ${r.libelle} » ?`, confirmLabel: 'Ignorer', exec: () => ignorerOccurrence(appState, id, periode), success: 'Échéance ignorée' }); return; }
    if (type === 'enregistrer') {
      let created = null;
      const done = await runOperation({
        title: `Enregistrer « ${r.libelle} » (${periode})`, permission: 'depenses.saisir', message: 'Vérifiez le montant et la date réellement payés.', confirmLabel: 'Enregistrer la dépense',
        fields: [{ name: 'montant', label: `Montant (${appState.config.devise})`, type: 'number', value: r.montant, required: true }, { name: 'date', label: 'Date du paiement', type: 'date', value: todayISO(), required: true }, { name: 'reference', label: 'Référence (facture…)' }],
        exec: (montant, values) => { created = enregistrerOccurrence(appState, id, periode, { montant: Number(montant), date: values.date, reference: values.reference, anneeId: appState.anneeActiveId }); return created; },
        success: 'Dépense récurrente enregistrée', failure: 'Enregistrement impossible'
      });
      if (done && created) showExpenseReceiptPreview(appState, created.id);
    }
    return;
  }
  if (scope === 'depense') {
    const depense = appState.depenses.find((d) => d.id === id);
    if (!depense) return;
    if (type === 'receipt') { if (!showExpenseReceiptPreview(appState, id)) ko('Reçu indisponible'); return; }
    if (type === 'edit') {
      if (!can('write')) { ko('Votre rôle ne permet pas de modifier les données.'); return; }
      const form = document.querySelector('form[data-form="depense"]');
      fillForm(form, { anneeId: depense.anneeId, date: depense.date, categorie: depense.categorie, montant: depense.montant, description: depense.description, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference, mode: depense.mode || 'espece', compteId: depense.compteId, observation: depense.observation || '' });
      enterEditMode(form, id, 'Enregistrer la correction');
      return;
    }
    if (type === 'cancel') {
      await runOperation({
        title: 'Annuler la dépense', permission: 'depenses.corriger', message: `Annuler la dépense ${depense.numero} (${formatMoney(depense.montant)} ${appState.config.devise}) ? Elle reste dans l’historique et n’entre plus dans les totaux.`,
        confirmLabel: 'Annuler la dépense', danger: true, admin: true, field: { label: 'Motif (obligatoire)', required: true },
        exec: (motif) => cancelDepense(appState, id, motif), success: 'Dépense annulée — solde de caisse recalculé', failure: 'Annulation impossible'
      });
    }
    return;
  }
  if (scope === 'user') {
    if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
    try {
      if (type === 'toggle') {
        const current = publicUsers().find((u) => u.id === id);
        const target = setUserActive(id, !current.actif);
        logOperation(appState, 'utilisateur', `Compte « ${target.username} » ${target.actif ? 'activé' : 'désactivé'}`);
        updateAndRender();
      }
      if (type === 'password') {
        const answer = await confirmDialog({ title: 'Changer le mot de passe', message: 'Nouveau mot de passe (8 caractères minimum, lettre + chiffre).', confirmLabel: 'Enregistrer', field: { label: 'Nouveau mot de passe', type: 'password', required: true } });
        if (!answer.ok) return;
        if (!(await requireAdmin(appState, 'Confirmez votre mot de passe administrateur.', { reauth: true }))) { ko('Autorisation refusée.'); return; }
        const problem = passwordProblem(answer.value);
        if (problem) { ko(problem); return; }
        changePassword(id, answer.value);
        logOperation(appState, 'utilisateur', `Mot de passe du compte « ${publicUsers().find((u) => u.id === id)?.username || id} » modifié`);
        updateAndRender();
        ok('Mot de passe modifié');
      }
    } catch (error) { ko(error.message); }
    return;
  }
  if (scope === 'safety') {
    if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
    if (type === 'download') {
      const data = readSafetyBackup(id);
      if (data) { exportStateToFile(data, `copie-securite-${id}.note`); ok('Copie téléchargée'); }
      return;
    }
    if (type === 'delete') {
      if (!(await requireAdmin(appState, 'La suppression d’une copie de sécurité est irréversible : mot de passe d’un super administrateur.', { reauth: true, superadmin: true }))) { ko('Autorisation refusée.'); return; }
      const confirmed = await confirmDialog({ title: 'Supprimer la copie de sécurité', message: `Supprimer définitivement la copie n°${id} ?`, confirmLabel: 'Supprimer', danger: true });
      if (!confirmed.ok) return;
      deleteSafetyBackup(id);
      logOperation(appState, 'sauvegarde', `Copie de sécurité n°${id} supprimée`);
      updateAndRender();
      ok('Copie supprimée');
      return;
    }
    if (type === 'restore') {
      const before = structuredClone(appState);
      const done = await runOperation({
        title: 'Restaurer la copie de sécurité', message: `Remplacer les données actuelles par la copie n°${id} ? Les données actuelles sont d’abord sauvegardées.`, confirmLabel: 'Restaurer', danger: true, superadmin: true, reauth: true,
        exec: () => {
          const data = readSafetyBackup(id);
          if (!data) return false;
          createSafetyBackup(appState, `Avant restauration de la copie n°${id}`, currentUser()?.nom);
          replaceState(migrateState(data));
          logOperation(appState, 'sauvegarde', `Copie de sécurité n°${id} restaurée`);
          return true;
        }, success: 'Copie restaurée', failure: 'Restauration impossible'
      });
      if (done) { await backupFileBefore('avant-restauration', before); await flushBackup(appState); }
      return;
    }
  }
  if (action === 'admin:reset') { await resetAllData(); return; }
  if (action === 'dettes:reporter') {
    const ids = (detteFilters.reportSelection || []).map(Number);
    const cible = appState.annees.find((a) => a.id === Number(detteFilters.reportCible));
    if (!ids.length || !cible) { ko('Cochez les soldes à reporter.'); return; }
    let crees = [];
    const done = await runOperation({
      title: 'Reporter les soldes impayés', confirmLabel: 'Reporter', admin: true, adminReason: 'Le report des dettes est réservé à l’administrateur.',
      message: `Reporter ${ids.length} solde(s) impayé(s) sur l’année ${cible.annee} ? Chaque dette garde son origine, son montant initial et ce qui avait déjà été réglé.`,
      exec: () => { crees = reporterSoldes(appState, cible.id, ids); return crees.length > 0; },
      success: 'Soldes reportés', failure: 'Aucun solde reporté'
    });
    if (done) { detteFilters.reportSelection = []; ok(`${crees.length} dette(s) reportée(s) sur ${cible.annee} — réglables depuis le formulaire de paiement`); }
    return;
  }
  if (action === 'passage:decision-lot') {
    const statut = document.querySelector('[data-passage-lot]')?.value;
    const ids = (passageView.selection || []).map(Number);
    if (!ids.length) { ko('Cochez d’abord les élèves concernés.'); return; }
    await runOperation({ title: 'Décision de passage', silent: true, exec: () => { ids.forEach((i) => setDecision(appState, i, statut)); return true; }, success: `Décision « ${DECISIONS[statut]} » enregistrée pour ${ids.length} élève(s)`, failure: 'Décisions refusées' });
    return;
  }
  if (action === 'passage:inscrire') {
    const candidats = candidatsPassage(appState, passageView.sourceId, passageView.cibleId, passageView.classes || {});
    const retenus = candidats.filter((c) => c.inscriptible && (passageView.selection || []).map(Number).includes(c.inscription.id));
    const choix = retenus.map((c) => ({ inscriptionId: c.inscription.id, classeId: c.proposee?.id }));
    if (!choix.length) { ko('Cochez les élèves prêts à réinscrire.'); return; }
    const annee = appState.annees.find((a) => a.id === Number(passageView.cibleId));
    const recap = recapReinscription(appState, passageView.sourceId, passageView.cibleId, retenus);
    const parClasse = recap.lignes.map((l) => `${l.classe.nom} : ${l.eleves.length}${l.depassement ? ' (capacité dépassée)' : ''}`).join(' · ');
    let crees = [];
    const done = await runOperation({
      title: `Réinscriptions ${annee?.annee || ''}`, confirmLabel: 'Confirmer les réinscriptions',
      message: `${choix.length} élève(s) — ${recap.admis} admis, ${recap.redoublants} redoublant(s). Répartition : ${parClasse}. Frais de réinscription : ${formatMoney(recap.total)} ${appState.config.devise}.${recap.avecDette.length ? ` ${recap.avecDette.length} élève(s) ont un solde impayé : pensez à le reporter (Dettes antérieures).` : ''}`,
      exec: () => { crees = inscrireAdmis(appState, passageView.cibleId, choix); logOperation(appState, 'inscription', `${crees.length} réinscription(s) en ${annee?.annee} depuis la liste des admis`); return crees; },
      success: 'Réinscriptions enregistrées', failure: 'Réinscriptions refusées'
    });
    if (done) { passageView.selection = []; passageView.classes = {}; ok(`${crees.length} élève(s) réinscrit(s) en ${annee?.annee} — modalité de règlement à choisir au premier paiement`); }
    return;
  }
  if (action === 'passage:liste') { if (!imprimerListeReinscrits(appState)) ko('Choisissez l’année de destination.'); return; }
  if (action.startsWith('programme:copier:')) {
    const source = Number(document.querySelector('[data-prog-source]')?.value || 0);
    if (!source) { ko('Choisissez la classe dont copier le programme.'); return; }
    await runOperation({ title: 'Copier le programme', silent: true, exec: () => copierProgramme(appState, source, id), success: 'Programme copié — ajustez puis enregistrez si besoin', failure: 'Copie impossible' });
    return;
  }
  if (action.startsWith('role:delete:')) {
    const role = roleOf(action.slice('role:delete:'.length));
    if (!role || !can('admin')) return;
    const answer = await confirmDialog({ title: 'Supprimer le rôle', message: `Supprimer le rôle « ${role.label} » ?`, confirmLabel: 'Supprimer', danger: true });
    if (!answer.ok) return;
    try { deleteRole(role.id); logOperation(appState, 'role', `Rôle « ${role.label} » supprimé`); updateAndRender(); ok('Rôle supprimé'); } catch (error) { ko(error.message); }
    return;
  }
  if (action === 'roles:reset') {
    if (!can('admin')) return;
    const answer = await confirmDialog({ title: 'Rétablir les droits par défaut', message: 'Les rôles Comptable / Caissier et Consultation retrouvent leurs pages et droits d’origine. Les rôles personnalisés sont conservés.', confirmLabel: 'Rétablir' });
    if (!answer.ok) return;
    resetRoles();
    logOperation(appState, 'role', 'Droits par défaut des rôles de base rétablis');
    updateAndRender();
    ok('Droits par défaut rétablis');
    return;
  }
  if (action === 'admin:purge-backups') {
    if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
    if (!(await requireAdmin(appState, 'Suppression de TOUTES les copies de sécurité : mot de passe d’un super administrateur.', { reauth: true, superadmin: true }))) { ko('Autorisation refusée.'); return; }
    const confirmed = await confirmDialog({ title: 'Supprimer toutes les copies de sécurité', message: 'Cette action est irréversible.', confirmLabel: 'Tout supprimer', danger: true, field: { label: 'Tapez SUPPRIMER', required: true } });
    if (!confirmed.ok || confirmed.value !== 'SUPPRIMER') { ko('Suppression annulée.'); return; }
    const count = deleteAllSafetyBackups();
    logOperation(appState, 'sauvegarde', `${count} copie(s) de sécurité supprimée(s)`);
    updateAndRender();
    ok('Copies supprimées');
    return;
  }
  if (action === 'backup:txt') { exportNoteText(appState); ok('Note lisible exportée'); return; }
  if (action === 'backup:json' || action === 'backup:params') {
    if (!can('export') || !can('admin')) { ko('Export réservé aux administrateurs.'); return; }
    const type = action === 'backup:params' ? 'parametres' : 'complet';
    const { nom } = telechargerArchive(appState, type);
    logOperation(appState, 'export', `${type === 'parametres' ? 'Export des paramètres' : 'Export complet des données'} (archive vérifiable ${nom})`);
    saveState(appState); ok(`Sauvegarde téléchargée : ${nom}`); return;
  }
  if (action === 'backup:choose' || action === 'datafile:link') { if (!can('admin')) { ko('Réservé à l’administrateur.'); return; } await linkDataFolderFlow(); return; }
  if (action === 'datafile:reconnect') { await reconnectFlow(); return; }
  if (action === 'datafile:save') { await flushBackup(appState); const b = backupStatus(); if (b.error) ko(b.error); else ok(`Fichier de données enregistré (${b.target})`); return; }
  if (action === 'datafile:backup') {
    const path = await backupFileBefore('manuelle');
    if (path) { logOperation(appState, 'sauvegarde', `Sauvegarde manuelle : ${path}`); updateAndRender(); ok(`Sauvegarde créée : ${path}`); } else ko('Sauvegarde impossible');
    return;
  }
  if (action === 'datafile:unlink') {
    if (!(await requireAdmin(appState, 'Délier le fichier de données : les opérations ne seront plus enregistrées dans ce fichier.', { reauth: true }))) { ko('Autorisation refusée.'); return; }
    const name = backupStatus().folderName;
    await unlinkDataFolder();
    logOperation(appState, 'sauvegarde', `Fichier de données délié (dossier « ${name} »)`);
    updateAndRender();
    ok('Fichier de données délié (le fichier reste sur le disque)');
    return;
  }
  if (action === 'config:remove-logo' || action === 'config:remove-armoiries') {
    const key = action === 'config:remove-logo' ? 'logo' : 'armoiries';
    await runOperation({ title: 'Retirer l’image', message: 'Revenir à l’image par défaut ?', admin: true, exec: () => { delete appState.config[key]; return true; }, success: 'Image retirée' });
    return;
  }

  // Consultation (fenêtre de détail)
  if (type === 'view' && showDetail(appState, scope, id)) return;
  if (action.startsWith('eleve:profile:')) { showStudentProfile(appState, id); return; }
  if (action.startsWith('paiement:receipt:')) {
    // Réimpression : même numéro, aucun nouveau paiement ; la consultation du duplicata est tracée
    if (!showReceiptPreview(appState, id, { duplicata: true })) { ko('Reçu indisponible pour ce paiement'); return; }
    const p = appState.paiements.find((x) => x.id === id);
    logOperation(appState, 'reimpression', `Duplicata du reçu ${p?.numeroRecu || id} consulté`, p?.montant || 0, { cible: p?.numeroRecu });
    saveState(appState);
    return;
  }
  if (action.startsWith('paiement:print:')) {
    if (!printReceipt(appState, id)) ko('Reçu indisponible pour ce paiement');
    return;
  }

  if (scope === 'annee') {
    const annee = appState.annees.find((a) => a.id === id);
    if (!annee) return;
    if (type === 'edit') {
      goTo('annees');
      const form = document.querySelector('form[data-form="annee"]');
      fillForm(form, { annee: annee.annee, dateDebut: annee.dateDebut, dateFin: annee.dateFin, statut: annee.statut, soldeInitial: annee.soldeInitial || 0, fraisInscription: annee.fraisInscription || 0, fraisReinscription: annee.fraisReinscription || 0 });
      enterEditMode(form, id, 'Enregistrer les modifications');
    }
    if (type === 'reconduire') { await reconduireVers(annee); return; }
    if (type === 'open') await runOperation({ title: 'Valider l’ouverture', message: `Ouvrir l’année ${annee.annee} ? Toute autre année ouverte sera clôturée.`, exec: () => updateAnneeStatus(appState, id, 'ouverte'), success: 'Année ouverte', failure: 'Ouverture impossible' });
    if (type === 'close') await runOperation({ title: 'Clôturer l’année', message: `Clôturer l’année ${annee.annee} ?`, admin: true, exec: () => updateAnneeStatus(appState, id, 'cloturee'), success: 'Année clôturée' });
    if (type === 'active') {
      await runOperation({
        title: 'Définir l’année active', silent: true,
        exec: () => { setAnneeActive(appState, id); logOperation(appState, 'annee', `Année active : ${annee.annee}`); return true; }, success: `Année ${annee.annee} active : toutes les pages affichent désormais ses données`
      });
    }
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer l’année', message: `Supprimer définitivement l’année ${annee.annee} ? Impossible si des classes ou inscriptions y sont rattachées.`, danger: true, admin: true,
        exec: () => { const done = deleteAnnee(appState, id); if (done) logOperation(appState, 'suppression', `Année ${annee.annee} supprimée`); return done; },
        success: 'Année supprimée', failure: 'Suppression refusée : des classes ou des inscriptions (historique financier) dépendent de cette année'
      });
    }
    return;
  }

  if (scope === 'classe') {
    const classe = appState.classes.find((c) => c.id === id);
    if (!classe) return;
    if (type === 'edit') {
      goTo('classes');
      const form = document.querySelector('form[data-form="classe"]');
      fillForm(form, { nom: classe.nom, categorie: classe.categorie, anneeId: classe.anneeId, capacite: classe.capacite });
      enterEditMode(form, id, 'Enregistrer les modifications');
    }
    if (type === 'toggle') await runOperation({ title: classe.active ? 'Désactiver la classe' : 'Activer la classe', silent: true, exec: () => { classe.active = !classe.active; return true; }, success: 'Classe mise à jour' });
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer la classe', message: `Supprimer la classe ${classe.nom} ?`, danger: true, admin: true,
        exec: () => { const done = deleteClasse(appState, id); if (done) logOperation(appState, 'suppression', `Classe ${classe.nom} supprimée`); return done; },
        success: 'Classe supprimée', failure: 'Suppression refusée : des élèves ou des inscriptions sont rattachés à cette classe'
      });
    }
    return;
  }

  if (scope === 'eleve') {
    const eleve = appState.eleves.find((e) => e.id === id);
    if (!eleve) return;
    if (type === 'enroll') { redirectToEnrollment(eleve); return; }
    if (type === 'edit') {
      goTo('eleves');
      const form = document.querySelector('#eleves form[data-form="eleve"]');
      const resp = responsablePrincipal(appState, eleve);
      fillForm(form, { matricule: eleve.matricule, nom: eleve.nom, prenom: eleve.prenom, sexe: eleve.sexe, dateNaissance: eleve.dateNaissance, telephone: eleve.telephone, email: eleve.email, adresse: eleve.adresse, classeText: eleve.classeId ? className(eleve.classeId) : '',
        contactId: resp?.contactId || '', parentNom: resp?.contact.nom || '', parentPrenom: resp?.contact.prenom || '', parentLien: resp?.lien || 'tuteur', parentTel: resp?.contact.telephone || '',
        parentTel2: resp?.contact.telephone2 || '', parentAdresse: resp?.contact.adresse || '', urgenceNom: eleve.urgence?.nom || '', urgenceTelephone: eleve.urgence?.telephone || '' });
      enterEditMode(form, id, 'Enregistrer les modifications');
    }
    if (type === 'toggle') await runOperation({ title: eleve.actif ? 'Désactiver l’élève' : 'Activer l’élève', silent: true, exec: () => toggleEleveState(appState, id), success: 'Statut modifié' });
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer l’élève', message: `Supprimer la fiche de ${eleve.prenom} ${eleve.nom} ? Impossible si des paiements existent.`, danger: true, admin: true,
        exec: () => { const done = deleteEleve(appState, id); if (done) logOperation(appState, 'suppression', `Élève ${eleve.matricule} supprimé`); return done; },
        success: 'Élève supprimé', failure: 'Suppression refusée : des paiements sont enregistrés pour cet élève (historique comptable protégé)'
      });
    }
    return;
  }

  if (scope === 'dette') {
    if (type === 'view') { showDetteDetail(appState, id); return; }
    if (type === 'pay') {
      goTo('paiements');
      if (selectDebtForPayment(appState, id)) {
        const form = document.querySelector('#paiements form[data-form="paiement"]');
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.querySelector('[name="montant"]')?.focus();
      }
    }
    return;
  }

  if (scope === 'inscription' && type.startsWith('modalite-')) {
    const modalite = type.slice('modalite-'.length);
    const inscription = appState.inscriptions.find((i) => i.id === id);
    if (!inscription || !MODALITES[modalite]) return;
    const done = await runOperation({
      title: 'Changer la modalité de règlement', permission: 'paiements.encaisser', confirmLabel: 'Changer',
      message: `Passer au « ${MODALITES[modalite]} » ? L’échéancier est recalculé et les paiements déjà validés sont réimputés (ancienne répartition conservée dans l’historique).`,
      exec: () => changerModalite(appState, id, modalite),
      success: 'Modalité changée — échéancier et soldes recalculés', failure: 'Changement de modalité impossible'
    });
    if (done) selectStudentForPayment(appState, id);
    return;
  }

  if (scope === 'inscription') {
    const inscription = appState.inscriptions.find((i) => i.id === id);
    if (!inscription) return;
    const eleve = appState.eleves.find((e) => e.id === inscription.eleveId);
    const who = eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève';
    if (type === 'validate') {
      await runOperation({
        title: 'Valider l’inscription', silent: true,
        exec: () => { const done = validerInscription(appState, id, currentUser()?.nom || ''); if (done) logOperation(appState, 'inscription', `Inscription de ${who} validée`); return done; },
        success: 'Inscription validée', failure: 'Validation impossible'
      });
    }
    if (type === 'facture') { if (!printInvoice(appState, id)) ko('Facture indisponible : aucun échéancier pour cette inscription.'); return; }
    if (type === 'reinscrire') {
      await runOperation({
        title: 'Réinscrire', silent: true,
        exec: () => { const created = reinscrireEleve(appState, id, classeProposee); if (created) logOperation(appState, 'inscription', `Réinscription de ${who}`); return created; },
        success: 'Réinscription enregistrée', failure: 'Réinscription impossible : l’élève est déjà inscrit pour l’année active'
      });
    }
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer l’inscription', message: `Supprimer l’inscription de ${who} ?`, danger: true, admin: true,
        exec: () => { const done = deleteInscription(appState, id); if (done) logOperation(appState, 'suppression', `Inscription de ${who} supprimée`); return done; },
        success: 'Inscription supprimée', failure: 'Suppression refusée : des paiements sont liés à cette inscription (historique comptable protégé)'
      });
    }
    return;
  }

  if (scope === 'tarif') {
    const tarif = appState.tarifs.find((t) => t.id === id);
    if (!tarif) return;
    if (type === 'edit') {
      goTo('tarifs');
      const form = document.querySelector('form[data-form="tarif"]');
      const values = { anneeId: tarif.anneeId, classeText: className(tarif.classeId), montantAnnuel: tarif.montantAnnuel, montantMensuel: tarif.montantMensuel || 0, nbMois: tarif.nbMois || 9, moisDebut: tarif.moisDebut || '',
        fraisInscription: tarif.fraisInscription ?? '', fraisReinscription: tarif.fraisReinscription ?? '', remiseMaxPct: tarif.remiseMaxPct || 0,
        fraisAnnexes: (tarif.fraisAnnexes || []).map((a) => `${a.libelle} = ${a.montant}`).join('\n') };
      (tarif.tranches || []).forEach((tr, i) => { values[`tranche${i + 1}`] = tr.montant; values[`dateTranche${i + 1}`] = tr.dateLimite; });
      fillForm(form, values);
      // Montants existants : ne plus les recalculer automatiquement pendant la modification
      form.querySelectorAll('[name^="tranche"], [name="montantMensuel"]').forEach((input) => { input.dataset.touched = '1'; });
      updateTarifInfo(form);
      enterEditMode(form, id, 'Enregistrer les modifications');
    }
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer les frais', permission: 'scolarite.parametrer', message: `Supprimer les frais de ${className(tarif.classeId)} ? Les échéances déjà générées sont conservées.`, danger: true, admin: true,
        exec: () => { const done = deleteTarif(appState, id); if (done) logOperation(appState, 'suppression', `Frais de ${className(tarif.classeId)} supprimés`, tarif.montantAnnuel); return done; },
        success: 'Frais supprimés'
      });
    }
    return;
  }

  if (scope === 'paiement' && type === 'cancel') {
    const payment = appState.paiements.find((p) => p.id === id);
    await runOperation({
      title: 'Annuler le paiement', permission: 'paiements.annuler', message: `Annuler le paiement ${payment?.numeroRecu || id} ? La ligne reste dans l’historique avec son motif ; les tranches concernées sont recalculées.`,
      confirmLabel: 'Annuler le paiement', danger: true, admin: true, adminReason: 'L’annulation d’un paiement est réservée à l’administrateur.',
      field: { label: 'Motif (obligatoire)', required: true },
      exec: (motif) => (motif ? cancelPaiement(appState, id, motif) : false),
      success: 'Paiement annulé — soldes et statistiques mis à jour', failure: 'Annulation impossible : motif manquant ou paiement déjà annulé'
    });
  }
}

// ── Recherche rapide (en-tête) : élèves par nom ou matricule, paiements par n° de reçu ──
function renderQuickSearch(texte) {
  const box = document.getElementById('quickResults');
  if (!box) return;
  const q = String(texte || '').trim().toLocaleLowerCase('fr');
  if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const eleves = appState.eleves.filter((e) => `${e.matricule} ${e.prenom} ${e.nom} ${e.nom} ${e.prenom}`.toLocaleLowerCase('fr').includes(q)).slice(0, 6);
  const recus = appState.paiements.filter((p) => String(p.numeroRecu || '').toLocaleLowerCase('fr').includes(q) || String(p.reference || '').toLocaleLowerCase('fr').includes(q)).slice(0, 4);
  const items = [
    ...eleves.map((e) => { const i = appState.inscriptions.filter((x) => x.eleveId === e.id).sort((a, b) => b.anneeId - a.anneeId)[0]; const c = i && appState.classes.find((x) => x.id === i.classeId);
      return `<li><button type="button" data-quick="eleve:${e.id}"><span><b>${escapeHtml(`${e.prenom} ${e.nom}`)}</b> <span class="meta">${escapeHtml(e.matricule)}</span></span><span class="meta">${escapeHtml(c?.nom || 'non inscrit')}</span></button></li>`
        + (i && can('paiements.encaisser') ? `<li><button type="button" data-quick="encaisser:${i.id}"><span>↳ Encaisser pour ${escapeHtml(e.prenom)}</span><span class="meta">Paiements</span></button></li>` : ''); }),
    ...recus.map((p) => `<li><button type="button" data-quick="recu:${p.id}"><span><b>${escapeHtml(p.numeroRecu || '')}</b> <span class="meta">${escapeHtml(p.reference || '')}</span></span><span class="meta">${formatMoney(p.montant)} ${escapeHtml(appState.config.devise || '')}${p.annule ? ' · annulé' : ''}</span></button></li>`)
  ];
  box.innerHTML = items.join('') || '<li class="meta" style="padding:8px">Aucun résultat.</li>';
  box.hidden = false;
}

async function ouvrirResultatRapide(cle) {
  const [type, raw] = String(cle).split(':');
  const id = Number(raw);
  const box = document.getElementById('quickResults');
  if (box) box.hidden = true;
  const input = document.getElementById('quickSearch');
  if (input) input.value = '';
  if (type === 'eleve') showStudentProfile(appState, id);
  if (type === 'encaisser') { const i = appState.inscriptions.find((x) => x.id === id); if (i) redirectToPayment(i); }
  if (type === 'recu') { const p = appState.paiements.find((x) => x.id === id); if (p && !p.annule) showReceiptPreview(appState, id, { duplicata: true }); else if (p) showDetail(appState, 'paiement', id); }
}

// ── État d'affichage : page, filtres et recherches conservés pendant la session ──
let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistUi, 200);
}

function persistUi() {
  const me = currentUser();
  if (!me) return;
  readListFilters();
  saveUiState(me.id, {
    page: document.querySelector('.content-section.active')?.id || '', anneeActive: shownYearId,
    dashboard: { ...dashboardFilters }, creances: { ...creanceFilters }, etats: { ...etatsFilters }, caisse: { agent: caisseView.agent, compteId: caisseView.compteId }, report: { ...reportFilters }, analyse: { ...analyseFilters }, depense: { ...depenseFilters },
    lists: { ...listFilters }, dettes: { ...detteFilters }, paie: { ...paieView }, encaissements: { ...encFilters }, aide: getAideView()
  });
}

const yearOk = (id) => !id || appState.annees.some((a) => a.id === id);
const classOk = (id) => !id || appState.classes.some((c) => c.id === id);

// Restauration prudente : chaque valeur est revalidée (une année ou une classe supprimée entre-temps est ignorée)
function restoreUi(saved) {
  Object.assign(dashboardFilters, pickKnown(dashboardFilters, saved.dashboard));
  if (!yearOk(dashboardFilters.yearId)) dashboardFilters.yearId = Number(appState.anneeActiveId || 0);
  if (!classOk(dashboardFilters.classId)) dashboardFilters.classId = 0;
  if (!appState.eleves.some((e) => e.id === dashboardFilters.eleveId)) dashboardFilters.eleveId = 0;
  Object.assign(creanceFilters, pickKnown(creanceFilters, saved.creances));
  Object.assign(etatsFilters, pickKnown(etatsFilters, saved.etats));
  if (!ETATS.some((e) => e.id === etatsFilters.type)) etatsFilters.type = 'attendus';
  if (!yearOk(etatsFilters.yearId)) etatsFilters.yearId = Number(appState.anneeActiveId || 0);
  if (!classOk(etatsFilters.classId)) etatsFilters.classId = 0;
  if (saved.caisse) Object.assign(caisseView, { agent: String(saved.caisse.agent || ''), compteId: Number(saved.caisse.compteId || 0) });
  if (!yearOk(creanceFilters.yearId)) creanceFilters.yearId = Number(appState.anneeActiveId || 0);
  if (!classOk(creanceFilters.classId)) creanceFilters.classId = 0;
  Object.assign(reportFilters, pickKnown(reportFilters, saved.report));
  if (!REPORT_TYPES.some((t) => t.id === reportFilters.type)) reportFilters.type = 'periodique';
  if (!yearOk(reportFilters.yearId)) reportFilters.yearId = Number(appState.anneeActiveId || 0);
  if (!classOk(reportFilters.classId)) reportFilters.classId = 0;
  Object.assign(analyseFilters, pickKnown(analyseFilters, saved.analyse));
  if (!DIMENSIONS.some((d) => d.id === analyseFilters.dim)) analyseFilters.dim = 'categorie';
  if (!yearOk(analyseFilters.yearId)) analyseFilters.yearId = 0;
  Object.entries(pickKnown(depenseFilters, saved.depense)).forEach(([key, value]) => setDepenseFilter(key, value));
  if (!yearOk(depenseFilters.yearId)) resetDepenseFilters(appState);
  Object.assign(listFilters, pickKnown(listFilters, saved.lists));
  Object.assign(detteFilters, pickKnown(detteFilters, saved.dettes));
  Object.assign(paieView, pickKnown(paieView, saved.paie));
  Object.assign(encFilters, pickKnown(encFilters, saved.encaissements));
  if (!yearOk(encFilters.yearId)) encFilters.yearId = 0;
  if (!classOk(encFilters.classId)) encFilters.classId = 0;
  if (paieView.mois > todayISO().slice(0, 7)) paieView.mois = todayISO().slice(0, 7);
  setAideView(saved.aide);
  // Filtres mémorisés pour une autre année active : on repart sur l'année active actuelle
  if (Number(saved.anneeActive || 0) !== Number(appState.anneeActiveId || 0)) applyActiveYear();
}

// Session expirée (inactivité, durée maximale, compte désactivé) : retour à la connexion
function sessionLost() {
  if (currentUser()) return false;
  ko('Session expirée : veuillez vous reconnecter.');
  setTimeout(() => window.location.reload(), 1200);
  return true;
}

function watchSession() {
  let lastTouch = 0;
  const activity = () => {
    if (Date.now() - lastTouch < 30000) return;
    lastTouch = Date.now();
    if (!touchSession()) sessionLost();
  };
  ['click', 'keydown'].forEach((type) => document.addEventListener(type, activity, true));
  setInterval(sessionLost, 30000);
  ['input', 'change', 'click'].forEach((type) => document.addEventListener(type, schedulePersist));
}

function initApp() {
  const me = currentUser();
  // À partir d'ici, chaque fonction métier vérifie les droits de l'utilisateur connecté (pas seulement l'affichage)
  activerControleDroits(true);
  // Formulaires présentés derrière un bouton (ouverts au clic ou quand l'application doit les montrer)
  surveillerFormulaires();
  document.getElementById('app-shell').hidden = false;
  bindMenu();
  bindGlobalActions();
  wireForms();
  bindPaymentForm(appState);
  bindAide(appState, { goTo });
  bindLists(appState);
  applyActiveYear();
  const saved = loadUiState(me.id);
  restoreUi(saved);
  renderAll();
  // Page à rouvrir : celle de l'adresse, sinon la dernière consultée, sinon la première autorisée pour le rôle
  const pages = allowedPages();
  const wanted = [window.location.hash.slice(1), saved.page].find((p) => p && pages.includes(p));
  if (wanted) goTo(wanted);
  else openGroup(document.querySelector('.nav-btn[data-group]:not([hidden])')?.dataset.group);
  watchSession();
  startDataFile();
  // Licence en ligne, synchronisation et mises à jour (application de bureau ; sans effet dans un navigateur)
  initCloud(appState);
}

// Une session encore valide (actualisation de la page) évite de repasser par l'écran de connexion
async function boot() {
  // Comptes rattachés à l'établissement de cette base ; un super administrateur existe toujours
  definirEtablissement(appState.config.etablissementId);
  if (!currentUser()) {
    endSession();
    await showLogin(appState.config.nom);
  }
  initApp();
}
boot();
