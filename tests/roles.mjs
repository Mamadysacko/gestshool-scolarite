// Rôles et permissions modifiables, sauvegardes datées : tests sans navigateur (stockage simulé)
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const auth = await import('../modules/auth.js');
const { roleCanTopic } = await import('../modules/aide.js');
const { HELP_TOPICS } = await import('../modules/aide-data.js');
const { backupFileName } = await import('../modules/backup.js');
const { ALL_PAGES } = await import('../modules/navigation.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };

const BASE = ['superadmin', 'admin', 'directeur', 'comptable', 'caissier', 'lecture'];

t('rôles par défaut : super administrateur, administrateur, directeur, comptable, caissier, auditeur', () => {
  const roles = auth.roleList();
  assert.deepEqual(roles.map((r) => r.id), BASE);
  assert.deepEqual(auth.ROLE_PAGES.admin, ALL_PAGES);
  assert.deepEqual(auth.ROLE_PAGES.superadmin, ALL_PAGES);
  // Caissier : encaisse, mais ne modifie ni les tarifs ni les historiques (aucune action d'exception)
  const caissier = auth.roleOf('caissier');
  assert.ok(caissier.permissions.includes('paiements.encaisser'));
  assert.ok(!caissier.permissions.includes('scolarite.parametrer'));
  assert.ok(auth.PERMISSIONS_SENSIBLES.every((p) => !caissier.permissions.includes(p)));
  // Auditeur : lecture seule (aucune saisie), journal d'audit consultable, exports autorisés
  assert.deepEqual(auth.roleOf('lecture').permissions, ['rapports.exporter']);
  assert.ok(auth.ROLE_PAGES.lecture.includes('config-journal'));
  assert.ok(!auth.ROLE_PAGES.lecture.includes('config-utilisateurs'));
  assert.equal(auth.roleOf('comptable').write, true);
  assert.equal(auth.roleOf('lecture').write, false);
  assert.ok(!auth.ROLE_PAGES.comptable.includes('config'));
});

t('modification d’un rôle de base : appliquée et enregistrée', () => {
  auth.saveRole({ id: 'lecture', label: 'Consultation', pages: ['dashboard', 'paiements', 'aide'], write: false, export: true });
  assert.ok(auth.ROLE_PAGES.lecture.includes('paiements'));
  const saved = JSON.parse(store.get('ibk_roles_v1'));
  assert.equal(saved.find((r) => r.id === 'lecture').export, true);
});

t('la configuration reste réservée à l’administrateur, qui ne peut pas être restreint', () => {
  auth.saveRole({ id: 'comptable', label: 'Comptable / Caissier', pages: ['dashboard', 'config'], write: true, export: true });
  assert.deepEqual(auth.ROLE_PAGES.comptable, ['dashboard']);
  auth.saveRole({ id: 'admin', label: 'Direction', pages: ['dashboard'], write: false, export: false });
  assert.deepEqual(auth.ROLE_PAGES.admin, ALL_PAGES);
  assert.equal(auth.roleOf('admin').write, true);
  assert.equal(auth.ROLES.admin, 'Direction');
});

t('rôle personnalisé : création, identifiant unique, nom unique, au moins une page', () => {
  const r = auth.saveRole({ label: 'Secrétariat', pages: ['eleves', 'inscriptions'], write: true });
  assert.equal(r.id, 'secretariat');
  assert.equal(auth.ROLES.secretariat, 'Secrétariat');
  assert.throws(() => auth.saveRole({ label: 'secrétariat', pages: ['eleves'] }), /déjà ce nom/);
  assert.throws(() => auth.saveRole({ label: 'Vide', pages: [] }), /au moins une page/);
  assert.equal(auth.saveRole({ label: 'Secrétariat 2', pages: ['eleves'] }).id, 'secretariat-2');
});

t('utilisateur : rôle personnalisé attribué puis changé ; rôle utilisé non supprimable', () => {
  const u = auth.createUser({ username: 'marie', nom: 'Marie', role: 'secretariat', password: 'Marie2026x' });
  assert.throws(() => auth.deleteRole('secretariat'), /attribuez-leur/);
  assert.throws(() => auth.deleteRole('lecture'), /rôles de base/);
  auth.setUserRole(u.id, 'lecture');
  assert.equal(auth.deleteRole('secretariat').id, 'secretariat');
  assert.equal(auth.ROLES.secretariat, undefined);
  assert.throws(() => auth.setUserRole(u.id, 'secretariat'), /Rôle inconnu/);
});

t('il reste toujours un administrateur actif', () => {
  const admin = auth.createUser({ username: 'chef', nom: 'Chef', role: 'admin', password: 'Chef20262x' });
  assert.throws(() => auth.setUserRole(admin.id, 'lecture'), /au moins un administrateur/);
});

t('rôles rétablis par défaut ; rôles personnalisés conservés ; données abîmées sans effet', () => {
  auth.resetRoles();
  assert.equal(auth.roleOf('lecture').write, false);
  assert.ok(auth.ROLE_PAGES.comptable.includes('paiements'));
  assert.ok(auth.roleOf('secretariat-2'));
  store.set('ibk_roles_v1', '{abîmé');
  auth.loadRoles();
  assert.deepEqual(auth.roleList().map((r) => r.id), BASE);
  store.set('ibk_roles_v1', JSON.stringify([{ id: 'stagiaire', label: 'Stagiaire', pages: ['aide', 'inconnue'] }]));
  auth.loadRoles();
  assert.deepEqual(auth.roleList().map((r) => r.id), [...BASE, 'stagiaire']);
  assert.deepEqual(auth.ROLE_PAGES.stagiaire, ['aide']);
  assert.deepEqual(auth.roleOf('stagiaire').permissions, []); // ancien rôle sans saisie : aucune permission
});

t('centre d’aide : accès d’un rôle selon ses droits réels', () => {
  const paiement = HELP_TOPICS.find((x) => x.page === 'paiements' && !x.roles.includes('lecture'));
  auth.saveRole({ label: 'Caisse 2', pages: ['paiements'], write: true });
  auth.saveRole({ label: 'Lecteur caisse', pages: ['paiements'], write: false });
  assert.equal(roleCanTopic(paiement, 'caisse-2'), true);
  assert.equal(roleCanTopic(paiement, 'lecteur-caisse'), false);
  assert.equal(roleCanTopic(paiement, 'admin'), true);
});

t('nom de fichier de sauvegarde horodaté', () => {
  assert.match(backupFileName('avant-reinitialisation'), /^sauvegarde-avant-reinitialisation-\d{4}-\d{2}-\d{2}_\d{2}h\d{4}\.note$/);
});

console.log(`${n} tests des rôles passés`);
