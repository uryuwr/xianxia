// 《墨途》宣传片一键构建：录制 → 字幕 / 字卡 → 配乐 → 混音 → 合成成片 → 15 秒短版 → 联系表。（按用户要求不配音，只有字幕 + 配乐）
// 用法：
//   node tools/trailer/build.mjs                 全流程（含重录全部镜头）
//   node tools/trailer/build.mjs --no-record     用 work/video/clips 里现有片段，只重做后期
//   node tools/trailer/build.mjs --record=s05_loot,s18_boss   只重录这几个镜头再出片
//   node tools/trailer/build.mjs --only=full|short
//   node tools/trailer/build.mjs --edit=qingya [--no-record | --record=q03_crash]   另一支片子：剪辑表 edit_<名>.mjs、镜头表 shots_<名>.mjs，产物放 E.outDir（青牙片 → release/）
// 产物：work/video/墨途_宣传_v1.mp4、work/video/墨途_宣传_15s.mp4、work/video/contact_sheet.png、work/video/build/<名>/timeline.json
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, VIDEO, FPS, ffmpegPath, launch, Rec } from "./lib.mjs";
import { SUB_RULE } from "./edit.mjs";

const args = process.argv.slice(2);
const opt = (k) => {
  const a = args.find((x) => x === "--" + k || x.startsWith("--" + k + "="));
  return a ? (a.includes("=") ? a.split("=")[1] : !0) : null;
};
const HERE = path.join(ROOT, "tools", "trailer");
const EDIT = opt("edit");
const { FULL, SHORT } = await import(EDIT ? `./edit_${EDIT}.mjs` : "./edit.mjs");
const CLIPS = path.join(VIDEO, "clips");
const AUDIO = path.join(VIDEO, "audio");
const PY = process.env.PYTHON || "python";
fs.mkdirSync(AUDIO, { recursive: !0 });

const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", maxBuffer: 1 << 28, ...o });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} 失败（${r.status}）：\n${(r.stderr || "").slice(-3000)}\n${(r.stdout || "").slice(-1500)}`);
  return r.stdout;
};
const log = (...a) => console.log("[build]", ...a);

// ---------- 0. 工具 ----------
function setup() {
  try {
    return ffmpegPath();
  } catch {
    log("安装 imageio-ffmpeg（自带 ffmpeg）到 work/video/bin/pydeps …");
    run(PY, ["-m", "pip", "install", "--target", path.join(VIDEO, "bin", "pydeps"), "imageio-ffmpeg"], { stdio: "inherit" });
    return ffmpegPath();
  }
}
const FF = setup();
const probeDur = (f) => {
  const m = spawnSync(FF, ["-hide_banner", "-i", f], { encoding: "utf8" }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

// ---------- 1. 录制 ----------
const rec = opt("record");
if (!opt("no-record")) {
  const shots = typeof rec === "string" ? rec.split(",") : [];
  log("录制", shots.length ? shots.join(" ") : "全部镜头");
  const r = spawnSync(process.execPath, [path.join(HERE, "record.mjs"), ...shots], { stdio: "inherit", env: { ...process.env, ...(EDIT ? { TRAILER_TABLE: EDIT } : {}) } });
  if (r.status !== 0) log("⚠ 有镜头录制失败，继续用已有片段出片（见上方日志）");
}

// ---------- 2. 时间线 ----------
function clipInfo(name) {
  const j = path.join(CLIPS, name + ".json");
  if (!fs.existsSync(j)) throw new Error("缺少片段 " + name + "（先录制）");
  return JSON.parse(fs.readFileSync(j, "utf8"));
}
function timeline(E) {
  let t = 0;
  const segs = E.segs.map((s) => {
    if (s.grid) {
      // 2×2 分屏：四个片段各自从标记 at + from 起取 dur 秒
      const cells = s.grid.map((g) => {
        const c = clipInfo(g.clip);
        const m = g.at === 0 || g.at == null ? 0 : c.marks[g.at] ?? (console.warn(`[build] ⚠ ${g.clip} 没有标记 ${g.at}，按 0 处理`), 0);
        const a = Math.max(0, Math.min(m + (g.from || 0), c.sec - s.dur - 1 / FPS));
        return { file: path.join(CLIPS, c.file), in: +a.toFixed(3), marks: c.marks };
      });
      const o = { ...s, cells, file: cells[0].file, in: cells[0].in, dur: s.dur, start: +t.toFixed(3), marks: cells[0].marks };
      t += s.dur;
      return o;
    }
    const c = clipInfo(s.clip);
    const mk = (k) => (k === 0 || k == null ? 0 : c.marks[k] ?? (console.warn(`[build] ⚠ ${s.clip} 没有标记 ${k}，按 0 处理`), 0));
    const base = mk(s.at);
    let a = base + s.from;
    let b = s.to != null ? base + s.to : mk(s.toAt) + (s.toOff || 0);
    a = Math.max(0, a);
    b = Math.min(c.sec - 1 / FPS, b);
    const dur = Math.round((b - a) * FPS) / FPS;
    const o = { ...s, file: path.join(CLIPS, c.file), in: +a.toFixed(3), dur, start: +t.toFixed(3), marks: c.marks };
    t += dur;
    return o;
  });
  const endStart = t;
  const total = t + (E.end ? E.end.freeze : 0);
  const segAt = (key) => (key === "@end" ? { start: endStart, in: 0, marks: {} } : segs.find((s) => s.key === key));
  // 片段里的标记 → 成片时间
  const markT = (key, mark, off = 0) => {
    const s = segAt(key);
    if (!s) throw new Error("剪辑表里没有段 " + key);
    const m = mark ? s.marks[mark] : s.in;
    return s.start + ((m ?? s.in) - s.in) + off;
  };
  return { segs, endStart, total, segAt, markT };
}

// ---------- 3. 字幕排期（规则见 edit.mjs 的 SUB_RULE）----------
const subLen = (t) => [...t.replace(/\//g, "")].filter((c) => !/\s/.test(c)).length;
function planSubs(E, T) {
  const R = SUB_RULE;
  const cards = (E.cards || []).map((c) => ({ t: T.segAt(c.seg).start + c.off, dur: Math.max(R.cardMin, c.dur) }));
  // "关键镜头"：字卡出现、片尾——字幕不能拖过它们
  const keyStarts = [...cards.map((c) => c.t), T.endStart].sort((a, b) => a - b);
  let prevEnd = -9;
  return E.subs.map((v, i) => {
    const lines = v.text.split("/");
    if (lines.length > R.maxLines || lines.some((l) => [...l].length > R.maxLine)) console.warn(`[build] ⚠ 字幕 ${i + 1} 超出版式（≤${R.maxLines} 行、每行 ≤${R.maxLine} 字）：${v.text}`);
    const dur = Math.max(R.min, R.base + subLen(v.text) * R.perChar);
    let t = T.segAt(v.seg).start + v.off;
    if (t < prevEnd + R.gap) (console.warn(`[build] ⚠ 字幕 ${i + 1} 与上一条间隔不足，顺延 ${(prevEnd + R.gap - t).toFixed(2)}s`), (t = prevEnd + R.gap));
    for (const c of cards) if (t < c.t + c.dur && t + dur > c.t) console.warn(`[build] ⚠ 字幕 ${i + 1}「${v.text}」与字卡（${c.t.toFixed(1)}s）同屏`);
    const next = keyStarts.find((k) => k > t + 0.01);
    if (next != null && t + dur > next + 0.01) console.warn(`[build] ⚠ 字幕 ${i + 1}「${v.text}」拖过关键镜头（${next.toFixed(1)}s）${(t + dur - next).toFixed(2)}s`);
    prevEnd = t + dur;
    return { ...v, t: +t.toFixed(3), dur: +dur.toFixed(3) };
  });
}

// ---------- 4. 字幕 / 字卡 / 片尾（浏览器里用游戏的水墨 UI 套件渲染，透明底）----------
async function overlays(E, items, dir) {
  fs.mkdirSync(dir, { recursive: !0 });
  const S = await launch({});
  const tab = await S.open({});
  const R = new Rec(S, tab, dir);
  await tab.page.goto(S.base + "tools/trailer/overlay.html");
  await tab.page.waitForFunction(() => typeof window.__show === "function");
  await tab.cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const o of items) {
    if (o.kind === "sub" || o.kind === "grid" || o.static) {
      await R.ev((o) => window.__vt.end() || window.__show(o), o);
      await tab.page.evaluate(() => document.fonts.ready);
      await tab.page.waitForTimeout(60);
      await tab.page.screenshot({ path: o.file, omitBackground: o.kind !== "paper" });
      continue;
    }
    // 动画：逐帧推进虚拟时钟，PNG（带透明）→ mov
    await R.ev(() => window.__vt.end());
    await R.ev((o) => window.__show(o), o);
    await tab.page.evaluate(() => document.fonts.ready);
    await tab.page.waitForTimeout(80);
    await R.ev(() => (window.__vt.begin(), window.__vt.restartAnims()));
    const { spawn } = await import("node:child_process");
    const ff = spawn(FF, ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-c:v", "png", "-pix_fmt", "rgba", o.file], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((r) => ff.on("close", r));
    const n = Math.round(o.dur * FPS);
    for (let i = 0; i < n; i++) {
      await R.ev(() => window.__vt.step(1000 / 30));
      const buf = await tab.page.screenshot({ omitBackground: !0, scale: "device" });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;
  }
  await S.close();
}

// ---------- 5. 合成 ----------
async function build(E) {
  const B = path.join(VIDEO, "build", E.name);
  fs.mkdirSync(B, { recursive: !0 });
  const T = timeline(E);
  log(E.name, `共 ${T.segs.length} 段，成片 ${T.total.toFixed(2)} 秒`);

  const subsT = planSubs(E, T);

  // 叠加层
  const ovDir = path.join(B, "ov");
  const subs = subsT.map((v, i) => ({ kind: "sub", text: v.text, t: v.t, dur: v.dur, file: path.join(ovDir, `sub_${i}.png`) }));
  const cards = (E.cards || []).map((c, i) => {
    const dur = Math.max(SUB_RULE.cardMin, c.dur);
    return { kind: "card", ...c, dur, t: T.segAt(c.seg).start + c.off, out: dur - 0.4, file: path.join(ovDir, `card_${i}.mov`) };
  });
  const endO = E.end ? [{ kind: "end", ...E.end, t: T.endStart, dur: E.end.freeze, file: path.join(ovDir, "end.mov") }] : [];
  const grids = T.segs.filter((s) => s.grid && s.labels).map((s, i) => ({ kind: "grid", static: !0, labels: s.labels, t: s.start, dur: s.dur, file: path.join(ovDir, `grid_${i}.png`) }));
  const OV = [...grids, ...cards, ...subs, ...endO];
  const frameO = [{ kind: "paper", file: path.join(ovDir, "paper.png") }, { kind: "border", file: path.join(ovDir, "border.png") }];
  await overlays(E, [...frameO.map((o) => ({ ...o, static: !0 })), ...OV], ovDir);

  // 配乐（段落起点来自剪辑表）
  const M = E.music;
  const at = (x) => (Array.isArray(x) ? (typeof x[1] === "string" ? T.markT(x[0], x[1], x[2] || 0) : T.segAt(x[0]).start + x[1]) : T.segAt(x).start); // [段, 标记, 偏移]
  const cues = { dur: +T.total.toFixed(3), title: at(M.title), sec: { world: at(M.world), cave: at(M.cave), battle: at(M.battle), boss: at(M.boss), kill: at(M.kill), outro: at(M.outro) } };
  fs.writeFileSync(path.join(B, "cues.json"), JSON.stringify(cues, null, 1));
  const music = path.join(B, "music.wav");
  const sfxDir = path.join(AUDIO, "sfx");
  run(PY, [path.join(HERE, "music.py"), path.join(B, "cues.json"), music, sfxDir]);

  // 混音
  const sfx = (E.sfx || []).map((s) => ({ file: path.join(sfxDir, s.file + ".wav"), t: +T.markT(s.seg, s.at, s.off).toFixed(3), gain: s.gain }));
  for (const c of cards) sfx.push({ file: path.join(sfxDir, "stamp.wav"), t: +(c.t + (E.cardStamp ?? 0.35)).toFixed(3), gain: 0.4 });
  const spec = { dur: T.total, music: { file: music, gain: 0.85 }, vo: [], sfx, duck: 0 };
  fs.writeFileSync(path.join(B, "mix.json"), JSON.stringify(spec, null, 1));
  const mixWav = path.join(B, "mix.wav");
  run(PY, [path.join(HERE, "mix.py"), "mix", path.join(B, "mix.json"), mixWav]);

  // 画面
  const a = [];
  const fc = [];
  // 输入编号：普通段 1 个、分屏段 4 个
  let ii = 0;
  T.segs.forEach((s, i) => {
    const last = i === T.segs.length - 1 && E.end;
    const tail = `,format=yuv420p${last ? `,tpad=stop_mode=clone:stop_duration=${E.end.freeze}` : ""}`;
    if (s.cells) {
      s.cells.forEach((c, k) => {
        a.push("-ss", String(c.in), "-t", String(s.dur), "-i", c.file);
        fc.push(`[${ii}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=960:540,setsar=1[g${i}_${k}]`);
        ii++;
      });
      fc.push(`[g${i}_0][g${i}_1][g${i}_2][g${i}_3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,setsar=1${tail}[s${i}]`);
      return;
    }
    a.push("-ss", String(s.in), "-t", String(s.dur), "-i", s.file);
    fc.push(`[${ii}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=1920:1080,setsar=1${tail}[s${i}]`);
    ii++;
  });
  fc.push(`${T.segs.map((_, i) => `[s${i}]`).join("")}concat=n=${T.segs.length}:v=1:a=0[cat]`);
  // 宣纸画框：实机画面等比缩到 1728×972 放在上方居中，底部 92px 宣纸字幕带
  let idx = ii;
  a.push("-loop", "1", "-framerate", String(FPS), "-t", T.total.toFixed(3), "-i", frameO[0].file);
  a.push("-loop", "1", "-framerate", String(FPS), "-t", T.total.toFixed(3), "-i", frameO[1].file);
  fc.push(`[cat]scale=1728:972:flags=lanczos[game]`);
  fc.push(`[${idx}:v]format=yuv420p[paper]`);
  fc.push(`[paper][game]overlay=96:16:shortest=1[pg]`);
  fc.push(`[${idx + 1}:v]format=rgba[bd]`);
  fc.push(`[pg][bd]overlay=0:0:shortest=1,fade=t=in:st=0:d=${E.fadeIn || 0.5},fade=t=out:st=${(T.total - 0.5).toFixed(3)}:d=0.5[v0]`);
  idx += 2;
  let cur = "v0";
  OV.forEach((o, j) => {
    if (o.kind === "grid") {
      a.push("-loop", "1", "-framerate", String(FPS), "-t", o.dur.toFixed(3), "-i", o.file);
      fc.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,setpts=PTS-STARTPTS+${o.t.toFixed(3)}/TB[o${j}]`);
    } else if (o.kind === "sub") {
      a.push("-loop", "1", "-framerate", String(FPS), "-t", o.dur.toFixed(3), "-i", o.file);
      fc.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${(o.dur - 0.25).toFixed(3)}:d=0.25:alpha=1,setpts=PTS-STARTPTS+${o.t.toFixed(3)}/TB[o${j}]`);
    } else {
      a.push("-i", o.file);
      fc.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${o.t.toFixed(3)}/TB[o${j}]`);
    }
    fc.push(`[${cur}][o${j}]overlay=0:0:eof_action=pass:enable='between(t,${o.t.toFixed(3)},${(o.t + o.dur).toFixed(3)})'[c${j}]`);
    cur = `c${j}`;
    idx++;
  });
  a.push("-i", mixWav);
  fc.push(`[${idx}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`);
  fc.push(`[${cur}]format=yuv420p[vout]`);
  const fcFile = path.join(B, "filter.txt");
  fs.writeFileSync(fcFile, fc.join(";\n"));
  const outDir = E.outDir ? path.join(ROOT, E.outDir) : VIDEO;
  fs.mkdirSync(outDir, { recursive: !0 });
  const outFile = path.join(outDir, E.name + ".mp4");
  run(FF, ["-y", "-hide_banner", "-loglevel", "error", ...a, "-/filter_complex", fcFile, "-map", "[vout]", "-map", "[aout]", "-t", T.total.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outFile]);
  log("✓", outFile, probeDur(outFile).toFixed(2) + "s");

  // 时间线（剪辑稿与汇报用）
  const tl = {
    name: E.name, total: +T.total.toFixed(2),
    segs: T.segs.map((s) => ({ key: s.key, clip: s.clip, in: s.in, dur: s.dur, start: s.start, note: s.note || "" })),
    end: E.end ? { start: +T.endStart.toFixed(2), dur: E.end.freeze } : null,
    subs: subsT.map((v) => ({ t: v.t, dur: v.dur, text: v.text })),
    cards: cards.map((c) => ({ t: +c.t.toFixed(2), dur: c.dur, text: (c.html || c.text).replace(/<[^>]+>/g, "") })),
    cues,
  };
  fs.writeFileSync(path.join(B, "timeline.json"), JSON.stringify(tl, null, 2));
  return { outFile, tl };
}

// ---------- 6. 联系表 ----------
function contactSheet(file, out, step = 3, cols = 6) {
  const dur = probeDur(file);
  const n = Math.floor(dur / step);
  const rows = Math.ceil(n / cols);
  run(FF, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", `fps=1/${step},scale=400:-1,drawtext=text='%{pts\\:hms}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4,pad=iw+8:ih+8:4:4:color=0xece6d6,tile=${cols}x${rows}:color=0xece6d6`, "-frames:v", "1", out]);
  log("✓ 联系表", out);
}

const only = opt("only");
const outs = [];
if (!only || only === "full") outs.push(await build(FULL));
if (SHORT && (!only || only === "short")) outs.push(await build(SHORT));
const fullDir = FULL.outDir ? path.join(ROOT, FULL.outDir) : VIDEO;
const full = path.join(fullDir, FULL.name + ".mp4");
if (fs.existsSync(full)) contactSheet(full, path.join(fullDir, EDIT ? FULL.name + "_联系表.png" : "contact_sheet.png"));
for (const o of outs) {
  console.log(`\n== ${o.tl.name}（${o.tl.total}s）==`);
  for (const s of o.tl.segs) console.log(`${s.start.toFixed(1).padStart(5)}s  ${s.key.padEnd(9)} ${s.dur.toFixed(1)}s  ${s.note}`);
  for (const v of o.tl.subs) console.log(`  字幕 ${v.t.toFixed(1)}s +${v.dur.toFixed(1)}  ${v.text}`);
  for (const c of o.tl.cards) console.log(`  字卡 ${c.t.toFixed(1)}s +${c.dur.toFixed(1)}  ${c.text}`);
}
