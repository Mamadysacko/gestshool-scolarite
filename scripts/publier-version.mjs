// Prépare la publication d'une nouvelle version (GEST SCHOOL ou GEST SCHOOL SCOLARITÉ — script identique dans les
// deux applications ; le produit est lu dans electron/cloud-config.json).
//  1. vérifie que l'installateur correspond à l'empreinte SHA-512 de dist/latest.yml (fichier intact) ;
//  2. rassemble latest.yml, l'installateur et son .blockmap dans dist/publication-v<version>/ ;
//  3. affiche la marche à suivre (GitHub Releases) et les valeurs à contrôler dans le portail.
// La version n'est proposée aux postes qu'APRÈS : (a) le dépôt des 3 fichiers dans une publication GitHub et
// (b) « Publier une version » dans le portail. Tant que (b) n'est pas fait, les applications refusent de l'installer.
// Usage : node scripts/publier-version.mjs [--dist dist] [--destination <dossier>] [--produit <id>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? process.argv[i + 1] : defaut; };
const config = JSON.parse(fs.readFileSync(path.join(racine, 'electron', 'cloud-config.json'), 'utf8'));
const produit = opt('produit', config.produit);
const dist = path.resolve(racine, opt('dist', 'dist'));

const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
const val = (cle) => (yml.match(new RegExp(`^\\s*-?\\s*${cle}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm')) || [])[1]?.trim();
const version = val('version'), fichier = val('path') || val('url'), sha512 = val('sha512'), taille = Number(val('size'));
if (!version || !fichier || !sha512) throw new Error('latest.yml incomplet');
const exe = path.join(dist, fichier);
const contenu = fs.readFileSync(exe);
if (crypto.createHash('sha512').update(contenu).digest('base64') !== sha512) throw new Error(`Empreinte différente : ${fichier} ne correspond pas à latest.yml (fichier altéré ou reconstruit).`);
if (taille && taille !== contenu.length) throw new Error('Taille différente de latest.yml');

const destination = path.resolve(racine, opt('destination', path.join(dist, `publication-v${version}`)));
fs.mkdirSync(destination, { recursive: true });
const fichiers = [fichier, `${fichier}.blockmap`, 'latest.yml'].filter((f) => fs.existsSync(path.join(dist, f)));
for (const f of fichiers) fs.copyFileSync(path.join(dist, f), path.join(destination, f));

const depot = (String(config.url_mises_a_jour || '').match(/github\.com\/([^/]+\/[^/]+)\//) || [])[1];
console.log(`Version ${version} de « ${produit} » prête (empreinte vérifiée) : ${destination}`);
console.log('\nÉtapes suivantes :');
console.log(`  1. GitHub${depot ? ` → https://github.com/${depot}/releases/new` : ' → dépôt des mises à jour → Releases → Draft a new release'}`);
console.log(`       Tag : v${version}   Titre : ${version}   Déposez : ${fichiers.join(', ')}`);
console.log('       Cochez « Set as the latest release », puis « Publish release ».');
console.log('  2. Portail → Versions et publications → « Publier une version » (valeurs lues automatiquement) ; contrôle :');
console.log(`       version : ${version}\n       fichier : ${fichier}\n       sha512  : ${sha512}\n       taille  : ${contenu.length}`);
