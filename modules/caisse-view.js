import { escapeHtml, formatMoney, formatDateFr, todayISO } from './utils.js';
import { comptesActifs, compteLabel, TYPES_COMPTE } from './comptes.js';
import { situationJournee, soldeOuvertureTheorique, journalDuJour, historiqueSessions, sessionOuverte } from './caisse.js';
import { enteteHtml } from './entete.js';
import { printDocument } from './print.js';
import { can } from './auth.js';

// Page « Caisse » : journées de caisse (ouverture, comptage, fermeture), journal quotidien, historique par agent,
// rapprochements bancaires. Les montants théoriques sont toujours calculés à partir des opérations valides.

export const caisseView = { jour: todayISO(), agent: '', compteId: 0 };

const STATUTS = { ouverte: ['Ouverte', 'ok'], fermee: ['Fermée', 'neutral'], rouverte: ['Rouverte', 'warning'] };
const ecartHtml = (v, money) => (v ? `<span class="${v < 0 ? 'ecart-neg' : 'ecart-pos'}">${v > 0 ? '+' : ''}${money(v)}</span>` : '<span class="badge ok">aucun écart</span>');

function sessionCard(state, s, money) {
  const sit = situationJournee(state, s);
  const peutOperer = can('caisse.operer');
  return `<article class="panel session-card ${s.statut === 'fermee' ? 'fermee' : ''}">
    <div class="panel-header"><h3>${escapeHtml(compteLabel(state, s.compteId))} — journée du ${escapeHtml(formatDateFr(s.date))}</h3><span class="badge ${STATUTS[s.statut][1]}">${STATUTS[s.statut][0]}</span></div>
    <div class="stats-grid">
      <article class="stat-card accent-purple"><div><span>Ouverture théorique</span><strong>${money(sit.ouverture)}</strong><small class="meta">compté : ${money(s.ouverture.compte)} · ${s.ouverture.ecart ? `écart ${s.ouverture.ecart > 0 ? '+' : ''}${formatMoney(s.ouverture.ecart)}` : 'sans écart'}</small></div></article>
      <article class="stat-card accent-green"><div><span>Entrées du jour</span><strong>${money(sit.entrees)}</strong></div></article>
      <article class="stat-card accent-red"><div><span>Sorties du jour</span><strong>${money(sit.sorties)}</strong></div></article>
      <article class="stat-card accent-orange"><div><span>Solde théorique</span><strong>${money(sit.theorique)}</strong><small class="meta">${sit.mouvements.length} opération(s) valide(s)</small></div></article>
    </div>
    <p class="meta">Ouverte par ${escapeHtml(s.ouverture.par || '—')} le ${escapeHtml(new Date(s.ouverture.horodatage).toLocaleString('fr-FR'))}${s.ouverture.justification ? ` — ${escapeHtml(s.ouverture.justification)}` : ''}${(s.historique || []).length ? ` · ${s.historique.length} réouverture(s) tracée(s)` : ''}</p>
    ${peutOperer ? `<form class="form-grid compact" data-form="caisse-fermeture" autocomplete="off">
      <input type="hidden" name="sessionId" value="${s.id}" />
      <label>Montant réellement compté <input name="montantCompte" type="number" min="0" step="1" required data-caisse-compte data-theorique="${sit.theorique}" /></label>
      <label class="span-two">Billetage / détail du comptage (facultatif) <input name="billetage" type="text" maxlength="300" placeholder="Ex. 12 × 10 000 + 5 × 5 000" /></label>
      <p class="meta span-all" data-caisse-ecart aria-live="polite">Saisissez le montant compté : l’écart avec le solde théorique s’affiche.</p>
      <label class="span-all">Justification de l’écart (obligatoire si l’écart n’est pas nul) <input name="justification" type="text" maxlength="300" /></label>
      <div class="form-actions span-all"><button type="submit" class="primary-btn">Fermer la caisse</button></div>
    </form>` : '<p class="meta">Votre rôle ne permet pas de fermer la caisse.</p>'}
  </article>`;
}

export function renderCaisse(state) {
  const section = document.getElementById('caisse');
  if (!section) return;
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const caisses = comptesActifs(state).filter((c) => c.type === 'caisse');
  const autres = comptesActifs(state).filter((c) => c.type !== 'caisse');
  const ouvertes = caisses.map((c) => sessionOuverte(state, c.id)).filter(Boolean);
  const fermees = caisses.filter((c) => !sessionOuverte(state, c.id));
  const v = caisseView;
  const journal = journalDuJour(state, v.jour);
  const historique = historiqueSessions(state, { agent: v.agent, compteId: v.compteId });
  const agents = [...new Set((state.sessionsCaisse || []).flatMap((s) => [s.ouverture?.par, s.fermeture?.par]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const dernieres = new Map();
  (state.sessionsCaisse || []).forEach((s) => { const d = dernieres.get(s.compteId); if (!d || s.date > d.date) dernieres.set(s.compteId, s); });
  const today = todayISO();
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Caisse et trésorerie</span><h2>Caisse : ouverture, comptage et clôture</h2></div>
      ${can('export') ? '<button type="button" class="secondary-btn small-btn" data-action="caisse:print-journal">Imprimer le journal du jour</button>' : ''}</div>
    ${!caisses.length ? '<div class="panel empty-state"><span class="empty-icon" aria-hidden="true">🪙</span><h3>Aucune caisse active</h3><p class="meta">Créez un compte de type « Caisse » dans Paramètres › Paramètres financiers.</p></div>' : ''}
    ${ouvertes.map((s) => sessionCard(state, s, money)).join('')}
    ${fermees.length && can('caisse.operer') ? `<div class="panel section-form">
      <div class="panel-header"><h3>Ouvrir une caisse</h3><span class="meta">Comptez le fond de caisse : il est comparé au solde théorique de la veille</span></div>
      <form class="form-grid compact" data-form="caisse-ouverture" autocomplete="off">
        <label>Caisse <select name="compteId">${fermees.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)} — théorique ${formatMoney(soldeOuvertureTheorique(state, c.id, today))}</option>`).join('')}</select></label>
        <label>Date <input name="date" type="date" value="${today}" max="${today}" required /></label>
        <label>Fond de caisse compté <input name="montantCompte" type="number" min="0" step="1" required /></label>
        <label class="span-all">Justification (obligatoire si le compté diffère du théorique) <input name="justification" type="text" maxlength="300" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">Ouvrir la caisse</button></div>
      </form>
    </div>` : ''}
    ${can('admin') ? `<div class="panel"><form class="form-grid compact" data-form="caisse-option"><label class="check-row span-all"><input type="checkbox" name="caisseObligatoire" ${state.config.caisseObligatoire ? 'checked' : ''} /> Exiger une caisse ouverte pour toute opération sur une caisse (encaissement, dépense, virement)</label>
      <div class="form-actions span-all"><button type="submit" class="secondary-btn small-btn">Enregistrer l’option</button></div></form></div>` : ''}

    <div class="panel">
      <div class="panel-header"><h3>Journal quotidien des opérations</h3>
        <label class="inline-filter">Jour <input type="date" data-cv="jour" value="${escapeHtml(v.jour)}" max="${today}" /></label></div>
      ${journal.map((j) => `<div class="r-group">
        <h4>${escapeHtml(j.compte.libelle)} <span class="meta">(${escapeHtml(TYPES_COMPTE[j.compte.type])})</span> ${j.session ? `<span class="badge ${STATUTS[j.session.statut][1]}">${j.session.numero} · ${STATUTS[j.session.statut][0]}</span>` : ''}</h4>
        <div class="table-wrap"><table><thead><tr><th>Pièce</th><th>Opération</th><th>Agent</th><th>Entrée</th><th>Sortie</th></tr></thead>
          <tbody><tr><td></td><td><b>Solde d’ouverture théorique</b></td><td></td><td></td><td class="num">${money(j.ouverture)}</td></tr>
          ${j.mouvements.map((m) => `<tr><td>${escapeHtml(m.piece)}</td><td>${escapeHtml(m.libelle)}</td><td>${escapeHtml(m.agent || '—')}</td><td class="num">${m.entree ? money(m.entree) : ''}</td><td class="num">${m.sortie ? money(m.sortie) : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="meta">Aucune opération ce jour.</td></tr>'}</tbody>
          <tfoot><tr><td></td><td>Solde de clôture théorique</td><td></td><td class="num">${money(j.entrees)}</td><td class="num">${money(j.sorties)} → <b>${money(j.cloture)}</b></td></tr></tfoot></table></div>
      </div>`).join('')}
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Historique des journées de caisse</h3>
        <div class="advanced-search compact-filters">
          <label>Agent <select data-cv="agent"><option value="">Tous</option>${agents.map((a) => `<option value="${escapeHtml(a)}" ${a === v.agent ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select></label>
          <label>Caisse <select data-cv="compteId"><option value="0">Toutes</option>${caisses.map((c) => `<option value="${c.id}" ${c.id === Number(v.compteId) ? 'selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
        </div></div>
      <div class="table-wrap"><table class="data-list" data-list="sessions-caisse" data-list-title="Journées de caisse">
        <thead><tr><th>N°</th><th>Date</th><th>Caisse</th><th>Ouverture (par)</th><th>Entrées</th><th>Sorties</th><th>Théorique</th><th>Compté</th><th>Écart</th><th>Fermeture (par)</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${historique.map((s) => `<tr>
          <td>${escapeHtml(s.numero)}</td><td>${escapeHtml(formatDateFr(s.date))}</td><td>${escapeHtml(compteLabel(state, s.compteId))}</td>
          <td>${money(s.ouverture.compte)}<div class="meta">${escapeHtml(s.ouverture.par || '')}</div></td>
          <td class="num">${s.fermeture ? money(s.fermeture.entrees) : '—'}</td><td class="num">${s.fermeture ? money(s.fermeture.sorties) : '—'}</td>
          <td class="num">${s.fermeture ? money(s.fermeture.theorique) : '—'}</td><td class="num">${s.fermeture ? money(s.fermeture.compte) : '—'}</td>
          <td>${s.fermeture ? ecartHtml(s.fermeture.ecart, money) : '—'}${s.fermeture?.justification ? `<div class="meta">${escapeHtml(s.fermeture.justification)}</div>` : ''}</td>
          <td>${escapeHtml(s.fermeture?.par || '—')}</td>
          <td><span class="badge ${STATUTS[s.statut][1]}">${STATUTS[s.statut][0]}</span>${(s.historique || []).map((h) => `<div class="meta">rouverte : ${escapeHtml(h.motif)} (${escapeHtml(h.par)})</div>`).join('')}</td>
          <td>${s.fermeture && can('export') ? `<button class="action-btn" data-action="caisse:pv:${s.id}">PV</button>` : ''}${s.statut === 'fermee' && dernieres.get(s.compteId)?.id === s.id && can('write') ? `<button class="action-btn delete" data-action="caisse:rouvrir:${s.id}">Rouvrir</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="12">Aucune journée de caisse enregistrée.</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Rapprochement bancaire</h3><span class="meta">Solde du relevé (banque, Mobile Money) comparé au solde théorique à la même date</span></div>
      ${autres.length && can('caisse.operer') ? `<form class="form-grid compact" data-form="rapprochement" autocomplete="off">
        <label>Compte <select name="compteId">${autres.map((c) => `<option value="${c.id}">${escapeHtml(c.libelle)}</option>`).join('')}</select></label>
        <label>Date du relevé <input name="date" type="date" value="${today}" max="${today}" required /></label>
        <label>Solde du relevé <input name="soldeReleve" type="number" step="1" required /></label>
        <label>Référence du relevé <input name="reference" type="text" maxlength="60" /></label>
        <label class="span-all">Justification de l’écart (frais bancaires, chèque non crédité…) <input name="justification" type="text" maxlength="300" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Enregistrer le rapprochement</button></div>
      </form>` : `<p class="meta">${autres.length ? 'Votre rôle ne permet pas d’enregistrer un rapprochement.' : 'Aucun compte bancaire ou Mobile Money actif.'}</p>`}
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Relevé</th><th>Théorique</th><th>Écart</th><th>Justification</th><th>Par</th></tr></thead>
        <tbody>${[...(state.rapprochements || [])].sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<tr><td>${escapeHtml(formatDateFr(r.date))}</td><td>${escapeHtml(compteLabel(state, r.compteId))}${r.reference ? `<div class="meta">${escapeHtml(r.reference)}</div>` : ''}</td><td class="num">${money(r.soldeReleve)}</td><td class="num">${money(r.theorique)}</td><td>${ecartHtml(r.ecart, money)}</td><td>${escapeHtml(r.justification || '')}</td><td>${escapeHtml(r.par || '')}</td></tr>`).join('') || '<tr><td colspan="7">Aucun rapprochement.</td></tr>'}</tbody></table></div>
    </div>`;
}

// Écart affiché en direct pendant le comptage de fermeture
export function majEcart(input, devise) {
  const box = input.closest('form')?.querySelector('[data-caisse-ecart]');
  if (!box) return;
  if (input.value === '') { box.textContent = 'Saisissez le montant compté : l’écart avec le solde théorique s’affiche.'; return; }
  const ecart = Math.floor(Number(input.value || 0)) - Number(input.dataset.theorique || 0);
  box.textContent = ecart ? `Écart : ${ecart > 0 ? '+' : ''}${formatMoney(ecart)} ${devise} — la justification est obligatoire.` : 'Aucun écart : la caisse est juste.';
}

// Procès-verbal de clôture (une page)
export function printPvCloture(state, sessionId) {
  const s = (state.sessionsCaisse || []).find((x) => x.id === Number(sessionId));
  if (!s || !s.fermeture) return false;
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const f = s.fermeture;
  const html = `${enteteHtml(state.config, { compact: true })}
    <div class="r-title"><h2>Procès-verbal de clôture de caisse — ${escapeHtml(s.numero)}</h2><span>${escapeHtml(compteLabel(state, s.compteId))} · journée du ${escapeHtml(formatDateFr(s.date))}</span></div>
    <table><tbody>
      <tr><td>Fond d’ouverture compté (${escapeHtml(s.ouverture.par || '')})</td><td class="num">${money(s.ouverture.compte)}</td></tr>
      <tr><td>Solde d’ouverture théorique</td><td class="num">${money(f.ouvertureTheorique)}</td></tr>
      <tr><td>Entrées de la journée</td><td class="num">${money(f.entrees)}</td></tr>
      <tr><td>Sorties de la journée</td><td class="num">${money(f.sorties)}</td></tr>
      <tr><td><b>Solde théorique de clôture</b></td><td class="num"><b>${money(f.theorique)}</b></td></tr>
      <tr><td><b>Montant compté</b> ${f.billetage ? `(${escapeHtml(f.billetage)})` : ''}</td><td class="num"><b>${money(f.compte)}</b></td></tr>
      <tr><td><b>Écart</b></td><td class="num"><b>${f.ecart > 0 ? '+' : ''}${money(f.ecart)}</b></td></tr>
      ${f.justification ? `<tr><td>Justification</td><td>${escapeHtml(f.justification)}</td></tr>` : ''}
      <tr><td>Nombre d’opérations</td><td class="num">${f.nbOperations}</td></tr>
      <tr><td>Clôturée par</td><td>${escapeHtml(f.par || '')} — ${escapeHtml(new Date(f.horodatage).toLocaleString('fr-FR'))}</td></tr>
    </tbody></table>
    <div class="rc-sign" style="display:flex;justify-content:space-between;margin-top:20mm"><div>Le caissier</div><div>Le comptable / visa</div></div>`;
  return printDocument({ title: `PV de clôture ${s.numero}`, html, fileName: `PV-cloture-${s.numero}` });
}

export function printJournalDuJour(state, date) {
  const devise = escapeHtml(state.config.devise || '');
  const money = (v) => `${formatMoney(v)} ${devise}`;
  const html = `${enteteHtml(state.config, { compact: true })}
    <div class="r-title"><h2>Journal de caisse du ${escapeHtml(formatDateFr(date))}</h2><span>Opérations valides</span></div>
    ${journalDuJour(state, date).map((j) => `<div class="r-group"><h3>${escapeHtml(j.compte.libelle)}</h3><table>
      <thead><tr><th>Pièce</th><th>Opération</th><th>Agent</th><th class="num">Entrée</th><th class="num">Sortie</th></tr></thead>
      <tbody><tr><td></td><td>Solde d’ouverture théorique</td><td></td><td></td><td class="num">${money(j.ouverture)}</td></tr>${j.mouvements.map((m) => `<tr><td>${escapeHtml(m.piece)}</td><td>${escapeHtml(m.libelle)}</td><td>${escapeHtml(m.agent || '')}</td><td class="num">${m.entree ? money(m.entree) : ''}</td><td class="num">${m.sortie ? money(m.sortie) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>Solde de clôture théorique : ${money(j.cloture)}</td><td></td><td class="num">${money(j.entrees)}</td><td class="num">${money(j.sorties)}</td></tr></tfoot></table></div>`).join('')}`;
  return printDocument({ title: `Journal de caisse ${date}`, html, fileName: `Journal-caisse-${date}` });
}
