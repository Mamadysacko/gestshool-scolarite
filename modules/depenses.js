import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';

export const CATEGORIES_DEPENSE = [
  'Salaires et indemnités', 'Fournitures et matériel', 'Entretien et réparations', 'Eau et électricité', 'Transport',
  'Communication', 'Équipement', 'Examens et pédagogie', 'Sécurité et assurance', 'Impôts et frais administratifs', 'Divers'
];

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const text = (value) => String(value ?? '').trim();

// Numéro de pièce unique et séquentiel par année civile : DEP-2026-000001 (jamais réutilisé, même après annulation)
export function ensureExpenseNumber(state, depense) {
  if (depense.numero) return depense.numero;
  const year = String(depense.date || todayISO()).slice(0, 4);
  if (!state.compteursDepense || typeof state.compteursDepense !== 'object') state.compteursDepense = {};
  const used = state.depenses
    .map((d) => d.numero)
    .filter((n) => typeof n === 'string' && n.startsWith(`DEP-${year}-`))
    .reduce((max, n) => Math.max(max, Number(n.split('-')[2]) || 0), 0);
  const next = Math.max(Number(state.compteursDepense[year] || 0), used) + 1;
  state.compteursDepense[year] = next;
  depense.numero = `DEP-${year}-${String(next).padStart(6, '0')}`;
  return depense.numero;
}

export function validateDepense(state, payload = {}, { ignoreDuplicate = false } = {}) {
  const montant = Number(payload.montant);
  const date = payload.date || todayISO();
  if (!text(payload.categorie)) return { ok: false, message: 'Choisissez ou saisissez une catégorie de dépense.' };
  if (!text(payload.description)) return { ok: false, message: 'La description de la dépense est obligatoire.' };
  if (!Number.isFinite(montant) || montant <= 0) return { ok: false, message: 'Le montant doit être supérieur à zéro.' };
  if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier de francs.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de dépense invalide.' };
  if (date > todayISO()) return { ok: false, message: 'La date de la dépense ne peut pas être dans le futur.' };
  if (!text(payload.demandeur)) return { ok: false, message: 'Indiquez qui a demandé la dépense.' };
  const annee = state.annees.find((a) => a.id === Number(payload.anneeId));
  if (!annee) return { ok: false, message: 'Année scolaire introuvable.' };
  if (annee.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : aucune dépense ne peut y être enregistrée.` };
  if (payload.token && state.depenses.some((d) => d.token === payload.token)) {
    return { ok: false, message: 'Ce formulaire a déjà été enregistré (double soumission évitée).' };
  }
  const now = Date.now();
  const similar = state.depenses.some((d) => !d.annule && Number(d.montant) === montant && d.date === date
    && d.categorie === text(payload.categorie) && text(d.beneficiaire) === text(payload.beneficiaire) && now - Number(d.creeLe || 0) < DUPLICATE_WINDOW_MS);
  if (similar && !ignoreDuplicate) return { ok: false, duplicate: true, message: 'Une dépense identique vient d’être enregistrée.' };
  return { ok: true };
}

export function createDepense(state, payload = {}, options = {}) {
  if (!validateDepense(state, payload, options).ok) return null;
  return withTransaction(state, () => {
    const user = currentUser();
    const depense = {
      id: nextId(state.depenses),
      anneeId: Number(payload.anneeId),
      categorie: text(payload.categorie),
      description: text(payload.description),
      montant: Number(payload.montant),
      date: payload.date || todayISO(),
      beneficiaire: text(payload.beneficiaire),
      demandeur: text(payload.demandeur),
      reference: text(payload.reference),
      piece: payload.piece || null,
      caissier: text(state.config.caissier) || user?.nom || '',
      utilisateur: user?.nom || '',
      utilisateurId: user?.id || 0,
      annule: false,
      motif: '',
      historique: [],
      token: payload.token || '',
      creeLe: Date.now()
    };
    state.depenses.push(depense);
    ensureExpenseNumber(state, depense);
    logOperation(state, 'depense', `${depense.numero} — ${depense.categorie} : ${depense.description}`, depense.montant);
    return depense;
  });
}

// Correction : l'état précédent est conservé dans l'historique de la dépense (rien n'est perdu)
export function updateDepense(state, id, payload = {}) {
  const depense = state.depenses.find((d) => d.id === Number(id));
  if (!depense || depense.annule) return null;
  // Le contrôle de doublon porte sur l'enregistrement lui-même (il vient d'être créé) : seul un doublon est toléré ici
  const check = validateDepense(state, { ...payload, token: '' }, { ignoreDuplicate: true });
  if (!check.ok) return null;
  return withTransaction(state, () => {
    const before = { categorie: depense.categorie, description: depense.description, montant: depense.montant, date: depense.date, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference, anneeId: depense.anneeId };
    depense.historique = [...(depense.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant: before }];
    Object.assign(depense, {
      anneeId: Number(payload.anneeId), categorie: text(payload.categorie), description: text(payload.description), montant: Number(payload.montant),
      date: payload.date || depense.date, beneficiaire: text(payload.beneficiaire), demandeur: text(payload.demandeur), reference: text(payload.reference)
    });
    if (payload.piece) depense.piece = payload.piece;
    logOperation(state, 'depense', `${depense.numero} corrigée (avant : ${before.montant} — ${before.description})`, depense.montant);
    return depense;
  });
}

// Annulation : la ligne et son numéro sont conservés, elle n'entre plus dans les totaux
export function cancelDepense(state, id, motif) {
  const depense = state.depenses.find((d) => d.id === Number(id));
  if (!depense || depense.annule || !text(motif)) return null;
  return withTransaction(state, () => {
    depense.annule = true;
    depense.motif = text(motif);
    depense.dateAnnulation = todayISO();
    depense.annuleePar = currentUser()?.nom || '';
    logOperation(state, 'annulation', `Dépense ${depense.numero} annulée — ${depense.motif}`, depense.montant);
    return depense;
  });
}
