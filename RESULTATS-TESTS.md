# GEST SCHOOL SCOLARITÉ — Résultats des tests

Exécution du 23/10/2026 (`node tests/tout.mjs`, Node.js 22, Chrome sans fenêtre pour le test de bout en bout). Toutes les données de test sont isolées : stockage simulé en mémoire pour les tests unitaires, profil de navigateur temporaire pour le test de bout en bout. Aucune donnée réelle n’est touchée.

```
OK   run        27 tests passés
OK   finances   17 tests financiers passés
OK   tresorerie 17 tests de trésorerie, états, sauvegardes et permissions passés
OK   licences   10 tests de licences et du compte propriétaire passés
OK   analyse     5 tests d’analyse passés
OK   annee       9 tests années, passage, contacts et comptabilité passés
OK   aide        8 tests du centre d’aide passés
OK   paie       19 tests de paie passés
OK   roles       9 tests des rôles passés
OK   e2e        49 étapes e2e réussies
Toutes les suites sont passées
```

**Total : 121 tests unitaires et d’intégration, et 49 étapes de parcours fonctionnel dans un vrai navigateur.** Aucun test n’a été désactivé.

## Application de bureau (Electron)

Contrôles effectués sur l’exécutable construit (`dist/win-unpacked/GEST-SCHOOL-SCOLARITE.exe`, identique au contenu des deux exe), avec un profil temporaire :

| Contrôle | Résultat |
|---|---|
| Démarrage, fenêtre « GEST SCHOOL SCOLARITÉ », écran de premier lancement, mention de l’éditeur | Conforme, aucune erreur dans la page |
| La page n’a pas accès à Node.js (`require`, `process` absents) ; politique CSP présente | Conforme |
| Contenu empaqueté : page, styles, 13 scripts, images, processus principal | Aucun test, module source, document ni fichier de données inclus |
| Icône des trois exécutables, informations de version (produit, éditeur, copyright) | Emblème GEST SCHOOL ; SOCIÉTÉ KJS GROUP SARL, version 4.1.0 |
| Lancement avec `--remote-debugging-port` | Refusé : l’application se ferme, port fermé |
| `ELECTRON_RUN_AS_NODE=1` (détournement en interpréteur Node.js) | Sans effet (fusible désactivé) |
| Signature numérique | **Absente** (aucun certificat de signature de code disponible) |

Non testé automatiquement : l’installation par l’installateur NSIS sur un autre poste (à faire manuellement avant diffusion).

## Couverture des exigences

| Exigence | Vérifiée par |
|---|---|
| Paiement complet, partiel, plusieurs paiements pour un élève | `tresorerie` (paiements : complet, partiel, plusieurs…) ; `run` ; e2e (imputation sur plusieurs tranches) |
| Tranches et mensualités | `tresorerie`, `run`, `finances` (changement de modalité), e2e |
| Prévention des doublons | `tresorerie` (jeton, doublon à 2 minutes) ; e2e (double soumission) |
| Annulation et correction | `finances` (correction contrôlée), `tresorerie`, e2e (correction, annulation) |
| Solde restant = attendu − règlements valides (réductions et exonérations comprises) | `tresorerie` (invariant vérifié sur chaque inscription) ; `finances` (réductions) |
| Totaux par période = transactions valides ; annulées exclues | `tresorerie` (recettes par jour) ; `finances` (dépense annulée) |
| Virements sans effet sur les recettes et dépenses globales | `tresorerie`, `finances` |
| Clôtures de caisse = mouvements enregistrés | `tresorerie` (ouverture, comptage, écart, verrou, réouverture) ; e2e (ouverture, fermeture, verrou depuis l’interface) |
| Filtres par classe, année, date, agent, mode | `tresorerie` (états) ; `finances` (tableau de bord) ; e2e |
| Cohérence paiements / reçus / rapports ; réimpression sans nouveau paiement | `tresorerie` (reçu, état « attendus », historique des transactions) ; e2e (duplicata) |
| Exactitude des exports | `tresorerie` (largeurs des 15 états, neutralisation des formules CSV) ; e2e (export CSV journalisé) |
| Contrôle des rôles | `roles`, `tresorerie` (caissier, auditeur), `licences` (hiérarchie, propriétaire) ; e2e (appels directs refusés dans le navigateur) |
| Validation des entrées | `tresorerie` (montants, dates, comptes), `finances` |
| Protection des opérations sensibles | `tresorerie`, `licences`, e2e (journal des refus) |
| Sauvegarde et restauration | `tresorerie` (archive vérifiable, intégrité, version, ancien format, paramètres) ; e2e (doublon détecté, fichier altéré refusé) |
| Persistance après actualisation | e2e (rechargements, reconnexions, données conservées) |
| Absence de données fictives | `finances` (installation neuve vierge), `tresorerie` (15 états à zéro sur base vierge) ; e2e (aucune mention IBK, états vides) |
| Absence d’erreurs bloquantes | e2e : aucune erreur dans la console du navigateur sur l’ensemble du parcours |
| Barre latérale rétractable, sans boutons de sauvegarde | e2e (réduction à 78 px, libellés en infobulle, préférence conservée après actualisation) |
| Réinitialisation complète | `run`, `finances`, `paie` (tout revient aux valeurs d’origine), `licences` (seuls les super administrateurs et le compte de l’éditeur restent) ; e2e (compte ordinaire supprimé, super administrateur conservé, paramètres effacés) |
| Licences | `licences` : consommation unique, réinitialisation et restauration, désactivation, révocation, suppression en liste noire, expiration ; e2e (page Licence, année refusée sans clé) |

## Vérifications complémentaires

- Les 10 clés de licence d’origine ont été testées sur un état temporaire : 10 sur 10 acceptées une fois, 10 sur 10 refusées à la seconde utilisation.
- Aucun secret en clair dans le projet : un contrôle automatique des 107 fichiers n’a trouvé ni clé d’origine ni mot de passe du compte propriétaire.
- Aucun import circulaire ; les 13 fichiers générés de `application/` sont syntaxiquement valides.

## Défauts trouvés par les tests puis corrigés

- La règle du « dernier administrateur » bloquait le changement de rôle d’un compte non administrateur.
- La page du journal d’audit n’affichait pas un refus survenu après son ouverture.
- L’accès direct depuis l’aide ne pouvait pas atteindre un champ situé dans un formulaire replié.
- Les chemins de l’aide répétaient le nom de la page.
- Le banc de test pouvait rester bloqué après un rechargement de page : un délai maximal par évaluation a été ajouté.
