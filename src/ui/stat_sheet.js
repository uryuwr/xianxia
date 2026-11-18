// 属性卷：整装册按需弹层内复用；打开时创建，关闭即 dispose，不在隐藏页持续计算。
//   每项一行展示数值与来源，点行展开明细；宿主可隐藏分段条，仍沿用同一 statBreakdown。
//   点一行 → 卷右侧浮出明细纸签（逐条来源 + 算式）。数据：src/game/stat_breakdown.js statBreakdown。
//   用法：const ss = new StatSheet(P, { plan: () => 预案, onMode }); host.appendChild(ss.el); ss.render()（数据变了再调，不每帧）
//   性能（docs/性能优化_v1.md §7）：只在 render() 时整块重建；打开明细时读一次 offsetTop；无动画循环。
import { kit } from "./kit.js";
import { pushEsc } from "./esc.js";
import { realmName, xpNeed } from "../game/progression.js";
import { statBreakdown, SRC_GROUPS } from "../game/stat_breakdown.js";

const CSS = `
.mk-ss { box-sizing: border-box; padding: 16px 20px 12px 24px; }
.mk-ss .rh { display: flex; align-items: center; gap: 10px; }
.mk-ss .rn { font: 28px var(--f-display); color: var(--ink); letter-spacing: .12em; }
.mk-ss .rx { display: flex; gap: 8px; align-items: center; font: 11px var(--f-ui); color: var(--ink-dan); margin-top: 2px; }
.mk-ss .xp { display: block; width: 140px; height: 10px; -webkit-mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; background: linear-gradient(90deg, var(--nijin) var(--p), rgba(21,24,27,.1) var(--p)); }
.mk-ss .md { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font: 11px var(--f-ui); color: var(--ink-dan); }
.mk-ss .mode a { cursor: pointer; padding: 0 5px 3px; position: relative; font: 12px var(--f-kai); }
.mk-ss .mode a.on { color: var(--ink); }
.mk-ss .mode a.on::after { content: ""; position: absolute; left: 2px; right: 2px; bottom: -2px; height: 5px; background: var(--zhu); -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.mk-ss .gh { display: flex; align-items: baseline; gap: 8px; margin: 4px 0 0; font: 13px var(--f-display); color: var(--ink-zhong); letter-spacing: .3em; }
.mk-ss .gh::after { content: ""; flex: 1; height: 5px; background: var(--ink-mist); -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.mk-ss .st { display: flex; align-items: center; gap: 8px; padding: 1px 4px; cursor: pointer; position: relative; border-radius: 2px; }
.mk-ss .st:hover { background: rgba(21,24,27,.04); }
.mk-ss .st.on { background: rgba(184,41,26,.06); }
.mk-ss .st.on::before { content: ""; position: absolute; left: -10px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--zhu); }
.mk-ss .st .n { width: 4.2em; font: 14px var(--f-kai); color: var(--ink-zhong); white-space: nowrap; }
.mk-ss .st .v { min-width: 3.4em; text-align: right; font: 17px/1.2 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mk-ss .st .v small { font: 11px var(--f-ui); color: var(--ink-dan); margin-left: 1px; }
.mk-ss .st .v.tmp { color: #8a6a22; }
.mk-ss .bar { display: inline-flex; width: 62px; height: 9px; flex: none; -webkit-mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar) 0 0 / 100% 100% no-repeat; background: rgba(21,24,27,.08); }
.mk-ss .bar i { display: block; height: 100%; }
.mk-ss .bar i.off { background: repeating-linear-gradient(90deg, rgba(184,146,58,.55) 0 3px, transparent 3px 6px); }
.mk-ss .bar.none { background: transparent; }
.mk-ss .ss { display: flex; gap: 2px; margin-left: auto; }
.mk-ss-src { display: inline-flex; width: 15px; height: 15px; align-items: center; justify-content: center; flex: none; font: 10px/1 var(--f-display); font-style: normal; color: var(--paper-hi); -webkit-mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; }
.mk-ss-src.g0 { background: rgba(21,24,27,.82); } .mk-ss-src.g1 { background: rgba(21,24,27,.5); } .mk-ss-src.g2 { background: rgba(21,24,27,.3); } .mk-ss-src.g3 { background: var(--nijin); }
.mk-ss .lg { display: flex; gap: 9px; margin-top: 6px; font: 11px var(--f-ui); color: var(--ink-dan); }
.mk-ss .lg span { display: inline-flex; gap: 3px; align-items: center; }
.mk-ss-pop { position: absolute; z-index: 20; width: 300px; padding: 14px 18px 12px; font: 13px/1.6 var(--f-kai); color: var(--ink-zhong); background: var(--paper-hi); box-shadow: 0 4px 12px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; transform: rotate(-.5deg); }
.mk-ss-pop .dh { display: flex; align-items: baseline; gap: 10px; }
.mk-ss-pop .dn { font: 22px var(--f-display); color: var(--ink); letter-spacing: .1em; }
.mk-ss-pop .dv { font: 26px var(--f-display); color: var(--ink); }
.mk-ss-pop .dv small { font: 12px var(--f-ui); color: var(--ink-dan); }
.mk-ss-pop .dm { margin-left: auto; font: 11px var(--f-ui); color: var(--ink-dan); }
.mk-ss-pop .dt { font: 12px/1.5 var(--f-kai); color: var(--ink-dan); }
.mk-ss-pop .dl { margin-top: 6px; border-top: 1px solid rgba(21,24,27,.1); padding-top: 4px; }
.mk-ss-pop .dr { display: flex; align-items: center; gap: 7px; padding: 2px 0; font-size: 12.5px; }
.mk-ss-pop .dr .l { flex: 1; min-width: 0; color: var(--ink-nong); }
.mk-ss-pop .dr .l em { font: 10.5px var(--f-ui); font-style: normal; color: #8a6a22; margin-left: 4px; }
.mk-ss-pop .dr b { font: 400 15px var(--f-display); color: var(--ink); white-space: nowrap; }
.mk-ss-pop .dr b small { font: 10.5px var(--f-ui); color: var(--ink-dan); }
.mk-ss-pop .dr.off { opacity: .55; }
.mk-ss-pop .df { margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(21,24,27,.1); font: 11px/1.6 var(--f-ui); color: var(--ink-dan); }
`;

const pctF = (v) => Math.round(v * 100) + "%";
const sgn = (v) => (v < 0 ? "−" : "+");
// 属性行（名称同 mirror_v2.js STATS / cave data.js STAT_NAME）
export const STAT_GROUPS = [
  { g: "生死", rows: [
    { k: "hp", n: "气血", i: 1 }, { k: "mp", n: "真气", i: 1 }, { k: "def", n: "防御", i: 1 },
    { k: "vuln", n: "受伤", f: (v) => (v ? sgn(v) + pctF(Math.abs(v)) : "—"), opt: 1, pctD: 1 },
    { k: "hpRegen", n: "回血", u: "/秒", f: (v) => v.toFixed(1) },
  ] },
  { g: "攻伐", rows: [
    { k: "atk", n: "攻击", i: 1, tip: "未计：阵法、神龛附灵、满势等局内条件加成" }, { k: "spell", n: "法力", i: 1, tip: "未计：阵法、神龛附灵等局内条件加成" },
    { k: "crit", n: "会心", f: pctF, pctD: 1 }, { k: "critDmg", n: "会心伤害", f: pctF, pctD: 1 },
    { k: "aspd", n: "攻速", f: (v) => v.toFixed(2) }, { k: "cdr", n: "冷却缩减", f: pctF, opt: 1, pctD: 1 },
    { k: "chargeDmg", n: "蓄势斩", f: (v) => "+" + pctF(v), opt: 1, pctD: 1 },
  ] },
  { g: "身法", rows: [
    { k: "move", n: "身法", f: (v) => v.toFixed(1) }, { k: "dashMax", n: "闪身", u: "次", i: 1 },
    { k: "dashCd", n: "闪身冷却", u: "秒", f: (v) => v.toFixed(2), lower: 1 },
  ] },
  { g: "灵觉", rows: [{ k: "sense", n: "神识", i: 1, tip: "探查时长 ×100/(100+神识)；≥40 墨封下隐约见宝光" }] },
];
const ROWS = Object.fromEntries(STAT_GROUPS.flatMap((g) => g.rows).map((r) => [r.k, r]));
const GK = ["境", "器", "心", "局"];
const fmt = (r, v) => (r.f ? r.f(v) : r.i ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
const fmtD = (r, d) => sgn(d) + (r.pctD ? pctF(Math.abs(d)) : r.f && !r.i ? r.f(Math.abs(d)) : String(Math.round(Math.abs(d) * 10) / 10));
const src = (g) => `<i class="mk-ss-src g${GK.indexOf(g)}">${g}</i>`;

export class StatSheet {
  constructor(P, o = {}) {
    kit.css("statsheet", CSS);
    this.P = P;
    this.plan = o.plan || (() => ({}));
    this.mode = o.mode || "run";
    this.sel = null;
    const pn = kit.panel("", { cls: "mk-ss" });
    this.el = pn.root;
    this.body = pn.body;
    this.el.addEventListener("click", (e) => this.click(e));
    this.el.addEventListener("keydown", (e) => {
      if ((e.code === "Enter" || e.code === "Space") && e.target.matches("[data-stat],[data-mode]")) {
        e.preventDefault();
        e.target.click();
      }
    });
  }
  dispose() {
    this.offEsc?.();
    this.offEsc = null;
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = 0;
    this.pop?.remove();
    this.pop = null;
    this.el.remove();
  }
  data() {
    return statBreakdown(this.P, { plan: this.plan(), mode: this.mode });
  }
  render() {
    const P = this.P, D = (this.D = this.data()), need = xpNeed(P);
    const p = need > 0 && isFinite(need) ? Math.min(100, Math.round(((P.xp || 0) / need) * 100)) : 100;
    const nm = realmName(P);
    let h = `<div class="rh"><span class="rn">${nm}</span><span class="ink-seal" style="--s:28px">${nm.slice(-2, -1)}</span></div>
      <div class="rx"><span class="xp" style="--p:${p}%"></span><span>修为 ${P.xp || 0} / ${isFinite(need) ? need : "—"}</span></div>
      <div class="md"><span>点任一项看来源</span><span class="mode"><a role="button" tabindex="0" data-mode="cave" class="${this.mode === "cave" ? "on" : ""}">洞府中</a><a role="button" tabindex="0" data-mode="run" class="${this.mode === "run" ? "on" : ""}">按出行计</a></span></div>`;
    for (const g of STAT_GROUPS) {
      const rows = g.rows.filter((r) => D[r.k] && (!r.opt || D[r.k].parts.some((m) => m.value !== 0)));
      if (!rows.length) continue;
      h += `<div class="gh">${g.g}</div>`;
      for (const r of rows) {
        const s = D[r.k], tmp = s.parts.some((m) => m.temp && !m.off);
        const gs = [...new Set(s.parts.map((m) => m.grp))].sort((a, b) => GK.indexOf(a) - GK.indexOf(b));
        h += `<div class="st ${this.sel === r.k ? "on" : ""}" data-stat="${r.k}" role="button" tabindex="0" aria-expanded="${this.sel === r.k}"><span class="n">${r.n}</span><span class="v ${tmp ? "tmp" : ""}">${fmt(r, s.final)}${r.u ? `<small>${r.u}</small>` : ""}</span>${this.bar(r, s)}<span class="ss">${gs.map(src).join("")}</span></div>`;
      }
    }
    h += `<div class="lg">${GK.map((g) => `<span>${src(g)}${SRC_GROUPS[g]}</span>`).join("")}</div>`;
    this.offEsc?.();
    this.offEsc = null;
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = 0;
    if (this.pop) this.pop.remove();
    this.body.innerHTML = h;
    this.pop = null;
    if (this.sel) this.openPop(this.sel);
  }
  // 一笔分段条：宽度 ∝ 各类来源贡献的绝对值
  bar(r, s) {
    if (r.lower) return `<span class="bar none"></span>`;
    const by = { 境: 0, 器: 0, 心: 0, 局: 0 };
    let off = 0;
    for (const m of s.parts) {
      const v = Math.abs(m.type === "base" ? m.value : m.c);
      if (m.off) off += v;
      else by[m.grp] += v;
    }
    const tot = GK.reduce((a, g) => a + by[g], 0) + off || 1;
    const C = { 境: "rgba(21,24,27,.82)", 器: "rgba(21,24,27,.48)", 心: "rgba(21,24,27,.24)", 局: "var(--nijin)" };
    return `<span class="bar" title="分段按各来源贡献的绝对值显示；点开查看增减明细">${GK.filter((g) => by[g] > 0).map((g) => `<i title="${SRC_GROUPS[g]} · 贡献绝对值 ${Math.round(by[g] * 100) / 100}" style="flex:${(by[g] / tot).toFixed(3)};background:${C[g]}"></i>`).join("")}${off ? `<i class="off" title="本局加成 · 当前口径不计" style="flex:${(off / tot).toFixed(3)}"></i>` : ""}</span>`;
  }
  detailHTML(k) {
    const r = ROWS[k], s = this.D[k];
    const rows = s.parts.map((m) => {
      const v = m.cdr ? `−${pctF(m.value)} <small>（${fmtD(r, m.c)}）</small>` : m.type === "pct" ? `${sgn(m.value)}${pctF(Math.abs(m.value))} <small>（${fmtD(r, m.c)}）</small>` : m.type === "base" ? fmt(r, m.value) : fmtD(r, m.c);
      return `<div class="dr ${m.off ? "off" : ""}">${src(m.grp)}<span class="l">${m.label}${m.off ? "<em>出行时生效</em>" : ""}</span><b>${v}</b></div>`;
    }).join("");
    const f = (v) => (r.f && !r.i ? r.f(v) : String(Math.round(v * 10) / 10));
    const formula = k === "vuln" ? "同一乘区相加" : k === "dashCd" ? `${f(s.base + s.flat)} ×（1 − ${pctF(s.cdr || 0)}）` : s.pct ? `（${f(s.base)} ${fmtD(r, s.flat)}）×（1 ${sgn(s.pct)} ${pctF(Math.abs(s.pct))}）` : s.flat ? `${f(s.base)} ${fmtD(r, s.flat)}` : f(s.base);
    return `<div class="dh"><span class="dn">${r.n}</span><span class="dv">${fmt(r, s.final)}${r.u ? `<small>${r.u}</small>` : ""}</span><span class="dm">${this.mode === "run" ? "按出行计" : "洞府中"}</span></div>
      ${r.tip && k === "sense" ? `<div class="dt">${r.tip}</div>` : ""}
      <div class="dl">${rows}</div><div class="df">${formula}${s.more !== 1 ? ` × ${Math.round(s.more * 1000) / 1000}（独立乘区）` : ""}${r.tip && k !== "sense" ? "<br>" + r.tip : ""}</div>`;
  }
  openPop(k) {
    const row = this.body.querySelector(`[data-stat="${k}"]`);
    if (!row || !this.D[k]) return (this.sel = null);
    const pop = (this.pop = kit.el("div", "mk-ss-pop", this.detailHTML(k)));
    pop.dataset.pop = k;
    this.el.appendChild(pop);
    const close = () => { this.sel = null; this.render(); this.body.querySelector(`[data-stat="${k}"]`)?.focus(); };
    pop.appendChild(kit.button("收起明细", close, { small: true, id: "stat-detail-close" }));
    this.offEsc = pushEsc(close, { el: pop });
    // 宿主可能先 render 再挂载；只在这一轮挂载后定位一次，不做逐帧布局查询。
    pop.style.left = "calc(100% + 6px)";
    const place = () => {
      this.layoutFrame = 0;
      if (this.pop !== pop || !this.el.isConnected) return;
      const top = row.offsetTop + this.body.offsetTop, h = pop.offsetHeight, H = this.el.offsetHeight;
      pop.style.top = Math.max(0, Math.min(top - 14, H - h)) + "px";
    };
    if (this.el.isConnected) place();
    else this.layoutFrame = requestAnimationFrame(place);
  }
  click(e) {
    const m = e.target.closest("[data-mode]");
    if (m) { if (this.mode !== m.dataset.mode) { this.mode = m.dataset.mode; this.render(); } return; }
    const st = e.target.closest("[data-stat]");
    if (st) {
      this.sel = this.sel === st.dataset.stat ? null : st.dataset.stat;
      return this.render();
    }
    if (this.sel && !e.target.closest(".mk-ss-pop")) (this.sel = null), this.render();
  }
}
