// Files plugin: collapsible workspace tree with git-status colors and md titles.

export async function renderTree(el, ctx, { base = "", onOpen } = {}) {
    const nodes = await ctx.api(`/api/files/tree?path=${encodeURIComponent(base)}`);
    const root = document.createElement("div");
    root.className = "tree";
    root.appendChild(buildList(nodes, onOpen ?? ctx.openFile));
    el.replaceChildren(root);
}

function buildList(nodes, onOpen) {
    const frag = document.createDocumentFragment();
    for (const node of nodes) {
        if (node.children) {
            const det = document.createElement("details");
            const sum = document.createElement("summary");
            sum.textContent = node.name;
            det.appendChild(sum);
            const inner = document.createElement("div");
            inner.className = "indent";
            inner.appendChild(buildList(node.children, onOpen));
            det.appendChild(inner);
            frag.appendChild(det);
        } else {
            const div = document.createElement("div");
            div.className = "file" + (node.status ? ` ${node.status}` : "");
            div.textContent = node.title || node.name;
            div.title = node.path;
            div.addEventListener("click", () => onOpen(node.path));
            frag.appendChild(div);
        }
    }
    return frag;
}

export default async function mount(el, ctx) {
    await renderTree(el, ctx);
}
