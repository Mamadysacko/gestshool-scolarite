import { nextId } from './annees.js';
import { logOperation } from './audit.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';
import { auProgramme, ensureProgrammes } from './programme.js';

// ── Référentiels de la paie : types d'employés, matières, personnel, affectations, heures du mois ──
// Rémunération : salaire mensuel + primes, ou — pour les enseignants du collège et du lycée — paiement à l'heure :
// le tarif horaire est fixé une fois dans la fiche, les heures dispensées sont saisies chaque mois (une seule
// valeur par enseignant, affectation et mois, mise à jour avec historique). Les retenues fixes ne sont plus utilisées.
// Toutes les références (type, année, classe, matière, employé) sont vérifiées à l'écriture (clés étrangères).

export const TYPES_EMPLOYE_DEFAUT = [
  { libelle: 'Directeur' }, { libelle: 'Comptable' }, { libelle: 'Enseignant', enseignant: true }, { libelle: 'Surveillant' },
  { libelle: 'Gardien' }, { libelle: 'Secrétaire' }, { libelle: 'Agent d’entretien' }
];
export const MATIERES_DEFAUT = ['Français', 'Mathématiques', 'Anglais', 'Physique-Chimie', 'Sciences de la vie et de la Terre', 'Histoire-Géographie', 'Éducation civique', 'Philosophie', 'Éducation physique', 'Informatique'];
export const CONTRATS = { cdi: 'CDI', cdd: 'CDD', vacataire: 'Vacataire', stage: 'Stage', autre: 'Autre' };
export const STATUTS_EMPLOYE = { actif: 'Actif', suspendu: 'Suspendu', sorti: 'Sorti' };
export const MODES_REMUNERATION = { fixe: 'Salaire mensuel', horaire: 'Payé à l’heure' };

const text = (v) => String(v ?? '').trim();
const money = (v) => Math.max(Math.floor(Number(v || 0)), 0);
const isDate = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);

// Initialise les collections de la paie (anciennes données comprises) ; idempotent
export function ensurePaieState(state) {
  ['typesEmploye', 'matieres', 'personnel', 'affectations', 'heuresRealisees', 'avances', 'paies', 'entreesCaisse'].forEach((key) => {
    if (!Array.isArray(state[key])) state[key] = [];
  });
  if (!state.compteursPaie || typeof state.compteursPaie !== 'object') state.compteursPaie = {};
  if (!state.typesEmploye.length) TYPES_EMPLOYE_DEFAUT.forEach((t, i) => state.typesEmploye.push({ id: i + 1, libelle: t.libelle, enseignant: Boolean(t.enseignant), actif: true }));
  if (!state.matieres.length) MATIERES_DEFAUT.forEach((nom, i) => state.matieres.push({ id: i + 1, nom, actif: true }));
  ensureProgrammes(state);
  migrerRemunerations(state);
  return state;
}

// Mise à niveau des rémunérations (idempotente, version 3) :
//  - une ancienne retenue fixe n'est plus appliquée (trace dans l'historique) ;
//  - un enseignant payé à l'heure garde son tarif horaire ; s'il avait été converti en « salaire mensuel à
//    définir » par la version précédente, son paiement à l'heure est rétabli avec le tarif conservé dans l'historique.
function migrerRemunerations(state) {
  state.personnel.forEach((e) => {
    const r = e.remuneration || {};
    if (r.version === 3) return;
    if (!Array.isArray(e.historique)) e.historique = [];
    const notes = [];
    let mode = r.mode === 'horaire' ? 'horaire' : 'fixe';
    let taux = Math.max(Math.floor(Number(r.tauxHoraire || 0)), 0);
    if (r.version === 2 && mode === 'fixe' && !Number(r.salaireBase)) {
      const trace = e.historique.map((h) => String(h.avant || '')).find((t) => /salaire horaire \((\d+) \/ h\)/.test(t));
      const m = trace && /salaire horaire \((\d+) \/ h\)/.exec(trace);
      if (m && Number(m[1]) > 0) { mode = 'horaire'; taux = Number(m[1]); notes.push(`paiement à l’heure rétabli (${taux} / h)`); }
    }
    if (Number(r.retenueFixe || 0) > 0) notes.push(`retenue fixe « ${r.libelleRetenue || 'Retenues'} » de ${Number(r.retenueFixe)} supprimée`);
    e.remuneration = {
      mode, salaireBase: mode === 'fixe' ? Math.max(Math.floor(Number(r.salaireBase || 0)), 0) : 0, tauxHoraire: mode === 'horaire' ? taux : 0,
      primeFixe: Math.max(Math.floor(Number(r.primeFixe || 0)), 0), libellePrime: r.libellePrime || 'Primes et indemnités', version: 3
    };
    if (notes.length) e.historique.push({ horodatage: new Date().toISOString(), par: 'Mise à jour de l’application', type: 'remuneration', avant: notes.join(' ; '), apres: SUIVIS.remuneration(e) });
  });
}

// ── Types d'employés (personnalisables) ──
export function saveTypeEmploye(state, payload = {}) {
  const libelle = text(payload.libelle);
  if (!libelle) throw new Error('Le libellé du type d’employé est obligatoire.');
  const id = Number(payload.id || 0);
  if (state.typesEmploye.some((t) => t.id !== id && t.libelle.toLocaleLowerCase('fr') === libelle.toLocaleLowerCase('fr'))) throw new Error('Ce type d’employé existe déjà.');
  if (id) {
    const item = state.typesEmploye.find((t) => t.id === id);
    if (!item) throw new Error('Type d’employé introuvable.');
    Object.assign(item, { libelle, enseignant: Boolean(payload.enseignant), actif: payload.actif !== false });
    return item;
  }
  const item = { id: nextId(state.typesEmploye), libelle, enseignant: Boolean(payload.enseignant), actif: true };
  state.typesEmploye.push(item);
  return item;
}

export function toggleTypeEmploye(state, id) {
  const item = state.typesEmploye.find((t) => t.id === Number(id));
  if (!item) throw new Error('Type d’employé introuvable.');
  item.actif = !item.actif;
  return item;
}

// ── Matières (pour les affectations des enseignants) ──
export function saveMatiere(state, payload = {}) {
  const nom = text(payload.nom);
  if (!nom) throw new Error('Le nom de la matière est obligatoire.');
  const id = Number(payload.id || 0);
  if (state.matieres.some((m) => m.id !== id && m.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'))) throw new Error('Cette matière existe déjà.');
  if (id) {
    const item = state.matieres.find((m) => m.id === id);
    if (!item) throw new Error('Matière introuvable.');
    item.nom = nom;
    return item;
  }
  const item = { id: nextId(state.matieres), nom, actif: true };
  state.matieres.push(item);
  return item;
}

export function toggleMatiere(state, id) {
  const item = state.matieres.find((m) => m.id === Number(id));
  if (!item) throw new Error('Matière introuvable.');
  item.actif = !item.actif;
  return item;
}

// ── Personnel ──
// Matricule automatique unique : EMP-AAAA-NNNN (année d'embauche)
export function generateMatriculeEmploye(state, dateEmbauche) {
  const year = String(dateEmbauche || todayISO()).slice(0, 4);
  const prefix = `EMP-${year}-`;
  const max = state.personnel.map((e) => e.matricule).filter((m) => m?.startsWith(prefix)).reduce((m, v) => Math.max(m, Number(v.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function typeOf(state, employe) {
  return state.typesEmploye.find((t) => t.id === employe?.typeEmployeId) || null;
}

export function isEnseignant(state, employe) {
  return Boolean(typeOf(state, employe)?.enseignant);
}

export function nomEmploye(employe) {
  return employe ? `${employe.prenom} ${employe.nom}` : '—';
}

function normalizeEmploye(state, payload, existing = null) {
  const nom = text(payload.nom);
  const prenom = text(payload.prenom);
  if (!nom || !prenom) throw new Error('Le nom et le prénom sont obligatoires.');
  const typeEmployeId = Number(payload.typeEmployeId || 0);
  if (!state.typesEmploye.some((t) => t.id === typeEmployeId)) throw new Error('Choisissez un type d’employé valide.');
  ['dateNaissance', 'dateEmbauche', 'contratDebut', 'contratFin'].forEach((k) => { if (!isDate(payload[k])) throw new Error('Date invalide.'); });
  if (payload.contratFin && payload.contratDebut && payload.contratFin < payload.contratDebut) throw new Error('La fin du contrat doit suivre son début.');
  const matricule = text(payload.matricule) || existing?.matricule || generateMatriculeEmploye(state, payload.dateEmbauche);
  if (state.personnel.some((e) => e.id !== existing?.id && e.matricule === matricule)) throw new Error('Ce matricule est déjà attribué.');
  return {
    matricule, nom, prenom, sexe: payload.sexe === 'F' ? 'F' : 'M', dateNaissance: payload.dateNaissance || '',
    telephone: text(payload.telephone), email: text(payload.email), adresse: text(payload.adresse),
    typeEmployeId, fonction: text(payload.fonction) || state.typesEmploye.find((t) => t.id === typeEmployeId).libelle,
    contrat: { type: CONTRATS[payload.contratType] ? payload.contratType : 'cdi', debut: payload.contratDebut || payload.dateEmbauche || '', fin: payload.contratFin || '' },
    dateEmbauche: payload.dateEmbauche || '', statut: STATUTS_EMPLOYE[payload.statut] ? payload.statut : 'actif'
  };
}

// ── Rémunération : définie à part de la fiche (étape « Rémunérations »), par un administrateur ──
// Salaire mensuel, ou — enseignant uniquement — paiement à l'heure (tarif horaire × heures saisies chaque mois).
// Chaque changement est historisé ; les paies déjà validées gardent leurs montants.
const REMUNERATION_VIDE = { mode: 'fixe', salaireBase: 0, tauxHoraire: 0, primeFixe: 0, libellePrime: 'Primes et indemnités', version: 3 };

export function remunerationDefinie(employe) {
  const r = employe?.remuneration || {};
  return r.mode === 'horaire' ? Number(r.tauxHoraire) > 0 : Number(r.salaireBase) > 0;
}

function normalizeRemuneration(state, employe, payload) {
  const mode = payload.mode === 'horaire' ? 'horaire' : 'fixe';
  const salaireBase = mode === 'fixe' ? money(payload.salaireBase) : 0;
  const tauxHoraire = mode === 'horaire' ? money(payload.tauxHoraire) : 0;
  if (mode === 'horaire' && !isEnseignant(state, employe)) throw new Error('Le paiement à l’heure est réservé aux enseignants (collège et lycée).');
  if (mode === 'horaire' && tauxHoraire <= 0) throw new Error('Le tarif horaire est obligatoire pour un enseignant payé à l’heure.');
  if (mode === 'fixe' && salaireBase <= 0) throw new Error('Le salaire mensuel est obligatoire.');
  return { mode, salaireBase, tauxHoraire, primeFixe: money(payload.primeFixe), libellePrime: text(payload.libellePrime) || 'Primes et indemnités', version: 3 };
}

export function definirRemuneration(state, id, payload = {}) {
  const employe = state.personnel.find((e) => e.id === Number(id));
  if (!employe) throw new Error('Employé introuvable.');
  return withTransaction(state, () => {
    const premiere = !remunerationDefinie(employe);
    const remuneration = normalizeRemuneration(state, employe, payload);
    const avant = premiere ? 'non définie' : SUIVIS.remuneration(employe);
    const apres = SUIVIS.remuneration({ ...employe, remuneration });
    if (!premiere && avant === apres) return employe;
    employe.remuneration = remuneration;
    if (!Array.isArray(employe.historique)) employe.historique = [];
    employe.historique.push({ horodatage: new Date().toISOString(), par: currentUser()?.nom || '', type: 'remuneration', avant, apres, motif: text(payload.motif) });
    logOperation(state, 'personnel', `Rémunération de ${employe.matricule} — ${nomEmploye(employe)} ${premiere ? 'définie' : 'modifiée'} : ${apres}`);
    return employe;
  });
}

// Champs suivis dans l'historique (contrat, salaire, fonction, type, statut)
const SUIVIS = {
  fonction: (e) => e.fonction, type: (e) => e.typeEmployeId, statut: (e) => e.statut,
  contrat: (e) => `${e.contrat.type} ${e.contrat.debut}→${e.contrat.fin || '…'}`,
  remuneration: (e) => (e.remuneration.mode === 'horaire' ? `payé à l’heure ${e.remuneration.tauxHoraire} / h` : `salaire mensuel ${e.remuneration.salaireBase}`) + ` prime ${e.remuneration.primeFixe}`
};

// La fiche (identité, poste, contrat) s'enregistre sans rémunération : celle-ci se définit ensuite dans
// « Rémunérations ». Une paie ne peut pas être validée tant que la rémunération n'est pas définie.
export function createEmploye(state, payload = {}) {
  return withTransaction(state, () => {
    const data = normalizeEmploye(state, payload);
    const item = { id: nextId(state.personnel), ...data, remuneration: { ...REMUNERATION_VIDE }, photo: payload.photo || null, historique: [{ horodatage: new Date().toISOString(), par: currentUser()?.nom || '', type: 'creation', detail: `Embauche : ${data.fonction}` }], creeLe: Date.now() };
    state.personnel.push(item);
    logOperation(state, 'personnel', `Employé ${item.matricule} — ${nomEmploye(item)} (${item.fonction}) créé`);
    return item;
  });
}

// Mise à jour de la fiche : chaque changement de contrat, fonction, type ou statut est historisé. La
// rémunération n'est jamais modifiée ici (voir definirRemuneration).
export function updateEmploye(state, id, payload = {}) {
  const item = state.personnel.find((e) => e.id === Number(id));
  if (!item) return null;
  return withTransaction(state, () => {
    const data = normalizeEmploye(state, payload, item);
    if (item.remuneration?.mode === 'horaire' && !state.typesEmploye.find((t) => t.id === data.typeEmployeId)?.enseignant) throw new Error('Cet employé est payé à l’heure (réservé aux enseignants) : passez d’abord sa rémunération en salaire mensuel dans « Rémunérations ».');
    const now = new Date().toISOString();
    const par = currentUser()?.nom || '';
    Object.entries(SUIVIS).forEach(([champ, read]) => {
      const avant = read(item);
      const apres = read({ ...item, ...data });
      if (String(avant) !== String(apres)) item.historique.push({ horodatage: now, par, type: champ, avant, apres });
    });
    Object.assign(item, data);
    if (payload.photo) item.photo = payload.photo;
    logOperation(state, 'personnel', `Fiche ${item.matricule} — ${nomEmploye(item)} modifiée`);
    return item;
  });
}

// ── Affectations des enseignants ──
// Primaire : affectation fixe à une classe (un titulaire par classe, une classe par enseignant et par année).
// Collège / lycée : affectations multiples (plusieurs classes, matières et niveaux) ; la matière doit figurer au
// programme de la classe ; une même matière d'une même classe n'est assurée que par un seul enseignant à la fois.
export function niveauDeClasse(state, classeId) {
  return state.classes.find((c) => c.id === Number(classeId))?.categorie || '';
}

export function saveAffectation(state, payload = {}) {
  const employe = state.personnel.find((e) => e.id === Number(payload.employeId));
  if (!employe) throw new Error('Choisissez un enseignant.');
  if (!isEnseignant(state, employe)) throw new Error('Seul un employé de type enseignant peut recevoir une affectation.');
  const anneeId = Number(payload.anneeId);
  if (!state.annees.some((a) => a.id === anneeId)) throw new Error('Année scolaire introuvable.');
  const classe = state.classes.find((c) => c.id === Number(payload.classeId) && c.anneeId === anneeId);
  if (!classe) throw new Error('Classe introuvable pour cette année scolaire.');
  const matiereId = Number(payload.matiereId || 0);
  if (matiereId && !state.matieres.some((m) => m.id === matiereId)) throw new Error('Matière introuvable.');
  const primaire = classe.categorie === 'Primaire';
  if (!primaire && !matiereId) throw new Error('Au collège et au lycée, choisissez la matière enseignée.');
  if (!primaire && !auProgramme(state, classe.id, matiereId)) throw new Error(`${state.matieres.find((m) => m.id === matiereId)?.nom || 'Cette matière'} n’est pas au programme de ${classe.nom}.`);
  const id = Number(payload.id || 0);
  const others = state.affectations.filter((a) => a.id !== id && a.actif && a.anneeId === anneeId);
  if (primaire) {
    if (others.some((a) => a.classeId === classe.id && niveauDeClasse(state, a.classeId) === 'Primaire' && a.employeId !== employe.id)) throw new Error(`La classe ${classe.nom} a déjà un enseignant titulaire pour cette année.`);
    if (others.some((a) => a.employeId === employe.id && niveauDeClasse(state, a.classeId) === 'Primaire' && a.classeId !== classe.id)) throw new Error('Au primaire, un enseignant est affecté à une seule classe par année.');
  }
  if (others.some((a) => a.employeId === employe.id && a.classeId === classe.id && Number(a.matiereId || 0) === matiereId)) throw new Error(`Affectation déjà enregistrée : ${classe.nom}${matiereId ? ` · ${state.matieres.find((m) => m.id === matiereId)?.nom}` : ''}.`);
  const occupe = !primaire && others.find((a) => a.classeId === classe.id && Number(a.matiereId || 0) === matiereId && a.employeId !== employe.id);
  if (occupe) throw new Error(`${state.matieres.find((m) => m.id === matiereId)?.nom} en ${classe.nom} est déjà assurée par ${nomEmploye(state.personnel.find((e) => e.id === occupe.employeId))} : clôturez d’abord son affectation.`);
  const data = { employeId: employe.id, anneeId, classeId: classe.id, matiereId, salle: text(payload.salle), actif: true };
  if (id) {
    const item = state.affectations.find((a) => a.id === id);
    if (!item) throw new Error('Affectation introuvable.');
    Object.assign(item, data);
    return item;
  }
  const item = { id: nextId(state.affectations), ...data, creeLe: Date.now() };
  state.affectations.push(item);
  return item;
}

// Plusieurs affectations d'un même enseignant en une fois (tout ou rien) ; les lignes en double sont ignorées
export function saveAffectations(state, { employeId, anneeId, lignes = [] } = {}) {
  const uniques = [];
  const vues = new Set();
  (Array.isArray(lignes) ? lignes : []).forEach((l) => {
    const key = `${Number(l.classeId)}|${Number(l.matiereId || 0)}`;
    if (!vues.has(key)) { vues.add(key); uniques.push(l); }
  });
  if (!uniques.length) throw new Error('Ajoutez au moins une ligne d’affectation.');
  return withTransaction(state, () => uniques.map((l) => saveAffectation(state, { employeId, anneeId, classeId: l.classeId, matiereId: l.matiereId, salle: l.salle })));
}

// Une affectation n'est jamais supprimée (les paies passées y font référence) : elle est désactivée
export function closeAffectation(state, id) {
  const item = state.affectations.find((a) => a.id === Number(id));
  if (!item) throw new Error('Affectation introuvable.');
  item.actif = false;
  item.dateFin = todayISO();
  return item;
}

export function libelleAffectation(state, a) {
  const classe = state.classes.find((c) => c.id === a.classeId);
  const matiere = state.matieres.find((m) => m.id === a.matiereId);
  return `${classe?.nom || '—'}${matiere ? ` · ${matiere.nom}` : ' · classe complète'}${a.salle ? ` · salle ${a.salle}` : ''}`;
}

// ── Heures du mois des enseignants payés à l'heure (collège / lycée) ──
// Un seul enregistrement par enseignant et par mois (lignes par affectation). Une nouvelle saisie du même mois
// met à jour cet enregistrement et ajoute une entrée à son historique (avant → après, auteur, date). Les heures
// d'un mois dont la paie est validée ou payée sont verrouillées (annuler la paie pour les corriger).
export function estPayeALHeure(employe) {
  return employe?.remuneration?.mode === 'horaire';
}

function anneeDuMois(state, mois) {
  const first = `${mois}-01`;
  return state.annees.find((a) => a.dateDebut && a.dateFin && a.dateDebut.slice(0, 7) <= mois && first <= a.dateFin) || state.annees.find((a) => a.id === state.anneeActiveId) || null;
}

// Affectations collège / lycée d'un enseignant valables pour le mois (actives, ou clôturées pendant / après ce mois),
// dans l'année scolaire couvrant le mois et dans l'année active (rentrée en cours de préparation)
export function affectationsHorairesDuMois(state, employeId, mois) {
  const annees = new Set([anneeDuMois(state, mois)?.id, state.anneeActiveId].filter(Boolean).map(Number));
  return state.affectations.filter((a) => a.employeId === Number(employeId) && annees.has(Number(a.anneeId))
    && niveauDeClasse(state, a.classeId) !== 'Primaire' && (a.actif || (a.dateFin || '') >= `${mois}-01`));
}

export function heuresDuMois(state, employeId, mois) {
  return (state.heuresRealisees || []).find((h) => h.employeId === Number(employeId) && h.mois === mois && Array.isArray(h.lignes)) || null;
}

export function heuresVerrouillees(state, employeId, mois) {
  return state.paies.some((p) => p.employeId === Number(employeId) && p.mois === mois && (p.statut === 'validee' || p.statut === 'payee'));
}

const formatHeures = (lignes) => lignes.length ? lignes.map((l) => `${l.libelle} : ${l.heures} h`).join(' ; ') : 'aucune heure';
const arrondiHeures = (v) => Math.round(Math.max(Number(String(v ?? '').replace(',', '.')) || 0, 0) * 100) / 100;

// entrees : [{ employeId, lignes: [{ affectationId, heures }] }] — tout ou rien
export function setHeuresMois(state, mois, entrees = []) {
  if (!/^\d{4}-\d{2}$/.test(mois || '')) throw new Error('Mois invalide.');
  if (!Array.isArray(state.heuresRealisees)) state.heuresRealisees = [];
  return withTransaction(state, () => {
    const now = new Date().toISOString();
    const auteur = currentUser()?.nom || '';
    const touches = [];
    entrees.forEach((entree) => {
      const employe = state.personnel.find((e) => e.id === Number(entree.employeId));
      if (!employe) throw new Error('Enseignant introuvable.');
      if (!estPayeALHeure(employe)) throw new Error(`${nomEmploye(employe)} n’est pas payé à l’heure.`);
      const affs = affectationsHorairesDuMois(state, employe.id, mois);
      const lignes = (Array.isArray(entree.lignes) ? entree.lignes : []).map((l) => {
        const affectationId = Number(l.affectationId || 0);
        const heures = arrondiHeures(l.heures);
        if (heures > 300) throw new Error(`Nombre d’heures invalide pour ${nomEmploye(employe)}.`);
        const aff = affectationId ? affs.find((a) => a.id === affectationId) : null;
        if (affectationId && !aff) throw new Error(`Affectation invalide pour ${nomEmploye(employe)} en ${mois}.`);
        return { affectationId, libelle: aff ? libelleAffectation(state, aff) : 'Autres heures', heures };
      }).filter((l) => l.heures > 0);
      const existant = heuresDuMois(state, employe.id, mois);
      const avant = existant ? formatHeures(existant.lignes) : '';
      const apres = formatHeures(lignes);
      if (existant && avant === apres) return;
      if (!existant && !lignes.length) return;
      if (heuresVerrouillees(state, employe.id, mois)) throw new Error(`La paie de ${mois} de ${nomEmploye(employe)} est déjà validée : annulez-la pour corriger ses heures.`);
      const totalHeures = Math.round(lignes.reduce((s, l) => s + l.heures, 0) * 100) / 100;
      if (existant) {
        Object.assign(existant, { lignes, totalHeures, tauxHoraire: money(employe.remuneration.tauxHoraire), modifieLe: now, modifiePar: auteur });
        existant.historique.push({ horodatage: now, par: auteur, avant, apres });
        touches.push(existant);
      } else {
        const item = { id: nextId(state.heuresRealisees), employeId: employe.id, mois, lignes, totalHeures, tauxHoraire: money(employe.remuneration.tauxHoraire), saisiLe: now, saisiPar: auteur, historique: [{ horodatage: now, par: auteur, avant: '', apres }] };
        state.heuresRealisees.push(item);
        touches.push(item);
      }
      logOperation(state, 'paie', `Heures de ${mois} — ${nomEmploye(employe)} : ${totalHeures} h${existant ? ' (mise à jour)' : ''}`);
    });
    return touches;
  });
}


