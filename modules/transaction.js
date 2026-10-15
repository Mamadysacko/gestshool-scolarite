// Exécute une opération « tout ou rien » : si elle échoue (exception) ou refuse (résultat faux/nul),
// l'état est remis exactement dans son état initial, sans écriture partielle (paiement sans mise à jour du solde, etc.).
export function withTransaction(state, operation) {
  const snapshot = structuredClone(state);
  const rollback = () => {
    Object.keys(state).forEach((key) => { if (!(key in snapshot)) delete state[key]; });
    Object.assign(state, snapshot);
  };
  let result;
  try {
    result = operation();
  } catch (error) {
    rollback();
    throw error;
  }
  if (result === false || result === null || result === undefined) rollback();
  return result;
}
