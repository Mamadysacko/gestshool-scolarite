// GEST SCHOOL SCOLARITÉ · 03-annees-classes-tarifs.js
// Scolarité : années, reconduction, classes, programmes, tarifs et modalités
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/annees.js, ./modules/reconduction.js, ./modules/classes.js, ./modules/programme.js, ./modules/tarifs.js, ./modules/modalites.js, ./modules/reductions.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/annees.js'] = (require, exports) => {
    const { exiger, controleActif } = require("./auth.js");
    const { consommerLicence } = require("./licences.js");
    function nextId(items) {
      return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    }
    
    function createAnnee(state, payload = {}) {
      exiger('scolarite.parametrer');
      const annee = String(payload.annee || '').trim();
      if (!annee || state.annees.some((item) => item.annee === annee)) return null;
      // Chaque nouvelle année scolaire consomme une clé de licence (contrôle appliqué dès que l'application est en service)
      const licence = controleActif() || payload.cleLicence ? consommerLicence(state, payload.cleLicence, annee) : null;
    
      const item = {
        id: nextId(state.annees),
        annee,
        dateDebut: payload.dateDebut || '',
        dateFin: payload.dateFin || '',
        statut: payload.statut || 'preparation',
        soldeInitial: Math.max(Number(payload.soldeInitial || 0), 0),
        fraisInscription: Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0),
        fraisReinscription: Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0),
        licence: licence ? { n: licence.n, empreinte: licence.empreinte, date: licence.date } : null
      };
    
      state.annees.push(item);
      if (item.statut === 'ouverte') {
        state.annees.forEach((year) => {
          if (year.id !== item.id && year.statut === 'ouverte') {
            year.statut = 'cloturee';
          }
        });
      }
    
      if (!state.anneeActiveId) {
        state.anneeActiveId = item.id;
      }
    
      return item;
    }
    
    function updateAnneeStatus(state, id, status) {
      exiger('scolarite.parametrer');
      const annee = state.annees.find((item) => item.id === Number(id));
      if (!annee) return null;
      annee.statut = status;
    
      if (status === 'ouverte') {
        state.annees.forEach((item) => {
          if (item.id !== annee.id && item.statut === 'ouverte') {
            item.statut = 'cloturee';
          }
        });
      }
    
      if (status === 'ouverte' || status === 'preparation') {
        state.anneeActiveId = annee.id;
      }
    
      return annee;
    }
    
    function updateAnnee(state, id, payload = {}) {
      exiger('scolarite.parametrer');
      const annee = state.annees.find((item) => item.id === Number(id));
      const label = String(payload.annee || '').trim();
      if (!annee || !label) return null;
      if (state.annees.some((item) => item.id !== annee.id && item.annee === label)) return null;
      annee.annee = label;
      annee.dateDebut = payload.dateDebut || '';
      annee.dateFin = payload.dateFin || '';
      if (payload.soldeInitial !== undefined) annee.soldeInitial = Math.max(Number(payload.soldeInitial || 0), 0);
      // Les nouveaux montants s'appliquent aux inscriptions futures : un frais déjà enregistré n'est jamais modifié
      if (payload.fraisInscription !== undefined) annee.fraisInscription = Math.max(Math.floor(Number(payload.fraisInscription || 0)), 0);
      if (payload.fraisReinscription !== undefined) annee.fraisReinscription = Math.max(Math.floor(Number(payload.fraisReinscription || 0)), 0);
      return annee;
    }
    
    // Refus si des classes ou des inscriptions (donc l'historique financier) dépendent de l'année.
    function deleteAnnee(state, id) {
      exiger('scolarite.parametrer');
      const targetId = Number(id);
      const index = state.annees.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
      if (state.classes.some((c) => c.anneeId === targetId) || state.inscriptions.some((i) => i.anneeId === targetId)) return false;
    
      state.annees.splice(index, 1);
      state.tarifs = state.tarifs.filter((tarif) => tarif.anneeId !== targetId);
      if (state.anneeActiveId === targetId) state.anneeActiveId = state.annees[0]?.id || null;
      return true;
    }
    
    function setAnneeActive(state, id) {
      const targetId = Number(id);
      const annee = state.annees.find((item) => item.id === targetId);
      if (!annee) return null;
      state.anneeActiveId = targetId;
      return annee;
    }
    
    function getAnneeActive(state) {
      return state.annees.find((item) => item.id === Number(state.anneeActiveId)) || state.annees[0] || null;
    }
    
    // Année scolaire couvrant un mois « AAAA-MM » (dates officielles), sinon l'année active
    function anneeCouvrantMois(state, mois) {
      const first = `${mois}-01`;
      return state.annees.find((a) => a.dateDebut && a.dateFin && a.dateDebut.slice(0, 7) <= mois && first <= a.dateFin) || state.annees.find((a) => a.id === state.anneeActiveId) || null;
    }
    
    // Année à laquelle rattacher une opération de caisse datée (paie, avance, remboursement) : celle qui couvre la date
    // si elle n'est pas clôturée, sinon l'année active (aucune écriture sur une année clôturée)
    function anneeDeLOperation(state, date) {
      const annee = anneeCouvrantMois(state, String(date || '').slice(0, 7));
      return annee && annee.statut !== 'cloturee' ? annee.id : Number(state.anneeActiveId || annee?.id || 0);
    }
    
    Object.assign(exports, { nextId, createAnnee, updateAnneeStatus, updateAnnee, deleteAnnee, setAnneeActive, getAnneeActive, anneeCouvrantMois, anneeDeLOperation });
  };
  factories['./modules/reconduction.js'] = (require, exports) => {
    const { createClasse } = require("./classes.js");
    const { createTarif, autoTrancheDates } = require("./tarifs.js");
    const { programmeDeClasse, definirProgramme } = require("./programme.js");
    const { saveAffectation, nomEmploye } = require("./personnel.js");
    const { withTransaction } = require("./transaction.js");
    // Reconduction d'une année scolaire à la suivante : seules les données de référence sont copiées
    // (classes, programmes et coefficients, frais, affectations des enseignants au besoin).
    // Aucune inscription, note, paiement, dépense, dette ou paie n'est recopiée : chaque année garde ses propres
    // opérations, et les données de l'année source ne sont jamais modifiées. L'opération est idempotente :
    // une classe déjà présente (même nom) dans l'année cible est réutilisée, jamais dupliquée.
    
    const cleAnnee = (a) => `${a?.dateDebut || ''}|${a?.annee || ''}`;
    
    const OPTIONS_RECONDUCTION = [
      ['classes', 'Classes (nom, catégorie, capacité)'],
      ['programmes', 'Programmes : matières et coefficients de chaque classe'],
      ['tarifs', 'Frais de scolarité (montants repris, dates recalculées pour la nouvelle année)'],
      ['affectations', 'Affectations des enseignants (enseignants toujours actifs)']
    ];
    
    // Année précédant `anneeId` dans l'ordre chronologique (date de rentrée, sinon libellé)
    function anneePrecedente(state, anneeId) {
      const cible = state.annees.find((a) => a.id === Number(anneeId));
      if (!cible) return null;
      return state.annees.filter((a) => a.id !== cible.id && cleAnnee(a) < cleAnnee(cible)).sort((a, b) => cleAnnee(b).localeCompare(cleAnnee(a)))[0] || null;
    }
    
    const memeNom = (a, b) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
    
    // Ce que la reconduction créerait (sans rien modifier)
    function apercuReconduction(state, sourceId, cibleId) {
      const sources = state.classes.filter((c) => c.anneeId === Number(sourceId) && c.active !== false);
      const cibles = state.classes.filter((c) => c.anneeId === Number(cibleId));
      const nouvelles = sources.filter((c) => !cibles.some((x) => memeNom(x.nom, c.nom)));
      return {
        classes: sources.length, nouvellesClasses: nouvelles.length,
        programmes: sources.filter((c) => programmeDeClasse(state, c.id).length).length,
        tarifs: sources.filter((c) => state.tarifs.some((t) => t.classeId === c.id && t.anneeId === c.anneeId)).length,
        affectations: state.affectations.filter((a) => a.actif && a.anneeId === Number(sourceId)).length
      };
    }
    
    function reconduire(state, { sourceId, cibleId, classes = true, programmes = true, tarifs = true, affectations = false } = {}) {
      const source = state.annees.find((a) => a.id === Number(sourceId));
      const cible = state.annees.find((a) => a.id === Number(cibleId));
      if (!source || !cible) throw new Error('Année scolaire introuvable.');
      if (source.id === cible.id) throw new Error('Choisissez une année source différente de la nouvelle année.');
      return withTransaction(state, () => {
        const bilan = { classes: 0, classesExistantes: 0, programmes: 0, tarifs: 0, affectations: 0, ignores: [] };
        const correspondance = new Map();
        state.classes.filter((c) => c.anneeId === source.id && c.active !== false).forEach((c) => {
          let dest = state.classes.find((x) => x.anneeId === cible.id && memeNom(x.nom, c.nom));
          if (dest) bilan.classesExistantes += 1;
          else if (classes) {
            dest = createClasse(state, { nom: c.nom, categorie: c.categorie, anneeId: cible.id, capacite: c.capacite });
            if (dest) { dest.origineClasseId = c.id; bilan.classes += 1; }
          }
          if (dest) correspondance.set(c.id, dest);
        });
        correspondance.forEach((dest, srcId) => {
          if (programmes && !programmeDeClasse(state, dest.id).length) {
            const lignes = programmeDeClasse(state, srcId).map(({ matiereId, coefficient, heuresHebdo }) => ({ matiereId, coefficient, heuresHebdo }));
            if (lignes.length) { definirProgramme(state, dest.id, lignes); bilan.programmes += 1; }
          }
          const tarif = state.tarifs.find((t) => t.classeId === srcId && t.anneeId === source.id);
          if (tarifs && tarif && !state.tarifs.some((t) => t.classeId === dest.id && t.anneeId === cible.id)) {
            const dates = autoTrancheDates(cible);
            createTarif(state, {
              classeId: dest.id, anneeId: cible.id, montantAnnuel: tarif.montantAnnuel,
              tranches: (tarif.tranches || []).map((t, i) => ({ num: t.num, libelle: t.libelle, montant: t.montant, dateLimite: dates[i] || '' })),
              montantMensuel: tarif.montantMensuel, nbMois: tarif.nbMois, moisDebut: ''
            });
            bilan.tarifs += 1;
          }
        });
        if (affectations) {
          state.affectations.filter((a) => a.actif && a.anneeId === source.id).forEach((a) => {
            const dest = correspondance.get(a.classeId);
            const employe = state.personnel.find((e) => e.id === a.employeId);
            if (!dest || employe?.statut !== 'actif') return;
            try {
              saveAffectation(state, { employeId: a.employeId, anneeId: cible.id, classeId: dest.id, matiereId: a.matiereId, salle: a.salle });
              bilan.affectations += 1;
            } catch (error) {
              bilan.ignores.push(`${nomEmploye(employe)} — ${dest.nom} : ${error.message}`);
            }
          });
        }
        return bilan;
      });
    }
    
    function texteBilan(bilan) {
      const parts = [`${bilan.classes} classe(s) créée(s)`];
      if (bilan.classesExistantes) parts.push(`${bilan.classesExistantes} déjà présente(s)`);
      parts.push(`${bilan.programmes} programme(s)`, `${bilan.tarifs} tarif(s)`, `${bilan.affectations} affectation(s)`);
      return parts.join(', ');
    }
    
    Object.assign(exports, { OPTIONS_RECONDUCTION, anneePrecedente, apercuReconduction, reconduire, texteBilan });
  };
  factories['./modules/classes.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { exiger } = require("./auth.js");
    // Catégories d'enseignement proposées à une nouvelle installation : modifiables par l'établissement
    // (Administration → Paramètres financiers). CATEGORIES est mis à jour sur place : tous les écrans voient la liste courante.
    const CATEGORIES_DEFAUT = ['Maternelle', 'Primaire', 'Collège', 'Lycée'];
    const CATEGORIES = [...CATEGORIES_DEFAUT];
    
    const nettoyer = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().slice(0, 40)).filter(Boolean))];
    
    // Liste effective : celle de la configuration, complétée des catégories déjà portées par des classes (jamais perdues)
    function syncCategories(state) {
      const configured = nettoyer(state.config.categories);
      const used = nettoyer(state.classes.map((c) => c.categorie)).filter((c) => !configured.includes(c));
      state.config.categories = configured.length || used.length ? [...configured, ...used] : [...CATEGORIES_DEFAUT];
      CATEGORIES.splice(0, CATEGORIES.length, ...state.config.categories);
      return CATEGORIES;
    }
    
    // Remplace la liste ; une catégorie utilisée par une classe ne peut pas être retirée
    function setCategories(state, list) {
      exiger('admin');
      const next = nettoyer(list);
      if (!next.length) throw new Error('Gardez au moins une catégorie d’enseignement.');
      const missing = nettoyer(state.classes.map((c) => c.categorie)).filter((c) => !next.includes(c));
      if (missing.length) throw new Error(`Catégorie(s) utilisée(s) par des classes : ${missing.join(', ')}.`);
      state.config.categories = next;
      return syncCategories(state);
    }
    
    function createClasse(state, payload = {}) {
      exiger('scolarite.parametrer');
      const nom = String(payload.nom || '').trim();
      if (!nom) return null;
      const anneeId = Number(payload.anneeId || state.anneeActiveId || 0);
      if (!state.annees.some((a) => a.id === anneeId)) return null; // une classe appartient toujours à une année existante
      if (state.classes.some((c) => c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;
    
      const item = {
        id: nextId(state.classes),
        nom,
        categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : CATEGORIES[0],
        anneeId,
        capacite: Number(payload.capacite || 0),
        active: payload.active !== false
      };
    
      state.classes.push(item);
      return item;
    }
    
    function updateClasse(state, id, payload = {}) {
      exiger('scolarite.parametrer');
      const item = state.classes.find((classe) => classe.id === Number(id));
      if (!item) return null;
      const nom = String(payload.nom || item.nom).trim();
      const anneeId = Number(payload.anneeId || item.anneeId);
      if (state.classes.some((c) => c.id !== item.id && c.anneeId === anneeId && c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) return null;
    
      Object.assign(item, {
        nom,
        categorie: CATEGORIES.includes(payload.categorie) ? payload.categorie : item.categorie,
        anneeId,
        capacite: Number(payload.capacite || item.capacite),
        active: payload.active !== undefined ? payload.active : item.active
      });
    
      return item;
    }
    
    // Refus si des élèves ou des inscriptions (donc des paiements) dépendent de la classe.
    function deleteClasse(state, id) {
      exiger('scolarite.parametrer');
      const targetId = Number(id);
      const index = state.classes.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
      if (state.inscriptions.some((i) => i.classeId === targetId) || state.eleves.some((e) => e.classeId === targetId)) return false;
    
      state.classes.splice(index, 1);
      state.tarifs = state.tarifs.filter((tarif) => tarif.classeId !== targetId);
      state.programmes = (state.programmes || []).filter((p) => p.classeId !== targetId);
      return true;
    }
    
    Object.assign(exports, { CATEGORIES_DEFAUT, CATEGORIES, syncCategories, setCategories, createClasse, updateClasse, deleteClasse });
  };
  factories['./modules/programme.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    // Programme pédagogique d'une classe : matières enseignées, coefficient et volume horaire hebdomadaire.
    // Une classe appartient à une année scolaire : son programme aussi (il est reconduit avec la classe).
    // Il sert à proposer, dans les affectations, uniquement les matières réellement enseignées dans les classes choisies.
    
    const COEF_MIN = 0.5;
    const COEF_MAX = 20;
    
    function ensureProgrammes(state) {
      if (!Array.isArray(state.programmes)) state.programmes = [];
      return state.programmes;
    }
    
    function programmeDeClasse(state, classeId) {
      return ensureProgrammes(state).filter((p) => p.classeId === Number(classeId))
        .map((p) => ({ ...p, matiere: state.matieres.find((m) => m.id === p.matiereId) }))
        .filter((p) => p.matiere)
        .sort((a, b) => a.matiere.nom.localeCompare(b.matiere.nom, 'fr'));
    }
    
    function matieresDeClasse(state, classeId) {
      return programmeDeClasse(state, classeId).map((p) => p.matiere);
    }
    
    function auProgramme(state, classeId, matiereId) {
      return ensureProgrammes(state).some((p) => p.classeId === Number(classeId) && p.matiereId === Number(matiereId));
    }
    
    // Remplace le programme d'une classe (lignes : { matiereId, coefficient, heuresHebdo })
    function definirProgramme(state, classeId, lignes = []) {
      const classe = state.classes.find((c) => c.id === Number(classeId));
      if (!classe) throw new Error('Classe introuvable.');
      const vues = new Set();
      const propres = (Array.isArray(lignes) ? lignes : []).map((l) => {
        const matiereId = Number(l.matiereId);
        if (!state.matieres.some((m) => m.id === matiereId)) throw new Error('Matière introuvable.');
        if (vues.has(matiereId)) throw new Error('Une matière figure deux fois dans le programme.');
        vues.add(matiereId);
        const coefficient = Number(String(l.coefficient ?? 1).replace(',', '.'));
        if (!Number.isFinite(coefficient) || coefficient < COEF_MIN || coefficient > COEF_MAX) throw new Error(`Coefficient invalide (entre ${COEF_MIN} et ${COEF_MAX}).`);
        const heures = Number(String(l.heuresHebdo ?? 0).replace(',', '.'));
        if (!Number.isFinite(heures) || heures < 0 || heures > 40) throw new Error('Volume horaire invalide (0 à 40 h par semaine).');
        return { matiereId, coefficient, heuresHebdo: heures };
      });
      ensureProgrammes(state);
      state.programmes = state.programmes.filter((p) => p.classeId !== classe.id);
      propres.forEach((l) => state.programmes.push({ id: nextId(state.programmes), classeId: classe.id, ...l }));
      return programmeDeClasse(state, classe.id);
    }
    
    // Copie le programme d'une classe vers une autre (même année ou année suivante)
    function copierProgramme(state, sourceId, cibleId) {
      const lignes = programmeDeClasse(state, sourceId).map(({ matiereId, coefficient, heuresHebdo }) => ({ matiereId, coefficient, heuresHebdo }));
      if (!lignes.length) throw new Error('La classe source n’a pas de programme.');
      return definirProgramme(state, cibleId, lignes);
    }
    
    Object.assign(exports, { ensureProgrammes, programmeDeClasse, matieresDeClasse, auProgramme, definirProgramme, copierProgramme });
  };
  factories['./modules/tarifs.js'] = (require, exports) => {
    const { nextId } = require("./annees.js");
    const { arrondir, repartir, regleArrondi } = require("./arrondi.js");
    const { buildEcheances, hasValidPayments, modalitesDisponibles, echeancierProvisoire, fraisEcheances, nextEcheanceId } = require("./modalites.js");
    const { repartirReduction } = require("./reductions.js");
    const { currentUser, exiger } = require("./auth.js");
    // Tarifs : un tarif par classe et par année scolaire (historisation naturelle : chaque année garde ses tarifs).
    // Une modification n'est JAMAIS rétroactive pour un élève qui a déjà payé : ses échéances (son engagement) restent
    // telles qu'elles étaient. Seuls les élèves inscrits sans aucun paiement peuvent être réalignés, sur demande.
    // Chaque modification conserve la version précédente du tarif dans son historique.
    
    // Montant mensuel proposé : montant annuel réparti sur le nombre de mois, arrondi selon la règle « mensualités »
    // (par défaut au franc supérieur) ; l'écart d'arrondi est absorbé par la dernière mensualité de l'échéancier.
    function autoMontantMensuel(total, nbMois, regle = { pas: 1, sens: 'superieur' }) {
      const months = Math.min(Math.max(Number(nbMois || 0), 1), 12);
      return arrondir(Number(total || 0) / months, regle);
    }
    
    function mensuelFields(payload, fallback = {}) {
      return {
        montantMensuel: Math.max(Math.floor(Number(payload.montantMensuel ?? fallback.montantMensuel ?? 0)), 0),
        nbMois: Math.min(Math.max(Number(payload.nbMois || fallback.nbMois || 9), 1), 12),
        moisDebut: payload.moisDebut !== undefined ? payload.moisDebut : (fallback.moisDebut || '')
      };
    }
    
    const montantOuNull = (value) => (value === null || value === undefined || String(value).trim() === '' ? null : Math.max(Math.floor(Number(value) || 0), 0));
    
    const slug = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'frais';
    
    // Frais annexes (tenue, cantine, transport, fournitures…) : obligatoires pour chaque élève de la classe
    function normalizeAnnexes(list) {
      const seen = new Set();
      return (Array.isArray(list) ? list : []).map((a) => ({ libelle: String(a?.libelle || '').trim().slice(0, 60), montant: Math.max(Math.floor(Number(a?.montant) || 0), 0), code: a?.code }))
        .filter((a) => a.libelle && a.montant > 0)
        .map((a) => {
          let code = a.code && !seen.has(a.code) ? String(a.code) : `annexe-${slug(a.libelle)}`;
          for (let n = 2; seen.has(code); n += 1) code = `annexe-${slug(a.libelle)}-${n}`;
          seen.add(code);
          return { code, libelle: a.libelle, montant: a.montant };
        });
    }
    
    // Champs complémentaires d'un tarif (frais propres à la classe, annexes, plafond de remise)
    function extraFields(payload, fallback = {}) {
      const pct = payload.remiseMaxPct !== undefined ? Number(payload.remiseMaxPct) : Number(fallback.remiseMaxPct || 0);
      return {
        fraisInscription: payload.fraisInscription !== undefined ? montantOuNull(payload.fraisInscription) : (fallback.fraisInscription ?? null),
        fraisReinscription: payload.fraisReinscription !== undefined ? montantOuNull(payload.fraisReinscription) : (fallback.fraisReinscription ?? null),
        fraisAnnexes: normalizeAnnexes(payload.fraisAnnexes !== undefined ? payload.fraisAnnexes : fallback.fraisAnnexes),
        remiseMaxPct: Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100)
      };
    }
    
    // Mise à niveau des tarifs existants (idempotente)
    function ensureTarifsHistorises(state) {
      state.tarifs.forEach((t) => {
        Object.assign(t, extraFields({}, t));
        if (!Array.isArray(t.historique)) t.historique = [];
      });
    }
    
    function addMonthsIso(iso, count) {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1 + count, 1);
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(d || 1, last));
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    
    // Échéances par défaut : 1 mois après la rentrée, puis tous les tiers de l'année scolaire (plafonnées à la fin d'année).
    function autoTrancheDates(annee) {
      if (!annee || !annee.dateDebut) return ['', '', ''];
      const fin = annee.dateFin || '';
      const span = fin ? Math.max(Math.round((new Date(fin) - new Date(annee.dateDebut)) / (30.44 * 86400000)), 3) : 9;
      const step = Math.floor(span / 3);
      return [0, 1, 2].map((k) => {
        const due = addMonthsIso(annee.dateDebut, 1 + k * step);
        return fin && due > fin ? fin : due;
      });
    }
    
    // Répartition automatique : tiers arrondis selon la règle « tranches », le reliquat va à la dernière tranche
    // (la somme des trois tranches est toujours égale au montant annuel).
    function autoTrancheMontants(total, regle = { pas: 1, sens: 'inferieur' }) {
      return repartir(Number(total || 0), 3, regle);
    }
    
    function autoTranches(state, anneeId, montantAnnuel) {
      const annee = state.annees.find((a) => a.id === Number(anneeId));
      const dates = autoTrancheDates(annee);
      const montants = autoTrancheMontants(montantAnnuel, regleArrondi(state.config, 'tranches'));
      return [1, 2, 3].map((num, i) => ({ num, libelle: `${num === 1 ? '1ère' : num + 'ème'} tranche`, montant: montants[i], dateLimite: dates[i] }));
    }
    
    function normalizeTranches(payload = []) {
      const source = Array.isArray(payload) && payload.length ? payload : [
        { num: 1, libelle: '1ère tranche', montant: 0, dateLimite: '' },
        { num: 2, libelle: '2ème tranche', montant: 0, dateLimite: '' },
        { num: 3, libelle: '3ème tranche', montant: 0, dateLimite: '' }
      ];
    
      return source.map((tranche, index) => ({
        id: tranche.id || index + 1,
        num: Number(tranche.num || index + 1),
        libelle: tranche.libelle || `Tranche ${index + 1}`,
        montant: Number(tranche.montant || 0),
        dateLimite: tranche.dateLimite || ''
      }));
    }
    
    // Photographie d'un tarif, conservée dans son historique avant chaque modification
    function version(tarif) {
      const { historique, ...rest } = tarif;
      return structuredClone(rest);
    }
    
    function archiver(tarif, motif) {
      tarif.historique = [...(tarif.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif, avant: version(tarif) }];
    }
    
    function createTarif(state, payload = {}) {
      exiger('scolarite.parametrer');
      const classeId = Number(payload.classeId || 0);
      const anneeId = Number(payload.anneeId || state.anneeActiveId || 0);
      if (!state.annees.some((a) => a.id === anneeId)) return null;
      if (!classeId || !anneeId) return null;
      const classe = state.classes.find((c) => c.id === classeId);
      if (classe && classe.anneeId !== anneeId) return null; // une classe appartient à une seule année scolaire
    
      const existingIndex = state.tarifs.findIndex((item) => item.classeId === classeId && item.anneeId === anneeId);
      const baseMontant = Number(payload.montantAnnuel || 0);
      const auto = autoTranches(state, anneeId, baseMontant);
      const given = Array.isArray(payload.tranches) && payload.tranches.length ? payload.tranches : auto;
      const tranches = normalizeTranches(given.map((tranche, index) => ({ ...tranche, dateLimite: tranche.dateLimite || auto[index]?.dateLimite || '' })));
    
      const item = {
        id: existingIndex >= 0 ? state.tarifs[existingIndex].id : nextId(state.tarifs),
        classeId,
        anneeId,
        montantAnnuel: baseMontant,
        tranches,
        ...mensuelFields(payload),
        ...extraFields(payload),
        actif: true,
        historique: existingIndex >= 0 ? [...(state.tarifs[existingIndex].historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif: 'Remplacement', avant: version(state.tarifs[existingIndex]) }] : [],
        creeLe: existingIndex >= 0 ? state.tarifs[existingIndex].creeLe : new Date().toISOString()
      };
    
      if (existingIndex >= 0) {
        state.tarifs[existingIndex] = item;
        return item;
      }
    
      state.tarifs.push(item);
      return item;
    }
    
    function updateTarif(state, id, payload = {}) {
      exiger('scolarite.parametrer');
      const item = state.tarifs.find((tarif) => tarif.id === Number(id));
      if (!item) return null;
      archiver(item, 'Modification');
    
      item.classeId = Number(payload.classeId || item.classeId);
      item.anneeId = Number(payload.anneeId || item.anneeId);
      item.montantAnnuel = Number(payload.montantAnnuel || item.montantAnnuel || 0);
      item.tranches = normalizeTranches(payload.tranches || item.tranches || []);
      item.actif = payload.actif !== undefined ? payload.actif : item.actif;
      Object.assign(item, mensuelFields(payload, item), extraFields(payload, item));
      item.modifieLe = new Date().toISOString();
      delete item.mensuel;
    
      return item;
    }
    
    // Reprise d'un tarif vers l'année active : il s'applique à la classe de même nom de l'année active.
    // Refus si cette classe n'existe pas ou a déjà un tarif (jamais de doublon classe / année).
    function duplicateTarif(state, id, anneeCibleId = state.anneeActiveId) {
      exiger('scolarite.parametrer');
      const existing = state.tarifs.find((item) => item.id === Number(id));
      if (!existing) return null;
      const cible = Number(anneeCibleId || 0);
      if (!cible || cible === existing.anneeId) return null;
      const source = state.classes.find((c) => c.id === existing.classeId);
      const classe = state.classes.find((c) => c.anneeId === cible && String(c.nom).toLocaleLowerCase('fr') === String(source?.nom || '').toLocaleLowerCase('fr'));
      if (!classe || state.tarifs.some((t) => t.classeId === classe.id && t.anneeId === cible)) return null;
      const annee = state.annees.find((a) => a.id === cible);
      const dates = autoTrancheDates(annee);
      const { historique, id: ancienId, creeLe, modifieLe, ...rest } = structuredClone(existing);
      const item = {
        ...rest,
        id: nextId(state.tarifs),
        classeId: classe.id,
        anneeId: cible,
        // Les dates d'échéance suivent la nouvelle année scolaire
        tranches: rest.tranches.map((tranche, i) => ({ ...tranche, dateLimite: dates[i] || '' })),
        moisDebut: '',
        historique: [],
        repriseDe: ancienId,
        creeLe: new Date().toISOString()
      };
      state.tarifs.push(item);
      return item;
    }
    
    function deleteTarif(state, id) {
      exiger('scolarite.parametrer');
      const targetId = Number(id);
      const index = state.tarifs.findIndex((item) => item.id === targetId);
      if (index === -1) return false;
    
      state.tarifs.splice(index, 1);
      return true;
    }
    
    // Frais ponctuels dus par un élève d'après le tarif de sa classe (frais propres à la classe, sinon ceux de l'année) :
    // frais d'inscription ou de réinscription, puis frais annexes. Codes stables : une ligne n'est jamais créée deux fois.
    function fraisAttendus(state, inscription, tarif) {
      const annee = state.annees.find((a) => a.id === inscription.anneeId);
      const reinscription = inscription.type === 'reinscription';
      const propre = tarif ? (reinscription ? tarif.fraisReinscription : tarif.fraisInscription) : null;
      const montant = Number((propre ?? (reinscription ? annee?.fraisReinscription : annee?.fraisInscription)) || 0);
      const lignes = montant > 0 ? [{ code: 'inscription', libelle: reinscription ? 'Frais de réinscription' : 'Frais d’inscription', montant }] : [];
      return [...lignes, ...(tarif?.fraisAnnexes || [])];
    }
    
    // Ancienne échéance de frais sans code : c'est le frais d'inscription / réinscription
    const codeFrais = (echeance) => echeance.fraisCode || 'inscription';
    
    // Aligne les échéances de frais d'une inscription sur les frais attendus.
    // Lignes absentes : ajoutées. Inscription SANS paiement : montants mis à jour et lignes devenues inutiles retirées.
    // Inscription avec paiement : rien n'est modifié ni retiré (engagement en cours conservé).
    function synchroniserFrais(state, inscription, tarif) {
      const attendus = fraisAttendus(state, inscription, tarif);
      const paye = hasValidPayments(state, inscription);
      const actuels = fraisEcheances(inscription);
      let changes = 0;
      let id = nextEcheanceId(state, inscription);
      const garder = [];
      actuels.forEach((e) => {
        const voulu = attendus.find((a) => a.code === codeFrais(e));
        if (!voulu) { if (paye || Number(e.montantPaye || 0) > 0) garder.push(e); else changes += 1; return; }
        if (!paye && Number(e.montant) !== voulu.montant) { e.montant = voulu.montant; e.libelle = voulu.libelle; changes += 1; }
        garder.push(e);
      });
      attendus.forEach((a) => {
        if (garder.some((e) => codeFrais(e) === a.code)) return;
        if (paye && a.code === 'inscription') return; // jamais de frais d'inscription ajoutés après coup à un élève qui paie déjà
        garder.push({ id: id++, type: 'frais', fraisCode: a.code, trancheId: 0, montant: a.montant, montantPaye: 0, remise: 0, statut: 'impayee', dateLimite: inscription.dateInscription || '', libelle: a.libelle });
        changes += 1;
      });
      inscription.echeances = [...garder, ...(inscription.echeances || []).filter((e) => e.type !== 'frais')];
      return changes;
    }
    
    // Élèves concernés par un tarif : { sansPaiement, avecPaiement }
    function inscriptionsDuTarif(state, tarif) {
      const list = state.inscriptions.filter((i) => i.classeId === tarif.classeId && i.anneeId === tarif.anneeId);
      return { sansPaiement: list.filter((i) => !hasValidPayments(state, i)), avecPaiement: list.filter((i) => hasValidPayments(state, i)) };
    }
    
    // Répercute un tarif (créé ou modifié) sur les élèves inscrits dans sa classe et son année QUI N'ONT ENCORE RIEN PAYÉ :
    // frais et échéancier reconstruits dans la modalité choisie (ou provisoire par tranches), réduction réappliquée.
    // Les élèves ayant déjà payé gardent intégralement leur engagement (aucune modification rétroactive).
    function propagateTarif(state, tarif) {
      const { sansPaiement, avecPaiement } = inscriptionsDuTarif(state, tarif);
      const dispo = modalitesDisponibles(tarif);
      sansPaiement.forEach((inscription) => {
        synchroniserFrais(state, inscription, tarif);
        if (inscription.modalite && dispo[inscription.modalite]) {
          inscription.echeances = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, inscription.modalite)];
          repartirReduction(inscription);
        } else echeancierProvisoire(state, inscription, tarif);
      });
      return { misesAJour: sansPaiement.length, preservees: avecPaiement.length };
    }
    
    Object.assign(exports, { autoMontantMensuel, normalizeAnnexes, ensureTarifsHistorises, autoTrancheDates, autoTrancheMontants, autoTranches, createTarif, updateTarif, duplicateTarif, deleteTarif, fraisAttendus, synchroniserFrais, inscriptionsDuTarif, propagateTarif });
  };
  factories['./modules/modalites.js'] = (require, exports) => {
    const { paymentAllocations, allocate, ordreEcheances } = require("./allocation.js");
    const { ecartArrondi, regleArrondi } = require("./arrondi.js");
    const { repartirReduction } = require("./reductions.js");
    // Modalité de règlement d'une inscription : « par tranches » ou « mensuel ».
    // Elle est choisie lors du premier paiement (module Paiements), et non plus imposée à l'inscription.
    // Dès qu'un paiement valide existe, elle est verrouillée : les imputations déjà faites portent sur cet échéancier.
    
    const MODALITES = { tranches: 'Paiement par tranches', mensuel: 'Paiement mensuel' };
    
    const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    function addMonths(iso, count) {
      const [y, m, d] = iso.split('-').map(Number);
      const date = new Date(y, m - 1 + count, 1);
      const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(d || 1, last));
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    
    function monthLabel(iso) {
      if (!iso) return '';
      const [y, m] = iso.split('-').map(Number);
      return `${MOIS[m - 1]} ${y}`;
    }
    
    function tarifFor(state, inscription) {
      return state.tarifs.find((t) => t.classeId === inscription.classeId && t.anneeId === inscription.anneeId) || null;
    }
    
    function totalTranches(tarif) {
      return (tarif?.tranches || []).reduce((s, t) => s + Number(t.montant || 0), 0);
    }
    
    // Formule mensuelle d'un tarif : mensualité, dernière mensualité (écart d'arrondi absorbé) et total réel
    function formuleMensuelle(state, tarif) {
      const mensuel = Number(tarif?.montantMensuel || 0);
      const nb = Number(tarif?.nbMois || 0);
      const ajuste = mensuel > 0 && ecartArrondi(mensuel, nb, tarif?.montantAnnuel, regleArrondi(state?.config, 'mensualites'));
      const dernier = ajuste ? Number(tarif.montantAnnuel) - mensuel * (nb - 1) : mensuel;
      return { mensuel, nb, dernier, ajuste, total: mensuel * (nb - 1) + dernier };
    }
    
    // Texte « 9 × 83 000 (dernière 86 000) = 750 000 »
    function texteMensuel(state, tarif, fmt) {
      const m = formuleMensuelle(state, tarif);
      return m.ajuste ? `${m.nb - 1} × ${fmt(m.mensuel)} + 1 × ${fmt(m.dernier)} = ${fmt(m.total)}` : `${m.nb} × ${fmt(m.mensuel)} = ${fmt(m.total)}`;
    }
    
    function totalMensuel(tarif, state = null) {
      return formuleMensuelle(state, tarif).total;
    }
    
    // Modalités proposables pour un tarif : chacune doit avoir des montants complets
    function modalitesDisponibles(tarif) {
      return {
        tranches: Boolean(tarif) && (tarif.tranches || []).length > 0 && totalTranches(tarif) > 0,
        mensuel: Boolean(tarif) && Number(tarif.montantMensuel) > 0 && Number(tarif.nbMois) > 0
      };
    }
    
    function hasValidPayments(state, inscription) {
      return state.paiements.some((p) => !p.annule && p.inscriptionId === inscription.id);
    }
    
    // Identifiants d'échéances jamais réutilisés pour une même inscription (les paiements annulés gardent leurs références)
    function nextEcheanceId(state, inscription) {
      const used = [...(inscription.echeances || []).map((e) => Number(e.id)),
        ...state.paiements.filter((p) => p.inscriptionId === inscription.id).flatMap((p) => paymentAllocations(p).map((a) => Number(a.echeanceId)))];
      return Math.max(inscription.id * 1000, ...used) + 1;
    }
    
    // Construit l'échéancier d'une modalité à partir du tarif (sans rien enregistrer)
    function buildEcheances(state, inscription, tarif, modalite) {
      let id = nextEcheanceId(state, inscription);
      const base = (fields) => ({ id: id++, montantPaye: 0, remise: 0, statut: 'impayee', ...fields });
      if (modalite === 'mensuel') {
        const count = Math.min(Math.max(Number(tarif.nbMois || 0), 1), 12);
        const annee = state.annees.find((a) => a.id === inscription.anneeId);
        const start = tarif.moisDebut || annee?.dateDebut || '';
        const mensuel = Number(tarif.montantMensuel);
        // Écart dû au seul arrondi de la mensualité : la dernière mensualité l'absorbe (total = montant annuel exact)
        const dernier = ecartArrondi(mensuel, count, tarif.montantAnnuel, regleArrondi(state.config, 'mensualites')) ? Number(tarif.montantAnnuel) - mensuel * (count - 1) : mensuel;
        return Array.from({ length: count }, (_, index) => {
          const dateLimite = start ? addMonths(start, index) : '';
          return base({ trancheId: index + 1, montant: index === count - 1 ? dernier : mensuel, dateLimite, libelle: dateLimite ? monthLabel(dateLimite) : `Mensualité ${index + 1}`, mensualite: true });
        });
      }
      return (tarif.tranches || []).map((tranche, index) => base({
        trancheId: Number(tranche.num || index + 1), montant: Number(tranche.montant || 0), dateLimite: tranche.dateLimite || '', libelle: tranche.libelle || `Tranche ${index + 1}`
      }));
    }
    
    // Échéances de frais d'inscription / réinscription : indépendantes de la modalité, toujours conservées
    function fraisEcheances(inscription) {
      return (inscription.echeances || []).filter((e) => e.type === 'frais');
    }
    
    function scolariteEcheances(inscription) {
      return (inscription.echeances || []).filter((e) => e.type !== 'frais');
    }
    
    // Modalité effective de l'échéancier actuel (les anciennes données sans champ sont déduites)
    function modaliteActuelle(inscription) {
      if (inscription.modalite) return inscription.modalite;
      const scolarite = scolariteEcheances(inscription);
      if (!scolarite.length) return null;
      return scolarite.some((e) => e.mensualite) ? 'mensuel' : 'tranches';
    }
    
    // Réimpute les paiements valides de l'inscription, dans leur ordre d'enregistrement, sur un nouvel échéancier.
    // Aucun paiement n'est supprimé ni compté deux fois : seule sa répartition change. Ne modifie rien.
    function reimputer(state, inscription, echeances) {
      const copy = echeances.map((e) => ({ ...e, montantPaye: 0 }));
      const ordered = ordreEcheances({ echeances: copy });
      const payments = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((x, y) => x.id - y.id);
      const allocations = new Map();
      for (const payment of payments) {
        const result = allocate(ordered, payment.montant);
        if (result.nonImpute > 0) {
          const dejaPaye = payments.reduce((sum, p) => sum + Number(p.montant || 0), 0);
          return { ok: false, message: `Changement impossible : ${dejaPaye.toLocaleString('fr-FR')} déjà payés dépassent le total de la nouvelle modalité (${copy.reduce((sum, e) => sum + Number(e.montant || 0), 0).toLocaleString('fr-FR')}).` };
        }
        result.allocations.forEach((alloc) => { copy.find((e) => e.id === alloc.echeanceId).montantPaye += alloc.montant; });
        allocations.set(payment.id, result.allocations.map(({ echeanceId, montant, libelle }) => ({ echeanceId, montant, libelle })));
      }
      return { ok: true, echeances: copy, allocations };
    }
    
    // Échéancier à utiliser pour un paiement avec la modalité demandée. Ne modifie rien.
    // { ok, echeances, regenerate, changement, reimputations, message }
    function planPourModalite(state, inscription, modalite) {
      if (!MODALITES[modalite]) return { ok: false, echeances: [], message: 'Choisissez la modalité de règlement : paiement mensuel ou par tranches.' };
      const actuelle = modaliteActuelle(inscription);
      const paid = hasValidPayments(state, inscription);
      // Modalité inchangée : on garde l'échéancier en place (avec son historique d'imputations)
      if (inscription.modalite === modalite && scolariteEcheances(inscription).length) return { ok: true, echeances: inscription.echeances, regenerate: false };
      if (!inscription.modalite && paid && actuelle === modalite) return { ok: true, echeances: inscription.echeances, regenerate: false };
      const tarif = tarifFor(state, inscription);
      if (!tarif) return { ok: false, echeances: [], message: 'Aucun tarif n’est configuré pour la classe de cet élève : définissez d’abord les frais dans « Tarifs ».' };
      if (!modalitesDisponibles(tarif)[modalite]) {
        return { ok: false, echeances: [], message: modalite === 'mensuel' ? 'Le tarif de cette classe n’a pas de montant mensuel : complétez-le dans « Tarifs ».' : 'Le tarif de cette classe n’a pas de tranches valides.' };
      }
      const nouveaux = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, modalite)];
      const changement = Boolean(inscription.modalite) && inscription.modalite !== modalite;
      if (!paid) {
        const reduite = repartirReduction(inscription, nouveaux);
        if (!reduite.ok) return { ok: false, echeances: [], message: reduite.message };
        return { ok: true, echeances: nouveaux, regenerate: true, changement };
      }
      const result = reimputer(state, inscription, nouveaux);
      if (!result.ok) return { ok: false, echeances: [], message: result.message };
      // Réduction de l'élève (remise, bourse, exonération) reportée sur la partie non payée du nouvel échéancier
      const reduite = repartirReduction(inscription, result.echeances);
      if (!reduite.ok) return { ok: false, echeances: [], message: reduite.message };
      return { ok: true, echeances: result.echeances, regenerate: true, changement: true, reimputations: result.allocations };
    }
    
    // Applique la modalité choisie : nouvel échéancier et, si des paiements existent, réimputation tracée.
    // À appeler dans une transaction (en cas d'échec, rien n'est modifié).
    function appliquerModalite(state, inscription, modalite, auteur = '') {
      const plan = planPourModalite(state, inscription, modalite);
      if (!plan.ok) throw new Error(plan.message);
      const avant = inscription.modalite;
      if (plan.regenerate) {
        const now = new Date().toISOString();
        if (plan.reimputations) {
          state.paiements.forEach((payment) => {
            const next = plan.reimputations.get(payment.id);
            if (!next) return;
            payment.historiqueImputations = [...(payment.historiqueImputations || []), { horodatage: now, modalite: avant || modaliteActuelle(inscription), allocations: payment.allocations }];
            payment.allocations = next;
            payment.echeanceId = next[0]?.echeanceId || payment.echeanceId;
          });
        }
        inscription.echeances = plan.echeances;
        if (plan.changement) inscription.historiqueModalites = [...(inscription.historiqueModalites || []), { horodatage: now, de: avant, vers: modalite, par: auteur }];
      }
      inscription.modalite = modalite;
      return plan;
    }
    
    // Échéancier provisoire « par tranches » créé à l'inscription pour que les montants attendus et les retards
    // soient visibles ; la modalité reste « à choisir » (null) jusqu'au premier paiement. Les frais sont conservés.
    function echeancierProvisoire(state, inscription, tarif) {
      const frais = fraisEcheances(inscription);
      inscription.modalite = null;
      inscription.echeances = !tarif || !modalitesDisponibles(tarif).tranches ? frais : [...frais, ...buildEcheances(state, inscription, tarif, 'tranches')];
      repartirReduction(inscription);
      return inscription;
    }
    
    Object.assign(exports, { MODALITES, addMonths, monthLabel, tarifFor, totalTranches, formuleMensuelle, texteMensuel, totalMensuel, modalitesDisponibles, hasValidPayments, nextEcheanceId, buildEcheances, fraisEcheances, scolariteEcheances, modaliteActuelle, reimputer, planPourModalite, appliquerModalite, echeancierProvisoire });
  };
  factories['./modules/reductions.js'] = (require, exports) => {
    const { currentUser, exiger } = require("./auth.js");
    const { todayISO } = require("./utils.js");
    // Réductions accordées à un élève sur ses frais de scolarité : remise, bourse ou exonération totale.
    // Règles :
    //  - elles portent sur la scolarité (tranches ou mensualités), jamais sur les frais d'inscription ni les frais annexes ;
    //  - elles réduisent seulement ce qui RESTE à payer, en partant de la dernière échéance : un paiement déjà imputé
    //    n'est jamais déplacé et aucun crédit implicite n'est créé ;
    //  - une remise est plafonnée par le tarif de la classe (« remise maximale ») ; bourses et exonérations sont
    //    accordées par un administrateur ; chaque décision est motivée et historisée.
    
    const TYPES_REDUCTION = { remise: 'Remise', bourse: 'Bourse', exoneration: 'Exonération totale' };
    const MODES_REDUCTION = { pourcentage: 'Pourcentage', montant: 'Montant fixe' };
    
    const num = (v) => Number(v || 0);
    const scolarite = (echeances) => (echeances || []).filter((e) => e.type !== 'frais');
    
    function baseReduction(echeances) {
      return scolarite(echeances).reduce((s, e) => s + num(e.montant), 0);
    }
    
    // Montant de la réduction pour une base de scolarité donnée (arrondi au franc inférieur, jamais au-delà de la base)
    function montantReduction(reduction, base) {
      if (!reduction || base <= 0) return 0;
      if (reduction.type === 'exoneration') return base;
      if (reduction.mode === 'pourcentage') return Math.floor(base * Math.min(Math.max(num(reduction.valeur), 0), 100) / 100);
      return Math.min(Math.max(Math.floor(num(reduction.valeur)), 0), base);
    }
    
    // Répartit la réduction de l'inscription sur les échéances fournies (modifiées sur place).
    // { ok, montant, message } — ok = false si la partie non payée ne suffit pas à absorber la réduction.
    function repartirReduction(inscription, echeances = inscription.echeances) {
      const list = scolarite(echeances);
      list.forEach((e) => { e.remise = 0; });
      const reduction = inscription.reduction;
      if (!reduction) return { ok: true, montant: 0 };
      const total = montantReduction(reduction, baseReduction(echeances));
      let left = total;
      const ordered = [...list].sort((a, b) => num(b.trancheId) - num(a.trancheId));
      for (const echeance of ordered) {
        if (left <= 0) break;
        const libre = Math.max(num(echeance.montant) - num(echeance.montantPaye), 0);
        const part = Math.min(libre, left);
        echeance.remise = part;
        left -= part;
      }
      if (left > 0) {
        return { ok: false, montant: total, message: `La réduction (${total.toLocaleString('fr-FR')}) dépasse ce qui reste à payer sur la scolarité (${(total - left).toLocaleString('fr-FR')} au plus) : les paiements déjà reçus ne sont jamais transformés en avoir.` };
      }
      return { ok: true, montant: total };
    }
    
    function reductionLabel(reduction) {
      if (!reduction) return '';
      if (reduction.type === 'exoneration') return TYPES_REDUCTION.exoneration;
      const valeur = reduction.mode === 'pourcentage' ? `${num(reduction.valeur)} %` : num(reduction.valeur).toLocaleString('fr-FR');
      return `${TYPES_REDUCTION[reduction.type] || 'Réduction'} de ${valeur}`;
    }
    
    // Contrôle d'une demande de réduction (sans rien modifier)
    function validateReduction(state, inscription, payload = {}, tarif = null) {
      if (!inscription) return { ok: false, message: 'Inscription introuvable.' };
      const type = payload.type;
      if (!TYPES_REDUCTION[type]) return { ok: false, message: 'Choisissez le type de réduction.' };
      const mode = type === 'exoneration' ? 'pourcentage' : payload.mode;
      if (!MODES_REDUCTION[mode]) return { ok: false, message: 'Choisissez un pourcentage ou un montant fixe.' };
      const valeur = type === 'exoneration' ? 100 : Number(payload.valeur);
      if (!Number.isFinite(valeur) || valeur <= 0) return { ok: false, message: 'La valeur de la réduction doit être supérieure à zéro.' };
      if (mode === 'pourcentage' && valeur > 100) return { ok: false, message: 'Un pourcentage ne peut pas dépasser 100 %.' };
      if (mode === 'montant' && !Number.isInteger(valeur)) return { ok: false, message: 'Le montant de la réduction doit être un nombre entier.' };
      if (!String(payload.motif || '').trim()) return { ok: false, message: 'Le motif de la réduction est obligatoire.' };
      const annee = state.annees.find((a) => a.id === inscription.anneeId);
      if (annee?.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : ses engagements ne peuvent plus changer.` };
      if ((state.reliquats || []).some((r) => r.inscriptionId === inscription.id)) return { ok: false, message: 'Le solde de cette inscription a déjà été reporté en dette : la réduction n’est plus modifiable.' };
      const base = baseReduction(inscription.echeances);
      if (base <= 0) return { ok: false, message: 'Aucun frais de scolarité n’est encore défini pour cet élève (tarif de la classe manquant).' };
      if (type === 'remise') {
        const plafond = Math.min(Math.max(num(tarif?.remiseMaxPct), 0), 100);
        const pct = mode === 'pourcentage' ? valeur : (valeur / base) * 100;
        if (pct > plafond + 1e-9) return { ok: false, message: plafond ? `Remise trop élevée : le tarif de la classe autorise au plus ${plafond} % (${Math.floor(base * plafond / 100).toLocaleString('fr-FR')}).` : 'Aucune remise n’est autorisée par le tarif de cette classe (« Remise maximale » à 0 %). Une bourse ou une exonération peut être accordée par un administrateur.' };
      }
      const essai = { ...inscription, reduction: { type, mode, valeur } };
      const copie = (inscription.echeances || []).map((e) => ({ ...e }));
      const result = repartirReduction(essai, copie);
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true, type, mode, valeur, montant: result.montant };
    }
    
    // Accorde (ou remplace) la réduction d'une inscription ; la précédente est conservée dans l'historique.
    function accorderReduction(state, inscription, payload = {}, tarif = null) {
      // Remise dans le plafond : droit ordinaire ; bourse, exonération ou remplacement d'une bourse : droit d'exception
      const exceptionnelle = payload.type !== 'remise' || (inscription?.reduction && inscription.reduction.type !== 'remise');
      exiger(exceptionnelle ? 'reductions.exceptionnelles' : 'reductions.accorder');
      const check = validateReduction(state, inscription, payload, tarif);
      if (!check.ok) throw new Error(check.message);
      const now = new Date().toISOString();
      if (inscription.reduction) inscription.historiqueReductions = [...(inscription.historiqueReductions || []), { ...inscription.reduction, remplaceeLe: now }];
      inscription.reduction = { type: check.type, mode: check.mode, valeur: check.valeur, motif: String(payload.motif).trim(), reference: String(payload.reference || '').trim(), par: currentUser()?.nom || '', date: todayISO(), horodatage: now };
      const result = repartirReduction(inscription);
      if (!result.ok) throw new Error(result.message);
      inscription.reduction.montant = result.montant;
      return inscription.reduction;
    }
    
    function retirerReduction(state, inscription, motif = '') {
      exiger('reductions.exceptionnelles');
      if (!inscription?.reduction) return null;
      if (!String(motif).trim()) throw new Error('Le motif du retrait est obligatoire.');
      if ((state.reliquats || []).some((r) => r.inscriptionId === inscription.id)) throw new Error('Le solde de cette inscription a déjà été reporté en dette : la réduction n’est plus modifiable.');
      const ancienne = inscription.reduction;
      inscription.historiqueReductions = [...(inscription.historiqueReductions || []), { ...ancienne, retireeLe: new Date().toISOString(), motifRetrait: String(motif).trim(), retireePar: currentUser()?.nom || '' }];
      delete inscription.reduction;
      repartirReduction(inscription);
      return ancienne;
    }
    
    Object.assign(exports, { TYPES_REDUCTION, MODES_REDUCTION, baseReduction, montantReduction, repartirReduction, reductionLabel, validateReduction, accorderReduction, retirerReduction });
  };
})(window.IBK_APP.factories);

