import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser, exiger } from './auth.js';
import { todayISO } from './utils.js';
import { compteOf, compteParDefaut } from './comptes.js';
import { motifVerrou, motifCaisseFermee, exigerNonVerrouille } from './clotures.js';

export const MODES_REGLEMENT_DEPENSE = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money' };
// Dépenses générées automatiquement par la paie : corrigées et annulées depuis leur module d'origine
const SOURCES_PAIE = ['paie', 'avance'];
export const depenseDePaie = (depense) => SOURCES_PAIE.includes(depense?.source?.type);

// Catégories proposées à une nouvelle installation, modifiables par l'établissement (Paramètres financiers).
// CATEGORIES_DEPENSE est mis à jour sur place avec la liste configurée.
export const CATEGORIES_DEPENSE_DEFAUT = [
  'Salaires et indemnités', 'Avances sur salaire', 'Eau', 'Électricité', 'Loyer', 'Entretien et réparations', 'Fournitures et matériel',
  'Prestations de services', 'Transport', 'Communication', 'Impôts et frais administratifs', 'Autres charges'
];
export const CATEGORIES_DEPENSE = [...CATEGORIES_DEPENSE_DEFAUT];

const nettoyerListe = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().slice(0, 60)).filter(Boolean))];

export function syncCategoriesDepense(state) {
  const configured = nettoyerListe(state.config.categoriesDepense);
  state.config.categoriesDepense = configured.length ? configured : [...CATEGORIES_DEPENSE_DEFAUT];
  CATEGORIES_DEPENSE.splice(0, CATEGORIES_DEPENSE.length, ...state.config.categoriesDepense);
  return CATEGORIES_DEPENSE;
}

// Les catégories des dépenses déjà enregistrées restent valables (historique) même si elles sont retirées de la liste
export function setCategoriesDepense(state, list) {
  exiger('admin');
  const next = nettoyerListe(list);
  if (!next.length) throw new Error('Gardez au moins une catégorie de dépense.');
  state.config.categoriesDepense = next;
  return syncCategoriesDepense(state);
}

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
  if (!Number.isInteger(montant)) return { ok: false, message: 'Le montant doit être un nombre entier (sans décimales).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Date de dépense invalide.' };
  if (date > todayISO()) return { ok: false, message: 'La date de la dépense ne peut pas être dans le futur.' };
  if (!text(payload.demandeur)) return { ok: false, message: 'Indiquez qui a demandé la dépense.' };
  if (payload.mode && !MODES_REGLEMENT_DEPENSE[payload.mode]) return { ok: false, message: 'Mode de règlement inconnu.' };
  if (payload.compteId) {
    const compte = compteOf(state, payload.compteId);
    if (!compte) return { ok: false, message: 'Compte payeur introuvable.' };
    if (compte.actif === false) return { ok: false, message: `Le compte « ${compte.libelle} » est désactivé.` };
  }
  const annee = state.annees.find((a) => a.id === Number(payload.anneeId));
  if (!annee) return { ok: false, message: 'Année scolaire introuvable.' };
  if (annee.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : aucune dépense ne peut y être enregistrée.` };
  const compteCible = Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0;
  const verrou = motifVerrou(state, compteCible, date, 'une dépense') || motifCaisseFermee(state, compteCible, date);
  if (verrou) return { ok: false, message: verrou };
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
  // Dépense générée par la paie : droit « paie » ; sinon droit de saisie des dépenses
  exiger(SOURCES_PAIE.includes(payload.source?.type) ? 'paie.gerer' : 'depenses.saisir');
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
      mode: MODES_REGLEMENT_DEPENSE[payload.mode] ? payload.mode : 'espece',
      // Compte qui paie (caisse, banque…) : par défaut celui qui correspond au mode de règlement
      compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0,
      observation: text(payload.observation),
      statut: 'validee',
      piece: payload.piece || null,
      // Dépense générée par la paie ou une avance : synchronisée avec son origine
      source: payload.source || null,
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
  exiger('depenses.corriger');
  const depense = state.depenses.find((d) => d.id === Number(id));
  if (!depense || depense.annule) return null;
  if (depenseDePaie(depense)) throw new Error('Dépense générée par la paie : elle se corrige depuis le module Paie du personnel.');
  // Le contrôle de doublon porte sur l'enregistrement lui-même (il vient d'être créé) : seul un doublon est toléré ici
  exigerNonVerrouille(state, depense.compteId, depense.date, 'la correction de cette dépense');
  const check = validateDepense(state, { ...payload, token: '' }, { ignoreDuplicate: true });
  if (!check.ok) return null;
  return withTransaction(state, () => {
    const before = { categorie: depense.categorie, description: depense.description, montant: depense.montant, date: depense.date, beneficiaire: depense.beneficiaire, demandeur: depense.demandeur, reference: depense.reference, anneeId: depense.anneeId, mode: depense.mode, compteId: depense.compteId, observation: depense.observation || '' };
    depense.historique = [...(depense.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', motif: text(payload.motifCorrection), avant: before }];
    Object.assign(depense, {
      anneeId: Number(payload.anneeId), categorie: text(payload.categorie), description: text(payload.description), montant: Number(payload.montant),
      date: payload.date || depense.date, beneficiaire: text(payload.beneficiaire), demandeur: text(payload.demandeur), reference: text(payload.reference), mode: payload.mode || depense.mode || 'espece',
      compteId: Number(payload.compteId) || depense.compteId, observation: payload.observation !== undefined ? text(payload.observation) : (depense.observation || '')
    });
    if (payload.piece) depense.piece = payload.piece;
    logOperation(state, 'depense', `${depense.numero} corrigée (avant : ${before.montant} — ${before.description})`, depense.montant);
    return depense;
  });
}

// Annulation : la ligne et son numéro sont conservés, elle n'entre plus dans les totaux
export function cancelDepense(state, id, motif, { systeme = false } = {}) {
  const depense = state.depenses.find((d) => d.id === Number(id));
  if (!depense || depense.annule || !text(motif)) return null;
  exigerNonVerrouille(state, depense.compteId, depense.date, 'l’annulation de cette dépense');
  if (depenseDePaie(depense) && !systeme) throw new Error('Dépense générée par la paie : elle s’annule depuis le module Paie du personnel.');
  exiger(systeme ? 'paie.gerer' : 'depenses.corriger');
  return withTransaction(state, () => {
    depense.annule = true;
    depense.statut = 'annulee';
    depense.motif = text(motif);
    depense.dateAnnulation = todayISO();
    depense.annuleePar = currentUser()?.nom || '';
    logOperation(state, 'annulation', `Dépense ${depense.numero} annulée — ${depense.motif}`, depense.montant);
    return depense;
  });
}

// ---------- Dépenses récurrentes (loyer, abonnements, salaires fixes hors paie…) ----------
// Un modèle décrit la dépense et sa fréquence. L'application signale chaque échéance due ; rien n'est jamais
// enregistré automatiquement : l'utilisateur confirme chaque occurrence (montant et date ajustables), ce qui crée
// une dépense ordinaire reliée au modèle et à sa période (une période ne peut être enregistrée qu'une fois).
export const FREQUENCES = { mensuelle: 'Mensuelle', trimestrielle: 'Trimestrielle', semestrielle: 'Semestrielle', annuelle: 'Annuelle' };
const PAS_MOIS = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };
export const JOURS_ALERTE_RECURRENTE = 15;

function checkRecurrente(state, payload) {
  const libelle = text(payload.libelle);
  const montant = Number(payload.montant);
  const jour = Number(payload.jour || 1);
  if (!libelle) throw new Error('Donnez un libellé à la dépense récurrente.');
  if (!text(payload.categorie)) throw new Error('Choisissez une catégorie.');
  if (!Number.isInteger(montant) || montant <= 0) throw new Error('Le montant doit être un nombre entier supérieur à zéro.');
  if (!FREQUENCES[payload.frequence]) throw new Error('Choisissez une fréquence.');
  if (!Number.isInteger(jour) || jour < 1 || jour > 28) throw new Error('Le jour d’échéance doit être compris entre 1 et 28.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dateDebut || '')) throw new Error('Indiquez la date de la première échéance.');
  if (payload.dateFin && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dateFin) || payload.dateFin < payload.dateDebut)) throw new Error('La date de fin doit suivre la date de début.');
  if (payload.mode && !MODES_REGLEMENT_DEPENSE[payload.mode]) throw new Error('Mode de règlement inconnu.');
  if (payload.compteId && !compteOf(state, payload.compteId)) throw new Error('Compte payeur introuvable.');
  return {
    libelle, categorie: text(payload.categorie), montant, beneficiaire: text(payload.beneficiaire), mode: MODES_REGLEMENT_DEPENSE[payload.mode] ? payload.mode : 'espece',
    compteId: Number(payload.compteId) || compteParDefaut(state, payload.mode || 'espece')?.id || 0, frequence: payload.frequence, jour, dateDebut: payload.dateDebut, dateFin: payload.dateFin || ''
  };
}

export function createRecurrente(state, payload = {}) {
  exiger('depenses.saisir');
  const fields = checkRecurrente(state, payload);
  const item = { id: nextId(state.depensesRecurrentes), ...fields, actif: true, ignorees: [], creePar: currentUser()?.nom || '', creeLe: new Date().toISOString() };
  state.depensesRecurrentes.push(item);
  logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » créée (${FREQUENCES[item.frequence]})`, item.montant);
  return item;
}

export function updateRecurrente(state, id, payload = {}) {
  exiger('depenses.saisir');
  const item = state.depensesRecurrentes.find((r) => r.id === Number(id));
  if (!item) throw new Error('Dépense récurrente introuvable.');
  const fields = checkRecurrente(state, payload);
  item.historique = [...(item.historique || []), { horodatage: new Date().toISOString(), par: currentUser()?.nom || '', avant: { montant: item.montant, frequence: item.frequence, jour: item.jour, dateFin: item.dateFin } }];
  Object.assign(item, fields);
  logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » modifiée`, item.montant);
  return item;
}

export function setRecurrenteActive(state, id, actif) {
  exiger('depenses.saisir');
  const item = state.depensesRecurrentes.find((r) => r.id === Number(id));
  if (!item) throw new Error('Dépense récurrente introuvable.');
  item.actif = Boolean(actif);
  logOperation(state, 'depense', `Dépense récurrente « ${item.libelle} » ${item.actif ? 'réactivée' : 'suspendue'}`);
  return item;
}

const pad2 = (n) => String(n).padStart(2, '0');

// Échéances d'un modèle jusqu'à une date limite : { periode: 'AAAA-MM', date: 'AAAA-MM-JJ' }
export function echeancesRecurrente(item, jusquA) {
  const out = [];
  const [y0, m0] = item.dateDebut.split('-').map(Number);
  const pas = PAS_MOIS[item.frequence] || 1;
  for (let k = 0; k < 600; k += pas) {
    const d = new Date(y0, m0 - 1 + k, 1);
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(item.jour)}`;
    if (date > jusquA || (item.dateFin && date > item.dateFin)) break;
    if (date >= item.dateDebut.slice(0, 8) + '01') out.push({ periode: date.slice(0, 7), date });
  }
  return out;
}

const ajouterJours = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

// Occurrences à enregistrer : échues ou proches (15 jours), ni enregistrées (dépense valide), ni ignorées
export function occurrencesDues(state, today = todayISO()) {
  const limite = ajouterJours(today, JOURS_ALERTE_RECURRENTE);
  return (state.depensesRecurrentes || []).filter((r) => r.actif).flatMap((r) => echeancesRecurrente(r, limite)
    .filter(({ periode }) => !(r.ignorees || []).includes(periode)
      && !state.depenses.some((d) => !d.annule && d.source?.type === 'recurrente' && d.source.id === r.id && d.source.periode === periode))
    .map((o) => ({ recurrente: r, ...o, enRetard: o.date < today })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Enregistre l'occurrence d'une période : dépense ordinaire reliée au modèle
export function enregistrerOccurrence(state, recurrenteId, periode, payload = {}) {
  exiger('depenses.saisir');
  const r = state.depensesRecurrentes.find((x) => x.id === Number(recurrenteId));
  if (!r) throw new Error('Dépense récurrente introuvable.');
  if (state.depenses.some((d) => !d.annule && d.source?.type === 'recurrente' && d.source.id === r.id && d.source.periode === periode)) throw new Error('Cette échéance est déjà enregistrée.');
  const data = {
    anneeId: payload.anneeId, categorie: r.categorie, description: `${r.libelle} — ${periode}`, montant: payload.montant ?? r.montant, date: payload.date || todayISO(),
    beneficiaire: r.beneficiaire, demandeur: payload.demandeur || currentUser()?.nom || 'Dépense récurrente', reference: text(payload.reference), mode: r.mode, compteId: r.compteId,
    source: { type: 'recurrente', id: r.id, periode }
  };
  const check = validateDepense(state, data, { ignoreDuplicate: true });
  if (!check.ok) throw new Error(check.message);
  return createDepense(state, data, { ignoreDuplicate: true });
}

export function ignorerOccurrence(state, recurrenteId, periode) {
  exiger('depenses.saisir');
  const r = state.depensesRecurrentes.find((x) => x.id === Number(recurrenteId));
  if (!r) throw new Error('Dépense récurrente introuvable.');
  r.ignorees = [...new Set([...(r.ignorees || []), periode])];
  logOperation(state, 'depense', `Échéance ${periode} de « ${r.libelle} » ignorée`);
  return r;
}
