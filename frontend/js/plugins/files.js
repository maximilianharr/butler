/**
 * Butler — Files Plugin
 *
 * Shows the workspace file tree in the side panel.
 * Clicking a file opens it in the editor.
 * Right-click context menu: rename, delete, duplicate.
 */

let $container = null;
let butlerRef = null;
let expandedPaths = new Set();
let loadSeq = 0;

// ─── Context Menu ───────────────────────────────────────────

let $ctxMenu = null;
let ctxNode = null;

function ensureContextMenu() {
  if ($ctxMenu) return;
  $ctxMenu = document.createElement('div');
  $ctxMenu.className = 'context-menu';
  $ctxMenu.innerHTML = `
    <button data-action="rename">Rename</button>
    <button data-action="duplicate">Duplicate</button>
    <button data-action="delete">Delete</button>
  `;
  document.body.appendChild($ctxMenu);

  $ctxMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action || !ctxNode) return;
    $ctxMenu.classList.remove('visible');
    handleCtxAction(action, ctxNode);
  });

  document.addEventListener('click', () => $ctxMenu?.classList.remove('visible'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $ctxMenu?.classList.remove('visible'); });
}

function showFileContextMenu(e, node) {
  e.preventDefault();
  e.stopPropagation();
  ensureContextMenu();
  ctxNode = node;
  let x = e.clientX, y = e.clientY;
  $ctxMenu.classList.add('visible');
  const rect = $ctxMenu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
  $ctxMenu.style.left = x + 'px';
  $ctxMenu.style.top = y + 'px';
}

async function handleCtxAction(action, node) {
  switch (action) {
    case 'rename': startRename(node); break;
    case 'delete': await doDelete(node); break;
    case 'duplicate': await doDuplicate(node); break;
  }
}

function startRename(node) {
  const item = $container.querySelector(`.ft-item[data-path="${CSS.escape(node.path)}"]`);
  if (!item) return;
  const nameEl = item.querySelector('.ft-name');
  if (!nameEl) return;

  const oldName = node.name;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'ft-rename-input';

  nameEl.replaceWith(input);
  input.focus();
  // Select name without extension for files
  const dotIdx = node.is_dir ? -1 : oldName.lastIndexOf('.');
  input.setSelectionRange(0, dotIdx > 0 ? dotIdx : oldName.length);

  const commit = async () => {
    const newName = input.value.trim();
    if (!newName || newName === oldName) {
      input.replaceWith(nameEl);
      return;
    }
    const dir = node.path.substring(0, node.path.lastIndexOf('/') + 1);
    const newPath = dir + newName;
    try {
      await butlerRef.api.post('/api/files/rename', { old_path: node.path, new_path: newPath });
      butlerRef.toast('Renamed', 'success');
      // If the basename (stem) changed, optionally update wiki-links to it.
      const oldStem = oldName.replace(/\.[^.]+$/, '');
      const newStem = newName.replace(/\.[^.]+$/, '');
      if (oldStem !== newStem) {
        await maybeUpdateLinks(node.path, newPath);
      }
      loadTree();
      butlerRef.refreshFileTree?.();
    } catch (e) {
      butlerRef.toast(`Rename failed: ${e.message}`, 'error');
      input.replaceWith(nameEl);
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { input.replaceWith(nameEl); }
    e.stopPropagation();
  });
  input.addEventListener('blur', commit, { once: true });
}

async function doDelete(node) {
  const label = node.is_dir ? 'folder' : 'file';
  if (!confirm(`Delete ${label} "${node.name}"?`)) return;
  try {
    await butlerRef.api.del(`/api/files/delete?path=${encodeURIComponent(node.path)}`);
    butlerRef.toast('Deleted', 'success');
    loadTree();
  } catch (e) {
    butlerRef.toast(`Delete failed: ${e.message}`, 'error');
  }
}

async function doDuplicate(node) {
  try {
    const { new_path } = await butlerRef.api.post('/api/files/duplicate', { path: node.path });
    butlerRef.toast(`Duplicated → ${new_path.split('/').pop()}`, 'success');
    loadTree();
  } catch (e) {
    butlerRef.toast(`Duplicate failed: ${e.message}`, 'error');
  }
}

// ─── Render File Tree ───────────────────────────────────────

function renderTree(children, depth = 0) {
  const frag = document.createDocumentFragment();

  for (const node of children) {
    const item = document.createElement('div');
    item.className = 'ft-item';
    item.style.setProperty('--depth', depth);

    if (node.is_dir) {
      const isExpanded = expandedPaths.has(node.path);

      item.dataset.path = node.path;
      item.innerHTML = `
        <span class="ft-chevron ${isExpanded ? 'expanded' : ''}">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>
        </span>
        <span class="ft-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="ft-name">${esc(node.name)}</span>
      `;

      const childWrap = document.createElement('div');
      childWrap.className = `ft-children ${isExpanded ? '' : 'collapsed'}`;
      childWrap.dataset.path = node.path;

      if (isExpanded && node.children) {
        childWrap.appendChild(renderTree(node.children, depth + 1));
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDir(node, childWrap, item, depth);
      });
      item.addEventListener('contextmenu', (e) => showFileContextMenu(e, node));

      frag.appendChild(item);
      frag.appendChild(childWrap);
    } else {
      const gitClass = node.git_status === 'untracked' ? 'git-untracked' : node.git_status === 'modified' ? 'git-modified' : '';
      item.classList.add(...(gitClass ? [gitClass] : []));
      item.dataset.path = node.path;

      const ext = node.name.split('.').pop()?.toLowerCase();
      item.innerHTML = `
        <span class="ft-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${ext === 'md' ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 18H8"/><path d="M16 14H8"/><path d="M10 10H8"/>' :
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'}
          </svg>
        </span>
        <span class="ft-name">${esc(node.title || node.name)}</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        $container.querySelectorAll('.ft-item.active').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        butlerRef.openFile(node.path);
      });
      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        butlerRef.openFile(node.path, { doubleClick: true });
      });
      item.addEventListener('contextmenu', (e) => showFileContextMenu(e, node));

      frag.appendChild(item);
    }
  }

  return frag;
}

async function toggleDir(node, childWrap, item, depth) {
  const isExpanded = expandedPaths.has(node.path);

  if (isExpanded) {
    expandedPaths.delete(node.path);
    childWrap.classList.add('collapsed');
    item.querySelector('.ft-chevron')?.classList.remove('expanded');
  } else {
    expandedPaths.add(node.path);
    childWrap.classList.remove('collapsed');
    item.querySelector('.ft-chevron')?.classList.add('expanded');

    // Load children if not already loaded
    if (!childWrap.hasChildNodes()) {
      try {
        const data = await butlerRef.api.get(`/api/files/tree?path=${encodeURIComponent(node.path)}`);
        childWrap.appendChild(renderTree(data.children, depth + 1));
      } catch (e) {
        childWrap.innerHTML = `<div style="padding:4px 12px;color:var(--red);font-size:12px;">Error: ${esc(e.message)}</div>`;
      }
    }
  }
}

async function loadTree() {
  if (!$container || !butlerRef) return;
  const seq = ++loadSeq;
  $container.innerHTML = '<div class="editor-loading"><div class="spinner"></div></div>';

  try {
    const data = await butlerRef.api.get('/api/files/tree');
    if (seq !== loadSeq) return;
    $container.innerHTML = '';
    const tree = document.createElement('div');
    tree.className = 'file-tree';
    tree.appendChild(renderTree(data.children));
    $container.appendChild(tree);
  } catch (e) {
    if (seq !== loadSeq) return;
    $container.innerHTML = `<div class="search-empty">Could not load files: ${esc(e.message)}</div>`;
  }
}

async function revealFile(filePath) {
  if (!$container || !butlerRef) return;

  // If the file is already visible and highlighted, just ensure scroll
  const existing = $container.querySelector(`.ft-item[data-path="${CSS.escape(filePath)}"]`);
  if (existing) {
    $container.querySelectorAll('.ft-item.active').forEach(el => el.classList.remove('active'));
    existing.classList.add('active');
    existing.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  // Expand all ancestor directories
  const parts = filePath.split('/');
  for (let i = 1; i < parts.length; i++) {
    expandedPaths.add(parts.slice(0, i).join('/'));
  }

  await loadTree();

  // Sequentially load children for expanded dirs that are deeper than the initial fetch
  const ancestors = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'));
  }

  for (const ancestorPath of ancestors) {
    const childWrap = $container.querySelector(`.ft-children[data-path="${CSS.escape(ancestorPath)}"]`);
    if (childWrap && !childWrap.hasChildNodes()) {
      try {
        const data = await butlerRef.api.get(`/api/files/tree?path=${encodeURIComponent(ancestorPath)}`);
        const depth = ancestorPath.split('/').length;
        childWrap.appendChild(renderTree(data.children, depth));
        childWrap.classList.remove('collapsed');
      } catch { /* skip */ }
    }
  }

  // Highlight and scroll to file
  const target = $container.querySelector(`.ft-item[data-path="${CSS.escape(filePath)}"]`);
  if (target) {
    $container.querySelectorAll('.ft-item.active').forEach(el => el.classList.remove('active'));
    target.classList.add('active');
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── Link update prompt ─────────────────────────────────────

async function maybeUpdateLinks(oldPath, newPath) {
  // Read user.json to check the "always update" preference.
  let userData = {};
  try {
    const res = await butlerRef.api.get('/api/settings/user');
    userData = res?.data || {};
  } catch { /* fall through to prompt */ }

  if (userData['update-links-when-moving-files'] === true) {
    await runUpdateLinks(oldPath, newPath);
    return;
  }

  const decision = await showUpdateLinksDialog();
  if (!decision) return;
  if (decision.always) {
    try {
      await butlerRef.api.put('/api/settings/user', {
        data: { ...userData, 'update-links-when-moving-files': true },
      });
    } catch { /* non-fatal */ }
  }
  if (decision.update) {
    await runUpdateLinks(oldPath, newPath);
  }
}

async function runUpdateLinks(oldPath, newPath) {
  try {
    const res = await butlerRef.api.post('/api/files/update-links', {
      old_path: oldPath, new_path: newPath,
    });
    if (res?.updated > 0) {
      butlerRef.toast(`Updated links in ${res.updated} file${res.updated !== 1 ? 's' : ''}`, 'success');
    }
  } catch (e) {
    butlerRef.toast(`Link update failed: ${e.message}`, 'error');
  }
}

function showUpdateLinksDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cal-overlay';
    overlay.innerHTML = `
      <div class="cal-popup" style="max-width:420px;">
        <h3 style="margin:0 0 12px;">Update links?</h3>
        <p style="margin:0 0 16px;color:var(--text-2);font-size:13px;line-height:1.4;">
          This file is renamed/moved. Update <code>[[…]]</code> references to it in other files?
        </p>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);margin-bottom:16px;">
          <input type="checkbox" class="ulm-always"> Always update links when moving files
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost ulm-no">No</button>
          <button class="btn btn-primary ulm-yes">Yes, update</button>
        </div>
      </div>
    `;
    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    };
    document.addEventListener('keydown', escHandler);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(null); }
    });
    overlay.querySelector('.ulm-no').addEventListener('click', () => {
      const always = overlay.querySelector('.ulm-always').checked;
      cleanup();
      resolve({ update: false, always });
    });
    overlay.querySelector('.ulm-yes').addEventListener('click', () => {
      const always = overlay.querySelector('.ulm-always').checked;
      cleanup();
      resolve({ update: true, always });
    });
    document.body.appendChild(overlay);
  });
}

// ─── Plugin Interface ───────────────────────────────────────

export default {
  name: 'files',
  type: 'panel',
  label: 'Files',
  icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 18H8"/><path d="M16 14H8"/><path d="M10 10H8"/></svg>',

  init(container, butler) {
    $container = container;
    butlerRef = butler;
    // If there's an active tab, activate() will call revealFile (which loads the tree)
    if (!butler?.state?.activeTab) loadTree();
  },

  activate() {
    const activeTab = butlerRef?.state?.activeTab;
    if (activeTab) revealFile(activeTab);
  },
  deactivate() {},

  refresh() { loadTree(); },
  revealFile,
};
