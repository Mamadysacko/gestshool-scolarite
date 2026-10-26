# GEST SCHOOL SCOLARITÉ — Audit, corrections et sécurité

Audit réalisé les 22 et 23/10/2026 sur la version « scolarite ibk », suivi des corrections et des évolutions décrites ci-dessous. Chaque point est vérifié par des tests automatiques : voir [RESULTATS-TESTS.md](RESULTATS-TESTS.md).

## 1. Architecture

- Application 100 % navigateur. Les sources sont en modules ES (`app.js`, `modules/*.js`) ; `build-offline.js` les regroupe en 13 fichiers chargés sans serveur (`application/`).
- **Persistance** :
  - état complet dans `localStorage` (`ibk_school_premium_v1`) ;
  - fichier de données lié, réécrit après chaque opération (Chrome et Edge) ;
  - copies de sécurité locales ;
  - archives de sauvegarde vérifiables ;
  - registres de licences conservés après une réinitialisation.
- **Comptes et rôles** : stockés à part (`ibk_users_v1`, `ibk_roles_v1`), jamais exportés ni effacés par une réinitialisation.
- **Dépendances** : aucune. Il n’y a donc rien à mettre à jour.

## 2. Problèmes relevés et corrigés

| # | Problème | Correction |
|---|---|---|
| 1 | Données fictives (établissement IBK, élèves, classes, tarifs, paiements) dans toute installation neuve | Base livrée vierge ; données de démonstration réservées aux tests |
| 2 | Identité IBK codée en dur (en-tête, Guinée/Conakry, logo, matricules, nom de fichier) | Tout est configurable ; ancien fichier `IBK-donnees.note` toujours relu |
| 3 | **Faille XSS stockée** dans le journal des paiements | Échappement systématique ; contrôle automatique des vues |
| 4 | Modification de tarif rétroactive pour les élèves ayant déjà payé | Engagement conservé ; réalignement des seuls élèves sans paiement, sur demande ; versions historisées |
| 5 | Duplication de tarif créant un doublon classe / année | Reprise vers la classe de même nom de l’année active, sans doublon |
| 6 | Pièces justificatives et imports non contrôlés | Types limités (images, PDF) ; structure, version et intégrité vérifiées avant toute restauration |
| 7 | Droits fondés seulement sur l’affichage des pages et deux cases (saisie, export) | **Permissions par action vérifiées dans la couche métier** (`exiger()`), six rôles |
| 8 | Connexions refusées et refus d’autorisation non journalisés ; verrou global (un attaquant pouvait bloquer tous les comptes) | Journal de sécurité ; verrouillage **par identifiant** et plafond global |
| 9 | Pas de clôture de caisse ; opérations passées modifiables sans trace | Journées de caisse : comptage, écart justifié, verrou, réouverture motivée de la dernière journée seulement |
| 10 | Export CSV vulnérable à l’injection de formules (`=`, `+`, `-`, `@`) | Cellules neutralisées |
| 11 | Calcul des chemins de l’aide qui répétait la page (« Établissement › Établissement ») | Calcul corrigé |
| 12 | Libellés d’export « Administration » obsolètes, catégories figées | Libellés mis à jour, catégories configurables |
| 13 | Réinitialisation partielle : paramètres et comptes utilisateurs conservés | Réinitialisation **complète** (super administrateur) : toutes les données et tous les comptes supprimés, sauf les super administrateurs et le compte de l’éditeur ; seuls l’identifiant d’établissement et les licences déjà utilisées sont conservés |
| 14 | Boutons de sauvegarde et de restauration dans la barre latérale | Retirés : ces opérations se font uniquement dans *Sauvegardes et restauration* |
| 15 | Aucune politique de sécurité du contenu ; gestionnaire `onerror` en ligne sur le logo | Politique CSP ajoutée à `index.html` : aucun script en ligne, aucune ressource distante, aucun formulaire externe ni cadre. Gestionnaire en ligne supprimé |

## 3. Fonctions ajoutées

- **Partie 1** :
  - comptes financiers et virements internes ;
  - règlements en attente ;
  - correction de paiement ;
  - réductions, bourses et exonérations ;
  - frais annexes ;
  - dépenses récurrentes ;
  - créances et relances ;
  - tableau de bord financier complet.
- **Partie 2** :
  - caisse (ouverture, fermeture, écarts, verrou, procès-verbal, journal quotidien, rapprochement bancaire) ;
  - 15 états financiers avec filtres et exports ;
  - budget prévisionnel et réalisé ;
  - reçus A4 en deux exemplaires et duplicata ;
  - six rôles et permissions par action ;
  - hiérarchie des comptes ;
  - journal d’audit avec valeurs avant et après ;
  - archives de sauvegarde vérifiables et restauration encadrée ;
  - navigation en douze rubriques ;
  - recherche rapide ;
  - formulaires repliés derrière des boutons.
- **Licences et compte de l’éditeur**, sur le modèle de GEST SCHOOL (sections 4 et 5).
- **Application de bureau Windows** (Electron 44.6.0), avec installateur NSIS et version portable. Réglages de sécurité :
  - `contextIsolation`, `sandbox`, `nodeIntegration` désactivé, aucun script de préchargement : la page n’a aucun accès à Node.js ;
  - navigation hors de l’application et ouverture de fenêtres bloquées ; liens `mailto:` et `https:` confiés au système ;
  - toutes les permissions refusées, sauf l’accès au fichier de données et la copie dans le presse-papiers ;
  - une seule instance à la fois, ce qui évite deux écritures concurrentes ;
  - outils de développement et débogage à distance désactivés dans la version installée ;
  - fusibles Electron : exécution en Node.js (`ELECTRON_RUN_AS_NODE`), `NODE_OPTIONS` et `--inspect` désactivés ; application chargée uniquement depuis l’archive `app.asar`, dont l’intégrité est vérifiée au démarrage.
- **Identité de l’éditeur** : fiche SOCIÉTÉ KJS GROUP SARL dans le centre d’aide, mention sur l’écran de connexion et boîte « À propos ».

## 4. Compte de l’éditeur (propriétaire)

Le compte `makossagesshool` est présent dans toute installation, comme le compte propriétaire de GEST SCHOOL :
- super administrateur et racine de la hiérarchie des comptes ;
- seul habilité à gérer le catalogue des clés de licence ;
- ne peut être ni supprimé, ni désactivé, ni rétrogradé ; seul lui-même peut changer son mot de passe ;
- son mot de passe **n’est pas écrit en clair** dans le logiciel, seulement son empreinte (SHA-256 salé, 2 000 itérations) ;
- chacune de ses connexions est inscrite au journal d’audit, et il est signalé « Éditeur du logiciel » dans la liste des utilisateurs.

**Points d’attention, à assumer contractuellement** :
- Ce compte donne à l’éditeur un accès complet à toutes les installations : il doit être **mentionné aux établissements**, dans le contrat ou les conditions d’utilisation.
- Le même mot de passe vaut pour toutes les installations. Toute personne qui le connaît accède à toutes les bases. Il ne doit jamais être communiqué, et doit être changé si une fuite est soupçonnée. Changer l’empreinte dans `modules/auth.js` ne vaut que pour les nouvelles installations ; le propriétaire peut aussi changer son mot de passe dans chaque installation.
- L’identifiant demandé, `makossagesshool`, diffère de celui de GEST SCHOOL (`makossagestshool`, avec un « t »).

## 5. Licences

Le mécanisme reprend celui de GEST SCHOOL :
- chaque nouvelle année scolaire consomme une clé, une seule fois ;
- 10 clés d’origine, dont seules les empreintes (SHA-256 avec un poivre propre à ce logiciel, 2 000 itérations) figurent dans le code ;
- un catalogue géré par le propriétaire : ajout d’une clé saisie ou générée, affichée une seule fois ; modification ; désactivation réversible ; révocation définitive ; suppression avec archive et liste noire ;
- des registres conservés après une réinitialisation ou la restauration d’une ancienne sauvegarde (une clé utilisée le reste).

Les 10 clés d’origine ont été remises à l’éditeur dans un fichier confidentiel **hors du dossier de l’application**.

**Limite.** Comme tout contrôle exécuté dans le navigateur, une personne techniquement compétente qui dispose des outils de développement du navigateur peut contourner le contrôle de licence. Celui-ci protège l’usage normal et commercial, pas une attaque délibérée. Une protection forte exigerait une activation par un serveur de l’éditeur.

## 6. Comparaison avec GEST SCHOOL

| Mécanisme de GEST SCHOOL | GEST SCHOOL SCOLARITÉ |
|---|---|
| Mots de passe SHA-256 salés et itérés (500 itérations) | Repris, **2 000 itérations** |
| Compte propriétaire intégré (empreinte uniquement) | **Repris** (section 4) |
| Licences : clés en empreintes, consommation par année, catalogue du propriétaire, liste noire, registres persistants | **Repris** (section 5) |
| Permissions détaillées par module et par action, contrôlées dans la couche de données | **Repris** : 14 permissions d’action, contrôle `exiger()` dans les fonctions métier |
| Hiérarchie des comptes (gestion des seuls subordonnés), anti-élévation | **Repris** |
| Journal des refus, connexions échouées et opérations sensibles | **Repris**, avec valeurs avant et après |
| Base vierge, mise en route, remise à zéro réservée, mise à jour sans perte | **Repris** |
| Sauvegardes vérifiées par empreinte | **Repris** pour les archives exportées ; les copies de sécurité locales restent dans `localStorage` |
| Copies durables dans IndexedDB | Non repris (recommandation ci-dessous) |

## 7. Limites de sécurité (à communiquer aux clients)

- **Aucun serveur** : les contrôles s’exécutent dans le navigateur (ou dans la fenêtre de l’application de bureau, qui embarque le même moteur).
- Les exécutables **ne sont pas signés** : un certificat de signature de code au nom de l’éditeur est recommandé avant la diffusion commerciale (sinon Windows SmartScreen affiche un avertissement). Ils empêchent un utilisateur de dépasser ses droits par l’interface, mais une personne qui a accès à la session Windows et aux outils du navigateur peut lire ou modifier les données.
- Les données **ne sont pas chiffrées**. Protégez le poste : session nominative, verrouillage automatique, chiffrement du disque, sauvegardes externes.
- Le journal d’audit est fiable pour la traçabilité courante, mais pas infalsifiable.
- **Un seul poste à la fois** : aucune synchronisation.
- `localStorage` est limité à environ 5 Mo par navigateur. Les pièces justificatives et les copies de sécurité y prennent de la place. Le fichier lié et les archives externes n’ont pas cette limite.
- **Risques de perte** : effacement des données de navigation, changement de profil ou de navigateur, corruption du stockage local. D’où le fichier lié et les sauvegardes régulières sur un support externe.

## 8. Problèmes restants et recommandations

1. Déplacer les copies de sécurité et les pièces justificatives vers IndexedDB (lever la limite de `localStorage`).
2. Activation des licences par un serveur de l’éditeur, si une protection forte est nécessaire.
3. Une véritable architecture serveur, si le travail **multi-postes** devient un besoin.
4. Un service SMS ou de messagerie, avant d’annoncer des relances automatiques.
5. Une comptabilité générale (plan comptable, partie double), si elle est attendue, après vérification du référentiel applicable : elle n’est pas incluse.

## 9. Mise à jour d’une installation existante (établissement IBK)

- Toutes les données sont conservées : élèves, inscriptions, paiements, dépenses, paie, journal, comptes et rôles.
- Le plus ancien administrateur est promu super administrateur, et les comptes sont rattachés à la hiérarchie.
- L’en-tête et le logo, autrefois intégrés au code, doivent être ressaisis une fois (*Paramètres › Établissement* ; logo dans `archives/client-ibk/`).
- La **prochaine** année scolaire demandera une clé de licence. Les années existantes ne sont pas affectées.
