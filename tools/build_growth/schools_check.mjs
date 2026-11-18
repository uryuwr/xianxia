// 构筑与成长 v1 · 流派结构检查（战斗设计，2026-11-18）
//
// 把 docs/design/构筑与成长_v1/02_流派与机制.md 的部件表写成数据，做三项"结构"检查（不算数值，数值看 pieces.mjs / num_ttk）：
//   1. 每个流派的部件数（按 心法 / 法术 / 法宝 / 阵法 / 词条 分栏，分 v1 与第二期），★三件是否齐（1 心法 + 1 法术 + 1 法宝或阵法）
//   2. 交叉件：属于 ≥ 2 个流派的部件
//   3. 首领检验：每个流派"自己的伤害件"能克制哪几种护盾、青牙（木 → 土）/ 碧鳞（火 → 土 → 木）每一段要不要借别的流派的件
//      ——目标是"没有一个流派能用自己的件打穿全部五种护盾"（护盾换手不被绕开），但每个流派借 1 门法术或附灵剑就能补上
// 现有部件的 id 会和 src/data/skills.js、src/data/items.js 对一遍，防止表里写错 id。
//
// 用法（仓库根目录）：node tools/build_growth/schools_check.mjs
import { SPELLS, FORMATIONS } from "../../src/data/skills.js";
import { ARTIFACTS, XINFA } from "../../src/data/items.js";

const S = { jian: "剑势", wux: "五行", shen: "身法", lei: "雷暴", shou: "守御" };
const EL = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };
// 克制：护盾五行 ← 克它的五行
const COUNTER = { wood: "metal", earth: "wood", water: "earth", fire: "water", metal: "fire" };

// [id, 名, 类型, 流派[], 五行（伤害件才填，null = 不打伤害或无属性）, 阶段 v1 / 二期, ★核心于哪个流派（可空）, 新/改/现有]
const P = [
  // ---- 法术（现有 12 门）
  ["sword_qi", "剑气斩", "法术", ["jian", "wux", "lei"], "metal", "v1", null, "现有"],
  ["thunder", "掌心雷", "法术", ["lei", "wux"], "metal", "v1", "lei", "现有"],
  ["ningfeng", "凝锋诀", "法术", ["jian", "wux"], null, "v1", "jian", "现有"],
  ["vine", "缠藤诀", "法术", ["wux"], "wood", "v1", null, "现有"],
  ["vine_pull", "藤引", "法术", ["shen", "jian"], "wood", "v1", null, "现有"],
  ["frost", "寒冰锥", "法术", ["wux"], "water", "v1", null, "现有"],
  ["zhishui", "止水诀", "法术", ["shen", "shou", "wux"], "water", "v1", "shen", "现有"],
  ["fire_talisman", "火符", "法术", ["wux"], "fire", "v1", null, "现有"],
  ["fire_crow", "火鸦", "法术", ["wux", "jian"], "fire", "v1", null, "现有"],
  ["earth_shield", "土遁护体", "法术", ["shou"], null, "v1", "shou", "现有"],
  ["rock", "落石诀", "法术", ["wux", "shou"], "earth", "v1", "wux", "现有"],
  ["earth_walk", "地行术", "法术", ["shen"], "earth", "v1", null, "现有"],
  // ---- 心法
  ["mom_gather", "《蓄势》", "心法", ["jian"], null, "v1", "jian", "现有"],
  ["mom_chain", "《连环》", "心法", ["jian"], null, "v1", null, "现有"],
  ["mom_haste", "《满势》", "心法", ["jian", "shen"], null, "v1", null, "现有"],
  ["mom_wave", "《余波》", "心法", ["jian"], null, "v1", null, "现有"],
  ["mom_return", "《回锋》", "心法", ["jian", "shen"], null, "v1", null, "现有"],
  ["ningshen", "《凝神》", "心法", ["wux"], null, "v1", "wux", "新"],
  ["lunzhuan", "《轮转》", "心法", ["wux"], null, "v1", null, "新"],
  ["linggen", "《灵根》", "心法", ["wux"], null, "v1", null, "改（替《灵根·火》）"],
  ["dash_flow", "《流云》", "心法", ["shen"], null, "v1", "shen", "现有"],
  ["dash_shadow", "《剑影》", "心法", ["shen", "lei"], "metal", "v1", null, "现有"],
  ["lingbo", "《凌波》", "心法", ["shen"], null, "v1", null, "新"],
  ["fuliu", "《拂柳》", "心法", ["shen", "jian"], null, "v1", null, "新"],
  ["sharp", "《锋锐》", "心法", ["lei", "jian"], null, "v1", "lei", "改（加雷痕）"],
  ["crit_thunder", "《雷引》", "心法", ["lei"], "metal", "v1", null, "改（天雷叠雷痕）"],
  ["vajra", "《金刚体》", "心法", ["shou"], null, "v1", "shou", "现有"],
  ["budong", "《不动》", "心法", ["shou"], "earth", "v1", null, "新"],
  // ---- 法宝
  ["flying_sword", "青冥飞剑", "法宝", ["jian", "lei"], "metal", "v1", "jian", "现有"],
  ["gourd", "紫金葫芦", "法宝", ["wux", "shou"], null, "v1", "wux", "改（被动不回蓝）"],
  ["seal", "镇山印", "法宝", ["shou", "wux"], "earth", "v1", "shou", "现有"],
  ["dingfeng", "定风珠", "法宝", ["shen", "jian"], null, "v1", "shen", "新"],
  ["wulei", "五雷令", "法宝", ["lei"], "metal", "二期", "lei", "新"],
  // ---- 阵法
  ["sword_array", "剑阵", "阵法", ["jian", "lei"], "metal", "v1", "lei", "现有（缺获取）"],
  ["fire_array", "火阵", "阵法", ["wux", "shou"], "fire", "v1", null, "现有（缺获取）"],
  ["spirit_array", "聚灵阵", "阵法", ["wux"], null, "v1", "wux", "改（灵池）"],
  ["bamen", "八门阵", "阵法", ["shen", "jian"], null, "二期", "shen", "新"],
  // ---- 词条（装备）
  ["aff_momGain", "气势获取 / 蓄势斩伤害", "词条", ["jian"], null, "v1", null, "现有"],
  ["aff_aspd", "攻速", "词条", ["jian", "lei", "shen"], null, "v1", null, "现有"],
  ["aff_spell", "法力% / 五行亲和 / 冷却 / 真气上限", "词条", ["wux"], null, "v1", null, "现有"],
  ["aff_dash", "闪身冷却", "词条", ["shen"], null, "v1", null, "现有"],
  ["aff_crit", "暴击 / 暴伤（暴伤新）", "词条", ["lei", "jian"], null, "v1", null, "暴伤新"],
  ["aff_tank", "气血 / 防御", "词条", ["shou"], null, "v1", null, "现有"],
  ["imbue", "法剑附灵（任一五行）", "词条", ["jian", "wux", "shen", "lei", "shou"], "any", "v1", null, "现有"],
];

// ---- 1. id 校验
const exist = { 法术: SPELLS, 心法: XINFA, 法宝: ARTIFACTS, 阵法: FORMATIONS };
const bad = P.filter((p) => p[7].startsWith("现有") && exist[p[2]] && !exist[p[2]][p[0]]);
if (bad.length) console.log("FAIL 表里写了不存在的现有部件：", bad.map((p) => p[0]).join(", "));

const pad = (s, n) => String(s) + " ".repeat(Math.max(0, n - [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));

// ---- 2. 每流派部件数 + ★
console.log("\n## 1. 每个流派的部件（v1 / 含第二期）");
console.log(pad("流派", 8) + ["心法", "法术", "法宝", "阵法", "词条"].map((k) => pad(k, 10)).join("") + "★三件（v1）");
for (const [k, n] of Object.entries(S)) {
  const mine = P.filter((p) => p[3].includes(k));
  const cnt = (t, all) => mine.filter((p) => p[2] === t && (all || p[5] === "v1")).length;
  const core = P.filter((p) => p[6] === k && p[5] === "v1");
  const ok = ["心法", "法术"].every((t) => core.some((p) => p[2] === t)) && core.some((p) => p[2] === "法宝" || p[2] === "阵法");
  console.log(pad(n, 8) + ["心法", "法术", "法宝", "阵法", "词条"].map((t) => pad(`${cnt(t)} / ${cnt(t, 1)}`, 10)).join("") + (ok ? "齐 " : "缺 ") + core.map((p) => p[1]).join(" + "));
}

// ---- 3. 交叉件
console.log("\n## 2. 交叉件（≥ 2 个流派能用）");
for (const p of P.filter((p) => p[3].length >= 2 && p[0] !== "imbue")) console.log(`- ${p[1]}（${p[2]}）：${p[3].map((k) => S[k]).join(" × ")}`);

// ---- 4. 护盾覆盖
console.log("\n## 3. 首领检验：各流派自己的伤害件能克哪种护盾（不含通用的附灵剑）");
console.log(pad("流派", 8) + Object.keys(COUNTER).map((sh) => pad(EL[sh] + "盾", 30)).join(""));
const own = {};
for (const [k, n] of Object.entries(S)) {
  own[k] = {};
  let row = pad(n, 8);
  for (const sh of Object.keys(COUNTER)) {
    const need = COUNTER[sh];
    const hit = P.filter((p) => p[3].includes(k) && p[4] === need && p[5] === "v1");
    own[k][sh] = hit.length;
    row += pad(hit.length ? hit.map((p) => p[1]).join("/") : "—（借）", 30);
  }
  console.log(row);
}
const all5 = Object.entries(own).filter(([, m]) => Object.values(m).every((x) => x > 0)).map(([k]) => S[k]);
console.log(all5.length ? `注意：${all5.join("、")} 用自己的件就能克全部五种护盾（换手检验对它较弱，但仍要占栏位）` : "没有流派能只靠自己的件克全部五种护盾 → 护盾换手对每个流派都成立");

console.log("\n## 4. 首领各段：本流派自带的克制件（— = 要借一门法术 / 附灵剑 / 走剑意或环境）");
const BOSS = { 青牙: ["wood", "earth"], 碧鳞: ["fire", "earth", "wood"] };
for (const [b, segs] of Object.entries(BOSS)) {
  console.log(`- ${b}（${segs.map((s) => EL[s] + "盾").join(" → ")}）：` + Object.entries(S).map(([k, n]) => `${n} ${segs.map((s) => (own[k][s] ? "✓" : "—")).join("")}`).join("｜"));
}
