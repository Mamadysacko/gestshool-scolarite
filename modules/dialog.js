import { escapeHtml } from './utils.js';

function fieldHtml(field, index) {
  const name = field.name || (index === 0 ? 'v' : `f${index}`);
  const value = field.value !== undefined ? ` value="${escapeHtml(field.value)}"` : '';
  if (field.type === 'checkbox') {
    return `<label class="dialog-check"><input name="${escapeHtml(name)}" type="checkbox" ${field.checked ? 'checked' : ''} /> ${escapeHtml(field.label)}</label>`;
  }
  return `<label class="dialog-field">${escapeHtml(field.label)}<input name="${escapeHtml(name)}" type="${field.type || 'text'}" ${field.required ? 'required' : ''} autocomplete="off"${value} placeholder="${escapeHtml(field.placeholder || '')}" /></label>`;
}

// Fenêtre de confirmation (remplace confirm()/prompt()) ; résout { ok, value, values }.
// `field` (un champ) ou `fields` (plusieurs champs) sont facultatifs ; `value` = premier champ, `values` = tous.
export function confirmDialog({ title = 'Confirmation', message = '', confirmLabel = 'Confirmer', danger = false, field = null, fields = null } = {}) {
  return new Promise((resolve) => {
    const list = fields || (field ? [field] : []);
    const root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = `<form class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <h3 id="dlg-title">${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${list.map(fieldHtml).join('')}
      <div class="dialog-actions">
        <button type="button" class="secondary-btn" data-dlg="cancel">Annuler</button>
        <button type="submit" class="${danger ? 'danger-btn' : 'primary-btn'}">${escapeHtml(confirmLabel)}</button>
      </div></form>`;
    const previous = document.activeElement;
    const close = (result) => { root.remove(); if (previous && previous.focus) previous.focus(); resolve(result); };
    root.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {};
      list.forEach((f, i) => {
        const name = f.name || (i === 0 ? 'v' : `f${i}`);
        const input = root.querySelector(`[name="${name}"]`);
        values[name] = input.type === 'checkbox' ? input.checked : input.value.trim();
      });
      const firstName = list[0] ? (list[0].name || 'v') : 'v';
      close({ ok: true, value: values[firstName] ?? '', values });
    });
    root.addEventListener('click', (event) => { if (event.target === root || event.target.matches('[data-dlg="cancel"]')) close({ ok: false, value: '', values: {} }); });
    root.addEventListener('keydown', (event) => { if (event.key === 'Escape') close({ ok: false, value: '', values: {} }); });
    document.body.append(root);
    (root.querySelector('input') || root.querySelector('button[type="submit"]')).focus();
  });
}

export function notify(type, message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = `${type === 'error' ? '✖ ' : '✔ '}${message}`;
  toast.className = `toast ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.add('hidden'), type === 'error' ? 5000 : 3200);
}
