// GEST SCHOOL SCOLARITÉ · 07-depenses-tresorerie.js
// Caisse et trésorerie : dépenses, dépenses récurrentes, reçus de dépense, comptes, virements, journées de caisse et rapprochements
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/depenses.js, ./modules/depenses-view.js, ./modules/tresorerie.js, ./modules/comptes-view.js, ./modules/caisse.js, ./modules/caisse-view.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/depenses.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { compteOf, compteParDefaut } = require("./comptes.js");
    const { motifVerrou, motifCaisseFermee, exigerNonVerrouille } = require("./clotures.js");
    const MODES_REGLEMENT_DEPENSE = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money' };
    // Dépenses générées automatiquement par la paie : corrigées et annulées depuis leur module d'origine
    const SOURCES_PAIE = ['paie', 'avance'];
    const depenseDePaie = (depense) => SOURCES_PAIE.includes(depense?.source?.type);
    
    // Catégories proposées à une nouvelle installation, modifiables par l'établissement (Paramètres financiers).
    // CATEGORIES_DEPENSE est mis à jour sur place avec la liste configurée.
    const CATEGORIES_DEPENSE_DEFAUT = [
      'Salaires et indemnités', 'Avances sur salaire', 'Eau', 'Électricité', 'Loyer', 'Entretien et réparations', 'Fournitures et matériel',
      'Prestations de services', 'Transport', 'Communication', 'Impôts et frais administratifs', 'Autres charges'
    ];
    const CATEGORIES_DEPENSE = [...CATEGORIES_DEPENSE_DEFAUT];
    
    const nettoyerListe = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().slice(0, 60)).filter(Boolean))];
    
    function syncCategoriesDepense(state) {
      const configured = nettoyerListe(state.config.categoriesDepense);
      state.config.categoriesDepense = configured.length ? configured : [...CATEGORIES_DEPENSE_DEFAUT];
      CATEGORIES_DEPENSE.splice(0, CATEGORIES_DEPENSE.length, ...state.config.categoriesDepense);
      return CATEGORIES_DEPENSE;
    }
    
    // Les catégories des dépenses déjà enregistrées restent valables (historique) même si elles sont retirées de la liste
    function setCategoriesDepense(state, list) {
      exiger('admin');
      const next = nettoyerListe(list);
      if (!next.length) throw new Error('Gardez au moins une catégorie de dépense.');
      state.config.categoriesDepense = next;
      return syncCategoriesDepense(state);
    }
    
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
      if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier (sans décimales).' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de dépense invalide.' };
      if (date > todayISO()) return { ok: false, message: 'La date de la dépense ne peut pas être dans le futur.' };
      if (!text(payload.demandeur)) return { ok: false, message: 'Indiquez qui a demandé la dépense.' };
      if (payload.mode && !MODES_REGLEMENT_DEPENSE[payload.mode]) return { ok: false, message: 'Mode de règlement inconnu.' };
      if (payload.compteId) {
        const compte = compteOf(state, payload.compteId);
        if (!compte) return { ok: false, message: 'Compte payeur introuvable.' };
        if (compte.actif === false) return { ok: false, message: `Le compte « ${compte.libelle} » est désactivé.` };
      }
      const annee = state.annees.find((a) => a.id === Number(payload.anneeId));
      if (!annee) return { ok: false, message: 'Année scolaire introuvable.' };
      if (annee.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : aucune dépense ne peut y être enregistrée.` };
      const compteCible = Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0;
      const verrou = motifVerrou(state, compteCible, date, 'une dépense') || motifCaisseFermee(state, compteCible, date);
      if (verrou) return { ok: false, message: verrou };
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
      // Dépense générée par la paie : droit « paie » ; sinon droit de saisie des dépenses
      exiger(SOURCES_PAIE.includes(payload.source?.type) ? 'paie.gerer' : 'depenses.saisir');
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
          mode: MODES_REGLEMENT_DEPENSE[payload.mode] ? payload.mode : 'espece',
          // Compte qui paie (caisse, banque…) : par défaut celui qui correspond au mode de règlement
          compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0,
          observation: text(payload.observation),
          statut: 'validee',
          piece: payload.piece || null,
          // Dépense générée par la paie ou une avance : synchronisée avec son origine
          source: payload.source || null,
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
      exiger('depenses.corriger');
      const depense = state.depenses.find((d) => d.id === Number(id));
      if (!depense || depense.annule) return null;
      if (depenseDePaie(depense)) throw new Error('Dépense générée par la paie : elle se corrige depuis le module Paie du personnel.');
      // Le contrôle de doublon porte sur l'enregistrement lui-même (il vient d'être créé) : seul un doublon est toléré ici
      exigerNonVerrouille(state, depense.compteId, depense.date, 'la correction de cette dépense');
      const check = validateDepense(state, { ...payload, token: '' }, { ignoreDuplicate: true });
      if (!check.ok) return null;
      return withTransaction(state, () => {
        const before = { categorie: depense.categorie, description: depense.description, montant: depense.montant, date: depense.date, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference, anneeId: depense.anneeId, mode: depense.mode, compteId: depense.compteId, observation: depense.observation || '' };
        depense.historique = [...(depense.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif: text(payload.motifCorrection), avant: before }];
        Object.assign(depense, {
          anneeId: Number(payload.anneeId), categorie: text(payload.categorie), description: text(payload.description), montant: Number(payload.montant),
          date: payload.date || depense.date, beneficiaire: text(payload.beneficiaire), demandeur: text(payload.demandeur), reference: text(payload.reference), mode: payload.mode || depense.mode || 'espece',
          compteId: Number(payload.compteId) || depense.compteId, observation: payload.observation !== undefined ? text(payload.observation) : (depense.observation || '')
        });
        if (payload.piece) depense.piece = payload.piece;
        logOperation(state, 'depense', `${depense.numero} corrigée (avant : ${before.montant} — ${before.description})`, depense.montant);
        return depense;
      });
    }
    
    // Annulation : la ligne et son numéro sont conservés, elle n'entre plus dans les totaux
    function cancelDepense(state, id, motif, { systeme = false } = {}) {
      const depense = state.depenses.find((d) => d.id === Number(id));
      if (!depense || depense.annule || !text(motif)) return null;
      exigerNonVerrouille(state, depense.compteId, depense.date, 'l’annulation de cette dépense');
      if (depenseDePaie(depense) && !systeme) throw new Error('Dépense générée par la paie : elle s’annule depuis le module Paie du personnel.');
      exiger(systeme ? 'paie.gerer' : 'depenses.corriger');
      return withTransaction(state, () => {
        depense.annule = true;
        depense.statut = 'annulee';
        depense.motif = text(motif);
        depense.dateAnnulation = todayISO();
        depense.annuleePar = currentUser()?.nom || '';
        logOperation(state, 'annulation', `Dépense ${depense.numero} annulée — ${depense.motif}`, depense.montant);
        return depense;
      });
    }
    
    // ---------- Dépenses récurrentes (loyer, abonnements, salaires fixes hors paie…) ----------
    // Un modèle décrit la dépense et sa fréquence. L'application signale chaque échéance due ; rien n'est jamais
    // enregistré automatiquement : l'utilisateur confirme chaque occurrence (montant et date ajustables), ce qui crée
    // une dépense ordinaire reliée au modèle et à sa période (une période ne peut être enregistrée qu'une fois).
    const FREQUENCES = { mensuelle: 'Mensuelle', trimestrielle: 'Trimestrielle', semestrielle: 'Semestrielle', annuelle: 'Annuelle' };
    const PAS_MOIS = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };
    const JOURS_ALERTE_RECURRENTE = 15;
    
    function checkRecurrente(state, payload) {
      const libelle = text(payload.libelle);
      const montant = Number(payload.montant);
      const jour = Number(payload.jour || 1);
      if (!libelle) throw new Error('Donnez un libellé à la dépense récurrente.');
      if (!text(payload.categorie)) throw new Error('Choisissez une catégorie.');
      if (!Number.isInteger(montant) || montant <= 0) throw new Error('Le montant doit être un nombre entier supérieur à zéro.');
      if (!FREQUENCES[payload.frequence]) throw new Error('Choisissez une fréquence.');
      if (!Number.isInteger(jour) || jour < 1 || jour > 28) throw new Error('Le jour d’échéance doit être compris entre 1 et 28.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dateDebut || '')) throw new Error('Indiquez la date de la première échéance.');
      if (payload.dateFin && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dateFin) || payload.dateFin < payload.dateDebut)) throw new Error('La date de fin doit suivre la date de début.');
      if (payload.mode && !MODES_REGLEMENT_DEPENSE[payload.mode]) throw new Error('Mode de règlement inconnu.');
      if (payload.compteId && !compteOf(state, payload.compteId)) throw new Error('Compte payeur introuvable.');
      return {
        libelle, categorie: text(payload.categorie), montant, beneficiaire: text(payload.beneficiaire), mode: MODES_REGLEMENT_DEPENSE[payload.mode] ? payload.mode : 'espece',
        compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0, frequence: payload.frequence, jour, dateDebut: payload.dateDebut, dateFin: payload.dateFin || ''
      };
    }
    
    function createRecurrente(state, payload = {}) {
      exiger('depenses.saisir');
      const fields = checkRecurrente(state, payload);
      const item = { id: nextId(state.depensesRecurrentes), ...fields, actif: true, ignorees: [], creePar: currentUser()?.nom || '', creeLe: new Date().toISOString() };
      state.depensesRecurrentes.push(item);
      logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » créée (${FREQUENCES[item.frequence]})`, item.montant);
      return item;
    }
    
    function updateRecurrente(state, id, payload = {}) {
      exiger('depenses.saisir');
      const item = state.depensesRecurrentes.find((r) => r.id === Number(id));
      if (!item) throw new Error('Dépense récurrente introuvable.');
      const fields = checkRecurrente(state, payload);
      item.historique = [...(item.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant: { montant: item.montant, frequence: item.frequence, jour: item.jour, dateFin: item.dateFin } }];
      Object.assign(item, fields);
      logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » modifiée`, item.montant);
      return item;
    }
    
    function setRecurrenteActive(state, id, actif) {
      exiger('depenses.saisir');
      const item = state.depensesRecurrentes.find((r) => r.id === Number(id));
      if (!item) throw new Error('Dépense récurrente introuvable.');
      item.actif = Boolean(actif);
      logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » ${item.actif ? 'réactivée' : 'suspendue'}`);
      return item;
    }
    
    const pad2 = (n) => String(n).padStart(2, '0');
    
    // Échéances d'un modèle jusqu'à une date limite : { periode: 'AAAA-MM', date: 'AAAA-MM-JJ' }
    function echeancesRecurrente(item, jusquA) {
      const out = [];
      const [y0, m0] = item.dateDebut.split('-').map(Number);
      const pas = PAS_MOIS[item.frequence] || 1;
      for (let k = 0; k < 600; k += pas) {
        const d = new Date(y0, m0 - 1 + k, 1);
        const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(item.jour)}`;
        if (date > jusquA || (item.dateFin && date > item.dateFin)) break;
        if (date >= item.dateDebut.slice(0, 8) + '01') out.push({ periode: date.slice(0, 7), date });
      }
      return out;
    }
    
    const ajouterJours = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
    
    // Occurrences à enregistrer : échues ou proches (15 jours), ni enregistrées (dépense valide), ni ignorées
    function occurrencesDues(state, today = todayISO()) {
      const limite = ajouterJours(today, JOURS_ALERTE_RECURRENTE);
      return (state.depensesRecurrentes || []).filter((r) => r.actif).flatMap((r) => echeancesRecurrente(r, limite)
        .filter(({ periode }) => !(r.ignorees || []).includes(periode)
          && !state.depenses.some((d) => !d.annule && d.source?.type === 'recurrente' && d.source.id === r.id && d.source.periode === periode))
        .map((o) => ({ recurrente: r, ...o, enRetard: o.date < today })))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // Enregistre l'occurrence d'une période : dépense ordinaire reliée au modèle
    function enregistrerOccurrence(state, recurrenteId, periode, payload = {}) {
      exiger('depenses.saisir');
      const r = state.depensesRecurrentes.find((x) => x.id === Number(recurrenteId));
      if (!r) throw new Error('Dépense récurrente introuvable.');
      if (state.depenses.some((d) => !d.annule && d.source?.type === 'recurrente' && d.source.id === r.id && d.source.periode === periode)) throw new Error('Cette échéance est déjà enregistrée.');
      const data = {
        anneeId: payload.anneeId, categorie: r.categorie, description: `${r.libelle} — ${periode}`, montant: payload.montant ?? r.montant, date: payload.date || todayISO(),
        beneficiaire: r.beneficiaire, demandeur: payload.demandeur || currentUser()?.nom || 'Dépense récurrente', reference: text(payload.reference), mode: r.mode, compteId: r.compteId,
        source: { type: 'recurrente', id: r.id, periode }
      };
      const check = validateDepense(state, data, { ignoreDuplicate: true });
      if (!check.ok) throw new Error(check.message);
      return createDepense(state, data, { ignoreDuplicate: true });
    }
    
    function ignorerOccurrence(state, recurrenteId, periode) {
      exiger('depenses.saisir');
      const r = state.depensesRecurrentes.find((x) => x.id === Number(recurrenteId));
      if (!r) throw new Error('Dépense récurrente introuvable.');
      r.ignorees = [...new Set([...(r.ignorees || []), periode])];
      logOperation(state, 'depense', `Échéance ${periode} de « ${r.libelle} » ignorée`);
      return r;
    }
    
    Object.assign(exports, { MODES_REGLEMENT_DEPENSE, depenseDePaie, CATEGORIES_DEPENSE_DEFAUT, CATEGORIES_DEPENSE, syncCategoriesDepense, setCategoriesDepense, ensureExpenseNumber, validateDepense, createDepense, updateDepense, cancelDepense, FREQUENCES, JOURS_ALERTE_RECURRENTE, createRecurrente, updateRecurrente, setRecurrenteActive, echeancesRecurrente, occurrencesDues, enregistrerOccurrence, ignorerOccurrence });
  };
  factories['./modules/depenses-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO, numberToFrench } = require("./utils.js");
    const { CATEGORIES_DEPENSE, ensureExpenseNumber, depenseDePaie, occurrencesDues, FREQUENCES, MODES_REGLEMENT_DEPENSE, JOURS_ALERTE_RECURRENTE } = require("./depenses.js");
    const { comptesActifs, compteParDefaut, compteLabel } = require("./comptes.js");
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
        // Seules les images et les PDF sont acceptés (un fichier HTML ou un exécutable ne doit jamais être stocké)
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) && file.type !== 'application/pdf') { reject(new Error('Pièce refusée : image (PNG, JPEG, GIF, WebP) ou PDF uniquement.')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ nom: file.name, type: file.type, data: String(reader.result) });
        reader.onerror = () => reject(new Error('Lecture de la pièce impossible.'));
        reader.readAsDataURL(file);
      });
    }
    
    function categoriesInUse(state) {
      return [...new Set([...CATEGORIES_DEPENSE, ...state.depenses.map((d) => d.categorie)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
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
      const writable = can('write');
      out.innerHTML = `
        <div class="stats-grid">
          <article class="stat-card accent-green"><div><span>Recettes encaissées</span><strong>${money(caisse.recettes)}</strong></div></article>
          <article class="stat-card accent-red"><div><span>Dépenses</span><strong>${money(caisse.depenses)}</strong></div></article>
          <article class="stat-card accent-purple"><div><span>Solde d’ouverture</span><strong>${money(caisse.ouverture)}</strong></div></article>
          <article class="stat-card ${caisse.solde < 0 ? 'accent-red' : 'accent-orange'}"><div><span>Solde disponible</span><strong>${money(caisse.solde)}</strong></div></article>
        </div>
        <p class="meta">Solde disponible = solde d’ouverture + recettes encaissées − dépenses enregistrées (paiements et dépenses annulés exclus).</p>
        <div class="table-wrap"><table class="data-list" data-list="depenses" data-list-title="Historique des dépenses" data-list-add="#depenses form[data-form=depense]">
          <thead><tr><th>N°</th><th>Date</th><th>Année</th><th>Catégorie</th><th>Description</th><th>Bénéficiaire / fournisseur</th><th>Demandé par</th><th>Compte</th><th>Montant</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>${list.map((d) => `<tr class="${d.annule ? 'cancelled' : ''}">
            <td>${escapeHtml(d.numero)}</td><td>${escapeHtml(formatDateFr(d.date))}</td><td>${escapeHtml(yearName(state, d.anneeId))}</td><td>${escapeHtml(d.categorie)}</td>
            <td>${escapeHtml(d.description)}${d.reference ? `<div class="meta">Réf. ${escapeHtml(d.reference)}</div>` : ''}${d.piece ? `<div class="meta"><a href="${escapeHtml(d.piece.data)}" download="${escapeHtml(d.piece.nom)}">📎 ${escapeHtml(d.piece.nom)}</a></div>` : ''}${d.observation ? `<div class="meta">${escapeHtml(d.observation)}</div>` : ''}${d.source?.type === 'recurrente' ? '<div class="meta">🔁 dépense récurrente</div>' : ''}${(d.historique || []).length ? `<div class="meta">${d.historique.length} correction(s) tracée(s)</div>` : ''}</td>
            <td>${escapeHtml(d.beneficiaire || '—')}</td><td>${escapeHtml(d.demandeur)}${d.utilisateur ? `<div class="meta">saisi par ${escapeHtml(d.utilisateur)}</div>` : ''}</td><td>${escapeHtml(compteLabel(state, d.compteId))}<div class="meta">${escapeHtml(MODES_REGLEMENT_DEPENSE[d.mode] || '')}</div></td><td class="num">${money(d.montant)}</td>
            <td><span class="badge ${d.annule ? 'danger' : 'ok'}">${d.annule ? 'Annulée' : 'Validée'}</span>${d.annule ? `<div class="meta">${escapeHtml(d.motif)}</div>` : ''}</td>
            <td>${d.annule ? '' : `<button class="action-btn" data-action="depense:receipt:${d.id}">Reçu</button>${depenseDePaie(d) ? `<span class="meta">Gérée par la paie</span>` : writable ? `<button class="action-btn" data-action="depense:edit:${d.id}">Corriger</button><button class="action-btn delete" data-action="depense:cancel:${d.id}">Annuler</button>` : ''}`}</td>
          </tr>`).join('') || '<tr><td colspan="11">Aucune dépense pour cette sélection.</td></tr>'}</tbody>
        </table></div>`;
    }
    
    // Dépenses récurrentes : modèles et échéances à enregistrer (jamais d'enregistrement automatique)
    function recurrentesPanel(state) {
      const devise = escapeHtml(state.config.devise || '');
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const modeles = state.depensesRecurrentes || [];
      const dues = occurrencesDues(state);
      const writable = can('write');
      return `<div class="panel" id="recurrentes-panel">
        <div class="panel-header"><h3>Dépenses récurrentes</h3><span class="meta">Loyer, abonnements, contrats… Chaque échéance est signalée ${JOURS_ALERTE_RECURRENTE} jours à l’avance et enregistrée sur confirmation</span></div>
        ${dues.length ? `<div class="table-wrap"><table><thead><tr><th>Échéance</th><th>Dépense</th><th>Catégorie</th><th>Montant prévu</th><th>Compte</th><th>Actions</th></tr></thead>
          <tbody>${dues.map((o) => `<tr><td>${escapeHtml(formatDateFr(o.date))}${o.enRetard ? ' <span class="badge danger">échue</span>' : ' <span class="badge warning">proche</span>'}</td>
            <td>${escapeHtml(o.recurrente.libelle)}<div class="meta">${escapeHtml(o.recurrente.beneficiaire || '')}</div></td><td>${escapeHtml(o.recurrente.categorie)}</td><td class="num">${money(o.recurrente.montant)}</td><td>${escapeHtml(compteLabel(state, o.recurrente.compteId))}</td>
            <td>${writable ? `<button class="action-btn" data-action="recurrente:enregistrer:${o.recurrente.id}:${o.periode}">Enregistrer</button><button class="action-btn" data-action="recurrente:ignorer:${o.recurrente.id}:${o.periode}">Ignorer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
          : `<p class="meta">${modeles.length ? 'Aucune échéance à enregistrer pour le moment.' : 'Aucune dépense récurrente configurée.'}</p>`}
        ${modeles.length ? `<details class="pay-history"><summary>Modèles (${modeles.length})</summary><ul>${modeles.map((r) => `<li class="${r.actif ? '' : 'cancelled'}"><span>${escapeHtml(r.libelle)} — ${escapeHtml(FREQUENCES[r.frequence])}, le ${r.jour} · depuis ${escapeHtml(formatDateFr(r.dateDebut))}${r.dateFin ? ` jusqu’au ${escapeHtml(formatDateFr(r.dateFin))}` : ''}</span><b>${money(r.montant)}</b>
          ${writable ? `<button type="button" class="link-btn" data-action="recurrente:toggle:${r.id}">${r.actif ? 'Suspendre' : 'Réactiver'}</button>` : ''}</li>`).join('')}</ul></details>` : ''}
        ${writable ? `<details><summary>Ajouter une dépense récurrente</summary>
          <form class="form-grid compact" data-form="recurrente" autocomplete="off">
            <label class="span-two">Libellé <input name="libelle" type="text" required maxlength="80" placeholder="Ex. Loyer du bâtiment B" /></label>
            <label>Catégorie <input name="categorie" list="dep-categories" required /></label>
            <label>Montant (${devise}) <input name="montant" type="number" min="1" step="1" required /></label>
            <label>Bénéficiaire / fournisseur <input name="beneficiaire" type="text" /></label>
            <label>Fréquence <select name="frequence">${Object.entries(FREQUENCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label>Jour d’échéance (1 à 28) <input name="jour" type="number" min="1" max="28" value="5" required /></label>
            <label>Première échéance <input name="dateDebut" type="date" value="${todayISO()}" required /></label>
            <label>Dernière échéance (facultatif) <input name="dateFin" type="date" /></label>
            <label>Mode de règlement <select name="mode">${Object.entries(MODES_DEPENSE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label>Compte payeur <select name="compteId">${comptesActifs(state).map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Créer la dépense récurrente</button></div>
          </form></details>` : ''}
      </div>`;
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
            <label>Bénéficiaire / fournisseur <input name="beneficiaire" type="text" placeholder="Fournisseur, personne…" /></label>
            <label>Demandé par <input name="demandeur" type="text" required /></label>
            <label>N° de référence (facture, bon…) <input name="reference" type="text" /></label>
            <label>Pièce justificative (300 Ko max.) <input name="piece" type="file" accept="image/*,application/pdf" /></label>
            <label>Mode de règlement <select name="mode" data-dep-mode>${Object.entries(MODES_DEPENSE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label>Compte payeur <select name="compteId">${comptesActifs(state).map((c) => `<option value="${c.id}" ${c.id === compteParDefaut(state, 'espece')?.id ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <label class="span-two">Observations <input name="observation" type="text" maxlength="200" /></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn" data-submit-label>Enregistrer la dépense</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
          </form>
        </div>` : ''}
        ${recurrentesPanel(state)}
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
    
    const EXPENSE_RECEIPT_CSS = `
      .dp-doc { font: 12px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
      .dp-doc .dp-sheet { width: 186mm; max-width: 100%; box-sizing: border-box; padding: 4mm 0; margin: 0 auto; background: #fff; }
      .dp-doc .dp-title { text-align: center; margin: 10px 0 6px; font-size: 16px; color: #fff; background: #7c3aed; padding: 5px; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .dp-doc .dp-refrow { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px; margin-top: 6px; }
      .dp-doc .dp-refrow b { color: #c2410c; font-size: 15px; }
      .dp-doc .dp-body p { display: flex; gap: 10px; align-items: baseline; margin: 0; padding: 7px 0; border-bottom: 1px dotted #9ca3af; font-size: 13px; }
      .dp-doc .dp-body p span { flex: none; width: 36mm; color: #6b7280; font-size: 11px; }
      .dp-doc .dp-amount b { font-size: 20px; color: #c2410c; }
      .dp-doc .dp-sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16mm; font-size: 11px; }
      .dp-doc .dp-sign div { border-top: 1px solid #111827; padding-top: 4px; text-align: center; height: 22mm; }
    `;
    
    const MODES_DEPENSE = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money' };
    
    // Contenu du reçu de dépense (aperçu à l'écran et impression)
    function expenseReceiptHtml(state, id) {
      const d = state.depenses.find((x) => x.id === Number(id));
      if (!d || d.annule) return null;
      ensureExpenseNumber(state, d);
      const c = state.config;
      const devise = escapeHtml(c.devise);
      return {
        depense: d,
        html: `<div class="dp-doc"><div class="dp-sheet">
        ${enteteHtml(c, { compact: true })}
        <div class="dp-refrow"><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}</span><span>Année scolaire : ${escapeHtml(yearName(state, d.anneeId))}</span></div>
        <h2 class="dp-title">${d.source?.type === 'avance' ? 'REÇU DE VERSEMENT D’AVANCE SUR SALAIRE' : d.source?.type === 'paie' ? 'REÇU DE PAIEMENT DE SALAIRE' : 'REÇU DE DÉPENSE'}</h2>
        <div class="dp-body">
          <p class="dp-amount"><span>Montant</span><b>${formatMoney(d.montant)} ${devise}</b></p>
          <p><span>En lettres</span><b>${escapeHtml(expenseAmountInWords(d.montant, c.devise))}</b></p>
          <p><span>Motif</span><b>${escapeHtml(d.categorie)} — ${escapeHtml(d.description)}</b></p>
          <p><span>Payeur</span><b>${escapeHtml(c.nom)}</b></p>
          <p><span>Bénéficiaire</span><b>${escapeHtml(d.beneficiaire || '—')}</b></p>
          <p><span>Mode de paiement</span><b>${escapeHtml(MODES_DEPENSE[d.mode] || 'Espèces')} — ${escapeHtml(compteLabel(state, d.compteId))}</b></p>
          <p><span>Demandé par</span><b>${escapeHtml(d.demandeur)}</b></p>
          ${d.reference ? `<p><span>Référence</span><b>${escapeHtml(d.reference)}</b></p>` : ''}
          <p><span>Caissier</span><b>${escapeHtml(d.caissier || '—')}</b></p>
        </div>
        <div class="dp-sign"><div>Le demandeur</div><div>Le bénéficiaire</div><div>Le caissier</div><div>Le directeur / visa</div></div>
      </div></div>`
      };
    }
    
    function printExpenseReceipt(state, id, fileName = '') {
      const doc = expenseReceiptHtml(state, id);
      if (!doc) return false;
      return printDocument({ title: `Dépense ${doc.depense.numero}`, html: doc.html, css: EXPENSE_RECEIPT_CSS, fileName: fileName || `Recu-${doc.depense.numero}` });
    }
    
    function setDepenseFilter(key, value) {
      depenseFilters[key] = key === 'yearId' ? Number(value || 0) : value;
    }
    
    
    Object.assign(exports, { depenseFilters, resetDepenseFilters, readPiece, categoriesInUse, renderDepenseOutput, renderDepenses, expenseAmountInWords, EXPENSE_RECEIPT_CSS, MODES_DEPENSE, expenseReceiptHtml, printExpenseReceipt, setDepenseFilter });
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
    
    // Autres entrées de caisse (ex. remboursement d'avance sur salaire en espèces)
    function entreesFiltrees(state, { yearId = 0, from = '', to = '' } = {}) {
      return (state.entreesCaisse || []).filter((e) => (!yearId || e.anneeId === yearId) && inRange(e.date, from, to));
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
        ouverture += somme(recettesFiltrees(state, { yearId, to: veille }), 'montant') + somme(entreesFiltrees(state, { yearId, to: veille }), 'montant') - somme(depensesFiltrees(state, { yearId, to: veille }), 'montant');
      }
      const recettes = somme(recettesFiltrees(state, { yearId, from, to }), 'montant');
      const depenses = somme(depensesFiltrees(state, { yearId, from, to }), 'montant');
      const autres = somme(entreesFiltrees(state, { yearId, from, to }), 'montant');
      return { ouverture, recettes, autres, depenses, solde: ouverture + recettes + autres - depenses };
    }
    
    Object.assign(exports, { paymentYear, recettesFiltrees, depensesFiltrees, entreesFiltrees, somme, soldeOuvertureBase, situationCaisse });
  };
  factories['./modules/comptes-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { soldesComptes, comptesActifs, compteLabel, TYPES_COMPTE } = require("./comptes.js");
    const { can } = require("./auth.js");
    // Page « Comptes et virements » : soldes de chaque caisse / compte et virements internes (dépôt en banque,
    // approvisionnement de caisse). Les comptes se créent dans Administration → Paramètres financiers.
    
    function comptesTableHtml(state, { actions = false } = {}) {
      const devise = escapeHtml(state.config.devise || '');
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const soldes = soldesComptes(state);
      return `<div class="table-wrap"><table class="data-list" data-list="comptes" data-list-title="Comptes financiers">
        <thead><tr><th>Compte</th><th>Type</th><th>N° / référence</th><th>Solde initial</th><th>Encaissements</th><th>Autres entrées</th><th>Dépenses</th><th>Virements reçus</th><th>Virements émis</th><th>Solde</th>${actions ? '<th>Actions</th>' : ''}</tr></thead>
        <tbody>${soldes.map((s) => `<tr class="${s.compte.actif === false ? 'cancelled' : ''}">
          <td><b>${escapeHtml(s.compte.libelle)}</b>${s.compte.principal ? ' <span class="badge info">principal</span>' : ''}${s.compte.actif === false ? ' <span class="badge neutral">désactivé</span>' : ''}</td>
          <td>${escapeHtml(TYPES_COMPTE[s.compte.type])}</td><td>${escapeHtml(s.compte.numero || '—')}</td>
          <td class="num">${money(s.soldeInitial)}</td><td class="num">${money(s.encaissements)}</td><td class="num">${money(s.autres)}</td><td class="num">${money(s.depenses)}</td>
          <td class="num">${money(s.entrants)}</td><td class="num">${money(s.sortants)}</td><td class="num"><b class="${s.solde < 0 ? 'neg' : ''}">${money(s.solde)}</b></td>
          ${actions ? `<td><button class="action-btn" data-action="compte:edit:${s.compte.id}">Modifier</button>${s.compte.principal ? '' : `<button class="action-btn" data-action="compte:toggle:${s.compte.id}">${s.compte.actif === false ? 'Réactiver' : 'Désactiver'}</button>`}</td>` : ''}
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="9">Total de tous les comptes</td><td class="num"><b>${money(soldes.reduce((t, s) => t + s.solde, 0))}</b></td>${actions ? '<td></td>' : ''}</tr></tfoot>
      </table></div>`;
    }
    
    function renderComptes(state) {
      const section = document.getElementById('comptes');
      if (!section) return;
      const devise = escapeHtml(state.config.devise || '');
      const actifs = comptesActifs(state);
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const virements = [...(state.virements || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Trésorerie</span><h2>Comptes financiers et virements internes</h2></div>
          ${can('admin') ? '<button type="button" class="secondary-btn small-btn" data-nav="config-finances">Gérer les comptes</button>' : ''}</div>
        <div class="panel">
          <div class="panel-header"><h3>Soldes des comptes</h3><span class="meta">Solde = solde initial + encaissements + autres entrées − dépenses + virements reçus − virements émis (opérations annulées exclues)</span></div>
          ${comptesTableHtml(state)}
        </div>
        ${can('write') ? `<div class="panel section-form">
          <div class="panel-header"><h3>Virement interne</h3><span class="meta">Dépôt de la caisse en banque, retrait pour approvisionner la caisse… Les recettes et dépenses ne changent pas.</span></div>
          ${actifs.length < 2 ? '<p class="meta">Créez au moins deux comptes (ex. Caisse principale et Banque) dans Administration → Paramètres financiers pour enregistrer un virement.</p>' : `
          <form class="form-grid compact" data-form="virement" autocomplete="off">
            <input type="hidden" name="token" value="${token}" />
            <label>Du compte <select name="deId" required>${actifs.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <label>Vers le compte <select name="versId" required>${actifs.map((c, i) => `<option value="${c.id}" ${i === 1 ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <label>Montant (${devise}) <input name="montant" type="number" min="1" step="1" required /></label>
            <label>Date <input name="date" type="date" value="${todayISO()}" max="${todayISO()}" required /></label>
            <label class="span-two">Motif <input name="motif" type="text" required placeholder="Ex. dépôt des recettes de la semaine" /></label>
            <label>Référence (bordereau…) <input name="reference" type="text" /></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer le virement</button></div>
          </form>`}
        </div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Historique des virements internes</h3><span class="meta">${virements.length} virement(s) · annulations conservées</span></div>
          <div class="table-wrap"><table class="data-list" data-list="virements" data-list-title="Virements internes">
            <thead><tr><th>N°</th><th>Date</th><th>De</th><th>Vers</th><th>Montant</th><th>Motif</th><th>Saisi par</th><th>État</th><th>Actions</th></tr></thead>
            <tbody>${virements.map((v) => `<tr class="${v.annule ? 'cancelled' : ''}"><td>${escapeHtml(v.numero)}</td><td>${escapeHtml(formatDateFr(v.date))}</td>
              <td>${escapeHtml(compteLabel(state, v.deId))}</td><td>${escapeHtml(compteLabel(state, v.versId))}</td><td class="num">${formatMoney(v.montant)} ${devise}</td>
              <td>${escapeHtml(v.motif)}${v.reference ? `<div class="meta">Réf. ${escapeHtml(v.reference)}</div>` : ''}</td><td>${escapeHtml(v.utilisateur || '—')}</td>
              <td><span class="badge ${v.annule ? 'danger' : 'ok'}">${v.annule ? 'Annulé' : 'Validé'}</span>${v.annule ? `<div class="meta">${escapeHtml(v.motifAnnulation || '')}</div>` : ''}</td>
              <td>${!v.annule && can('write') ? `<button class="action-btn delete" data-action="virement:cancel:${v.id}">Annuler</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9">Aucun virement interne.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    Object.assign(exports, { comptesTableHtml, renderComptes });
  };
  factories['./modules/caisse.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { soldeCompte, compteOf, compteLabel, comptePrincipal } = require("./comptes.js");
    // Caisse et trésorerie : journées de caisse (ouverture, comptage, fermeture), rapprochements bancaires et journal.
    //  - Solde théorique = solde d'ouverture théorique + entrées valides − sorties valides du jour (opérations annulées
    //    exclues). Il est toujours recalculé à partir des opérations, jamais saisi.
    //  - Montant compté : ce que l'agent a réellement en caisse. Écart = compté − théorique ; tout écart non nul
    //    doit être justifié. L'écart est consigné : il ne crée ni recette ni dépense.
    //  - Une journée fermée verrouille les opérations de ce compte jusqu'à sa date (modules/clotures.js).
    //  - Réouverture : uniquement la dernière journée fermée d'un compte, motif obligatoire, historique conservé.
    
    const num = (v) => Number(v || 0);
    const text = (v) => String(v ?? '').trim();
    const veille = (iso) => {
      const d = new Date(`${iso}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const dansPeriode = (date, from, to) => (!from || date >= from) && (!to || date <= to);
    
    // Mouvements d'un compte (opérations valides uniquement), triés par date puis heure de saisie
    function mouvementsCompte(state, compteId, { from = '', to = '' } = {}) {
      const id = Number(compteId);
      const principal = comptePrincipal(state)?.id || 0;
      const sur = (op) => (Number(op.compteId) || principal) === id;
      const eleve = (p) => {
        const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
        const e = i && state.eleves.find((x) => x.id === i.eleveId);
        return e ? `${e.prenom} ${e.nom}` : 'élève';
      };
      const list = [
        ...state.paiements.filter((p) => !p.annule && sur(p) && dansPeriode(p.datePaiement, from, to)).map((p) => ({
          date: p.datePaiement, ordre: Number(p.creeLe || 0), type: 'encaissement', piece: p.numeroRecu || `#${p.id}`, libelle: `Paiement — ${eleve(p)}`, entree: num(p.montant), sortie: 0, agent: p.utilisateur || p.caissier || '', mode: p.mode, source: { type: 'paiement', id: p.id }
        })),
        ...(state.entreesCaisse || []).filter((e) => sur(e) && dansPeriode(e.date, from, to)).map((e) => ({
          date: e.date, ordre: 0, type: 'entree', piece: `ENT-${e.id}`, libelle: e.libelle || 'Autre entrée', entree: num(e.montant), sortie: 0, agent: '', source: { type: 'entree', id: e.id }
        })),
        ...state.depenses.filter((d) => !d.annule && sur(d) && dansPeriode(d.date, from, to)).map((d) => ({
          date: d.date, ordre: Number(d.creeLe || 0), type: 'depense', piece: d.numero || `#${d.id}`, libelle: `${d.categorie} — ${d.description}`, entree: 0, sortie: num(d.montant), agent: d.utilisateur || '', mode: d.mode, source: { type: 'depense', id: d.id }
        })),
        ...(state.virements || []).filter((v) => !v.annule && (v.deId === id || v.versId === id) && dansPeriode(v.date, from, to)).map((v) => ({
          date: v.date, ordre: Number(v.creeLe || 0), type: 'virement', piece: v.numero, libelle: v.versId === id ? `Virement reçu de ${compteLabel(state, v.deId)} — ${v.motif}` : `Virement vers ${compteLabel(state, v.versId)} — ${v.motif}`,
          entree: v.versId === id ? num(v.montant) : 0, sortie: v.deId === id ? num(v.montant) : 0, agent: v.utilisateur || '', source: { type: 'virement', id: v.id }
        }))
      ];
      return list.sort((a, b) => a.date.localeCompare(b.date) || a.ordre - b.ordre);
    }
    
    const soldeOuvertureTheorique = (state, compteId, date) => soldeCompte(state, compteId, { to: veille(date) });
    
    function numero(state, date) {
      const year = String(date).slice(0, 4);
      if (!state.compteursCaisse || typeof state.compteursCaisse !== 'object') state.compteursCaisse = {};
      const next = num(state.compteursCaisse[year]) + 1;
      state.compteursCaisse[year] = next;
      return `CAI-${year}-${String(next).padStart(5, '0')}`;
    }
    
    const signe = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR')}`;
    
    const sessionOuverte = (state, compteId) => (state.sessionsCaisse || []).find((s) => s.compteId === Number(compteId) && s.statut !== 'fermee') || null;
    
    // Ouverture : fond de caisse compté comparé au solde théorique de la veille
    function ouvrirCaisse(state, { compteId, date = todayISO(), montantCompte, justification = '' } = {}) {
      exiger('caisse.operer');
      const compte = compteOf(state, compteId);
      if (!compte || compte.actif === false) throw new Error('Choisissez une caisse active.');
      if (compte.type !== 'caisse') throw new Error('Seul un compte de type « Caisse » s’ouvre et se ferme ; un compte bancaire se rapproche avec le relevé.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) throw new Error('Date d’ouverture invalide (pas de date future).');
      const encours = sessionOuverte(state, compte.id);
      if (encours) throw new Error(`La caisse « ${compte.libelle} » est déjà ouverte (journée du ${encours.date.split('-').reverse().join('/')}) : fermez-la d’abord.`);
      if ((state.sessionsCaisse || []).some((s) => s.compteId === compte.id && s.date >= date)) throw new Error('Une journée de caisse existe déjà à cette date ou après : on ne revient pas en arrière.');
      const compteReel = Number(montantCompte);
      if (!Number.isInteger(compteReel) || compteReel < 0) throw new Error('Le montant compté doit être un nombre entier positif ou nul.');
      const theorique = soldeOuvertureTheorique(state, compte.id, date);
      const ecart = compteReel - theorique;
      if (ecart && !text(justification)) throw new Error(`Écart d’ouverture de ${signe(ecart)} : la justification est obligatoire.`);
      return withTransaction(state, () => {
        const user = currentUser();
        const session = {
          id: nextId(state.sessionsCaisse), numero: numero(state, date), compteId: compte.id, date, statut: 'ouverte',
          ouverture: { theorique, compte: compteReel, ecart, justification: text(justification), par: user?.nom || '', parId: user?.id || 0, horodatage: new Date().toISOString() },
          fermeture: null, historique: []
        };
        state.sessionsCaisse.push(session);
        logOperation(state, 'caisse', `${session.numero} — ouverture de « ${compte.libelle} » : théorique ${theorique.toLocaleString('fr-FR')}, compté ${compteReel.toLocaleString('fr-FR')}${ecart ? ` (écart ${signe(ecart)} : ${text(justification)})` : ''}`, compteReel, { cible: session.numero, apres: session.ouverture });
        return session;
      });
    }
    
    // Situation d'une journée : ouverture théorique, entrées et sorties valides du jour, solde théorique de fin
    function situationJournee(state, session) {
      const mouvements = mouvementsCompte(state, session.compteId, { from: session.date, to: session.date });
      const entrees = mouvements.reduce((s, m) => s + m.entree, 0);
      const sorties = mouvements.reduce((s, m) => s + m.sortie, 0);
      const ouverture = soldeOuvertureTheorique(state, session.compteId, session.date);
      return { mouvements, ouverture, entrees, sorties, theorique: ouverture + entrees - sorties };
    }
    
    // Fermeture : comptage de fin de journée, écart justifié ; la journée et les précédentes deviennent verrouillées
    function fermerCaisse(state, sessionId, { montantCompte, justification = '', billetage = '' } = {}) {
      exiger('caisse.operer');
      const session = (state.sessionsCaisse || []).find((s) => s.id === Number(sessionId));
      if (!session || session.statut === 'fermee') throw new Error('Journée de caisse introuvable ou déjà fermée.');
      const compteReel = Number(montantCompte);
      if (!Number.isInteger(compteReel) || compteReel < 0) throw new Error('Le montant compté doit être un nombre entier positif ou nul.');
      const sit = situationJournee(state, session);
      const ecart = compteReel - sit.theorique;
      if (ecart && !text(justification)) throw new Error(`Écart de caisse de ${signe(ecart)} : la justification est obligatoire.`);
      return withTransaction(state, () => {
        const user = currentUser();
        session.fermeture = {
          entrees: sit.entrees, sorties: sit.sorties, ouvertureTheorique: sit.ouverture, theorique: sit.theorique, compte: compteReel, ecart, justification: text(justification),
          billetage: text(billetage).slice(0, 300), nbOperations: sit.mouvements.length, par: user?.nom || '', parId: user?.id || 0, horodatage: new Date().toISOString()
        };
        session.statut = 'fermee';
        logOperation(state, 'caisse', `${session.numero} — fermeture de « ${compteLabel(state, session.compteId)} » du ${session.date} : entrées ${sit.entrees.toLocaleString('fr-FR')}, sorties ${sit.sorties.toLocaleString('fr-FR')}, théorique ${sit.theorique.toLocaleString('fr-FR')}, compté ${compteReel.toLocaleString('fr-FR')}${ecart ? `, écart ${signe(ecart)} (${text(justification)})` : ', sans écart'}`, compteReel, { cible: session.numero, apres: session.fermeture });
        return session;
      });
    }
    
    // Réouverture (exception) : seulement la dernière journée fermée du compte ; la clôture précédente reste dans l'historique
    function rouvrirCaisse(state, sessionId, motif) {
      exiger('tresorerie.corriger');
      const session = (state.sessionsCaisse || []).find((s) => s.id === Number(sessionId));
      if (!session || session.statut !== 'fermee') throw new Error('Seule une journée fermée peut être rouverte.');
      if (!text(motif)) throw new Error('Le motif de la réouverture est obligatoire.');
      const derniere = (state.sessionsCaisse || []).filter((s) => s.compteId === session.compteId).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (derniere.id !== session.id) throw new Error('Seule la dernière journée de caisse de ce compte peut être rouverte.');
      if (sessionOuverte(state, session.compteId)) throw new Error('Une autre journée de cette caisse est ouverte : fermez-la d’abord.');
      return withTransaction(state, () => {
        const avant = session.fermeture;
        session.historique = [...(session.historique || []), { action: 'reouverture', motif: text(motif), par: currentUser()?.nom || '', horodatage: new Date().toISOString(), fermeture: avant }];
        session.statut = 'rouverte';
        session.fermeture = null;
        logOperation(state, 'caisse', `${session.numero} — journée du ${session.date} ROUVERTE — motif : ${text(motif)}`, avant?.compte || 0, { cible: session.numero, avant });
        return session;
      });
    }
    
    // Rapprochement bancaire : solde du relevé comparé au solde théorique à la même date (écart justifié)
    function rapprocher(state, { compteId, date = todayISO(), soldeReleve, justification = '', reference = '' } = {}) {
      exiger('caisse.operer');
      const compte = compteOf(state, compteId);
      if (!compte) throw new Error('Compte introuvable.');
      if (compte.type === 'caisse') throw new Error('Une caisse se contrôle par sa fermeture (comptage), pas par un relevé.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) throw new Error('Date du relevé invalide.');
      const releve = Number(soldeReleve);
      if (!Number.isInteger(releve)) throw new Error('Le solde du relevé doit être un nombre entier.');
      const theorique = soldeCompte(state, compte.id, { to: date });
      const ecart = releve - theorique;
      if (ecart && !text(justification)) throw new Error(`Écart de ${signe(ecart)} avec le relevé : la justification est obligatoire (frais bancaires, chèque non encore crédité…).`);
      return withTransaction(state, () => {
        const user = currentUser();
        const r = { id: nextId(state.rapprochements), compteId: compte.id, date, soldeReleve: releve, theorique, ecart, justification: text(justification), reference: text(reference), par: user?.nom || '', horodatage: new Date().toISOString() };
        state.rapprochements.push(r);
        logOperation(state, 'caisse', `Rapprochement de « ${compte.libelle} » au ${date} : relevé ${releve.toLocaleString('fr-FR')}, théorique ${theorique.toLocaleString('fr-FR')}${ecart ? `, écart ${signe(ecart)} (${text(justification)})` : ', concordant'}`, releve, { cible: compte.libelle, apres: r });
        return r;
      });
    }
    
    // Journal quotidien : mouvements de tous les comptes pour une date, avec soldes d'ouverture et de clôture théoriques
    function journalDuJour(state, date = todayISO()) {
      return (state.comptes || []).map((c) => {
        const mouvements = mouvementsCompte(state, c.id, { from: date, to: date });
        const ouverture = soldeOuvertureTheorique(state, c.id, date);
        const entrees = mouvements.reduce((s, m) => s + m.entree, 0);
        const sorties = mouvements.reduce((s, m) => s + m.sortie, 0);
        const session = (state.sessionsCaisse || []).find((s) => s.compteId === c.id && s.date === date) || null;
        return { compte: c, mouvements, ouverture, entrees, sorties, cloture: ouverture + entrees - sorties, session };
      });
    }
    
    // Historique des journées de caisse, filtrable par agent (ouverture ou fermeture) et par période
    function historiqueSessions(state, { agent = '', from = '', to = '', compteId = 0 } = {}) {
      return [...(state.sessionsCaisse || [])]
        .filter((s) => (!compteId || s.compteId === Number(compteId)) && dansPeriode(s.date, from, to)
          && (!agent || s.ouverture?.par === agent || s.fermeture?.par === agent))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    }
    
    Object.assign(exports, { mouvementsCompte, soldeOuvertureTheorique, sessionOuverte, ouvrirCaisse, situationJournee, fermerCaisse, rouvrirCaisse, rapprocher, journalDuJour, historiqueSessions });
  };
  factories['./modules/caisse-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { comptesActifs, compteLabel, TYPES_COMPTE } = require("./comptes.js");
    const { situationJournee, soldeOuvertureTheorique, journalDuJour, historiqueSessions, sessionOuverte } = require("./caisse.js");
    const { enteteHtml } = require("./entete.js");
    const { printDocument } = require("./print.js");
    const { can } = require("./auth.js");
    // Page « Caisse » : journées de caisse (ouverture, comptage, fermeture), journal quotidien, historique par agent,
    // rapprochements bancaires. Les montants théoriques sont toujours calculés à partir des opérations valides.
    
    const caisseView = { jour: todayISO(), agent: '', compteId: 0 };
    
    const STATUTS = { ouverte: ['Ouverte', 'ok'], fermee: ['Fermée', 'neutral'], rouverte: ['Rouverte', 'warning'] };
    const ecartHtml = (v, money) => (v ? `<span class="${v < 0 ? 'ecart-neg' : 'ecart-pos'}">${v > 0 ? '+' : ''}${money(v)}</span>` : '<span class="badge ok">aucun écart</span>');
    
    function sessionCard(state, s, money) {
      const sit = situationJournee(state, s);
      const peutOperer = can('caisse.operer');
      return `<article class="panel session-card ${s.statut === 'fermee' ? 'fermee' : ''}">
        <div class="panel-header"><h3>${escapeHtml(compteLabel(state, s.compteId))} — journée du ${escapeHtml(formatDateFr(s.date))}</h3><span class="badge ${STATUTS[s.statut][1]}">${STATUTS[s.statut][0]}</span></div>
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Ouverture théorique</span><strong>${money(sit.ouverture)}</strong><small class="meta">compté : ${money(s.ouverture.compte)} · ${s.ouverture.ecart ? `écart ${s.ouverture.ecart > 0 ? '+' : ''}${formatMoney(s.ouverture.ecart)}` : 'sans écart'}</small></div></article>
          <article class="stat-card accent-green"><div><span>Entrées du jour</span><strong>${money(sit.entrees)}</strong></div></article>
          <article class="stat-card accent-red"><div><span>Sorties du jour</span><strong>${money(sit.sorties)}</strong></div></article>
          <article class="stat-card accent-orange"><div><span>Solde théorique</span><strong>${money(sit.theorique)}</strong><small class="meta">${sit.mouvements.length} opération(s) valide(s)</small></div></article>
        </div>
        <p class="meta">Ouverte par ${escapeHtml(s.ouverture.par || '—')} le ${escapeHtml(new Date(s.ouverture.horodatage).toLocaleString('fr-FR'))}${s.ouverture.justification ? ` — ${escapeHtml(s.ouverture.justification)}` : ''}${(s.historique || []).length ? ` · ${s.historique.length} réouverture(s) tracée(s)` : ''}</p>
        ${peutOperer ? `<form class="form-grid compact" data-form="caisse-fermeture" autocomplete="off">
          <input type="hidden" name="sessionId" value="${s.id}" />
          <label>Montant réellement compté <input name="montantCompte" type="number" min="0" step="1" required data-caisse-compte data-theorique="${sit.theorique}" /></label>
          <label class="span-two">Billetage / détail du comptage (facultatif) <input name="billetage" type="text" maxlength="300" placeholder="Ex. 12 × 10 000 + 5 × 5 000" /></label>
          <p class="meta span-all" data-caisse-ecart aria-live="polite">Saisissez le montant compté : l’écart avec le solde théorique s’affiche.</p>
          <label class="span-all">Justification de l’écart (obligatoire si l’écart n’est pas nul) <input name="justification" type="text" maxlength="300" /></label>
          <div class="form-actions span-all"><button type="submit" class="primary-btn">Fermer la caisse</button></div>
        </form>` : '<p class="meta">Votre rôle ne permet pas de fermer la caisse.</p>'}
      </article>`;
    }
    
    function renderCaisse(state) {
      const section = document.getElementById('caisse');
      if (!section) return;
      const devise = escapeHtml(state.config.devise || '');
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const caisses = comptesActifs(state).filter((c) => c.type === 'caisse');
      const autres = comptesActifs(state).filter((c) => c.type !== 'caisse');
      const ouvertes = caisses.map((c) => sessionOuverte(state, c.id)).filter(Boolean);
      const fermees = caisses.filter((c) => !sessionOuverte(state, c.id));
      const v = caisseView;
      const journal = journalDuJour(state, v.jour);
      const historique = historiqueSessions(state, { agent: v.agent, compteId: v.compteId });
      const agents = [...new Set((state.sessionsCaisse || []).flatMap((s) => [s.ouverture?.par, s.fermeture?.par]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      const dernieres = new Map();
      (state.sessionsCaisse || []).forEach((s) => { const d = dernieres.get(s.compteId); if (!d || s.date > d.date) dernieres.set(s.compteId, s); });
      const today = todayISO();
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Caisse et trésorerie</span><h2>Caisse : ouverture, comptage et clôture</h2></div>
          ${can('export') ? '<button type="button" class="secondary-btn small-btn" data-action="caisse:print-journal">Imprimer le journal du jour</button>' : ''}</div>
        ${!caisses.length ? '<div class="panel empty-state"><span class="empty-icon" aria-hidden="true">🪙</span><h3>Aucune caisse active</h3><p class="meta">Créez un compte de type « Caisse » dans Paramètres › Paramètres financiers.</p></div>' : ''}
        ${ouvertes.map((s) => sessionCard(state, s, money)).join('')}
        ${fermees.length && can('caisse.operer') ? `<div class="panel section-form">
          <div class="panel-header"><h3>Ouvrir une caisse</h3><span class="meta">Comptez le fond de caisse : il est comparé au solde théorique de la veille</span></div>
          <form class="form-grid compact" data-form="caisse-ouverture" autocomplete="off">
            <label>Caisse <select name="compteId">${fermees.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)} — théorique ${formatMoney(soldeOuvertureTheorique(state, c.id, today))}</option>`).join('')}</select></label>
            <label>Date <input name="date" type="date" value="${today}" max="${today}" required /></label>
            <label>Fond de caisse compté <input name="montantCompte" type="number" min="0" step="1" required /></label>
            <label class="span-all">Justification (obligatoire si le compté diffère du théorique) <input name="justification" type="text" maxlength="300" /></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn">Ouvrir la caisse</button></div>
          </form>
        </div>` : ''}
        ${can('admin') ? `<div class="panel"><form class="form-grid compact" data-form="caisse-option"><label class="check-row span-all"><input type="checkbox" name="caisseObligatoire" ${state.config.caisseObligatoire ? 'checked' : ''} /> Exiger une caisse ouverte pour toute opération sur une caisse (encaissement, dépense, virement)</label>
          <div class="form-actions span-all"><button type="submit" class="secondary-btn small-btn">Enregistrer l’option</button></div></form></div>` : ''}
    
        <div class="panel">
          <div class="panel-header"><h3>Journal quotidien des opérations</h3>
            <label class="inline-filter">Jour <input type="date" data-cv="jour" value="${escapeHtml(v.jour)}" max="${today}" /></label></div>
          ${journal.map((j) => `<div class="r-group">
            <h4>${escapeHtml(j.compte.libelle)} <span class="meta">(${escapeHtml(TYPES_COMPTE[j.compte.type])})</span> ${j.session ? `<span class="badge ${STATUTS[j.session.statut][1]}">${j.session.numero} · ${STATUTS[j.session.statut][0]}</span>` : ''}</h4>
            <div class="table-wrap"><table><thead><tr><th>Pièce</th><th>Opération</th><th>Agent</th><th>Entrée</th><th>Sortie</th></tr></thead>
              <tbody><tr><td></td><td><b>Solde d’ouverture théorique</b></td><td></td><td></td><td class="num">${money(j.ouverture)}</td></tr>
              ${j.mouvements.map((m) => `<tr><td>${escapeHtml(m.piece)}</td><td>${escapeHtml(m.libelle)}</td><td>${escapeHtml(m.agent || '—')}</td><td class="num">${m.entree ? money(m.entree) : ''}</td><td class="num">${m.sortie ? money(m.sortie) : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="meta">Aucune opération ce jour.</td></tr>'}</tbody>
              <tfoot><tr><td></td><td>Solde de clôture théorique</td><td></td><td class="num">${money(j.entrees)}</td><td class="num">${money(j.sorties)} → <b>${money(j.cloture)}</b></td></tr></tfoot></table></div>
          </div>`).join('')}
        </div>
    
        <div class="panel">
          <div class="panel-header"><h3>Historique des journées de caisse</h3>
            <div class="advanced-search compact-filters">
              <label>Agent <select data-cv="agent"><option value="">Tous</option>${agents.map((a) => `<option value="${escapeHtml(a)}" ${a === v.agent ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
              <label>Caisse <select data-cv="compteId"><option value="0">Toutes</option>${caisses.map((c) => `<option value="${c.id}" ${c.id === Number(v.compteId) ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            </div></div>
          <div class="table-wrap"><table class="data-list" data-list="sessions-caisse" data-list-title="Journées de caisse">
            <thead><tr><th>N°</th><th>Date</th><th>Caisse</th><th>Ouverture (par)</th><th>Entrées</th><th>Sorties</th><th>Théorique</th><th>Compté</th><th>Écart</th><th>Fermeture (par)</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${historique.map((s) => `<tr>
              <td>${escapeHtml(s.numero)}</td><td>${escapeHtml(formatDateFr(s.date))}</td><td>${escapeHtml(compteLabel(state, s.compteId))}</td>
              <td>${money(s.ouverture.compte)}<div class="meta">${escapeHtml(s.ouverture.par || '')}</div></td>
              <td class="num">${s.fermeture ? money(s.fermeture.entrees) : '—'}</td><td class="num">${s.fermeture ? money(s.fermeture.sorties) : '—'}</td>
              <td class="num">${s.fermeture ? money(s.fermeture.theorique) : '—'}</td><td class="num">${s.fermeture ? money(s.fermeture.compte) : '—'}</td>
              <td>${s.fermeture ? ecartHtml(s.fermeture.ecart, money) : '—'}${s.fermeture?.justification ? `<div class="meta">${escapeHtml(s.fermeture.justification)}</div>` : ''}</td>
              <td>${escapeHtml(s.fermeture?.par || '—')}</td>
              <td><span class="badge ${STATUTS[s.statut][1]}">${STATUTS[s.statut][0]}</span>${(s.historique || []).map((h) => `<div class="meta">rouverte : ${escapeHtml(h.motif)} (${escapeHtml(h.par)})</div>`).join('')}</td>
              <td>${s.fermeture && can('export') ? `<button class="action-btn" data-action="caisse:pv:${s.id}">PV</button>` : ''}${s.statut === 'fermee' && dernieres.get(s.compteId)?.id === s.id && can('write') ? `<button class="action-btn delete" data-action="caisse:rouvrir:${s.id}">Rouvrir</button>` : ''}</td>
            </tr>`).join('') || '<tr><td colspan="12">Aucune journée de caisse enregistrée.</td></tr>'}</tbody>
          </table></div>
        </div>
    
        <div class="panel">
          <div class="panel-header"><h3>Rapprochement bancaire</h3><span class="meta">Solde du relevé (banque, Mobile Money) comparé au solde théorique à la même date</span></div>
          ${autres.length && can('caisse.operer') ? `<form class="form-grid compact" data-form="rapprochement" autocomplete="off">
            <label>Compte <select name="compteId">${autres.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
            <label>Date du relevé <input name="date" type="date" value="${today}" max="${today}" required /></label>
            <label>Solde du relevé <input name="soldeReleve" type="number" step="1" required /></label>
            <label>Référence du relevé <input name="reference" type="text" maxlength="60" /></label>
            <label class="span-all">Justification de l’écart (frais bancaires, chèque non crédité…) <input name="justification" type="text" maxlength="300" /></label>
            <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Enregistrer le rapprochement</button></div>
          </form>` : `<p class="meta">${autres.length ? 'Votre rôle ne permet pas d’enregistrer un rapprochement.' : 'Aucun compte bancaire ou Mobile Money actif.'}</p>`}
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Relevé</th><th>Théorique</th><th>Écart</th><th>Justification</th><th>Par</th></tr></thead>
            <tbody>${[...(state.rapprochements || [])].sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<tr><td>${escapeHtml(formatDateFr(r.date))}</td><td>${escapeHtml(compteLabel(state, r.compteId))}${r.reference ? `<div class="meta">${escapeHtml(r.reference)}</div>` : ''}</td><td class="num">${money(r.soldeReleve)}</td><td class="num">${money(r.theorique)}</td><td>${ecartHtml(r.ecart, money)}</td><td>${escapeHtml(r.justification || '')}</td><td>${escapeHtml(r.par || '')}</td></tr>`).join('') || '<tr><td colspan="7">Aucun rapprochement.</td></tr>'}</tbody></table></div>
        </div>`;
    }
    
    // Écart affiché en direct pendant le comptage de fermeture
    function majEcart(input, devise) {
      const box = input.closest('form')?.querySelector('[data-caisse-ecart]');
      if (!box) return;
      if (input.value === '') { box.textContent = 'Saisissez le montant compté : l’écart avec le solde théorique s’affiche.'; return; }
      const ecart = Math.floor(Number(input.value || 0)) - Number(input.dataset.theorique || 0);
      box.textContent = ecart ? `Écart : ${ecart > 0 ? '+' : ''}${formatMoney(ecart)} ${devise} — la justification est obligatoire.` : 'Aucun écart : la caisse est juste.';
    }
    
    // Procès-verbal de clôture (une page)
    function printPvCloture(state, sessionId) {
      const s = (state.sessionsCaisse || []).find((x) => x.id === Number(sessionId));
      if (!s || !s.fermeture) return false;
      const devise = escapeHtml(state.config.devise || '');
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const f = s.fermeture;
      const html = `${enteteHtml(state.config, { compact: true })}
        <div class="r-title"><h2>Procès-verbal de clôture de caisse — ${escapeHtml(s.numero)}</h2><span>${escapeHtml(compteLabel(state, s.compteId))} · journée du ${escapeHtml(formatDateFr(s.date))}</span></div>
        <table><tbody>
          <tr><td>Fond d’ouverture compté (${escapeHtml(s.ouverture.par || '')})</td><td class="num">${money(s.ouverture.compte)}</td></tr>
          <tr><td>Solde d’ouverture théorique</td><td class="num">${money(f.ouvertureTheorique)}</td></tr>
          <tr><td>Entrées de la journée</td><td class="num">${money(f.entrees)}</td></tr>
          <tr><td>Sorties de la journée</td><td class="num">${money(f.sorties)}</td></tr>
          <tr><td><b>Solde théorique de clôture</b></td><td class="num"><b>${money(f.theorique)}</b></td></tr>
          <tr><td><b>Montant compté</b> ${f.billetage ? `(${escapeHtml(f.billetage)})` : ''}</td><td class="num"><b>${money(f.compte)}</b></td></tr>
          <tr><td><b>Écart</b></td><td class="num"><b>${f.ecart > 0 ? '+' : ''}${money(f.ecart)}</b></td></tr>
          ${f.justification ? `<tr><td>Justification</td><td>${escapeHtml(f.justification)}</td></tr>` : ''}
          <tr><td>Nombre d’opérations</td><td class="num">${f.nbOperations}</td></tr>
          <tr><td>Clôturée par</td><td>${escapeHtml(f.par || '')} — ${escapeHtml(new Date(f.horodatage).toLocaleString('fr-FR'))}</td></tr>
        </tbody></table>
        <div class="rc-sign" style="display:flex;justify-content:space-between;margin-top:20mm"><div>Le caissier</div><div>Le comptable / visa</div></div>`;
      return printDocument({ title: `PV de clôture ${s.numero}`, html, fileName: `PV-cloture-${s.numero}` });
    }
    
    function printJournalDuJour(state, date) {
      const devise = escapeHtml(state.config.devise || '');
      const money = (v) => `${formatMoney(v)} ${devise}`;
      const html = `${enteteHtml(state.config, { compact: true })}
        <div class="r-title"><h2>Journal de caisse du ${escapeHtml(formatDateFr(date))}</h2><span>Opérations valides</span></div>
        ${journalDuJour(state, date).map((j) => `<div class="r-group"><h3>${escapeHtml(j.compte.libelle)}</h3><table>
          <thead><tr><th>Pièce</th><th>Opération</th><th>Agent</th><th class="num">Entrée</th><th class="num">Sortie</th></tr></thead>
          <tbody><tr><td></td><td>Solde d’ouverture théorique</td><td></td><td></td><td class="num">${money(j.ouverture)}</td></tr>${j.mouvements.map((m) => `<tr><td>${escapeHtml(m.piece)}</td><td>${escapeHtml(m.libelle)}</td><td>${escapeHtml(m.agent || '')}</td><td class="num">${m.entree ? money(m.entree) : ''}</td><td class="num">${m.sortie ? money(m.sortie) : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td></td><td>Solde de clôture théorique : ${money(j.cloture)}</td><td></td><td class="num">${money(j.entrees)}</td><td class="num">${money(j.sorties)}</td></tr></tfoot></table></div>`).join('')}`;
      return printDocument({ title: `Journal de caisse ${date}`, html, fileName: `Journal-caisse-${date}` });
    }
    
    Object.assign(exports, { caisseView, renderCaisse, majEcart, printPvCloture, printJournalDuJour });
  };
})(window.IBK_APP.factories);

