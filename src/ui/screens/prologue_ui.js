// 序章界面（模块 A；docs/review/level/序章设计_v2.md §5）：
//   标题条（小节盖印淡入 → 缩成常驻小字）、右侧目标卷轴（可选标注、岔路两行、进度点）、指向下一目标的墨箭（4 米内隐去）、
//   墨笔对白条（提示 / 林墨心声两种样式，按键显示为键帽，同时一条、排队）、完成反馈（朱笔勾掉、金字、小节盖章）、
//   特殊瞬间（完美闪避、破盾、藤蔓松开）、序章技能栏只显示教过的格子。
// 另：行囊里有五行符时在技能栏末尾挂一个"3 · 符"格（所有出行局都有）；序章拿到金符后它闪金框，直到第一次使用。
import * as THREE from "three";
import { kit } from "../kit.js";
import { defOf } from "../../core/items.js";

const CSS = `
.mk-layer-prologue, .mk-layer-prologue * { pointer-events: none; }
.pro-big { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; opacity: 0; }
.pro-big .t { font: 400 46px var(--f-splash); color: var(--ink); text-shadow: 0 0 18px rgba(245,240,227,.95), 0 0 6px rgba(245,240,227,.9); white-space: nowrap; }
.pro-big.on { animation: proBig 2.6s var(--ease-ink) both; }
@keyframes proBig { 0% { opacity: 0; transform: translateX(-50%) scale(1.25); } 14% { opacity: 1; transform: translateX(-50%) scale(1); } 75% { opacity: 1; transform: translateX(-50%) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(.8); } }
.pro-small { position: absolute; left: 28px; top: 106px; font: 400 20px var(--f-display); color: var(--ink-nong); letter-spacing: .1em; text-shadow: 0 0 6px var(--paper-hi), 0 0 3px var(--paper-hi); transition: opacity .4s; }
.pro-scroll { position: absolute; right: 24px; top: 238px; width: 220px; }
.pro-scroll .ink-paper { padding: 14px 18px 14px 28px; }
.pro-scroll .hd { font: 13px var(--f-ui); color: var(--ink-dan); letter-spacing: .1em; margin-bottom: 4px; }
.pro-scroll .g { position: relative; font: 17px/1.55 var(--f-display); color: var(--ink); margin: 3px 0; }
.pro-scroll .g.opt { color: var(--ink-zhong); font-size: 15px; }
.pro-scroll .g .br { display: block; font: 14px var(--f-kai); color: var(--ink-zhong); }
.pro-scroll .g::after { content: ""; position: absolute; left: -4px; right: -4px; top: 46%; height: 7px; background: var(--zhu); transform: scaleX(0); transform-origin: left;
  -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; transition: transform .45s var(--ease-ink); }
.pro-scroll .g.struck::after { transform: scaleX(1); }
.pro-scroll .g.struck { color: var(--ink-dan); transition: color .4s .2s; }
.pro-scroll .g.s-done { color: var(--ink-dan); }
.pro-scroll .g.s-done::after { transform: scaleX(1); transition: none; }
.pro-scroll .g.s-early { color: var(--ink-dan); }
.pro-scroll .g.s-early::before, .pro-scroll .g.s-done.was-early::before { content: "✓"; position: absolute; left: -16px; top: 0; font: 15px var(--f-ui); color: var(--shilv); }
.pro-scroll .g.s-cur { color: var(--ink); }
.pro-scroll .g.s-cur::before { content: ""; position: absolute; left: -13px; top: .62em; width: 7px; height: 7px; border-radius: 50%; background: var(--zhu); }
.pro-scroll .g.s-next { color: var(--ink-qing); font-size: 15px; }
.pro-scroll .g.s-void { color: var(--ink-qing); font-size: 14px; text-decoration: line-through; }
.pro-scroll .g.tick { animation: proTick .5s var(--ease-ink) both; }
@keyframes proTick { 0% { transform: translateX(-4px); opacity: .4; } 100% { transform: none; opacity: 1; } }
.pro-float.early { font-size: 17px; color: var(--shilv); }
.pro-scroll .dots { margin-top: 8px; font: 13px var(--f-ui); letter-spacing: .25em; color: var(--ink-zhong); }
.pro-scroll .dots b { color: var(--zhu); font-weight: 400; }
.pro-float { position: absolute; right: 24px; top: 210px; width: 220px; text-align: center; font: 400 22px var(--f-display); color: #9a7526; text-shadow: 0 0 8px var(--paper-hi), 0 0 3px var(--paper-hi); opacity: 0; }
.pro-float.on { animation: proFloat 1.6s ease-out both; }
@keyframes proFloat { 0% { opacity: 0; transform: translateY(10px); } 15% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-16px); } }
.pro-arrow { position: absolute; left: 0; top: 0; width: 64px; height: 18px; margin: -9px 0 0 -32px; opacity: .85; display: none; }
.pro-arrow.on { display: block; }
.pro-arrow i { position: absolute; left: 0; right: 14px; top: 3px; height: 12px; background: var(--ink-nong); -webkit-mask: var(--ink-stroke-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-1) 0 0 / 100% 100% no-repeat; }
.pro-arrow b { position: absolute; right: 0; top: 0; width: 0; height: 0; border-left: 18px solid var(--ink-nong); border-top: 9px solid transparent; border-bottom: 9px solid transparent; }
.pro-say { position: absolute; left: 50%; bottom: 126px; transform: translateX(-50%); max-width: 720px; text-align: center; opacity: 0; transition: opacity .35s; }
.pro-say.on { opacity: 1; }
.pro-say .hint { display: inline-block; padding: 9px 26px 11px; font: 18px/1.6 var(--f-kai); color: var(--ink); background: radial-gradient(ellipse, rgba(245,240,227,.95) 55%, rgba(245,240,227,0) 78%); }
.pro-say .say { display: inline-block; padding: 8px 26px 10px; font: italic 19px/1.6 var(--f-kai); color: var(--paper-hi); position: relative; isolation: isolate; }
.pro-say .say::before { content: ""; position: absolute; inset: 0 -12px; z-index: -1; background: rgba(21,24,27,.72); -webkit-mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band) 0 0 / 100% 100% no-repeat; }
.pro-say kbd { display: inline-block; min-width: 1.5em; padding: 0 6px; margin: 0 3px; font: 700 14px var(--f-ui); line-height: 22px; color: var(--ink); background: #f7f2e6; border-radius: 4px; box-shadow: 0 0 0 1px rgba(21,24,27,.45), 0 2px 0 rgba(21,24,27,.45); vertical-align: 2px; }
.pro-stamp { position: absolute; left: 50%; top: 82px; transform: translateX(-50%); } /* 与小节标题同一位置，先后出现 */
.pro-special { position: absolute; left: 50%; top: 61%; transform: translateX(-50%); font: 400 40px var(--f-splash); color: #9a7526; text-shadow: 0 0 14px var(--paper-hi), 0 0 4px var(--paper-hi); opacity: 0; white-space: nowrap; }
.pro-special.on { animation: proFloat 1.4s ease-out both; }
.pro-special.shield { color: var(--zhu); }
.jx-slot.mk-fu3.flash::after { background: var(--nijin) !important; opacity: 1 !important; animation: proFlash 1s ease-in-out infinite; }
@keyframes proFlash { 0%, 100% { filter: none; } 50% { filter: drop-shadow(0 0 6px rgba(217,180,94,.95)); } }
`;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// 提示里的按键换成键帽
export function keycaps(t) {
  return String(t)
    .replace(/WASD|Tab|空格|左键|右键/g, (k) => `<kbd>${k}</kbd>`)
    .replace(/(^|[^A-Za-z])F(?=[^A-Za-z0-9]|$)/g, "$1<kbd>F</kbd>")
    .replace(/按\s*([123])(?![0-9])/g, "按 <kbd>$1</kbd>");
}

export class PrologueUI {
  constructor(ctx, run, flow) {
    kit.css("prologue", CSS);
    this.ctx = ctx;
    this.run = run;
    this.flow = flow;
    this.pro = run.pro || null;
    this.L = kit.layer("prologue", 23);
    kit.clear("prologue");
    kit.show("prologue", !0);
    this.queue = [];
    this.cur = null;
    this.fuFlash = !1;
    this.fuPrev = 0;
    this.slotVis = {};
    if (this.pro) {
      this.L.innerHTML = `<div class="pro-big"><span class="t"></span></div><div class="pro-small"></div>
        <div class="pro-scroll"><section class="ink-paper slip"><div class="hd">目标</div><div class="body"></div><div class="dots"></div></section></div>
        <div class="pro-float"></div><div class="pro-arrow"><i></i><b></b></div><div class="pro-say"></div><div class="pro-stamp"></div><div class="pro-special"></div>`;
      kit.decorate(this.L);
      this.q = (s) => this.L.querySelector(s);
      this.off = run.on((t, d) => t === "pro" && this.onPro(d));
      this.offFu = run.on((t) => t === "fu" && (this.fuFlash = !0));
      // 已经发生过的进入事件（构造前）补一次
      if (this.pro.chapter) this.chapter(this.pro.chapter, !0);
      this.renderGoals();
    } else this.offFu = run.on((t) => t === "fu" && (this.fuFlash = !0));
  }
  onPro(d) {
    switch (d.type) {
      case "chapter":
        this.chapter(d.chapter);
        break;
      case "step":
        if (d.early) {
          this.renderGoals();
          break;
        }
        this.stepId = d.step.id;
        this.queue = this.queue.filter((q) => q.step === this.stepId);
        if (this.cur && this.cur.step !== this.stepId) this.next(); // 上一步的提示立刻让位
        this.renderGoals();
        break;
      case "hint":
        if (this.flow.settings.hints !== !1) this.push("hint", d.text, 4.6);
        break;
      case "say":
        this.push("say", d.text, 2.8);
        break;
      case "done":
        this.done(d.step, d.text, d.early);
        break;
      case "chapterDone":
        this.stamp(d.chapter);
        break;
      case "special":
        this.special(d.kind, d.text);
        break;
      case "retry":
        this.push("hint", "气血耗尽——从本节开头重来，拾到的东西都还在", 3.5);
        this.renderGoals();
        break;
    }
  }
  // 上方居中的演出排队：节末盖章播完，再出新一节的标题
  chapter(ch, quiet) {
    const wait = Math.max(0, (this.stampUntil || 0) - performance.now());
    if (!quiet && wait > 0) {
      clearTimeout(this.chapterT);
      this.chapterT = setTimeout(() => this.chapter(ch), wait);
      return;
    }
    const big = this.q(".pro-big");
    this.q(".pro-small").textContent = ch;
    if (quiet) return;
    big.querySelector(".t").textContent = ch;
    big.classList.remove("on");
    void big.offsetWidth;
    big.classList.add("on");
    const old = big.querySelector(".ink-seal");
    if (old) old.remove();
    const s = kit.seal("序章", { cls: "two", size: 44, rot: -6 });
    s.classList.add("fx-stamp");
    big.appendChild(s);
  }
  renderGoals() {
    const pro = this.pro, body = this.q(".pro-scroll .body");
    body.innerHTML = "";
    for (const g of pro.goals()) {
      const text = g.optional && !/^（可选）/.test(g.text) ? "（可选）" + g.text : g.text;
      const st = g.state === "early" && g.step.done ? "done" : g.state;
      const e = kit.el("div", `g s-${st}${g.optional ? " opt" : ""}${g.step.early ? " was-early" : ""}`, text + (g.branch && g.state === "cur" ? g.branch.map((b) => `<span class="br">${b.label}</span>`).join("") : ""));
      e.dataset.step = g.step.id;
      e.dataset.state = st;
      body.appendChild(e);
    }
    // 进度点：本小节各步 ● 已完成 ◉ 进行中 ○ 未到；可选步用小点
    const cs = pro.chapterSteps(), F = pro.frontier();
    this.q(".pro-scroll .dots").innerHTML = cs.map((s) => (s.done ? "<b>●</b>" : s.void ? "·" : F.includes(s) && !s.optional ? "◉" : s.optional ? "∘" : "○")).join("");
  }
  done(step, text, early) {
    const line = this.q(`.pro-scroll .g[data-step="${step.id}"]`);
    if (line) line.classList.add("struck", "tick");
    if (text) {
      const f = this.q(".pro-float");
      f.textContent = text;
      f.classList.toggle("early", !!early);
      f.classList.remove("on");
      void f.offsetWidth;
      f.classList.add("on");
    }
    clearTimeout(this.goalT);
    this.goalT = setTimeout(() => this.renderGoals(), early ? 300 : 650);
  }
  stamp(ch) {
    const box = this.q(".pro-stamp");
    box.innerHTML = "";
    const name = String(ch || "").split("·").pop().trim().replace(/^[一二三四五六七八九十]\s*/, "");
    const s = kit.seal(name.length === 2 ? name : "毕", { cls: "two", size: 86, rot: -5 });
    s.classList.add("fx-stamp");
    box.appendChild(s);
    this.q(".pro-big").classList.remove("on"); // 盖章时上一节标题让位
    this.stampUntil = performance.now() + 1000;
    clearTimeout(this.stampT);
    this.stampT = setTimeout(() => (box.innerHTML = ""), 1000);
  }
  special(kind, text) {
    const e = this.q(".pro-special");
    e.className = "pro-special " + kind;
    e.textContent = text;
    void e.offsetWidth;
    e.classList.add("on");
  }
  push(kind, text, dur) {
    this.queue.push({ kind, text, dur, step: this.stepId });
    if (!this.cur) this.next();
  }
  next() {
    const box = this.q(".pro-say");
    this.cur = this.queue.shift() || null;
    if (!this.cur) return box.classList.remove("on");
    const t = this.cur.kind === "say" ? this.cur.text : keycaps(this.cur.text);
    box.innerHTML = `<span class="${this.cur.kind}">${t}</span>`;
    box.dataset.kind = this.cur.kind;
    box.classList.add("on");
    this.cur.t = this.cur.dur;
  }

  update(dt) {
    this.updateBar();
    if (!this.pro) return;
    if (this.cur && (this.cur.t -= dt) <= 0) this.next();
    // 墨箭
    const arrow = this.q(".pro-arrow"), tg = this.pro.arrowTarget(), pl = this.ctx.player.pos;
    const show = tg && Math.hypot(tg.x - pl.x, tg.z - pl.z) > 4 && this.run.state === "play";
    if (show !== this.arrowOn) (this.arrowOn = show), arrow.classList.toggle("on", !!show);
    if (show) {
      const cam = this.ctx.camera;
      _a.copy(pl).project(cam);
      _b.set(tg.x, tg.y || pl.y, tg.z).project(cam);
      const px = ((_a.x + 1) / 2) * innerWidth, py = ((1 - _a.y) / 2) * innerHeight;
      const ang = Math.atan2(-(_b.y - _a.y) * innerHeight, (_b.x - _a.x) * innerWidth);
      arrow.style.transform = `translate(${px + Math.cos(ang) * 78}px, ${py - 30 + Math.sin(ang) * 78}px) rotate(${ang}rad)`;
    }
  }
  // 技能栏：序章只显示教过的格子；行囊有五行符时挂"3 · 符"格
  updateBar() {
    const ui = this.ctx.skills && this.ctx.skills.ui;
    if (!ui || !ui.slots || !ui.el) return;
    if (this.pro) {
      const vis = { Q: !1, E: !1, R: !1, artifact: !1, formation: !1, talisman: !1, pot0: this.pro.pills, pot1: this.pro.pills };
      for (const [k, v] of Object.entries(vis)) {
        const s = ui.slots[k];
        if (!s || this.slotVis[k] === v + ":" + (s.el.isConnected ? 1 : 0)) continue;
        this.slotVis[k] = v + ":" + (s.el.isConnected ? 1 : 0);
        s.el.style.display = v ? "" : "none";
      }
    }
    const r = this.run, kinds = r.elementFus ? r.elementFus() : [];
    const sel = kinds.includes(r.fuSel) ? r.fuSel : kinds[0];
    const n = sel ? r.carried.filter((i) => i.id === sel).reduce((a, i) => a + i.n, 0) : 0;
    let el = this.fuEl;
    if (sel) {
      if (!el || !el.isConnected) {
        el = this.fuEl = kit.el("div", "jx-slot hud-skill sm mk-fu3", `<span class="mk-ico off"></span><span class="g"></span><span class="k">3</span><span class="c"></span><span class="ct"></span>`);
        el.dataset.id = "fu3";
        ui.el.appendChild(el);
      }
      const d = defOf({ id: sel }) || {};
      const key = sel + n + this.fuFlash;
      if (this.fuKey !== key) {
        this.fuKey = key;
        // 五行符用物品图标（储物袋 v2 图集）；图标缺失时退回单字
        const ic = el.querySelector(".mk-ico"), st = kit.iconStyle(sel);
        ic.setAttribute("style", st);
        ic.classList.toggle("off", !st);
        el.querySelector(".g").textContent = st ? "" : d.glyph || "符";
        el.querySelector(".c").textContent = "×" + n;
        el.querySelector(".ct").textContent = d.name || "";
        el.title = `${d.name}：按 3 在准星处炸开${kinds.length > 1 ? "（4 换一种）" : ""}`;
        el.classList.toggle("flash", this.fuFlash);
      }
      if (this.fuFlash && n < this.fuPrev) (this.fuFlash = !1), el.classList.remove("flash"), (this.fuKey = "");
      this.fuPrev = n;
    } else if (el && el.isConnected) el.remove();
  }
  dispose() {
    this.off && this.off();
    this.offFu && this.offFu();
    clearTimeout(this.goalT);
    clearTimeout(this.stampT);
    clearTimeout(this.chapterT);
    if (this.fuEl) this.fuEl.remove();
    const ui = this.ctx.skills && this.ctx.skills.ui;
    if (ui && ui.slots) for (const s of Object.values(ui.slots)) s.el.style.display = "";
    kit.clear("prologue");
    kit.show("prologue", !1);
  }
}
