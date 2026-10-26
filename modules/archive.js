import { sha256Hex } from './auth.js';
import { migrateState, validateImport, FORMAT_VERSION } from '../storage.js';
import { downloadBlob } from './utils.js';

// Archives de sauvegarde vérifiables : le contenu est placé dans une enveloppe qui indique le logiciel, le type
// (données complètes ou paramètres seuls), la version du format, l'établissement et une EMPREINTE SHA-256 du contenu.
// À la restauration : empreinte recalculée (fichier altéré ou tronqué → refusé), version détectée (format plus récent
// que le logiciel → refusé), structure contrôlée, établissement comparé, doublon détecté (données identiques).
// Les anciens fichiers sans enveloppe (versions précédentes) restent acceptés, sans vérification d'empreinte.

export const FORMAT_ARCHIVE = 'gestschool-scolarite';
export const TYPES_ARCHIVE = { complet: 'Données complètes', parametres: 'Paramètres seuls' };

const serialiser = (data) => JSON.stringify(data);
export const empreinte = (data) => sha256Hex(serialiser(data));

// Empreinte d'un état pour la détection des doublons (le journal et l'horodatage d'export sont exclus)
export function empreinteDonnees(state) {
  const { journal, ...reste } = state || {};
  return sha256Hex(serialiser(reste));
}

// Paramètres de l'établissement : identité, en-tête, catégories, règles, comptes (sans leurs mouvements), référentiels de paie
export function extraireParametres(state) {
  const { logo, armoiries, ...config } = state.config;
  return {
    config: { ...config, logo: logo || '', armoiries: armoiries || '' },
    comptes: (state.comptes || []).map(({ historique, ...c }) => c),
    typesEmploye: state.typesEmploye || [],
    matieres: state.matieres || []
  };
}

export function creerArchive(state, type = 'complet') {
  const data = type === 'parametres' ? extraireParametres(state) : state;
  return {
    application: 'GEST SCHOOL SCOLARITÉ', format: FORMAT_ARCHIVE, type, version: FORMAT_VERSION,
    exporteLe: new Date().toISOString(),
    etablissement: { id: state.config?.etablissementId || '', nom: state.config?.nom || '' },
    resume: type === 'complet' ? { eleves: state.eleves.length, inscriptions: state.inscriptions.length, paiements: state.paiements.length, depenses: state.depenses.length } : { comptes: (state.comptes || []).length },
    empreinte: empreinte(data),
    data
  };
}

export function nomArchive(state, type = 'complet') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const sigle = String(state.config?.sigle || 'etablissement').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'etablissement';
  return `gestschool-scolarite-${type === 'parametres' ? 'parametres' : 'sauvegarde'}-${sigle}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.note`;
}

export function telechargerArchive(state, type = 'complet') {
  const archive = creerArchive(state, type);
  const nom = nomArchive(state, type);
  downloadBlob(nom, JSON.stringify(archive, null, 2), 'application/json');
  return { nom, archive };
}

// Lecture et vérification d'un fichier (texte). Lève une erreur explicite si le fichier n'est pas restaurable.
// Retourne { type, version, legacy, etablissementId, etablissementNom, data (état migré ou paramètres), empreinte }
export function lireArchive(texte) {
  let parsed;
  try { parsed = JSON.parse(String(texte)); } catch (error) { throw new Error('Le fichier est illisible ou tronqué (JSON invalide).'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Le fichier ne contient pas de données de l’application.');
  if (parsed.format === FORMAT_ARCHIVE) {
    if (!TYPES_ARCHIVE[parsed.type]) throw new Error('Type d’archive inconnu.');
    if (!Number.isInteger(parsed.version) || parsed.version > FORMAT_VERSION) throw new Error(`Cette sauvegarde provient d’une version plus récente du logiciel (format ${parsed.version}) : mettez d’abord GEST SCHOOL SCOLARITÉ à jour.`);
    if (!parsed.data || typeof parsed.data !== 'object') throw new Error('Archive vide.');
    if (empreinte(parsed.data) !== parsed.empreinte) throw new Error('Contrôle d’intégrité échoué : le fichier a été modifié ou endommagé depuis son export. Restauration refusée.');
    if (parsed.type === 'parametres') {
      if (!parsed.data.config || typeof parsed.data.config !== 'object' || !Array.isArray(parsed.data.comptes)) throw new Error('Archive de paramètres incomplète.');
      return { type: 'parametres', version: parsed.version, legacy: false, etablissementId: parsed.etablissement?.id || '', etablissementNom: parsed.etablissement?.nom || '', data: parsed.data, empreinte: parsed.empreinte, exporteLe: parsed.exporteLe };
    }
    const probleme = validateImport(parsed.data);
    if (probleme) throw new Error(probleme);
    return { type: 'complet', version: parsed.version, legacy: false, etablissementId: parsed.data.config?.etablissementId || parsed.etablissement?.id || '', etablissementNom: parsed.data.config?.nom || '', data: migrateState(parsed.data), empreinte: parsed.empreinte, exporteLe: parsed.exporteLe };
  }
  // Ancien format : l'état brut, sans enveloppe ni empreinte
  const probleme = validateImport(parsed);
  if (probleme) throw new Error(probleme);
  const version = Number(parsed.formatVersion || 1);
  if (version > FORMAT_VERSION) throw new Error(`Données d’une version plus récente du logiciel (format ${version}).`);
  return { type: 'complet', version, legacy: true, etablissementId: parsed.config?.etablissementId || '', etablissementNom: parsed.config?.nom || '', data: migrateState(parsed), empreinte: '', exporteLe: '' };
}

export function lireFichier(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve(lireArchive(reader.result)); } catch (error) { reject(error); } };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsText(file);
  });
}

// Application d'une archive de paramètres : identité et règles remplacées (l'identifiant d'établissement est conservé),
// comptes absents ajoutés (un compte existant n'est jamais supprimé ni renuméroté), référentiels de paie complétés.
export function appliquerParametres(state, parametres) {
  const { etablissementId, ...config } = parametres.config;
  state.config = { ...state.config, ...config, etablissementId: state.config.etablissementId };
  if (!config.logo) delete state.config.logo;
  if (!config.armoiries) delete state.config.armoiries;
  let ajoutes = 0;
  parametres.comptes.forEach((c) => {
    if (state.comptes.some((x) => x.libelle.toLocaleLowerCase('fr') === String(c.libelle || '').toLocaleLowerCase('fr'))) return;
    state.comptes.push({ ...c, id: state.comptes.reduce((m, x) => Math.max(m, x.id), 0) + 1, principal: false });
    ajoutes += 1;
  });
  ['typesEmploye', 'matieres'].forEach((key) => {
    (parametres[key] || []).forEach((item) => {
      const libelle = item.libelle || item.nom;
      if (state[key].some((x) => (x.libelle || x.nom) === libelle)) return;
      state[key].push({ ...item, id: state[key].reduce((m, x) => Math.max(m, x.id), 0) + 1 });
    });
  });
  return { comptesAjoutes: ajoutes };
}
