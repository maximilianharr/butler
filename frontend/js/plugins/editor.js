/**
 * Butler — Editor Plugin
 *
 * CodeMirror 6 WYSIWYM markdown editor loaded lazily from CDN.
 * Features: inline image previews, clickable links, frontmatter fold,
 *           clipboard paste (images + links).
 *
 * Block decorations use StateField (not ViewPlugin) per CM6 rules.
 */

let cmModules = null;
let editorView = null;
let currentPath = null;
let butlerRef = null;
let switchSeq = 0;

const tabStates = new Map();

// ─── Lazy-load CodeMirror from esm.sh (no version pins) ────

async function loadCM() {
  if (cmModules) return cmModules;

  const [cmCore, cmView, cmState, cmLangMd, cmLang, cmCmds, cmSearch, lezerHL] = await Promise.all([
    import('https://esm.sh/codemirror'),
    import('https://esm.sh/@codemirror/view'),
    import('https://esm.sh/@codemirror/state'),
    import('https://esm.sh/@codemirror/lang-markdown'),
    import('https://esm.sh/@codemirror/language'),
    import('https://esm.sh/@codemirror/commands'),
    import('https://esm.sh/@codemirror/search'),
    import('https://esm.sh/@lezer/highlight'),
  ]);

  cmModules = { ...cmCore, ...cmView, ...cmState, ...cmLangMd, ...cmLang, ...cmCmds, ...cmSearch, ...lezerHL };
  return cmModules;
}

// ─── Resolve relative paths against current file ────────────

function resolveImageUrl(src) {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (!currentPath) return src;
  const dir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
  let resolved = src;
  if (src.startsWith('./')) resolved = dir + src.substring(2);
  else if (!src.startsWith('/')) resolved = dir + src;
  return `/api/files/raw?path=${encodeURIComponent(resolved)}`;
}

// ─── Image Preview Decoration (StateField — block-safe) ─────

function imageDecorationField(cm) {
  class ImageWidget extends cm.WidgetType {
    constructor(url, alt) { super(); this.url = url; this.alt = alt; }
    eq(other) { return this.url === other.url; }
    toDOM() {
      const wrap = document.createElement('div');
      wrap.className = 'cm-image-preview';
      const img = document.createElement('img');
      img.src = this.url;
      img.alt = this.alt;
      img.loading = 'lazy';
      img.onerror = () => { wrap.style.display = 'none'; };
      wrap.appendChild(img);
      return wrap;
    }
  }

  function buildDecos(state) {
    const widgets = [];
    const doc = state.doc;
    const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const m = line.text.match(imgRe);
      if (m) {
        widgets.push(cm.Decoration.widget({
          widget: new ImageWidget(resolveImageUrl(m[2]), m[1]),
          block: true,
        }).range(line.to));
      }
    }
    return cm.Decoration.set(widgets, true);
  }

  return cm.StateField.define({
    create(state) { return buildDecos(state); },
    update(value, tr) { return tr.docChanged ? buildDecos(tr.state) : value; },
    provide: f => cm.EditorView.decorations.from(f),
  });
}

// ─── Clickable Links (Ctrl+Click) ──────────────────────────

function clickableLinks(cm) {
  return cm.EditorView.domEventHandlers({
    click(event, view) {
      if (!event.ctrlKey && !event.metaKey) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos);
      const linkRe = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      let m;
      while ((m = linkRe.exec(line.text)) !== null) {
        const start = line.from + m.index;
        const end = start + m[0].length;
        if (pos >= start && pos <= end) {
          const url = m[2];
          if (url.startsWith('http://') || url.startsWith('https://')) {
            window.open(url, '_blank', 'noopener');
          } else if (url.endsWith('.md') && butlerRef) {
            const dir = currentPath ? currentPath.substring(0, currentPath.lastIndexOf('/') + 1) : '';
            const resolved = url.startsWith('./') ? dir + url.substring(2) : dir + url;
            butlerRef.openFile(resolved);
          }
          event.preventDefault();
          return true;
        }
      }
      return false;
    }
  });
}

// ─── Frontmatter Fold (StateField — block-safe) ────────────

function findFrontmatterEnd(doc) {
  if (doc.lines < 2) return -1;
  if (doc.line(1).text.trim() !== '---') return -1;
  for (let i = 2; i <= doc.lines; i++) {
    if (doc.line(i).text.trim() === '---') return doc.line(i).to;
  }
  return -1;
}

function frontmatterFold(cm) {
  const toggleEffect = cm.StateEffect.define();

  const fmField = cm.StateField.define({
    create(state) {
      return { collapsed: true, end: findFrontmatterEnd(state.doc) };
    },
    update(value, tr) {
      let next = value;
      if (tr.docChanged) next = { ...next, end: findFrontmatterEnd(tr.state.doc) };
      for (const e of tr.effects) {
        if (e.is(toggleEffect)) next = { ...next, collapsed: !next.collapsed };
      }
      return next;
    },
  });

  class FmWidget extends cm.WidgetType {
    constructor(collapsed) { super(); this.collapsed = collapsed; }
    eq(other) { return this.collapsed === other.collapsed; }
    toDOM(view) {
      const btn = document.createElement('div');
      btn.className = 'cm-frontmatter-toggle';
      btn.textContent = this.collapsed ? '▸ show frontmatter' : '▾ hide frontmatter';
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.dispatch({ effects: toggleEffect.of(null) });
      });
      return btn;
    }
    ignoreEvent() { return false; }
  }

  // Decoration via StateField.provide (not ViewPlugin) — required for block decos
  const decoField = cm.StateField.define({
    create(state) { return buildFmDecos(state); },
    update(value, tr) {
      const changed = tr.docChanged ||
        tr.startState.field(fmField) !== tr.state.field(fmField);
      return changed ? buildFmDecos(tr.state) : value;
    },
    provide: f => cm.EditorView.decorations.from(f),
  });

  function buildFmDecos(state) {
    const { collapsed, end } = state.field(fmField);
    if (end < 0) return cm.Decoration.none;

    if (collapsed) {
      return cm.Decoration.set([
        cm.Decoration.replace({
          widget: new FmWidget(true),
          block: true,
        }).range(0, end),
      ]);
    } else {
      return cm.Decoration.set([
        cm.Decoration.widget({
          widget: new FmWidget(false),
          block: true,
          side: -1,
        }).range(0),
      ]);
    }
  }

  return [fmField, decoField];
}

// ─── Clipboard Paste Handler ────────────────────────────────

function pasteHandler(cm) {
  return cm.EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData;
      if (!data) return false;

      // Check for image blob in clipboard
      for (const item of data.items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const blob = item.getAsFile();
          if (blob) handleImagePaste(view, blob, cm);
          return true;
        }
      }

      // Check for pasted URL text
      const text = data.getData('text/plain')?.trim();
      if (text && /^https?:\/\/\S+$/.test(text)) {
        event.preventDefault();
        const imgExts = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i;
        const md = imgExts.test(text)
          ? `![](${text})`
          : `[${text}](${text})`;
        view.dispatch(view.state.replaceSelection(md));
        return true;
      }

      return false;
    }
  });
}

async function handleImagePaste(view, blob, cm) {
  if (!currentPath || !butlerRef) return;

  // Capture cursor position at paste time
  const pastePos = view.state.selection.main.head;
  const pastePath = currentPath;

  // Show resize popup
  const resized = await showResizePopup(blob);
  if (!resized) return; // user cancelled

  // Verify editor is still on the same file
  if (currentPath !== pastePath) {
    butlerRef.toast('File changed during paste — cancelled', 'error');
    return;
  }

  // Upload the (possibly resized) blob
  const lastSlash = pastePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? pastePath.substring(0, lastSlash + 1) : 'inbox/';
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';

  const formData = new FormData();
  formData.append('file', resized.blob, `paste.${ext}`);

  try {
    const res = await fetch(`/api/files/upload-image?plugin=${encodeURIComponent(dir)}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    const { path: relPath } = await res.json();

    // Compute path relative to current file
    const fileName = relPath.split('/').pop();
    const md = `![](${fileName})`;

    // Insert at original cursor position (or current if positions shifted)
    const pos = Math.min(pastePos, view.state.doc.length);
    view.dispatch({ changes: { from: pos, insert: md } });
  } catch (e) {
    butlerRef.toast(`Paste failed: ${e.message}`, 'error');
  }
}

function showResizePopup(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      const ratio = origW / origH;

      // Create popup
      const overlay = document.createElement('div');
      overlay.className = 'resize-overlay';
      overlay.innerHTML = `
        <div class="resize-popup">
          <h3>Resize image?</h3>
          <div class="resize-preview"><img src="${url}" /></div>
          <div class="resize-fields">
            <label>Width <input type="number" id="rz-w" value="${origW}" min="1" /></label>
            <span class="resize-lock">🔗</span>
            <label>Height <input type="number" id="rz-h" value="${origH}" min="1" /></label>
          </div>
          <div class="resize-actions">
            <button class="btn-secondary" data-action="original">Keep original</button>
            <button class="btn-primary" data-action="resize">Resize & insert</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const $w = overlay.querySelector('#rz-w');
      const $h = overlay.querySelector('#rz-h');
      let lockRatio = true;

      overlay.querySelector('.resize-lock').addEventListener('click', (e) => {
        lockRatio = !lockRatio;
        e.target.textContent = lockRatio ? '🔗' : '🔓';
      });

      $w.addEventListener('input', () => {
        if (lockRatio) $h.value = Math.round(+$w.value / ratio);
      });
      $h.addEventListener('input', () => {
        if (lockRatio) $w.value = Math.round(+$h.value * ratio);
      });

      const cleanup = () => { overlay.remove(); URL.revokeObjectURL(url); };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { cleanup(); resolve(null); }
      });

      overlay.querySelector('[data-action="original"]').addEventListener('click', () => {
        cleanup();
        resolve({ blob });
      });

      overlay.querySelector('[data-action="resize"]').addEventListener('click', () => {
        const newW = +$w.value;
        const newH = +$h.value;
        if (newW === origW && newH === origH) {
          cleanup();
          resolve({ blob });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newW, newH);
        canvas.toBlob((resizedBlob) => {
          cleanup();
          resolve({ blob: resizedBlob || blob });
        }, blob.type || 'image/png');
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob }); // fallback: keep original
    };
    img.src = url;
  });
}

// ─── Custom Theme ───────────────────────────────────────────

function butlerTheme(cm) {
  return cm.EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '4px 8px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--accent-bg-strong)' },
    '.cm-activeLine': { backgroundColor: 'var(--accent-bg)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--accent-bg)' },
    '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none', color: 'var(--text-3)' },
    '.cm-lineNumbers .cm-gutterElement': { fontSize: '11px', padding: '0 4px 0 2px' },
    '.cm-tooltip': { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)' },
    '.cm-tooltip-autocomplete': { '& > ul > li': { padding: '4px 8px' } },
    '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--text-1)' },
    '.cm-panels input, .cm-panels button': { color: 'var(--text-1)' },
    '.cm-search label': { color: 'var(--text-2)' },
    '.cm-textfield': { backgroundColor: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: '4px', padding: '4px 8px' },
    '.cm-button': { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: '4px' },
  }, { dark: document.documentElement.getAttribute('data-theme') !== 'bright' });
}

// ─── Heading Styles ─────────────────────────────────────────

function headingStyles(cm) {
  const t = cm.tags;
  return cm.syntaxHighlighting(cm.HighlightStyle.define([
    { tag: t.heading1, fontFamily: 'var(--ff-heading)', fontSize: '1.8em', fontWeight: '600', color: 'var(--text-1)' },
    { tag: t.heading2, fontFamily: 'var(--ff-heading)', fontSize: '1.5em', fontWeight: '500', color: 'var(--text-1)' },
    { tag: t.heading3, fontFamily: 'var(--ff-heading)', fontSize: '1.25em', fontWeight: '500', color: 'var(--text-1)' },
    { tag: t.heading4, fontSize: '1.1em', fontWeight: '600', color: 'var(--text-1)' },
    { tag: t.heading5, fontSize: '1.05em', fontWeight: '600', color: 'var(--text-2)' },
    { tag: t.heading6, fontSize: '1em', fontWeight: '600', color: 'var(--text-3)' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-3)' },
    { tag: t.link, color: 'var(--accent)', cursor: 'pointer' },
    { tag: t.url, color: 'var(--accent-dim)' },
    { tag: t.monospace, fontFamily: 'var(--ff-mono)', fontSize: '0.9em', color: 'var(--text-2)' },
    { tag: t.meta, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: '0.9em' },
    { tag: t.comment, color: 'var(--text-3)', fontStyle: 'italic' },
    { tag: t.quote, color: 'var(--text-2)', fontStyle: 'italic' },
    { tag: t.keyword, color: 'var(--blue)' },
    { tag: t.string, color: 'var(--accent)' },
    { tag: t.number, color: 'var(--orange)' },
    { tag: t.bool, color: 'var(--orange)' },
    { tag: t.null, color: 'var(--text-3)' },
    { tag: t.processingInstruction, color: 'var(--text-3)' },
  ]));
}

// ─── Extension Builder ──────────────────────────────────────

function buildExtensions(cm) {
  const updateListener = cm.EditorView.updateListener.of((update) => {
    if (update.docChanged && currentPath) {
      const ts = tabStates.get(currentPath);
      if (ts) ts.dirty = true;
      if (butlerRef?.onTabDirtyChange) butlerRef.onTabDirtyChange(currentPath, true);
    }
  });

  return [
    // Manual setup (no foldGutter — prevents list-item fold toggles)
    cm.lineNumbers(),
    cm.highlightActiveLineGutter(),
    cm.highlightSpecialChars(),
    cm.history(),
    cm.drawSelection(),
    cm.dropCursor(),
    cm.EditorState.allowMultipleSelections.of(true),
    cm.indentOnInput(),
    cm.syntaxHighlighting(cm.defaultHighlightStyle, { fallback: true }),
    cm.bracketMatching(),
    cm.highlightActiveLine(),
    cm.highlightSelectionMatches(),
    cm.keymap.of([
      ...cm.defaultKeymap,
      ...cm.searchKeymap,
      ...cm.historyKeymap,
    ]),
    // Markdown
    cm.markdown({ base: cm.markdownLanguage }),
    butlerTheme(cm),
    headingStyles(cm),
    cm.keymap.of([
      { key: 'Mod-s', run() { saveCurrentFile(); return true; } },
      cm.indentWithTab,
    ]),
    cm.EditorView.lineWrapping,
    updateListener,
    cm.search(),
    // Block decorations via StateField (not ViewPlugin — CM6 requirement)
    imageDecorationField(cm),
    ...frontmatterFold(cm),
    // Inline interactions
    clickableLinks(cm),
    pasteHandler(cm),
  ];
}

// ─── Editor Management ──────────────────────────────────────

async function ensureEditor(container) {
  const cm = await loadCM();

  if (!editorView) {
    editorView = new cm.EditorView({
      state: cm.EditorState.create({ doc: '', extensions: buildExtensions(cm) }),
      parent: container,
    });
  } else if (editorView.dom.parentElement !== container) {
    container.appendChild(editorView.dom);
  }
}

async function switchToFile(path, container) {
  const cm = await loadCM();
  await ensureEditor(container);
  const seq = ++switchSeq;

  if (currentPath && editorView) {
    const existing = tabStates.get(currentPath);
    tabStates.set(currentPath, {
      ...(existing || {}),
      editorState: editorView.state,
      scrollTop: editorView.scrollDOM.scrollTop,
    });
  }

  const tabState = tabStates.get(path);
  if (tabState?.editorState) {
    if (seq !== switchSeq) return;
    currentPath = path;
    editorView.setState(tabState.editorState);
    requestAnimationFrame(() => {
      if (editorView?.scrollDOM) editorView.scrollDOM.scrollTop = tabState.scrollTop || 0;
    });
  } else {
    const { content } = await butlerRef.api.get(`/api/files/read?path=${encodeURIComponent(path)}`);
    if (seq !== switchSeq) return;
    currentPath = path;
    const newState = cm.EditorState.create({ doc: content, extensions: buildExtensions(cm) });
    editorView.setState(newState);
    tabStates.set(path, { editorState: newState, scrollTop: 0, dirty: false });
  }
}

// ─── Save ───────────────────────────────────────────────────

async function saveCurrentFile() {
  if (!currentPath || !editorView || !butlerRef) return;
  const content = editorView.state.doc.toString();
  try {
    await butlerRef.api.post('/api/files/write', { path: currentPath, content });
    const ts = tabStates.get(currentPath);
    if (ts) ts.dirty = false;
    if (butlerRef.onTabDirtyChange) butlerRef.onTabDirtyChange(currentPath, false);
    butlerRef.toast('Saved', 'success');
  } catch (e) {
    butlerRef.toast(`Save failed: ${e.message}`, 'error');
  }
}

// ─── Tab Management ─────────────────────────────────────────

function closeTab(path) {
  tabStates.delete(path);
  if (currentPath === path) currentPath = null;
}

// ─── Plugin Interface ───────────────────────────────────────

export default {
  name: 'editor',
  type: 'internal',
  label: 'Editor',

  async openFile(path, container, butler) {
    butlerRef = butler || butlerRef;
    if (!container) return;

    container.innerHTML = '<div class="editor-loading"><div class="spinner"></div><span>Loading editor…</span></div>';

    try {
      container.innerHTML = '<div id="editor-container"></div>';
      const editorEl = document.getElementById('editor-container');
      await switchToFile(path, editorEl);
    } catch (e) {
      container.innerHTML = `<div class="editor-loading" style="color:var(--red)">Failed to open: ${e.message}</div>`;
    }
  },

  save: saveCurrentFile,
  closeTab,

  getCurrentFile() { return currentPath; },
  isDirty(path) {
    const p = path || currentPath;
    return p ? (tabStates.get(p)?.dirty || false) : false;
  },
  getOpenPaths() { return [...tabStates.keys()]; },
};
