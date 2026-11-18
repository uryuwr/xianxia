// 关卡系统：buildLevel(def, ctx) 由关卡数据生成一张可玩的地图（地形、水、植被、景物、标记物、灯光），
// 并在每局按种子从候选点里抽取入口、撤离点、宝箱、采集点、灵光点、精英与刷怪点。
//
// level = {
//   root, def, seed, bounds, buildMs, stats,
//   height(x, z)            可站立高度（含桥面；崖壁处保持台阶，供碰撞）
//   ground(x, z)            地表高度（不含桥面）
//   slope(x, z)
//   canStand(x, z, fromY, r = 0.32)   与主角 / 敌人一致的行走规则
//   colliders               本关的圆形碰撞体 [{x, z, r}]
//   points: { entries:[{pos}], extracts:[{id, kind, name, pos, channel, object}], chests:[{pos, tier, object}],
//             gathers:[{pos, kind, label, cat, object}], glows:[{pos, kind, label, object}], elites:[{pos}],
//             ruins:[{id, name, pos, need, object}], boss:{id, name, pos, arena, exit}, spawns:[{pos, pack, mobs}],
//             jumps:[{id, from, to, need}] }
//   points 另有（区域规划 v2）：zones（分区：realm / baseLevel / danger）、spawnPacks（建议开局组数）、rares（异种 0–1 只）、
//             bossGate / bossGates（首领门提示）、pavilions（启用的亭子容器）、encounters、relics、patrols、night、landmarks、steps（序章）
//   zoneAt(x, z)            → { id, name, risk, danger, realm, baseLevel }
//   isDeepWater(x, z) / isFord(x, z)   深水 / 浅滩渡口；canStand(x, z, fromY, r, { fly: true }) 御剑判定（无视深水与崖高）
//   entry                   本局入口（= points.entries[0]）
//   update(dt)              影子相机跟随、远处草石隐藏、残阵靠近揭示、标记物动画
//   setTimeOfDay(t)         0 晨 → 0.33 午 → 0.66 暮 → 1 夜
//   consume(point)          隐藏已开启 / 已采集的标记物（采集事件 gather:done 会自动处理）
//   revealExtract(id)       揭示残阵真伪（未明 → 石青 / 朱砂）
//   setExtractActive(id, on) 撤离点开关（关掉的阵纹熄灭）
//   reachable(x, z, withJumps)  从入口出发是否走得到（测试用，按格子泛洪）
//   activate(ctx) / deactivate()  加入场景、接管 ctx.colliders 与地形高度；buildLevel 默认自动 activate
//   dispose()               释放几何体与材质（可反复建 / 拆不泄漏；高度场与地形顶点按关卡缓存，见 clearLevelCache）
// }
import * as THREE from "three";
import { Heightfield, prepPoly, sdPoly, smoothPoly } from "./heightfield.js";
import { buildTerrainChunks, buildWaterLevel, buildBridges, brokenBridge } from "./level_mesh.js";
import { buildLevelVegetation } from "./level_veg.js";
import * as MK from "./markers.js";
import { lairDressing, veilShade, mistBand, moonSpot, pitMist } from "./lair.js";
import { buildSky } from "./sky.js";
import { setActiveLevel, activeLevel, STEP_UP, STEP_DOWN } from "./terrain.js";
import { brushTextures } from "../render/bake.js";
import { rng, clamp, lerp } from "../render/glsl.js";
import { U } from "../render/materials.js";

const HF_CACHE = new Map(); // 高度场只与关卡数据有关，按 id 缓存
let brushCache = null;

export const CHANNEL = { gate: 8, ruin: 6, fake: 6, boss: 3, cave: 0 };

function hashSeed(v) {
  if (typeof v === "number") return v >>> 0;
  let h = 2166136261;
  for (const c of String(v)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function shuffle(list, R) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const xz = (p) => (Array.isArray(p) ? p : p.pos);

export async function buildLevel(defIn, ctx = {}) {
  const t0 = performance.now();
  const def = defIn;
  const tutorial = def.tutorial === !0;
  const seed = hashSeed(def.seed ?? (Math.random() * 1e9) | 0);
  const key = def.id + "|" + def.size.join("x");
  let hf = HF_CACHE.get(key);
  if (!hf || hf.def.terraces !== def.terraces) HF_CACHE.set(key, (hf = new Heightfield(def)));
  const tex = ctx.brush || (brushCache ||= brushTextures());

  const root = new THREE.Group();
  root.name = "level:" + def.id;
  const colliders = [];
  let activeCtx = null; // activate(c) 时记下：ctx.colliders 是关卡碰撞体的拷贝，增删时两份都要改
  const liveCols = () => [colliders, ...(activeCtx && Array.isArray(activeCtx.colliders) && activeCtx.colliders !== colliders ? [activeCtx.colliders] : [])];
  const addCol = (col) => liveCols().forEach((arr) => arr.includes(col) || arr.push(col));
  const removeCol = (col) =>
    liveCols().forEach((arr) => {
      const i = arr.indexOf(col);
      if (i >= 0) arr.splice(i, 1);
    });
  const uLight = { value: new THREE.Vector3(1, 1, 1) };

  // ---- 行走规则 ----
  // 教学局：bounds 之外在碰撞上视为崖外（墨雾围栏）
  const L0 = tutorial ? def.tutorialLayout || {} : null;
  let walkArr = hf.walkG;
  if (L0 && L0.bounds) {
    walkArr = hf.walkG.slice();
    const B = prepPoly(L0.bounds);
    for (let iz = 0, i = 0; iz < hf.nz; iz++)
      for (let ix = 0; ix < hf.nx; ix++, i++) if (sdPoly(hf.x0 + ix * hf.cell, hf.z0 + iz * hf.cell, B) > 0) walkArr[i] = -40;
  }
  const walkAt = (x, z) => hf._sample(walkArr, x, z, !0);
  const height = walkAt;
  // opts.fly：御剑飞行（筑基后）——无视深水、断涧与崖高，只受地图边界 / 墨雾围栏与碰撞体限制
  const canStand = (x, z, fromY, r = 0.32, opts) => {
    if (opts && opts.fly) {
      if (hf.ground(x, z) < -20) return !1; // 地图边界外的云海
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return !1;
      return !0;
    }
    const h = walkAt(x, z);
    if (h < -0.8) return !1;
    if (h - fromY > STEP_UP || fromY - h > STEP_DOWN) return !1;
    for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return !1;
    return !0;
  };
  // 平稳可站：周围 0.6 米内高差小、不在水里
  const flatOk = (x, z, clear = 0.6) => {
    const h = walkAt(x, z);
    if (h < -0.6) return !1;
    for (const [dx, dz] of [[clear, 0], [-clear, 0], [0, clear], [0, -clear]]) if (Math.abs(walkAt(x + dx, z + dz) - h) > 0.45) return !1;
    return hf.riverDist(x, z) > 0.3 || h > hf.ground(x, z) + 0.05;
  };
  // 候选点就近落到平稳处（螺旋搜索 ≤ 5 米）
  const settle = (p, clear = 0.6) => {
    const [x0, z0] = p;
    if (flatOk(x0, z0, clear)) return [x0, z0];
    for (let r = 0.5; r <= 5; r += 0.5)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + r;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (flatOk(x, z, clear)) return [x, z];
      }
    return [x0, z0];
  };
  const v3 = ([x, z]) => new THREE.Vector3(x, walkAt(x, z), z);
  // 分区（风险）
  // 分区（区域规划 v2 数据约定）：{ id, name, realm: [最低层, 最高层], baseLevel, danger(=risk), poly }；重叠时取 danger 高的
  const zones = (def.zones || []).map((z) => ({ ...z, risk: z.risk ?? z.danger ?? 1, danger: z.danger ?? z.risk ?? 1, P: prepPoly(z.poly) }));
  const zoneAt = (x, z) => {
    let best = null;
    for (const q of zones) if (sdPoly(x, z, q.P) <= 0 && (!best || q.risk > best.risk)) best = q;
    return best ? { id: best.id, name: best.name, risk: best.risk, danger: best.danger, realm: best.realm, baseLevel: best.baseLevel } : null;
  };
  const zoneById = (id) => zones.find((z) => z.id === id);

  // ---- 本局点位（种子） ----
  const R = rng(seed);
  const D = def.points || {};
  const L = L0;
  const points = { entries: [], extracts: [], chests: [], gathers: [], glows: [], elites: [], ruins: [], boss: null, spawns: [], jumps: [] };
  // 所有候选点（植被让开它们，与种子无关，保证同一关卡植被不变）
  const reserved = [];
  const reserve = (p, r = 2.6) => p && reserved.push([xz(p)[0], xz(p)[1], r]);
  (D.entries || []).forEach((p) => reserve(p, 3));
  (D.gates || []).forEach((g) => reserve(g.pos, 5.5));
  (D.ruins?.from || []).forEach((p) => reserve(p, 5));
  (D.chests?.from || []).forEach((p) => reserve(p, 2));
  (D.gathers || []).forEach((g) => g.from.forEach((p) => reserve(p, 1.8)));
  (D.glows?.from || []).forEach((g) => reserve(g.pos, 2.4));
  (D.elites?.from || []).forEach((p) => reserve(p, 2));
  (D.dens || []).forEach((d) => reserve(d.pos, 4));
  (D.spawns || []).forEach((s) => reserve(s.pos, 2.5));
  (D.jumps || []).forEach((j) => (reserve(j.from, 2), reserve(j.to, 2)));
  if (D.boss) reserve(D.boss.pos, 4), D.boss.exit && reserve(D.boss.exit, 4);
  if (def.tutorialLayout) {
    const T = def.tutorialLayout;
    (T.entries || []).forEach((p) => reserve(p, 3));
    (T.extracts || []).forEach((x) => reserve(x.pos, 5));
    (T.gathers || []).forEach((g) => reserve(g.pos, 1.8));
    (T.spawns || []).forEach((s) => reserve(s.pos, 2.5));
  }
  for (const p of def.props || []) if (p.pos) reserve(p.pos, p.type === "temple" ? 6 : p.type === "pavilion" ? 4 : 1.5);
  (D.pavilions?.from || []).forEach((q) => reserve(q.pos, 4));
  (D.steles?.from || []).forEach((q) => reserve(q.pos, 3));
  // 奇遇 / 委托遗物 / 异种 / 首领门：植被让开（否则随机散布的树石会压在点上）
  (D.encounters || []).forEach((q) => reserve(q.pos, 2.5));
  (D.relics || []).forEach((q) => reserve(q.pos, 2));
  (D.rares?.from || []).forEach((q) => reserve(q.pos, 3));
  (D.bossGates || (D.bossGate ? [D.bossGate] : [])).forEach((q) => reserve(q.pos, 3));

  if (L) {
    points.entries = (L.entries || []).map((p) => ({ pos: v3(settle(p)) }));
    points.extracts = (L.extracts || []).map((x) => ({ ...x, pos: v3(settle(x.pos, 1)), channel: x.channel ?? CHANNEL[x.kind] ?? 0 }));
    points.gathers = (L.gathers || []).map((g) => ({ kind: g.kind, label: g.label, cat: g.cat, pos: v3(settle(g.pos)) }));
    points.chests = (L.chests || []).map((c) => ({ tier: c.tier || "normal", pos: v3(settle(c.pos || c)) }));
    points.spawns = (L.spawns || []).map((s) => ({ ...s, pos: v3(settle(s.pos)) }));
    points.steps = (L.steps || []).map((q) => ({ ...q, pos: v3(settle(q.pos)) }));
    points.bounds = L.bounds || null;
  } else {
    points.entries = shuffle(D.entries || [], R).map((p) => ({ pos: v3(settle(p)) }));
    for (const g of D.gates || []) points.extracts.push({ id: g.id, kind: "gate", name: g.name, pos: v3(settle(g.pos, 1.5)), channel: CHANNEL.gate });
    if (D.ruins) {
      const nPick = D.ruins.pick || 1, nFake = D.ruins.fake || 0;
      let pick, fakeIdx;
      if (D.ruins.fakeFrom && nFake) {
        // 假阵只从 fakeFrom（离古阵远的中段）里抽，其余从 from 里抽真阵
        const fakes = shuffle(D.ruins.fakeFrom, R).slice(0, nFake);
        const key = (p) => p[0] + "," + p[1];
        const fk = new Set(fakes.map(key));
        const reals = shuffle(D.ruins.from.filter((p) => !fk.has(key(p))), R).slice(0, nPick - fakes.length);
        pick = shuffle([...reals, ...fakes], R);
        fakeIdx = new Set(pick.map((p, i) => (fk.has(key(p)) ? i : -1)).filter((i) => i >= 0));
      } else {
        pick = shuffle(D.ruins.from, R).slice(0, nPick);
        fakeIdx = new Set(shuffle(pick.map((_, i) => i), R).slice(0, nFake));
      }
      pick.forEach((p, i) => {
        const fake = fakeIdx.has(i);
        points.extracts.push({ id: `${def.id}_ruin${i + 1}`, kind: fake ? "fake" : "ruin", name: "残阵", pos: v3(settle(p, 1.5)), channel: CHANNEL[fake ? "fake" : "ruin"], unknown: !0 });
      });
    }
    if (D.chests) {
      const nGlow = D.chests.glow || 0;
      if (D.chests.glowFrom) {
        // 灵光宝箱只从 glowFrom（高风险区）里抽
        for (const p of shuffle(D.chests.glowFrom, R).slice(0, nGlow)) points.chests.push({ tier: "glow", pos: v3(settle(xz(p))) });
        for (const p of shuffle(D.chests.from, R).slice(0, D.chests.pick - nGlow)) points.chests.push({ tier: "normal", pos: v3(settle(xz(p))) });
      } else shuffle(D.chests.from, R).slice(0, D.chests.pick).forEach((p, i) => points.chests.push({ tier: i < nGlow ? "glow" : "normal", pos: v3(settle(xz(p))) }));
    }
    for (const g of D.gathers || []) for (const p of shuffle(g.from, R).slice(0, g.pick)) points.gathers.push({ kind: g.kind, label: g.label, cat: g.cat || "herb", pos: v3(settle(p)) });
    if (D.glows) for (const g of shuffle(D.glows.from, R).slice(0, D.glows.pick)) points.glows.push({ ...g, pos: v3(settle(g.pos)) });
    // 精英：[x, z, { shield: [...] }] 第三分量是可选的护盾五行
    // 抽取时保证两只精英相距 ≥ minGap（默认 25 米），离首领 ≥ bossClear（默认 30 米）
    if (D.elites) {
      const gap = D.elites.minGap ?? 25, clear = D.elites.bossClear ?? 30, bp = D.boss && D.boss.pos;
      const picked = [];
      for (const p of shuffle(D.elites.from, R)) {
        if (picked.length >= D.elites.pick) break;
        if (bp && Math.hypot(p[0] - bp[0], p[1] - bp[1]) < clear) continue;
        if (picked.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
        picked.push(p);
      }
      points.elites = picked.map((p) => ({ ...(p[2] || {}), pos: v3(settle(p)) }));
    }
    // 刷怪点：先从最高风险区抽 1 组，其余按区的风险加权排序（流程取前 N 组即可）
    {
      const list = (D.spawns || []).map((q) => ({ ...q, pos: v3(settle(q.pos)), risk: (q.zone && zones.find((z) => z.id === q.zone)?.risk) || zoneAt(q.pos[0], q.pos[1])?.risk || 1 }));
      const out = [];
      if (list.length && zones.length) {
        const top = Math.max(...list.map((q) => q.risk));
        const cand = list.filter((q) => q.risk === top);
        out.push(cand[Math.floor(R() * cand.length)]);
      }
      // 其余按分区轮转（由浅到深，每区每轮 1 组，区内随机）：流程取前 N 组时各分区都有怪，浅区不会被跳过
      const groups = new Map();
      for (const q of shuffle(list.filter((q) => !out.includes(q)), R)) {
        const k = q.zone || "_" + q.risk;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(q);
      }
      const order = [...groups.values()].sort((a, b) => a[0].risk - b[0].risk);
      while (order.some((g) => g.length)) for (const g of order) if (g.length) out.push(g.shift());
      points.spawns = out;
      points.spawnPacks = def.spawnPlan?.packs ?? null; // 建议流程开局刷的组数（regions.js 的 packs 可读它）
    }
    points.ruins = (D.dens || []).map((d) => ({ id: d.id, name: d.name, need: d.need || null, pos: v3(settle(d.pos)) }));
    if (D.boss)
      points.boss = {
        ...D.boss,
        pos: v3(settle(D.boss.pos)),
        exit: D.boss.exit ? v3(settle(D.boss.exit, 1.5)) : null,
        adds: (D.boss.adds || []).map((p) => v3(settle(p))),
        shrines: (D.boss.shrines || []).map((p) => v3(p)),
      };
    points.jumps = (D.jumps || []).map((j) => ({ ...j, from: v3(j.from), to: v3(j.to) }));
    // 首领门：走近 r 米提示"此去：…"（流程读）；可有多个入口，bossGate 指第一个
    points.bossGates = (D.bossGates || (D.bossGate ? [D.bossGate] : [])).map((g) => ({ ...g, pos: v3(settle(g.pos)) }));
    points.bossGate = points.bossGates[0] || null;
    // 异种：每局按 chance 出现 0–1 只（pick: [0, 1]），位置有环境暗示（焦土 / 白霜 / 白骨…），敌人模块按 sign 选种类
    points.rares = [];
    if (D.rares && D.rares.from && D.rares.from.length) {
      const [lo, hi] = Array.isArray(D.rares.pick) ? D.rares.pick : [0, D.rares.pick ?? 1];
      let n = lo;
      while (n < hi && R() < (D.rares.chance ?? 0.35)) n++;
      points.rares = shuffle(D.rares.from, R).slice(0, n).map((q) => ({ ...q, pos: v3(settle(q.pos)) }));
    }
    // 评审新增的数据：奇遇候选、委托遗物、巡游路线、夜潮来向、地标（原样带出，坐标换成 Vector3）
    points.encounters = (D.encounters || []).map((q) => ({ ...q, pos: v3(settle(q.pos)) }));
    points.relics = (D.relics || []).map((q) => ({ ...q, pos: v3(settle(q.pos)) }));
    points.patrols = (def.patrols || []).map((q) => ({ ...q, path: q.path.map((p) => v3(p)) }));
    points.night = (def.night || []).map((q) => ({ ...q, pos: v3(q.pos) }));
    points.landmarks = (def.landmarks || []).map((q) => ({ ...q, pos: v3(q.pos) }));
    // 亭子容器：每局从候选里启用 pick=[min,max] 个（亭子本身全部建出来当景物）；放在其他抽取之后，不影响已有点位的种子顺序
    if (D.pavilions && D.pavilions.from) {
      const [lo, hi] = Array.isArray(D.pavilions.pick) ? D.pavilions.pick : [D.pavilions.pick ?? 2, D.pavilions.pick ?? 2];
      const n = Math.min(D.pavilions.from.length, lo + Math.floor(R() * (hi - lo + 1)));
      points.pavilions = shuffle(D.pavilions.from, R)
        .slice(0, n)
        .map((q) => ({ id: q.id, kind: "pavilion", name: q.name, ry: q.ry || 0, pos: v3(q.pos).setY(hf.ground(q.pos[0], q.pos[1]) + 0.4) })); // y = 亭基石面
    }
  }
  points.pavilions ||= [];
  // 功法残碑：每局从候选里启用 pick=[min,max] 块（全部建成石碑景物；启用的那几块是容器——必出 1 页本区域功法残页，SOURCES.stele）
  points.steles = [];
  if (!tutorial && D.steles && D.steles.from) {
    const [lo, hi] = Array.isArray(D.steles.pick) ? D.steles.pick : [D.steles.pick ?? 1, D.steles.pick ?? 1];
    const n = Math.min(D.steles.from.length, lo + Math.floor(R() * (hi - lo + 1)));
    points.steles = shuffle(D.steles.from, R)
      .slice(0, n)
      .map((q) => ({ id: q.id, kind: "stele", name: q.name, ry: q.ry || 0, zone: q.zone, pos: v3(settle(q.pos)) }));
  }
  // 每个点标上所在分区与风险
  for (const k of ["entries", "extracts", "chests", "gathers", "glows", "elites", "spawns", "ruins", "rares", "pavilions", "steles"])
    for (const q of points[k] || []) {
      const z = (q.zone && zoneById(q.zone)) || zoneAt(q.pos.x, q.pos.z);
      if (z) (q.zone ??= z.id), (q.risk ??= z.risk), (q.baseLevel ??= z.baseLevel), (q.realm ??= z.realm);
    }
  points.zones = zones.map(({ P, ...z }) => z);
  points.bossGates ||= [];
  points.rares ||= [];
  points.shrines = [];

  // ---- 地形、水、桥、植被、天 ----
  const tm = {};
  let tq = t0;
  const lap = (k) => ((tm[k] = Math.round(performance.now() - tq)), (tq = performance.now()));
  lap("hf+points");
  root.add(buildTerrainChunks(hf, def.palette));
  lap("terrain");
  root.add(buildWaterLevel(hf, uLight));
  root.add(buildBridges(hf));
  lap("water");
  const veg = buildLevelVegetation(hf, def, tex, colliders, reserved, def.veg?.clearings || []);
  root.add(veg);
  lap("veg");
  const [W, Dd] = def.size;
  root.add(buildSky({ uLight, peakScale: Math.max(1, Math.max(W, Dd) / 90), mist: { rx: W * 0.52, rz: Dd * 0.52, cz: 0, n: Math.round((W + Dd) / 5) } }));

  // ---- 景物 ----
  const props = new THREE.Group();
  props.name = "props";
  const place = (obj, x, z, ry = 0, y = hf.ground(x, z)) => {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    obj.userData.colliders = [];
    for (const [cx, cz, r] of obj.userData.collide || []) {
      const c = Math.cos(ry), s = Math.sin(ry);
      const col = { x: x + cx * c + cz * s, z: z - cx * s + cz * c, r };
      colliders.push(col);
      obj.userData.colliders.push(col);
    }
    props.add(obj);
    return obj;
  };
  // 异种的环境暗示：焦土 / 白霜 / 白骨 / 异花 / 墨雾——在本局异种出没处铺一片贴地墨渍（一个网格，不每帧更新）
  const SIGN = { scorch: [0x2a211b, 0.5], frost: [0xe8f2f6, 0.6], bones: [0xd8d2c0, 0.45], bloom: [0xc0507a, 0.35], mist: [0x6d7a86, 0.4] };
  for (const q of points.rares || []) {
    const [col, op] = SIGN[q.sign] || SIGN.mist;
    const R0 = q.r ?? 5, geo = new THREE.CircleGeometry(R0, 28);
    const pa = geo.attributes.position;
    for (let k = 1; k < pa.count; k++) {
      const x = pa.getX(k), y = pa.getY(k), a = Math.atan2(y, x), w = 0.75 + 0.35 * Math.sin(a * 3 + q.pos.x) * Math.cos(a * 5 + q.pos.z);
      pa.setXY(k, x * w, y * w);
    }
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: !0, opacity: op, depthWrite: !1, polygonOffset: !0, polygonOffsetFactor: -2 }));
    m.position.set(q.pos.x, hf.ground(q.pos.x, q.pos.z) + 0.06, q.pos.z);
    m.renderOrder = 2;
    m.name = "rare_sign:" + q.sign;
    q.object = m;
    props.add(m);
  }
  // ---- 首领场景件（青牙狼谷 v2：狼王石 / 狼牙石柱 / 狼骨图腾 / 墨雾门 + 谷沿墨雾 / 月光斑）----
  // 接口（与战斗设计约定，boss_青牙_v2 §10.2 第 2 项）：level.bossArena = { pillars, totems, gates.setOn, setMoonVeil, moonSpots, inPit }
  let bossArena = null;
  const RIM_IDLE = 0.55; // 谷沿雾带平时的浓度
  const B = !tutorial && D.boss;
  if (B && (B.pillars || B.totems || B.perch)) {
    const V = (p) => new THREE.Vector3(p[0], hf.walk(p[0], p[1]), p[1]);
    const tag = (o, id) => {
      for (const c of o.userData.colliders || []) c.id = id;
      return (o.userData.colliders || [])[0] || null;
    };
    bossArena = { id: B.id, pillars: [], totems: [], rock: null, gateObjs: {} };
    if (B.perch) {
      const o = place(MK.wolfRock(B.perchR ?? 2.2), B.perch[0], B.perch[1], 0.3);
      bossArena.rock = { id: "perch", pos: V(B.perch), r: B.perchR ?? 2.2, col: tag(o, "perch"), object: o };
    }
    for (const q of B.pillars || []) {
      const o = place(MK.fangPillar(q.r ?? 1.2, q.pos[0] + q.pos[1]), q.pos[0], q.pos[1], q.pos[0] * 0.7);
      const pl = { id: q.id, pos: V(q.pos), r: q.r ?? 1.2, col: tag(o, q.id), alive: !0, object: o };
      // 撞碎：从碰撞体里移除（关卡与 ctx 两份），换成可走的残桩
      pl.break = () => {
        if (!pl.alive) return !1;
        pl.alive = !1;
        if (pl.col) removeCol(pl.col);
        o.userData.setBroken(!0);
        return !0;
      };
      bossArena.pillars.push(pl);
    }
    for (const q of B.totems || []) {
      const o = place(MK.wolfTotem(q.pos[0]), q.pos[0], q.pos[1], Math.atan2(B.pos[0] - q.pos[0], B.pos[1] - q.pos[1]));
      const t = { id: q.id, pos: V(q.pos), den: q.den ? V(q.den) : null, col: tag(o, q.id), alive: !0, object: o };
      t.setLit = (on) => o.userData.setLit(on);
      // 扣血 / 判定倒下在青牙控制器里；这里只管外观和碰撞体
      t.fall = () => {
        if (!t.alive) return !1;
        t.alive = !1;
        if (t.col) removeCol(t.col);
        o.userData.fall();
        return !0;
      };
      bossArena.totems.push(t);
    }
    // 共享 uniform：遮月程度、雾浓（二阶段 setThick）——所有环境层都读它们，切换时不改材质
    const uVeil = { value: 0 }, uThick = { value: 0 };
    bossArena.uVeil = uVeil;
    bossArena.uThick = uThick;
    // 巢穴散件（骨堆王座、狼窝草垫、狼颅鹿角、爪痕血迹、谷壁爪痕）：无碰撞体
    props.add(lairDressing(B, (x, z) => hf.ground(x, z)));
    // 遮月：谷内暗幕 + 谷内低雾（谷外不受影响，形成对比）
    if (B.fence) {
      // 谷沿软边按真实谷地（pits 里同名的多边形，和地形一样做弧线平滑）的有向距离来淡出
      const pitDef = (def.pits || []).find((q) => q.name === "狼谷");
      const PP = prepPoly(pitDef ? (pitDef.sharp ? pitDef.poly : smoothPoly(pitDef.poly, 2.5)) : B.fence);
      props.add(veilShade(B.fence, (x, z) => hf.ground(x, z), uVeil, (x, z) => sdPoly(x, z, PP)));
      props.add(pitMist(B.fence, (x, z) => hf.ground(x, z), { uOn: uVeil }));
    }
    // 墨雾门：横跨入口的一段墨雾墙（开时挡路：一串碰撞圆）；谷沿 rim：一圈柔雾带（只有外观，向外淡出，二阶段往谷里卷）
    const gates = [...(B.gates || [])];
    if (B.fence && !gates.some((g) => g.id === "rim")) gates.push({ id: "rim", poly: B.fence, soft: !0 });
    for (const g of gates) {
      let poly;
      if (g.poly) poly = g.poly;
      else {
        // ry 是朝向（沿石阶，atan2(dx, dz)）；墨雾墙垂直于朝向
        const dx = Math.cos(g.ry || 0), dz = -Math.sin(g.ry || 0), w = (g.w ?? 4) / 2;
        poly = [[g.pos[0] - dx * w, g.pos[1] - dz * w], [g.pos[0] + dx * w, g.pos[1] + dz * w]];
      }
      const uOn = { value: 0 };
      let fog;
      // 谷沿雾带：平时就有一层淡淡的宣纸色雾气盖住崖沿（把崖壁的墨线晕开、向外淡出），开战升满，雾浓时转成墨色并往谷里卷
      if (g.soft) fog = mistBand(poly, (x, z) => hf.ground(x, z), { uOn, uCurl: uThick }, { out: 1.2, size: 8.5, alpha: 0.42, color: 0xe6e1d2, color2: 0x58646c, layers: 3, step: 2.0 });
      else {
        fog = MK.fogWall(poly, (x, z) => hf.ground(x, z), { on: 0, k: 1 });
        fog.userData.uOn.value = 0;
        fog.material.uniforms.uOn = uOn; // 和柔雾带同一套开关
      }
      fog.visible = !1;
      fog.name = "mist_gate:" + g.id;
      props.add(fog);
      const cols = [];
      if (!g.soft && g.pos) place(MK.mistGatePosts(g.w ?? 4), g.pos[0], g.pos[1], g.ry || 0); // 门两侧的石桩 + 横绳 + 骨符
      if (!g.soft) {
        const [a, b] = poly, len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(len / 0.9));
        for (let k = 0; k <= n; k++) cols.push({ x: a[0] + ((b[0] - a[0]) * k) / n, z: a[1] + ((b[1] - a[1]) * k) / n, r: 0.75, id: g.id });
      }
      if (g.soft) (uOn.value = RIM_IDLE), (fog.visible = !0);
      bossArena.gateObjs[g.id] = { id: g.id, soft: !!g.soft, object: fog, uOn, cols, on: !1, k: g.soft ? RIM_IDLE : 0 };
    }
    bossArena.gates = {
      // setOn("mist_n" | "rim" | "all", bool)：墨雾 2 秒升满 / 1.2 秒散去；挡路的门同时加 / 撤碰撞体
      setOn(id, on) {
        for (const g of Object.values(bossArena.gateObjs)) {
          if (id !== "all" && id !== g.id) continue;
          g.on = !!on;
          if (on) (g.object.visible = !0), g.cols.forEach(addCol);
          else g.cols.forEach(removeCol);
        }
      },
      isOn: (id) => !!(bossArena.gateObjs[id] && bossArena.gateObjs[id].on),
      // setThick(k)：0..1，二阶段 1——墨雾门更浓更暗，谷沿雾带往谷里卷 3.5 米并变浓（叙事内的转阶段信号）
      setThick(k) {
        bossArena.thickWant = clamp(k, 0, 1);
      },
    };
    bossArena.thickWant = 0;
    // 月光斑：冷色柔边的地面提亮 + 淡光柱 + 微尘（加色、不写深度、不投影），遮月后沿路径往返漂移（约 0.6 米/秒）
    const uMoon = { value: 0 };
    bossArena.moon = (B.moonPaths || []).map((path) => {
      const segs = [];
      let L = 0;
      for (let k = 1; k < path.length; k++) {
        const l = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
        segs.push([path[k - 1], path[k], L, l]);
        L += l;
      }
      const m = moonSpot(B.moonR ?? 3.5, { uK: uMoon });
      m.visible = !1;
      props.add(m);
      return { segs, L, mesh: m };
    });
    bossArena.uMoon = uMoon;
    const moonAt = (mp, t) => {
      if (!mp.L) return [mp.segs[0] ? mp.segs[0][0][0] : 0, mp.segs[0] ? mp.segs[0][0][1] : 0];
      let s = (t * (B.moonSpeed ?? 0.6)) % (2 * mp.L);
      if (s > mp.L) s = 2 * mp.L - s; // 往返
      for (const [a, b, L0, l] of mp.segs) if (s <= L0 + l) return [a[0] + ((b[0] - a[0]) * (s - L0)) / (l || 1), a[1] + ((b[1] - a[1]) * (s - L0)) / (l || 1)];
      const e = mp.segs[mp.segs.length - 1][1];
      return [e[0], e[1]];
    };
    bossArena.moonT = 0;
    bossArena.veil = 0;
    // moonSpots(t)：t = 遮月后经过的秒数（缺省为当前）→ [{ x, z, r }]
    bossArena.moonSpots = (t = bossArena.moonT) =>
      bossArena.moon.map((mp, i) => {
        const [x, z] = moonAt(mp, t + i * 3.1);
        return { x, z, r: B.moonR ?? 3.5 };
      });
    const pitPoly = B.fence ? prepPoly(B.fence) : null;
    bossArena.inPit = (x, z) => !!pitPoly && sdPoly(x, z, pitPoly) <= 0;
  }
  // 残碑候选全部建成石碑景物（站在碑前 1.6 米处交互）；启用的那几块挂上对象
  for (const q of tutorial ? [] : D.steles?.from || []) {
    const o = MK.stele(q.pos[0], q.pos[1], q.ry || 0, colliders, hf.ground(q.pos[0], q.pos[1]));
    o.name = "stele:" + q.id;
    o.userData.colliders = [colliders[colliders.length - 1]]; // MK.stele 自己推进 colliders 的那一个
    props.add(o);
    const on = points.steles.find((x) => x.id === q.id);
    if (on) on.object = o;
  }
  // 亭子候选全部建成景物；启用的那几个把亭子对象挂到容器点上
  for (const q of D.pavilions?.from || []) {
    const o = MK.pavilion(q.pos[0], q.pos[1], colliders, hf.ground(q.pos[0], q.pos[1]), q.ry || 0);
    o.name = "pavilion:" + q.id;
    props.add(o);
    const on = points.pavilions.find((x) => x.id === q.id);
    if (on) on.object = o;
  }
  for (const p of def.props || []) {
    const [x, z] = p.pos || [0, 0];
    if (p.type === "temple") place(MK.temple(), x, z, p.ry || 0);
    else if (p.type === "lantern") props.add(MK.lantern(x, z, colliders, hf.ground(x, z)));
    else if (p.type === "stele") {
      const o = MK.stele(x, z, p.ry || 0, colliders, hf.ground(x, z));
      if (p.scale) {
        // 放大的石碑（剑碑）：以碑脚为原点缩放，碰撞半径跟着放大
        o.geometry.translate(-x, -hf.ground(x, z), -z);
        o.scale.setScalar(p.scale);
        o.position.set(x, hf.ground(x, z) - 0.2, z);
        colliders[colliders.length - 1].r *= p.scale * 0.8;
      }
      props.add(o);
    } else if (p.type === "wolf_rock") place(MK.wolfStone(p.r || 1.2, hashSeed(x * 131 + z)), x, z, x * 1.3, hf.ground(x, z) - 0.15);
    else if (p.type === "boulder") place(MK.boulder(p.r || 1.2, hashSeed(x * 131 + z)), x, z, x * 1.7, hf.ground(x, z) - 0.2);
    else if (p.type === "shrine") {
      const o = place(MK.shrine(p.el), x, z, p.ry || 0, walkAt(x, z)); // 可能在桥上（潭口石梁的木坛）
      points.shrines.push({ pos: v3([x, z]), el: p.el, name: p.name, object: o });
    }
    else if (p.type === "pavilion") props.add(MK.pavilion(x, z, colliders, hf.ground(x, z), p.ry || 0));
    else if (p.type === "bones") place(MK.bones(), x, z, x * 7.1);
    else if (p.type === "brokenBridge") props.add(brokenBridge(hf, p.a, p.b));
  }

  // ---- 标记物 ----
  const marks = new THREE.Group();
  marks.name = "markers";
  const glowMats = [];
  const track = (o) => (o.userData.glows || []).forEach((m) => glowMats.push(m));
  const extractObj = new Map();
  for (const x of points.extracts) {
    const o = x.kind === "cave" ? MK.caveMarker() : x.kind === "gate" ? MK.gateMarker() : MK.ruinMarker(3.2, hashSeed(x.id) % 1000);
    if (x.kind === "cave") {
      // 洞口贴到身后的崖壁上：沿朝向反方向找崖脚
      const ry = x.ry ?? 0, bx = -Math.sin(ry), bz = -Math.cos(ry);
      let d = 0;
      while (d < 8 && hf.ground(x.pos.x + bx * d, x.pos.z + bz * d) < x.pos.y + 1.0) d += 0.25;
      const back = Math.max(0, d - 2.5);
      place(o, x.pos.x + bx * back, x.pos.z + bz * back, ry, x.pos.y);
    } else place(o, x.pos.x, x.pos.z, x.ry ?? 0, x.pos.y);
    o.userData.point = x;
    x.object = o;
    extractObj.set(x.id, o);
    track(o);
  }
  for (const c of points.chests) {
    const o = place(MK.chestMarker(c.tier), c.pos.x, c.pos.z, R() * 6.28, c.pos.y);
    c.object = o;
    track(o);
  }
  for (const g of points.gathers) {
    const o = place(MK.gatherMarker(g.kind, g.cat), g.pos.x, g.pos.z, R() * 6.28, g.pos.y - 0.05);
    g.object = o;
    track(o);
  }
  for (const g of points.glows) {
    const o = place(MK.glowMarker(g.kind), g.pos.x, g.pos.z, R() * 6.28, g.pos.y);
    g.object = o;
    track(o);
  }
  for (const d of points.ruins) {
    const src = (D.dens || []).find((q) => q.id === d.id) || {};
    const style = src.door ? "cliff" : "cellar";
    const at = src.door || [d.pos.x, d.pos.z];
    const o = place(MK.denMarker(style), at[0], at[1], src.ry || 0, style === "cliff" ? hf.ground(d.pos.x, d.pos.z) : d.pos.y);
    d.object = o;
    track(o);
  }
  // 通用的首领场地立石圈：有专属场景件（bossArena，如青牙狼谷）时不建——立石会和图腾、墨雾、石柱混在一起
  if (points.boss && !bossArena) {
    const b = points.boss;
    const lake = b.lake ? hf.lakes.find((q) => Math.hypot(q.x - b.lake[0], q.z - b.lake[1]) < 3) : null;
    const [cx, cz, rx, rz] = lake ? [lake.x, lake.z, lake.rx + 3.5, lake.rz + 3.5] : [b.pos.x, b.pos.z, b.arena, b.arena];
    const o = MK.arenaMarker(rx, rz, (x, z) => hf.ground(x, z), cx, cz, 0.25, reserved.filter((q) => q[2] < 5));
    place(o, cx, cz, 0, 0);
    b.object = o;
  }
  for (const j of points.jumps) for (const p of [j.from, j.to]) place(MK.jumpMarker(), p.x, p.z, Math.atan2(j.to.x - j.from.x, j.to.z - j.from.z), p.y);
  root.add(marks, props);
  if (L0 && L0.bounds) root.add(MK.fogWall(L0.bounds, (x, z) => hf.ground(x, z)));
  lap("props");
  // 把标记物从 props 挪到 markers（方便分开统计 / 隐藏）
  for (const o of [...props.children]) if (o.userData.point || o.userData.glows) marks.add(o);

  // ---- 灯光 ----
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
  sun.castShadow = !0;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -38;
  sc.right = sc.top = 38;
  sc.near = 1;
  sc.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  const hemi = new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85);
  root.add(sun, sun.target, hemi);
  const sunDir = new THREE.Vector3(-26, 40, -14).normalize();

  // ---- 天时 ----
  const KEYS = [
    // t, 光向（方位°, 仰角°）, 日光色, 强度, 天光色, 地光色, 天光强度, 背景, 水 / 云亮度
    [0.0, [70, 22], 0xffeedd, 1.6, 0xf0e4d8, 0x5a5450, 0.8, 0xece2d4, 0.95],
    [0.33, [210, 50], 0xfff6e8, 2.0, 0xf2efe6, 0x5a5d5a, 0.85, 0xece6d6, 1.0],
    [0.66, [290, 18], 0xffe0c4, 1.35, 0xece0d2, 0x56524c, 0.74, 0xe8dccb, 0.85],
    [1.0, [220, 55], 0x9fb4d8, 0.55, 0x8d9ab8, 0x2a2e38, 0.42, 0x2c3340, 0.42],
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  let tod = 0.33;
  let veil = 0; // 遮月程度（setMoonVeil）
  function setTimeOfDay(t) {
    tod = clamp(t, 0, 1);
    let i = 0;
    while (i < KEYS.length - 2 && tod > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = clamp((tod - a[0]) / (b[0] - a[0]), 0, 1);
    const az = lerp(a[1][0], b[1][0], k) * (Math.PI / 180), el = lerp(a[1][1], b[1][1], k) * (Math.PI / 180);
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    sun.color.copy(cA.set(a[2]).lerp(cB.set(b[2]), k));
    sun.intensity = lerp(a[3], b[3], k);
    hemi.color.copy(cA.set(a[4]).lerp(cB.set(b[4]), k));
    hemi.groundColor.copy(cA.set(a[5]).lerp(cB.set(b[5]), k));
    hemi.intensity = lerp(a[6], b[6], k);
    const lw = lerp(a[8], b[8], k);
    uLight.value.set(lw * (1 - 0.15 * Math.max(0, tod - 0.7) / 0.3), lw, lw * (1 + 0.1 * Math.max(0, tod - 0.7) / 0.3));
    if (ctx.scene && ctx.scene.background && ctx.scene.background.isColor && active) ctx.scene.background.copy(cA.set(a[7]).lerp(cB.set(b[7]), k));
    // 灵光在夜里更显眼
    const glowK = 1 + Math.max(0, tod - 0.55) * 1.6;
    for (const m of glowMats) m.uniforms.uK.value = (m.userData.baseK ??= m.uniforms.uK.value) * glowK;
    // 水墨后期若提供纸色 uniform（uPaper），夜里把纸压暗
    const ink = ctx.ink || (typeof window !== "undefined" && window.__game && window.__game.ink);
    if (ink && ink.mat && ink.mat.uniforms.uPaper) {
      const u = ink.mat.uniforms.uPaper.value;
      u.userData ||= { base: u.clone() };
      u.copy(u.userData.base).multiplyScalar(lerp(1, 0.7, clamp((tod - 0.6) / 0.4, 0, 1)));
    }
    applyVeil();
    updateShadow(!0);
  }
  // 遮月（青牙二阶段）：在天时色调之上整体压暗一档、偏青；不加灯（加灯会让受光材质重编译）
  function applyVeil() {
    if (veil <= 0) return;
    const k = veil * 0.3; // 全局只轻压，主要靠谷内暗幕（veilShade）
    // uLight 是 Vector3，uPaper 可能是 Color 或 Vector3：按分量乘
    const mul3 = (v, r, g, b) => (v.isColor ? ((v.r *= r), (v.g *= g), (v.b *= b)) : ((v.x *= r), (v.y *= g), (v.z *= b)));
    mul3(uLight.value, lerp(1, 0.66, k), lerp(1, 0.74, k), lerp(1, 0.86, k));
    sun.intensity *= lerp(1, 0.55, k);
    hemi.intensity *= lerp(1, 0.75, k);
    hemi.color.lerp(cB.set(0x9fb8c8), 0.5 * k);
    if (ctx.scene && ctx.scene.background && ctx.scene.background.isColor && active) ctx.scene.background.lerp(cB.set(0x6f7d86), 0.6 * k);
    const ink = ctx.ink || (typeof window !== "undefined" && window.__game && window.__game.ink);
    if (ink && ink.mat && ink.mat.uniforms.uPaper) mul3(ink.mat.uniforms.uPaper.value, lerp(1, 0.82, k), lerp(1, 0.86, k), lerp(1, 0.92, k));
  }
  // setMoonVeil(t)：t 0 → 1（战斗模块按 1.5 秒插值调用）；月光斑在 t > 0.5 后显出
  function setMoonVeil(t) {
    veil = clamp(t, 0, 1);
    if (bossArena) (bossArena.veil = veil), (bossArena.uVeil.value = veil);
    setTimeOfDay(tod);
  }
  const focus = new THREE.Vector3();
  function updateShadow() {
    const p = ctx.player ? ctx.player.pos : U.uPlayer.value;
    const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    focus.set(Math.round(p.x / texel) * texel, Math.round(p.y), Math.round(p.z / texel) * texel);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 80);
    sun.target.updateMatrixWorld();
  }

  // ---- 每帧 ----
  const lods = [];
  veg.traverse((o) => o.userData.lod && lods.push(o));
  const unknownRuins = points.extracts.filter((x) => x.unknown);
  let lodT = 0;
  function update(dt) {
    updateShadow();
    if (bossArena) {
      for (const g of Object.values(bossArena.gateObjs)) {
        const want = g.on ? 1 : g.soft ? RIM_IDLE : 0; // 谷沿雾带不会完全消失
        if (g.k !== want) {
          g.k = want > g.k ? Math.min(1, g.k + dt / 2) : Math.max(0, g.k - dt / 1.2); // 2 秒长满，1.2 秒散去
          g.uOn.value = g.k;
          if (g.k === 0 && !g.on) g.object.visible = !1;
        }
        // 雾浓：墨雾门的 uK 1 → 1.9（更浓更暗）
        if (!g.soft && g.object.material.uniforms.uK) g.object.material.uniforms.uK.value = 1 + 0.9 * bossArena.uThick.value;
      }
      const th = bossArena.uThick;
      if (th.value !== bossArena.thickWant) th.value = bossArena.thickWant > th.value ? Math.min(bossArena.thickWant, th.value + dt / 1.5) : Math.max(bossArena.thickWant, th.value - dt / 1.5);
      if (bossArena.moon.length) {
        const vis = bossArena.veil > 0.01;
        if (vis) bossArena.moonT += dt;
        const spots = vis ? bossArena.moonSpots() : null;
        bossArena.uMoon.value = clamp((bossArena.veil - 0.5) * 2, 0, 1);
        bossArena.moon.forEach((mp, i) => {
          mp.mesh.visible = vis;
          if (!vis) return;
          mp.mesh.position.set(spots[i].x, hf.ground(spots[i].x, spots[i].z), spots[i].z);
        });
      }
    }
    const p = ctx.player ? ctx.player.pos : U.uPlayer.value;
    lodT -= dt;
    if (lodT <= 0) {
      lodT = 0.25;
      for (const o of lods) o.visible = (o.userData.center[0] - p.x) ** 2 + (o.userData.center[1] - p.z) ** 2 < o.userData.lod ** 2;
      // 残阵：走近 10 米内显出真伪
      for (const x of unknownRuins) if (x.unknown && x.pos.distanceTo(p) < 10) revealExtract(x.id);
    }
  }
  function revealExtract(id) {
    const x = points.extracts.find((q) => q.id === id);
    if (!x || !x.object || !x.object.userData.reveal) return;
    x.unknown = !1;
    x.object.userData.reveal(x.kind === "fake" ? "fake" : "real");
    for (const m of x.object.userData.glows || []) m.userData.baseK = m.uniforms.uK.value;
    ctx.world && ctx.world.events && ctx.world.events.emit("level:reveal", { id, kind: x.kind, pos: x.pos.clone() });
  }
  function setExtractActive(id, on) {
    const o = extractObj.get(id);
    if (!o) return;
    for (const m of o.userData.glows || []) m.uniforms.uK.value = on ? m.userData.baseK ?? 1 : 0;
  }
  function consume(pt) {
    const o = pt && (pt.object || pt);
    if (o && o.isObject3D) o.visible = !1;
  }
  // 采集完成：隐藏最近的采集物
  const onGather = (e) => {
    if (!e || !e.pos) return;
    let best = null, bd = 2.5;
    for (const g of [...points.gathers, ...points.glows]) {
      const d = Math.hypot(g.pos.x - e.pos.x, g.pos.z - e.pos.z);
      if (d < bd && g.object.visible) (bd = d), (best = g);
    }
    if (best) best.object.visible = !1;
  };

  // ---- 可达性（格子泛洪；测试与关卡校验用）----
  let reach = null, reachJ = null;
  function flood(withJumps) {
    const { nx, nz, cell, x0, z0 } = hf, walkG = walkArr;
    const blocked = new Uint8Array(nx * nz);
    for (const c of colliders) {
      const r = c.r + 0.32;
      for (let iz = Math.max(0, Math.floor((c.z - r - z0) / cell)); iz <= Math.min(nz - 1, Math.ceil((c.z + r - z0) / cell)); iz++)
        for (let ix = Math.max(0, Math.floor((c.x - r - x0) / cell)); ix <= Math.min(nx - 1, Math.ceil((c.x + r - x0) / cell)); ix++)
          if ((x0 + ix * cell - c.x) ** 2 + (z0 + iz * cell - c.z) ** 2 < r * r) blocked[iz * nx + ix] = 1;
    }
    const seen = new Uint8Array(nx * nz);
    const q = new Int32Array(nx * nz);
    let qh = 0, qt = 0;
    const idx = (x, z) => clamp(Math.round((z - z0) / cell), 0, nz - 1) * nx + clamp(Math.round((x - x0) / cell), 0, nx - 1);
    const push = (i) => {
      if (!seen[i]) (seen[i] = 1), (q[qt++] = i);
    };
    for (const e of points.entries) push(idx(e.pos.x, e.pos.z));
    const links = withJumps ? points.jumps.flatMap((j) => [[idx(j.from.x, j.from.z), idx(j.to.x, j.to.z)], [idx(j.to.x, j.to.z), idx(j.from.x, j.from.z)]]) : [];
    while (qh < qt) {
      const i = q[qh++], h = walkG[i], ix = i % nx, iz = (i / nx) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx, hj = walkG[j];
        if (seen[j] || blocked[j] || hj < -0.8 || hj - h > STEP_UP || h - hj > STEP_DOWN) continue;
        push(j);
      }
      for (const [a, b] of links) if (a === i) push(b);
    }
    return { seen, idx };
  }
  function reachable(x, z, withJumps = !1, r = 1.0) {
    const f = withJumps ? (reachJ ||= flood(!0)) : (reach ||= flood(!1));
    // 点本身可能在物件碰撞体里（宝箱、矿石），看周围 r 米内有没有可达格
    for (let dz = -r; dz <= r; dz += hf.cell) for (let dx = -r; dx <= r; dx += hf.cell) if (f.seen[f.idx(x + dx, z + dz)]) return !0;
    return !1;
  }

  function wading(x, z) {
    const h = walkAt(x, z);
    return hf.riverDist(x, z) < 0 && h > -0.8 && h <= hf.ground(x, z) + 0.05;
  }

  // ---- 接管 / 释放 ----
  let active = !1, prevColliders = null, prevLevel = null, hiddenLights = [];
  const level = {
    root,
    def,
    seed,
    tutorial,
    hf,
    bounds: { x0: -W / 2, x1: W / 2, z0: -Dd / 2, z1: Dd / 2 },
    height,
    ground: (x, z) => hf.ground(x, z),
    slope: (x, z) => hf.slope(x, z),
    canStand,
    colliders,
    points,
    get entry() {
      return points.entries[0] ? points.entries[0].pos : new THREE.Vector3();
    },
    lights: { sun, hemi },
    update,
    setTimeOfDay,
    get timeOfDay() {
      return tod;
    },
    zoneAt,
    // 涉水：只剩浅滩渡口（河与池其余部分是深水，walk 为 DEEP_Y，走不进去）；主角 / 敌人按 moveScale 减速
    wading,
    moveScale: (x, z) => (wading(x, z) ? def.wadeSlow ?? 0.7 : 1),
    // 深水（河 / 池，不含桥、踏石、渡口）：不可站；御剑等飞行判定用它决定"脚下是不是水"
    isDeepWater: (x, z) => hf.deep(x, z),
    // 浅滩渡口：可涉水（moveScale 减速）
    isFord: (x, z) => hf.ford(x, z),
    // 首领场景件（青牙狼谷）；没有首领场地时为 null
    bossArena,
    setMoonVeil,
    moonSpots: (t) => (bossArena ? bossArena.moonSpots(t) : []),
    // 是否在某个谷地里（按 pits 的名字；找不到同名谷地时用首领场地的 fence）
    inPit(name, x, z) {
      const pit = (def.pits || []).find((q) => q.name === name);
      if (pit) return sdPoly(x, z, (pit._P ||= prepPoly(pit.poly))) <= 0;
      return bossArena ? bossArena.inPit(x, z) : !1;
    },
    consume,
    revealExtract,
    setExtractActive,
    reachable,
    activate(c = ctx) {
      if (active) return level;
      active = !0;
      if (c.scene) {
        c.scene.add(root);
        // 场景里原有的日光 / 天光先关掉（关卡自带灯光），释放时恢复
        c.scene.traverse((o) => {
          if ((o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight) && o.visible && !isChild(o, root)) hiddenLights.push(o), (o.visible = !1);
        });
      }
      activeCtx = c;
      if (Array.isArray(c.colliders)) {
        prevColliders = c.colliders.slice();
        c.colliders.length = 0;
        c.colliders.push(...colliders);
      }
      prevLevel = activeLevel();
      setActiveLevel(level);
      c.world && c.world.events && c.world.events.on && c.world.events.on("gather:done", onGather);
      setTimeOfDay(tod);
      return level;
    },
    deactivate() {
      if (!active) return;
      active = !1;
      activeCtx = null;
      root.parent && root.parent.remove(root);
      for (const o of hiddenLights) o.visible = !0;
      hiddenLights = [];
      if (Array.isArray(ctx.colliders) && prevColliders) {
        ctx.colliders.length = 0;
        ctx.colliders.push(...prevColliders);
      }
      prevColliders = null;
      // 离开关卡时把夜里压暗的纸色还原
      const ink = ctx.ink || (typeof window !== "undefined" && window.__game && window.__game.ink);
      const up = ink && ink.mat && ink.mat.uniforms.uPaper;
      if (up && up.value.userData) up.value.copy(up.value.userData.base);
      if (activeLevel() === level) setActiveLevel(prevLevel && prevLevel !== level ? prevLevel : null);
      ctx.world && ctx.world.events && ctx.world.events.off && ctx.world.events.off("gather:done", onGather);
    },
    dispose() {
      level.deactivate();
      const geos = new Set(), mats = new Set();
      root.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
        if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
        if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
        if (o.isInstancedMesh) o.dispose();
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose()); // 贴图（笔触、皴法）是共享的，不释放
      root.clear();
      level.disposed = !0;
    },
  };
  level.buildMs = performance.now() - t0;
  level.stats = { timing: tm, heightfieldMs: hf.buildMs, colliders: colliders.length, ...veg.userData.stats };
  setTimeOfDay(def.timeOfDay ?? 0.33);
  if (ctx.autoActivate !== !1 && ctx.scene) level.activate(ctx);
  return level;
}
function isChild(o, root) {
  for (let p = o; p; p = p.parent) if (p === root) return !0;
  return !1;
}

// 释放缓存的高度场与地形顶点（r1 约 25 MB、r2 约 40 MB 的 CPU 内存）；下次 buildLevel 会重新计算
export function clearLevelCache(id) {
  for (const k of [...HF_CACHE.keys()]) if (!id || k.startsWith(id + "|")) HF_CACHE.delete(k);
}

// 关卡数据表（调试与流程用）
export const LEVEL_DEFS = {
  r1: () => import("../data/levels/r1.js"),
  r2: () => import("../data/levels/r2.js"),
  tutorial: () => import("../data/levels/tutorial.js"),
};
export async function loadLevelDef(id) {
  const f = LEVEL_DEFS[id];
  if (!f) throw new Error("未知关卡 " + id);
  const m = await f();
  return m.default;
}
