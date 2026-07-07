// Butler frontend shell: icon rail, plugin loading, themes, shortkeys.

export async function api(path, opts = {}) {
    if (opts.json !== undefined) {
        opts = { ...opts, body: JSON.stringify(opts.json), headers: { "Content-Type": "application/json" } };
        delete opts.json;
    }
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
}

const rail = document.getElementById("rail");
const filespane = document.getElementById("filespane");
const main = document.getElementById("main");

let settings = await api("/api/settings");
const plugins = await api("/api/plugins");

// ---- appearance ----
function applyAppearance() {
    const a = settings.appearance ?? {};
    document.documentElement.dataset.theme = a.darkmode === "true" ? "dark" : "bright";
    document.documentElement.style.setProperty("--font-size", a["font-size"] ?? "14px");
    document.documentElement.style.zoom = a["zoom-level"] ?? "100%";
}
applyAppearance();

// ---- editor loading (vendor bundle, textarea fallback before `run.sh build`) ----
let editorModule;
async function createEditor(parent, opts = {}) {
    if (editorModule === undefined) {
        editorModule = await import("/vendor/editor.js").catch(() => null);
    }
    if (editorModule) return editorModule.createEditor(parent, { ...opts, ctx });
    const ta = document.createElement("textarea");
    ta.className = "fallback";
    ta.value = opts.content ?? "";
    ta.addEventListener("input", () => opts.onChange?.(ta.value));
    parent.appendChild(ta);
    return { getValue: () => ta.value, setValue: v => { ta.value = v; }, destroy: () => ta.remove(), focus: () => ta.focus() };
}

// ---- open a file in the main pane ----
let saveTimer;
async function openFile(path, { line } = {}) {
    clearTimeout(saveTimer);
    const { content } = await api(`/api/files/read?path=${encodeURIComponent(path)}`);
    main.replaceChildren();
    const bar = document.createElement("div");
    bar.className = "editor-path";
    bar.textContent = path;
    const host = document.createElement("div");
    host.className = "editor-host";
    main.append(bar, host);
    const save = async (text) => {
        await api("/api/files/write", { method: "PUT", json: { path, content: text } });
        bar.textContent = path;
    };
    const ed = await createEditor(host, {
        content,
        path,
        onChange: (text) => {
            bar.textContent = path + " *";
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => save(text), 800);
        },
    });
    if (line) ed.scrollToLine?.(line);
    ed.focus?.();
}

// embed an autosaving editor for a workspace file into `host`
async function embedEditor(host, path) {
    const { content } = await api(`/api/files/read?path=${encodeURIComponent(path)}`);
    host.replaceChildren();
    host.classList.add("editor-host");
    let timer;
    return createEditor(host, {
        content,
        path,
        onChange: (text) => {
            clearTimeout(timer);
            timer = setTimeout(() => api("/api/files/write", { method: "PUT", json: { path, content: text } }), 800);
        },
    });
}

// ---- plugin activation ----
const ctx = { api, openFile, createEditor, embedEditor, settings, plugins, raw: p => `/api/files/raw?path=${encodeURIComponent(p)}`, reloadSettings: async () => { settings = await api("/api/settings"); ctx.settings = settings; applyAppearance(); } };
const railBtns = {};
let active = null;

async function mountInto(el, name) {
    el.replaceChildren();
    const mod = await import(`/plugins/${name}/app/index.js`);
    await mod.default(el, ctx);
}

async function activate(name) {
    if (name === "files") { toggleFiles(); return; }
    active = name;
    localStorage.setItem("butler-last-plugin", name);
    for (const [n, b] of Object.entries(railBtns)) b.classList.toggle("active", n === name);
    await mountInto(main, name);
}

async function toggleFiles() {
    filespane.hidden = !filespane.hidden;
    railBtns.files?.classList.toggle("active", !filespane.hidden);
    if (!filespane.hidden) await mountInto(filespane, "files");
}

for (const p of plugins) {
    const btn = document.createElement("button");
    btn.className = "rail-btn";
    btn.title = p.name;
    btn.innerHTML = `<img src="${p.icon}" alt="${p.name}">`;
    btn.addEventListener("click", () => activate(p.name));
    if (p.name === "settings") rail.appendChild(Object.assign(document.createElement("div"), { className: "spacer" }));
    rail.appendChild(btn);
    railBtns[p.name] = btn;
}

// ---- shortkeys ----
function bindShortkeys() {
    const keys = settings.shortkeys ?? {};
    const actions = {
        "focus-mode": () => document.body.classList.toggle("focus"),
        "search-all": () => activate("search"),
        "folder-view": () => toggleFiles(),
        "zoom-in": () => zoom(+10),
        "zoom-out": () => zoom(-10),
    };
    function zoom(delta) {
        const cur = parseInt(document.documentElement.style.zoom) || 100;
        document.documentElement.style.zoom = `${cur + delta}%`;
    }
    const bindings = [];
    for (const [action, combo] of Object.entries(keys)) {
        if (action === "plugins") {
            for (const entry of combo) for (const [name, c] of Object.entries(entry)) bindings.push([c, () => activate(name)]);
        } else if (typeof combo === "string" && actions[action]) {
            bindings.push([combo, actions[action]]);
        }
    }
    document.addEventListener("keydown", (e) => {
        for (const [combo, fn] of bindings) {
            const parts = combo.toLowerCase().split(/\s+/);
            const key = parts[parts.length - 1];
            if (e.key.toLowerCase() === key &&
                e.ctrlKey === parts.includes("ctrl") &&
                e.shiftKey === parts.includes("shift") &&
                e.altKey === parts.includes("alt")) {
                e.preventDefault();
                fn();
                return;
            }
        }
    });
}
bindShortkeys();

// ---- restore last-open plugin (frontend/README.md) ----
const last = localStorage.getItem("butler-last-plugin");
const names = plugins.map(p => p.name);
activate(names.includes(last) ? last : names.find(n => n !== "files") ?? names[0]);
