/* Small, dependency-free Toolskin behavior layer for native controls. */
(function (global) {
  'use strict';
  const bound = new WeakMap();
  const live = new Set();
  let observer = null;
  let dragHandler = null;
  let openSelect = null;
  let selectCount = 0;

  function closeSelect(restoreFocus) {
    if (!openSelect) return;
    const {el, menu} = openSelect;
    menu.remove();
    el.setAttribute('aria-expanded', 'false');
    openSelect = null;
    if (restoreFocus) el.focus();
  }

  function showSelect(el) {
    if (el.disabled || el.hidden) return;
    if (openSelect && openSelect.el === el) { closeSelect(true); return; }
    closeSelect(false);
    const menu = document.createElement('div');
    menu.className = 'ts-ui-select__popover';
    menu.id = 'ts-select-menu-' + (++selectCount);
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', el.getAttribute('aria-label') || el.labels && el.labels[0] && el.labels[0].textContent || 'Options');
    for (const option of el.options) {
      if (option.disabled || option.hidden) continue;
      const item = document.createElement('div');
      item.className = 'ts-ui-select__option';
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-selected', String(option.selected));
      item.textContent = option.textContent;
      const choose = () => {
        if (el.value !== option.value) { el.value = option.value; el.dispatchEvent(new Event('change', {bubbles: true})); }
        closeSelect(true);
      };
      item.addEventListener('click', choose);
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSelect(true); }
        if (event.key === 'Tab') { closeSelect(false); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const items = [...menu.querySelectorAll('[role="option"]')];
          items[(items.indexOf(item) + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          (event.key === 'Home' ? menu.firstElementChild : menu.lastElementChild).focus();
        }
        if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
          const items = [...menu.querySelectorAll('[role="option"]')];
          const match = items.find(candidate => candidate.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
          if (match) { event.preventDefault(); match.focus(); }
        }
      });
      menu.append(item);
    }
    if (!menu.children.length) return;
    document.body.append(menu); // Escape clipped module and scrolling ancestors.
    const rect = el.getBoundingClientRect();
    menu.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    const gap = 4;
    const roomBelow = window.innerHeight - rect.bottom - gap - 8;
    const roomAbove = rect.top - gap - 8;
    const below = roomBelow >= Math.min(180, menu.scrollHeight) || roomBelow >= roomAbove;
    const room = Math.max(64, below ? roomBelow : roomAbove);
    const height = Math.min(menu.scrollHeight, room, 280);
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = (below ? rect.bottom + gap : rect.top - gap - height) + 'px';
    menu.style.maxHeight = height + 'px';
    el.setAttribute('aria-controls', menu.id);
    el.setAttribute('aria-expanded', 'true');
    openSelect = {el, menu};
    (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild).focus();
  }

  function outsideSelect(event) {
    if (openSelect && event.target !== openSelect.el && !openSelect.menu.contains(event.target)) closeSelect(false);
  }
  function dismissSelect() { closeSelect(false); }

  function enhanceDetails(el) {
    if (bound.has(el)) return;
    const group = el.getAttribute('data-ts-accordion-group');
    const toggle = () => {
      if (el.open && group) {
        document.querySelectorAll('details[data-ts-accordion-group]').forEach(other => {
          if (other !== el && other.getAttribute('data-ts-accordion-group') === group) other.open = false;
        });
      }
      el.classList.toggle('ts-ui-accordion--open', el.open);
      el.dispatchEvent(new CustomEvent('ts-ui:accordion-change', {bubbles: true, detail: {open: el.open}}));
    };
    el.addEventListener('toggle', toggle);
    bound.set(el, () => el.removeEventListener('toggle', toggle));
    live.add(el);
    if (el.open && group) {
      document.querySelectorAll('details[data-ts-accordion-group]').forEach(other => {
        if (other !== el && other.getAttribute('data-ts-accordion-group') === group) other.open = false;
      });
    }
    el.classList.toggle('ts-ui-accordion--open', el.open);
  }

  function enhanceSelect(el) {
    if (bound.has(el)) return;
    const sync = () => {
      el.classList.toggle('ts-ui-select--empty', !el.value);
      el.title = el.selectedOptions.length ? el.selectedOptions[0].textContent : '';
    };
    el.addEventListener('change', sync);
    el.setAttribute('aria-haspopup', 'listbox');
    el.setAttribute('aria-expanded', 'false');
    const pointer = event => { if (event.button !== 0) return; event.preventDefault(); el.focus(); showSelect(el); };
    const mouse = event => event.preventDefault();
    const click = event => event.preventDefault();
    const key = event => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); showSelect(el); }
      if (event.key === 'Escape' && openSelect && openSelect.el === el) { event.preventDefault(); event.stopPropagation(); closeSelect(true); }
    };
    el.addEventListener('pointerdown', pointer);
    el.addEventListener('mousedown', mouse);
    el.addEventListener('click', click);
    el.addEventListener('keydown', key);
    sync();
    bound.set(el, () => { el.removeEventListener('change', sync); el.removeEventListener('pointerdown', pointer); el.removeEventListener('mousedown', mouse); el.removeEventListener('click', click); el.removeEventListener('keydown', key); });
    live.add(el);
  }

  function enhanceDrag(el) {
    if (bound.has(el)) return;
    let active = null;
    let offsetX = 0, offsetY = 0;
    const start = event => {
      if (event.button !== 0 || event.target.closest('button,select,input,a,summary,[data-ts-no-drag]')) return;
      active = {id: event.pointerId, x: event.screenX, y: event.screenY};
      if (el.setPointerCapture) try { el.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic tests have no active pointer. */ }
      el.classList.add('ts-ui-draggable--dragging');
      if (dragHandler) dragHandler({phase: 'start', dx: 0, dy: 0});
      event.preventDefault();
    };
    const move = event => {
      if (!active || event.pointerId !== active.id) return;
      const dx = event.screenX - active.x, dy = event.screenY - active.y;
      if (dragHandler) dragHandler({phase: 'move', dx, dy});
      else el.style.transform = 'translate(' + (offsetX + dx) + 'px,' + (offsetY + dy) + 'px)';
    };
    const stop = event => {
      if (!active || event.pointerId !== active.id) return;
      if (dragHandler) dragHandler({phase: 'end', dx: event.screenX - active.x, dy: event.screenY - active.y});
      else { offsetX += event.screenX - active.x; offsetY += event.screenY - active.y; }
      active = null;
      el.classList.remove('ts-ui-draggable--dragging');
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    bound.set(el, () => {
      el.removeEventListener('pointerdown', start);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', stop);
      el.removeEventListener('pointercancel', stop);
    });
    live.add(el);
  }

  function scan(root) {
    if (!root || root.nodeType !== 1 && root.nodeType !== 9) return;
    const matches = (selector, fn) => {
      if (root.matches && root.matches(selector)) fn(root);
      root.querySelectorAll(selector).forEach(fn);
    };
    matches('details.ts-ui-accordion', enhanceDetails);
    matches('select.ts-ui-select', enhanceSelect);
    matches('[data-ts-ui-draggable]', enhanceDrag);
  }

  function init(root, options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'onDrag')) dragHandler = options.onDrag;
    scan(root || document);
    document.addEventListener('pointerdown', outsideSelect, true);
    document.addEventListener('scroll', dismissSelect, true);
    window.addEventListener('resize', dismissSelect);
    if (!observer && document.documentElement) {
      observer = new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(scan);
          if (record.target.matches && record.target.matches('select.ts-ui-select')) {
            record.target.classList.toggle('ts-ui-select--empty', !record.target.value);
            record.target.title = record.target.selectedOptions.length ? record.target.selectedOptions[0].textContent : '';
          }
        });
      });
      observer.observe(document.documentElement, {childList: true, subtree: true});
    }
  }

  function destroy() {
    closeSelect(false);
    document.removeEventListener('pointerdown', outsideSelect, true);
    document.removeEventListener('scroll', dismissSelect, true);
    window.removeEventListener('resize', dismissSelect);
    if (observer) observer.disconnect();
    observer = null;
    live.forEach(el => { bound.get(el)(); bound.delete(el); });
    live.clear();
    dragHandler = null;
  }

  global.ToolskinEnhance = {init, refresh: root => scan(root || document), destroy};
})(window);
