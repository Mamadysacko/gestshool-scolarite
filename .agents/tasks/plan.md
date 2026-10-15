# Plan d'implémentation — Améliorations IBK Scolarité

## Contexte technique clé

- **`index.html`** charge uniquement `offline-app.js` (bundle généré).
- Toute modification de `app.js`, `ui.js`, `style.css` ou des modules **doit** être suivie de `node build-offline.js` pour regénérer `offline-app.js`.
- L'application s'ouvre directement dans le navigateur via `index.html` (file:// ou serveur local).
- Aucun framework, aucun bundler NPM — Node.js sert uniquement à regénérer `offline-app.js`.
- La structure de `DEFAULT_STATE` dans `storage.js` ne doit pas changer.

---

## FEAT-001 — Thème orange / blanc / violet (style.css)

### Ce qu'il faut faire
Réécrire `style.css` entièrement avec la nouvelle palette. Conserver **toutes** les classes CSS existantes, juste les recolorer.

### Fichier : `style.css`

**Changements des variables CSS (`:root`) :**
```
--bg : #FFFFFF
--bg-soft : #F8F9FA
--panel : #FFFFFF (avec box-shadow)
--panel-alt : #F1F5F9
--primary : #7C3AED  (violet — accents, badges)
--primary-2 : #6D28D9 (violet foncé)
--accent-orange : #F97316 (boutons primaires)
--accent-orange-2 : #EA580C (hover boutons)
--secondary : #22C55E
--warning : #F59E0B
--danger : #EF4444
--text : #1F2937 (sombre sur fond blanc)
--muted : #6B7280
--line : rgba(107, 114, 128, 0.2)
--shadow : 0 4px 20px rgba(0, 0, 0, 0.08)
--sidebar-bg : #3B0764 (violet très foncé)
--sidebar-text : #FFFFFF
```

**Changements structurels :**
1. `html, body` : fond blanc (#F8F9FA), enlever le dégradé sombre, couleur texte `var(--text)`
2. `.sidebar` : `background: var(--sidebar-bg)`, `color: var(--sidebar-text)`, enlever `backdrop-filter`
3. `.brand-block` : border-color blanc semi-transparent `rgba(255,255,255,0.15)`
4. `.brand-title`, `.brand-subtitle` : couleur blanche sur sidebar
5. `.nav-btn` : couleur `rgba(255,255,255,0.85)`, hover/active : `background: rgba(249,115,22,0.25); border-color: rgba(249,115,22,0.5)` (orange)
6. `.primary-btn` : `background: linear-gradient(135deg, #F97316, #EA580C)` (orange), texte blanc
7. `.primary-btn.ghost` : `background: rgba(249,115,22,0.1); color: #F97316; border: 1px solid rgba(249,115,22,0.3)`
8. `.secondary-btn`, `.file-import` : fond blanc, border `var(--line)`, texte `var(--text)`
9. `.danger-btn` (ajouter) : `background: #EF4444; color: white`
10. `.stat-card` : `background: #FFFFFF`, border `var(--line)`, ombre légère, texte sombre
11. `.panel` : `background: #FFFFFF`, border `var(--line)`, ombre `var(--shadow)`
12. `.list-item` : `background: #F8F9FA`, border `var(--line)`
13. `.form-grid input, .form-grid select` : `background: #FFFFFF; color: var(--text); border: 1px solid var(--line)` — focus: `border-color: #7C3AED; box-shadow: 0 0 0 3px rgba(124,58,237,0.12)`
14. `table th` : `color: var(--muted)` sur fond transparent
15. `tbody tr:hover` : `background: #F8F9FA`
16. `.action-btn` : fond blanc, border `var(--line)`, texte `var(--text)` — `.action-btn.delete` : `color: #EF4444`
17. `.badge.ok` : vert, `.badge.warning` : orange, `.badge.danger` : rouge — ajuster pour fond blanc
18. `.progress-track` : fond `#E5E7EB` (gris clair), barre intérieure `linear-gradient(90deg, #F97316, #EA580C)` (orange)
19. `.modal-backdrop` : `background: rgba(0,0,0,0.5)`
20. `.student-modal` : `background: #FFFFFF; color: var(--text)`
21. `.modal-close` : fond blanc, texte sombre
22. Ajouter classe `.accent-orange` pour icônes stat-card avec fond `rgba(249,115,22,0.12)`
23. Ajouter `.bar` : `background: linear-gradient(180deg, #F97316, #EA580C)` (barres des graphiques en orange)
24. `.eyebrow` : `color: var(--muted)`
25. Conserver tous les media queries, juste adapter les couleurs
26. Ajouter `.toast` (manquant dans style.css) : `position: fixed; bottom: 24px; right: 24px; background: #1F2937; color: white; padding: 12px 20px; border-radius: 12px; z-index: 9999; font-weight: 600`

**Vérification :** `node build-offline.js` — pas d'erreur Node. Ouvrir `index.html` dans le navigateur — sidebar violet foncé, boutons orange, fond blanc, texte lisible.

---

## FEAT-002 — Inscription automatique à la création d'un élève (app.js + ui.js)

### Dépendances : aucune (indépendant de FEAT-001)

### Fichier 1 : `modules/eleves.js`
**Changer la génération du matricule par défaut :**
- Remplacer ``matricule: payload.matricule || `IBK-${String(Date.now()).slice(-6)}` ``
- Par : ``matricule: payload.matricule || generateMatricule(state)``
- Ajouter la fonction `generateMatricule(state)` dans le même fichier :
  ```js
  function generateMatricule(state) {
    const year = new Date().getFullYear();
    const prefix = `IBK-${year}-`;
    const existing = state.eleves
      .map((e) => e.matricule || '')
      .filter((m) => m.startsWith(prefix))
      .map((m) => Number(m.slice(prefix.length)) || 0);
    const next = existing.length ? Math.max(...existing) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
  ```

### Fichier 2 : `ui.js` — fonction `renderEleves`
**Dans le formulaire `data-form="eleve"`, ajouter après le champ `classeId` :**
```html
<label>Tarif (inscription auto)
  <select name="tarifId" data-auto-tarif>
    <option value="">— Sélectionner un tarif (optionnel) —</option>
    <!-- options générées : ${state.tarifs.map(t => `<option value="${t.id}">${getClassName(state,t.classeId)} — ${formatMoney(t.montantAnnuel)} ${state.config.devise} (${state.annees.find(a=>a.id===t.anneeId)?.annee||'—'})</option>`).join('')} -->
  </select>
</label>
```
Ce champ `tarifId` n'est pas dans les champs nommés soumis par FormData comme `matricule`, il sert à la logique d'inscription auto dans `app.js` — lire sa valeur séparément.

**Modifier le label matricule** pour indiquer qu'il est auto-généré si laissé vide :
```html
<label>Matricule <small>(auto-généré si vide)</small>
  <input name="matricule" type="text" placeholder="IBK-YYYY-NNNN" />
</label>
```
Retirer `required` du champ matricule (il sera généré si vide).

### Fichier 3 : `app.js` — handler `form.dataset.form === 'eleve'`
**Après la création de l'élève (après `createEleve`), ajouter la logique d'inscription automatique :**

```js
// Lire le tarifId sélectionné (hors FormData principal)
const tarifId = Number(form.querySelector('[data-auto-tarif]')?.value || 0);
const classeId = Number(formData.get('classeId') || 0);
const anneeId = Number(appState.anneeActiveId || 0);

if (!form.dataset.editId && classeId && anneeId) {
  // Chercher tarif : soit celui sélectionné manuellement, soit auto-trouvé
  const tarif = tarifId
    ? appState.tarifs.find((t) => t.id === tarifId)
    : appState.tarifs.find((t) => t.classeId === classeId && t.anneeId === anneeId && t.actif !== false);

  if (tarif) {
    const inscription = createInscription(appState, {
      eleveId: saved.id,
      anneeId,
      classeId,
      type: 'nouvelle',
      statut: 'inscrit'
    });
    if (inscription) {
      generateEcheancesForInscription(appState, inscription.id, tarif);
    }
    updateAndRender();
    form.reset();
    showToast('Élève enregistré + inscription créée automatiquement');
    return;
  }
}
// Si pas de tarif disponible, message différent
updateAndRender();
form.reset();
showToast(form.dataset.editId ? 'Fiche élève mise à jour' : 'Élève enregistré — ajoutez une inscription manuellement');
delete form.dataset.editId;
```

**Important :** déplacer le `updateAndRender()` / `form.reset()` / `showToast()` existant pour qu'ils soient remplacés par la nouvelle logique ci-dessus. Ne pas appeler deux fois `updateAndRender()`.

**Vérification :** `node build-offline.js` — pas d'erreur. Créer un élève avec une classe ayant un tarif → toast "inscription créée automatiquement". Créer un élève sans tarif → toast "ajoutez une inscription manuellement". Matricule auto-généré si laissé vide : format `IBK-2026-0003`.

---

## FEAT-003 — Tableau de bord enrichi (ui.js → renderDashboard)

### Dépendances : aucune (indépendant de FEAT-001 et FEAT-002)

### Fichier : `ui.js` — fonction `renderDashboard`

**1. Ajouter filtre de période dans `dashboardFilters` (géré dans `app.js` aussi)**

Dans `app.js`, ajouter `period: 'month'` dans l'objet `dashboardFilters` initial.

Dans le handler `change` sur `[data-dashboard-filter]`, ajouter :
```js
} else if (filter === 'period') {
  dashboardFilters.period = target.value;
}
```

**2. Dans `renderDashboard`, calculer la plage de dates selon `filters.period`**

Ajouter une fonction helper en haut de `renderDashboard` (ou comme fonction locale) :
```js
function getPeriodRange(period) {
  const today = new Date();
  const yyyy = today.toISOString().slice(0, 4);
  const mm = today.toISOString().slice(5, 7);
  const dd = today.toISOString().slice(8, 10);
  if (period === 'today') return { from: `${yyyy}-${mm}-${dd}`, to: `${yyyy}-${mm}-${dd}` };
  if (period === 'week') {
    const day = today.getDay() || 7;
    const mon = new Date(today); mon.setDate(today.getDate() - day + 1);
    const sun = new Date(today); sun.setDate(today.getDate() - day + 7);
    return { from: mon.toISOString().slice(0,10), to: sun.toISOString().slice(0,10) };
  }
  if (period === 'month') return { from: `${yyyy}-${mm}-01`, to: `${yyyy}-${mm}-${String(new Date(Number(yyyy), Number(mm), 0).getDate()).padStart(2,'0')}` };
  if (period === 'year') return { from: `${yyyy}-01-01`, to: `${yyyy}-12-31` };
  return { from: '', to: '' }; // 'all'
}
```

**3. Filtrer les paiements par période pour les KPIs**

```js
const period = filters.period || 'all';
const { from: pFrom, to: pTo } = getPeriodRange(period);
const periodPaiements = state.paiements.filter((p) =>
  !p.annule && scopedInscriptionIds.has(p.inscriptionId)
  && (!pFrom || p.datePaiement >= pFrom)
  && (!pTo || p.datePaiement <= pTo)
);
const totalPaiementsPeriode = periodPaiements.reduce((sum, p) => sum + Number(p.montant || 0), 0);
```

**4. Ajouter dans le HTML du filtre un select `period` :**
```html
<label>Période
  <select data-dashboard-filter="period">
    <option value="all" ${period==='all'?'selected':''}>Tout</option>
    <option value="today" ${period==='today'?'selected':''}>Aujourd'hui</option>
    <option value="week" ${period==='week'?'selected':''}>Cette semaine</option>
    <option value="month" ${period==='month'?'selected':''}>Ce mois</option>
    <option value="year" ${period==='year'?'selected':''}>Cette année</option>
  </select>
</label>
```
Modifier `.filter-grid` pour avoir `grid-template-columns: repeat(4, minmax(120px, 1fr))` (4 filtres).

**5. Nouvelles KPI cards :**
- Garder les 5 stat-cards existantes
- Ajouter une 6e card "Taux de recouvrement" : affiche `${totalDu ? Math.round(totalPaiements/totalDu*100) : 0}%` avec badge `accent-purple`
- Ajouter une 7e card "Encaissé (période)" : `totalPaiementsPeriode` avec badge `accent-orange`

**6. Section "Alertes du jour" — ajouter après les stat-cards :**
```js
const todayStr = new Date().toISOString().slice(0, 10);
const paiementsAujourdhui = state.paiements.filter((p) =>
  !p.annule && scopedInscriptionIds.has(p.inscriptionId) && p.datePaiement === todayStr
);
const echeancesDepassees = state.inscriptions
  .filter((i) => scopedClassIds.has(i.classeId))
  .flatMap((i) => (i.echeances||[])
    .filter((e) => (e.statut==='impayee'||e.statut==='en_retard') && e.dateLimite && e.dateLimite < todayStr)
    .map((e) => ({ eleve: getEleveName(state, i.eleveId), echeance: e }))
  );
```
HTML pour cette section (dans un panneau `.panel`) :
```html
<div class="panel">
  <div class="panel-header"><h3>⚡ Alertes du jour</h3><span class="badge ${paiementsAujourdhui.length?'ok':'warning'}">${paiementsAujourdhui.length} paiement(s) aujourd'hui</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div>
      <h4 style="margin:0 0 8px;font-size:0.9rem">Paiements du jour</h4>
      ${paiementsAujourdhui.length ? paiementsAujourdhui.map(p => {
        const insc = state.inscriptions.find(i=>i.id===p.inscriptionId);
        const eleve = insc && state.eleves.find(e=>e.id===insc.eleveId);
        return `<div class="list-item"><div><strong>${eleve?`${eleve.prenom} ${eleve.nom}`:'—'}</strong><div class="meta">${eleve?.matricule||''}</div></div><span class="badge ok">${formatMoney(p.montant)} ${state.config.devise}</span></div>`;
      }).join('') : '<div class="meta">Aucun paiement aujourd\'hui.</div>'}
    </div>
    <div>
      <h4 style="margin:0 0 8px;font-size:0.9rem">Échéances dépassées</h4>
      ${echeancesDepassees.slice(0,5).map(({eleve, echeance}) =>
        `<div class="list-item"><div><strong>${escapeHtml(eleve)}</strong><div class="meta">${echeance.libelle||`Tranche ${echeance.trancheId}`} · limite ${echeance.dateLimite}</div></div><span class="badge danger">${formatMoney(Math.max(Number(echeance.montant||0)-Number(echeance.montantPaye||0),0))} ${state.config.devise}</span></div>`
      ).join('') || '<div class="meta">Aucune échéance dépassée.</div>'}
    </div>
  </div>
</div>
```

**7. Graphiques CSS/HTML purs :**

**Graphique "Paiements par tranche"** (dans un `.panel`) :
```js
// Calculer par numéro de tranche (1, 2, 3)
const parTranche = [1, 2, 3].map((num) => {
  const echeancesNum = state.inscriptions
    .filter((i) => scopedClassIds.has(i.classeId))
    .flatMap((i) => (i.echeances||[]).filter((e) => e.trancheId === num));
  const du = echeancesNum.reduce((s,e)=>s+Number(e.montant||0), 0);
  const paye = echeancesNum.reduce((s,e)=>s+Number(e.montantPaye||0), 0);
  return { label: `Tranche ${num}`, du, paye };
});
const maxTranche = Math.max(...parTranche.map(t=>t.du), 1);
```
HTML bar chart (divs, width en %) :
```html
<div class="panel">
  <div class="panel-header"><h3>Paiements par tranche</h3></div>
  <div style="display:flex;flex-direction:column;gap:12px">
    ${parTranche.map(t => `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:4px">
          <span>${t.label}</span>
          <span>${formatMoney(t.paye)} / ${formatMoney(t.du)} ${state.config.devise}</span>
        </div>
        <div class="progress-track" style="height:14px">
          <i style="width:${t.du?Math.min(t.paye/t.du*100,100):0}%"></i>
        </div>
      </div>
    `).join('')}
  </div>
</div>
```

**Graphique "Paiements par classe"** (dans un `.panel`) :
```js
const maxClassPaid = Math.max(...breakdown.map(b=>b.paid), 1);
```
```html
<div class="panel">
  <div class="panel-header"><h3>Encaissements par classe</h3></div>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${breakdown.map(({classe, paid, due}) => `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:4px">
          <span>${escapeHtml(classe.nom)}</span>
          <span>${formatMoney(paid)} ${state.config.devise}</span>
        </div>
        <div class="progress-track" style="height:12px">
          <i style="width:${due?Math.min(paid/due*100,100):0}%"></i>
        </div>
      </div>
    `).join('') || '<div class="meta">Aucune classe.</div>'}
  </div>
</div>
```

**Graphique "Évolution mensuelle" (6 derniers mois)** :
```js
function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: d.toISOString().slice(0,7), // YYYY-MM
      label: d.toLocaleDateString('fr-FR', {month:'short', year:'2-digit'})
    });
  }
  return months;
}
const last6 = getLast6Months();
const mensuel = last6.map(({key, label}) => {
  const total = state.paiements.filter((p) =>
    !p.annule && scopedInscriptionIds.has(p.inscriptionId)
    && (p.datePaiement||'').slice(0,7) === key
  ).reduce((s,p)=>s+Number(p.montant||0), 0);
  return { label, total };
});
const maxMensuel = Math.max(...mensuel.map(m=>m.total), 1);
```
HTML mini-bars verticales :
```html
<div class="panel">
  <div class="panel-header"><h3>Évolution mensuelle</h3><span class="meta">6 derniers mois</span></div>
  <div class="mini-bars">
    ${mensuel.map(m => `
      <div class="bar-item">
        <div class="bar" style="height:${Math.round(m.total/maxMensuel*180)}px" title="${formatMoney(m.total)} ${state.config.devise}"></div>
        <span class="bar-label">${m.label}</span>
      </div>
    `).join('')}
  </div>
</div>
```

**8. Mise en page :** conserver le `dashboard-grid` existant, ajouter les nouveaux panneaux (alertes, graphiques) entre les stat-cards et le tableau par classe.

**Vérification :** `node build-offline.js` → ouvrir `index.html` → Tableau de bord affiche les 7 KPI cards, les alertes du jour, les 3 graphiques CSS, le filtre période fonctionne.

---

## FEAT-004 — Onglet Rapports amélioré (ui.js → renderRapports)

### Dépendances : aucune

### Fichier : `ui.js` — fonction `renderRapports`

**1. Ajouter 4 sections de périodes.** Chaque section est un `<details>` ou une `<div>` conditionnelle visible. Utiliser des `<details open>` pour les sections — simple, sans JS supplémentaire.

**Fonction helper locale (dans le scope de renderRapports) :**
```js
function filterPaiementsPeriode(paiements, inscriptions, from, to) {
  return paiements.filter((p) =>
    !p.annule
    && (!from || p.datePaiement >= from)
    && (!to || p.datePaiement <= to)
  );
}
```

**Calculer les 4 plages :**
```js
const todayStr = new Date().toISOString().slice(0, 10);
const yyyy = todayStr.slice(0, 4);
const mm = todayStr.slice(5, 7);
const dayOfWeek = new Date().getDay() || 7;
const weekMon = new Date(); weekMon.setDate(new Date().getDate() - dayOfWeek + 1);
const weekSun = new Date(); weekSun.setDate(new Date().getDate() - dayOfWeek + 7);

const periods = [
  { label: "Rapport du Jour", id: "rpt-today", from: todayStr, to: todayStr },
  { label: "Rapport de la Semaine", id: "rpt-week", from: weekMon.toISOString().slice(0,10), to: weekSun.toISOString().slice(0,10) },
  { label: "Rapport du Mois", id: "rpt-month", from: `${yyyy}-${mm}-01`, to: `${yyyy}-${mm}-${String(new Date(Number(yyyy), Number(mm), 0).getDate()).padStart(2,'0')}` },
  { label: "Rapport de l'Année", id: "rpt-year", from: `${yyyy}-01-01`, to: `${yyyy}-12-31` }
];
```

**Pour chaque période, générer un tableau HTML et des boutons :**
```js
function renderPeriodReport(state, label, from, to, sectionId) {
  const paiements = state.paiements.filter((p) =>
    !p.annule && p.datePaiement >= from && p.datePaiement <= to
  );
  const total = paiements.reduce((s,p)=>s+Number(p.montant||0), 0);
  const rows = paiements.map((p) => {
    const insc = state.inscriptions.find((i) => i.id === p.inscriptionId);
    const eleve = insc && state.eleves.find((e) => e.id === insc.eleveId);
    const echeance = insc?.echeances?.find((e) => e.id === p.echeanceId);
    return `<tr>
      <td>${escapeHtml(eleve ? `${eleve.prenom} ${eleve.nom}` : '—')}</td>
      <td>${escapeHtml(eleve?.matricule||'—')}</td>
      <td>${escapeHtml(insc ? getClassName(state, insc.classeId) : '—')}</td>
      <td>${escapeHtml(echeance?.libelle||`Tranche ${echeance?.trancheId||''}`)}</td>
      <td>${formatMoney(p.montant)} ${state.config.devise}</td>
      <td>${escapeHtml(p.mode||'—')}</td>
      <td>${escapeHtml(p.datePaiement||'—')}</td>
    </tr>`;
  }).join('');

  return `
    <details class="panel" open>
      <summary style="cursor:pointer;font-weight:700;font-size:1rem;padding:4px 0;list-style:none">${label}
        <span class="badge ok" style="margin-left:8px">${paiements.length} paiement(s) · ${formatMoney(total)} ${state.config.devise}</span>
      </summary>
      <div style="margin-top:12px">
        <div class="form-actions" style="margin-bottom:10px">
          <button class="secondary-btn small-btn" data-action="report:print-period:${sectionId}:${from}:${to}">Imprimer ce rapport</button>
          <button class="secondary-btn small-btn" data-action="report:csv-period:${sectionId}:${from}:${to}">Exporter CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Élève</th><th>Matricule</th><th>Classe</th><th>Tranche</th><th>Montant</th><th>Mode</th><th>Date</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="7">Aucun paiement pour cette période.</td></tr>'}</tbody>
          </table>
        </div>
        <div style="text-align:right;font-weight:700;padding:10px 0">Total : ${formatMoney(total)} ${state.config.devise}</div>
      </div>
    </details>`;
}
```

**2. Dans `app.js`, ajouter les handlers pour les nouveaux boutons :**

Dans le handler `click` existant, avant la fin :
```js
if (action && action.startsWith('report:print-period:')) {
  const parts = action.split(':');
  // parts = ['report','print-period','rpt-today','2026-01-01','2026-01-31']
  const from = parts[3];
  const to = parts[4];
  printPeriodReport(appState, from, to);
  return;
}
if (action && action.startsWith('report:csv-period:')) {
  const parts = action.split(':');
  const from = parts[3];
  const to = parts[4];
  exportPeriodReportCsv(appState, from, to);
  showToast('Rapport CSV exporté');
  return;
}
```

**3. Ajouter dans `ui.js` les fonctions exportées `printPeriodReport` et `exportPeriodReportCsv` :**

`printPeriodReport(state, from, to)` : filtre `state.paiements` par plage, construit le HTML du tableau imprimable dans `openPrintWindow` (même pattern que `printReport` mais filtré par date).

`exportPeriodReportCsv(state, from, to)` : filtre par plage, utilise `downloadCsv` — même colonnes que `exportReportCsv` mais seulement les paiements de la plage.

**4. Mettre à jour les imports dans `app.js` :**
Ajouter `printPeriodReport, exportPeriodReportCsv` dans la ligne d'import depuis `./ui.js`.

**5. Conservation :** les sections "Échéances à régulariser" et "Résumé par année" restent en bas.

**Vérification :** `node build-offline.js` → ouvrir Rapports → 4 sections `<details>` visibles, chacune avec tableau, total, boutons imprimer/CSV. Cliquer imprimer → fenêtre d'impression. Cliquer CSV → téléchargement.

---

## FEAT-005 — Reçu de paiement enrichi (ui.js → printPaymentReceipt)

### Dépendances : aucune

### Fichier : `ui.js` — fonction `printPaymentReceipt`

**Ajouter les calculs suivants dans la fonction :**
```js
// Reste à payer pour cette tranche
const resteEcheance = echeance
  ? Math.max(Number(echeance.montant||0) - Number(echeance.montantPaye||0), 0)
  : 0;

// Total annuel du tarif lié à l'inscription
const tarif = state.tarifs.find((t) =>
  inscription && t.classeId === inscription.classeId && t.anneeId === inscription.anneeId && t.actif !== false
);
const totalAnnuel = tarif
  ? Number(tarif.montantAnnuel||0)
  : (inscription?.echeances||[]).reduce((s,e)=>s+Number(e.montant||0), 0);

// Total déjà payé sur l'année pour cette inscription
const totalPayeAnnee = state.paiements
  .filter((p) => !p.annule && p.inscriptionId === payment.inscriptionId)
  .reduce((s,p) => s + Number(p.montant||0), 0);

// Reste à payer sur l'année
const resteAnnee = Math.max(totalAnnuel - totalPayeAnnee, 0);

// Historique des paiements de cette inscription
const historiquePaiements = state.paiements
  .filter((p) => p.inscriptionId === payment.inscriptionId)
  .sort((a,b) => String(a.datePaiement).localeCompare(String(b.datePaiement)));
```

**Modifier `content` pour inclure :**
1. En-tête : nom école, adresse, téléphone, année scolaire, numéro reçu
2. Infos élève : nom, matricule, classe, année
3. Détail paiement actuel : montant reçu, mode, référence, caissier, date
4. Boîte "Situation de cette tranche" : montant tranche, déjà payé, **reste tranche**
5. Boîte "Situation annuelle" : total annuel, déjà payé sur l'année, **reste sur l'année**
6. Tableau historique des paiements de l'inscription : date | tranche | montant | mode | référence
7. Ligne signature + cachet

**HTML du reçu enrichi (remplacer le `content` existant) :**
```js
const historiqueRows = historiquePaiements.map((p) => {
  const ech = inscription?.echeances?.find((e) => e.id === p.echeanceId);
  return `<tr${p.id===payment.id?' style="background:#fffbeb"':''}>
    <td>${escapeHtml(p.datePaiement||'—')}</td>
    <td>${escapeHtml(ech?.libelle||`Tranche ${ech?.trancheId||''}`)}</td>
    <td style="font-weight:${p.id===payment.id?'bold':'normal'}">${formatMoney(p.montant)} ${escapeHtml(state.config.devise)}</td>
    <td>${escapeHtml(p.mode||'—')}</td>
    <td>${escapeHtml(p.reference||'—')}</td>
    <td><span style="color:${p.annule?'#ef4444':'#16a34a'}">${p.annule?'Annulé':'Validé'}</span></td>
  </tr>`;
}).join('');

const content = `
  <header class="brand">
    <div>
      <h1>${escapeHtml(state.config.nom)}</h1>
      <p>${escapeHtml(state.config.adresse||'')} · ${escapeHtml(state.config.telephone||'')} · ${escapeHtml(state.config.email||'')}</p>
      <p>Année scolaire : ${escapeHtml(year?.annee||'—')}</p>
    </div>
    <div style="text-align:right">
      <strong style="font-size:1.1rem">REÇU DE PAIEMENT</strong>
      <p>N° ${escapeHtml(String(payment.reference||payment.id))}</p>
      <p>Date : ${escapeHtml(payment.datePaiement||'—')}</p>
    </div>
  </header>

  <p>Reçu de : <strong>${escapeHtml(student ? `${student.prenom} ${student.nom}` : 'Élève')}</strong> — Matricule : <strong>${escapeHtml(student?.matricule||'—')}</strong></p>
  <p>Classe : ${escapeHtml(getClassName(state, inscription?.classeId))} · Motif : ${escapeHtml(echeance?.libelle||`Tranche ${echeance?.trancheId||''}`)}</p>

  <div class="summary">
    <div>
      <small>Montant reçu (ce paiement)</small>
      <div class="amount">${formatMoney(payment.montant)} ${escapeHtml(state.config.devise)}</div>
    </div>
    <div>
      <small>Mode de paiement</small>
      <div>${escapeHtml(payment.mode||'—')}</div>
    </div>
    <div>
      <small>Caissier</small>
      <div>${escapeHtml(payment.caissier||'—')}</div>
    </div>
    <div>
      <small>Référence</small>
      <div>${escapeHtml(payment.reference||'—')}</div>
    </div>
  </div>

  <table style="margin-top:12px">
    <thead><tr><th colspan="2" style="background:#f0fdf4">Situation — ${escapeHtml(echeance?.libelle||`Tranche ${echeance?.trancheId||''}`)}</th><th colspan="2" style="background:#fff7ed">Situation annuelle</th></tr></thead>
    <tbody>
      <tr>
        <td>Montant tranche</td><td><strong>${formatMoney(Number(echeance?.montant||0))} ${escapeHtml(state.config.devise)}</strong></td>
        <td>Total annuel</td><td><strong>${formatMoney(totalAnnuel)} ${escapeHtml(state.config.devise)}</strong></td>
      </tr>
      <tr>
        <td>Déjà payé (tranche)</td><td>${formatMoney(Number(echeance?.montantPaye||0))} ${escapeHtml(state.config.devise)}</td>
        <td>Déjà payé (année)</td><td>${formatMoney(totalPayeAnnee)} ${escapeHtml(state.config.devise)}</td>
      </tr>
      <tr style="font-weight:bold">
        <td style="color:#ea580c">Reste tranche</td>
        <td style="color:#ea580c">${formatMoney(resteEcheance)} ${escapeHtml(state.config.devise)}</td>
        <td style="color:#7c3aed">Reste annuel</td>
        <td style="color:#7c3aed">${formatMoney(resteAnnee)} ${escapeHtml(state.config.devise)}</td>
      </tr>
    </tbody>
  </table>

  <h2 style="margin:20px 0 8px;font-size:1rem">Historique des paiements — ${escapeHtml(year?.annee||'—')}</h2>
  <table>
    <thead><tr><th>Date</th><th>Tranche</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Statut</th></tr></thead>
    <tbody>${historiqueRows || '<tr><td colspan="6">Aucun paiement.</td></tr>'}</tbody>
  </table>

  <p style="margin-top:60px">Signature et cachet : ______________________________</p>
  <p style="font-size:0.8em;color:#6b7280;margin-top:8px">Document généré le ${new Date().toLocaleDateString('fr-FR')} · ${escapeHtml(state.config.nom)}</p>
`;
```

**Vérification :** `node build-offline.js` → onglet Paiements → cliquer "Reçu" sur un paiement → fenêtre d'impression avec toutes les informations enrichies (reste tranche, reste annuel, historique, infos école).

---

## FEAT-006 — Recherche par matricule dans les paiements (ui.js + app.js)

### Dépendances : aucune

### Fichier 1 : `ui.js` — fonction `renderPaiements`

**A. Ajouter le champ matricule EN PREMIER dans le formulaire `data-form="paiement"` (avant le champ Inscription) :**
```html
<label>Rechercher par matricule
  <input name="matricule-search" type="text" placeholder="Ex: IBK-2026-0001" data-matricule-search autocomplete="off" />
</label>
```

**B. Ajouter la colonne Matricule dans le tableau du journal (thead et tbody) :**
- Dans `<thead>` : ajouter `<th>Matricule</th>` entre "Élève" et "Classe / année"
- Dans `<tbody>`, ajouter `<td>${escapeHtml(eleve?.matricule||'—')}</td>` au même endroit

**C. Ajouter le matricule dans `data-search` du `<tr>` :**
- Actuellement : `[studentName, paiement.reference, paiement.mode, paiement.caissier].join(' ')`
- Modifier en : `[studentName, eleve?.matricule||'', paiement.reference, paiement.mode, paiement.caissier].join(' ')`

### Fichier 2 : `app.js`

**A. Dans `wireForms()`, dans le listener `input` existant, ajouter :**
```js
if (event.target.matches('[data-matricule-search]')) {
  handleMatriculeSearch(event.target.value.trim());
}
```

**B. Ajouter la fonction `handleMatriculeSearch(query)` dans `app.js` (avant `wireForms`) :**
```js
function handleMatriculeSearch(query) {
  const inscriptionSelect = document.querySelector('form[data-form="paiement"] [name="inscriptionId"]');
  if (!inscriptionSelect) return;

  if (!query) {
    // Restaurer toutes les inscriptions
    inscriptionSelect.replaceChildren();
    appState.inscriptions.forEach((inscription) => {
      const eleve = appState.eleves.find((e) => e.id === inscription.eleveId);
      const option = document.createElement('option');
      option.value = String(inscription.id);
      option.textContent = `${eleve ? `${eleve.prenom} ${eleve.nom}` : 'Inconnu'} - ${getClassName(appState, inscription.classeId)} (${appState.annees.find((a) => a.id === inscription.anneeId)?.annee || '—'})`;
      inscriptionSelect.append(option);
    });
    updateEcheanceChoices(inscriptionSelect.value);
    return;
  }

  const eleve = appState.eleves.find((e) =>
    (e.matricule || '').toLowerCase() === query.toLowerCase()
    || (e.matricule || '').toLowerCase().includes(query.toLowerCase())
  );

  inscriptionSelect.replaceChildren();

  if (!eleve) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucun élève trouvé pour ce matricule';
    inscriptionSelect.append(option);
    updateEcheanceChoices('');
    return;
  }

  const inscriptions = appState.inscriptions.filter((i) => i.eleveId === eleve.id);
  inscriptions.forEach((inscription) => {
    const option = document.createElement('option');
    option.value = String(inscription.id);
    option.textContent = `${eleve.prenom} ${eleve.nom} - ${getClassName(appState, inscription.classeId)} (${appState.annees.find((a) => a.id === inscription.anneeId)?.annee || '—'})`;
    inscriptionSelect.append(option);
  });

  if (!inscriptions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Aucune inscription pour cet élève';
    inscriptionSelect.append(option);
  }

  // Mettre à jour automatiquement les échéances pour la première inscription trouvée
  if (inscriptions.length) updateEcheanceChoices(inscriptions[0].id);
}
```

**Note :** `handleMatriculeSearch` utilise `getClassName` depuis `ui.js`. Cette fonction n'est pas disponible directement dans `app.js`. **Solution :** dupliquer une version locale simple dans `app.js` :
```js
function getClassNameLocal(classId) {
  return appState.classes.find((c) => c.id === Number(classId))?.nom || '—';
}
```
Et utiliser `getClassNameLocal` à la place de `getClassName` dans `handleMatriculeSearch`.

**Vérification :** `node build-offline.js` → onglet Paiements → taper un matricule → la liste Inscription se filtre automatiquement → les échéances se mettent à jour. La colonne Matricule apparaît dans le journal. La recherche globale trouve par matricule.

---

## FEAT-007 — Regénérer offline-app.js (étape finale)

### Dépendance : FEAT-001 à FEAT-006 tous terminés

### Commande :
```
node build-offline.js
```
Exécuter depuis `c:\Users\hp\OneDrive\Bureau\scolarite ibk`.

**Vérification finale :**
1. `node build-offline.js` se termine sans erreur
2. `offline-app.js` est mis à jour (date de modification récente)
3. Ouvrir `index.html` dans le navigateur
4. Vérifier console — aucune erreur JS
5. Test fonctionnel rapide :
   - Thème orange/blanc/violet visible
   - Tableau de bord : filtres période, graphiques, alertes
   - Créer un élève avec classe → inscription auto
   - Onglet Paiements : champ matricule, colonne matricule dans le journal
   - Onglet Rapports : 4 sections par période, boutons imprimer/CSV
   - Cliquer "Reçu" sur un paiement → reçu enrichi avec reste tranche/annuel

---

## Ordre d'implémentation recommandé

1. **FEAT-007 test préalable** : `node build-offline.js` pour vérifier que le build de départ fonctionne
2. **FEAT-001** (style.css) — indépendant, pas de risque de casser la logique
3. **FEAT-002** (inscription auto) — modifie `modules/eleves.js`, `ui.js`, `app.js`
4. **FEAT-006** (matricule paiements) — modifie `ui.js`, `app.js` (peut se faire en même temps que FEAT-002 si les zones du code sont distinctes, mais séquentiellement pour éviter les conflits)
5. **FEAT-005** (reçu enrichi) — modifie uniquement `printPaymentReceipt` dans `ui.js`
6. **FEAT-003** (dashboard enrichi) — modifie `renderDashboard` dans `ui.js` et `dashboardFilters` dans `app.js`
7. **FEAT-004** (rapports améliorés) — modifie `renderRapports` dans `ui.js`, ajoute exports dans `ui.js`, handlers dans `app.js`
8. **FEAT-007** (build final) : `node build-offline.js`

---

## Points d'attention / pièges

- **`offline-app.js` est le seul fichier chargé par `index.html`**. Modifier `app.js` ou `ui.js` sans rebuildez = pas d'effet visible dans le navigateur. Rebuildez après chaque FEAT.
- **`build-offline.js` utilise une regex simple pour les imports**. Les imports doivent rester sur une seule ligne, format `import { ... } from '...'`. Ne pas casser ce format.
- **`getClassName` est dans `ui.js`** et non accessible directement dans `app.js` — utiliser une version locale dans `app.js` pour `handleMatriculeSearch`.
- **Le champ `tarifId`** dans le formulaire élève ne doit pas avoir `name="tarifId"` pour éviter qu'il soit lu par FormData — utiliser `data-auto-tarif` comme attribut de recherche pour le lire hors FormData.
- **`matricule` n'est plus `required`** dans le formulaire élève — le retirer pour permettre la génération automatique.
- **`generateMatricule`** doit être une fonction locale (non exportée) dans `modules/eleves.js`.
- **Les `<details>` dans renderRapports** fonctionnent sans JS supplémentaire — natif HTML5.
- **Période dans `dashboardFilters`** : initialiser dans `app.js` à `'all'` pour ne pas casser l'affichage initial.
