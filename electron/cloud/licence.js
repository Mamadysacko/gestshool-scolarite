'use strict';
// Évaluation locale de la licence à partir du certificat signé par le serveur (vérification Ed25519 avec la clé
// publique intégrée à l'application). Fonctionne hors ligne, dans la limite de la politique hors ligne du certificat.
const crypto = require('node:crypto');

const LIBELLES = {
  non_configure: 'Service cloud non configuré (mode local)',
  non_activee: 'Licence non activée sur ce poste',
  valide: 'Licence valide',
  a_revalider: 'Licence à revalider : connectez le poste à Internet',
  expiree: 'Licence expirée',
  suspendue: 'Licence suspendue',
  revoquee: 'Licence révoquée',
  remplacee: 'Licence remplacée : saisissez la nouvelle clé',
  installation_desactivee: 'Installation désactivée par l’éditeur',
  invalide: 'Certificat de licence invalide'
};

function lireCertificat(certificat, clePubliquePem) {
  if (!certificat || typeof certificat.charge !== 'string' || typeof certificat.signature !== 'string' || !clePubliquePem) return null;
  try {
    const charge = Buffer.from(certificat.charge, 'base64url');
    const ok = crypto.verify(null, charge, crypto.createPublicKey(clePubliquePem), Buffer.from(certificat.signature, 'base64url'));
    return ok ? JSON.parse(charge.toString('utf8')) : null;
  } catch {
    return null;
  }
}

// heureMax : plus grande heure déjà observée (protection contre le recul de l'horloge du poste)
function evaluer({ configure, certificat, clePublique, installationId, maintenant = Date.now(), heureMax = 0, exigerActivation = false }) {
  const base = (etat, extra = {}) => ({ etat, libelle: LIBELLES[etat], ...extra });
  if (!configure) return base('non_configure', { action: 'aucune' });
  if (!certificat) return base('non_activee', { action: exigerActivation ? 'bloquer' : 'aucune' });
  const c = lireCertificat(certificat, clePublique);
  if (!c || (installationId && c.installation_id !== installationId)) return base('invalide', { action: 'bloquer' });
  const t = Math.max(maintenant, heureMax);
  const info = {
    client: c.client_nom, type: c.type, expire_le: c.expire_le, hors_ligne_jusqu_au: c.hors_ligne_jusqu_au, emis_le: c.emis_le,
    licence_id: c.licence_id, horloge_reculee: maintenant + 864e5 < heureMax
  };
  const action = c.action_si_invalide === 'bloquer' ? 'bloquer' : 'avertir';
  if (c.statut !== 'active') return base(LIBELLES[c.statut] ? c.statut : 'invalide', { ...info, action });
  if (c.expire_le && t > Date.parse(c.expire_le)) return base('expiree', { ...info, action });
  if (t > Date.parse(c.hors_ligne_jusqu_au)) return base('a_revalider', { ...info, action });
  return base('valide', { ...info, action: 'aucune', jours_hors_ligne_restants: Math.floor((Date.parse(c.hors_ligne_jusqu_au) - t) / 864e5) });
}

module.exports = { evaluer, lireCertificat, LIBELLES };
