import { paymentAllocations, allocate, ordreEcheances } from './allocation.js';
import { ecartArrondi, regleArrondi } from './arrondi.js';
import { repartirReduction } from './reductions.js';

// Modalité de règlement d'une inscription : « par tranches » ou « mensuel ».
// Elle est choisie lors du premier paiement (module Paiements), et non plus imposée à l'inscription.
// Dès qu'un paiement valide existe, elle est verrouillée : les imputations déjà faites portent sur cet échéancier.

export const MODALITES = { tranches: 'Paiement par tranches', mensuel: 'Paiement mensuel' };

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function addMonths(iso, count) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + count, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d || 1, last));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthLabel(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  return `${MOIS[m - 1]} ${y}`;
}

export function tarifFor(state, inscription) {
  return state.tarifs.find((t) => t.classeId === inscription.classeId && t.anneeId === inscription.anneeId) || null;
}

export function totalTranches(tarif) {
  return (tarif?.tranches || []).reduce((s, t) => s + Number(t.montant || 0), 0);
}

// Formule mensuelle d'un tarif : mensualité, dernière mensualité (écart d'arrondi absorbé) et total réel
export function formuleMensuelle(state, tarif) {
  const mensuel = Number(tarif?.montantMensuel || 0);
  const nb = Number(tarif?.nbMois || 0);
  const ajuste = mensuel > 0 && ecartArrondi(mensuel, nb, tarif?.montantAnnuel, regleArrondi(state?.config, 'mensualites'));
  const dernier = ajuste ? Number(tarif.montantAnnuel) - mensuel * (nb - 1) : mensuel;
  return { mensuel, nb, dernier, ajuste, total: mensuel * (nb - 1) + dernier };
}

// Texte « 9 × 83 000 (dernière 86 000) = 750 000 »
export function texteMensuel(state, tarif, fmt) {
  const m = formuleMensuelle(state, tarif);
  return m.ajuste ? `${m.nb - 1} × ${fmt(m.mensuel)} + 1 × ${fmt(m.dernier)} = ${fmt(m.total)}` : `${m.nb} × ${fmt(m.mensuel)} = ${fmt(m.total)}`;
}

export function totalMensuel(tarif, state = null) {
  return formuleMensuelle(state, tarif).total;
}

// Modalités proposables pour un tarif : chacune doit avoir des montants complets
export function modalitesDisponibles(tarif) {
  return {
    tranches: Boolean(tarif) && (tarif.tranches || []).length > 0 && totalTranches(tarif) > 0,
    mensuel: Boolean(tarif) && Number(tarif.montantMensuel) > 0 && Number(tarif.nbMois) > 0
  };
}

export function hasValidPayments(state, inscription) {
  return state.paiements.some((p) => !p.annule && p.inscriptionId === inscription.id);
}

// Identifiants d'échéances jamais réutilisés pour une même inscription (les paiements annulés gardent leurs références)
export function nextEcheanceId(state, inscription) {
  const used = [...(inscription.echeances || []).map((e) => Number(e.id)),
    ...state.paiements.filter((p) => p.inscriptionId === inscription.id).flatMap((p) => paymentAllocations(p).map((a) => Number(a.echeanceId)))];
  return Math.max(inscription.id * 1000, ...used) + 1;
}

// Construit l'échéancier d'une modalité à partir du tarif (sans rien enregistrer)
export function buildEcheances(state, inscription, tarif, modalite) {
  let id = nextEcheanceId(state, inscription);
  const base = (fields) => ({ id: id++, montantPaye: 0, remise: 0, statut: 'impayee', ...fields });
  if (modalite === 'mensuel') {
    const count = Math.min(Math.max(Number(tarif.nbMois || 0), 1), 12);
    const annee = state.annees.find((a) => a.id === inscription.anneeId);
    const start = tarif.moisDebut || annee?.dateDebut || '';
    const mensuel = Number(tarif.montantMensuel);
    // Écart dû au seul arrondi de la mensualité : la dernière mensualité l'absorbe (total = montant annuel exact)
    const dernier = ecartArrondi(mensuel, count, tarif.montantAnnuel, regleArrondi(state.config, 'mensualites')) ? Number(tarif.montantAnnuel) - mensuel * (count - 1) : mensuel;
    return Array.from({ length: count }, (_, index) => {
      const dateLimite = start ? addMonths(start, index) : '';
      return base({ trancheId: index + 1, montant: index === count - 1 ? dernier : mensuel, dateLimite, libelle: dateLimite ? monthLabel(dateLimite) : `Mensualité ${index + 1}`, mensualite: true });
    });
  }
  return (tarif.tranches || []).map((tranche, index) => base({
    trancheId: Number(tranche.num || index + 1), montant: Number(tranche.montant || 0), dateLimite: tranche.dateLimite || '', libelle: tranche.libelle || `Tranche ${index + 1}`
  }));
}

// Échéances de frais d'inscription / réinscription : indépendantes de la modalité, toujours conservées
export function fraisEcheances(inscription) {
  return (inscription.echeances || []).filter((e) => e.type === 'frais');
}

export function scolariteEcheances(inscription) {
  return (inscription.echeances || []).filter((e) => e.type !== 'frais');
}

// Modalité effective de l'échéancier actuel (les anciennes données sans champ sont déduites)
export function modaliteActuelle(inscription) {
  if (inscription.modalite) return inscription.modalite;
  const scolarite = scolariteEcheances(inscription);
  if (!scolarite.length) return null;
  return scolarite.some((e) => e.mensualite) ? 'mensuel' : 'tranches';
}

// Réimpute les paiements valides de l'inscription, dans leur ordre d'enregistrement, sur un nouvel échéancier.
// Aucun paiement n'est supprimé ni compté deux fois : seule sa répartition change. Ne modifie rien.
export function reimputer(state, inscription, echeances) {
  const copy = echeances.map((e) => ({ ...e, montantPaye: 0 }));
  const ordered = ordreEcheances({ echeances: copy });
  const payments = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((x, y) => x.id - y.id);
  const allocations = new Map();
  for (const payment of payments) {
    const result = allocate(ordered, payment.montant);
    if (result.nonImpute > 0) {
      const dejaPaye = payments.reduce((sum, p) => sum + Number(p.montant || 0), 0);
      return { ok: false, message: `Changement impossible : ${dejaPaye.toLocaleString('fr-FR')} déjà payés dépassent le total de la nouvelle modalité (${copy.reduce((sum, e) => sum + Number(e.montant || 0), 0).toLocaleString('fr-FR')}).` };
    }
    result.allocations.forEach((alloc) => { copy.find((e) => e.id === alloc.echeanceId).montantPaye += alloc.montant; });
    allocations.set(payment.id, result.allocations.map(({ echeanceId, montant, libelle }) => ({ echeanceId, montant, libelle })));
  }
  return { ok: true, echeances: copy, allocations };
}

// Échéancier à utiliser pour un paiement avec la modalité demandée. Ne modifie rien.
// { ok, echeances, regenerate, changement, reimputations, message }
export function planPourModalite(state, inscription, modalite) {
  if (!MODALITES[modalite]) return { ok: false, echeances: [], message: 'Choisissez la modalité de règlement : paiement mensuel ou par tranches.' };
  const actuelle = modaliteActuelle(inscription);
  const paid = hasValidPayments(state, inscription);
  // Modalité inchangée : on garde l'échéancier en place (avec son historique d'imputations)
  if (inscription.modalite === modalite && scolariteEcheances(inscription).length) return { ok: true, echeances: inscription.echeances, regenerate: false };
  if (!inscription.modalite && paid && actuelle === modalite) return { ok: true, echeances: inscription.echeances, regenerate: false };
  const tarif = tarifFor(state, inscription);
  if (!tarif) return { ok: false, echeances: [], message: 'Aucun tarif n’est configuré pour la classe de cet élève : définissez d’abord les frais dans « Tarifs ».' };
  if (!modalitesDisponibles(tarif)[modalite]) {
    return { ok: false, echeances: [], message: modalite === 'mensuel' ? 'Le tarif de cette classe n’a pas de montant mensuel : complétez-le dans « Tarifs ».' : 'Le tarif de cette classe n’a pas de tranches valides.' };
  }
  const nouveaux = [...fraisEcheances(inscription), ...buildEcheances(state, inscription, tarif, modalite)];
  const changement = Boolean(inscription.modalite) && inscription.modalite !== modalite;
  if (!paid) {
    const reduite = repartirReduction(inscription, nouveaux);
    if (!reduite.ok) return { ok: false, echeances: [], message: reduite.message };
    return { ok: true, echeances: nouveaux, regenerate: true, changement };
  }
  const result = reimputer(state, inscription, nouveaux);
  if (!result.ok) return { ok: false, echeances: [], message: result.message };
  // Réduction de l'élève (remise, bourse, exonération) reportée sur la partie non payée du nouvel échéancier
  const reduite = repartirReduction(inscription, result.echeances);
  if (!reduite.ok) return { ok: false, echeances: [], message: reduite.message };
  return { ok: true, echeances: result.echeances, regenerate: true, changement: true, reimputations: result.allocations };
}

// Applique la modalité choisie : nouvel échéancier et, si des paiements existent, réimputation tracée.
// À appeler dans une transaction (en cas d'échec, rien n'est modifié).
export function appliquerModalite(state, inscription, modalite, auteur = '') {
  const plan = planPourModalite(state, inscription, modalite);
  if (!plan.ok) throw new Error(plan.message);
  const avant = inscription.modalite;
  if (plan.regenerate) {
    const now = new Date().toISOString();
    if (plan.reimputations) {
      state.paiements.forEach((payment) => {
        const next = plan.reimputations.get(payment.id);
        if (!next) return;
        payment.historiqueImputations = [...(payment.historiqueImputations || []), { horodatage: now, modalite: avant || modaliteActuelle(inscription), allocations: payment.allocations }];
        payment.allocations = next;
        payment.echeanceId = next[0]?.echeanceId || payment.echeanceId;
      });
    }
    inscription.echeances = plan.echeances;
    if (plan.changement) inscription.historiqueModalites = [...(inscription.historiqueModalites || []), { horodatage: now, de: avant, vers: modalite, par: auteur }];
  }
  inscription.modalite = modalite;
  return plan;
}

// Échéancier provisoire « par tranches » créé à l'inscription pour que les montants attendus et les retards
// soient visibles ; la modalité reste « à choisir » (null) jusqu'au premier paiement. Les frais sont conservés.
export function echeancierProvisoire(state, inscription, tarif) {
  const frais = fraisEcheances(inscription);
  inscription.modalite = null;
  inscription.echeances = !tarif || !modalitesDisponibles(tarif).tranches ? frais : [...frais, ...buildEcheances(state, inscription, tarif, 'tranches')];
  repartirReduction(inscription);
  return inscription;
}
