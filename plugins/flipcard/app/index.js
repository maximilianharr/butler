// Flipcard plugin: random question grid, click → answer, click → done; new set when all done.

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div class="pane-top">
            <button id="grid" title="Grid size">▦ <span id="gridlabel">1×1</span></button>
            <button id="prev">&lt;</button>
            <button id="next">&gt;</button>
            <select id="topic"><option value="">all topics</option></select>
            <button id="add" class="primary" title="Add flipcard">+</button>
        </div>
        <div id="board" style="flex:1; display:grid; gap:8px; padding:8px; min-height:0"></div>
        <dialog id="gridpick"><div id="cells" style="display:grid; grid-template-columns:repeat(4,24px); gap:4px"></div></dialog>
        <dialog id="addpop" style="width:600px">
            <h3 style="margin-top:0">New flipcard</h3>
            <label class="field"><span>topic</span>
                <span style="display:flex; gap:4px">
                    <select id="ntopic" style="flex:1"></select>
                    <button id="plustopic" title="Add topic">+</button>
                </span>
            </label>
            <label class="field"><span>question</span></label><div id="qed" style="border:1px solid var(--border); border-radius:4px; min-height:80px"></div>
            <label class="field"><span>answer</span></label><div id="aed" style="border:1px solid var(--border); border-radius:4px; min-height:80px"></div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px">
                <button id="discard">Discard</button><button id="save" class="primary">Save</button>
            </div>
        </dialog>`;

    const board = el.querySelector("#board");
    const topicSel = el.querySelector("#topic");
    let cards = [], rows = 1, cols = 1, sets = [], setIdx = -1;

    async function loadCards() {
        cards = await ctx.api("/api/flipcard/cards");
        const topics = await ctx.api("/api/flipcard/topics");
        topicSel.replaceChildren(new Option("all topics", ""));
        for (const t of topics) topicSel.appendChild(new Option(t, t));
    }

    const filtered = () => cards.filter(c => !topicSel.value || c.topic === topicSel.value);

    function newSet() {
        const pool = [...filtered()];
        if (!pool.length) { board.innerHTML = `<div class="muted" style="padding:16px">No flipcards — hit +</div>`; return; }
        const set = [];
        for (let i = 0; i < rows * cols && pool.length; i++) {
            set.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        sets = sets.slice(0, setIdx + 1);
        sets.push(set);
        setIdx = sets.length - 1;
        renderSet();
    }

    function renderSet() {
        const set = sets[setIdx];
        board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        board.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        board.replaceChildren();
        let remaining = set.length;
        for (const card of set) {
            const tile = document.createElement("div");
            tile.style.cssText = "border:1px solid var(--border); border-radius:8px; background:var(--bg-raised); display:flex; align-items:center; justify-content:center; text-align:center; padding:16px; cursor:pointer; font-size:1.3em; overflow:auto; white-space:pre-wrap";
            tile.textContent = card.question;
            let state = 0; // 0=question 1=answer 2=done
            tile.addEventListener("click", () => {
                state++;
                if (state === 1) {
                    tile.textContent = card.answer;
                    tile.style.background = "var(--bg-hover)";
                } else if (state === 2) {
                    tile.style.opacity = "0.35";
                    if (--remaining === 0) newSet();
                }
            });
            board.appendChild(tile);
        }
    }

    // grid size picker
    const gridpick = el.querySelector("#gridpick");
    const cells = el.querySelector("#cells");
    for (let r = 1; r <= 4; r++) for (let c = 1; c <= 4; c++) {
        const b = document.createElement("div");
        b.style.cssText = "width:24px; height:24px; border:1px solid var(--border); border-radius:3px; cursor:pointer";
        b.addEventListener("mouseenter", () => {
            [...cells.children].forEach((x, i) => x.style.background =
                (Math.floor(i / 4) < r && i % 4 < c) ? "var(--accent)" : "");
        });
        b.addEventListener("click", () => {
            rows = r; cols = c;
            el.querySelector("#gridlabel").textContent = `${r}×${c}`;
            gridpick.close();
            newSet();
        });
        cells.appendChild(b);
    }
    el.querySelector("#grid").addEventListener("click", () => gridpick.showModal());

    el.querySelector("#prev").addEventListener("click", () => { if (setIdx > 0) { setIdx--; renderSet(); } });
    el.querySelector("#next").addEventListener("click", () => {
        if (setIdx < sets.length - 1) { setIdx++; renderSet(); } else newSet();
    });
    topicSel.addEventListener("change", newSet);

    // add-card popup
    const addpop = el.querySelector("#addpop");
    const ntopic = el.querySelector("#ntopic");
    let qed, aed;
    el.querySelector("#add").addEventListener("click", async () => {
        const topics = await ctx.api("/api/flipcard/topics");
        ntopic.replaceChildren(...topics.map(t => new Option(t, t)));
        el.querySelector("#qed").replaceChildren();
        el.querySelector("#aed").replaceChildren();
        qed = await ctx.createEditor(el.querySelector("#qed"), { content: "" });
        aed = await ctx.createEditor(el.querySelector("#aed"), { content: "" });
        addpop.showModal();
    });
    el.querySelector("#plustopic").addEventListener("click", () => {
        const t = prompt("New topic name:");
        if (t) { ntopic.appendChild(new Option(t, t)); ntopic.value = t; }
    });
    // double-click a topic in the filter to rename it across all flipcards
    topicSel.addEventListener("dblclick", async () => {
        const old = topicSel.value;
        if (!old) return;
        const t = prompt(`Rename topic "${old}" for ALL flipcards to:`, old);
        if (!t || t === old) return;
        if (!confirm(`Really rename "${old}" → "${t}" in every flipcard?`)) return;
        await ctx.api("/api/flipcard/topics/rename", { method: "POST", json: { old, new: t } });
        await loadCards();
        newSet();
    });
    el.querySelector("#discard").addEventListener("click", () => addpop.close());
    el.querySelector("#save").addEventListener("click", async () => {
        await ctx.api("/api/flipcard/cards", { method: "POST", json: { topic: ntopic.value ?? "", question: qed.getValue(), answer: aed.getValue() } });
        addpop.close();
        await loadCards();
        newSet();
    });

    await loadCards();
    newSet();
}
