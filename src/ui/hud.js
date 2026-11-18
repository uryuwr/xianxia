// 界面：左上角的气血（朱）、真气（深石青）——一笔墨条 + 墨晕底衬（UI 体检 v1 方向甲，docs/ui/v3/体检_v1/）、气势（一笔墨痕，src/ui/momentum.js）、闪身充能（墨点）与附灵五行印（src/ui/imbue.js）。底部中央留给技能栏。
// 读取 player.entity 的 hp / mp 与 player.dashCharges / dashMax / dashCdK；只改动变化的数值，避免每帧改 DOM。
// 残血 ≤ 30%：气血字转朱、条呼吸、屏幕四缘淡朱墨常驻；受击（damage 事件打到主角）四缘闪一下。
// 闪身墨点：可用 = 浓墨；正在恢复的那一点按冷却进度被墨晕扫过（--k）；冷却中按闪身 → 墨点抖一下、泛朱。
import { MomentumUI } from "./momentum.js";
import { ImbueUI } from "./imbue.js";

const CSS = `
#hud { position: fixed; left: 14px; top: 12px; z-index: 20; padding: 10px 18px 10px 12px; isolation: isolate;
  pointer-events: none; font-family: "STKaiti", "KaiTi", "楷体", "Kaiti SC", serif; color: #1c1e20; user-select: none; }
/* 墨晕底衬（风格指南 §5.16"没有任何矩形底板"；UI 体检 v1 方向甲）：①核心椭圆用 farthest-side，四边恰好淡到 0；②外圈 --ink-wash-2 给不规则的边 */
#hud::after { content: ""; position: absolute; left: -22px; right: -26px; top: -16px; bottom: -20px; z-index: -1; pointer-events: none;
  background: radial-gradient(farthest-side at 46% 50%, rgba(240,234,220,.92) 0, rgba(240,234,220,.9) 62%, rgba(240,234,220,.55) 84%, rgba(240,234,220,0) 100%); }
#hud::before { content: ""; position: absolute; left: -58px; right: -72px; top: -36px; bottom: -46px; z-index: -1; pointer-events: none; background: rgba(240,234,220,.7);
  -webkit-mask: var(--ink-wash-2, radial-gradient(closest-side, #000, transparent)) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-2, radial-gradient(closest-side, #000, transparent)) 0 0 / 100% 100% no-repeat; }
#hud .row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
#hud .lbl { width: 2.4em; font-size: 20px; font-weight: 900; letter-spacing: .1em; text-shadow: 0 0 4px rgba(245,240,227,.95), 0 0 8px rgba(245,240,227,.8); }
/* 气血 / 真气 / 气势同一种一笔墨条（--ink-stroke-bar）：气血 = 朱、真气 = 深石青（#2f7fa8 在墨晕上不够 3:1）、气势 = 墨（momentum.js） */
#hud .bar { position: relative; width: 240px; height: 16px;
  -webkit-mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
#hud .bar .bg, #hud .bar .fill, #hud .bar .lag { position: absolute; inset: 0; transform-origin: left center; }
#hud .bar .bg { background: rgba(21,24,27,.17); }
/* 掉血余迹：纸色 = "被擦掉的墨"（风格指南 §5.9），0.4 秒后追上 */
#hud .bar .lag { background: rgba(245,240,227,.95); transition: transform .4s ease-out .12s; }
#hud .hp .fill { background: linear-gradient(90deg, #9e2216, #b8291a 55%, #c22f1d); }
#hud .mp .fill { background: linear-gradient(90deg, #245f7f, #2a6f93 60%, #2f7fa8); }
#hud .val { min-width: 74px; font-size: 15px; font-weight: 700; text-shadow: 0 0 3px rgba(245,240,227,.95), 0 0 6px rgba(245,240,227,.85); }
/* 残血（≤ 30%）：气血字转朱 + 条呼吸（只动 240px 小元素的 opacity）；屏幕四缘淡朱墨见 #mk-hurtedge */
#hud.low .hp .lbl, #hud.low .hp .val { color: #b8291a; }
#hud.low .hp .fill { animation: hudBreath 1.1s ease-in-out infinite; }
@keyframes hudBreath { 0%, 100% { opacity: 1; } 50% { opacity: .62; } }
/* 元信息（风格指南 §6.1）：残血时屏幕四缘常驻一圈淡朱墨，受击闪一下。一个常驻元素，只改 opacity / 类名，不每帧写 */
#mk-hurtedge { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0; visibility: hidden;
  background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(184,41,26,.14) 72%, rgba(150,30,18,.42) 100%); }
#mk-hurtedge.on { opacity: .75; visibility: visible; transition: opacity .6s ease-out; }
#mk-hurtedge.hit { visibility: visible; }
body:not(.mk-in-run) #mk-hurtedge { display: none; }
#hud .dash { display: flex; align-items: center; gap: 8px; margin: 2px 0 0 calc(2.2em + 10px); }
#hud .dash i { --k: 1; position: relative; width: 22px; height: 22px; transition: transform .15s; }
/* 圆相外圈（一笔）+ 圈内墨晕：可用 = 满墨；恢复中 = 按 --k 从 12 点顺时针扫过 */
#hud .dash i::after { content: ""; position: absolute; inset: 0; background: rgba(28,30,32,.75);
  -webkit-mask: var(--ink-enso-2, radial-gradient(circle, transparent 58%, #000 60%, #000 70%, transparent 72%)) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-2, radial-gradient(circle, transparent 58%, #000 60%, #000 70%, transparent 72%)) 0 0 / 100% 100% no-repeat; }
#hud .dash i:nth-child(2n)::after { -webkit-mask-image: var(--ink-enso-3, none); mask-image: var(--ink-enso-3, none); }
#hud .dash i::before { content: ""; position: absolute; inset: 17%; border-radius: 50%; background: conic-gradient(#1c1e20 calc(var(--k) * 360deg), rgba(28,30,32,.12) 0);
  -webkit-mask: radial-gradient(circle, #000 55%, rgba(0,0,0,.55) 72%, transparent 76%); mask: radial-gradient(circle, #000 55%, rgba(0,0,0,.55) 72%, transparent 76%); }
#hud .dash i.off { transform: scale(.9); }
#hud .dash i.off::after { opacity: .55; }
#hud .dash i.pop { animation: hudPop .3s ease-out; }
#hud .dash.deny i.off::before { background: conic-gradient(#b8291a calc(var(--k) * 360deg), rgba(184,41,26,.25) 0); }
#hud .dash.deny i.off::after { background: #b8291a; opacity: .9; }
#hud .dash.deny { animation: hudDeny .3s ease-out; }
@keyframes hudPop { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }
@keyframes hudDeny { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 60% { transform: translateX(3px); } }
`;

export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = (this.el = document.createElement("div"));
    el.id = "hud";
    el.innerHTML = `
      <div class="row hp"><span class="lbl">气血</span><div class="bar"><div class="bg"></div><div class="lag"></div><div class="fill"></div></div><span class="val"></span></div>
      <div class="row mp"><span class="lbl">真气</span><div class="bar"><div class="bg"></div><div class="lag"></div><div class="fill"></div></div><span class="val"></span></div>
      <div class="dash"></div>`;
    document.body.appendChild(el);
    this.q = (s) => el.querySelector(s);
    this.last = {};
    this.mom = new MomentumUI(ctx, el);
    this.imb = new ImbueUI(ctx, el); // 附灵五行印（闪身墨点右侧）
    // 屏幕四缘淡朱墨（残血常驻 + 受击闪一下）：常驻一个元素，只切类名 / 播一段 opacity 动画
    const edge = (this.edge = document.createElement("div"));
    edge.id = "mk-hurtedge";
    document.body.appendChild(edge);
    ctx.world.events.on("damage", (i) => {
      const p = this.ctx.player;
      if (p && p.entity && i.target === p.entity && i.amount > 0 && p.entity.alive) this.hurt();
    });
    ctx.world.events.on("player:dashDenied", () => {
      const box = this.q(".dash");
      box.classList.remove("deny");
      void box.offsetWidth;
      box.classList.add("deny");
      clearTimeout(this._denyTO);
      this._denyTO = setTimeout(() => box.classList.remove("deny"), 360);
    });
  }
  bar(key, cur, max) {
    const k = key + Math.round(cur) + "/" + Math.round(max);
    if (this.last[key] === k) return;
    this.last[key] = k;
    const f = Math.max(0, Math.min(1, cur / max));
    this.q(`.${key} .fill`).style.transform = `scaleX(${f})`;
    this.q(`.${key} .lag`).style.transform = `scaleX(${f})`;
    this.q(`.${key} .val`).textContent = `${Math.ceil(cur)} / ${Math.round(max)}`;
    if (key === "hp") {
      // 残血 ≤ 30%：只在跨阈值时切类名
      const low = cur > 0 && f <= 0.3;
      if (this.last.low !== low) {
        this.last.low = low;
        this.el.classList.toggle("low", low);
        this.edge.classList.toggle("on", low);
      }
    }
  }
  // 受击：四缘淡朱墨闪一下（0.32 秒回到常驻值）；持续伤害 / 多段 0.35 秒内只闪一次
  hurt() {
    const t = performance.now();
    if (t - (this._hurtT || 0) < 350 || !document.body.classList.contains("mk-in-run")) return;
    this._hurtT = t;
    const ed = this.edge, low = ed.classList.contains("on");
    if (this._hurtA) this._hurtA.cancel();
    ed.classList.add("hit");
    const a = (this._hurtA = ed.animate([{ opacity: low ? 0.95 : 0.6 }, { opacity: low ? 0.75 : 0 }], { duration: 320, easing: "ease-out" }));
    a.onfinish = () => this._hurtA === a && ((this._hurtA = null), ed.classList.remove("hit"));
  }
  update() {
    const p = this.ctx.player, e = p && p.entity;
    if (!e) return;
    this.bar("hp", e.hp, e.stats.get("hp"));
    this.bar("mp", e.mp ?? 0, e.stats.get("mp"));
    const dk = p.dashCharges + "/" + p.dashMax;
    if (this.last.dash !== dk) {
      const box = this.q(".dash");
      if (box.children.length !== p.dashMax) box.innerHTML = "<i></i>".repeat(p.dashMax);
      [...box.children].forEach((d, i) => {
        const on = i < p.dashCharges;
        if (on && d.classList.contains("off")) d.classList.add("pop"), setTimeout(() => d.classList.remove("pop"), 320);
        d.classList.toggle("off", !on);
      });
      this.last.dash = dk;
    }
    // 正在恢复的那一点：墨晕按冷却进度扫过
    const k = p.dashCdK ?? 1, kk = Math.round(k * 50) / 50;
    if (this.last.dashK !== kk + dk) {
      this.last.dashK = kk + dk;
      [...this.q(".dash").children].forEach((d, i) => d.style.setProperty("--k", i < p.dashCharges ? 1 : i === p.dashCharges ? kk : 0));
    }
    this.mom.update();
    this.imb.update();
  }
}
