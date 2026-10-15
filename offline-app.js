(() => {
  const factories = Object.create(null);
  const cache = Object.create(null);
  factories['./app.js'] = (require, exports) => {
    const { loadState, saveState, exportStateToFile, importStateFromFile, blankState, migrateState } = require("./storage.js");
    const { renderPaiements, showStudentProfile, exportPaymentsCsv, exportStudentsCsv } = require("./ui.js");
    const { renderAnnees, renderClasses, renderEleves, renderInscriptions, renderTarifs } = require("./modules/views.js");
    const { renderDashboard } = require("./modules/dashboard.js");
    const { renderConfig } = require("./modules/config-view.js");
    const { renderDepenses, renderDepenseOutput, setDepenseFilter, resetDepenseFilters, readPiece, printExpenseReceipt } = require("./modules/depenses-view.js");
    const { createDepense, updateDepense, cancelDepense, validateDepense } = require("./modules/depenses.js");
    const { createSafetyBackup, readSafetyBackup, deleteSafetyBackup, deleteAllSafetyBackups, listSafetyBackups } = require("./modules/sauvegardes.js");
    const { showLogin } = require("./modules/login-view.js");
    const { renderAide, bindAide, openAideForPage, getAideView, setAideView } = require("./modules/aide-view.js");
    const { loadUiState, saveUiState, pickKnown } = require("./modules/ui-state.js");
    const { NAV_GROUPS, groupOfPage, pageLabel } = require("./modules/navigation.js");
    const { renderDettes, renderDettesOutput, showDetteDetail, detteFilters } = require("./modules/dettes-view.js");
    const { reporterReliquats } = require("./modules/reliquats.js");
    const { depenseFilters } = require("./modules/depenses-view.js");
    const { REPORT_TYPES } = require("./modules/rapports.js");
    const { DIMENSIONS } = require("./modules/analyse.js");
    const { withTransaction } = require("./modules/transaction.js");
    const { previewPaiement } = require("./modules/allocation.js");
    const { renderAnalyse, renderAnalyseBody, defaultAnalyseFilters } = require("./modules/analyse.js");
    const { renderRapports, renderReportOutput, defaultReportFilters, selectReportType, exportReport, printReport, printReminders } = require("./modules/rapports.js");
    const { printReceipt, printInvoice } = require("./modules/recus.js");
    const { bindPaymentForm, selectStudentForPayment, selectDebtForPayment } = require("./modules/paiement-form.js");
    const { initAutoBackup, chooseBackupFile, scheduleBackup, exportNoteText } = require("./modules/backup.js");
    const { logOperation } = require("./modules/audit.js");
    const { refreshStatuses } = require("./modules/finance.js");
    const { createAnnee, updateAnnee, updateAnneeStatus, deleteAnnee, setAnneeActive } = require("./modules/annees.js");
    const { createClasse, updateClasse, deleteClasse } = require("./modules/classes.js");
    const { createEleve, updateEleve, toggleEleveState, deleteEleve } = require("./modules/eleves.js");
    const { createInscription, deleteInscription, validerInscription, generateEcheancesForInscription, reinscrireEleve } = require("./modules/inscriptions.js");
    const { createTarif, updateTarif, duplicateTarif, deleteTarif, propagateTarif, autoTrancheDates, autoTrancheMontants, autoMontantMensuel } = require("./modules/tarifs.js");
    const { createPaiement, validatePaiement, cancelPaiement, ensureReceiptNumber, changerModalite } = require("./modules/paiements.js");
    const { MODALITES } = require("./modules/modalites.js");
    const { confirmDialog, notify } = require("./modules/dialog.js");
    const { touchSession, requireAdmin, can, currentUser, allowedPages, endSession, authenticate, createUser, changePassword, setUserActive, ROLES, publicUsers, passwordProblem } = require("./modules/auth.js");
    const { showDetail, showReceiptPreview } = require("./modules/details.js");
    const { formatMoney, todayISO } = require("./modules/utils.js");
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
    
    Object.assign(exports, {  });
  };
  factories['./storage.js'] = (require, exports) => {
    const STORAGE_KEY = 'ibk_school_premium_v1';
    
    const DEFAULT_STATE = {
      config: {
        nom: 'Groupe Scolaire IBRAHIMA BABA KAKE',
        sigle: 'IBK',
        codeEcole: 'IBK001',
        devise: 'GNF',
        adresse: 'Conakry, Guinée',
        telephone: '+224 622 000 000',
        email: 'contact@ibk-school.org',
        caissier: ''
      },
      anneeActiveId: 1,
      annees: [
        { id: 1, annee: '2025-2026', dateDebut: '2025-09-01', dateFin: '2026-07-15', statut: 'ouverte', soldeInitial: 0, fraisInscription: 0, fraisReinscription: 0 }
      ],
      classes: [
        { id: 1, nom: 'CP A', categorie: 'Primaire', anneeId: 1, capacite: 40, active: true },
        { id: 2, nom: 'CE1 B', categorie: 'Primaire', anneeId: 1, capacite: 35, active: true },
        { id: 3, nom: '6e A', categorie: 'Collège', anneeId: 1, capacite: 30, active: true }
      ],
      eleves: [
        { id: 1, matricule: 'IBK-001', nom: 'Diallo', prenom: 'Aminata', sexe: 'F', dateNaissance: '2014-05-10', telephone: '+224 600 000 010', email: 'aminata@mail.com', parent: 'Mamadou Diallo', adresse: 'Ratoma', classeId: 1, actif: true },
        { id: 2, matricule: 'IBK-002', nom: 'Camara', prenom: 'Moussa', sexe: 'M', dateNaissance: '2013-09-01', telephone: '+224 600 000 020', email: 'moussa@mail.com', parent: 'Sory Camara', adresse: 'Boulbinet', classeId: 1, actif: true }
      ],
      tarifs: [
        {
          id: 1,
          classeId: 1,
          anneeId: 1,
          montantAnnuel: 900000,
          tranches: [
            { id: 1, num: 1, libelle: '1ère tranche', montant: 300000, dateLimite: '2025-10-30' },
            { id: 2, num: 2, libelle: '2ème tranche', montant: 300000, dateLimite: '2025-12-15' },
            { id: 3, num: 3, libelle: '3ème tranche', montant: 300000, dateLimite: '2026-03-15' }
          ],
          actif: true
        }
      ],
      inscriptions: [
        {
          id: 1,
          eleveId: 1,
          anneeId: 1,
          classeId: 1,
          type: 'nouvelle',
          statut: 'inscrit',
          dateInscription: '2025-09-15',
          echeances: [
            { id: 101, trancheId: 1, montant: 300000, montantPaye: 300000, remise: 0, statut: 'payee', dateLimite: '2025-10-30' },
            { id: 102, trancheId: 2, montant: 300000, montantPaye: 150000, remise: 0, statut: 'partielle', dateLimite: '2025-12-15' },
            { id: 103, trancheId: 3, montant: 300000, montantPaye: 0, remise: 0, statut: 'impayee', dateLimite: '2026-03-15' }
          ]
        }
      ],
      paiements: [
        { id: 1, inscriptionId: 1, echeanceId: 101, montant: 300000, mode: 'mobile_money', reference: 'MM-001', caissier: 'Admin', datePaiement: '2025-10-10', annule: false },
        { id: 2, inscriptionId: 1, echeanceId: 102, montant: 150000, mode: 'espece', reference: 'ESP-014', caissier: 'Admin', datePaiement: '2025-11-20', annule: false }
      ],
      depenses: [],
      reliquats: [],
      journal: [],
      compteursRecu: {},
      compteursDepense: {},
      rapports: {
        note: 'Base prête à l’emploi.'
      }
    };
    
    // Met à niveau un état issu d'une ancienne version (ou d'un import) sans perdre d'information :
    // champs ajoutés avec une valeur neutre, champs supprimés retirés, paiements rattachés à leur année et à leurs imputations.
    function migrateState(raw) {
      const base = structuredClone(DEFAULT_STATE);
      const state = { ...base, ...raw, config: { ...base.config, ...(raw.config || {}) } };
      ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'depenses', 'reliquats', 'journal'].forEach((key) => {
        if (!Array.isArray(state[key])) state[key] = [];
      });
      ['compteursRecu', 'compteursDepense'].forEach((key) => {
        if (!state[key] || typeof state[key] !== 'object') state[key] = {};
      });
      state.annees.forEach((a) => {
        if (typeof a.soldeInitial !== 'number') a.soldeInitial = Number(a.soldeInitial || 0);
        if (typeof a.fraisInscription !== 'number') a.fraisInscription = Number(a.fraisInscription || 0);
        if (typeof a.fraisReinscription !== 'number') a.fraisReinscription = Number(a.fraisReinscription || 0);
      });
      // Les champs « niveau » et « salle » n'existent plus pour les classes
      state.classes.forEach((c) => { delete c.niveau; delete c.salle; });
      // Tarifs : la case « échéancier mensuel » devient un montant mensuel explicite (0 = mensuel non proposé)
      state.tarifs.forEach((t) => {
        if (t.montantMensuel === undefined) {
          const months = Math.min(Math.max(Number(t.nbMois || 9), 1), 12);
          t.montantMensuel = t.mensuel ? Math.ceil(Number(t.montantAnnuel || 0) / months) : 0;
          t.nbMois = months;
          t.moisDebut = t.moisDebut || '';
        }
        delete t.mensuel;
      });
      // Inscriptions : modalité de règlement. Déjà utilisée par un paiement valide → conservée ; sinon « à choisir ».
      state.inscriptions.forEach((i) => {
        if (i.modalite !== undefined) return;
        const paid = state.paiements.some((p) => !p.annule && p.inscriptionId === i.id);
        i.modalite = paid && (i.echeances || []).length ? ((i.echeances || []).some((e) => e.mensualite) ? 'mensuel' : 'tranches') : null;
      });
      state.paiements.forEach((p) => {
        const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
        if (!p.anneeId && inscription) p.anneeId = inscription.anneeId;
        if (!Array.isArray(p.allocations) || !p.allocations.length) {
          p.allocations = p.echeanceId ? [{ echeanceId: p.echeanceId, montant: Number(p.montant || 0) }] : [];
        }
      });
      return state;
    }
    
    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          const fresh = migrateState({});
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          return fresh;
        }
        return migrateState(JSON.parse(raw));
      } catch (error) {
        console.error('Erreur lecture storage', error);
        return migrateState({});
      }
    }
    
    function saveState(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (error) {
        console.error('Erreur écriture storage', error);
        return false;
      }
    }
    
    function exportStateToFile(state, filename = 'school_data.note') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
    
    function importStateFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON');
            resolve(migrateState(parsed));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
        reader.readAsText(file);
      });
    }
    
    // Remise à zéro des données : élèves, classes, frais, inscriptions, paiements, dépenses et journal sont effacés.
    // L'identité de l'établissement et la liste des années scolaires (structure) sont conservées.
    function blankState(current) {
      const base = migrateState({});
      const annees = (current.annees || base.annees).map((a) => ({ ...a, soldeInitial: Number(a.soldeInitial || 0) }));
      return {
        ...base,
        config: { ...base.config, ...(current.config || {}) },
        annees,
        anneeActiveId: current.anneeActiveId || annees[0]?.id || null,
        classes: [], eleves: [], tarifs: [], inscriptions: [], paiements: [], depenses: [], reliquats: [], journal: [], compteursRecu: {}, compteursDepense: {}
      };
    }
    
    function resetData(current) {
      const fresh = blankState(current);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    
    Object.assign(exports, { STORAGE_KEY, DEFAULT_STATE, migrateState, loadState, saveState, exportStateToFile, importStateFromFile, blankState, resetData });
  };
  factories['./ui.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, downloadCsv } = require("./modules/utils.js");
    const { paymentFormHtml, initPaymentForm } = require("./modules/paiement-form.js");
    const { echeancierHtml } = require("./modules/echeancier-view.js");
    const { paymentAllocations, allocationLabel, echeancierSituation } = require("./modules/allocation.js");
    const { can } = require("./modules/auth.js");
    const { MODALITES } = require("./modules/modalites.js");
    function showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2600);
    }
    
    function getClassName(state, id) {
      return state.classes.find((item) => item.id === Number(id))?.nom || '—';
    }
    
    function getEleveName(state, id) {
      const e = state.eleves.find((item) => item.id === Number(id));
      return e ? `${e.prenom} ${e.nom}` : '—';
    }
    
    // Même calcul que partout ailleurs (remises et plafonnement par échéance compris)
    function getInscriptionBalance(inscription) {
      const s = echeancierSituation(inscription);
      return { total: s.total, paye: s.paye, reste: s.reste };
    }
    
    function renderPaiements(state) {
      const section = document.getElementById('paiements');
      section.innerHTML = `
        <div class="page-intro">
          <div><span class="eyebrow">Trésorerie</span><h2>Encaissements et reçus</h2></div>
          <button class="secondary-btn small-btn" data-action="paiement:export-csv">Exporter la liste des paiements CSV</button>
        </div>
        <div class="panel section-form">
          <div class="panel-header"><h3>Enregistrer un paiement</h3><span class="meta">Imputation automatique sur les tranches ou mensualités, dans l’ordre</span></div>
          ${paymentFormHtml(state)}
        </div>
    
        <div class="panel">
          <div class="panel-header"><h3>Journal des paiements</h3><span class="meta" data-payment-count>${state.paiements.length} résultat(s) · annulations conservées</span></div>
          <div class="advanced-search payment-search">
            <label>Recherche <input type="search" data-payment-search placeholder="Élève, référence, mode, caissier…" /></label>
            <label>Du <input type="date" data-payment-from /></label>
            <label>Au <input type="date" data-payment-to /></label>
            <label>État
              <select data-payment-status><option value="">Tous</option><option value="valide">Validés</option><option value="annule">Annulés</option></select>
            </label>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>N° reçu</th><th>Élève</th><th>Matricule</th><th>Classe / année</th><th>Montant</th><th>Imputé sur</th><th>Mode</th><th>Référence</th><th>Caissier</th><th>Date</th><th>État</th><th>Actions</th></tr></thead>
              <tbody>
                ${[...state.paiements].sort((a, b) => String(b.datePaiement).localeCompare(String(a.datePaiement))).map((paiement) => {
                  const inscription = state.inscriptions.find((i) => i.id === paiement.inscriptionId);
                  const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
                  const studentName = eleve ? `${eleve.prenom} ${eleve.nom}` : '—';
                  const searchable = [paiement.numeroRecu, studentName, eleve?.matricule, paiement.reference, paiement.mode, paiement.caissier, paiement.utilisateur].join(' ').toLowerCase();
                  return `
                    <tr data-payment-row data-date="${paiement.datePaiement || ''}" data-status="${paiement.annule ? 'annule' : 'valide'}" data-search="${escapeHtml(searchable)}">
                      <td>${escapeHtml(paiement.numeroRecu || '—')}</td>
                      <td>${studentName}</td>
                      <td>${escapeHtml(eleve?.matricule || '—')}</td>
                      <td>${inscription ? `${getClassName(state, inscription.classeId)} / ${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || '—'}` : '—'}</td>
                      <td>${formatMoney(paiement.montant)} ${state.config.devise}</td>
                      <td>${escapeHtml(paymentAllocations(paiement).map((a) => `${allocationLabel(inscription, a)} (${formatMoney(a.montant)})`).join(' + ') || '—')}</td>
                      <td>${paiement.mode}</td>
                      <td>${paiement.reference || '—'}</td>
                      <td>${escapeHtml(paiement.caissier || '—')}${paiement.utilisateur ? `<div class="meta">saisi par ${escapeHtml(paiement.utilisateur)}</div>` : ''}</td>
                      <td>${paiement.datePaiement}</td>
                      <td><span class="badge ${paiement.annule ? 'danger' : 'ok'}">${paiement.annule ? 'Annulé' : 'Validé'}</span></td>
                      <td>
                        <button class="action-btn" data-action="paiement:view:${paiement.id}">Consulter</button>${paiement.annule ? '' : `<button class="action-btn" data-action="paiement:receipt:${paiement.id}">Reçu</button>
                        ${can('admin') ? `<button class="action-btn delete" data-action="paiement:cancel:${paiement.id}">Annuler</button>` : ''}`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      initPaymentForm(state);
    }
    
    function exportPaymentsCsv(state, filters = {}) {
      const search = String(filters.search || '').trim().toLocaleLowerCase('fr');
      const status = filters.status || '';
      const from = filters.from || '';
      const to = filters.to || '';
      const rows = [['Date', 'Matricule', 'Élève', 'Année scolaire', 'Classe', 'Échéance', 'Montant', 'Devise', 'Mode', 'Référence', 'Caissier', 'État', 'Motif annulation']];
      const payments = [...state.paiements]
        .filter((payment) => {
          const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
          const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
          const haystack = [eleve?.matricule, eleve?.prenom, eleve?.nom, payment.reference, payment.mode, payment.caissier]
            .join(' ').toLocaleLowerCase('fr');
          return (!search || haystack.includes(search))
            && (!status || (payment.annule ? 'annule' : 'valide') === status)
            && (!from || payment.datePaiement >= from)
            && (!to || payment.datePaiement <= to);
        })
        .sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)));
    
      payments.forEach((payment) => {
        const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
        const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
        rows.push([
          payment.datePaiement,
          eleve?.matricule || '',
          eleve ? `${eleve.prenom} ${eleve.nom}` : '',
          state.annees.find((item) => item.id === inscription?.anneeId)?.annee || '',
          getClassName(state, inscription?.classeId),
          paymentAllocations(payment).map((a) => `${allocationLabel(inscription, a)}: ${a.montant}`).join(' + '),
          payment.montant,
          state.config.devise,
          payment.mode,
          payment.reference,
          payment.caissier,
          payment.annule ? 'Annulé' : 'Validé',
          payment.motif || ''
        ]);
      });
    
      downloadCsv('liste-paiements.csv', rows);
    }
    
    function exportStudentsCsv(state) {
      const rows = [['Matricule', 'Prénom', 'Nom', 'Sexe', 'Date de naissance', 'Parent / tuteur', 'Téléphone', 'E-mail', 'Adresse', 'Classe', 'Statut']];
      state.eleves.forEach((eleve) => rows.push([
        eleve.matricule, eleve.prenom, eleve.nom, eleve.sexe, eleve.dateNaissance, eleve.parent,
        eleve.telephone, eleve.email, eleve.adresse, getClassName(state, eleve.classeId), eleve.actif ? 'Actif' : 'Inactif'
      ]));
      downloadCsv('liste-eleves.csv', rows);
    }
    
    function showStudentProfile(state, studentId) {
      const student = state.eleves.find((item) => item.id === Number(studentId));
      const modalRoot = document.getElementById('modal-root');
      if (!student || !modalRoot) return false;
    
      const inscriptions = state.inscriptions
        .filter((inscription) => inscription.eleveId === student.id)
        .sort((a, b) => String(b.dateInscription).localeCompare(String(a.dateInscription)));
      const history = [];
      inscriptions.forEach((inscription) => {
        history.push({
          date: inscription.dateInscription,
          type: inscription.type === 'reinscription' ? 'Réinscription' : 'Inscription',
          detail: `${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || 'Année inconnue'} — ${getClassName(state, inscription.classeId)}`,
          amount: '',
          status: inscription.statut
        });
        state.paiements.filter((payment) => payment.inscriptionId === inscription.id).forEach((payment) => {
          history.push({
            date: payment.datePaiement,
            type: payment.annule ? 'Paiement annulé' : 'Paiement',
            detail: `${payment.reference || 'Sans référence'} — ${payment.mode}${payment.motif ? ` — ${payment.motif}` : ''}`,
            amount: `${formatMoney(payment.montant)} ${state.config.devise}`,
            status: payment.annule ? 'Annulé' : 'Validé'
          });
        });
      });
      history.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const lifetimePaid = state.paiements
        .filter((payment) => !payment.annule && inscriptions.some((inscription) => inscription.id === payment.inscriptionId))
        .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
      const lifetimeDue = inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
    
      modalRoot.innerHTML = `
        <div class="modal-backdrop" data-modal-close>
          <section class="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
            <header class="modal-header">
              <div><span class="eyebrow">Dossier permanent</span><h2 id="student-profile-title">${escapeHtml(student.prenom)} ${escapeHtml(student.nom)}</h2><span class="meta">Matricule ${escapeHtml(student.matricule)}</span></div>
              <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button>
            </header>
            <div class="profile-grid">
              <div class="profile-info">
                <h3>Informations personnelles</h3>
                <dl>
                  <dt>Sexe</dt><dd>${student.sexe === 'F' ? 'Féminin' : 'Masculin'}</dd>
                  <dt>Date de naissance</dt><dd>${escapeHtml(student.dateNaissance || '—')}</dd>
                  <dt>Parent / tuteur</dt><dd>${escapeHtml(student.parent || '—')}</dd>
                  <dt>Téléphone</dt><dd>${escapeHtml(student.telephone || '—')}</dd>
                  <dt>E-mail</dt><dd>${escapeHtml(student.email || '—')}</dd>
                  <dt>Adresse</dt><dd>${escapeHtml(student.adresse || '—')}</dd>
                </dl>
              </div>
              <div class="profile-summary">
                <h3>Situation financière cumulée</h3>
                <div class="profile-metric"><span>Frais enregistrés</span><strong>${formatMoney(lifetimeDue)} ${state.config.devise}</strong></div>
                <div class="profile-metric"><span>Montant encaissé</span><strong>${formatMoney(lifetimePaid)} ${state.config.devise}</strong></div>
                <div class="profile-metric"><span>Solde restant</span><strong>${formatMoney(Math.max(lifetimeDue - lifetimePaid, 0))} ${state.config.devise}</strong></div>
              </div>
            </div>
            <div class="profile-section">
              <h3>Inscriptions et échéances</h3>
              ${inscriptions.map((inscription) => {
                const balance = getInscriptionBalance(inscription);
                return `<article class="profile-enrollment">
                  <div class="enrollment-heading"><strong>${escapeHtml(state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || 'Année inconnue')} · ${escapeHtml(getClassName(state, inscription.classeId))}</strong>
                    <span class="badge info">${escapeHtml(inscription.modalite ? MODALITES[inscription.modalite] : 'Modalité à choisir')}</span>
                    <span class="badge ${balance.reste ? 'warning' : 'ok'}">${formatMoney(balance.reste)} ${state.config.devise} restant</span>
                    ${(inscription.echeances || []).length ? `<button type="button" class="action-btn" data-action="inscription:facture:${inscription.id}">Facture</button>` : ''}</div>
                  ${echeancierHtml(state, inscription)}
                </article>`;
              }).join('') || '<p class="meta">Aucune inscription enregistrée pour cet élève.</p>'}
            </div>
            <div class="profile-section">
              <h3>Historique complet</h3>
              <div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Montant</th><th>Statut</th></tr></thead>
                <tbody>${history.map((item) => `<tr><td>${escapeHtml(item.date || '—')}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.detail)}</td><td>${escapeHtml(item.amount)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') || '<tr><td colspan="5">Aucun événement dans l\'historique.</td></tr>'}</tbody>
              </table></div>
            </div>
          </section>
        </div>
      `;
      return true;
    }
    
    Object.assign(exports, { showToast, getClassName, getEleveName, renderPaiements, exportPaymentsCsv, exportStudentsCsv, showStudentProfile });
  };
  factories['./modules/utils.js'] = (require, exports) => {
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }
    
    function formatMoney(value) {
      return Number(value || 0).toLocaleString('fr-FR');
    }
    
    function todayISO() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    
    function formatDateFr(iso) {
      if (!iso) return '—';
      const [y, m, d] = String(iso).slice(0, 10).split('-');
      return y && m && d ? `${d}/${m}/${y}` : String(iso);
    }
    
    const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    
    function below100(n, final) {
      if (n < 17) return UNITS[n];
      if (n < 20) return `dix-${UNITS[n - 10]}`;
      if (n < 70) {
        const t = Math.floor(n / 10);
        const u = n % 10;
        if (u === 0) return TENS[t];
        return u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
      }
      if (n < 80) {
        const r = n - 60;
        return r === 11 ? 'soixante et onze' : `soixante-${below100(r, final)}`;
      }
      if (n === 80) return final ? 'quatre-vingts' : 'quatre-vingt';
      return `quatre-vingt-${below100(n - 80, final)}`;
    }
    
    function below1000(n, final) {
      const h = Math.floor(n / 100);
      const r = n % 100;
      const parts = [];
      if (h === 1) parts.push('cent');
      else if (h > 1) parts.push(`${UNITS[h]} cent${r === 0 && final ? 's' : ''}`);
      if (r > 0) parts.push(below100(r, final));
      return parts.join(' ');
    }
    
    function numberToFrench(value) {
      let n = Math.floor(Math.abs(Number(value) || 0));
      if (n === 0) return 'zéro';
      const parts = [];
      for (const [size, name] of [[1e9, 'milliard'], [1e6, 'million']]) {
        const count = Math.floor(n / size);
        if (count) {
          parts.push(`${below1000(count, false)} ${name}${count > 1 ? 's' : ''}`);
          n %= size;
        }
      }
      const thousands = Math.floor(n / 1000);
      if (thousands) {
        parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
        n %= 1000;
      }
      if (n) parts.push(below1000(n, true));
      return parts.join(' ');
    }
    
    function downloadBlob(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    
    function downloadCsv(filename, rows) {
      const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      downloadBlob(filename, `﻿${csv}`, 'text/csv;charset=utf-8');
    }
    
    // Excel ouvre nativement un tableau HTML enregistré en .xls ; les lignes marquées (kind) reçoivent une mise en forme
    const XLS_STYLE = {
      entete: 'font-weight:bold;font-size:13pt;color:#1e3a8a',
      title: 'font-weight:bold;font-size:15pt;color:#7c3aed',
      section: 'font-weight:bold;font-size:12pt;color:#c2410c',
      kpi: 'font-weight:bold;background:#faf5ff',
      head: 'font-weight:bold;color:#ffffff;background:#7c3aed;border:1px solid #5b21b6',
      foot: 'font-weight:bold;background:#fff7ed;border:1px solid #fdba74'
    };
    
    function downloadExcel(filename, title, rows) {
      const body = rows.map((row, index) => {
        const kind = row.kind || (index === 0 && !rows.some((r) => r.kind) ? 'head' : '');
        const style = XLS_STYLE[kind] || '';
        const tag = kind === 'head' ? 'th' : 'td';
        return `<tr>${row.map((cell) => {
          const numeric = typeof cell === 'number';
          const cellStyle = `${style};${numeric ? 'text-align:right;mso-number-format:"#,##0"' : ''};${!kind && row.length > 1 ? 'border:1px solid #e5e7eb' : ''}`;
          return `<${tag} style='${cellStyle}'>${escapeHtml(cell)}</${tag}>`;
        }).join('')}</tr>`;
      }).join('');
      const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body><table style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">${body}</table></body></html>`;
      downloadBlob(filename, `﻿${html}`, 'application/vnd.ms-excel;charset=utf-8');
    }
    
    Object.assign(exports, { escapeHtml, formatMoney, todayISO, formatDateFr, numberToFrench, downloadBlob, downloadCsv, downloadExcel });
  };
  factories['./modules/paiement-form.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { previewPaiement, STATUT_GLOBAL_LABELS } = require("./allocation.js");
    const { echeancierHtml, allocationTableHtml, progressBar } = require("./echeancier-view.js");
    const { cashierName } = require("./paiements.js");
    const { MODALITES, tarifFor, modalitesDisponibles, hasValidPayments, modaliteActuelle, planPourModalite, totalTranches, totalMensuel } = require("./modalites.js");
    const { studentOf } = require("./finance.js");
    const { reliquatsEleve, reliquatOf, situationReliquat, anneeEncaissement } = require("./reliquats.js");
    // Formulaire de paiement : recherche dynamique de l'élève (nom ou matricule) → fiche et échéancier remplis
    // automatiquement → montant → aperçu immédiat de l'imputation et du solde.
    const selection = { inscriptionId: 0, modalite: '', reliquatId: 0 };
    const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';
    const root = { state: null, form: null };
    const MODES = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte' };
    
    const label = (state, inscription) => {
      const s = studentOf(state, inscription);
      return s ? `${s.matricule} — ${s.prenom} ${s.nom}` : '';
    };
    
    function yearId(form) { return Number(form.querySelector('[data-pay="year"]').value || 0); }
    
    function matches(state, inscription, query) {
      const s = studentOf(state, inscription);
      const classe = state.classes.find((c) => c.id === inscription.classeId);
      const haystack = `${s?.matricule || ''} ${s?.prenom || ''} ${s?.nom || ''} ${s?.nom || ''} ${s?.prenom || ''} ${classe?.nom || ''}`.toLocaleLowerCase('fr');
      return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
    }
    
    function search(root) {
      const query = root.form.querySelector('[data-pay="student"]').value.trim().toLocaleLowerCase('fr');
      const y = yearId(root.form);
      return root.state.inscriptions.filter((i) => i.anneeId === y && ['inscrit', 'payee', 'partielle', 'en_retard'].includes(i.statut) && (!query || matches(root.state, i, query)));
    }
    
    function renderResults(root, force = false) {
      const box = root.form.querySelector('[data-pay-results]');
      const input = root.form.querySelector('[data-pay="student"]');
      const query = input.value.trim();
      if (!force && (!query || selection.inscriptionId)) { box.hidden = true; return; }
      const list = search(root).slice(0, 8);
      box.hidden = false;
      box.innerHTML = list.length
        ? list.map((i) => {
          const s = studentOf(root.state, i);
          const c = root.state.classes.find((x) => x.id === i.classeId);
          return `<li><button type="button" data-pay-pick="${i.id}"><b>${escapeHtml(s.matricule)}</b> ${escapeHtml(s.prenom)} ${escapeHtml(s.nom)} <span class="meta">${escapeHtml(c?.nom || '—')}</span></button></li>`;
        }).join('')
        : '<li class="meta empty">Aucun élève inscrit ne correspond pour cette année scolaire.</li>';
    }
    
    // Échéancier à afficher / utiliser : celui de la modalité choisie, sinon l'échéancier actuel (provisoire)
    function currentPlan(state, inscription) {
      if (!inscription) return null;
      if (!selection.modalite) return { ok: false, pending: true, echeances: inscription.echeances || [] };
      return planPourModalite(state, inscription, selection.modalite);
    }
    
    function modaliteHtml(state, inscription, plan) {
      const tarif = tarifFor(state, inscription);
      const paid = hasValidPayments(state, inscription);
      const actuelle = modaliteActuelle(inscription);
      const devise = escapeHtml(state.config.devise);
      if (!tarif && !paid) {
        return `<div class="form-error">Aucun tarif n’est configuré pour la classe de cet élève : aucun paiement ne peut être enregistré. <button type="button" class="link-btn" data-nav="tarifs">Configurer les frais</button></div>`;
      }
      const dispo = tarif ? modalitesDisponibles(tarif) : { tranches: actuelle === 'tranches', mensuel: actuelle === 'mensuel' };
      const details = {
        tranches: tarif ? `${(tarif.tranches || []).length} tranches · ${formatMoney(totalTranches(tarif))} ${devise}` : '',
        mensuel: tarif && Number(tarif.montantMensuel) > 0 ? `${tarif.nbMois} × ${formatMoney(tarif.montantMensuel)} = ${formatMoney(totalMensuel(tarif))} ${devise}` : 'Montant mensuel non défini dans le tarif'
      };
      const option = (key) => `<label class="modalite-option ${selection.modalite === key ? 'selected' : ''} ${dispo[key] ? '' : 'disabled'}">
          <input type="radio" name="modalite" value="${key}" data-pay="modalite" ${selection.modalite === key ? 'checked' : ''} ${dispo[key] ? '' : 'disabled'} required />
          <span><b>${MODALITES[key]}</b><small>${escapeHtml(details[key])}${actuelle === key && inscription.modalite ? ' · modalité actuelle' : ''}</small></span></label>`;
      const changement = Boolean(inscription.modalite) && selection.modalite && selection.modalite !== inscription.modalite;
      const dejaPaye = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).reduce((sum, p) => sum + Number(p.montant || 0), 0);
      let note = '';
      if (changement && plan?.ok) {
        note = `<div class="form-warning">Changement de modalité : ${escapeHtml(MODALITES[inscription.modalite])} → ${escapeHtml(MODALITES[selection.modalite])}.
          ${paid ? `Les ${formatMoney(dejaPaye)} ${devise} déjà payés sont réimputés sur le nouvel échéancier, sans suppression ni double comptage (ancienne répartition conservée dans l’historique).` : ''}
          Le changement est appliqué avec le prochain paiement, ou tout de suite : <button type="button" class="secondary-btn small-btn" data-action="inscription:modalite-${selection.modalite}:${inscription.id}">Appliquer sans encaisser</button></div>`;
      } else if (!inscription.modalite) {
        note = '<p class="meta">Choisissez la modalité : l’échéancier s’adapte automatiquement et sera conservé pour les paiements suivants. Elle reste modifiable en cours d’année.</p>';
      }
      return `<fieldset class="modalite-choice"><legend>Modalité de règlement <span class="required-mark">*</span></legend>
          <div class="modalite-options">${option('tranches')}${option('mensuel')}</div>${note}
        </fieldset>`;
    }
    
    // Dettes des années précédentes : affichées sur la fiche, réglables en un clic
    function dettesHtml(state, inscription) {
      const devise = escapeHtml(state.config.devise);
      if (selection.reliquatId) {
        const r = situationReliquat(state, (state.reliquats || []).find((x) => x.id === selection.reliquatId));
        const courante = state.inscriptions.find((i) => i.eleveId === inscription.eleveId && i.anneeId === state.anneeActiveId && i.id !== inscription.id);
        return `<div class="debt-banner active"><b>Règlement d’une dette antérieure — année ${escapeHtml(yearName(state, r.anneeOrigineId))}</b>
          <span>Reporté le ${escapeHtml(formatDateFr(r.dateReport))} : ${formatMoney(r.montantReporte)} · remboursé ${formatMoney(r.rembourse)} · <b>reste ${formatMoney(r.reste)} ${devise}</b>. Encaissé sur l’année ${escapeHtml(yearName(state, anneeEncaissement(state, r)))}.</span>
          ${courante ? `<button type="button" class="link-btn" data-pay-scolarite="${courante.id}">Revenir à la scolarité ${escapeHtml(yearName(state, courante.anneeId))}</button>` : ''}</div>`;
      }
      const dettes = reliquatsEleve(state, inscription.eleveId).filter((r) => r.reste > 0 && r.inscriptionId !== inscription.id);
      if (!dettes.length) return '';
      return `<div class="debt-banner"><b>Dette antérieure : ${formatMoney(dettes.reduce((sum, r) => sum + r.reste, 0))} ${devise}</b>
        <ul>${dettes.map((r) => `<li>Année ${escapeHtml(yearName(state, r.anneeOrigineId))} : reste ${formatMoney(r.reste)} ${devise} <button type="button" class="secondary-btn small-btn" data-pay-dette="${r.id}">Régler cette dette</button></li>`).join('')}</ul></div>`;
    }
    
    function currentInscription(root) {
      return root.state.inscriptions.find((i) => i.id === selection.inscriptionId) || null;
    }
    
    function renderStudent(root) {
      const { state, form } = root;
      const card = form.querySelector('[data-pay-card]');
      const inscription = currentInscription(root);
      form.querySelector('[name="inscriptionId"]').value = inscription ? inscription.id : '';
      form.querySelector('[name="reliquatId"]').value = inscription && selection.reliquatId ? selection.reliquatId : '';
      const submit = form.querySelector('[data-pay-submit]');
      if (!inscription) {
        card.innerHTML = '<p class="meta">Tapez le nom ou le matricule de l’élève : la fiche, les frais et l’historique s’affichent automatiquement.</p>';
        if (submit) submit.disabled = true;
        renderPreview(root);
        return;
      }
      const s = studentOf(state, inscription);
      const classe = state.classes.find((c) => c.id === inscription.classeId);
      const annee = state.annees.find((a) => a.id === inscription.anneeId);
      const history = state.paiements.filter((p) => p.inscriptionId === inscription.id).sort((a, b) => b.id - a.id);
      const plan = currentPlan(state, inscription);
      const schedule = { echeances: plan?.echeances || [] };
      card.innerHTML = `<div class="student-card">
          <div class="student-id">
            <div><span class="eyebrow">Élève</span><strong>${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</strong></div>
            <div><span class="eyebrow">Matricule</span><strong>${escapeHtml(s.matricule)}</strong></div>
            <div><span class="eyebrow">Classe</span><strong>${escapeHtml(classe?.nom || '—')}</strong></div>
            <div><span class="eyebrow">Catégorie</span><strong>${escapeHtml(classe?.categorie || '—')}</strong></div>
            <div><span class="eyebrow">Année scolaire</span><strong>${escapeHtml(annee?.annee || '—')}</strong></div>
          </div>
          ${dettesHtml(state, inscription)}
          ${selection.reliquatId ? '' : modaliteHtml(state, inscription, plan)}
          ${plan && !plan.ok && !plan.pending ? `<p class="form-error">${escapeHtml(plan.message)}</p>` : ''}
          ${schedule.echeances.length ? `<div class="schedule-title"><b>${selection.reliquatId ? `Échéancier ${escapeHtml(yearName(state, inscription.anneeId))} (dette)` : plan?.ok ? `Échéancier — ${escapeHtml(MODALITES[selection.modalite])}` : 'Échéancier actuel (provisoire, modalité à choisir)'}</b>
            <button type="button" class="secondary-btn small-btn" data-action="inscription:facture:${inscription.id}">Imprimer la facture</button></div>${echeancierHtml(state, schedule)}` : ''}
          <details class="pay-history" ${history.length ? '' : 'hidden'}><summary>Paiements précédents (${history.length})</summary>
            <ul>${history.map((p) => `<li class="${p.annule ? 'cancelled' : ''}"><span>${escapeHtml(formatDateFr(p.datePaiement))} · ${escapeHtml(p.numeroRecu || '')}</span><b>${formatMoney(p.montant)} ${escapeHtml(state.config.devise)}</b><span class="meta">${p.annule ? 'annulé' : escapeHtml(MODES[p.mode] || p.mode)}</span></li>`).join('')}</ul></details>
        </div>`;
      if (submit) submit.disabled = !(plan && plan.ok);
      renderPreview(root);
    }
    
    function renderPreview(root) {
      const { state, form } = root;
      const box = form.querySelector('[data-pay-preview]');
      const inscription = currentInscription(root);
      const devise = escapeHtml(state.config.devise);
      if (!inscription) { box.innerHTML = ''; return; }
      const plan = currentPlan(state, inscription);
      if (!plan.ok) { box.innerHTML = `<div class="pay-preview"><p class="meta">${plan.pending ? 'Choisissez la modalité de règlement pour voir la répartition du paiement.' : escapeHtml(plan.message)}</p></div>`; return; }
      const montant = Math.floor(Number(form.querySelector('[name="montant"]').value || 0));
      const p = previewPaiement({ echeances: plan.echeances }, montant);
      const statut = montant > 0 && !p.nonImpute ? p.after.statut : p.before.statut;
      const over = p.nonImpute > 0;
      box.innerHTML = `<div class="pay-preview ${over ? 'invalid' : ''}">
          <div class="pay-kpis">
            <div><span>Montant attendu</span><b>${formatMoney(p.before.total)} ${devise}</b></div>
            <div><span>Déjà payé</span><b>${formatMoney(p.before.paye)} ${devise}</b></div>
            <div><span>Ce paiement</span><b>${formatMoney(montant)} ${devise}</b></div>
            <div><span>Reste après paiement</span><b>${formatMoney(over ? p.before.reste : p.after.reste)} ${devise}</b></div>
            <div><span>Statut</span><b>${escapeHtml(STATUT_GLOBAL_LABELS[statut])}</b></div>
          </div>
          ${progressBar(over ? p.before.taux : p.after.taux)}
          ${over ? `<p class="form-error">Le montant dépasse le solde de l’année (${formatMoney(p.before.reste)} ${devise}). Un excédent n’est jamais reporté sur une autre année scolaire.</p>` : ''}
          ${p.allocations.length ? `<h4>Répartition automatique du paiement</h4>${allocationTableHtml(state, p.allocations)}
            ${p.allocations.length > 1 ? '<p class="meta">Le montant dépasse la tranche en cours : l’excédent est imputé sur la tranche suivante.</p>' : ''}` : ''}
        </div>`;
    }
    
    function paymentFormHtml(state) {
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return `<form class="form-grid compact pay-form" data-form="paiement" autocomplete="off">
        <input type="hidden" name="token" value="${token}" /><input type="hidden" name="inscriptionId" /><input type="hidden" name="reliquatId" />
        <label>Année scolaire
          <select data-pay="year" name="anneeId">${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
        </label>
        <label class="span-two search-field">Élève — nom ou matricule
          <input type="search" data-pay="student" placeholder="Ex : IBK-2026-0001 ou Aminata" role="combobox" aria-autocomplete="list" />
          <ul class="search-results" data-pay-results hidden></ul>
        </label>
        <div class="span-all" data-pay-card></div>
        <label>Montant payé (${escapeHtml(state.config.devise)})
          <span class="input-row"><input name="montant" data-pay="montant" type="number" min="1" step="1" required /><button type="button" class="secondary-btn small-btn" data-pay-solder>Solder tout</button></span>
        </label>
        <label>Moyen de paiement
          <select name="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        </label>
        <label>Date du paiement <input name="datePaiement" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
        <label>Référence (chèque, transaction…) <input name="reference" type="text" /></label>
        <label>Payeur (si différent de l’élève) <input name="payeur" type="text" /></label>
        <label>Description / motif <input name="motifPaiement" type="text" placeholder="Frais de scolarité" /></label>
        <p class="meta span-all">Caissier : <b>${escapeHtml(cashierName(state))}</b> — enregistré automatiquement sur le reçu et dans l’historique.</p>
        <div class="span-all" data-pay-preview></div>
        <label class="check-row"><input type="checkbox" name="imprimer" checked /> Imprimer le reçu après l’enregistrement</label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn" data-pay-submit disabled>Enregistrer le paiement</button></div>
      </form>`;
    }
    
    function initPaymentForm(state) {
      const form = document.querySelector('form[data-form="paiement"]');
      if (!form) return;
      root.state = state;
      root.form = form;
      selection.inscriptionId = 0;
      selection.modalite = '';
      selection.reliquatId = 0;
      renderStudent(root);
    }
    
    // Depuis la page « Dettes antérieures » ou la fiche : bascule le formulaire sur l'inscription d'origine de la dette
    function selectDebtForPayment(state, reliquatId) {
      const record = (state.reliquats || []).find((r) => r.id === Number(reliquatId));
      if (!record) return false;
      return selectStudentForPayment(state, record.inscriptionId);
    }
    
    // Utilisé après une inscription : sélectionne directement l'élève (année, fiche, échéancier pré-remplis)
    function selectStudentForPayment(state, inscriptionId) {
      const form = document.querySelector('form[data-form="paiement"]');
      const inscription = state.inscriptions.find((i) => i.id === Number(inscriptionId));
      if (!form || !inscription) return false;
      root.state = state;
      root.form = form;
      form.querySelector('[data-pay="year"]').value = String(inscription.anneeId);
      selection.inscriptionId = inscription.id;
      const reliquat = reliquatOf(state, inscription.id);
      selection.reliquatId = reliquat ? reliquat.id : 0;
      selection.modalite = reliquat ? (modaliteActuelle(inscription) || 'tranches') : (modaliteActuelle(inscription) && (inscription.modalite || hasValidPayments(state, inscription)) ? modaliteActuelle(inscription) : '');
      form.querySelector('[data-pay="student"]').value = label(state, inscription);
      renderResults(root);
      renderStudent(root);
      return true;
    }
    
    // Appelée une fois : écouteurs délégués, valables après chaque re-rendu.
    function bindPaymentForm(state) {
      document.addEventListener('input', (event) => {
        const t = event.target;
        if (!(t instanceof HTMLElement) || !t.matches('form[data-form="paiement"] [data-pay]')) return;
        root.state = state;
        root.form = t.closest('form');
        if (t.matches('[data-pay="montant"]')) { renderPreview(root); return; }
        if (t.matches('[data-pay="modalite"]')) { selection.modalite = t.value; renderStudent(root); return; }
        if (t.matches('[data-pay="student"]')) {
          // Toute frappe annule la sélection précédente et relance la recherche
          selection.inscriptionId = 0;
          selection.modalite = '';
          selection.reliquatId = 0;
          renderResults(root);
          const found = search(root);
          const typed = t.value.trim().toLocaleLowerCase('fr');
          const exact = found.filter((i) => label(state, i).toLocaleLowerCase('fr') === typed || studentOf(state, i)?.matricule.toLocaleLowerCase('fr') === typed);
          if (exact.length === 1) { selectStudentForPayment(state, exact[0].id); return; }
          renderStudent(root);
        }
      });
      document.addEventListener('change', (event) => {
        const t = event.target;
        if (!(t instanceof HTMLElement) || !t.matches('form[data-form="paiement"] [data-pay="year"]')) return;
        root.state = state;
        root.form = t.closest('form');
        selection.inscriptionId = 0;
        root.form.querySelector('[data-pay="student"]').value = '';
        renderResults(root);
        renderStudent(root);
      });
      document.addEventListener('focusin', (event) => {
        if (event.target instanceof HTMLElement && event.target.matches('form[data-form="paiement"] [data-pay="student"]')) {
          root.state = state;
          root.form = event.target.closest('form');
          if (!selection.inscriptionId) renderResults(root, true);
        }
      });
      document.addEventListener('keydown', (event) => {
        const t = event.target;
        if (event.key === 'Enter' && t instanceof HTMLElement && t.matches('form[data-form="paiement"] [data-pay="student"]')) {
          event.preventDefault();
          root.state = state;
          root.form = t.closest('form');
          const list = search(root);
          if (list.length === 1 || (list.length && !selection.inscriptionId)) selectStudentForPayment(state, list[0].id);
        }
      });
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const dette = event.target.closest('[data-pay-dette]');
        if (dette) { selectDebtForPayment(state, dette.dataset.payDette); return; }
        const back = event.target.closest('[data-pay-scolarite]');
        if (back) { selectStudentForPayment(state, back.dataset.payScolarite); return; }
        const pick = event.target.closest('[data-pay-pick]');
        if (pick) { selectStudentForPayment(state, Number(pick.dataset.payPick)); return; }
        if (event.target.closest('[data-pay-solder]')) {
          const inscription = currentInscription({ state });
          const form = event.target.closest('form');
          if (inscription && form) {
            root.state = state;
            root.form = form;
            const plan = currentPlan(state, inscription);
            if (!plan.ok) return;
            const reste = previewPaiement({ echeances: plan.echeances }, 0).before.reste;
            form.querySelector('[name="montant"]').value = reste;
            renderPreview(root);
          }
          return;
        }
        // Clic en dehors de la zone de recherche : on referme la liste
        if (!event.target.closest('.search-field')) document.querySelectorAll('[data-pay-results]').forEach((box) => { box.hidden = true; });
      });
    }
    
    Object.assign(exports, { paymentFormHtml, initPaymentForm, selectDebtForPayment, selectStudentForPayment, bindPaymentForm });
  };
  factories['./modules/allocation.js'] = (require, exports) => {
    const { todayISO } = require("./utils.js");
    // Règles d'imputation des paiements sur l'échéancier d'une inscription (tranches ou mensualités).
    // Un paiement est toujours rattaché à UNE inscription, donc à UNE année scolaire : le surplus ne passe jamais
    // sur une autre année. Les paiements enregistrés (non annulés) sont la source de vérité des montants payés.
    
    const num = (value) => Number(value || 0);
    
    function echeanceDu(echeance) { return num(echeance.montant) - num(echeance.remise); }
    
    function resteEcheance(echeance) { return Math.max(echeanceDu(echeance) - num(echeance.montantPaye), 0); }
    
    // Échéances dans l'ordre de règlement : numéro de tranche / de mensualité, puis ordre d'enregistrement
    function ordreEcheances(inscription) {
      return (inscription.echeances || [])
        .map((echeance, index) => ({ echeance, index }))
        .sort((a, b) => num(a.echeance.trancheId) - num(b.echeance.trancheId) || a.index - b.index)
        .map((entry) => entry.echeance);
    }
    
    function libelleEcheance(echeance) {
      return echeance ? (echeance.libelle || `Tranche ${echeance.trancheId}`) : '—';
    }
    
    // Imputations d'un paiement ; les anciens paiements (une seule échéance) sont lus comme une imputation unique.
    function paymentAllocations(payment) {
      if (Array.isArray(payment.allocations) && payment.allocations.length) return payment.allocations;
      return payment.echeanceId ? [{ echeanceId: payment.echeanceId, montant: num(payment.montant) }] : [];
    }
    
    // Répartit `montant` sur la première échéance impayée, puis la suivante, etc.
    // Retourne les lignes d'imputation et le montant qui n'a pu être imputé (surplus au-delà de l'année).
    function allocate(echeances, montant) {
      let left = Math.floor(num(montant));
      const allocations = [];
      for (const echeance of echeances) {
        if (left <= 0) break;
        const reste = resteEcheance(echeance);
        if (reste <= 0) continue;
        const part = Math.min(reste, left);
        allocations.push({ echeanceId: echeance.id, libelle: libelleEcheance(echeance), montant: part, resteApres: reste - part, soldee: part === reste });
        left -= part;
      }
      return { allocations, nonImpute: left };
    }
    
    // Recalcule le montant payé de chaque échéance à partir des paiements valides (les annulés sont ignorés mais conservés).
    function recomputeInscription(state, inscription) {
      const paid = new Map();
      state.paiements.forEach((payment) => {
        if (payment.annule || payment.inscriptionId !== inscription.id) return;
        paymentAllocations(payment).forEach((a) => paid.set(a.echeanceId, (paid.get(a.echeanceId) || 0) + num(a.montant)));
      });
      (inscription.echeances || []).forEach((echeance) => { echeance.montantPaye = paid.get(echeance.id) || 0; });
    }
    
    function recomputeAll(state) {
      state.inscriptions.forEach((inscription) => recomputeInscription(state, inscription));
    }
    
    function statutEcheance(echeance, today = todayISO()) {
      const du = echeanceDu(echeance);
      const paye = num(echeance.montantPaye);
      if (du <= 0 || paye >= du) return 'soldee';
      if (echeance.dateLimite && echeance.dateLimite < today) return 'retard';
      return paye > 0 ? 'partielle' : 'impayee';
    }
    
    const STATUT_ECHEANCE_LABELS = { soldee: 'Soldée', partielle: 'Partielle', impayee: 'Impayée', retard: 'En retard' };
    
    // Situation détaillée de l'échéancier : échéance courante, soldes, retards et montants déjà payés d'avance.
    function echeancierSituation(inscription, today = todayISO()) {
      const ordered = ordreEcheances(inscription);
      const firstOpen = ordered.findIndex((e) => resteEcheance(e) > 0);
      const lignes = ordered.map((echeance, index) => {
        const du = echeanceDu(echeance);
        const paye = Math.min(num(echeance.montantPaye), du);
        const statut = statutEcheance(echeance, today);
        return {
          echeance, libelle: libelleEcheance(echeance), du, paye, reste: Math.max(du - paye, 0), taux: du ? Math.round(paye / du * 100) : 100,
          statut, enRetard: statut === 'retard', courante: index === firstOpen, avance: firstOpen !== -1 && index > firstOpen ? paye : 0
        };
      });
      const total = lignes.reduce((s, l) => s + l.du, 0);
      const paye = lignes.reduce((s, l) => s + l.paye, 0);
      const courante = lignes.find((l) => l.courante) || null;
      return {
        lignes, total, paye, reste: Math.max(total - paye, 0), taux: total ? Math.round(paye / total * 100) : 0,
        courante, nbSoldees: lignes.filter((l) => l.statut === 'soldee').length, nbEcheances: lignes.length,
        retardMontant: lignes.filter((l) => l.enRetard).reduce((s, l) => s + l.reste, 0), nbRetards: lignes.filter((l) => l.enRetard).length,
        avanceMontant: lignes.reduce((s, l) => s + l.avance, 0),
        statut: total > 0 && paye >= total ? 'solde' : lignes.some((l) => l.enRetard) ? 'retard' : paye > 0 ? 'partiel' : 'impaye'
      };
    }
    
    const STATUT_GLOBAL_LABELS = { solde: 'Soldé', retard: 'En retard', partiel: 'Partiellement payé', impaye: 'Aucun paiement' };
    
    // Simulation d'un paiement (sans rien modifier) pour l'aperçu du formulaire et la validation
    function previewPaiement(inscription, montant, today = todayISO()) {
      const copy = { echeances: (inscription.echeances || []).map((e) => ({ ...e })) };
      const ordered = ordreEcheances(copy);
      const { allocations, nonImpute } = allocate(ordered, montant);
      const before = echeancierSituation(inscription, today);
      allocations.forEach((a) => { const e = copy.echeances.find((x) => x.id === a.echeanceId); e.montantPaye = num(e.montantPaye) + a.montant; });
      const after = echeancierSituation(copy, today);
      return { allocations, nonImpute, before, after };
    }
    
    // Libellé d'une imputation : celui enregistré avec le paiement, sinon celui de l'échéance actuelle
    function allocationLabel(inscription, allocation) {
      return allocation.libelle || libelleEcheance((inscription?.echeances || []).find((e) => e.id === allocation.echeanceId));
    }
    
    Object.assign(exports, { echeanceDu, resteEcheance, ordreEcheances, libelleEcheance, paymentAllocations, allocate, recomputeInscription, recomputeAll, statutEcheance, STATUT_ECHEANCE_LABELS, echeancierSituation, STATUT_GLOBAL_LABELS, previewPaiement, allocationLabel });
  };
  factories['./modules/echeancier-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { echeancierSituation, STATUT_ECHEANCE_LABELS, STATUT_GLOBAL_LABELS } = require("./allocation.js");
    const BADGE = { soldee: 'ok', partielle: 'warning', impayee: 'neutral', retard: 'danger' };
    const GLOBAL_BADGE = { solde: 'ok', partiel: 'warning', impaye: 'neutral', retard: 'danger' };
    
    const progressBar = (percent, cls = '') => `<div class="progress-track ${cls}" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(Math.max(percent, 0), 100)}%"></i></div>`;
    
    function globalBadge(sit) {
      return `<span class="badge ${GLOBAL_BADGE[sit.statut]}">${STATUT_GLOBAL_LABELS[sit.statut]}</span>`;
    }
    
    // Tableau de l'échéancier : montant dû, payé, reste, statut et barre de progression par tranche / mensualité,
    // suivi d'une barre de progression globale pour l'année scolaire.
    function echeancierHtml(state, inscription, { anneeLabel = '', highlight = [] } = {}) {
      const sit = echeancierSituation(inscription);
      const devise = escapeHtml(state.config.devise);
      if (!sit.lignes.length) return '<p class="meta">Aucun frais configuré pour cette inscription.</p>';
      const marked = new Set(highlight);
      const rows = sit.lignes.map((l) => `<tr class="${l.courante ? 'row-current' : ''} ${marked.has(l.echeance.id) ? 'row-hit' : ''}">
        <td><b>${escapeHtml(l.libelle)}</b>${l.courante ? ' <span class="badge info">en cours</span>' : ''}<div class="meta">Échéance ${escapeHtml(formatDateFr(l.echeance.dateLimite))}</div></td>
        <td class="num">${formatMoney(l.du)}</td><td class="num">${formatMoney(l.paye)}</td><td class="num">${formatMoney(l.reste)}</td>
        <td><span class="badge ${BADGE[l.statut]}">${STATUT_ECHEANCE_LABELS[l.statut]}</span>${l.avance ? `<div class="meta">dont ${formatMoney(l.avance)} payés d’avance</div>` : ''}</td>
        <td class="bar-cell">${progressBar(l.taux, l.statut === 'retard' ? 'late' : '')}<span class="meta">${l.taux}%</span></td></tr>`).join('');
      return `<div class="table-wrap"><table class="echeancier">
          <thead><tr><th>${anneeLabel ? escapeHtml(anneeLabel) : 'Échéance'}</th><th>Dû</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Avancement</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Total année</td><td class="num">${formatMoney(sit.total)}</td><td class="num">${formatMoney(sit.paye)}</td><td class="num">${formatMoney(sit.reste)} ${devise}</td><td>${globalBadge(sit)}</td><td class="bar-cell">${progressBar(sit.taux)}<span class="meta">${sit.taux}%</span></td></tr></tfoot>
        </table></div>
        <div class="echeancier-notes">
          <span>Soldées : <b>${sit.nbSoldees}/${sit.nbEcheances}</b></span>
          ${sit.nbRetards ? `<span class="late-note">En retard : <b>${formatMoney(sit.retardMontant)} ${devise}</b> (${sit.nbRetards})</span>` : '<span>Aucun retard</span>'}
          <span>Payé d’avance sur les échéances suivantes : <b>${formatMoney(sit.avanceMontant)} ${devise}</b></span>
        </div>`;
    }
    
    // Détail d'une imputation : montant affecté à chaque tranche / mensualité
    function allocationTableHtml(state, allocations) {
      const devise = escapeHtml(state.config.devise);
      if (!allocations.length) return '';
      return `<table class="alloc"><thead><tr><th>Imputé sur</th><th>Montant</th><th>Reste après</th></tr></thead><tbody>${allocations.map((a) => `<tr><td>${escapeHtml(a.libelle)}</td><td class="num">${formatMoney(a.montant)} ${devise}</td><td class="num">${a.soldee ? '<span class="badge ok">Soldée</span>' : `${formatMoney(a.resteApres)} ${devise}`}</td></tr>`).join('')}</tbody></table>`;
    }
    
    Object.assign(exports, { progressBar, globalBadge, echeancierHtml, allocationTableHtml });
  };
  factories['./modules/paiements.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { reconcileInscriptionStatus, determineEcheanceStatus } = require("./finance.js");
    const { allocate, ordreEcheances, recomputeInscription, previewPaiement, echeancierSituation } = require("./allocation.js");
    const { planPourModalite, appliquerModalite, MODALITES, modaliteActuelle } = require("./modalites.js");
    const { reliquatOf, anneeEncaissement } = require("./reliquats.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
    
    function findInscription(state, inscriptionId) {
      return state.inscriptions.find((item) => item.id === Number(inscriptionId));
    }
    
    // Numéro de reçu unique, séquentiel par année civile : REC-2026-000001.
    // Attribué une seule fois par paiement ; une réimpression réutilise le même numéro.
    function ensureReceiptNumber(state, payment) {
      if (payment.numeroRecu) return payment.numeroRecu;
      const year = String(payment.datePaiement || todayISO()).slice(0, 4);
      if (!state.compteursRecu || typeof state.compteursRecu !== 'object') state.compteursRecu = {};
      const used = state.paiements
        .map((p) => p.numeroRecu)
        .filter((n) => typeof n === 'string' && n.startsWith(`REC-${year}-`))
        .reduce((max, n) => Math.max(max, Number(n.split('-')[2]) || 0), 0);
      const next = Math.max(Number(state.compteursRecu[year] || 0), used) + 1;
      state.compteursRecu[year] = next;
      payment.numeroRecu = `REC-${year}-${String(next).padStart(6, '0')}`;
      return payment.numeroRecu;
    }
    
    // Nom du caissier affiché sur les reçus : celui de la configuration, sinon l'utilisateur connecté
    function cashierName(state) {
      return String(state.config.caissier || '').trim() || currentUser()?.nom || 'Caissier';
    }
    
    // Modalité demandée pour ce paiement : celle du formulaire, sinon celle déjà fixée pour l'inscription
    // Un paiement sur une inscription dont le solde a été reporté est toujours un règlement de dette antérieure
    function reliquatDuPaiement(state, inscription, payload) {
      if (payload.reliquatId) return (state.reliquats || []).find((r) => r.id === Number(payload.reliquatId)) || null;
      return reliquatOf(state, inscription.id);
    }
    
    // Modalité demandée : celle du formulaire, sinon celle de l'inscription ; pour une dette, celle de l'échéancier d'origine
    function modaliteDemandee(inscription, payload, reliquat = null) {
      return payload.modalite || inscription.modalite || (reliquat ? modaliteActuelle(inscription) || 'tranches' : '');
    }
    
    function validatePaiement(state, payload = {}, { ignoreDuplicate = false } = {}) {
      const montant = Number(payload.montant);
      const date = payload.datePaiement || todayISO();
      const inscription = findInscription(state, payload.inscriptionId);
    
      if (!inscription) return { ok: false, message: 'Sélectionnez un élève inscrit.' };
      if (!Number.isFinite(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être supérieur à zéro.' };
      if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier de francs.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de paiement invalide.' };
      if (date > todayISO()) return { ok: false, message: 'La date de paiement ne peut pas être dans le futur.' };
    
      const annee = state.annees.find((a) => a.id === inscription.anneeId);
      const reliquat = reliquatDuPaiement(state, inscription, payload);
      if (payload.reliquatId && (!reliquat || reliquat.inscriptionId !== inscription.id)) return { ok: false, message: 'Dette antérieure introuvable pour cet élève.' };
      // Une année clôturée n'accepte plus de paiement, sauf le règlement de ses dettes reportées
      if (annee?.statut === 'cloturee' && !reliquat) return { ok: false, message: `L’année ${annee.annee} est clôturée : aucun paiement ne peut y être enregistré.` };
    
      const plan = planPourModalite(state, inscription, modaliteDemandee(inscription, payload, reliquat));
      if (!plan.ok) return { ok: false, message: plan.message };
    
      const { nonImpute, before } = previewPaiement({ echeances: plan.echeances }, montant);
      if (before.reste <= 0) return { ok: false, message: 'Les frais de cette année scolaire sont déjà soldés.' };
      if (nonImpute > 0) {
        return { ok: false, message: `Le montant dépasse le solde de l’année scolaire (${before.reste.toLocaleString('fr-FR')} ${state.config.devise}). Un excédent n’est jamais reporté sur une autre année.` };
      }
    
      if (payload.token && state.paiements.some((p) => p.token === payload.token)) {
        return { ok: false, message: 'Ce formulaire a déjà été enregistré (double soumission évitée).' };
      }
      const now = Date.now();
      const similar = state.paiements.some((p) => !p.annule && p.inscriptionId === inscription.id
        && Number(p.montant) === montant && p.datePaiement === date && now - Number(p.creeLe || 0) < DUPLICATE_WINDOW_MS);
      if (similar && !ignoreDuplicate) return { ok: false, duplicate: true, message: 'Un paiement identique vient d’être enregistré pour cet élève.' };
      return { ok: true };
    }
    
    // Applique la modalité de règlement, enregistre le paiement et l'impute : tout réussit ou rien n'est modifié.
    function createPaiement(state, payload = {}, options = {}) {
      if (!validatePaiement(state, payload, options).ok) return null;
      return withTransaction(state, () => {
        const inscription = findInscription(state, payload.inscriptionId);
        const reliquat = reliquatDuPaiement(state, inscription, payload);
        const modalite = modaliteDemandee(inscription, payload, reliquat);
        appliquerModalite(state, inscription, modalite, currentUser()?.nom || '');
        const montant = Number(payload.montant);
        const { allocations, nonImpute } = allocate(ordreEcheances(inscription), montant);
        if (nonImpute > 0 || !allocations.length) throw new Error('Imputation impossible');
        const user = currentUser();
    
        const payment = {
          id: nextId(state.paiements),
          inscriptionId: inscription.id,
          anneeId: inscription.anneeId,
          // Trésorerie : un règlement de dette est encaissé sur l'année du report, pas sur l'année d'origine
          anneeEncaissementId: reliquat ? anneeEncaissement(state, reliquat) : inscription.anneeId,
          reliquatId: reliquat ? reliquat.id : 0,
          modalite,
          echeanceId: allocations[0].echeanceId,
          // Le libellé est conservé : l'historique reste lisible même si l'échéancier change plus tard
          allocations: allocations.map(({ echeanceId, montant: part, libelle }) => ({ echeanceId, montant: part, libelle })),
          montant,
          mode: payload.mode || 'espece',
          reference: payload.reference || '',
          payeur: payload.payeur || '',
          motifPaiement: payload.motifPaiement || '',
          caissier: cashierName(state),
          utilisateur: user?.nom || '',
          utilisateurId: user?.id || 0,
          datePaiement: payload.datePaiement || todayISO(),
          annule: false,
          motif: '',
          token: payload.token || '',
          creeLe: Date.now()
        };
        state.paiements.push(payment);
        ensureReceiptNumber(state, payment);
        if (!payment.reference) payment.reference = payment.numeroRecu;
    
        recomputeInscription(state, inscription);
        (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
        reconcileInscriptionStatus(inscription);
    
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        logOperation(state, 'paiement', `Reçu ${payment.numeroRecu} — ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'élève'} — ${reliquat ? 'Règlement de dette antérieure' : MODALITES[modalite]} — ${allocations.map((a) => `${a.libelle} ${a.montant.toLocaleString('fr-FR')}`).join(' + ')} (${payment.mode})`, montant);
        return payment;
      });
    }
    
    // Changement de modalité sans nouveau paiement : nouvel échéancier, paiements existants réimputés (tracé)
    function changerModalite(state, inscriptionId, modalite) {
      const inscription = findInscription(state, inscriptionId);
      if (!inscription) return null;
      return withTransaction(state, () => {
        const avant = modaliteActuelle(inscription);
        const plan = appliquerModalite(state, inscription, modalite, currentUser()?.nom || '');
        recomputeInscription(state, inscription);
        (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
        reconcileInscriptionStatus(inscription);
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        logOperation(state, 'paiement', `Modalité de ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève'} : ${MODALITES[avant] || 'à choisir'} → ${MODALITES[modalite]}${plan.reimputations ? ` (${plan.reimputations.size} paiement(s) réimputé(s))` : ''}`);
        return inscription;
      });
    }
    
    // L'annulation conserve la ligne, son numéro de reçu et ses imputations : la trace comptable reste complète.
    function cancelPaiement(state, id, motif = 'Annulation manuelle') {
      const payment = state.paiements.find((item) => item.id === Number(id));
      if (!payment || payment.annule) return null;
      return withTransaction(state, () => {
        payment.annule = true;
        payment.motif = motif;
        payment.dateAnnulation = todayISO();
        payment.annuleePar = currentUser()?.nom || '';
        const inscription = findInscription(state, payment.inscriptionId);
        if (inscription) {
          recomputeInscription(state, inscription);
          (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e); });
          reconcileInscriptionStatus(inscription);
        }
        logOperation(state, 'annulation', `Reçu ${payment.numeroRecu || payment.id} annulé — ${motif}`, payment.montant);
        return payment;
      });
    }
    
    function getSoldeInscription(state, inscriptionId) {
      const inscription = findInscription(state, inscriptionId);
      if (!inscription) return { total: 0, paye: 0, restant: 0 };
      const s = echeancierSituation(inscription);
      return { total: s.total, paye: s.paye, restant: s.reste };
    }
    
    Object.assign(exports, { ensureReceiptNumber, cashierName, validatePaiement, createPaiement, changerModalite, cancelPaiement, getSoldeInscription });
  };
  factories['./modules/annees.js'] = (require, exports) => {
    function nextId(items) {
      return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    }
    
    function createAnnee(state, payload = {}) {
      const annee = String(payload.annee || '').trim();
      if (!annee || state.annees.some((item) => item.annee === annee)) return null;
    
      const item = {
        id: nextId(state.annees),
        annee,
        dateDebut: payload.dateDebut || '',
        dateFin: payload.dateFin || '',
        statut: payload.statut || 'preparation',
        soldeInitial: Math.max(Number(payload.soldeInitial || 0), 0),
        fraisInscription: Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0),
        fraisReinscription: Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0)
      };
    
      state.annees.push(item);
      if (item.statut === 'ouverte') {
        state.annees.forEach((year) => {
          if (year.id !== item.id && year.statut === 'ouverte') {
            year.statut = 'cloturee';
          }
        });
      }
    
      if (!state.anneeActiveId) {
        state.anneeActiveId = item.id;
      }
    
      return item;
    }
    
    function updateAnneeStatus(state, id, status) {
      const annee = state.annees.find((item) => item.id === Number(id));
      if (!annee) return null;
      annee.statut = status;
    
      if (status === 'ouverte') {
        state.annees.forEach((item) => {
          if (item.id !== annee.id && item.statut === 'ouverte') {
            item.statut = 'cloturee';
          }
        });
      }
    
      if (status === 'ouverte' || status === 'preparation') {
        state.anneeActiveId = annee.id;
      }
    
      return annee;
    }
    
    function updateAnnee(state, id, payload = {}) {
      const annee = state.annees.find((item) => item.id === Number(id));
      const label = String(payload.annee || '').trim();
      if (!annee || !label) return null;
      if (state.annees.some((item) => item.id !== annee.id && item.annee === label)) return null;
      annee.annee = label;
      annee.dateDebut = payload.dateDebut || '';
      annee.dateFin = payload.dateFin || '';
      if (payload.soldeInitial !== undefined) annee.soldeInitial = Math.max(Number(payload.soldeInitial || 0), 0);
      // Les nouveaux montants s'appliquent aux inscriptions futures : un frais déjà enregistré n'est jamais modifié
      if (payload.fraisInscription !== undefined) annee.fraisInscription = Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0);
      if (payload.fraisReinscription !== undefined) annee.fraisReinscription = Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0);
      return annee;
    }
    
    // Refus si des classes ou des inscriptions (donc l'historique financier) dépendent de l'année.
    function deleteAnnee(state, id) {
      const targetId = Number(id);
      const index = state.annees.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
      if (state.classes.some((c) => c.anneeId === targetId) || state.inscriptions.some((i) => i.anneeId === targetId)) return false;
    
      state.annees.splice(index, 1);
      state.tarifs = state.tarifs.filter((tarif) => tarif.anneeId !== targetId);
      if (state.anneeActiveId === targetId) state.anneeActiveId = state.annees[0]?.id || null;
      return true;
    }
    
    function setAnneeActive(state, id) {
      const targetId = Number(id);
      const annee = state.annees.find((item) => item.id === targetId);
      if (!annee) return null;
      state.anneeActiveId = targetId;
      return annee;
    }
    
    function getAnneeActive(state) {
      return state.annees.find((item) => item.id === Number(state.anneeActiveId)) || state.annees[0] || null;
    }
    
    Object.assign(exports, { nextId, createAnnee, updateAnneeStatus, updateAnnee, deleteAnnee, setAnneeActive, getAnneeActive });
  };
  factories['./modules/audit.js'] = (require, exports) => {
    const { currentUserName } = require("./auth.js");
    const MAX_ENTRIES = 3000;
    
    // Journal des opérations : chaque ligne conserve l'utilisateur authentifié qui l'a effectuée.
    function logOperation(state, type, detail, montant = 0) {
      if (!Array.isArray(state.journal)) state.journal = [];
      state.journal.push({
        id: state.journal.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1,
        horodatage: new Date().toISOString(),
        type,
        detail,
        montant: Number(montant || 0),
        utilisateur: currentUserName()
      });
      if (state.journal.length > MAX_ENTRIES) state.journal.splice(0, state.journal.length - MAX_ENTRIES);
    }
    
    Object.assign(exports, { logOperation });
  };
  factories['./modules/auth.js'] = (require, exports) => {
    const { confirmDialog } = require("./dialog.js");
    // Authentification et rôles côté navigateur. Les comptes sont stockés dans leur propre clé (ils ne figurent
    // ni dans les exports, ni dans les sauvegardes, et une réinitialisation des données ne les efface pas).
    // Mots de passe : jamais en clair, hachés avec sel. Cela protège contre les erreurs de manipulation et les
    // accès occasionnels, mais ne remplace pas une authentification serveur.
    const USERS_KEY = 'ibk_users_v1';
    const SESSION_KEY = 'ibk_session_v1';
    const LOCK_KEY = 'ibk_login_lock_v1';
    const MAX_ATTEMPTS = 5;
    const LOCK_MS = 60 * 1000;
    const HASH_ROUNDS = 2000;
    
    const ROLES = { admin: 'Administrateur', comptable: 'Comptable / Caissier', lecture: 'Consultation' };
    
    // Pages accessibles par rôle
    const ROLE_PAGES = {
      admin: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'dettes', 'depenses', 'rapports', 'config', 'aide'],
      comptable: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'dettes', 'depenses', 'rapports', 'aide'],
      lecture: ['dashboard', 'analyse', 'rapports', 'aide']
    };
    
    // ---------- SHA-256 (implémentation autonome, synchrone) ----------
    const K = [];
    const H0 = [];
    (function initConstants() {
      let n = 2;
      while (K.length < 64) {
        let prime = true;
        for (let i = 2; i * i <= n; i += 1) if (n % i === 0) { prime = false; break; }
        if (prime) {
          if (H0.length < 8) H0.push((Math.pow(n, 1 / 2) * 4294967296) | 0);
          K.push((Math.pow(n, 1 / 3) * 4294967296) | 0);
        }
        n += 1;
      }
    }());
    
    function sha256Hex(text) {
      const data = new TextEncoder().encode(text);
      const length = data.length;
      const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
      padded.set(data);
      padded[length] = 0x80;
      const view = new DataView(padded.buffer);
      view.setUint32(padded.length - 8, Math.floor((length * 8) / 4294967296));
      view.setUint32(padded.length - 4, (length * 8) >>> 0);
      const h = H0.slice();
      const w = new Array(64);
      const rotr = (x, n) => (x >>> n) | (x << (32 - n));
      for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i += 1) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i += 1) {
          const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
      }
      return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }
    
    function hashPassword(password, salt) {
      let digest = `${salt}:${password}`;
      for (let i = 0; i < HASH_ROUNDS; i += 1) digest = sha256Hex(`${salt}${digest}`);
      return digest;
    }
    
    function newSalt() {
      const bytes = new Uint8Array(12);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    
    // ---------- Comptes ----------
    function loadUsers() {
      try {
        const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) { return []; }
    }
    
    function saveUsers(users) {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    
    function hasUsers() { return loadUsers().length > 0; }
    
    function publicUsers() {
      return loadUsers().map(({ id, username, nom, role, actif, creeLe }) => ({ id, username, nom, role, actif, creeLe }));
    }
    
    function passwordProblem(password) {
      if (String(password || '').length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
      return '';
    }
    
    function createUser({ username, nom, role, password }) {
      const login = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Identifiant invalide (3 à 30 caractères : lettres, chiffres, point, tiret).');
      if (!ROLES[role]) throw new Error('Rôle inconnu.');
      const problem = passwordProblem(password);
      if (problem) throw new Error(problem);
      const users = loadUsers();
      if (users.some((u) => u.username === login)) throw new Error('Cet identifiant existe déjà.');
      const salt = newSalt();
      const user = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: login, nom: String(nom || '').trim() || login, role, salt, hash: hashPassword(password, salt), actif: true, creeLe: new Date().toISOString() };
      users.push(user);
      saveUsers(users);
      return user;
    }
    
    function changePassword(userId, password) {
      const problem = passwordProblem(password);
      if (problem) throw new Error(problem);
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId));
      if (!user) throw new Error('Utilisateur introuvable.');
      user.salt = newSalt();
      user.hash = hashPassword(password, user.salt);
      saveUsers(users);
      return true;
    }
    
    function activeAdmins(users) { return users.filter((u) => u.role === 'admin' && u.actif); }
    
    function setUserActive(userId, actif) {
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId));
      if (!user) throw new Error('Utilisateur introuvable.');
      if (!actif && user.role === 'admin' && activeAdmins(users).length <= 1) throw new Error('Il doit rester au moins un administrateur actif.');
      user.actif = Boolean(actif);
      saveUsers(users);
      return user;
    }
    
    function setUserRole(userId, role) {
      if (!ROLES[role]) throw new Error('Rôle inconnu.');
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId));
      if (!user) throw new Error('Utilisateur introuvable.');
      if (user.role === 'admin' && role !== 'admin' && activeAdmins(users).length <= 1) throw new Error('Il doit rester au moins un administrateur actif.');
      user.role = role;
      saveUsers(users);
      return user;
    }
    
    // ---------- Connexion ----------
    function readLock() {
      try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); } catch (error) { return {}; }
    }
    
    function writeLock(lock) {
      try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (error) { /* non bloquant */ }
    }
    
    function lockRemainingMs(now = Date.now()) {
      const lock = readLock();
      return lock.until && lock.until > now ? lock.until - now : 0;
    }
    
    // Vérifie des identifiants ; au bout de 5 échecs consécutifs, blocage d'une minute.
    function authenticate(username, password) {
      const wait = lockRemainingMs();
      if (wait) return { ok: false, message: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` };
      const user = loadUsers().find((u) => u.username === String(username || '').trim().toLowerCase());
      const valid = user && user.actif && hashPassword(String(password || ''), user.salt) === user.hash;
      if (!valid) {
        const lock = readLock();
        const attempts = (lock.attempts || 0) + 1;
        writeLock(attempts >= MAX_ATTEMPTS ? { attempts: 0, until: Date.now() + LOCK_MS } : { attempts, until: 0 });
        return { ok: false, message: user && !user.actif ? 'Ce compte est désactivé.' : 'Identifiant ou mot de passe incorrect.' };
      }
      writeLock({ attempts: 0, until: 0 });
      return { ok: true, user };
    }
    
    // Session de l'onglet (sessionStorage) : conservée à l'actualisation, perdue à la fermeture de l'onglet.
    // Elle expire après une période d'inactivité ou une durée maximale ; un compte désactivé perd aussitôt l'accès.
    const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
    const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
    
    function readSession() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session && typeof session === 'object' && session.id ? session : null;
      } catch (error) { return null; }
    }
    
    function writeSession(session) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) { /* session non disponible */ }
    }
    
    function sessionValid(session, now = Date.now()) {
      return Boolean(session) && now - Number(session.last || 0) < SESSION_IDLE_MS && now - Number(session.start || 0) < SESSION_MAX_MS;
    }
    
    function startSession(user) {
      const now = Date.now();
      writeSession({ id: user.id, start: now, last: now });
    }
    
    function endSession() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* session non disponible */ }
    }
    
    // Prolonge la session lors d'une activité (au plus une écriture par minute)
    function touchSession() {
      const session = readSession();
      if (!sessionValid(session)) return false;
      if (Date.now() - session.last > 60 * 1000) writeSession({ ...session, last: Date.now() });
      return true;
    }
    
    function currentUser() {
      const session = readSession();
      if (!sessionValid(session)) return null;
      return loadUsers().find((u) => u.id === Number(session.id) && u.actif) || null;
    }
    
    function currentUserName() {
      const user = currentUser();
      return user ? user.nom : '';
    }
    
    function isAdmin() { return currentUser()?.role === 'admin'; }
    
    // 'read' : consulter ; 'write' : créer / modifier des données courantes ; toute autre valeur : administrateur
    function can(permission) {
      const role = currentUser()?.role;
      if (!role) return false;
      if (permission === 'read') return true;
      if (permission === 'write') return role === 'admin' || role === 'comptable';
      return role === 'admin';
    }
    
    function allowedPages() {
      return ROLE_PAGES[currentUser()?.role] || [];
    }
    
    // Autorisation administrateur. Un administrateur connecté passe directement, sauf `reauth: true`
    // (opérations destructrices : il doit alors ressaisir son mot de passe). Tout autre rôle doit obtenir
    // l'accord d'un administrateur (identifiant + mot de passe), sans changer de session.
    async function requireAdmin(state, reason = 'Cette action est réservée à l’administrateur.', { reauth = false } = {}) {
      const me = currentUser();
      if (me?.role === 'admin' && !reauth) return true;
      const fields = me?.role === 'admin'
        ? [{ name: 'username', label: 'Identifiant', value: me.username, required: true }, { name: 'password', label: 'Mot de passe administrateur', type: 'password', required: true }]
        : [{ name: 'username', label: 'Identifiant administrateur', required: true }, { name: 'password', label: 'Mot de passe', type: 'password', required: true }];
      const answer = await confirmDialog({ title: 'Autorisation requise', message: reason, confirmLabel: 'Autoriser', fields });
      if (!answer.ok) return false;
      const check = authenticate(answer.values.username, answer.values.password);
      return check.ok && check.user.role === 'admin';
    }
    
    Object.assign(exports, { ROLES, ROLE_PAGES, sha256Hex, hashPassword, loadUsers, hasUsers, publicUsers, passwordProblem, createUser, changePassword, setUserActive, setUserRole, lockRemainingMs, authenticate, SESSION_IDLE_MS, SESSION_MAX_MS, sessionValid, startSession, endSession, touchSession, currentUser, currentUserName, isAdmin, can, allowedPages, requireAdmin });
  };
  factories['./modules/dialog.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    function fieldHtml(field, index) {
      const name = field.name || (index === 0 ? 'v' : `f${index}`);
      const value = field.value !== undefined ? ` value="${escapeHtml(field.value)}"` : '';
      if (field.type === 'checkbox') {
        return `<label class="dialog-check"><input name="${escapeHtml(name)}" type="checkbox" ${field.checked ? 'checked' : ''} /> ${escapeHtml(field.label)}</label>`;
      }
      return `<label class="dialog-field">${escapeHtml(field.label)}<input name="${escapeHtml(name)}" type="${field.type || 'text'}" ${field.required ? 'required' : ''} autocomplete="off"${value} placeholder="${escapeHtml(field.placeholder || '')}" /></label>`;
    }
    
    // Fenêtre de confirmation (remplace confirm()/prompt()) ; résout { ok, value, values }.
    // `field` (un champ) ou `fields` (plusieurs champs) sont facultatifs ; `value` = premier champ, `values` = tous.
    function confirmDialog({ title = 'Confirmation', message = '', confirmLabel = 'Confirmer', danger = false, field = null, fields = null } = {}) {
      return new Promise((resolve) => {
        const list = fields || (field ? [field] : []);
        const root = document.createElement('div');
        root.className = 'dialog-backdrop';
        root.innerHTML = `<form class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
          <h3 id="dlg-title">${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          ${list.map(fieldHtml).join('')}
          <div class="dialog-actions">
            <button type="button" class="secondary-btn" data-dlg="cancel">Annuler</button>
            <button type="submit" class="${danger ? 'danger-btn' : 'primary-btn'}">${escapeHtml(confirmLabel)}</button>
          </div></form>`;
        const previous = document.activeElement;
        const close = (result) => { root.remove(); if (previous && previous.focus) previous.focus(); resolve(result); };
        root.querySelector('form').addEventListener('submit', (event) => {
          event.preventDefault();
          const values = {};
          list.forEach((f, i) => {
            const name = f.name || (i === 0 ? 'v' : `f${i}`);
            const input = root.querySelector(`[name="${name}"]`);
            values[name] = input.type === 'checkbox' ? input.checked : input.value.trim();
          });
          const firstName = list[0] ? (list[0].name || 'v') : 'v';
          close({ ok: true, value: values[firstName] ?? '', values });
        });
        root.addEventListener('click', (event) => { if (event.target === root || event.target.matches('[data-dlg="cancel"]')) close({ ok: false, value: '', values: {} }); });
        root.addEventListener('keydown', (event) => { if (event.key === 'Escape') close({ ok: false, value: '', values: {} }); });
        document.body.append(root);
        (root.querySelector('input') || root.querySelector('button[type="submit"]')).focus();
      });
    }
    
    function notify(type, message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = `${type === 'error' ? '✖ ' : '✔ '}${message}`;
      toast.className = `toast ${type}`;
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => toast.classList.add('hidden'), type === 'error' ? 5000 : 3200);
    }
    
    Object.assign(exports, { confirmDialog, notify });
  };
  factories['./modules/finance.js'] = (require, exports) => {
    const { todayISO } = require("./utils.js");
    const { resteEcheance, echeanceDu, recomputeAll } = require("./allocation.js");
    function echeanceReste(echeance) {
      return resteEcheance(echeance);
    }
    
    function determineEcheanceStatus(echeance, today = todayISO()) {
      const montant = echeanceDu(echeance);
      const paye = Number(echeance.montantPaye || 0);
      if (montant <= 0 || paye >= montant) return 'payee';
      if (echeance.dateLimite && echeance.dateLimite < today) return 'en_retard';
      return paye > 0 ? 'partielle' : 'impayee';
    }
    
    function reconcileInscriptionStatus(inscription) {
      if (['transfere', 'termine', 'abandon'].includes(inscription.statut)) return inscription.statut;
      const echeances = inscription.echeances || [];
      if (!echeances.length) { inscription.statut = 'inscrit'; return inscription.statut; }
      if (echeances.every((e) => e.statut === 'payee')) inscription.statut = 'payee';
      else if (echeances.some((e) => e.statut === 'en_retard')) inscription.statut = 'en_retard';
      else if (echeances.some((e) => Number(e.montantPaye || 0) > 0)) inscription.statut = 'partielle';
      else inscription.statut = 'inscrit';
      return inscription.statut;
    }
    
    // Recalcule statuts d'échéances et d'inscriptions : à appeler au chargement et après chaque opération,
    // car un retard apparaît avec le temps, sans aucun enregistrement.
    function refreshStatuses(state) {
      const today = todayISO();
      recomputeAll(state);
      state.inscriptions.forEach((inscription) => {
        (inscription.echeances || []).forEach((e) => { e.statut = determineEcheanceStatus(e, today); });
        reconcileInscriptionStatus(inscription);
      });
    }
    
    function activePayments(state, inscriptionId) {
      return state.paiements.filter((p) => !p.annule && (inscriptionId === undefined || p.inscriptionId === inscriptionId));
    }
    
    function inscriptionSituation(state, inscription, today = todayISO()) {
      const echeances = inscription.echeances || [];
      const total = echeances.reduce((s, e) => s + echeanceDu(e), 0);
      const paye = echeances.reduce((s, e) => s + Math.min(Number(e.montantPaye || 0), echeanceDu(e)), 0);
      const reste = Math.max(total - paye, 0);
      const enRetard = echeances.filter((e) => echeanceReste(e) > 0 && e.dateLimite && e.dateLimite < today);
      const retardMontant = enRetard.reduce((s, e) => s + echeanceReste(e), 0);
      const prochaine = echeances.filter((e) => echeanceReste(e) > 0 && !(e.dateLimite && e.dateLimite < today))
        .sort((a, b) => String(a.dateLimite || '9').localeCompare(String(b.dateLimite || '9')))[0] || null;
      let statut = 'partiel';
      if (total > 0 && reste === 0) statut = 'a_jour';
      else if (enRetard.length) statut = 'retard';
      return { total, paye, reste, taux: total ? Math.round(paye / total * 100) : 0, statut, enRetard, retardMontant, prochaine };
    }
    
    const STATUT_LABELS = { a_jour: 'À jour', partiel: 'Partiellement payé', retard: 'En retard' };
    
    function scopeInscriptions(state, { yearId = 0, classId = 0, category = '' } = {}) {
      return state.inscriptions.filter((inscription) => {
        if (yearId && inscription.anneeId !== yearId) return false;
        if (classId && inscription.classeId !== classId) return false;
        if (category && state.classes.find((c) => c.id === inscription.classeId)?.categorie !== category) return false;
        return true;
      });
    }
    
    function inRange(date, from, to) {
      return (!from || date >= from) && (!to || date <= to);
    }
    
    function sumPayments(payments) {
      return payments.reduce((s, p) => s + Number(p.montant || 0), 0);
    }
    
    function labelEcheance(echeance) {
      return echeance ? (echeance.libelle || `Tranche ${echeance.trancheId}`) : '—';
    }
    
    function studentOf(state, inscription) {
      return state.eleves.find((e) => e.id === inscription?.eleveId);
    }
    
    function yearLabel(state, id) {
      return state.annees.find((a) => a.id === id)?.annee || '—';
    }
    
    function classOf(state, id) {
      return state.classes.find((c) => c.id === id);
    }
    
    // Cumul des paiements valides d'une inscription jusqu'à un paiement donné (inclus)
    function cumulUntil(state, payment) {
      return state.paiements
        .filter((p) => !p.annule && p.inscriptionId === payment.inscriptionId && p.id <= payment.id)
        .reduce((s, p) => s + Number(p.montant || 0), 0);
    }
    
    Object.assign(exports, { echeanceReste, determineEcheanceStatus, reconcileInscriptionStatus, refreshStatuses, activePayments, inscriptionSituation, STATUT_LABELS, scopeInscriptions, inRange, sumPayments, labelEcheance, studentOf, yearLabel, classOf, cumulUntil });
  };
  factories['./modules/modalites.js'] = (require, exports) => {
    const { paymentAllocations, allocate, ordreEcheances } = require("./allocation.js");
    // Modalité de règlement d'une inscription : « par tranches » ou « mensuel ».
    // Elle est choisie lors du premier paiement (module Paiements), et non plus imposée à l'inscription.
    // Dès qu'un paiement valide existe, elle est verrouillée : les imputations déjà faites portent sur cet échéancier.
    
    const MODALITES = { tranches: 'Paiement par tranches', mensuel: 'Paiement mensuel' };
    
    const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    function addMonths(iso, count) {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1 + count, 1);
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(d || 1, last));
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    
    function monthLabel(iso) {
      if (!iso) return '';
      const [y, m] = iso.split('-').map(Number);
      return `${MOIS[m - 1]} ${y}`;
    }
    
    function tarifFor(state, inscription) {
      return state.tarifs.find((t) => t.classeId === inscription.classeId && t.anneeId === inscription.anneeId) || null;
    }
    
    function totalTranches(tarif) {
      return (tarif?.tranches || []).reduce((s, t) => s + Number(t.montant || 0), 0);
    }
    
    function totalMensuel(tarif) {
      return Number(tarif?.montantMensuel || 0) * Number(tarif?.nbMois || 0);
    }
    
    // Modalités proposables pour un tarif : chacune doit avoir des montants complets
    function modalitesDisponibles(tarif) {
      return {
        tranches: Boolean(tarif) && (tarif.tranches || []).length > 0 && totalTranches(tarif) > 0,
        mensuel: Boolean(tarif) && Number(tarif.montantMensuel) > 0 && Number(tarif.nbMois) > 0
      };
    }
    
    function hasValidPayments(state, inscription) {
      return state.paiements.some((p) => !p.annule && p.inscriptionId === inscription.id);
    }
    
    // Identifiants d'échéances jamais réutilisés pour une même inscription (les paiements annulés gardent leurs références)
    function nextEcheanceId(state, inscription) {
      const used = [...(inscription.echeances || []).map((e) => Number(e.id)),
        ...state.paiements.filter((p) => p.inscriptionId === inscription.id).flatMap((p) => paymentAllocations(p).map((a) => Number(a.echeanceId)))];
      return Math.max(inscription.id * 1000, ...used) + 1;
    }
    
    // Construit l'échéancier d'une modalité à partir du tarif (sans rien enregistrer)
    function buildEcheances(state, inscription, tarif, modalite) {
      let id = nextEcheanceId(state, inscription);
      const base = (fields) => ({ id: id++, montantPaye: 0, remise: 0, statut: 'impayee', ...fields });
      if (modalite === 'mensuel') {
        const count = Math.min(Math.max(Number(tarif.nbMois || 0), 1), 12);
        const annee = state.annees.find((a) => a.id === inscription.anneeId);
        const start = tarif.moisDebut || annee?.dateDebut || '';
        return Array.from({ length: count }, (_, index) => {
          const dateLimite = start ? addMonths(start, index) : '';
          return base({ trancheId: index + 1, montant: Number(tarif.montantMensuel), dateLimite, libelle: dateLimite ? monthLabel(dateLimite) : `Mensualité ${index + 1}`, mensualite: true });
        });
      }
      return (tarif.tranches || []).map((tranche, index) => base({
        trancheId: Number(tranche.num || index + 1), montant: Number(tranche.montant || 0), dateLimite: tranche.dateLimite || '', libelle: tranche.libelle || `Tranche ${index + 1}`
      }));
    }
    
    // Échéances de frais d'inscription / réinscription : indépendantes de la modalité, toujours conservées
    function fraisEcheances(inscription) {
      return (inscription.echeances || []).filter((e) => e.type === 'frais');
    }
    
    function scolariteEcheances(inscription) {
      return (inscription.echeances || []).filter((e) => e.type !== 'frais');
    }
    
    // Modalité effective de l'échéancier actuel (les anciennes données sans champ sont déduites)
    function modaliteActuelle(inscription) {
      if (inscription.modalite) return inscription.modalite;
      const scolarite = scolariteEcheances(inscription);
      if (!scolarite.length) return null;
      return scolarite.some((e) => e.mensualite) ? 'mensuel' : 'tranches';
    }
    
    // Réimpute les paiements valides de l'inscription, dans leur ordre d'enregistrement, sur un nouvel échéancier.
    // Aucun paiement n'est supprimé ni compté deux fois : seule sa répartition change. Ne modifie rien.
    function reimputer(state, inscription, echeances) {
      const copy = echeances.map((e) => ({ ...e, montantPaye: 0 }));
      const ordered = ordreEcheances({ echeances: copy });
      const payments = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((x, y) => x.id - y.id);
      const allocations = new Map();
      for (const payment of payments) {
        const result = allocate(ordered, payment.montant);
        if (result.nonImpute > 0) {
          const dejaPaye = payments.reduce((sum, p) => sum + Number(p.montant || 0), 0);
          return { ok: false, message: `Changement impossible : ${dejaPaye.toLocaleString('fr-FR')} déjà payés dépassent le total de la nouvelle modalité (${copy.reduce((sum, e) => sum + Number(e.montant || 0), 0).toLocaleString('fr-FR')}).` };
        }
        result.allocations.forEach((alloc) => { copy.find((e) => e.id === alloc.echeanceId).montantPaye += alloc.montant; });
        allocations.set(payment.id, result.allocations.map(({ echeanceId, montant, libelle }) => ({ echeanceId, montant, libelle })));
      }
      return { ok: true, echeances: copy, allocations };
    }
    
    // Échéancier à utiliser pour un paiement avec la modalité demandée. Ne modifie rien.
    // { ok, echeances, regenerate, changement, reimputations, message }
    function planPourModalite(state, inscription, modalite) {
      if (!MODALITES[modalite]) return { ok: false, echeances: [], message: 'Choisissez la modalité de règlement : paiement mensuel ou par tranches.' };
      const actuelle = modaliteActuelle(inscription);
      const paid = hasValidPayments(state, inscription);
      // Modalité inchangée : on garde l'échéancier en place (avec son historique d'imputations)
      if (inscription.modalite === modalite && scolariteEcheances(inscription).length) return { ok: true, echeances: inscription.echeances, regenerate: false };
      if (!inscription.modalite && paid && actuelle === modalite) return { ok: true, echeances: inscription.echeances, regenerate: false };
      const tarif = tarifFor(state, inscription);
      if (!tarif) return { ok: false, echeances: [], message: 'Aucun tarif n’est configuré pour la classe de cet élève : définissez d’abord les frais dans « Tarifs ».' };
      if (!modalitesDisponibles(tarif)[modalite]) {
        return { ok: false, echeances: [], message: modalite === 'mensuel' ? 'Le tarif de cette classe n’a pas de montant mensuel : complétez-le dans « Tarifs ».' : 'Le tarif de cette classe n’a pas de tranches valides.' };
      }
      const nouveaux = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, modalite)];
      const changement = Boolean(inscription.modalite) && inscription.modalite !== modalite;
      if (!paid) return { ok: true, echeances: nouveaux, regenerate: true, changement };
      const result = reimputer(state, inscription, nouveaux);
      if (!result.ok) return { ok: false, echeances: [], message: result.message };
      return { ok: true, echeances: result.echeances, regenerate: true, changement: true, reimputations: result.allocations };
    }
    
    // Applique la modalité choisie : nouvel échéancier et, si des paiements existent, réimputation tracée.
    // À appeler dans une transaction (en cas d'échec, rien n'est modifié).
    function appliquerModalite(state, inscription, modalite, auteur = '') {
      const plan = planPourModalite(state, inscription, modalite);
      if (!plan.ok) throw new Error(plan.message);
      const avant = inscription.modalite;
      if (plan.regenerate) {
        const now = new Date().toISOString();
        if (plan.reimputations) {
          state.paiements.forEach((payment) => {
            const next = plan.reimputations.get(payment.id);
            if (!next) return;
            payment.historiqueImputations = [...(payment.historiqueImputations || []), { horodatage: now, modalite: avant || modaliteActuelle(inscription), allocations: payment.allocations }];
            payment.allocations = next;
            payment.echeanceId = next[0]?.echeanceId || payment.echeanceId;
          });
        }
        inscription.echeances = plan.echeances;
        if (plan.changement) inscription.historiqueModalites = [...(inscription.historiqueModalites || []), { horodatage: now, de: avant, vers: modalite, par: auteur }];
      }
      inscription.modalite = modalite;
      return plan;
    }
    
    // Échéancier provisoire « par tranches » créé à l'inscription pour que les montants attendus et les retards
    // soient visibles ; la modalité reste « à choisir » (null) jusqu'au premier paiement. Les frais sont conservés.
    function echeancierProvisoire(state, inscription, tarif) {
      const frais = fraisEcheances(inscription);
      inscription.modalite = null;
      inscription.echeances = !tarif || !modalitesDisponibles(tarif).tranches ? frais : [...frais, ...buildEcheances(state, inscription, tarif, 'tranches')];
      return inscription;
    }
    
    Object.assign(exports, { MODALITES, addMonths, monthLabel, tarifFor, totalTranches, totalMensuel, modalitesDisponibles, hasValidPayments, nextEcheanceId, buildEcheances, fraisEcheances, scolariteEcheances, modaliteActuelle, reimputer, planPourModalite, appliquerModalite, echeancierProvisoire });
  };
  factories['./modules/reliquats.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { echeancierSituation } = require("./allocation.js");
    const { todayISO } = require("./utils.js");
    // Reliquats (dettes des années précédentes).
    // La dette reste portée par l'inscription d'origine (ses échéances impayées) : c'est l'unique source de vérité,
    // ce qui empêche de compter la même somme due deux fois (ancienne année + nouvelle année).
    // Le registre `state.reliquats` trace le report : montant reporté, date, année de report ; les règlements sont
    // des paiements ordinaires sur l'inscription d'origine, marqués `reliquatId` et encaissés sur l'année de report.
    
    function annee(state, id) { return state.annees.find((a) => a.id === id) || null; }
    
    // Ordre chronologique des années : date de rentrée, sinon libellé (« 2025-2026 » < « 2026-2027 »)
    function anneeKey(state, id) {
      const a = annee(state, id);
      return a ? `${a.dateDebut || ''}|${a.annee}` : '';
    }
    
    function estAnterieure(state, anneeA, anneeB) {
      return anneeKey(state, anneeA) < anneeKey(state, anneeB);
    }
    
    function reliquatOf(state, inscriptionId) {
      return (state.reliquats || []).find((r) => r.inscriptionId === Number(inscriptionId)) || null;
    }
    
    // Report automatique et idempotent des soldes impayés : une inscription est reportée dès que l'élève est inscrit
    // dans une année postérieure, ou que son année est clôturée. Un même solde n'est jamais reporté deux fois.
    function reporterReliquats(state) {
      if (!Array.isArray(state.reliquats)) state.reliquats = [];
      const created = [];
      state.inscriptions.forEach((inscription) => {
        const later = state.inscriptions
          .filter((j) => j.eleveId === inscription.eleveId && estAnterieure(state, inscription.anneeId, j.anneeId))
          .sort((x, y) => anneeKey(state, x.anneeId).localeCompare(anneeKey(state, y.anneeId)))[0];
        const existing = reliquatOf(state, inscription.id);
        if (existing) {
          if (!existing.anneeReportId && later) existing.anneeReportId = later.anneeId;
          return;
        }
        const closed = annee(state, inscription.anneeId)?.statut === 'cloturee';
        if (!later && !closed) return;
        const reste = echeancierSituation(inscription).reste;
        if (reste <= 0) return;
        const record = {
          id: nextId(state.reliquats), eleveId: inscription.eleveId, inscriptionId: inscription.id, anneeOrigineId: inscription.anneeId,
          anneeReportId: later?.anneeId || null, montantReporte: reste, dateReport: todayISO(), creeLe: Date.now()
        };
        state.reliquats.push(record);
        created.push(record);
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        logOperation(state, 'reliquat', `Solde impayé ${annee(state, inscription.anneeId)?.annee || ''} de ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève'} reporté${later ? ` sur ${annee(state, later.anneeId)?.annee}` : ' (année clôturée)'}`, reste);
      });
      return created;
    }
    
    // Montant reporté, remboursé (règlements validés) et reste dû calculé sur l'inscription d'origine
    function situationReliquat(state, record) {
      const inscription = state.inscriptions.find((i) => i.id === record.inscriptionId);
      const reste = inscription ? echeancierSituation(inscription).reste : 0;
      const reglements = state.paiements.filter((p) => !p.annule && p.reliquatId === record.id).sort((a, b) => a.id - b.id);
      const rembourse = reglements.reduce((s, p) => s + Number(p.montant || 0), 0);
      return { ...record, inscription, reste, rembourse, reglements, statut: reste <= 0 ? 'solde' : rembourse > 0 ? 'partiel' : 'du' };
    }
    
    const STATUT_RELIQUAT = { du: 'Dû', partiel: 'Partiellement remboursé', solde: 'Soldé' };
    
    function reliquatsEleve(state, eleveId) {
      return (state.reliquats || []).filter((r) => r.eleveId === Number(eleveId)).map((r) => situationReliquat(state, r));
    }
    
    // Dette antérieure encore due par un élève (hors inscription donnée)
    function detteRestante(state, eleveId, saufInscriptionId = 0) {
      return reliquatsEleve(state, eleveId).filter((r) => r.inscriptionId !== saufInscriptionId).reduce((s, r) => s + r.reste, 0);
    }
    
    // Année sur laquelle un règlement de dette est encaissé (trésorerie) : celle du report, sinon l'année active
    function anneeEncaissement(state, record) {
      return record.anneeReportId || state.anneeActiveId || record.anneeOrigineId;
    }
    
    Object.assign(exports, { estAnterieure, reliquatOf, reporterReliquats, situationReliquat, STATUT_RELIQUAT, reliquatsEleve, detteRestante, anneeEncaissement });
  };
  factories['./modules/transaction.js'] = (require, exports) => {
    // Exécute une opération « tout ou rien » : si elle échoue (exception) ou refuse (résultat faux/nul),
    // l'état est remis exactement dans son état initial, sans écriture partielle (paiement sans mise à jour du solde, etc.).
    function withTransaction(state, operation) {
      const snapshot = structuredClone(state);
      const rollback = () => {
        Object.keys(state).forEach((key) => { if (!(key in snapshot)) delete state[key]; });
        Object.assign(state, snapshot);
      };
      let result;
      try {
        result = operation();
      } catch (error) {
        rollback();
        throw error;
      }
      if (result === false || result === null || result === undefined) rollback();
      return result;
    }
    
    Object.assign(exports, { withTransaction });
  };
  factories['./modules/views.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { CATEGORIES } = require("./classes.js");
    const { studentOf, yearLabel } = require("./finance.js");
    const className = (state, id) => state.classes.find((c) => c.id === Number(id))?.nom || '—';
    const eleveLabel = (e) => `${e.matricule} — ${e.prenom} ${e.nom}`;
    
    function categorySelect(listId) {
      return `<label>Catégorie
        <select data-cat-for="${listId}"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
      </label>`;
    }
    
    function yearSelect(state, listId) {
      return `<label>Année scolaire
        <select name="anneeId" ${listId ? `data-year-for="${listId}"` : ''}>${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
      </label>`;
    }
    
    function classPicker(state, listId, { required = true, label = 'Classe (tapez pour filtrer)' } = {}) {
      const options = state.classes.filter((c) => c.anneeId === state.anneeActiveId).map((c) => `<option value="${escapeHtml(c.nom)}"></option>`).join('');
      return `<label>${label}
        <input name="classeText" list="${listId}" type="search" placeholder="Ex : 6e A" autocomplete="off" ${required ? 'required' : ''} />
        <datalist id="${listId}">${options}</datalist>
      </label>`;
    }
    
    const actions = (...buttons) => `<div class="form-actions">${buttons.join('')}</div>`;
    const btn = (action, label, cls = '') => `<button type="button" class="action-btn ${cls}" data-action="${action}">${label}</button>`;
    const formButtons = (editLabel = 'Enregistrer') => `<div class="form-actions span-two"><button type="submit" class="primary-btn" data-submit-label>${editLabel}</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>`;
    
    function renderAnnees(state) {
      const section = document.getElementById('annees');
      const active = state.anneeActiveId || state.annees[0]?.id;
      section.innerHTML = `
        <div class="panel section-form">
          <div class="panel-header"><h3>Année scolaire</h3><span class="meta">Ajouter ou modifier</span></div>
          <form class="form-grid compact" data-form="annee">
            <label>Année <input name="annee" type="text" required placeholder="2026-2027" /></label>
            <label>Date de rentrée <input name="dateDebut" type="date" /></label>
            <label>Date de fin <input name="dateFin" type="date" /></label>
            <label>Solde d’ouverture de caisse <input name="soldeInitial" type="number" min="0" step="1" value="0" /></label>
            <label>Frais d’inscription (nouvel élève) <input name="fraisInscription" type="number" min="0" step="1" value="0" /></label>
            <label>Frais de réinscription <input name="fraisReinscription" type="number" min="0" step="1" value="0" /></label>
            <label>Statut
              <select name="statut"><option value="preparation">Préparation</option><option value="ouverte">Ouverte</option><option value="cloturee">Clôturée</option></select>
            </label>
            ${formButtons('Ajouter')}
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Liste des années</h3></div>
          <div class="cards-grid">
            ${state.annees.map((a) => `
              <div class="detail-card">
                <h4>${escapeHtml(a.annee)} ${a.id === active ? '<span class="badge ok">active</span>' : ''}</h4>
                <p class="meta">${escapeHtml(formatDateFr(a.dateDebut))} → ${escapeHtml(formatDateFr(a.dateFin))}</p>
                <p class="meta">Solde d’ouverture : ${formatMoney(a.soldeInitial || 0)} ${escapeHtml(state.config.devise)}</p>
                <p class="meta">Inscription : ${formatMoney(a.fraisInscription || 0)} · Réinscription : ${formatMoney(a.fraisReinscription || 0)} ${escapeHtml(state.config.devise)}</p>
                <p class="meta">Statut : <strong>${escapeHtml(a.statut)}</strong> · ${state.inscriptions.filter((i) => i.anneeId === a.id).length} inscription(s)</p>
                ${actions(btn(`annee:view:${a.id}`, 'Consulter'), btn(`annee:edit:${a.id}`, 'Modifier'), btn(`annee:open:${a.id}`, 'Valider (ouvrir)'), btn(`annee:close:${a.id}`, 'Clôturer'), btn(`annee:active:${a.id}`, 'Définir active'), btn(`annee:delete:${a.id}`, 'Supprimer', 'delete'))}
              </div>`).join('')}
          </div>
        </div>`;
    }
    
    function renderClasses(state) {
      const section = document.getElementById('classes');
      section.innerHTML = `
        <div class="panel section-form">
          <div class="panel-header"><h3>Classe</h3><span class="meta">Ajouter ou modifier</span></div>
          <form class="form-grid compact" data-form="classe">
            <label>Nom de la classe <input name="nom" type="text" required placeholder="Ex : 6e A" /></label>
            <label>Catégorie
              <select name="categorie" required>${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
            </label>
            ${yearSelect(state)}
            <label>Capacité <input name="capacite" type="number" min="1" value="40" /></label>
            ${formButtons('Ajouter')}
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Liste des classes</h3><span class="meta" data-class-count>${state.classes.length} classe(s)</span></div>
          <div class="report-tabs" role="tablist">
            <button type="button" class="tab-btn active" data-class-filter="">Toutes</button>
            ${CATEGORIES.map((c) => `<button type="button" class="tab-btn" data-class-filter="${c}">${c}</button>`).join('')}
          </div>
          <div class="cards-grid">
            ${state.classes.map((c) => `
              <div class="detail-card" data-class-card data-cat="${escapeHtml(c.categorie)}">
                <h4>${escapeHtml(c.nom)} ${c.active ? '' : '<span class="badge danger">inactive</span>'}</h4>
                <p class="meta">${escapeHtml(c.categorie)}</p>
                <p class="meta">Année : ${escapeHtml(yearLabel(state, c.anneeId))} · ${state.inscriptions.filter((i) => i.classeId === c.id).length}/${c.capacite} élève(s)</p>
                ${actions(btn(`classe:view:${c.id}`, 'Consulter'), btn(`classe:edit:${c.id}`, 'Modifier'), btn(`classe:toggle:${c.id}`, c.active ? 'Désactiver' : 'Activer'), btn(`classe:delete:${c.id}`, 'Supprimer', 'delete'))}
              </div>`).join('')}
          </div>
        </div>`;
    }
    
    function renderEleves(state) {
      const section = document.getElementById('eleves');
      section.innerHTML = `
        <div class="page-intro">
          <div><span class="eyebrow">Dossiers élèves</span><h2>Recherche et suivi des élèves</h2></div>
          <span class="meta">${state.eleves.length} dossier(s)</span>
        </div>
        <div class="panel advanced-search">
          <label>Recherche avancée <input type="search" data-student-search placeholder="Matricule, nom, parent, téléphone, e-mail…" /></label>
          <label>Classe
            <select data-student-class><option value="">Toutes les classes</option>${state.classes.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)} (${escapeHtml(yearLabel(state, c.anneeId))})</option>`).join('')}</select>
          </label>
          <label>Statut
            <select data-student-status><option value="">Tous</option><option value="actif">Actif</option><option value="inactif">Inactif</option></select>
          </label>
          <span class="search-count" data-student-count>${state.eleves.length} résultat(s)</span>
        </div>
        <div class="panel section-form">
          <div class="panel-header"><h3>Fiche élève</h3><span class="meta">Après l'ajout, vous passez directement à l'inscription</span></div>
          <form class="form-grid" data-form="eleve">
            <label>Matricule <input name="matricule" type="text" placeholder="IBK-AAAA-NNNN (généré si vide)" /></label>
            <label>Prénom <input name="prenom" type="text" required /></label>
            <label>Nom <input name="nom" type="text" required /></label>
            <label>Sexe <select name="sexe"><option value="M">Masculin</option><option value="F">Féminin</option></select></label>
            <label>Date de naissance <input name="dateNaissance" type="date" /></label>
            <label>Téléphone <input name="telephone" type="text" /></label>
            <label>Email <input name="email" type="email" /></label>
            <label>Parent / tuteur <input name="parent" type="text" /></label>
            ${categorySelect('eleve-classes')}
            ${classPicker(state, 'eleve-classes', { label: 'Classe souhaitée (tapez pour filtrer)' })}
            <label>Adresse <input name="adresse" type="text" /></label>
            ${formButtons('Ajouter et inscrire')}
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Répertoire des élèves</h3><button class="secondary-btn small-btn" data-action="report:students-csv">Exporter la liste</button></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Matricule</th><th>Nom</th><th>Classe</th><th>Contact</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${state.eleves.map((e) => `
              <tr data-student-row data-class="${e.classeId || ''}" data-status="${e.actif ? 'actif' : 'inactif'}"
                data-search="${escapeHtml([e.matricule, e.prenom, e.nom, e.parent, e.telephone, e.email, className(state, e.classeId)].join(' ').toLowerCase())}">
                <td>${escapeHtml(e.matricule)}</td><td>${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</td><td>${escapeHtml(className(state, e.classeId))}</td>
                <td>${escapeHtml(e.telephone || e.email || '—')}</td>
                <td><span class="badge ${e.actif ? 'ok' : 'danger'}">${e.actif ? 'Actif' : 'Inactif'}</span></td>
                <td>${btn(`eleve:profile:${e.id}`, 'Consulter')}${btn(`eleve:edit:${e.id}`, 'Modifier')}${btn(`eleve:enroll:${e.id}`, 'Inscrire')}${btn(`eleve:toggle:${e.id}`, e.actif ? 'Désactiver' : 'Activer')}${btn(`eleve:delete:${e.id}`, 'Supprimer', 'delete')}</td>
              </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    }
    
    function renderInscriptions(state) {
      const section = document.getElementById('inscriptions');
      section.innerHTML = `
        <div class="panel section-form">
          <div class="panel-header"><h3>Inscription</h3><span class="meta">Un élève est inscrit dans une classe pour une année scolaire</span></div>
          <form class="form-grid compact" data-form="inscription">
            ${yearSelect(state, 'insc-classes')}
            ${categorySelect('insc-classes')}
            ${classPicker(state, 'insc-classes')}
            <label class="span-two">Élève — nom ou matricule
              <input name="eleveText" list="insc-eleves" type="search" placeholder="Ex : IBK-2026-0001 ou Aminata" autocomplete="off" required />
              <datalist id="insc-eleves">${state.eleves.map((e) => `<option value="${escapeHtml(eleveLabel(e))}"></option>`).join('')}</datalist>
            </label>
            <label>Type <select name="type"><option value="auto">Automatique (selon l’historique de l’élève)</option><option value="nouvelle">Nouvelle inscription</option><option value="reinscription">Réinscription</option></select></label>
            <p class="meta span-all">Les frais d’inscription ou de réinscription de l’année choisie sont ajoutés une seule fois à l’échéancier de l’élève.</p>
            <label>Statut
              <select name="statut"><option value="inscrit">Inscrit</option><option value="transfere">Transféré</option><option value="termine">Terminé</option><option value="abandon">Abandon</option></select>
            </label>
            <div class="form-actions span-two"><button type="submit" class="primary-btn">Ajouter l'inscription</button></div>
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Historique d'inscriptions</h3></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Élève</th><th>Année</th><th>Classe</th><th>Type</th><th>Statut</th><th>Validation</th><th>Échéances</th><th>Actions</th></tr></thead>
            <tbody>${state.inscriptions.map((i) => {
              const s = studentOf(state, i);
              return `<tr>
                <td>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</td><td>${escapeHtml(yearLabel(state, i.anneeId))}</td><td>${escapeHtml(className(state, i.classeId))}</td>
                <td>${escapeHtml(i.type)}</td><td>${escapeHtml(i.statut)}</td>
                <td><span class="badge ${i.validee ? 'ok' : 'warning'}">${i.validee ? `Validée le ${escapeHtml(formatDateFr(i.dateValidation))}` : 'En attente'}</span></td>
                <td>${(i.echeances || []).length}</td>
                <td>${btn(`eleve:profile:${i.eleveId}`, 'Consulter')}${i.validee ? '' : btn(`inscription:validate:${i.id}`, 'Valider')}${btn(`inscription:reinscrire:${i.id}`, 'Réinscrire')}${btn(`inscription:delete:${i.id}`, 'Supprimer', 'delete')}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="8">Aucune inscription.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    function renderTarifs(state) {
      const section = document.getElementById('tarifs');
      section.innerHTML = `
        <div class="panel section-form">
          <div class="panel-header"><h3>Frais de scolarité d'une classe</h3><span class="meta">Montants et dates calculés automatiquement ; dates modifiables par l'administrateur</span></div>
          <form class="form-grid compact" data-form="tarif">
            ${yearSelect(state, 'tarif-classes')}
            ${categorySelect('tarif-classes')}
            ${classPicker(state, 'tarif-classes')}
            <label>Montant annuel <input name="montantAnnuel" type="number" min="0" step="1" required /></label>
            <label>Tranche 1 <input name="tranche1" type="number" min="0" step="1" /></label>
            <label>Échéance 1 <input name="dateTranche1" type="date" /></label>
            <label>Tranche 2 <input name="tranche2" type="number" min="0" step="1" /></label>
            <label>Échéance 2 <input name="dateTranche2" type="date" /></label>
            <label>Tranche 3 <input name="tranche3" type="number" min="0" step="1" /></label>
            <label>Échéance 3 <input name="dateTranche3" type="date" /></label>
            <p class="meta span-all form-section-title">Paiement mensuel (proposé au moment du paiement, en alternative aux tranches)</p>
            <label>Montant du paiement mensuel <input name="montantMensuel" type="number" min="0" step="1" placeholder="Calculé automatiquement" /></label>
            <label>Nombre de mensualités <input name="nbMois" type="number" min="1" max="12" value="9" /></label>
            <label>1ère mensualité le <input name="moisDebut" type="date" /></label>
            <p class="meta span-all" data-tarif-info aria-live="polite">Saisissez le montant annuel : les tranches et le montant mensuel sont proposés automatiquement.</p>
            ${formButtons('Ajouter')}
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Tarifs configurés</h3></div>
          <div class="cards-grid">
            ${state.tarifs.map((t) => `
              <div class="detail-card">
                <h4>${escapeHtml(className(state, t.classeId))}</h4>
                <p class="meta">Année : ${escapeHtml(yearLabel(state, t.anneeId))}</p>
                <p class="meta">Total : ${formatMoney(t.montantAnnuel)} ${escapeHtml(state.config.devise)} · ${(t.tranches || []).length} tranches</p>
                <p class="meta">${Number(t.montantMensuel) > 0 ? `Mensuel : ${t.nbMois} × ${formatMoney(t.montantMensuel)} = ${formatMoney(t.montantMensuel * t.nbMois)} ${escapeHtml(state.config.devise)}` : 'Paiement mensuel non proposé'}</p>
                ${actions(btn(`tarif:view:${t.id}`, 'Consulter'), btn(`tarif:edit:${t.id}`, 'Modifier'), btn(`tarif:duplicate:${t.id}`, 'Dupliquer'), btn(`tarif:delete:${t.id}`, 'Supprimer', 'delete'))}
              </div>`).join('')}
          </div>
        </div>`;
    }
    
    Object.assign(exports, { renderAnnees, renderClasses, renderEleves, renderInscriptions, renderTarifs });
  };
  factories['./modules/classes.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const CATEGORIES = ['Primaire', 'Collège', 'Lycée'];
    
    function createClasse(state, payload = {}) {
      const nom = String(payload.nom || '').trim();
      if (!nom) return null;
      const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
      if (state.classes.some((c) => c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;
    
      const item = {
        id: nextId(state.classes),
        nom,
        categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : CATEGORIES[0],
        anneeId,
        capacite: Number(payload.capacite || 0),
        active: payload.active !== false
      };
    
      state.classes.push(item);
      return item;
    }
    
    function updateClasse(state, id, payload = {}) {
      const item = state.classes.find((classe) => classe.id === Number(id));
      if (!item) return null;
      const nom = String(payload.nom || item.nom).trim();
      const anneeId = Number(payload.anneeId || item.anneeId);
      if (state.classes.some((c) => c.id !== item.id && c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;
    
      Object.assign(item, {
        nom,
        categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : item.categorie,
        anneeId,
        capacite: Number(payload.capacite || item.capacite),
        active: payload.active !== undefined ? payload.active : item.active
      });
    
      return item;
    }
    
    // Refus si des élèves ou des inscriptions (donc des paiements) dépendent de la classe.
    function deleteClasse(state, id) {
      const targetId = Number(id);
      const index = state.classes.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
      if (state.inscriptions.some((i) => i.classeId === targetId) || state.eleves.some((e) => e.classeId === targetId)) return false;
    
      state.classes.splice(index, 1);
      state.tarifs = state.tarifs.filter((tarif) => tarif.classeId !== targetId);
      return true;
    }
    
    Object.assign(exports, { CATEGORIES, createClasse, updateClasse, deleteClasse });
  };
  factories['./modules/dashboard.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, todayISO } = require("./utils.js");
    const { COLORS, MONTHS, short, lineChart, groupedBars, donut, classBars } = require("./charts.js");
    const { situationCaisse } = require("./tresorerie.js");
    const { situationReliquat } = require("./reliquats.js");
    const { inscriptionSituation, scopeInscriptions, sumPayments, STATUT_LABELS, labelEcheance } = require("./finance.js");
    function renderDashboard(state, filters = {}) {
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
    
    Object.assign(exports, { renderDashboard });
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
    
    
    Object.assign(exports, { COLORS, MONTHS, short, lineChart, groupedBars, donut, classBars });
  };
  factories['./modules/tresorerie.js'] = (require, exports) => {
    const { inRange } = require("./finance.js");
    // Trésorerie théorique : Solde disponible = solde d'ouverture + recettes encaissées − dépenses enregistrées.
    // Les recettes ne sont JAMAIS comptées comme des dépenses ; les paiements et dépenses annulés sont exclus des totaux.
    
    const num = (v) => Number(v || 0);
    
    function paymentYear(state, payment) {
      // Année d'encaissement : un règlement de dette antérieure compte dans la trésorerie de l'année où il est reçu
      return payment.anneeEncaissementId || payment.anneeId || state.inscriptions.find((i) => i.id === payment.inscriptionId)?.anneeId || 0;
    }
    
    // Paiements valides filtrés par année (toutes si 0), période, classe et catégorie
    function recettesFiltrees(state, { yearId = 0, from = '', to = '', classId = 0, category = '' } = {}) {
      return state.paiements.filter((p) => {
        if (p.annule) return false;
        if (yearId && paymentYear(state, p) !== yearId) return false;
        if (!inRange(p.datePaiement, from, to)) return false;
        if (classId || category) {
          const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
          const classe = state.classes.find((c) => c.id === inscription?.classeId);
          if (classId && inscription?.classeId !== classId) return false;
          if (category && classe?.categorie !== category) return false;
        }
        return true;
      });
    }
    
    function depensesFiltrees(state, { yearId = 0, from = '', to = '', categorie = '', demandeur = '' } = {}) {
      const who = String(demandeur || '').trim().toLocaleLowerCase('fr');
      return state.depenses.filter((d) => {
        if (d.annule) return false;
        if (yearId && d.anneeId !== yearId) return false;
        if (!inRange(d.date, from, to)) return false;
        if (categorie && d.categorie !== categorie) return false;
        if (who && !String(d.demandeur || '').toLocaleLowerCase('fr').includes(who)) return false;
        return true;
      });
    }
    
    const somme = (list, key) => list.reduce((s, item) => s + num(item[key]), 0);
    
    function soldeOuvertureBase(state, yearId = 0) {
      return state.annees.filter((a) => !yearId || a.id === yearId).reduce((s, a) => s + num(a.soldeInitial), 0);
    }
    
    // Situation de caisse sur un périmètre : le solde reporté inclut les mouvements antérieurs à la date de début.
    function situationCaisse(state, { yearId = 0, from = '', to = '' } = {}) {
      let ouverture = soldeOuvertureBase(state, yearId);
      if (from) {
        const before = new Date(`${from}T00:00:00`);
        before.setDate(before.getDate() - 1);
        const veille = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-${String(before.getDate()).padStart(2, '0')}`;
        ouverture += somme(recettesFiltrees(state, { yearId, to: veille }), 'montant') - somme(depensesFiltrees(state, { yearId, to: veille }), 'montant');
      }
      const recettes = somme(recettesFiltrees(state, { yearId, from, to }), 'montant');
      const depenses = somme(depensesFiltrees(state, { yearId, from, to }), 'montant');
      return { ouverture, recettes, depenses, solde: ouverture + recettes - depenses };
    }
    
    Object.assign(exports, { paymentYear, recettesFiltrees, depensesFiltrees, somme, soldeOuvertureBase, situationCaisse });
  };
  factories['./modules/config-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney } = require("./utils.js");
    const { backupStatus } = require("./backup.js");
    const { enteteConfig, DEFAULT_LOGO } = require("./entete.js");
    const { publicUsers, ROLES, currentUser, can } = require("./auth.js");
    const { listSafetyBackups } = require("./sauvegardes.js");
    const JOURNAL_LABELS = { classe: 'Classe', config: 'Configuration', paiement: 'Paiement', annulation: 'Annulation', suppression: 'Suppression', inscription: 'Inscription', eleve: 'Élève', tarif: 'Tarif', annee: 'Année', import: 'Import', depense: 'Dépense', utilisateur: 'Utilisateur', sauvegarde: 'Sauvegarde', reinitialisation: 'Réinitialisation' };
    
    function usersPanel() {
      const me = currentUser();
      return `<div class="panel">
          <div class="panel-header"><h3>Utilisateurs et rôles</h3><span class="meta">Administrateur : tout · Comptable / Caissier : saisie sans suppression · Consultation : lecture seule</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>État</th><th>Actions</th></tr></thead>
            <tbody>${publicUsers().map((u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.nom)}</td><td>${escapeHtml(ROLES[u.role])}</td>
              <td><span class="badge ${u.actif ? 'ok' : 'danger'}">${u.actif ? 'Actif' : 'Désactivé'}</span></td>
              <td><button class="action-btn" data-action="user:password:${u.id}">Mot de passe</button>${u.id === me?.id ? '' : `<button class="action-btn" data-action="user:toggle:${u.id}">${u.actif ? 'Désactiver' : 'Activer'}</button>`}</td></tr>`).join('')}</tbody>
          </table></div>
          <form class="form-grid compact" data-form="utilisateur" autocomplete="off">
            <label>Identifiant <input name="username" type="text" required minlength="3" /></label>
            <label>Nom complet <input name="nom" type="text" required /></label>
            <label>Rôle <select name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === 'comptable' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>Mot de passe (8 caractères, lettre + chiffre) <input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn">Créer l’utilisateur</button></div>
          </form>
        </div>`;
    }
    
    function safetyPanel(state) {
      const backups = listSafetyBackups();
      return `<div class="panel">
          <div class="panel-header"><h3>Copies de sécurité</h3><span class="meta">Créées automatiquement avant une réinitialisation ou un import. Jamais supprimées sans autorisation administrateur.</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Motif</th><th>Par</th><th>Contenu</th><th>Actions</th></tr></thead>
            <tbody>${backups.map((b) => `<tr><td>${escapeHtml(new Date(b.date).toLocaleString('fr-FR'))}</td><td>${escapeHtml(b.motif)}</td><td>${escapeHtml(b.par || '—')}</td>
              <td>${b.resume.eleves} élève(s) · ${b.resume.paiements} paiement(s) · ${b.resume.depenses} dépense(s)</td>
              <td><button class="action-btn" data-action="safety:download:${b.id}">Télécharger</button><button class="action-btn" data-action="safety:restore:${b.id}">Restaurer</button><button class="action-btn delete" data-action="safety:delete:${b.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5">Aucune copie de sécurité.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="panel danger-zone">
          <div class="panel-header"><h3>Zone dangereuse — réinitialisation</h3><span class="meta">Efface élèves, classes, frais, inscriptions, paiements, dépenses et journal. L’établissement, les années et les comptes sont conservés.</span></div>
          <p class="meta">Une copie de sécurité est créée automatiquement avant l’effacement. Mot de passe administrateur et saisie du mot RÉINITIALISER obligatoires.</p>
          <div class="form-actions"><button class="danger-btn" data-action="admin:reset">Réinitialiser les données…</button>
          ${backups.length ? '<button class="danger-btn ghost" data-action="admin:purge-backups">Supprimer toutes les copies de sécurité…</button>' : ''}</div>
        </div>`;
    }
    
    function renderConfig(state) {
      const section = document.getElementById('config');
      if (!can('admin')) { section.innerHTML = '<div class="panel"><p class="meta">Accès réservé à l’administrateur.</p></div>'; return; }
      const c = state.config;
      const b = backupStatus();
      const e = enteteConfig(c);
      const journal = [...(state.journal || [])].reverse().slice(0, 100);
      section.innerHTML = `
        <div class="panel section-form">
          <div class="panel-header"><h3>Établissement</h3><span class="meta">Ces informations apparaissent sur les reçus et les rapports</span></div>
          <form class="form-grid compact" data-form="config">
            <label>Nom <input name="nom" type="text" value="${escapeHtml(c.nom)}" /></label>
            <label>Sigle <input name="sigle" type="text" value="${escapeHtml(c.sigle)}" /></label>
            <label>Code <input name="codeEcole" type="text" value="${escapeHtml(c.codeEcole)}" /></label>
            <label>Devise <input name="devise" type="text" value="${escapeHtml(c.devise || 'GNF')}" /></label>
            <label>Nom du caissier (affiché sur tous les reçus) <input name="caissier" type="text" value="${escapeHtml(c.caissier || '')}" placeholder="Laisser vide : utilisateur connecté" /></label>
            <label>Adresse <input name="adresse" type="text" value="${escapeHtml(c.adresse)}" /></label>
            <label>Téléphone <input name="telephone" type="text" value="${escapeHtml(c.telephone)}" /></label>
            <label>Email <input name="email" type="email" value="${escapeHtml(c.email)}" /></label>
            <label class="span-two">Tutelle (une ligne par information)
              <textarea name="tutelle" rows="5">${escapeHtml(e.tutelle.join(String.fromCharCode(10)))}</textarea>
            </label>
            <label>Slogan (encadré bleu et jaune) <input name="slogan" type="text" value="${escapeHtml(e.slogan)}" /></label>
            <label>Téléphones (en-tête) <input name="telephones" type="text" value="${escapeHtml(e.telephones)}" /></label>
            <label>E-mail (en-tête) <input name="enteteEmail" type="email" value="${escapeHtml(e.email)}" /></label>
            <label>Logo de l’établissement <input type="file" accept="image/*" data-logo-input /></label>
            <label>Symbole national (image) <input type="file" accept="image/*" data-armoiries-input /></label>
            <div class="form-actions span-all">
              <img src="${escapeHtml(c.logo || DEFAULT_LOGO)}" alt="Logo" class="logo-preview" />
              ${c.logo ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-logo">Logo par défaut</button>' : ''}
              ${c.armoiries ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-armoiries">Retirer le symbole</button>' : ''}
              <button type="submit" class="primary-btn">Enregistrer</button>
            </div>
          </form>
        </div>
    
        ${usersPanel()}
    
        <div class="panel">
          <div class="panel-header"><h3>Sauvegarde</h3><span class="meta">La base principale reste le stockage du navigateur ; ces fichiers sont des copies lisibles.</span></div>
          <p class="meta">Destination : <b>${escapeHtml(b.target)}</b>${b.lastAt ? ` · dernière sauvegarde à ${escapeHtml(b.lastAt)}` : ''}${b.error ? ` · <span class="badge danger">${escapeHtml(b.error)}</span>` : ''}</p>
          <div class="form-actions">
            <button class="primary-btn small-btn" data-action="backup:choose" ${b.supported ? '' : 'disabled title="Chrome ou Edge requis"'}>${b.fileConnected ? 'Changer le fichier de sauvegarde automatique' : 'Activer la sauvegarde automatique dans un fichier'}</button>
            <button class="secondary-btn small-btn" data-action="backup:txt">Exporter une note lisible (TXT)</button>
            <button class="secondary-btn small-btn" data-action="backup:json">Exporter les données (JSON)</button>
          </div>
        </div>
    
        ${safetyPanel(state)}
    
        <div class="panel">
          <div class="panel-header"><h3>Historique des opérations comptables</h3><span class="meta">${journal.length} dernière(s) opération(s)</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Date et heure</th><th>Opération</th><th>Utilisateur</th><th>Détail</th><th>Montant</th></tr></thead>
            <tbody>${journal.map((j) => `<tr><td>${escapeHtml(new Date(j.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(JOURNAL_LABELS[j.type] || j.type)}</td><td>${escapeHtml(j.utilisateur || '—')}</td><td>${escapeHtml(j.detail)}</td><td class="num">${j.montant ? `${formatMoney(j.montant)} ${escapeHtml(c.devise)}` : ''}</td></tr>`).join('') || '<tr><td colspan="5">Aucune opération enregistrée.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    Object.assign(exports, { renderConfig });
  };
  factories['./modules/backup.js'] = (require, exports) => {
    const { formatMoney, formatDateFr, downloadBlob, todayISO } = require("./utils.js");
    const { inscriptionSituation, STATUT_LABELS, studentOf, classOf, yearLabel, labelEcheance } = require("./finance.js");
    // La base principale reste localStorage. Ces sauvegardes sont des copies de lecture/secours :
    //  - copie roulante dans localStorage (toujours),
    //  - fichier .note choisi par l'utilisateur et réécrit automatiquement (navigateurs compatibles).
    const BACKUP_KEY = 'ibk_backup_note_v1';
    const IDB_NAME = 'ibk_backup';
    let fileHandle = null;
    let timer = null;
    const status = { lastAt: '', target: 'Copie locale du navigateur', error: '' };
    
    function buildNoteText(state) {
      const c = state.config;
      const line = (...parts) => parts.join('  ');
      const out = [`${c.nom} — NOTE DE SAUVEGARDE`, `Générée le ${new Date().toLocaleString('fr-FR')}`, '='.repeat(70), ''];
      out.push('SITUATION DES ÉLÈVES INSCRITS');
      let attendu = 0; let paye = 0;
      state.inscriptions.forEach((i) => {
        const s = studentOf(state, i);
        const sit = inscriptionSituation(state, i);
        attendu += sit.total; paye += sit.paye;
        out.push(line(`- ${s?.matricule || '—'}`, `${s ? `${s.prenom} ${s.nom}` : '—'}`, `[${classOf(state, i.classeId)?.nom || '—'} / ${yearLabel(state, i.anneeId)}]`,
          `attendu ${formatMoney(sit.total)}`, `payé ${formatMoney(sit.paye)}`, `reste ${formatMoney(sit.reste)} ${c.devise}`, `(${STATUT_LABELS[sit.statut]})`));
      });
      out.push('', `TOTAL attendu ${formatMoney(attendu)} · encaissé ${formatMoney(paye)} · reste ${formatMoney(Math.max(attendu - paye, 0))} ${c.devise}`, '', 'PAIEMENTS');
      [...state.paiements].sort((a, b) => a.id - b.id).forEach((p) => {
        const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
        const s = studentOf(state, i);
        out.push(line(`- ${formatDateFr(p.datePaiement)}`, p.numeroRecu || `#${p.id}`, s ? `${s.prenom} ${s.nom}` : '—', labelEcheance(i?.echeances?.find((e) => e.id === p.echeanceId)),
          `${formatMoney(p.montant)} ${c.devise}`, p.mode, p.annule ? `ANNULÉ (${p.motif})` : ''));
      });
      out.push('', 'JOURNAL DES OPÉRATIONS (100 dernières)');
      (state.journal || []).slice(-100).forEach((j) => out.push(`- ${new Date(j.horodatage).toLocaleString('fr-FR')}  ${j.type.toUpperCase()}  ${j.detail}${j.montant ? `  ${formatMoney(j.montant)} ${c.devise}` : ''}`));
      return out.join('\n');
    }
    
    function exportNoteText(state) {
      downloadBlob(`note-scolarite-${todayISO()}.txt`, `﻿${buildNoteText(state)}`, 'text/plain;charset=utf-8');
    }
    
    function backupStatus() {
      return { ...status, fileConnected: Boolean(fileHandle), supported: typeof window.showSaveFilePicker === 'function' };
    }
    
    function idb(mode, fn) {
      return new Promise((resolve, reject) => {
        const open = indexedDB.open(IDB_NAME, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('kv');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', mode);
          const req = fn(tx.objectStore('kv'));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => reject(tx.error);
        };
      });
    }
    
    async function initAutoBackup() {
      try {
        const stored = await idb('readonly', (store) => store.get('handle'));
        if (stored && (await stored.queryPermission({ mode: 'readwrite' })) === 'granted') {
          fileHandle = stored;
          status.target = `Fichier ${stored.name}`;
        }
      } catch (error) { /* navigateur sans prise en charge : la copie locale suffit */ }
    }
    
    async function chooseBackupFile(state) {
      if (typeof window.showSaveFilePicker !== 'function') throw new Error('Ce navigateur ne permet pas l’écriture automatique de fichier. Utilisez Chrome ou Edge, ou l’export manuel.');
      fileHandle = await window.showSaveFilePicker({ suggestedName: 'school_data.note', types: [{ description: 'Note JSON', accept: { 'application/json': ['.note', '.json', '.txt'] } }] });
      try { await idb('readwrite', (store) => store.put(fileHandle, 'handle')); } catch (error) { /* non bloquant */ }
      status.target = `Fichier ${fileHandle.name}`;
      await runBackup(state);
    }
    
    async function runBackup(state) {
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: new Date().toISOString(), data: state }));
        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(state, null, 2));
          await writable.close();
        }
        status.lastAt = new Date().toLocaleTimeString('fr-FR');
        status.error = '';
      } catch (error) {
        status.error = error.message || 'Échec de la sauvegarde';
      }
    }
    
    function scheduleBackup(state) {
      clearTimeout(timer);
      timer = setTimeout(() => runBackup(state), 1500);
    }
    
    Object.assign(exports, { buildNoteText, exportNoteText, backupStatus, initAutoBackup, chooseBackupFile, scheduleBackup });
  };
  factories['./modules/entete.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    // Fichier livré avec l'application ; l'espace du nom est encodé pour un chargement fiable (écran, impression, PDF)
    const DEFAULT_LOGO = './LOGO%20IBK.png';
    
    const ENTETE_DEFAUT = {
      tutelle: ['MEPU-A', 'IRE / CONAKRY', 'DCE / DIXINN', 'DSE / DIXINN', 'QUARTIER : DIXINN-CENTRE 1'],
      slogan: 'Primaire – Collège – Lycée',
      telephones: '+224 624-24-56-24 / 624-39-68-84',
      email: 'gsibrahimababakake@gmail.com'
    };
    
    function enteteConfig(config) {
      const e = config.entete || {};
      return {
        tutelle: Array.isArray(e.tutelle) && e.tutelle.length ? e.tutelle : ENTETE_DEFAUT.tutelle,
        slogan: e.slogan || ENTETE_DEFAUT.slogan,
        telephones: e.telephones || ENTETE_DEFAUT.telephones,
        email: e.email || ENTETE_DEFAUT.email
      };
    }
    
    // « GROUPE SCOLAIRE » en bleu foncé, puis l'initiale de chaque mot du nom propre en bleu / jaune / rouge
    function nameHtml(nom) {
      const words = String(nom || '').toUpperCase().split(/\s+/).filter(Boolean);
      const colors = ['eh-c1', 'eh-c2', 'eh-c3'];
      const lead = words.slice(0, 2).join(' ');
      const rest = words.slice(2).map((w, i) => `<span class="${colors[i % 3]}">${escapeHtml(w.charAt(0))}</span>${escapeHtml(w.slice(1))}`).join(' ');
      return `${escapeHtml(lead)} ${rest}`.trim();
    }
    
    function flagHtml() {
      return '<div class="eh-flag" role="img" aria-label="Drapeau de la Guinée"><i style="background:#ce1126"></i><i style="background:#fcd116"></i><i style="background:#009460"></i></div>';
    }
    
    function emblemHtml(config) {
      if (config.armoiries) return `<img class="eh-emblem-img" src="${escapeHtml(config.armoiries)}" alt="Symbole national" />`;
      return '<div class="eh-emblem">Guinée</div>';
    }
    
    // En-tête officiel unique : à utiliser sur tous les documents imprimés/exportés.
    function enteteHtml(config, { compact = false } = {}) {
      const e = enteteConfig(config);
      return `<header class="eh ${compact ? 'compact' : ''}">
        <div class="eh-left">
          <div class="eh-admin">${e.tutelle.map(escapeHtml).join('<br>')}</div>
          <img class="eh-logo" src="${escapeHtml(config.logo || DEFAULT_LOGO)}" alt="Logo de l'établissement" onerror="this.style.visibility='hidden'" />
        </div>
        <div class="eh-center">
          <div class="eh-name">${nameHtml(config.nom)}</div>
          <div class="eh-slogan">${escapeHtml(e.slogan)}</div>
          <div class="eh-contact"><b>Tél :</b> ${escapeHtml(e.telephones)}</div>
          <div class="eh-contact"><b>Email :</b> ${escapeHtml(e.email)}</div>
        </div>
        <div class="eh-right">${flagHtml()}${emblemHtml(config)}</div>
      </header>`;
    }
    
    // Version texte pour les exports tableur
    function enteteLignes(config) {
      const e = enteteConfig(config);
      return [[config.nom], [e.tutelle.join(' · ')], [`${e.slogan} — Tél : ${e.telephones} — ${e.email}`]];
    }
    
    Object.assign(exports, { DEFAULT_LOGO, ENTETE_DEFAUT, enteteConfig, enteteHtml, enteteLignes });
  };
  factories['./modules/sauvegardes.js'] = (require, exports) => {
    // Copies de sécurité conservées dans le navigateur. Elles sont créées avant toute opération destructrice
    // (réinitialisation, import) et ne sont JAMAIS supprimées automatiquement : seule une action explicite,
    // autorisée par un administrateur, peut en retirer une.
    const SAFETY_KEY = 'ibk_safety_backups_v1';
    
    function readAll() {
      try {
        const parsed = JSON.parse(localStorage.getItem(SAFETY_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) { return []; }
    }
    
    function writeAll(list) {
      localStorage.setItem(SAFETY_KEY, JSON.stringify(list));
    }
    
    const summary = (state) => ({
      eleves: state.eleves.length,
      inscriptions: state.inscriptions.length,
      paiements: state.paiements.length,
      depenses: (state.depenses || []).length
    });
    
    function listSafetyBackups() {
      return readAll().map(({ id, date, motif, par, resume, taille }) => ({ id, date, motif, par, resume, taille })).sort((a, b) => b.id - a.id);
    }
    
    // Lève une erreur si la copie ne peut pas être conservée (stockage plein) : l'appelant doit alors renoncer à l'opération.
    function createSafetyBackup(state, motif, par = '') {
      const list = readAll();
      const data = JSON.stringify(state);
      const entry = { id: list.reduce((m, b) => Math.max(m, b.id), 0) + 1, date: new Date().toISOString(), motif, par, resume: summary(state), taille: data.length, data };
      list.push(entry);
      writeAll(list);
      // Relecture : on s'assure que la copie est bien lisible avant d'autoriser la suite
      const stored = readAll().find((b) => b.id === entry.id);
      if (!stored || stored.data !== data) throw new Error('La copie de sécurité n’a pas pu être vérifiée.');
      return { id: entry.id, date: entry.date, motif, par, resume: entry.resume, taille: entry.taille };
    }
    
    function readSafetyBackup(id) {
      const entry = readAll().find((b) => b.id === Number(id));
      return entry ? JSON.parse(entry.data) : null;
    }
    
    function deleteSafetyBackup(id) {
      const list = readAll();
      const next = list.filter((b) => b.id !== Number(id));
      if (next.length === list.length) return false;
      writeAll(next);
      return true;
    }
    
    function deleteAllSafetyBackups() {
      const count = readAll().length;
      writeAll([]);
      return count;
    }
    
    Object.assign(exports, { listSafetyBackups, createSafetyBackup, readSafetyBackup, deleteSafetyBackup, deleteAllSafetyBackups });
  };
  factories['./modules/depenses-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO, numberToFrench } = require("./utils.js");
    const { CATEGORIES_DEPENSE, ensureExpenseNumber } = require("./depenses.js");
    const { situationCaisse } = require("./tresorerie.js");
    const { printDocument } = require("./print.js");
    const { enteteHtml } = require("./entete.js");
    const { can } = require("./auth.js");
    const depenseFilters = { yearId: 0, from: '', to: '', categorie: '', demandeur: '' };
    const MAX_PIECE_BYTES = 300 * 1024;
    
    function resetDepenseFilters(state) {
      Object.assign(depenseFilters, { yearId: Number(state.anneeActiveId || 0), from: '', to: '', categorie: '', demandeur: '' });
    }
    
    // Lit la pièce justificative (image ou PDF léger) pour la conserver avec la dépense
    function readPiece(file) {
      return new Promise((resolve, reject) => {
        if (!file) { resolve(null); return; }
        if (file.size > MAX_PIECE_BYTES) { reject(new Error('Pièce trop lourde (300 Ko maximum).')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ nom: file.name, type: file.type, data: String(reader.result) });
        reader.onerror = () => reject(new Error('Lecture de la pièce impossible.'));
        reader.readAsDataURL(file);
      });
    }
    
    function categoriesInUse(state) {
      return [...new Set([...CATEGORIES_DEPENSE, ...state.depenses.map((d) => d.categorie)])].sort((a, b) => a.localeCompare(b, 'fr'));
    }
    
    const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';
    
    function renderDepenseOutput(state) {
      const out = document.getElementById('depense-output');
      if (!out) return;
      const f = depenseFilters;
      const devise = escapeHtml(state.config.devise);
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const caisse = situationCaisse(state, { yearId: f.yearId, from: f.from, to: f.to });
      const list = state.depenses
        .filter((d) => (!f.yearId || d.anneeId === f.yearId) && (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to) && (!f.categorie || d.categorie === f.categorie)
          && (!f.demandeur || String(d.demandeur).toLocaleLowerCase('fr').includes(f.demandeur.toLocaleLowerCase('fr'))))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
      const admin = can('admin');
      out.innerHTML = `
        <div class="stats-grid">
          <article class="stat-card accent-green"><div><span>Recettes encaissées</span><strong>${money(caisse.recettes)}</strong></div></article>
          <article class="stat-card accent-red"><div><span>Dépenses</span><strong>${money(caisse.depenses)}</strong></div></article>
          <article class="stat-card accent-purple"><div><span>Solde d’ouverture</span><strong>${money(caisse.ouverture)}</strong></div></article>
          <article class="stat-card ${caisse.solde < 0 ? 'accent-red' : 'accent-orange'}"><div><span>Solde disponible</span><strong>${money(caisse.solde)}</strong></div></article>
        </div>
        <p class="meta">Solde disponible = solde d’ouverture + recettes encaissées − dépenses enregistrées (paiements et dépenses annulés exclus).</p>
        <div class="table-wrap"><table>
          <thead><tr><th>N°</th><th>Date</th><th>Année</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire</th><th>Demandé par</th><th>Montant</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>${list.map((d) => `<tr class="${d.annule ? 'cancelled' : ''}">
            <td>${escapeHtml(d.numero)}</td><td>${escapeHtml(formatDateFr(d.date))}</td><td>${escapeHtml(yearName(state, d.anneeId))}</td><td>${escapeHtml(d.categorie)}</td>
            <td>${escapeHtml(d.description)}${d.reference ? `<div class="meta">Réf. ${escapeHtml(d.reference)}</div>` : ''}${d.piece ? `<div class="meta"><a href="${escapeHtml(d.piece.data)}" download="${escapeHtml(d.piece.nom)}">📎 ${escapeHtml(d.piece.nom)}</a></div>` : ''}${(d.historique || []).length ? `<div class="meta">${d.historique.length} correction(s) tracée(s)</div>` : ''}</td>
            <td>${escapeHtml(d.beneficiaire || '—')}</td><td>${escapeHtml(d.demandeur)}</td><td class="num">${money(d.montant)}</td>
            <td><span class="badge ${d.annule ? 'danger' : 'ok'}">${d.annule ? 'Annulée' : 'Validée'}</span>${d.annule ? `<div class="meta">${escapeHtml(d.motif)}</div>` : ''}</td>
            <td>${d.annule ? '' : `<button class="action-btn" data-action="depense:receipt:${d.id}">Reçu</button>${admin ? `<button class="action-btn" data-action="depense:edit:${d.id}">Corriger</button><button class="action-btn delete" data-action="depense:cancel:${d.id}">Annuler</button>` : ''}`}</td>
          </tr>`).join('') || '<tr><td colspan="10">Aucune dépense pour cette sélection.</td></tr>'}</tbody>
        </table></div>`;
    }
    
    function renderDepenses(state) {
      const section = document.getElementById('depenses');
      if (!section) return;
      if (!depenseFilters.yearId) resetDepenseFilters(state);
      const f = depenseFilters;
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const writable = can('write');
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Trésorerie</span><h2>Dépenses et reçus de dépense</h2></div></div>
        ${writable ? `<div class="panel section-form">
          <div class="panel-header"><h3>Enregistrer une dépense</h3><span class="meta">Les recettes ne sont jamais enregistrées comme dépenses</span></div>
          <form class="form-grid compact" data-form="depense" autocomplete="off">
            <input type="hidden" name="token" value="${token}" />
            <label>Année scolaire <select name="anneeId">${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
            <label>Date <input name="date" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
            <label>Catégorie <input name="categorie" list="dep-categories" required placeholder="Choisir ou saisir" /><datalist id="dep-categories">${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}"></option>`).join('')}</datalist></label>
            <label>Montant (${escapeHtml(state.config.devise)}) <input name="montant" type="number" min="1" step="1" required /></label>
            <label class="span-two">Description <input name="description" type="text" required /></label>
            <label>Bénéficiaire <input name="beneficiaire" type="text" placeholder="Fournisseur, personne…" /></label>
            <label>Demandé par <input name="demandeur" type="text" required /></label>
            <label>N° de référence (facture, bon…) <input name="reference" type="text" /></label>
            <label>Pièce justificative (300 Ko max.) <input name="piece" type="file" accept="image/*,application/pdf" /></label>
            <label class="check-row"><input type="checkbox" name="imprimer" checked /> Imprimer le reçu de dépense</label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn" data-submit-label>Enregistrer la dépense</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
          </form>
        </div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Historique des dépenses</h3></div>
          <div class="advanced-search">
            <label>Année scolaire <select data-df="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
            <label>Du <input type="date" data-df="from" value="${escapeHtml(f.from)}" /></label>
            <label>Au <input type="date" data-df="to" value="${escapeHtml(f.to)}" /></label>
            <label>Catégorie <select data-df="categorie"><option value="">Toutes</option>${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}" ${c === f.categorie ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label>
            <label>Demandeur <input type="search" data-df="demandeur" value="${escapeHtml(f.demandeur)}" placeholder="Nom…" /></label>
          </div>
          <div id="depense-output"></div>
        </div>`;
      renderDepenseOutput(state);
    }
    
    function capitalize(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }
    
    function expenseAmountInWords(amount, devise) {
      const n = Math.floor(Number(amount) || 0);
      const unit = devise === 'GNF' ? `franc${n > 1 ? 's' : ''} guinéen${n > 1 ? 's' : ''}` : devise;
      return `${capitalize(numberToFrench(n))} ${unit}`;
    }
    
    const RECEIPT_CSS = `
      #print-root .dp-sheet { width: 210mm; box-sizing: border-box; padding: 8mm 12mm; }
      #print-root .dp-title { text-align: center; margin: 10px 0 6px; font-size: 16px; color: #fff; background: #7c3aed; padding: 5px; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root .dp-refrow { display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; }
      #print-root .dp-refrow b { color: #c2410c; font-size: 15px; }
      #print-root .dp-body p { display: flex; gap: 10px; align-items: baseline; margin: 0; padding: 7px 0; border-bottom: 1px dotted #9ca3af; font-size: 13px; }
      #print-root .dp-body p span { flex: none; width: 34mm; color: #6b7280; font-size: 11px; }
      #print-root .dp-amount b { font-size: 20px; color: #c2410c; }
      #print-root .dp-sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16mm; font-size: 11px; }
      #print-root .dp-sign div { border-top: 1px solid #111827; padding-top: 4px; text-align: center; height: 22mm; }
    `;
    
    function printExpenseReceipt(state, id) {
      const d = state.depenses.find((x) => x.id === Number(id));
      if (!d || d.annule) return false;
      ensureExpenseNumber(state, d);
      const c = state.config;
      const devise = escapeHtml(c.devise);
      const html = `<div class="dp-sheet">
        ${enteteHtml(c, { compact: true })}
        <div class="dp-refrow"><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}</span><span>Année scolaire : ${escapeHtml(yearName(state, d.anneeId))}</span></div>
        <h2 class="dp-title">REÇU DE DÉPENSE</h2>
        <div class="dp-body">
          <p class="dp-amount"><span>Montant</span><b>${formatMoney(d.montant)} ${devise}</b></p>
          <p><span>En lettres</span><b>${escapeHtml(expenseAmountInWords(d.montant, c.devise))}</b></p>
          <p><span>Catégorie</span><b>${escapeHtml(d.categorie)}</b></p>
          <p><span>Description</span><b>${escapeHtml(d.description)}</b></p>
          <p><span>Bénéficiaire</span><b>${escapeHtml(d.beneficiaire || '—')}</b></p>
          <p><span>Demandé par</span><b>${escapeHtml(d.demandeur)}</b></p>
          ${d.reference ? `<p><span>Référence</span><b>${escapeHtml(d.reference)}</b></p>` : ''}
          <p><span>Caissier</span><b>${escapeHtml(d.caissier || '—')}</b></p>
        </div>
        <div class="dp-sign"><div>Le demandeur</div><div>Le bénéficiaire</div><div>Le caissier</div><div>Le directeur / visa</div></div>
      </div>`;
      return printDocument({ title: `Dépense ${d.numero}`, html, css: RECEIPT_CSS });
    }
    
    function setDepenseFilter(key, value) {
      depenseFilters[key] = key === 'yearId' ? Number(value || 0) : value;
    }
    
    
    Object.assign(exports, { depenseFilters, resetDepenseFilters, readPiece, categoriesInUse, renderDepenseOutput, renderDepenses, expenseAmountInWords, printExpenseReceipt, setDepenseFilter });
  };
  factories['./modules/depenses.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const CATEGORIES_DEPENSE = [
      'Salaires et indemnités', 'Fournitures et matériel', 'Entretien et réparations', 'Eau et électricité', 'Transport',
      'Communication', 'Équipement', 'Examens et pédagogie', 'Sécurité et assurance', 'Impôts et frais administratifs', 'Divers'
    ];
    
    const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
    
    const text = (value) => String(value ?? '').trim();
    
    // Numéro de pièce unique et séquentiel par année civile : DEP-2026-000001 (jamais réutilisé, même après annulation)
    function ensureExpenseNumber(state, depense) {
      if (depense.numero) return depense.numero;
      const year = String(depense.date || todayISO()).slice(0, 4);
      if (!state.compteursDepense || typeof state.compteursDepense !== 'object') state.compteursDepense = {};
      const used = state.depenses
        .map((d) => d.numero)
        .filter((n) => typeof n === 'string' && n.startsWith(`DEP-${year}-`))
        .reduce((max, n) => Math.max(max, Number(n.split('-')[2]) || 0), 0);
      const next = Math.max(Number(state.compteursDepense[year] || 0), used) + 1;
      state.compteursDepense[year] = next;
      depense.numero = `DEP-${year}-${String(next).padStart(6, '0')}`;
      return depense.numero;
    }
    
    function validateDepense(state, payload = {}, { ignoreDuplicate = false } = {}) {
      const montant = Number(payload.montant);
      const date = payload.date || todayISO();
      if (!text(payload.categorie)) return { ok: false, message: 'Choisissez ou saisissez une catégorie de dépense.' };
      if (!text(payload.description)) return { ok: false, message: 'La description de la dépense est obligatoire.' };
      if (!Number.isFinite(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être supérieur à zéro.' };
      if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier de francs.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de dépense invalide.' };
      if (date > todayISO()) return { ok: false, message: 'La date de la dépense ne peut pas être dans le futur.' };
      if (!text(payload.demandeur)) return { ok: false, message: 'Indiquez qui a demandé la dépense.' };
      const annee = state.annees.find((a) => a.id === Number(payload.anneeId));
      if (!annee) return { ok: false, message: 'Année scolaire introuvable.' };
      if (annee.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : aucune dépense ne peut y être enregistrée.` };
      if (payload.token && state.depenses.some((d) => d.token === payload.token)) {
        return { ok: false, message: 'Ce formulaire a déjà été enregistré (double soumission évitée).' };
      }
      const now = Date.now();
      const similar = state.depenses.some((d) => !d.annule && Number(d.montant) === montant && d.date === date
        && d.categorie === text(payload.categorie) && text(d.beneficiaire) === text(payload.beneficiaire) && now - Number(d.creeLe || 0) < DUPLICATE_WINDOW_MS);
      if (similar && !ignoreDuplicate) return { ok: false, duplicate: true, message: 'Une dépense identique vient d’être enregistrée.' };
      return { ok: true };
    }
    
    function createDepense(state, payload = {}, options = {}) {
      if (!validateDepense(state, payload, options).ok) return null;
      return withTransaction(state, () => {
        const user = currentUser();
        const depense = {
          id: nextId(state.depenses),
          anneeId: Number(payload.anneeId),
          categorie: text(payload.categorie),
          description: text(payload.description),
          montant: Number(payload.montant),
          date: payload.date || todayISO(),
          beneficiaire: text(payload.beneficiaire),
          demandeur: text(payload.demandeur),
          reference: text(payload.reference),
          piece: payload.piece || null,
          caissier: text(state.config.caissier) || user?.nom || '',
          utilisateur: user?.nom || '',
          utilisateurId: user?.id || 0,
          annule: false,
          motif: '',
          historique: [],
          token: payload.token || '',
          creeLe: Date.now()
        };
        state.depenses.push(depense);
        ensureExpenseNumber(state, depense);
        logOperation(state, 'depense', `${depense.numero} — ${depense.categorie} : ${depense.description}`, depense.montant);
        return depense;
      });
    }
    
    // Correction : l'état précédent est conservé dans l'historique de la dépense (rien n'est perdu)
    function updateDepense(state, id, payload = {}) {
      const depense = state.depenses.find((d) => d.id === Number(id));
      if (!depense || depense.annule) return null;
      // Le contrôle de doublon porte sur l'enregistrement lui-même (il vient d'être créé) : seul un doublon est toléré ici
      const check = validateDepense(state, { ...payload, token: '' }, { ignoreDuplicate: true });
      if (!check.ok) return null;
      return withTransaction(state, () => {
        const before = { categorie: depense.categorie, description: depense.description, montant: depense.montant, date: depense.date, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference, anneeId: depense.anneeId };
        depense.historique = [...(depense.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant: before }];
        Object.assign(depense, {
          anneeId: Number(payload.anneeId), categorie: text(payload.categorie), description: text(payload.description), montant: Number(payload.montant),
          date: payload.date || depense.date, beneficiaire: text(payload.beneficiaire), demandeur: text(payload.demandeur), reference: text(payload.reference)
        });
        if (payload.piece) depense.piece = payload.piece;
        logOperation(state, 'depense', `${depense.numero} corrigée (avant : ${before.montant} — ${before.description})`, depense.montant);
        return depense;
      });
    }
    
    // Annulation : la ligne et son numéro sont conservés, elle n'entre plus dans les totaux
    function cancelDepense(state, id, motif) {
      const depense = state.depenses.find((d) => d.id === Number(id));
      if (!depense || depense.annule || !text(motif)) return null;
      return withTransaction(state, () => {
        depense.annule = true;
        depense.motif = text(motif);
        depense.dateAnnulation = todayISO();
        depense.annuleePar = currentUser()?.nom || '';
        logOperation(state, 'annulation', `Dépense ${depense.numero} annulée — ${depense.motif}`, depense.montant);
        return depense;
      });
    }
    
    Object.assign(exports, { CATEGORIES_DEPENSE, ensureExpenseNumber, validateDepense, createDepense, updateDepense, cancelDepense });
  };
  factories['./modules/print.js'] = (require, exports) => {
    // Impression via #print-root (masqué à l'écran, seul visible à l'impression, cf. style.css).
    // Chaque document apporte sa propre règle @page ; elle est remplacée à chaque impression.
    function printDocument({ title, html, css = '', page = 'A4 portrait', margin = '12mm' }) {
      const root = document.getElementById('print-root');
      if (!root) return false;
      root.innerHTML = `<div class="print-document" data-print-title="${String(title).replace(/"/g, '&quot;')}">
        <style>
          @page { size: ${page}; margin: ${margin}; }
          #print-root .print-document { font: 12px Arial, Helvetica, sans-serif; color: #111827; }
          #print-root table { width: 100%; border-collapse: collapse; }
          #print-root th, #print-root td { text-align: left; border-bottom: 1px solid #d1d5db; padding: 6px 6px; }
          #print-root th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; }
          #print-root .num { text-align: right; white-space: nowrap; }
          #print-root h1, #print-root h2 { margin: 0 0 8px; }
          #print-root .r-title { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 10px 0 4px; padding-bottom: 6px; border-bottom: 2px solid #1e3a8a; }
          #print-root .r-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-bottom: 14px; }
          #print-root .r-kpis { display: flex; gap: 10px; margin: 12px 0; }
          #print-root .r-kpis div { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
          #print-root .r-kpis strong { display: block; font-size: 16px; }
          #print-root .r-group { page-break-inside: avoid; margin-top: 14px; }
          #print-root tfoot td { font-weight: bold; background: #faf5ff; }
          ${css}
        </style>${html}</div>`;
      // On attend le chargement des images (logo, symbole) : sinon elles peuvent manquer à l'impression ou dans le PDF
      const images = [...root.querySelectorAll('img')];
      const loaded = images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })));
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
      Promise.race([Promise.all(loaded), timeout]).then(() => window.print());
      return true;
    }
    
    Object.assign(exports, { printDocument });
  };
  factories['./modules/login-view.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    const { hasUsers, createUser, authenticate, startSession, lockRemainingMs, passwordProblem } = require("./auth.js");
    // Écran de connexion plein écran. Au tout premier lancement, il propose de créer le compte administrateur
    // (aucun mot de passe par défaut n'existe). Résout avec l'utilisateur connecté.
    function showLogin(schoolName = 'Gestion scolaire') {
      return new Promise((resolve) => {
        const root = document.getElementById('login-root');
        const firstRun = !hasUsers();
        root.hidden = false;
        root.innerHTML = `<div class="login-page">
          <form class="login-card" autocomplete="off" novalidate>
            <div class="login-brand"><div class="brand-badge">IBK</div><div><strong>${escapeHtml(schoolName)}</strong><span>Gestion scolaire et comptabilité</span></div></div>
            <h1>${firstRun ? 'Créer le compte administrateur' : 'Connexion'}</h1>
            <p class="meta">${firstRun ? 'Premier lancement : choisissez un identifiant et un mot de passe. Conservez-les précieusement.' : 'Saisissez vos identifiants pour accéder à l’application.'}</p>
            ${firstRun ? '<label>Nom complet <input name="nom" type="text" required autocomplete="name" /></label>' : ''}
            <label>Identifiant <input name="username" type="text" required autocomplete="username" autofocus /></label>
            <label>Mot de passe <input name="password" type="password" required autocomplete="${firstRun ? 'new-password' : 'current-password'}" /></label>
            ${firstRun ? '<label>Confirmer le mot de passe <input name="confirm" type="password" required autocomplete="new-password" /></label>' : ''}
            <p class="form-error" data-login-error role="alert" hidden></p>
            <button type="submit" class="primary-btn">${firstRun ? 'Créer le compte et entrer' : 'Se connecter'}</button>
          </form>
        </div>`;
        const form = root.querySelector('form');
        const error = root.querySelector('[data-login-error]');
        const fail = (message) => { error.textContent = message; error.hidden = false; };
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const username = String(data.get('username') || '').trim();
          const password = String(data.get('password') || '');
          if (!username || !password) { fail('Renseignez l’identifiant et le mot de passe.'); return; }
          let user;
          if (firstRun) {
            if (password !== data.get('confirm')) { fail('Les deux mots de passe sont différents.'); return; }
            const problem = passwordProblem(password);
            if (problem) { fail(problem); return; }
            try { user = createUser({ username, nom: data.get('nom'), role: 'admin', password }); } catch (e) { fail(e.message); return; }
          } else {
            const result = authenticate(username, password);
            if (!result.ok) {
              const wait = lockRemainingMs();
              fail(result.message);
              form.querySelector('[name="password"]').value = '';
              if (wait) form.querySelector('button[type="submit"]').disabled = true;
              if (wait) setTimeout(() => { form.querySelector('button[type="submit"]').disabled = false; error.hidden = true; }, wait);
              return;
            }
            user = result.user;
          }
          startSession(user);
          root.hidden = true;
          root.innerHTML = '';
          resolve(user);
        });
      });
    }
    
    Object.assign(exports, { showLogin });
  };
  factories['./modules/aide-view.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    const { HELP_CATEGORIES, HELP_TOPICS, FAQ_IDS, SUGGESTED_QUESTIONS } = require("./aide-data.js");
    const { searchHelp, topicById, accessStatus } = require("./aide.js");
    const { currentUser, allowedPages, ROLES } = require("./auth.js");
    const { pageLabel } = require("./navigation.js");
    // Centre d'aide : recherche, catégories, fiches détaillées et accès direct aux fonctionnalités autorisées.
    const view = { query: '', categorie: '', page: '', topicId: '', active: -1 };
    const RECENT_KEY = 'ibk_aide_recent_v1';
    let ctx = { state: null, goTo: () => {} };
    
    const role = () => currentUser()?.role || '';
    const categoryOf = (id) => HELP_CATEGORIES.find((c) => c.id === id);
    
    // Recherches récentes : simple confort, par utilisateur, dans ce navigateur
    function recentKey() { return `${RECENT_KEY}:${currentUser()?.id || 0}`; }
    function readRecent() {
      try { const list = JSON.parse(localStorage.getItem(recentKey()) || '[]'); return Array.isArray(list) ? list : []; } catch (error) { return []; }
    }
    function rememberSearch(text) {
      const q = String(text || '').trim();
      if (q.length < 3) return;
      try { localStorage.setItem(recentKey(), JSON.stringify([q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch (error) { /* non bloquant */ }
    }
    
    function pathHtml(topic) {
      return `<ol class="aide-path" aria-label="Chemin d’accès">${topic.chemin.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
    }
    
    function rolesHtml(topic) {
      return topic.roles.map((r) => `<span class="badge ${r === role() ? 'ok' : 'neutral'}">${escapeHtml(ROLES[r])}</span>`).join(' ');
    }
    
    function resultItem(topic) {
      const cat = categoryOf(topic.categorie);
      const allowed = topic.roles.includes(role());
      return `<li><button type="button" class="aide-result" data-aide-open="${topic.id}">
          <span class="aide-result-icon" aria-hidden="true">${cat.icon}</span>
          <span class="aide-result-body"><strong>${escapeHtml(topic.titre)}</strong>
            <span class="aide-result-desc">${escapeHtml(topic.description)}</span>
            <span class="aide-result-path">${escapeHtml(topic.chemin.join(' › '))}${allowed ? '' : ' · <em>non accessible avec votre rôle</em>'}</span></span>
        </button></li>`;
    }
    
    function unavailableHtml(list) {
      return list.map((u) => {
        const alt = u.alternative ? topicById(u.alternative) : null;
        return `<div class="aide-notice" role="status">
          <strong>« ${escapeHtml(u.label)} » n’existe pas dans cette application.</strong>
          <p>Elle gère la scolarité (années, classes, frais, élèves, inscriptions) et la comptabilité (paiements, dépenses, trésorerie, rapports). Aucun module de ${escapeHtml(u.label.toLowerCase())} n’est disponible, il n’y a donc pas de prérequis à préparer.</p>
          ${alt ? `<button type="button" class="secondary-btn small-btn" data-aide-open="${alt.id}">Voir plutôt : ${escapeHtml(alt.titre)}</button>` : ''}
        </div>`;
      }).join('');
    }
    
    function homeHtml() {
      const faq = FAQ_IDS.map(topicById);
      return `<div class="aide-cats">${HELP_CATEGORIES.map((c) => {
          const count = HELP_TOPICS.filter((t) => t.categorie === c.id).length;
          return `<button type="button" class="aide-cat" data-aide-cat="${c.id}"><span class="aide-cat-icon" aria-hidden="true">${c.icon}</span><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.description)}</span><small>${count} fiche${count > 1 ? 's' : ''}</small></button>`;
        }).join('')}</div>
        <div class="panel"><div class="panel-header"><h3>Questions fréquentes</h3></div><ul class="aide-results">${faq.map(resultItem).join('')}</ul></div>`;
    }
    
    function listHtml(title, topics, backLabel) {
      return `<div class="panel">
          <div class="panel-header"><h3>${escapeHtml(title)}</h3><button type="button" class="secondary-btn small-btn" data-aide-back>← ${escapeHtml(backLabel)}</button></div>
          <ul class="aide-results">${topics.map(resultItem).join('')}</ul></div>`;
    }
    
    function resultsHtml() {
      const { results, unavailable } = searchHelp(view.query, { categorie: view.categorie });
      const head = `<p class="meta aide-count" aria-live="polite">${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${escapeHtml(view.query)} »</p>`;
      if (!results.length) {
        return `${head}${unavailableHtml(unavailable)}
          ${unavailable.length ? '' : `<div class="aide-empty"><strong>Aucune fonctionnalité ne correspond à votre recherche.</strong>
            <p>Essayez un mot plus simple (paiement, inscription, dépense, classe, rapport…) ou parcourez les catégories.</p></div>`}
          <div class="aide-chips">${SUGGESTED_QUESTIONS.slice(4).map((q) => `<button type="button" class="aide-chip" data-aide-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
            <button type="button" class="secondary-btn small-btn" data-aide-q="">Parcourir toutes les catégories</button></div>`;
      }
      return `${head}${unavailableHtml(unavailable)}<div class="panel"><ul class="aide-results">${results.map((r) => resultItem(r.topic)).join('')}</ul></div>`;
    }
    
    function detailHtml(topic) {
      const cat = categoryOf(topic.categorie);
      const status = accessStatus(ctx.state, topic, role(), allowedPages());
      const pageName = pageLabel(topic.page);
      let access;
      if (!topic.page) {
        access = '<p class="meta">Cette fonctionnalité n’a pas de page dédiée : suivez les étapes ci-dessous.</p>';
      } else if (!status.roleOk) {
        access = `<div class="aide-access denied"><strong>Accès non autorisé avec votre rôle (${escapeHtml(ROLES[role()] || '—')}).</strong>
          <p>Cette fonctionnalité est réservée à : ${topic.roles.map((r) => escapeHtml(ROLES[r])).join(', ')}. Demandez à un administrateur de l’effectuer ou de modifier votre rôle.</p></div>`;
      } else {
        access = `<div class="aide-access ${status.missing.length ? 'warning' : 'ready'}">
          ${status.missing.length ? `<strong>Avant de continuer, il manque :</strong><ul>${status.missing.map((p) => `<li>${escapeHtml(p.label)} — ${escapeHtml(p.texte)}${p.aide ? ` <button type="button" class="link-btn" data-aide-open="${p.aide}">Comment faire ?</button>` : ''}</li>`).join('')}</ul>` : '<strong>Tout est prêt : vous pouvez utiliser cette fonctionnalité.</strong>'}
          <button type="button" class="primary-btn" data-aide-go="${topic.id}">${status.missing.length ? `Ouvrir « ${escapeHtml(pageName)} » quand même` : 'Accéder à cette fonctionnalité'}</button></div>`;
      }
      const prereqs = status.prereqs;
      const related = HELP_TOPICS.filter((t) => t.categorie === topic.categorie && t.id !== topic.id);
      return `<article class="panel aide-detail" aria-labelledby="aide-title">
          <div class="aide-detail-head">
            <button type="button" class="secondary-btn small-btn" data-aide-back>← Retour</button>
            <span class="badge info">${cat.icon} ${escapeHtml(cat.label)}</span>
          </div>
          <h3 id="aide-title" tabindex="-1">${escapeHtml(topic.titre)}</h3>
          <p class="aide-lead">${escapeHtml(topic.description)}</p>
          ${access}
          <div class="aide-grid">
            <section><h4>Chemin d’accès</h4>${pathHtml(topic)}</section>
            <section><h4>Droits d’accès</h4><p>${rolesHtml(topic)}</p>${topic.autorisation ? `<p class="meta">${escapeHtml(topic.autorisation)}</p>` : ''}</section>
          </div>
          <section><h4>Étapes</h4><ol class="aide-steps">${topic.etapes.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ol></section>
          <section><h4>Prérequis et dépendances</h4>${prereqs.length ? `<ul class="aide-prereqs">${prereqs.map((p) => `<li class="${p.ok ? 'done' : 'todo'}">
              <span class="aide-check" aria-label="${p.ok ? 'rempli' : 'non rempli'}">${p.ok ? '✓' : '✗'}</span>
              <span><span class="badge ${p.obligatoire ? 'danger' : 'neutral'}">${p.obligatoire ? 'Obligatoire' : 'Recommandé'}</span> ${escapeHtml(p.texte)}
              ${p.aide ? `<button type="button" class="link-btn" data-aide-open="${p.aide}">${escapeHtml(topicById(p.aide).titre)}</button>` : ''}</span></li>`).join('')}</ul>
              <p class="meta">✓ / ✗ : état actuel de vos données (année active).</p>` : '<p class="meta">Aucun prérequis.</p>'}</section>
          <section><h4>Résultat attendu</h4><p>${escapeHtml(topic.resultat)}</p></section>
          ${topic.erreurs.length ? `<section><h4>Erreurs fréquentes et solutions</h4><dl class="aide-errors">${topic.erreurs.map((e) => `<dt>${escapeHtml(e.probleme)}</dt><dd>${escapeHtml(e.solution)}</dd>`).join('')}</dl></section>` : ''}
          ${related.length ? `<section><h4>Dans la même catégorie</h4><div class="aide-chips">${related.map((t) => `<button type="button" class="aide-chip" data-aide-open="${t.id}">${escapeHtml(t.titre)}</button>`).join('')}</div></section>` : ''}
        </article>`;
    }
    
    function renderAideOutput() {
      const out = document.getElementById('aide-output');
      if (!out || !ctx.state) return;
      const topic = view.topicId ? topicById(view.topicId) : null;
      if (topic) out.innerHTML = detailHtml(topic);
      else if (view.query.trim()) out.innerHTML = resultsHtml();
      else if (view.page) out.innerHTML = listHtml(`Aide pour la page « ${pageLabel(view.page)} »`, HELP_TOPICS.filter((t) => t.page === view.page), 'Toutes les catégories');
      else if (view.categorie) out.innerHTML = listHtml(categoryOf(view.categorie).label, HELP_TOPICS.filter((t) => t.categorie === view.categorie), 'Toutes les catégories');
      else out.innerHTML = homeHtml();
    }
    
    function suggestionsHtml() {
      if (!view.query.trim()) {
        const recent = readRecent();
        if (!recent.length) return '';
        return `<li class="aide-suggest-title">Recherches récentes</li>${recent.map((q, i) => `<li role="option" id="aide-opt-${i}" class="${i === view.active ? 'active' : ''}"><button type="button" data-aide-q="${escapeHtml(q)}">🕘 ${escapeHtml(q)}</button></li>`).join('')}`;
      }
      const { results } = searchHelp(view.query, { limit: 6 });
      return results.map((r, i) => `<li role="option" id="aide-opt-${i}" class="${i === view.active ? 'active' : ''}"><button type="button" data-aide-open="${r.topic.id}">${categoryOf(r.topic.categorie).icon} ${escapeHtml(r.topic.titre)}</button></li>`).join('');
    }
    
    function renderSuggestions(open = true) {
      const box = document.querySelector('[data-aide-suggest]');
      const input = document.querySelector('[data-aide="q"]');
      if (!box || !input) return;
      const html = open ? suggestionsHtml() : '';
      box.innerHTML = html;
      box.hidden = !html;
      input.setAttribute('aria-expanded', String(Boolean(html)));
      if (view.active >= 0) input.setAttribute('aria-activedescendant', `aide-opt-${view.active}`);
      else input.removeAttribute('aria-activedescendant');
    }
    
    function renderAide(state) {
      ctx.state = state;
      const section = document.getElementById('aide');
      if (!section) return;
      section.innerHTML = `
        <div class="aide-hero">
          <span class="eyebrow">Aide</span>
          <h2>Centre d’aide</h2>
          <p>Trouvez rapidement une fonctionnalité et découvrez comment l’utiliser.</p>
          <div class="aide-search">
            <span class="aide-search-icon" aria-hidden="true">🔍</span>
            <input type="search" data-aide="q" value="${escapeHtml(view.query)}" placeholder="Ex : Comment enregistrer un paiement ?" aria-label="Rechercher dans l’aide"
              role="combobox" aria-autocomplete="list" aria-controls="aide-suggest" aria-expanded="false" autocomplete="off" />
            <ul class="aide-suggest" id="aide-suggest" role="listbox" data-aide-suggest hidden></ul>
          </div>
          <div class="aide-chips">${SUGGESTED_QUESTIONS.slice(0, 4).map((q) => `<button type="button" class="aide-chip" data-aide-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}</div>
        </div>
        <div id="aide-output"></div>`;
      renderAideOutput();
    }
    
    // État conservé à l'actualisation (recherche, catégorie, fiche ouverte) ; revalidé à la restauration
    function getAideView() {
      return { query: view.query, categorie: view.categorie, page: view.page, topicId: view.topicId };
    }
    
    function setAideView(saved) {
      if (!saved || typeof saved !== 'object') return;
      view.query = typeof saved.query === 'string' ? saved.query.slice(0, 200) : '';
      view.categorie = HELP_CATEGORIES.some((c) => c.id === saved.categorie) ? saved.categorie : '';
      view.page = HELP_TOPICS.some((t) => t.page === saved.page) ? saved.page : '';
      view.topicId = topicById(saved.topicId) ? saved.topicId : '';
      view.active = -1;
    }
    
    // Aide contextuelle : fiches de la page où se trouvait l'utilisateur
    function openAideForPage(pageId) {
      Object.assign(view, { query: '', categorie: '', topicId: '', active: -1, page: HELP_TOPICS.some((t) => t.page === pageId) ? pageId : '' });
      renderAide(ctx.state);
    }
    
    function openTopic(id) {
      Object.assign(view, { topicId: id, active: -1 });
      renderSuggestions(false);
      renderAideOutput();
      document.getElementById('aide-output')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('aide-title')?.focus?.();
    }
    
    function setQuery(text) {
      Object.assign(view, { query: text, topicId: '', page: '', active: -1 });
      const input = document.querySelector('[data-aide="q"]');
      if (input && input.value !== text) input.value = text;
      renderAideOutput();
    }
    
    // Ouvre la page de la fonctionnalité, en revérifiant les droits (jamais d'accès à une page non autorisée)
    function goToTopic(id) {
      const topic = topicById(id);
      if (!topic || !topic.page) return;
      const status = accessStatus(ctx.state, topic, role(), allowedPages());
      if (!status.navigable) { renderAideOutput(); return; }
      ctx.goTo(topic.page);
      if (topic.clic) document.querySelector(topic.clic)?.click();
      const target = topic.focus ? document.querySelector(topic.focus) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('aide-highlight');
      setTimeout(() => target.classList.remove('aide-highlight'), 2600);
      const field = target.matches('input, select, textarea, button') ? target : target.querySelector('input:not([type=hidden]), select, textarea');
      field?.focus({ preventScroll: true });
    }
    
    function bindAide(state, { goTo }) {
      ctx = { state, goTo };
      document.addEventListener('input', (event) => {
        if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-aide="q"]')) return;
        setQuery(event.target.value);
        renderSuggestions(true);
      });
      document.addEventListener('focusin', (event) => {
        if (event.target instanceof HTMLElement && event.target.matches('[data-aide="q"]')) renderSuggestions(true);
      });
      document.addEventListener('keydown', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLElement) || !input.matches('[data-aide="q"]')) return;
        const options = [...document.querySelectorAll('[data-aide-suggest] [role="option"] button')];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!options.length) return;
          view.active = (view.active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          renderSuggestions(true);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          rememberSearch(view.query);
          if (view.active >= 0 && options[view.active]) { options[view.active].click(); return; }
          const first = searchHelp(view.query).results[0];
          renderSuggestions(false);
          if (first && view.query.trim()) openTopic(first.topic.id);
        } else if (event.key === 'Escape') {
          view.active = -1;
          renderSuggestions(false);
        }
      });
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const open = event.target.closest('[data-aide-open]');
        if (open) { rememberSearch(view.query); openTopic(open.dataset.aideOpen); return; }
        const go = event.target.closest('[data-aide-go]');
        if (go) { goToTopic(go.dataset.aideGo); return; }
        const chip = event.target.closest('[data-aide-q]');
        if (chip) { setQuery(chip.dataset.aideQ); rememberSearch(chip.dataset.aideQ); renderSuggestions(false); document.querySelector('[data-aide="q"]')?.focus(); renderSuggestions(false); return; }
        const cat = event.target.closest('[data-aide-cat]');
        if (cat) { Object.assign(view, { categorie: cat.dataset.aideCat, page: '', topicId: '', query: '' }); renderAide(ctx.state); return; }
        if (event.target.closest('[data-aide-back]')) {
          if (view.topicId) view.topicId = '';
          else Object.assign(view, { categorie: '', page: '' });
          renderAideOutput();
          return;
        }
        if (!event.target.closest('.aide-search')) renderSuggestions(false);
      });
    }
    
    Object.assign(exports, { renderAideOutput, renderAide, getAideView, setAideView, openAideForPage, bindAide });
  };
  factories['./modules/aide-data.js'] = (require, exports) => {
    const { pagePath } = require("./navigation.js");
    // Documentation centralisée du centre d'aide. Chaque fiche décrit une fonctionnalité RÉELLE de l'application :
    // la page de destination (`page`) doit être un identifiant de section existant, `focus` un élément présent sur
    // cette page, `roles` les rôles qui peuvent l'utiliser. tests/aide.mjs vérifie cette cohérence.
    //
    // Prérequis : `obligatoire: true` uniquement si l'opération est réellement bloquée sans eux ; sinon recommandation.
    // `check` désigne un contrôle de CHECKS, évalué sur les données actuelles (année active).
    
    const activeYear = (s) => s.annees.find((a) => a.id === s.anneeActiveId) || null;
    const inActiveYear = (list, s) => list.filter((x) => x.anneeId === s.anneeActiveId);
    
    const CHECKS = {
      annee: { label: 'Au moins une année scolaire existe', test: (s) => s.annees.length > 0 },
      anneeActive: { label: 'Une année scolaire active est définie', test: (s) => Boolean(activeYear(s)) },
      anneeOuverte: { label: 'L’année active n’est pas clôturée', test: (s) => Boolean(activeYear(s)) && activeYear(s).statut !== 'cloturee' },
      classe: { label: 'Au moins une classe pour l’année active', test: (s) => inActiveYear(s.classes, s).length > 0 },
      tarif: { label: 'Des frais configurés pour au moins une classe de l’année active', test: (s) => inActiveYear(s.tarifs, s).length > 0 },
      eleve: { label: 'Au moins un élève enregistré', test: (s) => s.eleves.length > 0 },
      inscription: { label: 'Au moins une inscription pour l’année active', test: (s) => inActiveYear(s.inscriptions, s).length > 0 },
      echeances: { label: 'Au moins une inscription de l’année active avec un échéancier (tranches ou mensualités)', test: (s) => inActiveYear(s.inscriptions, s).some((i) => (i.echeances || []).length > 0) },
      payable: { label: 'Au moins un élève inscrit dans une classe dont les frais sont configurés (année active)', test: (s) => inActiveYear(s.inscriptions, s).some((i) => (i.echeances || []).length > 0 || s.tarifs.some((t) => t.classeId === i.classeId && t.anneeId === i.anneeId)) },
      mensuel: { label: 'Un montant mensuel est défini dans au moins un tarif de l’année active', test: (s) => inActiveYear(s.tarifs, s).some((t) => Number(t.montantMensuel) > 0) },
      paiement: { label: 'Au moins un paiement valide enregistré', test: (s) => s.paiements.some((p) => !p.annule) },
      depense: { label: 'Au moins une dépense enregistrée', test: (s) => (s.depenses || []).some((d) => !d.annule) },
      caissier: { label: 'Le nom du caissier est renseigné dans Configuration', test: (s) => Boolean(String(s.config.caissier || '').trim()) },
      soldeOuverture: { label: 'Le solde d’ouverture de caisse de l’année active est renseigné', test: (s) => Number(activeYear(s)?.soldeInitial || 0) > 0 }
    };
    
    const HELP_CATEGORIES = [
      { id: 'pilotage', label: 'Tableau de bord et analyses', icon: '📊', description: 'Indicateurs, graphiques et recouvrement.' },
      { id: 'annees', label: 'Années scolaires', icon: '🗓️', description: 'Créer, activer, clôturer une année.' },
      { id: 'classes', label: 'Classes et frais de scolarité', icon: '🏫', description: 'Classes, tranches et mensualités.' },
      { id: 'eleves', label: 'Élèves et inscriptions', icon: '🎓', description: 'Fiches élèves, inscriptions, réinscriptions.' },
      { id: 'paiements', label: 'Paiements et reçus', icon: '💳', description: 'Encaisser, imprimer, annuler.' },
      { id: 'depenses', label: 'Dépenses et trésorerie', icon: '🧮', description: 'Dépenses, reçus de dépense, solde de caisse.' },
      { id: 'rapports', label: 'Rapports et exports', icon: '🧾', description: 'Rapports PDF / Excel, retards, rappels.' },
      { id: 'etablissement', label: 'Établissement et sauvegardes', icon: '⚙️', description: 'En-tête, caissier, sauvegardes, réinitialisation.' },
      { id: 'securite', label: 'Utilisateurs et sécurité', icon: '🔐', description: 'Connexion, rôles, mots de passe.' }
    ];
    
    const ALL = ['admin', 'comptable', 'lecture'];
    const WRITE = ['admin', 'comptable'];
    const ADMIN = ['admin'];
    
    const HELP_TOPICS = [
      // ── Tableau de bord et analyses ─────────────────────────────────────────
      {
        id: 'tableau-de-bord', categorie: 'pilotage', titre: 'Consulter le tableau de bord',
        description: 'Vue d’ensemble de l’établissement : montant attendu, encaissé, reste à percevoir, taux de recouvrement, recettes, dépenses, solde de caisse et graphiques.',
        motsCles: ['tableau de bord', 'accueil', 'indicateur', 'statistique', 'graphique', 'recouvrement', 'synthese', 'kpi', 'situation'],
        chemin: ['Tableau de bord'], page: 'dashboard', focus: '#dashboard .dashboard-filter-panel', roles: ALL,
        etapes: ['Cliquez sur « Tableau de bord » dans le menu.', 'Choisissez l’année scolaire, le niveau (catégorie) ou tapez le nom d’une classe pour filtrer.', 'Lisez les indicateurs puis les graphiques (recettes journalières et mensuelles, statut des élèves, recouvrement par classe, plus gros retards).'],
        prerequis: [{ check: 'inscription', obligatoire: false, texte: 'Sans inscription ni paiement, les indicateurs restent à zéro.', aide: 'inscrire-eleve' }],
        resultat: 'Les chiffres et graphiques reflètent les données enregistrées pour le filtre choisi.',
        erreurs: [{ probleme: 'Tous les montants sont à 0.', solution: 'Vérifiez le filtre « Année scolaire » : choisissez l’année qui contient vos inscriptions, ou « Toutes ».' }]
      },
      {
        id: 'analyse-financiere', categorie: 'pilotage', titre: 'Analyser les finances par formation, classe ou élève',
        description: 'Compare l’attendu, l’encaissé et le reste à percevoir par formation (catégorie), classe, élève ou année scolaire.',
        motsCles: ['analyse', 'comparer', 'formation', 'categorie', 'repartition', 'recettes par classe', 'performance'],
        chemin: ['Analyse financière'], page: 'analyse', focus: '#analyse .report-tabs', roles: ALL,
        etapes: ['Ouvrez « Tableau de bord › Analyse financière ».', 'Choisissez l’axe d’analyse : Formation, Classe, Élève ou Année scolaire.', 'Filtrez par année et catégorie, ou tapez dans « Recherche » pour réduire les lignes.'],
        prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Les encaissements n’apparaissent qu’après au moins un paiement.', aide: 'enregistrer-paiement' }],
        resultat: 'Un tableau détaillé et des graphiques (attendu / encaissé, répartition, évolution sur 12 mois).',
        erreurs: [{ probleme: 'Le filtre d’année est grisé.', solution: 'C’est normal avec l’axe « Année scolaire » : toutes les années sont comparées.' }]
      },
    
      // ── Années scolaires ────────────────────────────────────────────────────
      {
        id: 'creer-annee', categorie: 'annees', titre: 'Créer une année scolaire',
        description: 'Ajoute une année (ex. 2026-2027) avec ses dates et son solde d’ouverture de caisse. C’est le point de départ : classes, frais, inscriptions, paiements et dépenses y sont rattachés.',
        motsCles: ['annee scolaire', 'nouvelle annee', 'rentree', 'parametre', 'configurer annee', 'solde ouverture'],
        chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees form[data-form="annee"]', roles: WRITE,
        autorisation: 'Créer : administrateur ou comptable. Modifier une année existante : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Scolarité › Années scolaires ».', 'Saisissez le libellé (ex. 2026-2027), la date de rentrée et la date de fin.', 'Indiquez le solde d’ouverture de caisse (0 si aucun), puis les frais d’inscription et de réinscription de l’année.', 'Choisissez le statut (Préparation, Ouverte ou Clôturée) puis cliquez sur « Ajouter ».'],
        prerequis: [],
        resultat: 'L’année apparaît dans la liste. Si elle est « Ouverte », toute autre année ouverte est clôturée et elle devient l’année active.',
        erreurs: [
          { probleme: '« Année refusée : libellé vide ou déjà existant ».', solution: 'Chaque libellé doit être unique : vérifiez qu’elle n’existe pas déjà dans la liste.' },
          { probleme: '« La date de fin doit suivre la date de rentrée ».', solution: 'Corrigez les dates : la fin doit être postérieure à la rentrée.' }
        ]
      },
      {
        id: 'annee-active', categorie: 'annees', titre: 'Changer, ouvrir ou clôturer l’année active',
        description: 'L’année active est celle proposée par défaut dans les formulaires. Une année clôturée n’accepte plus de paiement ni de dépense.',
        motsCles: ['annee active', 'changer annee', 'cloturer', 'cloture', 'fermer annee', 'ouvrir annee', 'passer a l annee suivante'],
        chemin: ['Années', 'Liste des années'], page: 'annees', focus: '#annees .cards-grid', roles: WRITE,
        autorisation: '« Définir active » et « Valider (ouvrir) » : administrateur ou comptable. « Clôturer » et « Supprimer » : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Scolarité › Années scolaires » et repérez la carte de l’année.', 'Cliquez sur « Définir active » pour travailler sur cette année.', 'Cliquez sur « Valider (ouvrir) » pour l’ouvrir, ou « Clôturer » en fin d’année.'],
        prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année doit exister.', aide: 'creer-annee' }],
        resultat: 'Les formulaires (classes, inscriptions, paiements, dépenses) proposent l’année active par défaut.',
        erreurs: [
          { probleme: '« L’année … est clôturée : aucun paiement ne peut y être enregistré ».', solution: 'Un administrateur peut rouvrir l’année avec « Valider (ouvrir) » si un encaissement tardif doit être saisi.' },
          { probleme: 'Suppression refusée.', solution: 'Une année qui contient des classes ou des inscriptions ne peut pas être supprimée : l’historique financier est protégé.' }
        ]
      },
    
      // ── Classes et frais ────────────────────────────────────────────────────
      {
        id: 'creer-classe', categorie: 'classes', titre: 'Créer une classe',
        description: 'Ajoute une classe (ex. 6e A) dans une catégorie (Primaire, Collège, Lycée) pour une année scolaire. Après l’ajout, l’application ouvre directement la configuration des frais de cette classe.',
        motsCles: ['classe', 'nouvelle classe', 'ajouter classe', 'creer classe', 'niveau', 'salle', 'section', 'capacite', 'effectif'],
        chemin: ['Classes', 'Classe'], page: 'classes', focus: '#classes form[data-form="classe"]', roles: WRITE,
        autorisation: 'Créer / modifier : administrateur ou comptable. Supprimer : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Scolarité › Classes ».', 'Saisissez le nom de la classe et choisissez la catégorie.', 'Choisissez l’année scolaire et la capacité.', 'Cliquez sur « Ajouter » : vous êtes redirigé vers « Scolarité › Tarifs et frais » avec la classe déjà sélectionnée.'],
        prerequis: [{ check: 'annee', obligatoire: true, texte: 'Une année scolaire doit exister.', aide: 'creer-annee' }],
        resultat: 'La classe apparaît dans la liste et le formulaire des frais est prêt à être complété.',
        erreurs: [
          { probleme: '« Classe refusée : nom vide ou déjà utilisé pour cette année ».', solution: 'Deux classes de la même année ne peuvent pas porter le même nom.' },
          { probleme: 'Les champs « Salle » et « Niveau » n’existent plus.', solution: 'C’est voulu : seuls le nom, la catégorie, l’année et la capacité sont utilisés.' }
        ]
      },
      {
        id: 'configurer-frais', categorie: 'classes', titre: 'Configurer les frais de scolarité (tranches ou mensualités)',
        description: 'Définit pour une classe le montant annuel réparti en 3 tranches (avec dates limites) et le montant du paiement mensuel. La famille choisit ensuite, au premier paiement, de payer par tranches ou par mois.',
        motsCles: ['tarif', 'frais', 'scolarite', 'tranche', 'mensualite', 'mensuel', 'montant mensuel', 'echeance', 'echeancier', 'montant annuel', 'prix', 'cout'],
        chemin: ['Tarifs', 'Frais de scolarité d’une classe'], page: 'tarifs', focus: '#tarifs form[data-form="tarif"]', roles: WRITE,
        autorisation: 'Créer : administrateur ou comptable. Modifier des frais existants ou changer les dates proposées : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Scolarité › Tarifs et frais » (ou créez une classe : vous y êtes redirigé).', 'Choisissez l’année, la catégorie puis la classe.', 'Saisissez le montant annuel : les 3 tranches, leurs dates et le montant mensuel sont proposés automatiquement (tous modifiables).', 'Vérifiez le « Montant du paiement mensuel », le nombre de mensualités et la date de la 1ère mensualité (0 = paiement mensuel non proposé).', 'Contrôlez le récapitulatif sous le formulaire, puis cliquez sur « Ajouter ». Si le total mensuel s’écarte du montant annuel (au-delà de l’arrondi), une confirmation est demandée.'],
        prerequis: [{ check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' }],
        resultat: 'Les élèves de la classe disposent d’un échéancier provisoire par tranches ; la modalité définitive (tranches ou mensuel) est fixée au premier paiement. Une modification ultérieure met à jour les échéances non encore payées des élèves déjà inscrits.',
        erreurs: [
          { probleme: '« La somme des 3 tranches doit être égale au montant annuel ».', solution: 'Corrigez une tranche, ou videz les 3 tranches pour un calcul automatique.' },
          { probleme: '« Un tarif existe déjà pour cette classe ».', solution: 'Utilisez « Modifier » sur la carte du tarif dans « Tarifs configurés ».' },
          { probleme: '« Montant mensuel différent du montant annuel ».', solution: 'Confirmez si les frais mensuels sont volontairement majorés ; sinon corrigez le montant mensuel ou le nombre de mensualités.' }
        ]
      },
      {
        id: 'dupliquer-frais', categorie: 'classes', titre: 'Reprendre les frais d’une année sur l’année active',
        description: 'Copie un tarif existant vers l’année active, pour éviter de tout ressaisir à la rentrée.',
        motsCles: ['dupliquer', 'copier tarif', 'reprendre frais', 'nouvelle annee frais'],
        chemin: ['Tarifs', 'Tarifs configurés', 'Dupliquer'], page: 'tarifs', focus: '#tarifs .cards-grid', roles: WRITE,
        etapes: ['Définissez d’abord la nouvelle année comme active (« Scolarité › Années scolaires » › « Définir active »).', 'Ouvrez « Scolarité › Tarifs et frais » et cliquez sur « Dupliquer » sur la carte du tarif à reprendre.'],
        prerequis: [{ check: 'tarif', obligatoire: false, texte: 'Il faut au moins un tarif existant à dupliquer.', aide: 'configurer-frais' }],
        resultat: 'Une copie du tarif est rattachée à l’année active.',
        erreurs: [{ probleme: 'La copie pointe vers une classe de l’ancienne année.', solution: 'Le tarif reprend la classe d’origine : créez la classe pour la nouvelle année puis configurez ses frais avec « Scolarité › Tarifs et frais ».' }]
      },
    
      // ── Élèves et inscriptions ──────────────────────────────────────────────
      {
        id: 'ajouter-eleve', categorie: 'eleves', titre: 'Ajouter un élève',
        description: 'Crée la fiche d’un élève. Le matricule IBK-AAAA-NNNN est généré automatiquement si vous le laissez vide. Après l’enregistrement, l’application passe à l’inscription.',
        motsCles: ['eleve', 'ajouter eleve', 'nouvel eleve', 'fiche eleve', 'matricule', 'etudiant', 'enfant', 'dossier'],
        chemin: ['Élèves', 'Fiche élève'], page: 'eleves', focus: '#eleves form[data-form="eleve"]', roles: WRITE,
        autorisation: 'Créer / modifier : administrateur ou comptable. Supprimer : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Élèves › Dossiers élèves » (ou cliquez sur « + Nouvel élève » en haut de page).', 'Renseignez au minimum le prénom et le nom.', 'Choisissez la classe souhaitée (facultatif mais recommandé : elle sera préremplie à l’inscription).', 'Cliquez sur « Ajouter et inscrire ».'],
        prerequis: [{ check: 'classe', obligatoire: false, texte: 'Une classe dans l’année active permet de préremplir l’inscription.', aide: 'creer-classe' }],
        resultat: 'La fiche est créée et vous arrivez sur « Élèves › Inscriptions » avec l’élève déjà sélectionné.',
        erreurs: [
          { probleme: '« Classe introuvable pour l’année active ».', solution: 'Choisissez la classe dans la liste proposée pendant la saisie, ou créez-la d’abord.' },
          { probleme: '« Fiche refusée : … matricule invalide ou déjà utilisé ».', solution: 'Laissez le matricule vide pour qu’il soit généré, ou utilisez un matricule non attribué.' }
        ]
      },
      {
        id: 'inscrire-eleve', categorie: 'eleves', titre: 'Inscrire un élève dans une classe',
        description: 'Rattache un élève à une classe pour une année scolaire et génère son échéancier à partir des frais de la classe. Un élève ne peut être inscrit qu’une fois par année.',
        motsCles: ['inscription', 'inscrire', 'admission', 'enregistrer eleve', 'affecter classe', 'mettre dans une classe'],
        chemin: ['Inscriptions', 'Inscription'], page: 'inscriptions', focus: '#inscriptions form[data-form="inscription"]', roles: WRITE,
        autorisation: 'Inscrire : administrateur ou comptable. Supprimer une inscription : autorisation d’un administrateur (impossible si des paiements existent).',
        etapes: ['Ouvrez « Élèves › Inscriptions » (vous y arrivez automatiquement après l’ajout d’un élève).', 'Choisissez l’année, la catégorie puis la classe.', 'Tapez le nom ou le matricule de l’élève et sélectionnez-le.', 'Laissez le type sur « Automatique » : réinscription si l’élève a déjà été inscrit une autre année, sinon nouvelle inscription.', 'Cliquez sur « Ajouter l’inscription » : l’application ouvre le formulaire de paiement prérempli.'],
        prerequis: [
          { check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' },
          { check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' },
          { check: 'tarif', obligatoire: false, texte: 'Avec des frais déjà configurés, l’application enchaîne directement sur le paiement. Sinon, configurez-les ensuite : l’échéancier des élèves inscrits est alors créé automatiquement.', aide: 'configurer-frais' }
        ],
        resultat: 'L’inscription apparaît dans l’historique avec un échéancier provisoire par tranches, et le formulaire de paiement s’ouvre avec l’élève sélectionné. La modalité (tranches ou mensuel) se choisit au premier paiement.',
        erreurs: [
          { probleme: '« Inscription refusée : cet élève est déjà inscrit pour cette année ».', solution: 'Un élève n’a qu’une inscription par année ; consultez sa fiche dans « Élèves › Dossiers élèves ».' },
          { probleme: '« Aucun frais configuré pour cette classe ».', solution: 'Vous êtes redirigé vers « Scolarité › Tarifs et frais » : configurez les frais de la classe.' }
        ]
      },
      {
        id: 'reinscrire-valider', categorie: 'eleves', titre: 'Réinscrire ou valider une inscription',
        description: '« Réinscrire » crée une inscription pour l’année active à partir d’une inscription précédente ; « Valider » marque une inscription comme validée (date et auteur conservés).',
        motsCles: ['reinscription', 'reinscrire', 'valider inscription', 'annee suivante', 'passage'],
        chemin: ['Inscriptions', 'Historique d’inscriptions'], page: 'inscriptions', focus: '#inscriptions table', roles: WRITE,
        etapes: ['Définissez la nouvelle année comme active (« Scolarité › Années scolaires » › « Définir active »).', 'Ouvrez « Élèves › Inscriptions » et repérez l’élève dans l’historique.', 'Cliquez sur « Réinscrire » ou sur « Valider ».'],
        prerequis: [{ check: 'inscription', obligatoire: true, texte: 'Une inscription précédente doit exister.', aide: 'inscrire-eleve' }],
        resultat: 'La réinscription reprend la même classe ; les échéances sont générées si des frais existent pour cette classe et cette année.',
        erreurs: [{ probleme: '« Réinscription impossible : l’élève est déjà inscrit pour l’année active ».', solution: 'Vérifiez l’année active ou l’inscription existante.' }]
      },
      {
        id: 'fiche-eleve', categorie: 'eleves', titre: 'Consulter la situation financière d’un élève',
        description: 'Affiche le dossier complet d’un élève : informations, échéancier par année (dû, payé, reste, statut, progression) et historique des paiements, y compris annulés.',
        motsCles: ['situation eleve', 'dossier', 'historique eleve', 'reste a payer', 'solde eleve', 'combien doit', 'fiche', 'profil'],
        chemin: ['Élèves', 'Répertoire des élèves', 'Consulter'], page: 'eleves', focus: '#eleves [data-student-search]', roles: WRITE,
        etapes: ['Ouvrez « Élèves › Dossiers élèves ».', 'Tapez le nom, le matricule ou le téléphone dans « Recherche avancée ».', 'Cliquez sur « Consulter » sur la ligne de l’élève.'],
        prerequis: [{ check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' }],
        resultat: 'Une fenêtre présente l’échéancier de chaque année avec les barres de progression et l’historique complet.',
        erreurs: [{ probleme: 'Le rôle « Consultation » n’a pas accès à la page Élèves.', solution: 'Utilisez « Rapports » › « Situation individuelle », accessible à tous les rôles.' }]
      },
      {
        id: 'exporter-eleves', categorie: 'eleves', titre: 'Exporter la liste des élèves',
        description: 'Télécharge la liste des élèves au format CSV (ouvrable dans Excel).',
        motsCles: ['liste eleves', 'exporter eleves', 'csv', 'excel eleves', 'telecharger liste'],
        chemin: ['Élèves', 'Répertoire des élèves', 'Exporter la liste'], page: 'eleves', focus: '#eleves [data-action="report:students-csv"]', roles: WRITE,
        etapes: ['Ouvrez « Élèves › Dossiers élèves ».', 'Cliquez sur « Exporter la liste » dans le répertoire.'],
        prerequis: [{ check: 'eleve', obligatoire: false, texte: 'Sans élève, le fichier ne contient que les en-têtes.', aide: 'ajouter-eleve' }],
        resultat: 'Le fichier liste-eleves.csv est téléchargé.',
        erreurs: []
      },
    
      // ── Paiements ───────────────────────────────────────────────────────────
      {
        id: 'enregistrer-paiement', categorie: 'paiements', titre: 'Enregistrer un paiement de scolarité',
        description: 'Encaisse un montant pour un élève inscrit. Au premier paiement, vous choisissez la modalité de règlement (mensuelle ou par tranches) ; le montant est ensuite réparti automatiquement sur la première échéance impayée, puis sur les suivantes. Le reçu est numéroté et imprimable.',
        motsCles: ['paiement', 'payer', 'encaisser', 'encaissement', 'versement', 'regler', 'reglement', 'caisse', 'acompte', 'frais de scolarite', 'scolarite'],
        chemin: ['Paiements', 'Enregistrer un paiement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
        etapes: ['Ouvrez « Paiements › Encaissements » (vous y arrivez automatiquement après une inscription).', 'Vérifiez l’année scolaire puis tapez le nom ou le matricule de l’élève et choisissez-le dans la liste.', 'Choisissez la modalité de règlement : « Paiement par tranches » ou « Paiement mensuel » (obligatoire ; elle est reprise automatiquement aux paiements suivants).', 'Contrôlez la fiche affichée : classe, catégorie, échéancier adapté à la modalité, paiements précédents.', 'Saisissez le montant payé (« Solder tout » remplit le reste de l’année), le mode, la date et, si besoin, la référence et la description.', 'Lisez l’aperçu (reste après paiement, statut, répartition) puis cliquez sur « Enregistrer le paiement ».'],
        prerequis: [
          { check: 'payable', obligatoire: true, texte: 'L’élève doit être inscrit dans une classe dont les frais (tarif) sont configurés.', aide: 'inscrire-eleve' },
          { check: 'anneeOuverte', obligatoire: true, texte: 'L’année du paiement ne doit pas être clôturée.', aide: 'annee-active' },
          { check: 'caissier', obligatoire: false, texte: 'Sans nom de caissier configuré, le reçu porte le nom de l’utilisateur connecté.', aide: 'configurer-etablissement' }
        ],
        resultat: 'Le paiement apparaît dans le journal avec son numéro REC-AAAA-NNNNNN, les soldes et statuts sont mis à jour, et le reçu s’imprime si la case est cochée.',
        erreurs: [
          { probleme: 'Le bouton « Enregistrer le paiement » reste grisé.', solution: 'Choisissez d’abord la modalité de règlement (tranches ou mensuel).' },
          { probleme: '« Le montant dépasse le solde de l’année scolaire ».', solution: 'Un excédent n’est jamais reporté sur une autre année : encaissez au maximum le reste affiché.' },
          { probleme: 'L’élève n’apparaît pas dans la recherche.', solution: 'Vérifiez l’année sélectionnée dans le formulaire et que l’élève est bien inscrit pour cette année.' },
          { probleme: '« Un paiement identique vient d’être enregistré ».', solution: 'Protection contre les doubles saisies : vérifiez le journal avant de confirmer.' },
          { probleme: '« La date de paiement ne peut pas être dans le futur ».', solution: 'Saisissez la date réelle de l’encaissement.' }
        ]
      },
      {
        id: 'repartition-tranches', categorie: 'paiements', titre: 'Comprendre la répartition automatique sur les tranches',
        description: 'Chaque paiement remplit d’abord la première tranche ou le premier mois non soldé ; l’excédent passe à l’échéance suivante, et ainsi de suite, dans la même année scolaire uniquement. En mensuel, chaque mois vaut le montant mensuel du tarif.',
        motsCles: ['repartition', 'imputation', 'excedent', 'surplus', 'tranche suivante', 'avance', 'payer plusieurs tranches', 'paie plus', 'mensualite', 'allocation'],
        chemin: ['Paiements', 'Enregistrer un paiement', 'Répartition automatique du paiement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
        etapes: ['Choisissez l’élève dans le formulaire de paiement.', 'Saisissez le montant : le tableau « Répartition automatique du paiement » indique le montant imputé sur chaque tranche et le reste après paiement.', 'Après l’enregistrement, la même répartition figure sur le reçu et dans la colonne « Imputé sur » du journal.'],
        prerequis: [{ check: 'echeances', obligatoire: true, texte: 'L’élève doit avoir un échéancier.', aide: 'inscrire-eleve' }],
        resultat: 'Dans l’échéancier, la tranche « en cours » est la première non soldée ; les montants déjà payés sur les tranches suivantes apparaissent comme « payés d’avance ».',
        erreurs: [{ probleme: 'Je veux payer la 3e tranche avant la 2e.', solution: 'Ce n’est pas possible : l’ordre des tranches est toujours respecté pour garantir une comptabilité cohérente.' }]
      },
      {
        id: 'imprimer-recu', categorie: 'paiements', titre: 'Imprimer ou réimprimer un reçu de paiement',
        description: 'Le reçu (2 exemplaires par page A4) présente le numéro, la date, l’élève (matricule et classe en gras), le montant en chiffres et en lettres, le moyen et la modalité de paiement, la période concernée, une barre de progression (mois ou tranches réglés, en cours, restants) et le total, le cumul payé et le reste à payer. Seuls les paiements validés sont comptés.',
        motsCles: ['recu', 'reçu', 'imprimer recu', 'reimprimer', 'quittance', 'justificatif paiement'],
        chemin: ['Paiements', 'Journal des paiements', 'Reçu'], page: 'paiements', focus: '#paiements [data-payment-search]', roles: WRITE,
        etapes: ['Ouvrez « Paiements › Encaissements ».', 'Retrouvez le paiement avec la recherche du journal (élève, n° de reçu, référence…).', 'Cliquez sur « Reçu » : un aperçu s’affiche à l’écran.', 'Cliquez sur « Imprimer (2 exemplaires) », puis imprimez ou enregistrez en PDF.'],
        prerequis: [{ check: 'paiement', obligatoire: true, texte: 'Le paiement doit exister et ne pas être annulé.', aide: 'enregistrer-paiement' }],
        resultat: 'Un reçu d’une page A4 (deux exemplaires à découper). Si un paiement antérieur est annulé, la réimpression recalcule la progression sans lui.',
        erreurs: [{ probleme: 'Pas de bouton « Reçu ».', solution: 'Un paiement annulé n’a plus de reçu imprimable ; son historique reste consultable avec « Consulter ».' }]
      },
      {
        id: 'annuler-paiement', categorie: 'paiements', titre: 'Annuler un paiement',
        description: 'Annule un paiement erroné. La ligne, son numéro de reçu et sa répartition restent dans l’historique avec le motif ; les tranches concernées sont recalculées.',
        motsCles: ['annuler paiement', 'supprimer paiement', 'erreur paiement', 'rembourser', 'corriger paiement', 'annulation'],
        chemin: ['Paiements', 'Journal des paiements', 'Annuler'], page: 'paiements', focus: '#paiements [data-payment-search]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur (le bouton n’est pas affiché aux autres rôles).',
        etapes: ['Ouvrez « Paiements › Encaissements » et retrouvez le paiement dans le journal.', 'Cliquez sur « Annuler ».', 'Saisissez le motif (obligatoire) puis confirmez.', 'Si besoin, enregistrez ensuite le paiement correct.'],
        prerequis: [{ check: 'paiement', obligatoire: true, texte: 'Le paiement doit exister.', aide: 'enregistrer-paiement' }],
        resultat: 'Le paiement est marqué « Annulé », il n’entre plus dans les totaux, et le solde de l’élève est recalculé.',
        erreurs: [{ probleme: '« Annulation impossible : motif manquant ou paiement déjà annulé ».', solution: 'Saisissez un motif ; un paiement ne peut être annulé qu’une fois.' }]
      },
      {
        id: 'exporter-paiements', categorie: 'paiements', titre: 'Exporter la liste des paiements',
        description: 'Télécharge au format CSV les paiements filtrés dans le journal (recherche, dates, état).',
        motsCles: ['exporter paiements', 'liste paiements', 'csv paiements', 'journal des paiements'],
        chemin: ['Paiements', 'Exporter la liste des paiements CSV'], page: 'paiements', focus: '#paiements [data-action="paiement:export-csv"]', roles: WRITE,
        etapes: ['Ouvrez « Paiements › Encaissements ».', 'Filtrez le journal si besoin (recherche, Du, Au, État).', 'Cliquez sur « Exporter la liste des paiements CSV ».'],
        prerequis: [],
        resultat: 'Le fichier liste-paiements.csv est téléchargé avec les filtres appliqués.',
        erreurs: []
      },
    
      // ── Dépenses et trésorerie ──────────────────────────────────────────────
      {
        id: 'enregistrer-depense', categorie: 'depenses', titre: 'Enregistrer une dépense',
        description: 'Saisit une sortie de caisse (catégorie, description, montant, date, bénéficiaire, demandeur, référence, pièce justificative) et génère un reçu de dépense numéroté DEP-AAAA-NNNNNN.',
        motsCles: ['depense', 'sortie', 'achat', 'decaissement', 'charge', 'fournisseur', 'facture', 'salaire', 'payer un fournisseur'],
        chemin: ['Dépenses', 'Enregistrer une dépense'], page: 'depenses', focus: '#depenses form[data-form="depense"]', roles: WRITE,
        etapes: ['Ouvrez « Dépenses ».', 'Choisissez l’année et la date, puis la catégorie (ou saisissez-en une nouvelle).', 'Saisissez le montant, la description et la personne qui a demandé la dépense ; complétez le bénéficiaire, la référence et la pièce justificative si besoin (300 Ko max.).', 'Cliquez sur « Enregistrer la dépense » : le reçu s’imprime si la case est cochée.'],
        prerequis: [{ check: 'anneeOuverte', obligatoire: true, texte: 'L’année de la dépense ne doit pas être clôturée.', aide: 'annee-active' }],
        resultat: 'La dépense apparaît dans l’historique et le solde disponible diminue d’autant.',
        erreurs: [
          { probleme: '« Indiquez qui a demandé la dépense ».', solution: 'Le champ « Demandé par » est obligatoire pour la traçabilité.' },
          { probleme: '« Pièce trop lourde ».', solution: 'Réduisez l’image (photo plus petite) ou conservez la pièce papier et notez sa référence.' }
        ]
      },
      {
        id: 'corriger-depense', categorie: 'depenses', titre: 'Corriger ou annuler une dépense',
        description: 'Une correction conserve l’ancienne valeur dans l’historique de la dépense ; une annulation garde la ligne et son numéro, mais l’exclut des totaux.',
        motsCles: ['corriger depense', 'modifier depense', 'annuler depense', 'erreur depense', 'supprimer depense'],
        chemin: ['Dépenses', 'Historique des dépenses', 'Corriger / Annuler'], page: 'depenses', focus: '#depenses [data-df="yearId"]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur.',
        etapes: ['Ouvrez « Dépenses » et retrouvez la ligne (filtres année, période, catégorie, demandeur).', 'Cliquez sur « Corriger » : le formulaire se remplit, modifiez puis « Enregistrer la correction ».', 'Ou cliquez sur « Annuler » et saisissez le motif.'],
        prerequis: [{ check: 'depense', obligatoire: true, texte: 'La dépense doit exister.', aide: 'enregistrer-depense' }],
        resultat: 'Le solde de caisse est recalculé ; l’historique garde la trace de la correction ou de l’annulation.',
        erreurs: []
      },
      {
        id: 'solde-caisse', categorie: 'depenses', titre: 'Connaître le solde disponible de la caisse',
        description: 'Solde disponible = solde d’ouverture + recettes encaissées − dépenses enregistrées. Les recettes ne sont jamais comptées comme des dépenses ; les opérations annulées sont exclues.',
        motsCles: ['solde', 'caisse', 'tresorerie', 'argent disponible', 'balance', 'combien en caisse', 'recettes moins depenses', 'solde ouverture'],
        chemin: ['Dépenses', 'Historique des dépenses'], page: 'depenses', focus: '#depense-output', roles: WRITE,
        etapes: ['Ouvrez « Dépenses » : les 4 indicateurs en tête de l’historique donnent recettes, dépenses, solde d’ouverture et solde disponible.', 'Filtrez par année et par période (Du / Au) : le solde d’ouverture inclut alors les mouvements antérieurs.', 'Le tableau de bord affiche aussi le solde de l’année sélectionnée.'],
        prerequis: [{ check: 'soldeOuverture', obligatoire: false, texte: 'Renseignez le solde d’ouverture de l’année si la caisse n’était pas vide au départ.', aide: 'creer-annee' }],
        resultat: 'Le solde disponible théorique de la caisse sur la période choisie.',
        erreurs: [{ probleme: 'Le solde est négatif.', solution: 'Des dépenses dépassent les encaissements : vérifiez le solde d’ouverture et les dépenses de la période.' }]
      },
    
      // ── Rapports ────────────────────────────────────────────────────────────
      {
        id: 'rapports-export', categorie: 'rapports', titre: 'Générer un rapport et l’exporter en PDF ou Excel',
        description: 'Rapports financiers (journalier, hebdomadaire, mensuel, annuel) avec statistiques de la période : nombre et moyenne des paiements, élèves payeurs, moyens de paiement, nature (frais, scolarité, dettes), modalités et meilleures journées. Recettes et dépenses, analyse par classe et situation individuelle complètent l’ensemble, avec export PDF, Excel et CSV.',
        motsCles: ['rapport', 'statistique', 'statistiques des paiements', 'export', 'pdf', 'excel', 'imprimer rapport', 'bilan', 'annuel', 'hebdomadaire', 'journalier', 'periodicite'],
        chemin: ['Rapports'], page: 'rapports', focus: '#rapports .report-tabs', roles: ALL,
        etapes: ['Ouvrez « Rapports ».', 'Choisissez un onglet (Journalier · Hebdo · Mensuel · Annuel, Recettes et dépenses, Analyse par classe, Situation individuelle…) et la « Périodicité ».', 'Réglez les filtres : année, catégorie, classe, élève, période.', 'Cliquez sur « PDF / Imprimer », « Excel » ou « CSV ».'],
        prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Les rapports d’encaissement sont vides tant qu’aucun paiement n’est enregistré.', aide: 'enregistrer-paiement' }],
        resultat: 'Un document avec l’en-tête de l’établissement, les totaux et les signatures.',
        erreurs: [{ probleme: 'Le rapport est vide.', solution: 'Élargissez la période (Du / Au) ou choisissez « Toutes » dans l’année scolaire.' }]
      },
      {
        id: 'rapport-depenses', categorie: 'rapports', titre: 'Rapport des dépenses et flux de trésorerie',
        description: 'L’onglet « Aperçu des dépenses » regroupe les dépenses par catégorie, par demandeur et en historique ; « Flux de trésorerie » donne recettes, dépenses et solde cumulé par mois ou par année.',
        motsCles: ['rapport depenses', 'apercu des depenses', 'flux de tresorerie', 'cash flow', 'depenses par categorie', 'depenses par demandeur'],
        chemin: ['Rapports', 'Aperçu des dépenses'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="depenses"]', roles: ALL,
        etapes: ['Ouvrez « Rapports » puis l’onglet « Aperçu des dépenses » ou « Flux de trésorerie ».', 'Filtrez par année, période, catégorie de dépense ou demandeur.', 'Exportez en PDF ou en Excel.'],
        prerequis: [{ check: 'depense', obligatoire: false, texte: 'Sans dépense enregistrée, seules les recettes apparaissent.', aide: 'enregistrer-depense' }],
        resultat: 'Les totaux de recettes, de dépenses et le solde disponible de la période.',
        erreurs: [{ probleme: 'Le filtre « Classe » ne change rien.', solution: 'La caisse n’est pas découpée par classe : ce filtre ne s’applique qu’aux rapports d’élèves.' }]
      },
      {
        id: 'retards-rappels', categorie: 'rapports', titre: 'Suivre les retards et imprimer des fiches de rappel',
        description: 'Liste les échéances dépassées avec les jours de retard, et imprime des fiches de rappel (4 par page A4). Une fiche est générée 14 jours avant la date limite d’une tranche (ou des frais d’inscription) et 7 jours avant l’échéance d’une mensualité, selon les dates configurées ; elle reste due tant que l’échéance n’est pas réglée.',
        motsCles: ['retard', 'impaye', 'relance', 'rappel', 'fiche de rappel', 'debiteur', 'qui n a pas paye', 'echeance depassee', 'avant la date limite'],
        chemin: ['Rapports', 'Retards de paiement / Fiches de rappel'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="retards"]', roles: ALL,
        etapes: ['Ouvrez « Rapports » puis l’onglet « Retards de paiement ».', 'Filtrez par classe ou par élève si besoin.', 'Pour les familles, passez à l’onglet « Fiches de rappel », choisissez au besoin la « Date de référence », puis cliquez sur « Imprimer les fiches (4 par page) ».'],
        prerequis: [{ check: 'echeances', obligatoire: true, texte: 'Les retards se calculent sur les échéanciers des élèves inscrits.', aide: 'inscrire-eleve' }],
        resultat: 'La liste des élèves en retard et des fiches prêtes à distribuer.',
        erreurs: [{ probleme: '« Aucune fiche à imprimer ».', solution: 'Aucun élève de la sélection n’a de solde à régler.' }]
      },
      {
        id: 'statut-tranches', categorie: 'rapports', titre: 'Voir le statut des tranches et mensualités',
        description: 'Pour chaque tranche ou mensualité : nombre d’échéances soldées, partielles, impayées ou en retard, reste dû, et ponctualité des paiements.',
        motsCles: ['statut tranches', 'mensualites', 'echeances', 'ponctualite', 'tranche payee', 'suivi des echeances'],
        chemin: ['Rapports', 'Tranches et mensualités'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="echeances"]', roles: ALL,
        etapes: ['Ouvrez « Rapports » puis l’onglet « Tranches et mensualités ».', 'Choisissez l’année et, si besoin, la classe.'],
        prerequis: [{ check: 'echeances', obligatoire: true, texte: 'Des élèves doivent avoir un échéancier.', aide: 'inscrire-eleve' }],
        resultat: 'Deux tableaux : statut par tranche et ponctualité des paiements.',
        erreurs: []
      },
    
      // ── Établissement et sauvegardes ────────────────────────────────────────
      {
        id: 'configurer-etablissement', categorie: 'etablissement', titre: 'Configurer l’établissement, l’en-tête et le caissier',
        description: 'Nom, sigle, devise, coordonnées, en-tête officiel (tutelle, slogan), logo, symbole national et nom du caissier affiché sur tous les reçus.',
        motsCles: ['parametre', 'configuration', 'etablissement', 'ecole', 'logo', 'en tete', 'caissier', 'devise', 'adresse', 'nom de l ecole'],
        chemin: ['Configuration', 'Établissement'], page: 'config', focus: '#config form[data-form="config"]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur.',
        etapes: ['Ouvrez « Administration › Configuration ».', 'Complétez les champs de l’établissement, dont « Nom du caissier ».', 'Ajoutez le logo ou le symbole national (600 Ko max.).', 'Cliquez sur « Enregistrer ».'],
        prerequis: [],
        resultat: 'Les reçus et rapports utilisent immédiatement ces informations.',
        erreurs: [{ probleme: '« Image trop lourde ».', solution: 'Utilisez une image de moins de 600 Ko.' }]
      },
      {
        id: 'sauvegarder-donnees', categorie: 'etablissement', titre: 'Sauvegarder, exporter ou importer les données',
        description: 'Les données sont stockées dans le navigateur. Vous pouvez activer une sauvegarde automatique dans un fichier (Chrome / Edge), exporter les données (JSON) ou une note lisible (TXT), et réimporter un fichier.',
        motsCles: ['sauvegarde', 'backup', 'exporter', 'importer', 'json', 'restaurer donnees', 'copie', 'fichier'],
        chemin: ['Configuration', 'Sauvegarde'], page: 'config', focus: '#config [data-action="backup:choose"]', roles: ADMIN,
        autorisation: 'Page réservée à l’administrateur. « Exporter JSON » (menu latéral) est aussi disponible pour le comptable ; « Importer JSON » est réservé à l’administrateur, avec son mot de passe.',
        etapes: ['Ouvrez « Administration › Configuration » › « Sauvegarde ».', 'Cliquez sur « Activer la sauvegarde automatique dans un fichier » et choisissez l’emplacement.', 'Pour une copie ponctuelle : « Exporter les données (JSON) » ou « Exporter une note lisible (TXT) ».', 'Pour importer : « Importer JSON » dans le menu latéral ; une copie de sécurité est créée avant le remplacement.'],
        prerequis: [],
        resultat: 'Une copie de vos données hors du navigateur.',
        erreurs: [{ probleme: 'Le bouton de sauvegarde automatique est grisé.', solution: 'Votre navigateur ne le permet pas : utilisez Chrome ou Edge, ou l’export manuel.' }]
      },
      {
        id: 'copies-securite', categorie: 'etablissement', titre: 'Restaurer une copie de sécurité',
        description: 'Une copie de sécurité est créée automatiquement avant chaque réinitialisation, import ou restauration. Elle peut être téléchargée ou restaurée ; sa suppression exige le mot de passe administrateur.',
        motsCles: ['copie de securite', 'restaurer', 'restauration', 'revenir en arriere', 'recuperer donnees', 'donnees perdues'],
        chemin: ['Configuration', 'Copies de sécurité'], page: 'config', focus: '#config .danger-zone', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur, avec ressaisie du mot de passe.',
        etapes: ['Ouvrez « Administration › Configuration » › « Copies de sécurité ».', 'Cliquez sur « Restaurer » sur la copie voulue et saisissez votre mot de passe.', 'Les données actuelles sont elles-mêmes sauvegardées avant la restauration.'],
        prerequis: [],
        resultat: 'Les données reviennent à l’état de la copie choisie.',
        erreurs: [{ probleme: '« Aucune copie de sécurité ».', solution: 'Aucune opération destructrice n’a encore eu lieu : utilisez l’export JSON pour vos sauvegardes régulières.' }]
      },
      {
        id: 'reinitialiser', categorie: 'etablissement', titre: 'Réinitialiser les données',
        description: 'Efface élèves, classes, frais, inscriptions, paiements, dépenses et journal. L’établissement, les années scolaires et les comptes utilisateurs sont conservés.',
        motsCles: ['reinitialiser', 'remise a zero', 'effacer', 'tout supprimer', 'reset', 'vider'],
        chemin: ['Configuration', 'Zone dangereuse — réinitialisation'], page: 'config', focus: '#config [data-action="admin:reset"]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur : mot de passe et saisie du mot RÉINITIALISER obligatoires.',
        etapes: ['Ouvrez « Administration › Configuration » › « Zone dangereuse ».', 'Cliquez sur « Réinitialiser les données… ».', 'Saisissez votre mot de passe et tapez RÉINITIALISER.', 'Une copie de sécurité est créée et téléchargée avant l’effacement.'],
        prerequis: [],
        resultat: 'Une application vide, prête pour une nouvelle saisie ; la copie de sécurité reste restaurable.',
        erreurs: [{ probleme: '« Copie de sécurité impossible : réinitialisation annulée ».', solution: 'Le stockage du navigateur est plein : exportez puis supprimez d’anciennes copies avant de recommencer.' }]
      },
    
      // ── Utilisateurs et sécurité ────────────────────────────────────────────
      {
        id: 'gerer-utilisateurs', categorie: 'securite', titre: 'Créer un utilisateur et attribuer un rôle',
        description: 'Trois rôles : Administrateur (tout), Comptable / Caissier (saisie, sans suppression ni configuration) et Consultation (tableau de bord, analyse, rapports, aide).',
        motsCles: ['utilisateur', 'compte', 'role', 'droit', 'permission', 'acces', 'caissier', 'comptable', 'creer compte', 'ajouter utilisateur'],
        chemin: ['Configuration', 'Utilisateurs et rôles'], page: 'config', focus: '#config form[data-form="utilisateur"]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur.',
        etapes: ['Ouvrez « Administration › Configuration » › « Utilisateurs et rôles ».', 'Saisissez l’identifiant, le nom complet, le rôle et un mot de passe (8 caractères, une lettre et un chiffre).', 'Cliquez sur « Créer l’utilisateur ».', 'Pour retirer un accès, utilisez « Désactiver » (l’historique de l’utilisateur est conservé).'],
        prerequis: [],
        resultat: 'Le nouvel utilisateur peut se connecter avec ses identifiants.',
        erreurs: [
          { probleme: '« Cet identifiant existe déjà ».', solution: 'Choisissez un autre identifiant.' },
          { probleme: '« Il doit rester au moins un administrateur actif ».', solution: 'Créez ou activez un autre administrateur avant de désactiver celui-ci.' }
        ]
      },
      {
        id: 'mot-de-passe', categorie: 'securite', titre: 'Changer un mot de passe',
        description: 'L’administrateur change le mot de passe de n’importe quel compte, y compris le sien. Les autres utilisateurs doivent s’adresser à l’administrateur.',
        motsCles: ['mot de passe', 'oublie', 'changer mot de passe', 'password', 'perdu', 'reinitialiser mot de passe'],
        chemin: ['Configuration', 'Utilisateurs et rôles', 'Mot de passe'], page: 'config', focus: '#config form[data-form="utilisateur"]', roles: ADMIN,
        autorisation: 'Réservé à l’administrateur, qui confirme avec son propre mot de passe.',
        etapes: ['Ouvrez « Administration › Configuration » › « Utilisateurs et rôles ».', 'Cliquez sur « Mot de passe » sur la ligne du compte.', 'Saisissez le nouveau mot de passe puis confirmez avec votre mot de passe administrateur.'],
        prerequis: [],
        resultat: 'L’utilisateur se connecte désormais avec le nouveau mot de passe.',
        erreurs: [{ probleme: '« Trop de tentatives. Réessayez dans … s. »', solution: 'Après 5 échecs, la connexion est bloquée une minute.' }]
      },
      {
        id: 'connexion', categorie: 'securite', titre: 'Se connecter et se déconnecter',
        description: 'Chaque utilisateur se connecte avec son identifiant. Au tout premier lancement, l’application demande de créer le compte administrateur (il n’existe pas de mot de passe par défaut).',
        motsCles: ['connexion', 'se connecter', 'deconnexion', 'se deconnecter', 'login', 'premier lancement', 'compte administrateur'],
        chemin: ['Menu latéral', 'Se déconnecter'], page: null, focus: null, roles: ALL,
        etapes: ['Saisissez votre identifiant et votre mot de passe sur l’écran de connexion.', 'Votre nom et votre rôle s’affichent en bas du menu latéral.', 'Une actualisation de la page vous garde connecté, sur la même page et avec vos filtres, tant que la session est valide.', 'La session se ferme à la fermeture de l’onglet, après 2 heures d’inactivité ou au bout de 12 heures.', 'Cliquez sur « Se déconnecter » en fin de session, surtout sur un poste partagé.'],
        prerequis: [],
        resultat: 'Vous accédez uniquement aux pages autorisées pour votre rôle.',
        erreurs: [
          { probleme: '« Ce compte est désactivé ».', solution: 'Demandez à un administrateur de le réactiver.' },
          { probleme: '« Session expirée : veuillez vous reconnecter ».', solution: 'Reconnectez-vous : vous retrouvez la page sur laquelle vous étiez.' }
        ]
      },
      {
        id: 'modalite-reglement', categorie: 'paiements', titre: 'Choisir le paiement mensuel ou par tranches',
        description: 'La modalité de règlement (mensuelle ou par tranches) se choisit au premier paiement de l’élève pour l’année, puis reste modifiable en cours d’année, dans les deux sens. Lors d’un changement, l’échéancier est recalculé et les paiements déjà validés sont réimputés : rien n’est supprimé ni compté deux fois.',
        motsCles: ['paiement mensuel', 'payer par mois', 'mensuel', 'mensualite', 'par tranches', 'modalite', 'mode de paiement', 'changer de modalite', 'changer de mode', 'basculer en mensuel', 'modalite en cours d annee'],
        chemin: ['Paiements', 'Enregistrer un paiement', 'Modalité de règlement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
        autorisation: 'Administrateur ou comptable. Le changement est confirmé et inscrit au journal ; l’ancienne répartition de chaque paiement est conservée dans son historique.',
        etapes: ['Ouvrez « Paiements › Encaissements » et sélectionnez l’élève.', 'Dans « Modalité de règlement », choisissez « Paiement par tranches » ou « Paiement mensuel » ; l’échéancier affiché s’adapte immédiatement.', 'Pour un changement en cours d’année, lisez l’avertissement : les montants déjà payés sont réimputés sur le nouvel échéancier.', 'Enregistrez un paiement (le changement s’applique avec lui) ou cliquez sur « Appliquer sans encaisser ».'],
        prerequis: [
          { check: 'payable', obligatoire: true, texte: 'L’élève doit être inscrit dans une classe dont le tarif est configuré.', aide: 'inscrire-eleve' },
          { check: 'mensuel', obligatoire: false, texte: 'Le paiement mensuel n’est proposé que si le tarif de la classe a un montant mensuel.', aide: 'configurer-frais' }
        ],
        resultat: 'Mensuel : une échéance par mois au montant mensuel du tarif. Tranches : les tranches et dates limites du tarif. Les frais d’inscription restent inchangés et les soldes sont recalculés automatiquement.',
        erreurs: [
          { probleme: 'L’option « Paiement mensuel » est grisée.', solution: 'Le tarif de la classe n’a pas de montant mensuel : complétez-le dans « Scolarité › Tarifs et frais ».' },
          { probleme: '« Changement impossible : … déjà payés dépassent le total de la nouvelle modalité ».', solution: 'L’élève a déjà payé plus que le total de l’autre modalité : le changement ne peut pas répartir ce montant, il est refusé sans rien modifier.' }
        ]
      },
      {
        id: 'facture-scolarite', categorie: 'paiements', titre: 'Imprimer la facture de scolarité d’un élève',
        description: 'Document récapitulatif calculé automatiquement : élève, modalité, échéancier (dû, payé, reste, statut), paiements validés, progression et reste à payer.',
        motsCles: ['facture', 'releve', 'relevé de compte', 'situation de compte', 'etat de compte', 'facturation'],
        chemin: ['Paiements', 'Fiche de l’élève', 'Imprimer la facture'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
        etapes: ['Ouvrez « Paiements › Encaissements » et sélectionnez l’élève : cliquez sur « Imprimer la facture » au-dessus de l’échéancier.', 'Ou, dans « Élèves › Dossiers élèves », ouvrez la fiche avec « Consulter » et cliquez sur « Facture » pour l’année voulue.'],
        prerequis: [{ check: 'echeances', obligatoire: true, texte: 'L’inscription doit avoir un échéancier (frais configurés).', aide: 'configurer-frais' }],
        resultat: 'Une facture A4 numérotée FAC-année-n°, toujours à jour : elle exclut les paiements annulés.',
        erreurs: []
      }
    ];
    
    // Fonctionnalités souvent recherchées mais ABSENTES de cette application : on le dit clairement plutôt que
    // de proposer un lien fictif. `alternative` oriente vers ce qui existe réellement.
    const UNAVAILABLE = [
      { id: 'matieres', label: 'Matières', motsCles: ['matiere', 'matieres', 'discipline', 'programme scolaire'], alternative: null },
      { id: 'enseignants', label: 'Enseignants et affectations', motsCles: ['enseignant', 'enseignants', 'professeur', 'prof', 'instituteur', 'maitre', 'affecter un enseignant', 'personnel enseignant'], alternative: null },
      { id: 'emploi-du-temps', label: 'Emploi du temps', motsCles: ['emploi du temps', 'horaire', 'planning', 'creneau', 'seance'], alternative: null },
      { id: 'notes', label: 'Évaluations et notes', motsCles: ['note', 'notes', 'evaluation', 'devoir', 'composition', 'examen note', 'interrogation'], alternative: null },
      { id: 'moyennes', label: 'Moyennes et bulletins', motsCles: ['moyenne', 'moyennes', 'bulletin', 'bulletins', 'classement eleves', 'rang', 'trimestre', 'semestre', 'appreciation'], alternative: 'fiche-eleve' },
      { id: 'absences', label: 'Absences et présences', motsCles: ['absence', 'absences', 'presence', 'appel', 'retard eleve en classe'], alternative: null }
    ];
    
    HELP_TOPICS.push(
      {
        id: 'frais-inscription', categorie: 'eleves', titre: 'Configurer les frais d’inscription et de réinscription',
        description: 'Chaque année scolaire a son montant d’inscription (nouvel élève) et son montant de réinscription. Il est ajouté une seule fois à l’échéancier de l’élève, lors de son inscription ou de sa réinscription de l’année, et réglé en priorité par le premier paiement.',
        motsCles: ['frais d inscription', 'frais de reinscription', 'droit d inscription', 'inscription payante', 'reinscription', 'montant inscription'],
        chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees [name="fraisInscription"]', roles: WRITE,
        autorisation: 'Création d’une année : administrateur ou comptable. Modification d’une année existante : autorisation d’un administrateur.',
        etapes: ['Ouvrez « Scolarité › Années scolaires ».', 'Renseignez « Frais d’inscription (nouvel élève) » et « Frais de réinscription » (ou cliquez sur « Modifier » pour une année existante).', 'Enregistrez : les inscriptions suivantes de cette année reçoivent automatiquement le bon montant.'],
        prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année scolaire doit exister.', aide: 'creer-annee' }],
        resultat: 'Une échéance « Frais d’inscription » ou « Frais de réinscription » apparaît en tête de l’échéancier de chaque nouvel inscrit, une seule fois. Elle est conservée si la modalité change.',
        erreurs: [{ probleme: 'Un élève déjà inscrit n’a pas les frais.', solution: 'Les frais s’appliquent aux inscriptions faites après leur configuration : un montant déjà enregistré n’est jamais modifié ni ajouté rétroactivement.' }]
      },
      {
        id: 'dettes-anterieures', categorie: 'paiements', titre: 'Suivre et encaisser les dettes des années précédentes',
        description: 'Le solde impayé d’une année est reporté automatiquement quand l’élève est inscrit dans une année suivante ou que l’année est clôturée. Pour chaque dette : montant reporté, remboursé et reste dû, avec l’historique de chaque règlement.',
        motsCles: ['dette', 'dettes', 'reliquat', 'arriere', 'annee precedente', 'ancienne annee', 'solde reporte', 'report', 'impaye annee derniere', 'recouvrement'],
        chemin: ['Dettes antérieures'], page: 'dettes', focus: '#dettes [data-dettes="search"]', roles: WRITE,
        etapes: ['Ouvrez « Paiements › Dettes antérieures » pour voir toutes les dettes (filtres : recherche, statut).', 'Cliquez sur « Encaisser » : le formulaire de paiement s’ouvre sur la dette de l’élève.', 'Ou, dans « Paiements › Encaissements », sélectionnez l’élève : ses dettes s’affichent avec un bouton « Régler cette dette ».', 'Saisissez le montant et enregistrez ; « Historique » liste tous les règlements.'],
        prerequis: [],
        resultat: 'Le reste dû diminue, l’année d’origine est soldée d’autant, et le règlement est encaissé sur l’année en cours (trésorerie). Une dette n’est jamais comptée deux fois.',
        erreurs: [{ probleme: '« L’année … est clôturée ».', solution: 'Seul le règlement d’une dette reportée est accepté sur une année clôturée : passez par « Dettes antérieures » ou le bouton « Régler cette dette ».' }]
      }
    );
    
    const FAQ_IDS = ['inscrire-eleve', 'enregistrer-paiement', 'modalite-reglement', 'dettes-anterieures', 'repartition-tranches', 'enregistrer-depense', 'solde-caisse', 'retards-rappels'];
    
    const SUGGESTED_QUESTIONS = [
      'Comment inscrire un élève ?',
      'Comment enregistrer un paiement ?',
      'Que se passe-t-il si un parent paie plus que la tranche ?',
      'Comment enregistrer une dépense ?',
      'Combien reste-t-il en caisse ?',
      'Où ajouter une classe ?'
    ];
    
    // Chemin d'accès exact : onglet principal › sous-onglet (source unique : navigation.js), puis l'élément de la page
    HELP_TOPICS.forEach((topic) => {
      if (topic.page) topic.chemin = [...pagePath(topic.page), ...topic.chemin.slice(1)];
    });
    
    Object.assign(exports, { CHECKS, HELP_CATEGORIES, HELP_TOPICS, UNAVAILABLE, FAQ_IDS, SUGGESTED_QUESTIONS });
  };
  factories['./modules/navigation.js'] = (require, exports) => {
    // Navigation : 7 onglets principaux, chacun regroupant des sous-onglets (pages).
    // Les identifiants de page restent ceux des sections existantes : aucune fonctionnalité n'est déplacée ni perdue.
    const NAV_GROUPS = [
      { id: 'accueil', label: 'Tableau de bord', icon: '📊', pages: [['dashboard', 'Vue d’ensemble'], ['analyse', 'Analyse financière']] },
      { id: 'eleves', label: 'Élèves', icon: '🎓', pages: [['eleves', 'Dossiers élèves'], ['inscriptions', 'Inscriptions']] },
      { id: 'scolarite', label: 'Scolarité', icon: '🏫', pages: [['annees', 'Années scolaires'], ['classes', 'Classes'], ['tarifs', 'Tarifs et frais']] },
      { id: 'paiements', label: 'Paiements', icon: '💳', pages: [['paiements', 'Encaissements'], ['dettes', 'Dettes antérieures']] },
      { id: 'depenses', label: 'Dépenses', icon: '🧮', pages: [['depenses', 'Dépenses et caisse']] },
      { id: 'rapports', label: 'Rapports', icon: '🧾', pages: [['rapports', 'Rapports et rappels']] },
      { id: 'administration', label: 'Administration', icon: '⚙️', pages: [['config', 'Configuration'], ['aide', 'Centre d’aide']] }
    ];
    
    const ALL_PAGES = NAV_GROUPS.flatMap((g) => g.pages.map(([id]) => id));
    
    function groupOfPage(pageId) {
      return NAV_GROUPS.find((g) => g.pages.some(([id]) => id === pageId)) || null;
    }
    
    function pageLabel(pageId) {
      for (const g of NAV_GROUPS) {
        const page = g.pages.find(([id]) => id === pageId);
        if (page) return page[1];
      }
      return pageId;
    }
    
    // Chemin lisible d'une page : « Paiements › Encaissements »
    function pagePath(pageId) {
      const group = groupOfPage(pageId);
      return group ? (group.pages.length > 1 || group.label !== pageLabel(pageId) ? [group.label, pageLabel(pageId)] : [group.label]) : [pageId];
    }
    
    Object.assign(exports, { NAV_GROUPS, ALL_PAGES, groupOfPage, pageLabel, pagePath });
  };
  factories['./modules/aide.js'] = (require, exports) => {
    const { HELP_TOPICS, HELP_CATEGORIES, UNAVAILABLE, CHECKS, FAQ_IDS } = require("./aide-data.js");
    // Moteur de recherche du centre d'aide : questions en langage naturel, mots-clés, synonymes,
    // préfixes (« inscri » → inscription) et fautes de frappe légères. Aucun appel réseau.
    
    function normalize(text) {
      return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    }
    
    const STOPWORDS = new Set(('a au aux avec ce ces cet cette comment dans de des du elle en est et faire faut il ils je la le les leur lui ma mais me mes mon ne nous on ou par pas pour qu que quel quelle quelles quels qui sa se ses si son sont sur ta te tes ton tu un une vos votre vous y d l j n s c m t '
      + 'puis peut peux veux voudrais dois doit comment ou quoi quand pourquoi combien est-ce estce ai as avoir etre fait cela ca ici svp merci aide aider').split(' '));
    
    // Groupes de synonymes : un mot de la question active tous les mots de son groupe (poids réduit)
    const SYNONYMS = [
      ['paiement', 'payer', 'paye', 'encaisser', 'encaissement', 'versement', 'verser', 'regler', 'reglement', 'acompte', 'caisse'],
      ['inscrire', 'inscription', 'inscrit', 'admission', 'admettre', 'enroler'],
      ['eleve', 'eleves', 'etudiant', 'apprenant', 'enfant', 'matricule'],
      ['depense', 'depenses', 'sortie', 'achat', 'decaisser', 'decaissement', 'charge', 'debourser'],
      ['frais', 'tarif', 'tarifs', 'scolarite', 'prix', 'cout', 'montant'],
      ['tranche', 'tranches', 'mensualite', 'mensualites', 'echeance', 'echeances', 'echeancier', 'versements'],
      ['recu', 'quittance', 'justificatif', 'facture'],
      ['rapport', 'rapports', 'statistique', 'statistiques', 'bilan', 'etat', 'releve'],
      ['exporter', 'export', 'telecharger', 'excel', 'pdf', 'csv', 'imprimer'],
      ['annuler', 'annulation', 'supprimer', 'corriger', 'erreur', 'rembourser'],
      ['retard', 'retards', 'impaye', 'impayes', 'relance', 'rappel', 'debiteur', 'arriere'],
      ['solde', 'tresorerie', 'balance', 'disponible', 'reste'],
      ['utilisateur', 'compte', 'role', 'droit', 'droits', 'permission', 'acces'],
      ['sauvegarde', 'sauvegarder', 'backup', 'copie', 'restaurer', 'restauration'],
      ['classe', 'classes', 'section', 'niveau', 'salle'],
      ['annee', 'annees', 'rentree', 'exercice'],
      ['configuration', 'parametre', 'parametres', 'reglage', 'reglages', 'configurer'],
      ['excedent', 'surplus', 'plus', 'trop', 'avance', 'depasse', 'depasser']
    ];
    
    const SYNONYM_INDEX = new Map();
    SYNONYMS.forEach((group) => group.forEach((word) => SYNONYM_INDEX.set(word, group)));
    
    function tokenize(text) {
      return normalize(text).split(' ').filter((t) => t && !STOPWORDS.has(t));
    }
    
    // Racine grossière du français : pluriels et terminaisons verbales courantes
    function stem(word) {
      return word.replace(/(ements|ement|ations|ation|euses|euse|eurs|eur|ions|ees|es|er|ez|e|s|x)$/, '') || word;
    }
    
    function editDistanceAtMostOne(a, b) {
      if (Math.abs(a.length - b.length) > 1) return false;
      let i = 0; let j = 0; let edits = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i += 1; j += 1; continue; }
        edits += 1;
        if (edits > 1) return false;
        if (a.length > b.length) i += 1;
        else if (a.length < b.length) j += 1;
        else { i += 1; j += 1; }
      }
      return edits + (a.length - i) + (b.length - j) <= 1;
    }
    
    // Qualité de correspondance d'un mot de la question avec un mot indexé (0 à 1)
    function wordMatch(query, word) {
      if (query === word) return 1;
      const qs = stem(query); const ws = stem(word);
      if (qs.length >= 3 && qs === ws) return 0.95;
      if (query.length >= 4 && word.startsWith(query)) return 0.85;
      if (qs.length >= 4 && ws.startsWith(qs)) return 0.8;
      if (query.length >= 5 && word.length >= 5 && editDistanceAtMostOne(query, word)) return 0.6;
      return 0;
    }
    
    const FIELD_WEIGHTS = { titre: 6, motsCles: 5, categorie: 3, chemin: 3, description: 2, etapes: 1 };
    
    function indexTopic(topic) {
      const category = HELP_CATEGORIES.find((c) => c.id === topic.categorie);
      const words = (text) => [...new Set(normalize(text).split(' ').filter((w) => w && !STOPWORDS.has(w)))];
      return {
        topic,
        fields: {
          titre: words(topic.titre),
          motsCles: words(topic.motsCles.join(' ')),
          categorie: words(category?.label || ''),
          chemin: words(topic.chemin.join(' ')),
          description: words(topic.description),
          etapes: words(topic.etapes.join(' '))
        },
        phrases: topic.motsCles.map(normalize).filter((p) => p.includes(' '))
      };
    }
    
    let INDEX = null;
    const index = () => { if (!INDEX) INDEX = HELP_TOPICS.map(indexTopic); return INDEX; };
    
    function scoreTopic(entry, tokens, normalizedQuery) {
      let score = 0;
      let matched = 0;
      tokens.forEach((token) => {
        const group = SYNONYM_INDEX.get(token) || SYNONYM_INDEX.get(stem(token)) || [];
        let best = 0;
        Object.entries(entry.fields).forEach(([field, words]) => {
          const weight = FIELD_WEIGHTS[field];
          words.forEach((word) => {
            const direct = wordMatch(token, word);
            const viaSynonym = direct ? 0 : (group.some((syn) => wordMatch(syn, word) >= 0.95) ? 0.55 : 0);
            best = Math.max(best, weight * Math.max(direct, viaSynonym));
          });
        });
        if (best > 0) matched += 1;
        score += best;
      });
      // Expression exacte (« tableau de bord », « solde ouverture »…) présente dans la question
      entry.phrases.forEach((phrase) => { if (normalizedQuery.includes(phrase)) score += 6; });
      if (tokens.length && matched === tokens.length) score *= 1.25;
      // À pertinence égale, les opérations les plus courantes passent devant
      if (score > 0 && FAQ_IDS.includes(entry.topic.id)) score += 0.5;
      return { score, matched };
    }
    
    // Fonctionnalités absentes de l'application évoquées par la question
    function unavailableMatches(query) {
      const q = ` ${normalize(query)} `;
      const tokens = tokenize(query);
      return UNAVAILABLE.filter((u) => u.motsCles.some((k) => {
        const nk = normalize(k);
        if (nk.includes(' ')) return q.includes(` ${nk} `);
        return tokens.some((t) => t === nk || (t.length >= 5 && stem(t) === stem(nk)));
      }));
    }
    
    // Recherche principale : fiches triées par pertinence + fonctionnalités inexistantes signalées
    function searchHelp(query, { limit = 12, categorie = '' } = {}) {
      const tokens = tokenize(query);
      const normalizedQuery = normalize(query);
      const unavailable = unavailableMatches(query);
      if (!tokens.length) {
        const all = HELP_TOPICS.filter((t) => !categorie || t.categorie === categorie);
        return { results: all.map((topic) => ({ topic, score: 0 })), unavailable, query: normalizedQuery };
      }
      const minimum = tokens.length === 1 ? 2.5 : 3.5;
      const results = index()
        .filter((e) => !categorie || e.topic.categorie === categorie)
        .map((entry) => ({ topic: entry.topic, ...scoreTopic(entry, tokens, normalizedQuery) }))
        .filter((r) => r.score >= minimum)
        .sort((a, b) => b.score - a.score || faqRank(a.topic.id) - faqRank(b.topic.id) || a.topic.titre.localeCompare(b.topic.titre, 'fr'))
        .slice(0, limit);
      // Question portant sur une fonctionnalité absente (« affecter un enseignant à une classe ») : on ne garde que
      // les fiches qui couvrent TOUTE la question, pour ne pas suggérer une fonction qui n'y répond pas.
      const kept = unavailable.length ? results.filter((r) => r.matched === tokens.length) : results;
      return { results: kept, unavailable, query: normalizedQuery };
    }
    
    // Rang dans les questions fréquentes (les plus courantes d'abord), pour départager deux fiches de même score
    function faqRank(id) {
      const index = FAQ_IDS.indexOf(id);
      return index === -1 ? FAQ_IDS.length : index;
    }
    
    function topicById(id) {
      return HELP_TOPICS.find((t) => t.id === id) || null;
    }
    
    // Prérequis évalués sur les données actuelles
    function evaluatePrerequisites(state, topic) {
      return (topic.prerequis || []).map((p) => {
        const check = p.check ? CHECKS[p.check] : null;
        return { ...p, label: check?.label || p.texte, ok: check ? Boolean(check.test(state)) : true };
      });
    }
    
    // Accès à la fonctionnalité : rôle, page autorisée, prérequis obligatoires manquants
    function accessStatus(state, topic, role, allowedPages) {
      const prereqs = evaluatePrerequisites(state, topic);
      const missing = prereqs.filter((p) => p.obligatoire && !p.ok);
      const roleOk = Boolean(role) && topic.roles.includes(role) && (!topic.page || allowedPages.includes(topic.page));
      return { roleOk, navigable: Boolean(topic.page) && roleOk, missing, prereqs };
    }
    
    Object.assign(exports, { normalize, tokenize, unavailableMatches, searchHelp, topicById, evaluatePrerequisites, accessStatus });
  };
  factories['./modules/ui-state.js'] = (require, exports) => {
    // Mémorisation de l'état d'affichage (page, filtres, recherches) pour la session de l'onglet et par utilisateur :
    // une actualisation ramène l'utilisateur exactement où il était. Ce n'est qu'un confort d'affichage ;
    // aucune donnée comptable n'est stockée ici, et tout est revalidé à la restauration.
    const UI_KEY = 'ibk_ui_state_v1';
    
    function readAll() {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(UI_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) { return {}; }
    }
    
    function loadUiState(userId) {
      const value = readAll()[String(userId)];
      return value && typeof value === 'object' ? value : {};
    }
    
    function saveUiState(userId, value) {
      try {
        const all = readAll();
        all[String(userId)] = value;
        sessionStorage.setItem(UI_KEY, JSON.stringify(all));
      } catch (error) { /* stockage indisponible : simple perte de confort */ }
    }
    
    // Ne recopie que les clés connues, avec le même type que la valeur par défaut
    function pickKnown(defaults, saved) {
      const out = {};
      if (!saved || typeof saved !== 'object') return out;
      Object.keys(defaults).forEach((key) => {
        if (key in saved && typeof saved[key] === typeof defaults[key]) out[key] = saved[key];
      });
      return out;
    }
    
    Object.assign(exports, { loadUiState, saveUiState, pickKnown });
  };
  factories['./modules/dettes-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { situationReliquat, STATUT_RELIQUAT } = require("./reliquats.js");
    const { studentOf, classOf } = require("./finance.js");
    const { can } = require("./auth.js");
    // Page « Dettes antérieures » : registre des soldes reportés d'une année sur l'autre.
    const detteFilters = { search: '', statut: 'en_cours' };
    const BADGE = { du: 'danger', partiel: 'warning', solde: 'ok' };
    const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';
    
    function rows(state) {
      const q = detteFilters.search.trim().toLocaleLowerCase('fr');
      return (state.reliquats || []).map((r) => situationReliquat(state, r)).filter((r) => {
        if (detteFilters.statut === 'en_cours' && r.statut === 'solde') return false;
        if (detteFilters.statut === 'solde' && r.statut !== 'solde') return false;
        if (!q) return true;
        const s = studentOf(state, r.inscription);
        return `${s?.prenom || ''} ${s?.nom || ''} ${s?.matricule || ''}`.toLocaleLowerCase('fr').includes(q);
      }).sort((a, b) => b.reste - a.reste || a.id - b.id);
    }
    
    function renderDettesOutput(state) {
      const out = document.getElementById('dettes-output');
      if (!out) return;
      const devise = escapeHtml(state.config.devise);
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const all = (state.reliquats || []).map((r) => situationReliquat(state, r));
      const list = rows(state);
      const writable = can('write');
      out.innerHTML = `
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Dettes reportées</span><strong>${all.length}</strong></div></article>
          <article class="stat-card accent-orange"><div><span>Montant reporté</span><strong>${money(all.reduce((s, r) => s + r.montantReporte, 0))}</strong></div></article>
          <article class="stat-card accent-green"><div><span>Remboursé</span><strong>${money(all.reduce((s, r) => s + r.rembourse, 0))}</strong></div></article>
          <article class="stat-card accent-red"><div><span>Reste à recouvrer</span><strong>${money(all.reduce((s, r) => s + r.reste, 0))}</strong></div></article>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Élève</th><th>Année d’origine</th><th>Classe d’origine</th><th>Reporté le</th><th>Reporté sur</th><th>Montant reporté</th><th>Remboursé</th><th>Reste dû</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${list.map((r) => {
            const s = studentOf(state, r.inscription);
            return `<tr>
              <td><b>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</b><div class="meta">${escapeHtml(s?.matricule || '—')}</div></td>
              <td>${escapeHtml(yearName(state, r.anneeOrigineId))}</td><td>${escapeHtml(classOf(state, r.inscription?.classeId)?.nom || '—')}</td>
              <td>${escapeHtml(formatDateFr(r.dateReport))}</td><td>${escapeHtml(r.anneeReportId ? yearName(state, r.anneeReportId) : 'Année active')}</td>
              <td class="num">${money(r.montantReporte)}</td><td class="num">${money(r.rembourse)}</td><td class="num"><b>${money(r.reste)}</b></td>
              <td><span class="badge ${BADGE[r.statut]}">${STATUT_RELIQUAT[r.statut]}</span></td>
              <td><button class="action-btn" data-action="dette:view:${r.id}">Historique</button>${writable && r.reste > 0 ? `<button class="action-btn" data-action="dette:pay:${r.id}">Encaisser</button>` : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="10">Aucune dette antérieure pour cette sélection.</td></tr>'}</tbody>
        </table></div>`;
    }
    
    function renderDettes(state) {
      const section = document.getElementById('dettes');
      if (!section) return;
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Recouvrement</span><h2>Dettes des années précédentes</h2></div></div>
        <div class="panel">
          <p class="meta">Les soldes impayés sont reportés automatiquement dès que l’élève est inscrit dans une année suivante ou que son année est clôturée. La dette reste rattachée à l’année d’origine (aucun double comptage) ; ses règlements sont encaissés sur l’année en cours et tracés ici.</p>
          <div class="advanced-search">
            <label>Recherche <input type="search" data-dettes="search" value="${escapeHtml(detteFilters.search)}" placeholder="Nom ou matricule" autocomplete="off" /></label>
            <label>Statut <select data-dettes="statut">${[['en_cours', 'Restant à recouvrer'], ['solde', 'Soldées'], ['', 'Toutes']].map(([v, l]) => `<option value="${v}" ${v === detteFilters.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <div id="dettes-output"></div>
        </div>`;
      renderDettesOutput(state);
    }
    
    // Historique d'une dette : report et chaque règlement (n° de reçu, date, montant)
    function showDetteDetail(state, id) {
      const record = (state.reliquats || []).find((r) => r.id === Number(id));
      const root = document.getElementById('modal-root');
      if (!record || !root) return false;
      const r = situationReliquat(state, record);
      const s = studentOf(state, r.inscription);
      const money = (v) => `${formatMoney(v)} ${escapeHtml(state.config.devise)}`;
      root.innerHTML = `<div class="modal-backdrop" data-modal-close>
        <section class="student-modal" role="dialog" aria-modal="true">
          <header class="modal-header"><div><span class="eyebrow">Dette antérieure</span><h2>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')} — ${escapeHtml(yearName(state, r.anneeOrigineId))}</h2>
            <span class="meta">Reportée le ${escapeHtml(formatDateFr(r.dateReport))} · ${STATUT_RELIQUAT[r.statut]}</span></div>
            <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
          <div class="profile-section"><div class="profile-grid">
            <div class="profile-metric"><span>Montant reporté</span><strong>${money(r.montantReporte)}</strong></div>
            <div class="profile-metric"><span>Remboursé</span><strong>${money(r.rembourse)}</strong></div>
            <div class="profile-metric"><span>Reste dû</span><strong>${money(r.reste)}</strong></div></div></div>
          <div class="profile-section"><h3>Règlements</h3><div class="table-wrap"><table><thead><tr><th>N° reçu</th><th>Date</th><th>Montant</th><th>Encaissé sur</th></tr></thead>
            <tbody>${r.reglements.map((p) => `<tr><td>${escapeHtml(p.numeroRecu || '—')}</td><td>${escapeHtml(formatDateFr(p.datePaiement))}</td><td>${money(p.montant)}</td><td>${escapeHtml(yearName(state, p.anneeEncaissementId))}</td></tr>`).join('') || '<tr><td colspan="4">Aucun règlement pour le moment.</td></tr>'}</tbody></table></div></div>
        </section></div>`;
      return true;
    }
    
    Object.assign(exports, { detteFilters, renderDettesOutput, renderDettes, showDetteDetail });
  };
  factories['./modules/rapports.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO, downloadCsv, downloadExcel } = require("./utils.js");
    const { buildPeriodique, GRANULARITES } = require("./rapports-periodiques.js");
    const { buildJournalier, buildDepenses, buildTresorerie, buildEcheances } = require("./rapports-compta.js");
    const { studentName, scoped, pct, subtitle } = require("./rapports-utils.js");
    const { categoriesInUse } = require("./depenses-view.js");
    const { CATEGORIES } = require("./classes.js");
    const { enteteLignes } = require("./entete.js");
    const { echeanceReste, inscriptionSituation, scopeInscriptions, inRange, sumPayments, labelEcheance, studentOf, yearLabel, classOf, STATUT_LABELS } = require("./finance.js");
    const { printDocument } = require("./print.js");
    const { rappelsDus, DELAI_RAPPEL_JOURS } = require("./rappels.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
    const { enteteHtml } = require("./entete.js");
    const REPORT_TYPES = [
      { id: 'periodique', label: 'Hebdo · Mensuel · Annuel' },
      { id: 'journalier', label: 'Recettes et dépenses' },
      { id: 'depenses', label: 'Aperçu des dépenses' },
      { id: 'tresorerie', label: 'Flux de trésorerie' },
      { id: 'classes', label: 'Analyse par classe' },
      { id: 'retards', label: 'Retards de paiement' },
      { id: 'situation', label: 'Situation individuelle' },
      { id: 'echeances', label: 'Tranches et mensualités' },
      { id: 'rappels', label: 'Fiches de rappel' }
    ];
    
    function defaultReportFilters(state) {
      const today = todayISO();
      return { type: 'periodique', gran: 'mois', category: '', yearId: Number(state.anneeActiveId || 0), classId: 0, from: `${today.slice(0, 4)}-01-01`, to: today, search: '', categorieDepense: '', demandeur: '', dateRef: '' };
    }
    
    function daysBetween(fromIso, toIso) {
      return Math.max(Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000), 0);
    }
    
    function buildClasses(state, f) {
      const inscriptions = scoped(state, f);
      const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === f.yearId) && (!f.classId || c.id === f.classId));
      let totalDue = 0; let totalPaid = 0;
      const rows = classes.map((classe) => {
        const list = inscriptions.filter((i) => i.classeId === classe.id);
        const due = list.reduce((s, i) => s + inscriptionSituation(state, i).total, 0);
        const paid = list.reduce((s, i) => s + inscriptionSituation(state, i).paye, 0);
        totalDue += due; totalPaid += paid;
        return { cells: [classe.nom, classe.categorie, list.length, due, paid, Math.max(due - paid, 0), pct(paid, due)] };
      });
      return {
        title: 'Analyse financière par classe', subtitle: subtitle(state, f, false),
        kpis: [['Frais attendus', totalDue, true], ['Reçus', totalPaid, true], ['Taux de recouvrement', pct(totalPaid, totalDue)]],
        head: ['Classe', 'Niveau', 'Effectif', 'Frais attendus', 'Paiements reçus', 'Solde', 'Recouvrement'],
        money: [3, 4, 5], rows, foot: ['TOTAL', '', rows.reduce((s, r) => s + r.cells[2], 0), totalDue, totalPaid, Math.max(totalDue - totalPaid, 0), pct(totalPaid, totalDue)],
        empty: 'Aucune classe pour cette sélection.'
      };
    }
    
    function lateItems(state, f) {
      const today = todayISO();
      return scoped(state, f).flatMap((inscription) => (inscription.echeances || [])
        .filter((e) => echeanceReste(e) > 0 && e.dateLimite && e.dateLimite < today)
        .map((e) => ({ inscription, echeance: e, jours: daysBetween(e.dateLimite, today) })))
        .sort((a, b) => b.jours - a.jours);
    }
    
    function buildRetards(state, f) {
      const items = lateItems(state, f);
      const rows = items.map(({ inscription, echeance, jours }) => {
        const s = studentOf(state, inscription);
        return { cells: [s?.matricule || '—', studentName(state, inscription), classOf(state, inscription.classeId)?.nom || '—', labelEcheance(echeance), echeance.dateLimite, jours, echeanceReste(echeance), s?.telephone || s?.parent || '—'] };
      });
      const total = items.reduce((s, i) => s + echeanceReste(i.echeance), 0);
      return {
        title: 'Retards de paiement', subtitle: subtitle(state, f, false),
        kpis: [['Échéances en retard', items.length], ['Élèves concernés', new Set(items.map((i) => i.inscription.id)).size], ['Montant en retard', total, true]],
        head: ['Matricule', 'Élève', 'Classe', 'Tranche', 'Échéance', 'Jours de retard', 'Reste dû', 'Contact'],
        money: [6], rows, foot: ['TOTAL', '', '', '', '', '', total, ''], empty: 'Aucun retard de paiement.'
      };
    }
    
    function buildSituation(state, f) {
      const list = scoped(state, f);
      const rows = list.map((inscription) => {
        const s = studentOf(state, inscription);
        const sit = inscriptionSituation(state, inscription);
        const pays = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((a, b) => a.id - b.id);
        return { cells: [s?.matricule || '—', studentName(state, inscription), classOf(state, inscription.classeId)?.nom || '—', sit.total, sit.paye, sit.reste, `${sit.taux}%`, STATUT_LABELS[sit.statut],
          pays.map((p) => `${formatDateFr(p.datePaiement)} : ${formatMoney(p.montant)}`).join(' | ') || 'Aucun paiement'], statut: sit.statut };
      });
      const sum = (i) => rows.reduce((s, r) => s + r.cells[i], 0);
      return {
        title: 'Situation individuelle des élèves inscrits', subtitle: subtitle(state, f, false),
        kpis: [['Élèves', rows.length], ['À jour', rows.filter((r) => r.statut === 'a_jour').length], ['En retard', rows.filter((r) => r.statut === 'retard').length]],
        head: ['Matricule', 'Élève', 'Classe', 'Attendu', 'Payé', 'Reste', 'Taux', 'Situation', 'Historique des paiements'],
        money: [3, 4, 5], rows, foot: ['TOTAL', '', '', sum(3), sum(4), sum(5), pct(sum(4), sum(3)), '', ''], empty: 'Aucun élève inscrit pour cette sélection.'
      };
    }
    
    function reminderItems(state, f) {
      return rappelsDus(state, scoped(state, f), f.dateRef || todayISO());
    }
    
    const situationRappel = (item) => (item.late ? `En retard de ${-item.jours} j` : item.jours === 0 ? 'Échéance aujourd’hui' : `Dans ${item.jours} j`);
    
    function buildRappels(state, f) {
      const items = reminderItems(state, f);
      const rows = items.map((item) => ({
        cells: [studentOf(state, item.inscription)?.matricule || '—', studentName(state, item.inscription), classOf(state, item.inscription.classeId)?.nom || '—',
          MODALITES[modaliteActuelle(item.inscription)] || '—', item.libelles, item.echeance.dateLimite || '—', item.montant, situationRappel(item), item.dette]
      }));
      const total = items.reduce((sum, i) => sum + i.montant, 0);
      return {
        title: 'Fiches de rappel de paiement',
        subtitle: `${subtitle(state, f, false)} · Date de référence : ${formatDateFr(f.dateRef || todayISO())} · Rappel ${DELAI_RAPPEL_JOURS.tranche} jours avant une tranche, ${DELAI_RAPPEL_JOURS.mensuel} jours avant une mensualité`,
        kpis: [['Fiches à imprimer', rows.length], ['Pages A4 (4 fiches par page)', Math.ceil(rows.length / 4)], ['Montant à régler', total, true], ['Dont en retard', items.filter((i) => i.late).length]],
        head: ['Matricule', 'Élève', 'Classe', 'Modalité', 'Échéance(s)', 'Date limite', 'À régler', 'Situation', 'Dette antérieure'],
        money: [6, 8], rows, foot: ['TOTAL', '', '', '', '', '', total, '', items.reduce((sum, i) => sum + i.dette, 0)], empty: 'Aucune échéance n’atteint sa date de rappel à cette date.', rappels: true
      };
    }
    
    function buildReport(state, f) {
      switch (f.type) {
        case 'periodique': return buildPeriodique(state, f, subtitle(state, f, false));
        case 'depenses': return buildDepenses(state, f);
        case 'tresorerie': return buildTresorerie(state, f);
        case 'classes': return buildClasses(state, f);
        case 'retards': return buildRetards(state, f);
        case 'situation': return buildSituation(state, f);
        case 'echeances': return buildEcheances(state, f);
        case 'rappels': return buildRappels(state, f);
        default: return buildJournalier(state, f);
      }
    }
    
    const sectionsOf = (report) => report.sections || [report];
    
    function cellText(section, index, value, devise) {
      return section.money?.includes(index) ? `${formatMoney(value)} ${devise}` : String(value ?? '');
    }
    
    function kpiText(kpi, devise) {
      return kpi[2] ? `${formatMoney(kpi[1])} ${devise}` : String(kpi[1]);
    }
    
    function tableHtml(section, devise) {
      const body = section.rows.map((r) => `<tr class="${r.cls || ''}">${r.cells.map((c, i) => `<td class="${section.money?.includes(i) ? 'num' : ''}">${escapeHtml(cellText(section, i, c, devise))}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="${section.head.length}">${escapeHtml(section.empty)}</td></tr>`;
      const foot = section.foot && section.rows.length
        ? `<tfoot><tr>${section.foot.map((c, i) => `<td class="${section.money?.includes(i) ? 'num' : ''}">${escapeHtml(cellText(section, i, c, devise))}</td>`).join('')}</tr></tfoot>` : '';
      return `<table><thead><tr>${section.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
    }
    
    function legendHtml(section) {
      return section.legend ? `<ul class="legend inline">${section.legend.map((l) => `<li><i style="background:${l.color}"></i>${escapeHtml(l.name)}</li>`).join('')}</ul>` : '';
    }
    
    function sectionHtml(section, devise, withTitle) {
      return `<div class="r-group">${withTitle ? `<h3 class="r-section">${escapeHtml(section.title)}</h3>` : ''}${legendHtml(section)}${section.chart ? `<div class="r-chart">${section.chart}</div>` : ''}<div class="table-wrap">${tableHtml(section, devise)}</div></div>`;
    }
    
    function renderReportOutput(state, f) {
      const out = document.getElementById('report-output');
      if (!out) return;
      const report = buildReport(state, f);
      const devise = state.config.devise;
      const multi = Boolean(report.sections);
      out.innerHTML = `
        <div class="stats-grid report-kpis">${report.kpis.map((k) => `<article class="stat-card accent-purple"><div><span>${escapeHtml(k[0])}</span><strong>${escapeHtml(kpiText(k, devise))}</strong></div></article>`).join('')}</div>
        <div class="panel">
          <div class="panel-header"><h3>${escapeHtml(report.title)}</h3><span class="meta">${escapeHtml(report.subtitle)}</span></div>
          <div class="form-actions report-actions">
            ${report.rappels ? '<button class="primary-btn small-btn" data-action="report:print-reminders">Imprimer les fiches (4 par page)</button>' : ''}
            <button class="secondary-btn small-btn" data-action="report:pdf">PDF / Imprimer</button>
            <button class="secondary-btn small-btn" data-action="report:excel">Excel</button>
            <button class="secondary-btn small-btn" data-action="report:csv">CSV</button>
          </div>
          ${sectionsOf(report).map((s) => sectionHtml(s, devise, multi)).join('')}
        </div>`;
    }
    
    function renderRapports(state, f) {
      const section = document.getElementById('rapports');
      const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === f.yearId) && (!f.category || c.categorie === f.category));
      const selectedClass = classOf(state, f.classId);
      const dated = ['journalier', 'periodique', 'depenses', 'tresorerie'].includes(f.type);
      const expenseTab = f.type === 'depenses' || f.type === 'tresorerie';
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Comptabilité</span><h2>Rapports et rappels</h2></div></div>
        <div class="panel">
          <div class="report-tabs" role="tablist">
            ${REPORT_TYPES.map((t) => `<button type="button" role="tab" class="tab-btn ${t.id === f.type ? 'active' : ''}" data-report-type="${t.id}">${t.label}</button>`).join('')}
          </div>
          <div class="advanced-search">
            <label>Année scolaire
              <select data-rf="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
            </label>
            <label>Catégorie
              <select data-rf="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${c}" ${c === f.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
            </label>
            <label>Classe (tapez pour filtrer)
              <input type="search" data-rf="classe" list="rf-classes" placeholder="Toutes les classes" value="${escapeHtml(selectedClass?.nom || '')}" autocomplete="off" />
              <datalist id="rf-classes">${classes.map((c) => `<option value="${escapeHtml(c.nom)}"></option>`).join('')}</datalist>
            </label>
            <label>Élève / matricule <input type="search" data-rf="search" placeholder="Nom ou IBK-…" value="${escapeHtml(f.search)}" autocomplete="off" /></label>
            <label ${expenseTab ? '' : 'hidden'}>Catégorie de dépense
              <select data-rf="categorieDepense"><option value="">Toutes</option>${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}" ${c === f.categorieDepense ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
            </label>
            <label ${f.type === 'depenses' ? '' : 'hidden'}>Demandeur <input type="search" data-rf="demandeur" value="${escapeHtml(f.demandeur)}" autocomplete="off" /></label>
            <label ${f.type === 'rappels' ? '' : 'hidden'}>Date de référence <input type="date" data-rf="dateRef" value="${escapeHtml(f.dateRef || todayISO())}" /></label>
            <label ${f.type === 'periodique' || f.type === 'tresorerie' ? '' : 'hidden'}>Périodicité
              <select data-rf="gran">${GRANULARITES.map((g) => `<option value="${g.id}" ${g.id === f.gran ? 'selected' : ''}>${g.label}</option>`).join('')}</select>
            </label>
            <label ${dated ? '' : 'hidden'}>Du <input type="date" data-rf="from" value="${escapeHtml(f.from)}" /></label>
            <label ${dated ? '' : 'hidden'}>Au <input type="date" data-rf="to" value="${escapeHtml(f.to)}" /></label>
          </div>
        </div>
        <div id="report-output"></div>`;
      renderReportOutput(state, f);
    }
    
    // Les rapports à plusieurs sections sont exportés l'un sous l'autre, avec l'en-tête de l'établissement
    function exportRows(state, report) {
      const rows = [...enteteLignes(state.config).map((r) => Object.assign(r, { kind: 'entete' })), [], Object.assign([report.title], { kind: 'title' }), [report.subtitle], [`Généré le ${formatDateFr(todayISO())}`], []];
      report.kpis.forEach((k) => rows.push(Object.assign([k[0], k[2] ? `${k[1]} ${state.config.devise}` : k[1]], { kind: 'kpi' })));
      rows.push([]);
      sectionsOf(report).forEach((s) => {
        if (report.sections) rows.push(Object.assign([s.title], { kind: 'section' }));
        rows.push(Object.assign([...s.head], { kind: 'head' }), ...s.rows.map((r) => r.cells));
        if (s.foot && s.rows.length) rows.push(Object.assign([...s.foot], { kind: 'foot' }));
        rows.push([]);
      });
      rows.push([`Fait le ${formatDateFr(todayISO())}`], [], ['La Comptable', '', 'Le Directeur Général']);
      return rows;
    }
    
    function exportReport(state, f, format) {
      const report = buildReport(state, f);
      const rows = exportRows(state, report);
      const name = `rapport-${f.type}-${todayISO()}`;
      if (format === 'csv') downloadCsv(`${name}.csv`, rows);
      else downloadExcel(`${name}.xls`, report.title, rows);
    }
    
    // Pied de page des rapports : date automatique et signatures de la comptable et du directeur général
    function signaturesHtml(config) {
      const city = String(config.adresse || 'Conakry').split(',')[0].trim() || 'Conakry';
      const now = new Date();
      return `<footer class="r-signatures">
        <p class="r-date">Fait à ${escapeHtml(city)}, le <b>${escapeHtml(formatDateFr(todayISO()))}</b> à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
        <div class="r-sign-row"><div><span>La Comptable</span></div><div><span>Le Directeur Général</span></div></div>
        <div class="r-footer">${escapeHtml(config.nom)} — document généré automatiquement</div>
      </footer>`;
    }
    
    function printReport(state, f) {
      const report = buildReport(state, f);
      const c = state.config;
      const multi = Boolean(report.sections);
      const html = `
        ${enteteHtml(c)}
        <div class="r-title"><strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.subtitle)}</span><span>Généré le ${formatDateFr(todayISO())}</span></div>
        <div class="r-kpis">${report.kpis.map((k) => `<div>${escapeHtml(k[0])}<strong>${escapeHtml(kpiText(k, c.devise))}</strong></div>`).join('')}</div>
        ${sectionsOf(report).map((s) => sectionHtml(s, c.devise, multi)).join('')}
        ${signaturesHtml(c)}`;
      const css = `#print-root tr.sub td{background:#f3f4f6;font-weight:bold} #print-root td{font-size:10.5px}
        #print-root .r-kpis{flex-wrap:wrap} #print-root .r-kpis div{min-width:120px}
        #print-root .r-section{margin:14px 0 6px;color:#1e3a8a;font-size:13px;border-left:4px solid #f97316;padding-left:8px}
        #print-root .r-chart{max-width:560px;margin:0 auto 8px} #print-root .chart{width:100%;height:auto}
        #print-root .legend{list-style:none;display:flex;gap:12px;margin:0 0 4px;padding:0;font-size:11px} #print-root .legend i{display:inline-block;width:10px;height:10px;margin-right:4px}
        #print-root .donut-wrap{display:flex;align-items:center;gap:16px;justify-content:center} #print-root .donut-wrap .chart{width:140px}
        #print-root .r-signatures{margin-top:26px;page-break-inside:avoid}
        #print-root .r-date{text-align:right;margin:0 0 8px;font-size:12px}
        #print-root .r-sign-row{display:flex;justify-content:space-between;gap:40px;height:90px;margin:0 30px}
        #print-root .r-sign-row div{flex:1;max-width:260px;text-align:center;border-top:1px solid #111827;padding-top:5px;align-self:flex-end;font-weight:bold;font-size:12px}
        #print-root .r-footer{margin-top:14px;border-top:1px solid #d1d5db;padding-top:6px;font-size:10px;color:#6b7280;text-align:center}`;
      return printDocument({ title: report.title, html, css, page: report.portrait ? 'A4 portrait' : 'A4 landscape' });
    }
    
    // Changement d'onglet : les rapports à période démarrent sur l'année civile en cours, le journalier sur aujourd'hui
    function selectReportType(f, type) {
      const today = todayISO();
      f.type = type;
      if (type === 'journalier') { f.from = today; f.to = today; }
      if (type === 'depenses' || type === 'tresorerie') { f.from = ''; f.to = ''; }
      if (type === 'periodique') { f.from = `${today.slice(0, 4)}-01-01`; f.to = today; }
    }
    
    const REMINDER_CSS = `
      #print-root .rm-page { width: 210mm; height: 296mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; page-break-after: always; }
      #print-root .rm-page:last-child { page-break-after: auto; }
      #print-root .rm-card { box-sizing: border-box; border: 1px dashed #6b7280; padding: 9mm 8mm 6mm; display: flex; flex-direction: column; overflow: hidden; }
      #print-root .rm-head .eh { --eh-fs: 7.4px; padding: 3px 4px; gap: 3px; }
      #print-root .rm-head .eh-logo { width: 5em; height: 5em; }
      #print-root .rm-card h4 { margin: 6px 0; text-align: center; background: #f97316; color: #fff; padding: 4px; border-radius: 4px; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root .rm-card dl { margin: 0; flex: 1; }
      #print-root .rm-card dl div { display: flex; justify-content: space-between; gap: 6px; padding: 3px 0; border-bottom: 1px dotted #9ca3af; font-size: 11px; }
      #print-root .rm-card dt { color: #6b7280; } #print-root .rm-card dd { margin: 0; font-weight: bold; text-align: right; }
      #print-root .rm-due dd { color: #c2410c; font-size: 13px; }
      #print-root .rm-debt dd { color: #b91c1c; }
      #print-root .rm-card dd { max-width: 60%; overflow-wrap: anywhere; }
      #print-root .rm-note { font-size: 9.5px; color: #4b5563; font-style: italic; margin-top: 5px; }
      #print-root .rm-sign { margin-top: 8px; text-align: right; font-size: 10px; }
    `;
    
    function printReminders(state, f) {
      const items = reminderItems(state, f);
      if (!items.length) return false;
      const c = state.config;
      const money = (v) => `${formatMoney(v)} ${escapeHtml(c.devise)}`;
      const card = (item) => {
        const { inscription } = item;
        const s = studentOf(state, inscription);
        return `<article class="rm-card">
          <div class="rm-head">${enteteHtml(c, { compact: true })}</div>
          <h4>FICHE DE RAPPEL DE PAIEMENT</h4>
          <dl>
            <div><dt>Élève</dt><dd>${escapeHtml(studentName(state, inscription))}</dd></div>
            <div><dt>Matricule</dt><dd>${escapeHtml(s?.matricule || '—')}</dd></div>
            <div><dt>Classe · année</dt><dd>${escapeHtml(classOf(state, inscription.classeId)?.nom || '—')} · ${escapeHtml(yearLabel(state, inscription.anneeId))}</dd></div>
            <div><dt>Modalité</dt><dd>${escapeHtml(MODALITES[modaliteActuelle(inscription)] || '—')}</dd></div>
            <div><dt>Échéance(s)</dt><dd>${escapeHtml(item.libelles)}</dd></div>
            <div><dt>À régler avant le</dt><dd>${escapeHtml(formatDateFr(item.dateLimite))}${item.late ? ' (dépassée)' : ''}</dd></div>
            <div class="rm-due"><dt>Montant à régler</dt><dd>${money(item.montant)}</dd></div>
            ${item.dette ? `<div class="rm-debt"><dt>Dette antérieure</dt><dd>${money(item.dette)}</dd></div>` : ''}
            <div><dt>Solde total de l'année</dt><dd>${money(item.totalReste)}</dd></div>
          </dl>
          <p class="rm-note">Prière de régulariser auprès de la comptabilité. Si ce paiement a été effectué, veuillez présenter votre reçu.</p>
          <div class="rm-sign">La comptabilité</div>
        </article>`;
      };
      const pages = [];
      for (let i = 0; i < items.length; i += 4) pages.push(`<div class="rm-page">${items.slice(i, i + 4).map(card).join('')}</div>`);
      return printDocument({ title: 'Fiches de rappel', html: pages.join(''), css: REMINDER_CSS, margin: '0' });
    }
    
    Object.assign(exports, { REPORT_TYPES, defaultReportFilters, reminderItems, buildReport, renderReportOutput, renderRapports, exportReport, printReport, selectReportType, printReminders });
  };
  factories['./modules/rapports-periodiques.js'] = (require, exports) => {
    const { formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { scopeInscriptions, inRange, sumPayments, inscriptionSituation, classOf, yearLabel } = require("./finance.js");
    const { COLORS, MONTHS, lineChart, groupedBars, donut } = require("./charts.js");
    const { paymentAllocations } = require("./allocation.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
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
    const GRANULARITES = [{ id: 'jour', label: 'Journalier' }, { id: 'semaine', label: 'Hebdomadaire' }, { id: 'mois', label: 'Mensuel' }, { id: 'annee', label: 'Annuel' }];
    
    function isoWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
    }
    
    function bucketOf(iso, gran) {
      const [y, m, d] = iso.split('-').map(Number);
      if (gran === 'annee') return { key: String(y), label: String(y) };
      if (gran === 'jour') return { key: iso.slice(0, 10), label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
      if (gran === 'mois') return { key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}` };
      const w = isoWeek(new Date(y, m - 1, d));
      return { key: `${w.year}-S${String(w.week).padStart(2, '0')}`, label: `S${w.week} ${w.year}` };
    }
    
    // Tous les intervalles entre deux dates, y compris ceux sans encaissement
    function buckets(from, to, gran) {
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
    
    function buildPeriodique(state, f, subtitle) {
      const gran = f.gran || 'mois';
      const from = f.from || `${new Date().getFullYear()}-01-01`;
      const to = f.to || todayISO();
      const inscriptions = scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category });
      const byId = new Map(inscriptions.map((i) => [i.id, i]));
      const allPayments = state.paiements.filter((p) => !p.annule && byId.has(p.inscriptionId));
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
        title: `Rapport financier ${GRANULARITES.find((g) => g.id === gran).label.toLowerCase()}`,
        subtitle: `${subtitle} · Période : ${formatDateFr(from)} → ${formatDateFr(to)}`,
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
    
    Object.assign(exports, { GRANULARITES, bucketOf, buckets, buildPeriodique });
  };
  factories['./modules/rapports-compta.js'] = (require, exports) => {
    const { formatMoney, todayISO } = require("./utils.js");
    const { inRange, sumPayments, labelEcheance, studentOf, classOf, echeanceReste } = require("./finance.js");
    const { depensesFiltrees, recettesFiltrees, situationCaisse, somme } = require("./tresorerie.js");
    const { bucketOf, buckets } = require("./rapports-periodiques.js");
    const { echeancierSituation, STATUT_ECHEANCE_LABELS, paymentAllocations, allocationLabel } = require("./allocation.js");
    const { COLORS, groupedBars, donut } = require("./charts.js");
    const { studentName, scoped, pct, subtitle, expenseFilters, expenseSubtitle } = require("./rapports-utils.js");
    const PIE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];
    
    // Recettes et dépenses d'une journée (ou d'une période) avec la synthèse de caisse
    function buildJournalier(state, f) {
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
    function buildDepenses(state, f) {
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
    function buildTresorerie(state, f) {
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
    function buildEcheances(state, f) {
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
    
    Object.assign(exports, { buildJournalier, buildDepenses, buildTresorerie, buildEcheances });
  };
  factories['./modules/rapports-utils.js'] = (require, exports) => {
    const { formatDateFr } = require("./utils.js");
    const { scopeInscriptions, studentOf, yearLabel, classOf } = require("./finance.js");
    function studentName(state, inscription) {
      const s = studentOf(state, inscription);
      return s ? `${s.prenom} ${s.nom}` : '—';
    }
    
    function searchOk(state, inscription, q) {
      if (!q) return true;
      const s = studentOf(state, inscription);
      return `${s?.prenom || ''} ${s?.nom || ''} ${s?.matricule || ''}`.toLocaleLowerCase('fr').includes(q);
    }
    
    // Inscriptions concernées par les filtres année / catégorie / classe / recherche
    function scoped(state, f) {
      const q = String(f.search || '').trim().toLocaleLowerCase('fr');
      return scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category }).filter((i) => searchOk(state, i, q));
    }
    
    const pct = (part, whole) => (whole ? `${Math.round(part / whole * 100)}%` : '—');
    
    function subtitle(state, f, withDates) {
      const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, `Classe : ${f.classId ? classOf(state, f.classId)?.nom : 'toutes'}`];
      if (withDates) parts.push(f.from === f.to ? `Date : ${formatDateFr(f.from)}` : `Période : ${formatDateFr(f.from)} → ${formatDateFr(f.to)}`);
      return parts.join(' · ');
    }
    
    function expenseFilters(f) {
      return { yearId: f.yearId, from: f.from, to: f.to, categorie: f.categorieDepense, demandeur: f.demandeur };
    }
    
    function expenseSubtitle(state, f) {
      const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, f.from || f.to ? `Période : ${f.from ? formatDateFr(f.from) : '…'} → ${f.to ? formatDateFr(f.to) : '…'}` : 'Toute la période'];
      if (f.categorieDepense) parts.push(`Catégorie : ${f.categorieDepense}`);
      if (f.demandeur) parts.push(`Demandeur : ${f.demandeur}`);
      return parts.join(' · ');
    }
    
    Object.assign(exports, { studentName, scoped, pct, subtitle, expenseFilters, expenseSubtitle });
  };
  factories['./modules/rappels.js'] = (require, exports) => {
    const { ordreEcheances, resteEcheance, libelleEcheance, echeancierSituation } = require("./allocation.js");
    const { detteRestante } = require("./reliquats.js");
    const { todayISO } = require("./utils.js");
    // Fiches de rappel : générées à l'approche de chaque échéance configurée (date limite de la tranche ou du mois).
    //  - paiement par tranches (et frais d'inscription) : 14 jours avant la date limite ;
    //  - paiement mensuel : 7 jours avant la date d'échéance.
    // Une échéance dépassée et non soldée reste en rappel jusqu'à son règlement.
    const DELAI_RAPPEL_JOURS = { tranche: 14, mensuel: 7 };
    
    function delaiRappel(echeance) {
      return echeance.mensualite ? DELAI_RAPPEL_JOURS.mensuel : DELAI_RAPPEL_JOURS.tranche;
    }
    
    function joursEntre(fromIso, toIso) {
      return Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000);
    }
    
    function addDays(iso, days) {
      const d = new Date(`${iso}T00:00:00`);
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    
    // Date à partir de laquelle la fiche d'une échéance est générée
    function dateRappel(echeance) {
      return echeance.dateLimite ? addDays(echeance.dateLimite, -delaiRappel(echeance)) : '';
    }
    
    // Libellé compact : au-delà de deux mois consécutifs, « Septembre 2025 → Mai 2026 (9 mois) »
    function resumeEcheances(echeances) {
      const mois = echeances.filter((e) => e.mensualite);
      if (mois.length > 2 && mois.length === echeances.length) return `${libelleEcheance(mois[0])} → ${libelleEcheance(mois[mois.length - 1])} (${mois.length} mois)`;
      if (mois.length > 2) {
        const autres = echeances.filter((e) => !e.mensualite).map(libelleEcheance);
        return [...autres, `${libelleEcheance(mois[0])} → ${libelleEcheance(mois[mois.length - 1])} (${mois.length} mois)`].join(' + ');
      }
      return echeances.map(libelleEcheance).join(' + ');
    }
    
    // Une fiche par élève : échéances non soldées dont la date de rappel est atteinte à la date de référence
    function rappelsDus(state, inscriptions, dateRef = todayISO()) {
      return inscriptions.map((inscription) => {
        const dues = ordreEcheances(inscription).filter((e) => resteEcheance(e) > 0 && e.dateLimite && dateRappel(e) <= dateRef);
        if (!dues.length) return null;
        const echeance = dues[0];
        const late = dues.some((e) => e.dateLimite < dateRef);
        return {
          inscription, echeance, echeances: dues, late,
          montant: dues.reduce((s, e) => s + resteEcheance(e), 0),
          libelles: resumeEcheances(dues),
          jours: joursEntre(dateRef, echeance.dateLimite),
          dateLimite: dues[dues.length - 1].dateLimite,
          totalReste: echeancierSituation(inscription).reste,
          dette: detteRestante(state, inscription.eleveId, inscription.id)
        };
      }).filter(Boolean).sort((a, b) => Number(b.late) - Number(a.late) || String(a.echeance.dateLimite).localeCompare(String(b.echeance.dateLimite)));
    }
    
    Object.assign(exports, { DELAI_RAPPEL_JOURS, delaiRappel, joursEntre, addDays, dateRappel, resumeEcheances, rappelsDus });
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
          <div class="table-wrap"><table>
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
  factories['./modules/recus.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, numberToFrench, todayISO } = require("./utils.js");
    const { classOf, studentOf, yearLabel } = require("./finance.js");
    const { paymentAllocations, ordreEcheances, echeanceDu, allocationLabel, echeancierSituation, STATUT_ECHEANCE_LABELS } = require("./allocation.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
    const { ensureReceiptNumber } = require("./paiements.js");
    const { printDocument } = require("./print.js");
    const { enteteHtml } = require("./entete.js");
    const MODES = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte' };
    
    function capitalize(text) {
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }
    
    function amountInWords(amount, devise) {
      const n = Math.floor(Number(amount) || 0);
      const unit = devise === 'GNF' ? `franc${n > 1 ? 's' : ''} guinéen${n > 1 ? 's' : ''}` : devise;
      return `${capitalize(numberToFrench(n))} ${unit}`;
    }
    
    // État de chaque échéance en ne comptant que les paiements VALIDÉS jusqu'au paiement donné (inclus).
    // Sans paiement de référence : situation actuelle (tous les paiements validés).
    function progressionAt(state, inscription, payment = null) {
      const paid = new Map();
      state.paiements
        .filter((p) => !p.annule && p.inscriptionId === inscription.id && (!payment || p.id <= payment.id))
        .forEach((p) => paymentAllocations(p).forEach((a) => paid.set(a.echeanceId, (paid.get(a.echeanceId) || 0) + Number(a.montant || 0))));
      let currentFound = false;
      const lignes = ordreEcheances(inscription).map((e) => {
        const du = echeanceDu(e);
        const paye = Math.min(paid.get(e.id) || 0, du);
        const frais = e.type === 'frais';
        let etat = 'restant';
        if (paye >= du) etat = 'regle';
        else if (!currentFound && !frais) { etat = 'encours'; currentFound = true; }
        return { echeance: e, libelle: e.libelle || `Tranche ${e.trancheId}`, du, paye, reste: du - paye, etat, frais, taux: du ? Math.round(paye / du * 100) : 100 };
      });
      const total = lignes.reduce((s, l) => s + l.du, 0);
      const cumul = lignes.reduce((s, l) => s + l.paye, 0);
      const count = (etat) => lignes.filter((l) => !l.frais && l.etat === etat).length;
      const frais = lignes.find((l) => l.frais) || null;
      return { lignes, total, cumul, reste: Math.max(total - cumul, 0), taux: total ? Math.round(cumul / total * 100) : 0, regles: count('regle'), encours: count('encours'), restants: count('restant'), frais };
    }
    
    // Période couverte par un paiement : « Octobre 2025 → Décembre 2025 (3 mois) » ou « 1ère tranche + 2ème tranche »
    function periodeConcernee(inscription, payment, modalite) {
      const labels = paymentAllocations(payment).map((a) => allocationLabel(inscription, a));
      if (!labels.length) return '—';
      if (modalite === 'mensuel' && labels.length > 1) return `${labels[0]} → ${labels[labels.length - 1]} (${labels.length} mois)`;
      return labels.join(' + ');
    }
    
    function buildReceiptData(state, payment) {
      const inscription = state.inscriptions.find((i) => i.id === payment.inscriptionId);
      const student = studentOf(state, inscription);
      const classe = classOf(state, inscription?.classeId);
      // La modalité peut avoir changé depuis : le reçu suit l'échéancier actuel (la répartition a été réimputée)
      const modalite = (inscription ? modaliteActuelle(inscription) : null) || payment.modalite || 'tranches';
      const reimpute = Boolean(payment.modalite && payment.modalite !== modalite);
      const progression = progressionAt(state, inscription || { id: 0, echeances: [] }, payment);
      return {
        numero: payment.numeroRecu,
        date: payment.datePaiement,
        payeur: payment.payeur || '',
        eleve: student ? `${student.prenom} ${student.nom}` : '—',
        matricule: student?.matricule || '—',
        classe: classe?.nom || '—',
        categorie: classe?.categorie || '',
        annee: yearLabel(state, payment.anneeId || inscription?.anneeId),
        montant: Number(payment.montant || 0),
        moyen: MODES[payment.mode] || payment.mode || '',
        modalite,
        periode: inscription ? periodeConcernee(inscription, payment, modalite) : '—',
        reference: payment.reference && payment.reference !== payment.numeroRecu ? payment.reference : '',
        motif: payment.motifPaiement || 'Frais de scolarité',
        caissier: payment.caissier || '',
        progression,
        reimpute,
        dette: payment.reliquatId ? { origine: yearLabel(state, payment.anneeId), encaissement: yearLabel(state, payment.anneeEncaissementId) } : null,
        cumulAnnee: progression.cumul,
        soldeAnnee: progression.reste,
        totalAnnee: progression.total
      };
    }
    
    // Barre de progression segmentée : une case par mois ou par tranche (réglé / en cours / restant)
    function progressBarHtml(progression, modalite) {
      const unit = modalite === 'mensuel' ? ['mois', 'mois'] : ['tranche', 'tranches'];
      const word = (n) => `${n} ${n > 1 ? unit[1] : unit[0]}`;
      const segments = progression.lignes.filter((l) => !l.frais).map((l) => `<span class="rc-seg ${l.etat}" title="${escapeHtml(l.libelle)} : ${formatMoney(l.paye)} / ${formatMoney(l.du)}"><i style="width:${l.taux}%"></i></span>`).join('');
      return `<div class="rc-progress">
          <div class="rc-progress-head"><b>État du règlement</b><span>${progression.taux} % réglé</span></div>
          <div class="rc-segments" role="img" aria-label="${progression.regles} réglé(s), ${progression.encours} en cours, ${progression.restants} restant(s)">${segments}</div>
          <div class="rc-legend"><span><i class="regle"></i>${word(progression.regles)} ${progression.regles > 1 ? 'réglés' : 'réglé'}</span><span><i class="encours"></i>${word(progression.encours)} en cours</span><span><i class="restant"></i>${word(progression.restants)} ${progression.restants > 1 ? 'restants' : 'restant'}</span>${progression.frais ? `<span>${escapeHtml(progression.frais.libelle)} : ${progression.frais.reste ? `reste ${formatMoney(progression.frais.reste)}` : 'réglés'}</span>` : ''}</div>
        </div>`;
    }
    
    function receiptCopyHtml(config, d) {
      const devise = escapeHtml(config.devise);
      return `<section class="rc-copy">
        ${enteteHtml(config, { compact: true })}
        <div class="rc-titlebar"><h2>${d.dette ? 'Reçu — dette antérieure' : 'Reçu de paiement'}</h2><div><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}</span></div></div>
        <div class="rc-columns">
          <div class="rc-box">
            <h3>Élève</h3>
            <p class="rc-name">${escapeHtml(d.eleve)}</p>
            <p><b>Matricule : ${escapeHtml(d.matricule)}</b></p>
            <p><b>Classe : <span class="rc-upper">${escapeHtml(d.classe)}</span></b>${d.categorie ? ` <span class="rc-muted">(${escapeHtml(d.categorie)})</span>` : ''}</p>
            <p>Année scolaire : ${escapeHtml(d.annee)}</p>
            ${d.payeur ? `<p>Payé par : ${escapeHtml(d.payeur)}</p>` : ''}
          </div>
          <div class="rc-box">
            <h3>Paiement</h3>
            <p class="rc-amount">${formatMoney(d.montant)} ${devise}</p>
            <p class="rc-words">${escapeHtml(amountInWords(d.montant, config.devise))}</p>
            <p>Moyen : <b>${escapeHtml(d.moyen)}</b>${d.reference ? ` · Réf. ${escapeHtml(d.reference)}` : ''}</p>
            ${d.dette ? `<p>Dette de l’année <b>${escapeHtml(d.dette.origine)}</b> · encaissée en ${escapeHtml(d.dette.encaissement)}</p>` : `<p>Modalité : <b>${escapeHtml(MODALITES[d.modalite] || '')}</b>${d.reimpute ? ' <span class="rc-muted">(réimputé après changement)</span>' : ''}</p>`}
            <p>Période concernée : <b>${escapeHtml(d.periode)}</b></p>
          </div>
        </div>
        ${progressBarHtml(d.progression, d.modalite)}
        <div class="rc-totals">
          <div><span>Total de la scolarité</span><b>${formatMoney(d.progression.total)} ${devise}</b></div>
          <div><span>Cumul payé</span><b>${formatMoney(d.progression.cumul)} ${devise}</b></div>
          <div class="rc-due"><span>Reste à payer</span><b>${formatMoney(d.progression.reste)} ${devise}</b></div>
        </div>
        <div class="rc-sign"><div>Le parent / mandataire</div><div>Le caissier${d.caissier ? ` : ${escapeHtml(d.caissier)}` : ''}</div></div>
        <footer class="rc-foot">${escapeHtml(d.motif)} — paiements uniquement auprès de la comptabilité. Situation calculée sur les paiements validés.</footer>
      </section>`;
    }
    
    // Styles communs à l'aperçu écran et à l'impression (préfixe .rc-doc : aucun effet sur le reste de l'application)
    const RECEIPT_CSS = `
      .rc-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
      .rc-doc .rc-sheet { width: 210mm; height: 296mm; display: flex; flex-direction: column; background: #fff; }
      .rc-doc .rc-copy { flex: 0 0 148mm; height: 148mm; box-sizing: border-box; padding: 5mm 10mm 4mm; overflow: hidden; display: flex; flex-direction: column; gap: 3mm; background: #fff; }
      .rc-doc .rc-copy + .rc-copy { border-top: 1.5px dashed #6b7280; position: relative; }
      .rc-doc .rc-copy + .rc-copy::before { content: '✂  découper ici'; position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 8px; font-size: 9px; color: #6b7280; }
      .rc-doc .rc-copy .eh { --eh-fs: 9px; padding: 4px 8px; }
      .rc-doc .rc-copy .eh-logo { width: 6.4em; height: 6.4em; object-fit: contain; }
      .rc-doc .rc-titlebar { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #7c3aed; color: #fff; border-radius: 4px; padding: 4px 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rc-doc .rc-titlebar h2 { margin: 0; font-size: 14px; letter-spacing: .8px; text-transform: uppercase; color: #fff; }
      .rc-doc .rc-titlebar div { display: flex; gap: 14px; align-items: baseline; font-size: 11px; }
      .rc-doc .rc-titlebar b { font-size: 13px; }
      .rc-doc .rc-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
      .rc-doc .rc-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 3.5mm; min-width: 0; }
      .rc-doc .rc-box h3 { margin: 0 0 1mm; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
      .rc-doc .rc-box p { margin: 0 0 1mm; overflow-wrap: anywhere; }
      .rc-doc .rc-name { font-size: 14px; font-weight: 700; }
      .rc-doc .rc-upper { text-transform: uppercase; }
      .rc-doc .rc-muted { color: #6b7280; font-weight: 400; }
      .rc-doc .rc-amount { font-size: 20px; font-weight: 800; color: #c2410c; }
      .rc-doc .rc-words { font-style: italic; color: #374151; font-size: 9.5px; }
      .rc-doc .rc-progress-head { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1mm; }
      .rc-doc .rc-segments { display: flex; gap: 2px; height: 11px; }
      .rc-doc .rc-seg { flex: 1; background: #e5e7eb; border-radius: 2px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rc-doc .rc-seg i { display: block; height: 100%; background: #f97316; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rc-doc .rc-seg.regle i { background: #16a34a; }
      .rc-doc .rc-seg.encours { box-shadow: inset 0 0 0 1.5px #f97316; }
      .rc-doc .rc-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 1mm; font-size: 9.5px; }
      .rc-doc .rc-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rc-doc .rc-legend i.regle { background: #16a34a; }
      .rc-doc .rc-legend i.encours { background: #f97316; }
      .rc-doc .rc-legend i.restant { background: #e5e7eb; border: 1px solid #9ca3af; box-sizing: border-box; }
      .rc-doc .rc-totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
      .rc-doc .rc-totals div { border: 1px solid #e9d5ff; background: #faf5ff; border-radius: 4px; padding: 2.2mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rc-doc .rc-totals span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
      .rc-doc .rc-totals b { font-size: 14px; }
      .rc-doc .rc-totals .rc-due { border-color: #fdba74; background: #fff7ed; }
      .rc-doc .rc-totals .rc-due b { color: #c2410c; }
      .rc-doc .rc-sign { display: flex; justify-content: space-between; margin: auto 8mm 0; height: 18mm; font-size: 10.5px; }
      .rc-doc .rc-sign div { width: 62mm; text-align: center; border-top: 1px solid #111827; padding-top: 2px; align-self: flex-end; }
      .rc-doc .rc-foot { text-align: center; font-size: 8.5px; font-style: italic; color: #4b5563; }
    `;
    
    function receiptHtml(state, payment, copies = 2) {
      const data = buildReceiptData(state, payment);
      const copy = receiptCopyHtml(state.config, data);
      return { data, html: `<div class="rc-doc"><div class="rc-sheet">${Array.from({ length: copies }, () => copy).join('')}</div></div>` };
    }
    
    // Retourne false si le paiement est introuvable/annulé. Peut attribuer un numéro à un ancien paiement
    // qui n'en avait pas : l'appelant doit alors sauvegarder l'état (le numéro ne change plus ensuite).
    function printReceipt(state, paymentId) {
      const payment = state.paiements.find((p) => p.id === Number(paymentId));
      if (!payment || payment.annule) return false;
      ensureReceiptNumber(state, payment);
      const { data, html } = receiptHtml(state, payment);
      return printDocument({ title: `Reçu ${data.numero}`, html, css: RECEIPT_CSS, margin: '0' });
    }
    
    // ── Facture de scolarité : calculée à partir du tarif, de la modalité et des paiements validés ──
    function invoiceNumber(state, inscription) {
      return `FAC-${String(yearLabel(state, inscription.anneeId)).replace(/[^0-9-]/g, '')}-${String(inscription.id).padStart(5, '0')}`;
    }
    
    const INVOICE_CSS = `
      .iv-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
      .iv-doc .iv-head { display: flex; justify-content: space-between; align-items: center; margin: 4mm 0 3mm; padding: 2.5mm 4mm; background: #7c3aed; color: #fff; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .iv-doc .iv-head h2 { margin: 0; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; color: #fff; }
      .iv-doc .iv-head div { text-align: right; }
      .iv-doc .iv-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
      .iv-doc .iv-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 4mm; }
      .iv-doc .iv-box h3 { margin: 0 0 1.5mm; font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
      .iv-doc .iv-box p { margin: 0 0 1mm; }
      .iv-doc h4 { margin: 4mm 0 1.5mm; font-size: 11px; color: #1e3a8a; border-left: 3px solid #f97316; padding-left: 6px; }
      .iv-doc table { width: 100%; border-collapse: collapse; }
      .iv-doc tr { page-break-inside: avoid; }
      #print-root .iv-doc th, #print-root .iv-doc td, .iv-doc th, .iv-doc td { border-bottom: 1px solid #e5e7eb; padding: 3px 6px; text-align: left; font-size: 10.5px; }
      #print-root .iv-doc th, .iv-doc th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root .iv-doc .num, .iv-doc .num { text-align: right; white-space: nowrap; }
      .iv-doc tfoot td { font-weight: 700; background: #faf5ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .iv-doc .iv-note { font-size: 9.5px; color: #4b5563; font-style: italic; margin-top: 3mm; }
      .iv-doc .iv-sign { display: flex; justify-content: space-between; margin: 8mm 10mm 0; height: 16mm; page-break-inside: avoid; }
      .iv-doc .iv-sign div { width: 60mm; text-align: center; border-top: 1px solid #111827; padding-top: 3px; align-self: flex-end; font-weight: 700; }
    `;
    
    function invoiceHtml(state, inscription) {
      const c = state.config;
      const devise = escapeHtml(c.devise);
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const student = studentOf(state, inscription);
      const classe = classOf(state, inscription.classeId);
      const modalite = modaliteActuelle(inscription);
      const situation = echeancierSituation(inscription);
      const progression = progressionAt(state, inscription);
      const payments = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((a, b) => a.id - b.id);
      return `<div class="iv-doc rc-doc">
        ${enteteHtml(c)}
        <div class="iv-head"><h2>Facture de scolarité</h2><div><b>N° ${escapeHtml(invoiceNumber(state, inscription))}</b><br>Émise le ${escapeHtml(formatDateFr(todayISO()))}</div></div>
        <div class="iv-cols">
          <div class="iv-box"><h3>Élève</h3>
            <p class="rc-name">${escapeHtml(student ? `${student.prenom} ${student.nom}` : '—')}</p>
            <p><b>Matricule : ${escapeHtml(student?.matricule || '—')}</b></p>
            <p><b>Classe : <span class="rc-upper">${escapeHtml(classe?.nom || '—')}</span></b>${classe ? ` (${escapeHtml(classe.categorie)})` : ''}</p>
            ${student?.parent ? `<p>Parent / tuteur : ${escapeHtml(student.parent)}</p>` : ''}</div>
          <div class="iv-box"><h3>Scolarité</h3>
            <p>Année scolaire : <b>${escapeHtml(yearLabel(state, inscription.anneeId))}</b></p>
            <p>Modalité : <b>${escapeHtml(inscription.modalite ? MODALITES[modalite] : 'à choisir au premier paiement (échéancier provisoire par tranches)')}</b></p>
            <p>Montant total : <b>${money(situation.total)}</b> · Payé : <b>${money(situation.paye)}</b></p>
            <p>Reste à payer : <b style="color:#c2410c">${money(situation.reste)}</b></p></div>
        </div>
        ${progressBarHtml(progression, modalite)}
        <h4>Échéancier</h4>
        <table><thead><tr><th>Échéance</th><th>Date limite</th><th class="num">Montant dû</th><th class="num">Payé</th><th class="num">Reste</th><th>Statut</th></tr></thead>
          <tbody>${situation.lignes.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td><td>${escapeHtml(formatDateFr(l.echeance.dateLimite))}</td><td class="num">${money(l.du)}</td><td class="num">${money(l.paye)}</td><td class="num">${money(l.reste)}</td><td>${STATUT_ECHEANCE_LABELS[l.statut]}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">TOTAL</td><td class="num">${money(situation.total)}</td><td class="num">${money(situation.paye)}</td><td class="num">${money(situation.reste)}</td><td></td></tr></tfoot></table>
        <h4>Paiements validés</h4>
        <table><thead><tr><th>N° reçu</th><th>Date</th><th>Moyen</th><th>Imputé sur</th><th class="num">Montant</th></tr></thead>
          <tbody>${payments.map((p) => `<tr><td>${escapeHtml(p.numeroRecu || '—')}</td><td>${escapeHtml(formatDateFr(p.datePaiement))}</td><td>${escapeHtml(MODES[p.mode] || p.mode)}</td><td>${escapeHtml(paymentAllocations(p).map((a) => allocationLabel(inscription, a)).join(' + '))}</td><td class="num">${money(p.montant)}</td></tr>`).join('') || '<tr><td colspan="5">Aucun paiement validé.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="4">TOTAL PAYÉ</td><td class="num">${money(payments.reduce((s, p) => s + Number(p.montant || 0), 0))}</td></tr></tfoot></table>
        <p class="iv-note">Document calculé automatiquement à partir du tarif de la classe, de la modalité de règlement et des paiements validés (les paiements annulés ne sont pas pris en compte).</p>
        <div class="iv-sign"><div>La Comptable</div><div>Le Directeur Général</div></div>
      </div>`;
    }
    
    function printInvoice(state, inscriptionId) {
      const inscription = state.inscriptions.find((i) => i.id === Number(inscriptionId));
      if (!inscription || !(inscription.echeances || []).length) return false;
      return printDocument({ title: `Facture ${invoiceNumber(state, inscription)}`, html: invoiceHtml(state, inscription), css: `${RECEIPT_CSS}${INVOICE_CSS}`, margin: '10mm' });
    }
    
    Object.assign(exports, { amountInWords, progressionAt, buildReceiptData, progressBarHtml, RECEIPT_CSS, receiptHtml, printReceipt, invoiceNumber, INVOICE_CSS, invoiceHtml, printInvoice });
  };
  factories['./modules/eleves.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    function generateMatricule(state) {
      const year = new Date().getFullYear();
      const prefix = `IBK-${year}-`;
      const existing = state.eleves
        .map((eleve) => eleve.matricule || '')
        .filter((m) => m.startsWith(prefix))
        .map((m) => parseInt(m.slice(prefix.length), 10))
        .filter((n) => !isNaN(n));
      const next = existing.length ? Math.max(...existing) + 1 : 1;
      return `${prefix}${String(next).padStart(4, '0')}`;
    }
    
    function createEleve(state, payload = {}) {
      const nom = String(payload.nom || '').trim();
      const prenom = String(payload.prenom || '').trim();
      if (!nom || !prenom) return null;
    
      const item = {
        id: nextId(state.eleves),
        matricule: (payload.matricule && String(payload.matricule).trim()) ? String(payload.matricule).trim() : generateMatricule(state),
        nom,
        prenom,
        sexe: payload.sexe || 'M',
        dateNaissance: payload.dateNaissance || '',
        telephone: payload.telephone || '',
        email: payload.email || '',
        parent: payload.parent || '',
        adresse: payload.adresse || '',
        classeId: Number(payload.classeId || 0),
        actif: payload.actif !== false
      };
    
      state.eleves.push(item);
      return item;
    }
    
    function updateEleve(state, id, payload = {}) {
      const item = state.eleves.find((eleve) => eleve.id === Number(id));
      if (!item) return null;
      const nom = String(payload.nom ?? item.nom).trim();
      const prenom = String(payload.prenom ?? item.prenom).trim();
      const matricule = String(payload.matricule || item.matricule).trim();
      if (!nom || !prenom) return null;
      if (state.eleves.some((e) => e.id !== item.id && e.matricule === matricule)) return null;
      const pick = (key) => (payload[key] !== undefined ? payload[key] : item[key]);
    
      Object.assign(item, {
        matricule, nom, prenom,
        sexe: pick('sexe'), dateNaissance: pick('dateNaissance'), telephone: pick('telephone'), email: pick('email'),
        parent: pick('parent'), adresse: pick('adresse'),
        classeId: payload.classeId !== undefined ? Number(payload.classeId || 0) : item.classeId,
        actif: payload.actif !== undefined ? payload.actif : item.actif
      });
    
      return item;
    }
    
    function toggleEleveState(state, id) {
      const item = state.eleves.find((eleve) => eleve.id === Number(id));
      if (!item) return null;
      item.actif = !item.actif;
      return item;
    }
    
    // Refus si un paiement existe pour l'élève : l'historique comptable est conservé.
    function deleteEleve(state, id) {
      const targetId = Number(id);
      const index = state.eleves.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
      const inscriptionIds = state.inscriptions.filter((i) => i.eleveId === targetId).map((i) => i.id);
      if (state.paiements.some((p) => inscriptionIds.includes(p.inscriptionId))) return false;
    
      state.eleves.splice(index, 1);
      state.inscriptions = state.inscriptions.filter((inscription) => inscription.eleveId !== targetId);
      return true;
    }
    
    Object.assign(exports, { createEleve, updateEleve, toggleEleveState, deleteEleve });
  };
  factories['./modules/inscriptions.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { echeancierProvisoire, nextEcheanceId } = require("./modalites.js");
    // Nouvelle inscription ou réinscription : déduit de l'historique de l'élève (inscription dans une autre année)
    function typeInscription(state, eleveId, anneeId) {
      return state.inscriptions.some((i) => i.eleveId === Number(eleveId) && i.anneeId !== Number(anneeId)) ? 'reinscription' : 'nouvelle';
    }
    
    // Frais d'inscription ou de réinscription de l'année concernée : une échéance unique, créée une seule fois
    // (aucun doublon possible), au montant configuré pour l'année au moment de l'inscription.
    function ajouterFraisInscription(state, inscription) {
      if ((inscription.echeances || []).some((e) => e.type === 'frais')) return null;
      const annee = state.annees.find((a) => a.id === inscription.anneeId);
      const reinscription = inscription.type === 'reinscription';
      const montant = Number((reinscription ? annee?.fraisReinscription : annee?.fraisInscription) || 0);
      if (montant <= 0) return null;
      const echeance = {
        id: nextEcheanceId(state, inscription), type: 'frais', trancheId: 0, montant, montantPaye: 0, remise: 0, statut: 'impayee',
        dateLimite: inscription.dateInscription, libelle: reinscription ? 'Frais de réinscription' : 'Frais d’inscription'
      };
      inscription.echeances = [echeance, ...(inscription.echeances || [])];
      return echeance;
    }
    
    function createInscription(state, payload = {}) {
      const eleveId = Number(payload.eleveId || 0);
      const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
      const classeId = Number(payload.classeId || 0);
    
      if (!eleveId || !classeId || !anneeId) return null;
      // Un élève ne peut être inscrit qu'une fois par année scolaire
      if (state.inscriptions.some((i) => i.eleveId === eleveId && i.anneeId === anneeId)) return null;
    
      const item = {
        id: nextId(state.inscriptions),
        eleveId,
        anneeId,
        classeId,
        type: payload.type === 'nouvelle' || payload.type === 'reinscription' ? payload.type : typeInscription(state, eleveId, anneeId),
        statut: payload.statut || 'inscrit',
        dateInscription: payload.dateInscription || new Date().toISOString().slice(0, 10),
        modalite: null,
        echeances: []
      };
    
      state.inscriptions.push(item);
      ajouterFraisInscription(state, item);
      return item;
    }
    
    function updateInscription(state, id, payload = {}) {
      const item = state.inscriptions.find((inscription) => inscription.id === Number(id));
      if (!item) return null;
    
      item.anneeId = Number(payload.anneeId || item.anneeId);
      item.classeId = Number(payload.classeId || item.classeId);
      item.type = payload.type || item.type;
      item.statut = payload.statut || item.statut;
    
      return item;
    }
    
    // Refus si un paiement (même annulé) existe : l'historique comptable est conservé.
    function deleteInscription(state, id, force = false) {
      const targetId = Number(id);
      const index = state.inscriptions.findIndex((inscription) => inscription.id === targetId);
      if (index === -1) return false;
      if (!force && state.paiements.some((p) => p.inscriptionId === targetId)) return false;
    
      state.inscriptions.splice(index, 1);
      return true;
    }
    
    function validerInscription(state, id, role = 'comptable') {
      const item = state.inscriptions.find((inscription) => inscription.id === Number(id));
      if (!item || item.validee) return null;
      item.validee = true;
      item.dateValidation = new Date().toISOString().slice(0, 10);
      item.validePar = role;
      return item;
    }
    
    // L'inscription ne fixe plus la modalité de règlement : elle crée seulement un échéancier provisoire par tranches
    // (montants attendus et retards visibles). Le choix mensuel / tranches se fait au premier paiement.
    function generateEcheancesForInscription(state, inscriptionId, tarif) {
      const inscription = state.inscriptions.find((item) => item.id === Number(inscriptionId));
      if (!inscription) return [];
      echeancierProvisoire(state, inscription, tarif);
      return inscription.echeances;
    }
    
    function reinscrireEleve(state, inscriptionId) {
      const original = state.inscriptions.find((item) => item.id === Number(inscriptionId));
      if (!original) return null;
    
      const nextYear = Number(state.anneeActiveId || original.anneeId || 1);
      if (state.inscriptions.some((i) => i.eleveId === original.eleveId && i.anneeId === nextYear)) return null;
      const duplicate = {
        ...original,
        id: nextId(state.inscriptions),
        anneeId: nextYear,
        type: 'reinscription',
        statut: 'inscrit',
        dateInscription: new Date().toISOString().slice(0, 10),
        validee: false,
        dateValidation: '',
        validePar: '',
        modalite: null,
        echeances: []
      };
    
      state.inscriptions.push(duplicate);
      ajouterFraisInscription(state, duplicate);
    
      const tarif = state.tarifs.find((item) => item.classeId === duplicate.classeId && item.anneeId === duplicate.anneeId);
      if (tarif) {
        generateEcheancesForInscription(state, duplicate.id, tarif);
      }
    
      return duplicate;
    }
    
    Object.assign(exports, { typeInscription, ajouterFraisInscription, createInscription, updateInscription, deleteInscription, validerInscription, generateEcheancesForInscription, reinscrireEleve });
  };
  factories['./modules/tarifs.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { buildEcheances, hasValidPayments, modalitesDisponibles, modaliteActuelle, echeancierProvisoire, fraisEcheances } = require("./modalites.js");
    // Montant mensuel proposé : montant annuel réparti sur le nombre de mois, arrondi au franc supérieur
    function autoMontantMensuel(total, nbMois) {
      const months = Math.min(Math.max(Number(nbMois || 0), 1), 12);
      return Math.ceil(Number(total || 0) / months);
    }
    
    function mensuelFields(payload, fallback = {}) {
      return {
        montantMensuel: Math.max(Math.floor(Number(payload.montantMensuel ?? fallback.montantMensuel ?? 0)), 0),
        nbMois: Math.min(Math.max(Number(payload.nbMois || fallback.nbMois || 9), 1), 12),
        moisDebut: payload.moisDebut !== undefined ? payload.moisDebut : (fallback.moisDebut || '')
      };
    }
    
    function addMonthsIso(iso, count) {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1 + count, 1);
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(d || 1, last));
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    
    // Échéances par défaut : 1 mois après la rentrée, puis tous les tiers de l'année scolaire (plafonnées à la fin d'année).
    function autoTrancheDates(annee) {
      if (!annee || !annee.dateDebut) return ['', '', ''];
      const fin = annee.dateFin || '';
      const span = fin ? Math.max(Math.round((new Date(fin) - new Date(annee.dateDebut)) / (30.44 * 86400000)), 3) : 9;
      const step = Math.floor(span / 3);
      return [0, 1, 2].map((k) => {
        const due = addMonthsIso(annee.dateDebut, 1 + k * step);
        return fin && due > fin ? fin : due;
      });
    }
    
    // Répartition automatique : tiers égaux, le reliquat va à la dernière tranche.
    function autoTrancheMontants(total) {
      const base = Math.floor(Number(total || 0) / 3);
      return [base, base, Number(total || 0) - 2 * base];
    }
    
    function autoTranches(state, anneeId, montantAnnuel) {
      const annee = state.annees.find((a) => a.id === Number(anneeId));
      const dates = autoTrancheDates(annee);
      const montants = autoTrancheMontants(montantAnnuel);
      return [1, 2, 3].map((num, i) => ({ num, libelle: `${num === 1 ? '1ère' : num + 'ème'} tranche`, montant: montants[i], dateLimite: dates[i] }));
    }
    
    function normalizeTranches(payload = []) {
      const source = Array.isArray(payload) && payload.length ? payload : [
        { num: 1, libelle: '1ère tranche', montant: 0, dateLimite: '' },
        { num: 2, libelle: '2ème tranche', montant: 0, dateLimite: '' },
        { num: 3, libelle: '3ème tranche', montant: 0, dateLimite: '' }
      ];
    
      return source.map((tranche, index) => ({
        id: tranche.id || index + 1,
        num: Number(tranche.num || index + 1),
        libelle: tranche.libelle || `Tranche ${index + 1}`,
        montant: Number(tranche.montant || 0),
        dateLimite: tranche.dateLimite || ''
      }));
    }
    
    function createTarif(state, payload = {}) {
      const classeId = Number(payload.classeId || 0);
      const anneeId = Number(payload.anneeId || state.anneeActiveId || 1);
      if (!classeId || !anneeId) return null;
    
      const existingIndex = state.tarifs.findIndex((item) => item.classeId === classeId && item.anneeId === anneeId);
      const baseMontant = Number(payload.montantAnnuel || 0);
      const auto = autoTranches(state, anneeId, baseMontant);
      const given = Array.isArray(payload.tranches) && payload.tranches.length ? payload.tranches : auto;
      const tranches = normalizeTranches(given.map((tranche, index) => ({ ...tranche, dateLimite: tranche.dateLimite || auto[index]?.dateLimite || '' })));
    
      const item = {
        id: existingIndex >= 0 ? state.tarifs[existingIndex].id : nextId(state.tarifs),
        classeId,
        anneeId,
        montantAnnuel: baseMontant,
        tranches,
        ...mensuelFields(payload),
        actif: true
      };
    
      if (existingIndex >= 0) {
        state.tarifs[existingIndex] = item;
        return item;
      }
    
      state.tarifs.push(item);
      return item;
    }
    
    function updateTarif(state, id, payload = {}) {
      const item = state.tarifs.find((tarif) => tarif.id === Number(id));
      if (!item) return null;
    
      item.classeId = Number(payload.classeId || item.classeId);
      item.anneeId = Number(payload.anneeId || item.anneeId);
      item.montantAnnuel = Number(payload.montantAnnuel || item.montantAnnuel || 0);
      item.tranches = normalizeTranches(payload.tranches || item.tranches || []);
      item.actif = payload.actif !== undefined ? payload.actif : item.actif;
      Object.assign(item, mensuelFields(payload, item));
      delete item.mensuel;
    
      return item;
    }
    
    function duplicateTarif(state, id) {
      const existing = state.tarifs.find((item) => item.id === Number(id));
      if (!existing) return null;
    
      const nextYear = Number(state.anneeActiveId || existing.anneeId || 1);
      const item = {
        ...existing,
        id: nextId(state.tarifs),
        anneeId: nextYear,
        tranches: existing.tranches.map((tranche) => ({ ...tranche, id: Number(tranche.id || 1) }))
      };
    
      state.tarifs.push(item);
      return item;
    }
    
    function deleteTarif(state, id) {
      const targetId = Number(id);
      const index = state.tarifs.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
    
      state.tarifs.splice(index, 1);
      return true;
    }
    
    // Répercute un tarif (créé ou modifié) sur les inscriptions de sa classe et de son année :
    //  - sans paiement valide : l'échéancier est reconstruit dans sa modalité (ou provisoire « tranches » si non choisie) ;
    //  - avec paiements : on met à jour les dates (tranches) et les montants des échéances encore non payées.
    function propagateTarif(state, tarif) {
      let touched = 0;
      const dispo = modalitesDisponibles(tarif);
      state.inscriptions.filter((i) => i.classeId === tarif.classeId && i.anneeId === tarif.anneeId).forEach((inscription) => {
        const modalite = modaliteActuelle(inscription);
        if (!hasValidPayments(state, inscription)) {
          if (inscription.modalite && dispo[inscription.modalite]) inscription.echeances = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, inscription.modalite)];
          else echeancierProvisoire(state, inscription, tarif);
          touched += 1;
          return;
        }
        (inscription.echeances || []).filter((e) => e.type !== 'frais').forEach((echeance) => {
          const unpaid = !Number(echeance.montantPaye || 0);
          if (modalite === 'mensuel') {
            if (unpaid && dispo.mensuel && Number(echeance.montant) !== Number(tarif.montantMensuel)) { echeance.montant = Number(tarif.montantMensuel); touched += 1; }
            return;
          }
          const tranche = tarif.tranches.find((tr) => tr.num === echeance.trancheId);
          if (!tranche) return;
          if (echeance.dateLimite !== tranche.dateLimite) { echeance.dateLimite = tranche.dateLimite; touched += 1; }
          if (unpaid && Number(echeance.montant) !== Number(tranche.montant)) { echeance.montant = Number(tranche.montant); touched += 1; }
        });
      });
      return touched;
    }
    
    Object.assign(exports, { autoMontantMensuel, autoTrancheDates, autoTrancheMontants, autoTranches, createTarif, updateTarif, duplicateTarif, deleteTarif, propagateTarif });
  };
  factories['./modules/details.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { inscriptionSituation, STATUT_LABELS, studentOf, yearLabel, classOf, labelEcheance, scopeInscriptions } = require("./finance.js");
    const { buildReceiptData, receiptHtml, RECEIPT_CSS } = require("./recus.js");
    const { ensureReceiptNumber } = require("./paiements.js");
    const { paymentAllocations, allocationLabel } = require("./allocation.js");
    function modal(title, subtitle, body) {
      const root = document.getElementById('modal-root');
      if (!root) return false;
      root.innerHTML = `<div class="modal-backdrop" data-modal-close>
        <section class="student-modal" role="dialog" aria-modal="true">
          <header class="modal-header"><div><span class="eyebrow">Consultation</span><h2>${escapeHtml(title)}</h2><span class="meta">${escapeHtml(subtitle)}</span></div>
          <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>${body}</section></div>`;
      return true;
    }
    
    const money = (state, v) => `${formatMoney(v)} ${escapeHtml(state.config.devise)}`;
    const table = (head, rows, empty) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;
    
    function showClasse(state, id) {
      const c = state.classes.find((x) => x.id === id);
      if (!c) return false;
      const list = state.inscriptions.filter((i) => i.classeId === id);
      const sits = list.map((i) => ({ i, s: inscriptionSituation(state, i) }));
      const due = sits.reduce((a, x) => a + x.s.total, 0); const paid = sits.reduce((a, x) => a + x.s.paye, 0);
      return modal(c.nom, `${c.categorie} · ${yearLabel(state, c.anneeId)}`, `
        <div class="profile-section"><div class="profile-grid">
          <div class="profile-metric"><span>Effectif</span><strong>${list.length} / ${c.capacite}</strong></div>
          <div class="profile-metric"><span>Frais attendus</span><strong>${money(state, due)}</strong></div>
          <div class="profile-metric"><span>Encaissé</span><strong>${money(state, paid)}</strong></div>
          <div class="profile-metric"><span>Recouvrement</span><strong>${due ? Math.round(paid / due * 100) : 0}%</strong></div></div></div>
        <div class="profile-section"><h3>Élèves de la classe</h3>${table(['Matricule', 'Élève', 'Payé', 'Reste', 'Situation'],
          sits.map(({ i, s }) => { const e = studentOf(state, i); return `<tr><td>${escapeHtml(e?.matricule || '—')}</td><td>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')}</td><td>${money(state, s.paye)}</td><td>${money(state, s.reste)}</td><td>${STATUT_LABELS[s.statut]}</td></tr>`; }), 'Aucun élève inscrit.')}</div>`);
    }
    
    function showTarif(state, id) {
      const t = state.tarifs.find((x) => x.id === id);
      if (!t) return false;
      const nb = state.inscriptions.filter((i) => i.classeId === t.classeId && i.anneeId === t.anneeId).length;
      return modal(`Frais — ${classOf(state, t.classeId)?.nom || '—'}`, `${yearLabel(state, t.anneeId)} · ${nb} élève(s) concerné(s)`, `
        <div class="profile-section"><div class="profile-metric"><span>Montant annuel</span><strong>${money(state, t.montantAnnuel)}</strong></div>
        <p class="meta">${Number(t.montantMensuel) > 0 ? `Paiement mensuel : ${t.nbMois} × ${money(state, t.montantMensuel)} = ${money(state, t.montantMensuel * t.nbMois)}${t.moisDebut ? `, 1ère mensualité le ${escapeHtml(formatDateFr(t.moisDebut))}` : ''}.` : 'Paiement mensuel non proposé pour cette classe.'}</p>
        <h3>Tranches</h3>${table(['Tranche', 'Montant', 'Date d’échéance'], (t.tranches || []).map((tr) => `<tr><td>${escapeHtml(tr.libelle)}</td><td>${money(state, tr.montant)}</td><td>${escapeHtml(formatDateFr(tr.dateLimite))}</td></tr>`), 'Aucune tranche.')}</div>`);
    }
    
    function showAnnee(state, id) {
      const a = state.annees.find((x) => x.id === id);
      if (!a) return false;
      const list = scopeInscriptions(state, { yearId: id });
      const sits = list.map((i) => inscriptionSituation(state, i));
      const due = sits.reduce((s, x) => s + x.total, 0); const paid = sits.reduce((s, x) => s + x.paye, 0);
      return modal(`Année ${a.annee}`, `${formatDateFr(a.dateDebut)} → ${formatDateFr(a.dateFin)} · ${a.statut}`, `
        <div class="profile-section"><div class="profile-grid">
          <div class="profile-metric"><span>Classes</span><strong>${state.classes.filter((c) => c.anneeId === id).length}</strong></div>
          <div class="profile-metric"><span>Inscriptions</span><strong>${list.length}</strong></div>
          <div class="profile-metric"><span>Attendu / encaissé</span><strong>${money(state, due)} / ${money(state, paid)}</strong></div>
          <div class="profile-metric"><span>Recouvrement</span><strong>${due ? Math.round(paid / due * 100) : 0}%</strong></div></div></div>`);
    }
    
    function showPaiement(state, id) {
      const p = state.paiements.find((x) => x.id === id);
      if (!p) return false;
      const d = p.numeroRecu ? buildReceiptData(state, p) : null;
      const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
      const e = studentOf(state, inscription);
      const imputation = paymentAllocations(p).map((a) => `${allocationLabel(inscription, a)} : ${money(state, a.montant)}`).join(' · ');
      return modal(`Paiement ${p.numeroRecu || `#${p.id}`}`, p.annule ? 'ANNULÉ' : 'Validé', `
        <div class="profile-section"><dl class="detail-list">
          <dt>Élève</dt><dd>${escapeHtml(e ? `${e.prenom} ${e.nom}` : '—')} (${escapeHtml(e?.matricule || '—')})</dd>
          <dt>Classe / année</dt><dd>${escapeHtml(classOf(state, inscription?.classeId)?.nom || '—')} · ${escapeHtml(yearLabel(state, inscription?.anneeId))}</dd>
          <dt>Imputation</dt><dd>${escapeHtml(imputation || '—')}</dd>
          <dt>Montant</dt><dd>${money(state, p.montant)}</dd>
          <dt>Date / mode</dt><dd>${escapeHtml(formatDateFr(p.datePaiement))} · ${escapeHtml(p.mode)}</dd>
          <dt>Référence / caissier</dt><dd>${escapeHtml(p.reference || '—')} · caissier : ${escapeHtml(p.caissier || '—')}${p.utilisateur ? ` · saisi par ${escapeHtml(p.utilisateur)}` : ''}</dd>
          ${d ? `<dt>Cumul payé / solde après paiement</dt><dd>${money(state, d.cumulAnnee)} / ${money(state, d.soldeAnnee)}</dd>` : ''}
          ${p.annule ? `<dt>Annulation</dt><dd>${escapeHtml(p.motif)} (${escapeHtml(formatDateFr(p.dateAnnulation))})</dd>` : ''}
        </dl>${p.annule ? '' : `<div class="form-actions"><button class="primary-btn small-btn" data-action="paiement:receipt:${p.id}">Voir le reçu</button></div>`}</div>`);
    }
    
    // Aperçu du reçu à l'écran : même rendu que l'impression (un exemplaire), avec bouton d'impression
    function showReceiptPreview(state, id) {
      const payment = state.paiements.find((p) => p.id === Number(id));
      if (!payment || payment.annule) return false;
      ensureReceiptNumber(state, payment);
      const { data, html } = receiptHtml(state, payment, 1);
      return modal(`Reçu ${data.numero}`, `${data.eleve} · ${formatMoney(data.montant)} ${state.config.devise}`, `
        <style>${RECEIPT_CSS} .receipt-preview .rc-sheet { height: auto; } .receipt-preview .rc-copy { border: 1px solid #e5e7eb; border-radius: 8px; }</style>
        <div class="receipt-preview">${html}</div>
        <div class="form-actions"><button class="primary-btn small-btn" data-action="paiement:print:${payment.id}">Imprimer (2 exemplaires)</button></div>`);
    }
    
    function showDetail(state, kind, id) {
      const n = Number(id);
      if (kind === 'classe') return showClasse(state, n);
      if (kind === 'tarif') return showTarif(state, n);
      if (kind === 'annee') return showAnnee(state, n);
      if (kind === 'paiement') return showPaiement(state, n);
      return false;
    }
    
    Object.assign(exports, { showReceiptPreview, showDetail });
  };
  function require(moduleId) {
    if (cache[moduleId]) return cache[moduleId];
    const factory = factories[moduleId];
    if (!factory) throw new Error(`Module local introuvable : ${moduleId}`);
    const exports = {};
    cache[moduleId] = exports;
    factory((request) => require(pathFor(moduleId, request)), exports);
    return exports;
  }
  function pathFor(importer, request) {
    const parts = importer.split('/').filter((part) => part && part !== '.');
    parts.pop();
    for (const part of request.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return `./${parts.join('/')}`;
  }
  require('./app.js');
})();
