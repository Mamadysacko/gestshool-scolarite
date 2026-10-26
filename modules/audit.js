import { currentUser } from './auth.js';

// Journal d'audit : chaque ligne conserve la date, l'utilisateur authentifié, l'action, l'enregistrement concerné et,
// lorsque c'est pertinent, les valeurs avant et après modification.
// Taille plafonnée pour protéger le stockage du navigateur : au-delà, les plus anciennes lignes sont retirées, mais
// ce retrait est lui-même consigné (jamais silencieux) ; les sauvegardes conservent l'historique complet.
export const MAX_ENTRIES = 20000;

// Valeurs lisibles et compactes (pas de pièce jointe ni d'image dans le journal)
function compact(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value, (key, v) => (typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : key === 'piece' || key === 'logo' ? undefined : v)));
  } catch (error) { return undefined; }
}

export function logOperation(state, type, detail, montant = 0, { cible = '', avant, apres } = {}) {
  if (!Array.isArray(state.journal)) state.journal = [];
  const user = currentUser();
  const entry = {
    id: state.journal.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1,
    horodatage: new Date().toISOString(),
    type,
    detail,
    montant: Number(montant || 0),
    utilisateur: user?.nom || '',
    utilisateurId: user?.id || 0
  };
  if (cible) entry.cible = String(cible);
  if (avant !== undefined) entry.avant = compact(avant);
  if (apres !== undefined) entry.apres = compact(apres);
  state.journal.push(entry);
  if (state.journal.length > MAX_ENTRIES) {
    const retirees = state.journal.splice(0, state.journal.length - MAX_ENTRIES + 1);
    state.journal.unshift({ id: entry.id + 1, horodatage: new Date().toISOString(), type: 'journal', detail: `${retirees.length} entrée(s) du journal antérieures au ${retirees[retirees.length - 1].horodatage.slice(0, 10)} retirées de la base de travail (plafond ${MAX_ENTRIES}) ; elles restent dans les sauvegardes antérieures.`, montant: 0, utilisateur: 'Système', utilisateurId: 0 });
  }
  return entry;
}
