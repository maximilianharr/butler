/**
 * Butler — Files Plugin
 *
 * Shows the workspace file tree in the side panel.
 * Clicking a file opens it in the editor.
 */

let $container = null;
let butlerRef = null;
let expandedPaths = new Set();

// ─── Render File Tree ───────────────────────────────────────

function renderTree(children, depth = 0) {
  const frag = document.createDocumentFragment();

  for (const node of children) {
    const item = document.createElement('div');
    item.className = 'ft-item';
    item.style.setProperty('--depth', depth);

    if (node.is_dir) {
      const isExpanded = expandedPaths.has(node.path);

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

      if (isExpanded && node.children) {
        childWrap.appendChild(renderTree(node.children, depth + 1));
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDir(node, childWrap, item, depth);
      });

      frag.appendChild(item);
      frag.appendChild(childWrap);
    } else {
      const gitClass = node.git_status === 'untracked' ? 'git-untracked' : node.git_status === 'modified' ? 'git-modified' : '';
      item.classList.add(...(gitClass ? [gitClass] : []));

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
        // Highlight active
        $container.querySelectorAll('.ft-item.active').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        butlerRef.openFile(node.path);
      });

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
  $container.innerHTML = '<div class="editor-loading"><div class="spinner"></div></div>';

  try {
    const data = await butlerRef.api.get('/api/files/tree');
    $container.innerHTML = '';
    const tree = document.createElement('div');
    tree.className = 'file-tree';
    tree.appendChild(renderTree(data.children));
    $container.appendChild(tree);
  } catch (e) {
    $container.innerHTML = `<div class="search-empty">Could not load files: ${esc(e.message)}</div>`;
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
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
    loadTree();
  },

  activate() {},
  deactivate() {},

  refresh() { loadTree(); },
};
