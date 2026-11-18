// 配方与洞府数值（内容模块 D）：依据《最小闭环设计》§11、§12。洞府模块（C）读取本文件。
//
// 通用：物品一律用 id（src/data/items_db.js）；stones = 灵石数量；
//       known: true 开局就会；recipe: 物品 id —— 需要先参悟 / 习得该丹方或器方（C 记在 profile.flags.recipes[物品 id]）；
//       realm: "stage:layer" 至少到该境界；flag: 需要的剧情旗标（"region2" = 已到过竹海·溪谷）
//
// ALCHEMY 炼丹：{ id, name, out: 丹药 id, n: 每炉产出, inputs: { id: 数量 }, water: 灵泉水份数（灵泉自取，不消耗仓库物品）,
//                 furnace: 需要的炼丹炉等级, time: 火候小游戏时长（秒）, band: 火候带宽（占刻度比例，越小越难）, batchMax: 一次最多几炉 }
//   火候品质：HEAT.grades —— 指针在火候带内的时间占比 < 40% 废丹，40–60 凡品，60–80 灵品，80–95 宝品，≥ 95 仙品（叫法只用 RARITY 一套，2026-11-17 用户）
//   品质写进丹药实例的 rarity（0 凡 1 灵 2 宝 3 仙）；聚气丹的修为按品质取 use.xp[rarity]；熟练（同方炼成 HEAT.masteryAfter 次）可跳过小游戏直接出灵品
// FORGE 炼器：{ id, name, kind, out, n, inputs, stones, forge: 炼器鼎等级, … }
//   kind "gear"     装备：out 为装备底材 id；品质 = 材料品质与炼器鼎等级决定（C 实现），属性由 src/game/loot.js 生成（rollAffixes / gearStats）
//   kind "item"     符箓等普通物品
//   kind "upgrade"  扩容：target "bag" 储物袋格数 / "pouch" 贴身锦囊格数 / "pillCap" 每丹药栏枚数 +value；needs 需要当前已达到的格数；max 最多次数
//   kind "imbue"    法剑附灵（评审 G10）：给选中的法剑加 / 换一条词条 { stat: "imbue_<element>", type: "flat", value: 1 }（每把剑只有一条附灵，重做会替换）
//   kind "bind"     滴血认主：永久保护 1 件装备，代价 stones + 下一局气血上限 −10%（bloodDebuff）
// FACILITIES 设施升级：cost[i] = 从 i 级升到 i+1 级的花费 { stones, items: { id: n } }；relocate: 搬迁后才能升 / auto: 搬迁后自动升级
// REFINE 灵泉炼化：stone[灵泉等级] = 每块灵石的修为；妖丹 / 灵物的修为写在物品定义 xp 字段（items_db.js），这里 named 按 id 列出便于查
// GARDEN 药园：plots[药园等级] 地块数（搬迁后 +relocateBonus）；seeds 成熟所需出行次数与产量；采集带根概率 seedChance / 完整品 seedChancePerfect

import { defOf, valueOf } from "../core/items.js";

export const HEAT = {
  time: [15, 25],
  grades: [
    [0.4, -1, "废丹"],
    [0.6, 0, "凡品"],
    [0.8, 1, "灵品"],
    [0.95, 2, "宝品"],
    [1.01, 3, "仙品"],
  ],
  masteryAfter: 5, // 同一丹方成功 5 次后可"熟练炼制"直接出灵品
  herbBand: [1, 1.1, 1.2, 1.35, 1.5], // 药园与重铸 v1：火候带宽 × herbBand[投入灵草里最高的品质]（灵草品质的用处之一）
  wasteItem: null, // 废丹不产出物品
};

export const ALCHEMY = [
  { id: "huichun", name: "回春丹", out: "huichun_dan", n: 2, inputs: { qingling_cao: 2, ninglu_hua: 1, gu_fen: 1 }, water: 1, furnace: 1, time: 15, band: 0.24, batchMax: 3, known: !0 },
  { id: "huiqi", name: "回气丹", out: "huiqi_dan", n: 3, inputs: { ninglu_hua: 2, qingling_cao: 1, ya_yu: 1 }, water: 1, furnace: 1, time: 15, band: 0.24, batchMax: 3, known: !0 },
  { id: "juqi", name: "聚气丹", out: "juqi_dan", n: 1, inputs: { wolf_core: 2, qingling_cao: 3 }, water: 1, furnace: 1, time: 18, band: 0.2, batchMax: 3, recipe: "danfang_juqi" },
  // 区域二的妖丹也能炼聚气丹（数值评审：搬家后不断供）
  { id: "juqi_vine", name: "聚气丹（藤心方）", out: "juqi_dan", n: 1, inputs: { vine_core: 2, hanlu_cao: 3 }, water: 1, furnace: 1, time: 18, band: 0.2, batchMax: 3, recipe: "danfang_juqi" },
  { id: "juqi_bat", name: "聚气丹（蝠丹方）", out: "juqi_dan", n: 1, inputs: { bat_core: 2, hanlu_cao: 3 }, water: 1, furnace: 1, time: 18, band: 0.2, batchMax: 3, recipe: "danfang_juqi" },
  // 怪物生态 v1：低阶怪的日常材料进配方——碎丹方（妖丹碎片 12）、回气丹寒露方（区域二的寒蟾酥）
  { id: "juqi_sui", name: "聚气丹（碎丹方）", out: "juqi_dan", n: 1, inputs: { dan_sui: 12, qingling_cao: 3 }, water: 1, furnace: 1, time: 18, band: 0.2, batchMax: 3, recipe: "danfang_juqi" },
  { id: "huiqi_r2", name: "回气丹（寒露方）", out: "huiqi_dan", n: 3, inputs: { hanlu_cao: 2, chan_su: 1 }, water: 1, furnace: 1, time: 15, band: 0.24, batchMax: 3, known: !0, flag: "region2" },
  { id: "humai", name: "护脉丹", out: "humai_dan", n: 1, inputs: { hanlu_cao: 2, zi_teng: 1, du_nang: 1, she_tui: 1 }, water: 1, furnace: 2, time: 20, band: 0.18, batchMax: 2, recipe: "danfang_humai" },
  { id: "ningshen", name: "凝神丹", out: "ningshen_dan", n: 1, inputs: { ninglu_hua: 3, hanlu_cao: 1 }, water: 1, furnace: 1, time: 16, band: 0.2, batchMax: 3, known: !0 }, // 搜取 v1：本局神识 +20
  { id: "zhuji", name: "筑基丹", out: "zhuji_dan", n: 1, inputs: { bilin_core: 1, heshouwu: 1, chiyan_guo: 3 }, water: 3, furnace: 2, time: 25, band: 0.15, batchMax: 1, recipe: "danfang_zhuji", minGrade: 0 },
];

export const FORGE = [
  // 装备
  { id: "sword", name: "青锋剑", kind: "gear", out: "sword_qingfeng", inputs: { tiejing_shi: 3, wolf_fang: 2 }, stones: 20, forge: 1, known: !0 },
  { id: "robe_cu", name: "粗布衣", kind: "gear", out: "robe_cu", inputs: { wolf_hide: 2, qingling_cao: 1 }, stones: 10, forge: 1, gift: !0 }, // gift：只靠设施解锁时赠送才会。炼器鼎解锁时送的基础器方（比布法衣低一档，数值策划 2026-11-17）
  { id: "robe", name: "布法衣", kind: "gear", out: "robe_bu", inputs: { wolf_hide: 3, qingling_cao: 2 }, stones: 20, forge: 1, recipe: "qifang_robe" },
  { id: "jade", name: "青玉佩", kind: "gear", out: "jade_qing", inputs: { ling_yu: 2, wolf_core: 1 }, stones: 40, forge: 1, known: !0, realm: "1:5" },
  { id: "sword2", name: "竹影剑", kind: "gear", out: "sword_zhuying", inputs: { tiejing_shi: 4, bat_wing: 2, du_nang: 1 }, stones: 60, forge: 1, known: !0, realm: "1:5" },
  { id: "robe2", name: "灵丝法衣", kind: "gear", out: "robe_lingsi", inputs: { bat_wing: 2, she_tui: 2, ling_si: 2 }, stones: 60, forge: 1, recipe: "qifang_robe", realm: "1:5" },
  // 青牙剑（青牙 v2）：只有斩过青牙才有青牙之牙，所以直接"已知"
  { id: "sword_qingya", name: "青牙剑", kind: "gear", out: "sword_qingya", inputs: { qingya_fang: 1, tiejing_shi: 6, wolf_fang: 6 }, stones: 120, forge: 1, known: !0 },
  // 异种装备（怪物生态 v1）：主材是宝品的异种心 → 炼出来至少宝品
  { id: "jade_chilang", name: "赤狼佩", kind: "gear", out: "jade_chilang", inputs: { chilang_xin: 1, ling_yu: 2, wolf_fang: 5 }, stones: 60, forge: 1, recipe: "qifang_chilang" },
  { id: "robe_xuanbat", name: "玄蝠法衣", kind: "gear", out: "robe_xuanbat", inputs: { xuanbat_xin: 1, ling_si: 4, she_tui: 4 }, stones: 120, forge: 1, recipe: "qifang_xuanbat" },
  { id: "jade2", name: "水灵佩", kind: "gear", out: "jade_shuiling", inputs: { water_jade: 1, bat_core: 1 }, stones: 80, forge: 1, known: !0, realm: "1:5" },
  // 符箓
  { id: "dundi", name: "遁地符 ×2", kind: "item", out: "dundi_fu", n: 2, inputs: { ninglu_hua: 1, ya_yu: 1 }, stones: 10, forge: 1, known: !0 },
  // 五行符（评审 G10）：3 张一组，一次性破盾手段
  { id: "fu_metal", name: "金符 ×3", kind: "item", out: "fu_metal", n: 3, inputs: { tiejing_shi: 1, ninglu_hua: 1, gu_fen: 1 }, stones: 10, forge: 1, known: !0 },
  { id: "fu_wood", name: "木符 ×3", kind: "item", out: "fu_wood", n: 3, inputs: { qingling_cao: 2, ninglu_hua: 1, gu_fen: 1 }, stones: 10, forge: 1, known: !0 },
  { id: "fu_water", name: "水符 ×3", kind: "item", out: "fu_water", n: 3, inputs: { ninglu_hua: 2, gu_fen: 1 }, stones: 10, forge: 1, known: !0 },
  { id: "fu_fire", name: "火符 ×3", kind: "item", out: "fu_fire", n: 3, inputs: { chiyan_guo: 1, ninglu_hua: 1, gu_fen: 1 }, stones: 10, forge: 1, known: !0 },
  { id: "fu_earth", name: "土符 ×3", kind: "item", out: "fu_earth", n: 3, inputs: { ling_tu: 2, ninglu_hua: 1, gu_fen: 1 }, stones: 10, forge: 1, known: !0 },
  { id: "huqi", name: "护器符", kind: "item", out: "huqi_fu", n: 1, inputs: { wolf_hide: 2 }, stones: 25, forge: 1, known: !0, flag: "region2" },
  // 扩容
  { id: "bag24", name: "兽皮储物袋（24 格）", kind: "upgrade", target: "bag", value: 24, needs: 16, inputs: { wolf_hide: 6, ling_tu: 2 }, stones: 80, forge: 1, known: !0, realm: "1:3" },
  { id: "bag32", name: "蟒皮乾坤袋（32 格）", kind: "upgrade", target: "bag", value: 32, needs: 24, inputs: { python_skin: 1, she_tui: 3, ling_si: 4 }, stones: 150, forge: 1, known: !0, realm: "1:7" },
  { id: "pouch2", name: "灵蚌锦囊（2 格）", kind: "upgrade", target: "pouch", value: 2, needs: 1, inputs: { wolf_hide: 2, lingbang_zhu: 1 }, stones: 60, forge: 1, known: !0, realm: "1:4" },
  { id: "pouch3", name: "乾坤锦囊（3 格）", kind: "upgrade", target: "pouch", value: 3, needs: 2, inputs: { jinnang_qiankun: 1 }, stones: 0, forge: 1, known: !0 },
  { id: "pill_cap", name: "丹药囊扩容（每栏 +1 枚）", kind: "upgrade", target: "pillCap", value: 1, inputs: { wolf_hide: 4 }, stones: 80, forge: 1, known: !0, max: 2 },
  // 法剑附灵（评审 G10）
  { id: "imbue_metal", name: "附灵·金", kind: "imbue", element: "metal", target: "sword", inputs: { tiejing_shi: 4, wolf_fang: 2 }, stones: 60, forge: 1, known: !0 },
  { id: "imbue_wood", name: "附灵·木", kind: "imbue", element: "wood", target: "sword", inputs: { qingling_cao: 5, wolf_core: 1 }, stones: 60, forge: 1, known: !0 },
  { id: "imbue_water", name: "附灵·水", kind: "imbue", element: "water", target: "sword", inputs: { ninglu_hua: 5, lingbang_zhu: 1 }, stones: 60, forge: 1, known: !0 },
  { id: "imbue_fire", name: "附灵·火", kind: "imbue", element: "fire", target: "sword", inputs: { chiyan_guo: 3, bat_core: 1 }, stones: 80, forge: 1, known: !0 },
  { id: "imbue_earth", name: "附灵·土", kind: "imbue", element: "earth", target: "sword", inputs: { ling_tu: 4, stone_heart: 2 }, stones: 60, forge: 1, known: !0 },
  // 认主
  { id: "bind", name: "滴血认主", kind: "bind", inputs: {}, stones: 100, forge: 2, known: !0, bloodDebuff: 0.1 },
];

export const FACILITIES = {
  spring: { name: "灵泉", start: 1, max: 3, cost: [null, { stones: 120, items: { ninglu_hua: 6 } }, { auto: !0, relocate: !0 }] },
  // 丹炉 / 炼器鼎按修为解锁（2026-11-17 用户："材料解锁太慢，前期缺乏杀怪动力"）：unlock.realm 突破到该层时自动到 1 阶（旧存档进洞府补），
  //   并送 unlock.recipes（配方 id，已会的不重复送）；cost[0] 为 null（不再用材料修复）。原修复材料并进 1→2 阶（数值策划确认）
  furnace: { name: "炼丹炉", start: 0, max: 2, unlock: { realm: "1:2", recipes: ["huichun", "huiqi"] }, cost: [null, { stones: 200, items: { tiejing_shi: 15, chiyan_guo: 3 } }] },
  forge: { name: "炼器鼎", start: 0, max: 2, unlock: { realm: "1:3", recipes: ["sword", "robe_cu"] }, cost: [null, { stones: 180, items: { bat_wing: 6, water_jade: 1, furnace_part: 1 }, relocate: !0 }] },
  // 药园 v2（docs/review/numeric/药园与重铸_v1.md）：0 级开局就能用（1 块地）；升级加地块与生长速度（GARDEN.plots / growth）；灵土是扩建材料
  garden: { name: "药园", start: 0, max: 3, cost: [{ stones: 50, items: { ling_tu: 3 } }, { stones: 100, items: { ling_tu: 6 } }, { stones: 200, items: { ling_tu: 10, hanlu_cao: 4 }, relocate: !0 }] },
};

export const REFINE = {
  stone: [0, 2, 3, 4],
  named: { wolf_core: 25, golem_core: 28, wolfking_core: 180, bat_core: 60, vine_core: 60, bilin_core: 0, wolfking_bone: 70, lingbang_zhu: 30, water_jade: 200, zhuxin: 250, ling_yu: 20 }, // 数值评审；经济复核 v1：灵物按品质加成（下）
  // 经济复核 v1：灵物（cat "treasure"）的炼化修为 = xp × treasureRarity[品质] × 数量（凡 / 灵 ×1、宝 ×1.3、仙 ×1.7、极 ×2.2）
  //   灵光点灵物的品质改成随机（loot.js GATHER 的 _q1/_q2/_q3）；按权重算的期望修为与改前固定品质时持平。妖丹不乘（品质固定）
  treasureRarity: [1, 1, 1.3, 1.7, 2.2],
  // 灵气充盈（真气与炼化增益 v1）：在灵泉炼化后获得的临时增益
  //   档位按"本次炼化得到的修为 ÷ 炼化开始时这一层升下一层所需修为"（ratio）取不超过它的最高一档；
  //   持续时间只在出行局内计时（洞府里不消耗）；不叠加：新档 ≥ 旧档时替换并刷新时长，否则保留旧档、刷新为两者时长的较大值
  //   mods 走 Stats：vuln（受害方易伤，负数 = 减伤，与护脉丹同一乘区）、hp / atk 百分比
  buff: {
    name: "灵气充盈",
    tiers: [
      { ratio: 0.1, sec: 300, label: "一", mods: [{ stat: "vuln", type: "flat", value: -0.04 }] },
      { ratio: 0.25, sec: 300, label: "二", mods: [{ stat: "vuln", type: "flat", value: -0.06 }, { stat: "hp", type: "pct", value: 0.03 }] },
      { ratio: 0.45, sec: 360, label: "三", mods: [{ stat: "vuln", type: "flat", value: -0.08 }, { stat: "hp", type: "pct", value: 0.05 }] },
      { ratio: 0.7, sec: 420, label: "四", mods: [{ stat: "vuln", type: "flat", value: -0.1 }, { stat: "hp", type: "pct", value: 0.06 }, { stat: "atk", type: "pct", value: 0.03 }] },
      { ratio: 1.0, sec: 480, label: "五", mods: [{ stat: "vuln", type: "flat", value: -0.12 }, { stat: "hp", type: "pct", value: 0.08 }, { stat: "atk", type: "pct", value: 0.05 }] },
    ],
  },
};

// 化灵（经济复核 v1，docs/review/numeric/经济复核_v1.md）：把东西化为灵石。
//   灵值（core/items.js valueOf）只是"这件东西值多少"的统一刻度（风险显示、结算、委托"满载而归"），不是货币；灵石才是货币。
//   规则（HUALING.stones(inst) 就是洞府 huaLingStones 该返回的值）：
//   1) 不可化灵：tags 含 "key" 的关键物品、never 里的 id、灵石本身 → 0
//   2) 本来就用于修为的东西：妖丹 / 灵物（xp；灵物再 × REFINE.treasureRarity[品质]）灵石 = 修为 × fromXp；聚气丹（use.xp[品质]）× fromXpPill（× 数量）
//      灵泉最高 4 修为 / 灵石 → 妖丹灵物化灵再炼化最多拿回 80%（灵泉一级 40%）——直接炼化永远更划算，化灵只为换灵石升设施
//      聚气丹单独压低：2 枚狼妖内丹（直接炼化 50）→ 仙品聚气丹 → 化灵 12 灵石 = 48 修为，不能借炼丹把妖丹"洗"成更多修为
//   3) 其他：灵石 = min(灵值 × rate[类别] × rarityMul[品质], cap[品质] × 数量)，向下取整
//      rarityMul 抵消灵值里过陡的品质倍率（凡 1 / 灵 3 / 宝 10 / 仙 40 / 极 200）：化灵的实际倍率 = 1 / 2.4 / 4 / 10 / 20
//      cap 是每件（每份）的封顶，防止高价法宝 / 炼器出高品质时被拿来刷灵石→修为
//   参照（区域一出行一局带回约 150 灵石）：凡品剑 4、灵品 13、宝品 18（区域二竹影剑七级宝品 60）、仙品 150 封顶；材料一份约 1–4
export const HUALING = {
  rate: { gear: 0.25, artifact: 0.004, scroll: 0.1, recipe: 0.1, herb: 0.25, ore: 0.25, beast: 0.25, talisman: 0.3, pill: 0.15, core: 0, treasure: 0, default: 0.2 },
  rarityMul: [1, 0.8, 0.4, 0.25, 0.1],
  cap: [10, 25, 60, 150, 300],
  fromXp: 0.2,
  fromXpPill: 0.07,
  never: ["spirit_stone", "zhuji_dan", "bilin_core", "heshouwu"],
  stones(inst) {
    const d = defOf(inst);
    if (!d || d.quest || d.cat === "quest" || d.cat === "stone" || this.never.includes(inst.id) || (d.tags || []).includes("key") || (inst.tags || []).includes("key")) return 0;
    const n = inst.n || 1, r = Math.max(0, Math.min(4, inst.rarity || 0));
    const xp = typeof d.xp === "number" ? d.xp : d.use && d.use.xp != null ? (Array.isArray(d.use.xp) ? d.use.xp[Math.min(d.use.xp.length - 1, r)] : d.use.xp) : 0;
    if (xp > 0) return Math.floor(xp * n * (d.cat === "treasure" ? REFINE.treasureRarity[r] : 1) * (d.cat === "pill" ? this.fromXpPill : this.fromXp));
    const rate = this.rate[d.cat] ?? this.rate.default;
    return Math.floor(Math.min(valueOf(inst) * rate * this.rarityMul[r], this.cap[r] * n));
  },
};

// 药园 v2（docs/review/numeric/药园与重铸_v1.md；洞府组按这里的字段实现）
//   地块：plots[药园等级]（0 级开局 1 块）；搬到区域二后药园 ≥ 1 级再 +relocateBonus 块
//   品级只有一套（core/items.js RARITY）：0 凡品 / 1 灵品 / 2 宝品 / 3 仙品 / 4 极品。灵草品质、种子品质都用它；
//   种子"年份"只是种子品级的别名：凡品 = 十年、灵品 = 五十年、宝品 = 百年、仙品 = 三百年、极品 = 千年（显示用 years）
//   成熟所需出行次数 = ceil(seeds[id].runs × yearRuns[种子年份] / growth[药园等级] / (施了灵土 ? fertilize.mul : 1))，至少 1
//   施灵土：种下时可选，消耗 fertilize.n[种子年份] 份灵土（十年种子不需要也不能施）
//   收获：数量 = seeds[id].yield；品质 = 种子年份 + (−1 / 0 / +1，概率 harvestQuality)，夹在 0–4；harvestSeed 概率再得 1 颗同年份种子
//   采集掉种子（loot.js GATHER 的灵草按品质分档，已按下面三张表生成，C / E 不用再算）：
//     herbQuality[区域] 采集点灵草品质权重；seedDrop[灵草品质] 掉种子的概率；seedRarity[灵草品质] 种子年份权重
//     灵田（奇遇）：品质整体高 lingtianShift 档，掉种子概率 + lingtianSeedBonus
//     herbTideShift：暮 / 夜采集时灵草品质再升一档的概率（需要掉落模块把天时传给 rollLoot，未接线前不生效）
export const GARDEN = {
  plots: [1, 2, 3, 4],
  growth: [1, 1.25, 1.6, 2],
  relocateBonus: 1,
  years: ["十年", "五十年", "百年", "三百年", "千年"],
  yearRuns: [1, 1.5, 2.5, 4, 7],
  fertilize: { item: "ling_tu", n: [0, 1, 2, 3, 4], mul: 1.5, alt: { item: "gu_fen", per: 2 } }, // 怪物生态 v1：骨粉 2 份可抵 1 份灵土
  harvestQuality: [0.15, 0.7, 0.15],
  harvestSeed: 0.3,
  herbQuality: { r1: [75, 20, 5, 0, 0], r2: [60, 28, 10, 2, 0], tutorial: [100, 0, 0, 0, 0] },
  seedDrop: [0.2, 0.3, 0.4, 0.5, 0.6],
  seedRarity: [
    [85, 14, 1, 0, 0],
    [50, 40, 9, 1, 0],
    [20, 45, 30, 5, 0],
    [5, 25, 45, 22, 3],
    [0, 10, 40, 40, 10],
  ],
  lingtianShift: 1,
  lingtianSeedBonus: 0.15,
  herbTideShift: { dusk: 0.15, night: 0.3 },
  seedChance: 0.25, // 旧字段（v1），已由 seedDrop 取代
  seeds: {
    seed_qingling: { herb: "qingling_cao", runs: 1, yield: [3, 5] },
    seed_ninglu: { herb: "ninglu_hua", runs: 1, yield: [3, 5] },
    seed_hanlu: { herb: "hanlu_cao", runs: 1, yield: [3, 5] },
    seed_ziteng: { herb: "zi_teng", runs: 2, yield: [2, 3] },
    seed_chiyan: { herb: "chiyan_guo", runs: 2, yield: [3, 4] },
  },
};

// 炼器鼎·重铸词条（docs/review/numeric/药园与重铸_v1.md；洞府组按这里的字段实现）——灵石的中后期主要去处
//   选中装备上的一条词条，重新掷属性与数值：属性从该栏位的词条池（loot.js AFFIXES）里抽，排除这件装备已有的属性；
//   数值按装备品质档（灵 / 宝 / 仙 → vals[0/1/2]，极品按仙）× 0.85–1.15，需要区域系数的乘 REGION_COEF(装备等级)——与掉落时 rollAffixes 规则相同
//   价格 = stones[品质] × min(growth ^ inst.reforged, maxMul)，向上取整；另付 items[品质]；成功后 inst.reforged += 1
//   特殊词条（stat "special"，心法类）：special.mode "swap" = 只能换成另一条特殊词条（SPECIAL_AFFIXES 里排除已有的），价格 × special.costMul
//   附灵词条（imbue_*）不能重铸（走附灵配方）；凡品没有词条，不能重铸；需要炼器鼎 forge 级（极品需要 forgeTop 级）
export const REFORGE = {
  forge: 1,
  forgeTop: 2,
  stones: [null, 30, 80, 200, 500],
  items: [null, { wolf_fang: 2, gu_fen: 2 }, { dan_sui: 3, tiejing_shi: 2 }, { dan_sui: 6, ling_yu: 2 }, { dan_sui: 10, ling_yu: 3, water_jade: 1 }], // 怪物生态 v1：低阶怪的材料是重铸的主材
  growth: 1.15,
  maxMul: 4,
  special: { mode: "swap", costMul: 2 },
  imbue: "locked",
};

// §12 丹药限制：丹药栏数见 progression.js unlocks.pillSlots；每栏枚数 / 冷却 / 聚气丹上限
export const PILL_RULES = {
  perSlot: 3,
  perSlotMax: 5,
  cooldown: { huichun_dan: 6, huiqi_dan: 4 },
  juqiPerLayer: 3,
  preRun: ["humai_dan", "ningshen_dan"], // 出行前服用（不占丹药栏）
};
