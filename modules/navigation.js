// Navigation : 7 onglets principaux, chacun regroupant des sous-onglets (pages).
// Les identifiants de page restent ceux des sections existantes : aucune fonctionnalité n'est déplacée ni perdue.
export const NAV_GROUPS = [
  { id: 'accueil', label: 'Tableau de bord', icon: '📊', pages: [['dashboard', 'Vue d’ensemble'], ['analyse', 'Analyse financière']] },
  { id: 'eleves', label: 'Élèves', icon: '🎓', pages: [['eleves', 'Dossiers élèves'], ['inscriptions', 'Inscriptions']] },
  { id: 'scolarite', label: 'Scolarité', icon: '🏫', pages: [['annees', 'Années scolaires'], ['classes', 'Classes'], ['tarifs', 'Tarifs et frais']] },
  { id: 'paiements', label: 'Paiements', icon: '💳', pages: [['paiements', 'Encaissements'], ['dettes', 'Dettes antérieures']] },
  { id: 'depenses', label: 'Dépenses', icon: '🧮', pages: [['depenses', 'Dépenses et caisse']] },
  { id: 'rapports', label: 'Rapports', icon: '🧾', pages: [['rapports', 'Rapports et rappels']] },
  { id: 'administration', label: 'Administration', icon: '⚙️', pages: [['config', 'Configuration'], ['aide', 'Centre d’aide']] }
];

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
