// 洞府设施页（模块 C），版式对照 docs/ui/v2/png：灵泉·静室 = realm（册页两开），丹器房 = alchemy（竹简丹方 + 写意丹炉 + 火候一笔），
// 仓库 = bag（米字格 + 浮签详情），出行台 = 立绘 + 一张纸。界面里不出现 3D 人偶，人物一律用 2D 立绘。
// 页面只负责显示与收集选择；规则在 src/game/cave/facilities.js，演出与存档在 src/game/cave/index.js（cave.*）。
import { RARITY, defOf, valueOf, sizeOf, ITEMS } from "../../core/items.js";
import { weaponAffixText } from "../../data/items.js";
import { heroStats, applyUnlocks, realmName } from "../../game/progression.js";
import { PROGRESSION } from "../../data/progression.js";
import * as F from "../../game/cave/facilities.js";
import { FACILITIES, STATIONS, REFINE, STAT_NAME, itemId, itemName as nameOf } from "../../game/cave/data.js";
import { FireGame } from "../../game/cave/alchemy_game.js";
import { el, btn, slot, paper, itemName, rcolor, Q } from "./widgets.js";
import { unlockText, surge, buffFx } from "./overlays.js";
import { ART } from "./style.js";
import { itemTag, tagReveal, skillIconEl, setTagState } from "../icons.js";
import { syncNewLearned } from "../loadout.js";
import { packBag } from "../bagui.js";
import { XJZ_TIPS } from "../../game/cave/story.js";
import { wsShell, isForgeTab } from "./workshop_v2.js";
import { forgeV2 } from "./forge_v2.js";
import { alchemyV2 } from "./alchemy_v2.js";
import { pageHint } from "../../game/gongfa.js"; // 残页提示（功法残页 / 丹方残页同一句式）

const NUM = (n) => Math.round(n).toLocaleString("en-US");
const JIE = ["残", "一阶", "二阶", "三阶"];
const GJIE = ["初开", "一阶", "二阶", "三阶"]; // 药园：0 级已可用（开局 1 块地）
const CN = "一二三四五六七八九十";
const QN = ["凡品", "灵品", "宝品", "仙品", "极品"];
const QSEAL = ["ink", "green", "blue", "gold", ""];
const PILLQ = ["下品", "中品", "上品", "极品"];
const STAT_KEYS = [["hp", "气血"], ["mp", "真气"], ["atk", "攻击 · 法力"], ["def", "防御"], ["sense", "神识"]]; // 神识：搜取探查（docs/ui/v2/搜取_v1.md）
const CAT_NAME = { stone: "灵石", herb: "灵草", ore: "矿材", beast: "妖材", core: "妖丹", treasure: "灵物", gear: "装备", artifact: "法宝", scroll: "功法", recipe: "丹方", pill: "丹药", talisman: "符箓", quest: "要物" };

function costHtml(p, cost) {
  return `<span class="cost">${F.costList(cost)
    .map((c) => {
      const have = p.storage.count(c.id);
      return `<span class="${have >= c.n ? "" : "cv-bad"}">${c.name}<b>${have}/${c.n}</b></span>`;
    })
    .join("")}</span>`;
}
function affixRow(a, base) {
  if (a.stat === "special") return `<div class="ink-row"><span class="k cv-gold">◆ 奇效</span><span class="v cv-gold">${weaponAffixText(a) || a.value}</span></div>`;
  const pct = a.type === "pct" || ["crit", "cdr"].includes(a.stat) || (Math.abs(a.value) < 1 && a.value !== 0);
  const v = pct ? (a.value * 100).toFixed(1).replace(/\.0$/, "") + "%" : Math.round(a.value * 10) / 10;
  const n = String(a.stat).startsWith("imbue_") ? "附灵 · " + ({ metal: "金", wood: "木", water: "水", fire: "火", earth: "土" }[a.stat.slice(6)] || "") : STAT_NAME[a.stat] || a.stat;
  return `<div class="ink-row"><span class="k">${n}${base ? "" : ""}</span><span class="v ${base ? "" : "c-bao"}">${String(a.stat).startsWith("imbue_") ? "" : (a.value >= 0 ? "+" : "") + v}</span></div>`;
}
// 设施升级一行（cv-up）：返回 { row, info }
function upgradeRow(ui, id, label) {
  const p = ui.p, u = F.upgradeInfo(p, id), f = FACILITIES[id];
  const row = el("div", "cv-up");
  if (u.max) row.innerHTML = `<span class="ink-label">${label || f.name} · ${JIE[u.lv]}（圆满）</span>`;
  else {
    const word = id === "garden" ? "扩建" : u.lv === 0 ? "修复" : "升" + JIE[u.lv + 1];
    row.innerHTML = `<span class="ink-label">${label || f.name}${u.lv ? " · " + JIE[u.lv] : ""}　${word}</span>${u.blocked ? `<span class="ink-note">${u.blocked}</span>` : costHtml(p, u.cost)}`;
    if (!u.blocked) row.appendChild(btn(word, () => doUpgrade(ui, id), { disabled: !u.ok, id: "up-" + id }));
  }
  return row;
}
function doUpgrade(ui, id) {
  const u = F.upgradeInfo(ui.p, id);
  if (F.upgrade(ui.p, id)) {
    ui.cave.fxPuff(id);
    ui.toast(`${FACILITIES[id].name}${u.lv === 0 ? "修好了" : "升至" + JIE[u.lv + 1]}`, "gold");
    ui.cave.changed();
  }
}

// ======================= 灵泉·静室（realm.png） =======================
function spring(ui, box) {
  const p = ui.p, S = ui.sel;
  const lv = F.facLevel(p, "spring"), per = REFINE.stone[lv];
  const need = p.xp + F.xpRoom(p);
  const full = p.xp >= need;
  const key = p.realm.stage + ":" + p.realm.layer;
  const nextR = PROGRESSION.next[key];
  const al = el("div", "abs album ink-mount");
  const inner = el("div", "ink-mount-in");
  inner.appendChild(el("div", "fold"));
  al.appendChild(inner);
  box.appendChild(al);
  ui.album = al;
  // ---- 左页：立绘 + 灵气 + 修为 ----
  const L = el("div", "page");
  const stage = p.realm.stage === 0 ? "凡人" : PROGRESSION.stages[p.realm.stage].name;
  L.innerHTML = `<div class="qi"></div><div class="enso"></div><div class="fig" role="img" aria-label="林墨" style="background-image:url('${ART.portrait}')"></div>
    <div class="lp-title"><div class="t ink-splash">${stage}</div><div class="ink-tiba">${p.realm.stage >= 2 ? "筑基固本 · 道心初成" : "吐纳天地 · 积气成海"}</div></div>
    <div class="lp-foot"><div class="r"><span>${realmName(p).replace("·", "")}</span><small class="xpn">修为 ${NUM(p.xp)} / ${NUM(need)}</small></div>
    <div class="r"><small title="神识：搜取时探查墨封的快慢（时长 ×100/(100+神识)），≥40 时墨封下隐约见得宝光">神识 ${Math.round(heroStats(p).sense || 0)}</small></div>
    <div class="ink-bar xp" style="--v:${Math.min(1, p.xp / need)}"><i></i></div>
    <div class="ink-note">${full ? "修为圆满，可以冲关了。" : `还差 ${NUM(need - p.xp)} 修为：约 ${Math.ceil((need - p.xp) / per)} 块灵石，或炼化妖丹灵物。`}</div>
    <div class="lb">${(() => { const lb = F.layerBonus(p), N = { hp: "气血", mp: "真气", atk: "攻击", spell: "法力", def: "防御" }, t = Object.entries(lb).filter(([k]) => N[k]).map(([k, v]) => `${N[k]} +${Math.round(v)}`); return t.length ? `当前修为加成：${t.join(" · ")}` : "当前修为加成：随本层修为增长"; })()}</div></div>`;
  // 当前增益（灵气充盈）
  const cb = F.currentBuff(p);
  if (cb) L.insertAdjacentHTML("beforeend", `<div class="lp-buff"><span class="ink-seal blue" style="--s:26px;font-size:12px">气</span><span><b>${F.buffName(cb)}</b>　${F.modsText(cb.mods)}<small>出行局内计时 · 剩 ${F.fmtTime(cb.remain)}</small></span></div>`);
  const lm = el("div", "lp-mirror");
  lm.appendChild(btn(`天机镜 · 已亮 ${(p.flags.memories || []).length} 段`, () => ui.showMirrors(), { id: "mirrors" }));
  L.appendChild(lm);
  inner.appendChild(L);
  ui.xpBar = L.querySelector(".ink-bar");
  ui.xpNum = L.querySelector(".xpn");
  // ---- 右页：境界阶梯 ----
  const R = el("div", "page");
  const lad = el("div", "ladder");
  if (p.realm.stage <= 1) {
    for (let i = 1; i <= 9; i++) {
      const cls = p.realm.stage === 1 && i === p.realm.layer ? "now" : p.realm.stage === 1 && i < p.realm.layer ? "done" : "";
      lad.insertAdjacentHTML("beforeend", `<span class="lv ${cls}">${CN[i - 1]}层</span>`);
    }
    lad.insertAdjacentHTML("beforeend", `<span class="sep"></span><span class="lv big">筑基</span>`);
  } else {
    lad.insertAdjacentHTML("beforeend", `<span class="lv done">练气</span><span class="sep"></span>`);
    for (let i = 1; i <= 3; i++) lad.insertAdjacentHTML("beforeend", `<span class="lv ${i === p.realm.layer ? "now" : ""}">${CN[i - 1]}层</span>`);
  }
  R.appendChild(lad);
  const b = F.breakInfo(p);
  const req = PROGRESSION.breakReq[key] || [];
  R.insertAdjacentHTML("beforeend", `<div class="ladder-note ink-note">${nextR ? (b.trial ? "筑基 · 需筑基丹 · 渡心魔劫" : `下一层 · ${realmName({ realm: nextR })}`) : "此后之路 · 尚在画外"}</div>`);
  // ---- 破境所得 / 之需 ----
  if (nextR) {
    const fake = { realm: { ...nextR }, unlocks: { ...p.unlocks } };
    const before = { ...p.unlocks };
    applyUnlocks(fake);
    const newU = Object.keys(fake.unlocks).filter((k) => JSON.stringify(fake.unlocks[k]) !== JSON.stringify(before[k])).map((k) => ({ key: k, value: fake.unlocks[k] }));
    const a = heroStats(p), c = heroStats(fake);
    const rp = el("div", "rp");
    rp.innerHTML = `<div><div class="ink-h">破境所得</div><div class="ink-list">${STAT_KEYS.map(([k, n]) => `<div class="ink-row"><span class="k">${n}</span><span class="v">${Math.round(c[k] || 0)}<span class="up">+${Math.round((c[k] || 0) - (a[k] || 0))}</span></span></div>`).join("")}
      ${newU.length ? `<div class="ink-row"><span class="k">解锁</span><span class="v kai ul">${newU.map(unlockText).join("、")}</span></div>` : ""}</div>
</div>
      <div><div class="ink-h">破境之需</div><div class="ink-list">
      <div class="ink-row"><span class="k">修为圆满</span>${full ? '<span class="v kai c-ling">已足</span>' : `<span class="v miss">尚缺 ${NUM(need - p.xp)}</span>`}</div>
      ${req.map((r) => { const h = p.storage.count(r.id); return `<div class="ink-row"><span class="k">${nameOf(r.id)}</span><span class="v kai ${h >= r.n ? "c-ling" : "cv-bad"}">${h} / ${r.n} ${h >= r.n ? "足" : "缺"}</span></div>`; }).join("")}
      ${b.trial ? `<div class="ink-row"><span class="k">心魔劫</span><span class="v kai">须亲手斩之</span></div>` : ""}
      <div class="ink-row"><span class="k">失败</span><span class="v kai">${b.trial ? "丹不失 · 可再试" : "小境界无险"}</span></div></div></div>`;
    R.appendChild(rp);
  }
  // ---- 灵泉炼化 ----
  const rf = el("div", "refine");
  if (!full) {
    const cap = F.stoneCap(p);
    // 灵石前期稀缺（用户要求）：默认不投灵石，先勾上"宜炼化"的妖丹 / 灵物（按修为从高到低，够本层所需为止）；灵石由玩家自己拖
    S.stones = Math.min(S.stones ?? 0, cap);
    const list = F.refinables(p);
    if (!S.uids) {
      S.uids = new Set();
      let room = need - p.xp;
      for (const it of list.filter((x) => F.refineCompare(p, x).best === "refine").sort((a, b) => F.refineValue(p, b) - F.refineValue(p, a))) {
        if (room <= 0) break;
        S.uids.add(it.uid);
        room -= F.refineValue(p, it);
      }
    }
    for (const u of [...S.uids]) if (!list.find((x) => x.uid === u)) S.uids.delete(u);
    rf.innerHTML = `<div class="ink-h">灵泉炼化<small>灵泉${JIE[lv]} · 1 灵石 = ${per} 修为 · 仓库灵石 ${NUM(p.storage.count(F.STONE()))}</small></div>`;
    const sl = el("div", "sl");
    sl.innerHTML = `<span class="ink-label">投入灵石</span><input type="range" class="cv-range" min="0" max="${cap}" value="${S.stones}"><span class="ink-num"></span>`;
    const inp = sl.querySelector("input"), lab = sl.querySelector(".ink-num");
    rf.appendChild(sl);
    const pv = el("div", "buffpv");
    rf.appendChild(pv);
    const chips = el("div", "chips");
    for (const it of list) {
      const ch = el("div", "chip cmp");
      const cmp = F.refineCompare(p, it);
      ch.appendChild(slot(it, { cls: S.uids.has(it.uid) ? "is-sel" : "" }));
      const yi = '<span class="ink-seal cv-yi">宜</span>';
      ch.insertAdjacentHTML(
        "beforeend",
        `<small class="r">${cmp.best === "refine" ? yi : ""}炼化 <b>+${cmp.direct}</b></small>` +
          `<small class="h">${cmp.best === "hualing" ? yi : ""}化灵 ${cmp.stones}石≈<b>${cmp.via}</b></small>`,
      );
      Object.assign(ch.dataset, { uid: it.uid, direct: cmp.direct, stones: cmp.stones, via: cmp.via, best: cmp.best });
      ch.title = `直接炼化得修为 ${cmp.direct}；化灵得灵石 ${cmp.stones}，再炼化约得修为 ${cmp.via}（按当前灵泉等级）`;
      ch.addEventListener("click", () => {
        S.uids.has(it.uid) ? S.uids.delete(it.uid) : S.uids.add(it.uid);
        ch.querySelector(".ink-slot").classList.toggle("is-sel");
        upd();
      });
      chips.appendChild(ch);
    }
    // 聚气丹：点一下服用
    for (const it of p.storage.items.filter((x) => (defOf(x) || {}).use && defOf(x).use.xp != null)) {
      const d = defOf(it);
      const xp = Array.isArray(d.use.xp) ? d.use.xp[Math.min(d.use.xp.length - 1, it.rarity || 0)] : d.use.xp;
      const ch = el("div", "chip");
      ch.dataset.pill = it.uid;
      ch.appendChild(slot(it));
      ch.insertAdjacentHTML("beforeend", `<small>服${PILLQ[it.rarity || 0]} <b>+${xp}</b></small>`);
      ch.title = `本层已服 ${F.juqiUsed(p)}/${F.RULES.juqi}，多服生丹毒`;
      ch.addEventListener("click", () => {
        const r = F.takeXpPill(p, it.uid);
        if (!r.ok) return ui.toast(r.why, "zhu");
        ui.cave.fxMeditate(1.2);
        ui.toast(`服下${d.name}，修为 +${r.xp}`, "gold");
        ui.cave.changed();
      });
      chips.appendChild(ch);
    }
    if (!chips.children.length) chips.appendChild(el("div", "ink-note", "仓库里没有妖丹、灵物。精英妖兽、灵光点、遗府里常有。"));
    // 物品多时横向滚动：左右各一枚箭头，溢出时才出现
    const cw = el("div", "chipw");
    const arL = el("button", "ar l", "‹"), arR = el("button", "ar r", "›");
    arL.dataset.act = "chips-l";
    arR.dataset.act = "chips-r";
    const upArr = () => {
      const max = chips.scrollWidth - chips.clientWidth;
      arL.classList.toggle("on", chips.scrollLeft > 2);
      arR.classList.toggle("on", chips.scrollLeft < max - 2);
    };
    for (const [a, d] of [[arL, -1], [arR, 1]])
      a.addEventListener("click", (e) => (e.stopPropagation(), chips.scrollBy({ left: d * chips.clientWidth * 0.8, behavior: "smooth" })));
    chips.addEventListener("scroll", upArr, { passive: !0 });
    chips.addEventListener("wheel", (e) => (e.preventDefault(), (chips.scrollLeft += e.deltaY + e.deltaX)), { passive: !1 });
    cw.append(arL, chips, arR);
    rf.appendChild(cw);
    requestAnimationFrame(upArr);
    const upd = () => {
      S.stones = +inp.value;
      inp.style.setProperty("--p", (cap ? (S.stones / cap) * 100 : 0) + "%");
      const g = S.stones * per + [...S.uids].reduce((s, u) => s + F.refineValue(p, list.find((x) => x.uid === u)), 0);
      lab.innerHTML = `${S.stones} 块 <span class="cv-gold">+${Math.min(g, need - p.xp)}</span>`;
      ui.refineGain = g;
      // 预览：按本次实际得到的修为定档（溢出的不算）
      const lq = F.lingqiFor(p, Math.min(g, need - p.xp), need);
      const cb = F.currentBuff(p);
      pv.innerHTML = lq
        ? `本次炼化可得 <b>${lq.name}</b>：${F.modsText(lq.mods)} · ${Math.round(lq.sec / 60)} 分钟${cb && cb.tier > lq.tier ? `<span class="ink-note">（已有更高档，只续时长）</span>` : ""}`
        : `<span class="ink-note">一次炼化本层所需修为的 ${Math.round(F.LINGQI.tiers[0].ratio * 100)}% 以上，可得「${F.LINGQI.name}」</span>`;
      pv.dataset.tier = lq ? lq.tier : 0;
    };
    inp.addEventListener("input", upd);
    inp.addEventListener("mousedown", (e) => e.stopPropagation());
    upd();
  } else rf.innerHTML = `<div class="ink-h">灵泉炼化<small>修为已满，灵泉暂歇。突破之后再炼。</small></div>`;
  R.appendChild(rf);
  const up = el("div", "upw");
  up.appendChild(upgradeRow(ui, "spring", "灵泉"));
  R.appendChild(up);
  const go = el("div", "go");
  if (full) {
    const tip = paper("", b.ok ? (b.trial ? "服筑基丹冲关，<br>心魔会化作你的模样。" : "修为圆满，<br>落印便可破境。") : "修为已满，还缺<br>" + b.need.filter((x) => x.type === "item").map((x) => x.name).join("、"));
    tip.className = "ink-tip";
    tip.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
    go.appendChild(tip);
  }
  if (!full) go.appendChild(btn("炼化", () => doRefine(ui), { seal: !0, id: "refine" }));
  go.appendChild(btn(b.trial ? "渡劫" : "突破", () => ui.cave.breakthrough(), { seal: !0, disabled: !b.ok, id: "break" }));
  R.appendChild(go);
  const esc = el("div", "esc");
  esc.appendChild(btn("回洞府", () => ui.close(), { key: "Esc", id: "close" }));
  L.appendChild(esc);
  econGuide(ui, box);
  inner.appendChild(R);
}
async function doRefine(ui) {
  const p = ui.p, S = ui.sel;
  const g = ui.refineGain || 0;
  if (!g) return ui.toast("先选灵石或灵物", "zhu");
  const need = p.xp + F.xpRoom(p), from = p.xp, to = Math.min(need, p.xp + g);
  ui.busy(!0);
  ui.album && ui.album.classList.add("medit");
  const dur = ui.cave.fast ? 0.25 : REFINE.meditate;
  const done = ui.cave.meditate(dur);
  const t0 = performance.now();
  await new Promise((res) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      const v = from + (to - from) * k * k * (3 - 2 * k);
      if (ui.xpBar) ui.xpBar.style.setProperty("--v", (v / need).toFixed(3));
      if (ui.xpNum) ui.xpNum.textContent = `修为 ${NUM(v)} / ${NUM(need)}`;
      k < 1 ? requestAnimationFrame(step) : res();
    };
    step();
  });
  await done;
  const layerNeed = p.xp + F.xpRoom(p);
  const gain = F.refine(p, S.stones || 0, [...(S.uids || [])]);
  const lq = F.applyLingqi(p, gain, layerNeed);
  S.uids = null; // 下次打开重新按"宜炼化"预选
  S.stones = null;
  ui.busy(!1);
  ui.toast(`打坐炼化，修为 +${gain}`, "gold");
  ui.cave.changed({ stats: !0 }); // 本层修为进度加成随之变化：刷新主角属性
  if (lq) {
    ui.cave.fxSurge("spring", 0x7fd0c0);
    buffFx(ui.root, F.buffName(lq.buff), F.modsText(lq.buff.mods), lq.tierUp);
  }
  if (p.xp >= p.xp + F.xpRoom(p)) ui.cave.tip("breakReady");
}

// ======================= 丹器房（alchemy.png） =======================
// 丹器房 v2（方向二"鼎为中心"，docs/ui/v2/炼器_v2_方案.md）：炼丹、炼器使用 alchemy_v2.js / forge_v2.js；药园为独立页面。
// 炼器子类（gear / item / upgrade / imbue / reforge / bind）也可以直接当标签传：cave.open("forge", "reforge")。
// 下面旧版的 alchemy() / forge() 已不再调用，留待洞府组清理。
function workshop(ui, box) {
  wsShell(ui, box);
  if (isForgeTab(ui.tab)) forgeV2(ui, box);
  else alchemyV2(ui, box);
}
function slips(list, on, onPick) {
  const s = el("div", "ink-slips");
  for (const r of list) {
    const e = el("div", "ink-slip" + (r.id === on ? " on" : "") + (r.dim ? " dim" : ""), `${r.name}<small>　${r.note || ""}</small>`);
    e.dataset.rec = r.id;
    e.addEventListener("click", () => onPick(r.id));
    s.appendChild(e);
  }
  return s;
}
function brokenView(ui, box, id, glyph, title, text) {
  const st = el("div", "abs stove");
  if (id === "furnace") st.innerHTML = `<div class="art" style="background-image:url('${ART.danlu}');opacity:.28;filter:grayscale(1);transform:rotate(-14deg) translate(-10px,30px)"></div>`;
  else st.innerHTML = `<div class="big broken"><div class="ring" style="opacity:.2"></div>${glyph}</div>`;
  box.appendChild(st);
  const d = paper("abs detail alt");
  d.insertAdjacentHTML("beforeend", `<div class="name">${title}</div><p class="desc" style="margin-top:10px">${text}</p>`);
  const u = F.upgradeInfo(ui.p, id);
  d.insertAdjacentHTML("beforeend", `<div class="ink-list">${F.costList(u.cost).map((c) => { const h = ui.p.storage.count(c.id); return `<div class="ink-row"><span class="k">${c.name}</span><span class="v">${h} / ${c.n} <span class="${h >= c.n ? "c-ling" : "cv-bad"}">${h >= c.n ? "足" : "缺"}</span></span></div>`; }).join("")}</div>`);
  box.appendChild(d);
  ui.go(box, id === "garden" ? "开垦" : "修复", () => doUpgrade(ui, id), { disabled: !u.ok, id: "up-" + id });
}
function alchemy(ui, box) {
  const p = ui.p, S = ui.sel;
  const { alchemy: list } = F.recipes();
  const lv = F.facLevel(p, "furnace");
  if (lv < 1) return brokenView(ui, box, "furnace", "丹", "丹炉残破", "炉身倾倒、炉盖滚落一旁。修好它，才炼得出回春丹、聚气丹，乃至筑基丹。");
  const known = list.filter((r) => F.recipeKnown(p, r));
  if (!S.rec || !list.find((r) => r.id === S.rec)) S.rec = (known.find((r) => F.alchemyCanStart(p, r).ok) || known[0] || list[0]).id;
  const r = list.find((x) => x.id === S.rec);
  // 左：丹方竹简
  const left = el("div", "abs ws-left");
  const maxN = (rr) => [3, 2, 1].find((b) => b <= (rr.batchMax || 3) && F.inputsReady(p, rr, b)) || 0;
  left.appendChild(
    slips(
      list.map((rr) => {
        const c = F.alchemyCanStart(p, rr);
        return { id: rr.id, name: rr.name, note: c.ok ? `可炼 ×${maxN(rr)}` : c.why === "材料不足" ? "缺" + F.inputsOf(p, rr).filter((x) => x.have < x.need).map((x) => x.name)[0] : c.why, dim: !F.recipeKnown(p, rr) || (rr.furnace || 1) > lv };
      }),
      S.rec,
      (id) => !ui.fire && ((S.rec = id), (S.batch = 1), ui.render()),
    ),
  );
  left.appendChild(el("div", "note ink-note", "丹方得自出行所获；仓库里研读后便会。"));
  box.appendChild(left);
  // 中：丹炉 + 三味材料
  const st = el("div", "abs stove" + (ui.fire ? " lit" : ""));
  st.innerHTML = `<div class="glow"></div><div class="art" style="background-image:url('${ART.danlu}')"></div><div class="steam"></div><span class="ink-seal seal" style="--s:34px">丹</span>`;
  S.batch = Math.max(1, Math.min(S.batch || 1, maxN(r) || 1));
  const ins = F.inputsOf(p, r, S.batch).filter((x) => x.name !== "灵石");
  const pos = [["left:-6px;top:40px", "主药"], ["right:-6px;top:40px", "辅药"], ["left:158px;top:-16px", "药引"]];
  const mats = r.water ? [ins[0], ins[1], { name: "灵泉水", need: r.water * S.batch, have: r.water * S.batch, water: !0 }] : ins.slice(0, 3);
  mats.forEach((x, i) => {
    if (!x) return;
    const m = el("div", "mat");
    m.style.cssText = pos[i][0];
    const d = ITEMS[itemId(x.name)] || {};
    const ok = x.have >= x.need;
    m.innerHTML = `<span class="ink-slot ${x.water ? "q-fan" : ok ? "q-ling" : "q-fan"} ${ok ? "" : "is-empty"}"><b>${x.water ? "泉" : d.glyph || x.name[0]}</b><em>${Math.min(x.have, x.need)}/${x.need}</em></span><span class="ink-label">${pos[i][1]}</span><span class="ink-note ${ok ? "ok" : "no"}">${x.name}</span>`;
    st.appendChild(m);
  });
  if (ui.lastBrew && performance.now() - ui.lastBrew.t < 4000) st.insertAdjacentHTML("beforeend", `<div class="res"><span class="ink-seal two fx-stamp ${ui.lastBrew.grade < 0 ? "ink" : ""}" style="--s:86px;font-size:30px">${F.GRADE_NAME[ui.lastBrew.grade].slice(0, 2)}</span></div>`);
  box.appendChild(st);
  ui.stove = st;
  // 右：丹方详情
  const out = ITEMS[itemId(r.out)] || {};
  const c = F.alchemyCanStart(p, r, S.batch);
  const d = paper("abs detail alt");
  d.insertAdjacentHTML(
    "beforeend",
    `<div class="name">${r.name}<span class="ink-seal ${QSEAL[out.rarity || 1]}" style="--s:26px;font-size:13px">${(out.glyph || r.name[0])}</span></div>
    <div class="grade c-ling">一炉 ${(r.n || 1) * S.batch} 枚 · 火候 ${r.time || 18} 息${(r.furnace || 1) > 1 ? ` · 需丹炉${JIE[r.furnace]}` : ""}</div>
    <p class="desc">${out.desc || ""}</p>
    <div class="ink-list">${F.inputsOf(p, r, S.batch).map((x) => `<div class="ink-row"><span class="k">${x.name}</span><span class="v">${x.have} / ${x.need} <span class="${x.have >= x.need ? "c-ling" : "cv-bad"}">${x.have >= x.need ? "足" : "缺"}</span></span></div>`).join("")}
    ${r.water ? `<div class="ink-row"><span class="k">灵泉水</span><span class="v">${r.water * S.batch} <span class="c-ling">灵泉自取</span></span></div>` : ""}</div>`,
  );
  const bt = el("div", "batch");
  bt.innerHTML = `<span class="ink-label">一炉</span>`;
  for (const n of [1, 2, 3].filter((n) => n <= (r.batchMax || 3)))
    bt.appendChild(btn(n + " 份", () => !ui.fire && ((S.batch = n), ui.render()), { cls: S.batch === n ? "on" : "", disabled: !F.inputsReady(p, r, n), id: "batch" + n }));
  d.appendChild(bt);
  // 灵草取用：先用次的（省好草）/ 先用好的（火候带宽 × herbBand）
  const hq = F.herbPreview(p, r, S.batch, S.prefer || "low"), hqHi = F.herbPreview(p, r, S.batch, "high");
  if (hqHi > 0) {
    const pr = el("div", "batch");
    pr.innerHTML = `<span class="ink-label">灵草</span>`;
    for (const [k, n] of [["low", "先用次的"], ["high", "先用好的"]])
      pr.appendChild(btn(n, () => !ui.fire && ((S.prefer = k), ui.render()), { cls: (S.prefer || "low") === k ? "on" : "", id: "prefer-" + k }));
    pr.insertAdjacentHTML("beforeend", `<span class="ink-note">火候带宽 ×${F.RULES.herbBand[hq]}（<span style="color:${RARITY[hq].color}">${RARITY[hq].name}</span>）</span>`);
    d.appendChild(pr);
  }
  const ms = F.RULES.mastery, cnt = F.caveState(p).brews[r.id] || 0;
  const mastered = F.isMastered(p, r);
  d.insertAdjacentHTML("beforeend", `<div class="rate"><div class="ink-ring" style="--v:${ms ? Math.min(1, cnt / ms) : mastered ? 1 : 0};--rc:var(--shilv)"><span class="pct">${ms ? `${Math.min(cnt, ms)}<small style="font-size:12px">/${ms}</small>` : mastered ? "熟" : "生"}</span></div>
    <p>${mastered ? "已熟练：可<span class='ink-zhu'>文火自成</span>，<br>不看火候直接得中品。" : `火候落在<span class="ink-zhu">朱色区间</span>里越久，<br>丹品越高；偏离太久则成废丹。`}</p></div>`);
  d.appendChild(upgradeRow(ui, "furnace", "丹炉"));
  box.appendChild(d);
  // 下：火候一笔
  const fire = el("div", "abs fire");
  fire.innerHTML = `<div class="r">火候<small>按住 空格 / 鼠标 添火 · 松开 退火</small></div>
    <div class="track"><div class="ink-bar thick" style="--v:${ui.fire ? ui.fire.g.temp : 0.12}"><i></i></div><span class="zone"></span><span class="needle"></span></div>
    <div class="ends"><span>文火</span><span>武火</span></div><div class="live"><span>余 <b class="tl">${r.time || 18}</b> 息</span><span>入火候 <b class="pc">0%</b></span><span>丹品 <b class="gr">—</b></span></div>`;
  box.appendChild(fire);
  const zone = fire.querySelector(".zone"), needle = fire.querySelector(".needle"), bar = fire.querySelector(".ink-bar");
  const band = F.alchemyBand(p, r, F.herbPreview(p, r, S.batch, S.prefer || "low"));
  zone.style.left = (0.5 - band / 2) * 100 + "%";
  zone.style.width = band * 100 + "%";
  needle.style.left = "12%";
  ui.fireEls = { zone, needle, bar, glow: st.querySelector(".glow"), tl: fire.querySelector(".tl"), pc: fire.querySelector(".pc"), gr: fire.querySelector(".gr") };
  // 右下
  const extra = [];
  if (mastered && !ui.fire) extra.push(btn("文火自成", () => startAlchemy(ui, r, !0), { disabled: !c.ok, id: "auto" }));
  if (!c.ok && !ui.fire) extra.push(el("span", "ink-note", c.why));
  ui.go(box, ui.fire ? "守炉" : "开炉", () => startAlchemy(ui, r, !1), { disabled: !c.ok || !!ui.fire, id: "brew", extra });
  if (ui.fire) fireLoop(ui, box);
}
function startAlchemy(ui, r, skip) {
  const p = ui.p;
  const sess = F.alchemyStart(p, r, ui.sel.batch || 1, ui.sel.prefer || "low");
  if (!sess.ok) return ui.toast(sess.why, "zhu");
  ui.cave.changed({ silent: !0 });
  if (skip) return finishAlchemy(ui, sess, 1);
  const g = new FireGame({ time: sess.time, band: sess.band });
  if (ui.cave.debug.alchemyAuto) g.autopilot = !0;
  if (ui.cave.debug.alchemyTime) g.time = ui.cave.debug.alchemyTime;
  ui.fire = { g, sess, heat: !1, key: !1 };
  ui.render();
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
    E.gr.textContent = F.GRADE_NAME[g.grade];
    ui.cave.fireK(0.25 + g.temp * 0.9);
    if (g.done) {
      off();
      finishAlchemy(ui, F0.sess, g.grade);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function finishAlchemy(ui, sess, grade) {
  const p = ui.p;
  const r = F.alchemyFinish(p, sess, grade);
  const g = sess.recipe.minGrade != null ? Math.max(grade, sess.recipe.minGrade) : grade;
  ui.fire = null;
  ui.cave.fireK(null);
  ui.cave.fxPuff("furnace");
  ui.lastBrew = { grade: g, items: r.items, name: sess.recipe.name, t: performance.now() };
  if (g >= 2) (ui.cave.fxSurge("furnace", g >= 3 ? 0xd2321e : 0xe0b45a), surge(ui.root, g + 1));
  ui.toast(g < 0 ? "炉火失控，一炉药材化作焦烟" : `出丹：${F.GRADE_NAME[g]}${sess.recipe.name} ×${r.items.reduce((n, it) => n + it.n, 0)}`, g < 0 ? "zhu" : "gold", 3);
  ui.cave.changed();
  ui.cave.emit("cave:alchemy", { grade: g, recipe: sess.recipe.id, items: r.items });
}

// ---- 重铸词条：选装备 → 选词条 → 花灵石重掷 → 盖印揭示 → 保留原词条 / 接受新词条（花费不退） ----
function affixText(a) {
  if (F.isSpecialAffix(a)) return { k: weaponAffixText(a) ? "◆ 奇效" : "◆ 心法", v: weaponAffixText(a) || a.value };
  const pct = a.type === "pct" || ["crit", "cdr"].includes(a.stat) || (Math.abs(a.value) < 1 && a.value !== 0);
  const v = pct ? (a.value * 100).toFixed(1).replace(/\.0$/, "") + "%" : Math.round(a.value * 10) / 10;
  if (String(a.stat).startsWith("imbue_")) return { k: "附灵", v: { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" }[a.stat.slice(6)] };
  return { k: STAT_NAME[a.stat] || a.stat, v: (a.value >= 0 ? "+" : "") + v };
}
function reforgeView(ui, box, left) {
  const p = ui.p, S = ui.sel, RF = ui.reforge;
  const list = F.reforgeables(p);
  if (RF && !list.find((g) => g.uid === RF.uid)) ui.reforge = null;
  if (!S.rf || !list.find((g) => g.uid === S.rf)) S.rf = (list[0] || {}).uid;
  left.appendChild(slips(list.slice(0, 7).map((g) => ({ id: g.uid, name: nameOf(g.id).slice(0, 5), note: (Object.values(p.equip).includes(g) ? "身上" : "") + (g.reforged ? ` 重铸×${g.reforged}` : QN[g.rarity || 0]) })), S.rf, (id) => !ui.reforge && ((S.rf = id), (S.rfIdx = null), ui.render())));
  const cur = list.find((g) => g.uid === S.rf);
  const st = el("div", "abs stove");
  const d0 = (cur && defOf(cur)) || {};
  st.innerHTML = `<div class="big" style="${cur ? `color:${rcolor(cur)}` : ""}"><div class="ring"></div>${cur ? d0.glyph || "器" : "鼎"}</div>`;
  if (ui.reforge && cur && ui.reforge.uid === cur.uid) {
    const R0 = ui.reforge, o = affixText(R0.old), n = affixText(R0.neo);
    const rv = el("div", "rf-reveal");
    rv.innerHTML = `<div class="old"><span class="k">${o.k}</span><span class="v">${o.v}</span></div>
      <div class="neo" style="color:${rcolor(cur)}"><span class="k">${n.k}</span><span class="v">${n.v}</span></div>
      <span class="ink-seal two fx-stamp ${QSEAL[cur.rarity || 0] || ""} stamp" style="--s:70px;font-size:24px">重铸</span>`;
    const acts = el("div", "acts");
    acts.appendChild(btn("保留原词条", () => ((ui.reforge = null), ui.toast("原词条未动；灵石已耗去"), ui.cave.changed()), { id: "rf-keep" }));
    acts.appendChild(
      btn("接受新词条", () => {
        F.reforgeApply(cur, R0.idx, R0.neo);
        ui.reforge = null;
        ui.toast(`${itemName(cur)}：${n.k} ${n.v}`, "gold");
        ui.cave.changed({ stats: !0 });
      }, { primary: !0, id: "rf-accept" }),
    );
    rv.appendChild(acts);
    st.appendChild(rv);
  }
  box.appendChild(st);
  const d = paper("abs detail alt");
  if (!cur) {
    d.insertAdjacentHTML("beforeend", `<div class="name">重铸</div><p class="desc">没有带词条的装备。灵品以上的装备才有词条可重铸。</p>`);
    box.appendChild(d);
    return ui.go(box, "重铸", null, { disabled: !0, id: "reforge" });
  }
  d.insertAdjacentHTML("beforeend", `<div class="name" style="color:${rcolor(cur)}">${itemName(cur)}</div><div class="grade">${QN[cur.rarity || 0]} · 已重铸 ${cur.reforged || 0} 次</div>
    <p class="desc">选一条词条重掷：属性与数值都重来，不会掷出已有的属性。心法类词条只换成另一条心法；附灵词条不能重铸。掷出后可保留原词条，花费不退。</p>`);
  const ul = el("div", "ink-list rf-list");
  (cur.affixes || []).forEach((a, i) => {
    if (a.base) return;
    const t = affixText(a);
    const can = F.affixReforgeable(a);
    const row = el("div", "ink-row" + (S.rfIdx === i ? " on" : "") + (can ? "" : " off"), `<span class="k">${t.k}</span><span class="v">${t.v}${can ? "" : ' <span class="ink-note">（附灵走附灵）</span>'}</span>`);
    row.dataset.aff = i;
    row.style.cursor = can ? "pointer" : "default";
    if (can) row.addEventListener("click", () => !ui.reforge && ((S.rfIdx = i), ui.render()));
    ul.appendChild(row);
  });
  d.appendChild(ul);
  const c = S.rfIdx != null ? F.canReforge(p, cur, S.rfIdx) : { ok: !1, why: "先点选一条词条" };
  const selA = S.rfIdx != null ? cur.affixes[S.rfIdx] : null;
  const cost = F.reforgeCost(cur, selA);
  d.insertAdjacentHTML("beforeend", `<div class="ink-row" style="margin-top:6px"><span class="k">花费</span><span class="v"><span class="ink-seal round gold cv-st">石</span>${cost.stones}${cost.items.map((x) => ` · ${x.name}×${x.n}`).join("")}</span></div>
    <div class="ink-note">每重铸一次价格 ×${F.RULES.reforge.growth}（最多 ×${F.RULES.reforge.maxMul}）${selA && F.isSpecialAffix(selA) ? `；心法类只换心法，价格 ×${(F.RULES.reforge.special || {}).costMul || 1}` : ""}</div>
    ${!c.ok ? `<div class="ink-note" style="margin-top:6px">${c.why}</div>` : ""}`);
  box.appendChild(d);
  ui.go(
    box,
    "重铸",
    () => {
      const r = F.reforgeRoll(p, cur, S.rfIdx);
      if (!r.ok) return ui.toast(r.why, "zhu");
      ui.reforge = { uid: cur.uid, idx: S.rfIdx, old: r.old, neo: r.neo, t: performance.now() };
      ui.cave.fxPuff("forge");
      ui.cave.changed();
    },
    { disabled: !c.ok || !!ui.reforge, id: "reforge" },
  );
}
const FORGE_CATS = [["gear", "装备"], ["item", "符箓"], ["upgrade", "扩容"], ["imbue", "附灵"], ["reforge", "重铸"], ["bind", "认主"]];
function forge(ui, box) {
  const p = ui.p, S = ui.sel;
  if (F.facLevel(p, "forge") < 1) return brokenView(ui, box, "forge", "鼎", "炼器鼎碎了", "鼎身裂成几块散在地上。区域一的灵光点里，偶尔能找到炼器鼎残件。");
  const { forge: all } = F.recipes();
  const cats = FORGE_CATS.filter(([k]) => k === "bind" || k === "reforge" || all.some((r) => (r.kind || "gear") === k));
  S.cat = S.cat && cats.find((c) => c[0] === S.cat) ? S.cat : cats[0][0];
  const left = el("div", "abs ws-left vt");
  const vt = el("div", "ink-vtabs");
  for (const [k, n] of cats) {
    const t = el("span", "ink-vtab" + (S.cat === k ? " on" : ""), n);
    t.dataset.cat = k;
    t.addEventListener("click", () => !ui.reforge && ((S.cat = k), (S.rec = null), ui.render()));
    vt.appendChild(t);
  }
  left.appendChild(vt);
  box.appendChild(left);
  if (S.cat === "bind") return bindView(ui, box, left);
  if (S.cat === "reforge") return reforgeView(ui, box, left);
  const list = all.filter((r) => (r.kind || "gear") === S.cat);
  if (!S.rec || !list.find((r) => r.id === S.rec)) S.rec = (list.find((r) => F.forgeCanCraft(p, r).ok) || list[0]).id;
  const r = list.find((x) => x.id === S.rec);
  left.appendChild(
    slips(
      list.slice(0, 7).map((rr) => {
        const c = F.forgeCanCraft(p, rr);
        const nm = (rr.kind || "gear") === "gear" ? nameOf(itemId(F.gearOut(p, rr))) : rr.name.replace(/（.*）/, "");
        return { id: rr.id, name: nm.slice(0, 6), note: c.ok ? "可炼" : c.why.slice(0, 6), dim: !c.ok && c.why !== "材料不足" };
      }),
      S.rec,
      (id) => ((S.rec = id), ui.render()),
    ),
  );
  // 中：鼎 + 成品大字
  const outName = (r.kind || "gear") === "gear" ? nameOf(itemId(F.gearOut(p, r))) : r.out ? nameOf(itemId(r.out)) : r.name;
  const od = ITEMS[itemId(outName)] || {};
  const glyph = r.kind === "upgrade" ? (r.target === "bag" ? "袋" : r.target === "pouch" ? "囊" : "丹") : r.kind === "imbue" ? { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" }[r.element] : od.glyph || outName[0];
  const st = el("div", "abs stove");
  st.innerHTML = `<div class="big"><div class="ring"></div>${glyph}</div>`;
  if (ui.lastForge && performance.now() - ui.lastForge.t < 4000) st.insertAdjacentHTML("beforeend", `<div class="res"><span class="ink-seal two fx-stamp ${QSEAL[ui.lastForge.rarity] || ""}" style="--s:86px;font-size:30px">${ui.lastForge.label}</span></div>`);
  box.appendChild(st);
  // 右：详情
  const c = F.forgeCanCraft(p, r);
  const d = paper("abs detail alt");
  const kindLine = { gear: "装备 · 炼成即已鉴定 · 主材品质定上限", item: `符箓 · 一炉 ${r.n || 1} 张`, upgrade: "扩容", imbue: "给法剑附一缕五行灵性（只留一条）" }[r.kind || "gear"];
  const tgt = r.kind === "imbue" ? F.imbueTarget(p) : null;
  d.insertAdjacentHTML(
    "beforeend",
    `<div class="name">${r.kind === "gear" || !r.kind ? outName : r.name.replace(/（.*）/, "")}</div>
    <div class="grade c-bao">${kindLine}</div>
    <p class="desc">${r.kind === "upgrade" ? (r.target === "bag" ? `储物袋 ${p.bagCapacity || 16} 格 → ${r.value} 格` : r.target === "pouch" ? `贴身锦囊 ${p.pouch.capacity} 格 → ${r.value} 格` : `丹药栏每栏可放 ${F.caveState(p).pillCap} → ${F.caveState(p).pillCap + r.value} 枚`) : r.kind === "imbue" ? (tgt ? `目标：${itemName(tgt)}` : "身上与仓库都没有法剑。") : od.desc || ""}</p>
    <div class="ink-list">${F.inputsOf(p, r).map((x) => `<div class="ink-row"><span class="k">${x.name}</span><span class="v">${x.have} / ${x.need} <span class="${x.have >= x.need ? "c-ling" : "cv-bad"}">${x.have >= x.need ? "足" : "缺"}</span></span></div>`).join("")}</div>
    ${!c.ok ? `<div class="ink-note" style="margin-top:8px">${c.why}</div>` : ""}`,
  );
  d.appendChild(upgradeRow(ui, "forge", "炼器鼎"));
  box.appendChild(d);
  ui.go(box, "炼制", () => doForge(ui, r), { disabled: !c.ok, id: "craft-" + r.id });
}
function doForge(ui, r) {
  const p = ui.p;
  const res = F.forgeCraft(p, r);
  if (!res.ok) return ui.toast(res.why, "zhu");
  ui.cave.fxPuff("forge");
  let label = "炼成", rar = 0;
  if (res.upgrade) ui.toast(res.upgrade === "bag" ? `储物袋扩至 ${res.value} 格` : res.upgrade === "pouch" ? `贴身锦囊扩至 ${res.value} 格` : `丹药栏每栏可放 ${res.value} 枚`, "gold", 3);
  else if (res.imbue) ui.toast(`${itemName(res.item)} 附灵成功`, "gold"), (label = "附灵");
  else if (res.item) {
    rar = res.item.rarity || 0;
    label = QN[rar].slice(0, 2);
    ui.toast(`炼成 ${QN[rar]}${nameOf(res.item.id)}${res.item.n > 1 ? " ×" + res.item.n : ""}`, "gold", 3);
    if (rar >= 3) surge(ui.root, rar), ui.cave.fxSurge("forge");
  }
  ui.lastForge = { label, rarity: rar, t: performance.now() };
  ui.cave.changed();
  ui.cave.emit("cave:forge", { recipe: r.id, ...res });
}
function bindView(ui, box, left) {
  const p = ui.p, S = ui.sel;
  const gear = [...Object.values(p.equip).filter(Boolean), ...p.storage.items].filter((it) => (defOf(it) || {}).cat === "gear" && it.identified !== !1);
  if (!S.bind || !gear.find((g) => g.uid === S.bind)) S.bind = (gear.find((g) => g.bound) || gear[0] || {}).uid;
  left.appendChild(slips(gear.slice(0, 7).map((g) => ({ id: g.uid, name: nameOf(g.id).slice(0, 5), note: g.bound ? "已认主" : QN[g.rarity || 0] })), S.bind, (id) => ((S.bind = id), ui.render())));
  const cur = gear.find((g) => g.uid === S.bind);
  const st = el("div", "abs stove");
  st.innerHTML = `<div class="big"><div class="ring" style="background:var(--zhu)"></div>${cur ? (defOf(cur).glyph || "器") : "血"}</div>`;
  box.appendChild(st);
  const cb = F.canBind(p);
  const d = paper("abs detail alt");
  d.insertAdjacentHTML("beforeend", `<div class="name">滴血认主</div><div class="grade cv-bad">永久护住一件装备 · 只能一件</div>
    <p class="desc">以精血祭炼，此器从此与你性命相连：身陨不遗落。代价：灵石 ${F.RULES.bind.stones}，下一局气血上限 −${Math.round(F.RULES.bind.debuff * 100)}%。改认他物，原先那件便解除。</p>
    ${cur ? `<div class="ink-list"><div class="ink-row"><span class="k">选中</span><span class="v" style="color:${rcolor(cur)}">${itemName(cur)}${cur.bound ? "（已认主）" : ""}</span></div></div>` : '<div class="ink-note">没有可认主的装备。</div>'}
    ${cb.ok ? "" : `<div class="ink-note" style="margin-top:8px">${cb.why}</div>`}`);
  box.appendChild(d);
  ui.go(
    box,
    "认主",
    async () => {
      if (!(await ui.confirm("滴血认主", `以精血祭炼「${itemName(cur)}」？下一局气血上限 −${Math.round(F.RULES.bind.debuff * 100)}%。`, { ok: "认主", seal: !0 }))) return;
      const r = F.bindGear(p, cur.uid);
      if (!r.ok) return ui.toast(r.why, "zhu");
      ui.toast("认主已成", "gold");
      ui.cave.changed();
    },
    { disabled: !cb.ok || !cur || cur.bound, id: "bind" },
  );
}

function garden(ui, box) {
  // CaveUI 完成按需加载并持有稳定实例；后续刷新不重建整个设施页。
  ui.gardenView.render();
  pageGuide(ui, box, "gardenIntro");
}

// 估价 / 灵石 / 炼化 / 化灵 的引导：第一次打开仓库或灵泉时由玄机子在页面上讲一次（经济复核 v1 §5）
const VALUE_TIP = "估价（灵值）：这件东西值多少。身陨时损失多少、委托“满载而归”都按它算。它不是钱，不能花。";
const KEY_TIP = "关键物品，不可化灵";
// 妖丹 / 灵物去化灵前提醒一次：直接炼化更划算
async function confirmHuaLing(ui, items) {
  const p = ui.p;
  const ref = items.filter((it) => F.refineValue(p, it) > 0);
  if (!ref.length) return !0;
  const direct = ref.reduce((s, it) => s + F.refineValue(p, it), 0);
  const st = ref.reduce((s, it) => s + F.huaLingStones(it), 0);
  return ui.confirm("化灵", `${ref.length > 1 ? `其中 ${ref.length} 件是妖丹、灵物：` : ""}直接炼化可得 <b>${direct}</b> 修为，化灵只换 <b>${st}</b> 灵石（≈ ${F.stonesToXp(p, st)} 修为）。确定化灵？`, { ok: "化灵" });
}
function econGuide(ui, box) {
  pageGuide(ui, box, "economy");
}
// 设施页里的玄机子浮签：每个 key 只出现一次（记在 flags.caveTips）
function pageGuide(ui, box, key) {
  const p = ui.p;
  const seen = (p.flags.caveTips = p.flags.caveTips || {});
  if (seen[key] || ui !== ui.cave.ui || !XJZ_TIPS[key]) return; // 预热时用的替身 ui 不触发
  seen[key] = !0;
  ui.cave.save();
  const g = el("div", "abs cv-guide ink-say");
  g.dataset.guide = key;
  g.innerHTML = `<div class="who">玄机子<span class="ink-seal" style="--s:26px">玄</span></div>`;
  const tip = paper("", `<div class="line">${XJZ_TIPS[key].join("<br>")}</div>`);
  tip.className = "ink-tip";
  tip.insertAdjacentHTML("afterbegin", '<i class="ink-sheet" aria-hidden="true"></i>');
  const a = el("div", "cv-acts");
  a.appendChild(btn("知道了", () => g.remove(), { id: "guide-ok" }));
  tip.appendChild(a);
  g.appendChild(tip);
  box.appendChild(g);
}

// 归置：按 类别 → 品级（高在前）→ 估价（高在前）重排一次；平时不自动重排（不抖动）
const CAT_ORDER = ["gear", "artifact", "scroll", "recipe", "pill", "talisman", "core", "treasure", "herb", "ore", "beast", "stone", "quest"];
function sortStorage(ui) {
  const p = ui.p;
  const ci = (it) => { const k = CAT_ORDER.indexOf((defOf(it) || {}).cat); return k < 0 ? 99 : k; };
  p.storage.items.sort((a, b) => ci(a) - ci(b) || (b.rarity || 0) - (a.rarity || 0) || valueOf(b) - valueOf(a));
  ui.cave.save();
  ui.render();
  const g = ui.page && ui.page.querySelector(".bg-grid");
  if (g) (g.classList.remove("tidy"), void g.offsetWidth, g.classList.add("tidy"));
}

// ======================= 仓库（博古架） =======================
const CATS = {
  all: ["全部", () => !0],
  gear: ["装备", (d) => ["gear", "artifact"].includes(d.cat)],
  mat: ["材料", (d) => ["stone", "herb", "ore", "beast", "core", "treasure", "quest"].includes(d.cat)],
  pill: ["丹符", (d) => ["pill", "talisman"].includes(d.cat)],
  scroll: ["功法", (d) => ["scroll", "recipe"].includes(d.cat)],
};
function storage(ui, box) {
  const p = ui.p, S = ui.sel;
  econGuide(ui, box);
  const tab = ui.tab || "all";
  // 匾额：行书"仓库" + 仓中估价 + 灵石；右侧分类页签
  const pl = el("div", "abs bg-plaque");
  pl.innerHTML = `<div class="board">仓库</div><div class="worth"><div class="lbl">仓中估价</div><div class="n">${NUM(p.storage.value)}</div></div>
    <div class="ink-label">灵石 <b class="ink-num">${NUM(p.storage.count(F.STONE()))}</b> · ${p.storage.items.length} 件</div>`;
  const tabs = el("div", "ink-tabs");
  for (const [k, [n]] of Object.entries(CATS)) {
    const t = el("span", "ink-tab" + (tab === k ? " on" : ""), n);
    t.dataset.tab = k;
    t.addEventListener("click", () => ((ui.tab = k), ui.render()));
    tabs.appendChild(t);
  }
  pl.appendChild(tabs);
  box.appendChild(pl);
  // 身上：四个装备位 + 半身立绘（拖物品到这里 = 装备）
  const eq = el("div", "abs equip");
  eq.innerHTML = `<div class="bust" style="background-image:url('${ART.bust}')"></div><div class="ink-h">身上</div>`;
  const slots = el("div", "slots");
  for (const [k, n] of Object.entries(F.SLOT_NAME)) {
    const it = p.equip[k];
    const open = F.slotUnlocked(p, k);
    const s0 = slot(it, { cls: (open ? "" : "is-locked") + (S.cur === "eq:" + k ? " is-sel" : ""), glyph: open ? n[1] : "锁", cap: open ? n : n + " · 未解", onClick: () => ((S.cur = "eq:" + k), ui.render()) });
    s0.dataset.slot = k;
    s0.addEventListener("dragover", (e) => open && e.preventDefault());
    s0.addEventListener("drop", (e) => {
      e.preventDefault();
      const r = F.equip(p, e.dataTransfer.getData("text/uid"));
      if (!r.ok) return ui.toast(r.why, "zhu");
      S.cur = "eq:" + r.slot;
      ui.toast(`装备 ${itemName(p.equip[r.slot])}`);
      ui.cave.changed({ stats: !0 });
    });
    slots.appendChild(s0);
  }
  eq.appendChild(slots);
  box.appendChild(eq);
  box.appendChild(el("div", "abs keys", `<span><b>点选</b>查看</span><span><b>拖拽</b>调序 / 装备</span><span><b>R</b>归置</span><span><b>Esc</b>回洞府</span>`));
  // 多宝阁：每件物品一个龛，龛的大小 = 占格（packBag 摆放）；不自动重排，R / "归置"才排
  const pred = CATS[tab][1];
  // 灵石是货币：总数在匾额里，不上架陈列
  const items = p.storage.items.filter((it) => it.id !== F.STONE() && pred(defOf(it) || {}));
  S.picks = S.picks || new Set();
  // 没选中时默认选第一件，详情卡不空着
  if (!S.cur && items.length) S.cur = items[0].uid;
  const COLS = 8, CELL = 52, GAP = 10;
  const pack = packBag(items, COLS, Math.max(4, Math.ceil(items.reduce((n, it) => n + sizeOf(it), 0) / COLS)));
  const nRows = Math.max(4, pack.placed.reduce((m, q) => Math.max(m, q.r + (sizeOf(q.it) >= 4 ? 2 : 1)), 0));
  const W = COLS * CELL + (COLS - 1) * GAP, Hh = nRows * CELL + (nRows - 1) * GAP;
  const shelf = el("div", "abs bg-shelf");
  const sc = el("div", "bg-scroll");
  const g = el("div", "bg-grid");
  g.style.cssText = `width:${W}px;height:${Hh}px`;
  let back = "", boards = "";
  for (const q of pack.placed) {
    const w = sizeOf(q.it) >= 2 ? 2 : 1, h = sizeOf(q.it) >= 4 ? 2 : 1;
    const x = q.c * (CELL + GAP), y = q.r * (CELL + GAP), pw = w * CELL + (w - 1) * GAP, ph = h * CELL + (h - 1) * GAP;
    back += `<i class="niche${S.cur === q.it.uid || S.picks.has(q.it.uid) ? " sel" : ""}" style="left:${x - 3}px;top:${y - 3}px;width:${pw + 6}px;height:${ph + 6}px"></i>`;
    if (q.c + w < COLS) boards += `<i class="bd v" style="left:${x + pw + GAP / 2 - 4}px;top:${y - GAP / 2 - 1}px;height:${ph + GAP + 2}px"></i>`;
    // 龛底隔板：每件一段（不横穿大件）；每 4 行的那一层用粗笔
    if (q.r + h < nRows) boards += `<i class="bd h${(q.r + h) % 4 === 0 ? " frame" : ""}" style="left:${x - GAP / 2 - 1}px;top:${y + ph + GAP / 2 - 5}px;width:${pw + GAP + 2}px"></i>`;
  }
  boards += `<i class="bd h frame" style="left:-16px;top:-15px;width:${W + 32}px"></i><i class="bd h frame" style="left:-12px;top:${Hh + 4}px;width:${W + 24}px"></i>`;
  boards += `<i class="bd v frame" style="left:-15px;top:-12px;height:${Hh + 24}px"></i><i class="bd v frame" style="left:${W + 2}px;top:-12px;height:${Hh + 24}px"></i>`;
  g.insertAdjacentHTML("afterbegin", back + boards);
  // 性能：点选 / 批量点选只改这件的选中态（物品签 + 龛）和右侧详情 / 底栏，不整页重建（110 件的博古架整页重建 60–90ms）
  const niches = g.querySelectorAll(".niche"), toks = new Map();
  const markSel = (uid) => {
    const k = pack.placed.findIndex((q) => q.it.uid === uid);
    if (k < 0) return;
    const on = S.cur === uid || S.picks.has(uid);
    niches[k].classList.toggle("sel", on);
    if (toks.get(uid)) setTagState(toks.get(uid), { sel: on });
  };
  for (const q of pack.placed) {
    const it = q.it;
    const t = itemTag(it, { size: CELL, gap: GAP, sel: S.cur === it.uid || S.picks.has(it.uid), disabled: !!S.multi && !F.canHuaLing(it) });
    t.style.left = q.c * (CELL + GAP) + "px";
    t.style.top = q.r * (CELL + GAP) + "px";
    t.classList.add("bg-tok");
    t.draggable = !0;
    t.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/uid", it.uid));
    t.addEventListener("dragover", (e) => (e.preventDefault(), t.classList.add("drop-before")));
    t.addEventListener("dragleave", () => t.classList.remove("drop-before"));
    t.addEventListener("drop", (e) => {
      e.preventDefault();
      const uid = e.dataTransfer.getData("text/uid");
      if (uid && uid !== it.uid && F.moveBefore(p, uid, it.uid)) (ui.cave.save(), ui.render());
    });
    t.addEventListener("click", () => {
      if (S.multi) {
        if (!F.canHuaLing(it)) return ui.toast(F.isKeyItem(it) ? KEY_TIP + "，已跳过" : "灵石不必化灵", "zhu");
        S.picks.has(it.uid) ? S.picks.delete(it.uid) : S.picks.add(it.uid);
        markSel(it.uid);
        return mountCap();
      }
      const prev = S.cur;
      if (prev && prev.startsWith("eq:")) {
        // 原先选的是"身上"的装备位：选中框在立绘那边，整页刷新
        S.cur = it.uid;
        const st = sc.scrollTop;
        ui.render();
        const s2 = ui.page.querySelector(".bg-scroll");
        if (s2) s2.scrollTop = st;
        return;
      }
      S.cur = it.uid;
      markSel(prev);
      markSel(it.uid);
      mountDetail();
    });
    toks.set(it.uid, t);
    g.appendChild(t);
    // 刚鉴定的那件：剪影 → 彩图墨晕开
    if (ui.lastIdent && ui.lastIdent.uid === it.uid && performance.now() - ui.lastIdent.t < 600) tagReveal(t);
  }
  if (!items.length) g.appendChild(el("div", "ink-note bg-empty", "空空如也"));
  sc.appendChild(g);
  shelf.appendChild(sc);
  // 底部：归置 + 批量化灵（批量点选时只重建这一条）
  const buildCap = () => {
    const cap = el("div", "bg-cap");
    cap.innerHTML = `<span>${S.multi ? `已选 ${S.picks.size} 件 → 得 <span class="ink-seal round gold cv-st">石</span> <b class="cv-gold hl-n">${F.huaLingValue(p, [...S.picks])}</b> 灵石 <span class="ink-note">≈ 修为 ${F.stonesToXp(p, F.huaLingValue(p, [...S.picks]))}</span>` : `储物袋 ${p.bagCapacity || 16} 格 · 贴身锦囊 ${p.pouch.capacity} 格`}</span>`;
    const mb = el("span", "");
    if (!S.multi) mb.appendChild(btn("归置", () => sortStorage(ui), { key: "R", id: "tidy" }));
    if (S.multi) mb.appendChild(btn("化灵", async () => {
      if (!(await confirmHuaLing(ui, [...S.picks].map((u) => p.storage.items.find((x) => x.uid === u)).filter(Boolean)))) return;
      const got = F.huaLing(p, [...S.picks]);
      S.picks.clear();
      S.multi = !1;
      ui.toast(`化灵得灵石 ${got}`, "gold");
      ui.cave.changed();
    }, { primary: !0, disabled: !S.picks.size, id: "hualing" }));
    mb.appendChild(btn(S.multi ? "取消" : "批量化灵", () => ((S.multi = !S.multi), (S.picks = new Set()), ui.render()), { id: "multi" }));
    cap.appendChild(mb);
    return cap;
  };
  let capEl = buildCap();
  const mountCap = () => {
    const n = buildCap();
    capEl.replaceWith(n);
    capEl = n;
  };
  shelf.appendChild(capEl);
  box.appendChild(shelf);
  // R：归置
  if (!ui._tidyKey) {
    ui._tidyKey = (e) => e.code === "KeyR" && ui.cur === "storage" && !e.repeat && !document.querySelector(".cv-modal") && sortStorage(ui);
    addEventListener("keydown", ui._tidyKey);
  }
  // 右：浮签详情（点选物品时只重建这一块：showDetail 画进片段，替换上一次的详情与右下按钮）
  let detNodes = [];
  const mountDetail = () => {
    const f = document.createDocumentFragment();
    showDetail(f);
    const nodes = [...f.childNodes];
    if (detNodes.length && detNodes[0].isConnected) detNodes[0].before(f);
    else box.appendChild(f);
    for (const n of detNodes) n.remove();
    detNodes = nodes;
  };
  const showDetail = (host) => {
    const det = paper("abs st-detail");
    let cur = null, eqSlot = null;
    if (S.cur && S.cur.startsWith("eq:")) (eqSlot = S.cur.slice(3)), (cur = p.equip[eqSlot]);
    else cur = p.storage.items.find((x) => x.uid === S.cur);
    if (!cur) {
      det.appendChild(el("div", "empty", eqSlot ? (F.slotUnlocked(p, eqSlot) ? `${F.SLOT_NAME[eqSlot]}栏空着。<br>点选仓库里的装备穿上。` : `${F.slotLockText(eqSlot)}。`) : "点选一件物品，<br>看它的来历与用处。"));
      host.appendChild(det);
      ui.go(host, null);
      return;
    }
    const d = defOf(cur) || {};
    const rr = cur.rarity || 0;
    const top = el("div", "top");
    top.appendChild(itemTag(cur, { size: 74, box: "1x1", count: !1, cs: !1 })); // 名字旁已有品级印，图标不再叠角印
    top.insertAdjacentHTML("beforeend", `<div><div class="name">${itemName(cur)}${rr ? `<span class="ink-seal ${QSEAL[rr]}" style="--s:26px;font-size:13px">${QN[rr][0]}</span>` : ""}</div>
      <div class="grade" style="color:${rcolor(cur)}">${QN[rr]} · ${CAT_NAME[d.cat] || "杂物"} · 占 ${sizeOf(cur)} 格${cur.bound ? " · <span class='cv-bad'>已认主</span>" : ""}</div></div>`);
    det.appendChild(top);
    if (ui.lastIdent && ui.lastIdent.uid === cur.uid && performance.now() - ui.lastIdent.t < 3000) det.insertAdjacentHTML("beforeend", `<span class="stamp ink-seal two fx-stamp ${QSEAL[rr] || ""}" style="--s:58px;font-size:20px">鉴定</span>`);
    det.insertAdjacentHTML("beforeend", `<p class="desc">${cur.identified === !1 ? "宝光内敛，看不真切。鉴定后方知底细。" : d.desc || ""}</p>`);
    const ph = cur.identified !== !1 && pageHint(p, cur.id);
    if (ph) det.insertAdjacentHTML("beforeend", `<p class="desc page-hint" style="color:${ph.ready ? "var(--mk-gold, #b8862b)" : "inherit"}">${ph.text}</p>`);
    const rows = el("div", "ink-list");
    rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">估价 <span class="cv-q" data-tip="${VALUE_TIP}">？</span></span><span class="v gold">${NUM(valueOf(cur))}</span></div>`);
    if (cur.n > 1) rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">数量</span><span class="v">${cur.n}</span></div>`);
    if (["gear", "artifact"].includes(d.cat) && cur.identified !== !1) {
      const g = F.gearLines(cur);
      rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">等级</span><span class="v">${cur.level || 1}</span></div>` + g.base.map((a) => affixRow(a, !0)).join("") + g.affixes.map((a) => affixRow(a)).join(""));
    }
    const uses = F.usesOf(cur);
    if (uses.length) rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">用途</span><span class="v cv-uses">${uses.slice(0, 5).join(" · ")}${uses.length > 5 ? " …" : ""}</span></div>`);
    if (F.SOURCE_NOTE[d.name]) rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">来源</span><span class="v cv-uses">${F.SOURCE_NOTE[d.name]}</span></div>`);
    if (d.use && d.use.xp != null) rows.insertAdjacentHTML("beforeend", `<div class="ink-row"><span class="k">用处</span><span class="v">灵泉服用 · 修为</span></div>`);
    det.appendChild(rows);
    const acts = el("div", "acts");
    const prim = [];
    if (eqSlot) prim.push(btn("卸下", () => (F.unequip(p, eqSlot), ui.cave.changed({ stats: !0 })), { primary: !0, id: "unequip" }));
    else {
      const hs = F.huaLingStones(cur);
      if (F.canHuaLing(cur))
        acts.appendChild(
          btn(`化灵 · 得<span class="ink-seal round gold cv-st">石</span>${hs}`, async () => {
            if (F.refineValue(p, cur) > 0) {
              if (!(await confirmHuaLing(ui, [cur]))) return;
            } else if (rr >= 2 && !(await ui.confirm("化灵", `把「${itemName(cur)}」化为灵石 ${hs}（≈ 修为 ${F.stonesToXp(p, hs)}）？`, { ok: "化灵" }))) return;
            const v = F.huaLing(p, [cur.uid]);
            S.cur = null;
            ui.toast(`化灵得灵石 ${v}`, "gold");
            ui.cave.changed();
          }, { id: "hualing1" }),
        );
      if (cur.identified === !1)
        prim.push(
          btn("鉴定", () => {
            F.identify(p, cur.uid);
            ui.lastIdent = { uid: cur.uid, t: performance.now() };
            if (rr >= 3) surge(ui.root, rr);
            ui.toast(`鉴定：${QN[rr]}${nameOf(cur.id)}`, "gold");
            ui.cave.changed();
          }, { primary: !0, id: "identify" }),
        );
      else if (["gear", "artifact"].includes(d.cat))
        prim.push(
          btn("装备", () => {
            const r = F.equip(p, cur.uid);
            if (!r.ok) return ui.toast(r.why, "zhu");
            S.cur = "eq:" + r.slot;
            ui.toast(`装备 ${itemName(cur)}`);
            ui.cave.changed({ stats: !0 });
          }, { primary: !0, id: "equip" }),
        );
      const sl = F.studyList(p).find((e) => e.uids.includes(cur.uid));
      if (sl)
        prim.push(
          btn(sl.kind === "recipe" ? "研读" : sl.learned && sl.dupWux ? "化悟性" : "参悟", () => {
            // 功法体系 v2：已学会的残页 / 完本化为悟性；残页不全、灵石不够的原因由 F.studyWhy 给（悟性可补页、参悟付灵石）
            if (sl.learned && sl.dupWux) {
              const r = F.study(p, sl.key);
              if (r) ui.toast(`化为悟性 +${r.wux}`, "gold", 3);
              S.cur = null;
              return ui.cave.changed();
            }
            if (sl.learned) return ui.toast("早已会了");
            const why = F.studyWhy ? F.studyWhy(p, sl.key) : sl.ready ? "" : `残卷不全：${sl.have}/${sl.pages}`;
            if (why) return ui.toast(why, "zhu");
            F.study(p, sl.key);
            ui.cave.fxMeditate(1.5);
            if (sl.kind === "recipe") ui.toast(`学会配方：${sl.name}`, "gold", 3);
            else {
              // 新功法先自动放进空栏（只放一次），提示条上给"去装配"
              syncNewLearned(p);
              const tab = { spell: "spell", xinfa: "xinfa", formation: "formation" }[sl.kind] || "spell";
              ui.toast(`参悟有成：${sl.name}`, "gold", 6, skillIconEl(sl.teaches), { label: "去装配", id: "go-loadout", onClick: () => ui.cave.openLoadout({ from: "study", tab }) });
            }
            S.cur = null;
            ui.cave.changed();
            ui.cave.emit("cave:learn", { kind: sl.kind, id: sl.teaches, name: sl.name });
          }, { primary: !0, disabled: !!sl.learned && !sl.dupWux, id: "study" }),
        );
      if (F.QUEST_USE[d.name])
        prim.push(
          btn("使用", () => {
            const r = F.useQuestItem(p, cur.uid);
            if (!r || !r.ok) return ui.toast((r && r.why) || "用不了", "zhu");
            ui.toast(`贴身锦囊扩至 ${r.pouch} 格`, "gold");
            S.cur = null;
            ui.cave.changed();
          }, { primary: !0, id: "use" }),
        );
    }
    if (!eqSlot && F.isKeyItem(cur)) acts.appendChild(btn("化灵", null, { disabled: !0, title: KEY_TIP, id: "hualing-key" }));
    for (const b of prim) acts.appendChild(b);
    det.appendChild(acts);
    if (!eqSlot && F.isKeyItem(cur)) det.appendChild(el("div", "cv-hl-note ink-note", KEY_TIP));
    if (!eqSlot && F.canHuaLing(cur)) {
      const hs = F.huaLingStones(cur), cmp = F.refineCompare(p, cur);
      const n = el("div", "cv-hl-note ink-note", `化灵得灵石 ${hs} ≈ 修为 ${F.stonesToXp(p, hs)}（灵泉${JIE[F.facLevel(p, "spring")]}）${cmp.direct > 0 ? `；直接炼化 +${cmp.direct} 修为${cmp.best === "refine" ? "，<span class='ink-zhu'>宜炼化</span>" : ""}` : ""}`);
      Object.assign(n.dataset, { stones: hs, xp: F.stonesToXp(p, hs) });
      det.appendChild(n);
    }
    host.appendChild(det);
    ui.go(host, null);
  };
  mountDetail();
}

// ======================= 出行台 =======================
function depart(ui, box) {
  const p = ui.p;
  box.appendChild(el("div", "abs dp-fig", "")).style.backgroundImage = `url('${ART.portrait}')`;
  const card = paper("abs dp-card alt");
  const pills = p.storage.items.filter((it) => (defOf(it) || {}).cat === "pill" && !(defOf(it).use && defOf(it).use.xp != null)).reduce((n, it) => n + it.n, 0);
  card.innerHTML += `<div class="ink-title">出行台</div><div class="ink-rule short" style="margin:6px 0 10px"></div>
    <div class="ink-list">
    <div class="ink-row"><span class="k">境界</span><span class="v">${realmName(p)}</span></div>
    <div class="ink-row"><span class="k">储物袋</span><span class="v">${p.bagCapacity || 16} 格</span></div>
    <div class="ink-row"><span class="k">贴身锦囊</span><span class="v">${p.pouch.capacity} 格</span></div>
    <div class="ink-row"><span class="k">仓中丹药</span><span class="v">${pills} 枚</span></div>
    <div class="ink-row"><span class="k">出行</span><span class="v">${(p.stats && p.stats.runs) || 0} 次 · 撤离 ${(p.stats && p.stats.extracted) || 0}</span></div></div>`;
  const rel = el("div", "reloc");
  const region = F.caveState(p).region;
  const c = F.canRelocate(p);
  rel.innerHTML = `<div class="ink-h">搬迁<span class="ink-note" style="margin-left:10px">${region === "r1" ? "竹海 · 溪谷灵脉" : "已在溪谷灵脉"}</span></div>
    <p class="pg-note" style="font-size:13px">${region === "r1" ? "整座洞府——连同灵泉与玄机子——收进储物袋，搬去溪谷：灵泉自升三阶、药园多两块地、炼器鼎可升二阶。" : "溪谷灵脉，竹声满院。"}</p>`;
  if (region === "r1") {
    const a = el("div", "cv-up");
    if (!c.ok) a.appendChild(el("span", "ink-note", c.why));
    a.appendChild(btn("打包搬迁", () => ui.cave.relocate(), { disabled: !c.ok, id: "relocate" }));
    rel.appendChild(a);
  }
  card.appendChild(rel);
  box.appendChild(card);
  ui.go(box, "出行", () => ui.cave.depart(), { id: "depart" });
}

export const PANELS = {
  spring: { render: spring },
  workshop: { render: workshop, tabs: [["alchemy", "炼丹"], ["forge", "炼器"]] },
  garden: { render: garden },
  storage: { render: storage, tabs: Object.entries(CATS).map(([k, v]) => [k, v[0]]) },
  depart: { render: depart },
};
void STATIONS;
