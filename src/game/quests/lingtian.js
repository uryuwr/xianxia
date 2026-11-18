// 奇遇·灵田（模块 E）：一片野生灵草。每株是 run 的普通采集标记（kind "gather"），F 采集走 run 的采集分支与 gather_<kind> 掉落表，
// 所以掉落、灵草苗、品质、"采药"委托计数都与普通灵草一致；这里只负责：挑位置、摆灵草、灵雾、心声、额外灵草苗、妖兽来袭、采尽结算。
// 数据：src/data/encounters.js 的 lingtian。
import * as THREE from "three";
import { ITEMS, makeItem } from "../../core/items.js";

import { RARITY } from "../../core/items.js";
import { gatherMarker } from "../../world/markers.js";

const HERB_NAME = { qingling: "青灵草", ninglu: "凝露花", hanlu: "寒露草", ziteng: "紫藤", chiyan: "赤炎果", heshouwu: "千年何首乌" };
// 掉落档 lt_<草>_q<品级>（loot.js GATHER.lingtian）→ 灵草 id 与品级（RARITY 0–4）
export function parseKind(kind) {
  const herb = String(kind).replace(/^lt_/, "").replace(/_q\d$/, "");
  const m = /_q(\d)$/.exec(kind);
  return { herb, q: m ? Math.max(0, Math.min(4, +m[1])) : 0 };
}
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 能否在 (x, z) 放一株：可站立、与中心落差小、不贴着别的交互物和别的灵草
function standable(ctx, run, x, z, cy) {
  const T = ctx.terrain;
  if (T && T.canStand) return T.canStand(x, z, cy, 0.45);
  const h = run.map && run.map.height ? run.map.height(x, z) : T && T.height ? T.height(x, z) : cy;
  return Math.abs(h - cy) < 0.6;
}

// 在 center 周围摆 count 株；摆不下 min 株返回 null（调用方换个点）
export function layoutField(ctx, run, center, def, rng) {
  const [lo, hi] = def.count || [5, 9];
  const want = lo + Math.floor(rng() * (hi - lo + 1));
  const R = def.radius || 4.2;
  const H = (x, z) => (run.map && run.map.height ? run.map.height(x, z) : ctx.terrain && ctx.terrain.height ? ctx.terrain.height(x, z) : 0);
  const cy = H(center.x, center.z);
  if (!standable(ctx, run, center.x, center.z, cy)) return null;
  const others = (run.marks || []).filter((m) => m.pos && dist2(m.pos, center) < R + 4);
  const out = [];
  for (let k = 0; k < 120 && out.length < want; k++) {
    const a = rng() * Math.PI * 2, r = 1.1 + Math.sqrt(rng()) * (R - 1.1);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const y = H(x, z);
    if (Math.abs(y - cy) > 0.9 || !standable(ctx, run, x, z, y)) continue;
    if (out.some((p) => dist2(p.pos, { x, z }) < 1.3)) continue;
    if (others.some((m) => dist2(m.pos, { x, z }) < 2.4)) continue;
    out.push({ pos: new THREE.Vector3(x, y, z) });
  }
  return out.length >= lo ? out : null;
}

function pickKind(def, region, rng) {
  const list = (def.kinds && (def.kinds[region] || def.kinds.r1)) || [["qingling", 1]];
  const tot = list.reduce((s, x) => s + x[1], 0);
  let r = rng() * tot;
  for (const [k, w] of list) if ((r -= w) < 0) return k;
  return list[0][0];
}

// 淡青灵雾：两层径向渐变的贴地圆片，缓慢旋转、呼吸
function mistTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(190,240,225,0.85)");
  gr.addColorStop(0.55, "rgba(160,225,205,0.45)");
  gr.addColorStop(1, "rgba(160,225,205,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  // 几缕不规则的雾丝
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc(64 + Math.cos(i * 2.1) * 38, 64 + Math.sin(i * 2.1) * 38, 10 + (i % 3) * 5, 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function makeLingtianVisual(ctx, radius = 4.2) {
  const root = new THREE.Group();
  const tex = mistTexture();
  const layers = [1.25, 0.95].map((k, i) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry((radius + 1.2) * k, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, color: i ? 0xd4f4ea : 0xa8e6d4, transparent: !0, opacity: 0.55, depthWrite: !1 }),
    );
    m.position.y = 0.12 + i * 0.35;
    m.renderOrder = 2;
    root.add(m);
    return m;
  });
  let t = 0;
  return {
    kind: "lingtian", root, radius, intensity: 1,
    update(rdt) {
      t += rdt;
      layers[0].rotation.y = t * 0.05;
      layers[1].rotation.y = -t * 0.08;
      layers[0].material.opacity = (0.45 + 0.08 * Math.sin(t * 0.9)) * this.intensity;
      layers[1].material.opacity = (0.3 + 0.08 * Math.sin(t * 1.3 + 1)) * this.intensity;
      layers[1].position.y = 0.4 + 0.08 * Math.sin(t * 0.7);
      if (this.seal) this.seal.position.y = 2.6 + 0.06 * Math.sin(t * 2);
    },
    face() {},
    talk() {},
    dispose() {
      ctx.scene.remove(root);
      tex.dispose();
    },
  };
}

// 布置一片灵田：每株加一个 run 采集标记（外观由 run 的 fallbackGatherObject → UI 的 gatherMarker 生成）
export function setupField(Q, enc, plants, rng) {
  const run = Q.run, def = enc.def;
  const f = { plants: [], taken: 0, total: plants.length, ambushAt: 0, done: !1, rng };
  const am = def.ambush;
  if (am && rng() < (am.chance ?? 0)) f.ambushAt = Math.min(plants.length, am.at[0] + Math.floor(rng() * (am.at[1] - am.at[0] + 1)));
  for (const p of plants) {
    const kind = pickKind(def, run.region, rng);
    const { herb, q } = parseKind(kind);
    const plant = { pos: p.pos, kind, herb, q, taken: !1, mark: null };
    if (run.addMark) {
      const R = RARITY[q] || RARITY[0];
      const name = HERB_NAME[herb] || "灵草";
      // 外观按灵草品种（UI 的 gatherMarker）；掉落档用完整的 lt_<草>_q<品级>（run 采集时掷 gather_<gatherKind>）
      const obj = gatherMarker(herb, "herb");
      obj.rotation.y = rng() * 6.28;
      const m = run.addMark({
        kind: "gather", pos: p.pos.clone(), gatherKind: kind, herb, rarity: q, label: `${q ? R.name + "·" : ""}${name}（灵田）`, glyph: name[0],
        color: q ? new THREE.Color(R.color).getHex() : 0x3fae7a, lingtian: enc.id, object: obj, point: { object: obj, cat: "herb", kind: herb },
      });
      m.group.add(obj);
      m.fxObject = obj;
      // 品级高一档：脚下加一圈该品级的光
      if (q >= 1) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.85, 32).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(R.color), transparent: !0, opacity: 0.55, depthWrite: !1, blending: THREE.AdditiveBlending }),
        );
        halo.position.y = 0.07;
        m.group.add(halo);
        plant.halo = halo;
      }
      plant.mark = m;
    }
    f.plants.push(plant);
  }
  return f;
}

// gather:done → 是灵田里的哪一株
export function onFieldGather(Q, enc, e) {
  const f = enc.field;
  if (!f || f.done || !e || !e.pos) return !1;
  const plant = f.plants.find((p) => !p.taken && dist2(p.pos, e.pos) < 0.4);
  if (!plant) return !1;
  const def = enc.def, ev = Q.ctx.world.events;
  plant.taken = !0;
  plant.mark = null;
  f.taken++;
  const seeds = (e.items || []).filter((it) => /^seed_/.test(it.id));
  ev.emit("lingtian:gather", { pos: plant.pos.clone(), kind: plant.kind, herb: plant.herb, q: plant.q, items: e.items || [], n: f.taken, total: f.total });
  for (const it of seeds) ev.emit("lingtian:seed", { pos: plant.pos.clone(), item: it, kind: plant.herb, source: "table" });
  // 灵田额外的灵草苗
  const seed = "seed_" + plant.herb;
  if (ITEMS[seed] && f.rng() < (def.seedBonus || 0)) {
    const it = makeItem(seed);
    // 采集所得直接进储物袋，袋满才落地（用户 2026-11-17：所有 F 采集点一律如此；流程组 run.collect）
    const r = Q.run;
    if (r && r.collect) {
      const left = r.collect([it], { src: "gather" }).left;
      if (left.length) r.pickups.dropMany(plant.pos, left, 0.6);
    } else Q.give(plant.pos, [it]);
    ev.emit("lingtian:seed", { pos: plant.pos.clone(), item: it, kind: plant.herb, source: "bonus" });
  }
  if (f.ambushAt && f.taken === f.ambushAt) {
    const am = def.ambush, pl = Q.ctx.player.pos;
    const d = new THREE.Vector3().subVectors(enc.pos, pl).setY(0);
    if (d.lengthSq() < 0.01) d.set(1, 0, 0);
    const from = Q.ground(enc.pos.clone().addScaledVector(d.normalize(), (def.radius || 4) + 6));
    Q.toast(def.ambushText || "妖兽来袭！", "warn", 2.5);
    f.ambush = Q.spawn(from, am.n || 3, !!am.elite);
    ev.emit("lingtian:ambush", { pos: from, n: f.ambush.length });
  }
  if (f.taken >= f.total) {
    f.done = !0;
    enc.state = "done";
    if (enc.vis.seal) enc.vis.seal.visible = !1;
    enc.vis.intensity = 0.35;
    Q.toast(`灵田采尽（${f.total} 株）`, "gold", 2.5);
    Q.applyEffects(enc, def.done || []);
    ev.emit("lingtian:done", { pos: enc.pos.clone(), total: f.total });
  }
  return !0;
}
