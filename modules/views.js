import { escapeHtml, formatMoney, formatDateFr } from './utils.js';
import { CATEGORIES } from './classes.js';
import { studentOf, yearLabel } from './finance.js';

const className = (state, id) => state.classes.find((c) => c.id === Number(id))?.nom || '—';
const eleveLabel = (e) => `${e.matricule} — ${e.prenom} ${e.nom}`;

function categorySelect(listId) {
  return `<label>Catégorie
    <select data-cat-for="${listId}"><option value="">Toutes</option>${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
  </label>`;
}

function yearSelect(state, listId) {
  return `<label>Année scolaire
    <select name="anneeId" ${listId ? `data-year-for="${listId}"` : ''}>${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select>
  </label>`;
}

function classPicker(state, listId, { required = true, label = 'Classe (tapez pour filtrer)' } = {}) {
  const options = state.classes.filter((c) => c.anneeId === state.anneeActiveId).map((c) => `<option value="${escapeHtml(c.nom)}"></option>`).join('');
  return `<label>${label}
    <input name="classeText" list="${listId}" type="search" placeholder="Ex : 6e A" autocomplete="off" ${required ? 'required' : ''} />
    <datalist id="${listId}">${options}</datalist>
  </label>`;
}

const actions = (...buttons) => `<div class="form-actions">${buttons.join('')}</div>`;
const btn = (action, label, cls = '') => `<button type="button" class="action-btn ${cls}" data-action="${action}">${label}</button>`;
const formButtons = (editLabel = 'Enregistrer') => `<div class="form-actions span-two"><button type="submit" class="primary-btn" data-submit-label>${editLabel}</button><button type="button" class="secondary-btn" data-action="form:reset" hidden>Annuler la modification</button></div>`;

export function renderAnnees(state) {
  const section = document.getElementById('annees');
  const active = state.anneeActiveId || state.annees[0]?.id;
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Année scolaire</h3><span class="meta">Ajouter ou modifier</span></div>
      <form class="form-grid compact" data-form="annee">
        <label>Année <input name="annee" type="text" required placeholder="2026-2027" /></label>
        <label>Date de rentrée <input name="dateDebut" type="date" /></label>
        <label>Date de fin <input name="dateFin" type="date" /></label>
        <label>Solde d’ouverture de caisse <input name="soldeInitial" type="number" min="0" step="1" value="0" /></label>
        <label>Frais d’inscription (nouvel élève) <input name="fraisInscription" type="number" min="0" step="1" value="0" /></label>
        <label>Frais de réinscription <input name="fraisReinscription" type="number" min="0" step="1" value="0" /></label>
        <label>Statut
          <select name="statut"><option value="preparation">Préparation</option><option value="ouverte">Ouverte</option><option value="cloturee">Clôturée</option></select>
        </label>
        ${formButtons('Ajouter')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Liste des années</h3></div>
      <div class="cards-grid">
        ${state.annees.map((a) => `
          <div class="detail-card">
            <h4>${escapeHtml(a.annee)} ${a.id === active ? '<span class="badge ok">active</span>' : ''}</h4>
            <p class="meta">${escapeHtml(formatDateFr(a.dateDebut))} → ${escapeHtml(formatDateFr(a.dateFin))}</p>
            <p class="meta">Solde d’ouverture : ${formatMoney(a.soldeInitial || 0)} ${escapeHtml(state.config.devise)}</p>
            <p class="meta">Inscription : ${formatMoney(a.fraisInscription || 0)} · Réinscription : ${formatMoney(a.fraisReinscription || 0)} ${escapeHtml(state.config.devise)}</p>
            <p class="meta">Statut : <strong>${escapeHtml(a.statut)}</strong> · ${state.inscriptions.filter((i) => i.anneeId === a.id).length} inscription(s)</p>
            ${actions(btn(`annee:view:${a.id}`, 'Consulter'), btn(`annee:edit:${a.id}`, 'Modifier'), btn(`annee:open:${a.id}`, 'Valider (ouvrir)'), btn(`annee:close:${a.id}`, 'Clôturer'), btn(`annee:active:${a.id}`, 'Définir active'), btn(`annee:delete:${a.id}`, 'Supprimer', 'delete'))}
          </div>`).join('')}
      </div>
    </div>`;
}

export function renderClasses(state) {
  const section = document.getElementById('classes');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Classe</h3><span class="meta">Ajouter ou modifier</span></div>
      <form class="form-grid compact" data-form="classe">
        <label>Nom de la classe <input name="nom" type="text" required placeholder="Ex : 6e A" /></label>
        <label>Catégorie
          <select name="categorie" required>${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
        </label>
        ${yearSelect(state)}
        <label>Capacité <input name="capacite" type="number" min="1" value="40" /></label>
        ${formButtons('Ajouter')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Liste des classes</h3><span class="meta" data-class-count>${state.classes.length} classe(s)</span></div>
      <div class="report-tabs" role="tablist">
        <button type="button" class="tab-btn active" data-class-filter="">Toutes</button>
        ${CATEGORIES.map((c) => `<button type="button" class="tab-btn" data-class-filter="${c}">${c}</button>`).join('')}
      </div>
      <div class="cards-grid">
        ${state.classes.map((c) => `
          <div class="detail-card" data-class-card data-cat="${escapeHtml(c.categorie)}">
            <h4>${escapeHtml(c.nom)} ${c.active ? '' : '<span class="badge danger">inactive</span>'}</h4>
            <p class="meta">${escapeHtml(c.categorie)}</p>
            <p class="meta">Année : ${escapeHtml(yearLabel(state, c.anneeId))} · ${state.inscriptions.filter((i) => i.classeId === c.id).length}/${c.capacite} élève(s)</p>
            ${actions(btn(`classe:view:${c.id}`, 'Consulter'), btn(`classe:edit:${c.id}`, 'Modifier'), btn(`classe:toggle:${c.id}`, c.active ? 'Désactiver' : 'Activer'), btn(`classe:delete:${c.id}`, 'Supprimer', 'delete'))}
          </div>`).join('')}
      </div>
    </div>`;
}

export function renderEleves(state) {
  const section = document.getElementById('eleves');
  section.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">Dossiers élèves</span><h2>Recherche et suivi des élèves</h2></div>
      <span class="meta">${state.eleves.length} dossier(s)</span>
    </div>
    <div class="panel advanced-search">
      <label>Recherche avancée <input type="search" data-student-search placeholder="Matricule, nom, parent, téléphone, e-mail…" /></label>
      <label>Classe
        <select data-student-class><option value="">Toutes les classes</option>${state.classes.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)} (${escapeHtml(yearLabel(state, c.anneeId))})</option>`).join('')}</select>
      </label>
      <label>Statut
        <select data-student-status><option value="">Tous</option><option value="actif">Actif</option><option value="inactif">Inactif</option></select>
      </label>
      <span class="search-count" data-student-count>${state.eleves.length} résultat(s)</span>
    </div>
    <div class="panel section-form">
      <div class="panel-header"><h3>Fiche élève</h3><span class="meta">Après l'ajout, vous passez directement à l'inscription</span></div>
      <form class="form-grid" data-form="eleve">
        <label>Matricule <input name="matricule" type="text" placeholder="IBK-AAAA-NNNN (généré si vide)" /></label>
        <label>Prénom <input name="prenom" type="text" required /></label>
        <label>Nom <input name="nom" type="text" required /></label>
        <label>Sexe <select name="sexe"><option value="M">Masculin</option><option value="F">Féminin</option></select></label>
        <label>Date de naissance <input name="dateNaissance" type="date" /></label>
        <label>Téléphone <input name="telephone" type="text" /></label>
        <label>Email <input name="email" type="email" /></label>
        <label>Parent / tuteur <input name="parent" type="text" /></label>
        ${categorySelect('eleve-classes')}
        ${classPicker(state, 'eleve-classes', { label: 'Classe souhaitée (tapez pour filtrer)' })}
        <label>Adresse <input name="adresse" type="text" /></label>
        ${formButtons('Ajouter et inscrire')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Répertoire des élèves</h3><button class="secondary-btn small-btn" data-action="report:students-csv">Exporter la liste</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Matricule</th><th>Nom</th><th>Classe</th><th>Contact</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${state.eleves.map((e) => `
          <tr data-student-row data-class="${e.classeId || ''}" data-status="${e.actif ? 'actif' : 'inactif'}"
            data-search="${escapeHtml([e.matricule, e.prenom, e.nom, e.parent, e.telephone, e.email, className(state, e.classeId)].join(' ').toLowerCase())}">
            <td>${escapeHtml(e.matricule)}</td><td>${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</td><td>${escapeHtml(className(state, e.classeId))}</td>
            <td>${escapeHtml(e.telephone || e.email || '—')}</td>
            <td><span class="badge ${e.actif ? 'ok' : 'danger'}">${e.actif ? 'Actif' : 'Inactif'}</span></td>
            <td>${btn(`eleve:profile:${e.id}`, 'Consulter')}${btn(`eleve:edit:${e.id}`, 'Modifier')}${btn(`eleve:enroll:${e.id}`, 'Inscrire')}${btn(`eleve:toggle:${e.id}`, e.actif ? 'Désactiver' : 'Activer')}${btn(`eleve:delete:${e.id}`, 'Supprimer', 'delete')}</td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

export function renderInscriptions(state) {
  const section = document.getElementById('inscriptions');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Inscription</h3><span class="meta">Un élève est inscrit dans une classe pour une année scolaire</span></div>
      <form class="form-grid compact" data-form="inscription">
        ${yearSelect(state, 'insc-classes')}
        ${categorySelect('insc-classes')}
        ${classPicker(state, 'insc-classes')}
        <label class="span-two">Élève — nom ou matricule
          <input name="eleveText" list="insc-eleves" type="search" placeholder="Ex : IBK-2026-0001 ou Aminata" autocomplete="off" required />
          <datalist id="insc-eleves">${state.eleves.map((e) => `<option value="${escapeHtml(eleveLabel(e))}"></option>`).join('')}</datalist>
        </label>
        <label>Type <select name="type"><option value="auto">Automatique (selon l’historique de l’élève)</option><option value="nouvelle">Nouvelle inscription</option><option value="reinscription">Réinscription</option></select></label>
        <p class="meta span-all">Les frais d’inscription ou de réinscription de l’année choisie sont ajoutés une seule fois à l’échéancier de l’élève.</p>
        <label>Statut
          <select name="statut"><option value="inscrit">Inscrit</option><option value="transfere">Transféré</option><option value="termine">Terminé</option><option value="abandon">Abandon</option></select>
        </label>
        <div class="form-actions span-two"><button type="submit" class="primary-btn">Ajouter l'inscription</button></div>
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Historique d'inscriptions</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Année</th><th>Classe</th><th>Type</th><th>Statut</th><th>Validation</th><th>Échéances</th><th>Actions</th></tr></thead>
        <tbody>${state.inscriptions.map((i) => {
          const s = studentOf(state, i);
          return `<tr>
            <td>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</td><td>${escapeHtml(yearLabel(state, i.anneeId))}</td><td>${escapeHtml(className(state, i.classeId))}</td>
            <td>${escapeHtml(i.type)}</td><td>${escapeHtml(i.statut)}</td>
            <td><span class="badge ${i.validee ? 'ok' : 'warning'}">${i.validee ? `Validée le ${escapeHtml(formatDateFr(i.dateValidation))}` : 'En attente'}</span></td>
            <td>${(i.echeances || []).length}</td>
            <td>${btn(`eleve:profile:${i.eleveId}`, 'Consulter')}${i.validee ? '' : btn(`inscription:validate:${i.id}`, 'Valider')}${btn(`inscription:reinscrire:${i.id}`, 'Réinscrire')}${btn(`inscription:delete:${i.id}`, 'Supprimer', 'delete')}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="8">Aucune inscription.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

export function renderTarifs(state) {
  const section = document.getElementById('tarifs');
  section.innerHTML = `
    <div class="panel section-form">
      <div class="panel-header"><h3>Frais de scolarité d'une classe</h3><span class="meta">Montants et dates calculés automatiquement ; dates modifiables par l'administrateur</span></div>
      <form class="form-grid compact" data-form="tarif">
        ${yearSelect(state, 'tarif-classes')}
        ${categorySelect('tarif-classes')}
        ${classPicker(state, 'tarif-classes')}
        <label>Montant annuel <input name="montantAnnuel" type="number" min="0" step="1" required /></label>
        <label>Tranche 1 <input name="tranche1" type="number" min="0" step="1" /></label>
        <label>Échéance 1 <input name="dateTranche1" type="date" /></label>
        <label>Tranche 2 <input name="tranche2" type="number" min="0" step="1" /></label>
        <label>Échéance 2 <input name="dateTranche2" type="date" /></label>
        <label>Tranche 3 <input name="tranche3" type="number" min="0" step="1" /></label>
        <label>Échéance 3 <input name="dateTranche3" type="date" /></label>
        <p class="meta span-all form-section-title">Paiement mensuel (proposé au moment du paiement, en alternative aux tranches)</p>
        <label>Montant du paiement mensuel <input name="montantMensuel" type="number" min="0" step="1" placeholder="Calculé automatiquement" /></label>
        <label>Nombre de mensualités <input name="nbMois" type="number" min="1" max="12" value="9" /></label>
        <label>1ère mensualité le <input name="moisDebut" type="date" /></label>
        <p class="meta span-all" data-tarif-info aria-live="polite">Saisissez le montant annuel : les tranches et le montant mensuel sont proposés automatiquement.</p>
        ${formButtons('Ajouter')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Tarifs configurés</h3></div>
      <div class="cards-grid">
        ${state.tarifs.map((t) => `
          <div class="detail-card">
            <h4>${escapeHtml(className(state, t.classeId))}</h4>
            <p class="meta">Année : ${escapeHtml(yearLabel(state, t.anneeId))}</p>
            <p class="meta">Total : ${formatMoney(t.montantAnnuel)} ${escapeHtml(state.config.devise)} · ${(t.tranches || []).length} tranches</p>
            <p class="meta">${Number(t.montantMensuel) > 0 ? `Mensuel : ${t.nbMois} × ${formatMoney(t.montantMensuel)} = ${formatMoney(t.montantMensuel * t.nbMois)} ${escapeHtml(state.config.devise)}` : 'Paiement mensuel non proposé'}</p>
            ${actions(btn(`tarif:view:${t.id}`, 'Consulter'), btn(`tarif:edit:${t.id}`, 'Modifier'), btn(`tarif:duplicate:${t.id}`, 'Dupliquer'), btn(`tarif:delete:${t.id}`, 'Supprimer', 'delete'))}
          </div>`).join('')}
      </div>
    </div>`;
}
