// 储物袋界面（局内，Tab / I 开合）· 储物袋 v2 方向四「侧挂纸笺」（docs/ui/v2/储物袋_v2_方案.md，已定稿）
// 世界不暂停：只在画面右侧挂一张竖长宣纸，主角、左上气血、技能栏都不遮挡。纸笺内自上而下一条信息线：
//   标题 + 满载印 + 袋中估价 → 占格条 + 灵石 → 随身（剑 / 衣 / 佩 / 法宝 + 行囊）→ 袋中格子（物品签，按占格摆放）
//   → 贴身锦囊 | 护身格 → 脚下（放不下时"需 N 格"）→ 若身陨此地 → 键位
// 选中物品时，详情浮签贴在纸笺左外沿（主角头顶上方的空处）：名称 / 品级 / 占格 / 描述 / 与身上装备对比 / 词条 / 估价 / 操作。
// 纸笺左沿：附近有仇恨中的妖物时出一枚朱印"妖" + 方位距离；受击时浮签收起、纸笺淡一下。
// 交互：点选；双击 = 装备 / 拾取 / 取出；右键 = 丢弃；拖拽 = 整理（拖到别的物品前）/ 换装（拖到装备位）/ 入锦囊 / 拖出纸笺丢弃。
// 满袋时纯手动取舍（不做"可弃"建议）：只提示"脚下 · ××× 放不下（需 N 格）"。
import { weaponAffixText } from "../data/items.js";
import { kit } from "./kit.js";
import { itemTag, iconEl } from "./icons.js";
import { RARITY, defOf, sizeOf, valueOf } from "../core/items.js";
import { INTRO_AT, REGIONS } from "../game/run/regions.js";
import { gearMods } from "../game/run/run.js";
import { STAT_NAME } from "../game/cave/data.js";
import { COPY } from "./copy.js";
import { inkReadable } from "../fx/rarity_tint.js";
import { slotOpen, slotLockText } from "../game/progression.js";
import { pageHint } from "../game/gongfa.js"; // 残页提示（功法 / 丹方残页同一句式）

const QN = RARITY.map((_, q) => inkReadable(q)); // 名称字色：从 RARITY 推导（src/fx/rarity_tint.js，压深以保证对比度）
const SLOTS = [["sword", "剑"], ["robe", "衣"], ["jade", "佩"], ["artifact", "宝"]];
const DIRS = ["东", "东南", "南", "西南", "西", "西北", "北", "东北"];
const PARTS = ["hd", "cap", "worn", "bag", "safe", "ground", "die"]; // 纸笺各段的固定顺序（局部刷新时按它插回）
const sigOf = (it) => (it ? `${it.uid}:${it.n}:${it.rarity | 0}:${it.identified === !1 ? 0 : 1}` : "-"); // 物品签外观只取决于这几项
const WARN_R = 20; // 敌近提示半径（约 6 丈）

const CSS = `
.mk-bagui { position: absolute; inset: 0; pointer-events: none; }
.mk-bagui > * { pointer-events: none; }
.mk-bagui .bv-veil { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0, transparent 50%, rgba(236,230,214,.32) 64%, rgba(236,230,214,.62) 100%); }
.mk-bagui .bv-dock { position: absolute; right: 0; top: 0; width: 780px; height: 720px; transform: scale(var(--mk-scale, 1)); transform-origin: 100% 0; }
.mk-bagui .bv-dock > * { position: absolute; pointer-events: auto; }
.mk-bagui.hit .bv-strip { opacity: .6; transition: opacity .1s; }
.mk-bagui .bv-strip { right: 12px; top: 8px; width: 372px; height: 676px; padding: 14px 20px 10px 24px; box-sizing: border-box; transition: opacity .4s; }
.mk-bagui .bv-strip > .ink-sheet::before { background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(150,125,85,.14)), var(--ink-tex-paper), var(--ink-tex-fiber), rgba(245,240,227,.95); background-blend-mode: normal, multiply, multiply, normal; }
.mk-bagui .bv-hd { display: flex; align-items: flex-end; gap: 10px; }
.mk-bagui .bv-hd .t { font: 400 30px/1 var(--f-splash); letter-spacing: .06em; color: var(--ink); }
.mk-bagui .bv-hd .val { margin-left: auto; text-align: right; }
.mk-bagui .bv-hd .val small { display: block; font: 12px var(--f-kai); color: var(--ink-zhong); letter-spacing: .12em; }
.mk-bagui .bv-hd .val b { font: 400 32px/1 var(--f-splash); color: var(--mk-gold); }
.mk-bagui .bv-cap { display: flex; align-items: center; gap: 8px; margin: 6px 0 0; font: 12px var(--f-ui); color: var(--ink-zhong); }
.mk-bagui .bv-cap .ink-bar { flex: 1; }
.mk-bagui .bv-cap b { font-weight: 700; color: var(--ink-nong); }
.mk-bagui .bv-cap.full b { color: var(--zhu); }
.mk-bagui .grp { margin-top: 8px; }
.mk-bagui .grp .hd { display: flex; align-items: baseline; gap: 8px; font: 400 16px var(--f-display); letter-spacing: .12em; color: var(--ink-nong); margin-bottom: 3px; }
.mk-bagui .grp .hd small { font: 11px var(--f-ui); letter-spacing: 0; color: var(--ink-dan); }
.mk-bagui .grp .hd .r { margin-left: auto; }
.mk-bagui .bv-worn { display: flex; align-items: flex-start; gap: 3px; }
.mk-bagui .bv-slot { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0; }
.mk-bagui .bv-slot > span { font: 11px var(--f-kai); color: var(--ink-zhong); line-height: 14px; }
.mk-bagui .bv-slot.belt > span { font: 10px var(--f-ui); color: var(--ink-dan); }
.mk-bagui .bv-worn .sep { width: 10px; }
.mk-bagui .bv-empty { position: relative; width: var(--s); height: var(--s); display: flex; align-items: center; justify-content: center; font: 15px var(--f-display); color: var(--ink-qing); }
.mk-bagui .bv-empty::after { content: ""; position: absolute; inset: 2px; background: var(--ink); opacity: .16; -webkit-mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-2) 0 0 / 100% 100% no-repeat; }
.mk-bagui .bv-grid { position: relative; }
.mk-bagui .bv-grid > .cm { position: absolute; width: var(--cell); height: var(--cell); pointer-events: none;
  background: radial-gradient(circle at 50% 50%, rgba(21,24,27,.10) 0 1.6px, transparent 2.2px),
    linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 0 0 / 6px 1.5px no-repeat, linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 0 0 / 1.5px 6px no-repeat,
    linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 100% 0 / 6px 1.5px no-repeat, linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 100% 0 / 1.5px 6px no-repeat,
    linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 0 100% / 6px 1.5px no-repeat, linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 0 100% / 1.5px 6px no-repeat,
    linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 100% 100% / 6px 1.5px no-repeat, linear-gradient(rgba(21,24,27,.2), rgba(21,24,27,.2)) 100% 100% / 1.5px 6px no-repeat; }
.mk-bagui .bv-grid > .mk-tok { position: absolute; cursor: pointer; }
.mk-bagui .mk-tok { cursor: pointer; }
.mk-bagui .mk-tok:hover > .ring { opacity: 1; }
.mk-bagui .mk-tok.is-drag { opacity: .3; }
.mk-bagui .drop-ok { outline: none; }
.mk-bagui .bv-grid > .mk-tok.drop-before::before { content: ""; position: absolute; left: -4px; top: 10%; bottom: 10%; width: 4px; background: var(--zhu); opacity: .8; -webkit-mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-v) 0 0 / 100% 100% no-repeat; z-index: 5; }
.mk-bagui [data-drop].drop-ok { background: radial-gradient(closest-side, rgba(184,41,26,.16), transparent); }
.mk-bagui .bv-safe { display: flex; gap: 6px; margin-top: 8px; }
.mk-bagui .bv-safe .grp { margin-top: 0; position: relative; isolation: isolate; padding: 4px 8px 4px 10px; flex: 1; min-width: 0; }
.mk-bagui .bv-safe .grp .hd { font-size: 15px; letter-spacing: .08em; gap: 5px; white-space: nowrap; }
.mk-bagui .bv-safe .row { display: flex; gap: 2px; min-height: 46px; align-items: center; }
.mk-bagui .bv-safe .pouch::before { content: ""; position: absolute; inset: 0; z-index: -1; background: rgba(181,72,90,.13); -webkit-mask: var(--ink-wash-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-1) 0 0 / 100% 100% no-repeat; }
.mk-bagui .bv-safe .amulet::before { content: ""; position: absolute; inset: 0; z-index: -1; background: rgba(47,127,168,.11); -webkit-mask: var(--ink-wash-2) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-2) 0 0 / 100% 100% no-repeat; }
.mk-bagui .bv-safe .mi { position: relative; display: inline-block; width: 22px; height: 22px; align-self: center; }
.mk-bagui .bv-safe .ink-seal { --s: 18px; font-size: 10px; --seal-color: var(--shiqing); align-self: center; }
.mk-bagui .bv-safe .prog { width: 100%; margin-top: 2px; }
.mk-bagui .bv-ground { display: flex; align-items: center; gap: 8px; margin-top: 6px; min-height: 40px; }
.mk-bagui .bv-ground .gl { display: flex; gap: 2px; flex: none; }
.mk-bagui .bv-ground .txt { font: 13px/1.4 var(--f-kai); color: var(--ink-nong); }
.mk-bagui .bv-ground .txt b { color: var(--zhu); font-weight: 400; font-family: var(--f-display); }
.mk-bagui .bv-ground .txt small { display: block; font: 11px var(--f-ui); color: var(--ink-zhong); }
.mk-bagui .bv-die { margin-top: 4px; }
.mk-bagui .bv-die .hd { display: flex; align-items: center; gap: 6px; font: 400 15px var(--f-display); letter-spacing: .1em; color: var(--ink-nong); }
.mk-bagui .bv-die .ink-list { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; }
.mk-bagui .bv-die .ink-row { font-size: 12px; padding: 2px 1px; }
.mk-bagui .bv-die .ink-row .k { min-width: 0; }
.mk-bagui .bv-die .ink-row .v { font-size: 13px; }
.mk-bagui .bv-die .ink-row + .ink-row::before { display: none; }
.mk-bagui .bv-keys { margin-top: 4px; font: 11px var(--f-ui); color: var(--ink-zhong); display: flex; flex-wrap: wrap; gap: 2px 10px; }
.mk-bagui .bv-keys b { color: var(--ink-nong); border-bottom: 1px solid var(--ink-dan); padding: 0 2px; margin-right: 3px; font-weight: 700; }
/* 详情浮签 */
.mk-bagui .bv-tip { right: 400px; top: 18px; width: 290px; padding: 16px 20px 12px; transform: rotate(-.5deg); box-sizing: border-box; }
.mk-bagui.hit .bv-tip { display: none; }
.mk-bagui .bv-tip .top { display: flex; gap: 12px; align-items: center; }
.mk-bagui .bv-tip .nm { font: 400 24px/1.1 var(--f-display); letter-spacing: .06em; }
.mk-bagui .bv-tip .meta { font: 12px var(--f-kai); color: var(--ink-zhong); margin-top: 4px; }
.mk-bagui .bv-tip p { font: 13.5px/1.65 var(--f-kai); color: var(--ink-nong); margin: 8px 0 4px; }
.mk-bagui .bv-cmp { width: 100%; border-collapse: collapse; font: 13px var(--f-kai); margin-top: 4px; }
.mk-bagui .bv-cmp th { font: 11px var(--f-ui); color: var(--ink-dan); font-weight: 400; text-align: right; padding: 0 0 2px; white-space: nowrap; }
.mk-bagui .bv-cmp th:first-child, .mk-bagui .bv-cmp td:first-child { text-align: left; color: var(--ink-zhong); }
.mk-bagui .bv-cmp td { text-align: right; padding: 2px 0; font-family: var(--f-display); font-size: 15px; color: var(--ink-nong); }
.mk-bagui .bv-cmp td.o { color: var(--ink-dan); font-size: 13px; }
.mk-bagui .bv-cmp .up { color: #2c7d57; } .mk-bagui .bv-cmp .down { color: var(--zhu); }
.mk-bagui .bv-cmp .up::before { content: "▲"; font-size: .7em; margin-right: 2px; } .mk-bagui .bv-cmp .down::before { content: "▼"; font-size: .7em; margin-right: 2px; }
.mk-bagui .bv-tip .affix { font: 12.5px/1.55 var(--f-kai); color: #245f7f; }
.mk-bagui .bv-tip .ink-list .ink-row { font-size: 13px; padding: 4px 2px; }
.mk-bagui .bv-tip .acts { display: flex; align-items: center; gap: 2px; margin-top: 8px; flex-wrap: wrap; }
.mk-bagui .bv-tip .acts .note { font: 11px var(--f-ui); color: var(--ink-dan); width: 100%; }
.mk-bagui .bv-tip .prog { margin-top: 6px; }
/* 敌近 */
.mk-bagui .bv-warn { right: 396px; top: 520px; display: none; align-items: center; gap: 6px; padding: 6px 12px; font: 13px var(--f-kai); color: var(--zhu); white-space: nowrap; background: radial-gradient(ellipse closest-side, rgba(245,240,227,.88), rgba(245,240,227,0)); pointer-events: none; }
.mk-bagui .bv-warn.on { display: flex; }
.mk-bagui .bv-warn .ink-seal { --s: 26px; font-size: 13px; }
.mk-bagui .bv-warn .arr { position: relative; display: block; width: 30px; height: 30px; transform: rotate(var(--a, 180deg)); }
.mk-bagui .bv-warn .arr::before { content: ""; position: absolute; left: 2px; right: 8px; top: 12px; height: 6px; background: var(--zhu); opacity: .75; -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.mk-bagui .bv-warn .arr::after { content: ""; position: absolute; right: 1px; top: 9px; width: 11px; height: 12px; background: var(--zhu); opacity: .85; clip-path: polygon(0 0, 100% 50%, 0 100%, 25% 50%); }
.mk-bagui .bv-warn.close .ink-seal { animation: bvPulse .8s ease-in-out infinite; }
@keyframes bvPulse { 50% { transform: rotate(-3deg) scale(1.12); } }
/* 拖拽残影 */
.mk-bv-ghost { position: fixed; z-index: 120; pointer-events: none; opacity: .85; transform: translate(-50%, -50%) scale(var(--mk-scale, 1)); }
body.mk-bag-open .mk-toasts { left: 34%; top: 150px; }
body.mk-bag-open .mk-val { visibility: hidden; } /* HUD 右上的袋中估价与纸笺重复，开袋时让位 */
@media (prefers-reduced-motion: reduce) { .mk-bagui .bv-warn.close .ink-seal { animation: none; } }
`;

export class BagUI {
  constructor(ctx, run) {
    kit.css("bagui", CSS);
    this.ctx = ctx;
    this.run = run;
    this.L = kit.layer("bag", 50);
    kit.clear("bag");
    kit.show("bag", !1);
    this.open = !1;
    this.sel = null;
    this.moving = null;
    this.drag = null;
    this.onKey = (e) => {
      if (e.code === "Tab") e.preventDefault();
      if (e.repeat) return;
      if (e.code === "Tab" || e.code === "KeyI") this.toggle();
    };
    addEventListener("keydown", this.onKey);
    this.offs = [
      run.bag.on(() => this.dirty()),
      run.pouch.on(() => this.dirty()),
      run.on((t) => {
        if (t === "bag" || t === "bagfull") this.dirty();
        // 袋子开着时，"储物袋已满"的横幅不再弹（信息已在纸笺状态行里）
        if (t === "bagfull" && this.open) setTimeout(() => document.querySelectorAll(".mk-toasts .ink-toast").forEach((e) => /^储物袋已满/.test(e.textContent) && e.remove()), 0);
      }),
    ];
    this.groundT = 0;
    this.warnT = 0;
    this.hitT = 0;
    this.lastHp = null;
    this.onMove = (e) => this.dragMove(e);
    this.onUp = (e) => this.dragEnd(e);
  }
  toggle(on = !this.open) {
    if (this.run.state === "done") on = !1;
    this.open = on;
    if (!on) this.cancelDrag();
    kit.show("bag", on);
    document.body.classList.toggle("mk-bag-open", on);
    // 再次打开：沿用合上前的纸笺 DOM，只刷新变了的段（图层 display:none → 显示时纸笺进场动画照常重播）
    if (on) {
      this.lastHp = null;
      if (this.root && this.root.isConnected) {
        this.hitT = 0;
        this.root.classList.remove("hit");
        if (this.warnEl) (this.warnEl.className = "bv-warn"), (this.lastWarn = ""), (this.warnT = 0);
        this.sync();
      } else this.render();
    }
    if (on && this.run.no >= INTRO_AT.pouch) this.run.hintOnce("pouch", "贴身锦囊：放进去的东西身陨也不会丢");
  }
  // 数据变了：同一个任务里的多次变化（换装 = 移出 + 放入 + "bag" 事件、一批拾取逐件入袋……）合并成一次局部刷新，
  // 放在本任务的微任务里做（仍在下一帧之前，画面不晚一帧）
  dirty() {
    if (!this.open) return;
    if (this.drag) return void (this.pending = !0);
    if (this.queued) return;
    this.queued = !0;
    queueMicrotask(() => {
      this.queued = !1;
      if (!this.open) return;
      if (this.drag) return void (this.pending = !0);
      this.sync();
    });
  }
  ground() {
    const hp = this.ctx.player.pos;
    return this.run.pickups.list.filter((p) => Math.hypot(p.x - hp.x, p.z - hp.z) < 3);
  }
  pouchOn() {
    return this.run.no >= INTRO_AT.pouch || this.run.pouch.items.length > 0;
  }
  // 若身陨此地：按区域规则估算
  deathPreview() {
    const r = this.run, R = REGIONS[r.region] || {}, v = r.bag.value;
    if (R.risk === "none") return [["失去", "无"], ["储物袋", "全数保留"]];
    const rows = [["失去", R.keepBag > 0 ? `约 ${Math.round(v * (1 - R.keepBag)).toLocaleString()} 估价` : `${v.toLocaleString()} 估价`]];
    if (R.gearRisk) rows.push(["法器", "随机 1 件未认主的遗落"]);
    rows.push(["锦囊护住", r.pouch.items.map((i) => (defOf(i) || {}).name).join("、") || "—"]);
    if (r.keyItems.length) rows.push(["护身格", r.keyItems.length + " 件不失"]);
    rows.push(["斩妖感悟", "已入体，不失"]);
    return rows;
  }
  // ---------------- 渲染 ----------------
  // 整页构建：只在第一次打开（或图层被别处清空）时做；之后的变化都走 sync() 局部刷新。
  render() {
    this.pending = !1;
    kit.clear("bag");
    const root = (this.root = kit.el("div", "mk-bagui"));
    root.appendChild(kit.el("div", "bv-veil"));
    const dock = (this.dock = kit.el("div", "bv-dock"));
    root.appendChild(dock);
    for (const ev of ["mousedown", "click", "contextmenu"]) dock.addEventListener(ev, (e) => e.stopPropagation());
    dock.addEventListener("contextmenu", (e) => e.preventDefault());
    const strip = (this.strip = kit.el("section", "ink-paper alt bv-strip mk-in"));
    dock.appendChild(strip);
    kit.decorate(strip);
    this.keysEl = kit.el("div", "bv-keys", `<span><b>Tab</b>合上</span><span><b>拖拽</b>整理 / 换装 / 入锦囊</span><span><b>双击</b>装备 / 拾取</span><span><b>右键</b>丢弃</span>`);
    strip.appendChild(this.keysEl);
    this.sec = {};
    this.sig = {};
    this.toks = new Map();
    this.tipEl = this.tipSig = this.tipUid = null;
    this.progSafe = this.progTip = null;
    // 敌近提示（update 里刷新）
    this.warnEl = kit.el("div", "bv-warn", "");
    dock.appendChild(this.warnEl);
    this.lastWarn = "";
    this.warnT = 0;
    this.building = !0; // 先在脱离文档的节点上搭好，再一次挂上
    this.sync();
    this.building = !1;
    this.L.appendChild(root);
  }
  // 局部刷新：每一段（标题 / 占格 / 随身 / 袋中 / 锦囊护身 / 脚下 / 若身陨 / 浮签）算一个签名，变了才重建那一段；
  // 袋中格子按物品复用物品签，只改位置与选中态。DOM 结构、类名与整页构建完全一致。
  sync() {
    if (!this.root || (!this.root.isConnected && !this.building)) return this.render();
    this.pending = !1;
    const r = this.run, b = r.bag, pouch = r.pouch, P = r.profile;
    if (this.sel && this.where(this.sel.it) !== this.sel.where) this.sel = null;
    const selIt = this.sel && this.sel.it;
    const selIn = (list) => (selIt && list.includes(selIt) ? selIt.uid : "");
    const full = b.free <= 0;
    // 标题 + 估价
    this.part("hd", `${full}|${b.value}`, () => {
      const hd = kit.el("div", "bv-hd", `<span class="t">储物袋</span>`);
      if (full) hd.appendChild(kit.seal("满载", { cls: "two gold", size: 34, rot: -6 }));
      const val = kit.el("div", "val", `<small>袋中估价</small><b class="ink-num">${b.value.toLocaleString()}</b>`);
      val.querySelector("small").appendChild(kit.q(COPY.lingzhi));
      hd.appendChild(val);
      return hd;
    });
    const stones = b.count("spirit_stone");
    this.part("cap", `${full}|${b.used}|${b.capacity}|${stones}`, () => {
      const cap = kit.el("div", "bv-cap" + (full ? " full" : ""), `<span>占格 <b>${b.used} / ${b.capacity}</b></span>`);
      cap.appendChild(kit.bar(b.used / b.capacity, "thin" + (full ? " hp" : "")));
      const st = kit.el("span", "", `灵石 ${stones}`);
      st.appendChild(kit.q(COPY.stones));
      cap.appendChild(st);
      return cap;
    });
    // 随身：四个装备位 + 行囊
    const belt = r.carried.slice(0, 4), worn = SLOTS.map(([s]) => P.equip[s]);
    let ws = "";
    for (const [slot] of SLOTS) ws += sigOf(P.equip[slot]) + (slotOpen(P, slot) ? "," : "!,");
    this.part("worn", `${ws}|${r.carried.length}:${belt.map(sigOf).join(",")}|${selIn([...worn, ...belt])}`, () => {
      const worn = kit.el("div", "grp worn", `<div class="hd">随身<small>剑 · 衣 · 佩 · 法宝</small>${r.carried.length ? `<small class="r">行囊</small>` : ""}</div>`);
      const wr = kit.el("div", "bv-worn");
      for (const [slot, ch] of SLOTS) {
        const it = P.equip[slot];
        const s = kit.el("div", "bv-slot");
        s.dataset.drop = "equip:" + slot;
        const open = slotOpen(P, slot); // 栏位解锁：与洞府同一判定（src/game/progression.js）
        if (!open) (s.title = slotLockText(slot)), s.classList.add("is-locked");
        if (it) s.appendChild(this.tag(it, "worn", { size: 44, box: "1x1" }));
        else s.appendChild(kit.el("div", "bv-empty", open ? ch : "锁")).style.setProperty("--s", "44px");
        s.appendChild(kit.el("span", "", ch));
        wr.appendChild(s);
      }
      if (r.carried.length) {
        wr.appendChild(kit.el("i", "sep"));
        belt.forEach((it) => {
          const s = kit.el("div", "bv-slot belt");
          s.appendChild(this.tag(it, "worn", { size: 36, box: "1x1" }));
          s.appendChild(kit.el("span", "", (defOf(it) || {}).name || ""));
          wr.appendChild(s);
        });
      }
      worn.appendChild(wr);
      return worn;
    });
    // 袋中
    this.syncGrid(b, selIt);
    // 贴身锦囊 | 护身格
    const pOn = this.pouchOn(), keys = r.keyItems.slice(0, 5);
    this.part("safe", `${pOn}|${pouch.used}/${pouch.capacity}|${pouch.items.map(sigOf).join(",")}|${this.moving ? 1 : 0}|${keys.map(sigOf).join(",")}|${selIn([...pouch.items, ...keys])}`, () => {
      this.progSafe = null;
      const safe = kit.el("div", "bv-safe");
      if (pOn) {
        const g = kit.el("div", "grp pouch");
        g.dataset.drop = "pouch";
        const ghd = kit.el("div", "hd", `贴身锦囊<small>身陨不失 · ${pouch.used}/${pouch.capacity}</small>`);
        const mi = kit.el("span", "mi");
        mi.appendChild(iconEl("jinnang_qiankun", { h: "100%" }));
        ghd.prepend(mi);
        g.appendChild(ghd);
        const row = kit.el("div", "row");
        for (const it of pouch.items) row.appendChild(this.tag(it, "pouch", { size: 44, box: "1x1" }));
        for (let i = pouch.used; i < pouch.capacity; i++) row.appendChild(kit.el("div", "bv-empty", "")).style.setProperty("--s", "44px");
        g.appendChild(row);
        if (this.moving) {
          const pb = (this.progSafe = kit.bar(this.moving.t, "xp thin"));
          pb.classList.add("prog");
          this.progV = null;
          g.appendChild(pb);
        }
        safe.appendChild(g);
      }
      if (keys.length) {
        const g = kit.el("div", "grp amulet");
        const ghd = kit.el("div", "hd", `护身格<small>关键物品 · 不占格</small>`);
        ghd.prepend(kit.seal("护", { cls: "round", size: 18 }));
        g.appendChild(ghd);
        const row = kit.el("div", "row");
        for (const it of keys) row.appendChild(this.tag(it, "key", { size: 44, box: "1x1" }));
        g.appendChild(row);
        safe.appendChild(g);
      }
      return safe.children.length ? safe : null;
    });
    // 脚下
    const gr = this.ground(), g3 = gr.slice(0, 3), nofit = gr.find((p) => !b.canAdd(p.inst));
    this.part("ground", gr.length ? `${gr.length}|${g3.map((p) => sigOf(p.inst) + (b.canAdd(p.inst) ? "" : "!")).join(",")}|${nofit ? sigOf(nofit.inst) : ""}|${selIn(g3.map((p) => p.inst))}` : "", () => {
      if (!gr.length) return null;
      const gd = kit.el("div", "bv-ground");
      const gl = kit.el("div", "gl");
      for (const p of g3) gl.appendChild(this.tag(p.inst, "ground", { size: 40, box: "1x1", nofit: !b.canAdd(p.inst) }));
      gd.appendChild(gl);
      const d0 = nofit ? defOf(nofit.inst) || {} : null;
      gd.appendChild(kit.el("div", "txt", nofit ? `脚下 · ${d0.name} <b>放不下</b>（需 ${sizeOf(nofit.inst)} 格）${gr.length > 1 ? `<small>脚下共 ${gr.length} 件</small>` : ""}` : `脚下 · ${gr.length} 件<small>双击或拖进袋中拾取</small>`));
      return gd;
    });
    // 若身陨此地
    const rows = this.deathPreview();
    this.part("die", rows.map((x) => x.join(":")).join("|"), () => {
      const die = kit.el("div", "bv-die");
      const dh = kit.el("div", "hd");
      dh.appendChild(kit.seal("陨", { cls: "ink", size: 20 }));
      dh.appendChild(kit.el("span", "", "若身陨此地"));
      dh.appendChild(kit.q(COPY.lingzhiDeath));
      die.appendChild(dh);
      die.appendChild(kit.el("div", "ink-list", rows.map(([k, v]) => `<div class="ink-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")));
      return die;
    });
    // 详情浮签
    this.syncTip();
  }
  // 一段：签名没变就不动；变了就重建并原位替换（不存在的段按固定顺序插回）
  part(key, sig, build) {
    if (this.sig[key] === sig) return;
    this.sig[key] = sig;
    const old = this.sec[key], el = build() || null;
    this.sec[key] = el;
    if (old) el ? old.replaceWith(el) : old.remove();
    else if (el) {
      let next = this.keysEl;
      for (let i = PARTS.indexOf(key) + 1; i < PARTS.length; i++) if (this.sec[PARTS[i]]) { next = this.sec[PARTS[i]]; break; }
      this.strip.insertBefore(el, next);
    }
  }
  // 袋中格子：格位星点只在容量变化时重画；物品签按物品复用（数量 / 品级 / 鉴定变了才换新签），
  // 顺序与整页构建一致（:nth-child 决定的圆相笔形不变）
  syncGrid(b, selIt) {
    const cols = b.capacity <= 16 ? 4 : b.capacity <= 24 ? 6 : 8;
    const cell = cols === 4 ? 62 : cols === 6 ? 54 : 42, gap = 4;
    this.part("bag", `${cols}|${b.capacity}`, () => {
      const gp = kit.el("div", "grp bag", `<div class="hd">袋中<small>拖拽整理 · 右键丢弃 · 双击装备</small></div>`);
      const grid = (this.grid = kit.el("div", "bv-grid"));
      grid.dataset.drop = "bag";
      let h = "", n = 0;
      const capRows = Math.ceil(b.capacity / cols);
      for (let y = 0; y < capRows; y++) for (let x = 0; x < cols; x++) if (y * cols + x < b.capacity) (h += `<i class="cm" style="left:${x * (cell + gap)}px;top:${y * (cell + gap)}px"></i>`), n++;
      grid.innerHTML = h;
      this.nCm = n;
      this.toks = new Map();
      gp.appendChild(grid);
      return gp;
    });
    const grid = this.grid, { placed, rows } = packBag(b.items, cols, Math.max(1, Math.ceil(b.capacity / cols)));
    const css = `--cell:${cell}px;width:${cols * cell + (cols - 1) * gap}px;height:${rows * cell + (rows - 1) * gap}px`;
    if (grid._css !== css) grid.style.cssText = grid._css = css;
    const next = new Map();
    let node = grid.children[this.nCm] || null;
    for (const p of placed) {
      const it = p.it, k = sigOf(it);
      let t = this.toks.get(it);
      if (!t || t._sig !== k) (t = this.tag(it, "bag", { size: cell, gap })), (t._sig = k);
      const x = p.c * (cell + gap), y = p.r * (cell + gap);
      if (t._x !== x) t.style.left = (t._x = x) + "px";
      if (t._y !== y) t.style.top = (t._y = y) + "px";
      const on = selIt === it;
      if (t._sel !== on) t.classList.toggle("is-sel", (t._sel = on));
      next.set(it, t);
      if (t === node) node = node.nextSibling;
      else grid.insertBefore(t, node);
    }
    while (node) {
      const nx = node.nextSibling;
      node.remove();
      node = nx;
    }
    this.toks = next;
  }
  // 浮签：选中物或与它相关的状态（身上同位装备、能否放入、锦囊进度…）变了才重建；换了选中物才播进场动画
  syncTip() {
    const s = this.sel, r = this.run;
    let key = "";
    if (s) {
      const it = s.it, d = defOf(it) || {}, slot = d.slot || (d.gear && d.gear.slot), m = this.moving;
      key = [it.uid, s.where, sigOf(it), slot ? sigOf(r.profile.equip[slot]) + slotOpen(r.profile, slot) : "", r.bag.canAdd(it), r.pouch.canAdd(it), this.pouchOn(), m ? (m.it === it ? 2 : 1) : 0].join("|");
      // 残页提示随袋中同套残页数变化：把提示文字也算进签名（只在有选中物时算一次）
      const ph = it.identified !== !1 && pageHint(r.profile, it.id, [...r.bag.items, ...(r.keyItems || [])]);
      if (ph) key += "|" + ph.text;
    }
    if (key === this.tipSig) return;
    this.tipSig = key;
    const tip = s ? this.detail(s.it.uid !== this.tipUid) : null;
    this.tipUid = tip ? s.it.uid : null;
    if (this.tipEl) tip ? this.tipEl.replaceWith(tip) : this.tipEl.remove();
    else if (tip) this.dock.insertBefore(tip, this.warnEl);
    this.tipEl = tip;
  }
  // 一个物品签（带交互）
  tag(it, where, o = {}) {
    const t = itemTag(it, { ...o, sel: this.sel && this.sel.it === it });
    t._sel = !!(this.sel && this.sel.it === it);
    t.dataset.where = where;
    t.classList.add("hov");
    t.addEventListener("pointerdown", (e) => this.dragStart(e, it, where, t));
    t.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.justDragged) return;
      this.sel = { it, where };
      this.dirty();
    });
    t.addEventListener("dblclick", (e) => (e.stopPropagation(), this.quick(it, where)));
    t.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (where === "bag") this.dropItem(it);
    });
    return t;
  }
  where(it) {
    const r = this.run;
    if (r.bag.items.includes(it)) return "bag";
    if (r.pouch.items.includes(it)) return "pouch";
    if (r.keyItems.includes(it)) return "key";
    if (r.carried.includes(it) || Object.values(r.profile.equip).includes(it)) return "worn";
    if (r.pickups.list.some((p) => p.inst === it)) return "ground";
    return null;
  }
  detail(anim = !0) {
    const s = this.sel, r = this.run, b = r.bag, pouch = r.pouch;
    this.progTip = null;
    if (!s || this.where(s.it) !== s.where) return (this.sel = null);
    const it = s.it, d = defOf(it) || {}, q = it.rarity || 0, R = RARITY[q], unid = it.identified === !1;
    const tip = kit.el("section", "ink-paper bv-tip" + (anim ? " mk-in" : ""));
    tip.addEventListener("mousedown", (e) => e.stopPropagation());
    const top = kit.el("div", "top");
    top.appendChild(itemTag(it, { size: 64, box: "1x1", count: !1 }));
    const lv = d.cat === "gear" || d.cat === "artifact" ? ` · ${it.level || 1} 阶` : "";
    top.appendChild(kit.el("div", "", `<div class="nm" style="color:${QN[q]}">${unid ? "未鉴定的" : ""}${d.name || it.id}</div><div class="meta">${R.name} · ${catName(d.cat)}<br>占 ${sizeOf(it)} 格${it.n > 1 ? " · ×" + it.n : ""}${lv}</div>`));
    tip.appendChild(top);
    if (unid || d.desc) tip.appendChild(kit.el("p", "", unid ? "宝光内敛，只见其形。带回去，结算时当场揭晓。" : d.desc));
    const ph = !unid && pageHint(r.profile, it.id, [...b.items, ...(r.keyItems || [])]);
    if (ph) tip.appendChild(kit.el("p", "page-hint", ph.text));
    // 与身上装备对比
    const slot = d.slot || (d.gear && d.gear.slot);
    if (slot && !unid && s.where !== "worn") {
      const cur = r.profile.equip[slot];
      const a = sumMods(gearMods(it)), c = cur ? sumMods(gearMods(cur)) : {};
      const keys = [...new Set([...Object.keys(a), ...Object.keys(c)])].filter((k) => !k.startsWith("gx_") && STAT_NAME[k.split("|")[0]]).slice(0, 5);
      if (keys.length) {
        const cn = cur ? (defOf(cur) || {}).name : "空";
        tip.appendChild(kit.el("table", "bv-cmp", `<tr><th></th><th>此件</th><th>身上 · ${cn}</th><th>差</th></tr>` + keys.map((k) => {
          const [st, ty] = k.split("|"), x = a[k] || 0, y = c[k] || 0, dlt = x - y;
          return `<tr><td>${STAT_NAME[st]}</td><td>${fmt(x, st, ty)}</td><td class="o">${y ? fmt(y, st, ty) : "—"}</td><td class="${dlt > 0 ? "up" : dlt < 0 ? "down" : ""}">${dlt ? fmt(Math.abs(dlt), st, ty, !0) : "—"}</td></tr>`;
        }).join("")));
      }
    }
    if (!unid) for (const a of (it.affixes || []).filter((a) => a.stat === "special")) tip.appendChild(kit.el("div", "affix", `◆ ${weaponAffixText(a) ? "奇效 · " + weaponAffixText(a) : a.value}`));
    tip.appendChild(kit.el("div", "ink-list", `<div class="ink-row"><span class="k">估价</span><span class="v mk-gold">${valueOf(it).toLocaleString()}</span></div><div class="ink-row"><span class="k">所在</span><span class="v">${{ bag: "储物袋", pouch: "贴身锦囊", key: "护身格（身陨不失）", ground: "脚下", worn: "随身" }[s.where]}</span></div>`));
    const acts = kit.el("div", "acts");
    let note = "";
    if (s.where === "bag") {
      const locked = slot && !slotOpen(r.profile, slot);
      if (slot) acts.appendChild(kit.button("装备", () => this.equip(it), { primary: !0, small: !0, disabled: unid || locked, id: "equip" }));
      if (locked) note = slotLockText(slot);
      if (this.pouchOn()) {
        const okP = pouch.canAdd(it) && !this.moving;
        acts.appendChild(kit.button("入锦囊", () => this.toPouch(it), { small: !0, primary: !slot, disabled: !okP, id: "topouch" }));
        if (!pouch.canAdd(it)) note = sizeOf(it) > pouch.maxItemSize ? "锦囊只放 1 格的东西" : "锦囊已满";
      }
      acts.appendChild(kit.button("丢弃", () => this.dropItem(it), { small: !0, id: "drop" }));
      if (unid && slot) note = note || "未鉴定，不能佩戴";
    } else if (s.where === "pouch") acts.appendChild(kit.button("取出", () => this.fromPouch(it), { small: !0, id: "frompouch" }));
    else if (s.where === "ground") {
      acts.appendChild(kit.button("拾取", () => this.pick(it), { primary: !0, small: !0, disabled: !b.canAdd(it), id: "pick" }));
      if (!b.canAdd(it)) note = `放不下（需 ${sizeOf(it)} 格）`;
    } else if (s.where === "worn" && slot && Object.values(r.profile.equip).includes(it)) acts.appendChild(kit.button("卸下", () => this.unequip(slot), { small: !0, disabled: !b.canAdd(it), id: "unequip" }));
    if (note) acts.appendChild(kit.el("span", "note", note));
    if (acts.children.length) tip.appendChild(acts);
    if (this.moving && this.moving.it === it) {
      const pb = (this.progTip = kit.bar(this.moving.t, "xp thin"));
      pb.classList.add("prog");
      this.progV = null;
      tip.appendChild(pb);
    }
    kit.decorate(tip);
    return tip;
  }
  // ---------------- 动作 ----------------
  quick(it, where) {
    // 储物袋里双击丹药 / 符箓：当场服用或放进快捷格（run.useItem，流程组提供）
    if (where === "bag" && this.run && this.run.useItem && this.run.useItem(it)) return this.dirty();
    const d = defOf(it) || {};
    if (where === "bag" && (d.slot || (d.gear && d.gear.slot)) && it.identified !== !1) this.equip(it);
    else if (where === "ground") this.pick(it);
    else if (where === "pouch") this.fromPouch(it);
  }
  equip(it) {
    const r = this.run, P = r.profile, d = defOf(it) || {}, slot = d.slot || (d.gear && d.gear.slot);
    if (!slot || it.identified === !1 || !r.bag.items.includes(it)) return;
    if (!slotOpen(P, slot)) return kit.toast(slotLockText(slot), { kind: "warn" });
    const old = P.equip[slot];
    r.bag.remove(it.uid);
    P.equip[slot] = it;
    if (old && !r.bag.add(old)) {
      const p = r.pickups.drop(this.ctx.player.pos, old, 0.8);
      p.age = -1.5;
      kit.toast(`${(defOf(old) || {}).name} 放不下，落在脚下`, { kind: "warn" });
    }
    this.restat(slot);
    kit.toast(`佩上 ${d.name}`, { kind: "gold" });
    this.sel = { it, where: "worn" };
    r.emit("bag");
    this.dirty();
  }
  unequip(slot) {
    const r = this.run, P = r.profile, it = P.equip[slot];
    if (!it || !r.bag.canAdd(it)) return kit.toast("储物袋放不下", { kind: "warn" });
    P.equip[slot] = null;
    r.bag.add(it);
    this.restat(slot);
    this.sel = { it, where: "bag" };
    r.emit("bag");
    this.dirty();
  }
  restat(slot) {
    const ctx = this.ctx;
    if (slot === "artifact" && ctx.applyProfileStats) ctx.applyProfileStats(this.run.profile);
    else this.run.applyEquip();
  }
  async dropItem(it) {
    const r = this.run;
    if (!r.bag.items.includes(it)) return;
    if ((it.rarity || 0) >= 2 && !(await kit.confirm("丢弃", `丢下 ${RARITY[it.rarity].name} ${(defOf(it) || {}).name}？它会留在脚下，走近按 F 可取回。`, { ok: "丢下" }))) return;
    r.dropFromBag(it.uid);
    if (this.sel && this.sel.it === it) this.sel = null;
    this.dirty();
  }
  pick(it) {
    const r = this.run, pk = this.ground().find((g) => g.inst === it);
    if (!pk) return;
    if (!r.bag.add(it)) return kit.toast(`放不下（需 ${sizeOf(it)} 格）`, { kind: "warn" });
    r.pickups.remove(pk);
    r.onPickup(it);
    this.sel = null;
    this.dirty();
  }
  fromPouch(it) {
    const r = this.run;
    if (!r.bag.canAdd(it)) return kit.toast("储物袋放不下", { kind: "warn" });
    r.pouch.remove(it.uid);
    r.bag.add(it);
    this.sel = null;
    this.dirty();
  }
  // 放入锦囊：1 秒（期间不能再放别的）
  toPouch(it) {
    if (this.moving || !this.run.pouch.canAdd(it)) return;
    this.moving = { it, t: 0 };
    this.dirty();
  }
  // ---------------- 拖拽 ----------------
  dragStart(e, it, where, el) {
    if (e.button !== 0 || where === "key") return;
    this.drag = { it, where, el, x0: e.clientX, y0: e.clientY, on: !1 };
    addEventListener("pointermove", this.onMove);
    addEventListener("pointerup", this.onUp);
  }
  dragMove(e) {
    const D = this.drag;
    if (!D) return;
    if (!D.on) {
      if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 5) return;
      D.on = !0;
      D.el.classList.add("is-drag");
      D.ghost = itemTag(D.it, { size: 48, box: "1x1", count: !1 });
      D.ghost.classList.add("mk-bv-ghost");
      D.ghost.style.left = D.ghost.style.top = "0px";
      document.body.appendChild(D.ghost);
    }
    // 只改 transform（等价于 left/top = 指针位置 + 原来的 translate(-50%,-50%) scale），拖动时不触发布局
    D.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) scale(var(--mk-scale, 1))`;
    const t = this.dropTarget(e);
    if (D.hl && D.hl !== t.el) D.hl.classList.remove("drop-ok", "drop-before");
    if (t.el && t.ok) t.el.classList.add(t.before ? "drop-before" : "drop-ok");
    D.hl = t.el;
  }
  dropTarget(e) {
    const D = this.drag, el = document.elementFromPoint(e.clientX, e.clientY);
    const strip = this.strip, tip = this.tipEl;
    if (!el || (!strip.contains(el) && !(tip && tip.contains(el)))) return { kind: "out", ok: D.where === "bag" };
    const tok = el.closest(".bv-grid > .mk-tok");
    if (tok && D.where === "bag") return { kind: "before", el: tok, before: !0, ok: tok._inst !== D.it };
    const z = el.closest("[data-drop]");
    if (!z) return { kind: "none" };
    const k = z.dataset.drop, d = defOf(D.it) || {};
    if (k === "bag") return { kind: "bag", el: z, ok: D.where === "bag" || this.run.bag.canAdd(D.it) };
    if (k === "pouch") return { kind: "pouch", el: z, ok: D.where === "bag" && this.run.pouch.canAdd(D.it) && !this.moving };
    if (k.startsWith("equip:")) {
      const lock = !slotOpen(this.run.profile, k.slice(6));
      return { kind: "equip", el: z, lock, slot: k.slice(6), ok: !lock && D.where === "bag" && (d.slot || (d.gear && d.gear.slot)) === k.slice(6) && D.it.identified !== !1 };
    }
    return { kind: "none" };
  }
  dragEnd(e) {
    const D = this.drag;
    removeEventListener("pointermove", this.onMove);
    removeEventListener("pointerup", this.onUp);
    if (!D) return;
    const t = D.on ? this.dropTarget(e) : null;
    this.cancelDrag();
    if (!t) return;
    this.justDragged = !0;
    setTimeout(() => (this.justDragged = !1), 0);
    const r = this.run, it = D.it;
    if (!t.ok) {
      if (t.kind === "equip" && t.lock && D.where === "bag") kit.toast(slotLockText(t.slot), { kind: "warn" });
      return this.pending && this.dirty();
    }
    if (t.kind === "out") return this.dropItem(it);
    if (t.kind === "before") {
      const L = r.bag.items, i = L.indexOf(it);
      L.splice(i, 1);
      L.splice(L.indexOf(t.el._inst), 0, it);
      return this.dirty();
    }
    if (t.kind === "bag") {
      if (D.where === "bag") {
        const L = r.bag.items;
        L.splice(L.indexOf(it), 1);
        L.push(it);
        return this.dirty();
      }
      if (D.where === "pouch") return this.fromPouch(it);
      if (D.where === "ground") return this.pick(it);
      if (D.where === "worn") {
        const slot = SLOTS.map((s) => s[0]).find((s) => r.profile.equip[s] === it);
        if (slot) return this.unequip(slot);
      }
      return this.dirty();
    }
    if (t.kind === "pouch") return this.toPouch(it);
    if (t.kind === "equip") return this.equip(it);
  }
  cancelDrag() {
    const D = this.drag;
    if (!D) return;
    this.drag = null;
    if (D.ghost) D.ghost.remove();
    if (D.el) D.el.classList.remove("is-drag");
    if (D.hl) D.hl.classList.remove("drop-ok", "drop-before");
    if (this.pending) setTimeout(() => this.dirty(), 0);
  }
  // ---------------- 每帧 ----------------
  update(dt) {
    const m = this.moving;
    if (m) {
      m.t += dt;
      // 进度条：引用在建条时缓存（不每帧 querySelectorAll），值变了才写
      const v = Math.min(1, m.t).toFixed(3);
      if (this.open && v !== this.progV) {
        this.progV = v;
        if (this.progSafe) this.progSafe.style.setProperty("--v", v);
        if (this.progTip) this.progTip.style.setProperty("--v", v);
      }
      if (m.t >= 1) {
        this.moving = null;
        const r = this.run;
        if (r.bag.items.includes(m.it) && r.pouch.canAdd(m.it)) {
          r.bag.remove(m.it.uid);
          r.pouch.add(m.it);
          kit.toast(`${(defOf(m.it) || {}).name} 已收进贴身锦囊`, { kind: "gold" });
        }
        this.sel = null;
        this.dirty();
      }
    }
    if (!this.open) return;
    // 脚下的东西随走动变化
    if ((this.groundT -= dt) <= 0) {
      this.groundT = 0.5;
      const n = this.ground().length;
      if (n !== this.lastGround) (this.lastGround = n), this.dirty();
    }
    // 受击：浮签收起、纸笺淡一下
    const h = this.ctx.player.entity;
    if (h) {
      if (this.lastHp != null && h.hp < this.lastHp - 0.5) this.hitT = 0.6;
      this.lastHp = h.hp;
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.root && this.root.classList.toggle("hit", this.hitT > 0);
    }
    if ((this.warnT -= dt) <= 0) {
      this.warnT = 0.25;
      this.updateWarn();
    }
  }
  // 敌近：仇恨中、约 6 丈内最近的一只
  nearEnemy() {
    const E = this.ctx.enemies, p = this.ctx.player.pos;
    if (!E || !E.list) return null;
    let best = null, bd = WARN_R;
    for (const e of E.list) {
      if (!e.alive || !(e.aggro || e.state === "chase")) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) (bd = d), (best = e);
    }
    return best && { e: best, d: bd };
  }
  updateWarn() {
    const w = this.warnEl;
    if (!w) return;
    const n = this.nearEnemy();
    if (!n) {
      if (this.lastWarn) (w.className = "bv-warn"), (this.lastWarn = "");
      return;
    }
    const p = this.ctx.player.pos, e = n.e;
    const a = Math.atan2(e.pos.z - p.z, e.pos.x - p.x); // 地图 +x 东、+z 南
    const dir = DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    const zhang = Math.max(1, Math.round(n.d / 3.3));
    const name = (e.def && e.def.name) || (e.entity && e.entity.name) || "妖物";
    // 屏幕方向：箭头指向妖物在屏幕上的方位
    let ang = 180;
    const cam = this.ctx.camera;
    if (cam && e.pos.clone) {
      const s0 = p.clone().project(cam), s1 = e.pos.clone().project(cam);
      ang = (Math.atan2(-(s1.y - s0.y), s1.x - s0.x) * 180) / Math.PI;
    }
    const key = `${name}|${dir}|${zhang}|${Math.round(ang / 15)}|${n.d < 8}`;
    if (key === this.lastWarn) return;
    this.lastWarn = key;
    w.className = "bv-warn on" + (n.d < 8 ? " close" : "");
    w.innerHTML = `<span class="ink-seal">妖</span><span>${name} · ${dir} ${zhang} 丈</span><i class="arr" style="--a:${ang.toFixed(0)}deg"></i>`;
  }
  dispose() {
    removeEventListener("keydown", this.onKey);
    this.cancelDrag();
    removeEventListener("pointermove", this.onMove);
    removeEventListener("pointerup", this.onUp);
    document.body.classList.remove("mk-bag-open");
    for (const off of this.offs) off();
    kit.clear("bag");
    kit.show("bag", !1);
  }
}

// 按物品顺序首次适配摆放；放不下时退回"大件优先"；仍放不下就多给一行（只是显示，不改容量）
export function packBag(items, cols, rows) {
  const W = (it) => (sizeOf(it) >= 2 ? 2 : 1), H = (it) => (sizeOf(it) >= 4 ? 2 : 1);
  const tryPack = (list, R) => {
    const occ = Array.from({ length: R }, () => Array(cols).fill(0)), out = [];
    for (const it of list) {
      const w = Math.min(cols, W(it)), h = H(it);
      let done = !1;
      for (let r = 0; r + h <= R && !done; r++)
        for (let c = 0; c + w <= cols && !done; c++) {
          let ok = !0;
          for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) if (occ[r + y][c + x]) ok = !1;
          if (!ok) continue;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) occ[r + y][c + x] = 1;
          out.push({ it, c, r });
          done = !0;
        }
      if (!done) return null;
    }
    return out;
  };
  let placed = tryPack(items, rows);
  if (!placed) placed = tryPack([...items].sort((a, b) => sizeOf(b) - sizeOf(a)), rows);
  let R = rows;
  while (!placed && R < rows + 6) placed = tryPack([...items].sort((a, b) => sizeOf(b) - sizeOf(a)), ++R);
  return { placed: placed || [], rows: R };
}
function sumMods(list) {
  const o = {};
  for (const m of list || []) {
    if (typeof m.value !== "number") continue;
    const k = m.stat + "|" + (m.type || "flat");
    o[k] = (o[k] || 0) + m.value;
  }
  return o;
}
function fmt(v, st, ty, abs) {
  const pct = ty === "pct" || ["crit", "cdr"].includes(st) || (Math.abs(v) < 1 && v !== 0);
  const s = pct ? (v * 100).toFixed(1).replace(/\.0$/, "") + "%" : String(Math.round(v * 10) / 10);
  return abs ? s : (v >= 0 ? "+" : "") + s;
}
function catName(c) {
  return { stone: "灵石", herb: "灵草", ore: "矿石", beast: "妖兽材料", core: "妖丹", treasure: "灵物", gear: "法器", artifact: "法宝", scroll: "功法残卷", recipe: "丹方器方", pill: "丹药", talisman: "符箓", quest: "剧情" }[c] || "杂物";
}
