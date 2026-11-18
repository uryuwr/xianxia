// 物品（共享契约）：物品定义表 ITEMS 由内容模块填充（src/data/items_db.js），这里只定义格式与通用工具。
//
// 物品定义 def：
//   id, name, cat 类别：
//     "stone" 灵石 | "herb" 灵草 | "ore" 矿石 | "beast" 妖兽材料 | "core" 妖丹 | "treasure" 大件灵物
//     "gear" 装备（法剑 / 法衣 / 玉佩）| "artifact" 法宝 | "scroll" 功法残卷 | "recipe" 丹方 / 器方 / 阵盘
//     "pill" 丹药 | "talisman" 符箓 | "quest" 剧情物品
//   size 占格（1 | 2 | 4），stack 最大堆叠（默认 1），value 基础灵值（灵石），glyph 图标大字，desc
//   gear / artifact：slot（"sword" 法剑 | "robe" 法衣 | "jade" 玉佩 | "artifact" 法宝），base（基础属性加成数组，见 Stats mods）
//   pill / talisman：use（效果描述对象，由使用方解释，如 { hp: 80 } { mp: 50 } { xp: 120 } { extract: 12 } }）
//   scroll：teaches（法术 / 心法 id）；recipe：unlocks（配方 id）
//
// 物品实例 inst（存档里保存的是实例）：
//   { uid, id, n 数量, rarity 品质 0 凡 1 灵 2 宝 3 仙 4 极品, level 物品等级, affixes: [{ stat, type, value }], identified, bound 认主, tags }
export const RARITY = [
  { id: 0, name: "凡品", color: "#6a6760", valueMul: 1, affixes: 0 },
  { id: 1, name: "灵品", color: "#3fae7a", valueMul: 3, affixes: 1 },
  { id: 2, name: "宝品", color: "#2f7fa8", valueMul: 10, affixes: 2 },
  { id: 3, name: "仙品", color: "#c9a040", valueMul: 40, affixes: 3 },
  { id: 4, name: "极品", color: "#d2321e", valueMul: 200, affixes: 3 },
];

export const ITEMS = {}; // id → def（内容模块用 registerItems 填充）
export function registerItems(defs) {
  for (const d of Array.isArray(defs) ? defs : Object.values(defs)) ITEMS[d.id] = { size: 1, stack: 1, value: 1, ...d };
}

let uidSeq = Date.now() % 1e6;
export function makeItem(id, o = {}) {
  const def = ITEMS[id];
  if (!def) throw new Error("unknown item " + id);
  const rarity = o.rarity ?? def.rarity ?? 0;
  return {
    uid: "i" + (uidSeq++).toString(36),
    id,
    n: o.n ?? 1,
    rarity,
    level: o.level ?? def.level ?? 1,
    affixes: o.affixes ?? [],
    // 宝品以上的装备、法宝、功法残卷掉落时未鉴定
    identified: o.identified ?? !(rarity >= 2 && ["gear", "artifact", "scroll"].includes(def.cat)),
    bound: !!o.bound,
    tags: o.tags ?? [],
  };
}
export const defOf = (inst) => ITEMS[inst.id];
export const sizeOf = (inst) => (defOf(inst) || {}).size || 1;
// 灵值：基础灵值 × 品质倍率 × 数量 ×（1 + 0.1×(等级−1)）
export function valueOf(inst) {
  const d = defOf(inst);
  if (!d) return 0;
  return Math.round(d.value * RARITY[inst.rarity || 0].valueMul * (inst.n || 1) * (1 + 0.1 * ((inst.level || 1) - 1)));
}
export function canStack(a, b) {
  const d = defOf(a);
  return a.id === b.id && a.rarity === b.rarity && (d.stack || 1) > 1 && !a.affixes.length && !b.affixes.length && a.identified && b.identified;
}
