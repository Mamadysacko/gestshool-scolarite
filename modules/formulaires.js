// Formulaires repliés : chaque formulaire de saisie est présenté derrière un bouton portant son nom, au lieu d'être
// affiché d'emblée. Il s'ouvre au clic, et automatiquement lorsque l'application doit le montrer (modification d'un
// élément, redirection après une inscription, bouton « + Nouvel élève »…). Les écrans redessinés sont pris en charge
// automatiquement (surveillance du document).

const LIBELLES = {
  annee: 'Ajouter une année scolaire', classe: 'Ajouter une classe', eleve: 'Nouvel élève', inscription: 'Nouvelle inscription',
  tarif: 'Ajouter des frais de scolarité (tarif)', paiement: 'Enregistrer un paiement', depense: 'Enregistrer une dépense',
  config: 'Modifier l’identité et l’en-tête de l’établissement', utilisateur: 'Créer un utilisateur', 'role-new': 'Créer un rôle',
  compte: 'Créer un compte financier', referentiels: 'Modifier les catégories', arrondis: 'Modifier les règles d’arrondi',
  virement: 'Faire un virement interne', 'caisse-ouverture': 'Ouvrir une caisse', 'caisse-fermeture': 'Compter et fermer la caisse',
  rapprochement: 'Saisir un rapprochement bancaire', 'caisse-option': 'Option : caisse obligatoire', programme: 'Modifier le programme de la classe',
  'licence-verifier': 'Vérifier une clé de licence', 'licence-ajouter': 'Ajouter une clé de licence au catalogue'
};

function libelle(form) {
  if (form.dataset.pli) return form.dataset.pli;
  if (LIBELLES[form.dataset.form]) return LIBELLES[form.dataset.form];
  if (form.dataset.form === 'role') return `Droits du rôle « ${form.querySelector('[name="label"]')?.value || ''} »`;
  const titre = form.closest('.panel')?.querySelector('.panel-header h3')?.textContent?.trim();
  const bouton = form.querySelector('button[type="submit"]')?.textContent?.trim();
  return titre || bouton || 'Ouvrir le formulaire';
}

export function replierFormulaires(root = document) {
  root.querySelectorAll('form[data-form]').forEach((form) => {
    // Déjà replié, déjà dans un volet, ou fenêtre de dialogue / connexion : inchangé
    if (form.closest('details, .dialog, .dialog-backdrop, #login-root')) return;
    const details = document.createElement('details');
    details.className = 'form-pli';
    const summary = document.createElement('summary');
    summary.className = 'form-pli-bouton';
    summary.textContent = libelle(form);
    form.parentNode.insertBefore(details, form);
    details.append(summary, form);
  });
}

export function ouvrirFormulaire(form) {
  const volet = form?.closest?.('details.form-pli');
  if (volet && !volet.open) volet.open = true;
  return form;
}

let observateur = null;
export function surveillerFormulaires() {
  replierFormulaires();
  if (observateur || typeof MutationObserver === 'undefined') return;
  observateur = new MutationObserver((mutations) => {
    if (mutations.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('form[data-form]') || n.querySelector?.('form[data-form]'))))) replierFormulaires();
  });
  observateur.observe(document.body, { childList: true, subtree: true });
}
