// Diary plugin: entry list + editor; new entries named YYYYMMDDHHMMSS.md (UTC).
import { dumpFrontmatter, nowIso, nowStamp } from "/md.js";

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div style="display:flex; flex:1; min-height:0">
            <div style="width:220px; border-right:1px solid var(--border); display:flex; flex-direction:column">
                <div class="pane-top"><button id="new" class="primary">+ New entry</button></div>
                <div id="list" style="overflow:auto; flex:1; padding:4px"></div>
            </div>
            <div id="ed" style="flex:1; display:flex; flex-direction:column; min-width:0"></div>
        </div>`;
    const list = el.querySelector("#list");
    const ed = el.querySelector("#ed");

    async function refresh(selectPath) {
        const tree = await ctx.api("/api/files/tree?path=diary").catch(() => []);
        const entries = tree.filter(n => !n.children && n.name.endsWith(".md")).reverse();
        list.replaceChildren();
        for (const e of entries) {
            const row = document.createElement("div");
            row.className = "list-row";
            row.textContent = e.title || pretty(e.name);
            row.addEventListener("click", () => open(e.path, row));
            list.appendChild(row);
            if (e.path === selectPath) row.click();
        }
        if (!selectPath) list.firstChild?.click();
    }

    async function open(path, row) {
        list.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
        await ctx.embedEditor(ed, path);
    }

    el.querySelector("#new").addEventListener("click", async () => {
        const path = `diary/${nowStamp()}.md`;
        await ctx.api("/api/files/write", { method: "PUT", json: { path, content: dumpFrontmatter({ date: nowIso() }, "") } });
        await refresh(path);
    });

    await refresh();
}

// 20260418193359 -> 2026-04-18 19:33
function pretty(name) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : name;
}
