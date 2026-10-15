import { escapeHtml, formatMoney, formatDateFr, todayISO, downloadCsv, downloadExcel } from './utils.js';
import { buildPeriodique, GRANULARITES } from './rapports-periodiques.js';
import { buildJournalier, buildDepenses, buildTresorerie, buildEcheances } from './rapports-compta.js';
import { studentName, scoped, pct, subtitle } from './rapports-utils.js';
import { categoriesInUse } from './depenses-view.js';
import { CATEGORIES } from './classes.js';
import { enteteLignes } from './entete.js';
import { echeanceReste, inscriptionSituation, scopeInscriptions, inRange, sumPayments, labelEcheance, studentOf, yearLabel, classOf, STATUT_LABELS } from './finance.js';
import { printDocument } from './print.js';
import { rappelsDus, DELAI_RAPPEL_JOURS } from './rappels.js';
import { MODALITES, modaliteActuelle } from './modalites.js';
import { enteteHtml } from './entete.js';

export const REPORT_TYPES = [
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

export function defaultReportFilters(state) {
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

export function reminderItems(state, f) {
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

export function buildReport(state, f) {
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

export function renderReportOutput(state, f) {
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

export function renderRapports(state, f) {
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

export function exportReport(state, f, format) {
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

export function printReport(state, f) {
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
export function selectReportType(f, type) {
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

export function printReminders(state, f) {
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
