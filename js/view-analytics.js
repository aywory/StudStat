/**
 * view-analytics.js
 * Statistics and charts for a semester.
 * Status is derived from doneDate/paidDate — no separate status field.
 */

const AnalyticsView = (() => {
  let _charts = [];

  function mount(semId, container) {
    _charts.forEach(c=>{ try{c.destroy();}catch(_){} }); _charts=[];
    container.innerHTML='';
    container.appendChild(_build(semId));
  }

  function _build(semId) {
    const records=Storage.getRecords(semId);
    const sem    =Storage.getSemesters().find(s=>s.id===semId);
    const wrap   =document.createElement('div');

    wrap.insertAdjacentHTML('beforeend',`
      <div class="page-header">
        <div class="page-header-left">
          <h2>${_esc(sem?.label??'Аналитика')}</h2>
          <p class="mt-sm">Сводка, графики и статистика</p>
        </div>
      </div>`);

    if(!records.length){
      wrap.insertAdjacentHTML('beforeend','<div class="empty-state"><div class="empty-icon">📊</div><p>Нет данных для анализа</p></div>');
      return wrap;
    }

    const s=_stats(records);

    /* KPI */
    const grid=document.createElement('div'); grid.className='stat-grid';
    [
      {label:'Всего работ',   value:s.total,          sub:`${s.doneCount} выполнено`,            color:'blue'  },
      {label:'Сумма оплат',   value:s.paidSum+' ₴',   sub:`ср. ${Math.round(s.avg)} ₴/работу`,  color:'green' },
      {label:'Не оплачено',   value:s.unpaidSum+' ₴', sub:`${s.unpaidCount} работ`,              color:'red'   },
      {label:'Заказчиков',    value:s.clientCount,    sub:`${s.subjectCount} предметов`,          color:'yellow'},
    ].forEach(({label,value,sub,color})=>{
      const c=document.createElement('div'); c.className=`stat-card ${color}`;
      c.innerHTML=`<div class="card-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div>`;
      grid.appendChild(c);
    });
    wrap.appendChild(grid);

    /* Charts row */
    const row=document.createElement('div'); row.className='grid-2 mt-lg';

    const c1w=document.createElement('div'); c1w.style.cssText='position:relative;height:240px';
    const c1=document.createElement('canvas');c1.id='ch-cli';c1w.appendChild(c1);
    const card1=_card('Доход по заказчикам'); card1.querySelector('.card').appendChild(c1w); row.appendChild(card1);

    const c2w=document.createElement('div'); c2w.style.cssText='position:relative;height:240px';
    const c2=document.createElement('canvas');c2.id='ch-sub';c2w.appendChild(c2);
    const card2=_card('По предметам'); card2.querySelector('.card').appendChild(c2w); row.appendChild(card2);

    wrap.appendChild(row);

    /* Timeline */
    const c3w=document.createElement('div'); c3w.style.cssText='position:relative;height:200px';
    const c3=document.createElement('canvas');c3.id='ch-time';c3w.appendChild(c3);
    const card3=_card('Доходы по месяцам (дата оплаты)'); card3.querySelector('.card').appendChild(c3w);
    card3.style.marginTop='1rem';
    wrap.appendChild(card3);

    /* Summary table */
    const tc=document.createElement('div'); tc.className='card mt-lg';
    tc.innerHTML='<div class="card-header"><h3>Сводная таблица</h3></div>';
    tc.appendChild(_summaryTable(s));
    wrap.appendChild(tc);

    /* Render charts once DOM is in place */
    requestAnimationFrame(()=>{
      _barChart(c1,
        Object.entries(s.byClient).sort((a,b)=>b[1].sum-a[1].sum).slice(0,12),
        v=>v.sum);
      _donutChart(c2,
        Object.entries(s.bySubject).sort((a,b)=>b[1].sum-a[1].sum),
        v=>v.sum);
      _timelineChart(c3, records);
    });

    return wrap;
  }

  /* ══ Stats ═══════════════════════════════════ */
  function _stats(records) {
    const done   =records.filter(r=>r.doneDate);
    const paid   =records.filter(r=>r.paidDate);
    const closed =records.filter(r=>r.doneDate&&r.paidDate);
    const unpaid =records.filter(r=>!r.paidDate);
    const paidSum  =paid.reduce((s,r)=>s+(r.price||0),0);
    const unpaidSum=unpaid.reduce((s,r)=>s+(r.price||0),0);
    const avg      =records.length?records.reduce((s,r)=>s+(r.price||0),0)/records.length:0;

    const byClient={};
    records.forEach(r=>{
      if(!r.client) return;
      if(!byClient[r.client]) byClient[r.client]={count:0,sum:0,paidSum:0};
      byClient[r.client].count++;
      byClient[r.client].sum+=r.price||0;
      if(r.paidDate) byClient[r.client].paidSum+=r.price||0;
    });

    const bySubject={};
    records.forEach(r=>{
      if(!r.subject) return;
      if(!bySubject[r.subject]) bySubject[r.subject]={count:0,sum:0};
      bySubject[r.subject].count++;
      bySubject[r.subject].sum+=r.price||0;
    });

    return {
      total:records.length, doneCount:done.length, paidCount:paid.length,
      closedCount:closed.length, unpaidCount:unpaid.length,
      paidSum, unpaidSum, avg,
      clientCount:Object.keys(byClient).length,
      subjectCount:Object.keys(bySubject).length,
      byClient, bySubject
    };
  }

  /* ══ Chart helpers ═══════════════════════════ */
  const PALETTE=['#4d9fff','#f0c040','#3ddc84','#ff4d4d','#c87aff','#ff9f40','#4dddc8','#ff6b9e','#a0e040','#ff7040'];

  function _dark(){ return document.documentElement.getAttribute('data-theme')!=='white'&&document.documentElement.getAttribute('data-theme')!=='glassmorphism'?true:false; }

  function _base(){
    const dk=_dark();
    return {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:dk?'#999':'#555',font:{size:11}}},
        tooltip:{titleFont:{size:12},bodyFont:{size:11}}
      },
      scales:{
        x:{ticks:{color:dk?'#666':'#999',font:{size:10}},grid:{color:dk?'#222':'#eee'}},
        y:{ticks:{color:dk?'#666':'#999',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
      }
    };
  }

  function _barChart(canvas, entries, valFn) {
    if(!window.Chart) return;
    const labels=entries.map(([k])=>k);
    const data  =entries.map(([,v])=>valFn(v));
    const opts  =_base(); opts.plugins.legend.display=false;
    opts.scales.y.ticks.callback=v=>v+'₴';
    const ch=new Chart(canvas,{type:'bar',data:{labels,datasets:[{data,backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderRadius:3}]},options:opts});
    _charts.push(ch);
  }

  function _donutChart(canvas, entries, valFn) {
    if(!window.Chart) return;
    const dk=_dark();
    const labels=entries.map(([k])=>k);
    const data  =entries.map(([,v])=>valFn(v));
    const ch=new Chart(canvas,{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),hoverOffset:6}]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'right',labels:{color:dk?'#999':'#555',font:{size:11},boxWidth:12}}}
      }
    });
    _charts.push(ch);
  }

  function _timelineChart(canvas, records) {
    if(!window.Chart) return;
    const monthly={};
    records.forEach(r=>{
      if(!r.paidDate) return;
      const d=new Date(r.paidDate); if(isNaN(d)) return;
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthly[k]=(monthly[k]||0)+(r.price||0);
    });
    const keys=Object.keys(monthly).sort();
    if(!keys.length) return;
    const labels=keys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('ru-RU',{month:'short',year:'2-digit'});});
    const dk=_dark();
    const opts=_base(); opts.plugins.legend.display=false; opts.scales.y.ticks.callback=v=>v+'₴';
    const ch=new Chart(canvas,{
      type:'line',
      data:{labels,datasets:[{
        data:keys.map(k=>monthly[k]),
        borderColor:'#4d9fff',
        backgroundColor:dk?'rgba(77,159,255,.12)':'rgba(77,159,255,.08)',
        borderWidth:2,pointRadius:4,pointBackgroundColor:'#4d9fff',fill:true,tension:.35
      }]},
      options:opts
    });
    _charts.push(ch);
  }

  /* ══ Summary table ═══════════════════════════ */
  function _summaryTable(s) {
    const tw=document.createElement('div'); tw.className='table-wrapper';
    const t=document.createElement('table'); t.className='summary-table';
    t.innerHTML=`<thead><tr>
      <th class="no-sort">Заказчик</th>
      <th class="no-sort" style="text-align:right">Работ</th>
      <th class="no-sort" style="text-align:right">Сумма</th>
      <th class="no-sort" style="text-align:right">Ср. цена</th>
      <th class="no-sort" style="text-align:right">Оплачено</th>
    </tr></thead>`;
    const tb=document.createElement('tbody');
    let tc=0,ts=0,tp=0;
    Object.entries(s.byClient).sort((a,b)=>b[1].sum-a[1].sum).forEach(([cli,d])=>{
      const avg=d.count?Math.round(d.sum/d.count):0;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${_esc(cli)}</td><td class="td-num">${d.count}</td><td class="td-num accent-green">${d.sum} ₴</td><td class="td-num">${avg} ₴</td><td class="td-num accent-blue">${d.paidSum} ₴</td>`;
      tb.appendChild(tr); tc+=d.count; ts+=d.sum; tp+=d.paidSum;
    });
    const tot=document.createElement('tr'); tot.className='grand-total';
    tot.innerHTML=`<td>Итого</td><td class="td-num">${tc}</td><td class="td-num accent-green">${ts} ₴</td><td class="td-num">${tc?Math.round(ts/tc):0} ₴</td><td class="td-num accent-blue">${tp} ₴</td>`;
    tb.appendChild(tot); t.appendChild(tb); tw.appendChild(t);
    return tw;
  }

  function _card(title){const w=document.createElement('div');w.innerHTML=`<div class="card"><div class="card-header"><h3>${title}</h3></div></div>`;return w;}
  function _esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  return { mount };
})();

window.AnalyticsView = AnalyticsView;
