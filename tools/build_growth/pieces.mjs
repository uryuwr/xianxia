// 构筑与成长 v1 · 构筑部件到手的蒙特卡洛（数值策划，2026-11-18）
//
// 用真实掉落表算"每个流派的部件第几局 / 第几层可用、第几层成型"，替代主管草图（docs/design/构筑节奏_v1）里
// "必得 1 / 常见 0.6 / 罕见 0.25"的粗估。
//
//   1. 局程：work/build_schedule.json（tools/build_growth/schedule.py：每局区域、开局 / 结束层数、撤离成败、碧鳞首杀；econ.py ECON_XIAN）
//   2. 每局内容：关卡策划实测的"每局接触数"（docs/design/构筑与成长_v1/04_data.json，600 种子、真实地形）：
//      局型 普通 / 遗府 / 首领 × 策略（谨慎 = 区域一入暮前撤、区域二入夜前撤；贪 = 全拿，入夜有夜明宝箱）。
//      每个来源按期望值随机取整后，逐个调用游戏里真实的 rollLoot（src/game/loot.js，带 profile：机缘、优先未学、once）
//   3. 撤离失败：只拿到 frac ∈ U(0.35, 1) 的内容，区域一保留 50%、区域二按遗落取回保留 42%（同 econ.py）；key 物品不丢
//   4. 回洞府：残页满了就参悟；已学会的残页 / 完本化悟性；缺页时按本流派"想要"的法术用悟性补页（3 点 1 页，至少 1 页实物）
//   5. 方案（SCEN）：现状 / 方向一 补缺口 / 方向二 本命提前 / 方向三 入门定向（草图原样）/ 框架 v0.1（玩法系统 + 战斗设计 2026-11-18）
//      只在内存里改掉落表、栏位、选择点，不动 src/
//
// 两种"成型"口径：
//   草图口径：流派部件表（草图 BASE）里每件"到这一层已可用"的概率取平均 = 成型度；≥ 70% 记成型、≥ 35% 记定向（与草图同一公式，
//             只是把"必 1 / 常 0.6 / 罕 0.25"换成模拟出的真实概率）
//   ★口径：  战斗设计 02 的"★ 三件"（入门心法 + 核心法术 + 法宝 / 阵）都可用的那一层（个体），给 p50 / p90
//
// 用法（仓库根目录）：
//   node tools/build_growth/pieces.mjs [N=1000] [persona=all|谨慎|贪心|新手] [scen=base,a,b,c,gp]
// 输出：控制台表格 + work/build_pieces.json
import fs from "node:fs";
import { rollLoot } from "../../src/game/loot.js";
import { SOURCES, BOSSES, RUINS, GATHER } from "../../src/data/loot.js";
import { ITEMS, registerItems } from "../../src/core/items.js";
import { SCROLLS, GONGFA } from "../../src/data/gongfa.js";

const N = Number(process.argv[2] || 1000);
const PERSONA = process.argv[3] || "all";
const SCEN_LIST = (process.argv[4] || "base,a,b,c,gp").split(",");
const SCHED = JSON.parse(fs.readFileSync("work/build_schedule.json", "utf8"));
const LEVEL = JSON.parse(fs.readFileSync("docs/design/构筑与成长_v1/04_data.json", "utf8"));
const PERSONAS = PERSONA === "all" ? Object.keys(SCHED.personas) : [PERSONA];
const GREEDY_P = { 谨慎: 0.1, 贪心: 0.6, 新手: 0.3 }; // econ.py profiles.night：这一局贪到入夜（全拿、有夜明宝箱）

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sround = (rng, x) => Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0);

// ---------------- 每局接触（关卡 04_data.json）----------------
const RUNKEY = { r1: { normal: "普通", ruin: "遗府(山神庙)", boss: "首领(青牙)" }, r2: { normal: "普通", ruin: "遗府(剑修)", boss: "首领(碧鳞)" } };
const STD = { r1: "dusk", r2: "night" }; // 常规策略（关卡：区域二的常规 = 入夜前撤）
const contact = (region, type, greedy) => {
  const r = LEVEL[region].runs[`${RUNKEY[region][type]}/${greedy ? "greedy" : STD[region]}`];
  return { c: r.contact, night: r.night_chest || 0 };
};
const LOW = new Set(["rat", "crow", "spider", "snake", "toad"]);

// ---------------- 部件 ----------------
const SPELL_PAGES = Object.fromEntries(SCROLLS.map((s) => [s.id, s.pages]));
SPELL_PAGES.fire_talisman = 3;
const PAGE_ITEM = Object.fromEntries(SCROLLS.map((s) => [`scroll_${s.id}_page`, s.id]));
PAGE_ITEM.scroll_fire_page = "fire_talisman";
const PAGE_WUX = Object.fromEntries(SCROLLS.map((s) => [s.id, GONGFA.wuxPerPage[s.rarity]]));
PAGE_WUX.fire_talisman = 1;
const BOOK_ITEM = Object.fromEntries(SCROLLS.map((s) => [`scroll_${s.id}_book`, s.id]));
Object.assign(BOOK_ITEM, { scroll_vine: "vine", scroll_frost: "frost", scroll_sword_qi: "sword_qi", scroll_earth_shield: "earth_shield" });
const ART_ITEM = { art_flying_sword: "flying_sword", art_chixiao: "flying_sword", art_seal: "seal", art_qiankun: "gourd", art_gourd: "gourd" };
const FORM_ITEM = { zhenpan_sword: "sword_array", zhenpan_spirit: "spirit_array", zhenpan_fire: "fire_array" };

registerItems([
  { id: "xinfa_ningshen", name: "心法《凝神》", cat: "scroll", value: 200, rarity: 2, teaches: "ningshen", kind: "xinfa" },
  { id: "art_gourd", name: "紫金葫芦", cat: "artifact", slot: "artifact", value: 900, rarity: 3, artifact: "gourd", artifactId: "gourd", tags: ["key"] },
  { id: "zhenpan_spirit", name: "阵盘·聚灵阵", cat: "scroll", value: 300, rarity: 2, teaches: "spirit_array", kind: "formation", tags: ["key"] },
]);

// 栏位（按层数）
const SLOTS_BASE = { spell: [[1, 1], [3, 2], [7, 3]], xinfa: [[1, 0], [4, 1], [8, 2]], art: [[7, 1]], form: [[7, 1]], dash2: [[6, 1]] };
const slotAt = (tab, L) => (tab || []).reduce((v, [l, x]) => (L >= l ? x : v), 0);

// 流派
//   sketch：草图 BASE 的部件（[名称, 判定]）——判定 = 部件 key 之一已可用；"slot:*" 是栏位
//   star：★三件（战斗设计 02），每件是 key 的"任一"
//   want：用悟性补页的法术；intro：入门心法；art / form：选择点选哪个；school：心法偏置池
const BUILDS = {
  jian: {
    name: "剑势流", starSpell: "ningfeng", want: ["ningfeng"], intro: "mom_gather", art: "flying_sword", form: "sword_array", school: ["mom_gather", "mom_chain", "mom_haste", "mom_wave", "mom_return"],
    sketch: [["凝锋诀", ["s:ningfeng"]], ["剑势心法①", ["x:mom_gather", "x:mom_chain"]], ["法剑气势词条", ["g:sword_mom"]], ["青冥飞剑", ["a:flying_sword"]], ["剑阵", ["f:sword_array"]], ["剑势心法②", ["x2:mom_haste", "x2:mom_wave", "x2:mom_return"]]],
    star: [["x:mom_gather"], ["s:ningfeng"], ["a:flying_sword", "f:sword_array"]],
  },
  fa: {
    name: "五行流", starSpell: "rock", want: ["rock", "fire_talisman", "fire_crow", "thunder"], intro: "ningshen", art: "gourd", form: "spirit_array", school: ["ningshen", "fire_root"],
    sketch: [["法术心法", ["x:ningshen", "x:fire_root"]], ["法术栏2", ["slot:spell2"]], ["火符", ["s:fire_talisman"]], ["寒冰锥", ["s:frost"]], ["法术栏3", ["slot:spell3"]], ["紫金葫芦", ["a:gourd"]], ["聚灵阵", ["f:spirit_array"]]],
    star: [["x:ningshen"], ["s:rock", "s:frost", "s:vine&fire_talisman"], ["a:gourd", "f:spirit_array"]],
  },
  shen: {
    name: "身法流", starSpell: "zhishui", want: ["zhishui", "earth_walk", "vine_pull"], intro: "dash_flow", art: "dingfeng", form: "sword_array", school: ["dash_flow", "mom_return", "dash_shadow"],
    sketch: [["《流云》", ["x:dash_flow"]], ["地行术", ["s:earth_walk"]], ["闪身2充能", ["slot:dash2"]], ["止水诀", ["s:zhishui"]], ["《回锋》", ["x:mom_return"]], ["《剑影》", ["x:dash_shadow"]]],
    star: [["x:dash_flow"], ["s:zhishui", "s:earth_walk", "s:vine_pull"], ["a:dingfeng"]],
  },
  bao: {
    name: "雷暴流", starSpell: "thunder", want: ["thunder"], intro: "sharp", art: "wulei", form: "sword_array", school: ["sharp", "crit_thunder"],
    sketch: [["《锋锐》", ["x:sharp"]], ["掌心雷", ["s:thunder"]], ["玉佩暴击词条", ["g:jade_crit"]], ["《雷引》", ["x:crit_thunder"]]],
    star: [["x:sharp"], ["s:thunder"], ["a:wulei"]],
  },
  shou: {
    name: "守御流", starSpell: "earth_shield", want: ["rock"], intro: "vajra", art: "seal", form: "sword_array", school: ["vajra"],
    sketch: null,
    star: [["x:vajra"], ["s:earth_shield"], ["a:seal"]],
  },
};

// ---------------- 方案 ----------------
const ORIG = { SOURCES: structuredClone(SOURCES), BOSSES: structuredClone(BOSSES), RUINS: structuredClone(RUINS), zhenpan: structuredClone(GATHER.zhenpan) };
function resetTables() {
  for (const k of Object.keys(SOURCES)) delete SOURCES[k];
  Object.assign(SOURCES, structuredClone(ORIG.SOURCES));
  for (const k of Object.keys(BOSSES)) BOSSES[k] = structuredClone(ORIG.BOSSES[k]);
  for (const k of Object.keys(RUINS)) RUINS[k] = structuredClone(ORIG.RUINS[k]);
  GATHER.zhenpan = structuredClone(ORIG.zhenpan);
}
const setPick = (src, test, chance, pick) => { for (const e of SOURCES[src]) if (e.pick && test(e.pick)) { e.chance = chance; if (pick) e.pick = pick; } };
const isMom = (p) => p.some((x) => /xinfa_mom_(gather|chain)/.test(x[0]));
const isMom2 = (p) => p.some((x) => /xinfa_mom_(wave|return)/.test(x[0]));
const isOld = (p) => p.some((x) => /xinfa_(sharp|vajra|dash_shadow)/.test(x[0]));
const OLD_POOL = [["xinfa_dash_shadow", 1], ["xinfa_sharp", 1], ["xinfa_vajra", 1], ["xinfa_crit_thunder", 1], ["xinfa_ningshen", 1.5]];
function patchA() { // 方向一：只补缺口（草图 FIX）
  setPick("elite", isMom, 0.11);
  setPick("chest_glow", isMom, 0.12, [["xinfa_mom_gather", 3], ["xinfa_mom_chain", 3], ["xinfa_mom_haste", 2]]);
  SOURCES.chest_glow.push({ item: "xinfa_dash_flow", chance: 0.06 });
  setPick("chest_night", isMom2, 0.15);
  setPick("chest_night", isOld, 0.15, OLD_POOL);
  setPick("ruin_repeat", isOld, 0.25, OLD_POOL);
  setPick("ruin_repeat", isMom2, 0.2);
  BOSSES.bilin.first.push({ item: "art_gourd" });
  GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1], ["zhenpan_spirit", 1]] }];
}
const noSword = () => (RUINS.jianxiu.first = RUINS.jianxiu.first.filter((e) => e.item !== "art_flying_sword"));
const SCEN = {
  base: { name: "现状", slots: SLOTS_BASE, patch: () => {} },
  a: { name: "方向一·补缺口", slots: SLOTS_BASE, patch: patchA },
  b: { name: "方向二·本命提前", slots: { ...SLOTS_BASE, art: [[5, 1]] }, patch: () => (patchA(), noSword()), qingyaArt: !0, formChoice: !0 },
  c: { name: "方向三·入门定向", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [6, 2]] }, patch: () => (patchA(), noSword()), intro: !0, bias: 0.6, ruinArt: !0, formChoice: !0, noSharp: !0 },
  // 框架 v0.1：心法栏练二（入门五选一）、练八第 2 栏；法宝栏练六，法宝匣 = 练六突破 / 青牙首杀 / 剑修遗府首通，先开者三选一成本命；
  //            剑修遗府首通另给阵盘三选一 + 寒冰锥；心法掉落 60% 偏向所选流派；练四不再送《锋锐》
  gp: {
    name: "框架 v0.1", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [8, 2]], art: [[6, 1]] },
    patch: () => { patchA(); noSword(); GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1]] }]; },
    intro: !0, bias: 0.6, boxL6: !0, qingyaArt: !0, ruinArt: !0, ruinForm: !0, noSharp: !0,
  },
  // 数值建议 A：框架 v0.1 + 练四突破"玄机子传功"= 本流派★法术完本（练四原来送《锋锐》的位置）→ ★三件 = 练二 / 练四 / 练六 三拍定向
  rec: {
    name: "框架+练四传功", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [8, 2]], art: [[6, 1]] },
    patch: () => { patchA(); noSword(); GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1]] }]; },
    intro: !0, bias: 0.6, boxL6: !0, qingyaArt: !0, ruinArt: !0, ruinForm: !0, noSharp: !0, grantStarL4: !0,
    wuxExtra: { stele: 1, ruin: 4, qingya: 6, bilin: 10, zhuji: 0 }, // 03 §2.2 建议的悟性新来源：拓碑 +1、遗府首通 +4、青牙 / 碧鳞首杀 +6 / +10
  },
  rec_b0: { name: "框架+传功·无偏置", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [8, 2]], art: [[6, 1]] }, patch: () => { patchA(); noSword(); GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1]] }]; }, intro: !0, bias: 0, boxL6: !0, qingyaArt: !0, ruinArt: !0, ruinForm: !0, noSharp: !0, grantStarL4: !0 },
  rec_b40: { name: "框架+传功·偏置40%", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [8, 2]], art: [[6, 1]] }, patch: () => { patchA(); noSword(); GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1]] }]; }, intro: !0, bias: 0.4, boxL6: !0, qingyaArt: !0, ruinArt: !0, ruinForm: !0, noSharp: !0, grantStarL4: !0 },
  // 数值建议 B：框架 v0.1 + 入门时给★法术残页 1 页 + "道途残碑"：残碑 50% 改出本流派★法术的残页
  rec2: {
    name: "框架+道途残碑", slots: { ...SLOTS_BASE, xinfa: [[2, 1], [8, 2]], art: [[6, 1]] },
    patch: () => { patchA(); noSword(); GATHER.zhenpan = [{ pick: [["zhenpan_sword", 1]] }]; },
    intro: !0, bias: 0.6, boxL6: !0, qingyaArt: !0, ruinArt: !0, ruinForm: !0, noSharp: !0, introPage: !0, steleBias: 0.5,
  },
};

// ---------------- 单个玩家 ----------------
function simulate(traj, bk, sk, persona, seed) {
  const rng = mulberry32(seed);
  const B = BUILDS[bk], S = SCEN[sk];
  const profile = { realm: { stage: 1, layer: 1 }, flags: { learned: { spells: [], xinfa: [], formations: [] } }, stats: { fortune: 0, pity: { mobNoGear: 0, jackpot: 0 } } };
  const usable = {}; // key → 可用的层数（拿到那局结束时的层数；栏位另算）
  const usableRun = {}; // key → 第几局开局时可用
  const pages = {};
  let wux = 0, wuxIn = 0, curL1 = 1, curRun = 1;
  const mark = (k) => { if (!(k in usable)) (usable[k] = curL1), (usableRun[k] = curRun + 1); };
  const learned = (k) => k in usable;
  const learn = (k) => {
    if (learned(k)) return !1;
    mark(k);
    const [t, id] = k.split(":");
    if (t === "s") profile.flags.learned.spells.push(id);
    if (t === "x") profile.flags.learned.xinfa.push(id);
    if (t === "f") profile.flags.learned.formations.push(id);
    return !0;
  };
  const xinfaGet = (id) => {
    if (S.bias && rng() < S.bias) { const left = B.school.filter((x) => !learned("x:" + x)); if (left.length) id = left[Math.floor(rng() * left.length)]; }
    learn("x:" + id);
  };
  const take = (items) => {
    for (const it of items) {
      const id = it.id, def = ITEMS[id] || {};
      if (PAGE_ITEM[id]) pages[PAGE_ITEM[id]] = (pages[PAGE_ITEM[id]] || 0) + (it.n || 1);
      else if (BOOK_ITEM[id]) { if (!learn("s:" + BOOK_ITEM[id])) (wux += GONGFA.wuxPerBook), (wuxIn += GONGFA.wuxPerBook); }
      else if (def.kind === "xinfa" && def.teaches) xinfaGet(def.teaches);
      else if (ART_ITEM[id]) learn("a:" + ART_ITEM[id]);
      else if (FORM_ITEM[id]) learn("f:" + FORM_ITEM[id]);
      else if (def.cat === "gear") {
        const aff = it.affixes || [];
        for (const a of aff) if (a.stat === "special" && a.xinfa) mark("gx:" + a.xinfa);
        if (def.slot === "sword" && aff.some((a) => a.stat === "momGain" || a.stat === "chargeDmg")) mark("g:sword_mom");
        if (def.slot === "jade" && aff.some((a) => a.stat === "crit")) mark("g:jade_crit");
      }
    }
  };
  const cave = () => {
    for (const [sp, n] of Object.entries(pages)) {
      if (!n) continue;
      if (learned("s:" + sp)) { wux += n * PAGE_WUX[sp]; wuxIn += n * PAGE_WUX[sp]; pages[sp] = 0; continue; }
      if (n >= SPELL_PAGES[sp]) { learn("s:" + sp); const ex = n - SPELL_PAGES[sp]; wux += ex * PAGE_WUX[sp]; wuxIn += ex * PAGE_WUX[sp]; pages[sp] = 0; }
    }
    for (const sp of B.want) {
      const n = pages[sp] || 0, miss = SPELL_PAGES[sp] - n;
      if (!learned("s:" + sp) && n >= GONGFA.fillMinHave && miss > 0 && wux >= miss * GONGFA.fillCost) { wux -= miss * GONGFA.fillCost; pages[sp] = 0; learn("s:" + sp); }
    }
  };
  const openBox = () => { // 法宝匣：先开者 = 本命，按流派选
    if (!learned("a:" + B.art)) return learn("a:" + B.art);
  };
  learn("s:sword_qi");
  let qingyaDone = !1, r1Ruin = !1, r2Ruin = !1, formDone = !1;
  const winP = persona === "新手" ? 0.65 : 0.85;
  const wuxByRun = [];
  for (const row of traj) {
    const L = row.l0;
    curRun = row.run;
    profile.realm = L >= 10 ? { stage: 2, layer: 1 } : { stage: 1, layer: L };
    if (row.run === 1) { curL1 = row.l1; wuxByRun.push(0); continue; } // 教学局
    let region = row.region, type = "normal";
    if (region === "r1" && !r1Ruin && row.run >= 3) (type = "ruin"), (r1Ruin = !0);
    else if (region === "r2" && !r2Ruin) (type = "ruin"), (r2Ruin = !0);
    else if (row.boss2) type = "boss";
    else if (!qingyaDone && L >= 6) (region = "r1"), (type = "boss");
    const greedy = rng() < GREEDY_P[persona];
    const { c: C, night } = contact(region, type, greedy);
    const frac = row.ok ? 1 : 0.35 + 0.65 * rng();
    const keepP = row.ok ? 1 : region === "r1" ? 0.5 : 0.42;
    const loot = [];
    const roll = (src, o, n) => { for (let k = 0, m = sround(rng, n * frac); k < m; k++) loot.push(...rollLoot(src, { region, profile, rng, level: Math.min(L, 9), ...o })); };
    for (const [key, n] of Object.entries(C)) {
      const [cat, sub] = key.split(":");
      if (cat === "mob") roll(LOW.has(sub) ? "mob_low" : "mob", { enemy: sub }, n);
      else if (cat === "elite") roll("elite", { enemy: sub }, n);
      else if (cat === "rare") roll("rare_variant", { enemy: sub }, n);
      else if (cat === "chest") roll("chest_normal", {}, n);
      else if (cat === "gchest") roll("chest_glow", {}, n);
      else if (cat === "pav") roll("pavilion", {}, n);
      else if (cat === "stele") {
        if (S.wuxExtra) { const m = sround(rng, n * frac); wux += m * S.wuxExtra.stele; wuxIn += m * S.wuxExtra.stele; }
        if (S.steleBias && B.starSpell !== "earth_shield" && learned("x:" + B.intro)) { for (let k = 0, m = sround(rng, n * frac); k < m; k++) loot.push(...(rng() < S.steleBias ? [{ id: B.starSpell === "fire_talisman" ? "scroll_fire_page" : `scroll_${B.starSpell}_page`, n: 1, affixes: [] }] : rollLoot("stele_" + sub, { region, profile, rng }))); }
        else roll("stele_" + sub, {}, n);
      }
      else if (cat === "glow") roll("gather_" + sub, {}, n);
    }
    if (region === "r1" && type === "ruin") roll("mob", { enemy: "golem" }, 2); // 山神庙地窖固定 2 只石傀
    roll("chest_night", {}, night);
    let qingyaWin = !1;
    if (type === "ruin") loot.push(...rollLoot("ruin_first", { region, profile, rng, level: L }));
    if (type === "boss") {
      if (region === "r1") { if (rng() < winP) { qingyaWin = qingyaDone = !0; loot.push(...rollLoot("boss_first", { region, profile, rng, level: L, boss: "qingya" })); } }
      else loot.push(...rollLoot("boss_first", { region, profile, rng, level: L, boss: "bilin" }));
    }
    if (S.wuxExtra && row.ok) {
      const add = (type === "ruin" ? S.wuxExtra.ruin : 0) + (qingyaWin ? S.wuxExtra.qingya : 0) + (type === "boss" && region === "r2" ? S.wuxExtra.bilin : 0);
      wux += add; wuxIn += add;
    }
    curL1 = row.l1;
    const keep = loot.filter((it) => row.ok || ((ITEMS[it.id] || {}).tags || []).includes("key") || (it.tags || []).includes("key") || rng() < keepP);
    take(keep);
    // 选择点（匣子是 key 物品，身陨不丢）
    if (qingyaWin && S.qingyaArt) openBox();
    if (type === "ruin" && region === "r2") { if (S.ruinArt) openBox(); if (S.ruinForm) learn("f:" + B.form); }
    if (S.boxL6 && row.l1 >= 6) openBox();
    if (S.formChoice && !formDone && row.l1 >= 7) { formDone = !0; learn("f:" + B.form); } // 草图：练七"阵盘三选一 / 二选一"
    // 突破赠予
    if (S.intro && row.l1 >= 2) {
      if (learn("x:" + B.intro) && S.introPage && B.starSpell !== "earth_shield") pages[B.starSpell] = (pages[B.starSpell] || 0) + 1;
      if (B.starSpell === "earth_shield" && (S.introPage || S.grantStarL4)) learn("s:earth_shield"); // 守御：入门即给土遁护体
    }
    if (S.grantStarL4 && row.l1 >= 4) learn("s:" + B.starSpell);
    if (!S.noSharp && row.l1 >= 4) learn("x:sharp");
    const nSp = profile.flags.learned.spells.length;
    if (row.l0 < 3 && row.l1 >= 3 && nSp < 2) learn("s:earth_shield"); // 开栏保底（gongfa.js spellFallback）
    if (row.l0 < 7 && row.l1 >= 7 && profile.flags.learned.spells.length < 3) learn(learned("s:rock") ? "s:earth_shield" : "s:rock");
    if (row.l1 >= 10) learn("s:earth_shield");
    cave();
    wuxByRun.push(wuxIn);
  }
  // 部件"可用层" = max(拿到时的层, 栏位开的层)
  const slotLayer = (tab, need = 1) => { const e = (tab || []).find(([, x]) => x >= need); return e ? e[0] : 99; };
  const sl = S.slots;
  const xinfaLayer = (k) => (k.startsWith("x2:") ? slotLayer(sl.xinfa, 2) : slotLayer(sl.xinfa, 1));
  const layerOf = (k) => {
    if (k === "slot:spell2") return slotLayer(sl.spell, 2);
    if (k === "slot:spell3") return slotLayer(sl.spell, 3);
    if (k === "slot:dash2") return 6;
    if (k.includes("&")) { const [t, ids] = k.split(":"); return Math.max(...ids.split("&").map((id) => layerOf(`${t}:${id}`))); }
    const [t, id] = k.split(":");
    if (t === "x" || t === "x2") { const g = usable["gx:" + id] ?? 99; return Math.min(g, Math.max(usable["x:" + id] ?? 99, xinfaLayer(k))); }
    if (t === "a") return Math.max(usable[k] ?? 99, slotLayer(sl.art));
    if (t === "f") return Math.max(usable[k] ?? 99, slotLayer(sl.form));
    if (t === "s") return Math.max(usable[k] ?? 99, 1);
    return usable[k] ?? 99;
  };
  const anyLayer = (keys) => Math.min(...keys.map(layerOf));
  const sketch = B.sketch ? B.sketch.map(([, keys]) => anyLayer(keys)) : null;
  const star = Math.max(...B.star.map(anyLayer));
  // 增强心法：本流派池里除入门以外的心法（含装备特殊词条），第一本的可用层
  const extraX = Math.min(99, ...B.school.filter((x) => x !== B.intro).map((x) => Math.min(usable["x:" + x] ?? 99, usable["gx:" + x] ?? 99)));
  // 层 → 局：第一次开局层 ≥ L 的局
  const runAtLayer = (Lv) => { const r = traj.find((x) => x.l0 >= Lv); return r ? r.run : 99; };
  return { sketch, star, starRun: star >= 99 ? 99 : runAtLayer(star), wuxByRun, qingyaRun: qingyaDone, extraX };
}

// ---------------- 汇总 ----------------
const q = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const LNAME = ["", "练一", "练二", "练三", "练四", "练五", "练六", "练七", "练八", "练九", "筑基"];
const lname = (l) => (l >= 99 ? "未" : LNAME[l] || "筑基后");
const res = { n: N, at: new Date().toISOString(), scen: {} };
for (const sk of SCEN_LIST) {
  resetTables();
  SCEN[sk].patch();
  const S = (res.scen[sk] = { name: SCEN[sk].name, builds: {} });
  console.log(`\n=== ${SCEN[sk].name}（${sk}）===`);
  for (const bk of Object.keys(BUILDS)) {
    const B = BUILDS[bk];
    const all = [];
    for (const per of PERSONAS) SCHED.personas[per].slice(0, N).forEach((t, i) => all.push({ per, r: simulate(t, bk, sk, per, 7 + i * 131 + bk.charCodeAt(0) * 17 + sk.charCodeAt(0)) }));
    const o = { persona: {} };
    // 草图口径：每层的成型度
    if (B.sketch) {
      o.sketchScore = LNAME.slice(1).map((_, i) => {
        const Lv = i + 1;
        return Math.round((B.sketch.reduce((s, _p, j) => s + all.filter((x) => x.r.sketch[j] <= Lv).length / all.length, 0) / B.sketch.length) * 100) / 100;
      });
      o.sketchPieces = B.sketch.map(([name], j) => ({ name, byLayer: LNAME.slice(1).map((_, i) => Math.round((all.filter((x) => x.r.sketch[j] <= i + 1).length / all.length) * 100) / 100) }));
      o.sketchDir = o.sketchScore.findIndex((s) => s >= 0.35) + 1 || 99;
      o.sketchOk = o.sketchScore.findIndex((s) => s >= 0.7) + 1 || 99;
    }
    for (const per of PERSONAS) {
      const rs = all.filter((x) => x.per === per).map((x) => x.r);
      const st = rs.map((r) => r.star), sr = rs.map((r) => r.starRun);
      const ex = rs.map((r) => r.extraX);
      o.persona[per] = { extraXBy: Object.fromEntries([6, 8, 10].map((Lv) => [LNAME[Lv], Math.round((ex.filter((x) => x <= Lv).length / rs.length) * 100) / 100])), starLayer: [q(st, 0.5), q(st, 0.9)], starRun: [q(sr, 0.5), q(sr, 0.9)], starBy: Object.fromEntries([3, 6, 9, 10].map((Lv) => [LNAME[Lv], Math.round((st.filter((x) => x <= Lv).length / rs.length) * 100) / 100])), wux: [4, 6, 8].map((k) => Math.round((rs.reduce((s, r) => s + (r.wuxByRun[k - 1] ?? r.wuxByRun[r.wuxByRun.length - 1]), 0) / rs.length) * 10) / 10) };
    }
    S.builds[bk] = o;
    const sk1 = B.sketch ? `草图口径 定向 ${lname(o.sketchDir)} 成型 ${lname(o.sketchOk)}（${o.sketchScore.map((s) => Math.round(s * 100)).join(" ")}）` : "草图口径 —";
    console.log(`${B.name}  ${sk1}`);
    for (const per of PERSONAS) {
      const p = o.persona[per];
      console.log(`   增强心法（本流派第 2 本）到手 练六/练八/筑基 ${Object.values(p.extraXBy).map((x) => Math.round(x * 100) + "%").join(" ")}`);
      console.log(`   ★三件 ${per}: 成型层 p50 ${lname(p.starLayer[0])} p90 ${lname(p.starLayer[1])} | 第 ${p.starRun[0] >= 99 ? "未" : p.starRun[0]} / ${p.starRun[1] >= 99 ? "未" : p.starRun[1]} 局 | 练三/六/九/筑基 已成型 ${Object.values(p.starBy).map((x) => Math.round(x * 100) + "%").join(" ")} | 悟性累计 第4/6/8局 ${p.wux.join(" / ")}`);
    }
  }
}
fs.writeFileSync("work/build_pieces.json", JSON.stringify(res, null, 1));
console.log("\nsaved work/build_pieces.json");
