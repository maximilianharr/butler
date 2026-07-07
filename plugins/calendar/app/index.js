// Calendar plugin: day/week/month/year views over frontmatter markdown entries.

const GROUP_COLORS = {
    red: "#d95252", green: "#3fa34d", blue: "#4a90d9",
    yellow: "#c9a227", purple: "#9b59b6", orange: "#e68122",
};
const DAY_MS = 86400e3;
const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

// all date math in UTC (plugins/README.md: times are always UTC)
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const startOfWeek = (d) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7);
const sameDay = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");

export default async function mount(el, ctx) {
    let view = "month";
    let cursor = new Date();
    cursor = utc(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
    let groupLabels = await ctx.api("/api/calendar/groups");
    let hiddenGroups = new Set();

    el.innerHTML = `
        <div class="pane-top">
            <button id="prev">&lt;</button><button id="next">&gt;</button>
            <button id="period"><span id="periodlabel"></span> ▾</button>
            <select id="view">
                <option value="day">day</option><option value="week">week</option>
                <option value="month" selected>month</option><option value="year">year</option>
            </select>
            <button id="groups">groups ▾</button>
        </div>
        <div id="cal" style="flex:1; overflow:auto; min-height:0"></div>
        <dialog id="minical"></dialog>
        <dialog id="grouppop"></dialog>
        <dialog id="entrypop" style="width:480px"></dialog>
        <dialog id="daypop"></dialog>`;

    const cal = el.querySelector("#cal");
    const periodLabel = el.querySelector("#periodlabel");

    // ---------- data ----------
    async function fetchRange(lo, hi) {
        const list = await ctx.api(`/api/calendar/entries?start=${iso(lo)}&end=${iso(hi)}`);
        return list.filter(e => !hiddenGroups.has(e.group));
    }
    const color = (g) => GROUP_COLORS[g] ?? "var(--accent)";

    // ---------- navigation ----------
    function shift(dir) {
        const [y, m, d] = [cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()];
        cursor = view === "day" ? utc(y, m, d + dir)
            : view === "week" ? utc(y, m, d + 7 * dir)
            : view === "month" ? utc(y, m + dir, 1)
            : utc(y + dir, m, 1);
        render();
    }
    el.querySelector("#prev").addEventListener("click", () => shift(-1));
    el.querySelector("#next").addEventListener("click", () => shift(1));
    el.querySelector("#view").addEventListener("change", (e) => { view = e.target.value; render(); });

    // ---------- mini calendar dropdown (day picker -> month -> year drill-up) ----------
    const minical = el.querySelector("#minical");
    el.querySelector("#period").addEventListener("click", () => { renderMini(cursor.getUTCFullYear(), cursor.getUTCMonth(), "month"); minical.showModal(); });
    function renderMini(y, m, mode) {
        minical.replaceChildren();
        const head = document.createElement("div");
        head.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px";
        const title = document.createElement("button");
        const back = document.createElement("button"); back.textContent = "<";
        const fwd = document.createElement("button"); fwd.textContent = ">";
        head.append(title, Object.assign(document.createElement("span"), { style: "flex:1" }), back, fwd);
        minical.appendChild(head);
        const grid = document.createElement("div");
        minical.appendChild(grid);
        if (mode === "month") {
            title.textContent = `${MONTHS[m]} ${y}`;
            title.addEventListener("click", () => renderMini(y, m, "year"));
            back.addEventListener("click", () => renderMini(m ? y : y - 1, (m + 11) % 12, "month"));
            fwd.addEventListener("click", () => renderMini(m === 11 ? y + 1 : y, (m + 1) % 12, "month"));
            grid.style.cssText = "display:grid; grid-template-columns:repeat(7, 28px); gap:2px; text-align:center";
            for (const w of WD) grid.insertAdjacentHTML("beforeend", `<div class="muted">${w}</div>`);
            const first = utc(y, m, 1);
            for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) grid.appendChild(document.createElement("div"));
            for (let d = 1; d <= utc(y, m + 1, 0).getUTCDate(); d++) {
                const b = document.createElement("button");
                b.textContent = d;
                b.addEventListener("click", () => { cursor = utc(y, m, d); minical.close(); render(); });
                grid.appendChild(b);
            }
        } else { // 3x3 last 9 years
            title.textContent = `${y - 8} – ${y}`;
            back.addEventListener("click", () => renderMini(y - 9, m, "year"));
            fwd.addEventListener("click", () => renderMini(y + 9, m, "year"));
            grid.style.cssText = "display:grid; grid-template-columns:repeat(3, 64px); gap:4px";
            for (let yy = y - 8; yy <= y; yy++) {
                const b = document.createElement("button");
                b.textContent = yy;
                b.addEventListener("click", () => renderMini(yy, m, "month"));
                grid.appendChild(b);
            }
        }
    }

    // ---------- group filter dropdown ----------
    const grouppop = el.querySelector("#grouppop");
    el.querySelector("#groups").addEventListener("click", () => { renderGroups(); grouppop.showModal(); });
    function renderGroups() {
        grouppop.replaceChildren();
        for (const g of Object.keys(GROUP_COLORS)) {
            const row = document.createElement("label");
            row.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px; cursor:pointer";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !hiddenGroups.has(g);
            cb.addEventListener("change", () => { cb.checked ? hiddenGroups.delete(g) : hiddenGroups.add(g); render(); });
            const dot = document.createElement("span");
            dot.style.cssText = `width:14px; height:14px; border-radius:3px; background:${color(g)}`;
            const name = document.createElement("span");
            name.textContent = groupLabels[g] ? `${g} — ${groupLabels[g]}` : g;
            // double-click a group to describe its color
            row.addEventListener("dblclick", async () => {
                const label = prompt(`Description for "${g}":`, groupLabels[g] ?? "");
                if (label === null) return;
                groupLabels[g] = label;
                await ctx.api("/api/calendar/groups", { method: "PUT", json: groupLabels });
                renderGroups();
            });
            row.append(cb, dot, name);
            grouppop.appendChild(row);
        }
    }

    // ---------- entry create/edit popup ----------
    const entrypop = el.querySelector("#entrypop");
    function openEntry(defaults = {}, existing = null) {
        const e = existing ?? { title: "", type: "event", group: "blue", location: "", repeat: "", participants: [], body: "", ...defaults };
        const dt = (s) => (s ?? "").slice(0, 16);
        entrypop.innerHTML = `
            <h3 style="margin-top:0">${existing ? "Edit" : "New"} calendar entry</h3>
            <input id="etitle" placeholder="Title" style="width:100%; font-size:1.1em">
            <div id="etype" style="display:flex; gap:4px; margin:8px 0">
                ${["event", "task"].map(t => `<button data-type="${t}" class="${e.type === t ? "primary" : ""}">${t}</button>`).join("")}
            </div>
            <label class="field"><span>start (UTC)</span><input id="estart" type="datetime-local"></label>
            <label class="field"><span>end (UTC)</span><input id="eend" type="datetime-local"></label>
            <label class="field"><span>group</span><select id="egroup">${Object.keys(GROUP_COLORS).map(g => `<option${g === e.group ? " selected" : ""}>${g}</option>`).join("")}</select></label>
            <label class="field"><span>location</span><input id="eloc"></label>
            <label class="field"><span>repeat</span><select id="erepeat">${["", "daily", "weekly", "monthly", "yearly"].map(r => `<option value="${r}"${r === (e.repeat ?? "") ? " selected" : ""}>${r || "none"}</option>`).join("")}</select></label>
            <label class="field"><span>participants (comma separated)</span><input id="epart"></label>
            <label class="field"><span>notes</span><textarea id="ebody" rows="3" style="width:100%"></textarea></label>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px">
                <button id="ediscard">Discard</button><button id="esave" class="primary">Save</button>
            </div>`;
        const $ = (s) => entrypop.querySelector(s);
        $("#etitle").value = e.title;
        $("#estart").value = dt(e.start);
        $("#eend").value = dt(e.end);
        $("#eloc").value = e.location ?? "";
        $("#epart").value = (e.participants ?? []).join(", ");
        $("#ebody").value = e.body ?? "";
        let type = e.type;
        $("#etype").addEventListener("click", (ev) => {
            const t = ev.target.dataset.type;
            if (!t) return;
            type = t;
            $("#etype").querySelectorAll("button").forEach(b => b.classList.toggle("primary", b.dataset.type === t));
            if (t === "task") { // tasks are date-only: 00:00:00 – 23:59:59
                $("#estart").value = ($("#estart").value || iso(cursor)).slice(0, 10) + "T00:00";
                $("#eend").value = $("#estart").value.slice(0, 10) + "T23:59";
            }
        });
        $("#ediscard").addEventListener("click", () => entrypop.close());
        $("#esave").addEventListener("click", async () => {
            if (!$("#etitle").value.trim() || !$("#estart").value) { alert("Title and start are required"); return; }
            const end = type === "task" ? $("#estart").value.slice(0, 10) + "T23:59:59" : ($("#eend").value || $("#estart").value);
            await ctx.api("/api/calendar/entries", { method: "POST", json: {
                title: $("#etitle").value.trim(),
                type,
                start: $("#estart").value,  // naive timestamps are UTC by convention
                end,
                group: $("#egroup").value,
                location: $("#eloc").value || null,
                repeat: $("#erepeat").value || null,
                participants: $("#epart").value.split(",").map(s => s.trim()).filter(Boolean),
                body: $("#ebody").value,
                path: existing?.path ?? null,
            }});
            entrypop.close();
            render();
        });
        entrypop.showModal();
    }

    // ---------- entry row (shared by month/day-popup) ----------
    function entryRow(e) {
        const row = document.createElement("div");
        row.style.cssText = `display:flex; align-items:center; gap:4px; font-size:0.8em; border-left:3px solid ${color(e.group)}; background:color-mix(in srgb, ${color(e.group)} 18%, transparent); border-radius:3px; padding:1px 4px; margin:1px 0; cursor:pointer; overflow:hidden; white-space:nowrap`;
        const time = e.type === "task" ? "" : e.start.slice(11, 16) + " ";
        const label = document.createElement("span");
        label.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis";
        label.textContent = time + e.title;
        if (e.done === true) label.style.textDecoration = "line-through";
        row.appendChild(label);
        if (e.type === "task") {
            const box = document.createElement("span");
            box.textContent = e.done ? "✓" : "";
            box.style.cssText = "width:14px; height:14px; border:1px solid currentColor; border-radius:2px; display:inline-flex; align-items:center; justify-content:center; flex:none";
            box.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                await ctx.api("/api/calendar/done", { method: "PUT", json: { path: e.path, done: !e.done } });
                render();
            });
            row.appendChild(box);
        }
        row.addEventListener("click", (ev) => { ev.stopPropagation(); openEntry({}, e); });
        return row;
    }

    // ---------- views ----------
    async function render() {
        const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
        if (view === "month") {
            periodLabel.textContent = `${MONTHS[m]} ${y}`;
            const first = startOfWeek(utc(y, m, 1));
            const weeks = Math.ceil((((utc(y, m + 1, 0) - first) / DAY_MS) + 1) / 7);
            const entries = await fetchRange(first, new Date(+first + weeks * 7 * DAY_MS));
            cal.innerHTML = `<div style="display:grid; grid-template-columns:repeat(7,1fr); border-left:1px solid var(--border)">
                ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div class="muted" style="padding:4px; text-align:center">${d}</div>`).join("")}</div>
                <div id="mgrid" style="display:grid; grid-template-columns:repeat(7,1fr); grid-auto-rows:minmax(90px,auto); border-left:1px solid var(--border); border-top:1px solid var(--border)"></div>`;
            const grid = cal.querySelector("#mgrid");
            const today = new Date();
            for (let i = 0; i < weeks * 7; i++) {
                const day = new Date(+first + i * DAY_MS);
                const cell = document.createElement("div");
                cell.style.cssText = "border-right:1px solid var(--border); border-bottom:1px solid var(--border); padding:2px; min-width:0" +
                    (day.getUTCMonth() !== m ? "; opacity:0.4" : "");
                const num = document.createElement("div");
                num.textContent = day.getUTCDate();
                num.style.cssText = "font-size:0.8em; padding:2px" + (sameDay(day, today) ? "; color:var(--accent-strong); font-weight:bold" : "");
                cell.appendChild(num);
                for (const e of entries.filter(e => sameDay(new Date(e.start), day))) cell.appendChild(entryRow(e));
                cell.addEventListener("click", () => openEntry({ start: day.toISOString().slice(0, 10) + "T09:00", end: day.toISOString().slice(0, 10) + "T10:00" }));
                grid.appendChild(cell);
            }
        } else if (view === "week" || view === "day") {
            const days = view === "week" ? 7 : 1;
            const first = view === "week" ? startOfWeek(cursor) : cursor;
            periodLabel.textContent = view === "week"
                ? `${first.toISOString().slice(0, 10)} – ${new Date(+first + 6 * DAY_MS).toISOString().slice(0, 10)}`
                : cursor.toISOString().slice(0, 10);
            const entries = await fetchRange(first, new Date(+first + days * DAY_MS));
            cal.innerHTML = `<div style="display:grid; grid-template-columns:48px repeat(${days},1fr); position:relative">
                <div></div>${[...Array(days)].map((_, i) => {
                    const d = new Date(+first + i * DAY_MS);
                    return `<div class="muted" style="text-align:center; padding:4px; border-left:1px solid var(--border)">${d.toISOString().slice(0, 10)}</div>`;
                }).join("")}
                ${[...Array(24)].map((_, h) => `<div class="muted" style="font-size:0.7em; text-align:right; padding-right:4px; height:40px">${String(h).padStart(2, "0")}:00</div>`
                    + [...Array(days)].map((_, i) => `<div data-day="${i}" data-hour="${h}" style="border-left:1px solid var(--border); border-top:1px solid var(--border); height:40px"></div>`).join("")).join("")}
            </div>`;
            const grid = cal.firstElementChild;
            grid.addEventListener("click", (ev) => {
                const c = ev.target.closest("[data-hour]");
                if (!c) return;
                const day = new Date(+first + c.dataset.day * DAY_MS).toISOString().slice(0, 10);
                const h = String(c.dataset.hour).padStart(2, "0");
                openEntry({ start: `${day}T${h}:00`, end: `${day}T${String(+c.dataset.hour + 1).padStart(2, "0")}:00` });
            });
            for (const e of entries) {
                const s = new Date(e.start), en = new Date(e.end);
                const dayIdx = Math.floor((utc(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - first) / DAY_MS);
                if (dayIdx < 0 || dayIdx >= days) continue;
                const block = document.createElement("div");
                const top = 28 + (s.getUTCHours() + s.getUTCMinutes() / 60) * 40;
                const height = Math.max(20, (Math.min((en - s) / 36e5, 24) * 40) - 2);
                block.style.cssText = `position:absolute; top:${top}px; height:${height}px;
                    left:calc(48px + ${dayIdx} * (100% - 48px) / ${days} + 2px); width:calc((100% - 48px) / ${days} - 6px);
                    background:color-mix(in srgb, ${color(e.group)} 30%, var(--bg-raised)); border-left:3px solid ${color(e.group)};
                    border-radius:4px; padding:2px 4px; font-size:0.8em; overflow:hidden; cursor:pointer`;
                block.innerHTML = `<b>${e.title}</b>` + (view === "day"
                    ? `<div class="muted">${e.start.slice(11, 16)}–${e.end.slice(11, 16)}${e.location ? " · " + e.location : ""}</div>
                       ${e.participants?.length ? `<div class="muted">${e.participants.join(", ")}</div>` : ""}<div>${e.body ?? ""}</div>`
                    : `<div class="muted">${e.start.slice(11, 16)}</div>`);
                block.addEventListener("click", (ev) => { ev.stopPropagation(); openEntry({}, e); });
                grid.appendChild(block);
            }
        } else { // year
            periodLabel.textContent = y;
            const entries = await fetchRange(utc(y, 0, 1), utc(y + 1, 0, 1));
            const byDay = {};
            for (const e of entries) (byDay[e.start.slice(0, 10)] ??= []).push(e);
            cal.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px,1fr)); gap:16px; padding:16px"></div>`;
            const wrap = cal.firstElementChild;
            const today = new Date();
            for (let mm = 0; mm < 12; mm++) {
                const box = document.createElement("div");
                box.innerHTML = `<b>${MONTHS[mm]}</b><div style="display:grid; grid-template-columns:repeat(7,1fr); gap:1px; text-align:center; font-size:0.75em; margin-top:4px">
                    ${WD.map(w => `<div class="muted">${w}</div>`).join("")}</div>`;
                const g = box.lastElementChild;
                const first = utc(y, mm, 1);
                for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) g.appendChild(document.createElement("div"));
                for (let d = 1; d <= utc(y, mm + 1, 0).getUTCDate(); d++) {
                    const key = utc(y, mm, d).toISOString().slice(0, 10);
                    const dayEntries = byDay[key] ?? [];
                    const cell = document.createElement("div");
                    cell.textContent = d;
                    cell.style.cssText = "padding:2px; border-radius:3px; cursor:pointer";
                    if (dayEntries.length) { // split background across entry groups
                        const gs = [...new Set(dayEntries.map(e => e.group))];
                        const stops = gs.map((gr, i) => `${color(gr)} ${i / gs.length * 100}% ${(i + 1) / gs.length * 100}%`).join(", ");
                        cell.style.background = `linear-gradient(90deg, ${stops})`;
                        cell.style.color = "#fff";
                    }
                    if (sameDay(utc(y, mm, d), today)) cell.style.outline = "2px solid var(--accent-strong)";
                    cell.addEventListener("click", () => showDay(key, dayEntries));
                    g.appendChild(cell);
                }
                wrap.appendChild(box);
            }
        }
    }

    // year view: click a day -> popup with that day's entries
    const daypop = el.querySelector("#daypop");
    function showDay(key, entries) {
        daypop.innerHTML = `<h3 style="margin-top:0">${key}</h3>`;
        for (const e of entries) daypop.appendChild(entryRow(e));
        if (!entries.length) daypop.insertAdjacentHTML("beforeend", `<div class="muted">No entries</div>`);
        const close = document.createElement("button");
        close.textContent = "Close";
        close.style.marginTop = "8px";
        close.addEventListener("click", () => daypop.close());
        daypop.appendChild(close);
        daypop.showModal();
    }

    render();
}
