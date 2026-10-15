import { escapeHtml, formatMoney, downloadCsv } from './modules/utils.js';
import { paymentFormHtml, initPaymentForm } from './modules/paiement-form.js';
import { echeancierHtml } from './modules/echeancier-view.js';
import { paymentAllocations, allocationLabel, echeancierSituation } from './modules/allocation.js';
import { can } from './modules/auth.js';
import { MODALITES } from './modules/modalites.js';

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

export function getClassName(state, id) {
  return state.classes.find((item) => item.id === Number(id))?.nom || '—';
}

export function getEleveName(state, id) {
  const e = state.eleves.find((item) => item.id === Number(id));
  return e ? `${e.prenom} ${e.nom}` : '—';
}

// Même calcul que partout ailleurs (remises et plafonnement par échéance compris)
function getInscriptionBalance(inscription) {
  const s = echeancierSituation(inscription);
  return { total: s.total, paye: s.paye, reste: s.reste };
}

export function renderPaiements(state) {
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

export function exportPaymentsCsv(state, filters = {}) {
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

export function exportStudentsCsv(state) {
  const rows = [['Matricule', 'Prénom', 'Nom', 'Sexe', 'Date de naissance', 'Parent / tuteur', 'Téléphone', 'E-mail', 'Adresse', 'Classe', 'Statut']];
  state.eleves.forEach((eleve) => rows.push([
    eleve.matricule, eleve.prenom, eleve.nom, eleve.sexe, eleve.dateNaissance, eleve.parent,
    eleve.telephone, eleve.email, eleve.adresse, getClassName(state, eleve.classeId), eleve.actif ? 'Actif' : 'Inactif'
  ]));
  downloadCsv('liste-eleves.csv', rows);
}

export function showStudentProfile(state, studentId) {
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
