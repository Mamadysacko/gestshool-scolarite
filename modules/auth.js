import { confirmDialog } from './dialog.js';
import { ALL_PAGES } from './navigation.js';

// Authentification et rôles côté navigateur. Les comptes sont stockés dans leur propre clé (ils ne figurent
// ni dans les exports, ni dans les sauvegardes, et une réinitialisation des données ne les efface pas).
// Mots de passe : jamais en clair, hachés avec sel. Cela protège contre les erreurs de manipulation et les
// accès occasionnels, mais ne remplace pas une authentification serveur.
const USERS_KEY = 'ibk_users_v1';
const SESSION_KEY = 'ibk_session_v1';
const LOCK_KEY = 'ibk_login_lock_v1';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;
const HASH_ROUNDS = 2000;

// ---------- Rôles et permissions ----------
// Un rôle = des pages consultables + des PERMISSIONS D'ACTION (encaisser, annuler, modifier les tarifs…).
// Les permissions sont vérifiées dans la couche métier (fonction exiger()), pas seulement par l'affichage des boutons.
// Les rôles sont stockés à part, comme les comptes : une réinitialisation des données ne les efface pas.
// Super administrateur et Administrateur ont toujours un accès complet ; seul un super administrateur gère les
// comptes super administrateur et les opérations système (réinitialisation, restauration, import).
const ROLES_KEY = 'ibk_roles_v1';
// Configuration, comptes et sauvegardes : réservés aux administrateurs (le journal d'audit peut être ouvert à un auditeur)
export const ADMIN_ONLY_PAGES = ['config', 'config-utilisateurs', 'config-finances', 'config-donnees', 'licences'];
export const ROLES_ADMIN = ['superadmin', 'admin'];
export const estRoleAdmin = (role) => ROLES_ADMIN.includes(role);

// Catalogue des permissions d'action : [identifiant, libellé, description, sensible]
// Sensible : action d'exception (annulation, correction, réouverture…). Un rôle qui ne la possède pas peut
// l'obtenir ponctuellement par l'accord d'un administrateur (identifiants saisis, opération journalisée).
export const PERMISSIONS = [
  ['eleves.gerer', 'Élèves et inscriptions', 'Créer et modifier les élèves, inscriptions et réinscriptions', false],
  ['scolarite.parametrer', 'Années, classes et tarifs', 'Créer et modifier les années scolaires, classes et tarifs', false],
  ['paiements.encaisser', 'Encaisser', 'Enregistrer les paiements et les règlements en attente, confirmer un encaissement', false],
  ['paiements.annuler', 'Annuler un paiement', 'Annuler un paiement ou rejeter un règlement en attente (motif obligatoire)', true],
  ['paiements.corriger', 'Corriger un paiement', 'Corriger moyen, compte, référence, date d’un paiement (motif obligatoire)', true],
  ['reductions.accorder', 'Accorder une remise', 'Remise dans la limite fixée par le tarif de la classe', false],
  ['reductions.exceptionnelles', 'Bourses et exonérations', 'Accorder une bourse ou une exonération, retirer une réduction', true],
  ['depenses.saisir', 'Saisir des dépenses', 'Enregistrer les dépenses et les dépenses récurrentes', false],
  ['depenses.corriger', 'Corriger ou annuler une dépense', 'Correction ou annulation motivée d’une dépense', true],
  ['tresorerie.virements', 'Virements internes', 'Transférer de l’argent entre caisse et comptes', false],
  ['caisse.operer', 'Ouvrir et fermer la caisse', 'Ouverture, comptage, fermeture de caisse et rapprochement bancaire', false],
  ['tresorerie.corriger', 'Rouvrir une caisse / annuler un virement', 'Réouverture d’une journée clôturée, annulation d’un virement', true],
  ['paie.gerer', 'Paie du personnel', 'Personnel, paie mensuelle, avances', false],
  ['rapports.exporter', 'Exporter et imprimer', 'Exports PDF, Excel, CSV des listes, rapports et états', false]
];
export const PERMISSION_IDS = PERMISSIONS.map(([id]) => id);
export const PERMISSIONS_SENSIBLES = PERMISSIONS.filter((p) => p[3]).map(([id]) => id);
export const permissionLabel = (id) => PERMISSIONS.find(([p]) => p === id)?.[1] || id;
// Droits accordés aux anciens rôles « saisie » (avant les permissions détaillées) : les actions d'exception
// continuaient de demander l'accord d'un administrateur, ce qui reste le cas.
const SAISIE_HISTORIQUE = ['eleves.gerer', 'scolarite.parametrer', 'paiements.encaisser', 'reductions.accorder', 'depenses.saisir', 'tresorerie.virements', 'caisse.operer', 'paie.gerer'];
const PAGES_GESTION = ALL_PAGES.filter((p) => !ADMIN_ONLY_PAGES.includes(p) && p !== 'config-journal');
const PAGES_PAIE = ['paie-dashboard', 'personnel', 'affectations', 'remunerations', 'paie', 'avances', 'paie-rapports'];

export const DEFAULT_ROLES = [
  { id: 'superadmin', label: 'Super administrateur', description: 'Administre l’application : comptes, rôles, sauvegardes, restauration, réinitialisation.', pages: ALL_PAGES, permissions: PERMISSION_IDS, systeme: true },
  { id: 'admin', label: 'Administrateur de l’établissement', description: 'Accès complet à l’établissement ; les opérations système restent au super administrateur.', pages: ALL_PAGES, permissions: PERMISSION_IDS, systeme: true },
  { id: 'directeur', label: 'Directeur', description: 'Pilotage, décisions d’exception (annulations, bourses, réouvertures) et rapports.', pages: [...PAGES_GESTION, 'config-journal'], permissions: PERMISSION_IDS, systeme: true },
  { id: 'comptable', label: 'Comptable', description: 'Scolarité, tarifs, encaissements, dépenses, trésorerie, paie et rapports.', pages: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'creances', 'encaissements-analyse', 'dettes', 'depenses', 'caisse', 'comptes', 'etats', 'paie-dashboard', 'personnel', 'affectations', 'remunerations', 'paie', 'avances', 'paie-rapports', 'rapports', 'aide'], permissions: [...SAISIE_HISTORIQUE, 'rapports.exporter'], systeme: true },
  { id: 'caissier', label: 'Caissier', description: 'Encaissements, caisse et dépenses courantes ; ne modifie ni les tarifs ni les historiques.', pages: ['dashboard', 'eleves', 'inscriptions', 'paiements', 'creances', 'depenses', 'caisse', 'comptes', 'aide'], permissions: ['paiements.encaisser', 'depenses.saisir', 'caisse.operer', 'rapports.exporter'], systeme: true },
  { id: 'lecture', label: 'Auditeur (lecture seule)', description: 'Consulte et exporte les états financiers et le journal d’audit ; aucune saisie, pas d’accès à la paie.', pages: [...PAGES_GESTION.filter((p) => !PAGES_PAIE.includes(p)), 'config-journal'], permissions: ['rapports.exporter'], systeme: true }
];

// Libellés et pages par rôle : objets partagés, mis à jour sur place à chaque modification
export const ROLES = {};
export const ROLE_PAGES = {};
let roleDefs = [];

// Pages ajoutées après la création d'un rôle : accordées une fois aux rôles qui ont déjà la page « parente »
// (version des pages mémorisée dans le rôle, pour qu'un retrait volontaire ne soit jamais annulé)
const PAGES_AJOUTEES = [
  { version: 2, page: 'remunerations', parente: 'personnel' },
  { version: 3, page: 'creances', parente: 'paiements' },
  { version: 3, page: 'comptes', parente: 'depenses' },
  { version: 4, page: 'caisse', parente: 'depenses' },
  { version: 4, page: 'etats', parente: 'rapports' }
];
const VERSION_PAGES = 4;

function normaliserRole(raw) {
  const label = String(raw.label || raw.id).trim().slice(0, 40) || String(raw.id);
  const description = String(raw.description || '').trim().slice(0, 200);
  if (estRoleAdmin(raw.id)) {
    const def = DEFAULT_ROLES.find((d) => d.id === raw.id);
    return { id: raw.id, label: label || def.label, description: description || def.description, pages: [...ALL_PAGES], permissions: [...PERMISSION_IDS], write: true, export: true, systeme: true, versionPages: VERSION_PAGES };
  }
  const pages = [...new Set((Array.isArray(raw.pages) ? raw.pages : []).filter((p) => ALL_PAGES.includes(p)))];
  PAGES_AJOUTEES.forEach((a) => { if (Number(raw.versionPages || 1) < a.version && pages.includes(a.parente) && !pages.includes(a.page)) pages.push(a.page); });
  // Ancien rôle sans permissions détaillées : déduites des cases « saisie » et « export »
  const permissions = Array.isArray(raw.permissions)
    ? [...new Set(raw.permissions.filter((p) => PERMISSION_IDS.includes(p)))]
    : [...(raw.write ? SAISIE_HISTORIQUE : []), ...(raw.export ? ['rapports.exporter'] : [])];
  return {
    id: String(raw.id), label, description,
    pages: pages.filter((p) => !ADMIN_ONLY_PAGES.includes(p)), permissions,
    // Indicateurs dérivés (affichage) : saisie = au moins une action autre que l'export
    write: permissions.some((p) => p !== 'rapports.exporter'), export: permissions.includes('rapports.exporter'),
    systeme: Boolean(raw.systeme), versionPages: VERSION_PAGES
  };
}

function appliquerRoles(list) {
  const defs = list.map(normaliserRole);
  // Les rôles de base existent toujours : un rôle effacé ou une donnée abîmée ne peut pas bloquer l'accès
  DEFAULT_ROLES.forEach((d, i) => { if (!defs.some((r) => r.id === d.id)) defs.splice(Math.min(i, defs.length), 0, normaliserRole(d)); });
  roleDefs = defs;
  Object.keys(ROLES).forEach((k) => delete ROLES[k]);
  Object.keys(ROLE_PAGES).forEach((k) => delete ROLE_PAGES[k]);
  defs.forEach((r) => { ROLES[r.id] = r.label; ROLE_PAGES[r.id] = r.pages; });
}

export function loadRoles() {
  let list = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(ROLES_KEY) || 'null');
    if (Array.isArray(parsed)) list = parsed.filter((r) => r && typeof r === 'object' && r.id);
  } catch (error) { list = []; }
  appliquerRoles(list.length ? list : DEFAULT_ROLES);
  return roleList();
}

function saveRoles() {
  localStorage.setItem(ROLES_KEY, JSON.stringify(roleDefs));
}

export function roleList() {
  const users = loadUsers();
  return roleDefs.map((r) => ({ ...r, pages: [...r.pages], permissions: [...r.permissions], utilisateurs: users.filter((u) => u.role === r.id).length }));
}

export function roleOf(id) {
  return roleDefs.find((r) => r.id === id) || null;
}

// Création (sans id) ou modification d'un rôle. Les rôles administrateurs ne peuvent qu'être renommés.
// `write` / `export` (anciens formulaires) sont acceptés et convertis en permissions.
export function saveRole({ id = '', label, pages = [], permissions, write, export: exp, description }) {
  exiger('admin');
  const nom = String(label || '').trim();
  if (!nom) throw new Error('Donnez un nom au rôle.');
  if (roleDefs.some((r) => r.id !== id && r.label.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) throw new Error('Un rôle porte déjà ce nom.');
  const existing = id ? roleOf(id) : null;
  if (id && !existing) throw new Error('Rôle introuvable.');
  if (id === 'superadmin' && !estSuperAdmin()) throw new Error('Seul un super administrateur peut modifier ce rôle.');
  const allowed = (Array.isArray(pages) ? pages : []).filter((p) => ALL_PAGES.includes(p) && !ADMIN_ONLY_PAGES.includes(p));
  if (!estRoleAdmin(id) && !allowed.length) throw new Error('Cochez au moins une page accessible.');
  const perms = Array.isArray(permissions) ? permissions : [...(write ? SAISIE_HISTORIQUE : []), ...(exp ? ['rapports.exporter'] : [])];
  let role;
  if (existing) {
    role = normaliserRole({ ...existing, label: nom, pages: allowed, permissions: perms, description: description ?? existing.description });
    roleDefs[roleDefs.indexOf(existing)] = role;
  } else {
    const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'role';
    let newId = base;
    for (let n = 2; roleOf(newId); n += 1) newId = `${base}-${n}`;
    role = normaliserRole({ id: newId, label: nom, pages: allowed, permissions: perms, description, systeme: false });
    roleDefs.push(role);
  }
  saveRoles();
  appliquerRoles(roleDefs);
  return roleOf(role.id);
}

export function deleteRole(id) {
  exiger('admin');
  const role = roleOf(id);
  if (!role) throw new Error('Rôle introuvable.');
  if (role.systeme) throw new Error('Les rôles de base ne peuvent pas être supprimés (leurs droits restent modifiables).');
  const count = loadUsers().filter((u) => u.role === id).length;
  if (count) throw new Error(`${count} utilisateur(s) ont ce rôle : attribuez-leur d’abord un autre rôle.`);
  roleDefs = roleDefs.filter((r) => r.id !== id);
  saveRoles();
  appliquerRoles(roleDefs);
  return role;
}

// Rôles de base : droits d'origine rétablis ; les rôles personnalisés sont conservés
export function resetRoles() {
  exiger('admin');
  appliquerRoles([...DEFAULT_ROLES, ...roleDefs.filter((r) => !r.systeme)]);
  saveRoles();
  return roleList();
}

// ---------- SHA-256 (implémentation autonome, synchrone) ----------
const K = [];
const H0 = [];
(function initConstants() {
  let n = 2;
  while (K.length < 64) {
    let prime = true;
    for (let i = 2; i * i <= n; i += 1) if (n % i === 0) { prime = false; break; }
    if (prime) {
      if (H0.length < 8) H0.push((Math.pow(n, 1 / 2) * 4294967296) | 0);
      K.push((Math.pow(n, 1 / 3) * 4294967296) | 0);
    }
    n += 1;
  }
}());

export function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const length = data.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 4294967296));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = H0.slice();
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export function hashPassword(password, salt) {
  let digest = `${salt}:${password}`;
  for (let i = 0; i < HASH_ROUNDS; i += 1) digest = sha256Hex(`${salt}${digest}`);
  return digest;
}

function newSalt() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Compte propriétaire (éditeur) ----------
// Compte de l'éditeur de GEST SCHOOL SCOLARITÉ, présent dans toute installation (comme dans GEST SCHOOL) : super
// administrateur racine de la hiérarchie, seul habilité à gérer le catalogue des clés de licence. Il ne peut être ni
// supprimé, ni désactivé, ni rétrogradé, et seul lui-même peut changer son mot de passe. Le mot de passe n'est JAMAIS
// écrit en clair dans le logiciel : seule son empreinte (SHA-256 salé, 2 000 itérations) figure ici.
// Chaque connexion de ce compte est journalisée ; son existence est indiquée aux établissements (documentation).
export const PROPRIETAIRE = {
  username: 'makossagesshool',
  nom: 'Makossa GestSchool (éditeur)',
  salt: '24e2950cab529cc7453851bb3795935e',
  hash: 'e011a0b176c482a4beca0397ba34625147831bdbeb4ac7d07db5ae5f0907e2fd'
};

// Garantit la présence du compte propriétaire (sans écraser un mot de passe qu'il aurait lui-même changé)
function assurerProprietaire(users) {
  let changed = false;
  let p = users.find((u) => u.proprietaire);
  // Un compte ordinaire portant déjà cet identifiant est renommé (aucune usurpation possible)
  users.filter((u) => !u.proprietaire && u.username === PROPRIETAIRE.username).forEach((u) => { u.username = `${u.username}-${u.id}`; changed = true; });
  if (!p) {
    p = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: PROPRIETAIRE.username, nom: PROPRIETAIRE.nom, role: 'superadmin', salt: PROPRIETAIRE.salt, hash: PROPRIETAIRE.hash, actif: true, proprietaire: true, etablissementId: '*', creePar: null, creeLe: new Date().toISOString() };
    users.push(p);
    changed = true;
  }
  const attendu = { username: PROPRIETAIRE.username, role: 'superadmin', actif: true, etablissementId: '*', creePar: null };
  Object.entries(attendu).forEach(([k, v]) => { if (p[k] !== v) { p[k] = v; changed = true; } });
  if (!p.hash || !p.salt) { p.salt = PROPRIETAIRE.salt; p.hash = PROPRIETAIRE.hash; changed = true; }
  return changed;
}

// ---------- Établissement de l'installation ----------
// Chaque base de données porte un identifiant d'établissement (config.etablissementId) ; chaque compte est rattaché
// à cet identifiant. Un compte d'un autre établissement ne peut pas se connecter, et l'import des données d'un autre
// établissement exige l'accord explicite d'un super administrateur. Le compte propriétaire vaut pour tous.
let etablissement = '';

export function definirEtablissement(id) {
  etablissement = String(id || '');
  const users = loadUsers();
  let changed = assurerProprietaire(users);
  // Comptes des versions précédentes : rattachés à l'établissement de l'installation
  users.forEach((u) => { if (!u.etablissementId && etablissement) { u.etablissementId = etablissement; changed = true; } });
  const locaux = users.filter((u) => !u.proprietaire && duMemeEtablissement(u));
  // Il existe toujours un super administrateur de l'établissement : le plus ancien administrateur actif est promu
  if (locaux.length && !locaux.some((u) => u.role === 'superadmin' && u.actif)) {
    const promu = locaux.filter((u) => u.actif && u.role === 'admin').sort((a, b) => a.id - b.id)[0];
    if (promu) { promu.role = 'superadmin'; changed = true; securityEvent({ action: 'promotion', detail: `${promu.nom} devient super administrateur (mise à niveau des rôles)` }); }
  }
  // Hiérarchie : les comptes sans créateur connu sont rattachés au premier super administrateur de l'établissement
  const racine = locaux.filter((u) => u.role === 'superadmin').sort((a, b) => a.id - b.id)[0];
  locaux.forEach((u) => {
    if (u === racine) { if (u.creePar !== null) { u.creePar = null; changed = true; } return; }
    if (!racine || u.creePar === undefined || (u.creePar !== null && !users.some((x) => x.id === u.creePar))) { if (racine && u.creePar !== racine.id) { u.creePar = racine.id; changed = true; } }
  });
  if (changed) saveUsers(users);
}

function duMemeEtablissement(u) {
  return Boolean(u.proprietaire) || !etablissement || !u.etablissementId || u.etablissementId === etablissement;
}

// Import validé des données d'un autre établissement : les comptes de cette installation y sont rattachés
export function rattacherComptes(nouvelId) {
  exiger('superadmin');
  const users = loadUsers();
  users.forEach((u) => { if (!u.proprietaire) u.etablissementId = String(nouvelId); });
  saveUsers(users);
  etablissement = String(nouvelId);
  securityEvent({ action: 'rattachement', detail: `Comptes rattachés à l’établissement ${String(nouvelId).slice(0, 8)}… après import` });
}

// ---------- Comptes ----------
export function loadUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Comptes de l'établissement (le compte propriétaire n'en fait pas partie : au premier lancement, l'établissement
// crée toujours son propre super administrateur)
export function hasUsers() { return loadUsers().some((u) => !u.proprietaire && duMemeEtablissement(u)); }

export function publicUsers() {
  return loadUsers().filter(duMemeEtablissement).map(({ id, username, nom, role, actif, creeLe, proprietaire, creePar }) => ({ id, username, nom, role, actif, creeLe, proprietaire: Boolean(proprietaire), creePar: creePar ?? null }));
}

export function passwordProblem(password) {
  if (String(password || '').length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return '';
}

// Hiérarchie (comme GEST SCHOOL) : chacun ne gère que les comptes qu'il a créés, directement ou par délégation ;
// jamais lui-même, un pair, un supérieur, ni le compte propriétaire. Le propriétaire gère tous les autres comptes.
export function peutGererCompte(cible, users = loadUsers()) {
  if (!controle || elevation) return !cible?.proprietaire;
  const me = currentUser();
  if (!me || !cible || cible.proprietaire) return false;
  if (me.proprietaire) return true;
  if (cible.id === me.id) return false;
  let parent = cible.creePar;
  for (let n = 0; parent !== null && parent !== undefined && n < 500; n += 1) {
    if (parent === me.id) return true;
    parent = users.find((u) => u.id === parent)?.creePar;
  }
  return false;
}

// Gestion d'un compte : administrateur requis, compte subordonné, rôle super administrateur attribué par un super administrateur
function exigerGestionCompte(cible, roleCible = '') {
  exiger('admin');
  if (cible?.proprietaire) throw new Error('Le compte propriétaire (éditeur) ne peut être ni modifié, ni désactivé, ni rétrogradé.');
  if (!controle || elevation) return;
  if (cible && !peutGererCompte(cible)) {
    securityEvent({ action: 'refus', detail: `Gestion du compte « ${cible.username} » refusée à ${currentUser()?.nom || '—'} (compte non subordonné)` });
    throw new Error('Vous ne pouvez gérer que les comptes que vous avez créés (directement ou par délégation).');
  }
  if ((cible?.role === 'superadmin' || roleCible === 'superadmin') && !estSuperAdmin()) {
    throw new Error('Seul un super administrateur peut gérer un compte super administrateur.');
  }
}

// `premier` : compte créé au tout premier lancement (l'établissement n'a encore aucun compte) — super administrateur racine
export function createUser({ username, nom, role, password }, { premier = false } = {}) {
  if (premier) {
    if (hasUsers()) throw new Error('Le compte initial existe déjà.');
    role = 'superadmin';
  } else exigerGestionCompte(null, role);
  const login = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Identifiant invalide (3 à 30 caractères : lettres, chiffres, point, tiret).');
  if (login === PROPRIETAIRE.username) throw new Error('Cet identifiant est réservé.');
  if (!ROLES[role]) throw new Error('Rôle inconnu.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const users = loadUsers();
  if (users.some((u) => u.username === login)) throw new Error('Cet identifiant existe déjà.');
  const salt = newSalt();
  const createur = premier ? null : (currentUser()?.id ?? null);
  const user = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: login, nom: String(nom || '').trim().slice(0, 80) || login, role, salt, hash: hashPassword(password, salt), actif: true, etablissementId: etablissement, creePar: createur, creeLe: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return user;
}

export function changePassword(userId, password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
  if (!user) throw new Error('Utilisateur introuvable.');
  const me = currentUser();
  if (user.proprietaire && controle && !me?.proprietaire) throw new Error('Seul le compte propriétaire peut changer son propre mot de passe.');
  if (!user.proprietaire && user.id !== me?.id) exigerGestionCompte(user);
  user.salt = newSalt();
  user.hash = hashPassword(password, user.salt);
  user.mdpModifieLe = new Date().toISOString();
  saveUsers(users);
  return true;
}

// Comptes de l'établissement uniquement (le compte propriétaire ne compte jamais comme administrateur de l'établissement)
const adminsActifs = (users) => users.filter((u) => !u.proprietaire && duMemeEtablissement(u) && estRoleAdmin(u.role) && u.actif);
const superAdminsActifs = (users) => users.filter((u) => !u.proprietaire && duMemeEtablissement(u) && u.role === 'superadmin' && u.actif);

// Il reste toujours au moins un administrateur actif, et au moins un super administrateur actif s'il en existe un
function verifierDernierAdmin(users, user, { actif = user.actif, role = user.role } = {}) {
  const restants = adminsActifs(users).filter((u) => u.id !== user.id);
  const etaitAdmin = user.actif && estRoleAdmin(user.role);
  if (etaitAdmin && !(actif && estRoleAdmin(role)) && !restants.length) throw new Error('Il doit rester au moins un administrateur actif.');
  const supers = superAdminsActifs(users).filter((u) => u.id !== user.id);
  if (user.role === 'superadmin' && !(actif && role === 'superadmin') && !supers.length) throw new Error('Il doit rester au moins un super administrateur actif.');
}

export function setUserActive(userId, actif) {
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
  if (!user) throw new Error('Utilisateur introuvable.');
  exigerGestionCompte(user);
  verifierDernierAdmin(users, user, { actif: Boolean(actif) });
  user.actif = Boolean(actif);
  saveUsers(users);
  return user;
}

export function setUserRole(userId, role) {
  if (!ROLES[role]) throw new Error('Rôle inconnu.');
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
  if (!user) throw new Error('Utilisateur introuvable.');
  exigerGestionCompte(user, role);
  verifierDernierAdmin(users, user, { role });
  user.role = role;
  saveUsers(users);
  return user;
}

// Réinitialisation complète : tous les comptes de l'établissement sont supprimés, SAUF les super administrateurs ;
// le compte de l'éditeur est toujours conservé. Les blocages de connexion sont remis à zéro.
export function supprimerComptesNonSuperAdmin() {
  exiger('superadmin');
  const users = loadUsers();
  const gardes = users.filter((u) => u.proprietaire || u.role === 'superadmin' || !duMemeEtablissement(u));
  const supprimes = users.filter((u) => !gardes.includes(u));
  // Les super administrateurs conservés deviennent racines de la nouvelle hiérarchie
  gardes.forEach((u) => { if (!u.proprietaire && u.role === 'superadmin' && supprimes.some((s) => s.id === u.creePar)) u.creePar = null; });
  saveUsers(gardes);
  try { localStorage.removeItem(LOCK_KEY); } catch (error) { /* non bloquant */ }
  if (supprimes.length) securityEvent({ action: 'reinitialisation', detail: `Réinitialisation : ${supprimes.length} compte(s) utilisateur supprimé(s) (${supprimes.map((u) => u.username).join(', ')}) ; super administrateurs conservés` });
  return supprimes.map((u) => u.username);
}

// ---------- Contrôle des droits dans la couche métier ----------
// Activé par l'application après la connexion : chaque fonction métier sensible appelle exiger(permission).
// Sans contrôle actif (tests automatiques, opérations internes), les fonctions restent utilisables directement.
// avecAutorisation() : exécution autorisée ponctuellement par un administrateur (identifiants saisis, journalisée).
let controle = false;
let elevation = 0;

export function activerControleDroits(actif = true) { controle = Boolean(actif); }
export const controleActif = () => controle;

export function avecAutorisation(fn) {
  elevation += 1;
  try { return fn(); } finally { elevation -= 1; }
}

const libelleDroit = (permission) => ({ admin: 'administration', superadmin: 'opération réservée au super administrateur', proprietaire: 'opération réservée au compte propriétaire (éditeur)' })[permission] || permissionLabel(permission);

export function exiger(permission) {
  if (!controle || elevation) return true;
  if (can(permission)) return true;
  const me = currentUser();
  securityEvent({ action: 'refus', detail: `Action refusée à ${me ? me.nom : 'un utilisateur non connecté'} : ${libelleDroit(permission)}` });
  throw new Error(`Votre rôle ne permet pas cette action (${libelleDroit(permission)}).`);
}

// Le compte propriétaire est le seul à gérer le catalogue des licences : le contrôle s'applique toujours,
// même hors session (un établissement ne peut pas se fabriquer ses propres clés)
export function exigerProprietaire(action = 'gérer les licences') {
  if (elevation === 0 && !estProprietaire()) {
    securityEvent({ action: 'refus', detail: `Opération sur les licences refusée à ${currentUser()?.nom || 'un utilisateur non connecté'} : ${action}` });
    throw new Error(`Seul le compte propriétaire (éditeur) peut ${action}.`);
  }
  return true;
}

// ---------- Événements de sécurité ----------
// Connexions réussies ou refusées, blocages, autorisations administrateur refusées, déconnexions :
// transmis à l'application qui les inscrit dans le journal des opérations (jamais de mot de passe).
let securityListener = null;
export function onSecurityEvent(fn) { securityListener = fn; }
function securityEvent(detail) {
  try { securityListener?.(detail); } catch (error) { /* le journal ne doit jamais bloquer la connexion */ }
}

// ---------- Connexion ----------
// Verrouillage PAR IDENTIFIANT (5 échecs → 1 minute), plus un plafond global (20 échecs → 1 minute) contre les
// essais en rafale sur de nombreux identifiants. Un échec sur un compte ne bloque jamais les autres comptes.
const MAX_GLOBAL = 20;
function readLock() {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
    return lock && typeof lock === 'object' && lock.comptes ? lock : { comptes: {}, global: { attempts: 0, until: 0 } };
  } catch (error) { return { comptes: {}, global: { attempts: 0, until: 0 } }; }
}

function writeLock(lock) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (error) { /* non bloquant */ }
}

const normLogin = (username) => String(username || '').trim().toLowerCase().slice(0, 40);

export function lockRemainingMs(username = '', now = Date.now()) {
  const lock = readLock();
  const compte = lock.comptes[normLogin(username)] || {};
  return Math.max(compte.until > now ? compte.until - now : 0, lock.global?.until > now ? lock.global.until - now : 0);
}

// Vérifie des identifiants ; 5 échecs consécutifs sur un identifiant le bloquent 1 minute.
export function authenticate(username, password) {
  const login = normLogin(username);
  const wait = lockRemainingMs(login);
  if (wait) {
    securityEvent({ action: 'blocage', detail: `Tentative de connexion pendant le blocage (identifiant « ${login} »)` });
    return { ok: false, message: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` };
  }
  // Un compte d'un autre établissement n'est jamais reconnu sur cette installation
  const user = loadUsers().find((u) => u.username === login && duMemeEtablissement(u));
  const valid = user && user.actif && hashPassword(String(password || ''), user.salt) === user.hash;
  const lock = readLock();
  if (!valid) {
    const c = lock.comptes[login] || { attempts: 0, until: 0 };
    c.attempts += 1;
    const bloque = c.attempts >= MAX_ATTEMPTS;
    lock.comptes[login] = bloque ? { attempts: 0, until: Date.now() + LOCK_MS } : { attempts: c.attempts, until: 0 };
    lock.global = { attempts: (lock.global?.attempts || 0) + 1, until: 0 };
    if (lock.global.attempts >= MAX_GLOBAL) lock.global = { attempts: 0, until: Date.now() + LOCK_MS };
    writeLock(lock);
    securityEvent({ action: 'echec', detail: `Connexion refusée pour l’identifiant « ${login} »${user && !user.actif ? ' (compte désactivé)' : ''}${bloque ? ' — identifiant bloqué 1 minute' : ''}` });
    return { ok: false, message: user && !user.actif ? 'Ce compte est désactivé.' : 'Identifiant ou mot de passe incorrect.' };
  }
  delete lock.comptes[login];
  lock.global = { attempts: 0, until: 0 };
  writeLock(lock);
  if (user.proprietaire) securityEvent({ action: 'proprietaire', detail: 'Connexion du compte propriétaire (éditeur du logiciel)' });
  return { ok: true, user };
}

// Session de l'onglet (sessionStorage) : conservée à l'actualisation, perdue à la fermeture de l'onglet.
// Elle expire après une période d'inactivité ou une durée maximale ; un compte désactivé perd aussitôt l'accès.
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session && typeof session === 'object' && session.id ? session : null;
  } catch (error) { return null; }
}

function writeSession(session) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) { /* session non disponible */ }
}

export function sessionValid(session, now = Date.now()) {
  return Boolean(session) && now - Number(session.last || 0) < SESSION_IDLE_MS && now - Number(session.start || 0) < SESSION_MAX_MS;
}

export function startSession(user) {
  const now = Date.now();
  writeSession({ id: user.id, start: now, last: now });
  securityEvent({ action: 'connexion', detail: `Connexion de ${user.nom} (${user.username})`, utilisateur: user.nom });
}

export function endSession({ volontaire = false } = {}) {
  const me = volontaire ? currentUser() : null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* session non disponible */ }
  if (me) securityEvent({ action: 'deconnexion', detail: `Déconnexion de ${me.nom}`, utilisateur: me.nom });
}

// Prolonge la session lors d'une activité (au plus une écriture par minute)
export function touchSession() {
  const session = readSession();
  if (!sessionValid(session)) return false;
  if (Date.now() - session.last > 60 * 1000) writeSession({ ...session, last: Date.now() });
  return true;
}

export function currentUser() {
  const session = readSession();
  if (!sessionValid(session)) return null;
  return loadUsers().find((u) => u.id === Number(session.id) && u.actif && duMemeEtablissement(u)) || null;
}

export function currentUserName() {
  const user = currentUser();
  return user ? user.nom : '';
}

export function isAdmin() { return estRoleAdmin(currentUser()?.role); }
export function estSuperAdmin() { return currentUser()?.role === 'superadmin'; }
export function estProprietaire() { return Boolean(currentUser()?.proprietaire); }

// 'read' : consulter ; 'write' : au moins une action de saisie ; 'export' : exporter / imprimer ;
// 'admin' : administrateur ou super administrateur ; 'superadmin' : opérations système ;
// toute autre valeur : permission d'action du catalogue (ex. 'paiements.annuler').
export function can(permission) {
  const role = currentUser()?.role;
  if (!role) return false;
  if (permission === 'read') return true;
  if (permission === 'proprietaire') return estProprietaire();
  if (permission === 'superadmin') return role === 'superadmin';
  if (estRoleAdmin(role)) return true;
  if (permission === 'admin') return false;
  const def = roleOf(role);
  if (!def) return false;
  if (permission === 'write') return Boolean(def.write);
  if (permission === 'export') return Boolean(def.export);
  return def.permissions.includes(permission);
}

export function allowedPages() {
  return ROLE_PAGES[currentUser()?.role] || [];
}

// Autorisation administrateur. Un administrateur connecté passe directement, sauf `reauth: true`
// (opérations destructrices : il doit alors ressaisir son mot de passe). Tout autre rôle doit obtenir
// l'accord d'un administrateur (identifiant + mot de passe), sans changer de session.
// `superadmin: true` : seul un super administrateur peut accorder l'autorisation (opérations système).
export async function requireAdmin(state, reason = 'Cette action est réservée à l’administrateur.', { reauth = false, superadmin = false } = {}) {
  const me = currentUser();
  const habilite = (role) => (superadmin ? role === 'superadmin' : estRoleAdmin(role));
  if (habilite(me?.role) && !reauth) return true;
  const fields = habilite(me?.role)
    ? [{ name: 'username', label: 'Identifiant', value: me.username, required: true }, { name: 'password', label: 'Mot de passe administrateur', type: 'password', required: true }]
    : [{ name: 'username', label: 'Identifiant administrateur', required: true }, { name: 'password', label: 'Mot de passe', type: 'password', required: true }];
  const answer = await confirmDialog({ title: 'Autorisation requise', message: reason, confirmLabel: 'Autoriser', fields });
  if (!answer.ok) return false;
  const check = authenticate(answer.values.username, answer.values.password);
  const accorde = check.ok && habilite(check.user.role);
  securityEvent({ action: accorde ? 'autorisation' : 'refus', detail: `${accorde ? 'Autorisation administrateur accordée' : 'Autorisation administrateur refusée'} à ${me?.nom || 'un utilisateur'} — ${reason}${accorde && check.user.id !== me?.id ? ` (par ${check.user.nom})` : ''}` });
  return accorde;
}

// Rôles enregistrés (ou rôles par défaut) chargés dès le démarrage
loadRoles();
