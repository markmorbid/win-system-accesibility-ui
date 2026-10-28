(() => {
  'use strict';
  const result = document.getElementById('sandbox-result');
  const first = document.getElementById('sandbox-first');
  const second = document.getElementById('sandbox-second');
  const selector = document.getElementById('sandbox-select');
  const checks = [];
  const check = (name, value) => checks.push({name, pass: !!value});
  ToolskinEnhance.init();
  ToolskinEnhance.init(); // repeated setup must be harmless
  check('native select remains native', selector.tagName === 'SELECT' && selector.options.length === 2);
  let changed = 0;
  selector.addEventListener('change', () => changed++);
  selector.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true}));
  const menu = document.querySelector('.ts-ui-select__popover');
  const menuRect = menu && menu.getBoundingClientRect();
  check('select menu escapes clipped module', !!menu && menu.parentElement === document.body && getComputedStyle(menu).zIndex === '10000');
  check('select menu stays in viewport', !!menuRect && menuRect.top >= 0 && menuRect.bottom <= innerHeight + 1);
  if (menu) menu.querySelectorAll('[role="option"]')[1].click();
  check('select choice updates native control once', selector.value === 'b' && changed === 1 && !document.querySelector('.ts-ui-select__popover'));
  check('first starts open', first.open && !second.open);
  const header = document.querySelector('[data-ts-ui-draggable]');
  header.dispatchEvent(new PointerEvent('pointerdown', {button: 0, pointerId: 1, screenX: 10, screenY: 10, bubbles: true}));
  header.dispatchEvent(new PointerEvent('pointermove', {pointerId: 1, screenX: 25, screenY: 20, bubbles: true}));
  header.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, screenX: 25, screenY: 20, bubbles: true}));
  check('standalone drag', /15px,\s*10px/.test(header.style.transform));
  setTimeout(() => {
    second.open = true;
    setTimeout(() => {
      check('exclusive accordion', !first.open && second.open);
      const added = document.createElement('details');
      added.className = 'ts-ui-accordion';
      added.setAttribute('data-ts-accordion-group', 'modules');
      added.innerHTML = '<summary>Dynamic</summary><p>Content</p>';
      second.after(added);
      setTimeout(() => {
        added.open = true;
        setTimeout(() => {
          check('dynamic accordion', added.open && !second.open);
          const dynamicSelect = document.createElement('select');
          dynamicSelect.className = 'ts-ui-select';
          dynamicSelect.innerHTML = '<option value="one">One</option><option value="two">Two</option>';
          added.append(dynamicSelect);
          ToolskinEnhance.refresh(added);
          dynamicSelect.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true}));
          check('dynamic select initializes', !!document.querySelector('.ts-ui-select__popover'));
          ToolskinEnhance.destroy();
          check('destroy closes select menu', !document.querySelector('.ts-ui-select__popover'));
          result.textContent = checks.every(x => x.pass) ? 'PASS: ' + checks.length + ' standalone checks' : 'FAIL: ' + checks.filter(x => !x.pass).map(x => x.name).join(', ');
          result.dataset.pass = String(checks.every(x => x.pass));
        }, 30);
      }, 30);
    }, 30);
  }, 30);
})();
