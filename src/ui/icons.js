// 物品图标与"物品签"（储物袋 v2，docs/ui/v2/储物袋_v2_方案.md）
// 图标由 tools/icons_gen.mjs 在构建期烘焙成图集（src/ui/icons/items.webp 主图 + items_sil.webp 墨拓剪影 + items.json），
// 运行时只是 CSS 背景取图：零绘制、零解码开销（图集各只下载 / 解码一次；剪影图集用到时才加载）。
//
// ── 接口 ─────────────────────────────────────────────────────────────
//   iconFor(x, { box, sil })  → { url, x, y, w, h, W, H, key, fallback }
//        x：物品实例 inst 或物品 id。box："1x1"（默认）| "2x1"（2 格横图，有横构图时用横图，否则用方图居中）| "2x2"
//        sil：true = 墨拓剪影；省略时按实例 identified === false 自动取剪影（未鉴定）
//        没烘焙过的新物品：按类别兜底（_cat_<cat>），再不行用 _generic，不报错
//   iconStyle(x, opts)        → 内联 CSS 字符串（background-image / size / position + --ar 宽高比），可自己挂到任意元素
//   iconEl(x, { box, sil, cls, h }) → <span class="mk-ico">（绝对定位、居中、按图标宽高比；h = 高度占父元素的百分比，默认 84%）
//   itemTag(inst, o)          → 物品签 <div class="mk-tok">：一笔圆相 + 图标 + 品质晕 + 数量 + 仙 / 极角印（与搜取窗口同一套）
//        o.size  签边长 px（40 / 52 / 74 常用；默认 52）；o.box 占格 "1x1" | "2x1" | "2x2"（默认按物品占格：1→1x1, 2→2x1, 4→2x2；o.box="1x1" 可强制方签）
//        o.gap   多格签的格间距 px（默认 4）
//        o.count 显示数量（默认 true）；o.cap 签下小字（true = 物品名）；o.title 悬停文字（默认 名称 / 品级 / 占格 / 估价）
//        状态：o.sel 选中（圆相转朱）｜o.disabled 不可用（整体淡）｜o.sealed 墨封遮罩（未探查，盖一团浓墨）
//             ｜o.sil 强制剪影（"先露形、后显色"的第一段）｜o.isNew 新得朱点｜o.nofit 放不下（朱色淡圆相 + 半透明）
//             未鉴定（inst.identified === false）自动用剪影 + 呼吸晕
//        o.onClick(inst, el)
//   setTagState(el, { sel, disabled, sealed, sil, nofit, isNew }) → 切换状态（sil 会换图）
//   tagReveal(el)             → 剪影 → 彩图的揭示（加 .rev，0.45s 墨晕开）
//   ICONS                     → 原始 items.json（rects、模板名、类别），给 3D sprite 等取 UV 用
//   iconForSkill(id)          → 技能图标（意象写意）{ url, x, y, w, h, W, H, key } | null（没有图标时返回 null，调用方退回单字）
//        id：法术 id（sword_qi / fire_talisman / frost / vine / earth_shield / rock / thunder）、法宝 id（flying_sword / seal / gourd）、
//            阵盘 id（sword_array / fire_array / spirit_array）、心法 id（XINFA 的键）、"attack" 普攻、"charge" 蓄势斩
//   skillIconStyle(id) / skillIconEl(id, { h }) → 同 iconStyle / iconEl
//   atlasImage(which)         → Promise<HTMLImageElement>（canvas / 3D 贴图合成用，只加载一次）：false 主图集 / true 剪影 / "map" 地图图集
//   iconForMap(kind, state)   → 地图图标（剪影意象，docs/ui/v2/png/map_icons_compare.png 甲）{ x, y, w, h, alpha, over } | null
//        kind：player / gate / ruin / ruin_true / ruin_fake / boss_exit / cave / mob / elite / boss / boss_dead / shield_<五行> /
//              chest / chest_night / chest_glow / herb / ore / glow / soil / den / flag / yuan / lostbag / tide / pin
//        state：cleared 已清 / opened 已开 / searched 已搜 / empty 取空 / done 已采·已了 / old 旧日所见 / slain 已斩（省略 = 常态）
//        over：叠加在右下角的"勾 / 朱斜笔"在图集里的坐标（无则 null）；alpha：建议透明度
//   mapIconStyle(kind)        → 内联 CSS（图例等 DOM 用）
//
// ── 示例 ─────────────────────────────────────────────────────────────
//   import { itemTag, iconEl, setTagState, tagReveal } from "./icons.js";
//   grid.appendChild(itemTag(inst, { size: 52, onClick: (it) => select(it) }));            // 储物袋 / 搜取格
//   detail.appendChild(itemTag(inst, { size: 74, box: "1x1", count: false }));              // 详情大图
//   const t = itemTag(inst, { size: 52, sealed: true, sil: true }); …                       // 搜取：墨封
//   setTagState(t, { sealed: false });  /* 露形（剪影）*/  setTagState(t, { sil: false }); tagReveal(t); /* 显色 */
//   cell.appendChild(iconEl("huichun_dan"));                                                 // 只要图标（父元素需 position: relative）
//
// 规则：品级只由圆相颜色、同色晕、名称字色、仙 / 极角印表达，颜色严格取 src/core/items.js RARITY；图标是物品本色，不随品级变色。
import META from "./icons/items.json";
import MAIN_URL from "./icons/items.webp";
import SIL_URL from "./icons/items_sil.webp";
import MAP_URL from "./icons/items_map.webp";
import { RARITY, defOf, sizeOf, valueOf } from "../core/items.js";

export const ICONS = META;
const URLS = { main: MAIN_URL, sil: SIL_URL, map: MAP_URL };

export function iconFor(x, o = {}) {
  const inst = x && typeof x === "object" ? x : null;
  const id = inst ? inst.id : x;
  const sil = o.sil ?? (inst ? inst.identified === !1 : !1);
  const tab = sil ? META.sil : META.main;
  let key = id, fallback = !1;
  if (!sil && o.box === "2x1" && tab.rects[id + "@w"]) key = id + "@w";
  if (!tab.rects[key]) {
    fallback = !0;
    const d = defOf({ id }) || {};
    key = tab.rects["_cat_" + (d.cat || META.cat[id])] ? "_cat_" + (d.cat || META.cat[id]) : "_generic";
  }
  const [rx, ry, w, h] = tab.rects[key];
  return { url: sil ? URLS.sil : URLS.main, x: rx, y: ry, w, h, W: tab.W, H: tab.H, key, fallback };
}
const SK_ALIAS = { flying_sword: "art_flying_sword", seal: "art_seal", gourd: "art_gourd", charged: "charge", mom_slash: "charge" };
export function iconForSkill(id) {
  const key = "sk:" + (SK_ALIAS[id] || id), r = META.main.rects[key];
  if (!r) return null;
  return { url: URLS.main, x: r[0], y: r[1], w: r[2], h: r[3], W: META.main.W, H: META.main.H, key };
}
function styleOf(r) {
  return `background-image:url("${r.url}");background-size:${pct(r.W, r.w)} ${pct(r.H, r.h)};background-position:${pct(r.x, r.W - r.w)} ${pct(r.y, r.H - r.h)};--ar:${(r.w / r.h).toFixed(3)}`;
}
export function skillIconStyle(id) {
  const r = iconForSkill(id);
  return r ? styleOf(r) : "";
}
export function skillIconEl(id, o = {}) {
  ensureStyle();
  const st = skillIconStyle(id);
  if (!st) return null;
  const e = document.createElement("span");
  e.className = "mk-ico" + (o.cls ? " " + o.cls : "");
  e.setAttribute("style", st + (o.h ? `;--ih:${o.h}` : ""));
  e.setAttribute("aria-hidden", "true");
  return e;
}
const MAP_STATE = {
  cleared: { alpha: 0.4, over: "tick" }, opened: { alpha: 0.7, open: 1 }, searched: { alpha: 0.6, open: 1, over: "tick" }, empty: { alpha: 0.35, open: 1, over: "tick" },
  done: { alpha: 0.35, over: "tick" }, old: { alpha: 0.45 }, slain: { alpha: 0.7, over: "slash" },
};
// 地图图标在单独的 64px 小图集（items_map.webp）里：canvas 用 atlasImage("map") 取图
const MAPT = META.map || { rects: {} };
const rect = (key) => { const r = MAPT.rects[key]; return r && { x: r[0], y: r[1], w: r[2], h: r[3] }; };
export function iconForMap(kind, state) {
  const st = (state && MAP_STATE[state]) || null;
  let key = "map:" + kind;
  if (st && st.open && MAPT.rects[key + "_open"]) key += "_open";
  const r = rect(key);
  if (!r) return null;
  return { ...r, key, alpha: st ? st.alpha : 1, over: st && st.over ? rect("map:" + st.over) : null };
}
export function mapIconStyle(kind) {
  const r = MAPT.rects["map:" + kind];
  return r ? styleOf({ url: URLS.map, x: r[0], y: r[1], w: r[2], h: r[3], W: MAPT.W, H: MAPT.H }) : "";
}
const imgs = {};
export function atlasImage(sil = !1) {
  const k = sil === "map" ? "map" : sil ? "sil" : "main";
  return (imgs[k] ||= new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = URLS[k];
  }));
}
const pct = (a, b) => (b ? (a / b) * 100 : 0).toFixed(4) + "%";
// 内联样式按 物品 id × 占格 × 剪影 缓存（储物袋每次刷新、搜取窗每格都要取，结果只取决于这三项）
const STYLES = new Map();
export function iconStyle(x, o = {}) {
  const inst = x && typeof x === "object" ? x : null;
  const id = inst ? inst.id : x;
  const sil = !!(o.sil ?? (inst ? inst.identified === !1 : !1));
  const k = id + "|" + (o.box || "") + (sil ? "|s" : "");
  let s = STYLES.get(k);
  if (s === undefined) STYLES.set(k, (s = styleOf(iconFor(id, { box: o.box, sil }))));
  return s;
}
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
export function iconEl(x, o = {}) {
  ensureStyle();
  const e = document.createElement("span");
  e.className = "mk-ico" + (o.cls ? " " + o.cls : "");
  e.setAttribute("style", iconStyle(x, o) + (o.h ? `;--ih:${o.h}` : ""));
  e.setAttribute("aria-hidden", "true");
  return e;
}

const BOX = (sz) => (sz >= 4 ? "2x2" : sz >= 2 ? "2x1" : "1x1");
export function itemTag(inst, o = {}) {
  ensureStyle();
  const d = defOf(inst) || { name: inst.id };
  const q = Math.max(0, Math.min(4, inst.rarity || 0)), R = RARITY[q];
  const box = o.box || BOX(sizeOf(inst));
  const [bw, bh] = box.split("x").map(Number);
  const size = o.size || 52, gap = o.gap ?? 4;
  const unid = inst.identified === !1;
  const e = document.createElement("div");
  e.className = `mk-tok q${q} b${box}${unid ? " is-unid" : ""}`;
  e.style.cssText = `--tok:${size}px;width:${bw * size + (bw - 1) * gap}px;height:${bh * size + (bh - 1) * gap}px`;
  e.dataset.uid = inst.uid || "";
  e.dataset.id = inst.id;
  e._inst = inst;
  e._box = box;
  // 一次解析整段（与原来逐段 append 的结构、顺序完全一致：halo, ring, mk-ico, em?, cs?, seal, nd, cap?）
  e.innerHTML =
    `<i class="halo"></i><i class="ring"></i><span class="mk-ico" style='${escAttr(iconStyle(inst, { box, sil: o.sil ?? unid }))}' aria-hidden="true"></span>` +
    (o.count !== !1 && inst.n > 1 ? `<em>${inst.n}</em>` : "") +
    (q >= 3 && o.cs !== !1 ? `<i class="cs">${R.name[0]}</i>` : "") + // o.cs:false 不画角印（旁边已有品级印时，如仓库详情）
    `<i class="seal"></i><s class="nd"></s>` +
    (o.cap ? `<span class="cap">${o.cap === !0 ? (unid ? "未鉴定" : d.name) : o.cap}</span>` : "");
  e.title = o.title ?? `${unid ? "未鉴定的" : ""}${d.name}（${R.name} · 占 ${sizeOf(inst)} 格 · 估价 ${valueOf(inst)}）${d.desc && !unid ? "\n" + d.desc : ""}`;
  setTagState(e, o);
  if (o.onClick) e.addEventListener("click", (ev) => (ev.stopPropagation(), o.onClick(inst, e)));
  return e;
}
export function setTagState(e, s = {}) {
  for (const k of ["sel", "disabled", "sealed", "nofit"]) if (k in s) e.classList.toggle("is-" + k, !!s[k]);
  if ("isNew" in s) e.classList.toggle("is-new", !!s.isNew);
  if ("sil" in s && e._inst) {
    const ico = e.querySelector(".mk-ico"), sil = s.sil ?? e._inst.identified === !1;
    e.classList.toggle("is-sil", !!sil);
    if (ico) ico.setAttribute("style", iconStyle(e._inst, { box: e._box, sil: !!sil }));
  }
  return e;
}
export function tagReveal(e) {
  e.classList.remove("rev");
  void e.offsetWidth;
  e.classList.add("rev");
  setTimeout(() => e.classList.remove("rev"), 600);
}

// ---------------- 样式（品质色从 RARITY 生成） ----------------
let styled = !1;
export function ensureStyle() {
  if (styled || typeof document === "undefined") return;
  styled = !0;
  const rgba = (h, a) => `rgba(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",")},${a})`;
  const q = RARITY.map((R, i) => `.mk-tok.q${i}{--qc:${R.color};--qw:${i ? rgba(R.color, i >= 3 ? 0.36 : 0.28) : "transparent"}}`).join("\n");
  const css = `
.mk-ico { position: absolute; left: 50%; top: 50%; height: var(--ih, 84%); aspect-ratio: var(--ar, 1); transform: translate(-50%, -50%); background-repeat: no-repeat; pointer-events: none; font-style: normal; }
.mk-ico.inl { position: relative; display: inline-block; left: auto; top: auto; transform: none; height: 1.5em; vertical-align: -0.35em; }
.mk-tok { position: relative; isolation: isolate; flex: none; user-select: none; --qc: #6a6760; --qw: transparent; }
${q}
.mk-tok > .halo { position: absolute; inset: 2%; z-index: -1; border-radius: 50%; background: radial-gradient(closest-side, var(--qw), transparent); pointer-events: none; }
.mk-tok > .ring { position: absolute; inset: 2px; z-index: 1; background: var(--qc); opacity: .6; -webkit-mask: var(--ink-enso-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-1) 0 0 / 100% 100% no-repeat; pointer-events: none; transition: opacity .15s, background .15s; }
.mk-tok.q0 > .ring { opacity: .34; }
.mk-tok:nth-child(3n + 2) > .ring { -webkit-mask-image: var(--ink-enso-2); mask-image: var(--ink-enso-2); }
.mk-tok:nth-child(3n) > .ring { -webkit-mask-image: var(--ink-enso-3); mask-image: var(--ink-enso-3); }
.mk-tok.b2x1 > .halo { border-radius: 46% / 50%; }
.mk-tok > .mk-ico { z-index: 0; }
.mk-tok.b1x1 > .mk-ico { --ih: 80%; }
.mk-tok.b2x1 > .mk-ico { --ih: 82%; }
.mk-tok.b2x2 > .mk-ico { --ih: 78%; }
.mk-tok > em { position: absolute; right: 2px; bottom: -1px; z-index: 3; font: 700 11px var(--f-ui, sans-serif); font-style: normal; color: var(--ink-nong, #333); text-shadow: 0 0 3px var(--paper-hi, #f5f0e3), 0 0 3px var(--paper-hi, #f5f0e3), 0 0 2px var(--paper-hi, #f5f0e3); pointer-events: none; }
.mk-tok > .cs { position: absolute; right: 0; top: 0; z-index: 3; width: calc(var(--tok) * .28); height: calc(var(--tok) * .28); min-width: 13px; min-height: 13px; display: flex; align-items: center; justify-content: center; font: calc(var(--tok) * .18)/1 var(--f-display, serif); font-style: normal; color: var(--paper-hi, #f5f0e3); background: var(--qc); -webkit-mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; transform: rotate(-5deg); pointer-events: none; }
.mk-tok > .nd { display: none; position: absolute; left: 3px; top: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--zhu, #b8291a); z-index: 3; text-decoration: none; }
.mk-tok.is-new > .nd { display: block; }
.mk-tok > .seal { display: none; position: absolute; inset: 6%; z-index: 4; pointer-events: none; }
.mk-tok > .seal::before { content: ""; position: absolute; inset: -6%; background: rgba(21,24,27,.55); -webkit-mask: var(--ink-wash-round) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-round) 0 0 / 100% 100% no-repeat; }
.mk-tok > .seal::after { content: ""; position: absolute; inset: 10%; background: rgba(21,24,27,.9); -webkit-mask: var(--ink-splash-1) 0 0 / 100% 100% no-repeat; mask: var(--ink-splash-1) 0 0 / 100% 100% no-repeat; }
.mk-tok.is-sealed > .seal { display: block; }
.mk-tok.is-sealed > .mk-ico, .mk-tok.is-sealed > em, .mk-tok.is-sealed > .cs { opacity: 0; }
.mk-tok.is-sealed > .ring { background: rgba(21,24,27,.35); }
.mk-tok.is-sealed > .halo { opacity: 0; }
.mk-tok > .cap { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); white-space: nowrap; font: 12px var(--f-kai, serif); color: var(--ink-zhong, #555); pointer-events: none; }
.mk-tok.is-unid > .halo { animation: mkTokBreathe 2.4s ease-in-out infinite; }
@keyframes mkTokBreathe { 0%, 100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
.mk-tok.is-sel > .ring { background: var(--zhu, #b8291a); opacity: .95; }
.mk-tok.is-disabled { opacity: .38; filter: grayscale(.6); }
.mk-tok.is-nofit > .ring { background: var(--zhu, #b8291a); opacity: .5; }
.mk-tok.is-nofit > .mk-ico { opacity: .55; }
.mk-tok.rev > .mk-ico { animation: mkTokRev .45s cubic-bezier(.2,.7,.2,1); }
@keyframes mkTokRev { from { opacity: .2; transform: translate(-50%, -50%) scale(.86); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@media (hover: hover) { .mk-tok.hov:hover > .ring { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mk-tok.is-unid > .halo, .mk-tok.rev > .mk-ico { animation: none; } }
`;
  const st = document.createElement("style");
  st.id = "mk-icons-css";
  st.textContent = css;
  document.head.appendChild(st);
}
