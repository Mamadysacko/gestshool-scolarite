import { escapeHtml } from './utils.js';
import { editeurMentionHtml } from './editeur.js';
import { hasUsers, createUser, authenticate, startSession, lockRemainingMs, passwordProblem } from './auth.js';

// Écran de connexion plein écran. Au tout premier lancement, il propose de créer le compte administrateur
// (aucun mot de passe par défaut n'existe). Résout avec l'utilisateur connecté.
export function showLogin(schoolName = '') {
  return new Promise((resolve) => {
    const root = document.getElementById('login-root');
    const firstRun = !hasUsers();
    root.hidden = false;
    root.innerHTML = `<div class="login-page">
      <form class="login-card" autocomplete="off" novalidate>
        <div class="login-brand"><img class="brand-logo" src="./assets/gest-school-embleme-64.png" alt="" width="46" height="46" /><div><strong>GEST SCHOOL SCOLARITÉ</strong><span>${escapeHtml(schoolName || 'Gestion financière et comptable des établissements scolaires')}</span></div></div>
        <h1>${firstRun ? 'Créer le compte super administrateur' : 'Connexion'}</h1>
        <p class="meta">${firstRun ? 'Premier lancement : créez le compte du super administrateur de l’établissement et conservez ces identifiants précieusement. Seul le compte de l’éditeur du logiciel (maintenance et licences) est présent par défaut.' : 'Saisissez vos identifiants pour accéder à l’application.'}</p>
        ${firstRun ? '<label>Nom complet <input name="nom" type="text" required autocomplete="name" /></label>' : ''}
        <label>Identifiant <input name="username" type="text" required autocomplete="username" autofocus /></label>
        <label>Mot de passe <input name="password" type="password" required autocomplete="${firstRun ? 'new-password' : 'current-password'}" /></label>
        ${firstRun ? '<label>Confirmer le mot de passe <input name="confirm" type="password" required autocomplete="new-password" /></label>' : ''}
        <p class="form-error" data-login-error role="alert" hidden></p>
        <button type="submit" class="primary-btn">${firstRun ? 'Créer le compte et entrer' : 'Se connecter'}</button>
        ${editeurMentionHtml()}
      </form>
    </div>`;
    const form = root.querySelector('form');
    const error = root.querySelector('[data-login-error]');
    const fail = (message) => { error.textContent = message; error.hidden = false; };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const username = String(data.get('username') || '').trim();
      const password = String(data.get('password') || '');
      if (!username || !password) { fail('Renseignez l’identifiant et le mot de passe.'); return; }
      let user;
      if (firstRun) {
        if (password !== data.get('confirm')) { fail('Les deux mots de passe sont différents.'); return; }
        const problem = passwordProblem(password);
        if (problem) { fail(problem); return; }
        try { user = createUser({ username, nom: data.get('nom'), role: 'superadmin', password }, { premier: true }); } catch (e) { fail(e.message); return; }
      } else {
        const result = authenticate(username, password);
        if (!result.ok) {
          const wait = lockRemainingMs(username);
          fail(result.message);
          form.querySelector('[name="password"]').value = '';
          if (wait) form.querySelector('button[type="submit"]').disabled = true;
          if (wait) setTimeout(() => { form.querySelector('button[type="submit"]').disabled = false; error.hidden = true; }, wait);
          return;
        }
        user = result.user;
      }
      startSession(user);
      root.hidden = true;
      root.innerHTML = '';
      resolve(user);
    });
  });
}
