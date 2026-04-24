/**
 * Butler — Editor Plugin
 *
 * CodeMirror 6 WYSIWYM markdown editor loaded lazily from CDN.
 * Used by other plugins (files, search) to open markdown files.
 */

let cmModules = null;
let editorView = null;
let currentPath = null;
let dirty = false;
let butlerRef = null;

// ─── Lazy-load CodeMirror from esm.sh ──────────────────────

async function loadCM() {
  if (cmModules) return cmModules;

  const [
    cmCore,
    cmState,
    cmView,
    cmLangMd,
    cmLang,
    cmCommands,
    cmSearch,
    lezerHL,
  ] = await Promise.all([
    import('https://esm.sh/codemirror@6.0.1'),
    import('https://esm.sh/@codemirror/state@6.5.2'),
    import('https://esm.sh/@codemirror/view@6.36.5'),
    import('https://esm.sh/@codemirror/lang-markdown@6.3.1'),
    import('https://esm.sh/@codemirror/language@6.10.8'),
    import('https://esm.sh/@codemirror/commands@6.8.1'),
    import('https://esm.sh/@codemirror/search@6.5.10'),
    import('https://esm.sh/@lezer/highlight@1.2.1'),
  ]);

  cmModules = { ...cmCore, ...cmState, ...cmView, ...cmLangMd, ...cmLang, ...cmCommands, ...cmSearch, ...lezerHL };
  return cmModules;
}

// ─── Custom Theme ───────────────────────────────────────────

function butlerTheme(cm) {
  return cm.EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--accent-bg-strong)' },
    '.cm-activeLine': { backgroundColor: 'var(--accent-bg)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--accent-bg)' },
    '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none', color: 'var(--text-3)' },
    '.cm-lineNumbers .cm-gutterElement': { fontSize: '11px', padding: '0 8px 0 4px' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 4px' },
    '.cm-tooltip': { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)' },
    '.cm-tooltip-autocomplete': { '& > ul > li': { padding: '4px 8px' } },
    '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--text-1)' },
    '.cm-panels input, .cm-panels button': { color: 'var(--text-1)' },
    '.cm-search label': { color: 'var(--text-2)' },
    '.cm-textfield': { backgroundColor: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: '4px', padding: '4px 8px' },
    '.cm-button': { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-1)', borderRadius: '4px' },
  }, { dark: true });
}

// ─── Heading highlight style ────────────────────────────────

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
    { tag: t.link, color: 'var(--accent)' },
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

// ─── Save Keybinding ────────────────────────────────────────

function saveKeymap(cm) {
  return cm.keymap.of([{
    key: 'Mod-s',
    run() { saveCurrentFile(); return true; },
  }]);
}

// ─── Create Editor ──────────────────────────────────────────

async function createEditor(container, content, path) {
  const cm = await loadCM();

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  const updateListener = cm.EditorView.updateListener.of((update) => {
    if (update.docChanged) dirty = true;
  });

  const extensions = [
    cm.basicSetup,
    cm.markdown({ base: cm.markdownLanguage }),
    butlerTheme(cm),
    headingStyles(cm),
    saveKeymap(cm),
    cm.EditorView.lineWrapping,
    updateListener,
    cm.search(),
    cm.keymap.of([cm.indentWithTab]),
  ];

  editorView = new cm.EditorView({
    state: cm.EditorState.create({ doc: content, extensions }),
    parent: container,
  });

  currentPath = path;
  dirty = false;
}

// ─── Save ───────────────────────────────────────────────────

async function saveCurrentFile() {
  if (!currentPath || !editorView || !butlerRef) return;
  const content = editorView.state.doc.toString();
  try {
    await butlerRef.api.post('/api/files/write', { path: currentPath, content });
    dirty = false;
    butlerRef.toast('Saved', 'success');
  } catch (e) {
    butlerRef.toast(`Save failed: ${e.message}`, 'error');
  }
}

// ─── Plugin Interface ───────────────────────────────────────

export default {
  name: 'editor',
  type: 'internal', // not shown in sidebar
  label: 'Editor',

  async openFile(path, container, butler) {
    butlerRef = butler || butlerRef;
    if (!container) return;

    container.innerHTML = '<div class="editor-loading"><div class="spinner"></div><span>Loading editor…</span></div>';

    try {
      const { content } = await butlerRef.api.get(`/api/files/read?path=${encodeURIComponent(path)}`);
      container.innerHTML = '<div id="editor-container"></div>';
      const editorEl = document.getElementById('editor-container');
      await createEditor(editorEl, content, path);
    } catch (e) {
      container.innerHTML = `<div class="editor-loading" style="color:var(--red)">Failed to open: ${e.message}</div>`;
    }
  },

  save: saveCurrentFile,

  getCurrentFile() { return currentPath; },
  isDirty() { return dirty; },
};
