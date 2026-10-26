// GEST SCHOOL SCOLARITÉ · 01-noyau-utilitaires.js
// Noyau : registre des modules, utilitaires, stockage, transactions, journal, fenêtres, impression
// Fichier GÉNÉRÉ par build-offline.js à partir de : ./storage.js, ./modules/utils.js, ./modules/transaction.js, ./modules/audit.js, ./modules/dialog.js, ./modules/print.js, ./modules/doc-preview.js, ./modules/entete.js, ./modules/arrondi.js, ./modules/ui-state.js
// Ne pas modifier ici : modifiez les sources puis relancez « node build-offline.js ».

// Registre commun des modules (partagé par les 13 fichiers de l’application)
window.IBK_APP = window.IBK_APP || (() => {
  const factories = Object.create(null);
  const cache = Object.create(null);
  function pathFor(importer, request) {
    const parts = importer.split('/').filter((part) => part && part !== '.');
    parts.pop();
    for (const part of request.split('/')) {
      if (part === '.' || part === '') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return `./${parts.join('/')}`;
  }
  function require(moduleId) {
    if (cache[moduleId]) return cache[moduleId];
    const make = factories[moduleId];
    if (!make) throw new Error(`Module introuvable : ${moduleId} (vérifiez que les 13 fichiers du dossier application/ sont chargés)`);
    const exports = {};
    cache[moduleId] = exports;
    make((request) => require(pathFor(moduleId, request)), exports);
    return exports;
  }
  return { factories, require };
})();

((factories) => {
  factories['./storage.js'] = (require, exports) => {
    const { ensurePaieState } = require("./modules/personnel.js");
    const { normaliserArrondis } = require("./modules/arrondi.js");
    const { migrerContacts } = require("./modules/contacts.js");
    const { ensureProgrammes } = require("./modules/programme.js");
    const { CATEGORIES_DEFAUT, syncCategories } = require("./modules/classes.js");
    const { CATEGORIES_DEPENSE_DEFAUT, syncCategoriesDepense } = require("./modules/depenses.js");
    const { COMPTE_PRINCIPAL_DEFAUT, ensureComptes } = require("./modules/comptes.js");
    const { ensureTarifsHistorises } = require("./modules/tarifs.js");
    // Clé de stockage historique conservée : une mise à jour du logiciel relit les données existantes sans rien effacer.
    const STORAGE_KEY = 'ibk_school_premium_v1';
    
    // État d'une installation neuve : AUCUNE donnée scolaire, financière ni d'établissement.
    // Seuls des référentiels neutres sont fournis (catégories modifiables, une caisse principale) ;
    // l'établissement saisit ensuite son identité, ses années, classes, tarifs, comptes et utilisateurs.
    const DEFAULT_STATE = {
      config: {
        nom: '',
        sigle: '',
        codeEcole: '',
        devise: '',
        adresse: '',
        telephone: '',
        email: '',
        caissier: '',
        categories: [...CATEGORIES_DEFAUT],
        categoriesDepense: [...CATEGORIES_DEPENSE_DEFAUT]
      },
      anneeActiveId: null,
      annees: [],
      classes: [],
      eleves: [],
      tarifs: [],
      inscriptions: [],
      paiements: [],
      paiementsEnAttente: [],
      depenses: [],
      depensesRecurrentes: [],
      comptes: [COMPTE_PRINCIPAL_DEFAUT],
      virements: [],
      sessionsCaisse: [],
      rapprochements: [],
      budgets: [],
      licences: [],
      licencesCatalogue: [],
      licencesArchives: [],
      reliquats: [],
      journal: [],
      compteursRecu: {},
      compteursDepense: {},
      compteursAttente: {},
      compteursVirement: {},
      compteursCaisse: {}
    };
    
    // Version du format des données (détectée à l'import et à la restauration)
    const FORMAT_VERSION = 3;
    
    // Identifiant unique de l'établissement de cette base : relie les comptes utilisateurs à leurs données
    function nouvelIdentifiant() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
      return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Met à niveau un état issu d'une ancienne version (ou d'un import) sans perdre d'information :
    // champs ajoutés avec une valeur neutre, champs supprimés retirés, paiements rattachés à leur année et à leurs imputations.
    function migrateState(raw) {
      const base = structuredClone(DEFAULT_STATE);
      const state = { ...base, ...raw, config: { ...base.config, ...(raw.config || {}) } };
      state.config.arrondis = normaliserArrondis(state.config.arrondis || {});
      ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'paiementsEnAttente', 'depenses', 'depensesRecurrentes', 'virements', 'sessionsCaisse', 'rapprochements', 'budgets', 'licences', 'licencesCatalogue', 'licencesArchives', 'reliquats', 'journal'].forEach((key) => {
        if (!Array.isArray(state[key])) state[key] = [];
      });
      if (!state.config.etablissementId) state.config.etablissementId = nouvelIdentifiant();
      state.config.caisseObligatoire = Boolean(state.config.caisseObligatoire);
      state.formatVersion = FORMAT_VERSION;
      ['compteursRecu', 'compteursDepense', 'compteursAttente', 'compteursVirement', 'compteursCaisse'].forEach((key) => {
        if (!state[key] || typeof state[key] !== 'object') state[key] = {};
      });
      delete state.rapports; // ancienne note de démonstration, jamais utilisée
      state.annees.forEach((a) => {
        if (typeof a.soldeInitial !== 'number') a.soldeInitial = Number(a.soldeInitial || 0);
        if (typeof a.fraisInscription !== 'number') a.fraisInscription = Number(a.fraisInscription || 0);
        if (typeof a.fraisReinscription !== 'number') a.fraisReinscription = Number(a.fraisReinscription || 0);
      });
      // Les champs « niveau » et « salle » n'existent plus pour les classes
      // ni « classe de passage » : le niveau supérieur est déduit du nom de la classe (modules/passage.js)
      state.classes.forEach((c) => { delete c.niveau; delete c.salle; delete c.classeSuivante; });
      // Tarifs : la case « échéancier mensuel » devient un montant mensuel explicite (0 = mensuel non proposé)
      state.tarifs.forEach((t) => {
        if (t.montantMensuel === undefined) {
          const months = Math.min(Math.max(Number(t.nbMois || 9), 1), 12);
          t.montantMensuel = t.mensuel ? Math.ceil(Number(t.montantAnnuel || 0) / months) : 0;
          t.nbMois = months;
          t.moisDebut = t.moisDebut || '';
        }
        delete t.mensuel;
      });
      // Tarifs : frais annexes, frais d'inscription propres à la classe, plafond de remise et historique des versions
      ensureTarifsHistorises(state);
      // Inscriptions : modalité de règlement. Déjà utilisée par un paiement valide → conservée ; sinon « à choisir ».
      state.inscriptions.forEach((i) => {
        if (i.modalite !== undefined) return;
        const paid = state.paiements.some((p) => !p.annule && p.inscriptionId === i.id);
        i.modalite = paid && (i.echeances || []).length ? ((i.echeances || []).some((e) => e.mensualite) ? 'mensuel' : 'tranches') : null;
      });
      // Paie du personnel : collections et référentiels par défaut (types d'employés, matières)
      ensurePaieState(state);
      // Programmes des classes et fiches contacts des parents (reprise des anciens champs « parent »)
      ensureProgrammes(state);
      migrerContacts(state);
      state.paiements.forEach((p) => {
        const inscription = state.inscriptions.find((i) => i.id === p.inscriptionId);
        if (!p.anneeId && inscription) p.anneeId = inscription.anneeId;
        if (!Array.isArray(p.allocations) || !p.allocations.length) {
          p.allocations = p.echeanceId ? [{ echeanceId: p.echeanceId, montant: Number(p.montant || 0) }] : [];
        }
      });
      // Catégories d'enseignement et de dépenses : configurables ; celles déjà utilisées par des données sont conservées
      syncCategories(state);
      syncCategoriesDepense(state);
      // Comptes financiers : une caisse principale existe toujours ; les anciennes opérations y sont rattachées
      ensureComptes(state);
      return state;
    }
    
    // Vrai lorsque le navigateur ne contenait aucune donnée au démarrage (première ouverture, données du
    // navigateur effacées) : l'application propose alors de recharger le fichier de données lié.
    let createdFresh = false;
    const stateWasCreated = () => createdFresh;
    
    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          createdFresh = true;
          const fresh = migrateState({});
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          return fresh;
        }
        return migrateState(JSON.parse(raw));
      } catch (error) {
        console.error('Erreur lecture storage', error);
        return migrateState({});
      }
    }
    
    function saveState(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (error) {
        console.error('Erreur écriture storage', error);
        return false;
      }
    }
    
    function exportStateToFile(state, filename = 'gestschool-scolarite-donnees.note') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
    
    // Contrôle minimal d'un fichier importé : un objet dont les collections connues sont bien des listes.
    // Un fichier quelconque (ou abîmé) est refusé avant toute copie de sécurité ou remplacement des données.
    function validateImport(parsed) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Le fichier ne contient pas de données de l’application.';
      const listes = ['annees', 'classes', 'eleves', 'tarifs', 'inscriptions', 'paiements', 'depenses'];
      if (!listes.some((k) => k in parsed) && !('config' in parsed)) return 'Le fichier ne contient pas de données de l’application.';
      const abimee = listes.find((k) => k in parsed && !Array.isArray(parsed[k]));
      if (abimee) return `Fichier abîmé : la rubrique « ${abimee} » est illisible.`;
      if ('config' in parsed && (typeof parsed.config !== 'object' || Array.isArray(parsed.config))) return 'Fichier abîmé : la configuration est illisible.';
      return '';
    }
    
    function importStateFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            const problem = validateImport(parsed);
            if (problem) throw new Error(problem);
            resolve(migrateState(parsed));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
        reader.readAsText(file);
      });
    }
    
    // Remise à zéro des données — réservée à une NOUVELLE installation ou à un établissement qui la demande
    // explicitement (mot de passe administrateur, copie de sécurité préalable). Elle n'est JAMAIS déclenchée par une
    // mise à jour du logiciel : migrateState() conserve toujours les données existantes.
    // TOUTES les données sont effacées : identité et paramètres de l'établissement, comptes financiers, catégories,
    // référentiels, années, élèves, tarifs, opérations, paie et journal (les comptes utilisateurs, sauf les super
    // administrateurs, sont supprimés par l'application au même moment). Sont seulement conservés : l'identifiant
    // d'établissement, qui relie les super administrateurs à leur base, et les registres de licences (une clé utilisée
    // le reste : une réinitialisation ne doit pas permettre de réutiliser une licence).
    function blankState(current) {
      const base = migrateState({ config: { etablissementId: current.config?.etablissementId } });
      return {
        ...base,
        licences: structuredClone(current.licences || []), licencesCatalogue: structuredClone(current.licencesCatalogue || []), licencesArchives: structuredClone(current.licencesArchives || [])
      };
    }
    
    function resetData(current) {
      const fresh = blankState(current);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    
    Object.assign(exports, { STORAGE_KEY, DEFAULT_STATE, FORMAT_VERSION, migrateState, stateWasCreated, loadState, saveState, exportStateToFile, validateImport, importStateFromFile, blankState, resetData });
  };
  factories['./modules/utils.js'] = (require, exports) => {
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }
    
    function formatMoney(value) {
      return Number(value || 0).toLocaleString('fr-FR');
    }
    
    function todayISO() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    
    function formatDateFr(iso) {
      if (!iso) return '—';
      const [y, m, d] = String(iso).slice(0, 10).split('-');
      return y && m && d ? `${d}/${m}/${y}` : String(iso);
    }
    
    const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    
    function below100(n, final) {
      if (n < 17) return UNITS[n];
      if (n < 20) return `dix-${UNITS[n - 10]}`;
      if (n < 70) {
        const t = Math.floor(n / 10);
        const u = n % 10;
        if (u === 0) return TENS[t];
        return u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
      }
      if (n < 80) {
        const r = n - 60;
        return r === 11 ? 'soixante et onze' : `soixante-${below100(r, final)}`;
      }
      if (n === 80) return final ? 'quatre-vingts' : 'quatre-vingt';
      return `quatre-vingt-${below100(n - 80, final)}`;
    }
    
    function below1000(n, final) {
      const h = Math.floor(n / 100);
      const r = n % 100;
      const parts = [];
      if (h === 1) parts.push('cent');
      else if (h > 1) parts.push(`${UNITS[h]} cent${r === 0 && final ? 's' : ''}`);
      if (r > 0) parts.push(below100(r, final));
      return parts.join(' ');
    }
    
    function numberToFrench(value) {
      let n = Math.floor(Math.abs(Number(value) || 0));
      if (n === 0) return 'zéro';
      const parts = [];
      for (const [size, name] of [[1e9, 'milliard'], [1e6, 'million']]) {
        const count = Math.floor(n / size);
        if (count) {
          parts.push(`${below1000(count, false)} ${name}${count > 1 ? 's' : ''}`);
          n %= size;
        }
      }
      const thousands = Math.floor(n / 1000);
      if (thousands) {
        parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
        n %= 1000;
      }
      if (n) parts.push(below1000(n, true));
      return parts.join(' ');
    }
    
    function downloadBlob(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    
    // Une cellule texte commençant par = + - @ serait interprétée comme une formule par le tableur (injection) :
    // elle est neutralisée par une apostrophe. Les nombres restent des nombres.
    function celluleSure(value) {
      if (typeof value !== 'string') return value ?? '';
      return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    }
    
    function downloadCsv(filename, rows) {
      const csv = rows.map((row) => row.map((value) => `"${String(celluleSure(value)).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      downloadBlob(filename, `﻿${csv}`, 'text/csv;charset=utf-8');
    }
    
    // Excel ouvre nativement un tableau HTML enregistré en .xls ; les lignes marquées (kind) reçoivent une mise en forme
    const XLS_STYLE = {
      entete: 'font-weight:bold;font-size:13pt;color:#1e3a8a',
      title: 'font-weight:bold;font-size:15pt;color:#7c3aed',
      section: 'font-weight:bold;font-size:12pt;color:#c2410c',
      kpi: 'font-weight:bold;background:#faf5ff',
      head: 'font-weight:bold;color:#ffffff;background:#7c3aed;border:1px solid #5b21b6',
      foot: 'font-weight:bold;background:#fff7ed;border:1px solid #fdba74'
    };
    
    function downloadExcel(filename, title, rows) {
      const body = rows.map((row, index) => {
        const kind = row.kind || (index === 0 && !rows.some((r) => r.kind) ? 'head' : '');
        const style = XLS_STYLE[kind] || '';
        const tag = kind === 'head' ? 'th' : 'td';
        return `<tr>${row.map((cell) => {
          const numeric = typeof cell === 'number';
          const cellStyle = `${style};${numeric ? 'text-align:right;mso-number-format:"#,##0"' : ''};${!kind && row.length > 1 ? 'border:1px solid #e5e7eb' : ''}`;
          return `<${tag} style='${cellStyle}'>${escapeHtml(cell)}</${tag}>`;
        }).join('')}</tr>`;
      }).join('');
      const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body><table style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">${body}</table></body></html>`;
      downloadBlob(filename, `﻿${html}`, 'application/vnd.ms-excel;charset=utf-8');
    }
    
    Object.assign(exports, { escapeHtml, formatMoney, todayISO, formatDateFr, numberToFrench, downloadBlob, celluleSure, downloadCsv, downloadExcel });
  };
  factories['./modules/transaction.js'] = (require, exports) => {
    // Exécute une opération « tout ou rien » : si elle échoue (exception) ou refuse (résultat faux/nul),
    // l'état est remis exactement dans son état initial, sans écriture partielle (paiement sans mise à jour du solde, etc.).
    function withTransaction(state, operation) {
      const snapshot = structuredClone(state);
      const rollback = () => {
        Object.keys(state).forEach((key) => { if (!(key in snapshot)) delete state[key]; });
        Object.assign(state, snapshot);
      };
      let result;
      try {
        result = operation();
      } catch (error) {
        rollback();
        throw error;
      }
      if (result === false || result === null || result === undefined) rollback();
      return result;
    }
    
    Object.assign(exports, { withTransaction });
  };
  factories['./modules/audit.js'] = (require, exports) => {
    const { currentUser } = require("./auth.js");
    // Journal d'audit : chaque ligne conserve la date, l'utilisateur authentifié, l'action, l'enregistrement concerné et,
    // lorsque c'est pertinent, les valeurs avant et après modification.
    // Taille plafonnée pour protéger le stockage du navigateur : au-delà, les plus anciennes lignes sont retirées, mais
    // ce retrait est lui-même consigné (jamais silencieux) ; les sauvegardes conservent l'historique complet.
    const MAX_ENTRIES = 20000;
    
    // Valeurs lisibles et compactes (pas de pièce jointe ni d'image dans le journal)
    function compact(value) {
      if (value === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(value, (key, v) => (typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : key === 'piece' || key === 'logo' ? undefined : v)));
      } catch (error) { return undefined; }
    }
    
    function logOperation(state, type, detail, montant = 0, { cible = '', avant, apres } = {}) {
      if (!Array.isArray(state.journal)) state.journal = [];
      const user = currentUser();
      const entry = {
        id: state.journal.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1,
        horodatage: new Date().toISOString(),
        type,
        detail,
        montant: Number(montant || 0),
        utilisateur: user?.nom || '',
        utilisateurId: user?.id || 0
      };
      if (cible) entry.cible = String(cible);
      if (avant !== undefined) entry.avant = compact(avant);
      if (apres !== undefined) entry.apres = compact(apres);
      state.journal.push(entry);
      if (state.journal.length > MAX_ENTRIES) {
        const retirees = state.journal.splice(0, state.journal.length - MAX_ENTRIES + 1);
        state.journal.unshift({ id: entry.id + 1, horodatage: new Date().toISOString(), type: 'journal', detail: `${retirees.length} entrée(s) du journal antérieures au ${retirees[retirees.length - 1].horodatage.slice(0, 10)} retirées de la base de travail (plafond ${MAX_ENTRIES}) ; elles restent dans les sauvegardes antérieures.`, montant: 0, utilisateur: 'Système', utilisateurId: 0 });
      }
      return entry;
    }
    
    Object.assign(exports, { MAX_ENTRIES, logOperation });
  };
  factories['./modules/dialog.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    function fieldHtml(field, index) {
      const name = field.name || (index === 0 ? 'v' : `f${index}`);
      const value = field.value !== undefined ? ` value="${escapeHtml(field.value)}"` : '';
      if (Array.isArray(field.options)) {
        return `<label class="dialog-field">${escapeHtml(field.label)}<select name="${escapeHtml(name)}">${field.options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${String(v) === String(field.value ?? '') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label>`;
      }
      if (field.type === 'checkbox') {
        return `<label class="dialog-check"><input name="${escapeHtml(name)}" type="checkbox" ${field.checked ? 'checked' : ''} /> ${escapeHtml(field.label)}</label>`;
      }
      return `<label class="dialog-field">${escapeHtml(field.label)}<input name="${escapeHtml(name)}" type="${field.type || 'text'}" ${field.required ? 'required' : ''} autocomplete="off"${value} placeholder="${escapeHtml(field.placeholder || '')}" /></label>`;
    }
    
    // Fenêtre de confirmation (remplace confirm()/prompt()) ; résout { ok, value, values }.
    // `field` (un champ) ou `fields` (plusieurs champs) sont facultatifs ; `value` = premier champ, `values` = tous.
    function confirmDialog({ title = 'Confirmation', message = '', confirmLabel = 'Confirmer', danger = false, field = null, fields = null } = {}) {
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
    
    function notify(type, message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = `${type === 'error' ? '✖ ' : '✔ '}${message}`;
      toast.className = `toast ${type}`;
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => toast.classList.add('hidden'), type === 'error' ? 5000 : 3200);
    }
    
    Object.assign(exports, { confirmDialog, notify });
  };
  factories['./modules/print.js'] = (require, exports) => {
    // Impression via #print-root (masqué à l'écran, seul visible à l'impression, cf. style.css).
    // Chaque document apporte sa propre règle @page ; elle est remplacée à chaque impression.
    // `fileName` : nom proposé par le navigateur pour « Enregistrer au format PDF » (titre du document pendant l'impression)
    function printDocument({ title, html, css = '', page = 'A4 portrait', margin = '12mm', fileName = '' }) {
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
    
    Object.assign(exports, { printDocument });
  };
  factories['./modules/doc-preview.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    // Aperçu d'un document (reçu, bulletin…) affiché automatiquement après une opération réussie,
    // avec les actions Imprimer, Télécharger en PDF et Fermer. N'est jamais appelé si l'opération a échoué.
    // `print(fileName)` lance l'impression du document complet (ex. reçu en 2 exemplaires).
    function showDocumentPreview({ eyebrow = 'Document', title, subtitle = '', html, css = '', fileName, print }) {
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
    
    Object.assign(exports, { showDocumentPreview });
  };
  factories['./modules/entete.js'] = (require, exports) => {
    const { escapeHtml } = require("./utils.js");
    // En-tête officiel des documents imprimés (reçus, factures, rapports, relances) : entièrement configuré par
    // l'établissement (Administration → Établissement). Aucune identité, tutelle, coordonnée, drapeau ni logo n'est
    // fourni par défaut : une rubrique vide n'est simplement pas imprimée.
    const DEFAULT_LOGO = '';
    
    const ENTETE_DEFAUT = { tutelle: [], slogan: '', telephones: '', email: '', pays: '', drapeau: [], initialesColorees: false };
    
    const lignes = (value) => (Array.isArray(value) ? value : String(value || '').split(/\r?\n/)).map((l) => String(l).trim()).filter(Boolean);
    const couleurs = (value) => (Array.isArray(value) ? value : []).map((c) => String(c).trim()).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 3);
    
    function enteteConfig(config) {
      const e = config.entete || {};
      return {
        tutelle: lignes(e.tutelle),
        slogan: String(e.slogan || '').trim(),
        // Coordonnées de l'en-tête : celles saisies pour l'en-tête, sinon celles de l'établissement
        telephones: String(e.telephones || config.telephone || '').trim(),
        email: String(e.email || config.email || '').trim(),
        adresse: String(config.adresse || '').trim(),
        pays: String(e.pays || '').trim(),
        drapeau: couleurs(e.drapeau),
        initialesColorees: Boolean(e.initialesColorees)
      };
    }
    
    // Nom de l'établissement ; option : initiales des mots (à partir du 3e) en couleur, façon « GROUPE SCOLAIRE A B C »
    function nameHtml(nom, colorees) {
      const words = String(nom || '').toUpperCase().split(/\s+/).filter(Boolean);
      if (!colorees || words.length < 3) return escapeHtml(words.join(' '));
      const colors = ['eh-c1', 'eh-c2', 'eh-c3'];
      const lead = words.slice(0, 2).join(' ');
      const rest = words.slice(2).map((w, i) => `<span class="${colors[i % 3]}">${escapeHtml(w.charAt(0))}</span>${escapeHtml(w.slice(1))}`).join(' ');
      return `${escapeHtml(lead)} ${rest}`.trim();
    }
    
    function flagHtml(e) {
      if (!e.drapeau.length) return '';
      return `<div class="eh-flag" role="img" aria-label="Drapeau${e.pays ? ` — ${escapeHtml(e.pays)}` : ''}">${e.drapeau.map((c) => `<i style="background:${escapeHtml(c)}"></i>`).join('')}</div>`;
    }
    
    function emblemHtml(config, e) {
      if (config.armoiries) return `<img class="eh-emblem-img" src="${escapeHtml(config.armoiries)}" alt="Symbole national" />`;
      return e.pays ? `<div class="eh-emblem">${escapeHtml(e.pays)}</div>` : '';
    }
    
    // En-tête officiel unique : à utiliser sur tous les documents imprimés/exportés.
    function enteteHtml(config, { compact = false } = {}) {
      const e = enteteConfig(config);
      const nom = String(config.nom || '').trim() || 'Établissement (à configurer dans Administration)';
      return `<header class="eh ${compact ? 'compact' : ''}">
        <div class="eh-left">
          ${e.tutelle.length ? `<div class="eh-admin">${e.tutelle.map(escapeHtml).join('<br>')}</div>` : ''}
          ${config.logo ? `<img class="eh-logo" src="${escapeHtml(config.logo)}" alt="Logo de l'établissement" />` : ''}
        </div>
        <div class="eh-center">
          <div class="eh-name">${nameHtml(nom, e.initialesColorees)}</div>
          ${e.slogan ? `<div class="eh-slogan">${escapeHtml(e.slogan)}</div>` : ''}
          ${e.adresse ? `<div class="eh-contact">${escapeHtml(e.adresse)}</div>` : ''}
          ${e.telephones ? `<div class="eh-contact"><b>Tél :</b> ${escapeHtml(e.telephones)}</div>` : ''}
          ${e.email ? `<div class="eh-contact"><b>Email :</b> ${escapeHtml(e.email)}</div>` : ''}
        </div>
        <div class="eh-right">${flagHtml(e)}${emblemHtml(config, e)}</div>
      </header>`;
    }
    
    // Version texte pour les exports tableur
    function enteteLignes(config) {
      const e = enteteConfig(config);
      return [[config.nom || ''], ...(e.tutelle.length ? [[e.tutelle.join(' · ')]] : []), [[e.slogan, e.adresse, e.telephones && `Tél : ${e.telephones}`, e.email].filter(Boolean).join(' — ')]];
    }
    
    Object.assign(exports, { DEFAULT_LOGO, ENTETE_DEFAUT, enteteConfig, enteteHtml, enteteLignes });
  };
  factories['./modules/arrondi.js'] = (require, exports) => {
    // Arrondis professionnels des montants (monnaie sans centimes, ex. GNF, XOF : la devise est celle de l'établissement).
    // Chaque nature de montant calculé a sa propre règle (palier + sens), paramétrable dans Paramètres › Paramètres financiers.
    // Les calculs intermédiaires gardent leur précision ; l'arrondi n'est appliqué qu'au montant proposé, et
    // une répartition (tranches, mensualités, échéances d'avance) reste toujours exacte : la dernière part
    // absorbe l'écart, si bien que reçus, soldes et rapports retombent sur le même total.
    const PALIERS_ARRONDI = [1, 100, 500, 1000, 5000, 10000];
    const SENS_ARRONDI = { proche: 'Au plus proche', inferieur: 'Inférieur', superieur: 'Supérieur' };
    const NATURES_ARRONDI = {
      tranches: 'Tranches de scolarité (montant annuel ÷ 3)',
      mensualites: 'Mensualités (montant annuel ÷ nombre de mois)',
      avances: 'Échéances d’avance sur salaire (montant ÷ durée)'
    };
    const ARRONDI_DEFAUT = {
      tranches: { pas: 5000, sens: 'proche' },
      mensualites: { pas: 1000, sens: 'proche' },
      avances: { pas: 1000, sens: 'proche' }
    };
    
    // Règle d'une nature, valeurs invalides ramenées aux valeurs par défaut
    function regleArrondi(config, nature) {
      const def = ARRONDI_DEFAUT[nature] || { pas: 1, sens: 'proche' };
      const r = config?.arrondis?.[nature] || {};
      return {
        pas: PALIERS_ARRONDI.includes(Number(r.pas)) ? Number(r.pas) : def.pas,
        sens: SENS_ARRONDI[r.sens] ? r.sens : def.sens
      };
    }
    
    function normaliserArrondis(raw = {}) {
      return Object.fromEntries(Object.keys(ARRONDI_DEFAUT).map((k) => [k, regleArrondi({ arrondis: raw }, k)]));
    }
    
    // Arrondi d'un montant au palier, dans le sens demandé (toujours un entier de francs)
    function arrondir(montant, { pas = 1, sens = 'proche' } = {}) {
      const value = Number(montant || 0);
      const step = Math.max(Number(pas) || 1, 1);
      const q = value / step;
      const n = sens === 'inferieur' ? Math.floor(q + 1e-9) : sens === 'superieur' ? Math.ceil(q - 1e-9) : Math.round(q);
      return n * step;
    }
    
    // Répartit un total en n parts arrondies ; la dernière part absorbe l'écart (somme exacte, aucune part négative)
    function repartir(total, n, regle = { pas: 1, sens: 'proche' }) {
      const t = Math.max(Math.floor(Number(total || 0)), 0);
      const count = Math.max(Math.floor(Number(n || 1)), 1);
      if (count === 1) return [t];
      let base = arrondir(t / count, regle);
      if (base * (count - 1) >= t || base <= 0) base = arrondir(t / count, { ...regle, sens: 'inferieur' });
      if (base * (count - 1) >= t || base <= 0) base = Math.floor(t / count);
      return Array.from({ length: count }, (_, i) => (i === count - 1 ? t - base * (count - 1) : base));
    }
    
    // Un total mensuel qui ne diffère du montant annuel que par l'arrondi des mensualités est un écart d'arrondi :
    // la dernière mensualité l'absorbe. Au-delà, c'est un tarif mensuel volontairement différent (frais majorés).
    function ecartArrondi(montantMensuel, nbMois, montantAnnuel, regle = { pas: 1 }) {
      const gap = Number(montantMensuel) * Number(nbMois) - Number(montantAnnuel);
      return gap !== 0 && Math.abs(gap) < Number(nbMois) * Math.max(Number(regle.pas) || 1, 1) && Number(montantMensuel) * (Number(nbMois) - 1) < Number(montantAnnuel);
    }
    
    Object.assign(exports, { PALIERS_ARRONDI, SENS_ARRONDI, NATURES_ARRONDI, ARRONDI_DEFAUT, regleArrondi, normaliserArrondis, arrondir, repartir, ecartArrondi });
  };
  factories['./modules/ui-state.js'] = (require, exports) => {
    // Mémorisation de l'état d'affichage (page, filtres, recherches) pour la session de l'onglet et par utilisateur :
    // une actualisation ramène l'utilisateur exactement où il était. Ce n'est qu'un confort d'affichage ;
    // aucune donnée comptable n'est stockée ici, et tout est revalidé à la restauration.
    const UI_KEY = 'ibk_ui_state_v1';
    
    function readAll() {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(UI_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) { return {}; }
    }
    
    function loadUiState(userId) {
      const value = readAll()[String(userId)];
      return value && typeof value === 'object' ? value : {};
    }
    
    function saveUiState(userId, value) {
      try {
        const all = readAll();
        all[String(userId)] = value;
        sessionStorage.setItem(UI_KEY, JSON.stringify(all));
      } catch (error) { /* stockage indisponible : simple perte de confort */ }
    }
    
    // Ne recopie que les clés connues, avec le même type que la valeur par défaut
    function pickKnown(defaults, saved) {
      const out = {};
      if (!saved || typeof saved !== 'object') return out;
      Object.keys(defaults).forEach((key) => {
        if (key in saved && typeof saved[key] === typeof defaults[key]) out[key] = saved[key];
      });
      return out;
    }
    
    Object.assign(exports, { loadUiState, saveUiState, pickKnown });
  };
})(window.IBK_APP.factories);

