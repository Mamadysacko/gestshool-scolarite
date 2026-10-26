// Impression via #print-root (masqué à l'écran, seul visible à l'impression, cf. style.css).
// Chaque document apporte sa propre règle @page ; elle est remplacée à chaque impression.
// `fileName` : nom proposé par le navigateur pour « Enregistrer au format PDF » (titre du document pendant l'impression)
export function printDocument({ title, html, css = '', page = 'A4 portrait', margin = '12mm', fileName = '' }) {
  const root = document.getElementById('print-root');
  if (!root) return false;
  root.innerHTML = `<div class="print-document" data-print-title="${String(title).replace(/"/g, '&quot;')}">
    <style>
      @page { size: ${page}; margin: ${margin}; }
      #print-root .print-document { font: 12px Arial, Helvetica, sans-serif; color: #111827; }
      #print-root table { width: 100%; border-collapse: collapse; }
      #print-root th, #print-root td { text-align: left; border-bottom: 1px solid #d1d5db; padding: 6px 6px; }
      #print-root th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; }
      #print-root .num { text-align: right; white-space: nowrap; }
      #print-root h1, #print-root h2 { margin: 0 0 8px; }
      #print-root .r-title { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 10px 0 4px; padding-bottom: 6px; border-bottom: 2px solid #1e3a8a; }
      #print-root .r-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-bottom: 14px; }
      #print-root .r-kpis { display: flex; gap: 10px; margin: 12px 0; }
      #print-root .r-kpis div { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
      #print-root .r-kpis strong { display: block; font-size: 16px; }
      #print-root .r-group { page-break-inside: avoid; margin-top: 14px; }
      #print-root tfoot td { font-weight: bold; background: #faf5ff; }
      ${css}
    </style>${html}</div>`;
  // On attend le chargement des images (logo, symbole) : sinon elles peuvent manquer à l'impression ou dans le PDF
  const images = [...root.querySelectorAll('img')];
  const loaded = images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  const previousTitle = document.title;
  const restore = () => { document.title = previousTitle; window.removeEventListener('afterprint', restore); };
  Promise.race([Promise.all(loaded), timeout]).then(() => {
    if (fileName) {
      document.title = String(fileName).replace(/[\/:*?"<>|]+/g, '-');
      window.addEventListener('afterprint', restore);
      setTimeout(restore, 60000);
    }
    window.print();
  });
  return true;
}
