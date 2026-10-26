import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser, exiger } from './auth.js';
import { todayISO } from './utils.js';
import { soldeCompte, compteOf, compteLabel, comptePrincipal } from './comptes.js';

// Caisse et trésorerie : journées de caisse (ouverture, comptage, fermeture), rapprochements bancaires et journal.
//  - Solde théorique = solde d'ouverture théorique + entrées valides − sorties valides du jour (opérations annulées
//    exclues). Il est toujours recalculé à partir des opérations, jamais saisi.
//  - Montant compté : ce que l'agent a réellement en caisse. Écart = compté − théorique ; tout écart non nul
//    doit être justifié. L'écart est consigné : il ne crée ni recette ni dépense.
//  - Une journée fermée verrouille les opérations de ce compte jusqu'à sa date (modules/clotures.js).
//  - Réouverture : uniquement la dernière journée fermée d'un compte, motif obligatoire, historique conservé.

const num = (v) => Number(v || 0);
const text = (v) => String(v ?? '').trim();
const veille = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dansPeriode = (date, from, to) => (!from || date >= from) && (!to || date <= to);

// Mouvements d'un compte (opérations valides uniquement), triés par date puis heure de saisie
export function mouvementsCompte(state, compteId, { from = '', to = '' } = {}) {
  const id = Number(compteId);
  const principal = comptePrincipal(state)?.id || 0;
  const sur = (op) => (Number(op.compteId) || principal) === id;
  const eleve = (p) => {
    const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
    const e = i && state.eleves.find((x) => x.id === i.eleveId);
    return e ? `${e.prenom} ${e.nom}` : 'élève';
  };
  const list = [
    ...state.paiements.filter((p) => !p.annule && sur(p) && dansPeriode(p.datePaiement, from, to)).map((p) => ({
      date: p.datePaiement, ordre: Number(p.creeLe || 0), type: 'encaissement', piece: p.numeroRecu || `#${p.id}`, libelle: `Paiement — ${eleve(p)}`, entree: num(p.montant), sortie: 0, agent: p.utilisateur || p.caissier || '', mode: p.mode, source: { type: 'paiement', id: p.id }
    })),
    ...(state.entreesCaisse || []).filter((e) => sur(e) && dansPeriode(e.date, from, to)).map((e) => ({
      date: e.date, ordre: 0, type: 'entree', piece: `ENT-${e.id}`, libelle: e.libelle || 'Autre entrée', entree: num(e.montant), sortie: 0, agent: '', source: { type: 'entree', id: e.id }
    })),
    ...state.depenses.filter((d) => !d.annule && sur(d) && dansPeriode(d.date, from, to)).map((d) => ({
      date: d.date, ordre: Number(d.creeLe || 0), type: 'depense', piece: d.numero || `#${d.id}`, libelle: `${d.categorie} — ${d.description}`, entree: 0, sortie: num(d.montant), agent: d.utilisateur || '', mode: d.mode, source: { type: 'depense', id: d.id }
    })),
    ...(state.virements || []).filter((v) => !v.annule && (v.deId === id || v.versId === id) && dansPeriode(v.date, from, to)).map((v) => ({
      date: v.date, ordre: Number(v.creeLe || 0), type: 'virement', piece: v.numero, libelle: v.versId === id ? `Virement reçu de ${compteLabel(state, v.deId)} — ${v.motif}` : `Virement vers ${compteLabel(state, v.versId)} — ${v.motif}`,
      entree: v.versId === id ? num(v.montant) : 0, sortie: v.deId === id ? num(v.montant) : 0, agent: v.utilisateur || '', source: { type: 'virement', id: v.id }
    }))
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.ordre - b.ordre);
}

export const soldeOuvertureTheorique = (state, compteId, date) => soldeCompte(state, compteId, { to: veille(date) });

function numero(state, date) {
  const year = String(date).slice(0, 4);
  if (!state.compteursCaisse || typeof state.compteursCaisse !== 'object') state.compteursCaisse = {};
  const next = num(state.compteursCaisse[year]) + 1;
  state.compteursCaisse[year] = next;
  return `CAI-${year}-${String(next).padStart(5, '0')}`;
}

const signe = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR')}`;

export const sessionOuverte = (state, compteId) => (state.sessionsCaisse || []).find((s) => s.compteId === Number(compteId) && s.statut !== 'fermee') || null;

// Ouverture : fond de caisse compté comparé au solde théorique de la veille
export function ouvrirCaisse(state, { compteId, date = todayISO(), montantCompte, justification = '' } = {}) {
  exiger('caisse.operer');
  const compte = compteOf(state, compteId);
  if (!compte || compte.actif === false) throw new Error('Choisissez une caisse active.');
  if (compte.type !== 'caisse') throw new Error('Seul un compte de type « Caisse » s’ouvre et se ferme ; un compte bancaire se rapproche avec le relevé.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) throw new Error('Date d’ouverture invalide (pas de date future).');
  const encours = sessionOuverte(state, compte.id);
  if (encours) throw new Error(`La caisse « ${compte.libelle} » est déjà ouverte (journée du ${encours.date.split('-').reverse().join('/')}) : fermez-la d’abord.`);
  if ((state.sessionsCaisse || []).some((s) => s.compteId === compte.id && s.date >= date)) throw new Error('Une journée de caisse existe déjà à cette date ou après : on ne revient pas en arrière.');
  const compteReel = Number(montantCompte);
  if (!Number.isInteger(compteReel) || compteReel < 0) throw new Error('Le montant compté doit être un nombre entier positif ou nul.');
  const theorique = soldeOuvertureTheorique(state, compte.id, date);
  const ecart = compteReel - theorique;
  if (ecart && !text(justification)) throw new Error(`Écart d’ouverture de ${signe(ecart)} : la justification est obligatoire.`);
  return withTransaction(state, () => {
    const user = currentUser();
    const session = {
      id: nextId(state.sessionsCaisse), numero: numero(state, date), compteId: compte.id, date, statut: 'ouverte',
      ouverture: { theorique, compte: compteReel, ecart, justification: text(justification), par: user?.nom || '', parId: user?.id || 0, horodatage: new Date().toISOString() },
      fermeture: null, historique: []
    };
    state.sessionsCaisse.push(session);
    logOperation(state, 'caisse', `${session.numero} — ouverture de « ${compte.libelle} » : théorique ${theorique.toLocaleString('fr-FR')}, compté ${compteReel.toLocaleString('fr-FR')}${ecart ? ` (écart ${signe(ecart)} : ${text(justification)})` : ''}`, compteReel, { cible: session.numero, apres: session.ouverture });
    return session;
  });
}

// Situation d'une journée : ouverture théorique, entrées et sorties valides du jour, solde théorique de fin
export function situationJournee(state, session) {
  const mouvements = mouvementsCompte(state, session.compteId, { from: session.date, to: session.date });
  const entrees = mouvements.reduce((s, m) => s + m.entree, 0);
  const sorties = mouvements.reduce((s, m) => s + m.sortie, 0);
  const ouverture = soldeOuvertureTheorique(state, session.compteId, session.date);
  return { mouvements, ouverture, entrees, sorties, theorique: ouverture + entrees - sorties };
}

// Fermeture : comptage de fin de journée, écart justifié ; la journée et les précédentes deviennent verrouillées
export function fermerCaisse(state, sessionId, { montantCompte, justification = '', billetage = '' } = {}) {
  exiger('caisse.operer');
  const session = (state.sessionsCaisse || []).find((s) => s.id === Number(sessionId));
  if (!session || session.statut === 'fermee') throw new Error('Journée de caisse introuvable ou déjà fermée.');
  const compteReel = Number(montantCompte);
  if (!Number.isInteger(compteReel) || compteReel < 0) throw new Error('Le montant compté doit être un nombre entier positif ou nul.');
  const sit = situationJournee(state, session);
  const ecart = compteReel - sit.theorique;
  if (ecart && !text(justification)) throw new Error(`Écart de caisse de ${signe(ecart)} : la justification est obligatoire.`);
  return withTransaction(state, () => {
    const user = currentUser();
    session.fermeture = {
      entrees: sit.entrees, sorties: sit.sorties, ouvertureTheorique: sit.ouverture, theorique: sit.theorique, compte: compteReel, ecart, justification: text(justification),
      billetage: text(billetage).slice(0, 300), nbOperations: sit.mouvements.length, par: user?.nom || '', parId: user?.id || 0, horodatage: new Date().toISOString()
    };
    session.statut = 'fermee';
    logOperation(state, 'caisse', `${session.numero} — fermeture de « ${compteLabel(state, session.compteId)} » du ${session.date} : entrées ${sit.entrees.toLocaleString('fr-FR')}, sorties ${sit.sorties.toLocaleString('fr-FR')}, théorique ${sit.theorique.toLocaleString('fr-FR')}, compté ${compteReel.toLocaleString('fr-FR')}${ecart ? `, écart ${signe(ecart)} (${text(justification)})` : ', sans écart'}`, compteReel, { cible: session.numero, apres: session.fermeture });
    return session;
  });
}

// Réouverture (exception) : seulement la dernière journée fermée du compte ; la clôture précédente reste dans l'historique
export function rouvrirCaisse(state, sessionId, motif) {
  exiger('tresorerie.corriger');
  const session = (state.sessionsCaisse || []).find((s) => s.id === Number(sessionId));
  if (!session || session.statut !== 'fermee') throw new Error('Seule une journée fermée peut être rouverte.');
  if (!text(motif)) throw new Error('Le motif de la réouverture est obligatoire.');
  const derniere = (state.sessionsCaisse || []).filter((s) => s.compteId === session.compteId).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (derniere.id !== session.id) throw new Error('Seule la dernière journée de caisse de ce compte peut être rouverte.');
  if (sessionOuverte(state, session.compteId)) throw new Error('Une autre journée de cette caisse est ouverte : fermez-la d’abord.');
  return withTransaction(state, () => {
    const avant = session.fermeture;
    session.historique = [...(session.historique || []), { action: 'reouverture', motif: text(motif), par: currentUser()?.nom || '', horodatage: new Date().toISOString(), fermeture: avant }];
    session.statut = 'rouverte';
    session.fermeture = null;
    logOperation(state, 'caisse', `${session.numero} — journée du ${session.date} ROUVERTE — motif : ${text(motif)}`, avant?.compte || 0, { cible: session.numero, avant });
    return session;
  });
}

// Rapprochement bancaire : solde du relevé comparé au solde théorique à la même date (écart justifié)
export function rapprocher(state, { compteId, date = todayISO(), soldeReleve, justification = '', reference = '' } = {}) {
  exiger('caisse.operer');
  const compte = compteOf(state, compteId);
  if (!compte) throw new Error('Compte introuvable.');
  if (compte.type === 'caisse') throw new Error('Une caisse se contrôle par sa fermeture (comptage), pas par un relevé.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) throw new Error('Date du relevé invalide.');
  const releve = Number(soldeReleve);
  if (!Number.isInteger(releve)) throw new Error('Le solde du relevé doit être un nombre entier.');
  const theorique = soldeCompte(state, compte.id, { to: date });
  const ecart = releve - theorique;
  if (ecart && !text(justification)) throw new Error(`Écart de ${signe(ecart)} avec le relevé : la justification est obligatoire (frais bancaires, chèque non encore crédité…).`);
  return withTransaction(state, () => {
    const user = currentUser();
    const r = { id: nextId(state.rapprochements), compteId: compte.id, date, soldeReleve: releve, theorique, ecart, justification: text(justification), reference: text(reference), par: user?.nom || '', horodatage: new Date().toISOString() };
    state.rapprochements.push(r);
    logOperation(state, 'caisse', `Rapprochement de « ${compte.libelle} » au ${date} : relevé ${releve.toLocaleString('fr-FR')}, théorique ${theorique.toLocaleString('fr-FR')}${ecart ? `, écart ${signe(ecart)} (${text(justification)})` : ', concordant'}`, releve, { cible: compte.libelle, apres: r });
    return r;
  });
}

// Journal quotidien : mouvements de tous les comptes pour une date, avec soldes d'ouverture et de clôture théoriques
export function journalDuJour(state, date = todayISO()) {
  return (state.comptes || []).map((c) => {
    const mouvements = mouvementsCompte(state, c.id, { from: date, to: date });
    const ouverture = soldeOuvertureTheorique(state, c.id, date);
    const entrees = mouvements.reduce((s, m) => s + m.entree, 0);
    const sorties = mouvements.reduce((s, m) => s + m.sortie, 0);
    const session = (state.sessionsCaisse || []).find((s) => s.compteId === c.id && s.date === date) || null;
    return { compte: c, mouvements, ouverture, entrees, sorties, cloture: ouverture + entrees - sorties, session };
  });
}

// Historique des journées de caisse, filtrable par agent (ouverture ou fermeture) et par période
export function historiqueSessions(state, { agent = '', from = '', to = '', compteId = 0 } = {}) {
  return [...(state.sessionsCaisse || [])]
    .filter((s) => (!compteId || s.compteId === Number(compteId)) && dansPeriode(s.date, from, to)
      && (!agent || s.ouverture?.par === agent || s.fermeture?.par === agent))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
