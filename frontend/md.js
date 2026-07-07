// Tiny frontmatter parser for the simple YAML subset Butler files use:
// scalars, quoted strings, inline comments, block lists. Not full YAML.
// ponytail: upgrade to a real YAML lib if frontmatter ever gets nested maps.

function scalar(v) {
    v = v.replace(/\s+#.*$/, "").trim();
    if (v === "" || v === "None" || v === "null") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    return v.replace(/^['"]|['"]$/g, "");
}

export function parseFrontmatter(text) {
    if (!text.startsWith("---")) return { meta: {}, body: text };
    const end = text.indexOf("\n---", 3);
    if (end === -1) return { meta: {}, body: text };
    const head = text.slice(4, end);
    const body = text.slice(end + 4).replace(/^\n+/, "");
    const meta = {};
    let listKey = null;
    for (const line of head.split("\n")) {
        const li = /^\s+-\s*(.*)$/.exec(line);
        if (li && listKey) { meta[listKey].push(scalar(li[1])); continue; }
        const kv = /^([\w-]+):\s*(.*)$/.exec(line);
        if (!kv) continue;
        if (kv[2].trim() === "") { meta[kv[1]] = []; listKey = kv[1]; }
        else { meta[kv[1]] = scalar(kv[2]); listKey = null; }
    }
    return { meta, body };
}

export function dumpFrontmatter(meta, body) {
    const lines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
        if (Array.isArray(v)) {
            lines.push(`${k}:`);
            for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
        } else if (v === null || v === undefined) {
            lines.push(`${k}: None`);
        } else {
            lines.push(`${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`);
        }
    }
    lines.push("---", "", body ?? "");
    return lines.join("\n");
}

export const nowStamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
export const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
