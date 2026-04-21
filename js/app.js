/**
 * app.js — Main controller
 * Routing · Theme · File prompt · Sidebar · Semesters
 */

const App = (() => {
  let _currentView  = null;
  let _currentSemId = null;

  /* BASE themes always shown as dots; extras in dropdown */
  const BASE_THEMES = [
    { id: 'dark',  label: 'Тёмная',  bg: '#111', border: '#444' },
    { id: 'white', label: 'Светлая', bg: '#f0f0f0', border: '#ccc' },
  ];
  /* Extra themes go here — add more as you create them */
  const EXTRA_THEMES = [
    // { id: 'glassmorphism', label: 'Glassmorphism', bg: 'rgba(120,200,255,0.3)', border: '#adf' },
  ];

  /* ── Init ──────────────────────────────────── */
  async function init() {
    _applyTheme(localStorage.getItem('uchet_theme') || 'dark');
    _buildHeader();
    _buildModalShell();

    /* Try to open last file automatically */
    const auto = await Storage.tryAutoOpen();
    if (auto.ok) {
      _hideFilePrompt();
      _boot();
      return;
    }

    /* Show file prompt — but if we know the last file name, show it */
    _showFilePrompt(auto.handle ? auto : null);

    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ── File prompt ───────────────────────────── */
  function _showFilePrompt(pendingAuto) {
    const prompt = document.getElementById('file-prompt');
    prompt.style.display = 'flex';

    const lastName = Storage.getSavedFileName();

    /* If we have a stored handle but need re-permission — show a dedicated button */
    if (pendingAuto?.handle && lastName) {
      const hint = document.getElementById('fp-hint');
      if (hint) {
        hint.innerHTML = `Последний файл: <strong>${lastName}</strong>`;
        hint.style.display = 'block';
      }
      const reopenBtn = document.getElementById('fp-reopen');
      if (reopenBtn) {
        reopenBtn.style.display = 'inline-flex';
        reopenBtn.textContent = `🔄 Открыть «${lastName}»`;
        reopenBtn.addEventListener('click', async () => {
          const res = await Storage.reVerifyHandle(pendingAuto.handle);
          if (res.ok) { _hideFilePrompt(); _boot(); }
          else UI.toast('Не удалось получить доступ к файлу', 'error');
        });
      }
    }

    document.getElementById('fp-open')?.addEventListener('click', async () => {
      const res = await Storage.openFile();
      if (res.ok) { _hideFilePrompt(); _boot(); }
      else if (!res.aborted) UI.toast('Ошибка: ' + (res.error || ''), 'error');
    });

    document.getElementById('fp-create')?.addEventListener('click', async () => {
      const res = await Storage.createFile();
      if (res.ok) { _hideFilePrompt(); _boot(); }
      else if (!res.aborted) UI.toast('Ошибка: ' + (res.error || ''), 'error');
    });
  }

  function _hideFilePrompt() {
    const p = document.getElementById('file-prompt');
    if (p) p.style.display = 'none';
  }

  /* ── Boot ──────────────────────────────────── */
  function _boot() {
    _buildSidebar();
    navigate('dashboard');
  }

  /* ── Navigation ────────────────────────────── */
  function navigate(view, semesterId = null) {
    _currentView  = view;
    _currentSemId = semesterId;
    _buildSidebar();
    _renderMain();
  }

  function _renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '';
    switch (_currentView) {
      case 'dashboard':  DashboardView.mount(main);                                break;
      case 'records':    if (_currentSemId) RecordsView.mount(_currentSemId, main); break;
      case 'analytics':  if (_currentSemId) AnalyticsView.mount(_currentSemId, main); break;
      case 'semesters':  _renderSemestersManager(main);                            break;
    }
  }

  /* ── Header ────────────────────────────────── */
  function _buildHeader() {
    const header = document.getElementById('header');
    header.innerHTML = '';

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = '📒 УЧ<span>ЁТ</span>';
    header.appendChild(logo);

    const right = document.createElement('div');
    right.className = 'header-right';

    /* Theme picker */
    right.appendChild(_buildThemePicker());

    /* Save button */
    const saveBtn = UI.Button({
      text: '💾 Сохранить', variant: 'ghost', size: 'sm',
      title: 'Сохранить в файл немедленно',
      onClick: async () => { await Storage.saveNow(); UI.toast('Сохранено ✓'); }
    });
    right.appendChild(saveBtn);

    /* Change file button */
    const changeBtn = UI.Button({
      text: '📂', variant: 'ghost', size: 'sm', title: 'Сменить файл',
      onClick: async () => {
        await Storage.forgetFile();
        location.reload();
      }
    });
    right.appendChild(changeBtn);

    header.appendChild(right);
  }

  /* ── Theme picker ──────────────────────────── */
  function _buildThemePicker() {
    const current = document.documentElement.getAttribute('data-theme');
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.style.position = 'relative';

    /* Base theme dots */
    BASE_THEMES.forEach(t => {
      const dot = document.createElement('div');
      dot.className = 'theme-dot' + (current === t.id ? ' active' : '');
      dot.style.cssText = `background:${t.bg};border:2px solid ${t.border}`;
      dot.title = t.label;
      dot.addEventListener('click', () => _switchTheme(t.id, wrap));
      wrap.appendChild(dot);
    });

    /* "More" pill button — only show if there are extra themes */
    const allExtra = EXTRA_THEMES;
    if (allExtra.length > 0) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'theme-more-btn' + (allExtra.some(t => t.id === current) ? ' active' : '');
      moreBtn.textContent = '···';
      moreBtn.title = 'Другие темы';
      moreBtn.addEventListener('click', e => {
        e.stopPropagation();
        _toggleThemeDropdown(moreBtn, wrap, allExtra);
      });
      wrap.appendChild(moreBtn);
    }

    return wrap;
  }

  function _switchTheme(id, pickerWrap) {
    _applyTheme(id);
    /* Update active states on dots */
    pickerWrap.querySelectorAll('.theme-dot').forEach((dot, i) => {
      dot.classList.toggle('active', BASE_THEMES[i]?.id === id);
    });
    const moreBtn = pickerWrap.querySelector('.theme-more-btn');
    if (moreBtn) moreBtn.classList.toggle('active', EXTRA_THEMES.some(t => t.id === id));
    /* Close dropdown if open */
    pickerWrap.querySelector('.theme-dropdown')?.remove();
  }

  function _toggleThemeDropdown(btn, wrap, themes) {
    const existing = wrap.querySelector('.theme-dropdown');
    if (existing) { existing.remove(); btn.classList.remove('active'); return; }

    const current = document.documentElement.getAttribute('data-theme');
    const dd = document.createElement('div');
    dd.className = 'theme-dropdown';

    themes.forEach(t => {
      const item = document.createElement('div');
      item.className = 'theme-dropdown-item' + (t.id === current ? ' active' : '');
      const swatch = document.createElement('div');
      swatch.className = 'theme-dropdown-swatch';
      swatch.style.background = t.bg || '#888';
      item.appendChild(swatch);
      item.insertAdjacentText('beforeend', t.label);
      item.addEventListener('click', () => { _switchTheme(t.id, wrap); });
      dd.appendChild(item);
    });

    wrap.appendChild(dd);
    btn.classList.add('active');

    /* Close on outside click */
    const close = e => { if (!wrap.contains(e.target)) { dd.remove(); btn.classList.remove('active'); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  /* ── Sidebar ───────────────────────────────── */
  function _buildSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';

    _nav(sidebar, 'Главная');
    sidebar.appendChild(_navItem('🏠', 'Обзор',    'dashboard', null));
    sidebar.appendChild(_navItem('⚙', 'Семестры', 'semesters', null));

    const sems = Storage.getSemesters();
    if (sems.length) {
      _divider(sidebar);
      _nav(sidebar, 'Учёт');
      sems.forEach(s => sidebar.appendChild(_navItem('📋', s.label, 'records',   s.id)));
      _divider(sidebar);
      _nav(sidebar, 'Аналитика');
      sems.forEach(s => sidebar.appendChild(_navItem('📊', s.label, 'analytics', s.id)));
    }
  }

  function _nav(sb, text) { const d = document.createElement('div'); d.className='nav-section'; d.textContent=text; sb.appendChild(d); }
  function _divider(sb)   { const d = document.createElement('div'); d.className='sidebar-divider'; sb.appendChild(d); }

  function _navItem(icon, text, view, semId) {
    const el = document.createElement('div');
    el.className = 'nav-item' + (_currentView===view && _currentSemId===semId ? ' active' : '');
    el.innerHTML = `<span class="nav-icon">${icon}</span><span>${_esc(text)}</span>`;
    el.addEventListener('click', () => navigate(view, semId));
    return el;
  }

  /* ── Semesters manager ─────────────────────── */
  function _renderSemestersManager(container) {
    const wrap = document.createElement('div');
    const ph = document.createElement('div');
    ph.className = 'page-header';
    ph.innerHTML = `<div class="page-header-left"><h2>Семестры</h2><p class="mt-sm">Управление учебными периодами</p></div>`;
    ph.appendChild(UI.Button({ text: '+ Новый семестр', variant: 'primary', onClick: _openSemForm }));
    wrap.appendChild(ph);

    const sems = Storage.getSemesters();
    if (!sems.length) {
      wrap.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">🗂</div><p>Нет семестров. Создайте первый.</p></div>`);
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid-3 mt-md';
      sems.forEach(sem => {
        const recs = Storage.getRecords(sem.id);
        const sum  = recs.reduce((s,r) => s+(r.price||0), 0);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><h3>${_esc(sem.label)}</h3></div><p style="font-size:0.8rem;margin-bottom:0.75rem">${recs.length} работ · ${sum} ₴</p>`;
        const acts = document.createElement('div');
        acts.className = 'flex gap-sm';
        acts.appendChild(UI.Button({ text:'Учёт',      variant:'blue',   size:'sm', onClick:()=>navigate('records',   sem.id) }));
        acts.appendChild(UI.Button({ text:'Аналитика', variant:'ghost',  size:'sm', onClick:()=>navigate('analytics', sem.id) }));
        acts.appendChild(UI.Button({ text:'✕',         variant:'danger', size:'sm', onClick:()=>_deleteSem(sem.id) }));
        card.appendChild(acts);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }
    container.appendChild(wrap);
  }

  async function _openSemForm() {
    const labelInp = UI.Input({ placeholder: '2 курс 1 семестр 2025г.' });
    const yearInp  = UI.Input({ type:'number', value: new Date().getFullYear() });
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:1rem';
    body.appendChild(UI.FormGroup({ label:'Название *', child:labelInp }));
    body.appendChild(UI.FormGroup({ label:'Год',        child:yearInp  }));

    const cancel = UI.Button({ text:'Отмена',  variant:'ghost',   onClick:()=>UI.closeModal() });
    const ok     = UI.Button({ text:'Создать', variant:'primary', onClick:() => {
      const label = labelInp.value.trim();
      if (!label) { UI.toast('Введите название', 'error'); return; }
      Storage.addSemester({ label, year:+yearInp.value||new Date().getFullYear() });
      UI.closeModal(); UI.toast('Семестр создан'); navigate('semesters');
    }});
    await UI.openModal({ title:'Новый семестр', bodyEl:body, footerActions:[cancel,ok] });
  }

  async function _deleteSem(id) {
    const sem  = Storage.getSemesters().find(s=>s.id===id);
    const recs = Storage.getRecords(id);
    const ok = await UI.confirmDialog({
      message:`Удалить "${sem?.label}"? Вместе с ним ${recs.length} записей.`,
      confirmText:'Удалить', confirmVariant:'danger'
    });
    if (!ok) return;
    Storage.deleteSemester(id); UI.toast('Семестр удалён','warn'); navigate('semesters');
  }

  /* ── Theme ─────────────────────────────────── */
  function _applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('uchet_theme', id);
  }

  /* ── Modal shell ───────────────────────────── */
  function _buildModalShell() {
    if (document.getElementById('modal-backdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button class="btn btn-ghost btn-sm btn-icon" id="modal-close">✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;
    bd.addEventListener('click', e => { if (e.target===bd) UI.closeModal(); });
    bd.querySelector('#modal-close').addEventListener('click', () => UI.closeModal());
    document.body.appendChild(bd);
  }

  function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, navigate };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
