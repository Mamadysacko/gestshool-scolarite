// Copies de sécurité conservées dans le navigateur. Elles sont créées avant toute opération destructrice
// (réinitialisation, import) et ne sont JAMAIS supprimées automatiquement : seule une action explicite,
// autorisée par un administrateur, peut en retirer une.
const SAFETY_KEY = 'ibk_safety_backups_v1';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAFETY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) { return []; }
}

function writeAll(list) {
  localStorage.setItem(SAFETY_KEY, JSON.stringify(list));
}

const summary = (state) => ({
  eleves: state.eleves.length,
  inscriptions: state.inscriptions.length,
  paiements: state.paiements.length,
  depenses: (state.depenses || []).length
});

export function listSafetyBackups() {
  return readAll().map(({ id, date, motif, par, resume, taille }) => ({ id, date, motif, par, resume, taille })).sort((a, b) => b.id - a.id);
}

// Lève une erreur si la copie ne peut pas être conservée (stockage plein) : l'appelant doit alors renoncer à l'opération.
export function createSafetyBackup(state, motif, par = '') {
  const list = readAll();
  const data = JSON.stringify(state);
  const entry = { id: list.reduce((m, b) => Math.max(m, b.id), 0) + 1, date: new Date().toISOString(), motif, par, resume: summary(state), taille: data.length, data };
  list.push(entry);
  writeAll(list);
  // Relecture : on s'assure que la copie est bien lisible avant d'autoriser la suite
  const stored = readAll().find((b) => b.id === entry.id);
  if (!stored || stored.data !== data) throw new Error('La copie de sécurité n’a pas pu être vérifiée.');
  return { id: entry.id, date: entry.date, motif, par, resume: entry.resume, taille: entry.taille };
}

export function readSafetyBackup(id) {
  const entry = readAll().find((b) => b.id === Number(id));
  return entry ? JSON.parse(entry.data) : null;
}

export function deleteSafetyBackup(id) {
  const list = readAll();
  const next = list.filter((b) => b.id !== Number(id));
  if (next.length === list.length) return false;
  writeAll(next);
  return true;
}

export function deleteAllSafetyBackups() {
  const count = readAll().length;
  writeAll([]);
  return count;
}
