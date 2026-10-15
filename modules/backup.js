import { formatMoney, formatDateFr, downloadBlob, todayISO } from './utils.js';
import { inscriptionSituation, STATUT_LABELS, studentOf, classOf, yearLabel, labelEcheance } from './finance.js';

// La base principale reste localStorage. Ces sauvegardes sont des copies de lecture/secours :
//  - copie roulante dans localStorage (toujours),
//  - fichier .note choisi par l'utilisateur et réécrit automatiquement (navigateurs compatibles).
const BACKUP_KEY = 'ibk_backup_note_v1';
const IDB_NAME = 'ibk_backup';
let fileHandle = null;
let timer = null;
const status = { lastAt: '', target: 'Copie locale du navigateur', error: '' };

export function buildNoteText(state) {
  const c = state.config;
  const line = (...parts) => parts.join('  ');
  const out = [`${c.nom} — NOTE DE SAUVEGARDE`, `Générée le ${new Date().toLocaleString('fr-FR')}`, '='.repeat(70), ''];
  out.push('SITUATION DES ÉLÈVES INSCRITS');
  let attendu = 0; let paye = 0;
  state.inscriptions.forEach((i) => {
    const s = studentOf(state, i);
    const sit = inscriptionSituation(state, i);
    attendu += sit.total; paye += sit.paye;
    out.push(line(`- ${s?.matricule || '—'}`, `${s ? `${s.prenom} ${s.nom}` : '—'}`, `[${classOf(state, i.classeId)?.nom || '—'} / ${yearLabel(state, i.anneeId)}]`,
      `attendu ${formatMoney(sit.total)}`, `payé ${formatMoney(sit.paye)}`, `reste ${formatMoney(sit.reste)} ${c.devise}`, `(${STATUT_LABELS[sit.statut]})`));
  });
  out.push('', `TOTAL attendu ${formatMoney(attendu)} · encaissé ${formatMoney(paye)} · reste ${formatMoney(Math.max(attendu - paye, 0))} ${c.devise}`, '', 'PAIEMENTS');
  [...state.paiements].sort((a, b) => a.id - b.id).forEach((p) => {
    const i = state.inscriptions.find((x) => x.id === p.inscriptionId);
    const s = studentOf(state, i);
    out.push(line(`- ${formatDateFr(p.datePaiement)}`, p.numeroRecu || `#${p.id}`, s ? `${s.prenom} ${s.nom}` : '—', labelEcheance(i?.echeances?.find((e) => e.id === p.echeanceId)),
      `${formatMoney(p.montant)} ${c.devise}`, p.mode, p.annule ? `ANNULÉ (${p.motif})` : ''));
  });
  out.push('', 'JOURNAL DES OPÉRATIONS (100 dernières)');
  (state.journal || []).slice(-100).forEach((j) => out.push(`- ${new Date(j.horodatage).toLocaleString('fr-FR')}  ${j.type.toUpperCase()}  ${j.detail}${j.montant ? `  ${formatMoney(j.montant)} ${c.devise}` : ''}`));
  return out.join('\n');
}

export function exportNoteText(state) {
  downloadBlob(`note-scolarite-${todayISO()}.txt`, `﻿${buildNoteText(state)}`, 'text/plain;charset=utf-8');
}

export function backupStatus() {
  return { ...status, fileConnected: Boolean(fileHandle), supported: typeof window.showSaveFilePicker === 'function' };
}

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

export async function initAutoBackup() {
  try {
    const stored = await idb('readonly', (store) => store.get('handle'));
    if (stored && (await stored.queryPermission({ mode: 'readwrite' })) === 'granted') {
      fileHandle = stored;
      status.target = `Fichier ${stored.name}`;
    }
  } catch (error) { /* navigateur sans prise en charge : la copie locale suffit */ }
}

export async function chooseBackupFile(state) {
  if (typeof window.showSaveFilePicker !== 'function') throw new Error('Ce navigateur ne permet pas l’écriture automatique de fichier. Utilisez Chrome ou Edge, ou l’export manuel.');
  fileHandle = await window.showSaveFilePicker({ suggestedName: 'school_data.note', types: [{ description: 'Note JSON', accept: { 'application/json': ['.note', '.json', '.txt'] } }] });
  try { await idb('readwrite', (store) => store.put(fileHandle, 'handle')); } catch (error) { /* non bloquant */ }
  status.target = `Fichier ${fileHandle.name}`;
  await runBackup(state);
}

async function runBackup(state) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: new Date().toISOString(), data: state }));
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
    }
    status.lastAt = new Date().toLocaleTimeString('fr-FR');
    status.error = '';
  } catch (error) {
    status.error = error.message || 'Échec de la sauvegarde';
  }
}

export function scheduleBackup(state) {
  clearTimeout(timer);
  timer = setTimeout(() => runBackup(state), 1500);
}
