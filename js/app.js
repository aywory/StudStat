/**
 * app.js — Router, theme, sidebar, file management
 *
 * THEME SYSTEM
 * ─────────────
 * BASE_THEMES  : always shown as coloured dots in header
 * EXTRA_THEMES : shown in "···" dropdown (add more as you create css files)
 *
 * To add a theme:
 *   1. Create  css/themes/my_theme.css  with :root[data-theme="my_theme"] { … }
 *   2. Add a <link> to it in index.html
 *   3. Push an entry into EXTRA_THEMES below
 */

const App = (() => {

  /* ── Theme registry ─────────────────────────── */
  const BASE_THEMES = [
    { id: 'dark', label: 'Тёмная', bg: '#111111', border: '#3a3a3a' },
    { id: 'white', label: 'Светлая', bg: '#f0f0f0', border: '#cccccc' },
  ];

  const EXTRA_THEMES = [
    {
      id: 'glassmorphism',
      label: 'Glassmorphism',
      bg: 'linear-gradient(135deg, #6ec6ff, #b388ff)',
      border: '#aad4f5'
    },
    {
      id: 'wabi-sabi-clay',
      label: 'Wabi-Sabi Clay',
      bg: 'linear-gradient(135deg, #d4a373, #bc8f6c, #e8d5c4)',
      border: '#c4a48a'
    },
    {
      id: 'bioluminescent-bay',
      label: 'Bioluminescent Bay',
      bg: 'radial-gradient(circle at 30% 40%, #0a2540, #071220, #020a14)',
      border: '#4dd0ff'
    },
    {
      id: 'agate-slice',
      label: 'Agate Slice',
      bg: 'linear-gradient(145deg, #e8d5f0, #d4c0e0, #f0e0f0, #c8b0d0)',
      border: '#b8a0c8'
    },
    {
      id: 'cracked-salt-flats',
      label: 'Cracked Salt Flats',
      bg: 'linear-gradient(135deg, #fafaf8, #f0f0ec, #e8e8e4)',
      border: '#2a2828'
    },
    {
      id: 'foggy-redwood',
      label: 'Foggy Redwood',
      bg: 'linear-gradient(180deg, #c8d8c0 0%, #2a3a28 60%, #1a2218 100%)',
      border: '#6a9a6a'
    },
    {
      id: 'phosphor-decay',
      label: 'Phosphor Decay',
      bg: 'linear-gradient(135deg, #001a00, #002800, #001400)',
      border: '#40ff80'
    },
  ];

  /* ── State ──────────────────────────────────── */
  let _view = null;
  let _semId = null;

  /* ── Init ───────────────────────────────────── */
  async function init() {
    _applyTheme(localStorage.getItem('uchet_theme') || 'dark');
    _buildModalShell();
    _buildHeader();           // header always visible

    /* Try silent auto-open */
    const auto = await Storage.tryAutoOpen();

    if (auto.ok) {
      /* File opened silently — go straight to app */
      _boot();
      return;
    }

    if (auto.needsGesture) {
      /* Permission expired — need ONE click to restore it.
         Show a minimal overlay asking just that click. */
      _showReVerifyPrompt(auto);
      return;
    }

    /* No stored file at all */
    _showFirstRunPrompt();

    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ── File prompts ───────────────────────────── */

  function _showReVerifyPrompt({ handle, name }) {
    const fp = document.getElementById('file-prompt');
    fp.style.display = 'flex';
    fp.innerHTML = `
      <div style="font-size:3rem">📒</div>
      <h1>Учёт работ</h1>
      <p>Последний файл: <strong>${_esc(name)}</strong><br>
         Браузер требует подтверждения доступа.</p>
      <div class="file-prompt-actions">
        <button class="btn btn-primary btn-lg" id="fp-reverify">🔓 Открыть «${_esc(name)}»</button>
        <button class="btn btn-ghost  btn-lg" id="fp-other">Выбрать другой файл</button>
      </div>`;

    document.getElementById('fp-reverify').addEventListener('click', async () => {
      const res = await Storage.reVerify(handle);
      if (res.ok) { fp.style.display = 'none'; _boot(); }
      else UI.toast('Нет доступа к файлу', 'error');
    });
    document.getElementById('fp-other').addEventListener('click', async () => {
      await Storage.forgetFile();
      _showFirstRunPrompt();
    });
  }

  function _showFirstRunPrompt() {
    const fp = document.getElementById('file-prompt');
    fp.style.display = 'flex';
    fp.innerHTML = `
      <div style="font-size:3rem">📒</div>
      <h1>Учёт работ</h1>
      <p>Все данные хранятся локально в JSON-файле на вашем компьютере.<br>
         Выберите существующий файл или создайте новый.</p>
      <div class="file-prompt-actions">
        <button class="btn btn-primary btn-lg" id="fp-open">📂 Открыть файл</button>
        <button class="btn btn-ghost   btn-lg" id="fp-create">✨ Создать новый</button>
      </div>
      <p style="margin-top:1rem;font-size:0.72rem;opacity:0.4">
        File System Access API — данные не покидают ваш компьютер.
      </p>`;

    document.getElementById('fp-open').addEventListener('click', async () => {
      const res = await Storage.openFile();
      if (res.ok) { fp.style.display = 'none'; _boot(); }
      else if (!res.aborted) UI.toast('Ошибка: ' + (res.error || ''), 'error');
    });
    document.getElementById('fp-create').addEventListener('click', async () => {
      const res = await Storage.createFile();
      if (res.ok) { fp.style.display = 'none'; _boot(); }
      else if (!res.aborted) UI.toast('Ошибка: ' + (res.error || ''), 'error');
    });
  }

  /* ── Boot ───────────────────────────────────── */
  function _boot() {
    _buildSidebar();
    navigate('dashboard');
    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ── Navigation ─────────────────────────────── */
  function navigate(view, semId = null) {
    _view = view;
    _semId = semId;
    _buildSidebar();
    const main = document.getElementById('main');
    main.innerHTML = '';
    switch (view) {
      case 'dashboard': DashboardView.mount(main); break;
      case 'records': RecordsView.mount(semId, main); break;
      case 'analytics': AnalyticsView.mount(semId, main); break;
      case 'semesters': _mountSemesters(main); break;
    }
  }

  /* ── Header ─────────────────────────────────── */
  function _buildHeader() {
    const h = document.getElementById('header');
    h.innerHTML = '';

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = '📒 УЧ<span>ЁТ</span>';
    h.appendChild(logo);

    const right = document.createElement('div');
    right.className = 'header-right';

    right.appendChild(_makeThemePicker());

    right.appendChild(UI.Button({
      text: '💾', variant: 'ghost', size: 'sm', title: 'Сохранить немедленно',
      onClick: async () => { await Storage.saveNow(); UI.toast('Сохранено ✓'); }
    }));

    right.appendChild(UI.Button({
      text: '📂', variant: 'ghost', size: 'sm', title: 'Сменить файл',
      onClick: async () => {
        await Storage.forgetFile();
        location.reload();
      }
    }));

    h.appendChild(right);
  }

  /* ── Theme picker ────────────────────────────── */
  function _makeThemePicker() {
    const cur = document.documentElement.getAttribute('data-theme');
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.style.position = 'relative';

    /* Base dots */
    BASE_THEMES.forEach(t => {
      const dot = document.createElement('div');
      dot.className = 'theme-dot' + (cur === t.id ? ' active' : '');
      dot.style.background = t.bg;
      dot.style.border = `2px solid ${t.border}`;
      dot.title = t.label;
      dot.addEventListener('click', () => {
        _applyTheme(t.id);
        _refreshPickerState(wrap);
      });
      wrap.appendChild(dot);
    });

    /* "···" pill for extra themes — always shown so user knows there are more */
    const pill = document.createElement('div');
    pill.className = 'theme-more-btn';
    pill.textContent = '···';
    pill.title = 'Другие темы';
    pill.addEventListener('click', e => {
      e.stopPropagation();
      _toggleExtraDropdown(pill, wrap);
    });
    wrap.appendChild(pill);
    _refreshPickerState(wrap);     // set initial active states

    return wrap;
  }

  function _refreshPickerState(wrap) {
    const cur = document.documentElement.getAttribute('data-theme');
    const dots = wrap.querySelectorAll('.theme-dot');
    dots.forEach((d, i) => d.classList.toggle('active', BASE_THEMES[i]?.id === cur));
    const pill = wrap.querySelector('.theme-more-btn');
    if (pill) pill.classList.toggle('active', EXTRA_THEMES.some(t => t.id === cur));
  }

  function _toggleExtraDropdown(pill, wrap) {
    const existing = wrap.querySelector('.theme-dropdown');
    if (existing) { existing.remove(); return; }

    const cur = document.documentElement.getAttribute('data-theme');
    const dd = document.createElement('div');
    dd.className = 'theme-dropdown';

    /* List ALL themes in dropdown (including base) for discoverability */
    const all = [...BASE_THEMES, ...EXTRA_THEMES];
    all.forEach(t => {
      const item = document.createElement('div');
      item.className = 'theme-dropdown-item' + (t.id === cur ? ' active' : '');

      const swatch = document.createElement('div');
      swatch.className = 'theme-dropdown-swatch';
      // handle gradient bg for swatch
      if (t.bg.includes('gradient')) {
        swatch.style.backgroundImage = t.bg;
      } else {
        swatch.style.background = t.bg;
      }
      swatch.style.borderColor = t.border;

      item.appendChild(swatch);
      item.appendChild(document.createTextNode(t.label));
      item.addEventListener('click', () => {
        _applyTheme(t.id);
        _refreshPickerState(wrap);
        dd.remove();
      });
      dd.appendChild(item);
    });

    wrap.appendChild(dd);

    const close = e => {
      if (!wrap.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function _applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('uchet_theme', id);
  }

  /* ── Sidebar ─────────────────────────────────── */
  function _buildSidebar() {
    const sb = document.getElementById('sidebar');
    sb.innerHTML = '';

    _navSection(sb, 'Главная');
    sb.appendChild(_navItem('🏠', 'Обзор', 'dashboard', null));
    sb.appendChild(_navItem('⚙', 'Семестры', 'semesters', null));

    const sems = Storage.getSemesters();
    if (sems.length) {
      _divider(sb);
      _navSection(sb, 'Учёт');
      sems.forEach(s => sb.appendChild(_navItem('📋', s.label, 'records', s.id)));
      _divider(sb);
      _navSection(sb, 'Аналитика');
      sems.forEach(s => sb.appendChild(_navItem('📊', s.label, 'analytics', s.id)));
    }
  }

  function _navSection(sb, t) {
    const d = document.createElement('div'); d.className = 'nav-section'; d.textContent = t; sb.appendChild(d);
  }
  function _divider(sb) {
    const d = document.createElement('div'); d.className = 'sidebar-divider'; sb.appendChild(d);
  }
  function _navItem(icon, text, view, semId) {
    const el = document.createElement('div');
    el.className = 'nav-item' + (_view === view && _semId === semId ? ' active' : '');
    el.innerHTML = `<span class="nav-icon">${icon}</span><span>${_esc(text)}</span>`;
    el.addEventListener('click', () => navigate(view, semId));
    return el;
  }

  /* ── Semesters ───────────────────────────────── */
  function _mountSemesters(container) {
    const wrap = document.createElement('div');
    const ph = document.createElement('div');
    ph.className = 'page-header';
    ph.innerHTML = `<div class="page-header-left"><h2>Семестры</h2><p class="mt-sm">Управление учебными периодами</p></div>`;
    ph.appendChild(UI.Button({ text: '+ Новый семестр', variant: 'primary', onClick: _semForm }));
    wrap.appendChild(ph);

    const sems = Storage.getSemesters();
    if (!sems.length) {
      wrap.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">🗂</div><p>Нет семестров. Создайте первый.</p></div>`);
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid-3 mt-md';
      sems.forEach(sem => {
        const recs = Storage.getRecords(sem.id);
        const sum = recs.reduce((s, r) => s + (r.price || 0), 0);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><h3>${_esc(sem.label)}</h3></div><p style="font-size:.8rem;margin-bottom:.75rem">${recs.length} работ · ${sum} ₴</p>`;
        const acts = document.createElement('div'); acts.className = 'flex gap-sm';
        acts.appendChild(UI.Button({ text: 'Учёт', variant: 'blue', size: 'sm', onClick: () => navigate('records', sem.id) }));
        acts.appendChild(UI.Button({ text: 'Аналитика', variant: 'ghost', size: 'sm', onClick: () => navigate('analytics', sem.id) }));
        acts.appendChild(UI.Button({ text: '✕', variant: 'danger', size: 'sm', onClick: () => _delSem(sem.id) }));
        card.appendChild(acts);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }
    container.appendChild(wrap);
  }

  async function _semForm() {
    const labelInp = UI.Input({ placeholder: '2 курс 1 семестр 2025г.' });
    const yearInp = UI.Input({ type: 'number', value: new Date().getFullYear() });
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:1rem';
    body.appendChild(UI.FormGroup({ label: 'Название *', child: labelInp }));
    body.appendChild(UI.FormGroup({ label: 'Год', child: yearInp }));
    const cancel = UI.Button({ text: 'Отмена', variant: 'ghost', onClick: () => UI.closeModal() });
    const ok = UI.Button({
      text: 'Создать', variant: 'primary', onClick: () => {
        const label = labelInp.value.trim();
        if (!label) { UI.toast('Введите название', 'error'); return; }
        Storage.addSemester({ label, year: +yearInp.value || new Date().getFullYear() });
        UI.closeModal(); UI.toast('Семестр создан'); navigate('semesters');
      }
    });
    await UI.openModal({ title: 'Новый семестр', bodyEl: body, footerActions: [cancel, ok] });
  }

  async function _delSem(id) {
    const sem = Storage.getSemesters().find(s => s.id === id);
    const recs = Storage.getRecords(id);
    const ok = await UI.confirmDialog({
      message: `Удалить «${sem?.label}»? Вместе с ним ${recs.length} записей.`,
      confirmText: 'Удалить', confirmVariant: 'danger'
    });
    if (!ok) return;
    Storage.deleteSemester(id); UI.toast('Удалено', 'warn'); navigate('semesters');
  }

  /* ── Modal shell ─────────────────────────────── */
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
    bd.addEventListener('click', e => { if (e.target === bd) UI.closeModal(); });
    bd.querySelector('#modal-close').addEventListener('click', () => UI.closeModal());
    document.body.appendChild(bd);
  }

  function _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { init, navigate };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
