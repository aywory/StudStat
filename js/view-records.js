/**
 * view-records.js
 * Full CRUD table for work records within a semester.
 */

const RecordsView = (() => {
  let _semesterId = null;
  let _allRecords = [];
  let _filtered   = [];
  let _sort  = { field: 'id_seq', dir: 'asc' };
  let _page  = 1;
  const PER  = 25;

  const STATUSES = ['закрыто', 'о+ в-', 'о- в-', 'о- в+'];

  /* ── Mount ─────────────────────────────── */
  function mount(semesterId, container) {
    _semesterId = semesterId;
    _page = 1;
    container.innerHTML = '';
    container.appendChild(_buildView());
    refresh();
  }

  function refresh() {
    _allRecords = Storage.getRecords(_semesterId);
    _applyFilter();
  }

  /* ── Build DOM skeleton ────────────────── */
  function _buildView() {
    const wrap = document.createElement('div');

    /* page header */
    const ph = document.createElement('div');
    ph.className = 'page-header';
    const sems = Storage.getSemesters();
    const sem  = sems.find(s => s.id === _semesterId);
    ph.innerHTML = `
      <div class="page-header-left">
        <h2>${sem ? sem.label : 'Учёт работ'}</h2>
        <p class="mt-sm">Список всех выполненных работ</p>
      </div>`;
    const addBtn = UI.Button({ text: '+ Добавить', variant: 'primary', onClick: () => _openForm(null) });
    ph.appendChild(addBtn);
    wrap.appendChild(ph);

    /* filter bar */
    const fb = document.createElement('div');
    fb.className = 'filter-bar';
    fb.id = 'rec-filter-bar';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'search-wrap';
    searchWrap.innerHTML = '<span class="search-icon">⌕</span>';
    const searchInp = UI.Input({ placeholder: 'Поиск по предмету, задаче, заказчику…', className: '' });
    searchInp.id = 'rec-search';
    searchInp.addEventListener('input', () => { _page = 1; _applyFilter(); });
    searchWrap.appendChild(searchInp);
    fb.appendChild(searchWrap);

    /* subject filter */
    const subjects = ['все', ...Storage.getSubjects()];
    const subSel = UI.Select({ options: subjects, className: '' });
    subSel.id = 'rec-filter-sub';
    subSel.style.width = '130px';
    subSel.addEventListener('change', () => { _page = 1; _applyFilter(); });
    fb.appendChild(subSel);

    /* client filter */
    const clients = ['все', ...Storage.getClients()];
    const cliSel = UI.Select({ options: clients, className: '' });
    cliSel.id = 'rec-filter-cli';
    cliSel.style.width = '140px';
    cliSel.addEventListener('change', () => { _page = 1; _applyFilter(); });
    fb.appendChild(cliSel);

    /* status filter */
    const statusSel = UI.Select({ options: ['все', 'закрыто', 'о+ в-', 'о- в-'], className: '' });
    statusSel.id = 'rec-filter-status';
    statusSel.style.width = '120px';
    statusSel.addEventListener('change', () => { _page = 1; _applyFilter(); });
    fb.appendChild(statusSel);

    wrap.appendChild(fb);

    /* table */
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrapper';
    tableWrap.id = 'rec-table-wrap';
    wrap.appendChild(tableWrap);

    /* pagination */
    const pager = document.createElement('div');
    pager.className = 'pagination';
    pager.id = 'rec-pager';
    wrap.appendChild(pager);

    return wrap;
  }

  /* ── Filter + render ───────────────────── */
  function _applyFilter() {
    const q      = (document.getElementById('rec-search')?.value || '').toLowerCase();
    const sub    = document.getElementById('rec-filter-sub')?.value    || 'все';
    const cli    = document.getElementById('rec-filter-cli')?.value    || 'все';
    const status = document.getElementById('rec-filter-status')?.value || 'все';

    _filtered = _allRecords.filter(r => {
      if (sub    !== 'все' && r.subject !== sub)    return false;
      if (cli    !== 'все' && r.client  !== cli)    return false;
      if (status !== 'все' && r.status  !== status) return false;
      if (q && !`${r.subject} ${r.taskNum} ${r.client} ${r.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });

    _filtered = _sortRecords(_filtered);
    _renderTable();
  }

  function _sortRecords(arr) {
    return [...arr].sort((a, b) => {
      let va = a[_sort.field] ?? 0;
      let vb = b[_sort.field] ?? 0;
      if (_sort.field === 'price') { va = +va; vb = +vb; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return _sort.dir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });
  }

  function _renderTable() {
    const wrap = document.getElementById('rec-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!_filtered.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Нет записей. Добавьте работу.</p></div>`;
      document.getElementById('rec-pager').innerHTML = '';
      return;
    }

    const pageData = _filtered.slice((_page-1)*PER, _page*PER);

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th data-field="seq" class="no-sort">#</th>
          <th data-field="subject">Предмет</th>
          <th data-field="taskNum">Задача</th>
          <th data-field="client">Заказчик</th>
          <th data-field="price" style="text-align:right">Цена</th>
          <th data-field="doneDate">Выполнено</th>
          <th data-field="paidDate">Оплачено</th>
          <th data-field="status">Статус</th>
          <th data-field="notes">Заметки</th>
          <th class="no-sort"></th>
        </tr>
      </thead>`;

    /* sort headers */
    table.querySelectorAll('thead th[data-field]').forEach(th => {
      UI.setSortHeader(th, th.dataset.field, _sort);
      th.addEventListener('click', () => {
        const f = th.dataset.field;
        if (_sort.field === f) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
        else _sort = { field: f, dir: 'asc' };
        _applyFilter();
      });
    });

    const tbody = document.createElement('tbody');
    const offset = (_page-1)*PER;
    pageData.forEach((rec, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="accent-muted" style="font-size:0.72rem">${offset+i+1}</td>
        <td><span style="font-weight:600;color:var(--accent-blue)">${_esc(rec.subject)}</span></td>
        <td>${_esc(rec.taskNum)}</td>
        <td style="font-weight:500">${_esc(rec.client)}</td>
        <td class="td-num" style="color:var(--accent-green);font-weight:600">${rec.price ? rec.price + ' ₴' : '—'}</td>
        <td class="accent-muted">${_fmtDate(rec.doneDate)}</td>
        <td class="accent-muted">${_fmtDate(rec.paidDate)}</td>
        <td></td>
        <td style="max-width:140px" class="truncate accent-muted" title="${_esc(rec.notes)}">${_esc(rec.notes)}</td>
        <td></td>`;

      /* status badge */
      tr.cells[7].appendChild(UI.statusBadge(rec.status));

      /* actions */
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      actions.appendChild(UI.Button({ icon: '✎', variant: 'ghost', size: 'sm', title: 'Изменить', onClick: () => _openForm(rec) }));
      actions.appendChild(UI.Button({ icon: '✕', variant: 'danger', size: 'sm', title: 'Удалить',  onClick: () => _deleteRec(rec.id) }));
      tr.cells[9].appendChild(actions);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    /* pager */
    UI.renderPagination(document.getElementById('rec-pager'), {
      total: _filtered.length, page: _page, perPage: PER,
      onChange: p => { _page = p; _renderTable(); }
    });
  }

  /* ── Add / Edit Form ───────────────────── */
  function _openForm(rec) {
    const isEdit = !!rec;
    const clients  = Storage.getClients();
    const subjects = Storage.getSubjects();

    /* datalists */
    const dlClients = document.createElement('datalist'); dlClients.id = 'dl-clients';
    clients.forEach(c => { const o = document.createElement('option'); o.value = c; dlClients.appendChild(o); });
    const dlSubjects = document.createElement('datalist'); dlSubjects.id = 'dl-subjects';
    subjects.forEach(s => { const o = document.createElement('option'); o.value = s; dlSubjects.appendChild(o); });

    const subjectInp = UI.Input({ value: rec?.subject || '', placeholder: 'ап, чм, дм…', list: 'dl-subjects' });
    const taskInp    = UI.Input({ value: rec?.taskNum || '', placeholder: '1, экз, отч…' });
    const clientInp  = UI.Input({ value: rec?.client  || '', placeholder: 'Заказчик', list: 'dl-clients' });
    const priceInp   = UI.Input({ type: 'number', value: rec?.price || '', placeholder: '0' });
    const doneDateInp= UI.Input({ type: 'date', value: rec?.doneDate || '' });
    const paidDateInp= UI.Input({ type: 'date', value: rec?.paidDate || '' });
    const statusSel  = UI.Select({ options: STATUSES, value: rec?.status || 'закрыто' });
    const notesInp   = UI.Input({ value: rec?.notes || '', placeholder: 'Заметки (необязательно)' });

    const body = document.createElement('div');
    body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '1rem';
    body.appendChild(dlClients); body.appendChild(dlSubjects);

    const row1 = document.createElement('div'); row1.className = 'form-row';
    row1.appendChild(UI.FormGroup({ label: 'Предмет *', child: subjectInp }));
    row1.appendChild(UI.FormGroup({ label: 'Задача *',  child: taskInp }));
    body.appendChild(row1);

    const row2 = document.createElement('div'); row2.className = 'form-row';
    row2.appendChild(UI.FormGroup({ label: 'Заказчик *', child: clientInp }));
    row2.appendChild(UI.FormGroup({ label: 'Цена (₴)',   child: priceInp }));
    body.appendChild(row2);

    const row3 = document.createElement('div'); row3.className = 'form-row';
    row3.appendChild(UI.FormGroup({ label: 'Дата выполнения', child: doneDateInp }));
    row3.appendChild(UI.FormGroup({ label: 'Дата оплаты',     child: paidDateInp }));
    body.appendChild(row3);

    const row4 = document.createElement('div'); row4.className = 'form-row';
    row4.appendChild(UI.FormGroup({ label: 'Статус', child: statusSel }));
    row4.appendChild(UI.FormGroup({ label: 'Заметки', child: notesInp }));
    body.appendChild(row4);

    const cancel = UI.Button({ text: 'Отмена',  variant: 'ghost',   onClick: () => UI.closeModal() });
    const save   = UI.Button({ text: isEdit ? 'Сохранить' : 'Добавить', variant: 'primary', onClick: () => {
      const sub = subjectInp.value.trim();
      const task = taskInp.value.trim();
      const cli  = clientInp.value.trim();
      if (!sub || !task || !cli) { UI.toast('Заполните предмет, задачу и заказчика', 'error'); return; }
      const data = {
        semesterId: _semesterId,
        subject: sub, taskNum: task, client: cli,
        price: +priceInp.value || 0,
        doneDate: doneDateInp.value, paidDate: paidDateInp.value,
        status: statusSel.value, notes: notesInp.value.trim()
      };
      if (isEdit) { Storage.updateRecord(rec.id, data); UI.toast('Запись обновлена'); }
      else        { Storage.addRecord(data);             UI.toast('Запись добавлена', 'success'); }
      UI.closeModal();
      refresh();
      _applyFilter();
    }});

    UI.openModal({ title: isEdit ? 'Изменить запись' : 'Новая запись', bodyEl: body, footerActions: [cancel, save] });
  }

  async function _deleteRec(id) {
    const ok = await UI.confirmDialog({ message: 'Удалить эту запись навсегда?', confirmText: 'Удалить' });
    if (!ok) return;
    Storage.deleteRecord(id);
    UI.toast('Запись удалена', 'warn');
    refresh();
    _applyFilter();
  }

  function _fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }); }
    catch { return d; }
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { mount, refresh };
})();

window.RecordsView = RecordsView;
