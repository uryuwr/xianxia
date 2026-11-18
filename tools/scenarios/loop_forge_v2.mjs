// 丹器房 v2（方向二"鼎为中心"）回归：node tools/run.mjs loop_forge_v2
// 覆盖：炼器切换分类、选配方、选主材品质（品质分布随之变）、炼制（盖印 + 结果签）、Space 盖印、何处可得、
//      重铸（选装备 → 选词条 → 揭示新旧 → 接受 / 保留）、鼎铭升阶弹层（条件不满足 → 满足后升阶）、认主解锁、
//      炼丹（批次 / 灵草取用 / 火候进行中 / 出丹）、药园顶栏统一。截图：work/shots/loop_forge_v2_*.png
const results = [];
function check(name, ok, info = "") {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? "  " + info : ""}`);
}
const VITE_CLIENT_STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); s.setAttribute("data-vite-dev-id", id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

export default async function (page, c) {
  await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: VITE_CLIENT_STUB }));
  const base = page.url().replace(/\/(\?.*)?$/, "");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector(".cv-loading"), null, { timeout: 60000 }).catch(() => {}); // 进场遮罩（场景分帧构建）退掉再截图
  await c.wait(800);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = async (sel) => {
    await page.click(sel);
    await c.wait(180);
  };
  // 准备：修好丹炉与炼器鼎；铁精石凡 / 灵 / 宝混放；身上一把带词条的宝品剑（重铸用）
  await ev(() => {
    const cv = window.__cave, p = cv.p, g = window.__cdev.give, F = cv.F;
    F.caveState(p).facilities.furnace = 1;
    F.caveState(p).facilities.forge = 1;
    for (const it of p.storage.items.filter((x) => x.id === "tiejing_shi")) p.storage.remove(it.uid);
    g(p, "铁精石", 2, { rarity: 0 }); g(p, "铁精石", 3, { rarity: 1 }); g(p, "铁精石", 1, { rarity: 2 });
    g(p, "灵石", 600); g(p, "灵玉", 4); g(p, "石傀心", 2);
    g(p, "青灵草", 3, { rarity: 2 });
    g(p, "青锋剑", 1, { rarity: 2, identified: !0, level: 4, affixes: [{ stat: "spell", type: "pct", value: 0.11 }, { stat: "fire", type: "flat", value: 21 }, { stat: "imbue_fire", type: "flat", value: 1 }] });
    F.equip(p, p.storage.items.find((x) => x.id === "sword_qingfeng" && x.identified !== !1 && (x.affixes || []).length >= 3).uid);
    cv.changed({ silent: !0 });
  });

  // 新器物插画（方鼎 / 八卦炉）已装好并在打开前预解码
  const pre = await ev(async () => {
    const mod = await import("/src/ui/cave/workshop_v2.js"), V = mod.VESSELS;
    const ok = (u) => { const i = new Image(); i.src = u; return i.complete && i.naturalWidth > 0; };
    return { ding: V.ding.meta && V.ding.meta.id, furnace: V.furnace.meta && V.furnace.meta.id, dDec: ok(V.ding.url), fDec: ok(V.furnace.url) };
  });
  check("器物插画：方鼎 + 八卦炉已装、打开前已解码", pre.ding === "ding_square" && pre.furnace === "furnace_bagua" && pre.dDec && pre.fDec, JSON.stringify(pre));
  // ---------- 炼器 · 装备 ----------
  await ev(() => window.__cave.open("workshop", "forge"));
  await page.waitForSelector(".cv-page[data-id=workshop] .ws2-ves");
  await c.wait(700);
  const v0 = await ev(() => {
    const pg = document.querySelector(".cv-page[data-id=workshop]");
    return {
      hdr: !!pg.querySelector(".ws2-hdr .ink-tab.on[data-tab=forge]"),
      cats: pg.querySelectorAll(".ws2-cats .ink-vtab").length,
      rows: pg.querySelectorAll(".ws2-list .ws2-row").length,
      art: !!pg.querySelector(".ws2-ves .art"),
      mats: pg.querySelectorAll(".ws2-ves .ws2-m").length,
      picks: pg.querySelectorAll(".ws2-qpick > div").length,
      qbar: pg.querySelectorAll(".ws2-qbar > div.on").length,
      icons: pg.querySelectorAll(".mk-tok .mk-ico").length,
      ming: !!pg.querySelector(".ws2-ming [data-act=up-forge]"),
      seal: !!pg.querySelector(".ws2-act [data-act=craft-sword]"),
      oldSlips: pg.querySelectorAll(".ink-slip").length,
      q: window.__cave.ui.sel.q && window.__cave.ui.sel.q.sword,
    };
  });
  check("炼器页：顶栏 / 6 分类 / 目录 / 写意鼎 / 材料围鼎 / 主材品质 4 档 / 鼎铭 / 朱印", v0.hdr && v0.cats === 6 && v0.rows >= 4 && v0.art && v0.mats >= 3 && v0.picks === 4 && v0.qbar >= 1 && v0.ming && v0.seal && !v0.oldSlips && v0.icons > 10, JSON.stringify(v0));
  check("主材默认取最好的一档（宝品，取用 宝×1 + 灵×2）", v0.q === 2, String(v0.q));
  await c.shot("forge_gear");
  // 选灵品主材 → 品质分布：灵 75% / 宝 25%
  await click(".ws2-qpick > div[data-q='1']");
  const qd = await ev(() => ({ q: window.__cave.ui.sel.q.sword, on: [...document.querySelectorAll(".ws2-qbar > div.on small")].map((e) => e.textContent), name: document.querySelector(".ws2-card .nm").textContent }));
  check("选灵品主材 → 品质分布 灵 75% / 宝 25%", qd.q === 1 && qd.on.join(",") === "75%,25%", JSON.stringify(qd));
  // 炼制：灵品主材 → 只用掉灵品铁精石，宝品那块还在；成品灵 / 宝
  const before = await ev(() => { const p = window.__cave.p; return { n: p.storage.items.filter((i) => i.id === "sword_qingfeng").length, bao: p.storage.items.filter((i) => i.id === "tiejing_shi" && i.rarity === 2).reduce((s, i) => s + i.n, 0) }; });
  await click("[data-act=craft-sword]");
  await c.wait(500);
  const after = await ev(() => {
    const p = window.__cave.p, L = window.__cave.ui.lastForge;
    return { n: p.storage.items.filter((i) => i.id === "sword_qingfeng").length, bao: p.storage.items.filter((i) => i.id === "tiejing_shi" && i.rarity === 2).reduce((s, i) => s + i.n, 0), r: L && L.item && L.item.rarity, id: L && L.item && L.item.identified, slip: !!document.querySelector(".ws2-result"), seal: !!document.querySelector(".ws2-fx .seal") };
  });
  check("炼制：按选定主材取用（宝品主材未动）、成品灵 / 宝品、已鉴定、盖印 + 结果签", after.n === before.n + 1 && after.bao === before.bao && [1, 2].includes(after.r) && after.id !== !1 && after.slip && after.seal, JSON.stringify({ before, after }));
  await c.wait(600);
  await c.shot("forge_crafted");
  await click("[data-act=forge-ok]");
  // Space 盖印：材料还够一把 → 再炼一把
  const n1 = await ev(() => window.__cave.p.storage.items.filter((i) => i.id === "sword_qingfeng").length);
  const canAgain = await ev(() => !document.querySelector("[data-act=craft-sword]").classList.contains("is-disabled"));
  if (canAgain) {
    await page.keyboard.press("Space");
    await c.wait(400);
    check("Space 盖印 = 点朱印", (await ev(() => window.__cave.p.storage.items.filter((i) => i.id === "sword_qingfeng").length)) === n1 + 1);
  } else check("Space 盖印 = 点朱印（材料已不够，跳过）", !0);
  // 何处可得：选一个缺料的配方，点鼎边朱圈材料
  await ev(() => document.querySelector(".ws2-list .ws2-row .st.no")?.closest(".ws2-row").click());
  await c.wait(250);
  await ev(() => document.querySelector(".ws2-ves .ws2-m.lack")?.click());
  await c.wait(250);
  const pop = await ev(() => { const e = document.querySelector(".ws2-pop"); return e ? { n: e.querySelectorAll(".s").length, t: e.textContent.slice(0, 80) } : null; });
  check("缺料 → 何处可得小纸条（读掉落表）", pop && pop.n >= 1, JSON.stringify(pop));
  await c.shot("forge_source");
  await page.mouse.click(640, 700);
  await c.wait(150);
  // 分类切换：扩容
  await click(".cv-page .ink-vtab[data-cat=upgrade]");
  await ev(() => document.querySelector(".cv-page [data-rec=bag24]")?.click());
  await c.wait(200);
  check("切到扩容 → 储物袋 16 → 24 前后对比", await ev(() => window.__cave.ui.sel.cat === "upgrade" && !!document.querySelector(".ws2-card .ws2-bigto") && document.querySelectorAll(".ws2-cells i.n").length === 8));
  // 附灵
  await click(".cv-page .ink-vtab[data-cat=imbue]");
  check("切到附灵 → 显示目标法剑与五行替换", await ev(() => !!document.querySelector(".ws2-card .ws2-imb .el")));

  // "今日可办"跳转：open(设施, 标签, { sel, flash }) → 选中配方并让朱印闪两下
  await ev(() => { const cv = window.__cave; cv.ui.close(); cv.open("forge", "forge", { sel: { cat: "upgrade", rec: "bag24" }, flash: "craft-bag24" }); });
  await c.wait(300);
  check("open(forge, { sel, flash }) → 选中扩容 · 储物袋并闪朱印", await ev(() => window.__cave.ui.sel.cat === "upgrade" && !!document.querySelector(".ws2-row.on[data-rec=bag24]") && !!document.querySelector("[data-act=craft-bag24].cv-flash")));
  await ev(() => { const cv = window.__cave; cv.ui.close(); cv.open("furnace", null, { sel: { rec: "huiqi" }, flash: "brew" }); });
  await c.wait(300);
  check("open(furnace, { sel, flash }) → 炼丹页选中回气丹并闪开炉印", await ev(() => window.__cave.ui.tab === "alchemy" && !!document.querySelector(".ws2-row.on[data-rec=huiqi]") && !!document.querySelector("[data-act=brew].cv-flash")));
  // 材料位可扩到 6 味：六味示意器方 → 6 个材料签 + 灵石，彼此不重叠、不压成品卡
  const six = await ev(async () => {
    const cv = window.__cave, F = cv.F;
    if (!F.recipes().forge.find((r) => r.id === "demo6")) F.recipes().forge.push({ id: "demo6", name: "示意 · 六味", kind: "gear", out: "青锋剑", inputs: { 铁精石: 1, 狼妖牙: 1, 狼皮: 1, 灵玉: 1, 青灵草: 1, 灵土: 1 }, stones: 10, forge: 1, known: !0 });
    cv.ui.close();
    cv.open("forge", "forge", { sel: { cat: "gear", rec: "demo6" } });
    await new Promise((r) => setTimeout(r, 300));
    const bs = [...document.querySelectorAll(".ws2-ves .ws2-m")].map((e) => e.getBoundingClientRect());
    const card = document.querySelector(".ws2-card").getBoundingClientRect();
    let hit = 0;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].left < bs[j].right && bs[j].left < bs[i].right && bs[i].top < bs[j].bottom && bs[j].top < bs[i].bottom) hit++;
    F.recipes().forge.splice(F.recipes().forge.findIndex((r) => r.id === "demo6"), 1);
    return { n: bs.length, hit, card: bs.some((b) => b.right > card.left) };
  });
  check("材料位扩到 6 味（+ 灵石）不重叠、不压成品卡", six.n === 7 && !six.hit && !six.card, JSON.stringify(six));
  // ---------- 重铸：cave.open("forge", "reforge") 直接打开子类 ----------
  // 重铸另付的材料按规则现查（REFORGE.items 会被数值组调整），各给足两次的量
  await ev(() => { const cv = window.__cave, sw = cv.p.equip.sword; for (const x of cv.F.reforgeCost(sw, sw.affixes[0]).items) window.__cdev.give(cv.p, x.name, x.n * 3); cv.ui.close(); cv.open("forge", "reforge"); });
  await page.waitForSelector(".cv-page .rf-list .ink-row");
  await c.wait(300);
  const rf0 = await ev(() => {
    const cv = window.__cave, S = cv.ui.sel, sw = cv.p.equip.sword;
    return { cat: S.cat, rf: S.rf === sw.uid, tabOn: !!document.querySelector(".ws2-hdr .ink-tab.on[data-tab=forge]"), aff: JSON.stringify(sw.affixes), reforged: sw.reforged || 0, locked: !!document.querySelector(".rf-list .ink-row.off") };
  });
  check("open(forge, reforge) → 直接到重铸子类，身上法剑选中，附灵词条锁定", rf0.cat === "reforge" && rf0.rf && rf0.tabOn && rf0.locked, JSON.stringify(rf0));
  await click(".cv-page .rf-list .ink-row[data-aff='0']");
  const why = await ev(() => { const cv = window.__cave, sw = cv.p.equip.sword; return document.querySelector("[data-act=reforge]").classList.contains("is-disabled") ? JSON.stringify({ why: cv.F.canReforge(cv.p, sw, 0).why, cost: cv.F.reforgeCost(sw, sw.affixes[0]), idx: cv.ui.sel.rfIdx, ore: cv.p.storage.count("tiejing_shi"), yu: cv.p.storage.count("ling_yu"), st: cv.p.storage.count("spirit_stone") }) : ""; });
  if (why) console.log("reforge disabled", why);
  await click("[data-act=reforge]");
  await page.waitForSelector(".rf-reveal [data-act=rf-accept]", { timeout: 5000 });
  await c.wait(1400);
  await c.shot("forge_reforge_reveal");
  const rf1 = await ev(() => { const cv = window.__cave, R = cv.ui.reforge, sw = cv.p.equip.sword; return { neo: R && R.neo, reforged: sw.reforged, same: JSON.stringify(sw.affixes) }; });
  check("重铸揭示：新旧对照、次数 +1、词条暂不替换", rf1.neo && rf1.reforged === rf0.reforged + 1 && rf1.same === rf0.aff, JSON.stringify(rf1.neo));
  check("揭示未定时不能切分类", await ev(() => { document.querySelector(".cv-page .ink-vtab[data-cat=gear]").click(); return window.__cave.ui.sel.cat === "reforge"; }));
  await click("[data-act=rf-accept]");
  check("接受新词条 → 替换", await ev((neo) => JSON.stringify(window.__cave.p.equip.sword.affixes[0]) === JSON.stringify(neo), rf1.neo));

  // ---------- 鼎铭升阶弹层 ----------
  await c.wait(2600); // 等提示条淡去，截图干净
  await click("[data-act=up-forge]");
  await page.waitForSelector(".ws2-modal");
  await c.wait(300);
  const m0 = await ev(() => ({ cond: document.querySelector(".ws2-modal .cond")?.className, dis: document.querySelector("[data-act=up-forge-go]").classList.contains("is-disabled"), news: document.querySelectorAll(".ws2-modal .col.nx p.new").length }));
  check("升阶弹层：今 / 升对照、未搬迁 → 条件不满足、印灰", m0.cond && m0.cond.includes("no") && m0.dis && m0.news >= 2, JSON.stringify(m0));
  await c.shot("forge_upgrade_modal");
  await page.keyboard.press("Escape");
  await c.wait(200);
  check("Esc 只合上弹层，不关页面", await ev(() => !document.querySelector(".ws2-modal") && window.__cave.ui.cur === "workshop"));
  await ev(() => { const cv = window.__cave, p = cv.p, g = window.__cdev.give; cv.F.caveState(p).region = "r2"; g(p, "蝠翼", 6); g(p, "水灵玉", 1); cv.changed(); });
  await click("[data-act=up-forge]");
  await click("[data-act=up-forge-go]");
  await c.wait(1300);
  check("搬迁 + 材料齐 → 升至二阶，认主解锁", await ev(() => window.__cave.p.cave.facilities.forge === 2 && !document.querySelector(".ws2-cats .ink-vtab[data-cat=bind].locked")));
  await click(".cv-page .ink-vtab[data-cat=bind]");
  check("认主：二阶后朱印可点", await ev(() => !document.querySelector("[data-act=bind]").classList.contains("is-disabled")));

  // ---------- 炼丹：同一版式，火候在炉下 ----------
  await click(".cv-page .ink-tab[data-tab=alchemy]");
  await c.wait(300);
  const a0 = await ev(() => ({ art: !!document.querySelector(".ws2-ves.furnace .art"), fire: !!document.querySelector(".ws2-ves .ws2-fire"), batch: document.querySelectorAll("[data-act^=batch]").length, prefer: document.querySelectorAll("[data-act^=prefer]").length, ming: !!document.querySelector(".ws2-ming [data-act=up-furnace]"), water: !!document.querySelector(".ws2-m[data-mat=lingquan_shui]") }));
  check("炼丹页：写意丹炉、炉下火候、一炉几份、灵草取用、炉铭、灵泉水药引", a0.art && a0.fire && a0.batch >= 1 && a0.prefer === 2 && a0.ming && a0.water, JSON.stringify(a0));
  // 丹方材料按配方现查补足（配方会被数值组调整）
  await ev(() => { const cv = window.__cave, r = cv.F.recipes().alchemy.find((x) => x.id === "huichun"); for (const x of cv.F.inputsOf(cv.p, r, 3)) if (x.have < x.need) window.__cdev.give(cv.p, x.name, x.need - x.have); cv.changed({ silent: !0 }); });
  await ev(() => { window.__cave.debug.alchemyTime = 5; window.__cave.debug.alchemyAuto = !0; document.querySelector(".cv-page [data-rec=huichun]")?.click(); });
  await c.wait(200);
  await click("[data-act=prefer-high]");
  const bandHi = await ev(() => document.querySelector(".ws2-opts .ink-note")?.textContent);
  check("灵草先用好的 → 火候带宽 × herbBand", /×1\.2/.test(bandHi || ""), bandHi);
  const hb = await ev(() => window.__cave.p.storage.count("huichun_dan"));
  await click("[data-act=brew]");
  await c.wait(1600);
  const f1 = await ev(() => ({ fire: !!window.__cave.ui.fire, idle: document.querySelector(".ws2-fire").classList.contains("idle"), lit: document.querySelector(".ws2-ves").classList.contains("lit"), seal: document.querySelector("[data-act=brew]").textContent }));
  const al = await ev(() => {
    const v = document.querySelector(".ws2-ves"), g = v._geo, gl = v.querySelector(".glow").getBoundingClientRect(), sm = v.querySelector(".smoke").getBoundingClientRect(), vb = v.getBoundingClientRect(), k = vb.width / 520;
    const c = [(gl.left + gl.width / 2 - vb.left) / k, (gl.top + gl.height / 2 - vb.top) / k], s = [(sm.left + sm.width / 2 - vb.left) / k, (sm.bottom - vb.top) / k];
    return { door: g.fire && [Math.round(g.fire[0]), Math.round(g.fire[1])], glow: c.map(Math.round), knob: g.smoke.map(Math.round), smoke: s.map(Math.round), op: +getComputedStyle(v.querySelector(".glow")).opacity };
  });
  check("炉门火光对准炉门、丹烟从炉钮升起、火光随火候亮", al.door && Math.hypot(al.glow[0] - al.door[0], al.glow[1] - al.door[1]) < 3 && Math.abs(al.smoke[0] - al.knob[0]) < 3 && Math.abs(al.smoke[1] - al.knob[1]) < 4 && al.op > 0.35, JSON.stringify(al));
  check("火候进行中：炉火、指针、守炉", f1.fire && !f1.idle && f1.lit && f1.seal.includes("守炉"), JSON.stringify(f1));
  await c.shot("alchemy_fire");
  await page.waitForFunction(() => !window.__cave.ui.fire, null, { timeout: 15000 });
  await c.wait(400);
  const brew = await ev(() => ({ L: window.__cave.ui.lastBrew, n: window.__cave.p.storage.count("huichun_dan"), seal: !!document.querySelector(".ws2-fx .seal") }));
  check("出丹 → 盖丹品印", brew.L && brew.L.grade >= 0 && brew.n > hb && brew.seal, JSON.stringify({ g: brew.L && brew.L.grade, n: brew.n }));
  await c.shot("alchemy_done");
  await ev(() => { window.__cave.debug.alchemyAuto = !1; window.__cave.debug.alchemyTime = null; });

  // ---------- 炼丹规则一致性（用户报："80% 多提示炉火失控却又练成，一直循环到材料用完才能退出"）----------
  // 记录每一炉的结果事件；材料按配方现查补足
  await ev(() => {
    const cv = window.__cave;
    window.__brews = [];
    if (!cv._emitWrapped) {
      const em = cv.emit.bind(cv);
      cv.emit = (n, d) => (n === "cave:alchemy" && window.__brews.push(d), em(n, d));
      cv._emitWrapped = !0;
    }
  });
  const refill = (n) => ev((n) => { const cv = window.__cave, r = cv.F.recipes().alchemy.find((x) => x.id === "huichun"); for (const x of cv.F.inputsOf(cv.p, r, n)) if (x.have < x.need) window.__cdev.give(cv.p, x.name, x.need - x.have, { rarity: 0 }); cv.ui.sel.prefer = "low"; cv.changed(); }, n);
  const mats = () => ev(() => { const cv = window.__cave, r = cv.F.recipes().alchemy.find((x) => x.id === "huichun"); return Object.fromEntries(cv.F.inputsOf(cv.p, r, 1).map((x) => [x.id, x.have])); });
  const pills = () => ev(() => window.__cave.p.storage.count("huichun_dan"));
  const lastToast = () => ev(() => { const t = [...document.querySelectorAll(".cv-toasts .ink-toast")].pop(); return t ? t.textContent : ""; });
  const waitIdle = () => page.waitForFunction(() => !window.__cave.ui.fire, null, { timeout: 20000 });
  const recipeN = await ev(() => window.__cave.F.recipes().alchemy.find((x) => x.id === "huichun").n || 1);
  // 1) 火候落在区间内：结果 = 出丹，提示里的"入火候"就是评品用的那个比例
  await refill(3);
  await ev(() => { const d = window.__cave.debug; d.alchemyTime = 3; d.alchemyAuto = !0; d.alchemyTemp = null; window.__brews.length = 0; });
  await click("[data-act=batch1]");
  let p0 = await pills(), m0x = await mats();
  await click("[data-act=brew]");
  await waitIdle();
  await c.wait(150);
  let L = await ev(() => { const L = window.__cave.ui.lastBrew; return { grade: L.grade, ratio: L.ratio, want: window.__cave.F.gradeOf(L.ratio) }; });
  let tt = await lastToast();
  check("火候在区间内 → 出丹；丹品 = gradeOf(入火候)；提示写同一个百分比", L.grade >= 0 && L.grade === L.want && tt.includes("出丹") && tt.includes(`入火候 ${Math.round(L.ratio * 100)}%`) && (await pills()) === p0 + recipeN, JSON.stringify({ L, tt }));
  check("一炉只扣一份材料", Object.entries(await mats()).every(([id, n]) => m0x[id] - n === (id === "spirit_stone" ? 0 : 1) || m0x[id] - n === 2), JSON.stringify({ m0x, now: await mats() }));
  // 2) 火候落在区间外：失控 = 失败，材料已耗、不出丹、不计成丹次数，提示写比例与门槛
  await ev(() => { const d = window.__cave.debug; d.alchemyAuto = !1; d.alchemyTemp = 0.02; window.__brews.length = 0; });
  p0 = await pills();
  const brews0 = await ev(() => window.__cave.F.caveState(window.__cave.p).brews.huichun || 0);
  m0x = await mats();
  await click("[data-act=brew]");
  await waitIdle();
  await c.wait(150);
  L = await ev(() => window.__cave.ui.lastBrew);
  tt = await lastToast();
  const used = Object.fromEntries(Object.entries(await mats()).map(([id, n]) => [id, m0x[id] - n]));
  check("火候在区间外 → 炉火失控：不出丹、不计成丹次数、材料照扣", L.grade === -1 && (await pills()) === p0 && (await ev(() => window.__cave.F.caveState(window.__cave.p).brews.huichun || 0)) === brews0 && Object.values(used).some((n) => n > 0), JSON.stringify({ g: L.grade, used }));
  check("失控提示与规则一致（入火候 X%，不足 40%，药材已耗）", /炉火失控（入火候 \d+%，不足 40%）：药材已耗/.test(tt) && !tt.includes("出丹"), tt);
  check("失控后炉子停着（没有自动再开一炉）", (await ev(() => window.__brews.length)) === 1 && !(await ev(() => !!window.__cave.ui.fire)));
  await ev(() => (window.__cave.debug.alchemyTemp = null));
  // 3) 批量：一炉 2 份 → 只炼这一炉（材料 ×2、成丹 ×2、只有一次结果），之后不再开炉
  await refill(3);
  await ev(() => { const d = window.__cave.debug; d.alchemyTime = 2.5; d.alchemyAuto = !0; window.__brews.length = 0; });
  await click("[data-act=batch2]");
  p0 = await pills();
  m0x = await mats();
  await click("[data-act=brew]");
  await waitIdle();
  await c.wait(2000);
  const b2 = { brews: await ev(() => window.__brews.map((b) => b.grade)), dp: (await pills()) - p0, herb: m0x.qingling_cao - (await mats()).qingling_cao, fire: await ev(() => !!window.__cave.ui.fire) };
  check("一炉 2 份：只炼这一炉（青灵草 −4、成丹 2 份、一次结果、不再开炉）", b2.brews.length === 1 && b2.brews[0] >= 0 && b2.dp === recipeN * 2 && b2.herb === 4 && !b2.fire, JSON.stringify(b2));
  // 4) 开炉后一直点 Space（添火）：炉子结束后不会被 Space 接着再开一炉
  await refill(3);
  await ev(() => { const d = window.__cave.debug; d.alchemyAuto = !1; d.alchemyTime = 2.5; window.__brews.length = 0; });
  await click("[data-act=batch1]");
  m0x = await mats();
  await click("[data-act=brew]");
  for (let i = 0; i < 30; i++) (await page.keyboard.down("Space"), await c.wait(80), await page.keyboard.up("Space"), await c.wait(80));
  await c.wait(400);
  const sp = { brews: (await ev(() => window.__brews.length)), fire: await ev(() => !!window.__cave.ui.fire), herb: m0x.qingling_cao - (await mats()).qingling_cao };
  check("开炉中连点 Space：只炼 1 炉，材料不被自动连续消耗", sp.brews === 1 && !sp.fire && sp.herb === 2, JSON.stringify(sp));
  // 停手片刻后按 Space 仍可开炉（Space = 点朱印的约定保留）
  await c.wait(1400);
  await page.keyboard.press("Space");
  await c.wait(200);
  check("停手 1.2 秒后 Space 照常开炉", await ev(() => !!window.__cave.ui.fire));
  // 5) 开炉中按 Esc：弹"离炉"确认（火候暂停）→ Esc 继续守炉 → Esc + Enter 离炉，页面关闭，这炉作废、材料不退
  await ev(() => (window.__cave.debug.alchemyTime = 30));
  await page.keyboard.press("Escape");
  await c.wait(250);
  const e1 = await ev(() => { const m = document.querySelector(".cv-modal"); return { modal: !!m, txt: m ? m.textContent : "", t: window.__cave.ui.fire && window.__cave.ui.fire.g.t, paused: window.__cave.ui.fire && window.__cave.ui.fire.paused }; });
  await c.wait(500);
  const t2 = await ev(() => window.__cave.ui.fire && window.__cave.ui.fire.g.t);
  check("开炉中 Esc → 离炉确认（写明这一炉作废、材料不退），火候暂停", e1.modal && /这一炉作废/.test(e1.txt) && /不退/.test(e1.txt) && e1.paused && Math.abs(t2 - e1.t) < 1e-6, JSON.stringify({ ...e1, t2 }));
  await c.shot("alchemy_leave_confirm");
  await page.keyboard.press("Escape");
  await c.wait(250);
  check("确认框里 Esc = 继续守炉（火候继续走）", await ev(async () => { const f = window.__cave.ui.fire, t = f && f.g.t; await new Promise((r) => setTimeout(r, 300)); return !document.querySelector(".cv-modal") && !!f && window.__cave.ui.fire === f && f.g.t > t; }));
  p0 = await pills();
  m0x = await mats();
  await page.keyboard.press("Escape");
  await c.wait(200);
  await page.keyboard.press("Enter");
  await c.wait(300);
  const lv = { cur: await ev(() => window.__cave.ui.cur), fire: await ev(() => !!window.__cave.ui.fire), dp: (await pills()) - p0, mats: JSON.stringify(await mats()) === JSON.stringify(m0x), last: await ev(() => window.__brews[window.__brews.length - 1]), tt: await lastToast() };
  check("Esc → Enter 离炉：页面关闭、这炉作废（不出丹）、材料不退", !lv.cur && !lv.fire && lv.dp === 0 && lv.mats && lv.last && lv.last.abandoned && /作废/.test(lv.tt), JSON.stringify(lv));
  // 回洞府按钮同理：开炉中点 → 确认框 → 继续守炉
  await ev(() => window.__cave.open("workshop", "alchemy", { sel: { rec: "huichun" } }));
  await c.wait(300);
  await click("[data-act=brew]");
  await click("[data-act=close]");
  const cb = await ev(() => ({ modal: !!document.querySelector(".cv-modal"), cur: window.__cave.ui.cur }));
  await click(".cv-modal [data-act=cancel]");
  check("开炉中点回洞府 → 确认框；继续守炉则留在页内", cb.modal && cb.cur === "workshop" && (await ev(() => !!window.__cave.ui.fire && window.__cave.ui.cur === "workshop")), JSON.stringify(cb));
  await click("[data-act=close]");
  await click(".cv-modal [data-act=ok]");
  check("确认离炉 → 回洞府", await ev(() => !window.__cave.ui.cur && !window.__cave.ui.fire));
  await ev(() => { const d = window.__cave.debug; d.alchemyAuto = !1; d.alchemyTime = null; d.alchemyTemp = null; window.__cave.open("workshop", "alchemy"); });
  await c.wait(300);

  // ---------- 丹器房只保留炼丹、炼器；旧药园入口兼容到独立页 ----------
  check("丹器房不再包含药园 tab", await ev(() => document.querySelectorAll(".ws2-hdr .ink-tab").length === 2 && !document.querySelector('.ws2-hdr [data-tab="garden"]')));
  await ev(() => window.__cave.open("workshop", "garden"));
  await page.waitForSelector('.cv-page[data-id="garden"] .gy2-sheet .gy2-plot');
  const gd = await ev(() => {
    const cv = window.__cave, pg = cv.ui.page;
    return { id: cv.ui.cur, page: pg?.dataset.id, hdr: pg?.querySelector('.gy2-header h1')?.textContent,
      plots: pg?.querySelectorAll('.gy2-plot').length, expected: cv.F.gardenPlots(cv.p).length,
      close: [...document.querySelectorAll('[data-act="close"]')].filter(e => e.offsetParent).length };
  });
  check("旧药园入口重定向到独立药园，地块照旧、只有一个回洞府", gd.id === "garden" && gd.page === "garden" && gd.hdr === "药园" && gd.expected >= 1 && gd.plots === gd.expected && gd.close === 1, JSON.stringify(gd));
  await c.shot("garden");
  await click("[data-act=close]");
  check("回洞府", await ev(() => !window.__cave.ui.cur));
  check("无脚本错误", !errors.length, JSON.stringify(errors.slice(0, 3)));
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length ? `FAIL loop_forge_v2 ${bad.length} 项` : `PASS loop_forge_v2 ${results.length} 项`);
}
