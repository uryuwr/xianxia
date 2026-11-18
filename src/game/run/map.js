// 出行地图适配（模块 A）：优先使用关卡模块的 buildLevel(def, ctx)（src/world/level.js + src/data/levels/<region>.js）；
// 还没有时退回到美术样张那块台地，并在上面随机抽取入口、撤离点、宝箱、采集点、刷怪点，保证流程可以先跑起来。
import * as THREE from "three";

const levelMods = import.meta.glob("../../world/level.js");
const levelDefs = import.meta.glob("../../data/levels/*.js");
const worldMods = import.meta.glob("../../world/*.js", { eager: !0 });

export function hasLevelModule() {
  return Object.keys(levelMods).length > 0;
}

// 美术样张地图（只建一次，常驻；不用时隐藏）
let sample = null;
function buildSample(ctx) {
  if (sample) return sample;
  const W = (name) => worldMods["../../world/" + name + ".js"] || {};
  const root = new THREE.Group();
  root.name = "sample-map";
  const colliders = ctx.colliders;
  const T = W("terrain"), V = W("vegetation"), Wa = W("water"), S = W("sky"), P = W("props");
  if (T.buildTerrain) root.add(T.buildTerrain());
  if (Wa.buildWater) root.add(Wa.buildWater());
  if (V.buildVegetation) root.add(V.buildVegetation(ctx.brush, colliders));
  let props = null;
  if (P.buildProps) root.add((props = P.buildProps(colliders)));
  // 样张里的旧灵草（荧光绿光柱）换成 UI 设计师的新造型（markers.js 的 gatherMarker），标题 / 出行准备背景里不再出现旧样式
  const MK = W("markers");
  if (props && MK.gatherMarker)
    for (const o of props.userData.interact || []) {
      if (o.userData.kind !== "herb") continue;
      o.visible = !1;
      const g = MK.gatherMarker("qingling", "herb");
      g.position.copy(o.position);
      g.rotation.y = o.position.x * 1.7;
      root.add(g);
    }
  if (S.buildSky) root.add(S.buildSky());
  ctx.scene.add(root);
  const height = T.height || (() => 0);
  const slope = T.slope || (() => 0);
  sample = { root, props, height, slope, bounds: { x0: -32, x1: 32, z0: -32, z1: 28 } };
  return sample;
}

// 在样张地图上找可站立的点
function walkablePoints(s, colliders, n, rng, minGap = 6, avoid = []) {
  const out = [];
  for (let k = 0; out.length < n && k < n * 300; k++) {
    const x = s.bounds.x0 + rng() * (s.bounds.x1 - s.bounds.x0), z = s.bounds.z0 + rng() * (s.bounds.z1 - s.bounds.z0);
    const h = s.height(x, z);
    if (h < -0.5 || s.slope(x, z) > 0.25) continue;
    if (colliders.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.2) ** 2)) continue;
    if ([...out, ...avoid].some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
    out.push(new THREE.Vector3(x, h, z));
  }
  return out;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 载入一局的地图，返回统一接口：
//   { kind: "level"|"sample", root, height, bounds, points: {entries, extracts, chests, gathers, glows, spawns, boss}, setTimeOfDay(t), update(dt), dispose() }
export async function loadRunMap(ctx, region, seed = (Math.random() * 1e9) | 0) {
  const rng = mulberry(seed);
  const regionKey = levelDefs["../../data/levels/tutorial.js"] || region !== "tutorial" ? region : "r1"; // 序章有自己的数据（tutorial.js）
  const lm = levelMods["../../world/level.js"];
  const ld = levelDefs["../../data/levels/" + regionKey + ".js"];
  if (lm && ld) {
    try {
      const { buildLevel } = await lm();
      const defMod = await ld();
      const def = defMod.default || defMod[regionKey] || defMod.LEVEL || Object.values(defMod)[0];
      if (sample) sample.root.visible = !1;
      const level = await buildLevel({ ...def, seed, tutorial: region === "tutorial" }, ctx);
      const b = level.bounds || (def.size ? { x0: -def.size[0] / 2, x1: def.size[0] / 2, z0: -def.size[1] / 2, z1: def.size[1] / 2 } : { x0: -80, x1: 80, z0: -60, z1: 60 });
      return {
        kind: "level", level, def, root: level.root, height: (x, z) => level.height(x, z), bounds: b,
        points: normPoints(level.points || {}),
        setTimeOfDay: (t) => level.setTimeOfDay && level.setTimeOfDay(t),
        update: (dt) => level.update && level.update(dt),
        consume: (pt) => level.consume && level.consume(pt),
        dispose: () => level.dispose && level.dispose(),
      };
    } catch (e) {
      console.error("[run] buildLevel 失败，改用样张地图", e);
    }
  }
  const s = showBackdrop(ctx);
  const cols = ctx.colliders;
  const spawn = new THREE.Vector3(-5.5, s.height(-5.5, 16.5), 16.5);
  const entries = [spawn, ...walkablePoints(s, cols, 2, rng, 12, [spawn])];
  const ex = walkablePoints(s, cols, 3, rng, 14, entries);
  const extracts = [];
  if (region === "tutorial") extracts.push({ id: "cave", kind: "cave", name: "破洞府", pos: ex[0] || new THREE.Vector3(8, 0, -4), channel: 0, known: !0 });
  else {
    if (ex[0]) extracts.push({ id: "gate1", kind: "gate", name: "古传送阵", pos: ex[0] });
    if (ex[1]) extracts.push({ id: "ruin1", kind: "ruin", name: "残阵", pos: ex[1] });
    if (ex[2] && region === "r2") extracts.push({ id: "ruin2", kind: "fake", name: "残阵", pos: ex[2] });
  }
  const herbs = (s.props && s.props.userData.interact ? s.props.userData.interact : []).filter((o) => o.userData.kind === "herb").map((o) => o.getWorldPosition(new THREE.Vector3()));
  const gathers = [...herbs.map((pos) => ({ pos, kind: "herb" })), ...walkablePoints(s, cols, 4, rng, 6, entries).map((pos) => ({ pos, kind: rng() < 0.6 ? "herb" : "ore" }))];
  const chests = walkablePoints(s, cols, 3, rng, 8, entries).map((pos, i) => ({ pos, tier: i === 0 && rng() < 0.4 ? "glow" : "normal" }));
  const glows = chests.filter((c) => c.tier === "glow").map((c) => ({ pos: c.pos }));
  const spawns = walkablePoints(s, cols, 6, rng, 9, entries).map((pos) => ({ pos, pack: 3 + ((rng() * 3) | 0) }));
  return {
    kind: "sample", root: s.root, height: s.height, bounds: s.bounds,
    points: { entries, extracts, chests, gathers, glows, spawns, boss: null },
    setTimeOfDay() {}, update() {}, dispose() {},
  };
}

function normPoints(p) {
  const v = (o) => (o && o.isVector3 ? o : o && Array.isArray(o) ? new THREE.Vector3(...o) : o ? new THREE.Vector3(o.x, o.y || 0, o.z) : null);
  // 只统一 pos 为 Vector3，其余字段（label / cat / object / guard / types …）原样保留，关卡的 consume(point) 认 point.object
  const list = (a, f = (x) => x) => (a || []).map((x) => (x && x.pos && x.pos.isVector3 ? f(x) : f({ ...x, pos: v(x.pos || x) })));
  const extra = {};
  for (const [k, a] of Object.entries(p)) if (Array.isArray(a) && !["entries", "extracts", "chests", "gathers", "glows", "spawns", "elites", "ruins"].includes(k)) extra[k] = a.map((x) => (x && x.pos && !x.pos.isVector3 ? { ...x, pos: v(x.pos) } : x));
  // 其余标量 / 单个对象（spawnPacks、bossGate、bounds …）原样带出
  for (const [k, o] of Object.entries(p)) if (!Array.isArray(o) && !(k in extra) && k !== "boss") extra[k] = o && o.pos && !o.pos.isVector3 ? { ...o, pos: v(o.pos) } : o;
  return {
    ...extra,
    entries: (p.entries || []).map((e) => v(e.pos || e)),
    extracts: list(p.extracts, (x) => ({ name: x.kind === "gate" ? "古传送阵" : x.kind === "boss" ? "Boss 出口" : "残阵", ...x })),
    chests: list(p.chests),
    gathers: list(p.gathers),
    glows: list(p.glows),
    spawns: list(p.spawns),
    elites: list(p.elites),
    ruins: list(p.ruins),
    boss: p.boss ? { ...p.boss, pos: v(p.boss.pos || p.boss) } : null,
  };
}

// 标题与洞府占位界面的背景：显示样张地图（或当前关卡）
export function showBackdrop(ctx) {
  const T = worldMods["../../world/terrain.js"];
  if (T && T.setActiveLevel) T.setActiveLevel(null); // 高度回到样张地图
  const s = buildSample(ctx);
  s.root.visible = !0;
  return s;
}
// 样张地图上的互动道具（灵草的摆动动画需要每帧更新时间）
export function sampleProps() {
  return sample && sample.root.visible ? sample.props : null;
}
export function hideSample() {
  if (sample) sample.root.visible = !1;
}
