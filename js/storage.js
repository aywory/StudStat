/**
 * storage.js
 * Handles all persistence via File System Access API.
 * Falls back to in-memory if API not supported.
 */

const Storage = (() => {
  let _fileHandle = null;
  let _data = null;        // live in-memory copy
  let _dirty = false;
  let _saveTimer = null;

  const DEFAULT_DATA = {
    version: 1,
    semesters: [],         // { id, name, year, label }
    records: [],           // see RECORD_SCHEMA below
    clients: [],           // quick-access client name list (derived)
    subjects: [],          // quick-access subject list (derived)
    meta: { createdAt: null, updatedAt: null }
  };

  /* ─── Public API ─────────────────────────── */

  async function openFile() {
    if (!('showOpenFilePicker' in window)) {
      _data = structuredClone(DEFAULT_DATA);
      return { ok: true, isNew: true, fsUnavailable: true };
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Uchet JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      _fileHandle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      _data = JSON.parse(text);
      _data = _migrate(_data);
      return { ok: true, isNew: false };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, aborted: true };
      return { ok: false, error: e.message };
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
      return { ok: true };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, aborted: true };
      return { ok: false, error: e.message };
    }
  }

  /** Returns a deep-copy snapshot of current data */
  function getData() {
    return structuredClone(_data);
  }

  /** Replace entire data object and schedule save */
  function setData(newData) {
    _data = structuredClone(newData);
    _scheduleSave();
  }

  /* ─── Records CRUD ───────────────────────── */

  function getRecords(semesterId) {
    if (!_data) return [];
    const recs = _data.records;
    return semesterId ? recs.filter(r => r.semesterId === semesterId) : [...recs];
  }

  function addRecord(rec) {
    rec = _normalizeRecord(rec);
    rec.id = _uid();
    rec.createdAt = new Date().toISOString();
    _data.records.push(rec);
    _syncDerived();
    _scheduleSave();
    return rec;
  }

  function updateRecord(id, patch) {
    const idx = _data.records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    _data.records[idx] = { ..._data.records[idx], ..._normalizeRecord(patch), updatedAt: new Date().toISOString() };
    _syncDerived();
    _scheduleSave();
    return _data.records[idx];
  }

  function deleteRecord(id) {
    const before = _data.records.length;
    _data.records = _data.records.filter(r => r.id !== id);
    if (_data.records.length < before) { _syncDerived(); _scheduleSave(); return true; }
    return false;
  }

  /* ─── Semesters ──────────────────────────── */

  function getSemesters() { return _data ? [..._data.semesters] : []; }

  function addSemester(sem) {
    sem.id = _uid();
    _data.semesters.push(sem);
    _scheduleSave();
    return sem;
  }

  function deleteSemester(id) {
    _data.semesters = _data.semesters.filter(s => s.id !== id);
    _data.records    = _data.records.filter(r => r.semesterId !== id);
    _syncDerived();
    _scheduleSave();
  }

  /* ─── Derived lists ─────────────────────── */

  function getClients()  { return _data ? [..._data.clients] : []; }
  function getSubjects() { return _data ? [..._data.subjects] : []; }

  function isReady() { return _data !== null; }

  /* ─── Internal ───────────────────────────── */

  function _normalizeRecord(r) {
    return {
      ...r,
      price:       Number(r.price)      || 0,
      taskNum:     r.taskNum      ?? '',
      doneDate:    r.doneDate     ?? '',
      paidDate:    r.paidDate     ?? '',
      status:      r.status       ?? 'о- в-',
      notes:       r.notes        ?? '',
      subject:     (r.subject     ?? '').trim().toLowerCase(),
      client:      (r.client      ?? '').trim(),
      semesterId:  r.semesterId   ?? '',
    };
  }

  function _syncDerived() {
    const clients  = [...new Set(_data.records.map(r => r.client).filter(Boolean))].sort();
    const subjects = [...new Set(_data.records.map(r => r.subject).filter(Boolean))].sort();
    _data.clients  = clients;
    _data.subjects = subjects;
  }

  function _scheduleSave() {
    _dirty = true;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flush, 800);
  }

  async function _flush() {
    if (!_dirty || !_data) return;
    _data.meta.updatedAt = new Date().toISOString();
    const json = JSON.stringify(_data, null, 2);
    if (!_fileHandle) {
      // no file handle — store in sessionStorage as fallback
      try { sessionStorage.setItem('uchet_backup', json); } catch(_) {}
      _dirty = false;
      return;
    }
    try {
      const writable = await _fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      _dirty = false;
    } catch(e) {
      console.error('[Storage] flush failed:', e);
    }
  }

  function _migrate(data) {
    if (!data.version) data.version = 1;
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

  /* force immediate save (e.g. before unload) */
  async function saveNow() {
    clearTimeout(_saveTimer);
    await _flush();
  }

  return {
    openFile, createFile,
    getData, setData, isReady,
    getRecords, addRecord, updateRecord, deleteRecord,
    getSemesters, addSemester, deleteSemester,
    getClients, getSubjects,
    saveNow
  };
})();

window.Storage = Storage;
