/**
 * app.js
 * Main application controller.
 * Handles routing, theme, sidebar, file prompt.
 */

const App = (() => {
  let _currentView   = null;
  let _currentSemId  = null;

  const THEMES = [
    { id: 'dark',  label: 'Тёмная',  dot: '#1a1a1a' },
    { id: 'white', label: 'Светлая', dot: '#f0f0f0' },
  ];

  /* ── Init ─────────────────────────────────── */
  function init() {
    _applyTheme(localStorage.getItem('uchet_theme') || 'dark');
    _buildHeader();
    _buildModalShell();
    if (!Storage.isReady()) {
      _showFilePrompt();
    } else {
      _boot();
    }

    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ── File prompt ──────────────────────────── */
  function _showFilePrompt() {
    const prompt = document.getElementById('file-prompt');
    if (!prompt) return;
    prompt.style.display = 'flex';

    document.getElementById('fp-open')?.addEventListener('click', async () => {
      const res = await Storage.openFile();
      if (res.ok) { prompt.style.display = 'none'; _boot(); }
      else if (!res.aborted) UI.toast('Ошибка открытия файла: ' + (res.error || ''), 'error');
    });

    document.getElementById('fp-create')?.addEventListener('click', async () => {
      const res = await Storage.createFile();
      if (res.ok) { prompt.style.display = 'none'; _boot(); }
      else if (!res.aborted) UI.toast('Ошибка создания файла: ' + (res.error || ''), 'error');
    });
  }

  /* ── Boot after file loaded ───────────────── */
  function _boot() {
    _buildSidebar();
    navigate('dashboard');
  }

  /* ── Navigation ───────────────────────────── */
  function navigate(view, semesterId = null) {
    _currentView  = view;
    _currentSemId = semesterId;
    _buildSidebar();   // rebuild to update active state
    _renderMain();
  }

  function _renderMain() {
    const main = document.getElementById('main');
    main.innerHTML = '';

    switch (_currentView) {
      case 'dashboard':
        DashboardView.mount(main);
        break;
      case 'records':
        if (_currentSemId) RecordsView.mount(_currentSemId, main);
        break;
      case 'analytics':
        if (_currentSemId) AnalyticsView.mount(_currentSemId, main);
        break;
      case 'semesters':
        _renderSemestersManager(main);
        break;
      default:
        main.textContent = 'Неизвестный раздел';
    }
  }

  /* ── Header ───────────────────────────────── */
  function _buildHeader() {
    const header = document.getElementById('header');
    header.innerHTML = '';

    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.innerHTML = '📒 УЧ<span>ЁТ</span>';
    header.appendChild(logo);

    const right = document.createElement('div');
    right.className = 'header-right';

    /* theme picker */
    const picker = document.createElement('div');
    picker.className = 'theme-picker';
    THEMES.forEach(t => {
      const dot = document.createElement('div');
      dot.className = 'theme-dot' + (document.documentElement.getAttribute('data-theme') === t.id ? ' active' : '');
      dot.style.background = t.dot;
      dot.style.border = `2px solid ${t.id === 'dark' ? '#444' : '#ccc'}`;
      dot.title = t.label;
      dot.addEventListener('click', () => {
        _applyTheme(t.id);
        picker.querySelectorAll('.theme-dot').forEach((d,i) => d.classList.toggle('active', THEMES[i].id === t.id));
      });
      picker.appendChild(dot);
    });
    right.appendChild(picker);

    /* save button */
    const saveBtn = UI.Button({ text: '💾 Сохранить', variant: 'ghost', size: 'sm', title: 'Сохранить изменения в файл', onClick: async () => {
      await Storage.saveNow();
      UI.toast('Файл сохранён');
    }});
    right.appendChild(saveBtn);

    header.appendChild(right);
  }

  /* ── Sidebar ──────────────────────────────── */
  function _buildSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = '';

    /* Dashboard */
    sidebar.appendChild(_navSection('Главная'));
    sidebar.appendChild(_navItem('🏠', 'Обзор', 'dashboard', null));
    sidebar.appendChild(_navItem('⚙', 'Семестры', 'semesters', null));

    /* Semesters */
    const sems = Storage.getSemesters();
    if (sems.length) {
      sidebar.appendChild(document.createElement('div')).className = 'sidebar-divider';
      sidebar.appendChild(_navSection('Учёт'));
      sems.forEach(sem => {
        sidebar.appendChild(_navItem('📋', sem.label, 'records', sem.id));
      });
      sidebar.appendChild(document.createElement('div')).className = 'sidebar-divider';
      sidebar.appendChild(_navSection('Аналитика'));
      sems.forEach(sem => {
        sidebar.appendChild(_navItem('📊', sem.label, 'analytics', sem.id));
      });
    }
  }

  function _navSection(text) {
    const el = document.createElement('div');
    el.className = 'nav-section';
    el.textContent = text;
    return el;
  }

  function _navItem(icon, text, view, semId) {
    const el = document.createElement('div');
    el.className = 'nav-item' + (_currentView === view && _currentSemId === semId ? ' active' : '');
    el.innerHTML = `<span class="nav-icon">${icon}</span><span>${text}</span>`;
    el.addEventListener('click', () => navigate(view, semId));
    return el;
  }

  /* ── Semesters manager ────────────────────── */
  function _renderSemestersManager(container) {
    const wrap = document.createElement('div');
    wrap.insertAdjacentHTML('beforeend', `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Семестры</h2>
          <p class="mt-sm">Управление учебными периодами</p>
        </div>
      </div>`);

    const addBtn = UI.Button({ text: '+ Новый семестр', variant: 'primary', onClick: () => _openSemForm(null) });
    wrap.querySelector('.page-header').appendChild(addBtn);

    const sems = Storage.getSemesters();
    if (!sems.length) {
      wrap.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">🗂</div><p>Нет семестров. Создайте первый.</p></div>`);
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid-3 mt-md';
      sems.forEach(sem => {
        const recs = Storage.getRecords(sem.id);
        const sum  = recs.reduce((s,r)=>s+(r.price||0),0);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <h3>${_esc(sem.label)}</h3>
          </div>
          <p style="font-size:0.8rem;margin-bottom:0.75rem">${recs.length} работ · ${sum} ₴</p>`;
        const actions = document.createElement('div');
        actions.className = 'flex gap-sm';
        actions.appendChild(UI.Button({ text: 'Учёт',      variant: 'blue',    size: 'sm', onClick: () => navigate('records',   sem.id) }));
        actions.appendChild(UI.Button({ text: 'Аналитика', variant: 'ghost',   size: 'sm', onClick: () => navigate('analytics', sem.id) }));
        actions.appendChild(UI.Button({ text: '✕',         variant: 'danger',  size: 'sm', onClick: () => _deleteSem(sem.id) }));
        card.appendChild(actions);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }

    container.appendChild(wrap);
  }

  async function _openSemForm() {
    const labelInp = UI.Input({ placeholder: '2 курс 1 семестр 2025г.' });
    const yearInp  = UI.Input({ type: 'number', value: new Date().getFullYear(), placeholder: 'Год' });

    const body = document.createElement('div');
    body.style.display='flex'; body.style.flexDirection='column'; body.style.gap='1rem';
    body.appendChild(UI.FormGroup({ label: 'Название семестра *', child: labelInp }));
    body.appendChild(UI.FormGroup({ label: 'Год', child: yearInp }));

    const cancel = UI.Button({ text: 'Отмена', variant: 'ghost', onClick: () => UI.closeModal() });
    const ok     = UI.Button({ text: 'Создать', variant: 'primary', onClick: () => {
      const label = labelInp.value.trim();
      if (!label) { UI.toast('Введите название', 'error'); return; }
      Storage.addSemester({ label, year: +yearInp.value || new Date().getFullYear() });
      UI.closeModal();
      UI.toast('Семестр создан');
      navigate('semesters');
    }});

    await UI.openModal({ title: 'Новый семестр', bodyEl: body, footerActions: [cancel, ok] });
  }

  async function _deleteSem(id) {
    const sems = Storage.getSemesters();
    const sem  = sems.find(s => s.id === id);
    const recs = Storage.getRecords(id);
    const ok = await UI.confirmDialog({ message: `Удалить семестр "${sem?.label}"? Вместе с ним удалятся ${recs.length} записей.`, confirmText: 'Удалить', confirmVariant: 'danger' });
    if (!ok) return;
    Storage.deleteSemester(id);
    UI.toast('Семестр удалён', 'warn');
    navigate('semesters');
  }

  /* ── Theme ────────────────────────────────── */
  function _applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('uchet_theme', id);
  }

  /* ── Modal shell (created once) ───────────── */
  function _buildModalShell() {
    if (document.getElementById('modal-backdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button class="btn btn-ghost btn-sm btn-icon" id="modal-close" title="Закрыть">✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;
    bd.addEventListener('click', e => { if (e.target === bd) UI.closeModal(); });
    bd.querySelector('#modal-close').addEventListener('click', () => UI.closeModal());
    document.body.appendChild(bd);
  }

  function _esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, navigate };
})();

window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());
