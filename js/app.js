/**
 * app.js — Router, theme auto-discovery, sidebar, file management
 *
 * ══ THEME SYSTEM ══════════════════════════════════════════════════
 * To add a new theme:
 *   1. Create  css/themes/my_theme.css
 *   2. Add inside :root[data-theme="my_theme"] { … }:
 *        --theme-label:  'Моя тема';        ← display name
 *        --theme-swatch: '#hexcolor';        ← swatch color (or gradient string)
 *   3. Add ONE line in index.html:
 *        <link rel="stylesheet" href="css/themes/my_theme.css">
 *   That's it. JS discovers everything automatically.
 * ══════════════════════════════════════════════════════════════════
 */

const App = (() => {

  let _view = null;
  let _semId = null;
  let _themes = [];   // [{id, label, swatch}] — populated by _discoverThemes()

  /* ══ Init ══════════════════════════════════════ */
  async function init() {
    _applyTheme(localStorage.getItem('uchet_theme') || 'dark');
    _themes = _discoverThemes();
    _buildModalShell();
    _buildHeader();

    const auto = await Storage.tryAutoOpen();
    if (auto.ok) { _boot(); return; }
    if (auto.needsGesture) { _showReVerifyPrompt(auto); return; }
    _showFirstRunPrompt();

    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ══ Theme auto-discovery ══════════════════════ */
  /**
   * Scans all <link href="…css/themes/…"> tags already in the document.
   * For each linked stylesheet reads --theme-label and --theme-swatch
   * from the computed style of :root (after the theme is temporarily applied).
   * Falls back to the file-name (without extension) if variables are absent.
   */
  function _discoverThemes() {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(l => l.href.includes('css/themes/'));

    const cur = document.documentElement.getAttribute('data-theme');
    const result = [];

    links.forEach(link => {
      // derive id from filename: "css/themes/dark_theme.css" → "dark_theme" → id candidate
      const filename = link.href.split('/').pop().replace('.css', '');
      // id is everything before "_theme" suffix if present, else the full filename
      const id = filename.replace(/_theme$/, '') === filename ? filename : filename.replace(/_theme$/, '');

      // Temporarily apply this theme to read its CSS variables
      document.documentElement.setAttribute('data-theme', id);
      const style = getComputedStyle(document.documentElement);

      let label = style.getPropertyValue('--theme-label').trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '');
      let swatch = style.getPropertyValue('--theme-swatch').trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '');

      // fallback: humanize the file name
      if (!label) label = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (!swatch) swatch = '#888';

      result.push({ id, label, swatch });
    });

    // Restore original theme
    document.documentElement.setAttribute('data-theme', cur);
    return result;
  }

  /* ══ File prompts ══════════════════════════════ */
  function _showReVerifyPrompt({ handle, name, isFileFallback }) {
  const fp = document.getElementById('file-prompt');
  fp.style.display = 'flex';
  
  if (isFileFallback) {
    // Для fallback просто показываем кнопку открыть файл заново
    fp.innerHTML = `
      <div style="font-size:3rem">📒</div>
      <h1>Учёт работ</h1>
      <p>Последний файл: <strong>${_esc(name)}</strong><br>
         Требуется повторное открытие файла.</p>
      <div class="file-prompt-actions">
        <button class="btn btn-primary btn-lg" id="fp-open-again">📂 Открыть «${_esc(name)}»</button>
        <button class="btn btn-ghost btn-lg" id="fp-other">Выбрать другой файл</button>
      </div>`;
    document.getElementById('fp-open-again').addEventListener('click', async () => {
      fp.style.display = 'none';
      const r = await Storage.openFile();
      if (r.ok) { _boot(); }
      else if (!r.aborted) UI.toast('Ошибка: ' + (r.error || ''), 'error');
    });
    document.getElementById('fp-other').addEventListener('click', async () => {
      await Storage.forgetFile(); _showFirstRunPrompt();
    });
    return;
  }
  
  // Стандартный случай с FileSystemFileHandle
  fp.innerHTML = `
    <div style="font-size:3rem">📒</div>
    <h1>Учёт работ</h1>
    <p>Последний файл: <strong>${_esc(name)}</strong><br>
       Браузер требует подтверждения доступа — нужен один клик.</p>
    <div class="file-prompt-actions">
      <button class="btn btn-primary btn-lg" id="fp-rv">🔓 Открыть «${_esc(name)}»</button>
      <button class="btn btn-ghost btn-lg" id="fp-other">Выбрать другой файл</button>
    </div>`;
  document.getElementById('fp-rv').addEventListener('click', async () => {
    const r = await Storage.reVerify(handle);
    if (r.ok) { fp.style.display = 'none'; _boot(); }
    else UI.toast('Нет доступа к файлу', 'error');
  });
  document.getElementById('fp-other').addEventListener('click', async () => {
    await Storage.forgetFile(); _showFirstRunPrompt();
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
      <p style="margin-top:1rem;font-size:.72rem;opacity:.4">
        File System Access API — данные не покидают ваш компьютер.
      </p>`;
    document.getElementById('fp-open').addEventListener('click', async () => {
      const r = await Storage.openFile();
      if (r.ok) { fp.style.display = 'none'; _boot(); }
      else if (!r.aborted) UI.toast('Ошибка: ' + (r.error || ''), 'error');
    });
    document.getElementById('fp-create').addEventListener('click', async () => {
      const r = await Storage.createFile();
      if (r.ok) { fp.style.display = 'none'; _boot(); }
      else if (!r.aborted) UI.toast('Ошибка: ' + (r.error || ''), 'error');
    });
  }

  /* ══ Boot ══════════════════════════════════════ */
  function _boot() {
    _buildSidebar();
    navigate('dashboard');
    window.addEventListener('beforeunload', () => Storage.saveNow());
  }

  /* ══ Navigation ════════════════════════════════ */
  function navigate(view, semId = null) {
    _view = view; _semId = semId;
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

  /* ══ Header ════════════════════════════════════ */
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
      text: '📂', variant: 'ghost', size: 'sm', title: 'Сменить файл данных',
      onClick: async () => { await Storage.forgetFile(); location.reload(); }
    }));
    h.appendChild(right);
  }

  /* ══ Theme picker ══════════════════════════════ */
  function _makeThemePicker() {
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.style.position = 'relative';

    /* First two themes as dots, rest in "···" dropdown */
    const base = _themes.slice(0, 2);
    const extra = _themes.slice(2);

    base.forEach(t => {
      const dot = document.createElement('div');
      dot.className = 'theme-dot';
      _applySwatchStyle(dot, t.swatch);
      dot.title = t.label;
      dot.addEventListener('click', () => { _applyTheme(t.id); _refreshPicker(wrap); });
      wrap.appendChild(dot);
    });

    /* "···" pill — always rendered (even if no extras, shows all in dropdown) */
    const pill = document.createElement('div');
    pill.className = 'theme-more-btn';
    pill.textContent = '···';
    pill.title = 'Все темы';
    pill.addEventListener('click', e => { e.stopPropagation(); _toggleDropdown(pill, wrap); });
    wrap.appendChild(pill);

    _refreshPicker(wrap);
    return wrap;
  }

  function _applySwatchStyle(el, swatch) {
    if (!swatch) return;

    // Читаем переменную --border из текущей темы
    const borderColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--border')
      .trim();

    // Если переменная не задана — fallback
    const border = borderColor || 'rgba(255,255,255,0.2)';

    if (swatch.includes('gradient') || swatch.includes('(')) {
      el.style.backgroundImage = swatch;
    } else {
      el.style.background = swatch;
    }
    // Применяем границу из темы
    el.style.border = `2px solid ${border}`;
  }

  function _refreshPicker(wrap) {
    const cur = document.documentElement.getAttribute('data-theme');
    const dots = [...wrap.querySelectorAll('.theme-dot')];
    const base = _themes.slice(0, 2);
    dots.forEach((d, i) => d.classList.toggle('active', base[i]?.id === cur));
    const pill = wrap.querySelector('.theme-more-btn');
    if (pill) pill.classList.toggle('active', _themes.slice(2).some(t => t.id === cur));
  }

  function _toggleDropdown(pill, wrap) {
    const ex = wrap.querySelector('.theme-dropdown');
    if (ex) { ex.remove(); return; }

    const cur = document.documentElement.getAttribute('data-theme');
    const dd = document.createElement('div');
    dd.className = 'theme-dropdown';

    _themes.forEach(t => {
      const item = document.createElement('div');
      item.className = 'theme-dropdown-item' + (t.id === cur ? ' active' : '');
      const sw = document.createElement('div');
      sw.className = 'theme-dropdown-swatch';
      _applySwatchStyle(sw, t.swatch);
      item.appendChild(sw);
      item.appendChild(document.createTextNode(t.label));
      item.addEventListener('click', () => {
        _applyTheme(t.id); _refreshPicker(wrap); dd.remove();
      });
      dd.appendChild(item);
    });

    wrap.appendChild(dd);
    const close = e => { if (!wrap.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function _applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('uchet_theme', id);
  }

  /* ══ Sidebar ═══════════════════════════════════ */
  function _buildSidebar() {
    const sb = document.getElementById('sidebar');
    sb.innerHTML = '';
    _navSection(sb, 'Главная');
    sb.appendChild(_navItem('🏠', 'Обзор', 'dashboard', null));
    sb.appendChild(_navItem('⚙', 'Семестры', 'semesters', null));
    const sems = Storage.getSemesters();
    if (sems.length) {
      _divider(sb); _navSection(sb, 'Учёт');
      sems.forEach(s => sb.appendChild(_navItem('📋', s.label, 'records', s.id)));
      _divider(sb); _navSection(sb, 'Аналитика');
      sems.forEach(s => sb.appendChild(_navItem('📊', s.label, 'analytics', s.id)));
    }
  }
  function _navSection(sb, t) { const d = document.createElement('div'); d.className = 'nav-section'; d.textContent = t; sb.appendChild(d); }
  function _divider(sb) { const d = document.createElement('div'); d.className = 'sidebar-divider'; sb.appendChild(d); }
  function _navItem(icon, text, view, semId) {
    const el = document.createElement('div');
    el.className = 'nav-item' + (_view === view && _semId === semId ? ' active' : '');
    el.innerHTML = `<span class="nav-icon">${icon}</span><span>${_esc(text)}</span>`;
    el.addEventListener('click', () => navigate(view, semId));
    return el;
  }

  /* ══ Semesters ═════════════════════════════════ */
  function _mountSemesters(container) {
    const wrap = document.createElement('div');
    const ph = document.createElement('div'); ph.className = 'page-header';
    ph.innerHTML = `<div class="page-header-left"><h2>Семестры</h2><p class="mt-sm">Управление учебными периодами</p></div>`;
    ph.appendChild(UI.Button({ text: '+ Новый семестр', variant: 'primary', onClick: _semForm }));
    wrap.appendChild(ph);
    const sems = Storage.getSemesters();
    if (!sems.length) {
      wrap.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="empty-icon">🗂</div><p>Нет семестров. Создайте первый.</p></div>');
    } else {
      const grid = document.createElement('div'); grid.className = 'grid-3 mt-md';
      sems.forEach(sem => {
        const recs = Storage.getRecords(sem.id);
        const sum = recs.reduce((s, r) => s + (r.price || 0), 0);
        const paid = recs.filter(r => r.doneDate && r.paidDate).reduce((s, r) => s + (r.price || 0), 0);
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<div class="card-header"><h3>${_esc(sem.label)}</h3></div><p style="font-size:.8rem;margin-bottom:.75rem">${recs.length} работ · сумма ${sum} ₴ · оплачено ${paid} ₴</p>`;
        const acts = document.createElement('div'); acts.className = 'flex gap-sm';
        acts.appendChild(UI.Button({ text: 'Учёт', variant: 'blue', size: 'sm', onClick: () => navigate('records', sem.id) }));
        acts.appendChild(UI.Button({ text: 'Аналитика', variant: 'ghost', size: 'sm', onClick: () => navigate('analytics', sem.id) }));
        acts.appendChild(UI.Button({ text: '✕', variant: 'danger', size: 'sm', onClick: () => _delSem(sem.id) }));
        card.appendChild(acts); grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }
    container.appendChild(wrap);
  }

  async function _semForm() {
    const li = UI.Input({ placeholder: '2 курс 1 семестр 2025г.' });
    const yi = UI.Input({ type: 'number', value: new Date().getFullYear() });
    const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:1rem';
    body.appendChild(UI.FormGroup({ label: 'Название *', child: li }));
    body.appendChild(UI.FormGroup({ label: 'Год', child: yi }));
    const cancel = UI.Button({ text: 'Отмена', variant: 'ghost', onClick: () => UI.closeModal() });
    const ok = UI.Button({
      text: 'Создать', variant: 'primary', onClick: () => {
        const label = li.value.trim();
        if (!label) { UI.toast('Введите название', 'error'); return; }
        Storage.addSemester({ label, year: +yi.value || new Date().getFullYear() });
        UI.closeModal(); UI.toast('Семестр создан'); navigate('semesters');
      }
    });
    await UI.openModal({ title: 'Новый семестр', bodyEl: body, footerActions: [cancel, ok] });
  }

  async function _delSem(id) {
    const sem = Storage.getSemesters().find(s => s.id === id);
    const recs = Storage.getRecords(id);
    const ok = await UI.confirmDialog({ message: `Удалить «${sem?.label}»? Вместе с ним ${recs.length} записей.`, confirmText: 'Удалить', confirmVariant: 'danger' });
    if (!ok) return;
    Storage.deleteSemester(id); UI.toast('Удалено', 'warn'); navigate('semesters');
  }

  /* ══ Modal shell ═══════════════════════════════ */
  function _buildModalShell() {
    if (document.getElementById('modal-backdrop')) return;
    const bd = document.createElement('div'); bd.id = 'modal-backdrop';
    bd.innerHTML = `<div class="modal"><div class="modal-header"><h3 class="modal-title"></h3><button class="btn btn-ghost btn-sm btn-icon" id="modal-close">✕</button></div><div class="modal-body"></div><div class="modal-footer"></div></div>`;
    bd.addEventListener('click', e => { if (e.target === bd) UI.closeModal(); });
    bd.querySelector('#modal-close').addEventListener('click', () => UI.closeModal());
    document.body.appendChild(bd);
  }

  function _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  return { init, navigate };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
