// 首领战的流程部分（模块 A；docs/design/boss_青牙_v2.md §10.2 第 7 项）：
//   · 狼骨门提示：bossGate.text 里的 {realm} 换成境界标签（首领已生成用 enemies.realmLabel(boss)；还没生成时用 ENEMY_TYPES[id].realm 按同一神识规则换算），第二行 bossGate.sub
//   · 入场：走进 points.boss.trigger 米 → intro()，发 boss:intro { boss, first, tries, best, cause }（每场一次）。
//       控制器因"被打 / 砍倒图腾"开战时请调 ctx.flow.run.boss.intro(enemy, cause)（也兼容直接发 boss:intro：这里补记一场挑战，不重发）
//   · 墨雾门（points.boss.gates）：开战后在门前按住 F 读条 1.5 秒（受击打断、松开即停）→ 林墨移到门外，首领回巢回满，发 boss:retreat { boss }
//   · 存档 profile.stats.bossLog[id] = { tries, kills, retreats, deaths, firstKill: { run, realm, sec }, best: { phase, hpLeft, realm }, fastest,
//       execs: { break, final }, log: [最近 10 次 { run, realm, result, phase, hpLeft, sec }] }（hpLeft 是首领剩余气血比例 0–1；best 只进不退）
//   · 首次演出标记：profile.flags["bossIntro_" + id]（入场仪式）、profile.flags["bossExec_" + id + "_" + kind]（处决）——payload.first / 控制器读它们决定长短版
//   事件约定见 §10.1：boss:phase { boss, phase }、boss:execute { boss, kind }、boss:defeated { boss, executed } 由战斗控制器发，这里只监听
import * as THREE from "three";
import { ENEMY_TYPES } from "../../data/enemies.js";

export const MIST = { hold: 1.5, reach: 2.2, out: 4 }; // 读条秒数；离门多近可读条（门宽之外再加）；撤到门外多远
const LOG_MAX = 10;
const _v = new THREE.Vector3();

// 关卡 points.boss 里的子点位（gates / pillars …）可能还是 [x, z] 数组
const X = (p) => (Array.isArray(p) ? p[0] : p.x), Z = (p) => (Array.isArray(p) ? p[1] : p.z);
export const bossIdOf = (b) => (!b ? null : typeof b === "string" ? b : (b.def && b.def.boss) || b.type || b.id || null);
const realmStr = (P) => (P && P.realm ? `${P.realm.stage}:${P.realm.layer}` : "1:1");

export function bossLog(P, id) {
  const S = (P.stats = P.stats || {}), B = (S.bossLog = S.bossLog || {});
  return (B[id] = B[id] || { tries: 0, kills: 0, retreats: 0, deaths: 0, firstKill: null, best: null, fastest: null, execs: { break: 0, final: 0 }, log: [] });
}
// best 只进不退：斩杀 > 阶段更深 > 同一阶段剩血更少
//   斩杀（hpLeft 0）永远算更好
const better = (a, b) => !b || (a.hpLeft === 0 || b.hpLeft === 0 ? a.hpLeft === 0 && (b.hpLeft > 0 || a.phase >= b.phase) : a.phase > b.phase || (a.phase === b.phase && a.hpLeft < b.hpLeft));

export class BossFlow {
  constructor(run) {
    this.run = run;
    this.ctx = run.ctx;
    this.e = null; // 首领（run.bossSpawn 生成后填）
    this.fight = null; // 进行中的一场：{ id, e, t0, phase }
    const ev = this.ctx.world.events;
    this.offs = [
      ev.on("boss:intro", (d) => d && d.src !== this && !this.fight && this.intro(d.boss, d.cause || "event", !1)),
      ev.on("boss:phase", (d) => this.fight && d && d.phase && (this.fight.phase = Math.max(this.fight.phase, d.phase))),
      ev.on("boss:execute", (d) => this.onExecute(d)),
      ev.on("boss:defeated", (d) => this.end("kill", d && d.executed)),
      ev.on("enemy:killed", (d) => d && d.boss && this.fight && d.boss === this.fight.id && this.end("kill")),
    ];
  }
  get P() {
    return this.run.profile;
  }
  bp() {
    return this.run.map.points.boss;
  }
  // ---- 狼骨门提示 ----
  realmText(id) {
    const E = this.ctx.enemies;
    if (!E || !E.realmLabel) return "";
    if (this.e && this.e.alive && bossIdOf(this.e) === id) return E.realmLabel(this.e).text;
    const def = ENEMY_TYPES[id];
    if (!def) return "";
    const [stage, layer] = String(def.realm || "1:1").split(":").map(Number);
    return E.realmLabel({ def, realm: () => ({ stage, layer }) }).text; // 首领还没生成：同一神识规则
  }
  gateHint(g) {
    const id = g.boss || (this.bp() && this.bp().id);
    return { text: String(g.text || "此去：首领").replace("{realm}", this.realmText(id)), sub: g.sub || "" };
  }
  // ---- 入场 ----
  intro(boss, cause = "enter", emit = !0) {
    if (this.fight) return !1;
    const e = boss && typeof boss === "object" ? boss : this.e, id = bossIdOf(e) || bossIdOf(boss);
    if (!id) return !1;
    const P = this.P, L = bossLog(P, id), key = "bossIntro_" + id;
    const first = !P.flags[key];
    P.flags[key] = 1;
    L.tries++;
    this.fight = { id, e, t0: this.run.t, phase: 1 };
    if (emit) this.ctx.world.events.emit("boss:intro", { boss: e || id, first, tries: L.tries, best: L.best, cause, src: this });
    return !0;
  }
  onExecute(d) {
    if (!d) return;
    const id = bossIdOf(d.boss) || (this.fight && this.fight.id);
    if (!id || !d.kind) return;
    const L = bossLog(this.P, id);
    L.execs[d.kind] = (L.execs[d.kind] || 0) + 1;
    this.P.flags["bossExec_" + id + "_" + d.kind] = 1;
  }
  // ---- 一场结束：写存档 ----
  end(result) {
    const f = this.fight;
    if (!f) return;
    this.fight = null;
    const P = this.P, L = bossLog(P, f.id), e = f.e;
    const max = e && e.entity ? e.entity.stats.get("hp") : 1;
    const hpLeft = result === "kill" ? 0 : e && e.entity && e.alive !== !1 ? Math.max(0, Math.min(1, e.entity.hp / max)) : 0;
    const sec = Math.round(this.run.t - f.t0), realm = realmStr(P), run = (P.stats.runs || 0) + 1;
    if (result === "kill") {
      L.kills++;
      if (!L.firstKill) L.firstKill = { run, realm, sec };
      if (L.fastest == null || sec < L.fastest) L.fastest = sec;
    } else if (result === "retreat") L.retreats++;
    else if (result === "death") L.deaths++;
    const b = { phase: result === "kill" ? Math.max(f.phase, (L.best && L.best.phase) || 1) : f.phase, hpLeft: +hpLeft.toFixed(3), realm }; // 斩杀 = 打穿了所有阶段
    if (better(b, L.best)) L.best = b;
    L.log.push({ run, realm, result, phase: f.phase, hpLeft: b.hpLeft, sec });
    if (L.log.length > LOG_MAX) L.log.splice(0, L.log.length - LOG_MAX);
  }
  // ---- 每帧 ----
  update(dt) {
    const r = this.run, bp = this.bp(), pl = this.ctx.player.pos;
    if (!bp || !bp.pos) return;
    // 进 trigger 圈开战（首领活着、这一场还没开始）
    if (!this.fight && this.e && this.e.alive && r.state === "play" && Math.hypot(pl.x - bp.pos.x, pl.z - bp.pos.z) < (bp.trigger || 10)) this.intro(this.e, "enter");
    if (this.fight && this.e && this.e.alive === !1) this.end("kill"); // 控制器没发 boss:defeated 时的兜底
  }
  // 墨雾门：开战后才有；返回附近的门（读条 / 提示用）
  mistNear() {
    if (!this.fight) return null;
    const bp = this.bp(), pl = this.ctx.player.pos;
    for (const g of (bp && bp.gates) || []) if (Math.hypot(pl.x - X(g.pos), pl.z - Z(g.pos)) < (g.w || 4) / 2 + MIST.reach) return g;
    return null;
  }
  // 穿雾撤出：林墨移到门外，首领回巢回满
  retreat(g) {
    const r = this.run, bp = this.bp(), e = this.fight && this.fight.e;
    this.end("retreat");
    _v.set(X(g.pos) - bp.pos.x, 0, Z(g.pos) - bp.pos.z);
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, -1);
    _v.normalize().multiplyScalar(MIST.out);
    _v.x += X(g.pos);
    _v.z += Z(g.pos);
    this.ctx.player.spawn(_v.x, _v.z);
    if (e && e.entity && e.alive !== !1) {
      e.entity.hp = e.entity.stats.get("hp");
      if (e.goHome) e.goHome("retreat");
    }
    this.ctx.world.events.emit("boss:retreat", { boss: e || (bp && bp.id) });
    r.toast(`穿雾而出 · ${(e && e.def && e.def.name) || "首领"}回巢`, "", 2.5);
  }
  dispose() {
    for (const off of this.offs) off && off();
    this.offs = [];
  }
}
