// 测试驱动：像 Claude Code 一样经 stdio 调 MCP。用法：node harness.js <steps.json> <outDir>
// steps.json: [{ "tool": "ae_status", "args": {...}, "expect": "ok" | "error", "label": "..." }]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const [stepsFile, outDir] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const srv = cp.spawn(process.execPath, [path.join(__dirname, "..", "plugins", "ja-ae", "server", "index.js")], { stdio: ["pipe", "pipe", "pipe"] });
srv.stderr.on("data", d => process.stderr.write(String(d)));
let buf = "", nextId = 1;
const pending = new Map();
srv.stdout.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const rpc = (method, params) => new Promise(res => { const id = nextId++; pending.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });

(async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "harness", version: "0" } });
  console.log("INIT", JSON.stringify(init.result.serverInfo));
  const tl = await rpc("tools/list", {});
  console.log("TOOLS", tl.result.tools.length, tl.result.tools.map(t => t.name).join(","));
  let pass = 0, fail = 0, img = 0;
  for (const s of steps) {
    const t0 = Date.now();
    const r = await rpc("tools/call", { name: s.tool, arguments: s.args || {} });
    const res = r.result || {}, isErr = !!res.isError || !!r.error;
    let ok = (s.expect || "ok") === (isErr ? "error" : "ok");
    if (ok && s.check) {   // 断言实际返回值，例如 "r.value === 90"
      let parsed = null; try { parsed = JSON.parse((res.content || []).find(c => c.type === "text").text); } catch (e) {}
      try { ok = !!new Function("r", "return " + s.check)(parsed); } catch (e) { ok = false; }
      if (!ok) console.log("   CHECK FAILED: " + s.check);
    }
    ok ? pass++ : fail++;
    let text = "";
    for (const c of res.content || []) {
      if (c.type === "text") text += c.text;
      if (c.type === "image") { const f = path.join(outDir, (s.label || s.tool).replace(/[^\w-]+/g, "_") + "_" + (img++) + ".png"); fs.writeFileSync(f, Buffer.from(c.data, "base64")); text += " [image -> " + f + "]"; }
    }
    if (r.error) text = JSON.stringify(r.error);
    const max = s.full ? 6000 : 700;
    console.log(`${ok ? "PASS" : "FAIL"} ${s.label || s.tool} (${Date.now() - t0}ms)${isErr ? " [error]" : ""}\n   ${text.length > max ? text.slice(0, max) + " ...(" + text.length + " chars)" : text}`);
  }
  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  srv.kill(); process.exit(fail ? 1 : 0);
})();
