'use strict';
// GEST SCHOOL SCOLARITÉ — application de bureau (Electron).
// La page (index.html + application/) est exactement celle de la version navigateur ; ce processus principal ajoute
// une fenêtre native, un menu en français, l'icône de l'application et des protections :
//  - la page n'a aucun accès à Node.js (contextIsolation, sandbox, nodeIntegration désactivé) ;
//  - aucune navigation hors de l'application : les liens web, e-mail et téléphone s'ouvrent dans le système ;
//  - permissions refusées, sauf l'accès au dossier du fichier de données ;
//  - une seule instance à la fois (deux fenêtres écrivant la même base se contrediraient) ;
//  - outils de développement et débogage à distance désactivés dans la version installée ;
//  - service cloud (licence en ligne, synchronisation, mises à jour) dans le processus principal ; la page n'y accède
//    que par le pont preload.js. Code partagé avec GEST SCHOOL (electron/cloud/, identique dans les deux applications).
const { app, BrowserWindow, Menu, shell, dialog, session, nativeImage, ipcMain, safeStorage, net } = require('electron');
const path = require('node:path');

// Nom du produit (package.json) : détermine aussi le dossier des données (%APPDATA%\<nom>)
const NOM = require('../package.json').productName || 'GEST SCHOOL SCOLARITÉ';
// Identité de l'éditeur (reprise de modules/editeur.js, source utilisée par l'application elle-même)
const EDITEUR = {
  nom: 'SOCIÉTÉ KJS GROUP SARL',
  activites: 'Solutions numériques • Réseaux & systèmes • Formation',
  devise: 'Vision — Stratégie — Action',
  email: 'kjsgroup2025@gmail.com',
  telephone: '+224 664-33-33-66'
};
const RACINE = path.join(__dirname, '..');
const ICONE = path.join(RACINE, 'assets', 'gest-school-embleme-256.png');
const LOGO_EDITEUR = path.join(RACINE, 'assets', 'logo entreprise.png');
const PAGE = path.join(RACINE, 'index.html');
const PERMISSIONS_AUTORISEES = new Set(['fileSystem', 'clipboard-sanitized-write']);

// Version installée : refuse le débogage à distance, qui permettrait d'exécuter du code dans la page
// (les fusibles Electron définis dans package.json interdisent déjà --inspect et ELECTRON_RUN_AS_NODE)
// Exception : la version d'ESSAI interne (« gestschoolEssai » dans package.json, protégé par le contrôle d'intégrité de
// app.asar) sert aux tests automatisés de mise à jour ; elle n'est jamais distribuée.
const ESSAI = require('../package.json').gestschoolEssai === true;
if (app.isPackaged && !ESSAI && ['remote-debugging-port', 'remote-debugging-pipe', 'remote-allow-origins'].some((s) => app.commandLine.hasSwitch(s))) {
  app.exit(1);
}

app.setName(NOM);
if (process.platform === 'win32') app.setAppUserModelId('com.kjsgroup.gestschool.scolarite');

let fenetre = null;

// Une seule instance : une seconde ouverture ramène la fenêtre existante au premier plan
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });
}

const estExterne = (url) => /^(https?:|mailto:|tel:)/i.test(url);

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: NOM,
    icon: ICONE,
    backgroundColor: '#f8f9fc',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  fenetre.once('ready-to-show', () => {
    fenetre.maximize();
    fenetre.show();
  });
  fenetre.on('closed', () => { fenetre = null; });
  fenetre.loadFile(PAGE);
}

function aPropos() {
  dialog.showMessageBox(fenetre, {
    type: 'info',
    title: `À propos de ${NOM}`,
    icon: nativeImage.createFromPath(LOGO_EDITEUR).resize({ width: 96 }),
    message: `${NOM} — version ${app.getVersion()}`,
    detail: [
      'Gestion financière et comptable des établissements scolaires.',
      '',
      `Conçu et développé par ${EDITEUR.nom}`,
      EDITEUR.activites,
      EDITEUR.devise,
      '',
      `E-mail : ${EDITEUR.email}`,
      `Téléphone : ${EDITEUR.telephone}`
    ].join('\n'),
    buttons: ['Fermer', 'Écrire à l’éditeur'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }).then(({ response }) => { if (response === 1) shell.openExternal(`mailto:${EDITEUR.email}`); });
}

function menu() {
  const modele = [
    {
      label: 'Fichier',
      submenu: [{ label: 'Quitter', accelerator: 'Alt+F4', role: 'quit' }]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Actualiser', accelerator: 'F5', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Taille normale', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Plein écran', accelerator: 'F11', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { label: 'Outils de développement', accelerator: 'F12', role: 'toggleDevTools' }])
      ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Contacter l’éditeur', click: () => shell.openExternal(`mailto:${EDITEUR.email}`) },
        { type: 'separator' },
        { label: `À propos de ${NOM}`, click: aPropos }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele));
}

// Toute page : pas de navigation hors de l'application, pas de nouvelle fenêtre ; liens externes vers le système
app.on('web-contents-created', (_evenement, contenu) => {
  contenu.on('will-navigate', (evenement, url) => {
    if (url.startsWith('file://')) return;
    evenement.preventDefault();
    if (estExterne(url)) shell.openExternal(url);
  });
  contenu.setWindowOpenHandler(({ url }) => {
    if (estExterne(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contenu.on('will-attach-webview', (evenement) => evenement.preventDefault());
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contenu, permission, rappel) => rappel(PERMISSIONS_AUTORISEES.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contenu, permission) => PERMISSIONS_AUTORISEES.has(permission));
  menu();
  creerFenetre();
  demarrerService();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) creerFenetre(); });
});

// Service cloud et mises à jour (sans effet si electron/cloud-config.json n'est pas renseigné : mode local)
function demarrerService() {
  const { autoUpdater } = require('electron-updater');
  const { demarrerCloud } = require('./cloud');
  autoUpdater.logger = null;
  demarrerCloud({
    app, ipcMain, safeStorage, net, autoUpdater,
    fenetrePrincipale: () => fenetre,
    estPagePrincipale: (cadre) => !!fenetre && !!cadre && cadre === fenetre.webContents.mainFrame && /^file:.*\/index\.html(?:[?#].*)?$/i.test(cadre.url)
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
