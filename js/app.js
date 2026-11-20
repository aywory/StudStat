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
    _buildControls();

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
  function _showReVerifyPrompt({ handle, name }) {
    const fp = document.getElementById('file-prompt');
    fp.style.display = 'flex';
    fp.innerHTML = `
      <span class="brand-mark prompt-mark" aria-hidden="true"></span>
      <h1>Учёт работ</h1>
      <p>Последний файл: <strong>${_esc(name)}</strong><br>
         Браузер требует подтверждения доступа — нужен один клик.</p>
      <div class="file-prompt-actions">
        <button class="btn btn-primary btn-lg" id="fp-rv">🔓 Открыть «${_esc(name)}»</button>
        <button class="btn btn-ghost   btn-lg" id="fp-other">Выбрать другой файл</button>
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
      <span class="brand-mark prompt-mark" aria-hidden="true"></span>
      <h1>Учёт работ</h1>
      <p>Все данные хранятся локально в JSON-файле на вашем компьютере.<br>
         Выберите существующий файл или создайте новый.</p>
      <div class="file-prompt-actions">
        <button class="btn btn-primary btn-lg" id="fp-open">${UI.Icon('folder')} Открыть файл</button>
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
  function _buildControls() {
    const controls = document.getElementById('app-controls');
    const nav = document.getElementById('navigation');
    const menu = UI.Button({ icon: UI.Icon('panel'), onClick: () => setMenuHidden(!nav.hidden) });
    menu.setAttribute('aria-controls', nav.id);

    function setMenuHidden(hidden) {
      nav.hidden = hidden;
      document.getElementById('app').classList.toggle('menu-hidden', hidden);
      menu.title = hidden ? 'Показать меню' : 'Скрыть меню';
      menu.setAttribute('aria-label', menu.title);
      menu.setAttribute('aria-expanded', String(!hidden));
      menu.querySelector('.btn-icon-inner').innerHTML = UI.Icon(hidden ? 'expand' : 'panel');
      localStorage.setItem('uchet_menu_hidden', String(hidden));
    }

    setMenuHidden(localStorage.getItem('uchet_menu_hidden') === 'true');
    controls.append(
      menu,
      _makeThemePicker(),
      UI.Button({
        icon: UI.Icon('save'), title: 'Сохранить немедленно',
        onClick: async () => { await Storage.saveNow(); UI.toast('Сохранено'); }
      }),
      UI.Button({
        icon: UI.Icon('folder'), title: 'Сменить файл данных',
        onClick: async () => { await Storage.forgetFile(); location.reload(); }
      })
    );
  }

  function _makeThemePicker() {
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';
    wrap.style.position = 'relative';
    const dropdown = document.createElement('div');
    dropdown.className = 'theme-dropdown';
    dropdown.id = 'theme-dropdown';
    dropdown.hidden = true;
    const trigger = UI.Button({
      icon: UI.Icon('theme'), title: 'Темы оформления',
      onClick: () => setOpen(dropdown.hidden)
    });
    trigger.setAttribute('aria-controls', dropdown.id);
    trigger.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      dropdown.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) {
        dropdown.querySelectorAll('button').forEach(item => {
          item.classList.toggle('active', item.dataset.theme === document.documentElement.dataset.theme);
        });
      }
    }

    _themes.forEach(theme => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'theme-dropdown-item';
      item.dataset.theme = theme.id;
      const swatch = document.createElement('span');
      swatch.className = 'theme-dropdown-swatch';
      _applySwatchStyle(swatch, theme.swatch);
      item.append(swatch, theme.label);
      item.addEventListener('click', () => {
        _applyTheme(theme.id);
        setOpen(false);
        trigger.focus();
      });
      dropdown.appendChild(item);
    });
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !dropdown.hidden) {
        setOpen(false);
        trigger.focus();
      }
    });
    wrap.append(trigger, dropdown);
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

  function _applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('uchet_theme', id);
  }

  /* ══ Sidebar ═══════════════════════════════════ */
  function _buildSidebar() {
    const sb = document.getElementById('navigation');
    sb.innerHTML = '';
    _navSection(sb, 'Главная');
    sb.appendChild(_navItem('overview', 'Обзор', 'dashboard', null));
    sb.appendChild(_navItem('semesters', 'Семестры', 'semesters', null));
    const sems = Storage.getSemesters();
    if (sems.length) {
      _divider(sb); _navSection(sb, 'Учёт');
      sems.forEach(s => sb.appendChild(_navItem('records', s.label, 'records', s.id)));
      _divider(sb); _navSection(sb, 'Аналитика');
      sems.forEach(s => sb.appendChild(_navItem('analytics', s.label, 'analytics', s.id)));
    }
  }
  function _navSection(sb, t) { const d = document.createElement('div'); d.className = 'nav-section'; d.textContent = t; sb.appendChild(d); }
  function _divider(sb) { const d = document.createElement('div'); d.className = 'sidebar-divider'; sb.appendChild(d); }
  function _navItem(icon, text, view, semId) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'nav-item' + (_view === view && _semId === semId ? ' active' : '');
    el.innerHTML = `<span class="nav-icon">${UI.Icon(icon)}</span><span>${_esc(text)}</span>`;
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
      wrap.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="empty-icon">${UI.Icon('semesters')}</div><p>Нет семестров. Создайте первый.</p></div>`);
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
        acts.appendChild(UI.Button({ icon: UI.Icon('trash'), title: 'Удалить семестр', variant: 'danger', size: 'sm', onClick: () => _delSem(sem.id) }));
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
    bd.innerHTML = `<div class="modal"><div class="modal-header"><h3 class="modal-title"></h3><button class="btn btn-ghost btn-sm btn-icon" id="modal-close" aria-label="Закрыть">${UI.Icon('close')}</button></div><div class="modal-body"></div><div class="modal-footer"></div></div>`;
    bd.addEventListener('click', e => { if (e.target === bd) UI.closeModal(); });
    bd.querySelector('#modal-close').addEventListener('click', () => UI.closeModal());
    document.body.appendChild(bd);
  }

  function _esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  return { init, navigate };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
