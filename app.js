import { DEFAULT_STATE, loadState, saveState, exportStateToFile, importStateFromFile, resetData } from './storage.js';
import { renderDashboard, renderAnnees, renderClasses, renderEleves, renderInscriptions, renderTarifs, renderPaiements, renderRapports, renderConfig, showToast, showStudentProfile, printPaymentReceipt, exportPaymentsCsv, exportReportCsv, exportStudentsCsv, printReport, printPeriodReport, exportPeriodReportCsv } from './ui.js';
import { createAnnee, updateAnneeStatus, deleteAnnee, setAnneeActive, getAnneeActive } from './modules/annees.js';
import { createClasse, updateClasse, deleteClasse } from './modules/classes.js';
import { createEleve, updateEleve, toggleEleveState, deleteEleve } from './modules/eleves.js';
import { createInscription, updateInscription, deleteInscription, generateEcheancesForInscription, reinscrireEleve } from './modules/inscriptions.js';
import { createTarif, updateTarif, duplicateTarif, deleteTarif } from './modules/tarifs.js';
import { createPaiement, cancelPaiement, deletePaiement } from './modules/paiements.js';

const appState = loadState();
const dashboardFilters = {
  yearId: Number(appState.anneeActiveId || 0),
  classId: 0,
  category: '',
  period: 'all'
};

function renderAll() {
  renderDashboard(appState, dashboardFilters);
  renderAnnees(appState);
  renderClasses(appState);
  renderEleves(appState);
  renderInscriptions(appState);
  renderTarifs(appState);
  renderPaiements(appState);
  renderRapports(appState);
  renderConfig(appState);
}

function updateAndRender() {
  saveState(appState);
  renderAll();
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

function applyStudentFilters() {
  const search = document.querySelector('[data-student-search]')?.value.trim().toLocaleLowerCase('fr') || '';
  const classId = document.querySelector('[data-student-class]')?.value || '';
  const status = document.querySelector('[data-student-status]')?.value || '';
  filterRows('[data-student-row]', (row) =>
    (!search || row.dataset.search.includes(search))
    && (!classId || row.dataset.class === classId)
    && (!status || row.dataset.status === status), '[data-student-count]');
}

function applyPaymentFilters() {
  const search = document.querySelector('[data-payment-search]')?.value.trim().toLocaleLowerCase('fr') || '';
  const from = document.querySelector('[data-payment-from]')?.value || '';
  const to = document.querySelector('[data-payment-to]')?.value || '';
  const status = document.querySelector('[data-payment-status]')?.value || '';
  filterRows('[data-payment-row]', (row) =>
    (!search || row.dataset.search.includes(search))
    && (!from || row.dataset.date >= from)
    && (!to || row.dataset.date <= to)
    && (!status || row.dataset.status === status), '[data-payment-count]');
}

function updateEcheanceChoices(inscriptionId) {
  const inscription = appState.inscriptions.find((item) => item.id === Number(inscriptionId));
  const select = document.querySelector('form[data-form="paiement"] [name="echeanceId"]');
  if (!select) return;
  select.replaceChildren();
  (inscription?.echeances || []).forEach((echeance) => {
    const restant = Math.max(Number(echeance.montant || 0) - Number(echeance.montantPaye || 0), 0);
    const option = document.createElement('option');
    option.value = String(echeance.id);
    option.disabled = restant <= 0;
    option.textContent = `Tranche ${echeance.trancheId} — reste ${restant.toLocaleString('fr-FR')} ${appState.config.devise}`;
    select.append(option);
  });
  if (!select.options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucune échéance';
    select.append(option);
  }
}

function bindMenu() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn === button));
      document.querySelectorAll('.content-section').forEach((section) => {
        section.classList.toggle('active', section.id === target);
        section.classList.toggle('hidden', section.id !== target);
      });
    });
  });

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.open;
      if (target === 'new-eleve') {
        document.querySelector('#eleves .section-form')?.scrollIntoView({ behavior: 'smooth' });
      }
      if (target === 'new-inscription') {
        document.querySelector('#inscriptions .section-form')?.scrollIntoView({ behavior: 'smooth' });
      }
      document.querySelectorAll('.nav-btn').forEach((navBtn) => {
        navBtn.classList.toggle('active', navBtn.dataset.target === (target === 'new-eleve' ? 'eleves' : 'inscriptions'));
      });
      document.querySelectorAll('.content-section').forEach((section) => {
        const activeId = target === 'new-eleve' ? 'eleves' : 'inscriptions';
        section.classList.toggle('active', section.id === activeId);
        section.classList.toggle('hidden', section.id !== activeId);
      });
    });
  });
}

function bindGlobalActions() {
  document.getElementById('exportDataBtn')?.addEventListener('click', () => {
    exportStateToFile(appState, 'school_data.note');
    showToast('Données exportées avec succès');
  });

  document.getElementById('importDataInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importStateFromFile(file);
      Object.assign(appState, imported);
      updateAndRender();
      showToast('Import JSON effectué avec succès');
    } catch (err) {
      showToast('Fichier invalide');
    }
    event.target.value = '';
  });

  document.getElementById('resetDataBtn')?.addEventListener('click', () => {
    if (!confirm('Voulez-vous vraiment réinitialiser toutes les données ?')) return;
    const fresh = resetData();
    Object.keys(appState).forEach((key) => delete appState[key]);
    Object.assign(appState, fresh);
    updateAndRender();
    showToast('Données réinitialisées');
  });
}

function getClassNameLocal(classId) {
  return appState.classes.find((c) => c.id === Number(classId))?.nom || '—';
}

function handleMatriculeSearch(query) {
  const inscriptionSelect = document.querySelector('form[data-form="paiement"] [name="inscriptionId"]');
  if (!inscriptionSelect) return;
  if (!query) {
    inscriptionSelect.replaceChildren();
    appState.inscriptions.forEach((inscription) => {
      const eleve = appState.eleves.find((e) => e.id === inscription.eleveId) || {};
      const name = eleve.prenom ? (eleve.prenom + ' ' + eleve.nom) : '—';
      const annee = (appState.annees.find((a) => a.id === inscription.anneeId) || {}).annee || '—';
      const option = document.createElement('option');
      option.value = String(inscription.id);
      option.textContent = name + ' - ' + getClassNameLocal(inscription.classeId) + ' (' + annee + ')';
      inscriptionSelect.append(option);
    });
    updateEcheanceChoices(inscriptionSelect.value);
    return;
  }
  const q = query.toLocaleLowerCase('fr');
  const eleve = appState.eleves.find((e) => (e.matricule || '').toLocaleLowerCase('fr').includes(q));
  inscriptionSelect.replaceChildren();
  if (!eleve) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucun élève trouvé';
    inscriptionSelect.append(option);
    updateEcheanceChoices('');
    return;
  }
  const matched = appState.inscriptions.filter((i) => i.eleveId === eleve.id);
  matched.forEach((inscription) => {
    const annee = (appState.annees.find((a) => a.id === inscription.anneeId) || {}).annee || '—';
    const option = document.createElement('option');
    option.value = String(inscription.id);
    option.textContent = eleve.prenom + ' ' + eleve.nom + ' - ' + getClassNameLocal(inscription.classeId) + ' (' + annee + ')';
    inscriptionSelect.append(option);
  });
  if (!matched.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucune inscription trouvée';
    inscriptionSelect.append(option);
  }
  updateEcheanceChoices(matched.length ? String(matched[0].id) : '');
}
function wireForms() {
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.dataset.form === 'annee') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        annee: formData.get('annee'),
        dateDebut: formData.get('dateDebut'),
        dateFin: formData.get('dateFin'),
        statut: formData.get('statut') || 'preparation'
      };
      createAnnee(appState, payload);
      updateAndRender();
      form.reset();
      showToast('Année enregistrée');
    }

    if (form.dataset.form === 'classe') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        nom: formData.get('nom'),
        categorie: formData.get('categorie'),
        anneeId: Number(formData.get('anneeId')),
        capacite: Number(formData.get('capacite') || 0),
        active: true
      };
      createClasse(appState, payload);
      updateAndRender();
      form.reset();
      showToast('Classe enregistrée');
    }

    if (form.dataset.form === 'eleve') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        matricule: formData.get('matricule'),
        nom: formData.get('nom'),
        prenom: formData.get('prenom'),
        sexe: formData.get('sexe'),
        dateNaissance: formData.get('dateNaissance'),
        telephone: formData.get('telephone'),
        email: formData.get('email'),
        parent: formData.get('parent'),
        adresse: formData.get('adresse'),
        classeId: Number(formData.get('classeId') || 0),
        actif: true
      };
      const isEdit = !!form.dataset.editId;
      const saved = isEdit
        ? updateEleve(appState, Number(form.dataset.editId), payload)
        : createEleve(appState, payload);
      if (!saved) {
        showToast('Vérifiez les informations obligatoires de l'+'`u{2019}'+'élève');
        return;
      }
      if (!isEdit) {
        const tarifId = Number(form.querySelector('[data-auto-tarif]')?.value || 0);
        const classeId = payload.classeId;
        const anneeId = Number(appState.anneeActiveId || 0);
        if (classeId && anneeId) {
          const tarif = tarifId
            ? appState.tarifs.find((t) => t.id === tarifId)
            : appState.tarifs.find((t) => t.classeId === classeId && t.anneeId === anneeId);
          if (tarif) {
            const inscription = createInscription(appState, { eleveId: saved.id, anneeId, classeId });
            if (inscription) generateEcheancesForInscription(appState, inscription.id, tarif);
            updateAndRender();
            form.reset();
            showToast('Élève enregistré + inscription créée automatiquement');
            delete form.dataset.editId;
            return;
          }
        }
        updateAndRender();
        form.reset();
        showToast('Élève enregistré '+'`u{2014}'+' ajoutez une inscription manuellement');
      } else {
        updateAndRender();
        form.reset();
        showToast('Fiche élève mise à jour');
        delete form.dataset.editId;
      }
    }
    if (form.dataset.form === 'inscription') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        eleveId: Number(formData.get('eleveId')),
        anneeId: Number(formData.get('anneeId')),
        classeId: Number(formData.get('classeId')),
        type: formData.get('type') || 'nouvelle',
        statut: formData.get('statut') || 'inscrit'
      };
      const inscription = createInscription(appState, payload);
      if (inscription) {
        const tarif = appState.tarifs.find((item) => item.anneeId === payload.anneeId && item.classeId === payload.classeId);
        if (tarif) generateEcheancesForInscription(appState, inscription.id, tarif);
      }
      updateAndRender();
      form.reset();
      showToast(inscription
        ? (inscription.echeances.length ? 'Inscription et échéances enregistrées' : 'Inscription créée — configurez le tarif de la classe pour générer les échéances')
        : 'Impossible de créer cette inscription');
    }

    if (form.dataset.form === 'tarif') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        classeId: Number(formData.get('classeId')),
        anneeId: Number(formData.get('anneeId')),
        montantAnnuel: Number(formData.get('montantAnnuel') || 0),
        tranches: [
          { num: 1, libelle: '1ère tranche', montant: Number(formData.get('tranche1') || 0), dateLimite: formData.get('dateTranche1') || '' },
          { num: 2, libelle: '2ème tranche', montant: Number(formData.get('tranche2') || 0), dateLimite: formData.get('dateTranche2') || '' },
          { num: 3, libelle: '3ème tranche', montant: Number(formData.get('tranche3') || 0), dateLimite: formData.get('dateTranche3') || '' }
        ]
      };
      createTarif(appState, payload);
      updateAndRender();
      form.reset();
      showToast('Tarif enregistré');
    }

    if (form.dataset.form === 'paiement') {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        inscriptionId: Number(formData.get('inscriptionId')),
        echeanceId: Number(formData.get('echeanceId')),
        montant: Number(formData.get('montant') || 0),
        mode: formData.get('mode') || 'espece',
        reference: formData.get('reference') || '',
        caissier: formData.get('caissier') || 'Caissier'
      };
      const paiement = createPaiement(appState, payload);
      if (!paiement) {
        showToast('Paiement non enregistré : vérifiez l’échéance et le montant restant');
        return;
      }
      updateAndRender();
      form.reset();
      showToast(`Paiement enregistré — reçu ${paiement.reference}`);
    }

    if (form.dataset.form === 'config') {
      event.preventDefault();
      const formData = new FormData(form);
      appState.config = {
        ...appState.config,
        nom: formData.get('nom'),
        sigle: formData.get('sigle'),
        codeEcole: formData.get('codeEcole'),
        devise: formData.get('devise'),
        adresse: formData.get('adresse'),
        telephone: formData.get('telephone'),
        email: formData.get('email')
      };
      updateAndRender();
      showToast('Configuration mise à jour');
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-student-search]')) applyStudentFilters();
    if (event.target.matches('[data-payment-search]')) applyPaymentFilters();
    if (event.target.matches('[data-matricule-search]')) handleMatriculeSearch(event.target.value.trim());
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-student-class], [data-student-status]')) applyStudentFilters();
    if (target.matches('[data-payment-from], [data-payment-to], [data-payment-status]')) applyPaymentFilters();
    if (target.matches('form[data-form="paiement"] [name="inscriptionId"]')) {
      updateEcheanceChoices(target.value);
    }

    if (target.matches('[data-dashboard-filter]')) {
      const filter = target.dataset.dashboardFilter;
      if (filter === 'year') {
        dashboardFilters.yearId = Number(target.value || 0);
        const selectedClass = appState.classes.find((classe) => classe.id === Number(dashboardFilters.classId));
        if (selectedClass && dashboardFilters.yearId && selectedClass.anneeId !== dashboardFilters.yearId) {
          dashboardFilters.classId = 0;
        }
      } else if (filter === 'category') {
        dashboardFilters.category = target.value;
        const selectedClass = appState.classes.find((classe) => classe.id === Number(dashboardFilters.classId));
        if (selectedClass && selectedClass.categorie !== dashboardFilters.category && dashboardFilters.category) {
          dashboardFilters.classId = 0;
        }
      } else if (filter === 'class') {
        dashboardFilters.classId = Number(target.value || 0);
      } else if (filter === 'period') {
        dashboardFilters.period = target.value;
      }
      renderDashboard(appState, dashboardFilters);
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.matches('[data-modal-close]')) {
      document.getElementById('modal-root').innerHTML = '';
      return;
    }
    const btn = event.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    if (!action) return;

    if (action.startsWith('eleve:profile:')) {
      showStudentProfile(appState, Number(action.split(':')[2]));
      return;
    }

    if (action === 'paiement:export-csv') {
      exportPaymentsCsv(appState, {
        search: document.querySelector('[data-payment-search]')?.value,
        from: document.querySelector('[data-payment-from]')?.value,
        to: document.querySelector('[data-payment-to]')?.value,
        status: document.querySelector('[data-payment-status]')?.value
      });
      showToast('Liste des paiements exportée en CSV');
      return;
    }

    if (action.startsWith('paiement:receipt:')) {
      const printed = printPaymentReceipt(appState, Number(action.split(':')[2]));
      if (!printed) showToast('Impossible d’ouvrir le reçu : autorisez les fenêtres contextuelles');
      return;
    }

    if (action === 'report:export-csv') {
      exportReportCsv(appState);
      showToast('Rapport exporté en CSV');
      return;
    }

    if (action === 'report:students-csv') {
      exportStudentsCsv(appState);
      showToast('Liste des élèves exportée en CSV');
      return;
    }

    if (action === 'report:print') {
      if (!printReport(appState)) showToast('Impossible d’ouvrir le rapport : autorisez les fenêtres contextuelles');
      return;
    }


    if (action.startsWith('report:print-period:')) {
      const parts = action.split(':');
      const from = parts[3] || '';
      const to = parts[4] || '';
      if (!printPeriodReport(appState, from, to)) showToast('Rapport impossible');
      return;
    }

    if (action.startsWith('report:csv-period:')) {
      const parts = action.split(':');
      const from = parts[3] || '';
      const to = parts[4] || '';
      exportPeriodReportCsv(appState, from, to);
      showToast('Rapport CSV exporté');
      return;
    }

    if (action.startsWith('annee:')) {
      const [_, type, id] = action.split(':');
      if (type === 'open') updateAnneeStatus(appState, Number(id), 'ouverte');
      if (type === 'close') updateAnneeStatus(appState, Number(id), 'cloturee');
      if (type === 'delete') deleteAnnee(appState, Number(id));
      if (type === 'active') setAnneeActive(appState, Number(id));
      updateAndRender();
    }

    if (action.startsWith('classe:')) {
      const [_, type, id] = action.split(':');
      if (type === 'delete') deleteClasse(appState, Number(id));
      if (type === 'toggle') {
        const item = appState.classes.find((c) => c.id === Number(id));
        item.active = !item.active;
      }
      updateAndRender();
    }

    if (action.startsWith('eleve:')) {
      const [_, type, id] = action.split(':');
      if (type === 'toggle') toggleEleveState(appState, Number(id));
      if (type === 'delete') deleteEleve(appState, Number(id));
      if (type === 'edit') {
        const item = appState.eleves.find((e) => e.id === Number(id));
        if (!item) return;
        document.querySelector('.nav-btn[data-target="eleves"]')?.click();
        const form = document.querySelector('#eleves form[data-form="eleve"]');
        if (form) {
          form.querySelector('[name="matricule"]').value = item.matricule;
          form.querySelector('[name="nom"]').value = item.nom;
          form.querySelector('[name="prenom"]').value = item.prenom;
          form.querySelector('[name="sexe"]').value = item.sexe;
          form.querySelector('[name="dateNaissance"]').value = item.dateNaissance || '';
          form.querySelector('[name="telephone"]').value = item.telephone || '';
          form.querySelector('[name="email"]').value = item.email || '';
          form.querySelector('[name="parent"]').value = item.parent || '';
          form.querySelector('[name="adresse"]').value = item.adresse || '';
          form.querySelector('[name="classeId"]').value = item.classeId || '';
          const autoTarifSel = form.querySelector('[data-auto-tarif]');
          if (autoTarifSel) autoTarifSel.value = '';
          form.dataset.editId = String(item.id);
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showToast(`Modification de la fiche ${item.matricule}`);
        return;
      }
      updateAndRender();
    }

    if (action.startsWith('inscription:')) {
      const [_, type, id] = action.split(':');
      if (type === 'delete') deleteInscription(appState, Number(id));
      if (type === 'reinscrire') reinscrireEleve(appState, Number(id));
      updateAndRender();
    }

    if (action.startsWith('tarif:')) {
      const [_, type, id] = action.split(':');
      if (type === 'delete') deleteTarif(appState, Number(id));
      if (type === 'duplicate') duplicateTarif(appState, Number(id));
      updateAndRender();
    }

    if (action.startsWith('paiement:')) {
      const [_, type, id] = action.split(':');
      if (type === 'cancel') cancelPaiement(appState, Number(id), 'Annulation manuelle');
      if (type === 'delete') deletePaiement(appState, Number(id));
      updateAndRender();
    }
  });
}

function initApp() {
  bindMenu();
  bindGlobalActions();
  wireForms();
  renderAll();
}

initApp();
