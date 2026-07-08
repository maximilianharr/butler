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

  const [cmCore, cmView, cmState, cmLangMd, cmLang, cmCmds, cmSearch, lezerHL, cmLangData, cmAutocomplete] = await Promise.all([
    import('https://esm.sh/codemirror'),
    import('https://esm.sh/@codemirror/view'),
    import('https://esm.sh/@codemirror/state'),
    import('https://esm.sh/@codemirror/lang-markdown'),
    import('https://esm.sh/@codemirror/language'),
    import('https://esm.sh/@codemirror/commands'),
    import('https://esm.sh/@codemirror/search'),
    import('https://esm.sh/@lezer/highlight'),
    import('https://esm.sh/@codemirror/language-data'),
    import('https://esm.sh/@codemirror/autocomplete'),
  ]);

  cmModules = { ...cmCore, ...cmView, ...cmState, ...cmLangMd, ...cmLang, ...cmCmds, ...cmSearch, ...lezerHL, ...cmLangData, ...cmAutocomplete };
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
  return `api/files/raw?path=${encodeURIComponent(resolved)}`;
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

// ─── Double-click to open images/attachments ────────────────

function dblClickOpen(cm) {
  return cm.EditorView.domEventHandlers({
    dblclick(event, view) {
      // Check if double-clicked on an image preview widget
      const imgEl = event.target.closest('.cm-image-preview img');
      if (imgEl) {
        const src = imgEl.src;
        // Extract path from raw API URL
        const rawMatch = src.match(/\/api\/files\/raw\?path=([^&]+)/);
        if (rawMatch) {
          const filePath = decodeURIComponent(rawMatch[1]);
          butlerRef?.openFile(filePath, { doubleClick: true });
        } else if (src.startsWith('http')) {
          window.open(src, '_blank', 'noopener');
        }
        event.preventDefault();
        return true;
      }

      // Check if double-clicked on an attachment widget
      const attachEl = event.target.closest('.cm-attachment-preview');
      if (attachEl) {
        const href = attachEl.dataset.href;
        if (href) {
          window.open(href, '_blank', 'noopener');
        }
        event.preventDefault();
        return true;
      }

      return false;
    }
  });
}

// ─── File Attachment Decoration (non-image links) ───────────

const ATTACH_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];

function attachmentDecorationField(cm) {
  class AttachWidget extends cm.WidgetType {
    constructor(url, label, rawHref) { super(); this.url = url; this.label = label; this.rawHref = rawHref; }
    eq(other) { return this.url === other.url; }
    toDOM() {
      const wrap = document.createElement('span');
      wrap.className = 'cm-attachment-preview';
      wrap.dataset.href = this.rawHref;
      wrap.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>`;
      const nameEl = document.createElement('span');
      nameEl.className = 'cm-attachment-name';
      nameEl.textContent = this.label;
      wrap.appendChild(nameEl);
      return wrap;
    }
  }

  function isAttachLink(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return false;
    const ext = url.split('.').pop()?.toLowerCase();
    return ext && !ATTACH_IMAGE_EXTS.includes(ext);
  }

  function buildDecos(state) {
    const widgets = [];
    const doc = state.doc;
    // Match non-image markdown links: [label](path)  but NOT ![](path)
    const linkRe = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      let m;
      while ((m = linkRe.exec(line.text)) !== null) {
        const url = m[2];
        if (isAttachLink(url)) {
          const label = m[1] || url.split('/').pop();
          const rawHref = resolveImageUrl(url); // reuse — works for any file
          widgets.push(cm.Decoration.widget({
            widget: new AttachWidget(url, label, rawHref),
            side: 1,
          }).range(line.from + m.index + m[0].length));
        }
      }
      linkRe.lastIndex = 0;
    }
    return cm.Decoration.set(widgets, true);
  }

  return cm.StateField.define({
    create(state) { return buildDecos(state); },
    update(value, tr) { return tr.docChanged ? buildDecos(tr.state) : value; },
    provide: f => cm.EditorView.decorations.from(f),
  });
}

// ─── [[ Zettelkasten Autocomplete ───────────────────────────

function zettelkastenAutocomplete(cm) {
  function zkComplete(context) {
    const before = context.matchBefore(/\[\[[^\]]*$/);
    if (!before) return null;
    const zkPlugin = butlerRef?.getPlugin?.('zettelkasten');
    const files = zkPlugin?.getFiles?.() || [];
    if (files.length === 0) return null;

    const query = before.text.substring(2).toLowerCase();
    const options = files
      .filter(f => f.label.toLowerCase().includes(query) || f.name.toLowerCase().includes(query))
      .map(f => ({
        label: f.label.replace(/\.md$/, ''),
        apply: (view, _completion, _from, to) => {
          const display = f.label.replace(/\.md$/, '');
          view.dispatch({
            changes: { from: before.from, to, insert: `[[${display}]]` },
          });
        },
        detail: f.path,
      }));

    return { from: before.from, options, filter: false };
  }

  return cm.autocompletion({
    override: [zkComplete],
    activateOnTyping: true,
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

      // Image blobs: keep custom resize+upload behavior.
      for (const item of data.items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const blob = item.getAsFile();
          if (blob) handleImagePaste(view, blob, cm);
          return true;
        }
      }

      // Text: insert as plain text (Ctrl+V is plain paste; use Ctrl+K
      // to paste as a markdown link).
      return false;
    }
  });
}

// Ctrl+K: insert a markdown link. If clipboard is accessible (permission already
// granted, no popup), use clipboard text. Otherwise use selected text.
function pasteAsLinkCommand(view) {
  const { from, to } = view.state.selection.main;
  const selection = view.state.sliceDoc(from, to);

  (async () => {
    let clipText = '';
    // Only read clipboard if permission is already granted (avoids browser popup)
    try {
      const perm = await navigator.permissions.query({ name: 'clipboard-read' });
      if (perm.state === 'granted') {
        clipText = (await navigator.clipboard.readText()) || '';
      }
    } catch {
      // Permissions API unavailable — try clipboard directly (works in Chrome user gesture)
      try { clipText = (await navigator.clipboard.readText()) || ''; } catch { /* skip */ }
    }
    clipText = clipText.trim();

    const isUrl = (s) => /^https?:\/\/\S+$/.test(s);
    const imgExts = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i;

    let md;
    if (selection && isUrl(clipText)) {
      // Selected text + URL in clipboard → [text](url)
      md = imgExts.test(clipText) ? `![${selection}](${clipText})` : `[${selection}](${clipText})`;
    } else if (isUrl(selection)) {
      // Selected text is a URL → [url](url)
      md = imgExts.test(selection) ? `![](${selection})` : `[${selection}](${selection})`;
    } else if (clipText) {
      // Clipboard has text, use it
      md = (isUrl(clipText) && imgExts.test(clipText)) ? `![](${clipText})` : `[${clipText}](${clipText})`;
    } else if (selection) {
      // Only selected text, no clipboard → wrap as link text
      md = `[${selection}]()`;
    } else {
      // Nothing available → insert link template
      md = `[]()`;
    }
    view.dispatch(view.state.replaceSelection(md));
  })();
  return true;
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
    const res = await fetch(`api/files/upload-image?plugin=${encodeURIComponent(dir)}`, {
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
    { tag: t.meta, color: 'var(--text-3)' },
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
    cm.indentUnit.of('  '),
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
    // Markdown with code block language support
    cm.markdown({ base: cm.markdownLanguage, codeLanguages: cm.languages }),
    butlerTheme(cm),
    headingStyles(cm),
    cm.keymap.of([
      { key: 'Mod-s', run() { saveCurrentFile(); return true; } },
      { key: 'Mod-k', run: pasteAsLinkCommand },
      cm.indentWithTab,
    ]),
    cm.EditorView.lineWrapping,
    updateListener,
    cm.search(),
    // Block decorations via StateField (not ViewPlugin — CM6 requirement)
    imageDecorationField(cm),
    attachmentDecorationField(cm),
    ...frontmatterFold(cm),
    // Inline interactions
    clickableLinks(cm),
    dblClickOpen(cm),
    pasteHandler(cm),
    // [[ autocomplete
    zettelkastenAutocomplete(cm),
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

// ─── Editor Toolbar ─────────────────────────────────────────

function buildToolbar(toolbarEl) {
  if (!toolbarEl) return;
  toolbarEl.innerHTML = '';

  const items = [
    {
      title: 'Insert Link',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      action: () => insertAtCursor('[link text](https://)')
    },
    {
      title: 'Attach File',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>',
      action: () => triggerFileUpload(false)
    },
    {
      title: 'Insert Image',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      action: () => triggerFileUpload(true)
    },
    {
      title: 'Insert Recording',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
      action: () => insertAtCursor('[🎙️ recording](recording.mp3)')
    },
    {
      title: 'Save (Ctrl+S)',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
      action: () => saveCurrentFile()
    },
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'editor-toolbar-btn';
    btn.title = item.title;
    btn.innerHTML = item.icon;
    btn.addEventListener('click', (e) => { e.preventDefault(); item.action(); });
    toolbarEl.appendChild(btn);
  }
}

function insertAtCursor(text) {
  if (!editorView) return;
  const pos = editorView.state.selection.main.head;
  editorView.dispatch({ changes: { from: pos, insert: text } });
  editorView.focus();
}

function triggerFileUpload(imageOnly) {
  const input = document.createElement('input');
  input.type = 'file';
  if (imageOnly) input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || !currentPath || !butlerRef) return;

    const lastSlash = currentPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? currentPath.substring(0, lastSlash + 1) : 'inbox/';

    const formData = new FormData();
    formData.append('file', file, file.name);

    try {
      const res = await fetch(`api/files/upload-image?plugin=${encodeURIComponent(dir)}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      const { path: relPath } = await res.json();
      const fileName = relPath.split('/').pop();

      const isImage = ATTACH_IMAGE_EXTS.includes(file.name.split('.').pop()?.toLowerCase());
      const md = isImage ? `![${file.name}](${fileName})` : `[${file.name}](${fileName})`;
      insertAtCursor(md);
      butlerRef.toast(`${isImage ? 'Image' : 'File'} attached`, 'success');
    } catch (e) {
      butlerRef.toast(`Upload failed: ${e.message}`, 'error');
    }
  });
  input.click();
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
      container.innerHTML = `
        <div id="editor-toolbar"></div>
        <div id="editor-container"></div>
      `;
      buildToolbar(document.getElementById('editor-toolbar'));
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
