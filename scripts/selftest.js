#!/usr/bin/env node
// ja-ae 自检：经 MCP 协议逐个调用 14 个工具，做一段约 3 秒的简单动画，出预览总览、渲染成片、另存工程、验证撤销。
// 用法：node scripts/selftest.js [--out <目录>] [--json]
// 安全：AE 当前工程有未保存改动时直接停止（不会丢弃任何工作）；工程已保存时会被替换为新的自检工程。
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "plugins", "ja-ae", "server", "index.js");
const png = require(path.join(ROOT, "plugins", "ja-ae", "server", "png.js"));
const argv = process.argv.slice(2);
const optv = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const JSON_ONLY = argv.includes("--json");
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const OUT = path.resolve(optv("--out") || path.join(os.homedir(), "Documents", "ja-ae-selftest", stamp));
fs.mkdirSync(OUT, { recursive: true });
const say = s => { if (!JSON_ONLY) console.log(s); };

// ---------------------------------------------------------------- MCP 客户端（stdio）
const srv = cp.spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let buf = "", nextId = 1; const pending = new Map(), serverLog = [];
srv.stderr.on("data", d => serverLog.push(String(d)));
srv.stdout.on("data", d => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } }
});
const rpc = (method, params) => new Promise(res => { const id = nextId++; pending.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
async function call(tool, args) {
  const t0 = Date.now(), r = await rpc("tools/call", { name: tool, arguments: args || {} });
  const res = r.result || {}, out = { tool, ms: Date.now() - t0, isError: !!res.isError || !!r.error, data: null, images: [] };
  for (const c of res.content || []) {
    if (c.type === "text") { try { out.data = JSON.parse(c.text); } catch (e) { out.data = c.text; } }
    if (c.type === "image") out.images.push(Buffer.from(c.data, "base64"));
  }
  if (r.error) out.data = r.error;
  return out;
}

// ---------------------------------------------------------------- 记录
const TOOLS = ["ae_status", "ae_discover", "ae_project", "ae_create", "ae_import", "ae_set", "ae_apply", "ae_inspect", "ae_find", "ae_check", "ae_run_script", "ae_undo", "ae_render_frames", "ae_render"];
const tools = {}; TOOLS.forEach(t => tools[t] = { ok: null, notes: [] });
const steps = [];
function record(tool, label, ok, note) {
  steps.push({ tool, label, ok, note });
  const t = tools[tool]; t.ok = t.ok === false ? false : ok; if (note) t.notes.push(label + ": " + note);
  say((ok ? "  ✓ " : "  ✗ ") + tool.padEnd(17) + label + (note && !ok ? "  → " + String(note).slice(0, 220) : ""));
}
const errText = r => (r.data && r.data.error) ? r.data.error : JSON.stringify(r.data).slice(0, 300);
async function expectOk(tool, label, args, assert) {
  const r = await call(tool, args);
  let ok = !r.isError, note = r.isError ? errText(r) : "";
  if (ok && assert) { try { const a = assert(r.data, r); if (a !== true) { ok = false; note = typeof a === "string" ? a : "assertion failed: " + JSON.stringify(r.data).slice(0, 300); } } catch (e) { ok = false; note = "assertion error: " + e.message; } }
  record(tool, label, ok, note);
  return r;
}

(async () => {
  const report = { started: new Date().toISOString(), out: OUT };
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ja-ae-selftest", version: "1" } });
  const list = await rpc("tools/list", {});
  report.server = init.result && init.result.serverInfo;
  report.toolCount = list.result.tools.length;
  say(`ja-ae 自检  server ${report.server && report.server.version}  工具 ${report.toolCount} 个  输出 ${OUT}\n`);

  // 1 环境
  const st = await expectOk("ae_status", "AE 状态", {}, d => d.aeRunning === true || "AE 没有打开");
  if (st.isError || !st.data.aeRunning) return finish(report, "AE 没有打开（或无法通信）。请先打开 After Effects 再运行自检。" + (st.isError ? " 详情：" + errText(st) : ""));
  report.ae = { version: st.data.ae.version, language: st.data.ae.language, capabilities: st.data.ae.capabilities };
  record("ae_status", "第三方插件测试名单已加载", !!(st.data.fxTests && st.data.fxTests.listed > 0), st.data.fxTests ? st.data.fxTests.listed + " 个效果，测试环境 " + st.data.fxTests.testedOn : "没有 fxTests");
  if (st.data.ae.project.dirty) return finish(report, "AE 当前工程有未保存的改动（" + (st.data.ae.project.file || "未命名工程") + "）。为了不丢你的工作，自检已停止：请先在 AE 里保存（Ctrl+S）或关闭该工程，再运行一次。");

  // 2 发现
  await expectOk("ae_discover", "效果列表（按 matchName 搜）", { what: "effects", query: "ADBE Gaussian Blur 2", limit: 3 }, d => d.total >= 1);
  await expectOk("ae_discover", "效果列表带测试结论说明", { what: "effects", limit: 5 }, d => !!(d.fxTests && d.fxTests.testedOn) || "返回里没有 fxTests");
  await expectOk("ae_discover", "插件使用说明", { what: "plugin_guide" }, d => (d.guide || "").length > 500 || "说明内容为空");
  await expectOk("ae_discover", "效果分类", { what: "categories" }, d => d.categories.length > 3);
  const fontsR = await expectOk("ae_discover", "字体（AE 2024+ 走接口，2022 扫字体文件）", { what: "fonts", query: "arial", limit: 20 }, d => d.returned >= 1);
  const presetsR = await expectOk("ae_discover", "动画预设", { what: "presets", limit: 400 }, d => d.total >= 0);
  await expectOk("ae_discover", "已安装脚本", { what: "scripts", limit: 5 }, d => d.total >= 0);

  // 3 新工程与动画
  await expectOk("ae_project", "新建自检工程", { action: "new" }, d => d.created === true);
  const COMP = "ja-ae selftest";
  await expectOk("ae_create", "合成 1280×720 / 25fps / 3s", { type: "comp", name: COMP, width: 1280, height: 720, fps: 25, duration: 3, bg_color: "#14161C" }, d => d.comp.width === 1280);
  await expectOk("ae_discover", "渲染模板（本地化名称）", { what: "render_templates" }, d => d.outputModules.length >= 1);
  // 生成一张测试背景图（不依赖任何外部素材）
  const W = 1280, H = 720, rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; rgb[o] = 20 + (x * 40) / W; rgb[o + 1] = 26 + (y * 30) / H; rgb[o + 2] = 46 + ((x + y) * 50) / (W + H); if ((x + y) % 80 < 2) { rgb[o] += 30; rgb[o + 1] += 30; rgb[o + 2] += 40; } }
  const bgPng = path.join(OUT, "selftest_bg.png"); fs.writeFileSync(bgPng, png.encode({ w: W, h: H, rgb }));
  await expectOk("ae_import", "导入生成的背景图并放进合成", { paths: [bgPng], folder: "selftest assets", add_to_comp: COMP }, d => d.imported.length === 1 && !!d.imported[0].layer);
  await expectOk("ae_create", "形状图层（色块）", { type: "shape", comp: COMP, name: "Bar", shape: { kind: "rect", size: [520, 16], roundness: 8, fill: "#E8463A" }, position: [640, 430] }, d => d.layer.type === "shape");
  const fontList = (fontsR.data && fontsR.data.fonts) || [];
  const font = (fontList.find(f => /Arial-BoldMT/i.test(f.postScriptName)) || fontList[0] || { postScriptName: "ArialMT" }).postScriptName;
  await expectOk("ae_create", "文字图层（字体 " + font + "）", { type: "text", comp: COMP, name: "Title", text: "ja-ae self-test", style: { font, fontSize: 84, fillColor: "#FFFFFF" }, position: [640, 380] }, d => d.layer.type === "text");
  await expectOk("ae_create", "空对象", { type: "null", comp: COMP, name: "Ctrl" }, d => d.layer.type === "null");
  await expectOk("ae_set", "色块缩放关键帧（缓动）", { comp: COMP, layer: "Bar", changes: [{ property: "Scale", keyframes: [{ time: 0.3, value: [0, 100], ease_out: 15 }, { time: 1.1, value: [100, 100], ease_in: 88 }] }] }, d => d.changed[0].numKeys === 2);
  await expectOk("ae_set", "标题位移关键帧 + 旋转表达式", { comp: COMP, layer: "Title", changes: [{ property: "Position", keyframes: [{ time: 0.2, value: [640, 440], ease_out: 15 }, { time: 1.0, value: [640, 380], ease_in: 88 }], straight_motion: true }, { property: "Rotation", expression: "Math.sin(time*3)*2" }] }, d => d.changed.length === 2 && !d.changed[1].expressionError);
  await expectOk("ae_apply", "效果：高斯模糊（模糊度带关键帧）", { comp: COMP, layer: "Title", effect: "ADBE Gaussian Blur 2", params: { "ADBE Gaussian Blur 2-0001": { keyframes: [{ time: 0.2, value: 24 }, { time: 1.0, value: 0, ease_in: 80 }] } } }, d => d.applied.length === 1);
  // 已知问题拦截：只挑「加不上」这一类来验证（就算没拦住也只是报错，不会弄崩 AE）；本机没有这类效果或 AE 版本与测试不同就跳过
  const known = await call("ae_discover", { what: "effects", test: "noadd", limit: 1 });
  if (!known.isError && known.data.returned >= 1 && known.data.fxTests.sameAEVersion) {
    const gate = await call("ae_apply", { comp: COMP, layer: "Ctrl", effect: known.data.effects[0].matchName });
    record("ae_apply", "防护：拒绝已知有问题的效果", gate.isError && /FX_KNOWN_ISSUE/.test(errText(gate)), gate.isError ? errText(gate).slice(0, 120) : "没有拦住 " + known.data.effects[0].matchName);
  } else record("ae_apply", "防护：拒绝已知有问题的效果", true, "本机没有可用来验证的效果（或 AE 版本与测试不同），跳过");
  // 预设：在已安装的预设里试几个，能套上一个就算通过（预设名随 AE 语言变化）
  const presets = ((presetsR.data && presetsR.data.files) || []).filter(f => /\.ffx$/i.test(f));
  if (presets.length) {
    let applied = null, lastErr = "";
    for (const p of presets.slice(0, 8)) { const r = await call("ae_apply", { comp: COMP, layer: "Ctrl", preset: p }); if (!r.isError) { applied = p; break; } lastErr = errText(r); }
    record("ae_apply", "动画预设", !!applied, applied ? path.basename(applied) : "8 个候选都没套上：" + lastErr);
  } else record("ae_apply", "动画预设", true, "本机没有找到 .ffx 预设，跳过");

  // 4 读取与检查
  await expectOk("ae_inspect", "读取图层属性树", { target: "layer", comp: COMP, layer: "Title" }, d => JSON.stringify(d).includes("ADBE Gaussian Blur 2") && JSON.stringify(d).includes("Math.sin"));
  await expectOk("ae_inspect", "读取合成", { target: "comp", comp: COMP }, d => d.numLayers >= 4);
  await expectOk("ae_inspect", "读取工程", { target: "project" }, d => d.numItems >= 2);
  await expectOk("ae_find", "全工程搜索文字", { query: "self-test", scope: "text" }, d => d.count >= 1);
  await expectOk("ae_check", "工程体检", { comp: COMP }, d => d.summary.expressionErrors === 0 && d.summary.missingEffects === 0 && d.summary.missingFootage === 0);
  await expectOk("ae_run_script", "任意脚本（读图层名）", { code: "var c = JA.comp(args.comp); var n = []; for (var i = 1; i <= c.numLayers; i++) n.push(c.layer(i).name); return n;", args: { comp: COMP } }, d => d.value.length >= 4);
  const blocked = await call("ae_run_script", { code: "system.callSystem('cmd /c echo hi');" });
  record("ae_run_script", "防护：拦截系统命令", blocked.isError && /BLOCKED/.test(errText(blocked)), blocked.isError ? "" : "未被拦截！");

  // 5 撤销
  await expectOk("ae_set", "改不透明度为 20（准备撤销）", { comp: COMP, layer: "Bar", changes: [{ property: "Opacity", value: 20 }] }, d => d.changed[0].value === 20);
  await expectOk("ae_undo", "撤销 1 步", { steps: 1 });
  const op = await call("ae_run_script", { code: "return JA.prop(JA.layer(JA.comp(args.comp),'Bar'),'Opacity').value;", args: { comp: COMP } });
  record("ae_undo", "撤销后不透明度回到 100", !op.isError && op.data.value === 100, op.isError ? errText(op) : "读到 " + op.data.value);

  // 6 预览与输出
  const fr = await expectOk("ae_render_frames", "预览帧总览（6 帧）", { comp: COMP, count: 6 }, (d, r) => r.images.length === 1 || "没有返回图片");
  if (fr.images[0]) { fs.writeFileSync(path.join(OUT, "contact_sheet.png"), fr.images[0]); report.contactSheet = path.join(OUT, "contact_sheet.png"); }
  const aep = path.join(OUT, "ja-ae-selftest.aep");
  await expectOk("ae_project", "另存工程", { action: "save_as", path: aep }, d => !!d.file);
  const again = await call("ae_project", { action: "save_as", path: aep });
  record("ae_project", "防护：拒绝覆盖已有文件", again.isError && /FILE_EXISTS/.test(errText(again)), again.isError ? "" : "居然覆盖了！");
  const rr = await expectOk("ae_render", "渲染成片（自动选模板）", { comp: COMP, output: path.join(OUT, "ja-ae-selftest.mp4"), timeout_seconds: 900 }, d => d.exists === true || "输出文件不存在：" + JSON.stringify(d));
  if (!rr.isError) report.render = rr.data;
  report.aep = aep;
  finish(report);
})().catch(e => finish({ out: OUT }, "自检脚本异常：" + e.stack));

function finish(report, abortReason) {
  report.finished = new Date().toISOString();
  report.abort = abortReason || null;
  report.tools = tools; report.steps = steps;
  const tested = TOOLS.filter(t => tools[t].ok !== null), passed = TOOLS.filter(t => tools[t].ok === true);
  report.summary = { tools: TOOLS.length, tested: tested.length, passed: passed.length, failed: TOOLS.filter(t => tools[t].ok === false) };
  const md = [
    "# ja-ae 自检报告", "",
    "- 时间：" + report.finished, "- AE：" + (report.ae ? report.ae.version + "（" + report.ae.language + "）" : "未知"),
    "- 结果：" + (abortReason ? "**已中止** — " + abortReason : `**${passed.length}/${TOOLS.length} 个工具通过**` + (report.summary.failed.length ? "；未通过：" + report.summary.failed.join(", ") : "")),
    report.render ? "- 成片：" + report.render.output + "（模板：" + (report.render.used && report.render.used.outputModule) + "）" : "",
    report.aep && !abortReason ? "- 工程：" + report.aep : "", report.contactSheet ? "- 预览总览：" + report.contactSheet : "", "",
    "| 工具 | 结果 | 说明 |", "|---|---|---|",
    ...TOOLS.map(t => `| ${t} | ${tools[t].ok === null ? "未测" : tools[t].ok ? "通过" : "**失败**"} | ${tools[t].notes.join("；").replace(/\|/g, "/").slice(0, 300)} |`)
  ].filter(l => l !== "").join("\n");
  fs.writeFileSync(path.join(report.out || OUT, "selftest_report.md"), md);
  fs.writeFileSync(path.join(report.out || OUT, "selftest_report.json"), JSON.stringify(report, null, 2));
  if (JSON_ONLY) console.log(JSON.stringify({ ok: !abortReason && report.summary.failed.length === 0, summary: report.summary, abort: report.abort, out: report.out || OUT }, null, 2));
  else console.log("\n" + md.split("\n").slice(0, 8).join("\n") + "\n\n报告：" + path.join(report.out || OUT, "selftest_report.md"));
  try { srv.kill(); } catch (e) {}
  process.exit(abortReason ? 2 : (report.summary.failed.length ? 1 : 0));
}
