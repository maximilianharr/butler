// Sync plugin: commit workspace changes and push to the git remote.

export default async function mount(el, ctx) {
    el.innerHTML = `
        <div class="pane-top">
            <button id="go" class="primary">Sync now</button>
            <span class="muted">git add · commit · push</span>
        </div>
        <pre id="out" style="padding:16px; overflow:auto; white-space:pre-wrap"></pre>`;
    const out = el.querySelector("#out");
    const show = async () => {
        const { status } = await ctx.api("/api/sync/status");
        out.textContent = status;
    };
    el.querySelector("#go").addEventListener("click", async () => {
        out.textContent = "Syncing…";
        const res = await ctx.api("/api/sync", { method: "POST" });
        const { status } = await ctx.api("/api/sync/status");
        out.textContent = res.output + "\n\n" + status;
    });
    await show();
}
