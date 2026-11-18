// 内容与数据（模块 D）可运行测试：物品注册、掉落表、保底与机缘值、境界数据、各敌人出招 / 死亡掉落、Boss 多段护盾、截图。
// 运行：node tools/run.mjs loop_content
export default async function (page, c) {
  // 并行开发时其他模块不断改文件，Vite 热更新会整页刷新打断测试：把 HMR 的 WebSocket 换成静默的假连接，再重载一次
  await page.routeWebSocket(/.*/, () => {});
  await page.reload();
  await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 180000 });
  const R = [];
  const check = (name, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + name, info === undefined ? "" : JSON.stringify(info));
  };

  // ---------------- 1. 物品、配方、掉落表的引用完整性 ----------------
  const data = await c.ev(async () => {
    const I = await import("/src/core/items.js");
    const DB = await import("/src/data/items_db.js");
    const RC = await import("/src/data/recipes.js");
    const LT = await import("/src/data/loot.js");
    const missing = [];
    const need = (id, where) => id && !I.ITEMS[id] && missing.push(where + ":" + id);
    for (const d of DB.ITEM_DEFS) if (!I.ITEMS[d.id]) missing.push("unregistered:" + d.id);
    for (const r of [...RC.ALCHEMY, ...RC.FORGE]) {
      need(r.out, "recipe.out " + r.id);
      need(r.recipe, "recipe.recipe " + r.id);
      for (const id of Object.keys(r.inputs || {})) need(id, "recipe.in " + r.id);
    }
    for (const f of Object.values(RC.FACILITIES)) for (const c of f.cost) for (const id of Object.keys((c && c.items) || {})) need(id, "facility");
    for (const [k, s] of Object.entries(RC.GARDEN.seeds)) need(k, "seed"), need(s.herb, "seed.herb");
    const walk = (list, w) => list.forEach((e) => (need(e.item, w), need(e.gearBase, w), (e.pick || []).forEach((p) => need(p[0], w))));
    for (const [k, l] of Object.entries(LT.SOURCES)) walk(l, "source " + k);
    for (const [k, r] of Object.entries(LT.REGION_LOOT)) {
      for (const pool of ["common", "rare", "glow"]) (r[pool] || []).forEach((p) => need(p[0], k + "." + pool));
      (r.gearBases || []).forEach((id) => need(id, k + ".gear"));
      (r.jackpot || []).forEach((id) => need(id, k + ".jackpot"));
      Object.values(r.mobMats || {}).flat().forEach((id) => need(id, k + ".mobMats"));
    }
    for (const [k, b] of Object.entries(LT.BOSSES)) walk([...b.first, ...b.repeat], "boss " + k);
    for (const [k, b] of Object.entries(LT.RUINS)) walk(b.first, "ruin " + k);
    for (const [k, l] of Object.entries(LT.GATHER)) if (Array.isArray(l)) walk(l, "gather " + k);
    Object.values(LT.CORE_OF).forEach((id) => need(id, "core"));
    const cats = {};
    for (const d of DB.ITEM_DEFS) cats[d.cat] = (cats[d.cat] || 0) + 1;
    const keys = DB.ITEM_DEFS.filter((d) => (d.tags || []).includes("key")).map((d) => d.id);
    return { n: DB.ITEM_DEFS.length, cats, missing, keys, alchemy: RC.ALCHEMY.length, forge: RC.FORGE.length };
  });
  check("items registered & all table references resolve", data.missing.length === 0 && data.n > 60, data);
  check("key items tagged (G3)", ["bilin_core", "heshouwu", "zhuji_dan", "art_flying_sword"].every((k) => data.keys.includes(k)), data.keys);

  // ---------------- 2. rollLoot：每个来源都产出合法实例；分布大致符合 §8.6 ----------------
  const loot = await c.ev(async () => {
    const I = await import("/src/core/items.js");
    const L = await import("/src/game/loot.js");
    const srcs = ["mob", "elite", "chest_normal", "chest_glow", "chest_night", "ruin_first", "ruin_repeat", "boss_first", "boss_repeat",
      "gather_herb", "gather_ore", "gather_glow", "gather_qingling", "gather_ninglu", "gather_tiejing", "gather_hanlu", "gather_ziteng", "gather_chiyan", "gather_heshouwu", "gather_water_jade", "gather_zhuxin", "gather_zhenpan", "gather_furnace_part"];
    const bad = [], sample = {};
    for (const region of ["tutorial", "r1", "r2"])
      for (const s of srcs)
        for (let k = 0; k < 30; k++) {
          const items = L.rollLoot(s, { region, level: region === "r2" ? 6 : 2, pity: {} });
          if (!Array.isArray(items)) bad.push(s + ":notarray");
          for (const it of items) {
            const d = I.ITEMS[it.id];
            if (!d || !it.uid || !(it.n >= 1) || it.n > (d.stack || 1) || !(it.level >= 1) || !Array.isArray(it.affixes)) bad.push(s + ":" + it.id + ":" + it.n);
          }
          if (k === 0 && region === "r2") sample[s] = items.map((it) => I.ITEMS[it.id].name + (it.n > 1 ? "×" + it.n : "") + (it.rarity ? "[" + it.rarity + "]" : "") + (it.identified ? "" : "?"));
        }
    // 分布
    const N = 6000, cnt = (src, region, f) => {
      let n = 0;
      const pity = { mobNoGear: -1e9 };
      for (let i = 0; i < N; i++) if (L.rollLoot(src, { region, pity }).some(f)) n++;
      return n / N;
    };
    const isGear = (it) => I.ITEMS[it.id].cat === "gear";
    const dist = {
      mobGear: cnt("mob", "r1", isGear),
      mobStone: cnt("mob", "r1", (it) => it.id === "spirit_stone"),
      eliteCore: cnt("elite", "r1", (it) => I.ITEMS[it.id].cat === "core"),
      eliteGear: cnt("elite", "r2", isGear),
      nightGear: cnt("chest_night", "r2", isGear),
      normalGear: cnt("chest_normal", "r1", isGear),
    };
    // 宝品以上装备未鉴定、凡 / 灵已鉴定
    let idOk = !0;
    for (let i = 0; i < 300; i++) for (const it of L.rollLoot("chest_night", { region: "r2", pity: {} })) if (isGear(it) && it.identified !== it.rarity < 2) idOk = !1;
    const g = L.makeGear("sword_zhuying", 3, 7, { region: "r2" });
    return { bad: bad.slice(0, 10), nBad: bad.length, dist, idOk, sample, gear: { affixes: g.affixes, stats: L.gearStats(g) } };
  });
  check("rollLoot valid for every source × region", loot.nBad === 0, loot.nBad ? loot.bad : Object.keys(loot.sample).length);
  c.log("  r2 samples", JSON.stringify(loot.sample));
  const D = loot.dist;
  check("distribution ≈ §8.6", D.mobGear > 0.045 && D.mobGear < 0.075 && D.mobStone > 0.52 && D.mobStone < 0.68 && D.eliteCore === 1 && D.eliteGear > 0.3 && D.eliteGear < 0.4 && D.nightGear > 0.64 && D.nightGear < 0.76 && D.normalGear > 0.07 && D.normalGear < 0.13, D);
  check("宝品+ gear unidentified, 凡/灵 identified", loot.idOk);
  check("仙品 gear: 3 affixes + special + base stats", loot.gear.affixes.length === 4 && loot.gear.affixes.some((a) => a.stat === "special") && loot.gear.stats.some((m) => m.stat === "atk"), loot.gear);

  // ---------------- 3. 保底与机缘值 ----------------
  const pity = await c.ev(async () => {
    const I = await import("/src/core/items.js");
    const L = await import("/src/game/loot.js");
    // 小怪保底：计数到 25 后，下一件装备至少灵品
    const p = { mobNoGear: 40 };
    let got = null, tries = 0;
    while (!got && tries++ < 3000) got = L.rollLoot("mob", { region: "r1", pity: p }).find((it) => I.ITEMS[it.id].cat === "gear");
    const pityGear = got && { rarity: got.rarity, tags: got.tags, counter: p.mobNoGear };
    // 计数：没出好装备时 +1
    const q = { mobNoGear: 0 };
    for (let i = 0; i < 10; i++) L.rollLoot("mob", { region: "r1", pity: q, rng: () => 0.99 });
    // 机缘值：精英 +6；满了之后 Boss 必出极品并清零
    const prof = { stats: {}, flags: {} };
    L.rollLoot("elite", { region: "r1", profile: prof, rng: () => 0.99 });
    const afterElite = L.getFortune(prof).value;
    prof.stats.fortune = 100;
    const full = L.getFortune(prof).full;
    const boss = L.rollLoot("boss_repeat", { region: "r2", profile: prof, rng: () => 0.99 });
    const jp = boss.find((it) => it.rarity === 4);
    // 只给一次的灵光点
    const a = L.rollLoot("gather_furnace_part", { region: "r1", profile: prof }).map((x) => x.id);
    const b = L.rollLoot("gather_furnace_part", { region: "r1", profile: prof }).map((x) => x.id);
    return { pityGear, tries, counter10: q.mobNoGear, afterElite, full, jackpot: jp && { id: jp.id, tags: jp.tags }, fortuneAfter: prof.stats.fortune, once: [a, b], xp: [L.xpForKill("wolf", "r1"), L.xpForKill("wolf_elite", "r1"), L.xpForKill("bat", "r2"), L.xpForKill("qingya", "r1", { first: !0 }), L.xpForKill("bilin", "r2", { first: !0 }), L.xpForKill("bilin", "r2")] };
  });
  check("mob pity: 40 misses → next gear ≥ 灵品", pity.pityGear && pity.pityGear.rarity >= 1 && pity.pityGear.counter === 0, pity);
  check("pity counter counts misses", pity.counter10 === 10, pity.counter10);
  check("fortune gauge (G4): elite +6, full → boss jackpot (key), reset", pity.afterElite === 6 && pity.full && pity.jackpot && pity.jackpot.tags.includes("key") && pity.fortuneAfter === 0, pity);
  check("one-time glow (炼器鼎残件) only once", pity.once[0].includes("furnace_part") && !pity.once[1].includes("furnace_part"), pity.once);
  check("xpForKill §10.1", JSON.stringify(pity.xp) === JSON.stringify([2, 10, 6, 240, 400, 80]) /* 青牙 v2：首杀感悟 150 → 240（boss_青牙_v2.md §6.6） */, pity.xp);

  // ---------------- 4. 境界数据 ----------------
  const prog = await c.ev(async () => {
    const P = await import("/src/game/progression.js");
    const { PROGRESSION } = await import("/src/data/progression.js");
    const out = [];
    for (const k of PROGRESSION.order) {
      const [stage, layer] = k.split(":").map(Number);
      const p = { realm: { stage, layer }, xp: 0, unlocks: {}, storage: null };
      P.applyUnlocks(p);
      out.push({ k, name: P.realmName(p), need: P.xpNeed(p), spells: p.unlocks.spellSlots, pills: p.unlocks.pillSlots, art: p.unlocks.artifactSlot, hp: P.heroStats(p).hp });
    }
    const total = PROGRESSION.order.slice(1, -1).reduce((s, k) => s + PROGRESSION.xp[k], 0);
    return { out, total };
  });
  const byK = Object.fromEntries(prog.out.map((x) => [x.k, x]));
  check("realm names & xpNeed for every layer", prog.out.every((x) => x.name && x.name !== "未知" && (x.k === "2:1" || Number.isFinite(x.need))) && prog.total === 4370, { total: prog.total, names: prog.out.map((x) => x.name + ":" + x.need) });
  check("unlocks (G1): spell slots 1/2@练气三/3@练气七, artifact@练气七", byK["1:1"].spells === 1 && byK["1:2"].spells === 1 && byK["1:3"].spells === 2 && byK["1:7"].spells === 3 && !byK["1:6"].art && byK["1:7"].art && byK["2:1"].pills === 4, prog.out.map((x) => [x.k, x.spells, x.pills, x.art]));
  check("hero stats §10.2 (练气一 200 / 九 440 / 筑基 720)", byK["1:1"].hp === 200 && byK["1:9"].hp === 440 && byK["2:1"].hp === 720, [byK["1:1"].hp, byK["1:9"].hp, byK["2:1"].hp]);

  // ---------------- 5. 敌人：每种都能刷出、预警、出招、死亡掉落 ----------------
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready, null, { timeout: 60000 });
  await c.ev(async () => {
    window.__ENEMY_TYPES = (await import("/src/data/enemies.js")).ENEMY_TYPES;
    // 通用机制（节奏、召唤、狼窝、护盾段落）用不带控制器的青牙副本测；青牙 v2 的专属行为（控制器）由战斗设计的测试负责
    { const T = window.__ENEMY_TYPES, q = { ...T.qingya }; delete q.controller; delete q.ccMode; q.attacks = q.attacks.filter((a) => !a.phase || a.phase === 1).map((a) => ({ ...a, channel: !1 })); T.__qy = q; window.__enemies.templates.__qy = window.__enemies.templates.qingya; }
    const D = window.__enemies;
    D.auto = !1;
    for (const e of D.list) e.dispose();
    D.list.length = 0;
    D.tokens.clear();
    window.__log = { tele: [], strike: [], loot: [], dmg: [], killed: [], phase: [] };
    const ev = D.ctx.world.events, h = D.hero;
    ev.on("enemy:telegraph", (e) => window.__log.tele.push(e.enemy.kind + ":" + e.attack));
    ev.on("enemy:strike", (e) => window.__log.strike.push(e.enemy.kind + ":" + e.attack));
    ev.on("loot:drop", (e) => window.__log.loot.push({ type: e.type, items: e.items.map((i) => i.id), uids: e.items.every((i) => !!i.uid), xp: e.xp }));
    ev.on("enemy:killed", (e) => window.__log.killed.push(e.type));
    ev.on("enemy:phase", (e) => window.__log.phase.push(e.enemy.kind + ":" + e.element));
    ev.on("damage", (e) => e.target === h && window.__log.dmg.push(e.tags && e.tags.join(",")));
    window.__shieldT = !0; // 测试用的敌人只受测试自己的伤害（主角自动攻击不干扰）
    ev.on("beforeDamage", (i) => {
      if (window.__shieldT && i.target.team === "enemy" && !(i.spec && i.spec.test)) i.cancel = !0;
    });
    window.__T = {
      clear() {
        const D = window.__enemies;
        for (const e of D.list) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
        D.list.length = 0;
        D.tokens.clear();
        D.proj.clear();
      },
      spawn(type, dist = 4) {
        const D = window.__enemies, h = D.hero;
        const reg = window.__ENEMY_TYPES[type].region === "trial" ? undefined : window.__ENEMY_TYPES[type].region;
        const e = D.spawn(type, h.pos.clone().add(new h.pos.constructor(dist, 0, 0)), { region: reg });
        if (!e) return null;
        e.setAggro();
        for (const k in e.cool) e.cool[k] = 99;
        return e;
      },
    };
  });
  const TYPES = ["wolf", "wolf_grey", "golem", "wolf_elite", "__qy", "bat", "vine", "vine_elite", "bilin", "xinmo", "rat", "crow", "spider", "snake", "toad", "chilang", "xuanlin_bat"];
  for (const type of TYPES) {
    const r = await c.ev(async (type) => {
      const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T;
      T.clear();
      h.hp = 1e6;
      const e = T.spawn(type, 3);
      if (!e) return { err: "spawn failed" };
      const L = window.__log;
      const t0 = L.tele.length, s0 = L.strike.length;
      const res = { hp: e.entity.hp, level: e.level, region: e.region, shield: e.entity.shield && e.entity.shield.element, attacks: [] };
      // 出招测试不带护盾（主角的自动攻击会打碎护盾 → 破盾眩晕打断出招；护盾单独测）
      D.ctx.shields && D.ctx.shields.drop(e.entity);
      e.entity.shield = null;
      e.phaseIdx = 99;
      for (const a of e.def.attacks) {
        if (e.state === "dead") break;
        const dist = Math.min(a.maxDist - 0.3, Math.max(a.minDist + 0.5, 2.5));
        e.endAttack();
        e.state = "chase";
        e.pos.set(h.pos.x + dist, h.pos.y, h.pos.z);
        const d0 = L.dmg.length, n0 = D.list.length;
        e.startAttack(a, h.pos);
        await new Promise((r) => setTimeout(r, (a.windup + a.active) * 1000 + (a.shape === "projectile" ? (dist / a.speed) * 1000 + 400 : 250)));
        res.attacks.push({ id: a.id, strike: L.strike.includes(type + ":" + a.id), hit: L.dmg.length > d0, summoned: D.list.length - n0, state: e.state });
        await new Promise((r) => setTimeout(r, 300));
      }
      res.tele = L.tele.length - t0;
      res.strikes = L.strike.length - s0;
      await new Promise((r) => setTimeout(r, 400));
      // 死亡
      D.ctx.shields && D.ctx.shields.drop(e.entity);
      e.entity.shield = null;
      e.def.shieldPhases && (e.phaseIdx = 99);
      const l0 = L.loot.length;
      e.state = "chase";
      e.endAttack();
      w.dealDamage(h, e.entity, { test: !0, base: 1e7, noCrit: !0 });
      await new Promise((r) => setTimeout(r, 300));
      res.dead = !e.alive;
      res.loot = L.loot.slice(l0).find((x) => x.type === type) || null;
      res.killed = L.killed.includes(type);
      return res;
    }, type);
    const allStruck = r.attacks && r.attacks.every((a) => a.strike);
    const wantLoot = type !== "xinmo" && !["wolf", "wolf_grey", "golem", "bat", "vine", "rat", "crow", "spider", "snake", "toad"].includes(type); // 小怪不是每只都掉（§8.6），单独测
    check(`enemy ${type}: spawns, telegraphs, attacks, dies${wantLoot ? ", drops real loot" : ""}`, !r.err && allStruck && r.tele >= r.attacks.length && r.dead && r.killed && (!wantLoot || (r.loot && r.loot.items.length && r.loot.uids)), r);
  }

  // 小怪死亡掉落：连杀 12 只，应有若干次 loot:drop，且全是真实物品实例
  const mobLoot = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T, L = window.__log;
    T.clear();
    const l0 = L.loot.length;
    for (let i = 0; i < 12; i++) {
      const e = T.spawn(["wolf", "golem", "bat", "vine"][i % 4], 3);
      w.dealDamage(h, e.entity, { test: !0, base: 1e7, noCrit: !0 });
      await new Promise((r) => setTimeout(r, 30));
    }
    const drops = L.loot.slice(l0);
    return { n: drops.length, ok: drops.every((d) => d.items.length && d.uids), sample: drops.slice(0, 4) };
  });
  check("mob deaths emit loot:drop with item instances", mobLoot.n >= 4 && mobLoot.ok, mobLoot);

  // 低阶怪按栖息地选种、分区基准等级；异种只在异种点出现（光环、品级色名字、固定等级）
  const eco = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, T = window.__T, V = h.pos.constructor;
    T.clear();
    D.setRegion("r1");
    const real = D.levelPoints;
    const at = (dx, dz) => new V(h.pos.x + dx, h.pos.y, h.pos.z + dz);
    D.levelPoints = () => ({ spawns: [{ pos: at(6, 0), pack: 4, habitat: "burrow", tier: "low", baseLevel: 3 }, { pos: at(0, 0.5), pack: 4, habitat: "ruin", tier: "mid" }] });
    const low = D.spawnPack(4, !1, at(6, 0)).map((e) => e.type + "@" + e.level);
    T.clear();
    const mid = D.spawnPack(4, !1, at(0, 0.5)).map((e) => e.type);
    T.clear();
    D.levelPoints = () => ({ rares: { pick: [0, 1], chance: 1, from: [{ pos: [h.pos.x + 5, h.pos.z], sign: "scorch" }] } });
    D.rareDone = undefined;
    const r = D.spawnRares();
    const out = { low, mid, rare: r && { type: r.type, level: r.level, halo: !!r.halo, realm: D.realmLabel(r).exact, name: r.def.name } };
    const again = D.spawnRares();
    out.once = !again;
    D.levelPoints = real;
    T.clear();
    return out;
  });
  check("low tier by habitat (burrow → 山鼠妖) at spawn baseLevel; mid mixes std + low", eco.low.length >= 3 && eco.low.every((x) => x.startsWith("rat@") && Number(x.split("@")[1]) >= 3) && eco.mid.some((t) => t === "golem" || t === "wolf_grey") && eco.mid.some((t) => t === "spider" || t === "crow"), eco);
  check("rare variant at rare point: 赤狼 lv8 with halo, once per run", eco.rare && eco.rare.type === "chilang" && eco.rare.level === 8 && eco.rare.halo && eco.rare.realm === "练气八层" && eco.once, eco.rare);

  // 首领控制器钩子（青牙重做用）：pickAttack / onStartAttack / onStrike / onEndAttack / onHit 吞硬直 / 读条打断 / down 状态
  const hooks = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T, V = h.pos.constructor;
    const { ENEMY_TYPES } = await import("/src/data/enemies.js");
    T.clear();
    const log = [];
    ENEMY_TYPES.__hook = {
      ...ENEMY_TYPES.wolf,
      attacks: [{ ...ENEMY_TYPES.wolf.attacks[0], id: "chan", channel: !0, channelBreak: ["spell"], windup: 1.2 }, ENEMY_TYPES.wolf.attacks[1]],
      controller: (e) => ({
        pickAttack: (ready) => (log.push("pick:" + ready.map((a) => a.id).join("|")), ready.find((a) => a.id === "chan") || ready[0]),
        onStartAttack: (a) => log.push("start:" + a.id),
        onStrike: (a) => log.push("strike:" + a.id),
        onEndAttack: (a, i) => (log.push("end:" + a.id + (i ? "!" : "")), !1),
        onHit: (info) => (log.push("hit"), info.tags && info.tags.includes("swallow")),
        onChannelBreak: (a) => log.push("break:" + a.id),
      }),
    };
    D.templates.__hook = D.templates.wolf;
    const e = D.spawn("__hook", new V(h.pos.x + 2.5, h.pos.y, h.pos.z), { region: "r1" });
    e.setAggro("hit");
    for (let i = 0; i < 40 && !log.some((x) => x.startsWith("start:chan")); i++) await new Promise((r) => setTimeout(r, 50));
    w.dealDamage(h, e.entity, { test: !0, base: 1, tags: ["swallow"] });
    const stateAfterSwallow = e.state;
    w.dealDamage(h, e.entity, { test: !0, base: 1, tags: ["spell"] });
    const stateAfterBreak = e.state;
    e.setState("down", 1);
    const down = e.state;
    T.clear();
    delete ENEMY_TYPES.__hook;
    return { log, stateAfterSwallow, stateAfterBreak, down, heroAlive: h.alive, heroHp: Math.round(h.hp) };
  });
  check("boss controller hooks: pickAttack, onHit swallows, channel broken by spell, down state", hooks.log.some((x) => x.startsWith("pick:")) && hooks.log.includes("start:chan") && hooks.stateAfterSwallow === "windup" && hooks.log.includes("break:chan") && hooks.stateAfterBreak === "flinch" && hooks.down === "down", hooks);

  // 聚气丹方（青牙 v2：移到"区域一首次击杀狼妖头目"，once 只给一次）；斩过的首领境界永远看得清
  const juqi = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T, V = h.pos.constructor, L = window.__log;
    const LT = await import("/src/game/loot.js");
    const LD = await import("/src/data/loot.js");
    const out = { inQingya: LD.BOSSES.qingya.first.some((e) => e.item === "danfang_juqi") };
    const pf = { flags: {}, stats: {} };
    out.roll1 = LT.rollLoot("elite", { region: "r1", profile: pf }).some((i) => i.id === "danfang_juqi");
    out.roll2 = LT.rollLoot("elite", { region: "r1", profile: pf }).some((i) => i.id === "danfang_juqi");
    out.r2 = LT.rollLoot("elite", { region: "r2", profile: { flags: {}, stats: {} } }).some((i) => i.id === "danfang_juqi");
    // 真实击杀：首杀狼妖头目必得，第二只不再掉
    const saved = D.ctx.profile;
    D.ctx.profile = { ...(saved || {}), realm: { stage: 1, layer: 3 }, flags: {}, stats: {} };
    D.setRegion("r1");
    const kill = async () => {
      T.clear();
      const e = T.spawn("wolf_elite", 3);
      D.ctx.shields && D.ctx.shields.drop(e.entity);
      e.entity.shield = null;
      const l0 = L.loot.length;
      w.dealDamage(h, e.entity, { test: !0, base: 1e7, noCrit: !0 });
      await new Promise((r) => setTimeout(r, 200));
      return L.loot.slice(l0).some((x) => x.type === "wolf_elite" && x.items.includes("danfang_juqi"));
    };
    out.kill1 = await kill();
    out.kill2 = await kill();
    out.flag = !!D.ctx.profile.flags.drop_danfang_juqi;
    // 境界：斩过青牙后永远显示准确境界
    T.clear();
    D.ctx.profile.realm = { stage: 1, layer: 2 };
    const q = T.spawn("__qy", 6);
    h.stats.setBase("sense", 0);
    out.before = D.realmLabel(q).text;
    D.ctx.profile.flags.boss_qingya = !0;
    out.after = D.realmLabel(q).text;
    T.clear();
    D.ctx.profile = saved;
    return out;
  });
  check("聚气丹方：不在青牙首杀；区域一首杀狼妖头目必得、第二次不再掉；区域二不掉", !juqi.inQingya && juqi.roll1 && !juqi.roll2 && !juqi.r2 && juqi.kill1 && !juqi.kill2 && juqi.flag, juqi);
  const bossLv = await c.ev(async () => {
    const LT = await import("/src/game/loot.js");
    const lv = (layer) => {
      const pf = { realm: { stage: layer > 9 ? 2 : 1, layer: layer > 9 ? 1 : layer }, flags: {}, stats: {} };
      return LT.rollLoot("boss_first", { region: "r1", level: 4, boss: "qingya", profile: pf }).filter((i) => i.affixes && LT.gearStats && ["sword", "robe", "jade"].includes((i.id.match(/^(sword|robe|jade)/) || [])[1])).map((i) => i.level);
    };
    return { l2: lv(2), l7: lv(7), zj: lv(10), xp7: LT.xpForKill("qingya", "r1", { first: !0, layer: 7 }) };
  });
  check("青牙首杀装备按击杀者层数（练七 6–8 级，筑基不超过 区域上限 + 3 = 7）", bossLv.l7.length && bossLv.l7.every((l) => l >= 6 && l <= 8) && bossLv.zj.every((l) => l <= 7) && bossLv.l2.every((l) => l <= 3), bossLv);
  check("青牙境界练气七层：练二看是'练气?'，斩过后显示准确", juqi.before === "练气?" && juqi.after === "练气七层", juqi);

  // 弹道 / 落点 / 潜水 / 召唤 的具体效果
  const mech = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, T = window.__T, L = window.__log;
    const out = {};
    // 藤妖吐籽：弹道命中
    T.clear();
    h.hp = 1e6;
    let e = T.spawn("vine", 7);
    let d0 = L.dmg.length;
    e.startAttack(e.def.attacks.find((a) => a.id === "spit"), h.pos);
    await new Promise((r) => setTimeout(r, 900 + 200 + 1000));
    out.spitHit = L.dmg.slice(d0).some((t) => t && t.includes("spit"));
    // 藤妖地刺：落点圈在主角脚下
    e.endAttack();
    d0 = L.dmg.length;
    e.startAttack(e.def.attacks.find((a) => a.id === "thorns"), h.pos);
    out.thornCenter = e.atk.centers && +Math.hypot(e.atk.centers[0].x - h.pos.x, e.atk.centers[0].z - h.pos.z).toFixed(2);
    await new Promise((r) => setTimeout(r, 1700));
    out.thornHit = L.dmg.slice(d0).some((t) => t && t.includes("thorns"));
    // 碧鳞潜水突袭：预警期间不可被攻击，出招时出现在主角身边
    T.clear();
    e = T.spawn("bilin", 12);
    const dive = e.def.attacks.find((a) => a.id === "dive");
    e.startAttack(dive, h.pos);
    await new Promise((r) => setTimeout(r, 300));
    out.submerged = e.submerged;
    D.ctx.shields && D.ctx.shields.drop(e.entity);
    e.entity.shield = null;
    e.phaseIdx = 99;
    const hp0 = e.entity.hp;
    D.ctx.world.dealDamage(h, e.entity, { test: !0, base: 500 });
    out.invuln = e.entity.hp === hp0;
    await new Promise((r) => setTimeout(r, dive.windup * 1000));
    out.diveDist = +Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z).toFixed(2);
    out.surfaced = !e.submerged;
    // 青牙召狼
    T.clear();
    e = T.spawn("__qy", 5);
    e.startAttack({ ...e.def.attacks.find((a) => a.id === "summon_howl"), channel: !1, summon: { type: "wolf", n: 2, max: 4 } }, h.pos); // 青牙 v2 的召狼由控制器负责，这里只测通用 summon 机制
    await new Promise((r) => setTimeout(r, 2400));
    out.summoned = D.list.filter((o) => o.summoner === e && o.alive).length;
    T.clear();
    return out;
  });
  check("vine spit projectile hits", mech.spitHit, mech);
  check("target circle centred on hero & hits", mech.thornCenter < 0.6 && mech.thornHit, mech);
  check("bilin dive: untargetable while submerged, surfaces next to hero", mech.submerged && mech.invuln && mech.diveDist < 1.5 && mech.surfaced, mech);
  check("qingya howl summons wolves", mech.summoned >= 1, mech.summoned);

  // 仇恨与脱战：视野外不惊动；受击只带起 1 只同伴；离巢太远回巢（免伤 + 回血）
  const ai = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T, V = h.pos.constructor;
    T.clear();
    D.setRegion("r1");
    const pack = D.spawnPack(5, !1, new V(h.pos.x + 16, h.pos.y, h.pos.z), { types: ["wolf"] });
    await new Promise((r) => setTimeout(r, 1200));
    const out = { n: pack.length, idleAggro: pack.filter((e) => e.aggro).length, minD: +Math.min(...pack.map((e) => e.pos.distanceTo(h.pos))).toFixed(1) };
    w.dealDamage(h, pack[0].entity, { test: !0, base: 1, noCrit: !0 });
    await new Promise((r) => setTimeout(r, 200));
    out.afterHit = pack.filter((e) => e.aggro).length;
    // 回巢
    const e = pack[0];
    e.entity.hp = e.entity.stats.get("hp") * 0.5;
    e.home.set(e.pos.x + 40, e.pos.y, e.pos.z);
    await new Promise((r) => setTimeout(r, 500));
    out.state = e.state;
    const hp0 = e.entity.hp;
    w.dealDamage(h, e.entity, { test: !0, base: 30, noCrit: !0 });
    out.evaded = e.entity.hp >= hp0;
    await new Promise((r) => setTimeout(r, 1000));
    out.regen = +(e.entity.hp - hp0).toFixed(1);
    out.tokens = D.tokens.size;
    T.clear();
    return out;
  });
  check("aggro: out-of-sight pack stays idle; a hit wakes ≤ 2 (not the whole pack)", ai.n >= 4 && ai.idleAggro === 0 && ai.afterHit >= 1 && ai.afterHit <= 2, ai);
  check("leash: too far from den → returns home, evades damage, regenerates", ai.state === "return" && ai.evaded && ai.regen > 0, ai);

  // 出招节奏：大招后摇、连段后喘息（输出窗口）、大招落空踉跄、破盾眩晕
  const rh = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T, V = h.pos.constructor, ev = w.events;
    const log = { winded: [], whiff: [] };
    ev.on("enemy:winded", (e) => log.winded.push(e.enemy.kind + ":" + e.dur));
    ev.on("enemy:whiff", (e) => log.whiff.push(e.enemy.kind + ":" + e.attack));
    T.clear();
    D.setRegion("r1");
    h.hp = 1e6;
    const q = T.spawn("__qy", 4);
    D.ctx.shields && D.ctx.shields.drop(q.entity);
    q.entity.shield = null;
    q.phaseIdx = 99;
    q.chainNeed = 2;
    const out = {};
    // 1) 大招后摇：横扫收招后 recover 持续约 1.4 秒
    const sweep = q.def.attacks.find((a) => a.id === "sweep");
    q.startAttack(sweep, h.pos);
    await new Promise((r) => setTimeout(r, (sweep.windup + sweep.active) * 1000 + 100));
    out.recoverState = q.state;
    const t0 = performance.now();
    while (q.state === "recover" && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 50));
    out.recoverMs = Math.round(performance.now() - t0 + 100);
    // 2) 第二招后进入喘息
    out.afterFirst = q.state;
    q.state = "chase";
    const bite = q.def.attacks.find((a) => a.id === "bite");
    q.pos.set(h.pos.x + 3, h.pos.y, h.pos.z);
    q.startAttack(bite, h.pos);
    // 主角闪开：预警期间移出直线 → 落空踉跄
    await new Promise((r) => setTimeout(r, 150));
    const save = h.pos.clone();
    h.pos.z += 6;
    const t1 = performance.now();
    while (q.state !== "winded" && performance.now() - t1 < 6000) await new Promise((r) => setTimeout(r, 50));
    h.pos.copy(save);
    out.winded = q.state === "winded";
    const t2 = performance.now();
    while (q.state === "winded" && performance.now() - t2 < 5000) await new Promise((r) => setTimeout(r, 50));
    out.windedMs = Math.round(performance.now() - t2);
    // 3) 破盾眩晕：精英 3 秒
    T.clear();
    const el = T.spawn("wolf_elite", 4);
    D.ctx.shields.drop(el.entity);
    el.entity.shield = null;
    D.ctx.shields.give(el.entity, "wood");
    for (let i = 0; i < 60 && el.entity.shield.hp > 0; i++) w.dealDamage(h, el.entity, { test: !0, base: 300, element: "metal", noCrit: !0 });
    const st = el.entity.statuses.get("stun");
    out.eliteStun = st && st.dur;
    T.clear();
    return { ...out, log };
  });
  check("big-move recovery ≈ 1.4 s (boss), no attack meanwhile", rh.recoverState === "recover" && rh.recoverMs >= 1200 && rh.recoverMs <= 2000, rh);
  check("dodged big move → whiff stagger; 2 moves → winded (~2.25 s) with 隙", rh.log.whiff.some((x) => x.startsWith("__qy:bite")) && rh.winded && rh.windedMs >= 1800 && rh.log.winded.length >= 1, rh);
  check("shield break stun: elite 3 s", rh.eliteStun === 3, rh.eliteStun);

  // ---------------- 5b. 关卡数据接入：刷怪点 mobs、精英护盾、青牙狼窝、碧鳞五行坛 ----------------
  const lvl = await c.ev(async () => {
    const LV = await import("/src/data/levels/index.js");
    const { ENEMY_TYPES } = await import("/src/data/enemies.js");
    const D = window.__enemies, h = D.hero, T = window.__T, L = window.__log;
    const out = { unknown: [] };
    for (const k of ["r1", "r2", "tutorial"]) {
      const P = LV[k].points || {};
      for (const sp of P.spawns || []) for (const m of sp.mobs || []) if (!ENEMY_TYPES[m]) out.unknown.push(k + ":" + m);
      if (P.boss && !ENEMY_TYPES[P.boss.id]) out.unknown.push(k + ":boss " + P.boss.id);
      const LT = await import("/src/data/loot.js");
      const arr = (x) => (Array.isArray(x) ? x : (x && x.from) || []);
      for (const g of [...arr(P.gathers), ...arr(P.glows)]) if (g.kind && !LT.GATHER[g.kind]) out.unknown.push(k + ":gather " + g.kind);
    }
    const V = h.pos.constructor, at = (dx, dz) => new V(h.pos.x + dx, h.pos.y, h.pos.z + dz);
    // populate：按刷怪点 mobs 刷、精英带关卡指定护盾
    T.clear();
    D.setRegion("r2");
    const got = D.populate({ spawns: [{ pos: at(6, 0), pack: 3, mobs: ["golem", "wolf_grey"] }], elites: [{ pos: at(-6, 0), shield: ["earth"] }] });
    out.popTypes = got.map((e) => e.type);
    const el = got.find((e) => e.entity.tags.has("elite"));
    out.eliteShield = el && el.entity.shield && el.entity.shield.element;
    // spawnPack 的 center 落在关卡刷怪点上 → 自动用 mobs
    T.clear();
    const realLP = D.levelPoints;
    D.levelPoints = () => ({ spawns: [{ pos: at(6, 0), mobs: ["bat"] }], elites: [{ pos: at(6, 0), shield: ["earth"] }] });
    out.packTypes = D.spawnPack(3, !0, at(6, 0)).map((e) => e.type + ":" + (e.entity.shield ? e.entity.shield.element : "-"));
    // 青牙召狼：从 adds 狼窝冲出
    T.clear();
    D.setRegion("r1");
    const dens = [at(10, 8), at(-10, 8)];
    D.levelPoints = () => ({ boss: { id: "qingya", adds: dens } });
    const q = D.spawnBoss(at(0, 6), "__qy");
    q.setAggro();
    q.startAttack({ ...q.def.attacks.find((a) => a.id === "summon_howl"), channel: !1, summon: { type: "wolf", n: 2, max: 4 } }, h.pos);
    await new Promise((r) => setTimeout(r, 2400));
    const sm = D.list.filter((o) => o.summoner === q);
    out.smPos = sm.map((o) => [o.pos.x, o.pos.z].map((v) => +v.toFixed(1)));
    out.densPos = dens.map((d) => [d.x, d.z].map((v) => +v.toFixed(1)));
    out.qAdds = q.adds && q.adds.length;
    out.addsDist = sm.map((o) => +Math.min(...dens.map((d) => Math.hypot(d.x - o.pos.x, d.z - o.pos.z))).toFixed(1));
    // 碧鳞五行坛：火盾 → 提示水坛；站上水坛读条 2 秒 → 普攻附带水行
    T.clear();
    D.setRegion("r2");
    const shr = [{ pos: at(-8, -4), el: "water" }, { pos: at(8, -4), el: "metal" }, { pos: at(0, 8), el: "wood" }];
    D.levelPoints = () => ({ boss: { id: "bilin", shrines: shr.map((x) => x.pos) }, shrines: shr });
    const hints = [], lit = [];
    const ev = D.ctx.world.events;
    ev.on("boss:shrineHint", (e) => hints.push(e.element));
    ev.on("boss:shrine", (e) => lit.push(e.element));
    const b = D.spawnBoss(at(0, -12));
    for (const k in b.cool) b.cool[k] = 99;
    await new Promise((r) => setTimeout(r, 300));
    const save = h.pos.clone();
    h.pos.copy(shr[0].pos);
    await new Promise((r) => setTimeout(r, 2400));
    out.imbue = h.stats.get("imbue_water");
    h.pos.copy(save);
    out.hints = hints;
    out.lit = lit;
    out.hasShrines = !!D.shrines;
    D.levelPoints = realLP;
    T.clear();
    await new Promise((r) => setTimeout(r, 100));
    out.cleared = !D.shrines && h.stats.get("imbue_water") === 0;
    D.setRegion("r1");
    return out;
  });
  check("level mobs / boss / gather kinds all known", lvl.unknown.length === 0, lvl.unknown);
  check("populate: spawn-point mobs + elite shield from level", lvl.popTypes.includes("golem") && lvl.popTypes.includes("wolf_grey") && lvl.eliteShield === "earth", lvl);
  check("spawnPack at a level spawn point uses its mobs & elite shield", lvl.packTypes.length >= 2 && lvl.packTypes.slice(1).every((t) => t.startsWith("bat")) && lvl.packTypes[0].endsWith(":earth"), lvl.packTypes);
  check("qingya summons from adds dens", lvl.addsDist.length >= 1 && lvl.addsDist.every((d) => d < 2), { d: lvl.addsDist, sm: lvl.smPos, dens: lvl.densPos, adds: lvl.qAdds });
  check("bilin shrines: hint counters shield, channel lights imbue, cleared after", lvl.hasShrines && lvl.hints[0] === "water" && lvl.lit[0] === "water" && lvl.imbue > 0 && lvl.cleared, lvl);

  // ---------------- 6. Boss 多段护盾 ----------------
  const phases = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, T = window.__T;
    const COUNTER = { wood: "metal", earth: "wood", water: "earth", fire: "water", metal: "fire" };
    const run = async (type) => {
      T.clear();
      const e = T.spawn(type, 8);
      e.aggro = !1;
      e.state = "idle";
      const seq = [e.entity.shield && e.entity.shield.element];
      for (let k = 0; k < 5 && e.alive; k++) {
        const sh = e.entity.shield;
        // 用克制五行破盾
        if (sh) for (let i = 0; i < 40 && sh.hp > 0; i++) w.dealDamage(h, e.entity, { test: !0, base: 400, element: COUNTER[sh.element], noCrit: !0 });
        // 破盾后打掉 35% 气血 → 下一段护盾
        const max = e.entity.stats.get("hp");
        w.dealDamage(h, e.entity, { test: !0, base: 0, noCrit: !0 }); // 唤醒
        e.entity.hp = Math.min(e.entity.hp, e.entity.hp - max * 0.36 + 1);
        await new Promise((r) => setTimeout(r, 150));
        const nx = e.entity.shield;
        if (nx && nx.hp > 0 && nx !== sh) seq.push(nx.element);
      }
      return { seq, hp: Math.round(e.entity.hp), alive: e.alive };
    };
    return { qingya: await run("__qy"), bilin: await run("bilin"), log: window.__log.phase };
  });
  check("青牙 shields 木 → 土", JSON.stringify(phases.qingya.seq) === '["wood","earth"]', phases.qingya);
  check("碧鳞 shields 火 → 土 → 木", JSON.stringify(phases.bilin.seq) === '["fire","earth","wood"]', phases.bilin);

  // ---------------- 7. 截图：每种新敌人 + Boss 出招预警 ----------------
  const shots = [["wolf_grey", null], ["golem", "slam"], ["bat", "swoop"], ["vine", "thorns"], ["vine_elite", "thorns3"], ["__qy", "sweep"], ["bilin", "spout"], ["xinmo", "slash3"]];
  for (const [type, atk] of shots) {
    await c.ev(async ([type, atk]) => {
      const D = window.__enemies, h = D.hero, T = window.__T;
      T.clear();
      h.hp = 1e6;
      const big = type === "bilin" || type === "__qy";
      const e = T.spawn(type, big ? 6 : 3.5);
      e.yaw = e.wantYaw = Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
      await new Promise((r) => setTimeout(r, 500));
      if (atk) {
        const a = e.def.attacks.find((x) => x.id === atk);
        e.startAttack(a, h.pos);
        await new Promise((r) => setTimeout(r, a.windup * 600));
      }
    }, [type, atk]);
    await c.shot(type);
  }
  await c.ev(() => window.__T.clear());

  const errs = await c.ev(() => (window.__errors || []).length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
