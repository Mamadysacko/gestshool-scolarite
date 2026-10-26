import { createInscription, generateEcheancesForInscription } from './inscriptions.js';
import { withTransaction } from './transaction.js';
import { currentUser } from './auth.js';
import { todayISO } from './utils.js';

// Passage en classe supérieure et réinscriptions.
// Procédure : 1) décision de fin d'année de chaque élève (conseil de classe) ; 2) classe de destination proposée
// automatiquement d'après le NIVEAU de la classe (admis → niveau supérieur, redoublant → même niveau), modifiable ;
// 3) validation groupée avec récapitulatif. Aucun élève n'est réinscrit sans décision.
export const DECISIONS = {
  admis: 'Admis(e) en classe supérieure',
  redouble: 'Redouble',
  non_admis: 'Non admis(e)',
  depart: 'Départ / transfert'
};
const AUTORISEES = ['admis', 'redouble'];

// ── Niveaux scolaires (cursus) : rang croissant de la première année du primaire à la terminale ──
// Le niveau est reconnu dans le nom de la classe, dans la nomenclature guinéenne (CP1, CP2, CE1… CM2, 7e… 12e,
// Terminale) comme française (CP, 6e, 5e, 4e, 3e, 2nde, 1ère, Terminale). « Niveau supérieur » = le plus petit
// rang supérieur parmi les classes existantes de l'année de destination (CP → CP2 ou CE1 selon l'établissement).
const RANG_TERMINALE = 13;
const LIBELLES_RANG = { 1: 'CP / CP1', 2: 'CP2', 3: 'CE1', 4: 'CE2', 5: 'CM1', 6: 'CM2', 7: '7e année / 6e', 8: '8e année / 5e', 9: '9e année / 4e', 10: '10e année / 3e', 11: '11e année / 2nde', 12: '12e année / 1ère', 13: 'Terminale' };
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function niveauScolaire(nom) {
  const n = sansAccent(nom);
  let m;
  if ((m = /^(cp|ce|cm)\s*([12])?(?![0-9])/.exec(n))) {
    const base = { cp: 1, ce: 3, cm: 5 }[m[1]];
    const rang = base + (m[2] ? Number(m[2]) - 1 : 0);
    return { rang, libelle: LIBELLES_RANG[rang], section: n.slice(m[0].length).trim() };
  }
  if ((m = /^(terminale|term|tle)\b\.?/.exec(n))) return { rang: RANG_TERMINALE, libelle: LIBELLES_RANG[13], section: n.slice(m[0].length).trim() };
  if ((m = /^(2nde|2nd|seconde)\b/.exec(n))) return { rang: 11, libelle: LIBELLES_RANG[11], section: n.slice(m[0].length).trim() };
  if ((m = /^(1ere|1re|1er|premiere)\b/.exec(n))) return { rang: 12, libelle: LIBELLES_RANG[12], section: n.slice(m[0].length).trim() };
  if ((m = /^(\d{1,2})\s*(?:e|eme|ieme|e\s*annee|eme\s*annee)?\b(?:\s*annee)?/.exec(n))) {
    const num = Number(m[1]);
    const section = n.slice(m[0].length).trim();
    if (num >= 7 && num <= 12) return { rang: num, libelle: LIBELLES_RANG[num], section }; // Guinée : 7e → 12e
    if (num >= 3 && num <= 6) return { rang: 13 - num, libelle: LIBELLES_RANG[13 - num], section }; // France : 6e → 3e
  }
  return null;
}

const placesRestantes = (state, classe, enPlus = 0) => (Number(classe.capacite) > 0 ? Number(classe.capacite) - state.inscriptions.filter((i) => i.classeId === classe.id).length - enPlus : Infinity);

// Classe de l'année cible proposée d'après la décision : même section si possible, sinon la moins remplie
export function classeProposee(state, inscription, cibleId) {
  const classe = state.classes.find((c) => c.id === inscription.classeId);
  const statut = inscription.decision?.statut;
  if (!classe || !AUTORISEES.includes(statut)) return null;
  const niveau = niveauScolaire(classe.nom);
  const cibles = state.classes.filter((c) => c.anneeId === Number(cibleId) && c.active !== false).map((c) => ({ c, n: niveauScolaire(c.nom) })).filter((x) => x.n);
  if (!niveau) return null;
  let rang = niveau.rang;
  if (statut === 'admis') {
    const superieurs = cibles.map((x) => x.n.rang).filter((r) => r > niveau.rang);
    if (!superieurs.length) return null;
    rang = Math.min(...superieurs);
  }
  const memeRang = cibles.filter((x) => x.n.rang === rang);
  if (!memeRang.length) return null;
  return (memeRang.find((x) => x.n.section && x.n.section === niveau.section)
    || [...memeRang].sort((a, b) => placesRestantes(state, b.c) - placesRestantes(state, a.c) || a.c.nom.localeCompare(b.c.nom, 'fr'))[0]).c;
}

export function setDecision(state, inscriptionId, statut) {
  const inscription = state.inscriptions.find((i) => i.id === Number(inscriptionId));
  if (!inscription) throw new Error('Inscription introuvable.');
  if (statut && !DECISIONS[statut]) throw new Error('Décision inconnue.');
  if (!statut) { delete inscription.decision; return inscription; }
  inscription.decision = { statut, par: currentUser()?.nom || '', date: todayISO() };
  return inscription;
}

// Élèves d'une année source avec leur décision, la classe de destination (choix manuel prioritaire, sinon
// proposition automatique) et la possibilité d'inscription
export function candidatsPassage(state, sourceId, cibleId, choix = {}) {
  return state.inscriptions.filter((i) => i.anneeId === Number(sourceId) && !['abandon', 'transfere'].includes(i.statut)).map((inscription) => {
    const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
    const classe = state.classes.find((c) => c.id === inscription.classeId);
    const niveau = niveauScolaire(classe?.nom);
    const decision = inscription.decision?.statut || '';
    const deja = state.inscriptions.find((i) => i.eleveId === inscription.eleveId && i.anneeId === Number(cibleId));
    const manuelle = state.classes.find((c) => c.id === Number(choix[inscription.id]) && c.anneeId === Number(cibleId)) || null;
    const auto = classeProposee(state, inscription, cibleId);
    const proposee = AUTORISEES.includes(decision) ? manuelle || auto : null;
    let raison = '';
    if (deja) raison = 'Déjà inscrit(e) pour cette année';
    else if (!eleve?.actif) raison = 'Dossier élève inactif';
    else if (!decision) raison = 'Décision de passage à saisir';
    else if (!AUTORISEES.includes(decision)) raison = DECISIONS[decision];
    else if (!proposee) {
      if (decision === 'admis' && niveau?.rang === RANG_TERMINALE) raison = 'Fin de scolarité (terminale) : aucune classe supérieure';
      else if (!niveau) raison = 'Niveau non reconnu : choisissez la classe';
      else raison = decision === 'admis' ? 'Aucune classe de niveau supérieur dans l’année cible' : 'Aucune classe de ce niveau dans l’année cible';
    }
    return { inscription, eleve, classe, niveau, decision, proposee, auto, manuelle: Boolean(manuelle), deja, inscriptible: !raison, raison };
  }).sort((a, b) => (a.niveau?.rang || 99) - (b.niveau?.rang || 99) || String(a.classe?.nom).localeCompare(String(b.classe?.nom), 'fr') || String(a.eleve?.nom).localeCompare(String(b.eleve?.nom), 'fr'));
}

// Récapitulatif avant validation : effectif par classe de destination, places, frais de réinscription, dettes
export function recapReinscription(state, sourceId, cibleId, candidats) {
  const annee = state.annees.find((a) => a.id === Number(cibleId));
  const frais = Number(annee?.fraisReinscription || 0);
  const parClasse = new Map();
  candidats.forEach((c) => {
    const g = parClasse.get(c.proposee.id) || { classe: c.proposee, eleves: [] };
    g.eleves.push(c);
    parClasse.set(c.proposee.id, g);
  });
  const lignes = [...parClasse.values()].map((g) => ({ ...g, places: placesRestantes(state, g.classe), depassement: placesRestantes(state, g.classe, g.eleves.length) < 0, sansTarif: !state.tarifs.some((t) => t.classeId === g.classe.id && t.anneeId === Number(cibleId)) }))
    .sort((a, b) => a.classe.nom.localeCompare(b.classe.nom, 'fr'));
  const avecDette = candidats.filter((c) => (c.inscription.echeances || []).some((e) => Number(e.montant || 0) - Number(e.montantPaye || 0) - Number(e.remise || 0) > 0));
  return { annee, frais, total: frais * candidats.length, lignes, avecDette, admis: candidats.filter((c) => c.decision === 'admis').length, redoublants: candidats.filter((c) => c.decision === 'redouble').length };
}

// Inscrit les élèves sélectionnés (tout ou rien) ; chaque choix est revérifié : décision, doublon, classe
export function inscrireAdmis(state, cibleId, choix = []) {
  if (!state.annees.some((a) => a.id === Number(cibleId))) throw new Error('Année scolaire cible introuvable.');
  if (!choix.length) throw new Error('Sélectionnez au moins un élève.');
  return withTransaction(state, () => choix.map(({ inscriptionId, classeId }) => {
    const source = state.inscriptions.find((i) => i.id === Number(inscriptionId));
    const eleve = state.eleves.find((e) => e.id === source?.eleveId);
    if (!source || !eleve) throw new Error('Élève introuvable.');
    if (!AUTORISEES.includes(source.decision?.statut)) throw new Error(`${eleve.prenom} ${eleve.nom} : aucune décision d’admission ou de redoublement.`);
    const classe = state.classes.find((c) => c.id === Number(classeId) && c.anneeId === Number(cibleId));
    if (!classe) throw new Error(`${eleve.prenom} ${eleve.nom} : classe introuvable dans l’année cible.`);
    const inscription = createInscription(state, { eleveId: eleve.id, anneeId: Number(cibleId), classeId: classe.id, type: 'reinscription' });
    if (!inscription) throw new Error(`${eleve.prenom} ${eleve.nom} est déjà inscrit(e) pour cette année.`);
    inscription.origineInscriptionId = source.id;
    inscription.passage = { decision: source.decision.statut, depuisClasseId: source.classeId, depuisAnneeId: source.anneeId };
    const tarif = state.tarifs.find((t) => t.classeId === classe.id && t.anneeId === Number(cibleId));
    if (tarif) generateEcheancesForInscription(state, inscription.id, tarif);
    eleve.classeId = classe.id;
    return inscription;
  }));
}
