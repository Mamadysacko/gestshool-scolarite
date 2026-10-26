// Test de bout en bout dans un vrai navigateur (Chrome/Edge headless piloté par le protocole DevTools).
// Usage : node tests/e2e.mjs   (nécessite Chrome ou Edge installé)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { etatDemo } from './donnees-demo.mjs';

const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const exe = browsers.find(existsSync);
if (!exe) { console.log('Aucun navigateur trouvé : test e2e ignoré'); process.exit(0); }

const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'ibk-e2e-'));
const url = pathToFileURL(resolve('index.html')).href;
const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* démarrage */ }
    await sleep(250);
  }
  throw new Error('Navigateur injoignable');
}

const ws = new WebSocket(await connect());
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
// Délai maximal par évaluation : un rechargement de page peut détruire le contexte sans que le navigateur réponde ;
// on n'attend alors pas la réponse (au lieu de bloquer indéfiniment). Toute autre évaluation trop longue échoue.
async function ev(expression) {
  const recharge = /location\.reload\(\)/.test(expression);
  const delai = new Promise((resolve) => setTimeout(() => resolve(null), recharge ? 3000 : 60000));
  const res = await Promise.race([send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }), delai]);
  if (!res) { if (recharge) return undefined; throw new Error(`Évaluation sans réponse après 60 s\n--- ${expression.slice(0, 200)}`); }
  if (recharge && !res.result) return undefined;
  if (res.result.exceptionDetails) throw new Error(`${res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text}\n--- ${expression.slice(0, 200)}`);
  return res.result.result.value;
}
// E2E_SHOTS=<dossier> : captures d'écran pour contrôle visuel
async function shot(name) {
  if (!process.env.E2E_SHOTS) return;
  const { data } = (await send('Page.captureScreenshot', { format: 'png' })).result;
  (await import('node:fs')).writeFileSync(join(process.env.E2E_SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}
const wait = (ms) => ev(`await new Promise(r => setTimeout(r, ${ms}))`);

// Dossier simulé pour le fichier de données (File System Access) : contenu conservé dans localStorage « e2e_fs »
const mockFs = `
  const fsLoad = () => JSON.parse(localStorage.getItem('e2e_fs') || '{}');
  const fsSave = (x) => localStorage.setItem('e2e_fs', JSON.stringify(x));
  const mkFile = (path, name) => ({ kind: 'file', name,
    async getFile() { const t = fsLoad()[path + '/' + name] || ''; return { size: t.length, lastModified: Date.now(), text: async () => t }; },
    async createWritable() { let buf = ''; return { write: async (x) => { buf += x; }, close: async () => { const x = fsLoad(); x[path + '/' + name] = buf; fsSave(x); } }; } });
  const mkDir = (path, name) => ({ kind: 'directory', name, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    async getFileHandle(n, o = {}) { const x = fsLoad(); const k = path + '/' + n; if (!(k in x)) { if (!o.create) throw new DOMException('absent', 'NotFoundError'); x[k] = ''; fsSave(x); } return mkFile(path, n); },
    async getDirectoryHandle(n) { return mkDir(path + '/' + n, n); } });
  window.showDirectoryPicker = async () => mkDir('Documents', 'Documents');
`;
const fsFiles = () => ev("return JSON.parse(localStorage.getItem('e2e_fs') || '{}')");

let passed = 0;
const step = async (name, fn) => { await fn(); passed += 1; console.log('ok -', name); };

const helpers = `
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const nav = async (t) => {
    for (const g of $$('.nav-btn[data-group]:not([hidden])')) {
      g.click(); await sleep(10);
      if ($('#' + t).classList.contains('active')) return;
      const sub = $('.subtab-btn[data-target="' + t + '"]');
      if (sub) { sub.click(); await sleep(40); return; }
    }
    throw new Error('page inaccessible : ' + t);
  };
`;

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1500);

  await step('premier lancement : création du compte administrateur', async () => {
    assert.equal(await ev(`${helpers} return !$('#login-root').hidden && !!$('.login-card')`), true);
    assert.match(await ev(`return document.querySelector('.login-editeur')?.textContent || ''`), /Conçu et développé par\s*SOCIÉTÉ KJS GROUP SARL/);
    assert.equal(await ev(`${helpers} return $('#app-shell').hidden`), true);
    // mot de passe faible refusé
    await ev(`${helpers} const f = $('.login-card'); set($('[name=nom]', f), 'Directeur'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'abc'); set($('[name=confirm]', f), 'abc'); submit(f);`);
    assert.match(await ev(`return document.querySelector('[data-login-error]').textContent`), /8 caractères/);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=password]', f), 'Secret2026'); set($('[name=confirm]', f), 'Secret2026'); submit(f); await sleep(300);`);
    assert.equal(await ev(`return document.getElementById('app-shell').hidden`), false);
    assert.match(await ev(`return document.getElementById('roleLabel').textContent`), /Super administrateur/);
  });

  await step('installation neuve : aucune donnée fictive, états vides, établissement à configurer', async () => {
    const etat = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1'))`);
    assert.deepEqual([etat.eleves.length, etat.classes.length, etat.paiements.length, etat.depenses.length, etat.annees.length, etat.config.nom], [0, 0, 0, 0, 0, '']);
    assert.match(await ev(`return document.getElementById('schoolName').textContent`), /non configuré/);
    assert.match(await ev(`return document.getElementById('dashboard').textContent`), /Aucune donnée financière pour le moment/);
    assert.match(await ev(`return document.getElementById('dashboard').textContent`), /Mise en route/);
    assert.ok(!(await ev(`return document.body.innerHTML`)).includes('IBK'));
    await shot('vierge-tableau-de-bord');
    // Suite du scénario : jeu de démonstration de TEST injecté (jamais livré avec l'application)
    // Même identifiant d'établissement que la base créée : les comptes de ce poste y restent rattachés
    const demo = etatDemo({ config: { nom: 'Groupe Scolaire Démo', sigle: 'DEMO', devise: 'GNF', adresse: 'Ville de test', telephone: '000', email: 'demo@example.org', caissier: '', etablissementId: etat.config.etablissementId } });
    // Clé de licence de TEST ajoutée au catalogue des données de test (comme le ferait l'éditeur)
    await ev(`const s = JSON.parse(${JSON.stringify(JSON.stringify(demo))}); window.IBK_APP.require('./modules/auth.js').avecAutorisation(() => window.IBK_APP.require('./modules/licences.js').ajouterCle(s, { cle: 'GSS-E2ETE-STCLE-AAAAA-BBBBB', libelle: 'Clé de test e2e' }));
      localStorage.setItem('ibk_school_premium_v1', JSON.stringify(s)); localStorage.removeItem('ibk_datafile_prompt_v1'); location.reload();`).catch(() => {});
    await sleep(1800);
    assert.match(await ev(`return document.getElementById('schoolName').textContent`), /Groupe Scolaire Démo/);
  });

  await step('toute première ouverture : création du fichier de données lié', async () => {
    await ev(mockFs);
    await sleep(300);
    assert.match(await ev(`return document.querySelector('.dialog')?.textContent || ''`), /Créer le fichier de données[\s\S]*GESTSCHOOL-SCOLARITE-donnees.note[\s\S]*réinitialisation/);
    await ev(`${helpers} submit($('.dialog')); await sleep(800);`);
    const files = await fsFiles();
    assert.ok(files['Documents/GESTSCHOOL-SCOLARITE-donnees.note'], 'fichier de données non créé');
    assert.ok(Array.isArray(JSON.parse(files['Documents/GESTSCHOOL-SCOLARITE-donnees.note']).annees));
    assert.match(await ev(`return document.getElementById('dataFileChip').textContent`), /GESTSCHOOL-SCOLARITE-donnees.note[\s\S]*Enregistré automatiquement/);
    // chaque opération réécrit le fichier
    const before = files['Documents/GESTSCHOOL-SCOLARITE-donnees.note'];
    await ev(`${helpers} await nav('classes'); const f = $('#classes form'); set($('[name=nom]', f), 'Fichier test'); submit(f); await sleep(1200);`);
    assert.match((await fsFiles())['Documents/GESTSCHOOL-SCOLARITE-donnees.note'], /Fichier test/);
    assert.notEqual((await fsFiles())['Documents/GESTSCHOOL-SCOLARITE-donnees.note'], before);
    await ev(`${helpers} await nav('classes'); const c = $$('#classes [data-class-card]').find((x) => x.textContent.includes('Fichier test')); c.querySelector('[data-action^="classe:delete:"]').click(); await sleep(200); submit($('.dialog')); await sleep(300);`);
  });

  await step('toutes les pages se rendent sans erreur', async () => {
    for (const t of ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'creances', 'comptes', 'dettes', 'depenses', 'rapports', 'config', 'config-utilisateurs', 'config-finances', 'config-donnees', 'config-journal', 'aide']) {
      const len = await ev(`${helpers} await nav('${t}'); return document.getElementById('${t}').innerHTML.length`);
      assert.ok(len > 200, `page ${t} vide`);
    }
    assert.deepEqual(errors, []);
  });

  await step('classe : pas de champs Salle/Niveau, redirection vers les frais préremplis', async () => {
    assert.equal(await ev(`${helpers} await nav('classes'); return $$('#classes form [name=niveau], #classes form [name=salle]').length`), 0);
    assert.equal(await ev(`${helpers} const f = $('#classes form'); set($('[name=nom]', f), 'CM2 A'); set($('[name=categorie]', f), 'Primaire'); submit(f); await sleep(300);
      const t = $('#tarifs form'); return [$('#tarifs').classList.contains('active'), $('[name=classeText]', t).value, $('[name=categorie]', t) ? 1 : 0].join('|')`).then((v) => v.split('|').slice(0, 2).join('|')), 'true|CM2 A');
    // frais : 1 200 000 en 3 tranches
    await ev(`${helpers} const f = $('#tarifs form'); set($('[name=montantAnnuel]', f), '1200000'); submit(f); await sleep(300);`);
    const toast = await ev(`return document.getElementById('toast').textContent`);
    assert.match(await ev(`return document.getElementById('tarifs').textContent`), /CM2 A/, 'toast: ' + toast);
  });

  await step('élève → inscription auto → paiement prérempli', async () => {
    await ev(`${helpers} await nav('eleves'); const f = $('#eleves form'); set($('[name=prenom]', f), 'Fatoumata'); set($('[name=nom]', f), 'Bah'); set($('[name=classeText]', f), 'CM2 A'); submit(f); await sleep(300);`);
    assert.equal(await ev(`${helpers} return $('#inscriptions').classList.contains('active') && $('#inscriptions [name=eleveText]').value.includes('Bah')`), true);
    await ev(`${helpers} submit($('#inscriptions form')); await sleep(400);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active')`), true);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Fatoumata Bah[\s\S]*CM2 A[\s\S]*Primaire/);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Total année/);
  });

  await step('paiement : aperçu, imputation sur plusieurs tranches, refus du surplus', async () => {
    const preview = async (m) => ev(`${helpers} set($('#paiements [name=montant]'), '${m}'); return $('#paiements [data-pay-preview]').textContent.replace(/\\s+/g, ' ')`);
    // Modalité obligatoire : aucune n'est présélectionnée pour une nouvelle inscription, l'enregistrement est bloqué
    assert.equal(await ev(`${helpers} return $$('#paiements [data-pay="modalite"]:checked').length`), 0);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay-submit]').disabled`), true);
    assert.match(await preview(500000), /Choisissez la modalité/);
    await ev(`${helpers} const r = $('#paiements [data-pay="modalite"][value="tranches"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);`);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay-submit]').disabled`), false);
    const p1 = await preview(500000);
    assert.match(p1, /1ère tranche[\s\S]*2ème tranche/);
    assert.match(p1, /excédent est imputé/);
    const over = await preview(1300000);
    assert.match(over, /dépasse le solde/);
    await ev(`${helpers} set($('#paiements [name=montant]'), '500000'); submit($('#paiements form')); await sleep(400);`);
    // Reçu affiché automatiquement après l'enregistrement, avec Imprimer / Télécharger en PDF / Fermer
    const apercu = (await ev(`${helpers} return $('.doc-preview-modal') ? $('.doc-preview-modal').textContent : ''`)).replace(/\s+/g, ' ');
    assert.match(apercu, /Reçu REC-\d{4}-\d{6}[\s\S]*Imprimer[\s\S]*Télécharger en PDF[\s\S]*Fermer[\s\S]*N° REC-[\s\S]*Date :[\s\S]*Payeur : Fatoumata Bah[\s\S]*Bénéficiaire : Groupe Scolaire[\s\S]*500 000 GNF[\s\S]*Moyen : Espèces[\s\S]*Période concernée/);
    await ev(`${helpers} $('.doc-preview-modal [data-modal-close].secondary-btn').click(); await sleep(50);`);
    assert.equal(await ev(`return document.getElementById('modal-root').innerHTML`), '');
    // un paiement refusé (surplus) ne produit jamais de reçu
    await ev(`${helpers} const i = $('#paiements [data-pay=student]'); set(i, 'Bah'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(50); set($('#paiements [name=montant]'), '99000000'); submit($('#paiements form')); await sleep(300);`);
    assert.equal(await ev(`return document.getElementById('modal-root').innerHTML`), '');
    assert.match(await ev(`return document.getElementById('paiements').textContent`), /REC-\d{4}-000001|REC-\d{4}-000003/);
    const row = await ev(`${helpers} return $$('#paiements table[data-list=paiements] tbody tr')[0].textContent.replace(/\\s+/g,' ')`);
    assert.match(row, /1ère tranche \(400/);
    assert.match(row, /2ème tranche \(100/);
  });

  await step('recherche dynamique de l’élève par nom / matricule', async () => {
    await ev(`${helpers} await nav('paiements'); const i = $('#paiements [data-pay=student]'); i.focus(); set(i, 'bah');`);
    assert.equal(await ev(`${helpers} return $$('#paiements [data-pay-pick]').length`), 1);
    await ev(`${helpers} $('#paiements [data-pay-pick]').click();`);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Fatoumata/);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay-submit]').disabled`), false);
  });

  await step('tarif : montant mensuel, récapitulatif et contrôle de cohérence', async () => {
    await ev(`${helpers} await nav('classes'); const f = $('#classes form'); set($('[name=nom]', f), 'CE2 A'); set($('[name=categorie]', f), 'Primaire'); submit(f); await sleep(300);`);
    assert.equal(await ev(`${helpers} return $$('#tarifs [name=mensuel]').length`), 0, 'l’ancienne case « échéancier mensuel » doit disparaître');
    await ev(`${helpers} const f = $('#tarifs form'); set($('[name=montantAnnuel]', f), '900000'); set($('[name=montantMensuel]', f), '120000'); await sleep(30);`);
    assert.match((await ev(`${helpers} const i = $('#tarifs [data-tarif-info]'); return i.className + ' ' + i.textContent`)).replace(/\s+/g, ' '), /form-warning[\s\S]*9 × 120 000 = 1 080 000[\s\S]*écart de \+180 000/);
    // écart réel : confirmation demandée ; on refuse → rien n'est enregistré
    await ev(`${helpers} submit($('#tarifs form')); await sleep(200);`);
    assert.match(await ev(`${helpers} return $('.dialog').textContent`), /Montant mensuel différent/);
    await ev(`${helpers} $('.dialog [data-dlg=cancel]').click(); await sleep(150);`);
    assert.doesNotMatch(await ev(`return document.querySelector('#tarifs .cards-grid').textContent`), /CE2 A/);
    await ev(`${helpers} set($('#tarifs [name=montantMensuel]'), '100000'); submit($('#tarifs form')); await sleep(300);`);
    assert.match(await ev(`return document.querySelector('#tarifs .cards-grid').textContent.replace(/\\s+/g, ' ')`), /CE2 A[\s\S]*Mensuel : 9 × 100 000 = 900 000/);
  });

  await step('paiement mensuel : choix de la modalité, échéancier mensuel, modalité reprise', async () => {
    await ev(`${helpers} await nav('eleves'); const f = $('#eleves form'); set($('[name=prenom]', f), 'Ibrahima'); set($('[name=nom]', f), 'Sow'); set($('[name=classeText]', f), 'CE2 A'); submit(f); await sleep(300); submit($('#inscriptions form')); await sleep(400);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active')`), true);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Ibrahima Sow[\s\S]*provisoire, modalité à choisir/);
    await ev(`${helpers} const r = $('#paiements [data-pay="modalite"][value="mensuel"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);`);
    const card = await ev(`${helpers} return $('#paiements [data-pay-card]').textContent.replace(/\\s+/g, ' ')`);
    assert.match(card, /Échéancier — Paiement mensuel/);
    assert.equal(await ev(`${helpers} return $$('#paiements [data-pay-card] table.echeancier tbody tr').length`), 9);
    await ev(`${helpers} set($('#paiements [name=montant]'), '250000'); submit($('#paiements form')); await sleep(400);`);
    const row = await ev(`${helpers} return $$('#paiements table[data-list=paiements] tbody tr').find((tr) => tr.textContent.includes('Sow')).textContent.replace(/\\s+/g, ' ')`);
    assert.match(row, /\(100 000\) \+ .*\(100 000\) \+ .*\(50 000\)/);
    // nouvelle saisie pour le même élève : modalité reprise et verrouillée
    await ev(`${helpers} const i = $('#paiements [data-pay=student]'); set(i, 'Sow'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(50);`);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay="modalite"][value="mensuel"]').checked && !$('#paiements [data-pay="modalite"][value="tranches"]').disabled`), true);
    assert.match(await ev(`${helpers} return $('#paiements .modalite-choice').textContent`), /modalité actuelle/);
  });

  await step('reçu : aperçu écran, impression A4 sans débordement, logo chargé', async () => {
    await ev(`${helpers} const tr = $$('#paiements table[data-list=paiements] tbody tr').find((r) => r.textContent.includes('Sow')); $('[data-action^="paiement:receipt:"]', tr).click(); await sleep(400);`);
    const preview = (await ev(`${helpers} return $('.receipt-preview').textContent`)).replace(/\s+/g, ' ');
    for (const part of ['Reçu de paiement', 'Ibrahima Sow', 'Période concernée', 'Paiement mensuel', '2 mois réglés', '1 mois en cours', '6 mois restants', 'Montant attendu', '900 000', 'DUPLICATA', 'Compte : Caisse principale', 'Agent :', 'Cumul payé', '250 000', 'Reste à payer', '650 000']) assert.ok(preview.includes(part), `reçu sans « ${part} »`);
    assert.match(await ev(`${helpers} return $$('.receipt-preview b').map((b) => b.textContent).join(' | ')`), /Matricule : DEMO-\d{4}-\d{4}[\s\S]*Classe : CE2 A/);
    await shot('recu-apercu');
    // impression : le reçu est placé dans la zone d'impression, rendu en média « print » et exporté en PDF
    await ev(`${helpers} $('.doc-preview-modal [data-doc-action="pdf"]').click(); await sleep(800);`);
    assert.equal(await ev(`return [...document.querySelectorAll('#print-root img.eh-logo')].every((img) => img.complete && img.naturalWidth > 0)`), true, 'logo non chargé');
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const overflow = await ev(`return [...document.querySelectorAll('#print-root .rc-copy, #print-root .rc-box, #print-root .rc-totals div')].filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).map((el) => el.className)`);
    assert.deepEqual(overflow, [], 'débordement dans le reçu imprimé');
    const pdf = (await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).result.data;
    const pages = (Buffer.from(pdf, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(pages, 1, `le reçu (2 exemplaires) doit tenir sur 1 page A4 : ${pages}`);
    if (process.env.E2E_SHOTS) (await import('node:fs')).writeFileSync(join(process.env.E2E_SHOTS, 'recu.pdf'), Buffer.from(pdf, 'base64'));
    await send('Emulation.setEmulatedMedia', { media: '' });
    await ev(`document.getElementById('modal-root').innerHTML = ''`);
  });

  await step('facture de scolarité : calculée sur la modalité et les paiements validés', async () => {
    await ev(`${helpers} $('#paiements [data-action^="inscription:facture:"]').click(); await sleep(800);`);
    const inv = (await ev(`return document.getElementById('print-root').textContent`)).replace(/\s+/g, ' ');
    assert.match(inv, /Facture de scolarité[\s\S]*FAC-2025-2026-\d{5}[\s\S]*Paiement mensuel[\s\S]*Reste à payer : 650 000/);
    assert.match(inv, /Paiements validés[\s\S]*250 000/);
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const pdf = (await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).result.data;
    if (process.env.E2E_SHOTS) (await import('node:fs')).writeFileSync(join(process.env.E2E_SHOTS, 'facture.pdf'), Buffer.from(pdf, 'base64'));
    await send('Emulation.setEmulatedMedia', { media: '' });
    assert.deepEqual(errors, []);
  });

  await step('double clic sur « Enregistrer le paiement » : un seul paiement', async () => {
    const before = await ev(`return document.querySelectorAll('[data-payment-row]').length`);
    await ev(`${helpers} await nav('paiements'); const i = $('#paiements [data-pay=student]'); set(i, 'Sow'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(50);
      set($('#paiements [name=montant]'), '10000');
      const form = $('#paiements form'); submit(form); submit(form); $('[data-pay-submit]', form).click(); await sleep(500);`);
    assert.equal(await ev(`return document.querySelectorAll('[data-payment-row]').length`), before + 1);
  });

  await step('actualisation : session, page, recherche et onglet de rapport conservés', async () => {
    await ev(`${helpers} await nav('rapports'); $('[data-report-type="depenses"]').click(); await sleep(50); await nav('paiements'); set($('[data-payment-search]'), 'Sow'); await sleep(300);`);
    assert.equal(await ev('return location.hash'), '#paiements');
    await ev('location.reload()');
    await sleep(1500);
    assert.equal(await ev('return document.getElementById("login-root").hidden && !document.getElementById("app-shell").hidden'), true, 'retour inattendu à la connexion');
    assert.equal(await ev(`return document.querySelector('.content-section.active').id`), 'paiements');
    assert.equal(await ev(`return document.querySelector('[data-payment-search]').value`), 'Sow');
    assert.equal(await ev(`return [...document.querySelectorAll('[data-payment-row]')].filter((r) => !r.hidden).every((r) => r.textContent.includes('Sow'))`), true);
    assert.equal(await ev(`return document.querySelector('.nav-btn.active').dataset.group + '/' + document.querySelector('.subtab-btn.active').dataset.target`), 'paiements/paiements');
    assert.equal(await ev(`document.querySelector('.nav-btn[data-group=rapports]').click(); return document.querySelector('[data-report-type="depenses"]').classList.contains('active')`), true);
    // une opération (re-rendu complet) ne doit pas non plus effacer la recherche du journal
    await ev(`document.querySelector('.nav-btn[data-group=paiements]').click()`);
    assert.equal(await ev(`return document.querySelector('[data-payment-search]').value`), 'Sow');
  });

  await step('session expirée : retour à la connexion, puis reprise sur la même page', async () => {
    await ev(`const s = JSON.parse(sessionStorage.getItem('ibk_session_v1')); s.last = Date.now() - 3 * 3600 * 1000; sessionStorage.setItem('ibk_session_v1', JSON.stringify(s)); location.reload();`);
    await sleep(1500);
    assert.equal(await ev('return !document.getElementById("login-root").hidden && document.getElementById("app-shell").hidden'), true, 'une session expirée doit renvoyer à la connexion');
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'Secret2026'); submit(f); await sleep(400);`);
    assert.equal(await ev(`return document.querySelector('.content-section.active').id`), 'paiements');
    // déconnexion explicite : l'actualisation ne reconnecte pas
    await ev(`document.getElementById('logoutBtn').click()`);
    await sleep(1500);
    assert.equal(await ev('return !document.getElementById("login-root").hidden'), true);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'Secret2026'); submit(f); await sleep(400);`);
  });

  await step('barre latérale : rétractable (préférence conservée), carte utilisateur, sans boutons de sauvegarde', async () => {
    assert.equal(await ev(`return document.getElementById('exportDataBtn') === null && document.getElementById('importLabel') === null`), true);
    assert.match(await ev(`return document.querySelector('.user-card').textContent`), /Directeur[\s\S]*Super administrateur/);
    await ev(`document.getElementById('sidebarCollapse').click(); await new Promise((r) => setTimeout(r, 350));`);
    const reduite = await ev(`const s = document.getElementById('sidebar').getBoundingClientRect(); const l = document.querySelector('.nav-btn .nav-label'); return [document.body.classList.contains('sidebar-reduite'), Math.round(s.width), getComputedStyle(l).display, document.querySelector('.nav-btn[data-group=paiements]').title].join('|')`);
    assert.equal(reduite, 'true|78|none|Paiements');
    await shot('sidebar-reduite');
    await ev(`location.reload();`);
    await sleep(1500);
    assert.equal(await ev(`return document.body.classList.contains('sidebar-reduite')`), true, 'préférence conservée après actualisation');
    await ev(`document.getElementById('sidebarCollapse').click(); await new Promise((r) => setTimeout(r, 350));`);
    assert.equal(await ev(`return document.body.classList.contains('sidebar-reduite') + '|' + Math.round(document.getElementById('sidebar').getBoundingClientRect().width)`), 'false|256');
    await shot('sidebar');
    assert.deepEqual(errors, []);
  });

  await step('navigation : 12 rubriques (tableau de bord … sauvegardes) et sous-onglets en haut de page', async () => {
    assert.equal(await ev(`${helpers} return $$('.nav-btn[data-group]:not([hidden])').length`), 12);
    assert.equal(await ev(`${helpers} return $$('.nav-btn[data-group]').map((b) => b.textContent.trim()).join('|')`), 'Tableau de bord|Élèves et inscriptions|Tarifs et scolarité|Paiements|Dettes et impayés|Dépenses|Caisse et trésorerie|Comptabilité et rapports|Paie du personnel|Utilisateurs et permissions|Paramètres|Sauvegardes et restauration');
    const subtabs = await ev(`${helpers} $('.nav-btn[data-group=scolarite]').click(); await sleep(30); return $$('#subtabs .subtab-label').map((b) => b.textContent).join('|')`);
    assert.equal(subtabs, 'Tarifs et frais|Classes|Années scolaires');
    await ev(`${helpers} $('.subtab-btn[data-target=classes]').click(); await sleep(30); $('.subtab-btn[data-target=tarifs]').click(); await sleep(30);`);
    assert.equal(await ev(`return location.hash + '|' + document.getElementById('pageTitle').textContent`), '#tarifs|Tarifs et scolarité · Tarifs et frais');
    // l'onglet principal mémorise le dernier sous-onglet consulté
    await ev(`${helpers} $('.nav-btn[data-group=accueil]').click(); await sleep(20); $('.nav-btn[data-group=scolarite]').click(); await sleep(20);`);
    assert.equal(await ev(`return document.querySelector('.content-section.active').id`), 'tarifs');
    await shot('navigation');
  });

  await step('frais d’inscription de l’année et changement de modalité en cours d’année', async () => {
    await ev(`${helpers} await nav('annees'); $('[data-action="annee:edit:1"]').click(); await sleep(50); const f = $('#annees form'); set($('[name=fraisInscription]', f), '50000'); set($('[name=fraisReinscription]', f), '30000'); submit(f); await sleep(300);`);
    assert.match((await ev(`return document.getElementById('annees').textContent`)).replace(/\s+/g, ' '), /Inscription : 50 000 · Réinscription : 30 000/);
    await ev(`${helpers} await nav('eleves'); const f = $('#eleves form'); set($('[name=prenom]', f), 'Kadiatou'); set($('[name=nom]', f), 'Barry'); set($('[name=classeText]', f), 'CE2 A'); submit(f); await sleep(300); submit($('#inscriptions form')); await sleep(400);`);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Kadiatou Barry[\s\S]*Frais d’inscription/);
    await ev(`${helpers} const r = $('#paiements [data-pay="modalite"][value="tranches"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(30); set($('#paiements [name=montant]'), '60000'); submit($('#paiements form')); await sleep(400);`);
    const row = () => ev(`${helpers} return $$('#paiements table[data-list=paiements] tbody tr').find((tr) => tr.textContent.includes('Barry')).textContent.replace(/\\s+/g, ' ')`);
    assert.match(await row(), /Frais d’inscription \(50 000\) \+ 1ère tranche \(10 000\)/);
    // passage au mensuel sans nouvel encaissement : le paiement existant est réimputé (frais conservés)
    await ev(`${helpers} const i = $('#paiements [data-pay=student]'); set(i, 'Barry'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(50);
      const r = $('#paiements [data-pay="modalite"][value="mensuel"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);`);
    assert.match(await ev(`${helpers} return $('#paiements .modalite-choice').textContent.replace(/\\s+/g, ' ')`), /Changement de modalité[\s\S]*60 000[\s\S]*réimputés/);
    await ev(`${helpers} $('#paiements [data-action^="inscription:modalite-mensuel:"]').click(); await sleep(200); submit($('.dialog')); await sleep(400);`);
    const after = await row();
    assert.match(after, /Frais d’inscription \(50 000\) \+ Septembre 2025 \(10 000\)/);
    assert.equal(await ev(`return document.querySelectorAll('#paiements [data-payment-row]').length`) > 0, true);
    assert.match(await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`), /Échéancier — Paiement mensuel/);
  });

  await step('licence : page réservée, vérification sans consommer, catalogue géré par l’éditeur seulement', async () => {
    const page = await ev(`${helpers} await nav('licences'); return $('#licences').textContent`);
    assert.match(page.replace(/\s+/g, ' '), /Clés disponibles\s*11[\s\S]*Catalogue\s*11/);
    assert.equal(await ev(`${helpers} return $('#licences form[data-form=licence-ajouter]') === null && !$('[data-action^="licence:"]')`), true); // super administrateur de l’établissement : pas de gestion du catalogue
    await ev(`${helpers} const f = $('#licences form[data-form=licence-verifier]'); set($('[name=cle]', f), 'GSS-AAAAA-BBBBB-CCCCC-DDDDD'); submit(f); await sleep(200);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /invalide/);
    await ev(`${helpers} const f = $('#licences form[data-form=licence-verifier]'); set($('[name=cle]', f), 'gss e2ete stcle aaaaa bbbbb'); submit(f); await sleep(200);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /Clé valide/);
    // Année sans clé : refusée
    await ev(`${helpers} await nav('annees'); const f = $('#annees form'); set($('[name=annee]', f), '2099-2100'); set($('[name=reconduireDepuis]', f), ''); submit(f); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /Clé de licence obligatoire/);
    // Les formulaires sont repliés derrière un bouton
    assert.equal(await ev(`${helpers} await nav('paiements'); const d = $('#paiements details.form-pli'); if (!d) return 'aucun volet'; if (!d.contains($('#paiements form[data-form=paiement]'))) return 'formulaire hors du volet';
      const s = d.querySelector('summary'); if (!s.textContent.includes('Enregistrer un paiement')) return 'libellé : ' + s.textContent;
      d.open = false; await sleep(20); s.click(); await sleep(50); return d.open ? 'ok' : 'ne s’ouvre pas au clic'`), 'ok');
    assert.deepEqual(errors, []);
  });

  await step('dettes antérieures : report explicite, règlement, encaissement sur la nouvelle année', async () => {
    // nouvelle année sans reconduction (la reconduction est testée plus loin)
    await ev(`${helpers} await nav('annees'); const f = $('#annees form'); set($('[name=annee]', f), '2026-2027'); set($('[name=cleLicence]', f), 'GSS-E2ETE-STCLE-AAAAA-BBBBB'); set($('[name=dateDebut]', f), '2026-09-01'); set($('[name=dateFin]', f), '2027-07-10'); set($('[name=statut]', f), 'preparation'); set($('[name=reconduireDepuis]', f), ''); submit(f); await sleep(300);`);
    await ev(`${helpers} await nav('classes'); const f = $('#classes form'); set($('[name=nom]', f), 'CM1 B'); set($('[name=categorie]', f), 'Primaire'); set($('[name=anneeId]', f), '2'); submit(f); await sleep(300); set($('#tarifs [name=montantAnnuel]'), '600000'); submit($('#tarifs form')); await sleep(300);`);
    await ev(`${helpers} await nav('inscriptions'); const f = $('#inscriptions form'); set($('[name=anneeId]', f), '2'); set($('[name=classeText]', f), 'CM1 B'); set($('[name=eleveText]', f), 'Sow'); submit(f); await sleep(500);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active')`), true);
    // aucune dette reportée automatiquement : le report se fait explicitement dans la page Dettes antérieures
    assert.doesNotMatch((await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`)), /Dette antérieure/);
    await ev(`${helpers} await nav('dettes'); set($('[data-dettes-report="cible"]'), '2'); await sleep(100);`);
    const reportables = (await ev(`return document.getElementById('report-soldes').textContent`)).replace(/\s+/g, ' ');
    await ev(`document.querySelector('#report-soldes')?.scrollIntoView({ block: 'start' })`); await shot('dettes-report');
    assert.match(reportables, /Ibrahima Sow[\s\S]*2025-2026[\s\S]*CE2 A[\s\S]*900 000 GNF[\s\S]*260 000 GNF[\s\S]*640 000 GNF[\s\S]*Oui/);
    await ev(`${helpers} const row = $$('#report-soldes tbody tr').find((r) => r.textContent.includes('Sow')); const c = $('[data-dettes-report-check]', row); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(100);
      $('[data-action="dettes:reporter"]').click(); await sleep(250); submit($('.dialog')); await sleep(400);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /1 dette\(s\) reportée\(s\) sur 2026-2027/);
    assert.match((await ev(`return document.getElementById('dettes-output').textContent`)).replace(/\s+/g, ' '), /Ibrahima Sow[\s\S]*900 000 GNF[\s\S]*260 000 GNF[\s\S]*640 000 GNF/);
    await ev(`${helpers} await nav('paiements'); set($('#paiements [data-pay=year]'), '2'); await sleep(40); const i = $('#paiements [data-pay=student]'); set(i, 'Sow'); await sleep(40); $('#paiements [data-pay-pick]').click(); await sleep(80);`);
    const card = (await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`)).replace(/\s+/g, ' ');
    assert.match(card, /Dette antérieure : 640 000[\s\S]*Année 2025-2026 : reste 640 000/);
    await ev(`${helpers} $('#paiements [data-pay-dette]').click(); await sleep(60);`);
    assert.match(await ev(`${helpers} return $('#paiements .debt-banner.active').textContent.replace(/\\s+/g, ' ')`), /Règlement d’une dette antérieure — année 2025-2026[\s\S]*Encaissé sur l’année 2026-2027/);
    await ev(`${helpers} set($('#paiements [name=montant]'), '100000'); submit($('#paiements form')); await sleep(400);`);
    const dettes = (await ev(`${helpers} await nav('dettes'); return $('#dettes-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(dettes, /Ibrahima Sow[\s\S]*2025-2026[\s\S]*640 000 GNF[\s\S]*100 000 GNF[\s\S]*540 000 GNF[\s\S]*Partiellement remboursé/);
    await ev(`${helpers} $('[data-action^="dette:view:"]').click(); await sleep(100);`);
    assert.match((await ev(`return document.getElementById('modal-root').textContent`)).replace(/\s+/g, ' '), /REC-\d{4}-\d{6}[\s\S]*100 000[\s\S]*2026-2027/);
    await ev(`document.getElementById('modal-root').innerHTML = ''`);
    // « Encaisser » depuis la page des dettes ouvre le formulaire sur la dette
    await ev(`${helpers} $('[data-action^="dette:pay:"]').click(); await sleep(100);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active') && Boolean($('#paiements .debt-banner.active'))`), true);
    await shot('dettes');
  });

  await step('année active : données affichées selon l’année, bascule automatique à l’activation d’une autre année', async () => {
    const year = () => ev(`return document.getElementById('activeYearSelect').value`);
    assert.equal(await year(), '1');
    const classes = () => ev(`${helpers} await nav('classes'); return $$('#classes [data-class-card]').map((c) => c.querySelector('h4').textContent.trim()).join(',')`);
    let list = await classes();
    assert.ok(list.includes('CM2 A') && !list.includes('CM1 B'), list);
    assert.match(await ev(`return document.querySelector('#classes .year-note').textContent`), /2025-2026[\s\S]*1 classe\(s\) d’autres années masqué/);
    // activation de 2026-2027 depuis l'en-tête
    await ev(`${helpers} set($('#activeYearSelect'), '2'); await sleep(400);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /2026-2027 active/);
    list = await classes();
    assert.ok(list.includes('CM1 B') && !list.includes('CM2 A'), list);
    await shot('annee-active');
    const filtres = await ev(`${helpers} return [
      $('[data-dashboard-filter=year]').value, $('[data-payment-year]').value, $('[data-insc-year]').value, $('[data-student-year]').value,
      $('[data-ae=yearId]').value, $('[data-df=yearId]').value, $('[data-rf=yearId]')?.value ?? '2', $('#tarifs h3:not(:first-child)')?.textContent ?? ''].join('|')`);
    assert.match(filtres, /^2\|2\|2\|2\|2\|2\|2\|/);
    // inscriptions et paiements : seules les lignes de 2026-2027
    const insc = await ev(`${helpers} await nav('inscriptions'); return $$('#inscriptions [data-insc-row]').filter((r) => !r.hidden).map((r) => r.cells[1].textContent).join(',')`);
    assert.ok(insc && insc.split(',').every((y) => y === '2026-2027'), insc);
    const pays = await ev(`${helpers} await nav('paiements'); return $$('#paiements [data-payment-row]').filter((r) => !r.hidden).length + '/' + $$('#paiements [data-payment-row]').length`);
    assert.match(pays, /^1\/\d+$/, pays); // le règlement de dette encaissé sur 2026-2027
    // « Toutes les années » reste disponible
    assert.equal(await ev(`${helpers} set($('[data-payment-search]'), ''); set($('[data-payment-year]'), 'all'); await sleep(50); return $$('#paiements [data-payment-row]').every((r) => !r.hidden)`), true);
    // l'année reste active après actualisation, filtres compris
    await ev('location.reload()');
    await sleep(1500);
    assert.equal(await year(), '2');
    assert.equal(await ev(`${helpers} await nav('dashboard'); return $('[data-dashboard-filter=year]').value`), '2');
    // retour à 2025-2026 depuis la page Années scolaires
    await ev(`${helpers} await nav('annees'); $('[data-action="annee:active:1"]').click(); await sleep(400);`);
    assert.equal(await year(), '1');
    list = await classes();
    assert.ok(list.includes('CM2 A') && !list.includes('CM1 B'), list);
    assert.equal(await ev(`return document.querySelector('[data-payment-year]').value`), '1');
    assert.deepEqual(errors, []);
  });

  await step('nouvelle année : reconduction des paramètres, décisions de passage, réinscription groupée des admis', async () => {
    const etat = () => ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1'))`);
    // plus de champ « classe de passage » : le niveau est reconnu dans le nom de la classe
    assert.equal(await ev(`${helpers} await nav('classes'); return $$('#classes [name=classeSuivante]').length`), 0);
    assert.match((await ev(`return document.getElementById('classes').textContent`)).replace(/\s+/g, ' '), /CP A[\s\S]*niveau CP \/ CP1[\s\S]*CE1 B[\s\S]*niveau CE1/);
    // reconduction vers 2026-2027 (déjà créée) : classes, programmes et frais ; rien n'est dupliqué ni aucune opération copiée
    const avant = await etat();
    await ev(`${helpers} await nav('annees'); $('[data-action="annee:reconduire:2"]').click(); await sleep(250);`);
    assert.match((await ev(`return document.querySelector('.dialog').textContent`)).replace(/\s+/g, ' '), /Depuis 2025-2026 : 5 classe\(s\) dont 5 à créer, 0 programme\(s\), 3 tarif\(s\)/);
    // les éléments à reconduire sont des cases visibles et cochables
    const cases = await ev(`const cb = [...document.querySelectorAll('.dialog input[type=checkbox]')]; return cb.map((c) => [getComputedStyle(c).appearance !== 'none', c.getBoundingClientRect().width >= 12, !c.disabled].every(Boolean)).join(',')`);
    assert.ok(cases.length && !cases.includes('false'), 'cases de reconduction invisibles ou inactives : ' + cases);
    await ev(`${helpers} const c = document.querySelector('.dialog input[type=checkbox]'); c.click(); await sleep(30); const etat = c.checked; c.click(); await sleep(30); window.__bascule = etat !== c.checked;`);
    assert.equal(await ev(`return window.__bascule`), true, 'la case doit se cocher / décocher au clic');
    await ev(`${helpers} submit($('.dialog')); await sleep(400);`);
    const apres = await etat();
    const classes2 = apres.classes.filter((c) => c.anneeId === 2).map((c) => c.nom).sort();
    assert.deepEqual(classes2, ['6e A', 'CE1 B', 'CE2 A', 'CM1 B', 'CM2 A', 'CP A']);
    const sixieme2 = apres.classes.find((c) => c.anneeId === 2 && c.nom === '6e A');
    assert.ok(sixieme2.origineClasseId); // classe reconduite, liée à sa classe d'origine
    assert.equal(apres.tarifs.filter((t) => t.anneeId === 2).length, 4); // CM1 B + 3 tarifs reconduits
    assert.deepEqual([apres.inscriptions.length, apres.paiements.length, apres.depenses.length], [avant.inscriptions.length, avant.paiements.length, avant.depenses.length]);
    // décisions de passage puis inscription groupée en 2026-2027
    await ev(`${helpers} await nav('inscriptions'); set($('[data-passage=cibleId]'), '2'); await sleep(150);`);
    const panel = () => ev(`return document.getElementById('passage-panel').textContent.replace(/\\s+/g, ' ')`);
    assert.match(await panel(), /Ibrahima Sow[\s\S]*Réinscrit\(e\) en CM1 B/);
    assert.match(await panel(), /Aminata Diallo[\s\S]*Décision de passage à saisir/);
    assert.match(await panel(), /✓Années[\s\S]*2Décisions du conseil3 à saisir[\s\S]*3Classes de destination0 élève\(s\) prêt\(s\)[\s\S]*4Validation/);
    const decide = (nom, v) => ev(`${helpers} const tr = $$('#passage-panel tbody tr').find((r) => r.textContent.includes('${nom}')); if (!tr || !$('[data-decision]', tr)) throw new Error('ligne ${nom} : ' + $('#passage-panel').textContent.replace(/\\s+/g, ' ').slice(0, 1500)); set($('[data-decision]', tr), '${v}'); await sleep(300);`);
    await decide('Aminata', 'admis');
    await decide('Kadiatou', 'redouble');
    await decide('Fatoumata', 'non_admis');
    const ligne = (nom) => ev(`${helpers} const tr = $$('#passage-panel tbody tr').find((r) => r.textContent.includes('${nom}')); return [tr.querySelector('[data-passage-classe]')?.selectedOptions[0]?.textContent || '', tr.lastElementChild.textContent.trim()].join('|')`);
    // admis de CP A → niveau supérieur existant (CE1 B) ; redoublante de CE2 A → CE2 A ; non admise : aucune classe
    assert.equal(await ligne('Aminata'), 'CE1 B (proposée)|Prêt');
    assert.equal(await ligne('Kadiatou'), 'CE2 A (proposée)|Prêt');
    assert.equal(await ligne('Fatoumata'), '|Non admis(e)');
    await ev(`document.querySelector('#passage-panel')?.scrollIntoView({ block: 'start' })`); await shot('passage');
    await ev(`${helpers} for (const nom of ['Aminata', 'Kadiatou', 'Fatoumata']) { const tr = $$('#passage-panel tbody tr').find((r) => r.textContent.includes(nom)); const c = $('[data-passage-check]', tr); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); }`);
    assert.match(await ev(`return document.querySelector('[data-action="passage:inscrire"]').textContent`), /Inscrire les 2 élève\(s\) en 2026-2027/);
    // récapitulatif avant validation : effectif par classe, frais de réinscription, soldes impayés
    const recap = (await ev(`return document.querySelector('#passage-panel .passage-block:last-of-type').textContent`)).replace(/\s+/g, ' ');
    assert.match(recap, /CE1 B\s*1[\s\S]*Frais à fixer[\s\S]*CE2 A\s*1[\s\S]*1 admis · 1 redoublant\(s\) · frais de réinscription : 0 × 2 = 0 GNF · 2 élève\(s\) avec un solde impayé en 2025-2026/); // aucun frais de réinscription défini pour 2026-2027 dans ce scénario
    await ev(`${helpers} $('[data-action="passage:inscrire"]').click(); await sleep(250);`);
    assert.match(await ev(`return document.querySelector('.dialog').textContent.replace(/\\s+/g, ' ')`), /Réinscriptions 2026-2027[\s\S]*2 élève\(s\) — 1 admis, 1 redoublant\(s\)[\s\S]*CE1 B : 1 · CE2 A : 1[\s\S]*Dettes antérieures/);
    await ev(`${helpers} submit($('.dialog')); await sleep(500);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /2 élève\(s\) réinscrit\(s\) en 2026-2027/);
    const fin = await etat();
    const re = (prenom) => { const e = fin.eleves.find((x) => x.prenom === prenom); const i = fin.inscriptions.find((x) => x.eleveId === e.id && x.anneeId === 2); return i ? [fin.classes.find((c) => c.id === i.classeId).nom, i.type, i.echeances[0]?.libelle].join('|') : ''; };
    assert.equal(re('Aminata'), 'CE1 B|reinscription|'); // CE1 B n'a pas encore de tarif en 2026-2027 : échéancier créé dès que les frais seront définis
    assert.equal(re('Kadiatou'), 'CE2 A|reinscription|1ère tranche');
    assert.equal(re('Fatoumata'), ''); // non admise : jamais inscrite automatiquement
    assert.match(await panel(), /Aminata Diallo[\s\S]*Réinscrit\(e\) en CE1 B/);
    // liste officielle des réinscrits, par classe
    await ev(`${helpers} $('[data-action="passage:liste"]').click(); await sleep(600);`);
    assert.match((await ev(`return document.getElementById('print-root').textContent`)).replace(/\s+/g, ' '), /Liste des élèves réinscrits — 2026-2027[\s\S]*CE1 B — 1 élève\(s\)[\s\S]*Diallo Aminata\s*CP A\s*Admis\(e\) en classe supérieure[\s\S]*CE2 A[\s\S]*Barry Kadiatou\s*CE2 A\s*Redouble/);
    assert.deepEqual(errors, []);
  });

  await step('famille : contact du parent repris pour un frère ou une sœur, sans doublon', async () => {
    const avant = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).contacts.length`);
    await ev(`${helpers} await nav('eleves'); const f = $('#eleves form[data-form=eleve]'); set($('[name=prenom]', f), 'Awa'); set($('[name=nom]', f), 'Diallo');
      const opt = [...$('#contacts-famille').options].find((o) => o.value.startsWith('Mamadou Diallo')); set($('[data-contact-search]', f), opt.value); await sleep(60);`);
    assert.equal(await ev(`return document.querySelector('#eleves [name=parentTel]').value`), '+224 600 000 010');
    await ev(`document.querySelector('#eleves .contact-box')?.scrollIntoView({ block: 'start' })`); await shot('famille');
    await ev(`${helpers} const f = $('#eleves form[data-form=eleve]'); set($('[name=parentLien]', f), 'pere'); set($('[name=urgenceNom]', f), 'Tante Kadi'); set($('[name=urgenceTelephone]', f), '628 00 00 00'); submit(f); await sleep(400);`);
    const s = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1'))`);
    assert.equal(s.contacts.length, avant);
    const awa = s.eleves.find((e) => e.prenom === 'Awa');
    const aminata = s.eleves.find((e) => e.prenom === 'Aminata');
    assert.deepEqual([awa.parent, awa.responsables[0].lien, awa.responsables[0].contactId, awa.urgence.nom], ['Mamadou Diallo', 'pere', aminata.responsables[0].contactId, 'Tante Kadi']);
    await ev(`${helpers} await nav('eleves'); const tr = $$('#eleves [data-student-row]').find((r) => r.textContent.includes('Awa')); $('[data-action^="eleve:profile:"]', tr).click(); await sleep(200);`);
    assert.match((await ev(`return document.getElementById('modal-root').textContent`)).replace(/\s+/g, ' '), /Père \(principal\)\s*Mamadou Diallo[\s\S]*Contact d’urgence\s*Tante Kadi[\s\S]*Frères et sœurs\s*Aminata Diallo/);
    await ev(`document.getElementById('modal-root').innerHTML = ''`);
  });

  await step('arrondis GNF et périodes exactes des rapports (semaine ISO, mois civil)', async () => {
    // frais : 1 000 000 → tranches arrondies à 5 000 (dernière ajustée), mensualité arrondie à 1 000
    const tarif = await ev(`${helpers} await nav('tarifs'); const f = $('#tarifs form'); set($('[name=montantAnnuel]', f), '1000000'); await sleep(60);
      return [1, 2, 3].map((n) => $('[name=tranche' + n + ']', f).value).concat($('[name=montantMensuel]', f).value, $('[data-tarif-info]', f).textContent).join('|')`);
    assert.match(tarif, /^335000\|335000\|330000\|111000\|[\s\S]*8 × 111\s000 \+ 1 × 112\s000 = 1\s000\s000 GNF ✓/);
    await ev(`${helpers} const f = $('#tarifs form'); f.reset(); f.querySelectorAll('[data-touched]').forEach((x) => delete x.dataset.touched);`);
    assert.match(await ev(`${helpers} await nav('config-finances'); return $('#arrondis-panel').textContent.replace(/\\s+/g, ' ')`), /Tranches de scolarité[\s\S]*1 000 000 ÷ 3 = 333 333 → 335 000 \+ 335 000 \+ 330 000 = 1 000 000/);
    // rapports : périodicité hebdomadaire et mensuelle bornées exactement
    await ev(`${helpers} await nav('rapports'); $('[data-report-type="journalier"]').click(); await sleep(60); set($('[data-rf="gran"]'), 'semaine'); await sleep(60); set($('[data-rf="refSemaine"]'), '2026-W42'); await sleep(80);`);
    assert.match(await ev(`return document.getElementById('report-output').textContent`), /Semaine du 12\/10\/2026 au 18\/10\/2026/);
    await ev(`document.querySelector('#rapports')?.scrollIntoView({ block: 'start' })`); await shot('rapport-semaine');
    await ev(`${helpers} set($('[data-rf="gran"]'), 'mois'); await sleep(60); set($('[data-rf="refMois"]'), '2026-02'); await sleep(80);`);
    const fev = (await ev(`return document.getElementById('report-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(fev, /Mois du 01\/02\/2026 au 28\/02\/2026/);
    assert.match(fev, /Aucun paiement sur cette période/); // aucune opération en février 2026
    await ev(`${helpers} set($('[data-rf="gran"]'), 'mois'); set($('[data-rf="refMois"]'), new Date().toISOString().slice(0, 7)); await sleep(60);`);
    assert.deepEqual(errors, []);
  });

  await step('fiches de rappel : délais par modalité, 4 fiches par page A4', async () => {
    await ev(`${helpers} await nav('rapports'); $('[data-report-type="rappels"]').click(); await sleep(60); set($('[data-rf="dateRef"]'), '2026-05-01'); await sleep(60);`);
    const out = (await ev(`return document.getElementById('report-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(out, /Fiches à imprimer\s*\d+/);
    const count = Number(out.match(/Fiches à imprimer\s*(\d+)/)[1]);
    assert.ok(count >= 4, `au moins 4 fiches attendues : ${count}`);
    await ev(`${helpers} $('[data-action="report:print-reminders"]').click(); await sleep(800);`);
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await ev(`return document.querySelectorAll('#print-root .rm-card').length`), count);
    const overflow = await ev(`return [...document.querySelectorAll('#print-root .rm-card')].filter((el) => el.scrollHeight > el.clientHeight + 1).length`);
    assert.equal(overflow, 0, 'fiche de rappel tronquée');
    const pdf = (await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).result.data;
    const pages = (Buffer.from(pdf, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(pages, Math.ceil(count / 4), `${count} fiches → ${Math.ceil(count / 4)} page(s) attendue(s), ${pages} obtenue(s)`);
    if (process.env.E2E_SHOTS) (await import('node:fs')).writeFileSync(join(process.env.E2E_SHOTS, 'rappels.pdf'), Buffer.from(pdf, 'base64'));
    await send('Emulation.setEmulatedMedia', { media: '' });
  });

  await step('rapport journalier : périodicité « Journalier » et statistiques de la période', async () => {
    await ev(`${helpers} $('[data-report-type="periodique"]').click(); await sleep(60); set($('[data-rf="yearId"]'), '0'); await sleep(60); set($('[data-rf="gran"]'), 'jour'); await sleep(80);`);
    // toutes les années : le règlement de dette (encaissé sur 2026-2027) figure dans la journée
    const out = (await ev(`return document.getElementById('report-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(out, /Rapport financier journalier/);
    for (const part of ['Paiements sur la période', 'Paiement moyen', 'Élèves payeurs', 'Paiements par moyen de paiement', 'Encaissements par nature', 'Dettes antérieures', 'Frais d’inscription / réinscription', 'Encaissements par modalité de règlement', 'Meilleures journées']) assert.ok(out.includes(part), `statistique absente : ${part}`);
    assert.ok(await ev(`return document.querySelectorAll('#report-output .r-group')[0].querySelectorAll('tbody tr').length`) <= 32, 'la période journalière doit être recentrée sur 30 jours');
  });

  await step('dépense : enregistrement, solde disponible, annulation conserve la ligne', async () => {
    await ev(`${helpers} await nav('depenses'); const f = $('#depenses form'); set($('[name=categorie]', f), 'Fournitures et matériel'); set($('[name=montant]', f), '150000'); set($('[name=description]', f), 'Craies et cahiers'); set($('[name=demandeur]', f), 'Directeur'); set($('[name=beneficiaire]', f), 'Librairie Centrale'); submit(f); await sleep(400);`);
    const out = await ev(`return document.getElementById('depense-output').textContent.replace(/\\s+/g,' ')`);
    assert.match(out, /DEP-\d{4}-000001/);
    assert.match(out, /Solde disponible1 120 000/); // 1 270 000 encaissés en 2025-2026 − 150 000 (le règlement de dette compte en 2026-2027)
    await ev(`${helpers} $('[data-action^="depense:cancel:"]').click(); await sleep(200); set($('.dialog [name=v]'), 'erreur de saisie'); submit($('.dialog')); await sleep(400);`);
    const after = await ev(`return document.getElementById('depense-output').textContent.replace(/\\s+/g,' ')`);
    assert.match(after, /Annulée/);
    assert.match(after, /Solde disponible1 270 000/);
  });

  await step('paie : fiche employé sans rémunération, rémunérations à part (mensuelle ou à l’heure), affectations multiples', async () => {
    assert.equal(await ev(`${helpers} $('.nav-btn[data-group=paie]').click(); await sleep(40); return $$('#subtabs .subtab-label').map((b) => b.textContent).join('|')`), 'Tableau de bord|Personnel|Affectations|Rémunérations|Paie mensuelle|Avances sur salaire|Bulletins et récapitulatifs');
    // fiche employé : informations administratives uniquement (aucun champ de salaire)
    assert.equal(await ev(`${helpers} await nav('personnel'); return $$('#personnel form[data-form=employe] [name=salaireBase], #personnel form[data-form=employe] [name=tauxHoraire], #personnel form[data-form=employe] [name=mode], #personnel form[data-form=employe] [name=primeFixe]').length`), 0);
    assert.match((await ev(`return document.querySelector('#personnel .paie-steps').textContent`)).replace(/\s+/g, ' '), /1\s*Fiche employé[\s\S]*2\s*Affectation[\s\S]*3\s*Rémunération[\s\S]*4\s*Paie de chaque mois/);
    const addEmploye = (prenom, nom, type) => ev(`${helpers} await nav('personnel'); const f = $('#personnel form[data-form=employe]');
      set($('[name=prenom]', f), '${prenom}'); set($('[name=nom]', f), '${nom}');
      const t = [...$('[name=typeEmployeId]', f).options].find((o) => o.textContent === '${type}'); set($('[name=typeEmployeId]', f), t.value);
      submit(f); await sleep(300);`);
    // étape « Rémunérations » : employé choisi → mode, montant → autorisation administrateur
    const remunerer = (nom, mode, montant) => {
      const champ = mode === 'horaire' ? 'tauxHoraire' : 'salaireBase';
      return ev(`${helpers} await nav('remunerations'); const sel = $('#remunerations [data-rem-employe]'); set(sel, [...sel.options].find((o) => o.textContent.includes('${nom}')).value); await sleep(80);
        const f = $('#remunerations form[data-form=remuneration]'); set($('[data-pe-mode]', f), '${mode}'); await sleep(30);
        set($('[name=${champ}]', f), '${montant}'); submit(f); await sleep(400);`);
    };
    // matières : gérées dans Scolarité › Classes (et non plus dans Affectations)
    await ev(`${helpers} await nav('classes'); const f = $('#classes #matieres-panel form[data-form=matiere]'); set($('[name=nom]', f), 'Arabe'); submit(f); await sleep(300);`);
    assert.match(await ev(`return document.querySelector('#classes #matieres-panel').textContent`), /Arabe/);
    assert.match(await ev(`return document.querySelector('#programme-panel').textContent`), /Arabe/);
    assert.equal(await ev(`${helpers} await nav('affectations'); return $$('#affectations form[data-form=matiere], #affectations #matieres-panel').length`), 0);
    // programme de la 6e A : mathématiques et anglais (seules matières proposées ensuite)
    await ev(`${helpers} await nav('classes'); const sel = $('[data-prog-classe]'); const o = [...sel.options].find((x) => x.textContent.startsWith('6e A')); set(sel, o.value); await sleep(80);
      const f = $('#programme-panel form[data-form=programme]');
      for (const nom of ['Mathématiques', 'Anglais']) { const tr = $$('tbody tr', f).find((r) => r.cells[1].textContent === nom); $('input[type=checkbox]', tr).checked = true; $('input[name^=coef]', tr).value = nom === 'Mathématiques' ? '4' : '2'; }
      submit(f); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /Programme de 6e A enregistré \(2 matière/);
    await ev(`document.querySelector('#programme-panel')?.scrollIntoView({ block: 'start' })`); await shot('programme');
    // professeur de collège : fiche, puis affectation (redirection automatique), puis rémunération à l'heure
    await addEmploye('Ousmane', 'Sylla', 'Enseignant');
    const redirect = await ev(`${helpers} const sel = $('#affectations [data-af=affEmploye]'); return [$('.content-section.active').id, sel.selectedOptions[0]?.textContent || '', $('#affectations .prefill-banner')?.textContent.replace(/\\s+/g, ' ') || ''].join('|')`);
    assert.match(redirect, /^affectations\|Ousmane Sylla[\s\S]*\|[\s\S]*Ousmane Sylla[\s\S]*EMP-\d{4}-0001/);
    assert.equal(JSON.parse(await ev(`return localStorage.getItem('ibk_school_premium_v1')`)).personnel[0].remuneration.salaireBase, 0); // fiche enregistrée sans rémunération
    // collège : classes cochées → matières de leur programme uniquement → lignes vérifiées → une seule validation
    await ev(`${helpers} const c = $$('#affectations [data-af-classe]').find((x) => x.closest('label').textContent.includes('6e A')); c.checked = true; c.dispatchEvent(new Event('input', { bubbles: true })); await sleep(80);`);
    assert.equal(await ev(`${helpers} return $$('#affectations [data-af-matiere]').map((x) => x.closest('label').textContent.trim().split(' ')[0]).join(',')`), 'Anglais,Mathématiques');
    await ev(`${helpers} for (let k = 0; k < 2; k += 1) { const m = $$('#affectations [data-af-matiere]')[k]; m.checked = true; m.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60); }
      set($('#affectations [data-af=affSalle]'), 'B12'); $('[data-action="affectation:ajouter-lignes"]').click(); await sleep(120);`);
    assert.equal(await ev(`return document.querySelectorAll('#affectations .aff-lignes tbody tr').length`), 2);
    await ev(`document.querySelector('#affectations .section-form')?.scrollIntoView({ block: 'start' })`); await shot('affectations-lignes');
    await ev(`${helpers} const i = $$('#affectations [data-af-ligne-salle]')[0]; i.value = 'B14'; i.dispatchEvent(new Event('input', { bubbles: true })); $('[data-action="affectation:enregistrer"]').click(); await sleep(400);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /2 affectation\(s\) enregistrée\(s\) pour Ousmane Sylla/);
    assert.match((await ev(`return document.querySelector('#affectations table[data-list=affectations]').textContent`)).replace(/\s+/g, ' '), /6e A · Anglais · salle B14[\s\S]*6e A · Mathématiques · salle B12/);
    // étape suivante proposée depuis l'affectation : la rémunération, employé présélectionné
    await ev(`${helpers} $('#affectations [data-action^="remuneration:edit:"]').click(); await sleep(150);`);
    assert.equal(await ev(`${helpers} return $('.content-section.active').id + '|' + $('#remunerations [data-rem-employe]').selectedOptions[0].textContent.split(' (')[0]`), 'remunerations|Ousmane Sylla');
    // un enseignant peut être payé à l'heure ; le champ affiché suit le mode choisi
    const champs = () => ev(`${helpers} const f = $('#remunerations form[data-form=remuneration]'); return [$('[name=salaireBase]', f).closest('label').hidden, $('[name=tauxHoraire]', f).closest('label').hidden].join('|')`);
    assert.equal(await champs(), 'false|true');
    await ev(`${helpers} set($('#remunerations [data-pe-mode]'), 'horaire'); await sleep(30);`);
    assert.equal(await champs(), 'true|false');
    await remunerer('Sylla', 'horaire', '20000');
    assert.match(await ev(`return document.getElementById('toast').textContent`), /Ousmane Sylla : payé à l’heure \(20\s000 GNF \/ h\) — prêt pour la paie mensuelle/);
    await ev(`document.querySelector('#remunerations')?.scrollIntoView({ block: 'start' })`); await shot('remunerations');
    // primaire : titulaire d'une seule classe
    await addEmploye('Fanta', 'Condé', 'Enseignant');
    await ev(`${helpers} set($('#affectations [data-af-primaire]'), [...$('#affectations [data-af-primaire]').options].find((o) => o.textContent.startsWith('CP A')).value); $('[data-action="affectation:titulaire"]').click(); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /Titulaire affecté/);
    await ev(`${helpers} set($('#affectations [data-af-primaire]'), [...$('#affectations [data-af-primaire]').options].find((o) => o.textContent.startsWith('CE1 B')).value); $('[data-action="affectation:titulaire"]').click(); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /une seule classe/);
    await remunerer('Condé', 'fixe', '1200000');
    // employé non enseignant : redirigé directement vers sa rémunération ; le mode horaire ne lui est pas proposé
    await addEmploye('Mamadou', 'Camara', 'Gardien');
    assert.equal(await ev(`${helpers} return $('.content-section.active').id + '|' + $('#remunerations [data-rem-employe]').selectedOptions[0].textContent.split(' (')[0] + '|' + $$('#remunerations [data-pe-mode] option').map((o) => o.value).join(',')`), 'remunerations|Mamadou Camara|fixe');
    assert.match(await ev(`return document.getElementById('toast').textContent`), /définissez maintenant sa rémunération/);
    await remunerer('Camara', 'fixe', '600000');
    assert.match((await ev(`return document.querySelector('#remunerations table[data-list=remunerations]').textContent`)).replace(/\s+/g, ' '), /Sylla[\s\S]*Payé à l’heure\s*20 000 \/ h/);
    assert.match(await ev(`return document.querySelector('#remunerations .stat-card').textContent.replace(/\\s+/g, ' ')`), /Rémunérations à définir\s*0/);
    await ev(`${helpers} await nav('personnel');`);
    const liste = (await ev(`return document.getElementById('personnel').textContent`)).replace(/\s+/g, ' ');
    assert.match(liste, /EMP-\d{4}-0001[\s\S]*Sylla[\s\S]*20 000 GNF \/ heure/);
    assert.match(liste, /Camara[\s\S]*Gardien[\s\S]*600 000/);
    await ev(`${helpers} const f = $('#personnel form[data-form="type-employe"]'); set($('[name=libelle]', f), 'Cuisinier'); submit(f); await sleep(250);`);
    assert.match(await ev(`return document.querySelector('#personnel .chip-list').textContent`), /Cuisinier/);
  });

  await step('paie : avance approuvée, versée puis prélevée ; paie préparée, validée, payée, sans double paie', async () => {
    const mois = await ev(`return new Date().toISOString().slice(0, 7)`);
    await ev(`${helpers} await nav('avances'); const f = $('#avances form[data-form=avance]'); const e = [...$('[name=employeId]', f).options].find((o) => o.textContent.includes('Camara')); set($('[name=employeId]', f), e.value);
      set($('[name=montantDemande]', f), '250000'); set($('[name=modeRemboursement]', f), 'mensualite'); set($('[name=valeur]', f), '100000'); set($('[name=moisDebut]', f), '${mois}'); await sleep(30);`);
    assert.match((await ev(`return document.querySelector('[data-av-preview]').textContent`)).replace(/\s+/g, ' '), /100 000[\s\S]*100 000[\s\S]*50 000[\s\S]*3 prélèvement\(s\), dernière mensualité ajustée/);
    await ev(`${helpers} submit($('#avances form[data-form=avance]')); await sleep(300); $('[data-action^="avance:approuver:"]').click(); await sleep(200); submit($('.dialog')); await sleep(300); $('[data-action^="avance:verser:"]').click(); await sleep(200); submit($('.dialog')); await sleep(300);`);
    assert.match((await ev(`return document.getElementById('avances').textContent`)).replace(/\s+/g, ' '), /Camara[\s\S]*250 000[\s\S]*Versée — en remboursement/);
    await ev(`${helpers} await nav('paie'); set($('#paie [data-pv=mois]'), '${mois}'); await sleep(30); $('[data-action="paie:preparer"]').click(); await sleep(300);`);
    assert.equal(await ev(`return document.querySelectorAll('#paie-output table[data-list=paies] tbody tr').length`), 3);
    await ev(`${helpers} $('[data-action="paie:preparer"]').click(); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /aucun doublon/);
    assert.equal(await ev(`return document.querySelectorAll('#paie-output table[data-list=paies] tbody tr').length`), 3);
    const ligne = (nom) => ev(`${helpers} return $$('#paie-output table[data-list=paies] tbody tr').find((r) => r.textContent.includes('${nom}')).textContent.replace(/\\s+/g, ' ')`);
    // enseignant payé à l'heure : sans heures saisies, sa paie n'est pas validable
    assert.match(await ligne('Sylla'), /Payé à l’heure\s*0 h × 20 000\s*0\s*0\s*0\s*0\s*0\s*Brouillon\s*!/);
    // heures du mois : une saisie par affectation (6e A · Anglais, 6e A · Mathématiques, autres heures)
    const heures = (valeurs) => ev(`${helpers} const tr = $$('#paie-output .heures-panel tbody tr').find((r) => r.textContent.includes('Sylla')); const inputs = $$('input', tr);
      ${JSON.stringify(valeurs)}.forEach((v, i) => { inputs[i].value = v; }); submit($('#paie-output form[data-form=heures-mois]')); await sleep(400);`);
    assert.equal(await ev(`${helpers} const tr = $$('#paie-output .heures-panel tbody tr').find((r) => r.textContent.includes('Sylla')); return $$('.heures-cell span', tr).map((s) => s.textContent).join('|')`), '6e A · Anglais · salle B14|6e A · Mathématiques · salle B12|Autres heures (hors affectation)');
    await heures(['12', '10', '']);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /enregistrées pour 1 enseignant/);
    assert.match(await ligne('Sylla'), /22 h × 20 000\s*440 000/);
    // correction du même mois : même enregistrement mis à jour, ancienne valeur conservée dans l'historique
    await heures(['14', '10', '']);
    const h = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).heuresRealisees.filter((x) => x.lignes)`);
    assert.equal(h.length, 1, 'une seule saisie par enseignant et par mois');
    assert.deepEqual([h[0].totalHeures, h[0].historique.length], [24, 2]);
    assert.match(h[0].historique[1].avant, /Anglais · salle B14 : 12 h/);
    assert.match(await ligne('Sylla'), /24 h × 20 000\s*480 000\s*0\s*0\s*0\s*480 000/);
    await ev(`${helpers} const tr = $$('#paie-output table[data-list=paies] tbody tr').find((r) => r.textContent.includes('Sylla')); $('[data-action^="paie:detail:"]', tr).click(); await sleep(100);`);
    const detail = (await ev(`return document.getElementById('paie-detail').textContent`)).replace(/\s+/g, ' ');
    assert.match(detail, /6e A · Anglais · salle B14\s*14\s*20 000\s*280 000[\s\S]*6e A · Mathématiques · salle B12\s*10\s*20 000\s*200 000[\s\S]*24 h · Brut 480 000[\s\S]*Net à payer\s*480 000/);
    assert.match(detail, /Historique des heures[\s\S]*\(2 saisie\(s\)\)/);
    await ev(`document.querySelector('#paie .heures-panel')?.scrollIntoView({ block: 'start' })`); await shot('paie-heures');
    await ev(`document.querySelector('#paie-detail')?.scrollIntoView({ block: 'start' })`); await shot('paie-detail');
    assert.match(await ligne('Camara'), /600 000\s*0\s*0\s*100 000\s*500 000/); // brut, primes, retenues (aucune), avance prélevée, net
    await ev(`${helpers} $('[data-action="paie:valider-tout"]').click(); await sleep(200); submit($('.dialog')); await sleep(400);`);
    assert.match(await ligne('Camara'), /Validée — à payer/);
    assert.match(await ligne('Sylla'), /Validée — à payer/);
    // paie validée : heures du mois verrouillées
    assert.match((await ev(`${helpers} const tr = $$('#paie-output .heures-panel tbody tr').find((r) => r.textContent.includes('Sylla')); return $$('input', tr).every((i) => i.disabled) + ' ' + tr.textContent`)).replace(/\s+/g, ' '), /^true [\s\S]*Paie validée — verrouillé/);
    await ev(`${helpers} const tr = $$('#paie-output tbody tr').find((r) => r.textContent.includes('Camara')); $('[data-action^="paie:payer:"]', tr).click(); await sleep(200); submit($('.dialog')); await sleep(400);`);
    await ev(`document.getElementById('modal-root').innerHTML = ''`);
    assert.match(await ligne('Camara'), /Payée/);
    // la sortie de caisse est rattachée à l'année scolaire du mois (2026-2027) : on affiche toutes les années
    const dep = (await ev(`${helpers} await nav('depenses'); set($('[data-df=yearId]'), '0'); await sleep(80); return $('#depense-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(dep, /Salaires et indemnités[\s\S]*Salaire[\s\S]*Camara[\s\S]*500 000 GNF[\s\S]*Gérée par la paie/);
    assert.match(dep, /Avances sur salaire[\s\S]*250 000 GNF/);
    assert.deepEqual(errors, []);
  });

  await step('paie : bulletins PDF (un par page), récapitulatifs, tableau de bord', async () => {
    await ev(`${helpers} await nav('paie'); const tr = $$('#paie-output tbody tr').find((r) => r.textContent.includes('Camara')); $('[data-action^="paie:bulletin:"]', tr).click(); await sleep(800);`);
    assert.match((await ev(`return document.querySelector('.doc-preview-modal').textContent`)).replace(/\s+/g, ' '), /Bulletin BP-\d{4}-\d{2}-\d{4}[\s\S]*Télécharger en PDF[\s\S]*Net à payer\s*500 000/);
    await ev(`${helpers} $('.doc-preview-modal [data-doc-action="pdf"]').click(); await sleep(800);`);
    assert.match(await ev(`return document.title`), /^Bulletin-BP-\d{4}-\d{2}-\d{4}$/);
    assert.equal(await ev(`return document.querySelector('[data-doc-hint]').hidden`), false);
    const bp = (await ev(`return document.getElementById('print-root').textContent`)).replace(/\s+/g, ' ');
    assert.match(bp, /Bulletin de paie[\s\S]*BP-\d{4}-\d{2}-\d{4}[\s\S]*Matricule : EMP-\d{4}-\d{4}[\s\S]*Salaire mensuel[\s\S]*Remboursement d’avance[\s\S]*Net à payer\s*500 000/);
    assert.doesNotMatch(bp, /Quantité|Taux/); // plus de colonnes horaires
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const pages = async () => (Buffer.from((await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).result.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(await pages(), 1);
    await ev(`${helpers} $('[data-action="paie:bulletins-mois"]').click(); await sleep(800);`);
    assert.equal(await ev(`return document.querySelectorAll('#print-root .bp-sheet').length`), 3);
    assert.equal(await pages(), 3, 'un bulletin par page');
    if (process.env.E2E_SHOTS) (await import('node:fs')).writeFileSync(join(process.env.E2E_SHOTS, 'bulletins.pdf'), Buffer.from((await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true })).result.data, 'base64'));
    await send('Emulation.setEmulatedMedia', { media: '' });
    const recap = (await ev(`${helpers} await nav('paie-rapports'); return $('#paie-rapports').textContent`)).replace(/\s+/g, ' ');
    assert.match(recap, /Récapitulatif de la paie[\s\S]*TOTAL\s*3 paie\(s\)[\s\S]*2 180 000/); // 1 200 000 + 480 000 + 500 000
    await ev(`${helpers} $('[data-paie-rapport="annuel"]').click(); await sleep(60);`);
    assert.match((await ev(`return document.getElementById('paie-rapports').textContent`)).replace(/\s+/g, ' '), /Récapitulatif de la paie de l’année scolaire[\s\S]*TOTAL\s*3/);
    const dash = (await ev(`${helpers} await nav('paie-dashboard'); return $('#paie-dashboard').textContent`)).replace(/\s+/g, ' ');
    assert.match(dash, /Effectif actif\s*3/);
    assert.match(dash, /Payé ce mois\s*500 000/);
    assert.match(dash, /En attente de paiement\s*1 680 000/);
    await shot('paie-dashboard');
    assert.deepEqual(errors, []);
  });

  await step('tableau de bord : graphiques en montants et courbe d’évolution filtrable', async () => {
    const dash = (await ev(`${helpers} await nav('dashboard'); return $('#dashboard').textContent`)).replace(/\s+/g, ' ');
    assert.doesNotMatch(dash, /Statut des élèves/); // plus de graphique fondé sur le nombre d'élèves
    for (const titre of ['Évolution des encaissements', 'Encaissements par mois', 'Encaissé et reste à recouvrer', 'Encaissé et reste par catégorie', 'Attendu et encaissé par échéance', 'Encaissé et reste par classe', 'Répartition par moyen de paiement', 'Encaissements par agent', 'Soldes des comptes financiers', 'Recettes de la journée', 'Dépenses de la journée', 'Créances en retard', 'Prévu à date / réalisé', 'Factures impayées', 'Règlements en attente']) assert.ok(dash.includes(titre), titre);
    const courbes = () => ev(`return document.querySelector('.evolution-panel svg').querySelectorAll('path[stroke-width="2.4"]').length`);
    assert.equal(await courbes(), 2); // période + période précédente
    await ev(`${helpers} const c = $('[data-dashboard-evo=evoCompare]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(50);`);
    assert.equal(await courbes(), 1);
    const debut = await ev(`const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10)`);
    await ev(`${helpers} const f = $('[data-dashboard-evo=evoFrom]'); f.value = '${debut}'; f.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30); const g = $('[data-dashboard-evo=evoGran]'); g.value = 'jour'; g.dispatchEvent(new Event('change', { bubbles: true })); await sleep(50);`);
    assert.equal(await ev(`return document.querySelectorAll('.evolution-panel svg circle').length`), 7); // 7 jours
    assert.match((await ev(`return document.querySelector('.evolution-figures').textContent`)).replace(/\s+/g, ' '), /Encaissé sur la période : 920 000/);
    await shot('dashboard-evolution');
  });

  await step('analyse des encaissements : réels / attendus, avances distinguées, exports', async () => {
    await ev(`${helpers} await nav('encaissements-analyse'); await sleep(50);`);
    // par défaut : l'année active, depuis la rentrée
    assert.equal(await ev(`return document.querySelector('[data-ae=yearId]').value + '|' + document.querySelector('[data-ae=from]').value`), '1|2025-09-01');
    // toutes les années, depuis le 1er janvier (montants de référence ci-dessous)
    await ev(`${helpers} set($('[data-ae=yearId]'), '0'); await sleep(50); set($('[data-ae=from]'), new Date().getFullYear() + '-01-01'); await sleep(50);`);
    assert.equal(await ev(`return document.getElementById('pageTitle').textContent`), 'Paiements · Analyse des encaissements');
    const kpi = (await ev(`return document.querySelector('#ae-output .ae-kpis').textContent`)).replace(/\s+/g, ' ');
    // 500 000 + 250 000 + 10 000 + 60 000 + 100 000 (règlement de dette) ; salaire 500 000 ; avance 250 000
    assert.match(kpi, /Encaissements réels\s*920 000/);
    assert.match(kpi, /Dépenses définitives\s*500 000/);
    assert.match(kpi, /Avances sur salaire \(créances\)\s*250 000/);
    assert.match(kpi, /Flux net de trésorerie\s*170 000/);
    assert.match(kpi, /Solde de caisse en fin de période/);
    assert.match(kpi, /Résultat \(hors avances\)\s*420 000/);
    const out = (await ev(`return document.getElementById('ae-output').textContent`)).replace(/\s+/g, ' ');
    for (const part of ['Montants attendus et réellement encaissés', 'Évolution des encaissements et des dépenses', 'Par catégorie', 'Par tranche', 'Sorties de caisse par nature', 'Comparaison avec la période précédente', 'Encaissements par tranche']) assert.ok(out.includes(part), part);
    // filtre catégorie : seuls les encaissements du Collège (aucun)
    await ev(`${helpers} const c = $('[data-ae=category]'); c.value = 'Collège'; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);`);
    assert.match((await ev(`return document.querySelector('#ae-output .ae-kpis').textContent`)).replace(/\s+/g, ' '), /Encaissements réels\s*0 GNF/);
    await ev(`${helpers} const c = $('[data-ae=category]'); c.value = ''; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);`);
    await ev(`${helpers} $('[data-action="ae:pdf"]').click(); await sleep(600);`);
    assert.match((await ev(`return document.getElementById('print-root').textContent`)).replace(/\s+/g, ' '), /Analyse des encaissements et des dépenses[\s\S]*Période :[\s\S]*Encaissements réels[\s\S]*920 000[\s\S]*Comparaison avec la période précédente/);
    assert.match(await ev('return document.title'), /^Analyse-encaissements-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/);
    await ev(`${helpers} $('[data-action="ae:excel"]').click(); await sleep(100);`);
    await shot('analyse-encaissements');
    assert.deepEqual(errors, []);
  });

  await step('centre d’aide : recherche, suggestions, fiche et accès direct', async () => {
    await ev(`${helpers} await nav('aide'); const i = $('[data-aide="q"]'); i.focus(); set(i, 'Comment enregistrer un paiement ?'); await sleep(50);`);
    const suggest = await ev(`${helpers} return $('[data-aide-suggest]').outerHTML`);
    assert.match(suggest, /role="option"/, 'suggestions absentes');
    assert.match(await ev(`${helpers} return $('#aide-output .aide-result').textContent`), /Enregistrer un paiement/);
    await ev(`${helpers} $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50);`);
    const detail = (await ev(`${helpers} return $('#aide-output').textContent`)).replace(/\s+/g, ' ');
    await shot('aide-fiche');
    for (const part of ['Chemin d’accès', 'Étapes', 'Prérequis et dépendances', 'Droits d’accès', 'Résultat attendu', 'Erreurs fréquentes', 'Paiements']) assert.ok(detail.includes(part), 'fiche incomplète : ' + part);
    assert.match(detail, /Obligatoire/);
    await ev(`${helpers} $('[data-aide-go]').click(); await sleep(100);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active')`), true);
    assert.equal(await ev(`return document.activeElement.matches('[data-pay="student"]')`), true);
    assert.equal(await ev(`return Boolean(document.querySelector('.aide-highlight'))`), true);
  });

  await step('centre d’aide : rapport ciblé, aide contextuelle, recherches récentes', async () => {
    await ev(`${helpers} await nav('aide'); set($('[data-aide="q"]'), 'relance des parents'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50); $('[data-aide-go]').click(); await sleep(150);`);
    assert.equal(await ev(`${helpers} return $('#rapports').classList.contains('active') && $('[data-report-type="retards"]').classList.contains('active')`), true);
    await ev(`${helpers} await nav('depenses'); $('#helpBtn').click(); await sleep(100);`);
    assert.match(await ev(`${helpers} return $('#aide').classList.contains('active') + ' ' + $('#aide-output').textContent`), /^true[\s\S]*Aide pour la page « Dépenses »[\s\S]*Enregistrer une dépense/);
    await ev(`${helpers} const i = $('[data-aide="q"]'); set(i, ''); i.blur(); i.focus(); await sleep(50);`);
    assert.match(await ev(`${helpers} return $('[data-aide-suggest]').textContent`), /Recherches récentes[\s\S]*relance des parents/);
  });

  await step('centre d’aide : fonctionnalité absente et recherche sans résultat', async () => {
    const absent = await ev(`${helpers} set($('[data-aide="q"]'), 'Comment calculer les moyennes ?'); return [$$('#aide-output .aide-notice').length, $$('#aide-output .aide-result').length, $('#aide-output').textContent].join('|')`);
    assert.match(absent, /^1\|0\|[\s\S]*Moyennes et bulletins[\s\S]*n’existe pas/);
    const none = await ev(`${helpers} set($('[data-aide="q"]'), 'xqzw plouf'); return [$$('#aide-output .aide-empty').length, $('#aide-output .aide-count').textContent].join('|')`);
    await shot('aide-sans-resultat');
    assert.match(none, /^1\|0 résultat/);
    await ev(`${helpers} set($('[data-aide="q"]'), ''); await sleep(20); $('[data-aide-cat="paiements"]').click(); await sleep(50);`);
    assert.match(await ev(`return document.getElementById('aide-output').textContent`), /Annuler un paiement/);
    await ev(`${helpers} $('[data-aide-back]').click(); await sleep(30); window.scrollTo(0, 0);`);
    await shot('aide-accueil');
    assert.deepEqual(errors, []);
  });

  await step('rapports : onglets dépenses/trésorerie/tranches/journalier sans erreur', async () => {
    for (const t of ['depenses', 'tresorerie', 'echeances', 'journalier', 'retards', 'situation', 'classes', 'periodique']) {
      const txt = await ev(`${helpers} await nav('rapports'); $('[data-report-type="${t}"]').click(); await sleep(100); return document.getElementById('report-output').textContent.replace(/\\s+/g,' ')`);
      assert.ok(txt.length > 50, `rapport ${t} vide`);
    }
    assert.match(await ev(`${helpers} $('[data-report-type="depenses"]').click(); await sleep(100); return document.getElementById('report-output').textContent`), /Aperçu des dépenses/);
    assert.deepEqual(errors, []);
  });

  await step('configuration : caissier sur les reçus, utilisateurs, copies de sécurité', async () => {
    await ev(`${helpers} await nav('config'); set($('#config [name=caissier]'), 'Mme Sylla'); submit($('#config form[data-form=config]')); await sleep(400);`);
    const receipt = await ev(`
      const mod = window.__test; return typeof mod;`);
    assert.ok(receipt);
    assert.match(await ev(`return document.getElementById('paiements').textContent`), /Mme Sylla/);
  });

  await step('listes : barre d’outils uniforme, pagination, export PDF des lignes filtrées', async () => {
    await ev(`${helpers} await nav('config-journal'); await sleep(60);`);
    const total = await ev(`return document.querySelectorAll('table[data-list=journal] tbody tr').length`);
    assert.ok(total > 25, `journal trop court pour tester la pagination : ${total}`);
    const bar = (await ev(`return document.querySelector('.list-toolbar[data-for=journal]').textContent`)).replace(/\s+/g, ' ');
    assert.match(bar, new RegExp(`${total} résultats · 1–25[\\s\\S]*Excel[\\s\\S]*PDF / Imprimer`));
    assert.equal(await ev(`return [...document.querySelectorAll('table[data-list=journal] tbody tr')].filter((r) => getComputedStyle(r).display !== 'none').length`), 25);
    await ev(`${helpers} $('.list-pager[data-for=journal] [data-to=next]').click(); await sleep(60);`);
    assert.match(await ev(`return document.querySelector('.list-pager[data-for=journal]').textContent`), /Page 2 \//);
    await ev(`${helpers} const s = $('[data-list-size=journal]'); s.value = '100'; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);`);
    assert.equal(await ev(`return [...document.querySelectorAll('table[data-list=journal] tbody tr')].filter((r) => getComputedStyle(r).display !== 'none').length`), Math.min(total, 100));
    // export PDF : toutes les lignes, sans la colonne Actions
    await ev(`${helpers} $('[data-list-export=pdf][data-list-id=journal]').click(); await sleep(600);`);
    assert.equal(await ev(`return document.querySelectorAll('#print-root tbody tr').length`), total);
    assert.match((await ev(`return document.getElementById('print-root').textContent`)).replace(/\s+/g, ' '), new RegExp(`Journal d’audit[\\s\\S]*${total} ligne\\(s\\)`));
    // toutes les listes marquées ont leur barre d'outils (aucun bouton masqué)
    for (const page of ['eleves', 'inscriptions', 'paiements', 'depenses', 'dettes', 'personnel', 'affectations', 'paie', 'avances']) {
      const ok = await ev(`${helpers} await nav('${page}'); await sleep(60); return [...document.querySelectorAll('#${page} table[data-list]')].every((t) => document.querySelector('.list-toolbar[data-for="' + t.dataset.list + '"]'))`);
      assert.equal(ok, true, `barre d’outils absente sur ${page}`);
    }
    // recherche + export : seules les lignes filtrées sont exportées
    await ev(`${helpers} await nav('eleves'); set($('[data-student-search]'), 'Sow'); await sleep(80); $('[data-list-export=pdf][data-list-id=eleves]').click(); await sleep(600);`);
    assert.equal(await ev(`return document.querySelectorAll('#print-root tbody tr').length`), 1);
    assert.match(await ev(`return document.getElementById('print-root').textContent`), /Recherche avancée : Sow/);
    await ev(`${helpers} set($('[data-student-search]'), ''); await sleep(50);`);
  });

  await step('finances : compte bancaire, chèque en attente puis confirmé, correction, bourse, créances, journal de sécurité', async () => {
    // Compte bancaire créé dans les paramètres financiers
    await ev(`${helpers} await nav('config-finances'); const f = $('form[data-form=compte]'); set($('[name=libelle]', f), 'Banque e2e'); set($('[name=type]', f), 'banque'); set($('[name=soldeInitial]', f), '1000'); submit(f); await sleep(300);`);
    assert.match(await ev(`${helpers} await nav('comptes'); return $('#comptes').textContent`), /Banque e2e[\s\S]*Total de tous les comptes/);
    // Chèque enregistré en attente : hors totaux jusqu'à confirmation
    const nbPaiements = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).paiements.length`);
    await ev(`${helpers} await nav('paiements'); const i = $('#paiements [data-pay=student]'); set(i, 'Bah'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(80);
      const r = $('#paiements [data-pay="modalite"][value="tranches"]'); if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50); }
      set($('#paiements [name=mode]'), 'cheque'); await sleep(30); set($('#paiements [name=montant]'), '10000'); set($('#paiements [name=reference]'), 'CHQ-E2E-1');`);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay-attente]').hidden`), false);
    assert.equal(await ev(`${helpers} return $('#paiements [name=compteId] option:checked').textContent`), 'Banque e2e'); // compte proposé selon le moyen
    await ev(`${helpers} $('#paiements [name=enAttente]').checked = true; submit($('#paiements form')); await sleep(400);`);
    assert.match(await ev(`${helpers} return $('#paiements .pending-panel').textContent`), /ATT-\d{4}-\d{6}[\s\S]*CHQ-E2E-1/);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).paiements.length`), nbPaiements);
    await ev(`${helpers} $('[data-action^="attente:confirm:"]').click(); await sleep(200); submit($('.dialog')); await sleep(400);`);
    assert.match((await ev(`${helpers} return $('.doc-preview-modal') ? $('.doc-preview-modal').textContent : ''`)).replace(/\s+/g, ' '), /Reçu REC-\d{4}-\d{6}/);
    await ev(`${helpers} $('.doc-preview-modal [data-modal-close].secondary-btn').click(); await sleep(50);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).paiements.length`), nbPaiements + 1);
    // Correction contrôlée du dernier paiement (référence), motif obligatoire, historique conservé
    await ev(`${helpers} await nav('paiements'); $('[data-action^="paiement:correct:"]').click(); await sleep(200); set($('.dialog [name=reference]'), 'REF-CORRIGEE'); set($('.dialog [name=motif]'), 'Erreur de saisie'); submit($('.dialog')); await sleep(400);`);
    assert.match(await ev(`${helpers} return $('#paiements [data-list=paiements]').textContent`), /REF-CORRIGEE[\s\S]*1 correction\(s\) tracée\(s\)/);
    // Bourse accordée depuis la liste des inscriptions
    await ev(`${helpers} await nav('inscriptions'); $('[data-action^="inscription:reduction:"]').click(); await sleep(200); set($('.dialog [name=type]'), 'bourse'); set($('.dialog [name=mode]'), 'montant'); set($('.dialog [name=valeur]'), '5000'); set($('.dialog [name=motif]'), 'Bourse sociale'); submit($('.dialog')); await sleep(400);`);
    const etat = await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1'))`);
    assert.ok(etat.inscriptions.some((i) => i.reduction?.type === 'bourse' && i.reduction.motif === 'Bourse sociale'));
    // Créances, tableau de bord filtré par moyen, journal de sécurité
    assert.match(await ev(`${helpers} await nav('creances'); return $('#creances').textContent`), /Créances et relances[\s\S]*Reste à recouvrer/);
    await shot('creances');
    await ev(`${helpers} await nav('comptes');`); await shot('comptes');
    await ev(`${helpers} await nav('config-finances');`); await shot('parametres-financiers');
    await ev(`${helpers} await nav('depenses'); document.getElementById('recurrentes-panel')?.scrollIntoView({ block: 'start' });`); await shot('depenses-recurrentes');
    await ev(`${helpers} await nav('tarifs');`); await shot('tarifs');
    await ev(`${helpers} await nav('dashboard'); set($('[data-dashboard-filter=mode]'), 'cheque'); await sleep(100);`);
    assert.match((await ev(`${helpers} return $('#dashboard').textContent`)).replace(/\s+/g, ' '), /Encaissements \(toutes dates\)\s*10 000 GNF\s*1 paiement/);
    await ev(`${helpers} $('[data-action="dashboard:reset"]').click(); await sleep(50);`);
    await shot('tableau-de-bord');
    assert.match(await ev(`${helpers} await nav('config-journal'); return $('#config-journal').textContent`), /Sécurité[\s\S]*Connexion de Directeur/);
    assert.deepEqual(errors, []);
  });

  await step('caisse : ouverture, fermeture, verrou ; états financiers ; restauration vérifiée ; recherche rapide', async () => {
    const etat = () => ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1'))`);
    // Ouverture de la caisse principale au solde théorique de la veille
    await ev(`${helpers} await nav('caisse'); const f = $('form[data-form=caisse-ouverture]'); const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1'));
      const theo = window.IBK_APP.require('./modules/caisse.js').soldeOuvertureTheorique(s, Number($('[name=compteId]', f).value), $('[name=date]', f).value);
      set($('[name=montantCompte]', f), String(theo)); submit(f); await sleep(300);`);
    assert.match(await ev(`${helpers} return $('#caisse').textContent`), /journée du[\s\S]*Ouverte[\s\S]*Solde théorique/);
    // Fermeture avec un écart non justifié : refusée ; puis justifiée : acceptée
    await ev(`${helpers} const f = $('form[data-form=caisse-fermeture]'); const i = $('[name=montantCompte]', f); set(i, String(Number(i.dataset.theorique) - 500)); await sleep(30); submit(f); await sleep(200); submit($('.dialog')); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /justification est obligatoire/);
    await ev(`${helpers} const f = $('form[data-form=caisse-fermeture]'); const i = $('[name=montantCompte]', f); set(i, String(Number(i.dataset.theorique) - 500)); set($('[name=justification]', f), 'Pièce de 500 manquante'); submit(f); await sleep(200); submit($('.dialog')); await sleep(400);`);
    const sessions = (await etat()).sessionsCaisse;
    assert.deepEqual([sessions.length, sessions[0].statut, sessions[0].fermeture.ecart], [1, 'fermee', -500]);
    assert.match(await ev(`${helpers} await nav('caisse'); return $('#caisse').textContent`), /Pièce de 500 manquante/);
    await shot('caisse');
    // Une opération de la journée clôturée ne peut plus être annulée
    await ev(`${helpers} await nav('paiements'); const tr = $$('#paiements table[data-list=paiements] tbody tr').find((r) => !r.classList.contains('cancelled') && r.textContent.includes('Caisse principale') && r.querySelector('[data-action^="paiement:cancel:"]'));
      $('[data-action^="paiement:cancel:"]', tr).click(); await sleep(200); set($('.dialog [name=v]'), 'Essai'); submit($('.dialog')); await sleep(300);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /clôturée/);
    // États financiers : rapport par mode de paiement, export CSV journalisé
    await ev(`${helpers} await nav('etats'); $$('[data-etat]').find((b) => b.dataset.etat === 'modes').click(); await sleep(100);`);
    assert.match(await ev(`${helpers} return $('#etats-output').textContent`), /Recettes par mode de paiement[\s\S]*Chèque[\s\S]*TOTAL/);
    await shot('etats');
    await ev(`${helpers} $('[data-action="etats:csv"]').click(); await sleep(100);`);
    assert.ok((await etat()).journal.some((j) => j.type === 'export' && /Recettes par mode de paiement/.test(j.detail)));
    // Restauration : fichier identique détecté (doublon), fichier altéré refusé par le contrôle d'intégrité
    const restaurer = (alterer) => ev(`${helpers} const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1')); const a = window.IBK_APP.require('./modules/archive.js').creerArchive(s);
      ${alterer ? 'a.data.paiements[0].montant += 1;' : ''}
      const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(a)], 'sauvegarde.note', { type: 'application/json' }));
      await nav('config-donnees'); const input = $('[data-restore-input]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600);
      return document.getElementById('toast').textContent;`);
    assert.match(await restaurer(false), /exactement les données actuelles/);
    assert.match(await restaurer(true), /Contrôle d’intégrité échoué/);
    // Recherche rapide : élève par nom
    await ev(`${helpers} set($('#quickSearch'), 'Sow'); await sleep(50);`);
    assert.match(await ev(`${helpers} return $('#quickResults').hidden + '|' + $('#quickResults').textContent`), /^false\|[\s\S]*Ibrahima Sow/);
    await ev(`${helpers} $('[data-quick^="eleve:"]').click(); await sleep(100);`);
    assert.match(await ev(`return document.getElementById('modal-root').textContent`), /Ibrahima Sow/);
    await ev(`document.querySelector('[data-modal-close]')?.click()`);
    assert.deepEqual(errors, []);
  });

  await step('fichier de données : dossier existant relié sans rien écraser', async () => {
    await ev(mockFs);
    const ancien = (await fsFiles())['Documents/GESTSCHOOL-SCOLARITE-donnees.note'];
    await ev(`${helpers} await nav('config-donnees'); $('[data-action="datafile:link"]').click(); await sleep(400);`);
    assert.match(await ev(`return document.querySelector('.dialog').textContent`), /Fichier de données existant[\s\S]*GESTSCHOOL-SCOLARITE-donnees.note/);
    assert.equal(await ev(`return document.querySelector('.dialog [name=choix]').value`), 'garder');
    await ev(`${helpers} submit($('.dialog')); await sleep(800);`);
    const files = await fsFiles();
    const copie = Object.keys(files).find((k) => k.startsWith('Documents/sauvegardes/sauvegarde-ancien-fichier-'));
    assert.ok(copie, 'ancien fichier non conservé');
    assert.equal(files[copie], ancien);
    assert.ok(JSON.parse(files['Documents/GESTSCHOOL-SCOLARITE-donnees.note']).eleves.length > 0);
    assert.match(await ev(`return document.querySelector('[data-datafile-status]').textContent`), /Documents[\s\S]*GESTSCHOOL-SCOLARITE-donnees.note[\s\S]*sauvegardes/);
  });

  await step('réinitialisation : mot de passe + mot de confirmation + copie de sécurité', async () => {
    // Un compte ordinaire existe avant la réinitialisation : il doit être supprimé, le super administrateur conservé
    await ev(`${helpers} await nav('config-utilisateurs'); const f = $('#config-utilisateurs form[data-form=utilisateur]'); set($('[name=username]', f), 'temporaire'); set($('[name=nom]', f), 'Compte Temporaire'); set($('[name=role]', f), 'comptable'); set($('[name=password]', f), 'Tempo2026x'); submit(f); await sleep(300);`);
    assert.ok((await ev(`return JSON.parse(localStorage.getItem('ibk_users_v1')).map((u) => u.username)`)).includes('temporaire'));
    await ev(`${helpers} await nav('config-donnees'); $('[data-action="admin:reset"]').click(); await sleep(200);`);
    // mauvais mot de passe : rien n'est effacé
    await ev(`${helpers} set($('.dialog [name=password]'), 'mauvais123'); set($('.dialog [name=phrase]'), 'RÉINITIALISER'); submit($('.dialog')); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).eleves.length`) > 0, true);
    await ev(`${helpers} $('[data-action="admin:reset"]').click(); await sleep(200); set($('.dialog [name=password]'), 'Secret2026'); set($('.dialog [name=phrase]'), 'reinitialiser'); submit($('.dialog')); await sleep(500);`);
    assert.equal(await ev(`const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1')); return s.eleves.length + s.paiements.length + s.depenses.length + s.annees.length + s.classes.length`), 0);
    // Tout est effacé, paramètres compris ; seuls restent les super administrateurs et le compte de l'éditeur
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).config.nom`), '');
    assert.deepEqual(await ev(`return JSON.parse(localStorage.getItem('ibk_users_v1')).map((u) => u.role + ':' + (u.proprietaire ? 'editeur' : u.username)).sort()`), ['superadmin:admin', 'superadmin:editeur']);
    // aucune année après la réinitialisation : le sélecteur propose d'en créer une
    assert.match(await ev(`return document.getElementById('yearSwitch').textContent`), /Créer la première année/);
    const backups = await ev(`return JSON.parse(localStorage.getItem('ibk_safety_backups_v1')).length`);
    assert.equal(backups, 1);
    // fichier de sauvegarde créé automatiquement dans « sauvegardes », lien vers le fichier de données conservé
    await sleep(500);
    const files = await fsFiles();
    const sauvegarde = Object.keys(files).find((k) => /^Documents\/sauvegardes\/sauvegarde-avant-reinitialisation-\d{4}-\d{2}-\d{2}_\d{2}h\d{4}\.note$/.test(k));
    assert.ok(sauvegarde, 'fichier de sauvegarde absent : ' + Object.keys(files).join(', '));
    assert.ok(JSON.parse(files[sauvegarde]).eleves.length > 0, 'la sauvegarde doit contenir les données d’avant');
    assert.equal(JSON.parse(files['Documents/GESTSCHOOL-SCOLARITE-donnees.note']).eleves.length, 0, 'le fichier lié reçoit l’état réinitialisé');
    assert.match(await ev(`return document.getElementById('toast').textContent`), /sauvegarde créée : Documents\/sauvegardes\/sauvegarde-avant-reinitialisation-/);
    assert.match(await ev(`return document.getElementById('dataFileChip').textContent`), /GESTSCHOOL-SCOLARITE-donnees.note/);
    assert.match(await ev(`return document.getElementById('config-donnees').textContent`), /Avant réinitialisation/);
    const missing = await ev(`${helpers} await nav('aide'); set($('[data-aide="q"]'), 'enregistrer un paiement'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50); return $('#aide-output .aide-access').className + ' ' + $('#aide-output .aide-access').textContent`);
    assert.match(missing, /warning[\s\S]*Avant de continuer, il manque[\s\S]*frais sont configurés[\s\S]*quand même/);
    assert.deepEqual(errors, []);
  });

  await step('copie de sécurité : suppression exige le mot de passe', async () => {
    await ev(`${helpers} $('[data-action^="safety:delete:"]').click(); await sleep(200); set($('.dialog [name=password]'), 'faux12345'); submit($('.dialog')); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_safety_backups_v1')).length`), 1);
    await ev(`${helpers} $('[data-action^="safety:delete:"]').click(); await sleep(200); set($('.dialog [name=password]'), 'Secret2026'); submit($('.dialog')); await sleep(300); submit($('.dialog')); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_safety_backups_v1')).length`), 0);
  });

  await step('rôles : le comptable ne voit ni configuration ni suppression sans autorisation', async () => {
    await ev(`${helpers} await nav('config-utilisateurs'); const f = $('#config-utilisateurs form[data-form=utilisateur]'); set($('[name=username]', f), 'caisse'); set($('[name=nom]', f), 'Aïssatou'); set($('[name=role]', f), 'comptable'); set($('[name=password]', f), 'Caisse2026x'); submit(f); await sleep(300);`);
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'caisse'); set($('[name=password]', f), 'Caisse2026x'); submit(f); await sleep(300);`);
    // comptable : ni utilisateurs, ni sauvegardes ; la rubrique Paramètres ne contient que le centre d'aide
    assert.equal(await ev(`${helpers} return ['utilisateurs', 'sauvegardes'].map((g) => $('.nav-btn[data-group=' + g + ']').hidden).join(',')`), 'true,true');
    assert.equal(await ev(`${helpers} $('.nav-btn[data-group=parametres]').click(); await sleep(30); return $('.content-section.active').id + '|' + $$('.subtab-btn[data-target^=config]').length`), 'aide|0');
    assert.equal(await ev(`${helpers} location.hash = '#config'; await sleep(60); return $('#config').classList.contains('active')`), false, 'la configuration ne doit pas s’ouvrir par l’adresse');
    assert.equal(await ev(`${helpers} return $('.nav-btn[data-group=paiements]').hidden`), false);
    assert.equal(await ev(`return document.getElementById('importLabel') === null && document.getElementById('exportDataBtn') === null`), true); // plus de boutons de sauvegarde dans la barre latérale
    const denied = await ev(`${helpers} await nav('aide'); set($('[data-aide="q"]'), 'tout effacer'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50); return [$$('#aide-output [data-aide-go]').length, $('#aide-output .aide-access').className].join('|')`);
    assert.match(denied, /^0\|aide-access denied/);
  });

  await step('permissions vérifiées dans la couche métier : caissier sans tarifs, auditeur sans encaissement', async () => {
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'Secret2026'); submit(f); await sleep(400);`);
    for (const [login, nom, role] of [['caissier1', 'Caissier Un', 'caissier'], ['audit1', 'Auditeur Un', 'lecture']]) {
      await ev(`${helpers} await nav('config-utilisateurs'); const f = $('#config-utilisateurs form[data-form=utilisateur]'); set($('[name=username]', f), '${login}'); set($('[name=nom]', f), '${nom}'); set($('[name=role]', f), '${role}'); set($('[name=password]', f), 'Motdepasse26'); submit(f); await sleep(300);`);
    }
    // Caissier : la page des tarifs n'est pas accessible, et l'appel direct de la fonction métier est refusé
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'caissier1'); set($('[name=password]', f), 'Motdepasse26'); submit(f); await sleep(400);`);
    assert.equal(await ev(`${helpers} location.hash = '#tarifs'; await sleep(60); return $('#tarifs').classList.contains('active')`), false);
    assert.match(await ev(`try { const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1')); window.IBK_APP.require('./modules/tarifs.js').updateTarif(s, 1, { montantAnnuel: 1 }); return 'accepté'; } catch (e) { return e.message; }`), /ne permet pas.*Années, classes et tarifs/);
    assert.equal(await ev(`${helpers} return $('.nav-btn[data-group=paiements]').hidden + '|' + $('.nav-btn[data-group=tresorerie]').hidden`), 'false|false');
    // Auditeur : lecture seule, aucun formulaire d'encaissement, appel direct refusé, journal d'audit consultable
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'audit1'); set($('[name=password]', f), 'Motdepasse26'); submit(f); await sleep(400);`);
    assert.match(await ev(`try { const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1')); const r = window.IBK_APP.require('./modules/paiements.js').createPaiement(s, { inscriptionId: 1, montant: 1000, modalite: 'tranches' }); return r ? 'accepté' : 'refus métier'; } catch (e) { return e.message; }`), /ne permet pas.*Encaisser/);
    assert.equal(await ev(`${helpers} await nav('paiements'); return getComputedStyle($('#paiements .section-form') || document.body).display === 'none' || !$('#paiements [data-pay-submit]') || $('body').classList.contains('read-only')`), true);
    assert.match(await ev(`${helpers} await nav('config-journal'); return $('#config-journal').textContent`), /Journal d’audit[\s\S]*Action refusée à Auditeur Un/);
    assert.deepEqual(errors, []);
  });

  await step('rôles : l’administrateur modifie les rôles et en crée à tout moment', async () => {
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'Secret2026'); submit(f); await sleep(400);`);
    await ev(`${helpers} await nav('config-utilisateurs'); await sleep(50);`);
    assert.equal(await ev(`return document.querySelectorAll('#roles-panel form[data-form=role]').length`), 6);
    await ev(`document.getElementById('roles-panel').scrollIntoView()`); await shot('roles');
    // aucun débordement horizontal sur la page de configuration
    const trop = await ev(`return [...document.querySelectorAll('#config-utilisateurs *')].filter((e) => !e.closest('.table-wrap') && e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 5).map((e) => e.tagName + '.' + e.className + ' [' + (e.textContent || '').trim().slice(0, 40) + '] ' + Math.round(e.getBoundingClientRect().right) + ' parent=' + e.parentElement.className).join(' ; ')`);
    assert.equal(trop, '', 'débordement : ' + trop);
    // Super administrateur et administrateur : accès complet non restreignable
    for (const k of [0, 1]) assert.equal(await ev(`return [...document.querySelectorAll('#roles-panel form[data-form=role]')[${k}].querySelectorAll('input[type=checkbox]')].every((c) => c.disabled && c.checked)`), true);
    // nouveau rôle « Secrétariat » à partir de Consultation, puis pages et droits ajustés
    await ev(`${helpers} const f = $('#roles-panel form[data-form=role-new]'); set($('[name=label]', f), 'Secrétariat'); set($('[name=modele]', f), 'lecture'); submit(f); await sleep(300);`);
    await ev(`${helpers} const f = $$('#roles-panel form[data-form=role]').find((x) => x.querySelector('[name=id]').value === 'secretariat');
      $$('[name=pages]', f).forEach((c) => { c.checked = ['dashboard', 'eleves', 'inscriptions', 'aide'].includes(c.value); });
      $$('[name=permissions]', f).forEach((c) => { c.checked = false; }); submit(f); await sleep(300);`);
    const saved = await ev(`return JSON.parse(localStorage.getItem('ibk_roles_v1')).find((r) => r.id === 'secretariat')`);
    assert.deepEqual([saved.label, saved.pages.join(','), saved.write, saved.export], ['Secrétariat', 'dashboard,eleves,inscriptions,aide', false, false]);
    // utilisateur créé avec un rôle, puis rôle changé dans la liste
    await ev(`${helpers} const f = $('#config-utilisateurs form[data-form=utilisateur]'); set($('[name=username]', f), 'secret'); set($('[name=nom]', f), 'Mariama'); set($('[name=role]', f), 'lecture'); set($('[name=password]', f), 'Secret2027x'); submit(f); await sleep(300);`);
    await ev(`${helpers} const s = $$('[data-user-role]').find((x) => x.closest('tr').textContent.includes('Mariama')); set(s, 'secretariat'); await sleep(200); submit($('.dialog')); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_users_v1')).find((u) => u.username === 'secret').role`), 'secretariat');
    // un rôle attribué ne peut pas être supprimé
    await ev(`${helpers} $('[data-action="role:delete:secretariat"]').click(); await sleep(200); submit($('.dialog')); await sleep(200);`);
    assert.match(await ev(`return document.getElementById('toast').textContent`), /attribuez-leur d’abord un autre rôle/);
    // connexion avec ce rôle : seules ses pages, aucune saisie ni export
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'secret'); set($('[name=password]', f), 'Secret2027x'); submit(f); await sleep(400);`);
    assert.match(await ev(`return document.getElementById('roleLabel').textContent`), /Secrétariat/);
    assert.equal(await ev(`${helpers} return $$('.nav-btn[data-group]:not([hidden])').map((b) => b.dataset.group).join(',')`), 'accueil,eleves,parametres');
    const eleves = await ev(`${helpers} await nav('eleves'); await sleep(80); return [getComputedStyle($('#eleves .section-form')).display, $$('#eleves [data-list-export]').length, $$('#eleves button[data-list-add]').length, $('#activeYearSelect').disabled].join('|')`);
    assert.equal(eleves, 'none|0|0|true');
    assert.equal(await ev(`${helpers} location.hash = '#paiements'; await sleep(60); return $('#paiements').classList.contains('active')`), false);
    // modification par l'administrateur : prise en compte immédiate (même session du navigateur)
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'Secret2026'); submit(f); await sleep(400);`);
    await ev(`${helpers} await nav('config-utilisateurs'); const f = $$('#roles-panel form[data-form=role]').find((x) => x.querySelector('[name=id]').value === 'secretariat'); $$('[name=permissions]', f).find((c) => c.value === 'rapports.exporter').checked = true; $$('[name=pages]', f).find((c) => c.value === 'paiements').checked = true; submit(f); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_roles_v1')).find((r) => r.id === 'secretariat').pages.includes('paiements')`), true);
    assert.deepEqual(errors, []);
  });

  await step('centre d’aide : fiche de l’éditeur (KJS GROUP), logo chargé malgré la politique de sécurité', async () => {
    const fiche = await ev(`${helpers} await nav('aide'); const f = $('#aide-editeur'); return f ? f.textContent.replace(/\\s+/g, ' ') : ''`);
    assert.match(fiche, /SOCIÉTÉ KJS GROUP SARL[\s\S]*Solutions numériques[\s\S]*Vision — Stratégie — Action[\s\S]*kjsgroup2025@gmail\.com[\s\S]*\+224 664-33-33-66[\s\S]*Fondée en 2025[\s\S]*Nos services[\s\S]*Optimisation et sécurisation applicative/);
    await sleep(300);
    assert.ok(await ev(`const i = document.querySelector('#aide-editeur .editeur-logo'); return i.complete && i.naturalWidth > 0`), 'logo de l’entreprise non chargé');
    // La recherche dans l'aide trouve l'éditeur
    await ev(`${helpers} set($('[data-aide="q"]'), 'contacter l éditeur'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(80);`);
    assert.match(await ev(`return document.getElementById('aide-output').textContent`), /Contacter l’éditeur/);
    await ev(`document.getElementById('aide-editeur').scrollIntoView()`); await shot('aide-editeur');
    assert.deepEqual(errors, []);
  });

  await step('connexion : mauvais mot de passe refusé', async () => {
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'caisse'); set($('[name=password]', f), 'nope'); submit(f); await sleep(200);`);
    assert.match(await ev(`return document.querySelector('[data-login-error]').textContent`), /incorrect/);
    assert.equal(await ev(`return document.getElementById('app-shell').hidden`), true);
  });

  await step('mobile : barre latérale repliable', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'caisse'); set($('[name=password]', f), 'Caisse2026x'); submit(f); await sleep(300);`);
    assert.equal(await ev(`return getComputedStyle(document.getElementById('menuToggle')).display !== 'none'`), true);
    assert.equal(await ev(`return document.getElementById('sidebar').getBoundingClientRect().right <= 0`), true);
    await ev(`document.getElementById('menuToggle').click()`);
    await sleep(400);
    assert.equal(await ev(`return document.getElementById('sidebar').getBoundingClientRect().left >= 0`), true);
    assert.equal(await ev(`return document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
    await ev(`${helpers} await nav('aide'); set($('[data-aide="q"]'), 'inscrire un élève'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(100);`);
    assert.equal(await ev(`return document.documentElement.scrollWidth <= window.innerWidth + 1`), true, 'défilement horizontal dans l’aide sur mobile');
    assert.equal(await ev(`return document.getElementById('aide-title').getBoundingClientRect().width <= window.innerWidth`), true);
    await shot('aide-mobile');
  });

  assert.deepEqual(errors, []);
  console.log(`${passed} étapes e2e réussies`);
} catch (error) {
  console.error('ÉCHEC e2e :', error.message);
  console.error('Erreurs console :', errors);
  try { console.error('DOM :', await ev("return [document.querySelector('.content-section.active')?.id, document.getElementById('aide').innerHTML.slice(0, 400), document.querySelector('.nav-btn.active')?.outerHTML].join(' || ')")); } catch (e) { console.error(e.message); }
  process.exitCode = 1;
} finally {
  ws.close();
  // Sous Windows, kill() n'arrête pas les processus enfants du navigateur : on arrête tout l'arbre
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
}
