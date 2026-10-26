'use strict';
// Mises à jour automatiques (electron-updater, fournisseur « generic » : fichiers publiés sur Firebase Hosting).
// Politique :
//  - seule une version AUTORISÉE par le serveur (portail → Versions → Publier) est téléchargée : même numéro que
//    la dernière version publiée ET même empreinte SHA-512 que celle enregistrée à la publication ;
//  - mise à jour facultative : proposée, peut être différée de 24 h ; obligatoire (version minimale) : téléchargée
//    automatiquement, l'installation ne peut pas être différée ;
//  - avant l'installation : sauvegarde complète de la base, vérifiée par empreinte SHA-256 (bloquante si la version
//    annonce une migration incompatible) ;
//  - le résultat (succès ou échec) est journalisé au redémarrage et remonté au portail.
// Limite : l'installateur NSIS se met à jour ; la version portable ne le peut pas (elle signale la nouvelle version).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIFFERER_MS = 24 * 3600e3;
const SAUVEGARDES_CONSERVEES = 5;

class GestionnaireMisesAJour {
  constructor({ autoUpdater, service, stockage, versionApp, dossierSauvegardes, demanderSauvegarde, url, portable = false, horloge = () => Date.now(), quitter }) {
    this.au = autoUpdater;
    this.service = service;
    this.stockage = stockage;
    this.versionApp = versionApp;
    this.dossier = dossierSauvegardes;
    this.demanderSauvegarde = demanderSauvegarde;
    this.horloge = horloge;
    this.quitter = quitter || (() => this.au.quitAndInstall(true, true));
    this.ecouteurs = new Set();
    const pref = stockage.lire('mises-a-jour', {});
    this.e = { statut: 'inactif', version_disponible: null, notes: null, obligatoire: false, progression: null, erreur: null, differee_jusqu_au: pref.differee_jusqu_au || null };
    if (!url) { this.e.statut = 'non_configure'; return; }
    if (portable) { this.e.statut = 'portable'; return; }
    this.au.autoDownload = false;
    this.au.autoInstallOnAppQuit = false;
    this.au.allowDowngrade = false;
    this.au.setFeedURL({ provider: 'generic', url, useMultipleRangeRequest: false });
    this.au.on('checking-for-update', () => this.maj({ statut: 'verification', erreur: null }));
    this.au.on('update-not-available', () => this.maj({ statut: 'a_jour', version_disponible: null }));
    this.au.on('update-available', (info) => this.surDisponible(info));
    this.au.on('download-progress', (p) => this.maj({ statut: 'telechargement', progression: { pourcentage: Math.round(p.percent), transferes: p.transferred, total: p.total, octets_s: Math.round(p.bytesPerSecond) } }));
    this.au.on('update-downloaded', (info) => this.maj({ statut: 'pret', version_disponible: info.version, progression: null }));
    this.au.on('error', (err) => {
      this.maj({ statut: 'erreur', erreur: String(err?.message || err).slice(0, 300), progression: null });
      this.service.signaler({ type: 'mise_a_jour', niveau: 'avertissement', message: 'Erreur de mise à jour', donnees: { resultat: 'erreur', message: String(err?.message || err).slice(0, 180) } });
    });
  }

  surChangement(f) { this.ecouteurs.add(f); return () => this.ecouteurs.delete(f); }
  maj(champs) { Object.assign(this.e, champs); const e = this.etat(); this.ecouteurs.forEach((f) => { try { f(e); } catch { /* ignoré */ } }); }
  etat() {
    const v = this.service.etat().versions;
    return { ...this.e, version_actuelle: this.versionApp, obligatoire: !!v?.obligatoire, migration_incompatible: !!v?.migration_incompatible, differable: !v?.obligatoire };
  }

  // Vérification : seulement si le serveur annonce une version plus récente (synchronisation préalable)
  async verifier({ manuel = false } = {}) {
    if (['non_configure', 'portable', 'telechargement', 'pret'].includes(this.e.statut)) return this.etat();
    const v = this.service.etat().versions;
    if (!v) { this.maj({ statut: 'inactif', erreur: manuel ? 'Synchronisez d’abord la licence : la version autorisée est fournie par le serveur.' : null }); return this.etat(); }
    if (!v.disponible) { this.maj({ statut: 'a_jour', version_disponible: null, notes: null }); return this.etat(); }
    if (!manuel && !v.obligatoire && this.e.differee_jusqu_au && this.horloge() < Date.parse(this.e.differee_jusqu_au)) return this.etat();
    try { await this.au.checkForUpdates(); } catch { /* l'événement « error » a déjà renseigné l'état */ }
    return this.etat();
  }

  surDisponible(info) {
    const v = this.service.etat().versions;
    const fichier = (info.files || []).find((f) => /\.exe$/i.test(f.url)) || info.files?.[0];
    const sha = fichier?.sha512 || info.sha512;
    const autorisee = !!v && v.derniere === info.version && (!v.sha512 || v.sha512 === sha);
    if (!autorisee) {
      this.maj({ statut: 'non_autorisee', version_disponible: info.version, erreur: 'Version publiée sur le serveur de fichiers mais non autorisée (ou empreinte différente) : elle ne sera pas installée.' });
      this.service.signaler({ type: 'mise_a_jour', niveau: 'avertissement', message: 'Version non autorisée refusée', donnees: { version: info.version, resultat: 'refusee' } });
      return;
    }
    this.maj({ statut: 'disponible', version_disponible: info.version, notes: v.notes || (typeof info.releaseNotes === 'string' ? info.releaseNotes : null), erreur: null });
    if (v.obligatoire) this.telecharger();
  }

  async telecharger() {
    if (this.e.statut !== 'disponible') return this.etat();
    this.maj({ statut: 'telechargement', progression: { pourcentage: 0 } });
    try { await this.au.downloadUpdate(); } catch { /* état renseigné par l'événement « error » */ }
    return this.etat();
  }

  differer() {
    if (this.etat().obligatoire) return { ok: false, message: 'Cette mise à jour est obligatoire.' };
    const jusqu = new Date(this.horloge() + DIFFERER_MS).toISOString();
    this.stockage.ecrire('mises-a-jour', { differee_jusqu_au: jusqu });
    this.maj({ differee_jusqu_au: jusqu });
    return { ok: true, jusqu_au: jusqu };
  }

  // Sauvegarde vérifiable : fichier JSON + empreinte SHA-256 relue après écriture
  async sauvegarder(vers) {
    const texte = await this.demanderSauvegarde();
    if (typeof texte !== 'string' || texte.length < 2) throw new Error('Sauvegarde vide ou indisponible');
    JSON.parse(texte); // la base doit être un JSON valide
    fs.mkdirSync(this.dossier, { recursive: true });
    const nom = `${new Date(this.horloge()).toISOString().replace(/[:.]/g, '-')}_v${this.versionApp}-vers-v${vers}.json`;
    const chemin = path.join(this.dossier, nom);
    const empreinte = crypto.createHash('sha256').update(texte, 'utf8').digest('hex');
    fs.writeFileSync(chemin, texte, 'utf8');
    const relu = crypto.createHash('sha256').update(fs.readFileSync(chemin, 'utf8'), 'utf8').digest('hex');
    if (relu !== empreinte) throw new Error('Sauvegarde corrompue à l’écriture');
    fs.writeFileSync(`${chemin}.sha256`, `${empreinte}  ${nom}\n`);
    const anciennes = fs.readdirSync(this.dossier).filter((f) => f.endsWith('.json')).sort();
    for (const f of anciennes.slice(0, Math.max(0, anciennes.length - SAUVEGARDES_CONSERVEES))) {
      fs.rmSync(path.join(this.dossier, f), { force: true });
      fs.rmSync(path.join(this.dossier, `${f}.sha256`), { force: true });
    }
    return { chemin, empreinte, octets: Buffer.byteLength(texte) };
  }

  async installer() {
    if (this.e.statut !== 'pret') return { ok: false, message: 'Aucune mise à jour prête à installer.' };
    const vers = this.e.version_disponible;
    let sauvegarde = null;
    try {
      sauvegarde = await this.sauvegarder(vers);
      this.service.signaler({ type: 'sauvegarde', niveau: 'info', message: 'Sauvegarde avant mise à jour', donnees: { octets: sauvegarde.octets, vers } });
    } catch (e) {
      this.service.signaler({ type: 'sauvegarde', niveau: 'erreur', message: 'Sauvegarde avant mise à jour impossible', donnees: { message: String(e.message).slice(0, 180) } });
      if (this.etat().migration_incompatible) {
        this.maj({ erreur: `Mise à jour suspendue : la sauvegarde préalable a échoué (${e.message}).` });
        return { ok: false, message: this.e.erreur };
      }
    }
    this.stockage.ecrire('maj-en-attente', { de: this.versionApp, vers, le: new Date(this.horloge()).toISOString(), sauvegarde: sauvegarde?.chemin || null });
    this.service.signaler({ type: 'mise_a_jour', niveau: 'info', message: `Installation de la version ${vers}`, donnees: { de: this.versionApp, vers, resultat: 'lancee' } });
    setTimeout(() => this.quitter(), 300);
    return { ok: true };
  }

  // Au démarrage : bilan de la mise à jour lancée lors de la session précédente
  bilanDemarrage() {
    const attente = this.stockage.lire('maj-en-attente', null);
    if (!attente) return null;
    this.stockage.supprimer('maj-en-attente');
    const reussie = this.versionApp === attente.vers;
    this.service.signaler({
      type: 'mise_a_jour', niveau: reussie ? 'info' : 'erreur',
      message: reussie ? `Mise à jour ${attente.de} → ${attente.vers} réussie` : `Mise à jour vers ${attente.vers} non appliquée (version ${this.versionApp})`,
      donnees: { de: attente.de, vers: attente.vers, resultat: reussie ? 'succes' : 'echec' }
    });
    return { reussie, ...attente };
  }
}

module.exports = { GestionnaireMisesAJour };
