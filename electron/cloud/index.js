'use strict';
// Intégration du service cloud et des mises à jour dans le processus principal d'Electron.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Stockage } = require('./stockage');
const { ServiceCloud } = require('./service');
const { GestionnaireMisesAJour } = require('./mises-a-jour');

const DELAI_RESEAU_MS = 20e3;
const VERIF_EN_LIGNE_MS = 30e3;
const MAX_SIGNALEMENTS_HEURE = 60;

// Configuration (non secrète) : electron/cloud-config.json. En développement seulement, la variable
// GEST_SCHOOL_CLOUD_CONFIG peut désigner un autre fichier (émulateurs) ; jamais dans la version installée.
function lireConfig(app) {
  const defaut = path.join(__dirname, '..', 'cloud-config.json');
  const fichier = !app.isPackaged && process.env.GEST_SCHOOL_CLOUD_CONFIG ? process.env.GEST_SCHOOL_CLOUD_CONFIG : defaut;
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return {}; }
}

// Empreinte du poste : identifiant Windows de la machine, haché (jamais transmis en clair). Sert à reconnaître une
// réinstallation sur le même ordinateur, sans consommer une nouvelle place de licence.
function empreintePoste(produit) {
  try {
    const sortie = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const guid = (sortie.match(/MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i) || [])[1];
    if (guid) return crypto.createHash('sha256').update(`${produit}:poste:${guid.toLowerCase()}`).digest('hex');
  } catch { /* indisponible : empreinte aléatoire conservée localement */ }
  return undefined;
}

function demarrerCloud({ app, ipcMain, safeStorage, net, autoUpdater, fenetrePrincipale, estPagePrincipale }) {
  const config = lireConfig(app);
  const dossier = path.join(app.getPath('userData'), 'cloud');
  const stockage = new Stockage(dossier);

  const chiffrer = (s) => (safeStorage.isEncryptionAvailable() ? `dpapi:${safeStorage.encryptString(s).toString('base64')}` : s);
  const dechiffrer = (s) => (typeof s === 'string' && s.startsWith('dpapi:') ? safeStorage.decryptString(Buffer.from(s.slice(6), 'base64')) : s);

  // Transport HTTPS : net.fetch respecte la configuration réseau (proxy) de Windows
  const transport = async (nom, corps, jeton) => {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
    try {
      const r = await net.fetch(`${config.url_fonctions.replace(/\/$/, '')}/${nom}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
        body: JSON.stringify(corps),
        signal: ctrl.signal
      });
      let json = {};
      try { json = await r.json(); } catch { /* réponse non JSON */ }
      return { statut: r.status, corps: json };
    } finally {
      clearTimeout(minuteur);
    }
  };

  const service = new ServiceCloud({ config, stockage, transport, versionApp: app.getVersion(), chiffrer, dechiffrer, empreintePoste: empreintePoste(config.produit || 'gestschool') });

  // Sauvegarde demandée à la page (seule détentrice de la base) avant une mise à jour
  let attenteSauvegarde = null;
  const demanderSauvegarde = () => new Promise((resolve, reject) => {
    const f = fenetrePrincipale();
    if (!f) return reject(new Error('Fenêtre fermée'));
    const id = crypto.randomUUID();
    const minuteur = setTimeout(() => { attenteSauvegarde = null; reject(new Error('La page n’a pas fourni la sauvegarde')); }, 30e3);
    attenteSauvegarde = { id, resolve: (t) => { clearTimeout(minuteur); attenteSauvegarde = null; resolve(t); } };
    f.webContents.send('maj:sauvegarde-demandee', id);
  });

  const majs = new GestionnaireMisesAJour({
    autoUpdater, service, stockage, versionApp: app.getVersion(),
    dossierSauvegardes: path.join(app.getPath('userData'), 'sauvegardes-mise-a-jour'),
    demanderSauvegarde, url: config.url_mises_a_jour || '', portable: !!process.env.PORTABLE_EXECUTABLE_DIR
  });

  // Diffusion des états vers la page
  const diffuser = (canal, etat) => { const f = fenetrePrincipale(); if (f && !f.isDestroyed()) f.webContents.send(canal, etat); };
  service.surChangement((e) => diffuser('cloud:etat', e));
  majs.surChangement((e) => diffuser('maj:etat', e));

  // Démarrage
  const debut = Date.now();
  service.signaler({ type: 'demarrage', niveau: 'info', message: `Démarrage version ${app.getVersion()}`, donnees: { version: app.getVersion() } });
  majs.bilanDemarrage();

  // Planification : périodique, avec reprise exponentielle après échec et dès le retour de la connexion
  let minuteur = null;
  const planifier = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(async () => { await cycle(); }, service.delaiProchaineTentative());
  };
  const cycle = async () => {
    await service.synchroniser();
    await majs.verifier().catch(() => {});
    planifier();
  };
  let enLigne = net.isOnline();
  const surveillance = setInterval(() => {
    const maintenant = net.isOnline();
    if (maintenant && !enLigne) cycle();
    enLigne = maintenant;
  }, VERIF_EN_LIGNE_MS);
  setTimeout(cycle, 5000);

  // IPC : uniquement depuis la page principale de l'application
  const garde = (f) => async (evenement, ...args) => {
    if (!estPagePrincipale(evenement.senderFrame)) throw new Error('Appel refusé');
    return f(...args);
  };
  let signalements = { heure: '', n: 0 };
  ipcMain.handle('cloud:etat', garde(() => service.etat()));
  ipcMain.handle('cloud:activer', garde((cle) => service.activer(typeof cle === 'string' ? cle.slice(0, 60) : '')));
  ipcMain.handle('cloud:synchroniser', garde(async () => { const r = await service.synchroniser({ raison: 'manuel' }); await majs.verifier().catch(() => {}); planifier(); return r; }));
  ipcMain.handle('cloud:consentement', garde((oui) => { service.definirConsentementUsage(oui === true); return service.etat(); }));
  ipcMain.handle('cloud:usage', garde((u) => {
    const propre = {};
    for (const k of ['eleves', 'classes', 'enseignants', 'evaluations', 'annees']) if (Number.isFinite(u?.[k])) propre[k] = Math.max(0, Math.round(u[k]));
    service.definirUsage(propre);
    return true;
  }));
  ipcMain.handle('cloud:signaler', garde((e) => {
    const h = new Date().toISOString().slice(0, 13);
    if (signalements.heure !== h) signalements = { heure: h, n: 0 };
    if (++signalements.n > MAX_SIGNALEMENTS_HEURE) return false;
    const niveau = ['avertissement', 'erreur'].includes(e?.niveau) ? e.niveau : 'erreur';
    service.signaler({ type: 'erreur', niveau, message: String(e?.message || 'Erreur dans la page').slice(0, 300), donnees: { source: String(e?.source || '').slice(0, 120), ligne: Number(e?.ligne) || 0 } });
    return true;
  }));
  ipcMain.handle('maj:etat', garde(() => majs.etat()));
  ipcMain.handle('maj:verifier', garde(async () => { await service.synchroniser(); return majs.verifier({ manuel: true }); }));
  ipcMain.handle('maj:telecharger', garde(() => majs.telecharger()));
  ipcMain.handle('maj:installer', garde(() => majs.installer()));
  ipcMain.handle('maj:differer', garde(() => majs.differer()));
  ipcMain.handle('maj:sauvegarde-fournie', garde((id, texte) => {
    if (attenteSauvegarde && attenteSauvegarde.id === id) attenteSauvegarde.resolve(texte);
    return true;
  }));

  // Arrêt : l'événement est écrit sur disque immédiatement (envoyé à la prochaine connexion)
  app.on('before-quit', () => {
    clearTimeout(minuteur);
    clearInterval(surveillance);
    service.signaler({ type: 'arret', niveau: 'info', message: 'Fermeture', donnees: { duree_session_min: Math.round((Date.now() - debut) / 60000) } });
  });

  return { service, majs };
}

module.exports = { demarrerCloud };
