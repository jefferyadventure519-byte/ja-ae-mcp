#!/usr/bin/env node
// ja-ae 安装脚本：环境检查 + 把 MCP 注册到 Claude Code 用户配置（仅 Windows）
// 用法：node scripts/install.js [--check] [--uninstall] [--json] [--config <path>]
//   --check      只检查，不注册
//   --uninstall  删除 ja-ae 的注册
//   --config     指定 Claude Code 用户配置文件（默认 %USERPROFILE%\.claude.json，测试用）
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const JSON_ONLY = flag("--json");
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "plugins", "ja-ae", "server", "index.js");
const NAME = "ja-ae";
const CONFIG = opt("--config") || path.join(os.homedir(), ".claude.json");

const checks = [];
const say = s => { if (!JSON_ONLY) console.log(s); };
function check(id, ok, detail, level) { checks.push({ id, ok, level: ok ? "ok" : (level || "error"), detail }); say((ok ? "  [OK]   " : level === "warn" ? "  [注意] " : "  [失败] ") + id + "：" + detail); }

say("ja-ae 安装检查\n");
// 1 平台与 Node
check("windows", process.platform === "win32", process.platform === "win32" ? "Windows" : "当前系统 " + process.platform + "，ja-ae 只支持 Windows");
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
check("node", nodeMajor >= 18, "Node " + process.versions.node + (nodeMajor >= 18 ? "" : "（需要 18 或更新版本）"));
check("server_files", fs.existsSync(SERVER), fs.existsSync(SERVER) ? SERVER : "缺少 " + SERVER + "（代码没下载完整？）");

// 2 After Effects
let ae = { installed: [], running: [] };
if (process.platform === "win32") {
  const { findAE, scriptingPref } = require(path.join(ROOT, "plugins", "ja-ae", "server", "ae_locate.js"));
  ae = findAE(true);
  const major = v => parseInt(String(v).split(".")[0], 10);
  check("ae_installed", ae.installed.length > 0, ae.installed.length ? ae.installed.map(i => i.version + "  " + i.exe).join(" | ") : "没找到 AfterFX.exe；如装在非默认位置，设置环境变量 JA_AE_EXE 为其完整路径");
  const ver = ae.running.length ? (ae.installed.find(i => i.exe.toLowerCase() === ae.running[0].exe.toLowerCase()) || {}).version : (ae.installed[0] || {}).version;
  if (ver && !isNaN(major(ver))) check("ae_version", major(ver) >= 22, "AE " + ver + (major(ver) >= 22 ? "" : "（需要 AE 2022 / 22.0 或更新）"));
  check("ae_running", ae.running.length > 0, ae.running.length ? "AE 正在运行（" + ae.running[0].exe + "）" : "AE 没有打开——使用和自检前请先打开 AE", "warn");
  const pref = scriptingPref();
  if (pref) check("ae_scripting_pref", pref.enabled, pref.enabled ? "已允许脚本写入文件（AE " + pref.version + "）" : "AE 首选项 → 脚本和表达式 → 勾选「允许脚本写入文件和访问网络」", "warn");
  else check("ae_scripting_pref", true, "首选项文件里读不到该项（新装的 AE 退出一次后才会写入）；自检时会实际验证");
}

// 3 已有注册 / 冲突
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch (e) { cfg = {}; }
const servers = cfg.mcpServers || {};
const otherAE = Object.keys(servers).filter(k => k !== NAME && /after.?effects|aftereffects|\bae\b/i.test(k + " " + JSON.stringify(servers[k])));
if (otherAE.length) check("other_ae_mcp", false, "配置里还有其他 AE 类 MCP：" + otherAE.join(", ") + "——两套同时加载可能让 AI 混用，建议保留一个", "warn");
let pluginOn = false;
try { const st = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")); pluginOn = Object.keys(st.enabledPlugins || {}).some(k => /^ja-ae@/.test(k) && st.enabledPlugins[k]); } catch (e) {}
if (pluginOn) check("plugin_route", false, "已经通过 /plugin 装过 ja-ae 插件——不要再用本脚本重复注册（会出现两套同名工具）", "warn");

// 4 注册 / 卸载
const entry = { type: "stdio", command: process.execPath, args: [SERVER], env: {} };
function findClaudeCli() {
  const r = cp.spawnSync("where", ["claude"], { encoding: "utf8", windowsHide: true, shell: true });
  const p = (r.stdout || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
  return p || null;
}
function writeConfig(mutate) {
  let raw = "{}";
  try { raw = fs.readFileSync(CONFIG, "utf8"); } catch (e) {}
  const bak = CONFIG + ".bak-ja-ae-" + new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(CONFIG)) fs.copyFileSync(CONFIG, bak);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const j = JSON.parse(fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG, "utf8") : "{}");
    j.mcpServers = j.mcpServers || {};
    mutate(j.mcpServers);
    const tmp = CONFIG + ".tmp-ja-ae";
    fs.writeFileSync(tmp, JSON.stringify(j, null, 2));
    fs.renameSync(tmp, CONFIG);
    // Claude Code 运行时会回写该文件：等一下再读回，确认没被覆盖
    const until = Date.now() + 1500; while (Date.now() < until) { /* 短暂等待 */ }
    const back = JSON.parse(fs.readFileSync(CONFIG, "utf8")).mcpServers || {};
    const want = {}; mutate(want);
    const ok = Object.keys(want).length ? JSON.stringify(back[NAME]) === JSON.stringify(want[NAME]) : !(NAME in back);
    if (ok) return { ok: true, backup: fs.existsSync(bak) ? bak : null, attempts: attempt };
  }
  return { ok: false, backup: bak };
}

let action = { mode: "check" };
const fatal = checks.some(c => c.level === "error");
if (flag("--uninstall")) {
  const cli = !opt("--config") && findClaudeCli();
  if (cli) { const r = cp.spawnSync(cli, ["mcp", "remove", NAME, "--scope", "user"], { encoding: "utf8", windowsHide: true }); action = { mode: "uninstall", via: "claude cli", ok: r.status === 0, output: (r.stdout + r.stderr).trim() }; }
  else { const w = writeConfig(s => { delete s[NAME]; }); action = { mode: "uninstall", via: "config file", ...w }; }
  say("\n" + (action.ok ? "已卸载 ja-ae 的注册。" : "卸载失败：" + JSON.stringify(action)));
} else if (!flag("--check")) {
  if (fatal) action = { mode: "install", ok: false, reason: "存在必须先解决的问题（见上方 [失败] 项），未注册" };
  else {
    const cli = !opt("--config") && findClaudeCli();
    if (cli) {
      cp.spawnSync(cli, ["mcp", "remove", NAME, "--scope", "user"], { encoding: "utf8", windowsHide: true });
      const r = cp.spawnSync(cli, ["mcp", "add-json", NAME, JSON.stringify(entry), "--scope", "user"], { encoding: "utf8", windowsHide: true });
      action = { mode: "install", via: "claude cli", ok: r.status === 0, output: (r.stdout + r.stderr).trim() };
    }
    if (!cli || !action.ok) { const w = writeConfig(s => { s[NAME] = entry; }); action = { mode: "install", via: "config file " + CONFIG, ...w }; }
  }
  say("\n" + (action.ok ? "已注册 MCP「ja-ae」→ " + SERVER + "\n新开一个 Claude Code 会话后，ae_* 工具即可使用。" : "注册未完成：" + (action.reason || JSON.stringify(action))));
}

const needsUser = checks.filter(c => c.level === "warn" && !c.ok).map(c => c.id);
const result = { ok: !fatal && (action.mode === "check" || action.ok !== false), server: SERVER, node: process.execPath, ae: { installed: ae.installed, running: ae.running }, checks, action, needsUserAction: needsUser };
if (JSON_ONLY) console.log(JSON.stringify(result, null, 2));
process.exit(fatal ? 1 : (action.ok === false ? 1 : 0));
