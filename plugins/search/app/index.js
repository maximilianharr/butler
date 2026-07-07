// Search plugin: search-as-you-type over all markdown files.

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div class="pane-top"><input type="search" id="q" placeholder="Search markdown files…" style="flex:1"></div>
        <div id="hits" style="overflow:auto; padding:8px"></div>`;
    const q = el.querySelector("#q");
    const hits = el.querySelector("#hits");
    let timer;
    q.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(run, 150);
    });
    q.focus();

    async function run() {
        const term = q.value.trim();
        if (!term) { hits.replaceChildren(); return; }
        const results = await ctx.api(`/api/search?q=${encodeURIComponent(term)}`);
        hits.replaceChildren();
        for (const r of results) {
            const row = document.createElement("div");
            row.className = "list-row";
            const path = document.createElement("div");
            path.className = "muted";
            path.textContent = `${r.path}:${r.line}`;
            row.appendChild(path);
            for (const [text, line] of [[r.before, r.line - 1], [r.text, r.line], [r.after, r.line + 1]]) {
                if (!text) continue;
                const div = document.createElement("div");
                highlight(div, text, term);
                div.addEventListener("click", (e) => { e.stopPropagation(); ctx.openFile(r.path, { line }); });
                row.appendChild(div);
            }
            row.addEventListener("click", () => ctx.openFile(r.path, { line: r.line }));
            hits.appendChild(row);
        }
        if (!results.length) hits.innerHTML = `<div class="muted" style="padding:8px">No hits</div>`;
    }
}

function highlight(el, text, term) {
    const lower = text.toLowerCase(), t = term.toLowerCase();
    let i = 0, at;
    while ((at = lower.indexOf(t, i)) !== -1) {
        el.append(text.slice(i, at));
        const span = document.createElement("span");
        span.className = "hl";
        span.textContent = text.slice(at, at + term.length);
        el.appendChild(span);
        i = at + term.length;
    }
    el.append(text.slice(i));
}
