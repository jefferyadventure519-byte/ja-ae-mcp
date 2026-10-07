// ja-ae runtime —— 在 After Effects 内执行的操作层（ExtendScript = ES3：无 JSON / Array.indexOf / map / let）
// 由 MCP 服务端把本文件与一个 __JOB 对象拼成单个 .jsx，经 AfterFX.exe -r 投递执行；结果写回 JSON 文件。
// 设计原则：只提供通用能力，不含任何设计模板；按功能探测兼容 AE 2022+，不按版本号写死。

var JA = (function () {
    var J = {};

    // ------------------------------------------------------------------ JSON
    function q(s) {
        var out = '"', c, code;
        for (var i = 0; i < s.length; i++) {
            c = s.charAt(i); code = s.charCodeAt(i);
            if (c === '"') out += '\\"';
            else if (c === "\\") out += "\\\\";
            else if (c === "\n") out += "\\n";
            else if (c === "\r") out += "\\r";
            else if (c === "\t") out += "\\t";
            else if (code < 32) out += "\\u" + ("000" + code.toString(16)).slice(-4);
            else out += c;
        }
        return out + '"';
    }
    J.stringify = function (v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(Math.round(v * 10000) / 10000) : "null";
        if (t === "boolean") return String(v);
        if (t === "string") return q(v);
        if (t === "function") return "null";
        if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(J.stringify(v[i])); return "[" + a.join(",") + "]"; }
        var p = [];
        for (var k in v) { if (v.hasOwnProperty(k) && typeof v[k] !== "function" && v[k] !== undefined) p.push(q(k) + ":" + J.stringify(v[k])); }
        return "{" + p.join(",") + "}";
    };
    J.writeFile = function (path, text) {
        var tmp = new File(path + ".tmp");
        tmp.encoding = "UTF-8"; tmp.lineFeed = "Unix";
        if (!tmp.open("w")) throw new Error("cannot write result file: " + path + " (enable Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network)");
        tmp.write(text); tmp.close();
        var fin = new File(path); if (fin.exists) fin.remove();
        tmp.rename(fin.name);
    };

    // ------------------------------------------------------------------ 小工具
    // TextLayer/ShapeLayer 等在脚本引擎里并不 instanceof Layer（实测），用鸭子类型判断
    J.isLayer = function (v) { try { return v !== null && typeof v === "object" && v.containingComp !== undefined && typeof v.index === "number"; } catch (e) { return false; } };
    J.has = function (arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; };
    J.lower = function (s) { return String(s === undefined || s === null ? "" : s).toLowerCase(); };
    J.hex = function (h) {
        h = String(h).replace("#", "");
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
    };
    J.color = function (c) {
        if (typeof c === "string") return J.hex(c);
        if (c instanceof Array) { var mx = 0; for (var i = 0; i < c.length; i++) mx = Math.max(mx, c[i]); if (mx > 1.0001) { var o = []; for (var j = 0; j < c.length; j++) o.push(c[j] / 255); return o; } return c; }
        return c;
    };

    // ------------------------------------------------------------------ 引用解析
    J.itemType = function (it) {
        if (it instanceof CompItem) return "comp";
        if (it instanceof FolderItem) return "folder";
        if (it instanceof FootageItem) {
            try { if (it.mainSource instanceof SolidSource) return "solid"; } catch (e) {}
            try { if (it.mainSource instanceof PlaceholderSource) return "placeholder"; } catch (e2) {}
            return "footage";
        }
        return "item";
    };
    J.item = function (ref) {
        var proj = app.project, i, it;
        if (ref === undefined || ref === null || ref === "") {
            if (proj.activeItem) return proj.activeItem;
            throw new Error("no item given and no active item");
        }
        var id = null, name = null;
        if (typeof ref === "number") id = ref;
        else if (typeof ref === "string") name = ref;
        else if (ref.id !== undefined) id = ref.id;
        else if (ref.name !== undefined) name = ref.name;
        for (i = 1; i <= proj.numItems; i++) {
            it = proj.item(i);
            if (id !== null && it.id === id) return it;
            if (name !== null && it.name === name) return it;
        }
        throw new Error("item not found: " + J.stringify(ref));
    };
    J.comp = function (ref) {
        var it;
        if (ref === undefined || ref === null || ref === "") {
            it = app.project.activeItem;
            if (it instanceof CompItem) return it;
            var only = null, n = 0;
            for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof CompItem) { only = app.project.item(i); n++; }
            if (n === 1) return only;
            throw new Error("no comp given: specify comp by name or id (no active comp, " + n + " comps in project)");
        }
        it = J.item(ref);
        if (!(it instanceof CompItem)) throw new Error("not a composition: " + it.name);
        return it;
    };
    J.layer = function (comp, ref) {
        var i, L;
        if (ref === undefined || ref === null) throw new Error("layer reference required");
        if (typeof ref === "number") { if (ref < 1 || ref > comp.numLayers) throw new Error("layer index out of range: " + ref); return comp.layer(ref); }
        if (typeof ref === "string") ref = { name: ref };
        if (ref.index !== undefined) return comp.layer(ref.index);
        for (i = 1; i <= comp.numLayers; i++) {
            L = comp.layer(i);
            if (ref.id !== undefined) { try { if (L.id === ref.id) return L; } catch (e) {} }
            else if (ref.name !== undefined && L.name === ref.name) return L;
        }
        throw new Error("layer not found in '" + comp.name + "': " + J.stringify(ref));
    };
    J.layers = function (comp, refs) {
        if (refs === "selected") return comp.selectedLayers;
        if (refs === "all") { var all = []; for (var i = 1; i <= comp.numLayers; i++) all.push(comp.layer(i)); return all; }
        if (refs === undefined || refs === null) throw new Error("layers required: index / name / {id} / array of them / 'all' / 'selected'");
        if (!(refs instanceof Array)) refs = [refs];
        var out = []; for (var j = 0; j < refs.length; j++) out.push(J.layer(comp, refs[j]));
        return out;
    };

    // 常用英文显示名 → matchName（中文版 AE 的显示名是中文，matchName 不随语言变化）
    var ALIAS = {
        "transform": "ADBE Transform Group", "effects": "ADBE Effect Parade", "masks": "ADBE Mask Parade",
        "text": "ADBE Text Properties", "contents": "ADBE Root Vectors Group", "material options": "ADBE Material Options Group",
        "audio": "ADBE Audio Group", "time remap": "ADBE Time Remapping", "marker": "ADBE Marker",
        "camera options": "ADBE Camera Options Group", "light options": "ADBE Light Options Group",
        "anchor point": "ADBE Anchor Point", "position": "ADBE Position", "x position": "ADBE Position_0",
        "y position": "ADBE Position_1", "z position": "ADBE Position_2", "scale": "ADBE Scale",
        "orientation": "ADBE Orientation", "x rotation": "ADBE Rotate X", "y rotation": "ADBE Rotate Y",
        "rotation": "ADBE Rotate Z", "z rotation": "ADBE Rotate Z", "opacity": "ADBE Opacity",
        "source text": "ADBE Text Document", "animators": "ADBE Text Animators", "mask path": "ADBE Mask Shape",
        "mask feather": "ADBE Mask Feather", "mask opacity": "ADBE Mask Opacity", "mask expansion": "ADBE Mask Offset",
        "zoom": "ADBE Camera Zoom", "focus distance": "ADBE Camera Focus Distance", "aperture": "ADBE Camera Aperture",
        "blur level": "ADBE Camera Blur Level", "depth of field": "ADBE Camera Depth of Field",
        "intensity": "ADBE Light Intensity",
        // 一个英文名在不同层级对应不同 matchName：按候选顺序取当前分组里存在的那个
        "contents": ["ADBE Root Vectors Group", "ADBE Vectors Group"],
        "color": ["ADBE Light Color", "ADBE Vector Fill Color", "ADBE Vector Stroke Color"],
        "fill": "ADBE Vector Graphic - Fill", "stroke": "ADBE Vector Graphic - Stroke", "stroke width": "ADBE Vector Stroke Width",
        "trim paths": "ADBE Vector Filter - Trim", "start": "ADBE Vector Trim Start", "end": "ADBE Vector Trim End", "offset": "ADBE Vector Trim Offset",
        "path": ["ADBE Vector Shape", "ADBE Mask Shape"], "size": ["ADBE Vector Rect Size", "ADBE Vector Ellipse Size"], "roundness": "ADBE Vector Rect Roundness"
    };
    var TRANSFORM_KEYS = ["ADBE Anchor Point", "ADBE Position", "ADBE Position_0", "ADBE Position_1", "ADBE Position_2", "ADBE Scale", "ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z", "ADBE Opacity"];
    function child(group, seg) {
        var p = null, s = String(seg);
        if (s.charAt(0) === "#") { var n = parseInt(s.substr(1), 10); if (n >= 1 && n <= group.numProperties) return group.property(n); return null; }
        var al = ALIAS[J.lower(s)];
        if (al) {
            var cands = al instanceof Array ? al : [al];
            for (var ci = 0; ci < cands.length; ci++) { try { p = group.property(cands[ci]); } catch (e) { p = null; } if (p) return p; }
        }
        try { p = group.property(s); } catch (e2) { p = null; }
        if (p) return p;
        for (var i = 1; i <= group.numProperties; i++) {   // 不区分大小写兜底
            var c = group.property(i);
            if (J.lower(c.name) === J.lower(s) || J.lower(c.matchName) === J.lower(s)) return c;
        }
        return null;
    }
    J.splitPath = function (path) {
        if (path instanceof Array) return path;
        var s = String(path), parts = [], cur = "";
        for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c === "/" || c === ">") { if (cur !== "") parts.push(J.trim(cur)); cur = ""; } else cur += c; }
        if (J.trim(cur) !== "") parts.push(J.trim(cur));
        return parts;
    };
    J.trim = function (s) { return String(s).replace(/^\s+|\s+$/g, ""); };
    J.prop = function (base, path) {
        var segs = J.splitPath(path), cur = base, nxt;
        if (segs.length && J.isLayer(base)) {   // 简写：直接写 Position / Source Text
            var first = ALIAS[J.lower(segs[0])] || segs[0];
            if (first instanceof Array) first = first[0];
            if (J.has(TRANSFORM_KEYS, first)) segs = ["ADBE Transform Group"].concat(segs);
            else if (first === "ADBE Text Document") segs = ["ADBE Text Properties"].concat(segs);
        }
        for (var i = 0; i < segs.length; i++) {
            nxt = child(cur, segs[i]);
            if (!nxt) throw new Error("property not found: '" + segs[i] + "' under '" + cur.name + "' (path " + J.stringify(segs) + "). Use ae_inspect to list matchNames.");
            cur = nxt;
        }
        return cur;
    };
    J.path = function (p) {   // 由属性回溯 matchName 路径（可直接回传给 ae_set）
        var segs = [], cur = p;
        while (cur && !J.isLayer(cur) && cur.propertyDepth > 0) {   // 深度 0 = 图层本身，不进路径
            var parentG = null; try { parentG = cur.parentProperty; } catch (e) {}
            var seg = cur.matchName;
            if (parentG && parentG.propertyType === PropertyType.INDEXED_GROUP) seg = "#" + cur.propertyIndex;
            segs.unshift(seg);
            cur = parentG;
        }
        return segs.join("/");
    };

    // ------------------------------------------------------------------ 值转换
    J.fromAE = function (prop, v) {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TEXT_DOCUMENT) {
            var o = { text: v.text };
            try { o.font = v.font; o.fontSize = v.fontSize; o.applyFill = v.applyFill; if (v.applyFill) o.fillColor = v.fillColor; o.applyStroke = v.applyStroke; if (v.applyStroke) { o.strokeColor = v.strokeColor; o.strokeWidth = v.strokeWidth; } o.tracking = v.tracking; o.leading = v.leading; } catch (e) {}
            try {
                var jv = v.justification; o.justification = String(jv);
                if (jv == ParagraphJustification.LEFT_JUSTIFY) o.justification = "left";
                if (jv == ParagraphJustification.CENTER_JUSTIFY) o.justification = "center";
                if (jv == ParagraphJustification.RIGHT_JUSTIFY) o.justification = "right";
            } catch (eJ) {}
            return o;
        }
        if (vt === PropertyValueType.SHAPE) {
            var n = v.vertices.length;
            return { closed: v.closed, vertexCount: n, vertices: n <= 64 ? v.vertices : v.vertices.slice(0, 64), inTangents: n <= 64 ? v.inTangents : undefined, outTangents: n <= 64 ? v.outTangents : undefined, truncated: n > 64 };
        }
        if (vt === PropertyValueType.MARKER) return { comment: v.comment, duration: v.duration, chapter: v.chapter };
        if (vt === PropertyValueType.CUSTOM_VALUE || vt === PropertyValueType.NO_VALUE) return undefined;
        return v;
    };
    J.toAE = function (prop, v) {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TEXT_DOCUMENT) {
            var td = prop.value;
            if (typeof v === "string") { td.text = v; return td; }
            if (v.text !== undefined) td.text = v.text;
            if (v.font !== undefined) td.font = v.font;
            if (v.fontSize !== undefined) td.fontSize = v.fontSize;
            if (v.fillColor !== undefined) { td.applyFill = true; td.fillColor = J.color(v.fillColor).slice(0, 3); }
            if (v.applyFill !== undefined) td.applyFill = v.applyFill;
            if (v.strokeColor !== undefined) { td.applyStroke = true; td.strokeColor = J.color(v.strokeColor).slice(0, 3); }
            if (v.strokeWidth !== undefined) td.strokeWidth = v.strokeWidth;
            if (v.applyStroke !== undefined) td.applyStroke = v.applyStroke;
            if (v.tracking !== undefined) td.tracking = v.tracking;
            if (v.leading !== undefined) { td.autoLeading = false; td.leading = v.leading; }
            if (v.justification !== undefined) {
                var jm = { left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY, right: ParagraphJustification.RIGHT_JUSTIFY };
                if (jm[J.lower(v.justification)]) td.justification = jm[J.lower(v.justification)];
            }
            return td;
        }
        if (vt === PropertyValueType.SHAPE) {
            var s = new Shape(); s.vertices = v.vertices; s.inTangents = v.inTangents || []; s.outTangents = v.outTangents || []; s.closed = v.closed !== false;
            if (!s.inTangents.length) { var z = []; for (var i = 0; i < v.vertices.length; i++) z.push([0, 0]); s.inTangents = z; s.outTangents = z; }
            return s;
        }
        if (vt === PropertyValueType.COLOR) { var c = J.color(v); if (c.length === 3) c = c.concat([1]); return c; }
        if (vt === PropertyValueType.MARKER) { var m = new MarkerValue(v.comment || ""); if (v.duration) m.duration = v.duration; return m; }
        if (v instanceof Array && (vt === PropertyValueType.ThreeD_SPATIAL || vt === PropertyValueType.ThreeD) && v.length === 2) {
            var cur = prop.value; return [v[0], v[1], cur[2]];
        }
        return v;
    };
    J.dims = function (prop) {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TwoD) return 2;
        if (vt === PropertyValueType.ThreeD) return 3;
        return 1;
    };
    J.setEase = function (prop, k, inInf, outInf, inSpeed, outSpeed) {
        var n = J.dims(prop), ei = [], eo = [];
        for (var d = 0; d < n; d++) {
            ei.push(new KeyframeEase(inSpeed || 0, Math.min(100, Math.max(0.1, inInf))));
            eo.push(new KeyframeEase(outSpeed || 0, Math.min(100, Math.max(0.1, outInf))));
        }
        try { prop.setTemporalEaseAtKey(k, ei, eo); }
        catch (e) { prop.setTemporalEaseAtKey(k, [ei[0]], [eo[0]]); }
    };
    function interpType(name) {
        var n = J.lower(name);
        if (n === "linear") return KeyframeInterpolationType.LINEAR;
        if (n === "hold") return KeyframeInterpolationType.HOLD;
        return KeyframeInterpolationType.BEZIER;
    }
    // keys: [{time, value, ease_in, ease_out, speed_in, speed_out, interpolation, interpolation_in, interpolation_out}]
    J.applyKeys = function (prop, keys, opts) {
        opts = opts || {};
        if (prop.dimensionsSeparated) throw new Error("dimensions are separated on '" + prop.name + "': key X/Y/Z Position individually");
        var j, k, spec;
        for (j = 0; j < keys.length; j++) prop.setValueAtTime(keys[j].time, J.toAE(prop, keys[j].value));
        for (j = 0; j < keys.length; j++) {
            spec = keys[j]; k = prop.nearestKeyIndex(spec.time);
            var ii = spec.interpolation_in || spec.interpolation, io = spec.interpolation_out || spec.interpolation;
            if (ii || io) { try { prop.setInterpolationTypeAtKey(k, interpType(ii || "bezier"), interpType(io || "bezier")); } catch (eI) {} }
            if (spec.ease_in !== undefined || spec.ease_out !== undefined) {
                J.setEase(prop, k, spec.ease_in !== undefined ? spec.ease_in : 33.33, spec.ease_out !== undefined ? spec.ease_out : 33.33, spec.speed_in, spec.speed_out);
            }
        }
        if (opts.straight_motion && prop.isSpatial) {
            for (j = 1; j <= prop.numKeys; j++) { try { prop.setSpatialTangentsAtKey(j, [0, 0, 0], [0, 0, 0]); } catch (e1) { try { prop.setSpatialTangentsAtKey(j, [0, 0], [0, 0]); } catch (e2) {} } }
        }
    };
    J.setValue = function (prop, v, time) {
        if (prop.dimensionsSeparated && v instanceof Array) {
            for (var d = 0; d < v.length; d++) { var sp = prop.getSeparationFollower(d); if (time !== undefined) sp.setValueAtTime(time, v[d]); else sp.setValue(v[d]); }
            return;
        }
        var val = J.toAE(prop, v);
        if (time !== undefined) prop.setValueAtTime(time, val);
        else if (prop.numKeys > 0) throw new Error("'" + prop.name + "' has keyframes: pass time to set a keyframe, or clear_keyframes:true first");
        else prop.setValue(val);
    };
    J.clearKeys = function (prop) { while (prop.numKeys > 0) prop.removeKey(1); };

    // ------------------------------------------------------------------ 描述
    J.layerType = function (L) {
        if (L instanceof TextLayer) return "text";
        if (L instanceof ShapeLayer) return "shape";
        if (L instanceof CameraLayer) return "camera";
        if (L instanceof LightLayer) return "light";
        if (L instanceof AVLayer) {
            if (L.nullLayer) return "null";
            if (L.adjustmentLayer) return "adjustment";
            try { if (L.source instanceof CompItem) return "precomp"; if (L.source.mainSource instanceof SolidSource) return "solid"; } catch (e) {}
            return "footage";
        }
        return "layer";
    };
    function scanFlags(group, acc, depth) {
        if (depth > 12 || (acc.keys && acc.expr)) return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p.propertyType === PropertyType.PROPERTY) {
                try { if (p.numKeys > 0) acc.keys = true; } catch (e) {}
                try { if (p.expressionEnabled && p.expression !== "") acc.expr = true; } catch (e2) {}
            } else scanFlags(p, acc, depth + 1);
        }
    }
    J.layerSummary = function (L, deep) {
        var o = { index: L.index, name: L.name, type: J.layerType(L), enabled: L.enabled, inPoint: L.inPoint, outPoint: L.outPoint, startTime: L.startTime };
        try { o.id = L.id; } catch (e) {}
        try { if (L.parent) o.parent = { index: L.parent.index, name: L.parent.name }; } catch (e1) {}
        try { o.threeD = L.threeDLayer; o.blendingMode = L.blendingMode; o.solo = L.solo; o.shy = L.shy; o.locked = L.locked; o.motionBlur = L.motionBlur; o.label = L.label; } catch (e2) {}
        try { if (L.hasTrackMatte) o.trackMatteType = L.trackMatteType; } catch (e3) {}
        try { if (L.source) o.source = { id: L.source.id, name: L.source.name, type: J.itemType(L.source) }; } catch (e4) {}
        try {
            var fx = L.property("ADBE Effect Parade");
            if (fx && fx.numProperties) { o.effects = []; for (var i = 1; i <= fx.numProperties; i++) o.effects.push({ name: fx.property(i).name, matchName: fx.property(i).matchName, enabled: fx.property(i).enabled }); }
        } catch (e5) {}
        if (o.type === "text") { try { o.text = L.property("ADBE Text Properties").property("ADBE Text Document").value.text; } catch (e6) {} }
        if (deep) { var acc = { keys: false, expr: false }; try { scanFlags(L, acc, 0); } catch (e7) {} o.hasKeyframes = acc.keys; o.hasExpressions = acc.expr; }
        return o;
    };
    J.compSummary = function (c, withLayers) {
        var o = { id: c.id, name: c.name, width: c.width, height: c.height, pixelAspect: c.pixelAspect, frameRate: c.frameRate, duration: c.duration,
                  workAreaStart: c.workAreaStart, workAreaDuration: c.workAreaDuration, bgColor: c.bgColor, numLayers: c.numLayers, motionBlur: c.motionBlur, time: c.time };
        try { o.renderer = c.renderer; } catch (e) {}
        try { o.markers = c.markerProperty.numKeys; } catch (e2) {}
        if (withLayers) { o.layers = []; for (var i = 1; i <= c.numLayers && i <= 400; i++) o.layers.push(J.layerSummary(c.layer(i), true)); }
        return o;
    };
    J.itemSummary = function (it) {
        var o = { id: it.id, name: it.name, type: J.itemType(it) };
        try { if (it.parentFolder && it.parentFolder !== app.project.rootFolder) o.folder = it.parentFolder.name; } catch (e) {}
        if (o.type === "comp") { o.width = it.width; o.height = it.height; o.frameRate = it.frameRate; o.duration = it.duration; o.numLayers = it.numLayers; }
        else if (o.type === "footage" || o.type === "solid" || o.type === "placeholder") {
            try { o.width = it.width; o.height = it.height; o.duration = it.duration; } catch (e1) {}
            try { if (it.file) o.file = it.file.fsName; } catch (e2) {}
            try { o.missing = it.footageMissing; } catch (e3) {}
            try { o.usedIn = it.usedIn.length; } catch (e4) {}
        }
        return o;
    };
    J.keyInfo = function (p, k) {
        var o = { time: p.keyTime(k) };
        try { o.value = J.fromAE(p, p.keyValue(k)); } catch (e) {}
        // 注意：ExtendScript 的嵌套三元 a?b:c?d:e 会被按左结合解析（实测 bug），一律改用 if
        var nm = function (t) { if (t == KeyframeInterpolationType.LINEAR) return "linear"; if (t == KeyframeInterpolationType.HOLD) return "hold"; return "bezier"; };
        try { o.interp = [nm(p.keyInInterpolationType(k)), nm(p.keyOutInterpolationType(k))]; } catch (e1) {}
        try { var ei = p.keyInTemporalEase(k), eo = p.keyOutTemporalEase(k); o.ease_in = ei[0].influence; o.ease_out = eo[0].influence; o.speed_in = ei[0].speed; o.speed_out = eo[0].speed; } catch (e2) {}
        return o;
    };
    var NOISE = { "ADBE Position_0": 1, "ADBE Position_1": 1, "ADBE Position_2": 1, "ADBE Effect Built In Params": 1 };
    // 属性树：only_modified 时只保留被改过 / 有关键帧 / 有表达式的属性（大幅减少噪音）
    J.describe = function (p, opt, depth) {
        opt = opt || {};
        var o = { name: p.name, matchName: p.matchName, path: J.path(p) };
        if (opt.only_modified && NOISE[p.matchName]) {   // 精简模式下的已知噪音：未分离时的 XYZ 分量、效果的「合成选项」
            var sep = false; try { sep = p.parentProperty.property("ADBE Position").dimensionsSeparated; } catch (eN) {}
            if (!(sep && p.matchName.indexOf("ADBE Position_") === 0)) return null;
        }
        if (p.propertyType === PropertyType.PROPERTY) {
            var interesting = !opt.only_modified;
            try { if (p.numKeys > 0) interesting = true; } catch (e) {}
            try { if (p.expression !== "") interesting = true; } catch (e1) {}
            try { if (p.isModified) interesting = true; } catch (e2) {}
            if (!interesting) return null;
            try { if (p.propertyValueType !== PropertyValueType.NO_VALUE && p.propertyValueType !== PropertyValueType.CUSTOM_VALUE) o.value = J.fromAE(p, opt.time !== undefined ? p.valueAtTime(opt.time, false) : p.value); else o.custom = true; } catch (e3) {}
            try { if (p.numKeys > 0) { o.numKeys = p.numKeys; if (opt.keyframes !== false) { o.keys = []; for (var k = 1; k <= p.numKeys && k <= 60; k++) o.keys.push(J.keyInfo(p, k)); } } } catch (e4) {}
            try { if (p.expression !== "") { o.expression = p.expression; o.expressionEnabled = p.expressionEnabled; if (p.expressionError) o.expressionError = p.expressionError; } } catch (e5) {}
            try { if (p.dimensionsSeparated) o.dimensionsSeparated = true; } catch (e6) {}
            return o;
        }
        o.group = true;
        try { if (p.propertyType === PropertyType.INDEXED_GROUP) o.indexed = true; } catch (e7) {}
        try { if (p.enabled === false) o.enabled = false; } catch (e8) {}
        if (depth >= (opt.depth || 8)) { o.numChildren = p.numProperties; return o; }
        var kids = [];
        var isEffect = false; try { isEffect = p.parentProperty && p.parentProperty.matchName === "ADBE Effect Parade"; } catch (e9) {}
        var sub = opt; if (isEffect && opt.only_modified) { sub = {}; for (var kk in opt) sub[kk] = opt[kk]; sub.only_modified = false; } // 效果参数全列，方便发现插件参数
        for (var i = 1; i <= p.numProperties; i++) {
            var c = null; try { c = J.describe(p.property(i), sub, depth + 1); } catch (e10) {}
            if (c) kids.push(c);
        }
        if (!kids.length && opt.only_modified) return null;   // 精简模式下空分组不输出
        o.children = kids;
        return o;
    };
    // 任意值转普通对象（供 run_script 返回）
    J.plain = function (v, depth) {
        depth = depth === undefined ? 3 : depth;
        if (v === null || v === undefined) return v;
        var t = typeof v;
        if (t === "number" || t === "string" || t === "boolean") return v;
        if (t === "function") return undefined;
        try {
            if (v instanceof CompItem) return { comp: v.name, id: v.id };
            if (v instanceof FootageItem || v instanceof FolderItem) return J.itemSummary(v);
            if (J.isLayer(v)) return J.layerSummary(v, false);
            if (v instanceof Property) return { property: v.name, matchName: v.matchName, path: J.path(v), value: (function () { try { return J.fromAE(v, v.value); } catch (e) { return undefined; } })() };
            if (v instanceof PropertyGroup) return { group: v.name, matchName: v.matchName, path: J.path(v), numProperties: v.numProperties };
            if (v instanceof TextDocument) return { text: v.text, font: v.font, fontSize: v.fontSize };
            if (v instanceof Shape) return { closed: v.closed, vertexCount: v.vertices.length };
            if (v instanceof File || v instanceof Folder) return v.fsName;
        } catch (e1) {}
        if (depth <= 0) return String(v);
        if (v instanceof Array) { var a = []; for (var i = 0; i < v.length && i < 500; i++) a.push(J.plain(v[i], depth - 1)); return a; }
        var o = {}; for (var k in v) { try { if (v.hasOwnProperty(k)) o[k] = J.plain(v[k], depth - 1); } catch (e2) {} }
        return o;
    };
    return J;
})();

// ====================================================================== 操作
var OPS = {};

OPS.ping = function () { return { pong: true, version: app.version }; };

OPS.status = function () {
    var p = app.project, o = { version: app.version, language: "", project: {} };
    try { o.build = app.buildName; } catch (e) {}
    try { o.language = app.isoLanguage; } catch (e1) {}
    o.project.file = p.file ? p.file.fsName : null;
    o.project.dirty = p.dirty;
    o.project.numItems = p.numItems;
    try { o.project.bitsPerChannel = p.bitsPerChannel; } catch (e2) {}
    try { o.project.expressionEngine = p.expressionEngine; } catch (e3) {}
    if (p.activeItem) o.project.activeItem = { id: p.activeItem.id, name: p.activeItem.name, type: JA.itemType(p.activeItem) };
    var comps = [];
    for (var i = 1; i <= p.numItems; i++) if (p.item(i) instanceof CompItem && comps.length < 60) comps.push({ id: p.item(i).id, name: p.item(i).name, numLayers: p.item(i).numLayers, duration: p.item(i).duration });
    o.project.comps = comps;
    try { o.project.renderQueueItems = p.renderQueue.numItems; o.project.rendering = p.renderQueue.rendering; } catch (e4) {}
    o.capabilities = {};
    try { o.capabilities.effectsListed = app.effects.length; } catch (e5) { o.capabilities.effectsListed = 0; }
    o.capabilities.fontsApi = (function () { try { return app.fonts !== undefined && app.fonts !== null; } catch (e) { return false; } })();
    o.capabilities.saveFrameToPng = (function () {
        for (var j = 1; j <= p.numItems; j++) if (p.item(j) instanceof CompItem) { try { return typeof p.item(j).saveFrameToPng === "function"; } catch (e) { return false; } }
        return "unknown (no comp)";
    })();
    try { o.capabilities.scriptingFileAccess = app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY"); } catch (e6) {}
    return o;
};

OPS.project = function (a) {
    var p = app.project, act = JA.lower(a.action || "info");
    var guard = function () { if (p.dirty && !a.force_discard_unsaved) throw new Error("PROJECT_DIRTY: the open project has unsaved changes. Ask the user to save it, or pass force_discard_unsaved:true only after the user explicitly agrees to discard."); };
    if (act === "info") return { file: p.file ? p.file.fsName : null, dirty: p.dirty, numItems: p.numItems, items: (function () { var r = []; for (var i = 1; i <= p.numItems && i <= 800; i++) r.push(JA.itemSummary(p.item(i))); return r; })() };
    if (act === "new") { guard(); if (p.dirty) p.close(CloseOptions.DO_NOT_SAVE_CHANGES); app.newProject(); return { file: null, created: true }; }
    if (act === "open") {
        guard(); var f = new File(a.path); if (!f.exists) throw new Error("file not found: " + a.path);
        if (p.dirty) p.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        app.open(f); return { file: app.project.file ? app.project.file.fsName : null, numItems: app.project.numItems };
    }
    if (act === "close") { guard(); p.close(a.force_discard_unsaved ? CloseOptions.DO_NOT_SAVE_CHANGES : CloseOptions.PROMPT_TO_SAVE_CHANGES); return { closed: true }; }
    if (act === "save") { if (!p.file) throw new Error("project has never been saved: use action save_as with a path"); p.save(); return { file: p.file.fsName, dirty: p.dirty }; }
    if (act === "save_as") {
        var t = new File(a.path); if (t.exists && !a.overwrite) throw new Error("FILE_EXISTS: " + t.fsName + " (pass overwrite:true only if the user agrees)");
        if (!t.parent.exists) t.parent.create();
        p.save(t); return { file: p.file.fsName, dirty: p.dirty };
    }
    if (act === "reduce" ) { var keep = []; var refs = a.keep_comps || []; for (var r = 0; r < refs.length; r++) keep.push(JA.comp(refs[r])); p.reduceProject(keep); return { numItems: p.numItems }; }
    throw new Error("unknown action: " + a.action);
};

OPS.import = function (a) {
    var out = [], folder = null, p = app.project;
    if (a.folder) { for (var i = 1; i <= p.numItems; i++) if (p.item(i) instanceof FolderItem && p.item(i).name === a.folder) folder = p.item(i); if (!folder) folder = p.items.addFolder(a.folder); }
    var paths = a.paths || [];
    for (var j = 0; j < paths.length; j++) {
        var f = new File(paths[j]); if (!f.exists) throw new Error("file not found: " + paths[j]);
        var io = new ImportOptions(f);
        var as = JA.lower(a.import_as || "footage");
        if (as === "comp" && io.canImportAs(ImportAsType.COMP)) io.importAs = ImportAsType.COMP;
        else if (as === "comp_cropped_layers" && io.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) io.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        if (a.sequence) io.sequence = true;
        var it = p.importFile(io);
        if (folder) it.parentFolder = folder;
        var info = JA.itemSummary(it);
        if (a.add_to_comp !== undefined) {
            var c = JA.comp(a.add_to_comp), L = c.layers.add(it);
            if (a.start_time !== undefined) L.startTime = a.start_time;
            info.layer = JA.layerSummary(L, false);
        }
        out.push(info);
    }
    return { imported: out };
};

OPS.inspect = function (a) {
    var t = JA.lower(a.target || (a.layer !== undefined ? "layer" : (a.comp !== undefined ? "comp" : "project")));
    var opt = { only_modified: a.only_modified !== false, keyframes: a.keyframes !== false, depth: a.depth || 8, time: a.time };
    if (t === "project") return OPS.project({ action: "info" });
    var c = JA.comp(a.comp);
    if (t === "comp") return JA.compSummary(c, true);
    if (t === "markers") { var mk = [], mp = c.markerProperty; for (var m = 1; m <= mp.numKeys; m++) mk.push({ time: mp.keyTime(m), comment: mp.keyValue(m).comment, duration: mp.keyValue(m).duration }); return { comp: c.name, markers: mk }; }
    var L = JA.layer(c, a.layer);
    if (t === "layer") {
        var o = JA.layerSummary(L, true);
        var root = a.property ? JA.prop(L, a.property) : L;
        if (a.property) o.tree = JA.describe(root, opt, 0);
        else { o.tree = []; for (var i = 1; i <= L.numProperties; i++) { var d = null; try { d = JA.describe(L.property(i), opt, 1); } catch (e) {} if (d) o.tree.push(d); } }
        o.note = opt.only_modified ? "only modified/keyframed/expression properties shown (effect params listed in full); pass only_modified:false for everything" : undefined;
        return o;
    }
    throw new Error("unknown target: " + a.target);
};

OPS.find = function (a) {
    var qy = JA.lower(a.query), scope = JA.lower(a.scope || "all"), res = [], p = app.project, lim = a.limit || 200;
    var want = function (s) { return scope === "all" || scope === s; };
    function scanExpr(g, c, L, depth) {
        if (depth > 12 || res.length >= lim) return;
        for (var i = 1; i <= g.numProperties; i++) {
            var pr = g.property(i);
            if (pr.propertyType === PropertyType.PROPERTY) { try { if (pr.expression !== "" && JA.lower(pr.expression).indexOf(qy) >= 0) res.push({ where: "expression", comp: c.name, layer: L.index, layerName: L.name, path: JA.path(pr), expression: pr.expression.substr(0, 300) }); } catch (e) {} }
            else scanExpr(pr, c, L, depth + 1);
        }
    }
    for (var i = 1; i <= p.numItems && res.length < lim; i++) {
        var it = p.item(i);
        if (want("items") && JA.lower(it.name).indexOf(qy) >= 0) res.push({ where: "item", item: JA.itemSummary(it) });
        if (want("footage") && it instanceof FootageItem) { try { if (it.file && JA.lower(it.file.fsName).indexOf(qy) >= 0) res.push({ where: "footage_path", item: JA.itemSummary(it) }); } catch (e) {} }
        if (!(it instanceof CompItem)) continue;
        for (var j = 1; j <= it.numLayers && res.length < lim; j++) {
            var L = it.layer(j);
            if (want("layers") && JA.lower(L.name).indexOf(qy) >= 0) res.push({ where: "layer", comp: it.name, compId: it.id, layer: L.index, layerName: L.name });
            if (want("text") && L instanceof TextLayer) { try { var tx = L.property("ADBE Text Properties").property("ADBE Text Document").value.text; if (JA.lower(tx).indexOf(qy) >= 0) res.push({ where: "text", comp: it.name, compId: it.id, layer: L.index, layerName: L.name, text: tx }); } catch (e1) {} }
            if (want("effects")) { try { var fx = L.property("ADBE Effect Parade"); for (var k = 1; k <= fx.numProperties; k++) { var ef = fx.property(k); if (JA.lower(ef.name).indexOf(qy) >= 0 || JA.lower(ef.matchName).indexOf(qy) >= 0) res.push({ where: "effect", comp: it.name, compId: it.id, layer: L.index, layerName: L.name, effect: ef.name, matchName: ef.matchName, path: JA.path(ef) }); } } catch (e2) {} }
            if (want("expressions")) scanExpr(L, it, L, 0);
        }
    }
    return { query: a.query, scope: scope, count: res.length, truncated: res.length >= lim, results: res };
};

OPS.check = function (a) {
    var p = app.project, r = { missingFootage: [], missingEffects: [], expressionErrors: [], fontsUsed: [], unusedFootage: [], emptyComps: [], queuedRenders: 0 };
    var installed = {}; try { for (var e = 0; e < app.effects.length; e++) installed[app.effects[e].matchName] = true; } catch (eE) {}
    var fonts = {};
    function scan(g, c, L, depth) {
        if (depth > 12) return;
        for (var i = 1; i <= g.numProperties; i++) {
            var pr = g.property(i);
            if (pr.propertyType === PropertyType.PROPERTY) { try { if (pr.expressionEnabled && pr.expressionError) r.expressionErrors.push({ comp: c.name, layer: L.index, layerName: L.name, path: JA.path(pr), error: pr.expressionError }); } catch (e1) {} }
            else scan(pr, c, L, depth + 1);
        }
    }
    var onlyComp = a.comp !== undefined ? JA.comp(a.comp) : null;
    for (var i = 1; i <= p.numItems; i++) {
        var it = p.item(i);
        if (it instanceof FootageItem) {
            try { if (it.footageMissing) r.missingFootage.push(JA.itemSummary(it)); } catch (e2) {}
            try { if (!(it.mainSource instanceof SolidSource) && it.usedIn.length === 0) r.unusedFootage.push({ id: it.id, name: it.name }); } catch (e3) {}
        }
        if (!(it instanceof CompItem)) continue;
        if (onlyComp && it !== onlyComp) continue;
        if (it.numLayers === 0) r.emptyComps.push({ id: it.id, name: it.name });
        for (var j = 1; j <= it.numLayers; j++) {
            var L = it.layer(j);
            try { var fx = L.property("ADBE Effect Parade"); for (var k = 1; k <= fx.numProperties; k++) if (!installed[fx.property(k).matchName]) r.missingEffects.push({ comp: it.name, layer: L.index, layerName: L.name, effect: fx.property(k).name, matchName: fx.property(k).matchName }); } catch (e4) {}
            if (L instanceof TextLayer) { try { var td = L.property("ADBE Text Properties").property("ADBE Text Document").value; fonts[td.font] = (fonts[td.font] || 0) + 1; } catch (e5) {} }
            scan(L, it, L, 0);
        }
    }
    for (var f in fonts) if (fonts.hasOwnProperty(f)) {
        var fe = { font: f, textLayers: fonts[f] };
        try { if (app.fonts && app.fonts.getFontsByPostScriptName) { var hit = app.fonts.getFontsByPostScriptName(f); fe.installed = !!(hit && hit.length); } } catch (e6) {}
        r.fontsUsed.push(fe);
    }
    try { for (var q2 = 1; q2 <= p.renderQueue.numItems; q2++) if (p.renderQueue.item(q2).status === RQItemStatus.QUEUED) r.queuedRenders++; } catch (e7) {}
    r.summary = { missingFootage: r.missingFootage.length, missingEffects: r.missingEffects.length, expressionErrors: r.expressionErrors.length, unusedFootage: r.unusedFootage.length, emptyComps: r.emptyComps.length };
    return r;
};

OPS.discover = function (a) {
    var what = JA.lower(a.what || "effects"), qy = JA.lower(a.query || ""), lim = a.limit || 300, out = [], i;
    if (what === "effects") {
        for (i = 0; i < app.effects.length; i++) {
            var ef = app.effects[i];
            var hay = JA.lower(ef.displayName + " " + ef.matchName + " " + ef.category);
            if (qy && hay.indexOf(qy) < 0) continue;
            if (a.category && JA.lower(ef.category) !== JA.lower(a.category)) continue;
            out.push({ name: ef.displayName, matchName: ef.matchName, category: ef.category });
        }
        var total = out.length; if (out.length > lim) out = out.slice(0, lim);
        return { what: "effects", total: total, returned: out.length, effects: out };
    }
    if (what === "categories") { var cats = {}; for (i = 0; i < app.effects.length; i++) cats[app.effects[i].category] = (cats[app.effects[i].category] || 0) + 1; var cl = []; for (var c in cats) if (cats.hasOwnProperty(c)) cl.push({ category: c, count: cats[c] }); return { what: "categories", categories: cl }; }
    if (what === "fonts") {
        var hasApi = false; try { hasApi = !!app.fonts && !!app.fonts.allFonts; } catch (e) {}
        if (!hasApi) return { what: "fonts", apiAvailable: false };
        var all = app.fonts.allFonts;
        for (i = 0; i < all.length; i++) for (var j = 0; j < all[i].length; j++) {
            var fo = all[i][j]; var h = JA.lower(fo.familyName + " " + fo.styleName + " " + fo.postScriptName);
            if (qy && h.indexOf(qy) < 0) continue;
            out.push({ family: fo.familyName, style: fo.styleName, postScriptName: fo.postScriptName });
        }
        var tot = out.length; if (out.length > lim) out = out.slice(0, lim);
        return { what: "fonts", apiAvailable: true, total: tot, returned: out.length, fonts: out };
    }
    if (what === "render_templates") {
        var rq = app.project.renderQueue, item = null, temp = null, tempComp = null;
        if (rq.numItems > 0) item = rq.item(1);
        else { tempComp = app.project.items.addComp("__ja_probe__", 16, 16, 1, 1, 25); temp = rq.items.add(tempComp); item = temp; }
        var res = { what: "render_templates", renderSettings: item.templates, outputModules: item.outputModule(1).templates };
        if (temp) { temp.remove(); tempComp.remove(); res.note = "a temporary comp was added and removed to read templates; the project is now marked as modified"; }
        return res;
    }
    throw new Error("unknown 'what': " + a.what);
};

OPS.create = function (a) {
    var type = JA.lower(a.type);
    if (type === "comp") {
        var c = app.project.items.addComp(a.name || "Comp 1", a.width || 1920, a.height || 1080, a.pixel_aspect || 1, a.duration || 10, a.fps || 25);
        if (a.bg_color) c.bgColor = JA.color(a.bg_color).slice(0, 3);
        if (a.folder) { var fd = null; for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof FolderItem && app.project.item(i).name === a.folder) fd = app.project.item(i); if (!fd) fd = app.project.items.addFolder(a.folder); c.parentFolder = fd; }
        if (a.open !== false) { try { c.openInViewer(); } catch (e) {} }
        return { comp: JA.compSummary(c, false) };
    }
    var comp = JA.comp(a.comp), L;
    var dur = a.duration || comp.duration;
    if (type === "text") {
        L = comp.layers.addText(a.text || "Text");
        var tp = L.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        try { td.resetCharStyle(); td.resetParagraphStyle(); } catch (e1) {}
        var st = a.style || {}; st.text = a.text || "Text";
        if (st.justification === undefined) st.justification = "center";
        tp.setValue(JA.toAE(tp, st));
    } else if (type === "solid" || type === "adjustment") {
        L = comp.layers.addSolid(JA.color(a.color || "#808080").slice(0, 3), a.name || (type === "adjustment" ? "Adjustment Layer" : "Solid"), a.width || comp.width, a.height || comp.height, comp.pixelAspect, dur);
        if (type === "adjustment") L.adjustmentLayer = true;
    } else if (type === "null") {
        L = comp.layers.addNull(dur);
    } else if (type === "shape") {
        L = comp.layers.addShape();
        var sh = a.shape || {}, kind = JA.lower(sh.kind || "rect");
        var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = sh.name || "Shape 1";
        var gc = function () { return L.property("ADBE Root Vectors Group").property(sh.name || "Shape 1").property("ADBE Vectors Group"); };
        if (kind === "ellipse") { gc().addProperty("ADBE Vector Shape - Ellipse"); gc().property(1).property("ADBE Vector Ellipse Size").setValue(sh.size || [200, 200]); }
        else if (kind === "star" || kind === "polygon") { gc().addProperty("ADBE Vector Shape - Star"); var sr = gc().property(1); sr.property("ADBE Vector Star Type").setValue(kind === "star" ? 1 : 2); sr.property("ADBE Vector Star Points").setValue(sh.points || 5); sr.property("ADBE Vector Star Outer Radius").setValue(sh.outer_radius || 100); if (kind === "star") sr.property("ADBE Vector Star Inner Radius").setValue(sh.inner_radius || 50); }
        else if (kind === "path") { gc().addProperty("ADBE Vector Shape - Group"); var pp = gc().property(1).property("ADBE Vector Shape"); pp.setValue(JA.toAE(pp, sh.path)); }
        else { gc().addProperty("ADBE Vector Shape - Rect"); gc().property(1).property("ADBE Vector Rect Size").setValue(sh.size || [200, 200]); if (sh.roundness) gc().property(1).property("ADBE Vector Rect Roundness").setValue(sh.roundness); }
        if (sh.fill !== null && sh.fill !== false) { gc().addProperty("ADBE Vector Graphic - Fill"); gc().property(gc().numProperties).property("ADBE Vector Fill Color").setValue(JA.color(sh.fill || "#ffffff").slice(0, 3).concat([1])); }
        if (sh.stroke) { gc().addProperty("ADBE Vector Graphic - Stroke"); var sk = gc().property(gc().numProperties); sk.property("ADBE Vector Stroke Color").setValue(JA.color(sh.stroke).slice(0, 3).concat([1])); sk.property("ADBE Vector Stroke Width").setValue(sh.stroke_width || 4); }
    } else if (type === "camera") {
        L = comp.layers.addCamera(a.name || "Camera 1", [comp.width / 2, comp.height / 2]);
        if (a.zoom) L.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(a.zoom);
        if (a.one_node) L.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
    } else if (type === "light") {
        L = comp.layers.addLight(a.name || "Light 1", [comp.width / 2, comp.height / 2]);
        var lt = { parallel: LightType.PARALLEL, spot: LightType.SPOT, point: LightType.POINT, ambient: LightType.AMBIENT };
        if (a.light_type && lt[JA.lower(a.light_type)]) L.lightType = lt[JA.lower(a.light_type)];
        if (a.color) L.property("ADBE Light Options Group").property("ADBE Light Color").setValue(JA.color(a.color).slice(0, 3).concat([1]));
        if (a.intensity !== undefined) L.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(a.intensity);
    } else if (type === "footage" || type === "precomp") {
        L = comp.layers.add(JA.item(a.item));
    } else throw new Error("unknown type: " + a.type + " (comp|text|solid|adjustment|null|shape|camera|light|footage|precomp)");
    if (a.name && type !== "solid" && type !== "adjustment") L.name = a.name;
    if (a.threeD) L.threeDLayer = true;
    if (a.position) JA.setValue(JA.prop(L, "ADBE Transform Group/ADBE Position"), a.position);
    if (a.start_time !== undefined) L.startTime = a.start_time;
    if (a.in_point !== undefined) L.inPoint = a.in_point;
    if (a.out_point !== undefined) L.outPoint = a.out_point;
    if (a.parent !== undefined) L.parent = JA.layer(comp, a.parent);
    if (a.blending_mode) L.blendingMode = BlendingMode[String(a.blending_mode).toUpperCase()];
    return { layer: JA.layerSummary(L, false), comp: comp.name };
};

OPS.set = function (a) {
    var comp = JA.comp(a.comp), layers = JA.layers(comp, a.layers !== undefined ? a.layers : (a.layer !== undefined ? [a.layer] : undefined)), done = [];
    for (var li = 0; li < layers.length; li++) {
        var L = layers[li];
        var at = a.attrs || {};
        if (at.name !== undefined) L.name = at.name;
        if (at.enabled !== undefined) L.enabled = at.enabled;
        if (at.solo !== undefined) L.solo = at.solo;
        if (at.shy !== undefined) L.shy = at.shy;
        if (at.locked !== undefined) L.locked = at.locked;
        if (at.threeD !== undefined) L.threeDLayer = at.threeD;
        if (at.motion_blur !== undefined) L.motionBlur = at.motion_blur;
        if (at.blending_mode !== undefined) L.blendingMode = BlendingMode[String(at.blending_mode).toUpperCase()];
        if (at.parent !== undefined) L.parent = at.parent === null ? null : JA.layer(comp, at.parent);
        if (at.start_time !== undefined) L.startTime = at.start_time;
        if (at.in_point !== undefined) L.inPoint = at.in_point;
        if (at.out_point !== undefined) L.outPoint = at.out_point;
        if (at.stretch !== undefined) L.stretch = at.stretch;
        if (at.label !== undefined) L.label = at.label;
        if (at.adjustment !== undefined) L.adjustmentLayer = at.adjustment;
        if (at.track_matte !== undefined) { var tm = { alpha: TrackMatteType.ALPHA, alpha_inverted: TrackMatteType.ALPHA_INVERTED, luma: TrackMatteType.LUMA, luma_inverted: TrackMatteType.LUMA_INVERTED, none: TrackMatteType.NO_TRACK_MATTE }; L.trackMatteType = tm[JA.lower(at.track_matte)]; }
        if (at.move_to !== undefined) { if (at.move_to === "top") L.moveToBeginning(); else if (at.move_to === "bottom") L.moveToEnd(); else L.moveBefore(JA.layer(comp, at.move_to)); }
        var ch = a.changes || [];
        for (var ci = 0; ci < ch.length; ci++) {
            var c = ch[ci], pr = JA.prop(L, c.property);
            if (c.clear_keyframes) JA.clearKeys(pr);
            if (c.keyframes) JA.applyKeys(pr, c.keyframes, { straight_motion: c.straight_motion });
            if (c.value !== undefined) JA.setValue(pr, c.value, c.time);
            if (c.expression !== undefined) pr.expression = c.expression;
            if (c.expression_enabled !== undefined) pr.expressionEnabled = c.expression_enabled;
            if (c.enabled !== undefined) { try { pr.enabled = c.enabled; } catch (eEn) {} }
            if (c.separate_dimensions !== undefined) pr.dimensionsSeparated = c.separate_dimensions;
            var after = { layer: L.index, property: JA.path(pr), numKeys: pr.numKeys };
            try { after.value = JA.fromAE(pr, pr.value); } catch (eV) {}
            try { if (pr.expressionError) after.expressionError = pr.expressionError; } catch (eX) {}
            done.push(after);
        }
    }
    return { comp: comp.name, layers: layers.length, changed: done };
};

OPS.apply = function (a) {
    var comp = JA.comp(a.comp), layers = JA.layers(comp, a.layers !== undefined ? a.layers : [a.layer]), out = [];
    var mn = null;
    if (a.effect) {
        mn = a.effect;
        var found = false;
        for (var e = 0; e < app.effects.length; e++) if (app.effects[e].matchName === a.effect) { found = true; break; }
        if (!found) for (var e2 = 0; e2 < app.effects.length; e2++) if (JA.lower(app.effects[e2].displayName) === JA.lower(a.effect)) { mn = app.effects[e2].matchName; found = true; break; }
        if (!found) throw new Error("effect not installed: " + a.effect + " (use ae_discover what:'effects' to search)");
    }
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (mn) {
            var fxg = L.property("ADBE Effect Parade");
            if (!fxg.canAddProperty(mn)) throw new Error("effect " + mn + " cannot be added to layer " + L.name);
            var ef = fxg.addProperty(mn);
            var idx = ef.propertyIndex;
            if (a.name) L.property("ADBE Effect Parade").property(idx).name = a.name;
            var params = a.params || {};
            for (var k in params) if (params.hasOwnProperty(k)) {
                var pp = JA.prop(L.property("ADBE Effect Parade").property(idx), [k]);
                var pv = params[k];
                if (pv && typeof pv === "object" && !(pv instanceof Array) && pv.keyframes) JA.applyKeys(pp, pv.keyframes, {});
                else if (pv && typeof pv === "object" && !(pv instanceof Array) && pv.expression) pp.expression = pv.expression;
                else JA.setValue(pp, pv);
            }
            out.push({ layer: L.index, layerName: L.name, effect: JA.describe(L.property("ADBE Effect Parade").property(idx), { only_modified: false, keyframes: true, depth: 4 }, 0) });
        }
        if (a.preset) {
            var pf = new File(a.preset); if (!pf.exists) throw new Error("preset not found: " + a.preset);
            for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
            L.selected = true;
            L.applyPreset(pf);
            out.push({ layer: L.index, layerName: L.name, preset: pf.fsName, effectsNow: JA.layerSummary(L, false).effects });
        }
    }
    return { comp: comp.name, applied: out };
};

OPS.run = function (a) {
    var code = String(a.code || "");
    var DANGER_PROJ = /app\s*\.\s*(newProject|open|quit)\s*\(|\.close\s*\(\s*CloseOptions/;
    if (DANGER_PROJ.test(code) && app.project.dirty && !a.force_discard_unsaved)
        throw new Error("PROJECT_DIRTY: this script would replace/close the open project which has unsaved changes. Ask the user first; pass force_discard_unsaved:true only with explicit consent.");
    if (/system\s*\.\s*callSystem|\.execute\s*\(\s*\)/.test(code) && !a.allow_system)
        throw new Error("BLOCKED: system.callSystem / File.execute run programs outside AE. Pass allow_system:true only if the user explicitly asked for it.");
    var logs = [];
    var log = function () { var parts = []; for (var i = 0; i < arguments.length; i++) parts.push(typeof arguments[i] === "string" ? arguments[i] : JA.stringify(JA.plain(arguments[i], 3))); logs.push(parts.join(" ")); };
    var fn;
    try { fn = eval("(function (log, JA, args) {\n" + code + "\n})"); }
    catch (eS) { var se = new Error("SyntaxError: " + eS.toString()); se.userLine = eS.line ? eS.line - 1 : undefined; se.logs = logs; throw se; }
    var ret;
    try { ret = fn(log, JA, a.args || {}); }
    catch (eR) { var re = new Error(eR.toString()); re.userLine = eR.line ? eR.line - 1 : undefined; re.logs = logs; throw re; }
    return { value: JA.plain(ret, a.depth || 4), logs: logs };
};

OPS.frames = function (a) {
    var c = JA.comp(a.comp), files = [];
    if (typeof c.saveFrameToPng !== "function") throw new Error("comp.saveFrameToPng is not available in this AE version");
    var dir = new Folder(a.dir); if (!dir.exists) dir.create();
    for (var i = 0; i < a.times.length; i++) {
        var t = Math.max(0, Math.min(a.times[i], c.duration - 1 / c.frameRate));
        var f = new File(a.dir + "/" + a.prefix + "_" + i + ".png");
        if (f.exists) f.remove();
        c.saveFrameToPng(t, f);
        files.push({ time: t, file: f.fsName });
    }
    return { comp: c.name, width: c.width, height: c.height, bgColor: c.bgColor, files: files };
};

OPS.render = function (a) {
    var rq = app.project.renderQueue, c = JA.comp(a.comp);
    if (rq.rendering) throw new Error("render queue is already rendering");
    var prev = [];
    for (var i = 1; i <= rq.numItems; i++) { var it = rq.item(i); if (it.status === RQItemStatus.QUEUED) { prev.push(i); it.render = false; } }
    var item = rq.items.add(c), om = item.outputModule(1), used = {};
    function pick(list, patterns) { for (var p = 0; p < patterns.length; p++) for (var j = 0; j < list.length; j++) if (JA.lower(list[j]).indexOf(patterns[p]) >= 0) return list[j]; return null; }
    var rs = a.render_settings || pick(item.templates, ["best", "最佳"]);
    if (rs) { item.applyTemplate(rs); used.renderSettings = rs; }
    var omName = a.output_module;
    if (!omName || omName === "auto") {
        omName = pick(om.templates, ["h.264 - match render settings - 15", "h.264 - 匹配渲染设置 - 15", "h.264"]);
        if (!omName && !a.use_ame) omName = pick(om.templates, ["high quality", "高品质", "lossless", "无损"]);
    }
    if (omName) { om.applyTemplate(omName); used.outputModule = omName; }
    if (a.output) { var of = new File(a.output); if (!of.parent.exists) of.parent.create(); om.file = of; }
    if (a.time_span === "work_area") { item.timeSpanStart = c.workAreaStart; item.timeSpanDuration = c.workAreaDuration; }
    else if (a.time_span && a.time_span.start !== undefined) { item.timeSpanStart = a.time_span.start; item.timeSpanDuration = a.time_span.duration; }
    var t0 = new Date().getTime(), result = { comp: c.name, used: used };
    try {
        if (a.use_ame) { rq.queueInAME(true); result.queuedInAME = true; result.note = "sent to Adobe Media Encoder; encoding continues in AME"; }
        else { rq.render(); }
    } finally {
        for (var k = 0; k < prev.length; k++) { try { rq.item(prev[k]).render = true; } catch (eP) {} }
    }
    result.seconds = Math.round((new Date().getTime() - t0) / 1000);
    try { result.output = om.file.fsName; result.exists = om.file.exists; result.bytes = om.file.exists ? om.file.length : 0; } catch (eF) {}
    try {
        var stv = item.status; result.status = String(stv);
        if (stv == RQItemStatus.DONE) result.status = "done";
        if (stv == RQItemStatus.ERR_STOPPED) result.status = "error";
        if (stv == RQItemStatus.USER_STOPPED) result.status = "stopped";
        if (stv == RQItemStatus.QUEUED) result.status = "queued";
    } catch (eS) {}
    if (!a.use_ame && !result.exists) result.warning = "output file not found after render; check the output module template (" + (omName || "default") + ")";
    return result;
};

OPS.undo = function (a) {
    var id = a.command_id || 16;   // 16 = 编辑 > 撤销（与界面语言无关）；中文菜单名查到的 2371 实测执行后不撤销
    var n = a.steps || 1;
    for (var s = 0; s < n; s++) app.executeCommand(id);
    return { undone: n, commandId: id, dirty: app.project.dirty };
};

// ====================================================================== 入口
function __JA_RUN(job) {
    var res = { ok: false, op: job.op, id: job.id }, t0 = new Date().getTime(), undoOpen = false;
    try { app.beginSuppressDialogs(); } catch (e0) {}
    try {
        if (!OPS[job.op]) throw new Error("unknown op: " + job.op);
        if (job.undo) { app.beginUndoGroup(job.undo); undoOpen = true; }
        res.result = OPS[job.op](job.args || {});
        res.ok = true;
    } catch (e) {
        res.error = e.toString();
        if (e.userLine !== undefined) res.line = e.userLine;   // 只报用户脚本的行号；运行时内部行号对 AI 无意义
        if (e.logs) res.logs = e.logs;
    }
    if (undoOpen) { try { app.endUndoGroup(); } catch (e1) {} }
    try { app.endSuppressDialogs(false); } catch (e2) {}
    try { res.dirty = app.project.dirty; } catch (e3) {}
    res.ms = new Date().getTime() - t0;
    JA.writeFile(job.result, JA.stringify(res));
}
