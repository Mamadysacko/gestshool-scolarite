export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

export function getClassName(state, id) {
  return state.classes.find((item) => item.id === Number(id))?.nom || '—';
}

export function getEleveName(state, id) {
  const e = state.eleves.find((item) => item.id === Number(id));
  return e ? `${e.prenom} ${e.nom}` : '—';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getInscriptionBalance(inscription) {
  const echeances = inscription.echeances || [];
  const total = echeances.reduce((sum, echeance) => sum + Number(echeance.montant || 0), 0);
  const paye = echeances.reduce((sum, echeance) => sum + Number(echeance.montantPaye || 0), 0);
  return { total, paye, reste: Math.max(total - paye, 0) };
}

export function renderDashboard(state, filters = {}) {
  const section = document.getElementById('dashboard');
  const yearId = filters.yearId === undefined
    ? Number(state.anneeActiveId || 0)
    : Number(filters.yearId || 0);
  const classId = Number(filters.classId || 0);
  const category = filters.category || '';
  const availableClasses = state.classes.filter((classe) =>
    (!yearId || classe.anneeId === yearId) && (!category || classe.categorie === category)
  );
  const scopedClasses = state.classes.filter((classe) =>
    (!yearId || classe.anneeId === yearId)
    && (!classId || classe.id === classId)
    && (!category || classe.categorie === category)
  );
  const scopedClassIds = new Set(scopedClasses.map((classe) => classe.id));
  const inscriptions = state.inscriptions.filter((inscription) =>
    (!yearId || inscription.anneeId === yearId) && scopedClassIds.has(inscription.classeId)
  );
  const studentIds = new Set(inscriptions.map((inscription) => inscription.eleveId));
  const totalEleves = studentIds.size;
  const totalClasses = scopedClasses.length;
  const totalInscriptions = inscriptions.length;
  const scopedInscriptionIds = new Set(inscriptions.map((inscription) => inscription.id));
  const totalPaiements = state.paiements
    .filter((payment) => !payment.annule && scopedInscriptionIds.has(payment.inscriptionId))
    .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
  const lateInscriptionIds = new Set(inscriptions
    .filter((inscription) => (inscription.echeances || []).some((echeance) => ['en_retard', 'impayee'].includes(echeance.statut)))
    .map((inscription) => inscription.eleveId));
  const totalRetards = lateInscriptionIds.size;
  const totalDu = inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
  const totalRestant = inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).reste, 0);
  const categories = [...new Set(state.classes
    .filter((classe) => !yearId || classe.anneeId === yearId)
    .map((classe) => classe.categorie))];
  const breakdown = scopedClasses.map((classe) => {
    const classInscriptions = inscriptions.filter((inscription) => inscription.classeId === classe.id);
    const classIds = new Set(classInscriptions.map((inscription) => inscription.id));
    const effectif = new Set(classInscriptions.map((inscription) => inscription.eleveId)).size;
    const paid = state.paiements
      .filter((payment) => !payment.annule && classIds.has(payment.inscriptionId))
      .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
    const due = classInscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
    return { classe, effectif, paid, due, rate: due ? Math.round(paid / due * 100) : 0 };
  });

  section.innerHTML = `
    <div class="panel dashboard-filter-panel">
      <div class="dashboard-heading">
        <div><span class="eyebrow">Pilotage scolaire</span><h2>Situation de l’établissement</h2></div>
        <div class="filter-grid">
          <label>Année
            <select data-dashboard-filter="year">
              <option value="" ${!yearId ? 'selected' : ''}>Toutes</option>
              ${state.annees.map((annee) => `<option value="${annee.id}" ${annee.id === yearId ? 'selected' : ''}>${escapeHtml(annee.annee)}</option>`).join('')}
            </select>
          </label>
          <label>Catégorie
            <select data-dashboard-filter="category">
              <option value="" ${!category ? 'selected' : ''}>Toutes</option>
              ${categories.map((item) => `<option value="${escapeHtml(item)}" ${item === category ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
            </select>
          </label>
          <label>Classe
            <select data-dashboard-filter="class">
              <option value="" ${!classId ? 'selected' : ''}>Toutes</option>
              ${availableClasses.map((classe) => `<option value="${classe.id}" ${classe.id === classId ? 'selected' : ''}>${escapeHtml(classe.nom)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <article class="stat-card accent-blue">
        <div class="icon">👥</div>
        <div>
          <span>Élèves inscrits</span>
          <strong>${totalEleves}</strong>
        </div>
      </article>
      <article class="stat-card accent-purple">
        <div class="icon">🏫</div>
        <div>
          <span>Classes</span>
          <strong>${totalClasses}</strong>
        </div>
      </article>
      <article class="stat-card accent-gold">
        <div class="icon">📝</div>
        <div>
          <span>Inscriptions</span>
          <strong>${totalInscriptions}</strong>
        </div>
      </article>
      <article class="stat-card accent-green">
        <div class="icon">💰</div>
        <div>
          <span>Encaissements</span>
          <strong>${formatMoney(totalPaiements)} ${state.config.devise}</strong>
        </div>
      </article>
      <article class="stat-card accent-red">
        <div class="icon">⏳</div>
        <div><span>Reste à recouvrer</span><strong>${formatMoney(totalRestant)} ${state.config.devise}</strong></div>
      </article>
    </div>

    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-header"><h3>Suivi des dossiers</h3><span class="badge warning">${totalRetards} élève(s) en retard</span></div>
        <div class="list-stack">
          ${inscriptions.slice(0, 5).map((inscription) => {
            const eleve = state.eleves.find((e) => e.id === inscription.eleveId);
            const due = getInscriptionBalance(inscription).reste;
            return `
              <div class="list-item">
                <div>
                  <strong>${eleve ? `${eleve.prenom} ${eleve.nom}` : 'Inconnu'}</strong>
                  <div class="meta">${getClassName(state, inscription.classeId)}</div>
                </div>
                <span class="badge ${due ? 'warning' : 'ok'}">${formatMoney(due)} ${state.config.devise} restant</span>
              </div>
            `;
          }).join('') || '<div class="meta">Aucune inscription pour cette sélection.</div>'}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Recouvrement global</h3></div>
        <div class="recovery-summary">
          <strong>${totalDu ? Math.round(totalPaiements / totalDu * 100) : 0}%</strong>
          <span>recouvré sur ${formatMoney(totalDu)} ${state.config.devise} de frais</span>
          <div class="progress-track"><i style="width:${Math.min(totalDu ? totalPaiements / totalDu * 100 : 0, 100)}%"></i></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Indicateurs par classe</h3><span class="meta">Effectif, encaissements et recouvrement</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Classe</th><th>Catégorie</th><th>Effectif</th><th>Encaissé</th><th>À recouvrer</th><th>Recouvrement</th></tr></thead>
        <tbody>${breakdown.map(({ classe, effectif, paid, due, rate }) => `
          <tr><td>${escapeHtml(classe.nom)}</td><td>${escapeHtml(classe.categorie)}</td><td>${effectif}</td>
            <td>${formatMoney(paid)} ${state.config.devise}</td><td>${formatMoney(Math.max(due - paid, 0))} ${state.config.devise}</td>
            <td><span class="badge ${rate >= 75 ? 'ok' : 'warning'}">${rate}%</span></td></tr>
        `).join('') || '<tr><td colspan="6">Aucune classe pour cette sélection.</td></tr>'}</tbody>
      </table></div>
    </div>
  `;
}

export function renderAnnees(state) {
  const section = document.getElementById('annees');
  const anneeActiveId = state.anneeActiveId || state.annees[0]?.id;
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Créer une année scolaire</h3></div>
      <form class="form-grid compact" data-form="annee">
        <label>Année <input name="annee" type="text" required placeholder="2026-2027" /></label>
        <label>Date début <input name="dateDebut" type="date" /></label>
        <label>Date fin <input name="dateFin" type="date" /></label>
        <label>Statut
          <select name="statut">
            <option value="preparation">Préparation</option>
            <option value="ouverte">Ouverte</option>
            <option value="cloturee">Clôturée</option>
          </select>
        </label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Liste des années</h3></div>
      <div class="cards-grid">
        ${state.annees.map((annee) => `
          <div class="detail-card">
            <h4>${annee.annee}</h4>
            <p class="meta">${annee.dateDebut || '—'} → ${annee.dateFin || '—'}</p>
            <p class="meta">Statut : <strong>${annee.statut}</strong></p>
            <div class="form-actions">
              <button class="action-btn" data-action="annee:open:${annee.id}" ${anneeActiveId === annee.id ? 'disabled' : ''}>Ouvrir</button>
              <button class="action-btn" data-action="annee:close:${annee.id}">Clôturer</button>
              <button class="action-btn" data-action="annee:active:${annee.id}">Définir active</button>
              <button class="action-btn delete" data-action="annee:delete:${annee.id}">Supprimer</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderClasses(state) {
  const section = document.getElementById('classes');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Ajouter une classe</h3></div>
      <form class="form-grid compact" data-form="classe">
        <label>Nom <input name="nom" type="text" required /></label>
        <label>Catégorie <input name="categorie" type="text" required /></label>
        <label>Année
          <select name="anneeId">
            ${state.annees.map((annee) => `<option value="${annee.id}">${annee.annee}</option>`).join('')}
          </select>
        </label>
        <label>Capacité <input name="capacite" type="number" min="1" value="40" /></label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Liste des classes</h3></div>
      <div class="cards-grid">
        ${state.classes.map((classe) => `
          <div class="detail-card">
            <h4>${classe.nom}</h4>
            <p class="meta">${classe.categorie}</p>
            <p class="meta">Année : ${state.annees.find((a) => a.id === classe.anneeId)?.annee || '—'}</p>
            <p class="meta">Capacité : ${classe.capacite}</p>
            <div class="form-actions">
              <button class="action-btn" data-action="classe:toggle:${classe.id}">${classe.active ? 'Désactiver' : 'Activer'}</button>
              <button class="action-btn delete" data-action="classe:delete:${classe.id}">Supprimer</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderEleves(state) {
  const section = document.getElementById('eleves');
  section.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">Dossiers élèves</span><h2>Recherche et suivi des élèves</h2></div>
      <span class="meta">${state.eleves.length} dossier(s)</span>
    </div>
    <div class="panel advanced-search">
      <label>Recherche avancée
        <input type="search" data-student-search placeholder="Matricule, nom, parent, téléphone, e-mail…" />
      </label>
      <label>Classe
        <select data-student-class>
          <option value="">Toutes les classes</option>
          ${state.classes.map((classe) => `<option value="${classe.id}">${escapeHtml(classe.nom)}</option>`).join('')}
        </select>
      </label>
      <label>Statut
        <select data-student-status>
          <option value="">Tous</option><option value="actif">Actif</option><option value="inactif">Inactif</option>
        </select>
      </label>
      <span class="search-count" data-student-count>${state.eleves.length} résultat(s)</span>
    </div>
    <div class="panel section-form">
      <div class="panel-header"><h3>Nouvelle fiche élève</h3><span class="meta">Identité, contacts et responsable</span></div>
      <form class="form-grid" data-form="eleve">
        <label>Matricule <input name="matricule" type="text" placeholder="IBK-YYYY-NNNN (auto-généré si vide)" /></label>
        <label>Prénom <input name="prenom" type="text" required /></label>
        <label>Nom <input name="nom" type="text" required /></label>
        <label>Sexe
          <select name="sexe">
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </label>
        <label>Date de naissance <input name="dateNaissance" type="date" /></label>
        <label>Téléphone <input name="telephone" type="text" /></label>
        <label>Email <input name="email" type="email" /></label>
        <label>Parent/Tuteur <input name="parent" type="text" /></label>
        <label>Classe
          <select name="classeId">
            ${state.classes.map((c) => `<option value="${c.id}">${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Adresse <input name="adresse" type="text" /></label>
        <label>Tarif (inscription auto)
          <select data-auto-tarif>
            <option value="">— Sélectionner un tarif (optionnel) —</option>
            ${state.tarifs.map((t) => `<option value="${t.id}">${escapeHtml(getClassName(state, t.classeId))} — ${formatMoney(t.montantAnnuel)} ${escapeHtml(state.config.devise)} (${escapeHtml(state.annees.find((a) => a.id === t.anneeId)?.annee || '—')})</option>`).join('')}
          </select>
        </label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Répertoire des élèves</h3><button class="secondary-btn small-btn" data-action="report:students-csv">Exporter la liste</button></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Matricule</th><th>Nom</th><th>Classe</th><th>Contact</th><th>Statut</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${state.eleves.map((eleve) => `
              <tr data-student-row data-class="${eleve.classeId || ''}" data-status="${eleve.actif ? 'actif' : 'inactif'}"
                data-search="${escapeHtml([eleve.matricule, eleve.prenom, eleve.nom, eleve.parent, eleve.telephone, eleve.email, getClassName(state, eleve.classeId)].join(' ').toLowerCase())}">
                <td>${eleve.matricule}</td>
                <td>${eleve.prenom} ${eleve.nom}</td>
                <td>${getClassName(state, eleve.classeId)}</td>
                <td>${eleve.telephone || eleve.email || '—'}</td>
                <td><span class="badge ${eleve.actif ? 'ok' : 'danger'}">${eleve.actif ? 'Actif' : 'Inactif'}</span></td>
                <td>
                  <button class="action-btn" data-action="eleve:profile:${eleve.id}">Fiche</button>
                  <button class="action-btn" data-action="eleve:edit:${eleve.id}">Modifier</button>
                  <button class="action-btn" data-action="eleve:toggle:${eleve.id}">${eleve.actif ? 'Désactiver' : 'Activer'}</button>
                  <button class="action-btn delete" data-action="eleve:delete:${eleve.id}">Supprimer</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderInscriptions(state) {
  const section = document.getElementById('inscriptions');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Nouvelle inscription</h3></div>
      <form class="form-grid compact" data-form="inscription">
        <label>Élève
          <select name="eleveId">
            ${state.eleves.map((e) => `<option value="${e.id}">${e.prenom} ${e.nom}</option>`).join('')}
          </select>
        </label>
        <label>Année
          <select name="anneeId">
            ${state.annees.map((a) => `<option value="${a.id}">${a.annee}</option>`).join('')}
          </select>
        </label>
        <label>Classe
          <select name="classeId">
            ${state.classes.map((c) => `<option value="${c.id}">${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Type
          <select name="type">
            <option value="nouvelle">Nouvelle</option>
            <option value="reinscription">Réinscription</option>
          </select>
        </label>
        <label>Statut
          <select name="statut">
            <option value="inscrit">Inscrit</option>
            <option value="transfere">Transféré</option>
            <option value="termine">Terminé</option>
            <option value="abandon">Abandon</option>
          </select>
        </label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Historique d’inscriptions</h3></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Élève</th><th>Classe</th><th>Type</th><th>Statut</th><th>Échéances</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${state.inscriptions.map((inscription) => `
              <tr>
                <td>${getEleveName(state, inscription.eleveId)}</td>
                <td>${getClassName(state, inscription.classeId)}</td>
                <td>${inscription.type}</td>
                <td>${inscription.statut}</td>
                <td>${(inscription.echeances || []).length}</td>
                <td>
                  <button class="action-btn" data-action="inscription:reinscrire:${inscription.id}">Réinscrire</button>
                  <button class="action-btn delete" data-action="inscription:delete:${inscription.id}">Supprimer</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderTarifs(state) {
  const section = document.getElementById('tarifs');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Configurer un tarif</h3></div>
      <form class="form-grid compact" data-form="tarif">
        <label>Classe
          <select name="classeId">
            ${state.classes.map((c) => `<option value="${c.id}">${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Année
          <select name="anneeId">
            ${state.annees.map((a) => `<option value="${a.id}">${a.annee}</option>`).join('')}
          </select>
        </label>
        <label>Montant annuel <input name="montantAnnuel" type="number" min="0" step="100" required /></label>
        <label>Tranche 1 <input name="tranche1" type="number" min="0" step="100" /></label>
        <label>Date limite 1 <input name="dateTranche1" type="date" /></label>
        <label>Tranche 2 <input name="tranche2" type="number" min="0" step="100" /></label>
        <label>Date limite 2 <input name="dateTranche2" type="date" /></label>
        <label>Tranche 3 <input name="tranche3" type="number" min="0" step="100" /></label>
        <label>Date limite 3 <input name="dateTranche3" type="date" /></label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Tarifs configurés</h3></div>
      <div class="cards-grid">
        ${state.tarifs.map((tarif) => `
          <div class="detail-card">
            <h4>${getClassName(state, tarif.classeId)}</h4>
            <p class="meta">Année : ${state.annees.find((a) => a.id === tarif.anneeId)?.annee || '—'}</p>
            <p class="meta">Total : ${formatMoney(tarif.montantAnnuel)} ${state.config.devise}</p>
            <div class="form-actions">
              <button class="action-btn" data-action="tarif:duplicate:${tarif.id}">Dupliquer</button>
              <button class="action-btn delete" data-action="tarif:delete:${tarif.id}">Supprimer</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderPaiements(state) {
  const section = document.getElementById('paiements');
  const activeInscription = state.inscriptions[0];
  section.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">Trésorerie</span><h2>Encaissements et reçus</h2></div>
      <button class="secondary-btn small-btn" data-action="paiement:export-csv">Exporter la liste des paiements CSV</button>
    </div>
    <div class="panel section-form">
      <div class="panel-header"><h3>Enregistrer un paiement</h3><span class="meta">Paiements partiels autorisés, reçu disponible après validation</span></div>
      <form class="form-grid compact" data-form="paiement">
        <label class="span-two">Rechercher par matricule
          <input type="text" data-matricule-search placeholder="Ex: IBK-2025-0001" autocomplete="off" />
        </label>
        <label>Inscription
          <select name="inscriptionId">
            ${state.inscriptions.map((inscription) => `<option value="${inscription.id}">${getEleveName(state, inscription.eleveId)} - ${getClassName(state, inscription.classeId)} (${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || '—'})</option>`).join('')}
          </select>
        </label>
        <label>Échéance
          <select name="echeanceId">
            ${(activeInscription?.echeances || []).map((e) => {
              const remaining = Math.max(Number(e.montant || 0) - Number(e.montantPaye || 0), 0);
              return `<option value="${e.id}" ${remaining <= 0 ? 'disabled' : ''}>Tranche ${e.trancheId} — reste ${formatMoney(remaining)} ${state.config.devise}</option>`;
            }).join('') || '<option value="">Aucune échéance</option>'}
          </select>
        </label>
        <label>Montant <input name="montant" type="number" min="0" step="100" required /></label>
        <label>Mode
          <select name="mode">
            <option value="espece">Espèce</option>
            <option value="virement">Virement</option>
            <option value="cheque">Chèque</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="carte">Carte</option>
          </select>
        </label>
        <label>Référence <input name="reference" type="text" /></label>
        <label>Caissier <input name="caissier" type="text" value="Admin" /></label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Journal des paiements</h3><span class="meta" data-payment-count>${state.paiements.length} résultat(s) · annulations conservées</span></div>
      <div class="advanced-search payment-search">
        <label>Recherche <input type="search" data-payment-search placeholder="Élève, référence, mode, caissier…" /></label>
        <label>Du <input type="date" data-payment-from /></label>
        <label>Au <input type="date" data-payment-to /></label>
        <label>État
          <select data-payment-status><option value="">Tous</option><option value="valide">Validés</option><option value="annule">Annulés</option></select>
        </label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Élève</th><th>Matricule</th><th>Classe / année</th><th>Montant</th><th>Mode</th><th>Référence</th><th>Caissier</th><th>Date</th><th>État</th><th>Actions</th></tr></thead>
          <tbody>
            ${[...state.paiements].sort((a, b) => String(b.datePaiement).localeCompare(String(a.datePaiement))).map((paiement) => {
              const inscription = state.inscriptions.find((i) => i.id === paiement.inscriptionId);
              const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
              const studentName = eleve ? `${eleve.prenom} ${eleve.nom}` : '—';
              const searchable = [studentName, eleve?.matricule, paiement.reference, paiement.mode, paiement.caissier].join(' ').toLowerCase();
              return `
                <tr data-payment-row data-date="${paiement.datePaiement || ''}" data-status="${paiement.annule ? 'annule' : 'valide'}" data-search="${escapeHtml(searchable)}">
                  <td>${studentName}</td>
                  <td>${escapeHtml(eleve?.matricule || '—')}</td>
                  <td>${inscription ? `${getClassName(state, inscription.classeId)} / ${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || '—'}` : '—'}</td>
                  <td>${formatMoney(paiement.montant)} ${state.config.devise}</td>
                  <td>${paiement.mode}</td>
                  <td>${paiement.reference || '—'}</td>
                  <td>${paiement.caissier || '—'}</td>
                  <td>${paiement.datePaiement}</td>
                  <td><span class="badge ${paiement.annule ? 'danger' : 'ok'}">${paiement.annule ? 'Annulé' : 'Validé'}</span></td>
                  <td>
                    ${paiement.annule ? '' : `<button class="action-btn" data-action="paiement:receipt:${paiement.id}">Reçu</button>
                    <button class="action-btn" data-action="paiement:cancel:${paiement.id}">Annuler</button>`}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderRapports(state) {
  const section = document.getElementById('rapports');
  const totalEncaisse = state.paiements.filter((p) => !p.annule).reduce((sum, p) => sum + Number(p.montant || 0), 0);
  const tardifs = state.inscriptions.flatMap((inscription) => (inscription.echeances || [])
    .filter((echeance) => ['en_retard', 'impayee'].includes(echeance.statut))
    .map((echeance) => ({
      inscription,
      eleve: getEleveName(state, inscription.eleveId),
      classe: getClassName(state, inscription.classeId),
      tranche: echeance.trancheId,
      montant: Math.max(Number(echeance.montant || 0) - Number(echeance.montantPaye || 0), 0),
      dateLimite: echeance.dateLimite,
      statut: echeance.statut
    })));
  const totalDu = state.inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
  const rate = totalDu ? Math.round(totalEncaisse / totalDu * 100) : 0;

  section.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">Analyses</span><h2>Rapports de scolarité</h2></div>
      <div class="form-actions">
        <button class="secondary-btn small-btn" data-action="report:export-csv">Exporter CSV</button>
        <button class="primary-btn small-btn" data-action="report:print">Imprimer / PDF</button>
      </div>
    </div>
    <div class="stats-grid">
      <article class="stat-card accent-green"><div class="icon">💵</div><div><span>Encaissement</span><strong>${formatMoney(totalEncaisse)} ${state.config.devise}</strong></div></article>
      <article class="stat-card accent-blue"><div class="icon">⏳</div><div><span>Échéances en retard</span><strong>${tardifs.length}</strong></div></article>
      <article class="stat-card accent-purple"><div class="icon">📈</div><div><span>Inscriptions</span><strong>${state.inscriptions.length}</strong></div></article>
      <article class="stat-card accent-gold"><div class="icon">📊</div><div><span>Taux de recouvrement</span><strong>${rate}%</strong></div></article>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Échéances à régulariser</h3><span class="meta">Montant restant par échéance</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Élève</th><th>Classe</th><th>Tranche</th><th>Échéance</th><th>Reste dû</th><th>Statut</th><th>Fiche</th></tr></thead>
          <tbody>
            ${tardifs.length ? tardifs.map((item) => `
              <tr><td>${escapeHtml(item.eleve)}</td><td>${escapeHtml(item.classe)}</td><td>${item.tranche}</td><td>${item.dateLimite || '—'}</td><td>${formatMoney(item.montant)} ${state.config.devise}</td><td>${item.statut}</td><td><button class="action-btn" data-action="eleve:profile:${item.inscription.eleveId}">Voir</button></td></tr>
            `).join('') : '<tr><td colspan="7">Aucune échéance à régulariser.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Résumé par année scolaire</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Année</th><th>Inscriptions</th><th>Encaissements</th><th>Frais dus</th><th>À recouvrer</th><th>Recouvrement</th></tr></thead>
        <tbody>${state.annees.map((annee) => {
          const yearInscriptions = state.inscriptions.filter((inscription) => inscription.anneeId === annee.id);
          const ids = new Set(yearInscriptions.map((inscription) => inscription.id));
          const paid = state.paiements.filter((payment) => !payment.annule && ids.has(payment.inscriptionId))
            .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
          const due = yearInscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
          return `<tr><td>${escapeHtml(annee.annee)}</td><td>${yearInscriptions.length}</td><td>${formatMoney(paid)} ${state.config.devise}</td><td>${formatMoney(due)} ${state.config.devise}</td><td>${formatMoney(Math.max(due - paid, 0))} ${state.config.devise}</td><td>${due ? Math.round(paid / due * 100) : 0}%</td></tr>`;
        }).join('') || '<tr><td colspan="6">Aucune année scolaire.</td></tr>'}</tbody>
      </table></div>
    </div>
  `;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPaymentsCsv(state, filters = {}) {
  const search = String(filters.search || '').trim().toLocaleLowerCase('fr');
  const status = filters.status || '';
  const from = filters.from || '';
  const to = filters.to || '';
  const rows = [['Date', 'Matricule', 'Élève', 'Année scolaire', 'Classe', 'Échéance', 'Montant', 'Devise', 'Mode', 'Référence', 'Caissier', 'État', 'Motif annulation']];
  const payments = [...state.paiements]
    .filter((payment) => {
      const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
      const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
      const haystack = [eleve?.matricule, eleve?.prenom, eleve?.nom, payment.reference, payment.mode, payment.caissier]
        .join(' ').toLocaleLowerCase('fr');
      return (!search || haystack.includes(search))
        && (!status || (payment.annule ? 'annule' : 'valide') === status)
        && (!from || payment.datePaiement >= from)
        && (!to || payment.datePaiement <= to);
    })
    .sort((a, b) => String(a.datePaiement).localeCompare(String(b.datePaiement)));

  payments.forEach((payment) => {
    const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
    const eleve = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
    const echeance = inscription?.echeances?.find((item) => item.id === payment.echeanceId);
    rows.push([
      payment.datePaiement,
      eleve?.matricule || '',
      eleve ? `${eleve.prenom} ${eleve.nom}` : '',
      state.annees.find((item) => item.id === inscription?.anneeId)?.annee || '',
      getClassName(state, inscription?.classeId),
      echeance?.libelle || `Tranche ${echeance?.trancheId || ''}`,
      payment.montant,
      state.config.devise,
      payment.mode,
      payment.reference,
      payment.caissier,
      payment.annule ? 'Annulé' : 'Validé',
      payment.motif || ''
    ]);
  });

  downloadCsv('liste-paiements.csv', rows);
}

export function exportStudentsCsv(state) {
  const rows = [['Matricule', 'Prénom', 'Nom', 'Sexe', 'Date de naissance', 'Parent / tuteur', 'Téléphone', 'E-mail', 'Adresse', 'Classe', 'Statut']];
  state.eleves.forEach((eleve) => rows.push([
    eleve.matricule, eleve.prenom, eleve.nom, eleve.sexe, eleve.dateNaissance, eleve.parent,
    eleve.telephone, eleve.email, eleve.adresse, getClassName(state, eleve.classeId), eleve.actif ? 'Actif' : 'Inactif'
  ]));
  downloadCsv('liste-eleves.csv', rows);
}

export function exportReportCsv(state) {
  const rows = [['Type', 'Année', 'Classe', 'Élève', 'Détail', 'Montant', 'Date', 'Statut']];
  state.inscriptions.forEach((inscription) => {
    const student = state.eleves.find((item) => item.id === inscription.eleveId);
    const year = state.annees.find((item) => item.id === inscription.anneeId);
    (inscription.echeances || []).forEach((echeance) => {
      rows.push([
        'Échéance', year?.annee, getClassName(state, inscription.classeId),
        student ? `${student.prenom} ${student.nom}` : '',
        echeance.libelle || `Tranche ${echeance.trancheId}`,
        Math.max(Number(echeance.montant || 0) - Number(echeance.montantPaye || 0), 0),
        echeance.dateLimite, echeance.statut
      ]);
    });
  });
  state.paiements.forEach((payment) => {
    const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
    const student = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
    const echeance = inscription?.echeances?.find((item) => item.id === payment.echeanceId);
    rows.push([
      'Paiement',
      state.annees.find((item) => item.id === inscription?.anneeId)?.annee || '',
      getClassName(state, inscription?.classeId),
      student ? `${student.prenom} ${student.nom}` : '',
      `${echeance?.libelle || `Tranche ${echeance?.trancheId || ''}`} — ${payment.mode || ''} — ${payment.reference || ''}`,
      payment.montant,
      payment.datePaiement,
      payment.annule ? 'Annulé' : 'Validé'
    ]);
  });
  downloadCsv('rapport-scolarite.csv', rows);
}

export function showStudentProfile(state, studentId) {
  const student = state.eleves.find((item) => item.id === Number(studentId));
  const modalRoot = document.getElementById('modal-root');
  if (!student || !modalRoot) return false;

  const inscriptions = state.inscriptions
    .filter((inscription) => inscription.eleveId === student.id)
    .sort((a, b) => String(b.dateInscription).localeCompare(String(a.dateInscription)));
  const history = [];
  inscriptions.forEach((inscription) => {
    history.push({
      date: inscription.dateInscription,
      type: inscription.type === 'reinscription' ? 'Réinscription' : 'Inscription',
      detail: `${state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || 'Année inconnue'} — ${getClassName(state, inscription.classeId)}`,
      amount: '',
      status: inscription.statut
    });
    state.paiements.filter((payment) => payment.inscriptionId === inscription.id).forEach((payment) => {
      history.push({
        date: payment.datePaiement,
        type: payment.annule ? 'Paiement annulé' : 'Paiement',
        detail: `${payment.reference || 'Sans référence'} — ${payment.mode}${payment.motif ? ` — ${payment.motif}` : ''}`,
        amount: `${formatMoney(payment.montant)} ${state.config.devise}`,
        status: payment.annule ? 'Annulé' : 'Validé'
      });
    });
  });
  history.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lifetimePaid = state.paiements
    .filter((payment) => !payment.annule && inscriptions.some((inscription) => inscription.id === payment.inscriptionId))
    .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
  const lifetimeDue = inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);

  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <section class="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
        <header class="modal-header">
          <div><span class="eyebrow">Dossier permanent</span><h2 id="student-profile-title">${escapeHtml(student.prenom)} ${escapeHtml(student.nom)}</h2><span class="meta">Matricule ${escapeHtml(student.matricule)}</span></div>
          <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button>
        </header>
        <div class="profile-grid">
          <div class="profile-info">
            <h3>Informations personnelles</h3>
            <dl>
              <dt>Sexe</dt><dd>${student.sexe === 'F' ? 'Féminin' : 'Masculin'}</dd>
              <dt>Date de naissance</dt><dd>${escapeHtml(student.dateNaissance || '—')}</dd>
              <dt>Parent / tuteur</dt><dd>${escapeHtml(student.parent || '—')}</dd>
              <dt>Téléphone</dt><dd>${escapeHtml(student.telephone || '—')}</dd>
              <dt>E-mail</dt><dd>${escapeHtml(student.email || '—')}</dd>
              <dt>Adresse</dt><dd>${escapeHtml(student.adresse || '—')}</dd>
            </dl>
          </div>
          <div class="profile-summary">
            <h3>Situation financière cumulée</h3>
            <div class="profile-metric"><span>Frais enregistrés</span><strong>${formatMoney(lifetimeDue)} ${state.config.devise}</strong></div>
            <div class="profile-metric"><span>Montant encaissé</span><strong>${formatMoney(lifetimePaid)} ${state.config.devise}</strong></div>
            <div class="profile-metric"><span>Solde restant</span><strong>${formatMoney(Math.max(lifetimeDue - lifetimePaid, 0))} ${state.config.devise}</strong></div>
          </div>
        </div>
        <div class="profile-section">
          <h3>Inscriptions et échéances</h3>
          ${inscriptions.map((inscription) => {
            const balance = getInscriptionBalance(inscription);
            return `<article class="profile-enrollment">
              <div class="enrollment-heading"><strong>${escapeHtml(state.annees.find((annee) => annee.id === inscription.anneeId)?.annee || 'Année inconnue')} · ${escapeHtml(getClassName(state, inscription.classeId))}</strong>
                <span class="badge ${balance.reste ? 'warning' : 'ok'}">${formatMoney(balance.reste)} ${state.config.devise} restant</span></div>
              <div class="table-wrap"><table><thead><tr><th>Échéance</th><th>Montant</th><th>Payé</th><th>Reste</th><th>Date limite</th><th>Statut</th></tr></thead>
                <tbody>${(inscription.echeances || []).map((echeance) => `<tr>
                  <td>${escapeHtml(echeance.libelle || `Tranche ${echeance.trancheId}`)}</td><td>${formatMoney(echeance.montant)} ${state.config.devise}</td>
                  <td>${formatMoney(echeance.montantPaye)} ${state.config.devise}</td>
                  <td>${formatMoney(Math.max(Number(echeance.montant || 0) - Number(echeance.montantPaye || 0), 0))} ${state.config.devise}</td>
                  <td>${escapeHtml(echeance.dateLimite || '—')}</td><td>${escapeHtml(echeance.statut)}</td>
                </tr>`).join('') || '<tr><td colspan="6">Aucune échéance enregistrée.</td></tr>'}</tbody>
              </table></div>
            </article>`;
          }).join('') || '<p class="meta">Aucune inscription enregistrée pour cet élève.</p>'}
        </div>
        <div class="profile-section">
          <h3>Historique complet</h3>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Montant</th><th>Statut</th></tr></thead>
            <tbody>${history.map((item) => `<tr><td>${escapeHtml(item.date || '—')}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.detail)}</td><td>${escapeHtml(item.amount)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') || '<tr><td colspan="5">Aucun événement dans l’historique.</td></tr>'}</tbody>
          </table></div>
        </div>
      </section>
    </div>
  `;
  return true;
}

function openPrintWindow(title, content) {
  const printRoot = document.getElementById('print-root');
  if (!printRoot) return false;
  printRoot.innerHTML = `<div class="print-document" data-print-title="${escapeHtml(title)}">
    <style>
      #print-root .print-document{font:14px Arial,sans-serif;color:#172033}
      #print-root h1,#print-root h2{margin:0 0 12px}
      #print-root p{color:#526078}
      #print-root .brand{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:16px;margin-bottom:24px}
      #print-root .summary{display:flex;gap:12px;margin:20px 0}
      #print-root .summary div{border:1px solid #d8deea;border-radius:8px;padding:12px;flex:1}
      #print-root table{width:100%;border-collapse:collapse;margin-top:16px}
      #print-root th,#print-root td{text-align:left;border-bottom:1px solid #d8deea;padding:9px 7px}
      #print-root th{background:#f2f4fa;font-size:11px;text-transform:uppercase}
      #print-root .amount{font-size:22px;font-weight:bold}
      @media print{#print-root .print-document{padding:12mm}}
    </style>${content}</div>`;
  window.print();
  return true;
}

export function printPaymentReceipt(state, paymentId) {
  const payment = state.paiements.find((item) => item.id === Number(paymentId));
  if (!payment || payment.annule) return false;
  const inscription = state.inscriptions.find((item) => item.id === payment.inscriptionId);
  const student = inscription && state.eleves.find((item) => item.id === inscription.eleveId);
  const echeance = inscription?.echeances?.find((item) => item.id === payment.echeanceId);
  const year = state.annees.find((item) => item.id === inscription?.anneeId);
  const content = `
    <header class="brand"><div><h1>${escapeHtml(state.config.nom)}</h1><p>${escapeHtml(state.config.adresse || '')} · ${escapeHtml(state.config.telephone || '')}</p></div>
      <div><strong>REÇU DE PAIEMENT</strong><p>N° ${escapeHtml(payment.reference || payment.id)}</p></div></header>
    <p>Reçu de : <strong>${escapeHtml(student ? `${student.prenom} ${student.nom}` : 'Élève')}</strong> — ${escapeHtml(student?.matricule || '')}</p>
    <p>Année / classe : ${escapeHtml(year?.annee || '—')} / ${escapeHtml(getClassName(state, inscription?.classeId))}</p>
    <p>Motif : ${escapeHtml(echeance?.libelle || `Tranche ${echeance?.trancheId || ''}`)}</p>
    <div class="summary"><div><small>Montant reçu</small><div class="amount">${formatMoney(payment.montant)} ${escapeHtml(state.config.devise)}</div></div>
      <div><small>Date</small><div>${escapeHtml(payment.datePaiement || '—')}</div></div><div><small>Mode</small><div>${escapeHtml(payment.mode || '—')}</div></div></div>
    <p>Caissier : ${escapeHtml(payment.caissier || '—')} · Référence : ${escapeHtml(payment.reference || '—')}</p>
    <p style="margin-top:60px">Signature et cachet : ______________________________</p>`;
  return openPrintWindow('Reçu de paiement', content);
}

export function printReport(state) {
  const totalPaid = state.paiements.filter((payment) => !payment.annule)
    .reduce((sum, payment) => sum + Number(payment.montant || 0), 0);
  const totalDue = state.inscriptions.reduce((sum, inscription) => sum + getInscriptionBalance(inscription).total, 0);
  const lateRows = state.inscriptions.flatMap((inscription) => (inscription.echeances || [])
    .filter((echeance) => ['en_retard', 'impayee'].includes(echeance.statut))
    .map((echeance) => `<tr><td>${escapeHtml(getEleveName(state, inscription.eleveId))}</td><td>${escapeHtml(getClassName(state, inscription.classeId))}</td>
      <td>${escapeHtml(echeance.libelle || `Tranche ${echeance.trancheId}`)}</td><td>${escapeHtml(echeance.dateLimite || '—')}</td>
      <td>${formatMoney(Math.max(Number(echeance.montant || 0) - Number(echeance.montantPaye || 0), 0))} ${escapeHtml(state.config.devise)}</td><td>${escapeHtml(echeance.statut)}</td></tr>`));
  const content = `<header class="brand"><div><h1>${escapeHtml(state.config.nom)}</h1><p>Rapport de gestion scolaire · Généré le ${new Date().toLocaleDateString('fr-FR')}</p></div><strong>RAPPORT</strong></header>
    <div class="summary"><div><small>Élèves</small><div class="amount">${state.eleves.length}</div></div><div><small>Inscriptions</small><div class="amount">${state.inscriptions.length}</div></div>
    <div><small>Encaissements</small><div class="amount">${formatMoney(totalPaid)} ${escapeHtml(state.config.devise)}</div></div>
    <div><small>Recouvrement</small><div class="amount">${totalDue ? Math.round(totalPaid / totalDue * 100) : 0}%</div></div></div>
    <h2>Échéances à régulariser</h2><table><thead><tr><th>Élève</th><th>Classe</th><th>Échéance</th><th>Date limite</th><th>Reste dû</th><th>Statut</th></tr></thead>
    <tbody>${lateRows.join('') || '<tr><td colspan="6">Aucune échéance à régulariser.</td></tr>'}</tbody></table>`;
  return openPrintWindow('Rapport de scolarité', content);
}

export function renderConfig(state) {
  const section = document.getElementById('config');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Configuration de l’école</h3></div>
      <form class="form-grid compact" data-form="config">
        <label>Nom <input name="nom" type="text" value="${state.config.nom || ''}" /></label>
        <label>Sigle <input name="sigle" type="text" value="${state.config.sigle || ''}" /></label>
        <label>Code <input name="codeEcole" type="text" value="${state.config.codeEcole || ''}" /></label>
        <label>Devise <input name="devise" type="text" value="${state.config.devise || 'GNF'}" /></label>
        <label>Adresse <input name="adresse" type="text" value="${state.config.adresse || ''}" /></label>
        <label>Téléphone <input name="telephone" type="text" value="${state.config.telephone || ''}" /></label>
        <label>Email <input name="email" type="email" value="${state.config.email || ''}" /></label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Enregistrer</button></div>
      </form>
    </div>
  `;
}
