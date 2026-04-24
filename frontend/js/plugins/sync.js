/**
 * Butler — Sync Plugin
 *
 * Git status display with commit, push, and pull actions.
 */

let $container = null;
let butlerRef = null;

function init(container, butler) {
  $container = container;
  butlerRef = butler;

  container.innerHTML = `
    <div class="sync-container">
      <h3>Synchronization</h3>
      <div id="sync-content">
        <div class="editor-loading"><div class="spinner"></div><span>Loading status…</span></div>
      </div>
    </div>
  `;

  loadStatus();
}

async function loadStatus() {
  const contentEl = $container.querySelector('#sync-content');
  if (!contentEl) return;

  try {
    const status = await butlerRef.api.get('/api/sync/status');
    renderStatus(status, contentEl);
  } catch (e) {
    contentEl.innerHTML = `<div class="search-empty" style="color:var(--red)">Failed to load status: ${esc(e.message)}</div>`;
  }
}

function renderStatus(status, el) {
  if (!status.is_repo) {
    el.innerHTML = `
      <div class="sync-status-card">
        <p style="color:var(--text-3);font-size:14px;">The workspace is not a git repository.</p>
        <p style="color:var(--text-3);font-size:13px;margin-top:8px;">Initialize one with <code style="font-family:var(--ff-mono);background:var(--bg-2);padding:2px 6px;border-radius:3px;">git init</code> in your workspace directory.</p>
      </div>
    `;
    return;
  }

  const cleanBadge = status.clean
    ? '<span class="sync-badge clean">Clean</span>'
    : '<span class="sync-badge dirty">Uncommitted changes</span>';

  let remoteInfo = '';
  if (status.has_remote) {
    const parts = [];
    if (status.ahead > 0) parts.push(`${status.ahead} ahead`);
    if (status.behind > 0) parts.push(`${status.behind} behind`);
    remoteInfo = parts.length ? parts.join(', ') : 'Up to date';
  } else {
    remoteInfo = 'No remote configured';
  }

  let filesHTML = '';
  if (status.files.length > 0) {
    filesHTML = `
      <div class="sync-files">
        ${status.files.map(f => `
          <div class="sync-file-item">
            <span class="sync-file-status">${esc(f.status)}</span>
            <span class="sync-file-path">${esc(f.path)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  el.innerHTML = `
    <div class="sync-status-card">
      <div class="sync-row">
        <span class="sync-label">Branch</span>
        <span class="sync-value">${esc(status.branch)}</span>
      </div>
      <div class="sync-row">
        <span class="sync-label">Status</span>
        <span class="sync-value">${cleanBadge}</span>
      </div>
      <div class="sync-row">
        <span class="sync-label">Remote</span>
        <span class="sync-value">${esc(remoteInfo)}</span>
      </div>
      <div class="sync-row">
        <span class="sync-label">Changed files</span>
        <span class="sync-value">${status.files.length}</span>
      </div>
      ${filesHTML}
    </div>

    <input type="text" class="sync-commit-input" placeholder="Commit message (default: Butler sync)" id="sync-msg">

    <div class="sync-actions">
      <button class="btn btn-primary" id="sync-save" ${status.clean ? 'disabled' : ''}>
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save &amp; Commit
      </button>
      <button class="btn btn-secondary" id="sync-push" ${!status.has_remote ? 'disabled' : ''}>
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        Push
      </button>
      <button class="btn btn-secondary" id="sync-pull" ${!status.has_remote ? 'disabled' : ''}>
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        Pull
      </button>
      <button class="btn btn-ghost" id="sync-refresh">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9.51a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 14.49a9 9 0 0 1-14.85 3.36L1 14"/></svg>
        Refresh
      </button>
    </div>
  `;

  // Event listeners
  el.querySelector('#sync-save')?.addEventListener('click', doSave);
  el.querySelector('#sync-push')?.addEventListener('click', doPush);
  el.querySelector('#sync-pull')?.addEventListener('click', doPull);
  el.querySelector('#sync-refresh')?.addEventListener('click', loadStatus);
}

async function doSave() {
  const msg = $container.querySelector('#sync-msg')?.value || 'Butler sync';
  setBusy(true);
  try {
    const result = await butlerRef.api.post('/api/sync/save', { message: msg });
    butlerRef.toast(result.committed ? 'Committed successfully' : 'Nothing to commit', result.committed ? 'success' : 'info');
    await loadStatus();
    butlerRef.refreshFileTree();
  } catch (e) {
    butlerRef.toast(`Commit failed: ${e.message}`, 'error');
  }
  setBusy(false);
}

async function doPush() {
  setBusy(true);
  try {
    await butlerRef.api.post('/api/sync/push', {});
    butlerRef.toast('Pushed successfully', 'success');
    await loadStatus();
  } catch (e) {
    butlerRef.toast(`Push failed: ${e.message}`, 'error');
  }
  setBusy(false);
}

async function doPull() {
  setBusy(true);
  try {
    await butlerRef.api.post('/api/sync/pull', {});
    butlerRef.toast('Pulled successfully', 'success');
    await loadStatus();
    butlerRef.refreshFileTree();
  } catch (e) {
    butlerRef.toast(`Pull failed: ${e.message}`, 'error');
  }
  setBusy(false);
}

function setBusy(busy) {
  $container?.querySelectorAll('.sync-actions .btn').forEach(btn => {
    if (busy) btn.setAttribute('disabled', '');
    else if (!btn.dataset.keepDisabled) btn.removeAttribute('disabled');
  });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export default {
  name: 'sync',
  type: 'full',
  label: 'Sync',
  icon: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9.51a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 14.49a9 9 0 0 1-14.85 3.36L1 14"/></svg>',

  init,
  activate() {},
  deactivate() {},
};
