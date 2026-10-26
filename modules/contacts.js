import { nextId } from './annees.js';

// Parents et tuteurs : une fiche contact par personne, réutilisable pour tous les enfants d'une même famille.
// Chaque élève référence ses responsables (lien : père, mère ou tuteur) et éventuellement un contact d'urgence.
// Le champ texte « parent » de l'élève est conservé (nom du responsable principal) pour les reçus et exports.
export const LIENS = { pere: 'Père', mere: 'Mère', tuteur: 'Tuteur / tutrice' };

const text = (v) => String(v ?? '').trim();
export const normTel = (v) => text(v).replace(/[^\d+]/g, '').replace(/^00/, '+');
export const nomContact = (c) => (c ? `${c.prenom ? `${c.prenom} ` : ''}${c.nom}`.trim() : '');

export function ensureContacts(state) {
  if (!Array.isArray(state.contacts)) state.contacts = [];
  return state.contacts;
}

// Reprise des anciennes fiches : « parent » (texte) + téléphone deviennent une fiche contact (sans doublon)
export function migrerContacts(state) {
  ensureContacts(state);
  state.eleves.forEach((e) => {
    if (Array.isArray(e.responsables)) return;
    e.responsables = [];
    const nom = text(e.parent);
    if (!nom) return;
    const tel = normTel(e.telephone);
    let contact = state.contacts.find((c) => nomContact(c).toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr') && (!tel || normTel(c.telephone) === tel));
    if (!contact) {
      contact = { id: nextId(state.contacts), nom, prenom: '', telephone: text(e.telephone), telephone2: '', adresse: text(e.adresse) };
      state.contacts.push(contact);
    }
    e.responsables.push({ contactId: contact.id, lien: 'tuteur', principal: true });
  });
}

export function responsablesEleve(state, eleve) {
  return (eleve?.responsables || []).map((r) => ({ ...r, contact: (state.contacts || []).find((c) => c.id === r.contactId) })).filter((r) => r.contact);
}

export function responsablePrincipal(state, eleve) {
  const list = responsablesEleve(state, eleve);
  return list.find((r) => r.principal) || list[0] || null;
}

// Téléphone à appeler pour un élève : responsable principal, sinon téléphone de la fiche élève
export function telephoneFamille(state, eleve) {
  const r = responsablePrincipal(state, eleve);
  return r?.contact.telephone || eleve?.telephone || '';
}

export function enfantsDuContact(state, contactId) {
  return state.eleves.filter((e) => (e.responsables || []).some((r) => r.contactId === Number(contactId)));
}

// Contact existant correspondant : même téléphone principal, sinon (sans téléphone) même nom complet
export function trouverContact(state, { nom, prenom, telephone }) {
  const tel = normTel(telephone);
  if (tel) return ensureContacts(state).find((c) => normTel(c.telephone) === tel) || null;
  const complet = `${text(prenom)} ${text(nom)}`.trim().toLocaleLowerCase('fr');
  return complet ? ensureContacts(state).find((c) => nomContact(c).toLocaleLowerCase('fr') === complet) || null : null;
}

// Crée ou réutilise un contact et l'associe à l'élève comme responsable principal.
// payload : { contactId?, nom, prenom, lien, telephone, telephone2, adresse, urgenceNom, urgenceTelephone }
export function definirResponsable(state, eleve, payload = {}) {
  ensureContacts(state);
  const nom = text(payload.nom);
  const lien = LIENS[payload.lien] ? payload.lien : 'tuteur';
  let contact = payload.contactId ? state.contacts.find((c) => c.id === Number(payload.contactId)) : null;
  if (!contact && !nom) {
    // aucun responsable saisi : on conserve les liens existants, seul le contact d'urgence peut changer
    definirUrgence(eleve, payload);
    return null;
  }
  if (!contact) contact = trouverContact(state, payload);
  if (!contact) {
    contact = { id: nextId(state.contacts), nom, prenom: text(payload.prenom), telephone: text(payload.telephone), telephone2: text(payload.telephone2), adresse: text(payload.adresse) };
    state.contacts.push(contact);
  } else {
    // mise à jour des informations saisies (un champ laissé vide ne efface jamais une valeur connue)
    ['nom', 'prenom', 'telephone', 'telephone2', 'adresse'].forEach((k) => { if (text(payload[k])) contact[k] = text(payload[k]); });
  }
  const autres = (eleve.responsables || []).filter((r) => r.contactId !== contact.id).map((r) => ({ ...r, principal: false }));
  eleve.responsables = [{ contactId: contact.id, lien, principal: true }, ...autres];
  eleve.parent = nomContact(contact);
  definirUrgence(eleve, payload);
  return contact;
}

function definirUrgence(eleve, payload) {
  const nom = text(payload.urgenceNom);
  const tel = text(payload.urgenceTelephone);
  if (nom || tel) eleve.urgence = { nom, telephone: tel };
  else if (payload.urgenceNom !== undefined) delete eleve.urgence;
}

export function retirerResponsable(state, eleve, contactId) {
  eleve.responsables = (eleve.responsables || []).filter((r) => r.contactId !== Number(contactId));
  if (eleve.responsables.length && !eleve.responsables.some((r) => r.principal)) eleve.responsables[0].principal = true;
  eleve.parent = nomContact(responsablePrincipal(state, eleve)?.contact) || '';
}
