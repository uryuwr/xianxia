// 洞府界面的小部件（模块 C）：名牌、左上境界、待办、交互提示、玄机子台词、提示条、确认框。
import { RARITY, defOf } from "../../core/items.js";
import { iconEl } from "../icons.js";
import { pushEsc } from "../esc.js";

export const Q = ["q-fan", "q-ling", "q-bao", "q-xian", "q-ji"];
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
// 纸张面板（带毛边纸层）
export function paper(cls = "", html) {
  const e = el("div", "ink-paper " + cls, html);
  e.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
  return e;
}
export function btn(label, onClick, o = {}) {
  const b = el("button", (o.seal ? "ink-seal-btn" : "ink-btn") + (o.primary ? " primary" : "") + (o.disabled ? " is-disabled" : "") + (o.cls ? " " + o.cls : ""), label);
  if (o.key) b.insertAdjacentHTML("beforeend", ` <span class="key">${o.key}</span>`);
  if (o.title) b.title = o.title;
  if (o.id) b.dataset.act = o.id;
  if (o.style) b.style.cssText = o.style;
  b.addEventListener("mousedown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!b.classList.contains("is-disabled") && onClick) onClick(e);
  });
  return b;
}
// 物品：圆相墨圈
export function slot(inst, o = {}) {
  const d = (inst && defOf(inst)) || {};
  const s = el("div", `ink-slot ${o.size || ""} ${inst ? Q[inst.rarity || 0] : "is-empty"} ${inst && inst.identified === !1 ? "is-unid" : ""} ${o.cls || ""}`);
  if (inst) {
    // 物品图标（src/ui/icons.js 图集；未鉴定自动墨拓剪影）
    s.appendChild(iconEl(inst, { box: "1x1" }));
    s.insertAdjacentHTML("beforeend", `${inst.n > 1 ? `<em>${inst.n}</em>` : ""}${(inst.rarity || 0) >= 3 ? `<i>${RARITY[inst.rarity].name[0]}</i>` : ""}`);
    s.title = itemTitle(inst);
    void d;
  } else if (o.glyph) s.innerHTML = `<b style="opacity:.35">${o.glyph}</b>`;
  if (o.cap) s.insertAdjacentHTML("beforeend", `<span class="cap">${o.cap}</span>`);
  if (o.onClick) s.addEventListener("click", (e) => (e.stopPropagation(), o.onClick(inst, s)));
  s.addEventListener("mousedown", (e) => e.stopPropagation());
  return s;
}
export function itemName(inst) {
  const d = defOf(inst) || {};
  if (inst.identified === !1) return "未鉴定的" + (d.name || "物品");
  if (d.seed) return `${d.name}（${["十年", "五十年", "百年", "三百年", "千年"][inst.rarity || 0]} · ${RARITY[inst.rarity || 0].name}）`;
  return d.name || inst.id;
}
export function itemTitle(inst) {
  const d = defOf(inst) || {};
  return `${itemName(inst)}（${RARITY[inst.rarity || 0].name}）${d.desc ? "\n" + d.desc : ""}`;
}
export const rcolor = (inst) => RARITY[(inst && inst.rarity) || 0].color;

// ---------------- 设施挂签（钉在 3D 画面里） ----------------
export class Tags {
  constructor(root, onClick) {
    this.box = el("div", "cv-tags");
    root.appendChild(this.box);
    this.map = {};
    this.onClick = onClick;
  }
  // { name, lv 阶, hint 旁注（可含 <b>），dot 可办红点, locked }
  set(id, o) {
    let t = this.map[id];
    if (!t) {
      t = this.map[id] = el("div", "cv-tag");
      t.dataset.st = id;
      t.addEventListener("mousedown", (e) => e.stopPropagation());
      t.addEventListener("click", (e) => (e.stopPropagation(), this.onClick(id)));
      this.box.appendChild(t);
    }
    const key = JSON.stringify(o);
    if (t._k === key) return;
    t._k = key;
    t.innerHTML = "";
    const slip = paper("slip ink-tag" + (o.locked ? " locked" : o.dot ? " on" : ""), `${o.name}${o.lv ? `<small>${o.lv}</small>` : ""}${o.dot ? "<s></s>" : ""}`);
    t.appendChild(slip);
    if (o.hint) t.appendChild(el("span", "hint", o.hint));
    t.appendChild(el("span", "key", "F"));
  }
  // 每帧：挂签的绳头钉在 3D 锚点的屏幕位置
  place(id, x, y, visible, near) {
    const t = this.map[id];
    if (!t) return;
    const k = this.k || 1;
    const tf = `translate(${x.toFixed(1)}px, ${(y + 30 * k).toFixed(1)}px) translateX(-50%) scale(${k})`;
    if (t._tf !== tf) (t.style.transform = tf), (t._tf = tf), (t.style.transformOrigin = "50% 0");
    if (t._show !== visible) (t.classList.toggle("show", visible), (t._show = visible));
    t.classList.toggle("near", !!near);
  }
  hide(on) {
    this.box.style.display = on ? "none" : "";
  }
}

// ---------------- 玄机子说话 ----------------
export class Say {
  constructor(root) {
    this.root = root;
    this.q = [];
    this.box = null;
  }
  say(lines, who = "玄机子") {
    for (const l of [].concat(lines)) this.q.push({ l, who });
    if (!this.box) this.next();
  }
  next() {
    if (this.box) this.box.remove();
    this.box = null;
    clearTimeout(this.tm);
    const it = this.q.shift();
    if (!it) return;
    this.shown = (this.shown || 0) + 1;
    this.paused = 0;
    const b = (this.box = el("div", "cv-say ink-say"));
    b.innerHTML = `<div class="who">${it.who}<span class="ink-seal" style="--s:26px">${it.who === "林墨" ? "墨" : "玄"}</span></div>`;
    const tip = paper("", "");
    tip.className = "ink-tip";
    tip.insertAdjacentHTML("beforeend", `<div class="line">${it.l}</div>${this.q.length ? '<div class="more">点击继续</div>' : ""}`);
    b.appendChild(tip);
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    b.addEventListener("click", () => this.next());
    this.root.appendChild(b);
    this.tm = setTimeout(() => this.next(), 2600 + it.l.length * 140);
  }
  clear() {
    this.q = [];
    this.next();
  }
}

// ---------------- 提示条 ----------------
// action = { label, onClick, id }：提示条上带一个按钮（例如参悟后"去装配"）
export function toast(root, text, kind = "", dur = 2.4, icon = null, action = null) {
  let box = root.querySelector(".cv-toasts");
  if (!box) root.appendChild((box = el("div", "cv-toasts")));
  const t = el("div", "ink-toast " + kind, text);
  if (icon) {
    const w = el("span", "cv-toast-ico");
    w.appendChild(icon);
    t.prepend(w);
  }
  if (action) {
    t.classList.add("has-act");
    t.appendChild(btn(action.label, () => (t.remove(), action.onClick()), { id: action.id, cls: "cv-toast-act" }));
  }
  t.style.setProperty("--d", dur + "s");
  box.appendChild(t);
  setTimeout(() => t.remove(), dur * 1000);
  return t;
}
// ---------------- 确认（§5.15：压一层墨，中间一张纸，次要按钮 + 朱印） ----------------
// extra = { label, onClick, id }：确认框里多一个不关框的按钮（例如心魔劫前"调整功法"）
export function confirm(root, title, text, { ok = "确定", cancel = "再想想", seal = !1, extra = null } = {}) {
  return new Promise((res) => {
    const m = el("div", "cv-modal");
    const p = paper("alt");
    p.insertAdjacentHTML("beforeend", `<div class="ink-title">${title}</div><div class="ink-rule short" style="margin:6px 0"></div><p>${text}</p>`);
    const acts = el("div", "acts");
    if (extra) acts.appendChild(btn(extra.label, () => extra.onClick(), { id: extra.id }));
    const done = (v) => (popEsc(), m.remove(), res(v));
    acts.appendChild(btn(cancel, () => done(!1), { id: "cancel" }));
    acts.appendChild(btn(ok, () => done(!0), { primary: !seal, seal, id: "ok" }));
    p.appendChild(acts);
    m.appendChild(p);
    m.addEventListener("mousedown", (e) => e.stopPropagation());
    root.appendChild(m);
    const popEsc = pushEsc(() => done(!1), { el: m }); // Esc = 再想想（src/ui/esc.js 弹层栈；叠在上面的功法匣先关）。不截其它键：炼丹离炉确认框要 Enter 离炉
  });
}
