# GEST SCHOOL SCOLARITÉ — Guide d’utilisation

Ce guide s’adresse aux établissements qui utilisent l’application : direction, comptabilité, caisse et audit. L’aide détaillée de chaque écran est aussi intégrée (bouton **?** en haut de chaque page, ou *Paramètres › Centre d’aide*).

## 1. Installation et première configuration

**Deux façons d’utiliser l’application**
- **Application de bureau Windows (recommandée)** : lancez `GEST-SCHOOL-SCOLARITE-4.2.0-installation.exe`. L’installateur propose un dossier d’installation, puis crée un raccourci sur le bureau et dans le menu Démarrer, avec l’icône GEST SCHOOL. La version `…-portable.exe` s’exécute sans installation, par exemple depuis une clé USB. Ni navigateur ni connexion Internet ne sont nécessaires.
- **Version navigateur** : ouvrez `index.html` avec Google Chrome ou Microsoft Edge.

À la première ouverture de l’installateur, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » : le fichier n’est pas encore signé par un certificat de signature de code. Cliquez sur « Informations complémentaires », puis sur « Exécuter quand même », uniquement si le fichier provient bien de l’éditeur.

**Où sont les données ?** L’application de bureau conserve sa base de travail dans le profil Windows de l’utilisateur (`%APPDATA%\GEST SCHOOL SCOLARITÉ`), plus le fichier de données lié. Ses données sont **distinctes** de celles de la version navigateur. Pour passer de l’une à l’autre :
1. dans l’ancienne version, faites *Sauvegardes et restauration › Sauvegarde complète* ;
2. dans la nouvelle version, créez le super administrateur, puis *Restaurer…* ce fichier.

**Prérequis**
- Un ordinateur sous Windows 10 ou 11 (64 bits).
- Les clés de licence, fournies par l’éditeur.

**Étapes**
1. Installez et lancez l’application de bureau (ou ouvrez `index.html` dans Chrome ou Edge).
2. Créez le compte **super administrateur de l’établissement** (identifiant et mot de passe d’au moins 8 caractères, avec lettres et chiffres). Conservez-les précieusement : aucun mot de passe n’est récupérable.
3. Choisissez le dossier du **fichier de données** proposé à la première ouverture. L’application y enregistre automatiquement `GESTSCHOOL-SCOLARITE-donnees.note` après chaque opération.
4. Suivez la **mise en route** du tableau de bord :
   1. Établissement : *Paramètres › Établissement* (nom, sigle, devise, coordonnées, logo, en-tête des documents).
   2. Comptes financiers et catégories : *Paramètres › Paramètres financiers* (caisse, banque, Mobile Money, soldes d’ouverture).
   3. Année scolaire : *Tarifs et scolarité › Années scolaires*. **Une clé de licence est obligatoire pour chaque nouvelle année.**
   4. Classes, puis tarifs de chaque classe (tranches, mensualités, frais d’inscription, frais annexes, remise maximale).
   5. Élèves et inscriptions.
5. Créez les comptes de l’équipe dans *Utilisateurs et permissions*, avec le rôle adapté à chacun (voir la section 3).

**Utilisation des formulaires.** Chaque formulaire de saisie est rangé derrière un bouton orange « ＋ … », par exemple « ＋ Enregistrer un paiement ». Cliquez sur ce bouton pour l’ouvrir, et sur « ✕ » pour le refermer. Le formulaire s’ouvre aussi tout seul lorsque vous modifiez un élément ou passez à l’étape suivante.

**Barre latérale.** Le bouton « « » en haut de la barre la réduit aux seules icônes ; un survol affiche alors le nom de chaque rubrique, et « » » la déploie à nouveau. Ce choix est mémorisé sur le poste. En bas de la barre, la carte de l’utilisateur connecté porte le bouton de déconnexion (flèche de sortie). La sauvegarde et la restauration ne se font que dans la rubrique *Sauvegardes et restauration*.

## 2. Opérations courantes

| Je veux… | Où | À savoir |
|---|---|---|
| Encaisser un paiement | *Paiements › Encaissements* | Recherchez l’élève (nom ou matricule), choisissez tranches ou mensuel, saisissez le montant. Le reçu A4 (exemplaire élève + exemplaire comptabilité) s’affiche aussitôt. Un montant supérieur au solde est refusé. |
| Enregistrer un chèque non encore crédité | Même formulaire, case « En attente de confirmation » | Exclu des totaux jusqu’à « Confirmer l’encaissement » (le reçu est alors émis) ou « Rejeter » (avec motif). |
| Corriger ou annuler un paiement | *Journal des paiements* › Corriger / Annuler | Motif obligatoire, historique conservé. Une erreur de montant ou d’élève se corrige par une annulation suivie d’un nouveau paiement. |
| Réimprimer un reçu | *Journal des paiements* › Reçu | Imprimé comme **duplicata**, sans créer de nouveau paiement. |
| Accorder une remise ou une bourse | *Élèves et inscriptions › Inscriptions* › Réduction | La remise est plafonnée par le tarif ; la bourse et l’exonération demandent un administrateur. |
| Suivre les impayés, imprimer les relances | *Dettes et impayés › Créances et relances* | État de recouvrement et lettres de relance à imprimer (aucun SMS n’est envoyé). |
| Saisir une dépense | *Dépenses* | Compte payeur, pièce justificative (image ou PDF de 300 Ko au plus), dépenses récurrentes. |
| Ouvrir et fermer la caisse | *Caisse et trésorerie › Caisse* | Voir la section 4. |
| Déposer la caisse en banque | *Caisse et trésorerie › Comptes et virements* | Un virement interne ne crée ni recette ni dépense. |
| Obtenir un rapport | *Comptabilité et rapports › États financiers* | 15 états, avec filtres et exports PDF, Excel et CSV (journalisés). |

**Recherche rapide** (en haut de chaque page) : tapez un nom, un matricule ou un numéro de reçu. Vous ouvrez directement la fiche de l’élève, son encaissement ou le reçu.

## 3. Rôles et sécurité

| Rôle | Peut |
|---|---|
| Super administrateur | Tout, plus les comptes, rôles, sauvegardes, restaurations, réinitialisation et la page Licence. |
| Administrateur de l’établissement | Tout, sauf les opérations système réservées au super administrateur. |
| Directeur | Pilotage et décisions d’exception : annulations, corrections, bourses, réouverture de caisse. |
| Comptable | Scolarité, tarifs, encaissements, dépenses, trésorerie, paie et rapports. Les exceptions demandent l’accord d’un administrateur. |
| Caissier | Encaissements, caisse et dépenses courantes. Ne modifie ni les tarifs ni les historiques. |
| Auditeur | Lecture seule : états, exports et journal d’audit. |

- Les droits sont vérifiés par l’application à chaque opération, pas seulement par l’affichage des boutons. Une action d’exception non accordée au rôle reste possible avec les identifiants d’un administrateur, et elle est journalisée.
- Chacun ne gère que les comptes qu’il a créés, directement ou par délégation.
- Cinq mots de passe erronés bloquent l’identifiant concerné pendant une minute, sans bloquer les autres comptes.
- **Compte de l’éditeur** : l’éditeur du logiciel dispose d’un compte de maintenance, présent dans toute installation et visible dans la liste des utilisateurs (« Éditeur du logiciel »). Il gère le catalogue des clés de licence. Il ne peut être ni supprimé ni désactivé, et chacune de ses connexions est inscrite au journal d’audit.

## 4. Caisse : ouverture, comptage, clôture

1. **Ouvrir** : *Caisse › ＋ Ouvrir une caisse*. Comptez le fond de caisse ; s’il diffère du solde théorique de la veille, justifiez l’écart.
2. Pendant la journée, les encaissements et dépenses en espèces s’imputent sur la caisse.
3. **Fermer** : *＋ Compter et fermer la caisse*. Saisissez le montant réellement compté : l’écart avec le solde théorique s’affiche en direct, et tout écart doit être justifié. Le procès-verbal de clôture s’imprime.
4. Une journée fermée **verrouille** les opérations de cette caisse jusqu’à cette date. Pour corriger, un responsable rouvre la **dernière** journée (motif obligatoire, tracé), corrige, puis referme.
5. Comptes bancaires : saisissez le solde du relevé dans *Rapprochement bancaire* ; l’écart doit être justifié.
6. Option (*Caisse › Option : caisse obligatoire*) : elle interdit toute opération sur une caisse non ouverte.

## 5. Sauvegarde et restauration

**Sauvegarder** (*Sauvegardes et restauration*)
- **Sauvegarde complète** : toutes les données, historiques et références, dans une archive `.note` qui porte le format, la version et une empreinte de contrôle SHA-256.
- **Paramètres seuls** : identité, en-tête, catégories, règles, comptes et référentiels.
- Le fichier de données lié est enregistré automatiquement après chaque opération. Des copies de sécurité sont créées automatiquement avant chaque import, restauration ou réinitialisation.
- **Recommandation** : une sauvegarde complète par semaine, copiée sur une clé USB ou un disque externe.

**Restaurer** (super administrateur) : *Restaurer…* puis choisissez le fichier. L’application contrôle successivement :
- la lisibilité du fichier ;
- son intégrité (un fichier modifié est refusé) ;
- sa version (un fichier d’une version plus récente est refusé) ;
- sa structure ;
- l’établissement d’origine (demande d’accord explicite s’il s’agit d’un autre établissement) ;
- les doublons (un fichier identique aux données actuelles n’est pas restauré).

La restauration demande le mot de passe et le mot RESTAURER. Une copie de sécurité des données actuelles est créée juste avant.

**Récupération après une erreur**
1. Ne saisissez plus rien.
2. Erreur ponctuelle : annulez l’opération avec un motif.
3. Erreur massive : restaurez la copie de sécurité créée juste avant l’opération, ou une sauvegarde datée du dossier `sauvegardes`.
4. Vérifiez ensuite le tableau de bord et le journal d’audit.

**Risques du stockage dans le navigateur.** Ces actions effacent la base de travail du poste :
- effacer les données de navigation ;
- réinitialiser ou changer le profil Windows ou le navigateur ;
- une corruption du stockage local.

Le fichier de données lié et les sauvegardes externes permettent alors de tout restaurer.

## 6. Réinitialisation (super administrateur)

*Sauvegardes et restauration › Réinitialiser toutes les données* efface **toutes** les données :
- l’établissement et ses paramètres ;
- les comptes financiers et les catégories ;
- les années, classes, tarifs et élèves ;
- les paiements, dépenses, opérations de caisse, la paie et le journal.

Elle **supprime aussi tous les comptes utilisateurs, sauf les super administrateurs** (et le compte de l’éditeur). Les comptes ne figurent pas dans les sauvegardes : une fois supprimés, ils ne sont pas récupérables par une restauration.

Sont conservés : les super administrateurs, les rôles, le lien vers le fichier de données, et l’enregistrement des clés de licence déjà utilisées (une réinitialisation ne libère jamais une licence).

Avant l’effacement, une copie de sécurité et un fichier de sauvegarde des données sont créés automatiquement. Le mot de passe et le mot RÉINITIALISER sont exigés.

## 7. Mise à jour du logiciel sans perte de données

**Version 4.2 et suivantes, reliées au portail de l’éditeur** :
- Une fois la licence en ligne activée (indicateur de la barre du haut), les nouvelles versions publiées par l’éditeur sont proposées automatiquement.
- Avant l’installation, une sauvegarde complète vérifiée est faite dans `%APPDATA%\GEST SCHOOL SCOLARITÉ\sauvegardes-mise-a-jour`.
- L’application redémarre ensuite, avec les mêmes données et la même licence.
- Une mise à jour facultative peut être différée de 24 heures ; une mise à jour obligatoire, non.

**Depuis la version 4.1.0** : installez une fois la version 4.2.0 à la main (voir ci-dessous). Les mises à jour suivantes seront automatiques.


**Application de bureau** : faites une sauvegarde complète, puis lancez le nouvel installateur. Il remplace le programme sans toucher aux données du profil Windows ni au fichier de données.

**Version navigateur** :

1. Faites une **sauvegarde complète** et vérifiez que le fichier est bien téléchargé.
2. Fermez l’application.
3. Remplacez les fichiers de l’application (`index.html`, `style.css`, dossiers `application/`, `assets/`, `modules/` et fichiers `.js`) par ceux de la nouvelle version. **Ne supprimez pas** le fichier de données ni le dossier `sauvegardes`.
4. Rouvrez `index.html` avec le **même navigateur et le même profil** : les données existantes sont relues et mises à niveau automatiquement, sans rien effacer.
5. Vérifiez le tableau de bord. En cas de doute, restaurez la sauvegarde faite à l’étape 1.

## 8. Limites

- **Un seul poste à la fois** : il n’existe aucune synchronisation entre ordinateurs.
- Les données ne sont pas chiffrées : protégez la session Windows par un mot de passe et activez le verrouillage automatique.
- Les états financiers sont des outils de gestion de trésorerie et de recouvrement. Ce n’est pas une comptabilité générale, et aucune conformité comptable ou fiscale n’est revendiquée.
