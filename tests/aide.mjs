import { etatDemo } from './donnees-demo.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchHelp, accessStatus, evaluatePrerequisites, topicById, unavailableMatches } from '../modules/aide.js';
import { HELP_TOPICS, HELP_CATEGORIES, CHECKS, FAQ_IDS, UNAVAILABLE } from '../modules/aide-data.js';
import { ROLE_PAGES } from '../modules/auth.js';
import { ALL_PAGES, pagePath } from '../modules/navigation.js';
import { migrateState } from '../storage.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const top = (q) => searchHelp(q).results[0]?.topic.id;

t('questions en langage naturel → bonne fiche en tête', () => {
  const cases = {
    'Comment inscrire un élève ?': 'inscrire-eleve',
    'Comment enregistrer un paiement ?': 'enregistrer-paiement',
    'encaisser la scolarité': 'enregistrer-paiement',
    'Où ajouter une classe ?': 'creer-classe',
    'ajouter un eleve': 'ajouter-eleve',
    'nouvel élève matricule': 'ajouter-eleve',
    'Que se passe-t-il si un parent paie plus que la tranche ?': 'repartition-tranches',
    'Comment enregistrer une dépense ?': 'enregistrer-depense',
    'Combien reste-t-il en caisse ?': 'solde-caisse',
    'imprimer un reçu': 'imprimer-recu',
    'annuler un paiement': 'annuler-paiement',
    'configurer les tranches de la classe': 'configurer-frais',
    'mensualités': 'configurer-frais',
    'qui n\'a pas payé': 'retards-rappels',
    'relance des parents': 'retards-rappels',
    'créer un compte caissier': 'gerer-utilisateurs',
    'mot de passe oublié': 'mot-de-passe',
    'tout effacer': 'reinitialiser',
    'restaurer une copie': 'copies-securite',
    'flux de trésorerie': 'rapport-depenses',
    'rapport excel': 'rapports-export',
    'nouvelle année scolaire': 'creer-annee',
    'clôturer l\'année': 'annee-active',
    'tableau de bord': 'tableau-de-bord',
    'logo de l\'école': 'configurer-etablissement',
    'passer au mensuel en cours d\'année': 'modalite-reglement',
    'dette de l\'année dernière': 'dettes-anterieures',
    'frais de réinscription': 'frais-inscription',
    'fiche de rappel': 'retards-rappels',
    'rapport journalier': 'rapports-export',
    'Où ajouter une matière ?': 'gerer-matieres',
    'Comment affecter un enseignant à une classe ?': 'affecter-enseignant',
    'imprimer les bulletins de paie': 'bulletins-paie',
    'Quels sont les prérequis pour générer un bulletin ?': 'bulletins-paie',
    'payer les salaires du mois': 'preparer-paie',
    'avance sur salaire': 'avances-salaire',
    'ajouter un gardien': 'gerer-personnel',
    'masse salariale': 'tableau-paie'
  };
  Object.entries(cases).forEach(([q, expected]) => assert.equal(top(q), expected, `« ${q} » → ${top(q)}`));
});

t('fautes de frappe et sans accents', () => {
  assert.equal(top('inscripton eleve'), 'inscrire-eleve');
  assert.equal(top('paiment'), 'enregistrer-paiement');
  assert.equal(top('depense'), 'enregistrer-depense');
});

t('fonctionnalités absentes signalées honnêtement, sans résultat fictif', () => {
  for (const q of ['Comment calculer les moyennes ?', 'Comment imprimer le bulletin scolaire ?', 'emploi du temps', 'saisir les notes du trimestre']) {
    const r = searchHelp(q);
    assert.ok(r.unavailable.length > 0, `aucune absence signalée pour « ${q} »`);
    assert.equal(r.results.length, 0, `résultats inattendus pour « ${q} » : ${r.results.map((x) => x.topic.id)}`);
  }
  assert.deepEqual(unavailableMatches('enregistrer un paiement'), []);
  assert.deepEqual(unavailableMatches('passer au mensuel en cours d’année'), []); // « cours » n'évoque pas les matières
  assert.deepEqual(unavailableMatches('payer la note de cantine').map((u) => u.id), ['notes']);
});

t('aucun résultat pour une question hors sujet', () => {
  assert.equal(searchHelp('météo de demain à Kankan').results.length, 0);
});

t('recherche vide : toutes les fiches, filtrables par catégorie', () => {
  assert.equal(searchHelp('').results.length, HELP_TOPICS.length);
  assert.ok(searchHelp('', { categorie: 'paiements' }).results.every((r) => r.topic.categorie === 'paiements'));
});

t('documentation synchronisée avec l’application réelle', () => {
  const html = readFileSync('index.html', 'utf8');
  const ids = new Set();
  HELP_TOPICS.forEach((topic) => {
    assert.ok(!ids.has(topic.id), `id dupliqué ${topic.id}`); ids.add(topic.id);
    assert.ok(HELP_CATEGORIES.some((c) => c.id === topic.categorie), `catégorie inconnue ${topic.id}`);
    if (topic.page) {
      assert.ok(html.includes(`<section id="${topic.page}"`), `page inexistante ${topic.page}`);
      assert.ok(ALL_PAGES.includes(topic.page), `page absente de la navigation ${topic.page}`);
      // le chemin affiché commence par le vrai chemin de menu (onglet › sous-onglet)
      assert.deepEqual(topic.chemin.slice(0, pagePath(topic.page).length), pagePath(topic.page), `chemin incorrect pour ${topic.id}`);
      // un rôle cité doit pouvoir ouvrir la page de destination
      topic.roles.forEach((role) => assert.ok(ROLE_PAGES[role].includes(topic.page), `${topic.id} : le rôle ${role} n’a pas accès à ${topic.page}`));
      assert.ok(topic.focus, `${topic.id} sans élément cible`);
    }
    assert.ok(topic.etapes.length > 0 && topic.description && topic.resultat, `fiche incomplète ${topic.id}`);
    (topic.prerequis || []).forEach((p) => {
      assert.ok(!p.check || CHECKS[p.check], `contrôle inconnu ${p.check}`);
      assert.ok(!p.aide || topicById(p.aide), `lien d’aide cassé ${p.aide}`);
      assert.equal(typeof p.obligatoire, 'boolean');
    });
  });
  FAQ_IDS.forEach((id) => assert.ok(topicById(id), `FAQ inconnue ${id}`));
  UNAVAILABLE.forEach((u) => assert.ok(!u.alternative || topicById(u.alternative)));
  HELP_CATEGORIES.forEach((c) => assert.ok(HELP_TOPICS.some((x) => x.categorie === c.id), `catégorie vide ${c.id}`));
  Object.values(ROLE_PAGES).forEach((pages) => assert.ok(pages.includes('aide'), 'le centre d’aide doit être ouvert à tous les rôles'));
  // toutes les pages des rôles existent dans la navigation et dans la page HTML
  Object.values(ROLE_PAGES).flat().forEach((page) => { assert.ok(ALL_PAGES.includes(page), page); assert.ok(html.includes(`<section id="${page}"`), page); });
  // les étapes ne citent plus d'anciens noms de menu supprimés
  const anciens = ['« Années »', '« Classes »', '« Tarifs »', '« Inscriptions »', '« Configuration »', '« Analyse financière »'];
  HELP_TOPICS.forEach((topic) => topic.etapes.forEach((e) => anciens.forEach((a) => assert.ok(!e.includes(a), `${topic.id} : ancien menu ${a}`))));
});

t('prérequis évalués sur les données réelles', () => {
  const s = etatDemo();
  const pay = topicById('enregistrer-paiement');
  assert.equal(evaluatePrerequisites(s, pay).find((p) => p.check === 'payable').ok, true);
  // une inscription sans échéancier reste payable si sa classe a un tarif (l'échéancier est créé au paiement)
  s.inscriptions[0].echeances = [];
  assert.equal(evaluatePrerequisites(s, pay).find((p) => p.check === 'payable').ok, true);
  s.tarifs = [];
  assert.equal(evaluatePrerequisites(s, pay).find((p) => p.check === 'payable').ok, false);
  s.inscriptions = [];
  const st = accessStatus(s, pay, 'comptable', ROLE_PAGES.comptable);
  assert.equal(st.roleOk, true);
  assert.deepEqual(st.missing.map((p) => p.check), ['payable']);
  s.annees[0].statut = 'cloturee';
  assert.ok(accessStatus(s, pay, 'admin', ROLE_PAGES.admin).missing.some((p) => p.check === 'anneeOuverte'));
});

t('permissions : un rôle non autorisé n’obtient jamais de lien', () => {
  const s = etatDemo();
  assert.equal(accessStatus(s, topicById('enregistrer-paiement'), 'lecture', ROLE_PAGES.lecture).navigable, false);
  assert.equal(accessStatus(s, topicById('reinitialiser'), 'comptable', ROLE_PAGES.comptable).navigable, false);
  assert.equal(accessStatus(s, topicById('rapports-export'), 'lecture', ROLE_PAGES.lecture).navigable, true);
  assert.equal(accessStatus(s, topicById('connexion'), 'admin', ROLE_PAGES.admin).navigable, false); // pas de page
});

console.log(`${n} tests du centre d’aide passés`);
