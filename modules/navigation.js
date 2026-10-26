// Navigation : onglets principaux, chacun regroupant des sous-onglets (pages).
// Les identifiants de page restent ceux des sections existantes : aucune fonctionnalité n'est déplacée ni perdue,
// et les droits des rôles (listes de pages) restent valables quand le regroupement change.
export const NAV_GROUPS = [
  { id: 'accueil', label: 'Tableau de bord', icon: '📊', pages: [['dashboard', 'Vue d’ensemble'], ['analyse', 'Analyse financière']] },
  { id: 'eleves', label: 'Élèves et inscriptions', icon: '🎓', pages: [['eleves', 'Dossiers élèves'], ['inscriptions', 'Inscriptions']] },
  { id: 'scolarite', label: 'Tarifs et scolarité', icon: '🏫', pages: [['tarifs', 'Tarifs et frais'], ['classes', 'Classes'], ['annees', 'Années scolaires']] },
  { id: 'paiements', label: 'Paiements', icon: '💳', pages: [['paiements', 'Encaissements'], ['encaissements-analyse', 'Analyse des encaissements']] },
  { id: 'impayes', label: 'Dettes et impayés', icon: '📌', pages: [['creances', 'Créances et relances'], ['dettes', 'Dettes antérieures']] },
  { id: 'depenses', label: 'Dépenses', icon: '🧾', pages: [['depenses', 'Dépenses']] },
  { id: 'tresorerie', label: 'Caisse et trésorerie', icon: '🏦', pages: [['caisse', 'Caisse'], ['comptes', 'Comptes et virements']] },
  { id: 'rapports', label: 'Comptabilité et rapports', icon: '📚', pages: [['etats', 'États financiers'], ['rapports', 'Rapports et rappels']] },
  { id: 'paie', label: 'Paie du personnel', icon: '👥', pages: [['paie-dashboard', 'Tableau de bord'], ['personnel', 'Personnel'], ['affectations', 'Affectations'], ['remunerations', 'Rémunérations'], ['paie', 'Paie mensuelle'], ['avances', 'Avances sur salaire'], ['paie-rapports', 'Bulletins et récapitulatifs']] },
  { id: 'utilisateurs', label: 'Utilisateurs et permissions', icon: '🔐', pages: [['config-utilisateurs', 'Utilisateurs et rôles'], ['config-journal', 'Journal d’audit']] },
  { id: 'parametres', label: 'Paramètres', icon: '⚙️', pages: [['config', 'Établissement'], ['config-finances', 'Paramètres financiers'], ['licences', 'Licence'], ['aide', 'Centre d’aide']] },
  { id: 'sauvegardes', label: 'Sauvegardes et restauration', icon: '💾', pages: [['config-donnees', 'Données et sauvegardes']] }
];

// Icône de chaque sous-onglet (barre d'onglets en haut des pages)
export const PAGE_ICONS = {
  dashboard: '📈', analyse: '🔍', eleves: '🎓', inscriptions: '📝', annees: '🗓️', classes: '🏫', tarifs: '💰',
  paiements: '💳', creances: '📌', 'encaissements-analyse': '📊', dettes: '⏳', depenses: '🧾', caisse: '🪙', comptes: '🏦', etats: '📚',
  'paie-dashboard': '📊', personnel: '👥', affectations: '🧑‍🏫', remunerations: '💼', paie: '💵', avances: '↪️', 'paie-rapports': '📄',
  rapports: '🗂️', config: '🏛️', 'config-utilisateurs': '🔐', 'config-finances': '🧮', 'config-donnees': '💾', 'config-journal': '📜', licences: '🔑', aide: '❔'
};

export const ALL_PAGES = NAV_GROUPS.flatMap((g) => g.pages.map(([id]) => id));

export function groupOfPage(pageId) {
  return NAV_GROUPS.find((g) => g.pages.some(([id]) => id === pageId)) || null;
}

export function pageLabel(pageId) {
  for (const g of NAV_GROUPS) {
    const page = g.pages.find(([id]) => id === pageId);
    if (page) return page[1];
  }
  return pageId;
}

// Chemin lisible d'une page : « Paiements › Encaissements »
export function pagePath(pageId) {
  const group = groupOfPage(pageId);
  return group ? (group.pages.length > 1 || group.label !== pageLabel(pageId) ? [group.label, pageLabel(pageId)] : [group.label]) : [pageId];
}
