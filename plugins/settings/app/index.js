// Settings plugin: category list (one per settings json) + key/value editor.

export default async function mount(el, ctx) {
    const settings = await ctx.api("/api/settings");
    el.innerHTML = `
        <div style="display:flex; flex:1; min-height:0">
            <div id="cats" style="width:200px; border-right:1px solid var(--border); padding:8px; overflow:auto"></div>
            <div id="form" style="flex:1; padding:16px; overflow:auto; max-width:40em"></div>
        </div>`;
    const cats = el.querySelector("#cats");
    const form = el.querySelector("#form");

    for (const name of Object.keys(settings)) {
        const row = document.createElement("div");
        row.className = "list-row";
        row.textContent = name;
        row.addEventListener("click", () => select(name, row));
        cats.appendChild(row);
    }

    function select(name, row) {
        cats.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
        row.classList.add("selected");
        form.replaceChildren();
        const data = settings[name];
        const inputs = {};
        for (const [key, value] of Object.entries(data)) {
            const label = document.createElement("label");
            label.className = "field";
            const caption = document.createElement("span");
            caption.textContent = key;
            label.appendChild(caption);
            const simple = typeof value === "string" || typeof value === "boolean" || typeof value === "number";
            const input = document.createElement(simple ? "input" : "textarea");
            input.value = simple ? String(value) : JSON.stringify(value, null, 2);
            if (!simple) input.rows = Math.min(12, input.value.split("\n").length);
            inputs[key] = [input, simple, typeof value];
            label.appendChild(input);
            form.appendChild(label);
        }
        const save = document.createElement("button");
        save.className = "primary";
        save.textContent = "Save";
        save.addEventListener("click", async () => {
            const out = {};
            try {
                for (const [key, [input, simple, type]] of Object.entries(inputs)) {
                    out[key] = simple
                        ? (type === "boolean" ? input.value === "true" : type === "number" ? Number(input.value) : input.value)
                        : JSON.parse(input.value);
                }
            } catch (e) { alert(`Invalid JSON: ${e.message}`); return; }
            await ctx.api(`/api/settings/${name}`, { method: "PUT", json: out });
            settings[name] = out;
            await ctx.reloadSettings();
            save.textContent = "Saved ✓";
            setTimeout(() => { save.textContent = "Save"; }, 1500);
        });
        form.appendChild(save);
    }
    cats.firstChild?.click();
}
