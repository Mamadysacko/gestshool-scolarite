export const STORAGE_KEY = 'ibk_school_premium_v1';

export const DEFAULT_STATE = {
  config: {
    nom: 'Groupe Scolaire IBRAHIMA BABA KAKE',
    sigle: 'IBK',
    codeEcole: 'IBK001',
    devise: 'GNF',
    adresse: 'Conakry, Guinée',
    telephone: '+224 622 000 000',
    email: 'contact@ibk-school.org',
    caissier: ''
  },
  anneeActiveId: 1,
  annees: [
    { id: 1, annee: '2025-2026', dateDebut: '2025-09-01', dateFin: '2026-07-15', statut: 'ouverte', soldeInitial: 0, fraisInscription: 0, fraisReinscription: 0 }
  ],
  classes: [
    { id: 1, nom: 'CP A', categorie: 'Primaire', anneeId: 1, capacite: 40, active: true },
    { id: 2, nom: 'CE1 B', categorie: 'Primaire', anneeId: 1, capacite: 35, active: true },
    { id: 3, nom: '6e A', categorie: 'Collège', anneeId: 1, capacite: 30, active: true }
  ],
  eleves: [
    { id: 1, matricule: 'IBK-001', nom: 'Diallo', prenom: 'Aminata', sexe: 'F', dateNaissance: '2014-05-10', telephone: '+224 600 000 010', email: 'aminata@mail.com', parent: 'Mamadou Diallo', adresse: 'Ratoma', classeId: 1, actif: true },
    { id: 2, matricule: 'IBK-002', nom: 'Camara', prenom: 'Moussa', sexe: 'M', dateNaissance: '2013-09-01', telephone: '+224 600 000 020', email: 'moussa@mail.com', parent: 'Sory Camara', adresse: 'Boulbinet', classeId: 1, actif: true }
  ],
  tarifs: [
    {
      id: 1,
      classeId: 1,
      anneeId: 1,
      montantAnnuel: 900000,
      tranches: [
        { id: 1, num: 1, libelle: '1ère tranche', montant: 300000, dateLimite: '2025-10-30' },
        { id: 2, num: 2, libelle: '2ème tranche', montant: 300000, dateLimite: '2025-12-15' },
        { id: 3, num: 3, libelle: '3ème tranche', montant: 300000, dateLimite: '2026-03-15' }
      ],
      actif: true
    }
  ],
  inscriptions: [
    {
      id: 1,
      eleveId: 1,
      anneeId: 1,
      classeId: 1,
      type: 'nouvelle',
      statut: 'inscrit',
      dateInscription: '2025-09-15',
      echeances: [
        { id: 101, trancheId: 1, montant: 300000, montantPaye: 300000, remise: 0, statut: 'payee', dateLimite: '2025-10-30' },
        { id: 102, trancheId: 2, montant: 300000, montantPaye: 150000, remise: 0, statut: 'partielle', dateLimite: '2025-12-15' },
        { id: 103, trancheId: 3, montant: 300000, montantPaye: 0, remise: 0, statut: 'impayee', dateLimite: '2026-03-15' }
      ]
    }
  ],
  paiements: [
    { id: 1, inscriptionId: 1, echeanceId: 101, montant: 300000, mode: 'mobile_money', reference: 'MM-001', caissier: 'Admin', datePaiement: '2025-10-10', annule: false },
    { id: 2, inscriptionId: 1, echeanceId: 102, montant: 150000, mode: 'espece', reference: 'ESP-014', caissier: 'Admin', datePaiement: '2025-11-20', annule: false }
  ],
  depenses: [],
  reliquats: [],
  journal: [],
  compteursRecu: {},
  compteursDepense: {},
  rapports: {
    note: 'Base prête à l’emploi.'
  }
};

// Met à niveau un état issu d'une ancienne version (ou d'un import) sans perdre d'information :
// champs ajoutés avec une valeur neutre, champs supprimés retirés, paiements rattachés à leur année et à leurs imputations.
export function migrateState(raw) {
  const base = structuredClone(DEFAULT_STATE);
  const state = { ...base, ...raw, config: { ...base.config, ...(raw.config || {}) } };
  ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'depenses', 'reliquats', 'journal'].forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
  });
  ['compteursRecu', 'compteursDepense'].forEach((key) => {
    if (!state[key] || typeof state[key] !== 'object') state[key] = {};
  });
  state.annees.forEach((a) => {
    if (typeof a.soldeInitial !== 'number') a.soldeInitial = Number(a.soldeInitial || 0);
    if (typeof a.fraisInscription !== 'number') a.fraisInscription = Number(a.fraisInscription || 0);
    if (typeof a.fraisReinscription !== 'number') a.fraisReinscription = Number(a.fraisReinscription || 0);
  });
  // Les champs « niveau » et « salle » n'existent plus pour les classes
  state.classes.forEach((c) => { delete c.niveau; delete c.salle; });
  // Tarifs : la case « échéancier mensuel » devient un montant mensuel explicite (0 = mensuel non proposé)
  state.tarifs.forEach((t) => {
    if (t.montantMensuel === undefined) {
      const months = Math.min(Math.max(Number(t.nbMois || 9), 1), 12);
      t.montantMensuel = t.mensuel ? Math.ceil(Number(t.montantAnnuel || 0) / months) : 0;
      t.nbMois = months;
      t.moisDebut = t.moisDebut || '';
    }
    delete t.mensuel;
  });
  // Inscriptions : modalité de règlement. Déjà utilisée par un paiement valide → conservée ; sinon « à choisir ».
  state.inscriptions.forEach((i) => {
    if (i.modalite !== undefined) return;
    const paid = state.paiements.some((p) => !p.annule && p.inscriptionId === i.id);
    i.modalite = paid && (i.echeances || []).length ? ((i.echeances || []).some((e) => e.mensualite) ? 'mensuel' : 'tranches') : null;
  });
  state.paiements.forEach((p) => {
    const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
    if (!p.anneeId && inscription) p.anneeId = inscription.anneeId;
    if (!Array.isArray(p.allocations) || !p.allocations.length) {
      p.allocations = p.echeanceId ? [{ echeanceId: p.echeanceId, montant: Number(p.montant || 0) }] : [];
    }
  });
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = migrateState({});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return migrateState(JSON.parse(raw));
  } catch (error) {
    console.error('Erreur lecture storage', error);
    return migrateState({});
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Erreur écriture storage', error);
    return false;
  }
}

export function exportStateToFile(state, filename = 'school_data.note') {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON');
        resolve(migrateState(parsed));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
    reader.readAsText(file);
  });
}

// Remise à zéro des données : élèves, classes, frais, inscriptions, paiements, dépenses et journal sont effacés.
// L'identité de l'établissement et la liste des années scolaires (structure) sont conservées.
export function blankState(current) {
  const base = migrateState({});
  const annees = (current.annees || base.annees).map((a) => ({ ...a, soldeInitial: Number(a.soldeInitial || 0) }));
  return {
    ...base,
    config: { ...base.config, ...(current.config || {}) },
    annees,
    anneeActiveId: current.anneeActiveId || annees[0]?.id || null,
    classes: [], eleves: [], tarifs: [], inscriptions: [], paiements: [], depenses: [], reliquats: [], journal: [], compteursRecu: {}, compteursDepense: {}
  };
}

export function resetData(current) {
  const fresh = blankState(current);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}
