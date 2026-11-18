// 成长进度（共享接口；数值由内容模块填写 src/data/progression.js）：境界、修为、属性成长、栏位解锁。
// 其他模块只调用这里的函数，不直接改 profile.realm / profile.unlocks。
//   addXp(profile, n, source)     增加修为（会被当前层上限截住，满了需要突破）
//   xpNeed(profile)               当前层升到下一层所需修为
//   canBreak(profile)             是否满足突破条件（修为已满 + 需要的物品，如筑基丹）→ { ok, need: [...] }
//   breakthrough(profile)         执行突破：层数 +1（练气九层 → 筑基一层），应用属性与解锁；返回新解锁列表
//   realmName(profile)            "练气·三层" 之类
//   heroStats(profile, {base})    主角基础属性（随境界成长 + 本层修为进度的小加成；base: true 时不含进度加成），供 Player 创建 Stats
//   applyUnlocks(profile)         按境界刷新 profile.unlocks（法术栏数、心法栏、法宝栏…）
import { PROGRESSION } from "../data/progression.js";

export function realmName(p) {
  const r = p.realm;
  if (r.stage === 0) return "凡人";
  const st = PROGRESSION.stages[r.stage];
  return st ? `${st.name}·${"一二三四五六七八九十"[r.layer - 1] || r.layer}层` : "未知";
}
function key(p) {
  return p.realm.stage + ":" + p.realm.layer;
}
export function xpNeed(p) {
  return PROGRESSION.xp[key(p)] ?? Infinity;
}
// 练气九层圆满后溢出的修为存进 stats.xpBank（上限 XP_BANK_CAP），筑基突破后一次性返还（数值评审 v1）
export const XP_BANK_CAP = 600;
export function addXp(p, n, source = "") {
  const before = p.xp, need = xpNeed(p);
  const want = p.xp + Math.max(0, n);
  p.xp = Math.min(need, want);
  if (want > need && p.realm.stage === 1 && p.realm.layer === 9) {
    p.stats = p.stats || {};
    p.stats.xpBank = Math.min(XP_BANK_CAP, (p.stats.xpBank || 0) + (want - need));
  }
  return p.xp - before;
}
export function canBreak(p) {
  const need = [];
  if (p.xp < xpNeed(p)) need.push({ type: "xp", have: p.xp, need: xpNeed(p) });
  const req = PROGRESSION.breakReq[key(p)] || [];
  for (const r of req) if (!p.storage || p.storage.count(r.id) < r.n) need.push({ type: "item", id: r.id, n: r.n });
  return { ok: need.length === 0, need, trial: PROGRESSION.trial[key(p)] || null };
}
export function breakthrough(p) {
  const req = PROGRESSION.breakReq[key(p)] || [];
  for (const r of req) p.storage.consume(r.id, r.n);
  p.xp = 0;
  const next = PROGRESSION.next[key(p)];
  if (next) p.realm = { ...next };
  const before = { ...p.unlocks };
  applyUnlocks(p);
  if (p.realm.stage === 2 && p.stats && p.stats.xpBank) {
    const bank = p.stats.xpBank;
    p.stats.xpBank = 0;
    addXp(p, bank, "bank");
  }
  return Object.keys(p.unlocks).filter((k) => JSON.stringify(p.unlocks[k]) !== JSON.stringify(before[k])).map((k) => ({ key: k, value: p.unlocks[k] }));
}
export function applyUnlocks(p) {
  const order = PROGRESSION.order;
  const idx = order.indexOf(key(p));
  for (const [k, list] of Object.entries(PROGRESSION.unlocks)) {
    // list: [[ "stage:layer", value ], ...] 取不晚于当前境界的最后一个
    let v = p.unlocks[k];
    for (const [at, val] of list) if (order.indexOf(at) <= idx) v = val;
    if (v !== undefined) p.unlocks[k] = v;
  }
  return p.unlocks;
}
// ---------------- 装备栏位解锁（唯一判定：洞府仓库、局内储物袋、出行准备、局内属性都用这一套） ----------------
//   slotOpen(p, slot)      slot：sword | robe | jade | artifact；读 profile.unlocks（突破时 applyUnlocks 写入），没有该键时按境界现算
//   slotUnlockRealm(slot)  该栏在哪个境界解锁（"1:5"），数据来自 PROGRESSION.unlocks
//   slotLockText(slot)     "玉佩栏 · 练气五层解锁"（未解锁提示，洞府与局内同一句）
export const SLOT_UNLOCK_KEY = { robe: "robeSlot", jade: "jadeSlot", artifact: "artifactSlot" };
export const SLOT_LABEL = { sword: "法剑", robe: "法衣", jade: "玉佩", artifact: "法宝" };
export function slotOpen(p, slot) {
  if (slot === "sword") return !0;
  const k = SLOT_UNLOCK_KEY[slot];
  if (!k) return !1;
  const v = p && p.unlocks ? p.unlocks[k] : undefined;
  if (v !== undefined) return !!v;
  if (!p || !p.realm) return !1;
  const idx = PROGRESSION.order.indexOf(key(p));
  let on = !1;
  for (const [at, val] of PROGRESSION.unlocks[k] || []) if (PROGRESSION.order.indexOf(at) <= idx) on = !!val;
  return on;
}
export function slotUnlockRealm(slot) {
  const hit = (PROGRESSION.unlocks[SLOT_UNLOCK_KEY[slot]] || []).find(([, v]) => v === !0);
  return hit ? hit[0] : null;
}
export function realmKeyName(k) {
  const [st, ly] = String(k).split(":").map(Number);
  const s = PROGRESSION.stages[st];
  return s ? `${s.name}${"一二三四五六七八九十"[ly - 1] || ly}层` : "";
}
export function slotLockText(slot) {
  const at = slotUnlockRealm(slot);
  return `${SLOT_LABEL[slot] || slot}栏 · ${at ? realmKeyName(at) + "解锁" : "尚未解锁"}`;
}
// 距该栏解锁还差几层（已解锁 0；按 PROGRESSION.order 的序号差，筑基算一层）
export function slotLayersAway(p, slot) {
  if (slotOpen(p, slot)) return 0;
  const at = slotUnlockRealm(slot);
  if (!at || !p || !p.realm) return Infinity;
  return Math.max(1, PROGRESSION.order.indexOf(at) - PROGRESSION.order.indexOf(key(p)));
}
export function heroStats(p, o = {}) {
  const g = PROGRESSION.growth[key(p)] || PROGRESSION.growth["1:1"];
  const out = { ...PROGRESSION.baseStats, ...g };
  // 小境界内的常驻小加成：按本层修为进度，向下一层属性线性插值 progressBonus（默认 0.5）的比例
  const nx = PROGRESSION.next[key(p)], g2 = nx && PROGRESSION.growth[nx.stage + ":" + nx.layer];
  const need = xpNeed(p), k = (PROGRESSION.progressBonus ?? 0.5) * Math.min(1, need > 0 && isFinite(need) ? (p.xp || 0) / need : 0);
  if (g2 && k > 0 && !o.base)
    for (const s in g) if (typeof g[s] === "number" && typeof g2[s] === "number" && !NO_LERP.has(s)) {
      const v = g[s] + (g2[s] - g[s]) * k;
      out[s] = INT_STATS.has(s) ? Math.floor(v) : Math.round(v * 1000) / 1000;
    }
  return out;
}
// 整数或档位型属性不插值（闪身次数、冷却档位）
const NO_LERP = new Set(["dashMax", "dashCd"]);
const INT_STATS = new Set(["hp", "mp", "atk", "spell", "def", "sense"]);
// 当前修为进度带来的加成（界面显示用）：{ 属性: 增量 }
export function progressBonusStats(p) {
  const g = PROGRESSION.growth[key(p)] || {}, cur = heroStats(p), d = {};
  for (const s in g) if (typeof g[s] === "number" && Math.abs(cur[s] - g[s]) > 1e-6) d[s] = cur[s] - g[s];
  return d;
}
