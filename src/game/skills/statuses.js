// 五行状态与相生反应。
//   金 armor_break 破甲：受到伤害提高（每层）
//   木 root 缠绕：无法移动
//   水 chill 寒冷：减速，叠满 3 层冻结（freeze，短暂眩晕）
//   火 burn 灼烧：持续火属性伤害（每层）
//   土 stun 眩晕：无法移动与行动
// 状态强度 = 1 + 施加者对应五行属性 / 100。
//
// 相生反应（目标身上已有前一行的状态，再受到后一行五行的直接伤害时触发）：
//   木生火 root  + 火 → 爆燃：范围火伤并灼烧周围敌人
//   火生土 burn  + 土 → 熔岩：重创、破甲并短暂眩晕
//   土生金 stun  + 金 → 碎甲：叠满破甲并追加伤害
//   金生水 armor_break + 水 → 冰裂：引爆破甲层数造成水伤
//   水生木 chill + 木 → 藤蔓：缠绕向周围敌人蔓延
import * as THREE from "three";
import { STATUS } from "../../core/combat.js";
import { ELEM_COLOR } from "../../fx/skill_fx.js";
import { INKC } from "../../fx/vfx.js";
import { WEAPON_EFFECTS } from "../../data/items.js";

export const STATUS_ELEMENT = { armor_break: "metal", root: "wood", chill: "water", burn: "fire", stun: "earth", freeze: "water" };
export const STATUS_NAME = { armor_break: "破甲", root: "缠绕", chill: "寒冷", burn: "灼烧", stun: "眩晕", freeze: "冻结", weapon_poison: "中毒" };

STATUS.armor_break = {
  maxStacks: 5,
  dur: 5,
  mods: (s) => [{ stat: "vuln", type: "flat", value: 0.06 * s.stacks * (s.data.str || 1) }],
};
STATUS.root = {
  maxStacks: 1,
  dur: 2,
  mods: () => [{ stat: "move", type: "more", value: -1 }],
};
STATUS.chill = {
  maxStacks: 3,
  dur: 4,
  mods: (s) => [{ stat: "move", type: "pct", value: -Math.min(0.75, 0.18 * s.stacks * (s.data.str || 1)) }],
};
STATUS.burn = {
  maxStacks: 5,
  dur: 4,
  onTick(world, e, s, dt) {
    s.data.acc = (s.data.acc || 0) + dt;
    while (s.data.acc >= 0.5 && e.alive) {
      s.data.acc -= 0.5;
      world.dealDamage(s.src, e, { base: (s.data.dps || 6) * 0.5 * s.stacks, element: "fire", noCrit: !0, tags: ["dot", "burn"] });
    }
  },
};
// 法剑中毒：独立于五行状态，刷新替换伤害池；最后一帧只累计有效时长，避免到期多跳。
STATUS.weapon_poison = {
  maxStacks: 1,
  dur: WEAPON_EFFECTS.weapon_poison.dur,
  onTick(world, e, s, dt) {
    const d = s.data, tick = WEAPON_EFFECTS.weapon_poison.tick;
    d.acc += Math.min(dt, Math.max(0, s.dur - (s.t - dt)));
    while (d.acc + 1e-8 >= tick && d.pool > 0 && e.alive && e.hp > 0) {
      d.acc -= tick;
      const amount = Math.min(d.pool, d.per);
      d.pool = Math.max(0, d.pool - amount);
      world.dealDamage(s.src, e, { base: amount, noCrit: !0, tags: ["dot", "poison", "weapon_proc"] });
    }
  },
};

STATUS.stun = {
  maxStacks: 1,
  dur: 1,
  mods: () => [{ stat: "move", type: "more", value: -1 }],
};

// 施加五行状态：根据施加者的五行属性计算强度，灼烧的每秒伤害随法力增长
export function applyElemStatus(world, src, target, spec) {
  if (!spec || !target || !target.alive) return null;
  const el = STATUS_ELEMENT[spec.id];
  const str = 1 + (src && src.stats && el ? src.stats.get(el) : 0) / 100;
  const data = { str };
  if (spec.id === "burn") data.dps = (4 + (src && src.stats ? src.stats.get("spell") * 0.18 : 0)) * str;
  return world.applyStatus(target, spec.id, { stacks: spec.stacks || 1, dur: (spec.dur || STATUS[spec.id].dur) * (spec.id === "stun" || spec.id === "root" ? 1 : str), src, data });
}

// 安装：冻结规则 + 相生反应
export function installReactions(sys) {
  const { world } = sys.ctx;
  const last = new WeakMap();
  const enemies = (src) => (e) => e.team !== (src ? src.team : "player");

  // 寒冷叠满 3 层 → 冻结
  world.events.on("status", ({ target, status }) => {
    if (status.id === "chill" && status.stacks >= 3) {
      world.removeStatus(target, "chill");
      world.applyStatus(target, "stun", { dur: 1.4, src: status.src, data: { freeze: !0 } });
      sys.fx.popText("冻结", null, target.pos, ELEM_COLOR.water);
      sys.ctx.vfx.burst(target.pos, { color: 0xcfe9f2, count: 16, speed: 3, up: 2, size: 0.2 });
    }
  });

  const react = (name, sub, info, color) => {
    world.events.emit("reaction", { name, target: info.target, pos: info.target.pos.clone(), element: info.element, attacker: info.attacker });
    sys.fx.popText(name, sub, info.target.pos, color);
    sys.stats.reactions[name] = (sys.stats.reactions[name] || 0) + 1;
  };
  const hit = (src, t, base, spell, element, extra = {}) => world.dealDamage(src, t, { base, scale: { spell }, element, tags: ["reaction"], ...extra });

  world.events.on("damage", (info) => {
    const el = info.element, t = info.target, src = info.attacker;
    if (!el || info.tags.includes("dot") || info.tags.includes("reaction")) return;
    const now = world.time;
    if ((last.get(t) || -9) > now - 0.25) return;
    const has = (id) => t.statuses.has(id);
    const pos = t.pos;

    if (el === "fire" && has("root")) {
      last.set(t, now);
      world.removeStatus(t, "root");
      react("爆燃", "木生火", info, ELEM_COLOR.fire);
      sys.ctx.vfx.ring(pos, 3.2, { color: ELEM_COLOR.fire, dur: 0.45, width: 0.12 });
      sys.ctx.vfx.burst(pos, { color: ELEM_COLOR.fire, count: 30, speed: 7, up: 4, size: 0.24 });
      sys.ctx.vfx.burst(pos, { color: INKC.ink, count: 16, speed: 5, up: 3 });
      for (const e of world.query(pos, 3.2, enemies(src))) {
        hit(src, e, 30, 1.2, "fire");
        applyElemStatus(world, src, e, { id: "burn", stacks: 2, dur: 4 });
      }
    } else if (el === "earth" && has("burn")) {
      last.set(t, now);
      const st = t.statuses.get("burn").stacks;
      world.removeStatus(t, "burn");
      react("熔岩", "火生土", info, 0xc25a20);
      sys.ctx.vfx.burst(pos, { color: 0xc25a20, count: 22, speed: 4, up: 5, size: 0.26 });
      hit(src, t, 20 + 10 * st, 1.0, "earth");
      applyElemStatus(world, src, t, { id: "armor_break", stacks: 3, dur: 6 });
      t.alive && world.applyStatus(t, "stun", { dur: 0.8, src });
    } else if (el === "metal" && has("stun")) {
      last.set(t, now);
      react("碎甲", "土生金", info, ELEM_COLOR.metal);
      sys.ctx.vfx.burst(pos, { color: ELEM_COLOR.metal, count: 18, speed: 6, up: 3 });
      applyElemStatus(world, src, t, { id: "armor_break", stacks: 5, dur: 7 });
      hit(src, t, 18, 0.8, "metal");
    } else if (el === "water" && has("armor_break")) {
      last.set(t, now);
      const st = t.statuses.get("armor_break").stacks;
      world.removeStatus(t, "armor_break");
      react("冰裂", "金生水", info, ELEM_COLOR.water);
      sys.ctx.vfx.ring(pos, 2, { color: 0xcfe9f2, dur: 0.35, width: 0.15 });
      sys.ctx.vfx.burst(pos, { color: 0xcfe9f2, count: 26, speed: 6, up: 3, size: 0.22 });
      hit(src, t, 25 * (1 + st * 0.35), 1.2 * (1 + st * 0.35), "water");
    } else if (el === "wood" && has("chill")) {
      last.set(t, now);
      world.removeStatus(t, "chill");
      react("藤蔓", "水生木", info, ELEM_COLOR.wood);
      sys.ctx.vfx.ring(pos, 4.5, { color: ELEM_COLOR.wood, dur: 0.6, width: 0.08 });
      for (const e of world.query(pos, 4.5, enemies(src))) {
        applyElemStatus(world, src, e, { id: "root", stacks: 1, dur: 2.5 });
        sys.fx.vineAt && sys.fx.vineAt(e.pos, 1.2, 2.5);
      }
    }
  });
}

// 状态外观：给带状态的敌人周期性冒出对应颜色的墨点，便于读出局势
const _p = new THREE.Vector3();
export function statusParticles(sys, dt) {
  sys._stT = (sys._stT || 0) - dt;
  if (sys._stT > 0) return;
  sys._stT = 0.2;
  const v = sys.ctx.vfx;
  for (const e of sys.ctx.world.entities) {
    if (!e.alive || e.team === "player" || !e.statuses.size) continue;
    _p.copy(e.pos);
    _p.y += (e.height || 1.6) * 0.5;
    for (const s of e.statuses.values()) {
      if (s.id === "burn") v.burst(_p, { color: ELEM_COLOR.fire, count: 2 + s.stacks, speed: 1, up: 3, size: 0.14, dur: 0.5, y: 0 });
      else if (s.id === "chill") v.burst(_p, { color: 0xcfe9f2, count: s.stacks, speed: 1.2, up: 0.5, size: 0.12, dur: 0.6, y: 0 });
      else if (s.id === "weapon_poison") v.burst(_p, { color: 0x74854c, count: 2, speed: 0.8, up: 1.5, size: 0.12, dur: 0.5, y: 0 });
      else if (s.id === "stun") v.burst(_p.setY(e.pos.y + (e.height || 1.6) + 0.2), { color: s.data.freeze || s.data.weaponParalysis ? 0xcfe9f2 : ELEM_COLOR.earth, count: 2, speed: 1.5, up: 0.2, size: 0.12, dur: 0.4, y: 0 });
      else if (s.id === "armor_break") v.burst(_p, { color: ELEM_COLOR.metal, count: 1, speed: 1.5, up: 1, size: 0.1, dur: 0.4, y: 0 });
      else if (s.id === "root") v.burst(_p.setY(e.pos.y + 0.1), { color: ELEM_COLOR.wood, count: 2, speed: 1, up: 1, size: 0.12, dur: 0.4, y: 0 });
    }
  }
}
