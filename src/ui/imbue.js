// 附灵五行印（HUD）：左上闪身墨点右侧一方小圆印，显示当前普攻附带的五行（法剑附灵 / 碧鳞五行坛）。
//   - 印色 = 五行色，印文 = 五行字；旁边小字"剑附灵"或"坛 12 息"；坛附灵外圈一笔圆相按剩余时间收起，最后 3 秒闪烁
//   - 坛附灵结束：印淡出，旁边飘一行"坛力散去"
//   - 悬停：说明普攻带该五行对各色护盾的倍率（数值取自 shields.js SHIELD_TUNE，蓄势斩再乘 CHARGE.shieldMul）
// 由 src/ui/hud.js 创建（挂在 #hud 里）；读 player.imbue，订阅 player:imbue / player:imbueEnd。
import { SHIELD_TUNE, COUNTER, EL_NAME } from "../game/shields.js";
import { CHARGE } from "../data/player.js";
import { ELEM_LOOK } from "../fx/player_fx.js";

const CSS = `
#hud .imb { position: absolute; left: calc(2.2em + 116px); bottom: 7px; display: flex; align-items: center; gap: 6px; opacity: 0; transition: opacity .6s; pointer-events: none; }
#hud .imb.on { opacity: 1; pointer-events: auto; }
#hud .imb .se { position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; isolation: isolate;
  font: 17px var(--f-display, "STKaiti", "KaiTi", serif); color: #f5f0e3; transform: rotate(-5deg); }
#hud .imb .se::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--ec, #15181b);
  -webkit-mask: var(--ink-seal-round, radial-gradient(circle, #000 66%, transparent 70%)) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-round, radial-gradient(circle, #000 66%, transparent 70%)) 0 0 / 100% 100% no-repeat; }
#hud .imb .se::after { content: ""; position: absolute; inset: -5px; z-index: -2; opacity: 0; background: conic-gradient(var(--ec, #15181b) calc(var(--k, 1) * 360deg), transparent 0);
  -webkit-mask: var(--ink-enso-full, radial-gradient(circle, transparent 60%, #000 62%)) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-full, radial-gradient(circle, transparent 60%, #000 62%)) 0 0 / 100% 100% no-repeat; }
#hud .imb.shrine .se::after { opacity: .85; }
#hud .imb.blink .se { animation: imbBlink .45s ease-in-out infinite alternate; }
#hud .imb.stamp .se { animation: imbStamp .35s cubic-bezier(.3,1.6,.5,1); }
#hud .imb .cap { font: 12px var(--f-ui, sans-serif); font-weight: 700; color: var(--ec, #15181b); text-shadow: 0 0 3px rgba(240,234,218,.95), 0 0 3px rgba(240,234,218,.95); white-space: nowrap; }
#hud .imb .tip { position: absolute; left: 0; top: 34px; width: 236px; padding: 10px 14px 12px; display: none; font: 13px/1.7 var(--f-kai, "KaiTi", serif); color: rgba(21,24,27,.78);
  background: radial-gradient(ellipse at 45% 50%, rgba(245,240,227,.97) 0 62%, rgba(245,240,227,.85) 78%, rgba(245,240,227,0) 100%); }
#hud .imb .tip b { color: var(--ec); font-weight: 700; }
#hud .imb:hover .tip { display: block; }
#hud .imb-gone { position: absolute; left: calc(2.2em + 150px); bottom: 10px; font: 13px var(--f-display, "KaiTi", serif); color: rgba(21,24,27,.6); opacity: 0; pointer-events: none;
  text-shadow: 0 0 3px rgba(240,234,218,.95); }
#hud .imb-gone.on { animation: imbGone 1.8s ease-out; }
@keyframes imbBlink { from { opacity: 1; } to { opacity: .35; } }
@keyframes imbStamp { 0% { transform: rotate(-14deg) scale(1.6); } 100% { transform: rotate(-5deg) scale(1); } }
@keyframes imbGone { 0% { opacity: 0; transform: translateY(0); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
`;

let styled = !1;
const pct = (v) => "×" + (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, "");

// 普攻带 el 时对护盾的倍率说明
export function imbueTip(el, src) {
  const T = SHIELD_TUNE;
  const counter = T.physical * (1 - T.imbue) + T.counter * T.imbue, other = T.physical * (1 - T.imbue) + T.other * T.imbue;
  const shield = Object.keys(COUNTER).find((s) => COUNTER[s] === el);
  return `普攻带<b>${EL_NAME[el]}行</b>（${src === "shrine" ? "五行坛加持" : "法剑附灵"}）<br>` +
    `${EL_NAME[el]}克${EL_NAME[shield]}：对<b>${EL_NAME[shield]}盾 ${pct(counter)}</b>（无附灵 ${pct(T.physical)}）<br>` +
    `对其他盾 ${pct(other)}；蓄势斩再 ×${CHARGE.shieldMul}<br>伤害按敌人的${EL_NAME[el]}抗结算`;
}

export class ImbueUI {
  constructor(ctx, hudEl) {
    this.ctx = ctx;
    if (!styled) {
      styled = !0;
      const st = document.createElement("style");
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = (this.el = document.createElement("div"));
    el.className = "imb";
    el.innerHTML = `<span class="se"></span><span class="cap"></span><div class="tip"></div>`;
    hudEl.appendChild(el);
    this.gone = document.createElement("div");
    this.gone.className = "imb-gone";
    this.gone.textContent = "坛力散去";
    hudEl.appendChild(this.gone);
    this.q = (s) => el.querySelector(s);
    this.last = {};
    const ev = ctx.world.events;
    ev.on("player:imbue", (e) => {
      if (!e.el) return;
      el.classList.remove("stamp");
      void el.offsetWidth;
      el.classList.add("stamp");
    });
    ev.on("player:imbueEnd", () => {
      this.gone.classList.remove("on");
      void this.gone.offsetWidth;
      this.gone.classList.add("on");
    });
  }
  update() {
    const p = this.ctx.player, im = p && p.imbue;
    const key = im ? im.el + im.src : "";
    if (this.last.key !== key) {
      this.last.key = key;
      this.el.classList.toggle("on", !!im);
      if (im) {
        const L = ELEM_LOOK[im.el];
        this.el.style.setProperty("--ec", L.css);
        this.q(".se").textContent = L.name;
        this.q(".tip").innerHTML = imbueTip(im.el, im.src);
        this.el.classList.toggle("shrine", im.src === "shrine");
        this.el.dataset.el = im.el;
        this.el.dataset.src = im.src;
      }
    }
    if (!im) return;
    if (im.src === "shrine") {
      const left = Math.max(0, im.left || 0), k = im.dur ? left / im.dur : 1;
      const kk = Math.round(k * 100) / 100;
      if (this.last.k !== kk) (this.last.k = kk), this.q(".se").style.setProperty("--k", kk);
      const cap = `坛 ${Math.ceil(left)} 息`;
      if (this.last.cap !== cap) (this.last.cap = cap), (this.q(".cap").textContent = cap);
      const blink = left < 3;
      if (this.last.blink !== blink) (this.last.blink = blink), this.el.classList.toggle("blink", blink);
    } else {
      if (this.last.cap !== "剑附灵") (this.last.cap = "剑附灵"), (this.q(".cap").textContent = "剑附灵");
      if (this.last.blink) (this.last.blink = !1), this.el.classList.remove("blink");
    }
  }
}
