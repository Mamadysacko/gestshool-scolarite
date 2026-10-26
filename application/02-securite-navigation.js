// GEST SCHOOL SCOLARITÉ · 02-securite-navigation.js
// Sécurité et navigation : comptes, compte propriétaire, rôles, licences, éditeur, connexion, menus, sous-onglets et formulaires repliés
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./modules/editeur.js, ./modules/auth.js, ./modules/licences.js, ./modules/licences-view.js, ./modules/login-view.js, ./modules/navigation.js, ./modules/formulaires.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».


((factories) => {
  factories['./modules/editeur.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    // Identité de l'entreprise qui conçoit et développe GEST SCHOOL SCOLARITÉ (source unique : centre d'aide,
    // écran de connexion). La fenêtre « À propos » de l'application de bureau (electron/main.js) reprend ces informations.
    const EDITEUR = {
      nom: 'SOCIÉTÉ KJS GROUP SARL',
      activites: 'Solutions numériques • Réseaux & systèmes • Formation',
      devise: 'Vision — Stratégie — Action',
      email: 'kjsgroup2025@gmail.com',
      telephones: ['+224 664-33-33-66'],
      logo: './assets/logo%20entreprise.png',
      fondation: 2025,
      presentation: [
        'Fondée en 2025, la Société KJS.Group accompagne les entreprises, startups et jeunes talents dans leur développement au sein d’un monde numérique connecté. Nous intervenons dans la conception de solutions logicielles, la gestion de bases de données, le déploiement de systèmes ERP & CRM, l’installation de réseaux informatiques, ainsi que la formation professionnelle en informatique, réseaux et technologies Microsoft.',
        'KJS.Group a été fondée par trois jeunes diplômés en Génie Informatique, Télécommunications et Génie Logiciel, certifiés Cisco, unis par une vision commune : créer un écosystème numérique durable où les entreprises et les talents évoluent ensemble.'
      ],
      services: [
        'Conception et développement d’applications web et mobiles sur mesure',
        'Architecture et gestion de bases de données',
        'Analyse des besoins et rédaction de cahiers des charges',
        'Intégration, maintenance et évolution des solutions',
        'Optimisation et sécurisation applicative',
        'Conseil et expertise en ingénierie logicielle'
      ]
    };
    
    const APPLICATION = { nom: 'GEST SCHOOL SCOLARITÉ', version: '4.2.0' };
    
    // Fiche « À propos de l'éditeur » (centre d'aide)
    function editeurHtml() {
      const e = EDITEUR;
      return `<section class="panel editeur-panel" id="aide-editeur" aria-labelledby="editeur-titre">
        <div class="editeur-entete">
          <img class="editeur-logo" src="${e.logo}" alt="Logo de ${escapeHtml(e.nom)}" width="120" height="125" />
          <div>
            <span class="eyebrow">Éditeur du logiciel</span>
            <h3 id="editeur-titre">${escapeHtml(e.nom)}</h3>
            <p class="editeur-activites">${escapeHtml(e.activites)}</p>
            <p class="editeur-devise">${escapeHtml(e.devise)}</p>
            <p class="editeur-contacts">
              <a href="mailto:${escapeHtml(e.email)}">✉ ${escapeHtml(e.email)}</a>
              ${e.telephones.map((t) => `<a href="tel:${escapeHtml(t.replace(/[^+\d]/g, ''))}">☎ ${escapeHtml(t)}</a>`).join('')}
            </p>
          </div>
        </div>
        ${e.presentation.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        <h4>Nos services</h4>
        <ul class="editeur-services">${e.services.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        <p class="meta">${escapeHtml(APPLICATION.nom)} — version ${escapeHtml(APPLICATION.version)} · conçu et développé par ${escapeHtml(e.nom)}. Assistance, maintenance et clés de licence : ${escapeHtml(e.email)}.</p>
      </section>`;
    }
    
    // Mention courte (écran de connexion)
    function editeurMentionHtml() {
      return `<p class="login-editeur"><img src="${EDITEUR.logo}" alt="" width="22" height="23" /> Conçu et développé par <b>${escapeHtml(EDITEUR.nom)}</b></p>`;
    }
    
    Object.assign(exports, { EDITEUR, APPLICATION, editeurHtml, editeurMentionHtml });
  };
  factories['./modules/auth.js'] = (require, exports) => {
    const { confirmDialog } = require("./dialog.js");
    const { ALL_PAGES } = require("./navigation.js");
    // Authentification et rôles côté navigateur. Les comptes sont stockés dans leur propre clé (ils ne figurent
    // ni dans les exports, ni dans les sauvegardes, et une réinitialisation des données ne les efface pas).
    // Mots de passe : jamais en clair, hachés avec sel. Cela protège contre les erreurs de manipulation et les
    // accès occasionnels, mais ne remplace pas une authentification serveur.
    const USERS_KEY = 'ibk_users_v1';
    const SESSION_KEY = 'ibk_session_v1';
    const LOCK_KEY = 'ibk_login_lock_v1';
    const MAX_ATTEMPTS = 5;
    const LOCK_MS = 60 * 1000;
    const HASH_ROUNDS = 2000;
    
    // ---------- Rôles et permissions ----------
    // Un rôle = des pages consultables + des PERMISSIONS D'ACTION (encaisser, annuler, modifier les tarifs…).
    // Les permissions sont vérifiées dans la couche métier (fonction exiger()), pas seulement par l'affichage des boutons.
    // Les rôles sont stockés à part, comme les comptes : une réinitialisation des données ne les efface pas.
    // Super administrateur et Administrateur ont toujours un accès complet ; seul un super administrateur gère les
    // comptes super administrateur et les opérations système (réinitialisation, restauration, import).
    const ROLES_KEY = 'ibk_roles_v1';
    // Configuration, comptes et sauvegardes : réservés aux administrateurs (le journal d'audit peut être ouvert à un auditeur)
    const ADMIN_ONLY_PAGES = ['config', 'config-utilisateurs', 'config-finances', 'config-donnees', 'licences'];
    const ROLES_ADMIN = ['superadmin', 'admin'];
    const estRoleAdmin = (role) => ROLES_ADMIN.includes(role);
    
    // Catalogue des permissions d'action : [identifiant, libellé, description, sensible]
    // Sensible : action d'exception (annulation, correction, réouverture…). Un rôle qui ne la possède pas peut
    // l'obtenir ponctuellement par l'accord d'un administrateur (identifiants saisis, opération journalisée).
    const PERMISSIONS = [
      ['eleves.gerer', 'Élèves et inscriptions', 'Créer et modifier les élèves, inscriptions et réinscriptions', false],
      ['scolarite.parametrer', 'Années, classes et tarifs', 'Créer et modifier les années scolaires, classes et tarifs', false],
      ['paiements.encaisser', 'Encaisser', 'Enregistrer les paiements et les règlements en attente, confirmer un encaissement', false],
      ['paiements.annuler', 'Annuler un paiement', 'Annuler un paiement ou rejeter un règlement en attente (motif obligatoire)', true],
      ['paiements.corriger', 'Corriger un paiement', 'Corriger moyen, compte, référence, date d’un paiement (motif obligatoire)', true],
      ['reductions.accorder', 'Accorder une remise', 'Remise dans la limite fixée par le tarif de la classe', false],
      ['reductions.exceptionnelles', 'Bourses et exonérations', 'Accorder une bourse ou une exonération, retirer une réduction', true],
      ['depenses.saisir', 'Saisir des dépenses', 'Enregistrer les dépenses et les dépenses récurrentes', false],
      ['depenses.corriger', 'Corriger ou annuler une dépense', 'Correction ou annulation motivée d’une dépense', true],
      ['tresorerie.virements', 'Virements internes', 'Transférer de l’argent entre caisse et comptes', false],
      ['caisse.operer', 'Ouvrir et fermer la caisse', 'Ouverture, comptage, fermeture de caisse et rapprochement bancaire', false],
      ['tresorerie.corriger', 'Rouvrir une caisse / annuler un virement', 'Réouverture d’une journée clôturée, annulation d’un virement', true],
      ['paie.gerer', 'Paie du personnel', 'Personnel, paie mensuelle, avances', false],
      ['rapports.exporter', 'Exporter et imprimer', 'Exports PDF, Excel, CSV des listes, rapports et états', false]
    ];
    const PERMISSION_IDS = PERMISSIONS.map(([id]) => id);
    const PERMISSIONS_SENSIBLES = PERMISSIONS.filter((p) => p[3]).map(([id]) => id);
    const permissionLabel = (id) => PERMISSIONS.find(([p]) => p === id)?.[1] || id;
    // Droits accordés aux anciens rôles « saisie » (avant les permissions détaillées) : les actions d'exception
    // continuaient de demander l'accord d'un administrateur, ce qui reste le cas.
    const SAISIE_HISTORIQUE = ['eleves.gerer', 'scolarite.parametrer', 'paiements.encaisser', 'reductions.accorder', 'depenses.saisir', 'tresorerie.virements', 'caisse.operer', 'paie.gerer'];
    const PAGES_GESTION = ALL_PAGES.filter((p) => !ADMIN_ONLY_PAGES.includes(p) && p !== 'config-journal');
    const PAGES_PAIE = ['paie-dashboard', 'personnel', 'affectations', 'remunerations', 'paie', 'avances', 'paie-rapports'];
    
    const DEFAULT_ROLES = [
      { id: 'superadmin', label: 'Super administrateur', description: 'Administre l’application : comptes, rôles, sauvegardes, restauration, réinitialisation.', pages: ALL_PAGES, permissions: PERMISSION_IDS, systeme: true },
      { id: 'admin', label: 'Administrateur de l’établissement', description: 'Accès complet à l’établissement ; les opérations système restent au super administrateur.', pages: ALL_PAGES, permissions: PERMISSION_IDS, systeme: true },
      { id: 'directeur', label: 'Directeur', description: 'Pilotage, décisions d’exception (annulations, bourses, réouvertures) et rapports.', pages: [...PAGES_GESTION, 'config-journal'], permissions: PERMISSION_IDS, systeme: true },
      { id: 'comptable', label: 'Comptable', description: 'Scolarité, tarifs, encaissements, dépenses, trésorerie, paie et rapports.', pages: ['dashboard', 'analyse', 'annees', 'classes', 'eleves', 'inscriptions', 'tarifs', 'paiements', 'creances', 'encaissements-analyse', 'dettes', 'depenses', 'caisse', 'comptes', 'etats', 'paie-dashboard', 'personnel', 'affectations', 'remunerations', 'paie', 'avances', 'paie-rapports', 'rapports', 'aide'], permissions: [...SAISIE_HISTORIQUE, 'rapports.exporter'], systeme: true },
      { id: 'caissier', label: 'Caissier', description: 'Encaissements, caisse et dépenses courantes ; ne modifie ni les tarifs ni les historiques.', pages: ['dashboard', 'eleves', 'inscriptions', 'paiements', 'creances', 'depenses', 'caisse', 'comptes', 'aide'], permissions: ['paiements.encaisser', 'depenses.saisir', 'caisse.operer', 'rapports.exporter'], systeme: true },
      { id: 'lecture', label: 'Auditeur (lecture seule)', description: 'Consulte et exporte les états financiers et le journal d’audit ; aucune saisie, pas d’accès à la paie.', pages: [...PAGES_GESTION.filter((p) => !PAGES_PAIE.includes(p)), 'config-journal'], permissions: ['rapports.exporter'], systeme: true }
    ];
    
    // Libellés et pages par rôle : objets partagés, mis à jour sur place à chaque modification
    const ROLES = {};
    const ROLE_PAGES = {};
    let roleDefs = [];
    
    // Pages ajoutées après la création d'un rôle : accordées une fois aux rôles qui ont déjà la page « parente »
    // (version des pages mémorisée dans le rôle, pour qu'un retrait volontaire ne soit jamais annulé)
    const PAGES_AJOUTEES = [
      { version: 2, page: 'remunerations', parente: 'personnel' },
      { version: 3, page: 'creances', parente: 'paiements' },
      { version: 3, page: 'comptes', parente: 'depenses' },
      { version: 4, page: 'caisse', parente: 'depenses' },
      { version: 4, page: 'etats', parente: 'rapports' }
    ];
    const VERSION_PAGES = 4;
    
    function normaliserRole(raw) {
      const label = String(raw.label || raw.id).trim().slice(0, 40) || String(raw.id);
      const description = String(raw.description || '').trim().slice(0, 200);
      if (estRoleAdmin(raw.id)) {
        const def = DEFAULT_ROLES.find((d) => d.id === raw.id);
        return { id: raw.id, label: label || def.label, description: description || def.description, pages: [...ALL_PAGES], permissions: [...PERMISSION_IDS], write: true, export: true, systeme: true, versionPages: VERSION_PAGES };
      }
      const pages = [...new Set((Array.isArray(raw.pages) ? raw.pages : []).filter((p) => ALL_PAGES.includes(p)))];
      PAGES_AJOUTEES.forEach((a) => { if (Number(raw.versionPages || 1) < a.version && pages.includes(a.parente) && !pages.includes(a.page)) pages.push(a.page); });
      // Ancien rôle sans permissions détaillées : déduites des cases « saisie » et « export »
      const permissions = Array.isArray(raw.permissions)
        ? [...new Set(raw.permissions.filter((p) => PERMISSION_IDS.includes(p)))]
        : [...(raw.write ? SAISIE_HISTORIQUE : []), ...(raw.export ? ['rapports.exporter'] : [])];
      return {
        id: String(raw.id), label, description,
        pages: pages.filter((p) => !ADMIN_ONLY_PAGES.includes(p)), permissions,
        // Indicateurs dérivés (affichage) : saisie = au moins une action autre que l'export
        write: permissions.some((p) => p !== 'rapports.exporter'), export: permissions.includes('rapports.exporter'),
        systeme: Boolean(raw.systeme), versionPages: VERSION_PAGES
      };
    }
    
    function appliquerRoles(list) {
      const defs = list.map(normaliserRole);
      // Les rôles de base existent toujours : un rôle effacé ou une donnée abîmée ne peut pas bloquer l'accès
      DEFAULT_ROLES.forEach((d, i) => { if (!defs.some((r) => r.id === d.id)) defs.splice(Math.min(i, defs.length), 0, normaliserRole(d)); });
      roleDefs = defs;
      Object.keys(ROLES).forEach((k) => delete ROLES[k]);
      Object.keys(ROLE_PAGES).forEach((k) => delete ROLE_PAGES[k]);
      defs.forEach((r) => { ROLES[r.id] = r.label; ROLE_PAGES[r.id] = r.pages; });
    }
    
    function loadRoles() {
      let list = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(ROLES_KEY) || 'null');
        if (Array.isArray(parsed)) list = parsed.filter((r) => r && typeof r === 'object' && r.id);
      } catch (error) { list = []; }
      appliquerRoles(list.length ? list : DEFAULT_ROLES);
      return roleList();
    }
    
    function saveRoles() {
      localStorage.setItem(ROLES_KEY, JSON.stringify(roleDefs));
    }
    
    function roleList() {
      const users = loadUsers();
      return roleDefs.map((r) => ({ ...r, pages: [...r.pages], permissions: [...r.permissions], utilisateurs: users.filter((u) => u.role === r.id).length }));
    }
    
    function roleOf(id) {
      return roleDefs.find((r) => r.id === id) || null;
    }
    
    // Création (sans id) ou modification d'un rôle. Les rôles administrateurs ne peuvent qu'être renommés.
    // `write` / `export` (anciens formulaires) sont acceptés et convertis en permissions.
    function saveRole({ id = '', label, pages = [], permissions, write, export: exp, description }) {
      exiger('admin');
      const nom = String(label || '').trim();
      if (!nom) throw new Error('Donnez un nom au rôle.');
      if (roleDefs.some((r) => r.id !== id && r.label.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) throw new Error('Un rôle porte déjà ce nom.');
      const existing = id ? roleOf(id) : null;
      if (id && !existing) throw new Error('Rôle introuvable.');
      if (id === 'superadmin' && !estSuperAdmin()) throw new Error('Seul un super administrateur peut modifier ce rôle.');
      const allowed = (Array.isArray(pages) ? pages : []).filter((p) => ALL_PAGES.includes(p) && !ADMIN_ONLY_PAGES.includes(p));
      if (!estRoleAdmin(id) && !allowed.length) throw new Error('Cochez au moins une page accessible.');
      const perms = Array.isArray(permissions) ? permissions : [...(write ? SAISIE_HISTORIQUE : []), ...(exp ? ['rapports.exporter'] : [])];
      let role;
      if (existing) {
        role = normaliserRole({ ...existing, label: nom, pages: allowed, permissions: perms, description: description ?? existing.description });
        roleDefs[roleDefs.indexOf(existing)] = role;
      } else {
        const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'role';
        let newId = base;
        for (let n = 2; roleOf(newId); n += 1) newId = `${base}-${n}`;
        role = normaliserRole({ id: newId, label: nom, pages: allowed, permissions: perms, description, systeme: false });
        roleDefs.push(role);
      }
      saveRoles();
      appliquerRoles(roleDefs);
      return roleOf(role.id);
    }
    
    function deleteRole(id) {
      exiger('admin');
      const role = roleOf(id);
      if (!role) throw new Error('Rôle introuvable.');
      if (role.systeme) throw new Error('Les rôles de base ne peuvent pas être supprimés (leurs droits restent modifiables).');
      const count = loadUsers().filter((u) => u.role === id).length;
      if (count) throw new Error(`${count} utilisateur(s) ont ce rôle : attribuez-leur d’abord un autre rôle.`);
      roleDefs = roleDefs.filter((r) => r.id !== id);
      saveRoles();
      appliquerRoles(roleDefs);
      return role;
    }
    
    // Rôles de base : droits d'origine rétablis ; les rôles personnalisés sont conservés
    function resetRoles() {
      exiger('admin');
      appliquerRoles([...DEFAULT_ROLES, ...roleDefs.filter((r) => !r.systeme)]);
      saveRoles();
      return roleList();
    }
    
    // ---------- SHA-256 (implémentation autonome, synchrone) ----------
    const K = [];
    const H0 = [];
    (function initConstants() {
      let n = 2;
      while (K.length < 64) {
        let prime = true;
        for (let i = 2; i * i <= n; i += 1) if (n % i === 0) { prime = false; break; }
        if (prime) {
          if (H0.length < 8) H0.push((Math.pow(n, 1 / 2) * 4294967296) | 0);
          K.push((Math.pow(n, 1 / 3) * 4294967296) | 0);
        }
        n += 1;
      }
    }());
    
    function sha256Hex(text) {
      const data = new TextEncoder().encode(text);
      const length = data.length;
      const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
      padded.set(data);
      padded[length] = 0x80;
      const view = new DataView(padded.buffer);
      view.setUint32(padded.length - 8, Math.floor((length * 8) / 4294967296));
      view.setUint32(padded.length - 4, (length * 8) >>> 0);
      const h = H0.slice();
      const w = new Array(64);
      const rotr = (x, n) => (x >>> n) | (x << (32 - n));
      for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i += 1) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i += 1) {
          const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
      }
      return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }
    
    function hashPassword(password, salt) {
      let digest = `${salt}:${password}`;
      for (let i = 0; i < HASH_ROUNDS; i += 1) digest = sha256Hex(`${salt}${digest}`);
      return digest;
    }
    
    function newSalt() {
      const bytes = new Uint8Array(12);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
      else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    
    // ---------- Compte propriétaire (éditeur) ----------
    // Compte de l'éditeur de GEST SCHOOL SCOLARITÉ, présent dans toute installation (comme dans GEST SCHOOL) : super
    // administrateur racine de la hiérarchie, seul habilité à gérer le catalogue des clés de licence. Il ne peut être ni
    // supprimé, ni désactivé, ni rétrogradé, et seul lui-même peut changer son mot de passe. Le mot de passe n'est JAMAIS
    // écrit en clair dans le logiciel : seule son empreinte (SHA-256 salé, 2 000 itérations) figure ici.
    // Chaque connexion de ce compte est journalisée ; son existence est indiquée aux établissements (documentation).
    const PROPRIETAIRE = {
      username: 'makossagesshool',
      nom: 'Makossa GestSchool (éditeur)',
      salt: '24e2950cab529cc7453851bb3795935e',
      hash: 'e011a0b176c482a4beca0397ba34625147831bdbeb4ac7d07db5ae5f0907e2fd'
    };
    
    // Garantit la présence du compte propriétaire (sans écraser un mot de passe qu'il aurait lui-même changé)
    function assurerProprietaire(users) {
      let changed = false;
      let p = users.find((u) => u.proprietaire);
      // Un compte ordinaire portant déjà cet identifiant est renommé (aucune usurpation possible)
      users.filter((u) => !u.proprietaire && u.username === PROPRIETAIRE.username).forEach((u) => { u.username = `${u.username}-${u.id}`; changed = true; });
      if (!p) {
        p = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: PROPRIETAIRE.username, nom: PROPRIETAIRE.nom, role: 'superadmin', salt: PROPRIETAIRE.salt, hash: PROPRIETAIRE.hash, actif: true, proprietaire: true, etablissementId: '*', creePar: null, creeLe: new Date().toISOString() };
        users.push(p);
        changed = true;
      }
      const attendu = { username: PROPRIETAIRE.username, role: 'superadmin', actif: true, etablissementId: '*', creePar: null };
      Object.entries(attendu).forEach(([k, v]) => { if (p[k] !== v) { p[k] = v; changed = true; } });
      if (!p.hash || !p.salt) { p.salt = PROPRIETAIRE.salt; p.hash = PROPRIETAIRE.hash; changed = true; }
      return changed;
    }
    
    // ---------- Établissement de l'installation ----------
    // Chaque base de données porte un identifiant d'établissement (config.etablissementId) ; chaque compte est rattaché
    // à cet identifiant. Un compte d'un autre établissement ne peut pas se connecter, et l'import des données d'un autre
    // établissement exige l'accord explicite d'un super administrateur. Le compte propriétaire vaut pour tous.
    let etablissement = '';
    
    function definirEtablissement(id) {
      etablissement = String(id || '');
      const users = loadUsers();
      let changed = assurerProprietaire(users);
      // Comptes des versions précédentes : rattachés à l'établissement de l'installation
      users.forEach((u) => { if (!u.etablissementId && etablissement) { u.etablissementId = etablissement; changed = true; } });
      const locaux = users.filter((u) => !u.proprietaire && duMemeEtablissement(u));
      // Il existe toujours un super administrateur de l'établissement : le plus ancien administrateur actif est promu
      if (locaux.length && !locaux.some((u) => u.role === 'superadmin' && u.actif)) {
        const promu = locaux.filter((u) => u.actif && u.role === 'admin').sort((a, b) => a.id - b.id)[0];
        if (promu) { promu.role = 'superadmin'; changed = true; securityEvent({ action: 'promotion', detail: `${promu.nom} devient super administrateur (mise à niveau des rôles)` }); }
      }
      // Hiérarchie : les comptes sans créateur connu sont rattachés au premier super administrateur de l'établissement
      const racine = locaux.filter((u) => u.role === 'superadmin').sort((a, b) => a.id - b.id)[0];
      locaux.forEach((u) => {
        if (u === racine) { if (u.creePar !== null) { u.creePar = null; changed = true; } return; }
        if (!racine || u.creePar === undefined || (u.creePar !== null && !users.some((x) => x.id === u.creePar))) { if (racine && u.creePar !== racine.id) { u.creePar = racine.id; changed = true; } }
      });
      if (changed) saveUsers(users);
    }
    
    function duMemeEtablissement(u) {
      return Boolean(u.proprietaire) || !etablissement || !u.etablissementId || u.etablissementId === etablissement;
    }
    
    // Import validé des données d'un autre établissement : les comptes de cette installation y sont rattachés
    function rattacherComptes(nouvelId) {
      exiger('superadmin');
      const users = loadUsers();
      users.forEach((u) => { if (!u.proprietaire) u.etablissementId = String(nouvelId); });
      saveUsers(users);
      etablissement = String(nouvelId);
      securityEvent({ action: 'rattachement', detail: `Comptes rattachés à l’établissement ${String(nouvelId).slice(0, 8)}… après import` });
    }
    
    // ---------- Comptes ----------
    function loadUsers() {
      try {
        const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) { return []; }
    }
    
    function saveUsers(users) {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    
    // Comptes de l'établissement (le compte propriétaire n'en fait pas partie : au premier lancement, l'établissement
    // crée toujours son propre super administrateur)
    function hasUsers() { return loadUsers().some((u) => !u.proprietaire && duMemeEtablissement(u)); }
    
    function publicUsers() {
      return loadUsers().filter(duMemeEtablissement).map(({ id, username, nom, role, actif, creeLe, proprietaire, creePar }) => ({ id, username, nom, role, actif, creeLe, proprietaire: Boolean(proprietaire), creePar: creePar ?? null }));
    }
    
    function passwordProblem(password) {
      if (String(password || '').length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
      return '';
    }
    
    // Hiérarchie (comme GEST SCHOOL) : chacun ne gère que les comptes qu'il a créés, directement ou par délégation ;
    // jamais lui-même, un pair, un supérieur, ni le compte propriétaire. Le propriétaire gère tous les autres comptes.
    function peutGererCompte(cible, users = loadUsers()) {
      if (!controle || elevation) return !cible?.proprietaire;
      const me = currentUser();
      if (!me || !cible || cible.proprietaire) return false;
      if (me.proprietaire) return true;
      if (cible.id === me.id) return false;
      let parent = cible.creePar;
      for (let n = 0; parent !== null && parent !== undefined && n < 500; n += 1) {
        if (parent === me.id) return true;
        parent = users.find((u) => u.id === parent)?.creePar;
      }
      return false;
    }
    
    // Gestion d'un compte : administrateur requis, compte subordonné, rôle super administrateur attribué par un super administrateur
    function exigerGestionCompte(cible, roleCible = '') {
      exiger('admin');
      if (cible?.proprietaire) throw new Error('Le compte propriétaire (éditeur) ne peut être ni modifié, ni désactivé, ni rétrogradé.');
      if (!controle || elevation) return;
      if (cible && !peutGererCompte(cible)) {
        securityEvent({ action: 'refus', detail: `Gestion du compte « ${cible.username} » refusée à ${currentUser()?.nom || '—'} (compte non subordonné)` });
        throw new Error('Vous ne pouvez gérer que les comptes que vous avez créés (directement ou par délégation).');
      }
      if ((cible?.role === 'superadmin' || roleCible === 'superadmin') && !estSuperAdmin()) {
        throw new Error('Seul un super administrateur peut gérer un compte super administrateur.');
      }
    }
    
    // `premier` : compte créé au tout premier lancement (l'établissement n'a encore aucun compte) — super administrateur racine
    function createUser({ username, nom, role, password }, { premier = false } = {}) {
      if (premier) {
        if (hasUsers()) throw new Error('Le compte initial existe déjà.');
        role = 'superadmin';
      } else exigerGestionCompte(null, role);
      const login = String(username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Identifiant invalide (3 à 30 caractères : lettres, chiffres, point, tiret).');
      if (login === PROPRIETAIRE.username) throw new Error('Cet identifiant est réservé.');
      if (!ROLES[role]) throw new Error('Rôle inconnu.');
      const problem = passwordProblem(password);
      if (problem) throw new Error(problem);
      const users = loadUsers();
      if (users.some((u) => u.username === login)) throw new Error('Cet identifiant existe déjà.');
      const salt = newSalt();
      const createur = premier ? null : (currentUser()?.id ?? null);
      const user = { id: users.reduce((m, u) => Math.max(m, u.id), 0) + 1, username: login, nom: String(nom || '').trim().slice(0, 80) || login, role, salt, hash: hashPassword(password, salt), actif: true, etablissementId: etablissement, creePar: createur, creeLe: new Date().toISOString() };
      users.push(user);
      saveUsers(users);
      return user;
    }
    
    function changePassword(userId, password) {
      const problem = passwordProblem(password);
      if (problem) throw new Error(problem);
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
      if (!user) throw new Error('Utilisateur introuvable.');
      const me = currentUser();
      if (user.proprietaire && controle && !me?.proprietaire) throw new Error('Seul le compte propriétaire peut changer son propre mot de passe.');
      if (!user.proprietaire && user.id !== me?.id) exigerGestionCompte(user);
      user.salt = newSalt();
      user.hash = hashPassword(password, user.salt);
      user.mdpModifieLe = new Date().toISOString();
      saveUsers(users);
      return true;
    }
    
    // Comptes de l'établissement uniquement (le compte propriétaire ne compte jamais comme administrateur de l'établissement)
    const adminsActifs = (users) => users.filter((u) => !u.proprietaire && duMemeEtablissement(u) && estRoleAdmin(u.role) && u.actif);
    const superAdminsActifs = (users) => users.filter((u) => !u.proprietaire && duMemeEtablissement(u) && u.role === 'superadmin' && u.actif);
    
    // Il reste toujours au moins un administrateur actif, et au moins un super administrateur actif s'il en existe un
    function verifierDernierAdmin(users, user, { actif = user.actif, role = user.role } = {}) {
      const restants = adminsActifs(users).filter((u) => u.id !== user.id);
      const etaitAdmin = user.actif && estRoleAdmin(user.role);
      if (etaitAdmin && !(actif && estRoleAdmin(role)) && !restants.length) throw new Error('Il doit rester au moins un administrateur actif.');
      const supers = superAdminsActifs(users).filter((u) => u.id !== user.id);
      if (user.role === 'superadmin' && !(actif && role === 'superadmin') && !supers.length) throw new Error('Il doit rester au moins un super administrateur actif.');
    }
    
    function setUserActive(userId, actif) {
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
      if (!user) throw new Error('Utilisateur introuvable.');
      exigerGestionCompte(user);
      verifierDernierAdmin(users, user, { actif: Boolean(actif) });
      user.actif = Boolean(actif);
      saveUsers(users);
      return user;
    }
    
    function setUserRole(userId, role) {
      if (!ROLES[role]) throw new Error('Rôle inconnu.');
      const users = loadUsers();
      const user = users.find((u) => u.id === Number(userId) && duMemeEtablissement(u));
      if (!user) throw new Error('Utilisateur introuvable.');
      exigerGestionCompte(user, role);
      verifierDernierAdmin(users, user, { role });
      user.role = role;
      saveUsers(users);
      return user;
    }
    
    // Réinitialisation complète : tous les comptes de l'établissement sont supprimés, SAUF les super administrateurs ;
    // le compte de l'éditeur est toujours conservé. Les blocages de connexion sont remis à zéro.
    function supprimerComptesNonSuperAdmin() {
      exiger('superadmin');
      const users = loadUsers();
      const gardes = users.filter((u) => u.proprietaire || u.role === 'superadmin' || !duMemeEtablissement(u));
      const supprimes = users.filter((u) => !gardes.includes(u));
      // Les super administrateurs conservés deviennent racines de la nouvelle hiérarchie
      gardes.forEach((u) => { if (!u.proprietaire && u.role === 'superadmin' && supprimes.some((s) => s.id === u.creePar)) u.creePar = null; });
      saveUsers(gardes);
      try { localStorage.removeItem(LOCK_KEY); } catch (error) { /* non bloquant */ }
      if (supprimes.length) securityEvent({ action: 'reinitialisation', detail: `Réinitialisation : ${supprimes.length} compte(s) utilisateur supprimé(s) (${supprimes.map((u) => u.username).join(', ')}) ; super administrateurs conservés` });
      return supprimes.map((u) => u.username);
    }
    
    // ---------- Contrôle des droits dans la couche métier ----------
    // Activé par l'application après la connexion : chaque fonction métier sensible appelle exiger(permission).
    // Sans contrôle actif (tests automatiques, opérations internes), les fonctions restent utilisables directement.
    // avecAutorisation() : exécution autorisée ponctuellement par un administrateur (identifiants saisis, journalisée).
    let controle = false;
    let elevation = 0;
    
    function activerControleDroits(actif = true) { controle = Boolean(actif); }
    const controleActif = () => controle;
    
    function avecAutorisation(fn) {
      elevation += 1;
      try { return fn(); } finally { elevation -= 1; }
    }
    
    const libelleDroit = (permission) => ({ admin: 'administration', superadmin: 'opération réservée au super administrateur', proprietaire: 'opération réservée au compte propriétaire (éditeur)' })[permission] || permissionLabel(permission);
    
    function exiger(permission) {
      if (!controle || elevation) return true;
      if (can(permission)) return true;
      const me = currentUser();
      securityEvent({ action: 'refus', detail: `Action refusée à ${me ? me.nom : 'un utilisateur non connecté'} : ${libelleDroit(permission)}` });
      throw new Error(`Votre rôle ne permet pas cette action (${libelleDroit(permission)}).`);
    }
    
    // Le compte propriétaire est le seul à gérer le catalogue des licences : le contrôle s'applique toujours,
    // même hors session (un établissement ne peut pas se fabriquer ses propres clés)
    function exigerProprietaire(action = 'gérer les licences') {
      if (elevation === 0 && !estProprietaire()) {
        securityEvent({ action: 'refus', detail: `Opération sur les licences refusée à ${currentUser()?.nom || 'un utilisateur non connecté'} : ${action}` });
        throw new Error(`Seul le compte propriétaire (éditeur) peut ${action}.`);
      }
      return true;
    }
    
    // ---------- Événements de sécurité ----------
    // Connexions réussies ou refusées, blocages, autorisations administrateur refusées, déconnexions :
    // transmis à l'application qui les inscrit dans le journal des opérations (jamais de mot de passe).
    let securityListener = null;
    function onSecurityEvent(fn) { securityListener = fn; }
    function securityEvent(detail) {
      try { securityListener?.(detail); } catch (error) { /* le journal ne doit jamais bloquer la connexion */ }
    }
    
    // ---------- Connexion ----------
    // Verrouillage PAR IDENTIFIANT (5 échecs → 1 minute), plus un plafond global (20 échecs → 1 minute) contre les
    // essais en rafale sur de nombreux identifiants. Un échec sur un compte ne bloque jamais les autres comptes.
    const MAX_GLOBAL = 20;
    function readLock() {
      try {
        const lock = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
        return lock && typeof lock === 'object' && lock.comptes ? lock : { comptes: {}, global: { attempts: 0, until: 0 } };
      } catch (error) { return { comptes: {}, global: { attempts: 0, until: 0 } }; }
    }
    
    function writeLock(lock) {
      try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (error) { /* non bloquant */ }
    }
    
    const normLogin = (username) => String(username || '').trim().toLowerCase().slice(0, 40);
    
    function lockRemainingMs(username = '', now = Date.now()) {
      const lock = readLock();
      const compte = lock.comptes[normLogin(username)] || {};
      return Math.max(compte.until > now ? compte.until - now : 0, lock.global?.until > now ? lock.global.until - now : 0);
    }
    
    // Vérifie des identifiants ; 5 échecs consécutifs sur un identifiant le bloquent 1 minute.
    function authenticate(username, password) {
      const login = normLogin(username);
      const wait = lockRemainingMs(login);
      if (wait) {
        securityEvent({ action: 'blocage', detail: `Tentative de connexion pendant le blocage (identifiant « ${login} »)` });
        return { ok: false, message: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` };
      }
      // Un compte d'un autre établissement n'est jamais reconnu sur cette installation
      const user = loadUsers().find((u) => u.username === login && duMemeEtablissement(u));
      const valid = user && user.actif && hashPassword(String(password || ''), user.salt) === user.hash;
      const lock = readLock();
      if (!valid) {
        const c = lock.comptes[login] || { attempts: 0, until: 0 };
        c.attempts += 1;
        const bloque = c.attempts >= MAX_ATTEMPTS;
        lock.comptes[login] = bloque ? { attempts: 0, until: Date.now() + LOCK_MS } : { attempts: c.attempts, until: 0 };
        lock.global = { attempts: (lock.global?.attempts || 0) + 1, until: 0 };
        if (lock.global.attempts >= MAX_GLOBAL) lock.global = { attempts: 0, until: Date.now() + LOCK_MS };
        writeLock(lock);
        securityEvent({ action: 'echec', detail: `Connexion refusée pour l’identifiant « ${login} »${user && !user.actif ? ' (compte désactivé)' : ''}${bloque ? ' — identifiant bloqué 1 minute' : ''}` });
        return { ok: false, message: user && !user.actif ? 'Ce compte est désactivé.' : 'Identifiant ou mot de passe incorrect.' };
      }
      delete lock.comptes[login];
      lock.global = { attempts: 0, until: 0 };
      writeLock(lock);
      if (user.proprietaire) securityEvent({ action: 'proprietaire', detail: 'Connexion du compte propriétaire (éditeur du logiciel)' });
      return { ok: true, user };
    }
    
    // Session de l'onglet (sessionStorage) : conservée à l'actualisation, perdue à la fermeture de l'onglet.
    // Elle expire après une période d'inactivité ou une durée maximale ; un compte désactivé perd aussitôt l'accès.
    const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
    const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
    
    function readSession() {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session && typeof session === 'object' && session.id ? session : null;
      } catch (error) { return null; }
    }
    
    function writeSession(session) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (error) { /* session non disponible */ }
    }
    
    function sessionValid(session, now = Date.now()) {
      return Boolean(session) && now - Number(session.last || 0) < SESSION_IDLE_MS && now - Number(session.start || 0) < SESSION_MAX_MS;
    }
    
    function startSession(user) {
      const now = Date.now();
      writeSession({ id: user.id, start: now, last: now });
      securityEvent({ action: 'connexion', detail: `Connexion de ${user.nom} (${user.username})`, utilisateur: user.nom });
    }
    
    function endSession({ volontaire = false } = {}) {
      const me = volontaire ? currentUser() : null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (error) { /* session non disponible */ }
      if (me) securityEvent({ action: 'deconnexion', detail: `Déconnexion de ${me.nom}`, utilisateur: me.nom });
    }
    
    // Prolonge la session lors d'une activité (au plus une écriture par minute)
    function touchSession() {
      const session = readSession();
      if (!sessionValid(session)) return false;
      if (Date.now() - session.last > 60 * 1000) writeSession({ ...session, last: Date.now() });
      return true;
    }
    
    function currentUser() {
      const session = readSession();
      if (!sessionValid(session)) return null;
      return loadUsers().find((u) => u.id === Number(session.id) && u.actif && duMemeEtablissement(u)) || null;
    }
    
    function currentUserName() {
      const user = currentUser();
      return user ? user.nom : '';
    }
    
    function isAdmin() { return estRoleAdmin(currentUser()?.role); }
    function estSuperAdmin() { return currentUser()?.role === 'superadmin'; }
    function estProprietaire() { return Boolean(currentUser()?.proprietaire); }
    
    // 'read' : consulter ; 'write' : au moins une action de saisie ; 'export' : exporter / imprimer ;
    // 'admin' : administrateur ou super administrateur ; 'superadmin' : opérations système ;
    // toute autre valeur : permission d'action du catalogue (ex. 'paiements.annuler').
    function can(permission) {
      const role = currentUser()?.role;
      if (!role) return false;
      if (permission === 'read') return true;
      if (permission === 'proprietaire') return estProprietaire();
      if (permission === 'superadmin') return role === 'superadmin';
      if (estRoleAdmin(role)) return true;
      if (permission === 'admin') return false;
      const def = roleOf(role);
      if (!def) return false;
      if (permission === 'write') return Boolean(def.write);
      if (permission === 'export') return Boolean(def.export);
      return def.permissions.includes(permission);
    }
    
    function allowedPages() {
      return ROLE_PAGES[currentUser()?.role] || [];
    }
    
    // Autorisation administrateur. Un administrateur connecté passe directement, sauf `reauth: true`
    // (opérations destructrices : il doit alors ressaisir son mot de passe). Tout autre rôle doit obtenir
    // l'accord d'un administrateur (identifiant + mot de passe), sans changer de session.
    // `superadmin: true` : seul un super administrateur peut accorder l'autorisation (opérations système).
    async function requireAdmin(state, reason = 'Cette action est réservée à l’administrateur.', { reauth = false, superadmin = false } = {}) {
      const me = currentUser();
      const habilite = (role) => (superadmin ? role === 'superadmin' : estRoleAdmin(role));
      if (habilite(me?.role) && !reauth) return true;
      const fields = habilite(me?.role)
        ? [{ name: 'username', label: 'Identifiant', value: me.username, required: true }, { name: 'password', label: 'Mot de passe administrateur', type: 'password', required: true }]
        : [{ name: 'username', label: 'Identifiant administrateur', required: true }, { name: 'password', label: 'Mot de passe', type: 'password', required: true }];
      const answer = await confirmDialog({ title: 'Autorisation requise', message: reason, confirmLabel: 'Autoriser', fields });
      if (!answer.ok) return false;
      const check = authenticate(answer.values.username, answer.values.password);
      const accorde = check.ok && habilite(check.user.role);
      securityEvent({ action: accorde ? 'autorisation' : 'refus', detail: `${accorde ? 'Autorisation administrateur accordée' : 'Autorisation administrateur refusée'} à ${me?.nom || 'un utilisateur'} — ${reason}${accorde && check.user.id !== me?.id ? ` (par ${check.user.nom})` : ''}` });
      return accorde;
    }
    
    // Rôles enregistrés (ou rôles par défaut) chargés dès le démarrage
    loadRoles();
    
    Object.assign(exports, { ADMIN_ONLY_PAGES, ROLES_ADMIN, estRoleAdmin, PERMISSIONS, PERMISSION_IDS, PERMISSIONS_SENSIBLES, permissionLabel, DEFAULT_ROLES, ROLES, ROLE_PAGES, loadRoles, roleList, roleOf, saveRole, deleteRole, resetRoles, sha256Hex, hashPassword, PROPRIETAIRE, definirEtablissement, rattacherComptes, loadUsers, hasUsers, publicUsers, passwordProblem, peutGererCompte, createUser, changePassword, setUserActive, setUserRole, supprimerComptesNonSuperAdmin, activerControleDroits, controleActif, avecAutorisation, exiger, exigerProprietaire, onSecurityEvent, lockRemainingMs, authenticate, SESSION_IDLE_MS, SESSION_MAX_MS, sessionValid, startSession, endSession, touchSession, currentUser, currentUserName, isAdmin, estSuperAdmin, estProprietaire, can, allowedPages, requireAdmin });
  };
  factories['./modules/licences.js'] = (require, exports) => {
    const { hashPassword, exiger, exigerProprietaire, currentUser } = require("./auth.js");
    // ══════════════════════════════════════════════════
    // LICENCES GEST SCHOOL SCOLARITÉ (sur le modèle de GEST SCHOOL) : chaque nouvelle année scolaire consomme une clé.
    //  • 10 clés d'origine : seules leurs EMPREINTES (SHA-256 avec poivre, 2 000 itérations) figurent dans le code ;
    //    une clé ne peut pas être retrouvée à partir du logiciel ;
    //  • le COMPTE PROPRIÉTAIRE (éditeur) gère seul le catalogue : ajout (clé saisie ou générée), modification,
    //    désactivation, révocation, suppression ; un établissement ne peut pas se fabriquer ses propres clés ;
    //  • une clé ne sert qu'UNE fois, pour toujours : utilisations, catalogue et archives sont enregistrés dans les
    //    données ET dans des registres du navigateur conservés après une réinitialisation ou la restauration d'une
    //    ancienne sauvegarde ;
    //  • DÉSACTIVER = suspension réversible · RÉVOQUER = définitif, la clé reste visible · SUPPRIMER = retirée du catalogue,
    //    archivée (traçabilité) et placée en liste noire : l'ancienne clé n'est plus jamais acceptée ;
    //  • indépendant des données financières : supprimer une licence ne touche ni aux années ni aux paiements.
    // ══════════════════════════════════════════════════
    const POIVRE = 'GSS-LIC-be33999484919eaf806cd44e';
    const EMPREINTES_ORIGINE = [
      'b42504d530de1860a5861e4485a257bdd7387fbad836e8ad0c894fe82715fb32',
      '5c9015246b381fcb380ee7489b98ea3838951314e19860fb3e69d5cf77ccf013',
      '2c6c839f4b07d2d47882ff74e69d7ca0229c38e4a76021655139173c14768c62',
      '3d9aed7b7fa2577d81c2e9169ca6b5e3f165188e0aaa6803c55c17dccdbef439',
      'b350b503017ebb94761ab2d35ef9e4260e3713f04ff85039531af019e6bddb92',
      'afee2faae85faddee0fee9cde46b45c39cc2a0be8b2df6f7ff930d817556b4ad',
      'e235362a417d3848ddf0f5cf30b9553bc288d202f3892cd632a2ffd4803f3ecb',
      'c73ba26036ea02c0cbb38a07d4d63dc4b26fa8749e00ab20c3e63bb265275688',
      '7387a1f2caa6884f8e511441e279a64e42244869dbb9bd18b3838c6c220742b2',
      '16da9928762f3f57ebfc3f9d4e63d569ba563d7f20402d31f79791a0592292fe'
    ];
    const REG_UTILISATIONS = 'gestscolarite_licences_utilisees';
    const REG_CATALOGUE = 'gestscolarite_licences_catalogue';
    const REG_ARCHIVES = 'gestscolarite_licences_archives';
    
    const STATUTS_LICENCE = { disponible: 'Disponible', utilisee: 'Utilisée', suspendue: 'Désactivée', revoquee: 'Révoquée', expiree: 'Expirée' };
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    
    const normCle = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const lire = (k) => { try { const r = JSON.parse(localStorage.getItem(k)); return Array.isArray(r) ? r : []; } catch (error) { return []; } };
    const ecrire = (k, l) => { try { localStorage.setItem(k, JSON.stringify(l)); } catch (error) { /* stockage plein : la copie dans les données subsiste */ } };
    const empreinte = (cle) => hashPassword(normCle(cle), POIVRE);
    const qui = () => currentUser()?.nom || 'Système';
    const courte = (h) => String(h || '').slice(0, 10).toUpperCase();
    
    // Fusion données ↔ registres du navigateur : une utilisation n'est jamais libérée, une suppression jamais oubliée,
    // la version la plus récente d'une entrée du catalogue l'emporte. À appeler au chargement et après chaque opération.
    function synchroniserLicences(state) {
      ['licences', 'licencesCatalogue', 'licencesArchives'].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
      const archives = [...state.licencesArchives];
      lire(REG_ARCHIVES).forEach((a) => { if (!archives.some((x) => x.n === a.n)) archives.push(a); });
      state.licencesArchives = archives;
      const supprimees = new Set(archives.map((a) => a.n));
      const utils = state.licences.filter((u) => !supprimees.has(u.n));
      lire(REG_UTILISATIONS).filter((u) => !supprimees.has(u.n)).forEach((u) => { if (!utils.some((x) => x.n === u.n)) utils.push({ ...u, restauree: true }); });
      state.licences = utils;
      const cat = [...state.licencesCatalogue];
      lire(REG_CATALOGUE).forEach((r) => {
        const i = cat.findIndex((x) => x.n === r.n);
        if (i < 0) cat.push(r);
        else if (String(r.modifieLe || '') > String(cat[i].modifieLe || '')) cat[i] = r;
      });
      state.licencesCatalogue = cat.filter((c) => !supprimees.has(c.n));
      ecrire(REG_ARCHIVES, state.licencesArchives);
      ecrire(REG_UTILISATIONS, state.licences.map(({ restauree, ...u }) => u));
      ecrire(REG_CATALOGUE, state.licencesCatalogue);
      return state;
    }
    
    // Catalogue opérationnel : clés d'origine (avec leurs éventuelles modifications) + clés ajoutées, sans les supprimées
    function catalogue(state) {
      const supprimees = new Set((state.licencesArchives || []).map((a) => a.n));
      const surcharges = new Map((state.licencesCatalogue || []).map((x) => [x.n, x]));
      const origine = EMPREINTES_ORIGINE.map((h, i) => ({ n: i + 1, empreinte: h, origine: 'origine', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...(surcharges.get(i + 1) || {}) }));
      const ajoutees = (state.licencesCatalogue || []).filter((x) => x.n > EMPREINTES_ORIGINE.length).map((x) => ({ origine: 'ajoutee', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...x }));
      return [...origine, ...ajoutees].filter((e) => !supprimees.has(e.n)).sort((a, b) => a.n - b.n);
    }
    
    const utilisation = (state, n) => (state.licences || []).find((u) => u.n === n) || null;
    
    function etatCle(state, e) {
      if (utilisation(state, e.n)) return 'utilisee';
      if (e.statut === 'revoquee') return 'revoquee';
      if (e.expireLe && e.expireLe < aujourdhui()) return 'expiree';
      if (e.statut === 'suspendue') return 'suspendue';
      return 'disponible';
    }
    
    function entreeCle(state, cle) {
      const k = normCle(cle);
      if (k.length < 8 || k.length > 40) return null;
      const h = empreinte(k);
      const archivee = (state.licencesArchives || []).find((a) => a.empreinte === h);
      if (archivee) return { ...archivee, supprimee: true };
      return catalogue(state).find((e) => e.empreinte === h) || null;
    }
    
    function motifRefus(state, e) {
      if (e.supprimee) return 'Cette clé de licence a été supprimée : elle n’est plus jamais acceptée.';
      const etat = etatCle(state, e);
      if (etat === 'utilisee') return 'Cette clé de licence a déjà été utilisée : une clé ne sert qu’une seule fois.';
      if (etat === 'revoquee') return 'Cette clé de licence a été révoquée : elle n’est plus acceptée.';
      if (etat === 'expiree') return `Cette clé de licence a expiré le ${e.expireLe}.`;
      if (etat === 'suspendue') return 'Cette clé de licence est désactivée : elle doit être réactivée par l’éditeur.';
      return '';
    }
    
    // Vérifie une clé sans la consommer (super administrateur)
    function verifierCle(state, cle) {
      exiger('superadmin');
      const e = entreeCle(state, cle);
      if (!e) return { valide: false, message: 'Clé de licence invalide.' };
      const refus = motifRefus(state, e);
      const u = utilisation(state, e.n);
      if (refus) return { valide: false, n: e.n, message: `Clé n° ${e.n} : ${refus.replace(/^Cette clé de licence /, '')}${u?.annee ? ` (année ${u.annee})` : ''}` };
      return { valide: true, n: e.n, message: `Clé valide (n° ${e.n}${e.etablissement ? `, ${e.etablissement}` : ''}${e.expireLe ? `, valable jusqu’au ${e.expireLe}` : ''}) : elle sera consommée à la création de la prochaine année scolaire.` };
    }
    
    // Contrôle et consommation d'une clé lors de la création d'une année (dans la transaction de création)
    function consommerLicence(state, cle, annee) {
      if (!String(cle || '').trim()) throw new Error('Clé de licence obligatoire : chaque nouvelle année scolaire nécessite une clé de licence valide (Paramètres › Licence).');
      const e = entreeCle(state, cle);
      if (!e) throw new Error('Clé de licence invalide : vérifiez la saisie.');
      const refus = motifRefus(state, e);
      if (refus) throw new Error(refus);
      const rec = { n: e.n, empreinte: courte(e.empreinte), annee, etablissementId: state.config?.etablissementId || '', etablissementNom: state.config?.nom || '', date: new Date().toISOString(), par: qui() };
      state.licences = [...(state.licences || []), rec];
      return rec;
    }
    
    // Catalogue pour l'écran (super administrateur) : jamais de clé en clair, seulement numéro, empreinte courte et état
    function listeLicences(state) {
      exiger('superadmin');
      return catalogue(state).map((e) => {
        const u = utilisation(state, e.n);
        const etat = etatCle(state, e);
        return { n: e.n, empreinte: courte(e.empreinte), origine: e.origine, libelle: e.libelle || '', etablissement: e.etablissement || '', expireLe: e.expireLe || '', notes: e.notes || '',
          statut: etat, libelleStatut: STATUTS_LICENCE[etat], annee: u?.annee || '', date: u?.date || '', par: u?.par || '', modifieLe: e.modifieLe || '', modifiePar: e.par || '', motifRevocation: e.motifRevocation || '' };
      });
    }
    
    function archivesLicences(state) {
      exiger('superadmin');
      return (state.licencesArchives || []).map((a) => ({ ...a, empreinte: courte(a.empreinte) })).sort((x, y) => String(y.supprimeeLe).localeCompare(String(x.supprimeeLe)));
    }
    
    // Résumé sans aucune clé (tableau de bord, page Licence)
    function etatLicence(state) {
      const cat = catalogue(state);
      const etats = cat.map((e) => etatCle(state, e));
      return { total: cat.length, disponibles: etats.filter((x) => x === 'disponible').length, utilisees: etats.filter((x) => x === 'utilisee').length, anneesActivees: (state.licences || []).length };
    }
    
    // ── Gestion du catalogue : COMPTE PROPRIÉTAIRE uniquement ──
    function genererCle() {
      const b = new Uint8Array(20);
      crypto.getRandomValues(b);
      const s = [...b].map((x) => ALPHABET[x % 32]).join('');
      return `GSS-${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
    }
    
    function empreinteNouvelle(state, cle) {
      const k = normCle(cle);
      if (k.length < 12 || k.length > 40) throw new Error('Clé invalide : 12 à 40 lettres ou chiffres (les tirets et espaces sont ignorés).');
      const h = empreinte(k);
      if (catalogue(state).some((e) => e.empreinte === h) || (state.licencesArchives || []).some((a) => a.empreinte === h)) throw new Error('Cette clé existe déjà (ou a été supprimée) : une clé ne peut jamais être réintroduite.');
      return h;
    }
    
    function champsLicence(data, e = {}) {
      const c = {};
      if (data.libelle !== undefined) c.libelle = String(data.libelle || '').trim().slice(0, 80);
      if (data.etablissement !== undefined) c.etablissement = String(data.etablissement || '').trim().slice(0, 120);
      if (data.notes !== undefined) c.notes = String(data.notes || '').trim().slice(0, 300);
      if (data.expireLe !== undefined) {
        const d = String(data.expireLe || '').trim();
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Date d’expiration invalide (format AAAA-MM-JJ).');
        c.expireLe = d;
      }
      return Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== (e[k] || '')));
    }
    
    function majEntree(state, n, champs) {
      const i = state.licencesCatalogue.findIndex((x) => x.n === n);
      const base = catalogue(state).find((e) => e.n === n);
      const rec = { ...(i >= 0 ? state.licencesCatalogue[i] : { n, empreinte: base.empreinte, origine: base.origine, statut: base.statut }), ...champs, modifieLe: new Date().toISOString(), par: qui() };
      if (i >= 0) state.licencesCatalogue[i] = rec; else state.licencesCatalogue.push(rec);
      return rec;
    }
    
    const nouveauNumero = (state) => Math.max(EMPREINTES_ORIGINE.length, ...catalogue(state).map((e) => e.n), ...(state.licencesCatalogue || []).map((e) => e.n), ...(state.licencesArchives || []).map((a) => a.n), ...(state.licences || []).map((u) => u.n)) + 1;
    
    // Ajoute une clé ; la clé en clair n'est rendue QU'UNE FOIS (seule son empreinte est enregistrée)
    function ajouterCle(state, data = {}) {
      exigerProprietaire('ajouter une clé de licence');
      const cle = String(data.cle || '').trim() ? String(data.cle).trim().toUpperCase() : genererCle();
      const h = empreinteNouvelle(state, cle);
      const champs = champsLicence(data);
      const n = nouveauNumero(state);
      const now = new Date().toISOString();
      state.licencesCatalogue.push({ n, empreinte: h, origine: 'ajoutee', statut: 'active', libelle: '', etablissement: '', expireLe: '', notes: '', ...champs, creeLe: now, modifieLe: now, par: qui() });
      return { n, cle, empreinte: courte(h) };
    }
    
    // Modifie libellé, établissement, expiration, notes, statut (active / suspendue) ou valeur d'une clé non utilisée
    function modifierCle(state, n, data = {}) {
      exigerProprietaire('modifier une clé de licence');
      const e = catalogue(state).find((x) => x.n === Number(n));
      if (!e) throw new Error('Clé introuvable (ou supprimée).');
      const utilisee = Boolean(utilisation(state, e.n));
      const revoquee = e.statut === 'revoquee';
      const champs = champsLicence(data, e);
      if ((utilisee || revoquee) && champs.expireLe !== undefined) throw new Error(`Cette clé est ${utilisee ? 'déjà utilisée' : 'révoquée'} : sa date d’expiration ne peut plus changer.`);
      if (data.statut !== undefined && data.statut !== e.statut) {
        if (!['active', 'suspendue'].includes(data.statut)) throw new Error('Statut invalide : utilisez « Révoquer » ou « Supprimer » pour les autres opérations.');
        if (utilisee) throw new Error('Cette clé est déjà utilisée : son statut ne peut plus changer.');
        if (revoquee) throw new Error('Cette clé est révoquée : la révocation est définitive.');
        champs.statut = data.statut;
      }
      if (data.cle !== undefined && String(data.cle).trim()) {
        if (utilisee || revoquee) throw new Error(`Cette clé est ${utilisee ? 'déjà utilisée' : 'révoquée'} : sa valeur ne peut plus être remplacée.`);
        champs.empreinte = empreinteNouvelle(state, data.cle);
      }
      if (!Object.keys(champs).length) throw new Error('Aucune modification à enregistrer.');
      return majEntree(state, e.n, champs);
    }
    
    // Révocation DÉFINITIVE d'une clé non utilisée : elle reste visible mais n'est plus jamais acceptée
    function revoquerCle(state, n, motif) {
      exigerProprietaire('révoquer une clé de licence');
      const e = catalogue(state).find((x) => x.n === Number(n));
      if (!e) throw new Error('Clé introuvable (ou supprimée).');
      if (utilisation(state, e.n)) throw new Error('Cette clé a déjà été utilisée : elle ne peut plus être révoquée (vous pouvez la supprimer du catalogue).');
      if (e.statut === 'revoquee') throw new Error('Cette clé est déjà révoquée.');
      const m = String(motif || '').trim();
      if (m.length < 3) throw new Error('Indiquez le motif de la révocation.');
      return majEntree(state, e.n, { statut: 'revoquee', revoqueeLe: new Date().toISOString(), motifRevocation: m.slice(0, 200) });
    }
    
    // Suppression : retirée du catalogue, archivée (traçabilité) et placée en liste noire ; les années créées avec cette
    // clé et toutes les données sont conservées
    function supprimerCle(state, n, motif) {
      exigerProprietaire('supprimer une clé de licence');
      const e = catalogue(state).find((x) => x.n === Number(n));
      if (!e) throw new Error('Clé introuvable ou déjà supprimée.');
      const u = utilisation(state, e.n);
      state.licencesArchives.push({ n: e.n, empreinte: e.empreinte, origine: e.origine, libelle: e.libelle || '', etablissement: e.etablissement || '', expireLe: e.expireLe || '',
        statutAvant: etatCle(state, e), utilisation: u ? { annee: u.annee, date: u.date, par: u.par } : null, supprimeeLe: new Date().toISOString(), par: qui(), motif: String(motif || '').trim().slice(0, 200) });
      state.licencesCatalogue = state.licencesCatalogue.filter((x) => x.n !== e.n);
      state.licences = state.licences.filter((x) => x.n !== e.n);
      // Registres du navigateur mis à jour immédiatement : la suppression ne doit pas être annulée par une fusion
      ecrire(REG_ARCHIVES, state.licencesArchives);
      ecrire(REG_CATALOGUE, state.licencesCatalogue);
      ecrire(REG_UTILISATIONS, lire(REG_UTILISATIONS).filter((x) => x.n !== e.n));
      return { n: e.n, utilisation: u };
    }
    
    Object.assign(exports, { STATUTS_LICENCE, synchroniserLicences, verifierCle, consommerLicence, listeLicences, archivesLicences, etatLicence, ajouterCle, modifierCle, revoquerCle, supprimerCle });
  };
  factories['./modules/licences-view.js'] = (require, exports) => {
    const { escapeHtml, formatDateFr } = require("./utils.js");
    const { listeLicences, archivesLicences, etatLicence } = require("./licences.js");
    const { can, estProprietaire } = require("./auth.js");
    // Page « Licence » : état des clés (super administrateur), vérification d'une clé, gestion du catalogue (compte
    // propriétaire uniquement). Aucune clé n'est jamais affichée en clair : seulement son numéro et son empreinte courte.
    
    const BADGES = { disponible: 'ok', utilisee: 'info', suspendue: 'warning', revoquee: 'danger', expiree: 'neutral' };
    
    function renderLicences(state) {
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
    
    Object.assign(exports, { renderLicences });
  };
  factories['./modules/login-view.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    const { editeurMentionHtml } = require("./editeur.js");
    const { hasUsers, createUser, authenticate, startSession, lockRemainingMs, passwordProblem } = require("./auth.js");
    // Écran de connexion plein écran. Au tout premier lancement, il propose de créer le compte administrateur
    // (aucun mot de passe par défaut n'existe). Résout avec l'utilisateur connecté.
    function showLogin(schoolName = '') {
      return new Promise((resolve) => {
        const root = document.getElementById('login-root');
        const firstRun = !hasUsers();
        root.hidden = false;
        root.innerHTML = `<div class="login-page">
          <form class="login-card" autocomplete="off" novalidate>
            <div class="login-brand"><img class="brand-logo" src="./assets/gest-school-embleme-64.png" alt="" width="46" height="46" /><div><strong>GEST SCHOOL SCOLARITÉ</strong><span>${escapeHtml(schoolName || 'Gestion financière et comptable des établissements scolaires')}</span></div></div>
            <h1>${firstRun ? 'Créer le compte super administrateur' : 'Connexion'}</h1>
            <p class="meta">${firstRun ? 'Premier lancement : créez le compte du super administrateur de l’établissement et conservez ces identifiants précieusement. Seul le compte de l’éditeur du logiciel (maintenance et licences) est présent par défaut.' : 'Saisissez vos identifiants pour accéder à l’application.'}</p>
            ${firstRun ? '<label>Nom complet <input name="nom" type="text" required autocomplete="name" /></label>' : ''}
            <label>Identifiant <input name="username" type="text" required autocomplete="username" autofocus /></label>
            <label>Mot de passe <input name="password" type="password" required autocomplete="${firstRun ? 'new-password' : 'current-password'}" /></label>
            ${firstRun ? '<label>Confirmer le mot de passe <input name="confirm" type="password" required autocomplete="new-password" /></label>' : ''}
            <p class="form-error" data-login-error role="alert" hidden></p>
            <button type="submit" class="primary-btn">${firstRun ? 'Créer le compte et entrer' : 'Se connecter'}</button>
            ${editeurMentionHtml()}
          </form>
        </div>`;
        const form = root.querySelector('form');
        const error = root.querySelector('[data-login-error]');
        const fail = (message) => { error.textContent = message; error.hidden = false; };
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const username = String(data.get('username') || '').trim();
          const password = String(data.get('password') || '');
          if (!username || !password) { fail('Renseignez l’identifiant et le mot de passe.'); return; }
          let user;
          if (firstRun) {
            if (password !== data.get('confirm')) { fail('Les deux mots de passe sont différents.'); return; }
            const problem = passwordProblem(password);
            if (problem) { fail(problem); return; }
            try { user = createUser({ username, nom: data.get('nom'), role: 'superadmin', password }, { premier: true }); } catch (e) { fail(e.message); return; }
          } else {
            const result = authenticate(username, password);
            if (!result.ok) {
              const wait = lockRemainingMs(username);
              fail(result.message);
              form.querySelector('[name="password"]').value = '';
              if (wait) form.querySelector('button[type="submit"]').disabled = true;
              if (wait) setTimeout(() => { form.querySelector('button[type="submit"]').disabled = false; error.hidden = true; }, wait);
              return;
            }
            user = result.user;
          }
          startSession(user);
          root.hidden = true;
          root.innerHTML = '';
          resolve(user);
        });
      });
    }
    
    Object.assign(exports, { showLogin });
  };
  factories['./modules/navigation.js'] = (require, exports) => {
    // Navigation : onglets principaux, chacun regroupant des sous-onglets (pages).
    // Les identifiants de page restent ceux des sections existantes : aucune fonctionnalité n'est déplacée ni perdue,
    // et les droits des rôles (listes de pages) restent valables quand le regroupement change.
    const NAV_GROUPS = [
      { id: 'accueil', label: 'Tableau de bord', icon: '📊', pages: [['dashboard', 'Vue d’ensemble'], ['analyse', 'Analyse financière']] },
      { id: 'eleves', label: 'Élèves et inscriptions', icon: '🎓', pages: [['eleves', 'Dossiers élèves'], ['inscriptions', 'Inscriptions']] },
      { id: 'scolarite', label: 'Tarifs et scolarité', icon: '🏫', pages: [['tarifs', 'Tarifs et frais'], ['classes', 'Classes'], ['annees', 'Années scolaires']] },
      { id: 'paiements', label: 'Paiements', icon: '💳', pages: [['paiements', 'Encaissements'], ['encaissements-analyse', 'Analyse des encaissements']] },
      { id: 'impayes', label: 'Dettes et impayés', icon: '📌', pages: [['creances', 'Créances et relances'], ['dettes', 'Dettes antérieures']] },
      { id: 'depenses', label: 'Dépenses', icon: '🧾', pages: [['depenses', 'Dépenses']] },
      { id: 'tresorerie', label: 'Caisse et trésorerie', icon: '🏦', pages: [['caisse', 'Caisse'], ['comptes', 'Comptes et virements']] },
      { id: 'rapports', label: 'Comptabilité et rapports', icon: '📚', pages: [['etats', 'États financiers'], ['rapports', 'Rapports et rappels']] },
      { id: 'paie', label: 'Paie du personnel', icon: '👥', pages: [['paie-dashboard', 'Tableau de bord'], ['personnel', 'Personnel'], ['affectations', 'Affectations'], ['remunerations', 'Rémunérations'], ['paie', 'Paie mensuelle'], ['avances', 'Avances sur salaire'], ['paie-rapports', 'Bulletins et récapitulatifs']] },
      { id: 'utilisateurs', label: 'Utilisateurs et permissions', icon: '🔐', pages: [['config-utilisateurs', 'Utilisateurs et rôles'], ['config-journal', 'Journal d’audit']] },
      { id: 'parametres', label: 'Paramètres', icon: '⚙️', pages: [['config', 'Établissement'], ['config-finances', 'Paramètres financiers'], ['licences', 'Licence'], ['aide', 'Centre d’aide']] },
      { id: 'sauvegardes', label: 'Sauvegardes et restauration', icon: '💾', pages: [['config-donnees', 'Données et sauvegardes']] }
    ];
    
    // Icône de chaque sous-onglet (barre d'onglets en haut des pages)
    const PAGE_ICONS = {
      dashboard: '📈', analyse: '🔍', eleves: '🎓', inscriptions: '📝', annees: '🗓️', classes: '🏫', tarifs: '💰',
      paiements: '💳', creances: '📌', 'encaissements-analyse': '📊', dettes: '⏳', depenses: '🧾', caisse: '🪙', comptes: '🏦', etats: '📚',
      'paie-dashboard': '📊', personnel: '👥', affectations: '🧑‍🏫', remunerations: '💼', paie: '💵', avances: '↪️', 'paie-rapports': '📄',
      rapports: '🗂️', config: '🏛️', 'config-utilisateurs': '🔐', 'config-finances': '🧮', 'config-donnees': '💾', 'config-journal': '📜', licences: '🔑', aide: '❔'
    };
    
    const ALL_PAGES = NAV_GROUPS.flatMap((g) => g.pages.map(([id]) => id));
    
    function groupOfPage(pageId) {
      return NAV_GROUPS.find((g) => g.pages.some(([id]) => id === pageId)) || null;
    }
    
    function pageLabel(pageId) {
      for (const g of NAV_GROUPS) {
        const page = g.pages.find(([id]) => id === pageId);
        if (page) return page[1];
      }
      return pageId;
    }
    
    // Chemin lisible d'une page : « Paiements › Encaissements »
    function pagePath(pageId) {
      const group = groupOfPage(pageId);
      return group ? (group.pages.length > 1 || group.label !== pageLabel(pageId) ? [group.label, pageLabel(pageId)] : [group.label]) : [pageId];
    }
    
    Object.assign(exports, { NAV_GROUPS, PAGE_ICONS, ALL_PAGES, groupOfPage, pageLabel, pagePath });
  };
  factories['./modules/formulaires.js'] = (require, exports) => {
    // Formulaires repliés : chaque formulaire de saisie est présenté derrière un bouton portant son nom, au lieu d'être
    // affiché d'emblée. Il s'ouvre au clic, et automatiquement lorsque l'application doit le montrer (modification d'un
    // élément, redirection après une inscription, bouton « + Nouvel élève »…). Les écrans redessinés sont pris en charge
    // automatiquement (surveillance du document).
    
    const LIBELLES = {
      annee: 'Ajouter une année scolaire', classe: 'Ajouter une classe', eleve: 'Nouvel élève', inscription: 'Nouvelle inscription',
      tarif: 'Ajouter des frais de scolarité (tarif)', paiement: 'Enregistrer un paiement', depense: 'Enregistrer une dépense',
      config: 'Modifier l’identité et l’en-tête de l’établissement', utilisateur: 'Créer un utilisateur', 'role-new': 'Créer un rôle',
      compte: 'Créer un compte financier', referentiels: 'Modifier les catégories', arrondis: 'Modifier les règles d’arrondi',
      virement: 'Faire un virement interne', 'caisse-ouverture': 'Ouvrir une caisse', 'caisse-fermeture': 'Compter et fermer la caisse',
      rapprochement: 'Saisir un rapprochement bancaire', 'caisse-option': 'Option : caisse obligatoire', programme: 'Modifier le programme de la classe',
      'licence-verifier': 'Vérifier une clé de licence', 'licence-ajouter': 'Ajouter une clé de licence au catalogue'
    };
    
    function libelle(form) {
      if (form.dataset.pli) return form.dataset.pli;
      if (LIBELLES[form.dataset.form]) return LIBELLES[form.dataset.form];
      if (form.dataset.form === 'role') return `Droits du rôle « ${form.querySelector('[name="label"]')?.value || ''} »`;
      const titre = form.closest('.panel')?.querySelector('.panel-header h3')?.textContent?.trim();
      const bouton = form.querySelector('button[type="submit"]')?.textContent?.trim();
      return titre || bouton || 'Ouvrir le formulaire';
    }
    
    function replierFormulaires(root = document) {
      root.querySelectorAll('form[data-form]').forEach((form) => {
        // Déjà replié, déjà dans un volet, ou fenêtre de dialogue / connexion : inchangé
        if (form.closest('details, .dialog, .dialog-backdrop, #login-root')) return;
        const details = document.createElement('details');
        details.className = 'form-pli';
        const summary = document.createElement('summary');
        summary.className = 'form-pli-bouton';
        summary.textContent = libelle(form);
        form.parentNode.insertBefore(details, form);
        details.append(summary, form);
      });
    }
    
    function ouvrirFormulaire(form) {
      const volet = form?.closest?.('details.form-pli');
      if (volet && !volet.open) volet.open = true;
      return form;
    }
    
    let observateur = null;
    function surveillerFormulaires() {
      replierFormulaires();
      if (observateur || typeof MutationObserver === 'undefined') return;
      observateur = new MutationObserver((mutations) => {
        if (mutations.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('form[data-form]') || n.querySelector?.('form[data-form]'))))) replierFormulaires();
      });
      observateur.observe(document.body, { childList: true, subtree: true });
    }
    
    Object.assign(exports, { replierFormulaires, ouvrirFormulaire, surveillerFormulaires });
  };
})(window.IBK_APP.factories);

