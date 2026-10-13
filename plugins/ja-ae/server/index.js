#!/usr/bin/env node
// ja-ae —— After Effects 通用操作层 MCP（stdio，零依赖）
// 只提供能力，不含任何设计模板或固定流程；踩过的坑写在代码里。兼容 AE 2022+（按功能探测）。仅 Windows。
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");
const png = require("./png");
const fonts = require("./fonts");
const fx = require("./fxtests");

const VERSION = "0.3.0";
const ROOT = path.resolve(__dirname, "..");
const RUNTIME = fs.readFileSync(path.join(ROOT, "runtime", "ae_runtime.jsx"), "utf8");
const log = (...a) => process.stderr.write("[ja-ae] " + a.join(" ") + "\n");

// ------------------------------------------------------------------ 工作目录
// AfterFX.exe -r 的脚本路径不能加引号（加了会静默不执行），所以必须是无空格的纯 ASCII 路径
function pickWorkDir() {
  const cands = [process.env.JA_AE_WORKDIR, path.join(process.env.PUBLIC || "C:\\Users\\Public", "ja-ae-mcp"), path.join(os.tmpdir(), "ja-ae-mcp"), "C:\\ja-ae-mcp"].filter(Boolean);
  for (const d of cands) {
    if (!/^[\x21-\x7e]+$/.test(d)) continue;
    try { fs.mkdirSync(path.join(d, "jobs"), { recursive: true }); fs.mkdirSync(path.join(d, "results"), { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) {}
  }
  throw new Error("no writable ASCII work dir without spaces; set JA_AE_WORKDIR");
}
const WORK = pickWorkDir();
const fwd = p => p.replace(/\\/g, "/");

// ------------------------------------------------------------------ 找 AE（与安装脚本共用 ae_locate.js）
const { findAE, exeToUse, scriptingPref } = require("./ae_locate");

// ------------------------------------------------------------------ 作业桥：JSX → AfterFX -r → 结果文件
const asciiEscape = s => s.replace(/[^\x00-\x7f]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
let chain = Promise.resolve();
function runOp(op, args, opts = {}) {
  const p = chain.then(() => runOpNow(op, args, opts));
  chain = p.catch(() => {});
  return p;
}
async function runOpNow(op, args, opts) {
  const info = findAE();
  if (!info.running.length && !opts.allowLaunch) {
    const e = new Error("AE_NOT_RUNNING: After Effects is not running. Ask the user to open it, or call ae_status with launch:true.");
    e.hint = { installed: info.installed }; throw e;
  }
  const exe = exeToUse(info);
  if (!exe) throw new Error("AE_NOT_FOUND: no AfterFX.exe found; set env JA_AE_EXE to its full path");
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const jobFile = path.join(WORK, "jobs", "job_" + id + ".jsx"), resFile = path.join(WORK, "results", "res_" + id + ".json");
  const job = { id, op, args: args || {}, result: fwd(resFile), undo: opts.undo || null };
  fs.writeFileSync(jobFile, asciiEscape("var __JOB = " + JSON.stringify(job) + ";\n" + RUNTIME + "\n__JA_RUN(__JOB);\n"), "ascii");
  const child = cp.spawn(exe, ["-r", jobFile], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", e => log("spawn error", e.message));
  child.unref();
  const timeout = (opts.timeoutSec || 60) * 1000, t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fs.existsSync(resFile)) {
      let txt = fs.readFileSync(resFile, "utf8").replace(/^\uFEFF/, "");
      let res; try { res = JSON.parse(txt); } catch (e) { await sleep(150); txt = fs.readFileSync(resFile, "utf8").replace(/^\uFEFF/, ""); res = JSON.parse(txt); }
      try { fs.unlinkSync(jobFile); fs.unlinkSync(resFile); } catch (e) {}
      if (!res.ok) { const e = new Error(res.error + (res.line !== undefined ? " (line " + res.line + ")" : "")); e.logs = res.logs; e.aeError = true; throw e; }
      return res;
    }
    await sleep(op === "render" ? 1000 : 150);
  }
  const alive = findAE(true).running.length > 0, pref = scriptingPref();
  const e = new Error("AE_TIMEOUT: no reply from After Effects in " + Math.round(timeout / 1000) + "s.");
  e.hint = {
    aeRunning: alive,
    likelyCauses: alive ? ["a modal dialog is open in AE (close it)", "AE is busy (rendering / long script)", "Preferences > Scripting & Expressions > 'Allow Scripts to Write Files and Access Network' is off"] : ["AE closed or crashed"],
    scriptingPref: pref, jobFile
  };
  throw e;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ 辅助
function presetAndScriptDirs(exe) {
  const sup = exe ? path.dirname(exe) : null, out = { presets: [], scripts: [] };
  if (sup) { out.presets.push(path.join(sup, "Presets")); out.scripts.push(path.join(sup, "Scripts")); }
  const docs = path.join(os.homedir(), "Documents", "Adobe");
  try { for (const d of fs.readdirSync(docs)) if (/^After Effects/i.test(d)) out.presets.push(path.join(docs, d, "User Presets")); } catch (e) {}
  return out;
}
function walk(dir, exts, acc, depth = 0, limit = 5000) {
  if (depth > 6 || acc.length >= limit) return acc;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const en of ents) {
    const p = path.join(dir, en.name);
    if (en.isDirectory()) walk(p, exts, acc, depth + 1, limit);
    else if (exts.test(en.name)) acc.push(p);
    if (acc.length >= limit) break;
  }
  return acc;
}
let fontCache = null;
function systemFonts() { if (!fontCache) fontCache = fonts.scan(path.join(WORK, "fonts_cache.json")); return fontCache; }

async function waitFiles(files, timeoutSec) {
  const t0 = Date.now(), last = {};
  while (Date.now() - t0 < timeoutSec * 1000) {
    let ready = 0;
    for (const f of files) {
      let s = -1; try { s = fs.statSync(f).size; } catch (e) {}
      if (s > 0 && last[f] === s) ready++;
      last[f] = s;
    }
    if (ready === files.length) return true;
    await sleep(250);
  }
  return false;
}
const hexToRgb = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255); };

// ------------------------------------------------------------------ 工具定义
const REF = "Comp refs: name string or {id}. Layer refs: index number, name string, or {id}. Property paths use '/' with matchNames (language-independent, returned by ae_inspect) or English names, e.g. 'ADBE Transform Group/ADBE Position', 'Position', 'Effects/Gaussian Blur/Blurriness', 'Contents/#1/Contents/#2/Color'.";
const UNDO = "Each call is one AE undo step (Edit > Undo or ae_undo). Never saves the project by itself.";

const TOOLS = [
  {
    name: "ae_status",
    description: "Check After Effects: installed versions, which one is running, AE version/language, open project (file, unsaved changes, comps), capabilities of this AE version (font API, frame export, effect count). Call this first in a session. launch:true starts AE if it is not running (ask the user before launching).",
    inputSchema: { type: "object", properties: { launch: { type: "boolean" }, wait_seconds: { type: "number", description: "max wait for AE to become ready after launch (default 180)" } } },
    handler: async a => {
      let info = findAE(true);
      const base = { server: "ja-ae " + VERSION, workDir: WORK, installed: info.installed, running: info.running, fxTests: fx.info() };
      if (!info.running.length) {
        if (!a.launch) return { ...base, aeRunning: false, note: "AE is not running. Ask the user to open it (or call again with launch:true)." };
        const exe = exeToUse(info); if (!exe) throw new Error("AE_NOT_FOUND");
        cp.spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
        const t0 = Date.now(), lim = (a.wait_seconds || 180) * 1000;
        while (Date.now() - t0 < lim) { await sleep(3000); info = findAE(true); if (info.running.length) { try { await runOp("ping", {}, { timeoutSec: 10 }); break; } catch (e) {} } }
      }
      const st = await runOp("status", {}, { timeoutSec: 30 });
      return { ...base, aeRunning: true, ae: st.result };
    }
  },
  {
    name: "ae_project",
    description: "Project file operations. action: info (list all items) | new | open | close | save | save_as | reduce (keep only given comps). new/open/close refuse when the open project has unsaved changes unless force_discard_unsaved:true (only after the user explicitly agrees). save_as refuses to overwrite unless overwrite:true. Only save when the user asked for it.",
    inputSchema: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["info", "new", "open", "close", "save", "save_as", "reduce"] }, path: { type: "string" }, force_discard_unsaved: { type: "boolean" }, overwrite: { type: "boolean" }, keep_comps: { type: "array", items: {} } } },
    handler: async a => (await runOp("project", a, { timeoutSec: 120 })).result
  },
  {
    name: "ae_import",
    description: "Import files (footage, images, audio, image sequences, PSD/AI as comp) into the project; optionally put them in a project folder and/or add them as layers to a comp. " + UNDO,
    inputSchema: { type: "object", required: ["paths"], properties: { paths: { type: "array", items: { type: "string" } }, import_as: { type: "string", enum: ["footage", "comp", "comp_cropped_layers"] }, sequence: { type: "boolean" }, folder: { type: "string" }, add_to_comp: { description: "comp ref" }, start_time: { type: "number" } } },
    handler: async a => (await runOp("import", a, { undo: "AI: import", timeoutSec: 300 })).result
  },
  {
    name: "ae_inspect",
    description: "Read structure and values. target: project | comp (settings + every layer summary) | layer (property tree with matchName paths, values, keyframes incl. ease, expressions; effect params listed in full — use this to discover third-party plugin parameters) | markers. By default only modified/keyframed/expression properties are shown; only_modified:false shows everything. property narrows to one subtree. " + REF,
    inputSchema: { type: "object", properties: { target: { type: "string", enum: ["project", "comp", "layer", "markers"] }, comp: {}, layer: {}, property: { type: "string" }, only_modified: { type: "boolean" }, keyframes: { type: "boolean" }, depth: { type: "number" }, time: { type: "number", description: "read values at this time (s)" } } },
    handler: async a => (await runOp("inspect", a, { timeoutSec: 90 })).result
  },
  {
    name: "ae_find",
    description: "Search the whole project: item names, footage paths, layer names, text-layer contents, effects (name/matchName), expressions. scope: all | items | footage | layers | text | effects | expressions.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, scope: { type: "string", enum: ["all", "items", "footage", "layers", "text", "effects", "expressions"] }, limit: { type: "number" } } },
    handler: async a => (await runOp("find", a, { timeoutSec: 120 })).result
  },
  {
    name: "ae_check",
    description: "Project health check: missing footage, effects whose plugin is not installed on this machine, third-party effects in use that had problems in our plugin test (effectIssues: watermark, crash, ...) or were never tested (untestedEffects), expression errors, fonts used by text layers (and whether installed), unused footage, empty comps, queued renders. Optional comp limits layer checks to one comp.",
    inputSchema: { type: "object", properties: { comp: {} } },
    handler: async a => {
      const r = (await runOp("check", a, { timeoutSec: 180 })).result;
      if (r.fontsUsed.length && r.fontsUsed.some(f => f.installed === undefined)) {
        const sys = new Set(systemFonts().map(f => f.postScriptName));
        for (const f of r.fontsUsed) if (f.installed === undefined) { f.installed = sys.has(f.font); f.checkedBy = "system font files (Adobe Fonts not visible)"; }
      }
      return fx.annotateCheck(r);
    }
  },
  {
    name: "ae_discover",
    description: "Discover what THIS machine's AE can use, live: effects (incl. third-party plugins; name, matchName, category; filter by query/category; third-party effects carry `test` = result of our plugin test: ok | preset | input | manual | wm (watermark) | wm_maybe | noadd | dialog | crash_add | crash_render | timeout | untested — see fxTests.legend; test:'issues' lists only the installed effects with known problems) | plugin_guide (how to use third-party plugins and their known traps — read it once before using them) | categories | fonts (PostScript names for text layers; AE 2022 falls back to scanning system font files) | render_templates (render settings + output module names, localized) | presets (.ffx animation presets) | scripts (installed .jsx/.jsxbin). Effect display names, categories and preset file names follow the AE UI language (e.g. Chinese AE: '淡入' not 'fade') — search in that language or by matchName.",
    inputSchema: { type: "object", required: ["what"], properties: { what: { type: "string", enum: ["effects", "plugin_guide", "categories", "fonts", "render_templates", "presets", "scripts"] }, query: { type: "string" }, category: { type: "string" }, test: { type: "string", description: "effects only: keep effects with this test status, or 'issues' for every known problem" }, limit: { type: "number" } } },
    handler: async a => {
      const what = a.what, q = (a.query || "").toLowerCase(), lim = a.limit || 300;
      if (what === "plugin_guide") return { what, fxTests: fx.info(), guide: fx.guide() };
      if (what === "presets" || what === "scripts") {
        const dirs = presetAndScriptDirs(exeToUse(findAE()))[what];
        const files = [];
        for (const d of dirs) walk(d, what === "presets" ? /\.ffx$/i : /\.(jsx|jsxbin)$/i, files);
        const hit = files.filter(f => !q || f.toLowerCase().includes(q));
        return { what, roots: dirs, total: hit.length, returned: Math.min(lim, hit.length), files: hit.slice(0, lim) };
      }
      if (what === "fonts") {
        const r = (await runOp("discover", a, { timeoutSec: 60 })).result;
        if (r.apiAvailable) return r;
        const all = systemFonts().filter(f => !q || (f.family + " " + f.style + " " + f.postScriptName).toLowerCase().includes(q));
        return { what: "fonts", apiAvailable: false, source: "system font files (this AE has no font API; Adobe Fonts activations are not listed)", total: all.length, returned: Math.min(lim, all.length), fonts: all.slice(0, lim).map(f => ({ family: f.family, style: f.style, postScriptName: f.postScriptName })) };
      }
      // 按测试结论过滤时要先拿全量，再在这边过滤和截断
      const r = (await runOp("discover", what === "effects" && a.test ? { ...a, limit: 100000 } : a, { timeoutSec: 60 })).result;
      return what === "effects" ? fx.annotateDiscover(r, a.test, lim) : r;
    }
  },
  {
    name: "ae_create",
    description: "Create a comp or a layer. type: comp (name,width,height,fps,duration,bg_color,folder) | text (text, style:{font(PostScript),fontSize,fillColor,strokeColor,strokeWidth,tracking,leading,justification}) | solid | adjustment | null | shape (shape:{kind: rect|ellipse|star|polygon|path, size, roundness, points, outer_radius, inner_radius, path:{vertices,inTangents,outTangents,closed}, fill, stroke, stroke_width}) | camera (zoom, one_node) | light (light_type, color, intensity) | footage/precomp (item ref). Common: comp, name, position, threeD, start_time, in_point, out_point, parent, blending_mode. Colors accept '#RRGGBB'. " + UNDO,
    inputSchema: { type: "object", required: ["type"], properties: { type: { type: "string", enum: ["comp", "text", "solid", "adjustment", "null", "shape", "camera", "light", "footage", "precomp"] }, comp: {}, name: { type: "string" }, text: { type: "string" }, style: { type: "object" }, shape: { type: "object" }, item: {}, width: { type: "number" }, height: { type: "number" }, fps: { type: "number" }, duration: { type: "number" }, bg_color: {}, color: {}, folder: { type: "string" }, position: { type: "array" }, threeD: { type: "boolean" }, start_time: { type: "number" }, in_point: { type: "number" }, out_point: { type: "number" }, parent: {}, blending_mode: { type: "string" }, zoom: { type: "number" }, one_node: { type: "boolean" }, light_type: { type: "string" }, intensity: { type: "number" } } },
    handler: async a => (await runOp("create", a, { undo: "AI: create " + a.type, timeoutSec: 60 })).result
  },
  {
    name: "ae_set",
    description: "Change layers precisely. attrs: {name, enabled, solo, shy, locked, threeD, motion_blur, blending_mode, parent (ref|null), start_time, in_point, out_point, stretch, label, adjustment, track_matte (alpha|alpha_inverted|luma|luma_inverted|none), move_to (top|bottom|layer ref)}. changes: [{property, value, time (set a keyframe at time), keyframes:[{time,value,ease_in,ease_out (influence 0.1-100),speed_in,speed_out,interpolation (linear|bezier|hold)}], clear_keyframes, expression, expression_enabled, enabled, separate_dimensions, straight_motion}]. Source Text value may be a string or {text,font,fontSize,fillColor,...}. Shape paths: {vertices,inTangents,outTangents,closed}. layers can be a ref, array, 'all' or 'selected'. " + REF + " " + UNDO,
    inputSchema: { type: "object", properties: { comp: {}, layer: {}, layers: {}, attrs: { type: "object" }, changes: { type: "array", items: { type: "object" } } } },
    handler: async a => (await runOp("set", a, { undo: "AI: set", timeoutSec: 120 })).result
  },
  {
    name: "ae_apply",
    description: "Apply an effect (built-in or any installed plugin, by matchName or display name) with optional params {paramNameOrMatchName: value | {keyframes:[...]} | {expression}}, and/or an animation preset (.ffx path from ae_discover what:'presets') to layers. Returns the applied effect's full parameter list so you can fine-tune it with ae_set, plus `test` (what our plugin test found for a third-party effect — read it). Effects known to crash AE, pop up a dialog or fail to load are refused with FX_KNOWN_ISSUE; force:true tries anyway (ask the user first and have them save the project). " + UNDO,
    inputSchema: { type: "object", properties: { comp: {}, layer: {}, layers: {}, effect: { type: "string" }, name: { type: "string", description: "rename the applied effect" }, params: { type: "object" }, preset: { type: "string" }, force: { type: "boolean", description: "add the effect even though it is on the known-issue list" } } },
    handler: async a => {
      try { return fx.annotateApply((await runOp("apply", a.effect ? { ...a, __fx: fx.gateArgs() } : a, { undo: "AI: apply " + (a.effect || "preset"), timeoutSec: 120 })).result, !!a.force); }
      catch (e) { throw fx.explain(e); }
    }
  },
  {
    name: "ae_run_script",
    description: "Run any ExtendScript in After Effects for anything the other tools don't cover (full AE scripting DOM). The code is a function body: use `return` to send back a value (AE objects are summarized), `log(...)` to collect messages, `args` for input data, and helpers on `JA`: JA.comp(ref), JA.layer(comp, ref), JA.layers(comp, refs), JA.prop(layerOrGroup, 'path'), JA.setValue(prop, value, time?), JA.applyKeys(prop, [{time,value,ease_in,ease_out,interpolation}], {straight_motion}), JA.setEase(prop, keyIndex, inInf, outInf), JA.color('#hex'), JA.describe(prop, {only_modified:false}, 0), JA.path(prop). ExtendScript is ES3: no let/const/arrow functions/JSON/Array.indexOf/forEach. Engine traps: unparenthesized nested ternaries (a?b:c?d:e) are mis-parsed — use if/else or parentheses; TextLayer/ShapeLayer are NOT `instanceof Layer` — test `layer.containingComp`; compare AE enums with == not ===. After addProperty() re-fetch sibling references (old ones become invalid). Text font needs a PostScript name. Errors return message + line. Do not add effects here that ae_apply refused (FX_KNOWN_ISSUE). Blocked unless explicitly allowed: replacing/closing an unsaved project (force_discard_unsaved) and system.callSystem/File.execute (allow_system). " + UNDO,
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string" }, args: { type: "object" }, undo_label: { type: "string" }, timeout_seconds: { type: "number" }, depth: { type: "number", description: "return value summary depth (default 4)" }, force_discard_unsaved: { type: "boolean" }, allow_system: { type: "boolean" } } },
    handler: async a => {
      try { return (await runOp("run", a, { undo: "AI: " + (a.undo_label || "script"), timeoutSec: a.timeout_seconds || 120 })).result; }
      catch (e) { if (e.logs) e.message += "\nlogs: " + JSON.stringify(e.logs); throw e; }
    }
  },
  {
    name: "ae_render_frames",
    description: "Your eyes: render frames of a comp and get them back as an image. times (seconds) or count (evenly spaced over the work area, default 6). grid:true (default when >1 frame) returns one contact sheet ordered left-to-right, top-to-bottom; otherwise one image per frame. background: 'comp' (composite over the comp background color, default — AE exports PNG with alpha), 'checker', or '#RRGGBB'. Full-resolution PNGs are kept on disk (paths returned).",
    inputSchema: { type: "object", properties: { comp: {}, times: { type: "array", items: { type: "number" } }, count: { type: "number" }, grid: { type: "boolean" }, columns: { type: "number" }, max_width: { type: "number", description: "width of each frame in the returned image (default 960 single / 480 in grid)" }, background: { type: "string" }, save_dir: { type: "string" } } },
    handler: async a => {
      let times = a.times;
      if (!times || !times.length) {
        const c = (await runOp("inspect", { target: "comp", comp: a.comp }, { timeoutSec: 60 })).result;
        const n = Math.max(1, Math.min(a.count || 6, 36)), s = c.workAreaStart, d = c.workAreaDuration;
        times = Array.from({ length: n }, (_, i) => +(s + (n === 1 ? d / 2 : (d * i) / (n - 1)) - (i === n - 1 && n > 1 ? 1 / c.frameRate : 0)).toFixed(3));
      }
      const dir = a.save_dir || path.join(WORK, "frames", Date.now().toString(36));
      const r = (await runOp("frames", { comp: a.comp, times, dir: fwd(dir), prefix: "f" }, { timeoutSec: 120 })).result;
      const files = r.files.map(f => f.file);
      if (!(await waitFiles(files, 60 + times.length * 20))) throw new Error("frame files did not finish writing: " + files.join(", "));
      const bg = !a.background || a.background === "comp" ? r.bgColor : a.background === "checker" ? "checker" : hexToRgb(a.background);
      const grid = a.grid !== undefined ? a.grid : files.length > 1;
      const cellW = a.max_width || (grid ? 480 : 960);
      const imgs = files.map(f => png.scale(png.flatten(png.decode(fs.readFileSync(f)), bg), cellW));
      const content = [{ type: "text", text: JSON.stringify({ comp: r.comp, size: [r.width, r.height], frames: r.files.map((f, i) => ({ n: i + 1, time: f.time, file: f.file })), layout: grid ? "contact sheet, left-to-right then top-to-bottom" : "one image per frame" }) }];
      if (grid) {
        const cols = a.columns || Math.min(4, Math.ceil(Math.sqrt(imgs.length)));
        content.push({ type: "image", mimeType: "image/png", data: png.encode(png.tile(imgs, cols)).toString("base64") });
      } else for (const im of imgs.slice(0, 8)) content.push({ type: "image", mimeType: "image/png", data: png.encode(im).toString("base64") });
      return { __content: content };
    }
  },
  {
    name: "ae_render",
    description: "Render a comp to a video/file inside AE (blocks AE until done; tell the user AE will be busy). output: full file path. output_module: 'auto' (default: H.264 if this AE has it — AE 2023+; otherwise a high-quality/lossless template) or an exact template name from ae_discover render_templates. use_ame:true sends the job to Adobe Media Encoder instead (needed for H.264 on AE 2022; AME must be installed). time_span: 'comp' | 'work_area' | {start, duration}. Other queued render items are left untouched.",
    inputSchema: { type: "object", properties: { comp: {}, output: { type: "string" }, output_module: { type: "string" }, render_settings: { type: "string" }, time_span: {}, use_ame: { type: "boolean" }, timeout_seconds: { type: "number" } } },
    handler: async a => (await runOp("render", a, { timeoutSec: a.timeout_seconds || 3600 })).result
  },
  {
    name: "ae_undo",
    description: "Undo the last N steps in AE (each ja-ae call that changes the project is one step).",
    inputSchema: { type: "object", properties: { steps: { type: "number" } } },
    handler: async a => (await runOp("undo", a, { timeoutSec: 30 })).result
  }
];

// ------------------------------------------------------------------ MCP stdio
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") return send({ jsonrpc: "2.0", id, result: { protocolVersion: (params && params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ja-ae", version: VERSION }, instructions: "ja-ae controls the user's running Adobe After Effects (2022+, Windows). It offers capabilities only — no templates or fixed workflows: follow the user's own brief and style. Start with ae_status. Use ae_render_frames to look at your work before reporting. Never save, close or replace the user's project unless they asked; every change is one undo step. Third-party plugins: ae_discover marks each effect with `test` (result of a one-machine plugin test: usable, needs input, watermark, crash, ...); prefer effects marked ok, never route around an FX_KNOWN_ISSUE refusal, read ae_discover what:'plugin_guide' once before using plugins, and before anything is delivered render a frame (ae_render_frames) of every third-party effect and run ae_check — a watermark or licence notice on the frame means the effect must not be used." } });
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
  if (method === "tools/call") {
    const tool = TOOLS.find(t => t.name === params.name);
    if (!tool) return send({ jsonrpc: "2.0", id, error: { code: -32602, message: "unknown tool " + params.name } });
    try {
      const out = await tool.handler(params.arguments || {});
      const content = out && out.__content ? out.__content : [{ type: "text", text: JSON.stringify(out) }];
      return send({ jsonrpc: "2.0", id, result: { content } });
    } catch (e) {
      const body = { error: e.message }; if (e.hint) body.hint = e.hint;
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(body) }], isError: true } });
    }
  }
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (id !== undefined && id !== null) send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found: " + method } });
}
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch (e) { log("bad json", line.slice(0, 120)); continue; }
    handle(msg).catch(e => log("handler crash", e.stack));
  }
});
process.stdin.on("end", () => process.exit(0));
log("ready", VERSION, "workdir", WORK);
