// 丹器房 v2 · 公用（模块 C）：方向二"鼎为中心"的外壳与部件，炼丹（alchemy_v2.js）、炼器（forge_v2.js）共用。
// 定稿：docs/ui/v2/炼器_v2_方案.md、示意图 docs/ui/v2/forge_v2/b_ding.html。
//   wsShell(ui, box)                顶栏（丹器房 · 炼丹 / 炼器 / 药园 + 灵石 + 回洞府）+ 整页宣纸；药园也用它（只统一顶栏）
//   catalog(ui, box, o)             左：分类竖签 + 目录行（图标签 + 名 + 横排状态）
//   vessel(box, kind)               中：写意鼎 / 炉（预烘焙成位图，只画一次）→ { el, place(mats), center(node) }
//   ming(ui, ves, fac)              鼎铭 / 炉铭：设施阶、下限 / 带宽、升阶入口（独立弹层 facModal）
//   card(box) / act(ui, box, o)     右：成品卡；右下：状态 + 朱印（Space 盖印）
//   sourcePop(ui, anchor, x)        材料"何处可得"小纸条
//   stamp(host, x, y, o)            盖印动效（溅墨 + 落印 + 品质晕开）
// 规则一律调 src/game/cave/facilities.js；物品图标一律用 src/ui/icons.js 的 itemTag（品级圆相与晕由它画）。
import "./ding.css";
import { RARITY } from "../../core/items.js";
import { inkReadable } from "../../fx/rarity_tint.js";
import { itemTag } from "../icons.js";
import * as F from "../../game/cave/facilities.js";
import { FACILITIES, itemName as nameOf } from "../../game/cave/data.js";
import { el, btn, paper } from "./widgets.js";
import { ART } from "./style.js";
import { sourcesOf } from "./sources.js";
import DING_SVG from "../ink/art_ding.svg?url";

export const JIE = ["残", "一阶", "二阶", "三阶"];
export const CN = "〇一二三四五六七八九十";
export const NUM = (n) => Math.round(n).toLocaleString("en-US");
export const qName = (q) => RARITY[Math.max(0, Math.min(4, q))].name;
export const qColor = (q) => RARITY[Math.max(0, Math.min(4, q))].color;
// 名称在纸上用的深一档字色：全局约定用 src/fx/rarity_tint.js 的 inkReadable（RARITY 色与墨按比例混合），不写死色值
export const qText = (q) => inkReadable(Math.max(0, Math.min(4, q)));
const FORGE_SUB = ["gear", "item", "upgrade", "imbue", "reforge", "bind"];
export const isForgeTab = (t) => t === "forge" || FORGE_SUB.includes(t);

// 物品签（icons.js）：x 为实例或 { id, rarity, n }
export function tag(x, o = {}) {
  const inst = typeof x === "string" ? { id: x, rarity: 0, n: 1 } : { rarity: 0, n: 1, ...x };
  return itemTag(inst, { size: o.size || 44, box: o.box || "1x1", count: o.count ?? !1, sel: o.sel, disabled: o.disabled, nofit: o.nofit, title: o.title, onClick: o.onClick });
}

// ---------------- 写意鼎 / 炉：只烘一次 ----------------
// 器物插画：VESSELS[kind] = { url, meta }。meta 为 tools/vessels/vessels.js 的锚点（128 盒坐标：mouth 器口、smoke 丹烟、fire 炉门火光、base 器底）；
// meta 为空时是旧插画（art_ding.svg / art_danlu.svg），按 ding.css 里的固定位置摆。
// 选定新变体后由 tools/vessel_gen.mjs --install 生成 src/ui/ink/art_ding.png、art_furnace.png 与 src/ui/cave/vessel_meta.json，再把下面两项指过去。
// 装好之后这里自动改用新图（import.meta.glob：文件不存在时为空，不报错）
const VM = Object.values(import.meta.glob("./vessel_meta.json", { eager: !0, import: "default" }))[0] || {};
const VART = import.meta.glob(["../ink/art_ding.png", "../ink/art_furnace.png"], { eager: !0, query: "?url", import: "default" });
const vart = (n) => VART[`../ink/art_${n}.png`];
export const VESSELS = {
  ding: vart("ding") && VM.ding ? { url: vart("ding"), meta: VM.ding } : { url: DING_SVG, meta: null },
  furnace: vart("furnace") && VM.furnace ? { url: vart("furnace"), meta: VM.furnace } : { url: null, meta: null },
};
let baking = null;
const KEEP = []; // 解码后的图留着引用，免得被缓存回收
// 预解码鼎 / 炉插画：模块随洞府界面一起加载时就在空闲时做（img.decode 在解码线程里，不占主线程），第一次打开丹器房不再卡
function bakeVessels() {
  if (baking) return baking;
  const urls = Object.values(VESSELS).map((v) => v.url).filter(Boolean);
  if (ART.danlu && !VESSELS.furnace.url) urls.push(ART.danlu);
  baking = Promise.all(urls.map((u) => { const img = new Image(); img.decoding = "async"; img.src = u; KEEP.push(img); return img.decode().catch(() => {}); }));
  return baking;
}
if (typeof window !== "undefined") (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => bakeVessels());
const artUrl = (kind) => VESSELS[kind].url || (kind === "furnace" ? ART.danlu : DING_SVG);
// 器物区（520×604）里的几何：插画方框 S×S、器底落在 baseY；返回器口 / 丹烟 / 火光的区内坐标
const ART_S = 360, BASE_Y = { ding: 472, furnace: 452 };
export function vesselGeo(kind) {
  const m = VESSELS[kind].meta;
  if (!m) return kind === "furnace" ? { mouth: [260, 150], legacy: !0 } : { mouth: [260, 236], legacy: !0 };
  const k = ART_S / 128, left = 260 - ART_S / 2, top = BASE_Y[kind] - m.base * k;
  const P = ([x, y]) => [left + x * k, top + y * k];
  return { art: [left, top, ART_S, ART_S], mouth: P(m.mouth), smoke: P(m.smoke), fire: m.fire ? [...P(m.fire), m.fire[2] * k, m.fire[3] * k] : null, base: BASE_Y[kind] };
}

// ---------------- 外壳 ----------------
export function wsShell(ui, box) {
  const p = ui.p;
  bakeVessels();
  box.classList.add("ws2", isForgeTab(ui.tab) ? "forge" : ui.tab || "alchemy");
  box.appendChild(paper("abs ws2-sheet"));
  const h = el("div", "abs ws2-hdr", `<span class="t">丹器房</span>`);
  const tabs = el("div", "ink-tabs");
  for (const [k, n] of [["alchemy", "炼丹"], ["forge", "炼器"]]) {
    const on = k === "forge" ? isForgeTab(ui.tab) : ui.tab === k;
    const t = el("span", "ink-tab" + (on ? " on" : ""), n);
    t.dataset.tab = k;
    t.addEventListener("click", () => {
      if (ui.reforge) return ui.toast("先定夺：保留原词条，还是接受新词条", "zhu");
      const go = () => ((ui.tab = k), (ui.sel = {}), ui.render());
      if (ui.fire) return ui.fire.leave ? ui.fire.leave(go) : ui.toast("炉火正旺，离不得人", "zhu"); // 开炉中切页：问一句，离炉 = 这炉作废
      go();
    });
    tabs.appendChild(t);
  }
  h.appendChild(tabs);
  box.appendChild(h);
  box.appendChild(el("div", "abs ws2-stones", `<span class="ink-seal round gold" style="--s:24px;font-size:12px">石</span><b>${NUM(p.storage.count(F.STONE()))}</b><small>灵石</small>`));
  const back = el("div", "abs ws2-back");
  back.appendChild(btn("回洞府", () => (ui.fire && ui.fire.leave ? ui.fire.leave(() => ui.close()) : ui.close()), { key: "Esc", id: "close" }));
  box.appendChild(back);
  if (!ui.cave || ui === ui.cave.ui) bindSpace(ui); // 预热用的替身 ui 不接键位
}

// ---------------- 左：目录 ----------------
// o: { cats?: [[k, 名, locked]], cat, onCat(k), cap, rows: [{ id, tag: node, nm, st, cls, dim }], on, onPick(id), empty }
export function catalog(ui, box, o) {
  if (o.cats) {
    const vt = el("div", "abs ink-vtabs ws2-cats");
    for (const [k, n, locked] of o.cats) {
      const t = el("span", "ink-vtab" + (o.cat === k ? " on" : "") + (locked ? " locked" : ""), n);
      t.dataset.cat = k;
      t.addEventListener("click", () => o.onCat(k));
      vt.appendChild(t);
    }
    box.appendChild(vt);
  }
  const L = el("div", "abs ws2-list");
  if (!o.cats) L.style.left = "62px";
  if (o.cap) L.appendChild(el("div", "cap", o.cap));
  const sc = el("div", "scroll");
  for (const r of o.rows) {
    const row = el("div", `ws2-row ${r.id === o.on ? "on" : ""} ${r.dim ? "dim" : ""}`);
    row.dataset.rec = r.id;
    row.appendChild(r.tag);
    row.appendChild(el("div", "tx", `<div class="nm">${r.nm}</div><div class="st ${r.cls || ""}">${r.st || ""}</div>`));
    row.title = r.title || "";
    row.addEventListener("click", () => o.onPick(r.id));
    sc.appendChild(row);
  }
  if (!o.rows.length) sc.appendChild(el("div", "empty", o.empty || "空空如也"));
  L.appendChild(sc);
  box.appendChild(L);
  // 选中项滚到可见（目录长于一屏时）
  requestAnimationFrame(() => {
    const on = sc.querySelector(".ws2-row.on");
    if (on && sc.scrollHeight > sc.clientHeight) sc.scrollTop = Math.max(0, on.offsetTop - sc.clientHeight / 2);
  });
  return L;
}

// ---------------- 中：鼎 / 炉 ----------------
export function vessel(box, kind, o = {}) {
  const v = el("div", `abs ws2-ves ${kind}${o.broken ? " broken" : ""}${o.lit ? " lit" : ""}`);
  v.innerHTML = `<div class="glow"></div><div class="art" role="img" aria-label="${kind === "furnace" ? "丹炉" : "炼器鼎"}" style="background-image:url('${artUrl(kind)}')"></div><div class="smoke"><i></i><i></i><i></i></div><svg class="links"></svg>`;
  const g = (v._geo = vesselGeo(kind));
  if (!g.legacy) {
    v.classList.add("v2art");
    const [l, t, w, h] = g.art, set = (e, css) => Object.assign(e.style, css);
    set(v.querySelector(".art"), { left: l + "px", top: t + "px", width: w + "px", height: h + "px" });
    set(v.querySelector(".smoke"), { left: g.smoke[0] - 30 + "px", top: g.smoke[1] - 88 + "px" });
    // 炉门火光叠在门洞上（随火候变亮）；鼎则是器底一团暖光
    const gl = v.querySelector(".glow");
    if (g.fire) set(gl, { left: g.fire[0] - g.fire[2] * 0.9 + "px", top: g.fire[1] - g.fire[3] * 0.9 + "px", width: g.fire[2] * 1.8 + "px", height: g.fire[3] * 1.8 + "px" });
    else set(gl, { left: "180px", top: g.base - 26 + "px", width: "160px", height: "52px" });
  }
  box.appendChild(v);
  return v;
}
// 材料签围着器物排：mats = [{ id, rarity, need, have, role, main, x, y }]，x / y 为器物区内坐标；mouth 为连线终点
export function placeMats(ui, v, mats, mouth = (v._geo && v._geo.mouth) || [260, 236]) {
  const links = v.querySelector(".links");
  let paths = "";
  for (const m of mats) {
    const ok = m.have >= m.need;
    const n = el("div", `ws2-m ${ok ? "" : "lack"} ${m.main ? "main" : ""}`);
    n.style.left = m.x + "px";
    n.style.top = m.y + "px";
    n.dataset.mat = m.id;
    n.appendChild(tag({ id: m.id, rarity: m.rarity || 0 }, { size: m.main ? 60 : 48, nofit: !ok, title: `${nameOf(m.id)}：${m.have} / ${m.need}${ok ? "" : "，点一下看何处可得"}` }));
    n.insertAdjacentHTML("beforeend", `<div class="lb"><b>${m.name || nameOf(m.id)}</b>${m.role ? `<span class="role">${m.role}</span>` : ""}<span class="n">${m.have} / ${m.need}${m.free ? "<s>自取</s>" : ok ? "<s>足</s>" : `<i>缺 ${m.need - m.have}</i>`}</span></div>`);
    n.addEventListener("click", (e) => (e.stopPropagation(), sourcePop(ui, n, m)));
    v.appendChild(n);
    const [mx, my] = mouth, c1x = (m.x + mx) / 2, c1y = Math.min(m.y, my) - 10;
    paths += `<path class="${ok ? "" : "no"}" d="M${m.x} ${m.y + (m.main ? 30 : 26)} Q${c1x} ${c1y + 40} ${mx} ${my}"/>`;
  }
  links.innerHTML = paths;
}
// 环绕位置（器物区坐标）：第一味（主材 / 药引）在器口上方，其余左右上、左右下；六味时上方并排两味。灵石另放器下（stoneSlot）。最多 6 味。
const SLOTS = {
  ding: { top: [260, 84], pair: [[168, 96], [352, 96]], side: [[76, 236], [444, 236], [68, 388], [452, 388]] },
  furnace: { top: [260, 64], pair: [[168, 76], [352, 76]], side: [[76, 226], [444, 226], [68, 372], [452, 372]] },
};
export function ringPos(n, kind) {
  const S = SLOTS[kind === "furnace" ? "furnace" : "ding"];
  if (n <= 0) return [];
  if (n <= 5) return [S.top, ...S.side].slice(0, n);
  return [...S.pair, ...S.side].slice(0, 6);
}
export const stoneSlot = (kind) => (kind === "furnace" ? [452, 388] : [260, 528]);

// ---------------- 何处可得 ----------------
export function sourcePop(ui, anchor, m) {
  const old = ui.page && ui.page.querySelector(".ws2-pop");
  if (old) {
    const same = old.dataset.mat === m.id;
    old.remove();
    if (same) return;
  }
  const box = anchor.closest(".cv-box");
  const src = m.free ? ["灵泉自取，不必带"] : sourcesOf(m.id);
  const ok = m.have >= m.need;
  const pop = paper("ws2-pop alt", `<div class="h"><b>${m.name || nameOf(m.id)}</b><small>${m.have} / ${m.need}${ok ? "" : ` · <i>缺 ${m.need - m.have}</i>`}</small></div>
    <div class="lab">何 处 可 得</div>${src.length ? src.map((s) => `<div class="s">${s}</div>`).join("") : '<div class="s">尚无记载</div>'}
    ${m.note ? `<div class="ft">${m.note}</div>` : ""}<div class="ft">点空白处收起</div>`);
  pop.dataset.mat = m.id;
  const bb = box.getBoundingClientRect(), ab = anchor.getBoundingClientRect(), k = bb.width / 1280 || 1;
  const ax = (ab.left - bb.left) / k, aw = ab.width / k;
  // 鼎口正上和右侧的材料：纸条放左边（右边是成品卡）；左侧的材料放右边
  let x = ax + aw / 2 >= 560 ? ax - 252 : ax + aw + 8, y = (ab.top - bb.top) / k - 10;
  pop.style.left = Math.max(20, x) + "px";
  pop.style.top = Math.max(70, Math.min(560, y)) + "px";
  box.appendChild(pop);
  const off = (e) => {
    if (pop.contains(e.target)) return;
    pop.remove();
    removeEventListener("mousedown", off, !0);
  };
  setTimeout(() => addEventListener("mousedown", off, !0), 0);
}

// ---------------- 右：成品卡 ----------------
export function card(box) {
  const c = paper("abs ws2-card alt");
  box.appendChild(c);
  return c;
}

// ---------------- 右下：状态 + 朱印；Space 盖印 ----------------
// o: { label, id, disabled, ok, why, onSeal, extra: [nodes] }
export function act(ui, box, o) {
  const a = el("div", "abs ws2-act");
  for (const e of [].concat(o.extra || [])) a.appendChild(e);
  a.appendChild(el("div", "why", o.ok ? `<b>${o.okText || "可" + o.label}</b><span class="key">Space</span>落印` : o.why ? `<b class="no">${o.why}</b>${o.how || ""}` : ""));
  const b = btn(o.label, (e) => (press(b), o.onSeal(e)), { seal: !0, disabled: o.disabled, id: o.id });
  a.appendChild(b);
  box.appendChild(a);
  return a;
}
export function press(b) {
  if (!b) return;
  b.classList.add("pressing");
  setTimeout(() => b.classList.remove("pressing"), 140);
  b.blur && b.blur();
}
let spaceUi = null, spaceOn = !1, spaceAt = 0;
// 炼丹页 Space 同时是"添火"：一炉结束后玩家往往还在点 Space，曾因此一下接一下自动开炉直到材料用光（用户报）。
// 规则：炼丹页要停手 SPACE_QUIET 毫秒（距上次按 / 松 Space、距上一炉结束都要满）再按 Space 才开炉；点朱印不受限。
export const SPACE_QUIET = 1200;
function bindSpace(ui) {
  spaceUi = ui;
  if (spaceOn) return;
  spaceOn = !0;
  addEventListener("keyup", (e) => e.code === "Space" && (spaceAt = performance.now()));
  addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const now = performance.now(), quiet = Math.min(now - spaceAt, now - ((spaceUi && spaceUi.brewEnd) || 0));
    spaceAt = now;
    if (e.repeat) return;
    const u = spaceUi;
    if (!u || !u.root || u.cur !== "workshop" || u.fire || !u.page) return;
    if (u.tab === "alchemy" && quiet < SPACE_QUIET) return e.preventDefault();
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    if (u.root.querySelector(".cv-modal,.cv-break,.cv-wipe")) return;
    const m = u.page.querySelector(".ws2-modal");
    const b = (m || u.page).querySelector((m ? ".foot" : ".ws2-act") + " .ink-seal-btn:not(.is-disabled)");
    e.preventDefault();
    if (b) b.click();
  });
}

// ---------------- 丹炉 / 炼器鼎未解锁（按修为）：解锁层、解锁时送的配方、往后升阶的野外材料 ----------------
export function lockedInfo(fac) {
  const f = FACILITIES[fac] || {}, all = F.recipes(), list = [...all.alchemy, ...all.forge];
  const gifts = ((f.unlock && f.unlock.recipes) || []).map((id) => (list.find((r) => r.id === id) || {}).name).filter(Boolean);
  const next = F.costList((f.cost || [])[1]).filter((x) => x.id !== F.STONE()).map((x) => `${x.name} ×${x.n}`);
  return { at: F.facLockText(fac), gifts, next };
}

// ---------------- 盖印 ----------------
const SEALC = ["ink", "green", "blue", "gold", ""];
export function stamp(host, x, y, o = {}) {
  let L = host.querySelector(":scope > .ws2-fx");
  if (!L) host.appendChild((L = el("div", "ws2-fx")));
  L.innerHTML = "";
  const q = o.q ?? 0;
  L.insertAdjacentHTML("beforeend", `<i class="splat" style="left:${x}px;top:${y}px"></i>`);
  if (o.bloom !== !1) L.insertAdjacentHTML("beforeend", `<i class="bloom" style="left:${x}px;top:${y}px;--qc:${qColor(q)}"></i>`);
  const sz = o.size || 92;
  L.insertAdjacentHTML("beforeend", `<span class="seal ink-seal two ${o.cls ?? SEALC[q]}" style="left:${x}px;top:${y}px;--s:${sz}px;font-size:${Math.round(sz * 0.34)}px">${o.text || "炼成"}</span>`);
  clearTimeout(L._t);
  L._t = setTimeout(() => L.isConnected && (L.innerHTML = ""), o.ms || 2600);
}

// ---------------- 鼎铭 / 炉铭 + 升阶弹层 ----------------
const FAC_LINE = {
  forge: (p, lv) => [`品质下限${qName(Math.max(0, lv - 1))}`, lv >= (F.RULES.bind.forge || 2) ? "可滴血认主" : "认主未开"],
  furnace: (p, lv) => [`火候带宽 ×${(1 + 0.25 * (lv - 1)).toFixed(2).replace(/\.?0+$/, "")}`, `可炼${F.recipes().alchemy.filter((r) => (r.furnace || 1) <= lv).length}方`],
};
export function ming(ui, v, fac) {
  const p = ui.p, lv = F.facLevel(p, fac), u = F.upgradeInfo(p, fac);
  const m = el("div", "ws2-ming");
  const name = FACILITIES[fac].name;
  m.innerHTML = `<span class="t">${fac === "forge" ? "鼎铭" : "炉铭"}</span><span class="ink-seal" style="--s:26px;font-size:11px">${JIE[lv]}</span><span>${name}${JIE[lv]} · ${FAC_LINE[fac](p, lv).join(" · ")}</span>`;
  if (!u.max) {
    m.insertAdjacentHTML("beforeend", '<span class="sep">|</span>');
    m.appendChild(btn(`升${JIE[lv + 1]} ›`, () => facModal(ui, fac), { id: "up-" + fac, title: u.blocked || "" }));
  } else m.insertAdjacentHTML("beforeend", '<span class="sep">|</span><span>已至圆满</span>');
  v.appendChild(m);
  return m;
}
const FAC_EFFECT = {
  forge: [
    null,
    ["可炼装备、符箓、扩容、附灵", "可重铸灵 / 宝 / 仙品词条", "炼成品质下限：凡品"],
    ["炼成品质下限：灵品（凡品主材也出灵品）", "解锁 · 滴血认主", "解锁 · 极品装备重铸"],
  ],
  furnace: [null, ["可炼一阶丹方", "火候带宽 ×1"], ["火候带宽 ×1.25（更易守住火候）", () => "可炼二阶丹方：" + [...new Set(F.recipes().alchemy.filter((r) => (r.furnace || 1) >= 2).map((r) => r.name.replace(/（.*）/, "")))].join("、")]],
};
export function facModal(ui, fac) {
  const p = ui.p, u = F.upgradeInfo(p, fac), lv = u.lv;
  if (u.max) return;
  const m = el("div", "ws2-modal");
  m.addEventListener("mousedown", (e) => e.stopPropagation());
  const sheet = paper("alt");
  const E = FAC_EFFECT[fac] || [];
  const fx = (a) => (a || []).map((t) => (typeof t === "function" ? t() : t));
  const cur = lv ? fx(E[lv]) : ["尚未修复"];
  const nx = fx(E[lv + 1]);
  const mats = F.costList(u.cost).map((c) => ({ ...c, have: p.storage.count(c.id) }));
  const relocated = F.caveState(p).region !== "r1";
  sheet.insertAdjacentHTML(
    "beforeend",
    `<h3>${FACILITIES[fac].name}<span class="ink-seal" style="--s:34px;font-size:13px">${JIE[lv]}</span><span style="font:20px var(--f-display);color:var(--ink-dan)">→</span><span class="ink-seal gold" style="--s:34px;font-size:13px">${JIE[lv + 1]}</span></h3>
    <div class="cols"><div class="col cur"><div class="lv">今 · ${JIE[lv]}</div>${cur.map((t) => `<p>${t}</p>`).join("")}</div><div class="arr">→</div>
    <div class="col nx"><div class="lv">升 · ${JIE[lv + 1]}</div>${nx.map((t) => `<p class="${cur.includes(t) ? "" : "new"}">${t}</p>`).join("")}</div></div>
    <div class="sec">升阶所需</div><div class="mats">${mats
      .map((c) => {
        const ok = c.have >= c.n;
        return `<div class="mrow ${ok ? "" : "no"}" data-mat="${c.id}"><span class="tk"></span><div style="flex:1;min-width:0"><span class="nm">${c.name}</span>${ok ? "" : `<span class="src">${sourcesOf(c.id).slice(0, 1).join("；")}</span>`}</div><span class="ct"><b>${c.have}</b> / ${c.n} ${ok ? '<span style="color:#2c7d57">足</span>' : '<span style="color:var(--zhu)">缺</span>'}</span></div>`;
      })
      .join("")}</div>
    ${u.cost && u.cost.relocate ? `<div class="cond ${relocated ? "ok" : "no"}">条件：搬迁到竹海·溪谷灵脉 · ${relocated ? "已满足" : "未满足（出行台 · 打包搬迁）"}</div>` : ""}`,
  );
  sheet.querySelectorAll(".mrow").forEach((r, i) => r.querySelector(".tk").replaceWith(tag(mats[i].id, { size: 34, nofit: mats[i].have < mats[i].n })));
  const foot = el("div", "foot");
  const close = () => (m.remove(), removeEventListener("keydown", esc, !0));
  const esc = (e) => e.code === "Escape" && (e.stopPropagation(), close());
  addEventListener("keydown", esc, !0);
  foot.appendChild(btn("合上", close, { key: "Esc", id: "up-close" }));
  const go = btn(lv ? "升阶" : "修复", () => {
    press(go);
    if (!F.upgrade(p, fac)) return ui.toast(u.blocked || "材料不足", "zhu");
    ui.cave.fxPuff(fac);
    const r = sheet.getBoundingClientRect(), mb = m.getBoundingClientRect(), k = mb.width / 1280 || 1;
    stamp(m, (r.left - mb.left + r.width / 2) / k, (r.top - mb.top + r.height / 2) / k, { text: JIE[lv + 1], q: 3, size: 110, bloom: !0 });
    ui.toast(`${FACILITIES[fac].name}${lv === 0 ? "修好了" : "升至" + JIE[lv + 1]}`, "gold");
    setTimeout(() => (close(), ui.cave.changed()), 900);
  }, { seal: !0, disabled: !u.ok, id: "up-" + fac + "-go", title: u.blocked || "" });
  foot.appendChild(go);
  sheet.appendChild(foot);
  m.appendChild(sheet);
  (ui.page.querySelector(".cv-box") || ui.root).appendChild(m);
  return m;
}
