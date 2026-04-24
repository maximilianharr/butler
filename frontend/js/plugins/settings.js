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
    renderEditor(cat, data, editorEl);
  } catch (e) {
    editorEl.innerHTML = `<div class="search-empty" style="color:var(--red)">Failed to load: ${e.message}</div>`;
  }
}

function renderEditor(cat, data, editorEl) {
  editorEl.innerHTML = `<h3>${esc(cat)}</h3>`;

  const form = document.createElement('div');

  function renderFields(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        // Arrays: show as JSON textarea
        const field = document.createElement('div');
        field.className = 'se-field';
        field.innerHTML = `
          <label>${esc(fullKey)}</label>
          <textarea style="flex:1;min-height:80px;padding:8px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-1);font-family:var(--ff-mono);font-size:12px;resize:vertical;"
            data-key="${esc(fullKey)}" data-type="json">${esc(JSON.stringify(value, null, 2))}</textarea>
        `;
        form.appendChild(field);
      } else if (typeof value === 'object' && value !== null) {
        renderFields(value, fullKey);
      } else {
        const field = document.createElement('div');
        field.className = 'se-field';

        let inputHTML;
        if (typeof value === 'boolean' || value === 'true' || value === 'false') {
          inputHTML = `<select data-key="${esc(fullKey)}" data-type="bool">
            <option value="true" ${String(value) === 'true' ? 'selected' : ''}>true</option>
            <option value="false" ${String(value) === 'false' ? 'selected' : ''}>false</option>
          </select>`;
        } else {
          inputHTML = `<input type="text" value="${esc(String(value))}" data-key="${esc(fullKey)}" data-type="string">`;
        }

        field.innerHTML = `<label>${esc(fullKey)}</label>${inputHTML}`;
        form.appendChild(field);
      }
    }
  }

  renderFields(data);
  editorEl.appendChild(form);

  // Save bar
  const bar = document.createElement('div');
  bar.className = 'settings-save-bar';
  bar.innerHTML = `
    <button class="btn btn-ghost" id="settings-reset">Reset</button>
    <button class="btn btn-primary" id="settings-save">Save</button>
  `;
  editorEl.appendChild(bar);

  bar.querySelector('#settings-save').addEventListener('click', saveSettings);
  bar.querySelector('#settings-reset').addEventListener('click', () => renderEditor(cat, currentData, editorEl));
}

async function saveSettings() {
  if (!currentCategory || !butlerRef) return;

  // Collect values from form
  const newData = JSON.parse(JSON.stringify(currentData));
  const inputs = $container.querySelectorAll('[data-key]');

  for (const input of inputs) {
    const key = input.dataset.key;
    const type = input.dataset.type;
    let val;

    if (type === 'json') {
      try { val = JSON.parse(input.value); } catch { butlerRef.toast(`Invalid JSON for "${key}"`, 'error'); return; }
    } else if (type === 'bool') {
      val = input.value;
    } else {
      val = input.value;
    }

    setNestedValue(newData, key, val);
  }

  try {
    await butlerRef.api.put(`/api/settings/${encodeURIComponent(currentCategory)}`, { data: newData });
    currentData = newData;
    butlerRef.toast('Settings saved', 'success');
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
