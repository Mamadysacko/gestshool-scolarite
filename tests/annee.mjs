// Années scolaires, reconduction, passage, contacts, arrondis GNF, comptabilité et périodes des rapports
import { etatDemo } from './donnees-demo.mjs';
import assert from 'node:assert/strict';
import { migrateState } from '../storage.js';
import { createAnnee } from '../modules/annees.js';
import { createClasse } from '../modules/classes.js';
import { createTarif, autoTrancheMontants, autoMontantMensuel } from '../modules/tarifs.js';
import { definirProgramme, programmeDeClasse, copierProgramme } from '../modules/programme.js';
import { reconduire, anneePrecedente, apercuReconduction } from '../modules/reconduction.js';
import { setDecision, candidatsPassage, inscrireAdmis, niveauScolaire, classeProposee, recapReinscription } from '../modules/passage.js';
import { definirResponsable, responsablePrincipal, enfantsDuContact, telephoneFamille, migrerContacts } from '../modules/contacts.js';
import { arrondir, repartir, regleArrondi, ecartArrondi } from '../modules/arrondi.js';
import { buildEcheances, formuleMensuelle } from '../modules/modalites.js';
import { createEmploye, saveAffectation } from '../modules/personnel.js';
import { createPaiement } from '../modules/paiements.js';
import { createDepense } from '../modules/depenses.js';
import { situationCaisse } from '../modules/tresorerie.js';
import { refreshStatuses } from '../modules/finance.js';
import { periodeDuRapport, bornesSemaine, semaineDe, bornesMois } from '../modules/rapports-utils.js';
import { buildJournalier, buildTresorerie } from '../modules/rapports-compta.js';
import { buildPeriodique } from '../modules/rapports-periodiques.js';
import { reporterSoldes } from '../modules/reliquats.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };

// 2025-2026 : CP A, CE1 B, 6e A (niveaux reconnus dans le nom) ; deux élèves ; programme et tarif ; une enseignante affectée
function base() {
  const s = etatDemo();
  s.paiements = []; s.depenses = [];
  s.inscriptions[0].echeances.forEach((e) => { e.montantPaye = 0; });
  refreshStatuses(s);
  const cp = s.classes.find((c) => c.nom === 'CP A');
  definirProgramme(s, cp.id, [{ matiereId: 1, coefficient: 2, heuresHebdo: 8 }, { matiereId: 2, coefficient: 2 }]);
  const enseignant = s.typesEmploye.find((x) => x.enseignant).id;
  const fanta = createEmploye(s, { nom: 'Condé', prenom: 'Fanta', typeEmployeId: enseignant, salaireBase: 1200000 });
  saveAffectation(s, { employeId: fanta.id, anneeId: 1, classeId: cp.id });
  return { s, cp, fanta };
}

t('arrondis GNF : paliers, sens, répartition exacte et écart d’arrondi', () => {
  assert.equal(arrondir(83333.33, { pas: 1000, sens: 'proche' }), 83000);
  assert.equal(arrondir(83333.33, { pas: 1000, sens: 'superieur' }), 84000);
  assert.equal(arrondir(83500, { pas: 1000, sens: 'proche' }), 84000);
  assert.equal(arrondir(6666, { pas: 500, sens: 'inferieur' }), 6500);
  assert.equal(arrondir(1234567, { pas: 10000, sens: 'proche' }), 1230000);
  assert.deepEqual(repartir(1000000, 3, { pas: 5000, sens: 'proche' }), [335000, 335000, 330000]);
  assert.deepEqual(repartir(750000, 9, { pas: 1000, sens: 'proche' }).reduce((a, b) => a + b, 0), 750000); // somme exacte
  assert.deepEqual(repartir(10000, 3, { pas: 10000, sens: 'superieur' }), [3333, 3333, 3334]); // palier trop grand : repli sans part négative
  const s = etatDemo();
  assert.deepEqual(regleArrondi(s.config, 'tranches'), { pas: 5000, sens: 'proche' });
  assert.deepEqual(regleArrondi({ arrondis: { tranches: { pas: 7, sens: 'x' } } }, 'tranches'), { pas: 5000, sens: 'proche' });
  assert.deepEqual(autoTrancheMontants(1000000, regleArrondi(s.config, 'tranches')), [335000, 335000, 330000]);
  assert.equal(autoMontantMensuel(750000, 9, regleArrondi(s.config, 'mensualites')), 83000);
  assert.equal(ecartArrondi(83000, 9, 750000, { pas: 1000 }), true);
  assert.equal(ecartArrondi(120000, 9, 900000, { pas: 1000 }), false); // tarif mensuel volontairement majoré
});

t('mensualités : la dernière absorbe l’écart d’arrondi (total = montant annuel exact)', () => {
  const s = etatDemo();
  const tarif = { montantAnnuel: 750000, montantMensuel: 83000, nbMois: 9, moisDebut: '2025-10-01', tranches: [] };
  const inscription = { id: 99, anneeId: 1, echeances: [] };
  const ech = buildEcheances(s, inscription, tarif, 'mensuel');
  assert.deepEqual([ech.length, ech[0].montant, ech[8].montant, ech.reduce((x, e) => x + e.montant, 0)], [9, 83000, 86000, 750000]);
  assert.deepEqual(formuleMensuelle(s, tarif), { mensuel: 83000, nb: 9, dernier: 86000, ajuste: true, total: 750000 });
  // ancien tarif arrondi au franc supérieur (83 334 × 9 = 750 006) : désormais exactement 750 000
  assert.equal(buildEcheances(s, inscription, { ...tarif, montantMensuel: 83334 }, 'mensuel').reduce((x, e) => x + e.montant, 0), 750000);
  // tarif majoré volontaire : inchangé
  assert.equal(buildEcheances(s, inscription, { ...tarif, montantAnnuel: 900000, montantMensuel: 120000 }, 'mensuel').reduce((x, e) => x + e.montant, 0), 1080000);
});

t('reconduction : classes, programmes, frais et affectations copiés ; opérations jamais recopiées ; idempotente', () => {
  const { s, cp } = base();
  const y2 = createAnnee(s, { annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-10' });
  assert.equal(anneePrecedente(s, y2.id).id, 1);
  const avant = { inscriptions: s.inscriptions.length, paiements: s.paiements.length, classes1: JSON.stringify(s.classes.filter((c) => c.anneeId === 1)) };
  assert.deepEqual(apercuReconduction(s, 1, y2.id), { classes: 3, nouvellesClasses: 3, programmes: 1, tarifs: 1, affectations: 1 });
  const bilan = reconduire(s, { sourceId: 1, cibleId: y2.id, classes: true, programmes: true, tarifs: true, affectations: true });
  assert.deepEqual([bilan.classes, bilan.programmes, bilan.tarifs, bilan.affectations], [3, 1, 1, 1]);
  const cp2 = s.classes.find((c) => c.anneeId === y2.id && c.nom === 'CP A');
  assert.deepEqual([cp2.categorie, 'classeSuivante' in cp2, cp2.origineClasseId], ['Primaire', false, cp.id]);
  assert.deepEqual(programmeDeClasse(s, cp2.id).map((p) => [p.matiereId, p.coefficient, p.heuresHebdo]), [[1, 2, 8], [2, 2, 0]]);
  const tarif2 = s.tarifs.find((x) => x.classeId === cp2.id && x.anneeId === y2.id);
  assert.equal(tarif2.montantAnnuel, 900000);
  assert.ok(tarif2.tranches.every((x) => x.dateLimite >= '2026-09-01')); // dates recalculées pour la nouvelle année
  assert.ok(s.affectations.some((a) => a.anneeId === y2.id && a.classeId === cp2.id));
  // aucune opération copiée, année source intacte
  assert.deepEqual([s.inscriptions.length, s.paiements.length, JSON.stringify(s.classes.filter((c) => c.anneeId === 1))], [avant.inscriptions, avant.paiements, avant.classes1]);
  // relancée : rien n'est dupliqué
  const again = reconduire(s, { sourceId: 1, cibleId: y2.id, classes: true, programmes: true, tarifs: true, affectations: true });
  assert.deepEqual([again.classes, again.classesExistantes, again.programmes, again.tarifs, again.affectations], [0, 3, 0, 0, 0]);
  assert.equal(again.ignores.length, 1); // l'affectation existe déjà : signalée, jamais doublée
  assert.equal(s.classes.filter((c) => c.anneeId === y2.id).length, 3);
  assert.throws(() => reconduire(s, { sourceId: 1, cibleId: 1 }), /différente/);
});

t('programme : copie d’une classe à l’autre, coefficients contrôlés', () => {
  const { s, cp } = base();
  const ce1 = s.classes.find((c) => c.nom === 'CE1 B');
  copierProgramme(s, cp.id, ce1.id);
  assert.equal(programmeDeClasse(s, ce1.id).length, 2);
  assert.throws(() => definirProgramme(s, ce1.id, [{ matiereId: 1, coefficient: 50 }]), /Coefficient invalide/);
  assert.throws(() => definirProgramme(s, ce1.id, [{ matiereId: 1 }, { matiereId: 1 }]), /deux fois/);
});

t('passage : décisions obligatoires, classe proposée, inscription groupée sans double inscription', () => {
  const { s } = base();
  const y2 = createAnnee(s, { annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-10', fraisReinscription: 30000 });
  reconduire(s, { sourceId: 1, cibleId: y2.id, classes: true, programmes: true, tarifs: true });
  const moussa = { id: 2 };
  const insc2 = s.inscriptions.push({ id: 2, eleveId: moussa.id, anneeId: 1, classeId: s.classes.find((c) => c.nom === 'CP A' && c.anneeId === 1).id, type: 'nouvelle', statut: 'inscrit', echeances: [] });
  assert.ok(insc2);
  let c = candidatsPassage(s, 1, y2.id);
  assert.deepEqual(c.map((x) => [x.eleve.id, x.inscriptible, x.raison]).sort((a, b) => a[0] - b[0]), [[1, false, 'Décision de passage à saisir'], [2, false, 'Décision de passage à saisir']]);
  assert.throws(() => inscrireAdmis(s, y2.id, [{ inscriptionId: 1, classeId: 1 }]), /aucune décision/);
  setDecision(s, 1, 'admis');
  setDecision(s, 2, 'non_admis');
  c = candidatsPassage(s, 1, y2.id);
  const aminata = c.find((x) => x.eleve.id === 1);
  assert.deepEqual([aminata.inscriptible, aminata.proposee.nom], [true, 'CE1 B']);
  assert.equal(c.find((x) => x.eleve.id === 2).raison, 'Non admis(e)');
  const [nouvelle] = inscrireAdmis(s, y2.id, [{ inscriptionId: 1, classeId: aminata.proposee.id }]);
  assert.deepEqual([nouvelle.type, nouvelle.anneeId, nouvelle.origineInscriptionId, nouvelle.echeances[0].libelle], ['reinscription', y2.id, 1, 'Frais de réinscription']);
  assert.throws(() => inscrireAdmis(s, y2.id, [{ inscriptionId: 1, classeId: aminata.proposee.id }]), /déjà inscrit/);
  assert.equal(candidatsPassage(s, 1, y2.id).find((x) => x.eleve.id === 1).raison, 'Déjà inscrit(e) pour cette année');
  // redoublement : même classe
  setDecision(s, 2, 'redouble');
  assert.equal(candidatsPassage(s, 1, y2.id).find((x) => x.eleve.id === 2).proposee.nom, 'CP A');
});

t('passage automatique : niveaux reconnus (Guinée et France), section conservée, terminale, choix manuel, récapitulatif', () => {
  const rang = (nom) => niveauScolaire(nom)?.rang ?? null;
  assert.deepEqual(['CP1', 'CP A', 'CP2', 'CE1 B', 'ce2', 'CM1', 'CM2 A'].map(rang), [1, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(['7e A', '8ème année B', '9e', '10e année', '11e SM', '12ème SE', 'Terminale SS', 'Tle SM'].map(rang), [7, 8, 9, 10, 11, 12, 13, 13]);
  assert.deepEqual(['6e A', '5e', '4ème B', '3e', '2nde C', 'Seconde', '1ère S', 'Première'].map(rang), [7, 8, 9, 10, 11, 11, 12, 12]);
  assert.equal(niveauScolaire('11e SM').section, 'sm');
  assert.equal(rang('Classe des grands'), null);
  // année 2026-2027 avec deux 8e (A et B) et une 12e SM / SE
  const s = etatDemo();
  const y2 = createAnnee(s, { annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-10', fraisReinscription: 30000 });
  ['7e A', '7e B', '11e SM', 'Terminale SM', 'Groupe X'].forEach((nom) => createClasse(s, { nom, categorie: 'Collège', anneeId: 1, capacite: 2 }));
  ['8e A', '8e B', '12e SM', '12e SE'].forEach((nom) => createClasse(s, { nom, categorie: 'Collège', anneeId: y2.id, capacite: 2 }));
  const cl = (nom, annee) => s.classes.find((c) => c.nom === nom && c.anneeId === annee);
  const inscrire = (id, nom) => { s.eleves.push({ id, matricule: `T-${id}`, nom: `N${id}`, prenom: 'P', actif: true }); s.inscriptions.push({ id: 100 + id, eleveId: id, anneeId: 1, classeId: cl(nom, 1).id, type: 'nouvelle', statut: 'inscrit', echeances: [] }); return 100 + id; };
  const a = inscrire(11, '7e B'); const b = inscrire(12, '11e SM'); const c = inscrire(13, 'Terminale SM'); const d = inscrire(14, 'Groupe X'); const e = inscrire(15, '7e A');
  [a, b, c, d, e].forEach((id) => setDecision(s, id, 'admis'));
  setDecision(s, e, 'redouble');
  const find = (id, choix = {}) => candidatsPassage(s, 1, y2.id, choix).find((x) => x.inscription.id === id);
  assert.equal(find(a).proposee.nom, '8e B'); // niveau supérieur, même section
  assert.equal(find(b).proposee.nom, '12e SM');
  assert.deepEqual([find(c).inscriptible, find(c).raison], [false, 'Fin de scolarité (terminale) : aucune classe supérieure']);
  assert.deepEqual([find(d).inscriptible, find(d).raison], [false, 'Niveau non reconnu : choisissez la classe']);
  assert.deepEqual([find(e).inscriptible, find(e).raison], [false, 'Aucune classe de ce niveau dans l’année cible']); // redoublant de 7e : pas de 7e en 2026-2027
  // choix manuel : prioritaire et vérifié (classe de l'année cible uniquement)
  assert.deepEqual([find(d, { [d]: cl('8e A', y2.id).id }).inscriptible, find(d, { [d]: cl('8e A', y2.id).id }).manuelle], [true, true]);
  assert.equal(find(d, { [d]: cl('7e A', 1).id }).inscriptible, false);
  // récapitulatif : effectifs par classe, capacité, frais de réinscription
  const retenus = [find(a), find(b), find(d, { [d]: cl('8e A', y2.id).id })];
  const recap = recapReinscription(s, 1, y2.id, retenus);
  assert.deepEqual(recap.lignes.map((l) => [l.classe.nom, l.eleves.length, l.depassement]), [['12e SM', 1, false], ['8e A', 1, false], ['8e B', 1, false]]);
  assert.deepEqual([recap.frais, recap.total, recap.admis], [30000, 90000, 3]);
  const [ins] = inscrireAdmis(s, y2.id, [{ inscriptionId: a, classeId: find(a).proposee.id }]);
  assert.deepEqual(ins.passage, { decision: 'admis', depuisClasseId: cl('7e B', 1).id, depuisAnneeId: 1 });
  // section absente dans l'année cible : la classe la moins remplie est proposée (8e B contient déjà 1 élève)
  cl('8e A', y2.id).nom = '8e D';
  const f = inscrire(50, '7e A'); setDecision(s, f, 'admis'); // identifiant distinct de la réinscription créée ci-dessus
  assert.equal(classeProposee(s, s.inscriptions.find((i) => i.id === f), y2.id).nom, '8e D');
});

t('contacts : reprise des anciennes fiches, réutilisation pour une fratrie, contact d’urgence', () => {
  const s = etatDemo();
  assert.equal(s.contacts.length, 2); // « Mamadou Diallo » et « Sory Camara » repris depuis les anciennes fiches
  assert.equal(responsablePrincipal(s, s.eleves[0]).contact.nom, 'Mamadou Diallo');
  s.eleves.push({ id: 3, matricule: 'IBK-3', nom: 'Diallo', prenom: 'Awa', actif: true, responsables: [] });
  const awa = s.eleves[2];
  // même téléphone : le contact existant est réutilisé, sans doublon
  const c = definirResponsable(s, awa, { nom: 'Diallo', prenom: 'Mamadou', lien: 'pere', telephone: '+224 600 000 010', telephone2: '620 11 22 33', urgenceNom: 'Tante Kadi', urgenceTelephone: '628 00 00 00' });
  assert.equal(s.contacts.length, 2);
  assert.equal(c.id, responsablePrincipal(s, s.eleves[0]).contactId);
  assert.deepEqual(enfantsDuContact(s, c.id).map((e) => e.prenom), ['Aminata', 'Awa']);
  assert.deepEqual([awa.parent, awa.responsables[0].lien, awa.urgence.nom, c.telephone2], ['Mamadou Diallo', 'pere', 'Tante Kadi', '620 11 22 33']);
  assert.equal(telephoneFamille(s, awa), '+224 600 000 010');
  // nouveau parent : nouvelle fiche
  definirResponsable(s, awa, { nom: 'Barry', prenom: 'Mariama', lien: 'mere', telephone: '622 22 22 22' });
  assert.equal(s.contacts.length, 3);
  assert.equal(awa.responsables.length, 2);
  assert.equal(responsablePrincipal(s, awa).lien, 'mere');
  migrerContacts(s); // idempotent
  assert.equal(s.contacts.length, 3);
});

t('périodes des rapports : jour, semaine ISO, mois réel, année scolaire officielle', () => {
  const s = etatDemo();
  assert.deepEqual(bornesSemaine('2026-W42'), { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(bornesSemaine('2026-W01'), { from: '2025-12-29', to: '2026-01-04' }); // semaine à cheval sur deux années civiles
  assert.equal(semaineDe('2026-01-01'), '2026-W01');
  assert.deepEqual(bornesMois('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(bornesMois('2026-12'), { from: '2026-12-01', to: '2026-12-31' });
  const p = (f) => { const x = periodeDuRapport(s, f, '2026-10-16'); return [x.from, x.to]; };
  assert.deepEqual(p({ gran: 'jour', refJour: '2026-10-05' }), ['2026-10-05', '2026-10-05']);
  assert.deepEqual(p({ gran: 'semaine', refSemaine: '2026-W42' }), ['2026-10-12', '2026-10-18']);
  assert.deepEqual(p({ gran: 'mois', refMois: '2026-02' }), ['2026-02-01', '2026-02-28']);
  assert.deepEqual(p({ gran: 'annee', yearId: 1 }), ['2025-09-01', '2026-07-15']);
  assert.deepEqual(p({ gran: 'mois' }), ['2026-10-01', '2026-10-31']); // mois courant par défaut
});

t('comptabilité : rapports, caisse et dettes donnent les mêmes totaux ; chaque rapport respecte sa période', () => {
  const s = etatDemo();
  s.paiements = []; s.depenses = [];
  s.inscriptions[0].echeances.forEach((e) => { e.montantPaye = 0; });
  refreshStatuses(s);
  Object.assign(s.annees[0], { soldeInitial: 1000000 });
  const y2 = createAnnee(s, { annee: '2026-2027', dateDebut: '2026-09-01', dateFin: '2027-07-10', statut: 'preparation', soldeInitial: 500000 });
  createPaiement(s, { inscriptionId: 1, montant: 300000, datePaiement: '2025-10-05', modalite: 'tranches' });
  createPaiement(s, { inscriptionId: 1, montant: 100000, datePaiement: '2025-10-06' });
  createDepense(s, { anneeId: 1, date: '2025-10-05', categorie: 'Transport', description: 'Taxi', montant: 20000, demandeur: 'Directeur' });
  // dette 2025-2026 reportée explicitement sur 2026-2027, réglée en 2026 : encaissée sur 2026-2027
  reporterSoldes(s, y2.id, [1]);
  const r = s.reliquats[0];
  createPaiement(s, { inscriptionId: 1, montant: 50000, datePaiement: '2026-10-02', reliquatId: r.id });
  createDepense(s, { anneeId: y2.id, date: '2026-10-03', categorie: 'Fournitures et matériel', description: 'Cahiers', montant: 70000, demandeur: 'Directeur' });
  // journalier du 5 octobre 2025 : uniquement ce jour-là
  const j = buildJournalier(s, { yearId: 1, gran: 'jour', refJour: '2025-10-05' });
  const k = Object.fromEntries(j.kpis.map(([label, v]) => [label, v]));
  assert.deepEqual([k['Solde d’ouverture de la période'], k.Recettes, k.Dépenses, k['Solde de clôture']], [1000000, 300000, 20000, 1280000]);
  // mensuel d'octobre 2026, année 2026-2027 : le règlement de dette figure dans la liste ET dans la caisse
  const m = buildJournalier(s, { yearId: y2.id, gran: 'mois', refMois: '2026-10' });
  const km = Object.fromEntries(m.kpis.map(([label, v]) => [label, v]));
  assert.deepEqual([km['Solde d’ouverture de la période'], km.Recettes, km.Dépenses, km['Résultat de la période'], km['Solde de clôture']], [500000, 50000, 70000, -20000, 480000]);
  assert.equal(m.sections[0].foot.at(-1), 50000);
  assert.match(m.sections[0].rows[0].cells[0], /Dette 2025-2026/);
  assert.equal(km['Solde de clôture'], situationCaisse(s, { yearId: y2.id, from: '2026-10-01', to: '2026-10-31' }).solde);
  // trésorerie annuelle 2025-2026 : bornée aux dates officielles, solde final = caisse de l'année
  const tr = buildTresorerie(s, { yearId: 1, gran: 'annee' });
  assert.equal(tr.sections[0].foot.at(-1), situationCaisse(s, { yearId: 1, from: '2025-09-01', to: '2026-07-15' }).solde);
  assert.equal(tr.sections[0].rows.length, 11); // septembre 2025 → juillet 2026
  // rapport périodique hebdomadaire : semaine du 5 octobre 2025 (lundi 29/09 → dimanche 05/10)
  const per = buildPeriodique(s, { yearId: 1, gran: 'semaine', refSemaine: '2025-W40' }, '');
  assert.equal(per.kpis.find((x) => x[0] === 'Encaissé sur la période')[1], 300000);
});

console.log(`${n} tests années, passage, contacts et comptabilité passés`);
