import { escapeHtml, formatMoney, formatDateFr, numberToFrench, todayISO } from './utils.js';
import { classOf, studentOf, yearLabel } from './finance.js';
import { paymentAllocations, ordreEcheances, echeanceDu, allocationLabel, echeancierSituation, STATUT_ECHEANCE_LABELS } from './allocation.js';
import { MODALITES, modaliteActuelle } from './modalites.js';
import { ensureReceiptNumber } from './paiements.js';
import { printDocument } from './print.js';
import { enteteHtml } from './entete.js';

const MODES = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte' };

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function amountInWords(amount, devise) {
  const n = Math.floor(Number(amount) || 0);
  const unit = devise === 'GNF' ? `franc${n > 1 ? 's' : ''} guinéen${n > 1 ? 's' : ''}` : devise;
  return `${capitalize(numberToFrench(n))} ${unit}`;
}

// État de chaque échéance en ne comptant que les paiements VALIDÉS jusqu'au paiement donné (inclus).
// Sans paiement de référence : situation actuelle (tous les paiements validés).
export function progressionAt(state, inscription, payment = null) {
  const paid = new Map();
  state.paiements
    .filter((p) => !p.annule && p.inscriptionId === inscription.id && (!payment || p.id <= payment.id))
    .forEach((p) => paymentAllocations(p).forEach((a) => paid.set(a.echeanceId, (paid.get(a.echeanceId) || 0) + Number(a.montant || 0))));
  let currentFound = false;
  const lignes = ordreEcheances(inscription).map((e) => {
    const du = echeanceDu(e);
    const paye = Math.min(paid.get(e.id) || 0, du);
    const frais = e.type === 'frais';
    let etat = 'restant';
    if (paye >= du) etat = 'regle';
    else if (!currentFound && !frais) { etat = 'encours'; currentFound = true; }
    return { echeance: e, libelle: e.libelle || `Tranche ${e.trancheId}`, du, paye, reste: du - paye, etat, frais, taux: du ? Math.round(paye / du * 100) : 100 };
  });
  const total = lignes.reduce((s, l) => s + l.du, 0);
  const cumul = lignes.reduce((s, l) => s + l.paye, 0);
  const count = (etat) => lignes.filter((l) => !l.frais && l.etat === etat).length;
  const frais = lignes.find((l) => l.frais) || null;
  return { lignes, total, cumul, reste: Math.max(total - cumul, 0), taux: total ? Math.round(cumul / total * 100) : 0, regles: count('regle'), encours: count('encours'), restants: count('restant'), frais };
}

// Période couverte par un paiement : « Octobre 2025 → Décembre 2025 (3 mois) » ou « 1ère tranche + 2ème tranche »
function periodeConcernee(inscription, payment, modalite) {
  const labels = paymentAllocations(payment).map((a) => allocationLabel(inscription, a));
  if (!labels.length) return '—';
  if (modalite === 'mensuel' && labels.length > 1) return `${labels[0]} → ${labels[labels.length - 1]} (${labels.length} mois)`;
  return labels.join(' + ');
}

export function buildReceiptData(state, payment) {
  const inscription = state.inscriptions.find((i) => i.id === payment.inscriptionId);
  const student = studentOf(state, inscription);
  const classe = classOf(state, inscription?.classeId);
  // La modalité peut avoir changé depuis : le reçu suit l'échéancier actuel (la répartition a été réimputée)
  const modalite = (inscription ? modaliteActuelle(inscription) : null) || payment.modalite || 'tranches';
  const reimpute = Boolean(payment.modalite && payment.modalite !== modalite);
  const progression = progressionAt(state, inscription || { id: 0, echeances: [] }, payment);
  return {
    numero: payment.numeroRecu,
    date: payment.datePaiement,
    payeur: payment.payeur || '',
    eleve: student ? `${student.prenom} ${student.nom}` : '—',
    matricule: student?.matricule || '—',
    classe: classe?.nom || '—',
    categorie: classe?.categorie || '',
    annee: yearLabel(state, payment.anneeId || inscription?.anneeId),
    montant: Number(payment.montant || 0),
    moyen: MODES[payment.mode] || payment.mode || '',
    modalite,
    periode: inscription ? periodeConcernee(inscription, payment, modalite) : '—',
    reference: payment.reference && payment.reference !== payment.numeroRecu ? payment.reference : '',
    motif: payment.motifPaiement || 'Frais de scolarité',
    caissier: payment.caissier || '',
    progression,
    reimpute,
    dette: payment.reliquatId ? { origine: yearLabel(state, payment.anneeId), encaissement: yearLabel(state, payment.anneeEncaissementId) } : null,
    cumulAnnee: progression.cumul,
    soldeAnnee: progression.reste,
    totalAnnee: progression.total
  };
}

// Barre de progression segmentée : une case par mois ou par tranche (réglé / en cours / restant)
export function progressBarHtml(progression, modalite) {
  const unit = modalite === 'mensuel' ? ['mois', 'mois'] : ['tranche', 'tranches'];
  const word = (n) => `${n} ${n > 1 ? unit[1] : unit[0]}`;
  const segments = progression.lignes.filter((l) => !l.frais).map((l) => `<span class="rc-seg ${l.etat}" title="${escapeHtml(l.libelle)} : ${formatMoney(l.paye)} / ${formatMoney(l.du)}"><i style="width:${l.taux}%"></i></span>`).join('');
  return `<div class="rc-progress">
      <div class="rc-progress-head"><b>État du règlement</b><span>${progression.taux} % réglé</span></div>
      <div class="rc-segments" role="img" aria-label="${progression.regles} réglé(s), ${progression.encours} en cours, ${progression.restants} restant(s)">${segments}</div>
      <div class="rc-legend"><span><i class="regle"></i>${word(progression.regles)} ${progression.regles > 1 ? 'réglés' : 'réglé'}</span><span><i class="encours"></i>${word(progression.encours)} en cours</span><span><i class="restant"></i>${word(progression.restants)} ${progression.restants > 1 ? 'restants' : 'restant'}</span>${progression.frais ? `<span>${escapeHtml(progression.frais.libelle)} : ${progression.frais.reste ? `reste ${formatMoney(progression.frais.reste)}` : 'réglés'}</span>` : ''}</div>
    </div>`;
}

function receiptCopyHtml(config, d) {
  const devise = escapeHtml(config.devise);
  return `<section class="rc-copy">
    ${enteteHtml(config, { compact: true })}
    <div class="rc-titlebar"><h2>${d.dette ? 'Reçu — dette antérieure' : 'Reçu de paiement'}</h2><div><b>N° ${escapeHtml(d.numero)}</b><span>Date : ${escapeHtml(formatDateFr(d.date))}</span></div></div>
    <div class="rc-columns">
      <div class="rc-box">
        <h3>Élève</h3>
        <p class="rc-name">${escapeHtml(d.eleve)}</p>
        <p><b>Matricule : ${escapeHtml(d.matricule)}</b></p>
        <p><b>Classe : <span class="rc-upper">${escapeHtml(d.classe)}</span></b>${d.categorie ? ` <span class="rc-muted">(${escapeHtml(d.categorie)})</span>` : ''}</p>
        <p>Année scolaire : ${escapeHtml(d.annee)}</p>
        ${d.payeur ? `<p>Payé par : ${escapeHtml(d.payeur)}</p>` : ''}
      </div>
      <div class="rc-box">
        <h3>Paiement</h3>
        <p class="rc-amount">${formatMoney(d.montant)} ${devise}</p>
        <p class="rc-words">${escapeHtml(amountInWords(d.montant, config.devise))}</p>
        <p>Moyen : <b>${escapeHtml(d.moyen)}</b>${d.reference ? ` · Réf. ${escapeHtml(d.reference)}` : ''}</p>
        ${d.dette ? `<p>Dette de l’année <b>${escapeHtml(d.dette.origine)}</b> · encaissée en ${escapeHtml(d.dette.encaissement)}</p>` : `<p>Modalité : <b>${escapeHtml(MODALITES[d.modalite] || '')}</b>${d.reimpute ? ' <span class="rc-muted">(réimputé après changement)</span>' : ''}</p>`}
        <p>Période concernée : <b>${escapeHtml(d.periode)}</b></p>
      </div>
    </div>
    ${progressBarHtml(d.progression, d.modalite)}
    <div class="rc-totals">
      <div><span>Total de la scolarité</span><b>${formatMoney(d.progression.total)} ${devise}</b></div>
      <div><span>Cumul payé</span><b>${formatMoney(d.progression.cumul)} ${devise}</b></div>
      <div class="rc-due"><span>Reste à payer</span><b>${formatMoney(d.progression.reste)} ${devise}</b></div>
    </div>
    <div class="rc-sign"><div>Le parent / mandataire</div><div>Le caissier${d.caissier ? ` : ${escapeHtml(d.caissier)}` : ''}</div></div>
    <footer class="rc-foot">${escapeHtml(d.motif)} — paiements uniquement auprès de la comptabilité. Situation calculée sur les paiements validés.</footer>
  </section>`;
}

// Styles communs à l'aperçu écran et à l'impression (préfixe .rc-doc : aucun effet sur le reste de l'application)
export const RECEIPT_CSS = `
  .rc-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
  .rc-doc .rc-sheet { width: 210mm; height: 296mm; display: flex; flex-direction: column; background: #fff; }
  .rc-doc .rc-copy { flex: 0 0 148mm; height: 148mm; box-sizing: border-box; padding: 5mm 10mm 4mm; overflow: hidden; display: flex; flex-direction: column; gap: 3mm; background: #fff; }
  .rc-doc .rc-copy + .rc-copy { border-top: 1.5px dashed #6b7280; position: relative; }
  .rc-doc .rc-copy + .rc-copy::before { content: '✂  découper ici'; position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 8px; font-size: 9px; color: #6b7280; }
  .rc-doc .rc-copy .eh { --eh-fs: 9px; padding: 4px 8px; }
  .rc-doc .rc-copy .eh-logo { width: 6.4em; height: 6.4em; object-fit: contain; }
  .rc-doc .rc-titlebar { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #7c3aed; color: #fff; border-radius: 4px; padding: 4px 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc .rc-titlebar h2 { margin: 0; font-size: 14px; letter-spacing: .8px; text-transform: uppercase; color: #fff; }
  .rc-doc .rc-titlebar div { display: flex; gap: 14px; align-items: baseline; font-size: 11px; }
  .rc-doc .rc-titlebar b { font-size: 13px; }
  .rc-doc .rc-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .rc-doc .rc-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 3.5mm; min-width: 0; }
  .rc-doc .rc-box h3 { margin: 0 0 1mm; font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
  .rc-doc .rc-box p { margin: 0 0 1mm; overflow-wrap: anywhere; }
  .rc-doc .rc-name { font-size: 14px; font-weight: 700; }
  .rc-doc .rc-upper { text-transform: uppercase; }
  .rc-doc .rc-muted { color: #6b7280; font-weight: 400; }
  .rc-doc .rc-amount { font-size: 20px; font-weight: 800; color: #c2410c; }
  .rc-doc .rc-words { font-style: italic; color: #374151; font-size: 9.5px; }
  .rc-doc .rc-progress-head { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1mm; }
  .rc-doc .rc-segments { display: flex; gap: 2px; height: 11px; }
  .rc-doc .rc-seg { flex: 1; background: #e5e7eb; border-radius: 2px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc .rc-seg i { display: block; height: 100%; background: #f97316; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc .rc-seg.regle i { background: #16a34a; }
  .rc-doc .rc-seg.encours { box-shadow: inset 0 0 0 1.5px #f97316; }
  .rc-doc .rc-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 1mm; font-size: 9.5px; }
  .rc-doc .rc-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc .rc-legend i.regle { background: #16a34a; }
  .rc-doc .rc-legend i.encours { background: #f97316; }
  .rc-doc .rc-legend i.restant { background: #e5e7eb; border: 1px solid #9ca3af; box-sizing: border-box; }
  .rc-doc .rc-totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
  .rc-doc .rc-totals div { border: 1px solid #e9d5ff; background: #faf5ff; border-radius: 4px; padding: 2.2mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rc-doc .rc-totals span { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; }
  .rc-doc .rc-totals b { font-size: 14px; }
  .rc-doc .rc-totals .rc-due { border-color: #fdba74; background: #fff7ed; }
  .rc-doc .rc-totals .rc-due b { color: #c2410c; }
  .rc-doc .rc-sign { display: flex; justify-content: space-between; margin: auto 8mm 0; height: 18mm; font-size: 10.5px; }
  .rc-doc .rc-sign div { width: 62mm; text-align: center; border-top: 1px solid #111827; padding-top: 2px; align-self: flex-end; }
  .rc-doc .rc-foot { text-align: center; font-size: 8.5px; font-style: italic; color: #4b5563; }
`;

export function receiptHtml(state, payment, copies = 2) {
  const data = buildReceiptData(state, payment);
  const copy = receiptCopyHtml(state.config, data);
  return { data, html: `<div class="rc-doc"><div class="rc-sheet">${Array.from({ length: copies }, () => copy).join('')}</div></div>` };
}

// Retourne false si le paiement est introuvable/annulé. Peut attribuer un numéro à un ancien paiement
// qui n'en avait pas : l'appelant doit alors sauvegarder l'état (le numéro ne change plus ensuite).
export function printReceipt(state, paymentId) {
  const payment = state.paiements.find((p) => p.id === Number(paymentId));
  if (!payment || payment.annule) return false;
  ensureReceiptNumber(state, payment);
  const { data, html } = receiptHtml(state, payment);
  return printDocument({ title: `Reçu ${data.numero}`, html, css: RECEIPT_CSS, margin: '0' });
}

// ── Facture de scolarité : calculée à partir du tarif, de la modalité et des paiements validés ──
export function invoiceNumber(state, inscription) {
  return `FAC-${String(yearLabel(state, inscription.anneeId)).replace(/[^0-9-]/g, '')}-${String(inscription.id).padStart(5, '0')}`;
}

export const INVOICE_CSS = `
  .iv-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
  .iv-doc .iv-head { display: flex; justify-content: space-between; align-items: center; margin: 4mm 0 3mm; padding: 2.5mm 4mm; background: #7c3aed; color: #fff; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .iv-doc .iv-head h2 { margin: 0; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; color: #fff; }
  .iv-doc .iv-head div { text-align: right; }
  .iv-doc .iv-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
  .iv-doc .iv-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 4mm; }
  .iv-doc .iv-box h3 { margin: 0 0 1.5mm; font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
  .iv-doc .iv-box p { margin: 0 0 1mm; }
  .iv-doc h4 { margin: 4mm 0 1.5mm; font-size: 11px; color: #1e3a8a; border-left: 3px solid #f97316; padding-left: 6px; }
  .iv-doc table { width: 100%; border-collapse: collapse; }
  .iv-doc tr { page-break-inside: avoid; }
  #print-root .iv-doc th, #print-root .iv-doc td, .iv-doc th, .iv-doc td { border-bottom: 1px solid #e5e7eb; padding: 3px 6px; text-align: left; font-size: 10.5px; }
  #print-root .iv-doc th, .iv-doc th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #print-root .iv-doc .num, .iv-doc .num { text-align: right; white-space: nowrap; }
  .iv-doc tfoot td { font-weight: 700; background: #faf5ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .iv-doc .iv-note { font-size: 9.5px; color: #4b5563; font-style: italic; margin-top: 3mm; }
  .iv-doc .iv-sign { display: flex; justify-content: space-between; margin: 8mm 10mm 0; height: 16mm; page-break-inside: avoid; }
  .iv-doc .iv-sign div { width: 60mm; text-align: center; border-top: 1px solid #111827; padding-top: 3px; align-self: flex-end; font-weight: 700; }
`;

export function invoiceHtml(state, inscription) {
  const c = state.config;
  const devise = escapeHtml(c.devise);
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const student = studentOf(state, inscription);
  const classe = classOf(state, inscription.classeId);
  const modalite = modaliteActuelle(inscription);
  const situation = echeancierSituation(inscription);
  const progression = progressionAt(state, inscription);
  const payments = state.paiements.filter((p) => !p.annule && p.inscriptionId === inscription.id).sort((a, b) => a.id - b.id);
  return `<div class="iv-doc rc-doc">
    ${enteteHtml(c)}
    <div class="iv-head"><h2>Facture de scolarité</h2><div><b>N° ${escapeHtml(invoiceNumber(state, inscription))}</b><br>Émise le ${escapeHtml(formatDateFr(todayISO()))}</div></div>
    <div class="iv-cols">
      <div class="iv-box"><h3>Élève</h3>
        <p class="rc-name">${escapeHtml(student ? `${student.prenom} ${student.nom}` : '—')}</p>
        <p><b>Matricule : ${escapeHtml(student?.matricule || '—')}</b></p>
        <p><b>Classe : <span class="rc-upper">${escapeHtml(classe?.nom || '—')}</span></b>${classe ? ` (${escapeHtml(classe.categorie)})` : ''}</p>
        ${student?.parent ? `<p>Parent / tuteur : ${escapeHtml(student.parent)}</p>` : ''}</div>
      <div class="iv-box"><h3>Scolarité</h3>
        <p>Année scolaire : <b>${escapeHtml(yearLabel(state, inscription.anneeId))}</b></p>
        <p>Modalité : <b>${escapeHtml(inscription.modalite ? MODALITES[modalite] : 'à choisir au premier paiement (échéancier provisoire par tranches)')}</b></p>
        <p>Montant total : <b>${money(situation.total)}</b> · Payé : <b>${money(situation.paye)}</b></p>
        <p>Reste à payer : <b style="color:#c2410c">${money(situation.reste)}</b></p></div>
    </div>
    ${progressBarHtml(progression, modalite)}
    <h4>Échéancier</h4>
    <table><thead><tr><th>Échéance</th><th>Date limite</th><th class="num">Montant dû</th><th class="num">Payé</th><th class="num">Reste</th><th>Statut</th></tr></thead>
      <tbody>${situation.lignes.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td><td>${escapeHtml(formatDateFr(l.echeance.dateLimite))}</td><td class="num">${money(l.du)}</td><td class="num">${money(l.paye)}</td><td class="num">${money(l.reste)}</td><td>${STATUT_ECHEANCE_LABELS[l.statut]}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td class="num">${money(situation.total)}</td><td class="num">${money(situation.paye)}</td><td class="num">${money(situation.reste)}</td><td></td></tr></tfoot></table>
    <h4>Paiements validés</h4>
    <table><thead><tr><th>N° reçu</th><th>Date</th><th>Moyen</th><th>Imputé sur</th><th class="num">Montant</th></tr></thead>
      <tbody>${payments.map((p) => `<tr><td>${escapeHtml(p.numeroRecu || '—')}</td><td>${escapeHtml(formatDateFr(p.datePaiement))}</td><td>${escapeHtml(MODES[p.mode] || p.mode)}</td><td>${escapeHtml(paymentAllocations(p).map((a) => allocationLabel(inscription, a)).join(' + '))}</td><td class="num">${money(p.montant)}</td></tr>`).join('') || '<tr><td colspan="5">Aucun paiement validé.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">TOTAL PAYÉ</td><td class="num">${money(payments.reduce((s, p) => s + Number(p.montant || 0), 0))}</td></tr></tfoot></table>
    <p class="iv-note">Document calculé automatiquement à partir du tarif de la classe, de la modalité de règlement et des paiements validés (les paiements annulés ne sont pas pris en compte).</p>
    <div class="iv-sign"><div>La Comptable</div><div>Le Directeur Général</div></div>
  </div>`;
}

export function printInvoice(state, inscriptionId) {
  const inscription = state.inscriptions.find((i) => i.id === Number(inscriptionId));
  if (!inscription || !(inscription.echeances || []).length) return false;
  return printDocument({ title: `Facture ${invoiceNumber(state, inscription)}`, html: invoiceHtml(state, inscription), css: `${RECEIPT_CSS}${INVOICE_CSS}`, margin: '10mm' });
}
