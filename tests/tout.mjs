// Lance toutes les suites de tests, l'une après l'autre. Usage : node tests/tout.mjs
// (le test de bout en bout est ignoré automatiquement si ni Chrome ni Edge n'est installé)
import { spawnSync } from 'node:child_process';

const suites = ['run', 'finances', 'tresorerie', 'licences', 'analyse', 'annee', 'aide', 'paie', 'roles', 'e2e'];
let echecs = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [`tests/${suite}.mjs`], { encoding: 'utf8' });
  // Le résumé est la dernière ligne de la sortie standard (les avertissements de Node.js vont sur la sortie d'erreur)
  const derniere = (r.stdout.trim() || r.stderr.trim()).split('\n').pop();
  console.log(`${r.status === 0 ? 'OK  ' : 'ÉCHEC'} ${suite.padEnd(9)} ${derniere}`);
  if (r.status !== 0) { echecs += 1; console.log(r.stdout.split('\n').filter((l) => !l.startsWith('ok -')).join('\n'), r.stderr); }
}
console.log(echecs ? `${echecs} suite(s) en échec` : 'Toutes les suites sont passées');
process.exitCode = echecs ? 1 : 0;
