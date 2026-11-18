// C 出行缺口签 + A 功法匣来源签。只编写；交主 agent 在全部协作者收工后串行执行。
// node tools/run.mjs gongfa_hint "scene=cave&slot=3"
const ok = (cond, name, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra == null ? "" : " " + JSON.stringify(extra)));
  if (!cond) process.exitCode = 1;
};
export default async function(page, c) {
  // CDP Log 会补发启用前的网络错误，保留 URL，避免把启动期所有 404 当成 favicon。
  const devlog = await page.context().newCDPSession(page), browserErrors = [];
  devlog.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") browserErrors.push({ source: entry.source, text: entry.text, url: entry.url || "" }); });
  await devlog.send("Log.enable");
  await page.waitForFunction(() => window.__game?.flow?.name === "cave", null, { timeout: 60000 });
  await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const P = __game.flow.newGame(3) || __game.profile;
    P.flags.tutorialDone = true; P.flags.unlockAll = true; P.stats.runs = 8;
    P.realm = { stage: 1, layer: 7 }; P.unlocks.pillSlots = 2;
    P.flags.learned = { ...P.flags.learned, spells: ["sword_qi", "earth_shield", "ningfeng"] };
    P.build = { spells: ["earth_shield", "ningfeng", null], xinfa: [], formation: null };
    P.pack = { v: 1, q: {} };
    P.storage.add(makeItem("huichun_dan", { n: 3, rarity: 0 }));
    P.storage.add(makeItem("scroll_rock_page", { n: 3, identified: true }));
    await __game.flow.go("prep");
  });
  await page.waitForFunction(() => document.querySelector(".mk-layer-prep [data-gfready]"));
  const state = await c.ev(async () => {
    const { gapGroups } = await import("/src/ui/gongfa_hint.js");
    const { coverage, place, shieldInfo } = await import("/src/ui/loadout.js");
    const { shieldGap } = await import("/src/game/gongfa.js");
    const info = shieldInfo("r2"), gaps = shieldGap(__game.profile, "r2");
    const S = __game.flow.scenes.prep, P = __game.profile;
    const before = JSON.stringify(P.build.spells);
    const denied = place(P, "spell", 0, "rock");
    S.setTab("gongfa");
    S.lo.pinSource("rock");
    const earthRows = coverage(P, "r2").filter((v) => v.need === "earth");
    return {
      empty: Object.values(S.state.take).every((n) => !n),
      ready: !!document.querySelector("[data-gfready]"),
      same: before === JSON.stringify(P.build.spells),
      gap: gapGroups(P, "r2").some((g) => g.need === "earth"),
      coverage: earthRows.length > 0 && earthRows.every((v) => !v.ok),
      sources: info.els.length === 5 && gaps.length === 5 && info.els.every((el) => gaps.some((g) => g.el === el)),
      shares: !info.share.water && !info.share.metal && Math.abs(info.share.fire - 4 / 11) < 1e-9 && Math.abs(info.share.earth - 7 / 11) < 1e-9,
      pin: S.lo.pinned === "rock" && S.lo.boxEl.querySelector(".ld-detail").textContent.includes("来源"),
      extras: !!document.querySelector('[data-src-id="rock"] .gfh-rx'),
    };
  });
  for (const [k,v] of Object.entries(state)) ok(v, "prep " + k, state);
  const region = await c.ev(() => {
    document.querySelector('[data-region="r2"]')?.click();
    const S = __game.flow.scenes.prep;
    const chip = document.querySelector("[data-gfgap]"); chip?.click();
    const opened = !!document.querySelector("[data-gfslip]");
    const toggle = document.querySelector('[data-id="gf-maptag"]');
    const before = __game.profile.flags.gongfaMapTag !== false;
    toggle?.click();
    return { region: S.lo.region === S.state.region && S.state.region === "r2", opened, saved: !!toggle && (__game.profile.flags.gongfaMapTag !== false) !== before };
  });
  for (const [k,v] of Object.entries(region)) ok(v, "region/gap " + k);
  await c.shot("r2_gap");
  const rules = await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const { pageHint } = await import("/src/game/gongfa.js");
    const { readyList, pagesText } = await import("/src/ui/gongfa_hint.js");
    const P = __game.profile;
    P.flags.gongfa = { ...P.flags.gongfa, wux: 30 };
    const none = pageHint(P, "scroll_zhishui_page").fill === 0;
    P.storage.add(makeItem("scroll_zhishui_page", { n: 1, identified: true }));
    const fill = readyList(P).some((e) => e.teaches === "zhishui");
    P.storage.add(makeItem("scroll_thunder_book", { identified: true }));
    return { none, fill, book: pagesText(P, "thunder").includes("完本已得") };
  });
  for (const [k,v] of Object.entries(rules)) ok(v, "page rules " + k);
  // 用真实来源表、假的已见集合验证隐私/事件，不依赖地图随机种子。
  const map = await c.ev(async () => {
    const { GongfaMap } = await import("/src/ui/gongfa_map.js");
    const { makeItem } = await import("/src/core/items.js");
    const P = __game.profile; P.flags.gongfaMapTag = true;
    const listeners = new Set(), bag = { items: [], on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    const pos = { x: 0, z: 0 }, mark = { stele: true, lootSrc: "stele_beiji" };
    const M = { ver: 0, things: new Map(), groups: new Map(), now: { dens: new Set(), boss: false }, old: { dens: new Set(), boss: false }, bossDead: () => false };
    const run = { profile: P, region: "r2", bag, mapModel: M, map: { points: {} } };
    const g = new GongfaMap(run); g.refresh();
    const hidden = g.tags.length === 0;
    M.things.set(mark, { kind: "chest", label: "北脊断碑", pos, state: "closed" }); M.ver++;
    g.refresh(); const shown = g.tags.some((t) => t.ids.includes("zhishui"));
    bag.items.push(makeItem("scroll_zhishui_page", { n: 1, identified: true }));
    for (const fn of listeners) fn(); g.refresh();
    const progress = g.tags.some((t) => t.tip.includes("残页 2/5"));
    P.flags.gongfaMapTag = false; g.refresh(); const off = g.tags.length === 0;
    g.dispose();
    return { hidden, shown, progress, off, dispose: listeners.size === 0 };
  });
  for (const [k,v] of Object.entries(map)) ok(v, "map " + k);
  const inner = await c.ev(async () => {
    const { makePrep } = await import("/src/ui/screens/prep.js");
    const P = __game.profile, flow = __game.flow;
    const before = P.storage.count("huichun_dan");
    const S = makePrep(flow.ctx, { flow, inner: true });
    await S.enter();
    S.setQ("huichun_dan", 0, 99); S.render();
    const cap = S.state.take.huichun_dan <= S.pillCap();
    const lazyStats = !S.ss && !S.root.querySelector(".mk-ss");
    S.openStats();
    const noDeparture = !S.root.querySelector("[data-region]") && lazyStats && !!S.ss;
    S.closeModal();
    S.exit();
    return { cap, noDeparture, noTake: before === P.storage.count("huichun_dan"), disposed: !S.ss && !S.lo };
  });
  for (const [k,v] of Object.entries(inner)) ok(v, "shared inner " + k);
  // 真实 ready 导航：应进入仓库 scroll 分类，不造 study 页签。
  await c.ev(() => { const S = __game.flow.scenes.prep; S.render(); document.querySelector("[data-gfready]")?.click(); });
  await page.waitForFunction(() => __game.flow.name === "cave", null, { timeout: 15000 });
  await page.waitForFunction(() => window.__cave?.ui?.cur === "storage", null, { timeout: 15000 });
  ok(await c.ev(() => window.__cave.ui.tab === "scroll"), "ready enters cave storage scroll");
  // 真实内观阁导航必须先关阁再开仓库，不能留下 hold3d/输入锁宿主。
  await c.ev(async () => { window.__cave.ui.close(); await window.__cave.openLoadout(); });
  await page.waitForFunction(() => document.querySelector(".mk-layer-inner [data-gfready]"));
  await page.locator(".mk-layer-inner [data-gfready]").click();
  ok(await c.ev(() => window.__cave.ui.cur === "storage" && window.__cave.ui.tab === "scroll" && !window.__cave.ui.inner && !document.querySelector(".mk-layer-inner .mk-prep")), "inner ready closes hall before storage scroll");
  console.log("BROWSER_ERRORS", JSON.stringify(browserErrors));
  const unexpected = browserErrors.filter(e => !(e.source === "network" && /\b404\b/.test(e.text) && e.url && new URL(e.url).pathname === "/favicon.ico"));
  ok(unexpected.length === 0, "无业务资源或浏览器错误（仅允许已定位的 favicon 404）", unexpected);
  await devlog.detach();
}
