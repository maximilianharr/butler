/**
 * Butler — Settings Plugin
 *
 * Category-based JSON settings editor.
 * Left: category list. Right: key-value form.
 */

let $container = null;
let butlerRef = null;
let currentCategory = null;
let currentData = null;

function init(container, butler) {
  $container = container;
  butlerRef = butler;

  container.innerHTML = `
    <div class="settings-layout">
      <div class="settings-categories"></div>
      <div class="settings-editor">
        <div class="search-empty">Select a category</div>
      </div>
    </div>
  `;

  loadCategories();
}

async function loadCategories() {
  const catEl = $container.querySelector('.settings-categories');
  try {
    const { categories } = await butlerRef.api.get('/api/settings/categories');
    catEl.innerHTML = '';
    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'settings-cat-item';
      btn.textContent = cat;
      btn.addEventListener('click', () => selectCategory(cat));
      catEl.appendChild(btn);
    }
  } catch (e) {
    catEl.innerHTML = `<div style="padding:16px;color:var(--red);font-size:13px;">Error: ${e.message}</div>`;
  }
}

async function selectCategory(cat) {
  currentCategory = cat;

  // Highlight active
  $container.querySelectorAll('.settings-cat-item').forEach(el => {
    el.classList.toggle('active', el.textContent === cat);
  });

  const editorEl = $container.querySelector('.settings-editor');
  editorEl.innerHTML = '<div class="editor-loading"><div class="spinner"></div></div>';

  try {
    const { data } = await butlerRef.api.get(`/api/settings/${encodeURIComponent(cat)}`);
    currentData = data;
    await renderEditor(cat, data, editorEl);
  } catch (e) {
    editorEl.innerHTML = `<div class="search-empty" style="color:var(--red)">Failed to load: ${e.message}</div>`;
  }
}

async function renderEditor(cat, data, editorEl) {
  editorEl.innerHTML = `<h3>${esc(cat)}</h3>`;
  const form = document.createElement('div');

  switch (cat) {
    case 'appearance': await renderAppearance(data, form); break;
    case 'plugins':    renderPluginsSettings(data, form); break;
    case 'shortkeys':  renderShortkeys(data, form); break;
    case 'user':       renderUser(data, form); break;
    default:           renderGenericFields(data, form);
  }

  editorEl.appendChild(form);

  // Save bar
  const bar = document.createElement('div');
  bar.className = 'settings-save-bar';
  bar.innerHTML = `
    <button class="btn btn-ghost" id="settings-reset">Reset</button>
    <button class="btn btn-primary" id="settings-save">Save</button>
  `;
  editorEl.appendChild(bar);

  bar.querySelector('#settings-save').addEventListener('click', () => saveSettings(cat));
  bar.querySelector('#settings-reset').addEventListener('click', () => selectCategory(cat));
}

// ─── Appearance ─────────────────────────────────────────────

async function renderAppearance(data, form) {
  // Theme dropdown
  let themes = ['dark', 'bright'];
  try {
    const res = await butlerRef.api.get('/api/themes');
    if (res.themes?.length) themes = res.themes;
  } catch { /* use defaults */ }

  const themeField = document.createElement('div');
  themeField.className = 'se-field';
  const themeLabel = document.createElement('label');
  themeLabel.textContent = 'theme';
  const themeSelect = document.createElement('select');
  themeSelect.dataset.key = 'theme';
  themeSelect.dataset.type = 'string';
  for (const t of themes) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === (data.theme || 'dark')) opt.selected = true;
    themeSelect.appendChild(opt);
  }
  themeField.appendChild(themeLabel);
  themeField.appendChild(themeSelect);
  form.appendChild(themeField);

  // Other fields (skip theme and deprecated darkmode)
  for (const [key, value] of Object.entries(data)) {
    if (key === 'theme' || key === 'darkmode') continue;
    addSimpleField(form, key, value);
  }
}

// ─── Plugins ────────────────────────────────────────────────

function renderPluginsSettings(data, form) {
  const pluginsList = data.plugins || [];
  for (const pluginObj of pluginsList) {
    for (const [name, enabled] of Object.entries(pluginObj)) {
      const field = document.createElement('div');
      field.className = 'se-field';

      const label = document.createElement('label');
      label.textContent = name;
      field.appendChild(label);

      const toggle = document.createElement('label');
      toggle.className = 'toggle-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!enabled;
      input.dataset.plugin = name;
      const slider = document.createElement('span');
      slider.className = 'toggle-slider';
      toggle.appendChild(input);
      toggle.appendChild(slider);
      field.appendChild(toggle);

      form.appendChild(field);
    }
  }
}

// ─── Shortkeys ──────────────────────────────────────────────

function renderShortkeys(data, form) {
  // Global shortcuts
  for (const [key, value] of Object.entries(data)) {
    if (key === 'plugins') continue;
    addSimpleField(form, key, value);
  }

  // Plugin shortcuts
  const pluginShortkeys = data.plugins || [];
  if (pluginShortkeys.length > 0) {
    const heading = document.createElement('h4');
    heading.textContent = 'Plugin Shortcuts';
    heading.style.cssText = 'margin: 24px 0 12px; color: var(--text-2); font-size: 14px; font-weight: 500;';
    form.appendChild(heading);

    for (const pluginObj of pluginShortkeys) {
      for (const [name, shortkey] of Object.entries(pluginObj)) {
        const field = document.createElement('div');
        field.className = 'se-field';
        const label = document.createElement('label');
        label.textContent = name;
        field.appendChild(label);
        const input = document.createElement('input');
        input.type = 'text';
        input.value = String(shortkey);
        input.dataset.key = `plugins.${name}`;
        input.dataset.type = 'plugin-shortkey';
        field.appendChild(input);
        form.appendChild(field);
      }
    }
  }
}

// ─── User ───────────────────────────────────────────────────

function renderUser(data, form) {
  const workspaces = data.workspace || [];
  const heading = document.createElement('h4');
  heading.textContent = 'Workspace Locations';
  heading.style.cssText = 'margin: 0 0 16px; color: var(--text-2); font-size: 14px; font-weight: 500;';
  form.appendChild(heading);

  workspaces.forEach((ws, i) => {
    const field = document.createElement('div');
    field.className = 'se-field';
    const label = document.createElement('label');
    label.textContent = `Location ${i + 1}`;
    field.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = ws.location || '';
    input.dataset.key = `workspace.${i}.location`;
    input.dataset.type = 'string';
    field.appendChild(input);
    form.appendChild(field);
  });
}

// ─── Generic (fallback) ─────────────────────────────────────

function renderGenericFields(obj, form, prefix = '') {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      const field = document.createElement('div');
      field.className = 'se-field';
      field.innerHTML = `
        <label>${esc(fullKey)}</label>
        <textarea style="flex:1;min-height:80px;padding:8px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-1);font-family:var(--ff-mono);font-size:12px;resize:vertical;"
          data-key="${esc(fullKey)}" data-type="json">${esc(JSON.stringify(value, null, 2))}</textarea>
      `;
      form.appendChild(field);
    } else if (typeof value === 'object' && value !== null) {
      renderGenericFields(value, form, fullKey);
    } else {
      addSimpleField(form, fullKey, value);
    }
  }
}

function addSimpleField(form, key, value) {
  const field = document.createElement('div');
  field.className = 'se-field';
  const label = document.createElement('label');
  label.textContent = key;
  field.appendChild(label);

  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const select = document.createElement('select');
    select.dataset.key = key;
    select.dataset.type = 'bool';
    select.innerHTML = `
      <option value="true" ${String(value) === 'true' ? 'selected' : ''}>true</option>
      <option value="false" ${String(value) === 'false' ? 'selected' : ''}>false</option>
    `;
    field.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = String(value);
    input.dataset.key = key;
    input.dataset.type = 'string';
    field.appendChild(input);
  }
  form.appendChild(field);
}

async function saveSettings(category) {
  const cat = category || currentCategory;
  if (!cat || !butlerRef) return;

  let newData;

  switch (cat) {
    case 'plugins': {
      const checkboxes = $container.querySelectorAll('input[data-plugin]');
      const pluginsArr = [];
      for (const cb of checkboxes) {
        pluginsArr.push({ [cb.dataset.plugin]: cb.checked });
      }
      newData = { plugins: pluginsArr };
      break;
    }
    case 'shortkeys': {
      newData = {};
      // Global shortkeys
      const inputs = $container.querySelectorAll('[data-key]:not([data-type="plugin-shortkey"])');
      for (const input of inputs) {
        newData[input.dataset.key] = input.value;
      }
      // Plugin shortkeys
      const pluginInputs = $container.querySelectorAll('[data-type="plugin-shortkey"]');
      if (pluginInputs.length > 0) {
        newData.plugins = [];
        for (const input of pluginInputs) {
          const name = input.dataset.key.replace('plugins.', '');
          newData.plugins.push({ [name]: input.value });
        }
      }
      break;
    }
    case 'user': {
      const locationInputs = $container.querySelectorAll('[data-key^="workspace."]');
      const workspaces = [];
      for (const input of locationInputs) {
        const idx = parseInt(input.dataset.key.split('.')[1]);
        if (!workspaces[idx]) workspaces[idx] = {};
        workspaces[idx].location = input.value;
      }
      newData = { workspace: workspaces };
      break;
    }
    default: {
      // Generic: collect from form
      newData = JSON.parse(JSON.stringify(currentData));
      const inputs = $container.querySelectorAll('[data-key]');
      for (const input of inputs) {
        const key = input.dataset.key;
        const type = input.dataset.type;
        let val;
        if (type === 'json') {
          try { val = JSON.parse(input.value); } catch { butlerRef.toast(`Invalid JSON for "${key}"`, 'error'); return; }
        } else {
          val = input.value;
        }
        setNestedValue(newData, key, val);
      }
    }
  }

  try {
    await butlerRef.api.put(`/api/settings/${encodeURIComponent(cat)}`, { data: newData });
    currentData = newData;
    butlerRef.toast('Settings saved', 'success');

    // Apply appearance changes immediately
    if (cat === 'appearance') {
      document.documentElement.setAttribute('data-theme', newData.theme || 'dark');
      const zoom = Math.max(50, Math.min(200, parseInt(newData['zoom-level']) || 100));
      document.documentElement.style.setProperty('--fs-base', `${14 * zoom / 100}px`);
    }
  } catch (e) {
    butlerRef.toast(`Save failed: ${e.message}`, 'error');
  }
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export default {
  name: 'settings',
  type: 'full',
  label: 'Settings',
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',

  init,
  activate() {},
  deactivate() {},
};
