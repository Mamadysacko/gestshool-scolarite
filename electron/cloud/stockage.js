'use strict';
// Stockage local de l'état cloud (dossier de données de l'utilisateur, hors du dossier d'installation).
// Écriture atomique : fichier temporaire, vidage sur disque, renommage ; la version précédente est gardée en .bak.
// Une coupure de courant pendant l'écriture laisse donc toujours un fichier lisible.
const fs = require('node:fs');
const path = require('node:path');

class Stockage {
  constructor(dossier) {
    this.dossier = dossier;
    fs.mkdirSync(dossier, { recursive: true });
  }

  chemin(nom) { return path.join(this.dossier, `${nom}.json`); }

  lire(nom, defaut = null) {
    for (const f of [this.chemin(nom), `${this.chemin(nom)}.bak`]) {
      try {
        if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch { /* fichier illisible : on essaie la copie précédente */ }
    }
    return defaut;
  }

  ecrire(nom, valeur) {
    const cible = this.chemin(nom);
    const tmp = `${cible}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(valeur));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(cible)) {
      try { fs.copyFileSync(cible, `${cible}.bak`); } catch { /* sans copie précédente */ }
    }
    fs.renameSync(tmp, cible);
  }

  supprimer(nom) {
    for (const f of [this.chemin(nom), `${this.chemin(nom)}.bak`]) { try { fs.unlinkSync(f); } catch { /* absent */ } }
  }
}

module.exports = { Stockage };
