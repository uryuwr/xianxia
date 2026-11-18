// 山神庙（精细版，纯程序）：单檐歇山、面阔三间进深两间，带斗拱、格扇、台基踏跺。
// 屋面是一个"平面高度场 + 角部起翘"：每个坡面 = 举折曲线 f(到檐口的水平距离 d) + rise(x, z)；檐口在平面上向四角外撇（出翘）。
//   前后坡 d = zE(x) − |z|，两山 d = xE(z) − |x|；前后坡越过山花向外挑到 XB（博风），两山只到山花 XG（歇山的"收山"）。
//   这样相邻坡面在戗脊处天然连续，瓦垄沿等 x（前后坡）/ 等 z（两山）铺，到戗脊处截断、由戗脊盖住。
// 45° 俯视镜头下屋顶占画面最多，所以细节优先：实例化板瓦 / 筒瓦（每片有厚度、压七露三的台阶）、瓦当 / 滴水、正脊 + 正吻、
//   垂脊 / 戗脊 / 博脊 + 垂兽 / 走兽、博风板 + 悬鱼、山花、连檐 + 飞椽 / 檐椽、屋脊与瓦面上的瓦松草。
// 风化：烘焙贴图里的缝隙积灰 / 磨损 / 地衣（recipes.js）+ 材质里的世界空间苔痕 / 雨痕 / 泥溅（shading.js）+ 顶点接触 AO。
import * as THREE from "three";
import { bakeRecipe, canvasTex } from "./texbake.js";
import { TILE, LACQUER, WOOD, PLASTER, BRICK, STONE, PAVE, CAIHUA } from "./recipes.js";
import { GB, V, boxUV, chamferBox, sweep, merge, setAO, cylUVm, grassClump, orientTris } from "./geo.js";
import { rng } from "../../../src/render/glsl.js";
import { TEMPLE } from "./layout.js";

// ---------------- 尺寸（米，庙内坐标：原点 = 台基中心地面，+z 正面） ----------------
export const DIM = {};
const XC = 4.8, ZC = 3.0; // 檐柱轴线
const OV = 1.7; // 上出（柱轴线到檐口）
const XE = XC + OV, ZE = ZC + OV;
const BUL = 0.45; // 出翘（角部檐口平面外撇）
const RISE = 0.55; // 起翘（角部升高）
const XG = 4.1, XB = 4.45; // 山花面、博风外皮
const Y0 = 4.45; // 檐口高
const PX = 5.9, PZ = 4.2, PH = 0.72; // 台基半宽、半深、高
const COLH = 3.1, COLT = PH + COLH; // 柱高、柱顶
export const TS = 0.8; // 整体缩放：游戏镜头（距 30 米、视角 30°）下主角站在踏跺前时，正脊与吻兽刚好入画
Object.assign(DIM, { XC, ZC, OV, XE, ZE, PX, PZ, PH, COLT, Y0 });

const c01 = (v) => Math.min(1, Math.max(0, v));
const sx = (x) => c01((Math.abs(x) - 2.2) / (XE - 2.2));
const sz = (z) => c01((Math.abs(z) - 0.8) / (ZE - 0.8));
const zE = (x) => ZE + BUL * sx(x) ** 2.2;
const xE = (z) => XE + BUL * sz(z) ** 2.2;
const f = (d) => Y0 + 0.32 * d + 0.036 * Math.pow(Math.max(0, d), 2.4); // 举折：檐口约 18°、脊下约 47°
const rise = (x, z) => RISE * Math.pow(sx(x) * sz(z), 1.5);
const Hf = (x, z) => f(zE(x) - Math.abs(z)) + rise(x, z);
const Hs = (x, z) => f(xE(z) - Math.abs(x)) + rise(x, z);
function bisect(fn, a, b, it = 40) {
  let fa = fn(a);
  for (let k = 0; k < it; k++) {
    const m = (a + b) / 2, fm = fn(m);
    if (fm > 0 === fa > 0) (a = m), (fa = fm);
    else b = m;
  }
  return (a + b) / 2;
}
const xh = (d) => bisect((x) => xE(zE(x) - d) - x - d, 0, 9); // 前后坡在深度 d 处的戗脊 x
const zh = (d) => bisect((z) => zE(xE(z) - d) - z - d, 0, 9); // 两山在深度 d 处的戗脊 z
const dJ = bisect((d) => xh(d) - XB, 0, 4); // 戗脊与垂脊交点（前后坡边到 XB 处）的深度

// 坡面：u = 横向坐标（前后坡为 x、两山为 z），d = 到檐口的水平距离；sg = ±1 哪一侧
function facet(kind, sg) {
  if (kind === "f")
    return {
      kind, sg,
      pt: (u, d, o = V()) => {
        const z = zE(u) - d;
        return o.set(u, f(d) + rise(u, z), sg * z);
      },
      uMax: (d) => Math.max(xh(d), XB),
      dTop: (u) => zE(u),
      dEnd: (u) => (Math.abs(u) <= XB ? zE(u) : bisect((d) => xE(zE(u) - d) - Math.abs(u) - d, 0, zE(u))),
    };
  return {
    kind, sg,
    pt: (u, d, o = V()) => {
      const x = xE(u) - d;
      return o.set(sg * x, f(d) + rise(x, u), u);
    },
    uMax: (d) => zh(d),
    dTop: (u) => xE(u) - XG,
    dEnd: (u) => Math.min(xE(u) - XG, bisect((d) => zE(xE(u) - d) - Math.abs(u) - d, 0, xE(u))),
  };
}
const _a = V(), _b = V(), _c = V(), _d = V();
// 坡面法线（朝上）与下坡方向
function frame(F, u, d, N, D) {
  const e = 0.02;
  F.pt(u - e, d, _a);
  F.pt(u + e, d, _b);
  F.pt(u, d - e, _c);
  F.pt(u, d + e, _d);
  D.subVectors(_c, _d).normalize(); // 下坡（d 减小）
  N.crossVectors(V().subVectors(_b, _a), D).normalize();
  if (N.y < 0) N.negate();
  return N;
}
const FACETS = [facet("f", 1), facet("f", -1), facet("s", 1), facet("s", -1)];

// ---------------- 瓦件模板（局部：x 横、y 沿坡面法线、z 沿下坡；z ∈ [−L, 0]，z = 0 为下端） ----------------
const TL = 0.38, COURSE = 0.27, PITCH = 0.3, STK = 0.022; // 瓦长、每路露出长度（压七露三的意思）、垄距、叠压抬高
function panGeo() {
  const W = 0.27, S = 0.03, T = 0.014, NX = 6;
  const gb = new GB();
  const y0 = (x) => S * (2 * x / W) ** 2;
  const rows = [];
  for (const z of [-TL, 0]) {
    const r = [];
    for (let i = 0; i <= NX; i++) {
      const x = (i / NX - 0.5) * W;
      const lift = STK * (1 + z / TL);
      const n = V(-8 * S * x / (W * W), 1, 0).normalize();
      r.push(gb.vert(V(x, y0(x) + T + lift, z), n, x, z));
    }
    rows.push(r);
  }
  for (let i = 0; i < NX; i++) gb.quad(rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]);
  // 下端厚度面
  const a = [], b = [];
  for (let i = 0; i <= NX; i++) {
    const x = (i / NX - 0.5) * W;
    a.push(gb.vert(V(x, y0(x) + STK, 0), V(0, 0, 1), x, 0));
    b.push(gb.vert(V(x, y0(x) + T + STK, 0), V(0, 0, 1), x, T));
  }
  for (let i = 0; i < NX; i++) gb.quad(a[i], a[i + 1], b[i + 1], b[i]);
  return gb.geometry();
}
const RC = 0.082;
function coverGeo(len = TL) {
  const T = 0.014, NA = 8, base = 0.03;
  const gb = new GB();
  const rows = [];
  for (const z of [-len, 0]) {
    const r = [];
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI;
      const lift = STK * (1 + z / len);
      const n = V(Math.cos(a), Math.sin(a), 0);
      r.push(gb.vert(V(Math.cos(a) * RC, base + Math.sin(a) * RC * 0.9 + lift, z), n, a * RC, z));
    }
    rows.push(r);
  }
  for (let i = 0; i < NA; i++) gb.quad(rows[0][i + 1], rows[1][i + 1], rows[1][i], rows[0][i]);
  // 下端环面（瓦的厚度）
  const o = [], q = [];
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * Math.PI;
    o.push(gb.vert(V(Math.cos(a) * RC, base + Math.sin(a) * RC * 0.9 + STK, 0), V(0, 0, 1), Math.cos(a) * RC, Math.sin(a) * RC));
    q.push(gb.vert(V(Math.cos(a) * (RC - T), base + Math.sin(a) * (RC - T) * 0.9 + STK, 0), V(0, 0, 1), Math.cos(a) * (RC - T), Math.sin(a) * (RC - T)));
  }
  for (let i = 0; i < NA; i++) gb.quad(o[i], q[i], q[i + 1], o[i + 1]);
  return gb.geometry();
}
// 瓦当：圆饼 + 外沿凸棱 + 中心乳钉，面朝下坡（+z）
function wadangGeo() {
  const parts = [
    new THREE.CylinderGeometry(RC + 0.008, RC + 0.008, 0.03, 12, 1, !1).rotateX(Math.PI / 2).translate(0, 0.03 + RC * 0.45, 0.012),
    new THREE.TorusGeometry(RC * 0.72, 0.008, 3, 12).translate(0, 0.03 + RC * 0.45, 0.03),
    new THREE.SphereGeometry(0.024, 6, 3).scale(1, 1, 0.6).translate(0, 0.03 + RC * 0.45, 0.028),
  ];
  return merge(parts);
}
// 滴水：板瓦下端下垂的如意形舌片
function dishuiGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.135, 0);
  s.lineTo(0.135, 0);
  s.quadraticCurveTo(0.12, -0.06, 0.03, -0.085);
  s.quadraticCurveTo(0, -0.12, -0.03, -0.085);
  s.quadraticCurveTo(-0.12, -0.06, -0.135, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: !1, curveSegments: 4 });
  g.rotateX(0.35).translate(0, 0.028 + STK, 0.0);
  return g;
}

// ---------------- 斗拱（单攒，局部：原点在平板枋顶面中心，+z 朝外，+x 沿面宽） ----------------
function gongShape(L, h) {
  const s = new THREE.Shape(), r = h * 0.62;
  s.moveTo(-L / 2, h);
  s.lineTo(L / 2, h);
  s.lineTo(L / 2, h * 0.42);
  s.quadraticCurveTo(L / 2 - r * 0.15, 0.0, L / 2 - r, 0);
  s.lineTo(-L / 2 + r, 0);
  s.quadraticCurveTo(-L / 2 + r * 0.15, 0.0, -L / 2, h * 0.42);
  s.closePath();
  return s;
}
function gong(L, h, dep, along = "x") {
  const g = new THREE.ExtrudeGeometry(gongShape(L, h), { depth: dep, bevelEnabled: !1, curveSegments: 3 }).translate(0, 0, -dep / 2);
  if (along === "z") g.rotateY(Math.PI / 2);
  return g;
}
function bracketGeo() {
  const P = [];
  const box = (sx_, sy_, sz_, x, y, z, c = 0.012) => P.push(chamferBox(sx_, sy_, sz_, c).translate(x, y, z));
  // 大斗（斗欹收分）
  P.push(new THREE.CylinderGeometry(0.15, 0.11, 0.07, 4, 1).rotateY(Math.PI / 4).translate(0, 0.035, 0));
  box(0.3, 0.1, 0.3, 0, 0.12, 0);
  // 正心瓜拱 / 万拱
  P.push(gong(0.92, 0.13, 0.12).translate(0, 0.15, 0));
  P.push(gong(1.32, 0.13, 0.12).translate(0, 0.28, 0));
  // 翘（出跳）
  P.push(gong(0.92, 0.13, 0.12, "z").translate(0, 0.15, 0.2));
  // 外拽厢拱
  P.push(gong(0.72, 0.13, 0.11).translate(0, 0.28, 0.6));
  // 升
  for (const x of [-0.4, 0.4]) box(0.14, 0.07, 0.14, x, 0.315, 0, 0.008);
  for (const x of [-0.3, 0, 0.3]) box(0.14, 0.07, 0.14, x, 0.445, 0.6, 0.008);
  box(0.14, 0.07, 0.14, 0, 0.315, 0.6, 0.008);
  // 昂：由内向外斜下、尖嘴
  {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0.5);
    s.lineTo(0.62, 0.36);
    s.lineTo(0.98, 0.2);
    s.lineTo(0.92, 0.28);
    s.lineTo(0.6, 0.3);
    s.lineTo(-0.3, 0.4);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.11, bevelEnabled: !1, curveSegments: 2 }).translate(0, 0, -0.055).rotateY(-Math.PI / 2);
    P.push(g);
  }
  // 耍头 + 撑头木（顶层向外的方木）
  box(0.11, 0.13, 1.1, 0, 0.57, 0.25, 0.01);
  return merge(P.map((g) => boxUV(g.index ? g.toNonIndexed() : g, [Math.random() * 3, Math.random() * 3])));
}

// ---------------- 小件 ----------------
function latticeTex() {
  // 步步锦棂格：0.3 米一格的透明底木棂（alphaTest 抠形）；格心画在 256×256 = 0.3×0.3 米
  return canvasTex(256, 256, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = "#ffffff";
    const b = 13;
    const bar = (x, y, ww, hh) => ctx.fillRect(x, y, ww, hh);
    bar(0, 0, w, b / 2);
    bar(0, w - b / 2, w, b / 2);
    bar(0, 0, b / 2, w);
    bar(w - b / 2, 0, b / 2, w);
    // 步步锦：一圈圈向内收的短棂
    for (const k of [0.22, 0.42]) {
      const s = w * k;
      bar(s, s * 0.5, b, w - s);
      bar(w - s - b, s * 0.5, b, w - s);
      bar(s * 0.5, s, w - s, b);
      bar(s * 0.5, w - s - b, w - s, b);
    }
    bar(w / 2 - b / 2, w * 0.15, b, w * 0.2);
    bar(w / 2 - b / 2, w * 0.65, b, w * 0.2);
    bar(w * 0.15, w / 2 - b / 2, w * 0.2, b);
    bar(w * 0.65, w / 2 - b / 2, w * 0.2, b);
  }, "lattice");
}
function plaqueTex() {
  return canvasTex(512, 200, (ctx, w, h) => {
    ctx.fillStyle = "#1f2a3a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b08a3c";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, w - 52, h - 52);
    ctx.fillStyle = "#c9a14e";
    ctx.font = "120px KaiTi, STKaiti, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("山 神 庙", w / 2, h / 2 + 6);
  }, "plaque");
}

// 吻兽（+x 端，口朝 −x 吞脊）：头块 + 上卷的身子与卷尾 + 背鳍 + 剑把
function chiwenGeo() {
  const P = [];
  P.push(chamferBox(0.42, 0.62, 0.4, 0.05).translate(0.06, 0.31, 0));
  // 上下颌（吞脊）
  P.push(chamferBox(0.24, 0.12, 0.36, 0.03).translate(-0.2, 0.62, 0));
  P.push(chamferBox(0.2, 0.1, 0.34, 0.03).translate(-0.16, 0.08, 0));
  // 眼
  for (const s of [-1, 1]) P.push(new THREE.SphereGeometry(0.05, 6, 4).translate(-0.08, 0.5, s * 0.2));
  // 身与卷尾
  const pts = [[0.08, 0.55], [0.12, 0.85], [0.16, 1.08], [0.1, 1.26], [-0.04, 1.34], [-0.17, 1.28], [-0.2, 1.14], [-0.12, 1.04], [-0.02, 1.08], [-0.03, 1.17]].map(([x, y]) => V(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const path = curve.getPoints(28);
  const prof = [];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    prof.push([Math.cos(a) * 0.15, Math.sin(a) * 0.11]);
  }
  P.push(sweep(path, prof, { up: V(0, 0, 1), scale: (t) => 1 - 0.72 * t }));
  // 背鳍
  for (let k = 0; k < 4; k++) {
    const t = 0.15 + k * 0.13, p = curve.getPoint(t), tg = curve.getTangent(t);
    const out = V(tg.y, -tg.x, 0).normalize();
    const cone = new THREE.ConeGeometry(0.05, 0.16, 4).rotateZ(-Math.atan2(out.x, out.y));
    P.push(cone.translate(p.x + out.x * 0.12, p.y + out.y * 0.12, 0));
  }
  // 剑把
  P.push(chamferBox(0.05, 0.34, 0.1, 0.01).rotateZ(-0.35).translate(0.2, 1.18, 0));
  P.push(chamferBox(0.14, 0.05, 0.14, 0.01).rotateZ(-0.35).translate(0.15, 1.04, 0));
  return merge(P.map((g) => boxUV(g.index ? g.toNonIndexed() : g)));
}
// 小兽（垂兽 / 走兽 / 仙人）：蹲坐的方块小兽
function beastGeo(s = 1, kind = "beast") {
  const P = [];
  if (kind === "xian") {
    P.push(chamferBox(0.1, 0.2, 0.08, 0.02).translate(0, 0.1, 0));
    P.push(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.24, 0));
    P.push(chamferBox(0.16, 0.04, 0.14, 0.01).translate(0, 0.02, 0));
  } else {
    P.push(chamferBox(0.16, 0.14, 0.11, 0.025).translate(0, 0.08, 0));
    P.push(chamferBox(0.1, 0.12, 0.1, 0.025).translate(-0.06, 0.2, 0));
    P.push(new THREE.ConeGeometry(0.02, 0.07, 4).translate(-0.04, 0.29, 0.03));
    P.push(new THREE.ConeGeometry(0.02, 0.07, 4).translate(-0.04, 0.29, -0.03));
  }
  return merge(P.map((g) => g.scale(s, s, s)));
}

// ---------------- 主体 ----------------
export function buildTemple(renderer, looks) {
  const R = rng(7);
  const g = new THREE.Group();
  g.name = "new-temple";
  g.position.set(TEMPLE.x, 0, TEMPLE.z);
  g.scale.setScalar(TS);
  const T = {
    tile: bakeRecipe(renderer, TILE),
    lacquer: bakeRecipe(renderer, LACQUER),
    wood: bakeRecipe(renderer, WOOD),
    plaster: bakeRecipe(renderer, PLASTER),
    brick: bakeRecipe(renderer, BRICK),
    stone: bakeRecipe(renderer, STONE),
    pave: bakeRecipe(renderer, PAVE),
    caihua: bakeRecipe(renderer, CAIHUA),
  };
  const L = {
    tile: { key: "tile", tex: T.tile, color: 0xffffff, uvOff: !0, weather: { moss: 0.45 }, nrm: 1, brushS: 0.6, inkK: 0.35, envK: 0.8 },
    ridge: { key: "ridge", tex: T.tile, color: 0xd8dcde, weather: { moss: 0.3, streak: 0.4 }, brushS: 0.6, vao: !0, envK: 0.8 },
    bed: { key: "bed", tex: T.tile, color: 0x4a4a48, weather: { moss: 0.5 } },
    lacquer: { key: "lacquer", tex: T.lacquer, weather: { streak: 0.35, dirt: 0.35, dirtY: PH * TS }, vao: !0, envK: 0.7 },
    gable: { key: "gable", tex: T.lacquer, color: 0xc8b4a8, weather: { streak: 0.6 }, vao: !0 },
    wood: { key: "wood", tex: T.wood, weather: { streak: 0.3 }, vao: !0 },
    under: { key: "under", tex: T.wood, color: 0xb58a72, vao: !0 },
    plaster: { key: "plaster", tex: T.plaster, weather: { streak: 0.85, dirt: 0.55, dirtY: PH * TS, moss: 0.15 }, vao: !0 },
    brick: { key: "brick", tex: T.brick, weather: { streak: 0.4, dirt: 0.7, dirtY: PH * TS, moss: 0.3 }, vao: !0 },
    stone: { key: "stone", tex: T.stone, weather: { streak: 0.5, dirt: 0.6, dirtY: 0, moss: 0.55 }, vao: !0 },
    pave: { key: "pave", tex: T.pave, weather: { moss: 0.35, dirt: 0.2, dirtY: PH * TS }, vao: !0 },
    caihua: { key: "caihua", tex: T.caihua, weather: { streak: 0.2 }, vao: !0 },
    lattice: { key: "lattice", map: latticeTex(), color: 0x7a5a48, alphaTest: 0.5, side: THREE.DoubleSide, noMaps: !0 },
    paper: { key: "paper", color: 0xd6ccb2, side: THREE.DoubleSide, weather: { streak: 0.5 } },
    dark: { key: "dark", color: 0x2a2622, side: THREE.BackSide },
    plaque: { key: "plaque", map: plaqueTex(), noMaps: !0 },
    statue: { key: "statue", color: 0xb88a3a, emissive: 0x2a1a08 },
    tuft: { key: "tuft", color: 0x8a9a6a, vertexColors: !0, side: THREE.DoubleSide, wind: [0.04, 0.35] },
  };
  const add = (geo, look, o = {}) => {
    const m = new THREE.Mesh(geo, null);
    looks.use(m, look);
    m.castShadow = o.cast ?? !0;
    m.receiveShadow = !0;
    if (o.name) m.name = o.name;
    if (o.detail) m.userData.detail = !0; // 游戏预算档隐藏（45° 镜头下基本看不到的近景细节）
    g.add(m);
    return m;
  };
  const stats = { tiles: 0, covers: 0, ends: 0 };

  // ===== 屋面：垫层（瓦下灰泥）、望板底面、连檐 =====
  {
    const bed = [], under = [], fascia = [];
    const N = V(), D = V(), p = V();
    for (const F of FACETS) {
      const front = F.kind === "f";
      const NC = front ? 64 : 40, NR = front ? 22 : 10;
      const D0 = front ? ZE : XE - XG;
      // 垫层：网格 (s, t) → (u, d)，两次迭代让顶边贴住正脊 / 山花
      const gb = new GB(), gu = new GB();
      const ids = [], idu = [];
      for (let j = 0; j <= NR; j++) {
        const t = j / NR;
        const row = [], rowu = [];
        for (let i = 0; i <= NC; i++) {
          const s = (i / NC) * 2 - 1;
          let d = t * D0, u = s * F.uMax(d);
          d = t * F.dTop(u);
          u = s * F.uMax(d);
          F.pt(u, d, p);
          frame(F, u, d, N, D);
          row.push(gb.vert(V().copy(p).addScaledVector(N, -0.01), N, u, d));
          if (d < 2.2) rowu.push(gu.vert(V().copy(p).addScaledVector(N, -0.26), V().copy(N).negate(), u, d));
        }
        ids.push(row);
        if (rowu.length) idu.push(rowu);
      }
      const flip = (F.kind === "f") === (F.sg > 0);
      for (let j = 0; j < NR; j++)
        for (let i = 0; i < NC; i++) flip ? gb.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]) : gb.quad(ids[j][i], ids[j + 1][i], ids[j + 1][i + 1], ids[j][i + 1]);
      for (let j = 0; j < idu.length - 1; j++)
        for (let i = 0; i < NC; i++) flip ? gu.quad(idu[j][i], idu[j + 1][i], idu[j + 1][i + 1], idu[j][i + 1]) : gu.quad(idu[j][i], idu[j][i + 1], idu[j + 1][i + 1], idu[j + 1][i]);
      bed.push(orientTris(gb.geometry()));
      under.push(setAO(orientTris(gu.geometry()), 0.7));
      // 连檐：檐口一圈竖向板（瓦下 0.04 到 0.28）
      const gf = new GB();
      const um = F.uMax(0), NS = 48;
      let prev = null;
      for (let i = 0; i <= NS; i++) {
        const u = -um + (2 * um * i) / NS;
        F.pt(u, 0, p);
        frame(F, u, 0, N, D);
        const top = V().copy(p).addScaledVector(N, -0.03), bot = V().copy(top).add(V(0, -0.22, 0));
        const out = V(D.x, 0, D.z).normalize();
        const a = gf.vert(top, out, u, 0), b = gf.vert(bot, out, u, 0.22);
        if (prev) flip ? gf.quad(prev[0], prev[1], b, a) : gf.quad(prev[0], a, b, prev[1]);
        prev = [a, b];
      }
      fascia.push(orientTris(gf.geometry()));
    }
    add(merge(bed), L.bed, { cast: !0, name: "roof-bed" });
    add(merge(under), L.under, { cast: !1, name: "roof-under", detail: !0 });
    add(merge(fascia), L.wood, { cast: !1, name: "fascia" });
  }

  // ===== 瓦：板瓦 / 筒瓦（实例化）、瓦当 / 滴水 =====
  {
    const pans = [], covers = [], wadang = [], dishui = [];
    const N = V(), D = V(), Rt = V(), p = V(), q = V();
    const M = new THREE.Matrix4();
    const place = (list, F, u, d, jit, lift = 0) => {
      F.pt(u, d, p);
      frame(F, u, d, N, D);
      Rt.crossVectors(N, D).normalize();
      if (jit) {
        const roll = (R() - 0.5) * jit, yaw = (R() - 0.5) * jit * 0.6;
        Rt.applyAxisAngle(D, roll);
        N.applyAxisAngle(D, roll);
        D.applyAxisAngle(N, yaw);
        Rt.crossVectors(N, D).normalize();
      }
      N.crossVectors(D, Rt).normalize();
      M.makeBasis(Rt, N, D).setPosition(p.x, p.y + lift, p.z);
      list.push(M.clone());
    };
    for (const F of FACETS) {
      const um = F.uMax(0);
      const n = Math.floor(um / (PITCH / 2));
      for (let k = -n; k <= n; k++) {
        const u = (k * PITCH) / 2;
        const isCover = Math.abs(k) % 2 === 1;
        const dEnd = F.dEnd(u) - (isCover ? 0.1 : 0.16);
        if (dEnd < 0.2) continue;
        // 沿坡按弧长一路一路铺
        let d = 0, first = !0;
        while (d < dEnd - COURSE * 0.35) {
          if (isCover) {
            if (!(R() < 0.012 && !first)) place(covers, F, u, d, 0.05);
          } else place(pans, F, u, d, 0.035);
          if (first) {
            if (isCover) place(wadang, F, u, d, 0.02);
            else place(dishui, F, u, d, 0.02);
            first = !1;
          }
          // 弧长步进
          F.pt(u, d, p);
          let dd = d, s = 0;
          while (s < COURSE && dd < dEnd + 1) {
            dd += 0.01;
            F.pt(u, dd, q);
            s = q.distanceTo(p);
          }
          d = dd;
        }
      }
    }
    const inst = (geo, list, look, cast = !0, name = "tiles") => {
      const m = new THREE.InstancedMesh(geo, null, list.length);
      m.name = name;
      const off = new Float32Array(list.length * 2);
      const c = new THREE.Color();
      list.forEach((mm, i) => {
        m.setMatrixAt(i, mm);
        off[i * 2] = R();
        off[i * 2 + 1] = R();
        const k = 0.86 + 0.24 * R();
        m.setColorAt(i, c.setRGB(k, k * (0.98 + 0.04 * R()), k * (0.98 + 0.05 * R())));
      });
      geo.setAttribute("aUvOff", new THREE.InstancedBufferAttribute(off, 2));
      m.computeBoundingSphere();
      looks.use(m, look);
      m.castShadow = cast;
      m.receiveShadow = !0;
      g.add(m);
      return m;
    };
    // 瓦片不投影：屋面整体的影子由垫层（roof-bed）投出；瓦垄自身的细小自阴影在 4096 / 76 米（1.9 厘米 / 像素）的阴影贴图里几乎看不出，
    // 集显实测瓦片投影约占阴影 pass 的一半（见 建筑与环境.md）
    inst(panGeo(), pans, L.tile, !1, "tiles-pan");
    inst(coverGeo(), covers, L.tile, !1, "tiles-cover");
    inst(wadangGeo(), wadang, L.tile, !1, "tiles-wadang");
    inst(dishuiGeo(), dishui, L.tile, !1, "tiles-dishui");
    stats.pans = pans.length;
    stats.covers = covers.length;
    stats.ends = wadang.length + dishui.length;
  }

  // ===== 屋脊：正脊 + 正吻、垂脊 + 垂兽、戗脊 + 走兽、博脊 =====
  {
    const ridgeProf = [[-0.3, -0.06], [-0.3, 0.05], [-0.22, 0.07], [-0.22, 0.13], [-0.27, 0.15], [-0.27, 0.21], [-0.2, 0.23], [-0.2, 0.6], [-0.25, 0.62], [-0.25, 0.68], [-0.13, 0.72], [-0.06, 0.76], [0, 0.77], [0.06, 0.76], [0.13, 0.72], [0.25, 0.68], [0.25, 0.62], [0.2, 0.6], [0.2, 0.23], [0.27, 0.21], [0.27, 0.15], [0.22, 0.13], [0.22, 0.07], [0.3, 0.05], [0.3, -0.06]];
    const sc = (k) => ridgeProf.map(([a, b]) => [a * k, b * k]);
    const parts = [], decor = [];
    // 正脊：两端略升（生起）
    {
      const path = [];
      for (let i = 0; i <= 30; i++) {
        const x = -XB - 0.05 + ((2 * XB + 0.1) * i) / 30;
        path.push(V(x, Hf(x, 0) - 0.06 + 0.08 * (x / XB) ** 4, 0));
      }
      parts.push(setAO(sweep(path, ridgeProf, { caps: !0 }), (v) => 0.75 + 0.25 * Math.min(1, (v.y - 7.7) / 0.6)));
      const cw = chiwenGeo();
      for (const s of [-1, 1]) {
        const c = cw.clone();
        if (s < 0) c.scale(-1, 1, 1), c.index ? c.index.array.reverse() : reverseWinding(c);
        c.translate(s * (XB + 0.02), Hf(XB, 0) + 0.02, 0);
        decor.push(c);
      }
    }
    // 垂脊（前后坡边）与戗脊（沿角脊到翼角）
    const zJ = zE(XB) - dJ;
    for (const sgx of [-1, 1])
      for (const sgz of [-1, 1]) {
        const xr = XB - 0.1;
        const path = [];
        for (let i = 0; i <= 16; i++) {
          const z = (zJ * i) / 16;
          path.push(V(sgx * xr, Hf(xr, z) - 0.04, sgz * z));
        }
        parts.push(sweep(path, sc(0.62), { caps: !0 }));
        // 垂兽
        const b = beastGeo(1.5);
        b.rotateY(sgz > 0 ? -Math.PI / 2 : Math.PI / 2);
        const e = path[path.length - 1];
        decor.push(b.translate(e.x, e.y + 0.38, e.z - sgz * 0.18));
        // 戗脊：沿角脊线 d 从 dJ 到 0，再外挑 0.45 并上翘
        const hp = [];
        for (let i = 0; i <= 24; i++) {
          const d = dJ * (1 - i / 24);
          const x = xh(d), z = zE(x) - d;
          hp.push(V(sgx * x, f(d) + rise(x, z) - 0.04, sgz * z));
        }
        const last = hp[hp.length - 1], prev = hp[hp.length - 3];
        const dir = V().subVectors(last, prev).setY(0).normalize();
        for (let k = 1; k <= 5; k++) {
          const t = k / 5;
          hp.push(V().copy(last).addScaledVector(dir, 0.45 * t).add(V(0, 0.05 * t + 0.32 * t * t, 0)));
        }
        parts.push(sweep(hp, sc(0.5), { caps: !0, scale: (t) => 1 - 0.35 * Math.max(0, t - 0.75) / 0.25 }));
        // 走兽三只 + 仙人（翼角端）
        for (let k = 0; k < 4; k++) {
          const idx = hp.length - 7 - k * 3;
          const pp = hp[Math.max(0, idx)], pq = hp[Math.max(0, idx - 1)];
          const ang = Math.atan2(pq.x - pp.x, pq.z - pp.z);
          const bg = beastGeo(1.0, k === 0 ? "xian" : "beast").rotateY(ang + Math.PI / 2);
          decor.push(bg.translate(pp.x, pp.y + 0.33, pp.z));
        }
      }
    // 博脊：山花脚下，沿 z
    for (const sgx of [-1, 1]) {
      const zt = zh(XE - XG) - 0.05;
      const path = [];
      for (let i = 0; i <= 12; i++) {
        const z = -zt + (2 * zt * i) / 12;
        path.push(V(sgx * (XG + 0.12), Hs(XG + 0.12, z) - 0.02, z));
      }
      parts.push(sweep(path, sc(0.45), { caps: !0 }));
    }
    add(merge(parts), L.ridge, { name: "ridges" });
    add(merge(decor), L.ridge, { name: "ridge-beasts" });
  }

  // ===== 山花、博风板、悬鱼 =====
  {
    const gable = [], boards = [];
    const zJ = zE(XB) - dJ;
    for (const sgx of [-1, 1]) {
      const gb = new GB();
      const NS = 30, zt = zh(XE - XG);
      const nrm = V(sgx, 0, 0);
      let prev = null;
      for (let i = 0; i <= NS; i++) {
        const z = -zt + (2 * zt * i) / NS;
        const top = Hf(XG, z) - 0.24, bot = Hs(XG, z) - 0.05;
        const a = gb.vert(V(sgx * XG, Math.max(top, bot), z), nrm, z, Math.max(top, bot));
        const b = gb.vert(V(sgx * XG, bot, z), nrm, z, bot);
        if (prev) sgx > 0 ? gb.quad(prev[1], b, a, prev[0]) : gb.quad(prev[1], prev[0], a, b);
        prev = [a, b];
      }
      gable.push(setAO(orientTris(gb.geometry()), (v) => 0.55 + 0.45 * Math.min(1, Math.max(0, (Hf(XG, v.z) - 0.24 - v.y) / 1.2))));
      // 博风板（前后两段，从正脊到垂脊脚）
      for (const sgz of [-1, 1]) {
        const path = [];
        for (let i = 0; i <= 18; i++) {
          const z = (zJ * i) / 18;
          path.push(V(sgx * (XB - 0.02), Hf(XB, z) - 0.06, sgz * z));
        }
        boards.push(sweep(path, [[-0.04, -0.4], [-0.04, 0], [0.04, 0], [0.04, -0.4], [-0.04, -0.4]], { caps: !0 }));
      }
      // 悬鱼
      boards.push(chamferBox(0.08, 0.7, 0.4, 0.02).translate(sgx * (XB + 0.02), Hf(XB, 0) - 0.55, 0));
    }
    add(merge(gable), L.gable, { name: "gable" });
    add(merge(boards), L.lacquer, { name: "bofeng" });
  }

  // ===== 椽子：飞椽（方）、檐椽（圆），沿四面檐口 =====
  {
    const fei = [], yan = [];
    const N = V(), D = V(), Rt = V(), p = V();
    const M = new THREE.Matrix4();
    for (const F of FACETS) {
      const um = F.uMax(0) - 0.25;
      for (let u = -um; u <= um; u += 0.3) {
        for (const [list, d0, drop] of [[fei, 0.33, 0.29], [yan, 0.95, 0.42]]) {
          F.pt(u, d0, p);
          frame(F, u, d0, N, D);
          Rt.crossVectors(N, D).normalize();
          N.crossVectors(D, Rt).normalize();
          M.makeBasis(Rt, N, D).setPosition(p.x - N.x * drop, p.y - N.y * drop, p.z - N.z * drop);
          list.push(M.clone());
        }
      }
    }
    const instL = (geo, list, look) => {
      const m = new THREE.InstancedMesh(boxUV(geo.toNonIndexed()), null, list.length);
      list.forEach((mm, i) => m.setMatrixAt(i, mm));
      m.computeBoundingSphere();
      looks.use(m, look);
      m.castShadow = !1;
      m.receiveShadow = !0;
      m.userData.detail = !0;
      m.name = "rafters";
      g.add(m);
    };
    instL(new THREE.BoxGeometry(0.09, 0.09, 0.72), fei, L.wood);
    instL(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 7).rotateX(Math.PI / 2), yan, L.wood);
    stats.rafters = fei.length + yan.length;
  }

  // ===== 斗拱、檩枋 =====
  {
    const bg = bracketGeo();
    const list = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    const put = (x, z, yaw) => list.push(M.compose(V(x, COLT + 0.12, z), Q.setFromEuler(new THREE.Euler(0, yaw, 0)), V(1, 1, 1)).clone());
    const xs = [-4.8, -3.3, -1.8, -0.6, 0.6, 1.8, 3.3, 4.8];
    for (const x of xs) put(x, ZC, 0), put(x, -ZC, Math.PI);
    for (const z of [-1.5, 0, 1.5]) put(XC, z, Math.PI / 2), put(-XC, z, -Math.PI / 2);
    for (const sx_ of [-1, 1]) for (const sz_ of [-1, 1]) put(sx_ * XC, sz_ * ZC, Math.atan2(sx_, sz_));
    const m = new THREE.InstancedMesh(bg, null, list.length);
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.computeBoundingSphere();
    looks.use(m, L.caihua);
    m.name = "brackets";
    m.userData.detail = !0;
    m.castShadow = !0;
    m.receiveShadow = !0;
    g.add(m);
    stats.brackets = list.length;
    // 额枋（彩画）+ 平板枋 + 挑檐檩
    const beams = [], purl = [];
    for (const s of [-1, 1]) {
      beams.push(chamferBox(2 * XC + 0.4, 0.42, 0.24, 0.02).translate(0, COLT - 0.21, s * ZC));
      beams.push(chamferBox(0.24, 0.42, 2 * ZC + 0.4, 0.02).translate(s * XC, COLT - 0.21, 0));
      beams.push(chamferBox(2 * XC + 0.5, 0.12, 0.32, 0.015).translate(0, COLT + 0.06, s * ZC));
      beams.push(chamferBox(0.32, 0.12, 2 * ZC + 0.5, 0.015).translate(s * XC, COLT + 0.06, 0));
      const py = COLT + 0.62;
      purl.push(new THREE.CylinderGeometry(0.11, 0.11, 2 * (XC + 0.62) + 0.3, 10).rotateZ(Math.PI / 2).translate(0, py, s * (ZC + 0.6)));
      purl.push(new THREE.CylinderGeometry(0.11, 0.11, 2 * (ZC + 0.62) + 0.3, 10).rotateX(Math.PI / 2).translate(s * (XC + 0.6), py, 0));
      purl.push(chamferBox(2 * XC + 1.2, 0.16, 0.12, 0.01).translate(0, COLT + 0.5, s * (ZC + 0.6)));
      purl.push(chamferBox(0.12, 0.16, 2 * ZC + 1.2, 0.01).translate(s * (XC + 0.6), COLT + 0.5, 0));
    }
    add(merge(beams.map((b) => setAO(boxUV(b.index ? b.toNonIndexed() : b), 0.85))), L.caihua, { name: "beams" });
    add(merge(purl.map((b) => setAO(boxUV(b.index ? b.toNonIndexed() : b), 0.6))), L.wood, { cast: !1, name: "purlins", detail: !0 });
  }

  // ===== 柱、柱础 =====
  {
    const cols = [], bases = [];
    const pos = [];
    for (const x of [-4.8, -1.8, 1.8, 4.8]) for (const z of [-ZC, ZC]) pos.push([x, z]);
    pos.push([-XC, 0], [XC, 0]);
    for (const [x, z] of pos) {
      const c = cylUVm(new THREE.CylinderGeometry(0.17, 0.19, COLH, 16, 4, !0), 0.18, COLH).translate(x, PH + COLH / 2, z);
      cols.push(setAO(c, (v) => 0.6 + 0.4 * Math.min(1, (v.y - PH) / 0.8)));
      bases.push(boxUV(new THREE.CylinderGeometry(0.25, 0.28, 0.16, 16).toNonIndexed().translate(x, PH + 0.08, z)));
      bases.push(boxUV(chamferBox(0.66, 0.06, 0.66, 0.015).translate(x, PH + 0.02, z)));
    }
    add(merge(cols), L.lacquer, { name: "columns" });
    add(merge(bases.map((b) => setAO(b, 0.75))), L.stone, { name: "col-bases" });
  }

  // ===== 墙（后、两山：下碱青砖 + 上身赭红抹灰；前檐：槛墙 + 槛窗 + 格扇门） =====
  {
    const brick = [], plaster = [];
    const wallTop = COLT - 0.42;
    const aoWall = (v) => (0.55 + 0.45 * Math.min(1, Math.max(0, (v.y - PH) / 0.7))) * (1 - 0.35 * Math.max(0, (v.y - (wallTop - 0.9)) / 0.9));
    // 后墙、山墙
    for (const s of [-1, 1]) {
      brick.push(chamferBox(2 * XC + 0.56, 1.0, 0.56, 0.02).translate(0, PH + 0.5, -ZC).toNonIndexed());
      if (s > 0) plaster.push(chamferBox(2 * XC + 0.5, wallTop - PH - 1.0, 0.5, 0.03).translate(0, PH + 1.0 + (wallTop - PH - 1.0) / 2, -ZC).toNonIndexed());
      brick.push(chamferBox(0.56, 1.0, 2 * ZC, 0.02).translate(s * XC, PH + 0.5, 0).toNonIndexed());
      plaster.push(chamferBox(0.5, wallTop - PH - 1.0, 2 * ZC, 0.03).translate(s * XC, PH + 1.0 + (wallTop - PH - 1.0) / 2, 0).toNonIndexed());
      // 前檐槛墙（次间）
      brick.push(chamferBox(3.0 - 0.38, 0.85, 0.36, 0.02).translate(s * 3.3, PH + 0.425, ZC).toNonIndexed());
    }
    add(merge(brick.map((b) => setAO(boxUV(b, [R() * 2, R() * 2]), aoWall))), L.brick, { name: "walls-brick" });
    add(merge(plaster.map((b) => setAO(boxUV(b, [R() * 3, R() * 3]), aoWall))), L.plaster, { name: "walls-plaster" });
    // 门窗：框（木）、棂格（透明贴图）、窗纸
    const frames = [], latt = [], paper = [], panels = [];
    const leaf = (x0, w, y0, h, open, hinge) => {
      // 单扇格扇：边梃 + 抹头 + 上部格心（棂格 + 纸）+ 下部裙板；open = 内开角度，绕 hinge（x）转
      const parts = [], lp = [], pp = [];
      const fw = 0.07;
      parts.push(chamferBox(fw, h, 0.07, 0.01).translate(x0 + fw / 2, y0 + h / 2, 0), chamferBox(fw, h, 0.07, 0.01).translate(x0 + w - fw / 2, y0 + h / 2, 0));
      const hx = h > 1.6 ? 0.6 : 1.0; // 格心占比
      const yL = y0 + h * (1 - hx), yT = y0 + h - fw;
      for (const y of [y0 + fw / 2, yL - fw / 2, yL + 0.0, y0 + h - fw / 2]) parts.push(chamferBox(w - 2 * fw, fw, 0.07, 0.01).translate(x0 + w / 2, y, 0));
      if (h > 1.6) {
        parts.push(chamferBox(w - 2 * fw, yL - y0 - 2 * fw, 0.04, 0.01).translate(x0 + w / 2, (y0 + yL) / 2, -0.01));
        // 裙板上的如意纹凸起
        parts.push(chamferBox((w - 2 * fw) * 0.6, (yL - y0) * 0.4, 0.03, 0.01).translate(x0 + w / 2, (y0 + yL) / 2, 0.02));
      }
      const lw = w - 2 * fw, lh = yT - yL - fw / 2;
      const pl = new THREE.PlaneGeometry(lw, lh);
      const uv = pl.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * lw) / 0.3, (uv.getY(i) * lh) / 0.3);
      lp.push(pl.translate(x0 + w / 2, yL + fw / 2 + lh / 2, 0.012));
      pp.push(new THREE.PlaneGeometry(lw, lh).translate(x0 + w / 2, yL + fw / 2 + lh / 2, -0.02));
      const tf = (geo) => {
        if (open) geo.translate(-hinge, 0, 0).rotateY(open).translate(hinge, 0, 0);
        return geo.translate(0, 0, ZC + 0.02);
      };
      for (const q of parts) frames.push(boxUV(tf(q.toNonIndexed ? q.toNonIndexed() : q)));
      for (const q of lp) latt.push(tf(q));
      for (const q of pp) paper.push(tf(q));
    };
    // 明间四扇格扇门（中间两扇半开）
    const dw = (3.6 - 0.38) / 4;
    for (let k = 0; k < 4; k++) {
      const x0 = -1.61 + k * dw;
      const open = k === 1 ? 1.1 : k === 2 ? -1.1 : 0;
      leaf(x0, dw, PH + 0.16, 2.45, open, k === 1 ? x0 : x0 + dw);
    }
    // 次间槛窗
    for (const s of [-1, 1]) {
      const w4 = (3.0 - 0.38) / 4;
      for (let k = 0; k < 4; k++) leaf(s * 1.99 + (s > 0 ? 0 : -2.62) + k * w4, w4, PH + 0.95, 1.75, 0, 0);
    }
    // 横披窗（明间、次间门窗上方）与槛框
    for (const [x0, w] of [[-1.61, 3.22], [1.99, 2.62], [-4.61, 2.62]]) {
      const pl = new THREE.PlaneGeometry(w, 0.38);
      const uv = pl.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.3, (uv.getY(i) * 0.38) / 0.3);
      latt.push(pl.translate(x0 + w / 2, wallTop - 0.25, ZC + 0.03));
      paper.push(new THREE.PlaneGeometry(w, 0.38).translate(x0 + w / 2, wallTop - 0.25, ZC - 0.01));
      frames.push(boxUV(chamferBox(w, 0.1, 0.12, 0.01).translate(x0 + w / 2, wallTop - 0.48, ZC + 0.02).toNonIndexed()));
      frames.push(boxUV(chamferBox(w, 0.08, 0.12, 0.01).translate(x0 + w / 2, wallTop - 0.04, ZC + 0.02).toNonIndexed()));
    }
    frames.push(boxUV(chamferBox(3.3, 0.16, 0.16, 0.02).translate(0, PH + 0.08, ZC + 0.02).toNonIndexed())); // 门槛
    add(merge(frames.map((b) => setAO(b, 0.8))), L.wood, { name: "joinery" });
    add(merge(latt), L.lattice, { cast: !1, name: "lattice" });
    add(merge(paper), L.paper, { cast: !1, name: "paper" });
    // 室内：暗盒 + 神台 + 山神像（从半开的门里看得到）
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2 * XC - 0.5, wallTop - PH, 2 * ZC - 0.5).translate(0, (wallTop + PH) / 2, 0), null);
    looks.use(inner, L.dark);
    inner.castShadow = !1;
    inner.userData.detail = !0;
    g.add(inner);
    add(merge([boxUV(chamferBox(2.0, 0.9, 1.0, 0.03).translate(0, PH + 0.45, -1.9).toNonIndexed())]), L.stone, { cast: !1, detail: !0 });
    const st = merge([
      new THREE.CylinderGeometry(0.32, 0.55, 1.1, 10).translate(0, PH + 1.45, -1.9),
      new THREE.SphereGeometry(0.22, 10, 8).translate(0, PH + 2.2, -1.85),
      new THREE.BoxGeometry(0.9, 0.35, 0.6).translate(0, PH + 1.07, -1.75),
    ]);
    add(st, L.statue, { cast: !1, name: "statue", detail: !0 });
    // 匾额
    const pq = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.58), null);
    looks.use(pq, L.plaque);
    pq.position.set(0, COLT - 0.2, ZC + 0.17);
    pq.rotation.x = -0.18;
    g.add(pq);
    add(boxUV(chamferBox(1.62, 0.7, 0.07, 0.02).toNonIndexed()).rotateX(-0.18).translate(0, COLT - 0.2, ZC + 0.12), L.wood, { cast: !1 });
  }

  // ===== 台基：土衬、陡板、阶条石、角柱、方砖墁地、踏跺、垂带、象眼 =====
  {
    const blocks = [];
    const B = (sx_, sy_, sz_, x, y, z, ry = 0, c = 0.03) => {
      const b = chamferBox(sx_, sy_, sz_, c).toNonIndexed();
      b.rotateX((R() - 0.5) * 0.012).rotateZ((R() - 0.5) * 0.012).rotateY(ry);
      b.translate(x, y, z);
      blocks.push(boxUV(b, [R() * 5, R() * 5]));
    };
    // 沿一条边铺不等长的石块
    const run = (len, y, h, d, out, along, minL, maxL, c) => {
      let s = -len / 2;
      while (s < len / 2 - 0.05) {
        const l = Math.min(len / 2 - s, minL + R() * (maxL - minL));
        const mid = s + l / 2;
        along(mid, l, y, h, d, out, c);
        s += l + 0.008;
      }
    };
    for (const sgn of [-1, 1]) {
      // 前后边（沿 x），两山（沿 z）
      const ex = (mid, l, y, h, d, out, c) => B(l, h, d, mid, y, sgn * (PZ - d / 2 + out), 0, c);
      const ez = (mid, l, y, h, d, out, c) => B(d, h, l, sgn * (PX - d / 2 + out), y, mid, 0, c);
      for (const [len, along] of [[2 * PX, ex], [2 * PZ - 0.9, ez]]) {
        run(len, 0.06, 0.14, 0.5, 0.07, along, 0.9, 1.6, 0.02); // 土衬
        run(len, 0.13 + 0.22, 0.44, 0.3, 0.0, along, 0.8, 1.4, 0.025); // 陡板
        run(len, PH - 0.08, 0.17, 0.46, 0.03, along, 1.0, 1.8, 0.035); // 阶条石
      }
    }
    // 角柱石
    for (const a of [-1, 1]) for (const b of [-1, 1]) B(0.32, 0.46, 0.32, a * (PX - 0.14), 0.36, b * (PZ - 0.14), 0, 0.03);
    // 踏跺（4 级）与垂带、象眼
    const SW = 3.0, RS = PH / 4, TD = 0.32;
    for (let k = 1; k <= 4; k++) {
      const top = PH - k * RS, z0 = PZ + (k - 1) * TD;
      let s = -SW / 2;
      while (s < SW / 2 - 0.05) {
        const l = Math.min(SW / 2 - s, 0.9 + R() * 0.8);
        B(l, top + 0.02, TD + 0.04, s + l / 2, (top + 0.02) / 2, z0 + TD / 2 + 0.01, 0, 0.025);
        s += l + 0.01;
      }
    }
    for (const s of [-1, 1]) {
      const len = Math.hypot(PH, 4 * TD) + 0.1, ang = Math.atan2(PH, 4 * TD);
      const b = chamferBox(0.42, 0.16, len, 0.03).toNonIndexed();
      b.rotateX(ang).translate(s * (SW / 2 + 0.21), PH / 2 + 0.02, PZ + 2 * TD - 0.02);
      blocks.push(boxUV(b, [R() * 5, R() * 5]));
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0, PH - 0.1);
      sh.lineTo(4 * TD - 0.15, 0);
      sh.closePath();
      const tri = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: !1 }).toNonIndexed();
      tri.rotateY(-Math.PI / 2).translate(s * (SW / 2 + 0.03) + (s > 0 ? 0.36 : 0), 0, PZ);
      blocks.push(boxUV(tri, [R() * 5, R() * 5]));
    }
    add(merge(blocks.map((b) => setAO(b, (v) => 0.5 + 0.5 * Math.min(1, v.y / 0.35)))), L.stone, { name: "platform" });
    // 方砖墁地
    const fl = new THREE.PlaneGeometry(2 * PX - 0.86, 2 * PZ - 0.86).rotateX(-Math.PI / 2).translate(0, PH - 0.005, 0);
    add(setAO(boxUV(fl), (v) => 0.75 + 0.25 * Math.min(1, Math.max(Math.abs(v.z) - ZC - 0.3, 0) / 0.6)), L.pave, { cast: !1, name: "floor" });
  }

  // ===== 瓦松 / 杂草：屋脊根部、瓦垄间、台基缝里 =====
  {
    const tg = grassClump(7, 0.32, 3, 0.07);
    const list = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sv = V();
    const putT = (x, y, z, s) => list.push(M.compose(V(x, y, z), Q.setFromEuler(new THREE.Euler(0, R() * 6.3, 0)), Sv.set(s, s * (0.7 + R() * 0.6), s)).clone());
    for (let k = 0; k < 26; k++) {
      const x = (R() - 0.5) * 2 * XB * 0.95, sgz = R() < 0.5 ? -1 : 1;
      putT(x, Hf(x, 0.32) + 0.06, sgz * 0.32, 0.8 + R() * 0.8);
    }
    for (let k = 0; k < 40; k++) {
      const x = (R() - 0.5) * 2 * XB, z = 0.6 + R() * 3.6;
      if (R() < 0.6) continue;
      putT(Math.round(x / PITCH) * PITCH, Hf(x, z) + 0.05, z * (R() < 0.5 ? -1 : 1), 0.5 + R() * 0.6);
    }
    for (let k = 0; k < 50; k++) {
      const a = R() * 4;
      const t = R() - 0.5;
      const [x, z] = a < 1 ? [t * 2 * PX, PZ + 0.1] : a < 2 ? [t * 2 * PX, -PZ - 0.1] : a < 3 ? [PX + 0.1, t * 2 * PZ] : [-PX - 0.1, t * 2 * PZ];
      if (Math.abs(x) < 1.8 && z > 0) continue;
      putT(x, 0.02, z, 0.8 + R() * 1.0);
    }
    const m = new THREE.InstancedMesh(tg, null, list.length);
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.computeBoundingSphere();
    looks.use(m, L.tuft);
    m.castShadow = !1;
    g.add(m);
    stats.tufts = list.length;
  }
  g.userData.stats = stats;
  g.userData.tex = T;
  return g;
}

function reverseWinding(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k], n = a.itemSize;
      for (let j = 0; j < n; j++) {
        const t = a.array[(i + 1) * n + j];
        a.array[(i + 1) * n + j] = a.array[(i + 2) * n + j];
        a.array[(i + 2) * n + j] = t;
      }
    }
  }
  return g;
}
