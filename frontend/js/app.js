/**
 * Butler — Core Application
 *
 * Plugin lifecycle manager, sidebar navigation, theme switching,
 * keyboard shortcuts, and a thin API wrapper shared across plugins.
 */

// ─── API Helper ─────────────────────────────────────────────

const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
  async put(url, body) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
};

// ─── Toast Notifications ────────────────────────────────────

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ─── State ──────────────────────────────────────────────────

const state = {
  activePlugin: null,     // current sidebar plugin name
  currentFile: null,      // path of file open in editor
  sidePanelVisible: false,
  theme: 'dark',
};

// ─── DOM References ─────────────────────────────────────────

const $abTop = document.getElementById('ab-top');
const $abBottom = document.getElementById('ab-bottom');
const $sidePanel = document.getElementById('side-panel');
const $spTitle = document.getElementById('sp-title');
const $spContent = document.getElementById('sp-content');
const $spClose = document.getElementById('sp-close');
const $resizeHandle = document.getElementById('resize-handle');
const $mainContent = document.getElementById('main-content');
const $breadcrumb = document.getElementById('breadcrumb');
const $mainActions = document.getElementById('main-actions');

// ─── Plugin System ──────────────────────────────────────────

/**
 * Plugin types:
 *   'panel'  — renders in the side panel; main area keeps the editor
 *   'full'   — takes over the main area entirely
 */
const plugins = {};
const pluginOrder = { top: ['search', 'files'], bottom: ['sync', 'settings'] };

async function registerPlugin(name, modulePath) {
  try {
    const mod = await import(modulePath);
    plugins[name] = mod.default;
    plugins[name]._name = name;
  } catch (e) {
    console.error(`Failed to load plugin "${name}":`, e);
  }
}

function buildSidebar() {
  $abTop.innerHTML = '';
  $abBottom.innerHTML = '';

  for (const name of pluginOrder.top) {
    if (plugins[name]) $abTop.appendChild(createIconButton(name, plugins[name]));
  }
  for (const name of pluginOrder.bottom) {
    if (plugins[name]) $abBottom.appendChild(createIconButton(name, plugins[name]));
  }
}

function createIconButton(name, plugin) {
  const btn = document.createElement('button');
  btn.className = 'ab-icon';
  btn.dataset.plugin = name;
  btn.dataset.tooltip = plugin.label || name;
  btn.innerHTML = plugin.icon || defaultIcon(name);
  btn.addEventListener('click', () => togglePlugin(name));
  return btn;
}

function togglePlugin(name) {
  const plugin = plugins[name];
  if (!plugin) return;

  // If clicking the already-active panel plugin, toggle panel
  if (state.activePlugin === name && plugin.type === 'panel') {
    closeSidePanel();
    state.activePlugin = null;
    updateActiveIcon();
    return;
  }

  // Deactivate previous
  if (state.activePlugin && plugins[state.activePlugin]?.deactivate) {
    plugins[state.activePlugin].deactivate();
  }

  state.activePlugin = name;
  updateActiveIcon();

  if (plugin.type === 'panel') {
    openSidePanel(name, plugin);
    // Restore editor if a file is open
    if (state.currentFile && plugins.editor) {
      plugins.editor.openFile(state.currentFile);
    }
  } else {
    closeSidePanel();
    $mainContent.innerHTML = '';
    $breadcrumb.innerHTML = `<span class="crumb">${plugin.label || name}</span>`;
    $mainActions.innerHTML = '';
    plugin.init($mainContent, butler);
  }

  if (plugin.activate) plugin.activate();
}

function openSidePanel(name, plugin) {
  $sidePanel.classList.remove('collapsed');
  $resizeHandle.classList.remove('collapsed');
  $spTitle.textContent = plugin.label || name;
  $spContent.innerHTML = '';
  state.sidePanelVisible = true;
  plugin.init($spContent, butler);
}

function closeSidePanel() {
  $sidePanel.classList.add('collapsed');
  $resizeHandle.classList.add('collapsed');
  state.sidePanelVisible = false;
}

function updateActiveIcon() {
  document.querySelectorAll('.ab-icon').forEach(el => {
    el.classList.toggle('active', el.dataset.plugin === state.activePlugin);
  });
}

// ─── Default SVG Icons ──────────────────────────────────────

function defaultIcon(name) {
  const icons = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    files: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 18H8"/><path d="M16 14H8"/><path d="M10 10H8"/></svg>',
    sync: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9.51a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 14.49a9 9 0 0 1-14.85 3.36L1 14"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };
  return icons[name] || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
}

// ─── Resize Handle ──────────────────────────────────────────

let resizing = false;
$resizeHandle.addEventListener('mousedown', (e) => {
  resizing = true;
  $resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const newWidth = Math.max(180, Math.min(500, e.clientX - 48));
  document.getElementById('app').style.gridTemplateColumns = `48px ${newWidth}px 5px 1fr`;
});
document.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  $resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ─── Theme ──────────────────────────────────────────────────

async function initTheme() {
  try {
    const { data } = await API.get('/api/settings/appearance');
    state.theme = data.darkmode === 'true' ? 'dark' : 'bright';
  } catch { /* keep default */ }
  document.documentElement.setAttribute('data-theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'bright' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  API.put('/api/settings/appearance', { data: { darkmode: state.theme === 'dark' ? 'true' : 'false' } }).catch(() => {});
}

// ─── Side Panel Close ───────────────────────────────────────

$spClose.addEventListener('click', () => {
  closeSidePanel();
  if (state.activePlugin && plugins[state.activePlugin]?.type === 'panel') {
    state.activePlugin = null;
    updateActiveIcon();
  }
});

// ─── Keyboard Shortcuts ─────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+F → Search
  if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); togglePlugin('search'); }
  // Ctrl+B → Files
  if (e.ctrlKey && !e.shiftKey && e.key === 'b') { e.preventDefault(); togglePlugin('files'); }
  // Ctrl+S → Save file
  if (e.ctrlKey && !e.shiftKey && e.key === 's') {
    e.preventDefault();
    if (plugins.editor?.save) plugins.editor.save();
  }
});

// ─── Public Butler API (passed to plugins) ──────────────────

const butler = {
  api: API,
  toast,
  state,

  openFile(path) {
    state.currentFile = path;
    if (!plugins.editor) { toast('Editor not loaded', 'error'); return; }
    $mainContent.innerHTML = '';
    // Build breadcrumb safely with textContent (no XSS via filenames)
    $breadcrumb.innerHTML = '';
    path.split('/').forEach((seg, i, arr) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '/';
        $breadcrumb.appendChild(sep);
      }
      const crumb = document.createElement('span');
      crumb.className = 'crumb';
      crumb.textContent = seg;
      $breadcrumb.appendChild(crumb);
    });
    plugins.editor.openFile(path, $mainContent, butler);
  },

  toggleTheme,

  refreshFileTree() {
    if (plugins.files?.refresh) plugins.files.refresh();
  },
};

// ─── Boot ───────────────────────────────────────────────────

(async () => {
  await initTheme();

  // Register core plugins
  await Promise.all([
    registerPlugin('search', '/js/plugins/search.js'),
    registerPlugin('files', '/js/plugins/files.js'),
    registerPlugin('sync', '/js/plugins/sync.js'),
    registerPlugin('settings', '/js/plugins/settings.js'),
    registerPlugin('editor', '/js/plugins/editor.js'),
  ]);

  buildSidebar();

  // Open files panel by default
  togglePlugin('files');
})();
