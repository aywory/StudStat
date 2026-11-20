// Semester records and inline editing.

const RecordsView = (() => {
  let _semId = null;
  let _recs = [];
  let _filt = [];
  let _sort = { f: 'createdAt', d: 'asc' };
  let _page = 1;
  const PER = 30;

  // Column index map for Tab navigation
  const EDITABLE_COLS = [1, 2, 3, 4, 5, 6, 8]; // subject,taskNum,client,price,doneDate,paidDate,notes

  /* ══ Mount ══════════════════════════════════ */
  function mount(semId, container) {
    _semId = semId; _page = 1;
    container.innerHTML = '';
    container.appendChild(_shell());
    _reload();
  }

  function _reload() {
    _recs = Storage.getRecords(_semId);
    _filter();
  }

  /* ══ Shell ══════════════════════════════════ */
  function _shell() {
    const w = document.createElement('div');
    w.className = 'records-page';
    const sem = Storage.getSemesters().find(s => s.id === _semId);
    const ph = document.createElement('div'); ph.className = 'page-header';
    const title = document.createElement('h2');
    title.textContent = sem ? `Семестр «${sem.label}»` : 'Семестр';
    ph.appendChild(title);
    w.appendChild(ph);

    /* Filter bar */
    const fb = document.createElement('div'); fb.className = 'filter-bar';
    const sw = document.createElement('div'); sw.className = 'search-wrap';
    sw.innerHTML = '<span class="search-icon">' + UI.Icon('search') + '</span>';
    const si = UI.Input({ placeholder: 'Поиск…' }); si.id = 'rs';
    si.addEventListener('input', () => { _page = 1; _filter(); }); sw.appendChild(si); fb.appendChild(sw);

    const ss = UI.Select({ options: ['все предметы', ...Storage.getSubjects()] }); ss.id = 'rsub'; ss.style.width = '130px';
    ss.addEventListener('change', () => { _page = 1; _filter(); }); fb.appendChild(ss);
    const cs = UI.Select({ options: ['все заказчики', ...Storage.getClients()] }); cs.id = 'rcli'; cs.style.width = '140px';
    cs.addEventListener('change', () => { _page = 1; _filter(); }); fb.appendChild(cs);
    const stSel = UI.Select({ options: ['все', 'закрыто', 'не закрыто', 'не оплачено'] }); stSel.id = 'rst'; stSel.style.width = '130px';
    stSel.addEventListener('change', () => { _page = 1; _filter(); }); fb.appendChild(stSel);

    const tw = document.createElement('div'); tw.className = 'records-scroll'; tw.id = 'rtw'; w.appendChild(tw);
    const pg = document.createElement('div'); pg.className = 'pagination'; pg.id = 'rpg'; w.appendChild(pg);
    w.appendChild(fb);
    return w;
  }

  /* ══ Filter ══════════════════════════════════ */
  function _filter({ reveal } = {}) {
    const q = (document.getElementById('rs')?.value || '').toLowerCase();
    const sub = document.getElementById('rsub')?.value || 'все предметы';
    const cli = document.getElementById('rcli')?.value || 'все заказчики';
    const st = document.getElementById('rst')?.value || 'все';

    _filt = _recs.filter(r => {
      if (sub !== 'все предметы' && r.subject !== sub) return false;
      if (cli !== 'все заказчики' && r.client !== cli) return false;
      if (st === 'закрыто' && !(r.doneDate && r.paidDate)) return false;
      if (st === 'не закрыто' && (r.doneDate && r.paidDate)) return false;
      if (st === 'не оплачено' && !!r.paidDate) return false;
      if (q && !`${r.subject} ${r.taskNum} ${r.client} ${r.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    _filt = [..._filt].sort((a, b) => {
      let va = a[_sort.f] ?? '', vb = b[_sort.f] ?? '';
      if (_sort.f === 'price') { va = +va; vb = +vb; } else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return _sort.d === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });
    if (reveal) {
      const index = _filt.findIndex(rec => rec.id === reveal);
      if (index === -1) {
        document.getElementById('rs').value = '';
        ['rsub', 'rcli', 'rst'].forEach(id => { document.getElementById(id).selectedIndex = 0; });
        _filter({ reveal });
        return;
      }
      _page = Math.floor(index / PER) + 1;
    }
    _renderTable();
  }

  /* ══ Table render ════════════════════════════ */
  function _renderTable() {
    const viewport = document.getElementById('rtw');
    if (!viewport) return;
    _page = Math.min(_page, Math.max(1, Math.ceil(_filt.length / PER)));
    const offset = (_page - 1) * PER;
    const canvas = document.createElement('div');
    canvas.className = 'records-canvas';

    const table = document.createElement('table');
    table.className = 'records-table';
    table.innerHTML = `<thead><tr>
      <th scope="col" class="no-sort" style="width:3rem">#</th>
      <th scope="col" data-f="subject" style="width:11%">Предмет</th>
      <th scope="col" data-f="taskNum" style="width:9%">Задача</th>
      <th scope="col" data-f="client" style="width:14%">Заказчик</th>
      <th scope="col" data-f="price" class="td-num" style="width:9%">Цена</th>
      <th scope="col" data-f="doneDate" style="width:13%">Выполнено</th>
      <th scope="col" data-f="paidDate" style="width:13%">Оплачено</th>
      <th scope="col" class="no-sort" style="width:15%">Статус</th>
      <th scope="col" data-f="notes">Заметки</th>
    </tr><tr class="records-totals">
      <td colspan="4" data-total-count></td>
      <td class="td-num" data-total-price></td>
      <td colspan="2" class="text-right">Оплачено</td>
      <td class="td-num" data-total-paid></td>
      <td></td>
    </tr></thead>`;
    table.querySelectorAll('th[data-f]').forEach(th => {
      const field = th.dataset.f;
      const active = _sort.f === field;
      const icon = active ? (_sort.d === 'asc' ? 'up' : 'down') : 'sort';
      if (active) th.setAttribute('aria-sort', _sort.d === 'asc' ? 'ascending' : 'descending');
      const button = UI.Button({
        text: th.textContent, className: 'sort-button',
        onClick: event => {
          _sort = { f: field, d: active && _sort.d === 'asc' ? 'desc' : 'asc' };
          _filter();
          if (event.detail === 0) viewport.querySelector(`th[data-f="${field}"] button`).focus();
        }
      });
      button.insertAdjacentHTML('beforeend', UI.Icon(icon));
      th.replaceChildren(button);
    });

    const body = table.createTBody();
    const actions = document.createElement('div');
    actions.className = 'record-actions-layer';
    const actionPositions = [];
    _filt.slice(offset, offset + PER).forEach((rec, index) => {
      const row = _row(rec, offset + index + 1);
      body.appendChild(row);
      actionPositions.push(_addRowActions(actions, row, rec));
    });
    const firstCell = body.rows[0]?.cells[EDITABLE_COLS[0]];
    if (firstCell) {
      firstCell.tabIndex = 0;
      firstCell.addEventListener('focus', () => firstCell.click());
    }
    const addRow = body.insertRow();
    addRow.className = 'new-record-row';
    const addCell = addRow.insertCell();
    addCell.colSpan = table.rows[0].cells.length;
    addCell.appendChild(UI.Button({
      text: 'Новая строка', icon: UI.Icon('plus'), className: 'new-record-button', onClick: _addRow
    }));
    addCell.firstChild.addEventListener('keydown', event => {
      const lastRecord = addRow.previousElementSibling;
      if (event.key !== 'Tab' || !event.shiftKey || !lastRecord) return;
      event.preventDefault();
      lastRecord.cells[EDITABLE_COLS.at(-1)].click();
    });
    canvas.append(table, actions);
    viewport.replaceChildren(canvas);
    actionPositions.forEach(position => position());
    _updateTotals();
    UI.renderPagination(document.getElementById('rpg'), {
      total: _filt.length, page: _page, perPage: PER,
      onChange: page => { _page = page; viewport.scrollTop = 0; _renderTable(); }
    });
  }

  function _updateTotals() {
    const row = document.querySelector('#rtw .records-totals');
    if (!row) return;
    let price = 0;
    let paid = 0;
    _filt.forEach(rec => {
      const amount = Number(rec.price) || 0;
      price += amount;
      if (rec.paidDate) paid += amount;
    });
    row.querySelector('[data-total-count]').textContent = `Итого · ${_filt.length}`;
    row.querySelector('[data-total-price]').textContent = _formatPrice(price);
    row.querySelector('[data-total-paid]').textContent = _formatPrice(paid);
  }

  function _addRowActions(layer, row, rec) {
    const group = document.createElement('div');
    group.className = 'record-actions';
    group.append(
      UI.Button({ icon: UI.Icon('copy'), title: 'Дублировать строку', onClick: () => _dupRow(rec) }),
      UI.Button({ icon: UI.Icon('trash'), variant: 'danger', title: 'Удалить строку', onClick: () => _del(rec.id) })
    );
    layer.appendChild(group);

    const position = () => {
      const bounds = row.getBoundingClientRect();
      group.style.top = `${bounds.top - layer.getBoundingClientRect().top}px`;
      group.style.height = `${bounds.height}px`;
    };
    const show = () => { position(); group.classList.add('visible'); };
    const hide = event => {
      if (!row.contains(event.relatedTarget) && !group.contains(event.relatedTarget)) group.classList.remove('visible');
    };
    row.addEventListener('mouseenter', show);
    row.addEventListener('mouseleave', hide);
    group.addEventListener('mouseleave', hide);
    group.addEventListener('focusin', position);
    return position;
  }

  /* ══ Row builder ═════════════════════════════ */
  function _row(rec, n) {
    const tr = document.createElement('tr'); tr.dataset.id = rec.id;

    const tn = document.createElement('td'); tn.className = 'accent-muted'; tn.style.fontSize = '.72rem'; tn.textContent = n; tr.appendChild(tn);

    tr.appendChild(_txtCell(rec, 'subject', { color: 'var(--accent-blue)', fw: '600', dl: 'subjects' }));
    tr.appendChild(_txtCell(rec, 'taskNum', {}));
    tr.appendChild(_txtCell(rec, 'client', { fw: '500', dl: 'clients' }));

    const tp = _numCell(rec, 'price'); tp.style.textAlign = 'right'; tp.style.color = 'var(--accent-green)'; tp.style.fontWeight = '600'; tr.appendChild(tp);
    tr.appendChild(_dateCell(rec, 'doneDate'));
    tr.appendChild(_dateCell(rec, 'paidDate'));

    const ts = document.createElement('td'); ts.appendChild(_pillPair(rec)); tr.appendChild(ts);
    tr.appendChild(_txtCell(rec, 'notes', { muted: true, tooltip: true }));

    /* Row actions: duplicate + delete */
    return tr;
  }

  /* ══ Cell factories ══════════════════════════ */
  function _txtCell(rec, field, { color, fw, muted, tooltip, dl } = {}) {
    const td = document.createElement('td');
    td.className = 'editable' + (muted ? ' accent-muted' : '');
    if (color) td.style.color = color;
    if (fw) td.style.fontWeight = fw;
    const display = document.createElement('span');
    display.textContent = rec[field] || '';
    td.appendChild(display);
    if (tooltip) td.title = display.textContent;
    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const input = document.createElement('input');
      input.value = rec[field] || '';
      if (dl) {
        const id = 'dl-' + dl;
        let list = document.getElementById(id);
        if (!list) {
          list = document.createElement('datalist');
          list.id = id;
          document.body.appendChild(list);
        }
        const values = dl === 'subjects' ? Storage.getSubjects() : Storage.getClients();
        list.replaceChildren(...values.map(value => new Option(value)));
        input.setAttribute('list', id);
      }
      _editCell(td, input, [display], () => {
        const value = input.value.trim();
        _saveField(rec, field, value);
        display.textContent = value;
        if (tooltip) td.title = value;
        if (dl) _rebuildFilters();
      });
    });
    return td;
  }

  function _numCell(rec, field) {
    const td = document.createElement('td');
    td.className = 'editable td-num';
    const display = document.createElement('span');
    display.textContent = rec[field] ? _formatPrice(rec[field]) : '—';
    td.appendChild(display);
    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = 'any';
      input.value = rec[field] || '';
      _editCell(td, input, [display], () => {
        const value = Number(input.value) || 0;
        _saveField(rec, field, value);
        display.textContent = value ? _formatPrice(value) : '—';
      });
    });
    return td;
  }

  function _dateCell(rec, field) {
    const td = document.createElement('td');
    td.className = 'editable accent-muted record-date';
    const display = document.createElement('span');
    display.textContent = _fmt(rec[field]);
    const today = UI.Button({ icon: UI.Icon('today'), title: 'Отметить сегодня', className: 'today-button',
      onClick: event => {
        event.stopPropagation();
        _saveField(rec, field, _today());
        display.textContent = _fmt(rec[field]);
        today.hidden = true;
        _refreshRowPills(td, rec);
      }
    });
    today.tabIndex = -1;
    today.hidden = Boolean(rec[field]);
    td.append(display, today);
    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const input = document.createElement('input');
      input.type = 'date';
      input.value = rec[field] || '';
      _editCell(td, input, [display, today], () => {
        _saveField(rec, field, input.value);
        display.textContent = _fmt(rec[field]);
        today.hidden = Boolean(rec[field]);
        _refreshRowPills(td, rec);
      });
    });
    return td;
  }

  function _editCell(td, input, children, commit) {
    input.className = 'cell-input';
    td.replaceChildren(input);
    input.focus();
    if (input.type !== 'date') input.select();

    function finish(save) {
      input.removeEventListener('blur', blur);
      if (save) commit();
      td.replaceChildren(...children);
    }

    const blur = () => finish(true);
    input.addEventListener('blur', blur);
    input.addEventListener('keydown', event => {
      if (!['Tab', 'Enter', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      finish(event.key !== 'Escape');
      if (event.key === 'Tab') _focusNext(td, !event.shiftKey);
      if (event.key === 'Enter') _focusBelow(td);
    });
  }

  function _saveField(rec, field, value) {
    if (rec[field] === value) return;
    rec[field] = value;
    Storage.updateRecord(rec.id, { [field]: value });
    if (field === 'price' || field === 'paidDate') _updateTotals();
  }

  function _pillPair(rec) {
    const pair = document.createElement('div');
    pair.className = 'status-pair';
    const fields = ['doneDate', 'paidDate'];
    fields.forEach(field => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.field = field;
      button.addEventListener('click', () => {
        const refresh = () => {
          _refreshRowDate(button, field, rec);
          _drawPill(button, rec);
        };
        if (rec[field]) {
          _datePop(button, rec, field, refresh);
          return;
        }
        _saveField(rec, field, _today());
        refresh();
      });
      _drawPill(button, rec);
      pair.appendChild(button);
    });
    return pair;
  }

  function _drawPill(button, rec) {
    const field = button.dataset.field;
    const done = field === 'doneDate';
    const date = rec[field];
    const label = done ? 'Выполнено' : 'Оплачено';
    const action = done ? 'Отметить выполнение' : 'Отметить оплату';
    button.className = `status-pill pill-${done ? 'done' : 'paid'}-${date ? 'on' : 'off'}`;
    button.textContent = done ? 'Вып.' : 'Опл.';
    button.title = date ? `${label} ${_fmt(date)}` : action;
    button.setAttribute('aria-label', button.title);
  }

  function _refreshRowPills(cell, rec) {
    cell.closest('tr').querySelectorAll('.status-pill').forEach(button => _drawPill(button, rec));
  }

  function _refreshRowDate(pillEl, field, rec) {
    const tr = pillEl.closest('tr'); if (!tr) return;
    const idx = field === 'doneDate' ? 5 : 6;
    const sp = tr.cells[idx]?.querySelector('span');
    if (sp) sp.textContent = _fmt(rec[field]);
    const today = tr.cells[idx]?.querySelector('.today-button');
    if (today) today.hidden = Boolean(rec[field]);
  }

  function _datePop(anchor, rec, field, onDone) {
    document.getElementById('dpop')?.remove();
    const pop = document.createElement('div'); pop.id = 'dpop';
    pop.style.cssText = 'position:fixed;z-index:9200;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.75rem;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:.5rem;min-width:190px';
    const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)';
    lbl.textContent = field === 'doneDate' ? 'Дата выполнения' : 'Дата оплаты'; pop.appendChild(lbl);
    const inp = document.createElement('input'); inp.type = 'date'; inp.className = 'cell-input'; inp.value = rec[field] || ''; pop.appendChild(inp);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:.4rem';
    row.appendChild(UI.Button({
      text: 'Очистить', variant: 'danger', size: 'sm', onClick: () => {
        _saveField(rec, field, ''); _refreshRowDate(anchor, field, rec); onDone(); pop.remove();
      }
    }));
    row.appendChild(UI.Button({
      text: 'OK', variant: 'primary', size: 'sm', onClick: () => {
        _saveField(rec, field, inp.value); _refreshRowDate(anchor, field, rec); onDone(); pop.remove();
      }
    }));
    pop.appendChild(row);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 160) + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
    inp.focus();
    const close = e => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('mousedown', close); } };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  /* ══ Keyboard navigation ═════════════════════ */
  function _focusNext(cell, forward) {
    const index = EDITABLE_COLS.indexOf(cell.cellIndex);
    const column = EDITABLE_COLS[index + (forward ? 1 : -1)];
    const row = cell.parentElement;
    if (column !== undefined) {
      row.cells[column].click();
      return;
    }

    const edge = forward ? EDITABLE_COLS[0] : EDITABLE_COLS.at(-1);
    if (_focusAdjacentRow(row, edge, forward)) return;
    if (forward) document.querySelector('#rtw .new-record-button')?.focus();
    else [...document.querySelectorAll('#rtw .sort-button')].at(-1)?.focus();
  }

  function _focusBelow(cell) {
    _focusAdjacentRow(cell.parentElement, cell.cellIndex, true);
  }

  function _focusAdjacentRow(row, column, forward) {
    const adjacent = forward ? row.nextElementSibling : row.previousElementSibling;
    if (adjacent?.matches('tr[data-id]')) {
      adjacent.cells[column].click();
      return true;
    }

    const page = _page + (forward ? 1 : -1);
    if (page < 1 || page > Math.ceil(_filt.length / PER)) return false;
    const viewport = document.getElementById('rtw');
    viewport.scrollTop = 0;
    _page = page;
    _renderTable();
    const rows = viewport.querySelectorAll('tbody tr[data-id]');
    rows[forward ? 0 : rows.length - 1].cells[column].click();
    return true;
  }

  function _addRow() {
    const rec = Storage.addRecord({
      semesterId: _semId, client: '', subject: '', taskNum: '', price: 0,
      doneDate: '', paidDate: '', notes: ''
    });
    _recs = Storage.getRecords(_semId);
    _filter({ reveal: rec.id });
    const row = [...document.querySelectorAll('#rtw tr[data-id]')].find(row => row.dataset.id === rec.id);
    row.cells[EDITABLE_COLS[0]].click();
    row.scrollIntoView({ block: 'nearest' });
  }

  function _dupRow(rec) {
    const copy = { ...rec, id: undefined, createdAt: undefined };
    const newRec = Storage.addRecord({ ...copy, semesterId: _semId });
    _recs = Storage.getRecords(_semId); _filter();
    requestAnimationFrame(() => {
      const tr = document.querySelector(`tr[data-id="${newRec.id}"]`);
      tr?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    UI.toast('Строка дублирована');
  }

  async function _del(id) {
    const ok = await UI.confirmDialog({ message: 'Удалить эту строку навсегда?', confirmText: 'Удалить' });
    if (!ok) return;
    Storage.deleteRecord(id); UI.toast('Удалено', 'warn');
    _recs = Storage.getRecords(_semId); _filter();
  }

  /* ══ Helpers ════════════════════════════════ */
  function _rebuildFilters() {
    const ss = document.getElementById('rsub'), cs = document.getElementById('rcli');
    if (ss) { const c = ss.value; ss.innerHTML = '';['все предметы', ...Storage.getSubjects()].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; if (v === c) o.selected = true; ss.appendChild(o); }); }
    if (cs) { const c = cs.value; cs.innerHTML = '';['все заказчики', ...Storage.getClients()].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; if (v === c) o.selected = true; cs.appendChild(o); }); }
  }
  function _fmt(d) { if (!d) return '—'; try { return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; } }
  function _today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const priceFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  function _formatPrice(value) { return priceFormat.format(value) + ' ₴'; }

  return { mount };
})();

window.RecordsView = RecordsView;
