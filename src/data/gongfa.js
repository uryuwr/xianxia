// 功法体系 v2 的数据（docs/design/功法体系_v2.md）：残页 / 完本物品、参悟代价、悟性、"重"、法术栏保底赠予。
// 逻辑见 src/game/gongfa.js；掉落条目在 src/data/loot.js（搜"功法体系 v2"）。全部数值为战斗设计草案，**待数值复核**（数值策划）。
//
// SCROLLS：每门靠残页获取的法术一条 → 自动生成两种物品（items_db.js 展开）：
//   scroll_<id>_page  「《名》残页」cat "scroll"，stack 9，teaches，pages = 集齐页数
//   scroll_<id>_book  「《名》」完本，cat "scroll"，teaches（pages 缺省 = 1：完本直接参悟）
//   名门功法（缠藤诀 · 山神庙、寒冰锥 · 剑修遗府）与火符残卷沿用 items_db 里原有的物品，不在这里生成。
export const SCROLLS = [
  { id: "thunder", name: "掌心雷", pages: 4, rarity: 1, value: 50 },
  { id: "ningfeng", name: "凝锋诀", pages: 3, rarity: 1, value: 50 },
  { id: "vine_pull", name: "藤引", pages: 4, rarity: 1, value: 60 },
  { id: "zhishui", name: "止水诀", pages: 5, rarity: 2, value: 90 },
  { id: "fire_crow", name: "火鸦", pages: 4, rarity: 2, value: 80 },
  { id: "rock", name: "落石诀", pages: 3, rarity: 1, value: 50 },
  { id: "earth_walk", name: "地行术", pages: 4, rarity: 1, value: 60 },
];
export const pageId = (id) => `scroll_${id}_page`;
export const bookId = (id) => `scroll_${id}_book`;

// 原有的功法物品（不生成，只登记"哪个物品教哪门"，供来源指引查表）
export const LEGACY_SCROLLS = { sword_qi: ["scroll_sword_qi"], vine: ["scroll_vine"], frost: ["scroll_frost"], fire_talisman: ["scroll_fire_page"], earth_shield: ["scroll_earth_shield"] };

export const GONGFA = {
  // 参悟（洞府仓库）：残页集齐后花灵石参悟成完本（按物品品级 RARITY 0–4）；完本 / 名门功法免费
  studyStones: [0, 20, 60, 150, 300],
  // 悟性：重复残页（已学会，或比所需多出来的）参悟时化为悟性；每页按品级给
  wuxPerPage: [1, 1, 2, 3, 4],
  wuxPerBook: 4, // 重复的完本
  fillCost: 3, // 缺页时每 3 点悟性补 1 页
  fillMinHave: 1, // 至少要有 1 页实物（"有了线索才能参"）
  // 重：已学法术用悟性升阶；伤害 / 冷却走 src/game/skills（strike 的独立乘区 / castSpell 的冷却），不走 Stats 的 dmg
  zhong: { 2: { cost: 6, dmg: 0.12, label: "二重" }, 3: { cost: 10, cdr: 0.15, label: "三重" } },
  // 法术栏开启时，已学法术不够填满新栏 → 突破时赠一门基础法术（按顺序取第一门没学过的）
  spellFallback: { "1:3": ["earth_shield", "rock"], "1:7": ["rock", "earth_shield"] },
};

// 概率档（来源指引的显示用；不直接写百分比）
export const CHANCE_TIER = [
  [0.3, "常见"],
  [0.1, "偶得"],
  [0, "罕见"],
];
