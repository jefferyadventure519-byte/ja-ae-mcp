// 找 After Effects：正在运行的进程 + 注册表 App Paths + Program Files 扫描 + 环境变量 JA_AE_EXE
// MCP 服务端与安装脚本共用，保证两边判断一致
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

function ps(script, timeout = 20000) {
  // -EncodedCommand（UTF-16LE base64）避免命令行引号转义问题；输出强制 UTF-8（路径可能含中文）
  const enc = Buffer.from("[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + script, "utf16le").toString("base64");
  const r = cp.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { encoding: "utf8", windowsHide: true, timeout });
  return (r.stdout || "").trim();
}

let cache = null, cacheAt = 0;
function findAE(force) {
  if (!force && cache && Date.now() - cacheAt < 15000) return cache;
  const out = ps(
    "$r=@(Get-CimInstance Win32_Process -Filter \"Name='AfterFX.exe'\" | ForEach-Object { @{pid=$_.ProcessId; exe=$_.ExecutablePath} });" +
    "$c=@(); try { $c += (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe' -ErrorAction Stop).'(default)' } catch {};" +
    "foreach ($pf in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) { if ($pf) { $c += @(Get-ChildItem -Path (Join-Path $pf 'Adobe') -Filter 'Adobe After Effects*' -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'Support Files\\AfterFX.exe' }) } };" +
    "$i=@($c | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique | ForEach-Object { @{exe=$_; version=(Get-Item $_).VersionInfo.ProductVersion} });" +
    "@{running=$r; installed=$i} | ConvertTo-Json -Compress -Depth 4");
  let info = { running: [], installed: [] };
  try { info = JSON.parse(out); } catch (e) { info.parseError = out.slice(0, 200); }
  info.running = [].concat(info.running || []).filter(x => x && x.exe);
  info.installed = [].concat(info.installed || []).filter(x => x && x.exe);
  if (process.env.JA_AE_EXE && fs.existsSync(process.env.JA_AE_EXE) && !info.installed.some(i => i.exe === process.env.JA_AE_EXE)) info.installed.unshift({ exe: process.env.JA_AE_EXE, version: "env" });
  for (const r of info.running) if (!info.installed.some(i => i.exe.toLowerCase() === r.exe.toLowerCase())) info.installed.push({ exe: r.exe, version: "running" });
  info.installed.sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
  cache = info; cacheAt = Date.now();
  return info;
}

function exeToUse(info) {
  if (info.running.length) return info.running[0].exe;   // 永远投递给正在运行的那个版本
  if (process.env.JA_AE_EXE) return process.env.JA_AE_EXE;
  return info.installed.length ? info.installed[0].exe : null;
}

// 从首选项文本读「允许脚本写入文件和访问网络」——仅用于诊断，读不到返回 null
function scriptingPref() {
  try {
    const base = path.join(process.env.APPDATA, "Adobe", "After Effects");
    for (const v of fs.readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const d = path.join(base, v);
      let files = []; try { files = fs.readdirSync(d); } catch (e) { continue; }
      for (const f of files) if (/Prefs.*\.txt$/i.test(f)) {
        const m = fs.readFileSync(path.join(d, f), "utf8").match(/"Pref_SCRIPTING_FILE_NETWORK_SECURITY"\s*=\s*(\d+)/);
        if (m) return { version: v, enabled: !/^0+$/.test(m[1]) };
      }
    }
  } catch (e) {}
  return null;
}

module.exports = { ps, findAE, exeToUse, scriptingPref };
