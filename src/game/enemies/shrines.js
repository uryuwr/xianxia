// 碧鳞水蟒的五行坛（关卡评审 P2）：Boss 战期间，站在坛前读条 2 秒点亮，之后 15 秒内普攻附带该坛的五行
// （给主角加 imbue_<五行> 属性，player.js 的附灵逻辑读取；对护盾按 SHIELD_TUNE.imbue 结算）。
// 与护盾段落联动：三座坛正好克制碧鳞的三段护盾（水坛 → 火盾、木坛 → 土盾、金坛 → 木盾），
// 当前护盾的克制坛会持续冒光柱提示。事件：boss:shrine { element, shrine }（点亮）、boss:shrineHint { element }。
import * as THREE from "three";
import { COUNTER } from "../shields.js";

export const SHRINE_TUNE = { radius: 2.4, channel: 2, dur: 15, hintEvery: 1.6 };
const EL_COLOR = { metal: 0xe8d9a0, wood: 0x3fae7a, water: 0x3f8fa8, fire: 0xd2321e, earth: 0xa5743a };
const DEFAULT_ELS = ["water", "metal", "wood"]; // 关卡只给了位置时的默认顺序（同 r2 的水坛 / 金坛 / 木坛）

export class BossShrines {
  // boss：Enemy；list：[{ pos: Vector3, el? }]
  constructor(ctx, boss, list) {
    this.ctx = ctx;
    this.boss = boss;
    this.list = list.map((s, i) => ({ pos: s.pos.clone ? s.pos.clone() : new THREE.Vector3(...s.pos), el: s.el || DEFAULT_ELS[i % 3], name: s.name, chan: 0, ringT: 0 }));
    this.activeT = 0;
    this.hintT = 0;
    this.done = !1;
  }
  // 当前护盾对应的克制坛
  hintShrine() {
    const sh = this.boss.entity.shield;
    if (!sh || sh.hp <= 0) return null;
    return this.list.find((s) => s.el === COUNTER[sh.element]) || null;
  }
  update(dt, hero) {
    const b = this.boss, vfx = this.ctx.vfx;
    if (!b.alive || b.removed) return this.dispose();
    // 提示：克制当前护盾的坛冒光柱
    const hs = this.hintShrine();
    if (hs && (this.hintT -= dt) <= 0) {
      this.hintT = SHRINE_TUNE.hintEvery;
      vfx.pillar(hs.pos, { color: EL_COLOR[hs.el], radius: 0.6, height: 5, dur: 1.2 });
      if (hs !== this.lastHint) (this.lastHint = hs), this.ctx.world.events.emit("boss:shrineHint", { element: hs.el, shrine: hs });
    }
    // 读条点亮
    if (hero && hero.alive)
      for (const s of this.list) {
        const d = Math.hypot(hero.pos.x - s.pos.x, hero.pos.z - s.pos.z);
        if (d > SHRINE_TUNE.radius) {
          s.chan = 0;
          continue;
        }
        if (s.chan === 0) vfx.ring(s.pos, SHRINE_TUNE.radius, { fill: 1, dur: SHRINE_TUNE.channel, color: EL_COLOR[s.el] });
        s.chan += dt;
        if (s.chan >= SHRINE_TUNE.channel) {
          s.chan = -999; // 离开坛再回来才能重新读条
          this.light(s, hero);
        }
      }
    if (this.activeT > 0 && (this.activeT -= dt) <= 0) hero && hero.stats.removeSource("shrine");
  }
  light(s, hero) {
    hero.stats.removeSource("shrine");
    hero.stats.add({ stat: "imbue_" + s.el, type: "flat", value: 1, source: "shrine" });
    this.activeT = SHRINE_TUNE.dur;
    this.ctx.vfx.pillar(s.pos, { color: EL_COLOR[s.el], radius: 1.2, height: 8, dur: 0.8 });
    this.ctx.vfx.burst(hero.pos, { color: EL_COLOR[s.el], count: 24, speed: 4, size: 0.2, up: 4, y: 1 });
    this.ctx.world.events.emit("boss:shrine", { element: s.el, shrine: s, dur: SHRINE_TUNE.dur });
  }
  dispose() {
    if (this.done) return;
    this.done = !0;
    const h = this.ctx.world.player;
    if (h && this.activeT > 0) h.stats.removeSource("shrine");
  }
}
