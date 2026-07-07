// Inbox plugin: quick notes, mobile-friendly. Camera / attach / prev / next / new.
import { dumpFrontmatter, nowIso, nowStamp } from "/md.js";

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div class="pane-top">
            <button id="cam" title="Take picture">📷</button>
            <button id="clip" title="Attach file">📎</button>
            <button id="prev" title="Previous">&lt;</button>
            <button id="next" title="Next">&gt;</button>
            <button id="new" class="primary" title="New inbox item">+</button>
            <span id="which" class="muted"></span>
            <input type="file" id="camfile" accept="image/*" capture="environment" hidden>
            <input type="file" id="clipfile" hidden>
        </div>
        <div id="ed" style="flex:1; display:flex; flex-direction:column; min-width:0"></div>`;
    const ed = el.querySelector("#ed");
    const which = el.querySelector("#which");
    let items = [], idx = 0, editor = null;

    async function refresh() {
        const tree = await ctx.api("/api/files/tree?path=inbox").catch(() => []);
        items = tree.filter(n => !n.children && n.name.endsWith(".md")).map(n => n.path).reverse();
    }

    async function show(i) {
        idx = Math.max(0, Math.min(i, items.length - 1));
        if (!items.length) { ed.innerHTML = `<div class="muted" style="padding:16px">Inbox empty — hit +</div>`; which.textContent = ""; return; }
        which.textContent = `${idx + 1}/${items.length}`;
        editor = await ctx.embedEditor(ed, items[idx]);
    }

    async function upload(file) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/files/upload?dir=inbox`, { method: "POST", body: form });
        const { name } = await res.json();
        const md = file.type.startsWith("image/") ? `![${name}](./${name})` : `[${name}](./${name})`;
        if (editor?.view) editor.view.dispatch(editor.view.state.replaceSelection(md + "\n"));
        else if (editor) editor.setValue(editor.getValue() + "\n" + md);
    }

    for (const [btn, input] of [["cam", "camfile"], ["clip", "clipfile"]]) {
        const inp = el.querySelector(`#${input}`);
        el.querySelector(`#${btn}`).addEventListener("click", () => inp.click());
        inp.addEventListener("change", () => { if (inp.files[0]) upload(inp.files[0]); inp.value = ""; });
    }
    el.querySelector("#prev").addEventListener("click", () => show(idx - 1));
    el.querySelector("#next").addEventListener("click", () => show(idx + 1));
    el.querySelector("#new").addEventListener("click", async () => {
        const path = `inbox/${nowStamp()}.md`;
        await ctx.api("/api/files/write", { method: "PUT", json: { path, content: dumpFrontmatter({ time: nowIso() }, "") } });
        await refresh();
        await show(items.indexOf(path));
    });

    await refresh();
    await show(0);
}
