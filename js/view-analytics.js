// Shared statistics screen for the whole register and for individual semesters.
const AnalyticsView = (() => {
  const S = Statistics;
  const presets = [
    ['month', 'Этот месяц'], ['last-month', 'Прошлый месяц'], ['quarter', 'Этот квартал'],
    ['all', 'Всё время'], ['custom', 'Свой период']
  ];
  const tabs = [
    ['overview', 'Сводка'], ['clients', 'Заказчики'], ['subjects', 'Предметы'], ['compare', 'Сравнение']
  ];
  const plurals = new Intl.PluralRules('ru-RU');
  const workForms = { one: 'работа', few: 'работы', many: 'работ', other: 'работы' };
  let _preset = 'month';
  let _customRange;

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, onClick, options = {}) {
    return UI.Button({ text, onClick, ...options });
  }

  function openRecords(semesterId, rows, label) {
    App.navigate('records', semesterId, { ids: rows.map(row => row.record.id), label });
  }

  function openRow(row) {
    const semesterId = row.record.semesterId || null;
    App.navigate('records', semesterId, { focusId: row.record.id });
  }

  function amountText(rows) {
    if (rows.length && rows.every(row => row.price === null)) return '—';
    return S.money(S.sum(rows));
  }

  function mount(semesterId, container) {
    const all = Storage.getRecords().map(S.entry);
    const semesters = Storage.getSemesters();
    const scope = semesterId ? all.filter(row => row.record.semesterId === semesterId) : all;
    const semester = semesters.find(item => item.id === semesterId);
    const today = S.localDay();
    let tab = 'overview';
    let range = _preset === 'custom' && _customRange
      ? _customRange : S.getRange(_preset, scope.filter(row => !row.draft), today);

    const page = element('div', 'report-page');
    const header = element('div', 'report-header');
    const title = element('div');
    title.append(element('h1', '', semester ? `Семестр «${semester.label}»` : 'Обзор работ'));
    const controls = element('div', 'report-controls');
    const period = UI.Select({
      options: presets.map(([value, label]) => ({ value, label })),
      value: _preset
    });
    period.setAttribute('aria-label', 'Период статистики');
    const dates = element('form', 'report-dates');
    const from = UI.Input({ type: 'date', required: true });
    const to = UI.Input({ type: 'date', required: true });
    from.max = today;
    to.max = today;
    const dateError = element('p', 'report-date-error');
    dateError.setAttribute('role', 'alert');
    const apply = element('button', 'btn btn-ghost', 'Применить');
    apply.type = 'submit';
    dates.append(UI.FormGroup({ label: 'С', child: from, id: 'report-from' }),
      UI.FormGroup({ label: 'По', child: to, id: 'report-to' }), apply, dateError);
    controls.append(period, dates);
    header.append(title, controls);
    const toolbar = element('div', 'report-toolbar');
    const navigation = element('nav', 'report-tabs');
    navigation.setAttribute('aria-label', 'Разделы статистики');
    const tabButtons = tabs.map(([id, label]) => {
      const item = button(label, () => { tab = id; render(); });
      navigation.appendChild(item);
      return item;
    });
    const caption = element('p', 'report-period');
    toolbar.append(navigation, caption);
    const content = element('div', 'report-content');
    page.append(header, toolbar, content);
    container.replaceChildren(page);

    function render() {
      const entries = tab === 'compare' ? all : scope;
      if (_preset !== 'custom') range = S.getRange(_preset, entries.filter(row => !row.draft), today);
      dates.hidden = _preset !== 'custom';
      tabButtons.forEach((item, i) => {
        if (tabs[i][0] === tab) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      caption.textContent = range.from === range.to ? S.formatDay(range.to)
        : `${S.formatDay(range.from)} — ${S.formatDay(range.to)}`;
      const summary = S.summarize(entries, range, today);
      content.replaceChildren();
      if (tab === 'overview') overview(content, semesterId, summary, range);
      if (tab === 'clients' || tab === 'subjects') breakdown(content, semesterId, summary, tab);
      if (tab === 'compare') compare(content, semesters, summary, range);
      const issues = S.quality(entries, today);
      if (summary.undated) issues.push(['Открытые работы без даты для этого среза',
        summary.active.filter(row => !row.firstKnown)]);
      if (issues.length) qualityPanel(content, tab === 'compare' ? null : semesterId, issues);
    }

    function initDates() {
      from.value = range.from;
      to.value = range.to;
      dateError.textContent = '';
    }

    period.addEventListener('change', () => {
      _preset = period.value;
      if (_preset === 'custom') {
        range = _customRange || range;
        initDates();
      }
      render();
    });
    dates.addEventListener('submit', event => {
      event.preventDefault();
      if (from.value > to.value) {
        dateError.textContent = 'Дата начала должна быть раньше даты окончания или совпадать с ней.';
        from.focus();
        return;
      }
      dateError.textContent = '';
      range = _customRange = { from: from.value, to: to.value };
      render();
    });
    initDates();
    render();
  }

  function overview(content, semesterId, data, range) {
    const grid = element('section', 'report-kpis');
    grid.setAttribute('aria-label', 'Основные показатели');
    const inPeriod = 'За период';
    const asOf = 'На ' + S.formatDay(range.to);
    const count = rows => `${rows.length} ${workForms[plurals.select(rows.length)]}`;
    const items = [
      { label: 'Выполнено', value: data.doneRows.length, detail: inPeriod, rows: data.doneRows },
      { label: 'Получено', value: amountText(data.paidRows), detail: `${inPeriod} · ${count(data.paidRows)}`, rows: data.paidRows, style: 'received' },
      { label: 'Ожидается к оплате', value: amountText(data.waiting), detail: `${asOf} · ${count(data.waiting)}`, rows: data.waiting, style: 'waiting' },
      { label: 'В работе', value: data.open.length, detail: `${asOf} · ${data.advance.length} с оплатой`, rows: data.open }
    ];
    items.forEach(({ label, value, detail, rows, style }) => {
      const tile = rows.length ? button('', () => openRecords(semesterId, rows, label)) : element('div');
      tile.className = `report-kpi ${style || ''}`;
      tile.append(element('span', 'report-kpi-label', label), element('strong', 'report-figure', value),
        element('span', 'report-kpi-detail', detail));
      if (rows.length) tile.insertAdjacentHTML('beforeend', UI.Icon('arrow'));
      grid.appendChild(tile);
    });
    content.appendChild(grid);
    if ([...data.paidRows, ...data.waiting, ...data.advance].some(row => row.price === null)) {
      content.appendChild(element('p', 'report-price-note', 'В суммы входят только работы с указанной ценой.'));
    }
    const panels = element('div', 'report-panels');
    panels.append(receipts(semesterId, data.paidRows, range), waitingPanel(semesterId, data.waiting, range.to));
    content.appendChild(panels);
    if (data.advance.length) {
      const advance = button('Открыть работы', () => openRecords(semesterId, data.advance, 'Оплаченные работы в очереди'),
        { size: 'sm' });
      const line = element('div', 'report-advance');
      line.append(element('p', '', `Оплачено по работам в очереди: ${amountText(data.advance)}`), advance);
      content.appendChild(line);
    }
  }

  function panel(title, subtitle) {
    const box = element('section', 'report-panel');
    const heading = element('div', 'report-panel-heading');
    heading.append(element('h2', '', title));
    if (subtitle) heading.append(element('p', '', subtitle));
    box.appendChild(heading);
    return box;
  }

  function receipts(semesterId, paid, range) {
    const box = panel('Поступления', 'По датам оплаты и ценам из журнала');
    if (!paid.length) {
      box.append(element('p', 'report-empty', 'За этот период оплат в журнале нет.'));
      return box;
    }
    const groups = S.buckets(range, paid);
    const maximum = Math.max(1, ...groups.map(group => S.sum(group.rows)));
    const scroll = element('div', 'report-plot-scroll');
    const graph = element('div', 'report-plot');
    graph.style.setProperty('--columns', groups.length);
    for (const group of groups) {
      const amount = S.sum(group.rows);
      const item = group.rows.length
        ? button('', () => openRecords(semesterId, group.rows, `Оплаты · ${group.label}`))
        : element('div');
      item.className = 'report-bar-column';
      const amountLabel = amountText(group.rows);
      const description = `${group.label}: ${amountLabel}`;
      item.title = description;
      item.setAttribute('aria-label', description);
      const track = element('span', 'report-bar-track');
      const bar = element('span', 'report-bar-fill');
      bar.style.setProperty('--level', `${amount / maximum * 100}%`);
      if (!amount) bar.classList.add('zero');
      track.appendChild(bar);
      const figure = element('span', 'report-bar-amount', amountLabel);
      figure.hidden = groups.length > 5;
      item.append(figure, track, element('span', 'report-bar-label', group.short));
      graph.appendChild(item);
    }
    scroll.appendChild(graph);
    box.appendChild(scroll);
    const details = element('details', 'report-details');
    details.append(element('summary', '', 'Суммы по периодам'));
    details.append(table(['Период', 'Оплаты', 'Сумма'], groups.map(group => [
      group.label, group.rows.length, amountText(group.rows)
    ])));
    box.appendChild(details);
    return box;
  }

  function waitingPanel(semesterId, waiting, asOf) {
    const box = panel('Ожидают оплаты', `Выполненные работы на ${S.formatDay(asOf)}`);
    if (!waiting.length) {
      box.append(element('p', 'report-empty', 'Ожидаемых оплат за выполненные работы нет.'));
      return box;
    }
    const sorted = [...waiting].sort((a, b) => a.done.localeCompare(b.done) || (b.price ?? 0) - (a.price ?? 0));
    const list = element('ul', 'report-waiting-list');
    const shown = sorted.slice(0, 5);
    for (const row of shown) {
      const item = element('li');
      const { record } = row;
      const open = button('', () => openRow(row), { className: 'report-waiting-item' });
      const name = String(record.client ?? '').trim() || 'Заказчик не указан';
      const main = element('span', 'report-work-name');
      const description = [record.subject, record.taskNum && `№ ${record.taskNum}`].filter(Boolean).join(' · ');
      main.append(element('strong', '', name), element('small', '', description || 'Предмет и задача не указаны'));
      const info = element('span', 'report-work-amount');
      const age = S.age(row.done, asOf);
      const ageLabel = age ? `${age} дн. ожидания` : 'Выполнено в этот день';
      info.append(element('strong', '', row.price === null ? 'Цена не указана' : S.money(row.price)),
        element('small', '', ageLabel));
      open.append(main, info);
      open.title = `Выполнено ${S.formatDay(row.done)}. Открыть запись`;
      item.appendChild(open);
      list.appendChild(item);
    }
    box.appendChild(list);
    if (sorted.length > 1) box.append(button(`Открыть все работы (${sorted.length})`,
      () => openRecords(semesterId, sorted, 'Работы, ожидающие оплаты'), { size: 'sm', className: 'report-list-link' }));
    return box;
  }

  function table(headers, rows) {
    const scroll = element('div', 'report-table-scroll');
    const el = element('table', 'report-table');
    const heading = el.createTHead().insertRow();
    headers.forEach(label => {
      const th = element('th', 'no-sort', label);
      th.scope = 'col';
      heading.appendChild(th);
    });
    const body = el.createTBody();
    rows.forEach(values => {
      const row = body.insertRow();
      values.forEach((value, i) => {
        const cell = i === 0 ? element('th') : row.insertCell();
        if (!i) { cell.scope = 'row'; row.appendChild(cell); }
        if (value instanceof Node) cell.appendChild(value);
        else cell.textContent = value;
      });
    });
    scroll.appendChild(el);
    return scroll;
  }

  function split(summary, keyOf) {
    const groups = new Map();
    for (const field of ['doneRows', 'paidRows', 'waiting', 'open']) {
      for (const row of summary[field]) {
        const { key, label } = keyOf(row);
        if (!groups.has(key)) groups.set(key, { label, doneRows: [], paidRows: [], waiting: [], open: [] });
        groups.get(key)[field].push(row);
      }
    }
    return groups;
  }

  function breakdown(content, semesterId, summary, tab) {
    const field = tab === 'clients' ? 'client' : 'subject';
    const box = panel(tab === 'clients' ? 'По заказчикам' : 'По предметам',
      'Выполнение и оплаты за период. Остатки на конец периода.');
    const groups = [...split(summary, ({ record }) => {
      const label = String(record[field] ?? '').trim().replace(/\s+/g, ' ');
      return { key: label.toLowerCase(), label: label || 'Не указан' };
    }).values()];
    groups.sort((a, b) => S.sum(b.waiting) - S.sum(a.waiting) || S.sum(b.paidRows) - S.sum(a.paidRows)
      || a.label.localeCompare(b.label, 'ru'));
    if (!groups.length) box.append(element('p', 'report-empty', 'Нет работ или оплат для этой разбивки.'));
    else box.append(table([
      tab === 'clients' ? 'Заказчик' : 'Предмет', 'Выполнено', 'Получено', 'Ожидается к оплате', 'В работе', 'Медиана цены'
    ], groups.map(group => {
      const cohort = [...new Set([...group.doneRows, ...group.paidRows, ...group.waiting, ...group.open])];
      const prices = cohort.map(row => row.price).filter(price => price !== null);
      const typical = S.median(prices);
      return [
        button(group.label, () => openRecords(semesterId, cohort, group.label), { size: 'sm' }),
        group.doneRows.length, amountText(group.paidRows), amountText(group.waiting), group.open.length,
        typical === null ? '—' : `${S.money(typical)} · n=${prices.length}`
      ];
    })));
    content.appendChild(box);
  }

  function compare(content, semesters, summary, range) {
    const box = panel('Сравнение семестров', 'Одинаковые даты для всех семестров. Остатки на конец периода.');
    if (!semesters.length) {
      box.append(element('p', 'report-empty', 'Добавьте семестр, чтобы сравнить работы и оплаты.'));
      content.appendChild(box);
      return;
    }
    const groups = split(summary, ({ record }) => ({ key: record.semesterId }));
    box.append(table(['Семестр', 'Выполнено', 'Получено', 'Ожидается к оплате', 'В работе'], semesters.map(sem => {
      const group = groups.get(sem.id) || { doneRows: [], paidRows: [], waiting: [], open: [] };
      const first = summary.active.reduce((min, row) =>
        row.record.semesterId === sem.id && row.firstKnown && row.firstKnown <= range.to &&
        (!min || row.firstKnown < min) ? row.firstKnown : min, '');
      const cell = element('div', 'report-semester-cell');
      cell.append(button(sem.label, () => App.navigate('analytics', sem.id), { size: 'sm' }));
      cell.append(element('small', '', first ? `Первая известная дата: ${S.formatDay(first)}` : 'До этой даты записей нет'));
      return [cell, group.doneRows.length, amountText(group.paidRows), amountText(group.waiting), group.open.length];
    })));
    content.appendChild(box);
  }

  function qualityPanel(content, semesterId, issues) {
    const details = element('details', 'report-panel report-quality');
    details.append(element('summary', '', 'Качество данных'));
    const list = element('ul');
    issues.forEach(([label, rows]) => {
      const item = element('li');
      item.append(element('span', '', label), button(String(rows.length), () => openRecords(semesterId, rows, label),
        { size: 'sm', title: `Открыть записи: ${label}` }));
      list.appendChild(item);
    });
    details.appendChild(list);
    content.appendChild(details);
  }

  return { mount };
})();
