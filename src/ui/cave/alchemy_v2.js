// 丹器房 v2 · 炼丹（模块 C）：与炼器同一版式——左丹方目录 · 中写意丹炉（灵草材料围炉，火候一笔在炉下）· 右丹方卡 · 右下"开炉"朱印（Space）· 炉铭升阶弹层。
// 火候小游戏逻辑仍是 src/game/cave/alchemy_game.js（FireGame）；规则调 facilities.js（alchemyCanStart / alchemyStart / alchemyFinish / herbPreview / alchemyBand / isMastered）。
// 保留：一炉 1–3 份、灵草"先用次的 / 先用好的"（火候带宽 × herbBand）、熟练后"文火自成"跳过火候、调试钩子（cave.debug.alchemyAuto / alchemyTime / alchemyTemp）。
// ui.sel：{ rec, batch, prefer }；ui.fire：火候进行中；ui.lastBrew：上一炉结果（测试读它）。
import { RARITY, ITEMS } from "../../core/items.js";
import * as F from "../../game/cave/facilities.js";
import { itemId, itemName as nameOf } from "../../game/cave/data.js";
import { FireGame } from "../../game/cave/alchemy_game.js";
import { el, btn } from "./widgets.js";
import { surge } from "./overlays.js";
import { catalog, vessel, placeMats, ringPos, card, act, ming, stamp, tag, qName, qText, JIE, lockedInfo } from "./workshop_v2.js";
import { sourcesOf } from "./sources.js";

const maxN = (p, r) => [3, 2, 1].find((b) => b <= (r.batchMax || 3) && F.inputsReady(p, r, b)) || 0;
// 每味材料按"先用次的 / 先用好的"实际会取到的最好一份（只用于在材料签上标品级；带宽仍以 facilities.herbPreview 为准）
function topOf(p, id, need, prefer) {
  const st = p.storage.items.filter((it) => it.id === id).sort((a, b) => (prefer === "high" ? (b.rarity || 0) - (a.rarity || 0) : (a.rarity || 0) - (b.rarity || 0)));
  let left = need, top = 0;
  for (const it of st) {
    if (left <= 0) break;
    top = Math.max(top, it.rarity || 0);
    left -= it.n || 1;
  }
  return top;
}

export function alchemyV2(ui, box) {
  const p = ui.p, S = ui.sel;
  const lv = F.facLevel(p, "furnace");
  if (lv < 1) return broken(ui, box);
  const { alchemy: list } = F.recipes();
  const known = list.filter((r) => F.recipeKnown(p, r));
  if (!S.rec || !list.find((r) => r.id === S.rec)) S.rec = (known.find((r) => F.alchemyCanStart(p, r).ok) || known[0] || list[0]).id;
  const r = list.find((x) => x.id === S.rec);
  // ---- 左：丹方目录 ----
  catalog(ui, box, {
    cap: "丹方 · 出行所得，仓库里研读后便会", on: S.rec,
    rows: list.map((rr) => {
      const c = F.alchemyCanStart(p, rr);
      const dim = !F.recipeKnown(p, rr) || (rr.furnace || 1) > lv;
      let st = c.ok ? `可炼 · 一炉至多 ${maxN(p, rr)} 份` : c.why, cls = c.ok ? "ok" : "";
      if (c.why === "材料不足") (st = "缺 " + F.inputsOf(p, rr).filter((x) => x.have < x.need).map((x) => x.name).slice(0, 2).join("、")), (cls = "no");
      if (c.why === "尚无丹方" && rr.recipe) st += " · " + ((sourcesOf(itemId(rr.recipe))[0] || "").replace(/^.*· /, "") || "出行所得");
      return { id: rr.id, tag: tag({ id: itemId(rr.out) }, { size: 44, disabled: dim }), nm: rr.name, st, cls, dim };
    }),
    onPick: (id) => !ui.fire && ((S.rec = id), (S.batch = 1), (ui.lastBrew = null), ui.render()),
  });
  box.appendChild(el("div", "abs ws2-hint", "点炉边的材料，看缺的去哪里找。"));
  // ---- 中：丹炉 + 材料 + 火候 ----
  S.batch = Math.max(1, Math.min(S.batch || 1, maxN(p, r) || 1));
  const prefer = S.prefer || "low";
  const v = vessel(box, "furnace", { lit: !!ui.fire });
  const ins = F.inputsOf(p, r, S.batch);
  const stones = ins.find((x) => x.id === F.STONE());
  const herbs = ins.filter((x) => x !== stones);
  // 药引（灵泉水）在炉口上方，药材依次左右上、左右下；最多 6 味（ringPos）
  const ml = [];
  if (r.water) ml.push({ id: itemId("灵泉水"), name: "灵泉水", need: r.water * S.batch, have: r.water * S.batch, free: !0, role: "药引" });
  herbs.forEach((x, i) => ml.push({ id: x.id, name: x.name, need: x.need, have: x.have, rarity: (ITEMS[x.id] || {}).cat === "herb" ? topOf(p, x.id, x.need, prefer) : 0, role: i === 0 ? "主药" : "辅药", main: !r.water && i === 0 }));
  if (stones && stones.need) ml.push({ id: stones.id, name: "灵石", need: stones.need, have: stones.have });
  // 没有药引时第一格（炉口上方）空着，药材从两侧排起
  const pos = r.water || ml.length > 5 ? ringPos(ml.length, "furnace") : ringPos(ml.length + 1, "furnace").slice(1);
  placeMats(ui, v, ml.map((m, i) => ({ ...m, x: pos[i][0], y: pos[i][1] })));
  const hq = F.herbPreview(p, r, S.batch, prefer);
  const band = F.alchemyBand(p, r, hq);
  const fire = el("div", "ws2-fire" + (ui.fire ? "" : " idle"));
  fire.innerHTML = `<div class="r">火候<small>${ui.fire ? "按住 Space / 鼠标 添火 · 松开 退火" : "开炉后：按住 Space 或鼠标添火"}</small></div>
    <div class="track"><div class="ink-bar thick" style="--v:${ui.fire ? ui.fire.g.temp : 0.12}"><i></i></div><span class="zone"></span><span class="needle"></span></div>
    <div class="ends"><span>文火</span><span>武火</span></div><div class="live"><span>余 <b class="tl">${r.time || 18}</b> 息</span><span>入火候 <b class="pc">0%</b></span><span>丹品 <b class="gr">—</b></span></div>`;
  v.appendChild(fire);
  const zone = fire.querySelector(".zone"), needle = fire.querySelector(".needle"), bar = fire.querySelector(".ink-bar");
  zone.style.left = (0.5 - band / 2) * 100 + "%";
  zone.style.width = band * 100 + "%";
  needle.style.left = "12%";
  ui.fireEls = { zone, needle, bar, glow: v.querySelector(".glow"), tl: fire.querySelector(".tl"), pc: fire.querySelector(".pc"), gr: fire.querySelector(".gr") };
  ming(ui, v, "furnace");
  // ---- 右：丹方卡 ----
  const out = ITEMS[itemId(r.out)] || {};
  const c = F.alchemyCanStart(p, r, S.batch);
  const cd = card(box);
  const h = el("div", "head");
  h.appendChild(tag({ id: itemId(r.out) }, { size: 56, disabled: !F.recipeKnown(p, r) }));
  h.appendChild(el("div", "", `<div class="nm">${r.name}</div><div class="sub">丹药 · 一炉 ${(r.n || 1) * S.batch} 枚 · 火候 ${r.time || 18} 息${(r.furnace || 1) > 1 ? ` · 需丹炉${JIE[r.furnace]}` : ""}</div>`));
  cd.appendChild(h);
  if (out.desc) cd.insertAdjacentHTML("beforeend", `<div class="desc">${out.desc}</div>`);
  if (!F.recipeKnown(p, r)) cd.insertAdjacentHTML("beforeend", `<div class="lockbox"><div class="why">尚无丹方</div><div class="how">${r.recipe ? sourcesOf(itemId(r.recipe)).join("；") || "出行所得" : ""}</div></div>`);
  else if ((r.furnace || 1) > lv) cd.insertAdjacentHTML("beforeend", `<div class="lockbox"><div class="why">需丹炉${JIE[r.furnace]}</div><div class="how">在炉铭处升阶。</div></div>`);
  else {
    const bt = el("div", "ws2-opts");
    bt.innerHTML = `<span class="ink-label">一炉</span>`;
    for (const n of [1, 2, 3].filter((n) => n <= (r.batchMax || 3)))
      bt.appendChild(btn(n + " 份", () => !ui.fire && ((S.batch = n), ui.render()), { cls: S.batch === n ? "on" : "", disabled: !F.inputsReady(p, r, n), id: "batch" + n }));
    cd.appendChild(bt);
    const hqHi = F.herbPreview(p, r, S.batch, "high");
    if (hqHi > 0) {
      const pr = el("div", "ws2-opts");
      pr.innerHTML = `<span class="ink-label">灵草</span>`;
      for (const [k, n] of [["low", "先用次的"], ["high", "先用好的"]]) pr.appendChild(btn(n, () => !ui.fire && ((S.prefer = k), ui.render()), { cls: prefer === k ? "on" : "", id: "prefer-" + k }));
      pr.insertAdjacentHTML("beforeend", `<span class="ink-note">火候带宽 ×${F.RULES.herbBand[hq]}（<span style="color:${qText(hq)}">${qName(hq)}</span>）</span>`);
      cd.appendChild(pr);
    }
    const G = F.RULES.grades;
    cd.insertAdjacentHTML("beforeend", `<div class="sec">丹品<small>火候落在朱色区间里的时间占比</small></div>
      <div class="ws2-qbar">${[[-1, "废"], [0, qName(0)[0]], [1, qName(1)[0]], [2, qName(2)[0]], [3, qName(3)[0]]].map(([g, n], i) => `<div class="on" style="--qc:${g < 0 ? "#3b3a36" : RARITY[g].color}"><b>${n}</b><small>${i === 0 ? "<" + Math.round(G[0][0] * 100) + "%" : "≥" + Math.round(G[i - 1][0] * 100) + "%"}</small></div>`).join("")}</div>`);
    const ms = F.RULES.mastery, cnt = F.caveState(p).brews[r.id] || 0, mastered = F.isMastered(p, r);
    cd.insertAdjacentHTML("beforeend", `<div class="ws2-rate"><div class="ink-ring" style="--v:${ms ? Math.min(1, cnt / ms) : mastered ? 1 : 0};--rc:var(--shilv)"><span class="pct">${ms ? `${Math.min(cnt, ms)}<small style="font-size:11px">/${ms}</small>` : mastered ? "熟" : "生"}</span></div>
      <p>${mastered ? `已熟练：可<span class='ink-zhu'>文火自成</span>，不看火候直接得${qName(1)}。` : ms ? `同方成丹 ${ms} 次后熟练，可跳过火候。` : `炼出一炉${qName(3)}即熟练，之后可跳过火候。`}</p></div>`);
  }
  // ---- 右下：开炉 ----
  const mastered = F.isMastered(p, r);
  const extra = [];
  if (mastered && !ui.fire) extra.push(btn("文火自成", () => startAlchemy(ui, r, !0), { disabled: !c.ok, id: "auto" }));
  act(ui, box, { label: ui.fire ? "守炉" : "开炉", id: "brew", disabled: !c.ok || !!ui.fire, ok: c.ok && !ui.fire, okText: "可开炉", why: ui.fire ? "炉火正旺" : c.why, how: ui.fire ? "按住 Space 添火 · Esc 离炉" : c.why === "材料不足" ? "炉边朱圈是缺的" : "", extra, onSeal: () => startAlchemy(ui, r, !1) });
  if (ui.fire) fireLoop(ui, box);
  else showLast(ui, v);
}
function startAlchemy(ui, r, skip) {
  const p = ui.p;
  const sess = F.alchemyStart(p, r, ui.sel.batch || 1, ui.sel.prefer || "low");
  if (!sess.ok) return ui.toast(sess.why, "zhu");
  ui.lastBrew = null;
  ui.cave.changed({ silent: !0 });
  if (skip) return finishAlchemy(ui, sess, 1);
  const g = new FireGame({ time: sess.time, band: sess.band });
  if (ui.cave.debug.alchemyAuto) g.autopilot = !0;
  if (ui.cave.debug.alchemyTime) g.time = ui.cave.debug.alchemyTime;
  ui.fire = { g, sess, heat: !1, key: !1, paused: !1, leave: (then) => leaveFire(ui, then) };
  ui.render();
}
// 开炉中离开（Esc / 回洞府 / 切标签）：先问一句，问的时候火候暂停。
// 规则：中途离开 = 这一炉作废，开炉时已投入的材料不退（开炉即扣料，facilities.alchemyStart）；不计成丹次数。
export const LEAVE_TEXT = "炉火未尽，此时离开，<b>这一炉作废</b>，已投入的药材与灵石<b>不退</b>。";
async function leaveFire(ui, then) {
  const F0 = ui.fire;
  if (!F0) return then && then();
  if (F0.asking) return;
  F0.asking = F0.paused = !0;
  F0.heat = F0.key = !1;
  const ask = ui.confirm("离炉", LEAVE_TEXT, { ok: "离炉", cancel: "继续守炉" });
  const m = ui.root.querySelector(".cv-modal:last-of-type");
  if (m) m.classList.add("ws2-leave");
  // 确认框自己的键位：Esc = 继续守炉，Enter = 离炉（捕获阶段截住，不让洞府的 Esc / Space 再处理）
  const key = (e) => {
    if (!m || !m.isConnected) return removeEventListener("keydown", key, !0);
    if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") (e.preventDefault(), e.stopImmediatePropagation());
    if (e.repeat) return;
    if (e.code === "Escape") m.querySelector("[data-act=cancel]").click();
    else if (e.code === "Enter") m.querySelector("[data-act=ok]").click();
  };
  addEventListener("keydown", key, !0);
  const ok = await ask;
  removeEventListener("keydown", key, !0);
  F0.asking = F0.paused = !1;
  F0.heat = F0.key = !1;
  if (!ok || ui.fire !== F0) return;
  ui.fire = null;
  ui.cave.fireK(null);
  ui.lastBrew = { grade: -1, abandoned: !0, items: [], name: F0.sess.recipe.name, t: performance.now(), shown: !0 };
  ui.brewEnd = performance.now();
  ui.toast("离炉：这一炉作废，已投入的材料不退", "zhu", 3);
  ui.cave.emit("cave:alchemy", { grade: -1, abandoned: !0, recipe: F0.sess.recipe.id, items: [] });
  if (then) then();
  else ui.cave.changed();
}
function fireLoop(ui, box) {
  const F0 = ui.fire, g = F0.g;
  const page = ui.page;
  const down = (e) => {
    if (e.button === 0 && !e.target.closest("button")) F0.heat = !0;
  };
  const up = () => (F0.heat = !1);
  page.addEventListener("mousedown", down);
  addEventListener("mouseup", up);
  const kd = (e) => e.code === "Space" && ((F0.key = !0), e.preventDefault());
  const ku = (e) => e.code === "Space" && (F0.key = !1);
  addEventListener("keydown", kd);
  addEventListener("keyup", ku);
  const off = () => (removeEventListener("mouseup", up), removeEventListener("keydown", kd), removeEventListener("keyup", ku));
  let last = performance.now();
  const tick = () => {
    if (ui.fire !== F0 || !box.isConnected) return off();
    const E = ui.fireEls;
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    if (F0.paused) return requestAnimationFrame(tick); // 离炉确认框开着：火候停住
    const dbg = ui.cave.debug;
    if (dbg.alchemyTemp != null) (g.temp = dbg.alchemyTemp), (g.vel = 0);
    g.update(dt, F0.heat || F0.key);
    if (dbg.alchemyTemp != null) g.temp = dbg.alchemyTemp;
    E.zone.style.left = (g.center - g.band / 2) * 100 + "%";
    E.zone.style.width = g.band * 100 + "%";
    E.zone.classList.toggle("in", g.inside);
    E.needle.style.left = g.temp * 100 + "%";
    E.bar.style.setProperty("--v", g.temp.toFixed(3));
    E.glow.style.opacity = (0.3 + g.temp * 0.7).toFixed(2);
    E.tl.textContent = Math.max(0, Math.ceil(g.time - g.t));
    E.pc.textContent = Math.round(g.ratio * 100) + "%";
    const sg = shownGrade(F0.sess.recipe, g.grade); // 与出丹同一套：带内比例 → gradeOf → 丹方保底
    if (F0.sg !== sg) (F0.sg = sg), (E.gr.textContent = F.GRADE_NAME[sg]), (E.gr.style.color = sg >= 0 ? qText(sg) : ""); // 品级字色 inkReadable，变了才写
    ui.cave.fireK(0.25 + g.temp * 0.9);
    if (g.done) {
      off();
      finishAlchemy(ui, F0.sess, g.grade, g.ratio);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const shownGrade = (rec, g) => (rec.minGrade != null ? Math.max(g, rec.minGrade) : g);
// 失控门槛（入火候低于它 = 废丹），从 RULES.grades 现算
const failBelow = () => Math.round((F.RULES.grades.filter(([, g]) => g < 0).pop() || [0.4])[0] * 100);
function finishAlchemy(ui, sess, grade, ratio) {
  const p = ui.p;
  const r = F.alchemyFinish(p, sess, grade);
  const g = r.grade; // alchemyFinish 已按丹方保底（minGrade）定品，提示与入库同一个结果
  ui.fire = null;
  ui.brewEnd = performance.now();
  ui.cave.fireK(null);
  ui.cave.fxPuff("furnace");
  ui.lastBrew = { grade: g, ratio, items: r.items, name: sess.recipe.name, t: performance.now() };
  if (g >= 2) (ui.cave.fxSurge("furnace", g >= 3 ? 0xd2321e : 0xe0b45a), surge(ui.root, g + 1));
  const pc = ratio == null ? "" : `入火候 ${Math.round(ratio * 100)}%`;
  const cnt = r.items.reduce((n, it) => n + it.n, 0);
  ui.toast(
    g < 0
      ? `炉火失控（${pc}，不足 ${failBelow()}%）：药材已耗${cnt ? `，只得${F.RULES.waste} ×${cnt}` : "，未成丹"}`
      : `出丹：${F.GRADE_NAME[g]}${sess.recipe.name} ×${cnt}${pc ? `（${pc}${sess.recipe.minGrade != null && grade < g ? "，丹方保底" : ""}）` : "（文火自成）"}`,
    g < 0 ? "zhu" : "gold",
    3,
  );
  ui.cave.changed();
  ui.cave.emit("cave:alchemy", { grade: g, recipe: sess.recipe.id, items: r.items });
}
function showLast(ui, v) {
  const L = ui.lastBrew;
  if (!L || L.shown) return;
  L.shown = !0;
  stamp(v, 260, 260, { text: F.GRADE_NAME[L.grade], q: Math.max(0, L.grade), cls: L.grade < 0 ? "ink" : undefined, bloom: L.grade >= 0 });
}

// ======================= 丹炉未复燃（按修为解锁：FACILITIES.furnace.unlock） =======================
// 不再用材料修复：到解锁层突破时自动复燃；这里只说明在哪一层、复燃后送什么丹方、往后升阶要什么野外材料
function broken(ui, box) {
  const p = ui.p, L = lockedInfo("furnace");
  const { alchemy: list } = F.recipes();
  catalog(ui, box, { cap: "丹方", rows: list.filter((r) => F.recipeKnown(p, r)).map((r) => ({ id: r.id, tag: tag({ id: itemId(r.out) }, { size: 44, disabled: !0 }), nm: r.name, st: "丹炉未复燃", dim: !0 })), on: null, onPick: () => ui.toast("丹炉还没复燃 · " + L.at, "zhu") });
  vessel(box, "furnace", { broken: !0 });
  const c = card(box);
  c.insertAdjacentHTML("beforeend", `<div class="nm">丹炉未复燃</div><div class="desc">炉火熄了好些年。修为到<b>${L.at.replace(/解锁$/, "")}</b>，真气引得动炉火，丹炉自会复燃${L.gifts.length ? `，届时便能炼${L.gifts.join("、")}` : ""}。</div>
    ${L.next.length ? `<div class="sec">往后升阶<small>野外所得</small></div><div class="desc">${L.next.join("、")}</div>` : ""}`);
  act(ui, box, { label: "复燃", id: "up-furnace", disabled: !0, ok: !1, why: L.at, how: "突破即复燃", onSeal: () => {} });
}
void nameOf;
