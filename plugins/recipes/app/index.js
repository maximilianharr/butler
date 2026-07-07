// Recipes plugin: ingredients on top, step tiles split by '---', click to enlarge.
import { parseFrontmatter } from "/md.js";

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div style="display:flex; flex:1; min-height:0">
            <div id="list" style="width:200px; border-right:1px solid var(--border); overflow:auto; padding:4px"></div>
            <div id="recipe" style="flex:1; overflow:auto; padding:16px"></div>
        </div>
        <dialog id="pop"></dialog>`;
    const list = el.querySelector("#list");
    const recipe = el.querySelector("#recipe");
    const pop = el.querySelector("#pop");

    const tree = await ctx.api("/api/files/tree?path=recipes").catch(() => []);
    for (const node of tree.filter(n => !n.children && n.name.endsWith(".md"))) {
        const row = document.createElement("div");
        row.className = "list-row";
        row.textContent = node.title || node.name;
        row.addEventListener("click", () => {
            list.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");
            show(node.path);
        });
        list.appendChild(row);
    }

    async function show(path) {
        const { content } = await ctx.api(`/api/files/read?path=${encodeURIComponent(path)}`);
        const { meta, body } = parseFrontmatter(content);
        const parts = body.split(/^---$/m).map(s => s.trim()).filter(Boolean);
        const title = parts[0]?.startsWith("#") ? parts.shift() : "";
        recipe.replaceChildren();
        recipe.insertAdjacentHTML("beforeend", `
            <h2 style="margin-top:0">${esc(title.replace(/^#+\s*/, ""))}</h2>
            <div style="background:var(--bg-raised); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:16px">
                <b>Ingredients</b>${meta.persons ? ` <span class="muted">(${esc(String(meta.persons))} persons)</span>` : ""}<br>
                ${esc(meta.ingredients ?? "")}
            </div>
            <div id="steps" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:12px"></div>`);
        const steps = recipe.querySelector("#steps");
        parts.forEach((step, i) => {
            const tile = document.createElement("div");
            tile.style.cssText = "border:1px solid var(--border); border-radius:8px; background:var(--bg-raised); padding:12px; cursor:pointer";
            tile.innerHTML = `<div class="muted" style="font-size:0.8em">Step ${i + 1}</div>${esc(step)}`;
            tile.addEventListener("click", () => {
                pop.innerHTML = `<div class="muted">Step ${i + 1}</div><div style="font-size:1.4em; white-space:pre-wrap">${esc(step)}</div>`;
                pop.showModal();
            });
            steps.appendChild(tile);
        });
    }

    list.firstElementChild?.click();
    pop.addEventListener("click", () => pop.close());
}

const esc = (s) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
