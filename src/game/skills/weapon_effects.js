// 高品质法剑奇效：与心法分离，一次安装；按命中时的已校验属性标记读取，不逐帧扫描装备。
import { WEAPON_EFFECTS } from "../../data/items.js";
import { applyElemStatus } from "./statuses.js";

const EXCLUDED = new Set(["spell", "dot", "reaction", "thunder", "xinfa", "artifact", "weapon_proc"]);

// 先按普通眩晕询问首领裁决，再合并状态。不能继承旧蓄势斩的 tag / _allow 而越过免疫，
// 也不能把一个即将到期的长眩晕整段刷新：合并后只保留原剩余时长与本次0.5秒中的较大值。
function paralyze(world, src, target, dur) {
  const owner = target.owner, poised = owner && owner.def && owner.def.ccMode === "poise" && owner.ctrl;
  if (poised && (!owner.ctrl.onCC || owner.ctrl.onCC("stun", dur, { src, tag: "weapon_proc" }) !== "allow")) return null;
  const old = target.statuses.get("stun"), remaining = old ? Math.max(0, old.dur - old.t) : 0;
  const s = world.applyStatus(target, "stun", {
    dur, src,
    data: { tag: "weapon_proc", weaponParalysis: !0, freeze: !1, full: !1, _poised: !!poised, _allow: !!poised },
  });
  if (!s || target.statuses.get("stun") !== s) return null;
  s.src = src;
  s.dur = Math.max(remaining, dur);
  return s;
}

export function installWeaponEffects(sys) {
  const { world, vfx } = sys.ctx;
  const lastStun = new WeakMap();
  let nextThunder = -Infinity;
  return world.events.on("damage", (info) => {
    const hero = sys.hero, t = info.target, tags = info.tags;
    if (!hero || info.attacker !== hero || !info.crit || info.amount <= 0 || !t.alive || t.hp <= 0 || t.team === hero.team) return;
    if (!tags.includes("basic") || tags.some((tag) => EXCLUDED.has(tag))) return;
    const st = hero.stats;
    if (st.get("wx_weapon_burn") > 0) {
      const d = WEAPON_EFFECTS.weapon_burn;
      applyElemStatus(world, hero, t, { id: "burn", stacks: d.stacks, dur: d.dur });
    }
    if (st.get("wx_weapon_poison") > 0) {
      const d = WEAPON_EFFECTS.weapon_poison, pool = info.amount * d.frac;
      const s = world.applyStatus(t, "weapon_poison", { dur: d.dur, src: hero, data: { pool, per: pool / (d.dur / d.tick), acc: 0 } });
      if (s) s.src = hero, s.dur = d.dur;
    }
    if (st.get("wx_weapon_thunder") > 0 && world.time >= nextThunder) {
      const d = WEAPON_EFFECTS.weapon_thunder;
      // 先登记间隔；thunder + weapon_proc 标签同时阻断旧雷引和新奇效自身。
      nextThunder = world.time + d.icd;
      vfx && vfx.burst(t.pos, { color: 0xbfe8ff, count: 12, speed: 3, up: 4, size: 0.16, dur: 0.35 });
      world.dealDamage(hero, t, { base: d.base, scale: { spell: d.spell }, element: "metal", noCrit: !0, tags: ["thunder", "weapon_proc"] });
      if (!t.alive || t.hp <= 0 || world.time < (lastStun.get(t) ?? -Infinity) + d.stunIcd) return;
      if (paralyze(world, hero, t, d.stun)) lastStun.set(t, world.time);
    }
  });
}
