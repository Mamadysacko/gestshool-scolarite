// Données de démonstration RÉSERVÉES AUX TESTS AUTOMATIQUES.
// Elles ne sont jamais chargées par l'application : une installation neuve démarre toujours vierge (storage.js).
import { migrateState } from '../storage.js';

export const DEMO = {
  config: { nom: 'Établissement de démonstration', sigle: 'DEMO', codeEcole: 'DEMO01', devise: 'GNF', adresse: 'Ville de test', telephone: '000 000 000', email: 'demo@example.org', caissier: '' },
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
    { id: 1, matricule: 'DEMO-001', nom: 'Diallo', prenom: 'Aminata', sexe: 'F', dateNaissance: '2014-05-10', telephone: '+224 600 000 010', email: '', parent: 'Mamadou Diallo', adresse: '', classeId: 1, actif: true },
    { id: 2, matricule: 'DEMO-002', nom: 'Camara', prenom: 'Moussa', sexe: 'M', dateNaissance: '2013-09-01', telephone: '+224 600 000 020', email: '', parent: 'Sory Camara', adresse: '', classeId: 1, actif: true }
  ],
  tarifs: [
    {
      id: 1, classeId: 1, anneeId: 1, montantAnnuel: 900000,
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
      id: 1, eleveId: 1, anneeId: 1, classeId: 1, type: 'nouvelle', statut: 'inscrit', dateInscription: '2025-09-15',
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
  journal: []
};

export function etatDemo(extra = {}) {
  return migrateState({ ...structuredClone(DEMO), ...extra });
}
