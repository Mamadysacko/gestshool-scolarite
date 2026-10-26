'use strict';
// Service cloud de l'application installée : activation de la licence, synchronisation des métadonnées techniques,
// file d'événements hors ligne. Indépendant d'Electron (transport, horloge et chiffrement injectés) pour être testé.
//
// Ce qui est envoyé : identifiant d'installation, version, état technique (système, file d'attente, erreurs), événements
// de diagnostic. Statistiques d'usage (nombre d'élèves, de classes…) UNIQUEMENT si le contrat du client le prévoit
// (côté serveur) ET si l'établissement l'a accepté dans l'application. Aucune donnée scolaire détaillée n'est envoyée.
const crypto = require('node:crypto');
const os = require('node:os');
const { FileAttente } = require('./file-attente');
const { evaluer } = require('./licence');

const TAILLE_LOT = 100;
const MAX_LOTS = 20;
const DELAI_MIN = 30e3;
const DELAI_MAX = 30 * 60e3;

class ServiceCloud {
  constructor({ config, stockage, transport, versionApp, horloge = () => Date.now(), chiffrer = (s) => s, dechiffrer = (s) => s, empreintePoste, alea = Math.random }) {
    this.config = config;
    this.stockage = stockage;
    this.transport = transport;
    this.versionApp = versionApp;
    this.horloge = horloge;
    this.chiffrer = chiffrer;
    this.dechiffrer = dechiffrer;
    this.alea = alea;
    this.configure = !!(config.url_fonctions && config.cle_publique && config.produit);
    this.file = new FileAttente(stockage, { horloge });
    this.installation = stockage.lire('installation', null) || this.creerInstallation(empreintePoste);
    this.licence = stockage.lire('licence', { jeton: null, certificat: null });
    this.etatSync = stockage.lire('etat', {});
    this.etatSync.demarrages = (this.etatSync.demarrages || 0) + 1;
    this.enCours = null;
    this.ecouteurs = new Set();
    this.persisterEtat();
  }

  creerInstallation(empreintePoste) {
    const inst = {
      installation_id: crypto.randomUUID(),
      empreinte_poste: empreintePoste || crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
      creee_le: new Date(this.horloge()).toISOString()
    };
    this.stockage.ecrire('installation', inst);
    return inst;
  }

  persisterEtat() { this.stockage.ecrire('etat', this.etatSync); }
  persisterLicence() { this.stockage.ecrire('licence', this.licence); }
  surChangement(f) { this.ecouteurs.add(f); return () => this.ecouteurs.delete(f); }
  notifier() { const e = this.etat(); this.ecouteurs.forEach((f) => { try { f(e); } catch { /* écouteur fautif ignoré */ } }); }

  /* ── État affiché dans l'application ── */
  evaluerLicence() {
    return evaluer({
      configure: this.configure, certificat: this.licence.certificat, clePublique: this.config.cle_publique,
      installationId: this.installation.installation_id, maintenant: this.horloge(), heureMax: this.etatSync.heure_max || 0,
      exigerActivation: this.config.exiger_activation === true
    });
  }

  etat() {
    return {
      configure: this.configure,
      produit: this.config.produit,
      version: this.versionApp,
      installation_id: this.installation.installation_id,
      licence: this.evaluerLicence(),
      reactivation_requise: this.etatSync.reactivation_requise === true,
      synchro: {
        en_cours: !!this.enCours,
        derniere_synchro: this.etatSync.derniere_synchro || null,
        derniere_tentative: this.etatSync.derniere_tentative || null,
        derniere_erreur: this.etatSync.derniere_erreur || null,
        echecs: this.etatSync.echecs || 0,
        en_attente: this.file.taille,
        perdus: this.file.perdus,
        prochaine_tentative: this.etatSync.prochaine_tentative || null
      },
      versions: this.etatSync.versions || null,
      partage_usage: this.etatSync.partage_usage === true,
      consentement_usage: this.etatSync.consentement_usage === true
    };
  }

  /* ── Événements ── */
  signaler(evenement) {
    const e = this.file.ajouter(evenement);
    this.notifier();
    return e.id;
  }

  definirConsentementUsage(oui) { this.etatSync.consentement_usage = oui === true; this.persisterEtat(); this.notifier(); }
  definirUsage(usage) { this.etatSync.usage = usage && typeof usage === 'object' ? usage : {}; this.persisterEtat(); }

  /* ── Activation ── */
  async activer(cle) {
    if (!this.configure) return { ok: false, code: 'non_configure', message: 'Service cloud non configuré dans cette version.' };
    let r;
    try {
      r = await this.transport('activerInstallation', {
        cle: String(cle || ''), produit: this.config.produit, installation_id: this.installation.installation_id,
        empreinte_poste: this.installation.empreinte_poste, version_app: this.versionApp,
        poste: { nom: os.hostname().slice(0, 80), systeme: `${os.type()} ${os.release()}`, arch: os.arch() }
      });
    } catch (e) {
      return { ok: false, code: 'reseau', message: 'Connexion impossible : vérifiez l’accès à Internet puis réessayez.' };
    }
    if (r.statut !== 200) return { ok: false, code: r.corps?.code || 'erreur', message: r.corps?.message || `Erreur ${r.statut}` };
    this.licence = { jeton: this.chiffrer(r.corps.jeton), certificat: r.corps.certificat };
    this.persisterLicence();
    Object.assign(this.etatSync, { reactivation_requise: false, versions: r.corps.versions || null, heure_max: Math.max(this.etatSync.heure_max || 0, this.horloge()) });
    this.persisterEtat();
    this.file.ajouter({ type: 'licence', niveau: 'info', message: 'Licence activée sur ce poste' });
    this.notifier();
    this.synchroniser({ raison: 'activation' }).catch(() => {});
    return { ok: true, licence: this.evaluerLicence() };
  }

  /* ── Synchronisation ── */
  delaiProchaineTentative() {
    const n = this.etatSync.echecs || 0;
    if (!n) return (this.config.intervalle_minutes || 15) * 60e3;
    const base = Math.min(DELAI_MIN * 2 ** (n - 1), DELAI_MAX);
    return Math.round(base * (0.8 + this.alea() * 0.4));
  }

  synchroniser(options = {}) {
    if (this.enCours) return this.enCours;
    this.enCours = this.executer(options).finally(() => { this.enCours = null; this.notifier(); });
    this.notifier();
    return this.enCours;
  }

  async executer() {
    if (!this.configure) return { statut: 'non_configure' };
    if (!this.licence.jeton) return { statut: 'non_activee' };
    const jeton = this.dechiffrer(this.licence.jeton);
    this.etatSync.derniere_tentative = new Date(this.horloge()).toISOString();
    let envoyes = 0, doublons = 0;
    try {
      for (let i = 0; i < MAX_LOTS; i++) {
        const lot = this.file.lot(TAILLE_LOT);
        const r = await this.transport('synchroniser', {
          installation_id: this.installation.installation_id,
          version_app: this.versionApp,
          etat: this.etatTechnique(),
          ...(this.etatSync.partage_usage && this.etatSync.consentement_usage ? { usage: this.etatSync.usage || {} } : {}),
          evenements: lot
        }, jeton);
        if (r.statut === 401) {
          this.etatSync.reactivation_requise = true;
          return this.echec('Installation non reconnue par le serveur : réactivez la licence.', false);
        }
        if (r.statut === 403 && r.corps?.certificat) {
          this.licence.certificat = r.corps.certificat;
          this.persisterLicence();
          return this.echec(r.corps.message || 'Installation désactivée.', false);
        }
        if (r.statut !== 200) return this.echec(r.corps?.message || `Erreur du serveur (${r.statut})`, true);
        const c = r.corps;
        this.file.retirer([...c.acceptes, ...c.doublons, ...c.rejetes.map((x) => x.id).filter(Boolean)]);
        envoyes += c.acceptes.length;
        doublons += c.doublons.length;
        this.licence.certificat = c.certificat;
        this.persisterLicence();
        Object.assign(this.etatSync, {
          versions: c.versions || null, partage_usage: c.partage_usage === true, derniere_synchro: new Date(this.horloge()).toISOString(),
          echecs: 0, derniere_erreur: null, reactivation_requise: false, prochaine_tentative: null,
          heure_max: Math.max(this.etatSync.heure_max || 0, this.horloge(), Date.parse(c.heure_serveur) || 0)
        });
        this.persisterEtat();
        if (!this.file.taille || lot.length === 0) break;
      }
      return { statut: 'ok', envoyes, doublons, restants: this.file.taille };
    } catch (e) {
      return this.echec('Hors ligne ou serveur injoignable : les événements restent en attente.', true);
    }
  }

  echec(message, reessayer) {
    this.etatSync.echecs = (this.etatSync.echecs || 0) + 1;
    this.etatSync.derniere_erreur = { message, le: new Date(this.horloge()).toISOString() };
    this.etatSync.prochaine_tentative = reessayer ? new Date(this.horloge() + this.delaiProchaineTentative()).toISOString() : null;
    this.persisterEtat();
    return { statut: 'echec', message, reessayer };
  }

  etatTechnique() {
    return {
      systeme: `${os.type()} ${os.release()}`.slice(0, 80),
      arch: os.arch(),
      memoire_mo: Math.round(os.totalmem() / 1048576),
      file_attente: this.file.taille,
      echecs_synchro: this.etatSync.echecs || 0,
      derniere_erreur: this.etatSync.derniere_erreur?.message || '',
      demarrages: this.etatSync.demarrages || 0
    };
  }
}

module.exports = { ServiceCloud };
