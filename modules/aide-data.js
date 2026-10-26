import { pagePath, NAV_GROUPS } from './navigation.js';

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
  personnel: { label: 'Au moins un employé actif est enregistré', test: (s) => (s.personnel || []).some((e) => e.statut === 'actif') },
  enseignant: { label: 'Au moins un enseignant actif est enregistré', test: (s) => (s.personnel || []).some((e) => e.statut === 'actif' && (s.typesEmploye || []).find((t) => t.id === e.typeEmployeId)?.enseignant) },
  paieValidee: { label: 'Au moins une paie validée ou payée', test: (s) => (s.paies || []).some((p) => p.statut === 'validee' || p.statut === 'payee') },
  paiement: { label: 'Au moins un paiement valide enregistré', test: (s) => s.paiements.some((p) => !p.annule) },
  depense: { label: 'Au moins une dépense enregistrée', test: (s) => (s.depenses || []).some((d) => !d.annule) },
  caissier: { label: 'Le nom du caissier est renseigné dans Paramètres › Établissement', test: (s) => Boolean(String(s.config.caissier || '').trim()) },
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
  { id: 'paie', label: 'Paie du personnel', icon: '👥', description: 'Personnel, affectations, paie, avances, bulletins.' },
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
    motsCles: ['annee scolaire', 'nouvelle annee', 'rentree', 'parametre', 'configurer annee', 'solde ouverture', 'reconduire', 'reconduction', 'reprendre les classes', 'copier annee', 'annee suivante'],
    chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees form[data-form="annee"]', roles: WRITE,
    autorisation: 'Créer : administrateur ou comptable. Modifier une année existante : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Tarifs et scolarité › Années scolaires ».', 'Saisissez le libellé (ex. 2026-2027), la date de rentrée et la date de fin.', 'Indiquez le solde d’ouverture de caisse (0 si aucun), puis les frais d’inscription et de réinscription de l’année.', 'Dans « Reconduire les paramètres d’une année précédente », choisissez l’année source et cochez ce qui doit être repris : classes, programmes et coefficients, frais de scolarité (dates recalculées), affectations des enseignants.', 'Choisissez le statut (Préparation, Ouverte ou Clôturée) puis cliquez sur « Ajouter ». Le bouton « Reconduire… » d’une année existante fait la même opération plus tard (rien n’est dupliqué).'],
    prerequis: [],
    resultat: 'L’année apparaît dans la liste avec ses classes, programmes et frais reconduits. Inscriptions, paiements, dépenses, dettes et paies ne sont jamais recopiés : chaque année garde ses propres opérations et l’année source n’est pas modifiée.',
    erreurs: [
      { probleme: '« Année refusée : libellé vide ou déjà existant ».', solution: 'Chaque libellé doit être unique : vérifiez qu’elle n’existe pas déjà dans la liste.' },
      { probleme: '« La date de fin doit suivre la date de rentrée ».', solution: 'Corrigez les dates : la fin doit être postérieure à la rentrée.' }
    ]
  },
  {
    id: 'annee-active', categorie: 'annees', titre: 'Changer, ouvrir ou clôturer l’année active',
    description: 'Toutes les pages affichent les données de l’année active (classes, tarifs, élèves inscrits, inscriptions, paiements, dépenses, tableaux de bord, analyses, rapports, paie). Dès qu’une autre année est activée, les données affichées changent automatiquement. Une année clôturée n’accepte plus de paiement ni de dépense.',
    motsCles: ['annee active', 'changer annee', 'changer d annee', 'annee affichee', 'donnees de l annee', 'autre annee', 'annee en cours', 'cloturer', 'cloture', 'fermer annee', 'ouvrir annee', 'passer a l annee suivante'],
    chemin: ['Années', 'Liste des années'], page: 'annees', focus: '#annees .cards-grid', roles: WRITE,
    autorisation: '« Définir active » et « Valider (ouvrir) » : administrateur ou comptable. « Clôturer » et « Supprimer » : autorisation d’un administrateur.',
    etapes: ['Le plus rapide : choisissez l’année dans le sélecteur « Année scolaire » en haut de chaque page.', 'Ou ouvrez « Tarifs et scolarité › Années scolaires » et cliquez sur « Définir active » sur la carte de l’année.', 'Toutes les pages basculent aussitôt sur cette année : filtres, périodes (de la rentrée à aujourd’hui) et listes.', 'Pour consulter une autre année sans changer l’année active, choisissez-la (ou « Toutes les années ») dans le filtre « Année scolaire » d’une liste.', 'Cliquez sur « Valider (ouvrir) » pour ouvrir une année, ou « Clôturer » en fin d’année.'],
    prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année doit exister.', aide: 'creer-annee' }],
    resultat: 'Les données affichées et les formulaires correspondent à l’année active ; l’année reste active après actualisation et pour toute la session.',
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
    etapes: ['Ouvrez « Tarifs et scolarité › Classes ».', 'Saisissez le nom de la classe et choisissez la catégorie.', 'Choisissez l’année scolaire et la capacité.', 'Cliquez sur « Ajouter » : vous êtes redirigé vers « Tarifs et scolarité › Tarifs et frais » avec la classe déjà sélectionnée.'],
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
    etapes: ['Ouvrez « Tarifs et scolarité › Tarifs et frais » (ou créez une classe : vous y êtes redirigé).', 'Choisissez l’année, la catégorie puis la classe.', 'Saisissez le montant annuel : les 3 tranches, leurs dates et le montant mensuel sont proposés automatiquement (tous modifiables).', 'Vérifiez le « Montant du paiement mensuel », le nombre de mensualités et la date de la 1ère mensualité (0 = paiement mensuel non proposé).', 'Contrôlez le récapitulatif sous le formulaire, puis cliquez sur « Ajouter ». Si le total mensuel s’écarte du montant annuel (au-delà de l’arrondi), une confirmation est demandée.'],
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
    etapes: ['Définissez d’abord la nouvelle année comme active (« Tarifs et scolarité › Années scolaires » › « Définir active »).', 'Ouvrez « Tarifs et scolarité › Tarifs et frais » et cliquez sur « Dupliquer » sur la carte du tarif à reprendre.'],
    prerequis: [{ check: 'tarif', obligatoire: false, texte: 'Il faut au moins un tarif existant à dupliquer.', aide: 'configurer-frais' }],
    resultat: 'Une copie du tarif est rattachée à l’année active.',
    erreurs: [{ probleme: 'La copie pointe vers une classe de l’ancienne année.', solution: 'Le tarif reprend la classe d’origine : créez la classe pour la nouvelle année puis configurez ses frais avec « Tarifs et scolarité › Tarifs et frais ».' }]
  },

  // ── Élèves et inscriptions ──────────────────────────────────────────────
  {
    id: 'ajouter-eleve', categorie: 'eleves', titre: 'Ajouter un élève',
    description: 'Crée la fiche d’un élève. Le matricule SIGLE-AAAA-NNNN (sigle de l’établissement) est généré automatiquement si vous le laissez vide. Après l’enregistrement, l’application passe à l’inscription.',
    motsCles: ['eleve', 'ajouter eleve', 'nouvel eleve', 'fiche eleve', 'matricule', 'etudiant', 'enfant', 'dossier'],
    chemin: ['Élèves', 'Fiche élève'], page: 'eleves', focus: '#eleves form[data-form="eleve"]', roles: WRITE,
    autorisation: 'Créer / modifier : administrateur ou comptable. Supprimer : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Élèves et inscriptions › Dossiers élèves » (ou cliquez sur « + Nouvel élève » en haut de page).', 'Renseignez au minimum le prénom et le nom.', 'Choisissez la classe souhaitée (facultatif mais recommandé : elle sera préremplie à l’inscription).', 'Cliquez sur « Ajouter et inscrire ».'],
    prerequis: [{ check: 'classe', obligatoire: false, texte: 'Une classe dans l’année active permet de préremplir l’inscription.', aide: 'creer-classe' }],
    resultat: 'La fiche est créée et vous arrivez sur « Élèves et inscriptions › Inscriptions » avec l’élève déjà sélectionné.',
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
    etapes: ['Ouvrez « Élèves et inscriptions › Inscriptions » (vous y arrivez automatiquement après l’ajout d’un élève).', 'Choisissez l’année, la catégorie puis la classe.', 'Tapez le nom ou le matricule de l’élève et sélectionnez-le.', 'Laissez le type sur « Automatique » : réinscription si l’élève a déjà été inscrit une autre année, sinon nouvelle inscription.', 'Cliquez sur « Ajouter l’inscription » : l’application ouvre le formulaire de paiement prérempli.'],
    prerequis: [
      { check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' },
      { check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' },
      { check: 'tarif', obligatoire: false, texte: 'Avec des frais déjà configurés, l’application enchaîne directement sur le paiement. Sinon, configurez-les ensuite : l’échéancier des élèves inscrits est alors créé automatiquement.', aide: 'configurer-frais' }
    ],
    resultat: 'L’inscription apparaît dans l’historique avec un échéancier provisoire par tranches, et le formulaire de paiement s’ouvre avec l’élève sélectionné. La modalité (tranches ou mensuel) se choisit au premier paiement.',
    erreurs: [
      { probleme: '« Inscription refusée : cet élève est déjà inscrit pour cette année ».', solution: 'Un élève n’a qu’une inscription par année ; consultez sa fiche dans « Élèves et inscriptions › Dossiers élèves ».' },
      { probleme: '« Aucun frais configuré pour cette classe ».', solution: 'Vous êtes redirigé vers « Tarifs et scolarité › Tarifs et frais » : configurez les frais de la classe.' }
    ]
  },
  {
    id: 'reinscrire-valider', categorie: 'eleves', titre: 'Décisions de passage et réinscription des élèves admis',
    description: 'Procédure de fin d’année en 4 étapes : années et contrôles, décisions du conseil de classe (admis, redouble, non admis, départ), classes de destination proposées automatiquement (admis → niveau supérieur, redoublant → même niveau, même section si elle existe), puis validation avec récapitulatif par classe et liste imprimable des réinscrits. Aucun élève n’est réinscrit sans décision.',
    motsCles: ['reinscription', 'reinscrire', 'valider inscription', 'annee suivante', 'passage', 'admis', 'admission', 'redouble', 'redoublement', 'decision de passage', 'conseil de classe', 'liste des admis', 'inscription groupee', 'classe superieure', 'niveau superieur', 'liste des reinscrits'],
    chemin: ['Élèves', 'Inscriptions', 'Passage et réinscriptions'], page: 'inscriptions', focus: '#passage-panel', roles: WRITE,
    etapes: ['Créez la nouvelle année et reconduisez ses classes et ses frais (Scolarité › Années scolaires). Le niveau de chaque classe est reconnu dans son nom : CP1, CE2, CM2, 7e, 10e, 11e SM, Terminale SE… ou 6e, 3e, 2nde, 1ère.', 'Ouvrez « Élèves et inscriptions › Inscriptions » › « Passage en classe supérieure et réinscriptions » : choisissez l’année des élèves et l’année d’inscription ; corrigez les alertes éventuelles (classes ou frais manquants).', 'Étape 2 : saisissez la décision de chaque élève, ou filtrez une classe, cochez ses élèves et « Appliquer aux élèves cochés ».', 'Étape 3 : vérifiez la classe proposée (marquée « proposée ») et changez-la si nécessaire.', 'Étape 4 : cochez les élèves prêts, lisez le récapitulatif (effectifs, places restantes, frais de réinscription, soldes impayés) puis « Inscrire les N élèves » et confirmez. « Imprimer la liste des réinscrits » produit la liste officielle par classe.'],
    prerequis: [{ check: 'inscription', obligatoire: true, texte: 'Une inscription précédente doit exister.', aide: 'inscrire-eleve' }],
    resultat: 'Réinscriptions créées avec les frais de réinscription et l’échéancier de la nouvelle année ; l’historique scolaire (classe d’origine, décision) et les dettes de l’année précédente sont conservés.',
    erreurs: [
      { probleme: '« Niveau non reconnu : choisissez la classe ».', solution: 'Choisissez la classe de destination dans la liste, ou renommez la classe avec son niveau (ex. « CM2 A », « 8e B »).' },
      { probleme: '« Aucune classe de niveau supérieur dans l’année cible ».', solution: 'Créez ou reconduisez la classe du niveau suivant dans la nouvelle année.' },
      { probleme: '« Fin de scolarité (terminale) ».', solution: 'Un élève admis en terminale termine sa scolarité : il n’est pas réinscrit.' }
    ]
  },
  {
    id: 'fiche-eleve', categorie: 'eleves', titre: 'Consulter la situation financière d’un élève',
    description: 'Affiche le dossier complet d’un élève : informations, échéancier par année (dû, payé, reste, statut, progression) et historique des paiements, y compris annulés.',
    motsCles: ['situation eleve', 'dossier', 'historique eleve', 'reste a payer', 'solde eleve', 'combien doit', 'fiche', 'profil'],
    chemin: ['Élèves', 'Répertoire des élèves', 'Consulter'], page: 'eleves', focus: '#eleves [data-student-search]', roles: WRITE,
    etapes: ['Ouvrez « Élèves et inscriptions › Dossiers élèves ».', 'Tapez le nom, le matricule ou le téléphone dans « Recherche avancée ».', 'Cliquez sur « Consulter » sur la ligne de l’élève.'],
    prerequis: [{ check: 'eleve', obligatoire: true, texte: 'L’élève doit avoir une fiche.', aide: 'ajouter-eleve' }],
    resultat: 'Une fenêtre présente l’échéancier de chaque année avec les barres de progression et l’historique complet.',
    erreurs: [{ probleme: 'Le rôle « Consultation » n’a pas accès à la page Élèves.', solution: 'Utilisez « Rapports » › « Situation individuelle », accessible à tous les rôles.' }]
  },
  {
    id: 'exporter-eleves', categorie: 'eleves', titre: 'Exporter la liste des élèves',
    description: 'Télécharge la liste des élèves au format CSV (ouvrable dans Excel).',
    motsCles: ['liste eleves', 'exporter eleves', 'csv', 'excel eleves', 'telecharger liste'],
    chemin: ['Élèves', 'Répertoire des élèves', 'Exporter la liste'], page: 'eleves', focus: '#eleves [data-action="report:students-csv"]', roles: WRITE,
    etapes: ['Ouvrez « Élèves et inscriptions › Dossiers élèves ».', 'Cliquez sur « Exporter la liste » dans le répertoire.'],
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
    etapes: ['Ouvrez « Paiements › Encaissements » (vous y arrivez automatiquement après une inscription).', 'Vérifiez l’année scolaire puis tapez le nom ou le matricule de l’élève et choisissez-le dans la liste.', 'Choisissez la modalité de règlement : « Paiement par tranches » ou « Paiement mensuel » (obligatoire ; elle est reprise automatiquement aux paiements suivants).', 'Contrôlez la fiche affichée : classe, catégorie, échéancier adapté à la modalité, paiements précédents.', 'Saisissez le montant payé (« Solder tout » remplit le reste de l’année), le mode, la date et, si besoin, la référence et la description.', 'Lisez l’aperçu (reste après paiement, statut, répartition) puis cliquez sur « Enregistrer le paiement » : le reçu s’affiche aussitôt, prêt à être imprimé ou téléchargé en PDF.'],
    prerequis: [
      { check: 'payable', obligatoire: true, texte: 'L’élève doit être inscrit dans une classe dont les frais (tarif) sont configurés.', aide: 'inscrire-eleve' },
      { check: 'anneeOuverte', obligatoire: true, texte: 'L’année du paiement ne doit pas être clôturée.', aide: 'annee-active' },
      { check: 'caissier', obligatoire: false, texte: 'Sans nom de caissier configuré, le reçu porte le nom de l’utilisateur connecté.', aide: 'configurer-etablissement' }
    ],
    resultat: 'Le paiement apparaît dans le journal avec son numéro REC-AAAA-NNNNNN, les soldes et statuts sont mis à jour, et le reçu s’affiche automatiquement (Imprimer, Télécharger en PDF, Fermer). Aucun reçu n’est produit si l’enregistrement échoue.',
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
    etapes: ['Ouvrez « Paiements › Encaissements ».', 'Retrouvez le paiement avec la recherche du journal (élève, n° de reçu, référence…).', 'Cliquez sur « Reçu » : un aperçu s’affiche à l’écran (il s’affiche aussi automatiquement juste après chaque paiement).', 'Cliquez sur « Imprimer » (2 exemplaires par page) ou sur « Télécharger en PDF » : dans la fenêtre du navigateur, choisissez « Enregistrer au format PDF », le nom du fichier est déjà renseigné.'],
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
    etapes: ['Ouvrez « Dépenses ».', 'Choisissez l’année et la date, puis la catégorie (ou saisissez-en une nouvelle).', 'Saisissez le montant, la description et la personne qui a demandé la dépense ; complétez le bénéficiaire, la référence et la pièce justificative si besoin (300 Ko max.).', 'Choisissez le mode de paiement puis cliquez sur « Enregistrer la dépense » : le reçu de dépense s’affiche aussitôt (Imprimer, Télécharger en PDF, Fermer).'],
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
    etapes: ['Ouvrez « Rapports ».', 'Choisissez un onglet (Hebdo · Mensuel · Annuel, Recettes et dépenses, Aperçu des dépenses, Flux de trésorerie…).', 'Choisissez la « Périodicité » : Journalier (une date), Hebdomadaire (une semaine, lundi → dimanche), Mensuel (un mois, du 1er au dernier jour), Annuel (dates officielles de l’année scolaire) ou Période personnalisée.', 'Réglez les autres filtres (année, catégorie, classe, élève) puis « PDF / Imprimer », « Excel » ou « CSV ».'],
    prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Les rapports d’encaissement sont vides tant qu’aucun paiement n’est enregistré.', aide: 'enregistrer-paiement' }],
    resultat: 'Un document avec l’en-tête de l’établissement, les totaux et les signatures.',
    erreurs: [{ probleme: 'Le rapport est vide.', solution: 'Aucune opération n’a eu lieu sur cette période exacte : choisissez une autre date, semaine ou mois, ou « Toutes » dans l’année scolaire.' }]
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
    motsCles: ['retard', 'impaye', 'relance', 'relance des parents', 'relancer les parents', 'rappel', 'fiche de rappel', 'debiteur', 'qui n a pas paye', 'echeance depassee', 'avant la date limite'],
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
    chemin: ['Administration', 'Établissement'], page: 'config', focus: '#config form[data-form="config"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Paramètres › Établissement ».', 'Complétez les champs de l’établissement, dont « Nom du caissier ».', 'Ajoutez le logo ou le symbole national (600 Ko max.).', 'Cliquez sur « Enregistrer ».'],
    prerequis: [],
    resultat: 'Les reçus et rapports utilisent immédiatement ces informations.',
    erreurs: [{ probleme: '« Image trop lourde ».', solution: 'Utilisez une image de moins de 600 Ko.' }]
  },
  {
    id: 'sauvegarder-donnees', categorie: 'etablissement', titre: 'Fichier de données, sauvegardes, export et import',
    description: 'À la toute première ouverture, l’application crée le fichier « GESTSCHOOL-SCOLARITE-donnees.note » dans un dossier que vous choisissez et l’enregistre automatiquement après chaque opération. Le lien est permanent : il reste après une réinitialisation. Les sauvegardes datées sont rangées dans le sous-dossier « sauvegardes ».',
    motsCles: ['sauvegarde', 'backup', 'fichier de donnees', 'fichier note', 'note', 'dossier', 'stocker', 'enregistrement automatique', 'reconnecter', 'exporter', 'importer', 'json', 'restaurer donnees', 'copie', 'fichier'],
    chemin: ['Administration', 'Données et sauvegardes'], page: 'config-donnees', focus: '#config-donnees [data-datafile-status]', roles: ADMIN,
    autorisation: 'Page réservée à l’administrateur. « Exporter JSON » (menu latéral) suit le droit « Exporter » du rôle ; « Importer JSON » est réservé à l’administrateur, avec son mot de passe.',
    etapes: ['À la première ouverture, cliquez sur « Choisir le dossier et créer le fichier » (par exemple dans Documents) : le fichier « GESTSCHOOL-SCOLARITE-donnees.note » est créé.', 'Ensuite, rien à faire : chaque opération est enregistrée dans ce fichier (pastille « 💾 » de la barre latérale).', 'Si la pastille affiche « Fichier de données à reconnecter » (nouvelle session du navigateur), cliquez dessus et autorisez l’accès : le lien n’est jamais perdu.', 'Si le navigateur a été vidé, l’application propose de recharger les données depuis le fichier.', '« Créer une sauvegarde datée » copie les données dans le sous-dossier « sauvegardes » ; « Exporter les données (JSON) » télécharge une copie.'],
    prerequis: [],
    resultat: 'Vos données sont en permanence enregistrées dans un fichier sur le disque, avec des sauvegardes datées.',
    erreurs: [
      { probleme: 'Le bouton « Créer / lier le fichier de données » est grisé.', solution: 'Votre navigateur ne le permet pas : utilisez Google Chrome ou Microsoft Edge, ou l’export manuel.' },
      { probleme: '« Fichier de données existant » au moment de lier un dossier.', solution: 'Choisissez de charger les données du fichier ou de garder les données actuelles : dans les deux cas, rien n’est perdu (copie dans « sauvegardes »).' }
    ]
  },
  {
    id: 'copies-securite', categorie: 'etablissement', titre: 'Restaurer une copie de sécurité',
    description: 'Une copie de sécurité est créée automatiquement avant chaque réinitialisation, import ou restauration. Elle peut être téléchargée ou restaurée ; sa suppression exige le mot de passe administrateur.',
    motsCles: ['copie de securite', 'restaurer', 'restauration', 'revenir en arriere', 'recuperer donnees', 'donnees perdues'],
    chemin: ['Administration', 'Données et sauvegardes', 'Copies de sécurité'], page: 'config-donnees', focus: '#config-donnees .danger-zone', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur, avec ressaisie du mot de passe.',
    etapes: ['Ouvrez « Sauvegardes et restauration » › « Copies de sécurité ».', 'Cliquez sur « Restaurer » sur la copie voulue et saisissez votre mot de passe.', 'Les données actuelles sont elles-mêmes sauvegardées avant la restauration.'],
    prerequis: [],
    resultat: 'Les données reviennent à l’état de la copie choisie.',
    erreurs: [{ probleme: '« Aucune copie de sécurité ».', solution: 'Aucune opération destructrice n’a encore eu lieu : utilisez l’export JSON pour vos sauvegardes régulières.' }]
  },
  {
    id: 'reinitialiser', categorie: 'etablissement', titre: 'Réinitialiser les données',
    description: 'Efface les années scolaires, élèves, classes, frais, inscriptions, paiements, dépenses, paie et journal : l’application repart de zéro. L’identité de l’établissement, les comptes, les rôles et le lien vers le fichier de données sont conservés. Un fichier de sauvegarde est créé automatiquement à chaque réinitialisation.',
    motsCles: ['reinitialiser', 'remise a zero', 'effacer', 'tout supprimer', 'reset', 'vider'],
    chemin: ['Administration', 'Données et sauvegardes', 'Réinitialisation'], page: 'config-donnees', focus: '#config-donnees [data-action="admin:reset"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur : mot de passe et saisie du mot RÉINITIALISER obligatoires.',
    etapes: ['Ouvrez « Sauvegardes et restauration » › « Zone dangereuse ».', 'Cliquez sur « Réinitialiser les données… ».', 'Saisissez votre mot de passe et tapez RÉINITIALISER.', 'Avant l’effacement, une copie de sécurité est créée ainsi qu’un fichier « sauvegarde-avant-reinitialisation-date_heure.note » dans le dossier « sauvegardes » du fichier de données (ou dans Téléchargements si aucun fichier n’est lié).'],
    prerequis: [],
    resultat: 'Une application vide, prête pour une nouvelle saisie ; le fichier de données reste lié et la sauvegarde reste restaurable (« Importer JSON »).',
    erreurs: [{ probleme: '« Copie de sécurité impossible : réinitialisation annulée ».', solution: 'Le stockage du navigateur est plein : exportez puis supprimez d’anciennes copies avant de recommencer.' }]
  },

  // ── Utilisateurs et sécurité ────────────────────────────────────────────
  {
    id: 'gerer-utilisateurs', categorie: 'securite', titre: 'Créer un utilisateur et attribuer un rôle',
    description: 'Rôles de base : Administrateur (tout), Comptable / Caissier (saisie, sans suppression ni configuration) et Consultation (lecture). L’administrateur peut changer le rôle d’un utilisateur à tout moment et créer des rôles personnalisés.',
    motsCles: ['utilisateur', 'compte', 'role', 'droit', 'permission', 'acces', 'caissier', 'comptable', 'creer compte', 'ajouter utilisateur'],
    chemin: ['Administration', 'Utilisateurs et rôles'], page: 'config-utilisateurs', focus: '#config-utilisateurs form[data-form="utilisateur"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Utilisateurs et permissions › Utilisateurs et rôles ».', 'Saisissez l’identifiant, le nom complet, le rôle et un mot de passe (8 caractères, une lettre et un chiffre).', 'Cliquez sur « Créer l’utilisateur ».', 'Pour changer le rôle d’un utilisateur, choisissez-le dans la colonne « Rôle » de la liste : il s’applique immédiatement.', 'Pour retirer un accès, utilisez « Désactiver » (l’historique de l’utilisateur est conservé).'],
    prerequis: [],
    resultat: 'Le nouvel utilisateur peut se connecter avec ses identifiants.',
    erreurs: [
      { probleme: '« Cet identifiant existe déjà ».', solution: 'Choisissez un autre identifiant.' },
      { probleme: '« Il doit rester au moins un administrateur actif ».', solution: 'Créez ou activez un autre administrateur avant de désactiver celui-ci.' }
    ]
  },
  {
    id: 'roles-permissions', categorie: 'securite', titre: 'Modifier les rôles et leurs permissions',
    description: 'L’administrateur règle à tout moment, pour chaque rôle, les pages accessibles et les droits « Saisir et modifier » et « Exporter et imprimer ». Il peut créer des rôles personnalisés (Secrétariat, Direction des études…). Le rôle Administrateur garde toujours un accès complet.',
    motsCles: ['role', 'roles', 'permission', 'permissions', 'droits', 'modifier role', 'creer role', 'nouveau role', 'gestion des roles', 'acces', 'restreindre', 'autoriser'],
    chemin: ['Administration', 'Utilisateurs et rôles', 'Rôles et permissions'], page: 'config-utilisateurs', focus: '#roles-panel', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Utilisateurs et permissions › Utilisateurs et rôles » › « Rôles et permissions ».', 'Sur la carte d’un rôle, cochez les pages accessibles et les droits, puis « Enregistrer le rôle » : tous les utilisateurs du rôle sont concernés immédiatement.', 'Pour un nouveau rôle : saisissez son nom, choisissez le rôle de départ, « Créer le rôle », puis ajustez ses pages et droits.', 'Attribuez-le à un utilisateur dans la colonne « Rôle » de la liste des utilisateurs.', '« Rétablir les droits par défaut » remet les rôles de base à leur configuration d’origine.'],
    prerequis: [],
    resultat: 'Chaque utilisateur ne voit que les pages et les actions autorisées par son rôle ; la configuration reste réservée à l’administrateur.',
    erreurs: [
      { probleme: '« … utilisateur(s) ont ce rôle : attribuez-leur d’abord un autre rôle ».', solution: 'Changez le rôle de ces utilisateurs avant de supprimer le rôle.' },
      { probleme: '« Cochez au moins une page accessible ».', solution: 'Un rôle doit donner accès à au moins une page.' }
    ]
  },
  {
    id: 'mot-de-passe', categorie: 'securite', titre: 'Changer un mot de passe',
    description: 'L’administrateur change le mot de passe de n’importe quel compte, y compris le sien. Les autres utilisateurs doivent s’adresser à l’administrateur.',
    motsCles: ['mot de passe', 'oublie', 'changer mot de passe', 'password', 'perdu', 'reinitialiser mot de passe'],
    chemin: ['Administration', 'Utilisateurs et rôles', 'Mot de passe'], page: 'config-utilisateurs', focus: '#config-utilisateurs form[data-form="utilisateur"]', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur, qui confirme avec son propre mot de passe.',
    etapes: ['Ouvrez « Utilisateurs et permissions › Utilisateurs et rôles ».', 'Cliquez sur « Mot de passe » sur la ligne du compte.', 'Saisissez le nouveau mot de passe puis confirmez avec votre mot de passe administrateur.'],
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
      { probleme: 'L’option « Paiement mensuel » est grisée.', solution: 'Le tarif de la classe n’a pas de montant mensuel : complétez-le dans « Tarifs et scolarité › Tarifs et frais ».' },
      { probleme: '« Changement impossible : … déjà payés dépassent le total de la nouvelle modalité ».', solution: 'L’élève a déjà payé plus que le total de l’autre modalité : le changement ne peut pas répartir ce montant, il est refusé sans rien modifier.' }
    ]
  },
  {
    id: 'facture-scolarite', categorie: 'paiements', titre: 'Imprimer la facture de scolarité d’un élève',
    description: 'Document récapitulatif calculé automatiquement : élève, modalité, échéancier (dû, payé, reste, statut), paiements validés, progression et reste à payer.',
    motsCles: ['facture', 'releve', 'relevé de compte', 'situation de compte', 'etat de compte', 'facturation'],
    chemin: ['Paiements', 'Fiche de l’élève', 'Imprimer la facture'], page: 'paiements', focus: '#paiements [data-pay="student"]', roles: WRITE,
    etapes: ['Ouvrez « Paiements › Encaissements » et sélectionnez l’élève : cliquez sur « Imprimer la facture » au-dessus de l’échéancier.', 'Ou, dans « Élèves et inscriptions › Dossiers élèves », ouvrez la fiche avec « Consulter » et cliquez sur « Facture » pour l’année voulue.'],
    prerequis: [{ check: 'echeances', obligatoire: true, texte: 'L’inscription doit avoir un échéancier (frais configurés).', aide: 'configurer-frais' }],
    resultat: 'Une facture A4 numérotée FAC-année-n°, toujours à jour : elle exclut les paiements annulés.',
    erreurs: []
  }
];

// Fonctionnalités souvent recherchées mais ABSENTES de cette application : on le dit clairement plutôt que
// de proposer un lien fictif. `alternative` oriente vers ce qui existe réellement.
export const UNAVAILABLE = [
  { id: 'emploi-du-temps', label: 'Emploi du temps', motsCles: ['emploi du temps', 'horaire', 'planning', 'creneau', 'seance'], alternative: null },
  { id: 'notes', label: 'Évaluations et notes', motsCles: ['note', 'notes', 'evaluation', 'devoir', 'composition', 'examen note', 'interrogation', 'cahier de textes'], alternative: null },
  { id: 'moyennes', label: 'Moyennes et bulletins', motsCles: ['moyenne', 'moyennes', 'bulletin de notes', 'bulletin scolaire', 'bulletins scolaires', 'classement eleves', 'rang', 'trimestre', 'semestre', 'appreciation'], alternative: 'fiche-eleve' },
  { id: 'absences', label: 'Absences et présences', motsCles: ['absence', 'absences', 'presence', 'appel', 'retard eleve en classe'], alternative: null }
];

HELP_TOPICS.push(
  {
    id: 'frais-inscription', categorie: 'eleves', titre: 'Configurer les frais d’inscription et de réinscription',
    description: 'Chaque année scolaire a son montant d’inscription (nouvel élève) et son montant de réinscription. Il est ajouté une seule fois à l’échéancier de l’élève, lors de son inscription ou de sa réinscription de l’année, et réglé en priorité par le premier paiement.',
    motsCles: ['frais d inscription', 'frais de reinscription', 'droit d inscription', 'inscription payante', 'reinscription', 'montant inscription'],
    chemin: ['Années', 'Année scolaire'], page: 'annees', focus: '#annees [name="fraisInscription"]', roles: WRITE,
    autorisation: 'Création d’une année : administrateur ou comptable. Modification d’une année existante : autorisation d’un administrateur.',
    etapes: ['Ouvrez « Tarifs et scolarité › Années scolaires ».', 'Renseignez « Frais d’inscription (nouvel élève) » et « Frais de réinscription » (ou cliquez sur « Modifier » pour une année existante).', 'Enregistrez : les inscriptions suivantes de cette année reçoivent automatiquement le bon montant.'],
    prerequis: [{ check: 'annee', obligatoire: true, texte: 'L’année scolaire doit exister.', aide: 'creer-annee' }],
    resultat: 'Une échéance « Frais d’inscription » ou « Frais de réinscription » apparaît en tête de l’échéancier de chaque nouvel inscrit, une seule fois. Elle est conservée si la modalité change.',
    erreurs: [{ probleme: 'Un élève déjà inscrit n’a pas les frais.', solution: 'Les frais s’appliquent aux inscriptions faites après leur configuration : un montant déjà enregistré n’est jamais modifié ni ajouté rétroactivement.' }]
  },
  {
    id: 'dettes-anterieures', categorie: 'paiements', titre: 'Suivre et encaisser les dettes des années précédentes',
    description: 'Un solde impayé n’est reporté que par une procédure explicite : dans « Dettes antérieures › Reporter des soldes impayés », cochez les soldes à reprendre sur l’année choisie. Chaque dette garde son année et sa classe d’origine, son montant initial, ce qui avait été réglé avant le report, les remboursements et le reste dû.',
    motsCles: ['dette', 'dettes', 'reliquat', 'arriere', 'annee precedente', 'ancienne annee', 'solde reporte', 'report', 'impaye annee derniere', 'recouvrement'],
    chemin: ['Dettes antérieures'], page: 'dettes', focus: '#dettes [data-dettes="search"]', roles: WRITE,
    etapes: ['Ouvrez « Dettes et impayés › Dettes antérieures ».', 'Dans « Reporter des soldes impayés », choisissez l’année de report, cochez les soldes puis « Reporter » (autorisation administrateur).', 'Cliquez sur « Encaisser » : le formulaire de paiement s’ouvre sur la dette de l’élève.', 'Ou, dans « Paiements › Encaissements », sélectionnez l’élève : ses dettes s’affichent avec un bouton « Régler cette dette ».', 'Saisissez le montant et enregistrez ; « Historique » liste tous les règlements.'],
    prerequis: [],
    resultat: 'Le reste dû diminue, l’année d’origine est soldée d’autant, et le règlement est encaissé sur l’année en cours (trésorerie). Une dette n’est jamais comptée deux fois.',
    erreurs: [{ probleme: '« L’année … est clôturée ».', solution: 'Seul le règlement d’une dette reportée est accepté sur une année clôturée : passez par « Dettes antérieures » ou le bouton « Régler cette dette ».' }]
  }
);

HELP_TOPICS.push(
  {
    id: 'gerer-personnel', categorie: 'paie', titre: 'Enregistrer un employé (fiche du personnel)',
    description: 'Étape 1 de la paie : la fiche contient uniquement les informations administratives (matricule automatique EMP-AAAA-NNNN, photo, identité, contacts, type d’employé, fonction, contrat, date d’embauche, statut). La rémunération se définit ensuite, à part, dans « Rémunérations ». Les changements de contrat, de fonction et de statut sont historisés.',
    motsCles: ['personnel', 'employe', 'salarie', 'enseignant', 'professeur', 'agent', 'gardien', 'secretaire', 'directeur', 'recruter', 'embauche', 'contrat', 'type d employe', 'fonction', 'vacataire', 'enregistrer un employe'],
    chemin: ['Personnel', 'Fiche employé'], page: 'personnel', focus: '#personnel form[data-form="employe"]', roles: WRITE,
    autorisation: 'Administrateur ou comptable.',
    etapes: ['Ouvrez « Paie du personnel › Personnel ».', 'Renseignez l’identité, le type d’employé (ajoutez un type personnalisé en bas de page si besoin), la fonction et le contrat.', 'Cliquez sur « Enregistrer l’employé ». Enseignant : l’application ouvre « Affectations » (étape 2) ; autre employé : elle ouvre directement « Rémunérations » (étape 3).', '« Fiche » affiche l’historique, les affectations, les heures et les paies.'],
    prerequis: [],
    resultat: 'L’employé apparaît dans la liste avec « Rémunération : à définir » tant que l’étape Rémunérations n’est pas faite ; sa paie ne peut pas être validée avant.',
    erreurs: [{ probleme: '« Ce matricule est déjà attribué ».', solution: 'Laissez le matricule vide : il est généré automatiquement.' }]
  },
  {
    id: 'definir-remuneration', categorie: 'paie', titre: 'Définir ou modifier la rémunération d’un employé',
    description: 'Étape 3 de la paie : salaire mensuel, ou — pour un enseignant du collège ou du lycée — paiement à l’heure (tarif horaire), et prime fixe mensuelle. C’est le montant de référence utilisé chaque mois par la paie mensuelle. Chaque changement est historisé (date, auteur, motif) et ne modifie jamais une paie déjà validée.',
    motsCles: ['remuneration', 'salaire', 'salaire de base', 'salaire mensuel', 'tarif horaire', 'paye a l heure', 'augmentation', 'prime fixe', 'definir le salaire', 'modifier le salaire', 'combien est paye'],
    chemin: ['Paie du personnel', 'Rémunérations'], page: 'remunerations', focus: '#remunerations', roles: WRITE,
    autorisation: 'Autorisation d’un administrateur pour toute définition ou modification.',
    etapes: ['Ouvrez « Paie du personnel › Rémunérations » (ou cliquez sur « Définir la rémunération » dans la liste du personnel).', 'Choisissez l’employé : sa rémunération actuelle s’affiche.', 'Choisissez le mode (« Salaire mensuel » ou, pour un enseignant, « Payé à l’heure »), le montant ou le tarif horaire, la prime fixe et, pour une modification, le motif.', 'Cliquez sur « Définir la rémunération » et confirmez avec le mot de passe administrateur.'],
    prerequis: [{ check: 'personnel', obligatoire: true, texte: 'L’employé doit avoir une fiche active.', aide: 'gerer-personnel' }],
    resultat: 'Le tableau indique le mode, le montant de référence et la dernière modification ; l’employé est prêt pour la paie mensuelle.',
    erreurs: [
      { probleme: '« Le paiement à l’heure est réservé aux enseignants ».', solution: 'Le mode horaire n’est proposé que pour un employé de type « enseignant ».' },
      { probleme: '« Rémunération non définie » dans la paie du mois.', solution: 'Définissez la rémunération de l’employé ici, puis revenez à la paie : le brouillon se recalcule.' }
    ]
  },
  {
    id: 'affecter-enseignant', categorie: 'paie', titre: 'Affecter un enseignant à une classe et une matière',
    description: 'Primaire : titulaire d’une classe (un titulaire par classe, une classe par enseignant et par année). Collège et lycée : plusieurs classes, matières et niveaux dans un même formulaire ; seules les matières au programme des classes cochées sont proposées ; une matière d’une classe n’a qu’un enseignant à la fois.',
    motsCles: ['affectation', 'affecter', 'affecter un enseignant', 'matiere', 'matieres', 'salle', 'emploi des enseignants', 'professeur principal', 'titulaire', 'plusieurs classes', 'plusieurs matieres', 'programme'],
    chemin: ['Affectations', 'Nouvelles affectations'], page: 'affectations', focus: '#affectations .aff-builder', roles: WRITE,
    etapes: ['Définissez le programme des classes (Scolarité › Classes › Programme et coefficients).', 'Ouvrez « Paie du personnel › Affectations », choisissez l’année et l’enseignant.', 'Primaire : choisissez la classe puis « Affecter comme titulaire ».', 'Collège / lycée : cochez les classes, puis les matières proposées, indiquez la salle, cliquez sur « Ajouter les lignes ».', 'Vérifiez les lignes (salle modifiable, « Retirer »), puis « Enregistrer les N affectations » : tout est validé en une fois.'],
    prerequis: [
      { check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année choisie.', aide: 'creer-classe' },
      { check: 'enseignant', obligatoire: true, texte: 'Un employé de type enseignant doit être enregistré.', aide: 'gerer-personnel' }
    ],
    resultat: 'Les affectations sont listées par année (historique conservé) ; une affectation clôturée libère la matière pour un autre enseignant.',
    erreurs: [{ probleme: '« La classe … a déjà un enseignant titulaire ».', solution: 'Au primaire, une classe a un seul titulaire : clôturez l’affectation existante avant d’en créer une autre.' }]
  },
  {
    id: 'preparer-paie', categorie: 'paie', titre: 'Préparer, valider et payer la paie du mois',
    description: 'La paie se prépare par mois : net = salaire mensuel (ou, pour un enseignant payé à l’heure, heures dispensées du mois × tarif horaire) + primes − avances à rembourser − autres retenues saisies explicitement pour le mois. Les heures sont saisies une seule fois par enseignant et par mois (corrigeables, chaque correction est tracée) et verrouillées dès la validation. Une seule paie par employé et par mois ; elle est rattachée à l’année scolaire qui couvre le mois.',
    motsCles: ['paie', 'salaire', 'salaires', 'payer le personnel', 'fiche de paie', 'masse salariale', 'salaire mensuel', 'prime', 'retenue', 'valider la paie', 'paie mensuelle', 'heures', 'heures du mois', 'heures dispensees', 'saisir les heures', 'paye a l heure', 'tarif horaire', 'volume horaire'],
    chemin: ['Paie mensuelle'], page: 'paie', focus: '#paie [data-action="paie:preparer"]', roles: WRITE,
    autorisation: 'Préparation, primes et retenues du mois : administrateur ou comptable. Validation, paiement et annulation : administrateur.',
    etapes: ['Ouvrez « Paie du personnel › Paie mensuelle » et choisissez le mois.', 'Cliquez sur « Préparer la paie du mois » : un brouillon est créé pour chaque employé actif (jamais en double).', 'Enseignants payés à l’heure : dans « Heures du mois », saisissez les heures dispensées pour chaque affectation puis « Enregistrer les heures du mois » ; le salaire du mois est recalculé. Une nouvelle saisie du même mois met à jour la précédente (historique conservé).', 'Ouvrez « Détail » : ajoutez si besoin les primes et les retenues autorisées du mois ; le calcul se met à jour.', 'Cliquez sur « Valider » (montants figés, numéro de bulletin, prélèvements d’avances), puis « Marquer payée » pour enregistrer la sortie de caisse.'],
    prerequis: [{ check: 'personnel', obligatoire: true, texte: 'Au moins un employé actif doit être enregistré.', aide: 'gerer-personnel' }],
    resultat: 'Bulletins numérotés BP-AAAA-MM-NNNN ; chaque salaire payé est enregistré en dépense « Salaires et indemnités » et diminue le solde de caisse.',
    erreurs: [
      { probleme: '« Les retenues dépassent le salaire brut ».', solution: 'Corrigez les retenues du mois : la paie ne peut pas être validée avec un net négatif.' },
      { probleme: 'Un employé n’apparaît pas à la préparation.', solution: 'Seuls les employés au statut « Actif » sont préparés ; une paie déjà existante pour ce mois n’est jamais recréée.' },
      { probleme: '« Aucune heure saisie » pour un enseignant payé à l’heure.', solution: 'Enregistrez ses heures du mois dans le panneau « Heures du mois » avant de valider sa paie.' },
      { probleme: 'Les heures d’un enseignant ne sont plus modifiables.', solution: 'Sa paie du mois est validée : annulez-la (motif obligatoire), corrigez les heures puis validez de nouveau.' }
    ]
  },
  {
    id: 'avances-salaire', categorie: 'paie', titre: 'Gérer les avances sur salaire',
    description: 'Demande, approbation (montant autorisé), versement, puis remboursement par prélèvement mensuel fixe ou sur une durée définie. L’échéancier est automatique (dernière mensualité ajustée) ; les prélèvements se font sur la paie, avec reports et remboursements exceptionnels.',
    motsCles: ['avance', 'avances', 'avance sur salaire', 'acompte salaire', 'pret', 'remboursement', 'prelevement', 'echeancier avance', 'report'],
    chemin: ['Avances sur salaire'], page: 'avances', focus: '#avances form[data-form="avance"]', roles: WRITE,
    autorisation: 'Demande : administrateur ou comptable. Approbation, refus, versement, report et remboursement exceptionnel : administrateur.',
    etapes: ['Ouvrez « Paie du personnel › Avances sur salaire ».', 'Saisissez la demande : employé, montant, mode de remboursement, mensualité ou durée et premier mois ; l’échéancier proposé s’affiche.', 'Un administrateur clique sur « Approuver » (montant autorisé) puis « Verser » : la sortie de caisse est enregistrée.', 'Les prélèvements s’appliquent à la validation des paies ; « Détail » permet de reporter une échéance, « Remboursement exceptionnel » d’encaisser un remboursement anticipé.'],
    prerequis: [{ check: 'personnel', obligatoire: true, texte: 'L’employé doit avoir une fiche.', aide: 'gerer-personnel' }],
    resultat: 'Solde toujours exact : montant autorisé = prélevé sur paie + remboursé en exceptionnel + reste dû. Chaque opération est historisée.',
    erreurs: [{ probleme: 'Le prélèvement est partiel.', solution: 'Le net du mois était insuffisant : le reste est automatiquement reporté au mois suivant.' }]
  },
  {
    id: 'bulletins-paie', categorie: 'paie', titre: 'Imprimer les bulletins de paie et les récapitulatifs',
    description: 'Bulletins mensuels en PDF (individuels ou groupés, un par page), récapitulatif mensuel, récapitulatif annuel global et individuel, avec export PDF et Excel. Seules les paies validées ou payées sont imprimées.',
    motsCles: ['bulletin', 'bulletins', 'generer un bulletin', 'generer les bulletins', 'bulletin de paie', 'bulletins de salaire', 'fiche de paie', 'recapitulatif', 'recap annuel', 'etat de paie', 'livre de paie'],
    chemin: ['Bulletins et récapitulatifs'], page: 'paie-rapports', focus: '#paie-rapports .report-tabs', roles: WRITE,
    etapes: ['Ouvrez « Paie du personnel › Bulletins et récapitulatifs ».', 'Choisissez le récapitulatif (mensuel, annuel global ou individuel) et ses filtres.', 'Cliquez sur « PDF / Imprimer » ou « Excel », ou imprimez les bulletins du mois (tous ou un par un).'],
    prerequis: [{ check: 'paieValidee', obligatoire: true, texte: 'Au moins une paie validée.', aide: 'preparer-paie' }],
    resultat: 'Des documents à l’en-tête de l’établissement, avec brut, primes, retenues, avances, net et signatures.',
    erreurs: []
  },
  {
    id: 'tableau-paie', categorie: 'paie', titre: 'Suivre la masse salariale (tableau de bord de la paie)',
    description: 'Effectifs, masse salariale brute et nette du mois, salaires payés et en attente, avances en cours, statistiques mensuelles et annuelles, et points d’attention (contrats qui se terminent, enseignants sans affectation, paies non préparées).',
    motsCles: ['masse salariale', 'effectif', 'tableau de bord paie', 'cout du personnel', 'statistiques paie'],
    chemin: ['Tableau de bord'], page: 'paie-dashboard', focus: '#paie-dashboard [data-pv="mois"]', roles: WRITE,
    etapes: ['Ouvrez « Paie du personnel › Tableau de bord ».', 'Choisissez le mois : les indicateurs et le graphique annuel se mettent à jour.'],
    prerequis: [],
    resultat: 'Une vue d’ensemble de la paie, avec des raccourcis vers les actions à mener.',
    erreurs: []
  }
);

HELP_TOPICS.push(
  {
    id: 'analyse-encaissements', categorie: 'depenses', titre: 'Analyser les encaissements, les dépenses et le solde',
    description: 'Total des encaissements réellement enregistrés, dépenses définitives (dont salaires), avances sur salaire (créances, distinguées des charges), solde net et résultat de la période ; évolution par jour, semaine ou mois, comparaison avec la période précédente, répartition par catégorie et par tranche, et écart entre montants attendus et encaissés.',
    motsCles: ['analyse des encaissements', 'encaissements', 'solde net', 'resultat', 'comparaison des periodes', 'ecart attendu', 'tresorerie', 'evolution des paiements', 'courbe', 'graphique'],
    chemin: ['Analyse des encaissements'], page: 'encaissements-analyse', focus: '#encaissements-analyse [data-ae="from"]', roles: ALL,
    etapes: ['Ouvrez « Paiements › Analyse des encaissements ».', 'Choisissez l’année, la période, la catégorie ou la classe et le regroupement (jour, semaine, mois).', 'Lisez les indicateurs, les graphiques et les tableaux ; cochez « Comparer à la période précédente » pour la courbe de comparaison.', 'Exportez avec « PDF / Imprimer » ou « Excel » : les exports reprennent exactement les filtres affichés.'],
    prerequis: [{ check: 'paiement', obligatoire: false, texte: 'Sans paiement enregistré, les encaissements restent à zéro.', aide: 'enregistrer-paiement' }],
    resultat: 'Une vue de trésorerie fiable : un montant attendu n’est jamais compté comme encaissé, et une avance sur salaire n’est pas comptée comme une charge définitive.',
    erreurs: [{ probleme: 'Les dépenses ne changent pas avec le filtre de classe.', solution: 'C’est normal : les dépenses concernent tout l’établissement ; la catégorie et la classe filtrent les encaissements et les montants attendus.' }]
  },
  {
    id: 'listes-exports', categorie: 'rapports', titre: 'Paginer, imprimer et exporter une liste',
    description: 'Toutes les listes (élèves, inscriptions, paiements, dépenses, dettes, personnel, affectations, paies, avances, journal) partagent la même barre : nombre de résultats, « + Ajouter », « Excel », « PDF / Imprimer », pagination et nombre de lignes par page. Les exports reprennent les filtres et la recherche affichés.',
    motsCles: ['liste', 'pagination', 'page suivante', 'exporter la liste', 'imprimer la liste', 'excel', 'pdf', 'telecharger', 'tableau'],
    chemin: ['Dossiers élèves', 'Répertoire des élèves'], page: 'eleves', focus: '#eleves .list-toolbar', roles: WRITE,
    etapes: ['Filtrez ou recherchez dans la liste.', 'Utilisez « ‹ » et « › » et « Lignes par page » pour parcourir les résultats.', 'Cliquez sur « Excel » ou « PDF / Imprimer » : toutes les lignes filtrées sont exportées (pas seulement la page affichée), avec l’en-tête de l’établissement et la date.'],
    prerequis: [],
    resultat: 'Un fichier Excel structuré (montants en nombres) ou un PDF à en-tête, conforme aux filtres affichés.',
    erreurs: []
  }
);

HELP_TOPICS.push(
  {
    id: 'gerer-matieres', categorie: 'classes', titre: 'Ajouter ou désactiver une matière',
    description: 'La liste des matières est commune à toutes les classes. Elle se gère dans Scolarité › Classes, juste au-dessus du programme des classes. Une matière désactivée n’est plus proposée mais reste dans l’historique.',
    motsCles: ['matiere', 'matieres', 'ajouter une matiere', 'nouvelle matiere', 'liste des matieres', 'desactiver une matiere', 'discipline'],
    chemin: ['Scolarité', 'Classes', 'Matières'], page: 'classes', focus: '#matieres-panel', roles: WRITE,
    etapes: ['Ouvrez « Tarifs et scolarité › Classes » et descendez jusqu’au bloc « Matières ».', 'Saisissez le nom dans « Nouvelle matière » puis cliquez sur « Ajouter la matière ».', 'Pour retirer une matière, cliquez sur « désactiver » à côté de son nom.', 'Cochez ensuite la matière dans le programme des classes concernées (bloc « Programme et coefficients »).'],
    prerequis: [],
    resultat: 'La matière est proposée dans le programme des classes, puis dans les affectations des enseignants.',
    erreurs: [{ probleme: '« Cette matière existe déjà ».', solution: 'Une matière du même nom existe (peut-être désactivée) : réactivez-la au lieu d’en créer une nouvelle.' }]
  },
  {
    id: 'programme-classes', categorie: 'classes', titre: 'Définir le programme et les coefficients d’une classe',
    description: 'Pour chaque classe : matières enseignées, coefficient et volume horaire hebdomadaire. Le programme est reconduit d’une année à l’autre et seules ses matières sont proposées dans les affectations des enseignants.',
    motsCles: ['programme', 'coefficient', 'coefficients', 'matiere de la classe', 'matieres par classe', 'volume horaire', 'parametres pedagogiques'],
    chemin: ['Scolarité', 'Classes', 'Programme et coefficients'], page: 'classes', focus: '#programme-panel', roles: WRITE,
    etapes: ['Ouvrez « Tarifs et scolarité › Classes » et descendez jusqu’à « Programme et coefficients ».', 'Choisissez la classe, cochez les matières enseignées, indiquez le coefficient et les heures par semaine.', 'Cliquez sur « Enregistrer le programme ». « Copier le programme de » reprend celui d’une autre classe.'],
    prerequis: [{ check: 'classe', obligatoire: true, texte: 'La classe doit exister pour l’année active.', aide: 'creer-classe' }],
    resultat: 'Le nombre de matières apparaît sur la carte de la classe ; les affectations ne proposent que ces matières.',
    erreurs: [{ probleme: '« Coefficient invalide ».', solution: 'Le coefficient doit être compris entre 0,5 et 20.' }]
  },
  {
    id: 'contacts-parents', categorie: 'eleves', titre: 'Enregistrer les parents, tuteurs et contacts d’urgence',
    description: 'Chaque élève a un parent ou tuteur principal (nom, prénom, lien : père, mère ou tuteur, téléphone principal et secondaire, adresse) et un contact d’urgence facultatif. Une même fiche parent est réutilisée pour tous les enfants d’une famille, sans doublon.',
    motsCles: ['parent d eleve', 'tuteur', 'pere', 'mere', 'telephone parent', 'coordonnees du parent', 'contact', 'contact d urgence', 'urgence', 'famille', 'fratrie', 'frere', 'soeur'],
    chemin: ['Élèves', 'Dossiers élèves', 'Fiche élève'], page: 'eleves', focus: '#eleves .contact-box', roles: WRITE,
    etapes: ['Ouvrez « Élèves et inscriptions › Dossiers élèves ».', 'Pour un frère ou une sœur, tapez le nom ou le téléphone du parent dans « Famille déjà enregistrée » : ses informations sont reprises.', 'Sinon, saisissez le nom, le prénom, le lien, les téléphones et l’adresse du parent, puis le contact d’urgence si besoin.', 'Enregistrez : la fiche de l’élève affiche ses responsables, le contact d’urgence et ses frères et sœurs.'],
    prerequis: [],
    resultat: 'Le téléphone du parent figure dans la liste des élèves, les rapports de retards et les fiches de rappel.',
    erreurs: [{ probleme: 'Un parent apparaît deux fois.', solution: 'Le même téléphone principal désigne toujours le même parent : utilisez « Famille déjà enregistrée » pour le reprendre.' }]
  },
  {
    id: 'arrondis-gnf', categorie: 'etablissement', titre: 'Régler l’arrondi des montants en GNF',
    description: 'Les montants calculés automatiquement (tranches, mensualités, échéances d’avance) sont arrondis selon une règle par nature : palier (franc, 100, 500, 1 000, 5 000 ou 10 000 GNF) et sens (au plus proche, inférieur, supérieur). La dernière part absorbe l’écart : les totaux restent exacts.',
    motsCles: ['arrondi', 'arrondir', 'arrondissement', 'gnf', 'centimes', 'montant rond', 'palier', 'mensualite arrondie'],
    chemin: ['Administration', 'Paramètres financiers'], page: 'config-finances', focus: '#arrondis-panel', roles: ['admin'],
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Paramètres › Paramètres financiers ».', 'Pour chaque nature, choisissez le palier et le sens ; l’exemple se met à jour à l’enregistrement.', 'Cliquez sur « Enregistrer les règles d’arrondi ».'],
    prerequis: [],
    resultat: 'Exemple : 1 000 000 en 3 tranches au palier 5 000 → 335 000 + 335 000 + 330 000. Les montants saisis (paiements, dépenses, salaires) ne sont jamais arrondis.',
    erreurs: []
  }
);

// ── GEST SCHOOL SCOLARITÉ : comptes, règlements en attente, corrections, réductions, créances, dépenses récurrentes ──
HELP_TOPICS.push(
  {
    id: 'reglement-attente', categorie: 'paiements', titre: 'Encaisser un chèque ou un virement en attente',
    description: 'Un chèque non encore crédité ou un virement annoncé est enregistré « en attente » : il n’entre dans aucun total (solde de l’élève, caisse, rapports) tant que l’encaissement n’est pas confirmé.',
    motsCles: ['cheque', 'virement', 'en attente', 'confirmer', 'cheque impaye', 'sans provision', 'rejeter', 'encaissement en attente'],
    chemin: ['Paiements & dépenses', 'Encaissements', 'Règlements en attente'], page: 'paiements', focus: '#paiements form[data-form="paiement"]', roles: WRITE,
    etapes: ['Sélectionnez l’élève et la modalité comme pour un paiement ordinaire.', 'Choisissez « Chèque » (ou Virement, Mobile Money, Carte), saisissez la référence, puis cochez « En attente de confirmation ».', 'Le règlement apparaît dans « Règlements en attente » avec un numéro ATT-AAAA-NNNNNN.', 'Une fois l’argent crédité, cliquez sur « Confirmer l’encaissement » (date et compte) : le reçu numéroté est émis. Sinon, « Rejeter » avec le motif.'],
    prerequis: [{ check: 'inscription', obligatoire: true, texte: 'L’élève doit être inscrit.', aide: 'inscrire-eleve' }],
    resultat: 'Confirmé : un paiement normal (reçu, imputation, soldes). Rejeté : la ligne reste dans le registre avec son motif, le solde ne change pas.',
    erreurs: [{ probleme: '« Ce montant dépasserait le solde restant ».', solution: 'Les règlements déjà en attente sont comptés : confirmez ou rejetez d’abord les précédents.' }]
  },
  {
    id: 'corriger-paiement', categorie: 'paiements', titre: 'Corriger un paiement (moyen, compte, référence, date)',
    description: 'Les informations sans effet sur le montant ni sur l’élève se corrigent avec un motif ; l’état précédent reste dans l’historique du paiement. Une erreur de montant ou d’élève se corrige en annulant le paiement puis en enregistrant le bon.',
    motsCles: ['corriger paiement', 'modifier paiement', 'erreur reference', 'mauvais compte', 'mauvaise date', 'erreur mode de paiement'],
    chemin: ['Paiements & dépenses', 'Encaissements', 'Journal des paiements', 'Corriger'], page: 'paiements', focus: '#paiements [data-payment-search]', roles: WRITE,
    autorisation: 'Accord d’un administrateur requis.',
    etapes: ['Retrouvez le paiement dans le « Journal des paiements ».', 'Cliquez sur « Corriger », modifiez le moyen, le compte, la date, la référence, le payeur, la description ou l’observation.', 'Indiquez le motif de la correction puis validez (identifiants d’un administrateur si vous n’êtes pas administrateur).'],
    prerequis: [{ check: 'paiement', obligatoire: true, texte: 'Le paiement doit exister.', aide: 'enregistrer-paiement' }],
    resultat: 'Le paiement est corrigé, « 1 correction(s) tracée(s) » apparaît et le journal des opérations garde l’avant / après.',
    erreurs: []
  },
  {
    id: 'reduction-eleve', categorie: 'eleves', titre: 'Accorder une remise, une bourse ou une exonération',
    description: 'Une réduction porte sur la scolarité restant à payer (jamais sur les frais d’inscription ni les frais annexes) et ne déplace aucun paiement déjà reçu. La remise est plafonnée par le tarif de la classe ; bourse et exonération sont accordées par un administrateur.',
    motsCles: ['remise', 'reduction', 'bourse', 'exoneration', 'gratuite', 'rabais', 'fratrie', 'enfant du personnel'],
    chemin: ['Élèves', 'Inscriptions', 'Réduction'], page: 'inscriptions', focus: '#inscriptions [data-insc-year]', roles: WRITE,
    etapes: ['Ouvrez « Élèves et inscriptions › Inscriptions » (ou la fiche de l’élève dans Encaissements).', 'Cliquez sur « Réduction » à la ligne de l’élève.', 'Choisissez Remise, Bourse ou Exonération totale, le calcul (pourcentage ou montant), la valeur et le motif.', 'Validez : l’échéancier et le solde sont recalculés aussitôt.'],
    prerequis: [{ check: 'tarif', obligatoire: true, texte: 'Le tarif de la classe doit exister (il fixe la remise maximale).', aide: 'configurer-frais' }],
    resultat: 'Le montant attendu baisse d’autant ; la réduction figure sur la fiche de paiement, dans les créances et dans le journal.',
    erreurs: [{ probleme: '« Remise trop élevée ».', solution: 'Augmentez la « Remise maximale autorisée » dans le tarif de la classe, ou accordez une bourse (administrateur).' }, { probleme: '« La réduction dépasse ce qui reste à payer ».', solution: 'Les sommes déjà payées ne sont jamais transformées en avoir : réduisez la valeur.' }]
  },
  {
    id: 'creances-relances', categorie: 'rapports', titre: 'Suivre les créances et imprimer les relances',
    description: 'Liste des élèves ayant un solde : attendu, réglé, reste, montant échu, ancienneté du retard, réductions et règlements en attente, avec états par classe et par année. Les relances sont des lettres à imprimer : aucun SMS ni message n’est envoyé.',
    motsCles: ['creance', 'creances', 'impaye', 'impayes', 'recouvrement', 'relance', 'lettre de relance', 'etat de recouvrement', 'retard paiement'],
    chemin: ['Paiements & dépenses', 'Créances et relances'], page: 'creances', focus: '#creances [data-cr="yearId"]', roles: ALL,
    etapes: ['Ouvrez « Dettes et impayés › Créances et relances ».', 'Filtrez par année, catégorie, classe, statut, ancienneté du retard ou élève.', 'Imprimez l’état de recouvrement ou les lettres de relance des élèves en retard (une lettre par élève), ou exportez en CSV.', 'Le bouton « Encaisser » ouvre directement le paiement de l’élève.'],
    prerequis: [{ check: 'inscription', obligatoire: false, texte: 'Des élèves inscrits avec un échéancier.', aide: 'inscrire-eleve' }],
    resultat: 'Les montants sont recalculés à chaque paiement, annulation ou réduction.',
    erreurs: []
  },
  {
    id: 'comptes-virements', categorie: 'depenses', titre: 'Comptes financiers et virements internes',
    description: 'Chaque encaissement et chaque dépense est rattaché à un compte (caisse, banque, Mobile Money). Un virement interne (dépôt en banque, approvisionnement de caisse) déplace l’argent entre comptes sans changer les recettes ni les dépenses.',
    motsCles: ['compte', 'banque', 'caisse', 'virement interne', 'depot en banque', 'solde du compte', 'mobile money', 'approvisionner la caisse'],
    chemin: ['Paiements & dépenses', 'Comptes et virements'], page: 'comptes', focus: '#comptes', roles: WRITE,
    etapes: ['Ouvrez « Caisse et trésorerie › Comptes et virements » : le solde de chaque compte s’affiche.', 'Pour un virement, choisissez le compte de départ, le compte d’arrivée, le montant, la date et le motif.', 'Un virement saisi par erreur s’annule (motif, accord administrateur) : il reste dans l’historique.'],
    prerequis: [],
    resultat: 'Les soldes des deux comptes sont mis à jour ; un virement supérieur au solde disponible est refusé.',
    erreurs: [{ probleme: 'Le virement est impossible.', solution: 'Créez d’abord un second compte dans Paramètres › Paramètres financiers.' }]
  },
  {
    id: 'configurer-comptes', categorie: 'etablissement', titre: 'Créer les comptes financiers et les catégories',
    description: 'Comptes (caisse, banque, Mobile Money) avec leur solde initial, catégories d’enseignement et catégories de dépenses de l’établissement.',
    motsCles: ['creer compte', 'compte bancaire', 'solde initial', 'categorie depense', 'categorie enseignement', 'maternelle', 'parametres financiers'],
    chemin: ['Administration', 'Paramètres financiers'], page: 'config-finances', focus: '#comptes-panel', roles: ADMIN,
    autorisation: 'Réservé à l’administrateur.',
    etapes: ['Ouvrez « Paramètres › Paramètres financiers ».', 'Créez chaque compte : nom, type, numéro et solde au moment où vous commencez à utiliser l’application.', 'Dans « Catégories », écrivez une catégorie par ligne puis enregistrez.'],
    prerequis: [],
    resultat: 'Les comptes sont proposés dans les formulaires de paiement et de dépense ; les catégories dans les classes, les dépenses et les rapports.',
    erreurs: [{ probleme: '« Catégorie(s) utilisée(s) par des classes ».', solution: 'Une catégorie portée par une classe ne peut pas être retirée.' }]
  },
  {
    id: 'depenses-recurrentes', categorie: 'depenses', titre: 'Dépenses récurrentes (loyer, abonnements…)',
    description: 'Un modèle décrit une dépense qui revient (montant, fréquence, jour, compte). Chaque échéance est signalée 15 jours à l’avance et n’est enregistrée qu’après confirmation.',
    motsCles: ['recurrente', 'loyer', 'abonnement', 'mensuelle', 'charge fixe', 'facture mensuelle', 'electricite', 'eau'],
    chemin: ['Paiements & dépenses', 'Dépenses et caisse', 'Dépenses récurrentes'], page: 'depenses', focus: '#recurrentes-panel', roles: WRITE,
    etapes: ['Dans « Dépenses récurrentes », ouvrez « Ajouter une dépense récurrente ».', 'Renseignez libellé, catégorie, montant, fréquence, jour d’échéance et première échéance.', 'Quand une échéance apparaît, cliquez sur « Enregistrer » (montant et date ajustables) ou « Ignorer ».'],
    prerequis: [{ check: 'anneeOuverte', obligatoire: true, texte: 'L’année active ne doit pas être clôturée.', aide: 'annee-active' }],
    resultat: 'Une dépense ordinaire numérotée est créée, reliée au modèle ; une même période ne peut pas être enregistrée deux fois.',
    erreurs: []
  },
  {
    id: 'frais-annexes', categorie: 'classes', titre: 'Frais annexes, frais d’inscription de la classe et remise maximale',
    description: 'Le tarif d’une classe peut fixer ses propres frais d’inscription / réinscription, des frais annexes obligatoires (tenue, cantine, transport…) et la remise maximale autorisée. Une modification n’est jamais rétroactive pour un élève qui a déjà payé.',
    motsCles: ['frais annexes', 'tenue', 'cantine', 'transport', 'fournitures', 'frais inscription classe', 'remise maximale', 'historique tarif'],
    chemin: ['Scolarité', 'Tarifs et frais'], page: 'tarifs', focus: '#tarifs form[data-form="tarif"]', roles: WRITE,
    etapes: ['Ouvrez « Tarifs et scolarité › Tarifs et frais » et choisissez la classe.', 'Dans « Frais complémentaires et réductions », saisissez les frais propres à la classe (vide : ceux de l’année), la remise maximale et les frais annexes, une ligne « Libellé = montant » par frais.', 'Enregistrez. En modification, choisissez d’appliquer ou non le nouveau tarif aux élèves qui n’ont encore rien payé.'],
    prerequis: [{ check: 'classe', obligatoire: true, texte: 'La classe doit exister.', aide: 'creer-classe' }],
    resultat: 'Les frais annexes apparaissent dans l’échéancier des élèves ; la version précédente du tarif est conservée dans son historique.',
    erreurs: [{ probleme: '« Frais annexe illisible ».', solution: 'Écrivez une ligne par frais, par exemple « Tenue = 50000 ».' }]
  }
);


// ── Licence, compte de l'éditeur et formulaires repliés ──
HELP_TOPICS.push(
  {
    id: 'licence-annee', categorie: 'etablissement', titre: 'Licence : clé pour chaque nouvelle année scolaire',
    description: 'Chaque nouvelle année scolaire consomme une clé de licence fournie par l’éditeur, une seule fois et pour toujours. Une clé utilisée le reste même après une réinitialisation ou une restauration ; une clé désactivée, révoquée, expirée ou supprimée est refusée.',
    motsCles: ['licence', 'cle de licence', 'cle', 'activation', 'nouvelle annee', 'cle refusee', 'cle invalide', 'editeur'],
    chemin: ['Licence'], page: 'licences', focus: '#licences form[data-form="licence-verifier"]', roles: ADMIN,
    autorisation: 'Réservé au super administrateur ; le catalogue des clés est géré uniquement par le compte de l’éditeur.',
    etapes: ['Ouvrez « Paramètres › Licence » : le nombre de clés disponibles s’affiche.', 'Pour contrôler une clé sans la consommer, saisissez-la dans « Vérifier une clé de licence ».', 'Créez l’année dans « Tarifs et scolarité › Années scolaires » en saisissant la clé dans « Clé de licence » : elle est consommée à l’enregistrement.'],
    prerequis: [],
    resultat: 'L’année est créée et la clé apparaît comme « Utilisée » avec l’année concernée ; le journal d’audit conserve la trace.',
    erreurs: [{ probleme: '« Clé de licence obligatoire » ou « invalide ».', solution: 'Saisissez la clé fournie par l’éditeur (les tirets et espaces sont ignorés).' }, { probleme: '« déjà été utilisée ».', solution: 'Une clé ne sert qu’une fois : demandez une nouvelle clé à l’éditeur.' }]
  },
  {
    id: 'formulaires-replies', categorie: 'pilotage', titre: 'Ouvrir un formulaire de saisie',
    description: 'Les formulaires (paiement, élève, dépense, tarif…) sont rangés derrière un bouton orange portant leur nom, pour garder des pages lisibles. Ils s’ouvrent aussi automatiquement lorsque vous modifiez un élément ou passez d’une étape à la suivante.',
    motsCles: ['formulaire', 'ou est le formulaire', 'bouton', 'ajouter', 'saisir', 'ouvrir formulaire'],
    chemin: ['Vue d’ensemble'], page: 'dashboard', focus: '#dashboard', roles: ALL,
    etapes: ['Cliquez sur le bouton orange « ＋ … » de la page (ex. « ＋ Enregistrer un paiement »).', 'Remplissez puis validez ; le bouton « ✕ » referme le formulaire sans rien enregistrer.'],
    prerequis: [],
    resultat: 'Le formulaire se replie de lui-même après un enregistrement réussi.',
    erreurs: []
  }
);


// ── Éditeur du logiciel ──
HELP_TOPICS.push({
  id: 'editeur-contact', categorie: 'etablissement', titre: 'Contacter l’éditeur (assistance, licences, maintenance)',
  description: 'GEST SCHOOL SCOLARITÉ est conçu et développé par la SOCIÉTÉ KJS GROUP SARL (solutions numériques, réseaux & systèmes, formation). Contactez-la pour l’assistance, la maintenance, les évolutions et les clés de licence.',
  motsCles: ['editeur', 'kjs', 'kjs group', 'contact', 'assistance', 'support', 'maintenance', 'telephone', 'email', 'developpeur', 'a propos', 'licence achat'],
  chemin: ['Centre d’aide', 'Éditeur du logiciel'], page: 'aide', focus: '#aide-editeur', roles: ALL,
  etapes: ['Ouvrez « Paramètres › Centre d’aide » : la fiche « Éditeur du logiciel » figure en bas de la page.', 'Écrivez à kjsgroup2025@gmail.com ou appelez le +224 664-33-33-66 en précisant le nom de votre établissement.'],
  prerequis: [],
  resultat: 'L’éditeur vous répond pour l’assistance, la maintenance, les évolutions ou de nouvelles clés de licence.',
  erreurs: []
});

UNAVAILABLE.push({ id: 'sms', label: 'Envoi de SMS ou de messages aux parents', motsCles: ['sms', 'whatsapp', 'envoyer message', 'notification parent', 'mail automatique', 'rappel sms'], alternative: 'creances-relances' });


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
// Les premiers éléments saisis qui désignent déjà une rubrique ou une page (anciens noms compris) ne sont pas répétés.
const LIBELLES_MENU = new Set([...NAV_GROUPS.flatMap((g) => [g.label, ...g.pages.map(([, l]) => l)]), 'Administration', 'Paiements & dépenses', 'Scolarité', 'Élèves', 'Rapports', 'Dépenses et caisse']);
HELP_TOPICS.forEach((topic) => {
  if (!topic.page) return;
  const reste = topic.chemin.slice(1);
  while (reste.length && LIBELLES_MENU.has(reste[0])) reste.shift();
  topic.chemin = [...pagePath(topic.page), ...reste];
});
