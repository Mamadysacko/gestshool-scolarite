// Caisse et trésorerie, états financiers, reçus, sauvegardes vérifiables et permissions (partie 2).
// Données de test isolées en mémoire : aucune donnée réelle n'est touchée.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const session = new Map();
globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) };

const { migrateState, FORMAT_VERSION } = await import('../storage.js');
const { etatDemo } = await import('./donnees-demo.mjs');
const { createPaiement, cancelPaiement, corrigerPaiement, validatePaiement } = await import('../modules/paiements.js');
const { refreshStatuses, inscriptionSituation } = await import('../modules/finance.js');
const { echeancierSituation } = await import('../modules/allocation.js');
const { createInscription } = await import('../modules/inscriptions.js');
const { propagateTarif, updateTarif } = await import('../modules/tarifs.js');
const { createDepense, cancelDepense, validateDepense } = await import('../modules/depenses.js');
const { createCompte, soldesComptes, createVirement, cancelVirement } = await import('../modules/comptes.js');
const { accorderReduction } = await import('../modules/reductions.js');
const { ouvrirCaisse, fermerCaisse, rouvrirCaisse, rapprocher, situationJournee, journalDuJour, historiqueSessions } = await import('../modules/caisse.js');
const { situationCaisse } = await import('../modules/tresorerie.js');
const { construireEtat, ETATS, enregistrerBudget, paiementsFiltres } = await import('../modules/etats.js');
const { buildReceiptData, receiptHtml } = await import('../modules/recus.js');
const { creerArchive, lireArchive, extraireParametres, appliquerParametres, empreinteDonnees } = await import('../modules/archive.js');
const { celluleSure } = await import('../modules/utils.js');
const auth = await import('../modules/auth.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const d0 = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(d0);
const hier = iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 1));
const avantHier = iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 2));

function setup() {
  const s = etatDemo();
  s.paiements = []; s.inscriptions = [];
  const y = d0.getFullYear();
  Object.assign(s.annees[0], { dateDebut: `${y - 1}-09-01`, dateFin: `${y + 1}-07-15`, statut: 'ouverte' });
  s.tarifs[0].tranches = [
    { id: 1, num: 1, libelle: '1ère tranche', montant: 300000, dateLimite: avantHier },
    { id: 2, num: 2, libelle: '2ème tranche', montant: 300000, dateLimite: `${y + 1}-01-15` },
    { id: 3, num: 3, libelle: '3ème tranche', montant: 300000, dateLimite: `${y + 1}-04-15` }
  ];
  Object.assign(s.tarifs[0], { montantMensuel: 100000, nbMois: 9, moisDebut: `${y - 1}-09-05`, remiseMaxPct: 20 });
  createInscription(s, { eleveId: 1, anneeId: 1, classeId: 1 });
  createInscription(s, { eleveId: 2, anneeId: 1, classeId: 1 });
  propagateTarif(s, s.tarifs[0]);
  refreshStatuses(s);
  return { s, i1: s.inscriptions[0], i2: s.inscriptions[1] };
}
const pay = (s, i, montant, extra = {}) => createPaiement(s, { inscriptionId: i.id, montant, datePaiement: today, modalite: 'tranches', ...extra }, { ignoreDuplicate: true });

// ---------- Paiements et calculs ----------
t('paiements : complet, partiel, plusieurs pour un même élève, tranches et mensualités', () => {
  const { s, i1, i2 } = setup();
  pay(s, i1, 300000); // tranche 1 complète
  pay(s, i1, 100000); // partiel sur la 2e
  pay(s, i1, 50000);
  refreshStatuses(s);
  const sit = echeancierSituation(i1);
  assert.deepEqual([sit.paye, sit.reste, sit.lignes.map((l) => l.statut).join(',')], [450000, 450000, 'soldee,partielle,impayee']);
  pay(s, i2, 250000, { modalite: 'mensuel' });
  refreshStatuses(s);
  const m = echeancierSituation(i2);
  assert.equal(m.lignes.length, 9);
  assert.deepEqual(m.lignes.slice(0, 3).map((l) => l.paye), [100000, 100000, 50000]);
});

t('calcul : attendu (réductions et exonérations comprises) − règlements valides = solde restant', () => {
  const { s, i1, i2 } = setup();
  accorderReduction(s, i1, { type: 'remise', mode: 'pourcentage', valeur: 10, motif: 'Fratrie' }, s.tarifs[0]);
  accorderReduction(s, i2, { type: 'exoneration', motif: 'Enfant du personnel' }, s.tarifs[0]);
  const p = pay(s, i1, 200000);
  pay(s, i1, 100000);
  cancelPaiement(s, p.id, 'Erreur');
  refreshStatuses(s);
  [i1, i2].forEach((i) => {
    const sit = inscriptionSituation(s, i);
    const valides = s.paiements.filter((x) => !x.annule && x.inscriptionId === i.id).reduce((t2, x) => t2 + x.montant, 0);
    assert.equal(sit.total - valides, sit.reste);
  });
  assert.deepEqual([inscriptionSituation(s, i1).total, inscriptionSituation(s, i2).total], [810000, 0]);
});

t('doublons : jeton de formulaire et paiement identique dans les 2 minutes', () => {
  const { s, i1 } = setup();
  createPaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: today, modalite: 'tranches', token: 'jeton-1' });
  assert.match(validatePaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: today, modalite: 'tranches', token: 'jeton-1' }).message, /déjà été enregistré/);
  assert.equal(validatePaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: today, modalite: 'tranches' }).duplicate, true);
});

t('totaux par période = transactions valides ; annulées exclues ; virements neutres', () => {
  const { s, i1 } = setup();
  const banque = createCompte(s, { libelle: 'Banque', type: 'banque' });
  pay(s, i1, 100000, { datePaiement: hier });
  const p = pay(s, i1, 50000);
  pay(s, i1, 20000);
  cancelPaiement(s, p.id, 'Doublon');
  const dep = createDepense(s, { anneeId: 1, categorie: 'Eau', description: 'Facture', montant: 8000, date: today, demandeur: 'Direction' });
  createDepense(s, { anneeId: 1, categorie: 'Loyer', description: 'Loyer', montant: 30000, date: today, demandeur: 'Direction' });
  cancelDepense(s, dep.id, 'Erreur');
  const avant = situationCaisse(s, { yearId: 1, from: today, to: today });
  createVirement(s, { deId: 1, versId: banque.id, montant: 60000, date: today, motif: 'Dépôt' });
  const apres = situationCaisse(s, { yearId: 1, from: today, to: today });
  assert.deepEqual([avant.recettes, avant.depenses], [20000, 30000]);
  assert.deepEqual([apres.recettes, apres.depenses], [avant.recettes, avant.depenses]);
  const recettes = construireEtat(s, { type: 'recettes', yearId: 1, gran: 'jour' });
  assert.equal(recettes.total[2], 120000);
  assert.deepEqual(recettes.lignes.map((l) => l[2]), [100000, 20000]);
  const total = soldesComptes(s).reduce((t2, c) => t2 + c.solde, 0);
  assert.equal(total, 120000 - 30000); // le virement ne change pas le total des comptes
});

// ---------- Caisse ----------
t('caisse : ouverture, solde théorique, comptage, écart justifié, verrou et réouverture', () => {
  const { s, i1 } = setup();
  pay(s, i1, 40000, { datePaiement: hier });
  assert.throws(() => ouvrirCaisse(s, { compteId: 1, date: today, montantCompte: 30000 }), /justification est obligatoire/);
  const session1 = ouvrirCaisse(s, { compteId: 1, date: today, montantCompte: 40000 });
  assert.equal(session1.ouverture.theorique, 40000);
  assert.throws(() => ouvrirCaisse(s, { compteId: 1, date: today, montantCompte: 40000 }), /déjà ouverte/);
  const p = pay(s, i1, 25000);
  createDepense(s, { anneeId: 1, categorie: 'Eau', description: 'Eau', montant: 5000, date: today, demandeur: 'Direction' });
  const sit = situationJournee(s, session1);
  assert.deepEqual([sit.entrees, sit.sorties, sit.theorique], [25000, 5000, 60000]);
  assert.throws(() => fermerCaisse(s, session1.id, { montantCompte: 59000 }), /justification est obligatoire/);
  const fermee = fermerCaisse(s, session1.id, { montantCompte: 59000, justification: 'Erreur de rendu de monnaie' });
  assert.deepEqual([fermee.fermeture.theorique, fermee.fermeture.ecart, fermee.statut], [60000, -1000, 'fermee']);
  // La clôture correspond aux mouvements enregistrés ; l'écart ne crée ni recette ni dépense
  assert.equal(soldesComptes(s).find((c) => c.compte.id === 1).solde, 60000);
  // Journée verrouillée : ni annulation, ni correction, ni nouvelle opération datée de ce jour (ou avant) sur la caisse
  assert.throws(() => cancelPaiement(s, p.id, 'x'), /clôturée/);
  assert.throws(() => corrigerPaiement(s, p.id, { reference: 'R' }, 'x'), /clôturée/);
  assert.match(validatePaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: hier, modalite: 'tranches' }).message, /clôturée/);
  assert.match(validateDepense(s, { anneeId: 1, categorie: 'Eau', description: 'x', montant: 1, date: today, demandeur: 'D' }).message, /clôturée/);
  // Réouverture motivée de la dernière journée, puis correction possible
  assert.throws(() => rouvrirCaisse(s, session1.id, ''), /motif/);
  rouvrirCaisse(s, session1.id, 'Correction d’un reçu');
  assert.ok(cancelPaiement(s, p.id, 'Reçu erroné'));
  const refermee = fermerCaisse(s, session1.id, { montantCompte: 35000 });
  assert.deepEqual([refermee.fermeture.theorique, refermee.fermeture.ecart, refermee.historique.length], [35000, 0, 1]);
  // Virement interne vers une banque : interdit dans la journée clôturée, journal du jour cohérent
  const banque = createCompte(s, { libelle: 'Banque', type: 'banque' });
  assert.throws(() => createVirement(s, { deId: 1, versId: banque.id, montant: 1000, date: today, motif: 'Dépôt' }), /clôturée/);
  const j = journalDuJour(s, today).find((x) => x.compte.id === 1);
  assert.deepEqual([j.ouverture, j.entrees, j.sorties, j.cloture], [40000, 0, 5000, 35000]);
  assert.equal(historiqueSessions(s, { agent: '' }).length, 1);
});

t('caisse obligatoire (option) : pas d’opération sur une caisse fermée', () => {
  const { s, i1 } = setup();
  s.config.caisseObligatoire = true;
  assert.match(validatePaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: today, modalite: 'tranches' }).message, /n’est pas ouverte/);
  ouvrirCaisse(s, { compteId: 1, date: today, montantCompte: 0 });
  assert.equal(validatePaiement(s, { inscriptionId: i1.id, montant: 1000, datePaiement: today, modalite: 'tranches' }).ok, true);
});

t('rapprochement bancaire : écart avec le relevé justifié', () => {
  const { s, i1 } = setup();
  const banque = createCompte(s, { libelle: 'Banque', type: 'banque', soldeInitial: 10000 });
  pay(s, i1, 50000, { mode: 'virement', compteId: banque.id });
  assert.throws(() => rapprocher(s, { compteId: banque.id, soldeReleve: 59000 }), /justification/);
  const r = rapprocher(s, { compteId: banque.id, soldeReleve: 59000, justification: 'Frais de tenue de compte' });
  assert.deepEqual([r.theorique, r.ecart], [60000, -1000]);
  assert.throws(() => rapprocher(s, { compteId: 1, soldeReleve: 0 }), /caisse se contrôle/);
  const etat = construireEtat(s, { type: 'clotures' });
  assert.equal(etat.total[8], -1000);
});

// ---------- États financiers ----------
t('états : tous les rapports se construisent, largeurs cohérentes, base vierge sans chiffre', () => {
  const { s, i1 } = setup();
  pay(s, i1, 100000);
  ETATS.forEach((e) => {
    const r = construireEtat(s, { type: e.id, yearId: 1, gran: 'mois' });
    r.lignes.forEach((l) => assert.equal(l.length, r.colonnes.length, e.id));
    if (r.total) assert.equal(r.total.length, r.colonnes.length, e.id);
  });
  const vierge = migrateState({});
  ETATS.forEach((e) => {
    const r = construireEtat(vierge, { type: e.id, gran: 'mois' });
    const nombres = [...r.lignes.flat(), ...(r.total || [])].filter((v) => typeof v === 'number' && v !== 0);
    assert.deepEqual(nombres, [], `${e.id} invente des chiffres`);
  });
});

t('états : filtres par classe, année, date, agent et mode de paiement', () => {
  const { s, i1, i2 } = setup();
  const c2 = s.classes.find((c) => c.id === 2);
  pay(s, i1, 10000, { mode: 'espece', datePaiement: hier });
  pay(s, i1, 20000, { mode: 'mobile_money' });
  const p = pay(s, i2, 40000, { mode: 'cheque' });
  p.utilisateur = 'Agent B';
  i2.classeId = c2.id; // l'élève est ensuite rattaché à une autre classe
  const somme = (f) => paiementsFiltres(s, { yearId: 1, ...f }).reduce((t2, x) => t2 + x.montant, 0);
  assert.equal(somme({}), 70000);
  assert.equal(somme({ classId: 1 }), 30000);
  assert.equal(somme({ classId: c2.id }), 40000);
  assert.equal(somme({ from: today, to: today }), 60000);
  assert.equal(somme({ mode: 'mobile_money' }), 20000);
  assert.equal(somme({ agent: 'Agent B' }), 40000);
  assert.equal(somme({ yearId: 99 }), 0);
  const agents = construireEtat(s, { type: 'agents', yearId: 1 });
  assert.equal(agents.lignes.find((l) => l[0] === 'Agent B')[2], 40000);
  const modes = construireEtat(s, { type: 'modes', yearId: 1 });
  assert.equal(modes.total[2], 70000);
  assert.equal(modes.lignes.reduce((t2, l) => t2 + l[3], 0) >= 99, true);
  session.clear();
});

t('cohérence paiements / reçus / rapports ; réimpression sans nouveau paiement', () => {
  const { s, i1 } = setup();
  const p = pay(s, i1, 350000, { reference: 'MM-123', mode: 'mobile_money' });
  refreshStatuses(s);
  const avant = s.paiements.length;
  const d = buildReceiptData(s, p);
  const { html } = receiptHtml(s, p, 2, { duplicata: true });
  assert.equal(s.paiements.length, avant);
  assert.deepEqual([d.numero, d.montant, d.reference, d.progression.total, d.progression.cumul, d.progression.reste], [p.numeroRecu, 350000, 'MM-123', 900000, 350000, 550000]);
  assert.match(html, /Exemplaire élève[\s\S]*Exemplaire comptabilité/);
  assert.match(html, /DUPLICATA/);
  assert.match(d.periode, /1ère tranche \+ 2ème tranche/);
  const etat = construireEtat(s, { type: 'attendus', yearId: 1 });
  assert.deepEqual([etat.total[6], etat.total[7]], [d.progression.cumul, 900000 * 2 - d.progression.cumul]);
  const tx = construireEtat(s, { type: 'transactions', yearId: 1 });
  assert.ok(tx.lignes.some((l) => l[3] === p.numeroRecu && l[8] === 350000));
});

t('budget prévisionnel et réalisé', () => {
  const { s, i1 } = setup();
  pay(s, i1, 200000);
  createDepense(s, { anneeId: 1, categorie: 'Loyer', description: 'Loyer', montant: 50000, date: today, demandeur: 'D' });
  enregistrerBudget(s, 1, { recettesScolarite: 500000, autresRecettes: 0, depenses: [{ categorie: 'Loyer', montant: 100000 }, { categorie: 'Eau', montant: 20000 }] });
  const b = construireEtat(s, { type: 'budget', yearId: 1 });
  assert.deepEqual(b.lignes.find((l) => l[1] === 'Loyer').slice(2), [100000, 50000, -50000, 50]);
  assert.deepEqual(b.total.slice(2, 4), [500000 - 120000, 200000 - 50000]);
  assert.throws(() => enregistrerBudget(s, 1, { depenses: [{ categorie: 'Eau', montant: 1 }, { categorie: 'Eau', montant: 2 }] }), /qu’une fois/);
});

t('exports : neutralisation des formules dans les CSV', () => {
  assert.deepEqual([celluleSure('=1+1'), celluleSure('+33 6'), celluleSure('@SOMME'), celluleSure(-500), celluleSure('Paiement')], ["'=1+1", "'+33 6", "'@SOMME", -500, 'Paiement']);
});

// ---------- Sauvegarde et restauration (données temporaires) ----------
t('sauvegarde : export complet vérifiable, restauration, intégrité, version, doublon', () => {
  const { s, i1 } = setup();
  pay(s, i1, 123000);
  const archive = creerArchive(s);
  assert.equal(archive.version, FORMAT_VERSION);
  const lu = lireArchive(JSON.stringify(archive));
  assert.equal(lu.type, 'complet');
  assert.deepEqual([lu.data.paiements.length, lu.data.paiements[0].montant], [1, 123000]);
  assert.equal(empreinteDonnees(lu.data), empreinteDonnees(migrateState(structuredClone(s))));
  // Fichier modifié après export → refusé
  const altere = structuredClone(archive);
  altere.data.paiements[0].montant = 999;
  assert.throws(() => lireArchive(JSON.stringify(altere)), /intégrité/);
  // Fichier tronqué → refusé
  assert.throws(() => lireArchive(JSON.stringify(archive).slice(0, 200)), /illisible/);
  // Version plus récente → refusée
  assert.throws(() => lireArchive(JSON.stringify({ ...archive, version: FORMAT_VERSION + 1 })), /plus récente/);
  // Ancien format (état brut) → accepté, signalé comme ancien
  assert.equal(lireArchive(JSON.stringify(etatDemo())).legacy, true);
  // Fichier étranger → refusé
  assert.throws(() => lireArchive(JSON.stringify({ hello: 'world' })), /ne contient pas/);
});

t('sauvegarde des paramètres : appliqués sans toucher aux données ni à l’identifiant', () => {
  const { s } = setup();
  createCompte(s, { libelle: 'Banque centrale', type: 'banque' });
  s.config.nom = 'École A';
  const params = lireArchive(JSON.stringify(creerArchive(s, 'parametres')));
  const autre = etatDemo();
  const id = autre.config.etablissementId;
  const nbPaiements = autre.paiements.length;
  const r = appliquerParametres(autre, params.data);
  assert.deepEqual([autre.config.nom, autre.config.etablissementId, r.comptesAjoutes, autre.paiements.length], ['École A', id, 1, nbPaiements]);
  assert.ok(!('paiements' in extraireParametres(s)));
});

// ---------- Rôles, permissions et validation ----------
t('permissions vérifiées dans la couche métier (contrôle actif)', () => {
  const { s, i1 } = setup();
  auth.definirEtablissement(s.config.etablissementId);
  const sup = auth.createUser({ username: 'chef', nom: 'Chef', role: 'superadmin', password: 'Chef2026x' }, { premier: true });
  auth.activerControleDroits(true);
  try {
    const connecter = (u) => session.set('ibk_session_v1', JSON.stringify({ id: u.id, start: Date.now(), last: Date.now() }));
    connecter(sup);
    const caissier = auth.createUser({ username: 'caisse', nom: 'Caisse', role: 'caissier', password: 'Caisse2026' });
    const auditeur = auth.createUser({ username: 'audit', nom: 'Audit', role: 'lecture', password: 'Audit20266' });
    // Caissier : encaisse, mais ne modifie pas les tarifs, n'annule pas, ne crée pas de compte
    connecter(caissier);
    const p = pay(s, i1, 1000);
    assert.ok(p);
    assert.throws(() => updateTarif(s, 1, { montantAnnuel: 1 }), /ne permet pas/);
    assert.throws(() => cancelPaiement(s, p.id, 'x'), /ne permet pas/);
    assert.throws(() => createCompte(s, { libelle: 'X', type: 'caisse' }), /ne permet pas/);
    assert.throws(() => auth.createUser({ username: 'pirate', nom: 'P', role: 'superadmin', password: 'Pirate2026' }), /ne permet pas/);
    // Annulation possible pour le caissier avec l'accord d'un administrateur (autorisation ponctuelle)
    assert.ok(auth.avecAutorisation(() => cancelPaiement(s, p.id, 'Accord du directeur')));
    // Auditeur : aucune saisie
    connecter(auditeur);
    assert.throws(() => pay(s, i1, 1000), /ne permet pas/);
    assert.throws(() => createDepense(s, { anneeId: 1, categorie: 'Eau', description: 'x', montant: 1, date: today, demandeur: 'D' }), /ne permet pas/);
    // Un administrateur ne peut pas toucher un compte super administrateur
    connecter(sup);
    const admin = auth.createUser({ username: 'adm', nom: 'Adm', role: 'admin', password: 'Admin2026x' });
    connecter(admin);
    assert.throws(() => auth.setUserActive(sup.id, false), /comptes que vous avez créés|super administrateur/);
    assert.throws(() => auth.setUserRole(admin.id, 'superadmin'), /comptes que vous avez créés|super administrateur/);
    // Un compte ne se gère pas lui-même ; même le propriétaire ne peut pas retirer le dernier super administrateur
    connecter(sup);
    assert.throws(() => auth.setUserRole(sup.id, 'admin'), /comptes que vous avez créés/);
    const proprio = auth.loadUsers().find((u) => u.proprietaire);
    connecter(proprio);
    assert.throws(() => auth.setUserRole(sup.id, 'admin'), /au moins un super administrateur/);
    // Le compte propriétaire n'est ni désactivable ni rétrogradable, même par un super administrateur
    connecter(sup);
    assert.throws(() => auth.setUserActive(proprio.id, false), /propriétaire/);
    assert.throws(() => auth.changePassword(proprio.id, 'Autre2026x'), /propriétaire/);
  } finally {
    auth.activerControleDroits(false);
    session.clear();
  }
});

t('établissement : un compte d’une autre organisation ne se connecte pas', () => {
  auth.definirEtablissement('etab-A');
  const u = auth.publicUsers().length;
  auth.definirEtablissement('etab-B');
  assert.deepEqual(auth.publicUsers().filter((u) => !u.proprietaire), []); // seul le compte de l’éditeur vaut pour tous
  assert.equal(auth.authenticate('chef', 'Chef2026x').ok, false);
  auth.definirEtablissement('etab-A');
  assert.equal(auth.publicUsers().length, u);
});

t('validation des entrées : montants, dates, comptes', () => {
  const { s, i1 } = setup();
  const base = { inscriptionId: i1.id, datePaiement: today, modalite: 'tranches' };
  assert.match(validatePaiement(s, { ...base, montant: -5 }).message, /supérieur à zéro/);
  assert.match(validatePaiement(s, { ...base, montant: 10.5 }).message, /entier/);
  assert.match(validatePaiement(s, { ...base, montant: 10, datePaiement: '2999-01-01' }).message, /futur/);
  assert.match(validatePaiement(s, { ...base, montant: 10, compteId: 999 }).message, /introuvable/);
  assert.throws(() => createVirement(s, { deId: 1, versId: 1, montant: 1, date: today, motif: 'x' }), /différents/);
  assert.throws(() => ouvrirCaisse(s, { compteId: 1, date: '2999-01-01', montantCompte: 0 }), /invalide/);
});

console.log(`${n} tests de trésorerie, états, sauvegardes et permissions passés`);
