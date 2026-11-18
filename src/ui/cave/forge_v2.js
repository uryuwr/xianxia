// 丹器房 v2 · 炼器（模块 C）：方向二"鼎为中心"。左目录 · 中写意鼎（材料签围鼎）· 右成品卡 · 右下朱印（Space）· 鼎铭升阶弹层。
// 分类：装备 / 符箓 / 扩容 / 附灵 / 重铸 / 认主。ui.tab 可以直接是子类（cave.open("forge", "reforge")）；ui.sel：{ cat, rec, q, rf, rfIdx, bind }。
// 规则全部调 src/game/cave/facilities.js（forgeCanCraft / forgeCraft / reforge* / canBind / bindGear / upgradeInfo …），这里只做显示与收集选择。
import { RARITY, ITEMS } from "../../core/items.js";
import { weaponAffixText } from "../../data/items.js";
import * as F from "../../game/cave/facilities.js";
import { STAT_NAME, itemId, itemName as nameOf } from "../../game/cave/data.js";
import { el, btn, itemName } from "./widgets.js";
import { surge } from "./overlays.js";
import { catalog, vessel, placeMats, ringPos, stoneSlot, card, act, ming, stamp, tag, qName, qColor, qText, JIE, NUM, facModal, lockedInfo } from "./workshop_v2.js";
import { sourcesOf } from "./sources.js";

const CATS = [["gear", "装备"], ["item", "符箓"], ["upgrade", "扩容"], ["imbue", "附灵"], ["reforge", "重铸"], ["bind", "认主"]];
const EL = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };
const UP_ICON = { bag: "jinnang_qiankun", pouch: "jinnang_qiankun", pillCap: "huichun_dan" };
const PCT = new Set(["spell", "crit", "cdr", "extractTime", "aspd", "momGain", "chargeDmg", "dashCdr"]);
// 炼器品质（与 facilities.js forgeCraft 一致，只用于预览）：主材取用中最好的一份定上限，炼器鼎阶 − 1 定下限，UP 几率再升一品，最高 TOP
const UP = 0.25, TOP = 3;

function fmt(stat, v) {
  if (String(stat).startsWith("imbue_")) return EL[stat.slice(6)] || "";
  const pct = PCT.has(stat) || (Math.abs(v) < 1 && v !== 0);
  const s = pct ? (Math.round(v * 1000) / 10).toString().replace(/\.0$/, "") + "%" : String(Math.round(v * 10) / 10);
  return (v >= 0 ? "+" : "") + s;
}
function affixLabel(a) {
  if (F.isSpecialAffix(a)) return { k: weaponAffixText(a) ? "◆ 奇效" : "◆ 心法", v: weaponAffixText(a) || a.value, sp: !0 };
  if (F.isImbueAffix(a)) return { k: "附灵", v: EL[String(a.stat).slice(6)] || "", lock: !0 };
  return { k: STAT_NAME[a.stat] || a.stat, v: fmt(a.stat, a.value) };
}
const gearLevel = (p) => Math.max(1, p.realm.layer + (p.realm.stage >= 2 ? 9 : 0));
const outId = (p, r) => itemId(r.kind === "gear" || !r.kind ? F.gearOut(p, r) : r.out || r.name);
const recName = (p, r) => ((r.kind || "gear") === "gear" ? nameOf(outId(p, r)) : r.kind === "imbue" ? "附灵 · " + EL[r.element] : r.name.replace(/（.*）/, "").replace(/\s*×\d+/, ""));
const recIcon = (p, r) => (r.kind === "upgrade" ? UP_ICON[r.target] : r.kind === "imbue" ? "fu_" + r.element : outId(p, r));

// 主材按品级的存量；可选的档：这一档至少一份，且这一档及以下够数（取用时先用这一档，不够再用次的）
function mainInfo(p, r) {
  const name = Object.keys(r.inputs || {})[0], id = itemId(name), need = r.inputs[name];
  const byQ = [0, 0, 0, 0, 0];
  for (const it of p.storage.items) if (it.id === id) byQ[Math.min(4, it.rarity || 0)] += it.n || 1;
  const total = byQ.reduce((a, b) => a + b, 0);
  const avail = byQ.map((n, q) => n > 0 && byQ.slice(0, q + 1).reduce((a, b) => a + b, 0) >= need);
  const hi = total >= need ? byQ.reduce((m, n, q) => (n > 0 ? q : m), 0) : byQ.reduce((m, n, q) => (n > 0 ? q : m), 0);
  return { name, id, need, byQ, total, avail, hi };
}
// 取用明细：从选定档往下凑够数
function takePlan(mi, q) {
  const out = [];
  let left = mi.need;
  for (let k = q; k >= 0 && left > 0; k--) if (mi.byQ[k]) out.push([k, Math.min(left, mi.byQ[k])]), (left -= Math.min(left, mi.byQ[k]));
  return out;
}
function dist(p, q) {
  const floor = F.facLevel(p, "forge") - 1;
  const base = Math.max(floor, Math.min(TOP, q)), up = Math.min(TOP, base + 1);
  const d = [0, 0, 0, 0, 0];
  if (up === base) d[base] = 1;
  else (d[base] = 1 - UP), (d[up] = UP);
  return d;
}
// 按选定主材品级炼制：选的就是最好的那档时直接调 forgeCraft；否则把更好的主材暂时挪开（同步、不触发事件），炼完放回。
// TODO 洞府组：forgeCraft(p, r, { mainQ }) 支持指定主材品级后，换成直接传参。
function craftAt(p, r, q) {
  if ((r.kind || "gear") !== "gear" || q == null) return F.forgeCraft(p, r);
  const mi = mainInfo(p, r);
  if (q >= mi.hi) return F.forgeCraft(p, r);
  const hidden = p.storage.items.filter((it) => it.id === mi.id && (it.rarity || 0) > q);
  p.storage.items = p.storage.items.filter((it) => !hidden.includes(it));
  try {
    return F.forgeCraft(p, r);
  } finally {
    p.storage.items.push(...hidden);
  }
}

export function forgeV2(ui, box) {
  const p = ui.p, S = ui.sel;
  if (ui.tab !== "forge" && CATS.some(([k]) => k === ui.tab) && !S.cat) S.cat = ui.tab;
  if (F.facLevel(p, "forge") < 1) return broken(ui, box);
  const { forge: all } = F.recipes();
  const lv = F.facLevel(p, "forge"), bindLock = lv < (F.RULES.bind.forge || 2);
  const cats = CATS.filter(([k]) => k === "bind" || k === "reforge" || all.some((r) => (r.kind || "gear") === k)).map(([k, n]) => [k, n, k === "bind" && bindLock]);
  if (!S.cat || !cats.find((c) => c[0] === S.cat)) S.cat = cats[0][0];
  const onCat = (k) => {
    if (ui.reforge) return ui.toast("先定夺：保留原词条，还是接受新词条", "zhu");
    if (k === "bind" && bindLock) ui.toast(`滴血认主需${JIE[F.RULES.bind.forge || 2]}炼器鼎`);
    S.cat = k;
    S.rec = null;
    ui.lastForge = null;
    ui.render();
  };
  const base = { cats, cat: S.cat, onCat };
  if (S.cat === "reforge") return reforgeView(ui, box, base);
  if (S.cat === "bind") return bindView(ui, box, base);
  recipeView(ui, box, base, all.filter((r) => (r.kind || "gear") === S.cat));
}

// ======================= 装备 / 符箓 / 扩容 / 附灵 =======================
function status(p, r) {
  const c = F.forgeCanCraft(p, r);
  if (c.ok) return { c, st: "可炼", cls: "ok" };
  if (c.why === "材料不足") {
    const lack = F.inputsOf(p, r).filter((x) => x.have < x.need);
    return { c, st: `缺 ${lack.length} 味 · ${lack.slice(0, 2).map((x) => x.name).join("、")}`, cls: "no", lack };
  }
  let how = "";
  if (c.why === "尚无器方" && r.recipe) how = (sourcesOf(itemId(r.recipe))[0] || "").replace(/^.*· /, "");
  return { c, st: c.why + (how ? " · " + how : ""), dim: !0, how };
}
function recipeView(ui, box, base, list) {
  const p = ui.p, S = ui.sel;
  if (!S.rec || !list.find((r) => r.id === S.rec)) S.rec = (list.find((r) => F.forgeCanCraft(p, r).ok) || list[0] || {}).id;
  const r = list.find((x) => x.id === S.rec);
  const capText = { gear: "装备 · 炼成即已鉴定", item: "符箓 · 一炉数张", upgrade: "扩容 · 炼成即用", imbue: "附灵 · 给法剑附一缕五行" }[S.cat];
  catalog(ui, box, {
    ...base, cap: capText, on: S.rec,
    rows: list.map((rr) => {
      const s = status(p, rr);
      return { id: rr.id, tag: tag({ id: recIcon(p, rr) }, { size: 44, disabled: s.dim }), nm: recName(p, rr), st: s.st, cls: s.cls, dim: s.dim, title: s.c.why || "" };
    }),
    onPick: (id) => ((S.rec = id), (ui.lastForge = null), ui.render()),
  });
  box.appendChild(el("div", "abs ws2-hint", "点鼎边的材料，看缺的去哪里找。"));
  if (!r) return;
  const isGear = (r.kind || "gear") === "gear";
  const mi = isGear ? mainInfo(p, r) : null;
  if (isGear) {
    if (S.q == null || typeof S.q !== "object") S.q = {};
    if (S.q[r.id] == null || !mi.avail[S.q[r.id]]) S.q[r.id] = mi.hi;
  }
  const q = isGear ? S.q[r.id] : null;
  const s = status(p, r);
  // ---- 中：鼎 + 材料 ----
  const v = vessel(box, "ding", { lit: s.c.ok });
  const ins = F.inputsOf(p, r);
  const stones = ins.find((x) => x.id === F.STONE());
  const mats = ins.filter((x) => x !== stones);
  const pos = ringPos(mats.length, "ding");
  placeMats(ui, v, [
    ...mats.map((x, i) => ({ id: x.id, name: x.name, need: x.need, have: x.have, rarity: isGear && i === 0 ? q : 0, main: isGear && i === 0, role: isGear && i === 0 ? "主材 · " + qName(q) : "", x: pos[i][0], y: pos[i][1] })),
    ...(stones && stones.need ? [{ id: stones.id, name: "灵石", need: stones.need, have: stones.have, x: stoneSlot("ding")[0], y: stoneSlot("ding")[1] }] : []),
  ]);
  ming(ui, v, "forge");
  // ---- 右：成品卡 ----
  const c = card(box);
  if (s.c.ok || s.lack) {
    if (isGear) gearCard(ui, c, r, mi, q);
    else if (r.kind === "item") itemCard(ui, c, r);
    else if (r.kind === "upgrade") upgradeCard(ui, c, r);
    else imbueCard(ui, c, r);
  } else lockCard(ui, c, r, s);
  // ---- 右下：朱印 ----
  act(ui, box, { label: "炼制", id: "craft-" + r.id, disabled: !s.c.ok, ok: s.c.ok, okText: "可炼", why: s.c.ok ? "" : s.c.why, how: s.lack ? "鼎边朱圈是缺的" : s.how || "", onSeal: () => doForge(ui, r, q, v) });
  // 刚炼成：盖印 + 结果签（只演一次；结果签留到下一次操作）
  showLast(ui, v);
}
function head(c, id, rarity, nm, sub, o = {}) {
  const h = el("div", "head");
  h.appendChild(tag({ id, rarity }, { size: 56, disabled: o.dim }));
  h.appendChild(el("div", "", `<div class="nm" style="color:${o.color || "var(--ink-jiao)"}">${nm}</div><div class="sub">${sub}</div>`));
  c.appendChild(h);
}
function gearCard(ui, c, r, mi, q) {
  const p = ui.p, id = outId(p, r), d = ITEMS[id] || {};
  const D = dist(p, q), likely = D.indexOf(Math.max(...D));
  const lv = F.facLevel(p, "forge"), level = gearLevel(p);
  head(c, id, likely, nameOf(id), `装备 · ${F.SLOT_NAME[d.slot] || "法器"} · 占 ${d.size || 1} 格`, { color: qText(likely) });
  if (d.desc) c.insertAdjacentHTML("beforeend", `<div class="desc">${d.desc}</div>`);
  // 主材品质
  c.insertAdjacentHTML("beforeend", `<div class="sec">主材品质<small>${mi.name} · 需 ${mi.need} 份</small></div>`);
  const qp = el("div", "ws2-qpick");
  for (let k = 0; k <= 3; k++) {
    const ok = mi.avail[k];
    const w = el("div", (ok ? "" : "off") + (k === q && mi.total >= mi.need ? " on" : ""));
    w.dataset.q = k;
    w.appendChild(tag({ id: mi.id, rarity: k }, { size: 40, sel: k === q && mi.total >= mi.need, disabled: !ok }));
    w.insertAdjacentHTML("beforeend", `<small>${RARITY[k].name} · ${mi.byQ[k]}${!mi.byQ[k] ? "" : ok ? "" : " <i>不够</i>"}</small>`);
    w.title = ok ? `先用${RARITY[k].name}${mi.name}，不够再用次的` : mi.byQ[k] ? `${RARITY[k].name}及以下凑不够 ${mi.need} 份` : `没有${RARITY[k].name}${mi.name}`;
    if (ok) w.addEventListener("click", () => ((ui.sel.q[r.id] = k), (ui.lastForge = null), ui.render()));
    qp.appendChild(w);
  }
  c.appendChild(qp);
  if (mi.total >= mi.need) c.insertAdjacentHTML("beforeend", `<div class="rule" style="margin-top:2px">取用：${takePlan(mi, q).map(([k, n]) => `${RARITY[k].name[0]} ×${n}`).join(" + ")} · 取用中最好的一份定上限</div>`);
  // 品质分布
  c.insertAdjacentHTML("beforeend", `<div class="sec">炼成品质<small>鼎${JIE[lv]} · 下限${qName(lv - 1)} · ${Math.round(UP * 100)}% 升一品</small></div>
    <div class="ws2-qbar">${RARITY.map((R, k) => `<div class="${D[k] ? "on" : ""} ${k > TOP ? "no" : ""}" style="--qc:${R.color}"><b>${R.name[0]}</b><small>${D[k] ? Math.round(D[k] * 100) + "%" : k > TOP ? "炼器不出" : ""}</small></div>`).join("")}</div>`);
  // 属性预览（与身上同部位比）
  const outs = D.map((pp, k) => [k, pp]).filter(([, pp]) => pp > 0);
  const worn = p.equip && p.equip[d.slot];
  const wb = worn ? F.gearLines(worn).base : [];
  const baseOf = (k) => F.gearLines({ id, level, rarity: k, affixes: [], identified: !0 }).base;
  const stats = baseOf(0).map((a) => a.stat);
  let t = `<table class="ws2-stt"><tr><th>${level} 级</th>${outs.map(([k, pp]) => `<th style="color:${qText(k)}">${RARITY[k].name} ${Math.round(pp * 100)}%</th>`).join("")}<th>身上${worn ? " · " + RARITY[worn.rarity || 0].name[0] + nameOf(worn.id) : ""}</th></tr>`;
  for (const st of stats) {
    const wv = (wb.find((a) => a.stat === st) || {}).value;
    t += `<tr><td>${STAT_NAME[st] || st}</td>${outs.map(([k]) => {
      const vv = (baseOf(k).find((a) => a.stat === st) || {}).value || 0, dd = wv != null ? vv - wv : null;
      return `<td><b>${fmt(st, vv).replace("+", "")}</b>${dd != null && Math.abs(dd) > 1e-3 ? `<small class="${dd > 0 ? "up" : "down"}">${dd > 0 ? "▲" : "▼"}${fmt(st, Math.abs(dd)).replace("+", "")}</small>` : ""}</td>`;
    }).join("")}<td>${wv != null ? fmt(st, wv).replace("+", "") : "—"}</td></tr>`;
  }
  t += `<tr><td>随机词条</td>${outs.map(([k]) => `<td><b>${RARITY[k].affixes || 0} 条</b>${k >= 3 ? "<small>+心法</small>" : ""}</td>`).join("")}<td>${worn ? (worn.affixes || []).filter((a) => !a.base && !F.isImbueAffix(a)).length + " 条" : "—"}</td></tr></table>`;
  c.insertAdjacentHTML("beforeend", `<div class="sec">属性预览<small>基础属性按境界；词条炼成后才见</small></div>${t}
    <div class="rule"><b>炼成即已鉴定</b>。辅材与灵草不影响品质。</div>`);
}
function itemCard(ui, c, r) {
  const p = ui.p, id = outId(p, r), d = ITEMS[id] || {};
  head(c, id, 0, `${nameOf(id)} <small style="font:14px var(--f-ui);color:var(--ink-dan)">×${r.n || 1}</small>`, `符箓 · 一炉 ${r.n || 1} 张 · 不分品`);
  c.insertAdjacentHTML("beforeend", `<div class="desc">${d.desc || ""}</div><div class="sec">炼成所得</div>
    <div class="row"><span>一炉</span><b>${nameOf(id)} × ${r.n || 1}</b></div><div class="row"><span>仓库现有</span><b>${p.storage.count(id)} 张</b></div>`);
}
function upgradeCard(ui, c, r) {
  const p = ui.p, cs = F.caveState(p);
  const L = r.target === "bag" ? { what: "储物袋", from: p.bagCapacity || 16, to: r.value, unit: "格" } : r.target === "pouch" ? { what: "贴身锦囊", from: p.pouch.capacity, to: r.value, unit: "格" } : { what: "丹药栏", from: cs.pillCap, to: cs.pillCap + r.value, unit: "枚 / 栏" };
  head(c, UP_ICON[r.target], 0, r.name.replace(/（.*）/, ""), `扩容 · 炼成即用，不进仓库`);
  c.insertAdjacentHTML("beforeend", `<div class="desc">${{ bag: "储物袋越大，一趟带回的越多。", pouch: "贴身锦囊里的东西身陨不失；放入要一息工夫。", pillCap: "丹药栏每栏多放一枚。" }[r.target]}</div>
    <div class="ws2-bigto"><b>${L.from}</b><span>→</span><b class="to">${L.to}</b><small>${L.unit}</small></div>
    ${r.target !== "pillCap" ? `<div class="ws2-cells">${Array.from({ length: L.to }, (_, i) => `<i class="${i >= L.from ? "n" : ""}"></i>`).join("")}</div>` : `<div class="row"><span>已扩</span><b>${cs.pillCapUps || 0} / ${r.max || 2}</b></div>`}
    ${r.needs ? `<div class="row" style="margin-top:8px"><span>前置</span><b>${L.what} ${r.needs} ${L.unit}</b></div>` : ""}`);
}
function imbueCard(ui, c, r) {
  const p = ui.p, sw = F.imbueTarget(p);
  if (!sw) return lockCard(ui, c, r, { c: { why: "没有可附灵的法剑" }, how: "身上或仓库里有一把已鉴定的法剑才能附灵" });
  const old = (sw.affixes || []).find((a) => F.isImbueAffix(a));
  const oe = old && String(old.stat).slice(6);
  head(c, sw.id, sw.rarity || 0, itemName(sw), `附灵目标 · ${p.equip.sword === sw ? "身上" : "仓库"} · ${qName(sw.rarity || 0)}`, { color: qText(sw.rarity || 0) });
  c.insertAdjacentHTML("beforeend", `<div class="ws2-imb">${oe ? `<span class="el old">${EL[oe]}</span><span class="arr">→</span>` : ""}<span class="el">${EL[r.element]}</span></div>
    <div class="desc" style="text-align:center">武器攻击带${EL[r.element]}行伤害，按五行关系破盾；附灵本身不附带异常状态</div>
    ${oe ? `<div class="warn">${oe === r.element ? "已是此五行，再附无益。" : `只留一条：附「${EL[r.element]}」会顶掉现在的「${EL[oe]}」。`}</div>` : ""}
    <div class="rule">附灵词条不参与重铸。</div>`);
}
function lockCard(ui, c, r, s) {
  const p = ui.p;
  head(c, recIcon(p, r), 0, recName(p, r), { gear: "装备", item: "符箓", upgrade: "扩容", imbue: "附灵" }[r.kind || "gear"], { dim: !0, color: "var(--ink-dan)" });
  let how = s.how || "";
  if (s.c.why === "尚无器方" && r.recipe) how = `器方《${(nameOf(itemId(r.recipe)) || "").replace(/^器方|[《》]/g, "")}》：${sourcesOf(itemId(r.recipe)).join("；") || "出行所得"}`;
  else if (s.c.why === "境界不足" && r.realm) {
    const [a, b] = String(r.realm).split(":").map(Number);
    how = `需${["凡人", "练气", "筑基"][a] || ""}${"〇一二三四五六七八九"[b] || b}层`;
  }
  else if (s.c.why === "已拥有") how = "已经炼过了。";
  c.insertAdjacentHTML("beforeend", `<div class="lockbox"><div class="why">${s.c.why}</div><div class="how">${how}</div></div>`);
}
function doForge(ui, r, q, v) {
  const p = ui.p;
  const res = craftAt(p, r, q);
  if (!res.ok) return ui.toast(res.why, "zhu");
  ui.cave.fxPuff("forge");
  let label = "炼成", rar = 0;
  if (res.upgrade) ui.toast(res.upgrade === "bag" ? `储物袋扩至 ${res.value} 格` : res.upgrade === "pouch" ? `贴身锦囊扩至 ${res.value} 格` : `丹药栏每栏可放 ${res.value} 枚`, "gold", 3);
  else if (res.imbue) ui.toast(`${itemName(res.item)} 附灵成功`, "gold"), (label = "附灵");
  else if (res.item) {
    rar = res.item.rarity || 0;
    label = RARITY[rar].name;
    ui.toast(`炼成 ${RARITY[rar].name}${nameOf(res.item.id)}${res.item.n > 1 ? " ×" + res.item.n : ""}`, "gold", 3);
    if (rar >= 3) surge(ui.root, rar), ui.cave.fxSurge("forge");
  }
  ui.lastForge = { label, rarity: rar, t: performance.now(), item: res.item && (r.kind || "gear") === "gear" ? res.item : null, kind: r.kind || "gear" };
  ui.cave.changed();
  ui.cave.emit("cave:forge", { recipe: r.id, ...res });
}
function showLast(ui, v) {
  const L = ui.lastForge;
  if (!L || L.closed) return;
  if (!L.shown) {
    L.shown = !0;
    stamp(v, 260, 300, { text: L.label, q: L.rarity, bloom: L.kind === "gear" });
  }
  if (!L.item) return;
  const it = L.item, q = it.rarity || 0;
  const g = F.gearLines(it);
  const res = el("div", "ws2-result ink-paper alt" + (L.fresh === !1 ? "" : " fresh") + (q >= 3 ? " sajin" : ""));
  L.fresh = !1;
  res.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
  const hd = el("div", "hd");
  hd.appendChild(tag(it, { size: 52 }));
  hd.appendChild(el("div", "", `<div class="nm" style="color:${qText(q)}">${nameOf(it.id)}</div><div class="sub">${RARITY[q].name} · ${it.level || 1} 级 · 已鉴定</div>`));
  res.appendChild(hd);
  res.insertAdjacentHTML("beforeend", g.base.map((a) => `<div class="ln"><span>${STAT_NAME[a.stat] || a.stat}</span><b>${fmt(a.stat, a.value)}</b></div>`).join("") +
    (g.affixes.length ? `<div class="lab2">词 条</div>` + g.affixes.map((a) => { const l = affixLabel(a); return `<div class="ln"><span>${l.k}</span><b style="color:${qText(q)}">${l.v}</b></div>`; }).join("") : ""));
  const acts = el("div", "acts");
  acts.appendChild(btn("收下", () => ((L.closed = !0), res.remove()), { id: "forge-ok" }));
  res.appendChild(acts);
  v.appendChild(res);
}

// ======================= 重铸 =======================
function reforgeView(ui, box, base) {
  const p = ui.p, S = ui.sel, RF = ui.reforge;
  const list = F.reforgeables(p);
  if (RF && !list.find((g) => g.uid === RF.uid)) ui.reforge = null;
  if (!S.rf || !list.find((g) => g.uid === S.rf)) S.rf = (list[0] || {}).uid;
  catalog(ui, box, {
    ...base, cap: "重铸 · 灵品以上、带词条的装备", on: S.rf, empty: "没有带词条的装备。灵品以上的装备才有词条可重铸。",
    rows: list.map((g) => ({ id: g.uid, tag: tag(g, { size: 44 }), nm: `<span style="color:${qText(g.rarity || 0)}">${nameOf(g.id)}</span>`, st: `${Object.values(p.equip).includes(g) ? "身上" : "仓库"} · ${qName(g.rarity || 0)}${g.reforged ? ` · 重铸×${g.reforged}` : ""}` })),
    onPick: (id) => (ui.reforge ? ui.toast("先定夺：保留原词条，还是接受新词条", "zhu") : ((S.rf = id), (S.rfIdx = null), ui.render())),
  });
  const cur = list.find((g) => g.uid === S.rf);
  const v = vessel(box, "ding", { lit: !!RF });
  ming(ui, v, "forge");
  const c = card(box);
  if (!cur) {
    c.insertAdjacentHTML("beforeend", `<div class="nm">重铸</div><div class="desc">没有带词条的装备。灵品以上的装备才有词条可重铸。</div>`);
    return act(ui, box, { label: "重铸", id: "reforge", disabled: !0, why: "无可重铸之器" });
  }
  // 鼎口放着这件装备，花费的材料围在两侧，灵石在鼎下
  const ctr = el("div", "center");
  ctr.appendChild(tag(cur, { size: 74 }));
  ctr.insertAdjacentHTML("beforeend", `<div class="lb" style="color:${qText(cur.rarity || 0)}">${nameOf(cur.id)}</div><small>已重铸 ${cur.reforged || 0} 次</small>`);
  v.appendChild(ctr);
  const selA = S.rfIdx != null ? cur.affixes[S.rfIdx] : null;
  const cost = F.reforgeCost(cur, selA);
  const side = ringPos(5, "ding").slice(1);
  placeMats(ui, v, [
    ...cost.items.map((x, i) => ({ id: x.id, name: x.name, need: x.n, have: p.storage.count(x.id), x: side[i % 4][0], y: side[i % 4][1] })),
    { id: F.STONE(), name: "灵石", need: cost.stones, have: p.storage.count(F.STONE()), x: stoneSlot("ding")[0], y: stoneSlot("ding")[1] },
  ]);
  // 卡：词条
  head(c, cur.id, cur.rarity || 0, nameOf(cur.id), `${qName(cur.rarity || 0)} · ${F.SLOT_NAME[(ITEMS[cur.id] || {}).slot] || "法器"} · 已重铸 ${cur.reforged || 0} 次`, { color: qText(cur.rarity || 0) });
  c.insertAdjacentHTML("beforeend", `<div class="desc">选一条词条重掷：属性与数值都重来，不会掷出已有的属性。掷出后可保留原词条，花费不退。</div><div class="sec">词条<small>点选一条</small></div>`);
  const ul = el("div", "ink-list rf-list");
  (cur.affixes || []).forEach((a, i) => {
    if (a.base) return;
    const t = affixLabel(a), can = F.affixReforgeable(a);
    const row = el("div", "ink-row" + (S.rfIdx === i ? " on" : "") + (can ? "" : " off"), `<span class="k">${t.k}</span><span class="v">${t.v}${can ? (t.sp ? ' <span class="ink-note">价 ×' + ((F.RULES.reforge.special || {}).costMul || 1) + "</span>" : "") : ' <span class="ink-note">（附灵走附灵）</span>'}</span>`);
    row.dataset.aff = i;
    if (can) row.addEventListener("click", () => (ui.reforge ? ui.toast("先定夺：保留原词条，还是接受新词条", "zhu") : ((S.rfIdx = i), ui.render())));
    ul.appendChild(row);
  });
  c.appendChild(ul);
  const R = F.RULES.reforge;
  c.insertAdjacentHTML("beforeend", `<div class="sec">花费<small>灵石 ${cost.stones}${cost.items.map((x) => ` · ${x.name}×${x.n}`).join("")}</small></div>
    <div class="rule">每重铸一次价格 ×${R.growth}（最多 ×${R.maxMul}）${selA && F.isSpecialAffix(selA) ? `；心法只换心法，价 ×${(R.special || {}).costMul || 1}` : ""}。</div>`);
  // 揭示
  if (RF && RF.uid === cur.uid) {
    const o = affixLabel(RF.old), n = affixLabel(RF.neo);
    const rv = el("div", "rf-reveal ink-paper alt");
    rv.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
    rv.insertAdjacentHTML("beforeend", `<div class="t">重铸所得<small>二选一 · 花费已耗</small></div><div class="cmp"><div class="side so"><small>原词条</small><b>${o.k}</b><b class="v">${o.v}</b></div><div class="arr">→</div><div class="side sn"><small>新词条</small><b style="color:${qText(cur.rarity || 0)}">${n.k}</b><b class="v" style="color:${qText(cur.rarity || 0)}">${n.v}</b></div></div>`);
    const acts = el("div", "acts");
    acts.appendChild(btn("保留原词条", () => ((ui.reforge = null), ui.toast("原词条未动；灵石已耗去"), ui.cave.changed()), { id: "rf-keep" }));
    acts.appendChild(btn("接受新词条", () => {
      F.reforgeApply(cur, RF.idx, RF.neo);
      ui.reforge = null;
      ui.toast(`${itemName(cur)}：${n.k} ${n.v}`, "gold");
      ui.cave.changed({ stats: !0 });
    }, { primary: !0, id: "rf-accept" }));
    rv.appendChild(acts);
    v.appendChild(rv);
    if (!RF.shown) (RF.shown = !0), stamp(v, 260, 236, { text: "重铸", q: cur.rarity || 0, bloom: !1, size: 80 });
  } else if (S.rfIdx != null) {
    // 可能掷出：同部位词条池（排除已有属性）
    c.insertAdjacentHTML("beforeend", `<div class="pool">${F.isSpecialAffix(selA) ? "只会换成另一条心法。" : "不会掷出已有的属性，也不会掷出附灵。"}</div>`);
  }
  const k = RF ? { ok: !1, why: "先定夺" } : S.rfIdx != null ? F.canReforge(p, cur, S.rfIdx) : { ok: !1, why: "先点选一条词条" };
  act(ui, box, { label: "重铸", id: "reforge", disabled: !k.ok, ok: k.ok, okText: "可重铸", why: k.why, onSeal: () => {
    const r = F.reforgeRoll(p, cur, S.rfIdx);
    if (!r.ok) return ui.toast(r.why, "zhu");
    ui.reforge = { uid: cur.uid, idx: S.rfIdx, old: r.old, neo: r.neo, t: performance.now() };
    ui.cave.fxPuff("forge");
    ui.cave.changed();
  } });
}

// ======================= 认主 =======================
function bindView(ui, box, base) {
  const p = ui.p, S = ui.sel;
  const gear = [...Object.values(p.equip).filter(Boolean), ...p.storage.items].filter((it) => ((ITEMS[it.id] || {}).cat === "gear") && it.identified !== !1);
  if (!S.bind || !gear.find((g) => g.uid === S.bind)) S.bind = (gear.find((g) => g.bound) || gear[0] || {}).uid;
  const lv = F.facLevel(p, "forge"), need = F.RULES.bind.forge || 2, locked = lv < need;
  catalog(ui, box, {
    ...base, cap: "认主 · 永久护住一件装备", on: S.bind, empty: "没有可认主的装备。",
    rows: gear.map((g) => ({ id: g.uid, tag: tag(g, { size: 44, disabled: locked }), nm: `<span style="color:${qText(g.rarity || 0)}">${nameOf(g.id)}</span>`, st: g.bound ? "已认主" : `${Object.values(p.equip).includes(g) ? "身上" : "仓库"} · ${qName(g.rarity || 0)}`, cls: g.bound ? "no" : "", dim: locked })),
    onPick: (id) => ((S.bind = id), ui.render()),
  });
  const cur = gear.find((g) => g.uid === S.bind);
  const v = vessel(box, "ding", { lit: !1 });
  ming(ui, v, "forge");
  if (cur) {
    const ctr = el("div", "center");
    ctr.appendChild(tag(cur, { size: 74, disabled: locked }));
    ctr.insertAdjacentHTML("beforeend", `<div class="lb" style="color:${qText(cur.rarity || 0)}">${nameOf(cur.id)}</div><small>${cur.bound ? "已认主" : "以精血祭炼"}</small>`);
    v.appendChild(ctr);
  }
  const B = F.RULES.bind;
  placeMats(ui, v, [{ id: F.STONE(), name: "灵石", need: B.stones, have: p.storage.count(F.STONE()), x: stoneSlot("ding")[0], y: stoneSlot("ding")[1] }]);
  const c = card(box);
  c.insertAdjacentHTML("beforeend", `<div class="nm">滴血认主</div><div class="sub">永久护住一件装备 · 只能一件</div>
    <div class="desc">以精血祭炼，此器从此与你性命相连：身陨不遗落。改认他物，原先那件便解除。</div>
    <div class="sec">代价</div><div class="row"><span>灵石</span><b>${B.stones}</b></div><div class="row"><span>下一局</span><b style="color:var(--zhu)">气血上限 −${Math.round(B.debuff * 100)}%</b></div>
    <div class="row"><span>现认主</span><b>${(gear.find((g) => g.bound) && nameOf(gear.find((g) => g.bound).id)) || "无"}</b></div>`);
  if (locked) {
    c.insertAdjacentHTML("beforeend", `<div class="lockbox"><div class="why">需${JIE[need]}炼器鼎</div><div class="how">炼器鼎二阶要先搬迁到竹海·溪谷灵脉，再在鼎铭处升阶。</div></div>`);
    c.appendChild(btn("看升阶条件 ›", () => facModal(ui, "forge"), { id: "bind-up" }));
  }
  const cb = F.canBind(p);
  act(ui, box, { label: "认主", id: "bind", disabled: !cb.ok || !cur || cur.bound, ok: cb.ok && cur && !cur.bound, okText: "可认主", why: !cur ? "无装备" : cur.bound ? "此器已认主" : cb.why, onSeal: async () => {
    if (!(await ui.confirm("滴血认主", `以精血祭炼「${itemName(cur)}」？下一局气血上限 −${Math.round(B.debuff * 100)}%。`, { ok: "认主", seal: !0 }))) return;
    const r = F.bindGear(p, cur.uid);
    if (!r.ok) return ui.toast(r.why, "zhu");
    stamp(v, 260, 118, { text: "认主", q: 4, bloom: !1, size: 80 });
    ui.toast("认主已成", "gold");
    ui.cave.changed();
  } });
}

// ======================= 炼器鼎未开（按修为解锁：FACILITIES.forge.unlock） =======================
function broken(ui, box) {
  const L = lockedInfo("forge");
  catalog(ui, box, { cats: CATS.map(([k, n]) => [k, n, !0]), cat: null, onCat: () => ui.toast("炼器鼎还冷着 · " + L.at, "zhu"), rows: [], on: null, onPick: () => {}, empty: `鼎身冰冷。<br>${L.at}，便炼得出法器、符箓、储物袋。` });
  vessel(box, "ding", { broken: !0 });
  const c = card(box);
  c.insertAdjacentHTML("beforeend", `<div class="nm">炼器鼎未开</div><div class="desc">鼎身冰冷，鼎腹积了一层灰。修为到<b>${L.at.replace(/解锁$/, "")}</b>，以真气温鼎，便可炼器${L.gifts.length ? `——先给你${L.gifts.join("、")}的器方` : ""}。</div>
    ${L.next.length ? `<div class="sec">往后升阶<small>野外所得</small></div><div class="desc">${L.next.join("、")}</div>` : ""}`);
  act(ui, box, { label: "温鼎", id: "up-forge", disabled: !0, ok: !1, why: L.at, how: "突破即可用", onSeal: () => {} });
}
void NUM; void qColor;
