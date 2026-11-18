// 栏位解锁一致 + 丹方残页数量（玩法系统 2026-11-17，用户 bug："玉佩栏未解锁却能在局内装备"、"背包 2 本残页回仓库只剩 1 本"）
//   node tools/run.mjs loop_slots_pages "scene=run&region=r1&slot=6"
// 1. 局内储物袋：练一层双击 / 拖拽玉佩、法衣到装备位 → 不装备，提示"玉佩栏 · 练气五层解锁"（层数读 PROGRESSION.unlocks）；装备按钮置灰；
//    随身格显示"锁"；练三层后法衣可装；序章拾取自动佩戴不越过解锁；未解锁栏位的装备不计入属性。
// 2. 掉落：宝箱里的丹方残页已鉴定、可堆叠；随机装备按栏位解锁门控（练一不出玉佩）。
// 3. 撤离：局内拾得 N 张残页 → 仓库 +N；身陨（区域一保留 50%，堆叠按数量 round(N × 0.5)）；区域二 25%，遗落部分 uid 不与保留部分重复。
// 4. 旧存档：未解锁却装着玉佩 → 进洞府退回仓库并提示一次。
const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);

export default async function (page, c) {
  const waitFor = (fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms });
  await waitFor(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, 120000);
  await page.mouse.move(300, 560);
  await c.wait(800);
  const unlockText = await c.ev(async () => {
    const G = (window.__sp = {});
    G.items = await import("/src/core/items.js");
    G.loot = await import("/src/game/loot.js");
    G.prog = await import("/src/game/progression.js");
    G.data = await import("/src/data/progression.js");
    G.settle = await import("/src/game/run/settle.js");
    G.runm = await import("/src/game/run/run.js");
    G.bag = await import("/src/core/bag.js");
    const r = __game.run, P = r.profile;
    for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch", "lingzhi"]) P.flags["hint_" + k] = 1;
    G.calm = () => {
      r.clearEnemies && r.clearEnemies();
      r.nextWave = 1e9;
      r.hintT = 99;
      document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    };
    G.calm();
    __game.debug.realm(1, 1);
    P.equip.robe = P.equip.jade = null;
    r.bag.capacity = 24;
    r.bag.clear();
    G.jade = G.loot.makeGear("jade_qing", 1, 1, { identified: !0 });
    G.robe = G.loot.makeGear("robe_bu", 1, 1, { identified: !0 });
    r.bag.add(G.jade);
    r.bag.add(G.robe);
    r.applyEquip();
    r.emit("bag");
    // 期望文案从数据现算（不写死层数）
    const at = (k) => G.data.PROGRESSION.unlocks[k].find(([, v]) => v === !0)[0];
    const nm = (k) => G.prog.realmKeyName(at(k));
    return { jade: `玉佩栏 · ${nm("jadeSlot")}解锁`, robe: `法衣栏 · ${nm("robeSlot")}解锁` };
  });
  ok(unlockText.jade === "玉佩栏 · 练气五层解锁" && unlockText.robe === "法衣栏 · 练气三层解锁", "解锁文案从 PROGRESSION.unlocks 读出", unlockText);

  // ---------------- 1. 局内储物袋 ----------------
  await page.keyboard.press("Tab");
  await c.wait(500);
  const tokBox = (which) => c.ev((w) => {
    const it = window.__sp[w];
    const t = [...document.querySelectorAll(".mk-bagui .bv-grid .mk-tok")].find((e) => e._inst === it);
    if (!t) return null;
    const b = t.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, which);
  const toasts = () => c.ev(() => [...document.querySelectorAll(".mk-toasts > *")].map((e) => e.textContent).join(" | "));
  const slotEl = await c.ev(() => {
    const s = document.querySelector('.mk-bagui [data-drop="equip:jade"]');
    return s && { lock: s.classList.contains("is-locked"), title: s.title, txt: s.textContent };
  });
  ok(slotEl && slotEl.lock && /锁/.test(slotEl.txt) && slotEl.title === unlockText.jade, "储物袋随身格：玉佩栏未解锁显示\"锁\"、悬停写解锁境界", slotEl);

  let b = await tokBox("jade");
  ok(!!b, "储物袋里找到玉佩", b);
  if (b) await page.mouse.dblclick(b.x, b.y);
  await c.wait(300);
  let st = await c.ev(() => ({ jade: !!__game.run.profile.equip.jade, inBag: __game.run.bag.items.includes(window.__sp.jade) }));
  let ts = await toasts();
  ok(!st.jade && st.inBag && ts.includes(unlockText.jade), "练一层双击玉佩：不装备，提示与洞府一致", { ...st, ts });

  // 选中看浮签：装备按钮置灰 + 小字
  b = await tokBox("jade");
  if (b) await page.mouse.click(b.x, b.y);
  await c.wait(300);
  const tip = await c.ev(() => {
    const btn = document.querySelector('.mk-bagui .bv-tip [data-id="equip"]');
    const note = document.querySelector(".mk-bagui .bv-tip .acts .note");
    return { has: !!btn, disabled: !!btn && (btn.disabled || btn.classList.contains("is-disabled") || btn.getAttribute("aria-disabled") === "true"), note: note && note.textContent };
  });
  ok(tip.has && tip.disabled && tip.note === unlockText.jade, "浮签：未解锁时\"装备\"置灰并写解锁境界", tip);

  // 拖到装备位
  await c.ev(() => document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove()));
  b = await tokBox("robe");
  const slotBox = await c.ev(() => {
    const s = document.querySelector('.mk-bagui [data-drop="equip:robe"]').getBoundingClientRect();
    return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  });
  if (b) {
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 6, { steps: 3 });
    await page.mouse.move(slotBox.x, slotBox.y, { steps: 10 });
    await page.mouse.up();
  }
  await c.wait(300);
  st = await c.ev(() => ({ robe: !!__game.run.profile.equip.robe, inBag: __game.run.bag.items.includes(window.__sp.robe) }));
  ts = await toasts();
  ok(!st.robe && st.inBag && ts.includes(unlockText.robe), "练一层把法衣拖到装备位：不装备，提示\"法衣栏 · 练气三层解锁\"", { ...st, ts });
  await c.shot("locked");

  // 练三层：法衣可装，玉佩仍锁
  await c.ev(() => (__game.debug.realm(1, 3), __game.run.emit("bag")));
  await c.wait(300);
  b = await tokBox("robe");
  if (b) await page.mouse.dblclick(b.x, b.y);
  await c.wait(300);
  b = await tokBox("jade");
  if (b) await page.mouse.dblclick(b.x, b.y);
  await c.wait(300);
  st = await c.ev(() => ({ robe: (__game.run.profile.equip.robe || {}).uid === window.__sp.robe.uid, jade: !!__game.run.profile.equip.jade }));
  ok(st.robe && !st.jade, "练三层：法衣双击即装，玉佩仍不让装", st);
  await page.keyboard.press("Tab");
  await c.wait(200);

  // 序章拾取自动佩戴、属性生效都走 slotOpen
  const logic = await c.ev(() => {
    const G = window.__sp, r = __game.run, P = r.profile;
    __game.debug.realm(1, 1);
    // 序章分支：练一层捡到法衣不自动佩上
    const robe2 = G.loot.makeGear("robe_bu", 0, 1, { identified: !0 });
    const reg = r.region, eqRobe = P.equip.robe;
    P.equip.robe = null;
    r.region = "tutorial";
    r.collect([robe2], { src: "ground" });
    r.region = reg;
    const tut = { equipped: P.equip.robe === robe2, inBag: r.bag.items.includes(robe2) };
    r.bag.remove(robe2.uid);
    P.equip.robe = eqRobe;
    // 属性：未解锁的栏位不计入
    const calls = [];
    const fake = { stats: { removeSource() {}, addAll(m) { calls.push(m.length); } } };
    const saveJade = P.equip.jade;
    P.equip.jade = G.jade;
    G.runm.applyEquipStats(fake, P);
    P.equip.jade = saveJade;
    const open = ["sword", "robe", "jade"].filter((s) => P.equip[s] || s === "jade").filter((s) => G.prog.slotOpen(P, s)).length;
    return { tut, calls: calls.length, expect: (P.equip.sword ? 1 : 0), open };
  });
  ok(!logic.tut.equipped && logic.tut.inBag, "序章拾取：栏位未解锁时不自动佩戴，留在储物袋", logic.tut);
  ok(logic.calls === logic.expect, "局内属性：练一层装着的法衣 / 玉佩不生效（只有法剑）", logic);

  // ---------------- 2. 掉落 ----------------
  const drop = await c.ev(() => {
    const G = window.__sp, P = __game.run.profile;
    const pages = [];
    for (let i = 0; i < 800 && pages.length < 3; i++) pages.push(...G.loot.rollLoot("chest_glow", { region: "r1", profile: P }).filter((x) => x.id === "danfang_page"));
    let jade = 0, robe = 0, sword = 0;
    for (let i = 0; i < 3000; i++) {
      const g = G.loot.makeGear(null, 1, 1, { region: "r1", profile: P });
      const s = G.items.ITEMS[g.id].slot;
      s === "jade" ? jade++ : s === "robe" ? robe++ : sword++;
    }
    window.__sp.pages = pages;
    return { pagesId: pages.every((p) => p.identified !== !1), n: pages.length, jade, robe, sword };
  });
  ok(drop.n === 3 && drop.pagesId, "宝箱掉的丹方残页是已鉴定的（可堆叠）", drop);
  ok(drop.jade === 0 && drop.robe < drop.sword * 0.15, "练一层随机装备：不出玉佩，法衣大幅降低（GEAR_SLOT_GATE）", drop);

  // ---------------- 3. 撤离：残页数量；4. 旧存档修正 ----------------
  const before = await c.ev(() => {
    const G = window.__sp, r = __game.run, P = r.profile;
    G.calm();
    const C = r.containers;
    const box = C.create({ kind: "cache", pos: __game.player.pos.clone(), items: G.pages, label: "测试", glyph: "物" });
    for (const s of box.slots) s.state = "shown";
    C.takeAll(box);
    // 旧存档状态：练一层却装着玉佩（局内储物袋曾不查解锁）
    if (r.bag.items.includes(G.jade)) r.bag.remove(G.jade.uid);
    P.equip.jade = G.jade;
    return { storage: P.storage.count("danfang_page"), bag: r.bag.count("danfang_page"), tiles: r.bag.items.filter((x) => x.id === "danfang_page").length, toast: [...document.querySelectorAll(".mk-toasts > *")].map((e) => e.textContent).join(" | "), desc: G.items.ITEMS.danfang_page.desc };
  });
  ok(before.bag === 3 && before.tiles === 1, "局内拾得 3 张残页：储物袋里堆成一格 ×3", before);
  ok(/丹方残页 3\/5 · 集齐后到洞府仓库研读（得丹方《聚气丹》）/.test(before.toast), "拾得残页提示\"丹方残页 3/5\"并写明去处与所得", before.toast);
  ok(/集齐 5 页可在洞府仓库研读/.test(before.desc) && /聚气丹 → 护脉丹 → 筑基丹/.test(before.desc), "残页说明从数据生成（页数、顺序）", before.desc);
  await page.keyboard.press("Tab");
  await c.wait(400);
  const pgBox = await c.ev(() => {
    const t = [...document.querySelectorAll(".mk-bagui .bv-grid .mk-tok")].find((e) => e._inst && e._inst.id === "danfang_page");
    if (!t) return null;
    const b = t.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (pgBox) await page.mouse.click(pgBox.x, pgBox.y);
  await c.wait(300);
  const tipPg = await c.ev(() => (document.querySelector(".mk-bagui .bv-tip .page-hint") || {}).textContent || null);
  ok(tipPg && tipPg.includes("丹方残页 3/5"), "储物袋浮签显示残页进度", tipPg);
  await page.keyboard.press("Tab");
  await c.wait(200);
  const keep = await c.ev(() => {
    const G = window.__sp;
    const mk = (L) => ({ realm: { stage: 1, layer: L }, unlocks: {}, flags: {} });
    return { l1: G.loot.gearKeepP("r1", mk(1)), l3: G.loot.gearKeepP("r1", mk(3)), l5: G.loot.gearKeepP("r1", mk(5)), none: G.loot.gearKeepP("r1", null) };
  });
  ok(keep.l1 > 0.6 && keep.l1 < 0.75 && keep.l3 < 1 && keep.l3 > keep.l1 && keep.l5 === 1 && keep.none === 1, "未解锁栏位的份额只转一半：练一随机装备保留约 68%，练五起 100%", keep);
  await c.ev(() => __game.debug.extract());
  await waitFor(() => __game.flow.name === "result", null, 30000);
  await c.wait(1200);
  const after = await c.ev(() => __game.flow.profile.storage.count("danfang_page"));
  ok(after === before.storage + 3, "撤离成功：仓库残页 +3（与局内一致）", { before: before.storage, after });

  await c.ev(async () => { await __game.flow.go("cave", { from: "result", result: {} }); });
  await waitFor(() => __game.flow.name === "cave" && window.__game.flow.scenes && document.querySelector(".cv-toasts, .cv-root, body"), null, 90000);
  await waitFor(() => window.__cave && __cave.active && !document.querySelector(".cv-loading"), null, 90000);
  await waitFor(() => document.querySelectorAll(".cv-toasts > *").length > 0, null, 15000).catch(() => {});
  await c.wait(500);
  const cave = await c.ev(() => {
    const P = __game.flow.profile, G = window.__sp;
    return {
      jade: !!P.equip.jade,
      inStorage: P.storage.items.some((x) => x.uid === G.jade.uid),
      toast: [...document.querySelectorAll(".cv-toasts > *")].map((e) => e.textContent).join(" | "),
      pages: P.storage.count("danfang_page"),
    };
  });
  ok(!cave.jade && cave.inStorage && cave.toast.includes(unlockText.jade), "旧存档：未解锁却装着玉佩 → 进洞府退回仓库并提示", cave);
  ok(cave.pages === after, "进洞府后仓库残页数不变", cave.pages);
  const caveEq = await c.ev(() => {
    return import("/src/game/cave/facilities.js").then((F) => {
      const P = __game.flow.profile, G = window.__sp;
      const r = F.equip(P, G.jade.uid);
      return { ok: r.ok, why: r.why };
    });
  });
  ok(!caveEq.ok && caveEq.why === unlockText.jade, "洞府仓库装备玉佩：同一句未解锁提示", caveEq);

  // ---------------- 4b. 丹方残页：集齐 5 页研读，按 聚气 → 护脉 → 筑基 给还没有的；都有了只能化灵 ----------------
  const pg = await c.ev(async () => {
    const G = window.__sp, P = __game.flow.profile, F = await import("/src/game/cave/facilities.js"), GF = await import("/src/game/gongfa.js");
    const R = (P.flags.recipes = P.flags.recipes || {});
    for (const k of ["juqi", "humai", "zhuji", "danfang_juqi", "danfang_humai", "danfang_zhuji", "丹方《聚气丹》", "丹方《护脉丹》", "丹方《筑基丹》"]) delete R[k];
    for (const id of ["danfang_juqi", "danfang_humai", "danfang_zhuji"]) P.storage.count(id) && P.storage.consume(id, P.storage.count(id));
    const have0 = P.storage.count("danfang_page");
    const entry = () => F.studyList(P).find((e) => e.key === "danfang_page");
    const e3 = entry();
    const hint3 = GF.pageHint(P, "danfang_page").text;
    P.storage.add(G.items.makeItem("danfang_page", { n: 5 - have0 }));
    const e5 = entry();
    const todo = F.todos(P).map((t) => t.text).join(" | ");
    const r1 = F.study(P, "danfang_page");
    const got1 = { juqi: !!R.juqi, left: P.storage.count("danfang_page") };
    // 已在仓库里的护脉丹方也算拥有 → 下一本跳到筑基
    P.storage.add(G.items.makeItem("danfang_humai"));
    P.storage.add(G.items.makeItem("danfang_page", { n: 5 }));
    const e2 = entry();
    F.study(P, "danfang_page");
    const all = { zhuji: !!R.zhuji, e: entry() ? entry().name : null, hint: GF.pageHint(P, "danfang_page").text, hua: P.storage.count("danfang_page") ? null : (P.storage.add(G.items.makeItem("danfang_page", { n: 2 })), F.canHuaLing(P.storage.items.find((x) => x.id === "danfang_page"))) };
    all.e = entry() ? entry().name : null;
    all.hint = GF.pageHint(P, "danfang_page").text;
    return { have0, e3: e3 && { name: e3.name, ready: e3.ready }, hint3, e5: e5 && { name: e5.name, ready: e5.ready }, todo, r1: !!r1, got1, e2: e2 && e2.name, all };
  });
  ok(pg.e3 && pg.e3.name === "丹方《聚气丹》" && !pg.e3.ready && /丹方残页 3\/5/.test(pg.hint3), "仓库 3 页：可研读目标是聚气丹方，尚未集齐", pg);
  ok(pg.e5 && pg.e5.ready && /可参悟 丹方《聚气丹》/.test(pg.todo), "集齐 5 页：今日可办自动列出", pg.todo);
  ok(pg.r1 && pg.got1.juqi && pg.got1.left === 0, "研读：消耗 5 页，学会聚气丹", pg.got1);
  ok(pg.e2 === "丹方《筑基丹》" && pg.all.zhuji, "仓库已有护脉丹方 → 下一本给筑基丹方", pg);
  ok(pg.all.e === null && /都已有 · 丹方残页只能化灵/.test(pg.all.hint) && pg.all.hua === true, "三本都有：残页不再可研读，只能化灵，提示随之变化", pg.all);
  await c.shot("cave_back");

  // ---------------- 5. 栏位开启送基础款 ----------------
  const gift1 = await c.ev(async () => {
    const G = window.__sp, P = __game.flow.profile, F = await import("/src/game/cave/facilities.js");
    G.F = F;
    __game.debug.realm(1, 2);
    G.stash = P.storage.items.filter((x) => ["robe", "jade"].includes((G.items.ITEMS[x.id] || {}).slot));
    for (const it of G.stash) P.storage.remove(it.uid);
    P.equip.robe = P.equip.jade = null;
    P.flags.slotGift = {};
    P.xp = G.prog.xpNeed(P);
    window.__cave.breakthrough();
    return { realm0: "1:2" };
  });
  await c.wait(1800);
  const g1 = await c.ev(() => {
    const P = __game.flow.profile, H = P.stats.breakHistory || [], last = H[H.length - 1] || {};
    const fx = document.querySelector(".cv-break");
    return {
      realm: P.realm.stage + ":" + P.realm.layer, robe: P.equip.robe && P.equip.robe.id, q: P.equip.robe && P.equip.robe.rarity,
      hist: (last.grants || []).filter((g) => g.kind === "item").map((g) => g.id), fx: fx ? fx.textContent.includes("粗布衣") : null, flag: P.flags.slotGift && P.flags.slotGift.robe,
    };
  });
  ok(g1.realm === "1:3" && g1.robe === "robe_cu" && g1.q === 0 && g1.hist.includes("robe_cu") && g1.fx && g1.flag, "突破 1:2→1:3：送凡品粗布衣并穿上，突破演出与突破史写\"得 粗布衣\"", g1);
  await c.shot("gift_break");
  await c.ev(() => { const b = document.querySelector('.cv-break [data-id="break-done"]'); b && b.click(); });
  await c.wait(600);
  const g2 = await c.ev(async () => {
    const G = window.__sp, P = __game.flow.profile;
    __game.debug.realm(1, 2);
    const bu = G.loot.makeGear("robe_bu", 0, 1, { identified: !0 });
    P.equip.robe = null;
    P.storage.add(bu);
    P.flags.slotGift = {};
    P.xp = G.prog.xpNeed(P);
    window.__cave.breakthrough();
    await new Promise((r) => setTimeout(r, 1500));
    const b = document.querySelector('.cv-break [data-id="break-done"]');
    b && b.click();
    const cu = P.storage.items.filter((x) => x.id === "robe_cu").length + (P.equip.robe && P.equip.robe.id === "robe_cu" ? 1 : 0);
    return { realm: P.realm.stage + ":" + P.realm.layer, giftCount: cu, hasBu: P.storage.items.includes(bu), flag: P.flags.slotGift.robe };
  });
  ok(g2.realm === "1:3" && g2.hasBu && g2.flag && g2.giftCount <= 1, "仓库已有法衣（布法衣）：突破不再送", g2);
  const g3 = await c.ev(async () => {
    const G = window.__sp, P = __game.flow.profile, F = G.F;
    __game.debug.realm(1, 5);
    for (const it of P.storage.items.filter((x) => ["robe", "jade"].includes((G.items.ITEMS[x.id] || {}).slot))) P.storage.remove(it.uid);
    P.equip.robe = P.equip.jade = null;
    P.flags.slotGift = {};
    document.querySelectorAll(".cv-toasts > *").forEach((e) => e.remove());
    window.__cave.exit();
    const pr = window.__cave.enter();
    const now = { robe: P.equip.robe && P.equip.robe.id, jade: P.equip.jade && P.equip.jade.id };
    await pr;
    await new Promise((r) => setTimeout(r, 600));
    const toast = [...document.querySelectorAll(".cv-toasts > *")].map((e) => e.textContent).join(" | ");
    // 再清空一次：同一个存档不再补发
    P.equip.robe = P.equip.jade = null;
    const again = F.fillSlotGifts(P);
    return { ...now, toast, again: again.length };
  });
  ok(g3.robe === "robe_cu" && g3.jade === "jade_su" && /栏位已开/.test(g3.toast) && g3.again === 0, "旧存档（练五、两栏空着）进洞府补发粗布衣 + 素玉坠，只补一次", g3);
  await c.ev(() => {
    const G = window.__sp, P = __game.flow.profile;
    for (const it of G.stash || []) P.storage.add(it);
  });

  // ---------------- 3b. 身陨：保留规则 ----------------
  await c.ev(() => __game.flow.go("run", { region: "r1" }));
  await waitFor(() => __game.run && __game.run.state === "play", null, 120000);
  await c.wait(800);
  const d0 = await c.ev(() => {
    const G = window.__sp, r = __game.run, P = r.profile;
    G.calm();
    r.bag.clear();
    const pages = [];
    for (let i = 0; i < 800 && pages.length < 3; i++) pages.push(...G.loot.rollLoot("chest_glow", { region: "r1", profile: P }).filter((x) => x.id === "danfang_page"));
    r.collect(pages, { src: "ground" });
    return { storage: P.storage.count("danfang_page"), bag: r.bag.count("danfang_page") };
  });
  await c.ev(() => __game.debug.die());
  await waitFor(() => __game.flow.name === "result", null, 30000);
  await c.wait(800);
  const d1 = await c.ev(() => __game.flow.profile.storage.count("danfang_page"));
  ok(d0.bag === 3 && d1 - d0.storage === Math.round(3 * 0.5), "区域一身陨：3 张残页保留 round(3 × 50%) = 2（最小闭环 §5.1）", { ...d0, after: d1 });
  const r2 = await c.ev(() => {
    const G = window.__sp;
    const Bag = G.bag.Bag;
    const mk = (n) => G.items.makeItem("danfang_page", { n });
    const P = { storage: new Bag(Infinity), equip: {}, nativeArtifact: null };
    const bag = new Bag(24);
    bag.add(mk(4));
    const out = G.settle.settleDeath(P, { region: "r2", bag, carried: [], keyItems: [], protect: [] }, () => 0.99);
    const kept = P.storage.count("danfang_page"), lost = (P.lostBag && P.lostBag.items) || [];
    const lp = lost.find((x) => x.id === "danfang_page");
    const keptIt = P.storage.items.find((x) => x.id === "danfang_page");
    return { kept, lostN: lp && lp.n, sameUid: !!(lp && keptIt && lp.uid === keptIt.uid) };
  });
  ok(r2.kept === 1 && r2.lostN === 3 && !r2.sameUid, "区域二身陨：4 张保留 1（25%），其余 3 张进遗落储物袋，两部分 uid 不重复", r2);
}
