// Semester records and inline editing.

const RecordsView = (() => {
  let _semId = null;
  let _recs = [];
  let _filt = [];
  let _sort = { f: 'createdAt', d: 'asc' };
  let _page = 1;
  let _rowLayout;
  let _subset = null;
  const PER = 30;
  const MAX_PRICE = 99999 * 100;
  const NOTE = -1;
  const noteButtons = new WeakMap();

  // Column index map for Tab navigation
  const EDITABLE_COLS = [1, 2, 3, 4, 5, 6, NOTE];

  /* ══ Mount ══════════════════════════════════ */
  function mount(semId, container, { ids, label, focusId } = {}) {
    _semId = semId; _page = 1;
    _subset = ids ? { ids: new Set(ids), label } : null;
    container.innerHTML = '';
    container.appendChild(_shell());
    _recs = Storage.getRecords(_semId);
    _filter({ reveal: focusId });
    if (focusId) _showRow(focusId);
  }

  function unmount() {
    _rowLayout?.disconnect();
    const active = document.activeElement;
    if (active?.matches('#rtw input')) active.blur();
    document.querySelector('.note-dialog')?.remove();
  }


  /* ══ Shell ══════════════════════════════════ */
  function _shell() {
    const page = document.createElement('div');
    page.className = 'records-page';
    const semester = Storage.getSemesters().find(s => s.id === _semId);
    const title = document.createElement('h2');
    title.textContent = semester ? `Семестр «${semester.label}»` : 'Все работы';
    title.title = title.textContent;
    document.getElementById('workspace-title').appendChild(title);
    document.getElementById('workspace-filters').appendChild(_makeFilters(Boolean(semester)));

    const viewport = document.createElement('div');
    viewport.className = 'records-scroll';
    viewport.id = 'rtw';
    const pagination = document.createElement('div');
    pagination.className = 'pagination';
    pagination.id = 'rpg';
    if (_subset) {
      const context = document.createElement('div');
      context.className = 'record-report-scope';
      const caption = document.createElement('strong');
      caption.textContent = _subset.label;
      const clear = UI.Button({ text: 'Показать весь журнал', size: 'sm', onClick: () => {
        _subset = null;
        _page = 1;
        context.remove();
        _filter();
      } });
      context.append(caption, clear);
      page.appendChild(context);
    }
    page.append(viewport, pagination);
    return page;
  }

  function _makeFilters(canAdd) {
    const bar = document.createElement('div');
    bar.className = 'records-filters';
    const search = document.createElement('div');
    search.className = 'search-wrap';
    search.innerHTML = `<span class="search-icon">${UI.Icon('search')}</span>`;
    const input = UI.Input({ type: 'search', placeholder: 'Поиск по записям' });
    input.id = 'rs';
    input.setAttribute('aria-label', 'Поиск по записям');

    const details = document.createElement('details');
    details.className = 'record-filter-menu';
    const summary = document.createElement('summary');
    summary.className = 'record-filter-trigger';
    summary.setAttribute('aria-label', 'Фильтры');
    summary.innerHTML = `${UI.Icon('filter')}<span>Фильтры</span><span class="filter-count" hidden></span>`;
    const panel = document.createElement('div');
    panel.className = 'record-filter-panel';
    const fields = [
      ['rsub', 'Предмет', 'Все предметы', Storage.getSubjects()],
      ['rcli', 'Заказчик', 'Все заказчики', Storage.getClients()],
      ['rst', 'Статус', 'Все статусы', ['закрыто', 'не закрыто', 'не оплачено']]
    ];
    const selects = fields.map(([id, label, all, options]) => {
      const select = UI.Select({ options: [{ value: '', label: all }, ...options] });
      select.addEventListener('change', apply);
      panel.appendChild(UI.FormGroup({ label, child: select, id }));
      return select;
    });
    const reset = UI.Button({
      text: 'Сбросить фильтры', size: 'sm',
      onClick: () => { selects.forEach(select => { select.selectedIndex = 0; }); apply(); }
    });
    reset.disabled = true;
    panel.appendChild(reset);

    function apply() {
      _page = 1;
      _filter();
    }
    input.addEventListener('input', apply);
    details.addEventListener('focusout', event => {
      if (!details.contains(event.relatedTarget)) details.open = false;
    });
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        details.open = false;
        summary.focus();
      }
    });
    details.append(summary, panel);
    search.appendChild(input);
    bar.append(search, details);
    const jumps = document.createElement('div');
    jumps.className = 'record-jumps';
    jumps.hidden = true;
    for (const [edge, label] of [['top', 'К первой строке'], ['bottom', 'К последней строке']]) {
      const jump = UI.Button({ icon: UI.Icon(edge), title: label, className: 'record-jump', onClick: () => _jumpToRow(edge) });
      jump.dataset.edge = edge;
      jump.setAttribute('aria-controls', 'rtw');
      jump.hidden = true;
      jumps.appendChild(jump);
    }
    bar.appendChild(jumps);
    if (canAdd) {
      const add = UI.Button({ icon: UI.Icon('plus'), title: 'Новая строка',
        className: 'record-add', onClick: _addRow });
      add.setAttribute('aria-controls', 'rtw');
      bar.appendChild(add);
    }
    return bar;
  }

  function _syncFilterMenu() {
    const bar = document.querySelector('.record-filter-menu');
    const count = [...bar.querySelectorAll('select')].filter(select => select.selectedIndex > 0).length;
    const badge = bar.querySelector('.filter-count');
    badge.textContent = count;
    badge.hidden = count === 0;
    bar.querySelector('button').disabled = count === 0;
  }

  /* ══ Filter ══════════════════════════════════ */
  function _filter({ reveal } = {}) {
    const q = (document.getElementById('rs')?.value || '').toLowerCase();
    const sub = document.getElementById('rsub').value;
    const cli = document.getElementById('rcli').value;
    const st = document.getElementById('rst').value;
    const today = Statistics.localDay();

    _filt = _recs.filter(r => {
      if (_subset && !_subset.ids.has(r.id)) return false;
      if (sub && r.subject !== sub) return false;
      if (cli && r.client !== cli) return false;
      if (st) {
        const row = Statistics.entry(r);
        const done = row.done && row.done <= today;
        const paid = row.paid && row.paid <= today;
        if (st === 'закрыто' && !(done && paid)) return false;
        if (st === 'не закрыто' && done && paid) return false;
        if (st === 'не оплачено' && paid) return false;
      }
      if (q && !`${r.subject} ${r.taskNum} ${r.client} ${r.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    _filt = [..._filt].sort((a, b) => {
      let va = a[_sort.f] ?? '', vb = b[_sort.f] ?? '';
      if (_sort.f === 'price') {
        va = Statistics.toCents(va) ?? -1;
        vb = Statistics.toCents(vb) ?? -1;
      } else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return _sort.d === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });
    if (reveal && _recs.some(rec => rec.id === reveal)) {
      const index = _filt.findIndex(rec => rec.id === reveal);
      if (index === -1) {
        _subset = null;
        document.querySelector('.record-report-scope')?.remove();
        document.getElementById('rs').value = '';
        ['rsub', 'rcli', 'rst'].forEach(id => { document.getElementById(id).selectedIndex = 0; });
        _filter({ reveal });
        return;
      }
      _page = Math.floor(index / PER) + 1;
    }
    _syncFilterMenu();
    _renderTable();
  }

  /* ══ Table render ════════════════════════════ */
  function _renderTable() {
    const viewport = document.getElementById('rtw');
    if (!viewport) return;
    _rowLayout?.disconnect();
    _page = Math.min(_page, Math.max(1, Math.ceil(_filt.length / PER)));
    const offset = (_page - 1) * PER;
    const canvas = document.createElement('div');
    canvas.className = 'records-canvas';

    const table = document.createElement('table');
    table.className = 'records-table';
    table.innerHTML = `<colgroup>
      <col class="record-col-number"><col class="record-col-subject"><col class="record-col-task">
      <col class="record-col-client"><col class="record-col-price">
      <col class="record-col-date"><col class="record-col-date">
    </colgroup><thead><tr>
      <th scope="col" class="no-sort">#</th>
      <th scope="col" data-f="subject">Предмет</th>
      <th scope="col" data-f="taskNum">Задача</th>
      <th scope="col" data-f="client">Заказчик</th>
      <th scope="col" data-f="price" class="td-num">Цена, ${Statistics.currency}</th>
      <th scope="col" data-f="doneDate">Выполнено</th>
      <th scope="col" data-f="paidDate">Оплачено</th>
    </tr><tr class="records-totals">
      <td colspan="4" data-total-count></td>
      <td class="td-num" data-total-price></td>
      <td class="text-right">Получено</td>
      <td class="td-num" data-total-paid></td>
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
    const actionPositions = _filt.slice(offset, offset + PER).map((rec, index) => {
      const row = _row(rec, offset + index + 1);
      body.appendChild(row);
      return _addRowActions(actions, row, rec);
    });
    const firstCell = body.rows[0]?.cells[EDITABLE_COLS[0]];
    if (firstCell) {
      firstCell.tabIndex = 0;
      firstCell.addEventListener('focus', () => firstCell.click());
    }
    canvas.append(table, actions);
    viewport.replaceChildren(canvas);
    const onScroll = () => {
      const clippedHeight = viewport.scrollTop + table.tHead.offsetHeight;
      actions.style.setProperty('--records-action-clip', clippedHeight + 'px');
      _syncRowControls(viewport);
    };
    const layoutActions = () => {
      const top = actions.getBoundingClientRect().top;
      actionPositions.forEach(position => position(top));
      onScroll();
    };
    viewport.onscroll = onScroll;
    layoutActions();
    _rowLayout = new ResizeObserver(layoutActions);
    _rowLayout.observe(table);
    _rowLayout.observe(viewport);
    [...body.rows].forEach(row => _rowLayout.observe(row));
    _updateTotals();
    UI.renderPagination(document.getElementById('rpg'), {
      total: _filt.length, page: _page, perPage: PER,
      onChange: page => { _page = page; viewport.scrollTop = 0; _renderTable(); }
    });
  }

  function _syncRowControls(viewport) {
    const jumps = document.querySelector('.record-jumps');
    const lastPage = Math.ceil(_filt.length / PER);
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const above = _page > 1 || viewport.scrollTop > 1;
    const below = _page < lastPage || viewport.scrollTop < maxScroll - 1;
    jumps.hidden = _filt.length < 2 || (lastPage === 1 && maxScroll <= 1);
    jumps.querySelector('[data-edge="top"]').hidden = !above;
    jumps.querySelector('[data-edge="bottom"]').hidden = !below;
    const add = document.querySelector('.record-add');
    if (add) add.hidden = Boolean(_subset);
  }

  function _jumpToRow(edge) {
    const top = edge === 'top';
    const page = top ? 1 : Math.ceil(_filt.length / PER);
    if (page !== _page) {
      _page = page;
      _renderTable();
    }
    const viewport = document.getElementById('rtw');
    const rows = viewport.querySelector('tbody').rows;
    _highlightRow(rows[top ? 0 : rows.length - 1]);
    viewport.scrollTop = top ? 0 : viewport.scrollHeight;
    _syncRowControls(viewport);
  }

  function _updateTotals() {
    const row = document.querySelector('#rtw .records-totals');
    if (!row) return;
    const totals = Statistics.ledgerTotals(_filt);
    row.querySelector('[data-total-count]').textContent = `Итого · ${totals.count}`;
    const totalPrice = row.querySelector('[data-total-price]');
    totalPrice.textContent = Statistics.amount(totals.total);
    totalPrice.title = Statistics.money(totals.total);
    row.querySelector('[data-total-paid]').textContent = Statistics.money(totals.paid);
  }

  function _addRowActions(layer, row, rec) {
    const group = document.createElement('div');
    group.className = 'record-actions';
    const note = _noteButton(row, rec);
    noteButtons.set(row, note);
    group.append(
      note,
      UI.Button({ icon: UI.Icon('copy'), title: 'Копировать как новую работу', onClick: () => _dupRow(rec) }),
      UI.Button({ icon: UI.Icon('trash'), variant: 'danger', title: 'Удалить строку', onClick: () => _del(rec.id) })
    );
    layer.appendChild(group);

    row.addEventListener('pointerenter', () => group.classList.add('row-active'));
    row.addEventListener('pointerleave', () => group.classList.remove('row-active'));
    group.addEventListener('pointerenter', () => row.classList.add('actions-active'));
    group.addEventListener('pointerleave', () => row.classList.remove('actions-active'));
    return top => {
      const bounds = row.getBoundingClientRect();
      group.style.top = `${bounds.top - top}px`;
      group.style.height = `${bounds.height}px`;
    };
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

    return tr;
  }

  /* ══ Cell factories ══════════════════════════ */
  function _txtCell(rec, field, { color, fw, dl } = {}) {
    const td = document.createElement('td');
    td.className = 'editable';
    if (color) td.style.color = color;
    if (fw) td.style.fontWeight = fw;
    const display = document.createElement('span');
    display.textContent = rec[field] || '';
    td.appendChild(display);
    td.title = display.textContent;
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
        display.textContent = rec[field];
        td.title = rec[field];
        if (dl) _rebuildFilters();
      });
    });
    return td;
  }

  function _numCell(rec, field) {
    const td = document.createElement('td');
    td.className = 'editable td-num';
    const display = document.createElement('span');
    const draw = () => {
      const cents = Statistics.toCents(rec[field]);
      display.textContent = cents === null ? '—' : Statistics.amount(cents);
      display.title = cents === null ? '' : display.textContent;
    };
    draw();
    td.appendChild(display);
    td.addEventListener('click', () => {
      if (td.querySelector('.cell-input')) return;
      const input = document.createElement('input');
      input.inputMode = 'decimal';
      input.value = rec[field] ?? '';
      _editCell(td, input, [display], () => {
        const value = input.value.trim();
        const cents = Statistics.toCents(value);
        if (value && cents === null) {
          if (value !== String(rec[field])) UI.toast('Введите цену числом, например 120,50', 'warn');
          return;
        }
        if (cents > MAX_PRICE && cents !== Statistics.toCents(rec[field])) {
          UI.toast('Максимальная цена — 99 999 ₽', 'warn');
          return;
        }
        _saveField(rec, field, cents === null ? null : cents / 100);
        draw();
      });
    });
    return td;
  }

  function _dateCell(rec, field) {
    const cell = document.createElement('td');
    cell.className = 'record-date';
    const group = document.createElement('div');
    group.className = 'record-date-group';
    const label = field === 'doneDate' ? 'Выполнено' : 'Оплачено';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'record-checkbox';
    toggle.dataset.field = field;
    toggle.tabIndex = -1;
    toggle.setAttribute('aria-label', label);

    const date = document.createElement('button');
    date.type = 'button';
    date.className = 'record-date-value';
    date.tabIndex = -1;

    function draw() {
      const value = Statistics.day(rec[field]);
      const checked = Boolean(value && value <= _today());
      toggle.checked = checked;
      toggle.title = checked ? 'Снять отметку и очистить дату' : 'Поставить сегодняшнюю дату';
      date.textContent = value ? _fmt(value) : 'дд.мм.гг';
      date.classList.toggle('is-empty', !value);
      date.classList.toggle('is-future', Boolean(value && !checked));
      date.setAttribute('aria-label', `${label}. ${value ? _fmt(value) : 'Дата не указана'}. Редактировать дату`);
      date.title = rec[field] && !value ? 'Некорректная дата. Нажмите, чтобы исправить' : date.getAttribute('aria-label');
    }

    toggle.addEventListener('change', () => {
      _saveField(rec, field, toggle.checked ? _today() : '');
      draw();
    });
    toggle.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      if (event.shiftKey) _focusNext(cell, false);
      else date.focus();
    });
    date.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      if (event.shiftKey) toggle.focus();
      else _focusNext(cell, true);
    });
    date.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'date';
      const original = Statistics.day(rec[field]);
      input.value = original;
      input.className = 'record-date-input';
      input.setAttribute('aria-label', field === 'doneDate' ? 'Дата выполнения' : 'Дата оплаты');
      date.replaceWith(input);
      input.focus();

      function finish(save) {
        input.removeEventListener('blur', blur);
        if (save && input.validity.valid && input.value !== original) _saveField(rec, field, input.value);
        draw();
        input.replaceWith(date);
      }

      const blur = () => finish(true);
      input.addEventListener('blur', blur);
      input.addEventListener('keydown', event => {
        if (!['Tab', 'Enter', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        finish(event.key !== 'Escape');
        if (event.key === 'Tab' && event.shiftKey) toggle.focus();
        else if (event.key === 'Tab') _focusNext(cell, true);
        else date.focus();
      });
    });

    draw();
    group.append(toggle, date);
    cell.appendChild(group);
    return cell;
  }

  function _noteButton(row, rec) {
    const button = UI.Button({ icon: UI.Icon('note'), className: 'record-note',
      onClick: () => _editNote(row, rec, button, draw) });
    button.tabIndex = -1;
    function draw() {
      const hasNote = Boolean(String(rec.notes ?? '').trim());
      button.classList.toggle('has-note', hasNote);
      button.title = hasNote ? 'Редактировать заметку' : 'Добавить заметку';
      button.setAttribute('aria-label', button.title);
    }
    button.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      _focusAcross(row, NOTE, !event.shiftKey);
    });
    draw();
    return button;
  }

  function _editNote(row, rec, button, draw) {
    const dialog = document.createElement('dialog');
    dialog.className = 'note-dialog';
    dialog.setAttribute('aria-labelledby', 'note-title');
    dialog.innerHTML = `<form method="dialog">
      <div class="note-dialog-header">
        <h3 id="note-title">Заметка</h3>
        <p class="note-context"></p>
      </div>
      <textarea class="input note-text" aria-labelledby="note-title" placeholder="Добавьте заметку…" autofocus></textarea>
      <div class="note-dialog-actions">
        <button class="btn btn-ghost" value="cancel">Отмена</button>
        <button class="btn btn-primary" value="save">Сохранить</button>
      </div>
    </form>`;
    const input = dialog.querySelector('textarea');
    input.value = rec.notes || '';
    dialog.querySelector('.note-context').textContent =
      [rec.subject, rec.taskNum, rec.client].filter(Boolean).join(' · ') || `Строка ${row.cells[0].textContent}`;
    const save = dialog.querySelector('[value="save"]');
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        dialog.querySelector('form').requestSubmit(save);
      }
    });
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'save') {
        _saveField(rec, 'notes', input.value.trim());
        draw();
      }
      dialog.remove();
      button.focus();
    }, { once: true });
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  function _editCell(td, input, children, commit) {
    input.className = 'cell-input';
    const header = td.closest('table').rows[0].cells[td.cellIndex];
    input.setAttribute('aria-label', header.textContent.trim());
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
    const saved = Storage.updateRecord(rec.id, { [field]: value });
    if (saved) Object.assign(rec, saved);
    _updateTotals();
  }

  /* ══ Keyboard navigation ═════════════════════ */
  function _focusNext(cell, forward) {
    _focusAcross(cell.parentElement, cell.cellIndex, forward);
  }

  function _focusAcross(row, current, forward) {
    const index = EDITABLE_COLS.indexOf(current);
    const column = EDITABLE_COLS[index + (forward ? 1 : -1)];
    if (column !== undefined) {
      _focusCell(row, column, forward);
      return;
    }

    const edge = forward ? EDITABLE_COLS[0] : NOTE;
    if (_focusAdjacentRow(row, edge, forward)) return;
    if (forward) {
      document.querySelector('#rtw .record-actions button:not(.record-note)')?.focus();
    } else {
      [...document.querySelectorAll('#rtw .sort-button')].at(-1)?.focus();
    }
  }

  function _focusCell(row, column, forward) {
    if (column === NOTE) {
      noteButtons.get(row)?.focus();
      return;
    }
    const cell = row.cells[column];
    if (cell.classList.contains('record-date')) {
      const control = cell.querySelector(forward ? '.record-checkbox' : '.record-date-value, .record-date-input');
      control.focus();
      return;
    }
    cell.click();
  }

  function _focusBelow(cell) {
    _focusAdjacentRow(cell.parentElement, cell.cellIndex, true);
  }

  function _focusAdjacentRow(row, column, forward) {
    const adjacent = forward ? row.nextElementSibling : row.previousElementSibling;
    if (adjacent?.matches('tr[data-id]')) {
      _focusCell(adjacent, column, forward);
      return true;
    }

    const page = _page + (forward ? 1 : -1);
    if (page < 1 || page > Math.ceil(_filt.length / PER)) return false;
    const viewport = document.getElementById('rtw');
    viewport.scrollTop = 0;
    _page = page;
    _renderTable();
    const rows = viewport.querySelectorAll('tbody tr[data-id]');
    _focusCell(rows[forward ? 0 : rows.length - 1], column, forward);
    return true;
  }

  function _addRow() {
    const rec = Storage.addRecord({
      semesterId: _semId, client: '', subject: '', taskNum: '', price: null,
      doneDate: '', paidDate: '', notes: ''
    });
    _recs = Storage.getRecords(_semId);
    _filter({ reveal: rec.id });
    const row = [...document.querySelectorAll('#rtw tr[data-id]')].find(row => row.dataset.id === rec.id);
    row.cells[EDITABLE_COLS[0]].click();
    row.scrollIntoView({ block: 'nearest' });
  }

  function _dupRow(rec) {
    const { semesterId, client, subject, taskNum, price, notes } = rec;
    const newRec = Storage.addRecord({ semesterId, client, subject, taskNum, price, notes, doneDate: '', paidDate: '' });
    _recs = Storage.getRecords(_semId); _filter({ reveal: newRec.id });
    _showRow(newRec.id);
    UI.toast('Работа скопирована');
  }

  function _showRow(id) {
    const row = [...document.querySelectorAll('#rtw tr[data-id]')].find(item => item.dataset.id === String(id));
    if (!row) return;
    _highlightRow(row);
    row.scrollIntoView({ block: 'nearest' });
  }

  function _highlightRow(row) {
    if (!row) return;
    row.tabIndex = -1;
    row.classList.add('record-report-focus');
    row.addEventListener('blur', () => row.classList.remove('record-report-focus'), { once: true });
    row.focus({ preventScroll: true });
  }

  async function _del(id) {
    const ok = await UI.confirmDialog({ message: 'Удалить эту строку навсегда?', confirmText: 'Удалить' });
    if (!ok) return;
    Storage.deleteRecord(id); UI.toast('Удалено', 'warn');
    _recs = Storage.getRecords(_semId); _filter();
  }

  /* ══ Helpers ════════════════════════════════ */
  function _rebuildFilters() {
    const fields = [['rsub', Storage.getSubjects()], ['rcli', Storage.getClients()]];
    fields.forEach(([id, options]) => {
      const select = document.getElementById(id);
      const selected = select.value;
      select.replaceChildren(select.options[0], ...options.map(value => new Option(value)));
      select.value = options.includes(selected) ? selected : '';
    });
    _syncFilterMenu();
  }
  function _fmt(d) { if (!d) return '—'; try { return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; } }
  const _today = Statistics.localDay;

  return { mount, unmount };
})();

window.RecordsView = RecordsView;
