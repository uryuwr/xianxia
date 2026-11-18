// 水墨 UI 套件 · 程序化笔触生成器
// 用固定种子生成笔触、圆相（墨圈）、印章、墨点等形状，输出为 CSS 自定义属性（SVG data URI），
// 统一当作 mask-image 使用——形状只决定透明度，颜色由 background-color 决定，所以一套形状可以染成任何颜色。
// 不依赖任何图片文件。用法：node tools/ui_kit_gen.mjs  → docs/ui/v2/kit/strokes.css
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "ui", "v2", "kit", "strokes.css");

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// 平滑噪声（一维），用于边缘起伏
function noise1(r, n = 16) {
  const k = Array.from({ length: n + 1 }, () => r() * 2 - 1);
  return (t) => {
    const x = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return k[i] * (1 - u) + k[i + 1] * u;
  };
}
const f1 = (v) => +v.toFixed(1);
const svg = (w, h, body, par = "none") =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='${par}'>${body}</svg>`;
const uri = (s) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;

// ---------------- 横向笔触 ----------------
// 起笔顿压（略粗的圆头）→ 行笔（宽度轻微起伏、边缘毛糙）→ 收笔出锋（变细，尾部飞白）
function brush({ w = 600, h = 60, seed = 1, press = 1.12, taper = 0.18, dry = 0.35, curve = 0.08, rough = 0.08, tail = "point" }) {
  const r = rng(seed), nTop = noise1(r, 24), nBot = noise1(r, 24), nW = noise1(r, 6), nC = noise1(r, 4);
  const N = 90, pad = h * 0.18, half = h * 0.42;
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = pad + t * (w - pad * 2);
    const cy = h / 2 + nC(t) * h * curve;
    // 宽度轮廓
    let p = 0.86 + 0.14 * nW(t);
    if (t < 0.07) p *= 0.55 + 0.45 * Math.sin((t / 0.07) * Math.PI * 0.5) * press; // 起笔圆头
    else if (t < 0.14) p *= press - (press - 1) * ((t - 0.07) / 0.07);
    if (t > 1 - taper) {
      const k = (t - (1 - taper)) / taper;
      p *= tail === "blunt" ? 1 - 0.45 * k * k : 1 - 0.92 * Math.pow(k, 1.25);
    }
    const hw = half * p;
    top.push([x, cy - hw * (1 + nTop(t) * rough)]);
    bot.push([x, cy + hw * (1 + nBot(t) * rough)]);
  }
  // 起笔端的圆弧
  const startCap = [];
  for (let k = 1; k < 8; k++) {
    const a = Math.PI / 2 + (k / 8) * Math.PI;
    const t0 = top[0], b0 = bot[0], cy = (t0[1] + b0[1]) / 2, rr = (b0[1] - t0[1]) / 2;
    startCap.push([t0[0] + Math.cos(a) * rr * 0.6, cy - Math.sin(a) * rr]);
  }
  const pts = [...top, ...bot.reverse(), ...startCap];
  let d = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
  // 飞白：尾段用若干细长空隙"挖"掉，模拟干笔
  let gaps = "", hairs = "";
  const G = Math.round(10 + dry * 34);
  for (let g = 0; g < G; g++) {
    // 每根干笔丝：从行笔后段开始，沿中线方向延伸到收笔处，粗细不一，断续
    const lane = (r() * 2 - 1) * 0.9;
    const xs = pad + (1 - taper - dry * (0.4 + r() * 0.6)) * (w - pad * 2);
    const xe = w - pad * (0.2 + r() * 0.8);
    const y0 = h / 2 + lane * half * 0.95, y1 = h / 2 + lane * half * 0.25;
    const dash = `stroke-dasharray='${f1(20 + r() * 120)} ${f1(4 + r() * 18)}'`;
    gaps += `<path d='M${f1(xs)} ${f1(y0)}Q${f1((xs + xe) / 2)} ${f1((y0 + y1) / 2 + (r() - 0.5) * 3)} ${f1(xe)} ${f1(y1)}' fill='none' stroke='black' stroke-width='${f1(0.5 + r() * r() * 2.4)}' ${dash} stroke-linecap='round'/>`;
  }
  // 露锋毫毛：收笔处延伸出的几根细丝
  for (let g = 0; g < 4 + dry * 6; g++) {
    const t0 = 1 - taper * (0.2 + r() * 0.5), x0 = pad + t0 * (w - pad * 2), y0 = h / 2 + (r() * 2 - 1) * half * 0.35;
    hairs += `<path d='M${f1(x0)} ${f1(y0)}l${f1(w * (0.03 + r() * 0.06))} ${f1((r() - 0.5) * h * 0.25)}' stroke='black' stroke-width='${f1(0.6 + r() * 1.1)}' stroke-linecap='round' fill='none'/>`;
  }
  return svg(w, h, `<defs><mask id='m'><rect width='${w}' height='${h}' fill='white'/>${gaps}</mask></defs><path d='${d}' fill='black' mask='url(#m)'/>${hairs}`);
}

// ---------------- 圆相（墨圈） ----------------
// 一笔画成的圆：起笔重、绕行约 320°、收笔出锋留缺口；用于物品格、技能格、撤离读条
function enso({ size = 200, seed = 1, sweep = 320, width = 0.11, wobble = 0.03, start = -100, dry = 0.45 }) {
  const r = rng(seed), nR = noise1(r, 10), nW = noise1(r, 8), nE = noise1(r, 30);
  const c = size / 2, R = size * 0.38, W = size * width;
  const N = 120, outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = ((start + t * sweep) * Math.PI) / 180;
    const rr = R * (1 + nR(t) * wobble);
    let p = 0.8 + 0.2 * nW(t);
    if (t < 0.08) p *= 0.6 + 0.6 * (t / 0.08);
    else if (t < 0.18) p *= 1.2 - 0.2 * ((t - 0.08) / 0.1);
    if (t > 0.72) p *= 1 - 0.9 * Math.pow((t - 0.72) / 0.28, 1.3);
    const hw = (W / 2) * p;
    outer.push([c + Math.cos(a) * (rr + hw * (1 + nE(t) * 0.12)), c + Math.sin(a) * (rr + hw * (1 + nE(t) * 0.12))]);
    inner.push([c + Math.cos(a) * (rr - hw), c + Math.sin(a) * (rr - hw)]);
  }
  const pts = [...outer, ...inner.reverse()];
  const d = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
  let gaps = "";
  for (let g = 0; g < 16 * dry; g++) {
    const t = 0.55 + r() * 0.45, a0 = ((start + t * sweep) * Math.PI) / 180, a1 = a0 + ((0.05 + r() * 0.25) * Math.PI) / 2;
    const rr = R + (r() * 2 - 1) * W * 0.4;
    gaps += `<path d='M${f1(c + Math.cos(a0) * rr)} ${f1(c + Math.sin(a0) * rr)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(c + Math.cos(a1) * rr)} ${f1(c + Math.sin(a1) * rr)}' fill='none' stroke='black' stroke-width='${f1(0.6 + r() * 1.4)}' stroke-linecap='round'/>`;
  }
  return svg(size, size, `<defs><mask id='m'><rect width='${size}' height='${size}' fill='white'/>${gaps}</mask></defs><path d='${d}' fill='black' mask='url(#m)'/>`);
}

// ---------------- 印章 ----------------
// 方印 / 圆印 / 椭圆印：边缘不规则、带少量崩缺（印泥不匀），用作按钮、品质角标、标题落款
function seal({ size = 120, seed = 1, shape = "square", erode = 1 }) {
  const r = rng(seed), n = noise1(r, 40);
  const c = size / 2, R = size * 0.46;
  const N = 160, pts = [];
  for (let i = 0; i < N; i++) {
    const t = i / N, a = t * Math.PI * 2;
    let rr;
    if (shape === "round") rr = R;
    else if (shape === "oval") rr = R / Math.sqrt(Math.pow(Math.cos(a) / 0.72, 2) + Math.pow(Math.sin(a), 2)) ;
    else {
      // 圆角方形（超椭圆）
      const e = 8, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      rr = R / Math.pow(Math.pow(cs, e) + Math.pow(sn, e), 1 / e);
    }
    rr *= 1 + n(t) * 0.025 + (r() < 0.04 ? -r() * 0.05 : 0);
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }
  const d = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
  let holes = "";
  for (let k = 0; k < 18 * erode; k++) {
    const a = r() * Math.PI * 2, edge = r() < 0.75;
    const rr2 = edge ? R * (0.92 + r() * 0.12) : R * r() * 0.85;
    const x = c + Math.cos(a) * rr2, y = c + Math.sin(a) * rr2;
    holes += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(edge ? 0.8 + r() * 3 : 0.3 + r() * 0.9)}' fill='black'/>`;
  }
  return svg(size, size, `<defs><mask id='m'><rect width='${size}' height='${size}' fill='white'/>${holes}</mask></defs><path d='${d}' fill='black' mask='url(#m)'/>`);
}

// 印章外框（用于朱文印：只有一圈粗糙边框）
function sealFrame({ size = 120, seed = 1, shape = "square", width = 0.07 }) {
  const r = rng(seed), n = noise1(r, 40);
  const c = size / 2, R = size * 0.46;
  const ring = (k) => {
    const pts = [];
    for (let i = 0; i < 160; i++) {
      const t = i / 160, a = t * Math.PI * 2;
      let rr = shape === "round" ? R : R / Math.pow(Math.pow(Math.abs(Math.cos(a)), 8) + Math.pow(Math.abs(Math.sin(a)), 8), 1 / 8);
      rr = rr * k * (1 + n(t) * 0.03);
      pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
    }
    return "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
  };
  return svg(size, size, `<path d='${ring(1)}${ring(1 - width * 2)}' fill='black' fill-rule='evenodd'/>`);
}

// ---------------- 墨点 / 泼墨 ----------------
function splash({ size = 300, seed = 1, drops = 14, spread = 1 }) {
  const r = rng(seed), n = noise1(r, 24);
  const c = size / 2, R = size * 0.26;
  let body = "";
  const pts = [];
  for (let i = 0; i < 120; i++) {
    const t = i / 120, a = t * Math.PI * 2;
    const rr = R * (1 + n(t) * 0.2 + (r() < 0.04 ? r() * 0.18 : 0));
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }
  body += `<path d='M${pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}Z' fill='black'/>`;
  for (let k = 0; k < drops; k++) {
    const a = r() * Math.PI * 2, d = R * (1.15 + r() * 0.9 * spread), rr = 1 + r() * r() * size * 0.04;
    body += `<circle cx='${f1(c + Math.cos(a) * d)}' cy='${f1(c + Math.sin(a) * d)}' r='${f1(rr)}' fill='black'/>`;
  }
  return svg(size, size, body);
}

// ---------------- 宣纸毛边（撕纸边） ----------------
// 生成"四边不规则"的纸片蒙版，preserveAspectRatio=none 拉伸到面板大小（边缘起伏仍然自然）
function deckle({ w = 1000, h = 700, seed = 1, amp = 7, inset = 10 }) {
  const r = rng(seed);
  const edge = (len, nn) => {
    const n = noise1(r, nn), m = noise1(r, nn * 4);
    return (t) => (n(t) * 0.6 + m(t) * 0.4) * amp + (r() < 0.03 ? -r() * amp * 0.8 : 0);
  };
  const eT = edge(w, 30), eR = edge(h, 22), eB = edge(w, 30), eL = edge(h, 22);
  const pts = [], N = 140, M = 100;
  for (let i = 0; i <= N; i++) pts.push([inset + (i / N) * (w - inset * 2), inset + eT(i / N)]);
  for (let i = 0; i <= M; i++) pts.push([w - inset + eR(i / M), inset + (i / M) * (h - inset * 2)]);
  for (let i = N; i >= 0; i--) pts.push([inset + (i / N) * (w - inset * 2), h - inset + eB(i / N)]);
  for (let i = M; i >= 0; i--) pts.push([inset + eL(i / M), inset + (i / M) * (h - inset * 2)]);
  return svg(w, h, `<path d='M${pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L")}Z' fill='black'/>`);
}

// ---------------- 云纹（角饰） ----------------
function cloud({ size = 120, seed = 1 }) {
  // 一个卷云：两段螺旋 + 收尾，笔画用描边
  const s = size;
  const d = `M${s * 0.08} ${s * 0.78} C ${s * 0.1} ${s * 0.45}, ${s * 0.45} ${s * 0.38}, ${s * 0.5} ${s * 0.58} C ${s * 0.54} ${s * 0.74}, ${s * 0.34} ${s * 0.78}, ${s * 0.32} ${s * 0.64} C ${s * 0.3} ${s * 0.54}, ${s * 0.42} ${s * 0.52}, ${s * 0.44} ${s * 0.6}
    M${s * 0.5} ${s * 0.58} C ${s * 0.56} ${s * 0.3}, ${s * 0.92} ${s * 0.28}, ${s * 0.9} ${s * 0.56} C ${s * 0.89} ${s * 0.72}, ${s * 0.7} ${s * 0.72}, ${s * 0.7} ${s * 0.6} C ${s * 0.7} ${s * 0.52}, ${s * 0.8} ${s * 0.5}, ${s * 0.81} ${s * 0.58}`;
  return svg(size, size, `<path d='${d}' fill='none' stroke='black' stroke-width='${f1(size * 0.045)}' stroke-linecap='round'/>`);
}

// ---------------- 米字格 / 田字格（储物袋格子底纹） ----------------
function gridCell({ size = 100, mi = !0 }) {
  const s = size, dash = `stroke-dasharray='${f1(s * 0.04)} ${f1(s * 0.035)}'`;
  let b = `<rect x='1' y='1' width='${s - 2}' height='${s - 2}' fill='none' stroke='black' stroke-width='1.6'/>`;
  b += `<path d='M${s / 2} 2V${s - 2}M2 ${s / 2}H${s - 2}' stroke='black' stroke-width='.8' ${dash}/>`;
  if (mi) b += `<path d='M2 2L${s - 2} ${s - 2}M${s - 2} 2L2 ${s - 2}' stroke='black' stroke-width='.6' ${dash}/>`;
  return svg(s, s, b, "xMidYMid meet");
}

// ---------------- 墨晕（无边的淡墨团，作 HUD 底衬） ----------------
function wash({ w = 600, h = 300, seed = 1, cx = 0.45, cy = 0.5, rx = 0.42, ry = 0.38 }) {
  const body = `<defs><filter id='f' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='.012 .02' numOctaves='4' seed='${seed}'/><feDisplacementMap in='SourceGraphic' scale='90'/><feGaussianBlur stdDeviation='14'/></filter>
  <radialGradient id='g'><stop offset='0' stop-opacity='1'/><stop offset='.55' stop-opacity='.75'/><stop offset='1' stop-opacity='0'/></radialGradient></defs>
  <ellipse cx='${w * cx}' cy='${h * cy}' rx='${w * rx}' ry='${h * ry}' fill='url(#g)' filter='url(#f)'/>`;
  return svg(w, h, body);
}
// ---------------- 扇面（环形扇区） ----------------
function fan({ w = 400, h = 240, a0 = 210, a1 = 330, r0 = 0.38 }) {
  const cx = w / 2, cy = h * 1.02, R = h * 0.98, ri = R * r0;
  const P = (a, r) => [f1(cx + Math.cos((a * Math.PI) / 180) * r), f1(cy + Math.sin((a * Math.PI) / 180) * r)];
  const [x0, y0] = P(a0, R), [x1, y1] = P(a1, R), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri);
  return svg(w, h, `<path d='M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 0 0 ${x3} ${y3}Z' fill='black'/>`);
}
// ---------------- 背景纹理（非蒙版，自带颜色）----------------
const paperTex = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .36  0 0 0 0 .32  0 0 0 0 .25  0 0 0 .085 0'/></filter><rect width='320' height='320' filter='url(#n)'/></svg>`;
const fiberTex = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='640'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.01 .16' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .32  0 0 0 0 .28  0 0 0 0 .2  0 0 0 .06 0'/></filter><rect width='640' height='640' filter='url(#f)'/></svg>`;
const cloudTex = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='.004' numOctaves='4' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .22  0 0 0 .22 -.05'/></filter><rect width='900' height='900' filter='url(#c)'/></svg>`;

// ---------------- 输出 ----------------
const V = {};
V["stroke-1"] = brush({ seed: 3, dry: 0.4 });
V["stroke-2"] = brush({ seed: 11, dry: 0.25, curve: 0.12, taper: 0.22 });
V["stroke-3"] = brush({ seed: 27, dry: 0.55, curve: 0.05, press: 1.2 });
V["stroke-thin"] = brush({ w: 800, h: 24, seed: 41, dry: 0.3, curve: 0.25, taper: 0.3, rough: 0.12 });
V["stroke-bar"] = brush({ w: 600, h: 40, seed: 7, dry: 0.15, curve: 0.04, taper: 0.1, tail: "blunt", rough: 0.05 });
V["stroke-band"] = brush({ w: 400, h: 100, seed: 19, dry: 0.5, curve: 0.06, taper: 0.16, press: 1.08, rough: 0.07 });
V["stroke-v"] = brush({ w: 600, h: 40, seed: 53, dry: 0.35, curve: 0.08, taper: 0.25 });
V["enso-1"] = enso({ seed: 2 });
V["enso-2"] = enso({ seed: 9, sweep: 335, start: -40 });
V["enso-3"] = enso({ seed: 14, sweep: 310, width: 0.08, start: 150 });
V["enso-full"] = enso({ seed: 5, sweep: 352, width: 0.07, dry: 0.25, start: -90 });
V["seal-sq"] = seal({ seed: 4, shape: "square" });
V["seal-sq2"] = seal({ seed: 8, shape: "square", erode: 1.5 });
V["seal-round"] = seal({ seed: 6, shape: "round" });
V["seal-oval"] = seal({ seed: 12, shape: "oval" });
V["seal-frame"] = sealFrame({ seed: 21 });
V["seal-frame-round"] = sealFrame({ seed: 22, shape: "round", width: 0.06 });
V["splash-1"] = splash({ seed: 5 });
V["splash-2"] = splash({ seed: 31, drops: 22, spread: 1.4 });
V["deckle-1"] = deckle({ seed: 2, amp: 16, inset: 22 });
V["deckle-2"] = deckle({ seed: 9, amp: 20, inset: 26 });
V["deckle-slip"] = deckle({ w: 500, h: 700, seed: 17, amp: 10, inset: 14 });
V["cloud"] = cloud({});
V["wash-1"] = wash({ seed: 3, cx: 0.5, rx: 0.36, ry: 0.32 });
V["wash-2"] = wash({ seed: 8, cx: 0.5, rx: 0.38, ry: 0.34 });
V["wash-round"] = wash({ w: 300, h: 300, seed: 13, cx: 0.5, rx: 0.34, ry: 0.34 });
V["fan"] = fan({});
V["grid-mi"] = gridCell({});
V["grid-tian"] = gridCell({ mi: !1 });

let css = `/* 自动生成：node tools/ui_kit_gen.mjs —— 程序化笔触 / 圆相 / 印章 / 墨点 / 纸边 / 云纹 / 米字格（SVG data URI，作 mask-image 使用） */\n:root {\n`;
for (const [k, v] of Object.entries(V)) css += `  --ink-${k}: ${uri(v)};\n`;
css += `  --ink-tex-paper: ${uri(paperTex)};\n  --ink-tex-fiber: ${uri(fiberTex)};\n  --ink-tex-cloud: ${uri(cloudTex)};\n`;
css += "}\n";
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, css);
console.log("strokes.css", (css.length / 1024).toFixed(1) + " KB", Object.keys(V).length, "shapes");
