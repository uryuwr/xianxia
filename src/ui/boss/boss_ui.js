// 首领界面（UI 设计，青牙 v2 §8 方向 A 卷首横轴 + 显示狼威条）：docs/design/boss_青牙_v2.md §7、§8、§10.1
//   首领条（屏幕顶部正中长卷；首领战时天时条收起）：名牌 · 称号 · 境界；护盾 = 气血上方一笔五行色 + 五行圆印；50% 处一道不带字的淡墨小刻痕
//   不显示"第几阶段"（用户 2026-11-17：阶段由首领外观、护盾、环境变化表达，不用横幅 / 阶段字）
//   狼威条：从中间向两端长，越满墨越浓、越近朱；回落时淡；满 → 断开 + 盖"折"
//   读条（召狼长嚎 / 啸月）：首领条右下一圈圆相 + 字 + 打断值一笔；被打断转朱、抖两下、钤"断"
//   处决提示"F 斩"：锚在首领头顶（enemy.headPos），圆相收拢 = 剩余窗口（downLeft / downDur）
//   入场题签"第 N 次 · 上回削至 X%"；上下黑边（入场 / 转阶段演出 / 处决，按各事件的 dur；转阶段不弹任何文字）
//   处决叠加层：威折朱"斩"；终结 留白 → 一笔 → "斩" → 朱印"青牙伏诛"（exec_fx.js）
// 数据：每帧读 enemy.ctrl.view()（自己做变化检测，DOM 只在变化时写，进度 ≥0.5% 才写）；事件见 §10.1（ctx.world.events）。
// 接线：RunHud 构造时 new BossUI(ctx, run)，每帧 update(dt)，dispose()。ctx.bossUI 指向当前实例（测试 / 控制器可读）。
import "./boss.css";
import * as THREE from "three";
import { kit } from "../kit.js";
import { EL } from "../loadout.js"; // 五行色 = 技能栏五行色（UI 约定，不另写色值）
import { ExecFx } from "./exec_fx.js";

import { BOSS_TEXT } from "./boss_text.js";
export { BOSS_TEXT };
const T0 = BOSS_TEXT.qingya;
const idOf = (b) => (!b ? null : typeof b === "string" ? b : (b.def && b.def.boss) || b.type || null);
const q3 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 200) / 200; // 0.5% 量化
const _v = new THREE.Vector3();
export const PROMPT_MIN_Y = 272; // 处决提示底边的最小 y（设计稿坐标）= 首领条底 ~96 + 提示高 ~176

export class BossUI {
  constructor(ctx, run) {
    this.ctx = ctx;
    this.run = run;
    this.L = kit.layer("boss", 24);
    kit.clear("boss");
    kit.show("boss", !0);
    this.L.innerHTML = `
      <i class="bx-lb t"></i><i class="bx-lb b"></i>
      <div class="bx-top"><div class="bx-bar">
        <div class="bx-head"><span class="nm bx-glyph"></span><span class="bx-lbl tl"></span><span class="bx-lbl rl"></span></div>
        <div class="bx-row"><span class="bx-eseal"></span><div class="bx-col">
          <div class="bx-stroke bx-sh"><i class="bg"></i><i class="f"></i></div>
          <div class="bx-stroke bx-hp"><i class="bg"></i><i class="lag"></i><i class="f"></i></div>
          <i class="bx-tick"></i>
          <div class="bx-pw"><b>威</b><div class="bx-po"><i></i><s class="gn"></s></div><em class="bx-pg"></em></div>
          <span class="ink-seal bx-zhe">折</span>
        </div></div>
        <div class="bx-chan"><div class="rg"><b></b><span class="ink-seal duan">断</span></div><div class="tx"><div class="n"></div><div class="bk"><i></i></div></div></div>
      </div></div>
      <div class="bx-prompt"><div class="in"><div class="ring"><span class="key">F</span></div><div class="v">斩</div><div class="why"></div><div class="go"></div></div></div>
      <div class="bx-stage bx-cards"><div class="bx-intro"><div class="n"></div><div class="t"></div><div class="h"></div><div class="k"></div></div></div>`;
    const q = (s) => this.L.querySelector(s);
    this.el = {
      bar: q(".bx-bar"), nm: q(".bx-head .nm"), tl: q(".bx-head .tl"), rl: q(".bx-head .rl"),
      eseal: q(".bx-eseal"), sh: q(".bx-sh"), hp: q(".bx-hp"), po: q(".bx-po"),
      chan: q(".bx-chan"), chG: q(".bx-chan .rg b"), chN: q(".bx-chan .tx .n"), chRg: q(".bx-chan .rg"), chBk: q(".bx-chan .bk"),
      prompt: q(".bx-prompt"), pRing: q(".bx-prompt .ring"), pWhy: q(".bx-prompt .why"), pGo: q(".bx-prompt .go"), gn: q(".bx-po .gn"), pg: q(".bx-pg"),
      intro: q(".bx-intro"),
    };
    this.c = {}; // 上次写进 DOM 的值（变化检测）
    this.e = null; // 当前首领（Enemy）
    this.id = null;
    this.active = !1;
    this.lbUntil = 0;
    this.timers = [];
    this.stats = { writes: 0, frames: 0, ms: 0 }; // 测试 / 性能探针读：DOM 写入次数、update 次数与总耗时
    this.fx = new ExecFx(ctx, this.L, this.stats);
    const ev = ctx.world.events;
    this.offs = [
      // 入场：流程组发 boss:intro（字段少）；控制器开演时紧接着发 boss:introStart（全字段：last / dur / short / cower），以后者为准。
      //   有控制器的首领先等 introStart（0.3 秒内没来就按 boss:intro 自己开演）；3 秒内同一只首领重复的入场事件只补字段、不重播
      ev.on("boss:intro", (d) => this.onIntroEvent(d || {}, !1)),
      ev.on("boss:introStart", (d) => this.onIntroEvent(d || {}, !0)),
      ev.on("boss:executeHit", (d) => this.fx.hit(d && d.kind)),
      ev.on("boss:phase", (d) => this.onPhase(d || {})),
      ev.on("boss:break", (d) => this.onBreak(d || {})),
      ev.on("boss:interrupt", (d) => this.onInterrupt(d || {})),
      ev.on("boss:crash", () => this.bump()),
      ev.on("boss:poiseGain", (d) => this.onPoiseGain(d || {})),
      ev.on("boss:poiseNear", (d) => this.active && this._cls(this.el.po, "near", "near", !!(d && d.on))),
      ev.on("boss:execPrompt", (d) => this.onExecPrompt(d || {})),
      ev.on("boss:execute", (d) => this.onExecute(d || {})),
      ev.on("boss:execEnd", (d) => this.onExecEnd(d || {})),
      ev.on("boss:retreat", () => this.hide("retreat")),
      ev.on("boss:defeated", () => this.hide("defeated", 1.2)),
    ];
    ctx.bossUI = this;
  }

  // ---------------- 工具 ----------------
  _var(el, k, name, v) {
    if (this.c[k] === v) return;
    this.c[k] = v;
    el.style.setProperty(name, v);
    this.stats.writes++;
  }
  _txt(el, k, s) {
    if (this.c[k] === s) return;
    this.c[k] = s;
    el.textContent = s;
    this.stats.writes++;
  }
  _cls(el, k, cls, on) {
    on = !!on;
    if (this.c[k] === on) return;
    this.c[k] = on;
    el.classList.toggle(cls, on);
    this.stats.writes++;
  }
  _later(sec, fn) {
    const t = setTimeout(() => ((this.timers = this.timers.filter((x) => x !== t)), fn()), sec * 1000);
    this.timers.push(t);
  }
  _replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // 每次播放只读一次（事件触发时，不在帧循环里）
    el.classList.add(cls);
  }
  _enemyOf(d) {
    if (d.enemy) return d.enemy;
    if (d.boss && typeof d.boss === "object") return d.boss;
    const id = d.id || idOf(d.boss);
    const L = (this.ctx.enemies && this.ctx.enemies.list) || [];
    return L.find((e) => e.alive !== !1 && idOf(e.def && e.def.boss) === id) || this.e;
  }
  T() {
    return BOSS_TEXT[this.id] || T0;
  }
  // 上下黑边：sec 秒后自动退出（多个来源取最晚）
  letterbox(sec) {
    const until = performance.now() + sec * 1000;
    if (until <= this.lbUntil) return;
    this.lbUntil = until;
    this._cls(this.L, "lb", "lb", !0);
    this._var(this.L, "lbv", "--lb", "calc(8.5vh / var(--mk-scale, 1))");
    clearTimeout(this.lbT);
    this.lbT = setTimeout(() => {
      this.lbUntil = 0;
      this._cls(this.L, "lb", "lb", !1);
      this._var(this.L, "lbv", "--lb", "0px");
    }, sec * 1000);
  }

  // ---------------- 事件 ----------------
  onIntroEvent(d, full) {
    clearTimeout(this.introWait);
    const e = this._enemyOf(d);
    if (!full && e && e.ctrl && e.ctrl.view && !(this.active && this.e === e)) {
      this.introWait = setTimeout(() => this.onIntro(d), 300);
      return;
    }
    this.onIntro(d);
  }
  onIntro(d) {
    const e = this._enemyOf(d);
    const id = d.id || idOf(d.boss) || idOf(e && e.def && e.def.boss) || "qingya";
    const again = this.active && this.e === e && performance.now() - (this.introAt || 0) < 3000;
    this.e = e;
    this.id = id;
    if (again) return d.dur ? this._introText(d) : undefined; // 流程与控制器各发一次时：只用全字段的那条补字段，不重播
    this.introAt = performance.now();
    this.stats.intros = (this.stats.intros || 0) + 1;
    this.active = !0;
    this.c = {};
    document.body.classList.add("mk-bossfight");
    const T = this.T();
    this._txt(this.el.nm, "nm", T.name);
    this._txt(this.el.tl, "tl", T.title);
    const first = !!d.first, dur = d.dur || (first ? 4 : 1.2);
    this.letterbox(dur);
    this.el.bar.classList.remove("hide", "brk", "on");
    this.el.po.className = "bx-po"; // 上一场残留的 near / fall / brk
    // §3.2：题签与首领条在 2.4 / 4.0 处出现（短版立刻）
    const at = first ? dur * 0.6 : 0.15;
    this._later(at, () => this.active && this.el.bar.classList.add("on"));
    this._introText(d);
    this._later(at, () => {
      if (!this.active) return;
      this.el.intro.style.setProperty("--d", (Math.max(1.2, dur - at) + 1.8).toFixed(2) + "s");
      this._replay(this.el.intro, "go");
    });
  }
  _introText(d) {
    const T = this.T();
    const P = this.run && this.run.profile, L = P && P.stats && P.stats.bossLog && P.stats.bossLog[this.id];
    const tries = d.tries || (L && L.tries) || 1;
    // 上一次：payload.last，没有就取 bossLog.log 的最后一条（本场还没写入）
    const last = d.last || (L && L.log && L.log.length ? L.log[L.log.length - 1] : null);
    const best = d.best || (L && L.best) || null;
    const rl = this._realm();
    let h;
    if (d.first || tries <= 1 || !last) h = "初见";
    else {
      const lt = last.result === "kill" || last.hpLeft <= 0 ? "上回已斩" : `上回削至 ${Math.round(last.hpLeft * 100)}%`;
      h = `第 ${tries} 次 · ${lt}`;
      if (best && best.phase >= 2 && (!last.phase || last.phase < 2)) h += " · 曾入二阶段";
      if (best) h += ` <span class="best" style="--b:${(1 - best.hpLeft).toFixed(3)}" title="最好一次"><i></i><u></u></span>`;
    }
    this.el.intro.querySelector(".n").textContent = T.name;
    this.el.intro.querySelector(".t").innerHTML = `${T.title} · <b class="${rl.cls}">${rl.text}</b>`;
    this.el.intro.querySelector(".h").innerHTML = h;
    // 首次挑战的提示（只这一次）：introStart.hint，文案见 boss_text.js
    const hint = typeof d.hint === "string" ? d.hint : d.hint ? T.hint && T.hint.poise : "";
    const k = this.el.intro.querySelector(".k");
    if (k) k.textContent = hint || "";
    this.stats.writes += 4;
  }
  _realm() {
    const E = this.ctx.enemies;
    try {
      if (E && E.realmLabel && this.e && this.e.realm) return E.realmLabel(this.e);
    } catch (err) {}
    return { text: "练气?", cls: "warn" };
  }
  // 转阶段：只有演出黑边（镜头由 rig.cine 负责），不弹任何文字 UI
  onPhase(d) {
    if (this.active) this.letterbox(d.dur || 3.6);
  }
  onBreak() {
    if (this.active) this._replay(this.el.bar, "brk");
  }
  // 狼威大额上涨：新涨的那段先亮再沉（0.4 秒）+ 条尾浮来源小字（0.8 秒）；小额只正常增长
  onPoiseGain(d) {
    if (!this.active || !(d.n >= 8) || !(d.max > 0)) return;
    const b = Math.min(1, d.v / d.max), a = Math.max(0, Math.min(b, (d.v - d.n) / d.max));
    const gn = this.el.gn;
    gn.style.setProperty("--pa", a.toFixed(3));
    gn.style.setProperty("--pb", b.toFixed(3));
    this._replay(gn, "go");
    this.stats.writes += 2;
    const g = this.T().gain && this.T().gain[d.kind];
    if (!g) return;
    const pg = this.el.pg;
    pg.textContent = g;
    pg.style.setProperty("--x", (21 + 224 + b * 224).toFixed(0) + "px");
    this._replay(pg, "go");
    this.stats.writes += 2;
    this.lastGain = { kind: d.kind, g, n: d.n };
  }
  bump() {
    if (this.active) this._replay(this.el.po, "bump");
  }
  onInterrupt() {
    if (!this.active) return;
    this.cutT = performance.now();
    this._replay(this.el.chan, "cut");
    this._cls(this.el.chan, "chon", "on", !0);
    this.bump();
  }
  onExecPrompt(d) {
    this.promptOn = !!d.on && this.active;
    this.promptKind = d.kind || "break";
    this.promptDur = d.dur || 0;
    this.promptT0 = performance.now();
  }
  onExecute(d) {
    if (!this.active) return;
    this.promptOn = !1;
    const kind = d.kind || "break", dur = d.dur || (kind === "final" ? (d.short ? 2 : 4) : 2.4);
    if (kind === "break") this.letterbox(Math.min(dur, 1.6) + 0.25); // 终结处决不加黑边：留白本身就是画框
    this.el.bar.classList.add("hide");
    this.fx.play(kind, { dur, short: !!d.short, enemy: this._enemyOf(d), seal: this.T().seal });
  }
  onExecEnd() {
    this.fx.stop();
    if (this.active) this.el.bar.classList.remove("hide");
  }
  hide(why, delay = 0) {
    if (!this.active) return;
    const go = () => {
      this.active = !1;
      this.promptOn = !1;
      this.el.bar.classList.remove("on");
      this._cls(this.el.prompt, "pon", "on", !1);
      this._cls(this.el.chan, "chon", "on", !1);
      document.body.classList.remove("mk-bossfight");
      this.e = null;
    };
    this.hideWhy = why;
    if (delay) this._later(delay, go);
    else go();
  }

  // ---------------- 每帧 ----------------
  update() {
    if (!this.active) return;
    const t0 = performance.now();
    this.stats.frames++;
    const e = this.e;
    if (!e || e.alive === !1 || e.removed) {
      if (!this.fx.on) this.hide("gone", e && e.alive === !1 ? 1.2 : 0);
      this.stats.ms += performance.now() - t0;
      return;
    }
    const v = e.ctrl && e.ctrl.view ? e.ctrl.view() : null;
    if (v) this._apply(v);
    this.fx.update();
    this.stats.ms += performance.now() - t0;
  }
  _apply(v) {
    const el = this.el, bar = el.bar;
    // 境界（主角升层 / 神识变化会变，0.5 秒查一次）
    const now = performance.now();
    if (!(now < this.c.rlT)) {
      this.c.rlT = now + 500;
      const rl = this._realm();
      this._txt(el.rl, "rl", rl.text);
      if (this.c.rlc !== rl.cls) (this.c.rlc = rl.cls), (el.rl.className = "bx-lbl rl " + rl.cls), this.stats.writes++;
    }
    // 气血（--v 写在 .bx-hp 上，lag 用 transition 延迟跟随）
    this._var(el.hp, "hp", "--v", String(q3(v.hpMax > 0 ? v.hp / v.hpMax : 0)));
    // 护盾：五行色一笔 + 圆印
    const s = v.shield && v.shield.hp > 0 ? v.shield : null;
    this._cls(bar, "shOn", "sh", !!s);
    if (s) {
      const E = EL[s.el] || EL.wood;
      if (this.c.el !== s.el) {
        this.c.el = s.el;
        bar.style.setProperty("--shc", E.c);
        el.eseal.textContent = E.n;
        this.stats.writes += 2;
      }
      this._var(el.sh, "sh", "--s", String(q3(s.hp / s.max)));
    }
    // 狼威
    const broken = !!(v.broken || v.down === "break");
    this._var(el.po, "po", "--p", String(broken ? 1 : q3(v.poiseMax > 0 ? v.poise / v.poiseMax : 0)));
    this._cls(el.po, "fall", "fall", v.poiseFalling && !broken);
    this._cls(el.po, "brk", "brk", broken);
    if (broken !== this.c.barbrk) {
      // "折"印：boss:break 时已重播；没收到事件时这里兜底加上，恢复时去掉
      this.c.barbrk = broken;
      if (!broken) bar.classList.remove("brk");
      else if (!bar.classList.contains("brk")) bar.classList.add("brk");
      this.stats.writes++;
    }
    // 读条（被打断后 0.95 秒内保持显示：转朱、抖两下、钤"断"）
    const ch = v.channel, cutting = this.cutT > 0 && now - this.cutT < 950;
    if (!cutting && this.cutT) (this.cutT = 0), el.chan.classList.remove("cut");
    if (ch) {
      const C = this.T().chan[ch.id] || { g: "嚎", n: "读条 · 可打断" };
      this._txt(el.chG, "chg", C.g);
      this._txt(el.chN, "chn", C.n);
      this._var(el.chRg, "chk", "--k", String(q3(ch.k)));
      this._var(el.chBk, "chb", "--b", String(q3(ch.brk || 0)));
    }
    this._cls(el.chan, "chon", "on", !!ch || cutting);
    // 处决提示：boss:execPrompt on 时显示；圆相 = 剩余窗口（downLeft / downDur，没有就按事件的 dur 自己倒数）
    const pOn = !!this.promptOn && !this.fx.on;
    this._cls(el.prompt, "pon", "on", pOn);
    if (pOn) {
      this._txt(el.pWhy, "pwhy", this.T().why[this.promptKind] || "");
      this._txt(el.pGo, "pgo", this.T().near || "近前按 F");
      const k = q3(v.downDur > 0 && v.down ? v.downLeft / v.downDur : this.promptDur > 0 ? 1 - (now - this.promptT0) / 1000 / this.promptDur : 1);
      this._var(el.pRing, "pk", "--k", String(k));
      this._cls(el.prompt, "plow", "low", k < 0.3);
      this._place();
    }
  }
  // 头顶锚点：世界 → 屏幕；只在移动 ≥0.5px 时写 transform；出画面时贴边
  _place() {
    const e = this.e, cam = this.ctx.camera;
    if (!e || !cam) return;
    (e.headPos ? e.headPos(_v) : _v.set(e.pos.x, e.pos.y + 3, e.pos.z)).project(cam);
    const W = innerWidth, H = innerHeight;
    let x = ((_v.x + 1) / 2) * W, y = ((1 - _v.y) / 2) * H - 6;
    x = Math.max(60, Math.min(W - 60, x));
    const s = Math.min(W / 1280, H / 720);
    y = Math.max(PROMPT_MIN_Y * s, Math.min(H - 40, y)); // 提示约 175 高，不压首领条（条底约 96）
    if (Math.abs(x - (this.c.px ?? -1e4)) < 0.5 && Math.abs(y - (this.c.py ?? -1e4)) < 0.5) return;
    this.c.px = x;
    this.c.py = y;
    this.el.prompt.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    this.stats.writes++;
  }

  dispose() {
    for (const off of this.offs) off && off();
    this.offs = [];
    for (const t of this.timers) clearTimeout(t);
    clearTimeout(this.lbT);
    clearTimeout(this.introWait);
    this.fx.stop();
    document.body.classList.remove("mk-bossfight");
    if (this.ctx.bossUI === this) this.ctx.bossUI = null;
    kit.clear("boss");
    kit.show("boss", !1);
  }
}
