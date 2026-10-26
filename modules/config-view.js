import { escapeHtml, formatMoney } from './utils.js';
import { listSafetyBackups } from './sauvegardes.js';
import { backupStatus, DATA_FILE_NAME, BACKUP_DIR_NAME } from './backup.js';
import { enteteConfig, enteteHtml } from './entete.js';
import { CATEGORIES } from './classes.js';
import { CATEGORIES_DEPENSE } from './depenses.js';
import { comptesTableHtml } from './comptes-view.js';
import { TYPES_COMPTE } from './comptes.js';
import { publicUsers, ROLES, currentUser, can, roleList, ADMIN_ONLY_PAGES, PERMISSIONS, estRoleAdmin, estSuperAdmin, allowedPages, peutGererCompte } from './auth.js';
import { NAV_GROUPS } from './navigation.js';
import { NATURES_ARRONDI, PALIERS_ARRONDI, SENS_ARRONDI, regleArrondi, arrondir, repartir } from './arrondi.js';

// Règles d'arrondi des montants calculés (tranches, mensualités, échéances d'avances), avec exemple en direct
function arrondisPanel(state) {
  const exemples = { tranches: [1000000, 3], mensualites: [750000, 9], avances: [500000, 3] };
  return `<div class="panel" id="arrondis-panel">
    <div class="panel-header"><h3>Arrondis des montants calculés</h3><span class="meta">Montants proposés automatiquement : la dernière part absorbe l’écart, les totaux restent exacts</span></div>
    <form class="form-grid compact" data-form="arrondis">
      ${Object.entries(NATURES_ARRONDI).map(([k, label]) => {
        const r = regleArrondi(state.config, k);
        const [total, nb] = exemples[k];
        const parts = repartir(total, nb, r);
        return `<fieldset class="span-all arrondi-row"><legend>${escapeHtml(label)}</legend>
          <label>Palier <select name="pas_${k}">${PALIERS_ARRONDI.map((p) => `<option value="${p}" ${p === r.pas ? 'selected' : ''}>${p === 1 ? 'À l’unité' : `${formatMoney(p)} ${escapeHtml(state.config.devise || '')}`}</option>`).join('')}</select></label>
          <label>Sens <select name="sens_${k}">${Object.entries(SENS_ARRONDI).map(([v, l]) => `<option value="${v}" ${v === r.sens ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="meta">Exemple : ${formatMoney(total)} ÷ ${nb} = ${formatMoney(Math.round(total / nb))} → ${parts.map((x) => formatMoney(x)).join(' + ')} = ${formatMoney(parts.reduce((a, b) => a + b, 0))}</p>
        </fieldset>`;
      }).join('')}
      <p class="meta span-all">Les montants saisis par l’utilisateur (paiements, dépenses, salaires) ne sont jamais arrondis ; les règles s’appliquent aux nouveaux tarifs, échéanciers et avances (les échéances déjà enregistrées ne changent pas).</p>
      <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer les règles d’arrondi</button></div>
    </form>
  </div>`;
}

const JOURNAL_LABELS = { caisse: 'Caisse', budget: 'Budget', export: 'Export', restauration: 'Restauration', reimpression: 'Duplicata', journal: 'Journal', securite: 'Sécurité', compte: 'Compte financier', virement: 'Virement interne', correction: 'Correction', attente: 'Règlement en attente', reduction: 'Réduction', role: 'Rôle', classe: 'Classe', config: 'Configuration', paiement: 'Paiement', annulation: 'Annulation', suppression: 'Suppression', inscription: 'Inscription', eleve: 'Élève', tarif: 'Tarif', annee: 'Année', import: 'Import', depense: 'Dépense', utilisateur: 'Utilisateur', sauvegarde: 'Sauvegarde', reinitialisation: 'Réinitialisation' };

function usersPanel() {
  const me = currentUser();
  return `<div class="panel">
      <div class="panel-header"><h3>Utilisateurs</h3><span class="meta">Le rôle d’un utilisateur se change à tout moment dans la liste ; il s’applique immédiatement</span></div>
      <div class="table-wrap"><table class="data-list" data-list="utilisateurs" data-list-title="Utilisateurs et rôles">
        <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>État</th><th>Actions</th></tr></thead>
        <tbody>${publicUsers().map((u) => { const gerable = peutGererCompte(u); return `<tr><td>${escapeHtml(u.username)}${u.proprietaire ? ' <span class="badge info">Éditeur du logiciel</span>' : ''}</td><td>${escapeHtml(u.nom)}${u.proprietaire ? '<div class="meta">Maintenance et licences ; chaque connexion est journalisée</div>' : ''}</td><td><select data-user-role="${u.id}" aria-label="Rôle de ${escapeHtml(u.nom)}" ${!gerable || (u.role === 'superadmin' && !estSuperAdmin()) ? 'disabled' : ''}>${[...rolesAttribuables(), ...(rolesAttribuables().some(([k]) => k === u.role) ? [] : [[u.role, ROLES[u.role] || u.role]])].map(([k, v]) => `<option value="${escapeHtml(k)}" ${k === u.role ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select></td>
          <td><span class="badge ${u.actif ? 'ok' : 'danger'}">${u.actif ? 'Actif' : 'Désactivé'}</span></td>
          <td>${gerable || u.id === me?.id ? `<button class="action-btn" data-action="user:password:${u.id}">Mot de passe</button>` : ''}${gerable ? `<button class="action-btn" data-action="user:toggle:${u.id}">${u.actif ? 'Désactiver' : 'Activer'}</button>` : ''}${!gerable && u.id !== me?.id ? '<span class="meta">Non subordonné</span>' : ''}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <form class="form-grid compact user-create" data-form="utilisateur" autocomplete="off">
        <p class="meta span-all form-section-title">Créer un utilisateur</p>
        <label>Identifiant <input name="username" type="text" required minlength="3" /></label>
        <label>Nom complet <input name="nom" type="text" required /></label>
        <label>Rôle <select name="role">${rolesAttribuables().map(([k, v]) => `<option value="${escapeHtml(k)}" ${k === 'comptable' ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select></label>
        <label>Mot de passe (8 caractères, lettre + chiffre) <input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn">Créer l’utilisateur</button></div>
      </form>
    </div>`;
}

// Rôles proposables : un compte ou un rôle super administrateur ne s'attribue que par un super administrateur
const rolesAttribuables = () => Object.entries(ROLES).filter(([k]) => k !== 'superadmin' || estSuperAdmin());

function roleCard(role) {
  const admin = estRoleAdmin(role.id);
  const verrouille = admin || (role.id === 'superadmin' && !estSuperAdmin());
  const pageBox = (id, label) => {
    const locked = admin || ADMIN_ONLY_PAGES.includes(id);
    const checked = admin || role.pages.includes(id);
    return `<label class="perm"><input type="checkbox" name="pages" value="${id}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>${escapeHtml(label)}${ADMIN_ONLY_PAGES.includes(id) ? ' (administrateur)' : ''}</span></label>`;
  };
  return `<form class="role-card" data-form="role" autocomplete="off">
      <input type="hidden" name="id" value="${escapeHtml(role.id)}" />
      <header><h4>${escapeHtml(role.label)}</h4><span class="badge ${role.systeme ? 'neutral' : 'ok'}">${role.systeme ? 'Rôle de base' : 'Personnalisé'} · ${role.utilisateurs} utilisateur(s)</span></header>
      ${role.description ? `<p class="meta">${escapeHtml(role.description)}</p>` : ''}
      <label>Nom du rôle <input name="label" type="text" required maxlength="40" value="${escapeHtml(role.label)}" ${role.id === 'superadmin' && !estSuperAdmin() ? 'disabled' : ''} /></label>
      ${admin ? '<p class="meta">Accès complet à toutes les pages et à toutes les actions : non restreignable, pour qu’un administrateur garde toujours la main.</p>' : ''}
      <fieldset><legend>Actions autorisées</legend><div class="perm-list">${PERMISSIONS.map(([id, label, hint, sensible]) => `<label class="perm" title="${escapeHtml(hint)}"><input type="checkbox" name="permissions" value="${id}" ${admin || role.permissions.includes(id) ? 'checked' : ''} ${verrouille ? 'disabled' : ''} /><span>${escapeHtml(label)}${sensible ? ' <small class="meta">(exception)</small>' : ''}</span></label>`).join('')}
        <label class="perm"><input type="checkbox" checked disabled /><span>Consulter les pages cochées</span></label></div>
        <p class="meta">Une action d’exception non cochée reste possible avec l’accord ponctuel d’un administrateur (identifiants saisis, opération journalisée). Une action ordinaire non cochée est refusée.</p></fieldset>
      <fieldset><legend>Pages accessibles</legend><div class="perm-list">${NAV_GROUPS.map((g) => `<span class="perm-group">${escapeHtml(g.label)}</span>${g.pages.map(([id, label]) => pageBox(id, label)).join('')}`).join('')}</div></fieldset>
      <div class="form-actions">${role.id === 'superadmin' && !estSuperAdmin() ? '' : '<button type="submit" class="primary-btn small-btn">Enregistrer le rôle</button>'}${role.systeme ? '' : `<button type="button" class="danger-btn ghost small-btn" data-action="role:delete:${escapeHtml(role.id)}">Supprimer</button>`}</div>
    </form>`;
}

function rolesPanel() {
  const roles = roleList();
  return `<div class="panel" id="roles-panel">
      <div class="panel-header"><h3>Rôles et permissions</h3><span class="meta">Modifiables à tout moment par l’administrateur ; les changements s’appliquent immédiatement à tous les utilisateurs du rôle</span></div>
      <div class="roles-grid">${roles.map(roleCard).join('')}</div>
      <form class="form-grid compact" data-form="role-new" autocomplete="off" style="margin-top:14px">
        <label>Nouveau rôle <input name="label" type="text" required maxlength="40" placeholder="Ex : Secrétariat, Directeur des études…" /></label>
        <label>Partir des droits de <select name="modele">${roles.filter((r) => r.id !== 'admin').map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join('')}</select></label>
        <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Créer le rôle</button><button type="button" class="secondary-btn small-btn" data-action="roles:reset" title="Rôles Comptable / Caissier et Consultation">Rétablir les droits par défaut</button></div>
      </form>
    </div>`;
}

// Encadré « Fichier de données » (mis à jour en direct à chaque enregistrement)
export function dataFileStatusHtml(b = backupStatus()) {
  if (b.needsPermission) {
    return `<div class="datafile-card warn"><strong>⚠ Dossier « ${escapeHtml(b.folderName)} » lié — accès à ré-autoriser</strong>
      <span class="meta">Le navigateur demande une nouvelle autorisation à chaque ouverture (sauf si vous choisissez « Autoriser à chaque visite »). Le lien n’est pas perdu.</span>
      <div class="form-actions"><button class="primary-btn small-btn" data-action="datafile:reconnect">Reconnecter le fichier de données</button></div></div>`;
  }
  if (b.linked) {
    return `<div class="datafile-card ${b.error ? 'warn' : 'ok'}"><strong>✔ ${escapeHtml(b.target)}</strong>
      <span class="meta">Enregistré automatiquement après chaque opération${b.lastAt ? ` · dernier enregistrement à ${escapeHtml(b.lastAt)}` : ''}${b.error ? ` · <span class="badge danger">${escapeHtml(b.error)}</span>` : ''}</span>
      <span class="meta">Sauvegardes automatiques (avant chaque réinitialisation, import ou restauration) : <code>${escapeHtml(b.folderName)}/${BACKUP_DIR_NAME}/</code>. Ce lien reste en place après une réinitialisation.</span>
      <div class="form-actions"><button class="secondary-btn small-btn" data-action="datafile:save">Enregistrer maintenant</button><button class="secondary-btn small-btn" data-action="datafile:backup">Créer une sauvegarde datée</button><button class="secondary-btn small-btn" data-action="datafile:link">Changer de dossier</button><button class="danger-btn ghost small-btn" data-action="datafile:unlink">Délier</button></div></div>`;
  }
  return `<div class="datafile-card warn"><strong>Aucun fichier de données lié</strong>
    <span class="meta">${b.supported ? `Choisissez un dossier : l’application y crée « ${DATA_FILE_NAME} », l’enregistre automatiquement et y range les sauvegardes (« ${BACKUP_DIR_NAME} »).` : 'Ce navigateur ne permet pas de lier un fichier : utilisez Google Chrome ou Microsoft Edge. En attendant, exportez régulièrement les données.'}</span>
    <div class="form-actions"><button class="primary-btn small-btn" data-action="datafile:link" ${b.supported ? '' : 'disabled'}>Créer / lier le fichier de données</button><button class="secondary-btn small-btn" data-action="datafile:backup">Télécharger une sauvegarde</button></div></div>`;
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
      <div class="panel-header"><h3>Zone dangereuse — réinitialisation</h3><span class="meta">Efface TOUTES les données (établissement, paramètres, comptes financiers, années, élèves, opérations, paie, journal) et supprime tous les comptes utilisateurs sauf les super administrateurs. Sont conservés : les super administrateurs, les rôles, les licences déjà utilisées et le lien vers le fichier de données.</span></div>
      <p class="meta">Avant l’effacement, une copie de sécurité est créée automatiquement, ainsi qu’un fichier de sauvegarde (dossier « ${BACKUP_DIR_NAME} » du fichier de données, ou Téléchargements). Mot de passe de super administrateur et saisie du mot RÉINITIALISER obligatoires. Les comptes utilisateurs supprimés ne figurent pas dans les sauvegardes.</p>
      <div class="form-actions">${can('superadmin') ? '<button class="danger-btn" data-action="admin:reset">Réinitialiser toutes les données…</button>' : '<span class="meta">Réservé au super administrateur.</span>'}
      ${backups.length ? '<button class="danger-btn ghost" data-action="admin:purge-backups">Supprimer toutes les copies de sécurité…</button>' : ''}</div>
    </div>`;
}

// En-tête d'une page de configuration : icône, titre, description et indicateurs rapides
function enTetePage(icone, eyebrow, titre, description, chips = []) {
  return `<div class="config-hero">
      <span class="config-hero-icon" aria-hidden="true">${icone}</span>
      <div class="config-hero-text"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(titre)}</h2><p>${escapeHtml(description)}</p></div>
      ${chips.length ? `<div class="config-hero-chips">${chips.map(([label, valeur, ton]) => `<div class="config-chip ${ton || ''}"><b>${escapeHtml(String(valeur))}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div>` : ''}
    </div>`;
}

const PAGES_CONFIG = ['config', 'config-utilisateurs', 'config-finances', 'config-donnees', 'config-journal'];

function pageEtablissement(state) {
  const c = state.config;
  const e = enteteConfig(c);
  return `${enTetePage('🏫', 'Administration', 'Établissement', 'Identité, coordonnées et en-tête officiel imprimés sur les reçus, factures, relances et rapports.', [['Devise', c.devise || 'À définir', c.devise ? '' : 'warn'], ['Caissier sur les reçus', c.caissier || 'Utilisateur connecté']])}
    ${!String(c.nom || '').trim() ? '<div class="panel empty-state"><span class="empty-icon" aria-hidden="true">🏫</span><h3>Bienvenue dans GEST SCHOOL SCOLARITÉ</h3><p class="meta">Commencez par renseigner l’identité de votre établissement et sa devise : elles figurent sur tous les reçus, factures et rapports.</p></div>' : ''}
    <div class="config-grid">
      <div class="panel section-form">
        <form class="form-grid compact" data-form="config">
          <fieldset class="span-all config-fieldset"><legend>Identité</legend>
            <label>Nom de l’établissement <input name="nom" type="text" value="${escapeHtml(c.nom)}" required maxlength="120" /></label>
            <label>Sigle (préfixe des matricules) <input name="sigle" type="text" value="${escapeHtml(c.sigle)}" maxlength="12" /></label>
            <label>Code <input name="codeEcole" type="text" value="${escapeHtml(c.codeEcole)}" maxlength="30" /></label>
            <label>Devise (ex. GNF, XOF, FCFA) <input name="devise" type="text" value="${escapeHtml(c.devise || '')}" required maxlength="10" /></label>
            <label class="span-two">Nom du caissier (affiché sur tous les reçus) <input name="caissier" type="text" value="${escapeHtml(c.caissier || '')}" placeholder="Laisser vide : utilisateur connecté" /></label>
          </fieldset>
          <fieldset class="span-all config-fieldset"><legend>Coordonnées</legend>
            <label>Adresse <input name="adresse" type="text" value="${escapeHtml(c.adresse)}" /></label>
            <label>Téléphone <input name="telephone" type="text" value="${escapeHtml(c.telephone)}" /></label>
            <label>Email <input name="email" type="email" value="${escapeHtml(c.email)}" /></label>
          </fieldset>
          <fieldset class="span-all config-fieldset"><legend>En-tête des documents</legend>
            <label class="span-two">Tutelle (une ligne par information)
              <textarea name="tutelle" rows="5">${escapeHtml(e.tutelle.join(String.fromCharCode(10)))}</textarea>
            </label>
            <label>Slogan / niveaux d’enseignement <input name="slogan" type="text" value="${escapeHtml(c.entete?.slogan || '')}" placeholder="Ex. Maternelle – Primaire – Collège" /></label>
            <label>Téléphones (en-tête) <input name="telephones" type="text" value="${escapeHtml(c.entete?.telephones || '')}" placeholder="Laisser vide : téléphone de l’établissement" /></label>
            <label>E-mail (en-tête) <input name="enteteEmail" type="email" value="${escapeHtml(c.entete?.email || '')}" placeholder="Laisser vide : e-mail de l’établissement" /></label>
            <label>Pays (affiché à droite de l’en-tête) <input name="pays" type="text" value="${escapeHtml(e.pays)}" maxlength="40" /></label>
            <label>Couleurs du drapeau (facultatif) <input name="drapeau" type="text" value="${escapeHtml(e.drapeau.join(' '))}" placeholder="Ex. #ce1126 #fcd116 #009460" /></label>
            <label class="check-row"><input name="initialesColorees" type="checkbox" ${e.initialesColorees ? 'checked' : ''} /> Initiales du nom en couleur</label>
          </fieldset>
          <fieldset class="span-all config-fieldset"><legend>Logo et symbole national</legend>
            <div class="logo-line">${c.logo ? `<img src="${escapeHtml(c.logo)}" alt="Logo" class="logo-preview" />` : '<span class="meta">Aucun logo</span>'}
              <label>Logo de l’établissement (600 Ko max.) <input type="file" accept="image/*" data-logo-input /></label>
              <label>Symbole national (image) <input type="file" accept="image/*" data-armoiries-input /></label></div>
            <div class="form-actions">
              ${c.logo ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-logo">Retirer le logo</button>' : ''}
              ${c.armoiries ? '<button type="button" class="secondary-btn small-btn" data-action="config:remove-armoiries">Retirer le symbole</button>' : ''}
            </div>
          </fieldset>
          <div class="form-actions span-all"><button type="submit" class="primary-btn">Enregistrer l’établissement</button></div>
        </form>
      </div>
      <div class="panel config-apercu">
        <div class="panel-header"><h3>Aperçu de l’en-tête</h3><span class="meta">Tel qu’imprimé sur les documents</span></div>
        <div class="entete-apercu">${enteteHtml(c)}</div>
      </div>
    </div>`;
}

function pageUtilisateurs() {
  const users = publicUsers();
  const roles = roleList();
  return `${enTetePage('🔐', 'Administration', 'Utilisateurs et rôles', 'Comptes de connexion, rôle de chaque utilisateur et droits de chaque rôle (pages accessibles, saisie, exports).', [['Utilisateurs', users.length], ['Actifs', users.filter((u) => u.actif).length, 'ok'], ['Rôles', roles.length], ['Rôles personnalisés', roles.filter((r) => !r.systeme).length]])}
    ${usersPanel()}
    ${rolesPanel()}`;
}

function comptesPanel(state) {
  return `<div class="panel" id="comptes-panel">
    <div class="panel-header"><h3>Comptes financiers</h3><span class="meta">Caisse, banque, Mobile Money… Chaque encaissement et chaque dépense est rattaché à un compte.</span></div>
    ${comptesTableHtml(state, { actions: true })}
    <form class="form-grid compact" data-form="compte" autocomplete="off" style="margin-top:14px">
      <p class="meta span-all form-section-title" data-submit-title>Nouveau compte</p>
      <label>Nom du compte <input name="libelle" type="text" required maxlength="60" placeholder="Ex. Banque — compte courant" /></label>
      <label>Type <select name="type">${Object.entries(TYPES_COMPTE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>N° de compte / référence <input name="numero" type="text" maxlength="60" /></label>
      <label>Solde initial (${escapeHtml(state.config.devise || '')}) <input name="soldeInitial" type="number" min="0" step="1" value="0" /></label>
      <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn" data-submit-label>Créer le compte</button><button type="button" class="secondary-btn small-btn" data-action="form:reset" hidden>Annuler la modification</button></div>
    </form>
    <p class="meta">Le solde initial correspond à l’argent présent sur le compte au moment où vous commencez à utiliser l’application. Le compte principal ne peut pas être désactivé ; un compte désactivé reste visible avec son historique.</p>
  </div>`;
}

function referentielsPanel(state) {
  const nl = String.fromCharCode(10);
  return `<div class="panel" id="referentiels-panel">
    <div class="panel-header"><h3>Catégories</h3><span class="meta">Une catégorie par ligne ; celles déjà utilisées par des classes ne peuvent pas être retirées</span></div>
    <form class="form-grid compact" data-form="referentiels" autocomplete="off">
      <label class="span-two">Catégories d’enseignement (classes, tableaux de bord, rapports)
        <textarea name="categories" rows="6">${escapeHtml(CATEGORIES.join(nl))}</textarea></label>
      <label class="span-two">Catégories de dépenses
        <textarea name="categoriesDepense" rows="6">${escapeHtml(CATEGORIES_DEPENSE.join(nl))}</textarea></label>
      <div class="form-actions span-all"><button type="submit" class="primary-btn small-btn">Enregistrer les catégories</button></div>
    </form>
  </div>`;
}

function reglesPanel() {
  return `<div class="panel">
    <div class="panel-header"><h3>Règles financières appliquées</h3><span class="meta">Règles métier fixes, identiques sur tous les postes</span></div>
    <ul class="rules-list">
      <li><b>Paiement supérieur au solde :</b> refusé. Un excédent n’est jamais transformé en crédit ni reporté sur une autre année ; dans l’année, le montant payé au-delà de l’échéance en cours est imputé sur les échéances suivantes (paiement d’avance).</li>
      <li><b>Double enregistrement :</b> un formulaire ne peut être enregistré qu’une fois ; un paiement identique (même élève, montant et date) dans les 2 minutes demande une confirmation.</li>
      <li><b>Règlement en attente</b> (chèque, virement) : enregistré à part et exclu de tous les totaux jusqu’à sa confirmation.</li>
      <li><b>Annulation :</b> motivée, réservée à l’administrateur ; la ligne, son numéro et son motif restent dans l’historique et sortent des totaux.</li>
      <li><b>Correction d’un paiement :</b> moyen, compte, référence, payeur, date, description et observation seulement, avec motif et historique ; une erreur de montant ou d’élève se corrige par annulation puis nouveau paiement.</li>
      <li><b>Modification d’un tarif :</b> jamais rétroactive pour un élève qui a déjà payé ; les élèves sans paiement peuvent être réalignés sur demande. Chaque version du tarif est historisée.</li>
      <li><b>Caisse :</b> solde théorique calculé à partir des opérations valides ; tout écart de comptage est justifié ; une journée fermée verrouille les opérations de la caisse jusqu’à cette date (réouverture motivée et tracée de la dernière journée seulement).</li>
      <li><b>Virements internes :</b> ils diminuent le compte source et augmentent le compte destinataire, sans créer de recette ni de dépense.</li>
      <li><b>Réductions :</b> remise plafonnée par le tarif de la classe ; bourse et exonération accordées par un administrateur ; elles ne portent que sur la scolarité restant à payer.</li>
    </ul>
  </div>`;
}

function pageFinances(state) {
  const a = state.config.arrondis || {};
  const devise = state.config.devise || '';
  return `${enTetePage('🧮', 'Administration', 'Paramètres financiers', 'Comptes financiers, catégories, règles appliquées et arrondis des montants calculés automatiquement.', [['Comptes', (state.comptes || []).length], ['Catégories d’enseignement', CATEGORIES.length], ['Catégories de dépenses', CATEGORIES_DEPENSE.length], ['Arrondi des tranches', `${formatMoney(a.tranches?.pas || 1)} ${devise}`]])}
    ${comptesPanel(state)}
    ${referentielsPanel(state)}
    ${reglesPanel()}
    ${arrondisPanel(state)}`;
}

function pageDonnees(state) {
  const b = backupStatus();
  const copies = listSafetyBackups();
  return `${enTetePage('💾', 'Sauvegardes et restauration', 'Données et sauvegardes', 'Fichier de données permanent, sauvegardes vérifiables, restauration, copies de sécurité et réinitialisation encadrée.', [['Fichier de données', b.linked ? 'Lié' : b.needsPermission ? 'À reconnecter' : 'Non lié', b.linked ? 'ok' : 'warn'], ['Dernier enregistrement', b.lastAt || '—'], ['Copies de sécurité', copies.length]])}
    <div class="panel" id="datafile-panel">
      <div class="panel-header"><h3>Fichier de données</h3><span class="meta">Lien permanent entre l’application et son fichier de données</span></div>
      <div data-datafile-status>${dataFileStatusHtml(b)}</div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Sauvegarde et restauration</h3><span class="meta">Fichiers vérifiables : format, version et empreinte SHA-256 du contenu</span></div>
      <div class="export-cards">
        <button type="button" class="export-card" data-action="backup:json"><b>Sauvegarde complète</b><span>Toutes les données, historiques et références (archive vérifiable .note)</span></button>
        <button type="button" class="export-card" data-action="backup:params"><b>Paramètres seuls</b><span>Identité, en-tête, catégories, règles, comptes, référentiels</span></button>
        <button type="button" class="export-card" data-action="backup:txt"><b>Note lisible (TXT)</b><span>Situations, paiements et dernières opérations</span></button>
        <label class="export-card"><input type="file" accept=".note,.json" data-restore-input hidden /><b>Restaurer…</b><span>Sauvegarde complète (super administrateur) ou paramètres</span></label>
      </div>
      <details><summary><b>Procédure de récupération après une erreur</b></summary><ol class="rules-list">
        <li>Ne saisissez plus rien : chaque opération réécrit le fichier de données.</li>
        <li>Erreur ponctuelle (paiement, dépense) : annulez-la avec un motif, sans restaurer.</li>
        <li>Erreur massive (import, réinitialisation) : « Restaurer » la copie de sécurité créée automatiquement juste avant (tableau ci-dessous), ou une sauvegarde datée du dossier « sauvegardes ».</li>
        <li>Un fichier refusé par le contrôle d’intégrité a été modifié ou endommagé : utilisez une sauvegarde plus ancienne.</li>
        <li>Après restauration, vérifiez le tableau de bord et le journal d’audit.</li></ol></details>
      <p class="meta">Risques du stockage dans le navigateur : effacer les données de navigation, réinitialiser ou changer de profil Windows / de navigateur, ou une corruption du stockage local font disparaître la base de travail. Conservez le fichier de données lié et des sauvegardes régulières sur un support externe.</p>
    </div>
    ${safetyPanel(state)}`;
}

// Avant / après d'une entrée d'audit : clés modifiées (au plus 8), valeurs courtes
export function diffAudit(j) {
  if (!j.avant && !j.apres) return '';
  const court = (v) => { const t = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—'); return t.length > 60 ? `${t.slice(0, 60)}…` : t; };
  const a = j.avant && typeof j.avant === 'object' ? j.avant : {};
  const b = j.apres && typeof j.apres === 'object' ? j.apres : {};
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).slice(0, 8);
  if (!cles.length) return '';
  return `<div class="audit-diff">${cles.map((k) => `<span><b>${escapeHtml(k)}</b> : ${escapeHtml(j.avant ? court(a[k]) : '—')} → ${escapeHtml(j.apres ? court(b[k]) : '—')}</span>`).join(' · ')}</div>`;
}

function pageJournal(state) {
  const journal = [...(state.journal || [])].reverse();
  const types = [...new Set(journal.map((j) => j.type))];
  const utilisateurs = [...new Set(journal.map((j) => j.utilisateur).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return `${enTetePage('📜', 'Utilisateurs et permissions', 'Journal d’audit', 'Traçabilité des opérations : utilisateur, date, action, enregistrement concerné et valeurs avant / après (tarifs, paiements, annulations, corrections, dépenses, clôtures de caisse, permissions, exports, restaurations, connexions).', [['Opérations', journal.length], ['Aujourd’hui', journal.filter((j) => String(j.horodatage).slice(0, 10) === aujourdHui).length], ['Événements de sécurité', journal.filter((j) => j.type === 'securite').length]])}
    <div class="panel">
      <div class="advanced-search">
        <label>Recherche <input type="search" data-journal-search placeholder="Détail, n° de pièce…" autocomplete="off" /></label>
        <label>Type d’opération <select data-journal-type><option value="">Tous</option>${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(JOURNAL_LABELS[t] || t)}</option>`).join('')}</select></label>
        <label>Utilisateur <select data-journal-user><option value="">Tous</option>${utilisateurs.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')}</select></label>
        <label>Du <input type="date" data-journal-from /></label>
        <label>Au <input type="date" data-journal-to /></label>
      </div>
      ${can('export') ? '<div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="journal:csv">Exporter le journal (CSV)</button></div>' : ''}
      <div class="table-wrap"><table class="data-list" data-list="journal" data-list-title="Journal d’audit">
        <thead><tr><th>Date et heure</th><th>Opération</th><th>Utilisateur</th><th>Enregistrement</th><th>Détail (avant → après)</th><th>Montant</th></tr></thead>
        <tbody>${journal.map((j) => `<tr data-journal-row data-type="${escapeHtml(j.type)}" data-user="${escapeHtml(j.utilisateur || '')}" data-date="${escapeHtml(String(j.horodatage).slice(0, 10))}" data-search="${escapeHtml(`${j.detail} ${j.cible || ''} ${j.utilisateur || ''}`.toLowerCase())}"><td>${escapeHtml(new Date(j.horodatage).toLocaleString('fr-FR'))}</td><td><span class="badge ${j.type === 'securite' ? 'warning' : 'neutral'}">${escapeHtml(JOURNAL_LABELS[j.type] || j.type)}</span></td><td>${escapeHtml(j.utilisateur || '—')}</td><td>${escapeHtml(j.cible || '')}</td><td>${escapeHtml(j.detail)}${diffAudit(j)}</td><td class="num">${j.montant ? `${formatMoney(j.montant)} ${escapeHtml(state.config.devise)}` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Aucune opération enregistrée.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// Pages de configuration : administrateurs ; le journal d'audit est aussi ouvert aux rôles qui ont la page (auditeur, directeur)
export function renderConfig(state) {
  const pages = { config: pageEtablissement, 'config-utilisateurs': pageUtilisateurs, 'config-finances': pageFinances, 'config-donnees': pageDonnees, 'config-journal': pageJournal };
  PAGES_CONFIG.forEach((id) => {
    const section = document.getElementById(id);
    if (!section) return;
    const autorise = can('admin') || (id === 'config-journal' && allowedPages().includes(id));
    section.innerHTML = autorise ? pages[id](state) : '<div class="panel"><p class="meta">Accès réservé à l’administrateur.</p></div>';
  });
}
