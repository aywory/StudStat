/**
 * view-dashboard.js — Global overview across all semesters.
 */

const DashboardView = (() => {
  let _charts = [];
  const PAL = ['#4d9fff','#f0c040','#3ddc84','#ff4d4d','#c87aff','#ff9f40','#4dddc8','#ff6b9e','#a0e040','#ff7040'];

  function mount(container) {
    _charts.forEach(c=>{try{c.destroy();}catch(_){}});
    _charts = [];
    container.innerHTML = '';
    container.appendChild(_build());
  }

  function _build() {
    const sems    = Storage.getSemesters();
    const allRecs = Storage.getRecords();
    const wrap    = document.createElement('div');

    wrap.insertAdjacentHTML('beforeend',`
      <div class="page-header">
        <div class="page-header-left"><h2>Обзор</h2><p class="mt-sm">Общая статистика по всем семестрам</p></div>
      </div>`);

    if (!allRecs.length) {
      wrap.insertAdjacentHTML('beforeend','<div class="empty-state" style="margin-top:3rem"><div class="empty-icon">🗂</div><p>Создайте семестр и добавьте первые записи</p></div>');
      return wrap;
    }

    const totalSum  = allRecs.reduce((s,r)=>s+(r.price||0),0);
    const paidSum   = allRecs.filter(r=>r.paidDate).reduce((s,r)=>s+(r.price||0),0);
    const doneCount = allRecs.filter(r=>r.doneDate).length;
    const clients   = new Set(allRecs.map(r=>r.client).filter(Boolean)).size;
    const subjects  = new Set(allRecs.map(r=>r.subject).filter(Boolean)).size;
    const avgPrice  = allRecs.length ? Math.round(totalSum/allRecs.length) : 0;

    /* KPI cards */
    const grid = document.createElement('div'); grid.className='stat-grid';
    [
      {label:'Всего записей',  value:allRecs.length,   sub:`в ${sems.length} семестрах`,      color:'blue'  },
      {label:'Общий доход',    value:totalSum+' ₴',    sub:`оплачено ${paidSum} ₴`,           color:'green' },
      {label:'Выполнено работ',value:doneCount,         sub:`из ${allRecs.length}`,            color:'blue'  },
      {label:'Заказчиков',     value:clients,           sub:`предметов: ${subjects}`,          color:'yellow'},
      {label:'Ср. цена',       value:avgPrice+' ₴',    sub:'за всё время',                    color:'blue'  },
    ].forEach(({label,value,sub,color})=>{
      const c=document.createElement('div'); c.className=`stat-card ${color}`;
      c.innerHTML=`<div class="card-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div>`;
      grid.appendChild(c);
    });
    wrap.appendChild(grid);

    /* Per-semester summary */
    if (sems.length > 1) {
      const h=document.createElement('h3'); h.style.cssText='margin-top:1.5rem;margin-bottom:.75rem'; h.textContent='По семестрам';
      wrap.appendChild(h);
      const sg=document.createElement('div'); sg.className='grid-3';
      sems.forEach(sem=>{
        const recs=allRecs.filter(r=>r.semesterId===sem.id);
        const sum =recs.reduce((s,r)=>s+(r.price||0),0);
        const paid=recs.filter(r=>r.paidDate).reduce((s,r)=>s+(r.price||0),0);
        const card=document.createElement('div'); card.className='card'; card.style.cursor='pointer';
        card.innerHTML=`<div class="card-label">${_esc(sem.label)}</div><div class="stat-value" style="font-size:1.3rem;margin:.4rem 0">${sum} ₴</div><div class="stat-sub">${recs.length} работ · оплачено ${paid} ₴</div>`;
        card.addEventListener('click',()=>App.navigate('records',sem.id));
        sg.appendChild(card);
      });
      wrap.appendChild(sg);
    }

    /* Top clients chart — RESPONSIVE FIX: position:relative + height wrapper */
    const byClient={};
    allRecs.forEach(r=>{ if(r.client) byClient[r.client]=(byClient[r.client]||0)+(r.price||0); });
    const topClients=Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,10);

    if (topClients.length) {
      const chartCard=document.createElement('div'); chartCard.className='card mt-lg';
      chartCard.innerHTML='<div class="card-header"><h3>Топ заказчиков (по сумме)</h3></div>';

      /* ← KEY FIX: fixed-height wrapper so chart doesn't grow unbounded */
      const cWrap=document.createElement('div');
      cWrap.style.cssText='position:relative;height:220px;width:100%';
      const canvas=document.createElement('canvas');
      cWrap.appendChild(canvas);
      chartCard.appendChild(cWrap);
      wrap.appendChild(chartCard);

      requestAnimationFrame(()=>{
        if(!window.Chart) return;
        const dk=document.documentElement.getAttribute('data-theme')==='white'?false:true;
        const ch=new Chart(canvas,{
          type:'bar',
          data:{
            labels:topClients.map(([k])=>k),
            datasets:[{data:topClients.map(([,v])=>v),backgroundColor:topClients.map((_,i)=>PAL[i%PAL.length]),borderRadius:3}]
          },
          options:{
            responsive:true, maintainAspectRatio:false, indexAxis:'y',
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}},
              y:{ticks:{color:dk?'#999':'#555',font:{size:11}},grid:{display:false}}
            }
          }
        });
        _charts.push(ch);
      });
    }

    /* Monthly revenue timeline (all semesters) */
    const monthly={};
    allRecs.forEach(r=>{
      if(!r.paidDate) return;
      const d=new Date(r.paidDate); if(isNaN(d)) return;
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthly[k]=(monthly[k]||0)+(r.price||0);
    });
    const keys=Object.keys(monthly).sort();
    if (keys.length > 1) {
      const tCard=document.createElement('div'); tCard.className='card mt-lg';
      tCard.innerHTML='<div class="card-header"><h3>Доходы по месяцам (все семестры)</h3></div>';
      const tw=document.createElement('div'); tw.style.cssText='position:relative;height:180px;width:100%';
      const tc=document.createElement('canvas'); tw.appendChild(tc); tCard.appendChild(tw);
      wrap.appendChild(tCard);

      requestAnimationFrame(()=>{
        if(!window.Chart) return;
        const dk=document.documentElement.getAttribute('data-theme')==='white'?false:true;
        const labels=keys.map(k=>{const[y,m]=k.split('-');return new Date(+y,+m-1).toLocaleDateString('ru-RU',{month:'short',year:'2-digit'});});
        const ch=new Chart(tc,{
          type:'line',
          data:{labels,datasets:[{
            data:keys.map(k=>monthly[k]),
            borderColor:'#4d9fff',backgroundColor:dk?'rgba(77,159,255,.1)':'rgba(77,159,255,.08)',
            borderWidth:2,pointRadius:3,fill:true,tension:.35
          }]},
          options:{
            responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              x:{ticks:{color:dk?'#666':'#999',font:{size:10}},grid:{color:dk?'#222':'#eee'}},
              y:{ticks:{color:dk?'#666':'#999',callback:v=>v+'₴',font:{size:10}},grid:{color:dk?'#222':'#eee'}}
            }
          }
        });
        _charts.push(ch);
      });
    }

    return wrap;
  }

  function _esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  return {mount};
})();

window.DashboardView=DashboardView;
