// PDF plugin: thumbnail grid; click → pdf left, markdown twin right; + uploads & OCRs.

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div class="pane-top" style="justify-content:flex-end">
            <span id="title" class="muted" style="margin-right:auto">PDFs</span>
            <button id="back" hidden>← back</button>
            <button id="up" class="primary" title="Upload PDF">+</button>
            <input type="file" id="file" accept="application/pdf" hidden>
        </div>
        <div id="body" style="flex:1; min-height:0; overflow:auto"></div>`;
    const body = el.querySelector("#body");
    const back = el.querySelector("#back");

    async function showGrid() {
        back.hidden = true;
        const items = await ctx.api("/api/pdf/list");
        body.style.cssText = "flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px; padding:12px";
        body.replaceChildren();
        for (const it of items) {
            const tile = document.createElement("div");
            tile.style.cssText = "cursor:pointer; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--bg-raised); text-align:center";
            tile.innerHTML = it.pdf
                ? `<img src="/api/pdf/thumb?stamp=${it.stamp}" style="width:100%; aspect-ratio:3/4; object-fit:cover" loading="lazy">`
                : `<div style="aspect-ratio:3/4; display:flex; align-items:center; justify-content:center; font-size:3em">📄</div>`;
            tile.innerHTML += `<div class="muted" style="padding:4px; font-size:0.8em">${it.stamp}</div>`;
            tile.addEventListener("click", () => showPdf(it));
            body.appendChild(tile);
        }
        if (!items.length) body.innerHTML = `<div class="muted" style="padding:16px">No PDFs yet — hit +</div>`;
    }

    async function showPdf(it) {
        back.hidden = false;
        body.style.cssText = "flex:1; min-height:0; display:flex";
        body.innerHTML = `
            <div style="flex:1; min-width:0">${it.pdf
                ? `<embed src="${ctx.raw(it.pdf)}" type="application/pdf" style="width:100%; height:100%">`
                : `<div class="muted" style="padding:16px">PDF file missing (${it.stamp}.pdf)</div>`}</div>
            <div id="md" style="flex:1; min-width:0; border-left:1px solid var(--border); display:flex; flex-direction:column"></div>`;
        if (it.md) await ctx.embedEditor(body.querySelector("#md"), it.md);
    }

    back.addEventListener("click", showGrid);
    const file = el.querySelector("#file");
    el.querySelector("#up").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        const form = new FormData();
        form.append("file", file.files[0]);
        file.value = "";
        body.innerHTML = `<div class="muted" style="padding:16px">Uploading & extracting text…</div>`;
        const res = await fetch("/api/pdf/upload", { method: "POST", body: form });
        if (!res.ok) { body.textContent = await res.text(); return; }
        await showGrid();
    });

    // process pdfs copied into the folder manually (per README)
    ctx.api("/api/pdf/process", { method: "POST" }).then(({ processed }) => {
        if (processed.length) showGrid();
    }).catch(() => {});

    await showGrid();
}
