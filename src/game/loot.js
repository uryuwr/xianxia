// 掉落生成（内容模块 D）：rollLoot / 装备与词条生成 / 保底 / 斩妖感悟。表格在 src/data/loot.js。
//
//   rollLoot(sourceId, { region, level, pity, enemy, boss, ruin, profile, rng }) → [物品实例]
//     sourceId：mob | elite | chest_normal | chest_glow | chest_night | ruin_first | ruin_repeat | boss_first | boss_repeat | gather_<kind>
//     region   "tutorial" | "r1" | "r2"（默认 r1）；level 区域等级（默认按区域）
//     pity     小怪装备保底 { mobNoGear }（会被修改）。不传则用 profile.stats.pity，再没有就用本模块的会话内状态
//     enemy    击杀者类型（决定专属材料 / 妖丹）；boss "qingya" | "bilin"；ruin "shanshen" | "jianxiu"
//     profile  机缘值存 profile.stats.fortune（没有 profile 时存在 pity.fortune）；也用于"只给一次"的灵光点（炼器鼎残件、阵盘·剑阵）
//   getFortune(profile) → { value, max, full }  机缘值刻度（可见，评审 G4）；addFortune(profile, "quest" | "encounter" | n)
//   makeGear(baseId | null, rarity, level, { region, slot, rng, profile }) → 装备 / 极品法宝实例（有 profile 时随机底材按栏位解锁门控，见 GEAR_SLOT_GATE）
//   rollAffixes(slot, rarity, level, rng, actualRarity?) → 随机词条；仙品以上附一条special，心法用xinfa、法剑奇效用effect
//   gearStats(inst) → 该装备全部属性加成（按等级与品质算的基础属性 + 词条），可直接 Stats.addAll(…, uid)
//                     特殊词条产出标记 { stat: "gx_<心法 id>", value: 1 }，由 SkillSystem 当作装备了该心法（见 data/loot.js SPECIAL_AFFIXES）
//   xpForKill(type, region, { first }) → 击杀感悟修为（§10.1）
//   enemyLootSource(type, profile) → 该敌人死亡时用的来源 id（Boss 按 profile.flags["boss_" + id] 判断首杀）
import { makeItem, ITEMS, RARITY } from "../core/items.js";
import "../data/items_db.js";
import { REGION_LOOT, SOURCES, CORE_OF, RUINS, BOSSES, GATHER, GLOW_ONCE, AFFIXES, REGION_COEF, SPECIAL_AFFIXES, ELEMENTS, PITY, INSIGHT, FORTUNE, GEAR_SLOT_GATE } from "../data/loot.js";
import { slotLayersAway } from "./progression.js";
import { ENEMY_TYPES } from "../data/enemies.js";
import { XINFA, WEAPON_EFFECTS } from "../data/items.js";
import { GARDEN } from "../data/recipes.js";

const sessionPity = { mobNoGear: 0, jackpot: 0 };
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const nOf = (rng, n) => (Array.isArray(n) ? ri(rng, n[0], n[1]) : n ?? 1);
function weighted(rng, list, w = (x) => x[1]) {
  const tot = list.reduce((s, x) => s + w(x), 0);
  if (tot <= 0) return null;
  let r = rng() * tot;
  for (const x of list) if ((r -= w(x)) < 0) return x;
  return list[list.length - 1];
}
const regionOf = (r) => REGION_LOOT[r] || REGION_LOOT.r1;
// 功法体系 v2：pick 列表里去掉已学会的功法（全学会了就原样返回）
function unlearnedPick(list, profile) {
  const L = (profile && profile.flags && profile.flags.learned) || {};
  const known = new Set([...(L.spells || []), ...(L.xinfa || []), ...(L.formations || [])]);
  const left = list.filter((x) => !(ITEMS[x[0]] && ITEMS[x[0]].teaches && known.has(ITEMS[x[0]].teaches)));
  return left.length ? left : list;
}
const BOSS_OF_REGION = { r1: "qingya", r2: "bilin", tutorial: "qingya" };
const RUIN_OF_REGION = { r1: "shanshen", r2: "jianxiu", tutorial: "shanshen" };

// ---------------- 词条 ----------------
// 武器奇效共用 RARITY；不接受不存在的品级或非剑栏。actualRarity 防止旧特殊词条重铸抬档绕过门槛。
export const weaponAffixAllowed = (slot, rarity) => slot === "sword" && !!RARITY[rarity] && rarity >= 3;
export function rollAffixes(slot, rarity, level = 1, rng = Math.random, actualRarity = rarity) {
  const n = (RARITY[rarity] || RARITY[0]).affixes;
  const out = [];
  if (!n) return out;
  const tier = Math.max(0, Math.min(2, rarity - 1));
  const coef = REGION_COEF(level);
  const pool = AFFIXES.filter((a) => slot === "artifact" || a[3].includes(slot));
  for (let i = 0; i < n && pool.length; i++) {
    const [stat, type, vals, , scale] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    let v = vals[tier] * (0.85 + rng() * 0.3) * (scale ? coef : 1);
    v = Math.abs(vals[tier]) < 1 ? Math.round(v * 1000) / 1000 : Math.max(1, Math.round(v));
    const el = ELEMENTS[Math.floor(rng() * 5)];
    out.push({ stat: stat === "element" ? el : stat === "imbue" ? "imbue_" + el : stat, type, value: v });
  }
  if (rarity >= 3) {
    const pool = SPECIAL_AFFIXES.filter((a) => a[2] !== "weapon" || weaponAffixAllowed(slot, actualRarity));
    const [id, name, kind] = pool[Math.floor(rng() * pool.length)];
    out.push({ stat: "special", type: "flag", value: name, ...(kind === "weapon" ? { effect: id } : { xinfa: id }) });
  }
  return out;
}

// 基础属性：gear.stat 每级成长；品质让基础属性再 +15% / 品
export function gearBase(def, level = 1, rarity = 0) {
  const g = def && def.gear;
  if (!g) return (def && def.base) || [];
  return g.stat.map(([stat, per, v0]) => {
    let v = (v0 + per * (level - 1)) * (1 + 0.15 * rarity);
    v = Math.abs(v0) < 1 && per < 1 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
    return { stat, type: "flat", value: v };
  });
}
export function gearStats(inst) {
  const def = ITEMS[inst.id];
  if (!def) return [];
  const base = def.cat === "gear" ? gearBase(def, inst.level || 1, inst.rarity || 0) : [];
  // 特殊词条：标记属性 gx_<心法 id> = 1，由 SkillSystem 并入心法集合（mods / trigger 都生效，与心法栏同名不叠加）
  const special = [];
  for (const a of inst.affixes || []) {
    if (a.stat !== "special") continue;
    if (a.effect) {
      if (def.cat === "gear" && weaponAffixAllowed(def.slot, inst.rarity) && WEAPON_EFFECTS[a.effect]) special.push({ stat: "wx_" + a.effect, type: "flat", value: 1 });
    } else if (a.xinfa && XINFA[a.xinfa] && XINFA[a.xinfa].affix) special.push({ stat: "gx_" + a.xinfa, type: "flat", value: 1 });
  }
  return [...base, ...(inst.affixes || []).filter((a) => a.type !== "flag" && !String(a.stat).startsWith("wx_")), ...special];
}

export function makeGear(baseId, rarity, level, o = {}) {
  const rng = o.rng || Math.random;
  const R = regionOf(o.region);
  if (rarity >= 4) {
    const id = (R.jackpot || REGION_LOOT.r1.jackpot)[Math.floor(rng() * 2)];
    return makeItem(id, { rarity: 4, level, affixes: rollAffixes("artifact", 4, level, rng), tags: ["jackpot"] });
  }
  let bases = R.gearBases;
  if (o.slot) bases = bases.filter((id) => ITEMS[id].slot === o.slot);
  // 随机抽底材时按栏位解锁门控（GEAR_SLOT_GATE，src/data/loot.js）：还没解锁的栏位按"差几层"降权；指定了 slot / baseId 的不门控。
  //   只用一次 rng（与改前同样的随机序列消耗）；没有 profile 或权重全为 0 时退回均匀抽
  let id = baseId;
  if (!id && bases.length) {
    const w = bases.map((b) => (o.slot ? 1 : slotGateW(o.profile, ITEMS[b].slot)));
    const tot = w.reduce((s, x) => s + x, 0), x0 = rng();
    if (tot > 0) {
      let r = x0 * tot;
      id = bases.find((b, i) => w[i] > 0 && (r -= w[i]) < 0) || bases.filter((b, i) => w[i] > 0).pop();
    } else id = bases[Math.floor(x0 * bases.length)];
  }
  id = id || "sword_qingfeng";
  return makeItem(id, { rarity, level, affixes: rollAffixes(ITEMS[id].slot, rarity, level, rng), identified: o.identified });
}
// 栏位门控后这件随机装备还掉不掉的概率：(W + spill × (n − W)) / n，W = 各底材权重之和、n = 底材数；没有 profile / 无门控时为 1
export function gearKeepP(region, profile) {
  const bases = regionOf(region).gearBases || [], n = bases.length;
  if (!n || !profile) return 1;
  const W = bases.reduce((s, b) => s + slotGateW(profile, ITEMS[b] && ITEMS[b].slot), 0);
  const spill = GEAR_SLOT_GATE && GEAR_SLOT_GATE.spill != null ? GEAR_SLOT_GATE.spill : 1;
  return Math.min(1, (W + spill * (n - W)) / n);
}
// 栏位门控权重：已解锁 1；未解锁按 GEAR_SLOT_GATE.away[差几层]（超出取最后一项）
export function slotGateW(profile, slot) {
  const A = GEAR_SLOT_GATE && GEAR_SLOT_GATE.away;
  if (!profile || !profile.realm || !A || !A.length || !slot) return 1;
  const away = slotLayersAway(profile, slot);
  return away <= 0 ? 1 : A[Math.min(away, A.length - 1)] ?? 0;
}

// ---------------- 掉落 ----------------
function itemsOf(id, n, o = {}) {
  const def = ITEMS[id];
  if (!def) return console.warn("[loot] 未知物品", id), [];
  const out = [];
  const st = def.stack || 1;
  const mk = (k) => makeItem(id, { n: k, rarity: o.rarity, level: o.level, identified: o.identified, tags: def.tags ? [...def.tags] : [] });
  if (st <= 1) for (let i = 0; i < n; i++) out.push(mk(1));
  else for (let left = n; left > 0; left -= st) out.push(mk(Math.min(st, left)));
  return out;
}

// ---------------- 机缘值 ----------------
function fortuneHolder(o, pity) {
  if (o.profile) return (o.profile.stats ||= {});
  return pity;
}
// 委托 / 奇遇等外部来源加机缘值：addFortune(profile, "quest" | "encounter" | 数值)
export function addFortune(profile, src) {
  const st = (profile.stats ||= {});
  const v = typeof src === "number" ? src : FORTUNE.add[src] || 0;
  st.fortune = Math.min(FORTUNE.max, (st.fortune || 0) + v);
  return getFortune(profile);
}
export function getFortune(profile) {
  const v = (profile && profile.stats && profile.stats.fortune) || 0;
  return { value: Math.min(v, FORTUNE.max), max: FORTUNE.max, full: v >= FORTUNE.max };
}

function runEntries(entries, c) {
  const { rng, R, out } = c;
  for (const e of entries) {
    if (e.region && e.region !== c.region) continue;
    if (e.enemy && (Array.isArray(e.enemy) ? !e.enemy.includes(c.enemy) : e.enemy !== c.enemy)) continue; // 功法体系 v2：只对某些击杀者生效
    if (e.chest) {
      runEntries(SOURCES[e.chest], c);
      continue;
    }
    if (e.chance != null && rng() >= e.chance) continue;
    if (e.once) {
      // 只给一次（仿 GLOW_ONCE）：有存档按旗标；没存档时按退路概率
      const fl = c.profile && (c.profile.flags ||= {});
      if (fl) {
        if (fl[e.once]) continue;
        fl[e.once] = !0;
      } else if (rng() >= (e.onceFallback ?? 0.5)) continue;
    }
    if (e.stones) {
      const n = Math.round(ri(rng, e.stones[0], e.stones[1]) * R.stoneMul);
      if (n > 0) out.push(...itemsOf("spirit_stone", n));
    } else if (e.mat) {
      for (let k = 0; k < (e.picks || 1); k++) {
        let id, n;
        if (e.mat === "core") id = CORE_OF[c.enemy] || CORE_OF[c.region] || "wolf_core";
        else if (e.mat === "mob" && R.mobMats && R.mobMats[c.enemy]) {
          const l = R.mobMats[c.enemy];
          id = l[Math.floor(rng() * l.length)];
        } else {
          const pool = R[e.mat === "mob" ? "common" : e.mat] || R.common;
          const p = weighted(rng, pool);
          id = p[0];
          n = ri(rng, p[2][0], p[2][1]);
        }
        out.push(...itemsOf(id, e.n ? nOf(rng, e.n) : n || 1, { level: c.level }));
      }
    } else if (e.item) {
      // 鉴定：固定奖励（遗府 / 首领 / 采集，c.fixed）一律已鉴定；其余按 makeItem 的默认（宝品以上装备 / 法宝 / 残卷才未鉴定）。
      // 原来传 identified: c.fixed（= false）让宝箱 / 精英里的丹方残页、丹药、丹方全成了"未鉴定"，同种不能堆叠（2026-11-17 修）
      out.push(...itemsOf(e.item, nOf(rng, e.n), { rarity: e.rarity, level: c.level, identified: e.identified ?? (c.fixed ? !0 : undefined) }));
    } else if (e.pick) {
      // unlearned（功法体系 v2）：优先抽还没学会的功法（def.teaches 不在 profile.flags.learned.spells）；全学会了照常抽
      const list = e.unlearned ? unlearnedPick(e.pick, c.profile) : e.pick;
      out.push(...itemsOf(weighted(rng, list)[0], nOf(rng, e.n), { level: c.level, identified: e.identified ?? (c.fixed ? !0 : undefined) }));
    } else if (e.gearBase) {
      out.push(makeGear(e.gearBase, e.rarity || 0, c.gearLevel(), { region: c.region, rng, identified: !0 }));
    } else if (e.gear) {
      c.gearRolls.push(e);
    }
  }
}

export function rollLoot(sourceId, o = {}) {
  const rng = o.rng || Math.random;
  const region = REGION_LOOT[o.region] ? o.region : "r1";
  const R = regionOf(region);
  const level = o.level ?? R.level[0];
  const pity = o.pity || (o.profile && o.profile.stats && (o.profile.stats.pity ||= { mobNoGear: 0, jackpot: 0 })) || sessionPity;
  pity.mobNoGear ??= 0;
  const fh = fortuneHolder(o, pity);
  fh.fortune ??= 0;
  const c = {
    rng, region, R, level, enemy: o.enemy, profile: o.profile || null, out: [], gearRolls: [], fixed: !1,
    gearLevel: () => Math.max(1, Math.min(R.level[1] + 1, level + ri(rng, -1, 1))),
  };
  // 首领首杀的装备（SOURCES.boss_first 与 BOSSES[id].first）：按击杀者的层数（筑基算 10），最多区域上限 + 3（青牙 v2 §6.6）
  const kl = killerLayer(o.profile);
  if (sourceId === "boss_first" && kl) c.gearLevel = () => Math.max(1, Math.min(R.level[1] + 3, kl + ri(rng, -1, 1)));

  if (sourceId.startsWith("gather_")) {
    let kind = sourceId.slice(7);
    const generic = GATHER[kind] && !Array.isArray(GATHER[kind]);
    if (generic) kind = (weighted(rng, GATHER[kind][region] || GATHER[kind].r1 || Object.values(GATHER[kind])[0]) || [kind])[0];
    // 暮 / 夜采集：灵草品质有概率再升一档（GARDEN.herbTideShift，按 opts.phase）
    const tide = GARDEN && GARDEN.herbTideShift && GARDEN.herbTideShift[o.phase];
    const qm = /_q(\d)$/.exec(kind);
    if (tide && qm && rng() < tide) {
      const up = kind.replace(/_q\d$/, "_q" + Math.min(4, +qm[1] + 1));
      if (Array.isArray(GATHER[up])) kind = up;
    }
    const once = GLOW_ONCE[kind];
    if (once && o.profile) {
      const fl = (o.profile.flags ||= {});
      if (fl[once]) kind = weighted(rng, GATHER.glow[region] || GATHER.glow.r1)[0];
      else fl[once] = !0;
    }
    if (!Array.isArray(GATHER[kind])) return console.warn("[loot] 未知采集类型", sourceId), [];
    c.fixed = !0;
    runEntries(GATHER[kind], c);
    return c.out;
  }

  let entries = SOURCES[sourceId];
  if (!entries) return console.warn("[loot] 未知来源", sourceId), [];
  if (sourceId === "ruin_first") {
    const ru = RUINS[o.ruin || RUIN_OF_REGION[region]];
    c.fixed = !0;
    if (ru) runEntries(ru.first, c);
    c.fixed = !1;
  } else if (sourceId === "boss_first" || sourceId === "boss_repeat") {
    const b = BOSSES[o.boss || BOSS_OF_REGION[region]];
    c.fixed = !0;
    if (b) runEntries(sourceId === "boss_first" ? b.first : b.repeat, c);
    c.fixed = !1;
  }
  runEntries(entries, c);

  // 装备：按权重定品质
  let gotGood = !1, gotJackpot = !1;
  for (const e of c.gearRolls) {
    const rar = weighted(rng, e.gear.map((w, i) => [i, w]));
    if (!rar) continue;
    let r = rar[0];
    if ((sourceId === "mob" || sourceId === "mob_low") && r < 1 && pity.mobNoGear >= PITY.mobGear) (r = 1), (c.pityHit = !0);
    // 栏位门控：未解锁栏位的份额只有 GEAR_SLOT_GATE.spill 转给已解锁栏位，其余这件不掉（极品、保底、指定 slot 的不受影响）
    if (r < 4 && !c.pityHit && !e.slot) {
      const kp = gearKeepP(region, c.profile);
      if (kp < 1 && rng() >= kp) continue;
    }
    if (r >= 1) gotGood = !0;
    if (r >= 4) gotJackpot = !0;
    c.out.push(makeGear(null, r, c.gearLevel(), { region, rng, slot: e.slot, profile: c.profile }));
    if (c.pityHit) c.out[c.out.length - 1].tags.push("pity"), (c.pityHit = !1);
  }
  // 机缘值：满了 → Boss / 夜明宝箱必出极品；出了极品清零；否则按来源累积
  if (!gotJackpot && fh.fortune >= FORTUNE.max && FORTUNE.payout.includes(sourceId)) {
    gotJackpot = !0;
    const j = makeGear(null, 4, c.gearLevel(), { region, rng });
    j.tags.push("fortune");
    if (FORTUNE.payoutKey) j.tags.push("key");
    c.out.push(j);
  }
  if (gotJackpot) fh.fortune = 0;
  else if (FORTUNE.add[sourceId]) fh.fortune = Math.min(FORTUNE.max, fh.fortune + FORTUNE.add[sourceId]);
  // 小怪保底：连续 25 只没出灵品以上装备 → 之后掉的下一件装备至少灵品
  if (sourceId === "mob" || sourceId === "mob_low") pity.mobNoGear = gotGood ? 0 : pity.mobNoGear + 1;
  return c.out;
}

// ---------------- 感悟与来源 ----------------
// 击杀者层数：练气 N 层 = N，筑基 = 10；没有存档返回 0
export function killerLayer(p) {
  const r = p && p.realm;
  return r ? (r.stage >= 2 ? 10 : r.layer || 0) : 0;
}
// o.layer 击杀者层数（不传则用 o.profile）：首领有 xpPerLayer 时感悟 = xpPerLayer × 层数，否则用固定 xp
export function xpForKill(type, region, o = {}) {
  const def = ENEMY_TYPES[type] || {};
  region = region || def.region || "r1";
  if (def.boss && BOSSES[def.boss]) {
    const B = BOSSES[def.boss], L = o.layer ?? killerLayer(o.profile);
    const base = B.xpPerLayer && L ? B.xpPerLayer * L : B.xp;
    return Math.round(base * (o.first ? 1 : INSIGHT.bossRepeat));
  }
  const base = def.insight ?? regionOf(region).insight;
  return def.tags && def.tags.includes("elite") ? base * INSIGHT.eliteMul : base;
}
export function enemyLootSource(type, profile) {
  const def = ENEMY_TYPES[type] || {};
  if (def.lootSource) return def.lootSource === "none" || SOURCES[def.lootSource] ? def.lootSource : "mob";
  if (def.boss) return profile && profile.flags && profile.flags["boss_" + def.boss] ? "boss_repeat" : "boss_first";
  return def.tags && def.tags.includes("elite") ? "elite" : "mob";
}
