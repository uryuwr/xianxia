// 主角立绘生成器：林墨（白衣剑修）· 写意水墨
// 手工编排每一笔的"笔路"（中线控制点），程序负责把笔路画成有顿挫、出锋、飞白的毛笔笔触；
// 墨晕、留白、一点朱砂（发带与剑穗）。输出透明底 SVG，可直接叠在任何纸面上。
// 用法：node tools/portrait_gen.mjs → docs/ui/v2/kit/portrait_linmo.svg（全身）、portrait_linmo_bust.svg（半身）
// 以后可由画师 / AI 立绘替换为同名同尺寸文件（600×1000，人物脚底约在 y=900）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "ui", "v2", "kit");
const W = 600, H = 1000;
const INK = "#15181b", ZHU = "#b8291a";

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise1(r, n = 16) {
  const k = Array.from({ length: n + 1 }, () => r() * 2 - 1);
  return (t) => {
    const x = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return k[i] * (1 - u) + k[i + 1] * u;
  };
}
const f1 = (v) => +v.toFixed(1);
const P = (pts) => pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L");

// Catmull-Rom 采样，再按弧长重采样成 N 点
function spline(pts, N = 80, closed = false) {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const raw = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      raw.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  raw.push(closed ? p[1] : p[p.length - 2]);
  const L = [0];
  for (let i = 1; i < raw.length; i++) L.push(L[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const out = [];
  for (let i = 0, j = 0; i <= N; i++) {
    const s = (i / N) * L[L.length - 1];
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f]);
  }
  return { pts: out, len: L[L.length - 1] };
}

let uid = 0;
// 一笔：pts 笔路；w 最大笔宽；press 起笔顿；taper 收笔出锋比例；dry 飞白；op 墨色浓淡；c 颜色
function stroke(pts, { w = 10, seed = 1, press = 1.15, head = 0.08, taper = 0.3, dry = 0.3, rough = 0.12, op = 0.9, c = INK, fade = 0.8, tail = 0.04, wv = 0.18 } = {}) {
  const r = rng(seed), nL = noise1(r, 20), nR = noise1(r, 20), nW = noise1(r, 5);
  const { pts: C, len } = spline(pts, Math.max(30, Math.round(len0(pts) / 4)));
  const N = C.length - 1, L = [], R = [], HW = [], NM = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = C[Math.max(0, i - 1)], b = C[Math.min(N, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    let p = 1 - wv * (0.5 - 0.5 * nW(t)); // 提按：笔宽起伏
    if (t < head) p *= 0.45 + 0.55 * Math.sin((t / head) * Math.PI * 0.5) * press;
    else if (t < head * 2) p *= press - (press - 1) * ((t - head) / head);
    if (t > 1 - taper) p *= Math.max(tail, 1 - Math.pow((t - (1 - taper)) / taper, 1.15));
    const hw = (w / 2) * p;
    HW.push(hw); NM.push([nx, ny]);
    L.push([C[i][0] + nx * hw * (1 + nL(t) * rough), C[i][1] + ny * hw * (1 + nL(t) * rough)]);
    R.push([C[i][0] - nx * hw * (1 + nR(t) * rough), C[i][1] - ny * hw * (1 + nR(t) * rough)]);
  }
  // 起笔圆头
  const cap = [];
  const [nx0, ny0] = NM[0], h0 = HW[0];
  for (let k = 1; k < 8; k++) {
    const a = (k / 8) * Math.PI;
    const tx = -ny0, ty = nx0; // 切向（反向）
    cap.push([C[0][0] - nx0 * h0 * Math.cos(a) + tx * -h0 * 0.8 * Math.sin(a) * -1 * -1, C[0][1] - ny0 * h0 * Math.cos(a) + ty * -h0 * 0.8 * Math.sin(a)]);
  }
  const d = "M" + P([...L, ...R.reverse(), ...cap]) + "Z";
  const id = "s" + ++uid;
  // 飞白：沿笔路的断续空隙
  let gaps = "";
  const G = Math.round(dry * (8 + w * 1.2));
  for (let g = 0; g < G; g++) {
    const lane = (r() * 2 - 1) * 0.85;
    const t0 = 1 - dry * (0.35 + r() * 0.65), i0 = Math.floor(Math.max(0.05, t0) * N);
    const seg = [];
    for (let i = i0; i <= N; i++) seg.push([C[i][0] + NM[i][0] * HW[i] * lane, C[i][1] + NM[i][1] * HW[i] * lane]);
    if (seg.length < 2) continue;
    const sw = Math.max(0.4, w * (0.03 + r() * r() * 0.12));
    gaps += `<path d='M${P(seg)}' fill='none' stroke='black' stroke-width='${f1(sw)}' stroke-dasharray='${f1(10 + r() * len * 0.25)} ${f1(3 + r() * 14)}' stroke-linecap='round'/>`;
  }
  const g0 = C[0], g1 = C[N];
  const grad = `<linearGradient id='${id}g' gradientUnits='userSpaceOnUse' x1='${f1(g0[0])}' y1='${f1(g0[1])}' x2='${f1(g1[0])}' y2='${f1(g1[1])}'><stop offset='0' stop-color='${c}' stop-opacity='${op}'/><stop offset='1' stop-color='${c}' stop-opacity='${f1(op * fade * 100) / 100}'/></linearGradient>`;
  const mask = gaps ? `<mask id='${id}m' maskUnits='userSpaceOnUse' x='0' y='0' width='${W}' height='${H}'><rect width='${W}' height='${H}' fill='white'/>${gaps}</mask>` : "";
  return { defs: grad + mask, body: `<path d='${d}' fill='url(#${id}g)'${gaps ? ` mask='url(#${id}m)'` : ""}/>` };
}
function len0(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
// 闭合墨块（头发、墨晕）
function blob(pts, { seed = 1, rough = 0.02, op = 0.9, c = INK } = {}) {
  const r = rng(seed), n = noise1(r, 30);
  const { pts: C } = spline(pts, 120, true);
  const cx = C.reduce((s, p) => s + p[0], 0) / C.length, cy = C.reduce((s, p) => s + p[1], 0) / C.length;
  const out = C.map((p, i) => {
    const k = 1 + n(i / C.length) * rough;
    return [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  });
  return `<path d='M${P(out)}Z' fill='${c}' fill-opacity='${op}'/>`;
}

// ---------------- 构图（600×1000，人物 3/4 侧向左，风从左吹向右） ----------------
let S = []; // [layer, {defs, body}]
const add = (layer, s) => S.push([layer, typeof s === "string" ? { defs: "", body: s } : s]);
let sd = 1;
const st = (pts, o) => stroke(pts, { seed: sd++, ...o });

// 远景：一抹淡山与地面墨晕（背景层，强墨晕滤镜）
add("wash", blob([[110, 892], [220, 876], [330, 878], [450, 888], [520, 904], [430, 924], [280, 928], [140, 918]], { seed: 5, op: 0.22 }));
add("wash", blob([[60, 900], [200, 884], [400, 886], [560, 906], [420, 940], [180, 938]], { seed: 6, op: 0.08 }));
// 衣袍背光一侧的淡墨
add("wash", blob([[346, 310], [396, 338], [436, 404], [456, 480], [414, 506], [408, 620], [426, 740], [452, 836], [384, 868], [350, 760], [340, 600], [342, 470]], { seed: 7, op: 0.06 }));
add("wash", blob([[214, 420], [232, 430], [226, 560], [196, 566], [204, 480]], { seed: 8, op: 0.1 }));
add("wash", blob([[250, 600], [300, 590], [330, 700], [310, 860], [262, 870], [240, 760]], { seed: 9, op: 0.035 }));

// 淡墨宽笔：先铺体积，再用浓墨线收形（浓淡相破）
add("ink", st([[358, 312], [398, 350], [428, 410], [446, 468], [452, 500]], { w: 34, taper: 0.35, dry: 0.75, op: 0.13, wv: 0.5 }));
add("ink", st([[240, 330], [228, 400], [216, 470], [208, 540]], { w: 24, taper: 0.4, dry: 0.75, op: 0.11, wv: 0.5 }));
add("ink", st([[244, 600], [240, 700], [234, 800], [226, 872]], { w: 26, taper: 0.45, dry: 0.8, op: 0.1, wv: 0.5 }));
add("ink", st([[372, 540], [384, 640], [404, 740], [436, 830]], { w: 22, taper: 0.5, dry: 0.8, op: 0.08, wv: 0.5 }));
// 头发：墨块（头顶到后脑）+ 发髻 + 垂到背后的长发
add("ink", blob([[264, 220], [266, 202], [280, 189], [300, 184], [322, 189], [338, 204], [344, 228], [342, 252], [334, 270], [322, 276], [318, 250], [312, 226], [303, 212], [292, 208], [282, 214], [272, 216]], { seed: 11, op: 0.94, rough: 0.015 }));
add("ink", st([[292, 192], [276, 206], [266, 226], [264, 244]], { w: 5, taper: 0.6, dry: 0.2, op: 0.85 })); // 额前一缕
add("ink", st([[304, 200], [292, 214], [286, 230]], { w: 3, taper: 0.6, dry: 0, op: 0.7 }));
add("ink", blob([[296, 176], [300, 160], [314, 154], [328, 160], [331, 175], [320, 186], [304, 186]], { seed: 12, op: 0.95, rough: 0.03 }));
add("ink", st([[286, 168], [314, 172], [346, 180]], { w: 3, taper: 0.25, dry: 0, op: 0.85, press: 1 })); // 发簪
add("ink", st([[331, 250], [340, 300], [352, 352], [368, 404], [388, 446], [402, 470]], { w: 24, taper: 0.55, dry: 0.55, op: 0.9 }));
add("ink", st([[322, 262], [330, 316], [340, 372], [348, 420]], { w: 11, taper: 0.5, dry: 0.4, op: 0.8 }));
add("ink", st([[338, 268], [364, 318], [396, 356], [430, 380]], { w: 7, taper: 0.6, dry: 0.5, op: 0.75 }));
add("ink", st([[313, 222], [317, 246], [314, 272]], { w: 5, taper: 0.5, dry: 0, op: 0.85 })); // 鬓发
// 脸：只留几笔
add("line", st([[268, 226], [266, 244], [272, 260], [284, 272], [294, 277], [306, 271]], { w: 2.6, taper: 0.35, dry: 0, op: 0.5, press: 1 }));
add("line", st([[272, 228], [280, 225], [291, 226]], { w: 3.2, taper: 0.5, dry: 0, op: 0.85 }));
add("line", st([[275, 238], [282, 237], [289, 238]], { w: 2.4, taper: 0.4, dry: 0, op: 0.9 }));
add("line", st([[301, 227], [307, 228]], { w: 2.4, taper: 0.5, dry: 0, op: 0.7 }));
add("line", st([[302, 238], [306, 238]], { w: 2, taper: 0.5, dry: 0, op: 0.7 }));
add("line", st([[268, 246], [265, 254], [270, 256]], { w: 1.6, taper: 0.4, dry: 0, op: 0.5, press: 1 }));
add("line", st([[296, 277], [298, 290]], { w: 2, taper: 0.5, dry: 0, op: 0.45 })); // 颈

// 交领
add("ink", st([[322, 280], [304, 306], [284, 336], [266, 372]], { w: 9, taper: 0.25, dry: 0.3, op: 0.88 }));
add("ink", st([[306, 280], [290, 304], [272, 334], [258, 356]], { w: 4.5, taper: 0.3, dry: 0.2, op: 0.7 }));
add("ink", st([[282, 284], [296, 292], [312, 288]], { w: 4, taper: 0.4, dry: 0, op: 0.7 }));
add("ink", st([[266, 372], [260, 412], [256, 448]], { w: 4, taper: 0.4, dry: 0.3, op: 0.6 }));

// 左侧（画面左）：肩—大袖外缘，一笔到底
add("ink", st([[292, 290], [264, 296], [242, 310], [224, 340], [210, 390], [196, 450], [182, 510], [170, 556]], { w: 15, taper: 0.22, dry: 0.5, op: 0.9, press: 1.3, wv: 0.45 }));
add("ink", st([[158, 560], [182, 576], [206, 574], [222, 562]], { w: 8, taper: 0.4, dry: 0.3, op: 0.85 })); // 袖口
add("ink", st([[230, 414], [226, 470], [222, 528], [220, 560]], { w: 4.5, taper: 0.4, dry: 0.4, op: 0.5 })); // 袖内线
// 手与剑
add("line", st([[196, 548], [206, 552], [214, 546]], { w: 6, taper: 0.4, dry: 0, op: 0.45 }));
add("ink", st([[209, 512], [204, 540], [199, 572]], { w: 6.5, taper: 0.1, dry: 0, op: 0.95, press: 1 })); // 剑柄
add("ink", st([[184, 574], [197, 578], [212, 580]], { w: 5, taper: 0.3, dry: 0, op: 0.95 })); // 剑格
add("line", st([[197, 580], [176, 680], [154, 790], [134, 900]], { w: 3.4, taper: 0.5, dry: 0, op: 0.9, press: 1, rough: 0.02, tail: 0.12, wv: 0 })); // 剑身
add("line", st([[195, 590], [176, 676]], { w: 1, taper: 0.6, dry: 0, op: 0.25, press: 1, wv: 0 })); // 剑脊
add("ink", `<circle cx='210' cy='509' r='4' fill='${INK}'/>`);
// 剑穗（朱）
add("red", st([[210, 512], [222, 534], [232, 562], [230, 600], [236, 628]], { w: 4.5, taper: 0.6, dry: 0.4, op: 0.95, c: ZHU, press: 1 }));
add("red", st([[211, 514], [228, 540], [246, 568], [256, 596]], { w: 3, taper: 0.6, dry: 0.5, op: 0.85, c: ZHU, press: 1 }));
add("red", `<circle cx='214' cy='520' r='4.5' fill='${ZHU}'/>`);

// 下摆左缘、衣褶
add("ink", st([[232, 586], [228, 680], [220, 780], [208, 880]], { w: 10, taper: 0.25, dry: 0.55, op: 0.82, wv: 0.45 }));
add("ink", st([[300, 472], [296, 590], [302, 720], [322, 846]], { w: 4, taper: 0.45, dry: 0.5, op: 0.32, wv: 0.4 }));
add("ink", st([[256, 640], [252, 720], [256, 800]], { w: 3, taper: 0.5, dry: 0.4, op: 0.22 }));
// 下摆
add("ink", st([[206, 886], [240, 892], [280, 893]], { w: 7, taper: 0.4, dry: 0.4, op: 0.75 }));
add("ink", st([[300, 890], [344, 887], [392, 878], [440, 862], [488, 846], [512, 840]], { w: 6, taper: 0.55, dry: 0.5, op: 0.7, wv: 0.4 }));
add("ink", st([[236, 900], [252, 902], [266, 900]], { w: 9, taper: 0.35, dry: 0, op: 0.95 })); // 鞋
add("ink", st([[296, 896], [310, 898], [322, 896]], { w: 8, taper: 0.35, dry: 0, op: 0.9 }));

// 腰带与垂绦
add("ink", st([[250, 452], [290, 459], [334, 454], [374, 446]], { w: 17, taper: 0.18, dry: 0.35, op: 0.95, press: 1.2 }));
add("ink", st([[318, 462], [322, 520], [316, 590]], { w: 5, taper: 0.5, dry: 0.3, op: 0.8 }));
add("ink", st([[328, 462], [340, 520], [350, 574]], { w: 4, taper: 0.5, dry: 0.3, op: 0.7 }));

// 右侧（画面右）：被风鼓起的大袖
add("ink", st([[336, 290], [370, 300], [408, 330], [446, 384], [474, 446], [486, 502]], { w: 13, taper: 0.25, dry: 0.55, op: 0.85, press: 1.25, wv: 0.45 }));
add("ink", st([[486, 506], [458, 524], [426, 520], [400, 504]], { w: 7, taper: 0.4, dry: 0.4, op: 0.75 }));
add("ink", st([[380, 334], [386, 400], [392, 460], [398, 500]], { w: 4, taper: 0.5, dry: 0.4, op: 0.4 }));
add("ink", st([[398, 522], [404, 610], [418, 700], [446, 780], [488, 846]], { w: 9, taper: 0.3, dry: 0.6, op: 0.75, wv: 0.45 }));

// 发带（朱）：从发髻飘向右上
add("red", st([[322, 172], [356, 164], [396, 180], [436, 168], [482, 182], [532, 170]], { w: 7.5, taper: 0.45, dry: 0.45, op: 0.95, c: ZHU, press: 1, rough: 0.2 }));
add("red", st([[322, 180], [352, 196], [386, 218], [420, 218], [452, 240], [484, 244]], { w: 6, taper: 0.5, dry: 0.5, op: 0.9, c: ZHU, press: 1, rough: 0.2 }));

// 脚下几笔草
for (const [x, y, dx, dy, w] of [[150, 906, -14, -26, 3], [160, 908, 6, -30, 3.2], [168, 906, 18, -20, 2.6], [470, 898, 10, -24, 2.6], [480, 900, 22, -16, 2.4], [462, 900, -6, -20, 2.2]])
  add("ink", st([[x, y], [x + dx * 0.5, y + dy * 0.6], [x + dx, y + dy]], { w, taper: 0.7, dry: 0, op: 0.6 }));

// ---------------- 输出 ----------------
const filters = `<filter id='rough' x='-5%' y='-5%' width='110%' height='110%'><feTurbulence type='fractalNoise' baseFrequency='.05' numOctaves='2' seed='4' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='3.2' result='d'/><feGaussianBlur in='d' stdDeviation='1.6' result='halo'/><feComponentTransfer in='halo' result='h2'><feFuncA type='linear' slope='.35'/></feComponentTransfer><feMerge><feMergeNode in='h2'/><feMergeNode in='d'/></feMerge></filter>
<filter id='fine' x='-5%' y='-5%' width='110%' height='110%'><feTurbulence type='fractalNoise' baseFrequency='.08' numOctaves='2' seed='9'/><feDisplacementMap in='SourceGraphic' scale='1.2'/></filter>
<filter id='bleed' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='.018' numOctaves='3' seed='2'/><feDisplacementMap in='SourceGraphic' scale='16'/><feGaussianBlur stdDeviation='5'/></filter>`;
const render = (vb, w, h, title) => {
  const layer = (name) => S.filter(([l]) => l === name).map(([, s]) => s);
  const defs = S.map(([, s]) => s.defs).join("");
  const grp = (name, f) => `<g filter='url(#${f})'>${layer(name).map((s) => s.body).join("")}</g>`;
  const body = grp("wash", "bleed") + grp("ink", "rough") + grp("line", "fine") + grp("red", "rough");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}' width='${w}' height='${h}'><title>${title}</title><defs>${filters}${defs}</defs>${body}</svg>`;
};
const T = "林墨 · 写意立绘（程序生成占位，可替换）";
fs.writeFileSync(path.join(OUT, "portrait_linmo.svg"), render(`0 0 ${W} ${H}`, W, H, T));
fs.writeFileSync(path.join(OUT, "portrait_linmo_bust.svg"), render("140 130 380 460", 380, 460, T));
console.log("portrait_linmo.svg", (fs.statSync(path.join(OUT, "portrait_linmo.svg")).size / 1024).toFixed(1) + " KB");

// ---------------- 丹炉（同一套笔法；380×420） ----------------
S = [];
const GOLD = "#c79a3e";
// 火与烟（墨晕层）
add("wash", blob([[110, 352], [150, 330], [190, 322], [232, 330], [272, 352], [236, 376], [190, 382], [144, 376]], { seed: 21, op: 0.55, c: ZHU }));
add("wash", blob([[146, 350], [172, 336], [190, 332], [212, 336], [236, 350], [214, 364], [190, 368], [166, 364]], { seed: 22, op: 0.7, c: GOLD }));
add("wash", blob([[60, 394], [190, 380], [320, 394], [190, 408]], { seed: 23, op: 0.14 }));
add("wash", blob([[96, 262], [120, 300], [170, 322], [210, 322], [262, 300], [286, 262], [190, 280]], { seed: 24, op: 0.22 }));
// 鼎腹体积：淡墨宽笔
add("ink", st([[96, 192], [100, 246], [128, 290], [170, 314]], { w: 46, taper: 0.4, dry: 0.75, op: 0.14, wv: 0.5 }));
add("ink", st([[288, 196], [284, 250], [258, 292], [222, 314]], { w: 30, taper: 0.4, dry: 0.75, op: 0.1, wv: 0.5 }));
// 轮廓
add("ink", st([[76, 178], [80, 238], [108, 288], [160, 320], [196, 324]], { w: 12, taper: 0.3, dry: 0.5, op: 0.9, press: 1.3, wv: 0.45 }));
add("ink", st([[306, 178], [300, 240], [270, 290], [224, 320]], { w: 9, taper: 0.35, dry: 0.55, op: 0.8, wv: 0.45 }));
add("ink", st([[58, 168], [130, 160], [250, 160], [324, 168]], { w: 17, taper: 0.15, dry: 0.4, op: 0.95, press: 1.3, wv: 0.3 })); // 口沿
add("ink", st([[102, 160], [98, 118], [128, 114], [132, 156]], { w: 9, taper: 0.2, dry: 0.3, op: 0.9 })); // 立耳
add("ink", st([[250, 156], [254, 114], [284, 118], [280, 160]], { w: 9, taper: 0.2, dry: 0.3, op: 0.9 }));
add("ink", st([[90, 204], [190, 216], [292, 204]], { w: 3.5, taper: 0.4, dry: 0.4, op: 0.5 }));
add("ink", st([[104, 258], [190, 268], [278, 258]], { w: 3, taper: 0.4, dry: 0.5, op: 0.35 }));
for (const x of [130, 176, 222]) add("ink", st([[x, 238], [x - 6, 226], [x + 6, 220], [x + 14, 230], [x + 6, 238], [x + 2, 232]], { w: 3, taper: 0.4, dry: 0, op: 0.45, press: 1 })); // 云纹
add("ink", st([[116, 300], [106, 334], [90, 378]], { w: 15, taper: 0.35, dry: 0.4, op: 0.92, press: 1.25 })); // 三足
add("ink", st([[190, 324], [190, 356], [190, 392]], { w: 14, taper: 0.35, dry: 0.4, op: 0.9, press: 1.25 }));
add("ink", st([[264, 300], [276, 336], [292, 378]], { w: 13, taper: 0.35, dry: 0.45, op: 0.85, press: 1.25 }));
// 烟：淡墨长笔
add("ink", st([[182, 150], [166, 116], [196, 88], [180, 50], [204, 14]], { w: 14, taper: 0.6, dry: 0.8, op: 0.12, wv: 0.5 }));
add("ink", st([[206, 152], [226, 120], [206, 92], [232, 62], [246, 30]], { w: 10, taper: 0.6, dry: 0.8, op: 0.1, wv: 0.5 }));
fs.writeFileSync(path.join(OUT, "art_danlu.svg"), render("0 0 380 420", 380, 420, "丹炉 · 写意"));
console.log("art_danlu.svg ok");
