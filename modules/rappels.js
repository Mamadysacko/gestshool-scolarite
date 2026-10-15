import { ordreEcheances, resteEcheance, libelleEcheance, echeancierSituation } from './allocation.js';
import { detteRestante } from './reliquats.js';
import { todayISO } from './utils.js';

// Fiches de rappel : générées à l'approche de chaque échéance configurée (date limite de la tranche ou du mois).
//  - paiement par tranches (et frais d'inscription) : 14 jours avant la date limite ;
//  - paiement mensuel : 7 jours avant la date d'échéance.
// Une échéance dépassée et non soldée reste en rappel jusqu'à son règlement.
export const DELAI_RAPPEL_JOURS = { tranche: 14, mensuel: 7 };

export function delaiRappel(echeance) {
  return echeance.mensualite ? DELAI_RAPPEL_JOURS.mensuel : DELAI_RAPPEL_JOURS.tranche;
}

export function joursEntre(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00`) - new Date(`${fromIso}T00:00:00`)) / 86400000);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Date à partir de laquelle la fiche d'une échéance est générée
export function dateRappel(echeance) {
  return echeance.dateLimite ? addDays(echeance.dateLimite, -delaiRappel(echeance)) : '';
}

// Libellé compact : au-delà de deux mois consécutifs, « Septembre 2025 → Mai 2026 (9 mois) »
export function resumeEcheances(echeances) {
  const mois = echeances.filter((e) => e.mensualite);
  if (mois.length > 2 && mois.length === echeances.length) return `${libelleEcheance(mois[0])} → ${libelleEcheance(mois[mois.length - 1])} (${mois.length} mois)`;
  if (mois.length > 2) {
    const autres = echeances.filter((e) => !e.mensualite).map(libelleEcheance);
    return [...autres, `${libelleEcheance(mois[0])} → ${libelleEcheance(mois[mois.length - 1])} (${mois.length} mois)`].join(' + ');
  }
  return echeances.map(libelleEcheance).join(' + ');
}

// Une fiche par élève : échéances non soldées dont la date de rappel est atteinte à la date de référence
export function rappelsDus(state, inscriptions, dateRef = todayISO()) {
  return inscriptions.map((inscription) => {
    const dues = ordreEcheances(inscription).filter((e) => resteEcheance(e) > 0 && e.dateLimite && dateRappel(e) <= dateRef);
    if (!dues.length) return null;
    const echeance = dues[0];
    const late = dues.some((e) => e.dateLimite < dateRef);
    return {
      inscription, echeance, echeances: dues, late,
      montant: dues.reduce((s, e) => s + resteEcheance(e), 0),
      libelles: resumeEcheances(dues),
      jours: joursEntre(dateRef, echeance.dateLimite),
      dateLimite: dues[dues.length - 1].dateLimite,
      totalReste: echeancierSituation(inscription).reste,
      dette: detteRestante(state, inscription.eleveId, inscription.id)
    };
  }).filter(Boolean).sort((a, b) => Number(b.late) - Number(a.late) || String(a.echeance.dateLimite).localeCompare(String(b.echeance.dateLimite)));
}
