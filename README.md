# GEST SCHOOL SCOLARITÉ — Gestion financière des établissements scolaires

Application web autonome (HTML, CSS, JavaScript) : **aucun serveur, aucune installation, aucune connexion Internet requise**.
Elle couvre la scolarité côté finances : tarifs, inscriptions, encaissements, créances, dépenses, caisse et trésorerie, états financiers, paie du personnel, utilisateurs et permissions, licences, sauvegardes.

Le logiciel est livré **vierge** : aucun élève, aucune classe, aucun tarif, aucun paiement, aucune identité d’établissement. Seul le compte de maintenance de l’éditeur est présent ; l’établissement crée son propre super administrateur au premier lancement.

- Mode d’emploi complet (première configuration, opérations, caisse, sauvegarde et restauration, mise à jour) : [GUIDE-UTILISATEUR.md](GUIDE-UTILISATEUR.md).

Conçu et développé par **SOCIÉTÉ KJS GROUP SARL** — *Solutions numériques • Réseaux & systèmes • Formation* — kjsgroup2025@gmail.com — +224 664-33-33-66.
- Audit, sécurité et limites : [AUDIT-ET-SECURITE.md](AUDIT-ET-SECURITE.md).
- Résultats des tests : [RESULTATS-TESTS.md](RESULTATS-TESTS.md).

## Fonctionnalités disponibles (vérifiées par les tests)

| Rubrique | Contenu |
|---|---|
| Tableau de bord | Attendu, encaissé, reste, taux de recouvrement, créances en retard, échéances proches, factures impayées, prévu / réalisé, recettes et dépenses du jour, soldes des comptes, règlements en attente, évolution, répartitions par moyen et par agent, résultats par année et par classe ; filtres année, catégorie, classe, élève, période, moyen, agent. |
| Élèves et inscriptions | Dossiers, familles, inscriptions et réinscriptions, réductions (remise, bourse, exonération). |
| Tarifs et scolarité | Tarifs par classe et par année (tranches, mensualités, frais d’inscription de la classe, frais annexes, remise maximale), historisés et jamais rétroactifs ; années (clé de licence), classes. |
| Paiements | Encaissement guidé, imputation automatique, refus de l’excédent, anti-doublon, règlements en attente, correction et annulation tracées, reçu A4 en deux exemplaires, duplicata. |
| Dettes et impayés | Créances (retards, ancienneté, réductions), états par classe et par année, lettres de relance imprimables, dettes antérieures. |
| Dépenses | Compte payeur, catégories configurables, pièces justificatives, dépenses récurrentes, correction et annulation tracées. |
| Caisse et trésorerie | Comptes (caisse, banque, Mobile Money), virements internes, ouverture et fermeture de caisse avec comptage, écart justifié, verrou des journées clôturées, réouverture tracée, procès-verbal, journal quotidien, rapprochement bancaire. |
| Comptabilité et rapports | 15 états financiers (recouvrement, débiteurs, retards, réductions, recettes par période, par agent et par mode, dépenses par catégorie, journal de caisse, trésorerie, clôtures, comparaison des années, budget prévu / réalisé, annulations et corrections, historique) ; exports PDF, Excel et CSV ; rapports et rappels. |
| Paie du personnel | Personnel, affectations, paie mensuelle, avances, bulletins. |
| Utilisateurs et permissions | Six rôles (Super administrateur, Administrateur, Directeur, Comptable, Caissier, Auditeur) et des permissions par action vérifiées dans la couche métier ; hiérarchie des comptes ; journal d’audit (avant / après). |
| Paramètres | Établissement et en-tête, comptes et catégories, règles financières, arrondis, licence, centre d’aide. |
| Sauvegardes et restauration | Archives vérifiables (empreinte SHA-256, version de format), paramètres seuls, restauration encadrée, copies de sécurité, fichier de données lié. |

Les formulaires de saisie sont rangés derrière des boutons « ＋ … » et s’ouvrent à la demande. La barre latérale est rétractable (icônes seules, préférence mémorisée) et se termine par une carte utilisateur. La sauvegarde et la restauration se font uniquement dans la rubrique *Sauvegardes et restauration*.

**Réinitialisation (super administrateur)** : elle efface toutes les données, paramètres compris, et supprime tous les comptes utilisateurs **sauf les super administrateurs** (et le compte de l’éditeur). Les licences déjà utilisées restent utilisées.

## Application de bureau Windows (Electron)

- **Pour l’utilisateur** : `dist/GEST-SCHOOL-SCOLARITE-4.2.0-installation.exe` (installateur avec raccourcis) ou `dist/GEST-SCHOOL-SCOLARITE-4.2.0-portable.exe` (sans installation). L’icône de l’application est l’emblème GEST SCHOOL.
- **Pour construire** : `npm install`, puis `npm run dist`. Le script génère `application/`, l’icône `build/icon.ico`, puis les deux exécutables dans `dist/`. Pour tester sans construire : `npm start`.
- **Sécurité de la fenêtre** :
  - aucun accès Node.js pour la page (`contextIsolation`, `sandbox`) ;
  - navigation verrouillée, liens externes ouverts dans le système ;
  - permissions refusées, sauf l’accès au dossier de données ;
  - une seule instance ;
  - outils de développement et débogage à distance désactivés dans la version installée ;
  - fusibles Electron : l’exécutable ne peut pas servir d’interpréteur Node.js, et l’intégrité de `app.asar` est vérifiée ;
  - politique de sécurité du contenu (CSP) sans script en ligne ni ressource distante.
- Versions figées : Electron 44.6.0, electron-builder 26.15.3.
- Les exécutables ne sont pas signés (certificat de signature de code de l’éditeur à acquérir) : Windows SmartScreen affiche un avertissement à la première ouverture.

## Licence en ligne, synchronisation et mises à jour (version 4.2)

- L’application est gérée depuis le **portail KJS GROUP** (projet Firebase `gestion-school-58746`), comme GEST SCHOOL. Le produit est `gestscolarite`, avec des clés `GSS-…`.
- **Activation** : indicateur de la barre du haut → « Licence, synchronisation et mises à jour » → saisir la clé (super administrateur). Un poste non activé fonctionne comme avant (mode local).
- **Envoyé au serveur** : métadonnées techniques et erreurs. Statistiques globales (nombres d’élèves, de classes, d’années) seulement avec l’accord du contrat **et** de l’établissement. **Jamais** les élèves, les paiements, les montants ni les documents.
- **Mises à jour automatiques** (installateur NSIS) : seule une version publiée dans le portail est installée, après une sauvegarde complète vérifiée (même format que « Sauvegarde complète »).
- **Publication** : `npm run dist`, puis `npm run publier`, puis déploiement de l’hébergement, puis « Publier une version » dans le portail. Procédure complète : `Documents\IBK SCHOOL\plateforme\GUIDE-MISE-EN-SERVICE.md`.
- **Code** :
  - `electron/cloud/` et `electron/preload.js` sont identiques à ceux de GEST SCHOOL ;
  - `electron/cloud-config.json` contient les adresses du service et la clé publique (aucun secret) ;
  - `modules/cloud.js` est l’interface (sans script en ligne, compatible avec la CSP stricte).

## Démarrage

1. Lancez l’application de bureau, ou ouvrez `index.html` avec **Google Chrome** ou **Microsoft Edge**.
2. Créez le compte **super administrateur** de l’établissement.
3. Choisissez le dossier du fichier de données (`GESTSCHOOL-SCOLARITE-donnees.note`).
4. Suivez la mise en route : établissement, comptes, année scolaire (**clé de licence**), classes, tarifs, élèves.

## Contenu du dossier

| Élément | Rôle |
|---|---|
| `index.html`, `style.css` | Page et styles |
| `electron/main.js`, `package.json` | Application de bureau Windows (Electron) et configuration de construction |
| `build/` | Icône Windows (`icon.ico`) et son script de génération |
| `dist/` | Exécutables générés (non versionnés) |
| `application/` | Application prête à l’emploi (13 fichiers **générés**, chargés sans serveur) |
| `app.js`, `ui.js`, `storage.js`, `modules/` | Sources |
| `build-offline.js` | Génère `application/` : `node build-offline.js` |
| `assets/` | Logo et icônes GEST SCHOOL |
| `tests/` | Tests automatiques (`node tests/tout.mjs`) et données de démonstration **réservées aux tests** |
| `archives/client-ibk/` | Ancienne documentation et logo de la version IBK (non utilisés) |

## Développement et tests

- Modifiez les sources, puis lancez `node build-offline.js`.
- Lancez `node tests/tout.mjs` : 9 suites unitaires et un scénario de bout en bout dans Chrome ou Edge sans fenêtre.
- Aucune dépendance externe (ni bibliothèque, ni CDN, ni `package.json`) : il n’y a pas de dépendance à mettre à jour. Le projet utilise Node.js 18 ou plus récent pour la construction et les tests uniquement.
- Le chargeur généré ne prend en charge ni les imports circulaires ni `import { a as b }`.

## Limites connues

- **Un seul poste à la fois** : les données restent dans le navigateur du poste, plus le fichier lié, sans aucune synchronisation entre postes.
- **Sécurité côté navigateur uniquement** : les contrôles protègent l’usage normal, mais une personne qui a accès à la session Windows et aux outils du navigateur peut lire ou modifier les données. Les données ne sont pas chiffrées.
- **Aucun envoi de SMS ni de message** : les relances sont à imprimer.
- **Pas de comptabilité générale** (ni plan comptable, ni partie double) ; aucune conformité comptable ou fiscale n’est revendiquée.
- Les clés de stockage internes conservent le préfixe historique `ibk_`, pour relire les données existantes sans perte.
