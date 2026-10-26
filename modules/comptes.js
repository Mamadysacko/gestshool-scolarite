import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser, exiger } from './auth.js';
import { todayISO } from './utils.js';
import { motifVerrou, exigerNonVerrouille } from './clotures.js';

// Comptes financiers de l'établissement : caisse(s), compte(s) bancaire(s), Mobile Money…
// Chaque encaissement et chaque dépense est rattaché à un compte ; les virements internes (dépôt en banque,
// approvisionnement de caisse) déplacent de l'argent entre comptes sans modifier les recettes ni les dépenses.
// Solde d'un compte = solde initial + encaissements + autres entrées − dépenses ± virements (opérations annulées exclues).

export const TYPES_COMPTE = { caisse: 'Caisse', banque: 'Compte bancaire', mobile: 'Mobile Money', autre: 'Autre compte' };
export const COMPTE_PRINCIPAL_DEFAUT = { id: 1, libelle: 'Caisse principale', type: 'caisse', numero: '', soldeInitial: 0, actif: true, principal: true };

const num = (v) => Number(v || 0);
const text = (v) => String(v ?? '').trim();

export function comptePrincipal(state) {
  return (state.comptes || []).find((c) => c.principal) || (state.comptes || [])[0] || null;
}

export function compteOf(state, id) {
  return (state.comptes || []).find((c) => c.id === Number(id)) || null;
}

export function compteLabel(state, id) {
  return compteOf(state, id)?.libelle || comptePrincipal(state)?.libelle || '—';
}

export function comptesActifs(state) {
  return (state.comptes || []).filter((c) => c.actif !== false);
}

// Compte proposé par défaut pour un moyen de paiement : la caisse pour les espèces, sinon le premier compte du bon type
export function compteParDefaut(state, mode = 'espece') {
  const actifs = comptesActifs(state);
  const type = mode === 'espece' ? 'caisse' : mode === 'mobile_money' ? 'mobile' : 'banque';
  return actifs.find((c) => c.type === type) || comptePrincipal(state);
}

// Mise à niveau : au moins un compte (principal) ; les opérations sans compte sont rattachées au compte principal
export function ensureComptes(state) {
  if (!Array.isArray(state.comptes) || !state.comptes.length) state.comptes = [{ ...COMPTE_PRINCIPAL_DEFAUT }];
  state.comptes.forEach((c) => {
    c.id = Number(c.id);
    c.libelle = text(c.libelle) || `Compte ${c.id}`;
    if (!TYPES_COMPTE[c.type]) c.type = 'autre';
    c.soldeInitial = Math.floor(num(c.soldeInitial));
    c.numero = text(c.numero);
    c.actif = c.actif !== false;
  });
  if (!state.comptes.some((c) => c.principal)) state.comptes[0].principal = true;
  const principal = comptePrincipal(state);
  principal.actif = true;
  const fallback = principal.id;
  const valid = (id) => state.comptes.some((c) => c.id === Number(id));
  ['paiements', 'depenses', 'entreesCaisse', 'paiementsEnAttente'].forEach((key) => {
    (state[key] || []).forEach((op) => { if (!valid(op.compteId)) op.compteId = fallback; else op.compteId = Number(op.compteId); });
  });
  if (!Array.isArray(state.virements)) state.virements = [];
  return state.comptes;
}

function checkCompte(state, payload, id = 0) {
  const libelle = text(payload.libelle);
  if (!libelle) throw new Error('Donnez un nom au compte.');
  if ((state.comptes || []).some((c) => c.id !== id && c.libelle.toLocaleLowerCase('fr') === libelle.toLocaleLowerCase('fr'))) throw new Error('Un compte porte déjà ce nom.');
  if (!TYPES_COMPTE[payload.type]) throw new Error('Type de compte inconnu.');
  const solde = Number(payload.soldeInitial || 0);
  if (!Number.isInteger(solde) || solde < 0) throw new Error('Le solde initial doit être un nombre entier positif ou nul.');
  return { libelle, type: payload.type, numero: text(payload.numero).slice(0, 60), soldeInitial: solde };
}

export function createCompte(state, payload = {}) {
  exiger('admin');
  const fields = checkCompte(state, payload);
  const compte = { id: nextId(state.comptes), ...fields, actif: true, principal: false, creeLe: new Date().toISOString() };
  state.comptes.push(compte);
  logOperation(state, 'compte', `Compte « ${compte.libelle} » créé (${TYPES_COMPTE[compte.type]}, solde initial ${compte.soldeInitial})`, compte.soldeInitial);
  return compte;
}

// Le solde initial d'un compte déjà mouvementé reste modifiable (correction de reprise), mais la valeur précédente est tracée
export function updateCompte(state, id, payload = {}) {
  exiger('admin');
  const compte = compteOf(state, id);
  if (!compte) throw new Error('Compte introuvable.');
  const fields = checkCompte(state, payload, compte.id);
  const avant = { libelle: compte.libelle, type: compte.type, numero: compte.numero, soldeInitial: compte.soldeInitial };
  compte.historique = [...(compte.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant }];
  Object.assign(compte, fields);
  logOperation(state, 'compte', `Compte « ${compte.libelle} » modifié${avant.soldeInitial !== compte.soldeInitial ? ` (solde initial ${avant.soldeInitial} → ${compte.soldeInitial})` : ''}`);
  return compte;
}

export function setCompteActif(state, id, actif) {
  exiger('admin');
  const compte = compteOf(state, id);
  if (!compte) throw new Error('Compte introuvable.');
  if (!actif && compte.principal) throw new Error('Le compte principal ne peut pas être désactivé.');
  compte.actif = Boolean(actif);
  logOperation(state, 'compte', `Compte « ${compte.libelle} » ${compte.actif ? 'réactivé' : 'désactivé'}`);
  return compte;
}

const avant = (op, to, key) => !to || String(op[key] || '') <= to;

// Soldes de tous les comptes (jusqu'à une date incluse si `to` est fourni)
// (une opération créée sans compte — paie, avance — est rattachée au compte principal)
export function soldesComptes(state, { to = '' } = {}) {
  const principalId = comptePrincipal(state)?.id || 0;
  const sur = (op, id) => (Number(op.compteId) || principalId) === id;
  return (state.comptes || []).map((c) => {
    const encaissements = state.paiements.filter((p) => !p.annule && sur(p, c.id) && avant(p, to, 'datePaiement')).reduce((s, p) => s + num(p.montant), 0);
    const autres = (state.entreesCaisse || []).filter((e) => sur(e, c.id) && avant(e, to, 'date')).reduce((s, e) => s + num(e.montant), 0);
    const depenses = state.depenses.filter((d) => !d.annule && sur(d, c.id) && avant(d, to, 'date')).reduce((s, d) => s + num(d.montant), 0);
    const virements = (state.virements || []).filter((v) => !v.annule && avant(v, to, 'date'));
    const entrants = virements.filter((v) => v.versId === c.id).reduce((s, v) => s + num(v.montant), 0);
    const sortants = virements.filter((v) => v.deId === c.id).reduce((s, v) => s + num(v.montant), 0);
    return { compte: c, soldeInitial: num(c.soldeInitial), encaissements, autres, depenses, entrants, sortants, solde: num(c.soldeInitial) + encaissements + autres - depenses + entrants - sortants };
  });
}

export function soldeCompte(state, id, opts) {
  return soldesComptes(state, opts).find((s) => s.compte.id === Number(id))?.solde || 0;
}

// Numéro de virement interne : VIR-2026-000001 (jamais réutilisé)
function numeroVirement(state, date) {
  const year = String(date || todayISO()).slice(0, 4);
  if (!state.compteursVirement || typeof state.compteursVirement !== 'object') state.compteursVirement = {};
  const next = num(state.compteursVirement[year]) + 1;
  state.compteursVirement[year] = next;
  return `VIR-${year}-${String(next).padStart(6, '0')}`;
}

export function validateVirement(state, payload = {}) {
  const de = compteOf(state, payload.deId);
  const vers = compteOf(state, payload.versId);
  const montant = Number(payload.montant);
  const date = payload.date || todayISO();
  if (!de || !vers) return { ok: false, message: 'Choisissez le compte de départ et le compte d’arrivée.' };
  if (de.id === vers.id) return { ok: false, message: 'Les deux comptes doivent être différents.' };
  if (de.actif === false || vers.actif === false) return { ok: false, message: 'Un compte désactivé ne peut pas être mouvementé.' };
  if (!Number.isInteger(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être un nombre entier supérieur à zéro.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) return { ok: false, message: 'Date invalide (pas de date future).' };
  if (!text(payload.motif)) return { ok: false, message: 'Indiquez le motif du virement (ex. dépôt en banque).' };
  if (payload.token && (state.virements || []).some((v) => v.token === payload.token)) return { ok: false, message: 'Ce virement a déjà été enregistré (double soumission évitée).' };
  const verrou = motifVerrou(state, de.id, date, 'un virement') || motifVerrou(state, vers.id, date, 'un virement');
  if (verrou) return { ok: false, message: verrou };
  const disponible = soldeCompte(state, de.id, { to: date });
  if (montant > disponible) return { ok: false, message: `Solde insuffisant sur « ${de.libelle} » au ${date} (${disponible.toLocaleString('fr-FR')} disponible).` };
  return { ok: true };
}

export function createVirement(state, payload = {}) {
  exiger('tresorerie.virements');
  const check = validateVirement(state, payload);
  if (!check.ok) throw new Error(check.message);
  return withTransaction(state, () => {
    const user = currentUser();
    const date = payload.date || todayISO();
    const virement = {
      id: nextId(state.virements), numero: numeroVirement(state, date), date, deId: Number(payload.deId), versId: Number(payload.versId),
      montant: Number(payload.montant), motif: text(payload.motif), reference: text(payload.reference), utilisateur: user?.nom || '', utilisateurId: user?.id || 0,
      annule: false, token: payload.token || '', creeLe: Date.now()
    };
    state.virements.push(virement);
    logOperation(state, 'virement', `${virement.numero} — ${compteLabel(state, virement.deId)} → ${compteLabel(state, virement.versId)} : ${virement.motif}`, virement.montant);
    return virement;
  });
}

export function cancelVirement(state, id, motif) {
  exiger('tresorerie.corriger');
  const virement = (state.virements || []).find((v) => v.id === Number(id));
  if (!virement || virement.annule) return null;
  exigerNonVerrouille(state, virement.deId, virement.date, 'l’annulation de ce virement');
  exigerNonVerrouille(state, virement.versId, virement.date, 'l’annulation de ce virement');
  if (!text(motif)) throw new Error('Le motif d’annulation est obligatoire.');
  return withTransaction(state, () => {
    Object.assign(virement, { annule: true, motifAnnulation: text(motif), dateAnnulation: todayISO(), annulePar: currentUser()?.nom || '' });
    logOperation(state, 'annulation', `Virement ${virement.numero} annulé — ${virement.motifAnnulation}`, virement.montant);
    return virement;
  });
}
