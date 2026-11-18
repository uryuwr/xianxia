// 功法体系 v2 可运行测试（docs/design/功法体系_v2.md §11）：
//   A. 7 门新 / 改法术：释放、命中、与护盾 / 首领狼威 / 读条打断 / 气势 / 剑意的交互；重（二重伤害、三重冷却）
//   B. 残页：按击杀者 / 残碑分区掉落、首领"优先未学"、提示句式、参悟（灵石、悟性补页、重复化悟性）、升重、法术栏保底赠予、来源指引与护盾缺口
// 用法：node tools/run.mjs gongfa_v2 "scene=run&region=r1"
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource && window.__skills, null, { timeout: 90000 });
  await c.wait(800);
  await page.mouse.move(640, 250);
  await c.ev(() => {
    const G = __game, P = G.player, w = G.world, T = G.THREE, S = __skills;
    G.run.clearEnemies && G.run.clearEnemies();
    G.ctx.enemies.auto = !1;
    P.debug.god = !0;
    window.__ev = { dmg: [], counter: 0, air: 0, vine: 0, walk: 0 };
    w.events.on("damage", (i) => i.attacker === P.entity && __ev.dmg.push({ id: i.target.id, amount: i.amount, spell: i.spec && i.spec.spell, el: i.element, shield: i.shieldHit ? i.shieldHit : null, tags: i.tags.slice() }));
    w.events.on("player:counter", () => __ev.counter++);
    w.events.on("skill:antiAir", () => __ev.air++);
    w.events.on("player:vinePull", () => __ev.vine++);
    w.events.on("player:earthWalk", () => __ev.walk++);
    window.__dummies = [];
    let nid = 980000;
    window.__mk = (dist, side = 0, hp = 1e6) => {
      const d = P.aimDir(new T.Vector3()), sx = -d.z, sz = d.x;
      const e = w.add({ id: ++nid, team: "enemy", pos: new T.Vector3(P.pos.x + d.x * dist + sx * side, P.pos.y, P.pos.z + d.z * dist + sz * side), radius: 0.5, height: 1.5, alive: !0, statuses: new Map(), tags: new Set(), owner: { flash() {} } });
      e.stats.setBase("hp", hp);
      e.hp = hp;
      __dummies.push(e);
      return e;
    };
    window.__clr = () => {
      for (const e of __dummies) (e.alive = !1), w.remove(e);
      __dummies = [];
      const E = G.ctx.enemies;
      for (const e of [...E.list]) (e.entity.alive = !1), w.remove(e.entity), e.dispose && e.dispose();
      E.list.length = 0;
      __ev.dmg.length = 0;
    };
    window.__cast = (id, target) => {
      S.setLoadout({ spells: [id, null, null] });
      S.realm = "zhuji";
      S.cd = {};
      P.entity.mp = P.entity.stats.get("mp");
      S.aimOverride = target ? target.clone() : null;
      return S.castSpell(0);
    };
    window.__idle = async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const t0 = performance.now();
      while ((P.state !== "move" || S.projectiles.length || S.v2.rope || S.timers.length) && performance.now() - t0 < 4000) await sleep(30);
    };
    P.entity.stats.add({ stat: "crit", type: "more", value: -1, source: "testNoCrit" });
  });
  const sleep = (ms) => c.wait(ms);

  // ================= A. 法术 =================
  const pool = await c.ev(async () => {
    const m = await import("/src/data/skills.js");
    return Object.values(m.SPELLS).map((s) => ({ id: s.id, el: s.element, role: s.role, type: s.effect.type }));
  });
  const roles = new Set(pool.map((x) => x.el + ":" + x.role));
  const els = {};
  for (const p of pool) els[p.el] = (els[p.el] || 0) + 1;
  check("法术池 12 门、五行 × 定位不重复、每行 ≥ 2 门", pool.length === 12 && roles.size === 12 && Object.values(els).every((n) => n >= 2), { n: pool.length, els });

  // 掌心雷：连锁 + 对空打落（蝠妖）
  await c.ev(async () => {
    __clr();
    const G = __game, P = G.player, T = G.THREE;
    const d = P.aimDir(new T.Vector3());
    window.__bat = G.ctx.enemies.spawn("bat", new T.Vector3(P.pos.x + d.x * 6, P.pos.y, P.pos.z + d.z * 6), { region: "r2" });
    __bat.entity.hp = 1e6;
    __mk(7, 2.5);
    __cast("thunder", __bat.entity.pos);
  });
  await sleep(500);
  const th = await c.ev(() => ({ hits: __ev.dmg.filter((x) => x.spell === "thunder").length, air: __ev.air, stun: __bat.entity.statuses.has("stun"), flying: __bat.entity.tags.has("flying") }));
  check("掌心雷：连锁命中 ≥ 2 个、打落飞行的蝠妖（眩晕）", th.hits >= 2 && th.air >= 1 && th.stun, th);

  // 落石诀：延迟落点、眩晕、土克水盾（×2）
  await c.ev(async () => {
    __clr();
    const t = __mk(6);
    __game.ctx.shields.give(t, "water");
    window.__t = t;
    __cast("rock", t.pos);
  });
  await sleep(900);
  const rk = await c.ev(() => {
    const h = __ev.dmg.find((x) => x.spell === "rock");
    return { hit: !!h, counter: h && h.shield && h.shield.counter, stun: __t.statuses.has("stun") || (h && h.shield && __t.shield.hp <= 0) };
  });
  check("落石诀：砸中、克水盾（counter）", rk.hit && rk.counter, rk);

  // 凝锋诀：立得气势、剑意削盾 ×1.5
  const nf = await c.ev(async () => {
    __clr();
    const G = __game, P = G.player;
    P.momentum = 0;
    const cutOf = () => {
      const t = __mk(2);
      G.ctx.shields.give(t, "fire");
      t.tags.add("elite");
      const max = t.shield.max, before = t.shield.hp;
      P.chargeHit(t, { base: 1, scale: { atk: 0 }, tags: ["melee", "basic", "charge"] }, { cut: new Set(), stag: new Set(), full: !0, M: 100 });
      return { cut: before - t.shield.hp, max };
    };
    const a = cutOf();
    __cast("ningfeng");
    await new Promise((r) => setTimeout(r, 400));
    const mom = P.momentum, ic = P.entity.stats.get("intentCut");
    const b = cutOf();
    return { a, b, mom, ic };
  });
  check("凝锋诀：+35 气势、intentCut 0.5、剑意削盾 ×1.5", nf.mom >= 34.9 && Math.abs(nf.ic - 0.5) < 1e-6 && nf.b.cut > nf.a.cut * 1.4, nf);

  // 藤引：命中 → 缠绕 + 主角被拉到身前 + 气势
  const vp = await c.ev(async () => {
    __clr();
    const P = __game.player;
    await __idle();
    P.momentum = 0;
    const t = __mk(8);
    const d0 = Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
    __cast("vine_pull", t.pos);
    await new Promise((r) => setTimeout(r, 900));
    return { d0, d1: Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z), root: t.statuses.has("root"), ev: __ev.vine, mom: P.momentum, vis: P.root.visible };
  });
  check("藤引：命中缠绕、主角贴身（≤ 2.6 米）、+气势", vp.ev >= 1 && vp.root && vp.d1 < 2.6 && vp.d0 > 6 && vp.mom > 0, vp);
  await c.shot("vine_pull");

  // 止水诀：窗口内受击被化去 → 反击（水伤 + 寒冷）、+25 气势；窗口外照常挨打
  const zs = await c.ev(async () => {
    __clr();
    const G = __game, P = G.player, w = G.world;
    await __idle();
    const t = __mk(2.5);
    P.debug.god = !1;
    P.hurtUntil = 0;
    P.invulnUntil = 0;
    P.momentum = 0;
    __cast("zhishui");
    const t0 = performance.now();
    while (!__skills.v2.counter && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 10));
    const hp0 = P.entity.hp;
    const info = w.dealDamage(t, P.entity, { base: 40, noCrit: !0 });
    const hp1 = P.entity.hp;
    await new Promise((r) => setTimeout(r, 200));
    const counterHit = __ev.dmg.some((x) => x.spell === "zhishui" && x.id === t.id);
    const chill = t.statuses.has("chill") || t.statuses.has("stun");
    const mom = P.momentum;
    // 窗口外
    await new Promise((r) => setTimeout(r, 800));
    P.hurtUntil = 0;
    const hp2 = P.entity.hp;
    w.dealDamage(t, P.entity, { base: 40, noCrit: !0 });
    const hp3 = P.entity.hp;
    P.debug.god = !0;
    return { canceled: info === null && hp1 === hp0, counter: __ev.counter, counterHit, chill, mom, later: hp3 < hp2 };
  });
  check("止水诀：化去一击、反卷水浪（寒冷）、+25 气势；窗口外照常受伤", zs.canceled && zs.counter === 1 && zs.counterHit && zs.chill && zs.mom >= 24.9 && zs.later, zs);

  // 火鸦：自行扑击附近敌人（不用瞄准）、附灼烧
  const fc = await c.ev(async () => {
    __clr();
    await __idle();
    const t = __mk(5, 1.5);
    __cast("fire_crow");
    await new Promise((r) => setTimeout(r, 3200));
    const n = __ev.dmg.filter((x) => x.spell === "fire_crow").length;
    return { n, burn: t.statuses.has("burn"), live: __skills.v2.crows.length };
  });
  check("火鸦：3 秒内扑击 ≥ 2 次、灼烧", fc.n >= 2 && fc.burn, fc);
  await c.shot("fire_crow");
  await sleep(3500);
  const fcEnd = await c.ev(() => ({ live: __skills.v2.crows.length, vis: __skills._v2pool.crows.filter((x) => x.mesh.visible).length }));
  check("火鸦：时限到收回（池化网格全部隐藏）", fcEnd.live === 0 && fcEnd.vis === 0, fcEnd);

  // 地行术：遁地位移（期间无敌、隐身）、落点破土眩晕
  const ew = await c.ev(async () => {
    __clr();
    const G = __game, P = G.player, T = G.THREE;
    await __idle();
    const d = P.aimDir(new T.Vector3());
    const from = P.pos.clone();
    const to = new T.Vector3(P.pos.x + d.x * 7, P.pos.y, P.pos.z + d.z * 7);
    const t = __mk(7.6);
    let midHidden = !1, inv = !1;
    const off = G.world.events.on("player:skillMove", () => ((midHidden = !P.root.visible), (inv = performance.now() / 1000 < P.invulnUntil)));
    __cast("earth_walk", to);
    const t0 = performance.now();
    while (!__ev.walk && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 30));
    await new Promise((r) => setTimeout(r, 100));
    typeof off === "function" && off();
    return { moved: Math.hypot(P.pos.x - from.x, P.pos.z - from.z), midHidden, inv, vis: P.root.visible, ev: __ev.walk, hit: __ev.dmg.some((x) => x.spell === "earth_walk"), stun: t.statuses.has("stun"), dash: P.dashCharges };
  });
  check("地行术：位移 ≥ 4.5 米、途中隐身无敌、破土命中眩晕、结束现身", ew.moved >= 4.5 && ew.midHidden && ew.inv && ew.vis && ew.ev === 1 && ew.hit && ew.stun, ew);

  // 首领：法术自带的狼威 / 读条打断值（青牙控制器）
  const bq = await c.ev(async () => {
    __clr();
    const G = __game, P = G.player, T = G.THREE;
    const q = G.ctx.enemies.spawn("qingya", new T.Vector3(P.pos.x + 8, P.pos.y, P.pos.z + 8));
    const ctrl = q.ctrl;
    if (!ctrl) return { noCtrl: !0 };
    ctrl.mode = "fight";
    if (q.entity.shield) q.entity.shield.hp = 0;
    const mk = (spell, el) => ({ attacker: P.entity, target: q.entity, tags: [], element: el, spec: { spell } });
    ctrl.chan = null;
    const rockBreaks = ctrl.onChannelHit(mk("rock", "earth"), { id: "summon_howl" });
    ctrl.chan = null;
    const thunderOne = ctrl.onChannelHit(mk("thunder", "metal"), { id: "summon_howl" });
    ctrl.chan = null;
    const qiOne = ctrl.onChannelHit(mk("sword_qi", "metal"), { id: "summon_howl" });
    const v0 = ctrl.chan.val;
    ctrl.poise = 0;
    ctrl.onHit(mk("rock", "earth"));
    const pRock = ctrl.poise;
    ctrl.poise = 0;
    G.world.events.emit("player:counter", { attacker: q.entity });
    const pCounter = ctrl.poise;
    return { rockBreaks, thunderOne, qiVal: v0, pRock, pCounter };
  });
  check("青牙：落石诀一发断长嚎（1.2 ≥ 1.0）、掌心雷单跳不断、剑气斩仍按旧值 0.34", bq.rockBreaks === !0 && bq.thunderOne === !1 && Math.abs(bq.qiVal - 0.34) < 1e-6, bq);
  check("青牙：落石诀狼威 18、止水反击 = 读招狼威 20", Math.abs(bq.pRock - 18) < 0.01 && Math.abs(bq.pCounter - 20) < 0.01, bq);

  // 重：二重伤害 +12%、三重冷却 −15%
  const zh = await c.ev(() => {
    const S = __skills, p = __game.profile;
    p.flags.gongfa = { wux: 0, zhong: { sword_qi: 2, frost: 3 } };
    const r = { d2: S.zhongDmg("sword_qi"), d1: S.zhongDmg("vine") };
    __cast("frost", null);
    r.cd = +(S.cd.Q || 0).toFixed(2);
    r.cdMax = S.cdFor(12);
    p.flags.gongfa = { wux: 0, zhong: {} };
    return r;
  });
  check("重：二重伤害 ×1.12、三重冷却 ×0.85", Math.abs(zh.d2 - 1.12) < 1e-6 && zh.d1 === 1 && Math.abs(zh.cd - zh.cdMax * 0.85) < 0.05, zh);

  // ================= B. 残页 → 参悟 → 学会 =================
  const B = await c.ev(async () => {
    const L = await import("/src/game/loot.js");
    const GF = await import("/src/game/gongfa.js");
    const F = await import("/src/game/cave/facilities.js");
    const { makeItem } = await import("/src/core/items.js");
    const { Bag } = await import("/src/core/bag.js");
    const ids = (arr) => arr.map((x) => x.id);
    const r0 = () => 0;
    const out = {};
    out.golem = ids(L.rollLoot("mob", { region: "r1", enemy: "golem", rng: r0 })).includes("scroll_rock_page");
    out.wolf = ids(L.rollLoot("mob", { region: "r1", enemy: "wolf", rng: r0 })).includes("scroll_rock_page");
    out.stele = ids(L.rollLoot("stele_miao", { region: "r1", rng: r0 }));
    out.elite = ids(L.rollLoot("elite", { region: "r1", enemy: "wolf_elite", rng: r0 })).includes("scroll_thunder_page");
    const p = { realm: { stage: 1, layer: 3 }, flags: { learned: { spells: ["sword_qi", "thunder", "rock"] } }, storage: new Bag(999, { maxItemSize: 9 }), unlocks: {}, equip: {}, stats: {} };
    out.boss = ids(L.rollLoot("boss_first", { region: "r1", boss: "qingya", profile: p, rng: Math.random })).filter((x) => x.startsWith("scroll_"));
    // 参悟流程
    const q = { realm: { stage: 1, layer: 3 }, flags: { learned: { spells: ["sword_qi"] } }, storage: new Bag(999, { maxItemSize: 9 }), unlocks: {}, equip: {}, stats: {} };
    const add = (id, n = 1) => q.storage.add(makeItem(id, { n, identified: !0 }));
    add("scroll_rock_page", 2);
    out.hint2 = GF.pageHint(q, "scroll_rock_page").text;
    out.hintBag = GF.pageHint(q, "scroll_rock_page", { items: [makeItem("scroll_rock_page", { identified: !0 })] }).text;
    const e2 = F.studyList(q).find((x) => x.key === "rock");
    out.ready2 = e2.ready;
    add("scroll_rock_page", 1);
    out.why = F.studyWhy(q, "rock");
    add("spirit_stone", 30);
    out.studied = !!F.study(q, "rock");
    out.learned = q.flags.learned.spells.includes("rock");
    out.stones = q.storage.count("spirit_stone");
    out.pagesLeft = q.storage.count("scroll_rock_page");
    // 重复化悟性
    add("scroll_rock_page", 2);
    const d = F.studyList(q).find((x) => x.key === "rock");
    out.dupWux = d.dupWux;
    out.hintDup = GF.pageHint(q, "scroll_rock_page").text;
    F.study(q, "rock");
    out.wux = GF.wuxOf(q);
    // 悟性补页：2/4 页 + 6 悟性 → 补 2 页
    q.flags.gongfa.wux = 6;
    add("scroll_thunder_page", 2);
    add("spirit_stone", 20);
    const t = F.studyList(q).find((x) => x.key === "thunder");
    out.fill = t.fill;
    out.thunderReady = t.ready;
    out.thunderStudy = !!F.study(q, "thunder");
    out.wuxAfterFill = GF.wuxOf(q);
    // 完本直接学、不花灵石
    const st0 = q.storage.count("spirit_stone");
    add("scroll_fire_crow_book", 1);
    out.bookStudy = !!F.study(q, "fire_crow");
    out.bookCost = st0 - q.storage.count("spirit_stone");
    // 升重
    q.flags.gongfa.wux = 6;
    out.zhong = GF.zhongUp(q, "rock");
    out.zhongLv = GF.zhongOf(q, "rock");
    // 法术栏保底赠予
    const g1 = { realm: { stage: 1, layer: 3 }, flags: { learned: { spells: ["sword_qi"] } }, storage: new Bag(99), unlocks: {}, equip: {}, stats: {} };
    out.fallback = F.grantRealm(g1).map((x) => x.id);
    const g2 = { realm: { stage: 1, layer: 3 }, flags: { learned: { spells: ["sword_qi", "vine"] } }, storage: new Bag(99), unlocks: {}, equip: {}, stats: {} };
    out.noFallback = GF.spellFallback(g2, "1:3");
    const g3 = { realm: { stage: 1, layer: 7 }, flags: { learned: { spells: ["sword_qi", "vine"] } }, storage: new Bag(99), unlocks: {}, equip: {}, stats: {} };
    out.fallback7 = GF.spellFallback(g3, "1:7");
    // 来源指引 / 护盾缺口
    out.srcRock = GF.gongfaSource(g2, "rock").short;
    out.srcRockLines = GF.gongfaSources("rock").map((x) => x.text);
    out.srcVine = GF.gongfaSource({ flags: { learned: { spells: [] } }, storage: new Bag(9) }, "vine").short;
    out.srcZhishui = GF.gongfaSources("zhishui").map((x) => x.text);
    const gap = GF.shieldGap(g2, "r2");
    out.gapFire = gap.find((x) => x.el === "fire");
    return out;
  });
  check("掉落：石傀掉《落石诀》残页、狼不掉；狼妖头目掉《掌心雷》残页", B.golem && !B.wolf && B.elite, B);
  check("掉落：山神庙残碑必出《落石诀》残页", B.stele.includes("scroll_rock_page"), B.stele);
  check("掉落：青牙首杀必得一本完本、优先未学（凝锋诀）", B.boss.length === 1 && B.boss[0] === "scroll_ningfeng_book", B.boss);
  check("提示句式：「残页 2/3 · 集齐后到洞府仓库参悟」，局内算上储物袋", /残页 2\/3 · 集齐后到洞府仓库参悟/.test(B.hint2) && /残页已齐/.test(B.hintBag), [B.hint2, B.hintBag]);
  check("参悟：集齐前不能参悟；灵石不够提示；付 20 灵石学会、残页用掉", !B.ready2 && /灵石 20/.test(B.why) && B.studied && B.learned && B.stones === 10 && B.pagesLeft === 0, B);
  check("重复残页：已会 → 化为悟性（2 页 = 2）", B.dupWux === 2 && B.wux === 2 && /化为悟性/.test(B.hintDup), B);
  check("悟性补页：2/4 + 6 悟性 = 补 2 页 → 学会掌心雷", B.fill === 2 && B.thunderReady && B.thunderStudy && B.wuxAfterFill === 0, B);
  check("完本：直接参悟、不花灵石", B.bookStudy && B.bookCost === 0, B);
  check("升重：6 悟性 → 落石诀二重", B.zhong.ok && B.zhongLv === 2, B.zhong);
  check("法术栏保底：练三只会剑气斩 → 赠土遁护体；已会两门不赠；练七赠落石诀", B.fallback.includes("earth_shield") && B.noFallback === null && B.fallback7 === "rock", B);
  check("来源指引：落石诀写出石傀 / 残页进度；缠藤诀写山神庙；止水诀有来源", /山神庙残碑/.test(B.srcRock) && /残页 0\/3/.test(B.srcRock) && B.srcRockLines.some((x) => /石傀/.test(x)) && /山神庙/.test(B.srcVine) && B.srcZhishui.length >= 3 && !B.srcZhishui.some((x) => /stele_|青岚山外/.test(x)), { rock: B.srcRock, lines: B.srcRockLines, vine: B.srcVine, zs: B.srcZhishui });
  check("护盾缺口：竹海·溪谷有火盾、缺水 → 列出寒冰锥 / 止水诀", B.gapFire && B.gapFire.need === "water" && !B.gapFire.ok && B.gapFire.can.map((x) => x.id).includes("zhishui") && B.gapFire.can.map((x) => x.id).includes("frost"), B.gapFire);

  const pass = R.filter(Boolean).length;
  c.log(`SUMMARY ${pass}/${R.length}`);
}
