import { etatDemo } from './donnees-demo.mjs';
import assert from 'node:assert/strict';
import { migrateState, blankState } from '../storage.js';
import { createEmploye, updateEmploye, saveAffectation, saveAffectations, closeAffectation, saveTypeEmploye, saveMatiere, generateMatriculeEmploye, setHeuresMois, heuresDuMois, definirRemuneration, remunerationDefinie } from '../modules/personnel.js';
import { withTransaction } from '../modules/transaction.js';
import { calculerPaie, preparerPaies, majVariables, validerPaie, payerPaie, annulerPaie, paieDuMois, syntheseMois, recapAnnuel, anneePourMois, moisDeLAnnee } from '../modules/paie.js';
import { construireEcheancier, demanderAvance, approuverAvance, refuserAvance, verserAvance, reporterEcheance, rembourserExceptionnel, soldeAvance, totalPreleve, totalExceptionnel, appliquerPrelevement } from '../modules/avances.js';
import { situationCaisse } from '../modules/tresorerie.js';
import { cancelDepense, updateDepense } from '../modules/depenses.js';
import { createClasse } from '../modules/classes.js';
import { definirProgramme } from '../modules/programme.js';
import { ROLE_PAGES } from '../modules/auth.js';
import { ALL_PAGES } from '../modules/navigation.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const d0 = new Date();
const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
const moisCourant = today.slice(0, 7);
const moisPrecedent = (() => { const d = new Date(d0.getFullYear(), d0.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

// État de test : une année couvrant le mois courant, deux classes de collège avec leur programme, un directeur,
// une institutrice et un professeur, tous payés au mois
function setup() {
  const s = etatDemo();
  const y = d0.getFullYear();
  Object.assign(s.annees[0], { dateDebut: `${y - 1}-01-01`, dateFin: `${y + 1}-12-31`, statut: 'ouverte' });
  const cp = s.classes[0];
  const sixieme = s.classes.find((c) => c.categorie === 'Collège');
  const cinquieme = createClasse(s, { nom: '5e A', categorie: 'Collège', anneeId: 1 });
  // programmes : mathématiques (2) et physique-chimie (4) en 6e, mathématiques seulement en 5e
  definirProgramme(s, sixieme.id, [{ matiereId: 2, coefficient: 4, heuresHebdo: 5 }, { matiereId: 4, coefficient: 2, heuresHebdo: 3 }]);
  definirProgramme(s, cinquieme.id, [{ matiereId: 2, coefficient: 4 }]);
  const enseignant = s.typesEmploye.find((x) => x.enseignant).id;
  const directeur = embaucher(s, { nom: 'Kaba', prenom: 'Mariama', typeEmployeId: 1, salaireBase: 2000000, primeFixe: 300000, libellePrime: 'Indemnité de fonction', dateEmbauche: '2020-09-01' });
  const institutrice = embaucher(s, { nom: 'Condé', prenom: 'Fanta', typeEmployeId: enseignant, salaireBase: 1200000, dateEmbauche: '2022-09-01' });
  const prof = embaucher(s, { nom: 'Sylla', prenom: 'Ousmane', typeEmployeId: enseignant, salaireBase: 900000, dateEmbauche: '2023-09-01' });
  return { s, cp, sixieme, cinquieme, directeur, institutrice, prof, enseignant };
}

// Procédure complète : fiche employé, puis rémunération (deux opérations distinctes), tout ou rien pour le test
function embaucher(s, p) {
  return withTransaction(s, () => { const e = createEmploye(s, p); definirRemuneration(s, e.id, p); return e; });
}

function flat(e) {
  return { nom: e.nom, prenom: e.prenom, typeEmployeId: e.typeEmployeId, mode: e.remuneration.mode, salaireBase: e.remuneration.salaireBase, tauxHoraire: e.remuneration.tauxHoraire, primeFixe: e.remuneration.primeFixe, libellePrime: e.remuneration.libellePrime, fonction: e.fonction, contratType: e.contrat.type, contratDebut: e.contrat.debut, contratFin: e.contrat.fin, dateEmbauche: e.dateEmbauche, statut: e.statut };
}

t('migration : collections de paie, programmes et référentiels par défaut', () => {
  const s = etatDemo();
  assert.ok(s.typesEmploye.some((x) => x.libelle === 'Enseignant' && x.enseignant));
  assert.ok(s.typesEmploye.some((x) => x.libelle === 'Agent d’entretien'));
  assert.ok(s.matieres.length >= 5);
  ['personnel', 'affectations', 'heuresRealisees', 'avances', 'paies', 'entreesCaisse', 'programmes'].forEach((k) => assert.deepEqual(s[k], []));
  assert.deepEqual(migrateState(structuredClone(s)), s);
});

t('migration : salaire horaire conservé, retenue fixe supprimée, historique conservé', () => {
  const s = etatDemo();
  s.personnel.push({ id: 1, matricule: 'EMP-2023-0001', nom: 'Sylla', prenom: 'Ousmane', typeEmployeId: 3, fonction: 'Enseignant', contrat: { type: 'cdi', debut: '', fin: '' }, statut: 'actif', historique: [],
    remuneration: { mode: 'horaire', salaireBase: 0, tauxHoraire: 15000, primeFixe: 0, libellePrime: 'Primes', retenueFixe: 20000, libelleRetenue: 'CNSS' } });
  s.personnel.push({ id: 2, matricule: 'EMP-2020-0001', nom: 'Kaba', prenom: 'Mariama', typeEmployeId: 1, fonction: 'Directeur', contrat: { type: 'cdi', debut: '', fin: '' }, statut: 'actif', historique: [],
    remuneration: { mode: 'fixe', salaireBase: 2000000, tauxHoraire: 0, primeFixe: 300000, libellePrime: 'Indemnité', retenueFixe: 100000, libelleRetenue: 'Retenues sociales' } });
  const m = migrateState(s);
  assert.deepEqual(m.personnel.map((e) => [e.remuneration.mode, e.remuneration.salaireBase, e.remuneration.tauxHoraire, e.remuneration.primeFixe, 'retenueFixe' in e.remuneration, e.remuneration.version]), [['horaire', 0, 15000, 0, false, 3], ['fixe', 2000000, 0, 300000, false, 3]]);
  assert.match(m.personnel[0].historique[0].avant, /retenue fixe « CNSS » de 20000 supprimée/);
  assert.deepEqual(migrateState(structuredClone(m)), m); // idempotent : l'historique n'est pas réécrit
  // payé à l'heure sans heures saisies : la paie est calculée mais ne peut pas être validée
  const c = calculerPaie(m, 1, moisCourant);
  assert.equal(c.valide, false);
  assert.match(c.alertes[0], /Aucune heure saisie/);
  assert.deepEqual([calculerPaie(m, 2, moisCourant).totalRetenues, calculerPaie(m, 2, moisCourant).net], [0, 2300000]);
});

t('migration : enseignant converti « salaire mensuel à définir » (v2) → paiement à l’heure rétabli', () => {
  const s = etatDemo();
  s.personnel.push({ id: 1, matricule: 'EMP-2023-0001', nom: 'Sylla', prenom: 'Ousmane', typeEmployeId: 3, fonction: 'Enseignant', contrat: { type: 'cdi', debut: '', fin: '' }, statut: 'actif',
    historique: [{ horodatage: '2026-01-01T00:00:00Z', par: 'Mise à jour de l’application', type: 'remuneration', avant: 'salaire horaire (18000 / h) remplacé par un salaire mensuel à définir', apres: 'salaire mensuel à définir, prime 0' }],
    remuneration: { mode: 'fixe', salaireBase: 0, primeFixe: 0, libellePrime: 'Primes', version: 2 } });
  const m = migrateState(s);
  assert.deepEqual([m.personnel[0].remuneration.mode, m.personnel[0].remuneration.tauxHoraire, m.personnel[0].remuneration.version], ['horaire', 18000, 3]);
  assert.match(m.personnel[0].historique[1].avant, /paiement à l’heure rétabli \(18000 \/ h\)/);
  assert.equal(m.personnel[0].historique.length, 2);
  assert.deepEqual(migrateState(structuredClone(m)), m);
});

t('payé à l’heure : heures du mois × tarif, une seule saisie par mois, mise à jour historisée, verrou après validation', () => {
  const { s, sixieme, cinquieme, enseignant } = setup();
  assert.throws(() => embaucher(s, { nom: 'X', prenom: 'Y', typeEmployeId: 1, mode: 'horaire', tauxHoraire: 10000 }), /réservé aux enseignants/);
  assert.throws(() => embaucher(s, { nom: 'X', prenom: 'Y', typeEmployeId: enseignant, mode: 'horaire', tauxHoraire: 0 }), /tarif horaire/);
  assert.equal(s.personnel.length, 3); // refus : aucune fiche à moitié créée
  const prof = embaucher(s, { nom: 'Camara', prenom: 'Aïssata', typeEmployeId: enseignant, mode: 'horaire', tauxHoraire: 20000, salaireBase: 999 });
  assert.deepEqual([prof.remuneration.mode, prof.remuneration.salaireBase, prof.remuneration.tauxHoraire], ['horaire', 0, 20000]);
  const [a6, a5] = saveAffectations(s, { employeId: prof.id, anneeId: 1, lignes: [{ classeId: sixieme.id, matiereId: 4 }, { classeId: cinquieme.id, matiereId: 2 }] });
  // sans heures : non validable
  assert.equal(calculerPaie(s, prof.id, moisCourant).valide, false);
  setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 14 }, { affectationId: a5.id, heures: '10,5' }, { affectationId: 0, heures: 0 }] }]);
  let c = calculerPaie(s, prof.id, moisCourant);
  assert.deepEqual([c.totalHeures, c.base, c.net, c.valide, c.lignes.length], [24.5, 490000, 490000, true, 2]);
  // nouvelle saisie du même mois : mise à jour du même enregistrement, ancienne valeur tracée
  setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 16 }, { affectationId: a5.id, heures: 10 }] }]);
  const h = heuresDuMois(s, prof.id, moisCourant);
  assert.equal(s.heuresRealisees.filter((x) => x.employeId === prof.id && x.mois === moisCourant).length, 1);
  assert.equal(h.historique.length, 2);
  assert.match(h.historique[1].avant, /14 h/);
  assert.match(h.historique[1].apres, /16 h/);
  setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 16 }, { affectationId: a5.id, heures: 10 }] }]);
  assert.equal(h.historique.length, 2); // saisie identique : aucune trace inutile
  // mois suivant / précédent : saisie distincte, salaire différent
  setHeuresMois(s, moisPrecedent, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 8 }] }]);
  assert.equal(calculerPaie(s, prof.id, moisPrecedent).net, 160000);
  // validation : montants figés et heures verrouillées ; annulation : heures de nouveau modifiables
  const [p] = preparerPaies(s, moisCourant, [prof.id]);
  validerPaie(s, p.id);
  assert.deepEqual([p.calcul.net, p.calcul.totalHeures], [520000, 26]);
  assert.throws(() => setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 30 }] }]), /déjà validée/);
  definirRemuneration(s, prof.id, { mode: 'horaire', tauxHoraire: 25000, motif: 'revalorisation' });
  assert.equal(p.calcul.net, 520000); // tarif modifié après validation : paie inchangée
  // un employé payé à l'heure ne peut pas quitter le type enseignant sans changer d'abord sa rémunération
  assert.throws(() => updateEmploye(s, prof.id, { ...flat(prof), typeEmployeId: 1 }), /passez d’abord sa rémunération/);
  annulerPaie(s, p.id, 'heures erronées');
  setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: a6.id, heures: 20 }] }]);
  assert.equal(calculerPaie(s, prof.id, moisCourant).net, 500000);
  // contrôles : affectation d'un autre enseignant, employé au mois, heures invalides — tout ou rien
  const avant = JSON.stringify(s.heuresRealisees);
  assert.throws(() => setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: 999, heures: 2 }] }]), /Affectation invalide/);
  assert.throws(() => setHeuresMois(s, moisCourant, [{ employeId: 1, lignes: [{ affectationId: 0, heures: 2 }] }]), /n’est pas payé à l’heure/);
  assert.throws(() => setHeuresMois(s, moisCourant, [{ employeId: prof.id, lignes: [{ affectationId: 0, heures: 500 }] }]), /invalide/);
  assert.equal(JSON.stringify(s.heuresRealisees), avant);
  assert.ok(s.personnel.find((e) => e.id === prof.id).historique.some((x) => x.type === 'remuneration' && /20000 \/ h/.test(x.avant) && /25000 \/ h/.test(x.apres)));
});

t('personnel : fiche enregistrée sans rémunération, matricule automatique, types personnalisables', () => {
  const { s, directeur, institutrice } = setup();
  assert.match(directeur.matricule, /^EMP-2020-0001$/);
  assert.equal(generateMatriculeEmploye(s, '2020-01-01'), 'EMP-2020-0002');
  // la fiche s'enregistre sans salaire ; les champs de rémunération éventuels sont ignorés
  const cree = createEmploye(s, { nom: 'Touré', prenom: 'Awa', typeEmployeId: 1, salaireBase: 999999 });
  const fiche = () => s.personnel.find((e) => e.id === cree.id); // une opération refusée restaure l'état depuis une copie
  const nouveau = fiche();
  assert.equal(remunerationDefinie(nouveau), false);
  assert.equal(nouveau.remuneration.salaireBase, 0);
  // paie calculée mais non validable tant que la rémunération n'est pas définie
  const c = calculerPaie(s, nouveau.id, moisCourant);
  assert.equal(c.valide, false);
  assert.match(c.alertes[0], /Rémunération non définie[\s\S]*Rémunérations/);
  assert.throws(() => definirRemuneration(s, nouveau.id, { salaireBase: 0 }), /salaire mensuel/);
  definirRemuneration(s, nouveau.id, { salaireBase: 700000 });
  assert.equal(calculerPaie(s, nouveau.id, moisCourant).valide, true);
  assert.match(fiche().historique.at(-1).avant, /non définie/);
  // modifier la fiche ne touche jamais la rémunération
  updateEmploye(s, nouveau.id, { ...flat(fiche()), fonction: 'Économe', salaireBase: 1 });
  assert.equal(fiche().remuneration.salaireBase, 700000);
  assert.throws(() => createEmploye(s, { nom: 'X', prenom: 'Y', typeEmployeId: 999 }), /type d’employé/);
  assert.throws(() => createEmploye(s, { nom: 'X', prenom: 'Y', typeEmployeId: 1, matricule: institutrice.matricule }), /déjà attribué/);
  const chauffeur = saveTypeEmploye(s, { libelle: 'Chauffeur' });
  assert.throws(() => saveTypeEmploye(s, { libelle: 'chauffeur' }), /existe déjà/);
  assert.throws(() => embaucher(s, { nom: 'Bangoura', prenom: 'Sékou', typeEmployeId: chauffeur.id, mode: 'horaire', tauxHoraire: 9999 }), /réservé aux enseignants/);
  const sekou = embaucher(s, { nom: 'Bangoura', prenom: 'Sékou', typeEmployeId: chauffeur.id, salaireBase: 800000, tauxHoraire: 9999, retenueFixe: 5000 });
  assert.deepEqual(sekou.remuneration, { mode: 'fixe', salaireBase: 800000, tauxHoraire: 0, primeFixe: 0, libellePrime: 'Primes et indemnités', version: 3 }); // aucune retenue fixe
});

t('historique des contrats, salaires et fonctions', () => {
  const { s, institutrice } = setup();
  updateEmploye(s, institutrice.id, { ...flat(institutrice), fonction: 'Directrice adjointe', contratType: 'cdd', contratFin: '2030-07-31' });
  definirRemuneration(s, institutrice.id, { salaireBase: 1400000, motif: 'nouvelle fonction' });
  const types = institutrice.historique.map((h) => h.type);
  assert.ok(types.includes('remuneration') && types.includes('fonction') && types.includes('contrat'));
  const derniere = institutrice.historique.findLast((h) => h.type === 'remuneration');
  assert.deepEqual([derniere.motif, /salaire mensuel 1200000/.test(derniere.avant), /salaire mensuel 1400000/.test(derniere.apres)], ['nouvelle fonction', true, true]);
});

t('affectations : primaire fixe ; collège / lycée multiples, matières du programme, sans doublon', () => {
  const { s, cp, sixieme, cinquieme, institutrice, prof, directeur, enseignant } = setup();
  const a1 = saveAffectation(s, { employeId: institutrice.id, anneeId: 1, classeId: cp.id });
  assert.equal(a1.matiereId, 0);
  assert.throws(() => saveAffectation(s, { employeId: institutrice.id, anneeId: 1, classeId: s.classes[1].id }), /une seule classe/);
  assert.throws(() => saveAffectation(s, { employeId: prof.id, anneeId: 1, classeId: cp.id }), /déjà un enseignant titulaire/);
  assert.throws(() => saveAffectation(s, { employeId: directeur.id, anneeId: 1, classeId: sixieme.id, matiereId: 2 }), /type enseignant/);
  assert.throws(() => saveAffectation(s, { employeId: prof.id, anneeId: 1, classeId: sixieme.id }), /matière/);
  assert.throws(() => saveAffectation(s, { employeId: prof.id, anneeId: 1, classeId: cinquieme.id, matiereId: 4 }), /n’est pas au programme de 5e A/);
  // plusieurs classes et matières en une fois ; une ligne en double est ignorée
  const crees = saveAffectations(s, { employeId: prof.id, anneeId: 1, lignes: [
    { classeId: sixieme.id, matiereId: 2, salle: 'B12' }, { classeId: sixieme.id, matiereId: 4, salle: 'Labo' }, { classeId: cinquieme.id, matiereId: 2 }, { classeId: sixieme.id, matiereId: 2 }] });
  assert.equal(crees.length, 3);
  assert.throws(() => saveAffectation(s, { employeId: prof.id, anneeId: 1, classeId: sixieme.id, matiereId: 2 }), /déjà enregistrée/);
  // une matière d'une classe n'a qu'un enseignant à la fois
  const autre = embaucher(s, { nom: 'Diallo', prenom: 'Alpha', typeEmployeId: enseignant, salaireBase: 800000 });
  assert.throws(() => saveAffectation(s, { employeId: autre.id, anneeId: 1, classeId: sixieme.id, matiereId: 2 }), /déjà assurée par Ousmane Sylla/);
  // tout ou rien : une ligne refusée annule tout le lot
  const avant = s.affectations.length;
  assert.throws(() => saveAffectations(s, { employeId: autre.id, anneeId: 1, lignes: [{ classeId: cinquieme.id, matiereId: 2 }, { classeId: 999, matiereId: 2 }] }));
  assert.equal(s.affectations.length, avant);
  // une affectation clôturée reste dans l'historique et libère la matière
  closeAffectation(s, crees[0].id);
  assert.ok(saveAffectation(s, { employeId: autre.id, anneeId: 1, classeId: sixieme.id, matiereId: 2 }));
  assert.equal(s.affectations.filter((a) => a.classeId === sixieme.id && a.matiereId === 2).length, 2);
});

t('calcul du salaire : salaire mensuel + primes − retenues saisies − avances (aucune retenue arbitraire)', () => {
  const { s, directeur } = setup();
  assert.deepEqual([calculerPaie(s, directeur.id, moisCourant).totalRetenues, calculerPaie(s, directeur.id, moisCourant).net], [0, 2300000]);
  const c = calculerPaie(s, directeur.id, moisCourant, { primes: [{ libelle: 'Heures sup.', montant: 50000 }], retenues: [{ libelle: 'Absence', montant: 30000 }] });
  assert.deepEqual([c.base, c.totalPrimes, c.brut, c.totalRetenues, c.net], [2000000, 350000, 2350000, 30000, 2320000]);
  assert.deepEqual(c.lignes.map((l) => l.libelle), ['Salaire mensuel']);
});

t('paie : préparation, double paie impossible, validation figée, paiement → dépense de l’année de la paie', () => {
  const { s, directeur, institutrice } = setup();
  const crees = preparerPaies(s, moisCourant);
  assert.equal(crees.length, 3);
  assert.ok(crees.every((p) => p.anneeId === 1));
  assert.equal(preparerPaies(s, moisCourant).length, 0); // jamais deux paies le même mois
  const p = paieDuMois(s, directeur.id, moisCourant);
  majVariables(s, p.id, { primes: [{ libelle: 'Prime exceptionnelle', montant: 100000 }] });
  validerPaie(s, p.id);
  assert.match(p.numero, new RegExp(`^BP-${moisCourant}-0001$`));
  assert.equal(p.calcul.net, 2400000);
  assert.throws(() => validerPaie(s, p.id), /déjà validée/);
  assert.throws(() => majVariables(s, p.id, {}), /brouillon/);
  // une augmentation ultérieure ne modifie pas la paie validée
  definirRemuneration(s, directeur.id, { salaireBase: 2500000, primeFixe: 300000 });
  assert.equal(p.calcul.base, 2000000);
  payerPaie(s, p.id, { date: today, moyen: 'virement' });
  const dep = s.depenses.find((x) => x.id === p.depenseId);
  assert.deepEqual([dep.categorie, dep.montant, dep.reference, dep.source.type, dep.anneeId], ['Salaires et indemnités', 2400000, p.numero, 'paie', 1]);
  assert.equal(situationCaisse(s, { yearId: 1 }).depenses, 2400000);
  assert.throws(() => cancelDepense(s, dep.id, 'x'), /module Paie/);
  assert.throws(() => updateDepense(s, dep.id, {}), /module Paie/);
  annulerPaie(s, p.id, 'erreur de prime');
  assert.equal(dep.annule, true);
  assert.equal(situationCaisse(s, { yearId: 1 }).depenses, 0);
  assert.equal(preparerPaies(s, moisCourant, [directeur.id]).length, 1);
  assert.equal(s.paies.filter((x) => x.employeId === directeur.id).length, 2);
  assert.throws(() => payerPaie(s, paieDuMois(s, institutrice.id, moisCourant).id, {}), /validée/);
});

t('retenues supérieures au brut : validation refusée sans aucune écriture', () => {
  const { s, institutrice } = setup();
  const [p] = preparerPaies(s, moisCourant, [institutrice.id]);
  majVariables(s, p.id, { retenues: [{ libelle: 'Erreur', montant: 5000000 }] });
  const avant = JSON.stringify(s);
  assert.throws(() => validerPaie(s, p.id), /retenues dépassent/);
  assert.equal(JSON.stringify(s), avant);
});

t('avances : échéancier automatique, arrondi GNF, dernière mensualité ajustée', () => {
  assert.deepEqual(construireEcheancier(1000000, 'mensualite', 300000, '2026-01').map((e) => [e.mois, e.montant]), [['2026-01', 300000], ['2026-02', 300000], ['2026-03', 300000], ['2026-04', 100000]]);
  assert.deepEqual(construireEcheancier(1000000, 'duree', 3, '2026-11').map((e) => [e.mois, e.montant]), [['2026-11', 333333], ['2026-12', 333333], ['2027-01', 333334]]);
  assert.deepEqual(construireEcheancier(1000000, 'duree', 3, '2026-11', { pas: 1000, sens: 'proche' }).map((e) => e.montant), [333000, 333000, 334000]);
  assert.throws(() => construireEcheancier(1000000, 'mensualite', 1000, '2026-01'), /trop long/);
  assert.throws(() => construireEcheancier(0, 'duree', 3, '2026-01'), /supérieur à zéro/);
});

t('avances : demande → approbation → versement (dépense) → prélèvements sur paie, sans double prélèvement', () => {
  const { s, institutrice } = setup();
  const a = demanderAvance(s, { employeId: institutrice.id, montantDemande: 600000, motif: 'Santé', modeRemboursement: 'duree', valeur: 3, moisDebut: moisPrecedent });
  assert.throws(() => verserAvance(s, a.id), /approuvée/);
  assert.throws(() => approuverAvance(s, a.id, { montantAutorise: 700000 }), /ne pas dépasser/);
  approuverAvance(s, a.id, { montantAutorise: 500000 });
  assert.deepEqual(a.echeancier.map((e) => e.montant), [167000, 167000, 166000]);
  verserAvance(s, a.id, { date: today });
  assert.equal(s.depenses.find((d) => d.source?.type === 'avance').montant, 500000);
  const [p] = preparerPaies(s, moisCourant, [institutrice.id]);
  validerPaie(s, p.id);
  assert.equal(p.calcul.totalAvances, 334000);
  assert.equal(p.calcul.net, 1200000 - 334000);
  assert.equal(totalPreleve(a), 334000);
  assert.throws(() => appliquerPrelevement(s, a.id, p.id, moisCourant, 1), /Double prélèvement/);
  annulerPaie(s, p.id, 'test');
  assert.equal(totalPreleve(a), 0);
  const [p2] = preparerPaies(s, moisCourant, [institutrice.id]);
  validerPaie(s, p2.id);
  assert.equal(totalPreleve(a), 334000);
  assert.equal(soldeAvance(a), 166000);
});

t('avances : net insuffisant → prélèvement partiel, reste reporté automatiquement', () => {
  const { s, enseignant } = setup();
  const stagiaire = embaucher(s, { nom: 'Bah', prenom: 'Saliou', typeEmployeId: enseignant, salaireBase: 130000 });
  const a = demanderAvance(s, { employeId: stagiaire.id, montantDemande: 300000, modeRemboursement: 'mensualite', valeur: 200000, moisDebut: moisCourant });
  approuverAvance(s, a.id);
  verserAvance(s, a.id, { date: today });
  const [p] = preparerPaies(s, moisCourant, [stagiaire.id]);
  const c = calculerPaie(s, stagiaire.id, moisCourant);
  assert.deepEqual([c.avances[0].du, c.avances[0].montant, c.avances[0].reporte, c.net], [200000, 130000, 70000, 0]);
  validerPaie(s, p.id);
  assert.equal(a.echeancier[0].statut, 'partielle');
  assert.equal(soldeAvance(a), 170000);
});

t('avances : report d’échéance et remboursement exceptionnel (entrée de caisse), invariant comptable', () => {
  const { s, directeur } = setup();
  const a = demanderAvance(s, { employeId: directeur.id, montantDemande: 900000, modeRemboursement: 'duree', valeur: 3, moisDebut: moisCourant });
  approuverAvance(s, a.id);
  verserAvance(s, a.id, { date: today });
  reporterEcheance(s, a.id, 0);
  assert.deepEqual(a.echeancier.map((e) => [e.montant, e.statut]), [[0, 'reportee'], [300000, 'prevue'], [300000, 'prevue'], [300000, 'prevue']]);
  assert.equal(calculerPaie(s, directeur.id, moisCourant).totalAvances, 0);
  rembourserExceptionnel(s, a.id, { montant: 400000, date: today });
  assert.deepEqual(a.echeancier.map((e) => e.montant), [0, 300000, 200000, 0]);
  assert.equal(situationCaisse(s, { yearId: 1 }).autres, 400000);
  assert.throws(() => rembourserExceptionnel(s, a.id, { montant: 600000 }), /solde restant/);
  assert.equal(a.montantAutorise, totalPreleve(a) + totalExceptionnel(a) + soldeAvance(a));
  rembourserExceptionnel(s, a.id, { montant: 500000, date: today });
  assert.equal(a.statut, 'soldee');
  assert.equal(a.historique.map((h) => h.type).join(','), 'demande,approbation,versement,report,exceptionnel,exceptionnel,solde');
});

t('refus d’avance motivé ; employé sorti exclu de la préparation', () => {
  const { s, institutrice, directeur } = setup();
  const a = demanderAvance(s, { employeId: institutrice.id, montantDemande: 100000, modeRemboursement: 'duree', valeur: 1, moisDebut: moisCourant });
  assert.throws(() => refuserAvance(s, a.id, ''), /motif/);
  refuserAvance(s, a.id, 'Budget');
  assert.equal(a.statut, 'refusee');
  updateEmploye(s, directeur.id, { ...flat(directeur), statut: 'sorti' });
  assert.equal(preparerPaies(s, moisCourant).length, 2);
  assert.throws(() => preparerPaies(s, '2999-01'), /mois futur/);
});

t('paie rattachée à l’année scolaire du mois ; année clôturée → année active', () => {
  const { s, institutrice } = setup();
  s.annees[0].dateFin = `${moisPrecedent}-28`;
  s.annees.push({ id: 2, annee: 'suivante', dateDebut: `${moisCourant}-01`, dateFin: '2999-12-31', statut: 'ouverte', soldeInitial: 0 });
  const [p] = preparerPaies(s, moisCourant, [institutrice.id]);
  assert.equal(p.anneeId, 2);
  validerPaie(s, p.id);
  payerPaie(s, p.id, { date: today });
  assert.equal(s.depenses.find((d) => d.id === p.depenseId).anneeId, 2);
  assert.equal(situationCaisse(s, { yearId: 2 }).depenses, 1200000);
  assert.equal(situationCaisse(s, { yearId: 1 }).depenses, 0);
});

t('synthèses : mois, récapitulatif par année scolaire et par année civile', () => {
  const { s, directeur, institutrice } = setup();
  preparerPaies(s, moisCourant);
  validerPaie(s, paieDuMois(s, directeur.id, moisCourant).id);
  validerPaie(s, paieDuMois(s, institutrice.id, moisCourant).id);
  payerPaie(s, paieDuMois(s, institutrice.id, moisCourant).id, { date: today });
  const m = syntheseMois(s, moisCourant);
  assert.deepEqual([m.nb, m.brouillons, m.paye, m.aPayer], [3, 1, 1200000, 2300000]);
  assert.equal(recapAnnuel(s, 1).total.net, 3500000); // année scolaire n°1 ; brouillons exclus
  assert.equal(recapAnnuel(s, moisCourant.slice(0, 4)).total.net, 3500000); // année civile
  assert.equal(recapAnnuel(s, 1, institutrice.id).total.paye, 1200000);
  assert.equal(anneePourMois(s, moisCourant).id, 1);
  assert.deepEqual(moisDeLAnnee({ dateDebut: '2026-09-01', dateFin: '2027-07-10' }), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07']);
});

t('permissions et navigation : la paie n’est pas visible en consultation', () => {
  ['paie-dashboard', 'personnel', 'affectations', 'remunerations', 'paie', 'avances', 'paie-rapports'].forEach((page) => {
    assert.ok(ALL_PAGES.includes(page), page);
    assert.ok(ROLE_PAGES.admin.includes(page) && ROLE_PAGES.comptable.includes(page), page);
    assert.ok(!ROLE_PAGES.lecture.includes(page), page);
  });
});

t('réinitialisation complète : personnel, paies, programmes effacés ; référentiels revenus aux valeurs d’origine', () => {
  const { s } = setup();
  saveMatiere(s, { nom: 'Arabe' });
  preparerPaies(s, moisCourant);
  const b = blankState(s);
  assert.deepEqual([b.personnel.length, b.paies.length, b.avances.length, b.programmes.length], [0, 0, 0, 0]);
  assert.ok(!b.matieres.some((m) => m.nom === 'Arabe'));
  assert.ok(b.matieres.length > 0 && b.typesEmploye.length > 0);
});

console.log(`${n} tests de paie passés`);
