// 自动生成：由 docs/ui/v2/mock_bag_v2/icons/inkicons.js 去掉 ES module 导出、包成普通脚本（file:// 直接打开也能用），并补了炼器示意要用的几类材料模板。示意用，不是游戏代码。
(function(){
// 《墨途》物品图标 · 程序化水墨（方案示意，不是游戏代码）
// 一份"笔路模板"（每类物品一个函数，按物品参数换颜色 / 形状变体），两种渲染器：
//   renderSVG(name, W, H)    路线 (a)：矢量毛笔笔触（与 tools/portrait_gen.mjs 同一笔触模型）+ SVG 滤镜晕染
//   renderCanvas(name, W, H) 路线 (c)：位图笔刷（多根笔毫逐根画，墨量耗尽出飞白）+ 没骨淡彩（湿边、颗粒），同一份笔路
// 两种渲染都在构建期 / 首次加载时烘焙进图集，运行时只是 <img> / background-position。
// 模板坐标用 0..1 的盒内比例，W×H 可以是 1×1 格（128×128）或 2×1 格（256×128），大件 2×2 用 256×256。

const INK = "#15181b", ZHU = "#b8291a";
const PAL = {
  ink: INK, zhu: ZHU, shiqing: "#2f7fa8", shilv: "#3f9a6e", nijin: "#b8923a", zhe: "#9a6a32", dai: "#3a4a52",
  tenghuang: "#d6ad45", huaqing: "#4a6f8a", yanzhi: "#b5485a", ivory: "#c9b98f", jade: "#5f9e86", bronze: "#8a6a3a",
};

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
function len0(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
function spline(pts, N = 80, closed = false) {
  if (pts.length === 2 && !closed) pts = [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]];
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const raw = [];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
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

// 一笔的几何：中线 C、半宽 HW、法线 NM（提按、起笔顿、收笔出锋）
function strokeGeom(pts, o) {
  const { w = 6, seed = 1, press = 1.15, head = 0.08, taper = 0.3, tail = 0.04, wv = 0.18, rough = 0.1, both = 0 } = o;
  const r = rng(seed), nL = noise1(r, 14), nR = noise1(r, 14), nW = noise1(r, 5);
  const { pts: C, len } = spline(pts, Math.max(16, Math.round(len0(pts) / 1.5)));
  const N = C.length - 1, HW = [], NM = [], L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = C[Math.max(0, i - 1)], b = C[Math.min(N, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    let p = 1 - wv * (0.5 - 0.5 * nW(t));
    if (both && t < both) p *= Math.max(tail, Math.pow(t / both, 0.8)); // 两头尖（叶片、牙）
    else if (t < head) p *= 0.5 + 0.5 * Math.sin((t / head) * Math.PI * 0.5) * press;
    else if (t < head * 2) p *= press - (press - 1) * ((t - head) / head);
    if (t > 1 - taper) p *= Math.max(tail, 1 - Math.pow((t - (1 - taper)) / taper, 1.15));
    const hw = (w / 2) * p;
    HW.push(hw), NM.push([nx, ny]);
    L.push([C[i][0] + nx * hw * (1 + nL(t) * rough), C[i][1] + ny * hw * (1 + nL(t) * rough)]);
    R.push([C[i][0] - nx * hw * (1 + nR(t) * rough), C[i][1] - ny * hw * (1 + nR(t) * rough)]);
  }
  return { C, HW, NM, L, R, N, len, r };
}
function blobPts(pts, seed, rough = 0.04) {
  const r = rng(seed), n = noise1(r, 24);
  const { pts: C } = spline(pts, 90, true);
  const cx = C.reduce((s, p) => s + p[0], 0) / C.length, cy = C.reduce((s, p) => s + p[1], 0) / C.length;
  return { P: C.map((p, i) => { const k = 1 + n(i / C.length) * rough; return [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]; }), cx, cy };
}
const f1 = (v) => +v.toFixed(1);
const PP = (pts) => pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L");
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ------------------------------------------------------------------
// 模板：每类一个函数 (W, H, v) → 操作列表。v = 物品参数（颜色、变体）。
//   { s: 笔路, w, c, op, taper, dry, ... }  一笔
//   { wash: 闭合轮廓, c, op, soft }        淡彩晕染（没骨）
//   { dot: [x,y], r, c, op }               点（苔点、丹丸、高光留白用 paper）
// ------------------------------------------------------------------
const T = {};
const sc = (W, H) => { const k = Math.min(W, H) / 128; return { k, X: (x) => x * W, Y: (y) => y * H }; };
const map2 = (W, H) => (pts) => pts.map(([x, y]) => [x * W, y * H]);

// 法剑：剑柄在左下，剑尖指右上；v.blade 刀身淡彩，v.rust 锈点，v.node 竹节剑格
T.sword = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = map2(W, H), wide = W > H * 1.4;
  const A = wide ? [0.1, 0.8] : [0.17, 0.83], B = wide ? [0.95, 0.2] : [0.9, 0.1]; // 柄端→剑尖
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const at = (t, off = 0) => { const L = Math.hypot(dx * W, dy * H); const nx = (-dy * H) / L, ny = (dx * W) / L; return [(A[0] + dx * t) * W + nx * off * k, (A[1] + dy * t) * H + ny * off * k]; };
  const g = 0.2; // 剑格位置
  const ops = [
    { wash: [at(g + 0.02, -6), at(0.96, -1), at(1, 0), at(0.96, 1.5), at(g + 0.02, 6)], c: v.blade || PAL.huaqing, op: 0.32, soft: 1.2 },
    { s: [at(g + 0.01, -4.5), at(0.6, -3.6), at(0.985, -0.5)], w: 2.6 * k, op: 0.9, taper: 0.25, dry: 0.15, press: 1, wv: 0.1 },
    { s: [at(g + 0.01, 4.5), at(0.6, 3.6), at(0.985, 0.5)], w: 2.2 * k, op: 0.75, taper: 0.3, dry: 0.25, press: 1, wv: 0.1 },
    { s: [at(g + 0.04, 0), at(0.85, 0)], w: 1.2 * k, op: 0.35, taper: 0.4, dry: 0, press: 1, wv: 0 },
    { s: [at(g, -15), at(g - 0.005, 0), at(g, 15)], w: 6.5 * k, op: 0.95, taper: 0.2, dry: 0.2, press: 1.2, c: v.guard || INK },
    { s: [at(g - 0.02, 0), at(0.02, 0)], w: 7 * k, op: 0.92, taper: 0.08, dry: 0.35, press: 1.1, c: INK },
    { dot: at(0.0, 0), r: 4.2 * k, c: INK, op: 0.95 },
    // 剑穗（朱）
    { s: [at(0.0, 0), at(-0.02, 8), at(-0.01, 18), at(0.03, 26)], w: 3.4 * k, c: v.tassel || ZHU, op: 0.92, taper: 0.6, dry: 0.4, press: 1 },
    { s: [at(0.0, 1), at(0.02, 10), at(0.05, 19), at(0.09, 24)], w: 2.4 * k, c: v.tassel || ZHU, op: 0.8, taper: 0.6, dry: 0.5, press: 1 },
  ];
  if (v.node) ops.push({ s: [at(g + 0.3, -5), at(g + 0.3, 5)], w: 2.4 * k, op: 0.6 }, { s: [at(g + 0.55, -4), at(g + 0.55, 4)], w: 2 * k, op: 0.5 });
  if (v.rust) for (let i = 0; i < 7; i++) ops.push({ dot: at(0.3 + i * 0.09, ((i * 37) % 7) - 3), r: (1.4 + (i % 3) * 0.7) * k, c: PAL.zhe, op: 0.55 });
  return ops;
};

// 法衣：交领长袍；宽格（2×1）时双袖展开
T.robe = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, wide = W > H * 1.4;
  const m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * (wide ? W / 182 : W / 128), y * (H / 128)]);
  const c = v.wash || PAL.dai;
  const sil = wide
    ? [[64, 16], [92, 20], [124, 30], [150, 48], [146, 62], [116, 54], [100, 52], [98, 118], [64, 122], [30, 118], [28, 52], [12, 54], [-18, 62], [-22, 48], [4, 30], [36, 20]]
    : [[64, 16], [88, 20], [108, 34], [120, 74], [104, 80], [94, 58], [96, 118], [64, 122], [32, 118], [34, 58], [24, 80], [8, 74], [20, 34], [40, 20]];
  const ops = [{ wash: m(sil), c, op: v.op || 0.26, soft: 1.6 }];
  if (wide) {
    ops.push(
      { s: m([[40, 21], [10, 30], [-14, 46], [-20, 60]]), w: 4.2 * k, op: 0.85, taper: 0.25, dry: 0.4, press: 1.25 },
      { s: m([[88, 21], [118, 30], [142, 46], [148, 60]]), w: 4 * k, op: 0.82, taper: 0.25, dry: 0.45, press: 1.25 },
      { s: m([[-18, 62], [6, 56], [28, 54]]), w: 3 * k, op: 0.65, taper: 0.4, dry: 0.3 },
      { s: m([[146, 62], [122, 56], [100, 54]]), w: 3 * k, op: 0.65, taper: 0.4, dry: 0.3 },
    );
  } else {
    ops.push(
      { s: m([[42, 20], [24, 32], [14, 54], [8, 74]]), w: 4 * k, op: 0.85, taper: 0.25, dry: 0.4, press: 1.25 },
      { s: m([[86, 20], [104, 32], [114, 54], [120, 74]]), w: 4 * k, op: 0.82, taper: 0.25, dry: 0.45, press: 1.25 },
      { s: m([[8, 76], [18, 80], [26, 78]]), w: 3 * k, op: 0.7 },
      { s: m([[120, 76], [110, 80], [102, 78]]), w: 3 * k, op: 0.7 },
    );
  }
  ops.push(
    { s: m([[32, 54], [30, 86], [30, 118]]), w: 3.4 * k, op: 0.75, taper: 0.3, dry: 0.5 },
    { s: m([[96, 54], [98, 86], [98, 118]]), w: 3 * k, op: 0.65, taper: 0.3, dry: 0.55 },
    { s: m([[30, 119], [64, 123], [99, 118]]), w: 3 * k, op: 0.7, taper: 0.35, dry: 0.4 },
    // 交领
    { s: m([[54, 18], [62, 34], [70, 50], [78, 64]]), w: 4.4 * k, op: 0.9, taper: 0.3, dry: 0.2 },
    { s: m([[76, 18], [70, 30], [64, 40]]), w: 3.2 * k, op: 0.75, taper: 0.4, dry: 0.2 },
    // 腰带
    { s: m([[34, 64], [64, 67], [96, 63]]), w: 6 * k, op: 0.9, taper: 0.15, dry: 0.3, press: 1.2, c: v.belt || INK },
    { s: m([[70, 67], [72, 84], [70, 98]]), w: 2.6 * k, op: 0.7, taper: 0.5, dry: 0.3, c: v.belt || INK },
    { s: m([[50, 72], [48, 96], [50, 114]]), w: 1.6 * k, op: 0.3, taper: 0.5, dry: 0.3 },
  );
  if (v.trim) ops.push({ s: m([[56, 22], [66, 40], [76, 58]]), w: 2 * k, c: v.trim, op: 0.7, taper: 0.4 });
  return ops;
};

// 玉佩：玉璧 + 朱绳结 + 流苏；宽格时流苏横向飘
T.jade = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, wide = W > H * 1.4;
  const cx = wide ? W * 0.3 : W * 0.5, cy = wide ? H * 0.52 : H * 0.44, R = (wide ? 40 : 34) * k, r = R * 0.34;
  const ring = (rr, n = 24) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.283) * rr, cy + Math.sin((i / n) * 6.283) * rr]);
  const jc = v.jade || PAL.jade;
  const ops = [
    { wash: ring(R), hole: ring(r), c: jc, op: 0.42, soft: 1.4 },
    { s: [...ring(R, 14).slice(10), ...ring(R, 14).slice(0, 9)], w: 3.2 * k, op: 0.85, taper: 0.2, dry: 0.45 },
    { s: ring(r, 10).concat([ring(r, 10)[0], ring(r, 10)[1]]), w: 2.2 * k, op: 0.7, taper: 0.3, dry: 0.3 },
    // 云纹两笔
    { s: [[cx - R * 0.72, cy + R * 0.12], [cx - R * 0.6, cy - R * 0.3], [cx - R * 0.42, cy - R * 0.2]], w: 2 * k, op: 0.45, taper: 0.5, c: PAL.dai },
    { s: [[cx + R * 0.5, cy + R * 0.55], [cx + R * 0.7, cy + R * 0.2], [cx + R * 0.55, cy + R * 0.05]], w: 2 * k, op: 0.45, taper: 0.5, c: PAL.dai },
    { dot: [cx - R * 0.3, cy - R * 0.62], r: 3.4 * k, c: "#f5f0e3", op: 0.85 },
  ];
  if (wide) {
    const x0 = cx + R, y0 = cy;
    ops.push(
      { s: [[x0 - 2 * k, y0], [x0 + 20 * k, y0 - 4 * k]], w: 3 * k, c: ZHU, op: 0.9, taper: 0.1, press: 1 },
      { dot: [x0 + 24 * k, y0 - 5 * k], r: 5.5 * k, c: ZHU, op: 0.95 },
      { s: [[x0 + 28 * k, y0 - 5 * k], [x0 + 60 * k, y0 - 12 * k], [x0 + 96 * k, y0 + 2 * k], [x0 + 120 * k, y0 - 6 * k]], w: 4 * k, c: ZHU, op: 0.85, taper: 0.55, dry: 0.5, press: 1 },
      { s: [[x0 + 28 * k, y0 - 3 * k], [x0 + 62 * k, y0 + 6 * k], [x0 + 92 * k, y0 + 14 * k], [x0 + 112 * k, y0 + 22 * k]], w: 3 * k, c: ZHU, op: 0.75, taper: 0.6, dry: 0.55, press: 1 },
      { s: [[cx, cy - R - 2 * k], [cx + 6 * k, cy - R - 14 * k], [cx + 18 * k, cy - R - 18 * k]], w: 2.4 * k, c: ZHU, op: 0.8, taper: 0.4, press: 1 },
    );
  } else {
    const y0 = cy + R;
    ops.push(
      { s: [[cx, cy - R + 1], [cx, cy - R - 14 * k]], w: 2.6 * k, c: ZHU, op: 0.9, taper: 0.2, press: 1 },
      { s: [[cx, y0 - 2 * k], [cx, y0 + 8 * k]], w: 3 * k, c: ZHU, op: 0.9, taper: 0.1, press: 1 },
      { dot: [cx, y0 + 11 * k], r: 4.5 * k, c: ZHU, op: 0.95 },
      { s: [[cx - 1, y0 + 14 * k], [cx - 4 * k, y0 + 30 * k], [cx - 2 * k, y0 + 42 * k]], w: 3.4 * k, c: ZHU, op: 0.85, taper: 0.6, dry: 0.5, press: 1 },
      { s: [[cx + 1, y0 + 14 * k], [cx + 5 * k, y0 + 28 * k], [cx + 8 * k, y0 + 38 * k]], w: 2.6 * k, c: ZHU, op: 0.75, taper: 0.6, dry: 0.5, press: 1 },
    );
  }
  return ops;
};

// 灵草：一茎数叶（写意一笔一叶）；v.flower 花色，v.fruit 果色，v.leaf 叶色
T.herb = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const lc = v.leaf || PAL.shilv;
  const leaf = (pts, w, op = 0.62, seed) => ({ s: m(pts), w: w * k, c: lc, op, both: 0.35, taper: 0.45, dry: 0.25, press: 1, wv: 0.1, seed });
  const ops = [
    { s: m([[60, 122], [62, 96], [64, 66], [68, 36], [70, 18]]), w: 2.6 * k, c: INK, op: 0.75, taper: 0.4, dry: 0.3, press: 1 },
    leaf([[62, 100], [46, 90], [30, 78], [18, 60]], 14, 0.6, 11),
    leaf([[63, 86], [80, 74], [96, 62], [108, 42]], 13, 0.55, 12),
    leaf([[65, 64], [50, 52], [40, 38], [34, 22]], 11, 0.62, 13),
    leaf([[67, 50], [80, 40], [88, 28], [92, 14]], 9, 0.5, 14),
    // 叶脉（浓墨细笔，浓淡相破）
    { s: m([[58, 98], [40, 84], [26, 68]]), w: 1.2 * k, op: 0.5, taper: 0.5, dry: 0.2, press: 1 },
    { s: m([[66, 84], [84, 70], [100, 52]]), w: 1.2 * k, op: 0.45, taper: 0.5, dry: 0.2, press: 1 },
    { s: m([[62, 62], [48, 46], [38, 30]]), w: 1, op: 0.45, taper: 0.5, press: 1 },
    // 根
    { s: m([[60, 120], [52, 126]]), w: 1.4 * k, op: 0.5, taper: 0.5 },
    { s: m([[61, 120], [70, 127]]), w: 1.4 * k, op: 0.5, taper: 0.5 },
  ];
  if (v.flower) {
    const fx = 70, fy = 18;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.283 - 1.2;
      ops.push({ s: m([[fx + Math.cos(a) * 3, fy + Math.sin(a) * 3], [fx + Math.cos(a) * 14, fy + Math.sin(a) * 12]]), w: 9 * k, c: v.flower, op: 0.6, both: 0.3, taper: 0.5, press: 1, seed: 40 + i });
    }
    ops.push({ dot: m([[fx, fy]])[0], r: 3 * k, c: PAL.tenghuang, op: 0.9 });
    ops.push({ dot: m([[30, 74]])[0], r: 2.6 * k, c: "#9cc4d8", op: 0.7 }, { dot: m([[100, 50]])[0], r: 2 * k, c: "#9cc4d8", op: 0.6 });
  }
  if (v.fruit) for (const [x, y, r] of [[70, 20, 9], [84, 30, 7], [56, 28, 7.5]]) ops.push({ wash: circ(m([[x, y]])[0], r * k), c: v.fruit, op: 0.75, soft: 0.8 }, { dot: m([[x - r * 0.35, y - r * 0.35]])[0], r: r * 0.25 * k, c: "#f5f0e3", op: 0.8 });
  return ops;
};
const circ = ([cx, cy], R, n = 16) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.283) * R, cy + Math.sin((i / n) * 6.283) * R]);

// 灵草苗：一团土 + 两三片嫩叶
T.seed = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  return [
    { wash: m([[30, 92], [64, 82], [98, 92], [94, 112], [64, 118], [34, 112]]), c: PAL.zhe, op: 0.4, soft: 1.4 },
    { s: m([[34, 104], [64, 116], [96, 104]]), w: 3 * k, op: 0.6, taper: 0.4, dry: 0.5 },
    { s: m([[64, 96], [63, 70], [66, 44]]), w: 2.4 * k, op: 0.8, taper: 0.3, press: 1 },
    { s: m([[64, 62], [48, 54], [34, 36]]), w: 15 * k, c: v.leaf || PAL.shilv, op: 0.62, both: 0.35, taper: 0.45, press: 1, seed: 21 },
    { s: m([[65, 52], [80, 40], [92, 22]]), w: 13 * k, c: v.leaf || PAL.shilv, op: 0.55, both: 0.35, taper: 0.45, press: 1, seed: 22 },
    { dot: m([[44, 100]])[0], r: 2 * k, op: 0.55 }, { dot: m([[82, 104]])[0], r: 1.6 * k, op: 0.5 }, { dot: m([[58, 108]])[0], r: 1.4 * k, op: 0.45 },
  ];
};

// 妖丹：一颗丹珠，内有墨旋，外一圈淡光；v.c 丹色，v.aura 光色
T.core = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, cx = W / 2, cy = H / 2 + 2 * k, R = (W > H * 1.4 ? 40 : 30) * k;
  const c = v.c || PAL.zhe;
  return [
    { wash: circ([cx, cy], R * 1.55, 20), c: v.aura || PAL.nijin, op: 0.16, soft: 6 },
    { wash: circ([cx, cy], R, 20), c, op: 0.55, soft: 1.2 },
    { s: [[cx + R * 0.05, cy + R * 0.1], [cx - R * 0.3, cy + R * 0.05], [cx - R * 0.25, cy - R * 0.35], [cx + R * 0.25, cy - R * 0.45], [cx + R * 0.55, cy], [cx + R * 0.2, cy + R * 0.55], [cx - R * 0.5, cy + R * 0.5]], w: 3.4 * k, op: 0.55, taper: 0.5, dry: 0.4, c: v.swirl || INK },
    { s: [...circ([cx, cy], R + 1, 12).slice(2), ...circ([cx, cy], R + 1, 12).slice(0, 1)], w: 3 * k, op: 0.88, taper: 0.25, dry: 0.5, press: 1.3 },
    { dot: [cx - R * 0.42, cy - R * 0.5], r: R * 0.16, c: "#f5f0e3", op: 0.9 },
    { dot: [cx + R * 1.25, cy - R * 0.9], r: 2.2 * k, c: v.aura || PAL.nijin, op: 0.75 },
    { dot: [cx - R * 1.3, cy + R * 0.7], r: 1.8 * k, c: v.aura || PAL.nijin, op: 0.65 },
    { dot: [cx + R * 1.1, cy + R * 1.05], r: 1.4 * k, c: v.aura || PAL.nijin, op: 0.6 },
  ];
};

// 矿石：三块棱石（皴笔勾轮廓，面上淡墨 / 花青）；v.c 面色，v.vein 矿脉色
T.ore = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const c = v.c || PAL.dai;
  const ops = [
    { wash: m([[46, 108], [52, 44], [70, 26], [84, 50], [86, 108]]), c, op: 0.38, soft: 1 },
    { wash: m([[84, 108], [90, 62], [106, 52], [116, 76], [112, 108]]), c, op: 0.28, soft: 1 },
    { wash: m([[14, 108], [22, 74], [38, 66], [50, 84], [48, 108]]), c, op: 0.3, soft: 1 },
    { wash: m([[70, 28], [84, 50], [86, 106], [70, 106]]), c: INK, op: 0.2, soft: 0.8 },
    { s: m([[46, 106], [50, 64], [56, 40], [70, 26]]), w: 3.4 * k, op: 0.88, taper: 0.15, dry: 0.4, press: 1.2, rough: 0.2 },
    { s: m([[70, 26], [80, 42], [86, 62], [87, 106]]), w: 3 * k, op: 0.8, taper: 0.2, dry: 0.5, rough: 0.2 },
    { s: m([[70, 28], [70, 70], [72, 104]]), w: 1.6 * k, op: 0.5, taper: 0.4, dry: 0.5 },
    { s: m([[88, 104], [90, 64], [106, 52], [116, 76], [114, 104]]), w: 2.6 * k, op: 0.75, taper: 0.2, dry: 0.5, rough: 0.2 },
    { s: m([[14, 106], [22, 76], [38, 66], [50, 82]]), w: 2.6 * k, op: 0.75, taper: 0.25, dry: 0.5, rough: 0.2 },
    { s: m([[8, 110], [40, 106], [80, 108], [120, 106]]), w: 4 * k, op: 0.55, taper: 0.4, dry: 0.6 },
    // 皴：几道短笔
    { s: m([[56, 60], [60, 76]]), w: 1.6 * k, op: 0.45, taper: 0.5 }, { s: m([[58, 84], [62, 98]]), w: 1.6 * k, op: 0.4, taper: 0.5 },
    { s: m([[96, 72], [98, 86]]), w: 1.4 * k, op: 0.4, taper: 0.5 },
  ];
  if (v.vein) ops.push({ s: m([[54, 52], [62, 66], [60, 82], [66, 96]]), w: 2.4 * k, c: v.vein, op: 0.8, taper: 0.4, dry: 0.3 }, { dot: m([[78, 58]])[0], r: 2 * k, c: v.vein, op: 0.8 });
  return ops;
};

// 灵石：两枚六棱晶（石青淡彩，留白高光）
T.stone = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const c = v.c || PAL.shiqing;
  return [
    { wash: m([[50, 112], [40, 54], [60, 14], [80, 54], [72, 112]]), c, op: 0.36, soft: 1 },
    { wash: m([[60, 14], [80, 54], [72, 112], [62, 112]]), c, op: 0.3, soft: 0.8 },
    { wash: m([[78, 114], [76, 76], [94, 50], [108, 78], [100, 114]]), c, op: 0.3, soft: 1 },
    { s: m([[50, 110], [40, 54], [60, 14], [80, 54], [72, 110]]), w: 2.6 * k, op: 0.85, taper: 0.12, dry: 0.35, rough: 0.15 },
    { s: m([[60, 16], [62, 60], [62, 110]]), w: 1.4 * k, op: 0.45, taper: 0.4 },
    { s: m([[80, 112], [76, 76], [94, 50], [108, 78], [100, 112]]), w: 2.2 * k, op: 0.75, taper: 0.15, dry: 0.4, rough: 0.15 },
    { s: m([[28, 114], [64, 112], [112, 114]]), w: 3 * k, op: 0.45, taper: 0.4, dry: 0.6 },
    { dot: m([[50, 50]])[0], r: 2.6 * k, c: "#f5f0e3", op: 0.9 },
    { dot: m([[38, 30]])[0], r: 1.8 * k, c, op: 0.7 }, { dot: m([[100, 34]])[0], r: 1.5 * k, c, op: 0.6 },
  ];
};

// 丹药：葫芦 + 两粒丹丸；v.pill 丹色
T.pill = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const gourdTop = circ(m([[52, 40]])[0], 15 * k, 18), gourdBot = circ(m([[52, 84]])[0], 27 * k, 22);
  const pc = v.pill || ZHU;
  return [
    { wash: gourdBot, c: PAL.tenghuang, op: 0.42, soft: 1.2 },
    { wash: gourdTop, c: PAL.tenghuang, op: 0.36, soft: 1.2 },
    { wash: m([[40, 72], [52, 64], [66, 70], [70, 96], [52, 108], [36, 98]]), c: PAL.zhe, op: 0.18, soft: 3 },
    { s: m([[48, 26], [38, 34], [38, 48], [46, 56], [32, 66], [25, 86], [34, 104], [52, 111], [70, 105], [79, 88], [74, 68], [60, 56], [66, 46], [66, 33], [58, 26]]), w: 2.8 * k, op: 0.85, taper: 0.15, dry: 0.4, press: 1.2 },
    { s: m([[47, 26], [50, 16], [57, 17], [58, 26]]), w: 4 * k, op: 0.9, taper: 0.2, c: PAL.zhe },
    { s: m([[40, 56], [52, 59], [64, 56]]), w: 4 * k, c: ZHU, op: 0.9, taper: 0.2, press: 1 },
    { s: m([[60, 58], [68, 70], [66, 80]]), w: 2.4 * k, c: ZHU, op: 0.8, taper: 0.5, dry: 0.4, press: 1 },
    { wash: circ(m([[92, 100]])[0], 9.5 * k, 14), c: pc, op: 0.8, soft: 0.6 },
    { wash: circ(m([[108, 92]])[0], 8 * k, 14), c: pc, op: 0.7, soft: 0.6 },
    { dot: m([[89, 97]])[0], r: 2.2 * k, c: "#f5f0e3", op: 0.85 }, { dot: m([[106, 89]])[0], r: 1.8 * k, c: "#f5f0e3", op: 0.8 },
    { dot: m([[42, 76]])[0], r: 3 * k, c: "#f5f0e3", op: 0.7 },
  ];
};

// 符箓：一张黄纸，朱砂符文，纸角微卷；v.glyph 朱笔变体
T.fu = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const ops = [
    { wash: m([[43, 13], [85, 10], [88, 113], [48, 118]]), c: PAL.tenghuang, op: 0.5, soft: 0.8 },
    { s: m([[42, 10], [64, 8], [86, 6]]), w: 1.6 * k, op: 0.45, taper: 0.3 },
    { s: m([[86, 7], [88, 60], [90, 116]]), w: 2 * k, op: 0.55, taper: 0.2, dry: 0.4 },
    { s: m([[42, 11], [45, 66], [48, 121]]), w: 1.6 * k, op: 0.45, taper: 0.2, dry: 0.4 },
    { s: m([[48, 122], [70, 118], [90, 116]]), w: 1.8 * k, op: 0.5, taper: 0.3 },
    // 朱砂符文：横、勾、回环、点
    { s: m([[52, 22], [66, 20], [78, 20]]), w: 3.4 * k, c: ZHU, op: 0.92, taper: 0.3, dry: 0.2 },
    { s: m([[64, 24], [64, 40], [58, 50], [70, 54], [62, 64]]), w: 3 * k, c: ZHU, op: 0.9, taper: 0.3, dry: 0.3 },
    { s: m([[54, 70], [74, 68], [60, 80], [76, 80], [66, 94], [70, 106]]), w: 2.8 * k, c: ZHU, op: 0.88, taper: 0.45, dry: 0.4 },
    { dot: m([[56, 40]])[0], r: 2.2 * k, c: ZHU, op: 0.9 }, { dot: m([[76, 40]])[0], r: 2.2 * k, c: ZHU, op: 0.9 },
  ];
  if (v.el) ops.push({ wash: m([[60, 98], [76, 98], [76, 114], [60, 114]]), c: ZHU, op: 0.75, soft: 0.3 });
  return ops;
};

// 妖兽牙：一颗弯牙（象牙色没骨 + 一笔浓墨勾背）
T.fang = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  return [
    { s: m([[40, 108], [36, 80], [46, 50], [66, 30], [96, 18]]), w: 24 * k, c: v.c || PAL.ivory, op: 0.75, taper: 0.7, tail: 0.02, dry: 0.2, press: 1, wv: 0.05 },
    { s: m([[30, 104], [28, 76], [38, 46], [60, 26], [96, 18]]), w: 3 * k, op: 0.85, taper: 0.5, dry: 0.4 },
    { s: m([[52, 110], [48, 86], [56, 62], [72, 42], [96, 19]]), w: 2 * k, op: 0.55, taper: 0.6, dry: 0.4 },
    { s: m([[26, 108], [40, 114], [54, 110]]), w: 6 * k, op: 0.85, taper: 0.3, dry: 0.5, c: PAL.zhe },
    { s: m([[42, 66], [48, 70]]), w: 1.4 * k, op: 0.4 }, { s: m([[50, 50], [56, 54]]), w: 1.2 * k, op: 0.35 },
  ];
};

// 功法卷轴：斜放的一卷，朱绳
T.scroll = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  return [
    { wash: m([[22, 86], [90, 26], [108, 44], [40, 104]]), c: v.c || PAL.tenghuang, op: 0.38, soft: 1 },
    { s: m([[22, 86], [56, 56], [90, 26]]), w: 2.6 * k, op: 0.8, taper: 0.2, dry: 0.4 },
    { s: m([[40, 104], [74, 74], [108, 44]]), w: 2.6 * k, op: 0.8, taper: 0.2, dry: 0.4 },
    { wash: circ(m([[99, 35]])[0], 12.5 * k, 14), c: v.end || PAL.zhe, op: 0.6, soft: 0.6 },
    { s: [...circ(m([[99, 35]])[0], 12.5 * k, 12), circ(m([[99, 35]])[0], 12.5 * k, 12)[0]], w: 2.4 * k, op: 0.85, taper: 0.2 },
    { dot: m([[99, 35]])[0], r: 4 * k, c: INK, op: 0.85 },
    { s: m([[18, 82], [24, 98], [34, 108]]), w: 4 * k, op: 0.85, taper: 0.2, c: PAL.zhe },
    { s: m([[54, 58], [72, 76]]), w: 4 * k, c: ZHU, op: 0.9, taper: 0.1, press: 1 },
    { s: m([[66, 70], [62, 90], [70, 106]]), w: 2.6 * k, c: ZHU, op: 0.8, taper: 0.5, dry: 0.4 },
    { s: m([[68, 70], [80, 88], [84, 104]]), w: 2.2 * k, c: ZHU, op: 0.7, taper: 0.55, dry: 0.5 },
    { s: m([[36, 84], [54, 68]]), w: 1.2 * k, op: 0.3 }, { s: m([[74, 52], [90, 38]]), w: 1.2 * k, op: 0.3 },
  ];
};

// 千年竹心（大件 2×2）：一截粗竹，竹节 + 两片竹叶
T.bamboo = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  return [
    { wash: m([[46, 14], [80, 12], [84, 114], [44, 116]]), c: v.c || PAL.shilv, op: 0.42, soft: 1.2 },
    { s: m([[46, 16], [45, 60], [44, 114]]), w: 4 * k, op: 0.85, taper: 0.15, dry: 0.5, press: 1.2 },
    { s: m([[80, 14], [82, 60], [84, 112]]), w: 3.4 * k, op: 0.75, taper: 0.15, dry: 0.55 },
    { s: m([[42, 46], [64, 50], [86, 46]]), w: 4 * k, op: 0.9, taper: 0.15, dry: 0.2 },
    { s: m([[41, 86], [64, 90], [87, 86]]), w: 4 * k, op: 0.9, taper: 0.15, dry: 0.2 },
    { wash: circ(m([[63, 14]])[0], 12 * k, 14).map(([x, y]) => [x, (y - m([[0, 14]])[0][1]) * 0.35 + m([[0, 14]])[0][1]]), c: PAL.tenghuang, op: 0.7, soft: 0.4 },
    { s: m([[52, 14], [63, 18], [75, 14]]), w: 2 * k, op: 0.7, taper: 0.3 },
    { s: m([[84, 50], [98, 40], [112, 32], [122, 30]]), w: 10 * k, c: PAL.shilv, op: 0.55, both: 0.3, taper: 0.5, press: 1, seed: 7 },
    { s: m([[84, 52], [100, 56], [116, 66]]), w: 8 * k, c: PAL.shilv, op: 0.5, both: 0.3, taper: 0.5, press: 1, seed: 8 },
    { dot: m([[56, 64]])[0], r: 3 * k, c: "#f5f0e3", op: 0.75 },
    { dot: m([[30, 30]])[0], r: 2 * k, c: PAL.nijin, op: 0.7 }, { dot: m([[24, 70]])[0], r: 1.6 * k, c: PAL.nijin, op: 0.6 },
  ];
};

// 灵玉（小块）：一块圆润玉石
T.yu = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const sil = m([[30, 76], [38, 46], [64, 34], [92, 42], [102, 70], [88, 96], [58, 100], [36, 94]]);
  return [
    { wash: sil, c: v.c || PAL.jade, op: 0.5, soft: 1.3 },
    { wash: m([[56, 60], [78, 52], [92, 66], [80, 90], [58, 88]]), c: v.c || PAL.jade, op: 0.3, soft: 2 },
    { s: [...sil, sil[0], sil[1]], w: 2.8 * k, op: 0.82, taper: 0.25, dry: 0.45 },
    { dot: m([[50, 54]])[0], r: 4 * k, c: "#f5f0e3", op: 0.85 },
    { s: m([[24, 104], [64, 108], [106, 102]]), w: 3 * k, op: 0.4, taper: 0.4, dry: 0.6 },
  ];
};

// 乾坤镜（法宝）：铜镜 + 钮 + 朱穗
T.mirror = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, cx = W / 2, cy = H / 2 - 2 * k, R = 38 * k;
  return [
    { wash: circ([cx, cy], R, 24), c: PAL.bronze, op: 0.48, soft: 1 },
    { wash: circ([cx, cy], R * 0.78, 24), c: PAL.jade, op: 0.32, soft: 1.5 },
    { s: [...circ([cx, cy], R, 16).slice(3), ...circ([cx, cy], R, 16).slice(0, 2)], w: 4 * k, op: 0.88, taper: 0.2, dry: 0.45, press: 1.3 },
    { s: [...circ([cx, cy], R * 0.78, 14), circ([cx, cy], R * 0.78, 14)[0]], w: 1.6 * k, op: 0.5, taper: 0.3 },
    { wash: circ([cx, cy], R * 0.2, 12), c: PAL.bronze, op: 0.85, soft: 0.5 },
    { s: [[cx - R * 0.5, cy - R * 0.1], [cx - R * 0.3, cy - R * 0.45], [cx, cy - R * 0.5]], w: 1.8 * k, op: 0.45, taper: 0.5 },
    { s: [[cx + R * 0.5, cy + R * 0.1], [cx + R * 0.3, cy + R * 0.45], [cx, cy + R * 0.5]], w: 1.8 * k, op: 0.45, taper: 0.5 },
    { s: [[cx, cy + R * 0.12], [cx + 10 * k, cy + R + 8 * k], [cx + 6 * k, cy + R + 22 * k]], w: 3 * k, c: ZHU, op: 0.85, taper: 0.55, dry: 0.4, press: 1 },
    { dot: [cx - R * 0.5, cy - R * 0.5], r: 3 * k, c: "#f5f0e3", op: 0.85 },
  ];
};

// 锦囊：束口小袋，朱绳
T.pouch = (W, H, v = {}) => {
  const k = Math.min(W, H) / 128, m = (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k]);
  const sil = m([[50, 44], [36, 64], [30, 92], [44, 112], [84, 112], [98, 92], [92, 64], [78, 44]]);
  return [
    { wash: sil, c: v.c || PAL.yanzhi, op: 0.5, soft: 1.2 },
    { wash: m([[46, 30], [58, 38], [70, 38], [82, 30], [78, 46], [50, 46]]), c: v.c || PAL.yanzhi, op: 0.5, soft: 1 },
    { s: m([[50, 46], [36, 64], [30, 92], [44, 112], [84, 112], [98, 92], [92, 64], [78, 46]]), w: 3 * k, op: 0.85, taper: 0.15, dry: 0.4 },
    { s: m([[46, 30], [58, 40], [70, 40], [82, 30]]), w: 2.4 * k, op: 0.7, taper: 0.2 },
    { s: m([[48, 46], [64, 50], [80, 46]]), w: 4 * k, c: PAL.tenghuang, op: 0.95, taper: 0.1, press: 1 },
    { s: m([[66, 50], [74, 62], [72, 76]]), w: 2.6 * k, c: PAL.tenghuang, op: 0.85, taper: 0.5, press: 1 },
    { s: m([[50, 72], [58, 66], [66, 72], [74, 66], [80, 72]]), w: 1.6 * k, c: PAL.tenghuang, op: 0.7, taper: 0.3 },
    { s: m([[48, 88], [58, 82], [68, 88], [78, 82]]), w: 1.6 * k, c: PAL.tenghuang, op: 0.6, taper: 0.3 },
  ];
};

// 物品 → 模板 + 参数（示意用：只列出示意图里出现的物品）
const ITEMS = {
  sword_qingfeng: ["sword", {}],
  sword_zhuying: ["sword", { blade: PAL.shilv, node: 1 }],
  rust_sword: ["sword", { blade: PAL.zhe, rust: 1, tassel: PAL.zhe }],
  robe_bu: ["robe", {}],
  robe_lingsi: ["robe", { wash: PAL.shiqing, op: 0.24, trim: PAL.nijin }],
  jade_qing: ["jade", {}],
  jade_shuiling: ["jade", { jade: PAL.shiqing }],
  qingling_cao: ["herb", {}],
  ninglu_hua: ["herb", { flower: "#7ea7c4" }],
  chiyan_guo: ["herb", { fruit: ZHU, leaf: "#6f8f4a" }],
  hanlu_cao: ["herb", { leaf: "#4f8f8a" }],
  seed_qingling: ["seed", {}],
  wolf_core: ["core", {}],
  bilin_core: ["core", { c: PAL.shiqing, aura: PAL.nijin }],
  tiejing_shi: ["ore", { vein: PAL.huaqing }],
  spirit_stone: ["stone", {}],
  huichun_dan: ["pill", {}],
  huiqi_dan: ["pill", { pill: PAL.shiqing }],
  dundi_fu: ["fu", {}],
  fu_fire: ["fu", { el: 1 }],
  wolf_fang: ["fang", {}],
  scroll_frost: ["scroll", {}],
  zhuxin: ["bamboo", {}],
  ling_yu: ["yu", {}],
  art_qiankun: ["mirror", {}],
  jinnang: ["pouch", {}],
  art_flying_sword: ["sword", { blade: PAL.shiqing, guard: PAL.dai, tassel: PAL.shiqing }],
  danfang_zhuji: ["scroll", { c: "#c8b88a", end: PAL.dai }],
  wolfking_core: ["core", { c: "#7a4a2a", aura: ZHU }],
};

function ops(name, W, H) {
  const [t, v] = ITEMS[name] || [name, {}];
  return T[t](W, H, v);
}

// ------------------------------------------------------------------
// 路线 (a)：SVG 矢量笔触
// ------------------------------------------------------------------
let uid = 0;
function renderSVG(name, W = 128, H = 128) {
  const list = ops(name, W, H);
  let defs = `<filter id='bleed' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='${(0.9 * 128) / Math.min(W, H) / 20}' numOctaves='2' seed='3'/><feDisplacementMap in='SourceGraphic' scale='${(5 * Math.min(W, H)) / 128}'/><feGaussianBlur stdDeviation='${(0.9 * Math.min(W, H)) / 128}'/></filter>`;
  let body = "";
  list.forEach((o, n) => {
    const seed = o.seed || n * 7 + 3;
    if (o.wash) {
      const { P } = blobPts(o.wash, seed, 0.05);
      let d = "M" + PP(P) + "Z";
      if (o.hole) d += "M" + PP(blobPts(o.hole, seed + 1, 0.04).P) + "Z";
      const id = "w" + ++uid;
      defs += `<radialGradient id='${id}'><stop offset='0' stop-color='${o.c}' stop-opacity='${(o.op * 0.75).toFixed(2)}'/><stop offset='.85' stop-color='${o.c}' stop-opacity='${o.op}'/><stop offset='1' stop-color='${o.c}' stop-opacity='${Math.min(1, o.op * 1.25).toFixed(2)}'/></radialGradient>`;
      body += `<path d='${d}' fill='url(#${id})' fill-rule='evenodd' filter='url(#bleed)'/>`;
    } else if (o.dot) {
      body += `<circle cx='${f1(o.dot[0])}' cy='${f1(o.dot[1])}' r='${f1(o.r)}' fill='${o.c || INK}' fill-opacity='${o.op ?? 0.9}'/>`;
    } else {
      const c = o.c || INK, op = o.op ?? 0.9, dry = o.dry ?? 0.25;
      const g = strokeGeom(o.s, { ...o, seed });
      const { C, HW, NM, L, R, N, r } = g;
      const d = "M" + PP([...L, ...R.slice().reverse()]) + "Z";
      const id = "s" + ++uid;
      let gaps = "";
      const G = Math.round(dry * (4 + (o.w || 6) * 0.8));
      for (let q = 0; q < G; q++) {
        const lane = (r() * 2 - 1) * 0.8, i0 = Math.floor(Math.max(0.05, 1 - dry * (0.35 + r() * 0.65)) * N);
        const seg = [];
        for (let i = i0; i <= N; i++) seg.push([C[i][0] + NM[i][0] * HW[i] * lane, C[i][1] + NM[i][1] * HW[i] * lane]);
        if (seg.length < 2) continue;
        gaps += `<path d='M${PP(seg)}' fill='none' stroke='black' stroke-width='${f1(Math.max(0.35, (o.w || 6) * (0.06 + r() * 0.1)))}' stroke-dasharray='${f1(3 + r() * 10)} ${f1(1.5 + r() * 5)}' stroke-linecap='round'/>`;
      }
      defs += `<linearGradient id='${id}g' gradientUnits='userSpaceOnUse' x1='${f1(C[0][0])}' y1='${f1(C[0][1])}' x2='${f1(C[N][0])}' y2='${f1(C[N][1])}'><stop offset='0' stop-color='${c}' stop-opacity='${op}'/><stop offset='1' stop-color='${c}' stop-opacity='${(op * 0.72).toFixed(2)}'/></linearGradient>`;
      if (gaps) defs += `<mask id='${id}m' maskUnits='userSpaceOnUse' x='0' y='0' width='${W}' height='${H}'><rect width='${W}' height='${H}' fill='white'/>${gaps}</mask>`;
      body += `<path d='${d}' fill='url(#${id}g)'${gaps ? ` mask='url(#${id}m)'` : ""}/>`;
    }
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'><defs>${defs}</defs>${body}</svg>`;
}

// ------------------------------------------------------------------
// 路线 (c)：Canvas 位图笔刷 + 没骨淡彩（同一份笔路）
// ------------------------------------------------------------------
let grain = null;
function grainCanvas() {
  if (grain) return grain;
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d"), im = x.createImageData(S, S), r = rng(99), n = noise1(r, 64);
  for (let i = 0; i < S * S; i++) {
    const v = r();
    im.data[i * 4 + 3] = v < 0.5 ? Math.round(255 * Math.pow(1 - v * 2, 2) * 0.9) : 0; // 纸纹颗粒：淡彩落在纸的凹处
  }
  x.putImageData(im, 0, 0);
  return (grain = c);
}
function rgba(c, a) {
  const [r, g, b] = hex2rgb(c);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
function pathOf(x, P) {
  x.beginPath();
  P.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
  x.closePath();
}

function renderCanvas(name, W = 128, H = 128, scale = 1) {
  const cv = document.createElement("canvas");
  cv.width = W * scale, cv.height = H * scale;
  const ctx = cv.getContext("2d");
  ctx.scale(scale, scale);
  const lay = document.createElement("canvas");
  lay.width = cv.width, lay.height = cv.height;
  const lx = lay.getContext("2d");
  const list = ops(name, W, H);
  const K = Math.min(W, H) / 128;
  list.forEach((o, n) => {
    const seed = o.seed || n * 7 + 3, r = rng(seed * 13 + 1);
    if (o.wash) {
      // 没骨：在独立图层上叠几遍、边缘一圈湿痕、再用纸纹颗粒擦去一部分
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, lay.width, lay.height);
      lx.setTransform(scale, 0, 0, scale, 0, 0);
      const { P, cx, cy } = blobPts(o.wash, seed, 0.06);
      const H2 = o.hole ? blobPts(o.hole, seed + 1, 0.04).P : null;
      const soft = (o.soft ?? 1) * K;
      for (let p = 0; p < 4; p++) {
        const s = 1 - p * 0.05 + (r() - 0.5) * 0.03, ox = (r() - 0.5) * 2 * K, oy = (r() - 0.5) * 2 * K;
        lx.filter = `blur(${(soft * (1.6 - p * 0.3) * scale).toFixed(2)}px)`;
        lx.fillStyle = rgba(o.c, o.op * (p === 0 ? 0.55 : 0.22));
        lx.beginPath();
        P.forEach((q, i) => { const x = cx + (q[0] - cx) * s + ox, y = cy + (q[1] - cy) * s + oy; i ? lx.lineTo(x, y) : lx.moveTo(x, y); });
        lx.closePath();
        if (H2) H2.slice().reverse().forEach((q, i) => (i ? lx.lineTo(q[0], q[1]) : lx.moveTo(q[0], q[1])));
        lx.fill("evenodd");
      }
      // 湿边：轮廓处颜料堆积
      lx.filter = `blur(${(0.8 * K * scale).toFixed(2)}px)`;
      lx.strokeStyle = rgba(o.c, o.op * 0.55);
      lx.lineWidth = 1.6 * K;
      pathOf(lx, P);
      lx.stroke();
      lx.filter = "none";
      // 颗粒
      lx.globalCompositeOperation = "destination-out";
      lx.globalAlpha = 0.35;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      const gc = grainCanvas();
      for (let gx = 0; gx < lay.width; gx += 256) for (let gy = 0; gy < lay.height; gy += 256) lx.drawImage(gc, gx - ((seed * 31) % 97), gy - ((seed * 17) % 89));
      lx.globalAlpha = 1;
      lx.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(lay, 0, 0);
      ctx.restore();
    } else if (o.dot) {
      ctx.fillStyle = rgba(o.c || INK, o.op ?? 0.9);
      ctx.filter = `blur(${(0.35 * K * scale).toFixed(2)}px)`;
      ctx.beginPath();
      ctx.arc(o.dot[0], o.dot[1], o.r, 0, 6.283);
      ctx.fill();
      ctx.filter = "none";
    } else {
      // 一笔画在独立图层：墨身 → 尾段飞白（按笔毫行擦出断续空隙）→ 纸纹颗粒擦淡 → 合成时底下垫一层洇开的淡墨
      const c = o.c || INK, op = o.op ?? 0.9, dry = o.dry ?? 0.25;
      const g = strokeGeom(o.s, { ...o, seed });
      const { C, HW, NM, L, R, N } = g;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, lay.width, lay.height);
      lx.setTransform(scale, 0, 0, scale, 0, 0);
      const poly = [...L, ...R.slice().reverse()];
      // 墨身：沿笔路由浓到略淡
      const gr = lx.createLinearGradient(C[0][0], C[0][1], C[N][0], C[N][1]);
      gr.addColorStop(0, rgba(c, op));
      gr.addColorStop(1, rgba(c, op * 0.7));
      lx.fillStyle = gr;
      pathOf(lx, poly);
      lx.fill();
      // 飞白：若干条笔毫行，从行笔后段开始断续擦去
      const wmax = Math.max(...HW) * 2;
      const G = Math.round(dry * (5 + wmax * 1.1));
      lx.globalCompositeOperation = "destination-out";
      lx.lineCap = "round";
      for (let q = 0; q < G; q++) {
        const lane = (r() * 2 - 1) * 0.85, t0 = Math.max(0.04, 1 - dry * (0.3 + r() * 0.7)), i0 = Math.floor(t0 * N);
        lx.lineWidth = Math.max(0.35, wmax * (0.05 + r() * r() * 0.16));
        lx.strokeStyle = `rgba(0,0,0,${(0.55 + r() * 0.45).toFixed(2)})`;
        lx.setLineDash([2 + r() * 9 * K, 1 + r() * 4 * K]);
        lx.beginPath();
        for (let i = i0; i <= N; i++) {
          const x = C[i][0] + NM[i][0] * HW[i] * lane, y = C[i][1] + NM[i][1] * HW[i] * lane;
          i === i0 ? lx.moveTo(x, y) : lx.lineTo(x, y);
        }
        lx.stroke();
      }
      lx.setLineDash([]);
      // 纸纹：墨色落在纸上不是一块平色
      lx.globalAlpha = 0.22;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      const gc = grainCanvas();
      for (let gx = 0; gx < lay.width; gx += 256) for (let gy = 0; gy < lay.height; gy += 256) lx.drawImage(gc, gx - ((seed * 23) % 101), gy - ((seed * 41) % 83));
      lx.globalAlpha = 1;
      lx.globalCompositeOperation = "source-over";
      // 合成：先垫一层洇开的淡墨，再盖墨身
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.28;
      ctx.filter = `blur(${(1.4 * K * scale).toFixed(2)}px)`;
      ctx.drawImage(lay, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.drawImage(lay, 0, 0);
      ctx.restore();
    }
  });
  return cv;
}

// 便捷：把所有 [data-icon] 元素换成图标（mode: "a" SVG / "c" canvas）
function fillIcons(root = document, mode = "c", scale = 2) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    const [w, h] = (el.dataset.box || "1x1").split("x").map(Number);
    const W = 128 * w, H = 128 * h;
    const img = document.createElement("img");
    img.src = mode === "a" ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(renderSVG(el.dataset.icon, W, H)) : renderCanvas(el.dataset.icon, W, H, scale).toDataURL();
    img.className = "ico";
    img.draggable = false;
    el.prepend(img);
  }
}

// ------------------------------------------------------------------
// 路线 (c)：墨拓剪影（碑拓 / 木刻）——由同一份模板自动推出：全部形状并成一块墨，细笔反刻成白线，
// 再用拍墨的斑驳和纸纹擦淡；朱色部件保留为一点朱。零额外绘制成本，小尺寸最清楚，但没有淡彩。
// ------------------------------------------------------------------
let mottle = null;
function mottleCanvas() {
  if (mottle) return mottle;
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d"), r = rng(7);
  x.filter = "blur(3px)";
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(0,0,0,${(r() * 0.5).toFixed(2)})`;
    x.beginPath();
    x.arc(r() * S, r() * S, 2 + r() * 9, 0, 6.283);
    x.fill();
  }
  return (mottle = c);
}
function renderRubbing(name, W = 128, H = 128, scale = 1) {
  const cv = document.createElement("canvas");
  cv.width = W * scale, cv.height = H * scale;
  const ctx = cv.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const list = ops(name, W, H), K = Math.min(W, H) / 128;
  const isZhu = (o) => (o.c || INK) === ZHU;
  const paperDot = (o) => o.dot && (o.c || "").toLowerCase() === "#f5f0e3";
  const draw = (o, n, col) => {
    const seed = o.seed || n * 7 + 3;
    ctx.fillStyle = col;
    if (o.wash) {
      const { P } = blobPts(o.wash, seed, 0.05);
      pathOf(ctx, P);
      if (o.hole) blobPts(o.hole, seed + 1, 0.04).P.slice().reverse().forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.fill("evenodd");
    } else if (o.dot) {
      ctx.beginPath();
      ctx.arc(o.dot[0], o.dot[1], o.r * 1.15, 0, 6.283);
      ctx.fill();
    } else {
      const g = strokeGeom(o.s, { ...o, seed, w: Math.max(o.w || 6, 2.2 * K) * 1.15 });
      pathOf(ctx, [...g.L, ...g.R.slice().reverse()]);
      ctx.fill();
    }
  };
  // 1. 并成一块墨
  list.forEach((o, n) => !isZhu(o) && !paperDot(o) && draw(o, n, INK));
  // 2. 反刻：细笔与高光 → 白线 / 白点
  ctx.globalCompositeOperation = "destination-out";
  list.forEach((o, n) => {
    if (paperDot(o)) return draw(o, n, "#000");
    if (o.wash || o.dot || isZhu(o)) return;
    if ((o.w || 6) > 4.6 * K) return;
    const g = strokeGeom(o.s, { ...o, seed: o.seed || n * 7 + 3, w: Math.max(0.9 * K, (o.w || 6) * 0.42) });
    ctx.fillStyle = "#000";
    pathOf(ctx, [...g.L, ...g.R.slice().reverse()]);
    ctx.fill();
  });
  // 3. 拍墨斑驳 + 纸纹
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.55;
  const mc = mottleCanvas(), gc = grainCanvas();
  for (let gx = 0; gx < cv.width; gx += 256) for (let gy = 0; gy < cv.height; gy += 256) ctx.drawImage(mc, gx, gy);
  ctx.globalAlpha = 0.5;
  for (let gx = 0; gx < cv.width; gx += 256) for (let gy = 0; gy < cv.height; gy += 256) ctx.drawImage(gc, gx, gy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  // 4. 一点朱
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  list.forEach((o, n) => isZhu(o) && draw(o, n, "rgba(184,41,26,.9)"));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.85;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// ---------------- 炼器示意补充模板（同一套笔路格式） ----------------
const mm = (W, H) => { const k = Math.min(W, H) / 128; return [k, (pts) => pts.map(([x, y]) => [W / 2 + (x - 64) * k, H / 2 + (y - 64) * k])]; };
// 兽皮：一张摊开的皮子（赭石没骨 + 几道毛）
T.hide = (W, H, v = {}) => {
  const [k, m] = mm(W, H), c = v.c || PAL.zhe;
  const sil = m([[22, 40], [40, 30], [52, 18], [70, 26], [90, 20], [104, 36], [100, 58], [112, 76], [98, 96], [80, 92], [70, 110], [52, 104], [40, 112], [26, 92], [30, 70], [16, 56]]);
  return [
    { wash: sil, c, op: 0.5, soft: 1.4 },
    { wash: m([[46, 50], [80, 44], [86, 80], [52, 86]]), c, op: 0.28, soft: 2 },
    { s: [...sil, sil[0]], w: 2.6 * k, op: 0.75, taper: 0.2, dry: 0.5, rough: 0.25 },
    { s: m([[50, 46], [56, 60]]), w: 1.4 * k, op: 0.4, taper: 0.5 }, { s: m([[70, 52], [74, 66]]), w: 1.4 * k, op: 0.4, taper: 0.5 },
    { s: m([[58, 76], [62, 90]]), w: 1.4 * k, op: 0.4, taper: 0.5 }, { s: m([[82, 64], [86, 76]]), w: 1.2 * k, op: 0.35, taper: 0.5 },
  ];
};
// 蝠翼：一扇薄翼（黛色淡墨 + 翼骨）
T.wing = (W, H, v = {}) => {
  const [k, m] = mm(W, H), c = v.c || PAL.dai;
  return [
    { wash: m([[20, 30], [64, 20], [112, 30], [104, 58], [90, 70], [76, 62], [64, 80], [50, 66], [36, 74], [26, 58]]), c, op: 0.42, soft: 1.2 },
    { s: m([[18, 30], [64, 18], [112, 28]]), w: 3.4 * k, op: 0.88, taper: 0.2, dry: 0.4, press: 1.2 },
    { s: m([[64, 20], [62, 50], [64, 80]]), w: 1.8 * k, op: 0.6, taper: 0.4 },
    { s: m([[64, 20], [82, 46], [90, 70]]), w: 1.6 * k, op: 0.55, taper: 0.4 },
    { s: m([[64, 20], [44, 44], [36, 74]]), w: 1.6 * k, op: 0.55, taper: 0.4 },
    { s: m([[90, 24], [104, 46], [104, 58]]), w: 1.4 * k, op: 0.5, taper: 0.4 },
    { s: m([[26, 58], [36, 74], [50, 66], [64, 80], [76, 62], [90, 70], [104, 58]]), w: 2 * k, op: 0.6, taper: 0.2, dry: 0.6 },
  ];
};
// 灵丝：一绞丝线（绕成 8 字），一点藤黄
T.silk = (W, H, v = {}) => {
  const [k, m] = mm(W, H), c = v.c || "#e8e0c8";
  return [
    { wash: m([[24, 64], [40, 40], [64, 56], [88, 40], [104, 64], [88, 88], [64, 72], [40, 88]]), c: v.tint || PAL.shilv, op: 0.22, soft: 2 },
    { s: m([[64, 64], [44, 42], [24, 52], [26, 76], [46, 86], [64, 64], [84, 42], [104, 52], [102, 76], [82, 86], [64, 64]]), w: 7 * k, c: PAL.ivory, op: 0.7, taper: 0.1, press: 1 },
    { s: m([[64, 64], [44, 42], [24, 52], [26, 76], [46, 86], [64, 64], [84, 42], [104, 52], [102, 76], [82, 86], [64, 64]]), w: 1.6 * k, op: 0.65, taper: 0.1, dry: 0.4 },
    { s: m([[64, 64], [72, 92], [66, 112]]), w: 1.6 * k, op: 0.55, taper: 0.6 },
    { s: m([[56, 56], [72, 72]]), w: 6 * k, c: PAL.tenghuang, op: 0.85, taper: 0.1, press: 1 },
  ];
};
// 灵土：一抔土，几点金星
T.soil = (W, H, v = {}) => {
  const [k, m] = mm(W, H), c = v.c || PAL.zhe;
  return [
    { wash: m([[18, 100], [36, 66], [58, 50], [80, 56], [100, 74], [112, 100], [64, 110]]), c, op: 0.55, soft: 1.4 },
    { s: m([[16, 102], [36, 68], [58, 50], [82, 56], [104, 78], [114, 102]]), w: 3 * k, op: 0.75, taper: 0.2, dry: 0.55, rough: 0.25 },
    { s: m([[10, 106], [64, 112], [120, 104]]), w: 3.4 * k, op: 0.5, taper: 0.4, dry: 0.6 },
    { s: m([[48, 76], [56, 92]]), w: 1.4 * k, op: 0.4 }, { s: m([[74, 70], [80, 84]]), w: 1.4 * k, op: 0.4 },
    { dot: m([[60, 66]])[0], r: 2.4 * k, c: PAL.nijin, op: 0.9 }, { dot: m([[86, 84]])[0], r: 1.8 * k, c: PAL.nijin, op: 0.8 }, { dot: m([[40, 90]])[0], r: 1.6 * k, c: PAL.nijin, op: 0.7 },
    { dot: m([[64, 34]])[0], r: 1.6 * k, c: PAL.nijin, op: 0.6 },
  ];
};
// 灵核 / 心髓：一块带裂纹的核
T.heart = (W, H, v = {}) => {
  const [k, m] = mm(W, H), c = v.c || PAL.dai;
  const sil = m([[34, 70], [40, 44], [62, 30], [88, 38], [98, 64], [88, 92], [62, 102], [40, 94]]);
  return [
    { wash: circ(m([[64, 66]])[0], 46 * k, 18), c: v.aura || PAL.shiqing, op: 0.12, soft: 5 },
    { wash: sil, c, op: 0.5, soft: 1.2 },
    { s: [...sil, sil[0], sil[1]], w: 3 * k, op: 0.82, taper: 0.2, dry: 0.45, rough: 0.2 },
    { s: m([[52, 44], [60, 62], [54, 76], [64, 92]]), w: 1.8 * k, c: v.vein || PAL.shiqing, op: 0.8, taper: 0.4 },
    { s: m([[60, 62], [78, 64], [86, 52]]), w: 1.4 * k, c: v.vein || PAL.shiqing, op: 0.7, taper: 0.4 },
    { dot: m([[50, 52]])[0], r: 3 * k, c: "#f5f0e3", op: 0.8 },
  ];
};
// 储物袋：赭色兽皮袋 / 蟒皮袋（借锦囊模板换色）
// 珠：灵蚌珠
T.pearl = (W, H, v = {}) => {
  const [k, m] = mm(W, H), cx = W / 2, cy = H / 2 + 6 * k;
  return [
    { wash: m([[18, 92], [40, 70], [64, 66], [88, 70], [110, 92], [64, 104]]), c: PAL.dai, op: 0.3, soft: 1.2 },
    { s: m([[16, 94], [40, 72], [64, 68], [90, 72], [112, 94]]), w: 2.4 * k, op: 0.7, taper: 0.2, dry: 0.5 },
    { wash: circ([cx, cy - 22 * k], 18 * k, 18), c: "#d9d4c8", op: 0.85, soft: 0.8 },
    { s: [...circ([cx, cy - 22 * k], 18 * k, 14).slice(2), ...circ([cx, cy - 22 * k], 18 * k, 14).slice(0, 1)], w: 2 * k, op: 0.7, taper: 0.3 },
    { dot: [cx - 6 * k, cy - 28 * k], r: 4 * k, c: "#ffffff", op: 0.9 },
    { wash: circ([cx, cy - 22 * k], 30 * k, 16), c: PAL.nijin, op: 0.12, soft: 5 },
  ];
};
Object.assign(ITEMS, {
  wolf_hide: ["hide", {}],
  python_skin: ["hide", { c: PAL.jade }],
  bat_wing: ["wing", {}],
  ling_si: ["silk", {}],
  ling_tu: ["soil", {}],
  stone_heart: ["heart", {}],
  vine_heart: ["heart", { c: PAL.shilv, vein: PAL.tenghuang, aura: PAL.shilv }],
  zi_teng: ["herb", { flower: "#8a6aa8", leaf: "#5f8a5a" }],
  water_jade: ["yu", { c: PAL.shiqing }],
  bat_core: ["core", { c: PAL.dai, aura: PAL.shiqing }],
  lingbang_zhu: ["pearl", {}],
  jinnang_qiankun: ["pouch", { c: PAL.shiqing }],
  furnace_part: ["ore", { c: PAL.bronze }],
  fu_metal: ["fu", { el: 1 }], fu_wood: ["fu", { el: 1 }], fu_water: ["fu", { el: 1 }], fu_earth: ["fu", { el: 1 }],
  huqi_fu: ["fu", {}],
  bag_hide: ["pouch", { c: PAL.zhe }],
  bag_python: ["pouch", { c: PAL.jade }],
  pouch_bang: ["pouch", {}],
  pill_bag: ["pill", { pill: PAL.zhe }],
});

window.InkIcons={PAL,ITEMS,renderSVG,renderCanvas,renderRubbing,T};
})();
