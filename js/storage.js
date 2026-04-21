/**
 * storage.js
 * Persistence via File System Access API.
 * File handle is persisted in IndexedDB so on next visit the browser
 * can silently reopen the file (if permission is still granted)
 * or prompt the user with a single click.
 */

const Storage = (() => {
  let _fileHandle = null;
  let _data       = null;
  let _dirty      = false;
  let _saveTimer  = null;

  const IDB_DB    = 'uchet_store';
  const IDB_STORE = 'handles';
  const IDB_KEY   = 'main';
  const LS_NAME   = 'uchet_file_name';

  const DEFAULT_DATA = {
    version: 1,
    semesters: [],
    records: [],
    clients: [],
    subjects: [],
    meta: { createdAt: null, updatedAt: null }
  };

  /* ─── IndexedDB helpers ─────────────────────── */
  function _idb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => res(e.target.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function _idbSaveHandle(h) {
    try {
      const db = await _idb();
      await new Promise((res, rej) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(h, IDB_KEY);
        req.onsuccess = res; req.onerror = () => rej(req.error);
      });
      localStorage.setItem(LS_NAME, h.name);
    } catch(_) {}
  }

  async function _idbLoadHandle() {
    try {
      const db = await _idb();
      return await new Promise((res, rej) => {
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror   = () => rej(req.error);
      });
    } catch(_) { return null; }
  }

  async function _idbClear() {
    try {
      const db = await _idb();
      await new Promise((res, rej) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(IDB_KEY);
        req.onsuccess = res; req.onerror = () => rej(req.error);
      });
      localStorage.removeItem(LS_NAME);
    } catch(_) {}
  }

  /* ─── Auto-open on page load ────────────────── */
  /**
   * Call this before showing UI. Returns:
   *   { ok: true }               — opened silently
   *   { ok: false, name, handle }— needs user gesture (click) to re-verify
   *   { ok: false }              — no stored handle
   */
  async function tryAutoOpen() {
    const handle = await _idbLoadHandle();
    if (!handle) return { ok: false };
    const name = localStorage.getItem(LS_NAME) || handle.name;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const text = await (await handle.getFile()).text();
        _fileHandle = handle;
        _data = _migrate(JSON.parse(text));
        return { ok: true };
      }
      return { ok: false, name, handle };
    } catch(_) {
      return { ok: false, name };
    }
  }

  /** Call after a user gesture to re-request permission */
  async function reVerifyHandle(handle) {
    try {
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return { ok: false };
      _fileHandle = handle;
      _data = _migrate(JSON.parse(await (await handle.getFile()).text()));
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  }

  /* ─── File pickers ──────────────────────────── */
  async function openFile() {
    if (!('showOpenFilePicker' in window)) {
      _data = structuredClone(DEFAULT_DATA);
      return { ok: true, fsUnavailable: true };
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Uchet JSON', accept: { 'application/json': ['.json'] } }]
      });
      _fileHandle = handle;
      _data = _migrate(JSON.parse(await (await handle.getFile()).text()));
      await _idbSaveHandle(handle);
      return { ok: true };
    } catch(e) {
      return e.name === 'AbortError' ? { ok: false, aborted: true } : { ok: false, error: e.message };
    }
  }

  async function createFile() {
    if (!('showSaveFilePicker' in window)) {
      _data = structuredClone(DEFAULT_DATA);
      _data.meta.createdAt = new Date().toISOString();
      return { ok: true, fsUnavailable: true };
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'uchet.json',
        types: [{ description: 'Uchet JSON', accept: { 'application/json': ['.json'] } }]
      });
      _fileHandle = handle;
      _data = structuredClone(DEFAULT_DATA);
      _data.meta.createdAt = new Date().toISOString();
      await _flush();
      await _idbSaveHandle(handle);
      return { ok: true };
    } catch(e) {
      return e.name === 'AbortError' ? { ok: false, aborted: true } : { ok: false, error: e.message };
    }
  }

  function getSavedFileName() { return localStorage.getItem(LS_NAME); }

  async function forgetFile() {
    _fileHandle = null; _data = null;
    await _idbClear();
  }

  /* ─── Data API ──────────────────────────────── */
  function isReady()      { return _data !== null; }
  function getData()      { return structuredClone(_data); }
  function setData(d)     { _data = structuredClone(d); _scheduleSave(); }
  function getClients()   { return _data ? [..._data.clients]   : []; }
  function getSubjects()  { return _data ? [..._data.subjects]  : []; }
  function getSemesters() { return _data ? [..._data.semesters] : []; }

  function getRecords(semId) {
    if (!_data) return [];
    return semId ? _data.records.filter(r => r.semesterId === semId) : [..._data.records];
  }

  function addRecord(rec) {
    rec = _norm(rec); rec.id = _uid(); rec.createdAt = new Date().toISOString();
    _data.records.push(rec); _syncDerived(); _scheduleSave();
    return rec;
  }

  function updateRecord(id, patch) {
    const idx = _data.records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    _data.records[idx] = { ..._data.records[idx], ..._norm(patch), updatedAt: new Date().toISOString() };
    _syncDerived(); _scheduleSave();
    return _data.records[idx];
  }

  function deleteRecord(id) {
    const before = _data.records.length;
    _data.records = _data.records.filter(r => r.id !== id);
    if (_data.records.length < before) { _syncDerived(); _scheduleSave(); return true; }
    return false;
  }

  function addSemester(sem) {
    sem.id = _uid(); _data.semesters.push(sem); _scheduleSave(); return sem;
  }

  function deleteSemester(id) {
    _data.semesters = _data.semesters.filter(s => s.id !== id);
    _data.records   = _data.records.filter(r => r.semesterId !== id);
    _syncDerived(); _scheduleSave();
  }

  async function saveNow() { clearTimeout(_saveTimer); await _flush(); }

  /* ─── Internal ──────────────────────────────── */
  function _norm(r) {
    return {
      ...r,
      price:      Number(r.price)    || 0,
      taskNum:    r.taskNum    ?? '',
      doneDate:   r.doneDate   ?? '',
      paidDate:   r.paidDate   ?? '',
      notes:      r.notes      ?? '',
      subject:    (r.subject   ?? '').trim().toLowerCase(),
      client:     (r.client    ?? '').trim(),
      semesterId: r.semesterId ?? '',
    };
  }

  function _syncDerived() {
    _data.clients  = [...new Set(_data.records.map(r => r.client).filter(Boolean))].sort();
    _data.subjects = [...new Set(_data.records.map(r => r.subject).filter(Boolean))].sort();
  }

  function _scheduleSave() {
    _dirty = true;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flush, 600);   // auto-save 600ms after last change
  }

  async function _flush() {
    if (!_dirty || !_data) return;
    _data.meta.updatedAt = new Date().toISOString();
    const json = JSON.stringify(_data, null, 2);
    if (!_fileHandle) {
      try { sessionStorage.setItem('uchet_backup', json); } catch(_) {}
      _dirty = false; return;
    }
    try {
      const w = await _fileHandle.createWritable();
      await w.write(json); await w.close();
      _dirty = false;
    } catch(e) { console.error('[Storage] flush failed:', e); }
  }

  function _migrate(data) {
    if (!data.version)   data.version   = 1;
    if (!data.semesters) data.semesters = [];
    if (!data.records)   data.records   = [];
    if (!data.clients)   data.clients   = [];
    if (!data.subjects)  data.subjects  = [];
    if (!data.meta)      data.meta      = {};
    return data;
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    tryAutoOpen, reVerifyHandle,
    openFile, createFile, forgetFile, getSavedFileName,
    getData, setData, isReady,
    getRecords, addRecord, updateRecord, deleteRecord,
    getSemesters, addSemester, deleteSemester,
    getClients, getSubjects, saveNow
  };
})();

window.Storage = Storage;
