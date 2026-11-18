// 内观阁 · 只编写，交主 agent 串行执行：node tools/run.mjs inner_hall "scene=cave&slot=6"
// 覆盖懒加载竞态 / 四入口 / 共享装备功法行囊 / 来源明细 / Esc 分层 / 渡劫确认取消 / 切场景清理。
const ok = (cond, msg, extra) => console.log((cond ? "PASS " : "FAIL ") + msg + (extra === undefined ? "" : " " + JSON.stringify(extra)));
export default async function (page, c) {
  const wait = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const open = async (tab) => {
    await c.ev((tab) => { __cave.open("loadout", tab); }, tab);
    await wait(() => !!__cave.ui.inner?.alive && !!document.querySelector(".mk-inner [data-prep-tab]"));
  };
  const closed = () => wait(() => !__cave.ui.cur && !document.querySelector(".mk-inner"));
  const countButton = async (id, q, sign) => c.ev(([id, q, sign]) => {
    const b = [...document.querySelectorAll(`.mk-inner [data-item="${id}"][data-q="${q}"] .ink-btn`)].find((x) => x.textContent.includes(sign));
    b?.click();
    return !!b;
  }, [id, q, sign]);
  await wait(() => window.__game?.flow?.name === "cave" && window.__cave?.active, null, 90000);
  ok(await c.ev(() => !performance.getEntriesByType("resource").some((r) => /\/loadout_hall\.js/.test(r.name))), "未开阁时不加载内观阁宿主");
  await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const { applyUnlocks } = await import("/src/game/progression.js");
    const P = __game.profile;
    P.flags.tutorialDone = P.flags.awakened = true;
    P.realm = { stage: 1, layer: 8 }; P.xp = 0; P.stats.runs = 8;
    applyUnlocks(P);
    P.flags.learned = { spells: ["sword_qi", "fire_talisman", "frost"], xinfa: ["sharp", "lingtai"], formations: [] };
    P.build = { spells: ["sword_qi", null, null], xinfa: [null, null], formation: null };
    P.storage.items.length = 0;
    P.equip.sword = makeItem("rust_sword", { identified: true });
    P.storage.add(makeItem("sword_qingfeng", { rarity: 1, level: 8, identified: true }));
    for (const [id, rarity, n] of [["huichun_dan", 0, 3], ["huichun_dan", 2, 2], ["huiqi_dan", 0, 3], ["ningshen_dan", 1, 1]]) P.storage.add(makeItem(id, { rarity, n, identified: true }));
    P.pack = { v: 1, q: { huichun_dan: { 0: 2 }, ningshen_dan: { 1: 1 } } };
    __cave.changed({ stats: true });
  });
  const tags = await c.ev(() => ({ n: document.querySelectorAll(".cv-tag[data-st]").length, inner: !!document.querySelector('[data-st="loadout"]'), boxes: __cave.scene.stationBoxes.loadout?.length, model: !!__cave.scene.groups.loadout }));
  ok(tags.n === 7 && tags.inner && tags.boxes > 0 && tags.model, "药园独立后七站点，含内观阁挂签、模型、点击包围盒", tags);
  await c.shot("cave_before_open");

  // 故意延迟首个模块请求：关阁以后迟到的 import 不得挂回 DOM / 锁住人物。
  const delayed = async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.continue(); };
  await page.route("**/src/ui/cave/loadout_hall.js*", delayed);
  await c.ev(() => document.querySelector('[data-act="hud-loadout"]').click());
  await wait(() => __cave.ui.cur === "loadout");
  await page.keyboard.press("Escape");
  await c.wait(1100);
  ok(await c.ev(() => !__cave.ui.cur && !__cave.locked && !__game.ctx.hold3d && !document.querySelector(".mk-inner")), "懒加载期间 Esc 取消，迟到结果不复活");
  await page.unroute("**/src/ui/cave/loadout_hall.js*", delayed);
  await c.ev(() => document.querySelector('[data-act="hud-loadout"]').click());
  await wait(() => !!document.querySelector(".mk-inner [data-prep-tab]"));
  // 不预先等首入预热结束，以保留开阁与预热收尾交叠的覆盖；开阁后等两方都就绪。
  let hudReady = true;
  try {
    await wait(() => !document.querySelector(".cv-loading") && !!__cave.ui.inner?.alive && __game.ctx.hold3d, null, 90000);
  } catch (e) {
    if (e.name !== "TimeoutError") throw e;
    hudReady = false;
  }
  const hud = await c.ev(() => ({
    locked: __cave.locked, hold3d: __game.ctx.hold3d, cur: __cave.ui.cur,
    alive: !!__cave.ui.inner?.alive, loading: !!document.querySelector(".cv-loading"),
    stats: !!document.querySelector('.mk-inner [data-id="prep-stats"]'),
    fan: !!document.querySelector(".mk-inner .fan"), facts: !!document.querySelector(".mk-inner .facts"),
  }));
  ok(hudReady && hud.locked && hud.hold3d && hud.alive && hud.stats && !hud.loading && !hud.fan && !hud.facts, "HUD 开阁：停3D、属性卷可用，不含去处情报", { ready: hudReady, ...hud });
  const sense = await c.ev(async () => {
    const { statBreakdown } = await import("/src/game/stat_breakdown.js");
    const s = __cave.ui.inner.prep;
    return { run: statBreakdown(__game.profile, { plan: s.state.q }).sense.final, cave: statBreakdown(__game.profile, { mode: "cave", plan: s.state.q }).sense.final };
  });
  ok(sense.run - sense.cave === 20, "凝神丹只在按出行计增加神识", sense);
  await page.locator('.mk-inner [data-id="prep-stats"]').click();
  await page.locator('.prep-modal.stats-modal [data-stat="atk"]').click();
  await c.ev(() => { for (let i = 0; i < 4; i++) __cave.ui.inner.prep.ss.render(); });
  ok(await c.ev(() => document.querySelectorAll(".mk-ss-pop").length === 1), "属性明细多次重绘只留一张纸签");
  await page.keyboard.press("Escape");
  ok(await c.ev(() => !!__cave.ui.inner && !document.querySelector(".mk-ss-pop")), "Esc 先关属性明细，不关阁");

  // 属性层独立收起；从实际法器卡换装，再重开属性核对变化。
  const atk0 = await c.ev(() => __cave.ui.inner.prep.ss.D.atk.final);
  await page.keyboard.press("Escape");
  ok(await c.ev(() => !!__cave.ui.inner && !document.querySelector(".prep-modal")), "第二次 Esc 只收起属性卷，仍在阁内");
  const swordUid = await c.ev(() => __game.profile.storage.items.find(it => it.id === "sword_qingfeng").uid);
  await page.locator('.mk-inner [data-slot="sword"]').click();
  await page.locator(`.mk-inner [data-gear-uid="${swordUid}"] [data-id="gear-equip"]`).click();
  await wait(() => __game.profile.equip.sword?.id === "sword_qingfeng");
  await page.locator('.mk-inner [data-id="prep-stats"]').click();
  ok(await c.ev((n) => __cave.ui.inner.prep.ss.D.atk.final > n, atk0), "更换法剑后重开属性卷读到同一份真实装备");
  await page.keyboard.press("Escape");
  await page.locator('.mk-inner [data-prep-tab="gongfa"]').click();
  await page.locator('.mk-inner [data-src-kind="spell"][data-src-id="fire_talisman"]').click();
  await page.locator('.mk-inner [data-slot-kind="spell"][data-slot-i="1"]').click();
  ok(await c.ev(() => __game.profile.build.spells[1] === "fire_talisman"), "阁内装法术写同一份 profile.build");
  await page.locator('.mk-inner [data-src-kind="spell"][data-src-id="sword_qi"]').click();
  await page.keyboard.press("Escape");
  ok(await c.ev(() => !!__cave.ui.inner && !__cave.ui.inner.prep.lo.sel), "Esc 先取消功法选中，不关阁");
  await page.locator('.mk-inner [data-prep-tab="pack"]').click();
  const store0 = await c.ev(() => __game.profile.storage.count("huichun_dan"));
  await countButton("huichun_dan", 0, "－");
  await countButton("huichun_dan", 2, "＋");
  const plan = await c.ev(() => ({ q: __game.profile.pack.q.huichun_dan, storage: __game.profile.storage.count("huichun_dan") }));
  ok(plan.q[0] === 1 && plan.q[2] === 1 && plan.storage === store0, "按品级修改预案，不扣仓库", plan);
  await c.shot("inner_after");
  await page.locator('.mk-inner [data-id="depart"]').click();
  await wait(() => __game.flow.name === "prep" && !!document.querySelector(".mk-prep:not(.mk-inner)"));
  const shared = await c.ev(() => ({ q: __game.flow.scenes.prep.state.q.huichun_dan, spell: __game.profile.build.spells[1], sword: __game.profile.equip.sword.id, inner: !!document.querySelector(".mk-inner") }));
  ok(shared.q[0] === 1 && shared.q[2] === 1 && shared.spell === "fire_talisman" && shared.sword === "sword_qingfeng" && !shared.inner, "出行台沿用相同行囊、功法、装备；阁已销毁", shared);
  await c.shot("prep_synced");
  await page.keyboard.press("Escape");
  await wait(() => __game.flow.name === "cave" && __cave.active && !__cave.ui.cur, null, 60000);

  // 建筑附近 F 与今日可办入口（建筑鼠标命中盒在前面已断言）。
  await c.ev(() => { const p = __game.player, [x,z] = __cave.scene.stations.loadout.stand; p.pos.set(x, __cave.scene.height(x,z), z); });
  await c.wait(200);
  await page.keyboard.press("f");
  await wait(() => !!document.querySelector(".mk-inner"));
  await page.keyboard.press("Escape");
  await closed();
  ok(await c.ev(() => !__cave.locked && !__game.ctx.hold3d), "近处 F 开阁 / Esc 回洞府解锁并恢复3D");
  await c.ev(() => { __game.profile.build.spells[1] = null; __cave.changed(); });
  ok(await c.ev(() => !!document.querySelector('.cv-today [data-fac="loadout"]')), "有已学可装的空栏才出现今日可办");
  await c.ev(() => document.querySelector('.cv-today [data-fac="loadout"]').click());
  await wait(() => !!document.querySelector(".mk-inner"));
  ok(await c.ev(() => __cave.ui.inner.prep.lo.tab === "spell"), "今日可办走过去并定位功法页");
  await page.locator('.mk-inner [data-id="back"]').click();
  await closed();

  // 按真实原确认框协议验证“调整功法”：取消待渡劫 promise，不留下过期确认框。
  await c.ev(() => {
    window.__innerTrialAnswer = null;
    __cave.ui.confirm("心魔劫", "测试渡劫确认取消", { ok: "渡劫", extra: { label: "调整功法", id: "trial-loadout", onClick: () => __cave.openLoadout({ from: "trial" }) } }).then((v) => { window.__innerTrialAnswer = v; });
  });
  await page.locator('.cv-modal [data-act="trial-loadout"]').click();
  await wait(() => !!document.querySelector(".mk-inner"));
  ok(await c.ev(() => window.__innerTrialAnswer === false && !document.querySelector(".cv-modal") && !__cave.trial), "调整功法先取消渡劫确认，不自动开劫");
  await page.keyboard.press("Escape");
  await closed();
  await open("xinfa");
  ok(await c.ev(() => __cave.ui.inner.prep.lo.tab === "xinfa"), "参悟快捷入口支持心法页签");
  await c.ev(() => { __game.flow.go("prep"); });
  await wait(() => __game.flow.name === "prep" && !!document.querySelector(".mk-prep:not(.mk-inner)"));
  ok(await c.ev(() => !document.querySelector(".mk-inner,.mk-ss-pop") && !__cave.locked && !__game.ctx.hold3d), "强制离开洞府清理阁、浮签、人物锁与hold3d");
}
