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

const bundle = [
  '(() => {',
  '  const factories = Object.create(null);',
  '  const cache = Object.create(null);',
  ...[...modules].map(([moduleId, module]) => [
    `  factories['${moduleId}'] = (require, exports) => {`,
    module.body.split('\n').map((line) => `    ${line}`).join('\n'),
    `    Object.assign(exports, { ${module.exports.join(', ')} });`,
    '  };'
  ].join('\n')),
  '  function require(moduleId) {',
  '    if (cache[moduleId]) return cache[moduleId];',
  '    const factory = factories[moduleId];',
  "    if (!factory) throw new Error(`Module local introuvable : ${moduleId}`);",
  '    const exports = {};',
  '    cache[moduleId] = exports;',
  '    factory((request) => require(pathFor(moduleId, request)), exports);',
  '    return exports;',
  '  }',
  '  function pathFor(importer, request) {',
  "    const parts = importer.split('/').filter((part) => part && part !== '.');",
  '    parts.pop();',
  '    for (const part of request.split(\'/\')) {',
  "      if (part === '.' || part === '') continue;",
  "      if (part === '..') parts.pop();",
  '      else parts.push(part);',
  '    }',
  "    return `./${parts.join('/')}`;",
  '  }',
  "  require('./app.js');",
  '})();',
  ''
].join('\n');

fs.writeFileSync(path.join(root, 'offline-app.js'), bundle);
console.log('Application autonome créée : offline-app.js');
