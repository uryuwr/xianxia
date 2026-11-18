// 功法装配（模块 A）：法术 / 心法 / 法宝 / 阵盘——方向一"功法匣列表"（docs/ui/v2/装配_v2_方案.md、草图 docs/ui/v2/loadout_v2/a_xingqian.html）。
//   数据：沿用 profile.build = { spells: [Q, E, R], xinfa: [一, 二], formation }；法宝仍是装备栏 equip.artifact（物品实例）。
//   规则：空栏不自动补（局内 run.js loadoutOf 只读 build）；局内法术 / 心法 / 阵盘不能换；同一法术不占两栏（放入时互换）；
//         被装备特殊词条提供的心法灰显但允许装入，提示"同名不叠加：这一栏等于空着"，栏上盖"叠"印。
//   新领悟 / 新开栏：syncNewLearned(profile) 只在"第一次见到"时放一次（进洞府时调用；洞府参悟后也可以直接调用）。
//
// 用法：
//   const lo = new LoadoutUI(ctx, profile, { region, onChange })；lo.slotsEl（立绘下的随身功法栏）、lo.boxEl（功法匣纸笺）；lo.dispose()
//   openLoadout(ctx, { from, region, onClose })：独立弹层（洞府"参悟后装上""心魔试炼前调整功法"用），关闭时存档
import { kit } from "./kit.js";
import { pushEsc } from "./esc.js";
import { skillIconEl, itemTag } from "./icons.js";
import { RARITY, defOf, valueOf } from "../core/items.js";
import { inkReadable } from "../fx/rarity_tint.js";
import { Stats } from "../core/combat.js";
import { heroStats, slotOpen } from "../game/progression.js";
import { PROGRESSION } from "../data/progression.js";
import { SPELLS, FORMATIONS } from "../data/skills.js";
import { ARTIFACTS, XINFA } from "../data/items.js";
import { COUNTER, EL_NAME, SHIELD_TUNE } from "../game/shields.js";
import { gearMods } from "../game/run/run.js";
import { gongfaSource, regionShieldInfo } from "../game/gongfa.js";
import { gapLineEl, rowExtraHTML, fillTagHTML, tipSrcHTML, sourceShort, sortCandidates, gapGroups } from "./gongfa_hint.js";

// ---------------- 五行（颜色与 HUD 技能栏一致） ----------------
export const EL = {
  metal: { n: "金", c: "#9a7d34", w: "rgba(168,134,47,.24)" },
  wood: { n: "木", c: "#3f9a6e", w: "rgba(63,154,110,.22)" },
  water: { n: "水", c: "#2f7fa8", w: "rgba(47,127,168,.22)" },
  fire: { n: "火", c: "#b8291a", w: "rgba(192,57,43,.2)" },
  earth: { n: "土", c: "#9a6a32", w: "rgba(154,106,50,.22)" },
};
const KINDS = ["spell", "formation", "artifact", "xinfa"];
const KNAME = { spell: "法术", xinfa: "心法", artifact: "法宝", formation: "阵盘" };
const KEYS = { spell: ["Q", "E", "R"], formation: ["T"], artifact: ["V"], xinfa: ["心法", "心法"] }; // 法宝改用 V 键；右键是蓄势斩（只展示）
const NUM = "零一二三四五六七八九十";
const UNL = { spell: "spellSlots", xinfa: "xinfaSlots", artifact: "artifactSlot", formation: "formationSlot" };
const MAXN = { spell: 3, xinfa: 2, artifact: 1, formation: 1 };
const r0 = (x) => Math.round(x);

// ---------------- 栏位 ----------------
export function slotCount(P, kind) {
  const v = P.unlocks[UNL[kind]];
  return kind === "spell" ? v ?? 1 : kind === "xinfa" ? v || 0 : v ? 1 : 0;
}
const realmText = (k) => {
  const [s, l] = k.split(":").map(Number);
  return s === 2 ? `筑基${NUM[l]}层` : s === 1 ? `练气${NUM[l]}层` : "凡人";
};
export function unlockText(kind, i = 0) {
  const list = PROGRESSION.unlocks[UNL[kind]] || [];
  const hit = list.find(([, v]) => (kind === "spell" || kind === "xinfa" ? v > i : v === !0));
  return hit ? realmText(hit[0]) + "解锁" : "";
}
// 规范 build 的形状（定长）
export function normBuild(P) {
  const b = (P.build = P.build || {});
  b.spells = [0, 1, 2].map((i) => (b.spells && b.spells[i]) || null);
  const xs = Array.isArray(b.xinfa) ? b.xinfa : [];
  b.xinfa = [0, 1].map((i) => xs[i] || null);
  b.formation = b.formation || null;
  return b;
}
const learned = (P) => (P.flags && P.flags.learned) || {};
const learnedOf = (P, kind) => {
  const L = learned(P);
  if (kind === "spell") return L.spells || [];
  if (kind === "xinfa") return L.xinfa || [];
  if (kind === "formation") return L.formations || [];
  return [];
};
// 装备特殊词条提供的心法：id → 装备名
export function gearXinfa(P) {
  const out = {};
  for (const slot of ["sword", "robe", "jade", "artifact"]) {
    const g = P.equip[slot];
    if (!g) continue;
    for (const a of g.affixes || []) if (a.stat === "special" && a.xinfa) out[a.xinfa] = (defOf(g) || {}).name || "装备";
  }
  return out;
}
export function getSlot(P, kind, i = 0) {
  const b = normBuild(P);
  if (kind === "spell") return b.spells[i];
  if (kind === "xinfa") return b.xinfa[i];
  if (kind === "formation") return b.formation;
  return P.equip.artifact ? P.equip.artifact.uid : null;
}
// 可装配列表：[{ id, name, def, have, at, src, gear }]
export function pool(P, kind) {
  const b = normBuild(P), L = learnedOf(P, kind);
  if (kind === "artifact") {
    const list = [];
    if (P.equip.artifact) list.push(P.equip.artifact);
    for (const it of P.storage.items) if ((defOf(it) || {}).cat === "artifact") list.push(it);
    return list.map((it) => ({ id: it.uid, inst: it, name: (defOf(it) || {}).name || it.id, def: ARTIFACTS[(defOf(it) || {}).artifactId] || {}, have: !0, at: P.equip.artifact === it ? 0 : -1, src: P.nativeArtifact === it.uid ? "本命法宝 · 永不遗落" : it.bound ? "已认主" : "" }));
  }
  const table = kind === "spell" ? SPELLS : kind === "xinfa" ? XINFA : FORMATIONS;
  const gx = kind === "xinfa" ? gearXinfa(P) : {};
  const ids = [...new Set([...L, ...Object.keys(table).filter((id) => kind !== "xinfa" || !table[id].affix || gx[id])])];
  return ids
    .filter((id) => table[id])
    .map((id) => {
      const arr = kind === "spell" ? b.spells : kind === "xinfa" ? b.xinfa : [b.formation];
      const at = arr.indexOf(id);
      const have = L.includes(id);
      // 功法体系 v2：没学会的法术，副标题写来源短句（"青岚山外 · 山神庙石傀 · 残页 1/3"），由 src/game/gongfa.js 从掉落表推出
      return { id, name: table[id].name, def: table[id], have, at: at >= 0 && at < slotCount(P, kind) ? at : -1, src: have ? "" : gx[id] ? "" : kind === "spell" ? gongfaSource(P, id).short : "未领悟", gear: gx[id] || null };
    })
    .sort((a, b) => (b.have - a.have) || (a.at < 0) - (b.at < 0));
}
// 放入（同类在别栏则互换）→ { ok, msg }
export function place(P, kind, i, id) {
  const b = normBuild(P);
  if (i >= slotCount(P, kind)) return { ok: !1, msg: `${KNAME[kind]}栏未开：${unlockText(kind, i)}`, locked: !0 };
  if (kind === "artifact") {
    const it = P.storage.items.find((x) => x.uid === id);
    if (!it) return { ok: P.equip.artifact && P.equip.artifact.uid === id };
    const cur = P.equip.artifact;
    const part = P.storage.remove(it.uid);
    if (cur && !P.storage.add(cur)) {
      P.storage.add(part);
      return { ok: false, msg: "仓库放不下卸下的法宝" };
    }
    P.equip.artifact = part;
    return { ok: !0 };
  }
  if (kind !== "xinfa" && !learnedOf(P, kind).includes(id)) return { ok: !1, msg: "尚未领悟" };
  if (kind === "xinfa" && !learnedOf(P, kind).includes(id) && !gearXinfa(P)[id]) return { ok: !1, msg: "尚未领悟" };
  if (kind === "formation") {
    b.formation = id;
    return { ok: !0 };
  }
  const arr = kind === "spell" ? b.spells : b.xinfa;
  const j = arr.indexOf(id);
  if (j >= 0 && j !== i) arr[j] = arr[i]; // 互换
  arr[i] = id;
  const gx = kind === "xinfa" ? gearXinfa(P)[id] : null;
  return { ok: !0, msg: gx ? `同名不叠加：${gx}的词条已提供《${XINFA[id].name}》，这一栏等于空着` : "" };
}
export function clearSlot(P, kind, i) {
  const b = normBuild(P);
  if (kind === "artifact") {
    if (P.equip.artifact && P.storage.add(P.equip.artifact)) P.equip.artifact = null;
  } else if (kind === "formation") b.formation = null;
  else (kind === "spell" ? b.spells : b.xinfa)[i] = null;
}
export function swapSlots(P, kind, i, j) {
  const b = normBuild(P), arr = kind === "spell" ? b.spells : kind === "xinfa" ? b.xinfa : null;
  if (!arr || i === j || j >= slotCount(P, kind)) return !1;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return !0;
}
// 还空着的已解锁栏（只算有东西可装的种类）
export function emptySlots(P) {
  const out = [];
  for (const kind of KINDS) {
    if (!pool(P, kind).some((x) => x.have)) continue;
    for (let i = 0; i < slotCount(P, kind); i++) if (!getSlot(P, kind, i)) out.push(KEYS[kind][i] + (kind === "xinfa" ? (i ? "二" : "一") : ""));
  }
  return out;
}
// 新领悟的功法 / 新开的栏：只在第一次见到时放进空栏（不会把玩家故意空着的栏补上）
export function syncNewLearned(P) {
  const b = normBuild(P), F = (P.flags = P.flags || {});
  const seen = (F.loadoutSeen = F.loadoutSeen || { spell: [], xinfa: [], formation: [], slots: {} });
  const placed = [];
  for (const kind of ["spell", "xinfa", "formation"]) {
    const n = slotCount(P, kind), prevN = seen.slots[kind] ?? n;
    const fresh = learnedOf(P, kind).filter((id) => !seen[kind].includes(id));
    const arr = kind === "spell" ? b.spells : kind === "xinfa" ? b.xinfa : null;
    // 新领悟的放进空栏
    for (const id of fresh) {
      if (kind === "formation") {
        if (!b.formation && n) (b.formation = id), placed.push(id);
      } else if (!arr.includes(id)) {
        const i = arr.findIndex((x, k) => !x && k < n);
        if (i >= 0) (arr[i] = id), placed.push(id);
      }
      seen[kind].push(id);
    }
    // 新开的栏：从未装的已领悟里挑第一个
    if (arr && n > prevN)
      for (let i = prevN; i < n; i++) {
        if (arr[i]) continue;
        const id = learnedOf(P, kind).find((x) => !arr.includes(x));
        if (id) (arr[i] = id), placed.push(id);
      }
    seen.slots[kind] = n;
  }
  return placed;
}

// ---------------- 伤害（按当前境界 + 装备算） ----------------
function heroNow(P) {
  const st = new Stats(heroStats(P));
  for (const slot of ["sword", "robe", "jade"]) if (P.equip[slot]) st.addAll(gearMods(P.equip[slot]), "equip");
  const a = P.equip.artifact && ARTIFACTS[(defOf(P.equip.artifact) || {}).artifactId];
  if (a && a.passive && slotOpen(P, "artifact")) st.addAll(a.passive(P.equip.artifact.level || 1), "artifact");
  return { atk: st.get("atk"), spell: st.get("spell") };
}
const dmg = (h, base = 0, sc = {}) => r0(base + h.atk * (sc.atk || 0) + h.spell * (sc.spell || 0));
export function damageText(P, kind, def) {
  const h = heroNow(P);
  if (kind === "spell") {
    const e = def.effect || {};
    if (e.type === "projectile") {
      if (e.explode) return `命中 ${dmg(h, e.base, e.scale)} · 爆炸 <b>${dmg(h, e.explode.base, e.explode.scale)}</b>（半径 ${e.explode.radius}）`;
      return e.count > 1 ? `${e.count} 道，每道 <b>${dmg(h, e.base, e.scale)}</b>${e.pierce ? "（穿透）" : ""}` : `单体 <b>${dmg(h, e.base, e.scale)}</b>`;
    }
    if (e.type === "zone") return `每 ${e.tick} 秒 <b>${dmg(h, e.base, e.scale)}</b> × ${r0(e.dur / e.tick)} 跳（半径 ${e.radius}）`;
    if (e.type === "shield") return `吸收 <b>${dmg(h, e.absorb, e.absorbScale)}</b> 伤害 · ${e.dur} 秒`;
    if (e.type === "slam") return `砸落 <b>${dmg(h, e.base, e.scale)}</b>（半径 ${e.radius}）`;
    if (e.type === "chain") return `首跳 <b>${dmg(h, e.base, e.scale)}</b>，跳 ${e.jumps} 次${e.antiAir ? ` · 飞行妖物 ×${e.antiAir.mul} 并打落` : ""}`;
    // 功法体系 v2
    if (e.type === "buff") return `立得气势 <b>${e.momentum}</b> · ${e.dur} 秒内剑意削盾 +50%`;
    if (e.type === "grapple") return `藤索 ${e.range} 米 · 命中 <b>${dmg(h, e.base, e.scale)}</b> 并贴身 · 气势 +${e.momentum}`;
    if (e.type === "counter") return `${e.window} 秒内化去一击 · 反卷 <b>${dmg(h, e.base, e.scale)}</b>（半径 ${e.radius}）· 气势 +${e.momentum}`;
    if (e.type === "summon") return `${e.count} 只火鸦 · 每只扑 ${e.strikes} 次，每次 <b>${dmg(h, e.base, e.scale)}</b> · ${e.life} 秒`;
    if (e.type === "blink") return `遁地 ${e.range} 米（无敌）· 破土 <b>${dmg(h, e.base, e.scale)}</b>（半径 ${e.radius}）`;
    return "";
  }
  if (kind === "formation") {
    if (def.kind === "strike") return `每 ${def.tick} 秒斩 ${def.targets} 个敌人，各 <b>${dmg(h, def.base, def.scale)}</b> · ${def.dur} 秒`;
    if (def.kind === "field") return `每 ${def.tick} 秒 <b>${dmg(h, def.base, def.scale)}</b> · ${def.dur} 秒`;
    return `${def.desc} · ${def.dur} 秒`;
  }
  if (kind === "artifact") {
    const A = def, L = 1, act = A.active || {};
    return act.base != null ? `V：真气 ${act.cost} · 冷却 ${act.cd} 秒 · <b>${dmg(h, act.base, act.scale)}</b>` : "";
  }
  return "";
}

// ---------------- 去处护盾（从关卡数据与敌人数据算） ----------------
const SH_CACHE = {};
export function shieldInfo(region) {
  if (SH_CACHE[region]) return SH_CACHE[region];
  return (SH_CACHE[region] = regionShieldInfo(region));
}
// 已带覆盖：[{ el, by:[名字], ok }]
export function coverage(P, region) {
  const info = shieldInfo(region), b = normBuild(P);
  const have = [];
  for (let i = 0; i < slotCount(P, "spell"); i++) if (b.spells[i] && SPELLS[b.spells[i]]) have.push(SPELLS[b.spells[i]]);
  return info.els.map((el) => {
    const by = have.filter((d) => d.element === COUNTER[el] && !["shield", "buff"].includes(d.effect?.type)).map((d) => d.name);
    return { el, need: COUNTER[el], by, ok: by.length > 0 };
  });
}
// "换上"：缺的那一行里，已领悟没带的克制法术
export function suggest(P, region) {
  const b = normBuild(P);
  for (const c of coverage(P, region)) {
    if (c.ok) continue;
    const id = learnedOf(P, "spell").find((x) => SPELLS[x] && SPELLS[x].element === c.need && !["shield", "buff"].includes(SPELLS[x].effect?.type) && !b.spells.slice(0, slotCount(P, "spell")).includes(x));
    if (id) return { id, el: c.el };
  }
  return null;
}
export function applySuggest(P, region) {
  const s = suggest(P, region);
  if (!s) return null;
  const b = normBuild(P), n = slotCount(P, "spell");
  let i = b.spells.findIndex((x, k) => !x && k < n);
  if (i < 0) {
    // 没空栏：替换在本去处克不到任何盾的那一个
    const els = shieldInfo(region).els.map((e) => COUNTER[e]);
    i = b.spells.findIndex((x, k) => k < n && x && !els.includes((SPELLS[x] || {}).element));
  }
  if (i < 0) return null;
  place(P, "spell", i, s.id);
  return { ...s, i };
}

// ---------------- 签与详情 ----------------
function tokenEl(kind, id, entry, o = {}) {
  const size = o.size || 52;
  if (kind === "artifact" && entry && entry.inst) {
    const t = itemTag(entry.inst, { size, box: "1x1", title: "" });
    return t;
  }
  const def = entry ? entry.def : null;
  const el = def && def.element ? EL[def.element] : null;
  const e = kit.el("div", "mk-ld-tok" + (kind === "xinfa" ? " xf" : ""));
  e.style.cssText = `--tok:${size}px;--elc:${el ? el.c : kind === "xinfa" ? "rgba(21,24,27,.78)" : "#b8923a"};--elw:${el ? el.w : "transparent"}`;
  const ic = id ? skillIconEl(id) : null;
  if (ic) e.appendChild(ic);
  else e.insertAdjacentHTML("beforeend", `<b>${def ? def.glyph || def.name[0] : ""}</b>`);
  return e;
}
export function tipHTML(P, kind, entry, region) {
  const def = entry.def || {}, el = def.element ? EL[def.element] : null;
  const head = `<div class="h"><span class="nm">${entry.name}</span>${el ? `<span class="els" style="background:${el.c}">${el.n}</span>` : ""}<span class="role">${kind === "spell" ? def.role || "" : KNAME[kind]}</span></div>`;
  if (kind === "xinfa") return head + `<p>${def.desc || ""}</p>${entry.gear ? `<p class="warn">${entry.gear}的词条已提供 · 同名不叠加</p>` : ""}${entry.have || entry.gear ? "" : `<p class="dim">尚未领悟</p>`}`;
  if (kind === "artifact") {
    const it = entry.inst, R = RARITY[it.rarity || 0];
    const pas = def.passive ? def.passive(it.level || 1).map((m) => `${STATN[m.stat] || m.stat} +${m.value}`).join(" · ") : "";
    return head.replace(`<span class="nm">`, `<span class="nm" style="color:${inkReadable(it.rarity || 0)}">`) + `<p class="dim">${R.name} · 祭炼 ${it.level || 1} 重${entry.src ? " · " + entry.src : ""}</p><p>${def.desc || ""}</p>${pas ? `<p>被动：${pas}</p>` : ""}<p>${damageText(P, kind, def)}</p>`;
  }
  const rows = kind === "spell" ? [["真气", def.cost], ["冷却", def.cd + " 秒"], ["前摇", (def.castTime || 0) + " 秒"], ["距离", def.range ? def.range + " 米" : "自身"]] : [["真气", def.cost], ["冷却", def.cd + " 秒"], ["半径", def.radius + " 米"], ["持续", def.dur + " 秒"]];
  const h = heroNow(P);
  const st = def.status ? `附带 · ${{ armor_break: "破甲", burn: "灼烧", chill: "寒冷", root: "缠绕", stun: "震晕" }[def.status.id] || def.status.id} ${def.status.stacks > 1 ? def.status.stacks + " 层 · " : ""}${def.status.dur} 秒` : "";
  let shield = "";
  if (el && !["shield", "buff"].includes(def.effect?.type)) {
    const beats = Object.keys(COUNTER).find((s) => COUNTER[s] === def.element); // 这一行克制的护盾
    const info = shieldInfo(region);
    const here = info.els.includes(beats);
    shield = `<p>克 <b style="color:${EL[beats].c}">${EL_NAME[beats]}盾</b> ×${SHIELD_TUNE.counter} · 其他盾 ×${SHIELD_TUNE.other} · 普攻 ×${SHIELD_TUNE.physical}</p><p class="${here ? "ok" : "dim"}">${regionName(region)}：${here ? whereShield(info, beats) + ` 有${EL_NAME[beats]}盾 · 用得上` : `没有${EL_NAME[beats]}盾`}</p>`;
  }
  return head + `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("")}</div><p class="dim">当前 法力 ${r0(h.spell)} · 攻击 ${r0(h.atk)}</p><p>${damageText(P, kind, def)}</p>${st ? `<p class="dim">${st}</p>` : ""}${shield}<p class="desc">${def.desc || ""}</p>${entry.have ? "" : `<p class="dim">尚未领悟</p>`}${kind === "spell" ? tipSrcHTML(P, entry.id, region) : ""}`;
}
const STATN = { atk: "攻击", def: "防御", hp: "气血", mp: "真气", mpRegen: "真气回复", spell: "法力" };
const regionName = (r) => ({ r1: "青岚山外", r2: "竹海·溪谷", tutorial: "溪边" }[r] || r);
function whereShield(info, el) {
  const parts = [];
  if (info.share[el]) parts.push(`精英约 ${r0(info.share[el] * 10)} 成`);
  if (info.boss && info.boss.els.includes(el)) parts.push(info.boss.name);
  return parts.join("、");
}
// 去处信息里的"护盾 / 已带"两行（HTML）
export function shieldLines(P, region) {
  const info = shieldInfo(region);
  if (!info.els.length) return { shield: "无", have: "—" };
  const sh = Object.entries(info.share).sort((a, b) => b[1] - a[1]).map(([e, s]) => `<b style="color:${EL[e].c}">${EL_NAME[e]}盾</b> ${r0(s * 10)}成`);
  if (info.boss) sh.push(`${info.boss.name} ${info.boss.els.map((e) => `<b style="color:${EL[e].c}">${EL_NAME[e]}</b>`).join("→")}`);
  const cov = coverage(P, region).map((c) => `<span class="${c.ok ? "ok" : "no"}"><b style="color:${EL[c.el].c}">${EL_NAME[c.el]}盾</b> ${c.ok ? "✓ " + c.by.join("、") : "✗ 缺" + EL_NAME[c.need]}</span>`);
  return { shield: sh.join(" · "), have: cov.join(" · ") };
}

// ---------------- 界面 ----------------
const CSS = `
.mk-ld-tok { position: relative; width: var(--tok); height: var(--tok); flex: none; isolation: isolate; user-select: none; }
.mk-ld-tok::before { content: ""; position: absolute; inset: 8%; z-index: -1; border-radius: 50%; background: radial-gradient(closest-side, var(--elw), transparent); }
.mk-ld-tok::after { content: ""; position: absolute; inset: 0; z-index: 1; background: var(--elc); opacity: .8; -webkit-mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; pointer-events: none; }
.mk-ld-tok.xf::after { -webkit-mask-image: var(--ink-enso-3); mask-image: var(--ink-enso-3); }
.mk-ld-tok > .mk-ico { --ih: 70%; }
.mk-ld-tok > b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 400 calc(var(--tok) * .44) var(--f-display); color: var(--ink-nong); }
.mk-ld-slots { display: flex; align-items: flex-end; gap: 14px; }
.mk-ld-slots .grp { display: flex; gap: 10px; align-items: flex-end; }
.mk-ld-slots .sep { width: 8px; height: 64px; background: var(--ink-dan); -webkit-mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; }
.mk-ld-slot { position: relative; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; }
.mk-ld-slot .k { font: 11px var(--f-ui); color: var(--ink-zhong); }
.mk-ld-slot .well { position: relative; width: 52px; height: 52px; }
.mk-ld-slot .well.empty::after { content: ""; position: absolute; inset: 0; background: var(--ink-dan); opacity: .35; -webkit-mask: var(--ink-enso-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-1) 0 0 / 100% 100% no-repeat; }
.mk-ld-slot.locked .well::before { content: "锁"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 20px var(--f-display); color: var(--ink-qing); }
.mk-ld-slot .cap { font: 12px var(--f-kai); color: var(--ink-nong); white-space: nowrap; text-align: center; line-height: 1.25; min-height: 30px; }
.mk-ld-slot.locked .cap { color: var(--ink-dan); font-size: 11px; }
.mk-ld-slot.sel .well { outline: 2px solid var(--zhu); outline-offset: 2px; border-radius: 50%; }
.mk-ld-slot.hot .well { transform: scale(1.08); }
.mk-ld-slot .die { position: absolute; right: 2px; top: 14px; z-index: 3; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font: 11px var(--f-display); color: #f5f0e3; background: var(--zhu); -webkit-mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; transform: rotate(-6deg); }
.mk-ld-slot.dup .well { opacity: .5; filter: grayscale(.8); }
.mk-ld-slot.fixed { cursor: default; }
.mk-ld-box { width: 100%; }
.mk-ld-box .tabs { display: flex; gap: 2px; margin-bottom: 6px; }
.mk-ld-box .tabs button { border:0; background:none; }
.mk-ld-box .tabs button:focus-visible,.mk-ld-slot:focus-visible,.mk-ld-row:focus-visible { outline:2px solid var(--zhu);outline-offset:2px; }
.mk-ld-box .tabs .ink-tab { cursor: pointer; font-size: 16px; padding: 2px 6px 6px; white-space: nowrap; letter-spacing: .06em; }
.mk-ld-box .tabs .ink-tab small { font: 11px var(--f-ui); color: var(--ink-dan); margin-left: 2px; }
.mk-ld-box .gearline { font: 12px var(--f-kai); color: var(--ink-zhong); margin: 0 0 6px; }
.mk-ld-box .list { max-height: 330px; overflow-y: auto; }
.mk-ld-row { position: relative; display: flex; align-items: center; gap: 10px; padding: 5px 2px; cursor: grab; }
.mk-ld-row + .mk-ld-row::before { content: ""; position: absolute; left: 0; right: 30%; top: 0; height: 5px; background: var(--ink-mist); -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.mk-ld-row .t { flex: 1; min-width: 0; }
.mk-ld-row .t .n { font: 17px var(--f-display); color: var(--ink); letter-spacing: .06em; }
.mk-ld-row .t .s { font: 11px var(--f-ui); color: var(--ink-zhong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mk-ld-row .at { font: 11px var(--f-ui); color: var(--zhu); white-space: nowrap; }
.mk-ld-row .at::before { content: "●"; margin-right: 3px; }
.mk-ld-row.off { cursor: pointer; }
.mk-ld-row.off:not([data-src-kind="spell"]) { opacity: .45; }
.mk-ld-row.off .t .n { color: var(--ink-zhong); }
.mk-ld-row.dup .t .n { color: var(--ink-dan); }
.mk-ld-row.sel { background: rgba(184,41,26,.06); }
.mk-ld-ghost { position: fixed; left: 0; top: 0; z-index: 99; pointer-events: none; opacity: .85; transform: translate(-50%, -50%); }
.mk-ld-tip { position: fixed; z-index: 98; display: none; box-sizing: border-box; width: 272px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 12px 16px 14px; font: 13px/1.6 var(--f-kai); color: var(--ink-nong); background: var(--paper-hi); box-shadow: 0 4px 12px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; transform: rotate(-.6deg); pointer-events: none; }
.mk-ld-tip .h { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mk-ld-tip .nm { font: 20px var(--f-display); color: var(--ink); }
.mk-ld-tip .els { font: 12px var(--f-display); color: #f5f0e3; padding: 0 4px; border-radius: 2px; }
.mk-ld-tip .role { font: 12px var(--f-ui); color: var(--ink-dan); }
.mk-ld-tip .kv { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 0 8px; font-size: 12px; }
.mk-ld-tip .kv span { color: var(--ink-dan); } .mk-ld-tip .kv b { font-weight: 400; color: var(--ink); }
.mk-ld-tip p { margin: 3px 0; } .mk-ld-tip p b { color: var(--ink); }
.mk-ld-tip .dim { color: var(--ink-dan); font-size: 12px; } .mk-ld-tip .ok { color: var(--shilv); font-size: 12px; } .mk-ld-tip .warn { color: var(--zhu); font-size: 12px; }
.mk-ld-tip .desc { font-size: 12px; color: var(--ink-zhong); border-top: 1px solid rgba(21,24,27,.1); padding-top: 4px; }
.mk-ld-help { font: 11px var(--f-ui); color: var(--ink-dan); }
/* 装配提示：一行小字条（由宿主摆在不挡内容的位置），2.5 秒后淡出 */
.mk-ld-note { min-height: 18px; font: 13px/18px var(--f-kai); color: var(--ink-zhong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.mk-ld-note.warn { color: var(--zhu); } .mk-ld-note.gold { color: var(--mk-gold); }
.mk-ld-note.on { animation: mkLdNote 2.5s ease both; }
@keyframes mkLdNote { 0% { opacity: 0; } 8% { opacity: 1; } 76% { opacity: 1; } 100% { opacity: 0; } }
`;

export class LoadoutUI {
  constructor(ctx, P, o = {}) {
    kit.css("loadout", CSS);
    this.ctx = ctx;
    this.P = P;
    this.paged = !!o.paged;
    this.active = o.active !== false;
    this.pages = {};
    this.onReveal = o.onReveal || (() => {});
    this.onRead = o.onRead;
    this.region = o.region || "r1";
    this.onChange = o.onChange || (() => {});
    this.tab = o.tab || "spell";
    this.sel = null; // { src: "box" | "slot", kind, id?, i? }
    this.hover = null; // 悬停中的匣内功法 { kind, id }
    normBuild(P);
    this.slotsEl = kit.el("div", "mk-ld-slots");
    this.boxEl = kit.el("div", "mk-ld-box" + (this.paged ? " paged" : ""));
    this.tipEl = kit.el("div", "mk-ld-tip");
    this.noteEl = kit.el("div", "mk-ld-note"); // 提示小字条：宿主自己摆位置（出行准备：随身功法一行右侧；弹窗：栏位下方）
    document.body.appendChild(this.tipEl);
    this.onKey = (e) => this.key(e);
    addEventListener("keydown", this.onKey, !0);
    this.onMove = (e) => this.drag && this.dragMove(e);
    this.onUp = (e) => this.drag && this.dragEnd(e);
    addEventListener("mousemove", this.onMove);
    addEventListener("mouseup", this.onUp);
    this.render();
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.hover = null;
    this.tipEl.style.display = "none";
    if (this.drag?.ghost) this.drag.ghost.remove();
    this.drag = null;
  }
  escape() {
    if (this.pinned) { this.unpin(); return true; }
    if (this.sel) { this.sel = null; this.render(); return true; }
    return false;
  }
  entries(kind = this.tab) {
    const entries = pool(this.P, kind);
    if (kind !== "spell") return entries;
    const ordered = sortCandidates(this.P, entries.filter(e => !e.have).map(e => e.id), this.region);
    const rank = new Map(ordered.map((id, i) => [id, i]));
    return entries.sort((a, b) => Number(b.have) - Number(a.have) || (a.have ? 0 : (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999)));
  }
  setPage(page) {
    const max = Math.max(0, Math.ceil(this.entries().length / 6) - 1);
    const next = Math.max(0, Math.min(max, page));
    if ((this.pages[this.tab] || 0) === next) return;
    this.pages[this.tab] = next;
    this.hover = null;
    this.renderBox();
  }
  setRegion(r) {
    this.unpin();
    this.region = r;
    this.render();
  }
  // 提示：写进小字条，2.5 秒后淡出（不用居中横幅，免得压住立绘和功法匣）
  say(msg, kind = "") {
    const n = this.noteEl;
    clearTimeout(this._noteT);
    n.textContent = msg;
    n.title = msg;
    n.className = "mk-ld-note " + (kind || (/不叠加|未开|尚未|放不进|只能|最多|没有/.test(msg) ? "warn" : ""));
    void n.offsetWidth; // 重新播放淡出
    n.classList.add("on");
    this._noteT = setTimeout(() => ((n.textContent = ""), n.classList.remove("on")), 2500);
  }
  changed(msg, kind = "") {
    if (msg) this.say(msg, kind);
    this.render();
    this.onChange();
  }
  // ---- 渲染 ----
  render() {
    this.hover = null;
    if (!this.pinned) this.tipEl.style.display = "none";
    this.renderSlots();
    this.renderBox();
    if (this.pinned && !this.paged) this.pinSource(this.pinned, false);
  }
  renderSlots() {
    const P = this.P, root = this.slotsEl, gx = gearXinfa(P);
    root.innerHTML = "";
    const groups = [[["spell", 0], ["spell", 1], ["spell", 2]], [["charge", 0], ["formation", 0], ["artifact", 0]], [["xinfa", 0], ["xinfa", 1]]];
    groups.forEach((g, gi) => {
      if (gi) root.appendChild(kit.el("span", "sep", ""));
      const box = kit.el("div", "grp");
      for (const [kind, i] of g) box.appendChild(this.slotEl(kind, i, gx));
      root.appendChild(box);
    });
  }
  slotEl(kind, i, gx) {
    if (kind === "charge") {
      // 右键 · 蓄势斩：固有招式，不装配，只展示
      const e = kit.el("div", "mk-ld-slot fixed");
      e.appendChild(kit.el("span", "k", "右键"));
      const well = kit.el("div", "well");
      const tok = kit.el("div", "mk-ld-tok");
      tok.style.cssText = "--tok:52px;--elc:rgba(21,24,27,.7);--elw:transparent";
      const ic = skillIconEl("charge");
      if (ic) tok.appendChild(ic);
      else tok.insertAdjacentHTML("beforeend", "<b>势</b>");
      well.appendChild(tok);
      e.appendChild(well);
      e.appendChild(kit.el("span", "cap", "蓄势斩"));
      e.title = "右键 · 蓄势斩：气势满时释放（固有招式，无须装配）";
      return e;
    }
    const P = this.P, locked = i >= slotCount(P, kind), id = getSlot(P, kind, i);
    const e = kit.el("div", "mk-ld-slot" + (locked ? " locked" : ""));
    e.dataset.slotKind = kind;
    e.dataset.slotI = i;
    e.tabIndex = 0; e.setAttribute("role", "button");
    e.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this.clickSlot(kind, i); } });
    e.appendChild(kit.el("span", "k", KEYS[kind][i]));
    const well = kit.el("div", "well" + (!id || locked ? " empty" : ""));
    let name = "";
    if (id && !locked) {
      const entry = pool(P, kind).find((x) => x.id === id) || { id, def: (kind === "spell" ? SPELLS : kind === "xinfa" ? XINFA : FORMATIONS)[id] || {}, name: id };
      well.appendChild(tokenEl(kind, id, entry));
      name = entry.name;
      if (kind === "xinfa" && gx[id]) e.classList.add("dup"), e.appendChild(kit.el("span", "die", "叠"));
      e.dataset.id = id;
      this.bindTip(e, kind, entry);
      e.addEventListener("mousedown", (ev) => ev.button === 0 && this.dragStart(ev, { src: "slot", kind, i, id, entry }));
    }
    e.appendChild(well);
    e.appendChild(kit.el("span", "cap", locked ? unlockText(kind, i) : name ? (kind === "xinfa" ? `《${name}》` : name) : "空"));
    if (this.sel && this.sel.src === "slot" && this.sel.kind === kind && this.sel.i === i) e.classList.add("sel");
    e.addEventListener("click", (ev) => (ev.stopPropagation(), this.clickSlot(kind, i)));
    e.addEventListener("mousedown", (ev) => ev.stopPropagation());
    return e;
  }
  renderBox() {
    const P = this.P, root = this.boxEl;
    root.innerHTML = "";
    const tabs = kit.el("div", "tabs ink-tabs");
    for (const kind of ["spell", "xinfa", "artifact", "formation"]) {
      const n = pool(P, kind).filter((x) => x.have).length;
      const t = kit.el("button", "ink-tab" + (this.tab === kind ? " on" : ""), `${KNAME[kind]}<small>${n}</small>`);
      t.dataset.tab = kind;
      t.addEventListener("click", (ev) => (ev.stopPropagation(), this.unpin(), (this.hover = null), (this.tab = kind), this.renderBox()));
      tabs.appendChild(t);
    }
    root.appendChild(tabs);
    if (this.tab === "xinfa") {
      const gx = gearXinfa(P), list = Object.entries(gx).map(([id, g]) => `${g}「${(XINFA[id] || {}).name}」`);
      if (list.length) root.appendChild(kit.el("div", "gearline", "身上：" + list.join(" · ")));
    }
    const list = kit.el("div", "list");
    let entries = this.entries();
    if (!this.paged && this.tab === "spell") {
      const line = gapLineEl(P, this.region, id => id && this.pinSource(id));
      if (line) root.insertBefore(line, root.firstChild);
    }
    const total = entries.length, pages = Math.max(1, Math.ceil(total / 6));
    const page = this.pages[this.tab] = Math.min(this.pages[this.tab] || 0, pages - 1);
    if (this.paged) entries = entries.slice(page * 6, page * 6 + 6);
    if (!entries.length) list.appendChild(kit.el("div", "mk-tip mk-dim", this.tab === "artifact" ? "尚无法宝" : "尚未领悟"));
    for (const en of entries) list.appendChild(this.rowEl(this.tab, en));
    root.appendChild(list);
    if (this.paged) {
      const pager = kit.el("div", "ld-pager");
      pager.dataset.pager = "gongfa";
      pager.append(kit.button("上一页", () => this.setPage(page - 1), { small: true, disabled: page === 0, id: "gongfa-prev" }),
        kit.el("span", "", `${page + 1} / ${pages} · 共 ${total} 门`),
        kit.button("下一页", () => this.setPage(page + 1), { small: true, disabled: page + 1 === pages, id: "gongfa-next" }));
      root.appendChild(pager);
      this.renderDetail();
    }
    root.appendChild(kit.el("div", "mk-ld-help", "拖入栏位 · 栏间拖动换位 · 拖出卸下 · 先点功法再点栏位 · 悬停按 Q / E / R / T / V 直接装入 · 局内不能换"));
  }
  renderDetail() {
    if (!this.paged) return;
    this.boxEl.querySelector(".ld-detail")?.remove();
    const d = this.detail || (this.sel?.src === "box" ? this.sel : null);
    const en = d && pool(this.P, d.kind).find(e => e.id === d.id);
    const panel = kit.el("div", "ld-detail");
    if (!en) panel.appendChild(kit.el("p", "mk-tip", "点选功法查看详情；已领悟的功法可点选左侧栏位装配。"));
    else {
      panel.appendChild(kit.el("h3", "", en.name));
      const summary = d.kind === "spell" ? `<p>${(en.def.desc || "").slice(0, 60)}${(en.def.desc || "").length > 60 ? "…" : ""}</p>${tipSrcHTML(this.P, en.id, this.region)}` : tipHTML(this.P, d.kind, en, this.region);
      panel.appendChild(kit.el("div", "ld-detail-summary", summary));
      panel.appendChild(kit.button("展开完整说明", () => this.onRead?.(en.name, tipHTML(this.P, d.kind, en, this.region)), { small: true, id: "ld-read" }));
      if (en.at >= 0) panel.appendChild(kit.button("卸下", () => { clearSlot(this.P, d.kind, en.at); this.changed("已卸下"); }, { small: true, id: "ld-off" }));
      else if (en.have || en.gear) {
        for (let i = 0; i < slotCount(this.P, d.kind); i++) panel.appendChild(kit.button(`装入 ${KEYS[d.kind][i]}${d.kind === "xinfa" ? i + 1 : ""}`, () => this.put(d.kind, i, en.id), { small: true }));
      }
    }
    this.boxEl.appendChild(panel);
  }
  rowEl(kind, en) {
    const e = kit.el("div", "mk-ld-row" + (en.have || en.gear ? "" : " off") + (en.gear ? " dup" : ""));
    e.dataset.srcKind = kind;
    e.dataset.srcId = en.id;
    const token = tokenEl(kind, en.id, en, { size: 42 });
    if (kind === "spell" && !en.have) token.classList.add("gfh-rub");
    e.appendChild(token);
    const d = en.def || {}, el = d.element ? EL[d.element] : null;
    const sub = kind === "spell" ? `${el ? el.n : ""} · ${d.role || ""} · 冷却 ${d.cd} 秒 · 真气 ${d.cost}` : kind === "formation" ? `${el ? el.n : "无"} · 冷却 ${d.cd} 秒 · 真气 ${d.cost}` : kind === "artifact" ? `${RARITY[en.inst.rarity || 0].name} · 祭炼 ${en.inst.level || 1} 重${en.src ? " · " + en.src : ""}` : en.gear ? `${en.gear}词条已提供 · 同名不叠加` : d.desc || "";
    e.appendChild(kit.el("div", "t", `<div class="n">${kind === "xinfa" ? `《${en.name}》` : en.name}${kind === "spell" && !en.have ? fillTagHTML(this.P, en.id, this.region) : ""}</div><div class="s">${en.have || en.gear || kind === "artifact" ? sub : kind === "spell" ? sourceShort(this.P, en.id, this.region) : en.src || "未领悟"}</div>`));
    if (kind === "spell" && !en.have) e.insertAdjacentHTML("beforeend", rowExtraHTML(this.P, en.id, this.region));
    if (this.pinned === en.id) e.classList.add("gfh-flash");
    if (en.at >= 0) e.appendChild(kit.el("span", "at", `${KEYS[kind][en.at]}${kind === "xinfa" ? (en.at ? "二" : "一") : ""}栏`));
    if (this.sel && this.sel.src === "box" && this.sel.kind === kind && this.sel.id === en.id) e.classList.add("sel");
    e.tabIndex = 0; e.setAttribute("role", "button");
    e.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); e.click(); } });
    this.bindTip(e, kind, en);
    e.addEventListener("mouseenter", () => (this.hover = { kind, id: en.id, en }));
    e.addEventListener("mouseleave", () => (this.hover = null));
    if (en.have || en.gear || kind === "artifact") {
      e.addEventListener("mousedown", (ev) => (ev.stopPropagation(), ev.button === 0 && this.dragStart(ev, { src: "box", kind, id: en.id, entry: en })));
      e.addEventListener("click", (ev) => (ev.stopPropagation(), this.clickBox(kind, en.id)));
    } else {
      e.addEventListener("click", (ev) => (ev.stopPropagation(), this.pinned === en.id ? this.unpin() : this.pinSource(en.id)));
    }
    return e;
  }
  bindTip(el, kind, entry) {
    el.addEventListener("mouseenter", (ev) => this.showTip(ev, kind, entry));
    el.addEventListener("mouseleave", () => !this.pinned && (this.tipEl.style.display = "none"));
  }
  showTip(ev, kind, entry) {
    if (this.paged || this.drag || this.pinned) return;
    this.tipEl.innerHTML = tipHTML(this.P, kind, entry, this.region);
    this.tipEl.style.display = "block";
    this.moveTip(ev);
  }
  moveTip(ev) {
    if (this.tipEl.style.display !== "block") return;
    const anchor = ev.currentTarget || this.boxEl;
    const r = anchor.getBoundingClientRect();
    const box = this.boxEl.isConnected ? this.boxEl.getBoundingClientRect() : r;
    this.tipEl.style.maxHeight = "calc(100vh - 16px)";
    this.tipH = this.tipEl.offsetHeight;
    const x = box.left >= 288 ? box.left - 280 : Math.min(innerWidth - 280, box.right + 8);
    const y = Math.min(innerHeight - (this.tipH || 200) - 8, r.top);
    this.tipEl.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px) rotate(-.6deg)`;
    this.tipEl.style.left = "0px";
    this.tipEl.style.top = "0px";
  }
  unpin() {
    this.pinned = null;
    this.tipEl.style.pointerEvents = "none";
    this.tipEl.style.display = "none";
    for (const row of this.boxEl.querySelectorAll(".gfh-flash")) row.classList.remove("gfh-flash");
  }
  pinSource(id, scroll = true) {
    const kind = KINDS.find(k => pool(this.P, k).some(e => e.id === id));
    if (!kind) return;
    this.onReveal(kind);
    this.unpin();
    this.pinned = id;
    this.detail = { kind, id };
    this.tab = kind;
    const entries = this.entries(kind), en = entries.find(e => e.id === id);
    this.pages[kind] = Math.floor(entries.indexOf(en) / 6);
    this.renderBox();
    if (this.paged) return;
    const row = [...this.boxEl.querySelectorAll("[data-src-id]")].find(e => e.dataset.srcId === id);
    if (row && scroll) row.parentElement.scrollTop = Math.max(0, row.offsetTop - row.parentElement.offsetTop);
    this.tipEl.style.pointerEvents = "auto";
    this.tipEl.innerHTML = tipHTML(this.P, kind, en, this.region);
    this.tipEl.style.display = "block";
    this.moveTip({ currentTarget: row || this.boxEl });
  }
  // ---- 点选 ----
  clickBox(kind, id) {
    this.detail = { kind, id };
    this.unpin();
    if (this.sel && this.sel.src === "slot" && this.sel.kind === kind) {
      const s = this.sel;
      this.sel = null;
      return this.put(kind, s.i, id);
    }
    this.sel = this.sel && this.sel.src === "box" && this.sel.id === id ? null : { src: "box", kind, id };
    this.render();
  }
  clickSlot(kind, i) {
    this.onReveal(kind);
    const id = getSlot(this.P, kind, i);
    if (id) this.detail = { kind, id };
    this.unpin();
    if (this.dragged) return (this.dragged = !1);
    if (i >= slotCount(this.P, kind)) return this.say(`${KNAME[kind]}栏未开：${unlockText(kind, i)}`, "warn");
    const s = this.sel;
    if (s && s.src === "box" && s.kind === kind) {
      this.sel = null;
      return this.put(kind, i, s.id);
    }
    if (s && s.src === "slot" && s.kind === kind && s.i !== i) {
      this.sel = null;
      swapSlots(this.P, kind, s.i, i);
      return this.changed();
    }
    this.tab = kind;
    this.sel = s && s.src === "slot" && s.kind === kind && s.i === i ? null : { src: "slot", kind, i };
    this.render();
  }
  put(kind, i, id) {
    const r = place(this.P, kind, i, id);
    if (!r.ok) return this.changed(r.msg || "放不进去");
    this.changed(r.msg || "");
  }
  // 悬停功法按 Q / E / R / T / V 直接装入；Esc 取消选中
  key(e) {
    if (!this.active || e.repeat || document.querySelector(".mk-modal,.prep-modal") || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    // Esc 由宿主 pushEsc 处理，不能绕过更高的弹层。
    const h = this.hover;
    if (!h) return;
    const map = { KeyQ: ["spell", 0], KeyE: ["spell", 1], KeyR: ["spell", 2], KeyT: ["formation", 0], KeyV: ["artifact", 0] };
    const m = map[e.code];
    if (!m || m[0] !== h.kind) return;
    e.preventDefault();
    e.stopPropagation();
    this.put(m[0], m[1], h.id);
  }
  // ---- 拖拽 ----
  dragStart(ev, src) {
    if (!this.active) return;
    this.unpin();
    this.drag = { ...src, x: ev.clientX, y: ev.clientY, moved: !1, ghost: null };
    this.dragged = !1;
  }
  dragMove(e) {
    const d = this.drag;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = !0;
      this.tipEl.style.display = "none";
      d.ghost = tokenEl(d.kind, d.id, d.entry, { size: 52 });
      d.ghost.classList.add("mk-ld-ghost");
      document.body.appendChild(d.ghost);
    }
    d.ghost.style.transform = `translate(${e.clientX - 26}px, ${e.clientY - 26}px)`;
  }
  dragEnd(e) {
    const d = this.drag;
    this.drag = null;
    if (!d.moved) return;
    d.ghost && d.ghost.remove();
    this.dragged = !0;
    this._dragT = setTimeout(() => (this.dragged = !1), 0);
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const slot = hit && hit.closest && hit.closest("[data-slot-kind]");
    if (slot && slot.dataset.slotKind === d.kind) {
      const i = +slot.dataset.slotI;
      if (d.src === "slot") {
        if (i === d.i) return;
        if (i >= slotCount(this.P, d.kind)) return this.changed(`${KNAME[d.kind]}栏未开：${unlockText(d.kind, i)}`);
        swapSlots(this.P, d.kind, d.i, i);
        return this.changed();
      }
      return this.put(d.kind, i, d.id);
    }
    if (slot) return this.changed(`这是${KNAME[slot.dataset.slotKind]}栏，放不进${KNAME[d.kind]}`);
    if (d.src === "slot") {
      clearSlot(this.P, d.kind, d.i); // 拖出栏外 = 卸下
      this.changed(`卸下${d.entry ? d.entry.name : ""}`);
    }
  }
  dispose() {
    clearTimeout(this._noteT);
    clearTimeout(this._dragT);
    removeEventListener("keydown", this.onKey, !0);
    removeEventListener("mousemove", this.onMove);
    removeEventListener("mouseup", this.onUp);
    this.tipEl.remove();
    if (this.drag && this.drag.ghost) this.drag.ghost.remove();
  }
}

// ---------------- 独立弹层（洞府快捷入口用） ----------------
const POP_CSS = `
.mk-ld-pop { position: absolute; inset: 0; background: rgba(21,24,27,.32); }
.mk-ld-pop .mk-panel { left: 50%; top: 50%; }
.mk-ld-pop .pan { position: absolute; left: 230px; top: 70px; width: 820px; }
.mk-ld-pop .pan .row { display: flex; gap: 22px; align-items: flex-start; }
.mk-ld-pop .pan .left { width: 470px; }
.mk-ld-pop .pan .right { flex: 1; }
.mk-ld-pop .pan .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
`;
export function openLoadout(ctx, o = {}) {
  kit.css("loadout-pop", POP_CSS);
  const P = (ctx.flow && ctx.flow.profile) || ctx.profile;
  if (!P) return null;
  const L = kit.layer("loadout", 74);
  kit.clear("loadout");
  kit.show("loadout", !0);
  const root = kit.el("div", "mk-ld-pop");
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  const stage = kit.el("div", "mk-stage");
  root.appendChild(stage);
  const p = kit.panel(`功法匣 <small>${o.from === "trial" ? "心魔试炼前调整功法" : o.from === "study" ? "新领悟的功法" : "调整功法"}</small>`, { cls: "pan" });
  const row = kit.el("div", "row");
  const left = kit.el("div", "left"), right = kit.el("div", "right");
  row.append(left, right);
  p.body.appendChild(row);
  const region = o.region || (P.flags && P.flags.lastRegion) || "r1";
  const note = kit.el("div", "mk-tip");
  const ui = new LoadoutUI(ctx, P, { region, tab: o.tab, onChange: () => upd() });
  const upd = () => {
    const sl = shieldLines(P, region), empty = emptySlots(P);
    note.innerHTML = `护盾：${sl.shield}<br>已带：${sl.have}${empty.length ? `<br><span class="mk-red">还有 ${empty.length} 栏空着（${empty.join("、")}）</span>` : ""}`;
  };
  left.append(ui.slotsEl, ui.noteEl, note);
  right.appendChild(ui.boxEl);
  upd();
  let closed = !1;
  const close = () => {
    if (closed) return;
    closed = !0;
    ui.dispose();
    popEsc();
    kit.clear("loadout");
    kit.show("loadout", !1);
    if (ctx.save) ctx.save();
    if (ctx.applyProfileStats) ctx.applyProfileStats(P);
    o.onClose && o.onClose();
  };
  // Esc（src/ui/esc.js 弹层栈）：有选中先取消选中，再按才关；叠在洞府确认框上时只关自己
  const popEsc = pushEsc(() => { if (!ui.escape()) close(); }, { el: root });
  const foot = kit.el("div", "foot");
  foot.appendChild(kit.el("span", "mk-ld-help", "局内不能换法术、心法、阵盘；法宝随装备"));
  foot.appendChild(kit.button("定了", close, { primary: !0, small: !0, id: "ld-done" }));
  p.body.appendChild(foot);
  stage.appendChild(p.root);
  L.appendChild(root);
  return { close, ui };
}
