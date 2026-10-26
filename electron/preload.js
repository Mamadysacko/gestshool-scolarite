'use strict';
// Pont sécurisé entre la page et le processus principal (contextIsolation + sandbox) : la page n'accède qu'à ces
// fonctions, jamais à Node.js ni au jeton de l'installation.
const { contextBridge, ipcRenderer } = require('electron');

const ecouter = (canal) => (rappel) => {
  const f = (_e, etat) => rappel(etat);
  ipcRenderer.on(canal, f);
  return () => ipcRenderer.removeListener(canal, f);
};

contextBridge.exposeInMainWorld('gestCloud', {
  etat: () => ipcRenderer.invoke('cloud:etat'),
  activer: (cle) => ipcRenderer.invoke('cloud:activer', cle),
  synchroniser: () => ipcRenderer.invoke('cloud:synchroniser'),
  consentement: (oui) => ipcRenderer.invoke('cloud:consentement', oui),
  usage: (u) => ipcRenderer.invoke('cloud:usage', u),
  signaler: (e) => ipcRenderer.invoke('cloud:signaler', e),
  surEtat: ecouter('cloud:etat'),
  majEtat: () => ipcRenderer.invoke('maj:etat'),
  majVerifier: () => ipcRenderer.invoke('maj:verifier'),
  majTelecharger: () => ipcRenderer.invoke('maj:telecharger'),
  majInstaller: () => ipcRenderer.invoke('maj:installer'),
  majDifferer: () => ipcRenderer.invoke('maj:differer'),
  surMaj: ecouter('maj:etat'),
  // Sauvegarde de la base demandée avant une mise à jour : la page répond avec le contenu sérialisé
  surDemandeSauvegarde: (fournir) => {
    ipcRenderer.on('maj:sauvegarde-demandee', async (_e, id) => {
      let texte = '';
      try { texte = await fournir(); } catch { texte = ''; }
      ipcRenderer.invoke('maj:sauvegarde-fournie', id, texte);
    });
  }
});
