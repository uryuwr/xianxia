// 功法指引 v2 草图 · 公用数据与逻辑（只给 docs/ui/v2/gongfa_v2/*.html 用，不是游戏代码）
// 普通脚本（不是 ES module），file:// 双击能开；依赖 icons.js（window.LD_ICONS，技能图集坐标）。
// 数据照抄：战斗设计「功法体系 v2」（12 门法术、获取、残页、悟性、护盾分布），五行色照抄 src/ui/loadout.js 的 EL。
// 假档：两个示意进度（练气六层 qi6 默认 / 练气三层 qi3），见 PROFILES。
//
// ── 接口（落地时对应的函数名见 docs/ui/v2/功法指引_v2_方案.md §6）────────────
//   GF.S                         当前状态 { r: "r1"|"r2", s: 法术 id|"", p: "qi6"|"qi3", app, open }，读写 URL hash（#s=r2-frost&p=qi6）
//   GF.P()                       当前假档
//   GF.state(id)                 → { k: "learned"|"ready"|"pages"|"book"|"grant", have, need, fill, slot }
//   GF.sources(id)               → [{ r, place, kind, how, odds, ico }]（来源表；r 为 null = 不分去处）
//   GF.gapOf(r)                  → [{ shield, who, need, by:[已带], learned:[已学未带], cands:[{ id, st, here }] }]
//   GF.pickups(r)                → 本去处可收（未领悟、来源在此处）的法术 id，按「可参悟 > 有残页 > 名门功法 > 其余」排
//   GF.readyList()               → 残页已集齐、可参悟的法术 id
//   GF.short(id, r)              → 列表副标题用的来源短句
//   GF.pagesLine(id)             → 统一句式「残页 x/N · 集齐后到洞府仓库参悟」
//   GF.tok(id, o) / GF.dots(id, o) / GF.srcRows(id, r, o) / GF.oddsTag(odds) / GF.mapIco(key)   HTML 片段
//   GF.set(patch) / GF.on(fn)    改状态并重绘
(function () {
  // ---------------- 五行（src/ui/loadout.js EL） ----------------
  const EL = {
    metal: { n: "金", c: "#9a7d34", w: "rgba(168,134,47,.24)" },
    wood: { n: "木", c: "#3f9a6e", w: "rgba(63,154,110,.22)" },
    water: { n: "水", c: "#2f7fa8", w: "rgba(47,127,168,.22)" },
    fire: { n: "火", c: "#b8291a", w: "rgba(192,57,43,.2)" },
    earth: { n: "土", c: "#9a6a32", w: "rgba(154,106,50,.22)" },
  };
  const ORDER = ["metal", "wood", "earth", "water", "fire"]; // 相克顺：金克木 → 木克土 → 土克水 → 水克火 → 火克金
  const BEATS = { metal: "wood", wood: "earth", earth: "water", water: "fire", fire: "metal" };
  const COUNTER = Object.fromEntries(Object.entries(BEATS).map(([a, b]) => [b, a])); // 盾 → 破它要的五行

  // ---------------- 去处护盾（功法体系 v2 §护盾分布） ----------------
  const REGIONS = {
    r1: {
      id: "r1", name: "青岚山外", short: "青岚", jing: "一境", need: 1,
      share: { wood: 1 }, // 精英皆木盾
      boss: { name: "青牙", els: ["wood", "earth"] },
      roam: null,
      who: { wood: "精英皆是 · 青牙前段", earth: "青牙后段" },
    },
    r2: {
      id: "r2", name: "竹海·溪谷", short: "竹海", jing: "二境", need: 5,
      share: { earth: 0.6, fire: 0.4 }, // 南半区只有土盾
      boss: { name: "碧鳞", els: ["fire", "earth", "wood"] },
      roam: "午时巡游头目 · 五行随机",
      who: { earth: "精英约 6 成（南半全是）· 碧鳞次段", fire: "精英约 4 成 · 碧鳞首段", wood: "碧鳞末段" },
    },
  };
  const shieldEls = (r) => {
    const R = REGIONS[r];
    return [...new Set([...Object.keys(R.share), ...R.boss.els])];
  };

  // ---------------- 法术 12 门（五行 · 定位 · 获取） ----------------
  // kind: teach 传授 | pages 残页 | book 名门功法（一本即成）| grant 赠予
  // 来源 src：{ r, place, kind: enemy|elite|boss|box|glow|night|altar|ruin|spot, how, odds: 必得|常见|偶得|罕见 }
  // 概率档（界面只写字，不写百分比）：必得 = 固定 / 首探 / 首杀；常见 ≥ 30%；偶得 10–30%；罕见 < 10%
  const S2 = (r, place, kind, how, odds) => ({ r, place, kind, how, odds });
  const SPELLS = {
    sword_qi: { name: "剑气斩", el: "metal", role: "破防", ico: "sk:sword_qi", get: "teach", src: [S2(null, "玄机子", "teach", "传授 · 练气一层", "必得")] },
    thunder: { name: "掌心雷", el: "metal", role: "索敌·对空", ico: "sk:thunder", get: "pages", pages: 4,
      src: [S2("r1", "狼妖头目", "elite", "精英掉落", "偶得"), S2("r1", "普通宝箱", "box", "开箱", "罕见")] },
    ningfeng: { name: "凝锋诀", el: "metal", role: "蓄势", glyph: "锋", get: "pages", pages: 3,
      src: [S2("both", "灵光宝箱", "glow", "两处去处皆有", "偶得"), S2("both", "亭中供案", "altar", "两处去处皆有", "偶得")] },
    vine: { name: "缠藤诀", el: "wood", role: "群控", ico: "sk:vine", get: "book",
      src: [S2("r1", "山神庙地窖", "ruin", "名门功法 · 首探必得", "必得")] },
    vine_pull: { name: "藤引", el: "wood", role: "突进", glyph: "引", get: "pages", pages: 4,
      src: [S2("r2", "藤妖精英", "elite", "精英掉落", "常见"), S2("r2", "藤妖", "enemy", "妖兽掉落", "偶得")] },
    frost: { name: "寒冰锥", el: "water", role: "单体爆发", ico: "sk:frost", get: "book", gate: "需二段跳",
      src: [S2("r2", "剑修遗府", "ruin", "名门功法 · 瀑布后 · 需二段跳", "必得")] },
    still_water: { name: "止水诀", el: "water", role: "反击", glyph: "止", get: "pages", pages: 5,
      src: [S2("r2", "剑修遗府重探", "ruin", "再入遗府", "常见"), S2("r2", "碧鳞重战", "boss", "首领再战", "常见"), S2("r2", "夜明宝箱", "night", "入夜开箱", "偶得")] },
    fire_talisman: { name: "火符", el: "fire", role: "群伤", ico: "sk:fire_talisman", get: "pages", pages: 3,
      src: [S2("r2", "宝箱", "box", "开箱", "偶得"), S2("r2", "灵光点", "glow", "采灵光", "偶得"), S2("r2", "亭中供案", "altar", "搜供案", "偶得")] },
    fire_crow: { name: "火鸦", el: "fire", role: "召唤", glyph: "鸦", get: "pages", pages: 4,
      src: [S2("r2", "赤狼（异种）", "elite", "每只必掉 1 页", "必得"), S2("r2", "夜明 / 灵光宝箱", "night", "开箱", "偶得")] },
    earth_shield: { name: "土遁护体", el: "earth", role: "守御", ico: "sk:earth_shield", get: "grant",
      src: [S2(null, "突破赠予", "grant", "法术栏开而无功法可装时 · 或筑基时", "必得")] },
    rock: { name: "落石诀", el: "earth", role: "打断", ico: "sk:rock", get: "pages", pages: 3,
      src: [S2("r1", "石傀", "enemy", "妖兽掉落", "偶得"), S2("r1", "亭中供案", "altar", "搜供案", "偶得"), S2("r1", "普通宝箱", "box", "开箱", "罕见"), S2(null, "突破赠予", "grant", "练气七层开第三栏而无功法可装时", "必得")] },
    earth_walk: { name: "地行术", el: "earth", role: "位移", glyph: "行", get: "pages", pages: 4,
      src: [S2("r2", "灰鬃头目", "elite", "精英掉落", "常见"), S2("r2", "亭中供案", "altar", "搜供案", "偶得"), S2("r2", "普通宝箱", "box", "开箱", "罕见")] },
  };
  for (const [id, d] of Object.entries(SPELLS)) d.id = id;
  const ANY = "异种妖兽（赤狼 / 玄鳞蝠）常掉一本完本 · 首领首杀必掉一本完本（都从未学的里抽）";
  const KIND_ICO = { enemy: "map:mob", elite: "map:elite", boss: "map:boss", box: "map:chest", glow: "map:chest_glow", night: "map:chest_night", altar: "map:chest", ruin: "map:cave", spot: "map:glow" };

  // ---------------- 假档 ----------------
  const NUM = "零一二三四五六七八九";
  const PROFILES = {
    qi6: { id: "qi6", layer: 6, name: "练气六层", slots: 2, learned: ["sword_qi", "vine", "fire_talisman", "earth_shield"], build: ["sword_qi", "vine", null],
      pages: { thunder: 2, still_water: 1, rock: 3, fire_crow: 1 }, wux: 4, zhong: { sword_qi: 2 } },
    qi3: { id: "qi3", layer: 3, name: "练气三层", slots: 2, learned: ["sword_qi", "earth_shield"], build: ["sword_qi", "earth_shield", null],
      pages: { thunder: 1, rock: 2 }, wux: 1, zhong: {} },
  };

  // ---------------- 状态（hash） ----------------
  const S = { r: "r2", s: "frost", p: "qi6", app: "pu", open: "" };
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has("s")) {
      const [r, id] = h.get("s").split("-");
      if (REGIONS[r]) S.r = r;
      S.s = SPELLS[id] ? id : "";
    }
    for (const k of ["p", "app", "open"]) if (h.has(k)) S[k] = h.get(k);
    if (!PROFILES[S.p]) S.p = "qi6";
  }
  function writeHash() {
    const h = new URLSearchParams();
    h.set("s", S.r + "-" + (S.s || "none"));
    if (S.p !== "qi6") h.set("p", S.p);
    if (S.app !== "pu") h.set("app", S.app);
    if (S.open) h.set("open", S.open);
    try { history.replaceState(null, "", "#" + h.toString().replace(/%2C/g, ",")); } catch (e) {}
  }
  readHash();
  const subs = [];
  const on = (fn) => subs.push(fn);
  function set(patch) {
    let changed = !1;
    for (const k of Object.keys(patch)) if (S[k] !== patch[k]) ((S[k] = patch[k]), (changed = !0));
    if (!changed) return;
    writeHash();
    subs.forEach((f) => f(S));
    window.inkui && inkui.decorate();
  }
  addEventListener("hashchange", () => { readHash(); subs.forEach((f) => f(S)); window.inkui && inkui.decorate(); });
  const P = () => PROFILES[S.p];

  // ---------------- 规则 ----------------
  function state(id) {
    const d = SPELLS[id], p = P();
    if (p.learned.includes(id)) {
      const slot = p.build.slice(0, p.slots).indexOf(id);
      return { k: "learned", slot, zhong: (p.zhong && p.zhong[id]) || 1 };
    }
    if (d.get === "pages") {
      const have = p.pages[id] || 0, need = d.pages;
      const fill = have >= 1 ? Math.min(Math.floor(p.wux / 3), need - have) : 0; // 悟性每 3 点补 1 页，至少要有 1 页实物
      return { k: have >= need ? "ready" : "pages", have, need, fill };
    }
    return { k: d.get }; // book / grant
  }
  const sources = (id) => SPELLS[id].src;
  const inRegion = (src, r) => src.r === r || src.r === "both";
  const hereOf = (id, r) => sources(id).some((x) => inRegion(x, r));
  const carried = () => P().build.slice(0, P().slots).filter(Boolean);

  function gapOf(r) {
    const R = REGIONS[r], car = carried(), p = P();
    return shieldEls(r).map((sh) => {
      const need = COUNTER[sh];
      const by = car.filter((id) => SPELLS[id].el === need && id !== "earth_shield");
      const learned = p.learned.filter((id) => SPELLS[id].el === need && !car.includes(id) && id !== "earth_shield");
      const rank = (id) => { const st = state(id); return (st.k === "ready" ? 0 : hereOf(id, r) ? 1 : 2) * 10 + (st.k === "book" ? 0 : st.k === "pages" ? 1 + (st.need - st.have - st.fill) / 10 : 5); };
      const cands = Object.keys(SPELLS).filter((id) => SPELLS[id].el === need && !p.learned.includes(id)).sort((a, b) => rank(a) - rank(b)).map((id) => ({ id, st: state(id), here: hereOf(id, r) }));
      return { shield: sh, need, who: R.who[sh] || "", share: R.share[sh] || 0, by, learned, cands, ok: by.length > 0 };
    });
  }
  function pickups(r) {
    const p = P();
    const rank = (id) => { const st = state(id); return st.k === "ready" ? 0 : st.k === "pages" && st.have ? 1 : st.k === "book" ? 2 : 3; };
    return Object.keys(SPELLS).filter((id) => !p.learned.includes(id) && hereOf(id, r) && SPELLS[id].get !== "grant").sort((a, b) => rank(a) - rank(b));
  }
  const readyList = () => Object.keys(SPELLS).filter((id) => state(id).k === "ready");

  // ---------------- 文案 ----------------
  const regionName = (r) => (r === "both" ? "两处去处" : r ? REGIONS[r].name : "");
  function pagesLine(id) {
    const st = state(id);
    if (st.k === "ready") return `残页 ${st.have}/${st.need} · 已集齐 · 到洞府仓库参悟`;
    if (st.k === "pages") return `残页 ${st.have}/${st.need} · 集齐后到洞府仓库参悟`;
    return "";
  }
  function short(id, r) {
    const d = SPELLS[id], st = state(id);
    if (st.k === "learned") return `${EL[d.el].n} · ${d.role}${st.slot >= 0 ? " · " + "QER"[st.slot] + " 栏" : ""}`;
    if (st.k === "ready") return "已集齐 · 回洞府仓库参悟";
    if (st.k === "grant") return d.src[0].how.replace(" · 或筑基时", " · 筑基");
    const here = d.src.filter((x) => inRegion(x, r));
    const pick = (here.length ? here : d.src).filter((x) => x.r);
    const where = here.length ? "本去处 · " : regionName(pick[0].r) + " · ";
    if (st.k === "book") return where + pick[0].place + (d.gate ? " · " + d.gate : "");
    return where + pick.slice(0, 2).map((x) => x.place.replace("（异种）", "")).join("、");
  }

  // ---------------- HTML 片段 ----------------
  const pct = (a, b) => (b ? (a / b) * 100 : 0).toFixed(4) + "%";
  function iconStyle(key) {
    const I = window.LD_ICONS, rc = I && I.rects[key];
    if (!rc) return "";
    return `background-image:url('${I.url}');background-size:${pct(I.W, rc[2])} ${pct(I.H, rc[3])};background-position:${pct(rc[0], I.W - rc[2])} ${pct(rc[1], I.H - rc[3])}`;
  }
  // 地图小图集（src/ui/icons/items.json → map，64px 格，512×320）
  const MAP = { url: "../../../../src/ui/icons/items_map.webp", W: 512, H: 320, rects: { "map:mob": [448, 0], "map:elite": [0, 64], "map:boss": [64, 64], "map:cave": [384, 0], "map:chest": [0, 128], "map:chest_night": [64, 128], "map:chest_glow": [128, 128], "map:glow": [0, 192], "map:pin": [448, 192], "map:player": [0, 0], "map:gate": [64, 0], "map:den": [128, 192] } };
  function mapIco(key, size = 18) {
    const rc = MAP.rects[key];
    if (!rc) return "";
    return `<i class="gf-mi" style="--mi:${size}px;background-image:url('${MAP.url}');background-size:${(MAP.W / 64) * 100}% ${(MAP.H / 64) * 100}%;background-position:${pct(rc[0], MAP.W - 64)} ${pct(rc[1], MAP.H - 64)}"></i>`;
  }
  // 技能签：一笔圆相（五行色）+ 意象图标；未得 = 墨拓剪影（rub）；没有图标的用一个字兜底
  function tok(id, o = {}) {
    const d = SPELLS[id], e = EL[d.el], st = state(id);
    const rub = o.rub != null ? o.rub : st.k !== "learned";
    const cls = ["sk", o.cls || "", rub ? "is-rub" : "", ["e1", "e2", "e3"][(Object.keys(SPELLS).indexOf(id)) % 3]].join(" ");
    const inner = d.ico ? `<span class="ico" style="${iconStyle(d.ico)}"></span>` : `<b class="gl">${d.glyph}</b>`;
    return `<span class="${cls}" style="--s:${o.size || 44}px;--el:${e.c};--elw:${e.w}">${inner}</span>`;
  }
  // 残页进度点：墨点 = 已有，泥金虚点 = 悟性可补，空点 = 还差
  function dots(id, o = {}) {
    const st = state(id);
    if (st.k !== "pages" && st.k !== "ready") return "";
    let h = "";
    for (let i = 0; i < st.need; i++) h += `<i class="${i < st.have ? "on" : i < st.have + st.fill ? "wx" : ""}"></i>`;
    return `<span class="gf-pg ${o.big ? "big" : ""} ${st.k === "ready" ? "full" : ""}" title="${st.have}/${st.need}">${h}</span>`;
  }
  const ODDS = { 必得: "bi", 常见: "chang", 偶得: "ou", 罕见: "han" };
  const oddsTag = (o) => `<span class="gf-odds ${ODDS[o] || ""}">${o}</span>`;
  function srcRows(id, r, o = {}) {
    const d = SPELLS[id];
    const list = d.src.slice().sort((a, b) => (inRegion(b, r) ? 1 : 0) - (inRegion(a, r) ? 1 : 0));
    return `<div class="gf-src">${list.map((x) => {
      const here = inRegion(x, r);
      const tag = x.r ? (here ? `<span class="rg here">本去处</span>` : `<span class="rg">${regionName(x.r)}</span>`) : "";
      const ico = KIND_ICO[x.kind] ? mapIco(KIND_ICO[x.kind], o.ico || 18) : `<i class="gf-mi glyph">${x.kind === "teach" ? "授" : "赠"}</i>`;
      return `<div class="row ${here ? "here" : ""}">${ico}<span class="pl">${x.place}</span><span class="hw">${x.how}</span>${tag}${oddsTag(x.odds)}</div>`;
    }).join("")}</div>`;
  }
  const els = (el, s = 16) => `<span class="els" style="--c:${EL[el].c};width:${s}px;height:${s}px;font-size:${Math.round(s * 0.66)}px">${EL[el].n}</span>`;
  const shd = (el, extra = "") => `<span class="shd" style="--c:${EL[el].c}">${EL[el].n}盾${extra}</span>`;
  const elB = (el) => `<b style="color:${EL[el].c}">${EL[el].n}</b>`;
  // 状态一句（详情 / 悬停卡用）
  function stLine(id) {
    const st = state(id), d = SPELLS[id], p = P();
    if (st.k === "learned") return `已领悟 · ${NUM[st.zhong] || st.zhong}重${st.slot >= 0 ? " · 装在 " + "QER"[st.slot] + " 栏" : " · 未装"}`;
    if (st.k === "ready") return `<span class="gold">${pagesLine(id)}</span>`;
    if (st.k === "pages") return `${pagesLine(id)}${st.fill ? ` · <span class="gold">悟性可补 ${st.fill} 页</span>` : st.have ? "" : ` · <span class="dim">悟性要有 1 页实物才能补</span>`}`;
    if (st.k === "book") return `未得 · 名门功法 · 得一本即可参悟`;
    return `未得 · ${d.src[0].how}`;
  }
  // 「克 X 盾 · 本去处有没有」一行
  function shieldHere(id, r) {
    const d = SPELLS[id];
    if (id === "earth_shield") return `<div class="gf-sh dim">不造成伤害 · 不破盾</div>`;
    const t = BEATS[d.el], R = REGIONS[r], has = shieldEls(r).includes(t);
    return `<div class="gf-sh">克 ${shd(t)} <b>×2</b><span class="dim"> · 其他盾 ×0.2</span></div><div class="gf-rg ${has ? "ok" : ""}">${R.name}：${has ? R.who[t] + " 有" + EL[t].n + "盾 · 用得上" : "没有" + EL[t].n + "盾"}</div>`;
  }

  // 首屏就绪（截图用）
  function ready() { document.fonts.ready.then(() => setTimeout(() => (window.__ready = !0), 250)); }

  window.GF = { EL, ORDER, BEATS, COUNTER, REGIONS, SPELLS, PROFILES, ANY, NUM, S, P, set, on, state, sources, gapOf, pickups, readyList, shieldEls, hereOf, inRegion, regionName, pagesLine, short, tok, dots, oddsTag, srcRows, mapIco, iconStyle, els, shd, elB, stLine, shieldHere, carried, ready };
})();
