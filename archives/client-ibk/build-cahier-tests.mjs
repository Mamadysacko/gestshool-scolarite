// Génère documentation/IBK-Cahier-de-tests-et-procedures.html : guide de prise en main, procédures (reprises des
// fiches du centre d'aide, donc toujours alignées sur l'application) et cahier de tests à cocher soi-même.
// Usage : node build-cahier-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_CATEGORIES, HELP_TOPICS } from './modules/aide-data.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const sortie = path.join(root, 'documentation', 'IBK-Cahier-de-tests-et-procedures.html');

// ── Prise en main : l'ordre dans lequel paramétrer et utiliser l'application ──
const PRISE_EN_MAIN = [
  { titre: 'Se connecter', texte: 'Ouvrez index.html dans Chrome ou Edge. Au tout premier lancement, créez le compte administrateur (mot de passe d’au moins 8 caractères), puis acceptez la création du fichier de données IBK-donnees.note : toutes vos opérations y sont enregistrées automatiquement.' },
  { titre: 'Suivre la « Mise en route »', texte: 'Le tableau de bord affiche les étapes de paramétrage dans l’ordre, avec un bouton « Commencer » sur la prochaine étape. Le panneau disparaît quand tout est en place.' },
  { titre: 'Établissement', texte: 'Administration › Établissement : nom, adresse, téléphone, logo, devise et nom du caissier (en-tête de tous les reçus et rapports).' },
  { titre: 'Année scolaire', texte: 'Scolarité › Années scolaires : dates, solde d’ouverture de caisse, frais d’inscription et de réinscription. L’année active (sélecteur en haut de page) pilote toutes les données affichées.' },
  { titre: 'Classes, matières, programme', texte: 'Scolarité › Classes : créez les classes ; le bloc « Matières » gère la liste des matières ; « Programme et coefficients » indique les matières de chaque classe (collège / lycée).' },
  { titre: 'Frais de scolarité', texte: 'Scolarité › Tarifs et frais : montant annuel, 3 tranches avec dates limites et montant mensuel. Après la création d’une classe, l’application ouvre directement ses frais.' },
  { titre: 'Élèves et inscriptions', texte: 'Élèves › Dossiers élèves : « Ajouter et inscrire » enchaîne fiche → inscription → encaissement, sans ressaisie.' },
  { titre: 'Encaissements', texte: 'Paiements & dépenses › Encaissements : recherche de l’élève, choix de la modalité (tranches ou mensuel) au premier paiement, reçu numéroté affiché aussitôt.' },
  { titre: 'Dépenses et caisse', texte: 'Paiements & dépenses › Dépenses et caisse : chaque dépense diminue le solde disponible ; une annulation conserve la ligne.' },
  { titre: 'Paie du personnel', texte: 'Personnel (salaire mensuel, ou payé à l’heure pour les enseignants du collège / lycée) → Affectations → Paie mensuelle (heures du mois, préparation, validation, paiement) → Bulletins.' },
  { titre: 'Rapports et sauvegardes', texte: 'Rapports : journaliers, hebdomadaires, mensuels, annuels, retards, rappels (PDF / Excel). Administration › Données et sauvegardes : sauvegardes datées et copies de sécurité.' }
];

const REGLES = [
  'Une seule inscription par élève et par année ; une seule paie par employé et par mois.',
  'Aucun paiement, aucune dépense ni aucune paie n’est jamais supprimé : on annule avec un motif et la ligne reste dans l’historique.',
  'Les montants d’un reçu, d’une paie validée ou d’un bulletin sont figés : une modification ultérieure (tarif, salaire, heures) ne les change pas.',
  'Les heures d’un enseignant payé à l’heure sont saisies une seule fois par mois ; une correction met à jour la même saisie et garde l’ancienne valeur dans l’historique. Après validation de la paie, les heures sont verrouillées.',
  'Certaines opérations sensibles (salaires, validation de paie, suppression, réinitialisation) demandent le mot de passe d’un administrateur.',
  'Le report d’une dette d’une année sur l’autre est toujours volontaire (page Dettes antérieures).'
];

// ── Cahier de tests : scénario complet, à dérouler dans l'ordre sur une base vide ──
const T = (id, titre, chemin, etapes, attendu, note = '') => ({ id, titre, chemin, etapes, attendu, note });
const SECTIONS = [
  { titre: 'Préparation (à faire une seule fois)', tests: [
    T('P1', 'Mettre vos données réelles à l’abri', 'Administration › Données et sauvegardes',
      ['Cliquez sur « Télécharger une sauvegarde » (ou « Créer une sauvegarde datée » si le fichier de données est relié).'],
      ['Un fichier de sauvegarde .note est créé : vos données réelles sont protégées.']),
    T('P2', 'Partir d’une base vide', 'Administration › Données et sauvegardes › Zone dangereuse',
      ['Cliquez sur « Réinitialiser les données… ».', 'Saisissez un mauvais mot de passe : rien ne doit être effacé.', 'Recommencez avec votre mot de passe administrateur et le mot de confirmation demandé.'],
      ['Mauvais mot de passe : refus, aucune donnée effacée.', 'Années, classes, élèves, paiements, dépenses et paie sont effacés ; l’établissement, les comptes et les rôles sont conservés.', 'Une copie de sécurité « Avant réinitialisation » apparaît dans la liste.', 'Le sélecteur d’année en haut affiche « Créer la première année ».', 'Le tableau de bord affiche le panneau « Mise en route ».'],
      'Vous pourrez récupérer vos données d’origine à la fin (test F1).')
  ] },
  { titre: '1. Connexion et navigation', tests: [
    T('T1.1', 'Connexion et déconnexion', 'Bouton « Déconnexion » en haut à droite',
      ['Déconnectez-vous.', 'Essayez un mauvais mot de passe.', 'Connectez-vous avec le bon mot de passe.'],
      ['Mauvais mot de passe refusé avec un message.', 'Après connexion : votre nom et le rôle « Administrateur » sont affichés.']),
    T('T1.2', 'Onglets et sous-onglets', 'Menu de gauche',
      ['Cliquez sur chacun des 7 onglets : Tableau de bord, Élèves, Scolarité, Paiements & dépenses, Paie du personnel, Rapports, Administration.', 'Dans chaque onglet, ouvrez les sous-onglets en haut de page.', 'Appuyez sur F5 (actualiser).'],
      ['Chaque page s’affiche sans erreur.', 'Après actualisation, vous restez sur la même page, toujours connecté.']),
    T('T1.3', 'Panneau « Mise en route »', 'Tableau de bord › Vue d’ensemble',
      ['Observez le panneau en haut de page.'],
      ['Les étapes sont listées dans l’ordre avec leur état ; la prochaine étape est encadrée avec un bouton « Commencer » qui ouvre la bonne page.'])
  ] },
  { titre: '2. Établissement', tests: [
    T('T2.1', 'En-tête des documents', 'Administration › Établissement',
      ['Vérifiez ou complétez nom, adresse, téléphone.', 'Saisissez le nom du caissier : « Mme Sylla ».', 'Enregistrez.'],
      ['L’aperçu de l’en-tête se met à jour.', 'Le nom du caissier apparaîtra sur les reçus (vérifié au test T6.1).']),
    T('T2.2', 'Règles d’arrondi GNF', 'Administration › Paramètres financiers',
      ['Consultez le bloc des arrondis.'],
      ['Tranches arrondies à 5 000, mensualités à 1 000, avances à 1 000 ; un exemple chiffré montre la répartition (la dernière tranche absorbe l’écart).'])
  ] },
  { titre: '3. Année scolaire', tests: [
    T('T3.1', 'Créer l’année 2026-2027', 'Scolarité › Années scolaires',
      ['Année : 2026-2027 ; rentrée : 01/09/2026 ; fin : 10/07/2027.', 'Solde d’ouverture de caisse : 5 000 000.', 'Frais d’inscription : 50 000 ; frais de réinscription : 30 000.', 'Statut : Ouverte. Cliquez sur « Ajouter ».'],
      ['La carte « 2026-2027 » porte le badge « active ».', 'Le sélecteur en haut de page affiche 2026-2027.', 'Dans « Mise en route », l’étape « Créer l’année scolaire » est cochée.'])
  ] },
  { titre: '4. Classes, matières, programme et frais', tests: [
    T('T4.1', 'Créer la classe CP A', 'Scolarité › Classes',
      ['Nom : CP A ; catégorie : Primaire ; capacité : 40. Cliquez sur « Ajouter ».'],
      ['Vous êtes conduit sur « Tarifs et frais » avec la classe CP A déjà choisie.']),
    T('T4.2', 'Frais de CP A', 'Scolarité › Tarifs et frais',
      ['Montant annuel : 900 000.', 'Vérifiez les 3 tranches proposées puis saisissez le montant mensuel : 100 000.', 'Essayez d’abord 120 000 comme montant mensuel puis remettez 100 000.', 'Enregistrez.'],
      ['Tranches proposées : 300 000 + 300 000 + 300 000 avec des dates limites.', 'Avec 120 000 : un avertissement signale l’écart (9 × 120 000 = 1 080 000).', 'Carte CP A : « Mensuel : 9 × 100 000 = 900 000 ».']),
    T('T4.3', 'Créer la classe 6e A et ses frais', 'Scolarité › Classes puis Tarifs et frais',
      ['Nom : 6e A ; catégorie : Collège. Ajoutez.', 'Montant annuel : 1 200 000 ; gardez le montant mensuel proposé. Enregistrez.'],
      ['Tranches : 400 000 + 400 000 + 400 000.', 'La mensualité proposée est arrondie au millier ; le total des mensualités est égal à 1 200 000.']),
    T('T4.4', 'Gérer les matières', 'Scolarité › Classes › bloc « Matières »',
      ['Ajoutez la matière « Arabe ».', 'Cliquez sur « désactiver » à côté de « Informatique », puis sur « réactiver ».', 'Allez dans Paie du personnel › Affectations.'],
      ['« Arabe » apparaît dans la liste des matières et dans le tableau « Programme et coefficients ».', 'Informatique passe en grisé puis redevient active.', 'La page Affectations ne contient plus la liste des matières (simple lien vers Scolarité › Classes).']),
    T('T4.5', 'Programme de la 6e A', 'Scolarité › Classes › Programme et coefficients',
      ['Choisissez la classe 6e A.', 'Cochez Mathématiques (coefficient 4, 5 h), Français (3, 5 h) et Anglais (2, 3 h).', 'Cliquez sur « Enregistrer le programme de 6e A ».'],
      ['Message « Programme de 6e A enregistré (3 matière(s)) ».', 'La carte 6e A indique « Programme : 3 matière(s) ».', 'Mise en route : classes, programme et frais cochés.'])
  ] },
  { titre: '5. Élèves et inscriptions', tests: [
    T('T5.1', 'Ajouter et inscrire Fatoumata Bah', 'Élèves › Dossiers élèves',
      ['Prénom : Fatoumata ; nom : Bah ; sexe : Féminin ; classe souhaitée : CP A.', 'Parent : nom Bah, prénom Alpha, lien Père, téléphone 620 00 00 01.', 'Cliquez sur « Ajouter et inscrire ».', 'Sur la page Inscriptions (préremplie), enregistrez l’inscription.'],
      ['Matricule automatique au format IBK-AAAA-NNNN.', 'Après l’inscription, la page Encaissements s’ouvre sur la fiche de Fatoumata (CP A, frais d’inscription 50 000, échéancier provisoire).']),
    T('T5.2', 'Ibrahima Sow (CP A)', 'Élèves › Dossiers élèves',
      ['Même procédure : Ibrahima Sow, Masculin, CP A, parent Sow Oumar 620 00 00 02.'],
      ['Inscription créée, fiche de paiement ouverte.']),
    T('T5.3', 'Aminata Diallo puis sa sœur Awa (6e A)', 'Élèves › Dossiers élèves',
      ['Aminata Diallo, 6e A, parent Diallo Mamadou, lien Père, téléphone 600 00 00 10 → Ajouter et inscrire → enregistrer l’inscription.', 'Revenez sur Dossiers élèves : Awa Diallo, 6e A.', 'Dans « Famille déjà enregistrée », tapez « Mamadou » et choisissez Mamadou Diallo.', 'Ajouter et inscrire → enregistrer l’inscription.'],
      ['Pour Awa, le nom et le téléphone du parent sont repris automatiquement.', 'Profil d’Awa (bouton « Profil » dans la liste) : « Frères et sœurs : Aminata Diallo » ; le contact n’est pas dupliqué.']),
    T('T5.4', 'Recherche et filtres', 'Élèves › Dossiers élèves',
      ['Tapez « Diallo » dans la recherche avancée.', 'Filtrez par classe 6e A, puis par statut.'],
      ['2 résultats (Aminata et Awa) ; le compteur de résultats suit les filtres.']),
    T('T5.5', 'Inscription en double refusée', 'Élèves › Inscriptions',
      ['Essayez d’inscrire de nouveau Fatoumata Bah en 2026-2027.'],
      ['Refus : un élève ne peut être inscrit qu’une fois par année.'])
  ] },
  { titre: '6. Encaissements et reçus', tests: [
    T('T6.1', 'Premier paiement par tranches', 'Paiements & dépenses › Encaissements',
      ['Tapez « Bah » et choisissez Fatoumata.', 'Constatez que le bouton « Enregistrer le paiement » est grisé tant que la modalité n’est pas choisie.', 'Choisissez « Paiement par tranches » ; montant : 350 000 ; lisez l’aperçu.', 'Enregistrez.'],
      ['Aperçu : Frais d’inscription 50 000 + 1ère tranche 300 000.', 'Le reçu REC-… s’affiche aussitôt avec Imprimer / Télécharger en PDF / Fermer : payeur Fatoumata Bah, 350 000 GNF, caissier Mme Sylla.']),
    T('T6.2', 'Montant trop élevé refusé', 'Paiements & dépenses › Encaissements',
      ['Choisissez de nouveau Fatoumata ; montant : 99 000 000.'],
      ['L’aperçu indique que le montant dépasse le solde ; l’enregistrement est refusé et aucun reçu n’est créé.']),
    T('T6.3', 'Paiement mensuel', 'Paiements & dépenses › Encaissements',
      ['Choisissez Ibrahima Sow ; modalité « Paiement mensuel ».', 'Montant : 250 000. Enregistrez.'],
      ['L’échéancier affiche 9 mois de 100 000.', 'Ligne du paiement : Frais d’inscription (50 000) + Septembre 2026 (100 000) + Octobre 2026 (100 000).']),
    T('T6.4', 'Modalité mémorisée', 'Paiements & dépenses › Encaissements',
      ['Choisissez de nouveau Ibrahima Sow.'],
      ['« Paiement mensuel » est déjà sélectionné avec la mention « modalité actuelle ».']),
    T('T6.5', 'Reçu PDF et facture', 'Paiements & dépenses › Encaissements › liste des paiements',
      ['Sur la ligne d’Ibrahima, cliquez sur « Reçu » puis « Télécharger en PDF ».', 'Ouvrez la facture de scolarité d’Ibrahima.'],
      ['Reçu sur une seule page A4 (deux exemplaires), logo et en-tête visibles ; « Reste à payer » cohérent.', 'Facture : modalité mensuelle, paiements validés 250 000.']),
    T('T6.6', 'Annuler un paiement', 'Paiements & dépenses › Encaissements',
      ['Enregistrez 10 000 pour Ibrahima.', 'Cliquez sur « Annuler » sur cette ligne, motif : « erreur de saisie ».'],
      ['La ligne reste visible avec le statut « Annulé » ; les 10 000 ne sont plus comptés dans les totaux.']),
    T('T6.7', 'Double clic sans doublon', 'Paiements & dépenses › Encaissements',
      ['Saisissez un paiement et double-cliquez rapidement sur « Enregistrer le paiement ».'],
      ['Un seul paiement est enregistré.'], 'Annulez ensuite ce paiement de test pour garder les chiffres des tests suivants.')
  ] },
  { titre: '7. Dépenses et caisse', tests: [
    T('T7.1', 'Enregistrer une dépense', 'Paiements & dépenses › Dépenses et caisse',
      ['Catégorie : Fournitures et matériel ; montant : 150 000 ; description : Craies et cahiers ; demandeur : Directeur ; bénéficiaire : Librairie Centrale. Enregistrez.'],
      ['Numéro DEP-…-000001 attribué.', 'Solde disponible : 5 450 000 (5 000 000 d’ouverture + 600 000 encaissés − 150 000).']),
    T('T7.2', 'Annuler la dépense', 'Paiements & dépenses › Dépenses et caisse',
      ['Annulez la dépense, motif : « erreur de saisie ».'],
      ['Ligne conservée avec « Annulée » ; solde disponible : 5 600 000.'])
  ] },
  { titre: '8. Tableaux de bord et analyses', tests: [
    T('T8.1', 'Vue d’ensemble', 'Tableau de bord › Vue d’ensemble',
      ['Lisez les indicateurs ; changez les filtres Niveau et Classe.'],
      ['Montant encaissé : 600 000 ; solde disponible (caisse) : 5 600 000.', 'Les graphiques et indicateurs suivent les filtres.']),
    T('T8.2', 'Analyse financière', 'Tableau de bord › Analyse financière',
      ['Passez d’un axe à l’autre : Formation, Classe, Élève, Année scolaire.'],
      ['Attendu, encaissé, reste et taux par ligne ; CP A a les deux élèves payeurs.']),
    T('T8.3', 'Analyse des encaissements', 'Paiements & dépenses › Analyse des encaissements',
      ['Modifiez la période et exportez en Excel puis en PDF.'],
      ['Les exports ne contiennent que les lignes affichées.'])
  ] },
  { titre: '9. Rapports', tests: [
    T('T9.1', 'Retards de paiement', 'Rapports › Retards de paiement',
      ['Ouvrez l’onglet.'],
      ['Aminata et Awa Diallo apparaissent (aucun paiement, 1ère tranche échue le 01/10/2026).'], 'Le résultat dépend de la date du jour : il est valable à partir du 01/10/2026.'),
    T('T9.2', 'Rapport mensuel', 'Rapports › Hebdo · Mensuel · Annuel',
      ['Choisissez « Mensuel » et le mois en cours. Essayez aussi « Hebdomadaire ».'],
      ['Période exacte affichée (« Mois du 01/… au 31/… »).', 'Les paiements du mois sont listés (600 000 en octobre 2026), annulations exclues.']),
    T('T9.3', 'Fiches de rappel', 'Rapports › Fiches de rappel',
      ['Cliquez sur l’impression des fiches.'],
      ['4 fiches par page A4, une par famille en retard.']),
    T('T9.4', 'Situation individuelle et exports', 'Rapports › Situation individuelle',
      ['Choisissez Fatoumata Bah ; exportez en PDF puis en Excel.'],
      ['Total payé 350 000, détail des échéances ; fichiers générés avec l’en-tête de l’établissement.'])
  ] },
  { titre: '10. Paie du personnel', tests: [
    T('T10.1', 'Employé au salaire mensuel', 'Paie du personnel › Personnel',
      ['Mariama Kaba ; type : Directeur ; mode : Salaire mensuel ; salaire : 2 000 000 ; prime fixe : 300 000 « Indemnité de fonction ». Enregistrez.'],
      ['Le mot de passe administrateur est demandé (salaire).', 'Matricule EMP-AAAA-0001 ; liste : « 2 000 000 GNF / mois ».']),
    T('T10.2', 'Enseignant payé à l’heure', 'Paie du personnel › Personnel',
      ['Ousmane Sylla ; type : Enseignant.', 'Mode de rémunération : « Payé à l’heure ».', 'Tarif horaire : 20 000. Enregistrez.'],
      ['En choisissant « Payé à l’heure », le champ « Salaire mensuel » est remplacé par « Tarif horaire ».', 'Vous êtes conduit sur Affectations, Ousmane Sylla présélectionné : « payé à l’heure (20 000 GNF / h) ».']),
    T('T10.3', 'Affectations collège (plusieurs lignes)', 'Paie du personnel › Affectations',
      ['Cochez la classe 6e A.', 'Cochez Mathématiques et Anglais ; salle : B12 ; « Ajouter les lignes ».', 'Cliquez sur « Enregistrer 2 affectation(s) ».'],
      ['Seules les matières du programme de 6e A sont proposées (Anglais, Français, Mathématiques).', 'Message « 2 affectation(s) enregistrée(s) pour Ousmane Sylla ».']),
    T('T10.4', 'Institutrice titulaire', 'Paie du personnel › Personnel puis Affectations',
      ['Fanta Condé ; Enseignant ; Salaire mensuel 1 200 000.', 'Sur Affectations : classe CP A → « Affecter comme titulaire ».'],
      ['Message « Titulaire affecté ».']),
    T('T10.5', 'Mode horaire réservé aux enseignants', 'Paie du personnel › Personnel',
      ['Mamadou Camara ; type : Gardien ; choisissez « Payé à l’heure » avec 5 000 → Enregistrer.', 'Corrigez : Salaire mensuel 600 000 → Enregistrer.'],
      ['Premier essai refusé : « Le paiement à l’heure est réservé aux enseignants ».', 'Second essai accepté.']),
    T('T10.6', 'Avance sur salaire', 'Paie du personnel › Avances sur salaire',
      ['Employé : Camara ; montant : 250 000 ; remboursement par mensualité de 100 000 à partir du mois en cours.', 'Enregistrez, puis « Approuver » et « Verser ».'],
      ['Aperçu : 100 000 + 100 000 + 50 000 (dernière mensualité ajustée).', 'Après versement : statut « Versée — en remboursement » et dépense « Avances sur salaire » de 250 000.']),
    T('T10.7', 'Préparer la paie du mois', 'Paie du personnel › Paie mensuelle',
      ['Choisissez le mois en cours ; « Préparer la paie du mois ».', 'Cliquez une deuxième fois sur le même bouton.'],
      ['4 brouillons créés ; le second clic n’en crée aucun (« aucun doublon »).', 'Ligne Sylla : « 0 h × 20 000 », net 0, pastille « ! » (heures manquantes).']),
    T('T10.8', 'Saisir les heures du mois', 'Paie du personnel › Paie mensuelle › Heures du mois',
      ['Pour Sylla : 6e A · Anglais : 14 ; 6e A · Mathématiques : 10.', 'Cliquez sur « Enregistrer les heures du mois ».'],
      ['État « Enregistré » ; total 24 h ; salaire du mois 480 000.', 'Ligne de paie Sylla : « 24 h × 20 000 », net 480 000.']),
    T('T10.9', 'Corriger les heures (une seule saisie par mois)', 'Paie du personnel › Paie mensuelle',
      ['Remplacez 14 par 16 pour l’Anglais et enregistrez de nouveau.', 'Ouvrez « Détail » sur la ligne de Sylla.'],
      ['Total 26 h ; net 520 000 ; mention « 1 mise(s) à jour ».', 'Détail : une ligne par affectation (heures, tarif, montant) et « Historique des heures (2 saisie(s)) » montrant 14 h → 16 h.']),
    T('T10.10', 'Valider la paie', 'Paie du personnel › Paie mensuelle',
      ['« Valider les 4 brouillon(s) » (mot de passe administrateur).'],
      ['Nets : Kaba 2 300 000 ; Condé 1 200 000 ; Sylla 520 000 ; Camara 500 000 (600 000 − 100 000 d’avance).', 'Les heures de Sylla sont grisées : « Paie validée — verrouillé ».']),
    T('T10.11', 'Payer un salaire', 'Paie du personnel › Paie mensuelle',
      ['Sur la ligne Camara : « Marquer payée » (espèces).'],
      ['Le bulletin s’affiche ; statut « Payée » ; dépense « Salaires et indemnités » de 500 000 dans Dépenses et caisse (filtre « Toutes les années » si besoin).']),
    T('T10.12', 'Annuler une paie pour corriger des heures', 'Paie du personnel › Paie mensuelle',
      ['Annulez la paie de Sylla (motif : correction des heures).', 'Modifiez ses heures (par ex. Mathématiques 12) et enregistrez.', '« Préparer la paie du mois » puis validez sa nouvelle paie.'],
      ['Après l’annulation, les heures redeviennent modifiables ; l’ancienne paie reste visible « Annulée ».', 'Nouvelle paie : 28 h → 560 000.']),
    T('T10.13', 'Bulletins', 'Paie du personnel › Paie mensuelle',
      ['« Imprimer les bulletins du mois ».'],
      ['Un bulletin par page ; celui de Sylla affiche les colonnes Quantité / Taux et « Heures dispensées : 28 h ».']),
    T('T10.14', 'Fiche et historique de l’enseignant', 'Paie du personnel › Personnel › Fiche',
      ['Ouvrez la fiche de Sylla ; puis « Modifier » : tarif horaire 25 000 → Enregistrer.'],
      ['Fiche : historique, affectations, « Heures dispensées par mois » avec chaque saisie (date, auteur, avant → après).', 'Historique : « payé à l’heure 20000 / h → 25000 / h » ; la paie validée garde 560 000.']),
    T('T10.15', 'Récapitulatifs et tableau de bord de la paie', 'Paie du personnel › Bulletins et récapitulatifs / Tableau de bord',
      ['Ouvrez le récapitulatif mensuel puis annuel ; exportez en PDF.', 'Ouvrez le tableau de bord de la paie.'],
      ['Récapitulatif : 4 paies, net total 4 560 000.', 'Tableau de bord : « Payé ce mois » 500 000 ; « En attente de paiement » 4 060 000.'])
  ] },
  { titre: '11. Nouvelle année, passage et dettes', tests: [
    T('T11.1', 'Créer 2027-2028 en reconduisant les paramètres', 'Scolarité › Années scolaires',
      ['Année : 2027-2028 ; 01/09/2027 → 10/07/2028 ; statut : Préparation.', 'Dans « Reconduire les paramètres », depuis 2026-2027 : cochez / décochez les cases pour vérifier qu’elles réagissent, puis laissez classes, programmes et frais cochés.', 'Ajoutez.'],
      ['Les cases sont visibles et se cochent au clic.', '2027-2028 contient CP A et 6e A, le programme de 6e A et les frais ; aucune inscription ni aucun paiement n’est recopié.', '2026-2027 reste l’année active.'], 'Avec le statut « Ouverte », l’ancienne année ouverte serait clôturée : utilisez « Préparation ».'),
    T('T11.2', 'Décisions de passage et réinscription groupée', 'Élèves › Inscriptions › Passage et réinscriptions',
      ['Élèves de l’année : 2026-2027 ; inscrire en : 2027-2028.', 'Décisions : Fatoumata « Redouble », Aminata « Redouble », Awa « Non admis ».', 'Cochez les trois élèves puis « Inscrire les 2 élève(s)… ».'],
      ['Seules Fatoumata et Aminata sont réinscrites (type réinscription, frais de réinscription 30 000) ; Awa ne l’est pas.']),
    T('T11.3', 'Reporter une dette', 'Paiements & dépenses › Dettes antérieures',
      ['Année de destination : 2027-2028.', 'Cochez Fatoumata Bah puis « Reporter ».'],
      ['La liste montre le reste à payer de chaque élève de 2026-2027 ; message « 1 dette(s) reportée(s) sur 2027-2028 ».', 'Aucune dette n’est reportée sans cette action.']),
    T('T11.4', 'Encaisser une dette antérieure', 'Paiements & dépenses › Encaissements',
      ['Année : 2027-2028 ; élève : Bah ; dans le bloc « Dette antérieure », cliquez sur « Régler cette dette ».', 'Montant : 100 000. Enregistrez.'],
      ['Bandeau « Règlement d’une dette antérieure — année 2026-2027 ».', 'Dettes antérieures : « Partiellement remboursé », reste diminué de 100 000 ; le paiement compte dans la caisse de 2027-2028.']),
    T('T11.5', 'Changer d’année active', 'Sélecteur « Année scolaire » en haut',
      ['Choisissez 2027-2028, parcourez Classes, Inscriptions, Encaissements ; revenez à 2026-2027.'],
      ['Toutes les listes et tous les filtres basculent sur l’année choisie ; l’année reste choisie après actualisation.'])
  ] },
  { titre: '12. Administration et sécurité', tests: [
    T('T12.1', 'Utilisateur comptable', 'Administration › Utilisateurs et rôles',
      ['Créez : identifiant « caisse », nom Aïssatou, rôle Comptable, mot de passe Caisse2026x.', 'Déconnectez-vous et connectez-vous avec « caisse ».', 'Reconnectez-vous ensuite en administrateur.'],
      ['En comptable : l’onglet Administration ne montre que le Centre d’aide ; pas d’accès à la configuration (même en tapant l’adresse) ; pas d’import.']),
    T('T12.2', 'Rôle personnalisé', 'Administration › Utilisateurs et rôles',
      ['Créez le rôle « Secrétariat » à partir de « Consultation » ; ne laissez que Tableau de bord, Élèves, Inscriptions, Aide ; décochez écriture et export.'],
      ['Rôle enregistré ; un utilisateur de ce rôle ne voit que ces pages.', 'Un rôle attribué à un utilisateur ne peut pas être supprimé.']),
    T('T12.3', 'Journal des opérations', 'Administration › Journal des opérations',
      ['Recherchez « Sylla » ; filtrez par type.'],
      ['Toutes vos opérations du test sont tracées (auteur, date, montant).']),
    T('T12.4', 'Sauvegardes', 'Administration › Données et sauvegardes',
      ['« Créer une sauvegarde datée » ou « Télécharger une sauvegarde ».', 'Bouton « Exporter JSON » en haut de page.'],
      ['Fichier daté créé / téléchargé ; l’export JSON contient toutes les données.']),
    T('T12.5', 'Centre d’aide', 'Administration › Centre d’aide',
      ['Recherchez : « saisir les heures », « Où ajouter une matière ? », « relance des parents ».', 'Ouvrez une fiche et cliquez sur le bouton d’accès direct.'],
      ['Chaque question mène à la bonne fiche (paie mensuelle, matières, fiches de rappel) ; le bouton ouvre la bonne page.']),
    T('T12.6', 'Affichage mobile', 'Toute l’application',
      ['Réduisez la fenêtre (ou ouvrez sur téléphone).'],
      ['Le menu devient repliable ; pas de défilement horizontal sur les pages.'])
  ] },
  { titre: 'Fin des tests', tests: [
    T('F1', 'Récupérer vos données d’origine', 'Administration › Données et sauvegardes › Copies de sécurité',
      ['Sur la copie « Avant réinitialisation », cliquez sur « Restaurer » et confirmez avec votre mot de passe.'],
      ['Vos données d’avant les tests sont de retour (années, élèves, paiements…).'], 'Les données de test sont alors remplacées : exportez d’abord vos résultats (onglet Synthèse).')
  ] }
];

// ── Procédures : reprises des fiches du centre d'aide ──
const PROCEDURES = HELP_CATEGORIES.map((c) => ({
  id: c.id, label: c.label, icon: c.icon, description: c.description,
  fiches: HELP_TOPICS.filter((t) => t.categorie === c.id).map((t) => ({
    id: t.id, titre: t.titre, description: t.description, chemin: t.chemin || [], autorisation: t.autorisation || '',
    etapes: t.etapes || [], resultat: t.resultat || '', erreurs: t.erreurs || []
  }))
})).filter((c) => c.fiches.length);

const data = JSON.stringify({ PRISE_EN_MAIN, REGLES, SECTIONS, PROCEDURES, genere: new Date().toISOString().slice(0, 10) }).replace(/</g, '\\u003c');
const nbTests = SECTIONS.reduce((s, x) => s + x.tests.length, 0);
const nbFiches = PROCEDURES.reduce((s, x) => s + x.fiches.length, 0);

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cahier de tests IBK</title>
<style>
:root { --bg: #f6f5fb; --card: #ffffff; --ink: #1f1b2e; --muted: #6b6880; --line: #e6e3f0; --brand: #7c3aed; --brand-soft: #f3efff; --accent: #f97316; --ok: #16a34a; --ok-soft: #e8f8ee; --ko: #dc2626; --ko-soft: #fdecec; --na: #9ca3af; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #141220; --card: #1d1a2c; --ink: #ece9f7; --muted: #a29fb8; --line: #2f2b44; --brand: #a78bfa; --brand-soft: #2a2342; --accent: #fb923c; --ok: #4ade80; --ok-soft: #173024; --ko: #f87171; --ko-soft: #3a1b1f; } }
:root[data-theme="dark"] { --bg: #141220; --card: #1d1a2c; --ink: #ece9f7; --muted: #a29fb8; --line: #2f2b44; --brand: #a78bfa; --brand-soft: #2a2342; --accent: #fb923c; --ok: #4ade80; --ok-soft: #173024; --ko: #f87171; --ko-soft: #3a1b1f; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; }
header.top { background: linear-gradient(120deg, #5b21b6, #7c3aed 55%, #f97316); color: #fff; padding: 22px 16px 0; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 16px; }
header.top .wrap { padding: 0; }
header.top h1 { margin: 0; font-size: 24px; }
header.top p { margin: 4px 0 14px; opacity: .9; }
nav.tabs { display: flex; gap: 4px; overflow-x: auto; }
nav.tabs button { border: 0; background: rgba(255,255,255,.14); color: #fff; padding: 10px 16px; border-radius: 10px 10px 0 0; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
nav.tabs button.active { background: var(--bg); color: var(--brand); }
main { padding: 20px 0 60px; }
section.page { display: none; } section.page.active { display: block; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; }
h2 { font-size: 20px; margin: 0 0 12px; } h3 { font-size: 17px; margin: 0 0 8px; }
.muted { color: var(--muted); font-size: 13px; }
.steps { counter-reset: s; list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
.steps li { counter-increment: s; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 12px 12px 52px; position: relative; }
.steps li::before { content: counter(s); position: absolute; left: 12px; top: 12px; width: 28px; height: 28px; border-radius: 50%; background: var(--brand); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; }
.rules li { margin: 6px 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.toolbar input, .toolbar select { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); min-width: 0; }
.toolbar input[type=search] { flex: 1 1 240px; }
.btn { font: inherit; font-weight: 600; border: 1px solid var(--line); background: var(--card); color: var(--ink); padding: 8px 14px; border-radius: 10px; cursor: pointer; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.progress { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bar { flex: 1 1 200px; height: 10px; background: var(--brand-soft); border-radius: 99px; overflow: hidden; display: flex; }
.bar i { display: block; height: 100%; } .bar .b-ok { background: var(--ok); } .bar .b-ko { background: var(--ko); }
.counts span { margin-right: 12px; font-weight: 600; }
.sec-title { margin: 22px 0 10px; font-size: 18px; color: var(--brand); }
.test { background: var(--card); border: 1px solid var(--line); border-left: 5px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
.test.ok { border-left-color: var(--ok); } .test.ko { border-left-color: var(--ko); background: linear-gradient(90deg, var(--ko-soft), var(--card) 40%); } .test.na { border-left-color: var(--na); }
.test-head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.test-id { font-weight: 700; color: var(--brand); min-width: 48px; }
.test-head h4 { margin: 0; font-size: 16px; flex: 1 1 220px; }
.path { display: inline-block; font-size: 12px; background: var(--brand-soft); color: var(--brand); border-radius: 99px; padding: 2px 10px; margin: 6px 0; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 6px; }
.cols h5 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.cols ol, .cols ul { margin: 0; padding-left: 20px; }
.note { margin-top: 8px; font-size: 13px; color: var(--accent); }
.verdict { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.verdict label { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 99px; cursor: pointer; font-weight: 600; font-size: 14px; user-select: none; }
.verdict input[type=radio] { accent-color: var(--brand); width: 16px; height: 16px; margin: 0; }
.verdict label.v-ok:has(input:checked) { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
.verdict label.v-ko:has(input:checked) { background: var(--ko-soft); border-color: var(--ko); color: var(--ko); }
.verdict label.v-na:has(input:checked) { border-color: var(--na); }
.verdict textarea { flex: 1 1 260px; font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); min-height: 36px; resize: vertical; }
.cat { margin-bottom: 18px; }
.cat > h3 { display: flex; gap: 8px; align-items: center; }
details.fiche { background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 8px; }
details.fiche summary { padding: 12px 16px; cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 8px; }
details.fiche summary::after { content: "+"; color: var(--brand); font-weight: 700; } details.fiche[open] summary::after { content: "−"; }
details.fiche .body { padding: 0 16px 14px; }
.err { background: var(--ko-soft); border-radius: 10px; padding: 8px 12px; margin-top: 8px; font-size: 14px; }
table.synth { width: 100%; border-collapse: collapse; font-size: 14px; }
table.synth th, table.synth td { border-bottom: 1px solid var(--line); padding: 8px 6px; text-align: left; vertical-align: top; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; }
.badge.ok { background: var(--ok-soft); color: var(--ok); } .badge.ko { background: var(--ko-soft); color: var(--ko); } .badge.na { background: var(--brand-soft); color: var(--muted); }
.who { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.who label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
.who input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); }
.hidden { display: none !important; }
@media (max-width: 720px) { .cols { grid-template-columns: 1fr; } header.top h1 { font-size: 20px; } }
@media print {
  header.top { background: none; color: #000; padding: 0; } nav.tabs, .toolbar, .no-print { display: none !important; }
  section.page { display: block !important; page-break-before: always; } section.page:first-of-type { page-break-before: avoid; }
  body { background: #fff; color: #000; font-size: 12px; } .card, .test, details.fiche { break-inside: avoid; border-color: #ccc; }
  details.fiche .body { display: block; } .verdict textarea { border: 1px solid #999; }
}
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <h1>Cahier de tests et procédures — Application IBK</h1>
    <p> · ${nbTests} tests guidés · ${nbFiches} procédures · généré le <span data-genere></span></p>
    <nav class="tabs" role="tablist">
      <button class="active" data-tab="prise">Prise en main</button>
      <button data-tab="procedures">Procédures</button>
      <button data-tab="tests">Cahier de tests</button>
      <button data-tab="synthese">Synthèse</button>
    </nav>
  </div>
</header>
<main class="wrap">
  <section class="page active" id="prise">
    <div class="card"><h2>Comment utiliser ce document</h2>
      <p>1. Lisez <b>Prise en main</b> pour comprendre l’ordre logique de l’application.<br>2. Consultez <b>Procédures</b> quand vous cherchez comment faire une opération (recherche par mot-clé).<br>3. Déroulez le <b>Cahier de tests</b> dans l’ordre, application ouverte à côté : pour chaque test, suivez les étapes, comparez au résultat attendu et cochez <b>Réussi</b> ou <b>Échec</b> (avec une remarque).<br>4. L’onglet <b>Synthèse</b> récapitule vos résultats, à imprimer ou exporter.</p>
      <p class="muted">Vos coches et remarques sont mémorisées dans ce navigateur : vous pouvez fermer et rouvrir le fichier sans rien perdre.</p></div>
    <h2>L’application en 11 étapes</h2>
    <ol class="steps" data-prise></ol>
    <div class="card" style="margin-top:14px"><h3>Règles importantes à connaître</h3><ul class="rules" data-regles></ul></div>
  </section>

  <section class="page" id="procedures">
    <div class="toolbar"><input type="search" data-proc-search placeholder="Rechercher une procédure : inscrire, reçu, heures, sauvegarde…" /><button class="btn" data-proc-toggle>Tout ouvrir</button></div>
    <div data-procs></div>
  </section>

  <section class="page" id="tests">
    <div class="card no-print">
      <div class="progress"><b data-pct>0 %</b><div class="bar"><i class="b-ok" data-bar-ok></i><i class="b-ko" data-bar-ko></i></div>
        <div class="counts"><span style="color:var(--ok)" data-c-ok></span><span style="color:var(--ko)" data-c-ko></span><span class="muted" data-c-reste></span></div></div>
    </div>
    <div class="toolbar">
      <input type="search" data-test-search placeholder="Filtrer les tests…" />
      <select data-test-filter><option value="">Tous les tests</option><option value="todo">À faire</option><option value="ko">En échec</option><option value="ok">Réussis</option></select>
      <button class="btn" onclick="window.print()">Imprimer</button>
    </div>
    <div data-tests></div>
  </section>

  <section class="page" id="synthese">
    <div class="card"><h2>Synthèse des résultats</h2>
      <div class="who">
        <label>Testeur <input data-meta="testeur" placeholder="Nom et fonction" /></label>
        <label>Date des tests <input data-meta="date" type="date" /></label>
        <label>Version / poste <input data-meta="poste" placeholder="Ex : PC du secrétariat, Chrome" /></label>
      </div>
      <p class="progress" style="margin-top:14px"><span class="counts" data-synth-counts></span></p>
      <div class="toolbar no-print"><button class="btn primary" data-export>Exporter les résultats (CSV / Excel)</button><button class="btn" onclick="window.print()">Imprimer / PDF</button><button class="btn" data-reset>Effacer mes résultats</button></div>
    </div>
    <div class="card"><h3>Tests en échec</h3><div data-synth-ko></div></div>
    <div class="card"><h3>Tous les tests</h3><table class="synth"><thead><tr><th>N°</th><th>Test</th><th>Résultat</th><th>Remarque</th></tr></thead><tbody data-synth-all></tbody></table></div>
  </section>
</main>
<script id="data" type="application/json">${data}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var KEY = 'ibk_cahier_tests_v1';
  var S = { res: {}, rem: {}, meta: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) S = Object.assign(S, saved); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }
  var ALL = []; D.SECTIONS.forEach(function (s) { s.tests.forEach(function (t) { ALL.push(t); }); });

  $('[data-genere]').textContent = D.genere.split('-').reverse().join('/');
  $('[data-prise]').innerHTML = D.PRISE_EN_MAIN.map(function (p) { return '<li><b>' + esc(p.titre) + '</b><div class="muted">' + esc(p.texte) + '</div></li>'; }).join('');
  $('[data-regles]').innerHTML = D.REGLES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');

  // Onglets (mémorisés)
  function tab(id) {
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
    document.querySelectorAll('section.page').forEach(function (p) { p.classList.toggle('active', p.id === id); });
    try { localStorage.setItem(KEY + '_tab', id); } catch (e) {}
    if (id === 'synthese') renderSynth();
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.tab); }); });

  // Procédures
  function renderProcs() {
    var q = norm($('[data-proc-search]').value.trim());
    var html = D.PROCEDURES.map(function (c) {
      var fiches = c.fiches.filter(function (f) { return !q || norm(f.titre + ' ' + f.description + ' ' + f.etapes.join(' ') + ' ' + c.label).indexOf(q) >= 0; });
      if (!fiches.length) return '';
      return '<div class="cat"><h3>' + esc(c.icon) + ' ' + esc(c.label) + ' <span class="muted">' + fiches.length + ' procédure(s)</span></h3>' + fiches.map(function (f) {
        return '<details class="fiche"' + (q ? ' open' : '') + '><summary>' + esc(f.titre) + '</summary><div class="body">' +
          '<p>' + esc(f.description) + '</p>' + (f.chemin.length ? '<span class="path">' + esc(f.chemin.join(' › ')) + '</span>' : '') +
          (f.autorisation ? '<p class="muted">Droits : ' + esc(f.autorisation) + '</p>' : '') +
          '<div class="cols"><div><h5>Étapes</h5><ol>' + f.etapes.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ol></div>' +
          '<div><h5>Résultat</h5><p style="margin:0">' + esc(f.resultat) + '</p></div></div>' +
          f.erreurs.map(function (e) { return '<div class="err"><b>Problème :</b> ' + esc(e.probleme) + '<br><b>Solution :</b> ' + esc(e.solution) + '</div>'; }).join('') +
          '</div></details>';
      }).join('') + '</div>';
    }).join('');
    $('[data-procs]').innerHTML = html || '<p class="muted">Aucune procédure ne correspond à cette recherche.</p>';
  }
  $('[data-proc-search]').addEventListener('input', renderProcs);
  $('[data-proc-toggle]').addEventListener('click', function () {
    var list = document.querySelectorAll('details.fiche'); var open = !Array.prototype.every.call(list, function (d) { return d.open; });
    list.forEach(function (d) { d.open = open; }); this.textContent = open ? 'Tout fermer' : 'Tout ouvrir';
  });

  // Cahier de tests
  function renderTests() {
    $('[data-tests]').innerHTML = D.SECTIONS.map(function (s) {
      return '<div data-sec><h3 class="sec-title">' + esc(s.titre) + '</h3>' + s.tests.map(function (t) {
        var r = S.res[t.id] || '';
        var radio = function (v, l, cls) { return '<label class="' + cls + '"><input type="radio" name="r-' + esc(t.id) + '" value="' + v + '" data-res="' + esc(t.id) + '"' + (r === v ? ' checked' : '') + ' /> ' + l + '</label>'; };
        return '<article class="test ' + r + '" data-test="' + esc(t.id) + '" data-text="' + esc(norm(t.id + ' ' + t.titre + ' ' + t.chemin + ' ' + t.etapes.join(' '))) + '">' +
          '<div class="test-head"><span class="test-id">' + esc(t.id) + '</span><h4>' + esc(t.titre) + '</h4></div>' +
          '<span class="path">' + esc(t.chemin) + '</span>' +
          '<div class="cols"><div><h5>À faire</h5><ol>' + t.etapes.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ol></div>' +
          '<div><h5>Résultat attendu</h5><ul>' + t.attendu.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div></div>' +
          (t.note ? '<div class="note">⚠ ' + esc(t.note) + '</div>' : '') +
          '<div class="verdict">' + radio('ok', '✓ Réussi', 'v-ok') + radio('ko', '✗ Échec', 'v-ko') + radio('na', 'Non testé', 'v-na') +
          '<textarea data-rem="' + esc(t.id) + '" rows="1" placeholder="Remarque (obligatoire en cas d’échec : ce que vous avez constaté)">' + esc(S.rem[t.id] || '') + '</textarea></div></article>';
      }).join('') + '</div>';
    }).join('');
    applyFilter(); renderProgress();
  }
  function applyFilter() {
    var q = norm($('[data-test-search]').value.trim()); var f = $('[data-test-filter]').value;
    document.querySelectorAll('[data-test]').forEach(function (el) {
      var r = S.res[el.dataset.test] || '';
      var ok = (!q || el.dataset.text.indexOf(q) >= 0) && (!f || (f === 'todo' ? !r || r === 'na' : r === f));
      el.classList.toggle('hidden', !ok);
    });
    document.querySelectorAll('[data-sec]').forEach(function (s) { s.classList.toggle('hidden', !s.querySelector('[data-test]:not(.hidden)')); });
  }
  function counts() { var c = { ok: 0, ko: 0, na: 0 }; ALL.forEach(function (t) { var r = S.res[t.id]; if (r) c[r] += 1; }); c.reste = ALL.length - c.ok - c.ko; return c; }
  function renderProgress() {
    var c = counts(); var n = ALL.length;
    $('[data-pct]').textContent = Math.round((c.ok + c.ko) / n * 100) + ' % testé';
    $('[data-bar-ok]').style.width = (c.ok / n * 100) + '%'; $('[data-bar-ko]').style.width = (c.ko / n * 100) + '%';
    $('[data-c-ok]').textContent = c.ok + ' réussi(s)'; $('[data-c-ko]').textContent = c.ko + ' échec(s)'; $('[data-c-reste]').textContent = c.reste + ' restant(s)';
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.res) { S.res[t.dataset.res] = t.value; save(); var art = t.closest('.test'); art.className = 'test ' + t.value; renderProgress(); if (t.value === 'ko') { var ta = art.querySelector('textarea'); if (ta && !ta.value) ta.focus(); } }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.rem) { S.rem[t.dataset.rem] = t.value; save(); }
    if (t.dataset && t.dataset.meta) { S.meta[t.dataset.meta] = t.value; save(); }
    if (t.matches && t.matches('[data-test-search]')) applyFilter();
  });
  $('[data-test-filter]').addEventListener('change', applyFilter);

  // Synthèse
  var LIB = { ok: 'Réussi', ko: 'Échec', na: 'Non testé' };
  function renderSynth() {
    var c = counts();
    $('[data-synth-counts]').innerHTML = '<span style="color:var(--ok)">' + c.ok + ' réussi(s)</span><span style="color:var(--ko)">' + c.ko + ' échec(s)</span><span class="muted">' + c.reste + ' non testé(s) sur ' + ALL.length + '</span>';
    var kos = ALL.filter(function (t) { return S.res[t.id] === 'ko'; });
    $('[data-synth-ko]').innerHTML = kos.length ? kos.map(function (t) { return '<p><b>' + esc(t.id) + ' — ' + esc(t.titre) + '</b><br><span class="muted">' + esc(S.rem[t.id] || 'Aucune remarque saisie') + '</span></p>'; }).join('') : '<p class="muted">Aucun échec signalé.</p>';
    $('[data-synth-all]').innerHTML = ALL.map(function (t) { var r = S.res[t.id]; return '<tr><td>' + esc(t.id) + '</td><td>' + esc(t.titre) + '</td><td>' + (r ? '<span class="badge ' + r + '">' + LIB[r] + '</span>' : '<span class="muted">—</span>') + '</td><td>' + esc(S.rem[t.id] || '') + '</td></tr>'; }).join('');
    document.querySelectorAll('[data-meta]').forEach(function (i) { i.value = S.meta[i.dataset.meta] || ''; });
  }
  $('[data-export]').addEventListener('click', function () {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Testeur', S.meta.testeur || ''], ['Date', S.meta.date || ''], ['Poste', S.meta.poste || ''], [], ['N°', 'Section', 'Test', 'Résultat', 'Remarque']];
    D.SECTIONS.forEach(function (s) { s.tests.forEach(function (t) { rows.push([t.id, s.titre, t.titre, LIB[S.res[t.id]] || 'Non renseigné', S.rem[t.id] || '']); }); });
    var csv = '\\ufeff' + rows.map(function (r) { return r.map(q).join(';'); }).join('\\r\\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'resultats-tests-IBK-' + (S.meta.date || new Date().toISOString().slice(0, 10)) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('[data-reset]').addEventListener('click', function () {
    if (!confirm('Effacer toutes vos coches et remarques ?')) return;
    S = { res: {}, rem: {}, meta: {} }; save(); renderTests(); renderSynth();
  });

  renderProcs(); renderTests();
  var last = 'prise'; try { last = localStorage.getItem(KEY + '_tab') || 'prise'; } catch (e) {}
  tab(document.getElementById(last) ? last : 'prise');
})();
</script>
</body>
</html>
`;

fs.writeFileSync(sortie, html);
console.log(`Cahier de tests créé : ${path.relative(root, sortie)} (${nbTests} tests, ${nbFiches} procédures)`);
