(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const send = (action, extra = {}) => window.chrome.webview.postMessage({action, ...extra});
  let state = null;
  let fitFrame = 0, lastFit = '';
  const contentHeight = scroller => {
    const visible = [...scroller.children].filter(child => getComputedStyle(child).display !== 'none');
    const style = getComputedStyle(scroller);
    if (!visible.length) return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const last = visible[visible.length - 1];
    return Math.ceil(last.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop + parseFloat(getComputedStyle(last).marginBottom) + parseFloat(style.paddingBottom));
  };
  const scheduleFit = () => {
    if (fitFrame) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      const settingsOpen = !$('settings-view').hidden;
      const body = settingsOpen ? contentHeight(document.querySelector('.settings-scroll')) + document.querySelector('.settings-head').offsetHeight + document.querySelector('.settings-footer').offsetHeight : contentHeight(document.querySelector('.scroll-region')) + document.querySelector('.status-bar').offsetHeight;
      const height = Math.ceil(document.querySelector('.app-header').offsetHeight + body + 2);
      const radius = Math.max(0, Math.min(32, Math.round(parseFloat(getComputedStyle($('app')).borderTopLeftRadius) || 0)));
      const uiScale = Number($('ui-scale').value);
      const key = height + ':' + radius + ':' + uiScale;
      if (key !== lastFit) { lastFit = key; send('fit', {height, radius, uiScale}); }
    });
  };
  const status = text => { $('status').textContent = text; };
  const options = (el, items, current, empty) => {
    el.replaceChildren();
    if (!items.length) { const o = new Option(empty, ''); el.add(o); el.disabled = true; return; }
    el.disabled = false;
    for (const item of items) el.add(new Option(item.name, item.id));
    el.value = current || items[0].id;
  };
  const deviceInventory = (id, items) => {
    const list = $(id);
    list.replaceChildren();
    if (!items.length) { const li = document.createElement('li'); li.textContent = 'None detected'; list.append(li); return; }
    for (const item of items) {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = item.name;
      const state = document.createElement('small'); state.textContent = item.status;
      li.append(name, state); list.append(li);
    }
  };
  const syncRange = el => {
    const min = Number(el.min), max = Number(el.max), value = Number(el.value);
    const percent = max > min ? Math.round(Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) * 100) / 100 : 0;
    el.style.setProperty('--ts-range-percent', percent + '%');
  };
  const accentHue = {orange: 18, cyan: 190, green: 135, violet: 265};
  const designFields = ['font-base', 'spacing-base', 'panel-radius', 'button-radius', 'inner-radius', 'select-radius'];
  const applyDesign = values => {
    const root = document.documentElement.style;
    root.setProperty('--ui-scale', String(values.uiScale / 100));
    root.setProperty('--ts-fs-base', values.fontBase + 'px');
    root.setProperty('--ts-sp-base', values.spacingBase + 'px');
    root.setProperty('--widget-panel-radius-base', values.panelRadius + 'px');
    root.setProperty('--widget-button-radius-base', values.buttonRadius + 'px');
    root.setProperty('--widget-inner-radius-base', values.innerRadius + 'px');
    root.setProperty('--widget-select-radius-base', values.selectRadius + 'px');
    root.setProperty('--ts-accent-h', String(accentHue[values.accent] || 18));
  };
  const previewDesign = () => {
    const accent = document.querySelector('input[name="accent"]:checked');
    applyDesign({uiScale: Number($('ui-scale').value), fontBase: Number($('font-base').value), spacingBase: Number($('spacing-base').value), panelRadius: Number($('panel-radius').value), buttonRadius: Number($('button-radius').value), innerRadius: Number($('inner-radius').value), selectRadius: Number($('select-radius').value), accent: accent ? accent.value : 'orange'});
    for (const id of designFields) { $(id + '-value').textContent = $(id).value + ' px'; syncRange($(id)); }
    scheduleFit();
  };
  const applyLayout = layout => {
    const header = layout.header || {};
    const title = $('app').querySelector('.heading h1');
    const subtitle = $('app').querySelector('.heading p');
    if (typeof header.title === 'string') { title.textContent = header.title; document.title = header.title; }
    if (typeof header.subtitle === 'string') subtitle.textContent = header.subtitle;
    const headerNodes = {brand: $('app').querySelector('.brand-mark'), heading: $('app').querySelector('.heading'), actions: $('app').querySelector('.header-actions')};
    const headerItems = Array.isArray(header.items) ? header.items : Object.keys(headerNodes);
    for (const [id, node] of Object.entries(headerNodes)) node.hidden = !headerItems.includes(id);
    for (const id of headerItems) if (headerNodes[id]) $('app').querySelector('.app-header').append(headerNodes[id]);
    const actionNodes = {settings: $('settings-open'), close: $('close')};
    const actions = Array.isArray(header.actions) ? header.actions : Object.keys(actionNodes);
    for (const [id, node] of Object.entries(actionNodes)) node.hidden = !actions.includes(id);
    for (const id of actions) if (actionNodes[id]) headerNodes.actions.append(actionNodes[id]);
    if (Array.isArray(layout.modules)) {
      const modules = {display: $('display-section'), sound: $('sound-section')};
      for (const id of layout.modules) if (modules[id]) $('.scroll-region').append(modules[id]);
    }
    if (typeof layout.showRefresh === 'boolean') $('refresh').hidden = !layout.showRefresh;
    if (typeof layout.showShortcut === 'boolean') document.querySelector('.shortcut').hidden = !layout.showShortcut;
    scheduleFit();
  };
  const render = s => {
    state = s;
    applyDesign(s);
    $('monitor-name').textContent = s.monitorName;
    $('scale-value').textContent = s.scale ? s.scale + '%' : '—';
    const scaleAvailable = s.scaleChoices.length > 0;
    options($('scale-select'), s.scaleChoices.map(value => ({id: String(value), name: value + '%'})), String(s.scale), 'Direct scale unavailable');
    $('scale-control').hidden = !scaleAvailable;
    $('open-display').hidden = scaleAvailable;
    $('apply-scale').disabled = !scaleAvailable || Number($('scale-select').value) === s.scale;
    $('scale-help').textContent = scaleAvailable ? 'Scale changes revert after 15 seconds unless you keep them. Some apps may need to reopen.' : 'Direct scale is unavailable on this Windows build. Open Display settings instead.';
    $('display-section').hidden = !s.showDisplay;
    $('sound-section').hidden = !s.showSound;
    options($('resolution'), s.modes, s.currentMode, 'No supported modes');
    $('apply-resolution').disabled = !s.modes.length || $('resolution').value === s.currentMode;
    $('volume').disabled = !s.audioAvailable;
    $('mute').disabled = !s.audioAvailable;
    $('volume').value = s.volume;
    lastVolumeValue = s.volume;
    syncRange($('volume'));
    $('volume-value').textContent = s.audioAvailable ? s.volume + '%' : 'Unavailable';
    $('mute').checked = s.muted;
    options($('output'), s.outputs, s.defaultOutput, 'No active output');
    options($('input'), s.inputs, s.defaultInput, 'No active microphone');
    $('output').disabled = s.outputs.length < 2;
    $('input').disabled = s.inputs.length < 2;
    deviceInventory('all-outputs', s.allOutputs || []);
    deviceInventory('all-inputs', s.allInputs || []);
    $('output').hidden = !s.canSetDefaultDevice;
    $('input').hidden = !s.canSetDefaultDevice;
    $('output-current').hidden = s.canSetDefaultDevice;
    $('input-current').hidden = s.canSetDefaultDevice;
    $('output-current').textContent = $('output').selectedOptions[0].textContent;
    $('input-current').textContent = $('input').selectedOptions[0].textContent;
    const deviceNotes = [];
    if (s.outputs.length < 2) deviceNotes.push('Connect another output to switch devices.');
    if (!s.inputs.length) deviceNotes.push('No active microphone detected.');
    else if (s.inputs.length < 2) deviceNotes.push('Only one active input detected.');
    if (!s.canSetDefaultDevice) deviceNotes.push('Direct switching is unavailable here; use Windows Sound.');
    $('device-help').textContent = deviceNotes.length ? deviceNotes.join(' ') : 'Selecting a device changes the Windows default. If it fails, use Windows Sound.';
    $('edge').value = s.edge;
    options($('monitor'), s.monitors, s.selectedMonitor, 'Any monitor');
    $('delay').value = s.hoverDelay;
    syncRange($('delay'));
    $('delay-value').textContent = s.hoverDelay + ' ms';
    $('ui-scale').value = String(s.uiScale);
    $('ui-scale-value').textContent = s.uiScale + '%';
    syncRange($('ui-scale'));
    $('font-base').value = s.fontBase;
    $('spacing-base').value = s.spacingBase;
    $('panel-radius').value = s.panelRadius;
    $('button-radius').value = s.buttonRadius;
    $('inner-radius').value = s.innerRadius;
    $('select-radius').value = s.selectRadius;
    const accent = document.querySelector('input[name="accent"][value="' + s.accent + '"]');
    if (accent) accent.checked = true;
    for (const id of designFields) { $(id + '-value').textContent = $(id).value + ' px'; syncRange($(id)); }
    $('design-preset').value = 'custom';
    $('show-display').checked = s.showDisplay;
    $('show-sound').checked = s.showSound;
    $('topmost').checked = s.topmost;
    $('startup').checked = s.startup;
    status(s.message || 'Ready');
    scheduleFit();
  };
  window.chrome.webview.addEventListener('message', event => {
    const data = event.data;
    if (data.type === 'state') render(data);
    if (data.type === 'status') status(data.message);
    if (data.type === 'navigate' && data.view === 'settings' && $('settings-view').hidden) $('settings-open').click();
  });
  $('close').addEventListener('click', () => send('close'));
  $('refresh').addEventListener('click', () => send('refresh'));
  $('open-display').addEventListener('click', () => send('openDisplay'));
  $('apply-scale').addEventListener('click', () => send('applyScale', {value: Number($('scale-select').value)}));
  $('scale-select').addEventListener('change', () => { $('apply-scale').disabled = Number($('scale-select').value) === state.scale; });
  $('open-sound').addEventListener('click', () => send('openSound'));
  $('apply-resolution').addEventListener('click', () => send('applyResolution', {mode: $('resolution').value}));
  $('resolution').addEventListener('change', () => { $('apply-resolution').disabled = $('resolution').value === state.currentMode; });
  let volumeTimer = 0, lastVolumeWrite = 0, lastVolumeValue = null;
  const flushVolume = () => {
    clearTimeout(volumeTimer); volumeTimer = 0;
    const value = Number($('volume').value);
    if (value !== lastVolumeValue) { send('setVolume', {value}); lastVolumeValue = value; lastVolumeWrite = performance.now(); }
  };
  $('volume').addEventListener('input', () => {
    $('volume-value').textContent = $('volume').value + '%'; syncRange($('volume'));
    if (performance.now() - lastVolumeWrite >= 80) flushVolume();
    else if (!volumeTimer) volumeTimer = setTimeout(flushVolume, 80);
  });
  $('volume').addEventListener('change', flushVolume);
  $('mute').addEventListener('change', () => send('setMute', {value: $('mute').checked}));
  $('output').addEventListener('change', () => send('selectDevice', {input: false, id: $('output').value}));
  $('input').addEventListener('change', () => send('selectDevice', {input: true, id: $('input').value}));
  const showSettings = (open, discard = true) => {
    if (!open && state && discard) {
      applyDesign(state);
      $('ui-scale').value = String(state.uiScale); $('ui-scale-value').textContent = state.uiScale + '%'; syncRange($('ui-scale'));
      const map = {'font-base': state.fontBase, 'spacing-base': state.spacingBase, 'panel-radius': state.panelRadius, 'button-radius': state.buttonRadius, 'inner-radius': state.innerRadius, 'select-radius': state.selectRadius};
      for (const [id, value] of Object.entries(map)) { $(id).value = value; $(id + '-value').textContent = value + ' px'; syncRange($(id)); }
      const accent = document.querySelector('input[name="accent"][value="' + state.accent + '"]'); if (accent) accent.checked = true;
      $('design-preset').value = 'custom';
    }
    $('settings-view').hidden = !open;
    $('controls-view').hidden = open;
    $('settings-open').setAttribute('aria-pressed', String(open));
    $('settings-open').setAttribute('aria-label', open ? 'Return to controls' : 'Open widget settings');
    if (open) $('settings-back').focus(); else $('settings-open').focus();
    scheduleFit();
  };
  $('settings-open').addEventListener('click', () => showSettings($('settings-view').hidden));
  $('settings-back').addEventListener('click', () => showSettings(false));
  $('delay').addEventListener('input', () => { $('delay-value').textContent = $('delay').value + ' ms'; syncRange($('delay')); });
  $('ui-scale').addEventListener('input', () => { const value=Number($('ui-scale').value); document.documentElement.style.setProperty('--ui-scale', String(value / 100)); $('ui-scale-value').textContent=value+'%'; syncRange($('ui-scale')); });
  $('ui-scale').addEventListener('change', scheduleFit);
  for (const id of designFields) $(id).addEventListener('input', () => { $('design-preset').value = 'custom'; previewDesign(); });
  document.querySelectorAll('input[name="accent"]').forEach(input => input.addEventListener('change', previewDesign));
  $('design-preset').addEventListener('change', () => {
    const presets = {compact: [13, 3, 8, 6, 2, 4], balanced: [15, 4, 14, 8, 4, 6], airy: [17, 5, 22, 12, 6, 10]};
    const values = presets[$('design-preset').value];
    if (!values) return;
    designFields.forEach((id, index) => { $(id).value = values[index]; });
    previewDesign();
  });
  $('save-settings').addEventListener('click', () => {
    const accent = document.querySelector('input[name="accent"]:checked');
    send('saveSettings', {edge: $('edge').value, monitor: $('monitor').value, hoverDelay: Number($('delay').value), uiScale: Number($('ui-scale').value), fontBase: Number($('font-base').value), spacingBase: Number($('spacing-base').value), panelRadius: Number($('panel-radius').value), buttonRadius: Number($('button-radius').value), innerRadius: Number($('inner-radius').value), selectRadius: Number($('select-radius').value), accent: accent ? accent.value : 'orange', showDisplay: $('show-display').checked, showSound: $('show-sound').checked, topmost: $('topmost').checked, startup: $('startup').checked});
    showSettings(false, false);
  });
  document.querySelectorAll('details').forEach(details => details.addEventListener('toggle', scheduleFit));
  ToolskinEnhance.init(document, {onDrag: movement => send('drag', movement)});
  new MutationObserver(scheduleFit).observe($('app'), {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open']});
  document.fonts.ready.then(scheduleFit);
  fetch('layout.json').then(response => { if (!response.ok) throw new Error('layout.json unavailable'); return response.json(); }).then(applyLayout).catch(() => {});
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!$('settings-view').hidden) $('settings-back').click(); else send('close'); } });
  send('ready');
})();
