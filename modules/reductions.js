import { currentUser, exiger } from './auth.js';
import { todayISO } from './utils.js';

// Réductions accordées à un élève sur ses frais de scolarité : remise, bourse ou exonération totale.
// Règles :
//  - elles portent sur la scolarité (tranches ou mensualités), jamais sur les frais d'inscription ni les frais annexes ;
//  - elles réduisent seulement ce qui RESTE à payer, en partant de la dernière échéance : un paiement déjà imputé
//    n'est jamais déplacé et aucun crédit implicite n'est créé ;
//  - une remise est plafonnée par le tarif de la classe (« remise maximale ») ; bourses et exonérations sont
//    accordées par un administrateur ; chaque décision est motivée et historisée.

export const TYPES_REDUCTION = { remise: 'Remise', bourse: 'Bourse', exoneration: 'Exonération totale' };
export const MODES_REDUCTION = { pourcentage: 'Pourcentage', montant: 'Montant fixe' };

const num = (v) => Number(v || 0);
const scolarite = (echeances) => (echeances || []).filter((e) => e.type !== 'frais');

export function baseReduction(echeances) {
  return scolarite(echeances).reduce((s, e) => s + num(e.montant), 0);
}

// Montant de la réduction pour une base de scolarité donnée (arrondi au franc inférieur, jamais au-delà de la base)
export function montantReduction(reduction, base) {
  if (!reduction || base <= 0) return 0;
  if (reduction.type === 'exoneration') return base;
  if (reduction.mode === 'pourcentage') return Math.floor(base * Math.min(Math.max(num(reduction.valeur), 0), 100) / 100);
  return Math.min(Math.max(Math.floor(num(reduction.valeur)), 0), base);
}

// Répartit la réduction de l'inscription sur les échéances fournies (modifiées sur place).
// { ok, montant, message } — ok = false si la partie non payée ne suffit pas à absorber la réduction.
export function repartirReduction(inscription, echeances = inscription.echeances) {
  const list = scolarite(echeances);
  list.forEach((e) => { e.remise = 0; });
  const reduction = inscription.reduction;
  if (!reduction) return { ok: true, montant: 0 };
  const total = montantReduction(reduction, baseReduction(echeances));
  let left = total;
  const ordered = [...list].sort((a, b) => num(b.trancheId) - num(a.trancheId));
  for (const echeance of ordered) {
    if (left <= 0) break;
    const libre = Math.max(num(echeance.montant) - num(echeance.montantPaye), 0);
    const part = Math.min(libre, left);
    echeance.remise = part;
    left -= part;
  }
  if (left > 0) {
    return { ok: false, montant: total, message: `La réduction (${total.toLocaleString('fr-FR')}) dépasse ce qui reste à payer sur la scolarité (${(total - left).toLocaleString('fr-FR')} au plus) : les paiements déjà reçus ne sont jamais transformés en avoir.` };
  }
  return { ok: true, montant: total };
}

export function reductionLabel(reduction) {
  if (!reduction) return '';
  if (reduction.type === 'exoneration') return TYPES_REDUCTION.exoneration;
  const valeur = reduction.mode === 'pourcentage' ? `${num(reduction.valeur)} %` : num(reduction.valeur).toLocaleString('fr-FR');
  return `${TYPES_REDUCTION[reduction.type] || 'Réduction'} de ${valeur}`;
}

// Contrôle d'une demande de réduction (sans rien modifier)
export function validateReduction(state, inscription, payload = {}, tarif = null) {
  if (!inscription) return { ok: false, message: 'Inscription introuvable.' };
  const type = payload.type;
  if (!TYPES_REDUCTION[type]) return { ok: false, message: 'Choisissez le type de réduction.' };
  const mode = type === 'exoneration' ? 'pourcentage' : payload.mode;
  if (!MODES_REDUCTION[mode]) return { ok: false, message: 'Choisissez un pourcentage ou un montant fixe.' };
  const valeur = type === 'exoneration' ? 100 : Number(payload.valeur);
  if (!Number.isFinite(valeur) || valeur <= 0) return { ok: false, message: 'La valeur de la réduction doit être supérieure à zéro.' };
  if (mode === 'pourcentage' && valeur > 100) return { ok: false, message: 'Un pourcentage ne peut pas dépasser 100 %.' };
  if (mode === 'montant' && !Number.isInteger(valeur)) return { ok: false, message: 'Le montant de la réduction doit être un nombre entier.' };
  if (!String(payload.motif || '').trim()) return { ok: false, message: 'Le motif de la réduction est obligatoire.' };
  const annee = state.annees.find((a) => a.id === inscription.anneeId);
  if (annee?.statut === 'cloturee') return { ok: false, message: `L’année ${annee.annee} est clôturée : ses engagements ne peuvent plus changer.` };
  if ((state.reliquats || []).some((r) => r.inscriptionId === inscription.id)) return { ok: false, message: 'Le solde de cette inscription a déjà été reporté en dette : la réduction n’est plus modifiable.' };
  const base = baseReduction(inscription.echeances);
  if (base <= 0) return { ok: false, message: 'Aucun frais de scolarité n’est encore défini pour cet élève (tarif de la classe manquant).' };
  if (type === 'remise') {
    const plafond = Math.min(Math.max(num(tarif?.remiseMaxPct), 0), 100);
    const pct = mode === 'pourcentage' ? valeur : (valeur / base) * 100;
    if (pct > plafond + 1e-9) return { ok: false, message: plafond ? `Remise trop élevée : le tarif de la classe autorise au plus ${plafond} % (${Math.floor(base * plafond / 100).toLocaleString('fr-FR')}).` : 'Aucune remise n’est autorisée par le tarif de cette classe (« Remise maximale » à 0 %). Une bourse ou une exonération peut être accordée par un administrateur.' };
  }
  const essai = { ...inscription, reduction: { type, mode, valeur } };
  const copie = (inscription.echeances || []).map((e) => ({ ...e }));
  const result = repartirReduction(essai, copie);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, type, mode, valeur, montant: result.montant };
}

// Accorde (ou remplace) la réduction d'une inscription ; la précédente est conservée dans l'historique.
export function accorderReduction(state, inscription, payload = {}, tarif = null) {
  // Remise dans le plafond : droit ordinaire ; bourse, exonération ou remplacement d'une bourse : droit d'exception
  const exceptionnelle = payload.type !== 'remise' || (inscription?.reduction && inscription.reduction.type !== 'remise');
  exiger(exceptionnelle ? 'reductions.exceptionnelles' : 'reductions.accorder');
  const check = validateReduction(state, inscription, payload, tarif);
  if (!check.ok) throw new Error(check.message);
  const now = new Date().toISOString();
  if (inscription.reduction) inscription.historiqueReductions = [...(inscription.historiqueReductions || []), { ...inscription.reduction, remplaceeLe: now }];
  inscription.reduction = { type: check.type, mode: check.mode, valeur: check.valeur, motif: String(payload.motif).trim(), reference: String(payload.reference || '').trim(), par: currentUser()?.nom || '', date: todayISO(), horodatage: now };
  const result = repartirReduction(inscription);
  if (!result.ok) throw new Error(result.message);
  inscription.reduction.montant = result.montant;
  return inscription.reduction;
}

export function retirerReduction(state, inscription, motif = '') {
  exiger('reductions.exceptionnelles');
  if (!inscription?.reduction) return null;
  if (!String(motif).trim()) throw new Error('Le motif du retrait est obligatoire.');
  if ((state.reliquats || []).some((r) => r.inscriptionId === inscription.id)) throw new Error('Le solde de cette inscription a déjà été reporté en dette : la réduction n’est plus modifiable.');
  const ancienne = inscription.reduction;
  inscription.historiqueReductions = [...(inscription.historiqueReductions || []), { ...ancienne, retireeLe: new Date().toISOString(), motifRetrait: String(motif).trim(), retireePar: currentUser()?.nom || '' }];
  delete inscription.reduction;
  repartirReduction(inscription);
  return ancienne;
}
