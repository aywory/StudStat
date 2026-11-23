/**
 * ui.js
 * Factory functions for reusable UI primitives.
 * Philosophy: build elements programmatically, pass params — no template strings sprawl.
 */

const UI = (() => {
  const icons = {
    "overview": "M3 3h7v7H3z M14 3h7v4h-7z M14 11h7v10h-7z M3 14h7v7H3z",
    "semesters": "M5 5h14v16H5z M8 3v4 M16 3v4 M5 10h14 M9 14h6",
    "records": "M4 5h16v14H4z M4 10h16 M10 10v9 M4 14.5h16",
    "analytics": "M4 4v16h16 M8 15l4-5 4 2 4-6",
    "save": "M5 4h12l3 3v13H4V4z M8 4v5h8V4 M8 20v-7h8v7",
    "folder": "M3 7V5h6l2 2h9v3 M3 7v12h16l3-9H7l-4 9",
    "theme": "M12 3a9 9 0 1 0 0 18h1a1.5 1.5 0 0 0 1-2.6 1.5 1.5 0 0 1 1-2.6h2a4 4 0 0 0 4-4A9 9 0 0 0 12 3z M7.5 11h.01 M10 7.5h.01 M14 7.5h.01 M17 11h.01",
    "filter": "M4 7h16 M7 12h10 M10 17h4",
    "arrow": "M5 12h14 M13 6l6 6-6 6",
    "search": "M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z M14.5 14.5l5 5",
    "copy": "M8 8h12v12H8z M16 4H4v12",
    "trash": "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 10v6 M14 10v6",
    "close": "M6 6l12 12 M18 6 6 18",
    "plus": "M12 5v14 M5 12h14",
    "top": "M5 4h14 M12 20V8 M7 13l5-5 5 5",
    "bottom": "M5 20h14 M12 4v12 M7 11l5 5 5-5",
    "note": "M5 4h14v11l-5 5H5z M14 20v-5h5 M8 8h8 M8 12h6",
    "sort": "M8 9l4-4 4 4 M8 15l4 4 4-4",
    "up": "M8 14l4-4 4 4",
    "down": "M8 10l4 4 4-4"
  };
  function Icon(name) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name]}"/></svg>`;
  }


  /* ─── Button ─────────────────────────────── */
  /**
   * @param {object} opts
   * opts.text       — label
   * opts.icon       — emoji/svg string (optional)
   * opts.variant    — 'primary'|'success'|'danger'|'ghost'|'blue'
   * opts.size       — 'sm'|''|'lg'
   * opts.title      — tooltip
   * opts.disabled   — boolean
   * opts.onClick    — function
   * opts.className  — extra classes
   */
  function Button({ text = '', icon = '', variant = 'ghost', size = '', title = '', disabled = false, onClick = null, className = '' } = {}) {
    const btn = document.createElement('button');
    btn.className = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', !text && icon ? 'btn-icon' : '', className].filter(Boolean).join(' ');
    if (icon)  btn.insertAdjacentHTML('beforeend', `<span class="btn-icon-inner">${icon}</span>`);
    if (text)  btn.insertAdjacentText('beforeend', text);
    if (title) {
      btn.title = title;
      if (!text) btn.setAttribute('aria-label', title);
    }
    btn.disabled = disabled;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  /* ─── Input ──────────────────────────────── */
  function Input({ type = 'text', value = '', placeholder = '', name = '', className = '', required = false, list = '' } = {}) {
    const inp = document.createElement('input');
    inp.className = 'input ' + className;
    inp.type = type; inp.value = value;
    inp.placeholder = placeholder; inp.name = name;
    inp.required = required;
    if (list) inp.setAttribute('list', list);
    return inp;
  }

  /* ─── Select ─────────────────────────────── */
  function Select({ name = '', options = [], value = '', className = '' } = {}) {
    const sel = document.createElement('select');
    sel.className = 'input ' + className;
    sel.name = name;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = typeof opt === 'string' ? opt : opt.value;
      o.textContent = typeof opt === 'string' ? opt : opt.label;
      if (o.value === value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  /* ─── FormGroup ──────────────────────────── */
  function FormGroup({ label = '', child, id = '' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'form-group';
    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = label;
    if (id) { lbl.htmlFor = id; child.id = id; }
    wrap.appendChild(lbl);
    wrap.appendChild(child);
    return wrap;
  }

  /* ─── Toast ──────────────────────────────── */
  function toast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast${type !== 'success' ? ' ' + type : ''}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* ─── Modal ──────────────────────────────── */
  let _modalResolve = null;

  function openModal({ title = '', bodyEl = null, bodyHTML = '', footerActions = [] } = {}) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal    = backdrop.querySelector('.modal');
    modal.querySelector('.modal-title').textContent = title;

    const body = modal.querySelector('.modal-body');
    body.innerHTML = '';
    if (bodyEl)   body.appendChild(bodyEl);
    if (bodyHTML) body.innerHTML = bodyHTML;

    const footer = modal.querySelector('.modal-footer');
    footer.innerHTML = '';
    footerActions.forEach(action => footer.appendChild(action));

    backdrop.classList.add('open');
    backdrop.classList.remove('anim-fade');
    void backdrop.offsetWidth;
    backdrop.classList.add('anim-fade');

    return new Promise(resolve => { _modalResolve = resolve; });
  }

  function closeModal(result = null) {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.classList.remove('open');
    if (_modalResolve) { _modalResolve(result); _modalResolve = null; }
  }

  function confirmDialog({ message = 'Вы уверены?', confirmText = 'Удалить', confirmVariant = 'danger' } = {}) {
    const p = document.createElement('p');
    p.style.fontSize = '0.9rem';
    p.style.color = 'var(--text-secondary)';
    p.textContent = message;

    const cancel  = Button({ text: 'Отмена',      variant: 'ghost',             onClick: () => closeModal(false) });
    const confirm = Button({ text: confirmText,   variant: confirmVariant,      onClick: () => closeModal(true)  });
    return openModal({ title: 'Подтверждение', bodyEl: p, footerActions: [cancel, confirm] });
  }

  /* ─── Badge ──────────────────────────────── */
  function statusBadge(status) {
    const el = document.createElement('span');
    const s = (status || '').toLowerCase();
    if (s === 'закрыто') {
      el.className = 'badge badge-closed'; el.textContent = 'закрыто';
    } else if (s.startsWith('о+')) {
      el.className = 'badge badge-partial'; el.textContent = 'опл+выпол-';
    } else {
      el.className = 'badge badge-open'; el.textContent = status || '—';
    }
    return el;
  }

  /* ─── Pagination ─────────────────────────── */
  function renderPagination(container, { total, page, perPage, onChange } = {}) {
    container.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (totalPages <= 1) return;

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `${(page-1)*perPage+1}–${Math.min(page*perPage, total)} из ${total}`;
    container.appendChild(info);

    const makeBtn = (label, targetPage, disabled = false) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (targetPage === page ? ' active' : '');
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener('click', () => onChange(targetPage));
      return btn;
    };

    container.appendChild(makeBtn('‹', page - 1, page === 1));
    const range = pageRange(page, totalPages);
    range.forEach(p => {
      if (p === '…') {
        const s = document.createElement('span'); s.className = 'page-btn'; s.textContent = '…'; s.style.cursor='default';
        container.appendChild(s);
      } else container.appendChild(makeBtn(p, p));
    });
    container.appendChild(makeBtn('›', page + 1, page === totalPages));
  }

  function pageRange(current, total) {
    if (total <= 7) return Array.from({length: total}, (_,i) => i+1);
    if (current <= 4) return [1,2,3,4,5,'…',total];
    if (current >= total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
    return [1,'…',current-1,current,current+1,'…',total];
  }

  return { Icon, Button, Input, Select, FormGroup, toast, openModal, closeModal, confirmDialog, statusBadge, renderPagination };
})();

window.UI = UI;
