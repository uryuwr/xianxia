// 洞府设施逻辑（模块 C）：只操作存档 profile，不碰界面。界面在 src/ui/cave/**。
// 修为与突破一律走 src/game/progression.js。
import { makeItem, defOf, valueOf, RARITY, ITEMS } from "../../core/items.js";
import { addXp, xpNeed, canBreak, breakthrough, realmName, applyUnlocks, heroStats } from "../progression.js";
import * as PROG from "../progression.js";
export { heroStats };
import { MEMORIES } from "./story.js";
import { PROGRESSION } from "../../data/progression.js";
import { scrollStudyList, studyScroll, spellFallback, recipePageTarget } from "../gongfa.js"; // 功法体系 v2（战斗设计）：参悟 / 法术栏保底赠予
import { FACILITIES, TIER_MAX, GARDEN_PLOTS, REFINE, JUQI_LIMIT, FALLBACK_ALCHEMY, FALLBACK_FORGE, AFFIX_POOL, itemId, itemName, normRecipes } from "./data.js";

// D 的配方表与掉落生成器（存在才用；import.meta.glob 在文件不存在时返回空对象）
const recipeMods = import.meta.glob("../../data/recipes.js", { eager: !0 });
const lootMods = import.meta.glob("../loot.js", { eager: !0 });
const recipeMod = Object.values(recipeMods)[0] || null;
const lootMod = Object.values(lootMods)[0] || null;

// ---------------- 采用内容模块（D）的数值表：src/data/recipes.js 的 FACILITIES / REFINE / GARDEN / HEAT / PILL_RULES ----------------
export const RULES = {
  juqi: JUQI_LIMIT, // 每个小境界最多服用聚气丹
  pillCap: 3, // 丹药栏每栏枚数（起始）
  pillCapMax: 5,
  relocatePlots: 2, // 搬迁后药园多出的地块
  grades: [[0.4, -1], [0.6, 0], [0.8, 1], [0.95, 2], [1.01, 3]], // 火候带内比例 → 品质
  mastery: 0, // 同一丹方成功几次后"熟练"（0 = 炼出仙品即熟练）
  waste: "废丹", // 废丹产出的物品名（null 不产出）
  bind: { stones: 100, forge: 2, debuff: 0.1 },
  herbBand: [1, 1.1, 1.2, 1.35, 1.5], // 火候带宽 × herbBand[投入灵草的最高品级]
  // 药园 v2（recipes.js GARDEN；docs/review/numeric/药园与重铸_v1.md）：开局 1 块地；种子年份是品级的别名（凡十年…极千年）
  garden: {
    plots: [1, 2, 3, 4], // 药园等级 → 地块数
    growth: [1, 1.25, 1.6, 2], // 药园等级 → 生长速度
    yearRuns: [1, 1.5, 2.5, 4, 7], // 年份（品级）→ 所需出行次数倍率
    relocate: 1, // 搬到区域二后（药园 ≥ 1 级）多开的地块
    seeds: null, // 种子 id → { herb, runs, yield }（缺省读物品定义的 seed）
    fertilize: { item: "ling_tu", n: [0, 1, 2, 3, 4], mul: 1.5 }, // 种下时施灵土：消耗 n[年份] 份，生长 ×mul（十年种子不能施）
    harvestQuality: [0.15, 0.7, 0.15], // 收获品质 = 种子年份 −1 / 0 / +1 的概率
    harvestSeed: 0.3, // 收获时再得 1 颗同年份种子的概率
  },
  // 炼器鼎·重铸词条（recipes.js REFORGE）：价格 = stones[品级] × min(growth^次数, maxMul) + items[品级]；
  //   心法类词条 special.mode "swap" 只换成另一条心法词条，价格 ×costMul；附灵词条 imbue "locked" 不能重铸；极品需 forgeTop 级炼器鼎
  reforge: { forge: 1, forgeTop: 2, stones: [null, 30, 80, 200, 500], items: null, growth: 1.15, maxMul: 4, special: { mode: "swap", costMul: 2 }, imbue: "locked" },
  source: "fallback",
};
export const YEAR = ["十年", "五十年", "百年", "三百年", "千年"];
(function adopt(D) {
  if (!D) return;
  RULES.source = "recipes.js";
  if (D.FACILITIES)
    for (const [id, f] of Object.entries(D.FACILITIES)) {
      const mine = FACILITIES[id];
      if (!mine) continue;
      if (id === "garden" && !(D.GARDEN && (D.GARDEN.growth || D.GARDEN.yearRuns))) continue;
      if (f.start != null) mine.start = f.start;
      if (f.max != null) mine.max = f.max;
      if (f.unlock) mine.unlock = f.unlock;
      if (Array.isArray(f.cost))
        mine.cost = f.cost.map((c) => {
          if (!c) return null;
          const o = {};
          if (c.stones) o.stones = c.stones;
          for (const [k, v] of Object.entries(c.items || {})) o[itemName(k)] = v;
          if (c.relocate || c.auto) o.relocate = !0;
          return o;
        });
    }
  if (D.REFINE && Array.isArray(D.REFINE.stone)) REFINE.stone = D.REFINE.stone;
  if (D.REFINE && Array.isArray(D.REFINE.treasureRarity)) REFINE.treasureRarity = D.REFINE.treasureRarity;
  if (D.REFINE && D.REFINE.named) for (const [k, v] of Object.entries(D.REFINE.named)) REFINE.named[itemName(k)] = v;
  // 药园：数值表是 v2 格式（有 growth / yearRuns）才整套采用，否则保留 v2 兜底（旧表 plots[0] = 0 与"开局 1 块地"冲突）
  const G = D.GARDEN;
  if (G && (G.growth || G.yearRuns)) {
    const RG = RULES.garden;
    for (const k of ["plots", "growth", "yearRuns", "fertilize", "harvestQuality", "harvestSeed"]) if (G[k] != null) RG[k] = G[k];
    if (G.relocateBonus != null) RG.relocate = G.relocateBonus;
    if (G.seeds) RG.seeds = G.seeds;
  } else if (D.FACILITIES && D.FACILITIES.garden) {
    // 旧表的药园花费 / 等级上限是 v1 的，药园用 v2 兜底
    Object.assign(FACILITIES.garden, { start: 0, max: 3, cost: [{ stones: 50, "灵土": 3 }, { stones: 120, "灵土": 5 }, { stones: 240, "灵土": 8 }] });
  }
  RULES.relocatePlots = RULES.garden.relocate;
  GARDEN_PLOTS.splice(0, GARDEN_PLOTS.length, ...RULES.garden.plots);
  if (D.REFORGE) Object.assign(RULES.reforge, D.REFORGE);
  if (D.HEAT) {
    if (Array.isArray(D.HEAT.grades)) RULES.grades = D.HEAT.grades.map(([th, g]) => [th, g]);
    if (D.HEAT.masteryAfter) RULES.mastery = D.HEAT.masteryAfter;
    if (Array.isArray(D.HEAT.herbBand)) RULES.herbBand = D.HEAT.herbBand;
    if ("wasteItem" in D.HEAT) RULES.waste = D.HEAT.wasteItem ? itemName(D.HEAT.wasteItem) : null;
  }
  if (PROGRESSION.pillCap) (RULES.pillCap = PROGRESSION.pillCap.base ?? RULES.pillCap), (RULES.pillCapMax = PROGRESSION.pillCap.max ?? RULES.pillCapMax);
  if (D.PILL_RULES) {
    if (D.PILL_RULES.juqiPerLayer) RULES.juqi = D.PILL_RULES.juqiPerLayer;
    if (D.PILL_RULES.perSlot) RULES.pillCap = D.PILL_RULES.perSlot;
    if (D.PILL_RULES.perSlotMax) RULES.pillCapMax = D.PILL_RULES.perSlotMax;
  }
  const bind = (D.FORGE || []).find((r) => r.kind === "bind");
  if (bind) RULES.bind = { stones: bind.stones ?? 100, forge: bind.forge ?? 2, debuff: bind.bloodDebuff ?? 0.1 };
})(recipeMod);

const rk = (p) => p.realm.stage + ":" + p.realm.layer;
const realmIdx = (p) => p.realm.stage * 10 + p.realm.layer;
const parseRealm = (s) => {
  const [a, b] = s.split(":").map(Number);
  return a * 10 + b;
};
export const STONE = () => itemId("灵石");

// ---------------- 洞府状态 ----------------
export function caveState(p) {
  const c = (p.cave = p.cave || {});
  c.region = c.region || "r1";
  c.facilities = c.facilities || {};
  for (const [id, f] of Object.entries(FACILITIES)) if (c.facilities[id] == null) c.facilities[id] = f.start;
  c.garden = c.garden || [];
  c.mastered = c.mastered || {};
  c.juqi = c.juqi || {};
  c.pillCap = c.pillCap || RULES.pillCap;
  c.brews = c.brews || {};
  c.pillCapUps = c.pillCapUps || 0;
  c.visited = c.visited || {};
  p.flags = p.flags || {};
  p.flags.learned = p.flags.learned || { spells: [], xinfa: [] };
  return c;
}
export const facLevel = (p, id) => caveState(p).facilities[id] || 0;
// 洞府"修缮度"0..1：设施等级超出起始值的部分，决定破洞府的外观
export function caveTier(p) {
  const f = caveState(p).facilities;
  let up = 0;
  for (const [id, d] of Object.entries(FACILITIES)) up += Math.max(0, (f[id] || 0) - d.start);
  return Math.min(1, up / TIER_MAX);
}

// ---------------- 花费 ----------------
// cost：{ stones, "物品名": n, relocate }
export function costList(cost) {
  if (!cost) return [];
  const out = [];
  if (cost.stones) out.push({ name: "灵石", id: STONE(), n: cost.stones });
  for (const [k, v] of Object.entries(cost)) if (k !== "stones" && k !== "relocate") out.push({ name: k, id: itemId(k), n: v });
  return out;
}
export function canAfford(p, cost) {
  return costList(cost).every((c) => p.storage.count(c.id) >= c.n);
}
export function missing(p, cost) {
  return costList(cost).filter((c) => p.storage.count(c.id) < c.n).map((c) => ({ ...c, have: p.storage.count(c.id) }));
}
export function pay(p, cost) {
  if (!canAfford(p, cost)) return !1;
  for (const c of costList(cost)) p.storage.consume(c.id, c.n);
  return !0;
}
function give(p, name, n = 1, o = {}) {
  const id = itemId(name);
  if (!ITEMS[id]) return null;
  const inst = makeItem(id, { n, ...o });
  p.storage.add(inst);
  return inst;
}

// ---------------- 设施升级 ----------------
export function upgradeInfo(p, id) {
  const f = FACILITIES[id], lv = facLevel(p, id);
  if (lv < 1 && f.unlock) return { lv, locked: !0, blocked: facUnlocked(p, id) ? "回洞府即复燃" : facLockText(id) }; // 按修为解锁，不用材料修复
  if (!f.cost || lv >= f.max) return { max: !0, lv };
  const cost = f.cost[lv];
  if (!cost) return { max: !0, lv };
  const relocated = caveState(p).region !== "r1";
  if (cost.relocate && !relocated) return { lv, cost, blocked: "搬迁到溪谷灵脉后可升级" };
  if (cost.relocate && Object.keys(cost).length === 1) return { lv, cost, blocked: "搬迁后自动提升" };
  return { lv, cost, ok: canAfford(p, cost), missing: missing(p, cost) };
}
export function upgrade(p, id) {
  const u = upgradeInfo(p, id);
  if (u.max || u.blocked || !u.ok) return !1;
  pay(p, u.cost);
  caveState(p).facilities[id] = u.lv + 1;
  return !0;
}

// ---------------- 丹炉 / 炼器鼎：按修为解锁（FACILITIES[id].unlock = { realm, recipes }） ----------------
// 突破到 unlock.realm 时自动到 1 阶（旧存档进洞府补），并送 unlock.recipes 里还不会的配方（记进 flags.recipes[配方 id]）
export const FAC_UNLOCK_TEXT = { furnace: "丹炉已复燃", forge: "炼器鼎已可用" };
export const facUnlockAt = (id) => (FACILITIES[id] && FACILITIES[id].unlock && FACILITIES[id].unlock.realm) || null;
export function facUnlocked(p, id) {
  const at = facUnlockAt(id), O = PROGRESSION.order;
  return !at || O.indexOf(rkOf(p.realm)) >= O.indexOf(at);
}
// "练气二层解锁"（层数从数据读）
export const facLockText = (id) => (facUnlockAt(id) ? PROG.realmKeyName(facUnlockAt(id)) + "解锁" : "");
// 到某境界会解锁的设施：[{ id, text }]（天机镜"下一层将得"用）
export const facUnlocksAt = (key) => Object.keys(FACILITIES).filter((id) => facUnlockAt(id) === key).map((id) => ({ id, text: FAC_UNLOCK_TEXT[id] || FACILITIES[id].name + "已可用" }));
// 返回本次解锁或补方的设施；value 为保留后的实际阶数，旧档已升级的设施不降阶。
export function unlockFacilities(p) {
  const c = caveState(p), out = [];
  for (const [id, f] of Object.entries(FACILITIES)) {
    if (!f.unlock || !facUnlocked(p, id)) continue;
    const newlyUnlocked = (c.facilities[id] || 0) < 1;
    if (newlyUnlocked) c.facilities[id] = 1;
    const fr = (p.flags.recipes = p.flags.recipes || {}), all = recipes(), got = [];
    for (const rid of f.unlock.recipes || []) {
      const isA = all.alchemy.some((x) => x.id === rid), r = (isA ? all.alchemy : all.forge).find((x) => x.id === rid);
      if (!r || recipeKnown(p, r)) continue; // 已会的不重复送
      fr[r.id] = !0;
      got.push({ kind: "recipe", id: r.id, name: r.name, book: isA ? "丹方" : "器方" });
    }
    if (newlyUnlocked || got.length) out.push({ key: id, value: c.facilities[id], text: FAC_UNLOCK_TEXT[id] || f.name + "已可用", recipes: got });
  }
  return out;
}

// ---------------- 灵泉炼化 ----------------
export function refineValue(p, inst) {
  const d = defOf(inst);
  if (!d) return 0;
  if (inst.id === STONE()) return REFINE.stone[facLevel(p, "spring")] * inst.n;
  return refineXpOf(inst);
}
// 灵物按品质加成（经济复核 v1：凡 / 灵 ×1、宝 ×1.3、仙 ×1.7、极 ×2.2；表不存在时 ×1）；妖丹品质固定，不乘
export function treasureMul(inst) {
  const d = defOf(inst) || {};
  if (d.cat !== "treasure") return 1;
  const t = REFINE.treasureRarity;
  return (t && t[Math.max(0, Math.min(t.length - 1, inst.rarity || 0))]) || 1;
}
// 可投入炼化的物品（灵石单列；妖丹、灵物；筑基丹主药等配方关键材料不列入）
export function refinables(p) {
  return p.storage.items.filter((it) => {
    const d = defOf(it);
    return d && it.id !== STONE() && (d.cat === "core" || d.cat === "treasure") && refineValue(p, it) > 0;
  });
}
export function xpRoom(p) {
  return Math.max(0, xpNeed(p) - p.xp);
}
// 炼化：stones 为投入灵石数，uids 为投入的妖丹 / 灵物；返回实际获得的修为
export function refine(p, stones = 0, uids = []) {
  const per = REFINE.stone[facLevel(p, "spring")];
  stones = Math.min(stones, p.storage.count(STONE()));
  let gain = 0;
  for (const uid of uids) {
    const it = p.storage.items.find((x) => x.uid === uid);
    if (!it) continue;
    gain += refineValue(p, it);
    p.storage.remove(uid);
  }
  if (stones > 0) p.storage.consume(STONE(), stones), (gain += stones * per);
  return addXp(p, gain, "refine");
}
// 修为上限内最多还能投入多少灵石
export function stoneCap(p) {
  const per = REFINE.stone[facLevel(p, "spring")] || 1;
  return Math.min(p.storage.count(STONE()), Math.ceil(xpRoom(p) / per));
}
// 聚气丹：每个小境界最多 3 枚
export function juqiUsed(p) {
  return caveState(p).juqi[rk(p)] || 0;
}
export function takeXpPill(p, uid) {
  const it = p.storage.items.find((x) => x.uid === uid);
  const d = it && defOf(it);
  if (!d || !d.use || d.use.xp == null) return { ok: !1, why: "不是增长修为的丹药" };
  if (juqiUsed(p) >= RULES.juqi) return { ok: !1, why: `丹毒：本小境界已服用 ${RULES.juqi} 枚` };
  const xp = Array.isArray(d.use.xp) ? d.use.xp[Math.min(d.use.xp.length - 1, it.rarity || 0)] : d.use.xp;
  p.storage.remove(uid, it.n > 1 ? 1 : undefined);
  caveState(p).juqi[rk(p)] = juqiUsed(p) + 1;
  return { ok: !0, xp: addXp(p, xp, "pill") };
}
export function breakInfo(p) {
  const b = canBreak(p);
  return { ...b, name: realmName(p), need: b.need.map((x) => (x.type === "item" ? { ...x, name: itemName(x.id) } : x)) };
}
export function doBreakthrough(p) {
  const r = breakthrough(p);
  applyUnlocks(p);
  const fu = unlockFacilities(p); // 丹炉 / 炼器鼎到层自动解锁（送的配方在 u.recipes，洞府并进 grants）
  return Array.isArray(r) ? [...r, ...fu] : r;
}
// ---------------- 突破史：profile.stats.breakHistory ----------------
// 每次突破 push { run, at, day, playTime, from, to, xp 这一层消耗的修为, trial { id, tries } | null, stats 属性差值, base 到达时的属性快照,
//   unlocks, grants, memory }；旧存档按当前境界从练气一层起补全（run / at / day / playTime 为 null，legacy 标"旧事"）
// day：还没有日历，先记"第几天 = 出行次数 + 1"，同时维护 profile.stats.day
// 某境界的基础属性（不含本层修为进度加成）：突破史的差值与快照都用它，免得"修为已满带着进度加成"把差值算成一半
export const heroStatsAt = (realm) => heroStats({ realm: { ...realm }, xp: 0 }, { base: !0 });
export function statDiff(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = (b && b[k]) ?? 0, y = (a && a[k]) ?? 0;
    if (typeof x === "number" && typeof y === "number") out[k] = Math.round((x - y) * 1000) / 1000;
  }
  return out;
}
const rkOf = (r) => r.stage + ":" + r.layer;
export function syncDay(p) {
  p.stats = p.stats || {};
  return (p.stats.day = (p.stats.runs || 0) + 1);
}
// 心魔劫等试炼：失败一次记一次（flags.trialTries[起始境界]），通过时 tries = 失败次数 + 1
export function trialFailed(p, fromKey) {
  p.flags = p.flags || {};
  const T = (p.flags.trialTries = p.flags.trialTries || {});
  T[fromKey] = (T[fromKey] || 0) + 1;
  return T[fromKey];
}
export function recordBreak(p, { from, to, before, unlocks = [], grants = [], memory = null, xp = null, trial = null }) {
  ensureBreakHistory(p);
  const fk = rkOf(from);
  const fails = (p.flags && p.flags.trialTries && p.flags.trialTries[fk]) || 0;
  const e = {
    run: (p.stats && p.stats.runs) ?? null, at: Date.now(), day: syncDay(p), playTime: p.playTime ?? null, from: { ...from }, to: { ...to },
    xp: xp ?? PROGRESSION.xp[fk] ?? null,
    trial: trial ? { id: trial, tries: fails + 1 } : null,
    base: { ...heroStatsAt(to) },
    stats: statDiff(heroStatsAt(from), heroStatsAt(to)), // 两层基础属性之差（before 只作兼容，不再使用）
    unlocks: unlocks.map((u) => ({ key: u.key, value: u.value })),
    grants: grants.map((g) => ({ kind: g.kind, id: g.id, name: g.name, ...(g.book ? { book: g.book } : {}) })),
    memory,
  };
  p.stats.breakHistory.push(e);
  return e;
}
export function ensureBreakHistory(p) {
  p.stats = p.stats || {};
  if (Array.isArray(p.stats.breakHistory)) return p.stats.breakHistory;
  const H = (p.stats.breakHistory = []);
  const order = PROGRESSION.order, cur = order.indexOf(rkOf(p.realm)), start = order.indexOf("1:1");
  for (let i = start; i >= 0 && i < cur; i++) {
    const [fs, fl] = order[i].split(":").map(Number), [ts, tl] = order[i + 1].split(":").map(Number);
    const from = { stage: fs, layer: fl }, to = { stage: ts, layer: tl };
    const a = { realm: from, unlocks: {} }, b = { realm: to, unlocks: {} };
    applyUnlocks(a);
    applyUnlocks(b);
    const unlocks = Object.keys(b.unlocks).filter((k) => JSON.stringify(a.unlocks[k]) !== JSON.stringify(b.unlocks[k])).map((k) => ({ key: k, value: b.unlocks[k] }));
    for (const f of facUnlocksAt(order[i + 1])) unlocks.push({ key: f.id, value: 1 }); // 丹炉 / 炼器鼎按修为解锁
    const grants = ((PROGRESSION.grants && PROGRESSION.grants[order[i + 1]]) || []).filter((g) => !g.item).map((g) => ({ kind: g.spell ? "spells" : g.xinfa ? "xinfa" : "formations", id: g.spell || g.xinfa || g.formation })); // 赠送物品（g.item）旧事里不补记
    const tr = PROGRESSION.trial && PROGRESSION.trial[order[i]];
    H.push({
      run: null, at: null, day: null, playTime: null, legacy: !0, note: "旧事", from, to, xp: PROGRESSION.xp[order[i]] ?? null, trial: tr ? { id: tr, tries: null } : null,
      base: { ...heroStatsAt(to) }, stats: statDiff(heroStatsAt(from), heroStatsAt(to)), unlocks, grants, memory: MEMORIES[order[i + 1]] ? order[i + 1] : null,
    });
  }
  return H;
}
// 天机镜未读（UI 设计师 · 天机镜 v2）：最新一条（非旧事）突破记录还没在境界录里看过 → realm = 那一层的 key；
// 筑基后"拨出"的那条消息还没看过 → msg。已读记在 profile.flags.mirrorSeen = { realm: "1:7", msg: true }
export function mirrorUnread(p) {
  const H = (p.stats && p.stats.breakHistory) || [];
  let lastE = null;
  for (let i = H.length - 1; i >= 0; i--) if (!H[i].legacy) { lastE = H[i]; break; }
  const seen = (p.flags && p.flags.mirrorSeen) || {};
  const realm = lastE && rkOf(lastE.to) !== seen.realm ? rkOf(lastE.to) : null;
  const msg = p.realm.stage >= 2 && !seen.msg;
  return { realm, msg, any: !!(realm || msg) };
}
export function markMirrorSeen(p, what) {
  p.flags = p.flags || {};
  const seen = (p.flags.mirrorSeen = p.flags.mirrorSeen || {});
  if (what === "realm") {
    const u = mirrorUnread(p);
    if (u.realm) seen.realm = u.realm;
  } else if (what === "msg" && p.realm.stage >= 2) seen.msg = !0;
}

// 到达某境界自动获得的法术 / 心法（内容模块 PROGRESSION.grants），记进 profile.flags.learned；返回 [{ kind, id, name }]
const SPELL_NAMES = Object.values(import.meta.glob("../../data/skills.js", { eager: !0 }))[0] || {};
const ITEM_NAMES = Object.values(import.meta.glob("../../data/items.js", { eager: !0 }))[0] || {};
export function grantRealm(p) {
  const key = p.realm.stage + ":" + p.realm.layer;
  const list = (PROGRESSION.grants && PROGRESSION.grants[key]) || [];
  caveState(p);
  const L = p.flags.learned;
  const out = [];
  for (const g of list) {
    if (g.item) {
      const r = grantSlotItem(p, g);
      if (r) out.push(r);
      continue;
    }
    const kind = g.spell ? "spells" : g.xinfa ? "xinfa" : g.formation ? "formations" : null;
    const id = g.spell || g.xinfa || g.formation;
    if (!kind || !id) continue;
    L[kind] = L[kind] || [];
    if (L[kind].includes(id)) continue;
    L[kind].push(id);
    const tbl = kind === "spells" ? SPELL_NAMES.SPELLS : kind === "xinfa" ? ITEM_NAMES.XINFA : null;
    out.push({ kind, id, name: (tbl && tbl[id] && tbl[id].name) || id });
  }
  // 功法体系 v2：法术栏开了、已学法术却不够填 → 赠一门基础法术（练三 土遁护体、练七 落石诀，见 src/data/gongfa.js spellFallback）
  const fb = spellFallback(p, key);
  if (fb) {
    L.spells = L.spells || [];
    L.spells.push(fb);
    out.push({ kind: "spells", id: fb, name: (SPELL_NAMES.SPELLS && SPELL_NAMES.SPELLS[fb] && SPELL_NAMES.SPELLS[fb].name) || fb, fallback: !0 });
  }
  return out;
}
// 栏位开启时送的基础款（PROGRESSION.grants 里的 { item, rarity, equip }）：仓库和身上都没有这一栏的东西才送；每栏每个存档只判定一次（flags.slotGift[栏]）。
//   返回 { kind: "item", id, name, slot, equipped } 或 null（已判定过 / 栏位未开 / 已有同栏物品）
const slotOfDef = (d) => (d ? (d.cat === "artifact" ? "artifact" : d.slot || (d.gear && d.gear.slot)) : null);
export function grantSlotItem(p, g) {
  const d = ITEMS[g.item], slot = slotOfDef(d);
  if (!d || !slot) return null;
  p.flags = p.flags || {};
  const done = (p.flags.slotGift = p.flags.slotGift || {});
  if (done[slot] || !slotUnlocked(p, slot)) return null;
  done[slot] = g.item;
  const has = !!(p.equip && p.equip[slot]) || p.storage.items.some((it) => slotOfDef(defOf(it)) === slot);
  if (has) return null;
  const inst = makeItem(g.item, { rarity: g.rarity ?? 0, identified: !0 });
  const equipped = !!g.equip && !p.equip[slot];
  if (equipped) p.equip[slot] = inst;
  else p.storage.add(inst);
  return { kind: "item", id: g.item, name: d.name, slot, equipped };
}
// 旧存档补发：已过解锁层、该栏一直空着且仓库没有同栏物品的，补发一次（进洞府时调）
export function fillSlotGifts(p) {
  const order = PROGRESSION.order, cur = order.indexOf(rkOf(p.realm)), out = [];
  for (let i = 0; i <= cur && i < order.length; i++)
    for (const g of (PROGRESSION.grants && PROGRESSION.grants[order[i]]) || []) if (g.item) {
      const r = grantSlotItem(p, g);
      if (r) out.push(r);
    }
  return out;
}

// ---------------- 灵气充盈：炼化后的临时增益 ----------------
// 数值表：recipes.js 的 REFINE.buff = { name, tiers: [{ ratio, sec, label, mods: [{ stat, type, value }] }] }
//   档位按"本次炼化得到的修为 ÷ 这一层升下一层所需修为"取不超过它的最高一档；只在出行局内计时（流程组负责应用、倒计时与 HUD）
//   不叠加：新档 ≥ 旧档 → 替换并刷新时长；否则保留旧档，时长取两者较大值
// 存档：profile.buffs = [{ id: "lingqi", tier: 1–5, remain: 秒, mods }]（与 src/game/run/run.js 的 applyBuffs / buffMods 约定一致）
const LINGQI_FALLBACK = {
  name: "灵气充盈",
  tiers: [
    { ratio: 0.1, sec: 300, label: "一", mods: [{ stat: "vuln", type: "flat", value: -0.04 }] },
    { ratio: 0.25, sec: 300, label: "二", mods: [{ stat: "vuln", type: "flat", value: -0.06 }, { stat: "hp", type: "pct", value: 0.03 }] },
    { ratio: 0.45, sec: 360, label: "三", mods: [{ stat: "vuln", type: "flat", value: -0.08 }, { stat: "hp", type: "pct", value: 0.05 }] },
    { ratio: 0.7, sec: 420, label: "四", mods: [{ stat: "vuln", type: "flat", value: -0.1 }, { stat: "hp", type: "pct", value: 0.06 }, { stat: "atk", type: "pct", value: 0.03 }] },
    { ratio: 1.0, sec: 480, label: "五", mods: [{ stat: "vuln", type: "flat", value: -0.12 }, { stat: "hp", type: "pct", value: 0.08 }, { stat: "atk", type: "pct", value: 0.05 }] },
  ],
};
export const LINGQI = (recipeMod && recipeMod.REFINE && recipeMod.REFINE.buff) || LINGQI_FALLBACK;
export const LINGQI_ID = "lingqi";
const MOD_TXT = { vuln: "减伤", hp: "气血", atk: "攻击", mp: "真气", spell: "法力", def: "防御" };
export function modsText(mods) {
  return (mods || [])
    .map((m) => {
      const pct = m.type === "pct" || m.stat === "vuln" || Math.abs(m.value) < 1;
      const v = pct ? Math.round(Math.abs(m.value) * 100) + "%" : Math.abs(m.value);
      return m.stat === "vuln" ? (m.value < 0 ? `减伤 ${v}` : `易伤 ${v}`) : `${MOD_TXT[m.stat] || m.stat} ${m.value >= 0 ? "+" : "−"}${v}`;
    })
    .join(" · ");
}
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const tierOf = (t) => LINGQI.tiers[Math.max(0, Math.min(LINGQI.tiers.length - 1, t - 1))];
export function buffName(b) {
  const t = tierOf(b.tier);
  return `${LINGQI.name} · ${t.label}档`;
}
// 这次炼化 xp 修为（这一层需要 need）能得到哪一档；null = 不够一档
export function lingqiFor(p, xp, need = xpNeed(p)) {
  if (!(need > 0) || !isFinite(need)) return null;
  const ratio = xp / need;
  let t = 0;
  LINGQI.tiers.forEach((x, i) => ratio >= x.ratio - 1e-9 && (t = i + 1));
  if (!t) return null;
  const T = tierOf(t);
  return { tier: t, ratio, name: `${LINGQI.name} · ${T.label}档`, mods: T.mods.map((m) => ({ ...m })), sec: T.sec };
}
export function currentBuff(p, id = LINGQI_ID) {
  return (Array.isArray(p.buffs) ? p.buffs : []).find((b) => b && b.id === id) || null;
}
// 炼化后调用：返回 { buff, tierUp, got }
export function applyLingqi(p, xp, need = xpNeed(p)) {
  const got = lingqiFor(p, xp, need);
  if (!got) return null;
  if (!Array.isArray(p.buffs)) p.buffs = [];
  let b = currentBuff(p);
  const before = b ? b.tier : 0;
  if (!b) p.buffs.push((b = { id: LINGQI_ID, tier: got.tier, remain: got.sec, mods: got.mods }));
  else if (got.tier >= b.tier) Object.assign(b, { tier: got.tier, remain: got.sec, mods: got.mods });
  else b.remain = Math.max(b.remain || 0, got.sec);
  return { buff: b, tierUp: b.tier > before, got };
}

// 本层修为带来的常驻小加成：同境界修为为 0 时与现在的属性差（heroStats 支持按修为加成后自动生效）
export function layerBonus(p) {
  if (typeof PROG.progressBonusStats === "function") return PROG.progressBonusStats(p);
  const d = statDiff(heroStats(p, { base: !0 }), heroStats(p));
  return Object.fromEntries(Object.entries(d).filter(([, v]) => Math.abs(v) > 1e-6));
}

// ---------------- 鉴宝台 ----------------
export function unidentified(p) {
  return p.storage.items.filter((it) => it.identified === !1);
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
// 随机词条：D 的生成器优先（rollAffixes(slot, rarity, level)），否则按 §8.5 表
export function rollAffixes(slot, rarity, level = 1, actualRarity = rarity) {
  if (lootMod && typeof lootMod.rollAffixes === "function") {
    try {
      const r = lootMod.rollAffixes(slot, rarity, level, Math.random, actualRarity);
      if (Array.isArray(r)) return r;
    } catch {}
  }
  const pool = (AFFIX_POOL[slot] || AFFIX_POOL.jade).slice();
  const n = RARITY[rarity] ? RARITY[rarity].affixes : 0;
  const tier = Math.max(0, Math.min(2, rarity - 1));
  const regionK = 1 + 0.08 * Math.max(0, level - 1);
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [stat, type, vals] = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    let v = vals[tier] * rand(0.85, 1.15) * (type === "flat" && !["crit", "cdr", "bagCells"].includes(stat) ? regionK : 1);
    v = type === "pct" || ["crit", "cdr"].includes(stat) ? Math.round(v * 1000) / 1000 : Math.round(v);
    out.push({ stat, type, value: v });
  }
  if (rarity >= 3) out.push({ stat: "special", type: "flag", value: ["斩敌回气", "闪身留剑影", "暴击引雷", "首击必暴"][(Math.random() * 4) | 0] });
  return out;
}
// 鉴定一个物品实例（不依赖存档；结算页等其他模块可直接复用）：补全词条、标记已鉴定，返回实例
export function identifyItem(it) {
  if (!it || it.identified !== !1) return it;
  const d = defOf(it) || {};
  if ((d.cat === "gear" || d.cat === "artifact") && !(it.affixes || []).length) it.affixes = rollAffixes(d.slot || "jade", it.rarity || 0, it.level || 1);
  it.identified = !0;
  return it;
}
export function identify(p, uid) {
  const it = p.storage.items.find((x) => x.uid === uid);
  if (!it || it.identified !== !1) return null;
  return identifyItem(it);
}

// ---------------- 配方 ----------------
let recCache = null;
export function recipes() {
  if (recCache) return recCache;
  const n = normRecipes(recipeMod);
  const forge = ((n && n.forge) || FALLBACK_FORGE).filter((r) => r.kind !== "bind");
  recCache = { alchemy: (n && n.alchemy) || FALLBACK_ALCHEMY, forge, source: n ? "recipes.js" : "fallback" };
  return recCache;
}
export function recipeKnown(p, r) {
  if (r.known) return !0;
  const fr = (p.flags && p.flags.recipes) || {};
  if (!r.recipe) return !r.gift || !!fr[r.id]; // gift：设施解锁时赠送的基础配方，送了才会
  const rid = itemId(r.recipe);
  // 研读过（参悟蒲团）或者丹方 / 器方就在仓库里，都算会
  return !!(fr[r.recipe] || fr[rid] || fr[r.id] || p.storage.count(rid) > 0);
}
// 材料状态：每种 { name, id, need, have }
export function inputsOf(p, r, batch = 1) {
  const out = Object.entries(r.inputs || {}).map(([name, n]) => ({ name, id: itemId(name), need: n * batch, have: p.storage.count(itemId(name)) }));
  if (r.stones) out.push({ name: "灵石", id: STONE(), need: r.stones * batch, have: p.storage.count(STONE()) });
  return out;
}
export function inputsReady(p, r, batch = 1) {
  return inputsOf(p, r, batch).every((x) => x.have >= x.need);
}
// 按品级挑着取用材料：prefer "low" 先用次的（默认，省下好材料）| "high" 先用好的
// 返回每种材料实际取用到的最高品级 { 名称: 品级 }；dry = true 只预览不扣
function takeInputs(p, r, batch, prefer = "low", dry = !1) {
  const got = {};
  for (const x of inputsOf(p, r, batch)) {
    const stacks = p.storage.items.filter((it) => it.id === x.id).sort((a, b) => (prefer === "high" ? (b.rarity || 0) - (a.rarity || 0) : (a.rarity || 0) - (b.rarity || 0)));
    let left = x.need, top = 0;
    for (const it of stacks) {
      if (left <= 0) break;
      const k = Math.min(left, it.n || 1);
      top = Math.max(top, it.rarity || 0);
      if (!dry) p.storage.remove(it.uid, k < (it.n || 1) ? k : undefined);
      left -= k;
    }
    got[x.name] = top;
  }
  return got;
}
// 投入的灵草里最高的品级（炼丹带宽 × HEAT.herbBand[品级]）
function herbTop(r, got) {
  let q = 0;
  for (const name of Object.keys(r.inputs || {})) if ((defOf({ id: itemId(name) }) || {}).cat === "herb") q = Math.max(q, got[name] || 0);
  return q;
}
export function herbPreview(p, r, batch = 1, prefer = "low") {
  return herbTop(r, takeInputs(p, r, batch, prefer, !0));
}

// ---------------- 炼丹炉 ----------------
// 火候带宽：炉等级、药材品质越高越宽
export function alchemyBand(p, r, herbQ = 0) {
  const hb = RULES.herbBand[Math.max(0, Math.min(RULES.herbBand.length - 1, herbQ))] || 1;
  return (r.band || 0.2) * (1 + 0.25 * (facLevel(p, "furnace") - 1)) * hb;
}
// 火候评分：带内比例 → 品质（-1 废丹，0 下，1 中，2 上，3 极）
export function gradeOf(ratio) {
  for (const [th, g] of RULES.grades) if (ratio < th) return g;
  return 3;
}
// 丹品 = 丹药实例的 rarity，叫法只用 RARITY 一套（用户 2026-11-17）：0 凡品 1 灵品 2 宝品 3 仙品；-1 废丹（失控）
export const GRADE_NAME = { "-1": "废丹", 0: RARITY[0].name, 1: RARITY[1].name, 2: RARITY[2].name, 3: RARITY[3].name };
export function alchemyCanStart(p, r, batch = 1) {
  if (facLevel(p, "furnace") < (r.furnace || 1)) return { ok: !1, why: facLevel(p, "furnace") < 1 ? "丹炉未复燃 · " + facLockText("furnace") : `需要 ${r.furnace} 级丹炉` };
  if (!recipeKnown(p, r)) return { ok: !1, why: "尚无丹方" };
  if (!inputsReady(p, r, batch)) return { ok: !1, why: "材料不足" };
  return { ok: !0 };
}
// 开炉：扣材料；返回炼丹会话（交给火候小游戏）
export function alchemyStart(p, r, batch = 1, prefer = "low") {
  const c = alchemyCanStart(p, r, batch);
  if (!c.ok) return c;
  const herbQ = herbTop(r, takeInputs(p, r, batch, prefer));
  return { ok: !0, recipe: r, batch, herbQ, band: alchemyBand(p, r, herbQ), time: r.time || 18, mastered: isMastered(p, r) };
}
// 熟练：D 的规则是同方成功 N 次；兜底规则是炼出过仙品
export function isMastered(p, r) {
  const c = caveState(p);
  return RULES.mastery ? (c.brews[r.id] || 0) >= RULES.mastery : !!c.mastered[r.id];
}
export function alchemyFinish(p, session, grade) {
  const r = session.recipe;
  const out = [];
  if (r.minGrade != null) grade = Math.max(grade, r.minGrade);
  const c = caveState(p);
  if (grade < 0) {
    if (RULES.waste) out.push(give(p, RULES.waste, session.batch));
  } else {
    const inst = give(p, r.out, (r.n || 1) * session.batch, { rarity: grade });
    if (inst) out.push(inst);
    c.brews[r.id] = (c.brews[r.id] || 0) + 1;
    if (grade >= 3) c.mastered[r.id] = !0;
  }
  return { grade, items: out.filter(Boolean) };
}

// ---------------- 炼器鼎 ----------------
export function forgeCanCraft(p, r) {
  if (facLevel(p, "forge") < (r.forge || 1)) return { ok: !1, why: facLevel(p, "forge") < 1 ? "炼器鼎 · " + facLockText("forge") : `需要 ${r.forge} 级炼器鼎` };
  if (!recipeKnown(p, r)) return { ok: !1, why: "尚无器方" };
  if (r.realm && realmIdx(p) < parseRealm(r.realm)) return { ok: !1, why: "境界不足" };
  if (r.flag && !(p.flags && p.flags[r.flag])) return { ok: !1, why: r.flag === "region2" ? "进入竹海·溪谷后解锁" : "尚未解锁" };
  if (r.kind === "upgrade") {
    const cur = r.target === "bag" ? p.bagCapacity || 16 : r.target === "pouch" ? p.pouch.capacity : null;
    if (cur != null && cur >= r.value) return { ok: !1, why: "已拥有" };
    if (cur != null && r.needs && cur < r.needs) return { ok: !1, why: r.target === "bag" ? "需先炼成上一级储物袋" : "需先炼成上一级锦囊" };
    if (r.target === "pillCap" && (caveState(p).pillCapUps >= (r.max || 2) || caveState(p).pillCap >= RULES.pillCapMax)) return { ok: !1, why: "已达上限" };
  }
  if (r.kind === "imbue" && !imbueTarget(p)) return { ok: !1, why: "没有可附灵的法剑" };
  if (!inputsReady(p, r)) return { ok: !1, why: "材料不足" };
  return { ok: !0 };
}
export function forgeCraft(p, r) {
  const c = forgeCanCraft(p, r);
  if (!c.ok) return c;
  // 装备品级只看主材料（第一项，取用时先用好的）；灵草等辅材不参与（数值复核：防止高品灵草把法衣、玉佩抬成宝品 / 仙品）
  const main = Object.keys(r.inputs || {})[0];
  const got = takeInputs(p, r, 1, "high");
  const matR = main ? got[main] || 0 : 0;
  if (r.kind === "upgrade") {
    if (r.target === "bag") p.bagCapacity = r.value;
    else if (r.target === "pouch") p.pouch.capacity = r.value;
    else if (r.target === "pillCap") (caveState(p).pillCap += r.value), caveState(p).pillCapUps++;
    return { ok: !0, upgrade: r.target, value: r.target === "pillCap" ? caveState(p).pillCap : r.value };
  }
  if (r.kind === "item") return { ok: !0, item: give(p, r.out, r.n || 1) };
  if (r.kind === "imbue") {
    const sw = imbueTarget(p);
    sw.affixes = (sw.affixes || []).filter((a) => !String(a.stat).startsWith("imbue_"));
    sw.affixes.push({ stat: "imbue_" + r.element, type: "flat", value: 1 });
    return { ok: !0, imbue: r.element, item: sw };
  }
  // 装备：主材料品质决定上限，炼器鼎等级决定下限，有 25% 几率再升一品
  const floor = facLevel(p, "forge") - 1;
  let rarity = Math.max(floor, Math.min(3, matR));
  if (Math.random() < 0.25) rarity = Math.min(3, rarity + 1);
  const level = Math.max(1, p.realm.layer + (p.realm.stage >= 2 ? 9 : 0));
  const name = gearOut(p, r);
  const d = ITEMS[itemId(name)] || {};
  let base = [];
  if (lootMod && typeof lootMod.gearBase === "function") {
    try {
      base = lootMod.gearBase(d, level) || [];
    } catch {}
  }
  let inst;
  if (lootMod && typeof lootMod.makeGear === "function" && ITEMS[itemId(name)]) {
    // 内容模块的装备生成：基础属性按等级 / 品质由 gearStats 计算，不写进词条
    inst = lootMod.makeGear(itemId(name), rarity, level, { identified: !0, region: caveState(p).region });
    inst.identified = !0;
    p.storage.add(inst);
  } else inst = give(p, name, 1, { rarity, level, identified: !0, affixes: [...base, ...rollAffixes(d.slot || "sword", rarity, level)] });
  return { ok: !0, item: inst };
}
// 附灵的目标：身上的法剑，没有就取仓库里第一把已鉴定的法剑
export function imbueTarget(p) {
  if (p.equip && p.equip.sword) return p.equip.sword;
  return p.storage.items.find((it) => (defOf(it) || {}).slot === "sword" && (defOf(it) || {}).cat === "gear" && it.identified !== !1) || null;
}
// 装备的全部属性行：基础（内容模块 gearBase 或定义 base）+ 词条
export function gearLines(inst) {
  const d = defOf(inst) || {};
  const aff = inst.affixes || [];
  if (!["gear", "artifact"].includes(d.cat)) return { base: [], affixes: aff };
  let base = [];
  if (lootMod && typeof lootMod.gearBase === "function" && d.cat === "gear") base = lootMod.gearBase(d, inst.level || 1, inst.rarity || 0);
  else if (!aff.some((a) => a.base)) base = d.base || [];
  return { base: [...base, ...aff.filter((a) => a.base)], affixes: aff.filter((a) => !a.base) };
}
// 装备 → 属性加成（Stats.addAll 用）
export function gearMods(inst) {
  if (lootMod && typeof lootMod.gearStats === "function") return lootMod.gearStats(inst).filter((a) => a.type !== "flag" && a.stat !== "special");
  const g = gearLines(inst);
  return [...g.base, ...g.affixes].filter((a) => a.type !== "flag" && a.stat !== "special");
}
// 炼出的具体装备：区域二优先出二阶底材（内容模块有对应物品时）
export function gearOut(p, r) {
  const alt = (r.outAlt || []).filter((n) => ITEMS[itemId(n)]);
  if (!alt.length) return r.out;
  return caveState(p).region !== "r1" && alt[1] ? alt[1] : alt[0];
}
// 滴血认主：永久保护 1 件装备（炼器鼎 Lv2），只能有 1 件，更换需重新认主
export function canBind(p) {
  const B = RULES.bind;
  if (facLevel(p, "forge") < B.forge) return { ok: !1, why: `需要 ${B.forge} 级炼器鼎（搬迁到溪谷后可升级）` };
  if (p.storage.count(STONE()) < B.stones) return { ok: !1, why: `需要灵石 ${B.stones}` };
  return { ok: !0 };
}
export function bindGear(p, uid) {
  const c = canBind(p);
  if (!c.ok) return c;
  const all = [...p.storage.items, ...Object.values(p.equip || {}).filter(Boolean)];
  const it = all.find((x) => x.uid === uid);
  if (!it || !["gear"].includes((defOf(it) || {}).cat)) return { ok: !1, why: "只能认主装备" };
  for (const x of all) x.bound = !1;
  it.bound = !0;
  p.storage.consume(STONE(), RULES.bind.stones);
  p.flags.bloodDebuff = RULES.bind.debuff; // 下一局气血上限按比例降低（流程模块应用后清除）
  return { ok: !0, item: it };
}

// ---------------- 药园 ----------------
export const MAX_PLOTS = 8;
export function gardenPlots(p) {
  const c = caveState(p);
  const G = RULES.garden, lv = facLevel(p, "garden");
  const n = Math.min(MAX_PLOTS, (G.plots[Math.min(lv, G.plots.length - 1)] || 0) + (c.region !== "r1" && lv > 0 ? G.relocate || 0 : 0));
  while (c.garden.length < n) c.garden.push(null);
  return c.garden.slice(0, n);
}
export function gardenGrowth(p) {
  const G = RULES.garden;
  return G.growth[Math.min(facLevel(p, "garden"), G.growth.length - 1)] || 1;
}
// 种子信息：数值表 GARDEN.seeds 优先，否则读物品定义的 seed；herb 统一成物品名
export function seedInfo(it) {
  const d = defOf(it) || {};
  const s = (RULES.garden.seeds && RULES.garden.seeds[it.id]) || d.seed;
  if (!s) return null;
  return { herb: itemName(s.herb), runs: s.runs || 1, yield: s.yield || [3, 5] };
}
// 所需出行次数 = ceil(基础次数 × 年份倍率 / 药园生长速度 / (施了灵土 ? fertilize.mul : 1))，至少 1
// （随药园升级动态变快，已种下的也一样）
export function runsNeeded(p, runs, rarity = 0, fert = !1) {
  const G = RULES.garden;
  const mul = fert && G.fertilize ? G.fertilize.mul || 1 : 1;
  return Math.max(1, Math.ceil((runs * (G.yearRuns[Math.min(rarity, G.yearRuns.length - 1)] || 1)) / gardenGrowth(p) / mul));
}
// 施灵土（种下时可选）：十年种子不能施；消耗 fertilize.n[年份] 份灵土
export function fertCost(p, it) {
  const F0 = RULES.garden.fertilize;
  const r = (it && it.rarity) || 0;
  if (!F0 || r <= 0) return null;
  const n = Array.isArray(F0.n) ? F0.n[Math.min(r, F0.n.length - 1)] : F0.n || 1;
  if (!n) return null;
  const id = itemId(itemName(F0.item || "ling_tu"));
  return { id, name: itemName(id), n, ok: p.storage.count(id) >= n };
}
// 年份是品级（RARITY）的别名：显示成"百年 · 宝品"
export function yearLabel(r = 0) {
  return `${YEAR[r] || YEAR[0]} · ${(RARITY[r] || RARITY[0]).name}`;
}
export function seedName(it) {
  return `${(defOf(it) || {}).name}（${yearLabel(it.rarity || 0)}）`;
}
export function seeds(p) {
  return p.storage.items.filter((it) => (defOf(it) || {}).seed);
}
export function plant(p, plot, uid, fert = !1) {
  const c = caveState(p);
  gardenPlots(p);
  if (plot >= gardenPlots(p).length || c.garden[plot]) return !1;
  const it = p.storage.items.find((x) => x.uid === uid);
  const si = it && seedInfo(it);
  if (!si) return !1;
  const fc = fert ? fertCost(p, it) : null;
  if (fert && (!fc || !fc.ok)) return !1;
  if (fc) p.storage.consume(fc.id, fc.n);
  p.storage.remove(uid, it.n > 1 ? 1 : undefined);
  c.garden[plot] = { seed: it.id, herb: si.herb, runs: si.runs, yield: si.yield, rarity: it.rarity || 0, at: (p.stats && p.stats.runs) || 0, fert: !!fc };
  return !0;
}
// 地块状态：need 所需出行次数（含施灵土加速），stage 0 发芽 / 1 抽叶 / 2 成株 / 3 成熟
export function plotState(p, pl) {
  if (!pl) return null;
  const passed = ((p.stats && p.stats.runs) || 0) - pl.at;
  const need = runsNeeded(p, pl.runs, pl.rarity || 0, pl.fert === !0);
  const ripe = passed >= need, k = Math.min(1, passed / need);
  return { ...pl, rarity: pl.rarity || 0, year: yearLabel(pl.rarity || 0), passed, need, ripe, k, left: Math.max(0, need - passed), stage: ripe ? 3 : k < 0.34 ? 0 : k < 0.67 ? 1 : 2 };
}

// 成熟的灵草留在地里，不枯萎、不丢；玩家走到药园按 F 或在药园页点"采收"才收（收获物一律直接进仓库，与出行、身陨无关）
export function ripePlots(p) {
  return gardenPlots(p).map((pl, i) => [i, plotState(p, pl)]).filter(([, s]) => s && s.ripe).map(([i]) => i);
}
// 采收：only = 地块下标数组（不传 = 全部成熟的）；返回 [{ plot, herb 灵草实例, seed 种子实例 | null }]
export function harvestPlots(p, only = null) {
  const out = [];
  for (const i of only || ripePlots(p)) {
    const pl = caveState(p).garden[i];
    const got = harvest(p, i);
    if (!got) continue;
    out.push({ plot: i, herb: got[0], seed: got[1] || null, from: pl });
  }
  return out;
}
// 旧接口（兼容）：现在不在回府时调用
export function autoHarvest(p) {
  return harvestPlots(p).flatMap((r) => [r.herb, r.seed].filter(Boolean));
}
export function harvest(p, plot) {
  const c = caveState(p);
  const s = plotState(p, c.garden[plot]);
  if (!s || !s.ripe) return null;
  const G = RULES.garden;
  const n = s.yield[0] + Math.floor(Math.random() * (s.yield[1] - s.yield[0] + 1));
  // 品质 = 种子年份 −1 / 0 / +1（harvestQuality 概率），夹在 0–4
  const hq = G.harvestQuality || [0, 1, 0];
  let x = Math.random() * hq.reduce((a, b) => a + b, 0), d = -1;
  for (const w of hq) if ((x -= w) < 0) break; else d++;
  const q = Math.max(0, Math.min(4, s.rarity + Math.min(1, d)));
  c.garden[plot] = null;
  const out = [give(p, s.herb, n, { rarity: q })];
  if (Math.random() < (G.harvestSeed || 0)) out.push(give(p, itemName(s.seed), 1, { rarity: s.rarity }));
  return out.filter(Boolean);
}

// ---------------- 炼器鼎·重铸词条 ----------------
export const isSpecialAffix = (a) => a && (a.stat === "special" || a.type === "flag");
export const isImbueAffix = (a) => a && String(a.stat).startsWith("imbue_");
// 可重铸的装备：已鉴定、灵品以上、有随机词条（基础属性不算）
export function reforgeables(p) {
  return [...Object.values(p.equip || {}).filter(Boolean), ...p.storage.items].filter((it) => {
    const d = defOf(it) || {};
    return ["gear", "artifact"].includes(d.cat) && it.identified !== !1 && (it.rarity || 0) >= 1 && (it.affixes || []).some((a) => !a.base);
  });
}
// 这条词条能否重铸（附灵走附灵配方；心法类按 special.mode）
export function affixReforgeable(a) {
  const R = RULES.reforge;
  if (!a || a.base) return !1;
  if (isImbueAffix(a) && R.imbue === "locked") return !1;
  if (isSpecialAffix(a) && (R.special === "lock" || (R.special && R.special.mode === "lock"))) return !1;
  return !0;
}
// 价格：灵石 = stones[品级] × min(growth^已重铸次数, maxMul)（心法类 × special.costMul），另付 items[品级]
export function reforgeCost(it, a) {
  const R = RULES.reforge, r = Math.min(it.rarity || 0, 4);
  const base = (R.stones || R.cost || [])[r] || 0;
  let st = base * Math.min(Math.pow(R.growth || 1.15, it.reforged || 0), R.maxMul || Infinity);
  if (a && isSpecialAffix(a) && R.special && R.special.costMul) st *= R.special.costMul;
  const items = Object.entries((R.items && R.items[r]) || {}).map(([id, n]) => ({ id, name: itemName(id), n }));
  return { stones: Math.ceil(st), items };
}
export function canReforge(p, it, idx) {
  const R = RULES.reforge;
  const need = (it.rarity || 0) >= 4 ? R.forgeTop || R.forge || 1 : R.forge || 1;
  if (facLevel(p, "forge") < need) return { ok: !1, why: facLevel(p, "forge") < 1 ? "炼器鼎 · " + facLockText("forge") : `需要 ${need} 级炼器鼎` };
  if ((it.rarity || 0) < 1) return { ok: !1, why: "凡品没有词条可重铸" };
  const a = it && (it.affixes || [])[idx];
  if (!a || a.base) return { ok: !1, why: "选一条词条" };
  if (!affixReforgeable(a)) return { ok: !1, why: isImbueAffix(a) ? "附灵词条请走附灵" : "此词条不可重铸" };
  const cost = reforgeCost(it, a);
  if (p.storage.count(STONE()) < cost.stones) return { ok: !1, why: `需要灵石 ${cost.stones}`, cost };
  const lack = cost.items.find((x) => p.storage.count(x.id) < x.n);
  if (lack) return { ok: !1, why: `需要${lack.name} ${lack.n}`, cost };
  return { ok: !0, cost };
}
// 掷一条新词条：调用掉落用的 rollAffixes（同一套池子与数值），不与其他已有词条重复
function rollOne(it, idx) {
  const d = defOf(it) || {};
  const slot = d.cat === "artifact" ? "artifact" : d.slot || "sword";
  const rar = it.rarity || 0, lv = it.level || 1;
  const old = it.affixes[idx];
  // 排除这件装备已有的属性（含被重铸的这条：属性与数值都换）
  const others = new Set(it.affixes.filter((a) => !a.base).map((a) => (isSpecialAffix(a) ? "special:" + a.value : a.stat)));
  const special = isSpecialAffix(old);
  for (let k = 0; k < 60; k++) {
    // 心法类词条只在仙品以上掷得出，掷池按至少仙品取；普通词条按装备本身品质
    const list = rollAffixes(slot, special ? Math.max(3, rar) : Math.max(1, rar), lv, rar);
    for (const a of list) {
      if (special !== isSpecialAffix(a)) continue;
      if (isImbueAffix(a) && RULES.reforge.imbue === "locked") continue; // 附灵只走附灵配方，重铸也不掷出附灵
      const key = isSpecialAffix(a) ? "special:" + a.value : a.stat;
      if (others.has(key)) continue;
      return { ...a };
    }
  }
  return null;
}
// 重铸：付灵石、重铸次数 +1，返回新词条（还没替换；由 reforgeApply 决定保留 / 接受）
export function reforgeRoll(p, it, idx) {
  const c = canReforge(p, it, idx);
  if (!c.ok) return c;
  const neo = rollOne(it, idx);
  if (!neo) return { ok: !1, why: "此器已无别的词条可掷" };
  p.storage.consume(STONE(), c.cost.stones);
  for (const x of c.cost.items) p.storage.consume(x.id, x.n);
  it.reforged = (it.reforged || 0) + 1;
  return { ok: !0, cost: c.cost, old: { ...it.affixes[idx] }, neo };
}
export function reforgeApply(it, idx, neo) {
  if (!neo || !it.affixes[idx]) return !1;
  it.affixes[idx] = neo;
  return !0;
}

// ---------------- 物品用途（从配方与设施花费里自动汇总）与来源说明 ----------------
export const SOURCE_NOTE = {
  "灵土": "青岚山外土色发亮的灵土坡上采集，宝箱里也常见",
};
export function usesOf(it) {
  const d = defOf(it) || {};
  const name = d.name;
  if (!name) return [];
  const out = new Set();
  for (const [id, f] of Object.entries(FACILITIES)) for (const c of f.cost || []) if (c && c[name]) out.add(id === "garden" ? "药园扩建" : f.name + "升级");
  const G = RULES.garden.fertilize;
  if (G && itemName(G.item || "ling_tu") === name) out.add("药园施灵土");
  for (const it2 of Object.values(RULES.reforge.items || {})) if (it2) for (const k of Object.keys(it2)) if (itemName(k) === name) out.add("重铸词条");
  const { alchemy, forge } = recipes();
  for (const r of alchemy) if (r.inputs && r.inputs[name]) out.add("炼" + r.name.replace(/（.*）|\(.*\)/, ""));
  for (const r of forge) if (r.inputs && r.inputs[name]) out.add(r.name.replace(/（.*）|×\d+/g, "").trim());
  if (d.seed) out.add("药园移栽");
  if (typeof d.xp === "number" && d.xp > 0) out.add("灵泉炼化");
  return [...out];
}

// ---------------- 仓库：装备、化灵、调序 ----------------
// 拖拽调序：把 uid 挪到 before 前面（只改顺序，博古架据此摆放）
export function moveBefore(p, uid, before) {
  const L = p.storage.items, i = L.findIndex((x) => x.uid === uid);
  if (i < 0) return !1;
  const [it] = L.splice(i, 1);
  const j = L.findIndex((x) => x.uid === before);
  L.splice(j < 0 ? L.length : j, 0, it);
  return !0;
}
export const SLOT_NAME = PROG.SLOT_LABEL; // { sword: "法剑", robe: "法衣", jade: "玉佩", artifact: "法宝" }
// 栏位解锁：唯一判定在 src/game/progression.js 的 slotOpen（局内储物袋、出行准备、局内属性同一套）
export const slotUnlocked = (p, slot) => PROG.slotOpen(p, slot);
export const slotLockText = (slot) => PROG.slotLockText(slot);
// 旧存档修正：未解锁的栏位却装着东西（之前局内储物袋没查解锁）→ 退回仓库；返回退回的 [{ slot, it }]
export function fixLockedEquip(p) {
  const back = [];
  for (const slot of ["robe", "jade", "artifact"]) {
    const it = p.equip && p.equip[slot];
    if (!it || slotUnlocked(p, slot)) continue;
    p.equip[slot] = null;
    p.storage.add(it);
    back.push({ slot, it });
  }
  return back;
}
export function equip(p, uid) {
  const it = p.storage.items.find((x) => x.uid === uid);
  const d = it && defOf(it);
  if (!d || !["gear", "artifact"].includes(d.cat)) return { ok: !1, why: "不是装备" };
  if (it.identified === !1) return { ok: !1, why: "未鉴定，先去鉴宝台" };
  const slot = d.cat === "artifact" ? "artifact" : d.slot;
  if (!slotUnlocked(p, slot)) return { ok: !1, why: slotLockText(slot) };
  p.storage.remove(uid);
  const old = p.equip[slot];
  if (old) p.storage.add(old);
  p.equip[slot] = it;
  // 第一件法宝自动成为本命法宝
  if (slot === "artifact" && !p.nativeArtifact) p.nativeArtifact = it.uid;
  return { ok: !0, slot, old };
}
export function unequip(p, slot) {
  const it = p.equip[slot];
  if (!it) return !1;
  p.equip[slot] = null;
  p.storage.add(it);
  return !0;
}
function huaLingAllowed(it) {
  const d = it && defOf(it);
  return !!d && it.id !== STONE() && !d.quest && d.cat !== "quest";
}
// 能否化灵：不是灵石 / 剧情物，且按化灵表能折出灵石（数值表把关键物品、碧鳞内丹、千年何首乌、筑基丹列为不可化灵）
export function canHuaLing(it) {
  return huaLingAllowed(it) && huaLingStones(it) > 0;
}
// 不可化灵的物品（灵石本身除外）：界面上把化灵按钮置灰并提示"关键物品，不可化灵"
export function isKeyItem(it) {
  const d = it && defOf(it);
  return !!d && it.id !== STONE() && !canHuaLing(it);
}
// 化灵率：数值表 recipes.js 的 HUALING（{ rate: { 类别: 比例, default }, rarityMul: [凡, 灵, 宝, 仙, 极] }，或直接给函数 HUALING(inst)）。
// 没有表时兜底：灵值五成，且对能炼化的妖丹 / 灵物封顶——保证"化灵再炼化 ≤ 直接炼化"（按灵泉最高等级的灵石修为算）。
const HUALING = recipeMod && (recipeMod.HUALING || recipeMod.hualing);
export function huaLingStones(it) {
  if (!huaLingAllowed(it)) return 0;
  const d = defOf(it);
  if (typeof HUALING === "function") return Math.max(0, Math.floor(HUALING(it) || 0));
  if (HUALING && typeof HUALING.stones === "function") return Math.max(0, Math.floor(HUALING.stones(it) || 0));
  if (HUALING) {
    const R = HUALING.rate || HUALING.rates || HUALING.byCat || {};
    const rate = R[d.cat] ?? R.default ?? HUALING.default ?? 0.5;
    const mul = (HUALING.rarityMul || HUALING.rarity || [])[it.rarity || 0] ?? 1;
    return Math.max(0, Math.floor(valueOf(it) * rate * mul));
  }
  let v = Math.floor(valueOf(it) * 0.5);
  const xp = refineXpOf(it);
  if (xp > 0) v = Math.min(v, Math.floor(xp / Math.max(...REFINE.stone)));
  return v;
}
// 物品直接炼化的修为（不看灵泉等级；灵石除外）
function refineXpOf(it) {
  const d = defOf(it);
  if (!d || it.id === STONE()) return 0;
  if (typeof d.xp === "number") return Math.round(d.xp * (it.n || 1) * treasureMul(it)); // 内容模块给出的炼化修为
  if (REFINE.named[d.name] != null) return Math.round(REFINE.named[d.name] * (it.n || 1) * treasureMul(it));
  if (d.cat === "core") return Math.round(valueOf(it) * REFINE.coreRate);
  if (d.cat === "treasure") return Math.round(valueOf(it) * REFINE.treasureRate);
  return 0;
}
export function huaLingValue(p, uids) {
  return uids.reduce((s, uid) => s + huaLingStones(p.storage.items.find((x) => x.uid === uid)), 0);
}
// 灵石 → 修为（按当前灵泉等级）
export function stonesToXp(p, n) {
  return n * (REFINE.stone[facLevel(p, "spring")] || 0);
}
// 灵泉里的对比：直接炼化 vs 化灵后再炼化灵石；best = "refine" | "hualing"
export function refineCompare(p, it) {
  const direct = refineValue(p, it);
  const stones = huaLingStones(it);
  const via = stonesToXp(p, stones);
  return { direct, stones, via, best: via > direct ? "hualing" : "refine" };
}
export function huaLing(p, uids) {
  const v = huaLingValue(p, uids);
  for (const uid of uids) {
    const it = p.storage.items.find((x) => x.uid === uid);
    if (canHuaLing(it)) p.storage.remove(uid);
  }
  if (v > 0) give(p, "灵石", v);
  return v;
}

// ---------------- 参悟蒲团 ----------------
// 功法残卷：def.teaches（法术 / 心法 id），def.pages 需集齐的页数（默认 1，完整秘籍）
// 功法体系 v2（战斗设计）：cat "scroll" 的条目交给 src/game/gongfa.js（完本按整本计页、悟性补页、灵石代价、已学会的残页化为悟性）；丹方 / 器方（recipe）仍走这里
export function studyList(p) {
  const seen = new Map();
  for (const it of p.storage.items) {
    const d = defOf(it);
    if (!d || d.cat !== "recipe" || it.identified === !1) continue;
    // 丹方残页（pageTargets）：目标是按顺序第一本还没拥有的丹方；都有了 → 不进参悟列表（只能化灵）
    const pt = d.pageTargets ? recipePageTarget(p, d.id) : null;
    if (d.pageTargets && !pt) continue;
    if (d.cat === "recipe" && !d.unlocks && !pt) continue;
    const key = d.teaches || d.id;
    const kind = d.cat === "recipe" ? "recipe" : d.kind || (d.xinfa ? "xinfa" : "spell");
    const e = seen.get(key) || (pt ? { key, id: pt.target, name: pt.name, teaches: ITEMS[pt.target].unlocks, kind, pages: d.pages || 1, have: 0, uids: [], page: d.id } : { key, id: d.id, name: d.name, teaches: d.teaches || d.unlocks, kind, pages: d.pages || 1, have: 0, uids: [] });
    e.have += it.n || 1;
    e.uids.push(it.uid);
    seen.set(key, e);
  }
  const L = caveState(p) && p.flags.learned;
  const R = p.flags.recipes || {};
  const rec = [...seen.values()].map((e) => ({ ...e, learned: e.kind === "recipe" ? !!R[e.id] : (L[learnKey(e.kind)] || []).includes(e.teaches), ready: e.have >= e.pages }));
  return [...scrollStudyList(p), ...rec];
}
// 参悟失败的原因（界面提示用）：残页不全 / 灵石不够
export function studyWhy(p, key) {
  const e = studyList(p).find((x) => x.key === key);
  if (!e) return "没有可参悟的东西";
  if (e.kind === "recipe") return e.ready ? "" : `残卷不全：${e.have}/${e.pages}`;
  if (e.learned) return "";
  if (!e.ready) return `残页不全：${Math.min(e.have, e.pages)}/${e.pages}${e.real >= 1 ? ` · 悟性 ${(p.flags.gongfa && p.flags.gongfa.wux) || 0}（每 3 点补 1 页）` : ""}`;
  if (e.cost && p.storage.count(STONE()) < e.cost) return `参悟需灵石 ${e.cost}`;
  return "";
}
export function study(p, key) {
  const e0 = studyList(p).find((x) => x.key === key);
  if (e0 && e0.kind !== "recipe") {
    const r = studyScroll(p, key);
    return r.ok ? { ...e0, ...r } : null;
  }
  const e = e0;
  if (!e || !e.ready || e.learned) return null;
  let left = e.pages;
  for (const it of p.storage.items.filter((x) => ["scroll", "recipe"].includes((defOf(x) || {}).cat) && (defOf(x).teaches || defOf(x).id) === key)) {
    const k = Math.min(left, it.n || 1);
    p.storage.remove(it.uid, k < (it.n || 1) ? k : undefined);
    left -= k;
    if (left <= 0) break;
  }
  if (e.kind === "recipe") {
    const R = (p.flags.recipes = p.flags.recipes || {});
    R[e.id] = R[e.name] = !0;
    if (e.teaches) R[e.teaches] = !0;
    return e;
  }
  const list = (p.flags.learned[learnKey(e.kind)] = p.flags.learned[learnKey(e.kind)] || []);
  if (e.teaches && !list.includes(e.teaches)) list.push(e.teaches);
  return e;
}
const learnKey = (k) => (k === "xinfa" ? "xinfa" : k === "formation" ? "formations" : "spells");

// 锦囊之类的"直接生效"剧情物品
export const QUEST_USE = { "灵丝锦囊": { pouch: 2 } };
export function useQuestItem(p, uid) {
  const it = p.storage.items.find((x) => x.uid === uid);
  const u = it && QUEST_USE[(defOf(it) || {}).name];
  if (!u) return null;
  if (u.pouch && p.pouch.capacity >= u.pouch) return { ok: !1, why: "锦囊已不小于此" };
  p.storage.remove(uid);
  if (u.pouch) p.pouch.capacity = u.pouch;
  return { ok: !0, ...u };
}

// ---------------- 搬迁 ----------------
export function canRelocate(p) {
  if (caveState(p).region !== "r1") return { ok: !1, why: "已在溪谷灵脉" };
  if (realmIdx(p) < 15) return { ok: !1, why: "练气五层后才能前往竹海·溪谷" };
  return { ok: !0 };
}
// 打包全部家当搬到溪谷：灵泉自动三级、药园 +2 块、炼器鼎可升二级（地块里的灵草一并带走）
export function relocate(p, region = "r2") {
  const c = caveState(p);
  if (c.region === region) return !1;
  c.region = region;
  if (c.facilities.spring < 3) c.facilities.spring = 3;
  p.flags.region2 = !0;
  p.flags.relocated = !0;
  return !0;
}

const FAC_OF = { furnace: "workshop", forge: "workshop", garden: "garden" }; // 设施 → 站点
const FAC_TAB = { furnace: "alchemy", forge: "forge" };
// ---------------- 洞府总览：待办（只列"现在能做的"，点一下直达站点） ----------------
// fac 为站点 id：spring 灵泉·静室 / workshop 丹器房 / garden 药园 / storage 仓库 / depart 出行台
export function todos(p) {
  const out = [];
  const st = p.storage.count(STONE()), rf = refinables(p).length;
  const b = canBreak(p);
  // go：点这一行时 —— fac 走到哪（设施 id，药园走到药园旁），tab 开哪个标签，sel 选中什么，flash 让哪个按钮闪一下
  const T = (fac, text, go, hot) => out.push({ fac: FAC_OF[fac] || fac, text, hot, go: { fac, ...go } });
  // 药园有熟了的灵草：排在最前（不采不会丢，但别让它埋在一堆待办里）
  const ripe = ripePlots(p).length;
  if (ripe) T("garden", `药园：${ripe} 株可采收`, { flash: "harvest-all", harvest: !0 }, !0);
  if (p.xp >= xpNeed(p)) T("spring", b.ok ? "修为圆满：可以突破" : "修为圆满：突破还缺" + b.need.filter((x) => x.type === "item").map((x) => itemName(x.id)).join("、"), { flash: "break" }, b.ok);
  else if (st > 0 || rf > 0) T("spring", `灵泉：可炼化 灵石 ${st}${rf ? `、灵物 ${rf} 件` : ""}`, { flash: "refine" }, st * REFINE.stone[facLevel(p, "spring")] + refinables(p).reduce((s, it) => s + refineValue(p, it), 0) >= xpRoom(p));
  // 天机镜：新突破没看过 / 筑基后的消息没读（点一下走到天机镜台打开）
  const mu = mirrorUnread(p);
  if (mu.any) {
    const [s, l] = (mu.realm || "0:0").split(":").map(Number);
    T("mirror", mu.msg ? "天机镜：镜里有一条消息" : "天机镜：新记一条 · " + realmName({ realm: { stage: s, layer: l } }), {});
  }
  const { alchemy, forge } = recipes();
  const ready = alchemy.filter((r) => alchemyCanStart(p, r).ok);
  if (ready.length) T("furnace", "炼丹：材料已齐 " + ready.slice(0, 3).map((r) => r.name).join("、"), { tab: "alchemy", sel: { rec: ready[0].id }, flash: "brew" });
  const fr = forge.filter((r) => r.kind === "upgrade" && forgeCanCraft(p, r).ok);
  if (fr.length) T("forge", "炼器：可炼 " + fr[0].name, { tab: "forge", sel: { cat: "upgrade", rec: fr[0].id }, flash: "craft-" + fr[0].id });
  for (const id of ["furnace", "forge", "garden", "spring"]) {
    const u = upgradeInfo(p, id);
    if (u.ok) T(id, `${FACILITIES[id].name}：可${id === "garden" ? "扩建" : u.lv === 0 ? "修复" : "升级"}`, { tab: FAC_TAB[id], flash: "up-" + id });
  }
  const plots = gardenPlots(p), free = plots.filter((x) => !x).length;
  if (free && seeds(p).length) T("garden", `药园：${free} 块空地可移栽`, { sel: { plot: plots.findIndex((x) => !x) }, flash: "plant" });
  const sl = studyList(p).filter((e) => e.ready && !e.learned);
  if (sl.length) T("storage", "仓库：可参悟 " + sl.map((e) => e.name).join("、"), { tab: "all", sel: { cur: sl[0].uids[0] }, flash: "study" });
  const un = unidentified(p);
  if (un.length) T("storage", `仓库：${un.length} 件未鉴定`, { tab: "all", sel: { cur: un[0].uid }, flash: "identify" });
  const slotOf = (d) => (d.cat === "artifact" ? "artifact" : d.slot);
  const better = p.storage.items.filter((it) => it.identified !== !1 && ["gear", "artifact"].includes((defOf(it) || {}).cat) && slotUnlocked(p, slotOf(defOf(it))) && !p.equip[slotOf(defOf(it))]);
  if (better.length) T("storage", `仓库：${better.length} 件装备可穿戴`, { tab: "gear", sel: { cur: better[0].uid }, flash: "equip" });
  return out;
}
export { defOf };
