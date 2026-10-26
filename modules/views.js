import { escapeHtml, formatMoney, formatDateFr } from './utils.js';
import { can } from './auth.js';
import { CATEGORIES } from './classes.js';
import { studentOf, yearLabel } from './finance.js';
import { texteMensuel } from './modalites.js';
import { programmeDeClasse } from './programme.js';
import { OPTIONS_RECONDUCTION, anneePrecedente } from './reconduction.js';
import { DECISIONS, candidatsPassage, niveauScolaire, recapReinscription } from './passage.js';
import { LIENS, nomContact, enfantsDuContact, telephoneFamille } from './contacts.js';
import { enteteHtml } from './entete.js';
import { printDocument } from './print.js';

// ── Passage et réinscriptions : décisions de fin d'année puis inscription groupée des élèves autorisés ──
export const passageView = { sourceId: 0, cibleId: 0, filtre: '', selection: [], classes: {} };

// Liste officielle des réinscrits par classe (avec la classe d'origine et la décision), à signer
export function imprimerListeReinscrits(state) {
  const cible = state.annees.find((a) => a.id === Number(passageView.cibleId));
  const source = state.annees.find((a) => a.id === Number(passageView.sourceId));
  if (!cible) return false;
  const reinscrits = state.inscriptions.filter((i) => i.anneeId === cible.id && i.type === 'reinscription');
  const parClasse = state.classes.filter((c) => c.anneeId === cible.id).map((c) => ({ c, list: reinscrits.filter((i) => i.classeId === c.id) })).filter((g) => g.list.length);
  const ligne = (i, n) => {
    const e = state.eleves.find((x) => x.id === i.eleveId);
    const origine = state.inscriptions.find((x) => x.id === i.origineInscriptionId);
    const decision = i.passage?.decision || origine?.decision?.statut;
    return `<tr><td>${n}</td><td>${escapeHtml(e?.matricule || '')}</td><td>${escapeHtml(e ? `${e.nom} ${e.prenom}` : '—')}</td><td>${escapeHtml(state.classes.find((c) => c.id === origine?.classeId)?.nom || '—')}</td><td>${escapeHtml(DECISIONS[decision] || '—')}</td><td>${escapeHtml(formatDateFr(i.dateInscription))}</td></tr>`;
  };
  const html = `${enteteHtml(state.config)}
    <div class="r-title"><strong>Liste des élèves réinscrits — ${escapeHtml(cible.annee)}</strong><span>Passage depuis ${escapeHtml(source?.annee || '—')} · ${reinscrits.length} élève(s) · édité le ${escapeHtml(formatDateFr(new Date().toISOString().slice(0, 10)))}</span></div>
    ${parClasse.map((g) => `<h3 style="margin:10px 0 4px;font-size:13px">${escapeHtml(g.c.nom)} — ${g.list.length} élève(s)${g.c.capacite ? ` / ${g.c.capacite} places` : ''}</h3>
      <table><thead><tr><th>N°</th><th>Matricule</th><th>Nom et prénom</th><th>Classe d’origine</th><th>Décision</th><th>Date</th></tr></thead>
      <tbody>${g.list.sort((a, b) => String(state.eleves.find((x) => x.id === a.eleveId)?.nom).localeCompare(String(state.eleves.find((x) => x.id === b.eleveId)?.nom), 'fr')).map((i, k) => ligne(i, k + 1)).join('')}</tbody></table>`).join('') || '<p>Aucune réinscription.</p>'}
    <div style="display:flex;justify-content:space-between;margin:16mm 20mm 0"><b style="border-top:1px solid #111;padding-top:4px;width:60mm;text-align:center">Le Secrétariat</b><b style="border-top:1px solid #111;padding-top:4px;width:60mm;text-align:center">Le Directeur</b></div>`;
  return printDocument({ title: `Réinscrits ${cible.annee}`, html, fileName: `Reinscrits-${cible.annee}` });
}

function passagePanel(state) {
  // Destination par défaut : l'année active, ou l'année qui la suit si l'active n'a pas d'année précédente
  // (cas courant en fin d'année : on prépare la rentrée suivante depuis l'année en cours)
  const suivante = state.annees.find((a) => anneePrecedente(state, a.id)?.id === state.anneeActiveId);
  const cibleId = Number(passageView.cibleId) || (anneePrecedente(state, state.anneeActiveId) ? state.anneeActiveId : suivante?.id || state.anneeActiveId);
  const precedente = anneePrecedente(state, cibleId);
  const sourceId = Number(passageView.sourceId) && Number(passageView.sourceId) !== cibleId ? Number(passageView.sourceId) : precedente?.id || 0;
  passageView.cibleId = cibleId;
  passageView.sourceId = sourceId;
  const selecteurs = `<label>Élèves de l’année <select data-passage="sourceId">${sourceId ? '' : '<option value="">—</option>'}${state.annees.filter((a) => a.id !== cibleId).map((a) => `<option value="${a.id}" ${a.id === sourceId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
      <label>Inscrire en <select data-passage="cibleId">${state.annees.map((a) => `<option value="${a.id}" ${a.id === cibleId ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>`;
  if (!sourceId) {
    return `<div class="panel" id="passage-panel"><div class="panel-header"><h3>Passage et réinscriptions</h3></div>
      <div class="advanced-search">${selecteurs}</div>
      <p class="meta">Aucune année précédant l’année de destination : créez la nouvelle année scolaire (Scolarité › Années scolaires) puis choisissez-la ici pour y réinscrire les élèves admis.</p></div>`;
  }
  const tous = candidatsPassage(state, sourceId, cibleId, passageView.classes || {});
  const classesSource = [...new Set(tous.map((c) => c.classe?.nom).filter(Boolean))];
  const lignes = tous.filter((c) => !passageView.filtre || c.classe?.nom === passageView.filtre);
  const selection = new Set((passageView.selection || []).map(Number).filter((id) => tous.some((c) => c.inscription.id === id && !c.deja)));
  passageView.selection = [...selection];
  const choisis = tous.filter((c) => selection.has(c.inscription.id) && c.inscriptible);
  const classesCible = state.classes.filter((c) => c.anneeId === cibleId && c.active !== false);
  const anneeCible = state.annees.find((a) => a.id === cibleId);
  const anneeSource = state.annees.find((a) => a.id === sourceId);
  const compte = (k) => tous.filter((c) => c.decision === k).length;
  const aSaisir = tous.filter((c) => !c.decision && !c.deja).length;
  const prets = tous.filter((c) => c.inscriptible).length;
  const sansTarif = classesCible.filter((c) => !state.tarifs.some((t) => t.classeId === c.id && t.anneeId === cibleId));
  const recap = choisis.length ? recapReinscription(state, sourceId, cibleId, choisis) : null;
  // Étapes de la procédure, avec leur état
  const etapes = [
    { t: 'Années', d: `${escapeHtml(anneeSource?.annee || '')} → ${escapeHtml(anneeCible?.annee || '')}`, ok: classesCible.length > 0 },
    { t: 'Décisions du conseil', d: aSaisir ? `${aSaisir} à saisir` : 'toutes saisies', ok: !aSaisir && tous.length > 0 },
    { t: 'Classes de destination', d: `${prets} élève(s) prêt(s)`, ok: prets > 0 },
    { t: 'Validation', d: choisis.length ? `${choisis.length} sélectionné(s)` : 'cochez les élèves', ok: !aSaisir && tous.some((c) => c.deja && c.decision) && !tous.some((c) => !c.deja && ['admis', 'redouble'].includes(c.decision)) }
  ];
  const etat = (c) => {
    if (c.deja) return `<span class="badge neutral">Réinscrit(e) en ${escapeHtml(state.classes.find((k) => k.id === c.deja.classeId)?.nom || '—')}</span>`;
    if (c.inscriptible) return `<span class="badge ok">Prêt${c.manuelle ? ' (classe choisie)' : ''}</span>`;
    return `<span class="badge ${['non_admis', 'depart'].includes(c.decision) ? 'neutral' : 'warning'}">${escapeHtml(c.raison)}</span>`;
  };
  return `<div class="panel" id="passage-panel">
    <div class="panel-header"><div><span class="eyebrow">Procédure de fin d’année</span><h3>Passage en classe supérieure et réinscriptions</h3></div><span class="meta">${tous.length} élève(s) de ${escapeHtml(anneeSource?.annee || '')}</span></div>
    <ol class="passage-steps">${etapes.map((e, i) => `<li class="${e.ok ? 'done' : ''}"><span>${e.ok ? '✓' : i + 1}</span><div><b>${e.t}</b><small>${e.d}</small></div></li>`).join('')}</ol>

    <div class="passage-block"><h4>1. Années et contrôles préalables</h4>
      <div class="advanced-search">${selecteurs}</div>
      ${!classesCible.length ? `<p class="form-warning">Aucune classe en ${escapeHtml(anneeCible?.annee || '')} : reconduisez d’abord les classes (Scolarité › Années scolaires › « Reconduire… »). <button type="button" class="link-btn" data-nav="annees">Ouvrir</button></p>` : ''}
      ${sansTarif.length ? `<p class="form-warning">${sansTarif.length} classe(s) sans frais en ${escapeHtml(anneeCible?.annee || '')} (${escapeHtml(sansTarif.map((c) => c.nom).join(', '))}) : l’échéancier des élèves réinscrits y sera créé dès que les frais seront fixés. <button type="button" class="link-btn" data-nav="tarifs">Fixer les frais</button></p>` : ''}
      ${anneeCible && !Number(anneeCible.fraisReinscription) ? `<p class="meta">Aucun frais de réinscription défini pour ${escapeHtml(anneeCible.annee)} (Scolarité › Années scolaires › Modifier).</p>` : ''}
    </div>

    <div class="passage-block"><h4>2. Décisions du conseil de classe</h4>
      <div class="advanced-search">
        <label>Classe d’origine <select data-passage="filtre"><option value="">Toutes</option>${classesSource.map((n) => `<option value="${escapeHtml(n)}" ${n === passageView.filtre ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></label>
        <label>Décision pour les élèves cochés <select data-passage-lot><option value="admis">${DECISIONS.admis}</option><option value="redouble">${DECISIONS.redouble}</option><option value="non_admis">${DECISIONS.non_admis}</option><option value="depart">${DECISIONS.depart}</option></select></label>
        <div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="passage:decision-lot">Appliquer aux élèves cochés</button></div>
      </div>
      <p class="meta">${compte('admis')} admis · ${compte('redouble')} redoublant(s) · ${compte('non_admis')} non admis · ${compte('depart')} départ(s) · <b>${aSaisir} décision(s) à saisir</b> · ${tous.filter((c) => c.deja).length} déjà réinscrit(s)</p>
    </div>

    <div class="passage-block"><h4>3. Classes de destination</h4>
      <p class="meta">Proposition automatique : admis → classe du niveau supérieur (même section si elle existe, sinon la moins remplie) ; redoublant → classe du même niveau. Vous pouvez choisir une autre classe pour chaque élève.</p>
      <div class="table-wrap"><table class="data-list" data-list="passage" data-list-title="Passage et réinscriptions">
        <thead><tr><th data-noexport><input type="checkbox" data-passage-all aria-label="Tout sélectionner" /></th><th>Élève</th><th>Matricule</th><th>Classe ${escapeHtml(anneeSource?.annee || '')}</th><th>Décision</th><th>Classe ${escapeHtml(anneeCible?.annee || '')}</th><th>État</th></tr></thead>
        <tbody>${lignes.map((c) => {
          const id = c.inscription.id;
          const autorise = ['admis', 'redouble'].includes(c.decision) && !c.deja;
          return `<tr data-passage-row="${id}">
            <td>${c.deja ? '' : `<input type="checkbox" data-passage-check="${id}" ${selection.has(id) ? 'checked' : ''} aria-label="Sélectionner" />`}</td>
            <td>${escapeHtml(c.eleve ? `${c.eleve.prenom} ${c.eleve.nom}` : '—')}</td><td>${escapeHtml(c.eleve?.matricule || '—')}</td>
            <td>${escapeHtml(c.classe?.nom || '—')}${c.niveau ? '' : ' <small class="meta">(niveau ?)</small>'}</td>
            <td>${c.deja ? escapeHtml(DECISIONS[c.decision] || '—') : `<select data-decision="${id}" aria-label="Décision"><option value="">— À saisir —</option>${Object.entries(DECISIONS).map(([k, l]) => `<option value="${k}" ${k === c.decision ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
            <td>${autorise ? `<select data-passage-classe="${id}" aria-label="Classe de destination"><option value="">— Choisir —</option>${classesCible.map((k) => `<option value="${k.id}" ${k.id === c.proposee?.id ? 'selected' : ''}>${escapeHtml(k.nom)}${k.id === c.auto?.id ? ' (proposée)' : ''}</option>`).join('')}</select>` : '—'}</td>
            <td>${etat(c)}</td></tr>`;
        }).join('') || '<tr><td colspan="7">Aucun élève inscrit dans l’année choisie.</td></tr>'}</tbody></table></div>
    </div>

    <div class="passage-block"><h4>4. Validation</h4>
      ${recap ? `<div class="table-wrap"><table><thead><tr><th>Classe ${escapeHtml(anneeCible?.annee || '')}</th><th class="num">Élèves</th><th class="num">Places restantes</th><th>Contrôle</th></tr></thead>
        <tbody>${recap.lignes.map((l) => `<tr><td>${escapeHtml(l.classe.nom)}</td><td class="num">${l.eleves.length}</td><td class="num">${Number.isFinite(l.places) ? l.places : '—'}</td><td>${l.depassement ? '<span class="badge warning">Capacité dépassée</span>' : '<span class="badge ok">OK</span>'}${l.sansTarif ? ' <span class="badge warning">Frais à fixer</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="meta">${recap.admis} admis · ${recap.redoublants} redoublant(s) · frais de réinscription : ${formatMoney(recap.frais)} × ${choisis.length} = <b>${formatMoney(recap.total)} ${escapeHtml(state.config.devise)}</b>${recap.avecDette.length ? ` · <b>${recap.avecDette.length} élève(s) avec un solde impayé en ${escapeHtml(anneeSource?.annee || '')}</b> (à reporter dans Paiements › Dettes antérieures)` : ''}</p>` : '<p class="meta">Cochez les élèves prêts à réinscrire (tête de colonne pour tout cocher) : un récapitulatif par classe s’affiche ici avant la validation.</p>'}
      <div class="form-actions">
        <button type="button" class="primary-btn" data-action="passage:inscrire" ${choisis.length ? '' : 'disabled'}>${choisis.length ? `Inscrire les ${choisis.length} élève(s) en ${escapeHtml(anneeCible?.annee || '')}` : 'Cochez les élèves prêts à réinscrire'}</button>
        ${tous.some((c) => c.deja) ? `<button type="button" class="secondary-btn" data-action="passage:liste">Imprimer la liste des réinscrits</button>` : ''}
      </div>
      <p class="meta">Chaque réinscription crée l’inscription de la nouvelle année (type « réinscription »), les frais de réinscription et l’échéancier selon les frais de la classe. La modalité de règlement se choisit au premier paiement. Les dettes restent rattachées à leur année d’origine.</p>
    </div>
  </div>`;
}


// Classe dont le programme est affiché dans Scolarité › Classes (mémorisé avec l'interface)
export const programmeView = { classeId: 0 };

// Programme pédagogique d'une classe : matières, coefficients, volume horaire hebdomadaire
function programmePanel(state, classes) {
  const classe = classes.find((c) => c.id === Number(programmeView.classeId)) || classes[0] || null;
  if (!classe) return '';
  programmeView.classeId = classe.id;
  const lignes = new Map(programmeDeClasse(state, classe.id).map((p) => [p.matiereId, p]));
  const autres = classes.filter((c) => c.id !== classe.id && programmeDeClasse(state, c.id).length);
  return `<div class="panel" id="programme-panel">
      <div class="panel-header"><h3>Programme et coefficients</h3><span class="meta">Matières enseignées par classe : elles seules sont proposées dans les affectations des enseignants</span></div>
      <div class="advanced-search">
        <label>Classe <select data-prog-classe>${classes.map((c) => `<option value="${c.id}" ${c.id === classe.id ? 'selected' : ''}>${escapeHtml(c.nom)} (${escapeHtml(c.categorie)}) — ${programmeDeClasse(state, c.id).length} matière(s)</option>`).join('')}</select></label>
        ${autres.length ? `<label>Copier le programme de <select data-prog-source><option value="">— Choisir —</option>${autres.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')}</select></label>
        <div class="form-actions"><button type="button" class="secondary-btn small-btn" data-action="programme:copier:${classe.id}">Copier</button></div>` : ''}
      </div>
      <form data-form="programme" data-classe="${classe.id}" autocomplete="off">
        <div class="table-wrap"><table><thead><tr><th>Au programme</th><th>Matière</th><th>Coefficient</th><th>Heures / semaine</th></tr></thead>
          <tbody>${state.matieres.filter((m) => m.actif || lignes.has(m.id)).map((m) => {
            const l = lignes.get(m.id);
            return `<tr><td><input type="checkbox" name="matiere" value="${m.id}" ${l ? 'checked' : ''} aria-label="${escapeHtml(m.nom)} au programme" /></td><td>${escapeHtml(m.nom)}</td>
              <td><input class="cell-input" type="number" name="coef-${m.id}" min="0.5" max="20" step="0.5" value="${l ? l.coefficient : 1}" /></td>
              <td><input class="cell-input" type="number" name="heures-${m.id}" min="0" max="40" step="0.5" value="${l && l.heuresHebdo ? l.heuresHebdo : ''}" placeholder="—" /></td></tr>`;
          }).join('')}</tbody></table></div>
        <div class="form-actions"><button type="submit" class="primary-btn">Enregistrer le programme de ${escapeHtml(classe.nom)}</button></div>
      </form>
    </div>`;
}

// Référentiel des matières (commun à toutes les classes) : ajout et désactivation, utilisé par le programme
function matieresPanel(state) {
  const usage = (id) => (state.programmes || []).filter((p) => p.matiereId === id && state.classes.some((c) => c.id === p.classeId && c.anneeId === state.anneeActiveId)).length;
  return `<div class="panel" id="matieres-panel">
      <div class="panel-header"><h3>Matières</h3><span class="meta">${state.matieres.filter((m) => m.actif).length} matière(s) active(s) · référentiel commun à toutes les classes</span></div>
      <div class="chip-list">${state.matieres.map((m) => `<span class="type-chip ${m.actif ? '' : 'inactive'}">${escapeHtml(m.nom)} <small>${usage(m.id)} classe(s)</small>${can('write') ? ` <button type="button" class="link-btn" data-action="matiere:toggle:${m.id}">${m.actif ? 'désactiver' : 'réactiver'}</button>` : ''}</span>`).join('') || '<span class="meta">Aucune matière.</span>'}</div>
      ${can('write') ? `<form class="form-grid compact" data-form="matiere" autocomplete="off"><label>Nouvelle matière <input name="nom" type="text" required placeholder="Ex : Arabe, Économie…" /></label><div class="form-actions"><button type="submit" class="secondary-btn">Ajouter la matière</button></div></form>` : ''}
      <p class="meta">Étape suivante : cochez, dans « Programme et coefficients » ci-dessous, les matières enseignées dans chaque classe. Seules ces matières sont proposées lors des affectations des enseignants. Une matière désactivée reste dans l’historique.</p>
    </div>`;
}

const className = (state, id) => state.classes.find((c) => c.id === Number(id))?.nom || '—';
const eleveLabel = (e) => `${e.matricule} — ${e.prenom} ${e.nom}`;
const activeYearName = (state) => yearLabel(state, state.anneeActiveId);

// Sélecteur « année » d'une liste : l'année active est choisie par défaut
function yearFilter(state, attr, { extra = '' } = {}) {
  return `<label>Année scolaire
    <select ${attr}>${state.annees.map((a) => `<option value="${a.id}" ${a.id === state.anneeActiveId ? 'selected' : ''}>${escapeHtml(a.annee)}${a.id === state.anneeActiveId ? ' (active)' : ''}</option>`).join('')}${extra}<option value="all">Toutes les années</option></select>
  </label>`;
}

// Bandeau rappelant l'année des données affichées et le nombre d'éléments des autres années
function yearNote(state, hidden, what) {
  return `<p class="year-note">Données de l’année <b>${escapeHtml(activeYearName(state))}</b> (année active)${hidden ? ` · ${hidden} ${what} d’autres années masqué(e)s : changez l’année active dans l’en-tête pour les afficher` : ''}.</p>`;
}

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
        <label data-licence-champ>Clé de licence (nouvelle année) <input name="cleLicence" type="text" maxlength="60" placeholder="GSS-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" /></label>
        <label>Date de rentrée <input name="dateDebut" type="date" /></label>
        <label>Date de fin <input name="dateFin" type="date" /></label>
        <label>Solde d’ouverture de caisse <input name="soldeInitial" type="number" min="0" step="1" value="0" /></label>
        <label>Frais d’inscription (nouvel élève) <input name="fraisInscription" type="number" min="0" step="1" value="0" /></label>
        <label>Frais de réinscription <input name="fraisReinscription" type="number" min="0" step="1" value="0" /></label>
        <label>Statut
          <select name="statut"><option value="preparation">Préparation</option><option value="ouverte">Ouverte</option><option value="cloturee">Clôturée</option></select>
        </label>
        ${state.annees.length ? `<fieldset class="span-all reconduction-box" data-reconduction>
          <legend>Reconduire les paramètres d’une année précédente</legend>
          <label>Depuis l’année <select name="reconduireDepuis"><option value="">Ne rien reconduire</option>${[...state.annees].sort((a, b) => `${b.dateDebut}|${b.annee}`.localeCompare(`${a.dateDebut}|${a.annee}`)).map((a, i) => `<option value="${a.id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(a.annee)}</option>`).join('')}</select></label>
          <div class="check-grid">${OPTIONS_RECONDUCTION.map(([k, l]) => `<label class="check-chip on"><input type="checkbox" name="reconduire_${k}" ${k === 'affectations' ? '' : 'checked'} /> ${l}</label>`).join('')}</div>
          <p class="meta">Seules les données de référence sont copiées. Les inscriptions, paiements, dépenses, dettes, paies et notes restent propres à chaque année ; l’année source n’est jamais modifiée. Ignoré lors d’une modification d’année.</p>
        </fieldset>` : ''}
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
            <p class="meta">${state.classes.filter((c) => c.anneeId === a.id).length} classe(s) · ${state.tarifs.filter((t) => t.anneeId === a.id).length} tarif(s)</p>
            ${actions(btn(`annee:view:${a.id}`, 'Consulter'), btn(`annee:edit:${a.id}`, 'Modifier'), btn(`annee:reconduire:${a.id}`, 'Reconduire…'), btn(`annee:open:${a.id}`, 'Valider (ouvrir)'), btn(`annee:close:${a.id}`, 'Clôturer'), btn(`annee:active:${a.id}`, 'Définir active'), btn(`annee:delete:${a.id}`, 'Supprimer', 'delete'))}
          </div>`).join('')}
      </div>
    </div>`;
}

export function renderClasses(state) {
  const section = document.getElementById('classes');
  const classes = state.classes.filter((c) => c.anneeId === state.anneeActiveId);
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
        <p class="meta span-all">Le niveau est reconnu dans le nom (CP1, CE2, CM2, 7e, 10e, 11e SM, Terminale SE, ou 6e, 3e, 2nde, 1ère…) : il sert au passage automatique des élèves admis vers la classe du niveau supérieur.</p>
        ${formButtons('Ajouter')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Liste des classes — ${escapeHtml(activeYearName(state))}</h3><span class="meta" data-class-count>${classes.length} classe(s)</span></div>
      ${yearNote(state, state.classes.length - classes.length, 'classe(s)')}
      <div class="report-tabs" role="tablist">
        <button type="button" class="tab-btn active" data-class-filter="">Toutes</button>
        ${CATEGORIES.map((c) => `<button type="button" class="tab-btn" data-class-filter="${c}">${c}</button>`).join('')}
      </div>
      <div class="cards-grid">
        ${classes.map((c) => `
          <div class="detail-card" data-class-card data-cat="${escapeHtml(c.categorie)}">
            <h4>${escapeHtml(c.nom)} ${c.active ? '' : '<span class="badge danger">inactive</span>'}</h4>
            <p class="meta">${escapeHtml(c.categorie)}</p>
            <p class="meta">Année : ${escapeHtml(yearLabel(state, c.anneeId))} · ${state.inscriptions.filter((i) => i.classeId === c.id).length}/${c.capacite} élève(s)</p>
            <p class="meta">Programme : ${programmeDeClasse(state, c.id).length} matière(s) · ${niveauScolaire(c.nom) ? `niveau ${escapeHtml(niveauScolaire(c.nom).libelle)}` : '<span class="badge warning" title="Renommez la classe (ex. CM2 A, 7e B, 11e SM) pour le passage automatique">niveau non reconnu</span>'}</p>
            ${actions(btn(`classe:view:${c.id}`, 'Consulter'), btn(`classe:edit:${c.id}`, 'Modifier'), btn(`classe:toggle:${c.id}`, c.active ? 'Désactiver' : 'Activer'), btn(`classe:delete:${c.id}`, 'Supprimer', 'delete'))}
          </div>`).join('') || '<p class="meta">Aucune classe pour cette année : ajoutez-en avec le formulaire ci-dessus.</p>'}
      </div>
    </div>
    ${matieresPanel(state)}
    ${programmePanel(state, classes)}`;
}

export function renderEleves(state) {
  const section = document.getElementById('eleves');
  // Années d'inscription de chaque élève ; un élève jamais inscrit apparaît dans l'année active (inscription à faire)
  const anneesEleve = new Map();
  state.inscriptions.forEach((i) => { if (!anneesEleve.has(i.eleveId)) anneesEleve.set(i.eleveId, []); anneesEleve.get(i.eleveId).push(i); });
  const yearsOf = (e) => { const list = anneesEleve.get(e.id) || []; return list.length ? [...new Set(list.map((i) => i.anneeId))].join(' ') : `${state.anneeActiveId} none`; };
  const classeActive = (e) => (anneesEleve.get(e.id) || []).find((i) => i.anneeId === state.anneeActiveId)?.classeId || e.classeId;
  const duAnnee = state.eleves.filter((e) => yearsOf(e).split(' ').includes(String(state.anneeActiveId))).length;
  section.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">Dossiers élèves</span><h2>Recherche et suivi des élèves</h2></div>
      <span class="meta">${duAnnee} élève(s) en ${escapeHtml(activeYearName(state))} · ${state.eleves.length} dossier(s) au total</span>
    </div>
    <div class="panel advanced-search">
      <label>Recherche avancée <input type="search" data-student-search placeholder="Matricule, nom, parent, téléphone, e-mail…" /></label>
      <label>Classe
        <select data-student-class><option value="">Toutes les classes</option>${state.classes.filter((c) => c.anneeId === state.anneeActiveId).map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')}</select>
      </label>
      ${yearFilter(state, 'data-student-year', { extra: '<option value="none">Jamais inscrits</option>' })}
      <label>Statut
        <select data-student-status><option value="">Tous</option><option value="actif">Actif</option><option value="inactif">Inactif</option></select>
      </label>
      <span class="search-count" data-student-count>${state.eleves.length} résultat(s)</span>
    </div>
    <div class="panel section-form">
      <div class="panel-header"><h3>Fiche élève</h3><span class="meta">Après l'ajout, vous passez directement à l'inscription</span></div>
      <form class="form-grid" data-form="eleve">
        <label>Matricule <input name="matricule" type="text" placeholder="Généré automatiquement si vide" /></label>
        <label>Prénom <input name="prenom" type="text" required /></label>
        <label>Nom <input name="nom" type="text" required /></label>
        <label>Sexe <select name="sexe"><option value="M">Masculin</option><option value="F">Féminin</option></select></label>
        <label>Date de naissance <input name="dateNaissance" type="date" /></label>
        <label>Téléphone <input name="telephone" type="text" /></label>
        <label>Email <input name="email" type="email" /></label>
        ${categorySelect('eleve-classes')}
        ${classPicker(state, 'eleve-classes', { label: 'Classe souhaitée (tapez pour filtrer)' })}
        <label>Adresse <input name="adresse" type="text" /></label>
        <fieldset class="span-all contact-box"><legend>Parent / tuteur et contact d’urgence</legend>
          <label class="span-two">Famille déjà enregistrée (frère ou sœur) <input type="search" data-contact-search list="contacts-famille" placeholder="Nom ou téléphone du parent : ses informations sont reprises" autocomplete="off" />
            <datalist id="contacts-famille">${(state.contacts || []).map((c) => `<option value="${escapeHtml(`${nomContact(c)} — ${c.telephone || 'sans téléphone'}`)}">${enfantsDuContact(state, c.id).length} enfant(s)</option>`).join('')}</datalist></label>
          <input type="hidden" name="contactId" />
          <label>Nom du parent / tuteur <input name="parentNom" type="text" /></label>
          <label>Prénom <input name="parentPrenom" type="text" /></label>
          <label>Lien avec l’élève <select name="parentLien">${Object.entries(LIENS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Téléphone principal <input name="parentTel" type="tel" /></label>
          <label>Téléphone secondaire (facultatif) <input name="parentTel2" type="tel" /></label>
          <label>Adresse du parent <input name="parentAdresse" type="text" /></label>
          <label>Contact d’urgence — nom <input name="urgenceNom" type="text" placeholder="Si différent du parent" /></label>
          <label>Contact d’urgence — téléphone <input name="urgenceTelephone" type="tel" /></label>
        </fieldset>
        ${formButtons('Ajouter et inscrire')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Répertoire des élèves</h3><button class="secondary-btn small-btn" data-action="report:students-csv">Exporter la liste</button></div>
      <div class="table-wrap"><table class="data-list" data-list="eleves" data-list-title="Répertoire des élèves" data-list-add="#eleves form[data-form=eleve]">
        <thead><tr><th>Matricule</th><th>Nom</th><th>Classe</th><th>Parent / tuteur</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${state.eleves.map((e) => `
          <tr data-student-row data-class="${classeActive(e) || ''}" data-years="${yearsOf(e)}" data-status="${e.actif ? 'actif' : 'inactif'}"
            data-search="${escapeHtml([e.matricule, e.prenom, e.nom, e.parent, e.telephone, telephoneFamille(state, e), e.email, className(state, classeActive(e))].join(' ').toLowerCase())}">
            <td>${escapeHtml(e.matricule)}</td><td>${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</td><td>${escapeHtml(className(state, classeActive(e)))}</td>
            <td>${escapeHtml(e.parent || '—')}<div class="meta">${escapeHtml(telephoneFamille(state, e) || e.email || '')}</div></td>
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
          <input name="eleveText" list="insc-eleves" type="search" placeholder="Nom, prénom ou matricule" autocomplete="off" required />
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
    ${can('write') ? passagePanel(state) : ''}
    <div class="panel">
      <div class="panel-header"><h3>Inscriptions</h3><span class="meta" data-insc-count></span></div>
      <div class="advanced-search">${yearFilter(state, 'data-insc-year')}</div>
      <div class="table-wrap"><table class="data-list" data-list="inscriptions" data-list-title="Historique des inscriptions" data-list-add="#inscriptions form[data-form=inscription]">
        <thead><tr><th>Élève</th><th>Année</th><th>Classe</th><th>Type</th><th>Statut</th><th>Validation</th><th>Échéances</th><th>Actions</th></tr></thead>
        <tbody>${state.inscriptions.map((i) => {
          const s = studentOf(state, i);
          return `<tr data-insc-row data-years="${i.anneeId}">
            <td>${escapeHtml(s ? `${s.prenom} ${s.nom}` : '—')}</td><td>${escapeHtml(yearLabel(state, i.anneeId))}</td><td>${escapeHtml(className(state, i.classeId))}</td>
            <td>${escapeHtml(i.type)}</td><td>${escapeHtml(i.statut)}</td>
            <td><span class="badge ${i.validee ? 'ok' : 'warning'}">${i.validee ? `Validée le ${escapeHtml(formatDateFr(i.dateValidation))}` : 'En attente'}</span></td>
            <td>${(i.echeances || []).length}</td>
            <td>${btn(`eleve:profile:${i.eleveId}`, 'Consulter')}${i.validee ? '' : btn(`inscription:validate:${i.id}`, 'Valider')}${btn(`inscription:reduction:${i.id}`, i.reduction ? 'Réduction ✓' : 'Réduction')}${btn(`inscription:reinscrire:${i.id}`, 'Réinscrire')}${btn(`inscription:delete:${i.id}`, 'Supprimer', 'delete')}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="8">Aucune inscription.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

export function renderTarifs(state) {
  const section = document.getElementById('tarifs');
  const tarifs = state.tarifs.filter((t) => t.anneeId === state.anneeActiveId);
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
        <p class="meta span-all form-section-title">Frais complémentaires et réductions</p>
        <label>Frais d’inscription de la classe <input name="fraisInscription" type="number" min="0" step="1" placeholder="Vide : frais de l’année" /></label>
        <label>Frais de réinscription de la classe <input name="fraisReinscription" type="number" min="0" step="1" placeholder="Vide : frais de l’année" /></label>
        <label>Remise maximale autorisée (%) <input name="remiseMaxPct" type="number" min="0" max="100" step="0.5" value="0" /></label>
        <label class="span-two">Frais annexes obligatoires (une ligne « Libellé = montant »)
          <textarea name="fraisAnnexes" rows="3" placeholder="Tenue = 50000&#10;Fournitures = 30000"></textarea></label>
        <p class="meta span-all" data-tarif-info aria-live="polite">Saisissez le montant annuel : les tranches et le montant mensuel sont proposés automatiquement.</p>
        <p class="meta span-all">Une modification n’est jamais rétroactive pour un élève qui a déjà payé ; chaque version du tarif est conservée dans son historique.</p>
        ${formButtons('Ajouter')}
      </form>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>Tarifs configurés — ${escapeHtml(activeYearName(state))}</h3><span class="meta">${tarifs.length} tarif(s)</span>${state.tarifs.some((t) => t.anneeId !== state.anneeActiveId) && state.anneeActiveId ? '<button type="button" class="secondary-btn small-btn" data-action="tarif:reprendre">Reprendre les tarifs d’une année précédente</button>' : ''}</div>
      ${!tarifs.length ? '<p class="meta empty-inline">Aucun tarif pour cette année : saisissez les frais de chaque classe ci-dessus.</p>' : ''}
      ${yearNote(state, state.tarifs.length - tarifs.length, 'tarif(s)')}
      <div class="cards-grid">
        ${tarifs.map((t) => `
          <div class="detail-card">
            <h4>${escapeHtml(className(state, t.classeId))}</h4>
            <p class="meta">Année : ${escapeHtml(yearLabel(state, t.anneeId))}</p>
            <p class="meta">Total : ${formatMoney(t.montantAnnuel)} ${escapeHtml(state.config.devise)} · ${(t.tranches || []).length} tranches</p>
            <p class="meta">${Number(t.montantMensuel) > 0 ? `Mensuel : ${texteMensuel(state, t, formatMoney)} ${escapeHtml(state.config.devise)}` : 'Paiement mensuel non proposé'}</p>
            ${t.fraisInscription !== null && t.fraisInscription !== undefined ? `<p class="meta">Inscription : ${formatMoney(t.fraisInscription)}${t.fraisReinscription !== null && t.fraisReinscription !== undefined ? ` · réinscription : ${formatMoney(t.fraisReinscription)}` : ''}</p>` : ''}
            ${(t.fraisAnnexes || []).length ? `<p class="meta">Annexes : ${t.fraisAnnexes.map((a) => `${escapeHtml(a.libelle)} ${formatMoney(a.montant)}`).join(' · ')}</p>` : ''}
            <p class="meta">Remise maximale : ${Number(t.remiseMaxPct || 0)} %${(t.historique || []).length ? ` · ${t.historique.length} version(s) antérieure(s)` : ''}</p>
            ${actions(btn(`tarif:view:${t.id}`, 'Consulter'), btn(`tarif:edit:${t.id}`, 'Modifier'), btn(`tarif:delete:${t.id}`, 'Supprimer', 'delete'))}
          </div>`).join('')}
      </div>
    </div>`;
}
