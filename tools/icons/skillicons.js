// 技能图标（意象写意）：画法术的"意象"而不是物件。与物品图标同一套笔路模型与纸性位图渲染（tools/icons/inkicons.js）。
// 五行色只做淡彩，与技能栏圆相的五行色一致（src/ui/ink/ink-ui.css .hud-skill.metal / wood / water / fire / earth）。
// 构图：内容画满 128×128，界面上按圆相内径约 70% 显示，按键角标、冷却墨晕、真气数都在圆相外圈，不会被挡。
import { TEMPLATES as T, PAL, HELP } from "./inkicons.js";

const { circ, M, INK, ZHU, PAPER } = HELP;
export const EC = { metal: "#9a7d34", wood: "#3f9a6e", water: "#2f7fa8", fire: "#b8291a", earth: "#9a6a32", none: "#b8923a" };
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const S = {};

// 剑气斩：一道月牙剑气 + 两道余痕
S.sword_qi = (W, H) => {
  const [k, m] = M(W, H);
  const outer = arc(50, 66, 46, -70, 75, 12), inner = arc(38, 66, 38, 70, -64, 12);
  return [
    { wash: m([...outer, ...inner]), c: EC.metal, op: 0.42, soft: 1.2 },
    { s: m(outer), w: 8 * k, op: 0.88, taper: 0.55, head: 0.05, dry: 0.45, press: 1.3 },
    { s: m(arc(40, 66, 40, -62, 60, 10)), w: 2.4 * k, op: 0.45, taper: 0.5, dry: 0.5 },
    { s: m(arc(30, 66, 44, -40, 40, 8)), w: 2 * k, op: 0.3, taper: 0.6, dry: 0.6 },
    { s: m(arc(20, 66, 46, -30, 30, 8)), w: 1.6 * k, op: 0.2, taper: 0.6, dry: 0.6 },
    { dot: m([[104, 30]])[0], r: 2.2 * k, c: EC.metal, op: 0.8 }, { dot: m([[110, 92]])[0], r: 1.8 * k, c: EC.metal, op: 0.7 },
  ];
};
// 火符：一张符纸 + 三簇火焰
S.fire_talisman = (W, H) => {
  const [k, m] = M(W, H);
  const flame = (x, y, h, s) => [
    { wash: m([[x - 9 * s, y], [x - 7 * s, y - h * 0.45], [x, y - h], [x + 6 * s, y - h * 0.5], [x + 9 * s, y]]), c: ZHU, op: 0.55, soft: 1 },
    { s: m([[x - 8 * s, y], [x - 6 * s, y - h * 0.5], [x + 1, y - h]]), w: 2.6 * k, op: 0.75, c: "#8a2a1a", taper: 0.5, dry: 0.3 },
    { s: m([[x + 8 * s, y], [x + 5 * s, y - h * 0.4], [x + 1, y - h * 0.7]]), w: 1.8 * k, op: 0.55, c: "#8a2a1a", taper: 0.5 },
  ];
  return [
    { wash: m([[30, 66], [62, 60], [70, 116], [38, 122]]), c: PAL.tenghuang, op: 0.55, soft: 0.8 },
    { s: m([[30, 66], [38, 122], [70, 116], [62, 60], [30, 66]]), w: 1.8 * k, op: 0.6, taper: 0.1, dry: 0.3 },
    { s: m([[40, 76], [56, 74]]), w: 2.6 * k, c: ZHU, op: 0.9, taper: 0.3 }, { s: m([[48, 78], [46, 92], [56, 98], [48, 110]]), w: 2.4 * k, c: ZHU, op: 0.85, taper: 0.4 },
    ...flame(58, 58, 40, 1), ...flame(84, 70, 52, 1.2), ...flame(102, 84, 30, 0.8),
    { dot: m([[96, 24]])[0], r: 2 * k, c: ZHU, op: 0.7 }, { dot: m([[72, 14]])[0], r: 1.6 * k, c: ZHU, op: 0.6 },
  ];
};
// 寒冰锥：三根冰棱斜刺而下 + 雪点
S.frost = (W, H) => {
  const [k, m] = M(W, H);
  const ice = (x0, y0, x1, y1, w, sd) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = (-dy / L) * w, ny = (dx / L) * w;
    const P = m([[x0 + nx, y0 + ny], [x1, y1], [x0 - nx, y0 - ny]]);
    return [{ wash: P, c: EC.water, op: 0.42, soft: 0.8, seed: sd }, { s: [P[0], P[1], P[2]], w: 2.4 * k, op: 0.85, taper: 0.15, press: 1, seed: sd + 1 }, { s: m([[x0 + nx * 0.3, y0 + ny * 0.3], [x1 - dx * 0.25, y1 - dy * 0.25]]), w: 1.6 * k, c: PAPER, op: 0.9, taper: 0.5 }];
  };
  return [
    ...ice(104, 22, 34, 102, 11, 11), ...ice(112, 54, 64, 112, 7, 15), ...ice(78, 12, 30, 58, 6, 19),
    { dot: m([[24, 30]])[0], r: 2.4 * k, c: EC.water, op: 0.7 }, { dot: m([[18, 78]])[0], r: 1.8 * k, c: EC.water, op: 0.6 }, { dot: m([[108, 108]])[0], r: 2 * k, c: EC.water, op: 0.6 },
  ];
};
// 缠藤诀：盘绕的藤 + 叶
S.vine = (W, H) => {
  const [k, m] = M(W, H);
  const sp = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 3.4 + 0.6, r = 8 + t * 40; sp.push([64 + Math.cos(a) * r, 66 + Math.sin(a) * r * 0.85]); }
  return [
    { wash: circ(m([[64, 66]])[0], 30 * k, 18), c: EC.wood, op: 0.18, soft: 4 },
    { s: m(sp), w: 5 * k, c: "#5a6a3a", op: 0.85, taper: 0.35, head: 0.1, dry: 0.4, press: 1.2 },
    { s: m([[30, 40], [18, 30], [10, 18]]), w: 11 * k, c: EC.wood, op: 0.6, both: 0.35, taper: 0.45, press: 1, seed: 21 },
    { s: m([[100, 86], [112, 94], [120, 106]]), w: 10 * k, c: EC.wood, op: 0.55, both: 0.35, taper: 0.45, press: 1, seed: 22 },
    { s: m([[86, 34], [98, 22], [104, 10]]), w: 9 * k, c: EC.wood, op: 0.55, both: 0.35, taper: 0.45, press: 1, seed: 23 },
    { s: m([[40, 98], [28, 108], [20, 118]]), w: 9 * k, c: EC.wood, op: 0.5, both: 0.35, taper: 0.45, press: 1, seed: 24 },
  ];
};
// 土遁护体：一道层层岩壁围成的土盾
S.earth_shield = (W, H) => {
  const [k, m] = M(W, H);
  const out = arc(64, 108, 52, 180, 360, 14), inn = arc(64, 108, 34, 360, 180, 14);
  return [
    { wash: m([...out, ...inn]), c: EC.earth, op: 0.55, soft: 1 },
    { s: m(out), w: 4.4 * k, op: 0.88, taper: 0.15, dry: 0.45, press: 1.2, rough: 0.2 },
    { s: m(arc(64, 108, 34, 185, 355, 10)), w: 2.6 * k, op: 0.7, taper: 0.2, dry: 0.5 },
    { s: m(arc(64, 108, 44, 195, 250, 5)), w: 1.6 * k, op: 0.5, taper: 0.4 }, { s: m(arc(64, 108, 44, 280, 345, 5)), w: 1.6 * k, op: 0.5, taper: 0.4 },
    { s: m([[24, 84], [30, 92]]), w: 1.6 * k, op: 0.5 }, { s: m([[64, 58], [64, 72]]), w: 1.6 * k, op: 0.5 }, { s: m([[100, 82], [94, 92]]), w: 1.6 * k, op: 0.5 },
    { s: m([[6, 110], [64, 112], [122, 110]]), w: 3.4 * k, op: 0.6, taper: 0.4, dry: 0.6 },
    { dot: m([[64, 96]])[0], r: 5 * k, c: PAL.nijin, op: 0.6 },
  ];
};
// 落石诀：巨石坠下 + 速度线 + 落点裂痕
S.rock = (W, H) => {
  const [k, m] = M(W, H);
  const B = m([[56, 22], [82, 12], [104, 24], [108, 50], [90, 66], [62, 62], [50, 42]]);
  return [
    { wash: B, c: EC.earth, op: 0.55, soft: 1 }, { wash: m([[82, 14], [104, 26], [106, 48], [90, 62], [86, 38]]), c: INK, op: 0.22, soft: 1 },
    { s: [...B, B[0], B[1]], w: 3.2 * k, op: 0.88, taper: 0.15, dry: 0.4, rough: 0.2 },
    { s: m([[48, 52], [26, 84]]), w: 2.4 * k, op: 0.5, taper: 0.6, dry: 0.5 }, { s: m([[64, 66], [46, 96]]), w: 2 * k, op: 0.4, taper: 0.6, dry: 0.5 }, { s: m([[40, 36], [20, 62]]), w: 1.6 * k, op: 0.35, taper: 0.6 },
    { s: m([[10, 112], [36, 106], [54, 112]]), w: 3 * k, op: 0.7, taper: 0.3, dry: 0.5 },
    { s: m([[30, 108], [22, 96]]), w: 1.6 * k, op: 0.6 }, { s: m([[34, 108], [44, 96]]), w: 1.6 * k, op: 0.6 }, { s: m([[32, 110], [32, 120]]), w: 1.6 * k, op: 0.5 },
    { dot: m([[16, 96]])[0], r: 2 * k, c: EC.earth, op: 0.7 }, { dot: m([[50, 98]])[0], r: 1.6 * k, c: EC.earth, op: 0.6 },
  ];
};
// 掌心雷：云雷纹（回纹）+ 一道折闪
S.thunder = (W, H) => {
  const [k, m] = M(W, H);
  const sp = [[64, 64], [76, 64], [76, 76], [52, 76], [52, 52], [88, 52], [88, 88], [40, 88], [40, 40], [100, 40]];
  return [
    { wash: circ(m([[64, 64]])[0], 40 * k, 18), c: EC.metal, op: 0.16, soft: 5 },
    { s: m(sp), w: 3.2 * k, op: 0.7, taper: 0.2, dry: 0.4, press: 1, wv: 0.05 },
    { wash: m([[96, 8], [66, 54], [82, 56], [44, 120], [94, 62], [76, 60]]), c: PAL.nijin, op: 0.8, soft: 0.5 },
    { s: m([[96, 8], [66, 54], [82, 56], [44, 120]]), w: 2.4 * k, op: 0.85, taper: 0.4, press: 1, wv: 0 },
    { dot: m([[24, 108]])[0], r: 2 * k, c: PAL.nijin, op: 0.7 }, { dot: m([[108, 100]])[0], r: 1.6 * k, c: PAL.nijin, op: 0.6 },
  ];
};
// ---- 功法体系 v2（战斗设计，2026-11-17）：凝锋诀 / 藤引 / 止水诀 / 火鸦 / 地行术 ----
// 凝锋诀：竖剑一柄，剑脊上一道泥金锋光，剑尖聚势的三点
S.ningfeng = (W, H) => {
  const [k, m] = M(W, H);
  return [
    { wash: m([[60, 12], [68, 12], [70, 96], [58, 96]]), c: EC.metal, op: 0.35, soft: 1 },
    { s: m([[64, 10], [64, 98]]), w: 6 * k, op: 0.9, taper: 0.6, head: 0.2, press: 1.2, dry: 0.3 },
    { s: m([[44, 98], [84, 98]]), w: 4 * k, op: 0.85, taper: 0.2 }, { s: m([[64, 100], [64, 122]]), w: 4 * k, op: 0.8, taper: 0.3 },
    { s: m([[70, 22], [70, 84]]), w: 2 * k, c: PAL.nijin, op: 0.9, taper: 0.5 },
    { s: m(arc(64, 14, 22, 200, 340, 8)), w: 2 * k, op: 0.45, taper: 0.5, dry: 0.5 },
    { dot: m([[40, 20]])[0], r: 2.4 * k, c: PAL.nijin, op: 0.8 }, { dot: m([[88, 18]])[0], r: 2 * k, c: PAL.nijin, op: 0.7 }, { dot: m([[64, 4]])[0], r: 1.8 * k, c: PAL.nijin, op: 0.7 },
  ];
};
// 藤引：一条甩出的长藤，藤头卷住一点（敌），尾端两片叶
S.vine_pull = (W, H) => {
  const [k, m] = M(W, H);
  const rope = [[14, 112], [34, 96], [52, 88], [70, 70], [86, 50], [96, 34]];
  return [
    { s: m(rope), w: 5 * k, c: "#5a6a3a", op: 0.88, taper: 0.4, head: 0.05, dry: 0.4, press: 1.2 },
    { s: m(arc(100, 28, 12, 120, 470, 14)), w: 3.2 * k, c: "#5a6a3a", op: 0.8, taper: 0.3 },
    { dot: m([[100, 28]])[0], r: 5 * k, c: INK, op: 0.7 },
    { s: m([[30, 100], [18, 86], [10, 76]]), w: 10 * k, c: EC.wood, op: 0.6, both: 0.35, taper: 0.45, press: 1, seed: 31 },
    { s: m([[50, 90], [56, 104], [62, 116]]), w: 9 * k, c: EC.wood, op: 0.55, both: 0.35, taper: 0.45, press: 1, seed: 32 },
    { s: m([[60, 80], [76, 64]]), w: 1.6 * k, op: 0.35, taper: 0.6 }, { s: m([[76, 60], [90, 42]]), w: 1.4 * k, op: 0.3, taper: 0.6 },
  ];
};
// 止水诀：静水一圈（水平的同心水纹），中间一滴将落未落
S.zhishui = (W, H) => {
  const [k, m] = M(W, H);
  const ell = (rx, ry, n = 16) => m(Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [64 + Math.cos(a) * rx, 86 + Math.sin(a) * ry]; }));
  return [
    { wash: ell(52, 18), c: EC.water, op: 0.3, soft: 2 },
    { s: ell(50, 17), w: 2.6 * k, op: 0.7, taper: 0.2, dry: 0.4 }, { s: ell(32, 11), w: 2.2 * k, c: EC.water, op: 0.75, taper: 0.2 }, { s: ell(14, 5, 10), w: 2 * k, c: EC.water, op: 0.85, taper: 0.2 },
    { wash: m([[64, 22], [72, 44], [64, 54], [56, 44]]), c: EC.water, op: 0.7, soft: 0.6 },
    { s: m([[64, 22], [72, 44], [64, 54], [56, 44], [64, 22]]), w: 2 * k, op: 0.8, taper: 0.1 },
    { s: m([[16, 50], [36, 46]]), w: 1.6 * k, op: 0.35, taper: 0.5 }, { s: m([[92, 46], [112, 50]]), w: 1.6 * k, op: 0.35, taper: 0.5 },
  ];
};
// 火鸦：三只展翅的火鸦（一大两小），尾焰
S.fire_crow = (W, H) => {
  const [k, m] = M(W, H);
  const crow = (x, y, s, sd) => [
    { wash: m([[x - 22 * s, y - 6 * s], [x - 6 * s, y], [x, y - 4 * s], [x + 6 * s, y], [x + 22 * s, y - 6 * s], [x + 6 * s, y + 8 * s], [x, y + 14 * s], [x - 6 * s, y + 8 * s]]), c: ZHU, op: 0.55, soft: 0.8, seed: sd },
    { s: m([[x - 24 * s, y - 8 * s], [x - 8 * s, y + 2 * s], [x, y - 2 * s], [x + 8 * s, y + 2 * s], [x + 24 * s, y - 8 * s]]), w: 2.8 * k * s, op: 0.85, taper: 0.4, press: 1, seed: sd + 1 },
    { s: m([[x, y + 2 * s], [x - 4 * s, y + 18 * s], [x + 2 * s, y + 26 * s]]), w: 2.2 * k * s, c: "#8a2a1a", op: 0.7, taper: 0.5, seed: sd + 2 },
  ];
  return [...crow(62, 58, 1.5, 41), ...crow(26, 28, 0.8, 44), ...crow(102, 30, 0.8, 47), { dot: m([[40, 108]])[0], r: 2 * k, c: ZHU, op: 0.7 }, { dot: m([[92, 104]])[0], r: 1.6 * k, c: ZHU, op: 0.6 }];
};
// 地行术：地面一道裂开的长痕，尽头破土（土块飞起），起点一缕尘
S.earth_walk = (W, H) => {
  const [k, m] = M(W, H);
  return [
    { s: m([[8, 92], [124, 92]]), w: 3 * k, op: 0.55, taper: 0.4, dry: 0.6 },
    { s: m([[14, 94], [34, 90], [52, 96], [70, 88], [88, 94]]), w: 4 * k, c: EC.earth, op: 0.85, taper: 0.3, dry: 0.4, rough: 0.2 },
    { wash: m([[86, 92], [96, 60], [108, 50], [118, 66], [114, 92]]), c: EC.earth, op: 0.5, soft: 1 },
    { s: m([[88, 92], [98, 62], [108, 52]]), w: 3 * k, op: 0.8, taper: 0.3 }, { s: m([[108, 52], [118, 68], [114, 92]]), w: 3 * k, op: 0.75, taper: 0.3 },
    { wash: m([[98, 30], [108, 24], [112, 34], [102, 38]]), c: EC.earth, op: 0.7, soft: 0.6 }, { wash: m([[80, 40], [86, 34], [90, 42]]), c: EC.earth, op: 0.6, soft: 0.6 }, { wash: m([[116, 40], [122, 36], [124, 46]]), c: EC.earth, op: 0.6, soft: 0.6 },
    { s: m(arc(18, 84, 10, 200, 340, 6)), w: 1.6 * k, op: 0.4, taper: 0.5 }, { s: m(arc(30, 80, 8, 200, 340, 6)), w: 1.4 * k, op: 0.3, taper: 0.5 },
  ];
};
// 法宝：青冥飞剑（飞行中的剑 + 青色剑气尾迹）
S.art_flying_sword = (W, H) => {
  const [k, m] = M(W, H);
  return [
    { s: m([[8, 118], [40, 96], [70, 70]]), w: 14 * k, c: EC.water, op: 0.35, taper: 0.1, head: 0.5, dry: 0.6, press: 1 },
    { s: m([[20, 120], [48, 104], [76, 82]]), w: 2 * k, c: EC.water, op: 0.5, taper: 0.5, dry: 0.5 },
    { s: m([[4, 102], [34, 86], [62, 62]]), w: 2 * k, c: EC.water, op: 0.45, taper: 0.5, dry: 0.5 },
    ...T.sword(W, H, { blade: PAL.shiqing, guard: PAL.dai, tassel: PAL.shiqing }).map((o) => shrink(o, W, H, 0.78, 10, -8)),
  ];
};
// 法宝：镇山印（印落地 + 冲击纹）
S.art_seal = (W, H) => {
  const [k, m] = M(W, H);
  return [
    ...T.seal(W, H, {}).map((o) => shrink(o, W, H, 0.72, 0, -14)),
    { s: m([[14, 104], [40, 112], [64, 114], [88, 112], [114, 104]]), w: 3.4 * k, op: 0.7, taper: 0.3, dry: 0.5 },
    { s: m([[20, 92], [8, 84]]), w: 2 * k, op: 0.55, taper: 0.5 }, { s: m([[108, 92], [120, 84]]), w: 2 * k, op: 0.55, taper: 0.5 },
    { s: m([[26, 112], [12, 120]]), w: 1.8 * k, op: 0.5, taper: 0.5 }, { s: m([[102, 112], [116, 120]]), w: 1.8 * k, op: 0.5, taper: 0.5 },
    { wash: m([[18, 108], [64, 100], [110, 108], [64, 122]]), c: EC.earth, op: 0.3, soft: 2 },
  ];
};
// 法宝：紫金葫芦（葫芦口一团吸摄的旋涡）
S.art_gourd = (W, H) => {
  const [k, m] = M(W, H);
  const sp = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30, a = -t * Math.PI * 3, r = 30 - t * 24; sp.push([86 + Math.cos(a) * r, 36 + Math.sin(a) * r]); }
  return [
    ...T.pill(W, H, { pill: PAL.nijin }).slice(0, 7).map((o) => shrink(o, W, H, 0.8, -16, 16)),
    { wash: circ(m([[86, 36]])[0], 30 * k, 18), c: EC.water, op: 0.2, soft: 3 },
    { s: m(sp), w: 3.2 * k, c: EC.water, op: 0.75, taper: 0.4, dry: 0.4 },
    { dot: m([[112, 12]])[0], r: 2 * k, c: EC.water, op: 0.6 }, { dot: m([[60, 10]])[0], r: 1.6 * k, c: EC.water, op: 0.5 },
  ];
};
// 阵盘：一圈阵纹 + 阵中之物
const ring = (k, m, c) => [
  { wash: circ(m([[64, 64]])[0], 50 * k, 24), c, op: 0.14, soft: 3 },
  { s: m([...arc(64, 64, 50, -80, 250, 16)]), w: 3 * k, op: 0.8, taper: 0.25, dry: 0.45, press: 1.2 },
  { s: m(arc(64, 64, 40, 10, 330, 14)), w: 1.4 * k, op: 0.4, taper: 0.3, dry: 0.3 },
];
S.sword_array = (W, H) => {
  const [k, m] = M(W, H);
  const ops = ring(k, m, EC.metal);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.283 + 0.785, ca = Math.cos(a), sa = Math.sin(a);
    ops.push({ s: m([[64 + ca * 40, 64 + sa * 40], [64 + ca * 12, 64 + sa * 12]]), w: 3.2 * k, op: 0.85, taper: 0.5, press: 1, c: INK });
    ops.push({ s: m([[64 + ca * 34 - sa * 6, 64 + sa * 34 + ca * 6], [64 + ca * 34 + sa * 6, 64 + sa * 34 - ca * 6]]), w: 2.4 * k, op: 0.85, taper: 0.2, press: 1 });
    ops.push({ wash: m([[64 + ca * 32 - sa * 3, 64 + sa * 32 + ca * 3], [64 + ca * 14, 64 + sa * 14], [64 + ca * 32 + sa * 3, 64 + sa * 32 - ca * 3]]), c: EC.metal, op: 0.5, soft: 0.5 });
  }
  ops.push({ dot: m([[64, 64]])[0], r: 4 * k, c: ZHU, op: 0.85 });
  return ops;
};
S.fire_array = (W, H) => {
  const [k, m] = M(W, H);
  const ops = ring(k, m, EC.fire);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.283 - 1.57, x = 64 + Math.cos(a) * 26, y = 70 + Math.sin(a) * 22;
    ops.push({ wash: m([[x - 6, y + 4], [x - 4, y - 8], [x, y - 18], [x + 5, y - 8], [x + 6, y + 4]]), c: ZHU, op: 0.6, soft: 0.8, seed: 70 + i });
    ops.push({ s: m([[x - 5, y + 4], [x - 3, y - 8], [x, y - 18]]), w: 1.8 * k, c: "#8a2a1a", op: 0.7, taper: 0.5, seed: 80 + i });
  }
  return ops;
};
S.spirit_array = (W, H) => {
  const [k, m] = M(W, H);
  const ops = ring(k, m, EC.none);
  for (let i = 0; i < 12; i++) { const t = i / 12, a = t * 6.283 * 1.5, r = 36 - t * 28; ops.push({ dot: m([[64 + Math.cos(a) * r, 64 + Math.sin(a) * r]])[0], r: (3.2 - t * 1.6) * k, c: PAL.nijin, op: 0.85 }); }
  return ops;
};
// 蓄势斩：双重月牙 + 蓄力金星
S.charge = (W, H) => {
  const [k, m] = M(W, H);
  return [
    { wash: m([...arc(46, 70, 54, -75, 75, 12), ...arc(30, 70, 46, 70, -68, 12)]), c: EC.metal, op: 0.38, soft: 1.4 },
    { s: m(arc(46, 70, 54, -75, 75, 12)), w: 10 * k, op: 0.9, taper: 0.55, dry: 0.45, press: 1.4 },
    { s: m(arc(30, 70, 44, -62, 62, 10)), w: 5 * k, op: 0.65, taper: 0.5, dry: 0.5 },
    { s: m(arc(16, 70, 40, -45, 45, 8)), w: 2.4 * k, op: 0.35, taper: 0.5, dry: 0.5 },
    { dot: m([[108, 26]])[0], r: 3 * k, c: PAL.nijin, op: 0.9 }, { dot: m([[116, 46]])[0], r: 2 * k, c: PAL.nijin, op: 0.8 }, { dot: m([[110, 110]])[0], r: 2.4 * k, c: PAL.nijin, op: 0.8 },
  ];
};
// 普攻：三道斩痕
S.attack = (W, H) => {
  const [k, m] = M(W, H);
  return [
    { s: m([[24, 96], [60, 60], [100, 22]]), w: 6 * k, op: 0.85, taper: 0.5, dry: 0.4, press: 1.2 },
    { s: m([[40, 108], [74, 74], [110, 42]]), w: 4.4 * k, op: 0.65, taper: 0.5, dry: 0.5 },
    { s: m([[14, 78], [44, 50], [76, 18]]), w: 3.4 * k, op: 0.45, taper: 0.5, dry: 0.5 },
  ];
};
// ---- 心法 ----
S.kill_mp = (W, H) => { const [k, m] = M(W, H); return [...S.attack(W, H).map((o) => shrink(o, W, H, 0.7, -12, -10)), { wash: m([[92, 70], [80, 96], [92, 114], [104, 96]]), c: EC.water, op: 0.6, soft: 0.8 }, { s: m([[92, 70], [80, 96], [92, 114], [104, 96], [92, 70]]), w: 2.2 * k, op: 0.75, taper: 0.1 }]; };
S.dash_shadow = (W, H) => { const [k, m] = M(W, H); const sw = T.sword(W, H, { blade: PAL.dai }); return [...sw.map((o) => fade(shrink(o, W, H, 0.7, -26, 14), 0.25)), ...sw.map((o) => fade(shrink(o, W, H, 0.7, -12, 6), 0.5)), ...sw.map((o) => shrink(o, W, H, 0.7, 8, -6))]; };
S.crit_thunder = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[20, 34], [40, 16], [70, 14], [96, 22], [110, 40], [80, 46], [40, 46]]), c: INK, op: 0.35, soft: 2 }, { s: m([[16, 38], [40, 20], [72, 16], [100, 26], [112, 42]]), w: 3 * k, op: 0.7, taper: 0.3, dry: 0.5 }, { wash: m([[70, 40], [50, 76], [64, 78], [40, 120], [78, 72], [62, 70], [82, 40]]), c: PAL.nijin, op: 0.85, soft: 0.5 }, { s: m([[70, 40], [50, 76], [64, 78], [40, 120]]), w: 2.2 * k, op: 0.8, taper: 0.4, press: 1 }]; };
S.fire_root = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[64, 70], [60, 92], [52, 112]]), w: 3 * k, op: 0.8, taper: 0.4 }, { s: m([[64, 72], [74, 96], [86, 114]]), w: 2.4 * k, op: 0.7, taper: 0.5 }, { s: m([[62, 80], [42, 96], [28, 104]]), w: 2 * k, op: 0.6, taper: 0.5 }, { wash: m([[46, 70], [50, 40], [64, 10], [76, 38], [82, 70]]), c: ZHU, op: 0.6, soft: 1 }, { s: m([[48, 70], [52, 40], [64, 12]]), w: 2.4 * k, c: "#8a2a1a", op: 0.75, taper: 0.5 }, { wash: m([[56, 68], [60, 46], [66, 32], [72, 50], [72, 68]]), c: PAL.tenghuang, op: 0.6, soft: 0.6 }]; };
S.vajra = (W, H) => { const [k, m] = M(W, H); const bell = m([[40, 96], [42, 52], [52, 30], [64, 24], [76, 30], [86, 52], [88, 96]]); return [{ wash: bell, c: EC.metal, op: 0.55, soft: 1 }, { s: [...bell], w: 3.4 * k, op: 0.88, taper: 0.1, dry: 0.4 }, { s: m([[32, 98], [64, 102], [96, 98]]), w: 5 * k, op: 0.9, taper: 0.15, press: 1.2 }, { s: m([[58, 24], [58, 12], [70, 12], [70, 24]]), w: 2.6 * k, op: 0.85, taper: 0.1 }, { s: m([[46, 62], [82, 62]]), w: 1.6 * k, op: 0.5 }, { s: m([[44, 78], [84, 78]]), w: 1.6 * k, op: 0.5 }, { s: m([[16, 70], [26, 70]]), w: 2 * k, op: 0.45 }, { s: m([[102, 70], [112, 70]]), w: 2 * k, op: 0.45 }]; };
S.sharp = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[20, 110], [96, 28], [108, 20], [100, 34], [28, 116]]), c: EC.metal, op: 0.5, soft: 0.8 }, { s: m([[20, 112], [100, 26], [110, 18]]), w: 3 * k, op: 0.88, taper: 0.4, press: 1 }, { s: m([[110, 6], [110, 30]]), w: 2.4 * k, c: PAL.nijin, op: 0.9, taper: 0.5, both: 0.4 }, { s: m([[98, 18], [122, 18]]), w: 2.4 * k, c: PAL.nijin, op: 0.9, taper: 0.5, both: 0.4 }, { dot: m([[110, 18]])[0], r: 3 * k, c: PAPER, op: 0.95 }]; };
S.mom_gather = (W, H) => { const [k, m] = M(W, H); const ops = [{ wash: circ(m([[64, 64]])[0], 16 * k), c: EC.metal, op: 0.55, soft: 1 }]; for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4; ops.push({ s: m(arc(64, 64, 46, (a * 180) / Math.PI, (a * 180) / Math.PI + 70, 6).map(([x, y], j, A) => [64 + (x - 64) * (1 - j / A.length * 0.55), 64 + (y - 64) * (1 - j / A.length * 0.55)])), w: 4 * k, op: 0.75, taper: 0.6, dry: 0.4, seed: 90 + i }); } return ops; };
S.mom_chain = (W, H) => { const [k, m] = M(W, H); return [0, 1, 2].flatMap((i) => [{ s: m([...arc(36 + i * 28, 64, 20, 200, 520, 12)]), w: 3.4 * k, op: 0.85 - i * 0.1, taper: 0.2, dry: 0.4, seed: 100 + i }, { wash: circ(m([[36 + i * 28, 64]])[0], 14 * k), c: EC.metal, op: 0.18, soft: 2 }]); };
S.mom_haste = (W, H) => { const [k, m] = M(W, H); return [{ wash: circ(m([[70, 64]])[0], 32 * k), c: EC.metal, op: 0.45, soft: 1 }, { s: m(arc(70, 64, 32, -100, 250, 14)), w: 3.6 * k, op: 0.85, taper: 0.2, dry: 0.4, press: 1.2 }, { s: m([[8, 44], [30, 44]]), w: 2.4 * k, op: 0.6, taper: 0.6 }, { s: m([[4, 64], [32, 64]]), w: 2.6 * k, op: 0.65, taper: 0.6 }, { s: m([[8, 84], [30, 84]]), w: 2.4 * k, op: 0.6, taper: 0.6 }]; };
S.mom_wave = (W, H) => { const [k, m] = M(W, H); return [...S.sword_qi(W, H).slice(0, 2).map((o) => shrink(o, W, H, 0.7, -18, 0)), { s: m(arc(92, 64, 18, -80, 80, 8)), w: 2.4 * k, op: 0.6, taper: 0.3 }, { s: m(arc(92, 64, 28, -70, 70, 8)), w: 2, op: 0.45, taper: 0.3 }, { s: m(arc(92, 64, 38, -60, 60, 8)), w: 1.6 * k, op: 0.3, taper: 0.3 }]; };
S.mom_return = (W, H) => { const [k, m] = M(W, H); const A = arc(64, 64, 42, -30, 250, 14); return [{ s: m(A), w: 5 * k, op: 0.85, taper: 0.3, dry: 0.45, press: 1.2 }, { wash: m([[A[14][0] - 12, A[14][1] - 2], [A[14][0] + 6, A[14][1] - 16], [A[14][0] + 10, A[14][1] + 10]]), c: INK, op: 0.85, soft: 0.3 }, { wash: circ(m([[64, 64]])[0], 14 * k), c: EC.metal, op: 0.4, soft: 1 }]; };
S.dash_flow = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[14, 80], [30, 56], [56, 52], [72, 36], [100, 42], [114, 66], [96, 84], [40, 90]]), c: EC.water, op: 0.2, soft: 3 }, { s: m([[14, 84], [36, 70], [56, 74], [60, 58], [80, 46], [100, 50], [106, 66], [92, 72], [86, 62]]), w: 3.4 * k, op: 0.8, taper: 0.3, dry: 0.4 }, { s: m([[30, 100], [60, 96], [96, 100], [118, 92]]), w: 2.4 * k, op: 0.55, taper: 0.4, dry: 0.5 }, { s: m([[40, 112], [80, 112]]), w: 1.6 * k, op: 0.35, taper: 0.5 }]; };
S.lingtai = (W, H) => { const [k, m] = M(W, H); const ops = [{ wash: m([[22, 64], [64, 40], [106, 64], [64, 88]]), c: EC.water, op: 0.22, soft: 2 }, { s: m([[18, 64], [42, 46], [64, 40], [86, 46], [110, 64]]), w: 3 * k, op: 0.85, taper: 0.2 }, { s: m([[18, 64], [42, 82], [64, 88], [86, 82], [110, 64]]), w: 2.6 * k, op: 0.75, taper: 0.2 }, { wash: circ(m([[64, 64]])[0], 12 * k), c: EC.water, op: 0.75, soft: 0.6 }, { dot: m([[60, 60]])[0], r: 3 * k, c: PAPER, op: 0.9 }]; for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.4; ops.push({ s: m([[64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30], [64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44]]), w: 1.8 * k, c: PAL.nijin, op: 0.75, taper: 0.4 }); } return ops; };

// 缩放 / 平移 / 淡化一条操作（组合模板用）
function shrink(o, W, H, s, dx = 0, dy = 0) {
  const k = Math.min(W, H) / 128, cx = W / 2, cy = H / 2;
  const f = ([x, y]) => [cx + (x - cx) * s + dx * k, cy + (y - cy) * s + dy * k];
  const n = { ...o };
  if (o.s) (n.s = o.s.map(f)), (n.w = (o.w || 6) * s);
  if (o.wash) n.wash = o.wash.map(f);
  if (o.hole) n.hole = o.hole.map(f);
  if (o.dot) (n.dot = f(o.dot)), (n.r = o.r * s);
  return n;
}
function fade(o, a) {
  return { ...o, op: (o.op ?? 0.9) * a };
}

// 注册进同一个模板表：技能模板名 = "sk:" + id
// 技能图标在技能栏里只显示约 40px，笔画整体加粗、点放大，保证小尺寸下仍有墨性
const BOLD = (ops) => ops.map((o) => (o.s ? { ...o, w: (o.w || 6) * 1.7, dry: Math.min(0.5, o.dry ?? 0.25) } : o.dot ? { ...o, r: o.r * 1.35 } : o));
for (const [id, fn] of Object.entries(S)) T["sk:" + id] = (W, H, v) => BOLD(fn(W, H, v));
// 技能 id → 模板（法术、法宝主动、阵盘、普攻 / 蓄势斩、心法）
export const SKILL_ICONS = {
  spell: ["sword_qi", "fire_talisman", "frost", "vine", "earth_shield", "rock", "thunder", "ningfeng", "vine_pull", "zhishui", "fire_crow", "earth_walk"],
  artifact: { flying_sword: "art_flying_sword", seal: "art_seal", gourd: "art_gourd" },
  formation: ["sword_array", "fire_array", "spirit_array"],
  move: ["attack", "charge"],
  xinfa: ["kill_mp", "dash_shadow", "crit_thunder", "fire_root", "vajra", "sharp", "mom_gather", "mom_chain", "mom_haste", "mom_wave", "mom_return", "dash_flow", "lingtai"],
};
export const skillSpec = (key) => ["sk:" + key, {}];
