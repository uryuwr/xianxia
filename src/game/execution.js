// 通用处决 / 演出时间轴（青牙 v2 起；碧鳞等首领复用）。设计：docs/design/boss_青牙_v2.md §7。
//   一段演出 = 一串按真实时间触发的拍子（steps: [{ at, run(ex) }]），外加统一的"进场 / 退场"：
//     进场：主角 cinematic（无敌、不吃输入）、首领由调用方设状态、其他敌人眩晕定格、发 boss:execute
//     退场：镜头缓出、world.timeScale 还原为 1、主角回到 move、发 boss:execEnd
//   拍子里可用的工具：ex.cam(shot)（rig.cine）、ex.slow(scale)（world.timeScale）、ex.hitStop(s)、ex.shake(a)
//   时间按 performance.now()（真实时间）推进，不受顿帧 / 慢动作影响；start() 后自己用 requestAnimationFrame 推进（也可外部多调 update，拍子只跑一次）。
//   UI（src/ui/boss/*）只听事件画"斩"字 / 墨笔 / 朱印 / 黑边 / 留白，本模块不建任何 DOM。
//   去饱和（水墨后期 ctx.ink.setDesat，同一个 pass）：spec.desat（0..1），缺省时威折处决 kind "break" 去一档（§7.1 0.00"画面去饱和一档"）；
//     0.15 秒褪色、最后 0.5 秒回色，结束（含被打断）一定归零。
const DESAT = { break: 0.45 };
export class Execution {
  constructor(ctx) {
    this.ctx = ctx;
    this.cur = null;
  }
  get active() {
    return !!this.cur;
  }
  // spec: { id, enemy, kind, dur, short, dmg?, steps, freeze: true|false, heroAnim?, onEnd? }
  start(spec) {
    if (this.cur) this.finish();
    const ctx = this.ctx, w = ctx.world, P = ctx.player;
    const cur = (this.cur = { ...spec, t0: performance.now(), next: 0, steps: [...(spec.steps || [])].sort((a, b) => a.at - b.at), desat: spec.desat ?? DESAT[spec.kind] ?? 0 });
    if (P && P.cinematic) P.cinematic(spec.dur + 0.05, spec.heroAnim || null, spec.heroAnimDur || 0);
    if (P) P.slowUntil = 0; // 完美闪身的慢动作由本模块接管
    if (spec.freeze !== !1 && ctx.enemies)
      for (const o of ctx.enemies.list) if (o !== spec.enemy && o.alive && o.entity) w.applyStatus(o.entity, "stun", { dur: spec.dur, src: P && P.entity, data: { tag: "cinematic" } });
    w.events.emit("boss:execute", { id: spec.id, enemy: spec.enemy, kind: spec.kind, dmg: spec.dmg || 0, dur: spec.dur, short: !!spec.short });
    // 自己用 rAF 推进（首领在终结处决里死掉后控制器就不再被调用，演出仍要走完、还原镜头与时间）
    const loop = () => {
      if (this.cur !== cur) return;
      this.update();
      if (this.cur === cur) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return cur;
  }
  get t() {
    return this.cur ? (performance.now() - this.cur.t0) / 1000 : 0;
  }
  cam(shot, out) {
    const rig = this.ctx.rig;
    if (rig && rig.cine) rig.cine(shot, out);
  }
  slow(k) {
    this.ctx.world.timeScale = k;
  }
  hitStop(s) {
    this.ctx.world.hitStop(s);
  }
  desat(v) {
    const ink = this.ctx.ink;
    if (ink && ink.setDesat) ink.setDesat(v);
  }
  shake(a) {
    const rig = this.ctx.rig;
    if (rig && rig.shake) rig.shake(a);
  }
  update() {
    const c = this.cur;
    if (!c) return !1;
    const t = this.t;
    while (c.next < c.steps.length && c.steps[c.next].at <= t) {
      const st = c.steps[c.next++];
      try {
        st.run(this, t);
      } catch (e) {
        console.error("[execution] step", e);
      }
    }
    if (c.tick) c.tick(this, t);
    if (c.desat > 0) this.desat(c.desat * Math.max(0, Math.min(1, t / 0.15, (c.dur - t) / 0.5)));
    if (t >= c.dur) this.finish();
    return !!this.cur;
  }
  // 结束（正常到点 / 被打断）：还原镜头、时间缩放、主角状态
  finish() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    // 没跑到的拍子按顺序补跑（保证伤害 / 结算不丢）
    while (c.next < c.steps.length) {
      const st = c.steps[c.next++];
      if (st.must)
        try {
          st.run(this, c.dur);
        } catch (e) {
          console.error("[execution] step", e);
        }
    }
    this.cam(null, 0.5);
    this.ctx.world.timeScale = 1;
    if (c.desat > 0) this.desat(0);
    const P = this.ctx.player;
    if (P && P.endCinematic) P.endCinematic();
    if (c.onEnd)
      try {
        c.onEnd();
      } catch (e) {
        console.error("[execution] onEnd", e);
      }
    this.ctx.world.events.emit("boss:execEnd", { id: c.id, enemy: c.enemy, kind: c.kind });
  }
}
