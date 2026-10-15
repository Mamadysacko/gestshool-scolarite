// Mémorisation de l'état d'affichage (page, filtres, recherches) pour la session de l'onglet et par utilisateur :
// une actualisation ramène l'utilisateur exactement où il était. Ce n'est qu'un confort d'affichage ;
// aucune donnée comptable n'est stockée ici, et tout est revalidé à la restauration.
const UI_KEY = 'ibk_ui_state_v1';

function readAll() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(UI_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) { return {}; }
}

export function loadUiState(userId) {
  const value = readAll()[String(userId)];
  return value && typeof value === 'object' ? value : {};
}

export function saveUiState(userId, value) {
  try {
    const all = readAll();
    all[String(userId)] = value;
    sessionStorage.setItem(UI_KEY, JSON.stringify(all));
  } catch (error) { /* stockage indisponible : simple perte de confort */ }
}

// Ne recopie que les clés connues, avec le même type que la valeur par défaut
export function pickKnown(defaults, saved) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  Object.keys(defaults).forEach((key) => {
    if (key in saved && typeof saved[key] === typeof defaults[key]) out[key] = saved[key];
  });
  return out;
}
