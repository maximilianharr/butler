/**
 * Butler — Zettelkasten Plugin
 *
 * Panel plugin showing only the zettelkasten/ folder tree.
 * Single-click opens file in editor (preview tab).
 * Double-click opens file pinned.
 * Type: 'panel' — renders in the side panel.
 */

let $container = null;
let butlerRef = null;
let expandedPaths = new Set();
let allFiles = [];

const ZK_ROOT = 'zettelkasten';

// ─── File Tree ──────────────────────────────────────────────

async function loadTree() {
  if (!$container || !butlerRef) return;
  try {
    const tree = await butlerRef.api.get(`/api/files/tree?path=${ZK_ROOT}`);
    const children = tree.children || [];
    allFiles = collectFiles(children);
    renderPanel(children);
  } catch {
    $container.innerHTML = `<div class="zk-empty">No zettelkasten folder found.</div>`;
    allFiles = [];
  }
}

function collectFiles(nodes, prefix = '') {
  const out = [];
  for (const n of nodes) {
    if (n.is_dir && n.children) {
      out.push(...collectFiles(n.children, prefix + n.name + '/'));
    } else if (!n.is_dir) {
      out.push({ name: n.name, path: n.path, label: prefix + n.name });
    }
  }
  return out;
}

function renderPanel(children) {
  $container.innerHTML = '';
  const wrap = el('div', 'zk-container');

  const header = el('div', 'zk-header');
  const title = el('span', 'zk-title');
  title.textContent = 'Zettelkasten';
  header.appendChild(title);

  const newBtn = el('button', 'zk-new-btn');
  newBtn.textContent = '+ New';
  newBtn.addEventListener('click', createNote);
  header.appendChild(newBtn);
  wrap.appendChild(header);

  const treeEl = el('div', 'zk-tree');
  treeEl.appendChild(renderTree(children, 0));
  wrap.appendChild(treeEl);
  $container.appendChild(wrap);
}

function renderTree(nodes, depth) {
  const frag = document.createDocumentFragment();

  for (const node of nodes) {
    const item = el('div', 'ft-item');
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

      const childWrap = el('div', `ft-children ${isExpanded ? '' : 'collapsed'}`);
      childWrap.dataset.path = node.path;
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
      item.dataset.path = node.path;
      item.innerHTML = `
        <span class="ft-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
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

      frag.appendChild(item);
    }
  }
  return frag;
}

async function toggleDir(node, childWrap, itemEl, depth) {
  const chevron = itemEl.querySelector('.ft-chevron');
  if (expandedPaths.has(node.path)) {
    expandedPaths.delete(node.path);
    childWrap.classList.add('collapsed');
    chevron?.classList.remove('expanded');
  } else {
    expandedPaths.add(node.path);
    childWrap.classList.remove('collapsed');
    chevron?.classList.add('expanded');
    if (!node.children || node.children.length === 0) {
      try {
        const sub = await butlerRef.api.get(`/api/files/tree?path=${encodeURIComponent(node.path)}`);
        node.children = sub.children || [];
        // Rebuild allFiles with newly loaded children
        const newFiles = collectFiles(node.children, node.path.replace(/^zettelkasten\/?/, '') + '/');
        const existingPaths = new Set(allFiles.map(f => f.path));
        for (const f of newFiles) {
          if (!existingPaths.has(f.path)) allFiles.push(f);
        }
      } catch { node.children = []; }
    }
    childWrap.innerHTML = '';
    childWrap.appendChild(renderTree(node.children || [], depth + 1));
  }
}

async function createNote() {
  const name = prompt('Note title:');
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) { butlerRef.toast('Invalid name', 'error'); return; }
  const path = `${ZK_ROOT}/${slug}.md`;
  const content = `# ${name}\n\n`;
  try {
    await butlerRef.api.post('/api/files/create', { path, content });
    butlerRef.openFile(path, { doubleClick: true });
    butlerRef.toast('Note created', 'success');
    await loadTree();
  } catch (e) {
    if (e.message.includes('Already exists')) {
      butlerRef.toast('Note already exists', 'error');
    } else {
      butlerRef.toast(`Create failed: ${e.message}`, 'error');
    }
  }
}

// ─── Public API (used by editor autocomplete) ───────────────

function getFiles() { return allFiles; }

// ─── Helpers ────────────────────────────────────────────────

function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ─── Plugin Interface ───────────────────────────────────────

async function init(container, butler) {
  $container = container;
  butlerRef = butler;
  await loadTree();
}

export default {
  name: 'zettelkasten',
  type: 'panel',
  label: 'Zettelkasten',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 8l2.5-3h13L21 8"/>
    <path d="M3 8v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8"/>
    <path d="M8 8v12"/>
    <path d="M12 8v12"/>
    <path d="M16 8v12"/>
  </svg>`,
  init,
  activate() {},
  deactivate() {},
  getFiles,
};
