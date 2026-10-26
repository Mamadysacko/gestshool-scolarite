// Génère build/icon.ico (icône Windows de l'application, de l'installateur et des raccourcis) à partir de l'emblème
// GEST SCHOOL. Les images PNG sont intégrées telles quelles dans le fichier ICO (format accepté par Windows Vista et
// suivants). Usage : node build/creer-icone.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['gest-school-embleme-256.png', 'gest-school-embleme-64.png', 'gest-school-embleme-32.png'].map((f) => path.join(racine, 'assets', f));

const images = sources.map((f) => {
  const data = fs.readFileSync(f);
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error(`${f} n’est pas une image PNG`);
  return { data, largeur: data.readUInt32BE(16), hauteur: data.readUInt32BE(20) };
});

const entete = Buffer.alloc(6);
entete.writeUInt16LE(0, 0); // réservé
entete.writeUInt16LE(1, 2); // type : icône
entete.writeUInt16LE(images.length, 4);

let decalage = 6 + 16 * images.length;
const entrees = images.map((img) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(img.largeur >= 256 ? 0 : img.largeur, 0); // 0 signifie 256
  e.writeUInt8(img.hauteur >= 256 ? 0 : img.hauteur, 1);
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); // plans
  e.writeUInt16LE(32, 6); // bits par pixel
  e.writeUInt32LE(img.data.length, 8);
  e.writeUInt32LE(decalage, 12);
  decalage += img.data.length;
  return e;
});

const sortie = path.join(racine, 'build', 'icon.ico');
fs.writeFileSync(sortie, Buffer.concat([entete, ...entrees, ...images.map((i) => i.data)]));
console.log(`Icône créée : ${path.relative(racine, sortie)} (${images.map((i) => `${i.largeur}×${i.hauteur}`).join(', ')})`);
