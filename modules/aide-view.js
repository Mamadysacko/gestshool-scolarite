import { escapeHtml } from './utils.js';
import { HELP_CATEGORIES, HELP_TOPICS, FAQ_IDS, SUGGESTED_QUESTIONS } from './aide-data.js';
import { searchHelp, topicById, accessStatus } from './aide.js';
import { currentUser, allowedPages, ROLES } from './auth.js';
import { pageLabel } from './navigation.js';

// Centre d'aide : recherche, catégories, fiches détaillées et accès direct aux fonctionnalités autorisées.
const view = { query: '', categorie: '', page: '', topicId: '', active: -1 };
const RECENT_KEY = 'ibk_aide_recent_v1';
let ctx = { state: null, goTo: () => {} };

const role = () => currentUser()?.role || '';
const categoryOf = (id) => HELP_CATEGORIES.find((c) => c.id === id);

// Recherches récentes : simple confort, par utilisateur, dans ce navigateur
function recentKey() { return `${RECENT_KEY}:${currentUser()?.id || 0}`; }
function readRecent() {
  try { const list = JSON.parse(localStorage.getItem(recentKey()) || '[]'); return Array.isArray(list) ? list : []; } catch (error) { return []; }
}
function rememberSearch(text) {
  const q = String(text || '').trim();
  if (q.length < 3) return;
  try { localStorage.setItem(recentKey(), JSON.stringify([q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch (error) { /* non bloquant */ }
}

function pathHtml(topic) {
  return `<ol class="aide-path" aria-label="Chemin d’accès">${topic.chemin.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
}

function rolesHtml(topic) {
  return topic.roles.map((r) => `<span class="badge ${r === role() ? 'ok' : 'neutral'}">${escapeHtml(ROLES[r])}</span>`).join(' ');
}

function resultItem(topic) {
  const cat = categoryOf(topic.categorie);
  const allowed = topic.roles.includes(role());
  return `<li><button type="button" class="aide-result" data-aide-open="${topic.id}">
      <span class="aide-result-icon" aria-hidden="true">${cat.icon}</span>
      <span class="aide-result-body"><strong>${escapeHtml(topic.titre)}</strong>
        <span class="aide-result-desc">${escapeHtml(topic.description)}</span>
        <span class="aide-result-path">${escapeHtml(topic.chemin.join(' › '))}${allowed ? '' : ' · <em>non accessible avec votre rôle</em>'}</span></span>
    </button></li>`;
}

function unavailableHtml(list) {
  return list.map((u) => {
    const alt = u.alternative ? topicById(u.alternative) : null;
    return `<div class="aide-notice" role="status">
      <strong>« ${escapeHtml(u.label)} » n’existe pas dans cette application.</strong>
      <p>Elle gère la scolarité (années, classes, frais, élèves, inscriptions) et la comptabilité (paiements, dépenses, trésorerie, rapports). Aucun module de ${escapeHtml(u.label.toLowerCase())} n’est disponible, il n’y a donc pas de prérequis à préparer.</p>
      ${alt ? `<button type="button" class="secondary-btn small-btn" data-aide-open="${alt.id}">Voir plutôt : ${escapeHtml(alt.titre)}</button>` : ''}
    </div>`;
  }).join('');
}

function homeHtml() {
  const faq = FAQ_IDS.map(topicById);
  return `<div class="aide-cats">${HELP_CATEGORIES.map((c) => {
      const count = HELP_TOPICS.filter((t) => t.categorie === c.id).length;
      return `<button type="button" class="aide-cat" data-aide-cat="${c.id}"><span class="aide-cat-icon" aria-hidden="true">${c.icon}</span><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.description)}</span><small>${count} fiche${count > 1 ? 's' : ''}</small></button>`;
    }).join('')}</div>
    <div class="panel"><div class="panel-header"><h3>Questions fréquentes</h3></div><ul class="aide-results">${faq.map(resultItem).join('')}</ul></div>`;
}

function listHtml(title, topics, backLabel) {
  return `<div class="panel">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><button type="button" class="secondary-btn small-btn" data-aide-back>← ${escapeHtml(backLabel)}</button></div>
      <ul class="aide-results">${topics.map(resultItem).join('')}</ul></div>`;
}

function resultsHtml() {
  const { results, unavailable } = searchHelp(view.query, { categorie: view.categorie });
  const head = `<p class="meta aide-count" aria-live="polite">${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${escapeHtml(view.query)} »</p>`;
  if (!results.length) {
    return `${head}${unavailableHtml(unavailable)}
      ${unavailable.length ? '' : `<div class="aide-empty"><strong>Aucune fonctionnalité ne correspond à votre recherche.</strong>
        <p>Essayez un mot plus simple (paiement, inscription, dépense, classe, rapport…) ou parcourez les catégories.</p></div>`}
      <div class="aide-chips">${SUGGESTED_QUESTIONS.slice(4).map((q) => `<button type="button" class="aide-chip" data-aide-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
        <button type="button" class="secondary-btn small-btn" data-aide-q="">Parcourir toutes les catégories</button></div>`;
  }
  return `${head}${unavailableHtml(unavailable)}<div class="panel"><ul class="aide-results">${results.map((r) => resultItem(r.topic)).join('')}</ul></div>`;
}

function detailHtml(topic) {
  const cat = categoryOf(topic.categorie);
  const status = accessStatus(ctx.state, topic, role(), allowedPages());
  const pageName = pageLabel(topic.page);
  let access;
  if (!topic.page) {
    access = '<p class="meta">Cette fonctionnalité n’a pas de page dédiée : suivez les étapes ci-dessous.</p>';
  } else if (!status.roleOk) {
    access = `<div class="aide-access denied"><strong>Accès non autorisé avec votre rôle (${escapeHtml(ROLES[role()] || '—')}).</strong>
      <p>Cette fonctionnalité est réservée à : ${topic.roles.map((r) => escapeHtml(ROLES[r])).join(', ')}. Demandez à un administrateur de l’effectuer ou de modifier votre rôle.</p></div>`;
  } else {
    access = `<div class="aide-access ${status.missing.length ? 'warning' : 'ready'}">
      ${status.missing.length ? `<strong>Avant de continuer, il manque :</strong><ul>${status.missing.map((p) => `<li>${escapeHtml(p.label)} — ${escapeHtml(p.texte)}${p.aide ? ` <button type="button" class="link-btn" data-aide-open="${p.aide}">Comment faire ?</button>` : ''}</li>`).join('')}</ul>` : '<strong>Tout est prêt : vous pouvez utiliser cette fonctionnalité.</strong>'}
      <button type="button" class="primary-btn" data-aide-go="${topic.id}">${status.missing.length ? `Ouvrir « ${escapeHtml(pageName)} » quand même` : 'Accéder à cette fonctionnalité'}</button></div>`;
  }
  const prereqs = status.prereqs;
  const related = HELP_TOPICS.filter((t) => t.categorie === topic.categorie && t.id !== topic.id);
  return `<article class="panel aide-detail" aria-labelledby="aide-title">
      <div class="aide-detail-head">
        <button type="button" class="secondary-btn small-btn" data-aide-back>← Retour</button>
        <span class="badge info">${cat.icon} ${escapeHtml(cat.label)}</span>
      </div>
      <h3 id="aide-title" tabindex="-1">${escapeHtml(topic.titre)}</h3>
      <p class="aide-lead">${escapeHtml(topic.description)}</p>
      ${access}
      <div class="aide-grid">
        <section><h4>Chemin d’accès</h4>${pathHtml(topic)}</section>
        <section><h4>Droits d’accès</h4><p>${rolesHtml(topic)}</p>${topic.autorisation ? `<p class="meta">${escapeHtml(topic.autorisation)}</p>` : ''}</section>
      </div>
      <section><h4>Étapes</h4><ol class="aide-steps">${topic.etapes.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ol></section>
      <section><h4>Prérequis et dépendances</h4>${prereqs.length ? `<ul class="aide-prereqs">${prereqs.map((p) => `<li class="${p.ok ? 'done' : 'todo'}">
          <span class="aide-check" aria-label="${p.ok ? 'rempli' : 'non rempli'}">${p.ok ? '✓' : '✗'}</span>
          <span><span class="badge ${p.obligatoire ? 'danger' : 'neutral'}">${p.obligatoire ? 'Obligatoire' : 'Recommandé'}</span> ${escapeHtml(p.texte)}
          ${p.aide ? `<button type="button" class="link-btn" data-aide-open="${p.aide}">${escapeHtml(topicById(p.aide).titre)}</button>` : ''}</span></li>`).join('')}</ul>
          <p class="meta">✓ / ✗ : état actuel de vos données (année active).</p>` : '<p class="meta">Aucun prérequis.</p>'}</section>
      <section><h4>Résultat attendu</h4><p>${escapeHtml(topic.resultat)}</p></section>
      ${topic.erreurs.length ? `<section><h4>Erreurs fréquentes et solutions</h4><dl class="aide-errors">${topic.erreurs.map((e) => `<dt>${escapeHtml(e.probleme)}</dt><dd>${escapeHtml(e.solution)}</dd>`).join('')}</dl></section>` : ''}
      ${related.length ? `<section><h4>Dans la même catégorie</h4><div class="aide-chips">${related.map((t) => `<button type="button" class="aide-chip" data-aide-open="${t.id}">${escapeHtml(t.titre)}</button>`).join('')}</div></section>` : ''}
    </article>`;
}

export function renderAideOutput() {
  const out = document.getElementById('aide-output');
  if (!out || !ctx.state) return;
  const topic = view.topicId ? topicById(view.topicId) : null;
  if (topic) out.innerHTML = detailHtml(topic);
  else if (view.query.trim()) out.innerHTML = resultsHtml();
  else if (view.page) out.innerHTML = listHtml(`Aide pour la page « ${pageLabel(view.page)} »`, HELP_TOPICS.filter((t) => t.page === view.page), 'Toutes les catégories');
  else if (view.categorie) out.innerHTML = listHtml(categoryOf(view.categorie).label, HELP_TOPICS.filter((t) => t.categorie === view.categorie), 'Toutes les catégories');
  else out.innerHTML = homeHtml();
}

function suggestionsHtml() {
  if (!view.query.trim()) {
    const recent = readRecent();
    if (!recent.length) return '';
    return `<li class="aide-suggest-title">Recherches récentes</li>${recent.map((q, i) => `<li role="option" id="aide-opt-${i}" class="${i === view.active ? 'active' : ''}"><button type="button" data-aide-q="${escapeHtml(q)}">🕘 ${escapeHtml(q)}</button></li>`).join('')}`;
  }
  const { results } = searchHelp(view.query, { limit: 6 });
  return results.map((r, i) => `<li role="option" id="aide-opt-${i}" class="${i === view.active ? 'active' : ''}"><button type="button" data-aide-open="${r.topic.id}">${categoryOf(r.topic.categorie).icon} ${escapeHtml(r.topic.titre)}</button></li>`).join('');
}

function renderSuggestions(open = true) {
  const box = document.querySelector('[data-aide-suggest]');
  const input = document.querySelector('[data-aide="q"]');
  if (!box || !input) return;
  const html = open ? suggestionsHtml() : '';
  box.innerHTML = html;
  box.hidden = !html;
  input.setAttribute('aria-expanded', String(Boolean(html)));
  if (view.active >= 0) input.setAttribute('aria-activedescendant', `aide-opt-${view.active}`);
  else input.removeAttribute('aria-activedescendant');
}

export function renderAide(state) {
  ctx.state = state;
  const section = document.getElementById('aide');
  if (!section) return;
  section.innerHTML = `
    <div class="aide-hero">
      <span class="eyebrow">Aide</span>
      <h2>Centre d’aide</h2>
      <p>Trouvez rapidement une fonctionnalité et découvrez comment l’utiliser.</p>
      <div class="aide-search">
        <span class="aide-search-icon" aria-hidden="true">🔍</span>
        <input type="search" data-aide="q" value="${escapeHtml(view.query)}" placeholder="Ex : Comment enregistrer un paiement ?" aria-label="Rechercher dans l’aide"
          role="combobox" aria-autocomplete="list" aria-controls="aide-suggest" aria-expanded="false" autocomplete="off" />
        <ul class="aide-suggest" id="aide-suggest" role="listbox" data-aide-suggest hidden></ul>
      </div>
      <div class="aide-chips">${SUGGESTED_QUESTIONS.slice(0, 4).map((q) => `<button type="button" class="aide-chip" data-aide-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}</div>
    </div>
    <div id="aide-output"></div>`;
  renderAideOutput();
}

// État conservé à l'actualisation (recherche, catégorie, fiche ouverte) ; revalidé à la restauration
export function getAideView() {
  return { query: view.query, categorie: view.categorie, page: view.page, topicId: view.topicId };
}

export function setAideView(saved) {
  if (!saved || typeof saved !== 'object') return;
  view.query = typeof saved.query === 'string' ? saved.query.slice(0, 200) : '';
  view.categorie = HELP_CATEGORIES.some((c) => c.id === saved.categorie) ? saved.categorie : '';
  view.page = HELP_TOPICS.some((t) => t.page === saved.page) ? saved.page : '';
  view.topicId = topicById(saved.topicId) ? saved.topicId : '';
  view.active = -1;
}

// Aide contextuelle : fiches de la page où se trouvait l'utilisateur
export function openAideForPage(pageId) {
  Object.assign(view, { query: '', categorie: '', topicId: '', active: -1, page: HELP_TOPICS.some((t) => t.page === pageId) ? pageId : '' });
  renderAide(ctx.state);
}

function openTopic(id) {
  Object.assign(view, { topicId: id, active: -1 });
  renderSuggestions(false);
  renderAideOutput();
  document.getElementById('aide-output')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('aide-title')?.focus?.();
}

function setQuery(text) {
  Object.assign(view, { query: text, topicId: '', page: '', active: -1 });
  const input = document.querySelector('[data-aide="q"]');
  if (input && input.value !== text) input.value = text;
  renderAideOutput();
}

// Ouvre la page de la fonctionnalité, en revérifiant les droits (jamais d'accès à une page non autorisée)
function goToTopic(id) {
  const topic = topicById(id);
  if (!topic || !topic.page) return;
  const status = accessStatus(ctx.state, topic, role(), allowedPages());
  if (!status.navigable) { renderAideOutput(); return; }
  ctx.goTo(topic.page);
  if (topic.clic) document.querySelector(topic.clic)?.click();
  const target = topic.focus ? document.querySelector(topic.focus) : null;
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('aide-highlight');
  setTimeout(() => target.classList.remove('aide-highlight'), 2600);
  const field = target.matches('input, select, textarea, button') ? target : target.querySelector('input:not([type=hidden]), select, textarea');
  field?.focus({ preventScroll: true });
}

export function bindAide(state, { goTo }) {
  ctx = { state, goTo };
  document.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('[data-aide="q"]')) return;
    setQuery(event.target.value);
    renderSuggestions(true);
  });
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && event.target.matches('[data-aide="q"]')) renderSuggestions(true);
  });
  document.addEventListener('keydown', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLElement) || !input.matches('[data-aide="q"]')) return;
    const options = [...document.querySelectorAll('[data-aide-suggest] [role="option"] button')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      view.active = (view.active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      renderSuggestions(true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      rememberSearch(view.query);
      if (view.active >= 0 && options[view.active]) { options[view.active].click(); return; }
      const first = searchHelp(view.query).results[0];
      renderSuggestions(false);
      if (first && view.query.trim()) openTopic(first.topic.id);
    } else if (event.key === 'Escape') {
      view.active = -1;
      renderSuggestions(false);
    }
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const open = event.target.closest('[data-aide-open]');
    if (open) { rememberSearch(view.query); openTopic(open.dataset.aideOpen); return; }
    const go = event.target.closest('[data-aide-go]');
    if (go) { goToTopic(go.dataset.aideGo); return; }
    const chip = event.target.closest('[data-aide-q]');
    if (chip) { setQuery(chip.dataset.aideQ); rememberSearch(chip.dataset.aideQ); renderSuggestions(false); document.querySelector('[data-aide="q"]')?.focus(); renderSuggestions(false); return; }
    const cat = event.target.closest('[data-aide-cat]');
    if (cat) { Object.assign(view, { categorie: cat.dataset.aideCat, page: '', topicId: '', query: '' }); renderAide(ctx.state); return; }
    if (event.target.closest('[data-aide-back]')) {
      if (view.topicId) view.topicId = '';
      else Object.assign(view, { categorie: '', page: '' });
      renderAideOutput();
      return;
    }
    if (!event.target.closest('.aide-search')) renderSuggestions(false);
  });
}
