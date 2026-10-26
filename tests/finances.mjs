// Fonctions financières de GEST SCHOOL SCOLARITÉ : installation vierge, comptes, virements, réductions, frais annexes,
// règlements en attente, corrections, dépenses récurrentes, tableau de bord, créances et journal de sécurité.
// Tests sans navigateur (stockage simulé).
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const session = new Map();
globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) };

const { migrateState, blankState, validateImport } = await import('../storage.js');
const { etatDemo } = await import('./donnees-demo.mjs');
const { createPaiement, cancelPaiement, corrigerPaiement, validatePaiement } = await import('../modules/paiements.js');
const { refreshStatuses } = await import('../modules/finance.js');
const { echeancierSituation } = await import('../modules/allocation.js');
const { createInscription } = await import('../modules/inscriptions.js');
const { createTarif, updateTarif, propagateTarif, duplicateTarif } = await import('../modules/tarifs.js');
const { createClasse } = await import('../modules/classes.js');
const { createAnnee } = await import('../modules/annees.js');
const { createDepense, cancelDepense, createRecurrente, occurrencesDues, enregistrerOccurrence, ignorerOccurrence } = await import('../modules/depenses.js');
const { createCompte, soldesComptes, createVirement, cancelVirement, validateVirement, setCompteActif } = await import('../modules/comptes.js');
const { accorderReduction, retirerReduction, validateReduction } = await import('../modules/reductions.js');
const { enregistrerAttente, confirmerAttente, rejeterAttente, validateAttente } = await import('../modules/attente.js');
const { changerModalite } = await import('../modules/paiements.js');
const { indicateursDashboard } = await import('../modules/dashboard.js');
const { listeCreances, creancesParClasse } = await import('../modules/creances.js');
const { situationCaisse } = await import('../modules/tresorerie.js');
const auth = await import('../modules/auth.js');

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const d0 = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(d0);
const hier = iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 1));

// Année couvrant aujourd'hui, une classe tarifée (3 tranches dont une échue), un élève inscrit sans paiement
function setup() {
  const s = etatDemo();
  s.paiements = [];
  s.inscriptions = [];
  const y = d0.getFullYear();
  Object.assign(s.annees[0], { dateDebut: `${y - 1}-09-01`, dateFin: `${y + 1}-07-15`, statut: 'ouverte' });
  s.tarifs[0].tranches = [
    { id: 1, num: 1, libelle: '1ère tranche', montant: 300000, dateLimite: hier },
    { id: 2, num: 2, libelle: '2ème tranche', montant: 300000, dateLimite: `${y + 1}-01-15` },
    { id: 3, num: 3, libelle: '3ème tranche', montant: 300000, dateLimite: `${y + 1}-04-15` }
  ];
  Object.assign(s.tarifs[0], { montantMensuel: 100000, nbMois: 9, moisDebut: `${y + 1}-01-05`, remiseMaxPct: 10 });
  const i = createInscription(s, { eleveId: 1, anneeId: 1, classeId: 1 });
  propagateTarif(s, s.tarifs[0]);
  refreshStatuses(s);
  return { s, i: s.inscriptions.find((x) => x.id === i.id) };
}
const pay = (s, i, montant, extra = {}) => createPaiement(s, { inscriptionId: i.id, montant, datePaiement: today, modalite: 'tranches', ...extra }, { ignoreDuplicate: true });

t('installation neuve : aucune donnée scolaire, financière ni d’établissement', () => {
  const s = migrateState({});
  ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'depenses', 'paiementsEnAttente', 'virements', 'depensesRecurrentes', 'journal'].forEach((k) => assert.deepEqual(s[k], [], k));
  assert.equal(s.anneeActiveId, null);
  assert.deepEqual([s.config.nom, s.config.sigle, s.config.devise, s.config.telephone, s.config.email, s.config.adresse], ['', '', '', '', '', '']);
  assert.equal(s.comptes.length, 1);
  assert.equal(s.comptes[0].soldeInitial, 0);
  assert.ok(s.config.categories.length > 0 && s.config.categoriesDepense.length > 0);
  assert.equal(s.config.logo, undefined);
});

t('mise à jour du logiciel : données existantes conservées, opérations rattachées au compte principal', () => {
  const ancien = structuredClone(etatDemo());
  delete ancien.comptes;
  ancien.paiements.forEach((p) => { delete p.compteId; });
  const m = migrateState(ancien);
  assert.equal(m.paiements.length, 2);
  assert.equal(m.config.nom, 'Établissement de démonstration');
  assert.ok(m.paiements.every((p) => p.compteId === m.comptes[0].id));
  assert.deepEqual(migrateState(structuredClone(m)), m); // idempotent
  // Les catégories déjà utilisées par des classes restent proposées même si la configuration ne les contient plus
  const c = migrateState({ ...structuredClone(m), config: { ...m.config, categories: ['Lycée'] } });
  assert.ok(c.config.categories.includes('Primaire') && c.config.categories.includes('Collège'));
});

t('import : un fichier étranger ou abîmé est refusé', () => {
  assert.match(validateImport([]), /ne contient pas/);
  assert.match(validateImport({ foo: 1 }), /ne contient pas/);
  assert.match(validateImport({ paiements: 'x' }), /abîmé/);
  assert.equal(validateImport(etatDemo()), '');
});

t('réinitialisation complète : comptes financiers et catégories revenus aux valeurs d’origine, mouvements effacés', () => {
  const { s, i } = setup();
  createCompte(s, { libelle: 'Banque', type: 'banque', soldeInitial: 1000 });
  pay(s, i, 100000);
  const b = blankState(s);
  assert.deepEqual([b.comptes.length, b.comptes[0].soldeInitial, b.config.nom], [1, 0, '']);
  assert.deepEqual([b.paiements.length, b.virements.length, b.paiementsEnAttente.length, b.depensesRecurrentes.length], [0, 0, 0, 0]);
});

t('comptes : soldes par compte, virement interne, annulation, solde insuffisant refusé', () => {
  const { s, i } = setup();
  const banque = createCompte(s, { libelle: 'Banque', type: 'banque', soldeInitial: 50000 });
  pay(s, i, 300000, { mode: 'espece' });
  pay(s, i, 100000, { mode: 'virement' }); // compte proposé : la banque
  createDepense(s, { anneeId: 1, categorie: 'Eau', description: 'Facture', montant: 20000, date: today, demandeur: 'Direction', mode: 'espece' });
  const solde = (id) => soldesComptes(s).find((x) => x.compte.id === id).solde;
  assert.equal(solde(1), 280000);
  assert.equal(solde(banque.id), 150000);
  assert.equal(validateVirement(s, { deId: 1, versId: banque.id, montant: 999999, date: today, motif: 'Dépôt' }).ok, false);
  const v = createVirement(s, { deId: 1, versId: banque.id, montant: 200000, date: today, motif: 'Dépôt en banque' });
  assert.deepEqual([solde(1), solde(banque.id)], [80000, 350000]);
  // Un virement ne change ni les recettes ni les dépenses de la trésorerie
  const caisse = situationCaisse(s, { yearId: 1 });
  assert.deepEqual([caisse.recettes, caisse.depenses], [400000, 20000]);
  cancelVirement(s, v.id, 'Erreur de saisie');
  assert.deepEqual([solde(1), solde(banque.id)], [280000, 150000]);
  assert.equal(s.virements[0].motif, 'Dépôt en banque'); // le motif d'origine est conservé
  assert.throws(() => setCompteActif(s, 1, false), /principal/);
});

t('réductions : remise plafonnée par le tarif, bourse, partie payée jamais touchée, retrait', () => {
  const { s, i } = setup();
  const tarif = s.tarifs[0];
  assert.match(validateReduction(s, i, { type: 'remise', mode: 'pourcentage', valeur: 20, motif: 'Fratrie' }, tarif).message, /au plus 10 %/);
  accorderReduction(s, i, { type: 'remise', mode: 'pourcentage', valeur: 10, motif: 'Fratrie' }, tarif);
  refreshStatuses(s);
  assert.equal(echeancierSituation(i).total, 810000);
  // Paiement puis bourse plus importante : seule la partie non payée est réduite
  pay(s, i, 500000);
  refreshStatuses(s);
  accorderReduction(s, i, { type: 'bourse', mode: 'montant', valeur: 300000, motif: 'Bourse d’excellence' }, tarif);
  refreshStatuses(s);
  const sit = echeancierSituation(i);
  assert.deepEqual([sit.total, sit.paye, sit.reste], [600000, 500000, 100000]);
  assert.equal(i.historiqueReductions.length, 1);
  // Une réduction plus grande que le reste dû est refusée (pas d'avoir implicite)
  assert.match(validateReduction(s, i, { type: 'bourse', mode: 'montant', valeur: 500000, motif: 'x' }, tarif).message, /dépasse/);
  retirerReduction(s, i, 'Bourse retirée');
  refreshStatuses(s);
  assert.equal(echeancierSituation(i).total, 900000);
});

t('réduction conservée lors d’un changement de modalité', () => {
  const { s, i } = setup();
  accorderReduction(s, i, { type: 'remise', mode: 'montant', valeur: 90000, motif: 'Personnel' }, s.tarifs[0]);
  pay(s, i, 100000, { modalite: 'tranches' });
  changerModalite(s, i.id, 'mensuel');
  refreshStatuses(s);
  const sit = echeancierSituation(i);
  assert.equal(sit.total, 900000 - 90000);
  assert.equal(sit.paye, 100000);
});

t('frais annexes et frais d’inscription propres à la classe, créés une seule fois', () => {
  const { s } = setup();
  updateTarif(s, 1, { fraisInscription: 25000, fraisAnnexes: [{ libelle: 'Tenue', montant: 40000 }, { libelle: 'Cantine', montant: 60000 }] });
  const j = createInscription(s, { eleveId: 2, anneeId: 1, classeId: 1 });
  propagateTarif(s, s.tarifs[0]);
  propagateTarif(s, s.tarifs[0]);
  const frais = j.echeances.filter((e) => e.type === 'frais');
  assert.deepEqual(frais.map((e) => [e.libelle, e.montant]), [['Frais d’inscription', 25000], ['Tenue', 40000], ['Cantine', 60000]]);
  assert.equal(s.tarifs[0].historique.length, 1); // version précédente conservée
  // Un frais annexe retiré disparaît pour un élève sans paiement ; il reste pour un élève qui a payé
  pay(s, j, 25000);
  updateTarif(s, 1, { fraisAnnexes: [{ libelle: 'Tenue', montant: 40000 }] });
  propagateTarif(s, s.tarifs[0]);
  assert.equal(j.echeances.filter((e) => e.type === 'frais').length, 3);
});

t('reprise d’un tarif vers une nouvelle année : classe de même nom, jamais de doublon', () => {
  const { s } = setup();
  const a2 = createAnnee(s, { annee: '2099-2100', dateDebut: '2099-09-01', dateFin: '2100-07-01' });
  assert.equal(duplicateTarif(s, 1, a2.id), null); // pas de classe « CP A » en 2099
  createClasse(s, { nom: 'CP A', categorie: 'Primaire', anneeId: a2.id });
  const copie = duplicateTarif(s, 1, a2.id);
  assert.ok(copie && copie.anneeId === a2.id && copie.tranches[0].dateLimite.startsWith('2099'));
  assert.equal(duplicateTarif(s, 1, a2.id), null);
});

t('règlement en attente : hors totaux, confirmation → reçu, rejet tracé, cumul plafonné', () => {
  const { s, i } = setup();
  assert.match(validateAttente(s, { inscriptionId: i.id, montant: 100000, mode: 'espece', reference: 'x', modalite: 'tranches' }).message, /chèque/);
  assert.match(validateAttente(s, { inscriptionId: i.id, montant: 100000, mode: 'cheque', reference: '', modalite: 'tranches' }).message, /référence/);
  const a = enregistrerAttente(s, { inscriptionId: i.id, montant: 500000, mode: 'cheque', reference: 'CHQ 0001', modalite: 'tranches', datePaiement: hier });
  refreshStatuses(s);
  assert.equal(echeancierSituation(i).paye, 0);
  assert.equal(indicateursDashboard(s, { yearId: 1 }, today).encaisse, 0);
  assert.match(validateAttente(s, { inscriptionId: i.id, montant: 500000, mode: 'virement', reference: 'VIR 2', modalite: 'tranches' }).message, /dépasserait/);
  const p = confirmerAttente(s, a.id, { dateEncaissement: today });
  refreshStatuses(s);
  assert.ok(p.numeroRecu && p.attenteId === a.id);
  assert.equal(echeancierSituation(i).paye, 500000);
  assert.throws(() => confirmerAttente(s, a.id), /déjà traité/);
  const b = enregistrerAttente(s, { inscriptionId: i.id, montant: 100000, mode: 'cheque', reference: 'CHQ 0002', modalite: 'tranches' });
  rejeterAttente(s, b.id, 'Chèque sans provision');
  assert.equal(s.paiementsEnAttente.find((x) => x.id === b.id).statut, 'rejete');
  assert.equal(s.paiements.length, 1);
});

t('correction contrôlée d’un paiement : historique, montant intouchable, paiement annulé refusé', () => {
  const { s, i } = setup();
  const banque = createCompte(s, { libelle: 'Banque', type: 'banque' });
  const p = pay(s, i, 300000);
  assert.throws(() => corrigerPaiement(s, p.id, { reference: 'X' }, ''), /motif/);
  corrigerPaiement(s, p.id, { mode: 'cheque', compteId: banque.id, reference: 'CHQ 9', montant: 1 }, 'Erreur de moyen');
  assert.deepEqual([p.mode, p.compteId, p.reference, p.montant], ['cheque', banque.id, 'CHQ 9', 300000]);
  assert.equal(p.historique[0].avant.mode, 'espece');
  assert.throws(() => corrigerPaiement(s, p.id, { reference: 'CHQ 9' }, 'Rien'), /Aucune modification/);
  cancelPaiement(s, p.id, 'Doublon');
  // (un refus annule la transaction et remplace les objets : on relit le paiement dans l'état)
  assert.equal(s.paiements.find((x) => x.id === p.id).statut, 'annule');
  assert.throws(() => corrigerPaiement(s, p.id, { reference: 'Y' }, 'x'), /annulé/);
});

t('paiement : moyen inconnu ou compte désactivé refusés ; excédent refusé (règle explicite)', () => {
  const { s, i } = setup();
  const c = createCompte(s, { libelle: 'Ancienne caisse', type: 'caisse' });
  setCompteActif(s, c.id, false);
  assert.match(validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today, modalite: 'tranches', compteId: c.id }).message, /désactivé/);
  assert.match(validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today, modalite: 'tranches', mode: 'bitcoin' }).message, /inconnu/);
  assert.match(validatePaiement(s, { inscriptionId: i.id, montant: 900001, datePaiement: today, modalite: 'tranches' }).message, /dépasse le solde/);
});

t('dépense annulée exclue des totaux et des soldes', () => {
  const { s } = setup();
  const d = createDepense(s, { anneeId: 1, categorie: 'Loyer', description: 'Octobre', montant: 70000, date: today, demandeur: 'Direction' });
  assert.equal(situationCaisse(s, { yearId: 1 }).depenses, 70000);
  cancelDepense(s, d.id, 'Erreur');
  assert.equal(situationCaisse(s, { yearId: 1 }).depenses, 0);
  assert.equal(soldesComptes(s)[0].depenses, 0);
  assert.equal(d.statut, 'annulee');
});

t('dépenses récurrentes : échéances signalées, enregistrées une seule fois, ignorables', () => {
  const { s } = setup();
  const debut = iso(new Date(d0.getFullYear(), d0.getMonth() - 2, 5));
  const r = createRecurrente(s, { libelle: 'Loyer', categorie: 'Loyer', montant: 150000, frequence: 'mensuelle', jour: 5, dateDebut: debut });
  const dues = occurrencesDues(s, today);
  assert.ok(dues.length >= 3 && dues[0].enRetard);
  const d = enregistrerOccurrence(s, r.id, dues[0].periode, { anneeId: 1, date: today });
  assert.equal(d.source.periode, dues[0].periode);
  assert.throws(() => enregistrerOccurrence(s, r.id, dues[0].periode, { anneeId: 1 }), /déjà enregistrée/);
  ignorerOccurrence(s, r.id, dues[1].periode);
  assert.equal(occurrencesDues(s, today).length, dues.length - 2);
});

t('tableau de bord : indicateurs calculés sur les données réelles, filtres de flux', () => {
  const { s, i } = setup();
  pay(s, i, 200000, { mode: 'espece' });
  pay(s, i, 50000, { mode: 'mobile_money' });
  createDepense(s, { anneeId: 1, categorie: 'Eau', description: 'Eau', montant: 30000, date: today, demandeur: 'Direction' });
  refreshStatuses(s);
  const k = indicateursDashboard(s, { yearId: 1 }, today);
  assert.deepEqual([k.attendu, k.encaisse, k.reste, k.taux], [900000, 250000, 650000, 28]);
  assert.deepEqual([k.recettesJour, k.depensesJour], [250000, 30000]);
  assert.deepEqual([k.prevuADate, k.realiseADate], [300000, 250000]); // seule la 1re tranche est échue
  assert.equal(k.retardMontant, 50000);
  assert.deepEqual(k.parMode.map((m) => [m.cle, m.value]), [['espece', 200000], ['mobile_money', 50000]]);
  assert.equal(indicateursDashboard(s, { yearId: 1, mode: 'mobile_money' }, today).fluxTotal, 50000);
  // Base vierge : tous les indicateurs à zéro, aucun chiffre inventé
  const v = indicateursDashboard(migrateState({}), {}, today);
  assert.deepEqual([v.attendu, v.encaisse, v.recettesJour, v.depensesJour, v.fluxTotal], [0, 0, 0, 0, 0]);
});

t('créances : retards, ancienneté, réduction et regroupement par classe', () => {
  const { s, i } = setup();
  pay(s, i, 100000);
  refreshStatuses(s);
  const list = listeCreances(s, { yearId: 1 }, today);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].retardMontant, list[0].statut, list[0].joursRetard], [200000, 'retard', 1]);
  assert.equal(listeCreances(s, { yearId: 1, anciennete: 30 }, today).length, 0);
  assert.equal(listeCreances(s, { yearId: 1, reduction: true }, today).length, 0);
  assert.equal(creancesParClasse(s, list)[0].reste, 800000);
});

t('sécurité : connexions refusées et autorisations journalisées sans mot de passe', () => {
  const events = [];
  auth.onSecurityEvent((e) => events.push(e));
  auth.createUser({ username: 'directeur', nom: 'Direction', role: 'admin', password: 'Secret123' });
  assert.equal(auth.authenticate('directeur', 'mauvais1').ok, false);
  assert.equal(auth.authenticate('directeur', 'Secret123').ok, true);
  assert.equal(events.length, 1);
  assert.match(events[0].detail, /refusée.*directeur/);
  assert.ok(!JSON.stringify(events).includes('mauvais1'));
  // Le mot de passe n'est jamais stocké en clair
  assert.ok(!store.get('ibk_users_v1').includes('Secret123'));
});

console.log(`${n} tests financiers passés`);
