// 墨笔光标：隐藏系统鼠标，用跟随鼠标的 DOM 元素代替（素材：src/ui/cursors/，拷自 UI 套件 docs/ui/v2/kit/cursors/，
// 32 / 64 两档 SVG，按屏幕倍率自动选；热点见 cursors/README.md）。光标层在最上面、不经过水墨后处理。
// 状态（《UI 风格指南》§8.1）：
//   default   墨笔笔尖（热点在笔锋 3,3）
//   ui        悬停可点的界面元素：笔尖 + 尾部泥金点
//   interact  可交互物（采集、宝箱、撤离点…）：笔尖 + 泥金小圆相
//   enemy     悬停敌人：朱砂开口圆相（进入时缓慢自转半圈）
//   aim       施法瞄准：细圆相，颜色随技能五行（aim-metal / wood / water / fire / earth）
//   invalid   不可施放：淡墨圆相 + 一道斜笔（不用红色）
// 接口：
//   mountCursor(ctx)        挂载（只挂一次，返回同一个实例）；技能系统构造时调用
//   cursor.setState(name)   强制状态，直到 setState(null) 交还自动判断
//   cursor.hint(name, ms)   短暂提示某状态（如交互物模块在玩家靠近时调用）
//   cursor.say(text, tone)  光标旁一闪而过的字（"真气不足"之类；tone "bad" 为淡墨）
//   cursor.aim({ element, color, bad, label, over } | null)   瞄准模块每帧调用
// 敌人悬停：每帧把敌人投影到屏幕上与鼠标比较（不做射线拾取）。可交互物：读 window.__game.props.userData.interact，
// 或其他模块调用 hint("interact")。
import * as THREE from "three";

const url = (n) => new URL(`./cursors/${n}.svg`, import.meta.url).href;
const ELEMS = ["metal", "wood", "water", "fire", "earth"];
// 名称 → [素材, 热点]
const ART = {
  default: ["default", 3],
  ui: ["ui", 3],
  interact: ["interact", 3],
  enemy: ["enemy", 16],
  invalid: ["invalid", 16],
  ...Object.fromEntries(ELEMS.map((e) => [`aim-${e}`, [`aim-${e}`, 16]])),
};
const STATES = ["default", "ui", "interact", "enemy", "aim", "invalid"];

const CSS = `
html, body, body *, canvas { cursor: none !important; }
#ink-cursor { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483000;
  will-change: transform; transition: opacity .12s; }
#ink-cursor.mc-hidden { opacity: 0; }
#ink-cursor .mc-body { position: absolute; left: 0; top: 0; transform-origin: 0 0; transition: transform .09s ease-out; }
#ink-cursor.mc-down .mc-body { transform: scale(.86); }
#ink-cursor img { position: absolute; width: 32px; height: 32px; opacity: 0; transition: opacity .12s; user-select: none; -webkit-user-drag: none; }
#ink-cursor img.on { opacity: 1; }
#ink-cursor img.mc-turn.on { animation: mc-turn .6s cubic-bezier(.3,.7,.3,1); }
@keyframes mc-turn { from { transform: rotate(-180deg); } to { transform: rotate(0deg); } }
#ink-cursor .mc-splat { position: absolute; left: -13px; top: -13px; width: 26px; height: 26px; border-radius: 50%;
  background: radial-gradient(circle, rgba(21,24,27,.3) 0 30%, rgba(21,24,27,.1) 55%, transparent 70%); opacity: 0; transform: scale(.3); }
#ink-cursor .mc-splat.on { animation: mc-splat .32s ease-out; }
@keyframes mc-splat { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.5); } }
#ink-cursor .mc-label { position: absolute; left: 18px; top: 18px; white-space: nowrap; padding: 1px 10px 2px 8px; border-radius: 2px;
  font: 14px/19px "MaShanZheng", "STKaiti", "KaiTi", "楷体", serif; color: #15181b; letter-spacing: .06em;
  background: linear-gradient(90deg, rgba(245,240,227,.94), rgba(245,240,227,.8) 78%, rgba(245,240,227,0));
  opacity: 0; transition: opacity .15s; }
#ink-cursor .mc-label.on { opacity: 1; }
#ink-cursor .mc-label.bad { color: #6d6a63; }
#ink-cursor .mc-over { position: absolute; left: -17px; top: -17px; width: 34px; height: 34px; border-radius: 50%; box-sizing: border-box;
  border: 1.5px dashed currentColor; box-shadow: 0 0 0 1.5px rgba(245,240,227,.7); opacity: 0; transition: opacity .15s; }
#ink-cursor .mc-over.on { opacity: .75; }
@media (prefers-reduced-motion: reduce) { #ink-cursor img.mc-turn.on, #ink-cursor .mc-splat.on { animation: none; } }
`;

const UI_SEL = "button, a[href], [role=button], input, select, textarea, label, summary, [data-cursor=ui], .ink-btn, .btn, [onclick], [tabindex]:not([tabindex='-1'])";

class InkCursor {
  constructor(ctx) {
    this.ctx = ctx;
    const st = document.createElement("style");
    st.id = "ink-cursor-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = (this.el = document.createElement("div"));
    el.id = "ink-cursor";
    el.className = "mc-hidden";
    const imgs = Object.entries(ART)
      .map(([k, [f, h]]) => `<img data-k="${k}" class="${k === "enemy" ? "mc-turn" : ""}" alt="" draggable="false" src="${url(f + "_32")}" srcset="${url(f + "_32")} 1x, ${url(f + "_64")} 2x" style="left:${-h}px;top:${-h}px;transform-origin:${h}px ${h}px">`)
      .join("");
    el.innerHTML = `<div class="mc-splat"></div><div class="mc-over"></div><div class="mc-body">${imgs}</div><div class="mc-label"></div>`;
    document.body.appendChild(el);
    this.imgs = {};
    for (const im of el.querySelectorAll("img")) this.imgs[im.dataset.k] = im;
    this.splat = el.querySelector(".mc-splat");
    this.overEl = el.querySelector(".mc-over");
    this.labelEl = el.querySelector(".mc-label");
    this.x = innerWidth / 2;
    this.y = innerHeight / 2;
    this.state = "";
    this.art = "";
    this.forced = null;
    this.hintS = null;
    this.hintT = 0;
    this.aimInfo = null;
    this.overUI = !1;
    this.overGame = !0;
    this.sayT = 0;
    this.label = "";
    this.labelTone = "";
    this._frame = 0;
    this._interact = !1;
    this._over = !1;
    this._color = "";
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
    this.apply("default");
    addEventListener("mousemove", (e) => this.move(e), { capture: !0, passive: !0 });
    addEventListener("mousedown", () => this.down(), { capture: !0, passive: !0 });
    addEventListener("mouseup", () => this.el.classList.remove("mc-down"), { capture: !0, passive: !0 });
    document.addEventListener("mouseleave", () => el.classList.add("mc-hidden"));
    addEventListener("blur", () => el.classList.add("mc-hidden"));
    const loop = () => {
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__cursor = this;
  }
  move(e) {
    this.x = e.clientX;
    this.y = e.clientY;
    this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;
    this.el.classList.remove("mc-hidden");
    const t = e.target, c = this.ctx.renderer && this.ctx.renderer.domElement;
    this.overGame = t === c || t === document.body || t === document.documentElement;
    this.overUI = !this.overGame && !!(t && t.closest && t.closest(UI_SEL));
  }
  down() {
    this.el.classList.add("mc-down");
    const s = this.splat;
    s.classList.remove("on");
    void s.offsetWidth;
    s.classList.add("on");
  }
  // 切换状态：只改两张图的 class（淡入淡出 0.12s）
  apply(name, element) {
    const art = name === "aim" ? `aim-${ELEMS.includes(element) ? element : "metal"}` : name;
    if (art === this.art || !this.imgs[art]) return;
    if (this.imgs[this.art]) this.imgs[this.art].classList.remove("on");
    this.imgs[art].classList.add("on");
    this.art = art;
    this.state = name;
    this.el.dataset.state = name;
  }
  setState(name) {
    this.forced = name && STATES.includes(name) ? name : null;
    this.tick();
  }
  hint(name, ms = 300) {
    this.hintS = name;
    this.hintT = performance.now() + ms;
  }
  say(text, tone = "") {
    this.label = text;
    this.labelTone = tone;
    this.sayT = performance.now() + 900;
    this.showLabel(text, tone);
  }
  aim(info) {
    this.aimInfo = info;
  }
  showLabel(text, tone) {
    const l = this.labelEl;
    if (l.textContent !== text) l.textContent = text;
    l.classList.toggle("on", !!text);
    l.classList.toggle("bad", tone === "bad");
  }
  // 敌人是否在鼠标下（投影到屏幕比较）
  enemyUnder() {
    const ctx = this.ctx, cam = ctx.camera, w = ctx.world;
    if (!cam || !w || !w.entities) return !1;
    const me = w.player;
    const W = innerWidth, Hh = innerHeight;
    for (const e of w.entities) {
      if (!e.alive || e.team === "player" || e.team === "neutral" || (me && e.team === me.team)) continue;
      if (me && (e.pos.x - me.pos.x) ** 2 + (e.pos.z - me.pos.z) ** 2 > 40 * 40) continue;
      const hgt = e.height || 1.6;
      const p = this._p.copy(e.pos);
      p.y += hgt * 0.5;
      p.project(cam);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * Hh;
      // 屏幕上的身形大小：取头顶投影的距离
      const q = this._q.copy(e.pos);
      q.y += hgt;
      q.project(cam);
      const half = Math.max(14, Math.abs((-q.y * 0.5 + 0.5) * Hh - sy));
      const rx = Math.max(14, half * Math.max(0.6, (e.radius || 0.5) / (hgt * 0.5)));
      const dx = (this.x - sx) / rx, dy = (this.y - sy) / (half * 1.1);
      if (dx * dx + dy * dy < 1) return !0;
    }
    return !1;
  }
  interactUnder() {
    const g = window.__game, cam = this.ctx.camera;
    const list = g && g.props && g.props.userData && g.props.userData.interact;
    if (!list || !cam) return !1;
    const W = innerWidth, Hh = innerHeight;
    for (const o of list) {
      if (!o || o.visible === !1 || (o.userData && o.userData.used)) continue;
      o.getWorldPosition(this._p);
      this._p.y += 0.6;
      this._p.project(cam);
      if (this._p.z > 1) continue;
      const sx = (this._p.x * 0.5 + 0.5) * W, sy = (-this._p.y * 0.5 + 0.5) * Hh;
      if ((this.x - sx) ** 2 + (this.y - sy) ** 2 < 34 * 34) return !0;
    }
    return !1;
  }
  tick() {
    const now = performance.now();
    this._frame++;
    let name = "default";
    const a = this.aimInfo;
    if (this.forced) name = this.forced;
    else if (this.overUI) name = "ui";
    else if (a) name = a.bad ? "invalid" : "aim";
    else if (this.hintS && now < this.hintT) name = this.hintS;
    else if (this.overGame) {
      if (this.enemyUnder()) name = "enemy";
      else {
        // 交互物检测不必每帧
        if (this._frame % 4 === 0) this._interact = this.interactUnder();
        if (this._interact) name = "interact";
      }
    }
    this.apply(name, a && a.element);
    // 射程外提示圈（技能色）、标签
    if (a && this._color !== a.color) {
      this._color = a.color;
      this.overEl.style.color = "#" + new THREE.Color(a.color).getHexString();
    }
    const over = !!(a && a.over && name === "aim");
    if (over !== this._over) this.overEl.classList.toggle("on", (this._over = over));
    if (now < this.sayT) this.showLabel(this.label, this.labelTone);
    else if (a && a.label) this.showLabel(a.label, a.bad ? "bad" : "");
    else this.showLabel("", "");
  }
}

let instance = null;
export function mountCursor(ctx) {
  if (!instance) instance = new InkCursor(ctx);
  else if (ctx) instance.ctx = ctx;
  return instance;
}
// 方便其他模块直接 import { cursor }：未挂载时调用是空操作
export const cursor = {
  setState: (n) => instance && instance.setState(n),
  hint: (n, ms) => instance && instance.hint(n, ms),
  say: (t, tone) => instance && instance.say(t, tone),
  get state() {
    return instance ? instance.state : null;
  },
};
