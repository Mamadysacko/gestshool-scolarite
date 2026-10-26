import { etatDemo } from './donnees-demo.mjs';
import assert from 'node:assert/strict';
import { migrateState } from '../storage.js';
import { analyseEncaissements, natureDepense } from '../modules/analyse-encaissements.js';
import { evolutionComparee, periodePrecedente, normaliserPeriode, serie, variation } from '../modules/evolution.js';
import { createPaiement } from '../modules/paiements.js';
import { createDepense } from '../modules/depenses.js';
import { refreshStatuses } from '../modules/finance.js';
import { createEmploye } from '../modules/personnel.js';
import { demanderAvance, approuverAvance, verserAvance, rembourserExceptionnel } from '../modules/avances.js';
import { multiLineChart } from '../modules/charts.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };
const d0 = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(d0);
const debutMois = `${today.slice(0, 7)}-01`;

function etat() {
  const s = etatDemo();
  s.paiements = [];
  s.inscriptions[0].echeances.forEach((e, k) => { e.montantPaye = 0; e.dateLimite = [debutMois, today, '2999-01-01'][k]; });
  Object.assign(s.annees[0], { dateDebut: '2000-01-01', dateFin: '2999-12-31', statut: 'ouverte' });
  refreshStatuses(s);
  return s;
}

t('période précédente de même durée et normalisation', () => {
  assert.deepEqual(periodePrecedente('2026-03-01', '2026-03-31'), { from: '2026-01-29', to: '2026-02-28' });
  assert.deepEqual(normaliserPeriode('2026-05-10', '2026-05-01'), { from: '2026-05-01', to: '2026-05-10' });
  assert.equal(variation(150, 100), 50);
  assert.equal(variation(100, 0), null);
});

t('séries temporelles : tous les intervalles, montants au bon endroit, comparaison alignée', () => {
  const items = [{ d: '2026-01-15', m: 100 }, { d: '2026-03-02', m: 50 }, { d: '2025-12-31', m: 70 }];
  const s = serie(items, (x) => x.d, (x) => x.m, '2026-01-01', '2026-03-31', 'mois');
  assert.deepEqual(s.map((x) => x.value), [100, 0, 50]);
  const evo = evolutionComparee(items, (x) => x.d, (x) => x.m, '2026-01-01', '2026-03-31', 'mois');
  assert.equal(evo.total, 150);
  assert.equal(evo.totalPrecedent, 70);
  assert.equal(evo.precedente.length, evo.courante.length);
});

t('analyse : encaissements réels distincts de l’attendu ; avances distinguées des dépenses définitives', () => {
  const s = etat();
  createPaiement(s, { inscriptionId: 1, montant: 400000, datePaiement: today, modalite: 'tranches' });
  createDepense(s, { anneeId: 1, categorie: 'Fournitures et matériel', description: 'Craies', montant: 50000, date: today, demandeur: 'Directeur' });
  const e = createEmploye(s, { nom: 'Bah', prenom: 'Ali', typeEmployeId: 5, mode: 'fixe', salaireBase: 500000 });
  const av = demanderAvance(s, { employeId: e.id, montantDemande: 200000, modeRemboursement: 'duree', valeur: 2, moisDebut: today.slice(0, 7) });
  approuverAvance(s, av.id);
  verserAvance(s, av.id, { date: today });
  rembourserExceptionnel(s, av.id, { montant: 30000, date: today });
  assert.equal(natureDepense(s.depenses.find((d) => d.source?.type === 'avance')), 'avance');
  const a = analyseEncaissements(s, { yearId: 1, from: debutMois, to: today, gran: 'jour' });
  assert.equal(a.courant.encaissements, 400000);
  assert.equal(a.courant.depensesDefinitives, 50000); // l'avance n'est pas une charge définitive
  assert.equal(a.courant.avances, 200000);
  assert.equal(a.courant.remboursements, 30000);
  assert.equal(a.courant.soldeNet, 400000 + 30000 - 50000 - 200000); // trésorerie : l'argent de l'avance est sorti
  assert.equal(a.courant.resultat, 350000);
  // attendu : 1re et 2e tranches arrivent à terme dans la période (600 000), 400 000 réglés
  assert.deepEqual([a.attendu.periode, a.attendu.reglePeriode, a.attendu.ecartPeriode], [600000, 400000, 200000]);
  assert.deepEqual([a.attendu.total, a.attendu.regleTotal, a.attendu.resteTotal], [900000, 400000, 500000]);
  // répartition par tranche à partir des imputations réelles
  assert.deepEqual(a.parTranche.map((r) => [r.label, r.encaisse, r.reste]), [['Tranche 1', 300000, 0], ['Tranche 2', 100000, 200000], ['Tranche 3', 0, 300000]]);
  assert.deepEqual(a.parCategorie.map((r) => [r.label, r.encaisse, r.attendu]), [['Primaire', 400000, 900000]]);
  // le tableau par période retombe sur les totaux
  assert.equal(a.periodes.reduce((s2, p) => s2 + p.encaissements, 0), 400000);
  assert.equal(a.periodes[a.periodes.length - 1].cumul, a.courant.soldeNet);
});

t('analyse : filtres catégorie / classe et période respectés, paiements annulés exclus', () => {
  const s = etat();
  const p = createPaiement(s, { inscriptionId: 1, montant: 100000, datePaiement: today, modalite: 'tranches' });
  p.annule = true;
  assert.equal(analyseEncaissements(s, { from: debutMois, to: today }).courant.encaissements, 0);
  createPaiement(s, { inscriptionId: 1, montant: 100000, datePaiement: today, modalite: 'tranches' });
  assert.equal(analyseEncaissements(s, { category: 'Collège', from: debutMois, to: today }).courant.encaissements, 0);
  assert.equal(analyseEncaissements(s, { category: 'Primaire', classId: 1, from: debutMois, to: today }).courant.encaissements, 100000);
  assert.equal(analyseEncaissements(s, { from: '2000-01-01', to: '2000-01-31' }).courant.encaissements, 0);
});

t('graphique en courbes : séries multiples et état vide', () => {
  const svg = multiLineChart([{ label: 'Jan', values: [10, 5] }, { label: 'Fév', values: [20, 0] }], [{ name: 'A', color: '#f97316' }, { name: 'B', color: '#7c3aed', dashed: true }], 'GNF');
  assert.equal((svg.match(/<path d="M/g) || []).length, 3); // 2 courbes + aire de la première
  assert.match(svg, /stroke-dasharray/);
  assert.match(multiLineChart([], [], 'GNF'), /Aucune donnée/);
});

console.log(`${n} tests d’analyse passés`);
