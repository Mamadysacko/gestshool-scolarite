import { HELP_TOPICS, HELP_CATEGORIES, UNAVAILABLE, CHECKS, FAQ_IDS } from './aide-data.js';
import { roleOf, estRoleAdmin } from './auth.js';

// Moteur de recherche du centre d'aide : questions en langage naturel, mots-clés, synonymes,
// préfixes (« inscri » → inscription) et fautes de frappe légères. Aucun appel réseau.

export function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOPWORDS = new Set(('a au aux avec ce ces cet cette comment dans de des du elle en est et faire faut il ils je la le les leur lui ma mais me mes mon ne nous on ou par pas pour qu que quel quelle quelles quels qui sa se ses si son sont sur ta te tes ton tu un une vos votre vous y d l j n s c m t '
  + 'puis peut peux veux voudrais dois doit comment ou quoi quand pourquoi combien est-ce estce ai as avoir etre fait cela ca ici svp merci aide aider').split(' '));

// Groupes de synonymes : un mot de la question active tous les mots de son groupe (poids réduit)
const SYNONYMS = [
  ['paiement', 'payer', 'paye', 'encaisser', 'encaissement', 'versement', 'verser', 'regler', 'reglement', 'acompte', 'caisse'],
  ['inscrire', 'inscription', 'inscrit', 'admission', 'admettre', 'enroler'],
  ['eleve', 'eleves', 'etudiant', 'apprenant', 'enfant', 'matricule'],
  ['depense', 'depenses', 'sortie', 'achat', 'decaisser', 'decaissement', 'charge', 'debourser'],
  ['frais', 'tarif', 'tarifs', 'scolarite', 'prix', 'cout', 'montant'],
  ['tranche', 'tranches', 'mensualite', 'mensualites', 'echeance', 'echeances', 'echeancier', 'versements'],
  ['recu', 'quittance', 'justificatif', 'facture'],
  ['rapport', 'rapports', 'statistique', 'statistiques', 'bilan', 'etat', 'releve'],
  ['exporter', 'export', 'telecharger', 'excel', 'pdf', 'csv', 'imprimer'],
  ['annuler', 'annulation', 'supprimer', 'corriger', 'erreur', 'rembourser'],
  ['retard', 'retards', 'impaye', 'impayes', 'relance', 'rappel', 'debiteur', 'arriere'],
  ['solde', 'tresorerie', 'balance', 'disponible', 'reste'],
  ['utilisateur', 'compte', 'role', 'droit', 'droits', 'permission', 'acces'],
  ['sauvegarde', 'sauvegarder', 'backup', 'copie', 'restaurer', 'restauration'],
  ['classe', 'classes', 'section', 'niveau', 'salle'],
  ['annee', 'annees', 'rentree', 'exercice'],
  ['configuration', 'parametre', 'parametres', 'reglage', 'reglages', 'configurer'],
  ['excedent', 'surplus', 'plus', 'trop', 'avance', 'depasse', 'depasser']
];

const SYNONYM_INDEX = new Map();
SYNONYMS.forEach((group) => group.forEach((word) => SYNONYM_INDEX.set(word, group)));

export function tokenize(text) {
  return normalize(text).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

// Racine grossière du français : pluriels et terminaisons verbales courantes
function stem(word) {
  return word.replace(/(ements|ement|ations|ation|euses|euse|eurs|eur|ions|ees|es|er|ez|e|s|x)$/, '') || word;
}

function editDistanceAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Qualité de correspondance d'un mot de la question avec un mot indexé (0 à 1)
function wordMatch(query, word) {
  if (query === word) return 1;
  const qs = stem(query); const ws = stem(word);
  if (qs.length >= 3 && qs === ws) return 0.95;
  if (query.length >= 4 && word.startsWith(query)) return 0.85;
  if (qs.length >= 4 && ws.startsWith(qs)) return 0.8;
  if (query.length >= 5 && word.length >= 5 && editDistanceAtMostOne(query, word)) return 0.6;
  return 0;
}

const FIELD_WEIGHTS = { titre: 6, motsCles: 5, categorie: 3, chemin: 3, description: 2, etapes: 1 };

function indexTopic(topic) {
  const category = HELP_CATEGORIES.find((c) => c.id === topic.categorie);
  const words = (text) => [...new Set(normalize(text).split(' ').filter((w) => w && !STOPWORDS.has(w)))];
  return {
    topic,
    fields: {
      titre: words(topic.titre),
      motsCles: words(topic.motsCles.join(' ')),
      categorie: words(category?.label || ''),
      chemin: words(topic.chemin.join(' ')),
      description: words(topic.description),
      etapes: words(topic.etapes.join(' '))
    },
    phrases: topic.motsCles.map(normalize).filter((p) => p.includes(' '))
  };
}

let INDEX = null;
const index = () => { if (!INDEX) INDEX = HELP_TOPICS.map(indexTopic); return INDEX; };

function scoreTopic(entry, tokens, normalizedQuery) {
  let score = 0;
  let matched = 0;
  tokens.forEach((token) => {
    const group = SYNONYM_INDEX.get(token) || SYNONYM_INDEX.get(stem(token)) || [];
    let best = 0;
    Object.entries(entry.fields).forEach(([field, words]) => {
      const weight = FIELD_WEIGHTS[field];
      words.forEach((word) => {
        const direct = wordMatch(token, word);
        const viaSynonym = direct ? 0 : (group.some((syn) => wordMatch(syn, word) >= 0.95) ? 0.55 : 0);
        best = Math.max(best, weight * Math.max(direct, viaSynonym));
      });
    });
    if (best > 0) matched += 1;
    score += best;
  });
  // Expression exacte (« tableau de bord », « solde ouverture »…) présente dans la question
  entry.phrases.forEach((phrase) => { if (normalizedQuery.includes(phrase)) score += 6; });
  if (tokens.length && matched === tokens.length) score *= 1.25;
  // À pertinence égale, les opérations les plus courantes passent devant
  if (score > 0 && FAQ_IDS.includes(entry.topic.id)) score += 0.5;
  return { score, matched };
}

// Fonctionnalités absentes de l'application évoquées par la question
export function unavailableMatches(query) {
  const q = ` ${normalize(query)} `;
  const tokens = tokenize(query);
  return UNAVAILABLE.filter((u) => u.motsCles.some((k) => {
    const nk = normalize(k);
    if (nk.includes(' ')) return q.includes(` ${nk} `);
    return tokens.some((t) => t === nk || (t.length >= 5 && stem(t) === stem(nk)));
  }));
}

// Recherche principale : fiches triées par pertinence + fonctionnalités inexistantes signalées
export function searchHelp(query, { limit = 12, categorie = '' } = {}) {
  const tokens = tokenize(query);
  const normalizedQuery = normalize(query);
  const unavailable = unavailableMatches(query);
  if (!tokens.length) {
    const all = HELP_TOPICS.filter((t) => !categorie || t.categorie === categorie);
    return { results: all.map((topic) => ({ topic, score: 0 })), unavailable, query: normalizedQuery };
  }
  const minimum = tokens.length === 1 ? 2.5 : 3.5;
  const results = index()
    .filter((e) => !categorie || e.topic.categorie === categorie)
    .map((entry) => ({ topic: entry.topic, ...scoreTopic(entry, tokens, normalizedQuery) }))
    .filter((r) => r.score >= minimum)
    .sort((a, b) => b.score - a.score || faqRank(a.topic.id) - faqRank(b.topic.id) || a.topic.titre.localeCompare(b.topic.titre, 'fr'))
    .slice(0, limit);
  // Question portant sur une fonctionnalité absente (« affecter un enseignant à une classe ») : on ne garde que
  // les fiches qui couvrent TOUTE la question, pour ne pas suggérer une fonction qui n'y répond pas.
  const kept = unavailable.length ? results.filter((r) => r.matched === tokens.length) : results;
  return { results: kept, unavailable, query: normalizedQuery };
}

// Rang dans les questions fréquentes (les plus courantes d'abord), pour départager deux fiches de même score
function faqRank(id) {
  const index = FAQ_IDS.indexOf(id);
  return index === -1 ? FAQ_IDS.length : index;
}

export function topicById(id) {
  return HELP_TOPICS.find((t) => t.id === id) || null;
}

// Prérequis évalués sur les données actuelles
export function evaluatePrerequisites(state, topic) {
  return (topic.prerequis || []).map((p) => {
    const check = p.check ? CHECKS[p.check] : null;
    return { ...p, label: check?.label || p.texte, ok: check ? Boolean(check.test(state)) : true };
  });
}

// Accès à la fonctionnalité : rôle, page autorisée, prérequis obligatoires manquants
// Accès d'un rôle (de base ou personnalisé) à une fiche : selon le niveau requis (consultation, saisie,
// administration) et les pages que le rôle peut ouvrir. Les rôles étant modifiables, on se fonde sur leurs droits réels.
export function roleCanTopic(topic, roleId, pages = null) {
  if (!roleId) return false;
  const def = roleOf(roleId);
  const need = topic.roles.includes('lecture') ? 'read' : topic.roles.includes('comptable') ? 'write' : 'admin';
  const allowed = estRoleAdmin(roleId) || need === 'read' || (need === 'write' && Boolean(def?.write));
  const list = pages || def?.pages || [];
  return allowed && (!topic.page || list.includes(topic.page));
}

export function accessStatus(state, topic, role, allowedPages) {
  const prereqs = evaluatePrerequisites(state, topic);
  const missing = prereqs.filter((p) => p.obligatoire && !p.ok);
  const roleOk = roleCanTopic(topic, role, allowedPages);
  return { roleOk, navigable: Boolean(topic.page) && roleOk, missing, prereqs };
}
