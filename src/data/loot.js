import { GARDEN } from "./recipes.js";
import { WEAPON_EFFECTS } from "./items.js";
import { pageId, bookId } from "./gongfa.js";
// 掉落表（内容模块 D）：依据《最小闭环设计》§8.4–§8.6、§9、§10。逻辑见 src/game/loot.js（rollLoot）。
//
// 掉落条目（SOURCES[来源] 是条目数组，逐条独立判定）：
//   { stones: [最少, 最多], chance }                 灵石（× 区域灵石倍率 REGION_LOOT[r].stoneMul）
//   { mat: "common" | "rare" | "glow", n: [a, b], chance, picks }  从区域材料池抽 picks 次（默认 1）
//   { mat: "mob" }   击杀者的专属材料（REGION_LOOT[r].mobMats[类型]，没有就抽 common）
//   { mat: "core" }  精英妖丹（CORE_OF[类型]）
//   { chest: 来源 }   再按另一个来源掉一次（遗府首次 = 固定奖励 + 一个灵光宝箱）
//   { item: id, n: [a, b] | n, chance, rarity }      固定物品
//   { pick: [[id, 权重], …], chance, n }              从列表按权重抽一个
//   { gear: [凡, 灵, 宝, 仙, 极品] 权重, chance, slot? }  随机装备（等级 = 区域等级 ±1；极品 = 区域极品法宝）
//   { region: "r1" | "r2" }                           只在该区域生效（写在任意条目上）
//   { once: 旗标名, onceFallback }                     只给一次：profile.flags[旗标] 没设才给、给完置位；rollLoot 没传 profile 时按 onceFallback 概率（默认 0.5）
//   { enemy: 类型 | [类型…] }                          只在击杀者是这些类型时生效（功法体系 v2：石傀掉《落石诀》残页等）
//   { pick, unlearned: true }                          从列表里优先抽"还没学会"的功法（物品 def.teaches 不在 profile.flags.learned.spells；全学会了就照常抽）
// 功法体系 v2（战斗设计，docs/design/功法体系_v2.md §4；概率待数值复核）：残页 identified: true（宝品残页也不必鉴定，免得不能叠放）
// 区域材料池里的条目：[物品 id, 权重, 数量 [a, b]]
export const REGION_LOOT = {
  tutorial: { level: [1, 1], stoneMul: 0.6, insight: 2, gearBases: ["sword_qingfeng"],
    common: [["qingling_cao", 3, [1, 2]], ["wolf_fang", 2, [1, 1]]], rare: [["wolf_hide", 1, [1, 2]]], glow: [["ling_yu", 1, [1, 2]]],
    mobMats: { wolf: ["wolf_fang", "wolf_hide"] } },
  r1: {
    level: [1, 4], stoneMul: 1, insight: 2,
    gearBases: ["sword_qingfeng", "robe_bu", "jade_qing"],
    common: [["qingling_cao", 4, [1, 2]], ["ninglu_hua", 3, [1, 2]], ["tiejing_shi", 3, [1, 2]], ["wolf_fang", 3, [1, 2]], ["wolf_hide", 3, [1, 2]], ["ling_tu", 2, [1, 2]]],
    rare: [["wolf_core", 3, [1, 1]], ["ling_yu", 3, [1, 2]], ["stone_heart", 2, [1, 1]], ["lingbang_zhu", 1, [1, 1]], ["seed_qingling", 2, [1, 1]], ["seed_ninglu", 2, [1, 1]]],
    glow: [["wolfking_bone", 4, [1, 1]], ["lingbang_zhu", 3, [1, 2]], ["ling_yu", 3, [2, 3]]],
    // 各种妖兽的专属材料（mob 掉落时按击杀者类型优先）
    mobMats: { wolf: ["wolf_fang", "wolf_hide"], wolf_grey: ["wolf_fang", "wolf_hide"], golem: ["tiejing_shi", "stone_heart"], rat: ["wolf_fang", "gu_fen"], crow: ["ya_yu"], spider: ["du_nang", "gu_fen"] },
    jackpot: ["art_chixiao", "art_qiankun"],
  },
  r2: {
    level: [5, 9], stoneMul: 2.5, insight: 6,
    gearBases: ["sword_zhuying", "robe_lingsi", "jade_shuiling"],
    common: [["hanlu_cao", 4, [1, 2]], ["zi_teng", 2, [1, 1]], ["chiyan_guo", 2, [1, 2]], ["bat_wing", 3, [1, 2]], ["ling_si", 3, [1, 2]], ["vine_heart", 2, [1, 1]], ["wolf_hide", 2, [1, 2]]],
    rare: [["bat_core", 3, [1, 1]], ["vine_core", 3, [1, 1]], ["python_skin", 1, [1, 1]], ["seed_hanlu", 2, [1, 1]], ["seed_ziteng", 1, [1, 1]], ["seed_chiyan", 1, [1, 1]], ["scroll_fire_page", 2, [1, 1]]],
    glow: [["water_jade", 4, [1, 1]], ["zhuxin", 3, [1, 1]], ["scroll_fire_page", 2, [1, 1]]],
    mobMats: { bat: ["bat_wing"], vine: ["vine_heart", "ling_si"], vine_elite: ["vine_heart", "ling_si"], wolf: ["wolf_hide", "wolf_fang"], snake: ["she_tui", "du_nang"], toad: ["chan_su", "gu_fen"], rat: ["gu_fen"], crow: ["ya_yu"], spider: ["du_nang"] },
    jackpot: ["art_chixiao", "art_qiankun"],
  },
};

// §8.6 掉落表
export const SOURCES = {
  mob: [
    { stones: [1, 3], chance: 0.6 },
    { mat: "mob", n: [1, 1], chance: 0.5 },
    { item: "dan_sui", chance: 0.08 }, // 怪物生态 v1
    { gear: [70, 25, 5, 0, 0], chance: 0.06 },
    { item: pageId("rock"), chance: 0.12, region: "r1", enemy: "golem", identified: !0 }, // 功法 v2：石傀 →《落石诀》残页
    { item: pageId("vine_pull"), chance: 0.06, region: "r2", enemy: "vine", identified: !0 }, // 功法 v2：藤妖 →《藤引》残页
  ],
  // 低阶怪（def.tier "low"，lootSource "mob_low"；怪物生态 v1）：灵石少，日常材料多（REGION_LOOT[r].mobMats），常掉妖丹碎片
  mob_low: [
    { stones: [1, 2], chance: 0.4 },
    { mat: "mob", n: [1, 2], chance: 0.75 },
    { item: "dan_sui", chance: 0.22 },
    { gear: [80, 20, 0, 0, 0], chance: 0.03 },
  ],
  // 稀有异种（def.tier "rare"，lootSource "rare_variant"）：保底宝品（10% 仙品）、20% 再掉一件、专属材料与器方、本区域妖丹、机缘 +12；不掉日常材料
  rare_variant: [
    { stones: [20, 40], chance: 1 },
    { gear: [0, 0, 90, 10, 0], chance: 1 },
    { gear: [0, 50, 45, 5, 0], chance: 0.2 },
    { mat: "core", chance: 1 },
    { item: "chilang_xin", chance: 1, region: "r1" },
    { item: "qifang_chilang", chance: 0.6, region: "r1" },
    { item: "xuanbat_xin", chance: 1, region: "r2" },
    { item: "qifang_xuanbat", chance: 0.6, region: "r2" },
    { mat: "rare", chance: 0.5 },
    // 功法 v2：异种 35% 掉一本完本（优先未学）；赤狼另掉 1 页《火鸦》（区域二法术的预告）
    { pick: [[bookId("thunder"), 1], [bookId("rock"), 1], [bookId("ningfeng"), 1]], unlearned: !0, chance: 0.35, region: "r1", identified: !0 },
    { pick: [[bookId("vine_pull"), 1], [bookId("earth_walk"), 1], [bookId("fire_crow"), 1], [bookId("zhishui"), 1]], unlearned: !0, chance: 0.35, region: "r2", identified: !0 },
    { item: pageId("fire_crow"), chance: 0.6, region: "r1", enemy: "chilang", identified: !0 },
  ],
  elite: [
    { stones: [6, 10], chance: 1 },
    // 聚气丹方：青牙改为可选的守谷之王后，从青牙首杀移到"区域一首次击杀精英"（once：profile.flags 记一次；没传 profile 时按 onceFallback 概率）
    { item: "danfang_juqi", chance: 1, once: "drop_danfang_juqi", onceFallback: 0.5, region: "r1" },
    { mat: "core", chance: 1 }, // 本区域精英妖丹（击杀者类型决定，见 CORE_OF）
    { mat: "rare", chance: 0.5 }, // 怪物生态 v1：精英不再掉日常材料（原"60% 常见材料"），稀有 0.4 → 0.5
    { gear: [0, 60, 35, 5, 0], chance: 0.35 },
    { item: "huiqi_dan", n: 1, chance: 0.15 }, // 真气与炼化增益 v1：真气不再自动回复，精英给少量局内补给（当局可用）
    // 青牙 v2：聚气丹方从青牙首杀移到"首次击杀狼妖头目"（区域一精英）；once = 每个存档只给一次（掉落逻辑按 profile.flags[once] 判断，由内容模块 D 接）
    { item: "danfang_juqi", chance: 1, once: "drop_danfang_juqi", region: "r1" },
    { pick: [["xinfa_mom_gather", 2], ["xinfa_mom_chain", 2], ["xinfa_mom_haste", 1]], chance: 0.03 }, // 普攻流心法（气势与身法 v1）
    { item: pageId("thunder"), chance: 0.25, region: "r1", identified: !0 }, // 功法 v2：狼妖头目 →《掌心雷》残页
    { item: pageId("vine_pull"), chance: 0.3, region: "r2", enemy: "vine_elite", identified: !0 }, // 藤妖精英 →《藤引》
    { item: pageId("earth_walk"), chance: 0.25, region: "r2", enemy: "wolf_elite_r2", identified: !0 }, // 灰鬃头目 →《地行术》
  ],
  chest_normal: [
    { stones: [6, 12], chance: 1 },
    { mat: "common", picks: 2, chance: 0.9 },
    { pick: [["huichun_dan", 3], ["huiqi_dan", 1.3], ["dundi_fu", 1]], chance: 0.25 }, // 真气与炼化增益 v1：局内捡到的丹药当局可用 → 回气丹约为原来的一半
    { item: "danfang_page", chance: 0.08 },
    { item: "scroll_fire_page", chance: 0.06, region: "r2" },
    { gear: [55, 35, 10, 0, 0], chance: 0.1 },
    { item: pageId("rock"), chance: 0.05, region: "r1", identified: !0 }, // 功法 v2
    { item: pageId("thunder"), chance: 0.04, region: "r1", identified: !0 },
    { item: pageId("earth_walk"), chance: 0.05, region: "r2", identified: !0 },
  ],
  // 亭子（供案 / 香炉，搜取容器；真气与炼化增益 v1）：每局约 2–4 个；以丹药、符箓、灵石、少量灵草为主，偶有残页，品质略高于普通宝箱
  pavilion: [
    { stones: [6, 12], chance: 1 },
    { pick: [["huiqi_dan", 1], ["huichun_dan", 4]], n: [1, 2], chance: 0.6, region: "r1" },
    { pick: [["huiqi_dan", 2], ["huichun_dan", 4]], n: [1, 2], chance: 0.6, region: "r2" },
    { item: "humai_dan", chance: 0.08, region: "r2" },
    { pick: [["dundi_fu", 3], ["fu_metal", 1], ["fu_wood", 1], ["fu_water", 1], ["fu_fire", 1], ["fu_earth", 1]], n: [1, 2], chance: 0.45 },
    { item: "huqi_fu", chance: 0.08, region: "r2" },
    { pick: [["qingling_cao", 3], ["ninglu_hua", 3]], n: [1, 3], chance: 0.35, region: "r1" },
    { pick: [["hanlu_cao", 3], ["zi_teng", 1], ["chiyan_guo", 2]], n: [1, 2], chance: 0.35, region: "r2" },
    { item: "danfang_page", chance: 0.12 },
    { item: "scroll_fire_page", chance: 0.1, region: "r2" },
    { gear: [40, 45, 15, 0, 0], chance: 0.12 },
    { item: pageId("rock"), chance: 0.04, region: "r1", identified: !0 }, // 功法 v2
    { item: pageId("ningfeng"), chance: 0.05, identified: !0 },
    { item: pageId("earth_walk"), chance: 0.06, region: "r2", identified: !0 },
  ],
  chest_glow: [
    { stones: [12, 22], chance: 1 },
    { mat: "rare", picks: 2, chance: 1 },
    { mat: "common", chance: 0.6 },
    { item: "danfang_page", chance: 0.3 },
    { item: "scroll_fire_page", chance: 0.35, region: "r2" },
    { pick: [["xinfa_mom_gather", 3], ["xinfa_mom_chain", 3], ["xinfa_mom_haste", 2], ["xinfa_dash_flow", 1]], chance: 0.05 }, // 普攻流 / 身法心法
    { gear: [0, 50, 40, 10, 0], chance: 0.4 },
    { item: "xinfa_lingtai", chance: 0.04 }, // 心法《灵台》：神识（搜取 v1）
    { item: pageId("ningfeng"), chance: 0.15, identified: !0 }, // 功法 v2
    { item: pageId("fire_crow"), chance: 0.12, region: "r2", identified: !0 },
  ],
  chest_night: [
    { stones: [25, 45], chance: 1 },
    { mat: "rare", picks: 2, chance: 1 },
    { mat: "glow", chance: 0.3 },
    { item: "scroll_fire_page", chance: 0.4, region: "r2" },
    { pick: [["xinfa_dash_shadow", 1], ["xinfa_sharp", 1], ["xinfa_vajra", 1], ["xinfa_crit_thunder", 1]], chance: 0.06 },
    { pick: [["xinfa_mom_wave", 1], ["xinfa_mom_return", 1], ["xinfa_mom_haste", 1], ["xinfa_dash_flow", 1]], chance: 0.05 },
    { gear: [0, 20, 52, 27, 1.5], chance: 0.7 }, // 1.5% 极品法宝（数值评审）
    { item: pageId("ningfeng"), chance: 0.25, region: "r1", identified: !0 }, // 功法 v2
    { item: pageId("fire_crow"), chance: 0.3, region: "r2", identified: !0 },
    { item: pageId("zhishui"), chance: 0.2, region: "r2", identified: !0 },
  ],
  // 遗府：首次固定奖励见 RUINS，这里是额外随机宝箱 / 重复探索
  ruin_first: [{ chest: "chest_glow" }],
  ruin_repeat: [
    { stones: [15, 30], chance: 1 },
    { mat: "rare", picks: 2, chance: 1 },
    { pick: [["xinfa_dash_shadow", 1], ["xinfa_sharp", 1], ["xinfa_vajra", 1]], chance: 0.2 },
    { pick: [["xinfa_mom_wave", 1], ["xinfa_mom_return", 1], ["xinfa_dash_flow", 1]], chance: 0.12 },
    { gear: [0, 0, 85, 15, 0], chance: 0.6 },
    { item: "xinfa_lingtai", chance: 0.1 }, // 心法《灵台》：神识（搜取 v1）
    { item: pageId("rock"), chance: 0.3, region: "r1", identified: !0 }, // 功法 v2：山神庙重探 →《落石诀》
    { item: pageId("zhishui"), chance: 0.3, region: "r2", identified: !0 }, // 剑修遗府重探 →《止水诀》
  ],
  // Boss：固定奖励见 BOSSES
  boss_first: [
    { stones: [40, 60], chance: 1 },
    { gear: [0, 0, 100, 0, 0], chance: 1 }, // 宝品装备 1 件
    { gear: [0, 0, 0, 99, 1], chance: 0.1 }, // 仙品 10%（其中 1% 换成极品法宝）
    { gear: [0, 0, 0, 0, 1], chance: 0.03 }, // 极品 3%（数值评审）
  ],
  boss_repeat: [
    { stones: [20, 30], chance: 1 },
    { gear: [0, 0, 100, 0, 0], chance: 0.5 },
    { gear: [0, 0, 0, 1, 0], chance: 0.03 },
    { gear: [0, 0, 0, 0, 1], chance: 0.01 },
  ],
  // 功法残碑（功法体系 v2 × 关卡设计 2026-11-17）：每局启用 1–2 块（level.points.steles），必出 1 页本区域残页；
  //   碑出哪门按所在分区固定（STELE_ZONE），玩家能记住"山神庙那块碑出落石诀"；没有分区映射时用区域通用表
  stele: [
    { stones: [4, 8], chance: 1 },
    { pick: [[pageId("rock"), 1], [pageId("thunder"), 1], [pageId("ningfeng"), 1]], unlearned: !0, chance: 1, region: "r1", identified: !0 },
    { pick: [[pageId("vine_pull"), 1], [pageId("earth_walk"), 1], [pageId("fire_crow"), 1], [pageId("zhishui"), 1]], unlearned: !0, chance: 1, region: "r2", identified: !0 },
  ],
};
// 残碑分区 → 功法（关卡 points.steles[].zone；r1 山神庙 / 乱石岗 / 北岭 / 东麓，r2 竹海南·溪谷 / 东台 / 竹海深处 / 北脊 / 断涧东）
export const STELE_ZONE = { miao: "rock", luanshi: "thunder", beiling: "thunder", donglu: "ningfeng", xigu: "vine_pull", dongtai: "earth_walk", zhuhai_n: "fire_crow", beiji: "zhishui", duanjian: "zhishui" };
for (const [z, id] of Object.entries(STELE_ZONE)) SOURCES["stele_" + z] = [{ stones: [4, 8], chance: 1 }, { item: pageId(id), chance: 1, identified: !0 }];

// 精英妖丹：按击杀者类型（没有就用区域默认）
export const CORE_OF = { chilang: "wolf_core", xuanlin_bat: "bat_core", wolf_elite: "wolf_core", golem: "golem_core", golem_elite: "golem_core", wolf_elite_r2: "wolf_core", bat_elite: "bat_core", vine_elite: "vine_core", r1: "wolf_core", r2: "vine_core" };

// 遗府首次固定奖励（§9.1、§9.2）：ruin id → 物品
export const RUINS = {
  shanshen: { region: "r1", name: "山神庙地窖", first: [{ item: "scroll_vine" }, { item: "qifang_robe" }], xp: 80 },
  jianxiu: { region: "r2", name: "剑修遗府", first: [{ item: "art_flying_sword", rarity: 2 }, { item: "scroll_frost" }, { item: "danfang_humai" }, { item: "heshouwu" }], xp: 250 }, // 数值评审：千年何首乌首通必得
};

// Boss 固定奖励（§9）。first：首杀；repeat：重复击杀（材料减半）
export const BOSSES = {
  qingya: {
    // 青牙 v2（守谷之王，宜练六七层斩）：首杀感悟按击杀者层数缩放（xpPerLayer = 150 / 4）；固定值 xp 240 只在拿不到境界时兜底；
    // 首杀另有 boss_first 的宝品装备保底；聚气丹方已移到"首次击杀狼妖头目"（SOURCES.elite 的 once 条目）
    region: "r1", name: "青牙", xp: 240, xpPerLayer: 37.5, // 首杀感悟 = 37.5 × 击杀者层数（练六 225、练七 263、筑基 375）；没有境界信息时用 xp
    first: [{ item: "wolfking_core" }, { item: "qingya_fang" }, { item: "wolf_hide", n: [3, 4] }, { item: "wolf_fang", n: [3, 4] },
      { pick: [[bookId("thunder"), 1], [bookId("rock"), 1], [bookId("ningfeng"), 1]], unlearned: !0 }], // 功法 v2：首杀必得一本完本（优先未学）
    repeat: [{ item: "wolfking_core", chance: 0.5 }, { item: "qingya_fang", chance: 0.2 }, { item: "wolf_hide", n: [1, 2] }, { item: "wolf_fang", n: [1, 2] },
      { pick: [[pageId("thunder"), 1], [pageId("rock"), 1], [pageId("ningfeng"), 1]], unlearned: !0, n: 2, chance: 0.5 }],
  },
  bilin: {
    region: "r2", name: "碧鳞水蟒", xp: 400,
    first: [{ item: "bilin_core" }, { item: "danfang_zhuji" }, { item: "jinnang_qiankun" }, { item: "python_skin", n: [2, 3] }, { item: "bilin_scale", n: [3, 5] }, { item: "art_seal", rarity: 3, chance: 0.05 },
      { pick: [[bookId("vine_pull"), 1], [bookId("earth_walk"), 1], [bookId("fire_crow"), 1], [bookId("zhishui"), 1]], unlearned: !0 }], // 功法 v2：首杀必得一本完本（优先未学）
    repeat: [{ item: "bilin_core", chance: 0.5 }, { item: "python_skin", n: [1, 1] }, { item: "bilin_scale", n: [1, 2] }, { item: "art_seal", rarity: 3, chance: 0.025 },
      { item: pageId("zhishui"), chance: 0.4 }],
  },
};

// 采集：gather_<kind>。kind 可以是具体物种，也可以是通用的 herb / ore / glow（按区域抽）
// 条目同 SOURCES；seedling：额外 25% 带根灵草苗（完整品 60%，见 §11.7）
export const GATHER = {
  // 灵草（qingling / ninglu / hanlu / ziteng / chiyan）、通用 herb、灵田 lingtian：按品质分档，由文件末尾的 buildHerbGather() 按 recipes.js GARDEN 生成
  tiejing: [{ item: "tiejing_shi", n: [1, 3] }, { stones: [0, 2], chance: 0.4 }],
  lingtu: [{ item: "ling_tu", n: [1, 2] }],
  heshouwu: [{ item: "heshouwu", n: [1, 1] }],
  // 灵光点（大件）：品质随机（经济复核 v1，docs/review/numeric/经济复核_v1.md）——先按权重抽品质档（_q1 灵 / _q2 宝 / _q3 仙），再给物品
  //   修为随品质：REFINE.treasureRarity（灵 ×1、宝 ×1.3、仙 ×1.7）；期望修为与改前固定品质时持平
  wolfking_bone: { r1: [["wolfking_bone_q1", 60], ["wolfking_bone_q2", 35], ["wolfking_bone_q3", 5]] },
  wolfking_bone_q1: [{ item: "wolfking_bone", rarity: 1 }],
  wolfking_bone_q2: [{ item: "wolfking_bone", rarity: 2 }],
  wolfking_bone_q3: [{ item: "wolfking_bone", rarity: 3 }],
  lingbang: { r1: [["lingbang_q1", 70], ["lingbang_q2", 25], ["lingbang_q3", 5]] },
  lingbang_q1: [{ item: "lingbang_zhu", rarity: 1, n: [1, 2] }, { stones: [4, 8] }],
  lingbang_q2: [{ item: "lingbang_zhu", rarity: 2, n: 1 }, { stones: [4, 8] }],
  lingbang_q3: [{ item: "lingbang_zhu", rarity: 3, n: 1 }, { stones: [6, 10] }],
  furnace_part: [{ item: "furnace_part" }],
  water_jade: { r2: [["water_jade_q1", 50], ["water_jade_q2", 40], ["water_jade_q3", 10]] },
  water_jade_q1: [{ item: "water_jade", rarity: 1 }],
  water_jade_q2: [{ item: "water_jade", rarity: 2 }],
  water_jade_q3: [{ item: "water_jade", rarity: 3 }],
  zhuxin: { r2: [["zhuxin_q1", 50], ["zhuxin_q2", 40], ["zhuxin_q3", 10]] },
  zhuxin_q1: [{ item: "zhuxin", rarity: 1 }],
  zhuxin_q2: [{ item: "zhuxin", rarity: 2 }],
  zhuxin_q3: [{ item: "zhuxin", rarity: 3 }],
  zhenpan: [{ item: "zhenpan_sword" }],
  // 通用（关卡没标具体物种时）
  ore: { r1: [["tiejing", 3], ["lingtu", 1]], r2: [["tiejing", 1]], tutorial: [["tiejing", 1]] },
  // 没标物种的灵光点、只给一次的灵光点（炼器鼎残件 / 阵盘）领过以后：直接抽到品质档（只解析一层）
  glow: {
    r1: [["wolfking_bone_q1", 2.4], ["wolfking_bone_q2", 1.4], ["wolfking_bone_q3", 0.2], ["lingbang_q1", 2.1], ["lingbang_q2", 0.75], ["lingbang_q3", 0.15]],
    r2: [["water_jade_q1", 2], ["water_jade_q2", 1.6], ["water_jade_q3", 0.4], ["zhuxin_q1", 1.5], ["zhuxin_q2", 1.2], ["zhuxin_q3", 0.3]],
    tutorial: [["lingbang_q1", 1]],
  },
};
// ---------------- 灵草按品质分档（药园与重铸 v1） ----------------
// GATHER.<草> = { 区域: [[<草>_q<品质>, 权重]] }（权重 = GARDEN.herbQuality[区域]）；GATHER.<草>_q<品质> = [灵草 × n（该品质）, 各年份种子（独立判定）]
//   种子：年份 y 的概率 = seedDrop[品质] × seedRarity[品质][y] / Σ（独立判定，极少数情况一次掉两颗）
// GATHER.herb（关卡没标物种）与 GATHER.lingtian（奇遇·灵田，品质高 lingtianShift 档、掉种子 + lingtianSeedBonus）直接指向分档（只解析一层）
const HERBS = {
  qingling: { item: "qingling_cao", n: [2, 3], seed: "seed_qingling", share: { r1: 6, tutorial: 1 } },
  ninglu: { item: "ninglu_hua", n: [1, 3], seed: "seed_ninglu", share: { r1: 4 } },
  hanlu: { item: "hanlu_cao", n: [2, 3], seed: "seed_hanlu", share: { r2: 5 } },
  ziteng: { item: "zi_teng", n: [1, 1], seed: "seed_ziteng", share: { r2: 2 } },
  chiyan: { item: "chiyan_guo", n: [1, 3], seed: "seed_chiyan", share: { r2: 3 } },
};
function buildHerbGather() {
  const G = GARDEN, Q = G.herbQuality;
  const tier = (h, q, bonus) => {
    const sw = G.seedRarity[q], tot = sw.reduce((a, b) => a + b, 0), drop = Math.min(1, G.seedDrop[q] + bonus);
    const out = [{ item: h.item, rarity: q, n: h.n }];
    sw.forEach((w, y) => w > 0 && out.push({ item: h.seed, rarity: y, chance: Math.round(((drop * w) / tot) * 1e4) / 1e4 }));
    return out;
  };
  const shift = (w, k) => w.map((_, i) => (i - k >= 0 ? w[i - k] : 0) + (i === w.length - 1 ? w.slice(w.length - k).reduce((a, b) => a + b, 0) : 0));
  const herb = {}, lingtian = {};
  for (const [kind, h] of Object.entries(HERBS)) {
    GATHER[kind] = {};
    for (let q = 0; q < 5; q++) {
      GATHER[`${kind}_q${q}`] = tier(h, q, 0);
      GATHER[`lt_${kind}_q${q}`] = tier(h, q, G.lingtianSeedBonus);
    }
    for (const reg of Object.keys(Q)) {
      GATHER[kind][reg] = Q[reg].map((w, q) => [`${kind}_q${q}`, w]).filter((x) => x[1] > 0);
      const share = h.share[reg];
      if (!share) continue;
      (herb[reg] ||= []).push(...Q[reg].map((w, q) => [`${kind}_q${q}`, w * share]).filter((x) => x[1] > 0));
      if (reg !== "tutorial") (lingtian[reg] ||= []).push(...shift(Q[reg], G.lingtianShift).map((w, q) => [`lt_${kind}_q${q}`, w * share]).filter((x) => x[1] > 0));
    }
  }
  GATHER.herb = herb;
  GATHER.lingtian = lingtian;
}
buildHerbGather();

// 只给一次的灵光点（首次固定）：kind → profile.flags 键
export const GLOW_ONCE = { furnace_part: "glow_furnace_part", zhenpan: "glow_zhenpan" };

// §8.5 随机词条：[属性, 加成类型, [灵, 宝, 仙], 可出现的栏位, 是否乘区域系数]
// 区域系数：物品等级 1~4 → 1.0，5~9 → 1.6，筑基 → 2.4（只作用于 atk / hp / def / 五行这类平值）
export const AFFIXES = [
  ["atk", "flat", [3, 6, 10], ["sword", "jade"], !0],
  ["spell", "pct", [0.06, 0.1, 0.15], ["sword", "jade"], !1],
  ["hp", "flat", [30, 60, 100], ["robe", "jade"], !0],
  ["def", "flat", [4, 8, 12], ["robe"], !0],
  ["crit", "flat", [0.03, 0.05, 0.08], ["sword", "jade"], !1],
  ["cdr", "flat", [0.04, 0.06, 0.1], ["jade"], !1],
  ["element", "flat", [10, 20, 35], ["sword", "robe", "jade"], !1], // 五行亲和：随机五行之一（法术状态强度 +%）
  ["mp", "flat", [12, 20, 30], ["robe", "jade"], !0], // 原"真气回复"（真气不自动回复后改为真气上限；乘区域系数）
  ["extractTime", "pct", [-0.1, -0.15, -0.25], ["robe"], !1], // 撤离读条（特殊属性，由流程模块读取）
  ["bagCells", "flat", [2, 3, 4], ["jade"], !1], // 储物袋格（特殊属性，由流程模块读取）
  ["imbue", "flat", [1, 1, 1], ["sword"], !1], // 法剑附灵：stat 为 imbue_<五行>，普攻带该五行（由整合模块读取）
  // 普攻流 / 身法（战斗 · 气势与身法 v1，由 src/game/player.js 读取）：自定义属性基础值为 0，所以用 flat 记百分比
  ["aspd", "pct", [0.04, 0.06, 0.09], ["sword", "jade"], !1], // 攻速 +%
  ["momGain", "flat", [0.1, 0.15, 0.22], ["sword"], !1], // 气势获取 +%
  ["chargeDmg", "flat", [0.1, 0.16, 0.25], ["sword", "jade"], !1], // 蓄势斩伤害 +%
  ["dashCdr", "flat", [0.06, 0.1, 0.15], ["robe", "jade"], !1], // 闪身冷却 -%（上限 40%）
  ["sense", "flat", [8, 12, 20], ["jade"], !1], // 神识 +X（搜取探查：时长 × 100/(100+神识)，docs/ui/v2/搜取_v1.md）
];
export const REGION_COEF = (level) => (level >= 10 ? 2.4 : level >= 5 ? 1.6 : 1);
// 仙品 / 极品特殊词条：旧8项等于装备了同 id 的心法（src/data/items.js XINFA，需标 affix: !0）；追加的 weapon 项独立。
// 心法与心法栏同名不叠加；gearStats 产出 gx_<id>，武器奇效产出 wx_<effect>，不进入心法集合。
// 名称只用于显示；"锋锐"旧名"首击必暴"（旧存档里的装备仍显示旧名，效果按《锋锐》：暴击率 +15%、暴击伤害 +30%）。
export const SPECIAL_AFFIXES = [
  ["dash_shadow", "闪身留剑影"],
  ["crit_thunder", "暴击引雷"],
  ["sharp", "锋锐"],
  ["vajra", "金刚体"],
  // 普攻流 / 身法（战斗 · 气势与身法 v1）
  ["mom_haste", "满势疾攻"],
  ["mom_wave", "蓄势斩余波"],
  ["mom_return", "蓄势斩回锋"],
  ["dash_flow", "流云身法"],
  // 第三项标记武器奇效（不是心法）：仅仙品及以上法剑等权加入这三项，其他栏位仍为原8项。
  ...Object.entries(WEAPON_EFFECTS).map(([id, effect]) => [id, effect.name, "weapon"]),
];
export const ELEMENTS = ["metal", "wood", "water", "fire", "earth"];

// 机缘值（评审 G4，可见的"天机镜·机缘"刻度）：存 profile.stats.fortune。以下来源每次 +value；
// 满了（≥ max）之后，下一次精英 / 灵光宝箱 / 夜明宝箱 / Boss 必出 1 件极品法宝并清零；自然出了极品也清零。
// 一次 v1 通关约 15 精英 + 10 灵光宝箱 + 2–3 Boss + 2 夜明宝箱 ≈ 190 点，大约在第 5–7 局第一次满。
// 数值评审：兑现来源加上精英与灵光宝箱；兑现的极品带 tags: ["key"]（身陨不丢）；quest / encounter 供委托、奇遇模块调用 addFortune
export const FORTUNE = {
  max: 100,
  add: { elite: 6, chest_glow: 5, chest_night: 10, boss_first: 15, boss_repeat: 10, ruin_first: 8, quest: 12, encounter: 5, rare_variant: 12 },
  payout: ["elite", "chest_glow", "chest_night", "boss_first", "boss_repeat", "rare_variant"],
  payoutKey: !0,
};

// 装备掉落按栏位解锁门控（玩法系统 2026-11-17，用户反馈"法衣比玉佩先解锁，玉佩却和法衣一样早掉"；数值策划已确认 away 取值，极品法宝 / 机缘兑现 / 遗府固定不门控）：
//   随机装备抽底材（REGION_LOOT[r].gearBases）时，每个底材的权重 = away[距该栏解锁还差几层]（已解锁 = away[0] = 1；超出取最后一项）。
//   解锁境界读 src/data/progression.js 的 unlocks（法衣 robeSlot 练三、玉佩 jadeSlot 练五、法宝 artifactSlot 练七）。
//   被挡掉的份额按 spill 一部分转给已解锁的栏位、其余不掉（总件数随之略降）。指定 slot / gearBase 的固定掉落、极品法宝不门控。
//   掉了也能带回仓库存着（局内储物袋 / 洞府都不让装备未解锁的栏位）。
//   spill：被挡掉的份额里转给已解锁栏位的比例（用户定 0.5：练一、二每局约 3.7 件剑偏多 → 只转一半，其余不掉）
export const GEAR_SLOT_GATE = { away: [1, 0.25, 0.08, 0], spill: 0.5 };

// 保底（§8.6，数值评审改 40）：连续 40 只小怪没出灵品以上装备 → 之后小怪掉的下一件装备至少灵品
export const PITY = { mobGear: 40 };

// 斩妖感悟（§10.1）：普通 = 区域 insight；精英 ×8；Boss 首杀固定（重复 20%）
export const INSIGHT = { eliteMul: 5, bossRepeat: 0.2 }; // 数值评审：精英 ×8 → ×5
