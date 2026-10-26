import { todayISO } from './utils.js';
import { inscriptionSituation, studentOf, classOf, yearLabel } from './finance.js';
import { resteEcheance, ordreEcheances, libelleEcheance } from './allocation.js';
import { paymentYear, situationCaisse } from './tresorerie.js';
import { soldesComptes, compteLabel, TYPES_COMPTE } from './comptes.js';
import { listeCreances } from './creances.js';
import { mouvementsCompte, soldeOuvertureTheorique } from './caisse.js';
import { MODES_PAIEMENT } from './paiements.js';
import { reductionLabel, TYPES_REDUCTION } from './reductions.js';
import { STATUTS_ATTENTE } from './attente.js';
import { logOperation } from './audit.js';
import { exiger } from './auth.js';

// États financiers : chaque rapport produit un tableau unique { titre, colonnes, lignes, total, notes }.
// Le même tableau sert à l'écran, à l'impression (PDF) et aux exports Excel / CSV : les chiffres exportés sont
// exactement ceux affichés. Tous les montants viennent des opérations enregistrées ; les opérations annulées et les
// règlements en attente sont exclus des totaux, sauf dans les états qui les listent explicitement.
// Il s'agit d'une GESTION DE TRÉSORERIE ET DE RECOUVREMENT, pas d'une comptabilité générale (pas de plan comptable
// ni d'écritures en partie double) : aucune conformité comptable ou fiscale n'est revendiquée.

export const ETATS = [
  { id: 'attendus', label: 'Frais attendus, encaissés, restants', groupe: 'Recouvrement' },
  { id: 'debiteurs', label: 'Élèves débiteurs', groupe: 'Recouvrement' },
  { id: 'retards', label: 'Échéances en retard', groupe: 'Recouvrement' },
  { id: 'reductions', label: 'Réductions et exonérations', groupe: 'Recouvrement' },
  { id: 'recettes', label: 'Recettes par période', groupe: 'Recettes' },
  { id: 'agents', label: 'Recettes par agent', groupe: 'Recettes' },
  { id: 'modes', label: 'Recettes par mode de paiement', groupe: 'Recettes' },
  { id: 'depenses', label: 'Dépenses par catégorie et période', groupe: 'Dépenses' },
  { id: 'journal-caisse', label: 'Journal de caisse', groupe: 'Trésorerie' },
  { id: 'tresorerie', label: 'Situation de trésorerie', groupe: 'Trésorerie' },
  { id: 'clotures', label: 'Clôtures de caisse et rapprochements', groupe: 'Trésorerie' },
  { id: 'comparaison', label: 'Comparaison des années scolaires', groupe: 'Pilotage' },
  { id: 'budget', label: 'Budget prévisionnel et réalisé', groupe: 'Pilotage' },
  { id: 'annulations', label: 'Annulations et corrections', groupe: 'Contrôle' },
  { id: 'transactions', label: 'Historique des transactions', groupe: 'Contrôle' }
];

export const GRANULARITES = { jour: 'Par jour', mois: 'Par mois', annee: 'Par année civile' };

export function filtresEtatsDefaut(state) {
  return { type: 'attendus', yearId: Number(state.anneeActiveId || 0), category: '', classId: 0, from: '', to: '', agent: '', mode: '', compteId: 0, gran: 'mois', search: '' };
}

const num = (v) => Number(v || 0);
const veilleDe = (iso) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dans = (date, f) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
const agentDe = (op) => op.utilisateur || op.caissier || '—';
const nomEleve = (state, i) => { const e = studentOf(state, i); return e ? `${e.prenom} ${e.nom}` : '—'; };
const periodeCle = (date, gran) => (gran === 'jour' ? date : gran === 'annee' ? date.slice(0, 4) : date.slice(0, 7));
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const periodeLibelle = (cle, gran) => (gran === 'mois' ? `${MOIS[Number(cle.slice(5, 7)) - 1]} ${cle.slice(0, 4)}` : gran === 'jour' ? cle.split('-').reverse().join('/') : cle);

// Inscriptions du périmètre (année, catégorie, classe)
function inscriptionsFiltrees(state, f) {
  return state.inscriptions.filter((i) => (!f.yearId || i.anneeId === Number(f.yearId)) && (!f.classId || i.classeId === Number(f.classId))
    && (!f.category || classOf(state, i.classeId)?.categorie === f.category));
}

// Paiements valides du périmètre : année d'encaissement, classe, catégorie, période, agent, mode, compte
export function paiementsFiltres(state, f, { annules = false } = {}) {
  return state.paiements.filter((p) => {
    if (!annules && p.annule) return false;
    if (f.yearId && paymentYear(state, p) !== Number(f.yearId)) return false;
    if (!dans(p.datePaiement, f)) return false;
    if (f.agent && agentDe(p) !== f.agent) return false;
    if (f.mode && p.mode !== f.mode) return false;
    if (f.compteId && Number(p.compteId) !== Number(f.compteId)) return false;
    if (f.classId || f.category) {
      const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
      if (f.classId && i?.classeId !== Number(f.classId)) return false;
      if (f.category && classOf(state, i?.classeId)?.categorie !== f.category) return false;
    }
    return true;
  });
}

function depensesFiltrees(state, f, { annulees = false } = {}) {
  return state.depenses.filter((d) => (annulees || !d.annule) && (!f.yearId || d.anneeId === Number(f.yearId)) && dans(d.date, f)
    && (!f.compteId || Number(d.compteId) === Number(f.compteId)) && (!f.agent || agentDe(d) === f.agent) && (!f.mode || d.mode === f.mode));
}

const somme = (lignes, col) => lignes.reduce((s, l) => s + num(l[col]), 0);
const tot = (lignes, cols, label = 'TOTAL', width = 0) => [label, ...Array(Math.max(width - 1, 0)).fill(''), ...cols.map((c) => somme(lignes, c))];

const ETAT_BUILDERS = {
  attendus(state, f) {
    const groupes = new Map();
    inscriptionsFiltrees(state, f).forEach((i) => {
      const s = inscriptionSituation(state, i);
      const remise = (i.echeances || []).reduce((t, e) => t + num(e.remise), 0);
      const g = groupes.get(i.classeId) || { classe: classOf(state, i.classeId), effectif: 0, brut: 0, remise: 0, attendu: 0, paye: 0, reste: 0, retard: 0 };
      g.effectif += 1; g.brut += s.total + remise; g.remise += remise; g.attendu += s.total; g.paye += s.paye; g.reste += s.reste; g.retard += s.retardMontant;
      groupes.set(i.classeId, g);
    });
    const lignes = [...groupes.values()].sort((a, b) => String(a.classe?.nom).localeCompare(String(b.classe?.nom), 'fr'))
      .map((g) => [g.classe?.nom || '—', g.classe?.categorie || '', g.effectif, g.brut, g.remise, g.attendu, g.paye, g.reste, g.retard, g.attendu ? Math.round(g.paye / g.attendu * 100) : 0]);
    const t = tot(lignes, [2, 3, 4, 5, 6, 7, 8], 'TOTAL', 2);
    t.push(t[5] ? Math.round(t[6] / t[5] * 100) : 0);
    return { colonnes: ['Classe', 'Catégorie', 'Effectif', 'Frais bruts', 'Réductions', 'Attendu net', 'Encaissé', 'Reste', 'Dont échu', '% recouvré'], money: [3, 4, 5, 6, 7, 8], lignes, total: t,
      notes: ['Attendu net = frais bruts − réductions ; reste = attendu net − règlements valides (annulés et en attente exclus).'] };
  },
  debiteurs(state, f) {
    const lignes = listeCreances(state, { yearId: f.yearId, classId: f.classId, category: f.category, search: f.search })
      .map((c) => [c.eleve?.matricule || '', c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—', c.classe?.nom || '—', yearLabel(state, c.inscription.anneeId), c.attendu, c.paye, c.reste, c.retardMontant, c.joursRetard || '']);
    return { colonnes: ['Matricule', 'Élève', 'Classe', 'Année', 'Attendu', 'Réglé', 'Reste', 'Échu', 'Jours de retard'], money: [4, 5, 6, 7], lignes, total: tot(lignes, [4, 5, 6, 7], `TOTAL (${lignes.length} élève(s))`, 4).concat(['']) };
  },
  retards(state, f) {
    const today = todayISO();
    const lignes = inscriptionsFiltrees(state, f).flatMap((i) => ordreEcheances(i).filter((e) => resteEcheance(e) > 0 && e.dateLimite && e.dateLimite < today && (!f.to || e.dateLimite <= f.to) && (!f.from || e.dateLimite >= f.from))
      .map((e) => [studentOf(state, i)?.matricule || '', nomEleve(state, i), classOf(state, i.classeId)?.nom || '—', libelleEcheance(e), e.dateLimite, Math.round((new Date(`${today}T00:00:00`) - new Date(`${e.dateLimite}T00:00:00`)) / 86400000), num(e.montant) - num(e.remise), Math.min(num(e.montantPaye), num(e.montant) - num(e.remise)), resteEcheance(e)]))
      .sort((a, b) => b[5] - a[5]);
    return { colonnes: ['Matricule', 'Élève', 'Classe', 'Échéance', 'Date limite', 'Jours de retard', 'Dû', 'Payé', 'Reste'], money: [6, 7, 8], lignes, total: tot(lignes, [6, 7, 8], `TOTAL (${lignes.length} échéance(s))`, 6) };
  },
  reductions(state, f) {
    const lignes = inscriptionsFiltrees(state, f).filter((i) => i.reduction || (i.echeances || []).some((e) => num(e.remise) > 0))
      .map((i) => { const remise = (i.echeances || []).reduce((t, e) => t + num(e.remise), 0); const r = i.reduction || {};
        return [studentOf(state, i)?.matricule || '', nomEleve(state, i), classOf(state, i.classeId)?.nom || '—', TYPES_REDUCTION[r.type] || '—', reductionLabel(r), r.motif || '', r.par || '', r.date || '', remise]; });
    const parType = Object.keys(TYPES_REDUCTION).map((t) => `${TYPES_REDUCTION[t]} : ${lignes.filter((l) => l[3] === TYPES_REDUCTION[t]).length}`).join(' · ');
    return { colonnes: ['Matricule', 'Élève', 'Classe', 'Type', 'Décision', 'Motif', 'Accordée par', 'Date', 'Montant déduit'], money: [8], lignes, total: tot(lignes, [8], `TOTAL (${lignes.length})`, 8), notes: [parType] };
  },
  recettes(state, f) {
    const gran = GRANULARITES[f.gran] ? f.gran : 'mois';
    const map = new Map();
    paiementsFiltres(state, f).forEach((p) => { const k = periodeCle(p.datePaiement, gran); const g = map.get(k) || { n: 0, m: 0 }; g.n += 1; g.m += num(p.montant); map.set(k, g); });
    (state.entreesCaisse || []).filter((e) => (!f.yearId || e.anneeId === Number(f.yearId)) && dans(e.date, f) && !f.agent && !f.mode && !f.classId && !f.category)
      .forEach((e) => { const k = periodeCle(e.date, gran); const g = map.get(k) || { n: 0, m: 0 }; g.autres = (g.autres || 0) + num(e.montant); map.set(k, g); });
    let cumul = 0;
    const lignes = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => { cumul += g.m + (g.autres || 0); return [periodeLibelle(k, gran), g.n, g.m, g.autres || 0, g.m + (g.autres || 0), cumul]; });
    const t = tot(lignes, [1, 2, 3, 4], 'TOTAL'); t.push('');
    return { colonnes: ['Période', 'Paiements', 'Scolarité encaissée', 'Autres entrées', 'Total des recettes', 'Cumul'], money: [2, 3, 4, 5], lignes, total: t };
  },
  agents(state, f) {
    const map = new Map();
    paiementsFiltres(state, f, { annules: true }).forEach((p) => {
      const g = map.get(agentDe(p)) || { n: 0, m: 0, an: 0, am: 0, modes: new Set() };
      if (p.annule) { g.an += 1; g.am += num(p.montant); } else { g.n += 1; g.m += num(p.montant); g.modes.add(MODES_PAIEMENT[p.mode] || p.mode); }
      map.set(agentDe(p), g);
    });
    const lignes = [...map.entries()].sort((a, b) => b[1].m - a[1].m).map(([a, g]) => [a, g.n, g.m, [...g.modes].join(', '), g.an, g.am]);
    return { colonnes: ['Agent d’encaissement', 'Paiements valides', 'Montant encaissé', 'Moyens utilisés', 'Paiements annulés', 'Montant annulé'], money: [2, 5], lignes, total: ['TOTAL', somme(lignes, 1), somme(lignes, 2), '', somme(lignes, 4), somme(lignes, 5)] };
  },
  modes(state, f) {
    const list = paiementsFiltres(state, f);
    const total = list.reduce((s, p) => s + num(p.montant), 0);
    const lignes = Object.entries(MODES_PAIEMENT).map(([k, label]) => { const l = list.filter((p) => (p.mode || 'espece') === k); const m = l.reduce((s, p) => s + num(p.montant), 0); return [label, l.length, m, total ? Math.round(m / total * 100) : 0]; }).filter((l) => l[1] > 0);
    return { colonnes: ['Mode de paiement', 'Paiements', 'Montant', '% du total'], money: [2], lignes, total: ['TOTAL', somme(lignes, 1), total, lignes.length ? 100 : 0] };
  },
  depenses(state, f) {
    const gran = GRANULARITES[f.gran] ? f.gran : 'mois';
    const list = depensesFiltrees(state, f);
    const periodes = [...new Set(list.map((d) => periodeCle(d.date, gran)))].sort();
    const cats = [...new Set(list.map((d) => d.categorie))].sort((a, b) => a.localeCompare(b, 'fr'));
    const lignes = cats.map((c) => [c, ...periodes.map((p) => list.filter((d) => d.categorie === c && periodeCle(d.date, gran) === p).reduce((s, d) => s + num(d.montant), 0)), list.filter((d) => d.categorie === c).reduce((s, d) => s + num(d.montant), 0)]);
    const cols = periodes.map((_, i) => i + 1).concat(periodes.length + 1);
    return { colonnes: ['Catégorie', ...periodes.map((p) => periodeLibelle(p, gran)), 'Total'], money: cols, lignes, total: ['TOTAL', ...cols.map((c) => somme(lignes, c))], notes: ['Dépenses annulées exclues.'] };
  },
  'journal-caisse'(state, f) {
    const compteId = Number(f.compteId) || state.comptes?.[0]?.id;
    const from = f.from || todayISO();
    const to = f.to || from;
    let solde = soldeOuvertureTheorique(state, compteId, from);
    const ouverture = solde;
    const lignes = mouvementsCompte(state, compteId, { from, to }).filter((m) => !f.agent || m.agent === f.agent).map((m) => { solde += m.entree - m.sortie; return [m.date, m.piece, m.libelle, m.agent || '—', m.entree, m.sortie, solde]; });
    return { sousTitre: `${compteLabel(state, compteId)} — du ${from.split('-').reverse().join('/')} au ${to.split('-').reverse().join('/')}`, colonnes: ['Date', 'Pièce', 'Libellé', 'Agent', 'Entrée', 'Sortie', 'Solde'], money: [4, 5, 6], lignes: [['', '', 'Solde d’ouverture théorique', '', '', '', ouverture], ...lignes],
      total: ['', '', 'TOTAL DES MOUVEMENTS', '', somme(lignes, 4), somme(lignes, 5), solde], notes: ['Opérations valides uniquement. Un filtre par agent n’affecte pas le solde d’ouverture.'] };
  },
  tresorerie(state, f) {
    const to = f.to || todayISO();
    const avant = f.from ? soldesComptes(state, { to: veilleDe(f.from) }) : null;
    const fin = soldesComptes(state, { to });
    const lignes = fin.map((s) => { const a = avant?.find((x) => x.compte.id === s.compte.id); const debut = a ? a.solde : s.soldeInitial;
      const entrees = s.encaissements + s.autres + s.entrants - (a ? a.encaissements + a.autres + a.entrants : 0);
      const sorties = s.depenses + s.sortants - (a ? a.depenses + a.sortants : 0);
      return [s.compte.libelle, TYPES_COMPTE[s.compte.type], debut, entrees, sorties, s.solde]; });
    const caisse = situationCaisse(state, { yearId: Number(f.yearId) || 0, from: f.from, to: f.to });
    return { sousTitre: `Au ${to.split('-').reverse().join('/')}${f.from ? ` (mouvements depuis le ${f.from.split('-').reverse().join('/')})` : ''}`, colonnes: ['Compte', 'Type', 'Solde de début', 'Entrées (dont virements reçus)', 'Sorties (dont virements émis)', 'Solde de fin'], money: [2, 3, 4, 5], lignes,
      total: ['TOTAL DES COMPTES', '', somme(lignes, 2), somme(lignes, 3), somme(lignes, 4), somme(lignes, 5)],
      notes: [`Recettes de la période : ${caisse.recettes + caisse.autres} · dépenses : ${caisse.depenses} — les virements internes s’annulent dans le total (ni recette ni dépense).`] };
  },
  clotures(state, f) {
    const sessions = (state.sessionsCaisse || []).filter((s) => dans(s.date, f) && (!f.compteId || s.compteId === Number(f.compteId)) && (!f.agent || s.ouverture?.par === f.agent || s.fermeture?.par === f.agent))
      .sort((a, b) => b.date.localeCompare(a.date)).map((s) => [s.numero, s.date, compteLabel(state, s.compteId), { ouverte: 'Ouverte', fermee: 'Fermée', rouverte: 'Rouverte' }[s.statut], s.ouverture?.par || '', s.fermeture?.par || '', s.fermeture?.theorique ?? '', s.fermeture?.compte ?? '', s.fermeture ? s.fermeture.ecart : '', [s.ouverture?.ecart ? `Ouverture : ${s.ouverture.justification}` : '', s.fermeture?.justification || ''].filter(Boolean).join(' · ')]);
    const rapp = (state.rapprochements || []).filter((r) => dans(r.date, f) && (!f.compteId || r.compteId === Number(f.compteId)))
      .map((r) => [`RAPP-${r.id}`, r.date, compteLabel(state, r.compteId), 'Rapprochement', r.par, '', r.theorique, r.soldeReleve, r.ecart, r.justification]);
    const lignes = [...sessions, ...rapp];
    return { colonnes: ['N°', 'Date', 'Compte', 'Statut', 'Ouvert par', 'Fermé par', 'Théorique', 'Compté / relevé', 'Écart', 'Justification'], money: [6, 7, 8], lignes, total: ['', '', '', '', '', 'TOTAL DES ÉCARTS', '', '', somme(lignes, 8), ''] };
  },
  comparaison(state) {
    const lignes = state.annees.map((a) => {
      const sits = state.inscriptions.filter((i) => i.anneeId === a.id).map((i) => inscriptionSituation(state, i));
      const attendu = sits.reduce((s, x) => s + x.total, 0); const paye = sits.reduce((s, x) => s + x.paye, 0);
      const c = situationCaisse(state, { yearId: a.id });
      return [a.annee, sits.length, attendu, paye, Math.max(attendu - paye, 0), attendu ? Math.round(paye / attendu * 100) : 0, c.recettes + c.autres, c.depenses, c.solde];
    });
    const evo = lignes.length > 1 ? lignes.map((l, i) => (i && lignes[i - 1][3] ? `${l[0]} : ${l[3] >= lignes[i - 1][3] ? '+' : ''}${Math.round((l[3] - lignes[i - 1][3]) / lignes[i - 1][3] * 100)} % d’encaissements` : '')).filter(Boolean) : [];
    return { colonnes: ['Année', 'Inscrits', 'Attendu', 'Encaissé (scolarité)', 'Reste', '% recouvré', 'Recettes de trésorerie', 'Dépenses', 'Solde de l’année'], money: [2, 3, 4, 6, 7, 8], lignes, total: null, notes: evo };
  },
  budget(state, f) {
    const anneeId = Number(f.yearId) || state.anneeActiveId;
    const b = budgetDe(state, anneeId);
    const c = situationCaisse(state, { yearId: anneeId });
    const attendu = state.inscriptions.filter((i) => i.anneeId === anneeId).reduce((s, i) => s + inscriptionSituation(state, i).total, 0);
    const depenses = state.depenses.filter((d) => !d.annule && d.anneeId === anneeId);
    const ligne = (nature, libelle, prevu, realise) => [nature, libelle, prevu, realise, realise - prevu, prevu ? Math.round(realise / prevu * 100) : ''];
    const cats = [...new Set([...b.depenses.map((d) => d.categorie), ...depenses.map((d) => d.categorie)])].sort((x, y) => x.localeCompare(y, 'fr'));
    const recettes = [ligne('Recette', 'Scolarité (encaissée)', b.recettesScolarite, c.recettes), ligne('Recette', 'Autres recettes', b.autresRecettes, c.autres)];
    const charges = cats.map((cat) => ligne('Dépense', cat, num(b.depenses.find((d) => d.categorie === cat)?.montant), depenses.filter((d) => d.categorie === cat).reduce((s, d) => s + num(d.montant), 0)));
    const prevuNet = somme(recettes, 2) - somme(charges, 2);
    const realiseNet = somme(recettes, 3) - somme(charges, 3);
    return { sousTitre: `Année ${yearLabel(state, anneeId)}`, colonnes: ['Nature', 'Poste', 'Prévu', 'Réalisé', 'Écart', '% réalisé'], money: [2, 3, 4], lignes: [...recettes, ...charges],
      total: ['RÉSULTAT', 'Recettes − dépenses', prevuNet, realiseNet, realiseNet - prevuNet, ''],
      notes: [`Scolarité attendue (facturée, nette des réductions) : ${attendu}.${b.majLe ? ` Budget mis à jour le ${b.majLe.slice(0, 10)} par ${b.par}.` : ' Aucun budget saisi pour cette année.'}`] };
  },
  annulations(state, f) {
    const p = paiementsFiltres(state, { ...f, from: '', to: '' }, { annules: true });
    const lignes = [
      ...p.filter((x) => x.annule && dans(x.dateAnnulation || x.datePaiement, f)).map((x) => ['Paiement annulé', x.dateAnnulation || '', x.numeroRecu, nomEleve(state, state.inscriptions.find((i) => i.id === x.inscriptionId)), x.montant, x.annuleePar || '', x.motif || '']),
      ...p.flatMap((x) => (x.historique || []).filter((h) => dans(h.horodatage.slice(0, 10), f)).map((h) => ['Paiement corrigé', h.horodatage.slice(0, 10), x.numeroRecu, Object.keys(h.apres || {}).map((k) => `${k} : ${h.avant?.[k] ?? '—'} → ${h.apres[k]}`).join(' ; '), x.montant, h.par, h.motif])),
      ...depensesFiltrees(state, { ...f, from: '', to: '' }, { annulees: true }).filter((d) => d.annule && dans(d.dateAnnulation || d.date, f)).map((d) => ['Dépense annulée', d.dateAnnulation || '', d.numero, d.description, d.montant, d.annuleePar || '', d.motif || '']),
      ...state.depenses.flatMap((d) => (d.historique || []).filter((h) => dans(h.horodatage.slice(0, 10), f)).map((h) => ['Dépense corrigée', h.horodatage.slice(0, 10), d.numero, `avant : ${h.avant?.montant} — ${h.avant?.description}`, d.montant, h.par, h.motif || ''])),
      ...(state.virements || []).filter((v) => v.annule && dans(v.dateAnnulation || v.date, f)).map((v) => ['Virement annulé', v.dateAnnulation || '', v.numero, v.motif, v.montant, v.annulePar || '', v.motifAnnulation || '']),
      ...(state.paiementsEnAttente || []).filter((a) => a.statut === 'rejete' && dans(a.dateRejet || '', f)).map((a) => ['Règlement rejeté', a.dateRejet || '', a.numero, a.reference, a.montant, a.rejetePar || '', a.motif || ''])
    ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));
    return { colonnes: ['Opération', 'Date', 'N° pièce', 'Détail', 'Montant', 'Par', 'Motif'], money: [4], lignes, total: null, notes: ['Les opérations annulées restent dans l’historique avec leur numéro ; elles sont exclues de tous les totaux.'] };
  },
  transactions(state, f) {
    const statutP = (p) => (p.annule ? 'Annulé' : 'Validé');
    const lignes = [
      ...paiementsFiltres(state, f, { annules: true }).map((p) => [p.datePaiement, p.heure || '', 'Encaissement', p.numeroRecu, nomEleve(state, state.inscriptions.find((i) => i.id === p.inscriptionId)), MODES_PAIEMENT[p.mode] || p.mode, compteLabel(state, p.compteId), agentDe(p), p.montant, statutP(p)]),
      ...(f.classId || f.category ? [] : depensesFiltrees(state, f, { annulees: true }).map((d) => [d.date, '', 'Dépense', d.numero, `${d.categorie} — ${d.description}`, d.mode, compteLabel(state, d.compteId), agentDe(d), -num(d.montant), d.annule ? 'Annulée' : 'Validée'])),
      ...(f.classId || f.category || f.mode ? [] : (state.virements || []).filter((v) => dans(v.date, f) && (!f.agent || v.utilisateur === f.agent)).map((v) => [v.date, '', 'Virement interne', v.numero, `${compteLabel(state, v.deId)} → ${compteLabel(state, v.versId)}`, '', '', v.utilisateur, v.montant, v.annule ? 'Annulé' : 'Validé'])),
      ...(state.paiementsEnAttente || []).filter((a) => (!f.yearId || a.anneeId === Number(f.yearId)) && dans(a.dateReception, f) && (!f.mode || a.mode === f.mode) && (!f.agent || a.utilisateur === f.agent))
        .map((a) => [a.dateReception, '', 'Règlement en attente', a.numero, a.reference, MODES_PAIEMENT[a.mode], compteLabel(state, a.compteId), a.utilisateur, a.montant, STATUTS_ATTENTE[a.statut]])
    ].sort((a, b) => String(b[0]).localeCompare(String(a[0])) || String(b[1]).localeCompare(String(a[1])));
    return { colonnes: ['Date', 'Heure', 'Opération', 'N° pièce', 'Détail', 'Mode', 'Compte', 'Agent', 'Montant', 'Statut'], money: [8], lignes, total: null, notes: ['Dépenses en négatif. Les virements internes ne sont ni des recettes ni des dépenses.'] };
  }
};

export function construireEtat(state, f) {
  const def = ETATS.find((e) => e.id === f.type) || ETATS[0];
  const etat = ETAT_BUILDERS[def.id](state, f);
  return { id: def.id, titre: def.label, ...etat };
}

// Filtres lisibles (en-tête des impressions et exports)
export function descriptionFiltres(state, f) {
  return [
    f.yearId ? `Année ${yearLabel(state, Number(f.yearId))}` : 'Toutes les années',
    f.category && `Catégorie ${f.category}`, f.classId && `Classe ${classOf(state, Number(f.classId))?.nom || ''}`,
    (f.from || f.to) && `Période ${f.from ? f.from.split('-').reverse().join('/') : '…'} → ${f.to ? f.to.split('-').reverse().join('/') : '…'}`,
    f.agent && `Agent ${f.agent}`, f.mode && `Mode ${MODES_PAIEMENT[f.mode]}`, f.compteId && `Compte ${compteLabel(state, f.compteId)}`
  ].filter(Boolean).join(' · ');
}

// ---------- Budget prévisionnel ----------
export function budgetDe(state, anneeId) {
  const b = (state.budgets || []).find((x) => x.anneeId === Number(anneeId));
  return b || { anneeId: Number(anneeId), recettesScolarite: 0, autresRecettes: 0, depenses: [] };
}

export function enregistrerBudget(state, anneeId, { recettesScolarite = 0, autresRecettes = 0, depenses = [] } = {}) {
  exiger('scolarite.parametrer');
  const annee = state.annees.find((a) => a.id === Number(anneeId));
  if (!annee) throw new Error('Année scolaire introuvable.');
  const entier = (v, nom) => { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new Error(`${nom} : montant entier positif attendu.`); return n; };
  const lignes = depenses.map((d) => ({ categorie: String(d.categorie || '').trim().slice(0, 60), montant: entier(d.montant, d.categorie) })).filter((d) => d.categorie);
  if (new Set(lignes.map((d) => d.categorie)).size !== lignes.length) throw new Error('Chaque catégorie ne doit apparaître qu’une fois dans le budget.');
  const avant = (state.budgets || []).find((x) => x.anneeId === annee.id);
  const budget = { anneeId: annee.id, recettesScolarite: entier(recettesScolarite, 'Recettes de scolarité'), autresRecettes: entier(autresRecettes, 'Autres recettes'), depenses: lignes, majLe: new Date().toISOString(), par: '' };
  state.budgets = [...(state.budgets || []).filter((x) => x.anneeId !== annee.id), budget];
  const entry = logOperation(state, 'budget', `Budget ${annee.annee} enregistré : recettes ${budget.recettesScolarite + budget.autresRecettes}, dépenses ${lignes.reduce((s, d) => s + d.montant, 0)}`, 0, { cible: `Budget ${annee.annee}`, avant: avant || null, apres: budget });
  budget.par = entry.utilisateur || '';
  return budget;
}
