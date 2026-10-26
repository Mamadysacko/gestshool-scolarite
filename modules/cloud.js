import { escapeHtml } from './utils.js';
import { notify } from './dialog.js';
import { can, currentUser } from './auth.js';
import { EDITEUR } from './editeur.js';
import { creerArchive } from './archive.js';

// Licence en ligne, synchronisation et mises à jour (application de bureau uniquement).
// Le service tourne dans le processus principal d'Electron ; la page n'en reçoit que l'état, par le pont sécurisé
// window.gestCloud (preload.js). Dans un navigateur, ce module ne fait rien.
// Données envoyées : métadonnées techniques et diagnostics ; statistiques d'usage (nombres d'élèves, de classes,
// d'années) seulement si le contrat le prévoit ET si l'établissement l'accepte ici. Jamais d'élèves, de paiements,
// de montants ni de documents.

const G = typeof window !== 'undefined' ? window.gestCloud : null;
let etat = null;
let maj = null;
let averti = false;
let majSignalee = null;
let appState = null;

const date = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—');
function ilYa(iso) {
  if (!iso) return 'jamais';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
}
const superAdmin = () => !!currentUser() && can('superadmin');

/* ── Indicateur de la barre supérieure ── */
function indicateur() {
  let b = document.getElementById('cloudIndicateur');
  if (!b) {
    const ancre = document.getElementById('helpBtn');
    if (!ancre) return;
    b = document.createElement('button');
    b.id = 'cloudIndicateur';
    b.type = 'button';
    b.addEventListener('click', ouvrirPanneau);
    ancre.before(b);
  }
  if (!etat) return;
  const l = etat.licence, s = etat.synchro;
  let ton = 'ok', icone = '☁', texte = `Synchronisé ${ilYa(s.derniere_synchro)}`;
  if (!etat.configure) { ton = 'neutre'; icone = '💻'; texte = 'Mode local'; }
  else if (l.etat === 'non_activee') { ton = 'neutre'; icone = '🔑'; texte = 'Licence non activée'; }
  else if (l.etat !== 'valide') { ton = 'ko'; icone = '⚠'; texte = l.libelle; }
  else if (s.en_cours) { icone = '⟳'; texte = 'Synchronisation…'; }
  else if (s.derniere_erreur) { ton = 'attente'; icone = '⇡'; texte = `Hors ligne · ${s.en_attente} en attente`; }
  const pastille = maj && ['disponible', 'pret'].includes(maj.statut);
  b.className = `cloud-indicateur ${ton}`;
  b.title = 'Licence, synchronisation et mises à jour';
  b.innerHTML = `<span aria-hidden="true">${icone}</span><span class="cloud-texte">${escapeHtml(texte)}</span>${pastille ? '<b class="cloud-pastille" title="Mise à jour disponible">1</b>' : ''}`;
}

/* ── Panneau ── */
const ligne = (t, v) => `<tr><td>${escapeHtml(t)}</td><td>${v}</td></tr>`;

function htmlLicence() {
  const l = etat.licence;
  const ton = l.etat === 'valide' ? 'ok' : ['non_configure', 'non_activee'].includes(l.etat) ? 'neutre' : 'ko';
  const besoinCle = ['non_activee', 'remplacee', 'invalide', 'installation_desactivee', 'revoquee'].includes(l.etat) || etat.reactivation_requise;
  const peutActiver = superAdmin() || l.action === 'bloquer';
  return `<section><h3>Licence</h3>
    <p class="cloud-etat ${ton}">${escapeHtml(l.libelle)}${l.action === 'bloquer' ? ' — utilisation suspendue' : ''}</p>
    ${etat.configure ? `<table class="cloud-table">
      ${l.client ? ligne('Établissement', escapeHtml(l.client)) : ''}
      ${l.type ? ligne('Type', escapeHtml(l.type)) : ''}
      ${l.etat !== 'non_activee' ? ligne('Expiration', l.expire_le ? escapeHtml(jour(l.expire_le)) : 'Aucune (perpétuelle)') : ''}
      ${l.hors_ligne_jusqu_au ? ligne('Fonctionnement hors ligne jusqu’au', escapeHtml(date(l.hors_ligne_jusqu_au))) : ''}
      ${ligne('Identifiant de l’installation', `<code>${escapeHtml(etat.installation_id)}</code>`)}
    </table>` : '<p class="cloud-note">Cette version n’est reliée à aucun service en ligne : l’application fonctionne entièrement sur ce poste.</p>'}
    ${etat.configure && besoinCle ? (peutActiver ? `<form class="cloud-activation" data-cloud="activer">
        <label for="cloudCle">Clé de licence</label>
        <div class="cloud-ligne"><input id="cloudCle" type="text" autocomplete="off" spellcheck="false" maxlength="40" placeholder="GSS-XXXXX-XXXXX-XXXXX-XXXXX" required>
        <button class="primary-btn" type="submit">Activer</button></div>
        <p class="cloud-note">Connexion Internet requise pour l’activation. La clé n’est pas conservée sur le poste.</p>
        <p class="cloud-erreur" id="cloudActivationMessage" role="alert"></p></form>` : '<p class="cloud-note">Seul le super administrateur peut activer la licence.</p>') : ''}
  </section>`;
}

function htmlSynchro() {
  if (!etat.configure) return '';
  const s = etat.synchro;
  return `<section><h3>Synchronisation</h3>
    <table class="cloud-table">
      ${ligne('Dernière synchronisation réussie', `${escapeHtml(date(s.derniere_synchro))} <small>(${escapeHtml(ilYa(s.derniere_synchro))})</small>`)}
      ${ligne('Événements en attente d’envoi', String(s.en_attente))}
      ${s.derniere_erreur ? ligne('Dernière erreur', `<span class="cloud-erreur">${escapeHtml(s.derniere_erreur.message)}</span> <small>${escapeHtml(date(s.derniere_erreur.le))}</small>`) : ''}
      ${s.prochaine_tentative ? ligne('Nouvel essai automatique', escapeHtml(date(s.prochaine_tentative))) : ''}
      ${s.perdus ? ligne('Événements non conservés (file pleine)', String(s.perdus)) : ''}
    </table>
    <p class="cloud-note">« Synchronisé » signifie que le poste a contacté le serveur à cette date ; ce n’est pas une connexion permanente.</p>
    <button class="primary-btn ghost" type="button" data-cloud="synchroniser" ${s.en_cours || etat.licence.etat === 'non_activee' ? 'disabled' : ''}>Synchroniser maintenant</button>
  </section>`;
}

function htmlMaj() {
  if (!maj) return '';
  const tete = `<p>Version installée : <strong>${escapeHtml(maj.version_actuelle)}</strong>${maj.version_disponible ? ` · disponible : <strong>${escapeHtml(maj.version_disponible)}</strong>` : ''}${maj.obligatoire ? ' <span class="cloud-badge-ko">obligatoire</span>' : ''}</p>`;
  const notes = maj.notes ? `<details class="cloud-notes" open><summary>Notes de version</summary><div>${escapeHtml(maj.notes).replace(/\n/g, '<br>')}</div></details>` : '';
  const erreur = maj.erreur ? `<p class="cloud-erreur">${escapeHtml(maj.erreur)}</p>` : '';
  const bouton = (action, libelle, principal = false) => `<button type="button" class="${principal ? 'primary-btn' : 'primary-btn ghost'}" data-cloud="${action}">${libelle}</button>`;
  let corps;
  switch (maj.statut) {
    case 'non_configure': corps = '<p class="cloud-note">Mises à jour automatiques non configurées dans cette version : installez les nouvelles versions fournies par l’éditeur.</p>'; break;
    case 'portable': corps = `<p class="cloud-note">Version portable : elle ne se met pas à jour seule.${etat?.versions?.disponible ? ` La version ${escapeHtml(etat.versions.derniere)} est disponible auprès de l’éditeur.` : ''}</p>`; break;
    case 'verification': corps = '<p>Recherche de mise à jour…</p>'; break;
    case 'disponible': corps = `${notes}${erreur}<div class="cloud-ligne">${bouton('telecharger', 'Télécharger', true)}${maj.differable ? bouton('differer', 'Plus tard (24 h)') : ''}</div>`; break;
    case 'telechargement': {
      const p = maj.progression || {};
      corps = `<div class="cloud-progression" role="progressbar" aria-valuenow="${p.pourcentage || 0}" aria-valuemin="0" aria-valuemax="100"><div style="width:${p.pourcentage || 0}%"></div></div>
        <p class="cloud-note">${p.pourcentage || 0} %${p.total ? ` · ${(p.transferes / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} Mo` : ''}</p>`;
      break;
    }
    case 'pret': corps = `${notes}<p class="cloud-note">La mise à jour est téléchargée. Une sauvegarde complète vérifiée est faite avant l’installation, puis l’application redémarre. Vos données et votre licence sont conservées.</p>
      <div class="cloud-ligne">${bouton('installer', 'Installer et redémarrer', true)}${maj.differable ? bouton('fermer', 'Plus tard') : ''}</div>${erreur}`; break;
    case 'a_jour': corps = `<p class="cloud-etat ok">L’application est à jour.</p>${bouton('verifier', 'Rechercher une mise à jour')}`; break;
    default: corps = `${erreur}${bouton('verifier', 'Rechercher une mise à jour')}`;
  }
  return `<section><h3>Mises à jour</h3>${tete}${corps}</section>`;
}

function htmlConfidentialite() {
  if (!etat.configure) return '';
  return `<section><h3>Confidentialité</h3>
    <p class="cloud-note">Sont transmis : l’identifiant de l’installation, la version, l’état technique et les erreurs de l’application.
    Aucune donnée d’élève, aucun paiement, aucun montant, aucun document n’est envoyé.</p>
    ${etat.partage_usage ? `<label class="cloud-consentement"><input type="checkbox" data-cloud="consentement" ${etat.consentement_usage ? 'checked' : ''} ${superAdmin() ? '' : 'disabled'}>
      Partager aussi des statistiques globales d’usage (nombre d’élèves, de classes, d’années) avec l’éditeur</label>` : '<p class="cloud-note">Statistiques d’usage : non prévues par votre contrat (non envoyées).</p>'}
  </section>`;
}

function htmlPanneau() {
  if (!etat) return '<p>Chargement…</p>';
  return `${htmlLicence()}${htmlSynchro()}${htmlMaj()}${htmlConfidentialite()}`;
}

function ouvrirPanneau() {
  let fond = document.getElementById('cloudFenetre');
  if (!fond) {
    fond = document.createElement('div');
    fond.id = 'cloudFenetre';
    fond.className = 'cloud-fenetre';
    fond.innerHTML = `<div class="cloud-carte" role="dialog" aria-modal="true" aria-labelledby="cloudTitre">
      <header><h2 id="cloudTitre">Licence, synchronisation et mises à jour</h2><button type="button" class="cloud-fermer" data-cloud="fermer" aria-label="Fermer">✕</button></header>
      <div class="cloud-corps" id="cloudCorps"></div></div>`;
    fond.addEventListener('click', surClic);
    fond.addEventListener('change', surChangement);
    fond.addEventListener('submit', surEnvoi);
    document.body.appendChild(fond);
  }
  fond.hidden = false;
  rafraichirPanneau(true);
}
function fermerPanneau() { const f = document.getElementById('cloudFenetre'); if (f) f.hidden = true; }

function rafraichirPanneau(force = false) {
  const corps = document.getElementById('cloudCorps');
  if (!corps || (corps.closest('[hidden]') && !force)) return;
  const saisie = document.getElementById('cloudCle')?.value;
  const message = document.getElementById('cloudActivationMessage')?.textContent;
  corps.innerHTML = htmlPanneau();
  if (saisie && document.getElementById('cloudCle')) document.getElementById('cloudCle').value = saisie;
  if (message && document.getElementById('cloudActivationMessage')) document.getElementById('cloudActivationMessage').textContent = message;
}

/* ── Actions ── */
async function surEnvoi(e) {
  if (e.target.dataset.cloud !== 'activer') return;
  e.preventDefault();
  const champ = document.getElementById('cloudCle');
  const msg = document.getElementById('cloudActivationMessage');
  msg.textContent = 'Activation en cours…';
  const r = await G.activer(champ.value.trim());
  champ.value = '';
  if (r.ok) { msg.textContent = ''; notify('success', `Licence activée : ${r.licence?.libelle || ''}`); }
  else if (document.getElementById('cloudActivationMessage')) document.getElementById('cloudActivationMessage').textContent = r.message;
}

async function surClic(e) {
  if (e.target.id === 'cloudFenetre') { fermerPanneau(); return; }
  const action = e.target.closest('[data-cloud]')?.dataset.cloud;
  if (!action || e.target.closest('[data-cloud]').tagName === 'FORM' || action === 'consentement') return;
  if (action === 'fermer') fermerPanneau();
  else if (action === 'synchroniser') {
    const r = await G.synchroniser();
    if (r?.statut === 'ok') notify('success', r.envoyes ? `Synchronisation réussie : ${r.envoyes} événement(s) envoyé(s)` : 'Synchronisation réussie');
    else if (r?.message) notify('warning', r.message);
  } else if (action === 'verifier') G.majVerifier();
  else if (action === 'telecharger') G.majTelecharger();
  else if (action === 'differer') { const r = await G.majDifferer(); if (r.ok) { notify('info', 'Mise à jour différée de 24 heures.'); fermerPanneau(); } }
  else if (action === 'installer') {
    const r = await G.majInstaller();
    notify(r.ok ? 'info' : 'error', r.ok ? 'Sauvegarde effectuée : l’application va redémarrer.' : r.message);
  }
}

async function surChangement(e) {
  if (e.target.dataset.cloud !== 'consentement' || !superAdmin()) return;
  await G.consentement(e.target.checked);
  envoyerUsage();
}

// Statistiques globales (nombres seulement), uniquement avec le double accord contrat + établissement
function envoyerUsage() {
  if (!etat?.partage_usage || !etat?.consentement_usage || !appState) return;
  G.usage({ eleves: (appState.eleves || []).length, classes: (appState.classes || []).length, annees: (appState.annees || []).length });
}

/* ── Blocage (uniquement si la politique de l'éditeur le demande) ── */
function blocage() {
  let v = document.getElementById('cloudBlocage');
  if (!etat || etat.licence.action !== 'bloquer') { v?.remove(); return; }
  if (!v) {
    v = document.createElement('div');
    v.id = 'cloudBlocage';
    v.className = 'cloud-blocage';
    v.addEventListener('click', (e) => { if (e.target.closest('[data-cloud="ouvrir"]')) ouvrirPanneau(); });
    document.body.appendChild(v);
  }
  v.innerHTML = `<div class="cloud-blocage-carte"><div class="cloud-blocage-icone" aria-hidden="true">🔒</div><h2>${escapeHtml(etat.licence.libelle)}</h2>
    <p>L’utilisation de l’application est suspendue. Vos données sont intactes et conservées sur ce poste.</p>
    <p>Contactez l’éditeur : <strong>${escapeHtml(EDITEUR.email)}</strong> · ${escapeHtml(EDITEUR.telephones[0])}</p>
    <button class="primary-btn" type="button" data-cloud="ouvrir">Saisir une clé ou synchroniser</button></div>`;
}

function surEtat(e) {
  etat = e;
  indicateur(); blocage(); rafraichirPanneau();
  if (!averti && e.licence.action === 'avertir' && e.licence.etat !== 'valide') {
    averti = true;
    notify('warning', `${e.licence.libelle}. Ouvrez « Licence et mises à jour » (barre du haut) pour la régulariser.`);
  }
}
function surMaj(m) {
  maj = m;
  indicateur(); rafraichirPanneau();
  if (m.statut === 'disponible' && majSignalee !== m.version_disponible) {
    majSignalee = m.version_disponible;
    if (!m.obligatoire) notify('info', `Mise à jour disponible : version ${m.version_disponible}.`);
  }
  if (m.statut === 'pret' && m.obligatoire) ouvrirPanneau();
}

// Appelé au démarrage de l'interface (après la connexion)
export function initCloud(state) {
  if (!G || appState) return;
  appState = state;
  G.surEtat(surEtat);
  G.surMaj(surMaj);
  G.etat().then(surEtat);
  G.majEtat().then(surMaj);
  // Sauvegarde avant mise à jour : archive complète vérifiable (même format que « Sauvegarde complète »)
  G.surDemandeSauvegarde(() => JSON.stringify(creerArchive(appState, 'complet')));
  window.addEventListener('error', (ev) => G.signaler({ niveau: 'erreur', message: ev.message, source: String(ev.filename || '').split('/').pop(), ligne: ev.lineno }));
  window.addEventListener('unhandledrejection', (ev) => G.signaler({ niveau: 'erreur', message: String(ev.reason?.message || ev.reason || 'Promesse rejetée') }));
  setInterval(() => { indicateur(); envoyerUsage(); }, 60000);
  setTimeout(envoyerUsage, 10000);
}

export const cloudActif = () => !!G;
export const ouvrirCloud = () => ouvrirPanneau();
