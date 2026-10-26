import { escapeHtml, formatMoney, formatDateFr, numberToFrench } from './utils.js';
import { enteteHtml } from './entete.js';
import { printDocument } from './print.js';
import { STATUTS_PAIE } from './paie.js';
import { soldeAvance } from './avances.js';
import { CONTRATS } from './personnel.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOYENS = { espece: 'Espèces', virement: 'Virement', cheque: 'Chèque', mobile_money: 'Mobile Money' };

export function moisLabel(mois) {
  const [y, m] = String(mois).split('-').map(Number);
  return m ? `${MOIS[m - 1]} ${y}` : String(mois);
}

function words(n, devise) {
  const v = Math.floor(Number(n) || 0);
  const t = numberToFrench(v);
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} ${devise === 'GNF' ? `franc${v > 1 ? 's' : ''} guinéen${v > 1 ? 's' : ''}` : devise}`;
}

// Bulletin d'une paie validée ou payée : construit uniquement à partir de sa copie figée (paie.calcul)
export function bulletinHtml(state, paie) {
  const c = paie.calcul;
  const devise = escapeHtml(state.config.devise);
  const money = (v) => formatMoney(v);
  const employe = state.personnel.find((e) => e.id === paie.employeId);
  const avancesEnCours = state.avances.filter((a) => a.employeId === paie.employeId && (a.statut === 'versee' || a.statut === 'soldee'));
  // Colonnes Quantité / Taux : enseignant payé à l'heure (heures dispensées du mois × tarif horaire)
  const horaire = c.lignes.some((l) => l.type === 'heures');
  const vide = horaire ? '<td></td><td></td>' : '';
  const gains = [
    ...c.lignes.map((l) => (l.type === 'heures'
      ? `<tr><td>${escapeHtml(l.libelle)}</td><td class="num">${l.heures} h${l.heuresPrevues ? ` <span class="bp-muted">/ ${l.heuresPrevues} prévues</span>` : ''}</td><td class="num">${money(l.taux)}</td><td class="num">${money(l.montant)}</td><td></td></tr>`
      : `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td class="num">${money(l.montant)}</td><td></td></tr>`)),
    ...c.primes.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td class="num">${money(l.montant)}</td><td></td></tr>`),
    ...c.retenues.map((l) => `<tr><td>${escapeHtml(l.libelle)}</td>${vide}<td></td><td class="num">${money(l.montant)}</td></tr>`),
    ...c.avances.filter((a) => a.montant > 0).map((a) => `<tr><td>Remboursement d’avance n°${a.avanceId}${a.reporte ? ` <span class="bp-muted">(reporté : ${money(a.reporte)})</span>` : ''}</td>${vide}<td></td><td class="num">${money(a.montant)}</td></tr>`)
  ].join('');
  return `<article class="bp-sheet">
    ${enteteHtml(state.config)}
    <div class="bp-title"><h2>Bulletin de paie — ${escapeHtml(moisLabel(paie.mois))}</h2><div><b>N° ${escapeHtml(paie.numero || 'brouillon')}</b><span>${escapeHtml(STATUTS_PAIE[paie.statut])}${paie.datePaiement ? ` le ${escapeHtml(formatDateFr(paie.datePaiement))}` : ''}</span></div></div>
    <div class="bp-cols">
      <div class="bp-box"><h3>Employé</h3>
        <p class="bp-name">${escapeHtml(c.employe.prenom)} ${escapeHtml(c.employe.nom)}</p>
        <p><b>Matricule : ${escapeHtml(c.employe.matricule)}</b></p>
        <p><b>Fonction : ${escapeHtml(c.employe.fonction)}</b> <span class="bp-muted">(${escapeHtml(c.employe.type)})</span></p>
        <p>Contrat : ${escapeHtml(CONTRATS[c.employe.contrat?.type] || '—')}${employe?.dateEmbauche ? ` · embauché le ${escapeHtml(formatDateFr(employe.dateEmbauche))}` : ''}</p></div>
      <div class="bp-box"><h3>Rémunération</h3>
        <p>Mode : <b>${escapeHtml(c.modeLibelle)}</b></p>
        <p>Période : ${escapeHtml(moisLabel(paie.mois))}</p>
        ${c.mode === 'horaire' && c.totalHeures ? `<p>Heures dispensées : <b>${c.totalHeures} h</b> × ${money(c.tauxHoraire)} ${devise}</p>` : ''}
        ${paie.moyenPaiement ? `<p>Paiement : ${escapeHtml(MOYENS[paie.moyenPaiement] || paie.moyenPaiement)}</p>` : ''}
        ${avancesEnCours.length ? `<p>Solde des avances : <b>${money(avancesEnCours.reduce((s, a) => s + soldeAvance(a), 0))} ${devise}</b></p>` : ''}</div>
    </div>
    <table class="bp-table"><thead><tr><th>Désignation</th>${horaire ? '<th class="num">Quantité</th><th class="num">Taux</th>' : ''}<th class="num">Gains</th><th class="num">Retenues</th></tr></thead>
      <tbody>${gains}</tbody>
      <tfoot><tr><td colspan="${horaire ? 3 : 1}">Totaux</td><td class="num">${money(c.brut)}</td><td class="num">${money(c.totalRetenues + c.totalAvances)}</td></tr></tfoot></table>
    <div class="bp-totals">
      <div><span>Salaire brut</span><b>${money(c.brut)} ${devise}</b></div>
      <div><span>Retenues</span><b>${money(c.totalRetenues)} ${devise}</b></div>
      <div><span>Avances prélevées</span><b>${money(c.totalAvances)} ${devise}</b></div>
      <div class="bp-net"><span>Net à payer</span><b>${money(c.net)} ${devise}</b></div>
    </div>
    <p class="bp-words">Arrêté à la somme de : <b>${escapeHtml(words(c.net, state.config.devise))}</b></p>
    <div class="bp-sign"><div>L’employé(e)</div><div>La Comptable</div><div>Le Directeur Général</div></div>
  </article>`;
}

export const BULLETIN_CSS = `
  .bp-doc { font: 11px/1.4 Arial, Helvetica, sans-serif; color: #111827; }
  .bp-doc .bp-sheet { page-break-after: always; break-after: page; }
  .bp-doc .bp-sheet:last-child { page-break-after: auto; break-after: auto; }
  .bp-doc .bp-title { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 4mm 0 3mm; padding: 2.5mm 4mm; background: #7c3aed; color: #fff; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bp-doc .bp-title h2 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: .6px; color: #fff; }
  .bp-doc .bp-title div { display: grid; text-align: right; }
  .bp-doc .bp-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
  .bp-doc .bp-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 2.5mm 4mm; }
  .bp-doc .bp-box h3 { margin: 0 0 1.5mm; font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: #7c3aed; }
  .bp-doc .bp-box p { margin: 0 0 1mm; }
  .bp-doc .bp-name { font-size: 14px; font-weight: 700; }
  .bp-doc .bp-muted { color: #6b7280; font-weight: 400; }
  #print-root .bp-doc .bp-table th, #print-root .bp-doc .bp-table td, .bp-doc .bp-table th, .bp-doc .bp-table td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; font-size: 10.5px; }
  .bp-doc .bp-table { width: 100%; border-collapse: collapse; }
  .bp-doc .bp-table th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #print-root .bp-doc .bp-table th.num, #print-root .bp-doc .bp-table td.num, .bp-doc .bp-table .num { text-align: right; white-space: nowrap; }
  .bp-doc .bp-table tfoot td { font-weight: 700; background: #faf5ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bp-doc .bp-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin-top: 4mm; }
  .bp-doc .bp-totals div { border: 1px solid #e9d5ff; background: #faf5ff; border-radius: 4px; padding: 2mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bp-doc .bp-totals span { display: block; font-size: 8.5px; text-transform: uppercase; color: #6b7280; }
  .bp-doc .bp-totals b { font-size: 13px; }
  .bp-doc .bp-totals .bp-net { border-color: #fdba74; background: #fff7ed; }
  .bp-doc .bp-totals .bp-net b { color: #c2410c; font-size: 15px; }
  .bp-doc .bp-words { margin: 3mm 0 0; font-style: italic; }
  .bp-doc .bp-sign { display: flex; justify-content: space-between; gap: 8mm; margin-top: 12mm; height: 18mm; page-break-inside: avoid; }
  .bp-doc .bp-sign div { flex: 1; text-align: center; border-top: 1px solid #111827; padding-top: 3px; align-self: flex-end; font-weight: 700; }
`;

// Impression d'un ou plusieurs bulletins (un par page A4) ; les brouillons ne sont jamais imprimés
export function printBulletins(state, paieIds, fileName = '') {
  const paies = paieIds.map((id) => state.paies.find((p) => p.id === Number(id))).filter((p) => p && (p.statut === 'validee' || p.statut === 'payee'));
  if (!paies.length) return false;
  return printDocument({ title: paies.length === 1 ? `Bulletin ${paies[0].numero}` : `Bulletins de paie (${paies.length})`, html: `<div class="bp-doc">${paies.map((p) => bulletinHtml(state, p)).join('')}</div>`, css: BULLETIN_CSS, margin: '10mm', fileName: fileName || (paies.length === 1 ? `Bulletin-${paies[0].numero}` : `Bulletins-paie-${paies[0].mois}`) });
}
