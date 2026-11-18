// 地上的战利品（模块 A）：奇遇 / 委托给的东西、采集时储物袋放不下的、丢弃的、换装换下放不下的……落在地上。
// 不自动拾取（用户 2026-11-17："自动拾取老是掉帧卡顿，也要按 F 自取"）：每件挂一个交互伪标记 { kind: "pickup", verb: "取" }，
// 由 run.nearestMark 与其它交互物一起比距离（PICK_R 米内）；按 F → run.takeGround() 一次取走身边所有（takeNear）。
// 储物袋满了就留在原地并给满袋提示。外观：一笔圆相 + 品质光晕 + 物品水墨图标（储物袋 v2 图集；未鉴定为墨拓剪影）。
// 性能：精灵材质按贴图共用、光柱几何全局一份、光柱材质按品级共用（取走时不 new / 不 dispose）。
import * as THREE from "three";
import { RARITY, defOf, makeItem, valueOf } from "../../core/items.js";
import { ensureItemDef } from "./flow_items.js";
import { height } from "../../world/terrain.js";
import { lootIconTex } from "../../fx/loot_icon_tex.js"; // 圆相 + 品质淡晕 + 图集图标（同类掉落共用一张贴图）

export const PICK_R = 1.6; // 按 F 取物的半径（米）：提示出现的距离 = 一次取走的范围

let BEAM_GEO = null;
const BEAM_MAT = new Map(), SPRITE_MAT = new Map();
const beamGeo = () => BEAM_GEO || (BEAM_GEO = new THREE.CylinderGeometry(0.06, 0.18, 2.4, 8, 1, !0).translate(0, 1.2, 0));
function beamMat(q) {
  let m = BEAM_MAT.get(q);
  if (!m) BEAM_MAT.set(q, (m = new THREE.MeshBasicMaterial({ color: RARITY[q].color, transparent: !0, opacity: 0.35, depthWrite: !1 })));
  return m;
}
function spriteMat(tex) {
  let m = SPRITE_MAT.get(tex);
  if (!m) SPRITE_MAT.set(tex, (m = new THREE.SpriteMaterial({ map: tex, transparent: !0, depthWrite: !1 })));
  return m;
}
// 地上物品的显示名（未鉴定写"未鉴定的…"；可堆叠的带数量）
export function groundName(inst) {
  const d = defOf(inst) || {};
  return (inst.identified === !1 ? "未鉴定的" : "") + (d.name || inst.id) + (inst.n > 1 ? " ×" + inst.n : "");
}

// 把掉落事件里的物品统一成物品实例（兼容旧格式 {id, name, n}）
export function toInstances(items, region) {
  const out = [];
  for (const it of items || []) {
    if (!it) continue;
    if (it.uid) out.push(it);
    else {
      ensureItemDef(it.id, it.name);
      out.push(makeItem(it.id, { n: it.n || 1, rarity: it.rarity, level: it.level ?? (region && region.level) }));
    }
  }
  return out;
}

export class Pickups {
  constructor(ctx, run) {
    this.ctx = ctx;
    this.run = run;
    this.root = new THREE.Group();
    this.root.name = "pickups";
    ctx.scene.add(this.root);
    this.list = [];
    this.fullWarnT = 0;
  }
  drop(pos, inst, spread = 1) {
    const q = Math.max(0, Math.min(4, inst.rarity || 0));
    const s = new THREE.Sprite(spriteMat(lootIconTex(inst)));
    s.scale.setScalar(0.55 + 0.12 * Math.min(3, q));
    s.renderOrder = 28;
    const a = Math.random() * Math.PI * 2, rr = Math.random() * spread;
    const x = pos.x + Math.cos(a) * rr, z = pos.z + Math.sin(a) * rr;
    const gy = height(x, z);
    s.position.set(x, gy + 0.55, z);
    this.root.add(s);
    // 品质光柱（灵品以上）
    let beam = null;
    if (q >= 1) {
      beam = new THREE.Mesh(beamGeo(), beamMat(q));
      beam.position.set(x, gy, z);
      beam.renderOrder = 27;
      this.root.add(beam);
    }
    const p = { inst, sprite: s, beam, x, z, gy, t: Math.random() * 6, age: 0 };
    // 交互伪标记（run.nearestMark 用；label 由 run 按"身边几件"改写）
    p.mark = { kind: "pickup", verb: "取", pos: new THREE.Vector3(x, gy, z), label: groundName(inst), q, pickup: p };
    this.list.push(p);
    return p;
  }
  dropMany(pos, insts, spread = 1.2) {
    const out = [];
    for (const it of insts) out.push(this.drop(pos, it, insts.length > 1 ? spread : 0.3));
    return out;
  }
  remove(p) {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.root.remove(p.sprite);
    if (p.beam) this.root.remove(p.beam);
    this.list.splice(i, 1);
  }
  update(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      p.age += dt;
      p.sprite.position.y = p.gy + 0.55 + Math.sin(p.t * 2.4) * 0.08;
    }
  }
  // 身边 r 米内的地上物品，近的在前
  near(pos, r = PICK_R) {
    const out = [];
    for (const p of this.list) {
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d <= r) (p.d = d), out.push(p);
    }
    return out.length > 1 ? out.sort((a, b) => a.d - b.d) : out;
  }
  // 按 F：取走 pos 身边 r 米内的全部（run.collect：关键物品进护身格、其余进储物袋；放不下的留在原地）
  takeNear(pos, r = PICK_R) {
    const ps = this.near(pos, r);
    if (!ps.length) return { got: [], left: [] };
    const res = this.run.collect(ps.map((p) => p.inst), { src: "ground" });
    const got = new Set(res.got);
    for (const p of ps) if (got.has(p.inst)) this.remove(p);
    return res;
  }
  totalValue() {
    return this.list.reduce((s, p) => s + valueOf(p.inst), 0);
  }
  dispose() {
    for (const p of [...this.list]) this.remove(p);
    this.ctx.scene.remove(this.root);
  }
}
