// 心魔试炼（模块 C）：练气九层 → 筑基时，在洞府院中与自己的墨色倒影一战。
// 倒影复用主角模型与动作（SkeletonUtils.clone），属性为林墨的 0.8 倍，气血 3000（§10.5）。
// 胜：调用方执行 progression.breakthrough；败（林墨身陨）：什么都不损失，可再试。
//   const trial = new XinmoTrial(ctx, { center, hp })
//   trial.start() → Promise<boolean 是否胜利>
//   trial.update(dt)（每帧）  trial.hp / trial.max  trial.abort()
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { makeEntity, Stats } from "../../core/combat.js";
import { toon } from "../../render/materials.js";
import { INKC } from "../../fx/vfx.js";

export const XINMO = {
  hpMul: 0.8, // 属性倍率
  hp: 15000, // 数值复核 v1：3000 时练气九层约 4 秒打完，15000 约 31 秒
  speed: 5.2,
  combo: [
    { anim: "slash1", wind: 0.42, hit: 0.16, rec: 0.22, radius: 2.7, half: 1.2, scale: 0.9, knock: 0.8 },
    { anim: "slash2", wind: 0.2, hit: 0.16, rec: 0.22, radius: 2.7, half: 1.2, scale: 0.9, knock: 0.8 },
    { anim: "slash3", wind: 0.36, hit: 0.22, rec: 0.75, radius: 3.0, half: 1.4, scale: 1.5, knock: 2.2 },
  ],
  wave: { wind: 0.6, speed: 13, range: 14, width: 1.2, scale: 1.2, cd: 4.5 }, // 剑气：中距离直线
  dodgeChance: 0.35,
};

const _v = new THREE.Vector3();
export class XinmoTrial {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.center = (o.center || ctx.player.pos).clone();
    this.maxHp = o.hp || XINMO.hp;
    this.onEnd = null;
    this.done = !1;
  }
  get hp() {
    return this.e ? Math.max(0, this.e.hp) : 0;
  }
  get max() {
    return this.e ? this.e.stats.get("hp") : this.maxHp;
  }
  start() {
    const { ctx } = this;
    const P = ctx.player;
    // ---- 倒影模型 ----
    this.root = new THREE.Group();
    this.root.name = "xinmo";
    if (P.model) {
      const m = skClone(P.model);
      const dark = toon({ color: 0x1d1f22, emissive: 0x2a0806, emissiveIntensity: 0.6 });
      const rim = new THREE.MeshBasicMaterial({ color: 0x8a1a10, side: THREE.BackSide });
      m.traverse((o) => {
        if (!o.isMesh) return;
        const outline = o.material && o.material.side === THREE.BackSide;
        o.material = outline ? rim : dark;
        o.castShadow = !0;
      });
      m.position.copy(P.model.position);
      m.rotation.copy(P.model.rotation);
      m.scale.copy(P.model.scale);
      this.root.add(m);
      this.model = m;
      this.mixer = new THREE.AnimationMixer(m);
      this.actions = {};
      for (const [k, a] of Object.entries(P.actions || {})) this.actions[k] = this.mixer.clipAction(a.getClip());
    } else {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8).translate(0, 0.85, 0), toon({ color: 0x1d1f22 }));
      this.root.add(m);
      this.model = m;
      this.actions = {};
    }
    // 墨气外溢
    this.aura = [];
    const tex = inkPuff();
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: !0, depthWrite: !1, opacity: 0.4 }));
      s.userData.ph = Math.random() * 6.28;
      this.aura.push(s);
      this.root.add(s);
    }
    const dir = _v.set(0, 0, -1);
    this.root.position.set(this.center.x + dir.x * 6, 0, this.center.z + dir.z * 6);
    this.root.position.y = ctx.terrain.height(this.root.position.x, this.root.position.z);
    ctx.scene.add(this.root);

    // ---- 战斗实体 ----
    const ps = P.entity.stats;
    const k = XINMO.hpMul;
    const stats = new Stats({
      hp: this.maxHp, mp: 100, atk: ps.get("atk") * k, spell: ps.get("spell") * k, def: ps.get("def") * k,
      crit: ps.get("crit") * k, critDmg: ps.get("critDmg"), move: XINMO.speed,
    });
    this.e = ctx.world.add(makeEntity({ team: "enemy", pos: this.root.position, radius: 0.45, height: 1.75, stats, owner: this, tags: new Set(["xinmo"]) }));
    this.e.onHit = (info) => this.onHit(info);
    this.state = "intro";
    this.t = 0;
    this.combo = 0;
    this.waveCd = 2;
    this.flashT = 0;
    this.play("idle");
    ctx.vfx && ctx.vfx.ring(this.root.position, 2.2, { color: INKC.ink, dur: 1.2, width: 0.12 });
    ctx.vfx && ctx.vfx.ring(this.center, 10, { color: INKC.red, dur: 2.5, width: 0.03 });

    const ev = ctx.world.events;
    this._onKill = (info) => {
      if (this.done) return;
      if (info.target === this.e) this.finish(!0);
      else if (info.target === P.entity) setTimeout(() => this.finish(!1), 900);
    };
    ev.on("kill", this._onKill);
    return new Promise((res) => (this.onEnd = res));
  }
  play(name, fade = 0.12, once = !1, dur = 0) {
    const a = this.actions && this.actions[name];
    if (!a) return;
    if (a === this.cur && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = dur > 0 ? a.getClip().duration / dur : 1;
    a.play();
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, !1);
    this.cur = a;
  }
  // 受击：闪白、小硬直；玩家连续进攻时概率闪身后撤
  onHit(info) {
    this.flashT = 0.12;
    if (this.state === "approach" || this.state === "idle") {
      if (Math.random() < XINMO.dodgeChance) this.setState("dodge");
    }
    if (info.knock) {
      const d = info.dir || _v.set(this.e.pos.x - this.ctx.player.pos.x, 0, this.e.pos.z - this.ctx.player.pos.z).normalize();
      this.knock = { dir: d.clone ? d.clone() : d, left: Math.min(1.2, info.knock * 0.5) };
    }
  }
  flash() {
    this.flashT = 0.12;
  }
  setState(s) {
    this.state = s;
    this.t = 0;
    this.hitDone = !1;
  }
  update(dt) {
    if (!this.e || this.done) return;
    const { ctx } = this;
    const P = ctx.player, pos = this.root.position;
    this.t += dt;
    const to = _v.set(P.pos.x - pos.x, 0, P.pos.z - pos.z);
    const dist = to.length();
    const dir = dist > 1e-3 ? to.clone().multiplyScalar(1 / dist) : new THREE.Vector3(0, 0, 1);
    const face = (d, k = 10) => {
      const want = Math.atan2(d.x, d.z), cur = this.root.rotation.y;
      this.root.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * k);
    };
    const move = (d, sp) => {
      pos.x += d.x * sp * dt;
      pos.z += d.z * sp * dt;
      // 不出院子：离中心太远就推回
      const cx = pos.x - this.center.x, cz = pos.z - this.center.z, r = Math.hypot(cx, cz);
      if (r > 10) (pos.x = this.center.x + (cx / r) * 10), (pos.z = this.center.z + (cz / r) * 10);
    };
    this.waveCd -= dt;
    const playerDown = P.state === "dead";
    switch (this.state) {
      case "intro":
        face(dir);
        if (this.t > 1.4) this.setState("approach");
        break;
      case "idle":
        face(dir);
        if (this.t > 0.5) this.setState("approach");
        break;
      case "approach":
        if (playerDown) {
          this.play("idle");
          break;
        }
        face(dir);
        if (dist > 7 && this.waveCd <= 0) {
          this.setState("wave");
          break;
        }
        if (dist > 2.2) {
          move(dir, this.e.stats.get("move"));
          this.play("run");
          if (this.actions.run) this.actions.run.timeScale = 1.1;
        } else {
          this.combo = 0;
          this.setState("windup");
        }
        break;
      case "windup": {
        const c = XINMO.combo[this.combo];
        face(dir, 6);
        if (this.t < 0.02) {
          this.play(c.anim, 0.08, !0, c.wind + c.hit + 0.1);
          if (this.actions[c.anim]) this.actions[c.anim].timeScale *= 0.6;
          // 预警：朱色扇形
          ctx.vfx && ctx.vfx.arc(pos, this.forward(), c.radius, c.half * 2, { color: INKC.red, dur: c.wind, width: 0.12, y: 0.1 });
        }
        if (this.t >= c.wind) {
          if (this.actions[c.anim]) this.actions[c.anim].timeScale /= 0.6;
          this.setState("strike");
        }
        break;
      }
      case "strike": {
        const c = XINMO.combo[this.combo];
        if (this.t < c.hit) move(this.forward(), 3);
        if (!this.hitDone && this.t >= c.hit) {
          this.hitDone = !0;
          const f = this.forward();
          ctx.vfx && ctx.vfx.arc(pos, f, c.radius * 0.85, c.half * 2, { color: INKC.ink, dur: 0.26, width: 0.42, reverse: this.combo === 1 });
          const hits = ctx.world.queryArc(pos, f, c.radius, c.half, (e) => e.team === "player");
          for (const t of hits) ctx.world.dealDamage(this.e, t, { scale: { atk: c.scale }, knock: c.knock, dir: f.clone(), tags: ["melee", "xinmo"] });
          if (hits.length) ctx.rig && ctx.rig.shake(0.18);
        }
        if (this.t >= c.hit + c.rec) {
          this.combo++;
          if (this.combo < XINMO.combo.length && dist < 3.5) this.setState("windup");
          else this.setState("recover");
        }
        break;
      }
      case "recover":
        if (this.t > 0.7) this.setState("approach");
        break;
      case "dodge": {
        if (this.t < 0.02) this.play("dodge", 0.05, !0, 0.3);
        if (this.t < 0.25) move(dir.clone().multiplyScalar(-1), 14);
        face(dir, 20);
        if (this.t > 0.45) this.setState(dist > 6 && this.waveCd <= 0 ? "wave" : "approach");
        break;
      }
      case "wave": {
        const W = XINMO.wave;
        face(dir, 8);
        if (this.t < 0.02) {
          this.play("cast_sweep", 0.1, !0, W.wind + 0.3);
          this.waveDir = dir.clone();
          ctx.vfx && ctx.vfx.ring(pos, 1.4, { color: INKC.red, dur: W.wind });
        }
        if (this.t < W.wind) this.waveDir.lerp(dir, Math.min(1, dt * 3)).normalize();
        if (!this.hitDone && this.t >= W.wind) {
          this.hitDone = !0;
          this.waveCd = W.cd;
          this.spawnWave(this.waveDir.clone());
        }
        if (this.t > W.wind + 0.5) this.setState("approach");
        break;
      }
    }
    // 击退
    if (this.knock) {
      const st = Math.min(this.knock.left, 8 * dt);
      move(this.knock.dir, st / Math.max(dt, 1e-4));
      this.knock.left -= st;
      if (this.knock.left <= 0) this.knock = null;
    }
    pos.y = ctx.terrain.height(pos.x, pos.z);
    // 剑气飞行
    if (this.waves)
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        const step = XINMO.wave.speed * dt;
        w.p.addScaledVector(w.d, step);
        w.left -= step;
        w.mesh.position.set(w.p.x, ctx.terrain.height(w.p.x, w.p.z) + 0.9, w.p.z);
        if (!w.hit) {
          const px = P.pos.x - w.p.x, pz = P.pos.z - w.p.z;
          if (Math.hypot(px, pz) < XINMO.wave.width) {
            w.hit = !0;
            ctx.world.dealDamage(this.e, P.entity, { scale: { atk: XINMO.wave.scale }, knock: 1.2, dir: w.d.clone(), tags: ["ranged", "xinmo"] });
          }
        }
        if (w.left <= 0) {
          ctx.scene.remove(w.mesh);
          this.waves.splice(i, 1);
        }
      }
    // 外观：墨气、受击闪
    if (this.mixer) this.mixer.update(dt);
    const tt = performance.now() / 1000;
    this.aura.forEach((s, k) => {
      const ph = s.userData.ph + tt * (0.8 + k * 0.05);
      s.position.set(Math.cos(ph) * 0.45, 0.4 + ((tt * 0.6 + k / 10) % 1) * 1.8, Math.sin(ph) * 0.45);
      s.material.opacity = 0.35 * (1 - ((tt * 0.6 + k / 10) % 1));
      s.scale.setScalar(0.5 + ((tt * 0.6 + k / 10) % 1) * 0.8);
    });
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.model) this.model.visible = !(this.flashT > 0 && Math.floor(this.flashT * 60) % 2);
  }
  forward() {
    return new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
  }
  spawnWave(d) {
    const g = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.12, 4, 16, Math.PI * 0.8).rotateX(Math.PI / 2).rotateY(Math.PI * 0.6),
      new THREE.MeshBasicMaterial({ color: 0x1a1214, transparent: !0, opacity: 0.85 }),
    );
    g.rotation.y = Math.atan2(d.x, d.z);
    const p = this.root.position.clone().addScaledVector(d, 1.2);
    g.position.copy(p);
    this.ctx.scene.add(g);
    (this.waves = this.waves || []).push({ mesh: g, p, d, left: XINMO.wave.range, hit: !1 });
  }
  finish(win) {
    if (this.done) return;
    this.done = !0;
    const { ctx } = this;
    ctx.world.events.off && ctx.world.events.off("kill", this._onKill);
    if (win) {
      ctx.vfx && ctx.vfx.burst(this.root.position, { color: INKC.ink, count: 40, speed: 7, up: 5, size: 0.3, dur: 1.2 });
      ctx.vfx && ctx.vfx.ring(this.root.position, 4, { color: INKC.gold, dur: 1.2 });
    }
    this.cleanup();
    this.onEnd && this.onEnd(win);
  }
  abort() {
    this.finish(!1);
  }
  cleanup() {
    const { ctx } = this;
    if (this.e) ctx.world.remove(this.e);
    if (this.root) ctx.scene.remove(this.root);
    for (const w of this.waves || []) ctx.scene.remove(w.mesh);
    this.waves = [];
  }
}

let puff = null;
function inkPuff() {
  if (puff) return puff;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(20,14,16,.9)");
  gr.addColorStop(0.5, "rgba(40,10,10,.4)");
  gr.addColorStop(1, "rgba(20,14,16,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  puff = new THREE.CanvasTexture(c);
  return puff;
}
