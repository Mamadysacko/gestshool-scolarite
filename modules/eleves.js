import { nextId } from './annees.js';

function generateMatricule(state) {
  const year = new Date().getFullYear();
  const prefix = `IBK-${year}-`;
  const existing = state.eleves
    .map((eleve) => eleve.matricule || '')
    .filter((m) => m.startsWith(prefix))
    .map((m) => parseInt(m.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function createEleve(state, payload = {}) {
  const nom = String(payload.nom || '').trim();
  const prenom = String(payload.prenom || '').trim();
  if (!nom || !prenom) return null;

  const item = {
    id: nextId(state.eleves),
    matricule: (payload.matricule && String(payload.matricule).trim()) ? String(payload.matricule).trim() : generateMatricule(state),
    nom,
    prenom,
    sexe: payload.sexe || 'M',
    dateNaissance: payload.dateNaissance || '',
    telephone: payload.telephone || '',
    email: payload.email || '',
    parent: payload.parent || '',
    adresse: payload.adresse || '',
    classeId: Number(payload.classeId || 0),
    actif: payload.actif !== false
  };

  state.eleves.push(item);
  return item;
}

export function updateEleve(state, id, payload = {}) {
  const item = state.eleves.find((eleve) => eleve.id === Number(id));
  if (!item) return null;
  const nom = String(payload.nom ?? item.nom).trim();
  const prenom = String(payload.prenom ?? item.prenom).trim();
  const matricule = String(payload.matricule || item.matricule).trim();
  if (!nom || !prenom) return null;
  if (state.eleves.some((e) => e.id !== item.id && e.matricule === matricule)) return null;
  const pick = (key) => (payload[key] !== undefined ? payload[key] : item[key]);

  Object.assign(item, {
    matricule, nom, prenom,
    sexe: pick('sexe'), dateNaissance: pick('dateNaissance'), telephone: pick('telephone'), email: pick('email'),
    parent: pick('parent'), adresse: pick('adresse'),
    classeId: payload.classeId !== undefined ? Number(payload.classeId || 0) : item.classeId,
    actif: payload.actif !== undefined ? payload.actif : item.actif
  });

  return item;
}

export function toggleEleveState(state, id) {
  const item = state.eleves.find((eleve) => eleve.id === Number(id));
  if (!item) return null;
  item.actif = !item.actif;
  return item;
}

// Refus si un paiement existe pour l'élève : l'historique comptable est conservé.
export function deleteEleve(state, id) {
  const targetId = Number(id);
  const index = state.eleves.findIndex((item) => item.id === targetId);
  if (index === -1) return false;
  const inscriptionIds = state.inscriptions.filter((i) => i.eleveId === targetId).map((i) => i.id);
  if (state.paiements.some((p) => inscriptionIds.includes(p.inscriptionId))) return false;

  state.eleves.splice(index, 1);
  state.inscriptions = state.inscriptions.filter((inscription) => inscription.eleveId !== targetId);
  return true;
}
