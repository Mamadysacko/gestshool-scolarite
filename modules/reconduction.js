import { createClasse } from './classes.js';
import { createTarif, autoTrancheDates } from './tarifs.js';
import { programmeDeClasse, definirProgramme } from './programme.js';
import { saveAffectation, nomEmploye } from './personnel.js';
import { withTransaction } from './transaction.js';

// Reconduction d'une année scolaire à la suivante : seules les données de référence sont copiées
// (classes, programmes et coefficients, frais, affectations des enseignants au besoin).
// Aucune inscription, note, paiement, dépense, dette ou paie n'est recopiée : chaque année garde ses propres
// opérations, et les données de l'année source ne sont jamais modifiées. L'opération est idempotente :
// une classe déjà présente (même nom) dans l'année cible est réutilisée, jamais dupliquée.

const cleAnnee = (a) => `${a?.dateDebut || ''}|${a?.annee || ''}`;

export const OPTIONS_RECONDUCTION = [
  ['classes', 'Classes (nom, catégorie, capacité)'],
  ['programmes', 'Programmes : matières et coefficients de chaque classe'],
  ['tarifs', 'Frais de scolarité (montants repris, dates recalculées pour la nouvelle année)'],
  ['affectations', 'Affectations des enseignants (enseignants toujours actifs)']
];

// Année précédant `anneeId` dans l'ordre chronologique (date de rentrée, sinon libellé)
export function anneePrecedente(state, anneeId) {
  const cible = state.annees.find((a) => a.id === Number(anneeId));
  if (!cible) return null;
  return state.annees.filter((a) => a.id !== cible.id && cleAnnee(a) < cleAnnee(cible)).sort((a, b) => cleAnnee(b).localeCompare(cleAnnee(a)))[0] || null;
}

const memeNom = (a, b) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');

// Ce que la reconduction créerait (sans rien modifier)
export function apercuReconduction(state, sourceId, cibleId) {
  const sources = state.classes.filter((c) => c.anneeId === Number(sourceId) && c.active !== false);
  const cibles = state.classes.filter((c) => c.anneeId === Number(cibleId));
  const nouvelles = sources.filter((c) => !cibles.some((x) => memeNom(x.nom, c.nom)));
  return {
    classes: sources.length, nouvellesClasses: nouvelles.length,
    programmes: sources.filter((c) => programmeDeClasse(state, c.id).length).length,
    tarifs: sources.filter((c) => state.tarifs.some((t) => t.classeId === c.id && t.anneeId === c.anneeId)).length,
    affectations: state.affectations.filter((a) => a.actif && a.anneeId === Number(sourceId)).length
  };
}

export function reconduire(state, { sourceId, cibleId, classes = true, programmes = true, tarifs = true, affectations = false } = {}) {
  const source = state.annees.find((a) => a.id === Number(sourceId));
  const cible = state.annees.find((a) => a.id === Number(cibleId));
  if (!source || !cible) throw new Error('Année scolaire introuvable.');
  if (source.id === cible.id) throw new Error('Choisissez une année source différente de la nouvelle année.');
  return withTransaction(state, () => {
    const bilan = { classes: 0, classesExistantes: 0, programmes: 0, tarifs: 0, affectations: 0, ignores: [] };
    const correspondance = new Map();
    state.classes.filter((c) => c.anneeId === source.id && c.active !== false).forEach((c) => {
      let dest = state.classes.find((x) => x.anneeId === cible.id && memeNom(x.nom, c.nom));
      if (dest) bilan.classesExistantes += 1;
      else if (classes) {
        dest = createClasse(state, { nom: c.nom, categorie: c.categorie, anneeId: cible.id, capacite: c.capacite });
        if (dest) { dest.origineClasseId = c.id; bilan.classes += 1; }
      }
      if (dest) correspondance.set(c.id, dest);
    });
    correspondance.forEach((dest, srcId) => {
      if (programmes && !programmeDeClasse(state, dest.id).length) {
        const lignes = programmeDeClasse(state, srcId).map(({ matiereId, coefficient, heuresHebdo }) => ({ matiereId, coefficient, heuresHebdo }));
        if (lignes.length) { definirProgramme(state, dest.id, lignes); bilan.programmes += 1; }
      }
      const tarif = state.tarifs.find((t) => t.classeId === srcId && t.anneeId === source.id);
      if (tarifs && tarif && !state.tarifs.some((t) => t.classeId === dest.id && t.anneeId === cible.id)) {
        const dates = autoTrancheDates(cible);
        createTarif(state, {
          classeId: dest.id, anneeId: cible.id, montantAnnuel: tarif.montantAnnuel,
          tranches: (tarif.tranches || []).map((t, i) => ({ num: t.num, libelle: t.libelle, montant: t.montant, dateLimite: dates[i] || '' })),
          montantMensuel: tarif.montantMensuel, nbMois: tarif.nbMois, moisDebut: ''
        });
        bilan.tarifs += 1;
      }
    });
    if (affectations) {
      state.affectations.filter((a) => a.actif && a.anneeId === source.id).forEach((a) => {
        const dest = correspondance.get(a.classeId);
        const employe = state.personnel.find((e) => e.id === a.employeId);
        if (!dest || employe?.statut !== 'actif') return;
        try {
          saveAffectation(state, { employeId: a.employeId, anneeId: cible.id, classeId: dest.id, matiereId: a.matiereId, salle: a.salle });
          bilan.affectations += 1;
        } catch (error) {
          bilan.ignores.push(`${nomEmploye(employe)} — ${dest.nom} : ${error.message}`);
        }
      });
    }
    return bilan;
  });
}

export function texteBilan(bilan) {
  const parts = [`${bilan.classes} classe(s) créée(s)`];
  if (bilan.classesExistantes) parts.push(`${bilan.classesExistantes} déjà présente(s)`);
  parts.push(`${bilan.programmes} programme(s)`, `${bilan.tarifs} tarif(s)`, `${bilan.affectations} affectation(s)`);
  return parts.join(', ');
}
