// 丹炉 / 炼器鼎按修为解锁（2026-11-17 用户："材料解锁太慢，前期缺乏杀怪动力"）：node tools/run.mjs loop_fac_unlock
// 覆盖：练一未解锁（页面 / 挂签 / 开炉理由写"练气二层解锁"，层数从数据读）→ 突破练二丹炉复燃（演出 + 突破史）→ 突破练三炼器鼎可用 + 送器方《粗布衣》并能炼
//      → 天机镜境界录记着 → 旧存档进洞府补解锁 + 补器方（已二阶的不降）→ 升阶用野外材料（丹炉铁精石 / 赤炎果，鼎含炼器鼎残件）。
// 截图：work/shots/loop_fac_unlock_*.png
const results = [];
function check(name, ok, info = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? "  " + info : ""}`);
}
const STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); s.setAttribute("data-vite-dev-id", id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;
export default async function (page, c) {
  await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: STUB }));
  const base = page.url().replace(/\/(\?.*)?$/, "");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector(".cv-loading"), null, { timeout: 60000 }).catch(() => {});
  await c.wait(600);
  const ev = (fn, a) => page.evaluate(fn, a);
  const click = async (sel) => (await page.click(sel), await c.wait(200));
  // 期望值从数据现算
  const D = await ev(async () => {
    const { FACILITIES } = await import("/src/data/recipes.js");
    const { realmKeyName } = await import("/src/game/progression.js");
    const f = FACILITIES.furnace, g = FACILITIES.forge;
    return { fAt: f.unlock.realm, gAt: g.unlock.realm, fTxt: realmKeyName(f.unlock.realm) + "解锁", gTxt: realmKeyName(g.unlock.realm) + "解锁", fCost: f.cost[1], gCost: g.cost[1], gGift: g.unlock.recipes, fGift: f.unlock.recipes };
  });
  check("数据：丹炉练二、炼器鼎练三解锁，cost[0] 不再是材料", D.fAt === "1:2" && D.gAt === "1:3" && D.fTxt === "练气二层解锁" && D.gTxt === "练气三层解锁", JSON.stringify(D));

  // ---------- 1. 练气一层：都没解锁 ----------
  await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F;
    p.realm = { stage: 1, layer: 1 };
    p.xp = 0;
    p.unlocks = {};
    F.applyUnlocks && F.applyUnlocks(p);
    F.caveState(p).facilities.furnace = 0;
    F.caveState(p).facilities.forge = 0;
    p.flags.recipes = {};
    p.stats.breakHistory = [];
    cv.changed();
  });
  const l1 = await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F, r = F.recipes();
    const hc = r.alchemy.find((x) => x.id === "huichun"), rc = r.forge.find((x) => x.id === "robe_cu");
    return { fu: F.upgradeInfo(p, "furnace"), gu: F.upgradeInfo(p, "forge"), why: F.alchemyCanStart(p, hc).why, fwhy: F.forgeCanCraft(p, r.forge.find((x) => x.id === "sword")).why, robe: F.recipeKnown(p, rc), todo: F.todos(p).map((t) => t.text).filter((t) => /炼丹炉|炼器鼎/.test(t)) };
  });
  check("练一：丹炉 / 鼎都锁着，升阶信息写解锁层（不是材料修复）", l1.fu.locked && l1.fu.blocked === D.fTxt && l1.gu.locked && l1.gu.blocked === D.gTxt && !l1.fu.cost, JSON.stringify({ fu: l1.fu, gu: l1.gu }));
  check("练一：开炉 / 炼器理由写解锁层；今日可办没有修复项；粗布衣器方还不会", l1.why.includes(D.fTxt) && l1.fwhy.includes(D.gTxt) && !l1.todo.length && !l1.robe, JSON.stringify(l1));
  await ev(() => window.__cave.open("workshop", "alchemy"));
  await page.waitForSelector(".cv-page[data-id=workshop]");
  await c.wait(400);
  const pa = await ev(() => ({ card: document.querySelector(".ws2-card").textContent, seal: document.querySelector("[data-act=up-furnace]").classList.contains("is-disabled"), why: document.querySelector(".ws2-act").textContent }));
  check("练一 · 炼丹页：丹炉未复燃 + 练气二层 + 复燃后可炼回春 / 回气 + 往后升阶材料；印灰", /丹炉未复燃/.test(pa.card) && pa.card.includes("练气二层") && /回春丹/.test(pa.card) && /铁精石/.test(pa.card) && pa.seal && pa.why.includes(D.fTxt), JSON.stringify(pa));
  await c.shot("l1_alchemy");
  await click(".cv-page .ink-tab[data-tab=forge]");
  const pf = await ev(() => ({ card: document.querySelector(".ws2-card").textContent, seal: document.querySelector("[data-act=up-forge]").classList.contains("is-disabled") }));
  check("练一 · 炼器页：炼器鼎未开 + 练气三层 + 先送青锋剑、粗布衣器方 + 升阶要炼器鼎残件；印灰", /炼器鼎未开/.test(pf.card) && pf.card.includes("练气三层") && /粗布衣/.test(pf.card) && /炼器鼎残件/.test(pf.card) && pf.seal, JSON.stringify(pf));
  await c.shot("l1_forge");
  await click("[data-act=close]");
  const tagTxt = await ev(() => { window.__cave.ui.refreshHud(); const t = document.querySelector('.cv-tag[data-st="workshop"]'); return t ? t.textContent : ""; });
  check("练一 · 丹器房挂签：丹炉 · 练气二层解锁", tagTxt.includes("丹炉 · " + D.fTxt), tagTxt);

  // ---------- 2/3. 突破练二、练三 ----------
  const breakTo = async () => {
    await ev(() => { const cv = window.__cave; cv.p.xp = cv.F.xpNeed ? cv.F.xpNeed(cv.p) : 9999; cv.breakthrough(); });
    await page.waitForSelector(".cv-break", { timeout: 8000 });
    await c.wait(2600);
    const txt = await ev(() => document.querySelector(".cv-break").textContent);
    return txt;
  };
  const done = async () => {
    await page.waitForSelector('.cv-break [data-act="break-done"], .cv-break [data-id="break-done"]', { timeout: 10000 }).catch(() => {});
    await ev(() => { const b = document.querySelector('.cv-break [data-act="break-done"], .cv-break [data-id="break-done"]'); b && b.click(); });
    await c.wait(600);
    await ev(() => { const m = document.querySelector(".cv-mirror"); m && m.click(); });
    await c.wait(200);
  };
  const xpFn = await ev(() => typeof window.__cave.F.xpNeed);
  if (xpFn !== "function") await ev(async () => { const m = await import("/src/game/progression.js"); window.__cave.F.xpNeed = m.xpNeed; });
  let t2 = await breakTo();
  await c.shot("break_l2");
  await done();
  const b2 = await ev(() => { const cv = window.__cave, p = cv.p, H = p.stats.breakHistory, e = H[H.length - 1]; return { realm: p.realm.layer, f: cv.F.facLevel(p, "furnace"), g: cv.F.facLevel(p, "forge"), unl: e.unlocks, gr: e.grants }; });
  check("突破练二：丹炉自动复燃（1 阶），鼎仍锁着", b2.realm === 2 && b2.f === 1 && b2.g === 0, JSON.stringify(b2));
  check("突破演出写「丹炉已复燃」；突破史记 furnace；回春 / 回气已会 → 不重复送", t2.includes("丹炉已复燃") && b2.unl.some((u) => u.key === "furnace") && !b2.gr.some((g) => g.kind === "recipe"), t2.slice(0, 120));
  let t3 = await breakTo();
  await c.shot("break_l3");
  await done();
  const b3 = await ev(() => { const cv = window.__cave, p = cv.p, H = p.stats.breakHistory, e = H[H.length - 1], rc = cv.F.recipes().forge.find((x) => x.id === "robe_cu"); return { realm: p.realm.layer, g: cv.F.facLevel(p, "forge"), unl: e.unlocks, gr: e.grants, known: cv.F.recipeKnown(p, rc), flag: !!(p.flags.recipes || {}).robe_cu }; });
  check("突破练三：炼器鼎可用（1 阶），送器方《粗布衣》（青锋剑已会不重复）", b3.realm === 3 && b3.g === 1 && b3.known && b3.flag && b3.gr.filter((g) => g.kind === "recipe").map((g) => g.id).join() === "robe_cu" && b3.gr.find((g) => g.kind === "recipe").book === "器方", JSON.stringify(b3));
  check("突破演出写「炼器鼎已可用」「得器方《粗布衣》」", t3.includes("炼器鼎已可用") && t3.includes("器方《粗布衣》"), t3.slice(0, 160));
  // 立刻能炼粗布衣
  await ev(() => { const cv = window.__cave, g = window.__cdev.give; g(cv.p, "狼皮", 2); g(cv.p, "青灵草", 1); g(cv.p, "灵石", 10); cv.open("forge", "forge", { sel: { cat: "gear", rec: "robe_cu" } }); });
  await c.wait(400);
  const rb0 = await ev(() => window.__cave.p.storage.items.filter((i) => i.id === "robe_cu").length);
  const row = await ev(() => { const r = document.querySelector(".ws2-row[data-rec=robe_cu]"); return r ? { dim: r.classList.contains("dim"), st: r.textContent } : null; });
  await click("[data-act=craft-robe_cu]");
  await c.wait(400);
  const rb1 = await ev(() => window.__cave.p.storage.items.filter((i) => i.id === "robe_cu").length);
  check("练三 · 炼器页有粗布衣、可炼出", row && !row.dim && rb1 === rb0 + 1, JSON.stringify({ row, rb0, rb1 }));
  await c.shot("l3_robe");
  await ev(() => { const b = document.querySelector("[data-act=forge-ok]"); b && b.click(); window.__cave.ui.close(); });
  await c.wait(200);
  // 天机镜境界录
  await ev(() => { void window.__cave.openMirror({ app: "realm" }); });
  await page.waitForSelector(".mv2", { timeout: 10000 });
  await c.wait(1200);
  const mtxt = await ev(() => { const m = document.querySelector(".mj-root, .mj, .cv-mirror2, [class*=mj-]"); return document.body.textContent; });
  check("天机镜境界录：炼器鼎已可用 · 器方《粗布衣》· 丹炉已复燃", mtxt.includes("炼器鼎已可用") && mtxt.includes("器方《粗布衣》") && mtxt.includes("丹炉已复燃"));
  await c.shot("mirror");
  await page.keyboard.press("Escape");
  await c.wait(500);

  // ---------- 4. 旧存档：已过该层、设施还是 0 → 进洞府补 ----------
  await ev(async () => {
    const cv = window.__cave, p = cv.p, F = cv.F;
    if (cv.mirror && cv.mirror.alive) cv.mirror.close();
    p.realm = { stage: 1, layer: 4 };
    F.caveState(p).facilities.furnace = 0;
    F.caveState(p).facilities.forge = 0;
    delete p.flags.recipes.robe_cu;
    cv.exit();
    await cv.enter();
  });
  await c.wait(1500);
  const old = await ev(() => { const cv = window.__cave, p = cv.p, t = [...document.querySelectorAll(".cv-toasts .ink-toast")].map((x) => x.textContent).join("|"); return { f: cv.F.facLevel(p, "furnace"), g: cv.F.facLevel(p, "forge"), robe: !!p.flags.recipes.robe_cu, t }; });
  check("旧存档（练四、丹炉 / 鼎 0 级）进洞府：补到 1 阶、补器方，并提示", old.f === 1 && old.g === 1 && old.robe && old.t.includes("丹炉已复燃") && old.t.includes("炼器鼎已可用"), JSON.stringify(old));
  await ev(async () => { const cv = window.__cave, F = cv.F; F.caveState(cv.p).facilities.furnace = 2; cv.exit(); await cv.enter(); });
  await c.wait(800);
  check("已升到二阶的旧存档不受影响", (await ev(() => window.__cave.F.facLevel(window.__cave.p, "furnace"))) === 2);
  for (const level of [1, 2]) {
    const patched = await ev(async (level) => {
      const cv = window.__cave, p = cv.p, F = cv.F;
      F.caveState(p).facilities.forge = level;
      delete p.flags.recipes.robe_cu;
      cv.exit();
      await cv.enter();
      const recipe = F.recipes().forge.find((r) => r.id === "robe_cu");
      return { level: F.facLevel(p, "forge"), known: F.recipeKnown(p, recipe), flag: !!p.flags.recipes.robe_cu, again: F.unlockFacilities(p).length };
    }, level);
    check(`旧档鼎 ${level} 阶：补粗布衣器方、保留阶数且不重复赠送`, patched.level === level && patched.known && patched.flag && patched.again === 0, JSON.stringify(patched));
  }
  await ev(() => { window.__cave.F.caveState(window.__cave.p).facilities.forge = 1; });

  // ---------- 5. 升阶用野外材料 ----------
  await ev(() => { const cv = window.__cave, F = cv.F; F.caveState(cv.p).facilities.furnace = 1; for (const it of cv.p.storage.items.filter((x) => ["tiejing_shi", "chiyan_guo"].includes(x.id))) cv.p.storage.remove(it.uid); cv.changed({ silent: !0 }); });
  const u0 = await ev(() => { const cv = window.__cave, u = cv.F.upgradeInfo(cv.p, "furnace"); return { ok: u.ok, cost: cv.F.costList(u.cost).map((x) => [x.id, x.n]) }; });
  const want = [["spirit_stone", D.fCost.stones], ...Object.entries(D.fCost.items)];
  check("丹炉 1→2 阶花费 = 数据（灵石 + 铁精石 + 赤炎果，含原修复材料），缺料时不可升", !u0.ok && JSON.stringify(u0.cost.sort()) === JSON.stringify(want.sort()), JSON.stringify({ u0, want }));
  await ev(() => { const cv = window.__cave, g = window.__cdev.give; g(cv.p, "铁精石", 15); g(cv.p, "赤炎果", 3); g(cv.p, "灵石", 300); cv.open("workshop", "alchemy"); });
  await c.wait(400);
  await click("[data-act=up-furnace]");
  await click("[data-act=up-furnace-go]");
  await c.wait(1200);
  const u1 = await ev(() => ({ lv: window.__cave.F.facLevel(window.__cave.p, "furnace"), ore: window.__cave.p.storage.count("tiejing_shi"), fruit: window.__cave.p.storage.count("chiyan_guo") }));
  check("丹炉升二阶：扣掉铁精石 ×15、赤炎果 ×3", u1.lv === 2 && u1.ore === 0 && u1.fruit === 0, JSON.stringify(u1));
  const gu = await ev(() => { const cv = window.__cave, u = cv.F.upgradeInfo(cv.p, "forge"); return { blocked: u.blocked || "", cost: cv.F.costList(u.cost).map((x) => x.id) }; });
  check("炼器鼎 1→2 阶：要炼器鼎残件（原修复材料）+ 搬迁后", gu.cost.includes("furnace_part") && gu.cost.includes("bat_wing") && /搬迁/.test(gu.blocked), JSON.stringify(gu));
  await ev(() => window.__cave.ui.close());
  check("无脚本错误", !errors.length, JSON.stringify(errors.slice(0, 3)));
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length ? `FAIL loop_fac_unlock ${bad.length} 项` : `PASS loop_fac_unlock ${results.length} 项`);
}
