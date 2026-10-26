import { escapeHtml, formatMoney, formatDateFr, todayISO } from './utils.js';
import { CATEGORIES } from './classes.js';
import { MODALITES } from './modalites.js';
import { listeCreances, syntheseCreances, creancesParClasse, creancesParAnnee, lignesRelance, STATUTS_CREANCE, ANCIENNETES } from './creances.js';
import { reductionLabel } from './reductions.js';
import { enteteHtml } from './entete.js';
import { printDocument } from './print.js';
import { can } from './auth.js';
import { downloadCsv } from './utils.js';

// Page « Créances et relances » : suivi des impayés, états de recouvrement et lettres de relance imprimables.
// Les relances sont des documents papier : aucun envoi automatique (SMS, messagerie) n'est effectué par l'application.

export const creanceFilters = { yearId: 0, category: '', classId: 0, statut: '', anciennete: '', reduction: false, search: '' };

export function resetCreanceFilters(state) {
  Object.assign(creanceFilters, { yearId: Number(state.anneeActiveId || 0), category: '', classId: 0, statut: '', anciennete: '', reduction: false, search: '' });
}

const BADGES = { retard: 'danger', partiel: 'warning', impaye: 'neutral', solde: 'ok' };

export function renderCreancesOutput(state) {
  const out = document.getElementById('creances-output');
  if (!out) return;
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const list = listeCreances(state, creanceFilters);
  const t = syntheseCreances(list);
  const parClasse = creancesParClasse(state, list);
  const parAnnee = creancesParAnnee(state);
  const exporter = can('export');
  out.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Attendu (sélection)</span><strong>${money(t.attendu)}</strong><small class="meta">${t.nombre} élève(s) avec un solde</small></div></article>
      <article class="stat-card accent-green"><div><span>Réglé</span><strong>${money(t.paye)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Reste à recouvrer</span><strong>${money(t.reste)}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Dont échu (en retard)</span><strong>${money(t.retard)}</strong><small class="meta">${t.enRetard} élève(s)</small></div></article>
    </div>
    ${exporter ? `<div class="form-actions">
      <button type="button" class="secondary-btn small-btn" data-action="creances:print-etat" ${list.length ? '' : 'disabled'}>Imprimer l’état de recouvrement</button>
      <button type="button" class="secondary-btn small-btn" data-action="creances:print-relances" ${list.some((c) => c.retardMontant > 0) ? '' : 'disabled'}>Imprimer les lettres de relance (élèves en retard)</button>
      <button type="button" class="secondary-btn small-btn" data-action="creances:csv" ${list.length ? '' : 'disabled'}>Exporter en CSV</button>
    </div>` : ''}
    <p class="meta">Les lettres de relance sont à imprimer et à remettre aux familles. L’application n’envoie ni SMS ni message : aucun service d’envoi n’est intégré.</p>
    <div class="table-wrap"><table class="data-list" data-list="creances" data-list-title="Créances scolaires">
      <thead><tr><th>Élève</th><th>Classe</th><th>Modalité</th><th>Attendu</th><th>Réglé</th><th>Reste</th><th>En retard</th><th>Prochaine échéance</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>${list.map((c) => `<tr>
        <td><b>${escapeHtml(c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—')}</b><div class="meta">${escapeHtml(c.eleve?.matricule || '')}</div>
          ${c.reduction ? `<div class="meta">🎓 ${escapeHtml(reductionLabel(c.reduction))} (−${formatMoney(c.remise)})</div>` : ''}
          ${c.enAttente ? `<div class="meta">⏳ ${money(c.enAttente)} en attente de confirmation</div>` : ''}
          ${c.dette ? `<div class="meta">Dette antérieure : ${money(c.dette)}</div>` : ''}</td>
        <td>${escapeHtml(c.classe?.nom || '—')}</td>
        <td>${escapeHtml(c.modalite ? MODALITES[c.modalite] : 'À choisir')}${c.mensualitesImpayees ? `<div class="meta">${c.mensualitesImpayees} mois non soldé(s)</div>` : ''}${c.tranchesPartielles ? `<div class="meta">${c.tranchesPartielles} tranche(s) partielle(s)</div>` : ''}</td>
        <td class="num">${money(c.attendu)}</td><td class="num">${money(c.paye)}</td><td class="num"><b>${money(c.reste)}</b></td>
        <td class="num">${c.retardMontant ? `<b class="neg">${money(c.retardMontant)}</b><div class="meta">${c.echeancesEnRetard.length} échéance(s) · ${c.joursRetard} j</div>` : '—'}</td>
        <td>${c.prochaine ? `${escapeHtml(formatDateFr(c.prochaine.dateLimite))}<div class="meta">${money(c.prochaineMontant)}</div>` : '—'}</td>
        <td><span class="badge ${BADGES[c.statut]}">${STATUTS_CREANCE[c.statut]}</span></td>
        <td>${can('write') ? `<button class="action-btn" data-action="creances:encaisser:${c.inscription.id}">Encaisser</button>` : ''}<button class="action-btn" data-action="eleve:profile:${c.inscription.eleveId}">Fiche</button>${exporter && c.retardMontant ? `<button class="action-btn" data-action="creances:relance:${c.inscription.id}">Relance</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="10">Aucune créance pour cette sélection.</td></tr>'}</tbody>
    </table></div>
    <div class="chart-grid">
      <div class="panel"><div class="panel-header"><h3>Créances par classe</h3><span class="meta">Sélection courante</span></div>
        <div class="table-wrap"><table><thead><tr><th>Classe</th><th>Élèves</th><th>Reste</th><th>En retard</th></tr></thead>
        <tbody>${parClasse.map((r) => `<tr><td>${escapeHtml(r.classe?.nom || '—')}</td><td>${r.nombre}</td><td class="num">${money(r.reste)}</td><td class="num">${money(r.retard)}</td></tr>`).join('') || '<tr><td colspan="4">Aucune créance.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="panel-header"><h3>Créances par année scolaire</h3><span class="meta">Toutes classes</span></div>
        <div class="table-wrap"><table><thead><tr><th>Année</th><th>Élèves</th><th>Reste</th><th>En retard</th></tr></thead>
        <tbody>${parAnnee.map((r) => `<tr><td>${escapeHtml(r.annee.annee)}${r.annee.statut === 'cloturee' ? ' <span class="badge neutral">clôturée</span>' : ''}</td><td>${r.nombre}</td><td class="num">${money(r.reste)}</td><td class="num">${money(r.retard)}</td></tr>`).join('') || '<tr><td colspan="4">Aucune créance.</td></tr>'}</tbody></table></div>
        <p class="meta">Le solde d’une année clôturée se reporte en dette antérieure depuis la page « Dettes antérieures ».</p></div>
    </div>`;
}

export function renderCreances(state) {
  const section = document.getElementById('creances');
  if (!section) return;
  const f = creanceFilters;
  const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === f.yearId) && (!f.category || c.categorie === f.category));
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Recouvrement</span><h2>Créances et relances</h2></div></div>
    <div class="panel">
      <div class="advanced-search">
        <label>Année scolaire <select data-cr="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === f.yearId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
        <label>Catégorie <select data-cr="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${c === f.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label>
        <label>Classe <select data-cr="classId"><option value="0">Toutes</option>${classes.map((c) => `<option value="${c.id}" ${c.id === f.classId ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></label>
        <label>Statut <select data-cr="statut"><option value="">Tous les soldes</option>${Object.entries(STATUTS_CREANCE).filter(([k]) => k !== 'solde').map(([k, l]) => `<option value="${k}" ${k === f.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Ancienneté <select data-cr="anciennete">${ANCIENNETES.map(([v, l]) => `<option value="${v}" ${v === String(f.anciennete) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Élève <input type="search" data-cr="search" value="${escapeHtml(f.search)}" placeholder="Nom ou matricule…" autocomplete="off" /></label>
        <label class="check-row"><input type="checkbox" data-cr="reduction" ${f.reduction ? 'checked' : ''} /> Avec réduction / bourse</label>
      </div>
      <div id="creances-output"></div>
    </div>`;
  renderCreancesOutput(state);
}

export function setCreanceFilter(state, key, target) {
  if (key === 'reduction') creanceFilters.reduction = target.checked;
  else if (key === 'yearId' || key === 'classId') creanceFilters[key] = Number(target.value || 0);
  else creanceFilters[key] = target.value;
  if (key === 'yearId' || key === 'category') { creanceFilters.classId = 0; renderCreances(state); return; }
  renderCreancesOutput(state);
}

const RELANCE_CSS = `
  .rl-letter { page-break-after: always; padding: 4mm 0; }
  .rl-letter:last-child { page-break-after: auto; }
  .rl-meta { display: flex; justify-content: space-between; margin: 12px 0; }
  .rl-letter h3 { text-align: center; margin: 14px 0; letter-spacing: .04em; }
  .rl-letter p { line-height: 1.6; }
  .rl-total { font-size: 15px; font-weight: bold; }
  .rl-sign { margin-top: 18mm; text-align: right; }
`;

function lettreHtml(state, c) {
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const annee = state.annees.find((a) => a.id === c.inscription.anneeId)?.annee || '—';
  return `<section class="rl-letter">
    ${enteteHtml(state.config, { compact: true })}
    <div class="rl-meta"><span>Élève : <b>${escapeHtml(c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—')}</b> (${escapeHtml(c.eleve?.matricule || '—')})<br>Classe : ${escapeHtml(c.classe?.nom || '—')} · Année scolaire ${escapeHtml(annee)}</span><span>Le ${escapeHtml(formatDateFr(todayISO()))}</span></div>
    <h3>LETTRE DE RELANCE — FRAIS DE SCOLARITÉ</h3>
    <p>Madame, Monsieur,</p>
    <p>Sauf erreur ou omission de notre part, les échéances suivantes de la scolarité de votre enfant restent impayées à ce jour :</p>
    <table><thead><tr><th>Échéance</th><th>Date limite</th><th class="num">Reste dû</th></tr></thead>
      <tbody>${lignesRelance(c).map((l) => `<tr><td>${escapeHtml(l.libelle)}</td><td>${escapeHtml(formatDateFr(l.dateLimite))}</td><td class="num">${money(l.reste)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Montant échu à régulariser</td><td class="num">${money(c.retardMontant)}</td></tr></tfoot></table>
    <p class="rl-total">Solde total restant pour l’année : ${money(c.reste)}${c.dette ? ` — dette antérieure : ${money(c.dette)}` : ''}</p>
    <p>Nous vous remercions de bien vouloir régulariser cette situation auprès de la comptabilité dans les meilleurs délais. Si le règlement a été effectué entre-temps, merci de présenter votre reçu.</p>
    <div class="rl-sign">La comptabilité</div>
  </section>`;
}

export function printRelances(state, inscriptionId = 0) {
  const list = listeCreances(state, inscriptionId ? { soldes: true } : creanceFilters)
    .filter((c) => c.retardMontant > 0 && (!inscriptionId || c.inscription.id === Number(inscriptionId)));
  if (!list.length) return false;
  return printDocument({ title: 'Lettres de relance', html: list.map((c) => lettreHtml(state, c)).join(''), css: RELANCE_CSS, fileName: `Relances-${todayISO()}` });
}

export function printEtatRecouvrement(state) {
  const list = listeCreances(state, creanceFilters);
  if (!list.length) return false;
  const t = syntheseCreances(list);
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const annee = state.annees.find((a) => a.id === creanceFilters.yearId)?.annee || 'Toutes années';
  const html = `${enteteHtml(state.config, { compact: true })}
    <div class="r-title"><h2>État de recouvrement des frais de scolarité</h2><span>${escapeHtml(annee)} · au ${escapeHtml(formatDateFr(todayISO()))}</span></div>
    <div class="r-kpis"><div>Attendu<strong>${money(t.attendu)}</strong></div><div>Réglé<strong>${money(t.paye)}</strong></div><div>Reste<strong>${money(t.reste)}</strong></div><div>Échu<strong>${money(t.retard)}</strong></div></div>
    <table><thead><tr><th>Matricule</th><th>Élève</th><th>Classe</th><th class="num">Attendu</th><th class="num">Réglé</th><th class="num">Reste</th><th class="num">Échu</th><th>Jours</th></tr></thead>
      <tbody>${list.map((c) => `<tr><td>${escapeHtml(c.eleve?.matricule || '')}</td><td>${escapeHtml(c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—')}</td><td>${escapeHtml(c.classe?.nom || '—')}</td><td class="num">${money(c.attendu)}</td><td class="num">${money(c.paye)}</td><td class="num">${money(c.reste)}</td><td class="num">${money(c.retardMontant)}</td><td>${c.joursRetard || ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">TOTAL (${t.nombre} élève(s))</td><td class="num">${money(t.attendu)}</td><td class="num">${money(t.paye)}</td><td class="num">${money(t.reste)}</td><td class="num">${money(t.retard)}</td><td></td></tr></tfoot></table>`;
  return printDocument({ title: 'État de recouvrement', html, page: 'A4 landscape', fileName: `Etat-recouvrement-${todayISO()}` });
}

export function exportCreancesCsv(state) {
  const list = listeCreances(state, creanceFilters);
  const rows = [['Matricule', 'Élève', 'Classe', 'Année', 'Modalité', 'Attendu', 'Réglé', 'Reste', 'Échu', 'Jours de retard', 'Réduction', 'Statut']];
  list.forEach((c) => rows.push([c.eleve?.matricule || '', c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '', c.classe?.nom || '', state.annees.find((a) => a.id === c.inscription.anneeId)?.annee || '',
    c.modalite ? MODALITES[c.modalite] : 'À choisir', c.attendu, c.paye, c.reste, c.retardMontant, c.joursRetard, c.reduction ? reductionLabel(c.reduction) : '', STATUTS_CREANCE[c.statut]]));
  downloadCsv(`creances-${todayISO()}.csv`, rows);
  return list.length;
}
