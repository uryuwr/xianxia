// 法宝：被动属性 + V 键主动。祭炼等级 1~5 通过 lv(level) 放大数值。
//   青冥飞剑：飞剑环身，自动斩击近敌；主动令诸剑齐发斩向鼠标处
//   镇山印：主动砸印震晕；被动防御、气血
//   紫金葫芦：主动吸取周围敌人精血回复；被动真气
import * as THREE from "three";
import { swordMesh, sealMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { INKC } from "../../fx/vfx.js";
import { lv } from "../../data/items.js";
import { strike } from "./effects.js";

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------- 青冥飞剑 ----------------
class FlyingSwords {
  constructor(sys, def, level) {
    this.sys = sys;
    this.def = def;
    this.level = level;
    this.swords = [];
    this.angle = 0;
    this.setCount(def.swords(level));
  }
  setCount(n) {
    while (this.swords.length < n) {
      const mesh = swordMesh();
      this.sys.fx.root.add(mesh);
      this.swords.push({ mesh, pos: new THREE.Vector3().copy(this.sys.hero.pos), state: "orbit", cd: Math.random() * 0.6, target: null, t: 0, goal: new THREE.Vector3(), hitDone: !1 });
    }
    while (this.swords.length > n) this.sys.fx.root.remove(this.swords.pop().mesh);
  }
  dispose() {
    this.setCount(0);
  }
  slot(i, out) {
    const h = this.sys.hero.pos, n = this.swords.length, o = this.def.orbit;
    const a = this.angle + (i / n) * Math.PI * 2;
    return out.set(h.x + Math.cos(a) * o.radius, h.y + 1.25 + Math.sin(this.angle * 2 + i) * 0.12, h.z + Math.sin(a) * o.radius);
  }
  active(cast) {
    const A = this.def.active;
    this.swords.forEach((s, i) => {
      s.state = "volley";
      s.t = -i * 0.07; // 依次出鞘
      s.goal.copy(cast.point).add(_v.set((Math.random() - 0.5) * 1.6, 0.3, (Math.random() - 0.5) * 1.6));
      s.hitDone = !1;
    });
    this.volleyAt = cast.point.clone();
    return !0;
  }
  update(dt) {
    const sys = this.sys, w = sys.ctx.world, src = sys.hero, o = this.def.orbit, f = lv(this.level);
    this.angle += dt * 2.2;
    const taken = new Set();
    this.swords.forEach((s, i) => {
      s.cd -= dt;
      const want = _v;
      if (s.state === "orbit") {
        this.slot(i, want);
        s.pos.lerp(want, 1 - Math.exp(-dt * 10));
        // 寻敌：每隔 interval 秒，找附近未被其他飞剑锁定的敌人
        if (s.cd <= 0) {
          const list = w.query(src.pos, o.seek, (e) => e.team !== src.team && !taken.has(e));
          if (list.length) {
            list.sort((a, b) => a.pos.distanceToSquared(src.pos) - b.pos.distanceToSquared(src.pos));
            s.target = list[0];
            taken.add(s.target);
            s.state = "strike";
            s.t = 0;
          } else s.cd = 0.25;
        }
      } else if (s.state === "strike") {
        const t = s.target;
        s.t += dt;
        if (!t || !t.alive || s.t > 1.2) (s.state = "return"), (s.t = 0);
        else {
          want.copy(t.pos).setY(t.pos.y + (t.height || 1.6) * 0.55);
          moveTo(s.pos, want, 20 * dt);
          if (s.pos.distanceTo(want) < 0.5) {
            strike(sys, src, t, { base: o.base * f, scale: o.scale }, "metal", null, { tags: ["artifact", "sword"] });
            sys.ctx.vfx.arc(t.pos, sys.dirTo(src.pos, t.pos), 0.9, 1.6, { color: 0x7fd8ff, dur: 0.22, width: 0.18, y: (t.height || 1.6) * 0.55 });
            s.state = "return";
            s.t = 0;
            s.cd = o.interval;
          }
        }
      } else if (s.state === "return") {
        this.slot(i, want);
        moveTo(s.pos, want, 16 * dt);
        if (s.pos.distanceTo(want) < 0.3) s.state = "orbit";
      } else if (s.state === "volley") {
        s.t += dt;
        if (s.t < 0) this.slot(i, want), s.pos.lerp(want, 0.3);
        else {
          moveTo(s.pos, s.goal, 26 * dt);
          if (!s.hitDone && s.pos.distanceTo(s.goal) < 0.4) {
            s.hitDone = !0;
            const A = this.def.active;
            for (const t of w.query(s.goal, A.radius, (e) => e.team !== src.team))
              strike(sys, src, t, { base: (A.base * f) / Math.max(1, this.swords.length * 0.5), scale: { atk: A.scale.atk / Math.max(1, this.swords.length * 0.5) } }, "metal", null, { tags: ["artifact", "sword"] });
            sys.ctx.vfx.arc(s.goal, new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), A.radius * 0.7, 2.4, { color: 0x7fd8ff, dur: 0.3, width: 0.3, y: 0.4 });
            sys.ctx.vfx.burst(s.goal, { color: 0xbfe8ff, count: 10, speed: 5, up: 2 });
          }
          if (s.hitDone) (s.state = "return"), (s.t = 0);
        }
      }
      // 朝向：剑尖指向运动方向
      const m = s.mesh;
      _v.subVectors(s.pos, m.position);
      m.position.copy(s.pos);
      if (_v.lengthSq() > 1e-5) {
        _q.setFromUnitVectors(UP, _v.normalize());
        m.quaternion.slerp(_q, 1 - Math.exp(-dt * 18));
      } else if (s.state === "orbit") {
        _q.setFromUnitVectors(UP, new THREE.Vector3(0, 1, 0));
        m.quaternion.slerp(_q, 1 - Math.exp(-dt * 6));
      }
      m.userData.glow.material.opacity = s.state === "orbit" ? 0.3 : 0.6;
    });
  }
}
function moveTo(p, goal, maxStep) {
  const d = p.distanceTo(goal);
  if (d <= maxStep) p.copy(goal);
  else p.lerp(goal, maxStep / d);
}

// ---------------- 镇山印 ----------------
class Seal {
  constructor(sys, def, level) {
    this.sys = sys;
    this.def = def;
    this.level = level;
  }
  active(cast) {
    const sys = this.sys, A = this.def.active, f = lv(this.level), p = cast.point.clone(), src = sys.hero;
    const size = 1.6 + 0.15 * this.level;
    sys.ctx.vfx.ring(p, A.radius, { color: ELEM_COLOR.earth, fill: 1, dur: A.delay });
    const seal = sealMesh(size);
    seal.position.set(p.x, p.y + 9, p.z);
    sys.fx.add(seal, A.delay + 0.9, (it) => {
      const k = Math.min(1, it.t / A.delay);
      seal.position.y = p.y + size * 0.28 + 9 * (1 - k * k) + (k >= 1 ? Math.min(3, (it.t - A.delay - 0.4) * 6) * (it.t > A.delay + 0.4 ? 1 : 0) : 0);
      seal.rotation.y += 0.03 * (1 - k);
    });
    sys.later(A.delay, () => {
      for (const t of sys.ctx.world.query(p, A.radius, (e) => e.team !== src.team)) strike(sys, src, t, { base: A.base * f, scale: A.scale }, "earth", A.status, { tags: ["artifact"] });
      sys.ctx.vfx.ring(p, A.radius * 1.2, { color: INKC.ink, dur: 0.5, width: 0.16 });
      sys.ctx.vfx.ring(p, A.radius * 0.7, { color: ELEM_COLOR.fire, dur: 0.4, width: 0.1 });
      sys.ctx.vfx.burst(p, { color: INKC.ink, count: 36, speed: 7, up: 4, size: 0.28 });
      sys.ctx.world.hitStop(0.08);
      sys.shake(0.55);
    });
    return !0;
  }
  update() {}
  dispose() {}
}

// ---------------- 紫金葫芦 ----------------
class Gourd {
  constructor(sys, def, level) {
    this.sys = sys;
    this.def = def;
    this.level = level;
    this.chan = 0;
    this.tickT = 0;
  }
  active() {
    this.chan = this.def.active.dur;
    this.tickT = 0;
    this.sys.ctx.vfx.ring(this.sys.hero.pos, this.def.active.radius, { color: 0x7b4fa8, dur: this.def.active.dur, width: 0.04 });
    return !0;
  }
  update(dt) {
    if (this.chan <= 0) return;
    const sys = this.sys, A = this.def.active, src = sys.hero, f = lv(this.level), w = sys.ctx.world;
    this.chan -= dt;
    this.tickT -= dt;
    // 吸力：敌人被拉向主角
    for (const t of w.query(src.pos, A.radius, (e) => e.team !== src.team)) {
      if (t.tags && t.tags.has("boss")) continue;
      _v.subVectors(src.pos, t.pos).setY(0);
      const d = _v.length();
      if (d > 1.2) t.pos.addScaledVector(_v.normalize(), Math.min(d - 1.2, A.pull * dt));
    }
    if (this.tickT <= 0) {
      this.tickT = A.tick;
      let dealt = 0;
      for (const t of w.query(src.pos, A.radius, (e) => e.team !== src.team)) {
        const info = strike(sys, src, t, { base: A.base * f, scale: A.scale }, null, null, { tags: ["artifact", "drain"] });
        if (info) {
          dealt += info.amount;
          _v.copy(t.pos).setY(t.pos.y + 1);
          sys.ctx.vfx.burst(_v, { color: 0x9a2a3a, count: 3, speed: 1, up: 1, size: 0.14, y: 0 });
        }
      }
      if (dealt) {
        w.heal(src, dealt * A.healRate, "gourd");
        src.mp = Math.min(src.stats.get("mp"), src.mp + dealt * A.mpRate);
      }
    }
  }
  dispose() {}
}

const IMPL = { flying_sword: FlyingSwords, seal: Seal, gourd: Gourd };
export function createArtifact(sys, def, level) {
  const C = IMPL[def.id];
  return C ? new C(sys, def, level) : null;
}
