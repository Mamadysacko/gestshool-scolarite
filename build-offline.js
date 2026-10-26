const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const entry = './app.js';
const modules = new Map();

function resolveModule(importer, request) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), request));
  return resolved.startsWith('./') ? resolved : `./${resolved}`;
}

function collect(moduleId) {
  if (modules.has(moduleId)) return;

  const source = fs.readFileSync(path.join(root, moduleId.slice(2)), 'utf8');
  const imports = [];
  const transformed = source.replace(
    /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm,
    (_statement, names, request) => {
      const dependency = resolveModule(moduleId, request);
      imports.push(dependency);
      return `const { ${names.trim()} } = require(${JSON.stringify(request)});`;
    }
  );

  if (/^\s*import\s/m.test(transformed)) {
    throw new Error(`Import non pris en charge dans ${moduleId}`);
  }

  const exports = [];
  const body = transformed.replace(
    /^export\s+(?=(?:async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*))/gm,
    (_statement, name) => {
      exports.push(name);
      return '';
    }
  );

  modules.set(moduleId, { body, exports });
  for (const dependency of imports) collect(dependency);
}

collect(entry);

// ── Application autonome découpée en 13 fichiers thématiques (dossier « application/ ») ──
// Chaque fichier enregistre les modules de son domaine dans un registre commun ; le dernier démarre l'application.
// Les fichiers sont chargés dans l'ordre par index.html (scripts classiques, sans serveur ni connexion).
const OUT_DIR = path.join(root, 'application');
const FICHIERS = [
  ['01-noyau-utilitaires.js', 'Noyau : registre des modules, utilitaires, stockage, transactions, journal, fenêtres, impression', ['./storage.js', './modules/utils.js', './modules/transaction.js', './modules/audit.js', './modules/dialog.js', './modules/print.js', './modules/doc-preview.js', './modules/entete.js', './modules/arrondi.js', './modules/ui-state.js']],
  ['02-securite-navigation.js', 'Sécurité et navigation : comptes, compte propriétaire, rôles, licences, éditeur, connexion, menus, sous-onglets et formulaires repliés', ['./modules/editeur.js', './modules/auth.js', './modules/licences.js', './modules/licences-view.js', './modules/login-view.js', './modules/navigation.js', './modules/formulaires.js']],
  ['03-annees-classes-tarifs.js', 'Scolarité : années, reconduction, classes, programmes, tarifs et modalités', ['./modules/annees.js', './modules/reconduction.js', './modules/classes.js', './modules/programme.js', './modules/tarifs.js', './modules/modalites.js', './modules/reductions.js']],
  ['04-eleves-inscriptions.js', 'Élèves : dossiers, parents et tuteurs, inscriptions, passage et réinscriptions', ['./modules/eleves.js', './modules/contacts.js', './modules/inscriptions.js', './modules/passage.js', './modules/views.js']],
  ['05-paiements-recus.js', 'Encaissements : calculs financiers, comptes, imputation, paiements, règlements en attente, reçus, factures et formulaire', ['./modules/finance.js', './modules/allocation.js', './modules/clotures.js', './modules/comptes.js', './modules/paiements.js', './modules/attente.js', './modules/recus.js', './modules/echeancier-view.js', './modules/paiement-form.js', './modules/details.js', './ui.js']],
  ['06-dettes-rappels.js', 'Recouvrement : créances, relances, dettes antérieures, report explicite et fiches de rappel', ['./modules/reliquats.js', './modules/dettes-view.js', './modules/rappels.js', './modules/creances.js', './modules/creances-view.js']],
  ['07-depenses-tresorerie.js', 'Caisse et trésorerie : dépenses, dépenses récurrentes, reçus de dépense, comptes, virements, journées de caisse et rapprochements', ['./modules/depenses.js', './modules/depenses-view.js', './modules/tresorerie.js', './modules/comptes-view.js', './modules/caisse.js', './modules/caisse-view.js']],
  ['08-paie-personnel.js', 'Paie du personnel : employés, affectations, paie mensuelle, avances et bulletins', ['./modules/personnel.js', './modules/paie.js', './modules/avances.js', './modules/bulletin-paie.js', './modules/paie-views.js', './modules/paie-actions.js']],
  ['09-tableaux-de-bord-analyses.js', 'Pilotage : tableau de bord, graphiques, évolutions et analyses financières', ['./modules/dashboard.js', './modules/charts.js', './modules/evolution.js', './modules/analyse.js', './modules/analyse-encaissements.js']],
  ['10-rapports-exports.js', 'Rapports : périodes, rapports comptables et périodiques, listes et exports', ['./modules/rapports.js', './modules/rapports-utils.js', './modules/rapports-periodiques.js', './modules/rapports-compta.js', './modules/listes.js', './modules/etats.js', './modules/etats-view.js']],
  ['11-administration-sauvegardes.js', 'Administration : configuration, fichier de données, sauvegardes, copies de sécurité, licence en ligne et mises à jour', ['./modules/config-view.js', './modules/backup.js', './modules/sauvegardes.js', './modules/archive.js', './modules/cloud.js']],
  ['12-centre-aide.js', 'Centre d’aide : fiches, recherche intelligente et aide contextuelle', ['./modules/aide-data.js', './modules/aide.js', './modules/aide-view.js']],
  ['13-demarrage-application.js', 'Démarrage : orchestration de l’interface, opérations et lancement de l’application', ['./app.js']]
];

const places = new Map();
FICHIERS.forEach(([nom, , ids]) => ids.forEach((id) => {
  if (places.has(id)) throw new Error(`Module attribué deux fois : ${id}`);
  places.set(id, nom);
}));
const oublies = [...modules.keys()].filter((id) => !places.has(id));
if (oublies.length) throw new Error(`Modules non rangés dans un fichier : ${oublies.join(', ')}`);
const absents = [...places.keys()].filter((id) => !modules.has(id));
if (absents.length) throw new Error(`Modules inconnus dans la répartition : ${absents.join(', ')}`);

const factory = (moduleId, module) => [
  `  factories['${moduleId}'] = (require, exports) => {`,
  module.body.split('\n').map((line) => `    ${line}`).join('\n'),
  `    Object.assign(exports, { ${module.exports.join(', ')} });`,
  '  };'
].join('\n');

const REGISTRE = [
  '// Registre commun des modules (partagé par les 13 fichiers de l’application)',
  'window.IBK_APP = window.IBK_APP || (() => {',
  '  const factories = Object.create(null);',
  '  const cache = Object.create(null);',
  '  function pathFor(importer, request) {',
  "    const parts = importer.split('/').filter((part) => part && part !== '.');",
  '    parts.pop();',
  "    for (const part of request.split('/')) {",
  "      if (part === '.' || part === '') continue;",
  "      if (part === '..') parts.pop();",
  '      else parts.push(part);',
  '    }',
  "    return `./${parts.join('/')}`;",
  '  }',
  '  function require(moduleId) {',
  '    if (cache[moduleId]) return cache[moduleId];',
  '    const make = factories[moduleId];',
  "    if (!make) throw new Error(`Module introuvable : ${moduleId} (vérifiez que les 13 fichiers du dossier application/ sont chargés)`);",
  '    const exports = {};',
  '    cache[moduleId] = exports;',
  '    make((request) => require(pathFor(moduleId, request)), exports);',
  '    return exports;',
  '  }',
  '  return { factories, require };',
  '})();',
  ''
].join('\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
// Anciens fichiers générés retirés : seul le découpage en 13 fichiers reste
fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.js') && !FICHIERS.some(([nom]) => nom === f)).forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
const ancien = path.join(root, 'offline-app.js');
if (fs.existsSync(ancien)) fs.unlinkSync(ancien);

FICHIERS.forEach(([nom, titre, ids], index) => {
  const contenu = [
    `// GEST SCHOOL SCOLARITÉ · ${nom}`,
    `// ${titre}`,
    `// Fichier GÉNÉRÉ par build-offline.js à partir de : ${ids.join(', ')}`,
    '// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».',
    '',
    index === 0 ? REGISTRE : '',
    '((factories) => {',
    ...ids.map((id) => factory(id, modules.get(id))),
    '})(window.IBK_APP.factories);',
    index === FICHIERS.length - 1 ? "\nwindow.IBK_APP.require('./app.js');" : '',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, nom), contenu);
});

console.log(`Application autonome créée : ${FICHIERS.length} fichiers dans application/`);
FICHIERS.forEach(([nom, , ids]) => console.log(`  ${nom.padEnd(36)} ${String(ids.length).padStart(2)} module(s) · ${Math.round(fs.statSync(path.join(OUT_DIR, nom)).size / 1024)} Ko`));
