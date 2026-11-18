// 法术效果执行器：按数据表里的 effect.type 生成飞行物、扇形、区域、落点重击、连锁闪电、护体。
// 共同约定：伤害一律走 world.dealDamage（五行属性 = 法术五行），命中后附带 spell.status。
import * as THREE from "three";
import { qiMesh, talismanMesh, vineMesh, rockMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { INKC } from "../../fx/vfx.js";
import { applyElemStatus } from "./statuses.js";

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const enemyOf = (src) => (e) => e.team !== src.team;

// 命中：伤害 + 状态
//   extra.spell = 法术 id：首领控制器按 SPELLS[id].boss 折算狼威 / 打断值；功法"重"（二重 +伤害）在这里乘进 base / scale（独立乘区，不走 Stats 的 dmg）
export function strike(sys, src, target, spec, element, status, extra = {}) {
  let base = spec.base, scale = spec.scale;
  const k = extra.spell && sys.zhongDmg ? sys.zhongDmg(extra.spell) : 1;
  if (k !== 1) {
    base = (base || 0) * k;
    scale = scale ? { atk: (scale.atk || 0) * k, spell: (scale.spell || 0) * k } : scale;
  }
  const info = sys.ctx.world.dealDamage(src, target, { base, scale, element, pos: target.pos, ...extra });
  if (info && status && target.alive) applyElemStatus(sys.ctx.world, src, target, status);
  return info;
}

export const EFFECTS = {
  // ---- 飞行物 ----
  projectile(sys, spell, cast) {
    const e = spell.effect, src = cast.src;
    const n = e.count || 1;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * e.spread : 0;
      const dir = cast.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      const mesh = e.look === "talisman" ? talismanMesh(spell.glyph) : qiMesh(ELEM_COLOR[spell.element] ?? INKC.ink, 1.1);
      const p = cast.origin.clone();
      p.y += 1.0;
      p.addScaledVector(dir, 0.6);
      mesh.position.copy(p);
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
      sys.fx.root.add(mesh);
      sys.projectiles.push({ spell, src, mesh, pos: p, dir, travelled: 0, hit: new Set(), spin: e.look === "talisman" });
    }
  },
  // ---- 扇形 ----
  cone(sys, spell, cast) {
    const e = spell.effect, src = cast.src, w = sys.ctx.world;
    const hits = w.queryArc(cast.origin, cast.dir, e.range, e.angle / 2, enemyOf(src));
    for (const t of hits) strike(sys, src, t, e, spell.element, spell.status, { dir: cast.dir.clone(), spell: spell.id });
    const col = ELEM_COLOR[spell.element];
    for (let k = 0; k < 3; k++) sys.ctx.vfx.arc(cast.origin, cast.dir, e.range * (0.45 + k * 0.27), e.angle, { color: k ? col : 0xe8f4f8, dur: 0.32 + k * 0.06, width: 0.5, y: 0.5 });
    for (let k = 0; k < 10; k++) {
      const d = cast.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * e.angle);
      _v.copy(cast.origin).addScaledVector(d, e.range * (0.3 + Math.random() * 0.7));
      sys.ctx.vfx.burst(_v, { color: 0xd8eef4, count: 2, speed: 1.5, up: 1.5, size: 0.2 });
    }
    return hits.length;
  },
  // ---- 地面区域 ----
  zone(sys, spell, cast) {
    const e = spell.effect, src = cast.src;
    const mesh = vineMesh(e.radius);
    mesh.position.copy(cast.point);
    mesh.position.y += 0.08;
    const z = { spell, src, pos: cast.point.clone(), t: 0, tickT: 0, mesh, entered: new Set() };
    sys.fx.add(mesh, e.dur, (it, k) => {
      mesh.material.opacity = Math.min(1, it.t * 4) * (1 - Math.max(0, k - 0.85) / 0.15) * 0.9;
      mesh.rotation.y += 0.002;
    });
    sys.zones.push(z);
    sys.ctx.vfx.ring(cast.point, e.radius, { color: ELEM_COLOR[spell.element], dur: 0.5, width: 0.08 });
  },
  // ---- 延迟落点重击（落石） ----
  slam(sys, spell, cast) {
    const e = spell.effect, src = cast.src, p = cast.point.clone();
    sys.ctx.vfx.ring(p, e.radius, { color: ELEM_COLOR[spell.element], fill: 1, dur: e.delay });
    const rock = rockMesh(e.radius * 0.45);
    rock.position.set(p.x, p.y + 12, p.z);
    sys.fx.add(rock, e.delay + 0.5, (it) => {
      const k = Math.min(1, it.t / e.delay);
      rock.position.y = p.y + 12 * (1 - k * k) + (k >= 1 ? -Math.min(0.6, (it.t - e.delay) * 2) : 0.4);
      rock.rotation.x += 0.08;
      rock.rotation.z += 0.05;
    }, () => rock.geometry.dispose());
    sys.later(e.delay, () => {
      for (const t of sys.ctx.world.query(p, e.radius, enemyOf(src))) strike(sys, src, t, e, spell.element, spell.status, { spell: spell.id });
      sys.ctx.vfx.ring(p, e.radius * 1.15, { color: INKC.ink, dur: 0.4, width: 0.14 });
      sys.ctx.vfx.burst(p, { color: INKC.ink, count: 28, speed: 6, up: 4, size: 0.26 });
      sys.ctx.vfx.burst(p, { color: ELEM_COLOR.earth, count: 14, speed: 4, up: 5 });
      sys.ctx.world.hitStop(0.05);
      sys.shake(0.35);
    });
  },
  // ---- 连锁闪电 ----
  chain(sys, spell, cast) {
    const e = spell.effect, src = cast.src, w = sys.ctx.world;
    // 首个目标：鼠标附近，其次面前最近
    let cur = nearest(w.query(cast.point, 3, enemyOf(src)), cast.point) || nearest(w.queryArc(cast.origin, cast.dir, e.range, 0.6, enemyOf(src)), cast.origin);
    const from = cast.origin.clone().setY(cast.origin.y + 1.3);
    const hit = new Set();
    let dmg = 1;
    for (let j = 0; cur && j <= e.jumps; j++) {
      hit.add(cur);
      _v.copy(cur.pos).setY(cur.pos.y + (cur.height || 1.6) * 0.6);
      sys.fx.lightning(from, _v.clone(), 0xbfe8ff, 0.07);
      // 对空（掌心雷 v2）：飞行的妖物伤害 × antiAir.mul，并被打落（眩晕）
      const air = e.antiAir && cur.tags && cur.tags.has("flying");
      const am = air ? e.antiAir.mul : 1;
      const ci = strike(sys, src, cur, { base: e.base * dmg * am, scale: { spell: e.scale.spell * dmg * am } }, spell.element, spell.status, { spell: spell.id, tags: air ? ["antiAir"] : [] });
      if (air && ci && cur.alive) {
        w.applyStatus(cur, "stun", { dur: e.antiAir.stun, src, data: { downed: !0 } });
        sys.fx.popText("坠", null, cur.pos, ELEM_COLOR.metal);
        w.events.emit("skill:antiAir", { target: cur, spell: spell.id });
      }
      sys.ctx.vfx.burst(_v, { color: 0xbfe8ff, count: 8, speed: 4, up: 2, size: 0.12, y: 0 });
      from.copy(_v);
      dmg *= e.falloff;
      cur = nearest(w.query(cur.pos, e.jumpRange, (x) => enemyOf(src)(x) && !hit.has(x)), cur.pos);
    }
    if (!hit.size) {
      // 没有目标：雷落在鼠标处
      _v.copy(cast.point);
      sys.fx.lightning(_v.clone().setY(_v.y + 9), _v.clone(), 0xbfe8ff, 0.07);
    }
    return hit.size;
  },
  // ---- 护体 ----
  shield(sys, spell, cast) {
    const e = spell.effect, src = cast.src;
    sys.shield.amount = e.absorb + (src.stats.get("spell") * (e.absorbScale.spell || 0));
    sys.shield.max = sys.shield.amount;
    sys.shield.t = e.dur;
    sys.ctx.vfx.ring(src.pos, 1.3, { color: ELEM_COLOR.earth, dur: 0.5, width: 0.12 });
    sys.ctx.vfx.burst(src.pos, { color: ELEM_COLOR.earth, count: 18, speed: 3, up: 4 });
  },
};

function nearest(list, p) {
  let best = null, bd = 1e9;
  for (const e of list) {
    const d = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}

// 每帧推进飞行物
export function updateProjectiles(sys, dt) {
  const w = sys.ctx.world, H = sys.ctx.terrain.height;
  for (let i = sys.projectiles.length - 1; i >= 0; i--) {
    const pr = sys.projectiles[i], e = pr.spell.effect;
    const step = e.speed * dt;
    pr.pos.addScaledVector(pr.dir, step);
    pr.travelled += step;
    pr.mesh.position.copy(pr.pos);
    if (pr.spin) pr.mesh.rotation.set(0, pr.mesh.rotation.y + dt * 14, 0.3);
    let done = pr.travelled >= e.range;
    // 撞上高地（崖壁）
    if (H(pr.pos.x, pr.pos.z) > pr.pos.y - 0.2) done = !0;
    if (!done) {
      for (const t of w.query(pr.pos, e.radius, enemyOf(pr.src))) {
        if (pr.hit.has(t)) continue;
        pr.hit.add(t);
        strike(sys, pr.src, t, e, pr.spell.element, pr.spell.status, { dir: pr.dir.clone(), spell: pr.spell.id });
        sys.ctx.vfx.burst(pr.pos, { color: ELEM_COLOR[pr.spell.element], count: 6, speed: 3, up: 1.5, size: 0.14, y: 0 });
        if (!e.pierce) {
          done = !0;
          break;
        }
      }
    }
    if (done) {
      if (e.explode) explode(sys, pr);
      sys.fx.root.remove(pr.mesh);
      pr.mesh.geometry.dispose();
      sys.projectiles.splice(i, 1);
    }
  }
}
function explode(sys, pr) {
  const x = pr.spell.effect.explode, p = pr.pos.clone();
  p.y = sys.ctx.terrain.height(p.x, p.z);
  for (const t of sys.ctx.world.query(p, x.radius, enemyOf(pr.src))) strike(sys, pr.src, t, x, pr.spell.element, pr.spell.status, { spell: pr.spell.id });
  const col = ELEM_COLOR[pr.spell.element];
  sys.ctx.vfx.ring(p, x.radius, { color: col, dur: 0.4, width: 0.1 });
  sys.ctx.vfx.burst(p, { color: col, count: 26, speed: 6, up: 4, size: 0.22 });
  sys.ctx.vfx.burst(p, { color: INKC.ink, count: 12, speed: 4, up: 3 });
  sys.shake(0.2);
}

// 每帧推进地面区域
export function updateZones(sys, dt) {
  const w = sys.ctx.world;
  for (let i = sys.zones.length - 1; i >= 0; i--) {
    const z = sys.zones[i], e = z.spell.effect;
    z.t += dt;
    z.tickT -= dt;
    if (z.tickT <= 0) {
      z.tickT = e.tick;
      for (const t of w.query(z.pos, e.radius, enemyOf(z.src))) {
        const first = !z.entered.has(t);
        z.entered.add(t);
        strike(sys, z.src, t, e, z.spell.element, first ? z.spell.status : null, { spell: z.spell.id });
      }
    }
    if (z.t >= e.dur) sys.zones.splice(i, 1);
  }
}
