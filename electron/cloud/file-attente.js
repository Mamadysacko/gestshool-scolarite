'use strict';
// File d'attente persistante des événements à envoyer. Chaque événement reçoit un identifiant unique (UUID) et un
// horodatage ISO au moment où il se produit ; il n'est retiré qu'après accusé de réception du serveur (accepté,
// doublon ou rejeté définitivement). La file est écrite sur disque à chaque ajout : rien n'est perdu à la fermeture.
const crypto = require('node:crypto');

const TYPES = ['demarrage', 'arret', 'erreur', 'diagnostic', 'usage', 'mise_a_jour', 'licence', 'synchro', 'sauvegarde'];
const NIVEAUX = ['info', 'avertissement', 'erreur', 'critique'];
const CAPACITE = 5000;

class FileAttente {
  constructor(stockage, { capacite = CAPACITE, horloge = () => Date.now() } = {}) {
    this.stockage = stockage;
    this.capacite = capacite;
    this.horloge = horloge;
    const s = stockage.lire('file-attente', { evenements: [], perdus: 0 });
    this.evenements = Array.isArray(s.evenements) ? s.evenements : [];
    this.perdus = Number(s.perdus) || 0;
  }

  persister() { this.stockage.ecrire('file-attente', { evenements: this.evenements, perdus: this.perdus }); }

  ajouter({ type, niveau = 'info', message = '', donnees = {} }) {
    if (!TYPES.includes(type)) throw new Error(`Type d’événement inconnu : ${type}`);
    if (!NIVEAUX.includes(niveau)) throw new Error(`Niveau inconnu : ${niveau}`);
    const e = {
      id: crypto.randomUUID(),
      type,
      niveau,
      message: String(message).slice(0, 500),
      donnees: simple(donnees),
      horodatage: new Date(this.horloge()).toISOString()
    };
    this.evenements.push(e);
    // Capacité dépassée (très longue période hors ligne) : on retire d'abord les événements d'information
    while (this.evenements.length > this.capacite) {
      const i = this.evenements.findIndex((x) => x.niveau === 'info');
      this.evenements.splice(i >= 0 ? i : 0, 1);
      this.perdus += 1;
    }
    this.persister();
    return e;
  }

  lot(taille = 100) { return this.evenements.slice(0, taille); }

  retirer(ids) {
    const s = new Set(ids);
    const avant = this.evenements.length;
    this.evenements = this.evenements.filter((e) => !s.has(e.id));
    if (this.evenements.length !== avant) this.persister();
  }

  get taille() { return this.evenements.length; }
}

// Données d'événement : valeurs simples uniquement, taille bornée (jamais de données scolaires détaillées)
function simple(o) {
  const r = {};
  if (!o || typeof o !== 'object') return r;
  for (const [k, v] of Object.entries(o).slice(0, 20)) {
    if (['number', 'boolean'].includes(typeof v) || v === null) r[k] = v;
    else if (typeof v === 'string') r[k] = v.slice(0, 200);
  }
  return r;
}

module.exports = { FileAttente, TYPES, NIVEAUX };
