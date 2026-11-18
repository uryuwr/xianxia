// 搜取窗口 v2：墨封宣纸格 + 物品签（docs/ui/v2/搜取_v1.md §9，草图 docs/ui/v2/loot_v2/index.html）。
// 只订阅 run.containers 的事件、调用 open / take / takeAll / close，不改规则。
//   - 宣纸小幅浮在容器旁（跟随容器的屏幕位置，靠屏幕边缘时换到另一侧、上下夹在 HUD 之间）；标题 + 右上"识"印与当前神识
//   - 格子 = 储物袋同一种物品签（src/ui/icons.js itemTag，52px，最多 4 列、多行；大件 2×1 长圆 / 2×2 大圆）
//   - 探查（每格时长不变）分两段：神识一笔走到 62% → 墨封化开、露出墨拓剪影（探得其形）；走满一圈 → 换本色、外圈晕品质色（辨得其色），
//     名称在宣纸底部浮出 1.2 秒。仙品顿笔泛金；极品朱金迸开 + 顿帧 0.07 秒
//   - 神识 ≥ 40：墨封下隐约浮现剪影轮廓（预感），神识越高越明显
//   - 未鉴定：揭示后保持墨拓剪影 + "？"（与储物袋一致）
//   - 悬停 / 揭示：底部"名称 · 品质 · ×数量"；点格子取一件；F 全取；Esc 收起
// 性能：图标来自图集（CSS 背景），不每格生成；每帧只在进度变化 ≥ 0.5% 时写 CSS 变量和笔尖位置；动画只动 opacity / transform。
import "./loot_window.css";
import * as THREE from "three";
import { kit } from "./kit.js";
import { RARITY, defOf } from "../core/items.js";
import { SEARCH } from "../game/run/containers.js";
import { itemTag, setTagState, tagReveal } from "./icons.js";
import { ensureGatherStyles } from "./gather_ui.js";
import { rarityTint, css } from "../fx/rarity_tint.js";

const _v = new THREE.Vector3();
const TIP = [0.55, 0.7, 0.85, 1, 1]; // 笔尖光亮度（按品质）
const TIP_S = [0.8, 0.9, 1.05, 1.25, 1.4];
const FORM = 0.62; // 走到这里墨封化开、露形
const CELL = 52, GAP = 6;
const NAME_HOLD = 1200;

export class LootWindow {
  constructor(ctx, run, gather) {
    ensureGatherStyles();
    this.ctx = ctx;
    this.run = run;
    this.gather = gather; // 拾取飞入储物袋复用 GatherUI.fly（飞的是同一张物品签）
    this.L = kit.layer("loot", 24);
    kit.clear("loot");
    kit.show("loot", !0);
    this.c = null;
    this.el = null;
    this.stats = { open: 0, form: 0, reveal: 0, take: 0, full: 0, interrupt: 0 };
    const C = run.containers;
    this.off = C ? C.on((t, d) => this.on(t, d)) : null;
    // Esc 收起（捕获阶段，先于暂停菜单）
    this.onKey = (e) => {
      if (e.code !== "Escape" || !this.c || !C || C.openC !== this.c) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      C.close("esc");
    };
    addEventListener("keydown", this.onKey, !0);
  }
  on(type, d) {
    const c = d && d.c;
    if (type === "open") return this.build(c);
    if (!this.c || c !== this.c) {
      if (type === "close" && c) this.msg(c, d.reason);
      return;
    }
    if (type === "close") return this.close(d.reason);
    if (type === "add") return this.build(c, !0);
    const e = this.cells && this.cells[d.i];
    if (type === "searchStart") {
      if (!e) return;
      e.classList.remove("is-hidden", "omen");
      e.classList.add("is-search");
    } else if (type === "progress") {
      if (!e) return;
      const v = shape(d.v, d.slot.inst.rarity || 0);
      if (Math.abs((e._v ?? -1) - v) < 0.005 && v < 1) return; // 限频：变化 < 0.5% 不写
      e._v = v;
      e.style.setProperty("--v", v.toFixed(3));
      const a = v * Math.PI * 2 - Math.PI / 2;
      e._tip.style.transform = `translate(${(Math.cos(a) * e._rx).toFixed(1)}px, ${(Math.sin(a) * e._ry).toFixed(1)}px) scale(var(--tipS, 1))`;
      if (d.v >= FORM && !e._form) this.form(e);
    } else if (type === "reveal") {
      if (!e) return;
      this.reveal(e, d.rarity || 0, !0);
    } else if (type === "take") {
      this.stats.take++;
      if (e) {
        e.classList.remove("is-shown", "rev-3", "rev-4");
        e.classList.add("is-taken");
        // 飞入起点：用打开窗口时缓存的格心偏移 + 当前位移（取物时刚改过 DOM，再读布局会强制重排）
        if (this.gather && this.gather.fly) {
          if (e._cx != null) this.gather.fly(d.inst, this.ox + (this.el._tx || 0) + e._cx, this.oy + (this.el._ty || 0) + e._cy);
          else {
            const b = e._tag.getBoundingClientRect();
            this.gather.fly(d.inst, b.left + b.width / 2, b.top + b.height / 2);
          }
        }
      }
      this.status();
    } else if (type === "full") {
      this.stats.full++;
      if (e) {
        setTagState(e._tag, { nofit: !0 });
        e.classList.remove("nofit");
        void e.offsetWidth;
        e.classList.add("nofit");
        setTimeout(() => setTagState(e._tag, { nofit: !1 }), 900);
      }
      this.say(`<span class="bad">储物袋放不下</span>`, 1600);
    }
  }
  // 第一段：墨封化开，露出墨拓剪影
  form(e) {
    e._form = !0;
    this.stats.form++;
    e.classList.add("is-form");
    setTagState(e._tag, { sealed: !1 });
  }
  // 第二段：换本色（未鉴定保持剪影）、外圈晕品质色；名称浮出
  reveal(e, q, anim) {
    if (!e._form) (e._form = !0), setTagState(e._tag, { sealed: !1 });
    e.classList.remove("is-search", "is-hidden", "is-form", "omen");
    e.classList.add("is-shown");
    if (!e._unid) setTagState(e._tag, { sil: !1 });
    if (!anim) return;
    this.stats.reveal++;
    if (!e._unid) tagReveal(e._tag);
    e.classList.add("rev");
    if (q >= 3) e.classList.add("rev-" + Math.min(4, q));
    if (q >= 4 && this.ctx.world.hitStop) this.ctx.world.hitStop(0.07);
    setTimeout(() => e.classList.remove("rev"), 700);
    this.say(nameHtml(e._inst), NAME_HOLD);
  }
  build(c, keep) {
    if (!c) return;
    if (this.el && !keep) this.el.remove();
    this.c = c;
    this.stats.open++;
    this.tx = this.ty = this.w = this.h = null; // 新窗口：重新量尺寸、重新定位
    const r = this.run, sense = Math.round(SEARCH.sense(r)), omen = SEARCH.foresee(r);
    const units = c.slots.reduce((s, q) => s + (q.size >= 4 ? 4 : q.size >= 2 ? 2 : 1), 0);
    const wide = c.slots.some((q) => q.size >= 2);
    const cols = Math.max(wide ? 2 : 1, Math.min(4, units <= 4 ? units : 4));
    const [nm, kind] = title(c);
    const el = keep && this.el ? this.el : kit.el("div", "mk-loot");
    el.innerHTML = `<div class="sheet"><div class="hd"><span class="t">${nm}${kind ? `<small>·</small>${kind}` : ""}</span><span class="sense" title="神识：探查时长 ×100/(100+神识)；≥${SEARCH.foreseeAt} 时墨封下隐约浮现物形"><i>识</i><b>${sense}</b></span></div><div class="rule"></div>
      <div class="grid" style="--cols:${cols}"></div><div class="nm st"></div><div class="ft"><span class="all">全取<u>F</u></span><span>收起<u>Esc</u></span></div></div>`;
    const grid = el.querySelector(".grid");
    this.cells = c.slots.map((s, i) => grid.appendChild(this.cell(s, i, omen)));
    this.nmEl = el.querySelector(".nm");
    el.querySelector(".all").addEventListener("click", (e) => (e.stopPropagation(), r.containers.takeAll(c)));
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    if (!keep) this.L.appendChild(el);
    this.el = el;
    this.status();
    this.place(!0);
  }
  cell(s, i, omen) {
    const inst = s.inst, q = Math.min(4, inst.rarity || 0), unid = inst.identified === !1;
    const box = s.size >= 4 ? "big" : s.size >= 2 ? "w2" : "";
    const e = kit.el("div", `lw-cell ${box}${unid ? " unid" : ""}`);
    e.dataset.i = i;
    e.dataset.q = q;
    const tag = itemTag(inst, { size: CELL, gap: GAP, sealed: !0, sil: !0, title: "" });
    e.appendChild(tag);
    e.insertAdjacentHTML("beforeend", `<i class="sense"></i><i class="tip"></i><span class="unk">？</span>` + (q >= 4 ? `<i class="burst">${[0, 45, 90, 135, 180, 225, 270, 315].map((a, k) => `<s style="--a:${a}deg;--bc:var(${k % 2 ? "--spark3" : "--spark4"})"></s>`).join("")}</i>` : ""));
    e._tag = tag;
    e._tip = e.querySelector(".tip");
    e._inst = inst;
    e._unid = unid;
    // 笔尖沿圆相（长圆）的半径：按占格算，不读布局
    e._rx = (s.size >= 2 ? CELL * 2 + GAP : CELL) / 2;
    e._ry = (s.size >= 4 ? CELL * 2 + GAP : CELL) / 2;
    e.style.setProperty("--tipA", TIP[q]);
    e.style.setProperty("--tipS", TIP_S[q]);
    // 按当前状态还原（断点续探、追加物品时重建）
    if (s.state === "taken") (e._form = !0), setTagState(tag, { sealed: !1, sil: unid }), e.classList.add("is-taken");
    else if (s.state === "shown") this.reveal(e, q, !1);
    else if (s.state === "search") {
      e.classList.add("is-search");
      const v = s.need ? s.t / s.need : 0;
      e.style.setProperty("--v", shape(v, q).toFixed(3));
      if (v >= FORM) (e._form = !0), e.classList.add("is-form"), setTagState(tag, { sealed: !1 });
    } else {
      e.classList.add("is-hidden");
      if (omen > 0) e.classList.add("omen"), e.style.setProperty("--omen", omen.toFixed(2));
    }
    e.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const c = this.c, sl = c && c.slots[i];
      if (sl && sl.state === "shown") this.run.containers.take(c, i);
    });
    e.addEventListener("mouseenter", () => e.classList.contains("is-shown") && this.say(nameHtml(inst), 0));
    e.addEventListener("mouseleave", () => this.status());
    return e;
  }
  // 底部名称行：揭示 / 悬停时"名称 · 品质 · ×数量"，平时是状态小字
  say(html, hold) {
    if (!this.nmEl) return;
    this.nmEl.classList.remove("st");
    this.nmEl.innerHTML = html;
    clearTimeout(this.sayT);
    if (hold) this.sayT = setTimeout(() => this.status(), hold);
  }
  status() {
    if (!this.nmEl || !this.c) return;
    let hidden = 0, left = 0;
    for (const s of this.c.slots) (s.state === "hidden" || s.state === "search") && hidden++, s.state !== "taken" && left++;
    this.nmEl.classList.add("st");
    this.nmEl.textContent = hidden ? `余 ${hidden} 格未明` : left ? `余 ${left} 件 · 点选取物` : "";
  }
  close(reason) {
    const el = this.el, c = this.c;
    clearTimeout(this.sayT);
    this.el = this.c = this.cells = this.nmEl = null;
    if (el) {
      el.classList.add("out");
      setTimeout(() => el.remove(), 240);
    }
    if (c) this.msg(c, reason);
  }
  msg(c, reason) {
    const text = { hit: "受击 · 搜取中断", move: "走动 · 收起" }[reason];
    if (!text) return;
    if (reason === "hit") this.stats.interrupt++;
    const at = this.screen(c.pos, 1.3);
    if (!at) return;
    const m = kit.el("div", "mk-loot-msg" + (reason === "move" ? " ink" : ""), text);
    m.style.left = at.x + "px";
    m.style.top = at.y + "px";
    this.L.appendChild(m);
    setTimeout(() => m.remove(), 1300);
  }
  screen(pos, h = 0) {
    _v.set(pos.x, pos.y + h, pos.z).project(this.ctx.camera);
    if (_v.z > 1) return null;
    return { x: ((_v.x + 1) / 2) * innerWidth, y: ((1 - _v.y) / 2) * innerHeight };
  }
  // 跟随容器：放在容器右侧（靠右边缘时换到左侧），上下夹在顶部 HUD 与底部技能栏之间
  place(force) {
    const el = this.el, c = this.c;
    if (!el || !c) return;
    const at = this.screen(c.pos, 0.9);
    if (!at) return;
    if (force || !this.k) this.k = Number(getComputedStyle(document.documentElement).getPropertyValue("--mk-scale")) || 1; // 只在打开时读一次
    const k = this.k;
    const w = (this.w = force || !this.w ? el.firstElementChild.offsetWidth * k : this.w), h = (this.h = force || !this.h ? el.firstElementChild.offsetHeight * k : this.h);
    if (force) {
      // 打开 / 重建时布局已读过一次：顺手记下各格中心相对窗口的偏移（取物飞入动效用，之后不再读布局）
      const er = el.getBoundingClientRect();
      this.ox = er.left - (el._tx || 0);
      this.oy = er.top - (el._ty || 0);
      for (const e of el.querySelectorAll(".lw-cell")) {
        const r = e._tag.getBoundingClientRect();
        e._cx = r.left + r.width / 2 - er.left;
        e._cy = r.top + r.height / 2 - er.top;
      }
    }
    const gap = 64 * k;
    let x = at.x + gap;
    if (x + w > innerWidth - 230 * k) x = at.x - gap - w; // 右上有天机镜与灵值，右侧留宽一些
    x = Math.max(16, Math.min(innerWidth - w - 16, x));
    const y = Math.max(110 * k, Math.min(innerHeight - h - 130 * k, at.y - h * 0.55));
    const tx = Math.round(x), ty = Math.round(y);
    if (tx !== this.tx || ty !== this.ty || el._tx !== tx || el._ty !== ty) (this.tx = el._tx = tx), (this.ty = el._ty = ty), (el.style.transform = `translate(${tx}px, ${ty}px)`);
  }
  update() {
    if (this.el) this.place();
  }
  dispose() {
    removeEventListener("keydown", this.onKey, !0);
    clearTimeout(this.sayT);
    this.off && this.off();
    kit.clear("loot");
    kit.show("loot", !1);
  }
}

// "名称 · 品质 · ×数量"：名称字色取 RARITY（凡品用浓墨）
function nameHtml(inst) {
  const d = defOf(inst) || {}, q = Math.min(4, inst.rarity || 0);
  const col = q ? css(rarityTint(q).text) : "var(--ink-nong)";
  return `<span style="color:${col}">${inst.identified === !1 ? "未鉴定的" : ""}${d.name || inst.id}</span><small> · ${RARITY[q].name}${inst.n > 1 ? " · ×" + inst.n : ""}</small>`;
}
// 标题："竹林狼妖遗骸" → ["竹林狼妖", "遗骸"]；宝箱直接用名称
function title(c) {
  if (c.kind === "corpse" && c.label.endsWith("遗骸")) return [c.label.slice(0, -2), "遗骸"];
  return [c.label, ""];
}
// 显示用的笔走进度：仙品 / 极品画到最后"顿一下"（逻辑进度线性，这里只改笔的位置）
function shape(v, q) {
  v = Math.max(0, Math.min(1, v));
  if (q < 3) return v;
  const a = q >= 4 ? 0.72 : 0.78, hold = q >= 4 ? 0.2 : 0.14, top = 0.93;
  if (v < a) return (v / a) * top;
  if (v < a + hold) return top;
  return top + ((v - a - hold) / (1 - a - hold)) * (1 - top);
}
