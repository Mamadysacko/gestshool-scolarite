import { etatDemo } from './donnees-demo.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex } from '../modules/auth.js';
import { migrateState, blankState } from '../storage.js';
import { createPaiement, cancelPaiement, validatePaiement, changerModalite } from '../modules/paiements.js';
import { refreshStatuses } from '../modules/finance.js';
import { echeancierSituation, previewPaiement } from '../modules/allocation.js';
import { createDepense, cancelDepense, updateDepense } from '../modules/depenses.js';
import { situationCaisse } from '../modules/tresorerie.js';
import { createInscription, generateEcheancesForInscription } from '../modules/inscriptions.js';
import { propagateTarif, createTarif } from '../modules/tarifs.js';
import { createClasse } from '../modules/classes.js';
import { withTransaction } from '../modules/transaction.js';
import { soldesReportables, reporterSoldes, situationReliquat, detteRestante } from '../modules/reliquats.js';
import { rappelsDus } from '../modules/rappels.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const d0 = new Date();
const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;

t('sha256 identique à node:crypto', () => {
  for (const s of ['', 'abc', 'é'.repeat(40), 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(200)]) {
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  }
});

function fresh() {
  const s = etatDemo();
  s.paiements = []; s.depenses = [];
  s.inscriptions[0].echeances.forEach((e) => { e.montantPaye = 0; });
  refreshStatuses(s);
  return s;
}
const pay = (s, montant, extra = {}) => createPaiement(s, { inscriptionId: 1, montant, datePaiement: today, ...extra });

t('migration: classes sans niveau/salle, paiements avec imputations', () => {
  const s = migrateState({ classes: [{ id: 1, nom: 'X', niveau: '6e', salle: 'A', anneeId: 1 }], paiements: [{ id: 1, inscriptionId: 1, echeanceId: 101, montant: 5 }] });
  assert.equal('niveau' in s.classes[0], false);
  assert.equal('salle' in s.classes[0], false);
  assert.deepEqual(s.paiements[0].allocations, [{ echeanceId: 101, montant: 5 }]);
});

t('migration des anciennes données : tarif mensuel et modalités sans perte', () => {
  const old = migrateState({
    tarifs: [{ id: 1, classeId: 1, anneeId: 1, montantAnnuel: 900000, mensuel: true, nbMois: 9, tranches: [] }, { id: 2, classeId: 2, anneeId: 1, montantAnnuel: 600000, tranches: [] }],
    inscriptions: [
      { id: 1, eleveId: 1, anneeId: 1, classeId: 1, echeances: [{ id: 11, trancheId: 1, montant: 100000, montantPaye: 0, mensualite: true }] },
      { id: 2, eleveId: 2, anneeId: 1, classeId: 2, echeances: [{ id: 21, trancheId: 1, montant: 300000, montantPaye: 0 }] }
    ],
    paiements: [{ id: 1, inscriptionId: 1, echeanceId: 11, montant: 100000, datePaiement: '2025-10-01' }]
  });
  assert.equal(old.tarifs[0].montantMensuel, 100000);
  assert.equal('mensuel' in old.tarifs[0], false);
  assert.equal(old.tarifs[1].montantMensuel, 0);
  assert.equal(old.inscriptions[0].modalite, 'mensuel'); // déjà payée : modalité conservée
  assert.equal(old.inscriptions[1].modalite, null); // jamais payée : à choisir
  assert.equal(old.inscriptions[1].echeances.length, 1); // échéancier conservé
  // une deuxième migration ne change rien
  assert.deepEqual(migrateState(structuredClone(old)), old);
});

t('paiement partiel sur 1re tranche', () => {
  const s = fresh(); const p = pay(s, 100000);
  assert.equal(p.allocations.length, 1);
  const sit = echeancierSituation(s.inscriptions[0]);
  assert.equal(sit.paye, 100000);
  assert.equal(sit.courante.libelle, 'Tranche 1');
  assert.equal(sit.lignes[0].reste, 200000);
});

t('débordement sur plusieurs tranches', () => {
  const s = fresh(); pay(s, 100000);
  const p = pay(s, 550000);
  assert.deepEqual(p.allocations.map((a) => a.montant), [200000, 300000, 50000]);
  const sit = echeancierSituation(s.inscriptions[0]);
  assert.equal(sit.paye, 650000);
  assert.equal(sit.nbSoldees, 2);
  assert.equal(sit.courante.libelle, 'Tranche 3');
});

t('avance sur tranches futures affichée', () => {
  const s = fresh();
  s.inscriptions[0].echeances.forEach((e) => { e.dateLimite = '2999-01-01'; });
  const prev = previewPaiement(s.inscriptions[0], 400000);
  assert.equal(prev.after.courante.libelle, 'Tranche 2');
  assert.equal(prev.after.avanceMontant, 0);
  const prev2 = previewPaiement(s.inscriptions[0], 100000);
  assert.equal(prev2.after.courante.libelle, 'Tranche 1');
});

t('surplus au-delà de l’année refusé, aucun report', () => {
  const s = fresh(); pay(s, 800000);
  const v = validatePaiement(s, { inscriptionId: 1, montant: 200000, datePaiement: today });
  assert.equal(v.ok, false);
  assert.match(v.message, /autre année/);
  assert.equal(pay(s, 200000), null);
  assert.equal(pay(s, 100000).montant, 100000);
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 1, datePaiement: today }).ok, false);
});

t('validations: montant nul, décimal, futur', () => {
  const s = fresh();
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 0 }).ok, false);
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 10.5 }).ok, false);
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 10, datePaiement: '2999-01-01' }).ok, false);
});

t('doublon et jeton', () => {
  const s = fresh(); pay(s, 1000, { token: 'a' });
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 5, token: 'a', datePaiement: today }).ok, false);
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 1000, datePaiement: today }).duplicate, true);
});

t('annulation conserve l’historique et recalcule', () => {
  const s = fresh(); const p = pay(s, 450000);
  cancelPaiement(s, p.id, 'erreur');
  assert.equal(s.paiements.length, 1);
  assert.equal(s.paiements[0].annule, true);
  assert.equal(echeancierSituation(s.inscriptions[0]).paye, 0);
  assert.equal(cancelPaiement(s, p.id, 'x'), null);
});

// Nouvelle inscription de Moussa (élève 2) en CP A, tarif : 3 × 300 000 ou 9 × 110 000 à partir de janvier 2999
function inscrireMoussa(s, tarifExtra = {}) {
  Object.assign(s.tarifs[0], { montantMensuel: 110000, nbMois: 9, moisDebut: '2999-01-05', ...tarifExtra });
  const i = createInscription(s, { eleveId: 2, anneeId: 1, classeId: 1 });
  generateEcheancesForInscription(s, i.id, s.tarifs[0]);
  refreshStatuses(s);
  return s.inscriptions.find((x) => x.id === i.id);
}

t('inscription : aucun échéancier mensuel automatique, modalité à choisir', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  assert.equal(i.modalite, null);
  assert.equal(i.echeances.length, 3);
  assert.equal(i.echeances.some((e) => e.mensualite), false);
  assert.equal(echeancierSituation(i).total, 900000);
});

t('paiement : la modalité est obligatoire avant validation', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  const v = validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today });
  assert.equal(v.ok, false);
  assert.match(v.message, /modalité/);
  assert.equal(createPaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today }), null);
  assert.equal(s.paiements.length, 0);
});

t('paiement mensuel : échéancier régénéré au montant mensuel du tarif', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  const p = createPaiement(s, { inscriptionId: i.id, montant: 250000, datePaiement: today, modalite: 'mensuel' });
  assert.equal(p.modalite, 'mensuel');
  assert.equal(i.modalite, 'mensuel');
  assert.equal(i.echeances.length, 9);
  assert.ok(i.echeances.every((e) => e.montant === 110000 && e.mensualite));
  assert.deepEqual(p.allocations.map((a) => a.montant), [110000, 110000, 30000]);
  assert.deepEqual(p.allocations.map((a) => a.libelle), ['Janvier 2999', 'Février 2999', 'Mars 2999']);
  const sit = echeancierSituation(i);
  assert.equal(sit.total, 990000);
  assert.equal(sit.nbSoldees, 2);
  assert.equal(sit.courante.libelle, 'Mars 2999');
});

t('changement tranches → mensuel en cours d’année : paiements réimputés, rien perdu ni compté deux fois', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  const p1 = createPaiement(s, { inscriptionId: i.id, montant: 200000, datePaiement: today, modalite: 'tranches' });
  const p2 = createPaiement(s, { inscriptionId: i.id, montant: 150000, datePaiement: today });
  assert.deepEqual(p2.allocations.map((a) => a.montant), [100000, 50000]); // fin de la 1re tranche puis 2e tranche
  // passage au mensuel avec un nouveau paiement : 350 000 déjà payés sont réimputés sur les mois
  const p3 = createPaiement(s, { inscriptionId: i.id, montant: 20000, datePaiement: today, modalite: 'mensuel' });
  assert.equal(i.modalite, 'mensuel');
  assert.equal(s.paiements.length, 3);
  assert.deepEqual(p1.allocations.map((a) => a.montant), [110000, 90000]);
  assert.deepEqual(p2.allocations.map((a) => a.montant), [20000, 110000, 20000]);
  assert.deepEqual(p3.allocations.map((a) => a.montant), [20000]);
  const sit = echeancierSituation(i);
  assert.equal(sit.paye, 370000); // somme exacte des paiements : ni perte ni double comptage
  assert.equal(sit.total, 990000);
  assert.equal(sit.nbSoldees, 3);
  assert.equal(p1.historiqueImputations[0].allocations[0].libelle, '1ère tranche'); // ancienne imputation tracée
  assert.equal(i.historiqueModalites[0].de, 'tranches');
  assert.equal(i.historiqueModalites[0].vers, 'mensuel');
});

t('changement mensuel → tranches (sens inverse) sans paiement supplémentaire', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  createPaiement(s, { inscriptionId: i.id, montant: 330000, datePaiement: today, modalite: 'mensuel' });
  assert.equal(echeancierSituation(i).nbSoldees, 3);
  assert.ok(changerModalite(s, i.id, 'tranches'));
  assert.equal(i.modalite, 'tranches');
  const sit = echeancierSituation(i);
  assert.equal(sit.total, 900000);
  assert.equal(sit.paye, 330000);
  assert.deepEqual(sit.lignes.map((l) => l.paye), [300000, 30000, 0]);
  assert.equal(s.paiements[0].allocations.length, 2);
});

t('changement refusé si les paiements dépassent le total de la nouvelle modalité', () => {
  const s = fresh();
  const i = inscrireMoussa(s, { montantMensuel: 90000, nbMois: 9 }); // mensuel = 810 000 < 900 000
  createPaiement(s, { inscriptionId: i.id, montant: 850000, datePaiement: today, modalite: 'tranches' });
  const v = validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today, modalite: 'mensuel' });
  assert.equal(v.ok, false);
  assert.match(v.message, /dépassent le total/);
  assert.throws(() => changerModalite(s, i.id, 'mensuel'), /dépassent le total/);
  assert.equal(i.modalite, 'tranches'); // rien n'a changé
  assert.equal(echeancierSituation(i).paye, 850000);
});

t('un paiement annulé reste dans l’historique avec ses références', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  const p = createPaiement(s, { inscriptionId: i.id, montant: 50000, datePaiement: today, modalite: 'tranches' });
  cancelPaiement(s, p.id, 'erreur de modalité');
  createPaiement(s, { inscriptionId: i.id, montant: 110000, datePaiement: today, modalite: 'mensuel' });
  const ids = new Set(i.echeances.map((e) => e.id));
  assert.equal(s.paiements[0].allocations.some((a) => ids.has(a.echeanceId)), false);
  assert.equal(s.paiements[0].allocations[0].libelle, '1ère tranche');
});

// Année suivante 2026-2027 avec sa classe et son tarif (2 tranches de 400 000)
function anneeSuivante(s, extra = {}) {
  s.annees.push({ id: 2, annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-01', statut: 'ouverte', soldeInitial: 0, fraisInscription: 50000, fraisReinscription: 30000, ...extra });
  const c = createClasse(s, { nom: 'CE1 A', categorie: 'Primaire', anneeId: 2 });
  s.tarifs.push({ id: 9, classeId: c.id, anneeId: 2, montantAnnuel: 800000, montantMensuel: 0, nbMois: 9, moisDebut: '', tranches: [{ num: 1, libelle: '1ère tranche', montant: 400000, dateLimite: '2999-01-01' }, { num: 2, libelle: '2ème tranche', montant: 400000, dateLimite: '2999-03-01' }] });
  return c;
}

t('frais d’inscription et de réinscription : montant de l’année, enregistré une seule fois', () => {
  const s = fresh();
  const c = anneeSuivante(s);
  s.eleves.push({ id: 3, matricule: 'IBK-2026-0003', nom: 'Bah', prenom: 'Awa', actif: true });
  const nouvelle = createInscription(s, { eleveId: 3, anneeId: 2, classeId: c.id });
  assert.equal(nouvelle.type, 'nouvelle');
  generateEcheancesForInscription(s, nouvelle.id, s.tarifs[1]);
  assert.deepEqual(nouvelle.echeances.map((e) => [e.libelle, e.montant]), [['Frais d’inscription', 50000], ['1ère tranche', 400000], ['2ème tranche', 400000]]);
  // Aminata (déjà inscrite en 2025-2026) : réinscription automatique au montant de l'année
  const re = createInscription(s, { eleveId: 1, anneeId: 2, classeId: c.id });
  assert.equal(re.type, 'reinscription');
  assert.equal(re.echeances[0].libelle, 'Frais de réinscription');
  assert.equal(re.echeances[0].montant, 30000);
  // un changement de modalité ou un nouveau calcul ne duplique jamais les frais
  generateEcheancesForInscription(s, re.id, s.tarifs[1]);
  generateEcheancesForInscription(s, re.id, s.tarifs[1]);
  assert.equal(re.echeances.filter((e) => e.type === 'frais').length, 1);
  // le paiement règle d'abord les frais
  const p = createPaiement(s, { inscriptionId: re.id, montant: 100000, datePaiement: today, modalite: 'tranches' });
  assert.deepEqual(p.allocations.map((a) => [a.libelle, a.montant]), [['Frais de réinscription', 30000], ['1ère tranche', 70000]]);
});

t('dettes antérieures : report explicite seulement, origine conservée, règlement tracé, sans double comptage', () => {
  const s = fresh();
  pay(s, 600000); // Aminata 2025-2026 : reste 300 000
  const c = anneeSuivante(s);
  const re = createInscription(s, { eleveId: 1, anneeId: 2, classeId: c.id });
  generateEcheancesForInscription(s, re.id, s.tarifs[1]);
  // la réinscription ne reporte rien d'elle-même : le solde est seulement proposé au report
  assert.equal((s.reliquats || []).length, 0);
  const reportables = soldesReportables(s, 2);
  assert.deepEqual(reportables.map((x) => [x.inscription.id, x.total, x.paye, x.reste, x.inscritCible]), [[1, 900000, 600000, 300000, true]]);
  assert.equal(reporterSoldes(s, 2, [1]).length, 1);
  assert.equal(reporterSoldes(s, 2, [1]).length, 0); // jamais reporté deux fois
  assert.equal(soldesReportables(s, 2).length, 0);
  assert.throws(() => reporterSoldes(s, 1, [re.id]), /année antérieure/);
  const r = s.reliquats[0];
  assert.deepEqual([r.montantInitial, r.regleAvantReport, r.montantReporte, r.anneeOrigineId, r.anneeReportId], [900000, 600000, 300000, 1, 2]);
  // clôture de l'année d'origine : le règlement de la dette reste possible
  s.annees[0].statut = 'cloturee';
  const reg = createPaiement(s, { inscriptionId: 1, montant: 100000, datePaiement: today, reliquatId: r.id });
  assert.ok(reg);
  assert.equal(reg.reliquatId, r.id);
  assert.equal(reg.anneeId, 1); // créance de 2025-2026…
  assert.equal(reg.anneeEncaissementId, 2); // …encaissée sur 2026-2027
  const sit = situationReliquat(s, r);
  assert.deepEqual([sit.montantReporte, sit.rembourse, sit.reste, sit.statut], [300000, 100000, 200000, 'partiel']);
  // la dette n'est comptée qu'une fois : l'année 2026-2027 ne contient pas les 300 000 de 2025-2026
  assert.equal(echeancierSituation(re).total, 830000);
  assert.equal(detteRestante(s, 1, re.id), 200000);
  // trésorerie : le règlement compte dans les recettes de l'année d'encaissement
  assert.equal(situationCaisse(s, { yearId: 2 }).recettes, 100000);
  assert.equal(situationCaisse(s, { yearId: 1 }).recettes, 600000);
  // hors dette, l'année clôturée reste fermée
  const moussa = inscrireMoussa(s); // inscription de l'année clôturée, sans dette reportée
  assert.match(validatePaiement(s, { inscriptionId: moussa.id, montant: 1000, datePaiement: today, modalite: 'tranches' }).message, /clôturée/);
  // surplus refusé au-delà de la dette
  assert.equal(validatePaiement(s, { inscriptionId: 1, montant: 250000, datePaiement: today, reliquatId: r.id }).ok, false);
  createPaiement(s, { inscriptionId: 1, montant: 200000, datePaiement: today, reliquatId: r.id });
  assert.equal(situationReliquat(s, r).statut, 'solde');
});

t('fiches de rappel : 14 jours avant une tranche, 7 jours avant une mensualité', () => {
  const s = fresh();
  const i = s.inscriptions[0];
  i.echeances.forEach((e, k) => { e.dateLimite = ['2026-03-15', '2026-05-15', '2026-07-15'][k]; });
  assert.equal(rappelsDus(s, [i], '2026-02-28').length, 0); // 15 jours avant : trop tôt
  const t14 = rappelsDus(s, [i], '2026-03-01'); // 14 jours avant
  assert.equal(t14.length, 1);
  assert.deepEqual([t14[0].libelles, t14[0].jours, t14[0].late], ['Tranche 1', 14, false]);
  // mensuel : 7 jours avant chaque mois
  const m = inscrireMoussa(s, { moisDebut: '2026-03-10' });
  createPaiement(s, { inscriptionId: m.id, montant: 1000, datePaiement: today, modalite: 'mensuel' });
  assert.equal(rappelsDus(s, [m], '2026-03-02').length, 0); // 8 jours avant
  const m7 = rappelsDus(s, [m], '2026-03-03');
  assert.deepEqual([m7[0].libelles, m7[0].montant], ['Mars 2026', 109000]);
  // une échéance dépassée reste en rappel, cumulée avec la suivante quand son rappel arrive
  const late = rappelsDus(s, [m], '2026-04-05');
  assert.deepEqual([late[0].libelles, late[0].late, late[0].montant], ['Mars 2026 + Avril 2026', true, 219000]);
  assert.equal(rappelsDus(s, [m], '2026-07-01')[0].libelles, 'Mars 2026 → Juin 2026 (4 mois)'); // juillet (le 10) : rappel seulement à partir du 3
  assert.equal(rappelsDus(s, [m], '2026-07-03')[0].libelles, 'Mars 2026 → Juillet 2026 (5 mois)');
});

t('mensuel indisponible sans montant mensuel ; inscription sans tarif payable après configuration', () => {
  const s = fresh();
  const i = inscrireMoussa(s, { montantMensuel: 0 });
  assert.match(validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today, modalite: 'mensuel' }).message, /montant mensuel/);
  const c = createClasse(s, { nom: 'CM1', categorie: 'Primaire', anneeId: 1 });
  const j = createInscription(s, { eleveId: 2, anneeId: 1, classeId: c.id }) || s.inscriptions.find((x) => x.eleveId === 2);
  s.inscriptions.find((x) => x.id === i.id).classeId = c.id; // élève réaffecté à une classe sans tarif
  assert.match(validatePaiement(s, { inscriptionId: i.id, montant: 1000, datePaiement: today, modalite: 'tranches' }).message, /Aucun tarif/);
  assert.ok(j);
});

t('modification de tarif non rétroactive : élève ayant payé inchangé, élève sans paiement réaligné', () => {
  const s = fresh();
  const i = inscrireMoussa(s);
  createPaiement(s, { inscriptionId: i.id, montant: 110000, datePaiement: today, modalite: 'mensuel' });
  const avant = structuredClone(i.echeances);
  const c = s.classes.find((x) => x.id === i.classeId);
  s.eleves.push({ id: 99, matricule: 'T-99', nom: 'Test', prenom: 'Sans paiement', actif: true });
  const k = createInscription(s, { eleveId: 99, anneeId: 1, classeId: c.id });
  s.tarifs[0].montantMensuel = 120000;
  s.tarifs[0].tranches[2].montant = 350000;
  s.tarifs[0].montantAnnuel = 950000;
  const r = propagateTarif(s, s.tarifs[0]);
  refreshStatuses(s);
  assert.deepEqual(i.echeances.map((e) => e.montant), avant.map((e) => e.montant)); // engagement conservé
  assert.equal(r.preservees >= 1, true);
  assert.equal(k.echeances.filter((e) => e.type !== 'frais').reduce((t, e) => t + e.montant, 0), 950000); // réaligné
});

t('changement d’année: le paiement reste rattaché à son année', () => {
  const s = fresh();
  s.annees.push({ id: 2, annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-01', statut: 'preparation', soldeInitial: 0 });
  const c = createClasse(s, { nom: 'CP A', categorie: 'Primaire', anneeId: 2 });
  const i2 = createInscription(s, { eleveId: 1, anneeId: 2, classeId: c.id });
  generateEcheancesForInscription(s, i2.id, { montantAnnuel: 300000, tranches: [{ num: 1, montant: 300000, dateLimite: '2999-01-01' }] });
  pay(s, 900000);
  assert.equal(s.paiements[0].anneeId, 1);
  assert.equal(echeancierSituation(i2).paye, 0);
});

t('transaction: échec = aucune écriture partielle', () => {
  const s = fresh();
  assert.throws(() => withTransaction(s, () => { s.paiements.push({ id: 99 }); throw new Error('x'); }));
  assert.equal(s.paiements.length, 0);
  withTransaction(s, () => { s.paiements.push({ id: 98 }); return null; });
  assert.equal(s.paiements.length, 0);
});

t('dépenses, solde disponible et période', () => {
  const s = fresh(); s.annees[0].soldeInitial = 50000;
  pay(s, 300000);
  const d = createDepense(s, { anneeId: 1, categorie: 'Divers', description: 'Craie', montant: 20000, date: today, demandeur: 'Directeur' });
  assert.match(d.numero, /^DEP-\d{4}-000001$/);
  let c = situationCaisse(s, { yearId: 1 });
  assert.deepEqual(c, { ouverture: 50000, recettes: 300000, autres: 0, depenses: 20000, solde: 330000 });
  c = situationCaisse(s, { yearId: 1, from: '2999-01-01' });
  assert.equal(c.ouverture, 330000);
  assert.equal(c.solde, 330000);
  cancelDepense(s, d.id, 'erreur');
  assert.equal(situationCaisse(s, { yearId: 1 }).solde, 350000);
  assert.equal(s.depenses.length, 1);
  assert.equal(createDepense(s, { anneeId: 1, categorie: '', description: 'x', montant: 5, demandeur: 'a' }), null);
});

t('correction de dépense garde l’historique', () => {
  const s = fresh();
  const d = createDepense(s, { anneeId: 1, categorie: 'Divers', description: 'A', montant: 100, date: today, demandeur: 'X' });
  updateDepense(s, d.id, { anneeId: 1, categorie: 'Divers', description: 'B', montant: 150, date: today, demandeur: 'X' });
  assert.equal(s.depenses[0].montant, 150);
  assert.equal(s.depenses[0].historique[0].avant.montant, 100);
});

t('remise à zéro complète : données et paramètres effacés, identifiant d’établissement conservé', () => {
  const s = fresh(); pay(s, 1000);
  const b = blankState(s);
  assert.equal(b.paiements.length, 0);
  assert.equal(b.eleves.length, 0);
  assert.equal(b.annees.length, 0);
  assert.equal(b.anneeActiveId, null);
  assert.deepEqual([b.config.nom, b.config.devise, b.journal.length], ['', '', 0]);
  assert.equal(b.config.etablissementId, s.config.etablissementId);
  // sans année : aucune classe, inscription ni tarif ne peut être créé
  assert.equal(createClasse(b, { nom: '6e A', categorie: 'Collège' }), null);
  assert.equal(createTarif(b, { classeId: 1, montantAnnuel: 1000 }), null);
  assert.equal(createInscription(b, { eleveId: 1, classeId: 1 }), null);
  // l'état vide reste stable après migration (pas d'année recréée)
  assert.equal(migrateState(structuredClone(b)).annees.length, 0);
});

console.log(`${n} tests passés`);
