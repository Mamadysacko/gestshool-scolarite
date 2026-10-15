import { currentUserName } from './auth.js';

const MAX_ENTRIES = 3000;

// Journal des opérations : chaque ligne conserve l'utilisateur authentifié qui l'a effectuée.
export function logOperation(state, type, detail, montant = 0) {
  if (!Array.isArray(state.journal)) state.journal = [];
  state.journal.push({
    id: state.journal.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1,
    horodatage: new Date().toISOString(),
    type,
    detail,
    montant: Number(montant || 0),
    utilisateur: currentUserName()
  });
  if (state.journal.length > MAX_ENTRIES) state.journal.splice(0, state.journal.length - MAX_ENTRIES);
}
