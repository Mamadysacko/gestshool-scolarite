// Arrondis professionnels des montants (monnaie sans centimes, ex. GNF, XOF : la devise est celle de l'établissement).
// Chaque nature de montant calculé a sa propre règle (palier + sens), paramétrable dans Paramètres › Paramètres financiers.
// Les calculs intermédiaires gardent leur précision ; l'arrondi n'est appliqué qu'au montant proposé, et
// une répartition (tranches, mensualités, échéances d'avance) reste toujours exacte : la dernière part
// absorbe l'écart, si bien que reçus, soldes et rapports retombent sur le même total.
export const PALIERS_ARRONDI = [1, 100, 500, 1000, 5000, 10000];
export const SENS_ARRONDI = { proche: 'Au plus proche', inferieur: 'Inférieur', superieur: 'Supérieur' };
export const NATURES_ARRONDI = {
  tranches: 'Tranches de scolarité (montant annuel ÷ 3)',
  mensualites: 'Mensualités (montant annuel ÷ nombre de mois)',
  avances: 'Échéances d’avance sur salaire (montant ÷ durée)'
};
export const ARRONDI_DEFAUT = {
  tranches: { pas: 5000, sens: 'proche' },
  mensualites: { pas: 1000, sens: 'proche' },
  avances: { pas: 1000, sens: 'proche' }
};

// Règle d'une nature, valeurs invalides ramenées aux valeurs par défaut
export function regleArrondi(config, nature) {
  const def = ARRONDI_DEFAUT[nature] || { pas: 1, sens: 'proche' };
  const r = config?.arrondis?.[nature] || {};
  return {
    pas: PALIERS_ARRONDI.includes(Number(r.pas)) ? Number(r.pas) : def.pas,
    sens: SENS_ARRONDI[r.sens] ? r.sens : def.sens
  };
}

export function normaliserArrondis(raw = {}) {
  return Object.fromEntries(Object.keys(ARRONDI_DEFAUT).map((k) => [k, regleArrondi({ arrondis: raw }, k)]));
}

// Arrondi d'un montant au palier, dans le sens demandé (toujours un entier de francs)
export function arrondir(montant, { pas = 1, sens = 'proche' } = {}) {
  const value = Number(montant || 0);
  const step = Math.max(Number(pas) || 1, 1);
  const q = value / step;
  const n = sens === 'inferieur' ? Math.floor(q + 1e-9) : sens === 'superieur' ? Math.ceil(q - 1e-9) : Math.round(q);
  return n * step;
}

// Répartit un total en n parts arrondies ; la dernière part absorbe l'écart (somme exacte, aucune part négative)
export function repartir(total, n, regle = { pas: 1, sens: 'proche' }) {
  const t = Math.max(Math.floor(Number(total || 0)), 0);
  const count = Math.max(Math.floor(Number(n || 1)), 1);
  if (count === 1) return [t];
  let base = arrondir(t / count, regle);
  if (base * (count - 1) >= t || base <= 0) base = arrondir(t / count, { ...regle, sens: 'inferieur' });
  if (base * (count - 1) >= t || base <= 0) base = Math.floor(t / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? t - base * (count - 1) : base));
}

// Un total mensuel qui ne diffère du montant annuel que par l'arrondi des mensualités est un écart d'arrondi :
// la dernière mensualité l'absorbe. Au-delà, c'est un tarif mensuel volontairement différent (frais majorés).
export function ecartArrondi(montantMensuel, nbMois, montantAnnuel, regle = { pas: 1 }) {
  const gap = Number(montantMensuel) * Number(nbMois) - Number(montantAnnuel);
  return gap !== 0 && Math.abs(gap) < Number(nbMois) * Math.max(Number(regle.pas) || 1, 1) && Number(montantMensuel) * (Number(nbMois) - 1) < Number(montantAnnuel);
}
