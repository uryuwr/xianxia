// 功法体系 v2 的法术执行器（docs/design/功法体系_v2.md）：凝锋诀 buff、藤引 grapple、止水诀 counter、火鸦 summon、地行术 blink。
// 掌心雷（chain + antiAir）与落石诀（slam）沿用 effects.js 的执行器。
// 共同约定：伤害走 strike()（带 spell id，首领控制器按 SPELLS[id].boss 折算狼威 / 打断值）；
// 性能（docs/性能优化_v1.md §7）：网格全部池化（藤索 1、火鸦 6），材质与 skill_fx.qiMesh 同参数（已在 prewarm 里预热），粒子 / 圈走 ctx.vfx；
// update 热路径不 new 向量、不用数组字面量。
import * as THREE from "three";
import { STATUS } from "../../core/combat.js";
import { qiMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { INKC } from "../../fx/vfx.js";
import { strike } from "./effects.js";

// 凝锋诀：主角身上的增益状态，蓄势斩剑意削盾 × (1 + intentCut)（src/game/player.js chargeHit 读取）
STATUS.ningfeng = {
  maxStacks: 1,
  dur: 8,
  mods: () => [{ stat: "intentCut", type: "flat", value: 0.5 }],
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const foes = (src) => (e) => e.team !== src.team;
const isBig = (t) => !!(t.tags && (t.tags.has("elite") || t.tags.has("boss")));

// ---------------- 池 ----------------
function pool(sys) {
  if (sys._v2pool) return sys._v2pool;
  const P = (sys._v2pool = { rope: null, crows: [] });
  const rope = qiMesh(ELEM_COLOR.wood, 1);
  rope.visible = !1;
  sys.fx.root.add(rope);
  P.rope = rope;
  for (let i = 0; i < 6; i++) {
    const m = qiMesh(ELEM_COLOR.fire, 0.55);
    m.visible = !1;
    sys.fx.root.add(m);
    P.crows.push({ mesh: m, busy: !1 });
  }
  return P;
}

export const EFFECTS_V2 = {
  // ---- 凝锋诀：立得气势 + 剑意更利 ----
  buff(sys, spell, cast) {
    const e = spell.effect, h = cast.src, w = sys.ctx.world, pl = sys.ctx.player;
    if (pl && pl.addMomentum && e.momentum) pl.addMomentum(e.momentum, !0);
    if (e.status) w.applyStatus(h, e.status, { dur: e.dur, src: h });
    const v = sys.ctx.vfx;
    v.ring(h.pos, 1.4, { color: INKC.gold, dur: 0.45, width: 0.08 });
    v.burst(h.pos, { color: ELEM_COLOR.metal, count: 14, speed: 2.5, up: 4, y: 1.2, size: 0.16 });
    sys.fx.popText("凝锋", null, h.pos, ELEM_COLOR.metal);
  },

  // ---- 藤引：藤索飞出，命中第一个敌人后把主角拉过去 ----
  grapple(sys, spell, cast) {
    const P = pool(sys);
    sys.v2.rope = { spell, src: cast.src, dir: cast.dir.clone(), d: 0, hit: null, back: 0 };
    P.rope.visible = !0;
  },

  // ---- 止水诀：反击架势 ----
  counter(sys, spell, cast) {
    const e = spell.effect, h = cast.src;
    sys.v2.counter = { spell, src: h, t: e.window };
    sys.ctx.vfx.ring(h.pos, 1.2, { color: ELEM_COLOR.water, dur: e.window, width: 0.06 });
    sys.ctx.vfx.burst(h.pos, { color: 0xcfe9f2, count: 8, speed: 1.2, up: 1.5, y: 1, size: 0.14 });
  },

  // ---- 火鸦：绕身盘旋，自行扑击 ----
  summon(sys, spell, cast) {
    const e = spell.effect, P = pool(sys);
    // 同一时间只留一群（新放的顶掉旧的）
    for (const c of sys.v2.crows) (c.slot.busy = !1), (c.slot.mesh.visible = !1);
    sys.v2.crows.length = 0;
    let n = 0;
    for (const slot of P.crows) {
      if (n >= e.count) break;
      slot.busy = !0;
      slot.mesh.visible = !0;
      sys.v2.crows.push({ slot, spell, src: cast.src, ang: (n / e.count) * Math.PI * 2, left: e.strikes, life: e.life, cd: 0.25 + n * (e.interval / e.count), target: null, pos: cast.src.pos.clone().setY(cast.src.pos.y + 1.6) });
      n++;
    }
    sys.ctx.vfx.burst(cast.src.pos, { color: ELEM_COLOR.fire, count: 16, speed: 3, up: 4, y: 1.4, size: 0.18 });
  },

  // ---- 地行术：遁地沿地面疾行，落点破土 ----
  blink(sys, spell, cast) {
    const e = spell.effect, h = cast.src, pl = sys.ctx.player;
    const dist = Math.min(e.range, Math.hypot(cast.point.x - h.pos.x, cast.point.z - h.pos.z));
    const v = sys.ctx.vfx;
    v.burst(h.pos, { color: ELEM_COLOR.earth, count: 18, speed: 3, up: 3, size: 0.22 });
    v.burst(h.pos, { color: INKC.ink, count: 10, speed: 2, up: 2 });
    const emerge = () => {
      const p = h.pos;
      for (const t of sys.ctx.world.query(p, e.radius, foes(h))) {
        const info = strike(sys, h, t, e, spell.element, null, { spell: spell.id });
        if (info && t.alive && e.stun && !isBig(t)) sys.ctx.world.applyStatus(t, "stun", { dur: e.stun, src: h });
      }
      v.ring(p, e.radius, { color: ELEM_COLOR.earth, dur: 0.4, width: 0.12 });
      v.burst(p, { color: ELEM_COLOR.earth, count: 22, speed: 5, up: 5, size: 0.24 });
      v.burst(p, { color: INKC.ink, count: 12, speed: 4, up: 3 });
      sys.shake(0.25);
      sys.ctx.world.events.emit("player:earthWalk", { to: p.clone() });
    };
    if (pl && pl.skillMove && pl.skillMove(cast.dir, Math.max(0.1, dist), e.dur, { iframe: !0, hide: !0, kind: "earth_walk", onEnd: emerge })) return;
    emerge(); // 没有主角控制器（旧沙盒）：原地破土
  },
};

// ---------------- 安装：止水诀的受击钩子 ----------------
export function installV2(sys) {
  sys.v2 = { rope: null, counter: null, crows: [] };
  const w = sys.ctx.world;
  w.events.on("beforeDamage", (info) => {
    const c = sys.v2.counter;
    if (!c || info.cancel || info.target !== sys.hero || !info.attacker || info.attacker.team === sys.hero.team) return;
    if (info.tags && info.tags.includes("dot")) return;
    info.cancel = !0;
    sys.v2.counter = null;
    counterStrike(sys, c, info.attacker);
  });
}

function counterStrike(sys, c, attacker) {
  const sp = c.spell, e = sp.effect, h = c.src, w = sys.ctx.world, v = sys.ctx.vfx;
  const dir = _a.set(attacker.pos.x - h.pos.x, 0, attacker.pos.z - h.pos.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  const hits = w.queryArc(h.pos, dir, e.radius, e.angle / 2, foes(h));
  if (!hits.includes(attacker) && attacker.alive) hits.push(attacker); // 来敌一定吃到（远程也反卷）
  for (const t of hits) strike(sys, h, t, e, sp.element, sp.status, { spell: sp.id, dir: dir.clone() });
  const pl = sys.ctx.player;
  if (pl && pl.addMomentum && e.momentum) pl.addMomentum(e.momentum, !0);
  for (let k = 0; k < 3; k++) v.arc(h.pos, dir, e.radius * (0.5 + k * 0.25), e.angle, { color: k ? ELEM_COLOR.water : 0xe8f4f8, dur: 0.3 + k * 0.06, width: 0.5, y: 0.5 });
  v.burst(h.pos, { color: 0xcfe9f2, count: 20, speed: 5, up: 3, size: 0.2 });
  w.hitStop(0.08);
  sys.shake(0.3);
  sys.fx.popText("止水", null, h.pos, ELEM_COLOR.water);
  w.events.emit("player:counter", { attacker, hits: hits.length, spell: sp.id });
}

// ---------------- 每帧 ----------------
export function updateV2(sys, dt) {
  const V = sys.v2;
  if (!V) return;
  if (V.counter && (V.counter.t -= dt) <= 0) V.counter = null;
  if (V.rope) updateRope(sys, dt);
  if (V.crows.length) updateCrows(sys, dt);
}

function updateRope(sys, dt) {
  const r = sys.v2.rope, e = r.spell.effect, h = r.src, P = pool(sys), w = sys.ctx.world;
  if (!h.alive) return endRope(sys);
  if (!r.hit) {
    if (r.back > 0) {
      // 落空：藤收回
      r.d = Math.max(0, r.d - e.speed * 1.4 * dt);
      if (r.d <= 0.05) return endRope(sys);
    } else {
      r.d = Math.min(e.range, r.d + e.speed * dt);
      _a.copy(h.pos).addScaledVector(r.dir, r.d);
      const H = sys.ctx.terrain.height(_a.x, _a.z);
      let blocked = H > h.pos.y + 1.6; // 撞上崖壁
      if (!blocked) {
        const list = w.query(_a, e.radius, foes(h));
        let best = null, bd = 1e9;
        for (const t of list) {
          const dd = (t.pos.x - h.pos.x) ** 2 + (t.pos.z - h.pos.z) ** 2;
          if (dd < bd) (bd = dd), (best = t);
        }
        if (best) onRopeHit(sys, r, best);
      }
      if (!r.hit && (blocked || r.d >= e.range)) r.back = 1;
    }
  } else if (r.hit.alive) {
    r.d = Math.hypot(r.hit.pos.x - h.pos.x, r.hit.pos.z - h.pos.z);
    _b.set(r.hit.pos.x - h.pos.x, 0, r.hit.pos.z - h.pos.z);
    if (_b.lengthSq() > 1e-4) r.dir.copy(_b.normalize());
    if ((r.hold -= dt) <= 0) return endRope(sys);
  } else return endRope(sys);
  // 藤索外观：从主角手边拉到藤头的一条长笔
  const m = P.rope, len = Math.max(0.2, r.d);
  m.position.set(h.pos.x + r.dir.x * len * 0.5, h.pos.y + 1.0, h.pos.z + r.dir.z * len * 0.5);
  m.rotation.set(0, Math.atan2(r.dir.x, r.dir.z), 0);
  m.scale.set(0.35, 1, len / 0.8);
}
function onRopeHit(sys, r, t) {
  const e = r.spell.effect, h = r.src, pl = sys.ctx.player;
  r.hit = t;
  r.hold = e.pullDur + 0.1;
  strike(sys, h, t, e, r.spell.element, r.spell.status, { spell: r.spell.id, dir: r.dir.clone() });
  sys.ctx.vfx.burst(t.pos, { color: ELEM_COLOR.wood, count: 12, speed: 3, up: 2, y: 1, size: 0.16 });
  const d = Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) - e.stop - (t.radius || 0.5);
  if (pl && pl.skillMove && d > 0.2) pl.skillMove(r.dir, d, e.pullDur, { iframe: !0, kind: "vine_pull" });
  if (pl && pl.addMomentum && e.momentum) pl.addMomentum(e.momentum);
  sys.ctx.world.events.emit("player:vinePull", { target: t, dist: Math.max(0, d) });
}
function endRope(sys) {
  sys.v2.rope = null;
  if (sys._v2pool) sys._v2pool.rope.visible = !1;
}

function updateCrows(sys, dt) {
  const list = sys.v2.crows, w = sys.ctx.world, t0 = w.time;
  let launched = !1;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i], e = c.spell.effect, h = c.src, m = c.slot.mesh;
    c.life -= dt;
    if (c.life <= 0 || c.left <= 0 || !h.alive) {
      c.slot.busy = !1;
      m.visible = !1;
      sys.ctx.vfx.burst(c.pos, { color: ELEM_COLOR.fire, count: 5, speed: 1.5, up: 1.5, size: 0.12, y: 0 });
      list.splice(i, 1);
      continue;
    }
    if (c.target && (!c.target.alive || c.target.statuses === undefined)) c.target = null;
    if (!c.target) {
      // 盘旋
      c.ang += dt * 3.2;
      _a.set(h.pos.x + Math.cos(c.ang) * 1.3, h.pos.y + 1.7 + Math.sin(t0 * 5 + i) * 0.12, h.pos.z + Math.sin(c.ang) * 1.3);
      c.pos.lerp(_a, Math.min(1, dt * 10));
      _b.set(-Math.sin(c.ang), 0, Math.cos(c.ang));
      c.cd -= dt;
      if (c.cd <= 0 && !launched) {
        const tg = nearestFoe(w, h, e.seek);
        if (tg) (c.target = tg), (launched = !0);
        c.cd = e.interval;
      }
    } else {
      // 扑击：追踪目标
      const tg = c.target;
      _a.set(tg.pos.x - c.pos.x, tg.pos.y + (tg.height || 1.4) * 0.6 - c.pos.y, tg.pos.z - c.pos.z);
      const d = _a.length();
      if (d < e.radius + (tg.radius || 0.5)) {
        strike(sys, h, tg, e, c.spell.element, c.spell.status, { spell: c.spell.id });
        sys.ctx.vfx.burst(c.pos, { color: ELEM_COLOR.fire, count: 8, speed: 3, up: 2, size: 0.16, y: 0 });
        c.left--;
        c.target = null;
        c.cd = e.interval;
      } else {
        _a.multiplyScalar(1 / d);
        c.pos.addScaledVector(_a, Math.min(d, e.speed * dt));
        _b.set(_a.x, 0, _a.z);
      }
    }
    m.position.copy(c.pos);
    if (_b.lengthSq() > 1e-6) m.rotation.set(0, Math.atan2(_b.x, _b.z), 0);
  }
}
function nearestFoe(w, h, r) {
  let best = null, bd = r * r;
  for (const t of w.query(h.pos, r, foes(h))) {
    const d = (t.pos.x - h.pos.x) ** 2 + (t.pos.z - h.pos.z) ** 2;
    if (d < bd) (bd = d), (best = t);
  }
  return best;
}

// 测试 / 调试：清掉进行中的 v2 法术状态
export function resetV2(sys) {
  if (!sys.v2) return;
  endRope(sys);
  sys.v2.counter = null;
  for (const c of sys.v2.crows) (c.slot.busy = !1), (c.slot.mesh.visible = !1);
  sys.v2.crows.length = 0;
}
