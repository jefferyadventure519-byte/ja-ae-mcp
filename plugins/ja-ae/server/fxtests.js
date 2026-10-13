// 第三方效果测试名单（data/fx_tests.json）：ae_discover 给效果打标，ae_apply 加效果前拦已知问题，ae_check 复查工程里已经用上的效果。
// 名单只在测试环境上成立（见 tested）：别的 AE 版本、插件版本或授权状态下，结果可能不同。
"use strict";
const fs = require("fs");
const path = require("path");

let DATA = { tested: {}, codes: {}, fx: {}, bundled: [] }, loadError = null;
try { DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "fx_tests.json"), "utf8")); } catch (e) { loadError = e.message; }
const BUNDLED = new Set(DATA.bundled || []);
const HARD = new Set(["crash_add", "crash_render", "dialog", "timeout"]);   // 事后提醒没有用（加上或渲染时就出事），任何 AE 版本都先拦
const SOFT = new Set(["noadd"]);                                            // 只在和测试相同的 AE 大版本上拦；版本不同就放行让它试
const ISSUE = new Set(["wm", "wm_maybe", "noadd", "dialog", "crash_add", "crash_render", "timeout"]);
const UNTESTED = "Not in the tested list (a plugin or version we did not test). Before relying on it, render a frame with ae_render_frames and check for watermarks or anything unexpected.";

const has = mn => Object.prototype.hasOwnProperty.call(DATA.fx, mn);
const major = v => parseInt(v, 10) || 0;
const testedOn = () => (DATA.tested.aeName ? DATA.tested.aeName + " (" + DATA.tested.ae + "), " + DATA.tested.os + ", " + DATA.tested.date : "");
const info = () => ({ listed: Object.keys(DATA.fx).length, testedOn: testedOn(), loadError: loadError || undefined });

// 名单里的效果返回 {test, testNote?, nc?}；AE 自带的返回 null；其余第三方效果返回 {test:"untested"}
function label(mn) {
  if (has(mn)) { const e = DATA.fx[mn], o = { test: e.s }; if (e.n) o.testNote = e.n; if (e.nc) o.nc = true; return o; }
  if (/^ADBE /.test(mn) || BUNDLED.has(mn)) return null;
  return { test: "untested" };
}

let gate = null;
function gateArgs() {
  if (!gate) {
    gate = { ae: DATA.tested.aeMajor || 0, hard: {}, soft: {} };
    for (const mn of Object.keys(DATA.fx)) { const s = DATA.fx[mn].s; if (HARD.has(s)) gate.hard[mn] = s; else if (SOFT.has(s)) gate.soft[mn] = s; }
  }
  return gate;
}

// 运行时抛出的 FX_KNOWN_ISSUE|matchName|代码|AE版本 → 给 AI 看的完整说明
function explain(e) {
  const m = /FX_KNOWN_ISSUE\|(.+)\|([a-z_]+)\|([^|]*)$/.exec((e && e.message) || "");
  if (!m) return e;
  const mn = m[1], code = m[2], ae = m[3], same = major(ae) === DATA.tested.aeMajor;
  const err = new Error('FX_KNOWN_ISSUE: effect "' + mn + '" was NOT added. Test result on ' + testedOn() + ": " + (DATA.codes[code] || code) + "." +
    (same ? "" : " This AE is " + ae + " (a different version from the test), so the result may differ here.") +
    " Pick another effect. To try anyway, ask the user first and have them save the project, then call again with force:true. Do not bypass this with ae_run_script.");
  err.hint = { matchName: mn, test: code, testedOn: testedOn(), thisAE: ae };
  return err;
}

function annotateDiscover(r, filter, lim) {
  const same = major(r.ae) === DATA.tested.aeMajor, legend = {}, counts = {};
  let list = r.effects.map(ef => Object.assign(ef, label(ef.matchName) || {}));
  if (filter) {
    list = list.filter(ef => (filter === "issues" ? ISSUE.has(ef.test) : ef.test === filter));
    r.total = list.length;
  }
  list = list.slice(0, lim);
  for (const ef of list) {
    if (!ef.test) continue;
    counts[ef.test] = (counts[ef.test] || 0) + 1;
    legend[ef.test] = ef.test === "untested" ? UNTESTED : DATA.codes[ef.test] || ef.test;
    if (ef.nc) legend.nc = DATA.nc;
  }
  r.effects = list; r.returned = list.length;
  r.fxTests = { testedOn: testedOn(), thisAE: r.ae, sameAEVersion: same, listed: info().listed, inThisResult: counts, legend,
    note: "The `test` field comes from a one-machine test of third-party effects; effects without it are built into AE. Results depend on AE version, plugin version and licence state" + (same ? "." : " — this AE differs from the test, treat them as hints.") + " Before delivery, render a frame of any third-party effect and look at it." };
  return r;
}

function annotateApply(r, forced) {
  if (!r || !r.fx) return r;
  const lab = label(r.fx);
  if (!lab) return r;
  const t = { status: lab.test };
  if (lab.test === "untested") t.note = UNTESTED;
  else {
    if (lab.test !== "ok") { t.meaning = DATA.codes[lab.test]; t.testedOn = testedOn(); }
    if (lab.testNote) t.note = lab.testNote;
    if (lab.nc) t.defaultLooksUnchanged = DATA.nc;
    if (lab.test !== "ok" && major(r.ae) !== DATA.tested.aeMajor) t.thisAE = r.ae + " (differs from the test; the result may differ here)";
    if (forced && (HARD.has(lab.test) || SOFT.has(lab.test))) t.forced = true;
  }
  r.test = t;
  return r;
}

function annotateCheck(r) {
  const issues = [], untested = [];
  for (const u of r.effectsUsed || []) {
    const lab = label(u.matchName);
    if (!lab) continue;
    if (lab.test === "untested") untested.push(u.matchName);
    else if (ISSUE.has(lab.test)) issues.push(Object.assign({}, u, { test: lab.test, meaning: DATA.codes[lab.test] }));
  }
  r.effectIssues = issues; r.untestedEffects = untested;
  if (issues.length || untested.length) r.effectNote = "effectIssues: effects used in this project that had problems in our test (" + testedOn() + "). untestedEffects: third-party effects we did not test. Render frames and check them before delivery.";
  if (r.summary) { r.summary.effectIssues = issues.length; r.summary.untestedEffects = untested.length; }
  return r;
}

function guide() {
  try { return fs.readFileSync(path.join(__dirname, "..", "docs", "plugin-guide.md"), "utf8"); } catch (e) { return "plugin guide not found: " + e.message; }
}

module.exports = { info, label, gateArgs, explain, annotateDiscover, annotateApply, annotateCheck, guide };
