// 功法体系 v2 的规则（docs/design/功法体系_v2.md）：残页提示、来源指引、护盾缺口、参悟（含悟性补页 / 重复化悟性）、"重"、法术栏保底赠予。
// 只依赖数据表与存档对象，不依赖界面；洞府的 facilities.js（studyList / study / grantRealm）调这里，界面只读结果。
//
//   pageHint(profile, itemId, bag?)  → { teaches, name, have, need, learned, ready, fill, text } | null
//        have = 仓库 + bag（局内调用时传 run.bag）里同一门功法的页数（完本按"整本"计）；text 为统一句式（与丹方残页共用规则）
//   gongfaSources(id)               → [{ region, regionName, how, where, chance, tier, text }]  从 loot / 遗府 / 首领 / 境界赠予表推出来
//   gongfaSource(profile, id)       → { id, name, learned, zhong, kind: "grant"|"fixed"|"pages", pages, have, fill, lines, short }
//   shieldGap(profile, region)      → [{ el, need, share, boss, has: [已学会的克制法术], can: [{ id, name, short }] }]  当前去处护盾与"缺的克制五行"
//   scrollStudyList(profile)        → 洞府参悟列表里 cat "scroll" 的条目（studyList 用）
//   studyScroll(profile, key)       → { ok, entry, learned?, wux?, stones?, filled?, why? }
//   zhongOf(profile, id) / zhongUp(profile, id) / wuxOf(profile)
//   spellFallback(profile, key)     → 突破到 key 时应赠的基础法术 id 或 null（facilities.grantRealm 调）
import { ITEMS, defOf } from "../core/items.js";
import { SPELLS } from "../data/skills.js";
import { GONGFA, SCROLLS, LEGACY_SCROLLS, CHANCE_TIER, pageId, bookId } from "../data/gongfa.js";
import { SOURCES, RUINS, BOSSES } from "../data/loot.js";
import { ENEMY_TYPES, ENCOUNTER } from "../data/enemies.js";
import { PROGRESSION } from "../data/progression.js";
import * as LEVELS from "../data/levels/index.js";

export const ZHONG = GONGFA.zhong;
const REGION_NAME = { r1: "青岚山外", r2: "竹海·溪谷", tutorial: "溪边" };
const SRC_NAME = { mob: "妖兽", mob_low: "小妖", elite: "头目", rare_variant: "异种", chest_normal: "宝箱", pavilion: "亭中供案", chest_glow: "灵光宝箱", chest_night: "夜明宝箱", ruin_repeat: "遗府重探", stele: "残碑", boss_first: "首领首杀", boss_repeat: "首领重战" };
const COUNTER = { wood: "metal", earth: "wood", water: "earth", fire: "water", metal: "fire" }; // 护盾五行 → 克制它的五行（同 shields.js；这里不引 three）
const EL_NAME = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };

const flags = (p) => (p.flags = p.flags || {});
const learnedSpells = (p) => ((p && p.flags && p.flags.learned && p.flags.learned.spells) || []);
function gf(p) {
  const F = flags(p);
  const g = (F.gongfa = F.gongfa || {});
  g.wux = g.wux || 0;
  g.zhong = g.zhong || {};
  return g;
}
export const wuxOf = (p) => (p ? gf(p).wux : 0);
export function zhongOf(p, id) {
  if (!p || !p.flags || !p.flags.gongfa || !p.flags.gongfa.zhong) return 1;
  return p.flags.gongfa.zhong[id] || 1;
}

// ---------------- 哪些物品教这门功法 ----------------
const ITEMS_OF = {};
for (const s of SCROLLS) ITEMS_OF[s.id] = [pageId(s.id), bookId(s.id)];
for (const [id, list] of Object.entries(LEGACY_SCROLLS)) ITEMS_OF[id] = [...(ITEMS_OF[id] || []), ...list];
export const itemsOfGongfa = (id) => ITEMS_OF[id] || [];
// 页数要求：残页物品的 pages（完本 = 直接满）
function needOf(id) {
  let n = 1;
  for (const iid of itemsOfGongfa(id)) if (ITEMS[iid] && ITEMS[iid].pages) n = Math.max(n, ITEMS[iid].pages);
  return n;
}
// 一组物品实例里，某门功法的"页当量"：残页每张 1，完本 = need
function pagesIn(items, id, need) {
  let have = 0, real = 0;
  for (const it of items || []) {
    if (!it || it.identified === !1) continue;
    const d = defOf(it);
    if (!d || d.cat !== "scroll" || d.teaches !== id) continue;
    const n = it.n || 1;
    if (d.pages) (have += n), (real += n);
    else (have += need * n), (real += n);
  }
  return { have, real };
}
function fillOf(p, need, have, real) {
  if (have >= need || real < GONGFA.fillMinHave) return 0;
  return Math.min(need - have, Math.floor(wuxOf(p) / GONGFA.fillCost));
}

// ---------------- 丹方残页（玩法系统，用户定 2026-11-17）：集齐 d.pages 页 → 按 d.pageTargets 顺序得一本还没拥有的丹方 ----------------
// 拥有 = 学会过（flags.recipes 记丹方物品 id / 配方 id / 名字任一）或丹方物品就在仓库 / extra（局内储物袋、护身格）里
export function recipeOwned(p, rid, extra) {
  const d = ITEMS[rid];
  const R = (p && p.flags && p.flags.recipes) || {};
  if (R[rid] || (d && (R[d.unlocks] || R[d.name]))) return !0;
  const inList = (L) => (L || []).some((it) => it && it.id === rid);
  return !!(p && p.storage && p.storage.count && p.storage.count(rid) > 0) || inList(extra);
}
// → { target: 丹方物品 id, name } 或 null（都有了）
export function recipePageTarget(p, itemId, extra) {
  const d = ITEMS[itemId];
  if (!d || !d.pageTargets) return null;
  const t = d.pageTargets.find((rid) => ITEMS[rid] && !recipeOwned(p, rid, extra));
  return t ? { target: t, name: ITEMS[t].name } : null;
}
const itemsOf = (bag) => (bag && bag.items ? bag.items : Array.isArray(bag) ? bag : []);
function recipePageHint(p, itemId, bag) {
  const d = ITEMS[itemId], need = d.pages || 1, extra = itemsOf(bag);
  const cnt = (L) => (L || []).filter((it) => it && it.id === itemId && it.identified !== !1).reduce((s, it) => s + (it.n || 1), 0);
  const have = cnt(p && p.storage ? p.storage.items : []) + cnt(extra);
  const t = recipePageTarget(p, itemId, extra);
  const learned = !t, ready = !!t && have >= need;
  const text = learned ? `${d.pageTargets.length > 1 ? "这几本丹方" : "丹方"}都已有 · ${d.name}只能化灵` : ready ? `${d.name}已齐 · 回洞府仓库研读${t.name}` : `${d.name} ${Math.min(have, need)}/${need} · 集齐后到洞府仓库研读（得${t.name}）`;
  return { teaches: t ? t.target : null, name: t ? t.name : d.name, have, need, learned, ready, fill: 0, text, recipe: !0 };
}

// ---------------- 残页提示（与丹方残页共用的句式）----------------
export function pageHint(p, itemId, bag) {
  const d = ITEMS[itemId];
  if (d && d.cat === "recipe" && d.pageTargets) return recipePageHint(p, itemId, bag);
  if (!d || d.cat !== "scroll" || !d.teaches) return null;
  const id = d.teaches;
  const sp = SPELLS[id];
  const name = sp ? sp.name : d.name.replace(/[《》]|残页|残卷/g, "");
  const need = needOf(id);
  const st = pagesIn(p && p.storage ? p.storage.items : [], id, need);
  const bg = pagesIn(bag && bag.items ? bag.items : Array.isArray(bag) ? bag : [], id, need);
  const have = st.have + bg.have, real = st.real + bg.real;
  const learned = learnedSpells(p).includes(id) || !!(p && p.flags && p.flags.learned && ((p.flags.learned.xinfa || []).includes(id) || (p.flags.learned.formations || []).includes(id)));
  const fill = learned ? 0 : fillOf(p, need, have, real);
  const ready = !learned && have >= need;
  let text;
  if (learned) text = `已会${name} · 参悟可化为悟性`;
  else if (need <= 1 || !d.pages) text = `《${name}》完本 · 回洞府仓库参悟`;
  else if (ready) text = `《${name}》残页已齐 · 回洞府仓库参悟`;
  else text = `《${name}》残页 ${Math.min(have, need)}/${need} · 集齐后到洞府仓库参悟${fill ? `（悟性可补 ${fill} 页）` : ""}`;
  return { teaches: id, name, have, need, learned, ready, fill, text };
}

// ---------------- 来源（从掉落表推出来，表一改指引就跟着变）----------------
const tierOf = (c) => (CHANCE_TIER.find(([x]) => c >= x) || CHANCE_TIER[CHANCE_TIER.length - 1])[1];
const enemyName = (t) => (ENEMY_TYPES[t] && ENEMY_TYPES[t].name) || t;
function scanEntries(list, ids, srcId, out, extra = {}) {
  for (const e of list || []) {
    let hit = 0, chance = e.chance ?? 1;
    if (e.item && ids.includes(e.item)) hit = 1;
    else if (e.pick) {
      const tot = e.pick.reduce((s, x) => s + x[1], 0);
      const w = e.pick.filter((x) => ids.includes(x[0])).reduce((s, x) => s + x[1], 0);
      if (w > 0) (hit = 1), (chance *= e.unlearned ? 1 : w / tot);
    }
    if (!hit) continue;
    const book = (e.item && !ITEMS[e.item].pages) || (e.pick && e.pick.some((x) => ids.includes(x[0]) && ITEMS[x[0]] && !ITEMS[x[0]].pages));
    const regions = e.region ? [e.region] : extra.region ? [extra.region] : ["r1", "r2"];
    for (const r of regions) {
      const who = e.enemy ? [].concat(e.enemy).map(enemyName).join(" / ") : extra.who || defaultWho(srcId, r);
      out.push({ region: r, regionName: REGION_NAME[r] || r, how: book ? "book" : "page", src: srcId, where: who, chance, tier: srcId.startsWith("boss_first") ? "必得" : srcId === "stele" ? "必出" : tierOf(chance), text: `${REGION_NAME[r] || r} · ${who} · ${book ? "完本" : "残页"}` });
    }
  }
}
function defaultWho(srcId, r) {
  if (srcId === "elite") return ((ENCOUNTER.elites && ENCOUNTER.elites[r]) || []).map(enemyName).join(" / ") || "头目";
  if (srcId === "rare_variant") return "异种";
  return SRC_NAME[srcId] || srcId;
}
const SRC_CACHE = {};
// 残碑分区 → { region, name }（关卡 points.steles.from）
function steleOf(zone) {
  for (const r of ["r1", "r2"]) {
    const s = ((LEVELS[r] && LEVELS[r].points && LEVELS[r].points.steles && LEVELS[r].points.steles.from) || []).find((q) => q.zone === zone);
    if (s) return { region: r, name: s.name };
  }
  return null;
}
export function gongfaSources(id) {
  if (SRC_CACHE[id]) return SRC_CACHE[id];
  const ids = itemsOfGongfa(id), out = [];
  for (const [k, list] of Object.entries(SOURCES)) {
    if (k === "stele") continue; // 区域通用残碑表只是兜底（关卡每块碑都有分区映射）
    if (k.startsWith("stele_")) {
      const st = steleOf(k.slice(6));
      if (st) scanEntries(list, ids, "stele", out, { region: st.region, who: st.name });
      continue;
    }
    scanEntries(list, ids, k, out);
  }
  for (const ru of Object.values(RUINS)) scanEntries(ru.first, ids, "ruin_first", out, { region: ru.region, who: ru.name + "（首探）" });
  for (const [bid, b] of Object.entries(BOSSES)) {
    scanEntries(b.first, ids, "boss_first", out, { region: b.region, who: b.name + "（首杀）" });
    scanEntries(b.repeat, ids, "boss_repeat", out, { region: b.region, who: b.name + "（重战）" });
  }
  // 境界赠予
  for (const [k, list] of Object.entries(PROGRESSION.grants || {})) for (const g of list) if (g.spell === id) out.push({ region: null, how: "grant", src: "grant", where: realmText(k), chance: 1, tier: "必得", text: `${realmText(k)} · 突破所得` });
  for (const [k, list] of Object.entries(GONGFA.spellFallback)) if (list.includes(id)) out.push({ region: null, how: "fallback", src: "grant", where: realmText(k), chance: 1, tier: "保底", text: `${realmText(k)} · 法术栏开而无功法可装时赠予` });
  // 去重（同区域同来源同方式只留概率最高的）+ 排序：必得 → 常见 → 偶得 → 罕见
  const best = new Map();
  for (const s of out) {
    const key = [s.region, s.where, s.how].join("|");
    if (!best.has(key) || best.get(key).chance < s.chance) best.set(key, s);
  }
  return (SRC_CACHE[id] = [...best.values()].sort((a, b) => b.chance - a.chance));
}
const NUM = "零一二三四五六七八九十";
function realmText(k) {
  const [s, l] = k.split(":").map(Number);
  return s === 2 ? `筑基${NUM[l]}层` : `练气${NUM[l]}层`;
}

export function gongfaSource(p, id) {
  const sp = SPELLS[id];
  const learned = learnedSpells(p).includes(id);
  const src = gongfaSources(id);
  const need = needOf(id);
  const st = pagesIn(p && p.storage ? p.storage.items : [], id, need);
  const fixed = src.find((s) => s.src === "ruin_first");
  const grant = src.find((s) => s.how === "grant");
  const kind = grant && !src.some((s) => s.how === "page" || s.how === "book") ? "grant" : fixed ? "fixed" : "pages";
  let short;
  if (learned) short = zhongOf(p, id) >= 2 ? ZHONG[zhongOf(p, id)].label : "已领悟";
  else if (kind === "fixed") short = `${fixed.regionName} · ${fixed.where.replace("（首探）", "")}`;
  else if (kind === "grant") short = grant.text;
  else {
    const top = src.find((s) => s.how === "page") || src[0];
    short = top ? `${top.regionName} · ${top.where} · 残页 ${Math.min(st.have, need)}/${need}` : "未领悟";
  }
  return { id, name: sp ? sp.name : id, learned, zhong: zhongOf(p, id), kind, pages: need, have: st.have, fill: learned ? 0 : fillOf(p, need, st.have, st.real), lines: src, short };
}

// ---------------- 护盾缺口：当前去处的护盾 ↔ 你缺的克制五行 ----------------
export function regionShieldInfo(region) {
  const lv = LEVELS[region] || {}, D = lv.points || {}, share = {};
  let n = 0;
  const defShield = ((ENCOUNTER.elites && ENCOUNTER.elites[region]) || []).map((t) => (ENEMY_TYPES[t] || {}).shield).filter(Boolean);
  for (const pt of (D.elites && D.elites.from) || []) {
    let els = pt[2] && pt[2].shield ? pt[2].shield : defShield[0];
    if (!els) continue;
    els = [].concat(els);
    for (const e of els) share[e] = (share[e] || 0) + 1 / els.length;
    n++;
  }
  for (const k of Object.keys(share)) share[k] /= n || 1;
  const bt = ENCOUNTER.bosses && ENCOUNTER.bosses[region], B = bt && ENEMY_TYPES[bt];
  const boss = B ? { name: B.name, els: B.shieldPhases ? B.shieldPhases.map((q) => q.el) : [].concat(B.shield || []) } : null;
  const els = new Set([...Object.keys(share), ...(boss?.els || [])]);
  // 巡游属于可能遭遇，不混入固定点位占比；无固定盾的精英出生时随机获得五行盾。
  const rules = ENCOUNTER.eliteRules, cap = rules?.cap?.[region];
  const patrolCap = cap ? (rules.patrolCap?.[region] ?? cap) : Infinity;
  if (patrolCap > 0 && (lv.patrols || []).some((pt) => pt.path?.length >= 2)) {
    for (const type of ENCOUNTER.elites?.[region] || []) {
      const def = ENEMY_TYPES[type];
      if (!def || !def.tags?.includes("elite") || def.tags.includes("noShield")) continue;
      for (const el of [].concat(def.shield || Object.keys(COUNTER))) els.add(el);
    }
  }
  return { share, boss, els: [...els] };
}
export function shieldGap(p, region) {
  const { share, boss, els } = regionShieldInfo(region);
  const L = learnedSpells(p);
  return els.map((el) => {
    const need = COUNTER[el];
    const has = L.filter((id) => SPELLS[id] && SPELLS[id].element === need && SPELLS[id].effect.type !== "shield" && SPELLS[id].effect.type !== "buff");
    const can = Object.values(SPELLS).filter((s) => s.element === need && !L.includes(s.id) && s.effect.type !== "shield" && s.effect.type !== "buff").map((s) => ({ id: s.id, name: s.name, short: gongfaSource(p, s.id).short }));
    return { el, elName: EL_NAME[el], need, needName: EL_NAME[need], share: share[el] || 0, boss: boss?.els.includes(el) ? boss.name : null, has, can, ok: has.length > 0 };
  });
}

// ---------------- 参悟（洞府仓库）----------------
// 条目：{ key, id, name, teaches, kind, pages, have, real, fill, cost, learned, ready, dupWux, uids }
export function scrollStudyList(p) {
  const by = new Map();
  for (const it of p.storage.items) {
    const d = defOf(it);
    if (!d || d.cat !== "scroll" || it.identified === !1 || !d.teaches) continue;
    const key = d.teaches;
    const e = by.get(key) || { key, id: d.id, name: d.name, teaches: key, kind: d.kind || (d.xinfa ? "xinfa" : "spell"), uids: [], rarity: 0 };
    e.uids.push(it.uid);
    if (d.pages) (e.id = d.id), (e.name = d.name); // 有残页时用残页的名字（"《火符》残卷"）
    e.rarity = Math.max(e.rarity, d.rarity || 0);
    by.set(key, e);
  }
  const L = (p.flags && p.flags.learned) || {};
  const lk = (k) => (k === "xinfa" ? "xinfa" : k === "formation" ? "formations" : "spells");
  return [...by.values()].map((e) => {
    const need = needOf(e.teaches);
    const { have, real } = pagesIn(p.storage.items, e.teaches, need);
    const learned = (L[lk(e.kind)] || []).includes(e.teaches);
    const fill = learned ? 0 : fillOf(p, need, have, real);
    const hasBook = p.storage.items.some((it) => it.identified !== !1 && defOf(it) && defOf(it).teaches === e.teaches && !defOf(it).pages);
    const cost = hasBook || need <= 1 ? 0 : GONGFA.studyStones[e.rarity] || 0;
    return { ...e, pages: need, have, real, fill, cost, learned, ready: !learned && have + fill >= need, dupWux: learned ? dupValue(p, e.teaches) : 0 };
  });
}
function dupValue(p, id) {
  let w = 0;
  for (const it of p.storage.items) {
    const d = defOf(it);
    if (!d || d.cat !== "scroll" || d.teaches !== id || it.identified === !1) continue;
    w += (d.pages ? GONGFA.wuxPerPage[d.rarity || 0] : GONGFA.wuxPerBook) * (it.n || 1);
  }
  return w;
}
const STONE_ID = () => (Object.values(ITEMS).find((d) => d.name === "灵石") || {}).id || "spirit_stone";
// 参悟一门：已学会 → 全部化为悟性；没学会 → 先用完本，否则用残页（不够的用悟性补），付灵石
export function studyScroll(p, key) {
  const e = scrollStudyList(p).find((x) => x.key === key);
  if (!e) return { ok: !1, why: "没有这门功法的残页" };
  const g = gf(p);
  const mine = () => p.storage.items.filter((it) => it.identified !== !1 && defOf(it) && defOf(it).cat === "scroll" && defOf(it).teaches === key);
  if (e.learned) {
    const w = e.dupWux;
    for (const it of mine()) p.storage.remove(it.uid);
    g.wux += w;
    return { ok: !0, entry: e, wux: w, dup: !0 };
  }
  if (!e.ready) return { ok: !1, entry: e, why: `残页不全：${Math.min(e.have, e.pages)}/${e.pages}${e.real < GONGFA.fillMinHave ? "" : ` · 悟性 ${g.wux}（每 ${GONGFA.fillCost} 点补 1 页）`}` };
  if (e.cost && p.storage.count(STONE_ID()) < e.cost) return { ok: !1, entry: e, why: `参悟需灵石 ${e.cost}` };
  const book = mine().find((it) => !defOf(it).pages);
  let filled = 0;
  if (book) p.storage.remove(book.uid, (book.n || 1) > 1 ? 1 : undefined);
  else {
    let left = e.pages;
    for (const it of mine()) {
      const k = Math.min(left, it.n || 1);
      p.storage.remove(it.uid, k < (it.n || 1) ? k : undefined);
      left -= k;
      if (left <= 0) break;
    }
    if (left > 0) (filled = left), (g.wux -= left * GONGFA.fillCost);
    if (e.cost) p.storage.consume(STONE_ID(), e.cost);
  }
  const L = (flags(p).learned = flags(p).learned || {});
  const lk = e.kind === "xinfa" ? "xinfa" : e.kind === "formation" ? "formations" : "spells";
  const list = (L[lk] = L[lk] || []);
  if (!list.includes(key)) list.push(key);
  return { ok: !0, entry: e, learned: key, stones: book ? 0 : e.cost, filled };
}

// ---------------- 重：用悟性给已学法术升阶 ----------------
export function zhongNext(p, id) {
  const cur = zhongOf(p, id), nx = ZHONG[cur + 1];
  if (!learnedSpells(p).includes(id) || !nx) return null;
  return { lv: cur + 1, cost: nx.cost, ok: wuxOf(p) >= nx.cost, label: nx.label };
}
export function zhongUp(p, id) {
  const n = zhongNext(p, id);
  if (!n) return { ok: !1, why: "已至顶重或尚未领悟" };
  if (!n.ok) return { ok: !1, why: `悟性不足：${wuxOf(p)}/${n.cost}` };
  const g = gf(p);
  g.wux -= n.cost;
  g.zhong[id] = n.lv;
  return { ok: !0, lv: n.lv, label: n.label };
}

// ---------------- 法术栏保底赠予 ----------------
function slotsAt(key) {
  const order = PROGRESSION.order, i = order.indexOf(key);
  let v = 0;
  for (const [k, n] of PROGRESSION.unlocks.spellSlots) if (order.indexOf(k) <= i) v = n;
  return v;
}
export function spellFallback(p, key) {
  const list = GONGFA.spellFallback[key];
  if (!list) return null;
  const L = learnedSpells(p);
  if (L.length >= slotsAt(key)) return null; // 已学法术够填满新栏
  return list.find((id) => SPELLS[id] && !L.includes(id)) || null;
}
