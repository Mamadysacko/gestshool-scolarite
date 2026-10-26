import { escapeHtml, formatMoney, formatDateFr, todayISO } from './utils.js';
import { previewPaiement, STATUT_GLOBAL_LABELS } from './allocation.js';
import { echeancierHtml, allocationTableHtml, progressBar } from './echeancier-view.js';
import { cashierName } from './paiements.js';
import { MODALITES, tarifFor, modalitesDisponibles, hasValidPayments, modaliteActuelle, planPourModalite, totalTranches, texteMensuel } from './modalites.js';
import { studentOf } from './finance.js';
import { reliquatsEleve, reliquatOf, situationReliquat, anneeEncaissement } from './reliquats.js';
import { comptesActifs, compteParDefaut } from './comptes.js';
import { attentesOuvertes, MODES_ATTENTE } from './attente.js';
import { reductionLabel } from './reductions.js';
import { can } from './auth.js';

// Formulaire de paiement : recherche dynamique de l'élève (nom ou matricule) → fiche et échéancier remplis
// automatiquement → montant → aperçu immédiat de l'imputation et du solde.
const selection = { inscriptionId: 0, modalite: '', reliquatId: 0 };
const yearName = (state, id) => state.annees.find((a) => a.id === id)?.annee || '—';
const root = { state: null, form: null };
const MODES = { espece: 'Espèces', virement: 'Virement bancaire', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte bancaire' };

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
    mensuel: tarif && Number(tarif.montantMensuel) > 0 ? `${texteMensuel(state, tarif, formatMoney)} ${devise}` : 'Montant mensuel non défini dans le tarif'
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

// Réduction (remise, bourse, exonération) accordée à l'élève, et accès direct pour en accorder une
function reductionHtml(state, inscription) {
  if (selection.reliquatId) return '';
  const devise = escapeHtml(state.config.devise || '');
  const remise = (inscription.echeances || []).reduce((s, e) => s + Number(e.remise || 0), 0);
  if (inscription.reduction) {
    return `<p class="reduction-note">🎓 ${escapeHtml(reductionLabel(inscription.reduction))} — ${formatMoney(remise)} ${devise} déduits (${escapeHtml(inscription.reduction.motif)})
      ${can('write') ? `<button type="button" class="link-btn" data-action="inscription:reduction:${inscription.id}">Modifier</button>` : ''}</p>`;
  }
  return can('write') ? `<p class="meta"><button type="button" class="link-btn" data-action="inscription:reduction:${inscription.id}">Accorder une remise, une bourse ou une exonération</button></p>` : '';
}

// Chèques / virements de l'élève en attente de confirmation : non comptés dans le solde affiché
function attentesHtml(state, inscription) {
  const list = attentesOuvertes(state, inscription.id);
  if (!list.length) return '';
  const devise = escapeHtml(state.config.devise || '');
  return `<div class="form-warning">⏳ ${list.length} règlement(s) en attente de confirmation : ${list.map((a) => `${escapeHtml(a.numero)} — ${escapeHtml(MODES[a.mode] || a.mode)} ${escapeHtml(a.reference)} : <b>${formatMoney(a.montant)} ${devise}</b>`).join(' ; ')}.
    Ils ne sont pas encore déduits du solde ci-dessous.</div>`;
}

// Moyen de paiement choisi : compte proposé en conséquence ; l'option « en attente » n'existe pas pour les espèces
function syncMode(state, form) {
  const mode = form.querySelector('[name="mode"]')?.value || 'espece';
  const compte = form.querySelector('[name="compteId"]');
  if (compte && !compte.dataset.touched) compte.value = String(compteParDefaut(state, mode)?.id || compte.value);
  const attente = form.querySelector('[data-pay-attente]');
  if (attente) {
    attente.hidden = !MODES_ATTENTE.includes(mode);
    if (attente.hidden) attente.querySelector('input').checked = false;
  }
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
      ${reductionHtml(state, inscription)}
      ${attentesHtml(state, inscription)}
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

export function paymentFormHtml(state) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `<form class="form-grid compact pay-form" data-form="paiement" autocomplete="off">
    <input type="hidden" name="token" value="${token}" /><input type="hidden" name="inscriptionId" /><input type="hidden" name="reliquatId" />
    <label>Année scolaire
      <select data-pay="year" name="anneeId">${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
    </label>
    <label class="span-two search-field">Élève — nom ou matricule
      <input type="search" data-pay="student" placeholder="Nom, prénom ou matricule" role="combobox" aria-autocomplete="list" />
      <ul class="search-results" data-pay-results hidden></ul>
    </label>
    <div class="span-all" data-pay-card></div>
    <label>Montant payé (${escapeHtml(state.config.devise)})
      <span class="input-row"><input name="montant" data-pay="montant" type="number" min="1" step="1" required /><button type="button" class="secondary-btn small-btn" data-pay-solder>Solder tout</button></span>
    </label>
    <label>Moyen de paiement
      <select name="mode" data-pay="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </label>
    <label>Compte / caisse destinataire
      <select name="compteId" data-pay="compte">${comptesActifs(state).map((c) => `<option value="${c.id}" ${c.id === compteParDefaut(state, 'espece')?.id ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select>
    </label>
    <label>Date du paiement <input name="datePaiement" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
    <label>Référence (chèque, transaction…) <input name="reference" type="text" /></label>
    <label>Payeur (si différent de l’élève) <input name="payeur" type="text" /></label>
    <label>Description / motif <input name="motifPaiement" type="text" placeholder="Frais de scolarité" /></label>
    <label>Observation (facultatif) <input name="observation" type="text" maxlength="200" /></label>
    <label class="check-row span-two" data-pay-attente hidden><input type="checkbox" name="enAttente" /> En attente de confirmation (chèque non encore crédité, virement annoncé) : exclu des totaux jusqu’à sa confirmation</label>
    <p class="meta span-all">Caissier : <b>${escapeHtml(cashierName(state))}</b> — enregistré automatiquement sur le reçu et dans l’historique.</p>
    <div class="span-all" data-pay-preview></div>
    <p class="meta span-all">Après l’enregistrement, le reçu s’affiche automatiquement : imprimer, télécharger en PDF ou fermer.</p>
    <div class="form-actions span-all"><button type="submit" class="primary-btn" data-pay-submit disabled>Enregistrer le paiement</button></div>
  </form>`;
}

export function initPaymentForm(state) {
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
export function selectDebtForPayment(state, reliquatId) {
  const record = (state.reliquats || []).find((r) => r.id === Number(reliquatId));
  if (!record) return false;
  return selectStudentForPayment(state, record.inscriptionId);
}

// Utilisé après une inscription : sélectionne directement l'élève (année, fiche, échéancier pré-remplis)
export function selectStudentForPayment(state, inscriptionId) {
  const form = document.querySelector('form[data-form="paiement"]');
  const inscription = state.inscriptions.find((i) => i.id === Number(inscriptionId));
  if (!form || !inscription) return false;
  const volet = form.closest('details.form-pli');
  if (volet) volet.open = true; // formulaire replié derrière son bouton : ouvert pour l'élève choisi
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
export function bindPaymentForm(state) {
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement) || !t.matches('form[data-form="paiement"] [data-pay]')) return;
    root.state = state;
    root.form = t.closest('form');
    if (t.matches('[data-pay="montant"]')) { renderPreview(root); return; }
    if (t.matches('[data-pay="mode"]')) { syncMode(state, root.form); return; }
    if (t.matches('[data-pay="compte"]')) { t.dataset.touched = '1'; return; }
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
