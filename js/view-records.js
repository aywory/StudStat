/**
 * view-records.js
 * Inline-editing table: click + to add a new blank row,
 * click any cell to edit in-place, status controlled via pill toggles.
 */

const RecordsView = (() => {
  let _semesterId = null;
  let _allRecords = [];
  let _filtered   = [];
  let _sort  = { field: 'createdAt', dir: 'asc' };
  let _page  = 1;
  const PER  = 30;

  /* ── Mount ──────────────────────────────────── */
  function mount(semesterId, container) {
    _semesterId = semesterId;
    _page = 1;
    container.innerHTML = '';
    container.appendChild(_buildShell());
    refresh();
  }

  function refresh() {
    _allRecords = Storage.getRecords(_semesterId);
    _applyFilter();
  }

  /* ── Shell (static chrome) ──────────────────── */
  function _buildShell() {
    const wrap = document.createElement('div');

    /* Page header */
    const sem = Storage.getSemesters().find(s => s.id === _semesterId);
    const ph  = document.createElement('div');
    ph.className = 'page-header';
    ph.innerHTML = `<div class="page-header-left"><h2>${_esc(sem?.label ?? 'Учёт')}</h2><p class="mt-sm">Нажмите на ячейку для редактирования</p></div>`;
    const addBtn = UI.Button({ text: '+ Добавить строку', variant: 'primary', onClick: _addBlankRow });
    ph.appendChild(addBtn);
    wrap.appendChild(ph);

    /* Filter bar */
    const fb = document.createElement('div');
    fb.className = 'filter-bar';
    fb.id = 'rec-fb';

    const sw = document.createElement('div');
    sw.className = 'search-wrap';
    sw.innerHTML = '<span class="search-icon">⌕</span>';
    const si = UI.Input({ placeholder: 'Поиск…' });
    si.id = 'rec-search';
    si.addEventListener('input', () => { _page=1; _applyFilter(); });
    sw.appendChild(si);
    fb.appendChild(sw);

    const subSel = UI.Select({ options: ['все предметы', ...Storage.getSubjects()] });
    subSel.id = 'rec-fsub'; subSel.style.width='130px';
    subSel.addEventListener('change', () => { _page=1; _applyFilter(); });
    fb.appendChild(subSel);

    const cliSel = UI.Select({ options: ['все заказчики', ...Storage.getClients()] });
    cliSel.id = 'rec-fcli'; cliSel.style.width='140px';
    cliSel.addEventListener('change', () => { _page=1; _applyFilter(); });
    fb.appendChild(cliSel);

    const stSel = UI.Select({ options: ['все статусы','закрыто','в работе','не оплачено'] });
    stSel.id = 'rec-fst'; stSel.style.width='130px';
    stSel.addEventListener('change', () => { _page=1; _applyFilter(); });
    fb.appendChild(stSel);

    wrap.appendChild(fb);

    /* Table wrapper */
    const tw = document.createElement('div');
    tw.className = 'table-wrapper'; tw.id = 'rec-table-wrap';
    wrap.appendChild(tw);

    /* Pager */
    const pg = document.createElement('div');
    pg.className = 'pagination'; pg.id = 'rec-pager';
    wrap.appendChild(pg);

    return wrap;
  }

  /* ── Filter ─────────────────────────────────── */
  function _applyFilter() {
    const q   = (document.getElementById('rec-search')?.value||'').toLowerCase();
    const sub = document.getElementById('rec-fsub')?.value||'все предметы';
    const cli = document.getElementById('rec-fcli')?.value||'все заказчики';
    const st  = document.getElementById('rec-fst')?.value||'все статусы';

    _filtered = _allRecords.filter(r => {
      if (sub !== 'все предметы'  && r.subject !== sub) return false;
      if (cli !== 'все заказчики' && r.client  !== cli) return false;
      if (st  !== 'все статусы') {
        const derived = _deriveStatus(r);
        if (st === 'закрыто'     && derived !== 'закрыто')     return false;
        if (st === 'в работе'    && derived !== 'в работе')    return false;
        if (st === 'не оплачено' && derived !== 'не оплачено') return false;
      }
      if (q && !`${r.subject} ${r.taskNum} ${r.client} ${r.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });

    _filtered = _sortRecs(_filtered);
    _renderTable();
  }

  function _sortRecs(arr) {
    return [...arr].sort((a,b) => {
      let va = a[_sort.field]??'', vb = b[_sort.field]??'';
      if (_sort.field==='price') { va=+va; vb=+vb; }
      else { va=String(va).toLowerCase(); vb=String(vb).toLowerCase(); }
      return _sort.dir==='asc' ? (va<vb?-1:va>vb?1:0) : (va>vb?-1:va<vb?1:0);
    });
  }

  /* ── Table render ───────────────────────────── */
  function _renderTable() {
    const wrap = document.getElementById('rec-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!_filtered.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Нет записей.</p></div>`;
      document.getElementById('rec-pager').innerHTML=''; return;
    }

    const pageData = _filtered.slice((_page-1)*PER, _page*PER);
    const offset   = (_page-1)*PER;

    const tbl = document.createElement('table');
    tbl.innerHTML = `
      <thead><tr>
        <th class="no-sort" style="width:2rem">#</th>
        <th data-field="subject"  style="width:80px">Предмет</th>
        <th data-field="taskNum"  style="width:70px">Задача</th>
        <th data-field="client"   style="width:130px">Заказчик</th>
        <th data-field="price"    style="width:90px;text-align:right">Цена</th>
        <th data-field="doneDate" style="width:100px">Выполнено</th>
        <th data-field="paidDate" style="width:100px">Оплачено</th>
        <th class="no-sort"       style="width:110px">Статус</th>
        <th data-field="notes">Заметки</th>
        <th class="no-sort"       style="width:36px"></th>
      </tr></thead>`;

    /* Sort header clicks */
    tbl.querySelectorAll('thead th[data-field]').forEach(th => {
      UI.setSortHeader(th, th.dataset.field, _sort);
      th.addEventListener('click', () => {
        _sort = _sort.field===th.dataset.field
          ? { field:_sort.field, dir:_sort.dir==='asc'?'desc':'asc' }
          : { field:th.dataset.field, dir:'asc' };
        _applyFilter();
      });
    });

    const tbody = document.createElement('tbody');
    pageData.forEach((rec, i) => {
      tbody.appendChild(_buildRow(rec, offset+i+1));
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    UI.renderPagination(document.getElementById('rec-pager'), {
      total: _filtered.length, page: _page, perPage: PER,
      onChange: p => { _page=p; _renderTable(); }
    });
  }

  /* ── Row builder ────────────────────────────── */
  function _buildRow(rec, rowNum) {
    const tr = document.createElement('tr');
    tr.dataset.id = rec.id;

    /* # */
    const tdNum = document.createElement('td');
    tdNum.className = 'accent-muted'; tdNum.style.fontSize='0.72rem';
    tdNum.textContent = rowNum;
    tr.appendChild(tdNum);

    /* Editable text cells */
    tr.appendChild(_inlineTextCell(rec, 'subject', { color:'var(--accent-blue)', fontWeight:'600', datalistKey:'subjects' }));
    tr.appendChild(_inlineTextCell(rec, 'taskNum',  {}));
    tr.appendChild(_inlineTextCell(rec, 'client',   { fontWeight:'500', datalistKey:'clients' }));

    /* Price */
    const tdPrice = _inlineNumberCell(rec, 'price');
    tdPrice.style.textAlign='right'; tdPrice.style.color='var(--accent-green)'; tdPrice.style.fontWeight='600';
    tr.appendChild(tdPrice);

    /* Done date */
    tr.appendChild(_inlineDateCell(rec, 'doneDate'));

    /* Paid date */
    tr.appendChild(_inlineDateCell(rec, 'paidDate'));

    /* Status pills */
    tr.appendChild(_statusCell(rec));

    /* Notes */
    tr.appendChild(_inlineTextCell(rec, 'notes', { muted:true, maxWidth:'180px' }));

    /* Delete */
    const tdDel = document.createElement('td');
    const delBtn = UI.Button({ icon:'✕', variant:'danger', size:'sm', title:'Удалить', onClick:()=>_deleteRow(rec.id) });
    delBtn.style.opacity='0';
    tr.addEventListener('mouseenter', ()=>delBtn.style.opacity='1');
    tr.addEventListener('mouseleave', ()=>delBtn.style.opacity='0');
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    return tr;
  }

  /* ── Inline cell types ──────────────────────── */

  function _inlineTextCell(rec, field, { color, fontWeight, muted, maxWidth, datalistKey } = {}) {
    const td = document.createElement('td');
    td.className = 'editable' + (muted?' accent-muted':'');
    if (maxWidth) { td.style.maxWidth=maxWidth; td.style.overflow='hidden'; td.style.textOverflow='ellipsis'; td.style.whiteSpace='nowrap'; }
    if (color)      td.style.color      = color;
    if (fontWeight) td.style.fontWeight = fontWeight;

    const span = document.createElement('span');
    span.textContent = rec[field] || '';
    if (rec[field] && maxWidth) td.title = rec[field];
    td.appendChild(span);

    td.addEventListener('click', () => _activateTextInput(td, span, rec, field, datalistKey));
    return td;
  }

  function _activateTextInput(td, span, rec, field, datalistKey) {
    if (td.querySelector('.cell-input')) return; // already editing
    const inp = document.createElement('input');
    inp.className = 'cell-input';
    inp.value = rec[field] || '';

    /* Datalist */
    if (datalistKey) {
      const dlId = 'dl-inline-' + datalistKey;
      let dl = document.getElementById(dlId);
      if (!dl) {
        dl = document.createElement('datalist'); dl.id = dlId;
        document.body.appendChild(dl);
      }
      dl.innerHTML = '';
      const list = datalistKey==='subjects' ? Storage.getSubjects() : Storage.getClients();
      list.forEach(v => { const o=document.createElement('option'); o.value=v; dl.appendChild(o); });
      inp.setAttribute('list', dlId);
    }

    td.innerHTML = ''; td.appendChild(inp);
    inp.focus(); inp.select();

    const commit = () => {
      const val = inp.value.trim();
      Storage.updateRecord(rec.id, { [field]: val });
      rec[field] = val;
      span.textContent = val;
      td.innerHTML = ''; td.appendChild(span);
      if (field==='subject'||field==='client') {
        // refresh filters without full re-render
        _rebuildFilters();
      }
    };

    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key==='Enter')  { inp.blur(); }
      if (e.key==='Escape') { td.innerHTML=''; td.appendChild(span); }
    });
  }

  function _inlineNumberCell(rec, field) {
    const td = document.createElement('td');
    td.className = 'editable';

    const span = document.createElement('span');
    span.textContent = rec[field] ? rec[field]+' ₴' : '—';
    td.appendChild(span);

    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0';
      inp.className = 'cell-input'; inp.style.textAlign='right'; inp.style.width='70px';
      inp.value = rec[field] || '';
      td.innerHTML=''; td.appendChild(inp);
      inp.focus(); inp.select();

      const commit = () => {
        const val = +inp.value || 0;
        Storage.updateRecord(rec.id, { [field]: val });
        rec[field] = val;
        span.textContent = val ? val+' ₴' : '—';
        td.innerHTML=''; td.appendChild(span);
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', e => { if(e.key==='Enter') inp.blur(); if(e.key==='Escape'){td.innerHTML='';td.appendChild(span);} });
    });
    return td;
  }

  function _inlineDateCell(rec, field) {
    const td = document.createElement('td');
    td.className = 'editable accent-muted';

    const span = document.createElement('span');
    span.textContent = _fmtDate(rec[field]);
    td.appendChild(span);

    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const inp = document.createElement('input');
      inp.type='date'; inp.className='cell-input'; inp.style.width='130px';
      inp.value = rec[field] || '';
      td.innerHTML=''; td.appendChild(inp);
      inp.focus();

      const commit = () => {
        const val = inp.value;
        Storage.updateRecord(rec.id, { [field]: val });
        rec[field] = val;
        span.textContent = _fmtDate(val);
        td.innerHTML=''; td.appendChild(span);
        /* update status pill in same row */
        const statusTd = td.parentElement?.querySelector('.status-pair')?.parentElement;
        if (statusTd) _refreshStatusCell(statusTd, rec);
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', e=>{ if(e.key==='Escape'){td.innerHTML='';td.appendChild(span);} });
    });
    return td;
  }

  /* ── Status pills ───────────────────────────── */

  function _statusCell(rec) {
    const td = document.createElement('td');
    td.appendChild(_buildStatusPair(rec));
    return td;
  }

  function _buildStatusPair(rec) {
    const pair = document.createElement('div');
    pair.className = 'status-pair';

    const donePill = document.createElement('span');
    const paidPill = document.createElement('span');

    const update = () => {
      const done = !!rec.doneDate;
      const paid = !!rec.paidDate;
      donePill.className = 'status-pill ' + (done ? 'pill-done-on' : 'pill-done-off');
      donePill.textContent = done ? '✓ выпол' : '○ выпол';
      donePill.title = done ? 'Выполнено: '+_fmtDate(rec.doneDate) : 'Не выполнено — нажмите чтобы отметить';
      paidPill.className = 'status-pill ' + (paid ? 'pill-paid-on' : 'pill-paid-off');
      paidPill.textContent = paid ? '✓ оплач' : '○ оплач';
      paidPill.title = paid ? 'Оплачено: '+_fmtDate(rec.paidDate) : 'Не оплачено — нажмите чтобы отметить';
    };

    donePill.addEventListener('click', () => {
      if (!rec.doneDate) {
        // set today's date
        rec.doneDate = _today();
        Storage.updateRecord(rec.id, { doneDate: rec.doneDate });
        /* also update the date cell in the same row */
        _refreshDateCell(donePill, rec, 'doneDate');
      } else {
        // already set — show date picker in a small popup to allow edit/clear
        _dateEditPopup(donePill, rec, 'doneDate', update);
        return;
      }
      update();
    });

    paidPill.addEventListener('click', () => {
      if (!rec.paidDate) {
        rec.paidDate = _today();
        Storage.updateRecord(rec.id, { paidDate: rec.paidDate });
        _refreshDateCell(paidPill, rec, 'paidDate');
      } else {
        _dateEditPopup(paidPill, rec, 'paidDate', update);
        return;
      }
      update();
    });

    update();
    pair.appendChild(donePill);
    pair.appendChild(paidPill);
    return pair;
  }

  function _refreshStatusCell(td, rec) {
    td.innerHTML=''; td.appendChild(_buildStatusPair(rec));
  }

  function _refreshDateCell(pilEl, rec, field) {
    /* Find the date td in the same row and update its text */
    const row = pilEl.closest('tr');
    if (!row) return;
    const fieldIndex = field==='doneDate' ? 5 : 6;
    const dateTd = row.cells[fieldIndex];
    if (!dateTd) return;
    const span = dateTd.querySelector('span');
    if (span) span.textContent = _fmtDate(rec[field]);
    else dateTd.textContent = _fmtDate(rec[field]);
  }

  /* Mini popup to change/clear an already-set date */
  function _dateEditPopup(anchorEl, rec, field, onUpdate) {
    const existing = document.getElementById('date-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'date-popup';
    popup.style.cssText = `
      position:fixed; z-index:9100;
      background:var(--bg-card); border:1px solid var(--border);
      border-radius:6px; padding:0.75rem; box-shadow:0 8px 24px rgba(0,0,0,0.4);
      display:flex; flex-direction:column; gap:0.5rem; min-width:180px;`;

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted)';
    label.textContent = field==='doneDate' ? 'Дата выполнения' : 'Дата оплаты';
    popup.appendChild(label);

    const inp = document.createElement('input');
    inp.type='date'; inp.className='cell-input'; inp.value=rec[field]||'';
    popup.appendChild(inp);

    const row = document.createElement('div');
    row.style.cssText='display:flex;gap:0.4rem;justify-content:space-between';
    const clearBtn = UI.Button({ text:'Очистить', variant:'danger', size:'sm', onClick:()=>{
      rec[field]=''; Storage.updateRecord(rec.id,{[field]:''});
      _refreshDateCell(anchorEl,rec,field); onUpdate(); popup.remove();
    }});
    const okBtn = UI.Button({ text:'OK', variant:'primary', size:'sm', onClick:()=>{
      rec[field]=inp.value; Storage.updateRecord(rec.id,{[field]:inp.value});
      _refreshDateCell(anchorEl,rec,field); onUpdate(); popup.remove();
    }});
    row.appendChild(clearBtn); row.appendChild(okBtn);
    popup.appendChild(row);

    /* Position near anchor */
    document.body.appendChild(popup);
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top  = Math.min(rect.bottom+4, window.innerHeight-180)+'px';
    popup.style.left = Math.min(rect.left, window.innerWidth-200)+'px';

    inp.focus();
    const close = e => { if(!popup.contains(e.target)&&e.target!==anchorEl){ popup.remove(); document.removeEventListener('mousedown',close); } };
    setTimeout(()=>document.addEventListener('mousedown',close),0);
  }

  /* ── Add blank row ──────────────────────────── */
  function _addBlankRow() {
    const rec = Storage.addRecord({
      semesterId: _semesterId,
      subject:'', taskNum:'', client:'', price:0,
      doneDate:'', paidDate:'', notes:''
    });
    _allRecords = Storage.getRecords(_semesterId);
    _applyFilter();
    /* Focus first editable cell of new row */
    requestAnimationFrame(() => {
      const tr = document.querySelector(`tr[data-id="${rec.id}"]`);
      tr?.cells[1]?.click();
      tr?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
  }

  /* ── Delete row ─────────────────────────────── */
  async function _deleteRow(id) {
    const ok = await UI.confirmDialog({ message:'Удалить эту строку навсегда?', confirmText:'Удалить' });
    if (!ok) return;
    Storage.deleteRecord(id); UI.toast('Удалено','warn');
    _allRecords = Storage.getRecords(_semesterId);
    _applyFilter();
  }

  /* ── Helpers ────────────────────────────────── */

  function _deriveStatus(rec) {
    const done = !!rec.doneDate;
    const paid = !!rec.paidDate;
    if (done && paid)   return 'закрыто';
    if (paid && !done)  return 'не оплачено'; // оплачено но не выполнено — редкий кейс
    if (done && !paid)  return 'не оплачено';
    return 'в работе';
  }

  function _rebuildFilters() {
    /* Rebuild subject/client dropdowns without re-rendering whole table */
    const subSel = document.getElementById('rec-fsub');
    const cliSel = document.getElementById('rec-fcli');
    if (subSel) {
      const cur = subSel.value;
      subSel.innerHTML='';
      ['все предметы',...Storage.getSubjects()].forEach(v=>{ const o=document.createElement('option');o.value=v;o.textContent=v;if(v===cur)o.selected=true;subSel.appendChild(o); });
    }
    if (cliSel) {
      const cur = cliSel.value;
      cliSel.innerHTML='';
      ['все заказчики',...Storage.getClients()].forEach(v=>{ const o=document.createElement('option');o.value=v;o.textContent=v;if(v===cur)o.selected=true;cliSel.appendChild(o); });
    }
  }

  function _fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
    catch{ return d; }
  }

  function _today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { mount, refresh };
})();

window.RecordsView = RecordsView;
