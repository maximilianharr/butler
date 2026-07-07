// Dossier plugin: person list with letter separators + A–Z jump index + editor.
import { parseFrontmatter } from "/md.js";

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div style="display:flex; flex:1; min-height:0">
            <div style="width:240px; border-right:1px solid var(--border); display:flex; min-height:0">
                <div id="list" style="flex:1; overflow:auto; padding:4px"></div>
                <div id="az" style="display:flex; flex-direction:column; justify-content:center; font-size:0.7em; padding:0 2px; color:var(--fg-muted)"></div>
            </div>
            <div id="ed" style="flex:1; display:flex; flex-direction:column; min-width:0"></div>
        </div>`;
    const list = el.querySelector("#list");
    const az = el.querySelector("#az");
    const ed = el.querySelector("#ed");

    const tree = await ctx.api("/api/files/tree?path=dossier").catch(() => []);
    const persons = [];
    for (const node of tree.filter(n => !n.children && n.name.endsWith(".md"))) {
        const { content } = await ctx.api(`/api/files/read?path=${encodeURIComponent(node.path)}`);
        const { meta } = parseFrontmatter(content);
        const name = [meta["first-name"], meta["last-name"]].filter(Boolean).join(" ") || node.name;
        persons.push({ name, path: node.path });
    }
    persons.sort((a, b) => a.name.localeCompare(b.name));

    const letterEls = {};
    let lastLetter = null;
    for (const p of persons) {
        const letter = p.name[0]?.toUpperCase() ?? "?";
        if (letter !== lastLetter) {
            if (lastLetter !== null) {
                const sep = document.createElement("hr");
                sep.style.cssText = "border:none; border-top:1px solid var(--border); margin:4px 8px";
                list.appendChild(sep);
            }
            lastLetter = letter;
        }
        const row = document.createElement("div");
        row.className = "list-row";
        row.textContent = p.name;
        row.addEventListener("click", () => {
            list.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
            ctx.embedEditor(ed, p.path);
        });
        list.appendChild(row);
        letterEls[letter] ??= row;
    }

    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        const a = document.createElement("a");
        a.textContent = letter;
        a.style.cursor = "pointer";
        a.addEventListener("click", () => letterEls[letter]?.scrollIntoView({ block: "start" }));
        az.appendChild(a);
    }

    list.firstElementChild?.click();
}
