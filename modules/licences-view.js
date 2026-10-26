import { escapeHtml, formatDateFr } from './utils.js';
import { listeLicences, archivesLicences, etatLicence } from './licences.js';
import { can, estProprietaire } from './auth.js';

// Page « Licence » : état des clés (super administrateur), vérification d'une clé, gestion du catalogue (compte
// propriétaire uniquement). Aucune clé n'est jamais affichée en clair : seulement son numéro et son empreinte courte.

const BADGES = { disponible: 'ok', utilisee: 'info', suspendue: 'warning', revoquee: 'danger', expiree: 'neutral' };

export function renderLicences(state) {
  const section = document.getElementById('licences');
  if (!section) return;
  if (!can('superadmin')) { section.innerHTML = '<div class="panel"><p class="meta">Page réservée au super administrateur.</p></div>'; return; }
  const proprio = estProprietaire();
  const etat = etatLicence(state);
  const liste = listeLicences(state);
  const archives = archivesLicences(state);
  section.innerHTML = `
    <div class="page-intro"><div><span class="eyebrow">Paramètres</span><h2>Licence GEST SCHOOL SCOLARITÉ</h2></div></div>
    <div class="stats-grid">
      <article class="stat-card accent-green"><div><span>Clés disponibles</span><strong>${etat.disponibles}</strong><small class="meta">une clé par nouvelle année scolaire</small></div></article>
      <article class="stat-card accent-blue"><div><span>Clés utilisées</span><strong>${etat.utilisees}</strong></div></article>
      <article class="stat-card accent-purple"><div><span>Catalogue</span><strong>${etat.total}</strong><small class="meta">clés actives, désactivées ou révoquées</small></div></article>
      <article class="stat-card accent-orange"><div><span>Années activées</span><strong>${etat.anneesActivees}</strong></div></article>
    </div>
    <div class="panel">
      <p class="meta">Chaque nouvelle année scolaire consomme une clé de licence, une seule fois et pour toujours. Seules les empreintes des clés sont enregistrées : une clé perdue ne peut pas être retrouvée dans le logiciel. Les clés sont fournies par l’éditeur ; une utilisation reste enregistrée même après une réinitialisation ou une restauration.</p>
      <form class="form-grid compact" data-form="licence-verifier" autocomplete="off">
        <label class="span-two">Clé de licence <input name="cle" type="text" required maxlength="60" placeholder="GSS-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" /></label>
        <div class="form-actions span-all"><button type="submit" class="secondary-btn small-btn">Vérifier sans consommer</button></div>
      </form>
    </div>
    ${proprio ? `<div class="panel section-form">
      <div class="panel-header"><h3>Catalogue des clés (compte propriétaire)</h3><span class="meta">La clé générée ou saisie n’est affichée qu’une fois</span></div>
      <form class="form-grid compact" data-form="licence-ajouter" autocomplete="off">
        <label class="span-two">Clé (laisser vide pour la générer) <input name="cle" type="text" maxlength="60" autocomplete="off" spellcheck="false" /></label>
        <label>Libellé <input name="libelle" type="text" maxlength="80" /></label>
        <label>Établissement destinataire <input name="etablissement" type="text" maxlength="120" /></label>
        <label>Expire le (facultatif) <input name="expireLe" type="date" /></label>
        <label class="span-two">Notes <input name="notes" type="text" maxlength="300" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Ajouter la clé</button></div>
      </form>
    </div>` : ''}
    <div class="panel">
      <div class="panel-header"><h3>Clés de licence</h3><span class="meta">${liste.length} clé(s)</span></div>
      <div class="table-wrap"><table class="data-list" data-list="licences" data-list-title="Clés de licence">
        <thead><tr><th>N°</th><th>Empreinte</th><th>Origine</th><th>Statut</th><th>Libellé / établissement</th><th>Expiration</th><th>Utilisation</th>${proprio ? '<th>Actions</th>' : ''}</tr></thead>
        <tbody>${liste.map((l) => `<tr>
          <td>${l.n}</td><td><code>${escapeHtml(l.empreinte)}</code></td><td>${l.origine === 'origine' ? 'D’origine' : 'Ajoutée'}</td>
          <td><span class="badge ${BADGES[l.statut]}">${escapeHtml(l.libelleStatut)}</span>${l.motifRevocation ? `<div class="meta">${escapeHtml(l.motifRevocation)}</div>` : ''}</td>
          <td>${escapeHtml(l.libelle || '—')}${l.etablissement ? `<div class="meta">${escapeHtml(l.etablissement)}</div>` : ''}${l.notes ? `<div class="meta">${escapeHtml(l.notes)}</div>` : ''}</td>
          <td>${l.expireLe ? escapeHtml(formatDateFr(l.expireLe)) : '—'}</td>
          <td>${l.annee ? `Année ${escapeHtml(l.annee)}<div class="meta">${escapeHtml(formatDateFr(l.date))} · ${escapeHtml(l.par)}</div>` : '—'}</td>
          ${proprio ? `<td>${l.statut !== 'utilisee' && l.statut !== 'revoquee' ? `<button class="action-btn" data-action="licence:modifier:${l.n}">Modifier</button><button class="action-btn" data-action="licence:${l.statut === 'suspendue' ? 'reactiver' : 'desactiver'}:${l.n}">${l.statut === 'suspendue' ? 'Réactiver' : 'Désactiver'}</button><button class="action-btn delete" data-action="licence:revoquer:${l.n}">Révoquer</button>` : ''}<button class="action-btn delete" data-action="licence:supprimer:${l.n}">Supprimer</button></td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    ${archives.length ? `<div class="panel"><div class="panel-header"><h3>Clés supprimées (liste noire)</h3><span class="meta">Traçabilité : une clé supprimée n’est plus jamais acceptée</span></div>
      <div class="table-wrap"><table><thead><tr><th>N°</th><th>Empreinte</th><th>État avant</th><th>Utilisation</th><th>Supprimée le</th><th>Par</th><th>Motif</th></tr></thead>
      <tbody>${archives.map((a) => `<tr><td>${a.n}</td><td><code>${escapeHtml(a.empreinte)}</code></td><td>${escapeHtml(a.statutAvant || '')}</td><td>${a.utilisation ? `Année ${escapeHtml(a.utilisation.annee)}` : '—'}</td><td>${escapeHtml(formatDateFr(a.supprimeeLe))}</td><td>${escapeHtml(a.par || '')}</td><td>${escapeHtml(a.motif || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
