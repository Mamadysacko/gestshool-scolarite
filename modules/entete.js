import { escapeHtml } from './utils.js';

// Fichier livré avec l'application ; l'espace du nom est encodé pour un chargement fiable (écran, impression, PDF)
export const DEFAULT_LOGO = './LOGO%20IBK.png';

export const ENTETE_DEFAUT = {
  tutelle: ['MEPU-A', 'IRE / CONAKRY', 'DCE / DIXINN', 'DSE / DIXINN', 'QUARTIER : DIXINN-CENTRE 1'],
  slogan: 'Primaire – Collège – Lycée',
  telephones: '+224 624-24-56-24 / 624-39-68-84',
  email: 'gsibrahimababakake@gmail.com'
};

export function enteteConfig(config) {
  const e = config.entete || {};
  return {
    tutelle: Array.isArray(e.tutelle) && e.tutelle.length ? e.tutelle : ENTETE_DEFAUT.tutelle,
    slogan: e.slogan || ENTETE_DEFAUT.slogan,
    telephones: e.telephones || ENTETE_DEFAUT.telephones,
    email: e.email || ENTETE_DEFAUT.email
  };
}

// « GROUPE SCOLAIRE » en bleu foncé, puis l'initiale de chaque mot du nom propre en bleu / jaune / rouge
function nameHtml(nom) {
  const words = String(nom || '').toUpperCase().split(/\s+/).filter(Boolean);
  const colors = ['eh-c1', 'eh-c2', 'eh-c3'];
  const lead = words.slice(0, 2).join(' ');
  const rest = words.slice(2).map((w, i) => `<span class="${colors[i % 3]}">${escapeHtml(w.charAt(0))}</span>${escapeHtml(w.slice(1))}`).join(' ');
  return `${escapeHtml(lead)} ${rest}`.trim();
}

function flagHtml() {
  return '<div class="eh-flag" role="img" aria-label="Drapeau de la Guinée"><i style="background:#ce1126"></i><i style="background:#fcd116"></i><i style="background:#009460"></i></div>';
}

function emblemHtml(config) {
  if (config.armoiries) return `<img class="eh-emblem-img" src="${escapeHtml(config.armoiries)}" alt="Symbole national" />`;
  return '<div class="eh-emblem">Guinée</div>';
}

// En-tête officiel unique : à utiliser sur tous les documents imprimés/exportés.
export function enteteHtml(config, { compact = false } = {}) {
  const e = enteteConfig(config);
  return `<header class="eh ${compact ? 'compact' : ''}">
    <div class="eh-left">
      <div class="eh-admin">${e.tutelle.map(escapeHtml).join('<br>')}</div>
      <img class="eh-logo" src="${escapeHtml(config.logo || DEFAULT_LOGO)}" alt="Logo de l'établissement" onerror="this.style.visibility='hidden'" />
    </div>
    <div class="eh-center">
      <div class="eh-name">${nameHtml(config.nom)}</div>
      <div class="eh-slogan">${escapeHtml(e.slogan)}</div>
      <div class="eh-contact"><b>Tél :</b> ${escapeHtml(e.telephones)}</div>
      <div class="eh-contact"><b>Email :</b> ${escapeHtml(e.email)}</div>
    </div>
    <div class="eh-right">${flagHtml()}${emblemHtml(config)}</div>
  </header>`;
}

// Version texte pour les exports tableur
export function enteteLignes(config) {
  const e = enteteConfig(config);
  return [[config.nom], [e.tutelle.join(' · ')], [`${e.slogan} — Tél : ${e.telephones} — ${e.email}`]];
}
