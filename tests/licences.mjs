// Licences et compte propriétaire (éditeur) — tests sans navigateur, stockage simulé, aucune clé ni mot de passe réel.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const session = new Map();
globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) };

const auth = await import('../modules/auth.js');
const lic = await import('../modules/licences.js');
const { createAnnee } = await import('../modules/annees.js');
const { migrateState, blankState } = await import('../storage.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const connecter = (u) => session.set('ibk_session_v1', JSON.stringify({ id: u.id, start: Date.now(), last: Date.now() }));

const s = migrateState({});
auth.definirEtablissement(s.config.etablissementId);
const proprio = auth.loadUsers().find((u) => u.proprietaire);
const chef = auth.createUser({ username: 'directeur', nom: 'Directeur', role: 'superadmin', password: 'Direct2026x' }, { premier: true });

t('compte propriétaire présent, super administrateur racine, mot de passe jamais en clair', () => {
  assert.ok(proprio);
  assert.deepEqual([proprio.username, proprio.role, proprio.actif, proprio.creePar], [auth.PROPRIETAIRE.username, 'superadmin', true, null]);
  assert.match(proprio.hash, /^[0-9a-f]{64}$/);
  assert.ok(!('password' in proprio) && !('motDePasse' in proprio) && proprio.salt.length === 32);
  assert.equal(auth.authenticate(auth.PROPRIETAIRE.username, 'mauvais-mot-de-passe-1').ok, false);
  // Le premier lancement crée quand même le super administrateur de l'établissement
  assert.equal(chef.role, 'superadmin');
  assert.throws(() => auth.createUser({ username: auth.PROPRIETAIRE.username, nom: 'X', role: 'admin', password: 'Usurpe2026x' }), /réservé/);
});

t('compte propriétaire rétabli à chaque démarrage (rôle, activité) et identifiant protégé', () => {
  const users = auth.loadUsers();
  const p = users.find((u) => u.proprietaire);
  p.role = 'lecture'; p.actif = false;
  store.set('ibk_users_v1', JSON.stringify(users));
  auth.definirEtablissement(s.config.etablissementId);
  const r = auth.loadUsers().find((u) => u.proprietaire);
  assert.deepEqual([r.role, r.actif], ['superadmin', true]);
});

t('verrouillage par identifiant : un compte bloqué ne bloque pas les autres', () => {
  for (let i = 0; i < 5; i += 1) auth.authenticate('directeur', 'faux-mdp-123');
  assert.match(auth.authenticate('directeur', 'Direct2026x').message, /Trop de tentatives/);
  assert.ok(auth.lockRemainingMs('directeur') > 0);
  assert.equal(auth.lockRemainingMs('autre'), 0);
  store.delete('ibk_login_lock_v1');
  assert.equal(auth.authenticate('directeur', 'Direct2026x').ok, true);
});

t('catalogue : 10 clés d’origine, gérées uniquement par le compte propriétaire', () => {
  connecter(chef);
  auth.activerControleDroits(true);
  try {
    assert.deepEqual(lic.etatLicence(s), { total: 10, disponibles: 10, utilisees: 0, anneesActivees: 0 });
    assert.throws(() => lic.ajouterCle(s, {}), /compte propriétaire/);
    assert.ok(lic.listeLicences(s).every((l) => l.empreinte.length === 10 && !('cle' in l)));
  } finally { auth.activerControleDroits(false); session.clear(); }
  assert.throws(() => lic.ajouterCle(s, {}), /compte propriétaire/); // même hors session
});

let cleA; let cleB; let cleC;
t('ajout de clés par le propriétaire : clé rendue une seule fois, jamais stockée en clair', () => {
  connecter(proprio);
  cleA = lic.ajouterCle(s, { libelle: 'Année 1', etablissement: 'École test' });
  cleB = lic.ajouterCle(s, {});
  cleC = lic.ajouterCle(s, { cle: 'GSS-TESTE-ABCDE-FGHJK-23456' });
  assert.match(cleA.cle, /^GSS-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.ok(!JSON.stringify(s).includes(cleA.cle.replace(/-/g, '')));
  assert.throws(() => lic.ajouterCle(s, { cle: 'GSS-TESTE-ABCDE-FGHJK-23456' }), /existe déjà/);
  assert.equal(lic.etatLicence(s).total, 13);
  session.clear();
});

t('création d’année : clé obligatoire, consommée une seule fois', () => {
  connecter(chef);
  auth.activerControleDroits(true);
  try {
    assert.throws(() => createAnnee(s, { annee: '2030-2031' }), /Clé de licence obligatoire/);
    assert.throws(() => createAnnee(s, { annee: '2030-2031', cleLicence: 'GSS-AAAAA-BBBBB-CCCCC-DDDDD' }), /invalide/);
    const a = createAnnee(s, { annee: '2030-2031', cleLicence: cleA.cle.toLowerCase().replace(/-/g, ' ') });
    assert.equal(a.licence.n, cleA.n);
    assert.throws(() => createAnnee(s, { annee: '2031-2032', cleLicence: cleA.cle }), /déjà été utilisée/);
    assert.equal(lic.verifierCle(s, cleB.cle).valide, true);
  } finally { auth.activerControleDroits(false); session.clear(); }
});

t('une clé utilisée le reste après réinitialisation et restauration d’une ancienne sauvegarde', () => {
  lic.synchroniserLicences(s);
  const reinit = blankState(s);
  lic.synchroniserLicences(reinit);
  assert.throws(() => lic.consommerLicence(reinit, cleA.cle, 'X'), /déjà été utilisée/);
  const ancienne = migrateState({ config: { etablissementId: s.config.etablissementId } }); // sauvegarde d’avant l’utilisation
  lic.synchroniserLicences(ancienne);
  assert.throws(() => lic.consommerLicence(ancienne, cleA.cle, 'X'), /déjà été utilisée/);
});

t('désactivation réversible, révocation définitive, suppression en liste noire', () => {
  connecter(proprio);
  lic.modifierCle(s, cleB.n, { statut: 'suspendue' });
  assert.throws(() => lic.consommerLicence(structuredClone(s), cleB.cle, 'X'), /désactivée/);
  lic.modifierCle(s, cleB.n, { statut: 'active' });
  assert.ok(lic.consommerLicence(structuredClone(s), cleB.cle, 'X'));
  assert.throws(() => lic.revoquerCle(s, cleB.n, ''), /motif/);
  lic.revoquerCle(s, cleB.n, 'Contrat résilié');
  assert.throws(() => lic.modifierCle(s, cleB.n, { statut: 'active' }), /définitive/);
  assert.throws(() => lic.consommerLicence(structuredClone(s), cleB.cle, 'X'), /révoquée/);
  assert.throws(() => lic.revoquerCle(s, cleA.n, 'x x x'), /déjà été utilisée/);
  lic.supprimerCle(s, cleC.n, 'Clé communiquée par erreur');
  assert.throws(() => lic.consommerLicence(structuredClone(s), cleC.cle, 'X'), /supprimée/);
  assert.throws(() => lic.ajouterCle(s, { cle: 'GSS-TESTE-ABCDE-FGHJK-23456' }), /supprimée|existe déjà/);
  assert.equal(lic.archivesLicences(s).length, 1);
  // Expiration
  const d = lic.ajouterCle(s, { expireLe: '2000-01-01' });
  assert.throws(() => lic.consommerLicence(structuredClone(s), d.cle, 'X'), /expiré/);
  session.clear();
});

t('hiérarchie : un administrateur ne gère que les comptes qu’il a créés', () => {
  connecter(chef);
  auth.activerControleDroits(true);
  try {
    const adm1 = auth.createUser({ username: 'adm1', nom: 'Adm Un', role: 'admin', password: 'Admin2026x' });
    const adm2 = auth.createUser({ username: 'adm2', nom: 'Adm Deux', role: 'admin', password: 'Admin2026y' });
    connecter(adm1);
    const caisse = auth.createUser({ username: 'caisse1', nom: 'Caisse', role: 'caissier', password: 'Caisse2026' });
    assert.ok(auth.setUserActive(caisse.id, false));
    assert.throws(() => auth.setUserActive(adm2.id, false), /comptes que vous avez créés/);
    assert.throws(() => auth.setUserActive(chef.id, false), /comptes que vous avez créés/);
    connecter(chef);
    assert.ok(auth.setUserActive(caisse.id, true)); // subordonné indirect
  } finally { auth.activerControleDroits(false); session.clear(); }
});

t('réinitialisation : tous les comptes supprimés sauf les super administrateurs et le compte de l’éditeur', () => {
  connecter(chef);
  auth.activerControleDroits(true);
  try {
    const second = auth.createUser({ username: 'superadjoint', nom: 'Super Adjoint', role: 'superadmin', password: 'Super2026x' });
    auth.createUser({ username: 'compta1', nom: 'Compta', role: 'comptable', password: 'Compta2026' });
    connecter(auth.loadUsers().find((u) => u.username === 'adm1'));
    assert.throws(() => auth.supprimerComptesNonSuperAdmin(), /super administrateur/); // un administrateur ne peut pas
    connecter(chef);
    const supprimes = auth.supprimerComptesNonSuperAdmin();
    assert.ok(supprimes.includes('compta1') && supprimes.includes('adm1') && supprimes.includes('caisse1'));
    const restants = auth.loadUsers().map((u) => u.username).sort();
    assert.deepEqual(restants, [auth.PROPRIETAIRE.username, 'directeur', 'superadjoint'].sort());
    assert.ok(auth.loadUsers().find((u) => u.id === second.id).actif);
  } finally { auth.activerControleDroits(false); session.clear(); }
});

console.log(`${n} tests de licences et du compte propriétaire passés`);
