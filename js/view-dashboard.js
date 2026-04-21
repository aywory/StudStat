/**
 * view-dashboard.js
 * Global overview across all semesters.
 */

const DashboardView = (() => {
  let _charts = [];

  function mount(container) {
    _charts.forEach(c => { try { c.destroy(); } catch(_){} });
    _charts = [];
    container.innerHTML = '';
    container.appendChild(_buildView());
  }

  function _buildView() {
    const sems    = Storage.getSemesters();
    const allRecs = Storage.getRecords();
    const wrap    = document.createElement('div');

    wrap.insertAdjacentHTML('beforeend', `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Обзор</h2>
          <p class="mt-sm">Общая статистика по всем семестрам</p>
        </div>
      </div>`);

    if (!allRecs.length) {
      wrap.insertAdjacentHTML('beforeend', `
        <div class="empty-state" style="margin-top:3rem">
          <div class="empty-icon">🗂</div>
          <p>Создайте семестр и добавьте первые записи</p>
        </div>`);
      return wrap;
    }

    /* KPI */
    const totalSum   = allRecs.reduce((s,r) => s+(r.price||0), 0);
    const paidSum    = allRecs.filter(r => r.status==='закрыто').reduce((s,r) => s+(r.price||0), 0);
    const clients    = new Set(allRecs.map(r=>r.client)).size;
    const subjects   = new Set(allRecs.map(r=>r.subject)).size;
    const avgPrice   = allRecs.length ? Math.round(totalSum/allRecs.length) : 0;

    const grid = document.createElement('div');
    grid.className = 'stat-grid';
    [
      { label:'Всего записей',   value: allRecs.length, sub: `в ${sems.length} семестрах`, color:'blue'   },
      { label:'Общий доход',     value: totalSum+' ₴',  sub: `оплачено: ${paidSum} ₴`,     color:'green'  },
      { label:'Уникальных зак.',  value: clients,         sub: `предметов: ${subjects}`,     color:'yellow' },
      { label:'Ср. цена работы', value: avgPrice+' ₴',  sub: 'за всё время',               color:'blue'   },
    ].forEach(({ label, value, sub, color }) => {
      const c = document.createElement('div');
      c.className = `stat-card ${color}`;
      c.innerHTML = `<div class="card-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div>`;
      grid.appendChild(c);
    });
    wrap.appendChild(grid);

    /* Per-semester cards */
    if (sems.length > 1) {
      const h = document.createElement('h3'); h.style.marginTop='1.5rem'; h.style.marginBottom='0.75rem'; h.textContent = 'По семестрам';
      wrap.appendChild(h);
      const semGrid = document.createElement('div'); semGrid.className = 'grid-3';
      sems.forEach(sem => {
        const recs = allRecs.filter(r => r.semesterId === sem.id);
        const sum  = recs.reduce((s,r)=>s+(r.price||0),0);
        const paid = recs.filter(r=>r.status==='закрыто').reduce((s,r)=>s+(r.price||0),0);
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
          <div class="card-label">${_esc(sem.label)}</div>
          <div class="stat-value" style="font-size:1.3rem;margin:0.4rem 0">${sum} ₴</div>
          <div class="stat-sub">${recs.length} работ · оплачено ${paid} ₴</div>`;
        card.addEventListener('click', () => App.navigate('records', sem.id));
        semGrid.appendChild(card);
      });
      wrap.appendChild(semGrid);
    }

    /* Top clients chart */
    const byClient = {};
    allRecs.forEach(r => { byClient[r.client] = (byClient[r.client]||0)+(r.price||0); });
    const topClients = Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,10);

    if (topClients.length) {
      const chartCard = document.createElement('div');
      chartCard.className = 'card mt-lg';
      chartCard.innerHTML = '<div class="card-header"><h3>Топ заказчиков (по сумме)</h3></div>';
      const canvas = document.createElement('canvas'); canvas.id='dash-chart-clients'; canvas.height=180;
      chartCard.appendChild(canvas);
      wrap.appendChild(chartCard);

      requestAnimationFrame(() => {
        if (!window.Chart) return;
        const dark = document.documentElement.getAttribute('data-theme') !== 'white';
        const palette = ['#4d9fff','#f0c040','#3ddc84','#ff4d4d','#c87aff','#ff9f40','#4dddc8','#ff6b9e','#a0e040','#ff7040'];
        const ch = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: topClients.map(([k])=>k),
            datasets: [{ data: topClients.map(([,v])=>v), backgroundColor: palette, borderRadius:3 }]
          },
          options: {
            responsive: true, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: dark?'#666':'#999', callback: v=>v+'₴', font:{size:10} }, grid: { color: dark?'#1e1e1e':'#eee' } },
              y: { ticks: { color: dark?'#999':'#555', font:{size:11} }, grid: { display:false } }
            }
          }
        });
        _charts.push(ch);
      });
    }

    return wrap;
  }

  function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { mount };
})();

window.DashboardView = DashboardView;
