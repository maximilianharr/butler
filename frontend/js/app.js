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
  activePlugin: null,
  currentFile: null,
  sidePanelVisible: false,
  theme: 'dark',
  openTabs: [],    // [{path, name}]
  activeTab: null,  // path of active tab
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
const $tabBar = document.getElementById('tab-bar');
const $mainActions = document.getElementById('main-actions');
const $tabContextMenu = document.getElementById('tab-context-menu');

// ─── Plugin System ──────────────────────────────────────────

/**
 * Plugin types:
 *   'panel'  — renders in the side panel; main area keeps the editor
 *   'full'   — takes over the main area entirely
 */
const plugins = {};
const pluginOrder = { top: ['search', 'files', 'calendar', 'recipes', 'diary'], bottom: ['sync', 'settings'] };

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

  // Track whether we're leaving a full-type plugin
  const wasFullPlugin = state.activePlugin && plugins[state.activePlugin]?.type === 'full';

  // Deactivate previous
  if (state.activePlugin && plugins[state.activePlugin]?.deactivate) {
    plugins[state.activePlugin].deactivate();
  }

  state.activePlugin = name;
  updateActiveIcon();

  if (plugin.type === 'panel') {
    openSidePanel(name, plugin);
    // Restore main area if coming from a full plugin
    if (wasFullPlugin) {
      if (state.activeTab && plugins.editor) {
        $mainContent.innerHTML = '';
        plugins.editor.openFile(state.activeTab, $mainContent, butler);
        renderTabBar();
      } else {
        showWelcome();
        renderTabBar();
      }
    }
  } else {
    closeSidePanel();
    $mainContent.innerHTML = '';
    if ($tabBar) $tabBar.innerHTML = `<span class="tab-header-label">${plugin.label || name}</span>`;
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
    recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10"/><path d="M15 2.5c1 1.5 2 4 2 9.5M12 2v10M7 12a5 5 0 0 0 10 0"/></svg>',
    diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>',
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

// ─── Theme & Zoom ───────────────────────────────────────────

async function initTheme() {
  try {
    const { data } = await API.get('/api/settings/appearance');
    // Support legacy 'darkmode' field and new 'theme' field
    state.theme = data.theme || (data.darkmode === 'true' ? 'dark' : data.darkmode === 'false' ? 'bright' : 'dark');
    // Apply zoom level → font size (clamp 50–200%)
    const zoom = Math.max(50, Math.min(200, parseInt(data['zoom-level']) || 100));
    document.documentElement.style.setProperty('--fs-base', `${14 * zoom / 100}px`);
  } catch { /* keep default */ }
  document.documentElement.setAttribute('data-theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'bright' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
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

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

function isImageFile(path) {
  return IMAGE_EXTS.includes(path.split('.').pop().toLowerCase());
}

function renderImageViewer(path) {
  $mainContent.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'image-viewer';
  const img = document.createElement('img');
  img.src = `/api/files/raw?path=${encodeURIComponent(path)}`;
  img.alt = path.split('/').pop();
  img.onerror = () => { wrap.innerHTML = `<div class="editor-loading" style="color:var(--red)">Failed to load image</div>`; };
  wrap.appendChild(img);
  $mainContent.appendChild(wrap);
}

const butler = {
  api: API,
  toast,
  state,

  openFile(path) {
    state.currentFile = path;

    // Check if it's an image file
    if (isImageFile(path)) {
      // Deactivate full-type plugin if active
      if (state.activePlugin && plugins[state.activePlugin]?.type === 'full') {
        if (plugins[state.activePlugin]?.deactivate) plugins[state.activePlugin].deactivate();
        state.activePlugin = null;
        updateActiveIcon();
      }
      if (!state.openTabs.find(t => t.path === path)) {
        state.openTabs.push({ path, name: path.split('/').pop() });
      }
      state.activeTab = path;
      renderImageViewer(path);
      renderTabBar();
      return;
    }

    if (!plugins.editor) { toast('Editor not loaded', 'error'); return; }

    // Deactivate full-type plugin if active
    if (state.activePlugin && plugins[state.activePlugin]?.type === 'full') {
      if (plugins[state.activePlugin]?.deactivate) plugins[state.activePlugin].deactivate();
      state.activePlugin = null;
      updateActiveIcon();
    }

    // Add tab if not already open
    if (!state.openTabs.find(t => t.path === path)) {
      state.openTabs.push({ path, name: path.split('/').pop() });
    }
    state.activeTab = path;

    $mainContent.innerHTML = '';
    plugins.editor.openFile(path, $mainContent, butler);
    renderTabBar();
  },

  onTabDirtyChange(_path, _dirty) {
    renderTabBar();
  },

  toggleTheme,

  refreshFileTree() {
    if (plugins.files?.refresh) plugins.files.refresh();
  },
};

// ─── Tab Bar ────────────────────────────────────────────────

function renderTabBar() {
  if (!$tabBar) return;
  $tabBar.innerHTML = '';

  for (const tab of state.openTabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '');
    el.dataset.path = tab.path;

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tab.name;
    el.appendChild(name);

    if (plugins.editor?.isDirty(tab.path)) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      dot.textContent = '●';
      el.appendChild(dot);
    }

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTabByPath(tab.path); });
    el.appendChild(close);

    el.addEventListener('click', () => switchTab(tab.path));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(e, tab.path); });

    $tabBar.appendChild(el);
  }
}

function switchTab(path) {
  if (state.activeTab === path) return;
  state.activeTab = path;
  state.currentFile = path;

  // Deactivate full-type plugin if active
  if (state.activePlugin && plugins[state.activePlugin]?.type === 'full') {
    if (plugins[state.activePlugin]?.deactivate) plugins[state.activePlugin].deactivate();
    state.activePlugin = null;
    updateActiveIcon();
  }

  $mainContent.innerHTML = '';
  if (isImageFile(path)) {
    renderImageViewer(path);
  } else if (plugins.editor) {
    plugins.editor.openFile(path, $mainContent, butler);
  }
  renderTabBar();
}

function closeTabByPath(path) {
  // Confirm if dirty
  if (plugins.editor?.isDirty(path)) {
    if (!confirm(`"${path.split('/').pop()}" has unsaved changes. Close anyway?`)) return;
  }

  const idx = state.openTabs.findIndex(t => t.path === path);
  if (idx === -1) return;

  state.openTabs.splice(idx, 1);
  if (plugins.editor) plugins.editor.closeTab(path);

  if (state.activeTab === path) {
    if (state.openTabs.length > 0) {
      const newIdx = Math.min(idx, state.openTabs.length - 1);
      switchTab(state.openTabs[newIdx].path);
    } else {
      state.activeTab = null;
      state.currentFile = null;
      showWelcome();
      renderTabBar();
    }
  } else {
    renderTabBar();
  }
}

function showWelcome() {
  $mainContent.innerHTML = `
    <div id="welcome">
      <div class="welcome-icon">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 6h36v36H6z"/>
          <path d="M14 16h20M14 24h16M14 32h12"/>
        </svg>
      </div>
      <h1>Butler</h1>
      <p>Your life in markdown.</p>
      <div class="welcome-shortcuts">
        <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> Search &nbsp;
        <kbd>Ctrl</kbd>+<kbd>B</kbd> Files &nbsp;
      </div>
    </div>`;
}

// ─── Tab Context Menu ───────────────────────────────────────

let contextMenuPath = null;

function showTabContextMenu(e, path) {
  contextMenuPath = path;
  const menu = $tabContextMenu;
  if (!menu) return;

  // Position and clamp to viewport
  let x = e.clientX, y = e.clientY;
  menu.classList.add('visible');
  const rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

document.addEventListener('click', () => $tabContextMenu?.classList.remove('visible'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $tabContextMenu?.classList.remove('visible'); });

$tabContextMenu?.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action || !contextMenuPath) return;
  $tabContextMenu.classList.remove('visible');

  switch (action) {
    case 'close':
      closeTabByPath(contextMenuPath);
      break;
    case 'close-others': {
      const dirtyOthers = state.openTabs.filter(t => t.path !== contextMenuPath && plugins.editor?.isDirty(t.path));
      if (dirtyOthers.length > 0 && !confirm(`${dirtyOthers.length} file(s) have unsaved changes. Close anyway?`)) break;
      const keep = state.openTabs.find(t => t.path === contextMenuPath);
      for (const tab of state.openTabs) {
        if (tab.path !== contextMenuPath && plugins.editor) plugins.editor.closeTab(tab.path);
      }
      state.openTabs = keep ? [keep] : [];
      if (contextMenuPath !== state.activeTab && keep) switchTab(contextMenuPath);
      renderTabBar();
      break;
    }
    case 'close-all': {
      const dirtyTabs = state.openTabs.filter(t => plugins.editor?.isDirty(t.path));
      if (dirtyTabs.length > 0 && !confirm(`${dirtyTabs.length} file(s) have unsaved changes. Close all anyway?`)) break;
      for (const tab of state.openTabs) { if (plugins.editor) plugins.editor.closeTab(tab.path); }
      state.openTabs = [];
      state.activeTab = null;
      state.currentFile = null;
      showWelcome();
      renderTabBar();
      break;
    }
    case 'open-location':
      if (state.activePlugin !== 'files') togglePlugin('files');
      if (plugins.files?.revealFile) plugins.files.revealFile(contextMenuPath);
      break;
  }
});

// ─── Dirty-state page unload guard ──────────────────────────

window.addEventListener('beforeunload', (e) => {
  const hasDirty = state.openTabs.some(t => plugins.editor?.isDirty(t.path));
  if (hasDirty) { e.preventDefault(); e.returnValue = ''; }
});

// ─── Boot ───────────────────────────────────────────────────

(async () => {
  await initTheme();

  // Register core plugins
  await Promise.all([
    registerPlugin('search', '/js/plugins/search.js'),
    registerPlugin('files', '/js/plugins/files.js'),
    registerPlugin('calendar', '/js/plugins/calendar.js'),
    registerPlugin('recipes', '/js/plugins/recipes.js'),
    registerPlugin('diary', '/js/plugins/diary.js'),
    registerPlugin('sync', '/js/plugins/sync.js'),
    registerPlugin('settings', '/js/plugins/settings.js'),
    registerPlugin('editor', '/js/plugins/editor.js'),
  ]);

  buildSidebar();

  // Open files panel by default
  togglePlugin('files');
})();
