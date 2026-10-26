import { escapeHtml } from './utils.js';

// Aperçu d'un document (reçu, bulletin…) affiché automatiquement après une opération réussie,
// avec les actions Imprimer, Télécharger en PDF et Fermer. N'est jamais appelé si l'opération a échoué.
// `print(fileName)` lance l'impression du document complet (ex. reçu en 2 exemplaires).
export function showDocumentPreview({ eyebrow = 'Document', title, subtitle = '', html, css = '', fileName, print }) {
  const root = document.getElementById('modal-root');
  if (!root) return false;
  root.innerHTML = `<div class="modal-backdrop" data-modal-close>
    <section class="student-modal doc-preview-modal" role="dialog" aria-modal="true" aria-labelledby="doc-preview-title">
      <header class="modal-header"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="doc-preview-title">${escapeHtml(title)}</h2>${subtitle ? `<span class="meta">${escapeHtml(subtitle)}</span>` : ''}</div>
        <button class="modal-close" type="button" aria-label="Fermer" data-modal-close>×</button></header>
      <div class="doc-preview-actions">
        <button type="button" class="primary-btn" data-doc-action="print">🖨 Imprimer</button>
        <button type="button" class="secondary-btn" data-doc-action="pdf">⬇ Télécharger en PDF</button>
        <button type="button" class="secondary-btn" data-modal-close>Fermer</button>
      </div>
      <p class="meta doc-preview-hint" data-doc-hint hidden>Dans la fenêtre qui s’ouvre, choisissez la destination « Enregistrer au format PDF » : le fichier est nommé « ${escapeHtml(fileName)}.pdf ».</p>
      <style>${css}</style>
      <div class="doc-preview-body">${html}</div>
    </section></div>`;
  root.querySelector('[data-doc-action="print"]').addEventListener('click', () => print(fileName));
  root.querySelector('[data-doc-action="pdf"]').addEventListener('click', () => {
    root.querySelector('[data-doc-hint]').hidden = false;
    print(fileName);
  });
  root.querySelector('[data-doc-action="print"]').focus();
  return true;
}
