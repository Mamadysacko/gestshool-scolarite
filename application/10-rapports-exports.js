// GEST SCHOOL SCOLARITÉ · 10-rapports-exports.js
// Rapports : périodes, rapports comptables et périodiques, listes et exports
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/rapports.js, ./modules/rapports-utils.js, ./modules/rapports-periodiques.js, ./modules/rapports-compta.js, ./modules/listes.js, ./modules/etats.js, ./modules/etats-view.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/rapports.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO, downloadCsv, downloadExcel } = require("./utils.js");
    const { buildPeriodique, GRANULARITES } = require("./rapports-periodiques.js");
    const { buildJournalier, buildDepenses, buildTresorerie, buildEcheances } = require("./rapports-compta.js");
    const { studentName, scoped, pct, subtitle, PERIODICITES, semaineDe } = require("./rapports-utils.js");
    const { categoriesInUse } = require("./depenses-view.js");
    const { CATEGORIES } = require("./classes.js");
    const { enteteLignes } = require("./entete.js");
    const { echeanceReste, inscriptionSituation, scopeInscriptions, inRange, sumPayments, labelEcheance, studentOf, yearLabel, classOf, STATUT_LABELS } = require("./finance.js");
    const { printDocument } = require("./print.js");
    const { rappelsDus, DELAI_RAPPEL_JOURS } = require("./rappels.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
    const { enteteHtml } = require("./entete.js");
    const { telephoneFamille } = require("./contacts.js");
    // Nom de fichier lisible (sans accents ni caractères spéciaux) pour l'enregistrement en PDF
    const fichier = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-');
    
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
      return { type: 'periodique', gran: 'mois', refJour: today, refSemaine: semaineDe(today), refMois: today.slice(0, 7), category: '', yearId: Number(state.anneeActiveId || 0), classId: 0, from: `${today.slice(0, 4)}-01-01`, to: today, search: '', categorieDepense: '', demandeur: '', dateRef: '' };
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
        return { cells: [s?.matricule || '—', studentName(state, inscription), classOf(state, inscription.classeId)?.nom || '—', labelEcheance(echeance), echeance.dateLimite, jours, echeanceReste(echeance), telephoneFamille(state, s) || s?.parent || '—'] };
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
            <label>Élève / matricule <input type="search" data-rf="search" placeholder="Nom ou matricule…" value="${escapeHtml(f.search)}" autocomplete="off" /></label>
            <label ${expenseTab ? '' : 'hidden'}>Catégorie de dépense
              <select data-rf="categorieDepense"><option value="">Toutes</option>${categoriesInUse(state).map((c) => `<option value="${escapeHtml(c)}" ${c === f.categorieDepense ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
            </label>
            <label ${f.type === 'depenses' ? '' : 'hidden'}>Demandeur <input type="search" data-rf="demandeur" value="${escapeHtml(f.demandeur)}" autocomplete="off" /></label>
            <label ${f.type === 'rappels' ? '' : 'hidden'}>Date de référence <input type="date" data-rf="dateRef" value="${escapeHtml(f.dateRef || todayISO())}" /></label>
            <label ${dated ? '' : 'hidden'}>Périodicité
              <select data-rf="gran">${PERIODICITES.map(([k, l]) => `<option value="${k}" ${k === f.gran ? 'selected' : ''}>${l}</option>`).join('')}</select>
            </label>
            <label ${dated && f.gran === 'jour' ? '' : 'hidden'}>Date <input type="date" data-rf="refJour" value="${escapeHtml(f.refJour || todayISO())}" /></label>
            <label ${dated && f.gran === 'semaine' ? '' : 'hidden'}>Semaine <input type="week" data-rf="refSemaine" value="${escapeHtml(f.refSemaine || semaineDe(todayISO()))}" /></label>
            <label ${dated && f.gran === 'mois' ? '' : 'hidden'}>Mois <input type="month" data-rf="refMois" value="${escapeHtml(f.refMois || todayISO().slice(0, 7))}" /></label>
            <label ${dated && f.gran === 'perso' ? '' : 'hidden'}>Du <input type="date" data-rf="from" value="${escapeHtml(f.from)}" /></label>
            <label ${dated && f.gran === 'perso' ? '' : 'hidden'}>Au <input type="date" data-rf="to" value="${escapeHtml(f.to)}" /></label>
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
      const city = String(config.adresse || '').split(',')[0].trim();
      const now = new Date();
      return `<footer class="r-signatures">
        <p class="r-date">${city ? `Fait à ${escapeHtml(city)}, le` : 'Fait le'} <b>${escapeHtml(formatDateFr(todayISO()))}</b> à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
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
      return printDocument({ title: report.title, html, css, page: report.portrait ? 'A4 portrait' : 'A4 landscape', fileName: fichier(`${report.title}-${todayISO()}`) });
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
      return printDocument({ title: 'Fiches de rappel', html: pages.join(''), css: REMINDER_CSS, margin: '0', fileName: `Fiches-de-rappel-${f.dateRef || todayISO()}` });
    }
    
    Object.assign(exports, { REPORT_TYPES, defaultReportFilters, reminderItems, buildReport, renderReportOutput, renderRapports, exportReport, printReport, selectReportType, printReminders });
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
      if (withDates) parts.push(periodeDuRapport(state, f).libelle);
      return parts.join(' · ');
    }
    
    function expenseFilters(state, f) {
      const p = periodeDuRapport(state, f);
      return { yearId: f.yearId, from: p.from, to: p.to, categorie: f.categorieDepense, demandeur: f.demandeur };
    }
    
    function expenseSubtitle(state, f) {
      const parts = [`Année : ${f.yearId ? yearLabel(state, f.yearId) : 'toutes'}`, periodeDuRapport(state, f).libelle];
      if (f.categorieDepense) parts.push(`Catégorie : ${f.categorieDepense}`);
      if (f.demandeur) parts.push(`Demandeur : ${f.demandeur}`);
      return parts.join(' · ');
    }
    
    // ── Période d'un rapport : journalier (une date), hebdomadaire (semaine ISO, lundi → dimanche), mensuel (du 1er au
    // dernier jour du mois), annuel (dates officielles de l'année scolaire) ou période personnalisée. Les données sont
    // filtrées strictement entre ces deux dates incluses : aucune opération d'un autre jour, d'une autre semaine ou
    // d'un autre mois n'est comptée. ──
    const PERIODICITES = [['jour', 'Journalier'], ['semaine', 'Hebdomadaire'], ['mois', 'Mensuel'], ['annee', 'Annuel (année scolaire)'], ['perso', 'Période personnalisée']];
    const pad = (n) => String(n).padStart(2, '0');
    const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    // Semaine ISO « 2026-W42 » → lundi et dimanche
    function bornesSemaine(semaine) {
      const m = /^(\d{4})-W(\d{2})$/.exec(semaine || '');
      if (!m) return null;
      const year = Number(m[1]); const week = Number(m[2]);
      const jan4 = new Date(year, 0, 4);
      const lundi = new Date(jan4);
      lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
      const dimanche = new Date(lundi);
      dimanche.setDate(lundi.getDate() + 6);
      return { from: isoDate(lundi), to: isoDate(dimanche) };
    }
    
    function semaineDe(iso) {
      const [y, mo, d] = iso.split('-').map(Number);
      const date = new Date(Date.UTC(y, mo - 1, d));
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return `${date.getUTCFullYear()}-W${pad(Math.ceil(((date - yearStart) / 86400000 + 1) / 7))}`;
    }
    
    function bornesMois(mois) {
      const m = /^(\d{4})-(\d{2})$/.exec(mois || '');
      if (!m) return null;
      const dernier = new Date(Number(m[1]), Number(m[2]), 0).getDate();
      return { from: `${mois}-01`, to: `${mois}-${pad(dernier)}` };
    }
    
    function periodeDuRapport(state, f, today = new Date().toISOString().slice(0, 10)) {
      const gran = PERIODICITES.some(([k]) => k === f.gran) ? f.gran : 'mois';
      if (gran === 'jour') { const d = /^\d{4}-\d{2}-\d{2}$/.test(f.refJour || '') ? f.refJour : today; return { gran, from: d, to: d, libelle: `Journée du ${formatDateFr(d)}` }; }
      if (gran === 'semaine') { const w = bornesSemaine(f.refSemaine) || bornesSemaine(semaineDe(today)); return { gran, ...w, libelle: `Semaine du ${formatDateFr(w.from)} au ${formatDateFr(w.to)}` }; }
      if (gran === 'mois') { const b = bornesMois(f.refMois) || bornesMois(today.slice(0, 7)); return { gran, ...b, libelle: `Mois du ${formatDateFr(b.from)} au ${formatDateFr(b.to)}` }; }
      if (gran === 'annee') {
        const annee = state.annees.find((a) => a.id === Number(f.yearId)) || state.annees.find((a) => a.id === state.anneeActiveId);
        return { gran, from: annee?.dateDebut || '', to: annee?.dateFin || '', libelle: annee ? `Année scolaire ${annee.annee}${annee.dateDebut ? ` (${formatDateFr(annee.dateDebut)} → ${formatDateFr(annee.dateFin)})` : ''}` : 'Toute la période' };
      }
      return { gran, from: f.from || '', to: f.to || '', libelle: f.from || f.to ? `Période du ${f.from ? formatDateFr(f.from) : '…'} au ${f.to ? formatDateFr(f.to) : '…'}` : 'Toute la période' };
    }
    
    // Granularité des tableaux d'évolution selon la période
    function granulariteTableau(p) {
      if (p.gran === 'annee') return 'mois';
      if (p.gran === 'perso' && p.from && p.to) {
        const jours = (new Date(p.to) - new Date(p.from)) / 86400000;
        return jours > 120 ? 'mois' : jours > 31 ? 'semaine' : 'jour';
      }
      return 'jour';
    }
    
    Object.assign(exports, { studentName, scoped, pct, subtitle, expenseFilters, expenseSubtitle, PERIODICITES, bornesSemaine, semaineDe, bornesMois, periodeDuRapport, granulariteTableau });
  };
  factories['./modules/rapports-periodiques.js'] = (require, exports) => {
    const { formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { scopeInscriptions, inRange, sumPayments, inscriptionSituation, classOf, yearLabel } = require("./finance.js");
    const { COLORS, MONTHS, lineChart, groupedBars, donut } = require("./charts.js");
    const { paymentAllocations } = require("./allocation.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
    const { recettesFiltrees } = require("./tresorerie.js");
    const { periodeDuRapport, granulariteTableau, PERIODICITES } = require("./rapports-utils.js");
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
      const periode = periodeDuRapport(state, f);
      const gran = granulariteTableau(periode);
      const from = periode.from || `${new Date().getFullYear()}-01-01`;
      const to = periode.to || todayISO();
      const inscriptions = scopeInscriptions(state, { yearId: f.yearId, classId: f.classId, category: f.category });
      // Toutes les inscriptions (une dette antérieure réglée cette année porte sur une inscription d'une autre année)
      const byId = new Map(state.inscriptions.map((i) => [i.id, i]));
      const allPayments = recettesFiltrees(state, { yearId: f.yearId, classId: f.classId, category: f.category });
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
        title: `Rapport financier ${(PERIODICITES.find(([k]) => k === periode.gran)?.[1] || '').toLowerCase()}`,
        subtitle: `${subtitle} · ${periode.libelle}`,
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
    const { depensesFiltrees, recettesFiltrees, entreesFiltrees, situationCaisse, somme, paymentYear } = require("./tresorerie.js");
    const { bucketOf, buckets } = require("./rapports-periodiques.js");
    const { echeancierSituation, STATUT_ECHEANCE_LABELS, paymentAllocations, allocationLabel } = require("./allocation.js");
    const { COLORS, groupedBars, donut } = require("./charts.js");
    const { studentName, scoped, pct, subtitle, expenseFilters, expenseSubtitle, periodeDuRapport, granulariteTableau } = require("./rapports-utils.js");
    const PIE = ['#f97316', '#7c3aed', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af'];
    
    // Recettes encaissées sur la période et l'année (règlements de dettes antérieures compris, comptés sur leur année
    // d'encaissement), restreintes au périmètre classe / catégorie / élève : exactement les recettes de la caisse.
    function recettesDuPerimetre(state, f, from, to) {
      const q = String(f.search || '').trim().toLocaleLowerCase('fr');
      return recettesFiltrees(state, { yearId: f.yearId, classId: f.classId, category: f.category, from, to }).filter((p) => {
        if (!q) return true;
        const s = studentOf(state, state.inscriptions.find((i) => i.id === p.inscriptionId));
        return `${s?.prenom || ''} ${s?.nom || ''} ${s?.matricule || ''}`.toLocaleLowerCase('fr').includes(q);
      });
    }
    
    // Recettes et dépenses d'une journée, d'une semaine, d'un mois ou d'une année scolaire, avec la synthèse de caisse
    function buildJournalier(state, f) {
      const periode = periodeDuRapport(state, f);
      const payments = recettesDuPerimetre(state, f, periode.from, periode.to);
      const ids = new Map(payments.map((p) => [p.inscriptionId, state.inscriptions.find((i) => i.id === p.inscriptionId)]));
      const groups = new Map();
      payments.forEach((p) => {
        const inscription = ids.get(p.inscriptionId);
        const classe = classOf(state, inscription?.classeId);
        // Règlement d'une dette d'une année antérieure : regroupé à part (encaissé sur l'année, dû sur une autre)
        const key = p.reliquatId || (inscription && paymentYear(state, p) !== inscription.anneeId) ? 'zz|Dettes antérieures' : `${classe?.categorie || ''}|${classe?.nom || ''}`;
        if (!groups.has(key)) groups.set(key, { classe, items: [] });
        groups.get(key).items.push({ p, inscription });
      });
      const rows = [];
      [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')).forEach(([key, { classe, items }]) => {
        const dettes = key.startsWith('zz|');
        items.sort((a, b) => String(a.p.datePaiement).localeCompare(String(b.p.datePaiement)) || a.p.id - b.p.id).forEach(({ p, inscription }) => {
          const detail = paymentAllocations(p).map((a) => allocationLabel(inscription, a)).join(' + ');
          const cl = classOf(state, inscription?.classeId);
          rows.push({ cells: [dettes ? `Dette ${state.annees.find((a) => a.id === inscription?.anneeId)?.annee || ''} — ${cl?.nom || '—'}` : `${cl?.nom || '—'} (${cl?.categorie || '—'})`, p.datePaiement, p.numeroRecu || '—', studentOf(state, inscription)?.matricule || '—', studentName(state, inscription), detail, p.mode, p.caissier || '—', p.montant] });
        });
        rows.push({ cls: 'sub', cells: [dettes ? 'Sous-total dettes antérieures' : `Sous-total ${classe?.nom || ''}`, '', '', '', '', '', '', `${items.length} paiement(s)`, sumPayments(items.map((i) => i.p))] });
      });
      const total = sumPayments(payments);
      const expenses = depensesFiltrees(state, { yearId: f.yearId, from: periode.from, to: periode.to }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const totalDep = somme(expenses, 'montant');
      const entrees = entreesFiltrees(state, { yearId: f.yearId, from: periode.from, to: periode.to });
      const caisse = situationCaisse(state, { yearId: f.yearId, from: periode.from, to: periode.to });
      const perimetre = Boolean(f.classId || f.category || String(f.search || '').trim());
      return {
        title: `Recettes et dépenses — ${periode.libelle}`, subtitle: subtitle(state, f, true),
        kpis: [['Solde d’ouverture de la période', caisse.ouverture, true], [perimetre ? 'Recettes du périmètre' : 'Recettes', total, true], ['Autres entrées', caisse.autres, true], ['Dépenses', totalDep, true],
          ['Résultat de la période', caisse.recettes + caisse.autres - caisse.depenses, true], ['Solde de clôture', caisse.solde, true]],
        sections: [
          { title: 'Recettes (encaissements)', head: ['Classe', 'Date', 'N° reçu', 'Matricule', 'Élève', 'Imputé sur', 'Mode', 'Caissier', 'Montant'],
            money: [8], rows, foot: ['TOTAL RECETTES', '', '', '', '', '', '', `${payments.length} paiement(s)`, total], empty: 'Aucun paiement sur cette période.' },
          { title: 'Dépenses', head: ['N°', 'Date', 'Catégorie', 'Description', 'Bénéficiaire', 'Demandé par', 'Montant'], money: [6],
            rows: expenses.map((d) => ({ cells: [d.numero, d.date, d.categorie, d.description, d.beneficiaire || '—', d.demandeur, d.montant] })),
            foot: ['TOTAL DÉPENSES', '', '', '', '', `${expenses.length} dépense(s)`, totalDep], empty: 'Aucune dépense sur cette période.' },
          ...(entrees.length ? [{ title: 'Autres entrées de caisse', head: ['Date', 'Libellé', 'Montant'], money: [2], rows: entrees.map((e) => ({ cells: [e.date, e.libelle || '—', e.montant] })), foot: ['TOTAL', '', somme(entrees, 'montant')], empty: '' }] : []),
          { title: `Synthèse de caisse${perimetre ? ' (tout l’établissement)' : ''}`, head: ['Élément', 'Montant'], money: [1], rows: [
            { cells: ['Solde d’ouverture de la période', caisse.ouverture] }, { cells: ['+ Recettes (scolarité et dettes)', caisse.recettes] }, { cells: ['+ Autres entrées (remboursements d’avances)', caisse.autres] }, { cells: ['− Dépenses', caisse.depenses] }],
          foot: ['SOLDE DE CLÔTURE', caisse.solde], empty: '' }
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
      const ef = expenseFilters(state, f);
      const list = depensesFiltrees(state, ef).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const total = somme(list, 'montant');
      const caisse = situationCaisse(state, { yearId: f.yearId, from: ef.from, to: ef.to });
      const byCat = groupExpenses(list, (d) => d.categorie);
      const byWho = groupExpenses(list, (d) => d.demandeur);
      const rowsOf = (groups) => groups.map((g) => ({ cells: [g.label, g.nb, g.total, pct(g.total, total)] }));
      return {
        title: 'Aperçu des dépenses', subtitle: expenseSubtitle(state, f),
        kpis: [['Solde d’ouverture de la période', caisse.ouverture, true], ['Entrées de la période', caisse.recettes + caisse.autres, true], ['Dépenses de la période', caisse.depenses, true], ['Solde de clôture', caisse.solde, true]],
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
      const periode = periodeDuRapport(state, f);
      const gran = granulariteTableau(periode);
      const all = [...recettesFiltrees(state, { yearId: f.yearId }).map((p) => p.datePaiement), ...depensesFiltrees(state, { yearId: f.yearId }).map((d) => d.date)].sort();
      const today = todayISO();
      const from = periode.from || all[0] || today;
      const to = periode.to || today;
      const slots = buckets(from, to, gran);
      const add = (date, key, amount) => {
        const slot = slots.get(bucketOf(date, gran).key);
        if (slot) slot[key] = (slot[key] || 0) + Number(amount || 0);
      };
      recettesFiltrees(state, { yearId: f.yearId, from, to }).forEach((p) => add(p.datePaiement, 'rec', p.montant));
      entreesFiltrees(state, { yearId: f.yearId, from, to }).forEach((e) => add(e.date, 'rec', e.montant));
      depensesFiltrees(state, { yearId: f.yearId, from, to }).forEach((d) => add(d.date, 'dep', d.montant));
      const caisse = situationCaisse(state, { yearId: f.yearId, from: periode.from, to });
      let cumul = caisse.ouverture;
      const series = [...slots.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => s);
      const rows = series.map((s) => {
        const rec = s.rec || 0;
        const dep = s.dep || 0;
        cumul += rec - dep;
        return { cells: [s.label, rec, dep, rec - dep, cumul] };
      });
      return {
        title: `Flux de trésorerie — ${periode.libelle}`, subtitle: expenseSubtitle(state, f),
        kpis: [['Solde d’ouverture de la période', caisse.ouverture, true], ['Entrées', caisse.recettes + caisse.autres, true], ['Dépenses', caisse.depenses, true], ['Solde de clôture', caisse.solde, true]],
        sections: [{
          title: 'Entrées, dépenses et solde par période', head: ['Période', 'Entrées', 'Dépenses', 'Résultat', 'Solde cumulé'], money: [1, 2, 3, 4], rows,
          foot: ['TOTAL', caisse.recettes + caisse.autres, caisse.depenses, caisse.recettes + caisse.autres - caisse.depenses, caisse.solde], empty: 'Aucun mouvement.',
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
    
    Object.assign(exports, { recettesDuPerimetre, buildJournalier, buildDepenses, buildTresorerie, buildEcheances });
  };
  factories['./modules/listes.js'] = (require, exports) => {
    const { escapeHtml, formatDateFr, todayISO, downloadExcel } = require("./utils.js");
    const { enteteHtml, enteteLignes } = require("./entete.js");
    const { printDocument } = require("./print.js");
    const { can } = require("./auth.js");
    // Présentation uniforme de toutes les listes (tableaux marqués data-list="…") :
    // barre d'outils (nombre de résultats, Ajouter, Excel, PDF / Imprimer), pagination et lignes par page.
    // La pagination s'applique APRÈS les filtres de la page (lignes masquées par un filtre exclues) ; les exports
    // reprennent toutes les lignes filtrées (toutes pages), jamais les lignes masquées par un filtre.
    const SIZES = [10, 25, 50, 100];
    const pages = new Map();
    let ctx = { state: null };
    
    const isEmptyRow = (row) => row.cells.length === 1 && row.cells[0].colSpan > 1;
    const visibleRows = (table) => [...(table.tBodies[0]?.rows || [])].filter((r) => !r.hidden && !isEmptyRow(r));
    
    function toolbarHtml(table, info) {
      const add = table.dataset.listAdd;
      return `<div class="list-toolbar-info"><b>${info.total}</b> ${info.total > 1 ? 'résultats' : 'résultat'}${info.pages > 1 ? ` · ${info.from}–${info.to}` : ''}</div>
        <div class="list-toolbar-actions">
          ${add && can('write') ? `<button type="button" class="primary-btn small-btn" data-list-add="${escapeHtml(add)}">+ Ajouter</button>` : ''}
          ${can('export') ? `<button type="button" class="secondary-btn small-btn" data-list-export="excel" data-list-id="${escapeHtml(table.dataset.list)}" ${info.total ? '' : 'disabled'}>Excel</button>
          <button type="button" class="secondary-btn small-btn" data-list-export="pdf" data-list-id="${escapeHtml(table.dataset.list)}" ${info.total ? '' : 'disabled'}>PDF / Imprimer</button>` : ''}
        </div>`;
    }
    
    function pagerHtml(table, info) {
      if (info.total <= SIZES[0]) return '';
      const id = escapeHtml(table.dataset.list);
      return `<label class="list-size">Lignes par page <select data-list-size="${id}">${SIZES.map((s) => `<option value="${s}" ${s === info.size ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <div class="list-pages" role="navigation" aria-label="Pagination">
          <button type="button" class="secondary-btn small-btn" data-list-page="${id}" data-to="prev" ${info.page === 0 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
          <span>Page ${info.page + 1} / ${info.pages}</span>
          <button type="button" class="secondary-btn small-btn" data-list-page="${id}" data-to="next" ${info.page >= info.pages - 1 ? 'disabled' : ''} aria-label="Page suivante">›</button>
        </div>`;
    }
    
    function setHtml(el, html) {
      if (el.innerHTML !== html) el.innerHTML = html; // évite toute boucle avec l'observateur de mutations
    }
    
    function enhance(table) {
      const id = table.dataset.list;
      const wrap = table.closest('.table-wrap') || table;
      const rows = visibleRows(table);
      const st = pages.get(id) || { page: 0, size: 25, total: -1 };
      if (st.total !== rows.length) st.page = 0; // nouveau filtre : retour à la première page
      st.total = rows.length;
      const nbPages = Math.max(1, Math.ceil(rows.length / st.size));
      st.page = Math.min(st.page, nbPages - 1);
      pages.set(id, st);
      [...(table.tBodies[0]?.rows || [])].forEach((r) => r.classList.remove('pg-off'));
      rows.forEach((r, i) => r.classList.toggle('pg-off', i < st.page * st.size || i >= (st.page + 1) * st.size));
      const info = { total: rows.length, page: st.page, pages: nbPages, size: st.size, from: rows.length ? st.page * st.size + 1 : 0, to: Math.min((st.page + 1) * st.size, rows.length) };
      let bar = wrap.previousElementSibling;
      if (!bar?.matches?.(`.list-toolbar[data-for="${CSS.escape(id)}"]`)) {
        bar = document.createElement('div');
        bar.className = 'list-toolbar';
        bar.dataset.for = id;
        wrap.before(bar);
      }
      setHtml(bar, toolbarHtml(table, info));
      let pager = wrap.nextElementSibling;
      if (!pager?.matches?.(`.list-pager[data-for="${CSS.escape(id)}"]`)) {
        pager = document.createElement('div');
        pager.className = 'list-pager';
        pager.dataset.for = id;
        wrap.after(pager);
      }
      setHtml(pager, pagerHtml(table, info));
    }
    
    function enhanceLists(root = document) {
      root.querySelectorAll('table[data-list]').forEach(enhance);
    }
    
    // Colonnes exportées : toutes sauf « Actions » et les colonnes sans titre (photo, sélection)
    function exportColumns(table) {
      return [...table.tHead.rows[0].cells].map((th, i) => ({ i, label: th.textContent.trim() })).filter((c) => c.label && !/^actions?$/i.test(c.label) && !table.tHead.rows[0].cells[c.i].hasAttribute('data-noexport'));
    }
    
    const cellText = (cell) => (cell?.innerText || cell?.textContent || '').replace(/\s+/g, ' ').trim();
    
    // Montant « 1 200 000 GNF » → nombre (mis en forme par Excel)
    function asValue(text, devise) {
      const t = text.replace(new RegExp(`\\s*${devise}$`), '');
      return /^-?[\d\s  ]+$/.test(t) && /\d/.test(t) ? Number(t.replace(/[\s  ]/g, '')) : text;
    }
    
    // Filtres actifs du panneau de la liste (libellé : valeur), repris dans l'en-tête des exports
    function filtersSummary(table) {
      // Les filtres peuvent être dans un panneau distinct de celui du tableau : on parcourt toute la page
      const page = table.closest('.content-section') || table.closest('.panel');
      const parts = [];
      page?.querySelectorAll('.advanced-search label, .search-bar label').forEach((label) => {
        const field = label.querySelector('input, select');
        if (!field || !field.value || field.type === 'hidden') return;
        const name = (label.childNodes[0]?.textContent || '').trim();
        const value = field.tagName === 'SELECT' ? field.selectedOptions[0]?.textContent : field.value;
        if (name && value && !/^tou(te)?s$/i.test(value)) parts.push(`${name} : ${field.type === 'date' ? formatDateFr(value) : value}`);
      });
      return parts.join(' · ');
    }
    
    function exportList(id, format) {
      const table = document.querySelector(`table[data-list="${CSS.escape(id)}"]`);
      if (!table || !ctx.state || !can('export')) return false;
      const devise = ctx.state.config.devise;
      const cols = exportColumns(table);
      const rows = visibleRows(table).map((r) => cols.map((c) => cellText(r.cells[c.i])));
      const title = table.dataset.listTitle || 'Liste';
      const filtres = filtersSummary(table);
      const fileBase = `${title}-${todayISO()}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-');
      if (format === 'excel') {
        const tag = (row, kind) => Object.assign(row, { kind });
        const data = [...enteteLignes(ctx.state.config).map((l) => tag(l, 'entete')), [], tag([title], 'title'), [filtres || 'Aucun filtre'], [`Généré le ${formatDateFr(todayISO())} · ${rows.length} ligne(s)`], [],
          tag(cols.map((c) => c.label), 'head'), ...rows.map((r) => r.map((v) => asValue(v, devise)))];
        downloadExcel(`${fileBase}.xls`, title, data);
        return true;
      }
      const html = `${enteteHtml(ctx.state.config)}
        <div class="r-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(filtres || 'Aucun filtre')}</span><span>Généré le ${escapeHtml(formatDateFr(todayISO()))} · ${rows.length} ligne(s)</span></div>
        <table><thead><tr>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td class="${typeof asValue(v, devise) === 'number' ? 'num' : ''}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return printDocument({ title, html, css: '#print-root td { font-size: 10px; } #print-root th { font-size: 9px; }', page: cols.length > 7 ? 'A4 landscape' : 'A4 portrait', fileName: fileBase });
    }
    
    let timer = null;
    function bindLists(state) {
      ctx = { state };
      const main = document.querySelector('.main-panel') || document.body;
      // Toute mise à jour d'une liste (rendu, filtre) réapplique la pagination
      new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => enhanceLists(), 30); })
        .observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const pageBtn = event.target.closest('[data-list-page]');
        if (pageBtn) {
          const st = pages.get(pageBtn.dataset.listPage);
          if (st) { st.page += pageBtn.dataset.to === 'next' ? 1 : -1; enhanceLists(); }
          return;
        }
        const exp = event.target.closest('[data-list-export]');
        if (exp) { exportList(exp.dataset.listId, exp.dataset.listExport); return; }
        const add = event.target.closest('[data-list-add]');
        if (add) {
          const form = document.querySelector(add.dataset.listAdd);
          form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          form?.querySelector('input:not([type=hidden]), select')?.focus({ preventScroll: true });
        }
      });
      document.addEventListener('change', (event) => {
        const sel = event.target instanceof Element ? event.target.closest('[data-list-size]') : null;
        if (!sel) return;
        const st = pages.get(sel.dataset.listSize);
        if (st) { st.size = Number(sel.value); st.page = 0; enhanceLists(); }
      });
    }
    
    Object.assign(exports, { enhanceLists, exportList, bindLists });
  };
  factories['./modules/etats.js'] = (require, exports) => {
    const { todayISO } = require("./utils.js");
    const { inscriptionSituation, studentOf, classOf, yearLabel } = require("./finance.js");
    const { resteEcheance, ordreEcheances, libelleEcheance } = require("./allocation.js");
    const { paymentYear, situationCaisse } = require("./tresorerie.js");
    const { soldesComptes, compteLabel, TYPES_COMPTE } = require("./comptes.js");
    const { listeCreances } = require("./creances.js");
    const { mouvementsCompte, soldeOuvertureTheorique } = require("./caisse.js");
    const { MODES_PAIEMENT } = require("./paiements.js");
    const { reductionLabel, TYPES_REDUCTION } = require("./reductions.js");
    const { STATUTS_ATTENTE } = require("./attente.js");
    const { logOperation } = require("./audit.js");
    const { exiger } = require("./auth.js");
    // États financiers : chaque rapport produit un tableau unique { titre, colonnes, lignes, total, notes }.
    // Le même tableau sert à l'écran, à l'impression (PDF) et aux exports Excel / CSV : les chiffres exportés sont
    // exactement ceux affichés. Tous les montants viennent des opérations enregistrées ; les opérations annulées et les
    // règlements en attente sont exclus des totaux, sauf dans les états qui les listent explicitement.
    // Il s'agit d'une GESTION DE TRÉSORERIE ET DE RECOUVREMENT, pas d'une comptabilité générale (pas de plan comptable
    // ni d'écritures en partie double) : aucune conformité comptable ou fiscale n'est revendiquée.
    
    const ETATS = [
      { id: 'attendus', label: 'Frais attendus, encaissés, restants', groupe: 'Recouvrement' },
      { id: 'debiteurs', label: 'Élèves débiteurs', groupe: 'Recouvrement' },
      { id: 'retards', label: 'Échéances en retard', groupe: 'Recouvrement' },
      { id: 'reductions', label: 'Réductions et exonérations', groupe: 'Recouvrement' },
      { id: 'recettes', label: 'Recettes par période', groupe: 'Recettes' },
      { id: 'agents', label: 'Recettes par agent', groupe: 'Recettes' },
      { id: 'modes', label: 'Recettes par mode de paiement', groupe: 'Recettes' },
      { id: 'depenses', label: 'Dépenses par catégorie et période', groupe: 'Dépenses' },
      { id: 'journal-caisse', label: 'Journal de caisse', groupe: 'Trésorerie' },
      { id: 'tresorerie', label: 'Situation de trésorerie', groupe: 'Trésorerie' },
      { id: 'clotures', label: 'Clôtures de caisse et rapprochements', groupe: 'Trésorerie' },
      { id: 'comparaison', label: 'Comparaison des années scolaires', groupe: 'Pilotage' },
      { id: 'budget', label: 'Budget prévisionnel et réalisé', groupe: 'Pilotage' },
      { id: 'annulations', label: 'Annulations et corrections', groupe: 'Contrôle' },
      { id: 'transactions', label: 'Historique des transactions', groupe: 'Contrôle' }
    ];
    
    const GRANULARITES = { jour: 'Par jour', mois: 'Par mois', annee: 'Par année civile' };
    
    function filtresEtatsDefaut(state) {
      return { type: 'attendus', yearId: Number(state.anneeActiveId || 0), category: '', classId: 0, from: '', to: '', agent: '', mode: '', compteId: 0, gran: 'mois', search: '' };
    }
    
    const num = (v) => Number(v || 0);
    const veilleDe = (iso) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const dans = (date, f) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
    const agentDe = (op) => op.utilisateur || op.caissier || '—';
    const nomEleve = (state, i) => { const e = studentOf(state, i); return e ? `${e.prenom} ${e.nom}` : '—'; };
    const periodeCle = (date, gran) => (gran === 'jour' ? date : gran === 'annee' ? date.slice(0, 4) : date.slice(0, 7));
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const periodeLibelle = (cle, gran) => (gran === 'mois' ? `${MOIS[Number(cle.slice(5, 7)) - 1]} ${cle.slice(0, 4)}` : gran === 'jour' ? cle.split('-').reverse().join('/') : cle);
    
    // Inscriptions du périmètre (année, catégorie, classe)
    function inscriptionsFiltrees(state, f) {
      return state.inscriptions.filter((i) => (!f.yearId || i.anneeId === Number(f.yearId)) && (!f.classId || i.classeId === Number(f.classId))
        && (!f.category || classOf(state, i.classeId)?.categorie === f.category));
    }
    
    // Paiements valides du périmètre : année d'encaissement, classe, catégorie, période, agent, mode, compte
    function paiementsFiltres(state, f, { annules = false } = {}) {
      return state.paiements.filter((p) => {
        if (!annules && p.annule) return false;
        if (f.yearId && paymentYear(state, p) !== Number(f.yearId)) return false;
        if (!dans(p.datePaiement, f)) return false;
        if (f.agent && agentDe(p) !== f.agent) return false;
        if (f.mode && p.mode !== f.mode) return false;
        if (f.compteId && Number(p.compteId) !== Number(f.compteId)) return false;
        if (f.classId || f.category) {
          const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
          if (f.classId && i?.classeId !== Number(f.classId)) return false;
          if (f.category && classOf(state, i?.classeId)?.categorie !== f.category) return false;
        }
        return true;
      });
    }
    
    function depensesFiltrees(state, f, { annulees = false } = {}) {
      return state.depenses.filter((d) => (annulees || !d.annule) && (!f.yearId || d.anneeId === Number(f.yearId)) && dans(d.date, f)
        && (!f.compteId || Number(d.compteId) === Number(f.compteId)) && (!f.agent || agentDe(d) === f.agent) && (!f.mode || d.mode === f.mode));
    }
    
    const somme = (lignes, col) => lignes.reduce((s, l) => s + num(l[col]), 0);
    const tot = (lignes, cols, label = 'TOTAL', width = 0) => [label, ...Array(Math.max(width - 1, 0)).fill(''), ...cols.map((c) => somme(lignes, c))];
    
    const ETAT_BUILDERS = {
      attendus(state, f) {
        const groupes = new Map();
        inscriptionsFiltrees(state, f).forEach((i) => {
          const s = inscriptionSituation(state, i);
          const remise = (i.echeances || []).reduce((t, e) => t + num(e.remise), 0);
          const g = groupes.get(i.classeId) || { classe: classOf(state, i.classeId), effectif: 0, brut: 0, remise: 0, attendu: 0, paye: 0, reste: 0, retard: 0 };
          g.effectif += 1; g.brut += s.total + remise; g.remise += remise; g.attendu += s.total; g.paye += s.paye; g.reste += s.reste; g.retard += s.retardMontant;
          groupes.set(i.classeId, g);
        });
        const lignes = [...groupes.values()].sort((a, b) => String(a.classe?.nom).localeCompare(String(b.classe?.nom), 'fr'))
          .map((g) => [g.classe?.nom || '—', g.classe?.categorie || '', g.effectif, g.brut, g.remise, g.attendu, g.paye, g.reste, g.retard, g.attendu ? Math.round(g.paye / g.attendu * 100) : 0]);
        const t = tot(lignes, [2, 3, 4, 5, 6, 7, 8], 'TOTAL', 2);
        t.push(t[5] ? Math.round(t[6] / t[5] * 100) : 0);
        return { colonnes: ['Classe', 'Catégorie', 'Effectif', 'Frais bruts', 'Réductions', 'Attendu net', 'Encaissé', 'Reste', 'Dont échu', '% recouvré'], money: [3, 4, 5, 6, 7, 8], lignes, total: t,
          notes: ['Attendu net = frais bruts − réductions ; reste = attendu net − règlements valides (annulés et en attente exclus).'] };
      },
      debiteurs(state, f) {
        const lignes = listeCreances(state, { yearId: f.yearId, classId: f.classId, category: f.category, search: f.search })
          .map((c) => [c.eleve?.matricule || '', c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—', c.classe?.nom || '—', yearLabel(state, c.inscription.anneeId), c.attendu, c.paye, c.reste, c.retardMontant, c.joursRetard || '']);
        return { colonnes: ['Matricule', 'Élève', 'Classe', 'Année', 'Attendu', 'Réglé', 'Reste', 'Échu', 'Jours de retard'], money: [4, 5, 6, 7], lignes, total: tot(lignes, [4, 5, 6, 7], `TOTAL (${lignes.length} élève(s))`, 4).concat(['']) };
      },
      retards(state, f) {
        const today = todayISO();
        const lignes = inscriptionsFiltrees(state, f).flatMap((i) => ordreEcheances(i).filter((e) => resteEcheance(e) > 0 && e.dateLimite && e.dateLimite < today && (!f.to || e.dateLimite <= f.to) && (!f.from || e.dateLimite >= f.from))
          .map((e) => [studentOf(state, i)?.matricule || '', nomEleve(state, i), classOf(state, i.classeId)?.nom || '—', libelleEcheance(e), e.dateLimite, Math.round((new Date(`${today}T00:00:00`) - new Date(`${e.dateLimite}T00:00:00`)) / 86400000), num(e.montant) - num(e.remise), Math.min(num(e.montantPaye), num(e.montant) - num(e.remise)), resteEcheance(e)]))
          .sort((a, b) => b[5] - a[5]);
        return { colonnes: ['Matricule', 'Élève', 'Classe', 'Échéance', 'Date limite', 'Jours de retard', 'Dû', 'Payé', 'Reste'], money: [6, 7, 8], lignes, total: tot(lignes, [6, 7, 8], `TOTAL (${lignes.length} échéance(s))`, 6) };
      },
      reductions(state, f) {
        const lignes = inscriptionsFiltrees(state, f).filter((i) => i.reduction || (i.echeances || []).some((e) => num(e.remise) > 0))
          .map((i) => { const remise = (i.echeances || []).reduce((t, e) => t + num(e.remise), 0); const r = i.reduction || {};
            return [studentOf(state, i)?.matricule || '', nomEleve(state, i), classOf(state, i.classeId)?.nom || '—', TYPES_REDUCTION[r.type] || '—', reductionLabel(r), r.motif || '', r.par || '', r.date || '', remise]; });
        const parType = Object.keys(TYPES_REDUCTION).map((t) => `${TYPES_REDUCTION[t]} : ${lignes.filter((l) => l[3] === TYPES_REDUCTION[t]).length}`).join(' · ');
        return { colonnes: ['Matricule', 'Élève', 'Classe', 'Type', 'Décision', 'Motif', 'Accordée par', 'Date', 'Montant déduit'], money: [8], lignes, total: tot(lignes, [8], `TOTAL (${lignes.length})`, 8), notes: [parType] };
      },
      recettes(state, f) {
        const gran = GRANULARITES[f.gran] ? f.gran : 'mois';
        const map = new Map();
        paiementsFiltres(state, f).forEach((p) => { const k = periodeCle(p.datePaiement, gran); const g = map.get(k) || { n: 0, m: 0 }; g.n += 1; g.m += num(p.montant); map.set(k, g); });
        (state.entreesCaisse || []).filter((e) => (!f.yearId || e.anneeId === Number(f.yearId)) && dans(e.date, f) && !f.agent && !f.mode && !f.classId && !f.category)
          .forEach((e) => { const k = periodeCle(e.date, gran); const g = map.get(k) || { n: 0, m: 0 }; g.autres = (g.autres || 0) + num(e.montant); map.set(k, g); });
        let cumul = 0;
        const lignes = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => { cumul += g.m + (g.autres || 0); return [periodeLibelle(k, gran), g.n, g.m, g.autres || 0, g.m + (g.autres || 0), cumul]; });
        const t = tot(lignes, [1, 2, 3, 4], 'TOTAL'); t.push('');
        return { colonnes: ['Période', 'Paiements', 'Scolarité encaissée', 'Autres entrées', 'Total des recettes', 'Cumul'], money: [2, 3, 4, 5], lignes, total: t };
      },
      agents(state, f) {
        const map = new Map();
        paiementsFiltres(state, f, { annules: true }).forEach((p) => {
          const g = map.get(agentDe(p)) || { n: 0, m: 0, an: 0, am: 0, modes: new Set() };
          if (p.annule) { g.an += 1; g.am += num(p.montant); } else { g.n += 1; g.m += num(p.montant); g.modes.add(MODES_PAIEMENT[p.mode] || p.mode); }
          map.set(agentDe(p), g);
        });
        const lignes = [...map.entries()].sort((a, b) => b[1].m - a[1].m).map(([a, g]) => [a, g.n, g.m, [...g.modes].join(', '), g.an, g.am]);
        return { colonnes: ['Agent d’encaissement', 'Paiements valides', 'Montant encaissé', 'Moyens utilisés', 'Paiements annulés', 'Montant annulé'], money: [2, 5], lignes, total: ['TOTAL', somme(lignes, 1), somme(lignes, 2), '', somme(lignes, 4), somme(lignes, 5)] };
      },
      modes(state, f) {
        const list = paiementsFiltres(state, f);
        const total = list.reduce((s, p) => s + num(p.montant), 0);
        const lignes = Object.entries(MODES_PAIEMENT).map(([k, label]) => { const l = list.filter((p) => (p.mode || 'espece') === k); const m = l.reduce((s, p) => s + num(p.montant), 0); return [label, l.length, m, total ? Math.round(m / total * 100) : 0]; }).filter((l) => l[1] > 0);
        return { colonnes: ['Mode de paiement', 'Paiements', 'Montant', '% du total'], money: [2], lignes, total: ['TOTAL', somme(lignes, 1), total, lignes.length ? 100 : 0] };
      },
      depenses(state, f) {
        const gran = GRANULARITES[f.gran] ? f.gran : 'mois';
        const list = depensesFiltrees(state, f);
        const periodes = [...new Set(list.map((d) => periodeCle(d.date, gran)))].sort();
        const cats = [...new Set(list.map((d) => d.categorie))].sort((a, b) => a.localeCompare(b, 'fr'));
        const lignes = cats.map((c) => [c, ...periodes.map((p) => list.filter((d) => d.categorie === c && periodeCle(d.date, gran) === p).reduce((s, d) => s + num(d.montant), 0)), list.filter((d) => d.categorie === c).reduce((s, d) => s + num(d.montant), 0)]);
        const cols = periodes.map((_, i) => i + 1).concat(periodes.length + 1);
        return { colonnes: ['Catégorie', ...periodes.map((p) => periodeLibelle(p, gran)), 'Total'], money: cols, lignes, total: ['TOTAL', ...cols.map((c) => somme(lignes, c))], notes: ['Dépenses annulées exclues.'] };
      },
      'journal-caisse'(state, f) {
        const compteId = Number(f.compteId) || state.comptes?.[0]?.id;
        const from = f.from || todayISO();
        const to = f.to || from;
        let solde = soldeOuvertureTheorique(state, compteId, from);
        const ouverture = solde;
        const lignes = mouvementsCompte(state, compteId, { from, to }).filter((m) => !f.agent || m.agent === f.agent).map((m) => { solde += m.entree - m.sortie; return [m.date, m.piece, m.libelle, m.agent || '—', m.entree, m.sortie, solde]; });
        return { sousTitre: `${compteLabel(state, compteId)} — du ${from.split('-').reverse().join('/')} au ${to.split('-').reverse().join('/')}`, colonnes: ['Date', 'Pièce', 'Libellé', 'Agent', 'Entrée', 'Sortie', 'Solde'], money: [4, 5, 6], lignes: [['', '', 'Solde d’ouverture théorique', '', '', '', ouverture], ...lignes],
          total: ['', '', 'TOTAL DES MOUVEMENTS', '', somme(lignes, 4), somme(lignes, 5), solde], notes: ['Opérations valides uniquement. Un filtre par agent n’affecte pas le solde d’ouverture.'] };
      },
      tresorerie(state, f) {
        const to = f.to || todayISO();
        const avant = f.from ? soldesComptes(state, { to: veilleDe(f.from) }) : null;
        const fin = soldesComptes(state, { to });
        const lignes = fin.map((s) => { const a = avant?.find((x) => x.compte.id === s.compte.id); const debut = a ? a.solde : s.soldeInitial;
          const entrees = s.encaissements + s.autres + s.entrants - (a ? a.encaissements + a.autres + a.entrants : 0);
          const sorties = s.depenses + s.sortants - (a ? a.depenses + a.sortants : 0);
          return [s.compte.libelle, TYPES_COMPTE[s.compte.type], debut, entrees, sorties, s.solde]; });
        const caisse = situationCaisse(state, { yearId: Number(f.yearId) || 0, from: f.from, to: f.to });
        return { sousTitre: `Au ${to.split('-').reverse().join('/')}${f.from ? ` (mouvements depuis le ${f.from.split('-').reverse().join('/')})` : ''}`, colonnes: ['Compte', 'Type', 'Solde de début', 'Entrées (dont virements reçus)', 'Sorties (dont virements émis)', 'Solde de fin'], money: [2, 3, 4, 5], lignes,
          total: ['TOTAL DES COMPTES', '', somme(lignes, 2), somme(lignes, 3), somme(lignes, 4), somme(lignes, 5)],
          notes: [`Recettes de la période : ${caisse.recettes + caisse.autres} · dépenses : ${caisse.depenses} — les virements internes s’annulent dans le total (ni recette ni dépense).`] };
      },
      clotures(state, f) {
        const sessions = (state.sessionsCaisse || []).filter((s) => dans(s.date, f) && (!f.compteId || s.compteId === Number(f.compteId)) && (!f.agent || s.ouverture?.par === f.agent || s.fermeture?.par === f.agent))
          .sort((a, b) => b.date.localeCompare(a.date)).map((s) => [s.numero, s.date, compteLabel(state, s.compteId), { ouverte: 'Ouverte', fermee: 'Fermée', rouverte: 'Rouverte' }[s.statut], s.ouverture?.par || '', s.fermeture?.par || '', s.fermeture?.theorique ?? '', s.fermeture?.compte ?? '', s.fermeture ? s.fermeture.ecart : '', [s.ouverture?.ecart ? `Ouverture : ${s.ouverture.justification}` : '', s.fermeture?.justification || ''].filter(Boolean).join(' · ')]);
        const rapp = (state.rapprochements || []).filter((r) => dans(r.date, f) && (!f.compteId || r.compteId === Number(f.compteId)))
          .map((r) => [`RAPP-${r.id}`, r.date, compteLabel(state, r.compteId), 'Rapprochement', r.par, '', r.theorique, r.soldeReleve, r.ecart, r.justification]);
        const lignes = [...sessions, ...rapp];
        return { colonnes: ['N°', 'Date', 'Compte', 'Statut', 'Ouvert par', 'Fermé par', 'Théorique', 'Compté / relevé', 'Écart', 'Justification'], money: [6, 7, 8], lignes, total: ['', '', '', '', '', 'TOTAL DES ÉCARTS', '', '', somme(lignes, 8), ''] };
      },
      comparaison(state) {
        const lignes = state.annees.map((a) => {
          const sits = state.inscriptions.filter((i) => i.anneeId === a.id).map((i) => inscriptionSituation(state, i));
          const attendu = sits.reduce((s, x) => s + x.total, 0); const paye = sits.reduce((s, x) => s + x.paye, 0);
          const c = situationCaisse(state, { yearId: a.id });
          return [a.annee, sits.length, attendu, paye, Math.max(attendu - paye, 0), attendu ? Math.round(paye / attendu * 100) : 0, c.recettes + c.autres, c.depenses, c.solde];
        });
        const evo = lignes.length > 1 ? lignes.map((l, i) => (i && lignes[i - 1][3] ? `${l[0]} : ${l[3] >= lignes[i - 1][3] ? '+' : ''}${Math.round((l[3] - lignes[i - 1][3]) / lignes[i - 1][3] * 100)} % d’encaissements` : '')).filter(Boolean) : [];
        return { colonnes: ['Année', 'Inscrits', 'Attendu', 'Encaissé (scolarité)', 'Reste', '% recouvré', 'Recettes de trésorerie', 'Dépenses', 'Solde de l’année'], money: [2, 3, 4, 6, 7, 8], lignes, total: null, notes: evo };
      },
      budget(state, f) {
        const anneeId = Number(f.yearId) || state.anneeActiveId;
        const b = budgetDe(state, anneeId);
        const c = situationCaisse(state, { yearId: anneeId });
        const attendu = state.inscriptions.filter((i) => i.anneeId === anneeId).reduce((s, i) => s + inscriptionSituation(state, i).total, 0);
        const depenses = state.depenses.filter((d) => !d.annule && d.anneeId === anneeId);
        const ligne = (nature, libelle, prevu, realise) => [nature, libelle, prevu, realise, realise - prevu, prevu ? Math.round(realise / prevu * 100) : ''];
        const cats = [...new Set([...b.depenses.map((d) => d.categorie), ...depenses.map((d) => d.categorie)])].sort((x, y) => x.localeCompare(y, 'fr'));
        const recettes = [ligne('Recette', 'Scolarité (encaissée)', b.recettesScolarite, c.recettes), ligne('Recette', 'Autres recettes', b.autresRecettes, c.autres)];
        const charges = cats.map((cat) => ligne('Dépense', cat, num(b.depenses.find((d) => d.categorie === cat)?.montant), depenses.filter((d) => d.categorie === cat).reduce((s, d) => s + num(d.montant), 0)));
        const prevuNet = somme(recettes, 2) - somme(charges, 2);
        const realiseNet = somme(recettes, 3) - somme(charges, 3);
        return { sousTitre: `Année ${yearLabel(state, anneeId)}`, colonnes: ['Nature', 'Poste', 'Prévu', 'Réalisé', 'Écart', '% réalisé'], money: [2, 3, 4], lignes: [...recettes, ...charges],
          total: ['RÉSULTAT', 'Recettes − dépenses', prevuNet, realiseNet, realiseNet - prevuNet, ''],
          notes: [`Scolarité attendue (facturée, nette des réductions) : ${attendu}.${b.majLe ? ` Budget mis à jour le ${b.majLe.slice(0, 10)} par ${b.par}.` : ' Aucun budget saisi pour cette année.'}`] };
      },
      annulations(state, f) {
        const p = paiementsFiltres(state, { ...f, from: '', to: '' }, { annules: true });
        const lignes = [
          ...p.filter((x) => x.annule && dans(x.dateAnnulation || x.datePaiement, f)).map((x) => ['Paiement annulé', x.dateAnnulation || '', x.numeroRecu, nomEleve(state, state.inscriptions.find((i) => i.id === x.inscriptionId)), x.montant, x.annuleePar || '', x.motif || '']),
          ...p.flatMap((x) => (x.historique || []).filter((h) => dans(h.horodatage.slice(0, 10), f)).map((h) => ['Paiement corrigé', h.horodatage.slice(0, 10), x.numeroRecu, Object.keys(h.apres || {}).map((k) => `${k} : ${h.avant?.[k] ?? '—'} → ${h.apres[k]}`).join(' ; '), x.montant, h.par, h.motif])),
          ...depensesFiltrees(state, { ...f, from: '', to: '' }, { annulees: true }).filter((d) => d.annule && dans(d.dateAnnulation || d.date, f)).map((d) => ['Dépense annulée', d.dateAnnulation || '', d.numero, d.description, d.montant, d.annuleePar || '', d.motif || '']),
          ...state.depenses.flatMap((d) => (d.historique || []).filter((h) => dans(h.horodatage.slice(0, 10), f)).map((h) => ['Dépense corrigée', h.horodatage.slice(0, 10), d.numero, `avant : ${h.avant?.montant} — ${h.avant?.description}`, d.montant, h.par, h.motif || ''])),
          ...(state.virements || []).filter((v) => v.annule && dans(v.dateAnnulation || v.date, f)).map((v) => ['Virement annulé', v.dateAnnulation || '', v.numero, v.motif, v.montant, v.annulePar || '', v.motifAnnulation || '']),
          ...(state.paiementsEnAttente || []).filter((a) => a.statut === 'rejete' && dans(a.dateRejet || '', f)).map((a) => ['Règlement rejeté', a.dateRejet || '', a.numero, a.reference, a.montant, a.rejetePar || '', a.motif || ''])
        ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));
        return { colonnes: ['Opération', 'Date', 'N° pièce', 'Détail', 'Montant', 'Par', 'Motif'], money: [4], lignes, total: null, notes: ['Les opérations annulées restent dans l’historique avec leur numéro ; elles sont exclues de tous les totaux.'] };
      },
      transactions(state, f) {
        const statutP = (p) => (p.annule ? 'Annulé' : 'Validé');
        const lignes = [
          ...paiementsFiltres(state, f, { annules: true }).map((p) => [p.datePaiement, p.heure || '', 'Encaissement', p.numeroRecu, nomEleve(state, state.inscriptions.find((i) => i.id === p.inscriptionId)), MODES_PAIEMENT[p.mode] || p.mode, compteLabel(state, p.compteId), agentDe(p), p.montant, statutP(p)]),
          ...(f.classId || f.category ? [] : depensesFiltrees(state, f, { annulees: true }).map((d) => [d.date, '', 'Dépense', d.numero, `${d.categorie} — ${d.description}`, d.mode, compteLabel(state, d.compteId), agentDe(d), -num(d.montant), d.annule ? 'Annulée' : 'Validée'])),
          ...(f.classId || f.category || f.mode ? [] : (state.virements || []).filter((v) => dans(v.date, f) && (!f.agent || v.utilisateur === f.agent)).map((v) => [v.date, '', 'Virement interne', v.numero, `${compteLabel(state, v.deId)} → ${compteLabel(state, v.versId)}`, '', '', v.utilisateur, v.montant, v.annule ? 'Annulé' : 'Validé'])),
          ...(state.paiementsEnAttente || []).filter((a) => (!f.yearId || a.anneeId === Number(f.yearId)) && dans(a.dateReception, f) && (!f.mode || a.mode === f.mode) && (!f.agent || a.utilisateur === f.agent))
            .map((a) => [a.dateReception, '', 'Règlement en attente', a.numero, a.reference, MODES_PAIEMENT[a.mode], compteLabel(state, a.compteId), a.utilisateur, a.montant, STATUTS_ATTENTE[a.statut]])
        ].sort((a, b) => String(b[0]).localeCompare(String(a[0])) || String(b[1]).localeCompare(String(a[1])));
        return { colonnes: ['Date', 'Heure', 'Opération', 'N° pièce', 'Détail', 'Mode', 'Compte', 'Agent', 'Montant', 'Statut'], money: [8], lignes, total: null, notes: ['Dépenses en négatif. Les virements internes ne sont ni des recettes ni des dépenses.'] };
      }
    };
    
    function construireEtat(state, f) {
      const def = ETATS.find((e) => e.id === f.type) || ETATS[0];
      const etat = ETAT_BUILDERS[def.id](state, f);
      return { id: def.id, titre: def.label, ...etat };
    }
    
    // Filtres lisibles (en-tête des impressions et exports)
    function descriptionFiltres(state, f) {
      return [
        f.yearId ? `Année ${yearLabel(state, Number(f.yearId))}` : 'Toutes les années',
        f.category && `Catégorie ${f.category}`, f.classId && `Classe ${classOf(state, Number(f.classId))?.nom || ''}`,
        (f.from || f.to) && `Période ${f.from ? f.from.split('-').reverse().join('/') : '…'} → ${f.to ? f.to.split('-').reverse().join('/') : '…'}`,
        f.agent && `Agent ${f.agent}`, f.mode && `Mode ${MODES_PAIEMENT[f.mode]}`, f.compteId && `Compte ${compteLabel(state, f.compteId)}`
      ].filter(Boolean).join(' · ');
    }
    
    // ---------- Budget prévisionnel ----------
    function budgetDe(state, anneeId) {
      const b = (state.budgets || []).find((x) => x.anneeId === Number(anneeId));
      return b || { anneeId: Number(anneeId), recettesScolarite: 0, autresRecettes: 0, depenses: [] };
    }
    
    function enregistrerBudget(state, anneeId, { recettesScolarite = 0, autresRecettes = 0, depenses = [] } = {}) {
      exiger('scolarite.parametrer');
      const annee = state.annees.find((a) => a.id === Number(anneeId));
      if (!annee) throw new Error('Année scolaire introuvable.');
      const entier = (v, nom) => { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new Error(`${nom} : montant entier positif attendu.`); return n; };
      const lignes = depenses.map((d) => ({ categorie: String(d.categorie || '').trim().slice(0, 60), montant: entier(d.montant, d.categorie) })).filter((d) => d.categorie);
      if (new Set(lignes.map((d) => d.categorie)).size !== lignes.length) throw new Error('Chaque catégorie ne doit apparaître qu’une fois dans le budget.');
      const avant = (state.budgets || []).find((x) => x.anneeId === annee.id);
      const budget = { anneeId: annee.id, recettesScolarite: entier(recettesScolarite, 'Recettes de scolarité'), autresRecettes: entier(autresRecettes, 'Autres recettes'), depenses: lignes, majLe: new Date().toISOString(), par: '' };
      state.budgets = [...(state.budgets || []).filter((x) => x.anneeId !== annee.id), budget];
      const entry = logOperation(state, 'budget', `Budget ${annee.annee} enregistré : recettes ${budget.recettesScolarite + budget.autresRecettes}, dépenses ${lignes.reduce((s, d) => s + d.montant, 0)}`, 0, { cible: `Budget ${annee.annee}`, avant: avant || null, apres: budget });
      budget.par = entry.utilisateur || '';
      return budget;
    }
    
    Object.assign(exports, { ETATS, GRANULARITES, filtresEtatsDefaut, paiementsFiltres, construireEtat, descriptionFiltres, budgetDe, enregistrerBudget });
  };
  factories['./modules/etats-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, todayISO, downloadCsv, downloadExcel } = require("./utils.js");
    const { ETATS, GRANULARITES, construireEtat, descriptionFiltres, filtresEtatsDefaut, budgetDe } = require("./etats.js");
    const { CATEGORIES } = require("./classes.js");
    const { MODES_PAIEMENT } = require("./paiements.js");
    const { comptesActifs } = require("./comptes.js");
    const { enteteHtml, enteteLignes } = require("./entete.js");
    const { printDocument } = require("./print.js");
    const { can } = require("./auth.js");
    // Page « États financiers » : choix du rapport, filtres, tableau, exports (PDF par impression, Excel, CSV).
    
    const etatsFilters = { type: 'attendus', yearId: 0, category: '', classId: 0, from: '', to: '', agent: '', mode: '', compteId: 0, gran: 'mois', search: '' };
    
    function resetEtatsFilters(state) {
      Object.assign(etatsFilters, filtresEtatsDefaut(state), { type: etatsFilters.type || 'attendus' });
    }
    
    // Filtres utiles par rapport (les autres sont masqués pour éviter toute confusion)
    const FILTRES = {
      attendus: ['yearId', 'category', 'classId'], debiteurs: ['yearId', 'category', 'classId', 'search'], retards: ['yearId', 'category', 'classId', 'from', 'to'],
      reductions: ['yearId', 'category', 'classId'], recettes: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'mode', 'compteId', 'gran'],
      agents: ['yearId', 'category', 'classId', 'from', 'to', 'mode', 'compteId'], modes: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'compteId'],
      depenses: ['yearId', 'from', 'to', 'agent', 'mode', 'compteId', 'gran'], 'journal-caisse': ['compteId', 'from', 'to', 'agent'], tresorerie: ['yearId', 'from', 'to'],
      clotures: ['compteId', 'from', 'to', 'agent'], comparaison: [], budget: ['yearId'], annulations: ['yearId', 'from', 'to', 'agent'],
      transactions: ['yearId', 'category', 'classId', 'from', 'to', 'agent', 'mode', 'compteId']
    };
    
    const cellule = (v, money) => (money && typeof v === 'number' ? formatMoney(v) : escapeHtml(v === null || v === undefined ? '' : String(v)));
    
    function renderEtatsOutput(state) {
      const out = document.getElementById('etats-output');
      if (!out) return;
      const e = construireEtat(state, etatsFilters);
      const devise = escapeHtml(state.config.devise || '');
      const money = new Set(e.money || []);
      out.innerHTML = `
        <div class="r-title"><h3>${escapeHtml(e.titre)}${e.sousTitre ? ` — ${escapeHtml(e.sousTitre)}` : ''}</h3><span class="meta">${escapeHtml(descriptionFiltres(state, etatsFilters))} · montants en ${devise || 'devise de l’établissement'}</span></div>
        ${can('export') ? `<div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="etats:print">Imprimer / PDF</button><button type="button" class="secondary-btn small-btn" data-action="etats:excel">Excel</button><button type="button" class="secondary-btn small-btn" data-action="etats:csv">CSV</button></div>` : ''}
        <div class="table-wrap"><table>
          <thead><tr>${e.colonnes.map((c, i) => `<th class="${money.has(i) ? 'num' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${e.lignes.map((l) => `<tr>${l.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${e.colonnes.length}" class="meta">Aucune donnée pour ces filtres.</td></tr>`}</tbody>
          ${e.total ? `<tfoot><tr>${e.total.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}"><b>${cellule(v, money.has(i))}</b></td>`).join('')}</tr></tfoot>` : ''}
        </table></div>
        ${(e.notes || []).filter(Boolean).map((n) => `<p class="meta">${escapeHtml(n)}</p>`).join('')}
        ${e.id === 'budget' && can('scolarite.parametrer') ? budgetForm(state) : ''}`;
    }
    
    function budgetForm(state) {
      const anneeId = Number(etatsFilters.yearId) || state.anneeActiveId;
      if (!anneeId) return '';
      const b = budgetDe(state, anneeId);
      return `<details class="panel" open><summary><b>Saisir le budget prévisionnel de l’année</b></summary>
        <form class="form-grid compact" data-form="budget" autocomplete="off">
          <input type="hidden" name="anneeId" value="${anneeId}" />
          <label>Recettes de scolarité prévues <input name="recettesScolarite" type="number" min="0" step="1" value="${b.recettesScolarite}" /></label>
          <label>Autres recettes prévues <input name="autresRecettes" type="number" min="0" step="1" value="${b.autresRecettes}" /></label>
          <label class="span-all">Dépenses prévues par catégorie (une ligne « Catégorie = montant »)
            <textarea name="depenses" rows="6">${escapeHtml(b.depenses.map((d) => `${d.categorie} = ${d.montant}`).join(String.fromCharCode(10)))}</textarea></label>
          <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Enregistrer le budget</button></div>
        </form></details>`;
    }
    
    function renderEtats(state) {
      const section = document.getElementById('etats');
      if (!section) return;
      const f = etatsFilters;
      const visibles = new Set(FILTRES[f.type] || []);
      const show = (k) => (visibles.has(k) ? '' : 'hidden');
      const classes = state.classes.filter((c) => (!f.yearId || c.anneeId === Number(f.yearId)) && (!f.category || c.categorie === f.category));
      const agents = [...new Set([...state.paiements, ...state.depenses].map((p) => p.utilisateur || p.caissier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      const groupes = [...new Set(ETATS.map((e) => e.groupe))];
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Comptabilité et rapports</span><h2>États financiers</h2></div></div>
        <div class="panel">
          <p class="meta">Gestion de trésorerie et de recouvrement : ces états ne constituent pas une comptabilité générale (pas de plan comptable ni d’écritures en partie double) et ne prétendent à aucune conformité comptable ou fiscale. Ils peuvent être remis au comptable de l’établissement.</p>
          ${groupes.map((g) => `<div class="report-tabs"><span class="eyebrow">${escapeHtml(g)}</span>${ETATS.filter((e) => e.groupe === g).map((e) => `<button type="button" class="tab-btn ${e.id === f.type ? 'active' : ''}" data-etat="${e.id}">${escapeHtml(e.label)}</button>`).join('')}</div>`).join('')}
          <div class="advanced-search">
            <label ${show('yearId')}>Année scolaire <select data-ef="yearId"><option value="0">Toutes</option>${state.annees.map((a) => `<option value="${a.id}" ${a.id === Number(f.yearId) ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
            <label ${show('category')}>Catégorie <select data-ef="category"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${c === f.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></label>
            <label ${show('classId')}>Classe <select data-ef="classId"><option value="0">Toutes</option>${classes.map((c) => `<option value="${c.id}" ${c.id === Number(f.classId) ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></label>
            <label ${show('from')}>Du <input type="date" data-ef="from" value="${escapeHtml(f.from)}" /></label>
            <label ${show('to')}>Au <input type="date" data-ef="to" value="${escapeHtml(f.to)}" /></label>
            <label ${show('agent')}>Agent <select data-ef="agent"><option value="">Tous</option>${agents.map((a) => `<option value="${escapeHtml(a)}" ${a === f.agent ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
            <label ${show('mode')}>Mode de paiement <select data-ef="mode"><option value="">Tous</option>${Object.entries(MODES_PAIEMENT).map(([k, l]) => `<option value="${k}" ${k === f.mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label ${show('compteId')}>Compte <select data-ef="compteId"><option value="0">${f.type === 'journal-caisse' ? 'Compte principal' : 'Tous'}</option>${comptesActifs(state).map((c) => `<option value="${c.id}" ${c.id === Number(f.compteId) ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <label ${show('gran')}>Regrouper <select data-ef="gran">${Object.entries(GRANULARITES).map(([k, l]) => `<option value="${k}" ${k === f.gran ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label ${show('search')}>Élève <input type="search" data-ef="search" value="${escapeHtml(f.search)}" placeholder="Nom ou matricule" /></label>
          </div>
          <div id="etats-output"></div>
        </div>`;
      renderEtatsOutput(state);
    }
    
    function setEtatsFilter(state, key, value) {
      etatsFilters[key] = ['yearId', 'classId', 'compteId'].includes(key) ? Number(value || 0) : value;
      if (key === 'yearId' || key === 'category') { etatsFilters.classId = 0; renderEtats(state); return; }
      if (key === 'search') { renderEtatsOutput(state); return; }
      renderEtatsOutput(state);
    }
    
    function selectEtat(state, type) {
      etatsFilters.type = ETATS.some((e) => e.id === type) ? type : 'attendus';
      renderEtats(state);
    }
    
    // Lignes exportées : en-tête de l'établissement, titre, filtres, colonnes, données (montants bruts), total
    function lignesExport(state, f = etatsFilters) {
      const e = construireEtat(state, f);
      const marque = (row, kind) => Object.assign([...row], { kind });
      return { e, rows: [marque([`${e.titre}${e.sousTitre ? ` — ${e.sousTitre}` : ''}`], 'title'), marque([descriptionFiltres(state, f)], 'section'), marque([`Édité le ${new Date().toLocaleString('fr-FR')}`], 'section'), [], marque(e.colonnes, 'head'), ...e.lignes, ...(e.total ? [marque(e.total, 'foot')] : [])] };
    }
    
    function exportEtat(state, format) {
      const { e, rows } = lignesExport(state);
      const base = `${e.id}-${todayISO()}`;
      if (format === 'csv') downloadCsv(`${base}.csv`, rows);
      else downloadExcel(`${base}.xls`, e.titre, [...enteteLignes(state.config).map((r) => Object.assign(r, { kind: 'entete' })), [], ...rows]);
      return e;
    }
    
    function printEtat(state) {
      const e = construireEtat(state, etatsFilters);
      const money = new Set(e.money || []);
      const html = `${enteteHtml(state.config, { compact: true })}
        <div class="r-title"><h2>${escapeHtml(e.titre)}${e.sousTitre ? ` — ${escapeHtml(e.sousTitre)}` : ''}</h2><span>${escapeHtml(descriptionFiltres(state, etatsFilters))}</span></div>
        <table><thead><tr>${e.colonnes.map((c, i) => `<th class="${money.has(i) ? 'num' : ''}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${e.lignes.map((l) => `<tr>${l.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr>`).join('')}</tbody>
          ${e.total ? `<tfoot><tr>${e.total.map((v, i) => `<td class="${money.has(i) ? 'num' : ''}">${cellule(v, money.has(i))}</td>`).join('')}</tr></tfoot>` : ''}</table>
        ${(e.notes || []).filter(Boolean).map((n) => `<p>${escapeHtml(n)}</p>`).join('')}
        <p>Édité le ${escapeHtml(new Date().toLocaleString('fr-FR'))} — montants en ${escapeHtml(state.config.devise || '')}</p>`;
      return printDocument({ title: e.titre, html, page: e.colonnes.length > 7 ? 'A4 landscape' : 'A4 portrait', fileName: `${e.id}-${todayISO()}` }) ? e : null;
    }
    
    Object.assign(exports, { etatsFilters, resetEtatsFilters, renderEtatsOutput, renderEtats, setEtatsFilter, selectEtat, lignesExport, exportEtat, printEtat });
  };
})(window.IBK_APP.factories);

