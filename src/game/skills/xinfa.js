// 心法：被动属性加成 + 战斗触发器。启用 / 停用通过 SkillSystem.setXinfa。
import * as THREE from "three";
import { swordMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { INKC } from "../../fx/vfx.js";
import { strike } from "./effects.js";

// 触发器：install(sys) 返回卸载函数
export const TRIGGERS = {
  // 斩敌回气
  killMp(sys) {
    return sys.ctx.world.events.on("kill", (info) => {
      if (info.attacker !== sys.hero) return;
      sys.hero.mp = Math.min(sys.hero.stats.get("mp"), sys.hero.mp + 6);
    });
  },
  // 剑影：闪身时留下剑影，0.6 秒后爆开
  dashShadow(sys) {
    return sys.ctx.world.events.on("player:dash", (ev) => {
      const p = ((ev && ev.from) || (ev && ev.pos) || sys.hero.pos).clone();
      const m = swordMesh();
      m.position.set(p.x, p.y + 0.1, p.z);
      m.rotation.x = Math.PI; // 倒插地面
      m.position.y += 1.0;
      sys.fx.add(m, 0.7, (it, k) => (m.userData.glow.material.opacity = 0.3 + k * 0.6));
      sys.later(0.6, () => {
        for (const t of sys.ctx.world.query(p, 2.2, (e) => e.team !== sys.hero.team)) strike(sys, sys.hero, t, { base: 20, scale: { atk: 0.8 } }, "metal", null, { tags: ["xinfa"] });
        sys.ctx.vfx.ring(p, 2.2, { color: 0x7fd8ff, dur: 0.35, width: 0.1 });
        sys.ctx.vfx.burst(p, { color: INKC.ink, count: 14, speed: 5, up: 3 });
      });
    });
  },
  // 雷引：暴击引雷
  critThunder(sys) {
    let icd = 0;
    return sys.ctx.world.events.on("damage", (info) => {
      if (info.attacker !== sys.hero || !info.crit || !info.target.alive) return;
      if (info.tags.some((t) => t === "dot" || t === "reaction" || t === "thunder")) return;
      const w = sys.ctx.world;
      if (w.time < icd) return;
      icd = w.time + 0.25;
      const t = info.target, top = t.pos.clone().setY(t.pos.y + 9);
      sys.fx.lightning(top, t.pos.clone().setY(t.pos.y + 0.5), 0xbfe8ff, 0.09);
      strike(sys, sys.hero, t, { base: 15, scale: { spell: 0.6 } }, "metal", null, { tags: ["thunder", "xinfa"], noCrit: !0 });
    });
  },
};
