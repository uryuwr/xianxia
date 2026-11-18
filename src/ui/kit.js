// 界面薄组件层（模块 A）：所有流程界面都通过这里搭建，外观来自 UI 设计师的水墨组件库（src/ui/ink/，源自 docs/ui/v2/kit/）。
// 规则见 docs/UI风格指南_v1.md：不画方框；纸边、笔触、圆相、印章；界面里不放 3D 人物（用 2D 立绘）。
//   kit.layer(name, z)          取得 / 创建一个全屏界面层（同名复用）
//   kit.el(tag, cls, html)      创建元素
//   kit.button(label, onClick, { primary, seal, red, small, disabled, title, id, key })
//        次要 .ink-btn ／ 主要 .ink-btn.primary ／ 决断 .ink-seal-btn（启程、回府、突破，两字竖排）
//   kit.panel(title, { cls, alt, slip, sajin, sub })  宣纸面板（返回 { root, body }）
//   kit.itemCell(inst, { onClick, size: "sm"|"lg", cap })   圆相物品格（水墨图标、品质色晕、未鉴定墨拓剪影、数量、仙 / 极角印）
//        更完整的"物品签"（尺寸参数化、选中 / 不可用 / 墨封 / 剪影状态）见 src/ui/icons.js 的 itemTag；kit.itemTag 是同一个函数
//   kit.seal(text, { cls })     印章；kit.bar(v, cls) 一笔进度条（返回元素，改 --v 即可）
//   kit.toast(text, { kind: "warn"|"gold", dur })   通知（宽笔底）
//   kit.confirm(title, text, { ok, cancel }) → Promise<boolean>；kit.prompt(title, text, options[]) → Promise<选中的 value>
import "./ink/strokes.css";
import "./ink/fonts.css";
import "./ink/ink-ui.css";
import "./ink/ink-ui.js";
import { RARITY, defOf, sizeOf, valueOf } from "../core/items.js";
import { iconEl, iconStyle, itemTag } from "./icons.js";
import { pushEsc } from "./esc.js";

const KAI = '"KaiTi","STKaiti","楷体","Kaiti SC",serif';
export const Q_CLASS = ["q-fan", "q-ling", "q-bao", "q-xian", "q-ji"];
const CSS = `
:root { --kai: ${KAI}; --mk-ink: #15181b; --mk-red: #b8291a; --mk-gold: #8a6a22; }
.mk-layer { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: var(--f-kai); color: var(--ink); }
.mk-layer.hidden { display: none; }
.mk-layer > * { pointer-events: auto; }
.mk-layer .mk-pass { pointer-events: none; }
.mk-abs { position: absolute; }
/* 1280×720 基准画布，按窗口等比缩放 */
.mk-stage { position: absolute; left: 50%; top: 50%; width: 1280px; height: 720px; transform: translate(-50%, -50%) scale(var(--mk-scale, 1)); }
.mk-stage > * { position: absolute; }
.mk-paperbg { background: radial-gradient(ellipse 75% 70% at 50% 48%, transparent 58%, rgba(120,100,70,.2) 100%), var(--ink-tex-paper), var(--ink-tex-fiber), var(--paper); background-blend-mode: normal, multiply, multiply, normal; }
.ink-btn.mk-small { font-size: 17px; letter-spacing: .12em; padding: 3px 10px 7px; }
.ink-btn.primary.mk-small { padding: 7px 22px 9px 18px; font-size: 18px; }
.ink-btn.mk-red { color: var(--zhu); }
.ink-btn.mk-red::after { background: var(--zhu); opacity: .55; }
.ink-btn.primary.mk-red { color: var(--paper-hi); }
.ink-btn.primary.mk-red::after { background: var(--zhu); opacity: 1; }
.ink-btn[disabled] { color: var(--ink-qing); cursor: default; }
.ink-btn[disabled]::after { transform: scaleX(.4); background: var(--ink-qing); }
.ink-btn.primary[disabled] { color: var(--paper-hi); opacity: .45; }
.ink-seal-btn[disabled] { background: var(--ink-dan); cursor: default; transform: rotate(-4deg); }
.mk-panel { max-width: 100%; }
.mk-panel > .ink-title { display: flex; align-items: baseline; gap: 14px; margin-bottom: 4px; }
.mk-panel > .ink-title small { font-family: var(--f-ui); font-size: 12px; color: var(--ink-dan); letter-spacing: .04em; }
.mk-panel > .ink-rule { margin: 2px 0 12px; width: 60%; }
.mk-panel h3 { margin: 12px 0 6px; font: 400 19px var(--f-display); letter-spacing: .12em; color: var(--ink-nong); }
.mk-panel h3 small { font-family: var(--f-ui); font-size: 12px; color: var(--ink-dan); letter-spacing: 0; }
.ink-slot { cursor: pointer; user-select: none; }
.ink-slot.mk-sz2 > b { font-size: 1.12em; }
/* 物品格（储物袋 v2）：圆相里是水墨图标，不再是单字；品级色严格取 RARITY */
${RARITY.map((R, i) => `.ink-slot.${["q-fan", "q-ling", "q-bao", "q-xian", "q-ji"][i]}{--qc:${i ? R.color : "var(--ink-dan)"}}`).join(" ")}
.ink-slot.q-ji > i { background: ${RARITY[4].color}; }
.ink-slot > .mk-ico { z-index: 0; --ih: 76%; }
.ink-slot.is-unid > .mk-ico { opacity: .9; }
.ink-slot > .cap { pointer-events: none; }
.mk-cells { display: flex; flex-wrap: wrap; gap: 10px 8px; align-items: flex-start; }
.mk-cells.capped { row-gap: 26px; padding-bottom: 14px; }
.mk-toasts { position: fixed; left: 50%; top: 172px; transform: translateX(-50%); z-index: 60; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; }
.mk-toasts .ink-toast { animation: mkToastIn .3s var(--ease-ink) both, mkToastOut .6s ease var(--hold, 2.2s) forwards; font-size: 17px; }
@keyframes mkToastIn { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes mkToastOut { to { opacity: 0; transform: translateY(-4px); } }
.mk-in { animation: mkPanelIn .45s var(--ease-ink) both; }
@keyframes mkPanelIn { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } } /* 大面积元素进场只做 opacity + transform（不做模糊） */
.mk-modal { position: fixed; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; background: rgba(21,24,27,.35); }
.mk-modal .mk-panel { min-width: 400px; max-width: 580px; }
.mk-modal p { font: 17px/1.75 var(--f-kai); margin: 6px 0 14px; color: var(--ink-nong); }
.mk-modal .acts { display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap; }
.mk-dim { color: var(--ink-dan); } .mk-red { color: var(--zhu); } .mk-gold { color: var(--mk-gold); }
.mk-tip { font: 14px/1.7 var(--f-kai); color: var(--ink-zhong); }
.mk-row { display: flex; align-items: center; gap: 10px; }
.mk-tag { display: inline-block; font: 13px var(--f-kai); padding: 0 6px; color: var(--ink-zhong); }
.mk-tag.high { color: var(--zhu); } .mk-tag.none { color: var(--shilv); }
body.mk-no-dmg #dmg { display: none !important; }
/* "？"注释：悬停显示 data-tip 纸条 */
.mk-q { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; margin-left: 4px; border-radius: 50%; font: 700 11px var(--f-ui); color: var(--ink-zhong); box-shadow: 0 0 0 1px var(--ink-dan) inset; cursor: help; pointer-events: auto; vertical-align: 2px; writing-mode: horizontal-tb; letter-spacing: 0; }
.mk-q:hover { color: var(--ink); box-shadow: 0 0 0 1.5px var(--ink-nong) inset; }
.mk-q::after { content: attr(data-tip); position: absolute; top: calc(100% + 6px); right: -8px; width: 230px; padding: 9px 12px 10px; font: 14px/1.6 var(--f-kai); color: var(--ink); text-align: left; white-space: normal;
  background: var(--paper-hi); box-shadow: 0 4px 12px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; opacity: 0; transform: translateY(-3px); transition: opacity .15s, transform .15s; pointer-events: none; z-index: 5; }
.mk-q.left::after { right: auto; left: -8px; }
.mk-q:hover::after, .mk-q.show::after { opacity: 1; transform: none; }
/* 非出行局时隐藏战斗 HUD */
body:not(.mk-in-run) #hud, body:not(.mk-in-run) .jx-bar, body:not(.mk-in-run) .jx-barmsg, body:not(.mk-in-run) .jx-ebars, body:not(.mk-in-run) #dmg { display: none !important; }
`;

const layers = new Map();
let styled = !1;
function style() {
  if (styled) return;
  styled = !0;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);
  // 界面按 1280×720 基准等比缩放（风格指南 §13.5）
  const fit = () => document.documentElement.style.setProperty("--mk-scale", Math.min(innerWidth / 1280, innerHeight / 720).toFixed(3));
  addEventListener("resize", fit);
  fit();
}
const extraCSS = new Set();
const stop = (e) => e.stopPropagation();

export const kit = {
  KAI,
  // 各界面自己的样式（同 id 只注入一次）
  css(id, text) {
    if (extraCSS.has(id)) return;
    extraCSS.add(id);
    style();
    const st = document.createElement("style");
    st.textContent = text;
    document.head.appendChild(st);
  },
  layer(name, z) {
    style();
    let l = layers.get(name);
    if (!l) {
      l = document.createElement("div");
      l.className = "mk-layer mk-layer-" + name;
      if (z) l.style.zIndex = z;
      document.body.appendChild(l);
      layers.set(name, l);
    }
    return l;
  },
  show(name, on = !0) {
    const l = layers.get(name);
    if (l) l.classList.toggle("hidden", !on);
  },
  clear(name) {
    const l = layers.get(name);
    if (l) l.innerHTML = "";
    return l;
  },
  el(tag, cls, html) {
    style();
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  },
  // 给动态生成的纸面补纸张层（ink-ui.js）
  decorate(root) {
    const els = [...root.querySelectorAll(".ink-paper, .ink-tip")];
    if (root.matches && root.matches(".ink-paper, .ink-tip")) els.unshift(root);
    for (const el of els) if (!el.querySelector(":scope > .ink-sheet")) el.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
    return root;
  },
  button(label, onClick, o = {}) {
    let b;
    if (o.seal) b = kit.el("button", "ink-seal-btn" + (o.small ? " mk-seal-sm" : ""), label);
    else b = kit.el("button", "ink-btn" + (o.primary ? " primary" : "") + (o.red ? " mk-red" : "") + (o.small ? " mk-small" : ""), label + (o.key ? ` <span class="key">${o.key}</span>` : ""));
    if (o.small && o.seal) b.style.setProperty("--s", "72px");
    if (o.disabled) b.disabled = !0;
    if (o.title) b.title = o.title;
    if (o.id) b.dataset.id = o.id;
    b.addEventListener("mousedown", stop);
    b.addEventListener("click", (e) => (e.stopPropagation(), !b.disabled && onClick && onClick(e)));
    return b;
  },
  panel(title, o = {}) {
    const root = kit.el("section", `ink-paper mk-in mk-panel${o.alt ? " alt" : ""}${o.slip ? " slip" : ""}${o.sajin ? " sajin" : ""} ${o.cls || ""}`);
    if (title) {
      root.appendChild(kit.el("div", "ink-title", title));
      root.appendChild(kit.el("div", "ink-rule", ""));
    }
    const body = kit.el("div", "mk-body");
    root.appendChild(body);
    root.addEventListener("mousedown", stop);
    kit.decorate(root);
    return { root, body };
  },
  // 圆相物品格
  itemCell(inst, o = {}) {
    if (!inst) {
      const e = kit.el("div", "ink-slot is-empty " + (o.size || ""), "");
      e.style.cursor = "default";
      return e;
    }
    const d = defOf(inst) || { name: inst.id, glyph: "？" };
    const q = inst.rarity || 0, R = RARITY[q];
    const sz = sizeOf(inst), unid = inst.identified === !1;
    // 图标取自构建期图集（src/ui/icons.js）；未鉴定 = 墨拓剪影。类名 c-<类别> 只作标记（旧的 g-<类别> 写意小图已由图标取代）
    const c = kit.el("div", `ink-slot ${Q_CLASS[q]} c-${d.cat || "x"} ${o.size || ""} ${sz >= 2 ? "mk-sz2" : ""} ${unid ? "is-unid" : ""}`);
    c.innerHTML = `${inst.n > 1 ? `<em>${inst.n}</em>` : ""}${q >= 3 ? `<i>${R.name[0]}</i>` : ""}${o.cap ? `<span class="cap">${o.cap === !0 ? (unid ? "未鉴定" : d.name) : o.cap}</span>` : ""}`;
    c.prepend(iconEl(inst));
    c.title = `${unid ? "未鉴定的" + (d.name || "") : d.name}（${R.name}，${sz} 格，估价 ${valueOf(inst)}）${d.desc ? "\n" + d.desc : ""}`;
    c.dataset.uid = inst.uid;
    if (o.onClick) c.addEventListener("click", (e) => (e.stopPropagation(), o.onClick(inst, c)));
    c.addEventListener("mousedown", stop);
    return c;
  },
  itemTag,
  iconEl,
  iconStyle,
  seal(text, o = {}) {
    const s = kit.el("span", "ink-seal " + (o.cls || "") + ([...text].length === 2 && !o.cls ? " two" : ""), [...text].length === 4 ? [...text].map((ch) => `<span>${ch}</span>`).join("") : text);
    if (o.size) s.style.setProperty("--s", o.size + "px");
    if (o.rot != null) s.style.setProperty("--seal-rot", o.rot + "deg");
    return s;
  },
  // "？"注释
  q(tip, cls = "") {
    const e = kit.el("span", "mk-q " + cls, "？");
    e.dataset.tip = tip;
    e.addEventListener("mousedown", stop);
    return e;
  },
  bar(v, cls = "") {
    const b = kit.el("div", "ink-bar " + cls, "<i></i>");
    b.style.setProperty("--v", Math.max(0, Math.min(1, v)).toFixed(3));
    return b;
  },
  toast(text, o = {}) {
    style();
    let box = document.querySelector(".mk-toasts");
    if (!box) document.body.appendChild((box = kit.el("div", "mk-toasts")));
    const kind = o.kind === "warn" ? "zhu" : o.kind === "gold" ? "gold" : "";
    const t = kit.el("div", "ink-toast " + kind, text);
    const dur = o.dur || 2.2;
    t.style.setProperty("--hold", Math.max(0.3, dur - 0.6) + "s");
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), dur * 1000);
    return t;
  },
  confirm(title, text, o = {}) {
    return kit.prompt(title, text, [
      { label: o.cancel || "再想想", value: !1 },
      { label: o.ok || "确定", value: !0, primary: !0 },
    ]);
  },
  prompt(title, text, options) {
    style();
    return new Promise((res) => {
      const m = kit.el("div", "mk-modal");
      const p = kit.panel(title, { alt: !0 });
      p.body.appendChild(kit.el("p", "", text));
      const acts = kit.el("div", "acts");
      // Esc = 取消：标了 esc 的选项 → 值为假的选项（再想想 / 算了 / 不跳过）→ 只有一个选项时就是它（知道了）；都没有则 Esc 不关（src/ui/esc.js）
      const escOp = options.find((o) => o.esc) || options.find((o) => !o.value) || (options.length === 1 ? options[0] : null);
      let popEsc = null;
      const done = (op) => (popEsc && popEsc(), m.remove(), res(op.value));
      for (const op of options) acts.appendChild(kit.button(op.label, () => done(op), { primary: op.primary, red: op.red, small: options.length > 3 }));
      p.body.appendChild(acts);
      m.appendChild(p.root);
      m.addEventListener("mousedown", stop);
      document.body.appendChild(m);
      popEsc = pushEsc(() => escOp && done(escOp), { block: !0, el: m });
    });
  },
};
