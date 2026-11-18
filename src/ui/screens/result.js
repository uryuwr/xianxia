// 结算界面（模块 A）：撤离成功 / 身陨——宣纸手卷（docs/ui/v2/储物袋_v2_落地说明_局外.md §1）。
//   题头：行书大字 + 四字印 + 区域 · 第 N 次出行
//   手卷（两端木轴、上下青绫、卷心宣纸，进入时从中间展开）：
//     段一 · 人：林墨立绘 + 剑 / 衣 / 佩 / 宝四个装备位 + 行囊余下 + 修为条；卷尾（左下）再出行 / 回府朱印
//     段二 · 所得：带回物品按估价排（packBag，6 列；多了横向展开），未鉴定的剪影依次揭晓；身陨时末尾"遗失 N 件"
//     段三 · 账：用时、撤离点、斩妖、灵潮；身陨损失、遗落储物袋、委托；首次所见竹简；机缘刻度
//     卷首（右端引首）：竖排"所得"（身陨"遗失"）+ 带回估价 + 灵石
//   悬停物品签浮出窄纸条；Enter / 朱印 = 回府，R = 再出行。
import { kit } from "../kit.js";
import { setEscIdle } from "../esc.js";
import { PauseMenu } from "./pause.js";
import { RARITY, defOf, valueOf, sizeOf } from "../../core/items.js";
import { realmName, xpNeed } from "../../game/progression.js";
import { LOOT } from "../../game/run/run.js";
import { COPY } from "../copy.js";
import { itemTag, setTagState, tagReveal } from "../icons.js";
import { packBag } from "../bagui.js";

const CSS = `
.mk-result { position: absolute; inset: 0; }
.mk-result .big { left: 64px; top: 22px; font-size: 84px; color: var(--ink); white-space: nowrap; }
.mk-result .big.death { color: var(--zhu); }
.mk-result .seal4 { left: 420px; top: 60px; }
.mk-result .sub { left: 66px; top: 132px; display: flex; gap: 14px; align-items: center; font: 15px var(--f-kai); color: var(--ink-zhong); letter-spacing: .12em; }
.mk-result .sub .ink-rule { width: 90px; }
.mk-result .fortune { left: 960px; top: 120px; width: 240px; }
/* 手卷 */
.mk-result .scroll { left: 54px; top: 190px; width: 1172px; height: 500px; }
.mk-result .scroll .rod { position: absolute; top: -12px; bottom: -12px; width: 16px; border-radius: 7px; z-index: 3; background: linear-gradient(90deg, #2b1d12, #6b4a2c 40%, #3a2a1c 70%, #22170e); box-shadow: 0 3px 6px rgba(0,0,0,.35); }
.mk-result .scroll .rod::before, .mk-result .scroll .rod::after { content: ""; position: absolute; left: -3px; right: -3px; height: 12px; border-radius: 5px; background: linear-gradient(90deg, #8fa89c, #d6e2da 45%, #7d958a); }
.mk-result .scroll .rod::before { top: -10px; } .mk-result .scroll .rod::after { bottom: -10px; }
.mk-result .scroll .rod.l { left: -10px; } .mk-result .scroll .rod.r { right: -10px; }
.mk-result .scroll .core { position: absolute; inset: 0; background: var(--ink-tex-paper), var(--ink-tex-fiber), var(--paper-hi); background-blend-mode: multiply; box-shadow: 0 10px 24px rgba(40,32,20,.3); overflow: hidden; }
.mk-result .scroll .core::before, .mk-result .scroll .core::after { content: ""; position: absolute; left: 0; right: 0; height: 12px; background: var(--silk-blue, #b9c4c0); opacity: .75; }
.mk-result .scroll .core::before { top: 0; } .mk-result .scroll .core::after { bottom: 0; }
.mk-result .core > * { position: absolute; }
.mk-result .vr { top: 30px; bottom: 30px; width: 10px; }
/* 段一 · 人 */
.mk-result .seg1 { left: 20px; top: 24px; width: 280px; height: 452px; }
.mk-result .seg1 .por { position: absolute; left: 60px; top: 0; width: 150px; height: 240px; }
.mk-result .seg1 .por .mk-portrait { height: 100%; }
.mk-result .seg1 .eq { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 1px; font: 12px var(--f-kai); color: var(--ink-zhong); }
.mk-result .seg1 .eq .mk-tok.empty { width: 52px; height: 52px; }
.mk-result .seg1 .eq .mk-tok.empty::after { content: attr(data-k); position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 22px var(--f-display); color: var(--ink-qing); }
.mk-result .seg1 .carry { position: absolute; left: 0; top: 262px; width: 280px; font: 13px var(--f-kai); color: var(--ink-zhong); }
.mk-result .seg1 .xp { position: absolute; left: 0; top: 296px; width: 280px; }
.mk-result .seg1 .xp .r { display: flex; justify-content: space-between; align-items: baseline; font: 18px var(--f-display); color: var(--ink-nong); }
.mk-result .seg1 .xp .r small { font: 12px var(--f-ui); color: var(--ink-zhong); }
.mk-result .seg1 .xp .ink-bar { margin: 6px 0 4px; }
.mk-result .seg1 .xp .n { font: 12px var(--f-ui); color: var(--mk-gold); }
.mk-result .seg1 .xp .n2 { color: var(--ink-zhong); margin-top: 2px; }
.mk-result .seg1 .acts { position: absolute; left: 0; bottom: 0; display: flex; align-items: flex-end; gap: 18px; }
/* 段二 · 所得 */
.mk-result .seg2 { left: 320px; top: 24px; width: 440px; height: 452px; }
.mk-result .seg2 .hd { font: 20px var(--f-display); color: var(--ink-nong); letter-spacing: .12em; margin-bottom: 8px; }
.mk-result .seg2 .hd small { font: 12px var(--f-ui); color: var(--ink-dan); letter-spacing: 0; margin-left: 8px; }
.mk-result .seg2 .grid { position: relative; overflow-x: auto; overflow-y: hidden; height: 300px; }
.mk-result .seg2 .grid .in { position: relative; height: 100%; }
.mk-result .seg2 .grid .mk-tok { position: absolute; cursor: default; }
.mk-result .seg2 .grid .mk-tok > .cap { position: absolute; left: 50%; top: calc(100% + 1px); transform: translateX(-50%); white-space: nowrap; font: 11px var(--f-kai); color: var(--ink-zhong); max-width: 64px; overflow: hidden; text-overflow: ellipsis; }
.mk-result .seg2 .empty { font: 18px var(--f-display); color: var(--ink-dan); padding: 40px 0; }
.mk-result .seg2 .lost { margin-top: 10px; }
.mk-result .seg2 .lost .t { font: 15px var(--f-display); color: var(--zhu); letter-spacing: .1em; margin-bottom: 4px; }
.mk-result .seg2 .lost .row { display: flex; flex-wrap: wrap; gap: 6px; }
.mk-result .seg2 .lost .mk-tok { position: relative; }
.mk-result .seg2 .lost .mk-tok::after { content: "失"; position: absolute; right: -3px; top: -3px; z-index: 4; width: 15px; height: 15px; display: flex; align-items: center; justify-content: center; font: 10px var(--f-display); color: var(--zhu); box-shadow: 0 0 0 1px var(--zhu) inset; border-radius: 2px; background: rgba(245,240,227,.9); transform: rotate(-6deg); }
.mk-result .mk-tok.surge::before { content: ""; position: absolute; inset: -40%; z-index: -2; background: radial-gradient(closest-side, rgba(21,24,27,.45), transparent); animation: mkSurge 1.6s ease-out both; pointer-events: none; }
@keyframes mkSurge { 0% { opacity: 0; transform: scale(.6); } 35% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.4); } }
/* 段三 · 账 */
.mk-result .seg3 { left: 780px; top: 24px; width: 280px; height: 452px; overflow: hidden; }
.mk-result .seg3 .ink-row { padding: 6px 2px; font-size: 14px; }
.mk-result .seg3 .ink-row .k { min-width: 4.2em; flex: none; }
.mk-result .seg3 .ink-row .v { font-size: 15px; min-width: 0; overflow-wrap: anywhere; line-height: 1.3; }
.mk-result .seg3 .ink-row .v.long { font-size: 13px; } /* 长地名：缩小一号，仍放不下就换行 */
.mk-result .seg3 .notes { margin-top: 8px; font: 13px/1.65 var(--f-kai); color: var(--ink-zhong); }
.mk-result .seg3 .ink-slips { margin-top: 8px; transform: scale(.78); transform-origin: left top; }
/* 卷首 */
.mk-result .head { left: 1082px; top: 30px; width: 80px; height: 440px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.mk-result .head .w { writing-mode: vertical-rl; font-size: 52px; color: var(--ink); line-height: 1; }
.mk-result .head .w.death { color: var(--zhu); }
.mk-result .head .tot { display: flex; flex-direction: column; align-items: center; font: 13px var(--f-kai); color: var(--ink-zhong); }
.mk-result .head .tot b { font: 400 34px var(--f-splash); color: var(--mk-gold); line-height: 1.05; }
.mk-result .head .stone { font: 12px var(--f-ui); color: var(--ink-zhong); }
.mk-result .mk-lzhint { left: 330px; bottom: 26px; width: 430px; font: 12px var(--f-kai); color: var(--ink-dan); }
/* 浮签 */
.mk-result .tipx { position: fixed; z-index: 5; display: none; padding: 10px 14px 12px; max-width: 260px; font: 13px/1.6 var(--f-kai); color: var(--ink-nong); background: var(--paper-hi); box-shadow: 0 4px 12px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; transform: rotate(-.8deg); pointer-events: none; }
.mk-result .tipx .nm { font: 17px var(--f-display); }
.mk-result .tipx .q { font: 11px var(--f-ui); color: var(--ink-dan); }
.mk-gauge { font: 13px var(--f-kai); color: var(--ink-zhong); }
.mk-gauge .ink-bar { margin-top: 4px; }
.mk-portrait { display: flex; align-items: flex-end; justify-content: center; overflow: visible; }
.mk-portrait img { height: 100%; object-fit: contain; }
.mk-portrait.empty { background: radial-gradient(ellipse at 50% 60%, rgba(21,24,27,.06), transparent 65%); }
@media (prefers-reduced-motion: reduce) { .mk-result .scroll .core.fx-unroll { animation: none; } }
`;

// 林墨 2D 立绘（UI 设计师的 SVG；界面里不放 3D 模型）
const portraitMods = import.meta.glob("../ink/portrait_linmo.svg", { eager: !0, query: "?url", import: "default" });
export const PORTRAIT = Object.values(portraitMods)[0] || null;
export function portrait() {
  const box = kit.el("div", "mk-portrait" + (PORTRAIT ? "" : " empty"));
  if (PORTRAIT) box.innerHTML = `<img src="${PORTRAIT}" alt="林墨" draggable="false">`;
  return box;
}

// 机缘刻度（内容模块 D 的 getFortune）
export function fortuneGauge(profile) {
  if (!LOOT.getFortune) return null;
  const f = LOOT.getFortune(profile) || {};
  const k = f.max ? Math.min(1, f.value / f.max) : 0;
  const g = kit.el("div", "mk-gauge", `机缘 <span class="ink-note">${Math.round(f.value || 0)} / ${f.max || "?"}</span>${k >= 1 ? " <span class='mk-gold'>· 已满，下一件大奖必出极品</span>" : ""}`);
  g.appendChild(kit.bar(k, "xp thin"));
  return g;
}

// 鉴定：优先用洞府模块的 identifyItem（facilities.js），其次内容模块的 identify；否则就地揭晓（装备没有词条时按品质补词条）
const facLoad = Object.values(import.meta.glob("../../game/cave/facilities.js"))[0];
let FAC = null;
const facReady = facLoad ? facLoad().then((m) => (FAC = m)).catch(() => {}) : Promise.resolve();
export function identifyItem(inst, profile) {
  if (inst.identified !== !1) return inst;
  if (FAC && FAC.identifyItem) {
    try {
      return FAC.identifyItem(inst) || inst;
    } catch (e) {
      console.error("[result] 洞府鉴定失败，改用兜底", e);
    }
  }
  if (LOOT.identify) {
    const r = LOOT.identify(inst, { profile });
    if (r && r !== inst && typeof r === "object") Object.assign(inst, r);
  }
  inst.identified = !0;
  const d = defOf(inst) || {};
  if (!inst.affixes.length && LOOT.rollAffixes && ["gear", "artifact"].includes(d.cat) && (inst.rarity || 0) > 0) inst.affixes = LOOT.rollAffixes(d.slot, inst.rarity, inst.level) || [];
  return inst;
}

const mmss = (t = 0) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const CAT = { stone: "灵石", herb: "灵草", ore: "矿石", beast: "妖兽材料", core: "妖丹", treasure: "灵物", gear: "法器", artifact: "法宝", scroll: "功法残卷", recipe: "丹方器方", pill: "丹药", talisman: "符箓", quest: "剧情" };
const STAT = { atk: "攻击", spell: "法力", hp: "气血", mp: "真气", def: "防御", crit: "会心", critDmg: "会心伤害", aspd: "出剑", cdr: "冷却", move: "身法", dmg: "伤害", sense: "神识", extractSpeed: "撤离读条" };
const affixText = (a) => `${STAT[a.stat] || a.stat} ${a.type === "pct" || a.value < 1 ? "+" + Math.round(a.value * 100) + "%" : "+" + Math.round(a.value)}`;

export function resultScene(flow) {
  const ctx = flow.ctx;
  let L, timers = [], onKey = null;
  const S = {
    live: !1,
    hud: !1,
    async enter(data = {}) {
      await facReady;
      kit.css("result", CSS);
      const P = flow.profile, R = data.result || { result: "extract", kept: [], lost: [] };
      S.data = R;
      // 鉴定揭晓（入库前已在仓库里，就地修改实例）
      const unid = R.kept.filter((it) => it.identified === !1);
      for (const it of unid) identifyItem(it, P);
      flow.save(); // 撤离结算后保存
      L = kit.layer("result", 46);
      kit.clear("result");
      kit.show("result", !0);
      const ok = R.result === "extract";
      const val = R.kept.reduce((s, it) => s + valueOf(it), 0);
      const stones = R.kept.filter((it) => it.id === "spirit_stone").reduce((s, it) => s + it.n, 0);
      const root = kit.el("div", "mk-result mk-paperbg");
      root.addEventListener("mousedown", (e) => e.stopPropagation());
      const stage = kit.el("div", "mk-stage");
      root.appendChild(stage);
      const add = (parent, cls, html) => (parent.appendChild(kit.el("div", cls, html)), parent.lastChild);
      // ---- 题头 ----
      const word = ok ? (val >= 300 ? "满载而归" : "全身而退") : R.rescued ? "魂归洞府" : "身陨";
      add(stage, "big ink-splash fx-bleed" + (ok ? "" : " death"), word);
      const seal = kit.seal(ok ? "撤离功成" : R.rescued ? "有惊无险" : "身陨道消", { cls: "four", size: 76, rot: -6 });
      seal.classList.add("fx-stamp");
      add(stage, "seal4", "").appendChild(seal);
      add(stage, "sub", `<span>${R.regionName || ""}</span><span>·</span><span>第 ${P.stats.runs || 0} 次出行</span><span class="ink-rule"></span>`);
      const fg = fortuneGauge(P);
      if (fg) add(stage, "fortune", "").appendChild(fg);
      // ---- 手卷 ----
      const scroll = add(stage, "scroll", `<i class="rod l"></i><i class="rod r"></i>`);
      const core = add(scroll, "core fx-unroll", "");
      core.addEventListener("animationend", (e) => e.target === core && core.classList.remove("fx-unroll"), { once: !0 });
      // 段一 · 人
      const seg1 = add(core, "seg1", "");
      add(seg1, "por", "").appendChild(portrait());
      const EQ = [["sword", "剑", 0, 6], ["robe", "衣", 0, 120], ["jade", "佩", 218, 6], ["artifact", "宝", 218, 120]];
      for (const [slot, k, x, y] of EQ) {
        const g = P.equip[slot];
        const box = add(seg1, "eq", "");
        box.style.left = x + "px";
        box.style.top = y + "px";
        if (g) box.appendChild(S.tok(g, { size: 52, box: "1x1" }));
        else {
          const e = kit.el("div", "mk-tok q0 empty");
          e.dataset.k = k;
          box.appendChild(e);
        }
        box.appendChild(kit.el("span", "", g ? (defOf(g) || {}).name || k : k));
      }
      const carried = (R.carriedLeft || []).map((it) => `${(defOf(it) || {}).name} ${it.n}`).join(" · ");
      add(seg1, "carry", carried ? `行囊余下：${carried}` : "行囊余下：—");
      const need = xpNeed(P);
      const xp = add(seg1, "xp", `<div class="r"><span>${realmName(P)}</span><small>${Math.floor(P.xp)} / ${need === Infinity ? "—" : need}</small></div>`);
      xp.appendChild(kit.bar(need === Infinity ? 1 : P.xp / need, "xp"));
      // 感悟 = 斩妖所得修为，击杀当场入账、身陨不失（青牙 v2 可读性：用户反馈"领悟值是什么作用？没看出来"）
      const ins = Math.round(R.insight || 0), xp0 = Math.max(0, Math.floor(P.xp - ins));
      xp.appendChild(kit.el("div", "n", `本局感悟 +${ins} · 斩妖即入修为${ok ? "" : "，身陨不失"}`));
      xp.appendChild(kit.el("div", "n n2", P.xp >= need ? (P.stats.xpBank > 0 ? `修为圆满 · 溢出存储 ${Math.round(P.stats.xpBank)}/600` : "修为已满，回府可突破") : `修为 ${xp0} → ${Math.floor(P.xp)} / ${need} · 距下一层 ${Math.max(0, Math.ceil(need - P.xp))}`));
      const acts = add(seg1, "acts", "");
      acts.appendChild(kit.button("回府", () => S.home(), { seal: !0, small: !0, id: "tocave" }));
      acts.appendChild(kit.button("再出行", () => S.again(), { id: "again", key: "R" }));
      add(core, "vr ink-vrule", "").style.left = "306px";
      // 段二 · 所得
      const seg2 = add(core, "seg2", "");
      add(seg2, "hd", `所得<small>${R.kept.length} 件${unid.length ? ` · 鉴定 ${unid.length} 件` : ""}</small>`);
      const sorted = [...R.kept].sort((a, b) => valueOf(b) - valueOf(a));
      const revealList = [];
      if (sorted.length) {
        const SZ = 52, GAP = 8, ROWH = SZ + GAP + 14, ROWS = 4;
        const cells = sorted.reduce((s, it) => s + (sizeOf(it) >= 4 ? 4 : sizeOf(it) >= 2 ? 2 : 1), 0);
        const cols = Math.max(6, Math.ceil(cells / ROWS) + 1); // 超过 24 格：手卷往左展开（横向滚动）
        let pk = packBag(sorted, cols, ROWS);
        if (pk.placed.length < sorted.length) pk = packBag(sorted, cols + 4, ROWS);
        const grid = add(seg2, "grid", "");
        const inner = add(grid, "in", "");
        inner.style.width = cols * (SZ + GAP) + "px";
        for (const { it, c, r } of pk.placed) {
          const hidden = unid.includes(it);
          const t = S.tok(hidden ? { ...it, identified: !1 } : it, { size: SZ, cap: !0 });
          t.style.left = c * (SZ + GAP) + "px";
          t.style.top = r * ROWH + "px";
          inner.appendChild(t);
          if (hidden) revealList.push({ t, it });
        }
      } else add(seg2, "empty", "空手而归");
      if (R.lost && R.lost.length) {
        const lost = add(seg2, "lost", `<div class="t">遗失 ${R.lost.length} 件</div>`);
        const row = add(lost, "row", "");
        for (const it of R.lost) row.appendChild(S.tok(it, { size: 40, disabled: !0, box: "1x1" }));
      }
      add(core, "vr ink-vrule", "").style.left = "768px";
      // 段三 · 账
      const seg3 = add(core, "seg3", "");
      add(seg3, "ink-list", [
        ["用时", mmss(R.time)],
        [ok ? "撤离点" : "身陨处", R.via || (ok ? "—" : R.regionName)],
        ["斩妖", `${R.kills || 0}${R.elites ? ` <small class="ink-note">精英 ${R.elites}</small>` : ""}`],
        ["灵潮", `×${(R.tide || 1).toFixed(1)}`],
        R.lost && R.lost.length ? ["遗失", `<span class="mk-red">${R.lost.reduce((s, it) => s + valueOf(it), 0)} 估价</span>`] : null,
      ].filter(Boolean).map(([k, v]) => `<div class="ink-row"><span class="k">${k}</span><span class="v${String(v).replace(/<[^>]*>/g, "").length > 9 ? " long" : ""}">${v}</span></div>`).join(""));
      const notes = [];
      if (R.rescued) notes.push("玄机子：「啧，刚来就把命丢了？老夫把你的魂魄捞回来了——这回不算。」");
      if (R.gearLost) notes.push(`<span class="mk-red">法器「${(defOf(R.gearLost) || {}).name}」随遗落储物袋留在了${R.regionName}。</span>`);
      if (R.lostBag) notes.push(`遗落的储物袋留在身陨之处：下一局去${R.regionName}，天机镜上会标出它——法器全数取回，其余约六成。`);
      if (R.retrieved) notes.push(`<span class="mk-gold">本局取回遗落储物袋 ${R.retrieved.got.length} 件${R.retrieved.gone.length ? `，${R.retrieved.gone.length} 件已散失` : ""}。</span>`);
      if (R.quests) notes.push(questText(R.quests));
      add(seg3, "notes", notes.join("<br>"));
      if (R.firsts && R.firsts.length) add(seg3, "ink-slips", R.firsts.slice(0, 4).map((x) => `<div class="ink-slip on">${typeof x === "string" ? x : x.name}<small>首次所见</small></div>`).join("")).dataset.n = R.firsts.length;
      add(core, "vr ink-vrule", "").style.left = "1068px";
      // 卷首
      const head = add(core, "head", `<div class="w ink-splash${ok ? "" : " death"}">${ok || R.rescued ? "所得" : "遗失"}</div>`);
      add(head, "tot", `<span>带回估价<span class="mk-q left" data-tip="${COPY.lingzhi}">？</span></span><b>${val.toLocaleString()}</b>`);
      add(head, "stone", `灵石 ${stones}`);
      add(core, "ink-note mk-lzhint", COPY.lingzhiResult);
      // 浮签
      S.tipEl = add(root, "tipx", "");
      L.appendChild(root);
      // 揭晓演出：剪影依次揭开（0.65s 一件）；仙品以上墨色翻涌
      revealList.forEach(({ t, it }, i) => {
        timers.push(
          setTimeout(() => {
            t._inst = it;
            setTagState(t, { sil: !1 });
            t.classList.remove("is-unid");
            t.classList.add("revealed");
            const cap = t.querySelector(".cap");
            if (cap) cap.textContent = (defOf(it) || {}).name || it.id;
            tagReveal(t);
            if ((it.rarity || 0) >= 3) t.classList.add("surge"), ctx.rig.shake(0.25);
          }, 900 + i * 650),
        );
      });
      S.revealCount = revealList.length;
      onKey = (e) => {
        if (e.repeat || flow.name !== "result" || document.querySelector(".mk-modal")) return;
        if (e.code === "Enter" || e.code === "NumpadEnter") S.home();
        else if (e.code === "KeyR") S.again();
      };
      addEventListener("keydown", onKey);
      // Esc = 呼出 Esc 菜单（继续 / 设置 / 回到主页）；回府仍是 Enter / 朱印（src/ui/esc.js）
      S.pause = S.pause || new PauseMenu(flow, { run: null });
      S.offEsc = setEscIdle(() => flow.name === "result" && (S.pause.toggle(!0), !0));
    },
    // 物品签 + 悬停纸条
    tok(it, o) {
      const t = itemTag(it, { ...o, title: "" });
      t.addEventListener("mouseenter", (e) => S.tip(t._inst || it, e));
      t.addEventListener("mousemove", (e) => S.tip(t._inst || it, e));
      t.addEventListener("mouseleave", () => S.tipEl && (S.tipEl.style.display = "none"));
      return t;
    },
    tip(it, e) {
      const el = S.tipEl;
      if (!el) return;
      const d = defOf(it) || {}, q = it.rarity || 0, Rr = RARITY[q], unid = it.identified === !1;
      el.innerHTML = `<div class="nm" style="color:${q ? Rr.color : "var(--ink)"}">${unid ? "未鉴定的" : ""}${d.name || it.id}${it.n > 1 ? " ×" + it.n : ""}</div><div class="q">${Rr.name} · ${CAT[d.cat] || "杂物"} · 占 ${sizeOf(it)} 格 · 估价 ${valueOf(it)}</div>${!unid && it.affixes && it.affixes.length ? `<div>${it.affixes.filter((a) => a.type !== "flag").map(affixText).join(" · ")}</div>` : ""}<div class="ink-note" style="margin-top:4px">${COPY.lingzhiResult}</div>`;
      el.style.display = "block";
      el.style.left = e.clientX + 16 + "px";
      el.style.top = e.clientY + 12 + "px";
    },
    home() {
      if (flow.name === "result") flow.go("cave", { from: "result", result: S.data });
    },
    again() {
      if (flow.name === "result") flow.go("prep");
    },
    exit() {
      timers.forEach(clearTimeout);
      timers = [];
      if (onKey) removeEventListener("keydown", onKey), (onKey = null);
      S.offEsc && S.offEsc(), (S.offEsc = null);
      S.pause && S.pause.dispose();
      kit.clear("result");
      kit.show("result", !1);
    },
  };
  return S;
}

// 委托结果（模块 E 的 settle 已直接写入存档，这里只展示）
function questText(q) {
  const list = Array.isArray(q) ? q : q.list || [];
  const lines = list.map((x) => (typeof x === "string" ? x : `${x.done ? "✓" : "✗"} ${x.text || x.name || x.id}${x.done && x.reward ? " → <span class='mk-gold'>" + x.reward + "</span>" : ""}`));
  for (const n of q.notes || []) lines.push(`<span class="mk-dim">${n}</span>`);
  return lines.length ? `<b>委托</b><br>${lines.join("<br>")}` : "";
}
