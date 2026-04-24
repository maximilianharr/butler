/**
 * Butler — Search Plugin
 *
 * Full-text search across workspace markdown files.
 * Shows results with context in the side panel.
 */

let $container = null;
let butlerRef = null;
let debounceTimer = null;

function init(container, butler) {
  $container = container;
  butlerRef = butler;

  container.innerHTML = `
    <div class="search-container">
      <div class="search-input-wrap">
        <input type="text" class="search-input" placeholder="Search workspace…" autofocus>
      </div>
      <div class="search-count"></div>
      <div class="search-results"></div>
    </div>
  `;

  const input = container.querySelector('.search-input');
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value.trim()), 250);
  });

  // Focus input when search panel opens
  setTimeout(() => input.focus(), 50);
}

async function doSearch(query) {
  if (!$container || !butlerRef) return;
  const resultsEl = $container.querySelector('.search-results');
  const countEl = $container.querySelector('.search-count');

  if (!query || query.length < 2) {
    resultsEl.innerHTML = '<div class="search-empty">Type at least 2 characters to search</div>';
    countEl.textContent = '';
    return;
  }

  resultsEl.innerHTML = '<div class="editor-loading"><div class="spinner"></div></div>';
  countEl.textContent = '';

  try {
    const data = await butlerRef.api.get(`/api/search?q=${encodeURIComponent(query)}`);
    const results = data.results;

    countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">No results found</div>';
      return;
    }

    resultsEl.innerHTML = '';

    // Group by file
    const grouped = {};
    for (const r of results) {
      if (!grouped[r.file]) grouped[r.file] = [];
      grouped[r.file].push(r);
    }

    for (const [file, matches] of Object.entries(grouped)) {
      for (const match of matches) {
        const item = document.createElement('div');
        item.className = 'sr-item';

        const highlighted = highlightMatch(match.text, query);
        const ctxBefore = match.context_before != null ? `<div>${esc(match.context_before)}</div>` : '';
        const ctxAfter = match.context_after != null ? `<div>${esc(match.context_after)}</div>` : '';

        item.innerHTML = `
          <div class="sr-file">
            <span>${esc(file.split('/').pop())}</span>
            <span class="sr-line">:${match.line}</span>
          </div>
          <div class="sr-context">
            ${ctxBefore}
            <div class="sr-match-line">${highlighted}</div>
            ${ctxAfter}
          </div>
        `;

        item.addEventListener('click', () => {
          butlerRef.openFile(file);
        });

        resultsEl.appendChild(item);
      }
    }
  } catch (e) {
    resultsEl.innerHTML = `<div class="search-empty" style="color:var(--red)">Search error: ${esc(e.message)}</div>`;
  }
}

function highlightMatch(text, query) {
  const escaped = esc(text);
  const queryEsc = esc(query);
  const regex = new RegExp(`(${escRegex(queryEsc)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export default {
  name: 'search',
  type: 'panel',
  label: 'Search',
  icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',

  init,
  activate() {
    const input = $container?.querySelector('.search-input');
    if (input) setTimeout(() => input.focus(), 50);
  },
  deactivate() {},
};
