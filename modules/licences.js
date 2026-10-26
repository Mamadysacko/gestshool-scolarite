import { hashPassword, exiger, exigerProprietaire, currentUser } from './auth.js';

// ══════════════════════════════════════════════════
// LICENCES GEST SCHOOL SCOLARITÉ (sur le modèle de GEST SCHOOL) : chaque nouvelle année scolaire consomme une clé.
//  • 10 clés d'origine : seules leurs EMPREINTES (SHA-256 avec poivre, 2 000 itérations) figurent dans le code ;
//    une clé ne peut pas être retrouvée à partir du logiciel ;
//  • le COMPTE PROPRIÉTAIRE (éditeur) gère seul le catalogue : ajout (clé saisie ou générée), modification,
//    désactivation, révocation, suppression ; un établissement ne peut pas se fabriquer ses propres clés ;
//  • une clé ne sert qu'UNE fois, pour toujours : utilisations, catalogue et archives sont enregistrés dans les
//    données ET dans des registres du navigateur conservés après une réinitialisation ou la restauration d'une
//    ancienne sauvegarde ;
//  • DÉSACTIVER = suspension réversible · RÉVOQUER = définitif, la clé reste visible · SUPPRIMER = retirée du catalogue,
//    archivée (traçabilité) et placée en liste noire : l'ancienne clé n'est plus jamais acceptée ;
//  • indépendant des données financières : supprimer une licence ne touche ni aux années ni aux paiements.
// ══════════════════════════════════════════════════
const POIVRE = 'GSS-LIC-be33999484919eaf806cd44e';
const EMPREINTES_ORIGINE = [
  'b42504d530de1860a5861e4485a257bdd7387fbad836e8ad0c894fe82715fb32',
  '5c9015246b381fcb380ee7489b98ea3838951314e19860fb3e69d5cf77ccf013',
  '2c6c839f4b07d2d47882ff74e69d7ca0229c38e4a76021655139173c14768c62',
  '3d9aed7b7fa2577d81c2e9169ca6b5e3f165188e0aaa6803c55c17dccdbef439',
  'b350b503017ebb94761ab2d35ef9e4260e3713f04ff85039531af019e6bddb92',
  'afee2faae85faddee0fee9cde46b45c39cc2a0be8b2df6f7ff930d817556b4ad',
  'e235362a417d3848ddf0f5cf30b9553bc288d202f3892cd632a2ffd4803f3ecb',
  'c73ba26036ea02c0cbb38a07d4d63dc4b26fa8749e00ab20c3e63bb265275688',
  '7387a1f2caa6884f8e511441e279a64e42244869dbb9bd18b3838c6c220742b2',
  '16da9928762f3f57ebfc3f9d4e63d569ba563d7f20402d31f79791a0592292fe'
];
const REG_UTILISATIONS = 'gestscolarite_licences_utilisees';
const REG_CATALOGUE = 'gestscolarite_licences_catalogue';
const REG_ARCHIVES = 'gestscolarite_licences_archives';

export const STATUTS_LICENCE = { disponible: 'Disponible', utilisee: 'Utilisée', suspendue: 'Désactivée', revoquee: 'Révoquée', expiree: 'Expirée' };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normCle = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lire = (k) => { try { const r = JSON.parse(localStorage.getItem(k)); return Array.isArray(r) ? r : []; } catch (error) { return []; } };
const ecrire = (k, l) => { try { localStorage.setItem(k, JSON.stringify(l)); } catch (error) { /* stockage plein : la copie dans les données subsiste */ } };
const empreinte = (cle) => hashPassword(normCle(cle), POIVRE);
const qui = () => currentUser()?.nom || 'Système';
const courte = (h) => String(h || '').slice(0, 10).toUpperCase();

// Fusion données ↔ registres du navigateur : une utilisation n'est jamais libérée, une suppression jamais oubliée,
// la version la plus récente d'une entrée du catalogue l'emporte. À appeler au chargement et après chaque opération.
export function synchroniserLicences(state) {
  ['licences', 'licencesCatalogue', 'licencesArchives'].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
  const archives = [...state.licencesArchives];
  lire(REG_ARCHIVES).forEach((a) => { if (!archives.some((x) => x.n === a.n)) archives.push(a); });
  state.licencesArchives = archives;
  const supprimees = new Set(archives.map((a) => a.n));
  const utils = state.licences.filter((u) => !supprimees.has(u.n));
  lire(REG_UTILISATIONS).filter((u) => !supprimees.has(u.n)).forEach((u) => { if (!utils.some((x) => x.n === u.n)) utils.push({ ...u, restauree: true }); });
  state.licences = utils;
  const cat = [...state.licencesCatalogue];
  lire(REG_CATALOGUE).forEach((r) => {
    const i = cat.findIndex((x) => x.n === r.n);
    if (i < 0) cat.push(r);
    else if (String(r.modifieLe || '') > String(cat[i].modifieLe || '')) cat[i] = r;
  });
  state.licencesCatalogue = cat.filter((c) => !supprimees.has(c.n));
  ecrire(REG_ARCHIVES, state.licencesArchives);
  ecrire(REG_UTILISATIONS, state.licences.map(({ restauree, ...u }) => u));
  ecrire(REG_CATALOGUE, state.licencesCatalogue);
  return state;
}

// Catalogue opérationnel : clés d'origine (avec leurs éventuelles modifications) + clés ajoutées, sans les supprimées
function catalogue(state) {
  const supprimees = new Set((state.licencesArchives || []).map((a) => a.n));
  const surcharges = new Map((state.licencesCatalogue || []).map((x) => [x.n, x]));
  const origine = EMPREINTES_ORIGINE.map((h, i) => ({ n: i + 1, empreinte: h, origine: 'origine', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...(surcharges.get(i + 1) || {}) }));
  const ajoutees = (state.licencesCatalogue || []).filter((x) => x.n > EMPREINTES_ORIGINE.length).map((x) => ({ origine: 'ajoutee', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...x }));
  return [...origine, ...ajoutees].filter((e) => !supprimees.has(e.n)).sort((a, b) => a.n - b.n);
}

const utilisation = (state, n) => (state.licences || []).find((u) => u.n === n) || null;

function etatCle(state, e) {
  if (utilisation(state, e.n)) return 'utilisee';
  if (e.statut === 'revoquee') return 'revoquee';
  if (e.expireLe && e.expireLe < aujourdhui()) return 'expiree';
  if (e.statut === 'suspendue') return 'suspendue';
  return 'disponible';
}

function entreeCle(state, cle) {
  const k = normCle(cle);
  if (k.length < 8 || k.length > 40) return null;
  const h = empreinte(k);
  const archivee = (state.licencesArchives || []).find((a) => a.empreinte === h);
  if (archivee) return { ...archivee, supprimee: true };
  return catalogue(state).find((e) => e.empreinte === h) || null;
}

function motifRefus(state, e) {
  if (e.supprimee) return 'Cette clé de licence a été supprimée : elle n’est plus jamais acceptée.';
  const etat = etatCle(state, e);
  if (etat === 'utilisee') return 'Cette clé de licence a déjà été utilisée : une clé ne sert qu’une seule fois.';
  if (etat === 'revoquee') return 'Cette clé de licence a été révoquée : elle n’est plus acceptée.';
  if (etat === 'expiree') return `Cette clé de licence a expiré le ${e.expireLe}.`;
  if (etat === 'suspendue') return 'Cette clé de licence est désactivée : elle doit être réactivée par l’éditeur.';
  return '';
}

// Vérifie une clé sans la consommer (super administrateur)
export function verifierCle(state, cle) {
  exiger('superadmin');
  const e = entreeCle(state, cle);
  if (!e) return { valide: false, message: 'Clé de licence invalide.' };
  const refus = motifRefus(state, e);
  const u = utilisation(state, e.n);
  if (refus) return { valide: false, n: e.n, message: `Clé n° ${e.n} : ${refus.replace(/^Cette clé de licence /, '')}${u?.annee ? ` (année ${u.annee})` : ''}` };
  return { valide: true, n: e.n, message: `Clé valide (n° ${e.n}${e.etablissement ? `, ${e.etablissement}` : ''}${e.expireLe ? `, valable jusqu’au ${e.expireLe}` : ''}) : elle sera consommée à la création de la prochaine année scolaire.` };
}

// Contrôle et consommation d'une clé lors de la création d'une année (dans la transaction de création)
export function consommerLicence(state, cle, annee) {
  if (!String(cle || '').trim()) throw new Error('Clé de licence obligatoire : chaque nouvelle année scolaire nécessite une clé de licence valide (Paramètres › Licence).');
  const e = entreeCle(state, cle);
  if (!e) throw new Error('Clé de licence invalide : vérifiez la saisie.');
  const refus = motifRefus(state, e);
  if (refus) throw new Error(refus);
  const rec = { n: e.n, empreinte: courte(e.empreinte), annee, etablissementId: state.config?.etablissementId || '', etablissementNom: state.config?.nom || '', date: new Date().toISOString(), par: qui() };
  state.licences = [...(state.licences || []), rec];
  return rec;
}

// Catalogue pour l'écran (super administrateur) : jamais de clé en clair, seulement numéro, empreinte courte et état
export function listeLicences(state) {
  exiger('superadmin');
  return catalogue(state).map((e) => {
    const u = utilisation(state, e.n);
    const etat = etatCle(state, e);
    return { n: e.n, empreinte: courte(e.empreinte), origine: e.origine, libelle: e.libelle || '', etablissement: e.etablissement || '', expireLe: e.expireLe || '', notes: e.notes || '',
      statut: etat, libelleStatut: STATUTS_LICENCE[etat], annee: u?.annee || '', date: u?.date || '', par: u?.par || '', modifieLe: e.modifieLe || '', modifiePar: e.par || '', motifRevocation: e.motifRevocation || '' };
  });
}

export function archivesLicences(state) {
  exiger('superadmin');
  return (state.licencesArchives || []).map((a) => ({ ...a, empreinte: courte(a.empreinte) })).sort((x, y) => String(y.supprimeeLe).localeCompare(String(x.supprimeeLe)));
}

// Résumé sans aucune clé (tableau de bord, page Licence)
export function etatLicence(state) {
  const cat = catalogue(state);
  const etats = cat.map((e) => etatCle(state, e));
  return { total: cat.length, disponibles: etats.filter((x) => x === 'disponible').length, utilisees: etats.filter((x) => x === 'utilisee').length, anneesActivees: (state.licences || []).length };
}

// ── Gestion du catalogue : COMPTE PROPRIÉTAIRE uniquement ──
function genererCle() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  const s = [...b].map((x) => ALPHABET[x % 32]).join('');
  return `GSS-${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
}

function empreinteNouvelle(state, cle) {
  const k = normCle(cle);
  if (k.length < 12 || k.length > 40) throw new Error('Clé invalide : 12 à 40 lettres ou chiffres (les tirets et espaces sont ignorés).');
  const h = empreinte(k);
  if (catalogue(state).some((e) => e.empreinte === h) || (state.licencesArchives || []).some((a) => a.empreinte === h)) throw new Error('Cette clé existe déjà (ou a été supprimée) : une clé ne peut jamais être réintroduite.');
  return h;
}

function champsLicence(data, e = {}) {
  const c = {};
  if (data.libelle !== undefined) c.libelle = String(data.libelle || '').trim().slice(0, 80);
  if (data.etablissement !== undefined) c.etablissement = String(data.etablissement || '').trim().slice(0, 120);
  if (data.notes !== undefined) c.notes = String(data.notes || '').trim().slice(0, 300);
  if (data.expireLe !== undefined) {
    const d = String(data.expireLe || '').trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Date d’expiration invalide (format AAAA-MM-JJ).');
    c.expireLe = d;
  }
  return Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== (e[k] || '')));
}

function majEntree(state, n, champs) {
  const i = state.licencesCatalogue.findIndex((x) => x.n === n);
  const base = catalogue(state).find((e) => e.n === n);
  const rec = { ...(i >= 0 ? state.licencesCatalogue[i] : { n, empreinte: base.empreinte, origine: base.origine, statut: base.statut }), ...champs, modifieLe: new Date().toISOString(), par: qui() };
  if (i >= 0) state.licencesCatalogue[i] = rec; else state.licencesCatalogue.push(rec);
  return rec;
}

const nouveauNumero = (state) => Math.max(EMPREINTES_ORIGINE.length, ...catalogue(state).map((e) => e.n), ...(state.licencesCatalogue || []).map((e) => e.n), ...(state.licencesArchives || []).map((a) => a.n), ...(state.licences || []).map((u) => u.n)) + 1;

// Ajoute une clé ; la clé en clair n'est rendue QU'UNE FOIS (seule son empreinte est enregistrée)
export function ajouterCle(state, data = {}) {
  exigerProprietaire('ajouter une clé de licence');
  const cle = String(data.cle || '').trim() ? String(data.cle).trim().toUpperCase() : genererCle();
  const h = empreinteNouvelle(state, cle);
  const champs = champsLicence(data);
  const n = nouveauNumero(state);
  const now = new Date().toISOString();
  state.licencesCatalogue.push({ n, empreinte: h, origine: 'ajoutee', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...champs, creeLe: now, modifieLe: now, par: qui() });
  return { n, cle, empreinte: courte(h) };
}

// Modifie libellé, établissement, expiration, notes, statut (active / suspendue) ou valeur d'une clé non utilisée
export function modifierCle(state, n, data = {}) {
  exigerProprietaire('modifier une clé de licence');
  const e = catalogue(state).find((x) => x.n === Number(n));
  if (!e) throw new Error('Clé introuvable (ou supprimée).');
  const utilisee = Boolean(utilisation(state, e.n));
  const revoquee = e.statut === 'revoquee';
  const champs = champsLicence(data, e);
  if ((utilisee || revoquee) && champs.expireLe !== undefined) throw new Error(`Cette clé est ${utilisee ? 'déjà utilisée' : 'révoquée'} : sa date d’expiration ne peut plus changer.`);
  if (data.statut !== undefined && data.statut !== e.statut) {
    if (!['active', 'suspendue'].includes(data.statut)) throw new Error('Statut invalide : utilisez « Révoquer » ou « Supprimer » pour les autres opérations.');
    if (utilisee) throw new Error('Cette clé est déjà utilisée : son statut ne peut plus changer.');
    if (revoquee) throw new Error('Cette clé est révoquée : la révocation est définitive.');
    champs.statut = data.statut;
  }
  if (data.cle !== undefined && String(data.cle).trim()) {
    if (utilisee || revoquee) throw new Error(`Cette clé est ${utilisee ? 'déjà utilisée' : 'révoquée'} : sa valeur ne peut plus être remplacée.`);
    champs.empreinte = empreinteNouvelle(state, data.cle);
  }
  if (!Object.keys(champs).length) throw new Error('Aucune modification à enregistrer.');
  return majEntree(state, e.n, champs);
}

// Révocation DÉFINITIVE d'une clé non utilisée : elle reste visible mais n'est plus jamais acceptée
export function revoquerCle(state, n, motif) {
  exigerProprietaire('révoquer une clé de licence');
  const e = catalogue(state).find((x) => x.n === Number(n));
  if (!e) throw new Error('Clé introuvable (ou supprimée).');
  if (utilisation(state, e.n)) throw new Error('Cette clé a déjà été utilisée : elle ne peut plus être révoquée (vous pouvez la supprimer du catalogue).');
  if (e.statut === 'revoquee') throw new Error('Cette clé est déjà révoquée.');
  const m = String(motif || '').trim();
  if (m.length < 3) throw new Error('Indiquez le motif de la révocation.');
  return majEntree(state, e.n, { statut: 'revoquee', revoqueeLe: new Date().toISOString(), motifRevocation: m.slice(0, 200) });
}

// Suppression : retirée du catalogue, archivée (traçabilité) et placée en liste noire ; les années créées avec cette
// clé et toutes les données sont conservées
export function supprimerCle(state, n, motif) {
  exigerProprietaire('supprimer une clé de licence');
  const e = catalogue(state).find((x) => x.n === Number(n));
  if (!e) throw new Error('Clé introuvable ou déjà supprimée.');
  const u = utilisation(state, e.n);
  state.licencesArchives.push({ n: e.n, empreinte: e.empreinte, origine: e.origine, libelle: e.libelle || '', etablissement: e.etablissement || '', expireLe: e.expireLe || '',
    statutAvant: etatCle(state, e), utilisation: u ? { annee: u.annee, date: u.date, par: u.par } : null, supprimeeLe: new Date().toISOString(), par: qui(), motif: String(motif || '').trim().slice(0, 200) });
  state.licencesCatalogue = state.licencesCatalogue.filter((x) => x.n !== e.n);
  state.licences = state.licences.filter((x) => x.n !== e.n);
  // Registres du navigateur mis à jour immédiatement : la suppression ne doit pas être annulée par une fusion
  ecrire(REG_ARCHIVES, state.licencesArchives);
  ecrire(REG_CATALOGUE, state.licencesCatalogue);
  ecrire(REG_UTILISATIONS, lire(REG_UTILISATIONS).filter((x) => x.n !== e.n));
  return { n: e.n, utilisation: u };
}
