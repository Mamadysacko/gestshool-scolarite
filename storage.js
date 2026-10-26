import { ensurePaieState } from './modules/personnel.js';
import { normaliserArrondis } from './modules/arrondi.js';
import { migrerContacts } from './modules/contacts.js';
import { ensureProgrammes } from './modules/programme.js';
import { CATEGORIES_DEFAUT, syncCategories } from './modules/classes.js';
import { CATEGORIES_DEPENSE_DEFAUT, syncCategoriesDepense } from './modules/depenses.js';
import { COMPTE_PRINCIPAL_DEFAUT, ensureComptes } from './modules/comptes.js';
import { ensureTarifsHistorises } from './modules/tarifs.js';

// Clé de stockage historique conservée : une mise à jour du logiciel relit les données existantes sans rien effacer.
export const STORAGE_KEY = 'ibk_school_premium_v1';

// État d'une installation neuve : AUCUNE donnée scolaire, financière ni d'établissement.
// Seuls des référentiels neutres sont fournis (catégories modifiables, une caisse principale) ;
// l'établissement saisit ensuite son identité, ses années, classes, tarifs, comptes et utilisateurs.
export const DEFAULT_STATE = {
  config: {
    nom: '',
    sigle: '',
    codeEcole: '',
    devise: '',
    adresse: '',
    telephone: '',
    email: '',
    caissier: '',
    categories: [...CATEGORIES_DEFAUT],
    categoriesDepense: [...CATEGORIES_DEPENSE_DEFAUT]
  },
  anneeActiveId: null,
  annees: [],
  classes: [],
  eleves: [],
  tarifs: [],
  inscriptions: [],
  paiements: [],
  paiementsEnAttente: [],
  depenses: [],
  depensesRecurrentes: [],
  comptes: [COMPTE_PRINCIPAL_DEFAUT],
  virements: [],
  sessionsCaisse: [],
  rapprochements: [],
  budgets: [],
  licences: [],
  licencesCatalogue: [],
  licencesArchives: [],
  reliquats: [],
  journal: [],
  compteursRecu: {},
  compteursDepense: {},
  compteursAttente: {},
  compteursVirement: {},
  compteursCaisse: {}
};

// Version du format des données (détectée à l'import et à la restauration)
export const FORMAT_VERSION = 3;

// Identifiant unique de l'établissement de cette base : relie les comptes utilisateurs à leurs données
function nouvelIdentifiant() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Met à niveau un état issu d'une ancienne version (ou d'un import) sans perdre d'information :
// champs ajoutés avec une valeur neutre, champs supprimés retirés, paiements rattachés à leur année et à leurs imputations.
export function migrateState(raw) {
  const base = structuredClone(DEFAULT_STATE);
  const state = { ...base, ...raw, config: { ...base.config, ...(raw.config || {}) } };
  state.config.arrondis = normaliserArrondis(state.config.arrondis || {});
  ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'paiementsEnAttente', 'depenses', 'depensesRecurrentes', 'virements', 'sessionsCaisse', 'rapprochements', 'budgets', 'licences', 'licencesCatalogue', 'licencesArchives', 'reliquats', 'journal'].forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
  });
  if (!state.config.etablissementId) state.config.etablissementId = nouvelIdentifiant();
  state.config.caisseObligatoire = Boolean(state.config.caisseObligatoire);
  state.formatVersion = FORMAT_VERSION;
  ['compteursRecu', 'compteursDepense', 'compteursAttente', 'compteursVirement', 'compteursCaisse'].forEach((key) => {
    if (!state[key] || typeof state[key] !== 'object') state[key] = {};
  });
  delete state.rapports; // ancienne note de démonstration, jamais utilisée
  state.annees.forEach((a) => {
    if (typeof a.soldeInitial !== 'number') a.soldeInitial = Number(a.soldeInitial || 0);
    if (typeof a.fraisInscription !== 'number') a.fraisInscription = Number(a.fraisInscription || 0);
    if (typeof a.fraisReinscription !== 'number') a.fraisReinscription = Number(a.fraisReinscription || 0);
  });
  // Les champs « niveau » et « salle » n'existent plus pour les classes
  // ni « classe de passage » : le niveau supérieur est déduit du nom de la classe (modules/passage.js)
  state.classes.forEach((c) => { delete c.niveau; delete c.salle; delete c.classeSuivante; });
  // Tarifs : la case « échéancier mensuel » devient un montant mensuel explicite (0 = mensuel non proposé)
  state.tarifs.forEach((t) => {
    if (t.montantMensuel === undefined) {
      const months = Math.min(Math.max(Number(t.nbMois || 9), 1), 12);
      t.montantMensuel = t.mensuel ? Math.ceil(Number(t.montantAnnuel || 0) / months) : 0;
      t.nbMois = months;
      t.moisDebut = t.moisDebut || '';
    }
    delete t.mensuel;
  });
  // Tarifs : frais annexes, frais d'inscription propres à la classe, plafond de remise et historique des versions
  ensureTarifsHistorises(state);
  // Inscriptions : modalité de règlement. Déjà utilisée par un paiement valide → conservée ; sinon « à choisir ».
  state.inscriptions.forEach((i) => {
    if (i.modalite !== undefined) return;
    const paid = state.paiements.some((p) => !p.annule && p.inscriptionId === i.id);
    i.modalite = paid && (i.echeances || []).length ? ((i.echeances || []).some((e) => e.mensualite) ? 'mensuel' : 'tranches') : null;
  });
  // Paie du personnel : collections et référentiels par défaut (types d'employés, matières)
  ensurePaieState(state);
  // Programmes des classes et fiches contacts des parents (reprise des anciens champs « parent »)
  ensureProgrammes(state);
  migrerContacts(state);
  state.paiements.forEach((p) => {
    const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
    if (!p.anneeId && inscription) p.anneeId = inscription.anneeId;
    if (!Array.isArray(p.allocations) || !p.allocations.length) {
      p.allocations = p.echeanceId ? [{ echeanceId: p.echeanceId, montant: Number(p.montant || 0) }] : [];
    }
  });
  // Catégories d'enseignement et de dépenses : configurables ; celles déjà utilisées par des données sont conservées
  syncCategories(state);
  syncCategoriesDepense(state);
  // Comptes financiers : une caisse principale existe toujours ; les anciennes opérations y sont rattachées
  ensureComptes(state);
  return state;
}

// Vrai lorsque le navigateur ne contenait aucune donnée au démarrage (première ouverture, données du
// navigateur effacées) : l'application propose alors de recharger le fichier de données lié.
let createdFresh = false;
export const stateWasCreated = () => createdFresh;

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      createdFresh = true;
      const fresh = migrateState({});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return migrateState(JSON.parse(raw));
  } catch (error) {
    console.error('Erreur lecture storage', error);
    return migrateState({});
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Erreur écriture storage', error);
    return false;
  }
}

export function exportStateToFile(state, filename = 'gestschool-scolarite-donnees.note') {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Contrôle minimal d'un fichier importé : un objet dont les collections connues sont bien des listes.
// Un fichier quelconque (ou abîmé) est refusé avant toute copie de sécurité ou remplacement des données.
export function validateImport(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Le fichier ne contient pas de données de l’application.';
  const listes = ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'depenses'];
  if (!listes.some((k) => k in parsed) && !('config' in parsed)) return 'Le fichier ne contient pas de données de l’application.';
  const abimee = listes.find((k) => k in parsed && !Array.isArray(parsed[k]));
  if (abimee) return `Fichier abîmé : la rubrique « ${abimee} » est illisible.`;
  if ('config' in parsed && (typeof parsed.config !== 'object' || Array.isArray(parsed.config))) return 'Fichier abîmé : la configuration est illisible.';
  return '';
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const problem = validateImport(parsed);
        if (problem) throw new Error(problem);
        resolve(migrateState(parsed));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsText(file);
  });
}

// Remise à zéro des données — réservée à une NOUVELLE installation ou à un établissement qui la demande
// explicitement (mot de passe administrateur, copie de sécurité préalable). Elle n'est JAMAIS déclenchée par une
// mise à jour du logiciel : migrateState() conserve toujours les données existantes.
// TOUTES les données sont effacées : identité et paramètres de l'établissement, comptes financiers, catégories,
// référentiels, années, élèves, tarifs, opérations, paie et journal (les comptes utilisateurs, sauf les super
// administrateurs, sont supprimés par l'application au même moment). Sont seulement conservés : l'identifiant
// d'établissement, qui relie les super administrateurs à leur base, et les registres de licences (une clé utilisée
// le reste : une réinitialisation ne doit pas permettre de réutiliser une licence).
export function blankState(current) {
  const base = migrateState({ config: { etablissementId: current.config?.etablissementId } });
  return {
    ...base,
    licences: structuredClone(current.licences || []), licencesCatalogue: structuredClone(current.licencesCatalogue || []), licencesArchives: structuredClone(current.licencesArchives || [])
  };
}

export function resetData(current) {
  const fresh = blankState(current);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}
