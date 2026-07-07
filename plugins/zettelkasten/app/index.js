// Zettelkasten plugin: scoped file tree + the shared editor.
import { renderTree } from "/plugins/files/app/index.js";

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div style="display:flex; flex:1; min-height:0">
            <div id="tree" style="width:260px; border-right:1px solid var(--border); overflow:auto; padding:8px 4px"></div>
            <div id="ed" style="flex:1; display:flex; flex-direction:column; min-width:0"></div>
        </div>`;
    const ed = el.querySelector("#ed");
    await renderTree(el.querySelector("#tree"), ctx, {
        base: "zettelkasten",
        onOpen: (path) => ctx.embedEditor(ed, path),
    });
}
