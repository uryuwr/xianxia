// 青牙 v2 控制器（docs/design/boss_青牙_v2.md；调参 src/data/bosses/qingya.js；招式 src/data/enemies.js qingya）。
// 由 bosses/index.js 挂到 ENEMY_TYPES.qingya.controller，通过敌人模块的首领钩子（enemy.js 开头）驱动：
//   沉睡 → 入场仪式 → 一阶段「守谷」→ 转阶段「骨甲崩裂」→ 二阶段「啸月」→ 气竭伏地 → 终结处决
//   狼威（失衡条）：完美闪身 / 打断 / 撞柱 / 破盾 / 背击 / 冻结 / 缠绕 / 反应 / 图腾倒下 都在攒；满了威折倒地（二阶段可 F 威折处决）
//   读条打断：召狼长嚎 1.0、啸月 1.5 打断值；撞柱：冲扑撞上狼牙石柱 → 撞晕、削盾；图腾：砍倒就断了那一窝召狼
//   背甲弱点（二阶段）：背后 ±60° ×1.35，青牙在月光里 ×1.6；月下无影：主角站在月光里时影袭不从他身后现身
//   场景件：activeLevel().bossArena（关卡设计）存在就用，否则建桩（qingya_arena_stub.js）
// 事件（ctx.world.events，payload 都带 { id: "qingya", enemy }）：boss:intro / phase / poise / break / interrupt / crash / totem /
//   execPrompt / execute / execEnd（execution.js 发）/ retreat / defeated。view() 给 UI 每帧读。
import * as THREE from "three";
import { QINGYA as Q } from "../../../data/bosses/qingya.js";
import { makeEntity, Stats } from "../../../core/combat.js";
import { activeLevel, height } from "../../../world/terrain.js";
import { INKC } from "../../../fx/vfx.js";
import { Execution } from "../../execution.js";
import { QingyaArenaStub } from "./qingya_arena_stub.js";
import { BOSS_TEXT } from "../../../ui/boss/boss_text.js";
import { SPELLS } from "../../../data/skills.js";

// 功法体系 v2：伤害来自带 boss 参数的法术（strike 写进 spec.spell）→ { poise, chan }；剑气斩 / 火符 / 寒冰锥 / 缠藤没填，仍按五行旧规则
const spellBoss = (info) => {
  const id = info && info.spec && info.spec.spell;
  if (!id || (info.tags && (info.tags.includes("dot") || info.tags.includes("reaction")))) return null;
  return (SPELLS[id] && SPELLS[id].boss) || null;
};
import { walkable } from "../enemy.js";

// 美术管线的外观模块（src/fx/boss_look.js）交付后自动启用；没有就跳过
const LOOK = import.meta.glob("../../../fx/boss_look.js");
const JADE = 0x6fd6b4, WOOD = 0x3fae7a;
// 新模型交付前的动画兜底（wolf.glb 只有 idle run attack_bite attack_claw hit die howl）
const ANIM_ALIAS = { lie: "idle", wake: "howl", cower: "idle", bite_double_a: "attack_bite", bite_double_b: "attack_bite", turn_bite: "attack_claw", howl_moon: "howl", sink: "hit", emerge: "attack_bite", crash: "hit", dizzy: "idle", stagger: "hit", down: "die", down_loop: "die", rise: "idle", leap_perch: "attack_bite", armor_burst: "howl", exec_hit: "hit", kneel: "die", final: "die" };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class QingyaCtrl {
  constructor(enemy) {
    this.e = enemy;
    this.ctx = enemy.ctx;
    this.id = "qingya";
    this.mode = "asleep"; // asleep | intro | fight | transition | final | exec | reset | dead
    this.phase = 1;
    this.poise = 0;
    this.breaks = 0;
    this.lastGain = -99;
    this.broken = !1;
    this.downT = 0;
    this.downDur = 0;
    this.downKind = null;
    this.chan = null;
    this.behindT = 0;
    this.moonCd = 99;
    this.time = 0;
    this.offs = [];
    this.exec = new Execution(this.ctx);
    for (const [k, v] of Object.entries(ANIM_ALIAS)) if (!enemy.actions[k] && enemy.actions[v]) enemy.actions[k] = enemy.actions[v];
    const lf = Object.values(LOOK)[0];
    if (lf) lf().then((m) => !this.dead && m.bossLook && (this.look = m.bossLook(enemy))).catch(() => {});
    this.setupArena();
    this.listen();
  }
  get ent() {
    return this.e.entity;
  }
  get hero() {
    return this.ctx.player;
  }
  ev(name, data = {}) {
    this.ctx.world.events.emit(name, { id: this.id, enemy: this.e, boss: this.e, src: this, ...data });
  }
  get flowBoss() {
    const r = this.ctx.flow && this.ctx.flow.run;
    return (r && r.boss) || null;
  }

  // ---------------- 场景件 ----------------
  setupArena() {
    const L = activeLevel(), bp = (L && L.points && L.points.boss) || null;
    this.bp = bp;
    this.home = this.e.pos.clone();
    if (L && L.bossArena) this.arena = L.bossArena;
    else if (bp && bp.pillars) {
      // 桩跟关卡走（同一局里首领重生 / 测试再刷一只时复用，不重复建石柱）
      if (!L._qyStub) L._qyStub = new QingyaArenaStub(this.ctx, bp);
      this.arena = this.stub = L._qyStub;
    } else this.arena = null;
    this.totems = [];
    if (!this.arena) return;
    const w = this.ctx.world;
    for (const t of this.arena.totems || []) {
      if (!t.alive) continue;
      if (t.ent && t.ent.alive) w.remove(t.ent);
      const ent = w.add(makeEntity({ team: "prop", kind: "totem", name: "狼骨图腾", pos: t.pos.clone(), radius: 0.6, height: 2.6, stats: new Stats({ hp: Q.totem.hp, def: 0, res_fire: 1 - Q.totem.fireMul }), tags: new Set(["totem"]) }));
      ent.onDeath = () => this.totemFall(t);
      t.ent = ent;
      this.totems.push(t);
    }
  }
  pillarOf(col) {
    if (!col || !this.arena) return null;
    if (col.pillar) return col.pillar.alive ? col.pillar : null;
    return (this.arena.pillars || []).find((p) => p.alive && (p.col === col || p.id === col.id)) || null;
  }
  // 遮月：关卡实现在 level.setMoonVeil（写 bossArena.veil），桩自己实现
  setVeil(t) {
    if (this.arena && this.arena.setMoonVeil) return this.arena.setMoonVeil(t);
    const L = activeLevel();
    if (L && L.setMoonVeil) L.setMoonVeil(t);
  }
  get veil() {
    return (this.arena && this.arena.veil) || 0;
  }
  // 月光斑（遮月过半后才算数）：关卡版按它自己的 moonT 漂移（与画面一致），桩按控制器时间
  moonSpots() {
    if (!this.arena || !this.arena.moonSpots || this.veil <= 0.5) return [];
    return this.stub ? this.arena.moonSpots(this.time) : this.arena.moonSpots();
  }
  inMoon(p) {
    for (const s of this.moonSpots()) if (Math.hypot(p.x - s.x, p.z - s.z) <= (s.r || Q.moon.r)) return !0;
    return !1;
  }
  inPit(p) {
    return !this.arena || !this.arena.inPit || this.arena.inPit(p.x, p.z);
  }

  // ---------------- 世界事件 ----------------
  listen() {
    const ev = this.ctx.world.events, me = () => this.ent;
    const on = (n, f) => this.offs.push(ev.on(n, f));
    // 流程组（src/game/run/bossflow.js）负责挑战次数与首次标记，并发 boss:intro；收到就开演（我们自己不重复计数）
    on("boss:intro", (d) => {
      if (!d || d.src === this || this.mode !== "asleep") return;
      if (d.boss && d.boss !== this.e && d.boss !== this.id) return;
      this.beginIntro({ first: !!d.first, tries: d.tries, best: d.best, cause: d.cause || "enter" });
    });
    on("player:perfectDodge", ({ attacker }) => {
      if (attacker !== me() || this.mode !== "fight") return;
      const k = this.e.atk, a = k && k.a;
      const read = a && (a.id === "turn_bite" || a.id === "shadow" || (a.id === "bite_double" && k.combo >= 1));
      this.addPoise(read ? Q.poise.src.read : Q.poise.src.perfect, read ? "read" : "perfect");
    });
    on("shield:break", ({ target }) => target === me() && this.addPoise(Q.poise.src.shieldBreak, "shieldBreak"));
    // 功法体系 v2：止水诀反击成立 = 读招（按"读招类完美闪身"给狼威）
    on("player:counter", ({ attacker }) => attacker === me() && this.mode === "fight" && this.addPoise(Q.poise.src.read, "read"));
    on("reaction", ({ target }) => target === me() && this.addPoise(Q.poise.src.reaction, "reaction"));
    on("status", ({ target, status }) => {
      if (target !== me() || !status || (status.data && status.data._qy)) return;
      status.data._qy = !0;
      if (status.id === "root") {
        // 缠绕：时长减半；10 秒内再缠再减半（首领不吃整套硬控）
        const dr = this.time - (this.lastRoot ?? -99) < Q.root.dr;
        status.dur *= Q.root.mul * (dr ? 0.5 : 1);
        this.lastRoot = this.time;
        this.addPoise(Q.poise.src.root, "root");
      } else if (status.id === "stun" && status.data && status.data.freeze) this.addPoise(Q.poise.src.freeze, "freeze");
    });
    on("enemy:phase", ({ enemy, phase }) => enemy === me() && phase >= 1 && this.startTransition());
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const e = this.e, hero = this.hero;
    this.time += dt;
    if (this.stub) this.stub.update(this.time);
    if (this.look && this.look.update) this.look.update(dt);
    const hp = hero && hero.entity && hero.entity.alive ? hero.pos : null;
    if (hero) this.lastMom = this.curMom ?? 0, (this.curMom = hero.momentum || 0);
    switch (this.mode) {
      case "asleep":
        e.wanderT = 99;
        if (e.state === "chase") e.state = "idle";
        if (hp && this.inPit(hp) && Math.hypot(hp.x - this.home.x, hp.z - this.home.z) < ((this.bp && this.bp.trigger) || Q.trigger)) this.startIntro("enter");
        break;
      case "intro":
        this.updateIntro(dt);
        break;
      case "transition":
        this.updateTransition(dt);
        break;
      case "reset":
        if (e.state !== "return") (this.mode = "asleep"), (e.ignoreT = 6);
        break;
    }
    if (this.mode === "fight" || this.mode === "final") this.updateFight(dt, hp);
    this.updateTells(dt, hp);
    if (this.look && this.look.crackGlow && this.phase === 2 && !(this.crackPulse > 0)) this.look.crackGlow(this.inMoon(e.pos) ? 1 : 0.35);
  }

  updateFight(dt, hp) {
    const e = this.e;
    // 主角离开狼谷（穿雾撤出 / 被击退出谷）→ 撤退：首领回巢回满（气竭伏地时不撤：6 秒后自动终结）
    if (this.mode === "fight" && hp && !this.inPit(hp) && !this.exec.active) return this.retreat();
    if (e.state === "return" && this.mode === "fight") return this.retreat(!0);
    if (this.mode === "final") return this.updateFinal(dt, hp);
    if (this.crashT > 0) this.crashT -= dt;
    // 打断后的踉跄（敌人模块默认只给 0.6 秒）
    if (this.staggerReq && e.state === "flinch") (e.t = Math.max(e.t, this.staggerReq)), (this.staggerReq = 0);
    if (this.pendingBreak) (this.pendingBreak = !1), this.doBreak();
    // 二阶段喘息缩短
    if (this.phase === 2 && e.state === "winded" && e.t > Q.phase2.winded) e.t = Q.phase2.winded;
    // 狼威回落（只狼：气血越少回落越慢）
    if (!this.broken && this.poise > 0 && this.time - this.lastGain > Q.poise.holdDelay) {
      const hf = Math.max(0, this.ent.hp / this.ent.stats.get("hp"));
      this.poise = Math.max(0, this.poise - Q.poise.decay * (Q.poise.decayFloor + (1 - Q.poise.decayFloor) * hf) * dt);
      this.emitPoise();
    }
    // 威折倒地计时
    if (this.broken) {
      this.downT -= dt;
      if (this.downKind === "break" && hp && this.canExecute(hp) && this.pressedF()) return this.executeBreak();
      if (this.downT <= 0) this.endBreak();
    }
    // 主角在背后累计时间（回首咬）
    if (hp && this.phase === 2 && Math.hypot(hp.x - e.pos.x, hp.z - e.pos.z) < 6 && e.heroBehind(hp)) this.behindT += dt;
    else this.behindT = Math.max(0, this.behindT - dt * 0.5);
    // 啸月：冷却好了就跃入最近的月光斑读条
    if (this.phase === 2) {
      this.moonCd -= dt;
      if (this.moonLeap) this.updateMoonLeap(dt, hp);
      else if (this.moonCd <= 0 && hp && e.state === "chase" && !this.broken) this.startMoonLeap();
      // 月华到时
      if (this.moonBuffT > 0 && (this.moonBuffT -= dt) <= 0) this.ent.stats.removeSource("qyMoon");
    }
  }

  // ---------------- 叙事内的提示（狼威 / 处决可读性） ----------------
  updateTells(dt, hp) {
    const e = this.e, v = this.ctx.vfx;
    // 一震：模型局部位移，0.2 秒内衰减（不影响 AI 与判定）
    if (this.jolt > 0 || this.near) {
      this.jolt = Math.max(0, (this.jolt || 0) - dt * 1.4);
      const amp = this.jolt + (this.near && !this.broken ? 0.025 : 0), t = this.time * 38;
      e.model.position.x = Math.cos(this.joltA || 0) * Math.sin(t) * amp;
      e.model.position.z = Math.sin(this.joltA || 0) * Math.sin(t * 1.3) * amp;
      if (!this.jolt && !this.near) e.model.position.x = e.model.position.z = 0;
    } else if (e.model.position.x || e.model.position.z) e.model.position.x = e.model.position.z = 0;
    // 快折了：粗重的喘息墨气 + 脚下滴朱墨（每 0.35 秒）
    if (this.near && !this.broken && this.mode === "fight") {
      if (this.poise < this.poiseMax * Q.poise.nearOff) this.setNear(!1);
      else if ((this.nearT -= dt) <= 0 && v) {
        this.nearT = 0.35;
        e.headPos(_w);
        v.burst(_w, { color: 0x4a4e54, count: 3, speed: 0.4, size: 0.12, up: 1.8, y: 0, dur: 1 });
        v.burst(e.pos, { color: INKC.red, count: 2, speed: 0.6, size: 0.1, up: 0.4, y: 0.2, dur: 0.7 });
      }
    }
    // 可以处决：脚下一圈朱色墨环（= 处决距离），主角在圈内时更粗
    const execOn = (this.broken && this.downKind === "break") || this.mode === "final";
    if (execOn && v && (this.ringT = (this.ringT || 0) - dt) <= 0) {
      this.ringT = 0.6;
      const inR = hp && this.canExecute(hp);
      v.ring(e.pos, Q.exec.range + this.ent.radius, { color: INKC.red, dur: 0.6, width: inR ? 0.12 : 0.06 });
    }
    // 二阶段裂缝闪亮
    if (this.crackPulse > 0) {
      this.crackPulse -= dt;
      if (this.look && this.look.crackGlow) this.look.crackGlow(1);
    }
  }

  // ---------------- 入场 ----------------
  // 开战：有流程组就交给它（计次 + 发 boss:intro → 上面的监听开演）；没有（沙盒 / 测试）就自己计首次、自己发
  startIntro(why) {
    if (this.mode !== "asleep") return;
    const fb = this.flowBoss;
    if (fb && fb.intro && fb.intro(this.e, why)) {
      if (this.mode !== "asleep") return; // 流程组发的 boss:intro 已经让我们开演
    }
    const P = this.ctx.profile, F = (P && P.flags) || {}, key = "bossIntro_" + this.id;
    const first = !F[key];
    if (P && P.flags) P.flags[key] = 1;
    const log = (P && P.stats && P.stats.bossLog && P.stats.bossLog[this.id]) || {};
    this.ev("boss:intro", { first, tries: (log.tries || 0) + 1, best: log.best || null, cause: why });
    this.beginIntro({ first, tries: (log.tries || 0) + 1, best: log.best || null, cause: why });
  }
  beginIntro({ first, tries, best, cause }) {
    if (this.mode !== "asleep") return;
    const e = this.e, P = this.ctx.profile;
    const log = (P && P.stats && P.stats.bossLog && P.stats.bossLog[this.id]) || {};
    const why = cause;
    const short = !first;
    const dur = short ? Q.intro.short : Q.intro.full;
    this.mode = "intro";
    this.introT = 0;
    this.introDur = dur;
    this.introShort = short;
    this.howled = !1;
    e.setState("cinematic", dur + 0.05);
    e.play("lie", 0.1);
    if (this.hero && this.hero.cinematic) this.hero.cinematic(dur);
    const rig = this.ctx.rig;
    if (!short && rig && rig.cine) {
      const p = this.bp && this.bp.perch ? new THREE.Vector3(this.bp.perch[0], 0, this.bp.perch[1]) : e.pos.clone();
      p.y = height(p.x, p.z) + 1.5;
      rig.cine({ target: p, dist: 22, pitch: 36, yaw: rig.yaw, blend: 0.6 });
    }
    // 筑基：青牙畏缩（纯演出）
    this.cower = !!(P && P.realm && P.realm.stage >= 2);
    // UI 用：完整字段（首次 / 次数 / 最好 / 上一次 / 时长 / 短版 / 畏缩）
    const last = log.log && log.log.length ? log.log[log.log.length - 1] : null;
    // 首次挑战点一句"折其威，可斩"（只说一次）
    let hint = null;
    const hk = "bossHint_" + this.id + "_poise";
    if (P && P.flags && !P.flags[hk]) {
      P.flags[hk] = 1;
      hint = ((BOSS_TEXT[this.id] || {}).hint || {}).poise || "折其威，可斩";
    }
    this.ev("boss:introStart", { first, tries: tries ?? (log.tries || 1), best: best ?? log.best ?? null, last: last ? { phase: last.phase, hpLeft: last.hpLeft } : null, dur, short, cause: why, cower: this.cower, hint });
  }
  updateIntro(dt) {
    const e = this.e;
    this.introT += dt;
    const t = this.introT, d = this.introDur, howlAt = this.introShort ? 0.2 : 1.4;
    if (!this.howled && t >= howlAt) {
      this.howled = !0;
      e.play(this.cower ? "cower" : "wake", 0.1, !0);
      const v = this.ctx.vfx;
      if (v) v.ring(e.pos, 13, { color: INKC.ink, dur: 0.9, width: 0.05 });
      if (this.arena && this.arena.gates) this.arena.gates.setOn("all", !0);
      // 御剑围栏：落点要在狼谷里、且在谷底（谷沿崖顶也在多边形边上，用高度排除）
      const floor = height(this.home.x, this.home.z);
      this.ctx.flyFence = (x, z) => this.inPit({ x, z }) && height(x, z) < floor + 1.2;
      if (this.ctx.rig && this.ctx.rig.shake) this.ctx.rig.shake(0.25);
    }
    if (!this.introShort && t >= 2.4 && this.ctx.rig && this.ctx.rig.cineActive) this.ctx.rig.cine(null, 0.6);
    if (t >= d) {
      this.mode = "fight";
      if (this.ctx.rig && this.ctx.rig.cineActive) this.ctx.rig.cine(null, 0.4);
      e.state = "idle";
      e.setAggro("sight");
      // 落地起身：固定破绽（不出招，可吃满势斩）
      e.state = "flinch";
      e.t = Q.intro.wake;
      e.play("rise", 0.1, !0);
      this.lastGain = this.time;
    }
  }

  // ---------------- 狼威 ----------------
  addPoise(n, kind) {
    if (this.mode !== "fight" || this.broken || !(n > 0)) return;
    const sh = this.ent.shield;
    if (sh && sh.hp > 0 && !(kind === "interrupt" || kind === "crash" || kind === "perfect" || kind === "read" || kind === "shieldBreak")) n *= Q.poise.shieldMul;
    const before = this.poise;
    this.poise = Math.min(this.poiseMax, this.poise + n);
    this.lastGain = this.time;
    const got = this.poise - before;
    // 可读性（用户 2026-11-17："领悟值是什么作用？没看出来"）：每次上涨都有事件，大额上涨首领身上有表现
    this.ev("boss:poiseGain", { kind, n: got, v: this.poise, max: this.poiseMax });
    if (got >= 8) this.poiseFx(kind, got);
    this.emitPoise(!0);
    if (this.poise >= this.poiseMax - 1e-6) return this.doBreak();
    if (!this.near && this.poise >= this.poiseMax * Q.poise.nearOn) this.setNear(!0);
  }
  // 大额狼威上涨：首领一震、背上溅墨、脚下一圈"威"纹（越满越粗），二阶段裂缝闪亮
  poiseFx(kind, n) {
    const e = this.e, v = this.ctx.vfx, k = Math.min(1, this.poise / this.poiseMax);
    this.jolt = Math.min(0.32, 0.12 + n / 200);
    this.joltA = Math.random() * Math.PI * 2;
    if (v) {
      e.headPos(_w);
      v.burst(_w, { color: INKC.ink, count: Math.round(8 + n / 3), speed: 3.5, size: 0.2, up: 2.5, y: 0, dur: 0.8 });
      v.ring(e.pos, 1.4 + 2.6 * k, { color: k > 0.75 ? INKC.red : INKC.ink, dur: 0.55, width: 0.05 + 0.08 * k });
      if (kind === "freeze") v.burst(e.pos, { color: 0xcfe9f2, count: 14, speed: 3, up: 2, y: 1.2 });
    }
    if (this.phase === 2) this.crackPulse = 0.35;
    if (n >= 15 && !e.attacking && !this.broken && e.state === "chase") e.play("stagger", 0.08, !0);
  }
  setNear(on) {
    if (this.near === on) return;
    this.near = on;
    this.nearT = 0;
    this.ev("boss:poiseNear", { on, v: this.poise, max: this.poiseMax });
  }
  get poiseMax() {
    return Q.poise.max * Math.pow(Q.poise.growth, this.breaks);
  }
  emitPoise(force) {
    const v = Math.round(this.poise);
    if (!force && v === this._lastPoiseEv) return;
    if (v === this._lastPoiseEv) return;
    this._lastPoiseEv = v;
    this.ev("boss:poise", { v: this.poise, max: this.poiseMax });
  }
  doBreak() {
    if (this.broken || this.mode !== "fight") return;
    const e = this.e;
    this.broken = !0;
    this.poise = this.poiseMax;
    this.downKind = this.phase === 2 ? "break" : "stagger";
    this.downDur = this.downT = Q.poise.down[this.phase];
    e.setState("down", this.downDur + 0.1);
    this.ent.stats.removeSource("qyBreak");
    this.ent.stats.add({ stat: "vuln", type: "flat", value: Q.poise.vuln, source: "qyBreak" });
    this.setNear(!1);
    // "折"的那一刻：长顿帧 + 短慢动作 + 大墨溅 + 朱环 + "折"字，青牙跪地（down 动画）
    const v = this.ctx.vfx;
    if (v) {
      v.ring(e.pos, 3.4, { color: INKC.red, dur: 0.6, width: 0.14 });
      v.ring(e.pos, 6, { color: INKC.ink, dur: 0.9, width: 0.06 });
      v.burst(e.pos, { color: INKC.ink, count: 56, speed: 8, up: 4, size: 0.3, y: 1.2 });
      v.burst(e.pos, { color: INKC.red, count: 14, speed: 5, up: 3, size: 0.18, y: 1.4 });
    }
    this.ctx.world.hitStop(0.18);
    const hero = this.hero;
    if (hero) (hero.slowUntil = performance.now() / 1000 + 0.3), (this.ctx.world.timeScale = 0.35);
    if (this.ctx.rig && this.ctx.rig.shake) this.ctx.rig.shake(0.7);
    if (this.ctx.rig && this.ctx.rig.kick) this.ctx.rig.kick(0.08);
    if (this.ctx.shields && this.ctx.shields.pop) this.ctx.shields.pop(this.ent, "折");
    this.ev("boss:break", { phase: this.phase, dur: this.downDur });
    if (this.downKind === "break") this.ev("boss:execPrompt", { kind: "break", on: !0, dur: this.downDur });
  }
  endBreak() {
    const e = this.e;
    if (this.downKind === "break") this.ev("boss:execPrompt", { kind: "break", on: !1 });
    this.broken = !1;
    this.downKind = null;
    this.downT = 0;
    this.breaks++;
    this.poise = 0;
    this.ent.stats.removeSource("qyBreak");
    if (e.state === "down") (e.state = "chase"), e.play("rise", 0.15, !0);
    this.emitPoise(!0);
  }
  canExecute(hp) {
    return Math.hypot(hp.x - this.e.pos.x, hp.z - this.e.pos.z) <= Q.exec.range + this.ent.radius;
  }
  pressedF() {
    const inp = this.ctx.input;
    return !!(inp && inp.pressed && inp.pressed("KeyF")) || !!this.fReq && !(this.fReq = !1);
  }

  // ---------------- 招式钩子 ----------------
  pickAttack(avail) {
    if (this.mode !== "fight" || this.broken || this.moonLeap) return null;
    const hp = this.hero && this.hero.pos;
    const heroMoon = hp && this.inMoon(hp);
    const ok = avail.filter((a) => !a.ctrlOnly && (a.phase == null || a.phase === this.phase) && (a.id !== "turn_bite" || this.behindT >= Q.rearNeed) && !(a.id === "shadow" && heroMoon));
    if (!ok.length) return null;
    const rear = ok.find((a) => a.id === "turn_bite");
    if (rear) return rear;
    const howl = ok.find((a) => a.id === "summon_howl");
    if (howl) return howl;
    return ok[(Math.random() * ok.length) | 0];
  }
  onStartAttack(a, combo) {
    if (a.channel) this.chan = { id: a.id, val: 0, need: Q.channel.need[a.id] ?? 1 };
    if (a.id === "summon_howl" || a.id === "moon_howl") for (const t of this.totems) t.alive && t.setLit && t.setLit(!0);
    if (a.id === "turn_bite") this.behindT = 0;
  }
  onStrike(a) {
    const e = this.e;
    if (a.id === "summon_howl" || a.id === "moon_howl") {
      // 召狼：只从图腾未倒的狼窝出；三根全倒 = 孤嚎（不来狼）
      this.spawnPack(a);
      for (const t of this.totems) t.alive && t.setLit && t.setLit(!1);
      if (a.id === "moon_howl") {
        const B = Q.phase2.moonBuff;
        this.ent.stats.removeSource("qyMoon");
        this.ent.stats.addAll([{ stat: "atk", type: "pct", value: B.atk }, { stat: "move", type: "pct", value: B.move }], "qyMoon");
        this.moonBuffT = B.dur;
        const v = this.ctx.vfx;
        if (v) (v.ring(e.pos, 8, { color: JADE, dur: 0.7, width: 0.1 }), v.burst(e.pos, { color: JADE, count: 30, speed: 7, up: 4, y: 1.5 }));
      }
    }
    // 影袭：月下无影——主角站在月光里时，就近现身（落点挪开、不伤人）
    if (a.id === "shadow" && e.atk && e.atk.centers && this.hero && this.inMoon(this.hero.pos)) {
      const c = e.atk.centers[0], hp = this.hero.pos;
      _v.subVectors(c, hp).setY(0);
      if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
      _v.normalize().multiplyScalar(Q.moon.r + a.radius + 1);
      c.set(hp.x + _v.x, 0, hp.z + _v.z);
      c.y = height(c.x, c.z);
      e.root.position.copy(c);
      e.atk.origin.copy(c);
      this.ev("boss:moonDenied", {});
    }
  }
  onEndAttack(a, interrupted) {
    if (this.chan && this.chan.id === a.id) this.chan = null;
    if (a.id === "summon_howl" || a.id === "moon_howl") for (const t of this.totems) t.alive && t.setLit && t.setLit(!1);
    return !1;
  }
  // 读条中挨打：累计打断值
  onChannelHit(info, a) {
    if (!this.chan || this.chan.id !== a.id) this.chan = { id: a.id, val: 0, need: Q.channel.need[a.id] ?? 1 };
    const k = this.classify(info);
    const V = Q.channel.val;
    let add = 0;
    const sb = spellBoss(info); // 功法体系 v2：法术自带的打断值（SPELLS[id].boss.chan，落石诀 1.2 = 一发断长嚎）
    if (sb) add = sb.chan || 0;
    else if (k === "charge") add = this.chargeOnce(info, "chan") ? (this.chargeFull() ? V.chargeFull : V.chargeHalf) : 0;
    else add = V[k] ?? (k === "none" ? 0 : V.other);
    this.chan.val += add;
    return this.chan.val >= this.chan.need - 1e-6;
  }
  onChannelBreak(a) {
    const n = (Q.poise.src.interrupt || {})[a.id] || 30;
    const c = this.chan;
    this.chan = null;
    for (const t of this.totems) t.alive && t.setLit && t.setLit(!1);
    this.ev("boss:interrupt", { attack: a.id, by: c ? c.val : 0 });
    // 断其嚎，得其势：打断者 +气势
    if (this.hero && this.hero.addMomentum) this.hero.addMomentum(Q.pack.interruptMom, !0);
    this.addPoise(n, "interrupt");
    if (this.broken) return;
    if (a.id === "moon_howl" && this.poise >= 50) this.pendingBreak = !0;
    else this.staggerReq = Q.channel.stagger;
    const v = this.ctx.vfx;
    if (v) v.ring(this.e.pos, 3, { color: INKC.red, dur: 0.5, width: 0.1 });
    if (this.ctx.shields && this.ctx.shields.pop) this.ctx.shields.pop(this.ent, "断");
  }
  // 冲扑撞柱
  onLungeBlocked(col) {
    const p = this.pillarOf(col);
    if (!p || this.mode !== "fight") return;
    this.crash(p);
  }
  crash(p) {
    const e = this.e, w = this.ctx.world;
    p.break();
    const v = this.ctx.vfx;
    if (v) (v.burst(p.pos, { color: 0x6e6a62, count: 36, speed: 7, up: 5, size: 0.3, y: 1.2 }), v.burst(p.pos, { color: INKC.ink, count: 20, speed: 4, up: 3, y: 1 }), v.ring(p.pos, 3, { color: INKC.ink, dur: 0.5, width: 0.1 }));
    w.hitStop(0.12);
    if (this.ctx.rig && this.ctx.rig.shake) this.ctx.rig.shake(0.6);
    // 削盾 35%（不看五行）
    const sh = this.ent.shield;
    let cut = 0;
    if (sh && sh.hp > 0) {
      cut = Math.max(1, Math.round(sh.max * Q.crash.shieldCut));
      sh.hp -= cut;
      if (sh.hp <= 0 && this.ctx.shields) this.ctx.shields.breakShield(this.ent);
    }
    this.addPoise(Q.poise.src.crash, "crash");
    if (!this.broken) {
      w.applyStatus(this.ent, "stun", { dur: Q.crash.stun, src: this.hero && this.hero.entity, data: { tag: "crash" } });
      this.crashT = Q.crash.stun; // 撞晕窗口：普攻被骨甲顶住、蓄势斩 / 法术加成（onBeforeDamage / onHit）
    }
    e.play("crash", 0.05, !0);
    if (this.ctx.shields && this.ctx.shields.pop) this.ctx.shields.pop(this.ent, "撞");
    this.ev("boss:crash", { pillar: p.id, cut, left: (this.arena.pillars || []).filter((q) => q.alive).length });
  }
  // 眩晕 / 冰冻折算（ccMode: "poise"）
  onCC(id, dur, info) {
    const tag = info && info.tag;
    if (tag === "shieldBreak" || tag === "crash") return "allow";
    if (tag === "charge") {
      // v1.3：满势斩打断首领的预警招（player.js 已按 8 秒一次限频）；读条招改走打断值，不在这里放行
      const k = this.e.atk;
      if (k && this.e.state === "windup" && !k.channel) return "allow";
      return null;
    }
    return null;
  }
  onHit(info) {
    if (this.mode === "asleep") {
      if (info.attacker && this.hero && info.attacker === this.hero.entity) this.startIntro("hit");
      return !0;
    }
    if (this.mode === "intro" || this.mode === "transition" || this.mode === "exec") return !0;
    if (this.mode !== "fight" || !this.hero || info.attacker !== this.hero.entity) return !1;
    const k = this.classify(info), S = Q.poise.src;
    const sb = spellBoss(info); // 功法体系 v2：法术自带的狼威（SPELLS[id].boss.poise）
    if (sb) this.addPoise(sb.poise || 0, "spell");
    else if (k === "basic") this.addPoise(S.basic * (info.qyWeak ? 2 : 1) * (this.crashT > 0 ? Q.crash.basicPoise : 1), "basic");
    else if (k === "charge") {
      if (this.chargeOnce(info, "poise")) this.addPoise(S.charge * (this.chargeFull() ? 1 : Math.max(0.5, this.lastMom / 100)), "charge");
    } else if (k === "qi") this.addPoise(S.qi, "spell");
    else if (k === "fire" || k === "frost") this.addPoise(S.spell, "spell");
    else if (k === "vine") this.addPoise(0.5, "spell");
    else if (k === "formation" || k === "artifact" || k === "talisman" || k === "other") this.addPoise(S.minor, "minor");
    else if (k === "seal") this.addPoise(S.spell, "spell");
    return !1;
  }
  // 伤害分类：普攻 / 蓄势斩 / 剑气斩（金）/ 火符 / 寒冰锥 / 缠藤（木）/ 阵法 / 法宝 / 五行符 / 反应 / 持续伤害
  classify(info) {
    const t = info.tags || [];
    if (t.includes("dot") || t.includes("ink")) return "none";
    if (t.includes("charge")) return "charge";
    if (t.includes("basic")) return "basic";
    if (t.includes("reaction")) return "reaction";
    if (t.includes("formation")) return "formation";
    if (t.includes("artifact")) return info.element === "earth" ? "seal" : "artifact";
    if (t.includes("talisman")) return "talisman";
    if (t.length) return "other";
    if (info.element === "metal") return "qi";
    if (info.element === "fire") return "fire";
    if (info.element === "water") return "frost";
    if (info.element === "wood") return "vine";
    return "other";
  }
  // 同一刀蓄势斩（横扫 + 剑气 + 余波）只结算一次
  chargeOnce(info, slot) {
    const id = (this.hero && this.hero._chargeId) || 0;
    const key = "_cid_" + slot;
    if (this[key] === id) return !1;
    this[key] = id;
    return !0;
  }
  chargeFull() {
    const lc = this.hero && this.hero.lastCharge;
    // 出伤时 lastCharge 还是上一刀的：用上一帧的气势判断满势
    return (this.lastMom ?? 0) >= 99.5 || !!(lc && lc.full && this.lastMom == null);
  }
  // 伤害结算前（护盾吸收之后）：背甲弱点、气竭
  onBeforeDamage(info) {
    const ent = this.ent;
    if (this.mode === "final" || this.mode === "dead") {
      if (!this.allowDeath) (info.cancel = !0), (info.amount = 0);
      return;
    }
    if (this.mode !== "fight" && this.mode !== "exec") return;
    // 撞晕窗口：普攻被骨甲顶住，蓄势斩 / 法术加成
    if (this.crashT > 0 && info.amount > 0 && this.hero && info.attacker === this.hero.entity) {
      const k = this.classify(info), C = Q.crash;
      const mul = k === "basic" ? C.basicMul : k === "charge" ? C.chargeMul : k === "qi" || k === "fire" || k === "frost" || k === "vine" || k === "seal" ? C.spellMul : 1;
      if (mul !== 1) (info.amount = Math.max(1, Math.round(info.amount * mul))), (info.qyCrash = mul);
    }
    // 背甲弱点（二阶段）
    if (this.phase === 2 && info.amount > 0 && this.hero && info.attacker === this.hero.entity && !(info.tags || []).includes("execute")) {
      const hp = this.hero.pos, e = this.e;
      const dx = hp.x - e.pos.x, dz = hp.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d < -Q.weak.cone) {
        const mul = this.inMoon(e.pos) ? Q.moon.weakMul : Q.weak.mul;
        info.amount = Math.max(1, Math.round(info.amount * mul));
        info.qyWeak = mul;
        if (this.time - (this._weakPopT || -9) > 1.2 && this.ctx.feedback && this.ctx.feedback.number) {
          this._weakPopT = this.time;
          this.ctx.feedback.number(ent, "裂", "", 1.05, "#1f6a54");
        }
      }
    }
    // 一阶段不能被一刀跳过：伤害最多打到 50%（随后照常转阶段）
    if (this.phase === 1 && !this.allowDeath) {
      const floor = Math.ceil(ent.stats.get("hp") * 0.5);
      if (ent.hp - info.amount < floor) info.amount = Math.max(0, ent.hp - floor);
    }
    // 气竭：致死的一击压到剩 1 血，伏地等终结处决
    if (info.amount >= ent.hp && !this.allowDeath) {
      info.amount = Math.max(0, ent.hp - 1);
      this.enterFinalSoon = !0;
      queueMicrotask(() => this.enterFinal());
    }
  }

  // ---------------- 转阶段 ----------------
  startTransition() {
    if (this.phase !== 1 || this.mode === "dead") return;
    if (this.mode === "final" || this.mode === "exec") {
      // 不该出现（一阶段伤害有下限，见 onBeforeDamage）；兜底：收起敌人模块刚给的盾
      if (this.ent.shield && this.ctx.shields) (this.ctx.shields.drop(this.ent), (this.ent.shield = null));
      return;
    }
    const e = this.e, P = Q.phase2;
    if (this.broken) this.endBreak();
    this.phase = 2;
    this.mode = "transition";
    this.trT = 0;
    this.trBeats = {};
    this.poise = 0;
    this.breaks = 0;
    this.chan = null;
    this.setNear(!1);
    e.setState("cinematic", P.transition + 0.05);
    // 主角震退、小狼定格
    const hero = this.hero;
    if (hero && hero.pos) {
      _v.subVectors(hero.pos, e.pos).setY(0);
      if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1);
      _v.normalize();
      hero.knock = { dir: _v.clone(), left: P.knock };
      if (hero.invulnUntil != null) hero.invulnUntil = Math.max(hero.invulnUntil, performance.now() / 1000 + P.transition);
    }
    for (const o of this.ctx.enemies ? this.ctx.enemies.list : []) if (o !== e && o.alive) this.ctx.world.applyStatus(o.entity, "stun", { dur: P.transition, data: { tag: "cinematic" } });
    const perch = this.bp && this.bp.perch ? new THREE.Vector3(this.bp.perch[0], 0, this.bp.perch[1]) : this.home.clone();
    // 跃到狼王石前（朝场心一侧）
    _w.subVectors(this.home, perch).setY(0);
    if (_w.lengthSq() < 1e-4) _w.set(0, 0, 1);
    _w.normalize().multiplyScalar((this.bp && this.bp.perchR ? this.bp.perchR : 2.2) + 1.2);
    this.trFrom = e.pos.clone();
    this.trTo = perch.clone().add(_w);
    this.trTo.y = height(this.trTo.x, this.trTo.z);
    const rig = this.ctx.rig;
    if (rig && rig.cine) rig.cine({ target: new THREE.Vector3(perch.x, height(perch.x, perch.z) + 2, perch.z), dist: 17, pitch: 34, yaw: rig.yaw, blend: 0.5 });
    // 护盾：木气散尽（残片飞散），土盾在 2.8 秒"重生"（期间无敌，先收起敌人模块刚给的土盾）
    const sh = this.ent.shield;
    this.trShield = sh && sh.element ? sh.element : "earth";
    if (sh && this.ctx.shields) (this.ctx.shields.drop(this.ent), (this.ent.shield = null));
    const v = this.ctx.vfx;
    if (v) (v.burst(e.pos, { color: WOOD, count: 26, speed: 6, up: 4, size: 0.24, y: 1.8 }), v.ring(e.pos, 4, { color: WOOD, dur: 0.5, width: 0.08 }));
    // 叙事内信号（用户 2026-11-17：不用横幅）：演出、外观、遮月、月光、狼嚎回声、墨雾变浓、换盾
    this.ev("boss:phase", { phase: 2, dur: P.transition });
  }
  updateTransition(dt) {
    const e = this.e, P = Q.phase2, B = P.beats;
    this.trT += dt;
    const t = this.trT, once = (k) => !this.trBeats[k] && t >= B[k] && (this.trBeats[k] = !0);
    if (once("leap")) e.play("leap_perch", 0.1, !0);
    if (t >= B.leap && t <= B.leap + 0.45) {
      const k = Math.min(1, (t - B.leap) / 0.45);
      e.root.position.lerpVectors(this.trFrom, this.trTo, k);
      e.root.position.y = this.trTo.y * k + this.trFrom.y * (1 - k) + 2.2 * 4 * k * (1 - k);
      e.wantYaw = Math.atan2(this.home.x - this.trTo.x, this.home.z - this.trTo.z);
    }
    if (t >= B.veil) this.setVeil(Math.min(1, (t - B.veil) / 1.5));
    if (once("burstAnim")) e.play("armor_burst", 0.1, !0);
    if (once("burst")) {
      if (this.look && this.look.armorBurst) this.look.armorBurst();
      const v = this.ctx.vfx;
      if (v) (v.burst(e.pos, { color: 0xd9d2bf, count: 34, speed: 6, up: 5, size: 0.28, y: 2 }), v.burst(e.pos, { color: JADE, count: 20, speed: 3, up: 4, y: 2.4 }));
      if (this.ctx.rig && this.ctx.rig.shake) this.ctx.rig.shake(0.4);
    }
    if (once("howl")) {
      e.play("howl_moon", 0.1, !0);
      const v = this.ctx.vfx;
      if (v) v.ring(e.pos, 12, { color: JADE, dur: 1, width: 0.06 });
      if (this.ctx.rig && this.ctx.rig.shake) this.ctx.rig.shake(0.35);
      // 墨雾门的雾变浓（关卡提供 gates.setThick(k) 时）
      const g = this.arena && this.arena.gates;
      if (g && g.setThick) g.setThick(1);
    }
    // 狼嚎回声：两圈越来越淡的墨环
    if (once("echo1")) this.ctx.vfx && this.ctx.vfx.ring(e.pos, 17, { color: INKC.ink, dur: 1.1, width: 0.035 });
    if (once("echo2")) this.ctx.vfx && this.ctx.vfx.ring(e.pos, 22, { color: INKC.ink, dur: 1.2, width: 0.02 });
    if (once("moon")) {
      this.setVeil(1);
      // 土盾重生：阵纹 + 墨点向内聚拢
      if (this.ctx.shields && !this.ent.shield) this.ctx.shields.give(this.ent, this.trShield || "earth");
      const v = this.ctx.vfx;
      if (v) (v.ring(e.pos, 3.2, { color: 0xa5743a, dur: 0.6, width: 0.12 }), v.burst(e.pos, { color: 0xa5743a, count: 30, speed: 4, up: 3, size: 0.24, y: 1.2 }));
    }
    if (t >= P.transition) {
      this.setVeil(1);
      this.mode = "fight";
      e.state = "chase";
      this.ent.stats.removeSource("qyP2");
      this.ent.stats.add({ stat: "move", type: "pct", value: P.moveMul, source: "qyP2" });
      this.moonCd = P.moonHowlFirst;
      this.lastGain = this.time;
      if (this.ctx.rig && this.ctx.rig.cineActive) this.ctx.rig.cine(null, 0.5);
      this.emitPoise(!0);
    }
  }

  // ---------------- 啸月：跃入月光 → 读条 ----------------
  startMoonLeap() {
    const e = this.e, spots = this.moonSpots();
    let to = null, bd = 1e9;
    for (const s of spots) {
      const d = Math.hypot(s.x - e.pos.x, s.z - e.pos.z);
      if (d < bd) (bd = d), (to = s);
    }
    const target = to ? new THREE.Vector3(to.x, 0, to.z) : (this.bp && this.bp.perch ? this.trTo || this.home : this.home).clone();
    target.y = height(target.x, target.z);
    this.moonCd = Q.phase2.moonHowlCd;
    if (bd < 1.5) return this.beginMoonHowl();
    this.moonLeap = { from: e.pos.clone(), to: target, t: 0, dur: Math.min(0.9, 0.35 + bd / 20) };
    // 跃入月光：不出招、不受 AI 控制，但照常吃伤害（用 down 态，不走 setState 以免播倒地动画）
    if (e.atk) e.endAttack(!0);
    e.state = "down";
    e.t = this.moonLeap.dur + 0.05;
    e.play("leap_perch", 0.08, !0);
  }
  updateMoonLeap(dt, hp) {
    const L = this.moonLeap, e = this.e;
    L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    e.root.position.lerpVectors(L.from, L.to, k);
    e.root.position.y = L.from.y + (L.to.y - L.from.y) * k + 1.8 * 4 * k * (1 - k);
    e.wantYaw = Math.atan2(L.to.x - L.from.x, L.to.z - L.from.z);
    if (k >= 1) {
      this.moonLeap = null;
      this.beginMoonHowl();
    }
  }
  beginMoonHowl() {
    const e = this.e, a = e.def.attacks.find((x) => x.id === "moon_howl"), hp = this.hero && this.hero.pos;
    if (!a || !hp) return;
    e.state = "chase";
    e.startAttack(a, hp);
  }

  // ---------------- 处决 ----------------
  executeBreak() {
    const e = this.e, hero = this.hero, X = Q.exec.break;
    const maxHp = this.ent.stats.get("hp"), atk = hero.entity.stats.get("atk");
    const dmg = Math.round(maxHp * X.frac + atk * X.atk);
    this.ev("boss:execPrompt", { kind: "break", on: !1 });
    this.mode = "exec";
    e.setState("down", X.dur + 0.3);
    this.downT = Math.max(this.downT, 0.1);
    // 主角跃上狼背：从主角当前位置到青牙背后 1 米
    const back = _v.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)).multiplyScalar(this.ent.radius * 0.6).add(e.pos).clone();
    const from = hero.pos.clone();
    const yaw = e.yaw;
    const self = this;
    // 后空翻落点：背后 3 米；不在谷里 / 站不住就换两侧、正前方，再不行落回起跳点
    const land = (() => {
      const cs = this.ctx.colliders || [];
      for (const a of [Math.PI, Math.PI * 0.6, -Math.PI * 0.6, 0]) {
        const d = this.ent.radius + 3, x = e.pos.x + Math.sin(yaw + a) * d, z = e.pos.z + Math.cos(yaw + a) * d;
        if (!this.inPit({ x, z }) || Math.abs(height(x, z) - e.pos.y) > 0.8 || cs.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.5)) continue;
        return new THREE.Vector3(x, 0, z);
      }
      return from.clone();
    })();
    this.exec.start({
      id: this.id, enemy: e, kind: "break", dur: X.dur, dmg, heroAnim: hero.actions && hero.actions.execute_leap ? "execute_leap" : "dodge", heroAnimDur: 0.55,
      steps: [
        { at: 0, run: (ex) => ex.hitStop(0.08) },
        { at: 0.15, run: (ex) => (ex.slow(0.25), ex.cam({ target: new THREE.Vector3(e.pos.x, e.pos.y + 1.6, e.pos.z), dist: 10, pitch: 25, yaw: yaw + Math.PI * 0.85, blend: 0.4 })) },
        { at: 0.7, run: () => (self.ctx.world.timeScale = 1, hero.play(hero.actions && hero.actions.execute_stab ? "execute_stab" : "slash3", 0.05, !0, 0.4)) },
        {
          at: X.hit, must: !0,
          run: (ex) => {
            self.allowDeath = !1;
            const info = self.ctx.world.dealDamage(hero.entity, self.ent, { base: dmg, noCrit: !0, tags: ["execute"], pos: e.pos });
            // 威折处决清掉当前护盾
            const sh = self.ent.shield;
            if (sh && sh.hp > 0 && self.ctx.shields) self.ctx.shields.breakShield(self.ent);
            ex.hitStop(0.12);
            ex.shake(0.6);
            const v = self.ctx.vfx;
            if (v) (v.burst(e.pos, { color: JADE, count: 30, speed: 6, up: 6, y: 2 }), v.burst(e.pos, { color: INKC.ink, count: 30, speed: 7, up: 4, y: 1.6 }));
            e.play("exec_hit", 0.05, !0);
            self.ev("boss:executeHit", { kind: "break", dmg: info ? info.amount : 0 });
          },
        },
        { at: 1.6, run: () => hero.play("dodge", 0.05, !0, 0.4) },
      ],
      tick: (ex, t) => {
        // 位置：0.15–0.7 跃上狼背；1.6–2.2 后空翻落回 3 米外
        if (t >= 0.15 && t <= 0.7) {
          const k = (t - 0.15) / 0.55;
          hero.pos.lerpVectors(from, back, k);
          hero.pos.y = from.y + (back.y + 1.6 - from.y) * k + 1.5 * 4 * k * (1 - k);
          hero.yaw = Math.atan2(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
        } else if (t > 0.7 && t < 1.6) hero.pos.set(back.x, height(back.x, back.z) + 1.6, back.z);
        else if (t >= 1.6) {
          const k = Math.min(1, (t - 1.6) / 0.6);
          hero.pos.x = back.x + (land.x - back.x) * k;
          hero.pos.z = back.z + (land.z - back.z) * k;
          hero.pos.y = height(hero.pos.x, hero.pos.z) + (1.6 * (1 - k)) + 1.2 * 4 * k * (1 - k);
        }
      },
      onEnd: () => {
        hero.pos.y = height(hero.pos.x, hero.pos.z);
        if (self.mode === "exec") self.mode = "fight";
        if (self.finalPending) return (self.finalPending = !1), self.enterFinal();
        // 处决后青牙继续伏地 0.6 秒再起身，狼威清零、阈值上调
        self.downT = 0.6;
        e.setState("down", 0.7);
        self.downKind = "stagger";
      },
    });
  }
  enterFinal() {
    if (this.mode === "final" || this.mode === "dead") return;
    if (this.mode === "exec") return void (this.finalPending = !0);
    const e = this.e;
    this.enterFinalSoon = !1;
    if (this.broken) (this.broken = !1), this.ent.stats.removeSource("qyBreak");
    this.mode = "final";
    this.finalT = 0;
    this.downKind = "final";
    this.downDur = this.downT = Q.exec.final.wait;
    e.setState("down", 99);
    e.play("kneel", 0.1, !0);
    if (this.ent.shield && this.ctx.shields) (this.ctx.shields.drop(this.ent), (this.ent.shield = null));
    this.fleeAdds();
    this.ev("boss:execPrompt", { kind: "final", on: !0, dur: Q.exec.final.wait });
  }
  updateFinal(dt, hp) {
    if (this.exec.active) return;
    this.finalT += dt;
    this.downT = Math.max(0, Q.exec.final.wait - this.finalT);
    if (this.finalT >= Q.exec.final.wait) return this.executeFinal(!0);
    if (hp && this.canExecute(hp) && this.pressedF()) this.executeFinal(!1);
  }
  executeFinal(auto) {
    const e = this.e, hero = this.hero, P = this.ctx.profile, X = Q.exec.final;
    const seen = !!(P && P.flags && P.flags["bossExec_" + this.id + "_final"]);
    const short = auto || seen;
    const dur = short ? X.short : X.dur, hitAt = short ? X.hitShort : X.hit;
    this.ev("boss:execPrompt", { kind: "final", on: !1 });
    this.mode = "exec";
    const self = this, yaw0 = this.ctx.rig ? this.ctx.rig.yaw : 0, hasDraw = !!(hero.actions && hero.actions.execute_draw);
    const center = new THREE.Vector3(e.pos.x, e.pos.y + 1.4, e.pos.z);
    this.exec.start({
      // 主角居合（execute_draw 1.367 秒，0.78 处出刃）：完整版 0.4 秒起播 → 1.18 出刃、1.2 出伤；短版压到 0.58 秒 → 0.33 出刃、0.35 出伤
      id: this.id, enemy: e, kind: "final", dur, short, auto, dmg: this.ent.hp, heroAnim: short && hasDraw ? "execute_draw" : null, heroAnimDur: 0.58,
      steps: [
        { at: 0, run: (ex) => (ex.hitStop(0.06), ex.cam({ target: center, dist: short ? 16 : 14, pitch: 30, yaw: yaw0, blend: 0.3 })) },
        ...(short ? [] : [{ at: 0.3, run: (ex) => ex.cam({ target: center, dist: 13, pitch: 28, yaw: yaw0 + 0.7, blend: 0.9 }) }, { at: 0.4, run: () => hasDraw && hero.play("execute_draw", 0.08, !0, 1.367) }]),
        { at: Math.max(0, hitAt - 0.2), run: () => !hasDraw && hero.play("slash3", 0.05, !0, 0.35) },
        {
          at: hitAt, must: !0,
          run: (ex) => {
            self.allowDeath = !0;
            self.mode = "dead";
            self.ctx.world.dealDamage(hero.entity, self.ent, { base: self.ent.hp + 999, noCrit: !0, tags: ["execute"], pos: e.pos });
            ex.hitStop(0.14);
            ex.shake(0.7);
            const v = self.ctx.vfx;
            if (v) (v.burst(e.pos, { color: INKC.ink, count: 60, speed: 6, up: 5, size: 0.3, y: 1.2 }), v.burst(e.pos, { color: JADE, count: 12, speed: 2, up: 3, y: 2.2 }));
          },
        },
      ],
      onEnd: () => {
        hero.pos.y = height(hero.pos.x, hero.pos.z);
      },
    });
  }
  // ---------------- 召狼：群狼出窝跃下、包围主角 ----------------
  heroLevel() {
    const P = this.ctx.profile, r = P && P.realm;
    const L = r ? (r.stage >= 2 ? 10 : r.layer || 1) : 2;
    return Math.max(Q.pack.level[0], Math.min(Q.pack.level[1], L));
  }
  // 狼窝出生点：狼窝贴着崖壁，往谷心挪 exitIn 米、找一处谷底可站的点
  denExit(t) {
    const cs = this.ctx.colliders || [], floor = height(this.home.x, this.home.z);
    const d = _v.subVectors(this.home, t.den).setY(0);
    const len = d.length() || 1;
    d.multiplyScalar(1 / len);
    for (let k = Q.pack.exitIn; k <= Math.min(len, Q.pack.exitIn + 6); k += 0.5) {
      const x = t.den.x + d.x * k, z = t.den.z + d.z * k, h = height(x, z);
      if (Math.abs(h - floor) < 1 && this.inPit({ x, z }) && walkable(x, z, h, cs, 0.55)) return new THREE.Vector3(x, h, z);
    }
    const x = t.den.x + d.x * Q.pack.exitIn, z = t.den.z + d.z * Q.pack.exitIn;
    return new THREE.Vector3(x, height(x, z), z);
  }
  // 包围位：第一只（卡退路）在主角背离青牙的一侧，其余等角散开；每个位要可站、在谷底、不在碰撞体里
  packSlots(n, hp) {
    const cs = this.ctx.colliders || [], floor = height(this.home.x, this.home.z), R = Q.pack.slotR, out = [];
    const away = Math.atan2(hp.x - this.e.pos.x, hp.z - this.e.pos.z);
    for (let i = 0; i < n; i++) {
      const want = away + (i * Math.PI * 2) / Math.max(n, 3);
      let got = null;
      for (let tries = 0; tries < 24 && !got; tries++) {
        const a = want + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.26, r = R[0] + ((tries * 0.37) % 1) * (R[1] - R[0]);
        if (out.some((s) => Math.abs(Math.atan2(Math.sin(s.a - a), Math.cos(s.a - a))) < Q.pack.slotGap)) continue;
        const x = hp.x + Math.sin(a) * r, z = hp.z + Math.cos(a) * r, h = height(x, z);
        if (Math.abs(h - floor) < 1 && this.inPit({ x, z }) && walkable(x, z, h, cs, 0.55)) got = { a, p: new THREE.Vector3(x, h, z) };
      }
      if (!got) {
        const x = hp.x + Math.sin(want) * R[0], z = hp.z + Math.cos(want) * R[0];
        got = { a: want, p: new THREE.Vector3(x, height(x, z), z) };
      }
      out.push(got);
    }
    return out;
  }
  spawnPack(a) {
    const D = this.ctx.enemies, hero = this.hero, e = this.e;
    if (!D || !hero || !hero.pos) return 0;
    const alive = this.totems.filter((t) => t.alive);
    if (!alive.length) return 0; // 孤嚎
    const mine = D.list.filter((o) => o.alive && o.summoner === e).length;
    const n = Math.min(alive.length * Q.summon.perDen + (a.id === "moon_howl" ? Q.summon.moonExtra : 0), Q.summon.max - mine);
    if (n <= 0) return 0;
    const lv = this.heroLevel(), slots = this.packSlots(n, hero.pos), Lp = Q.pack.leap, roles = Q.pack.roles;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const t = alive[i % alive.length], from = this.denExit(t);
      const o = D.spawn(Q.summon.type, from, { aggro: !0, pack: e.pack, region: e.region, noLoot: !0, level: lv });
      if (!o) continue;
      o.summoner = e;
      made++;
      if (this.ctx.vfx) this.ctx.vfx.burst(from, { color: e.def.auraColor ?? INKC.ink, count: 16, speed: 3, size: 0.22, up: 3, y: 0.4 });
      const c = o.ctrl;
      if (!c) continue;
      c.boss = e;
      c.totem = t;
      c.role = roles[i % roles.length];
      c.slotA = slots[i].a;
      const d = Math.hypot(slots[i].p.x - from.x, slots[i].p.z - from.z);
      c.leapTo(slots[i].p, Lp.crouch + Math.max(Lp.min, Math.min(Lp.max, d / Lp.speed)));
    }
    this.ev("boss:pack", { n: made, attack: a.id, level: lv });
    return made;
  }
  fleeAdds() {
    const D = this.ctx.enemies;
    if (!D) return;
    for (const o of D.list) {
      if (o === this.e || !o.alive || o.summoner !== this.e) continue;
      if (this.ctx.vfx) this.ctx.vfx.burst(o.pos, { color: INKC.ink, count: 14, speed: 3, up: 2, y: 0.5 });
      o.entity.alive = !1;
      o.state = "dead";
      if (D.bars && D.bars.remove) D.bars.remove(o);
      o.dispose();
    }
  }
  onDeath(info) {
    this.mode = "dead";
    if (this.broken) this.ent.stats.removeSource("qyBreak");
    this.fleeAdds();
    this.cleanupFight();
    this.setVeil(0);
    this.ev("boss:defeated", { executed: !!(info && (info.tags || []).includes("execute")), phase: this.phase });
    setTimeout(() => this.dispose(), 0);
  }

  // ---------------- 撤退 / 重置 ----------------
  retreat(byLeash) {
    const e = this.e;
    const hpLeft = this.ent.hp / this.ent.stats.get("hp");
    if (this.exec.active) this.exec.finish();
    // 流程组的这一场还开着（不是它的墨雾门读条撤出，比如被击退出谷 / 回巢）：替它记一次撤退
    const fb = this.flowBoss;
    if (fb && fb.fight && fb.end) fb.end("retreat");
    this.ev("boss:retreat", { phase: this.phase, hpLeft, leash: !!byLeash });
    this.cleanupFight();
    // 回满：气血、护盾段落、阶段、狼威
    const ent = this.ent;
    ent.hp = ent.stats.get("hp");
    if (this.ctx.shields) {
      this.ctx.shields.drop(ent);
      ent.shield = null;
      e.phaseIdx = 0;
      this.ctx.shields.give(ent, (e.def.shieldPhases && e.def.shieldPhases[0].el) || "wood");
    }
    ent.stats.removeSource("qyP2");
    ent.stats.removeSource("qyMoon");
    ent.stats.removeSource("qyBreak");
    if (this.look && this.look.setPhase) this.look.setPhase(1);
    this.setVeil(0);
    this.phase = 1;
    this.poise = 0;
    this.breaks = 0;
    this.setNear(!1);
    this.broken = !1;
    this.downKind = null;
    this.chan = null;
    this.moonLeap = null;
    this.crashT = 0;
    this.mode = "reset";
    if (e.state !== "return") e.goHome("retreat");
    e.home.copy(this.home);
  }
  cleanupFight() {
    if (this.arena && this.arena.gates) {
      this.arena.gates.setOn("all", !1);
      if (this.arena.gates.setThick) this.arena.gates.setThick(0);
    }
    if (this.ctx.flyFence) this.ctx.flyFence = null;
    if (this.ctx.rig && this.ctx.rig.cineActive) this.ctx.rig.cine(null, 0.4);
  }
  dispose() {
    this.dead = !0;
    for (const off of this.offs) typeof off === "function" && off();
    this.offs = [];
    for (const t of this.totems) if (t.ent && t.ent.alive) this.ctx.world.remove(t.ent);
    if (this.look && this.look.dispose) this.look.dispose();
  }

  // ---------------- 图腾 ----------------
  totemFall(t) {
    if (!t.alive) return;
    t.fall();
    const left = this.totems.filter((x) => x.alive).length;
    if (this.ctx.vfx) this.ctx.vfx.burst(t.pos, { color: 0xd9d2bf, count: 24, speed: 5, up: 4, y: 1.5 });
    this.ev("boss:totem", { totem: t.id, left });
    if (this.mode === "asleep") return this.startIntro("totem");
    if (this.mode !== "fight") return;
    this.addPoise(Q.poise.src.totem, "totem");
    // 青牙悲嚎 1 秒（不在出招中才会）
    const e = this.e;
    if (!e.attacking && !this.broken && e.state !== "cinematic") (e.state = "flinch"), (e.t = Q.totem.wail), e.play("howl", 0.1, !0);
  }

  // ---------------- 给 UI ----------------
  view() {
    const ent = this.ent, sh = ent.shield, e = this.e;
    const k = e.atk;
    const ch = k && k.channel && e.state === "windup" ? { id: k.a.id, k: Math.min(1, e.t / k.windup), brk: this.chan ? Math.min(1, this.chan.val / this.chan.need) : 0 } : null;
    return {
      phase: this.phase, mode: this.mode, asleep: this.mode === "asleep",
      hp: ent.hp, hpMax: ent.stats.get("hp"),
      shield: sh && sh.hp > 0 ? { el: sh.element, hp: sh.hp, max: sh.max } : null,
      poise: this.poise, poiseMax: this.poiseMax, poiseFalling: !this.broken && this.poise > 0 && this.time - this.lastGain > Q.poise.holdDelay, broken: this.broken,
      down: this.mode === "final" ? "final" : this.downKind === "break" && this.broken ? "break" : null, downLeft: Math.max(0, this.downT), downDur: this.downDur,
      channel: ch, inMoon: this.inMoon(e.pos), weak: this.phase === 2,
    };
  }
}

export function qingyaController(enemy) {
  return new QingyaCtrl(enemy);
}
