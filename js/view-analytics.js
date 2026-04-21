/**
 * view-analytics.js
 * Rich analytics: multiple chart modes, period filter, breakdowns.
 */

const AnalyticsView = (() => {
  let _charts  = [];
  let _semId   = null;
  let _records = [];
  let _mode    = 'overview';  // 'overview'|'clients'|'subjects'|'timeline'|'compare'
  let _period  = 'all';       // 'all'|'month'|'quarter'
  const PAL = ['#4d9fff','#f0c040','#3ddc84','#ff4d4d','#c87aff','#ff9f40','#4dddc8','#ff6b9e','#a0e040','#ff7040'];

  function mount(semId, container) {
    _semId = semId;
    _charts.forEach(c=>{try{c.destroy();}catch(_){}});
    _charts=[];
    container.innerHTML='';
    _records = Storage.getRecords(semId);
    container.appendChild(_build());
  }

  /* ══ Main build ════════════════════════════════ */
  function _build() {
    const sem  = Storage.getSemesters().find(s=>s.id===_semId);
    const wrap = document.createElement('div');

    /* Header */
    wrap.insertAdjacentHTML('beforeend',`
      <div class="page-header">
        <div class="page-header-left">
          <h2>${_esc(sem?.label??'Аналитика')}</h2>
          <p class="mt-sm">Детальная статистика и графики</p>
        </div>
      </div>`);

    if (!_records.length) {
      wrap.insertAdjacentHTML('beforeend','<div class="empty-state"><div class="empty-icon">📊</div><p>Нет данных для анализа</p></div>');
      return wrap;
    }

    /* Mode tabs + period filter */
    const toolRow = document.createElement('div');
    toolRow.style.cssText='display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem';

    const tabs = document.createElement('div'); tabs.className='context-tabs';
    [
      {id:'overview', label:'Обзор'},
      {id:'clients',  label:'Заказчики'},
      {id:'subjects', label:'Предметы'},
      {id:'timeline', label:'По времени'},
      {id:'compare',  label:'Сравнение'},
    ].forEach(({id,label})=>{
      const t=document.createElement('button'); t.className='context-tab'+(id===_mode?' active':'');
      t.textContent=label;
      t.addEventListener('click',()=>{ _mode=id; _rerender(wrap); });
      tabs.appendChild(t);
    });
    toolRow.appendChild(tabs);

    /* Period filter (for timeline/overview) */
    const pSel = UI.Select({options:[{value:'all',label:'Всё время'},{value:'month',label:'Посл. месяц'},{value:'quarter',label:'Посл. квартал'}], value:_period});
    pSel.style.width='140px';
    pSel.addEventListener('change',()=>{ _period=pSel.value; _rerender(wrap); });
    toolRow.appendChild(pSel);

    wrap.appendChild(toolRow);

    /* Content area */
    const content = document.createElement('div'); content.id='an-content';
    wrap.appendChild(content);

    _renderMode(content);
    return wrap;
  }

  function _rerender(wrap) {
    // Update tab active states
    wrap.querySelectorAll('.context-tab').forEach(t=>{
      t.classList.toggle('active', t.textContent === {
        overview:'Обзор',clients:'Заказчики',subjects:'Предметы',timeline:'По времени',compare:'Сравнение'
      }[_mode]);
    });
    _charts.forEach(c=>{try{c.destroy();}catch(_){}});
    _charts=[];
    const content = document.getElementById('an-content');
    if(content){ content.innerHTML=''; _renderMode(content); }
  }

  /* ══ Filter records by period ══════════════════ */
  function _filterByPeriod(recs) {
    if (_period === 'all') return recs;
    const now = new Date();
    const from = new Date(now);
    if (_period === 'month')   from.setMonth(now.getMonth()-1);
    if (_period === 'quarter') from.setMonth(now.getMonth()-3);
    return recs.filter(r => {
      const d = r.paidDate ? new Date(r.paidDate) : (r.doneDate ? new Date(r.doneDate) : null);
      return d && d >= from;
    });
  }

  /* ══ Mode renderers ════════════════════════════ */
  function _renderMode(container) {
    const recs = _filterByPeriod(_records);
    switch(_mode) {
      case 'overview':  _renderOverview(container, recs);  break;
      case 'clients':   _renderClients(container, recs);   break;
      case 'subjects':  _renderSubjects(container, recs);  break;
      case 'timeline':  _renderTimeline(container, recs);  break;
      case 'compare':   _renderCompare(container);          break;
    }
  }

  /* ── Overview ───────────────────────────────── */
  function _renderOverview(container, recs) {
    const s = _stats(recs);

    /* KPI */
    const grid=document.createElement('div'); grid.className='stat-grid'; container.appendChild(grid);
    [
      {label:'Всего работ',    value:s.total,           sub:`${s.doneCount} выполнено`,           color:'blue'  },
      {label:'Сумма оплат',    value:s.paidSum+' ₴',    sub:`ср. ${Math.round(s.avg)} ₴/работу`,  color:'green' },
      {label:'Не оплачено',    value:s.unpaidSum+' ₴',  sub:`${s.unpaidCount} работ`,             color:'red'   },
      {label:'Заказчиков',     value:s.clientCount,     sub:`предметов: ${s.subjectCount}`,       color:'yellow'},
      {label:'Закрытых',       value:s.closedCount,     sub:`${Math.round(s.closedCount/s.total*100)||0}% от всех`, color:'green'},
    ].forEach(({label,value,sub,color})=>{
      const c=document.createElement('div'); c.className=`stat-card ${color}`;
      c.innerHTML=`<div class="card-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div>`;
      grid.appendChild(c);
    });

    /* Two charts side by side */
    const row=document.createElement('div'); row.className='grid-2 mt-lg'; container.appendChild(row);

    const w1=document.createElement('div'); w1.style.cssText='position:relative;height:220px';
    const c1=document.createElement('canvas');
    _wrapCard(row,'Доход по заказчикам',w1,c1);

    const w2=document.createElement('div'); w2.style.cssText='position:relative;height:220px';
    const c2=document.createElement('canvas');
    _wrapCard(row,'По предметам',w2,c2);

    /* Summary table */
    const tc=document.createElement('div'); tc.className='card mt-lg'; tc.innerHTML='<div class="card-header"><h3>Итоговая таблица</h3></div>';
    tc.appendChild(_summaryTable(s)); container.appendChild(tc);

    requestAnimationFrame(()=>{
      _barH(c1, Object.entries(s.byClient).sort((a,b)=>b[1].sum-a[1].sum).slice(0,10));
      _donut(c2, Object.entries(s.bySubject).sort((a,b)=>b[1].sum-a[1].sum));
    });
  }

  /* ── Clients deep-dive ──────────────────────── */
  function _renderClients(container, recs) {
    const s = _stats(recs);
    const clients = Object.entries(s.byClient).sort((a,b)=>b[1].sum-a[1].sum);

    /* Stacked bar: sum vs unpaid per client */
    const w1=document.createElement('div'); w1.style.cssText='position:relative;height:280px';
    const c1=document.createElement('canvas');
    _wrapCard(container,'Оплачено vs не оплачено по заказчикам',w1,c1);

    /* Avg price per client */
    const w2=document.createElement('div'); w2.style.cssText='position:relative;height:240px';
    const c2=document.createElement('canvas');
    _wrapCard(container,'Средняя цена работы по заказчикам',w2,c2,'mt-lg');

    /* Per-client detail table */
    const tc=document.createElement('div'); tc.className='card mt-lg';
    tc.innerHTML='<div class="card-header"><h3>Детали по заказчикам</h3></div>';
    const tw=document.createElement('div'); tw.className='table-wrapper';
    const t=document.createElement('table');
    t.innerHTML=`<thead><tr>
      <th class="no-sort">Заказчик</th>
      <th class="no-sort" style="text-align:right">Работ</th>
      <th class="no-sort" style="text-align:right">Сумма</th>
      <th class="no-sort" style="text-align:right">Оплачено</th>
      <th class="no-sort" style="text-align:right">Не оплачено</th>
      <th class="no-sort" style="text-align:right">Ср. цена</th>
      <th class="no-sort" style="text-align:right">Предметы</th>
    </tr></thead>`;
    const tb=document.createElement('tbody');
    clients.forEach(([cli,d])=>{
      const avg=d.count?Math.round(d.sum/d.count):0;
      const unpaid=d.sum-d.paidSum;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td style="font-weight:600">${_esc(cli)}</td>
        <td class="td-num">${d.count}</td>
        <td class="td-num accent-green">${d.sum} ₴</td>
        <td class="td-num" style="color:var(--accent-blue)">${d.paidSum} ₴</td>
        <td class="td-num" style="color:${unpaid>0?'var(--accent-red)':'var(--text-muted)'}">${unpaid>0?unpaid+' ₴':'—'}</td>
        <td class="td-num">${avg} ₴</td>
        <td class="td-num accent-muted">${[...d.subjects].join(', ')}</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); tc.appendChild(tw); container.appendChild(tc);

    requestAnimationFrame(()=>{
      const labels=clients.map(([k])=>k);
      const paid  =clients.map(([,v])=>v.paidSum);
      const unpaid=clients.map(([,v])=>v.sum-v.paidSum);
      const dk=_dk();
      const ch1=new Chart(c1,{
        type:'bar',
        data:{labels,datasets:[
          {label:'Оплачено',    data:paid,   backgroundColor:'#3ddc84',borderRadius:2},
          {label:'Не оплачено', data:unpaid, backgroundColor:'#ff4d4d',borderRadius:2},
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{labels:{color:dk?'#999':'#555',font:{size:11}}}},
          scales:{
            x:{stacked:true,ticks:{color:dk?'#999':'#555',font:{size:10}},grid:{display:false}},
            y:{stacked:true,ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
          }
        }
      });
      _charts.push(ch1);

      const avgs=clients.map(([,v])=>v.count?Math.round(v.sum/v.count):0);
      const ch2=new Chart(c2,{
        type:'bar',
        data:{labels,datasets:[{data:avgs,backgroundColor:labels.map((_,i)=>PAL[i%PAL.length]),borderRadius:3}]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false}},
          scales:{
            x:{ticks:{color:dk?'#999':'#555',font:{size:10}},grid:{display:false}},
            y:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
          }
        }
      });
      _charts.push(ch2);
    });
  }

  /* ── Subjects deep-dive ─────────────────────── */
  function _renderSubjects(container, recs) {
    const s = _stats(recs);
    const subs = Object.entries(s.bySubject).sort((a,b)=>b[1].sum-a[1].sum);

    const row=document.createElement('div'); row.className='grid-2'; container.appendChild(row);
    const w1=document.createElement('div'); w1.style.cssText='position:relative;height:260px'; const c1=document.createElement('canvas'); _wrapCard(row,'Доход по предметам',w1,c1);
    const w2=document.createElement('div'); w2.style.cssText='position:relative;height:260px'; const c2=document.createElement('canvas'); _wrapCard(row,'Кол-во работ по предметам',w2,c2);

    /* Subject table with per-subject client breakdown */
    const tc=document.createElement('div'); tc.className='card mt-lg';
    tc.innerHTML='<div class="card-header"><h3>Детали по предметам</h3></div>';
    const tw=document.createElement('div'); tw.className='table-wrapper';
    const t=document.createElement('table');
    t.innerHTML=`<thead><tr>
      <th class="no-sort">Предмет</th>
      <th class="no-sort" style="text-align:right">Работ</th>
      <th class="no-sort" style="text-align:right">Сумма</th>
      <th class="no-sort" style="text-align:right">Ср. цена</th>
      <th class="no-sort" style="text-align:right">Мин</th>
      <th class="no-sort" style="text-align:right">Макс</th>
    </tr></thead>`;
    const tb=document.createElement('tbody');
    subs.forEach(([sub,d])=>{
      const subrecs=recs.filter(r=>r.subject===sub);
      const prices=subrecs.map(r=>r.price||0).filter(p=>p>0);
      const min=prices.length?Math.min(...prices):0;
      const max=prices.length?Math.max(...prices):0;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><span style="color:var(--accent-blue);font-weight:600">${_esc(sub)}</span></td>
        <td class="td-num">${d.count}</td>
        <td class="td-num accent-green">${d.sum} ₴</td>
        <td class="td-num">${d.count?Math.round(d.sum/d.count):0} ₴</td>
        <td class="td-num accent-muted">${min?min+' ₴':'—'}</td>
        <td class="td-num accent-muted">${max?max+' ₴':'—'}</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); tc.appendChild(tw); container.appendChild(tc);

    requestAnimationFrame(()=>{
      _donut(c1, subs, v=>v.sum);
      _donut(c2, subs, v=>v.count);
    });
  }

  /* ── Timeline ───────────────────────────────── */
  function _renderTimeline(container, recs) {
    /* Group by week and by month */
    const monthly={}, weekly={};
    recs.forEach(r=>{
      if(!r.paidDate) return;
      const d=new Date(r.paidDate); if(isNaN(d)) return;
      const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthly[mk]=(monthly[mk]||0)+(r.price||0);
      // ISO week
      const wn=_isoWeek(d);
      const wk=`${d.getFullYear()}-W${String(wn).padStart(2,'0')}`;
      weekly[wk]=(weekly[wk]||0)+(r.price||0);
    });

    const mKeys=Object.keys(monthly).sort();
    const wKeys=Object.keys(weekly).sort();

    /* Monthly chart */
    if (mKeys.length) {
      const w1=document.createElement('div'); w1.style.cssText='position:relative;height:200px';
      const c1=document.createElement('canvas');
      _wrapCard(container,'Доходы по месяцам (дата оплаты)',w1,c1);

      requestAnimationFrame(()=>{
        const dk=_dk();
        const labels=mKeys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('ru-RU',{month:'short',year:'2-digit'});});
        const ch=new Chart(c1,{
          type:'bar',
          data:{labels,datasets:[{
            data:mKeys.map(k=>monthly[k]),
            backgroundColor:mKeys.map((k,i)=>PAL[i%PAL.length]),
            borderRadius:3
          }]},
          options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:dk?'#999':'#555',font:{size:10}},grid:{display:false}},
              y:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
            }
          }
        });
        _charts.push(ch);
      });
    }

    /* Cumulative line chart */
    if (mKeys.length > 1) {
      const w2=document.createElement('div'); w2.style.cssText='position:relative;height:180px';
      const c2=document.createElement('canvas');
      _wrapCard(container,'Накопленный доход',w2,c2,'mt-lg');

      requestAnimationFrame(()=>{
        const dk=_dk();
        let cum=0;
        const labels=mKeys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('ru-RU',{month:'short',year:'2-digit'});});
        const data=mKeys.map(k=>{ cum+=monthly[k]; return cum; });
        const ch=new Chart(c2,{
          type:'line',
          data:{labels,datasets:[{data,borderColor:'#3ddc84',backgroundColor:'rgba(61,220,132,.1)',borderWidth:2,pointRadius:3,fill:true,tension:.35}]},
          options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:dk?'#999':'#555',font:{size:10}},grid:{color:dk?'#222':'#eee'}},
              y:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
            }
          }
        });
        _charts.push(ch);
      });
    }

    /* Work count per month (not money — number of records) */
    const countByMonth={};
    recs.forEach(r=>{
      const d=r.doneDate?new Date(r.doneDate):(r.paidDate?new Date(r.paidDate):null);
      if(!d||isNaN(d)) return;
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      countByMonth[k]=(countByMonth[k]||0)+1;
    });
    const cKeys=Object.keys(countByMonth).sort();
    if (cKeys.length) {
      const w3=document.createElement('div'); w3.style.cssText='position:relative;height:160px';
      const c3=document.createElement('canvas');
      _wrapCard(container,'Кол-во работ по месяцам',w3,c3,'mt-lg');
      requestAnimationFrame(()=>{
        const dk=_dk();
        const labels=cKeys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('ru-RU',{month:'short',year:'2-digit'});});
        const ch=new Chart(c3,{
          type:'bar',
          data:{labels,datasets:[{data:cKeys.map(k=>countByMonth[k]),backgroundColor:'#4d9fff',borderRadius:3}]},
          options:{responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:dk?'#999':'#555',font:{size:10}},grid:{display:false}},
              y:{ticks:{color:dk?'#666':'#999',font:{size:10},stepSize:1},grid:{color:dk?'#222':'#eee'}}
            }
          }
        });
        _charts.push(ch);
      });
    }
  }

  /* ── Compare semesters ──────────────────────── */
  function _renderCompare(container) {
    const sems = Storage.getSemesters();
    if (sems.length < 2) {
      container.insertAdjacentHTML('beforeend','<div class="empty-state"><div class="empty-icon">📊</div><p>Нужно минимум 2 семестра для сравнения</p></div>');
      return;
    }

    const semData = sems.map(sem=>{
      const recs=Storage.getRecords(sem.id);
      return {
        label: sem.label,
        count: recs.length,
        sum:   recs.reduce((s,r)=>s+(r.price||0),0),
        paid:  recs.filter(r=>r.paidDate).reduce((s,r)=>s+(r.price||0),0),
        avg:   recs.length?Math.round(recs.reduce((s,r)=>s+(r.price||0),0)/recs.length):0,
        done:  recs.filter(r=>r.doneDate).length,
      };
    });

    /* Grouped bar: sum comparison */
    const w1=document.createElement('div'); w1.style.cssText='position:relative;height:220px'; const c1=document.createElement('canvas');
    _wrapCard(container,'Сравнение доходов по семестрам',w1,c1);

    const w2=document.createElement('div'); w2.style.cssText='position:relative;height:200px'; const c2=document.createElement('canvas');
    _wrapCard(container,'Кол-во работ по семестрам',w2,c2,'mt-lg');

    /* Comparison table */
    const tc=document.createElement('div'); tc.className='card mt-lg';
    tc.innerHTML='<div class="card-header"><h3>Сравнительная таблица</h3></div>';
    const tw=document.createElement('div'); tw.className='table-wrapper';
    const t=document.createElement('table');
    t.innerHTML=`<thead><tr>
      <th class="no-sort">Семестр</th>
      <th class="no-sort" style="text-align:right">Работ</th>
      <th class="no-sort" style="text-align:right">Сумма</th>
      <th class="no-sort" style="text-align:right">Оплачено</th>
      <th class="no-sort" style="text-align:right">Ср. цена</th>
      <th class="no-sort" style="text-align:right">Выполнено</th>
    </tr></thead>`;
    const tb=document.createElement('tbody');
    semData.forEach(d=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td style="font-weight:600">${_esc(d.label)}</td>
        <td class="td-num">${d.count}</td>
        <td class="td-num accent-green">${d.sum} ₴</td>
        <td class="td-num" style="color:var(--accent-blue)">${d.paid} ₴</td>
        <td class="td-num">${d.avg} ₴</td>
        <td class="td-num">${d.done}</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); tc.appendChild(tw); container.appendChild(tc);

    requestAnimationFrame(()=>{
      const dk=_dk(); const labels=semData.map(d=>d.label);
      const ch1=new Chart(c1,{
        type:'bar',
        data:{labels,datasets:[
          {label:'Сумма',    data:semData.map(d=>d.sum),  backgroundColor:'#4d9fff',borderRadius:3},
          {label:'Оплачено', data:semData.map(d=>d.paid), backgroundColor:'#3ddc84',borderRadius:3},
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{labels:{color:dk?'#999':'#555',font:{size:11}}}},
          scales:{
            x:{ticks:{color:dk?'#999':'#555',font:{size:11}},grid:{display:false}},
            y:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
          }
        }
      });
      _charts.push(ch1);

      const ch2=new Chart(c2,{
        type:'bar',
        data:{labels,datasets:[
          {label:'Работ',      data:semData.map(d=>d.count),backgroundColor:'#c87aff',borderRadius:3},
          {label:'Выполнено',  data:semData.map(d=>d.done), backgroundColor:'#ff9f40',borderRadius:3},
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{labels:{color:dk?'#999':'#555',font:{size:11}}}},
          scales:{
            x:{ticks:{color:dk?'#999':'#555',font:{size:11}},grid:{display:false}},
            y:{ticks:{color:dk?'#666':'#999',font:{size:10},stepSize:1},grid:{color:dk?'#222':'#eee'}}
          }
        }
      });
      _charts.push(ch2);
    });
  }

  /* ══ Chart helpers ═════════════════════════════ */
  function _dk(){ const t=document.documentElement.getAttribute('data-theme'); return t!=='white'; }

  function _barH(canvas, entries) {
    if(!window.Chart) return;
    const dk=_dk();
    const ch=new Chart(canvas,{
      type:'bar',
      data:{
        labels:entries.map(([k])=>k),
        datasets:[{data:entries.map(([,v])=>v.sum),backgroundColor:entries.map((_,i)=>PAL[i%PAL.length]),borderRadius:3}]
      },
      options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
        plugins:{legend:{display:false}},
        scales:{
          x:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}},
          y:{ticks:{color:dk?'#999':'#555',font:{size:11}},grid:{display:false}}
        }
      }
    });
    _charts.push(ch);
  }

  function _donut(canvas, entries, valFn=(v=>v.sum)) {
    if(!window.Chart) return;
    const dk=_dk();
    const labels=entries.map(([k])=>k);
    const data  =entries.map(([,v])=>valFn(v));
    const ch=new Chart(canvas,{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:labels.map((_,i)=>PAL[i%PAL.length]),hoverOffset:6}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'right',labels:{color:dk?'#999':'#555',font:{size:11},boxWidth:12}}}
      }
    });
    _charts.push(ch);
  }

  /* ══ Stats ═════════════════════════════════════ */
  function _stats(recs) {
    const done  =recs.filter(r=>r.doneDate);
    const paid  =recs.filter(r=>r.paidDate);
    const closed=recs.filter(r=>r.doneDate&&r.paidDate);
    const unpaid=recs.filter(r=>!r.paidDate);
    const paidSum  =paid.reduce((s,r)=>s+(r.price||0),0);
    const unpaidSum=unpaid.reduce((s,r)=>s+(r.price||0),0);
    const avg      =recs.length?recs.reduce((s,r)=>s+(r.price||0),0)/recs.length:0;

    const byClient={};
    recs.forEach(r=>{
      if(!r.client) return;
      if(!byClient[r.client]) byClient[r.client]={count:0,sum:0,paidSum:0,subjects:new Set()};
      byClient[r.client].count++; byClient[r.client].sum+=r.price||0;
      if(r.paidDate) byClient[r.client].paidSum+=r.price||0;
      byClient[r.client].subjects.add(r.subject);
    });

    const bySubject={};
    recs.forEach(r=>{
      if(!r.subject) return;
      if(!bySubject[r.subject]) bySubject[r.subject]={count:0,sum:0};
      bySubject[r.subject].count++; bySubject[r.subject].sum+=r.price||0;
    });

    return {
      total:recs.length, doneCount:done.length, paidCount:paid.length,
      closedCount:closed.length, unpaidCount:unpaid.length,
      paidSum, unpaidSum, avg,
      clientCount:Object.keys(byClient).length,
      subjectCount:Object.keys(bySubject).length,
      byClient, bySubject
    };
  }

  /* ══ Summary table ═════════════════════════════ */
  function _summaryTable(s) {
    const tw=document.createElement('div'); tw.className='table-wrapper';
    const t=document.createElement('table'); t.className='summary-table';
    t.innerHTML=`<thead><tr>
      <th class="no-sort">Заказчик</th><th class="no-sort" style="text-align:right">Работ</th>
      <th class="no-sort" style="text-align:right">Сумма</th><th class="no-sort" style="text-align:right">Ср. цена</th>
      <th class="no-sort" style="text-align:right">Оплачено</th>
    </tr></thead>`;
    const tb=document.createElement('tbody');
    let tc=0,ts=0,tp=0;
    Object.entries(s.byClient).sort((a,b)=>b[1].sum-a[1].sum).forEach(([cli,d])=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${_esc(cli)}</td><td class="td-num">${d.count}</td><td class="td-num accent-green">${d.sum} ₴</td><td class="td-num">${d.count?Math.round(d.sum/d.count):0} ₴</td><td class="td-num accent-blue">${d.paidSum} ₴</td>`;
      tb.appendChild(tr); tc+=d.count; ts+=d.sum; tp+=d.paidSum;
    });
    const tot=document.createElement('tr'); tot.className='grand-total';
    tot.innerHTML=`<td>Итого</td><td class="td-num">${tc}</td><td class="td-num accent-green">${ts} ₴</td><td class="td-num">${tc?Math.round(ts/tc):0} ₴</td><td class="td-num accent-blue">${tp} ₴</td>`;
    tb.appendChild(tot); t.appendChild(tb); tw.appendChild(t); return tw;
  }

  /* ══ DOM helpers ═══════════════════════════════ */
  function _wrapCard(parent, title, heightWrap, canvas, extraClass='') {
    const card=document.createElement('div'); card.className='card'+(extraClass?' '+extraClass:'');
    card.innerHTML=`<div class="card-header"><h3>${title}</h3></div>`;
    heightWrap.appendChild(canvas); card.appendChild(heightWrap);
    parent.appendChild(card);
  }

  function _isoWeek(d) {
    const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const day=date.getUTCDay()||7;
    date.setUTCDate(date.getUTCDate()+4-day);
    const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date-yearStart)/86400000)+1)/7);
  }

  function _esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  return {mount};
})();

window.AnalyticsView=AnalyticsView;
