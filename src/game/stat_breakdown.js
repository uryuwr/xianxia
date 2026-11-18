// 属性分项（内观阁 · 属性卷；UI 设计 2026-11-17）：把主角每项属性拆成"来源 → 贡献"，口径与局内一致。
//   局内组装顺序（照抄，改那边时这里同步）：
//     境界 heroStats(base) + 修为进度 progressBonusStats       → run.js applyHeroStats（setBase）
//     三件法器 gearMods（栏位已解锁才算）                      → run.js applyEquipStats（标签 equip；这里按部位拆成 equip:sword / robe / jade）
//     法宝被动 ARTIFACTS[id].passive(level)                   → skills/index.js applyLoadout（标签 artifact）
//     心法 = 心法栏 ∪ 三件法器的特殊词条，同名只算一次          → skills/index.js applyLoadout（标签 xinfa:<id>）
//     出发前丹药（护脉丹 use.dmgTaken → vuln；凝神丹 use.sense） → run.js applyProfileToHero（preRun）、containers.js pillSense
//     炼化增益 buffMods(profile.buffs[i])                     → run.js applyBuffs（buff:<id>，只在出行局里生效）
//     认主未复 flags.bloodDebuff（下一局气血 −x%）              → run.js applyProfileToHero（blood）
//   叠加：最终 = (基础 + Σ固定) × (1 + Σ百分比) × Π(1 + 独立乘区)（src/core/combat.js Stats.get）；
//   闪身冷却另乘 (1 − min(cdrCap, dashCdr))（player.js dashRecharge）。
//   不计：阵法（站在阵里）、神龛附灵、满势、状态效果——局内条件生效。
//
// statBreakdown(P, { plan, mode }) → { [属性]: { final, base, flat, pct, more, parts: [{ src, grp, label, type, value, c, temp, off }] } }
//   plan：行囊预案 { 丹药 id: { 品级: 枚数 } }（src/game/pack_plan.js），用来预览出发前丹药；
//   mode："run" 按出行计（默认，含本局临时加成）/ "cave" 洞府中（本局临时加成标 off，不计入 final）。
//   grp：境（境界 + 修为进度）/ 器（三件法器 + 法宝）/ 心（心法）/ 局（炼化增益、出发前丹药、认主未复）。
//   c：这一条对最终值的贡献（百分比按 (基础 + Σ固定) × 百分比 算）。
import { defOf } from "../core/items.js";
import { STAT_DEFAULTS } from "../core/combat.js";
import { heroStats, progressBonusStats, slotOpen, SLOT_LABEL } from "./progression.js";
import { ARTIFACTS, XINFA } from "../data/items.js";
import { PLAYER } from "../data/player.js";
import { gearMods, loadoutOf, buffMods, buffName } from "./run/run.js";

const NUMC = "零一二三四五六七八九十";
const PRE_USE = (d) => (d && d.use) || {};

// 全部带标签的加成（不含合计）
export function statMods(P, o = {}) {
  const out = [];
  const add = (stat, type, value, src, grp, label, temp) => out.push({ stat, type, value, src, grp, label, temp: !!temp });
  const base = { ...STAT_DEFAULTS, ...heroStats(P, { base: !0 }) };
  for (const [k, v] of Object.entries(base)) if (typeof v === "number") add(k, "base", v, "realm", "境", "境界");
  const pb = progressBonusStats(P);
  for (const [k, v] of Object.entries(pb)) if (typeof v === "number" && v) add(k, "flat", v, "prog", "境", "修为进度");
  // 三件法器（按部位拆）；gx_ 标记 = 特殊词条心法，下面按心法算
  const gearXinfa = {};
  for (const slot of ["sword", "robe", "jade"]) {
    const g = P.equip && P.equip[slot];
    if (!g || !slotOpen(P, slot)) continue;
    const name = (defOf(g) || {}).name || g.id;
    for (const m of gearMods(g)) {
      if (String(m.stat).startsWith("gx_")) continue;
      add(m.stat, m.type || "flat", m.value, "equip:" + slot, "器", `${SLOT_LABEL[slot]} · ${name}`);
    }
    for (const a of g.affixes || []) if (a.stat === "special" && a.xinfa && XINFA[a.xinfa] && XINFA[a.xinfa].affix && !gearXinfa[a.xinfa]) gearXinfa[a.xinfa] = name;
  }
  // 法宝被动
  const lo = loadoutOf(P);
  const A = lo.artifact && lo.artifact.id && ARTIFACTS[lo.artifact.id];
  if (A) {
    const inst = P.equip.artifact, L = lo.artifact.level;
    const nm = (defOf(inst) || {}).name || A.name;
    for (const m of A.passive(L)) add(m.stat, m.type || "flat", m.value, "artifact", "器", `法宝 · ${nm}（祭炼${NUMC[L] || L}重${inst && P.nativeArtifact === inst.uid ? " · 本命" : ""}）`);
  }
  // 心法：心法栏 ∪ 法器特殊词条，同名只算一次
  const xs = [...new Set([...(lo.xinfa || []), ...Object.keys(gearXinfa)])];
  for (const id of xs) {
    const x = XINFA[id];
    if (!x || x.retired || !x.mods) continue;
    const from = gearXinfa[id] && !(lo.xinfa || []).includes(id) ? `（${gearXinfa[id]}词条）` : "";
    for (const m of x.mods) add(m.stat, m.type || "flat", m.value, "xinfa:" + id, "心", `心法《${x.name}》${from}`);
  }
  // 出发前丹药（预案里带了才算；与局内一致：每种效果只取一枚）
  const plan = o.plan || {};
  let vulnDone = !1, senseDone = !1;
  for (const [id, q] of Object.entries(plan)) {
    const n = Object.values(q || {}).reduce((a, b) => a + b, 0);
    if (!(n > 0)) continue;
    const d = defOf({ id }), u = PRE_USE(d);
    if (u.dmgTaken && !vulnDone) (vulnDone = !0), add("vuln", "flat", u.dmgTaken, "preRun", "局", `出发前 · ${d.name}`, 1);
    if (u.sense && !senseDone) (senseDone = !0), add("sense", "flat", u.sense, "preRun", "局", `出发前 · ${d.name}`, 1);
  }
  // 炼化增益
  const list = Array.isArray(P.buffs) ? P.buffs : P.buffs ? Object.values(P.buffs) : [];
  for (const b of list) {
    if (!b || !(b.remain > 0)) continue;
    const r = Math.round(b.remain), lab = `炼化 · ${buffName(b)}（余 ${Math.floor(r / 60)} 分${r % 60 ? ` ${r % 60} 秒` : ""}）`;
    for (const m of buffMods(b)) add(m.stat, m.type || "flat", m.value, "buff:" + (b.id || "lingqi"), "局", lab, 1);
  }
  // 认主未复
  const bd = P.flags && P.flags.bloodDebuff;
  if (bd > 0) add("hp", "pct", -bd, "blood", "局", "滴血认主未复（只这一局）", 1);
  return out;
}

export function statBreakdown(P, o = {}) {
  const mode = o.mode || "run";
  const mods = statMods(P, o);
  const out = {};
  const keys = new Set(mods.map((m) => m.stat));
  for (const k of keys) {
    const all = mods.filter((m) => m.stat === k);
    let base = 0, flat = 0, pct = 0, more = 1, hasBase = !1;
    for (const m of all) {
      m.off = mode === "cave" && m.temp;
      if (m.off) continue;
      if (m.type === "base") (base += m.value), (hasBase = !0);
      else if (m.type === "pct") pct += m.value;
      else if (m.type === "more") more *= 1 + m.value;
      else flat += m.value;
    }
    if (!hasBase) base = STAT_DEFAULTS[k] ?? 0;
    const sum0 = base + flat;
    let subtotal = sum0 * (1 + pct);
    const parts = all.map((m) => {
      const c = m.type === "pct" ? sum0 * m.value : m.type === "more" ? subtotal * m.value : m.value;
      if (m.type === "more" && !m.off) subtotal += c;
      return { ...m, c };
    });
    out[k] = { final: sum0 * (1 + pct) * more, base, flat, pct, more, parts };
  }
  // 闪身冷却：× (1 − min(上限, dashCdr))，把 dashCdr 的几条并进来显示
  if (out.dashCd) {
    const D = PLAYER.dash || {}, cd = out.dashCd, r = out.dashCdr;
    const cdr = Math.min(D.cdrCap ?? 0.4, Math.max(0, r ? r.final : 0));
    if (r) for (const m of r.parts) cd.parts.push({ ...m, c: -cd.final * m.value, cdr: !0 });
    cd.cdr = cdr;
    cd.final = Math.max(D.minRecharge ?? 0, cd.final * (1 - cdr));
  }
  return out;
}

// 四类来源
export const SRC_GROUPS = { 境: "境界", 器: "法器", 心: "心法", 局: "本局" };
