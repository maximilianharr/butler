/**
 * Butler — Diary Plugin
 *
 * Simple diary: list entries sorted newest-first, click to open in editor.
 * New entries named YYYYMMDDHHMMSS.md in UTC.
 * Type: 'panel' — renders in the side panel.
 */

let $container = null;
let butlerRef = null;

async function fetchEntries() {
  try {
    const tree = await butlerRef.api.get('/api/files/tree?path=diary');
    return (tree.children || [])
      .filter(c => c.name.endsWith('.md'))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest first
  } catch {
    return [];
  }
}

function render(entries) {
  if (!$container) return;
  $container.innerHTML = '';

  const wrap = el('div', 'diary-container');

  // Header with New button
  const header = el('div', 'diary-header');
  const newBtn = el('button', 'diary-new-btn');
  newBtn.textContent = '+ New Entry';
  newBtn.addEventListener('click', createEntry);
  header.appendChild(newBtn);
  wrap.appendChild(header);

  // Entry list
  const list = el('div', 'diary-list');
  if (entries.length === 0) {
    list.innerHTML = '<div class="diary-empty">No diary entries yet.</div>';
  }
  for (const entry of entries) {
    const item = el('div', 'diary-item');
    const dateStr = formatEntryDate(entry.name);
    item.innerHTML = `
      <span class="diary-date">${esc(dateStr)}</span>
      <span class="diary-name">${esc(entry.name)}</span>
    `;
    item.addEventListener('click', () => butlerRef.openFile(`diary/${entry.name}`));
    list.appendChild(item);
  }
  wrap.appendChild(list);
  $container.appendChild(wrap);
}

function formatEntryDate(filename) {
  // Parse YYYYMMDDHHMMSS.md or YYYYMMDDHHMMSSmmm.md (with milliseconds)
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})?\.md$/);
  if (!m) return filename;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

async function createEntry() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${String(now.getUTCMilliseconds()).padStart(3,'0')}`;
  const fname = `${ts}.md`;
  const isoDate = now.toISOString();
  const content = `---\ndate: '${isoDate}'\n---\n\n`;

  try {
    await butlerRef.api.post('/api/files/write', { path: `diary/${fname}`, content });
    butlerRef.openFile(`diary/${fname}`);
    butlerRef.toast('New diary entry created', 'success');
    // Refresh list
    const entries = await fetchEntries();
    render(entries);
  } catch (e) {
    butlerRef.toast(`Create failed: ${e.message}`, 'error');
  }
}

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
  const entries = await fetchEntries();
  render(entries);
}

export default {
  name: 'diary',
  type: 'panel',
  label: 'Diary',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <path d="M8 7h8M8 11h6"/>
  </svg>`,
  init,
  activate() {},
  deactivate() {},
};
