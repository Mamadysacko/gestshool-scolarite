// GEST SCHOOL SCOLARITÉ · 11-administration-sauvegardes.js
// Administration : configuration, fichier de données, sauvegardes, copies de sécurité, licence en ligne et mises à jour
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/config-view.js, ./modules/backup.js, ./modules/sauvegardes.js, ./modules/archive.js, ./modules/cloud.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/config-view.js'] = (require, exports) => {
    const { escapeHtml, formatMoney } = require("./utils.js");
    const { listSafetyBackups } = require("./sauvegardes.js");
    const { backupStatus, DATA_FILE_NAME, BACKUP_DIR_NAME } = require("./backup.js");
    const { enteteConfig, enteteHtml } = require("./entete.js");
    const { CATEGORIES } = require("./classes.js");
    const { CATEGORIES_DEPENSE } = require("./depenses.js");
    const { comptesTableHtml } = require("./comptes-view.js");
    const { TYPES_COMPTE } = require("./comptes.js");
    const { publicUsers, ROLES, currentUser, can, roleList, ADMIN_ONLY_PAGES, PERMISSIONS, estRoleAdmin, estSuperAdmin, allowedPages, peutGererCompte } = require("./auth.js");
    const { NAV_GROUPS } = require("./navigation.js");
    const { NATURES_ARRONDI, PALIERS_ARRONDI, SENS_ARRONDI, regleArrondi, arrondir, repartir } = require("./arrondi.js");
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
    function dataFileStatusHtml(b = backupStatus()) {
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
    function diffAudit(j) {
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
    function renderConfig(state) {
      const pages = { config: pageEtablissement, 'config-utilisateurs': pageUtilisateurs, 'config-finances': pageFinances, 'config-donnees': pageDonnees, 'config-journal': pageJournal };
      PAGES_CONFIG.forEach((id) => {
        const section = document.getElementById(id);
        if (!section) return;
        const autorise = can('admin') || (id === 'config-journal' && allowedPages().includes(id));
        section.innerHTML = autorise ? pages[id](state) : '<div class="panel"><p class="meta">Accès réservé à l’administrateur.</p></div>';
      });
    }
    
    Object.assign(exports, { dataFileStatusHtml, diffAudit, renderConfig });
  };
  factories['./modules/backup.js'] = (require, exports) => {
    const { formatMoney, formatDateFr, downloadBlob, todayISO } = require("./utils.js");
    const { inscriptionSituation, STATUT_LABELS, studentOf, classOf, yearLabel, labelEcheance } = require("./finance.js");
    // Stockage des données :
    //  - base de travail : le stockage du navigateur (localStorage), toujours à jour ;
    //  - fichier de données « GESTSCHOOL-SCOLARITE-donnees.note » dans un DOSSIER choisi à la première ouverture, réécrit
    //    automatiquement après chaque opération. Le lien vers ce dossier est mémorisé par le navigateur (IndexedDB) :
    //    il reste en place après une réinitialisation des données et à chaque nouvelle ouverture ;
    //  - sous-dossier « sauvegardes » : copies datées créées automatiquement avant chaque réinitialisation,
    //    import ou restauration ;
    //  - copie roulante dans le navigateur (secours).
    const BACKUP_KEY = 'ibk_backup_note_v1';
    const PROMPT_KEY = 'ibk_datafile_prompt_v1';
    const IDB_NAME = 'ibk_backup';
    const DATA_FILE_NAME = 'GESTSCHOOL-SCOLARITE-donnees.note';
    // Nom utilisé par les versions précédentes : toujours relu si le nouveau fichier n'existe pas encore (aucune perte)
    const LEGACY_DATA_FILE_NAMES = ['IBK-donnees.note'];
    const BACKUP_DIR_NAME = 'sauvegardes';
    let dirHandle = null; // dossier lié, accès accordé
    let pendingHandle = null; // dossier lié dont l'accès doit être ré-autorisé (nouvelle session du navigateur)
    let fileHandle = null; // ancien mode : un seul fichier choisi par l'utilisateur
    let timer = null;
    let blocked = false; // écriture suspendue tant qu'une restauration depuis le fichier est proposée
    let listener = null;
    const status = { lastAt: '', error: '' };
    
    function buildNoteText(state) {
      const c = state.config;
      const line = (...parts) => parts.join('  ');
      const out = [`${c.nom} — NOTE DE SAUVEGARDE`, `Générée le ${new Date().toLocaleString('fr-FR')}`, '='.repeat(70), ''];
      out.push('SITUATION DES ÉLÈVES INSCRITS');
      let attendu = 0; let paye = 0;
      state.inscriptions.forEach((i) => {
        const s = studentOf(state, i);
        const sit = inscriptionSituation(state, i);
        attendu += sit.total; paye += sit.paye;
        out.push(line(`- ${s?.matricule || '—'}`, `${s ? `${s.prenom} ${s.nom}` : '—'}`, `[${classOf(state, i.classeId)?.nom || '—'} / ${yearLabel(state, i.anneeId)}]`,
          `attendu ${formatMoney(sit.total)}`, `payé ${formatMoney(sit.paye)}`, `reste ${formatMoney(sit.reste)} ${c.devise}`, `(${STATUT_LABELS[sit.statut]})`));
      });
      out.push('', `TOTAL attendu ${formatMoney(attendu)} · encaissé ${formatMoney(paye)} · reste ${formatMoney(Math.max(attendu - paye, 0))} ${c.devise}`, '', 'PAIEMENTS');
      [...state.paiements].sort((a, b) => a.id - b.id).forEach((p) => {
        const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
        const s = studentOf(state, i);
        out.push(line(`- ${formatDateFr(p.datePaiement)}`, p.numeroRecu || `#${p.id}`, s ? `${s.prenom} ${s.nom}` : '—', labelEcheance(i?.echeances?.find((e) => e.id === p.echeanceId)),
          `${formatMoney(p.montant)} ${c.devise}`, p.mode, p.annule ? `ANNULÉ (${p.motif})` : ''));
      });
      out.push('', 'JOURNAL DES OPÉRATIONS (100 dernières)');
      (state.journal || []).slice(-100).forEach((j) => out.push(`- ${new Date(j.horodatage).toLocaleString('fr-FR')}  ${j.type.toUpperCase()}  ${j.detail}${j.montant ? `  ${formatMoney(j.montant)} ${c.devise}` : ''}`));
      return out.join('\n');
    }
    
    function exportNoteText(state) {
      downloadBlob(`note-scolarite-${todayISO()}.txt`, `﻿${buildNoteText(state)}`, 'text/plain;charset=utf-8');
    }
    
    
    const dataFolderSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
    
    function backupStatus() {
      const linked = Boolean(dirHandle || fileHandle);
      const name = (dirHandle || pendingHandle)?.name || fileHandle?.name || '';
      let target = 'Copie locale du navigateur uniquement';
      if (dirHandle) target = `Dossier « ${name} » › ${DATA_FILE_NAME}`;
      else if (fileHandle) target = `Fichier ${name}`;
      else if (pendingHandle) target = `Dossier « ${name} » (accès à ré-autoriser)`;
      return { ...status, target, supported: dataFolderSupported(), linked, needsPermission: Boolean(pendingHandle) && !dirHandle, folderName: name, mode: dirHandle ? 'dossier' : fileHandle ? 'fichier' : 'aucun', fileConnected: linked };
    }
    
    function onBackupStatus(fn) { listener = fn; }
    const changed = () => { try { listener?.(backupStatus()); } catch (error) { /* affichage seulement */ } };
    
    function idb(mode, fn) {
      return new Promise((resolve, reject) => {
        const open = indexedDB.open(IDB_NAME, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('kv');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          try {
            const tx = open.result.transaction('kv', mode);
            const req = fn(tx.objectStore('kv'));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
          } catch (error) { reject(error); } // valeur non enregistrable, base indisponible…
        };
      });
    }
    const idbGet = (key) => idb('readonly', (store) => store.get(key));
    const idbSet = (key, value) => idb('readwrite', (store) => store.put(value, key));
    const idbDel = (key) => idb('readwrite', (store) => store.delete(key));
    
    // Au démarrage : le lien mémorisé est repris ; si le navigateur demande une nouvelle autorisation, le dossier
    // reste lié (pendingHandle) et un clic sur « Reconnecter » suffit.
    async function initAutoBackup() {
      try {
        const dir = await idbGet('dir');
        if (dir) {
          if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') dirHandle = dir;
          else pendingHandle = dir;
        } else {
          const legacy = await idbGet('handle');
          if (legacy && (await legacy.queryPermission({ mode: 'readwrite' })) === 'granted') fileHandle = legacy;
        }
      } catch (error) { /* navigateur sans prise en charge : la copie du navigateur suffit */ }
      changed();
      return backupStatus();
    }
    
    // Proposition faite une seule fois, à la toute première ouverture
    function dataFilePrompted() {
      try { return Boolean(localStorage.getItem(PROMPT_KEY)); } catch (error) { return true; }
    }
    function markDataFilePrompted() {
      try { localStorage.setItem(PROMPT_KEY, new Date().toISOString()); } catch (error) { /* non bloquant */ }
    }
    
    async function readDataFromDir(dir) {
      try {
        let handle = null;
        for (const name of [DATA_FILE_NAME, ...LEGACY_DATA_FILE_NAMES]) {
          try { handle = await dir.getFileHandle(name); break; } catch (error) { /* nom suivant */ }
        }
        if (!handle) return null;
        const file = await handle.getFile();
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return { data, date: new Date(file.lastModified).toISOString(), taille: file.size };
      } catch (error) { return null; }
    }
    
    // Contenu actuel du fichier de données lié (null s'il n'existe pas encore ou si le dossier n'est pas accessible)
    async function readLinkedData() {
      return dirHandle ? readDataFromDir(dirHandle) : null;
    }
    
    // Choix du dossier (geste de l'utilisateur obligatoire). Renvoie le contenu éventuel d'un fichier de données
    // déjà présent dans ce dossier : l'appelant décide de le charger ou de le remplacer (rien n'est écrasé ici).
    async function linkDataFolder() {
      if (!dataFolderSupported()) throw new Error('Ce navigateur ne permet pas de lier un dossier. Utilisez Google Chrome ou Microsoft Edge (ou l’export manuel).');
      const dir = await window.showDirectoryPicker({ id: 'gestschool-donnees', mode: 'readwrite', startIn: 'documents' });
      if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Accès au dossier refusé.');
      const existing = await readDataFromDir(dir);
      dirHandle = dir;
      pendingHandle = null;
      fileHandle = null;
      try { await idbSet('dir', dir); await idbDel('handle'); } catch (error) { status.error = 'Lien non mémorisé par le navigateur'; }
      markDataFilePrompted();
      changed();
      return { existing, name: dir.name };
    }
    
    async function reconnectDataFolder() {
      if (!pendingHandle) return Boolean(dirHandle);
      if ((await pendingHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
      dirHandle = pendingHandle;
      pendingHandle = null;
      status.error = '';
      changed();
      return true;
    }
    
    async function unlinkDataFolder() {
      dirHandle = null; pendingHandle = null; fileHandle = null;
      try { await idbDel('dir'); await idbDel('handle'); } catch (error) { /* non bloquant */ }
      changed();
    }
    
    async function writeText(dir, name, text) {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close(); // le fichier n'est remplacé qu'une fois l'écriture complète
    }
    
    const serialize = (state) => JSON.stringify(state, null, 2);
    
    async function runBackup(state) {
      if (blocked) return;
      try {
        try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: new Date().toISOString(), data: state })); } catch (error) { /* copie de secours facultative */ }
        if (dirHandle) await writeText(dirHandle, DATA_FILE_NAME, serialize(state));
        else if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(serialize(state));
          await writable.close();
        }
        status.lastAt = new Date().toLocaleTimeString('fr-FR');
        status.error = '';
      } catch (error) {
        // Accès retiré par le navigateur : le dossier reste lié, il suffit de le reconnecter
        if (dirHandle && error?.name === 'NotAllowedError') { pendingHandle = dirHandle; dirHandle = null; }
        status.error = error?.message || 'Échec de l’enregistrement du fichier';
      }
      changed();
    }
    
    function scheduleBackup(state) {
      clearTimeout(timer);
      timer = setTimeout(() => runBackup(state), 800);
    }
    
    // Écriture immédiate (après une réinitialisation, un import, une restauration)
    async function flushBackup(state) {
      clearTimeout(timer);
      await runBackup(state);
    }
    
    function blockBackup(value) { blocked = Boolean(value); }
    
    // Copie datée dans « sauvegardes » du dossier lié ; renvoie le chemin lisible, ou null sans dossier accessible
    async function writeBackupFile(state, fileName) {
      if (!dirHandle) return null;
      const sub = await dirHandle.getDirectoryHandle(BACKUP_DIR_NAME, { create: true });
      await writeText(sub, fileName, serialize(state));
      const check = await (await sub.getFileHandle(fileName)).getFile();
      if (!check.size) throw new Error('Fichier de sauvegarde vide');
      return `${dirHandle.name}/${BACKUP_DIR_NAME}/${fileName}`;
    }
    
    // Nom horodaté : sauvegarde-avant-reinitialisation-2026-10-16_14h0512.note
    function backupFileName(motif) {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `sauvegarde-${motif}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}${p(d.getSeconds())}.note`;
    }
    
    Object.assign(exports, { DATA_FILE_NAME, LEGACY_DATA_FILE_NAMES, BACKUP_DIR_NAME, buildNoteText, exportNoteText, dataFolderSupported, backupStatus, onBackupStatus, initAutoBackup, dataFilePrompted, markDataFilePrompted, readLinkedData, linkDataFolder, reconnectDataFolder, unlinkDataFolder, scheduleBackup, flushBackup, blockBackup, writeBackupFile, backupFileName });
  };
  factories['./modules/sauvegardes.js'] = (require, exports) => {
    // Copies de sécurité conservées dans le navigateur. Elles sont créées avant toute opération destructrice
    // (réinitialisation, import) et ne sont JAMAIS supprimées automatiquement : seule une action explicite,
    // autorisée par un administrateur, peut en retirer une.
    const SAFETY_KEY = 'ibk_safety_backups_v1';
    
    function readAll() {
      try {
        const parsed = JSON.parse(localStorage.getItem(SAFETY_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) { return []; }
    }
    
    function writeAll(list) {
      localStorage.setItem(SAFETY_KEY, JSON.stringify(list));
    }
    
    const summary = (state) => ({
      eleves: state.eleves.length,
      inscriptions: state.inscriptions.length,
      paiements: state.paiements.length,
      depenses: (state.depenses || []).length
    });
    
    function listSafetyBackups() {
      return readAll().map(({ id, date, motif, par, resume, taille }) => ({ id, date, motif, par, resume, taille })).sort((a, b) => b.id - a.id);
    }
    
    // Lève une erreur si la copie ne peut pas être conservée (stockage plein) : l'appelant doit alors renoncer à l'opération.
    function createSafetyBackup(state, motif, par = '') {
      const list = readAll();
      const data = JSON.stringify(state);
      const entry = { id: list.reduce((m, b) => Math.max(m, b.id), 0) + 1, date: new Date().toISOString(), motif, par, resume: summary(state), taille: data.length, data };
      list.push(entry);
      writeAll(list);
      // Relecture : on s'assure que la copie est bien lisible avant d'autoriser la suite
      const stored = readAll().find((b) => b.id === entry.id);
      if (!stored || stored.data !== data) throw new Error('La copie de sécurité n’a pas pu être vérifiée.');
      return { id: entry.id, date: entry.date, motif, par, resume: entry.resume, taille: entry.taille };
    }
    
    function readSafetyBackup(id) {
      const entry = readAll().find((b) => b.id === Number(id));
      return entry ? JSON.parse(entry.data) : null;
    }
    
    function deleteSafetyBackup(id) {
      const list = readAll();
      const next = list.filter((b) => b.id !== Number(id));
      if (next.length === list.length) return false;
      writeAll(next);
      return true;
    }
    
    function deleteAllSafetyBackups() {
      const count = readAll().length;
      writeAll([]);
      return count;
    }
    
    Object.assign(exports, { listSafetyBackups, createSafetyBackup, readSafetyBackup, deleteSafetyBackup, deleteAllSafetyBackups });
  };
  factories['./modules/archive.js'] = (require, exports) => {
    const { sha256Hex } = require("./auth.js");
    const { migrateState, validateImport, FORMAT_VERSION } = require("../storage.js");
    const { downloadBlob } = require("./utils.js");
    // Archives de sauvegarde vérifiables : le contenu est placé dans une enveloppe qui indique le logiciel, le type
    // (données complètes ou paramètres seuls), la version du format, l'établissement et une EMPREINTE SHA-256 du contenu.
    // À la restauration : empreinte recalculée (fichier altéré ou tronqué → refusé), version détectée (format plus récent
    // que le logiciel → refusé), structure contrôlée, établissement comparé, doublon détecté (données identiques).
    // Les anciens fichiers sans enveloppe (versions précédentes) restent acceptés, sans vérification d'empreinte.
    
    const FORMAT_ARCHIVE = 'gestschool-scolarite';
    const TYPES_ARCHIVE = { complet: 'Données complètes', parametres: 'Paramètres seuls' };
    
    const serialiser = (data) => JSON.stringify(data);
    const empreinte = (data) => sha256Hex(serialiser(data));
    
    // Empreinte d'un état pour la détection des doublons (le journal et l'horodatage d'export sont exclus)
    function empreinteDonnees(state) {
      const { journal, ...reste } = state || {};
      return sha256Hex(serialiser(reste));
    }
    
    // Paramètres de l'établissement : identité, en-tête, catégories, règles, comptes (sans leurs mouvements), référentiels de paie
    function extraireParametres(state) {
      const { logo, armoiries, ...config } = state.config;
      return {
        config: { ...config, logo: logo || '', armoiries: armoiries || '' },
        comptes: (state.comptes || []).map(({ historique, ...c }) => c),
        typesEmploye: state.typesEmploye || [],
        matieres: state.matieres || []
      };
    }
    
    function creerArchive(state, type = 'complet') {
      const data = type === 'parametres' ? extraireParametres(state) : state;
      return {
        application: 'GEST SCHOOL SCOLARITÉ', format: FORMAT_ARCHIVE, type, version: FORMAT_VERSION,
        exporteLe: new Date().toISOString(),
        etablissement: { id: state.config?.etablissementId || '', nom: state.config?.nom || '' },
        resume: type === 'complet' ? { eleves: state.eleves.length, inscriptions: state.inscriptions.length, paiements: state.paiements.length, depenses: state.depenses.length } : { comptes: (state.comptes || []).length },
        empreinte: empreinte(data),
        data
      };
    }
    
    function nomArchive(state, type = 'complet') {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const sigle = String(state.config?.sigle || 'etablissement').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'etablissement';
      return `gestschool-scolarite-${type === 'parametres' ? 'parametres' : 'sauvegarde'}-${sigle}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.note`;
    }
    
    function telechargerArchive(state, type = 'complet') {
      const archive = creerArchive(state, type);
      const nom = nomArchive(state, type);
      downloadBlob(nom, JSON.stringify(archive, null, 2), 'application/json');
      return { nom, archive };
    }
    
    // Lecture et vérification d'un fichier (texte). Lève une erreur explicite si le fichier n'est pas restaurable.
    // Retourne { type, version, legacy, etablissementId, etablissementNom, data (état migré ou paramètres), empreinte }
    function lireArchive(texte) {
      let parsed;
      try { parsed = JSON.parse(String(texte)); } catch (error) { throw new Error('Le fichier est illisible ou tronqué (JSON invalide).'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Le fichier ne contient pas de données de l’application.');
      if (parsed.format === FORMAT_ARCHIVE) {
        if (!TYPES_ARCHIVE[parsed.type]) throw new Error('Type d’archive inconnu.');
        if (!Number.isInteger(parsed.version) || parsed.version > FORMAT_VERSION) throw new Error(`Cette sauvegarde provient d’une version plus récente du logiciel (format ${parsed.version}) : mettez d’abord GEST SCHOOL SCOLARITÉ à jour.`);
        if (!parsed.data || typeof parsed.data !== 'object') throw new Error('Archive vide.');
        if (empreinte(parsed.data) !== parsed.empreinte) throw new Error('Contrôle d’intégrité échoué : le fichier a été modifié ou endommagé depuis son export. Restauration refusée.');
        if (parsed.type === 'parametres') {
          if (!parsed.data.config || typeof parsed.data.config !== 'object' || !Array.isArray(parsed.data.comptes)) throw new Error('Archive de paramètres incomplète.');
          return { type: 'parametres', version: parsed.version, legacy: false, etablissementId: parsed.etablissement?.id || '', etablissementNom: parsed.etablissement?.nom || '', data: parsed.data, empreinte: parsed.empreinte, exporteLe: parsed.exporteLe };
        }
        const probleme = validateImport(parsed.data);
        if (probleme) throw new Error(probleme);
        return { type: 'complet', version: parsed.version, legacy: false, etablissementId: parsed.data.config?.etablissementId || parsed.etablissement?.id || '', etablissementNom: parsed.data.config?.nom || '', data: migrateState(parsed.data), empreinte: parsed.empreinte, exporteLe: parsed.exporteLe };
      }
      // Ancien format : l'état brut, sans enveloppe ni empreinte
      const probleme = validateImport(parsed);
      if (probleme) throw new Error(probleme);
      const version = Number(parsed.formatVersion || 1);
      if (version > FORMAT_VERSION) throw new Error(`Données d’une version plus récente du logiciel (format ${version}).`);
      return { type: 'complet', version, legacy: true, etablissementId: parsed.config?.etablissementId || '', etablissementNom: parsed.config?.nom || '', data: migrateState(parsed), empreinte: '', exporteLe: '' };
    }
    
    function lireFichier(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { try { resolve(lireArchive(reader.result)); } catch (error) { reject(error); } };
        reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
        reader.readAsText(file);
      });
    }
    
    // Application d'une archive de paramètres : identité et règles remplacées (l'identifiant d'établissement est conservé),
    // comptes absents ajoutés (un compte existant n'est jamais supprimé ni renuméroté), référentiels de paie complétés.
    function appliquerParametres(state, parametres) {
      const { etablissementId, ...config } = parametres.config;
      state.config = { ...state.config, ...config, etablissementId: state.config.etablissementId };
      if (!config.logo) delete state.config.logo;
      if (!config.armoiries) delete state.config.armoiries;
      let ajoutes = 0;
      parametres.comptes.forEach((c) => {
        if (state.comptes.some((x) => x.libelle.toLocaleLowerCase('fr') === String(c.libelle || '').toLocaleLowerCase('fr'))) return;
        state.comptes.push({ ...c, id: state.comptes.reduce((m, x) => Math.max(m, x.id), 0) + 1, principal: false });
        ajoutes += 1;
      });
      ['typesEmploye', 'matieres'].forEach((key) => {
        (parametres[key] || []).forEach((item) => {
          const libelle = item.libelle || item.nom;
          if (state[key].some((x) => (x.libelle || x.nom) === libelle)) return;
          state[key].push({ ...item, id: state[key].reduce((m, x) => Math.max(m, x.id), 0) + 1 });
        });
      });
      return { comptesAjoutes: ajoutes };
    }
    
    Object.assign(exports, { FORMAT_ARCHIVE, TYPES_ARCHIVE, empreinte, empreinteDonnees, extraireParametres, creerArchive, nomArchive, telechargerArchive, lireArchive, lireFichier, appliquerParametres });
  };
  factories['./modules/cloud.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    const { notify } = require("./dialog.js");
    const { can, currentUser } = require("./auth.js");
    const { EDITEUR } = require("./editeur.js");
    const { creerArchive } = require("./archive.js");
    // Licence en ligne, synchronisation et mises à jour (application de bureau uniquement).
    // Le service tourne dans le processus principal d'Electron ; la page n'en reçoit que l'état, par le pont sécurisé
    // window.gestCloud (preload.js). Dans un navigateur, ce module ne fait rien.
    // Données envoyées : métadonnées techniques et diagnostics ; statistiques d'usage (nombres d'élèves, de classes,
    // d'années) seulement si le contrat le prévoit ET si l'établissement l'accepte ici. Jamais d'élèves, de paiements,
    // de montants ni de documents.
    
    const G = typeof window !== 'undefined' ? window.gestCloud : null;
    let etat = null;
    let maj = null;
    let averti = false;
    let majSignalee = null;
    let appState = null;
    
    const date = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
    const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—');
    function ilYa(iso) {
      if (!iso) return 'jamais';
      const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
      return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
    }
    const superAdmin = () => !!currentUser() && can('superadmin');
    
    /* ── Indicateur de la barre supérieure ── */
    function indicateur() {
      let b = document.getElementById('cloudIndicateur');
      if (!b) {
        const ancre = document.getElementById('helpBtn');
        if (!ancre) return;
        b = document.createElement('button');
        b.id = 'cloudIndicateur';
        b.type = 'button';
        b.addEventListener('click', ouvrirPanneau);
        ancre.before(b);
      }
      if (!etat) return;
      const l = etat.licence, s = etat.synchro;
      let ton = 'ok', icone = '☁', texte = `Synchronisé ${ilYa(s.derniere_synchro)}`;
      if (!etat.configure) { ton = 'neutre'; icone = '💻'; texte = 'Mode local'; }
      else if (l.etat === 'non_activee') { ton = 'neutre'; icone = '🔑'; texte = 'Licence non activée'; }
      else if (l.etat !== 'valide') { ton = 'ko'; icone = '⚠'; texte = l.libelle; }
      else if (s.en_cours) { icone = '⟳'; texte = 'Synchronisation…'; }
      else if (s.derniere_erreur) { ton = 'attente'; icone = '⇡'; texte = `Hors ligne · ${s.en_attente} en attente`; }
      const pastille = maj && ['disponible', 'pret'].includes(maj.statut);
      b.className = `cloud-indicateur ${ton}`;
      b.title = 'Licence, synchronisation et mises à jour';
      b.innerHTML = `<span aria-hidden="true">${icone}</span><span class="cloud-texte">${escapeHtml(texte)}</span>${pastille ? '<b class="cloud-pastille" title="Mise à jour disponible">1</b>' : ''}`;
    }
    
    /* ── Panneau ── */
    const ligne = (t, v) => `<tr><td>${escapeHtml(t)}</td><td>${v}</td></tr>`;
    
    function htmlLicence() {
      const l = etat.licence;
      const ton = l.etat === 'valide' ? 'ok' : ['non_configure', 'non_activee'].includes(l.etat) ? 'neutre' : 'ko';
      const besoinCle = ['non_activee', 'remplacee', 'invalide', 'installation_desactivee', 'revoquee'].includes(l.etat) || etat.reactivation_requise;
      const peutActiver = superAdmin() || l.action === 'bloquer';
      return `<section><h3>Licence</h3>
        <p class="cloud-etat ${ton}">${escapeHtml(l.libelle)}${l.action === 'bloquer' ? ' — utilisation suspendue' : ''}</p>
        ${etat.configure ? `<table class="cloud-table">
          ${l.client ? ligne('Établissement', escapeHtml(l.client)) : ''}
          ${l.type ? ligne('Type', escapeHtml(l.type)) : ''}
          ${l.etat !== 'non_activee' ? ligne('Expiration', l.expire_le ? escapeHtml(jour(l.expire_le)) : 'Aucune (perpétuelle)') : ''}
          ${l.hors_ligne_jusqu_au ? ligne('Fonctionnement hors ligne jusqu’au', escapeHtml(date(l.hors_ligne_jusqu_au))) : ''}
          ${ligne('Identifiant de l’installation', `<code>${escapeHtml(etat.installation_id)}</code>`)}
        </table>` : '<p class="cloud-note">Cette version n’est reliée à aucun service en ligne : l’application fonctionne entièrement sur ce poste.</p>'}
        ${etat.configure && besoinCle ? (peutActiver ? `<form class="cloud-activation" data-cloud="activer">
            <label for="cloudCle">Clé de licence</label>
            <div class="cloud-ligne"><input id="cloudCle" type="text" autocomplete="off" spellcheck="false" maxlength="40" placeholder="GSS-XXXXX-XXXXX-XXXXX-XXXXX" required>
            <button class="primary-btn" type="submit">Activer</button></div>
            <p class="cloud-note">Connexion Internet requise pour l’activation. La clé n’est pas conservée sur le poste.</p>
            <p class="cloud-erreur" id="cloudActivationMessage" role="alert"></p></form>` : '<p class="cloud-note">Seul le super administrateur peut activer la licence.</p>') : ''}
      </section>`;
    }
    
    function htmlSynchro() {
      if (!etat.configure) return '';
      const s = etat.synchro;
      return `<section><h3>Synchronisation</h3>
        <table class="cloud-table">
          ${ligne('Dernière synchronisation réussie', `${escapeHtml(date(s.derniere_synchro))} <small>(${escapeHtml(ilYa(s.derniere_synchro))})</small>`)}
          ${ligne('Événements en attente d’envoi', String(s.en_attente))}
          ${s.derniere_erreur ? ligne('Dernière erreur', `<span class="cloud-erreur">${escapeHtml(s.derniere_erreur.message)}</span> <small>${escapeHtml(date(s.derniere_erreur.le))}</small>`) : ''}
          ${s.prochaine_tentative ? ligne('Nouvel essai automatique', escapeHtml(date(s.prochaine_tentative))) : ''}
          ${s.perdus ? ligne('Événements non conservés (file pleine)', String(s.perdus)) : ''}
        </table>
        <p class="cloud-note">« Synchronisé » signifie que le poste a contacté le serveur à cette date ; ce n’est pas une connexion permanente.</p>
        <button class="primary-btn ghost" type="button" data-cloud="synchroniser" ${s.en_cours || etat.licence.etat === 'non_activee' ? 'disabled' : ''}>Synchroniser maintenant</button>
      </section>`;
    }
    
    function htmlMaj() {
      if (!maj) return '';
      const tete = `<p>Version installée : <strong>${escapeHtml(maj.version_actuelle)}</strong>${maj.version_disponible ? ` · disponible : <strong>${escapeHtml(maj.version_disponible)}</strong>` : ''}${maj.obligatoire ? ' <span class="cloud-badge-ko">obligatoire</span>' : ''}</p>`;
      const notes = maj.notes ? `<details class="cloud-notes" open><summary>Notes de version</summary><div>${escapeHtml(maj.notes).replace(/\n/g, '<br>')}</div></details>` : '';
      const erreur = maj.erreur ? `<p class="cloud-erreur">${escapeHtml(maj.erreur)}</p>` : '';
      const bouton = (action, libelle, principal = false) => `<button type="button" class="${principal ? 'primary-btn' : 'primary-btn ghost'}" data-cloud="${action}">${libelle}</button>`;
      let corps;
      switch (maj.statut) {
        case 'non_configure': corps = '<p class="cloud-note">Mises à jour automatiques non configurées dans cette version : installez les nouvelles versions fournies par l’éditeur.</p>'; break;
        case 'portable': corps = `<p class="cloud-note">Version portable : elle ne se met pas à jour seule.${etat?.versions?.disponible ? ` La version ${escapeHtml(etat.versions.derniere)} est disponible auprès de l’éditeur.` : ''}</p>`; break;
        case 'verification': corps = '<p>Recherche de mise à jour…</p>'; break;
        case 'disponible': corps = `${notes}${erreur}<div class="cloud-ligne">${bouton('telecharger', 'Télécharger', true)}${maj.differable ? bouton('differer', 'Plus tard (24 h)') : ''}</div>`; break;
        case 'telechargement': {
          const p = maj.progression || {};
          corps = `<div class="cloud-progression" role="progressbar" aria-valuenow="${p.pourcentage || 0}" aria-valuemin="0" aria-valuemax="100"><div style="width:${p.pourcentage || 0}%"></div></div>
            <p class="cloud-note">${p.pourcentage || 0} %${p.total ? ` · ${(p.transferes / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} Mo` : ''}</p>`;
          break;
        }
        case 'pret': corps = `${notes}<p class="cloud-note">La mise à jour est téléchargée. Une sauvegarde complète vérifiée est faite avant l’installation, puis l’application redémarre. Vos données et votre licence sont conservées.</p>
          <div class="cloud-ligne">${bouton('installer', 'Installer et redémarrer', true)}${maj.differable ? bouton('fermer', 'Plus tard') : ''}</div>${erreur}`; break;
        case 'a_jour': corps = `<p class="cloud-etat ok">L’application est à jour.</p>${bouton('verifier', 'Rechercher une mise à jour')}`; break;
        default: corps = `${erreur}${bouton('verifier', 'Rechercher une mise à jour')}`;
      }
      return `<section><h3>Mises à jour</h3>${tete}${corps}</section>`;
    }
    
    function htmlConfidentialite() {
      if (!etat.configure) return '';
      return `<section><h3>Confidentialité</h3>
        <p class="cloud-note">Sont transmis : l’identifiant de l’installation, la version, l’état technique et les erreurs de l’application.
        Aucune donnée d’élève, aucun paiement, aucun montant, aucun document n’est envoyé.</p>
        ${etat.partage_usage ? `<label class="cloud-consentement"><input type="checkbox" data-cloud="consentement" ${etat.consentement_usage ? 'checked' : ''} ${superAdmin() ? '' : 'disabled'}>
          Partager aussi des statistiques globales d’usage (nombre d’élèves, de classes, d’années) avec l’éditeur</label>` : '<p class="cloud-note">Statistiques d’usage : non prévues par votre contrat (non envoyées).</p>'}
      </section>`;
    }
    
    function htmlPanneau() {
      if (!etat) return '<p>Chargement…</p>';
      return `${htmlLicence()}${htmlSynchro()}${htmlMaj()}${htmlConfidentialite()}`;
    }
    
    function ouvrirPanneau() {
      let fond = document.getElementById('cloudFenetre');
      if (!fond) {
        fond = document.createElement('div');
        fond.id = 'cloudFenetre';
        fond.className = 'cloud-fenetre';
        fond.innerHTML = `<div class="cloud-carte" role="dialog" aria-modal="true" aria-labelledby="cloudTitre">
          <header><h2 id="cloudTitre">Licence, synchronisation et mises à jour</h2><button type="button" class="cloud-fermer" data-cloud="fermer" aria-label="Fermer">✕</button></header>
          <div class="cloud-corps" id="cloudCorps"></div></div>`;
        fond.addEventListener('click', surClic);
        fond.addEventListener('change', surChangement);
        fond.addEventListener('submit', surEnvoi);
        document.body.appendChild(fond);
      }
      fond.hidden = false;
      rafraichirPanneau(true);
    }
    function fermerPanneau() { const f = document.getElementById('cloudFenetre'); if (f) f.hidden = true; }
    
    function rafraichirPanneau(force = false) {
      const corps = document.getElementById('cloudCorps');
      if (!corps || (corps.closest('[hidden]') && !force)) return;
      const saisie = document.getElementById('cloudCle')?.value;
      const message = document.getElementById('cloudActivationMessage')?.textContent;
      corps.innerHTML = htmlPanneau();
      if (saisie && document.getElementById('cloudCle')) document.getElementById('cloudCle').value = saisie;
      if (message && document.getElementById('cloudActivationMessage')) document.getElementById('cloudActivationMessage').textContent = message;
    }
    
    /* ── Actions ── */
    async function surEnvoi(e) {
      if (e.target.dataset.cloud !== 'activer') return;
      e.preventDefault();
      const champ = document.getElementById('cloudCle');
      const msg = document.getElementById('cloudActivationMessage');
      msg.textContent = 'Activation en cours…';
      const r = await G.activer(champ.value.trim());
      champ.value = '';
      if (r.ok) { msg.textContent = ''; notify('success', `Licence activée : ${r.licence?.libelle || ''}`); }
      else if (document.getElementById('cloudActivationMessage')) document.getElementById('cloudActivationMessage').textContent = r.message;
    }
    
    async function surClic(e) {
      if (e.target.id === 'cloudFenetre') { fermerPanneau(); return; }
      const action = e.target.closest('[data-cloud]')?.dataset.cloud;
      if (!action || e.target.closest('[data-cloud]').tagName === 'FORM' || action === 'consentement') return;
      if (action === 'fermer') fermerPanneau();
      else if (action === 'synchroniser') {
        const r = await G.synchroniser();
        if (r?.statut === 'ok') notify('success', r.envoyes ? `Synchronisation réussie : ${r.envoyes} événement(s) envoyé(s)` : 'Synchronisation réussie');
        else if (r?.message) notify('warning', r.message);
      } else if (action === 'verifier') G.majVerifier();
      else if (action === 'telecharger') G.majTelecharger();
      else if (action === 'differer') { const r = await G.majDifferer(); if (r.ok) { notify('info', 'Mise à jour différée de 24 heures.'); fermerPanneau(); } }
      else if (action === 'installer') {
        const r = await G.majInstaller();
        notify(r.ok ? 'info' : 'error', r.ok ? 'Sauvegarde effectuée : l’application va redémarrer.' : r.message);
      }
    }
    
    async function surChangement(e) {
      if (e.target.dataset.cloud !== 'consentement' || !superAdmin()) return;
      await G.consentement(e.target.checked);
      envoyerUsage();
    }
    
    // Statistiques globales (nombres seulement), uniquement avec le double accord contrat + établissement
    function envoyerUsage() {
      if (!etat?.partage_usage || !etat?.consentement_usage || !appState) return;
      G.usage({ eleves: (appState.eleves || []).length, classes: (appState.classes || []).length, annees: (appState.annees || []).length });
    }
    
    /* ── Blocage (uniquement si la politique de l'éditeur le demande) ── */
    function blocage() {
      let v = document.getElementById('cloudBlocage');
      if (!etat || etat.licence.action !== 'bloquer') { v?.remove(); return; }
      if (!v) {
        v = document.createElement('div');
        v.id = 'cloudBlocage';
        v.className = 'cloud-blocage';
        v.addEventListener('click', (e) => { if (e.target.closest('[data-cloud="ouvrir"]')) ouvrirPanneau(); });
        document.body.appendChild(v);
      }
      v.innerHTML = `<div class="cloud-blocage-carte"><div class="cloud-blocage-icone" aria-hidden="true">🔒</div><h2>${escapeHtml(etat.licence.libelle)}</h2>
        <p>L’utilisation de l’application est suspendue. Vos données sont intactes et conservées sur ce poste.</p>
        <p>Contactez l’éditeur : <strong>${escapeHtml(EDITEUR.email)}</strong> · ${escapeHtml(EDITEUR.telephones[0])}</p>
        <button class="primary-btn" type="button" data-cloud="ouvrir">Saisir une clé ou synchroniser</button></div>`;
    }
    
    function surEtat(e) {
      etat = e;
      indicateur(); blocage(); rafraichirPanneau();
      if (!averti && e.licence.action === 'avertir' && e.licence.etat !== 'valide') {
        averti = true;
        notify('warning', `${e.licence.libelle}. Ouvrez « Licence et mises à jour » (barre du haut) pour la régulariser.`);
      }
    }
    function surMaj(m) {
      maj = m;
      indicateur(); rafraichirPanneau();
      if (m.statut === 'disponible' && majSignalee !== m.version_disponible) {
        majSignalee = m.version_disponible;
        if (!m.obligatoire) notify('info', `Mise à jour disponible : version ${m.version_disponible}.`);
      }
      if (m.statut === 'pret' && m.obligatoire) ouvrirPanneau();
    }
    
    // Appelé au démarrage de l'interface (après la connexion)
    function initCloud(state) {
      if (!G || appState) return;
      appState = state;
      G.surEtat(surEtat);
      G.surMaj(surMaj);
      G.etat().then(surEtat);
      G.majEtat().then(surMaj);
      // Sauvegarde avant mise à jour : archive complète vérifiable (même format que « Sauvegarde complète »)
      G.surDemandeSauvegarde(() => JSON.stringify(creerArchive(appState, 'complet')));
      window.addEventListener('error', (ev) => G.signaler({ niveau: 'erreur', message: ev.message, source: String(ev.filename || '').split('/').pop(), ligne: ev.lineno }));
      window.addEventListener('unhandledrejection', (ev) => G.signaler({ niveau: 'erreur', message: String(ev.reason?.message || ev.reason || 'Promesse rejetée') }));
      setInterval(() => { indicateur(); envoyerUsage(); }, 60000);
      setTimeout(envoyerUsage, 10000);
    }
    
    const cloudActif = () => !!G;
    const ouvrirCloud = () => ouvrirPanneau();
    
    Object.assign(exports, { initCloud, cloudActif, ouvrirCloud });
  };
})(window.IBK_APP.factories);

