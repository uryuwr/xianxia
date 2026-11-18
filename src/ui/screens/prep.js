// 出行与内观阁共享整装册：行囊 / 法器 / 功法 / 委托四页签，人物和底栏常驻。
// 版式依据已批准 docs/ui/v2/备战_页签/index.html；行囊九格、法器与功法六项分页。
// 业务仍沿用预案、仓库 Bag、功法装配和启程接取规则；update 不写 DOM。
import { StatSheet } from "../stat_sheet.js";
import { readPlan, writePlan, clampPlan, planTotal } from "../../game/pack_plan.js";
import { mountPrepGap, createGapState } from "../gongfa_hint.js";
import { kit } from "../kit.js";
import { pushEsc } from "../esc.js";
import { REGIONS, INTRO_AT, runIndex } from "../../game/run/regions.js";
import { defOf, valueOf, sizeOf, RARITY } from "../../core/items.js";
import { inkReadable } from "../../fx/rarity_tint.js";
import { realmName, slotOpen, slotLockText } from "../../game/progression.js";
import { SPELLS } from "../../data/skills.js";
import { getQuests, questsReady } from "../../game/flow/quests.js";
import { portrait } from "./result.js";
import { statBreakdown } from "../../game/stat_breakdown.js";
import { LoadoutUI, shieldLines, suggest, applySuggest, emptySlots, normBuild } from "../loadout.js";

// 已批准草图：docs/ui/v2/备战_页签/index.html。列表按页展示，只有完整说明允许滚动。
const CSS = `
.mk-prep { position:absolute;inset:0; }
.mk-prep * { box-sizing:border-box; }
.mk-prep button:focus-visible,.mk-prep [tabindex]:focus-visible,.prep-modal :focus-visible { outline:2px solid var(--zhu);outline-offset:3px; }
.mk-prep .hd { left:38px;right:40px;top:24px;height:58px;display:flex;align-items:center;gap:24px; }
.mk-prep .hd .ink-rule { width:140px; }
.mk-prep .prep-left { left:34px;top:102px;width:318px;height:518px;border-right:1px solid var(--ink-mist); }
.mk-prep .realm { font:23px var(--f-display);letter-spacing:.12em; }
.mk-prep .detail-link { position:absolute;left:0;top:33px;font-size:14px; }
.mk-prep .por { position:absolute;left:76px;top:70px;width:150px;height:235px; }
.mk-prep .por .mk-portrait { width:100%;height:100%; }
.mk-prep .por .mk-portrait img { display:block;width:100%;height:100%;object-fit:contain; }
.mk-prep .who { position:absolute;left:245px;top:90px;writing-mode:vertical-rl;font:26px var(--f-display);letter-spacing:.3em; }
.mk-prep .gearcol { position:absolute;left:2px;top:82px;display:flex;flex-direction:column;gap:18px; }
.mk-prep .gearcol .ink-slot { --z:38px;cursor:pointer; }
.mk-prep .gearcol .ink-slot .cap { font-size:10px;white-space:nowrap; }
.mk-prep .stats { position:absolute;left:0;right:12px;top:315px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font:15px var(--f-kai); }
.mk-prep .ldslots { position:absolute;top:374px;left:0;right:10px; }
.mk-prep .mk-ld-slots { display:grid;grid-template-columns:repeat(4,1fr);gap:7px 0; }
.mk-prep .mk-ld-slots .grp { display:contents; }.mk-prep .mk-ld-slots .sep { display:none; }
.mk-prep .mk-ld-slot { width:68px;gap:0; }.mk-prep .mk-ld-slot .well,.mk-prep .mk-ld-slot .mk-ld-tok { width:34px;height:34px;--tok:34px!important; }
.mk-prep .mk-ld-slot .cap { min-height:15px;font-size:11px;max-width:68px;overflow:hidden;text-overflow:ellipsis; }.mk-prep .mk-ld-slot .k { font-size:10px; }
.mk-prep .work { left:388px;right:38px;top:102px;bottom:100px; }
.mk-prep .prep-tabs { height:46px;display:flex;align-items:flex-start;gap:24px; }
.mk-prep .prep-tabs .ink-btn { font:23px var(--f-display); }.mk-prep .prep-tabs .on { color:var(--zhu); }
.mk-prep .prep-content { height:398px;position:relative; }
.mk-prep .subtabs { display:flex;align-items:center;gap:10px;height:34px;font:13px var(--f-kai); }
.mk-prep .subtabs .ink-btn { font-size:14px; }.mk-prep .subtabs .on { color:var(--zhu); }
.mk-prep .prep-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;height:326px;align-content:start;overflow:visible; }
.mk-prep .pack .prep-grid { grid-template-rows:repeat(3,102px); }
.mk-prep .prep-card { position:relative;min-width:0;padding:12px;background:var(--ink-tex-fiber),rgba(248,245,234,.62);border:1px solid rgba(21,24,27,.1);display:flex;gap:12px;align-items:center; }
.mk-prep .prep-card .ink-slot { --z:44px;flex:none; }.mk-prep .prep-card .ink-slot .cap { display:none; }
.mk-prep .prep-card .card-text { min-width:0;flex:1;font:12px/1.5 var(--f-kai); }.mk-prep .prep-card .card-text b { display:block;font:18px var(--f-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.mk-prep .prep-card .pm { display:flex;gap:5px;align-items:center; }.mk-prep .prep-card .ink-btn { font-size:14px;padding:0 6px 3px; }
.mk-prep .gear-page .prep-grid { grid-template-rows:repeat(2,158px); }.mk-prep .gear-page .prep-card { flex-wrap:wrap;align-content:center; }
.mk-prep .gear-page .gear-actions { width:100%;display:flex;justify-content:flex-end;gap:10px; }
.mk-prep .pager,.mk-prep .ld-pager { height:34px;display:flex;justify-content:center;align-items:center;gap:20px;font:12px var(--f-ui); }.mk-prep .pager .ink-btn,.mk-prep .ld-pager .ink-btn { font-size:14px; }
.mk-prep .context { position:absolute;left:0;right:0;top:446px;font:12px/1.5 var(--f-kai); }
.mk-prep .context-line { display:flex;gap:14px;align-items:center;min-height:26px; }.mk-prep .context-line .ink-btn { font-size:14px; }
.mk-prep .risk { color:var(--ink-zhong);font:12px var(--f-kai); }.mk-prep .risk.high { color:var(--zhu); }
.mk-prep .cover { display:flex;gap:12px;align-items:center;flex-wrap:wrap; }.mk-prep .cover .ink-btn { font-size:13px; }
.mk-prep .gfh-ready { position:static!important;max-width:none!important;margin:3px 0!important;display:block; }
.mk-prep .gfh-slip { left:472px!important;top:200px!important;width:680px!important;max-height:none!important;overflow:visible!important;z-index:10; }
.mk-prep .gfh-slip .gfh-cd { min-width:0;margin:0;padding:6px; }.mk-prep .gfh-slip .w { font-size:10px; }.mk-prep .gfh-slip .pager { height:28px; }
.mk-prep .footer { left:38px;right:38px;bottom:24px;height:48px;display:flex;align-items:center;gap:24px;border-top:1px solid var(--ink-mist);padding-top:12px; }
.mk-prep .footer .mk-ld-note { flex:1; }.mk-prep .footer .emptynote { font:12px var(--f-kai);color:var(--zhu); }.mk-prep .footer .go { margin-left:auto;min-width:110px; }
.mk-prep .quests .prep-grid { grid-template-rows:326px; }.mk-prep .quests .q { padding:24px 20px;display:flex;flex-direction:column;align-items:flex-start;gap:16px;cursor:pointer;font:15px/1.65 var(--f-kai); }.mk-prep .quests .q.on { border-color:var(--zhu); }.mk-prep .quests h3 { font:25px var(--f-display);margin:0; }.mk-prep .quests .rw { margin-top:auto;color:var(--nijin); }
.mk-prep .mk-ld-box.paged { position:relative;height:398px; }
.mk-prep .mk-ld-box.paged .tabs { height:34px; }
.mk-prep .mk-ld-box.paged .gearline { display:none; }
.mk-prep .mk-ld-box.paged .list { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,102px);gap:10px;height:326px;max-height:none;width:65%;overflow:visible; }
.mk-prep .mk-ld-box.paged .mk-ld-row { border:1px solid var(--ink-mist);padding:10px;align-content:center;flex-wrap:wrap;gap:5px;background:rgba(248,245,234,.6); }
.mk-prep .mk-ld-box.paged .mk-ld-row::before { display:none; }.mk-prep .mk-ld-box.paged .mk-ld-row .n { font-size:17px; }.mk-prep .mk-ld-box.paged .mk-ld-row .at { position:absolute;right:8px;top:4px; }
.mk-prep .mk-ld-box.paged .mk-ld-row .gfh-row-extra { font-size:10px; }.mk-prep .mk-ld-box.paged .mk-ld-row .mk-ld-tok { --tok:34px!important; }
.mk-prep .mk-ld-box.paged .ld-pager { width:65%; }.mk-prep .mk-ld-box.paged .mk-ld-help { display:none; }
.mk-prep .ld-detail { position:absolute;right:0;top:34px;width:32%;height:326px;border-left:1px solid var(--ink-mist);padding-left:18px;font:12px/1.5 var(--f-kai); }
.mk-prep .ld-detail h3 { font:25px var(--f-display);margin:0 0 10px; }.mk-prep .ld-detail-summary { height:225px;overflow:hidden;mask-image:linear-gradient(#000 92%,transparent); }.mk-prep .ld-detail-summary > .h { display:none; }.mk-prep .ld-detail-summary p { margin:5px 0; }.mk-prep .ld-detail-summary .kv { display:grid;grid-template-columns:repeat(4,1fr);gap:4px; }.mk-prep .ld-detail .ink-btn { font-size:13px; }
.prep-modal { position:absolute;inset:0;z-index:20;background:rgba(25,28,24,.45);color:var(--ink); }
.prep-modal .modal-paper { left:270px;top:90px;width:740px;height:540px;background:var(--ink-tex-paper),var(--paper-hi);padding:28px;box-shadow:0 12px 35px #0003; }
.prep-modal h2 { font:28px var(--f-display);margin:0 0 18px; }.prep-modal .modal-close { position:absolute;right:26px;top:24px;font-size:16px; }
.prep-modal .reader { position:absolute;left:28px;right:84px;top:90px;bottom:34px;overflow:auto;scrollbar-width:none;font:16px/1.9 var(--f-kai); }.prep-modal .reader::-webkit-scrollbar { display:none; }
.prep-modal .ink-scroll { position:absolute;right:30px;top:94px;bottom:34px;display:flex;flex-direction:column;align-items:center;width:34px; }.prep-modal .ink-scroll button { border:0;background:none;font:18px var(--f-kai);cursor:pointer; }.prep-modal input[type=range] { writing-mode:vertical-lr;direction:ltr;flex:1;min-height:0;width:20px;appearance:none;background:linear-gradient(90deg,transparent 8px,var(--ink-mist) 8px,var(--ink-mist) 11px,transparent 11px); }
.prep-modal input[type=range]::-webkit-slider-thumb { appearance:none;width:24px;height:34px;border-radius:6px 4px 7px 3px;background:var(--ink-nong);border:3px solid var(--ink-zhong);box-shadow:2px 3px 0 #0002; }.prep-modal input[type=range]::-moz-range-thumb { width:20px;height:30px;background:var(--ink-nong);border:3px solid var(--ink-zhong); }
.prep-modal.stats-modal .modal-paper { top:42px;height:636px; }.prep-modal.stats-modal .mk-ss { position:absolute;left:18px;top:68px;width:338px;padding:10px 12px; }.prep-modal.stats-modal .mk-ss-pop { width:310px; }.prep-modal.stats-modal .mk-ss .bar { display:none; }
`;

const PILLS = ["huichun_dan", "huiqi_dan"]; // 丹药囊能带的（对应快捷栏 2 / 1）
const ELEMENT_FU = ["fu_metal", "fu_wood", "fu_water", "fu_fire", "fu_earth"]; // 五行符（局内 3 使用、4 换）
// 出发前服用的丹药（不占丹药栏）：入图时服下，效果持续本局——凝神丹（神识，搜取模块读）、护脉丹（受伤减免，run.js 读）
const PRE_RUN = (Object.values(import.meta.glob("../../data/recipes.js", { eager: !0 }))[0] || {}).PILL_RULES?.preRun || ["humai_dan", "ningshen_dan"];

export function prepScene(flow) { return makePrep(flow.ctx, { flow }); }
export function makePrep(ctx, o = {}) {
  const flow = o.flow || ctx.flow, inner = !!o.inner, layer = inner ? "inner" : "prep";
  let L, st, active = false, generation = 0;
  const gapState = createGapState();
  const S = {
    live: !1,
    hud: !1,
    async enter() {
      const gen = ++generation;
      active = true;
      await questsReady;
      if (!active || gen !== generation) return;
      kit.css("prep", CSS);
      if (!inner) flow.backdrop("menu");
      L = kit.layer(layer, 42);
      kit.show(layer, !0);
      S.departing = false;
      S.tab = o.tab ? "gongfa" : "pack";
      S.pages = { pack: 0, gear: 0, quests: 0, gap: 0 }; S.packSub = "all"; S.gearSlot = "sword"; S.savedPlan = null; S.savedBuild = null; S.renderKey = null;
      gapState.key = null;
      const P = flow.profile;
      // take[id] = 这一种带几枚（各品级合计，丹药囊"每种 N 枚"按种类算，与局内 stowConsumable / potionSlot 一致）；q[id] = { 品级: 枚数 }
      st = { region: (P.flags.lastRegion || (P.cave && P.cave.region)) === "r2" && S.unlocked("r2") ? "r2" : "r1", take: {}, q: {}, quests: [], offers: null };
      // 默认带上能带的丹药与遁地符（先带低品）
      const no = runIndex(P);
      const saved = readPlan(P);
      if (saved === null && no >= INTRO_AT.pills) for (const id of PILLS) S.setTotal(id, Math.min(S.pillCap(), P.storage.count(id)));
      S.trimPills();
      if (saved === null && no >= INTRO_AT.talisman) S.setTotal("dundi_fu", Math.min(1, P.storage.count("dundi_fu")));
      if (saved !== null) st.q = clampPlan(saved, (id) => S.qualities(id));
      S.normalizePlan();
      const Q = no >= INTRO_AT.quests ? getQuests(ctx) : null;
      if (Q && Q.offers) {
        try {
          st.offers = Q.offers(P) || [];
        } catch (e) {
          console.error("[prep] 委托 offers 失败", e);
        }
      }
      normBuild(P);
      S.lo = new LoadoutUI(ctx, P, {
        region: st.region, tab: o.tab, paged: true, active: S.tab === "gongfa",
        onChange: () => { flow.save(); S.render(); },
        onReveal: () => S.setTab("gongfa"),
        onRead: (title, html) => S.read(title, html),
      });
      S.render();
      S.offEsc = pushEsc(() => {
        if (S.lo?.escape()) return;
        if (gapState.key) { gapState.key = null; S.render(); return; }
        S.back();
      }, { el: L });
    },
    exit() {
      ++generation;
      const wasActive = active;
      if (active && st) S.savePlan();
      active = false;
      S.closeModal?.();
      S.offEsc?.(); S.offEsc = null;
      S.lo?.dispose(); S.lo = null;
      kit.clear(layer); kit.show(layer, false);
      if (wasActive) ctx.applyProfileStats?.(flow.profile);
      S.renderKey = null;
    },
    back() { inner ? o.onClose?.() : flow.go("cave", { from: "prep" }); },
    setTab(tab) {
      if (!active || S.tab === tab) return;
      S.tab = tab;
      gapState.key = null;
      S.render();
    },
    update(dt, raw) {
      flow.driftCamera(raw);
    },
    unlocked(id) {
      const P = flow.profile;
      if (id !== "r2") return !0;
      const r = P.realm;
      return !!(P.flags.unlockAll || P.flags.r2Unlocked || P.flags.boss_qingya || r.stage >= 2 || (r.stage === 1 && r.layer >= 5));
    },
    pillCap() {
      return (flow.profile.cave && flow.profile.cave.pillCap) || 3;
    },
    // 丹药囊：种类数不超过 pillSlots
    trimPills() {
      const slots = flow.profile.unlocks.pillSlots || 1;
      let kinds = 0;
      for (const id of PILLS) if (st.take[id] > 0 && ++kinds > slots) S.setTotal(id, 0);
    },
    // 仓库里这一种按品级分开：[[品级, 枚数]]，低品在前
    qualities(id) {
      const m = new Map();
      for (const it of flow.profile.storage.items) if (it.id === id) m.set(it.rarity || 0, (m.get(it.rarity || 0) || 0) + (it.n || 1));
      return [...m].sort((a, b) => a[0] - b[0]);
    },
    // 这一种一共带 total 枚：从低品往上取（与局内"先吃低品"一致，好的留在仓库）
    setTotal(id, total) {
      const q = {};
      let left = total;
      for (const [r, have] of S.qualities(id)) {
        const k = Math.min(left, have);
        if (k > 0) (q[r] = k), (left -= k);
      }
      st.q[id] = q;
      st.take[id] = total - left;
    },
    setQ(id, r, n) {
      const q = (st.q[id] = { ...(st.q[id] || {}) });
      if (n > 0) q[r] = n;
      else delete q[r];
      st.take[id] = Object.values(q).reduce((a, b) => a + b, 0);
    },
    savePlan() {
      if (!st) return;
      const key = JSON.stringify(st.q);
      if (key === S.savedPlan) return;
      S.savedPlan = key;
      writePlan(flow.profile, st.q);
      flow.save();
    },
    normalizePlan() {
      const P = flow.profile, no = runIndex(P), q = clampPlan(st.q, (id) => S.qualities(id));
      st.q = {}; st.take = {};
      const limits = {};
      if (no >= INTRO_AT.pills) for (const id of PILLS) limits[id] = S.pillCap();
      for (const id of PRE_RUN) limits[id] = 1;
      if (no >= INTRO_AT.talisman) for (const id of ["dundi_fu", "huqi_fu", ...ELEMENT_FU]) limits[id] = 3;
      for (const [id, m] of Object.entries(q)) {
        let left = limits[id] || 0;
        for (const r of Object.keys(m).map(Number).sort((a,b) => a-b)) {
          const n = Math.min(left, m[r]);
          if (n > 0) (st.q[id] ||= {})[r] = n, left -= n;
        }
        st.take[id] = planTotal(st.q[id]);
      }
      S.trimPills();
    },
    render() {
      if (!active || !st) return;
      S.normalizePlan(); S.savePlan();
      const P = flow.profile, no = runIndex(P), R = REGIONS[st.region];
      const buildKey = JSON.stringify(P.build);
      if (S.savedBuild !== null && S.savedBuild !== buildKey) flow.save();
      S.savedBuild = buildKey;
      // 只对数据或 UI 状态变化写 DOM；update 不渲染、不存档。
      const key = JSON.stringify([S.tab, S.packSub, S.gearSlot, S.pages, st, P.equip, P.build, P.storage.items, P.pouch.items, P.realm, P.unlocks, P.flags.learned, P.flags.gongfaMapTag, gapState.key]);
      if (key === S.renderKey) return;
      S.renderKey = key;
      const focus = document.activeElement;
      const focusedItem = focus?.closest?.("[data-item][data-q]");
      const restore = focusedItem && { id: focusedItem.dataset.item, q: focusedItem.dataset.q, action: focus.dataset.action };
      const root = kit.el("div", "mk-prep mk-paperbg" + (inner ? " mk-inner" : ""));
      root.addEventListener("mousedown", e => e.stopPropagation());
      const stage = kit.el("div", "mk-stage"); root.appendChild(stage);
      const add = (host, cls, html = "") => { const el = kit.el("div", cls, html); host.appendChild(el); return el; };
      add(stage, "hd", `<span class="ink-title l">${inner ? "内观阁" : "出行"}</span><span class="ink-rule"></span><span class="ink-note">整装册 · ${inner ? "调息整装，行囊只作预案" : `第 ${no} 局 · 量力而归`}</span>`);
      const left = add(stage, "prep-left");
      add(left, "realm", `林墨 · ${realmName(P)}`);
      const attr = kit.button("全部属性与来源", () => S.openStats(), { small: true, id: "prep-stats" }); attr.classList.add("detail-link"); left.appendChild(attr);
      add(left, "por").appendChild(portrait()); add(left, "who", "修身养性");
      const gear = add(left, "gearcol");
      for (const [slot, name] of [["sword", "法剑"], ["robe", "法衣"], ["jade", "玉佩"], ["artifact", "法宝 V"]]) {
        const it = P.equip[slot], open = slotOpen(P, slot);
        const cell = kit.itemCell(it || null, { cap: name, onClick: () => S.pickGear(slot) });
        cell.dataset.slot = slot; cell.tabIndex = 0; cell.setAttribute("role", "button");
        if (!it) { cell.innerHTML = `<b>${open ? name[1] : "锁"}</b><span class="cap">${name}</span>`; cell.addEventListener("click", () => S.pickGear(slot)); }
        cell.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cell.click(); } });
        gear.appendChild(cell);
      }
      const D = statBreakdown(P, { plan: st.q, mode: "run" });
      add(left, "stats", [["hp", "气血"], ["mp", "真气"], ["atk", "攻击"], ["spell", "法力"]].map(([k,n]) => `<span>${n} <b>${Math.round(D[k]?.final || 0)}</b></span>`).join(""));
      if (S.lo.region !== st.region) S.lo.setRegion(st.region);
      S.lo.setActive(S.tab === "gongfa"); S.lo.render();
      add(left, "ldslots").appendChild(S.lo.slotsEl);
      const work = add(stage, "work"), tabs = add(work, "prep-tabs"); tabs.setAttribute("role", "tablist");
      for (const [tab, name] of [["pack", "行囊"], ["gear", "法器"], ["gongfa", "功法"], ["quests", "委托"]]) {
        const b = kit.button(name, () => S.setTab(tab), { small: true });
        b.dataset.prepTab = tab; b.classList.toggle("on", tab === S.tab); b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(tab === S.tab)); tabs.appendChild(b);
      }
      const content = add(work, "prep-content"); content.dataset.prepPage = S.tab;
      if (S.tab === "pack") S.renderPack(content);
      else if (S.tab === "gear") S.renderGear(content);
      else if (S.tab === "gongfa") content.appendChild(S.lo.boxEl);
      else S.renderQuests(content);
      const context = add(work, "context"), line = add(context, "context-line");
      if (!inner) for (const id of ["r1", "r2"]) {
        if (!S.unlocked(id) && no < INTRO_AT.r2) continue;
        const b = kit.button(REGIONS[id].name, () => { st.region = id; S.render(); }, { small: true, disabled: !S.unlocked(id) });
        b.dataset.region = id; b.classList.toggle("on", st.region === id); line.appendChild(b);
      }
      if (!inner) line.appendChild(kit.button("去处情报", () => {
        const sl = shieldLines(P, st.region), prot = S.protectList();
        S.read(R.name, `<p>${R.riskText}；贴身锦囊与关键物品不失。</p><p>护盾：${sl.shield}</p><p>已带：${sl.have}</p>${prot.length ? `<p>护器符护住：${prot.map(g => defOf(g)?.name || g.id).join("、")}</p>` : ""}`);
      }, { small: true, id: "prep-region-info" }));
      add(line, "risk " + (!inner && R.risk === "high" ? "high" : ""), inner ? "预案不扣仓库；出行台启程时按品级取用。" : R.riskText);
      const cover = add(context, "cover");
      const sl = shieldLines(P, st.region), sg = suggest(P, st.region);
      add(cover, "", `已带 · ${sl.have}`);
      if (sg) cover.appendChild(kit.button(`换上${SPELLS[sg.id].name}`, () => { applySuggest(P, st.region); flow.save(); S.render(); }, { small: true, id: "swapin" }));
      mountPrepGap(cover, context, P, st.region, {
        state: gapState, take: st.take, save: () => flow.save(), rerender: () => S.render(),
        goCave: () => inner ? o.onStudy?.() : flow.go("cave", { from: "prep", station: "storage", tab: "scroll" }),
        onPick: id => { gapState.key = null; S.setTab("gongfa"); S.lo.pinSource(id); },
      });
      // 缺口签挂到 stage，避免相对 context 偏出屏幕；候选数固定，不作库存列表。
      const slip = context.querySelector(".gfh-slip");
      if (slip) {
        stage.appendChild(slip);
        const candidates = [...slip.querySelectorAll(".gfh-cd")], body = slip.querySelector(".mk-body"), grid = kit.el("div", "gap-grid");
        grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px";
        const page = S.pager(body, "gap", candidates.length, 4);
        const before = body.querySelector(".ft") || body.lastElementChild;
        body.insertBefore(grid, before);
        candidates.forEach((e, i) => { e.remove(); if (i >= page * 4 && i < page * 4 + 4) grid.appendChild(e); });
        const x = slip.querySelector(".x"); if (x) { x.tabIndex = 0; x.setAttribute("role", "button"); x.setAttribute("aria-label", "收起来源签"); x.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); x.click(); } }; }
      }
      const ready = context.querySelector("[data-gfready]");
      if (ready) { ready.tabIndex = 0; ready.setAttribute("role", "button"); ready.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ready.click(); } }; }
      const footer = add(stage, "footer");
      footer.appendChild(kit.button("回洞府", () => S.back(), { id: "back", key: "Esc" }));
      footer.appendChild(S.lo.noteEl);
      const empty = emptySlots(P); add(footer, "emptynote", empty.length ? `${empty.join("、")} 栏尚空` : "整装就绪");
      const go = kit.button(inner ? "前往出行台" : "启程", () => inner ? o.onDepart?.() : S.depart(), { primary: true, id: "depart" }); go.classList.add("go"); footer.appendChild(go);
      S.root?.remove(); S.root = root; L.appendChild(root);
      if (S.closeModal) root.inert = true;
      if (restore?.action) root.querySelector(`[data-item="${restore.id}"][data-q="${restore.q}"] [data-action="${restore.action}"]`)?.focus();
    },
    pager(host, key, total, size) {
      const pages = Math.max(1, Math.ceil(total / size));
      const page = S.pages[key] = Math.max(0, Math.min(S.pages[key] || 0, pages - 1));
      const box = kit.el("div", "pager"); box.dataset.pager = key;
      box.append(kit.button("上一页", () => { S.pages[key]--; S.render(); }, { small: true, disabled: page === 0, id: key + "-prev" }),
        kit.el("span", "", `${page + 1} / ${pages} · 共 ${total} 项`),
        kit.button("下一页", () => { S.pages[key]++; S.render(); }, { small: true, disabled: page + 1 === pages, id: key + "-next" }));
      host.appendChild(box); return page;
    },
    renderPack(host) {
      const P = flow.profile, no = runIndex(P);
      host.classList.add("pack");
      const tabs = kit.el("div", "subtabs");
      for (const [id, name] of [["all","全部"],["pill","丹药"],["fu","符箓"],["pre","出发前服用"],["pouch","贴身锦囊"]]) {
        const b = kit.button(name, () => { S.packSub = id; S.render(); }, { small: true }); b.dataset.packFilter = id; b.classList.toggle("on", id === S.packSub); tabs.appendChild(b);
      }
      host.appendChild(tabs);
      const all = [];
      const put = (id, max, pill, cat) => { for (const [r,have] of S.qualities(id).length ? S.qualities(id) : [[0,0]]) all.push({ id,r,have,max,pill,cat }); };
      if (no >= INTRO_AT.pills) for (const id of PILLS) put(id, S.pillCap(), true, "pill");
      for (const id of PRE_RUN) if (P.storage.count(id)) put(id, 1, false, "pre");
      if (no >= INTRO_AT.talisman) {
        put("dundi_fu",3,false,"fu");
        if ((inner || st.region === "r2") && P.storage.count("huqi_fu")) put("huqi_fu",3,false,"fu");
        for (const id of ELEMENT_FU) if (P.storage.count(id)) put(id,3,false,"fu");
      }
      if (no >= INTRO_AT.pouch || P.pouch.items.length) {
        for (const it of P.pouch.items) all.push({ cat:"pouch",it });
        all.push({ cat:"pouch",add:true });
      }
      const list = all.filter(e => S.packSub === "all" || e.cat === S.packSub), grid = kit.el("div", "prep-grid slots"); host.appendChild(grid);
      const page = S.pager(host, "pack", list.length, 9);
      for (const e of list.slice(page * 9, page * 9 + 9)) {
        if (e.cat !== "pouch") { S.counter(grid, e.id, e.max, e.pill, e.r); continue; }
        const card = kit.el("div", "prep-card"), d = e.it && defOf(e.it);
        if (e.it) card.appendChild(kit.itemCell(e.it));
        const text = kit.el("div", "card-text", e.it ? `<b>${d?.name || e.it.id}</b>锦囊 · ${RARITY[e.it.rarity || 0].name} ×${e.it.n}` : `<b>贴身锦囊</b>${P.pouch.used} / ${P.pouch.capacity} 格 · 身陨不失`);
        text.appendChild(kit.button(e.it ? "收回仓库" : "从仓库放入", () => e.it ? S.pouchMove(e.it.uid, true) : S.pickPouch(), { small: true, id: e.it ? "pouch-return" : "pouch" }));
        card.appendChild(text); grid.appendChild(card);
      }
      if (!list.length) grid.appendChild(kit.el("p", "mk-tip", "暂无此类物品。行囊只作预案，不会提前扣仓库。"));
    },
    renderGear(host) {
      const P = flow.profile; host.classList.add("gear-page");
      const tabs = kit.el("div", "subtabs");
      for (const [id,name] of [["sword","法剑"],["robe","法衣"],["jade","玉佩"],["artifact","法宝 V"]]) {
        const b = kit.button(name, () => { S.gearSlot = id; S.render(); }, { small:true }); b.dataset.gearSlot = id; b.classList.toggle("on", id === S.gearSlot); tabs.appendChild(b);
      }
      const slot = S.gearSlot, cur = P.equip[slot], open = slotOpen(P,slot);
      if (cur) tabs.appendChild(kit.button("卸下当前", () => S.equip(slot, null), { small:true,id:"gear-off" }));
      host.appendChild(tabs);
      const list = S.gearIn(slot).sort((a,b) => valueOf(b)-valueOf(a));
      if (cur) list.unshift(cur);
      const grid = kit.el("div", "prep-grid"); host.appendChild(grid);
      const page = S.pager(host,"gear",list.length,6);
      if (!open) grid.appendChild(kit.el("p","mk-tip",slotLockText(slot)));
      else for (const it of list.slice(page*6,page*6+6)) {
        const d = defOf(it) || {}, card = kit.el("div","prep-card"); card.dataset.gearUid = it.uid;
        card.appendChild(kit.itemCell(it));
        card.appendChild(kit.el("div","card-text",`<b>${d.name || it.id}</b><span style="color:${inkReadable(it.rarity || 0)}">${RARITY[it.rarity || 0].name}</span>${it.identified === false ? " · 未鉴定" : ""}${cur === it ? " · 已佩戴" : ""}${it.bound ? " · 认主" : ""}${P.nativeArtifact === it.uid ? " · 本命" : ""}`));
        const acts = kit.el("div","gear-actions");
        acts.appendChild(kit.button(cur === it ? "卸下" : "佩戴", () => S.equip(slot,cur === it ? null : it.uid), { small:true,id:"gear-equip" }));
        acts.appendChild(kit.button("详情", () => S.read(d.name || it.id, `<p>${d.desc || ""}</p><p>${RARITY[it.rarity || 0].name} · ${it.bound ? "已认主" : "未认主"}</p>`), {small:true}));
        card.appendChild(acts); grid.appendChild(card);
      }
      if (open && !list.length) grid.appendChild(kit.el("p","mk-tip","仓库尚无此类法器。"));
    },
    renderQuests(host) {
      host.classList.add("quests");
      host.appendChild(kit.el("div","subtabs", inner ? "委托预览 · 到出行台选择，启程时才接取" : "选 1–2 个 · 启程时才接取，不选也可出发"));
      const grid = kit.el("div","prep-grid"); host.appendChild(grid);
      const list = st.offers || [], page = S.pager(host,"quests",list.length,3);
      for (const q of list.slice(page*3,page*3+3)) {
        const id = q.id || q.name, row = kit.el("button","prep-card q" + (st.quests.includes(id) ? " on" : ""), `<h3>${q.name || q.title || id}</h3><span>${q.text || q.desc || ""}</span><span class="rw">${typeof q.reward === "string" ? q.reward : q.rewardText || ""}</span><small>${inner ? "仅预览" : st.quests.includes(id) ? "已选" : "待选"}</small>`);
        row.dataset.quest = id; row.disabled = inner; row.setAttribute("aria-pressed",String(st.quests.includes(id)));
        row.addEventListener("click", () => { const i = st.quests.indexOf(id); if (i >= 0) st.quests.splice(i,1); else if (st.quests.length < 2) st.quests.push(id); else return S.say("最多接 2 个委托","warn"); S.render(); });
        grid.appendChild(row);
      }
      if (!list.length) grid.appendChild(kit.el("p","mk-tip","暂无可接取的委托。"));
    },
    // 行囊一格一个品级：同一种有几个品级就出几格（回春丹·凡 / 回春丹·灵），每格圆相按 RARITY 着色；max = 这一种各品级合计的上限
    counter(box, id, max, pill, onlyR) {
      const d = defOf({ id }) || { name: id };
      const qs = S.qualities(id), many = qs.length > 1;
      for (const [r, have] of qs.length ? qs : [[0, 0]]) {
        if (onlyR != null && r !== onlyR) continue;
        const k = (st.q[id] || {})[r] || 0, total = st.take[id] || 0;
        const w = kit.el("div", "prep-card it" + (many ? " mq" : ""));
        w.dataset.item = id;
        w.dataset.q = r;
        const cap = many ? `${d.name}<br><b style="font-weight:400;color:${inkReadable(r)}">${RARITY[r].name[0]}</b> ${k}/${have}` : `${d.name} ${k}/${have}`;
        const cell = kit.itemCell({ uid: `take_${id}_${r}`, id, n: k, rarity: r, identified: !0, affixes: [] }, { cap });
        if (!k) cell.classList.add("is-empty");
        w.appendChild(cell);
        const text = kit.el("div", "card-text", `<b>${d.name}</b><span style="color:${inkReadable(r)}">${RARITY[r].name}</span> · 带 ${k} / 有 ${have}`);
        w.appendChild(text);
        const pm = kit.el("div", "pm");
        pm.appendChild(kit.button("－", () => (S.setQ(id, r, k - 1), S.render()), { small: !0, disabled: k <= 0 }));
        pm.appendChild(
          kit.button("＋", () => {
            if (total >= max) return S.say(`${d.name}每种最多带 ${max} 枚（各品级合计）`, "warn");
            if (pill && !(total > 0)) {
              const slots = flow.profile.unlocks.pillSlots || 1;
              if (PILLS.filter((x) => st.take[x] > 0).length >= slots) return S.say(`丹药囊只能装 ${slots} 种`, "warn");
            }
            S.setQ(id, r, k + 1);
            S.render();
          }, { small: !0, disabled: k >= have || (!many && total >= max) }),
        );
        pm.children[0].dataset.action = "minus"; pm.children[1].dataset.action = "plus";
        text.appendChild(pm);
        box.appendChild(w);
      }
    },
    gearIn(slot) {
      return flow.profile.storage.items.filter((it) => (defOf(it) || {}).slot === slot);
    },
    pickGear(slot) {
      if (!slotOpen(flow.profile,slot)) return S.say(slotLockText(slot),"warn");
      S.gearSlot = slot; S.pages.gear = 0;
      if (S.tab !== "gear") S.setTab("gear"); else S.render();
    },
    equip(slot, uid) {
      if (!active || !slotOpen(flow.profile,slot)) return;
      const P = flow.profile, cur = P.equip[slot], it = uid && S.gearIn(slot).find(e => e.uid === uid);
      if (uid && !it) return;
      const part = it && P.storage.remove(it.uid);
      if (cur && !P.storage.add(cur)) { if (part) P.storage.add(part); return S.say("仓库放不下卸下的法器","warn"); }
      P.equip[slot] = part || null;
      flow.save(); S.render();
    },
    pouchMove(uid, back = false) {
      if (!active) return false;
      const P = flow.profile, from = back ? P.pouch : P.storage, to = back ? P.storage : P.pouch;
      const it = from.items.find(e => e.uid === uid); if (!it) return false;
      const part = from.remove(uid, !back && it.n > 1 ? 1 : undefined);
      if (!to.add(part)) { from.add(part); S.say(back ? "仓库空间不足" : "锦囊放不下此物","warn"); return false; }
      flow.save(); S.render(); return true;
    },
    pickPouch(page = 0) {
      if (!active) return;
      const P = flow.profile, list = P.storage.items.filter(it => sizeOf(it) <= P.pouch.maxItemSize).sort((a,b) => valueOf(b) / b.n - valueOf(a) / a.n);
      const max = Math.max(1,Math.ceil(list.length/6)); page = Math.min(page,max-1);
      const m = S.modal("贴身锦囊 · 放入一件");
      const grid = kit.el("div","pouch-choices"); grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px";
      for (const it of list.slice(page*6,page*6+6)) {
        const b = kit.button(`${RARITY[it.rarity || 0].name} · ${defOf(it)?.name || it.id} ×1`, () => { if (S.pouchMove(it.uid)) m.close(); }, {small:true}); b.dataset.pouchUid = it.uid; grid.appendChild(b);
      }
      if (!list.length) grid.appendChild(kit.el("p","","仓库里没有可放入锦囊的小件。"));
      m.body.appendChild(grid);
      const pager = kit.el("div","pager"); pager.style.cssText = "display:flex;gap:30px;margin-top:40px";
      pager.append(kit.button("上一页",()=>S.pickPouch(page-1),{small:true,disabled:page===0,id:"pouch-prev"}),kit.el("span","",`${page+1} / ${max} · 共 ${list.length} 件`),kit.button("下一页",()=>S.pickPouch(page+1),{small:true,disabled:page+1===max,id:"pouch-next"})); m.body.appendChild(pager);
    },
    modal(title, cls = "", onClose) {
      S.closeModal?.();
      const previous = document.activeElement, root = kit.el("div","prep-modal " + cls), stage = kit.el("div","mk-stage"), body = kit.el("div","modal-paper");
      root.setAttribute("role","dialog"); root.setAttribute("aria-modal","true"); root.setAttribute("aria-label",title);
      body.appendChild(kit.el("h2","",title)); stage.appendChild(body); root.appendChild(stage); L.appendChild(root);
      S.root.inert = true; S.lo.setActive(false);
      let closed = false;
      const close = () => { if (closed) return; closed = true; off(); root.remove(); if (S.closeModal === close) S.closeModal = null; S.ss?.dispose(); S.ss = null; if (S.root) S.root.inert = false; S.lo?.setActive(active && S.tab === "gongfa"); onClose?.(); if (previous?.isConnected) previous.focus(); };
      const off = pushEsc(close,{el:root}); S.closeModal = close;
      const button = kit.button("收起 Esc",close,{small:true,id:"prep-modal-close"}); button.classList.add("modal-close"); body.appendChild(button); button.focus();
      root.addEventListener("mousedown",e=>e.stopPropagation());
      root.addEventListener("keydown",e=>{ if (e.key !== "Tab") return; const nodes = [...root.querySelectorAll('button:not([disabled]),input,[tabindex="0"],a[tabindex]')].filter(n=>!n.classList.contains("is-disabled")); const i=nodes.indexOf(document.activeElement), next=e.shiftKey ? (i-1+nodes.length)%nodes.length : (i+1)%nodes.length; e.preventDefault(); nodes[next]?.focus(); });
      return {root,body,close};
    },
    read(title, html) {
      if (!active) return;
      const m = S.modal(title), reader = kit.el("div","reader",html), controls = kit.el("div","ink-scroll");
      reader.tabIndex = 0; reader.setAttribute("aria-label","完整说明");
      const up = kit.el("button","","上"), range = document.createElement("input"), down = kit.el("button","","下");
      range.type="range"; range.min="0";range.max="1000";range.value="0";range.setAttribute("aria-label","砚台卷轴位置");
      const scroll = delta => { reader.scrollTop += delta; };
      up.onclick=()=>scroll(-100); down.onclick=()=>scroll(100);
      range.addEventListener("input",()=>reader.scrollTop=(reader.scrollHeight-reader.clientHeight)*Number(range.value)/1000);
      reader.addEventListener("scroll",()=>{ const v=String(Math.round(reader.scrollTop/Math.max(1,reader.scrollHeight-reader.clientHeight)*1000)); if(range.value!==v) range.value=v; },{passive:true});
      const key = e => { const d={ArrowUp:-40,ArrowDown:40,PageUp:-reader.clientHeight*.8,PageDown:reader.clientHeight*.8}; if(e.key in d) scroll(d[e.key]); else if(e.key==="Home")reader.scrollTop=0;else if(e.key==="End")reader.scrollTop=reader.scrollHeight;else return;e.preventDefault();e.stopPropagation(); };
      reader.addEventListener("keydown",key);range.addEventListener("keydown",key);
      controls.append(up,range,down);m.body.append(reader,controls);
    },
    openStats(stat) {
      if (!active) return;
      const m = S.modal("属性与来源","stats-modal");
      S.ss = new StatSheet(flow.profile,{plan:()=>st.q});
      m.body.appendChild(S.ss.el); S.ss.render();
      if (stat) { S.ss.sel = stat; S.ss.render(); }
    },
    confirmRisk(text) {
      return new Promise(resolve => {
        const m = S.modal("高风险区域","",()=>resolve(false));
        m.body.appendChild(kit.el("p","",text));
        m.body.appendChild(kit.button("我已知晓，启程",()=>{resolve(true);m.close();},{primary:true,id:"prep-risk-confirm"}));
      });
    },
    // 护器符：每张护住一件（按灵值从高到低）未认主的装备
    protectList() {
      const P = flow.profile, n = st.region === "r2" ? st.take.huqi_fu || 0 : 0;
      return ["sword", "robe", "jade"].map((s) => P.equip[s]).filter((g) => g && !g.bound && g.uid !== P.nativeArtifact).sort((a, b) => valueOf(b) - valueOf(a)).slice(0, n);
    },
    // 出行准备里的提示：写进"随身功法"那一行的小字条，2.5 秒淡出
    say(msg, kind) {
      if (S.lo) S.lo.say(msg, kind);
      else kit.toast(msg, { kind });
    },
    async depart() {
      if (inner || !active || S.departing) return;
      S.departing = true;
      const gen = generation;
      try {
      S.normalizePlan();
      S.savePlan();
      const P = flow.profile, R = REGIONS[st.region];
      const empty = emptySlots(P);
      if (st.region === "r2" && !P.flags.r2Confirmed) {
        const ok = await S.confirmRisk(`${R.name}：${R.riskText}。<br>认主的法器、本命法宝、贴身锦囊与关键物品不会遗落。`);
        if (!ok || !active || gen !== generation || P !== flow.profile) return;
        P.flags.r2Confirmed = !0;
      }
      const protect = S.protectList().map((g) => g.uid);
      const carried = [];
      // 按玩家选的品级取（低品在前放进 carried：局内同种先用低品）
      for (const [id, n] of Object.entries(st.take)) {
        if (!(n > 0) || (st.region !== "r2" && id === "huqi_fu")) continue;
        const q = st.q[id];
        if (!q) carried.push(...takeFromStorage(P.storage, id, n));
        else for (const r of Object.keys(q).map(Number).sort((a, b) => a - b)) carried.push(...takeFromStorage(P.storage, id, q[r], r));
      }
      P.flags.lastRegion = st.region; // cave.* 归洞府模块，这里只记上次去处
      let quests = !1;
      if (st.quests.length) {
        const Q = getQuests(ctx);
        try {
          Q && Q.accept && Q.accept(st.quests);
          quests = !0;
        } catch (e) {
          console.error("[prep] 委托 accept 失败", e);
        }
      }
      flow.save(); // 出行前保存
      flow.go("run", { region: st.region, carried, protect, quests });
      } finally { if (gen === generation) S.departing = false; }
    },
    get layer() { return L; },
    // 测试用
    get state() {
      return st;
    },
  };
  return S;
}

// 从仓库取出 n 个（可能跨多堆），返回取出的实例；给了 rarity 只取这一品级，否则从低品取起
export function takeFromStorage(bag, id, n, rarity) {
  const out = [];
  for (const it of [...bag.items].sort((a, b) => (a.rarity || 0) - (b.rarity || 0))) {
    if (it.id !== id || n <= 0 || (rarity != null && (it.rarity || 0) !== rarity)) continue;
    const k = Math.min(n, it.n);
    out.push(bag.remove(it.uid, k < it.n ? k : undefined));
    n -= k;
  }
  return out;
}
