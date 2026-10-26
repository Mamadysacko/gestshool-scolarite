import { formatMoney, formatDateFr, downloadBlob, todayISO } from './utils.js';
import { inscriptionSituation, STATUT_LABELS, studentOf, classOf, yearLabel, labelEcheance } from './finance.js';

// Stockage des données :
//  - base de travail : le stockage du navigateur (localStorage), toujours à jour ;
//  - fichier de données « GESTSCHOOL-SCOLARITE-donnees.note » dans un DOSSIER choisi à la première ouverture, réécrit
//    automatiquement après chaque opération. Le lien vers ce dossier est mémorisé par le navigateur (IndexedDB) :
//    il reste en place après une réinitialisation des données et à chaque nouvelle ouverture ;
//  - sous-dossier « sauvegardes » : copies datées créées automatiquement avant chaque réinitialisation,
//    import ou restauration ;
//  - copie roulante dans le navigateur (secours).
const BACKUP_KEY = 'ibk_backup_note_v1';
const PROMPT_KEY = 'ibk_datafile_prompt_v1';
const IDB_NAME = 'ibk_backup';
export const DATA_FILE_NAME = 'GESTSCHOOL-SCOLARITE-donnees.note';
// Nom utilisé par les versions précédentes : toujours relu si le nouveau fichier n'existe pas encore (aucune perte)
export const LEGACY_DATA_FILE_NAMES = ['IBK-donnees.note'];
export const BACKUP_DIR_NAME = 'sauvegardes';
let dirHandle = null; // dossier lié, accès accordé
let pendingHandle = null; // dossier lié dont l'accès doit être ré-autorisé (nouvelle session du navigateur)
let fileHandle = null; // ancien mode : un seul fichier choisi par l'utilisateur
let timer = null;
let blocked = false; // écriture suspendue tant qu'une restauration depuis le fichier est proposée
let listener = null;
const status = { lastAt: '', error: '' };

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


export const dataFolderSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export function backupStatus() {
  const linked = Boolean(dirHandle || fileHandle);
  const name = (dirHandle || pendingHandle)?.name || fileHandle?.name || '';
  let target = 'Copie locale du navigateur uniquement';
  if (dirHandle) target = `Dossier « ${name} » › ${DATA_FILE_NAME}`;
  else if (fileHandle) target = `Fichier ${name}`;
  else if (pendingHandle) target = `Dossier « ${name} » (accès à ré-autoriser)`;
  return { ...status, target, supported: dataFolderSupported(), linked, needsPermission: Boolean(pendingHandle) && !dirHandle, folderName: name, mode: dirHandle ? 'dossier' : fileHandle ? 'fichier' : 'aucun', fileConnected: linked };
}

export function onBackupStatus(fn) { listener = fn; }
const changed = () => { try { listener?.(backupStatus()); } catch (error) { /* affichage seulement */ } };

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      } catch (error) { reject(error); } // valeur non enregistrable, base indisponible…
    };
  });
}
const idbGet = (key) => idb('readonly', (store) => store.get(key));
const idbSet = (key, value) => idb('readwrite', (store) => store.put(value, key));
const idbDel = (key) => idb('readwrite', (store) => store.delete(key));

// Au démarrage : le lien mémorisé est repris ; si le navigateur demande une nouvelle autorisation, le dossier
// reste lié (pendingHandle) et un clic sur « Reconnecter » suffit.
export async function initAutoBackup() {
  try {
    const dir = await idbGet('dir');
    if (dir) {
      if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') dirHandle = dir;
      else pendingHandle = dir;
    } else {
      const legacy = await idbGet('handle');
      if (legacy && (await legacy.queryPermission({ mode: 'readwrite' })) === 'granted') fileHandle = legacy;
    }
  } catch (error) { /* navigateur sans prise en charge : la copie du navigateur suffit */ }
  changed();
  return backupStatus();
}

// Proposition faite une seule fois, à la toute première ouverture
export function dataFilePrompted() {
  try { return Boolean(localStorage.getItem(PROMPT_KEY)); } catch (error) { return true; }
}
export function markDataFilePrompted() {
  try { localStorage.setItem(PROMPT_KEY, new Date().toISOString()); } catch (error) { /* non bloquant */ }
}

async function readDataFromDir(dir) {
  try {
    let handle = null;
    for (const name of [DATA_FILE_NAME, ...LEGACY_DATA_FILE_NAMES]) {
      try { handle = await dir.getFileHandle(name); break; } catch (error) { /* nom suivant */ }
    }
    if (!handle) return null;
    const file = await handle.getFile();
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { data, date: new Date(file.lastModified).toISOString(), taille: file.size };
  } catch (error) { return null; }
}

// Contenu actuel du fichier de données lié (null s'il n'existe pas encore ou si le dossier n'est pas accessible)
export async function readLinkedData() {
  return dirHandle ? readDataFromDir(dirHandle) : null;
}

// Choix du dossier (geste de l'utilisateur obligatoire). Renvoie le contenu éventuel d'un fichier de données
// déjà présent dans ce dossier : l'appelant décide de le charger ou de le remplacer (rien n'est écrasé ici).
export async function linkDataFolder() {
  if (!dataFolderSupported()) throw new Error('Ce navigateur ne permet pas de lier un dossier. Utilisez Google Chrome ou Microsoft Edge (ou l’export manuel).');
  const dir = await window.showDirectoryPicker({ id: 'gestschool-donnees', mode: 'readwrite', startIn: 'documents' });
  if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Accès au dossier refusé.');
  const existing = await readDataFromDir(dir);
  dirHandle = dir;
  pendingHandle = null;
  fileHandle = null;
  try { await idbSet('dir', dir); await idbDel('handle'); } catch (error) { status.error = 'Lien non mémorisé par le navigateur'; }
  markDataFilePrompted();
  changed();
  return { existing, name: dir.name };
}

export async function reconnectDataFolder() {
  if (!pendingHandle) return Boolean(dirHandle);
  if ((await pendingHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
  dirHandle = pendingHandle;
  pendingHandle = null;
  status.error = '';
  changed();
  return true;
}

export async function unlinkDataFolder() {
  dirHandle = null; pendingHandle = null; fileHandle = null;
  try { await idbDel('dir'); await idbDel('handle'); } catch (error) { /* non bloquant */ }
  changed();
}

async function writeText(dir, name, text) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close(); // le fichier n'est remplacé qu'une fois l'écriture complète
}

const serialize = (state) => JSON.stringify(state, null, 2);

async function runBackup(state) {
  if (blocked) return;
  try {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ date: new Date().toISOString(), data: state })); } catch (error) { /* copie de secours facultative */ }
    if (dirHandle) await writeText(dirHandle, DATA_FILE_NAME, serialize(state));
    else if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(serialize(state));
      await writable.close();
    }
    status.lastAt = new Date().toLocaleTimeString('fr-FR');
    status.error = '';
  } catch (error) {
    // Accès retiré par le navigateur : le dossier reste lié, il suffit de le reconnecter
    if (dirHandle && error?.name === 'NotAllowedError') { pendingHandle = dirHandle; dirHandle = null; }
    status.error = error?.message || 'Échec de l’enregistrement du fichier';
  }
  changed();
}

export function scheduleBackup(state) {
  clearTimeout(timer);
  timer = setTimeout(() => runBackup(state), 800);
}

// Écriture immédiate (après une réinitialisation, un import, une restauration)
export async function flushBackup(state) {
  clearTimeout(timer);
  await runBackup(state);
}

export function blockBackup(value) { blocked = Boolean(value); }

// Copie datée dans « sauvegardes » du dossier lié ; renvoie le chemin lisible, ou null sans dossier accessible
export async function writeBackupFile(state, fileName) {
  if (!dirHandle) return null;
  const sub = await dirHandle.getDirectoryHandle(BACKUP_DIR_NAME, { create: true });
  await writeText(sub, fileName, serialize(state));
  const check = await (await sub.getFileHandle(fileName)).getFile();
  if (!check.size) throw new Error('Fichier de sauvegarde vide');
  return `${dirHandle.name}/${BACKUP_DIR_NAME}/${fileName}`;
}

// Nom horodaté : sauvegarde-avant-reinitialisation-2026-10-16_14h0512.note
export function backupFileName(motif) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `sauvegarde-${motif}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}${p(d.getSeconds())}.note`;
}
