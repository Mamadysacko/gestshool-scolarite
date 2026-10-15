import { escapeHtml, formatMoney } from './utils.js';
import { backupStatus } from './backup.js';
import { enteteConfig, DEFAULT_LOGO } from './entete.js';
import { publicUsers, ROLES, currentUser, can } from './auth.js';
import { listSafetyBackups } from './sauvegardes.js';

const JOURNAL_LABELS = { classe: 'Classe', config: 'Configuration', paiement: 'Paiement', annulation: 'Annulation', suppression: 'Suppression', inscription: 'Inscription', eleve: 'Élève', tarif: 'Tarif', annee: 'Année', import: 'Import', depense: 'Dépense', utilisateur: 'Utilisateur', sauvegarde: 'Sauvegarde', reinitialisation: 'Réinitialisation' };

function usersPanel() {
  const me = currentUser();
  return `<div class="panel">
      <div class="panel-header"><h3>Utilisateurs et rôles</h3><span class="meta">Administrateur : tout · Comptable / Caissier : saisie sans suppression · Consultation : lecture seule</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>État</th><th>Actions</th></tr></thead>
        <tbody>${publicUsers().map((u) => `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.nom)}</td><td>${escapeHtml(ROLES[u.role])}</td>
          <td><span class="badge ${u.actif ? 'ok' : 'danger'}">${u.actif ? 'Actif' : 'Désactivé'}</span></td>
          <td><button class="action-btn" data-action="user:password:${u.id}">Mot de passe</button>${u.id === me?.id ? '' : `<button class="action-btn" data-action="user:toggle:${u.id}">${u.actif ? 'Désactiver' : 'Activer'}</button>`}</td></tr>`).join('')}</tbody>
      </table></div>
      <form class="form-grid compact" data-form="utilisateur" autocomplete="off">
        <label>Identifiant <input name="username" type="text" required minlength="3" /></label>
        <label>Nom complet <input name="nom" type="text" required /></label>
        <label>Rôle <select name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === 'comptable' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Mot de passe (8 caractères, lettre + chiffre) <input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">Créer l’utilisateur</button></div>
      </form>
    </div>`;
}

function safetyPanel(state) {
  const backups = listSafetyBackups();
  return `<div class="panel">
      <div class="panel-header"><h3>Copies de sécurité</h3><span class="meta">Créées automatiquement avant une réinitialisation ou un import. Jamais supprimées sans autorisation administrateur.</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Motif</th><th>Par</th><th>Contenu</th><th>Actions</th></tr></thead>
        <tbody>${backups.map((b) => `<tr><td>${escapeHtml(new Date(b.date).toLocaleString('fr-FR'))}</td><td>${escapeHtml(b.motif)}</td><td>${escapeHtml(b.par || '—')}</td>
          <td>${b.resume.eleves} élève(s) · ${b.resume.paiements} paiement(s) · ${b.resume.depenses} dépense(s)</td>
          <td><button class="action-btn" data-action="safety:download:${b.id}">Télécharger</button><button class="action-btn" data-action="safety:restore:${b.id}">Restaurer</button><button class="action-btn delete" data-action="safety:delete:${b.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5">Aucune copie de sécurité.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="panel danger-zone">
      <div class="panel-header"><h3>Zone dangereuse — réinitialisation</h3><span class="meta">Efface élèves, classes, frais, inscriptions, paiements, dépenses et journal. L’établissement, les années et les comptes sont conservés.</span></div>
      <p class="meta">Une copie de sécurité est créée automatiquement avant l’effacement. Mot de passe administrateur et saisie du mot RÉINITIALISER obligatoires.</p>
      <div class="form-actions"><button class="danger-btn" data-action="admin:reset">Réinitialiser les données…</button>
      ${backups.length ? '<button class="danger-btn ghost" data-action="admin:purge-backups">Supprimer toutes les copies de sécurité…</button>' : ''}</div>
    </div>`;
}

export function renderConfig(state) {
  const section = document.getElementById('config');
  if (!can('admin')) { section.innerHTML = '<div class="panel"><p class="meta">Accès réservé à l’administrateur.</p></div>'; return; }
  const c = state.config;
  const b = backupStatus();
  const e = enteteConfig(c);
  const journal = [...(state.journal || [])].reverse().slice(0, 100);
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Établissement</h3><span class="meta">Ces informations apparaissent sur les reçus et les rapports</span></div>
      <form class="form-grid compact" data-form="config">
        <label>Nom <input name="nom" type="text" value="${escapeHtml(c.nom)}" /></label>
        <label>Sigle <input name="sigle" type="text" value="${escapeHtml(c.sigle)}" /></label>
        <label>Code <input name="codeEcole" type="text" value="${escapeHtml(c.codeEcole)}" /></label>
        <label>Devise <input name="devise" type="text" value="${escapeHtml(c.devise || 'GNF')}" /></label>
        <label>Nom du caissier (affiché sur tous les reçus) <input name="caissier" type="text" value="${escapeHtml(c.caissier || '')}" placeholder="Laisser vide : utilisateur connecté" /></label>
        <label>Adresse <input name="adresse" type="text" value="${escapeHtml(c.adresse)}" /></label>
        <label>Téléphone <input name="telephone" type="text" value="${escapeHtml(c.telephone)}" /></label>
        <label>Email <input name="email" type="email" value="${escapeHtml(c.email)}" /></label>
        <label class="span-two">Tutelle (une ligne par information)
          <textarea name="tutelle" rows="5">${escapeHtml(e.tutelle.join(String.fromCharCode(10)))}</textarea>
        </label>
        <label>Slogan (encadré bleu et jaune) <input name="slogan" type="text" value="${escapeHtml(e.slogan)}" /></label>
        <label>Téléphones (en-tête) <input name="telephones" type="text" value="${escapeHtml(e.telephones)}" /></label>
        <label>E-mail (en-tête) <input name="enteteEmail" type="email" value="${escapeHtml(e.email)}" /></label>
        <label>Logo de l’établissement <input type="file" accept="image/*" data-logo-input /></label>
        <label>Symbole national (image) <input type="file" accept="image/*" data-armoiries-input /></label>
        <div class="form-actions span-all">
          <img src="${escapeHtml(c.logo || DEFAULT_LOGO)}" alt="Logo" class="logo-preview" />
          ${c.logo ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-logo">Logo par défaut</button>' : ''}
          ${c.armoiries ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-armoiries">Retirer le symbole</button>' : ''}
          <button type="submit" class="primary-btn">Enregistrer</button>
        </div>
      </form>
    </div>

    ${usersPanel()}

    <div class="panel">
      <div class="panel-header"><h3>Sauvegarde</h3><span class="meta">La base principale reste le stockage du navigateur ; ces fichiers sont des copies lisibles.</span></div>
      <p class="meta">Destination : <b>${escapeHtml(b.target)}</b>${b.lastAt ? ` · dernière sauvegarde à ${escapeHtml(b.lastAt)}` : ''}${b.error ? ` · <span class="badge danger">${escapeHtml(b.error)}</span>` : ''}</p>
      <div class="form-actions">
        <button class="primary-btn small-btn" data-action="backup:choose" ${b.supported ? '' : 'disabled title="Chrome ou Edge requis"'}>${b.fileConnected ? 'Changer le fichier de sauvegarde automatique' : 'Activer la sauvegarde automatique dans un fichier'}</button>
        <button class="secondary-btn small-btn" data-action="backup:txt">Exporter une note lisible (TXT)</button>
        <button class="secondary-btn small-btn" data-action="backup:json">Exporter les données (JSON)</button>
      </div>
    </div>

    ${safetyPanel(state)}

    <div class="panel">
      <div class="panel-header"><h3>Historique des opérations comptables</h3><span class="meta">${journal.length} dernière(s) opération(s)</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date et heure</th><th>Opération</th><th>Utilisateur</th><th>Détail</th><th>Montant</th></tr></thead>
        <tbody>${journal.map((j) => `<tr><td>${escapeHtml(new Date(j.horodatage).toLocaleString('fr-FR'))}</td><td>${escapeHtml(JOURNAL_LABELS[j.type] || j.type)}</td><td>${escapeHtml(j.utilisateur || '—')}</td><td>${escapeHtml(j.detail)}</td><td class="num">${j.montant ? `${formatMoney(j.montant)} ${escapeHtml(c.devise)}` : ''}</td></tr>`).join('') || '<tr><td colspan="5">Aucune opération enregistrée.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
