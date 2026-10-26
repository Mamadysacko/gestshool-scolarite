import { escapeHtml } from './utils.js';

// En-tête officiel des documents imprimés (reçus, factures, rapports, relances) : entièrement configuré par
// l'établissement (Administration → Établissement). Aucune identité, tutelle, coordonnée, drapeau ni logo n'est
// fourni par défaut : une rubrique vide n'est simplement pas imprimée.
export const DEFAULT_LOGO = '';

export const ENTETE_DEFAUT = { tutelle: [], slogan: '', telephones: '', email: '', pays: '', drapeau: [], initialesColorees: false };

const lignes = (value) => (Array.isArray(value) ? value : String(value || '').split(/\r?\n/)).map((l) => String(l).trim()).filter(Boolean);
const couleurs = (value) => (Array.isArray(value) ? value : []).map((c) => String(c).trim()).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 3);

export function enteteConfig(config) {
  const e = config.entete || {};
  return {
    tutelle: lignes(e.tutelle),
    slogan: String(e.slogan || '').trim(),
    // Coordonnées de l'en-tête : celles saisies pour l'en-tête, sinon celles de l'établissement
    telephones: String(e.telephones || config.telephone || '').trim(),
    email: String(e.email || config.email || '').trim(),
    adresse: String(config.adresse || '').trim(),
    pays: String(e.pays || '').trim(),
    drapeau: couleurs(e.drapeau),
    initialesColorees: Boolean(e.initialesColorees)
  };
}

// Nom de l'établissement ; option : initiales des mots (à partir du 3e) en couleur, façon « GROUPE SCOLAIRE A B C »
function nameHtml(nom, colorees) {
  const words = String(nom || '').toUpperCase().split(/\s+/).filter(Boolean);
  if (!colorees || words.length < 3) return escapeHtml(words.join(' '));
  const colors = ['eh-c1', 'eh-c2', 'eh-c3'];
  const lead = words.slice(0, 2).join(' ');
  const rest = words.slice(2).map((w, i) => `<span class="${colors[i % 3]}">${escapeHtml(w.charAt(0))}</span>${escapeHtml(w.slice(1))}`).join(' ');
  return `${escapeHtml(lead)} ${rest}`.trim();
}

function flagHtml(e) {
  if (!e.drapeau.length) return '';
  return `<div class="eh-flag" role="img" aria-label="Drapeau${e.pays ? ` — ${escapeHtml(e.pays)}` : ''}">${e.drapeau.map((c) => `<i style="background:${escapeHtml(c)}"></i>`).join('')}</div>`;
}

function emblemHtml(config, e) {
  if (config.armoiries) return `<img class="eh-emblem-img" src="${escapeHtml(config.armoiries)}" alt="Symbole national" />`;
  return e.pays ? `<div class="eh-emblem">${escapeHtml(e.pays)}</div>` : '';
}

// En-tête officiel unique : à utiliser sur tous les documents imprimés/exportés.
export function enteteHtml(config, { compact = false } = {}) {
  const e = enteteConfig(config);
  const nom = String(config.nom || '').trim() || 'Établissement (à configurer dans Administration)';
  return `<header class="eh ${compact ? 'compact' : ''}">
    <div class="eh-left">
      ${e.tutelle.length ? `<div class="eh-admin">${e.tutelle.map(escapeHtml).join('<br>')}</div>` : ''}
      ${config.logo ? `<img class="eh-logo" src="${escapeHtml(config.logo)}" alt="Logo de l'établissement" />` : ''}
    </div>
    <div class="eh-center">
      <div class="eh-name">${nameHtml(nom, e.initialesColorees)}</div>
      ${e.slogan ? `<div class="eh-slogan">${escapeHtml(e.slogan)}</div>` : ''}
      ${e.adresse ? `<div class="eh-contact">${escapeHtml(e.adresse)}</div>` : ''}
      ${e.telephones ? `<div class="eh-contact"><b>Tél :</b> ${escapeHtml(e.telephones)}</div>` : ''}
      ${e.email ? `<div class="eh-contact"><b>Email :</b> ${escapeHtml(e.email)}</div>` : ''}
    </div>
    <div class="eh-right">${flagHtml(e)}${emblemHtml(config, e)}</div>
  </header>`;
}

// Version texte pour les exports tableur
export function enteteLignes(config) {
  const e = enteteConfig(config);
  return [[config.nom || ''], ...(e.tutelle.length ? [[e.tutelle.join(' · ')]] : []), [[e.slogan, e.adresse, e.telephones && `Tél : ${e.telephones}`, e.email].filter(Boolean).join(' — ')]];
}
