import { confirmDialog } from './dialog.js';

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

export const ROLES = { admin: 'Administrateur', comptable: 'Comptable / Caissier', lecture: 'Consultation' };

// Pages accessibles par rôle
export const ROLE_PAGES = {
  admin: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'dettes', 'depenses', 'rapports', 'config', 'aide'],
  comptable: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'dettes', 'depenses', 'rapports', 'aide'],
  lecture: ['dashboard', 'analyse', 'rapports', 'aide']
};

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

export function hasUsers() { return loadUsers().length > 0; }

export function publicUsers() {
  return loadUsers().map(({ id, username, nom, role, actif, creeLe }) => ({ id, username, nom, role, actif, creeLe }));
}

export function passwordProblem(password) {
  if (String(password || '').length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return '';
}

export function createUser({ username, nom, role, password }) {
  const login = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Identifiant invalide (3 à 30 caractères : lettres, chiffres, point, tiret).');
  if (!ROLES[role]) throw new Error('Rôle inconnu.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const users = loadUsers();
  if (users.some((u) => u.username === login)) throw new Error('Cet identifiant existe déjà.');
  const salt = newSalt();
  const user = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: login, nom: String(nom || '').trim() || login, role, salt, hash: hashPassword(password, salt), actif: true, creeLe: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return user;
}

export function changePassword(userId, password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId));
  if (!user) throw new Error('Utilisateur introuvable.');
  user.salt = newSalt();
  user.hash = hashPassword(password, user.salt);
  saveUsers(users);
  return true;
}

function activeAdmins(users) { return users.filter((u) => u.role === 'admin' && u.actif); }

export function setUserActive(userId, actif) {
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId));
  if (!user) throw new Error('Utilisateur introuvable.');
  if (!actif && user.role === 'admin' && activeAdmins(users).length <= 1) throw new Error('Il doit rester au moins un administrateur actif.');
  user.actif = Boolean(actif);
  saveUsers(users);
  return user;
}

export function setUserRole(userId, role) {
  if (!ROLES[role]) throw new Error('Rôle inconnu.');
  const users = loadUsers();
  const user = users.find((u) => u.id === Number(userId));
  if (!user) throw new Error('Utilisateur introuvable.');
  if (user.role === 'admin' && role !== 'admin' && activeAdmins(users).length <= 1) throw new Error('Il doit rester au moins un administrateur actif.');
  user.role = role;
  saveUsers(users);
  return user;
}

// ---------- Connexion ----------
function readLock() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); } catch (error) { return {}; }
}

function writeLock(lock) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (error) { /* non bloquant */ }
}

export function lockRemainingMs(now = Date.now()) {
  const lock = readLock();
  return lock.until && lock.until > now ? lock.until - now : 0;
}

// Vérifie des identifiants ; au bout de 5 échecs consécutifs, blocage d'une minute.
export function authenticate(username, password) {
  const wait = lockRemainingMs();
  if (wait) return { ok: false, message: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` };
  const user = loadUsers().find((u) => u.username === String(username || '').trim().toLowerCase());
  const valid = user && user.actif && hashPassword(String(password || ''), user.salt) === user.hash;
  if (!valid) {
    const lock = readLock();
    const attempts = (lock.attempts || 0) + 1;
    writeLock(attempts >= MAX_ATTEMPTS ? { attempts: 0, until: Date.now() + LOCK_MS } : { attempts, until: 0 });
    return { ok: false, message: user && !user.actif ? 'Ce compte est désactivé.' : 'Identifiant ou mot de passe incorrect.' };
  }
  writeLock({ attempts: 0, until: 0 });
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
}

export function endSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* session non disponible */ }
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
  return loadUsers().find((u) => u.id === Number(session.id) && u.actif) || null;
}

export function currentUserName() {
  const user = currentUser();
  return user ? user.nom : '';
}

export function isAdmin() { return currentUser()?.role === 'admin'; }

// 'read' : consulter ; 'write' : créer / modifier des données courantes ; toute autre valeur : administrateur
export function can(permission) {
  const role = currentUser()?.role;
  if (!role) return false;
  if (permission === 'read') return true;
  if (permission === 'write') return role === 'admin' || role === 'comptable';
  return role === 'admin';
}

export function allowedPages() {
  return ROLE_PAGES[currentUser()?.role] || [];
}

// Autorisation administrateur. Un administrateur connecté passe directement, sauf `reauth: true`
// (opérations destructrices : il doit alors ressaisir son mot de passe). Tout autre rôle doit obtenir
// l'accord d'un administrateur (identifiant + mot de passe), sans changer de session.
export async function requireAdmin(state, reason = 'Cette action est réservée à l’administrateur.', { reauth = false } = {}) {
  const me = currentUser();
  if (me?.role === 'admin' && !reauth) return true;
  const fields = me?.role === 'admin'
    ? [{ name: 'username', label: 'Identifiant', value: me.username, required: true }, { name: 'password', label: 'Mot de passe administrateur', type: 'password', required: true }]
    : [{ name: 'username', label: 'Identifiant administrateur', required: true }, { name: 'password', label: 'Mot de passe', type: 'password', required: true }];
  const answer = await confirmDialog({ title: 'Autorisation requise', message: reason, confirmLabel: 'Autoriser', fields });
  if (!answer.ok) return false;
  const check = authenticate(answer.values.username, answer.values.password);
  return check.ok && check.user.role === 'admin';
}
