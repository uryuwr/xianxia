// 地图图标（天机镜大地图 20–24px、铜镜 14–16px）：剪影式简笔意象。和物品 / 技能图标同一套笔路与纸性位图（tools/icons/inkicons.js）。
// 小尺寸要一眼认出：形体用浓墨 / 点色实块（没骨），细节用纸色反白一两笔；外圈留一圈纸色外晕由使用方（canvas shadow / CSS drop-shadow）加。
// 品级色只用 RARITY（宝箱：凡 / 宝 / 仙），五行色与技能栏一致（精英护盾标记）。
import { TEMPLATES as T, HELP } from "./inkicons.js";
import { EC } from "./skillicons.js";

const { circ, M, INK, ZHU, PAPER } = HELP;
export const RAR = ["#6a6760", "#3fae7a", "#2f7fa8", "#c9a040", "#d2321e"]; // = src/core/items.js RARITY
const GOLD = "#a8822c", GRAY = "#5a6066", BLUE = "#2f7fa8", GREEN = "#3f8a5a";
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const S = {};

// 主角：朱色箭头（毛笔一按一提）
S.player = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[64, 8], [104, 112], [64, 86], [24, 112]]), c: ZHU, op: 0.95, soft: 0.4 }, { s: m([[64, 10], [100, 108]]), w: 6 * k, c: "#7a1a10", op: 0.7, taper: 0.4 }]; };
// 古传送阵：一笔圆相阵环 + 四柱 + 阵眼
S.gate = (W, H, v = {}) => { const [k, m] = M(W, H); const c = v.c || GOLD; const ops = [{ wash: circ(m([[64, 64]])[0], 50 * k, 24), c, op: 0.3, soft: 1 }, { s: m(arc(64, 64, 46, -70, 260, 16)), w: 13 * k, c, op: 0.95, taper: 0.2, dry: 0.2, press: 1.2 }, { wash: circ(m([[64, 64]])[0], 12 * k), c, op: 0.95, soft: 0.4 }]; for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.785; ops.push({ s: m([[64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22], [64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32]]), w: 9 * k, c, op: 0.9, taper: 0.1, press: 1 }); } return ops; };
// 残阵：断裂的半个阵环 + 裂痕（v.mark：q 未验证 / ok 真 / x 假）
S.ruin = (W, H, v = {}) => {
  const [k, m] = M(W, H);
  const ops = [{ s: m(arc(64, 64, 44, 150, 330, 10)), w: 13 * k, c: GRAY, op: 0.95, taper: 0.15, dry: 0.3 }, { s: m(arc(64, 64, 44, 10, 110, 6)), w: 11 * k, c: GRAY, op: 0.85, taper: 0.3, dry: 0.4 }, { wash: m([[56, 56], [72, 52], [76, 70], [58, 74]]), c: GRAY, op: 0.85, soft: 0.4 }, { s: m([[30, 50], [40, 62], [34, 72]]), w: 3 * k, c: PAPER, op: 0.9, taper: 0.4 }];
  if (v.mark === "ok") ops.push({ s: m([[70, 100], [84, 114], [116, 80]]), w: 12 * k, c: BLUE, op: 0.95, taper: 0.3, press: 1 });
  if (v.mark === "x") ops.push({ s: m([[78, 80], [116, 118]]), w: 11 * k, c: ZHU, op: 0.95, taper: 0.2, press: 1 }, { s: m([[116, 80], [78, 118]]), w: 11 * k, c: ZHU, op: 0.95, taper: 0.2, press: 1 });
  if (v.mark === "q") ops.push({ s: m([[86, 86], [96, 76], [108, 82], [104, 96], [96, 102], [96, 108]]), w: 8 * k, op: 0.9, taper: 0.2, press: 1 }, { dot: m([[96, 120]])[0], r: 5 * k, op: 0.9 });
  return ops;
};
// 首领出口：阵环 + 向上破出的箭
S.boss_exit = (W, H) => { const [k, m] = M(W, H); return [...S.gate(W, H).slice(0, 2), { s: m([[64, 104], [64, 28]]), w: 12 * k, c: GOLD, op: 0.95, taper: 0.1, press: 1 }, { wash: m([[64, 6], [88, 38], [64, 30], [40, 38]]), c: GOLD, op: 0.95, soft: 0.4 }]; };
// 破洞府（撤离）：山形洞口
S.cave = (W, H, v = {}) => { const [k, m] = M(W, H); const c = v.c || GOLD; return [{ wash: m([[8, 112], [36, 40], [58, 22], [84, 34], [120, 112]]), c, op: 0.92, soft: 0.6 }, { wash: m([[42, 112], [46, 78], [64, 64], [82, 78], [86, 112]]), c: PAPER, op: 0.95, soft: 0.4 }, { s: m([[24, 70], [40, 56]]), w: 4 * k, c: PAPER, op: 0.7, taper: 0.4 }]; };
// 妖：一张生角的妖面（v.c 颜色，v.big 精英 / 首领更大更凶）
S.yao = (W, H, v = {}) => {
  const [k, m] = M(W, H);
  const c = v.c || INK, s = v.big ? 1.12 : 1;
  const P = (pts) => m(pts.map(([x, y]) => [64 + (x - 64) * s, 64 + (y - 64) * s]));
  const ops = [
    { wash: P([[30, 56], [38, 36], [52, 46], [64, 42], [76, 46], [90, 36], [98, 56], [96, 84], [82, 106], [64, 112], [46, 106], [32, 84]]), c, op: 0.92, soft: 0.5 },
    { wash: P([[36, 44], [22, 10], [48, 38]]), c, op: 0.95, soft: 0.3 }, { wash: P([[92, 44], [106, 10], [80, 38]]), c, op: 0.95, soft: 0.3 },
    { wash: P([[42, 66], [58, 72], [46, 78]]), c: PAPER, op: 0.95, soft: 0.2 }, { wash: P([[86, 66], [70, 72], [82, 78]]), c: PAPER, op: 0.95, soft: 0.2 },
    { s: P([[48, 94], [56, 90], [64, 96], [72, 90], [80, 94]]), w: 5 * k, c: PAPER, op: 0.9, taper: 0.2, press: 1 },
  ];
  if (v.crown) ops.push({ wash: P([[44, 40], [50, 22], [58, 34], [64, 16], [70, 34], [78, 22], [84, 40]]), c: v.crown, op: 0.95, soft: 0.3 });
  return ops;
};
// 五行护盾标记：一圈五行色的盾环（叠在精英上）
S.shield = (W, H, v = {}) => { const [k, m] = M(W, H); return [{ s: m(arc(64, 64, 54, -60, 250, 16)), w: 10 * k, c: v.c || EC.metal, op: 0.95, taper: 0.2, press: 1.2 }]; };
// 斩（已斩首领）：一道朱斜笔
S.slash = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[10, 112], [64, 60], [118, 14]]), w: 16 * k, c: ZHU, op: 0.95, taper: 0.5, head: 0.05, press: 1.3, dry: 0.3 }]; };
// 已清 / 已开 / 取空：一笔勾
S.tick = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[16, 66], [48, 100], [114, 22]]), w: 15 * k, op: 0.95, taper: 0.45, press: 1.2, dry: 0.2 }]; };
// 宝箱（v.c 品级色，v.open 掀盖）
S.chest = (W, H, v = {}) => {
  const [k, m] = M(W, H), c = v.c || RAR[0];
  const ops = [{ wash: m([[14, 62], [114, 62], [110, 116], [18, 116]]), c, op: 0.92, soft: 0.4 }, { s: m([[16, 84], [112, 84]]), w: 5 * k, c: PAPER, op: 0.85, taper: 0.1 }, { wash: m([[54, 70], [74, 70], [74, 94], [54, 94]]), c: PAPER, op: 0.95, soft: 0.2 }];
  if (v.open) ops.push({ wash: m([[18, 52], [40, 14], [118, 30], [100, 60]]), c, op: 0.7, soft: 0.4 }, { wash: m([[24, 60], [104, 60], [100, 68], [28, 68]]), c: INK, op: 0.7, soft: 0.3 });
  else ops.push({ wash: m([[12, 60], [20, 36], [64, 28], [108, 36], [116, 60]]), c, op: 0.92, soft: 0.4 });
  if (v.glow) ops.push({ dot: m([[64, 12]])[0], r: 7 * k, c: v.glow, op: 0.95 }, { dot: m([[28, 18]])[0], r: 4.5 * k, c: v.glow, op: 0.85 }, { dot: m([[104, 16]])[0], r: 4.5 * k, c: v.glow, op: 0.85 });
  return ops;
};
// 采集：草 / 矿 / 灵光点 / 灵土
S.herb = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[64, 118], [66, 70], [70, 16]]), w: 7 * k, c: GREEN, op: 0.95, taper: 0.3, press: 1 }, { s: m([[64, 96], [40, 80], [14, 52]]), w: 26 * k, c: GREEN, op: 0.9, both: 0.35, taper: 0.45, press: 1, seed: 11 }, { s: m([[66, 76], [90, 60], [116, 30]]), w: 24 * k, c: GREEN, op: 0.88, both: 0.35, taper: 0.45, press: 1, seed: 12 }, { s: m([[68, 46], [54, 30], [44, 8]]), w: 18 * k, c: GREEN, op: 0.85, both: 0.35, taper: 0.45, press: 1, seed: 13 }]; };
S.ore = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[34, 116], [44, 36], [66, 10], [86, 40], [92, 116]]), c: "#3a4a52", op: 0.92, soft: 0.4 }, { wash: m([[86, 116], [94, 60], [112, 50], [122, 116]]), c: "#3a4a52", op: 0.8, soft: 0.4 }, { wash: m([[6, 116], [16, 74], [34, 66], [40, 116]]), c: "#3a4a52", op: 0.8, soft: 0.4 }, { s: m([[56, 44], [64, 70], [60, 96]]), w: 5 * k, c: "#7fb3c8", op: 0.95, taper: 0.3 }]; };
S.glow = (W, H) => { const [k, m] = M(W, H); const ops = [{ wash: circ(m([[64, 64]])[0], 26 * k), c: RAR[3], op: 0.95, soft: 1 }]; for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283; ops.push({ s: m([[64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30], [64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60]]), w: 11 * k, c: RAR[3], op: 0.9, taper: 0.5, press: 1 }); } ops.push({ dot: m([[56, 56]])[0], r: 7 * k, c: PAPER, op: 0.95 }); return ops; };
S.soil = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[6, 112], [30, 60], [64, 44], [98, 60], [122, 112]]), c: "#9a6a32", op: 0.92, soft: 0.5 }, { dot: m([[64, 20]])[0], r: 8 * k, c: RAR[3], op: 0.95 }, { dot: m([[36, 28]])[0], r: 5 * k, c: RAR[3], op: 0.85 }, { dot: m([[92, 28]])[0], r: 5 * k, c: RAR[3], op: 0.85 }]; };
// 遗府：一角飞檐屋顶 + 门
S.den = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[2, 54], [20, 50], [64, 16], [108, 50], [126, 54], [104, 60], [24, 60]]), c: INK, op: 0.95, soft: 0.4 }, { wash: m([[26, 64], [102, 64], [102, 118], [26, 118]]), c: INK, op: 0.88, soft: 0.4 }, { wash: m([[52, 80], [76, 80], [76, 118], [52, 118]]), c: PAPER, op: 0.95, soft: 0.2 }]; };
// 委托旗
S.flag = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[34, 122], [34, 8]]), w: 10 * k, op: 0.95, taper: 0.1, press: 1 }, { wash: m([[38, 10], [116, 30], [90, 46], [116, 62], [38, 66]]), c: ZHU, op: 0.95, soft: 0.4 }]; };
// 奇遇"缘"：一个同心结
S.yuan = (W, H) => { const [k, m] = M(W, H); return [{ s: m(arc(46, 50, 30, 0, 330, 12)), w: 12 * k, c: BLUE, op: 0.95, taper: 0.2 }, { s: m(arc(82, 50, 30, 210, 540, 12)), w: 12 * k, c: BLUE, op: 0.9, taper: 0.2 }, { s: m([[52, 78], [44, 120]]), w: 9 * k, c: ZHU, op: 0.95, taper: 0.5 }, { s: m([[76, 78], [86, 120]]), w: 9 * k, c: ZHU, op: 0.9, taper: 0.5 }]; };
// 遗落储物袋
S.lostbag = (W, H) => { const [k, m] = M(W, H); return [{ wash: m([[44, 40], [24, 70], [18, 104], [40, 122], [88, 122], [110, 104], [104, 70], [84, 40]]), c: ZHU, op: 0.92, soft: 0.5 }, { wash: m([[40, 14], [58, 28], [70, 28], [88, 14], [84, 40], [44, 40]]), c: ZHU, op: 0.92, soft: 0.4 }, { s: m([[40, 42], [64, 48], [88, 42]]), w: 8 * k, c: "#d6ad45", op: 0.95, taper: 0.1, press: 1 }]; };
// 妖潮来向：一道朱色浪头箭
S.tide = (W, H) => { const [k, m] = M(W, H); return [{ s: m([[6, 92], [30, 76], [48, 90], [70, 70], [96, 46]]), w: 13 * k, c: ZHU, op: 0.95, taper: 0.1, press: 1 }, { wash: m([[122, 22], [108, 70], [96, 52], [76, 44]]), c: ZHU, op: 0.95, soft: 0.3 }, { s: m([[14, 116], [36, 104], [54, 114]]), w: 7 * k, c: ZHU, op: 0.7, taper: 0.4 }]; };
// 墨点标记
S.pin = (W, H) => { const [k, m] = M(W, H); return [{ wash: circ(m([[64, 64]])[0], 34 * k, 16), c: INK, op: 0.95, soft: 0.8 }, { dot: m([[96, 30]])[0], r: 8 * k, op: 0.9 }, { dot: m([[30, 100]])[0], r: 5 * k, op: 0.85 }]; };

for (const [id, fn] of Object.entries(S)) T["map:" + id] = fn;

// kind / state → [模板, 参数]（与 mirror_map.js 的实体一一对应；state 的"变淡 + 勾"由使用方叠加，见 MAP_STATE）
export const MAP_ICONS = {
  player: ["player"],
  gate: ["gate"], ruin: ["ruin", { mark: "q" }], ruin_true: ["ruin", { mark: "ok" }], ruin_fake: ["ruin", { mark: "x" }], boss_exit: ["boss_exit"], cave: ["cave"],
  mob: ["yao", { c: "#3d4246" }], elite: ["yao", { c: ZHU, big: 1 }], boss: ["yao", { c: ZHU, big: 1, crown: "#c9a040" }], boss_dead: ["yao", { c: INK, big: 1 }],
  shield_metal: ["shield", { c: EC.metal }], shield_wood: ["shield", { c: EC.wood }], shield_water: ["shield", { c: EC.water }], shield_fire: ["shield", { c: EC.fire }], shield_earth: ["shield", { c: EC.earth }],
  chest: ["chest", { c: RAR[0] }], chest_night: ["chest", { c: RAR[2], glow: "#8fb3d8" }], chest_glow: ["chest", { c: RAR[3], glow: RAR[3] }],
  chest_open: ["chest", { c: RAR[0], open: 1 }], chest_night_open: ["chest", { c: RAR[2], open: 1 }], chest_glow_open: ["chest", { c: RAR[3], open: 1 }],
  herb: ["herb"], ore: ["ore"], glow: ["glow"], soil: ["soil"],
  den: ["den"], flag: ["flag"], yuan: ["yuan"], lostbag: ["lostbag"], tide: ["tide"], pin: ["pin"], tick: ["tick"], slash: ["slash"],
};
// 状态 → 叠加规则（透明度、叠加图标）
export const MAP_STATE = {
  cleared: { alpha: 0.4, over: "tick" }, // 妖群已清
  opened: { alpha: 0.7, icon: "_open" }, // 宝箱已开未搜
  searched: { alpha: 0.6, icon: "_open", over: "tick" },
  empty: { alpha: 0.35, icon: "_open", over: "tick" },
  done: { alpha: 0.35, over: "tick" }, // 已采、委托已得、奇遇已了
  old: { alpha: 0.45 }, // 旧日所见
  slain: { alpha: 0.6, over: "slash" }, // 首领已斩
};
export const mapSpec = (k) => { const [t, v] = MAP_ICONS[k]; return ["map:" + t, v || {}]; };
