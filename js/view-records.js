/**
 * view-records.js
 * Inline-editing table.
 * • Click "+" → new blank row added to Storage immediately, then first cell focused
 * • Click any cell → edit in place, save on blur/Enter
 * • Status = two pill toggles (выполнено / оплачено)
 */

const RecordsView = (() => {
  let _semId  = null;
  let _recs   = [];   // live array from Storage (re-fetched on every mutation)
  let _filt   = [];
  let _sort   = { f: 'createdAt', d: 'asc' };
  let _page   = 1;
  const PER   = 30;

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

    /* header */
    const sem = Storage.getSemesters().find(s=>s.id===_semId);
    const ph  = document.createElement('div'); ph.className='page-header';
    ph.innerHTML=`<div class="page-header-left"><h2>${_esc(sem?.label??'Учёт')}</h2><p class="mt-sm">Нажмите на ячейку для редактирования</p></div>`;
    ph.appendChild(UI.Button({text:'+ Добавить строку',variant:'primary',onClick:_addRow}));
    w.appendChild(ph);

    /* filter bar */
    const fb=document.createElement('div'); fb.className='filter-bar'; fb.id='rfb';
    const sw=document.createElement('div'); sw.className='search-wrap';
    sw.innerHTML='<span class="search-icon">⌕</span>';
    const si=UI.Input({placeholder:'Поиск…'}); si.id='rs'; si.addEventListener('input',()=>{_page=1;_filter();}); sw.appendChild(si); fb.appendChild(sw);

    const ss=UI.Select({options:['все предметы',...Storage.getSubjects()]}); ss.id='rsub'; ss.style.width='130px'; ss.addEventListener('change',()=>{_page=1;_filter();}); fb.appendChild(ss);
    const cs=UI.Select({options:['все заказчики',...Storage.getClients()]});  cs.id='rcli'; cs.style.width='140px'; cs.addEventListener('change',()=>{_page=1;_filter();}); fb.appendChild(cs);
    const st=UI.Select({options:['все','закрыто','не закрыто']});              st.id='rst';  st.style.width='120px'; st.addEventListener('change',()=>{_page=1;_filter();}); fb.appendChild(st);
    w.appendChild(fb);

    const tw=document.createElement('div'); tw.className='table-wrapper'; tw.id='rtw'; w.appendChild(tw);
    const pg=document.createElement('div'); pg.className='pagination';    pg.id='rpg'; w.appendChild(pg);
    return w;
  }

  /* ══ Filter + sort ══════════════════════════ */
  function _filter() {
    const q  =(document.getElementById('rs')?.value||'').toLowerCase();
    const sub= document.getElementById('rsub')?.value||'все предметы';
    const cli= document.getElementById('rcli')?.value||'все заказчики';
    const st = document.getElementById('rst')?.value||'все';

    _filt=_recs.filter(r=>{
      if(sub!=='все предметы'  && r.subject!==sub) return false;
      if(cli!=='все заказчики' && r.client!==cli)  return false;
      if(st==='закрыто'    && !(r.doneDate&&r.paidDate)) return false;
      if(st==='не закрыто' &&   (r.doneDate&&r.paidDate)) return false;
      if(q&&!`${r.subject} ${r.taskNum} ${r.client} ${r.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });

    _filt=[..._filt].sort((a,b)=>{
      let va=a[_sort.f]??'', vb=b[_sort.f]??'';
      if(_sort.f==='price'){va=+va;vb=+vb;} else {va=String(va).toLowerCase();vb=String(vb).toLowerCase();}
      return _sort.d==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0);
    });

    _renderTable();
  }

  /* ══ Table ══════════════════════════════════ */
  function _renderTable() {
    const tw=document.getElementById('rtw'); if(!tw) return;
    tw.innerHTML='';

    if(!_filt.length){
      tw.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><p>Нет записей.</p></div>';
      document.getElementById('rpg').innerHTML=''; return;
    }

    const slice=_filt.slice((_page-1)*PER,_page*PER);
    const off  =(_page-1)*PER;

    const t=document.createElement('table');
    t.innerHTML=`<thead><tr>
      <th class="no-sort" style="width:2rem">#</th>
      <th data-f="subject"  style="width:80px">Предмет</th>
      <th data-f="taskNum"  style="width:70px">Задача</th>
      <th data-f="client"   style="width:130px">Заказчик</th>
      <th data-f="price"    style="width:90px;text-align:right">Цена</th>
      <th data-f="doneDate" style="width:106px">Выполнено</th>
      <th data-f="paidDate" style="width:106px">Оплачено</th>
      <th class="no-sort"   style="width:120px">Статус</th>
      <th data-f="notes">Заметки</th>
      <th class="no-sort"   style="width:36px"></th>
    </tr></thead>`;

    t.querySelectorAll('thead th[data-f]').forEach(th=>{
      UI.setSortHeader(th, th.dataset.f, {field:_sort.f,dir:_sort.d});
      th.addEventListener('click',()=>{
        _sort=_sort.f===th.dataset.f?{f:_sort.f,d:_sort.d==='asc'?'desc':'asc'}:{f:th.dataset.f,d:'asc'};
        _filter();
      });
    });

    const tb=document.createElement('tbody');
    slice.forEach((rec,i)=>tb.appendChild(_row(rec,off+i+1)));
    t.appendChild(tb); tw.appendChild(t);

    UI.renderPagination(document.getElementById('rpg'),{
      total:_filt.length, page:_page, perPage:PER,
      onChange:p=>{_page=p;_renderTable();}
    });
  }

  /* ══ Row ═════════════════════════════════════ */
  function _row(rec, n) {
    const tr=document.createElement('tr'); tr.dataset.id=rec.id;

    // #
    const tn=document.createElement('td'); tn.className='accent-muted'; tn.style.fontSize='0.72rem'; tn.textContent=n; tr.appendChild(tn);

    // editable text cells
    tr.appendChild(_txtCell(rec,'subject',{color:'var(--accent-blue)',fw:'600',dl:'subjects'}));
    tr.appendChild(_txtCell(rec,'taskNum',{}));
    tr.appendChild(_txtCell(rec,'client', {fw:'500',dl:'clients'}));

    // price
    const tp=_numCell(rec,'price'); tp.style.textAlign='right'; tp.style.color='var(--accent-green)'; tp.style.fontWeight='600'; tr.appendChild(tp);

    // date cells
    tr.appendChild(_dateCell(rec,'doneDate'));
    tr.appendChild(_dateCell(rec,'paidDate'));

    // status pills
    const ts=document.createElement('td'); ts.appendChild(_pillPair(rec)); tr.appendChild(ts);

    // notes
    tr.appendChild(_txtCell(rec,'notes',{muted:true,maxW:'180px'}));

    // delete
    const td=document.createElement('td');
    const db=UI.Button({icon:'✕',variant:'danger',size:'sm',title:'Удалить',onClick:()=>_del(rec.id)});
    db.style.opacity='0';
    tr.addEventListener('mouseenter',()=>db.style.opacity='1');
    tr.addEventListener('mouseleave',()=>db.style.opacity='0');
    td.appendChild(db); tr.appendChild(td);

    return tr;
  }

  /* ══ Cell factories ══════════════════════════ */

  function _txtCell(rec, field, {color,fw,muted,maxW,dl}={}) {
    const td=document.createElement('td');
    td.className='editable'+(muted?' accent-muted':'');
    if(maxW){td.style.maxWidth=maxW;td.style.overflow='hidden';td.style.textOverflow='ellipsis';td.style.whiteSpace='nowrap';}
    if(color) td.style.color=color;
    if(fw)    td.style.fontWeight=fw;

    const sp=document.createElement('span'); sp.textContent=rec[field]||'';
    if(rec[field]&&maxW) td.title=rec[field];
    td.appendChild(sp);

    td.addEventListener('click',()=>{
      if(td.querySelector('.cell-input')) return;
      const inp=document.createElement('input'); inp.className='cell-input'; inp.value=rec[field]||'';

      if(dl){
        const id='dl-'+dl; let dlist=document.getElementById(id);
        if(!dlist){dlist=document.createElement('datalist');dlist.id=id;document.body.appendChild(dlist);}
        dlist.innerHTML='';
        (dl==='subjects'?Storage.getSubjects():Storage.getClients()).forEach(v=>{const o=document.createElement('option');o.value=v;dlist.appendChild(o);});
        inp.setAttribute('list',id);
      }

      td.innerHTML=''; td.appendChild(inp); inp.focus(); inp.select();

      const commit=()=>{
        const val=inp.value.trim();
        rec[field]=val;
        Storage.updateRecord(rec.id,{[field]:val});
        sp.textContent=val; if(maxW&&val) td.title=val;
        td.innerHTML=''; td.appendChild(sp);
        if(dl) _rebuildFilterOpts();
      };
      inp.addEventListener('blur',commit);
      inp.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();inp.blur();}
        if(e.key==='Escape'){td.innerHTML='';td.appendChild(sp);}
      });
    });
    return td;
  }

  function _numCell(rec, field) {
    const td=document.createElement('td'); td.className='editable';
    const sp=document.createElement('span'); sp.textContent=rec[field]?rec[field]+' ₴':'—'; td.appendChild(sp);
    td.addEventListener('click',()=>{
      if(td.querySelector('.cell-input')) return;
      const inp=document.createElement('input'); inp.type='number'; inp.min='0';
      inp.className='cell-input'; inp.style.textAlign='right'; inp.style.width='70px';
      inp.value=rec[field]||''; td.innerHTML=''; td.appendChild(inp); inp.focus(); inp.select();
      const commit=()=>{
        const val=+inp.value||0; rec[field]=val;
        Storage.updateRecord(rec.id,{[field]:val});
        sp.textContent=val?val+' ₴':'—'; td.innerHTML=''; td.appendChild(sp);
      };
      inp.addEventListener('blur',commit);
      inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur();}if(e.key==='Escape'){td.innerHTML='';td.appendChild(sp);}});
    });
    return td;
  }

  function _dateCell(rec, field) {
    const td=document.createElement('td'); td.className='editable accent-muted';
    const sp=document.createElement('span'); sp.textContent=_fmt(rec[field]); td.appendChild(sp);
    td.addEventListener('click',()=>{
      if(td.querySelector('.cell-input')) return;
      const inp=document.createElement('input'); inp.type='date'; inp.className='cell-input'; inp.style.width='130px';
      inp.value=rec[field]||''; td.innerHTML=''; td.appendChild(inp); inp.focus();
      const commit=()=>{
        const val=inp.value; rec[field]=val;
        Storage.updateRecord(rec.id,{[field]:val});
        sp.textContent=_fmt(val); td.innerHTML=''; td.appendChild(sp);
        // refresh pill in same row
        const pills=td.parentElement?.querySelector('.status-pair');
        if(pills) _refreshPills(pills,rec);
      };
      inp.addEventListener('blur',commit);
      inp.addEventListener('change',()=>{inp.blur();});
      inp.addEventListener('keydown',e=>{if(e.key==='Escape'){td.innerHTML='';td.appendChild(sp);}});
    });
    return td;
  }

  /* ══ Status pills ════════════════════════════ */
  function _pillPair(rec) {
    const pair=document.createElement('div'); pair.className='status-pair';
    const dp=document.createElement('span');
    const pp=document.createElement('span');

    const draw=()=>{
      dp.className='status-pill '+(rec.doneDate?'pill-done-on':'pill-done-off');
      dp.textContent=rec.doneDate?'✓ выпол':'○ выпол';
      dp.title=rec.doneDate?'Выполнено: '+_fmt(rec.doneDate):'Нажмите — отметить как выполненное';
      pp.className='status-pill '+(rec.paidDate?'pill-paid-on':'pill-paid-off');
      pp.textContent=rec.paidDate?'✓ оплач':'○ оплач';
      pp.title=rec.paidDate?'Оплачено: '+_fmt(rec.paidDate):'Нажмите — отметить как оплаченное';
    };

    dp.addEventListener('click',()=>{
      if(!rec.doneDate){
        // First click → set today, save
        rec.doneDate=_today();
        Storage.updateRecord(rec.id,{doneDate:rec.doneDate});
        _refreshRowDateCell(dp,'doneDate',rec);
        draw();
      } else {
        // Already set → popup to edit/clear
        _datePop(dp,rec,'doneDate',draw);
      }
    });
    pp.addEventListener('click',()=>{
      if(!rec.paidDate){
        rec.paidDate=_today();
        Storage.updateRecord(rec.id,{paidDate:rec.paidDate});
        _refreshRowDateCell(pp,'paidDate',rec);
        draw();
      } else {
        _datePop(pp,rec,'paidDate',draw);
      }
    });

    draw(); pair.appendChild(dp); pair.appendChild(pp);
    return pair;
  }

  function _refreshPills(pairEl, rec) {
    const [dp,pp]=pairEl.querySelectorAll('.status-pill');
    if(dp){dp.className='status-pill '+(rec.doneDate?'pill-done-on':'pill-done-off');dp.textContent=rec.doneDate?'✓ выпол':'○ выпол';}
    if(pp){pp.className='status-pill '+(rec.paidDate?'pill-paid-on':'pill-paid-off');pp.textContent=rec.paidDate?'✓ оплач':'○ оплач';}
  }

  function _refreshRowDateCell(pillEl, field, rec) {
    const tr=pillEl.closest('tr'); if(!tr) return;
    const idx=field==='doneDate'?5:6;
    const td=tr.cells[idx]; if(!td) return;
    const sp=td.querySelector('span');
    if(sp) sp.textContent=_fmt(rec[field]);
  }

  /* small popup to edit/clear an already-set date */
  function _datePop(anchor, rec, field, onDone) {
    document.getElementById('dpop')?.remove();
    const pop=document.createElement('div'); pop.id='dpop';
    pop.style.cssText='position:fixed;z-index:9200;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.75rem;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:.5rem;min-width:190px';

    const lbl=document.createElement('div');
    lbl.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)';
    lbl.textContent=field==='doneDate'?'Дата выполнения':'Дата оплаты';
    pop.appendChild(lbl);

    const inp=document.createElement('input'); inp.type='date'; inp.className='cell-input'; inp.value=rec[field]||'';
    pop.appendChild(inp);

    const row=document.createElement('div'); row.style.cssText='display:flex;gap:.4rem';
    row.appendChild(UI.Button({text:'Очистить',variant:'danger',size:'sm',onClick:()=>{
      rec[field]=''; Storage.updateRecord(rec.id,{[field]:''});
      _refreshRowDateCell(anchor,field,rec); onDone(); pop.remove();
    }}));
    row.appendChild(UI.Button({text:'OK',variant:'primary',size:'sm',onClick:()=>{
      rec[field]=inp.value; Storage.updateRecord(rec.id,{[field]:inp.value});
      _refreshRowDateCell(anchor,field,rec); onDone(); pop.remove();
    }}));
    pop.appendChild(row);

    document.body.appendChild(pop);
    const r=anchor.getBoundingClientRect();
    pop.style.top =Math.min(r.bottom+4,window.innerHeight-160)+'px';
    pop.style.left=Math.min(r.left,    window.innerWidth -200)+'px';
    inp.focus();

    const close=e=>{ if(!pop.contains(e.target)&&e.target!==anchor){pop.remove();document.removeEventListener('mousedown',close);}};
    setTimeout(()=>document.addEventListener('mousedown',close),0);
  }

  /* ══ Add / Delete ════════════════════════════ */
  function _addRow() {
    // Create the record in storage immediately — it gets an id
    const rec=Storage.addRecord({
      semesterId:_semId, subject:'',taskNum:'',client:'',
      price:0, doneDate:'',paidDate:'',notes:''
    });
    // Re-read from storage to keep _recs in sync
    _recs=Storage.getRecords(_semId);
    _filter();
    // Focus first text cell of new row
    requestAnimationFrame(()=>{
      const tr=document.querySelector(`tr[data-id="${rec.id}"]`);
      tr?.cells[1]?.click();
      tr?.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }

  async function _del(id) {
    const ok=await UI.confirmDialog({message:'Удалить эту строку навсегда?',confirmText:'Удалить'});
    if(!ok) return;
    Storage.deleteRecord(id); UI.toast('Удалено','warn');
    _recs=Storage.getRecords(_semId);
    _filter();
  }

  /* ══ Helpers ═════════════════════════════════ */
  function _rebuildFilterOpts() {
    const ss=document.getElementById('rsub'),cs=document.getElementById('rcli');
    if(ss){const c=ss.value;ss.innerHTML='';['все предметы',...Storage.getSubjects()].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;if(v===c)o.selected=true;ss.appendChild(o);});}
    if(cs){const c=cs.value;cs.innerHTML='';['все заказчики',...Storage.getClients()].forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;if(v===c)o.selected=true;cs.appendChild(o);});}
  }

  function _fmt(d){
    if(!d) return '—';
    try{return new Date(d+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch{return d;}
  }
  function _today(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function _esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  return { mount };
})();

window.RecordsView = RecordsView;
