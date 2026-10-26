// GEST SCHOOL SCOLARITÉ · 06-dettes-rappels.js
// Recouvrement : créances, relances, dettes antérieures, report explicite et fiches de rappel
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/reliquats.js, ./modules/dettes-view.js, ./modules/rappels.js, ./modules/creances.js, ./modules/creances-view.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
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
    
    // Report EXPLICITE des soldes impayés : rien n'est reporté automatiquement. L'établissement choisit, dans la page
    // « Dettes antérieures », les soldes d'années antérieures à reprendre sur une année donnée. Chaque report garde
    // son origine (année, classe), le montant initial, ce qui avait déjà été réglé et le solde reporté ; un même solde
    // n'est jamais reporté deux fois.
    function soldesReportables(state, cibleId) {
      return state.inscriptions.filter((i) => estAnterieure(state, i.anneeId, Number(cibleId)) && !reliquatOf(state, i.id)).map((inscription) => {
        const sit = echeancierSituation(inscription);
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        const inscritCible = state.inscriptions.some((j) => j.eleveId === inscription.eleveId && j.anneeId === Number(cibleId));
        return { inscription, eleve, total: sit.total, paye: sit.paye, reste: sit.reste, inscritCible };
      }).filter((x) => x.reste > 0).sort((x, y) => anneeKey(state, x.inscription.anneeId).localeCompare(anneeKey(state, y.inscription.anneeId)) || String(x.eleve?.nom).localeCompare(String(y.eleve?.nom), 'fr'));
    }
    
    function reporterSoldes(state, cibleId, inscriptionIds = []) {
      if (!Array.isArray(state.reliquats)) state.reliquats = [];
      const cible = annee(state, Number(cibleId));
      if (!cible) throw new Error('Année de report introuvable.');
      const created = [];
      inscriptionIds.map(Number).forEach((id) => {
        const inscription = state.inscriptions.find((i) => i.id === id);
        if (!inscription) throw new Error('Inscription introuvable.');
        if (!estAnterieure(state, inscription.anneeId, cible.id)) throw new Error('Seul le solde d’une année antérieure peut être reporté.');
        if (reliquatOf(state, id)) return; // déjà reporté : jamais deux fois
        const sit = echeancierSituation(inscription);
        if (sit.reste <= 0) return;
        const record = {
          id: nextId(state.reliquats), eleveId: inscription.eleveId, inscriptionId: inscription.id, anneeOrigineId: inscription.anneeId, classeOrigineId: inscription.classeId,
          anneeReportId: cible.id, montantInitial: sit.total, regleAvantReport: sit.paye, montantReporte: sit.reste, dateReport: todayISO(), creeLe: Date.now()
        };
        state.reliquats.push(record);
        created.push(record);
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        logOperation(state, 'reliquat', `Solde impayé ${annee(state, inscription.anneeId)?.annee || ''} de ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'l’élève'} reporté sur ${cible.annee}`, sit.reste);
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
    
    Object.assign(exports, { estAnterieure, reliquatOf, soldesReportables, reporterSoldes, situationReliquat, STATUT_RELIQUAT, reliquatsEleve, detteRestante, anneeEncaissement });
  };
  factories['./modules/dettes-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { situationReliquat, STATUT_RELIQUAT, soldesReportables } = require("./reliquats.js");
    const { studentOf, classOf } = require("./finance.js");
    const { can } = require("./auth.js");
    // Page « Dettes antérieures » : registre des soldes reportés d'une année sur l'autre.
    const detteFilters = { search: '', statut: 'en_cours', reportCible: 0, reportSelection: [] };
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
        <div class="table-wrap"><table class="data-list" data-list="dettes" data-list-title="Dettes des années précédentes">
          <thead><tr><th>Élève</th><th>Année d’origine</th><th>Classe d’origine</th><th>Reporté le</th><th>Reporté sur</th><th>Montant initial</th><th>Réglé avant report</th><th>Montant reporté</th><th>Remboursé</th><th>Reste dû</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${list.map((r) => {
            const s = studentOf(state, r.inscription);
            return `<tr>
              <td><b>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</b><div class="meta">${escapeHtml(s?.matricule || '—')}</div></td>
              <td>${escapeHtml(yearName(state, r.anneeOrigineId))}</td><td>${escapeHtml(classOf(state, r.inscription?.classeId)?.nom || '—')}</td>
              <td>${escapeHtml(formatDateFr(r.dateReport))}</td><td>${escapeHtml(r.anneeReportId ? yearName(state, r.anneeReportId) : 'Année active')}</td>
              <td class="num">${r.montantInitial !== undefined ? money(r.montantInitial) : '—'}</td><td class="num">${r.regleAvantReport !== undefined ? money(r.regleAvantReport) : '—'}</td>
              <td class="num">${money(r.montantReporte)}</td><td class="num">${money(r.rembourse)}</td><td class="num"><b>${money(r.reste)}</b></td>
              <td><span class="badge ${BADGE[r.statut]}">${STATUT_RELIQUAT[r.statut]}</span></td>
              <td><button class="action-btn" data-action="dette:view:${r.id}">Historique</button>${writable && r.reste > 0 ? `<button class="action-btn" data-action="dette:pay:${r.id}">Encaisser</button>` : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="12">Aucune dette antérieure pour cette sélection.</td></tr>'}</tbody>
        </table></div>`;
    }
    
    // Reprise explicite des soldes d'années antérieures sur une année choisie (sélection multiple)
    function reportPanel(state) {
      const cibleId = Number(detteFilters.reportCible) || state.anneeActiveId;
      detteFilters.reportCible = cibleId;
      const list = soldesReportables(state, cibleId);
      const sel = new Set((detteFilters.reportSelection || []).map(Number).filter((id) => list.some((x) => x.inscription.id === id)));
      detteFilters.reportSelection = [...sel];
      const devise = escapeHtml(state.config.devise);
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const total = list.filter((x) => sel.has(x.inscription.id)).reduce((s, x) => s + x.reste, 0);
      return `<div class="panel" id="report-soldes">
        <div class="panel-header"><h3>Reporter des soldes impayés</h3><span class="meta">Procédure explicite : seuls les soldes cochés sont repris sur l’année choisie</span></div>
        <div class="advanced-search"><label>Reporter sur l’année <select data-dettes-report="cible">${state.annees.map((a) => `<option value="${a.id}" ${a.id === cibleId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label></div>
        <div class="table-wrap"><table class="data-list" data-list="soldes-reportables" data-list-title="Soldes impayés reportables">
          <thead><tr><th data-noexport><input type="checkbox" data-dettes-report-all aria-label="Tout cocher" /></th><th>Élève</th><th>Année d’origine</th><th>Classe</th><th>Montant initial</th><th>Déjà réglé</th><th>Solde à reporter</th><th>Inscrit sur l’année cible</th></tr></thead>
          <tbody>${list.map((x) => `<tr><td><input type="checkbox" data-dettes-report-check="${x.inscription.id}" ${sel.has(x.inscription.id) ? 'checked' : ''} aria-label="Reporter" /></td>
            <td><b>${escapeHtml(x.eleve ? `${x.eleve.prenom} ${x.eleve.nom}` : '—')}</b><div class="meta">${escapeHtml(x.eleve?.matricule || '—')}</div></td><td>${escapeHtml(yearName(state, x.inscription.anneeId))}</td>
            <td>${escapeHtml(classOf(state, x.inscription.classeId)?.nom || '—')}</td><td class="num">${money(x.total)}</td><td class="num">${money(x.paye)}</td><td class="num"><b>${money(x.reste)}</b></td><td>${x.inscritCible ? 'Oui' : 'Non'}</td></tr>`).join('') || '<tr><td colspan="8">Aucun solde impayé d’une année antérieure à reporter.</td></tr>'}</tbody>
        </table></div>
        <div class="form-actions"><button type="button" class="primary-btn" data-action="dettes:reporter" ${sel.size ? '' : 'disabled'}>Reporter ${sel.size} solde(s) (${money(total)}) sur ${escapeHtml(yearName(state, cibleId))}</button></div>
      </div>`;
    }
    
    function renderDettes(state) {
      const section = document.getElementById('dettes');
      if (!section) return;
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Recouvrement</span><h2>Dettes des années précédentes</h2></div></div>
        <div class="panel">
          <p class="meta">Un solde impayé n’est reporté que sur décision explicite (panneau « Reporter des soldes impayés » ci-dessous). La dette reste rattachée à l’année d’origine, avec son montant initial et ce qui avait déjà été réglé (aucun double comptage) ; ses règlements sont encaissés sur l’année de report et tracés ici.</p>
          <div class="advanced-search">
            <label>Recherche <input type="search" data-dettes="search" value="${escapeHtml(detteFilters.search)}" placeholder="Nom ou matricule" autocomplete="off" /></label>
            <label>Statut <select data-dettes="statut">${[['en_cours', 'Restant à recouvrer'], ['solde', 'Soldées'], ['', 'Toutes']].map(([v, l]) => `<option value="${v}" ${v === detteFilters.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <div id="dettes-output"></div>
        </div>
        ${can('write') ? reportPanel(state) : ''}`;
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
  factories['./modules/creances.js'] = (require, exports) => {
    const { todayISO } = require("./utils.js");
    const { echeancierSituation, resteEcheance, ordreEcheances, libelleEcheance } = require("./allocation.js");
    const { modaliteActuelle } = require("./modalites.js");
    const { detteRestante } = require("./reliquats.js");
    const { totalEnAttente } = require("./attente.js");
    // Créances scolaires : pour chaque inscription, ce qui est attendu, réglé et restant, les échéances dépassées,
    // leur ancienneté et les réductions accordées. Tout est recalculé à partir des échéanciers et des paiements valides.
    
    const STATUTS_CREANCE = { retard: 'En retard', partiel: 'Partiellement payé', impaye: 'Aucun paiement', solde: 'Soldé' };
    const ANCIENNETES = [['', 'Toutes'], ['30', 'Retard de plus de 30 jours'], ['60', 'Plus de 60 jours'], ['90', 'Plus de 90 jours']];
    
    const jours = (fromIso, toIso) => Math.max(Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000), 0);
    
    function creanceInscription(state, inscription, today = todayISO()) {
      const sit = echeancierSituation(inscription, today);
      const ordered = ordreEcheances(inscription);
      const enRetard = ordered.filter((e) => resteEcheance(e) > 0 && e.dateLimite && e.dateLimite < today);
      const plusAncienne = enRetard[0]?.dateLimite || '';
      const prochaine = ordered.find((e) => resteEcheance(e) > 0 && (!e.dateLimite || e.dateLimite >= today)) || null;
      const remise = (inscription.echeances || []).reduce((s, e) => s + Number(e.remise || 0), 0);
      return {
        inscription,
        eleve: state.eleves.find((e) => e.id === inscription.eleveId) || null,
        classe: state.classes.find((c) => c.id === inscription.classeId) || null,
        modalite: modaliteActuelle(inscription),
        attendu: sit.total, paye: sit.paye, reste: sit.reste, taux: sit.taux,
        retardMontant: enRetard.reduce((s, e) => s + resteEcheance(e), 0), echeancesEnRetard: enRetard,
        joursRetard: plusAncienne ? jours(plusAncienne, today) : 0, plusAncienne,
        prochaine, prochaineMontant: prochaine ? resteEcheance(prochaine) : 0,
        mensualitesImpayees: ordered.filter((e) => e.mensualite && resteEcheance(e) > 0).length,
        tranchesPartielles: ordered.filter((e) => !e.mensualite && e.type !== 'frais' && Number(e.montantPaye || 0) > 0 && resteEcheance(e) > 0).length,
        remise, reduction: inscription.reduction || null,
        enAttente: totalEnAttente(state, inscription.id),
        dette: detteRestante(state, inscription.eleveId, inscription.id),
        statut: sit.total > 0 && sit.reste === 0 ? 'solde' : enRetard.length ? 'retard' : sit.paye > 0 ? 'partiel' : 'impaye'
      };
    }
    
    // Liste filtrée des créances. f = { yearId, category, classId, statut, anciennete, reduction, search, soldes }
    function listeCreances(state, f = {}, today = todayISO()) {
      const search = String(f.search || '').trim().toLocaleLowerCase('fr');
      const anciennete = Number(f.anciennete || 0);
      return state.inscriptions
        .filter((i) => (!f.yearId || i.anneeId === Number(f.yearId)) && (!f.classId || i.classeId === Number(f.classId)))
        .filter((i) => !['transfere', 'abandon'].includes(i.statut) || (i.echeances || []).some((e) => resteEcheance(e) > 0))
        .map((i) => creanceInscription(state, i, today))
        .filter((c) => (!f.category || c.classe?.categorie === f.category)
          && (f.soldes || c.reste > 0)
          && (!f.statut || c.statut === f.statut)
          && (!anciennete || c.joursRetard > anciennete)
          && (!f.reduction || c.reduction)
          && (!search || `${c.eleve?.matricule || ''} ${c.eleve?.prenom || ''} ${c.eleve?.nom || ''} ${c.eleve?.nom || ''} ${c.eleve?.prenom || ''}`.toLocaleLowerCase('fr').includes(search)))
        .sort((a, b) => b.retardMontant - a.retardMontant || b.reste - a.reste || String(a.eleve?.nom || '').localeCompare(String(b.eleve?.nom || ''), 'fr'));
    }
    
    const totaux = (list) => ({
      nombre: list.length,
      attendu: list.reduce((s, c) => s + c.attendu, 0), paye: list.reduce((s, c) => s + c.paye, 0), reste: list.reduce((s, c) => s + c.reste, 0),
      retard: list.reduce((s, c) => s + c.retardMontant, 0), enRetard: list.filter((c) => c.retardMontant > 0).length, remise: list.reduce((s, c) => s + c.remise, 0)
    });
    
    function syntheseCreances(list) {
      return totaux(list);
    }
    
    // Regroupement par classe (ou par année) : effectif concerné, attendu, réglé, reste et retard
    function creancesParClasse(state, list) {
      const map = new Map();
      list.forEach((c) => {
        const key = c.inscription.classeId;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(c);
      });
      return [...map.entries()].map(([id, items]) => ({ classe: state.classes.find((c) => c.id === id) || null, ...totaux(items) }))
        .sort((a, b) => b.reste - a.reste);
    }
    
    function creancesParAnnee(state, today = todayISO()) {
      return state.annees.map((a) => {
        const list = listeCreances(state, { yearId: a.id }, today);
        return { annee: a, ...totaux(list) };
      }).filter((r) => r.nombre > 0);
    }
    
    // Échéances en retard d'une créance, sous forme lisible pour la lettre de relance
    function lignesRelance(creance) {
      return creance.echeancesEnRetard.map((e) => ({ libelle: libelleEcheance(e), dateLimite: e.dateLimite, reste: resteEcheance(e) }));
    }
    
    Object.assign(exports, { STATUTS_CREANCE, ANCIENNETES, creanceInscription, listeCreances, syntheseCreances, creancesParClasse, creancesParAnnee, lignesRelance });
  };
  factories['./modules/creances-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { CATEGORIES } = require("./classes.js");
    const { MODALITES } = require("./modalites.js");
    const { listeCreances, syntheseCreances, creancesParClasse, creancesParAnnee, lignesRelance, STATUTS_CREANCE, ANCIENNETES } = require("./creances.js");
    const { reductionLabel } = require("./reductions.js");
    const { enteteHtml } = require("./entete.js");
    const { printDocument } = require("./print.js");
    const { can } = require("./auth.js");
    const { downloadCsv } = require("./utils.js");
    // Page « Créances et relances » : suivi des impayés, états de recouvrement et lettres de relance imprimables.
    // Les relances sont des documents papier : aucun envoi automatique (SMS, messagerie) n'est effectué par l'application.
    
    const creanceFilters = { yearId: 0, category: '', classId: 0, statut: '', anciennete: '', reduction: false, search: '' };
    
    function resetCreanceFilters(state) {
      Object.assign(creanceFilters, { yearId: Number(state.anneeActiveId || 0), category: '', classId: 0, statut: '', anciennete: '', reduction: false, search: '' });
    }
    
    const BADGES = { retard: 'danger', partiel: 'warning', impaye: 'neutral', solde: 'ok' };
    
    function renderCreancesOutput(state) {
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
    
    function renderCreances(state) {
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
    
    function setCreanceFilter(state, key, target) {
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
    
    function printRelances(state, inscriptionId = 0) {
      const list = listeCreances(state, inscriptionId ? { soldes: true } : creanceFilters)
        .filter((c) => c.retardMontant > 0 && (!inscriptionId || c.inscription.id === Number(inscriptionId)));
      if (!list.length) return false;
      return printDocument({ title: 'Lettres de relance', html: list.map((c) => lettreHtml(state, c)).join(''), css: RELANCE_CSS, fileName: `Relances-${todayISO()}` });
    }
    
    function printEtatRecouvrement(state) {
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
    
    function exportCreancesCsv(state) {
      const list = listeCreances(state, creanceFilters);
      const rows = [['Matricule', 'Élève', 'Classe', 'Année', 'Modalité', 'Attendu', 'Réglé', 'Reste', 'Échu', 'Jours de retard', 'Réduction', 'Statut']];
      list.forEach((c) => rows.push([c.eleve?.matricule || '', c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '', c.classe?.nom || '', state.annees.find((a) => a.id === c.inscription.anneeId)?.annee || '',
        c.modalite ? MODALITES[c.modalite] : 'À choisir', c.attendu, c.paye, c.reste, c.retardMontant, c.joursRetard, c.reduction ? reductionLabel(c.reduction) : '', STATUTS_CREANCE[c.statut]]));
      downloadCsv(`creances-${todayISO()}.csv`, rows);
      return list.length;
    }
    
    Object.assign(exports, { creanceFilters, resetCreanceFilters, renderCreancesOutput, renderCreances, setCreanceFilter, printRelances, printEtatRecouvrement, exportCreancesCsv });
  };
})(window.IBK_APP.factories);

