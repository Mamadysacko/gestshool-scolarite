// GEST SCHOOL SCOLARITÉ · 08-paie-personnel.js
// Paie du personnel : employés, affectations, paie mensuelle, avances et bulletins
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/personnel.js, ./modules/paie.js, ./modules/avances.js, ./modules/bulletin-paie.js, ./modules/paie-views.js, ./modules/paie-actions.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/personnel.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { auProgramme, ensureProgrammes } = require("./programme.js");
    // ── Référentiels de la paie : types d'employés, matières, personnel, affectations, heures du mois ──
    // Rémunération : salaire mensuel + primes, ou — pour les enseignants du collège et du lycée — paiement à l'heure :
    // le tarif horaire est fixé une fois dans la fiche, les heures dispensées sont saisies chaque mois (une seule
    // valeur par enseignant, affectation et mois, mise à jour avec historique). Les retenues fixes ne sont plus utilisées.
    // Toutes les références (type, année, classe, matière, employé) sont vérifiées à l'écriture (clés étrangères).
    
    const TYPES_EMPLOYE_DEFAUT = [
      { libelle: 'Directeur' }, { libelle: 'Comptable' }, { libelle: 'Enseignant', enseignant: true }, { libelle: 'Surveillant' },
      { libelle: 'Gardien' }, { libelle: 'Secrétaire' }, { libelle: 'Agent d’entretien' }
    ];
    const MATIERES_DEFAUT = ['Français', 'Mathématiques', 'Anglais', 'Physique-Chimie', 'Sciences de la vie et de la Terre', 'Histoire-Géographie', 'Éducation civique', 'Philosophie', 'Éducation physique', 'Informatique'];
    const CONTRATS = { cdi: 'CDI', cdd: 'CDD', vacataire: 'Vacataire', stage: 'Stage', autre: 'Autre' };
    const STATUTS_EMPLOYE = { actif: 'Actif', suspendu: 'Suspendu', sorti: 'Sorti' };
    const MODES_REMUNERATION = { fixe: 'Salaire mensuel', horaire: 'Payé à l’heure' };
    
    const text = (v) => String(v ?? '').trim();
    const money = (v) => Math.max(Math.floor(Number(v || 0)), 0);
    const isDate = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
    
    // Initialise les collections de la paie (anciennes données comprises) ; idempotent
    function ensurePaieState(state) {
      ['typesEmploye', 'matieres', 'personnel', 'affectations', 'heuresRealisees', 'avances', 'paies', 'entreesCaisse'].forEach((key) => {
        if (!Array.isArray(state[key])) state[key] = [];
      });
      if (!state.compteursPaie || typeof state.compteursPaie !== 'object') state.compteursPaie = {};
      if (!state.typesEmploye.length) TYPES_EMPLOYE_DEFAUT.forEach((t, i) => state.typesEmploye.push({ id: i + 1, libelle: t.libelle, enseignant: Boolean(t.enseignant), actif: true }));
      if (!state.matieres.length) MATIERES_DEFAUT.forEach((nom, i) => state.matieres.push({ id: i + 1, nom, actif: true }));
      ensureProgrammes(state);
      migrerRemunerations(state);
      return state;
    }
    
    // Mise à niveau des rémunérations (idempotente, version 3) :
    //  - une ancienne retenue fixe n'est plus appliquée (trace dans l'historique) ;
    //  - un enseignant payé à l'heure garde son tarif horaire ; s'il avait été converti en « salaire mensuel à
    //    définir » par la version précédente, son paiement à l'heure est rétabli avec le tarif conservé dans l'historique.
    function migrerRemunerations(state) {
      state.personnel.forEach((e) => {
        const r = e.remuneration || {};
        if (r.version === 3) return;
        if (!Array.isArray(e.historique)) e.historique = [];
        const notes = [];
        let mode = r.mode === 'horaire' ? 'horaire' : 'fixe';
        let taux = Math.max(Math.floor(Number(r.tauxHoraire || 0)), 0);
        if (r.version === 2 && mode === 'fixe' && !Number(r.salaireBase)) {
          const trace = e.historique.map((h) => String(h.avant || '')).find((t) => /salaire horaire \((\d+) \/ h\)/.test(t));
          const m = trace && /salaire horaire \((\d+) \/ h\)/.exec(trace);
          if (m && Number(m[1]) > 0) { mode = 'horaire'; taux = Number(m[1]); notes.push(`paiement à l’heure rétabli (${taux} / h)`); }
        }
        if (Number(r.retenueFixe || 0) > 0) notes.push(`retenue fixe « ${r.libelleRetenue || 'Retenues'} » de ${Number(r.retenueFixe)} supprimée`);
        e.remuneration = {
          mode, salaireBase: mode === 'fixe' ? Math.max(Math.floor(Number(r.salaireBase || 0)), 0) : 0, tauxHoraire: mode === 'horaire' ? taux : 0,
          primeFixe: Math.max(Math.floor(Number(r.primeFixe || 0)), 0), libellePrime: r.libellePrime || 'Primes et indemnités', version: 3
        };
        if (notes.length) e.historique.push({ horodatage: new Date().toISOString(), par: 'Mise à jour de l’application', type: 'remuneration', avant: notes.join(' ; '), apres: SUIVIS.remuneration(e) });
      });
    }
    
    // ── Types d'employés (personnalisables) ──
    function saveTypeEmploye(state, payload = {}) {
      const libelle = text(payload.libelle);
      if (!libelle) throw new Error('Le libellé du type d’employé est obligatoire.');
      const id = Number(payload.id || 0);
      if (state.typesEmploye.some((t) => t.id !== id && t.libelle.toLocaleLowerCase('fr') === libelle.toLocaleLowerCase('fr'))) throw new Error('Ce type d’employé existe déjà.');
      if (id) {
        const item = state.typesEmploye.find((t) => t.id === id);
        if (!item) throw new Error('Type d’employé introuvable.');
        Object.assign(item, { libelle, enseignant: Boolean(payload.enseignant), actif: payload.actif !== false });
        return item;
      }
      const item = { id: nextId(state.typesEmploye), libelle, enseignant: Boolean(payload.enseignant), actif: true };
      state.typesEmploye.push(item);
      return item;
    }
    
    function toggleTypeEmploye(state, id) {
      const item = state.typesEmploye.find((t) => t.id === Number(id));
      if (!item) throw new Error('Type d’employé introuvable.');
      item.actif = !item.actif;
      return item;
    }
    
    // ── Matières (pour les affectations des enseignants) ──
    function saveMatiere(state, payload = {}) {
      const nom = text(payload.nom);
      if (!nom) throw new Error('Le nom de la matière est obligatoire.');
      const id = Number(payload.id || 0);
      if (state.matieres.some((m) => m.id !== id && m.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) throw new Error('Cette matière existe déjà.');
      if (id) {
        const item = state.matieres.find((m) => m.id === id);
        if (!item) throw new Error('Matière introuvable.');
        item.nom = nom;
        return item;
      }
      const item = { id: nextId(state.matieres), nom, actif: true };
      state.matieres.push(item);
      return item;
    }
    
    function toggleMatiere(state, id) {
      const item = state.matieres.find((m) => m.id === Number(id));
      if (!item) throw new Error('Matière introuvable.');
      item.actif = !item.actif;
      return item;
    }
    
    // ── Personnel ──
    // Matricule automatique unique : EMP-AAAA-NNNN (année d'embauche)
    function generateMatriculeEmploye(state, dateEmbauche) {
      const year = String(dateEmbauche || todayISO()).slice(0, 4);
      const prefix = `EMP-${year}-`;
      const max = state.personnel.map((e) => e.matricule).filter((m) => m?.startsWith(prefix)).reduce((m, v) => Math.max(m, Number(v.slice(prefix.length)) || 0), 0);
      return `${prefix}${String(max + 1).padStart(4, '0')}`;
    }
    
    function typeOf(state, employe) {
      return state.typesEmploye.find((t) => t.id === employe?.typeEmployeId) || null;
    }
    
    function isEnseignant(state, employe) {
      return Boolean(typeOf(state, employe)?.enseignant);
    }
    
    function nomEmploye(employe) {
      return employe ? `${employe.prenom} ${employe.nom}` : '—';
    }
    
    function normalizeEmploye(state, payload, existing = null) {
      const nom = text(payload.nom);
      const prenom = text(payload.prenom);
      if (!nom || !prenom) throw new Error('Le nom et le prénom sont obligatoires.');
      const typeEmployeId = Number(payload.typeEmployeId || 0);
      if (!state.typesEmploye.some((t) => t.id === typeEmployeId)) throw new Error('Choisissez un type d’employé valide.');
      ['dateNaissance', 'dateEmbauche', 'contratDebut', 'contratFin'].forEach((k) => { if (!isDate(payload[k])) throw new Error('Date invalide.'); });
      if (payload.contratFin && payload.contratDebut && payload.contratFin < payload.contratDebut) throw new Error('La fin du contrat doit suivre son début.');
      const matricule = text(payload.matricule) || existing?.matricule || generateMatriculeEmploye(state, payload.dateEmbauche);
      if (state.personnel.some((e) => e.id !== existing?.id && e.matricule === matricule)) throw new Error('Ce matricule est déjà attribué.');
      return {
        matricule, nom, prenom, sexe: payload.sexe === 'F' ? 'F' : 'M', dateNaissance: payload.dateNaissance || '',
        telephone: text(payload.telephone), email: text(payload.email), adresse: text(payload.adresse),
        typeEmployeId, fonction: text(payload.fonction) || state.typesEmploye.find((t) => t.id === typeEmployeId).libelle,
        contrat: { type: CONTRATS[payload.contratType] ? payload.contratType : 'cdi', debut: payload.contratDebut || payload.dateEmbauche || '', fin: payload.contratFin || '' },
        dateEmbauche: payload.dateEmbauche || '', statut: STATUTS_EMPLOYE[payload.statut] ? payload.statut : 'actif'
      };
    }
    
    // ── Rémunération : définie à part de la fiche (étape « Rémunérations »), par un administrateur ──
    // Salaire mensuel, ou — enseignant uniquement — paiement à l'heure (tarif horaire × heures saisies chaque mois).
    // Chaque changement est historisé ; les paies déjà validées gardent leurs montants.
    const REMUNERATION_VIDE = { mode: 'fixe', salaireBase: 0, tauxHoraire: 0, primeFixe: 0, libellePrime: 'Primes et indemnités', version: 3 };
    
    function remunerationDefinie(employe) {
      const r = employe?.remuneration || {};
      return r.mode === 'horaire' ? Number(r.tauxHoraire) > 0 : Number(r.salaireBase) > 0;
    }
    
    function normalizeRemuneration(state, employe, payload) {
      const mode = payload.mode === 'horaire' ? 'horaire' : 'fixe';
      const salaireBase = mode === 'fixe' ? money(payload.salaireBase) : 0;
      const tauxHoraire = mode === 'horaire' ? money(payload.tauxHoraire) : 0;
      if (mode === 'horaire' && !isEnseignant(state, employe)) throw new Error('Le paiement à l’heure est réservé aux enseignants (collège et lycée).');
      if (mode === 'horaire' && tauxHoraire <= 0) throw new Error('Le tarif horaire est obligatoire pour un enseignant payé à l’heure.');
      if (mode === 'fixe' && salaireBase <= 0) throw new Error('Le salaire mensuel est obligatoire.');
      return { mode, salaireBase, tauxHoraire, primeFixe: money(payload.primeFixe), libellePrime: text(payload.libellePrime) || 'Primes et indemnités', version: 3 };
    }
    
    function definirRemuneration(state, id, payload = {}) {
      const employe = state.personnel.find((e) => e.id === Number(id));
      if (!employe) throw new Error('Employé introuvable.');
      return withTransaction(state, () => {
        const premiere = !remunerationDefinie(employe);
        const remuneration = normalizeRemuneration(state, employe, payload);
        const avant = premiere ? 'non définie' : SUIVIS.remuneration(employe);
        const apres = SUIVIS.remuneration({ ...employe, remuneration });
        if (!premiere && avant === apres) return employe;
        employe.remuneration = remuneration;
        if (!Array.isArray(employe.historique)) employe.historique = [];
        employe.historique.push({ horodatage: new Date().toISOString(), par: currentUser()?.nom || '', type: 'remuneration', avant, apres, motif: text(payload.motif) });
        logOperation(state, 'personnel', `Rémunération de ${employe.matricule} — ${nomEmploye(employe)} ${premiere ? 'définie' : 'modifiée'} : ${apres}`);
        return employe;
      });
    }
    
    // Champs suivis dans l'historique (contrat, salaire, fonction, type, statut)
    const SUIVIS = {
      fonction: (e) => e.fonction, type: (e) => e.typeEmployeId, statut: (e) => e.statut,
      contrat: (e) => `${e.contrat.type} ${e.contrat.debut}→${e.contrat.fin || '…'}`,
      remuneration: (e) => (e.remuneration.mode === 'horaire' ? `payé à l’heure ${e.remuneration.tauxHoraire} / h` : `salaire mensuel ${e.remuneration.salaireBase}`) + ` prime ${e.remuneration.primeFixe}`
    };
    
    // La fiche (identité, poste, contrat) s'enregistre sans rémunération : celle-ci se définit ensuite dans
    // « Rémunérations ». Une paie ne peut pas être validée tant que la rémunération n'est pas définie.
    function createEmploye(state, payload = {}) {
      return withTransaction(state, () => {
        const data = normalizeEmploye(state, payload);
        const item = { id: nextId(state.personnel), ...data, remuneration: { ...REMUNERATION_VIDE }, photo: payload.photo || null, historique: [{ horodatage: new Date().toISOString(), par: currentUser()?.nom || '', type: 'creation', detail: `Embauche : ${data.fonction}` }], creeLe: Date.now() };
        state.personnel.push(item);
        logOperation(state, 'personnel', `Employé ${item.matricule} — ${nomEmploye(item)} (${item.fonction}) créé`);
        return item;
      });
    }
    
    // Mise à jour de la fiche : chaque changement de contrat, fonction, type ou statut est historisé. La
    // rémunération n'est jamais modifiée ici (voir definirRemuneration).
    function updateEmploye(state, id, payload = {}) {
      const item = state.personnel.find((e) => e.id === Number(id));
      if (!item) return null;
      return withTransaction(state, () => {
        const data = normalizeEmploye(state, payload, item);
        if (item.remuneration?.mode === 'horaire' && !state.typesEmploye.find((t) => t.id === data.typeEmployeId)?.enseignant) throw new Error('Cet employé est payé à l’heure (réservé aux enseignants) : passez d’abord sa rémunération en salaire mensuel dans « Rémunérations ».');
        const now = new Date().toISOString();
        const par = currentUser()?.nom || '';
        Object.entries(SUIVIS).forEach(([champ, read]) => {
          const avant = read(item);
          const apres = read({ ...item, ...data });
          if (String(avant) !== String(apres)) item.historique.push({ horodatage: now, par, type: champ, avant, apres });
        });
        Object.assign(item, data);
        if (payload.photo) item.photo = payload.photo;
        logOperation(state, 'personnel', `Fiche ${item.matricule} — ${nomEmploye(item)} modifiée`);
        return item;
      });
    }
    
    // ── Affectations des enseignants ──
    // Primaire : affectation fixe à une classe (un titulaire par classe, une classe par enseignant et par année).
    // Collège / lycée : affectations multiples (plusieurs classes, matières et niveaux) ; la matière doit figurer au
    // programme de la classe ; une même matière d'une même classe n'est assurée que par un seul enseignant à la fois.
    function niveauDeClasse(state, classeId) {
      return state.classes.find((c) => c.id === Number(classeId))?.categorie || '';
    }
    
    function saveAffectation(state, payload = {}) {
      const employe = state.personnel.find((e) => e.id === Number(payload.employeId));
      if (!employe) throw new Error('Choisissez un enseignant.');
      if (!isEnseignant(state, employe)) throw new Error('Seul un employé de type enseignant peut recevoir une affectation.');
      const anneeId = Number(payload.anneeId);
      if (!state.annees.some((a) => a.id === anneeId)) throw new Error('Année scolaire introuvable.');
      const classe = state.classes.find((c) => c.id === Number(payload.classeId) && c.anneeId === anneeId);
      if (!classe) throw new Error('Classe introuvable pour cette année scolaire.');
      const matiereId = Number(payload.matiereId || 0);
      if (matiereId && !state.matieres.some((m) => m.id === matiereId)) throw new Error('Matière introuvable.');
      const primaire = classe.categorie === 'Primaire';
      if (!primaire && !matiereId) throw new Error('Au collège et au lycée, choisissez la matière enseignée.');
      if (!primaire && !auProgramme(state, classe.id, matiereId)) throw new Error(`${state.matieres.find((m) => m.id === matiereId)?.nom || 'Cette matière'} n’est pas au programme de ${classe.nom}.`);
      const id = Number(payload.id || 0);
      const others = state.affectations.filter((a) => a.id !== id && a.actif && a.anneeId === anneeId);
      if (primaire) {
        if (others.some((a) => a.classeId === classe.id && niveauDeClasse(state, a.classeId) === 'Primaire' && a.employeId !== employe.id)) throw new Error(`La classe ${classe.nom} a déjà un enseignant titulaire pour cette année.`);
        if (others.some((a) => a.employeId === employe.id && niveauDeClasse(state, a.classeId) === 'Primaire' && a.classeId !== classe.id)) throw new Error('Au primaire, un enseignant est affecté à une seule classe par année.');
      }
      if (others.some((a) => a.employeId === employe.id && a.classeId === classe.id && Number(a.matiereId || 0) === matiereId)) throw new Error(`Affectation déjà enregistrée : ${classe.nom}${matiereId ? ` · ${state.matieres.find((m) => m.id === matiereId)?.nom}` : ''}.`);
      const occupe = !primaire && others.find((a) => a.classeId === classe.id && Number(a.matiereId || 0) === matiereId && a.employeId !== employe.id);
      if (occupe) throw new Error(`${state.matieres.find((m) => m.id === matiereId)?.nom} en ${classe.nom} est déjà assurée par ${nomEmploye(state.personnel.find((e) => e.id === occupe.employeId))} : clôturez d’abord son affectation.`);
      const data = { employeId: employe.id, anneeId, classeId: classe.id, matiereId, salle: text(payload.salle), actif: true };
      if (id) {
        const item = state.affectations.find((a) => a.id === id);
        if (!item) throw new Error('Affectation introuvable.');
        Object.assign(item, data);
        return item;
      }
      const item = { id: nextId(state.affectations), ...data, creeLe: Date.now() };
      state.affectations.push(item);
      return item;
    }
    
    // Plusieurs affectations d'un même enseignant en une fois (tout ou rien) ; les lignes en double sont ignorées
    function saveAffectations(state, { employeId, anneeId, lignes = [] } = {}) {
      const uniques = [];
      const vues = new Set();
      (Array.isArray(lignes) ? lignes : []).forEach((l) => {
        const key = `${Number(l.classeId)}|${Number(l.matiereId || 0)}`;
        if (!vues.has(key)) { vues.add(key); uniques.push(l); }
      });
      if (!uniques.length) throw new Error('Ajoutez au moins une ligne d’affectation.');
      return withTransaction(state, () => uniques.map((l) => saveAffectation(state, { employeId, anneeId, classeId: l.classeId, matiereId: l.matiereId, salle: l.salle })));
    }
    
    // Une affectation n'est jamais supprimée (les paies passées y font référence) : elle est désactivée
    function closeAffectation(state, id) {
      const item = state.affectations.find((a) => a.id === Number(id));
      if (!item) throw new Error('Affectation introuvable.');
      item.actif = false;
      item.dateFin = todayISO();
      return item;
    }
    
    function libelleAffectation(state, a) {
      const classe = state.classes.find((c) => c.id === a.classeId);
      const matiere = state.matieres.find((m) => m.id === a.matiereId);
      return `${classe?.nom || '—'}${matiere ? ` · ${matiere.nom}` : ' · classe complète'}${a.salle ? ` · salle ${a.salle}` : ''}`;
    }
    
    // ── Heures du mois des enseignants payés à l'heure (collège / lycée) ──
    // Un seul enregistrement par enseignant et par mois (lignes par affectation). Une nouvelle saisie du même mois
    // met à jour cet enregistrement et ajoute une entrée à son historique (avant → après, auteur, date). Les heures
    // d'un mois dont la paie est validée ou payée sont verrouillées (annuler la paie pour les corriger).
    function estPayeALHeure(employe) {
      return employe?.remuneration?.mode === 'horaire';
    }
    
    function anneeDuMois(state, mois) {
      const first = `${mois}-01`;
      return state.annees.find((a) => a.dateDebut && a.dateFin && a.dateDebut.slice(0, 7) <= mois && first <= a.dateFin) || state.annees.find((a) => a.id === state.anneeActiveId) || null;
    }
    
    // Affectations collège / lycée d'un enseignant valables pour le mois (actives, ou clôturées pendant / après ce mois),
    // dans l'année scolaire couvrant le mois et dans l'année active (rentrée en cours de préparation)
    function affectationsHorairesDuMois(state, employeId, mois) {
      const annees = new Set([anneeDuMois(state, mois)?.id, state.anneeActiveId].filter(Boolean).map(Number));
      return state.affectations.filter((a) => a.employeId === Number(employeId) && annees.has(Number(a.anneeId))
        && niveauDeClasse(state, a.classeId) !== 'Primaire' && (a.actif || (a.dateFin || '') >= `${mois}-01`));
    }
    
    function heuresDuMois(state, employeId, mois) {
      return (state.heuresRealisees || []).find((h) => h.employeId === Number(employeId) && h.mois === mois && Array.isArray(h.lignes)) || null;
    }
    
    function heuresVerrouillees(state, employeId, mois) {
      return state.paies.some((p) => p.employeId === Number(employeId) && p.mois === mois && (p.statut === 'validee' || p.statut === 'payee'));
    }
    
    const formatHeures = (lignes) => lignes.length ? lignes.map((l) => `${l.libelle} : ${l.heures} h`).join(' ; ') : 'aucune heure';
    const arrondiHeures = (v) => Math.round(Math.max(Number(String(v ?? '').replace(',', '.')) || 0, 0) * 100) / 100;
    
    // entrees : [{ employeId, lignes: [{ affectationId, heures }] }] — tout ou rien
    function setHeuresMois(state, mois, entrees = []) {
      if (!/^\d{4}-\d{2}$/.test(mois || '')) throw new Error('Mois invalide.');
      if (!Array.isArray(state.heuresRealisees)) state.heuresRealisees = [];
      return withTransaction(state, () => {
        const now = new Date().toISOString();
        const auteur = currentUser()?.nom || '';
        const touches = [];
        entrees.forEach((entree) => {
          const employe = state.personnel.find((e) => e.id === Number(entree.employeId));
          if (!employe) throw new Error('Enseignant introuvable.');
          if (!estPayeALHeure(employe)) throw new Error(`${nomEmploye(employe)} n’est pas payé à l’heure.`);
          const affs = affectationsHorairesDuMois(state, employe.id, mois);
          const lignes = (Array.isArray(entree.lignes) ? entree.lignes : []).map((l) => {
            const affectationId = Number(l.affectationId || 0);
            const heures = arrondiHeures(l.heures);
            if (heures > 300) throw new Error(`Nombre d’heures invalide pour ${nomEmploye(employe)}.`);
            const aff = affectationId ? affs.find((a) => a.id === affectationId) : null;
            if (affectationId && !aff) throw new Error(`Affectation invalide pour ${nomEmploye(employe)} en ${mois}.`);
            return { affectationId, libelle: aff ? libelleAffectation(state, aff) : 'Autres heures', heures };
          }).filter((l) => l.heures > 0);
          const existant = heuresDuMois(state, employe.id, mois);
          const avant = existant ? formatHeures(existant.lignes) : '';
          const apres = formatHeures(lignes);
          if (existant && avant === apres) return;
          if (!existant && !lignes.length) return;
          if (heuresVerrouillees(state, employe.id, mois)) throw new Error(`La paie de ${mois} de ${nomEmploye(employe)} est déjà validée : annulez-la pour corriger ses heures.`);
          const totalHeures = Math.round(lignes.reduce((s, l) => s + l.heures, 0) * 100) / 100;
          if (existant) {
            Object.assign(existant, { lignes, totalHeures, tauxHoraire: money(employe.remuneration.tauxHoraire), modifieLe: now, modifiePar: auteur });
            existant.historique.push({ horodatage: now, par: auteur, avant, apres });
            touches.push(existant);
          } else {
            const item = { id: nextId(state.heuresRealisees), employeId: employe.id, mois, lignes, totalHeures, tauxHoraire: money(employe.remuneration.tauxHoraire), saisiLe: now, saisiPar: auteur, historique: [{ horodatage: now, par: auteur, avant: '', apres }] };
            state.heuresRealisees.push(item);
            touches.push(item);
          }
          logOperation(state, 'paie', `Heures de ${mois} — ${nomEmploye(employe)} : ${totalHeures} h${existant ? ' (mise à jour)' : ''}`);
        });
        return touches;
      });
    }
    
    
    
    Object.assign(exports, { TYPES_EMPLOYE_DEFAUT, MATIERES_DEFAUT, CONTRATS, STATUTS_EMPLOYE, MODES_REMUNERATION, ensurePaieState, saveTypeEmploye, toggleTypeEmploye, saveMatiere, toggleMatiere, generateMatriculeEmploye, typeOf, isEnseignant, nomEmploye, remunerationDefinie, definirRemuneration, createEmploye, updateEmploye, niveauDeClasse, saveAffectation, saveAffectations, closeAffectation, libelleAffectation, estPayeALHeure, affectationsHorairesDuMois, heuresDuMois, heuresVerrouillees, setHeuresMois });
  };
  factories['./modules/paie.js'] = (require, exports) => {
    const { nextId, anneeCouvrantMois, anneeDeLOperation } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { createDepense, cancelDepense } = require("./depenses.js");
    const { nomEmploye, typeOf, MODES_REMUNERATION, heuresDuMois } = require("./personnel.js");
    const { prelevementsDus, appliquerPrelevement, annulerPrelevements } = require("./avances.js");
    // Paie mensuelle. Cycle : brouillon (recalculé à chaque affichage) → validée (copie figée des montants,
    // numéro attribué, prélèvements d'avances appliqués) → payée (sortie de caisse = dépense liée). Annulation tracée.
    // Une seule paie non annulée par employé et par mois : aucune double paie possible.
    const STATUTS_PAIE = { brouillon: 'Brouillon', validee: 'Validée — à payer', payee: 'Payée', annulee: 'Annulée' };
    
    const money = (v) => Math.floor(Number(v || 0));
    const par = () => currentUser()?.nom || '';
    
    function isMois(mois) { return /^\d{4}-\d{2}$/.test(mois || ''); }
    
    // Année scolaire couvrant un mois (pour les récapitulatifs et la trésorerie), sinon l'année active
    function anneePourMois(state, mois) {
      return anneeCouvrantMois(state, mois);
    }
    
    // Année scolaire à laquelle une paie est rattachée : celle qui couvre le mois si elle n'est pas clôturée,
    // sinon l'année active (une sortie de caisse n'est jamais enregistrée sur une année clôturée)
    function anneeDeLaPaie(state, mois) {
      return anneeDeLOperation(state, `${mois}-01`);
    }
    
    // Mois d'une année scolaire, de la rentrée à la fin d'année (pour les récapitulatifs par année scolaire)
    function moisDeLAnnee(annee) {
      if (!annee?.dateDebut || !annee?.dateFin) return [];
      const out = [];
      let [y, m] = annee.dateDebut.slice(0, 7).split('-').map(Number);
      const fin = annee.dateFin.slice(0, 7);
      for (let guard = 0; guard < 24; guard += 1) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        if (key > fin) break;
        out.push(key);
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
      return out;
    }
    
    function paieDuMois(state, employeId, mois) {
      return state.paies.find((p) => p.employeId === Number(employeId) && p.mois === mois && p.statut !== 'annulee') || null;
    }
    
    function cleanLines(lines) {
      return (Array.isArray(lines) ? lines : []).map((l) => ({ libelle: String(l.libelle || '').trim(), montant: money(l.montant) })).filter((l) => l.libelle && l.montant > 0);
    }
    
    // Calcul complet (pur, ne modifie rien) :
    //  net = salaire mensuel (ou heures du mois × tarif horaire) + primes (fixe de la fiche + primes du mois)
    //        − retenues saisies pour le mois − avances dues
    // Aucune retenue n'est appliquée sans avoir été saisie explicitement dans la paie du mois.
    function calculerPaie(state, employeId, mois, variables = {}) {
      const employe = state.personnel.find((e) => e.id === Number(employeId));
      if (!employe) throw new Error('Employé introuvable.');
      if (!isMois(mois)) throw new Error('Mois invalide.');
      const r = employe.remuneration;
      const horaire = r.mode === 'horaire';
      const taux = money(r.tauxHoraire);
      // Payé à l'heure : une ligne par affectation saisie pour le mois (heures × tarif horaire), sinon salaire mensuel
      const saisie = horaire ? heuresDuMois(state, employe.id, mois) : null;
      const lignes = horaire
        ? (saisie?.lignes || []).map((l) => ({ type: 'heures', libelle: l.libelle, heures: l.heures, taux, montant: Math.round(l.heures * taux), affectationId: l.affectationId }))
        : [{ type: 'base', libelle: 'Salaire mensuel', montant: money(r.salaireBase) }];
      const totalHeures = horaire ? Math.round((saisie?.lignes || []).reduce((s, l) => s + l.heures, 0) * 100) / 100 : 0;
      const primes = [...(r.primeFixe > 0 ? [{ libelle: r.libellePrime, montant: money(r.primeFixe), fixe: true }] : []), ...cleanLines(variables.primes)];
      const retenues = cleanLines(variables.retenues);
      const base = lignes.reduce((s, l) => s + l.montant, 0);
      const totalPrimes = primes.reduce((s, l) => s + l.montant, 0);
      const totalRetenues = retenues.reduce((s, l) => s + l.montant, 0);
      const brut = base + totalPrimes;
      const netAvantAvances = brut - totalRetenues;
      // Avances : prélèvement dû du mois, limité au net disponible (le reste est reporté automatiquement au mois suivant)
      let disponible = Math.max(netAvantAvances, 0);
      const avances = prelevementsDus(state, employe.id, mois).map((d) => {
        const preleve = Math.min(d.du, disponible);
        disponible -= preleve;
        return { avanceId: d.avanceId, du: d.du, montant: preleve, reporte: d.du - preleve };
      });
      const totalAvances = avances.reduce((s, a) => s + a.montant, 0);
      const alertes = [];
      const remunerationDefinie = horaire ? taux > 0 && totalHeures > 0 : money(r.salaireBase) > 0;
      if (horaire && taux <= 0) alertes.push('Rémunération non définie : fixez le tarif horaire dans Paie du personnel › Rémunérations.');
      else if (horaire && totalHeures <= 0) alertes.push(`Aucune heure saisie pour ${mois} : enregistrez d’abord les heures du mois de cet enseignant.`);
      if (!horaire && money(r.salaireBase) <= 0) alertes.push('Rémunération non définie : fixez le salaire dans Paie du personnel › Rémunérations avant de valider la paie.');
      if (netAvantAvances < 0) alertes.push('Les retenues dépassent le salaire brut : la paie ne peut pas être validée.');
      if (avances.some((a) => a.reporte > 0)) alertes.push('Net insuffisant : une partie du prélèvement d’avance est reportée au mois suivant.');
      if (employe.statut !== 'actif') alertes.push(`Employé ${employe.statut === 'suspendu' ? 'suspendu' : 'sorti'}.`);
      return {
        employe: { id: employe.id, matricule: employe.matricule, nom: employe.nom, prenom: employe.prenom, fonction: employe.fonction, type: typeOf(state, employe)?.libelle || '', contrat: { ...employe.contrat } },
        mode: r.mode, modeLibelle: MODES_REMUNERATION[r.mode], tauxHoraire: horaire ? taux : 0, totalHeures, heuresId: saisie?.id || 0, lignes, primes, retenues, avances,
        base, totalPrimes, totalRetenues, brut, totalAvances, net: netAvantAvances - totalAvances, alertes, valide: netAvantAvances >= 0 && remunerationDefinie
      };
    }
    
    // Calcul affiché : copie figée pour une paie validée / payée, recalcul en direct pour un brouillon
    function calculAffiche(state, paie) {
      return paie.statut === 'brouillon' ? calculerPaie(state, paie.employeId, paie.mois, paie.variables) : paie.calcul;
    }
    
    function findPaie(state, id) {
      const paie = state.paies.find((p) => p.id === Number(id));
      if (!paie) throw new Error('Paie introuvable.');
      return paie;
    }
    
    // Prépare les brouillons du mois pour les employés actifs (ou une sélection) qui n'ont pas encore de paie ce mois-là
    function preparerPaies(state, mois, employeIds = null) {
      if (!isMois(mois)) throw new Error('Choisissez un mois valide.');
      if (mois > todayISO().slice(0, 7)) throw new Error('On ne prépare pas la paie d’un mois futur.');
      return withTransaction(state, () => {
        const cibles = state.personnel.filter((e) => e.statut === 'actif' && (!employeIds || employeIds.includes(e.id)));
        const crees = [];
        cibles.forEach((e) => {
          if (paieDuMois(state, e.id, mois)) return; // jamais deux paies pour le même mois
          const paie = { id: nextId(state.paies), employeId: e.id, mois, anneeId: anneeDeLaPaie(state, mois), statut: 'brouillon', variables: { primes: [], retenues: [] }, creeLe: Date.now(), creePar: par(), historique: [] };
          state.paies.push(paie);
          crees.push(paie);
        });
        if (crees.length) logOperation(state, 'paie', `Paie de ${mois} préparée pour ${crees.length} employé(s)`);
        return crees;
      });
    }
    
    function majVariables(state, id, variables = {}) {
      const paie = findPaie(state, id);
      if (paie.statut !== 'brouillon') throw new Error('Seule une paie en brouillon peut être modifiée.');
      paie.variables = { primes: cleanLines(variables.primes), retenues: cleanLines(variables.retenues) };
      return paie;
    }
    
    function numeroPaie(state, mois) {
      const key = mois;
      const used = state.paies.filter((p) => p.numero?.startsWith(`BP-${mois}-`)).reduce((m, p) => Math.max(m, Number(p.numero.split('-').pop()) || 0), 0);
      const next = Math.max(Number(state.compteursPaie[key] || 0), used) + 1;
      state.compteursPaie[key] = next;
      return `BP-${mois}-${String(next).padStart(4, '0')}`;
    }
    
    // Validation : recalcul final, copie figée, numéro, prélèvements d'avances appliqués — tout ou rien
    function validerPaie(state, id) {
      const paie = findPaie(state, id);
      if (paie.statut !== 'brouillon') throw new Error('Cette paie est déjà validée ou annulée.');
      return withTransaction(state, () => {
        const calcul = calculerPaie(state, paie.employeId, paie.mois, paie.variables);
        if (!calcul.valide) throw new Error(calcul.alertes[0]);
        calcul.avances.filter((a) => a.montant > 0).forEach((a) => appliquerPrelevement(state, a.avanceId, paie.id, paie.mois, a.montant));
        Object.assign(paie, { statut: 'validee', calcul, numero: numeroPaie(state, paie.mois), validePar: par(), dateValidation: todayISO() });
        paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'validation', net: calcul.net });
        logOperation(state, 'paie', `Paie ${paie.numero} — ${nomEmploye(calcul.employe)} validée (net ${calcul.net})`, calcul.net);
        return paie;
      });
    }
    
    // Paiement : enregistre la sortie de caisse (dépense « Salaires et indemnités » liée à la paie)
    function payerPaie(state, id, { date = todayISO(), moyen = 'espece' } = {}) {
      const paie = findPaie(state, id);
      if (paie.statut !== 'validee') throw new Error('Seule une paie validée peut être marquée payée.');
      if (date > todayISO()) throw new Error('La date de paiement ne peut pas être dans le futur.');
      return withTransaction(state, () => {
        let depense = null;
        if (paie.calcul.net > 0) {
          depense = createDepense(state, {
            // Trésorerie : la sortie de caisse est rattachée à l'année scolaire de la paie (mois couvert par l'année)
            anneeId: paie.anneeId || anneeDeLaPaie(state, paie.mois),
            date, categorie: 'Salaires et indemnités', description: `Salaire ${paie.mois} — ${nomEmploye(paie.calcul.employe)} (${paie.numero})`,
            montant: paie.calcul.net, beneficiaire: nomEmploye(paie.calcul.employe), demandeur: 'Paie du personnel', reference: paie.numero, mode: moyen, source: { type: 'paie', id: paie.id }
          }, { ignoreDuplicate: true });
          if (!depense) throw new Error('Paiement impossible : la dépense n’a pas pu être enregistrée (année clôturée ?).');
        }
        Object.assign(paie, { statut: 'payee', datePaiement: date, moyenPaiement: moyen, payePar: par(), depenseId: depense?.id || 0 });
        paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'paiement', date });
        logOperation(state, 'paie', `Paie ${paie.numero} payée (${moyen})`, paie.calcul.net);
        return paie;
      });
    }
    
    // Annulation : la ligne et son numéro restent ; prélèvements d'avances rendus ; dépense liée annulée
    function annulerPaie(state, id, motif) {
      const paie = findPaie(state, id);
      if (paie.statut === 'annulee') throw new Error('Cette paie est déjà annulée.');
      if (!String(motif || '').trim()) throw new Error('Le motif d’annulation est obligatoire.');
      return withTransaction(state, () => {
        if (paie.statut === 'validee' || paie.statut === 'payee') annulerPrelevements(state, paie.id);
        if (paie.depenseId) cancelDepense(state, paie.depenseId, `Paie ${paie.numero} annulée — ${motif}`, { systeme: true });
        const avant = paie.statut;
        Object.assign(paie, { statut: 'annulee', motifAnnulation: String(motif).trim(), dateAnnulation: todayISO(), annulePar: par() });
        paie.historique.push({ horodatage: new Date().toISOString(), par: par(), action: 'annulation', avant, motif });
        logOperation(state, 'annulation', `Paie ${paie.numero || `#${paie.id}`} (${paie.mois}) annulée — ${motif}`, paie.calcul?.net || 0);
        return paie;
      });
    }
    
    // ── Synthèses (tableau de bord et rapports) ──
    function syntheseMois(state, mois) {
      const paies = state.paies.filter((p) => p.mois === mois && p.statut !== 'annulee').map((p) => ({ paie: p, calcul: calculAffiche(state, p) }));
      const sum = (key, filter = () => true) => paies.filter(filter).reduce((s, x) => s + Number(x.calcul[key] || 0), 0);
      return {
        paies, nb: paies.length,
        brut: sum('brut'), primes: sum('totalPrimes'), retenues: sum('totalRetenues'), avances: sum('totalAvances'), net: sum('net'),
        paye: sum('net', (x) => x.paie.statut === 'payee'), aPayer: sum('net', (x) => x.paie.statut === 'validee'), brouillons: paies.filter((x) => x.paie.statut === 'brouillon').length
      };
    }
    
    // Récapitulatif d'une année scolaire (de la rentrée à la fin d'année) : une ligne par mois.
    // `annee` est l'identifiant d'une année scolaire ; une année civile (« 2026 ») reste acceptée.
    function recapAnnuel(state, annee, employeId = 0) {
      const scolaire = state.annees.find((a) => a.id === Number(annee) && String(annee).length < 4);
      const listeMois = scolaire ? moisDeLAnnee(scolaire) : Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
      const paies = state.paies.filter((p) => listeMois.includes(p.mois) && p.statut !== 'annulee' && p.statut !== 'brouillon' && (!employeId || p.employeId === Number(employeId)));
      const mois = listeMois.map((m) => {
        const list = paies.filter((p) => p.mois === m);
        const s = (k) => list.reduce((t, p) => t + Number(p.calcul[k] || 0), 0);
        return { mois: m, nb: list.length, brut: s('brut'), primes: s('totalPrimes'), retenues: s('totalRetenues'), avances: s('totalAvances'), net: s('net'), paye: list.filter((p) => p.statut === 'payee').reduce((t, p) => t + p.calcul.net, 0) };
      });
      const total = mois.reduce((t, m) => ({ nb: t.nb + m.nb, brut: t.brut + m.brut, primes: t.primes + m.primes, retenues: t.retenues + m.retenues, avances: t.avances + m.avances, net: t.net + m.net, paye: t.paye + m.paye }), { nb: 0, brut: 0, primes: 0, retenues: 0, avances: 0, net: 0, paye: 0 });
      return { mois, total };
    }
    
    Object.assign(exports, { STATUTS_PAIE, isMois, anneePourMois, anneeDeLaPaie, moisDeLAnnee, paieDuMois, calculerPaie, calculAffiche, preparerPaies, majVariables, validerPaie, payerPaie, annulerPaie, syntheseMois, recapAnnuel });
  };
  factories['./modules/avances.js'] = (require, exports) => {
    const { nextId, anneeDeLOperation } = require("./annees.js");
    const { logOperation } = require("./audit.js");
    const { withTransaction } = require("./transaction.js");
    const { currentUser } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    const { nomEmploye } = require("./personnel.js");
    const { createDepense } = require("./depenses.js");
    const { repartir, regleArrondi } = require("./arrondi.js");
    // Avances sur salaire (module unique, pas de prêts séparés).
    // Invariant vérifié par les tests : montant autorisé = prélevé sur paie + remboursé en exceptionnel + solde restant.
    const STATUTS_AVANCE = { demandee: 'Demandée', approuvee: 'Approuvée', refusee: 'Refusée', versee: 'Versée — en remboursement', soldee: 'Soldée', annulee: 'Annulée' };
    const MODES_REMBOURSEMENT = { mensualite: 'Prélèvement mensuel fixe', duree: 'Durée définie' };
    const MAX_MOIS = 36;
    
    const money = (v) => Math.floor(Number(v || 0));
    const par = () => currentUser()?.nom || '';
    
    function moisSuivant(mois, n = 1) {
      const [y, m] = mois.split('-').map(Number);
      const d = new Date(y, m - 1 + n, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    
    // Échéancier automatique ; la dernière mensualité absorbe l'arrondi (ajustement)
    function construireEcheancier(montant, mode, valeur, moisDebut, regle = { pas: 1, sens: 'inferieur' }) {
      const total = money(montant);
      const v = money(valeur);
      if (total <= 0) throw new Error('Le montant doit être supérieur à zéro.');
      if (!/^\d{4}-\d{2}$/.test(moisDebut || '')) throw new Error('Choisissez le mois du premier prélèvement.');
      let montants;
      if (mode === 'mensualite') {
        if (v <= 0) throw new Error('Indiquez le montant du prélèvement mensuel.');
        const n = Math.ceil(total / v);
        if (n > MAX_MOIS) throw new Error(`Remboursement trop long (${n} mois, maximum ${MAX_MOIS}) : augmentez la mensualité.`);
        montants = Array.from({ length: n }, (_, i) => (i === n - 1 ? total - v * (n - 1) : v));
      } else if (mode === 'duree') {
        if (v < 1 || v > MAX_MOIS) throw new Error(`La durée doit être comprise entre 1 et ${MAX_MOIS} mois.`);
        if (Math.floor(total / v) <= 0) throw new Error('Durée trop longue pour ce montant.');
        montants = repartir(total, v, regle);
      } else {
        throw new Error('Choisissez le mode de remboursement.');
      }
      return montants.map((m, i) => ({ mois: moisSuivant(moisDebut, i), montant: m, preleve: 0, statut: 'prevue' }));
    }
    
    function soldeAvance(avance) {
      return (avance.echeancier || []).reduce((s, e) => s + Math.max(e.montant - e.preleve, 0), 0);
    }
    
    function totalPreleve(avance) {
      return (avance.prelevements || []).filter((p) => !p.annule).reduce((s, p) => s + p.montant, 0);
    }
    
    function totalExceptionnel(avance) {
      return (avance.exceptionnels || []).reduce((s, x) => s + x.montant, 0);
    }
    
    function trace(avance, type, detail, montant = 0) {
      avance.historique = [...(avance.historique || []), { horodatage: new Date().toISOString(), par: par(), type, detail, montant }];
    }
    
    function findAvance(state, id) {
      const avance = state.avances.find((a) => a.id === Number(id));
      if (!avance) throw new Error('Avance introuvable.');
      return avance;
    }
    
    function nomDe(state, avance) {
      return nomEmploye(state.personnel.find((e) => e.id === avance.employeId));
    }
    
    function demanderAvance(state, payload = {}) {
      const employe = state.personnel.find((e) => e.id === Number(payload.employeId));
      if (!employe) throw new Error('Choisissez un employé.');
      if (employe.statut === 'sorti') throw new Error('Cet employé a quitté l’établissement.');
      const montant = money(payload.montantDemande);
      if (montant <= 0) throw new Error('Le montant demandé doit être supérieur à zéro.');
      const date = payload.dateDemande || todayISO();
      if (date > todayISO()) throw new Error('La date de demande ne peut pas être dans le futur.');
      // Simulation de l'échéancier proposé (validée à l'approbation)
      construireEcheancier(montant, payload.modeRemboursement, payload.valeur, payload.moisDebut, regleArrondi(state.config, 'avances'));
      return withTransaction(state, () => {
        const avance = {
          id: nextId(state.avances), employeId: employe.id, dateDemande: date, montantDemande: montant, motif: String(payload.motif || '').trim(),
          modeRemboursement: payload.modeRemboursement, valeur: money(payload.valeur), moisDebut: payload.moisDebut,
          statut: 'demandee', montantAutorise: 0, echeancier: [], prelevements: [], exceptionnels: [], historique: [], creeLe: Date.now()
        };
        trace(avance, 'demande', `Demande de ${montant}`, montant);
        state.avances.push(avance);
        logOperation(state, 'avance', `Demande d’avance de ${nomEmploye(employe)}`, montant);
        return avance;
      });
    }
    
    // Approbation : montant autorisé (≤ demandé) et échéancier définitif
    function approuverAvance(state, id, payload = {}) {
      const avance = findAvance(state, id);
      if (avance.statut !== 'demandee') throw new Error('Seule une demande en attente peut être approuvée.');
      const montant = money(payload.montantAutorise || avance.montantDemande);
      if (montant <= 0 || montant > avance.montantDemande) throw new Error('Le montant autorisé doit être positif et ne pas dépasser le montant demandé.');
      const mode = payload.modeRemboursement || avance.modeRemboursement;
      const valeur = payload.valeur || avance.valeur;
      const moisDebut = payload.moisDebut || avance.moisDebut;
      const echeancier = construireEcheancier(montant, mode, valeur, moisDebut, regleArrondi(state.config, 'avances'));
      return withTransaction(state, () => {
        Object.assign(avance, { statut: 'approuvee', montantAutorise: montant, modeRemboursement: mode, valeur: money(valeur), moisDebut, echeancier, approuvePar: par(), dateApprobation: todayISO() });
        trace(avance, 'approbation', `Autorisée : ${montant} en ${echeancier.length} prélèvement(s)`, montant);
        logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} approuvée (${echeancier.length} mois)`, montant);
        return avance;
      });
    }
    
    function refuserAvance(state, id, motif) {
      const avance = findAvance(state, id);
      if (avance.statut !== 'demandee') throw new Error('Seule une demande en attente peut être refusée.');
      if (!String(motif || '').trim()) throw new Error('Le motif du refus est obligatoire.');
      return withTransaction(state, () => {
        avance.statut = 'refusee';
        trace(avance, 'refus', String(motif).trim());
        logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} refusée — ${motif}`, avance.montantDemande);
        return avance;
      });
    }
    
    // Versement : sortie de caisse enregistrée comme dépense liée (non modifiable depuis la page Dépenses)
    function verserAvance(state, id, { date = todayISO() } = {}) {
      const avance = findAvance(state, id);
      if (avance.statut !== 'approuvee') throw new Error('L’avance doit être approuvée avant d’être versée.');
      if (date > todayISO()) throw new Error('La date de versement ne peut pas être dans le futur.');
      return withTransaction(state, () => {
        const depense = createDepense(state, {
          anneeId: anneeDeLOperation(state, date), date, categorie: 'Avances sur salaire', description: `Avance sur salaire — ${nomDe(state, avance)}`,
          montant: avance.montantAutorise, beneficiaire: nomDe(state, avance), demandeur: 'Paie du personnel', reference: `AVANCE-${avance.id}`,
          source: { type: 'avance', id: avance.id }
        }, { ignoreDuplicate: true });
        if (!depense) throw new Error('Versement impossible : la dépense n’a pas pu être enregistrée (année clôturée ?).');
        Object.assign(avance, { statut: 'versee', dateVersement: date, depenseId: depense.id });
        trace(avance, 'versement', `Versée le ${date} (dépense ${depense.numero})`, avance.montantAutorise);
        logOperation(state, 'avance', `Avance de ${nomDe(state, avance)} versée`, avance.montantAutorise);
        return avance;
      });
    }
    
    // Prélèvement dû pour un mois : échéances de ce mois ou antérieures non encore prélevées (reports compris)
    function prelevementsDus(state, employeId, mois) {
      return state.avances.filter((a) => a.employeId === Number(employeId) && a.statut === 'versee').map((avance) => {
        const du = avance.echeancier.filter((e) => e.mois <= mois).reduce((s, e) => s + Math.max(e.montant - e.preleve, 0), 0);
        return { avanceId: avance.id, du: Math.min(du, soldeAvance(avance)) };
      }).filter((x) => x.du > 0);
    }
    
    // Applique un prélèvement validé avec une paie (échéances dans l'ordre) ; refuse tout double prélèvement
    function appliquerPrelevement(state, avanceId, paieId, mois, montant) {
      const avance = findAvance(state, avanceId);
      if ((avance.prelevements || []).some((p) => p.paieId === paieId && !p.annule)) throw new Error('Double prélèvement refusé : cette paie a déjà prélevé sur cette avance.');
      let left = money(montant);
      const parts = [];
      for (const [index, e] of avance.echeancier.entries()) {
        if (left <= 0) break;
        if (e.mois > mois) break;
        const reste = e.montant - e.preleve;
        if (reste <= 0) continue;
        const part = Math.min(reste, left);
        e.preleve += part;
        e.statut = e.preleve >= e.montant ? 'prelevee' : 'partielle';
        parts.push({ index, montant: part });
        left -= part;
      }
      if (left > 0) throw new Error('Prélèvement supérieur au montant dû.');
      avance.prelevements = [...(avance.prelevements || []), { paieId, mois, montant: money(montant), parts, horodatage: new Date().toISOString() }];
      trace(avance, 'prelevement', `Prélèvement sur la paie de ${mois}`, money(montant));
      if (soldeAvance(avance) === 0) { avance.statut = 'soldee'; trace(avance, 'solde', 'Avance entièrement remboursée'); }
      return avance;
    }
    
    // Annulation d'une paie : ses prélèvements sont rendus (historique conservé, marqué annulé)
    function annulerPrelevements(state, paieId) {
      state.avances.forEach((avance) => {
        (avance.prelevements || []).filter((p) => p.paieId === paieId && !p.annule).forEach((p) => {
          p.parts.forEach(({ index, montant }) => {
            const e = avance.echeancier[index];
            e.preleve -= montant;
            e.statut = e.preleve <= 0 ? 'prevue' : 'partielle';
          });
          p.annule = true;
          if (avance.statut === 'soldee') avance.statut = 'versee';
          trace(avance, 'annulation-prelevement', `Prélèvement de ${p.mois} annulé avec sa paie`, p.montant);
        });
      });
    }
    
    // Report : le reste d'une échéance est déplacé à la fin de l'échéancier
    function reporterEcheance(state, avanceId, index) {
      const avance = findAvance(state, avanceId);
      if (avance.statut !== 'versee') throw new Error('Seule une avance en remboursement peut être reportée.');
      const e = avance.echeancier[Number(index)];
      if (!e) throw new Error('Échéance introuvable.');
      const reste = e.montant - e.preleve;
      if (reste <= 0) throw new Error('Cette échéance est déjà prélevée.');
      return withTransaction(state, () => {
        const last = avance.echeancier[avance.echeancier.length - 1].mois;
        e.montant = e.preleve;
        e.statut = e.preleve > 0 ? 'prelevee' : 'reportee';
        e.reporte = (e.reporte || 0) + reste;
        avance.echeancier.push({ mois: moisSuivant(last), montant: reste, preleve: 0, statut: 'prevue', origine: e.mois });
        trace(avance, 'report', `Échéance de ${e.mois} reportée en ${moisSuivant(last)}`, reste);
        logOperation(state, 'avance', `Report d’échéance d’avance — ${nomDe(state, avance)} (${e.mois} → ${moisSuivant(last)})`, reste);
        return avance;
      });
    }
    
    // Remboursement exceptionnel en espèces : entrée de caisse, réduit les dernières échéances (durée raccourcie)
    function rembourserExceptionnel(state, avanceId, { montant, date = todayISO() }) {
      const avance = findAvance(state, avanceId);
      if (avance.statut !== 'versee') throw new Error('Seule une avance en remboursement peut recevoir un remboursement exceptionnel.');
      const value = money(montant);
      if (value <= 0 || value > soldeAvance(avance)) throw new Error(`Le montant doit être compris entre 1 et le solde restant (${soldeAvance(avance)}).`);
      if (date > todayISO()) throw new Error('La date ne peut pas être dans le futur.');
      return withTransaction(state, () => {
        let left = value;
        for (let i = avance.echeancier.length - 1; i >= 0 && left > 0; i -= 1) {
          const e = avance.echeancier[i];
          const reste = e.montant - e.preleve;
          if (reste <= 0) continue;
          const part = Math.min(reste, left);
          e.montant -= part;
          e.rembourseExceptionnel = (e.rembourseExceptionnel || 0) + part;
          e.statut = e.montant <= e.preleve ? (e.preleve > 0 ? 'prelevee' : 'remboursee') : e.statut;
          left -= part;
        }
        avance.exceptionnels = [...(avance.exceptionnels || []), { date, montant: value, par: par() }];
        state.entreesCaisse.push({ id: nextId(state.entreesCaisse), date, anneeId: anneeDeLOperation(state, date), montant: value, libelle: `Remboursement d’avance — ${nomDe(state, avance)}`, source: { type: 'avance', id: avance.id } });
        trace(avance, 'exceptionnel', `Remboursement exceptionnel le ${date}`, value);
        if (soldeAvance(avance) === 0) { avance.statut = 'soldee'; trace(avance, 'solde', 'Avance entièrement remboursée'); }
        logOperation(state, 'avance', `Remboursement exceptionnel d’avance — ${nomDe(state, avance)}`, value);
        return avance;
      });
    }
    
    Object.assign(exports, { STATUTS_AVANCE, MODES_REMBOURSEMENT, moisSuivant, construireEcheancier, soldeAvance, totalPreleve, totalExceptionnel, demanderAvance, approuverAvance, refuserAvance, verserAvance, prelevementsDus, appliquerPrelevement, annulerPrelevements, reporterEcheance, rembourserExceptionnel });
  };
  factories['./modules/bulletin-paie.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, numberToFrench } = require("./utils.js");
    const { enteteHtml } = require("./entete.js");
    const { printDocument } = require("./print.js");
    const { STATUTS_PAIE } = require("./paie.js");
    const { soldeAvance } = require("./avances.js");
    const { CONTRATS } = require("./personnel.js");
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MOYENS = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money' };
    
    function moisLabel(mois) {
      const [y, m] = String(mois).split('-').map(Number);
      return m ? `${MOIS[m - 1]} ${y}` : String(mois);
    }
    
    function words(n, devise) {
      const v = Math.floor(Number(n) || 0);
      const t = numberToFrench(v);
      return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${devise === 'GNF' ? `franc${v > 1 ? 's' : ''} guinéen${v > 1 ? 's' : ''}` : devise}`;
    }
    
    // Bulletin d'une paie validée ou payée : construit uniquement à partir de sa copie figée (paie.calcul)
    function bulletinHtml(state, paie) {
      const c = paie.calcul;
      const devise = escapeHtml(state.config.devise);
      const money = (v) => formatMoney(v);
      const employe = state.personnel.find((e) => e.id === paie.employeId);
      const avancesEnCours = state.avances.filter((a) => a.employeId === paie.employeId && (a.statut === 'versee' || a.statut === 'soldee'));
      // Colonnes Quantité / Taux : enseignant payé à l'heure (heures dispensées du mois × tarif horaire)
      const horaire = c.lignes.some((l) => l.type === 'heures');
      const vide = horaire ? '<td></td><td></td>' : '';
      const gains = [
        ...c.lignes.map((l) => (l.type === 'heures'
          ? `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${l.heures} h${l.heuresPrevues ? ` <span class="bp-muted">/ ${l.heuresPrevues} prévues</span>` : ''}</td><td class="num">${money(l.taux)}</td><td class="num">${money(l.montant)}</td><td></td></tr>`
          : `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td class="num">${money(l.montant)}</td><td></td></tr>`)),
        ...c.primes.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td class="num">${money(l.montant)}</td><td></td></tr>`),
        ...c.retenues.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td></td><td class="num">${money(l.montant)}</td></tr>`),
        ...c.avances.filter((a) => a.montant > 0).map((a) => `<tr><td>Remboursement d’avance n°${a.avanceId}${a.reporte ? ` <span class="bp-muted">(reporté : ${money(a.reporte)})</span>` : ''}</td>${vide}<td></td><td class="num">${money(a.montant)}</td></tr>`)
      ].join('');
      return `<article class="bp-sheet">
        ${enteteHtml(state.config)}
        <div class="bp-title"><h2>Bulletin de paie — ${escapeHtml(moisLabel(paie.mois))}</h2><div><b>N° ${escapeHtml(paie.numero || 'brouillon')}</b><span>${escapeHtml(STATUTS_PAIE[paie.statut])}${paie.datePaiement ? ` le ${escapeHtml(formatDateFr(paie.datePaiement))}` : ''}</span></div></div>
        <div class="bp-cols">
          <div class="bp-box"><h3>Employé</h3>
            <p class="bp-name">${escapeHtml(c.employe.prenom)} ${escapeHtml(c.employe.nom)}</p>
            <p><b>Matricule : ${escapeHtml(c.employe.matricule)}</b></p>
            <p><b>Fonction : ${escapeHtml(c.employe.fonction)}</b> <span class="bp-muted">(${escapeHtml(c.employe.type)})</span></p>
            <p>Contrat : ${escapeHtml(CONTRATS[c.employe.contrat?.type] || '—')}${employe?.dateEmbauche ? ` · embauché le ${escapeHtml(formatDateFr(employe.dateEmbauche))}` : ''}</p></div>
          <div class="bp-box"><h3>Rémunération</h3>
            <p>Mode : <b>${escapeHtml(c.modeLibelle)}</b></p>
            <p>Période : ${escapeHtml(moisLabel(paie.mois))}</p>
            ${c.mode === 'horaire' && c.totalHeures ? `<p>Heures dispensées : <b>${c.totalHeures} h</b> × ${money(c.tauxHoraire)} ${devise}</p>` : ''}
            ${paie.moyenPaiement ? `<p>Paiement : ${escapeHtml(MOYENS[paie.moyenPaiement] || paie.moyenPaiement)}</p>` : ''}
            ${avancesEnCours.length ? `<p>Solde des avances : <b>${money(avancesEnCours.reduce((s, a) => s + soldeAvance(a), 0))} ${devise}</b></p>` : ''}</div>
        </div>
        <table class="bp-table"><thead><tr><th>Désignation</th>${horaire ? '<th class="num">Quantité</th><th class="num">Taux</th>' : ''}<th class="num">Gains</th><th class="num">Retenues</th></tr></thead>
          <tbody>${gains}</tbody>
          <tfoot><tr><td colspan="${horaire ? 3 : 1}">Totaux</td><td class="num">${money(c.brut)}</td><td class="num">${money(c.totalRetenues + c.totalAvances)}</td></tr></tfoot></table>
        <div class="bp-totals">
          <div><span>Salaire brut</span><b>${money(c.brut)} ${devise}</b></div>
          <div><span>Retenues</span><b>${money(c.totalRetenues)} ${devise}</b></div>
          <div><span>Avances prélevées</span><b>${money(c.totalAvances)} ${devise}</b></div>
          <div class="bp-net"><span>Net à payer</span><b>${money(c.net)} ${devise}</b></div>
        </div>
        <p class="bp-words">Arrêté à la somme de : <b>${escapeHtml(words(c.net, state.config.devise))}</b></p>
        <div class="bp-sign"><div>L’employé(e)</div><div>La Comptable</div><div>Le Directeur Général</div></div>
      </article>`;
    }
    
    const BULLETIN_CSS = `
      .bp-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
      .bp-doc .bp-sheet { page-break-after: always; break-after: page; }
      .bp-doc .bp-sheet:last-child { page-break-after: auto; break-after: auto; }
      .bp-doc .bp-title { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 4mm 0 3mm; padding: 2.5mm 4mm; background: #7c3aed; color: #fff; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bp-doc .bp-title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: .6px; color: #fff; }
      .bp-doc .bp-title div { display: grid; text-align: right; }
      .bp-doc .bp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
      .bp-doc .bp-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 4mm; }
      .bp-doc .bp-box h3 { margin: 0 0 1.5mm; font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
      .bp-doc .bp-box p { margin: 0 0 1mm; }
      .bp-doc .bp-name { font-size: 14px; font-weight: 700; }
      .bp-doc .bp-muted { color: #6b7280; font-weight: 400; }
      #print-root .bp-doc .bp-table th, #print-root .bp-doc .bp-table td, .bp-doc .bp-table th, .bp-doc .bp-table td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; font-size: 10.5px; }
      .bp-doc .bp-table { width: 100%; border-collapse: collapse; }
      .bp-doc .bp-table th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root .bp-doc .bp-table th.num, #print-root .bp-doc .bp-table td.num, .bp-doc .bp-table .num { text-align: right; white-space: nowrap; }
      .bp-doc .bp-table tfoot td { font-weight: 700; background: #faf5ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bp-doc .bp-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin-top: 4mm; }
      .bp-doc .bp-totals div { border: 1px solid #e9d5ff; background: #faf5ff; border-radius: 4px; padding: 2mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .bp-doc .bp-totals span { display: block; font-size: 8.5px; text-transform: uppercase; color: #6b7280; }
      .bp-doc .bp-totals b { font-size: 13px; }
      .bp-doc .bp-totals .bp-net { border-color: #fdba74; background: #fff7ed; }
      .bp-doc .bp-totals .bp-net b { color: #c2410c; font-size: 15px; }
      .bp-doc .bp-words { margin: 3mm 0 0; font-style: italic; }
      .bp-doc .bp-sign { display: flex; justify-content: space-between; gap: 8mm; margin-top: 12mm; height: 18mm; page-break-inside: avoid; }
      .bp-doc .bp-sign div { flex: 1; text-align: center; border-top: 1px solid #111827; padding-top: 3px; align-self: flex-end; font-weight: 700; }
    `;
    
    // Impression d'un ou plusieurs bulletins (un par page A4) ; les brouillons ne sont jamais imprimés
    function printBulletins(state, paieIds, fileName = '') {
      const paies = paieIds.map((id) => state.paies.find((p) => p.id === Number(id))).filter((p) => p && (p.statut === 'validee' || p.statut === 'payee'));
      if (!paies.length) return false;
      return printDocument({ title: paies.length === 1 ? `Bulletin ${paies[0].numero}` : `Bulletins de paie (${paies.length})`, html: `<div class="bp-doc">${paies.map((p) => bulletinHtml(state, p)).join('')}</div>`, css: BULLETIN_CSS, margin: '10mm', fileName: fileName || (paies.length === 1 ? `Bulletin-${paies[0].numero}` : `Bulletins-paie-${paies[0].mois}`) });
    }
    
    Object.assign(exports, { moisLabel, bulletinHtml, BULLETIN_CSS, printBulletins });
  };
  factories['./modules/paie-views.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, formatDateFr, todayISO } = require("./utils.js");
    const { can } = require("./auth.js");
    const { CATEGORIES } = require("./classes.js");
    const { CONTRATS, STATUTS_EMPLOYE, MODES_REMUNERATION, nomEmploye, typeOf, isEnseignant, libelleAffectation, estPayeALHeure, affectationsHorairesDuMois, heuresDuMois, heuresVerrouillees, remunerationDefinie } = require("./personnel.js");
    const { STATUTS_PAIE, calculAffiche, syntheseMois, recapAnnuel, anneePourMois } = require("./paie.js");
    const { programmeDeClasse } = require("./programme.js");
    const { STATUTS_AVANCE, MODES_REMBOURSEMENT, soldeAvance, totalPreleve, totalExceptionnel, construireEcheancier } = require("./avances.js");
    const { moisLabel } = require("./bulletin-paie.js");
    const { regleArrondi } = require("./arrondi.js");
    const { groupedBars, donut, COLORS } = require("./charts.js");
    // État d'affichage des pages de paie (mémorisé avec le reste de l'interface)
    const paieView = {
      mois: todayISO().slice(0, 7), search: '', statut: '', detailId: 0,
      personnelSearch: '', personnelType: '', personnelStatut: 'actif',
      affAnnee: 0, affEnseignant: 0, affEmploye: 0, affClasses: [], affMatieres: [], affLignes: [], affSalle: '', remEmploye: 0,
      avanceStatut: 'en_cours', rapType: 'mensuel', rapAnnee: 0, rapEmploye: 0
    };
    
    const PALETTE = ['#7c3aed', '#f97316', '#16a34a', '#0ea5e9', '#d97706', '#9ca3af', '#db2777', '#0891b2'];
    const BADGE_PAIE = { brouillon: 'neutral', validee: 'warning', payee: 'ok', annulee: 'danger' };
    const BADGE_AVANCE = { demandee: 'info', approuvee: 'warning', refusee: 'danger', versee: 'warning', soldee: 'ok', annulee: 'neutral' };
    const opt = (value, label, selected) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    const devise = (state) => escapeHtml(state.config.devise);
    const money = (state, v) => `${formatMoney(v)} ${devise(state)}`;
    const btn = (action, label, cls = '') => `<button type="button" class="action-btn ${cls}" data-action="${action}">${label}</button>`;
    
    // ───────────────────────────── Tableau de bord ─────────────────────────────
    function renderPaieDashboard(state) {
      const section = document.getElementById('paie-dashboard');
      if (!section) return;
      const mois = paieView.mois;
      const actifs = state.personnel.filter((e) => e.statut === 'actif');
      const m = syntheseMois(state, mois);
      const anneeScolaire = anneePourMois(state, mois);
      const annee = anneeScolaire?.annee || mois.slice(0, 4);
      const recap = recapAnnuel(state, anneeScolaire ? anneeScolaire.id : mois.slice(0, 4));
      const avancesEnCours = state.avances.filter((a) => a.statut === 'versee');
      const demandes = state.avances.filter((a) => a.statut === 'demandee' || a.statut === 'approuvee');
      const parType = state.typesEmploye.map((t, i) => ({ label: t.libelle, value: actifs.filter((e) => e.typeEmployeId === t.id).length, color: PALETTE[i % PALETTE.length] })).filter((x) => x.value);
      const sansPaie = actifs.filter((e) => !m.paies.some((x) => x.paie.employeId === e.id));
      const dans30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();
      const cddFin = actifs.filter((e) => e.contrat?.fin && e.contrat.fin <= dans30);
      const enseignantsSansAffectation = actifs.filter((e) => isEnseignant(state, e) && !state.affectations.some((a) => a.employeId === e.id && a.actif));
      const sansRemuneration = actifs.filter((e) => !remunerationDefinie(e));
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Tableau de bord de la paie</h2></div>
          <label class="inline-filter">Mois <input type="month" data-pv="mois" value="${escapeHtml(mois)}" max="${todayISO().slice(0, 7)}" /></label></div>
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Effectif actif</span><strong>${actifs.length}</strong><small class="meta">${state.personnel.length} fiche(s) au total</small></div></article>
          <article class="stat-card accent-orange"><div><span>Masse salariale brute — ${escapeHtml(moisLabel(mois))}</span><strong>${money(state, m.brut)}</strong><small class="meta">Net : ${money(state, m.net)}</small></div></article>
          <article class="stat-card accent-green"><div><span>Payé ce mois</span><strong>${money(state, m.paye)}</strong></div></article>
          <article class="stat-card accent-red"><div><span>En attente de paiement</span><strong>${money(state, m.aPayer)}</strong><small class="meta">${m.brouillons} brouillon(s) · ${sansPaie.length} sans paie préparée</small></div></article>
        </div>
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Net de l’année ${escapeHtml(annee)} (validé)</span><strong>${money(state, recap.total.net)}</strong></div></article>
          <article class="stat-card accent-green"><div><span>Payé en ${escapeHtml(annee)}</span><strong>${money(state, recap.total.paye)}</strong></div></article>
          <article class="stat-card accent-orange"><div><span>Avances en cours</span><strong>${money(state, avancesEnCours.reduce((s, a) => s + soldeAvance(a), 0))}</strong><small class="meta">${avancesEnCours.length} avance(s) · ${demandes.length} à traiter</small></div></article>
          <article class="stat-card accent-red"><div><span>Retenues + avances du mois</span><strong>${money(state, m.retenues + m.avances)}</strong></div></article>
        </div>
        <div class="chart-grid">
          <div class="panel"><div class="panel-header"><h3>Masse salariale ${escapeHtml(annee)}</h3>
            <ul class="legend inline"><li><i style="background:${COLORS.attendu}"></i>Brut</li><li><i style="background:${COLORS.encaisse}"></i>Net payé</li></ul></div>
            ${groupedBars(recap.mois.map((x) => ({ label: `${moisLabel(x.mois).slice(0, 4)}.`, brut: x.brut, paye: x.paye })), state.config.devise, [{ key: 'brut', name: 'Brut', color: COLORS.attendu }, { key: 'paye', name: 'Net payé', color: COLORS.encaisse }])}</div>
          <div class="panel"><div class="panel-header"><h3>Effectif par type d’employé</h3></div>${parType.length ? donut(parType, 'employés') : '<p class="meta">Aucun employé actif.</p>'}</div>
        </div>
        <div class="panel"><div class="panel-header"><h3>Points d’attention</h3></div>
          <ul class="list-stack plain">
            ${sansPaie.length ? `<li class="list-item"><span>${sansPaie.length} employé(s) actif(s) sans paie préparée pour ${escapeHtml(moisLabel(mois))}</span><button class="action-btn" data-nav="paie">Préparer la paie</button></li>` : ''}
            ${demandes.length ? `<li class="list-item"><span>${demandes.length} avance(s) en attente d’approbation ou de versement</span><button class="action-btn" data-nav="avances">Voir les avances</button></li>` : ''}
            ${cddFin.map((e) => `<li class="list-item"><span>Contrat de ${escapeHtml(nomEmploye(e))} se terminant le ${escapeHtml(formatDateFr(e.contrat.fin))}</span><button class="action-btn" data-action="employe:view:${e.id}">Fiche</button></li>`).join('')}
            ${enseignantsSansAffectation.map((e) => `<li class="list-item"><span>Enseignant sans affectation active : ${escapeHtml(nomEmploye(e))}</span><button class="action-btn" data-nav="affectations">Affecter</button></li>`).join('')}
            ${sansRemuneration.map((e) => `<li class="list-item"><span>Rémunération à définir : ${escapeHtml(nomEmploye(e))}</span><button class="action-btn" data-action="remuneration:edit:${e.id}">Définir</button></li>`).join('')}
            ${!sansPaie.length && !demandes.length && !cddFin.length && !enseignantsSansAffectation.length && !sansRemuneration.length ? '<li class="meta">Rien à signaler.</li>' : ''}
          </ul></div>`;
    }
    
    // ───────────────────────────── Personnel ─────────────────────────────
    function remunerationHtml(state, e) {
      const r = e.remuneration;
      if (!remunerationDefinie(e)) return '<span class="badge warning">À définir</span>';
      return r.mode === 'horaire' ? `${money(state, r.tauxHoraire)} / heure<div class="meta">Payé à l’heure</div>` : `${money(state, r.salaireBase)} / mois`;
    }
    
    // Procédure de paie du personnel : rappel des 4 étapes en tête des pages concernées
    function procedurePaieHtml(state, courante) {
      const actifs = state.personnel.filter((e) => e.statut === 'actif');
      const etapes = [
        { n: 1, page: 'personnel', t: 'Fiche employé', d: `${actifs.length} employé(s) actif(s)` },
        { n: 2, page: 'affectations', t: 'Affectation', d: 'enseignants : classes et matières' },
        { n: 3, page: 'remunerations', t: 'Rémunération', d: `${actifs.filter((e) => !remunerationDefinie(e)).length} à définir` },
        { n: 4, page: 'paie', t: 'Paie de chaque mois', d: 'heures, primes, validation, paiement' }
      ];
      return `<ol class="passage-steps paie-steps">${etapes.map((e) => `<li class="${e.n === courante ? 'current' : ''}"><span>${e.n}</span><div><b>${e.n === courante ? e.t : `<button type="button" class="link-btn" data-nav="${e.page}">${e.t}</button>`}</b><small>${e.d}</small></div></li>`).join('')}</ol>`;
    }
    
    // ───────────────────────────── Rémunérations ─────────────────────────────
    // Définies une fois par employé (puis modifiées si besoin), séparément de la fiche : salaire mensuel ou tarif
    // horaire (enseignants), prime fixe. Toute modification est historisée et soumise à l'administrateur.
    function remunerationForm(state) {
      const actifs = state.personnel.filter((e) => e.statut === 'actif').sort((a, b) => Number(remunerationDefinie(a)) - Number(remunerationDefinie(b)) || a.nom.localeCompare(b.nom, 'fr'));
      const e = state.personnel.find((x) => x.id === Number(paieView.remEmploye)) || null;
      const r = e?.remuneration || {};
      const mode = r.mode === 'horaire' ? 'horaire' : 'fixe';
      const enseignant = e ? isEnseignant(state, e) : false;
      return `<form class="form-grid compact" data-form="remuneration" autocomplete="off">
        <label class="span-two">Employé <select name="employeId" data-rem-employe required><option value="">— Choisir —</option>${actifs.map((x) => opt(x.id, `${nomEmploye(x)} (${x.matricule}) — ${typeOf(state, x)?.libelle || ''}${remunerationDefinie(x) ? '' : ' · à définir'}`, paieView.remEmploye)).join('')}</select></label>
        ${e ? `<label>Mode de rémunération <select name="mode" data-pe-mode>${opt('fixe', MODES_REMUNERATION.fixe, mode)}${enseignant ? opt('horaire', `${MODES_REMUNERATION.horaire} (enseignant collège / lycée)`, mode) : ''}</select></label>
        <label data-mode-field="fixe" ${mode === 'fixe' ? '' : 'hidden'}>Salaire mensuel <input name="salaireBase" type="number" min="0" step="1" value="${escapeHtml(r.salaireBase || '')}" /></label>
        <label data-mode-field="horaire" ${mode === 'horaire' ? '' : 'hidden'}>Tarif horaire <input name="tauxHoraire" type="number" min="0" step="1" value="${escapeHtml(r.tauxHoraire || '')}" placeholder="Montant payé par heure" /></label>
        <label>Prime fixe mensuelle <input name="primeFixe" type="number" min="0" step="1" value="${escapeHtml(r.primeFixe || 0)}" /></label>
        <label>Libellé de la prime <input name="libellePrime" type="text" value="${escapeHtml(r.libellePrime || '')}" placeholder="Primes et indemnités" /></label>
        ${remunerationDefinie(e) ? '<label class="span-two">Motif du changement <input name="motif" type="text" placeholder="Ex : augmentation annuelle, nouveau contrat…" /></label>' : ''}
        <p class="meta span-all">${enseignant ? 'Payé à l’heure : le salaire de chaque mois = heures dispensées (saisies dans Paie mensuelle) × tarif horaire. ' : ''}La modification nécessite l’autorisation d’un administrateur ; elle est historisée et ne change jamais une paie déjà validée.</p>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">${remunerationDefinie(e) ? 'Enregistrer la modification' : 'Définir la rémunération'}</button><button type="button" class="secondary-btn" data-action="remuneration:clear:0">Annuler</button></div>` : '<p class="meta span-all">Choisissez un employé : sa rémunération actuelle s’affiche pour être définie ou modifiée.</p>'}
      </form>`;
    }
    
    function renderRemunerations(state) {
      const section = document.getElementById('remunerations');
      if (!section) return;
      const actifs = state.personnel.filter((e) => e.statut === 'actif');
      const aDefinir = actifs.filter((e) => !remunerationDefinie(e));
      const fixes = actifs.filter((e) => remunerationDefinie(e) && e.remuneration.mode === 'fixe');
      const horaires = actifs.filter((e) => remunerationDefinie(e) && e.remuneration.mode === 'horaire');
      const masse = fixes.reduce((s, e) => s + Number(e.remuneration.salaireBase || 0) + Number(e.remuneration.primeFixe || 0), 0);
      const derniere = (e) => [...(e.historique || [])].reverse().find((h) => h.type === 'remuneration');
      const list = [...actifs].sort((a, b) => Number(remunerationDefinie(a)) - Number(remunerationDefinie(b)) || a.nom.localeCompare(b.nom, 'fr'));
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Rémunérations</h2></div><span class="meta">Étape 3 : conditions de rémunération de chaque employé</span></div>
        ${procedurePaieHtml(state, 3)}
        <div class="stats-grid">
          <article class="stat-card ${aDefinir.length ? 'accent-red' : 'accent-green'}"><div><span>Rémunérations à définir</span><strong>${aDefinir.length}</strong><small class="meta">sur ${actifs.length} employé(s) actif(s)</small></div></article>
          <article class="stat-card accent-purple"><div><span>Salaires mensuels</span><strong>${fixes.length}</strong><small class="meta">${money(state, masse)} par mois (primes fixes comprises)</small></div></article>
          <article class="stat-card accent-orange"><div><span>Enseignants payés à l’heure</span><strong>${horaires.length}</strong><small class="meta">montant variable selon les heures du mois</small></div></article>
        </div>
        ${can('write') ? `<div class="panel section-form" id="remuneration-form"><div class="panel-header"><h3>Définir ou modifier une rémunération</h3><span class="meta">Autorisation de l’administrateur</span></div>${remunerationForm(state)}</div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Rémunérations du personnel actif</h3><span class="meta">Montants de référence utilisés pour préparer la paie de chaque mois</span></div>
          <div class="table-wrap"><table class="data-list" data-list="remunerations" data-list-title="Rémunérations du personnel">
            <thead><tr><th>Matricule</th><th>Employé</th><th>Type · fonction</th><th>Mode</th><th class="num">Montant de référence</th><th class="num">Prime fixe</th><th>Dernière modification</th><th>Actions</th></tr></thead>
            <tbody>${list.map((e) => { const h = derniere(e); const r = e.remuneration; const ok = remunerationDefinie(e); return `<tr>
              <td>${escapeHtml(e.matricule)}</td><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(typeOf(state, e)?.libelle || '—')}<div class="meta">${escapeHtml(e.fonction)}</div></td>
              <td>${ok ? escapeHtml(MODES_REMUNERATION[r.mode]) : '<span class="badge warning">À définir</span>'}</td>
              <td class="num">${ok ? (r.mode === 'horaire' ? `${formatMoney(r.tauxHoraire)} / h` : formatMoney(r.salaireBase)) : '—'}</td><td class="num">${ok && r.primeFixe ? formatMoney(r.primeFixe) : '—'}</td>
              <td>${h ? `${escapeHtml(new Date(h.horodatage).toLocaleDateString('fr-FR'))}<div class="meta">${escapeHtml(h.par || '—')}${h.motif ? ` · ${escapeHtml(h.motif)}` : ''}</div>` : '—'}</td>
              <td>${can('write') ? btn(`remuneration:edit:${e.id}`, ok ? 'Modifier' : 'Définir', ok ? '' : 'primary') : ''}${btn(`employe:view:${e.id}`, 'Historique')}</td></tr>`; }).join('') || '<tr><td colspan="8">Aucun employé actif : enregistrez d’abord les fiches dans « Personnel ».</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    // Fiche employé : n'affiche que le champ du mode choisi (salaire mensuel ou tarif horaire)
    function syncModeRemuneration(form) {
      const mode = form?.querySelector('[name="mode"]')?.value || 'fixe';
      form?.querySelectorAll('[data-mode-field]').forEach((el) => { el.hidden = el.dataset.modeField !== mode; });
    }
    
    function employeForm(state) {
      const types = state.typesEmploye.filter((t) => t.actif);
      return `<form class="form-grid compact" data-form="employe" autocomplete="off">
        <p class="meta span-all form-section-title">Identité et contacts</p>
        <label>Matricule <input name="matricule" type="text" placeholder="EMP-AAAA-NNNN (automatique)" /></label>
        <label>Prénom <input name="prenom" type="text" required /></label>
        <label>Nom <input name="nom" type="text" required /></label>
        <label>Sexe <select name="sexe"><option value="M">Masculin</option><option value="F">Féminin</option></select></label>
        <label>Date de naissance <input name="dateNaissance" type="date" /></label>
        <label>Téléphone <input name="telephone" type="tel" /></label>
        <label>E-mail <input name="email" type="email" /></label>
        <label>Adresse <input name="adresse" type="text" /></label>
        <label>Photo (300 Ko max.) <input name="photo" type="file" accept="image/*" /></label>
        <p class="meta span-all form-section-title">Poste et contrat</p>
        <label>Type d’employé <select name="typeEmployeId" required>${types.map((t) => opt(t.id, t.libelle, '')).join('')}</select></label>
        <label>Fonction <input name="fonction" type="text" placeholder="Par défaut : le type d’employé" /></label>
        <label>Contrat <select name="contratType">${Object.entries(CONTRATS).map(([k, v]) => opt(k, v, 'cdi')).join('')}</select></label>
        <label>Début du contrat <input name="contratDebut" type="date" /></label>
        <label>Fin du contrat <input name="contratFin" type="date" /></label>
        <label>Date d’embauche <input name="dateEmbauche" type="date" value="${todayISO()}" /></label>
        <label>Statut <select name="statut">${Object.entries(STATUTS_EMPLOYE).map(([k, v]) => opt(k, v, 'actif')).join('')}</select></label>
        <p class="meta span-all">La fiche ne contient que les informations administratives. Étapes suivantes : affectation (enseignants), puis <b>Rémunérations</b> (salaire mensuel ou tarif horaire, fixé par l’administrateur), puis chaque mois <b>Paie mensuelle</b>.</p>
        <div class="form-actions span-all"><button type="submit" class="primary-btn" data-submit-label>Enregistrer l’employé</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
      </form>`;
    }
    
    function renderPersonnel(state) {
      const section = document.getElementById('personnel');
      if (!section) return;
      const q = paieView.personnelSearch.trim().toLocaleLowerCase('fr');
      const list = state.personnel.filter((e) => (!paieView.personnelType || e.typeEmployeId === Number(paieView.personnelType)) && (!paieView.personnelStatut || e.statut === paieView.personnelStatut)
        && (!q || `${e.matricule} ${e.prenom} ${e.nom} ${e.fonction} ${e.telephone}`.toLocaleLowerCase('fr').includes(q)));
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Personnel</h2></div><span class="meta">${state.personnel.length} fiche(s)</span></div>
        ${procedurePaieHtml(state, 1)}
        ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Fiche employé</h3><span class="meta">Identité, poste et contrat — la rémunération se définit à l’étape suivante</span></div>${employeForm(state)}</div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Liste du personnel</h3></div>
          <div class="advanced-search">
            <label>Recherche <input type="search" data-pv="personnelSearch" value="${escapeHtml(paieView.personnelSearch)}" placeholder="Nom, matricule, fonction…" /></label>
            <label>Type <select data-pv="personnelType"><option value="">Tous</option>${state.typesEmploye.map((t) => opt(t.id, t.libelle, paieView.personnelType)).join('')}</select></label>
            <label>Statut <select data-pv="personnelStatut"><option value="">Tous</option>${Object.entries(STATUTS_EMPLOYE).map(([k, v]) => opt(k, v, paieView.personnelStatut)).join('')}</select></label>
          </div>
          <div class="table-wrap"><table class="data-list" data-list="personnel" data-list-title="Liste du personnel" data-list-add="#personnel form[data-form=employe]">
            <thead><tr><th></th><th>Matricule</th><th>Employé</th><th>Type · fonction</th><th>Contrat</th><th>Rémunération</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${list.map((e) => `<tr>
              <td>${e.photo ? `<img class="emp-photo" src="${escapeHtml(e.photo)}" alt="" />` : `<span class="emp-photo emp-initiales">${escapeHtml(`${e.prenom[0] || ''}${e.nom[0] || ''}`)}</span>`}</td>
              <td><b>${escapeHtml(e.matricule)}</b></td><td>${escapeHtml(nomEmploye(e))}<div class="meta">${escapeHtml(e.telephone || e.email || '')}</div></td>
              <td>${escapeHtml(typeOf(state, e)?.libelle || '—')}<div class="meta">${escapeHtml(e.fonction)}</div></td>
              <td>${escapeHtml(CONTRATS[e.contrat.type])}<div class="meta">${escapeHtml(formatDateFr(e.contrat.debut))}${e.contrat.fin ? ` → ${escapeHtml(formatDateFr(e.contrat.fin))}` : ''}</div></td>
              <td>${remunerationHtml(state, e)}${e.remuneration.primeFixe ? `<div class="meta">+ ${money(state, e.remuneration.primeFixe)} de primes</div>` : ''}</td>
              <td><span class="badge ${e.statut === 'actif' ? 'ok' : e.statut === 'suspendu' ? 'warning' : 'neutral'}">${STATUTS_EMPLOYE[e.statut]}</span></td>
              <td>${btn(`employe:view:${e.id}`, 'Fiche')}${can('write') ? btn(`employe:edit:${e.id}`, 'Modifier') + btn(`remuneration:edit:${e.id}`, remunerationDefinie(e) ? 'Rémunération' : 'Définir la rémunération', remunerationDefinie(e) ? '' : 'primary') : ''}</td></tr>`).join('') || '<tr><td colspan="8">Aucun employé pour cette sélection.</td></tr>'}</tbody>
          </table></div>
        </div>
        <div class="panel">
          <div class="panel-header"><h3>Types d’employés</h3><span class="meta">Personnalisables ; le type « enseignant » ouvre les affectations</span></div>
          <div class="chip-list">${state.typesEmploye.map((t) => `<span class="type-chip ${t.actif ? '' : 'inactive'}">${escapeHtml(t.libelle)}${t.enseignant ? ' <small>enseignant</small>' : ''}${can('write') ? ` <button type="button" class="link-btn" data-action="typeemploye:toggle:${t.id}">${t.actif ? 'désactiver' : 'réactiver'}</button>` : ''}</span>`).join('')}</div>
          ${can('write') ? `<form class="form-grid compact" data-form="type-employe" autocomplete="off">
            <label>Nouveau type <input name="libelle" type="text" required placeholder="Ex : Chauffeur, Cuisinier…" /></label>
            <label class="check-row"><input type="checkbox" name="enseignant" /> Fonction d’enseignement</label>
            <div class="form-actions"><button type="submit" class="secondary-btn">Ajouter le type</button></div></form>` : ''}
        </div>`;
    }
    
    // Fiche détaillée : identité, historique (contrats, salaires, fonctions), affectations, paies, avances
    function showEmployeDetail(state, id) {
      const e = state.personnel.find((x) => x.id === Number(id));
      const root = document.getElementById('modal-root');
      if (!e || !root) return false;
      const paies = state.paies.filter((p) => p.employeId === e.id).sort((a, b) => b.mois.localeCompare(a.mois) || b.id - a.id);
      const affs = state.affectations.filter((a) => a.employeId === e.id);
      const avances = state.avances.filter((a) => a.employeId === e.id);
      const heures = (state.heuresRealisees || []).filter((h) => h.employeId === e.id && Array.isArray(h.lignes)).sort((a, b) => b.mois.localeCompare(a.mois));
      const fmtHist = (h) => (h.type === 'creation' ? h.detail : `${{ remuneration: 'Rémunération', fonction: 'Fonction', contrat: 'Contrat', type: 'Type', statut: 'Statut' }[h.type] || h.type} : ${h.avant} → ${h.apres}`);
      root.innerHTML = `<div class="modal-backdrop" data-modal-close><section class="student-modal" role="dialog" aria-modal="true">
        <header class="modal-header"><div class="emp-head">${e.photo ? `<img class="emp-photo large" src="${escapeHtml(e.photo)}" alt="" />` : ''}<div><span class="eyebrow">${escapeHtml(e.matricule)}</span><h2>${escapeHtml(nomEmploye(e))}</h2>
          <span class="meta">${escapeHtml(e.fonction)} · ${escapeHtml(CONTRATS[e.contrat.type])} · ${STATUTS_EMPLOYE[e.statut]}</span></div></div>
          <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
        <div class="profile-section"><div class="profile-grid">
          <div class="profile-metric"><span>${e.remuneration.mode === 'horaire' ? 'Tarif horaire' : 'Salaire mensuel'}</span><strong>${e.remuneration.mode === 'horaire' ? (e.remuneration.tauxHoraire ? `${money(state, e.remuneration.tauxHoraire)} / h` : 'À définir') : (e.remuneration.salaireBase ? money(state, e.remuneration.salaireBase) : 'À définir')}</strong></div>
          <div class="profile-metric"><span>Primes fixes</span><strong>${money(state, e.remuneration.primeFixe)}</strong></div>
          <div class="profile-metric"><span>Solde des avances</span><strong>${money(state, avances.filter((a) => a.statut === 'versee').reduce((s, a) => s + soldeAvance(a), 0))}</strong></div></div></div>
        <div class="profile-section"><h3>Historique (contrats, salaires, fonctions)</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Modification</th><th>Par</th></tr></thead>
          <tbody>${[...e.historique].reverse().map((h) => `<tr><td>${escapeHtml(new Date(h.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(fmtHist(h))}</td><td>${escapeHtml(h.par || '—')}</td></tr>`).join('')}</tbody></table></div></div>
        ${heures.length ? `<div class="profile-section"><h3>Heures dispensées par mois</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th>Détail</th><th class="num">Heures</th><th class="num">Tarif</th><th>Saisies</th></tr></thead>
          <tbody>${heures.map((h) => `<tr><td>${escapeHtml(moisLabel(h.mois))}</td><td>${escapeHtml(h.lignes.map((l) => `${l.libelle} : ${l.heures} h`).join(' ; ') || '—')}</td><td class="num">${h.totalHeures}</td><td class="num">${formatMoney(h.tauxHoraire)}</td>
            <td>${h.historique.map((x) => `<div class="meta">${escapeHtml(new Date(x.horodatage).toLocaleString('fr-FR'))} · ${escapeHtml(x.par || '—')} : ${escapeHtml(x.avant ? `${x.avant} → ${x.apres}` : x.apres)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${affs.length ? `<div class="profile-section"><h3>Affectations (toutes années)</h3><div class="table-wrap"><table><thead><tr><th>Année</th><th>Affectation</th><th>État</th></tr></thead>
          <tbody>${affs.map((a) => `<tr><td>${escapeHtml(state.annees.find((y) => y.id === a.anneeId)?.annee || '—')}</td><td>${escapeHtml(libelleAffectation(state, a))}</td><td>${a.actif ? 'Active' : `Clôturée le ${escapeHtml(formatDateFr(a.dateFin))}`}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="profile-section"><h3>Paies</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th>N°</th><th>Brut</th><th>Net</th><th>Statut</th><th></th></tr></thead>
          <tbody>${paies.map((p) => { const c = calculAffiche(state, p); return `<tr><td>${escapeHtml(moisLabel(p.mois))}</td><td>${escapeHtml(p.numero || '—')}</td><td>${money(state, c?.brut)}</td><td>${money(state, c?.net)}</td><td><span class="badge ${BADGE_PAIE[p.statut]}">${STATUTS_PAIE[p.statut]}</span></td><td>${p.statut === 'validee' || p.statut === 'payee' ? btn(`paie:bulletin:${p.id}`, 'Bulletin') : ''}</td></tr>`; }).join('') || '<tr><td colspan="6">Aucune paie.</td></tr>'}</tbody></table></div></div>
      </section></div>`;
      return true;
    }
    
    // ───────────────────────────── Affectations ─────────────────────────────
    // Enseignant et année choisis une fois ; primaire : titulaire d'une classe ; collège / lycée : on coche des classes,
    // les matières proposées sont celles de leur programme, puis les lignes (classe × matière) sont vérifiées et
    // ajustées (salle, retrait) avant d'être enregistrées toutes ensemble.
    const lignesAffectation = () => (Array.isArray(paieView.affLignes) ? paieView.affLignes : []);
    
    // Conflits d'une ligne avec les affectations actives de l'année
    function etatLigneAffectation(state, anneeId, employeId, ligne) {
      const actives = state.affectations.filter((a) => a.actif && a.anneeId === anneeId && a.classeId === Number(ligne.classeId) && Number(a.matiereId || 0) === Number(ligne.matiereId || 0));
      if (actives.some((a) => a.employeId === employeId)) return { ok: false, texte: 'Déjà enregistrée pour cet enseignant' };
      const autre = actives.find((a) => a.employeId !== employeId);
      if (autre) return { ok: false, texte: `Déjà assurée par ${nomEmploye(state.personnel.find((e) => e.id === autre.employeId))}` };
      return { ok: true, texte: 'À enregistrer' };
    }
    
    function affectationFormHtml(state) {
      const anneeId = Number(paieView.affAnnee || state.anneeActiveId);
      const enseignants = state.personnel.filter((e) => e.statut === 'actif' && isEnseignant(state, e));
      const choisi = enseignants.find((e) => e.id === Number(paieView.affEmploye)) || null;
      const classesAnnee = state.classes.filter((c) => c.anneeId === anneeId && c.active !== false);
      const primaires = classesAnnee.filter((c) => c.categorie === 'Primaire');
      const secondaires = classesAnnee.filter((c) => c.categorie !== 'Primaire');
      const cochees = (paieView.affClasses || []).map(Number).filter((id) => secondaires.some((c) => c.id === id));
      const proposees = new Map();
      cochees.forEach((cid) => programmeDeClasse(state, cid).forEach((p) => {
        const g = proposees.get(p.matiereId) || { matiere: p.matiere, classes: [] };
        g.classes.push(state.classes.find((c) => c.id === cid)?.nom);
        proposees.set(p.matiereId, g);
      }));
      const sansProgramme = cochees.filter((cid) => !programmeDeClasse(state, cid).length).map((cid) => state.classes.find((c) => c.id === cid)?.nom);
      const matieresCochees = (paieView.affMatieres || []).map(Number);
      const lignes = lignesAffectation();
      const salles = [...new Set(state.affectations.map((a) => a.salle).filter(Boolean))];
      const titulaire = primaires.map((c) => ({ c, t: state.affectations.find((a) => a.actif && a.anneeId === anneeId && a.classeId === c.id && !a.matiereId) }));
      const aEnregistrer = lignes.filter((l) => etatLigneAffectation(state, anneeId, Number(paieView.affEmploye), l).ok).length;
      return `${choisi ? `<div class="prefill-banner" role="status"><div><b>${escapeHtml(nomEmploye(choisi))}</b> · ${escapeHtml(choisi.matricule)} · ${escapeHtml(choisi.fonction)}${choisi.remuneration.mode === 'horaire' ? ` · payé à l’heure (${formatMoney(choisi.remuneration.tauxHoraire)} ${devise(state)} / h)` : choisi.remuneration.salaireBase ? ` · ${formatMoney(choisi.remuneration.salaireBase)} ${devise(state)} / mois` : ''}</div>
          <span class="meta">Enseignant présélectionné : choisissez sa classe (primaire) ou cochez ses classes et matières (collège / lycée), puis enregistrez toutes les lignes en une fois.</span>
          <span><button type="button" class="link-btn" data-action="affectation:clear:0">Choisir un autre enseignant</button>${state.affectations.some((a) => a.employeId === choisi.id && a.actif) ? ` · <button type="button" class="secondary-btn small-btn" data-action="remuneration:edit:${choisi.id}">Étape suivante : ${remunerationDefinie(choisi) ? 'vérifier' : 'définir'} sa rémunération →</button>` : ''}</span></div>` : ''}
        <div class="aff-builder">
          <div class="form-grid compact">
            <label>Année scolaire <select data-af="affAnnee">${state.annees.map((a) => opt(a.id, a.annee, anneeId)).join('')}</select></label>
            <label>Enseignant <select data-af="affEmploye"><option value="">— Choisir —</option>${enseignants.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, paieView.affEmploye)).join('')}</select></label>
          </div>
          <fieldset class="aff-block"><legend>Primaire — titulaire d’une classe</legend>
            ${primaires.length ? `<div class="form-grid compact">
              <label>Classe <select data-af-primaire><option value="">— Choisir —</option>${titulaire.map(({ c, t }) => opt(c.id, `${c.nom}${t ? ` — titulaire : ${nomEmploye(state.personnel.find((e) => e.id === t.employeId))}` : ''}`, '')).join('')}</select></label>
              <div class="form-actions"><button type="button" class="secondary-btn" data-action="affectation:titulaire">Affecter comme titulaire</button></div></div>
              <p class="meta">Au primaire, un enseignant est titulaire d’une seule classe et chaque classe n’a qu’un titulaire.</p>` : '<p class="meta">Aucune classe de primaire pour cette année.</p>'}
          </fieldset>
          <fieldset class="aff-block"><legend>Collège / Lycée — plusieurs classes, matières et niveaux</legend>
            <p class="aff-step">1. Classes</p>
            <div class="check-grid">${secondaires.map((c) => `<label class="check-chip ${cochees.includes(c.id) ? 'on' : ''}"><input type="checkbox" data-af-classe value="${c.id}" ${cochees.includes(c.id) ? 'checked' : ''} /> ${escapeHtml(c.nom)} <small>${escapeHtml(c.categorie)} · ${programmeDeClasse(state, c.id).length} matière(s)</small></label>`).join('') || '<span class="meta">Aucune classe de collège ou de lycée pour cette année.</span>'}</div>
            ${sansProgramme.length ? `<p class="form-warning">Aucune matière au programme de ${escapeHtml(sansProgramme.join(', '))} : définissez d’abord le programme (Scolarité › Classes › Programme).</p>` : ''}
            <p class="aff-step">2. Matières enseignées <span class="meta">(uniquement celles au programme des classes cochées)</span></p>
            <div class="check-grid">${[...proposees.entries()].sort((a, b) => a[1].matiere.nom.localeCompare(b[1].matiere.nom, 'fr')).map(([id, g]) => `<label class="check-chip ${matieresCochees.includes(id) ? 'on' : ''}"><input type="checkbox" data-af-matiere value="${id}" ${matieresCochees.includes(id) ? 'checked' : ''} /> ${escapeHtml(g.matiere.nom)} <small>${escapeHtml(g.classes.join(', '))}</small></label>`).join('') || '<span class="meta">Cochez une ou plusieurs classes.</span>'}</div>
            <div class="form-grid compact">
              <label>Salle (facultatif) <input data-af="affSalle" type="text" list="aff-salles" value="${escapeHtml(paieView.affSalle || '')}" placeholder="Ex : B12, Labo…" /><datalist id="aff-salles">${salles.map((x) => `<option value="${escapeHtml(x)}"></option>`).join('')}</datalist></label>
              <div class="form-actions"><button type="button" class="secondary-btn" data-action="affectation:ajouter-lignes" ${cochees.length && matieresCochees.length ? '' : 'disabled'}>3. Ajouter les lignes classe × matière</button></div>
            </div>
          </fieldset>
          <div class="aff-lignes">
            <div class="panel-header"><h3>Lignes à enregistrer</h3><span class="meta">${lignes.length} ligne(s) · ${aEnregistrer} valide(s)</span></div>
            <div class="table-wrap"><table><thead><tr><th>Classe</th><th>Niveau</th><th>Matière</th><th>Salle</th><th>Contrôle</th><th></th></tr></thead>
              <tbody>${lignes.map((l, i) => {
                const c = state.classes.find((x) => x.id === Number(l.classeId));
                const etat = etatLigneAffectation(state, anneeId, Number(paieView.affEmploye), l);
                return `<tr><td>${escapeHtml(c?.nom || '—')}</td><td>${escapeHtml(c?.categorie || '—')}</td><td>${escapeHtml(state.matieres.find((m) => m.id === Number(l.matiereId))?.nom || '—')}</td>
                  <td><input class="cell-input" type="text" data-af-ligne-salle="${i}" value="${escapeHtml(l.salle || '')}" list="aff-salles" aria-label="Salle" /></td>
                  <td><span class="badge ${etat.ok ? 'ok' : 'warning'}">${escapeHtml(etat.texte)}</span></td>
                  <td><button type="button" class="action-btn delete" data-action="affectation:retirer-ligne:${i}">Retirer</button></td></tr>`;
              }).join('') || '<tr><td colspan="6">Aucune ligne : cochez des classes et des matières puis « Ajouter les lignes ».</td></tr>'}</tbody></table></div>
            <div class="form-actions"><button type="button" class="primary-btn" data-action="affectation:enregistrer" ${choisi && aEnregistrer ? '' : 'disabled'}>Enregistrer ${aEnregistrer || ''} affectation(s)</button>
              ${lignes.length ? '<button type="button" class="secondary-btn" data-action="affectation:vider">Vider la liste</button>' : ''}</div>
          </div>
        </div>`;
    }
    
    function renderAffectations(state) {
      const section = document.getElementById('affectations');
      if (!section) return;
      if (!paieView.affAnnee) paieView.affAnnee = state.anneeActiveId;
      const list = state.affectations.filter((a) => a.anneeId === Number(paieView.affAnnee) && (!paieView.affEnseignant || a.employeId === Number(paieView.affEnseignant)));
      const enseignants = state.personnel.filter((e) => isEnseignant(state, e));
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Affectations des enseignants</h2></div></div>
        ${procedurePaieHtml(state, 2)}
        ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Nouvelles affectations</h3><span class="meta">Plusieurs classes, matières et niveaux en une seule validation</span></div><div data-aff-form>${affectationFormHtml(state)}</div></div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Affectations de l’année ${escapeHtml(state.annees.find((a) => a.id === Number(paieView.affAnnee))?.annee || '')}</h3><span class="meta">${list.length} affectation(s) · historique conservé par année</span></div>
          <div class="advanced-search"><label>Enseignant <select data-pv="affEnseignant"><option value="">Tous</option>${enseignants.map((e) => opt(e.id, nomEmploye(e), paieView.affEnseignant)).join('')}</select></label></div>
          <div class="table-wrap"><table class="data-list" data-list="affectations" data-list-title="Affectations des enseignants" data-list-add="#affectations .aff-builder">
            <thead><tr><th>Enseignant</th><th>Niveau</th><th>Classe · matière · salle</th><th>Coefficient</th><th>État</th><th>Actions</th></tr></thead>
            <tbody>${list.map((a) => {
              const e = state.personnel.find((x) => x.id === a.employeId);
              const coef = a.matiereId ? programmeDeClasse(state, a.classeId).find((p) => p.matiereId === a.matiereId)?.coefficient : '';
              return `<tr><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(state.classes.find((c) => c.id === a.classeId)?.categorie || '—')}</td><td>${escapeHtml(libelleAffectation(state, a))}</td>
                <td>${coef || '—'}</td><td><span class="badge ${a.actif ? 'ok' : 'neutral'}">${a.actif ? 'Active' : `Clôturée${a.dateFin ? ` le ${escapeHtml(formatDateFr(a.dateFin))}` : ''}`}</span></td>
                <td>${a.actif && can('write') ? btn(`affectation:close:${a.id}`, 'Clôturer', 'delete') : ''}</td></tr>`;
            }).join('') || '<tr><td colspan="6">Aucune affectation pour cette sélection.</td></tr>'}</tbody>
          </table></div>
        </div>
        <p class="meta">Les matières et le programme de chaque classe se gèrent dans <button type="button" class="link-btn" data-nav="classes">Scolarité › Classes</button>.</p>`;
    }
    
    // ───────────────────────────── Paie mensuelle ─────────────────────────────
    function variablesRows(list, kind) {
      const rows = [...list, { libelle: '', montant: '' }];
      return rows.map((l) => `<div class="var-row"><input name="${kind}Libelle" type="text" value="${escapeHtml(l.libelle)}" placeholder="Libellé" /><input name="${kind}Montant" type="number" min="0" step="1" value="${escapeHtml(l.montant)}" placeholder="Montant" /></div>`).join('');
    }
    
    function paieDetailHtml(state, paie) {
      const c = calculAffiche(state, paie);
      const brouillon = paie.statut === 'brouillon';
      const employe = state.personnel.find((e) => e.id === paie.employeId);
      // Enseignant payé à l'heure : une ligne par affectation (heures du mois × tarif horaire)
      const horaire = c.lignes.some((l) => l.type === 'heures') || c.mode === 'horaire';
      const cols = horaire ? '<td></td><td></td>' : '';
      const saisie = c.mode === 'horaire' ? heuresDuMois(state, paie.employeId, paie.mois) : null;
      return `<div class="panel paie-detail" id="paie-detail">
        <div class="panel-header"><h3>${escapeHtml(nomEmploye(c.employe))} — ${escapeHtml(moisLabel(paie.mois))}</h3>
          <span class="badge ${BADGE_PAIE[paie.statut]}">${STATUTS_PAIE[paie.statut]}${paie.numero ? ` · ${escapeHtml(paie.numero)}` : ''}</span></div>
        ${c.alertes.length ? `<div class="form-warning">${c.alertes.map(escapeHtml).join('<br>')}</div>` : ''}
        ${!brouillon ? '<p class="meta">Montants figés à la validation : une modification ultérieure du salaire ou des affectations ne change pas cette paie.</p>' : ''}
        <div class="table-wrap"><table>
          <thead><tr><th>Élément</th>${horaire ? '<th class="num">Heures dispensées</th><th class="num">Tarif horaire</th>' : ''}<th class="num">Montant</th></tr></thead>
          <tbody>${c.lignes.map((l) => (l.type === 'heures'
            ? `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${l.heures}</td><td class="num">${formatMoney(l.taux)}</td><td class="num">${formatMoney(l.montant)}</td></tr>`
            : `<tr><td>${escapeHtml(l.libelle)}</td>${cols}<td class="num">${formatMoney(l.montant)}</td></tr>`)).join('')}
            ${horaire && !c.lignes.length ? `<tr><td colspan="4" class="meta">Aucune heure saisie pour ce mois.</td></tr>` : ''}
            ${c.primes.map((l) => `<tr><td>+ ${escapeHtml(l.libelle)}${l.fixe ? ' <small class="meta">(fiche employé)</small>' : ''}</td>${cols}<td class="num">${formatMoney(l.montant)}</td></tr>`).join('')}
            ${c.retenues.map((l) => `<tr><td>− ${escapeHtml(l.libelle)}${l.fixe ? ' <small class="meta">(ancienne retenue fixe)</small>' : ''}</td>${cols}<td class="num">−${formatMoney(l.montant)}</td></tr>`).join('')}
            ${c.avances.map((a) => `<tr><td>− Remboursement d’avance n°${a.avanceId}${a.reporte ? ` <small class="meta">(dû ${formatMoney(a.du)}, ${formatMoney(a.reporte)} reporté)</small>` : ''}</td>${cols}<td class="num">−${formatMoney(a.montant)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td${horaire ? ' colspan="3"' : ''}>${horaire && c.totalHeures ? `${c.totalHeures} h · ` : ''}Brut ${money(state, c.brut)} · Retenues ${money(state, c.totalRetenues)} · Avances ${money(state, c.totalAvances)} — <b>Net à payer</b></td><td class="num">${money(state, c.net)}</td></tr></tfoot>
        </table></div>
        ${saisie ? `<details class="heures-trace"><summary>Historique des heures de ${escapeHtml(moisLabel(paie.mois))} (${saisie.historique.length} saisie(s))</summary>
          <ul class="list-stack plain">${[...saisie.historique].reverse().map((x) => `<li class="meta">${escapeHtml(new Date(x.horodatage).toLocaleString('fr-FR'))} · ${escapeHtml(x.par || '—')} — ${escapeHtml(x.avant ? `${x.avant} → ${x.apres}` : `saisie : ${x.apres}`)}</li>`).join('')}</ul></details>` : ''}
        ${brouillon && can('write') ? `<form class="form-grid compact" data-form="paie-variables" data-paie="${paie.id}">
          <div><b>Primes du mois</b>${variablesRows(paie.variables.primes, 'prime')}</div>
          <div><b>Autres retenues du mois</b> <small class="meta">(uniquement celles autorisées)</small>${variablesRows(paie.variables.retenues, 'retenue')}</div>
          <div class="form-actions span-all"><button type="submit" class="secondary-btn">Enregistrer et recalculer</button></div></form>` : ''}
        <div class="form-actions">${actionsPaie(paie)}${employe ? btn(`employe:view:${employe.id}`, 'Fiche employé') : ''}</div>
      </div>`;
    }
    
    function actionsPaie(paie) {
      if (!can('write')) return paie.statut === 'validee' || paie.statut === 'payee' ? btn(`paie:bulletin:${paie.id}`, 'Bulletin') : '';
      const parts = [];
      if (paie.statut === 'brouillon') parts.push(btn(`paie:valider:${paie.id}`, 'Valider'));
      if (paie.statut === 'validee') parts.push(btn(`paie:payer:${paie.id}`, 'Marquer payée'));
      if (paie.statut === 'validee' || paie.statut === 'payee') parts.push(btn(`paie:bulletin:${paie.id}`, 'Bulletin'));
      if (paie.statut !== 'annulee') parts.push(btn(`paie:annuler:${paie.id}`, 'Annuler', 'delete'));
      return parts.join('');
    }
    
    // Heures du mois des enseignants payés à l'heure : une saisie par affectation (collège / lycée) et par mois.
    // Enregistrer de nouveau le même mois met à jour la saisie (historique conservé) ; verrouillée après validation.
    function heuresMoisHtml(state, mois) {
      const enseignants = state.personnel.filter((e) => estPayeALHeure(e) && (e.statut === 'actif' || state.paies.some((p) => p.employeId === e.id && p.mois === mois && p.statut !== 'annulee')))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      if (!enseignants.length) return '';
      const editable = can('write');
      const rows = enseignants.map((e) => {
        const saisie = heuresDuMois(state, e.id, mois);
        const verrou = heuresVerrouillees(state, e.id, mois);
        const valeur = (affectationId) => saisie?.lignes.find((l) => l.affectationId === affectationId)?.heures ?? '';
        const lignes = [...affectationsHorairesDuMois(state, e.id, mois).map((a) => ({ id: a.id, libelle: libelleAffectation(state, a) })), { id: 0, libelle: 'Autres heures (hors affectation)' }];
        const input = (l) => `<input class="cell-input heures-input" type="number" min="0" max="300" step="0.5" name="h-${e.id}-${l.id}" value="${escapeHtml(valeur(l.id))}" ${verrou || !editable ? 'disabled' : ''} aria-label="Heures ${escapeHtml(l.libelle)}" />`;
        const total = saisie?.totalHeures || 0;
        return `<tr class="${verrou ? 'row-locked' : ''}"><td><b>${escapeHtml(nomEmploye(e))}</b><div class="meta">${escapeHtml(e.matricule)} · ${money(state, e.remuneration.tauxHoraire)} / h</div></td>
          <td><div class="heures-grid">${lignes.map((l) => `<label class="heures-cell"><span>${escapeHtml(l.libelle)}</span>${input(l)}</label>`).join('')}</div></td>
          <td class="num"><b>${total}</b> h</td><td class="num"><b>${formatMoney(Math.round(total * Number(e.remuneration.tauxHoraire || 0)))}</b></td>
          <td>${verrou ? '<span class="badge ok">Paie validée — verrouillé</span>' : saisie ? `<span class="badge info">Enregistré</span><div class="meta">${saisie.historique.length > 1 ? `${saisie.historique.length - 1} mise(s) à jour · ` : ''}${escapeHtml(new Date(saisie.modifieLe || saisie.saisiLe).toLocaleString('fr-FR'))}</div>` : '<span class="badge warning">À saisir</span>'}</td></tr>`;
      }).join('');
      return `<form class="panel heures-panel" data-form="heures-mois" data-mois="${escapeHtml(mois)}" autocomplete="off">
        <div class="panel-header"><h3>Heures du mois — enseignants payés à l’heure</h3><span class="meta">${escapeHtml(moisLabel(mois))} · une seule saisie par enseignant et par mois</span></div>
        <div class="table-wrap"><table><thead><tr><th>Enseignant</th><th>Heures dispensées par affectation</th><th class="num">Total</th><th class="num">Salaire du mois</th><th>État</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="meta">Le salaire du mois = heures dispensées × tarif horaire de la fiche. Une nouvelle saisie du même mois remplace la précédente et garde la trace de l’ancienne valeur (date, auteur). Une fois la paie validée, les heures sont verrouillées : annulez la paie pour les corriger.</p>
        ${editable ? '<div class="form-actions"><button type="submit" class="primary-btn small-btn">Enregistrer les heures du mois</button></div>' : ''}
      </form>`;
    }
    
    function renderPaieOutput(state) {
      const out = document.getElementById('paie-output');
      if (!out) return;
      const m = syntheseMois(state, paieView.mois);
      const q = paieView.search.trim().toLocaleLowerCase('fr');
      const rows = state.paies.filter((p) => p.mois === paieView.mois && (!paieView.statut || p.statut === paieView.statut)).map((p) => ({ p, c: calculAffiche(state, p) }))
        .filter(({ c }) => !q || `${c.employe.matricule} ${c.employe.prenom} ${c.employe.nom} ${c.employe.fonction}`.toLocaleLowerCase('fr').includes(q))
        .sort((a, b) => a.c.employe.nom.localeCompare(b.c.employe.nom, 'fr'));
      const detail = state.paies.find((p) => p.id === paieView.detailId && p.mois === paieView.mois);
      out.innerHTML = `
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Paies du mois</span><strong>${m.nb}</strong><small class="meta">${m.brouillons} brouillon(s)</small></div></article>
          <article class="stat-card accent-orange"><div><span>Brut</span><strong>${money(state, m.brut)}</strong><small class="meta">Primes ${money(state, m.primes)}</small></div></article>
          <article class="stat-card accent-red"><div><span>Retenues + avances</span><strong>${money(state, m.retenues + m.avances)}</strong></div></article>
          <article class="stat-card accent-green"><div><span>Net (payé / à payer)</span><strong>${money(state, m.net)}</strong><small class="meta">${money(state, m.paye)} payé · ${money(state, m.aPayer)} à payer</small></div></article>
        </div>
        ${heuresMoisHtml(state, paieView.mois)}
        <div class="table-wrap"><table class="data-list" data-list="paies" data-list-title="Paie mensuelle">
          <thead><tr><th>Matricule</th><th>Employé</th><th>Mode</th><th class="num">Brut</th><th class="num">Primes</th><th class="num">Retenues</th><th class="num">Avances</th><th class="num">Net</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>${rows.map(({ p, c }) => `<tr class="${p.statut === 'annulee' ? 'cancelled' : ''} ${p.id === paieView.detailId ? 'row-current' : ''}">
            <td>${escapeHtml(c.employe.matricule)}</td><td>${escapeHtml(nomEmploye(c.employe))}<div class="meta">${escapeHtml(c.employe.fonction)}</div></td><td>${escapeHtml(c.modeLibelle || '')}${c.mode === 'horaire' ? `<div class="meta">${c.totalHeures || 0} h × ${formatMoney(c.tauxHoraire)}</div>` : ''}</td>
            <td class="num">${formatMoney(c.brut)}</td><td class="num">${formatMoney(c.totalPrimes)}</td><td class="num">${formatMoney(c.totalRetenues)}</td><td class="num">${formatMoney(c.totalAvances)}</td><td class="num"><b>${formatMoney(c.net)}</b></td>
            <td><span class="badge ${BADGE_PAIE[p.statut]}">${STATUTS_PAIE[p.statut]}</span>${c.alertes.length && p.statut === 'brouillon' ? ' <span class="badge warning" title="' + escapeHtml(c.alertes.join(' ')) + '">!</span>' : ''}</td>
            <td>${btn(`paie:detail:${p.id}`, 'Détail')}${actionsPaie(p)}</td></tr>`).join('') || '<tr><td colspan="10">Aucune paie pour ce mois : cliquez sur « Préparer la paie du mois ».</td></tr>'}</tbody>
        </table></div>
        ${detail ? paieDetailHtml(state, detail) : ''}`;
    }
    
    function renderPaieMensuelle(state) {
      const section = document.getElementById('paie');
      if (!section) return;
      const brouillons = state.paies.filter((p) => p.mois === paieView.mois && p.statut === 'brouillon').length;
      const imprimables = state.paies.filter((p) => p.mois === paieView.mois && (p.statut === 'validee' || p.statut === 'payee')).length;
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Paie mensuelle</h2></div></div>
        ${procedurePaieHtml(state, 4)}
        ${(() => { const manquantes = state.personnel.filter((e) => e.statut === 'actif' && !remunerationDefinie(e)); return manquantes.length ? `<p class="form-warning">${manquantes.length} employé(s) sans rémunération définie (${escapeHtml(manquantes.slice(0, 4).map(nomEmploye).join(', '))}${manquantes.length > 4 ? '…' : ''}) : leur paie ne pourra pas être validée. <button type="button" class="link-btn" data-nav="remunerations">Définir les rémunérations</button></p>` : ''; })()}
        <div class="panel">
          <div class="advanced-search">
            <label>Mois <input type="month" data-pv="mois" value="${escapeHtml(paieView.mois)}" max="${todayISO().slice(0, 7)}" /></label>
            <label>Recherche <input type="search" data-pv="search" value="${escapeHtml(paieView.search)}" placeholder="Employé, matricule…" /></label>
            <label>Statut <select data-pv="statut"><option value="">Tous</option>${Object.entries(STATUTS_PAIE).map(([k, v]) => opt(k, v, paieView.statut)).join('')}</select></label>
          </div>
          <div class="form-actions report-actions">
            ${can('write') ? '<button class="primary-btn small-btn" data-action="paie:preparer">Préparer la paie du mois</button>' : ''}
            ${can('write') && brouillons ? `<button class="secondary-btn small-btn" data-action="paie:valider-tout">Valider les ${brouillons} brouillon(s)</button>` : ''}
            ${imprimables ? `<button class="secondary-btn small-btn" data-action="paie:bulletins-mois">Imprimer les ${imprimables} bulletin(s) du mois</button>` : ''}
          </div>
          <p class="meta">Brouillon : recalculé automatiquement (salaire mensuel ou heures du mois × tarif horaire, primes, retenues saisies, avances). Validation : montants figés et prélèvements d’avances appliqués (administrateur). Paiement : sortie de caisse enregistrée en dépense « Salaires et indemnités ».</p>
          <div id="paie-output"></div>
        </div>`;
      renderPaieOutput(state);
    }
    
    // ───────────────────────────── Avances sur salaire ─────────────────────────────
    function avancePreviewHtml(state, form) {
      const get = (n) => form.querySelector(`[name="${n}"]`)?.value;
      try {
        const ech = construireEcheancier(get('montantDemande'), get('modeRemboursement'), get('valeur'), get('moisDebut'), regleArrondi(state.config, 'avances'));
        return `<p class="meta">Échéancier proposé : ${ech.map((e) => `${escapeHtml(moisLabel(e.mois))} ${formatMoney(e.montant)}`).join(' · ')} (${ech.length} prélèvement(s), dernière mensualité ajustée)</p>`;
      } catch (error) {
        return `<p class="meta">${escapeHtml(error.message)}</p>`;
      }
    }
    
    function renderAvances(state) {
      const section = document.getElementById('avances');
      if (!section) return;
      const actifs = state.personnel.filter((e) => e.statut !== 'sorti');
      const filtre = paieView.avanceStatut;
      const list = state.avances.filter((a) => (filtre === 'en_cours' ? ['demandee', 'approuvee', 'versee'].includes(a.statut) : !filtre || a.statut === filtre)).sort((a, b) => b.id - a.id);
      const all = state.avances.filter((a) => a.statut === 'versee' || a.statut === 'soldee');
      const next = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Avances sur salaire</h2></div></div>
        <div class="stats-grid">
          <article class="stat-card accent-purple"><div><span>Avances versées</span><strong>${money(state, all.reduce((s, a) => s + a.montantAutorise, 0))}</strong></div></article>
          <article class="stat-card accent-green"><div><span>Remboursé (paie + exceptionnel)</span><strong>${money(state, all.reduce((s, a) => s + totalPreleve(a) + totalExceptionnel(a), 0))}</strong></div></article>
          <article class="stat-card accent-red"><div><span>Solde restant</span><strong>${money(state, all.reduce((s, a) => s + soldeAvance(a), 0))}</strong></div></article>
          <article class="stat-card accent-orange"><div><span>À traiter</span><strong>${state.avances.filter((a) => a.statut === 'demandee' || a.statut === 'approuvee').length}</strong></div></article>
        </div>
        ${can('write') ? `<div class="panel section-form"><div class="panel-header"><h3>Demande d’avance</h3><span class="meta">Approbation et versement par un administrateur</span></div>
          <form class="form-grid compact" data-form="avance" autocomplete="off">
            <label>Employé <select name="employeId" required><option value="">— Choisir —</option>${actifs.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, '')).join('')}</select></label>
            <label>Montant demandé <input name="montantDemande" type="number" min="1" step="1" required data-av /></label>
            <label>Date de la demande <input name="dateDemande" type="date" value="${todayISO()}" max="${todayISO()}" /></label>
            <label>Motif <input name="motif" type="text" /></label>
            <label>Remboursement <select name="modeRemboursement" data-av>${Object.entries(MODES_REMBOURSEMENT).map(([k, v]) => opt(k, v, 'mensualite')).join('')}</select></label>
            <label>Mensualité ou durée (mois) <input name="valeur" type="number" min="1" step="1" required data-av /></label>
            <label>Premier prélèvement <input name="moisDebut" type="month" value="${next}" required data-av /></label>
            <div class="span-all" data-av-preview><p class="meta">Saisissez le montant et le mode : l’échéancier s’affiche ici.</p></div>
            <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer la demande</button></div>
          </form></div>` : ''}
        <div class="panel">
          <div class="panel-header"><h3>Avances</h3></div>
          <div class="advanced-search"><label>Statut <select data-pv="avanceStatut">${[['en_cours', 'En cours (à traiter ou en remboursement)'], ['', 'Toutes'], ...Object.entries(STATUTS_AVANCE)].map(([k, v]) => opt(k, v, filtre)).join('')}</select></label></div>
          <div class="table-wrap"><table class="data-list" data-list="avances" data-list-title="Avances sur salaire" data-list-add="#avances form[data-form=avance]">
            <thead><tr><th>N°</th><th>Employé</th><th>Demande</th><th class="num">Demandé</th><th class="num">Autorisé</th><th>Remboursement</th><th class="num">Remboursé</th><th class="num">Solde</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${list.map((a) => {
              const e = state.personnel.find((x) => x.id === a.employeId);
              const acts = [btn(`avance:detail:${a.id}`, 'Détail')];
              if (can('write')) {
                if (a.statut === 'demandee') acts.push(btn(`avance:approuver:${a.id}`, 'Approuver'), btn(`avance:refuser:${a.id}`, 'Refuser', 'delete'));
                if (a.statut === 'approuvee') acts.push(btn(`avance:verser:${a.id}`, 'Verser'));
                if (a.statut === 'versee') acts.push(btn(`avance:exceptionnel:${a.id}`, 'Remboursement exceptionnel'));
              }
              return `<tr><td>${a.id}</td><td>${escapeHtml(nomEmploye(e))}</td><td>${escapeHtml(formatDateFr(a.dateDemande))}${a.motif ? `<div class="meta">${escapeHtml(a.motif)}</div>` : ''}</td>
                <td class="num">${formatMoney(a.montantDemande)}</td><td class="num">${a.montantAutorise ? formatMoney(a.montantAutorise) : '—'}</td>
                <td>${escapeHtml(MODES_REMBOURSEMENT[a.modeRemboursement] || '')}<div class="meta">${a.echeancier.length ? `${a.echeancier.length} échéance(s) dès ${escapeHtml(moisLabel(a.echeancier[0].mois))}` : ''}</div></td>
                <td class="num">${formatMoney(totalPreleve(a) + totalExceptionnel(a))}</td><td class="num"><b>${formatMoney(soldeAvance(a))}</b></td>
                <td><span class="badge ${BADGE_AVANCE[a.statut]}">${STATUTS_AVANCE[a.statut]}</span></td><td>${acts.join('')}</td></tr>`;
            }).join('') || '<tr><td colspan="10">Aucune avance pour cette sélection.</td></tr>'}</tbody>
          </table></div>
        </div>`;
    }
    
    // Détail d'une avance : échéancier (avec reports), prélèvements et historique complet
    function showAvanceDetail(state, id) {
      const a = state.avances.find((x) => x.id === Number(id));
      const root = document.getElementById('modal-root');
      if (!a || !root) return false;
      const e = state.personnel.find((x) => x.id === a.employeId);
      const STATUT_ECH = { prevue: 'Prévue', prelevee: 'Prélevée', partielle: 'Partielle', reportee: 'Reportée', remboursee: 'Remboursée' };
      root.innerHTML = `<div class="modal-backdrop" data-modal-close><section class="student-modal" role="dialog" aria-modal="true">
        <header class="modal-header"><div><span class="eyebrow">Avance n°${a.id}</span><h2>${escapeHtml(nomEmploye(e))}</h2><span class="meta">${STATUTS_AVANCE[a.statut]} · ${escapeHtml(MODES_REMBOURSEMENT[a.modeRemboursement] || '')}</span></div>
          <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
        <div class="profile-section"><div class="profile-grid">
          <div class="profile-metric"><span>Autorisé</span><strong>${money(state, a.montantAutorise)}</strong></div>
          <div class="profile-metric"><span>Prélevé sur paie</span><strong>${money(state, totalPreleve(a))}</strong></div>
          <div class="profile-metric"><span>Remboursement exceptionnel</span><strong>${money(state, totalExceptionnel(a))}</strong></div>
          <div class="profile-metric"><span>Solde</span><strong>${money(state, soldeAvance(a))}</strong></div></div></div>
        ${a.echeancier.length ? `<div class="profile-section"><h3>Échéancier</h3><div class="table-wrap"><table><thead><tr><th>Mois</th><th class="num">Montant</th><th class="num">Prélevé</th><th>Statut</th><th></th></tr></thead>
          <tbody>${a.echeancier.map((x, i) => `<tr><td>${escapeHtml(moisLabel(x.mois))}${x.origine ? ` <small class="meta">(report de ${escapeHtml(moisLabel(x.origine))})</small>` : ''}</td><td class="num">${formatMoney(x.montant)}</td><td class="num">${formatMoney(x.preleve)}</td><td>${STATUT_ECH[x.statut] || x.statut}</td>
            <td>${a.statut === 'versee' && x.montant - x.preleve > 0 && can('write') ? btn(`avance:reporter:${a.id}:${i}`, 'Reporter') : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="profile-section"><h3>Historique</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th class="num">Montant</th><th>Par</th></tr></thead>
          <tbody>${[...(a.historique || [])].reverse().map((h) => `<tr><td>${escapeHtml(new Date(h.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(h.detail)}</td><td class="num">${h.montant ? formatMoney(h.montant) : ''}</td><td>${escapeHtml(h.par || '—')}</td></tr>`).join('')}</tbody></table></div></div>
      </section></div>`;
      return true;
    }
    
    // ───────────────────────────── Bulletins et récapitulatifs ─────────────────────────────
    const RAPPORTS_PAIE = [['mensuel', 'Récapitulatif mensuel'], ['annuel', 'Récapitulatif de l’année scolaire'], ['individuel', 'Récapitulatif individuel (année scolaire)']];
    
    // Données d'un rapport de paie (tableau + totaux), réutilisées pour l'écran, l'Excel et le PDF
    function rapportPaie(state) {
      const v = paieView;
      if (v.rapType === 'mensuel') {
        const m = syntheseMois(state, v.mois);
        const rows = m.paies.filter((x) => x.paie.statut !== 'brouillon').map(({ paie, calcul }) => [calcul.employe.matricule, nomEmploye(calcul.employe), calcul.employe.fonction, calcul.brut, calcul.totalPrimes, calcul.totalRetenues, calcul.totalAvances, calcul.net, STATUTS_PAIE[paie.statut]]);
        const sum = (i) => rows.reduce((s, r) => s + r[i], 0);
        return { title: `Récapitulatif de la paie — ${moisLabel(v.mois)}`, head: ['Matricule', 'Employé', 'Fonction', 'Brut', 'Primes', 'Retenues', 'Avances', 'Net', 'Statut'], money: [3, 4, 5, 6, 7], rows, foot: ['TOTAL', `${rows.length} paie(s)`, '', sum(3), sum(4), sum(5), sum(6), sum(7), ''], note: 'Paies validées et payées (brouillons exclus).' };
      }
      const employe = v.rapType === 'individuel' ? state.personnel.find((e) => e.id === Number(v.rapEmploye)) : null;
      const anneeRap = state.annees.find((a) => a.id === Number(v.rapAnnee)) || anneePourMois(state, v.mois) || state.annees.find((a) => a.id === state.anneeActiveId);
      const r = recapAnnuel(state, anneeRap ? anneeRap.id : new Date().getFullYear(), employe ? employe.id : 0);
      const libelleAnnee = anneeRap ? `de l’année scolaire ${anneeRap.annee}` : '';
      const rows = r.mois.map((x) => [moisLabel(x.mois), x.nb, x.brut, x.primes, x.retenues, x.avances, x.net, x.paye, x.net - x.paye]);
      return {
        title: employe ? `Récapitulatif ${libelleAnnee} — ${nomEmploye(employe)} (${employe.matricule})` : `Récapitulatif de la paie ${libelleAnnee}`,
        head: ['Mois', 'Paies', 'Brut', 'Primes', 'Retenues', 'Avances', 'Net', 'Payé', 'Reste à payer'], money: [2, 3, 4, 5, 6, 7, 8], rows,
        foot: ['TOTAL', r.total.nb, r.total.brut, r.total.primes, r.total.retenues, r.total.avances, r.total.net, r.total.paye, r.total.net - r.total.paye], note: 'Paies validées et payées (brouillons exclus).'
      };
    }
    
    function renderPaieRapports(state) {
      const section = document.getElementById('paie-rapports');
      if (!section) return;
      const v = paieView;
      const r = rapportPaie(state);
      const cell = (val, i) => (r.money.includes(i) ? `<td class="num">${formatMoney(val)}</td>` : `<td>${escapeHtml(val)}</td>`);
      const imprimables = state.paies.filter((p) => p.mois === v.mois && (p.statut === 'validee' || p.statut === 'payee'));
      const anneeRap = Number(v.rapAnnee) || anneePourMois(state, v.mois)?.id || state.anneeActiveId;
      section.innerHTML = `
        <div class="page-intro"><div><span class="eyebrow">Paie du personnel</span><h2>Bulletins et récapitulatifs</h2></div></div>
        <div class="panel">
          <div class="report-tabs" role="tablist">${RAPPORTS_PAIE.map(([k, l]) => `<button type="button" class="tab-btn ${k === v.rapType ? 'active' : ''}" data-paie-rapport="${k}">${l}</button>`).join('')}</div>
          <div class="advanced-search">
            <label ${v.rapType === 'mensuel' ? '' : 'hidden'}>Mois <input type="month" data-pv="mois" value="${escapeHtml(v.mois)}" max="${todayISO().slice(0, 7)}" /></label>
            <label ${v.rapType === 'mensuel' ? 'hidden' : ''}>Année scolaire <select data-pv="rapAnnee">${state.annees.map((y) => opt(y.id, y.annee, anneeRap)).join('')}</select></label>
            <label ${v.rapType === 'individuel' ? '' : 'hidden'}>Employé <select data-pv="rapEmploye"><option value="">— Choisir —</option>${state.personnel.map((e) => opt(e.id, `${nomEmploye(e)} (${e.matricule})`, v.rapEmploye)).join('')}</select></label>
          </div>
          <div class="form-actions report-actions">
            <button class="secondary-btn small-btn" data-action="paierapport:pdf">PDF / Imprimer</button>
            <button class="secondary-btn small-btn" data-action="paierapport:excel">Excel</button>
            ${v.rapType === 'mensuel' && imprimables.length ? `<button class="primary-btn small-btn" data-action="paie:bulletins-mois">Imprimer les ${imprimables.length} bulletin(s) de ${escapeHtml(moisLabel(v.mois))}</button>` : ''}
          </div>
          <h3>${escapeHtml(r.title)}</h3>
          ${v.rapType === 'individuel' && !v.rapEmploye ? '<p class="meta">Choisissez un employé.</p>' : `<div class="table-wrap"><table>
            <thead><tr>${r.head.map((h, i) => `<th class="${r.money.includes(i) ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${r.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${r.head.length}">Aucune paie validée pour cette sélection.</td></tr>`}</tbody>
            <tfoot><tr>${r.foot.map(cell).join('')}</tr></tfoot></table></div>
          <p class="meta">${escapeHtml(r.note)}</p>`}
          ${v.rapType === 'mensuel' ? `<h3>Bulletins individuels</h3><div class="chip-list">${imprimables.map((p) => `<button type="button" class="action-btn" data-action="paie:bulletin:${p.id}">${escapeHtml(p.numero)} — ${escapeHtml(nomEmploye(p.calcul.employe))}</button>`).join('') || '<span class="meta">Aucun bulletin validé ce mois-ci.</span>'}</div>` : ''}
        </div>`;
    }
    
    function renderPaie(state) {
      renderPaieDashboard(state);
      renderPersonnel(state);
      renderAffectations(state);
      renderRemunerations(state);
      renderPaieMensuelle(state);
      renderAvances(state);
      renderPaieRapports(state);
    }
    
    
    Object.assign(exports, { paieView, renderPaieDashboard, procedurePaieHtml, renderRemunerations, syncModeRemuneration, renderPersonnel, showEmployeDetail, etatLigneAffectation, affectationFormHtml, renderAffectations, heuresMoisHtml, renderPaieOutput, renderPaieMensuelle, avancePreviewHtml, renderAvances, showAvanceDetail, RAPPORTS_PAIE, rapportPaie, renderPaieRapports, renderPaie });
  };
  factories['./modules/paie-actions.js'] = (require, exports) => {
    const { escapeHtml, formatMoney, todayISO, formatDateFr, downloadExcel } = require("./utils.js");
    const { isEnseignant, createEmploye, updateEmploye, definirRemuneration, saveTypeEmploye, toggleTypeEmploye, saveMatiere, toggleMatiere, saveAffectation, saveAffectations, closeAffectation, nomEmploye, setHeuresMois } = require("./personnel.js");
    const { programmeDeClasse, auProgramme } = require("./programme.js");
    const { preparerPaies, majVariables, validerPaie, payerPaie, annulerPaie, calculerPaie } = require("./paie.js");
    const { demanderAvance, approuverAvance, refuserAvance, verserAvance, reporterEcheance, rembourserExceptionnel, soldeAvance, MODES_REMBOURSEMENT } = require("./avances.js");
    const { printBulletins, moisLabel } = require("./bulletin-paie.js");
    const { showBulletinPreview, showExpenseReceiptPreview } = require("./details.js");
    const { paieView, renderPaie, renderPaieOutput, renderPersonnel, renderAffectations, renderRemunerations, renderAvances, renderPaieRapports, affectationFormHtml, avancePreviewHtml, showEmployeDetail, showAvanceDetail, rapportPaie, etatLigneAffectation, syncModeRemuneration } = require("./paie-views.js");
    const { enteteHtml, enteteLignes } = require("./entete.js");
    const { printDocument } = require("./print.js");
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
    function ouvrirRemuneration(ctx, employeId) {
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
    
    function paieFormHandlers(ctx) {
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
    async function handlePaieClick(ctx, event) {
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
    function handlePaieInput(ctx, event) {
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
    
    
    Object.assign(exports, { ouvrirRemuneration, paieFormHandlers, handlePaieClick, handlePaieInput });
  };
})(window.IBK_APP.factories);

