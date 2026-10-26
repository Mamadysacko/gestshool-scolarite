import { escapeHtml, formatMoney, todayISO, formatDateFr, downloadExcel } from './utils.js';
import { isEnseignant, createEmploye, updateEmploye, definirRemuneration, saveTypeEmploye, toggleTypeEmploye, saveMatiere, toggleMatiere, saveAffectation, saveAffectations, closeAffectation, nomEmploye, setHeuresMois } from './personnel.js';
import { programmeDeClasse, auProgramme } from './programme.js';
import { preparerPaies, majVariables, validerPaie, payerPaie, annulerPaie, calculerPaie } from './paie.js';
import { demanderAvance, approuverAvance, refuserAvance, verserAvance, reporterEcheance, rembourserExceptionnel, soldeAvance, MODES_REMBOURSEMENT } from './avances.js';
import { printBulletins, moisLabel } from './bulletin-paie.js';
import { showBulletinPreview, showExpenseReceiptPreview } from './details.js';
import { paieView, renderPaie, renderPaieOutput, renderPersonnel, renderAffectations, renderRemunerations, renderAvances, renderPaieRapports, affectationFormHtml, avancePreviewHtml, showEmployeDetail, showAvanceDetail, rapportPaie, etatLigneAffectation, syncModeRemuneration } from './paie-views.js';
import { enteteHtml, enteteLignes } from './entete.js';
import { printDocument } from './print.js';

// Interactions du module de paie : formulaires, boutons et filtres. Toute écriture passe par ctx.runOperation
// (contrôle des droits, autorisation administrateur si nécessaire, transaction « tout ou rien », journal, rendu).
const MOYENS = [['espece', 'Espèces'], ['virement', 'Virement'], ['cheque', 'Chèque'], ['mobile_money', 'Mobile Money']];

function employePayload(fd) {
  const keys = ['matricule', 'prenom', 'nom', 'sexe', 'dateNaissance', 'telephone', 'email', 'adresse', 'typeEmployeId', 'fonction', 'contratType', 'contratDebut', 'contratFin', 'dateEmbauche', 'statut'];
  return Object.fromEntries(keys.map((k) => [k, fd.get(k) ?? '']));
}

function employeValues(e) {
  return {
    matricule: e.matricule, prenom: e.prenom, nom: e.nom, sexe: e.sexe, dateNaissance: e.dateNaissance, telephone: e.telephone, email: e.email, adresse: e.adresse,
    typeEmployeId: e.typeEmployeId, fonction: e.fonction, contratType: e.contrat.type, contratDebut: e.contrat.debut, contratFin: e.contrat.fin, dateEmbauche: e.dateEmbauche, statut: e.statut
  };
}

const lines = (fd, kind) => fd.getAll(`${kind}Libelle`).map((libelle, i) => ({ libelle, montant: fd.getAll(`${kind}Montant`)[i] }));

// Rémunérations : ouvre le formulaire sur l'employé choisi
export function ouvrirRemuneration(ctx, employeId) {
  paieView.remEmploye = Number(employeId) || 0;
  ctx.goTo('remunerations');
  renderRemunerations(ctx.state);
  document.getElementById('remuneration-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Après l'enregistrement d'une fiche : enseignant → affectation ; autre employé → rémunération
function redirectToAffectation(ctx, employe) {
  const { state } = ctx;
  if (!isEnseignant(state, employe)) {
    ouvrirRemuneration(ctx, employe.id);
    ctx.ok(`${nomEmploye(employe)} enregistré(e) — définissez maintenant sa rémunération`);
    return;
  }
  Object.assign(paieView, { affEmploye: employe.id, affAnnee: state.anneeActiveId, affClasses: [], affMatieres: [], affLignes: [] });
  ctx.goTo('affectations');
  const box = document.querySelector('[data-aff-form]');
  if (box) box.innerHTML = affectationFormHtml(state);
  document.querySelector('#affectations .section-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#affectations [data-af-primaire], #affectations [data-af-classe]')?.focus();
  ctx.ok(`${nomEmploye(employe)} enregistré(e) — complétez maintenant son affectation`);
}

export function paieFormHandlers(ctx) {
  const { state, runOperation, ko } = ctx;
  return {
    async employe(form, fd) {
      const editId = Number(form.dataset.editId || 0);
      const payload = employePayload(fd);
      const file = fd.get('photo');
      try { payload.photo = file && file.size ? (await ctx.readPiece(file))?.data : null; } catch (error) { ko(error.message); return; }
      let saved = null;
      const done = await runOperation({
        title: editId ? 'Modifier la fiche employé' : 'Créer la fiche employé', silent: true,
        exec: () => { saved = editId ? updateEmploye(state, editId, payload) : createEmploye(state, payload); return saved; },
        success: editId ? 'Fiche employé modifiée (historique mis à jour)' : 'Employé enregistré', failure: 'Fiche refusée'
      });
      if (!done) return;
      ctx.resetForm(form);
      // Après la création : un enseignant est conduit à son affectation, déjà présélectionné
      if (!editId && saved) redirectToAffectation(ctx, saved);
    },
    async remuneration(form, fd) {
      const id = Number(fd.get('employeId') || 0);
      const employe = state.personnel.find((e) => e.id === id);
      if (!employe) { ko('Choisissez l’employé.'); return; }
      const payload = Object.fromEntries(['mode', 'salaireBase', 'tauxHoraire', 'primeFixe', 'libellePrime', 'motif'].map((k) => [k, fd.get(k) ?? '']));
      const done = await runOperation({
        title: `Rémunération de ${nomEmploye(employe)}`, silent: true, admin: true,
        adminReason: 'La définition et la modification d’une rémunération nécessitent l’autorisation d’un administrateur.',
        exec: () => definirRemuneration(state, id, payload), success: 'Rémunération enregistrée', failure: 'Rémunération refusée'
      });
      if (!done) return;
      paieView.remEmploye = 0;
      renderRemunerations(state);
      const r = employe.remuneration;
      ctx.ok(`${nomEmploye(employe)} : ${r.mode === 'horaire' ? `payé à l’heure (${formatMoney(r.tauxHoraire)} ${state.config.devise} / h)` : `${formatMoney(r.salaireBase)} ${state.config.devise} par mois`} — prêt pour la paie mensuelle`);
    },
    async 'type-employe'(form, fd) {
      const done = await runOperation({ title: 'Ajouter un type d’employé', silent: true, exec: () => saveTypeEmploye(state, { libelle: fd.get('libelle'), enseignant: fd.get('enseignant') === 'on' }), success: 'Type d’employé ajouté', failure: 'Type refusé' });
      if (done) form.reset();
    },
    async matiere(form, fd) {
      const done = await runOperation({ title: 'Ajouter une matière', silent: true, exec: () => saveMatiere(state, { nom: fd.get('nom') }), success: 'Matière ajoutée', failure: 'Matière refusée' });
      if (done) form.reset();
    },
    // Heures du mois : une saisie par enseignant et par mois (mise à jour historisée), tout ou rien
    async 'heures-mois'(form, fd) {
      const mois = form.dataset.mois;
      const parEmploye = new Map();
      for (const [name, value] of fd.entries()) {
        const m = /^h-(\d+)-(\d+)$/.exec(name);
        if (!m) continue;
        if (!parEmploye.has(m[1])) parEmploye.set(m[1], []);
        parEmploye.get(m[1]).push({ affectationId: Number(m[2]), heures: value });
      }
      if (!parEmploye.size) { ko('Aucune heure modifiable pour ce mois.'); return; }
      let touches = [];
      const done = await runOperation({
        title: 'Heures du mois', silent: true,
        exec: () => { touches = setHeuresMois(state, mois, [...parEmploye.entries()].map(([employeId, lignes]) => ({ employeId: Number(employeId), lignes }))); return true; },
        success: 'Heures enregistrées', failure: 'Heures refusées'
      });
      if (done) ctx.ok(touches.length ? `Heures de ${moisLabel(mois)} enregistrées pour ${touches.length} enseignant(s) — salaires du mois recalculés` : 'Aucun changement : les heures du mois sont déjà à jour');
    },
    async 'paie-variables'(form, fd) {
      await runOperation({ title: 'Primes et retenues du mois', silent: true, exec: () => majVariables(state, Number(form.dataset.paie), { primes: lines(fd, 'prime'), retenues: lines(fd, 'retenue') }), success: 'Paie recalculée', failure: 'Modification refusée' });
    },
    async avance(form, fd) {
      const done = await runOperation({
        title: 'Demande d’avance', silent: true,
        exec: () => demanderAvance(state, { employeId: fd.get('employeId'), montantDemande: fd.get('montantDemande'), dateDemande: fd.get('dateDemande'), motif: fd.get('motif'), modeRemboursement: fd.get('modeRemboursement'), valeur: fd.get('valeur'), moisDebut: fd.get('moisDebut') }),
        success: 'Demande d’avance enregistrée — en attente d’approbation', failure: 'Demande refusée'
      });
      if (done) form.reset();
    }
  };
}

function exportRapport(state, format) {
  const r = rapportPaie(state);
  if (format === 'excel') {
    const tag = (row, kind) => Object.assign(row, { kind });
    const rows = [...enteteLignes(state.config).map((l) => tag(l, 'entete')), [], tag([r.title], 'title'), [`Généré le ${formatDateFr(todayISO())}`], [], tag([...r.head], 'head'), ...r.rows.map((row) => [...row]), tag([...r.foot], 'foot'), [], [r.note]];
    downloadExcel(`${r.title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xls`, r.title, rows);
    return true;
  }
  const cell = (v, i) => `<td class="${r.money.includes(i) ? 'num' : ''}">${escapeHtml(r.money.includes(i) ? formatMoney(v) : v)}</td>`;
  const html = `${enteteHtml(state.config)}
    <div class="r-title"><strong>${escapeHtml(r.title)}</strong><span>Généré le ${escapeHtml(formatDateFr(todayISO()))}</span></div>
    <table><thead><tr>${r.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${r.head.length}">Aucune donnée.</td></tr>`}</tbody>
    <tfoot><tr>${r.foot.map(cell).join('')}</tr></tfoot></table><p style="font-size:10px;color:#4b5563">${escapeHtml(r.note)}</p>
    <div style="display:flex;justify-content:space-between;margin:16mm 20mm 0"><b style="border-top:1px solid #111;padding-top:4px;width:60mm;text-align:center">La Comptable</b><b style="border-top:1px solid #111;padding-top:4px;width:60mm;text-align:center">Le Directeur Général</b></div>`;
  return printDocument({ title: r.title, html, page: 'A4 landscape', fileName: r.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-') });
}

// Boutons du module ; retourne true si l'action a été prise en charge
export async function handlePaieClick(ctx, event) {
  const { state, runOperation, ko, ok } = ctx;
  const tab = event.target.closest('[data-paie-rapport]');
  if (tab) { paieView.rapType = tab.dataset.paieRapport; renderPaieRapports(state); return true; }
  const action = event.target.closest('button[data-action]')?.dataset.action || '';
  const [scope, type, rawId, extra] = action.split(':');
  const id = Number(rawId);
  if (!['employe', 'typeemploye', 'matiere', 'affectation', 'remuneration', 'paie', 'avance', 'paierapport'].includes(scope)) return false;
  if (scope === 'remuneration') {
    if (type === 'edit') ouvrirRemuneration(ctx, id);
    if (type === 'clear') { paieView.remEmploye = 0; renderRemunerations(state); }
    return true;
  }

  if (scope === 'employe' && type === 'view') { showEmployeDetail(state, id); return true; }
  if (scope === 'employe' && type === 'edit') {
    const e = state.personnel.find((x) => x.id === id);
    if (!e) return true;
    ctx.goTo('personnel');
    const form = document.querySelector('form[data-form="employe"]');
    if (!form) return true;
    ctx.fillForm(form, employeValues(e));
    syncModeRemuneration(form);
    ctx.enterEditMode(form, id, 'Enregistrer les modifications');
    return true;
  }
  if (scope === 'typeemploye') { await runOperation({ title: 'Type d’employé', silent: true, exec: () => toggleTypeEmploye(state, id), success: 'Type d’employé mis à jour' }); return true; }
  if (scope === 'matiere') { await runOperation({ title: 'Matière', silent: true, exec: () => toggleMatiere(state, id), success: 'Matière mise à jour' }); return true; }
  const refreshAff = () => { const box = document.querySelector('[data-aff-form]'); if (box) box.innerHTML = affectationFormHtml(state); };
  if (scope === 'affectation' && type === 'clear') { paieView.affEmploye = 0; refreshAff(); return true; }
  if (scope === 'affectation' && type === 'vider') { paieView.affLignes = []; refreshAff(); return true; }
  if (scope === 'affectation' && type === 'retirer-ligne') { paieView.affLignes = (paieView.affLignes || []).filter((_, i) => i !== id); refreshAff(); return true; }
  if (scope === 'affectation' && type === 'ajouter-lignes') {
    const lignes = [...(paieView.affLignes || [])];
    let ajoutees = 0;
    (paieView.affClasses || []).map(Number).forEach((classeId) => (paieView.affMatieres || []).map(Number).forEach((matiereId) => {
      if (!auProgramme(state, classeId, matiereId)) return; // matière absente du programme de cette classe
      if (lignes.some((l) => Number(l.classeId) === classeId && Number(l.matiereId) === matiereId)) return;
      lignes.push({ classeId, matiereId, salle: paieView.affSalle || '' });
      ajoutees += 1;
    }));
    paieView.affLignes = lignes;
    refreshAff();
    ok(ajoutees ? `${ajoutees} ligne(s) ajoutée(s) — vérifiez-les puis enregistrez` : 'Aucune nouvelle ligne (déjà dans la liste ou hors programme)');
    return true;
  }
  if (scope === 'affectation' && type === 'titulaire') {
    const classeId = Number(document.querySelector('[data-af-primaire]')?.value || 0);
    if (!classeId) { ko('Choisissez la classe de primaire.'); return true; }
    const done = await runOperation({ title: 'Affecter le titulaire', silent: true, exec: () => saveAffectation(state, { employeId: paieView.affEmploye, anneeId: paieView.affAnnee || state.anneeActiveId, classeId, matiereId: 0 }), success: 'Titulaire affecté', failure: 'Affectation refusée' });
    if (done) refreshAff();
    return true;
  }
  if (scope === 'affectation' && type === 'enregistrer') {
    const anneeId = Number(paieView.affAnnee || state.anneeActiveId);
    const employeId = Number(paieView.affEmploye);
    if (!employeId) { ko('Choisissez l’enseignant.'); return true; }
    const valides = (paieView.affLignes || []).filter((l) => etatLigneAffectation(state, anneeId, employeId, l).ok);
    if (!valides.length) { ko('Aucune ligne valide à enregistrer.'); return true; }
    let crees = [];
    const done = await runOperation({ title: 'Enregistrer les affectations', silent: true, exec: () => { crees = saveAffectations(state, { employeId, anneeId, lignes: valides }); return crees; }, success: 'Affectations enregistrées', failure: 'Affectations refusées' });
    if (done) {
      Object.assign(paieView, { affLignes: [], affClasses: [], affMatieres: [] });
      refreshAff();
      ok(`${crees.length} affectation(s) enregistrée(s) pour ${nomEmploye(state.personnel.find((e) => e.id === employeId))}`);
    }
    return true;
  }
  if (scope === 'affectation' && type === 'close') {
    await runOperation({ title: 'Clôturer l’affectation', message: 'Clôturer cette affectation ? Elle reste dans l’historique et dans les paies déjà calculées.', confirmLabel: 'Clôturer', danger: true, exec: () => closeAffectation(state, id), success: 'Affectation clôturée' });
    return true;
  }
  if (scope === 'paierapport') { exportRapport(state, type); if (type === 'excel') ok('Export Excel prêt'); return true; }

  if (scope === 'paie') {
    const paie = state.paies.find((p) => p.id === id);
    if (type === 'preparer') {
      let crees = [];
      const done = await runOperation({ title: 'Préparer la paie', silent: true, exec: () => { crees = preparerPaies(state, paieView.mois); return true; }, success: 'Paie préparée', failure: 'Préparation impossible' });
      if (done) ok(crees.length ? `${crees.length} paie(s) préparée(s) pour ${moisLabel(paieView.mois)}` : 'Toutes les paies de ce mois existent déjà (aucun doublon créé)');
      return true;
    }
    if (type === 'detail') {
      paieView.detailId = id;
      renderPaieOutput(state);
      document.getElementById('paie-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    if (type === 'bulletin') { if (!showBulletinPreview(state, id)) ko('Bulletin disponible uniquement pour une paie validée ou payée.'); return true; }
    if (type === 'bulletins-mois') {
      const ids = state.paies.filter((p) => p.mois === paieView.mois && (p.statut === 'validee' || p.statut === 'payee')).map((p) => p.id);
      if (!printBulletins(state, ids)) ko('Aucun bulletin validé pour ce mois.');
      return true;
    }
    if (type === 'valider-tout') {
      const brouillons = state.paies.filter((p) => p.mois === paieView.mois && p.statut === 'brouillon');
      const valides = brouillons.filter((p) => calculerPaie(state, p.employeId, p.mois, p.variables).valide);
      await runOperation({
        title: 'Valider les paies du mois', confirmLabel: 'Valider', admin: true, adminReason: 'La validation de la paie est réservée à l’administrateur.',
        message: `Valider ${valides.length} paie(s) de ${moisLabel(paieView.mois)} ? Les montants seront figés et les prélèvements d’avances appliqués.${brouillons.length > valides.length ? ` ${brouillons.length - valides.length} brouillon(s) en erreur resteront à corriger.` : ''}`,
        exec: () => { valides.forEach((p) => validerPaie(state, p.id)); return valides.length > 0; },
        success: `${valides.length} paie(s) validée(s)`, failure: 'Aucune paie validable'
      });
      return true;
    }
    if (!paie) return true;
    const who = nomEmploye(state.personnel.find((e) => e.id === paie.employeId));
    if (type === 'valider') {
      const c = calculerPaie(state, paie.employeId, paie.mois, paie.variables);
      await runOperation({
        title: 'Valider la paie', confirmLabel: 'Valider', admin: true, adminReason: 'La validation de la paie est réservée à l’administrateur.',
        message: `Valider la paie de ${who} pour ${moisLabel(paie.mois)} : net ${formatMoney(c.net)} ${state.config.devise} ? Les montants seront figés.`,
        exec: () => validerPaie(state, id), success: 'Paie validée — bulletin disponible', failure: 'Validation impossible'
      });
      return true;
    }
    if (type === 'payer') {
      const done = await runOperation({
        title: 'Payer le salaire', confirmLabel: 'Enregistrer le paiement', admin: true, adminReason: 'Le paiement des salaires est réservé à l’administrateur.',
        message: `Payer ${formatMoney(paie.calcul.net)} ${state.config.devise} à ${who} (${paie.numero}) ? La sortie de caisse est enregistrée en dépense.`,
        fields: [{ name: 'date', label: 'Date du paiement', type: 'date', value: todayISO(), required: true }, { name: 'moyen', label: 'Moyen de paiement', options: MOYENS, value: 'espece' }],
        exec: (_, v) => payerPaie(state, id, { date: v.date, moyen: v.moyen }), success: 'Salaire payé — dépense enregistrée', failure: 'Paiement impossible'
      });
      // Bulletin affiché automatiquement après un paiement réussi
      if (done) showBulletinPreview(state, id);
      return true;
    }
    if (type === 'annuler') {
      await runOperation({
        title: 'Annuler la paie', confirmLabel: 'Annuler la paie', danger: true, admin: true, reauth: paie.statut === 'payee', adminReason: 'L’annulation d’une paie est réservée à l’administrateur.',
        message: `Annuler la paie de ${who} (${moisLabel(paie.mois)}) ? La ligne reste dans l’historique ; ${paie.statut === 'payee' ? 'la dépense de salaire est annulée et ' : ''}les prélèvements d’avances sont rendus.`,
        field: { label: 'Motif (obligatoire)', required: true }, exec: (motif) => annulerPaie(state, id, motif), success: 'Paie annulée', failure: 'Annulation impossible'
      });
      return true;
    }
  }

  if (scope === 'avance') {
    const a = state.avances.find((x) => x.id === id);
    if (!a) return true;
    const who = nomEmploye(state.personnel.find((e) => e.id === a.employeId));
    const admin = { admin: true, adminReason: 'Les avances sur salaire sont approuvées et versées par un administrateur.' };
    if (type === 'detail') { showAvanceDetail(state, id); return true; }
    if (type === 'approuver') {
      await runOperation({
        title: `Approuver l’avance de ${who}`, confirmLabel: 'Approuver', ...admin, message: `Montant demandé : ${formatMoney(a.montantDemande)} ${state.config.devise}.`,
        fields: [{ name: 'montantAutorise', label: 'Montant autorisé', type: 'number', value: a.montantDemande, required: true }, { name: 'modeRemboursement', label: 'Remboursement', options: Object.entries(MODES_REMBOURSEMENT), value: a.modeRemboursement },
          { name: 'valeur', label: 'Mensualité ou durée (mois)', type: 'number', value: a.valeur, required: true }, { name: 'moisDebut', label: 'Premier prélèvement', type: 'month', value: a.moisDebut, required: true }],
        exec: (_, v) => approuverAvance(state, id, v), success: 'Avance approuvée — échéancier généré', failure: 'Approbation impossible'
      });
      return true;
    }
    if (type === 'refuser') { await runOperation({ title: `Refuser l’avance de ${who}`, confirmLabel: 'Refuser', danger: true, ...admin, field: { label: 'Motif (obligatoire)', required: true }, exec: (motif) => refuserAvance(state, id, motif), success: 'Avance refusée' }); return true; }
    if (type === 'verser') {
      const done = await runOperation({ title: `Verser l’avance de ${who}`, confirmLabel: 'Verser', ...admin, message: `Verser ${formatMoney(a.montantAutorise)} ${state.config.devise} ? La sortie de caisse est enregistrée en dépense « Avances sur salaire ».`, fields: [{ name: 'date', label: 'Date du versement', type: 'date', value: todayISO(), required: true }], exec: (_, v) => verserAvance(state, id, { date: v.date }), success: 'Avance versée — prélèvements sur les prochaines paies', failure: 'Versement impossible' });
      if (done && a.depenseId) showExpenseReceiptPreview(state, state.avances.find((x) => x.id === id)?.depenseId);
      return true;
    }
    if (type === 'exceptionnel') {
      await runOperation({ title: `Remboursement exceptionnel — ${who}`, confirmLabel: 'Encaisser', ...admin, message: `Solde restant : ${formatMoney(soldeAvance(a))} ${state.config.devise}. Le montant réduit les dernières échéances et entre en caisse.`, fields: [{ name: 'montant', label: 'Montant remboursé', type: 'number', required: true }, { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true }], exec: (_, v) => rembourserExceptionnel(state, id, v), success: 'Remboursement enregistré', failure: 'Remboursement impossible' });
      return true;
    }
    if (type === 'reporter') {
      const done = await runOperation({ title: 'Reporter l’échéance', confirmLabel: 'Reporter', ...admin, message: 'Le reste de cette échéance est déplacé à la fin de l’échéancier.', exec: () => reporterEcheance(state, id, Number(extra)), success: 'Échéance reportée', failure: 'Report impossible' });
      if (done) showAvanceDetail(state, id);
      return true;
    }
  }
  return true;
}

// Filtres et saisies en direct (sans perdre le focus du champ en cours de frappe)
export function handlePaieInput(ctx, event) {
  const t = event.target;
  if (!(t instanceof HTMLElement)) return false;
  const { state } = ctx;
  if (t.matches('[data-pv]')) {
    const key = t.dataset.pv;
    paieView[key] = ['affEnseignant', 'rapEmploye'].includes(key) ? Number(t.value || 0) : t.value;
    if (key === 'mois') paieView.detailId = 0;
    const refocus = t.matches('input[type="search"]');
    const renderers = { search: () => renderPaieOutput(state), statut: () => renderPaieOutput(state), personnelSearch: () => renderPersonnel(state), personnelType: () => renderPersonnel(state), personnelStatut: () => renderPersonnel(state), affEnseignant: () => renderAffectations(state), avanceStatut: () => renderAvances(state), rapAnnee: () => renderPaieRapports(state), rapEmploye: () => renderPaieRapports(state) };
    (renderers[key] || (() => renderPaie(state)))();
    if (refocus) {
      const input = document.querySelector(`[data-pv="${key}"]`);
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
    return true;
  }
  const refreshAff = () => { const box = document.querySelector('[data-aff-form]'); if (box) box.innerHTML = affectationFormHtml(state); };
  if (t.matches('[data-af]')) {
    const key = t.dataset.af;
    if (key === 'affSalle') { paieView.affSalle = t.value; return true; } // saisie libre : pas de re-rendu
    paieView[key] = Number(t.value || 0);
    if (key === 'affAnnee') Object.assign(paieView, { affClasses: [], affMatieres: [], affLignes: [] });
    refreshAff();
    return true;
  }
  if (t.matches('[data-af-classe], [data-af-matiere]')) {
    const key = t.matches('[data-af-classe]') ? 'affClasses' : 'affMatieres';
    const set = new Set((paieView[key] || []).map(Number));
    if (t.checked) set.add(Number(t.value)); else set.delete(Number(t.value));
    paieView[key] = [...set];
    // matières cochées : on ne garde que celles encore proposées par les classes cochées
    if (key === 'affClasses') paieView.affMatieres = (paieView.affMatieres || []).filter((m) => paieView.affClasses.some((c) => auProgramme(state, c, m)));
    refreshAff();
    return true;
  }
  if (t.matches('[data-af-ligne-salle]')) {
    const ligne = (paieView.affLignes || [])[Number(t.dataset.afLigneSalle)];
    if (ligne) ligne.salle = t.value;
    return true;
  }
  if (t.matches('[data-pe-mode]')) { syncModeRemuneration(t.closest('form')); return true; }
  if (t.matches('[data-rem-employe]')) { paieView.remEmploye = Number(t.value || 0); renderRemunerations(state); document.querySelector('[data-rem-employe]')?.focus(); return true; }
  if (t.matches('[data-av]')) {
    const form = t.closest('form');
    const preview = form?.querySelector('[data-av-preview]');
    if (preview) preview.innerHTML = avancePreviewHtml(state, form);
    return true;
  }
  return false;
}

