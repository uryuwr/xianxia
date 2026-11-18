// 法宝、心法、丹药与默认配置。
//
// 法宝字段：id, name, glyph, element, desc
//   passive(level) → 属性加成数组 [{stat, type, value}]（祭炼等级 1~5）
//   active: { cost, cd, ...参数 }，数值通过 lv(level) 放大
//   swords: 飞剑数量（仅青冥飞剑）
// 心法字段：id, name, glyph, desc, mods?: 属性加成, trigger?: 触发器名（src/game/skills/xinfa.js 实现）
//   affix: !0 表示可作为仙品以上装备的特殊词条（src/data/loot.js SPECIAL_AFFIXES）：装备上带该词条 = 装备了这本心法
//   （mods 与 trigger 都生效）。同名不叠加：心法栏、多件装备里的同名效果只算一次（src/game/skills/index.js applyLoadout）
export const lv = (level) => 1 + 0.25 * (level - 1);

export const ARTIFACTS = {
  flying_sword: {
    id: "flying_sword", name: "青冥飞剑", glyph: "冥", element: "metal",
    desc: "飞剑环身，自动斩击近处敌人；按 V 令诸剑齐发，斩向鼠标处",
    passive: (L) => [{ stat: "atk", type: "flat", value: 5 * L }],
    swords: (L) => 2 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0),
    orbit: { radius: 1.4, seek: 6.5, interval: 0.9, base: 8, scale: { atk: 0.5 } },
    active: { cost: 20, cd: 6, radius: 2.5, base: 25, scale: { atk: 1.0 } },
  },
  seal: {
    id: "seal", name: "镇山印", glyph: "印", element: "earth",
    desc: "按 V 祭出镇山印砸向鼠标处，震晕敌人；被动提升防御与气血",
    passive: (L) => [{ stat: "def", type: "flat", value: 10 * L }, { stat: "hp", type: "flat", value: 20 * L }],
    active: { cost: 25, cd: 8, delay: 0.55, radius: 3.5, base: 50, scale: { spell: 1.5 }, status: { id: "stun", stacks: 1, dur: 1.5 } },
  },
  gourd: {
    id: "gourd", name: "紫金葫芦", glyph: "葫", element: "water",
    desc: "按 V 打开葫芦，吸取周围敌人精血，回复气血与真气；被动提升真气",
    passive: (L) => [{ stat: "mp", type: "flat", value: 20 * L }, { stat: "mpRegen", type: "flat", value: 1 * L }],
    active: { cost: 0, cd: 10, radius: 6, dur: 1.5, tick: 0.3, base: 10, scale: { spell: 0.6 }, pull: 3, healRate: 0.5, mpRate: 0.3 },
  },
};

// 法剑奇效与心法分离：占原特殊词条位，生成及属性结算均检查 RARITY 品级与部位。
const WEAPON_TRIGGER = "仅仙品及以上法剑：普攻或蓄势斩直接暴击造成气血伤害，且目标存活时触发；法术、持续伤害、反应及附加伤害不触发。";
export const WEAPON_EFFECTS = {
  weapon_burn: { name: "灼烧", dur: 4, stacks: 1, desc: WEAPON_TRIGGER + "施加1层灼烧，基础4秒、至多5层；受火行强化，与原灼烧共用层数及五行反应。" },
  weapon_poison: { name: "中毒", dur: 3, tick: 0.5, frac: 0.25, desc: WEAPON_TRIGGER + "本次伤害的25%作为中毒基础总量，3秒内每0.5秒结算；单层，新触发替换伤害池并刷新，仍受既有伤害规则影响。" },
  weapon_thunder: { name: "雷击麻痹", base: 15, spell: 0.6, icd: 0.25, stun: 0.5, stunIcd: 8, desc: WEAPON_TRIGGER + "追加15＋法力×0.6金伤，不暴击，间隔0.25秒；麻痹0.5秒，同目标成功控制后间隔8秒，遵循首领免疫。" },
};
// 所有物品详情共用名称与说明，不把武器奇效显示成可装配心法。
export function weaponAffixText(a) {
  const effect = a && a.stat === "special" && WEAPON_EFFECTS[a.effect];
  return effect ? effect.name + " · " + effect.desc : null;
}

export const XINFA = {
  // 斩敌回气：已废弃（用户要求击杀不回真气）。保留条目只为兼容旧存档，不再有效果、不再掉落
  kill_mp: { id: "kill_mp", name: "斩敌回气", glyph: "气", desc: "（已失传）此心法不再生效", retired: !0 },
  dash_shadow: { id: "dash_shadow", name: "剑影", glyph: "影", desc: "闪身时留下剑影，片刻后爆开伤敌", trigger: "dashShadow", affix: !0 },
  crit_thunder: { id: "crit_thunder", name: "雷引", glyph: "引", desc: "暴击时引落天雷，追加金属性伤害", trigger: "critThunder", affix: !0 },
  fire_root: { id: "fire_root", name: "灵根·火", glyph: "炎", desc: "火行 +40，法力 +10%", mods: [{ stat: "fire", type: "flat", value: 40 }, { stat: "spell", type: "pct", value: 0.1 }] },
  vajra: { id: "vajra", name: "金刚体", glyph: "刚", desc: "防御 +20，气血上限 +25%", affix: !0, mods: [{ stat: "def", type: "flat", value: 20 }, { stat: "hp", type: "pct", value: 0.25 }] },
  sharp: { id: "sharp", name: "锋锐", glyph: "锐", desc: "暴击率 +15%，暴击伤害 +30%", affix: !0, mods: [{ stat: "crit", type: "flat", value: 0.15 }, { stat: "critDmg", type: "flat", value: 0.3 }] },
  // ---- 普攻流 / 身法（战斗 · 气势与身法 v1）：mods 里的 mom_* / momGain / chargeDmg / dashMax / dashCdr 由 src/game/player.js 读取结算，
  //      数值见 src/data/player.js MOMENTUM / CHARGE / MOM_XINFA
  mom_gather: { id: "mom_gather", name: "蓄势", glyph: "蓄", desc: "普攻积攒气势 +30%；蓄势斩（右键）伤害 +10%", mods: [{ stat: "momGain", type: "flat", value: 0.3 }, { stat: "chargeDmg", type: "flat", value: 0.1 }] },
  mom_chain: { id: "mom_chain", name: "连环", glyph: "环", desc: "普攻每段命中叠一层连环（3 秒，至多 5 层），每层普攻伤害 +4%；蓄势斩耗尽层数，每层再 +10%", mods: [{ stat: "mom_chain", type: "flat", value: 1 }] },
  mom_haste: { id: "mom_haste", name: "满势", glyph: "满", desc: "势成（气势满、尚未放出）时攻速 +15%、移速 +10%", affix: !0, mods: [{ stat: "mom_haste", type: "flat", value: 1 }] },
  mom_wave: { id: "mom_wave", name: "余波", glyph: "波", desc: "蓄势斩的月牙剑气行至尽头再炸开一圈余波（半径 2.8 米，0.9 倍攻击；半势按比例）", affix: !0, mods: [{ stat: "mom_wave", type: "flat", value: 1 }] },
  mom_return: { id: "mom_return", name: "回锋", glyph: "锋", desc: "蓄势斩命中敌人时返还 1 次闪身充能", affix: !0, mods: [{ stat: "mom_return", type: "flat", value: 1 }] },
  dash_flow: { id: "dash_flow", name: "流云", glyph: "云", desc: "闪身充能 +1，闪身冷却 -10%", affix: !0, mods: [{ stat: "dashMax", type: "flat", value: 1 }, { stat: "dashCdr", type: "flat", value: 0.1 }] },
  // 搜取（docs/ui/v2/搜取_v1.md）：神识 +30；探查完成时 10% 概率顺带探明下一格（src/game/run/containers.js 读 senseEcho）
  lingtai: { id: "lingtai", name: "灵台", glyph: "台", desc: "神识 +30；探查完成时有一成机会顺带探明下一格", mods: [{ stat: "sense", type: "flat", value: 30 }, { stat: "senseEcho", type: "flat", value: 0.1 }] },
};

// 丹药（数字键 1~4）
export const POTIONS = [
  { id: "mp_pill", name: "回气丹", glyph: "气", key: "Digit1", count: 5, cd: 4, mp: 40 }, // 真气与炼化增益 v1：50 → 40（真气不再自动回复）
  { id: "hp_pill", name: "回春丹", glyph: "春", key: "Digit2", count: 5, cd: 6, hot: 80, hotDur: 3 },
  null,
  null,
];

export const DEFAULT_LOADOUT = {
  spells: ["sword_qi", "fire_talisman", "vine"], // Q E R（按境界解锁栏位）
  realm: "zhuji", // 原型默认筑基，三个法术栏全开；构筑面板可切换境界体验解锁过程
  artifact: { id: "flying_sword", level: 1 },
  formation: "sword_array",
  xinfa: [],
};
