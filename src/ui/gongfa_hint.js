// 功法指引（功法体系 v2 · UI）：「我知道下一门去哪打」——草图 docs/ui/v2/gongfa_v2/（用户选定 C 出行缺口签 + 舆图小签，加 A 功法匣来源签）。
//   规则全部只读 src/game/gongfa.js（gongfaSource / gongfaSources / shieldGap / scrollStudyList / wuxOf），这里只做"已带"覆盖的合并与界面。
//
//   出行准备（src/ui/screens/prep.js 两行接线）：
//     mountPrepGap(coverEl, stage, P, region, { state: createGapState(), rerender, goCave, take, save, onPick })
//       · 「护盾 / 已带」下一行缺口签：朱「缺水 ▸」（带的法术里没有破这种盾的五行）；没缺口时泥金「顺路可收 N ▸」
//       · 点签展开缺口纸条：盾在哪 → 能补的法术（残页点 / 名门 + 本去处来源 + 概率档）→ 本局补救（五行符）→ 舆图标出开关
//       · 出行页卷首一行「参悟 · 落石诀 残页 3/3 · 已集齐 · 回洞府仓库参悟 ›」（只在有可参悟时）
//   功法匣（src/ui/loadout.js 接线）：gapLineEl(P, region, onPick) 顶部缺口一行；rowExtraHTML(P, id, region) 条目右侧残页点 + 「补水」；
//     tipSrcHTML(P, id, region) 悬停卡下半「来源」段。
//   局内舆图小签：见 src/ui/gongfa_map.js。
//
//   句式（与丹方残页一致，docs/ui/v2/功法指引_v2_方案.md §5）：「残页 x/N · 集齐后到洞府仓库参悟」/「残页 N/N · 已集齐 · 到洞府仓库参悟」/「· 悟性可补 k 页」
//   性能（docs/性能优化_v1.md §7）：出行准备本来就是打开 / 改动时整页重建；这里不挂每帧逻辑，gongfaSources 已在 gongfa.js 按 id 缓存。
import { kit } from "./kit.js";
import { skillIconEl, mapIconStyle } from "./icons.js";
import { defOf } from "../core/items.js";
import { SPELLS } from "../data/skills.js";
import { gongfaSource, gongfaSources, shieldGap, scrollStudyList, wuxOf } from "../game/gongfa.js";
import { GONGFA } from "../data/gongfa.js";
import { EL, normBuild, slotCount, place, shieldInfo } from "./loadout.js";

const REGION_NAME = { r1: "青岚山外", r2: "竹海·溪谷", tutorial: "溪边" };
const FU = { metal: ["fu_metal", "金符 · 破木"], wood: ["fu_wood", "木符 · 破土"], water: ["fu_water", "水符 · 破火"], fire: ["fu_fire", "火符 · 破金"], earth: ["fu_earth", "土符 · 破水"] };
const TIER_CLS = { 必得: "bi", 必出: "bi", 保底: "bi", 常见: "chang", 偶得: "ou", 罕见: "han" };
const SRC_ICO = { elite: "elite", mob: "mob", rare_variant: "elite", chest_normal: "chest", chest_glow: "chest_glow", chest_night: "chest_night", pavilion: "chest", ruin_first: "den", ruin_repeat: "den", boss_first: "boss", boss_repeat: "boss" };
const noHit = (id) => !SPELLS[id] || ["shield", "buff"].includes(SPELLS[id].effect && SPELLS[id].effect.type);
const r0 = (x) => Math.round(x);

const CSS = `
.gfh-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 4px 0 0 3em; }
.gfh-gap { border: 0; background: none; position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 1px 10px 3px 8px; font: 400 15px var(--f-display); letter-spacing: .06em; color: var(--paper-hi); cursor: pointer; isolation: isolate; white-space: nowrap; }
.gfh-gap::before { content: ""; position: absolute; inset: 0 -4px; z-index: -1; background: var(--zhu); -webkit-mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; transition: transform .16s; }
.gfh-gap.gold::before { background: var(--nijin); }
.gfh-gap:hover::before, .gfh-gap.on::before { transform: scaleY(1.15); }
.gfh-gap .ar { font: 11px var(--f-ui); transition: transform .16s; }
.gfh-gap.on .ar { transform: rotate(90deg); }
.gfh-ready { left: 60px; top: 74px; max-width: 640px; overflow: hidden; text-overflow: ellipsis; font: 13px var(--f-kai); color: var(--mk-gold); cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
.gfh-ready b { font: 400 15px var(--f-display); color: var(--mk-gold); }
.gfh-ready:hover { color: var(--zhu); }
.gfh-slip { left: 404px; top: 150px; width: 304px; box-sizing: border-box; padding: 16px 18px 14px; z-index: 6; max-height: 362px; overflow-y: auto; transform: rotate(-.4deg); }
.gfh-slip .t1 { display: flex; align-items: baseline; gap: 8px; }
.gfh-slip .t1 .big { font: 400 28px/1.1 var(--f-display); letter-spacing: .08em; }
.gfh-slip .t1 .s { font: 13px var(--f-kai); color: var(--ink-zhong); }
.gfh-slip .t1 .x { margin-left: auto; font: 16px var(--f-ui); color: var(--ink-dan); cursor: pointer; padding: 0 4px; }
.gfh-slip .why { font: 12px/1.55 var(--f-kai); color: var(--ink-zhong); margin: 2px 0 6px; }
.gfh-slip .why b { font-weight: 400; font-family: var(--f-display); }
.gfh-cd { display: grid; grid-template-columns: 40px 1fr; gap: 0 10px; padding: 6px 2px 7px; position: relative; }
.gfh-cd + .gfh-cd::before { content: ""; position: absolute; left: 50px; right: 10%; top: 0; height: 5px; background: var(--ink-mist); -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.gfh-cd .n { font: 400 17px/1.2 var(--f-display); color: var(--ink); letter-spacing: .06em; display: flex; align-items: baseline; gap: 6px; }
.gfh-cd .n small { font: 11px var(--f-ui); color: var(--ink-dan); letter-spacing: 0; }
.gfh-cd .n .ink-btn { margin-left: auto; font-size: 14px; padding: 0 4px 4px; }
.gfh-cd .p { font: 12px/1.55 var(--f-kai); color: var(--ink-nong); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gfh-cd .w { font: 11.5px/1.5 var(--f-ui); color: var(--ink-zhong); }
.gfh-slip .ft { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--ink-mist); font: 11.5px/1.6 var(--f-ui); color: var(--ink-dan); }
.gfh-slip .ft .fu { font: 12px var(--f-kai); color: var(--ink-zhong); }
.gfh-slip .ft .fu b { font-weight: 400; color: var(--ink-nong); }
.gfh-slip .acts { display: flex; gap: 14px; margin-top: 4px; }
.gfh-slip .acts .ink-btn { font-size: 14px; padding: 0 2px 5px; }
.gfh-slip .acts .ink-btn.on { color: var(--zhu); }
.gfh-here { color: #2c7d57; }
.gfh-t { font: 11px var(--f-ui); white-space: nowrap; }
.gfh-t.bi { color: var(--zhu); } .gfh-t.chang { color: var(--ink-nong); } .gfh-t.ou { color: var(--ink-zhong); } .gfh-t.han { color: var(--ink-dan); }
.gfh-pg { display: inline-flex; gap: 3px; align-items: center; vertical-align: 1px; }
.gfh-pg i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.3px var(--ink-dan); }
.gfh-pg i.on { background: var(--ink-nong); box-shadow: none; }
.gfh-pg i.wx { box-shadow: inset 0 0 0 1.4px var(--nijin); background: rgba(196,160,70,.22); }
.gfh-pg.full i.on { background: var(--nijin); }
.mk-ld-tok.gfh-rub::after { background: var(--ink) !important; opacity: .2 !important; }
.mk-ld-tok.gfh-rub::before { display: none; }
.mk-ld-tok.gfh-rub > .mk-ico { filter: brightness(0); opacity: .42; }
/* 功法匣：顶部缺口一行、条目右侧残页点、悬停卡来源段 */
.gfh-line { position: relative; display: flex; align-items: baseline; gap: 6px; margin: 0 0 6px; padding: 4px 8px 5px; font: 13px/1.4 var(--f-kai); color: var(--ink-nong); cursor: pointer; isolation: isolate; }
.gfh-line::before { content: ""; position: absolute; inset: 0 -4px; z-index: -1; background: var(--zhu-wash); -webkit-mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; }
.gfh-line.ok::before { background: var(--nijin-wash); }
.gfh-line .lb { font: 400 14px var(--f-display); color: var(--zhu); white-space: nowrap; }
.gfh-line.ok .lb { color: var(--mk-gold); }
.gfh-line .go { margin-left: auto; font: 11px var(--f-ui); color: var(--ink-zhong); white-space: nowrap; }
.gfh-rx { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex: none; font: 10.5px var(--f-ui); color: var(--ink-dan); white-space: nowrap; }
.gfh-rx .rd { font: 400 12px var(--f-display); color: var(--mk-gold); }
.gfh-fill { font: 10.5px var(--f-ui); letter-spacing: 0; padding: 0 4px; margin-left: 5px; border-radius: 2px; color: var(--paper-hi); vertical-align: 2px; }
.mk-ld-row.gfh-flash { background: rgba(184,41,26,.08); }
.gfh-tsrc { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(21,24,27,.1); }
.gfh-tsrc .h { font: 12px var(--f-display); color: var(--ink-zhong); letter-spacing: .16em; margin-bottom: 2px; }
.gfh-tsrc .r { display: flex; align-items: center; gap: 6px; font: 12px/1.6 var(--f-kai); color: var(--ink-nong); }
.gfh-tsrc .r .w { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gfh-tsrc .r .rg { font: 11px var(--f-ui); color: var(--ink-dan); white-space: nowrap; }
.gfh-tsrc .pl { margin-top: 3px; font: 12px var(--f-kai); color: var(--ink-nong); }
.gfh-tsrc .wx { font: 11px var(--f-ui); color: var(--ink-dan); }
.gfh-mi { display: inline-block; width: 16px; height: 16px; flex: none; background-repeat: no-repeat; vertical-align: -3px; }
.gfh-mi.g { display: inline-flex; align-items: center; justify-content: center; font: 11px/1 var(--f-display); font-style: normal; color: var(--paper-hi); background: var(--ink-zhong); border-radius: 50%; }
`;
const css = () => kit.css("gongfa-hint", CSS);

// ---------------- 数据（只读 gongfa.js；"已带"按 profile.build 的已解锁栏位算） ----------------
export function carriedOf(P) {
  const b = P.build || {}, n = slotCount(P, "spell");
  return (b.spells || []).slice(0, n).filter(Boolean);
}
// 缺口：按"要的五行"合并 → [{ need, shields: [{ el, share, boss }], idle: [已学未带], cands: [未学 id] }]（只返回没带上的）
export function gapGroups(P, region) {
  const car = carriedOf(P), m = new Map();
  for (const g of shieldGap(P, region)) {
    if (car.some((id) => SPELLS[id] && SPELLS[id].element === g.need && !noHit(id))) continue;
    const e = m.get(g.need) || { need: g.need, shields: [], idle: g.has.filter((id) => !car.includes(id)), cands: g.can.map((c) => c.id) };
    e.shields.push({ el: g.el, share: g.share, boss: g.boss });
    m.set(g.need, e);
  }
  for (const g of m.values()) g.cands = sortCandidates(P, g.cands, region);
  return [...m.values()];
}
// 本去处可收：没学会、本去处有残页 / 完本来源（不含已可参悟的）
export function pickups(P, region) {
  const L = (P.flags && P.flags.learned && P.flags.learned.spells) || [];
  const rd = new Set(readyList(P).map((e) => e.teaches));
  return Object.keys(SPELLS)
    .filter((id) => !L.includes(id) && !rd.has(id) && gongfaSources(id).some((s) => s.region === region && (s.how === "page" || s.how === "book")))
    .sort((a, b) => gongfaSource(P, b).have - gongfaSource(P, a).have);
}
export const readyList = (P) => scrollStudyList(P).filter((e) => e.ready && !e.learned);

export const hasBook = (P, id) => P.storage.items.some((it) => it.identified !== false && defOf(it)?.teaches === id && !defOf(it).pages);
export function sortCandidates(P, ids, region) {
  const ready = new Set(readyList(P).map((e) => e.teaches));
  const rank = (id) => {
    const s = gongfaSource(P, id);
    return [ready.has(id) ? 0 : 1, gongfaSources(id).some((x) => x.region === region) ? 0 : 1, s.kind === "fixed" ? 0 : 1, Math.max(0, s.pages - s.have - s.fill)];
  };
  const ranks = new Map(ids.map((id) => [id, rank(id)]));
  return ids.slice().sort((a, b) => {
    const aa = ranks.get(a), bb = ranks.get(b);
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return 0;
  });
}
export function sourceShort(P, id, region) {
  const s = gongfaSource(P, id);
  if (s.learned) return s.short;
  if (readyList(P).some((e) => e.teaches === id)) return `${hasBook(P, id) ? "完本已得" : s.have >= s.pages ? "已集齐" : "悟性可补齐"} · 回洞府仓库参悟`;
  const here = srcList(id, region, 3).filter((x) => x.region === region && x.src !== "boss_first" && x.src !== "rare_variant");
  return here.length ? `本去处 · ${here.slice(0, 2).map((x) => x.where).join("、")}` : s.short;
}

// ---------------- 句式与小件 ----------------
export function pagesText(P, id) {
  const s = gongfaSource(P, id);
  if (s.learned || s.kind !== "pages") return "";
  const have = Math.min(s.have, s.pages);
  if (hasBook(P, id)) return "完本已得 · 到洞府仓库参悟";
  if (s.have >= s.pages) return `残页 ${s.pages}/${s.pages} · 已集齐 · 到洞府仓库参悟`;
  return `残页 ${have}/${s.pages} · 集齐后到洞府仓库参悟${s.fill ? ` · 悟性可补 ${s.fill} 页` : ""}`;
}
export function dotsHTML(P, id) {
  const s = gongfaSource(P, id);
  if (s.kind !== "pages" || s.learned) return "";
  const have = Math.min(s.have, s.pages);
  let h = "";
  for (let i = 0; i < s.pages; i++) h += `<i class="${i < have ? "on" : i < have + s.fill ? "wx" : ""}"></i>`;
  return `<span class="gfh-pg ${have >= s.pages ? "full" : ""}">${h}</span>`;
}
const tierHTML = (t) => (t ? `<span class="gfh-t ${TIER_CLS[t] || ""}">${t}</span>` : "");
function srcIco(s) {
  // 地图小图集里的同款图标（残碑、赠予没有图标，用一个字的小圆印）
  const k = SRC_ICO[s.src];
  if (!k) return `<i class="gfh-mi g">${s.src === "stele" ? "碑" : s.how === "grant" || s.how === "fallback" ? "赠" : "得"}</i>`;
  return `<i class="gfh-mi" style='${mapIconStyle(k)}'></i>`;
}
// 本去处的来源排前面，其余去处其次，赠予最后；最多 n 条
function srcList(id, region, n = 3) {
  const L = gongfaSources(id);
  const rank = (s) => (s.region === region ? 0 : s.region ? 1 : 2);
  return L.slice().sort((a, b) => rank(a) - rank(b) || b.chance - a.chance).slice(0, n);
}
function tokEl(id, rub) {
  const d = SPELLS[id], el = d && EL[d.element];
  const e = kit.el("div", "mk-ld-tok" + (rub ? " gfh-rub" : ""));
  e.style.cssText = `--tok:40px;--elc:${el ? el.c : "#b8923a"};--elw:${el ? el.w : "transparent"}`;
  const ic = skillIconEl(id);
  if (ic) e.appendChild(ic);
  else e.insertAdjacentHTML("beforeend", `<b>${d ? d.glyph || d.name[0] : ""}</b>`);
  return e;
}

// ---------------- 功法匣（loadout.js 调） ----------------
// 顶部一行：「本去处缺 水（火盾 4 成）→ 2 门可得 · 看 ›」；没缺口：「护盾都克得住 · 顺路可收 N 门 · 看 ›」
export function gapLineEl(P, region, onPick) {
  css();
  const gs = gapGroups(P, region);
  let html, first;
  if (gs.length) {
    const why = gs.map((g) => {
      const s = g.shields.slice().sort((a, b) => b.share - a.share)[0];
      return `<b style="color:${EL[g.need].c};font-weight:400">${EL[g.need].n}</b>（${EL[s.el].n}盾${s.share ? " " + r0(s.share * 10) + " 成" : s.boss ? " · " + s.boss : ""}）`;
    }).join("、");
    const ids = [...new Set(gs.flatMap((g) => g.cands))];
    first = ids[0] || gs.flatMap((g) => g.idle)[0];
    html = `<span class="lb">本去处缺</span><span>${why} → ${ids.length ? ids.length + " 门可得" : "已有功法可换上"}</span><span class="go">看 ›</span>`;
  } else {
    const pk = pickups(P, region);
    if (!pk.length) return null;
    first = pk[0];
    html = `<span class="lb">护盾都克得住</span><span>顺路可收 ${pk.length} 门</span><span class="go">看 ›</span>`;
  }
  const e = kit.el("div", "gfh-line" + (gs.length ? "" : " ok"), html);
  e.dataset.gfline = "1";
  e.addEventListener("click", (ev) => (ev.stopPropagation(), onPick && onPick(first)));
  return e;
}
// 条目右侧：残页点 + x/N（+k = 悟性可补）/ 名门 / 可参悟；补缺口的条目名后挂「补水」
export function rowExtraHTML(P, id, region) {
  css();
  const s = gongfaSource(P, id);
  if (s.learned) return "";
  if (s.kind === "pages") {
    const ready = readyList(P).some((e) => e.teaches === id);
    return `<span class="gfh-rx">${dotsHTML(P, id)}${ready ? `<span class="rd">可参悟</span>` : `<span>${Math.min(s.have, s.pages)}/${s.pages}${s.fill ? ` <span class="mk-gold">+${s.fill}</span>` : ""}</span>`}</span>`;
  }
  if (readyList(P).some((e) => e.teaches === id)) return `<span class="gfh-rx"><span class="rd">可参悟</span></span>`;
  return `<span class="gfh-rx"><span>${s.kind === "fixed" ? "名门 · 一本" : "赠予"}</span></span>`;
}
export function fillTagHTML(P, id, region) {
  const d = SPELLS[id];
  if (!d || !gapGroups(P, region).some((g) => g.cands.includes(id))) return "";
  return `<span class="gfh-fill" style="background:${EL[d.element].c}">补${EL[d.element].n}</span>`;
}
// 悬停卡下半「来源」段
export function tipSrcHTML(P, id, region) {
  css();
  const s = gongfaSource(P, id);
  const rows = srcList(id, region, 3).map((x) => `<div class="r">${srcIco(x)}<span class="w">${x.where}${x.how === "book" ? " · 完本" : x.how === "page" ? " · 残页" : ""}</span><span class="rg ${x.region === region ? "gfh-here" : ""}">${x.region === region ? "本去处" : x.region ? REGION_NAME[x.region] || x.region : ""}</span>${tierHTML(x.tier)}</div>`).join("");
  const pl = s.kind === "pages" ? `<div class="pl">${dotsHTML(P, id)} ${pagesText(P, id)}</div><div class="wx">悟性 ${wuxOf(P)} · 每 ${GONGFA.fillCost} 点补 1 页（至少要有 ${GONGFA.fillMinHave} 页实物）</div>` : s.kind === "fixed" ? `<div class="pl">名门功法 · 一本即成</div>` : "";
  return `<div class="gfh-tsrc"><div class="h">来源</div>${rows}${pl}</div>`;
}

// ---------------- 出行准备（prep.js 调） ----------------
export const createGapState = () => ({ region: null, key: null }); // 每个宿主独有，重建保留、退场丢弃
const mapTagOn = (P) => !(P.flags && P.flags.gongfaMapTag === !1);
export function mountPrepGap(cover, stage, P, region, o = {}) {
  css();
  const gs = gapGroups(P, region);
  const state = o.state || createGapState();
  if (state.region !== region) Object.assign(state, { region, key: null });
  const chips = kit.el("div", "gfh-chips");
  const key = state.key;
  const chip = (k, label, gold) => {
    const c = kit.el("button", "gfh-gap" + (gold ? " gold" : "") + (key === k ? " on" : ""), `${label}<span class="ar">▸</span>`);
    c.type = "button";
    c.setAttribute("aria-expanded", String(key === k));
    c.dataset.gfgap = k;
    c.addEventListener("click", (ev) => (ev.stopPropagation(), (state.key = key === k ? null : k), o.rerender && o.rerender()));
    chips.appendChild(c);
  };
  for (const g of gs) chip(g.need, `缺${EL[g.need].n}`);
  const pk = gs.length ? [] : pickups(P, region);
  if (!gs.length && pk.length) chip("road", `顺路可收 ${pk.length}`, !0);
  if (chips.children.length) cover.appendChild(chips);
  // 卷首：可参悟
  const rd = readyList(P);
  if (rd.length) {
    const e = kit.el("div", "gfh-ready", `<span>参悟 ·</span><b>${rd.map((x) => (SPELLS[x.teaches] || {}).name || x.name).join("、")}</b><span>${rd.length === 1 ? hasBook(P, rd[0].teaches) ? "完本已得" : `残页 ${Math.min(rd[0].have, rd[0].pages)}/${rd[0].pages} · ${rd[0].have >= rd[0].pages ? "已集齐" : `悟性可补 ${rd[0].fill} 页`}` : `${rd.length} 门可参悟`} · 回洞府仓库参悟 ›</span>`);
    e.dataset.gfready = "1";
    e.addEventListener("click", (ev) => (ev.stopPropagation(), o.goCave && o.goCave()));
    stage.appendChild(e);
  }
  if (!key) return;
  const g = gs.find((x) => x.need === key);
  if (key !== "road" && !g) return void (state.key = null);
  stage.appendChild(slipEl(P, region, g, key === "road" ? pk : null, { ...o, state }));
}
function candEl(P, id, region, o) {
  const d = SPELLS[id], s = gongfaSource(P, id);
  const e = kit.el("div", "gfh-cd");
  e.dataset.gfcand = id;
  e.tabIndex = 0;
  e.setAttribute("role", "button");
  e.addEventListener("click", () => o?.onPick?.(id));
  e.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); o?.onPick?.(id); } });
  e.appendChild(tokEl(id, !0));
  let p;
  if (hasBook(P, id)) p = `<span>完本已得 · 到洞府仓库参悟</span>`;
  else if (s.kind === "pages") p = `${dotsHTML(P, id)}<span>残页 ${Math.min(s.have, s.pages)}/${s.pages}${s.fill ? ` · <span class="mk-gold">悟性可补 ${s.fill} 页</span>` : ""}</span>`;
  else if (s.kind === "fixed") p = `<span>名门功法 · 一本即成</span>`;
  else p = `<span>${s.short}</span>`;
  const here = srcList(id, region, 3).filter((x) => x.region === region), far = srcList(id, region, 2).filter((x) => x.region && x.region !== region);
  const w = here.length ? `<span class="gfh-here">本去处</span> · ${here.map((x) => `${x.where} ${tierHTML(x.tier)}`).join(" · ")}` : far.length ? `${REGION_NAME[far[0].region] || far[0].region} · ${far.map((x) => `${x.where} ${tierHTML(x.tier)}`).join(" · ")}` : "";
  e.appendChild(kit.el("div", "", `<div class="n">${d.name}<small>${EL[d.element] ? EL[d.element].n : ""} · ${d.role || ""}</small></div><div class="p">${p}</div><div class="w">${w}</div>`));
  return e;
}
function slipEl(P, region, g, road, o) {
  const slip = kit.panel("", { cls: "gfh-slip", slip: !0 });
  const b = slip.body, root = slip.root;
  root.classList.add("gfh-slip");
  root.dataset.gfslip = g ? g.need : "road";
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  const close = () => ((o.state.key = null), o.rerender && o.rerender());
  const head = (big, color, s) => {
    const h = kit.el("div", "t1", `<span class="big" style="color:${color}">${big}</span><span class="s">${s}</span>`);
    const x = kit.el("span", "x", "×");
    x.addEventListener("click", (ev) => (ev.stopPropagation(), close()));
    h.appendChild(x);
    b.appendChild(h);
  };
  if (!g) {
    head("顺路可收", "var(--mk-gold)", REGION_NAME[region] || region);
    b.appendChild(kit.el("div", "why", "护盾都克得住。这一趟能顺手捡的功法："));
    for (const id of road.slice(0, 4)) b.appendChild(candEl(P, id, region, o));
  } else {
    const info = shieldInfo(region);
    head(`缺${EL[g.need].n}`, EL[g.need].c, `破${g.shields.map((s) => EL[s.el].n).join("、")}盾`);
    b.appendChild(kit.el("div", "why", g.shields.map((s) => `<b style="color:${EL[s.el].c}">${EL[s.el].n}盾</b> ${[s.share ? `精英约 ${r0(s.share * 10)} 成` : "", s.boss || (info.boss && info.boss.els.includes(s.el) ? info.boss.name : "")].filter(Boolean).join(" · ")}`).join("<br>")));
    // 已领悟没带：直接换上
    for (const id of g.idle) {
      const e = kit.el("div", "gfh-cd");
      e.appendChild(tokEl(id, !1));
      const t = kit.el("div", "", `<div class="n">${SPELLS[id].name}<small>已领悟 · 没带</small></div>`);
      t.firstChild.appendChild(kit.button("换上", () => (swapIn(P, region, id), close()), { small: !0 }));
      e.appendChild(t);
      b.appendChild(e);
    }
    for (const id of g.cands) b.appendChild(candEl(P, id, region, o));
    const fu = FU[g.need], nFu = P.storage && P.storage.count ? P.storage.count(fu[0]) : 0;
    b.appendChild(kit.el("div", "ft", `${nFu ? `<div class="fu">本局补救：行囊可带 <b>${fu[1]}</b>（${o.take?.[fu[0]] ? `已带 ${o.take[fu[0]]} 张 · ` : "未带 · "}仓库 ${nFu} 张）</div>` : ""}残页集齐后到洞府仓库参悟 · 悟性 ${wuxOf(P)}（每 ${GONGFA.fillCost} 点补 1 页）`));
  }
  const acts = kit.el("div", "acts");
  const on = mapTagOn(P);
  const t = kit.button(`${on ? "✓ " : ""}舆图上标出`, () => {
    P.flags = P.flags || {};
    P.flags.gongfaMapTag = !on;
    o.save && o.save();
    o.rerender && o.rerender();
  }, { small: !0, id: "gf-maptag" });
  if (on) t.classList.add("on");
  acts.appendChild(t);
  acts.appendChild(kit.button("收起", close, { small: !0 }));
  b.appendChild(acts);
  return root;
}
// 换上：先放空栏，没空栏就替换本去处克不到任何盾的那一个，再不行替换最后一栏
function swapIn(P, region, id) {
  const b = normBuild(P), n = slotCount(P, "spell");
  if (!n) return null;
  let i = b.spells.findIndex((x, k) => !x && k < n);
  if (i < 0) {
    const need = shieldInfo(region).els.map((e) => Object.keys(EL).find((k) => gapCounter(k) === e)).filter(Boolean);
    i = b.spells.findIndex((x, k) => k < n && x && !need.includes((SPELLS[x] || {}).element));
  }
  if (i < 0) i = n - 1;
  place(P, "spell", i, id);
  return i;
}
const BEATS = { metal: "wood", wood: "earth", earth: "water", water: "fire", fire: "metal" };
const gapCounter = (el) => BEATS[el]; // el 行克哪种盾
export const _test = { gapGroups, pickups, readyList, pagesText };
