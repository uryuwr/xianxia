// 打击反馈：伤害数字、受击闪白、主角受伤的朱砂墨晕、气血真气条（HUD）。
// 只订阅战斗世界的事件，不依赖敌人 / 技能模块的内部实现：
//   "damage" → 伤害数字（暴击更大、金朱色；五行按颜色区分）；目标若有 owner.flash() 则调用（受击闪白）
//              附灵普攻（tags 含 "imbue"）：数字前缀一个小五行字、五行色描边；偶尔（≥1.6 秒一次、35%）飘出一个很淡的五行大字
//   "heal"   → 绿色数字
//   主角受伤 → 屏幕边缘的朱砂墨晕
// 顿帧和震屏在出招方（player.js）按招式数据触发，这里只对"主角受击"补一次轻微震屏。
import * as THREE from "three";
import { Hud } from "../ui/hud.js";

const EL_COLOR = { fire: "#d2321e", water: "#2f7fa8", wood: "#3f9a5a", metal: "#c9a040", earth: "#9a6a32" };
const EL_NAME = { fire: "火", water: "水", wood: "木", metal: "金", earth: "土" };

const CSS = `
#dmg { position: fixed; inset: 0; pointer-events: none; z-index: 15; overflow: hidden; }
#dmg b { position: absolute; left: 0; top: 0; font-family: "STKaiti", "KaiTi", "楷体", "Kaiti SC", serif; font-weight: 900; white-space: nowrap;
  color: #1a1c1e; text-shadow: 0 0 3px #f2ede0, 0 0 8px rgba(242,237,224,.85); will-change: transform, opacity; }
#dmg b.crit { color: #c0281a; text-shadow: 0 0 3px #f6e2a8, 0 0 10px rgba(230,180,80,.9); }
#dmg b.hurt { color: #c0281a; }
#dmg b.heal { color: #2f8a52; }
#dmg b.imb { color: #1a1c1e; text-shadow: 0 0 2px var(--ec), 0 0 5px var(--ec), 0 0 9px rgba(242,237,224,.85); }
#dmg b.imb.crit { color: #c0281a; }
#dmg b i { font-style: normal; font-size: .62em; margin-right: 2px; color: var(--ec); vertical-align: .18em; }
#dmg b.elem { font-family: "ZhiMangXing", "MaShanZheng", "STKaiti", "KaiTi", serif; font-weight: 400; text-shadow: 0 0 6px rgba(242,237,224,.7); }
#dmg b.gain { font-family: "ZhiMangXing", "MaShanZheng", "STKaiti", "KaiTi", serif; font-weight: 400; color: #6e5418; letter-spacing: .06em; z-index: 2;
  text-shadow: 0 0 2px #fbf5e6, 0 0 4px #fbf5e6, 0 0 12px rgba(251,245,230,.95), 0 0 22px rgba(214,173,72,.55); }
#dmg b.gain small { display: block; font: 600 .38em "STKaiti", "KaiTi", serif; color: #5c5a54; letter-spacing: .1em; text-align: center; margin-top: -.1em; }
#hurtvig { position: fixed; inset: 0; pointer-events: none; z-index: 14; opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(150,22,14,.38) 82%, rgba(110,12,8,.62) 100%); }
`;

const _v = new THREE.Vector3();

export class Feedback {
  constructor(ctx) {
    this.ctx = ctx;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    this.layer = document.createElement("div");
    this.layer.id = "dmg";
    document.body.appendChild(this.layer);
    this.vig = document.createElement("div");
    this.vig.id = "hurtvig";
    document.body.appendChild(this.vig);
    this.vigT = 0;
    this.nums = [];
    this.pool = [];
    this.hud = new Hud(ctx);
    const ev = ctx.world.events;
    ev.on("damage", (i) => this.onDamage(i));
    // 斩杀精英 / 首领：身上浮出一次醒目的"感悟 +N"（感悟 = 修为，当场入账、身陨不失；用户 2026-11-17 反馈"没看出来"）
    ev.on("enemy:killed", (d) => this.onKilled(d));
    ev.on("boss:execEnd", () => this.pendingGain && (this.pendingGain.wait = 0));
    // 回复数字合并：持续回复（丹药等每帧一小口）攒满 1 秒显示一次总量，不再一帧一个绿字
    this.healAcc = new Map(); // target → { sum, t }
    ev.on("heal", (i) => {
      const a = this.healAcc.get(i.target) || { sum: 0, t: 0 };
      a.sum += i.amount;
      this.healAcc.set(i.target, a);
    });
  }
  onDamage(info) {
    const t = info.target, p = this.ctx.player;
    const isHero = p && t === p.entity;
    if (isHero) {
      this.vigT = 0.55;
      this.number(t, "-" + Math.min(info.amount, Math.round(t.stats.get("hp"))), "hurt", 0.95);
      return;
    }
    if (t.owner && typeof t.owner.flash === "function") t.owner.flash(info);
    const col = info.element ? EL_COLOR[info.element] : null;
    if (info.shieldHit) return this.number(t, (info.shieldHit.counter ? "克 " : "盾 ") + info.shieldHit.dmg, "", info.shieldHit.counter ? 1.5 : 0.8, info.shieldHit.counter ? col : "#8a8780");
    if (col && info.tags && info.tags.includes("imbue")) {
      // 附灵普攻：小五行字前缀 + 五行色描边；偶尔飘一个很淡的五行大字
      const n = this.number(t, String(info.amount), (info.crit ? "crit " : "") + "imb", info.crit ? 1.55 : 1, null, EL_NAME[info.element], col);
      const now = performance.now();
      if (now - (this._elemT || 0) > 1600 && Math.random() < 0.35) {
        this._elemT = now;
        const e = this.number(t, EL_NAME[info.element], "elem", 2.1, col + "66");
        e.y += 0.5;
        e.dur = 1.3;
        e.dx *= 0.3;
      }
      return n;
    }
    this.number(t, String(info.amount), info.crit ? "crit" : "", info.crit ? 1.55 : 1, col);
  }
  // 击杀时先记下，下一帧按本局感悟的实际增量显示（与右下角 / 结算一致）；首领在终结处决里死，等演出结束（boss:execEnd）再浮出，不压在"斩"字上
  onKilled(d) {
    const t = d && d.enemy;
    if (!t || !(d.xp > 0) || !t.tags || !(t.tags.has("elite") || t.tags.has("boss"))) return;
    const run = this.ctx.flow && this.ctx.flow.run;
    const boss = t.tags.has("boss");
    this.pendingGain = { t, raw: Math.round(d.xp * ((run && run.tide) || 1)), base: this._ins ?? (run ? run.insight : 0), wait: boss && typeof document !== "undefined" && document.body.classList.contains("mk-bossexec") ? 4.5 : 0 };
  }
  showGain(p) {
    const t = p.t, run = this.ctx.flow && this.ctx.flow.run;
    const got = run ? Math.round(run.insight - p.base) : 0;
    const n = got > 0 ? got : p.raw;
    const g = this.number(t, "", "gain", t.tags.has("boss") ? 2.2 : 1.6);
    g.el.innerHTML = `感悟 +${n}<small>入修为</small>`; // 只在击杀时（低频），不在帧循环里
    g.dur = t.tags.has("boss") ? 2.6 : 1.8;
    g.dx = 0;
    g.y += 1.6; // 高过头顶的提示条 / 出口标签
    g.gain = n;
    this.lastGain = { n, boss: t.tags.has("boss"), at: performance.now() };
    return g;
  }
  // prefix：数字前的小字（五行）；ec：描边色（CSS 变量 --ec）
  number(target, text, cls, scale = 1, color = null, prefix = null, ec = null) {
    const el = this.pool.pop() || document.createElement("b");
    el.className = cls || "";
    el.textContent = text;
    if (prefix) {
      const i = document.createElement("i");
      i.textContent = prefix;
      el.insertBefore(i, el.firstChild);
    }
    el.style.setProperty("--ec", ec || "transparent");
    el.style.color = color && cls !== "crit" ? color : "";
    el.style.fontSize = Math.round(24 * scale) + "px";
    el.style.opacity = "1";
    this.layer.appendChild(el);
    const p = target.pos;
    const n = {
      el, t: 0, dur: cls === "crit" ? 1.0 : 0.8,
      x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + (target.height || 1.6) + 0.1, z: p.z + (Math.random() - 0.5) * 0.6,
      dx: (Math.random() - 0.5) * 40, scale,
    };
    this.nums.push(n);
    return n;
  }
  flushHeals(dt) {
    for (const [tg, a] of this.healAcc) {
      a.t += dt;
      // 一次性大额回复（≥1 秒内不再增长）立即显示；持续回复每 1 秒显示一次
      const done = a.t >= 1 || (a.last === a.sum && a.t > 0.12);
      a.last = a.sum;
      if (!done) continue;
      if (a.sum >= 1) this.number(tg, "+" + Math.round(a.sum), "heal", 1);
      this.healAcc.delete(tg);
    }
  }
  update(dt, raw) {
    this.flushHeals(raw || dt);
    const run = this.ctx.flow && this.ctx.flow.run;
    if (this.pendingGain && (this.pendingGain.wait -= raw || dt) <= 0) {
      const p = this.pendingGain;
      this.pendingGain = null;
      this.showGain(p);
    }
    if (!this.pendingGain) this._ins = run ? run.insight : 0;
    const cam = this.ctx.camera;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += raw;
      const k = n.t / n.dur;
      if (k >= 1) {
        n.el.remove();
        this.pool.push(n.el);
        this.nums.splice(i, 1);
        continue;
      }
      _v.set(n.x, n.y, n.z).project(cam);
      if (_v.z > 1) {
        n.el.style.opacity = "0";
        continue;
      }
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      // 先弹出放大，再上浮淡出
      const pop = k < 0.12 ? 1 + (1 - k / 0.12) * 0.6 : 1;
      const rise = 46 * Math.sqrt(k);
      n.el.style.transform = `translate(${(sx + n.dx * k).toFixed(1)}px, ${(sy - rise).toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
      n.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
    if (this.vigT > 0) {
      this.vigT = Math.max(0, this.vigT - raw);
      this.vig.style.opacity = String(Math.min(1, this.vigT / 0.3));
    } else if (this.vig.style.opacity !== "0") this.vig.style.opacity = "0";
    this.hud.update();
  }
}
