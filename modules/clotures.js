// Verrous de clôture de caisse (module sans dépendance, utilisable par paiements, dépenses et virements).
// Une opération datée du jour J sur un compte est VERROUILLÉE dès qu'une journée de caisse de ce compte, datée de J ou
// après, est clôturée : la modifier ou en ajouter une changerait un solde déjà compté et signé. Pour corriger, un
// responsable rouvre la dernière journée clôturée (motif obligatoire, tracé), corrige, puis referme.

const fr = (iso) => String(iso || '').split('-').reverse().join('/');

export function clotureCouvrant(state, compteId, date) {
  const id = Number(compteId);
  return (state.sessionsCaisse || [])
    .filter((s) => s.compteId === id && s.statut === 'fermee' && s.date >= String(date || ''))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

export function operationVerrouillee(state, compteId, date) {
  return Boolean(clotureCouvrant(state, compteId, date));
}

// Message d'erreur si l'opération touche une journée clôturée ; '' sinon
export function motifVerrou(state, compteId, date, action = 'cette opération') {
  const session = clotureCouvrant(state, compteId, date);
  if (!session) return '';
  const compte = (state.comptes || []).find((c) => c.id === Number(compteId));
  return `La caisse « ${compte?.libelle || 'compte'} » est clôturée au ${fr(session.date)} : ${action} au ${fr(date)} est impossible. Un responsable doit d’abord rouvrir la journée (motif tracé).`;
}

export function exigerNonVerrouille(state, compteId, date, action) {
  const message = motifVerrou(state, compteId, date, action);
  if (message) throw new Error(message);
}

// Option « caisse obligatoire » : une opération en espèces sur une caisse exige que cette caisse soit ouverte ce jour-là
export function motifCaisseFermee(state, compteId, date) {
  if (!state.config?.caisseObligatoire) return '';
  const compte = (state.comptes || []).find((c) => c.id === Number(compteId));
  if (!compte || compte.type !== 'caisse') return '';
  const ouverte = (state.sessionsCaisse || []).some((s) => s.compteId === compte.id && s.date === date && s.statut !== 'fermee');
  return ouverte ? '' : `La caisse « ${compte.libelle} » n’est pas ouverte le ${fr(date)} : ouvrez-la d’abord (Caisse et trésorerie › Caisse).`;
}
