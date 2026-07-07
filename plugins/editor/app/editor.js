// Butler shared WYSIWYM markdown editor (CodeMirror 6).
// Bundled by `run.sh build` into frontend/vendor/editor.js.
import { EditorView, keymap, Decoration, WidgetType, ViewPlugin } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxTree, syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";

// ---- path helpers (resolve links relative to the open file) ----
function resolve(rel, filePath) {
    if (/^[a-z]+:/i.test(rel)) return rel; // absolute URL
    const dir = (filePath ?? "").split("/").slice(0, -1).join("/");
    return new URL(rel, `file:///${dir}/`).pathname.replace(/^\//, "");
}

class ImageWidget extends WidgetType {
    constructor(src) { super(); this.src = src; }
    eq(o) { return o.src === this.src; }
    toDOM() {
        const img = document.createElement("img");
        img.src = this.src;
        img.className = "cm-md-image";
        return img;
    }
}

class LinkWidget extends WidgetType {
    constructor(text, href, onClick) { super(); this.text = text; this.href = href; this.onClick = onClick; }
    eq(o) { return o.text === this.text && o.href === this.href; }
    toDOM() {
        const a = document.createElement("a");
        a.textContent = this.text;
        a.className = "cm-md-link";
        if (this.onClick) {
            a.href = "#";
            a.addEventListener("click", (e) => { e.preventDefault(); this.onClick(); });
        } else {
            a.href = this.href;
            a.target = "_blank";
        }
        return a;
    }
    ignoreEvent() { return true; }
}

const WIKI_RE = /\[\[([^\]]+)\]\]/g;

// WYSIWYM: images/links render as widgets unless the selection touches them
function wysiwym(opts) {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = this.build(view); }
        update(u) {
            if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view);
        }
        build(view) {
            const decos = [];
            const sel = view.state.selection.main;
            const touches = (from, to) => sel.from <= to && sel.to >= from;
            const doc = view.state.doc;
            for (const { from, to } of view.visibleRanges) {
                // markdown syntax nodes
                syntaxTree(view.state).iterate({
                    from, to,
                    enter: (node) => {
                        const m = /^ATXHeading(\d)$/.exec(node.name);
                        if (m) {
                            const line = doc.lineAt(node.from);
                            decos.push(Decoration.line({ class: `cm-h${m[1]}` }).range(line.from));
                            return;
                        }
                        if (touches(node.from, node.to)) return;
                        const text = doc.sliceString(node.from, node.to);
                        if (node.name === "Image") {
                            const im = /^!\[[^\]]*\]\(([^)\s]+)[^)]*\)$/.exec(text);
                            if (im) {
                                const src = /^[a-z]+:/i.test(im[1]) ? im[1]
                                    : `/api/files/raw?path=${encodeURIComponent(resolve(im[1], opts.path))}`;
                                decos.push(Decoration.replace({ widget: new ImageWidget(src) }).range(node.from, node.to));
                            }
                        } else if (node.name === "Link") {
                            const lm = /^\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(text);
                            if (lm) decos.push(Decoration.replace({ widget: new LinkWidget(lm[1] || lm[2], lm[2]) }).range(node.from, node.to));
                        }
                    },
                });
                // [[wiki-links]] to other markdown files
                const text = doc.sliceString(from, to);
                for (const m of text.matchAll(WIKI_RE)) {
                    const start = from + m.index, end = start + m[0].length;
                    if (touches(start, end)) continue;
                    const target = resolve(m[1], opts.path);
                    const open = () => opts.ctx?.openFile?.(target);
                    decos.push(Decoration.replace({ widget: new LinkWidget(m[1], target, open) }).range(start, end));
                }
            }
            return Decoration.set(decos.sort((a, b) => a.from - b.from || a.to - b.to), true);
        }
    }, { decorations: (v) => v.decorations });
}

// paste: clipboard images upload to the file's folder as YYYYMMDDHHMMSS.<ext> (UTC);
// pasted URLs become [url](url) or wrap the selection
function pasteHandler(opts) {
    return EditorView.domEventHandlers({
        paste(event, view) {
            const items = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"));
            if (items.length) {
                event.preventDefault();
                const dir = (opts.path ?? "").split("/").slice(0, -1).join("/");
                for (const file of items) {
                    const form = new FormData();
                    form.append("file", file, file.name || `paste.${file.type.split("/")[1]}`);
                    fetch(`/api/files/upload?dir=${encodeURIComponent(dir)}`, { method: "POST", body: form })
                        .then(r => r.json())
                        .then(({ name }) => {
                            view.dispatch(view.state.replaceSelection(`![${name}](./${name})`));
                        });
                }
                return true;
            }
            const text = event.clipboardData?.getData("text/plain")?.trim();
            if (text && /^https?:\/\/\S+$/.test(text)) {
                event.preventDefault();
                const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
                view.dispatch(view.state.replaceSelection(`[${sel || text}](${text})`));
                return true;
            }
            return false;
        },
    });
}

export function createEditor(parent, opts = {}) {
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: opts.content ?? "",
            extensions: [
                history(),
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                syntaxHighlighting(classHighlighter),
                EditorView.lineWrapping,
                wysiwym(opts),
                pasteHandler(opts),
                EditorView.updateListener.of((u) => {
                    if (u.docChanged) opts.onChange?.(u.state.doc.toString());
                }),
            ],
        }),
    });
    return {
        view,
        getValue: () => view.state.doc.toString(),
        setValue: (v) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }),
        focus: () => view.focus(),
        destroy: () => view.destroy(),
        scrollToLine: (n) => {
            const line = view.state.doc.line(Math.min(n, view.state.doc.lines));
            view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
        },
    };
}
