/**
 * storage.js
 * Single source of truth for ALL data.
 * Persistence: File System Access API, handle stored in IndexedDB.
 * Auto-saves 600ms after every mutation.
 */

const Storage = (() => {
  let _fh       = null;   // FileSystemFileHandle
  let _data     = null;   // live object — always mutate via helpers
  let _dirty    = false;
  let _timer    = null;

  const IDB_DB    = 'uchet_v2';
  const IDB_STORE = 'handles';
  const IDB_KEY   = 'main';
  const LS_NAME   = 'uchet_fname';

  const BLANK = () => ({
    version: 2,
    semesters: [],
    records:   [],
    clients:   [],
    subjects:  [],
    meta:      { createdAt: null, updatedAt: null }
  });

  /* ══ IndexedDB ══════════════════════════════ */
  function _idb() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(IDB_DB, 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      r.onsuccess  = e => ok(e.target.result);
      r.onerror    = () => fail(r.error);
    });
  }
  async function _idbPut(val) {
    try {
      const db = await _idb();
      return new Promise((ok, fail) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const r  = tx.objectStore(IDB_STORE).put(val, IDB_KEY);
        r.onsuccess = ok; r.onerror = () => fail(r.error);
      });
    } catch (_) {}
  }
  async function _idbGet() {
    try {
      const db = await _idb();
      return new Promise((ok, fail) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const r  = tx.objectStore(IDB_STORE).get(IDB_KEY);
        r.onsuccess = () => ok(r.result ?? null);
        r.onerror   = () => fail(r.error);
      });
    } catch (_) { return null; }
  }
  async function _idbDel() {
    try {
      const db = await _idb();
      await new Promise((ok, fail) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const r  = tx.objectStore(IDB_STORE).delete(IDB_KEY);
        r.onsuccess = ok; r.onerror = () => fail(r.error);
      });
    } catch (_) {}
    localStorage.removeItem(LS_NAME);
  }

  /* ══ File read/write ════════════════════════ */
  async function _readHandle(handle) {
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  }
  async function _writeHandle(handle, data) {
    const w = await handle.createWritable();
    await w.write(JSON.stringify(data, null, 2));
    await w.close();
  }

  /* ══ Auto-open on page load ═════════════════ */
  /**
   * Returns:
   *  { ok:true }                  – silently opened
   *  { ok:false, needsGesture, handle, name } – stored handle needs click
   *  { ok:false }                 – nothing stored
   */
  async function tryAutoOpen() {
    const handle = await _idbGet();
    if (!handle) return { ok: false };
    const name = localStorage.getItem(LS_NAME) || handle.name;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _data = _migrate(await _readHandle(handle));
        _fh   = handle;
        return { ok: true };
      }
      return { ok: false, needsGesture: true, handle, name };
    } catch (_) {
      return { ok: false };
    }
  }

  /** Call inside a user-gesture handler (button click) */
  async function reVerify(handle) {
    try {
      if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted')
        return { ok: false };
      _data = _migrate(await _readHandle(handle));
      _fh   = handle;
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function openFile() {
    if (!('showOpenFilePicker' in window)) {
      _data = BLANK(); _data.meta.createdAt = new Date().toISOString();
      return { ok: true, noApi: true };
    }
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: 'Uchet JSON', accept: { 'application/json': ['.json'] } }]
      });
      _data = _migrate(await _readHandle(h));
      _fh   = h;
      await _idbPut(h);
      localStorage.setItem(LS_NAME, h.name);
      return { ok: true };
    } catch (e) {
      return e.name === 'AbortError' ? { ok: false, aborted: true } : { ok: false, error: e.message };
    }
  }

  async function createFile() {
    if (!('showSaveFilePicker' in window)) {
      _data = BLANK(); _data.meta.createdAt = new Date().toISOString();
      return { ok: true, noApi: true };
    }
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: 'uchet.json',
        types: [{ description: 'Uchet JSON', accept: { 'application/json': ['.json'] } }]
      });
      _data = BLANK(); _data.meta.createdAt = new Date().toISOString();
      await _writeHandle(h, _data);
      _fh = h;
      await _idbPut(h);
      localStorage.setItem(LS_NAME, h.name);
      return { ok: true };
    } catch (e) {
      return e.name === 'AbortError' ? { ok: false, aborted: true } : { ok: false, error: e.message };
    }
  }

  async function forgetFile() {
    _fh = null; _data = null;
    await _idbDel();
  }

  function getSavedFileName() { return localStorage.getItem(LS_NAME); }
  function isReady()          { return _data !== null; }

  /* ══ Flush ══════════════════════════════════ */
  function _schedule() {
    _dirty = true;
    clearTimeout(_timer);
    _timer = setTimeout(_flush, 600);
  }

  async function _flush() {
    if (!_dirty || !_data) return;
    _data.meta.updatedAt = new Date().toISOString();
    if (_fh) {
      try { await _writeHandle(_fh, _data); } catch (e) { console.error('[Storage] write failed', e); return; }
    } else {
      // fallback: sessionStorage
      try { sessionStorage.setItem('uchet_bak', JSON.stringify(_data)); } catch (_) {}
    }
    _dirty = false;
  }

  async function saveNow() { clearTimeout(_timer); await _flush(); }

  /* ══ Data helpers ═══════════════════════════ */
  function _uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function _norm(r) {
    return {
      ...r,
      price:      +(r.price ?? 0) || 0,
      taskNum:    String(r.taskNum    ?? '').trim(),
      doneDate:   String(r.doneDate   ?? ''),
      paidDate:   String(r.paidDate   ?? ''),
      notes:      String(r.notes      ?? '').trim(),
      subject:    String(r.subject    ?? '').trim().toLowerCase(),
      client:     String(r.client     ?? '').trim(),
      semesterId: String(r.semesterId ?? ''),
    };
  }
  function _syncDerived() {
    _data.clients  = [...new Set(_data.records.map(r => r.client).filter(Boolean))].sort();
    _data.subjects = [...new Set(_data.records.map(r => r.subject).filter(Boolean))].sort();
  }
  function _migrate(d) {
    d.version   = d.version   || 2;
    d.semesters = d.semesters || [];
    d.records   = d.records   || [];
    d.clients   = d.clients   || [];
    d.subjects  = d.subjects  || [];
    d.meta      = d.meta      || {};
    return d;
  }

  /* ══ Public data API ════════════════════════ */
  function getSemesters() { return _data ? [..._data.semesters] : []; }
  function getClients()   { return _data ? [..._data.clients]   : []; }
  function getSubjects()  { return _data ? [..._data.subjects]  : []; }

  function getRecords(semId) {
    if (!_data) return [];
    return semId ? _data.records.filter(r => r.semesterId === semId) : [..._data.records];
  }

  function addRecord(rec) {
    const r = _norm(rec);
    r.id        = _uid();
    r.createdAt = new Date().toISOString();
    _data.records.push(r);
    _syncDerived();
    _schedule();
    return r;          // ← return the saved object with id
  }

  function updateRecord(id, patch) {
    const i = _data.records.findIndex(r => r.id === id);
    if (i < 0) return null;
    // merge: keep fields not in patch, override with normalised patch
    const merged = _norm({ ..._data.records[i], ...patch });
    merged.id        = id;
    merged.createdAt = _data.records[i].createdAt;
    merged.updatedAt = new Date().toISOString();
    _data.records[i] = merged;
    _syncDerived();
    _schedule();
    return _data.records[i];
  }

  function deleteRecord(id) {
    const before = _data.records.length;
    _data.records = _data.records.filter(r => r.id !== id);
    if (_data.records.length < before) { _syncDerived(); _schedule(); return true; }
    return false;
  }

  function addSemester(sem) {
    sem.id = _uid();
    _data.semesters.push(sem);
    _schedule();
    return sem;
  }

  function deleteSemester(id) {
    _data.semesters = _data.semesters.filter(s => s.id !== id);
    _data.records   = _data.records.filter(r => r.semesterId !== id);
    _syncDerived();
    _schedule();
  }

  return {
    /* file */
    tryAutoOpen, reVerify, openFile, createFile, forgetFile,
    getSavedFileName, isReady, saveNow,
    /* data */
    getSemesters, addSemester, deleteSemester,
    getRecords, addRecord, updateRecord, deleteRecord,
    getClients, getSubjects,
  };
})();

window.Storage = Storage;
