/**
 * view-analytics.js
 * Summary statistics and charts for a semester.
 * Uses Chart.js (loaded from CDN in HTML).
 */

const AnalyticsView = (() => {
  let _semesterId = null;
  let _charts = [];

  function mount(semesterId, container) {
    _semesterId = semesterId;
    _charts.forEach(c => { try { c.destroy(); } catch(_){} });
    _charts = [];
    container.innerHTML = '';
    container.appendChild(_buildView());
  }

  function _buildView() {
    const records = Storage.getRecords(_semesterId);
    const sems    = Storage.getSemesters();
    const sem     = sems.find(s => s.id === _semesterId);

    const wrap = document.createElement('div');

    /* page header */
    wrap.insertAdjacentHTML('beforeend', `
      <div class="page-header">
        <div class="page-header-left">
          <h2>${sem ? sem.label : 'Аналитика'}</h2>
          <p class="mt-sm">Сводка, графики и статистика</p>
        </div>
      </div>`);

    if (!records.length) {
      wrap.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">📊</div><p>Нет данных для анализа</p></div>`);
      return wrap;
    }

    const stats = _calcStats(records);

    /* ── KPI row ── */
    const kpiGrid = document.createElement('div');
    kpiGrid.className = 'stat-grid';
    [
      { label: 'Всего работ',    value: stats.total,        sub: `${stats.doneCount} выполнено`, color: 'blue'   },
      { label: 'Сумма оплат',    value: stats.totalPaid + ' ₴', sub: `ср. ${Math.round(stats.avgPrice)} ₴/раб`, color: 'green'  },
      { label: 'Не оплачено',    value: stats.unpaidSum + ' ₴', sub: `${stats.unpaidCount} работ`, color: 'red'    },
      { label: 'Заказчиков',     value: stats.clientCount,  sub: `${stats.subjectCount} предметов`, color: 'yellow' },
    ].forEach(({ label, value, sub, color }) => {
      const card = document.createElement('div');
      card.className = `stat-card ${color}`;
      card.innerHTML = `<div class="card-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div>`;
      kpiGrid.appendChild(card);
    });
    wrap.appendChild(kpiGrid);

    /* ── Charts row ── */
    const chartsRow = document.createElement('div');
    chartsRow.className = 'grid-2 mt-lg';

    /* Chart 1: Revenue by client */
    const byClientCard = _makeCard('Доход по заказчикам');
    const bc1 = document.createElement('canvas'); bc1.id = 'chart-by-client'; bc1.height = 220;
    byClientCard.querySelector('.card').appendChild(bc1);
    chartsRow.appendChild(byClientCard);

    /* Chart 2: Revenue by subject */
    const bySubCard = _makeCard('Доход по предметам');
    const bc2 = document.createElement('canvas'); bc2.id = 'chart-by-subject'; bc2.height = 220;
    bySubCard.querySelector('.card').appendChild(bc2);
    chartsRow.appendChild(bySubCard);

    wrap.appendChild(chartsRow);

    /* ── Timeline chart ── */
    const timeCard = _makeCard('Доходы по времени (по дате оплаты)');
    const bc3 = document.createElement('canvas'); bc3.id = 'chart-timeline'; bc3.height = 160;
    timeCard.querySelector('.card').appendChild(bc3);
    wrap.appendChild(timeCard);
    wrap.querySelector('#chart-timeline')?.parentElement?.parentElement?.classList?.add('mt-lg');

    /* ── Summary table ── */
    const tableCard = document.createElement('div');
    tableCard.className = 'card mt-lg';
    tableCard.innerHTML = `<div class="card-header"><h3>Сводная таблица</h3></div>`;
    tableCard.appendChild(_buildSummaryTable(stats));
    wrap.appendChild(tableCard);

    /* render charts after DOM is attached (needs requestAnimationFrame) */
    requestAnimationFrame(() => {
      _renderClientChart(bc1, stats);
      _renderSubjectChart(bc2, stats);
      _renderTimelineChart(bc3, records);
    });

    return wrap;
  }

  /* ── Stats calculation ─────────────────── */
  function _calcStats(records) {
    const paid   = records.filter(r => r.status === 'закрыто' || r.status === 'о+ в-');
    const done   = records.filter(r => r.status === 'закрыто' || r.status === 'о- в+');
    const unpaid = records.filter(r => r.status !== 'закрыто');

    const totalPaid  = paid.reduce((s, r) => s + (r.price || 0), 0);
    const unpaidSum  = unpaid.reduce((s, r) => s + (r.price || 0), 0);
    const avgPrice   = records.length ? records.reduce((s, r) => s + (r.price || 0), 0) / records.length : 0;

    /* by client */
    const byClient = {};
    records.forEach(r => {
      if (!byClient[r.client]) byClient[r.client] = { count: 0, sum: 0, paidSum: 0, subjects: new Set() };
      byClient[r.client].count++;
      byClient[r.client].sum += r.price || 0;
      if (r.status === 'закрыто') byClient[r.client].paidSum += r.price || 0;
      byClient[r.client].subjects.add(r.subject);
    });

    /* by subject */
    const bySubject = {};
    records.forEach(r => {
      if (!bySubject[r.subject]) bySubject[r.subject] = { count: 0, sum: 0, avg: 0 };
      bySubject[r.subject].count++;
      bySubject[r.subject].sum += r.price || 0;
    });
    Object.values(bySubject).forEach(s => s.avg = s.count ? Math.round(s.sum / s.count) : 0);

    return {
      total: records.length, doneCount: done.length, paidCount: paid.length,
      totalPaid, unpaidSum, unpaidCount: unpaid.length, avgPrice,
      clientCount: Object.keys(byClient).length, subjectCount: Object.keys(bySubject).length,
      byClient, bySubject
    };
  }

  /* ── Chart renders ─────────────────────── */
  function _chartColors(n) {
    const palette = [
      '#4d9fff','#f0c040','#3ddc84','#ff4d4d','#c87aff','#ff9f40','#4dddc8','#ff6b9e','#a0e040','#ff7040'
    ];
    return Array.from({length: n}, (_,i) => palette[i % palette.length]);
  }

  function _baseChartOpts() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'white';
    return {
      responsive: true,
      plugins: {
        legend: { labels: { color: dark ? '#999' : '#555', font: { size: 11 } } },
        tooltip: { titleFont: { size: 12 }, bodyFont: { size: 11 } }
      },
      scales: {
        x: { ticks: { color: dark ? '#666' : '#999', font: { size: 10 } }, grid: { color: dark ? '#1e1e1e' : '#eee' } },
        y: { ticks: { color: dark ? '#666' : '#999', font: { size: 10 } }, grid: { color: dark ? '#1e1e1e' : '#eee' } }
      }
    };
  }

  function _renderClientChart(canvas, stats) {
    if (!window.Chart) return;
    const sorted = Object.entries(stats.byClient).sort((a,b) => b[1].sum - a[1].sum).slice(0, 12);
    const labels = sorted.map(([k]) => k);
    const data   = sorted.map(([,v]) => v.sum);
    const colors = _chartColors(labels.length);
    const opts   = _baseChartOpts();
    opts.plugins.legend.display = false;
    opts.scales.y.ticks.callback = v => v + '₴';
    const ch = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3 }] },
      options: opts
    });
    _charts.push(ch);
  }

  function _renderSubjectChart(canvas, stats) {
    if (!window.Chart) return;
    const sorted = Object.entries(stats.bySubject).sort((a,b) => b[1].sum - a[1].sum);
    const labels = sorted.map(([k]) => k);
    const data   = sorted.map(([,v]) => v.sum);
    const colors = _chartColors(labels.length);
    const opts = { responsive: true, plugins: { legend: { position: 'right', labels: { color: document.documentElement.getAttribute('data-theme') !== 'white' ? '#999' : '#555', font: { size: 11 }, boxWidth: 12 } } } };
    const ch = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, hoverOffset: 6 }] },
      options: opts
    });
    _charts.push(ch);
  }

  function _renderTimelineChart(canvas, records) {
    if (!window.Chart) return;
    /* group by month/year of paidDate */
    const monthly = {};
    records.forEach(r => {
      if (!r.paidDate) return;
      const d = new Date(r.paidDate);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthly[key] = (monthly[key] || 0) + (r.price || 0);
    });
    const keys = Object.keys(monthly).sort();
    if (!keys.length) return;
    const labels = keys.map(k => {
      const [y,m] = k.split('-');
      return new Date(+y, +m-1).toLocaleDateString('ru-RU', { month:'short', year:'2-digit' });
    });
    const opts = _baseChartOpts();
    opts.plugins.legend.display = false;
    opts.scales.y.ticks.callback = v => v + '₴';
    opts.fill = true;
    const dark = document.documentElement.getAttribute('data-theme') !== 'white';
    const ch = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: keys.map(k => monthly[k]),
          borderColor: '#4d9fff', backgroundColor: dark ? 'rgba(77,159,255,0.1)' : 'rgba(77,159,255,0.08)',
          borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#4d9fff', fill: true, tension: 0.35
        }]
      },
      options: opts
    });
    _charts.push(ch);
  }

  /* ── Summary table ─────────────────────── */
  function _buildSummaryTable(stats) {
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrapper';
    const table = document.createElement('table');
    table.className = 'summary-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="no-sort">Заказчик / Предмет</th>
          <th class="no-sort" style="text-align:right">Кол-во</th>
          <th class="no-sort" style="text-align:right">Сумма</th>
          <th class="no-sort" style="text-align:right">Ср. цена</th>
          <th class="no-sort" style="text-align:right">Оплачено ₴</th>
        </tr>
      </thead>`;
    const tbody = document.createElement('tbody');

    let totalCount = 0, totalSum = 0, totalPaid = 0;
    const clients = Object.entries(stats.byClient).sort((a,b) => b[1].sum - a[1].sum);

    clients.forEach(([client, cd]) => {
      const avg = cd.count ? Math.round(cd.sum / cd.count) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${_esc(client)}</td><td class="td-num">${cd.count}</td><td class="td-num accent-green">${cd.sum} ₴</td><td class="td-num">${avg} ₴</td><td class="td-num accent-blue">${cd.paidSum} ₴</td>`;
      tbody.appendChild(tr);
      totalCount += cd.count; totalSum += cd.sum; totalPaid += cd.paidSum;
    });

    const totRow = document.createElement('tr');
    totRow.className = 'grand-total';
    totRow.innerHTML = `<td>Итого</td><td class="td-num">${totalCount}</td><td class="td-num accent-green">${totalSum} ₴</td><td class="td-num">${totalCount ? Math.round(totalSum/totalCount) : 0} ₴</td><td class="td-num accent-blue">${totalPaid} ₴</td>`;
    tbody.appendChild(totRow);

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    return tableWrap;
  }

  function _makeCard(title) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="card"><div class="card-header"><h3>${title}</h3></div></div>`;
    return wrap;
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { mount };
})();

window.AnalyticsView = AnalyticsView;
