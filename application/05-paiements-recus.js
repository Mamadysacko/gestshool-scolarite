// GEST SCHOOL SCOLARITÉ · 05-paiements-recus.js
// Encaissements : calculs financiers, comptes, imputation, paiements, règlements en attente, reçus, factures et formulaire
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/finance.js, ./modules/allocation.js, ./modules/clotures.js, ./modules/comptes.js, ./modules/paiements.js, ./modules/attente.js, ./modules/recus.js, ./modules/echeancier-view.js, ./modules/paiement-form.js, ./modules/details.js, ./ui.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
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
  factories['./modules/clotures.js'] = (require, exports) => {
    // Verrous de clôture de caisse (module sans dépendance, utilisable par paiements, dépenses et virements).
    // Une opération datée du jour J sur un compte est VERROUILLÉE dès qu'une journée de caisse de ce compte, datée de J ou
    // après, est clôturée : la modifier ou en ajouter une changerait un solde déjà compté et signé. Pour corriger, un
    // responsable rouvre la dernière journée clôturée (motif obligatoire, tracé), corrige, puis referme.
    
    const fr = (iso) => String(iso || '').split('-').reverse().join('/');
    
    function clotureCouvrant(state, compteId, date) {
      const id = Number(compteId);
      return (state.sessionsCaisse || [])
        .filter((s) => s.compteId === id && s.statut === 'fermee' && s.date >= String(date || ''))
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    }
    
    function operationVerrouillee(state, compteId, date) {
      return Boolean(clotureCouvrant(state, compteId, date));
    }
    
    // Message d'erreur si l'opération touche une journée clôturée ; '' sinon
    function motifVerrou(state, compteId, date, action = 'cette opération') {
      const session = clotureCouvrant(state, compteId, date);
      if (!session) return '';
      const compte = (state.comptes || []).find((c) => c.id === Number(compteId));
      return `La caisse « ${compte?.libelle || 'compte'} » est clôturée au ${fr(session.date)} : ${action} au ${fr(date)} est impossible. Un responsable doit d’abord rouvrir la journée (motif tracé).`;
    }
    
    function exigerNonVerrouille(state, compteId, date, action) {
      const message = motifVerrou(state, compteId, date, action);
      if (message) throw new Error(message);
    }
    
    // Option « caisse obligatoire » : une opération en espèces sur une caisse exige que cette caisse soit ouverte ce jour-là
    function motifCaisseFermee(state, compteId, date) {
      if (!state.config?.caisseObligatoire) return '';
      const compte = (state.comptes || []).find((c) => c.id === Number(compteId));
      if (!compte || compte.type !== 'caisse') return '';
      const ouverte = (state.sessionsCaisse || []).some((s) => s.compteId === compte.id && s.date === date && s.statut !== 'fermee');
      return ouverte ? '' : `La caisse « ${compte.libelle} » n’est pas ouverte le ${fr(date)} : ouvrez-la d’abord (Caisse et trésorerie › Caisse).`;
    }
    
    Object.assign(exports, { clotureCouvrant, operationVerrouillee, motifVerrou, exigerNonVerrouille, motifCaisseFermee });
  };
  factories['./modules/comptes.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { motifVerrou, exigerNonVerrouille } = require("./clotures.js");
    // Comptes financiers de l'établissement : caisse(s), compte(s) bancaire(s), Mobile Money…
    // Chaque encaissement et chaque dépense est rattaché à un compte ; les virements internes (dépôt en banque,
    // approvisionnement de caisse) déplacent de l'argent entre comptes sans modifier les recettes ni les dépenses.
    // Solde d'un compte = solde initial + encaissements + autres entrées − dépenses ± virements (opérations annulées exclues).
    
    const TYPES_COMPTE = { caisse: 'Caisse', banque: 'Compte bancaire', mobile: 'Mobile Money', autre: 'Autre compte' };
    const COMPTE_PRINCIPAL_DEFAUT = { id: 1, libelle: 'Caisse principale', type: 'caisse', numero: '', soldeInitial: 0, actif: true, principal: true };
    
    const num = (v) => Number(v || 0);
    const text = (v) => String(v ?? '').trim();
    
    function comptePrincipal(state) {
      return (state.comptes || []).find((c) => c.principal) || (state.comptes || [])[0] || null;
    }
    
    function compteOf(state, id) {
      return (state.comptes || []).find((c) => c.id === Number(id)) || null;
    }
    
    function compteLabel(state, id) {
      return compteOf(state, id)?.libelle || comptePrincipal(state)?.libelle || '—';
    }
    
    function comptesActifs(state) {
      return (state.comptes || []).filter((c) => c.actif !== false);
    }
    
    // Compte proposé par défaut pour un moyen de paiement : la caisse pour les espèces, sinon le premier compte du bon type
    function compteParDefaut(state, mode = 'espece') {
      const actifs = comptesActifs(state);
      const type = mode === 'espece' ? 'caisse' : mode === 'mobile_money' ? 'mobile' : 'banque';
      return actifs.find((c) => c.type === type) || comptePrincipal(state);
    }
    
    // Mise à niveau : au moins un compte (principal) ; les opérations sans compte sont rattachées au compte principal
    function ensureComptes(state) {
      if (!Array.isArray(state.comptes) || !state.comptes.length) state.comptes = [{ ...COMPTE_PRINCIPAL_DEFAUT }];
      state.comptes.forEach((c) => {
        c.id = Number(c.id);
        c.libelle = text(c.libelle) || `Compte ${c.id}`;
        if (!TYPES_COMPTE[c.type]) c.type = 'autre';
        c.soldeInitial = Math.floor(num(c.soldeInitial));
        c.numero = text(c.numero);
        c.actif = c.actif !== false;
      });
      if (!state.comptes.some((c) => c.principal)) state.comptes[0].principal = true;
      const principal = comptePrincipal(state);
      principal.actif = true;
      const fallback = principal.id;
      const valid = (id) => state.comptes.some((c) => c.id === Number(id));
      ['paiements', 'depenses', 'entreesCaisse', 'paiementsEnAttente'].forEach((key) => {
        (state[key] || []).forEach((op) => { if (!valid(op.compteId)) op.compteId = fallback; else op.compteId = Number(op.compteId); });
      });
      if (!Array.isArray(state.virements)) state.virements = [];
      return state.comptes;
    }
    
    function checkCompte(state, payload, id = 0) {
      const libelle = text(payload.libelle);
      if (!libelle) throw new Error('Donnez un nom au compte.');
      if ((state.comptes || []).some((c) => c.id !== id && c.libelle.toLocaleLowerCase('fr') === libelle.toLocaleLowerCase('fr'))) throw new Error('Un compte porte déjà ce nom.');
      if (!TYPES_COMPTE[payload.type]) throw new Error('Type de compte inconnu.');
      const solde = Number(payload.soldeInitial || 0);
      if (!Number.isInteger(solde) || solde < 0) throw new Error('Le solde initial doit être un nombre entier positif ou nul.');
      return { libelle, type: payload.type, numero: text(payload.numero).slice(0, 60), soldeInitial: solde };
    }
    
    function createCompte(state, payload = {}) {
      exiger('admin');
      const fields = checkCompte(state, payload);
      const compte = { id: nextId(state.comptes), ...fields, actif: true, principal: false, creeLe: new Date().toISOString() };
      state.comptes.push(compte);
      logOperation(state, 'compte', `Compte « ${compte.libelle} » créé (${TYPES_COMPTE[compte.type]}, solde initial ${compte.soldeInitial})`, compte.soldeInitial);
      return compte;
    }
    
    // Le solde initial d'un compte déjà mouvementé reste modifiable (correction de reprise), mais la valeur précédente est tracée
    function updateCompte(state, id, payload = {}) {
      exiger('admin');
      const compte = compteOf(state, id);
      if (!compte) throw new Error('Compte introuvable.');
      const fields = checkCompte(state, payload, compte.id);
      const avant = { libelle: compte.libelle, type: compte.type, numero: compte.numero, soldeInitial: compte.soldeInitial };
      compte.historique = [...(compte.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant }];
      Object.assign(compte, fields);
      logOperation(state, 'compte', `Compte « ${compte.libelle} » modifié${avant.soldeInitial !== compte.soldeInitial ? ` (solde initial ${avant.soldeInitial} → ${compte.soldeInitial})` : ''}`);
      return compte;
    }
    
    function setCompteActif(state, id, actif) {
      exiger('admin');
      const compte = compteOf(state, id);
      if (!compte) throw new Error('Compte introuvable.');
      if (!actif && compte.principal) throw new Error('Le compte principal ne peut pas être désactivé.');
      compte.actif = Boolean(actif);
      logOperation(state, 'compte', `Compte « ${compte.libelle} » ${compte.actif ? 'réactivé' : 'désactivé'}`);
      return compte;
    }
    
    const avant = (op, to, key) => !to || String(op[key] || '') <= to;
    
    // Soldes de tous les comptes (jusqu'à une date incluse si `to` est fourni)
    // (une opération créée sans compte — paie, avance — est rattachée au compte principal)
    function soldesComptes(state, { to = '' } = {}) {
      const principalId = comptePrincipal(state)?.id || 0;
      const sur = (op, id) => (Number(op.compteId) || principalId) === id;
      return (state.comptes || []).map((c) => {
        const encaissements = state.paiements.filter((p) => !p.annule && sur(p, c.id) && avant(p, to, 'datePaiement')).reduce((s, p) => s + num(p.montant), 0);
        const autres = (state.entreesCaisse || []).filter((e) => sur(e, c.id) && avant(e, to, 'date')).reduce((s, e) => s + num(e.montant), 0);
        const depenses = state.depenses.filter((d) => !d.annule && sur(d, c.id) && avant(d, to, 'date')).reduce((s, d) => s + num(d.montant), 0);
        const virements = (state.virements || []).filter((v) => !v.annule && avant(v, to, 'date'));
        const entrants = virements.filter((v) => v.versId === c.id).reduce((s, v) => s + num(v.montant), 0);
        const sortants = virements.filter((v) => v.deId === c.id).reduce((s, v) => s + num(v.montant), 0);
        return { compte: c, soldeInitial: num(c.soldeInitial), encaissements, autres, depenses, entrants, sortants, solde: num(c.soldeInitial) + encaissements + autres - depenses + entrants - sortants };
      });
    }
    
    function soldeCompte(state, id, opts) {
      return soldesComptes(state, opts).find((s) => s.compte.id === Number(id))?.solde || 0;
    }
    
    // Numéro de virement interne : VIR-2026-000001 (jamais réutilisé)
    function numeroVirement(state, date) {
      const year = String(date || todayISO()).slice(0, 4);
      if (!state.compteursVirement || typeof state.compteursVirement !== 'object') state.compteursVirement = {};
      const next = num(state.compteursVirement[year]) + 1;
      state.compteursVirement[year] = next;
      return `VIR-${year}-${String(next).padStart(6, '0')}`;
    }
    
    function validateVirement(state, payload = {}) {
      const de = compteOf(state, payload.deId);
      const vers = compteOf(state, payload.versId);
      const montant = Number(payload.montant);
      const date = payload.date || todayISO();
      if (!de || !vers) return { ok: false, message: 'Choisissez le compte de départ et le compte d’arrivée.' };
      if (de.id === vers.id) return { ok: false, message: 'Les deux comptes doivent être différents.' };
      if (de.actif === false || vers.actif === false) return { ok: false, message: 'Un compte désactivé ne peut pas être mouvementé.' };
      if (!Number.isInteger(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être un nombre entier supérieur à zéro.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) return { ok: false, message: 'Date invalide (pas de date future).' };
      if (!text(payload.motif)) return { ok: false, message: 'Indiquez le motif du virement (ex. dépôt en banque).' };
      if (payload.token && (state.virements || []).some((v) => v.token === payload.token)) return { ok: false, message: 'Ce virement a déjà été enregistré (double soumission évitée).' };
      const verrou = motifVerrou(state, de.id, date, 'un virement') || motifVerrou(state, vers.id, date, 'un virement');
      if (verrou) return { ok: false, message: verrou };
      const disponible = soldeCompte(state, de.id, { to: date });
      if (montant > disponible) return { ok: false, message: `Solde insuffisant sur « ${de.libelle} » au ${date} (${disponible.toLocaleString('fr-FR')} disponible).` };
      return { ok: true };
    }
    
    function createVirement(state, payload = {}) {
      exiger('tresorerie.virements');
      const check = validateVirement(state, payload);
      if (!check.ok) throw new Error(check.message);
      return withTransaction(state, () => {
        const user = currentUser();
        const date = payload.date || todayISO();
        const virement = {
          id: nextId(state.virements), numero: numeroVirement(state, date), date, deId: Number(payload.deId), versId: Number(payload.versId),
          montant: Number(payload.montant), motif: text(payload.motif), reference: text(payload.reference), utilisateur: user?.nom || '', utilisateurId: user?.id || 0,
          annule: false, token: payload.token || '', creeLe: Date.now()
        };
        state.virements.push(virement);
        logOperation(state, 'virement', `${virement.numero} — ${compteLabel(state, virement.deId)} → ${compteLabel(state, virement.versId)} : ${virement.motif}`, virement.montant);
        return virement;
      });
    }
    
    function cancelVirement(state, id, motif) {
      exiger('tresorerie.corriger');
      const virement = (state.virements || []).find((v) => v.id === Number(id));
      if (!virement || virement.annule) return null;
      exigerNonVerrouille(state, virement.deId, virement.date, 'l’annulation de ce virement');
      exigerNonVerrouille(state, virement.versId, virement.date, 'l’annulation de ce virement');
      if (!text(motif)) throw new Error('Le motif d’annulation est obligatoire.');
      return withTransaction(state, () => {
        Object.assign(virement, { annule: true, motifAnnulation: text(motif), dateAnnulation: todayISO(), annulePar: currentUser()?.nom || '' });
        logOperation(state, 'annulation', `Virement ${virement.numero} annulé — ${virement.motifAnnulation}`, virement.montant);
        return virement;
      });
    }
    
    Object.assign(exports, { TYPES_COMPTE, COMPTE_PRINCIPAL_DEFAUT, comptePrincipal, compteOf, compteLabel, comptesActifs, compteParDefaut, ensureComptes, createCompte, updateCompte, setCompteActif, soldesComptes, soldeCompte, validateVirement, createVirement, cancelVirement });
  };
  factories['./modules/paiements.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { reconcileInscriptionStatus, determineEcheanceStatus } = require("./finance.js");
    const { allocate, ordreEcheances, recomputeInscription, previewPaiement, echeancierSituation } = require("./allocation.js");
    const { planPourModalite, appliquerModalite, MODALITES, modaliteActuelle } = require("./modalites.js");
    const { reliquatOf, anneeEncaissement } = require("./reliquats.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { compteOf, compteParDefaut, compteLabel } = require("./comptes.js");
    const { motifVerrou, motifCaisseFermee, exigerNonVerrouille } = require("./clotures.js");
    const MODES_PAIEMENT = { espece: 'Espèces', virement: 'Virement bancaire', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte bancaire' };
    
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
      if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier (sans décimales).' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de paiement invalide.' };
      if (date > todayISO()) return { ok: false, message: 'La date de paiement ne peut pas être dans le futur.' };
      if (payload.mode && !MODES_PAIEMENT[payload.mode]) return { ok: false, message: 'Moyen de paiement inconnu.' };
      if (payload.compteId) {
        const compte = compteOf(state, payload.compteId);
        if (!compte) return { ok: false, message: 'Compte destinataire introuvable.' };
        if (compte.actif === false) return { ok: false, message: `Le compte « ${compte.libelle} » est désactivé.` };
      }
    
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
    
      // Journée de caisse déjà clôturée sur le compte destinataire, ou caisse non ouverte (option)
      const compteCible = Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0;
      const verrou = motifVerrou(state, compteCible, date, 'un encaissement') || motifCaisseFermee(state, compteCible, date);
      if (verrou) return { ok: false, message: verrou };
    
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
      exiger('paiements.encaisser');
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
          mode: MODES_PAIEMENT[payload.mode] ? payload.mode : 'espece',
          // Compte ou caisse qui reçoit l'argent (par défaut : celui qui correspond au moyen de paiement)
          compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0,
          reference: payload.reference || '',
          payeur: payload.payeur || '',
          motifPaiement: payload.motifPaiement || '',
          caissier: cashierName(state),
          utilisateur: user?.nom || '',
          utilisateurId: user?.id || 0,
          datePaiement: payload.datePaiement || todayISO(),
          heure: new Date().toTimeString().slice(0, 5),
          observation: String(payload.observation || '').trim(),
          // Paiement issu d'un règlement en attente (chèque, virement) confirmé
          attenteId: Number(payload.attenteId) || 0,
          statut: 'valide',
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
      exiger('paiements.encaisser');
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
      exiger('paiements.annuler');
      const payment = state.paiements.find((item) => item.id === Number(id));
      if (!payment || payment.annule) return null;
      exigerNonVerrouille(state, payment.compteId, payment.datePaiement, 'l’annulation de ce paiement');
      return withTransaction(state, () => {
        payment.annule = true;
        payment.statut = 'annule';
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
    
    // Correction contrôlée d'un paiement validé : seules les informations qui ne changent pas le montant ni l'élève
    // (moyen, compte, référence, payeur, date, description, observation) peuvent être corrigées, avec un motif.
    // L'état précédent est conservé dans l'historique du paiement. Pour une erreur de montant ou d'élève :
    // annuler le paiement (motif) puis enregistrer le bon.
    const CHAMPS_CORRIGEABLES = ['mode', 'compteId', 'reference', 'payeur', 'datePaiement', 'motifPaiement', 'observation'];
    
    function corrigerPaiement(state, id, payload = {}, motif = '') {
      exiger('paiements.corriger');
      const payment = state.paiements.find((p) => p.id === Number(id));
      if (!payment) throw new Error('Paiement introuvable.');
      if (payment.annule) throw new Error('Un paiement annulé ne peut pas être corrigé.');
      if (!String(motif).trim()) throw new Error('Le motif de la correction est obligatoire.');
      if (payload.mode !== undefined && !MODES_PAIEMENT[payload.mode]) throw new Error('Moyen de paiement inconnu.');
      if (payload.compteId !== undefined) {
        const compte = compteOf(state, payload.compteId);
        if (!compte || compte.actif === false) throw new Error('Compte destinataire introuvable ou désactivé.');
      }
      if (payload.datePaiement !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.datePaiement) || payload.datePaiement > todayISO()) throw new Error('Date de paiement invalide (pas de date future).');
        const annee = state.annees.find((a) => a.id === (payment.anneeEncaissementId || payment.anneeId));
        if (annee?.statut === 'cloturee' && payload.datePaiement !== payment.datePaiement) throw new Error(`L’année ${annee.annee} est clôturée : la date d’un paiement ne peut plus changer.`);
      }
      // Ni la journée d'origine ni la journée de destination ne doivent être clôturées
      exigerNonVerrouille(state, payment.compteId, payment.datePaiement, 'la correction de ce paiement');
      exigerNonVerrouille(state, payload.compteId ?? payment.compteId, payload.datePaiement ?? payment.datePaiement, 'la correction de ce paiement');
      return withTransaction(state, () => {
        const avant = {};
        const apres = {};
        CHAMPS_CORRIGEABLES.forEach((k) => {
          if (payload[k] === undefined) return;
          const value = k === 'compteId' ? Number(payload[k]) : String(payload[k] ?? '').trim();
          if (String(payment[k] ?? '') === String(value)) return;
          avant[k] = payment[k] ?? '';
          apres[k] = value;
          payment[k] = value;
        });
        if (!Object.keys(apres).length) throw new Error('Aucune modification à enregistrer.');
        payment.historique = [...(payment.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif: String(motif).trim(), avant, apres }];
        const libelles = { mode: 'moyen', compteId: 'compte', reference: 'référence', payeur: 'payeur', datePaiement: 'date', motifPaiement: 'description', observation: 'observation' };
        const lisible = (k, v) => (k === 'compteId' ? compteLabel(state, v) : (k === 'mode' ? MODES_PAIEMENT[v] : v) || '—');
        const detail = Object.keys(apres).map((k) => `${libelles[k]} : ${lisible(k, avant[k])} → ${lisible(k, apres[k])}`).join(' ; ');
        logOperation(state, 'correction', `Reçu ${payment.numeroRecu || payment.id} corrigé — ${detail} — motif : ${String(motif).trim()}`, payment.montant);
        return payment;
      });
    }
    
    function getSoldeInscription(state, inscriptionId) {
      const inscription = findInscription(state, inscriptionId);
      if (!inscription) return { total: 0, paye: 0, restant: 0 };
      const s = echeancierSituation(inscription);
      return { total: s.total, paye: s.paye, restant: s.reste };
    }
    
    Object.assign(exports, { MODES_PAIEMENT, ensureReceiptNumber, cashierName, validatePaiement, createPaiement, changerModalite, cancelPaiement, CHAMPS_CORRIGEABLES, corrigerPaiement, getSoldeInscription });
  };
  factories['./modules/attente.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { createPaiement, validatePaiement, MODES_PAIEMENT } = require("./paiements.js");
    const { planPourModalite } = require("./modalites.js");
    const { previewPaiement } = require("./allocation.js");
    const { compteOf, compteParDefaut } = require("./comptes.js");
    // Règlements en attente : chèque remis mais pas encore crédité, virement annoncé, paiement électronique à vérifier.
    // Ils sont enregistrés à part (registre « paiementsEnAttente ») et n'entrent dans AUCUN total — encaissé, solde de
    // l'élève, caisse, rapports — tant qu'ils ne sont pas confirmés. Confirmé : un vrai paiement est créé (reçu numéroté,
    // imputation, soldes). Rejeté (chèque impayé…) : la ligne reste dans le registre avec son motif.
    
    const STATUTS_ATTENTE = { en_attente: 'En attente', confirme: 'Confirmé', rejete: 'Rejeté' };
    const MODES_ATTENTE = ['cheque', 'virement', 'mobile_money', 'carte'];
    
    const text = (v) => String(v ?? '').trim();
    
    const attentesOuvertes = (state, inscriptionId) => (state.paiementsEnAttente || [])
      .filter((a) => a.statut === 'en_attente' && (inscriptionId === undefined || a.inscriptionId === Number(inscriptionId)));
    
    const totalEnAttente = (state, inscriptionId) => attentesOuvertes(state, inscriptionId).reduce((s, a) => s + Number(a.montant || 0), 0);
    
    function numeroAttente(state, date) {
      const year = String(date || todayISO()).slice(0, 4);
      if (!state.compteursAttente || typeof state.compteursAttente !== 'object') state.compteursAttente = {};
      const next = Number(state.compteursAttente[year] || 0) + 1;
      state.compteursAttente[year] = next;
      return `ATT-${year}-${String(next).padStart(6, '0')}`;
    }
    
    // Contrôles identiques à un paiement (élève, montant, modalité, année ouverte…), plus : moyen non comptant,
    // référence obligatoire et montant cumulé des règlements en attente qui ne dépasse pas le solde restant.
    function validateAttente(state, payload = {}) {
      if (!MODES_ATTENTE.includes(payload.mode)) return { ok: false, message: 'Seuls un chèque, un virement, un paiement électronique ou par carte peuvent être mis en attente.' };
      if (!text(payload.reference)) return { ok: false, message: 'La référence (n° de chèque, de transaction…) est obligatoire pour un règlement en attente.' };
      if (payload.token && (state.paiementsEnAttente || []).some((a) => a.token === payload.token)) return { ok: false, message: 'Ce règlement a déjà été enregistré (double soumission évitée).' };
      const check = validatePaiement(state, { ...payload, token: '' }, { ignoreDuplicate: true });
      if (!check.ok) return check;
      const inscription = state.inscriptions.find((i) => i.id === Number(payload.inscriptionId));
      const plan = planPourModalite(state, inscription, payload.modalite || inscription.modalite);
      const reste = plan.ok ? previewPaiement({ echeances: plan.echeances }, 0).before.reste : 0;
      const deja = totalEnAttente(state, inscription.id);
      if (Number(payload.montant) + deja > reste) {
        return { ok: false, message: `Avec les règlements déjà en attente (${deja.toLocaleString('fr-FR')}), ce montant dépasserait le solde restant de l’élève (${reste.toLocaleString('fr-FR')}).` };
      }
      return { ok: true };
    }
    
    function enregistrerAttente(state, payload = {}) {
      exiger('paiements.encaisser');
      const check = validateAttente(state, payload);
      if (!check.ok) throw new Error(check.message);
      return withTransaction(state, () => {
        const inscription = state.inscriptions.find((i) => i.id === Number(payload.inscriptionId));
        const user = currentUser();
        const date = payload.datePaiement || todayISO();
        const attente = {
          id: nextId(state.paiementsEnAttente), numero: numeroAttente(state, date), inscriptionId: inscription.id, anneeId: inscription.anneeId,
          montant: Number(payload.montant), mode: payload.mode, reference: text(payload.reference), payeur: text(payload.payeur), motifPaiement: text(payload.motifPaiement),
          observation: text(payload.observation), modalite: payload.modalite || inscription.modalite || '', reliquatId: Number(payload.reliquatId) || 0,
          compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode)?.id || 0, dateReception: date, statut: 'en_attente',
          utilisateur: user?.nom || '', utilisateurId: user?.id || 0, token: payload.token || '', creeLe: Date.now()
        };
        state.paiementsEnAttente.push(attente);
        const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
        logOperation(state, 'attente', `${attente.numero} — ${eleve ? `${eleve.prenom} ${eleve.nom}` : 'élève'} — ${MODES_PAIEMENT[attente.mode]} ${attente.reference} en attente de confirmation`, attente.montant);
        return attente;
      });
    }
    
    // Confirmation : le paiement réel est créé à la date d'encaissement (crédit effectif), avec toutes les règles habituelles
    function confirmerAttente(state, id, { dateEncaissement = todayISO(), compteId = 0 } = {}) {
      exiger('paiements.encaisser');
      const attente = (state.paiementsEnAttente || []).find((a) => a.id === Number(id));
      if (!attente || attente.statut !== 'en_attente') throw new Error('Règlement introuvable ou déjà traité.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEncaissement) || dateEncaissement > todayISO()) throw new Error('Date d’encaissement invalide (pas de date future).');
      if (dateEncaissement < attente.dateReception) throw new Error('La date d’encaissement ne peut pas précéder la date de réception.');
      const compte = compteOf(state, compteId || attente.compteId);
      if (!compte || compte.actif === false) throw new Error('Compte destinataire introuvable ou désactivé.');
      const payload = {
        inscriptionId: attente.inscriptionId, montant: attente.montant, mode: attente.mode, reference: attente.reference, payeur: attente.payeur,
        motifPaiement: attente.motifPaiement, observation: attente.observation, modalite: attente.modalite, reliquatId: attente.reliquatId,
        compteId: compte.id, datePaiement: dateEncaissement, attenteId: attente.id
      };
      const check = validatePaiement(state, payload, { ignoreDuplicate: true });
      if (!check.ok) throw new Error(check.message);
      return withTransaction(state, () => {
        const payment = createPaiement(state, payload, { ignoreDuplicate: true });
        if (!payment) throw new Error('Le paiement n’a pas pu être créé.');
        Object.assign(attente, { statut: 'confirme', paiementId: payment.id, numeroRecu: payment.numeroRecu, compteId: compte.id, dateConfirmation: dateEncaissement, confirmePar: currentUser()?.nom || '' });
        logOperation(state, 'attente', `${attente.numero} confirmé — reçu ${payment.numeroRecu}`, attente.montant);
        return payment;
      });
    }
    
    function rejeterAttente(state, id, motif) {
      exiger('paiements.annuler');
      const attente = (state.paiementsEnAttente || []).find((a) => a.id === Number(id));
      if (!attente || attente.statut !== 'en_attente') throw new Error('Règlement introuvable ou déjà traité.');
      if (!text(motif)) throw new Error('Le motif du rejet est obligatoire (ex. chèque sans provision).');
      return withTransaction(state, () => {
        Object.assign(attente, { statut: 'rejete', motif: text(motif), dateRejet: todayISO(), rejetePar: currentUser()?.nom || '' });
        logOperation(state, 'attente', `${attente.numero} rejeté — ${attente.motif}`, attente.montant);
        return attente;
      });
    }
    
    Object.assign(exports, { STATUTS_ATTENTE, MODES_ATTENTE, attentesOuvertes, totalEnAttente, validateAttente, enregistrerAttente, confirmerAttente, rejeterAttente });
  };
  factories['./modules/recus.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, numberToFrench, todayISO } = require("./utils.js");
    const { classOf, studentOf, yearLabel } = require("./finance.js");
    const { paymentAllocations, ordreEcheances, echeanceDu, allocationLabel, echeancierSituation, STATUT_ECHEANCE_LABELS } = require("./allocation.js");
    const { MODALITES, modaliteActuelle } = require("./modalites.js");
    const { ensureReceiptNumber } = require("./paiements.js");
    const { printDocument } = require("./print.js");
    const { enteteHtml } = require("./entete.js");
    const { compteLabel } = require("./comptes.js");
    const MODES = { espece: 'Espèces', virement: 'Virement bancaire', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte bancaire' };
    // Deux exemplaires sur une feuille A4 : l'un est remis au payeur, l'autre est conservé par la comptabilité
    const EXEMPLAIRES = ['Exemplaire élève / famille', 'Exemplaire comptabilité'];
    
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
        // Payeur affiché : celui saisi, sinon le parent / tuteur, sinon l'élève
        payeurNom: payment.payeur || student?.parent || (student ? `${student.prenom} ${student.nom}` : '—'),
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
        agent: payment.utilisateur || payment.caissier || '',
        heure: payment.heure || '',
        compte: compteLabel(state, payment.compteId),
        observation: payment.observation || '',
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
    
    function receiptCopyHtml(config, d, exemplaire = '', duplicata = false) {
      const devise = escapeHtml(config.devise);
      return `<section class="rc-copy">
        ${exemplaire || duplicata ? `<div class="rc-exemplaire">${escapeHtml(exemplaire)}${duplicata ? ' — DUPLICATA (réimpression, aucun nouveau paiement)' : ''}</div>` : ''}
        ${enteteHtml(config, { compact: true })}
        <div class="rc-titlebar"><h2>${d.dette ? 'Reçu — dette antérieure' : 'Reçu de paiement'}</h2><div><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}${d.heure ? ` à ${escapeHtml(d.heure)}` : ''}</span></div></div>
        <div class="rc-columns">
          <div class="rc-box">
            <h3>Élève</h3>
            <p class="rc-name">${escapeHtml(d.eleve)}</p>
            <p><b>Matricule : ${escapeHtml(d.matricule)}</b></p>
            <p><b>Classe : <span class="rc-upper">${escapeHtml(d.classe)}</span></b>${d.categorie ? ` <span class="rc-muted">(${escapeHtml(d.categorie)})</span>` : ''}</p>
            <p>Année scolaire : ${escapeHtml(d.annee)}</p>
            <p>Payeur : <b>${escapeHtml(d.payeurNom)}</b></p>
          </div>
          <div class="rc-box">
            <h3>Paiement</h3>
            <p class="rc-muted">Bénéficiaire : ${escapeHtml(config.nom)}</p>
            <p class="rc-amount">${formatMoney(d.montant)} ${devise}</p>
            <p class="rc-words">${escapeHtml(amountInWords(d.montant, config.devise))}</p>
            <p>Moyen : <b>${escapeHtml(d.moyen)}</b>${d.reference ? ` · Réf. transaction : ${escapeHtml(d.reference)}` : ''}</p>
            <p>Compte : ${escapeHtml(d.compte)} · Agent : <b>${escapeHtml(d.agent || '—')}</b></p>
            ${d.dette ? `<p>Dette de l’année <b>${escapeHtml(d.dette.origine)}</b> · encaissée en ${escapeHtml(d.dette.encaissement)}</p>` : `<p>Modalité : <b>${escapeHtml(MODALITES[d.modalite] || '')}</b>${d.reimpute ? ' <span class="rc-muted">(réimputé après changement)</span>' : ''}</p>`}
            <p>Période concernée : <b>${escapeHtml(d.periode)}</b></p>
          </div>
        </div>
        ${progressBarHtml(d.progression, d.modalite)}
        <div class="rc-totals">
          <div><span>Montant attendu</span><b>${formatMoney(d.progression.total)} ${devise}</b></div>
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
    
    // `duplicata` : réimpression d'un reçu déjà émis (même numéro, aucun nouveau paiement n'est créé)
    function receiptHtml(state, payment, copies = 2, { duplicata = false } = {}) {
      const data = buildReceiptData(state, payment);
      const html = Array.from({ length: copies }, (_, i) => receiptCopyHtml(state.config, data, copies > 1 ? EXEMPLAIRES[i] || '' : '', duplicata)).join('');
      return { data, html: `<div class="rc-doc"><div class="rc-sheet">${html}</div></div>` };
    }
    
    // Retourne false si le paiement est introuvable/annulé. Peut attribuer un numéro à un ancien paiement
    // qui n'en avait pas : l'appelant doit alors sauvegarder l'état (le numéro ne change plus ensuite).
    const receiptFileName = (numero) => `Recu-${numero}`;
    
    function printReceipt(state, paymentId, fileName = '', { duplicata = false } = {}) {
      const payment = state.paiements.find((p) => p.id === Number(paymentId));
      if (!payment || payment.annule) return false;
      ensureReceiptNumber(state, payment);
      const { data, html } = receiptHtml(state, payment, 2, { duplicata });
      return printDocument({ title: `Reçu ${data.numero}`, html, css: RECEIPT_CSS, margin: '0', fileName: fileName || receiptFileName(data.numero) });
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
      return printDocument({ title: `Facture ${invoiceNumber(state, inscription)}`, html: invoiceHtml(state, inscription), css: `${RECEIPT_CSS}${INVOICE_CSS}`, margin: '10mm', fileName: `Facture-${invoiceNumber(state, inscription)}` });
    }
    
    Object.assign(exports, { EXEMPLAIRES, amountInWords, progressionAt, buildReceiptData, progressBarHtml, RECEIPT_CSS, receiptHtml, receiptFileName, printReceipt, invoiceNumber, INVOICE_CSS, invoiceHtml, printInvoice });
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
  factories['./modules/paiement-form.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { previewPaiement, STATUT_GLOBAL_LABELS } = require("./allocation.js");
    const { echeancierHtml, allocationTableHtml, progressBar } = require("./echeancier-view.js");
    const { cashierName } = require("./paiements.js");
    const { MODALITES, tarifFor, modalitesDisponibles, hasValidPayments, modaliteActuelle, planPourModalite, totalTranches, texteMensuel } = require("./modalites.js");
    const { studentOf } = require("./finance.js");
    const { reliquatsEleve, reliquatOf, situationReliquat, anneeEncaissement } = require("./reliquats.js");
    const { comptesActifs, compteParDefaut } = require("./comptes.js");
    const { attentesOuvertes, MODES_ATTENTE } = require("./attente.js");
    const { reductionLabel } = require("./reductions.js");
    const { can } = require("./auth.js");
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
    
    function paymentFormHtml(state) {
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
    function bindPaymentForm(state) {
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
    
    Object.assign(exports, { paymentFormHtml, initPaymentForm, selectDebtForPayment, selectStudentForPayment, bindPaymentForm });
  };
  factories['./modules/details.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr } = require("./utils.js");
    const { inscriptionSituation, STATUT_LABELS, studentOf, yearLabel, classOf, labelEcheance, scopeInscriptions } = require("./finance.js");
    const { buildReceiptData, receiptHtml, RECEIPT_CSS, printReceipt, receiptFileName } = require("./recus.js");
    const { showDocumentPreview } = require("./doc-preview.js");
    const { expenseReceiptHtml, printExpenseReceipt, EXPENSE_RECEIPT_CSS } = require("./depenses-view.js");
    const { bulletinHtml, BULLETIN_CSS, printBulletins } = require("./bulletin-paie.js");
    const { ensureReceiptNumber } = require("./paiements.js");
    const { paymentAllocations, allocationLabel } = require("./allocation.js");
    const { texteMensuel } = require("./modalites.js");
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
        <p class="meta">${Number(t.montantMensuel) > 0 ? `Paiement mensuel : ${escapeHtml(texteMensuel(state, t, formatMoney))} ${escapeHtml(state.config.devise)}${t.moisDebut ? `, 1ère mensualité le ${escapeHtml(formatDateFr(t.moisDebut))}` : ''}.` : 'Paiement mensuel non proposé pour cette classe.'}</p>
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
    
    // Aperçus de documents (reçu de scolarité, reçu de dépense, bulletin de paie) : affichés automatiquement après
    // une opération réussie ou à la demande, avec Imprimer, Télécharger en PDF et Fermer.
    // `duplicata` : consultation ou réimpression ultérieure d'un reçu (jamais de nouveau paiement)
    function showReceiptPreview(state, id, { duplicata = false } = {}) {
      const payment = state.paiements.find((p) => p.id === Number(id));
      if (!payment || payment.annule) return false;
      ensureReceiptNumber(state, payment);
      const { data, html } = receiptHtml(state, payment, 1, { duplicata });
      return showDocumentPreview({
        eyebrow: 'Reçu de paiement', title: `Reçu ${data.numero}`, subtitle: `${data.eleve} · ${formatMoney(data.montant)} ${state.config.devise} · impression A4 en 2 exemplaires (élève et comptabilité)${duplicata ? ' · duplicata' : ''}`,
        html: `<div class="receipt-preview">${html}</div>`, css: `${RECEIPT_CSS} .receipt-preview .rc-sheet { height: auto; } .receipt-preview .rc-copy { border: 1px solid #e5e7eb; border-radius: 8px; }`,
        fileName: receiptFileName(data.numero), print: (fileName) => printReceipt(state, payment.id, fileName, { duplicata })
      });
    }
    
    function showExpenseReceiptPreview(state, id) {
      const doc = expenseReceiptHtml(state, id);
      if (!doc) return false;
      const d = doc.depense;
      return showDocumentPreview({
        eyebrow: 'Reçu de dépense', title: `Reçu ${d.numero}`, subtitle: `${d.beneficiaire || d.categorie} · ${formatMoney(d.montant)} ${state.config.devise}`,
        html: doc.html, css: EXPENSE_RECEIPT_CSS, fileName: `Recu-${d.numero}`, print: (fileName) => printExpenseReceipt(state, d.id, fileName)
      });
    }
    
    function showBulletinPreview(state, paieId) {
      const paie = state.paies.find((p) => p.id === Number(paieId));
      if (!paie || !(paie.statut === 'validee' || paie.statut === 'payee')) return false;
      return showDocumentPreview({
        eyebrow: 'Bulletin de paie', title: `Bulletin ${paie.numero}`, subtitle: `${paie.calcul.employe.prenom} ${paie.calcul.employe.nom} · net ${formatMoney(paie.calcul.net)} ${state.config.devise}`,
        html: `<div class="bp-doc">${bulletinHtml(state, paie)}</div>`, css: BULLETIN_CSS, fileName: `Bulletin-${paie.numero}`, print: (fileName) => printBulletins(state, [paie.id], fileName)
      });
    }
    
    function showDetail(state, kind, id) {
      const n = Number(id);
      if (kind === 'classe') return showClasse(state, n);
      if (kind === 'tarif') return showTarif(state, n);
      if (kind === 'annee') return showAnnee(state, n);
      if (kind === 'paiement') return showPaiement(state, n);
      return false;
    }
    
    Object.assign(exports, { showReceiptPreview, showExpenseReceiptPreview, showBulletinPreview, showDetail });
  };
  factories['./ui.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, downloadCsv } = require("./modules/utils.js");
    const { paymentFormHtml, initPaymentForm } = require("./modules/paiement-form.js");
    const { echeancierHtml } = require("./modules/echeancier-view.js");
    const { paymentAllocations, allocationLabel, echeancierSituation } = require("./modules/allocation.js");
    const { can } = require("./modules/auth.js");
    const { MODALITES } = require("./modules/modalites.js");
    const { paymentYear } = require("./modules/tresorerie.js");
    const { responsablesEleve, enfantsDuContact, nomContact, LIENS } = require("./modules/contacts.js");
    const { MODES_PAIEMENT } = require("./modules/paiements.js");
    const { compteLabel } = require("./modules/comptes.js");
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
    
    // Libellé lisible d'un moyen de paiement
    const modeLabel = (mode) => MODES_PAIEMENT[mode] || mode || '—';
    
    // Règlements en attente (chèques, virements non encore crédités) : à confirmer ou à rejeter
    function attentesPanel(state) {
      const list = (state.paiementsEnAttente || []).filter((a) => a.statut === 'en_attente').sort((a, b) => String(a.dateReception).localeCompare(String(b.dateReception)));
      const traites = (state.paiementsEnAttente || []).filter((a) => a.statut !== 'en_attente').length;
      if (!list.length && !traites) return '';
      const devise = escapeHtml(state.config.devise || '');
      return `<div class="panel pending-panel">
        <div class="panel-header"><h3>Règlements en attente de confirmation</h3><span class="meta">${list.length} en attente · exclus de tous les totaux jusqu’à confirmation${traites ? ` · ${traites} déjà traité(s)` : ''}</span></div>
        <div class="table-wrap"><table class="data-list" data-list="attentes" data-list-title="Règlements en attente">
          <thead><tr><th>N°</th><th>Reçu le</th><th>Élève</th><th>Moyen</th><th>Référence</th><th>Compte prévu</th><th>Montant</th><th>Saisi par</th><th>Actions</th></tr></thead>
          <tbody>${list.map((a) => {
            const inscription = state.inscriptions.find((i) => i.id === a.inscriptionId);
            const eleve = inscription && state.eleves.find((e) => e.id === inscription.eleveId);
            return `<tr><td>${escapeHtml(a.numero)}</td><td>${escapeHtml(a.dateReception)}</td><td>${escapeHtml(eleve ? `${eleve.prenom} ${eleve.nom}` : '—')}<div class="meta">${escapeHtml(eleve?.matricule || '')}</div></td>
              <td>${escapeHtml(modeLabel(a.mode))}</td><td>${escapeHtml(a.reference)}</td><td>${escapeHtml(compteLabel(state, a.compteId))}</td><td class="num">${formatMoney(a.montant)} ${devise}</td><td>${escapeHtml(a.utilisateur || '—')}</td>
              <td>${can('write') ? `<button class="action-btn" data-action="attente:confirm:${a.id}">Confirmer l’encaissement</button><button class="action-btn delete" data-action="attente:reject:${a.id}">Rejeter</button>` : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="9">Aucun règlement en attente.</td></tr>'}</tbody>
        </table></div>
      </div>`;
    }
    
    function renderPaiements(state) {
      const section = document.getElementById('paiements');
      const devise = escapeHtml(state.config.devise || '');
      section.innerHTML = `
        <div class="page-intro">
          <div><span class="eyebrow">Trésorerie</span><h2>Encaissements et reçus</h2></div>
          <button class="secondary-btn small-btn" data-action="paiement:export-csv">Exporter la liste des paiements CSV</button>
        </div>
        ${state.annees.length ? `<div class="panel section-form">
          <div class="panel-header"><h3>Enregistrer un paiement</h3><span class="meta">Imputation automatique sur les tranches ou mensualités, dans l’ordre</span></div>
          ${paymentFormHtml(state)}
        </div>` : `<div class="panel empty-state"><span class="empty-icon" aria-hidden="true">💳</span><h3>Aucune année scolaire</h3><p class="meta">Créez l’année scolaire, les classes et leurs tarifs, puis inscrivez les élèves : les encaissements pourront ensuite être enregistrés ici.</p><p><button type="button" class="primary-btn small-btn" data-nav="annees">Créer l’année scolaire</button></p></div>`}
        ${attentesPanel(state)}
        <div class="panel">
          <div class="panel-header"><h3>Journal des paiements</h3><span class="meta" data-payment-count>${state.paiements.length} résultat(s) · annulations conservées</span></div>
          <div class="advanced-search payment-search">
            <label>Recherche <input type="search" data-payment-search placeholder="Élève, matricule, n° de reçu, référence, agent…" /></label>
            <label>Du <input type="date" data-payment-from /></label>
            <label>Au <input type="date" data-payment-to /></label>
            <label>Année scolaire
              <select data-payment-year>${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}${a.id === state.anneeActiveId ? ' (active)' : ''}</option>`).join('')}<option value="all">Toutes les années</option></select>
            </label>
            <label>État
              <select data-payment-status><option value="">Tous</option><option value="valide">Validés</option><option value="annule">Annulés</option></select>
            </label>
          </div>
          <div class="table-wrap">
            <table class="data-list" data-list="paiements" data-list-title="Journal des paiements" data-list-add="#paiements form[data-form=paiement]">
              <thead><tr><th>N° reçu</th><th>Élève</th><th>Matricule</th><th>Classe / année</th><th>Montant</th><th>Imputé sur</th><th>Moyen</th><th>Compte</th><th>Référence</th><th>Agent</th><th>Date</th><th>État</th><th>Actions</th></tr></thead>
              <tbody>
                ${[...state.paiements].sort((a, b) => String(b.datePaiement).localeCompare(String(a.datePaiement)) || b.id - a.id).map((paiement) => {
                  const inscription = state.inscriptions.find((i) => i.id === paiement.inscriptionId);
                  const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
                  const studentName = eleve ? `${eleve.prenom} ${eleve.nom}` : '—';
                  const searchable = [paiement.numeroRecu, studentName, eleve?.matricule, paiement.reference, modeLabel(paiement.mode), paiement.caissier, paiement.utilisateur, paiement.payeur].join(' ').toLowerCase();
                  const corrections = (paiement.historique || []).length;
                  return `
                    <tr data-payment-row data-years="${paymentYear(state, paiement)}" data-date="${escapeHtml(paiement.datePaiement || '')}" data-status="${paiement.annule ? 'annule' : 'valide'}" data-search="${escapeHtml(searchable)}" class="${paiement.annule ? 'cancelled' : ''}">
                      <td>${escapeHtml(paiement.numeroRecu || '—')}</td>
                      <td>${escapeHtml(studentName)}${paiement.payeur ? `<div class="meta">payé par ${escapeHtml(paiement.payeur)}</div>` : ''}</td>
                      <td>${escapeHtml(eleve?.matricule || '—')}</td>
                      <td>${escapeHtml(inscription ? `${getClassName(state, inscription.classeId)} / ${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || '—'}` : '—')}</td>
                      <td class="num">${formatMoney(paiement.montant)} ${devise}</td>
                      <td>${escapeHtml(paymentAllocations(paiement).map((a) => `${allocationLabel(inscription, a)} (${formatMoney(a.montant)})`).join(' + ') || '—')}</td>
                      <td>${escapeHtml(modeLabel(paiement.mode))}</td>
                      <td>${escapeHtml(compteLabel(state, paiement.compteId))}</td>
                      <td>${escapeHtml(paiement.reference || '—')}${paiement.observation ? `<div class="meta">${escapeHtml(paiement.observation)}</div>` : ''}</td>
                      <td>${escapeHtml(paiement.utilisateur || paiement.caissier || '—')}${paiement.caissier && paiement.caissier !== paiement.utilisateur ? `<div class="meta">caissier : ${escapeHtml(paiement.caissier)}</div>` : ''}</td>
                      <td>${escapeHtml(paiement.datePaiement || '')}${paiement.heure ? `<div class="meta">${escapeHtml(paiement.heure)}</div>` : ''}</td>
                      <td><span class="badge ${paiement.annule ? 'danger' : 'ok'}">${paiement.annule ? 'Annulé' : 'Validé'}</span>${paiement.annule && paiement.motif ? `<div class="meta">${escapeHtml(paiement.motif)}</div>` : ''}${corrections ? `<div class="meta">${corrections} correction(s) tracée(s)</div>` : ''}</td>
                      <td>
                        <button class="action-btn" data-action="paiement:view:${paiement.id}">Consulter</button>${paiement.annule ? '' : `<button class="action-btn" data-action="paiement:receipt:${paiement.id}">Reçu</button>
                        ${can('write') ? `<button class="action-btn" data-action="paiement:correct:${paiement.id}">Corriger</button><button class="action-btn delete" data-action="paiement:cancel:${paiement.id}">Annuler</button>` : ''}`}
                      </td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="13">Aucun paiement enregistré pour le moment.</td></tr>'}
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
      const year = filters.year && filters.year !== 'all' ? Number(filters.year) : 0;
      const rows = [['N° reçu', 'Date', 'Heure', 'Matricule', 'Élève', 'Année scolaire', 'Classe', 'Échéance', 'Montant', 'Devise', 'Moyen', 'Compte', 'Référence', 'Agent', 'Caissier', 'Observation', 'État', 'Motif annulation']];
      const payments = [...state.paiements]
        .filter((payment) => {
          const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
          const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
          const haystack = [payment.numeroRecu, eleve?.matricule, eleve?.prenom, eleve?.nom, payment.reference, MODES_PAIEMENT[payment.mode] || payment.mode, payment.caissier, payment.utilisateur, payment.payeur]
            .join(' ').toLocaleLowerCase('fr');
          return (!search || haystack.includes(search))
            && (!status || (payment.annule ? 'annule' : 'valide') === status)
            && (!from || payment.datePaiement >= from)
            && (!to || payment.datePaiement <= to)
            && (!year || paymentYear(state, payment) === year);
        })
        .sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)));
    
      payments.forEach((payment) => {
        const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
        const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
        rows.push([
          payment.numeroRecu || '',
          payment.datePaiement,
          payment.heure || '',
          eleve?.matricule || '',
          eleve ? `${eleve.prenom} ${eleve.nom}` : '',
          state.annees.find((item) => item.id === inscription?.anneeId)?.annee || '',
          getClassName(state, inscription?.classeId),
          paymentAllocations(payment).map((a) => `${allocationLabel(inscription, a)}: ${a.montant}`).join(' + '),
          payment.montant,
          state.config.devise,
          MODES_PAIEMENT[payment.mode] || payment.mode,
          compteLabel(state, payment.compteId),
          payment.reference,
          payment.utilisateur || '',
          payment.caissier,
          payment.observation || '',
          payment.annule ? 'Annulé' : 'Validé',
          payment.motif || ''
        ]);
      });
    
      downloadCsv(`liste-paiements-${year ? (state.annees.find((a) => a.id === year)?.annee || year) : 'toutes-annees'}.csv`, rows);
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
                  ${responsablesEleve(state, student).map((r) => `<dt>${escapeHtml(LIENS[r.lien] || 'Responsable')}${r.principal ? ' (principal)' : ''}</dt><dd>${escapeHtml(nomContact(r.contact))}<br><span class="meta">${escapeHtml([r.contact.telephone, r.contact.telephone2].filter(Boolean).join(' · ') || 'sans téléphone')}${r.contact.adresse ? ` · ${escapeHtml(r.contact.adresse)}` : ''}</span></dd>`).join('') || `<dt>Parent / tuteur</dt><dd>${escapeHtml(student.parent || '—')}</dd>`}
                  ${student.urgence ? `<dt>Contact d’urgence</dt><dd>${escapeHtml(student.urgence.nom || '—')} · ${escapeHtml(student.urgence.telephone || '—')}</dd>` : ''}
                  ${(() => { const freres = responsablesEleve(state, student).flatMap((r) => enfantsDuContact(state, r.contactId)).filter((e, i, all) => e.id !== student.id && all.findIndex((x) => x.id === e.id) === i); return freres.length ? `<dt>Frères et sœurs</dt><dd>${freres.map((e) => escapeHtml(`${e.prenom} ${e.nom} (${e.matricule})`)).join(', ')}</dd>` : ''; })()}
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
})(window.IBK_APP.factories);

