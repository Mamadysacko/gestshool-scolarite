import { nextId } from './annees.js';

// Programme pédagogique d'une classe : matières enseignées, coefficient et volume horaire hebdomadaire.
// Une classe appartient à une année scolaire : son programme aussi (il est reconduit avec la classe).
// Il sert à proposer, dans les affectations, uniquement les matières réellement enseignées dans les classes choisies.

const COEF_MIN = 0.5;
const COEF_MAX = 20;

export function ensureProgrammes(state) {
  if (!Array.isArray(state.programmes)) state.programmes = [];
  return state.programmes;
}

export function programmeDeClasse(state, classeId) {
  return ensureProgrammes(state).filter((p) => p.classeId === Number(classeId))
    .map((p) => ({ ...p, matiere: state.matieres.find((m) => m.id === p.matiereId) }))
    .filter((p) => p.matiere)
    .sort((a, b) => a.matiere.nom.localeCompare(b.matiere.nom, 'fr'));
}

export function matieresDeClasse(state, classeId) {
  return programmeDeClasse(state, classeId).map((p) => p.matiere);
}

export function auProgramme(state, classeId, matiereId) {
  return ensureProgrammes(state).some((p) => p.classeId === Number(classeId) && p.matiereId === Number(matiereId));
}

// Remplace le programme d'une classe (lignes : { matiereId, coefficient, heuresHebdo })
export function definirProgramme(state, classeId, lignes = []) {
  const classe = state.classes.find((c) => c.id === Number(classeId));
  if (!classe) throw new Error('Classe introuvable.');
  const vues = new Set();
  const propres = (Array.isArray(lignes) ? lignes : []).map((l) => {
    const matiereId = Number(l.matiereId);
    if (!state.matieres.some((m) => m.id === matiereId)) throw new Error('Matière introuvable.');
    if (vues.has(matiereId)) throw new Error('Une matière figure deux fois dans le programme.');
    vues.add(matiereId);
    const coefficient = Number(String(l.coefficient ?? 1).replace(',', '.'));
    if (!Number.isFinite(coefficient) || coefficient < COEF_MIN || coefficient > COEF_MAX) throw new Error(`Coefficient invalide (entre ${COEF_MIN} et ${COEF_MAX}).`);
    const heures = Number(String(l.heuresHebdo ?? 0).replace(',', '.'));
    if (!Number.isFinite(heures) || heures < 0 || heures > 40) throw new Error('Volume horaire invalide (0 à 40 h par semaine).');
    return { matiereId, coefficient, heuresHebdo: heures };
  });
  ensureProgrammes(state);
  state.programmes = state.programmes.filter((p) => p.classeId !== classe.id);
  propres.forEach((l) => state.programmes.push({ id: nextId(state.programmes), classeId: classe.id, ...l }));
  return programmeDeClasse(state, classe.id);
}

// Copie le programme d'une classe vers une autre (même année ou année suivante)
export function copierProgramme(state, sourceId, cibleId) {
  const lignes = programmeDeClasse(state, sourceId).map(({ matiereId, coefficient, heuresHebdo }) => ({ matiereId, coefficient, heuresHebdo }));
  if (!lignes.length) throw new Error('La classe source n’a pas de programme.');
  return definirProgramme(state, cibleId, lignes);
}
