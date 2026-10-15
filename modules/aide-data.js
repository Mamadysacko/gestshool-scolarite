import { pagePath } from './navigation.js';

// Documentation centralisée du centre d'aide. Chaque fiche décrit une fonctionnalité RÉELLE de l'application :
// la page de destination (`page`) doit être un identifiant de section existant, `focus` un élément présent sur
// cette page, `roles` les rôles qui peuvent l'utiliser. tests/aide.mjs vérifie cette cohérence.
//
// Prérequis : `obligatoire: true` uniquement si l'opération est réellement bloquée sans eux ; sinon recommandation.
// `check` désigne un contrôle de CHECKS, évalué sur les données actuelles (année active).

const activeYear = (s) => s.annees.find((a) => a.id === s.anneeActiveId) || null;
const inActiveYear = (list, s) => list.filter((x) => x.anneeId === s.anneeActiveId);

export const CHECKS = {
  annee: { label: 'Au moins une année scolaire existe', test: (s) => s.annees.length > 0 },
  anneeActive: { label: 'Une année scolaire active est définie', test: (s) => Boolean(activeYear(s)) },
  anneeOuverte: { label: 'L’année active n’est pas clôturée', test: (s) => Boolean(activeYear(s)) && activeYear(s).statut !== 'cloturee' },
  classe: { label: 'Au moins une classe pour l’année active', test: (s) => inActiveYear(s.classes, s).length > 0 },
  tarif: { label: 'Des frais configurés pour au moins une classe de l’année active', test: (s) => inActiveYear(s.tarifs, s).length > 0 },
  eleve: { label: 'Au moins un élève enregistré', test: (s) => s.eleves.length > 0 },
  inscription: { label: 'Au moins une inscription pour l’année active', test: (s) => inActiveYear(s.inscriptions, s).length > 0 },
  echeances: { label: 'Au moins une inscription de l’année active avec un échéancier (tranches ou mensualités)', test: (s) => inActiveYear(s.inscriptions, s).some((i) => (i.echeances || []).length > 0) },
  payable: { label: 'Au moins un élève inscrit dans une classe dont les frais sont configurés (année active)', test: (s) => inActiveYear(s.inscriptions, s).some((i) => (i.echeances || []).length > 0 || s.tarifs.some((t) => t.classeId === i.classeId && t.anneeId === i.anneeId)) },
  mensuel: { label: 'Un montant mensuel est défini dans au moins un tarif de l’année active', test: (s) => inActiveYear(s.tarifs, s).some((t) => Number(t.montantMensuel) > 0) },
  paiement: { label: 'Au moins un paiement valide enregistré', test: (s) => s.paiements.some((p) => !p.annule) },
  depense: { label: 'Au moins une dépense enregistrée', test: (s) => (s.depenses || []).some((d) => !d.annule) },
  caissier: { label: 'Le nom du caissier est renseigné dans Configuration', test: (s) => Boolean(String(s.config.caissier || '').trim()) },
  soldeOuverture: { label: 'Le solde d’ouverture de caisse de l’année active est renseigné', test: (s) => Number(activeYear(s)?.soldeInitial || 0) > 0 }
};

export const HELP_CATEGORIES = [
  { id: 'pilotage', label: 'Tableau de bord et analyses', icon: '📊', description: 'Indicateurs, graphiques et recouvrement.' },
  { id: 'annees', label: 'Années scolaires', icon: '🗓️', description: 'Créer, activer, clôturer une année.' },
  { id: 'classes', label: 'Classes et frais de scolarité', icon: '🏫', description: 'Classes, tranches et mensualités.' },
  { id: 'eleves', label: 'Élèves et inscriptions', icon: '🎓', description: 'Fiches élèves, inscriptions, réinscriptions.' },
  { id: 'paiements', label: 'Paiements et reçus', icon: '💳', description: 'Encaisser, imprimer, annuler.' },
  { id: 'depenses', label: 'Dépenses et trésorerie', icon: '🧮', description: 'Dépenses, reçus de dépense, solde de caisse.' },
  { id: 'rapports', label: 'Rapports et exports', icon: '🧾', description: 'Rapports PDF / Excel, retards, rappels.' },
  { id: 'etablissement', label: 'Établissement et sauvegardes', icon: '⚙️', description: 'En-tête, caissier, sauvegardes, réinitialisation.' },
  { id: 'securite', label: 'Utilisateurs et sécurité', icon: '🔐', description: 'Connexion, rôles, mots de passe.' }
];

const ALL = ['admin', 'comptable', 'lecture'];
const WRITE = ['admin', 'comptable'];
const ADMIN = ['admin'];

export const HELP_TOPICS = [
  // ── Tableau de bord et analyses ─────────────────────────────────────────
  {
    id: 'tableau-de-bord', categorie: 'pilotage', titre: 'Consulter le tableau de bord',
    description: 'Vue d’ensemble de l’établissement : montant attendu, encaissé, reste à percevoir, taux de recouvrement, recettes, dépenses, solde de caisse et graphiques.',
    motsCles: ['tableau de bord', 'accueil', 'indicateur', 'statistique', 'graphique', 'recouvrement', 'synthese', 'kpi', 'situation'],
    chemin: ['Tableau de bord'], page: 'dashboard', focus: '#dashboard .dashboard-filter-panel', roles: ALL,
    etapes: ['Cliquez sur « Tableau de bord » dans le menu.', 'Choisissez l’année scolaire, le niveau (catégorie) ou tapez le nom d’une classe pour filtrer.', 'Lisez les indicateurs puis les graphiques (recettes journalières et mensuelles, statut des élèves, recouvrement par classe, plus gros retards).'],
    prerequis: [{ check: 'inscription', obligatoire: false, texte: 'Sans inscription ni paiement, les indicateurs restent à zéro.', aide: 'inscrire-eleve' }],
    resultat: 'Les chiffres et graphiques reflètent les données enregistrées pour le filtre choisi.',
    erreurs: [{ probleme: 'Tous les montants sont à 0.', solution: 'Vérifiez le filtre « Année scolaire » : choisissez l’année qui contient vos inscriptions, ou « Toutes ».' }]
  },
  {
    id: 'analyse-financiere', categorie: 'pilotage', titre: 'Analyser les finances par formation, classe ou élève',
    description: 'Compare l’attendu, l’encaissé et le reste à percevoir par formation (catégorie), classe, élève ou année scolaire.',
    motsCles: ['analyse', 'comparer', 'formation', 'categorie', 'repartition', 'recettes par classe', 'performance'],
    chemin: ['Analyse financière'], page: 'analyse', focus: '#analyse .report-tabs', roles: ALL,
    etapes: ['Ouvrez « Tableau de bord › Analyse financière ».', 'Choisissez l’axe d’analyse : Formation, Classe, Élève ou Année scolaire.', 'Filtrez par année et catégorie, ou tapez dans « Recherche » pour réduire les lignes.'],
    prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Les encaissements n’apparaissent qu’après au moins un paiement.', aide: 'enregistrer-paiement' }],
    resultat: 'Un tableau détaillé et des graphiques (attendu / encaissé, répartition, évolution sur 12 mois).',
    erreurs: [{ probleme: 'Le filtre d’année est grisé.', solution: 'C’est normal avec l’axe « Année scolaire » : toutes les années sont comparées.' }]
  },

  // ── Années scolaires ────────────────────────────────────────────────────
  {
    id: 'creer-annee', categorie: 'annees', titre: 'Créer une année scolaire',
    description: 'Ajoute une année (ex. 2026-2027) avec ses dates et son solde d’ouverture de caisse. C’est le point de départ : classes, frais, inscriptions, paiements et dépenses y sont rattachés.',
    motsCles: ['annee scolaire', 'nouvelle annee', 'rentree', 'parametre', 'configurer annee', 'solde ouverture'],
    chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees form[data-form="annee"]', roles: WRITE,
    autorisation: 'Créer : administrateur ou comptable. Modifier une année existante : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Scolarité › Années scolaires ».', 'Saisissez le libellé (ex. 2026-2027), la date de rentrée et la date de fin.', 'Indiquez le solde d’ouverture de caisse (0 si aucun), puis les frais d’inscription et de réinscription de l’année.', 'Choisissez le statut (Préparation, Ouverte ou Clôturée) puis cliquez sur « Ajouter ».'],
    prerequis: [],
    resultat: 'L’année apparaît dans la liste. Si elle est « Ouverte », toute autre année ouverte est clôturée et elle devient l’année active.',
    erreurs: [
      { probleme: '« Année refusée : libellé vide ou déjà existant ».', solution: 'Chaque libellé doit être unique : vérifiez qu’elle n’existe pas déjà dans la liste.' },
      { probleme: '« La date de fin doit suivre la date de rentrée ».', solution: 'Corrigez les dates : la fin doit être postérieure à la rentrée.' }
    ]
  },
  {
    id: 'annee-active', categorie: 'annees', titre: 'Changer, ouvrir ou clôturer l’année active',
    description: 'L’année active est celle proposée par défaut dans les formulaires. Une année clôturée n’accepte plus de paiement ni de dépense.',
    motsCles: ['annee active', 'changer annee', 'cloturer', 'cloture', 'fermer annee', 'ouvrir annee', 'passer a l annee suivante'],
    chemin: ['Années', 'Liste des années'], page: 'annees', focus: '#annees .cards-grid', roles: WRITE,
    autorisation: '« Définir active » et « Valider (ouvrir) » : administrateur ou comptable. « Clôturer » et « Supprimer » : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Scolarité › Années scolaires » et repérez la carte de l’année.', 'Cliquez sur « Définir active » pour travailler sur cette année.', 'Cliquez sur « Valider (ouvrir) » pour l’ouvrir, ou « Clôturer » en fin d’année.'],
    prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année doit exister.', aide: 'creer-annee' }],
    resultat: 'Les formulaires (classes, inscriptions, paiements, dépenses) proposent l’année active par défaut.',
    erreurs: [
      { probleme: '« L’année … est clôturée : aucun paiement ne peut y être enregistré ».', solution: 'Un administrateur peut rouvrir l’année avec « Valider (ouvrir) » si un encaissement tardif doit être saisi.' },
      { probleme: 'Suppression refusée.', solution: 'Une année qui contient des classes ou des inscriptions ne peut pas être supprimée : l’historique financier est protégé.' }
    ]
  },

  // ── Classes et frais ────────────────────────────────────────────────────
  {
    id: 'creer-classe', categorie: 'classes', titre: 'Créer une classe',
    description: 'Ajoute une classe (ex. 6e A) dans une catégorie (Primaire, Collège, Lycée) pour une année scolaire. Après l’ajout, l’application ouvre directement la configuration des frais de cette classe.',
    motsCles: ['classe', 'nouvelle classe', 'ajouter classe', 'creer classe', 'niveau', 'salle', 'section', 'capacite', 'effectif'],
    chemin: ['Classes', 'Classe'], page: 'classes', focus: '#classes form[data-form="classe"]', roles: WRITE,
    autorisation: 'Créer / modifier : administrateur ou comptable. Supprimer : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Scolarité › Classes ».', 'Saisissez le nom de la classe et choisissez la catégorie.', 'Choisissez l’année scolaire et la capacité.', 'Cliquez sur « Ajouter » : vous êtes redirigé vers « Scolarité › Tarifs et frais » avec la classe déjà sélectionnée.'],
    prerequis: [{ check: 'annee', obligatoire: true, texte: 'Une année scolaire doit exister.', aide: 'creer-annee' }],
    resultat: 'La classe apparaît dans la liste et le formulaire des frais est prêt à être complété.',
    erreurs: [
      { probleme: '« Classe refusée : nom vide ou déjà utilisé pour cette année ».', solution: 'Deux classes de la même année ne peuvent pas porter le même nom.' },
      { probleme: 'Les champs « Salle » et « Niveau » n’existent plus.', solution: 'C’est voulu : seuls le nom, la catégorie, l’année et la capacité sont utilisés.' }
    ]
  },
  {
    id: 'configurer-frais', categorie: 'classes', titre: 'Configurer les frais de scolarité (tranches ou mensualités)',
    description: 'Définit pour une classe le montant annuel réparti en 3 tranches (avec dates limites) et le montant du paiement mensuel. La famille choisit ensuite, au premier paiement, de payer par tranches ou par mois.',
    motsCles: ['tarif', 'frais', 'scolarite', 'tranche', 'mensualite', 'mensuel', 'montant mensuel', 'echeance', 'echeancier', 'montant annuel', 'prix', 'cout'],
    chemin: ['Tarifs', 'Frais de scolarité d’une classe'], page: 'tarifs', focus: '#tarifs form[data-form="tarif"]', roles: WRITE,
    autorisation: 'Créer : administrateur ou comptable. Modifier des frais existants ou changer les dates proposées : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Scolarité › Tarifs et frais » (ou créez une classe : vous y êtes redirigé).', 'Choisissez l’année, la catégorie puis la classe.', 'Saisissez le montant annuel : les 3 tranches, leurs dates et le montant mensuel sont proposés automatiquement (tous modifiables).', 'Vérifiez le « Montant du paiement mensuel », le nombre de mensualités et la date de la 1ère mensualité (0 = paiement mensuel non proposé).', 'Contrôlez le récapitulatif sous le formulaire, puis cliquez sur « Ajouter ». Si le total mensuel s’écarte du montant annuel (au-delà de l’arrondi), une confirmation est demandée.'],
    prerequis: [{ check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' }],
    resultat: 'Les élèves de la classe disposent d’un échéancier provisoire par tranches ; la modalité définitive (tranches ou mensuel) est fixée au premier paiement. Une modification ultérieure met à jour les échéances non encore payées des élèves déjà inscrits.',
    erreurs: [
      { probleme: '« La somme des 3 tranches doit être égale au montant annuel ».', solution: 'Corrigez une tranche, ou videz les 3 tranches pour un calcul automatique.' },
      { probleme: '« Un tarif existe déjà pour cette classe ».', solution: 'Utilisez « Modifier » sur la carte du tarif dans « Tarifs configurés ».' },
      { probleme: '« Montant mensuel différent du montant annuel ».', solution: 'Confirmez si les frais mensuels sont volontairement majorés ; sinon corrigez le montant mensuel ou le nombre de mensualités.' }
    ]
  },
  {
    id: 'dupliquer-frais', categorie: 'classes', titre: 'Reprendre les frais d’une année sur l’année active',
    description: 'Copie un tarif existant vers l’année active, pour éviter de tout ressaisir à la rentrée.',
    motsCles: ['dupliquer', 'copier tarif', 'reprendre frais', 'nouvelle annee frais'],
    chemin: ['Tarifs', 'Tarifs configurés', 'Dupliquer'], page: 'tarifs', focus: '#tarifs .cards-grid', roles: WRITE,
    etapes: ['Définissez d’abord la nouvelle année comme active (« Scolarité › Années scolaires » › « Définir active »).', 'Ouvrez « Scolarité › Tarifs et frais » et cliquez sur « Dupliquer » sur la carte du tarif à reprendre.'],
    prerequis: [{ check: 'tarif', obligatoire: false, texte: 'Il faut au moins un tarif existant à dupliquer.', aide: 'configurer-frais' }],
    resultat: 'Une copie du tarif est rattachée à l’année active.',
    erreurs: [{ probleme: 'La copie pointe vers une classe de l’ancienne année.', solution: 'Le tarif reprend la classe d’origine : créez la classe pour la nouvelle année puis configurez ses frais avec « Scolarité › Tarifs et frais ».' }]
  },

  // ── Élèves et inscriptions ──────────────────────────────────────────────
  {
    id: 'ajouter-eleve', categorie: 'eleves', titre: 'Ajouter un élève',
    description: 'Crée la fiche d’un élève. Le matricule IBK-AAAA-NNNN est généré automatiquement si vous le laissez vide. Après l’enregistrement, l’application passe à l’inscription.',
    motsCles: ['eleve', 'ajouter eleve', 'nouvel eleve', 'fiche eleve', 'matricule', 'etudiant', 'enfant', 'dossier'],
    chemin: ['Élèves', 'Fiche élève'], page: 'eleves', focus: '#eleves form[data-form="eleve"]', roles: WRITE,
    autorisation: 'Créer / modifier : administrateur ou comptable. Supprimer : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Élèves › Dossiers élèves » (ou cliquez sur « + Nouvel élève » en haut de page).', 'Renseignez au minimum le prénom et le nom.', 'Choisissez la classe souhaitée (facultatif mais recommandé : elle sera préremplie à l’inscription).', 'Cliquez sur « Ajouter et inscrire ».'],
    prerequis: [{ check: 'classe', obligatoire: false, texte: 'Une classe dans l’année active permet de préremplir l’inscription.', aide: 'creer-classe' }],
    resultat: 'La fiche est créée et vous arrivez sur « Élèves › Inscriptions » avec l’élève déjà sélectionné.',
    erreurs: [
      { probleme: '« Classe introuvable pour l’année active ».', solution: 'Choisissez la classe dans la liste proposée pendant la saisie, ou créez-la d’abord.' },
      { probleme: '« Fiche refusée : … matricule invalide ou déjà utilisé ».', solution: 'Laissez le matricule vide pour qu’il soit généré, ou utilisez un matricule non attribué.' }
    ]
  },
  {
    id: 'inscrire-eleve', categorie: 'eleves', titre: 'Inscrire un élève dans une classe',
    description: 'Rattache un élève à une classe pour une année scolaire et génère son échéancier à partir des frais de la classe. Un élève ne peut être inscrit qu’une fois par année.',
    motsCles: ['inscription', 'inscrire', 'admission', 'enregistrer eleve', 'affecter classe', 'mettre dans une classe'],
    chemin: ['Inscriptions', 'Inscription'], page: 'inscriptions', focus: '#inscriptions form[data-form="inscription"]', roles: WRITE,
    autorisation: 'Inscrire : administrateur ou comptable. Supprimer une inscription : autorisation d’un administrateur (impossible si des paiements existent).',
    etapes: ['Ouvrez « Élèves › Inscriptions » (vous y arrivez automatiquement après l’ajout d’un élève).', 'Choisissez l’année, la catégorie puis la classe.', 'Tapez le nom ou le matricule de l’élève et sélectionnez-le.', 'Laissez le type sur « Automatique » : réinscription si l’élève a déjà été inscrit une autre année, sinon nouvelle inscription.', 'Cliquez sur « Ajouter l’inscription » : l’application ouvre le formulaire de paiement prérempli.'],
    prerequis: [
      { check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' },
      { check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' },
      { check: 'tarif', obligatoire: false, texte: 'Avec des frais déjà configurés, l’application enchaîne directement sur le paiement. Sinon, configurez-les ensuite : l’échéancier des élèves inscrits est alors créé automatiquement.', aide: 'configurer-frais' }
    ],
    resultat: 'L’inscription apparaît dans l’historique avec un échéancier provisoire par tranches, et le formulaire de paiement s’ouvre avec l’élève sélectionné. La modalité (tranches ou mensuel) se choisit au premier paiement.',
    erreurs: [
      { probleme: '« Inscription refusée : cet élève est déjà inscrit pour cette année ».', solution: 'Un élève n’a qu’une inscription par année ; consultez sa fiche dans « Élèves › Dossiers élèves ».' },
      { probleme: '« Aucun frais configuré pour cette classe ».', solution: 'Vous êtes redirigé vers « Scolarité › Tarifs et frais » : configurez les frais de la classe.' }
    ]
  },
  {
    id: 'reinscrire-valider', categorie: 'eleves', titre: 'Réinscrire ou valider une inscription',
    description: '« Réinscrire » crée une inscription pour l’année active à partir d’une inscription précédente ; « Valider » marque une inscription comme validée (date et auteur conservés).',
    motsCles: ['reinscription', 'reinscrire', 'valider inscription', 'annee suivante', 'passage'],
    chemin: ['Inscriptions', 'Historique d’inscriptions'], page: 'inscriptions', focus: '#inscriptions table', roles: WRITE,
    etapes: ['Définissez la nouvelle année comme active (« Scolarité › Années scolaires » › « Définir active »).', 'Ouvrez « Élèves › Inscriptions » et repérez l’élève dans l’historique.', 'Cliquez sur « Réinscrire » ou sur « Valider ».'],
    prerequis: [{ check: 'inscription', obligatoire: true, texte: 'Une inscription précédente doit exister.', aide: 'inscrire-eleve' }],
    resultat: 'La réinscription reprend la même classe ; les échéances sont générées si des frais existent pour cette classe et cette année.',
    erreurs: [{ probleme: '« Réinscription impossible : l’élève est déjà inscrit pour l’année active ».', solution: 'Vérifiez l’année active ou l’inscription existante.' }]
  },
  {
    id: 'fiche-eleve', categorie: 'eleves', titre: 'Consulter la situation financière d’un élève',
    description: 'Affiche le dossier complet d’un élève : informations, échéancier par année (dû, payé, reste, statut, progression) et historique des paiements, y compris annulés.',
    motsCles: ['situation eleve', 'dossier', 'historique eleve', 'reste a payer', 'solde eleve', 'combien doit', 'fiche', 'profil'],
    chemin: ['Élèves', 'Répertoire des élèves', 'Consulter'], page: 'eleves', focus: '#eleves [data-student-search]', roles: WRITE,
    etapes: ['Ouvrez « Élèves › Dossiers élèves ».', 'Tapez le nom, le matricule ou le téléphone dans « Recherche avancée ».', 'Cliquez sur « Consulter » sur la ligne de l’élève.'],
    prerequis: [{ check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' }],
    resultat: 'Une fenêtre présente l’échéancier de chaque année avec les barres de progression et l’historique complet.',
    erreurs: [{ probleme: 'Le rôle « Consultation » n’a pas accès à la page Élèves.', solution: 'Utilisez « Rapports » › « Situation individuelle », accessible à tous les rôles.' }]
  },
  {
    id: 'exporter-eleves', categorie: 'eleves', titre: 'Exporter la liste des élèves',
    description: 'Télécharge la liste des élèves au format CSV (ouvrable dans Excel).',
    motsCles: ['liste eleves', 'exporter eleves', 'csv', 'excel eleves', 'telecharger liste'],
    chemin: ['Élèves', 'Répertoire des élèves', 'Exporter la liste'], page: 'eleves', focus: '#eleves [data-action="report:students-csv"]', roles: WRITE,
    etapes: ['Ouvrez « Élèves › Dossiers élèves ».', 'Cliquez sur « Exporter la liste » dans le répertoire.'],
    prerequis: [{ check: 'eleve', obligatoire: false, texte: 'Sans élève, le fichier ne contient que les en-têtes.', aide: 'ajouter-eleve' }],
    resultat: 'Le fichier liste-eleves.csv est téléchargé.',
    erreurs: []
  },

  // ── Paiements ───────────────────────────────────────────────────────────
  {
    id: 'enregistrer-paiement', categorie: 'paiements', titre: 'Enregistrer un paiement de scolarité',
    description: 'Encaisse un montant pour un élève inscrit. Au premier paiement, vous choisissez la modalité de règlement (mensuelle ou par tranches) ; le montant est ensuite réparti automatiquement sur la première échéance impayée, puis sur les suivantes. Le reçu est numéroté et imprimable.',
    motsCles: ['paiement', 'payer', 'encaisser', 'encaissement', 'versement', 'regler', 'reglement', 'caisse', 'acompte', 'frais de scolarite', 'scolarite'],
    chemin: ['Paiements', 'Enregistrer un paiement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Encaissements » (vous y arrivez automatiquement après une inscription).', 'Vérifiez l’année scolaire puis tapez le nom ou le matricule de l’élève et choisissez-le dans la liste.', 'Choisissez la modalité de règlement : « Paiement par tranches » ou « Paiement mensuel » (obligatoire ; elle est reprise automatiquement aux paiements suivants).', 'Contrôlez la fiche affichée : classe, catégorie, échéancier adapté à la modalité, paiements précédents.', 'Saisissez le montant payé (« Solder tout » remplit le reste de l’année), le mode, la date et, si besoin, la référence et la description.', 'Lisez l’aperçu (reste après paiement, statut, répartition) puis cliquez sur « Enregistrer le paiement ».'],
    prerequis: [
      { check: 'payable', obligatoire: true, texte: 'L’élève doit être inscrit dans une classe dont les frais (tarif) sont configurés.', aide: 'inscrire-eleve' },
      { check: 'anneeOuverte', obligatoire: true, texte: 'L’année du paiement ne doit pas être clôturée.', aide: 'annee-active' },
      { check: 'caissier', obligatoire: false, texte: 'Sans nom de caissier configuré, le reçu porte le nom de l’utilisateur connecté.', aide: 'configurer-etablissement' }
    ],
    resultat: 'Le paiement apparaît dans le journal avec son numéro REC-AAAA-NNNNNN, les soldes et statuts sont mis à jour, et le reçu s’imprime si la case est cochée.',
    erreurs: [
      { probleme: 'Le bouton « Enregistrer le paiement » reste grisé.', solution: 'Choisissez d’abord la modalité de règlement (tranches ou mensuel).' },
      { probleme: '« Le montant dépasse le solde de l’année scolaire ».', solution: 'Un excédent n’est jamais reporté sur une autre année : encaissez au maximum le reste affiché.' },
      { probleme: 'L’élève n’apparaît pas dans la recherche.', solution: 'Vérifiez l’année sélectionnée dans le formulaire et que l’élève est bien inscrit pour cette année.' },
      { probleme: '« Un paiement identique vient d’être enregistré ».', solution: 'Protection contre les doubles saisies : vérifiez le journal avant de confirmer.' },
      { probleme: '« La date de paiement ne peut pas être dans le futur ».', solution: 'Saisissez la date réelle de l’encaissement.' }
    ]
  },
  {
    id: 'repartition-tranches', categorie: 'paiements', titre: 'Comprendre la répartition automatique sur les tranches',
    description: 'Chaque paiement remplit d’abord la première tranche ou le premier mois non soldé ; l’excédent passe à l’échéance suivante, et ainsi de suite, dans la même année scolaire uniquement. En mensuel, chaque mois vaut le montant mensuel du tarif.',
    motsCles: ['repartition', 'imputation', 'excedent', 'surplus', 'tranche suivante', 'avance', 'payer plusieurs tranches', 'paie plus', 'mensualite', 'allocation'],
    chemin: ['Paiements', 'Enregistrer un paiement', 'Répartition automatique du paiement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
    etapes: ['Choisissez l’élève dans le formulaire de paiement.', 'Saisissez le montant : le tableau « Répartition automatique du paiement » indique le montant imputé sur chaque tranche et le reste après paiement.', 'Après l’enregistrement, la même répartition figure sur le reçu et dans la colonne « Imputé sur » du journal.'],
    prerequis: [{ check: 'echeances', obligatoire: true, texte: 'L’élève doit avoir un échéancier.', aide: 'inscrire-eleve' }],
    resultat: 'Dans l’échéancier, la tranche « en cours » est la première non soldée ; les montants déjà payés sur les tranches suivantes apparaissent comme « payés d’avance ».',
    erreurs: [{ probleme: 'Je veux payer la 3e tranche avant la 2e.', solution: 'Ce n’est pas possible : l’ordre des tranches est toujours respecté pour garantir une comptabilité cohérente.' }]
  },
  {
    id: 'imprimer-recu', categorie: 'paiements', titre: 'Imprimer ou réimprimer un reçu de paiement',
    description: 'Le reçu (2 exemplaires par page A4) présente le numéro, la date, l’élève (matricule et classe en gras), le montant en chiffres et en lettres, le moyen et la modalité de paiement, la période concernée, une barre de progression (mois ou tranches réglés, en cours, restants) et le total, le cumul payé et le reste à payer. Seuls les paiements validés sont comptés.',
    motsCles: ['recu', 'reçu', 'imprimer recu', 'reimprimer', 'quittance', 'justificatif paiement'],
    chemin: ['Paiements', 'Journal des paiements', 'Reçu'], page: 'paiements', focus: '#paiements [data-payment-search]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Encaissements ».', 'Retrouvez le paiement avec la recherche du journal (élève, n° de reçu, référence…).', 'Cliquez sur « Reçu » : un aperçu s’affiche à l’écran.', 'Cliquez sur « Imprimer (2 exemplaires) », puis imprimez ou enregistrez en PDF.'],
    prerequis: [{ check: 'paiement', obligatoire: true, texte: 'Le paiement doit exister et ne pas être annulé.', aide: 'enregistrer-paiement' }],
    resultat: 'Un reçu d’une page A4 (deux exemplaires à découper). Si un paiement antérieur est annulé, la réimpression recalcule la progression sans lui.',
    erreurs: [{ probleme: 'Pas de bouton « Reçu ».', solution: 'Un paiement annulé n’a plus de reçu imprimable ; son historique reste consultable avec « Consulter ».' }]
  },
  {
    id: 'annuler-paiement', categorie: 'paiements', titre: 'Annuler un paiement',
    description: 'Annule un paiement erroné. La ligne, son numéro de reçu et sa répartition restent dans l’historique avec le motif ; les tranches concernées sont recalculées.',
    motsCles: ['annuler paiement', 'supprimer paiement', 'erreur paiement', 'rembourser', 'corriger paiement', 'annulation'],
    chemin: ['Paiements', 'Journal des paiements', 'Annuler'], page: 'paiements', focus: '#paiements [data-payment-search]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur (le bouton n’est pas affiché aux autres rôles).',
    etapes: ['Ouvrez « Paiements › Encaissements » et retrouvez le paiement dans le journal.', 'Cliquez sur « Annuler ».', 'Saisissez le motif (obligatoire) puis confirmez.', 'Si besoin, enregistrez ensuite le paiement correct.'],
    prerequis: [{ check: 'paiement', obligatoire: true, texte: 'Le paiement doit exister.', aide: 'enregistrer-paiement' }],
    resultat: 'Le paiement est marqué « Annulé », il n’entre plus dans les totaux, et le solde de l’élève est recalculé.',
    erreurs: [{ probleme: '« Annulation impossible : motif manquant ou paiement déjà annulé ».', solution: 'Saisissez un motif ; un paiement ne peut être annulé qu’une fois.' }]
  },
  {
    id: 'exporter-paiements', categorie: 'paiements', titre: 'Exporter la liste des paiements',
    description: 'Télécharge au format CSV les paiements filtrés dans le journal (recherche, dates, état).',
    motsCles: ['exporter paiements', 'liste paiements', 'csv paiements', 'journal des paiements'],
    chemin: ['Paiements', 'Exporter la liste des paiements CSV'], page: 'paiements', focus: '#paiements [data-action="paiement:export-csv"]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Encaissements ».', 'Filtrez le journal si besoin (recherche, Du, Au, État).', 'Cliquez sur « Exporter la liste des paiements CSV ».'],
    prerequis: [],
    resultat: 'Le fichier liste-paiements.csv est téléchargé avec les filtres appliqués.',
    erreurs: []
  },

  // ── Dépenses et trésorerie ──────────────────────────────────────────────
  {
    id: 'enregistrer-depense', categorie: 'depenses', titre: 'Enregistrer une dépense',
    description: 'Saisit une sortie de caisse (catégorie, description, montant, date, bénéficiaire, demandeur, référence, pièce justificative) et génère un reçu de dépense numéroté DEP-AAAA-NNNNNN.',
    motsCles: ['depense', 'sortie', 'achat', 'decaissement', 'charge', 'fournisseur', 'facture', 'salaire', 'payer un fournisseur'],
    chemin: ['Dépenses', 'Enregistrer une dépense'], page: 'depenses', focus: '#depenses form[data-form="depense"]', roles: WRITE,
    etapes: ['Ouvrez « Dépenses ».', 'Choisissez l’année et la date, puis la catégorie (ou saisissez-en une nouvelle).', 'Saisissez le montant, la description et la personne qui a demandé la dépense ; complétez le bénéficiaire, la référence et la pièce justificative si besoin (300 Ko max.).', 'Cliquez sur « Enregistrer la dépense » : le reçu s’imprime si la case est cochée.'],
    prerequis: [{ check: 'anneeOuverte', obligatoire: true, texte: 'L’année de la dépense ne doit pas être clôturée.', aide: 'annee-active' }],
    resultat: 'La dépense apparaît dans l’historique et le solde disponible diminue d’autant.',
    erreurs: [
      { probleme: '« Indiquez qui a demandé la dépense ».', solution: 'Le champ « Demandé par » est obligatoire pour la traçabilité.' },
      { probleme: '« Pièce trop lourde ».', solution: 'Réduisez l’image (photo plus petite) ou conservez la pièce papier et notez sa référence.' }
    ]
  },
  {
    id: 'corriger-depense', categorie: 'depenses', titre: 'Corriger ou annuler une dépense',
    description: 'Une correction conserve l’ancienne valeur dans l’historique de la dépense ; une annulation garde la ligne et son numéro, mais l’exclut des totaux.',
    motsCles: ['corriger depense', 'modifier depense', 'annuler depense', 'erreur depense', 'supprimer depense'],
    chemin: ['Dépenses', 'Historique des dépenses', 'Corriger / Annuler'], page: 'depenses', focus: '#depenses [data-df="yearId"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Dépenses » et retrouvez la ligne (filtres année, période, catégorie, demandeur).', 'Cliquez sur « Corriger » : le formulaire se remplit, modifiez puis « Enregistrer la correction ».', 'Ou cliquez sur « Annuler » et saisissez le motif.'],
    prerequis: [{ check: 'depense', obligatoire: true, texte: 'La dépense doit exister.', aide: 'enregistrer-depense' }],
    resultat: 'Le solde de caisse est recalculé ; l’historique garde la trace de la correction ou de l’annulation.',
    erreurs: []
  },
  {
    id: 'solde-caisse', categorie: 'depenses', titre: 'Connaître le solde disponible de la caisse',
    description: 'Solde disponible = solde d’ouverture + recettes encaissées − dépenses enregistrées. Les recettes ne sont jamais comptées comme des dépenses ; les opérations annulées sont exclues.',
    motsCles: ['solde', 'caisse', 'tresorerie', 'argent disponible', 'balance', 'combien en caisse', 'recettes moins depenses', 'solde ouverture'],
    chemin: ['Dépenses', 'Historique des dépenses'], page: 'depenses', focus: '#depense-output', roles: WRITE,
    etapes: ['Ouvrez « Dépenses » : les 4 indicateurs en tête de l’historique donnent recettes, dépenses, solde d’ouverture et solde disponible.', 'Filtrez par année et par période (Du / Au) : le solde d’ouverture inclut alors les mouvements antérieurs.', 'Le tableau de bord affiche aussi le solde de l’année sélectionnée.'],
    prerequis: [{ check: 'soldeOuverture', obligatoire: false, texte: 'Renseignez le solde d’ouverture de l’année si la caisse n’était pas vide au départ.', aide: 'creer-annee' }],
    resultat: 'Le solde disponible théorique de la caisse sur la période choisie.',
    erreurs: [{ probleme: 'Le solde est négatif.', solution: 'Des dépenses dépassent les encaissements : vérifiez le solde d’ouverture et les dépenses de la période.' }]
  },

  // ── Rapports ────────────────────────────────────────────────────────────
  {
    id: 'rapports-export', categorie: 'rapports', titre: 'Générer un rapport et l’exporter en PDF ou Excel',
    description: 'Rapports financiers (journalier, hebdomadaire, mensuel, annuel) avec statistiques de la période : nombre et moyenne des paiements, élèves payeurs, moyens de paiement, nature (frais, scolarité, dettes), modalités et meilleures journées. Recettes et dépenses, analyse par classe et situation individuelle complètent l’ensemble, avec export PDF, Excel et CSV.',
    motsCles: ['rapport', 'statistique', 'statistiques des paiements', 'export', 'pdf', 'excel', 'imprimer rapport', 'bilan', 'annuel', 'hebdomadaire', 'journalier', 'periodicite'],
    chemin: ['Rapports'], page: 'rapports', focus: '#rapports .report-tabs', roles: ALL,
    etapes: ['Ouvrez « Rapports ».', 'Choisissez un onglet (Journalier · Hebdo · Mensuel · Annuel, Recettes et dépenses, Analyse par classe, Situation individuelle…) et la « Périodicité ».', 'Réglez les filtres : année, catégorie, classe, élève, période.', 'Cliquez sur « PDF / Imprimer », « Excel » ou « CSV ».'],
    prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Les rapports d’encaissement sont vides tant qu’aucun paiement n’est enregistré.', aide: 'enregistrer-paiement' }],
    resultat: 'Un document avec l’en-tête de l’établissement, les totaux et les signatures.',
    erreurs: [{ probleme: 'Le rapport est vide.', solution: 'Élargissez la période (Du / Au) ou choisissez « Toutes » dans l’année scolaire.' }]
  },
  {
    id: 'rapport-depenses', categorie: 'rapports', titre: 'Rapport des dépenses et flux de trésorerie',
    description: 'L’onglet « Aperçu des dépenses » regroupe les dépenses par catégorie, par demandeur et en historique ; « Flux de trésorerie » donne recettes, dépenses et solde cumulé par mois ou par année.',
    motsCles: ['rapport depenses', 'apercu des depenses', 'flux de tresorerie', 'cash flow', 'depenses par categorie', 'depenses par demandeur'],
    chemin: ['Rapports', 'Aperçu des dépenses'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="depenses"]', roles: ALL,
    etapes: ['Ouvrez « Rapports » puis l’onglet « Aperçu des dépenses » ou « Flux de trésorerie ».', 'Filtrez par année, période, catégorie de dépense ou demandeur.', 'Exportez en PDF ou en Excel.'],
    prerequis: [{ check: 'depense', obligatoire: false, texte: 'Sans dépense enregistrée, seules les recettes apparaissent.', aide: 'enregistrer-depense' }],
    resultat: 'Les totaux de recettes, de dépenses et le solde disponible de la période.',
    erreurs: [{ probleme: 'Le filtre « Classe » ne change rien.', solution: 'La caisse n’est pas découpée par classe : ce filtre ne s’applique qu’aux rapports d’élèves.' }]
  },
  {
    id: 'retards-rappels', categorie: 'rapports', titre: 'Suivre les retards et imprimer des fiches de rappel',
    description: 'Liste les échéances dépassées avec les jours de retard, et imprime des fiches de rappel (4 par page A4). Une fiche est générée 14 jours avant la date limite d’une tranche (ou des frais d’inscription) et 7 jours avant l’échéance d’une mensualité, selon les dates configurées ; elle reste due tant que l’échéance n’est pas réglée.',
    motsCles: ['retard', 'impaye', 'relance', 'rappel', 'fiche de rappel', 'debiteur', 'qui n a pas paye', 'echeance depassee', 'avant la date limite'],
    chemin: ['Rapports', 'Retards de paiement / Fiches de rappel'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="retards"]', roles: ALL,
    etapes: ['Ouvrez « Rapports » puis l’onglet « Retards de paiement ».', 'Filtrez par classe ou par élève si besoin.', 'Pour les familles, passez à l’onglet « Fiches de rappel », choisissez au besoin la « Date de référence », puis cliquez sur « Imprimer les fiches (4 par page) ».'],
    prerequis: [{ check: 'echeances', obligatoire: true, texte: 'Les retards se calculent sur les échéanciers des élèves inscrits.', aide: 'inscrire-eleve' }],
    resultat: 'La liste des élèves en retard et des fiches prêtes à distribuer.',
    erreurs: [{ probleme: '« Aucune fiche à imprimer ».', solution: 'Aucun élève de la sélection n’a de solde à régler.' }]
  },
  {
    id: 'statut-tranches', categorie: 'rapports', titre: 'Voir le statut des tranches et mensualités',
    description: 'Pour chaque tranche ou mensualité : nombre d’échéances soldées, partielles, impayées ou en retard, reste dû, et ponctualité des paiements.',
    motsCles: ['statut tranches', 'mensualites', 'echeances', 'ponctualite', 'tranche payee', 'suivi des echeances'],
    chemin: ['Rapports', 'Tranches et mensualités'], page: 'rapports', focus: '#rapports .report-tabs', clic: '[data-report-type="echeances"]', roles: ALL,
    etapes: ['Ouvrez « Rapports » puis l’onglet « Tranches et mensualités ».', 'Choisissez l’année et, si besoin, la classe.'],
    prerequis: [{ check: 'echeances', obligatoire: true, texte: 'Des élèves doivent avoir un échéancier.', aide: 'inscrire-eleve' }],
    resultat: 'Deux tableaux : statut par tranche et ponctualité des paiements.',
    erreurs: []
  },

  // ── Établissement et sauvegardes ────────────────────────────────────────
  {
    id: 'configurer-etablissement', categorie: 'etablissement', titre: 'Configurer l’établissement, l’en-tête et le caissier',
    description: 'Nom, sigle, devise, coordonnées, en-tête officiel (tutelle, slogan), logo, symbole national et nom du caissier affiché sur tous les reçus.',
    motsCles: ['parametre', 'configuration', 'etablissement', 'ecole', 'logo', 'en tete', 'caissier', 'devise', 'adresse', 'nom de l ecole'],
    chemin: ['Configuration', 'Établissement'], page: 'config', focus: '#config form[data-form="config"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Administration › Configuration ».', 'Complétez les champs de l’établissement, dont « Nom du caissier ».', 'Ajoutez le logo ou le symbole national (600 Ko max.).', 'Cliquez sur « Enregistrer ».'],
    prerequis: [],
    resultat: 'Les reçus et rapports utilisent immédiatement ces informations.',
    erreurs: [{ probleme: '« Image trop lourde ».', solution: 'Utilisez une image de moins de 600 Ko.' }]
  },
  {
    id: 'sauvegarder-donnees', categorie: 'etablissement', titre: 'Sauvegarder, exporter ou importer les données',
    description: 'Les données sont stockées dans le navigateur. Vous pouvez activer une sauvegarde automatique dans un fichier (Chrome / Edge), exporter les données (JSON) ou une note lisible (TXT), et réimporter un fichier.',
    motsCles: ['sauvegarde', 'backup', 'exporter', 'importer', 'json', 'restaurer donnees', 'copie', 'fichier'],
    chemin: ['Configuration', 'Sauvegarde'], page: 'config', focus: '#config [data-action="backup:choose"]', roles: ADMIN,
    autorisation: 'Page réservée à l’administrateur. « Exporter JSON » (menu latéral) est aussi disponible pour le comptable ; « Importer JSON » est réservé à l’administrateur, avec son mot de passe.',
    etapes: ['Ouvrez « Administration › Configuration » › « Sauvegarde ».', 'Cliquez sur « Activer la sauvegarde automatique dans un fichier » et choisissez l’emplacement.', 'Pour une copie ponctuelle : « Exporter les données (JSON) » ou « Exporter une note lisible (TXT) ».', 'Pour importer : « Importer JSON » dans le menu latéral ; une copie de sécurité est créée avant le remplacement.'],
    prerequis: [],
    resultat: 'Une copie de vos données hors du navigateur.',
    erreurs: [{ probleme: 'Le bouton de sauvegarde automatique est grisé.', solution: 'Votre navigateur ne le permet pas : utilisez Chrome ou Edge, ou l’export manuel.' }]
  },
  {
    id: 'copies-securite', categorie: 'etablissement', titre: 'Restaurer une copie de sécurité',
    description: 'Une copie de sécurité est créée automatiquement avant chaque réinitialisation, import ou restauration. Elle peut être téléchargée ou restaurée ; sa suppression exige le mot de passe administrateur.',
    motsCles: ['copie de securite', 'restaurer', 'restauration', 'revenir en arriere', 'recuperer donnees', 'donnees perdues'],
    chemin: ['Configuration', 'Copies de sécurité'], page: 'config', focus: '#config .danger-zone', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur, avec ressaisie du mot de passe.',
    etapes: ['Ouvrez « Administration › Configuration » › « Copies de sécurité ».', 'Cliquez sur « Restaurer » sur la copie voulue et saisissez votre mot de passe.', 'Les données actuelles sont elles-mêmes sauvegardées avant la restauration.'],
    prerequis: [],
    resultat: 'Les données reviennent à l’état de la copie choisie.',
    erreurs: [{ probleme: '« Aucune copie de sécurité ».', solution: 'Aucune opération destructrice n’a encore eu lieu : utilisez l’export JSON pour vos sauvegardes régulières.' }]
  },
  {
    id: 'reinitialiser', categorie: 'etablissement', titre: 'Réinitialiser les données',
    description: 'Efface élèves, classes, frais, inscriptions, paiements, dépenses et journal. L’établissement, les années scolaires et les comptes utilisateurs sont conservés.',
    motsCles: ['reinitialiser', 'remise a zero', 'effacer', 'tout supprimer', 'reset', 'vider'],
    chemin: ['Configuration', 'Zone dangereuse — réinitialisation'], page: 'config', focus: '#config [data-action="admin:reset"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur : mot de passe et saisie du mot RÉINITIALISER obligatoires.',
    etapes: ['Ouvrez « Administration › Configuration » › « Zone dangereuse ».', 'Cliquez sur « Réinitialiser les données… ».', 'Saisissez votre mot de passe et tapez RÉINITIALISER.', 'Une copie de sécurité est créée et téléchargée avant l’effacement.'],
    prerequis: [],
    resultat: 'Une application vide, prête pour une nouvelle saisie ; la copie de sécurité reste restaurable.',
    erreurs: [{ probleme: '« Copie de sécurité impossible : réinitialisation annulée ».', solution: 'Le stockage du navigateur est plein : exportez puis supprimez d’anciennes copies avant de recommencer.' }]
  },

  // ── Utilisateurs et sécurité ────────────────────────────────────────────
  {
    id: 'gerer-utilisateurs', categorie: 'securite', titre: 'Créer un utilisateur et attribuer un rôle',
    description: 'Trois rôles : Administrateur (tout), Comptable / Caissier (saisie, sans suppression ni configuration) et Consultation (tableau de bord, analyse, rapports, aide).',
    motsCles: ['utilisateur', 'compte', 'role', 'droit', 'permission', 'acces', 'caissier', 'comptable', 'creer compte', 'ajouter utilisateur'],
    chemin: ['Configuration', 'Utilisateurs et rôles'], page: 'config', focus: '#config form[data-form="utilisateur"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Administration › Configuration » › « Utilisateurs et rôles ».', 'Saisissez l’identifiant, le nom complet, le rôle et un mot de passe (8 caractères, une lettre et un chiffre).', 'Cliquez sur « Créer l’utilisateur ».', 'Pour retirer un accès, utilisez « Désactiver » (l’historique de l’utilisateur est conservé).'],
    prerequis: [],
    resultat: 'Le nouvel utilisateur peut se connecter avec ses identifiants.',
    erreurs: [
      { probleme: '« Cet identifiant existe déjà ».', solution: 'Choisissez un autre identifiant.' },
      { probleme: '« Il doit rester au moins un administrateur actif ».', solution: 'Créez ou activez un autre administrateur avant de désactiver celui-ci.' }
    ]
  },
  {
    id: 'mot-de-passe', categorie: 'securite', titre: 'Changer un mot de passe',
    description: 'L’administrateur change le mot de passe de n’importe quel compte, y compris le sien. Les autres utilisateurs doivent s’adresser à l’administrateur.',
    motsCles: ['mot de passe', 'oublie', 'changer mot de passe', 'password', 'perdu', 'reinitialiser mot de passe'],
    chemin: ['Configuration', 'Utilisateurs et rôles', 'Mot de passe'], page: 'config', focus: '#config form[data-form="utilisateur"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur, qui confirme avec son propre mot de passe.',
    etapes: ['Ouvrez « Administration › Configuration » › « Utilisateurs et rôles ».', 'Cliquez sur « Mot de passe » sur la ligne du compte.', 'Saisissez le nouveau mot de passe puis confirmez avec votre mot de passe administrateur.'],
    prerequis: [],
    resultat: 'L’utilisateur se connecte désormais avec le nouveau mot de passe.',
    erreurs: [{ probleme: '« Trop de tentatives. Réessayez dans … s. »', solution: 'Après 5 échecs, la connexion est bloquée une minute.' }]
  },
  {
    id: 'connexion', categorie: 'securite', titre: 'Se connecter et se déconnecter',
    description: 'Chaque utilisateur se connecte avec son identifiant. Au tout premier lancement, l’application demande de créer le compte administrateur (il n’existe pas de mot de passe par défaut).',
    motsCles: ['connexion', 'se connecter', 'deconnexion', 'se deconnecter', 'login', 'premier lancement', 'compte administrateur'],
    chemin: ['Menu latéral', 'Se déconnecter'], page: null, focus: null, roles: ALL,
    etapes: ['Saisissez votre identifiant et votre mot de passe sur l’écran de connexion.', 'Votre nom et votre rôle s’affichent en bas du menu latéral.', 'Une actualisation de la page vous garde connecté, sur la même page et avec vos filtres, tant que la session est valide.', 'La session se ferme à la fermeture de l’onglet, après 2 heures d’inactivité ou au bout de 12 heures.', 'Cliquez sur « Se déconnecter » en fin de session, surtout sur un poste partagé.'],
    prerequis: [],
    resultat: 'Vous accédez uniquement aux pages autorisées pour votre rôle.',
    erreurs: [
      { probleme: '« Ce compte est désactivé ».', solution: 'Demandez à un administrateur de le réactiver.' },
      { probleme: '« Session expirée : veuillez vous reconnecter ».', solution: 'Reconnectez-vous : vous retrouvez la page sur laquelle vous étiez.' }
    ]
  },
  {
    id: 'modalite-reglement', categorie: 'paiements', titre: 'Choisir le paiement mensuel ou par tranches',
    description: 'La modalité de règlement (mensuelle ou par tranches) se choisit au premier paiement de l’élève pour l’année, puis reste modifiable en cours d’année, dans les deux sens. Lors d’un changement, l’échéancier est recalculé et les paiements déjà validés sont réimputés : rien n’est supprimé ni compté deux fois.',
    motsCles: ['paiement mensuel', 'payer par mois', 'mensuel', 'mensualite', 'par tranches', 'modalite', 'mode de paiement', 'changer de modalite', 'changer de mode', 'basculer en mensuel', 'modalite en cours d annee'],
    chemin: ['Paiements', 'Enregistrer un paiement', 'Modalité de règlement'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
    autorisation: 'Administrateur ou comptable. Le changement est confirmé et inscrit au journal ; l’ancienne répartition de chaque paiement est conservée dans son historique.',
    etapes: ['Ouvrez « Paiements › Encaissements » et sélectionnez l’élève.', 'Dans « Modalité de règlement », choisissez « Paiement par tranches » ou « Paiement mensuel » ; l’échéancier affiché s’adapte immédiatement.', 'Pour un changement en cours d’année, lisez l’avertissement : les montants déjà payés sont réimputés sur le nouvel échéancier.', 'Enregistrez un paiement (le changement s’applique avec lui) ou cliquez sur « Appliquer sans encaisser ».'],
    prerequis: [
      { check: 'payable', obligatoire: true, texte: 'L’élève doit être inscrit dans une classe dont le tarif est configuré.', aide: 'inscrire-eleve' },
      { check: 'mensuel', obligatoire: false, texte: 'Le paiement mensuel n’est proposé que si le tarif de la classe a un montant mensuel.', aide: 'configurer-frais' }
    ],
    resultat: 'Mensuel : une échéance par mois au montant mensuel du tarif. Tranches : les tranches et dates limites du tarif. Les frais d’inscription restent inchangés et les soldes sont recalculés automatiquement.',
    erreurs: [
      { probleme: 'L’option « Paiement mensuel » est grisée.', solution: 'Le tarif de la classe n’a pas de montant mensuel : complétez-le dans « Scolarité › Tarifs et frais ».' },
      { probleme: '« Changement impossible : … déjà payés dépassent le total de la nouvelle modalité ».', solution: 'L’élève a déjà payé plus que le total de l’autre modalité : le changement ne peut pas répartir ce montant, il est refusé sans rien modifier.' }
    ]
  },
  {
    id: 'facture-scolarite', categorie: 'paiements', titre: 'Imprimer la facture de scolarité d’un élève',
    description: 'Document récapitulatif calculé automatiquement : élève, modalité, échéancier (dû, payé, reste, statut), paiements validés, progression et reste à payer.',
    motsCles: ['facture', 'releve', 'relevé de compte', 'situation de compte', 'etat de compte', 'facturation'],
    chemin: ['Paiements', 'Fiche de l’élève', 'Imprimer la facture'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Encaissements » et sélectionnez l’élève : cliquez sur « Imprimer la facture » au-dessus de l’échéancier.', 'Ou, dans « Élèves › Dossiers élèves », ouvrez la fiche avec « Consulter » et cliquez sur « Facture » pour l’année voulue.'],
    prerequis: [{ check: 'echeances', obligatoire: true, texte: 'L’inscription doit avoir un échéancier (frais configurés).', aide: 'configurer-frais' }],
    resultat: 'Une facture A4 numérotée FAC-année-n°, toujours à jour : elle exclut les paiements annulés.',
    erreurs: []
  }
];

// Fonctionnalités souvent recherchées mais ABSENTES de cette application : on le dit clairement plutôt que
// de proposer un lien fictif. `alternative` oriente vers ce qui existe réellement.
export const UNAVAILABLE = [
  { id: 'matieres', label: 'Matières', motsCles: ['matiere', 'matieres', 'discipline', 'programme scolaire'], alternative: null },
  { id: 'enseignants', label: 'Enseignants et affectations', motsCles: ['enseignant', 'enseignants', 'professeur', 'prof', 'instituteur', 'maitre', 'affecter un enseignant', 'personnel enseignant'], alternative: null },
  { id: 'emploi-du-temps', label: 'Emploi du temps', motsCles: ['emploi du temps', 'horaire', 'planning', 'creneau', 'seance'], alternative: null },
  { id: 'notes', label: 'Évaluations et notes', motsCles: ['note', 'notes', 'evaluation', 'devoir', 'composition', 'examen note', 'interrogation'], alternative: null },
  { id: 'moyennes', label: 'Moyennes et bulletins', motsCles: ['moyenne', 'moyennes', 'bulletin', 'bulletins', 'classement eleves', 'rang', 'trimestre', 'semestre', 'appreciation'], alternative: 'fiche-eleve' },
  { id: 'absences', label: 'Absences et présences', motsCles: ['absence', 'absences', 'presence', 'appel', 'retard eleve en classe'], alternative: null }
];

HELP_TOPICS.push(
  {
    id: 'frais-inscription', categorie: 'eleves', titre: 'Configurer les frais d’inscription et de réinscription',
    description: 'Chaque année scolaire a son montant d’inscription (nouvel élève) et son montant de réinscription. Il est ajouté une seule fois à l’échéancier de l’élève, lors de son inscription ou de sa réinscription de l’année, et réglé en priorité par le premier paiement.',
    motsCles: ['frais d inscription', 'frais de reinscription', 'droit d inscription', 'inscription payante', 'reinscription', 'montant inscription'],
    chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees [name="fraisInscription"]', roles: WRITE,
    autorisation: 'Création d’une année : administrateur ou comptable. Modification d’une année existante : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Scolarité › Années scolaires ».', 'Renseignez « Frais d’inscription (nouvel élève) » et « Frais de réinscription » (ou cliquez sur « Modifier » pour une année existante).', 'Enregistrez : les inscriptions suivantes de cette année reçoivent automatiquement le bon montant.'],
    prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année scolaire doit exister.', aide: 'creer-annee' }],
    resultat: 'Une échéance « Frais d’inscription » ou « Frais de réinscription » apparaît en tête de l’échéancier de chaque nouvel inscrit, une seule fois. Elle est conservée si la modalité change.',
    erreurs: [{ probleme: 'Un élève déjà inscrit n’a pas les frais.', solution: 'Les frais s’appliquent aux inscriptions faites après leur configuration : un montant déjà enregistré n’est jamais modifié ni ajouté rétroactivement.' }]
  },
  {
    id: 'dettes-anterieures', categorie: 'paiements', titre: 'Suivre et encaisser les dettes des années précédentes',
    description: 'Le solde impayé d’une année est reporté automatiquement quand l’élève est inscrit dans une année suivante ou que l’année est clôturée. Pour chaque dette : montant reporté, remboursé et reste dû, avec l’historique de chaque règlement.',
    motsCles: ['dette', 'dettes', 'reliquat', 'arriere', 'annee precedente', 'ancienne annee', 'solde reporte', 'report', 'impaye annee derniere', 'recouvrement'],
    chemin: ['Dettes antérieures'], page: 'dettes', focus: '#dettes [data-dettes="search"]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Dettes antérieures » pour voir toutes les dettes (filtres : recherche, statut).', 'Cliquez sur « Encaisser » : le formulaire de paiement s’ouvre sur la dette de l’élève.', 'Ou, dans « Paiements › Encaissements », sélectionnez l’élève : ses dettes s’affichent avec un bouton « Régler cette dette ».', 'Saisissez le montant et enregistrez ; « Historique » liste tous les règlements.'],
    prerequis: [],
    resultat: 'Le reste dû diminue, l’année d’origine est soldée d’autant, et le règlement est encaissé sur l’année en cours (trésorerie). Une dette n’est jamais comptée deux fois.',
    erreurs: [{ probleme: '« L’année … est clôturée ».', solution: 'Seul le règlement d’une dette reportée est accepté sur une année clôturée : passez par « Dettes antérieures » ou le bouton « Régler cette dette ».' }]
  }
);

export const FAQ_IDS = ['inscrire-eleve', 'enregistrer-paiement', 'modalite-reglement', 'dettes-anterieures', 'repartition-tranches', 'enregistrer-depense', 'solde-caisse', 'retards-rappels'];

export const SUGGESTED_QUESTIONS = [
  'Comment inscrire un élève ?',
  'Comment enregistrer un paiement ?',
  'Que se passe-t-il si un parent paie plus que la tranche ?',
  'Comment enregistrer une dépense ?',
  'Combien reste-t-il en caisse ?',
  'Où ajouter une classe ?'
];

// Chemin d'accès exact : onglet principal › sous-onglet (source unique : navigation.js), puis l'élément de la page
HELP_TOPICS.forEach((topic) => {
  if (topic.page) topic.chemin = [...pagePath(topic.page), ...topic.chemin.slice(1)];
});
