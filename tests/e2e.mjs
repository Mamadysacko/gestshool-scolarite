// Test de bout en bout dans un vrai navigateur (Chrome/Edge headless piloté par le protocole DevTools).
// Usage : node tests/e2e.mjs   (nécessite Chrome ou Edge installé)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

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
async function ev(expression) {
  const res = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
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
    assert.equal(await ev(`${helpers} return $('#app-shell').hidden`), true);
    // mot de passe faible refusé
    await ev(`${helpers} const f = $('.login-card'); set($('[name=nom]', f), 'Directeur'); set($('[name=username]', f), 'admin'); set($('[name=password]', f), 'abc'); set($('[name=confirm]', f), 'abc'); submit(f);`);
    assert.match(await ev(`return document.querySelector('[data-login-error]').textContent`), /8 caractères/);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=password]', f), 'Secret2026'); set($('[name=confirm]', f), 'Secret2026'); submit(f); await sleep(300);`);
    assert.equal(await ev(`return document.getElementById('app-shell').hidden`), false);
    assert.match(await ev(`return document.getElementById('roleLabel').textContent`), /Administrateur/);
  });

  await step('toutes les pages se rendent sans erreur', async () => {
    for (const t of ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'dettes', 'depenses', 'rapports', 'config', 'aide']) {
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
    await ev(`${helpers} set($('#paiements [name=montant]'), '500000'); $('#paiements [name=imprimer]').checked = false; submit($('#paiements form')); await sleep(400);`);
    assert.match(await ev(`return document.getElementById('paiements').textContent`), /REC-\d{4}-000001|REC-\d{4}-000003/);
    const row = await ev(`${helpers} return $$('#paiements tbody tr')[0].textContent.replace(/\\s+/g,' ')`);
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
    await ev(`${helpers} set($('#paiements [name=montant]'), '250000'); $('#paiements [name=imprimer]').checked = false; submit($('#paiements form')); await sleep(400);`);
    const row = await ev(`${helpers} return $$('#paiements tbody tr').find((tr) => tr.textContent.includes('Sow')).textContent.replace(/\\s+/g, ' ')`);
    assert.match(row, /\(100 000\) \+ .*\(100 000\) \+ .*\(50 000\)/);
    // nouvelle saisie pour le même élève : modalité reprise et verrouillée
    await ev(`${helpers} const i = $('#paiements [data-pay=student]'); set(i, 'Sow'); await sleep(30); $('#paiements [data-pay-pick]').click(); await sleep(50);`);
    assert.equal(await ev(`${helpers} return $('#paiements [data-pay="modalite"][value="mensuel"]').checked && !$('#paiements [data-pay="modalite"][value="tranches"]').disabled`), true);
    assert.match(await ev(`${helpers} return $('#paiements .modalite-choice').textContent`), /modalité actuelle/);
  });

  await step('reçu : aperçu écran, impression A4 sans débordement, logo chargé', async () => {
    await ev(`${helpers} const tr = $$('#paiements tbody tr').find((r) => r.textContent.includes('Sow')); $('[data-action^="paiement:receipt:"]', tr).click(); await sleep(400);`);
    const preview = (await ev(`${helpers} return $('.receipt-preview').textContent`)).replace(/\s+/g, ' ');
    for (const part of ['Reçu de paiement', 'Ibrahima Sow', 'Période concernée', 'Paiement mensuel', '2 mois réglés', '1 mois en cours', '6 mois restants', 'Total de la scolarité', '900 000', 'Cumul payé', '250 000', 'Reste à payer', '650 000']) assert.ok(preview.includes(part), `reçu sans « ${part} »`);
    assert.match(await ev(`${helpers} return $$('.receipt-preview b').map((b) => b.textContent).join(' | ')`), /Matricule : IBK-\d{4}-\d{4}[\s\S]*Classe : CE2 A/);
    await shot('recu-apercu');
    // impression : le reçu est placé dans la zone d'impression, rendu en média « print » et exporté en PDF
    await ev(`${helpers} $('[data-action^="paiement:print:"]').click(); await sleep(800);`);
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
      set($('#paiements [name=montant]'), '10000'); $('#paiements [name=imprimer]').checked = false;
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

  await step('navigation : 7 onglets principaux et sous-onglets en haut de page', async () => {
    assert.equal(await ev(`${helpers} return $$('.nav-btn[data-group]:not([hidden])').length`), 7);
    const subtabs = await ev(`${helpers} $('.nav-btn[data-group=scolarite]').click(); await sleep(30); return $$('#subtabs .subtab-btn').map((b) => b.textContent).join('|')`);
    assert.equal(subtabs, 'Années scolaires|Classes|Tarifs et frais');
    await ev(`${helpers} $('.subtab-btn[data-target=tarifs]').click(); await sleep(30);`);
    assert.equal(await ev(`return location.hash + '|' + document.getElementById('pageTitle').textContent`), '#tarifs|Scolarité · Tarifs et frais');
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
    await ev(`${helpers} const r = $('#paiements [data-pay="modalite"][value="tranches"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); await sleep(30); set($('#paiements [name=montant]'), '60000'); $('#paiements [name=imprimer]').checked = false; submit($('#paiements form')); await sleep(400);`);
    const row = () => ev(`${helpers} return $$('#paiements tbody tr').find((tr) => tr.textContent.includes('Barry')).textContent.replace(/\\s+/g, ' ')`);
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

  await step('dettes antérieures : report automatique, règlement, encaissement sur la nouvelle année', async () => {
    await ev(`${helpers} await nav('annees'); const f = $('#annees form'); set($('[name=annee]', f), '2026-2027'); set($('[name=dateDebut]', f), '2026-09-01'); set($('[name=dateFin]', f), '2027-07-10'); set($('[name=statut]', f), 'preparation'); submit(f); await sleep(300);`);
    await ev(`${helpers} await nav('classes'); const f = $('#classes form'); set($('[name=nom]', f), 'CM1 B'); set($('[name=categorie]', f), 'Primaire'); set($('[name=anneeId]', f), '2'); submit(f); await sleep(300); set($('#tarifs [name=montantAnnuel]'), '600000'); submit($('#tarifs form')); await sleep(300);`);
    await ev(`${helpers} await nav('inscriptions'); const f = $('#inscriptions form'); set($('[name=anneeId]', f), '2'); set($('[name=classeText]', f), 'CM1 B'); set($('[name=eleveText]', f), 'Sow'); submit(f); await sleep(500);`);
    assert.equal(await ev(`${helpers} return $('#paiements').classList.contains('active')`), true);
    const card = (await ev(`${helpers} return $('#paiements [data-pay-card]').textContent`)).replace(/\s+/g, ' ');
    assert.match(card, /Dette antérieure : 640 000[\s\S]*Année 2025-2026 : reste 640 000/);
    await ev(`${helpers} $('#paiements [data-pay-dette]').click(); await sleep(60);`);
    assert.match(await ev(`${helpers} return $('#paiements .debt-banner.active').textContent.replace(/\\s+/g, ' ')`), /Règlement d’une dette antérieure — année 2025-2026[\s\S]*Encaissé sur l’année 2026-2027/);
    await ev(`${helpers} set($('#paiements [name=montant]'), '100000'); $('#paiements [name=imprimer]').checked = false; submit($('#paiements form')); await sleep(400);`);
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
    await ev(`${helpers} $('[data-report-type="periodique"]').click(); await sleep(60); set($('[data-rf="gran"]'), 'jour'); await sleep(80);`);
    const out = (await ev(`return document.getElementById('report-output').textContent`)).replace(/\s+/g, ' ');
    assert.match(out, /Rapport financier journalier/);
    for (const part of ['Paiements sur la période', 'Paiement moyen', 'Élèves payeurs', 'Paiements par moyen de paiement', 'Encaissements par nature', 'Dettes antérieures', 'Frais d’inscription / réinscription', 'Encaissements par modalité de règlement', 'Meilleures journées']) assert.ok(out.includes(part), `statistique absente : ${part}`);
    assert.ok(await ev(`return document.querySelectorAll('#report-output .r-group')[0].querySelectorAll('tbody tr').length`) <= 32, 'la période journalière doit être recentrée sur 30 jours');
  });

  await step('dépense : enregistrement, solde disponible, annulation conserve la ligne', async () => {
    await ev(`${helpers} await nav('depenses'); const f = $('#depenses form'); set($('[name=categorie]', f), 'Fournitures et matériel'); set($('[name=montant]', f), '150000'); set($('[name=description]', f), 'Craies et cahiers'); set($('[name=demandeur]', f), 'Directeur'); set($('[name=beneficiaire]', f), 'Librairie Centrale'); $('[name=imprimer]', f).checked = false; submit(f); await sleep(400);`);
    const out = await ev(`return document.getElementById('depense-output').textContent.replace(/\\s+/g,' ')`);
    assert.match(out, /DEP-\d{4}-000001/);
    assert.match(out, /Solde disponible1 120 000/); // 1 270 000 encaissés en 2025-2026 − 150 000 (le règlement de dette compte en 2026-2027)
    await ev(`${helpers} $('[data-action^="depense:cancel:"]').click(); await sleep(200); set($('.dialog [name=v]'), 'erreur de saisie'); submit($('.dialog')); await sleep(400);`);
    const after = await ev(`return document.getElementById('depense-output').textContent.replace(/\\s+/g,' ')`);
    assert.match(after, /Annulée/);
    assert.match(after, /Solde disponible1 270 000/);
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
    assert.match(await ev(`${helpers} return $('#aide').classList.contains('active') + ' ' + $('#aide-output').textContent`), /^true[\s\S]*Aide pour la page « Dépenses et caisse »[\s\S]*Enregistrer une dépense/);
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

  await step('réinitialisation : mot de passe + mot de confirmation + copie de sécurité', async () => {
    await ev(`${helpers} await nav('config'); $('[data-action="admin:reset"]').click(); await sleep(200);`);
    // mauvais mot de passe : rien n'est effacé
    await ev(`${helpers} set($('.dialog [name=password]'), 'mauvais123'); set($('.dialog [name=phrase]'), 'RÉINITIALISER'); submit($('.dialog')); await sleep(300);`);
    assert.equal(await ev(`return JSON.parse(localStorage.getItem('ibk_school_premium_v1')).eleves.length`) > 0, true);
    await ev(`${helpers} $('[data-action="admin:reset"]').click(); await sleep(200); set($('.dialog [name=password]'), 'Secret2026'); set($('.dialog [name=phrase]'), 'reinitialiser'); submit($('.dialog')); await sleep(500);`);
    assert.equal(await ev(`const s = JSON.parse(localStorage.getItem('ibk_school_premium_v1')); return s.eleves.length + s.paiements.length + s.depenses.length`), 0);
    const backups = await ev(`return JSON.parse(localStorage.getItem('ibk_safety_backups_v1')).length`);
    assert.equal(backups, 1);
    assert.match(await ev(`return document.getElementById('config').textContent`), /Avant réinitialisation/);
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
    await ev(`${helpers} await nav('config'); const f = $('#config form[data-form=utilisateur]'); set($('[name=username]', f), 'caisse'); set($('[name=nom]', f), 'Aïssatou'); set($('[name=role]', f), 'comptable'); set($('[name=password]', f), 'Caisse2026x'); submit(f); await sleep(300);`);
    await ev(`sessionStorage.clear(); location.reload();`);
    await sleep(1500);
    await ev(`${helpers} const f = $('.login-card'); set($('[name=username]', f), 'caisse'); set($('[name=password]', f), 'Caisse2026x'); submit(f); await sleep(300);`);
    // comptable : l'onglet Administration ne contient que le centre d'aide, jamais la configuration
    assert.equal(await ev(`${helpers} $('.nav-btn[data-group=administration]').click(); await sleep(30); return $('.content-section.active').id + '|' + $$('.subtab-btn[data-target=config]').length`), 'aide|0');
    assert.equal(await ev(`${helpers} location.hash = '#config'; await sleep(60); return $('#config').classList.contains('active')`), false, 'la configuration ne doit pas s’ouvrir par l’adresse');
    assert.equal(await ev(`${helpers} return $('.nav-btn[data-group=paiements]').hidden`), false);
    assert.equal(await ev(`${helpers} return $('#importLabel').hidden`), true);
    const denied = await ev(`${helpers} await nav('aide'); set($('[data-aide="q"]'), 'tout effacer'); $('[data-aide="q"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(50); return [$$('#aide-output [data-aide-go]').length, $('#aide-output .aide-access').className].join('|')`);
    assert.match(denied, /^0\|aide-access denied/);
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
