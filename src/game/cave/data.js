// 洞府数据（模块 C）：设施等级与升级花费、炼化比率、兜底物品与配方。
// 物品一律按"名称"引用，运行时用 itemId(名称) 解析成实际 id：
//   优先用内容模块（D）的 src/data/items_db.js 里同名物品；没有时才注册这里的兜底定义（id 与流程模块 A 的约定一致）。
// 配方优先读 D 的 src/data/recipes.js（格式见 normRecipes），没有时用这里的兜底配方。
import { ITEMS, registerItems } from "../../core/items.js";
// 内容模块的物品表（存在就先注册，保证同名物品用 D 的正式定义）
import.meta.glob("../../data/items_db.js", { eager: !0 });

// ---------------- 兜底物品（内容模块的正式定义永远优先） ----------------
const S = (v) => ({ size: 1, stack: 10, value: v });
export const CAVE_FALLBACK_ITEMS = [
  { id: "spirit_stone", name: "灵石", glyph: "灵", cat: "stone", size: 1, stack: 999, value: 1, desc: "修炼与炼器的根本" },
  { id: "qingling_cao", name: "青灵草", glyph: "草", cat: "herb", ...S(3), desc: "最常见的灵草" },
  { id: "ninglu_hua", name: "凝露花", glyph: "露", cat: "herb", ...S(4), desc: "清晨带露的灵花" },
  { id: "chiyan_guo", name: "赤炎果", glyph: "炎", cat: "herb", ...S(10), desc: "火属灵果" },
  { id: "hanlu_cao", name: "寒露草", glyph: "寒", cat: "herb", ...S(8) },
  { id: "zi_teng", name: "紫藤", glyph: "藤", cat: "herb", size: 2, stack: 5, value: 10 },
  { id: "heshouwu", name: "千年何首乌", glyph: "乌", cat: "herb", size: 2, stack: 1, value: 160, desc: "筑基丹辅药" },
  { id: "ling_tu", name: "灵土", glyph: "壤", cat: "ore", ...S(5) },
  { id: "tiejing_shi", name: "铁精石", glyph: "铁", cat: "ore", ...S(6) },
  { id: "lingyu", name: "灵玉", glyph: "玉", cat: "ore", ...S(20) },
  { id: "shuiling_yu", name: "水灵玉", glyph: "水", cat: "treasure", size: 1, stack: 5, value: 120, desc: "炼化可得 300 修为" },
  { id: "wolf_pelt", name: "狼皮", glyph: "皮", cat: "beast", ...S(5) },
  { id: "wolf_fang", name: "狼妖牙", glyph: "牙", cat: "beast", ...S(4) },
  { id: "bat_wing", name: "蝠翼", glyph: "翼", cat: "beast", ...S(8) },
  { id: "ling_si", name: "灵丝", glyph: "丝", cat: "beast", ...S(12) },
  { id: "mang_pi", name: "蟒皮", glyph: "蟒", cat: "beast", ...S(25) },
  { id: "wolf_core", name: "狼妖内丹", glyph: "丹", cat: "core", size: 1, stack: 5, value: 30 },
  { id: "wolfking_core", name: "狼王内丹", glyph: "王", cat: "core", size: 1, stack: 5, value: 120 },
  { id: "bat_core", name: "蝠妖内丹", glyph: "蝠", cat: "core", size: 1, stack: 5, value: 70 },
  { id: "bilin_core", name: "碧鳞内丹", glyph: "鳞", cat: "core", size: 2, stack: 1, value: 400, desc: "筑基丹主药" },
  { id: "wolfking_bone", name: "狼王遗骨", glyph: "骨", cat: "treasure", size: 4, stack: 1, value: 110 },
  { id: "qiannian_zhuxin", name: "千年竹心", glyph: "竹", cat: "treasure", size: 4, stack: 1, value: 260 },
  { id: "ding_shard", name: "炼器鼎残件", glyph: "鼎", cat: "quest", size: 2, stack: 1, value: 40, desc: "炼器鼎升阶所需" },
  { id: "huichun_dan", name: "回春丹", glyph: "春", cat: "pill", size: 1, stack: 5, value: 12, use: { hp: 80 }, desc: "3 秒回复 80 气血" },
  { id: "huiqi_dan", name: "回气丹", glyph: "气", cat: "pill", size: 1, stack: 5, value: 12, use: { mp: 50 }, desc: "回复 50 真气" },
  { id: "juqi_dan", name: "聚气丹", glyph: "聚", cat: "pill", size: 1, stack: 5, value: 40, use: { xp: [60, 90, 120, 180] }, desc: "服用增加修为（每个小境界最多 3 枚）" },
  { id: "humai_dan", name: "护脉丹", glyph: "脉", cat: "pill", size: 1, stack: 5, value: 40, use: { dmgTaken: -0.1 }, desc: "本局受到伤害 −10%" },
  { id: "zhuji_dan", name: "筑基丹", glyph: "基", cat: "pill", size: 1, stack: 1, value: 800, desc: "筑基必需" },
  { id: "fei_dan", name: "废丹", glyph: "渣", cat: "pill", size: 1, stack: 10, value: 1, desc: "炉火失控的残渣，可化灵" },
  { id: "dundi_fu", name: "遁地符", glyph: "遁", cat: "talisman", size: 1, stack: 5, value: 20, use: { extract: 12 }, desc: "捏碎后读条 12 秒遁回洞府，受击打断" },
  { id: "huqi_fu", name: "护器符", glyph: "护", cat: "talisman", size: 1, stack: 5, value: 30, desc: "本局保护一件装备，身陨不遗落" },
  { id: "qingling_miao", name: "青灵草苗", glyph: "苗", cat: "herb", ...S(2), seed: { herb: "青灵草", runs: 1, yield: [3, 5] }, desc: "种进药园，1 次出行后成熟" },
  { id: "ninglu_miao", name: "凝露花苗", glyph: "苗", cat: "herb", ...S(3), seed: { herb: "凝露花", runs: 1, yield: [3, 5] }, desc: "种进药园，1 次出行后成熟" },
  { id: "chiyan_miao", name: "赤炎果苗", glyph: "苗", cat: "herb", ...S(6), seed: { herb: "赤炎果", runs: 2, yield: [3, 4] }, desc: "种进药园，2 次出行后成熟" },
  { id: "rust_sword", name: "锈剑", glyph: "剑", cat: "gear", slot: "sword", size: 2, value: 4, base: [{ stat: "atk", type: "flat", value: 4 }], desc: "溪边捡到的一柄锈剑" },
  { id: "fajian", name: "法剑", glyph: "剑", cat: "gear", slot: "sword", size: 2, value: 30, base: [{ stat: "atk", type: "flat", value: 8 }] },
  { id: "fayi", name: "法衣", glyph: "衣", cat: "gear", slot: "robe", size: 2, value: 30, base: [{ stat: "hp", type: "flat", value: 40 }, { stat: "def", type: "flat", value: 4 }] },
  { id: "yupei", name: "玉佩", glyph: "佩", cat: "gear", slot: "jade", size: 2, value: 40, base: [{ stat: "mp", type: "flat", value: 20 }] },
];

// 名称 → 实际 id（D 的定义优先）
const byName = new Map();
export function itemId(name) {
  if (byName.has(name) && ITEMS[byName.get(name)]) return byName.get(name);
  const d = Object.values(ITEMS).find((x) => x.name === name);
  if (d) return byName.set(name, d.id), d.id;
  const f = CAVE_FALLBACK_ITEMS.find((x) => x.name === name);
  return f ? f.id : name;
}
export function itemName(id) {
  return (ITEMS[id] && ITEMS[id].name) || (CAVE_FALLBACK_ITEMS.find((x) => x.id === id) || {}).name || id;
}
export function ensureCaveItems() {
  // 同名或同 id 的物品已存在（内容 / 流程模块注册过）就不覆盖
  const names = new Set(Object.values(ITEMS).map((d) => d.name));
  registerItems(CAVE_FALLBACK_ITEMS.filter((d) => !ITEMS[d.id] && !names.has(d.name)));
}

// ---------------- 设施（§11.2、§11.3；玩法评审 G5：站点合并为 4 个） ----------------
// 可升级的设施（lv 0 = 残破 / 未建）；cost[i] 为升到 i+1 级的花费（名称 → 数量，"灵石" 用 stones），relocate：搬迁后才能升 / 搬迁自动升
export const FACILITIES = {
  spring: { name: "灵泉", glyph: "泉", start: 1, max: 3, desc: "炼化灵石、妖丹、灵物为修为；突破之所",
    cost: [null, { stones: 120, "凝露花": 6 }, { relocate: !0 }] },
  furnace: { name: "炼丹炉", glyph: "丹", start: 0, max: 2, desc: "炼丹（火候小游戏）", unlock: { realm: "1:2", recipes: ["huichun", "huiqi"] },
    cost: [null, { stones: 200, "铁精石": 15, "赤炎果": 3 }] },
  forge: { name: "炼器鼎", glyph: "鼎", start: 0, max: 2, desc: "炼装备、符箓、扩容；二级可滴血认主", unlock: { realm: "1:3", recipes: ["sword", "robe_cu"] },
    cost: [null, { stones: 180, "蝠翼": 6, "水灵玉": 1, "炼器鼎残件": 1, relocate: !0 }] },
  garden: { name: "药园", glyph: "园", start: 0, max: 3, desc: "移栽灵草种子，随出行次数生长，成熟后手动采收；升级多开地块、长得更快",
    cost: [{ stones: 50, "灵土": 3 }, { stones: 120, "灵土": 5 }, { stones: 240, "灵土": 8 }] },
};
export const TIER_MAX = 1 + 2 + 2 + 3; // 修缮度：设施等级之和超出起始值的部分
// 洞府里可交互的站点（5 个设施 + 天机镜台 + 内观阁）
export const STATIONS = {
  spring: { name: "灵泉·静室", short: "灵泉", glyph: "泉", key: "炼化 · 突破", desc: "炼化灵石、妖丹、灵物为修为；修为圆满在此突破" },
  workshop: { name: "丹器房", short: "丹器房", glyph: "丹", key: "炼丹 · 炼器", desc: "炼丹炉与炼器鼎；炼丹、炼器与修缮" },
  garden: { name: "药园", short: "药园", glyph: "园", key: "移栽 · 采收 · 扩建", desc: "移栽灵草，成熟后手动采收入仓" },
  storage: { name: "仓库", short: "仓库", glyph: "仓", key: "装备 · 参悟 · 化灵", desc: "存放、装备、参悟功法、化灵" },
  depart: { name: "出行台", short: "出行台", glyph: "行", key: "出行", desc: "选择区域、备战、出发" },
  mirror: { name: "天机镜台", short: "天机镜", glyph: "镜", key: "境界录 · 相册 · 行迹", desc: "石案上的铜镜，就是林墨的手机（天机镜）" },
  loadout: { name: "内观阁", short: "内观阁", glyph: "观", key: "属性 · 法器 · 功法 · 行囊", desc: "内观己身、整装备战；行囊预案与出行台共用" },
};
export const GARDEN_PLOTS = [0, 2, 4]; // 药园等级 → 地块；搬迁后 +2

// 灵泉炼化：1 灵石 → 修为（按灵泉等级）；妖丹 / 灵物按名称固定修为（§10.1）
export const REFINE = {
  stone: [0, 2, 3, 4],
  named: { "狼妖内丹": 40, "狼王内丹": 180, "蝠妖内丹": 90, "藤妖内丹": 90, "碧鳞内丹": 0, "狼王遗骨": 150, "水灵玉": 300, "千年竹心": 360 },
  // 其他妖丹 / 灵物：按灵值估算
  coreRate: 1.2,
  treasureRate: 1.4,
  meditate: 3, // 打坐演出秒数
};
export const JUQI_LIMIT = 3; // 每个小境界最多服用聚气丹枚数

// ---------------- 配方（§11.5、§11.6） ----------------
// 炼丹：inputs 名称 → 数量（"灵泉水" 为灵泉提供的药引，不消耗物品）；furnace 需要的炉等级；recipe 是否需要丹方（解锁旗标）
export const FALLBACK_ALCHEMY = [
  { id: "huichun", name: "回春丹", out: "回春丹", inputs: { "青灵草": 2, "凝露花": 1 }, furnace: 1, time: 15, band: 0.22, known: !0 },
  { id: "huiqi", name: "回气丹", out: "回气丹", inputs: { "凝露花": 2, "青灵草": 1 }, furnace: 1, time: 15, band: 0.22, known: !0 },
  { id: "juqi", name: "聚气丹", out: "聚气丹", inputs: { "狼妖内丹": 1, "青灵草": 3 }, furnace: 1, time: 18, band: 0.2, recipe: "丹方《聚气丹》" },
  { id: "humai", name: "护脉丹", out: "护脉丹", inputs: { "寒露草": 2, "紫藤": 1 }, furnace: 2, time: 20, band: 0.18, recipe: "丹方《护脉丹》" },
  { id: "zhuji", name: "筑基丹", out: "筑基丹", inputs: { "碧鳞内丹": 1, "千年何首乌": 1, "赤炎果": 3 }, furnace: 2, time: 25, band: 0.15, recipe: "丹方《筑基丹》", batchMax: 1 },
];
// 炼器：kind = gear（法剑 / 法衣 / 玉佩）| item（符箓等）| upgrade（扩容）
export const FALLBACK_FORGE = [
  { id: "sword", name: "法剑", kind: "gear", out: "法剑", outAlt: ["青锋剑", "竹影剑"], inputs: { "铁精石": 3, "狼妖牙": 2 }, stones: 20, forge: 1, known: !0 },
  { id: "robe", name: "法衣", kind: "gear", out: "法衣", outAlt: ["布法衣", "灵丝法衣"], inputs: { "狼皮": 3, "紫藤": 1 }, stones: 20, forge: 1, recipe: "器方《法衣》" },
  { id: "jade", name: "玉佩", kind: "gear", out: "玉佩", outAlt: ["青玉佩", "水灵佩"], inputs: { "灵玉": 2, "狼妖内丹": 1 }, stones: 40, forge: 1, recipe: "器方《玉佩》", realm: "1:5" },
  { id: "dundi", name: "遁地符 ×2", kind: "item", out: "遁地符", n: 2, inputs: { "凝露花": 1 }, stones: 20, forge: 1, known: !0 },
  { id: "huqi", name: "护器符", kind: "item", out: "护器符", n: 1, inputs: { "狼皮": 2 }, stones: 40, forge: 1, flag: "region2" },
  { id: "bag24", name: "灵丝储物袋（24 格）", kind: "upgrade", target: "bag", value: 24, inputs: { "灵丝": 3, "狼皮": 4 }, stones: 80, forge: 1, realm: "1:3" },
  { id: "bag32", name: "鹿皮乾坤袋（32 格）", kind: "upgrade", target: "bag", value: 32, inputs: { "蟒皮": 2, "灵丝": 4 }, stones: 200, forge: 1, realm: "1:7", needs: 24 },
  { id: "pouch2", name: "灵丝锦囊（2 格）", kind: "upgrade", target: "pouch", value: 2, inputs: { "灵丝": 2 }, stones: 60, forge: 1, realm: "1:4" },
  { id: "pill_cap", name: "丹药囊扩容（每格 +1）", kind: "upgrade", target: "pillCap", value: 1, inputs: { "狼皮": 4 }, stones: 80, forge: 1, max: 2 },
];

// 读取 D 的配方表（导出名与字段名都做了兼容）；任何字段对不上就返回 null 用兜底
export function normRecipes(mod) {
  if (!mod) return null;
  const pick = (...names) => names.map((n) => mod[n]).find((x) => x);
  const conv = (list, kind) =>
    (Array.isArray(list) ? list : Object.values(list || {})).map((r) => {
      const ins = r.inputs || r.materials || r.ingredients || r.cost || {};
      const inputs = {};
      if (Array.isArray(ins)) for (const x of ins) inputs[itemName(x.id || x.item || x.name)] = x.n || x.count || 1;
      else for (const [k, v] of Object.entries(ins)) inputs[ITEMS[k] ? ITEMS[k].name : k] = v;
      const out = r.out || r.output || r.result || r.product;
      const outName = typeof out === "string" ? itemName(out) : out ? itemName(out.id || out.item) : r.name;
      return { ...r, kind: r.kind || kind, inputs, out: outName, n: r.n || (out && out.n) || 1 };
    });
  const alc = pick("ALCHEMY", "alchemy", "PILLS", "PILL_RECIPES");
  const frg = pick("FORGE", "forge", "CRAFT", "FORGE_RECIPES");
  if (!alc && !frg) return null;
  return { alchemy: alc ? conv(alc, "pill") : null, forge: frg ? conv(frg, "gear") : null };
}

// ---------------- 装备生成（§8.5 词条；D 有 loot 生成器时优先用它） ----------------
export const AFFIX_POOL = {
  sword: [["atk", "flat", [3, 6, 10]], ["spell", "pct", [0.06, 0.1, 0.15]], ["crit", "flat", [0.03, 0.05, 0.08]], ["metal", "flat", [10, 20, 35]]],
  robe: [["hp", "flat", [30, 60, 100]], ["def", "flat", [4, 8, 12]], ["mp", "flat", [12, 20, 30]], ["extractTime", "pct", [-0.1, -0.15, -0.25]], ["water", "flat", [10, 20, 35]]],
  jade: [["atk", "flat", [3, 6, 10]], ["hp", "flat", [30, 60, 100]], ["cdr", "flat", [0.04, 0.06, 0.1]], ["crit", "flat", [0.03, 0.05, 0.08]], ["bagCells", "flat", [2, 3, 4]], ["wood", "flat", [10, 20, 35]]],
};
export const STAT_NAME = {
  atk: "攻击", spell: "法力", crit: "暴击率", hp: "气血", def: "防御", mpRegen: "真气回复", cdr: "冷却缩减", metal: "金行", wood: "木行", water: "水行", fire: "火行", earth: "土行",
  extractTime: "撤离读条", bagCells: "储物袋格", mp: "真气",
  sense: "神识", senseEcho: "顺探", aspd: "攻速", momGain: "气势获取", chargeDmg: "蓄势斩伤害", dashCdr: "闪身冷却缩减", dashMax: "闪身充能",
};
