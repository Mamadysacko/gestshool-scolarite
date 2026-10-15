import { loadState, saveState, exportStateToFile, importStateFromFile, blankState, migrateState } from './storage.js';
import { renderPaiements, showStudentProfile, exportPaymentsCsv, exportStudentsCsv } from './ui.js';
import { renderAnnees, renderClasses, renderEleves, renderInscriptions, renderTarifs } from './modules/views.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderConfig } from './modules/config-view.js';
import { renderDepenses, renderDepenseOutput, setDepenseFilter, resetDepenseFilters, readPiece, printExpenseReceipt } from './modules/depenses-view.js';
import { createDepense, updateDepense, cancelDepense, validateDepense } from './modules/depenses.js';
import { createSafetyBackup, readSafetyBackup, deleteSafetyBackup, deleteAllSafetyBackups, listSafetyBackups } from './modules/sauvegardes.js';
import { showLogin } from './modules/login-view.js';
import { renderAide, bindAide, openAideForPage, getAideView, setAideView } from './modules/aide-view.js';
import { loadUiState, saveUiState, pickKnown } from './modules/ui-state.js';
import { NAV_GROUPS, groupOfPage, pageLabel } from './modules/navigation.js';
import { renderDettes, renderDettesOutput, showDetteDetail, detteFilters } from './modules/dettes-view.js';
import { reporterReliquats } from './modules/reliquats.js';
import { depenseFilters } from './modules/depenses-view.js';
import { REPORT_TYPES } from './modules/rapports.js';
import { DIMENSIONS } from './modules/analyse.js';
import { withTransaction } from './modules/transaction.js';
import { previewPaiement } from './modules/allocation.js';
import { renderAnalyse, renderAnalyseBody, defaultAnalyseFilters } from './modules/analyse.js';
import { renderRapports, renderReportOutput, defaultReportFilters, selectReportType, exportReport, printReport, printReminders } from './modules/rapports.js';
import { printReceipt, printInvoice } from './modules/recus.js';
import { bindPaymentForm, selectStudentForPayment, selectDebtForPayment } from './modules/paiement-form.js';
import { initAutoBackup, chooseBackupFile, scheduleBackup, exportNoteText } from './modules/backup.js';
import { logOperation } from './modules/audit.js';
import { refreshStatuses } from './modules/finance.js';
import { createAnnee, updateAnnee, updateAnneeStatus, deleteAnnee, setAnneeActive } from './modules/annees.js';
import { createClasse, updateClasse, deleteClasse } from './modules/classes.js';
import { createEleve, updateEleve, toggleEleveState, deleteEleve } from './modules/eleves.js';
import { createInscription, deleteInscription, validerInscription, generateEcheancesForInscription, reinscrireEleve } from './modules/inscriptions.js';
import { createTarif, updateTarif, duplicateTarif, deleteTarif, propagateTarif, autoTrancheDates, autoTrancheMontants, autoMontantMensuel } from './modules/tarifs.js';
import { createPaiement, validatePaiement, cancelPaiement, ensureReceiptNumber, changerModalite } from './modules/paiements.js';
import { MODALITES } from './modules/modalites.js';
import { confirmDialog, notify } from './modules/dialog.js';
import { touchSession, requireAdmin, can, currentUser, allowedPages, endSession, authenticate, createUser, changePassword, setUserActive, ROLES, publicUsers, passwordProblem } from './modules/auth.js';
import { showDetail, showReceiptPreview } from './modules/details.js';
import { formatMoney, todayISO } from './modules/utils.js';

const appState = loadState();

// Les anciens paiements reçoivent leur numéro de reçu une seule fois, dans l'ordre chronologique
function ensureAllReceiptNumbers() {
  [...appState.paiements]
    .sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)) || a.id - b.id)
    .forEach((payment) => ensureReceiptNumber(appState, payment));
}

ensureAllReceiptNumbers();
refreshStatuses(appState);
if (reporterReliquats(appState).length) saveState(appState);

const dashboardFilters = { yearId: Number(appState.anneeActiveId || 0), classId: 0, category: '' };
const reportFilters = defaultReportFilters(appState);
const analyseFilters = defaultAnalyseFilters(appState);

const ok = (message) => notify('success', message);
const ko = (message) => notify('error', message);

function updateRoleUi() {
  const me = currentUser();
  const label = document.getElementById('roleLabel');
  if (label && me) label.textContent = `${me.nom} — ${ROLES[me.role]}`;
  const pages = allowedPages();
  document.querySelectorAll('.nav-btn[data-group]').forEach((button) => {
    const group = NAV_GROUPS.find((g) => g.id === button.dataset.group);
    button.hidden = !group || !group.pages.some(([id]) => pages.includes(id));
  });
  const active = document.querySelector('.content-section.active')?.id;
  if (active) renderSubtabs(active);
  document.querySelectorAll('.top-actions').forEach((box) => { box.hidden = !can('write'); });
  const importLabel = document.getElementById('importLabel');
  if (importLabel) importLabel.hidden = !can('admin');
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
  renderRapports(appState, reportFilters);
  renderDepenses(appState);
  renderDettes(appState);
  renderConfig(appState);
  renderAide(appState);
  updateRoleUi();
  restoreListFilters();
}

// Point d'entrée unique après toute opération : numéros, statuts, sauvegarde, copies de secours puis rendu
// de tous les écrans (soldes, tableau de bord et rapports restent ainsi toujours cohérents).
function updateAndRender() {
  ensureAllReceiptNumbers();
  refreshStatuses(appState);
  reporterReliquats(appState);
  if (!saveState(appState)) ko('Sauvegarde impossible : stockage du navigateur plein');
  scheduleBackup(appState);
  renderAll();
}

// Autorisation administrateur si nécessaire, puis confirmation. Les opérations courantes (`silent`) n'ouvrent
// aucune fenêtre : seules les opérations sensibles (suppression, annulation, réinitialisation, finances) demandent confirmation.
async function ask(options) {
  if (options.admin && !(await requireAdmin(appState, options.adminReason, { reauth: Boolean(options.reauth) }))) {
    ko('Autorisation refusée : action réservée à l’administrateur.');
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
async function runOperation({ title, message, confirmLabel, danger, admin, adminReason, reauth, silent, field, exec, success, failure }) {
  if (sessionLost()) return false;
  if (!can('write')) { ko('Votre rôle ne permet pas de modifier les données.'); return false; }
  const answer = await ask({ title, message, confirmLabel, danger, admin, adminReason, reauth, silent, field });
  if (!answer.ok) return false;
  let result;
  try {
    result = withTransaction(appState, () => exec(answer.value));
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
  bar.innerHTML = pages.map(([id, label]) => `<button type="button" class="subtab-btn ${id === pageId ? 'active' : ''}" data-target="${id}" role="tab" aria-selected="${id === pageId}">${label}</button>`).join('');
}

// Affiche une page (sous-onglet) : contrôle des droits, onglet principal actif, titre, adresse, état mémorisé
function goTo(sectionId) {
  if (!allowedPages().includes(sectionId)) return false;
  const group = groupOfPage(sectionId);
  if (!group) return false;
  lastPageOfGroup[group.id] = sectionId;
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
  if (!form) return;
  form.reset();
  delete form.dataset.editId;
  form.querySelectorAll('[data-touched]').forEach((input) => delete input.dataset.touched);
  const cancel = form.querySelector('[data-action="form:reset"]');
  if (cancel) cancel.hidden = true;
  const submit = form.querySelector('[data-submit-label]');
  if (submit && submit.dataset.defaultLabel) submit.textContent = submit.dataset.defaultLabel;
}

function enterEditMode(form, id, label) {
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

const listFilters = { studentSearch: '', studentClass: '', studentStatus: '', paySearch: '', payFrom: '', payTo: '', payStatus: '' };
const LIST_FIELDS = {
  studentSearch: '[data-student-search]', studentClass: '[data-student-class]', studentStatus: '[data-student-status]',
  paySearch: '[data-payment-search]', payFrom: '[data-payment-from]', payTo: '[data-payment-to]', payStatus: '[data-payment-status]'
};

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
}

function applyStudentFilters() {
  readListFilters();
  const search = listFilters.studentSearch.trim().toLocaleLowerCase('fr');
  const classId = listFilters.studentClass;
  const status = listFilters.studentStatus;
  filterRows('[data-student-row]', (row) =>
    (!search || row.dataset.search.includes(search))
    && (!classId || row.dataset.class === classId)
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
    && (!status || row.dataset.status === status), '[data-payment-count]');
}

function bindMenu() {
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
      document.querySelector(`#${target} .section-form`)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function bindGlobalActions() {
  document.getElementById('exportDataBtn')?.addEventListener('click', () => {
    if (!can('write')) { ko('Export non autorisé pour votre rôle.'); return; }
    exportStateToFile(appState, 'school_data.note');
    ok('Données exportées');
  });

  document.getElementById('importDataInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!can('admin')) { ko('Import réservé à l’administrateur.'); return; }
    let imported;
    try { imported = await importStateFromFile(file); } catch (error) { ko('Fichier invalide : import annulé'); return; }
    await runOperation({
      title: 'Importer des données', message: `Remplacer les données actuelles par le contenu de « ${file.name} » ? Une copie de sécurité est créée avant l’import.`, confirmLabel: 'Importer', danger: true, admin: true, reauth: true,
      exec: () => {
        createSafetyBackup(appState, `Avant import de ${file.name}`, currentUser()?.nom);
        replaceState(imported);
        logOperation(appState, 'import', `Import du fichier ${file.name}`);
        return true;
      },
      success: 'Import effectué (copie de sécurité conservée)', failure: 'Import impossible'
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => { endSession(); window.location.reload(); });

  document.getElementById('menuToggle')?.addEventListener('click', () => toggleSidebar());
  // Aide contextuelle : fiches de la page affichée
  document.getElementById('helpBtn')?.addEventListener('click', () => {
    const current = document.querySelector('.content-section.active')?.id || '';
    goTo('aide');
    openAideForPage(current);
  });
  document.getElementById('sidebarScrim')?.addEventListener('click', () => toggleSidebar(false));
}

function toggleSidebar(force) {
  const open = force === undefined ? !document.body.classList.contains('sidebar-open') : force;
  document.body.classList.toggle('sidebar-open', open);
  document.getElementById('menuToggle')?.setAttribute('aria-expanded', String(open));
}

// Réinitialisation complète : administrateur authentifié + mot de passe + mot de confirmation, copie de sécurité obligatoire
async function resetAllData() {
  if (!can('admin')) { ko('Réinitialisation réservée à l’administrateur.'); return; }
  const answer = await confirmDialog({
    title: 'Réinitialiser toutes les données',
    message: 'Élèves, classes, frais, inscriptions, paiements, dépenses et journal seront effacés. Une copie de sécurité est créée avant, et téléchargée.',
    confirmLabel: 'Effacer les données', danger: true,
    fields: [
      { name: 'password', label: 'Votre mot de passe administrateur', type: 'password', required: true },
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
  try { exportStateToFile(appState, `sauvegarde-avant-reinitialisation-${todayISO()}.note`); } catch (error) { /* le téléchargement est un plus */ }
  if (answer.values.purge) listSafetyBackups().filter((b) => b.id !== backup.id).forEach((b) => deleteSafetyBackup(b.id));
  replaceState(blankState(appState));
  logOperation(appState, 'reinitialisation', `Données réinitialisées par ${me.nom} (copie de sécurité n°${backup.id})`);
  resetDepenseFilters(appState);
  dashboardFilters.classId = 0;
  updateAndRender();
  ok('Données réinitialisées — copie de sécurité conservée dans Configuration');
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
  const form = document.querySelector('#tarifs form[data-form="tarif"]');
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
  const form = document.querySelector('#paiements form[data-form="paiement"]');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector('[name="montant"]')?.focus();
}

function redirectToEnrollment(eleve) {
  goTo('inscriptions');
  const form = document.querySelector('#inscriptions form[data-form="inscription"]');
  if (!form) return;
  form.querySelector('[name="eleveText"]').value = studentLabel(eleve);
  const classe = appState.classes.find((c) => c.id === eleve.classeId && c.anneeId === appState.anneeActiveId);
  form.querySelector('[name="classeText"]').value = classe ? classe.nom : '';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.querySelector(classe ? 'button[type="submit"]' : '[name="classeText"]')?.focus();
}

async function submitAnnee(form, formData) {
  const payload = { annee: String(formData.get('annee') || '').trim(), dateDebut: formData.get('dateDebut'), dateFin: formData.get('dateFin'), statut: formData.get('statut') || 'preparation', soldeInitial: Number(formData.get('soldeInitial') || 0), fraisInscription: Number(formData.get('fraisInscription') || 0), fraisReinscription: Number(formData.get('fraisReinscription') || 0) };
  if (payload.dateDebut && payload.dateFin && payload.dateFin <= payload.dateDebut) { ko('La date de fin doit suivre la date de rentrée.'); return; }
  if (payload.soldeInitial < 0) { ko('Le solde d’ouverture ne peut pas être négatif.'); return; }
  if ([payload.fraisInscription, payload.fraisReinscription].some((v) => v < 0 || !Number.isInteger(v))) { ko('Les frais d’inscription et de réinscription doivent être des montants entiers positifs.'); return; }
  const editId = Number(form.dataset.editId || 0);
  const done = await runOperation({
    title: editId ? 'Modifier l’année scolaire' : 'Ajouter l’année scolaire', silent: true,
    admin: Boolean(editId), adminReason: 'La modification d’une année scolaire est réservée à l’administrateur.',
    exec: () => {
      const item = editId ? updateAnnee(appState, editId, payload) : createAnnee(appState, payload);
      if (item) logOperation(appState, 'annee', `${editId ? 'Modification' : 'Création'} de l’année ${item.annee}`);
      return item;
    },
    success: editId ? 'Année modifiée' : 'Année ajoutée', failure: 'Année refusée : libellé vide ou déjà existant'
  });
  if (done) resetForm(document.querySelector('form[data-form="annee"]'));
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
    parent: formData.get('parent'), adresse: formData.get('adresse'), classeId: classe ? classe.id : 0
  };
  const editId = Number(form.dataset.editId || 0);
  let saved = null;
  const done = await runOperation({
    title: editId ? 'Modifier la fiche élève' : 'Ajouter l’élève', silent: true,
    exec: () => {
      saved = editId ? updateEleve(appState, editId, payload) : createEleve(appState, payload);
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
  if (amounts.every((v) => !v)) amounts = autoTrancheMontants(annual);
  if (amounts.reduce((a, b) => a + b, 0) !== annual) { ko('La somme des 3 tranches doit être égale au montant annuel.'); return; }
  const dates = [1, 2, 3].map((n) => formData.get(`dateTranche${n}`) || '');
  const editId = Number(form.dataset.editId || 0);
  const existing = appState.tarifs.find((t) => t.classeId === classe.id && t.anneeId === anneeId);
  if (!editId && existing) { ko('Un tarif existe déjà pour cette classe : utilisez « Modifier ».'); return; }

  const baseline = editId ? (appState.tarifs.find((t) => t.id === editId)?.tranches || []).map((t) => t.dateLimite) : autoTrancheDates(annee);
  const datesChanged = dates.some((d, i) => d && d !== (baseline[i] || ''));
  const monthlyRaw = String(formData.get('montantMensuel') ?? '').trim();
  const nbMois = Number(formData.get('nbMois') || 9);
  const montantMensuel = monthlyRaw === '' ? autoMontantMensuel(annual, nbMois) : Number(monthlyRaw);
  if (!annual || annual <= 0 || !Number.isInteger(annual)) { ko('Le montant annuel doit être un nombre entier supérieur à zéro.'); return; }
  if (!Number.isInteger(montantMensuel) || montantMensuel < 0) { ko('Le montant mensuel doit être un nombre entier positif (0 pour ne pas proposer le paiement mensuel).'); return; }
  if (!Number.isInteger(nbMois) || nbMois < 1 || nbMois > 12) { ko('Le nombre de mensualités doit être compris entre 1 et 12.'); return; }
  if (amounts.some((v) => v < 0 || !Number.isInteger(v))) { ko('Chaque tranche doit être un montant entier positif.'); return; }
  // Cohérence : un total mensuel différent du montant annuel est possible (frais majorés), mais doit être confirmé.
  // Un simple écart d'arrondi (moins d'un franc par mois) est seulement signalé dans le récapitulatif.
  const gap = montantMensuel * nbMois - annual;
  if (montantMensuel > 0 && Math.abs(gap) >= nbMois) {
    const confirmed = await confirmDialog({
      title: 'Montant mensuel différent du montant annuel',
      message: `En paiement mensuel, l’élève paiera ${nbMois} × ${formatMoney(montantMensuel)} = ${formatMoney(montantMensuel * nbMois)} ${appState.config.devise}, soit ${gap > 0 ? '+' : ''}${formatMoney(gap)} par rapport au montant annuel (${formatMoney(annual)}). Confirmer ce montant mensuel ?`,
      confirmLabel: 'Confirmer'
    });
    if (!confirmed.ok) return;
  }
  const payload = {
    classeId: classe.id, anneeId, montantAnnuel: annual, montantMensuel,
    nbMois, moisDebut: formData.get('moisDebut') || '',
    tranches: amounts.map((montant, i) => ({ num: i + 1, libelle: `${i === 0 ? '1ère' : `${i + 1}ème`} tranche`, montant, dateLimite: dates[i] }))
  };
  const done = await runOperation({
    title: editId ? 'Modifier les frais' : 'Ajouter les frais', silent: !editId, admin: datesChanged || Boolean(editId),
    adminReason: 'La modification des montants et des dates d’échéance est réservée à l’administrateur.',
    message: `${editId ? 'Enregistrer les nouveaux frais' : 'Enregistrer les frais'} de ${classe.nom} : ${formatMoney(annual)} ${appState.config.devise} en 3 tranches${montantMensuel ? ` ou ${nbMois} × ${formatMoney(montantMensuel)} par mois` : ''} ?${editId ? ' Les élèves déjà inscrits seront mis à jour (échéances non payées uniquement).' : ''}`,
    exec: () => {
      const item = editId ? updateTarif(appState, editId, payload) : createTarif(appState, payload);
      if (!item) return false;
      // Création comme modification : les élèves déjà inscrits dans la classe reçoivent ou mettent à jour leur échéancier
      const touched = propagateTarif(appState, item);
      logOperation(appState, 'tarif', `Frais de ${classe.nom} ${editId ? 'modifiés' : 'configurés'} (${touched} mise(s) à jour d’échéancier)`, annual);
      return item;
    },
    success: editId ? 'Frais modifiés et répercutés' : 'Frais enregistrés', failure: 'Frais refusés'
  });
  if (done) resetForm(document.querySelector('form[data-form="tarif"]'));
}

async function submitPaiement(form, formData) {
  const payload = {
    inscriptionId: Number(formData.get('inscriptionId')), montant: Number(formData.get('montant')),
    mode: formData.get('mode') || 'espece', reference: String(formData.get('reference') || '').trim(), payeur: String(formData.get('payeur') || '').trim(),
    motifPaiement: String(formData.get('motifPaiement') || '').trim(), modalite: formData.get('modalite') || '', reliquatId: Number(formData.get('reliquatId') || 0),
    datePaiement: formData.get('datePaiement') || '', token: formData.get('token') || ''
  };
  const check = validatePaiement(appState, payload);
  if (!check.ok) {
    if (!check.duplicate) { ko(check.message); return; }
    const again = await confirmDialog({ title: 'Doublon possible', message: `${check.message} Enregistrer quand même ?`, confirmLabel: 'Enregistrer', danger: true });
    if (!again.ok) return;
    payload.token = '';
    payload.ignoreDuplicate = true;
  }
  const print = formData.get('imprimer') === 'on';
  let created = null;
  const done = await runOperation({
    title: 'Enregistrer le paiement', silent: true,
    exec: () => { created = createPaiement(appState, payload, { ignoreDuplicate: Boolean(payload.ignoreDuplicate) }); return created; },
    success: 'Paiement enregistré et réparti automatiquement — soldes et statuts mis à jour', failure: 'Paiement non enregistré'
  });
  if (done && print && created) printReceipt(appState, created.id);
}

async function submitDepense(form, formData) {
  const editId = Number(form.dataset.editId || 0);
  const payload = {
    anneeId: Number(formData.get('anneeId')), date: formData.get('date') || todayISO(), categorie: formData.get('categorie'), montant: Number(formData.get('montant')),
    description: formData.get('description'), beneficiaire: formData.get('beneficiaire'), demandeur: formData.get('demandeur'), reference: formData.get('reference'),
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
    title: editId ? 'Corriger la dépense' : 'Enregistrer la dépense', silent: true, admin: Boolean(editId), adminReason: 'La correction d’une dépense est réservée à l’administrateur (l’ancienne valeur reste tracée).',
    exec: () => { created = editId ? updateDepense(appState, editId, payload) : createDepense(appState, payload, { ignoreDuplicate: !payload.token }); return created; },
    success: editId ? 'Dépense corrigée (historique conservé)' : 'Dépense enregistrée — solde de caisse mis à jour', failure: 'Dépense non enregistrée'
  });
  if (!done) return;
  resetForm(document.querySelector('form[data-form="depense"]'));
  if (!editId && formData.get('imprimer') === 'on' && created) printExpenseReceipt(appState, created.id);
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
      const text = (name) => String(formData.get(name) || '').trim();
      appState.config = {
        ...appState.config,
        nom: text('nom'), sigle: text('sigle'), codeEcole: text('codeEcole'), devise: text('devise') || 'GNF', caissier: text('caissier'), adresse: text('adresse'),
        telephone: text('telephone'), email: text('email'),
        entete: {
          tutelle: text('tutelle').split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
          slogan: text('slogan'), telephones: text('telephones'), email: text('enteteEmail')
        }
      };
      logOperation(appState, 'config', 'Configuration de l’établissement modifiée');
      return true;
    },
    success: 'Configuration enregistrée — le nom du caissier apparaît sur tous les reçus', failure: 'Configuration refusée'
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
    parts.push(`Mensuel : ${f.months} × ${formatMoney(f.monthly)} = ${formatMoney(f.monthlyTotal)} ${devise}${gap ? ` (écart ${Math.abs(gap) < f.months ? 'd’arrondi ' : ''}de ${gap > 0 ? '+' : ''}${formatMoney(gap)} avec le montant annuel)` : ' ✓'}`);
  } else parts.push('Paiement mensuel non proposé (montant mensuel à 0)');
  info.textContent = parts.join(' · ');
  info.className = `meta span-all ${f.tranches !== f.annual ? 'form-error' : (f.monthly > 0 && Math.abs(f.monthlyTotal - f.annual) >= f.months ? 'form-warning' : 'form-ok')}`;
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
    const handlers = { annee: submitAnnee, classe: submitClasse, eleve: submitEleve, inscription: submitInscription, tarif: submitTarif, paiement: submitPaiement, config: submitConfig, depense: submitDepense, utilisateur: submitUtilisateur };
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
    if (t.matches('[data-student-search]')) applyStudentFilters();
    if (t.matches('[data-payment-search]')) applyPaymentFilters();

    // Calcul automatique des tranches (tiers égaux) tant que l'utilisateur ne les a pas saisies lui-même
    if (t.matches('form[data-form="tarif"] [name^="tranche"], form[data-form="tarif"] [name^="dateTranche"], form[data-form="tarif"] [name="montantMensuel"]')) t.dataset.touched = '1';
    if (t.matches('form[data-form="tarif"] [name="montantAnnuel"]')) {
      const form = t.closest('form');
      const montants = autoTrancheMontants(Number(t.value || 0));
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
      if (monthly && !monthly.dataset.touched) monthly.value = annual ? autoMontantMensuel(annual, form.querySelector('[name="nbMois"]').value) : '';
    }
    if (t.matches('form[data-form="tarif"] input')) updateTarifInfo(t.closest('form'));

    // Filtrage immédiat des rapports (le champ garde le focus : seul le résultat est redessiné)
    if (t.matches('[data-rf]')) {
      const key = t.dataset.rf;
      if (key === 'search') reportFilters.search = t.value;
      else if (key === 'classe') reportFilters.classId = findByName(appState.classes.filter((c) => !reportFilters.yearId || c.anneeId === reportFilters.yearId), t.value)?.id || 0;
      else if (key === 'from' || key === 'to' || key === 'dateRef') reportFilters[key] = t.value;
      else if (key === 'gran') reportFilters.gran = t.value;
      else if (key === 'category') { reportFilters.category = t.value; reportFilters.classId = 0; renderRapports(appState, reportFilters); return; }
      else return;
      renderReportOutput(appState, reportFilters);
    }
    if (t.matches('[data-df="demandeur"]')) { setDepenseFilter('demandeur', t.value); renderDepenseOutput(appState); }
    if (t.matches('[data-rf="demandeur"]')) { reportFilters.demandeur = t.value; renderReportOutput(appState, reportFilters); }
    if (t.matches('[data-dettes]')) { detteFilters[t.dataset.dettes] = t.value; renderDettesOutput(appState); }
    if (t.matches('[data-an="search"]')) { analyseFilters.search = t.value; renderAnalyseBody(appState, analyseFilters); }
    if (t.matches('[data-dashboard-filter="class"]')) {
      dashboardFilters.classId = findByName(appState.classes.filter((c) => !dashboardFilters.yearId || c.anneeId === dashboardFilters.yearId), t.value)?.id || 0;
      if (dashboardFilters.classId || !t.value) {
        renderDashboard(appState, dashboardFilters);
        const input = document.querySelector('[data-dashboard-filter="class"]');
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('[data-student-class], [data-student-status]')) applyStudentFilters();
    if (target.matches('[data-payment-from], [data-payment-to], [data-payment-status]')) applyPaymentFilters();

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
      // Journalier : au-delà d'un mois, on recentre la période sur les 30 derniers jours (tableau lisible)
      if (target.value === 'jour' && (!reportFilters.from || (new Date(reportFilters.to || todayISO()) - new Date(reportFilters.from)) / 86400000 > 31)) {
        const start = new Date(); start.setDate(start.getDate() - 30);
        reportFilters.from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        reportFilters.to = todayISO();
      }
      if (target.dataset.rf === 'category') reportFilters.classId = 0;
      renderRapports(appState, reportFilters);
    }
    if (target.matches('[data-rf="yearId"]')) { reportFilters.yearId = Number(target.value || 0); reportFilters.classId = 0; renderRapports(appState, reportFilters); }
    if (target.matches('[data-dashboard-filter="year"]')) { dashboardFilters.yearId = Number(target.value || 0); dashboardFilters.classId = 0; renderDashboard(appState, dashboardFilters); }
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
}

async function handleClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches('[data-modal-close]')) { document.getElementById('modal-root').innerHTML = ''; return; }

  const navLink = event.target.closest('[data-nav]');
  if (navLink) { goTo(navLink.dataset.nav); return; }

  const tab = event.target.closest('[data-report-type]');
  if (tab) { selectReportType(reportFilters, tab.dataset.reportType); renderRapports(appState, reportFilters); return; }

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
  if (action === 'paiement:export-csv') {
    exportPaymentsCsv(appState, {
      search: document.querySelector('[data-payment-search]')?.value, from: document.querySelector('[data-payment-from]')?.value,
      to: document.querySelector('[data-payment-to]')?.value, status: document.querySelector('[data-payment-status]')?.value
    });
    ok('Liste des paiements exportée en CSV');
    return;
  }
  if (action === 'report:students-csv') { exportStudentsCsv(appState); ok('Liste des élèves exportée'); return; }
  if (action === 'report:pdf') { if (!printReport(appState, reportFilters)) ko('Impression impossible'); return; }
  if (action === 'report:excel') { exportReport(appState, reportFilters, 'excel'); ok('Export Excel prêt'); return; }
  if (action === 'report:csv') { exportReport(appState, reportFilters, 'csv'); ok('Export CSV prêt'); return; }
  if (action === 'report:print-reminders') { if (!printReminders(appState, reportFilters)) ko('Aucune fiche à imprimer'); return; }
  if (scope === 'depense') {
    const depense = appState.depenses.find((d) => d.id === id);
    if (!depense) return;
    if (type === 'receipt') { if (!printExpenseReceipt(appState, id)) ko('Reçu indisponible'); updateAndRender(); return; }
    if (type === 'edit') {
      if (!can('admin')) { ko('Correction réservée à l’administrateur.'); return; }
      const form = document.querySelector('form[data-form="depense"]');
      fillForm(form, { anneeId: depense.anneeId, date: depense.date, categorie: depense.categorie, montant: depense.montant, description: depense.description, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference });
      enterEditMode(form, id, 'Enregistrer la correction');
      return;
    }
    if (type === 'cancel') {
      await runOperation({
        title: 'Annuler la dépense', message: `Annuler la dépense ${depense.numero} (${formatMoney(depense.montant)} ${appState.config.devise}) ? Elle reste dans l’historique et n’entre plus dans les totaux.`,
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
        logOperation(appState, 'utilisateur', 'Mot de passe modifié');
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
      if (!(await requireAdmin(appState, 'La suppression d’une copie de sécurité est irréversible : saisissez votre mot de passe.', { reauth: true }))) { ko('Autorisation refusée.'); return; }
      const confirmed = await confirmDialog({ title: 'Supprimer la copie de sécurité', message: `Supprimer définitivement la copie n°${id} ?`, confirmLabel: 'Supprimer', danger: true });
      if (!confirmed.ok) return;
      deleteSafetyBackup(id);
      logOperation(appState, 'sauvegarde', `Copie de sécurité n°${id} supprimée`);
      updateAndRender();
      ok('Copie supprimée');
      return;
    }
    if (type === 'restore') {
      await runOperation({
        title: 'Restaurer la copie de sécurité', message: `Remplacer les données actuelles par la copie n°${id} ? Les données actuelles sont d’abord sauvegardées.`, confirmLabel: 'Restaurer', danger: true, admin: true, reauth: true,
        exec: () => {
          const data = readSafetyBackup(id);
          if (!data) return false;
          createSafetyBackup(appState, `Avant restauration de la copie n°${id}`, currentUser()?.nom);
          replaceState(migrateState(data));
          logOperation(appState, 'sauvegarde', `Copie de sécurité n°${id} restaurée`);
          return true;
        }, success: 'Copie restaurée', failure: 'Restauration impossible'
      });
      return;
    }
  }
  if (action === 'admin:reset') { await resetAllData(); return; }
  if (action === 'admin:purge-backups') {
    if (!can('admin')) { ko('Réservé à l’administrateur.'); return; }
    if (!(await requireAdmin(appState, 'Suppression de TOUTES les copies de sécurité : saisissez votre mot de passe.', { reauth: true }))) { ko('Autorisation refusée.'); return; }
    const confirmed = await confirmDialog({ title: 'Supprimer toutes les copies de sécurité', message: 'Cette action est irréversible.', confirmLabel: 'Tout supprimer', danger: true, field: { label: 'Tapez SUPPRIMER', required: true } });
    if (!confirmed.ok || confirmed.value !== 'SUPPRIMER') { ko('Suppression annulée.'); return; }
    const count = deleteAllSafetyBackups();
    logOperation(appState, 'sauvegarde', `${count} copie(s) de sécurité supprimée(s)`);
    updateAndRender();
    ok('Copies supprimées');
    return;
  }
  if (action === 'backup:txt') { exportNoteText(appState); ok('Note lisible exportée'); return; }
  if (action === 'backup:json') { exportStateToFile(appState, 'school_data.note'); ok('Données exportées'); return; }
  if (action === 'backup:choose') {
    try { await chooseBackupFile(appState); renderConfig(appState); ok('Sauvegarde automatique activée'); }
    catch (error) { if (error.name !== 'AbortError') ko(error.message); }
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
    if (!showReceiptPreview(appState, id)) ko('Reçu indisponible pour ce paiement');
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
    if (type === 'open') await runOperation({ title: 'Valider l’ouverture', message: `Ouvrir l’année ${annee.annee} ? Toute autre année ouverte sera clôturée.`, exec: () => updateAnneeStatus(appState, id, 'ouverte'), success: 'Année ouverte', failure: 'Ouverture impossible' });
    if (type === 'close') await runOperation({ title: 'Clôturer l’année', message: `Clôturer l’année ${annee.annee} ?`, admin: true, exec: () => updateAnneeStatus(appState, id, 'cloturee'), success: 'Année clôturée' });
    if (type === 'active') {
      await runOperation({
        title: 'Définir l’année active', silent: true,
        exec: () => { setAnneeActive(appState, id); dashboardFilters.yearId = id; reportFilters.yearId = id; dashboardFilters.classId = 0; reportFilters.classId = 0; return true; }, success: 'Année active modifiée'
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
      fillForm(form, { matricule: eleve.matricule, nom: eleve.nom, prenom: eleve.prenom, sexe: eleve.sexe, dateNaissance: eleve.dateNaissance, telephone: eleve.telephone, email: eleve.email, parent: eleve.parent, adresse: eleve.adresse, classeText: eleve.classeId ? className(eleve.classeId) : '' });
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
      title: 'Changer la modalité de règlement', confirmLabel: 'Changer',
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
        exec: () => { const created = reinscrireEleve(appState, id); if (created) logOperation(appState, 'inscription', `Réinscription de ${who}`); return created; },
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
      const values = { anneeId: tarif.anneeId, classeText: className(tarif.classeId), montantAnnuel: tarif.montantAnnuel, montantMensuel: tarif.montantMensuel || 0, nbMois: tarif.nbMois || 9, moisDebut: tarif.moisDebut || '' };
      (tarif.tranches || []).forEach((tr, i) => { values[`tranche${i + 1}`] = tr.montant; values[`dateTranche${i + 1}`] = tr.dateLimite; });
      fillForm(form, values);
      // Montants existants : ne plus les recalculer automatiquement pendant la modification
      form.querySelectorAll('[name^="tranche"], [name="montantMensuel"]').forEach((input) => { input.dataset.touched = '1'; });
      updateTarifInfo(form);
      enterEditMode(form, id, 'Enregistrer les modifications');
    }
    if (type === 'duplicate') await runOperation({ title: 'Dupliquer les frais', silent: true, exec: () => duplicateTarif(appState, id), success: 'Frais dupliqués' });
    if (type === 'delete') {
      await runOperation({
        title: 'Supprimer les frais', message: `Supprimer les frais de ${className(tarif.classeId)} ? Les échéances déjà générées sont conservées.`, danger: true, admin: true,
        exec: () => { const done = deleteTarif(appState, id); if (done) logOperation(appState, 'suppression', `Frais de ${className(tarif.classeId)} supprimés`, tarif.montantAnnuel); return done; },
        success: 'Frais supprimés'
      });
    }
    return;
  }

  if (scope === 'paiement' && type === 'cancel') {
    const payment = appState.paiements.find((p) => p.id === id);
    await runOperation({
      title: 'Annuler le paiement', message: `Annuler le paiement ${payment?.numeroRecu || id} ? La ligne reste dans l’historique avec son motif ; les tranches concernées sont recalculées.`,
      confirmLabel: 'Annuler le paiement', danger: true, admin: true, adminReason: 'L’annulation d’un paiement est réservée à l’administrateur.',
      field: { label: 'Motif (obligatoire)', required: true },
      exec: (motif) => (motif ? cancelPaiement(appState, id, motif) : false),
      success: 'Paiement annulé — soldes et statistiques mis à jour', failure: 'Annulation impossible : motif manquant ou paiement déjà annulé'
    });
  }
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
    page: document.querySelector('.content-section.active')?.id || '',
    dashboard: { ...dashboardFilters }, report: { ...reportFilters }, analyse: { ...analyseFilters }, depense: { ...depenseFilters },
    lists: { ...listFilters }, dettes: { ...detteFilters }, aide: getAideView()
  });
}

const yearOk = (id) => !id || appState.annees.some((a) => a.id === id);
const classOk = (id) => !id || appState.classes.some((c) => c.id === id);

// Restauration prudente : chaque valeur est revalidée (une année ou une classe supprimée entre-temps est ignorée)
function restoreUi(saved) {
  Object.assign(dashboardFilters, pickKnown(dashboardFilters, saved.dashboard));
  if (!yearOk(dashboardFilters.yearId)) dashboardFilters.yearId = Number(appState.anneeActiveId || 0);
  if (!classOk(dashboardFilters.classId)) dashboardFilters.classId = 0;
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
  setAideView(saved.aide);
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
  document.getElementById('app-shell').hidden = false;
  bindMenu();
  bindGlobalActions();
  wireForms();
  bindPaymentForm(appState);
  bindAide(appState, { goTo });
  resetDepenseFilters(appState);
  const saved = loadUiState(me.id);
  restoreUi(saved);
  renderAll();
  // Page à rouvrir : celle de l'adresse, sinon la dernière consultée, sinon la première autorisée pour le rôle
  const pages = allowedPages();
  const wanted = [window.location.hash.slice(1), saved.page].find((p) => p && pages.includes(p));
  if (wanted) goTo(wanted);
  else openGroup(document.querySelector('.nav-btn[data-group]:not([hidden])')?.dataset.group);
  watchSession();
  initAutoBackup().then(() => scheduleBackup(appState));
}

// Une session encore valide (actualisation de la page) évite de repasser par l'écran de connexion
async function boot() {
  if (!currentUser()) {
    endSession();
    await showLogin(appState.config.nom);
  }
  initApp();
}
boot();
