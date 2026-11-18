// 任务4专项：真实模块/状态/生成器 + 实际左右键攻击。浏览器独占：
// RUN_MAX=1 node tools/run.mjs weapon_affixes "scene=run&region=r1"
export default async function (page, c) {
  const results = [];
  const check = (name, ok, info) => {
    results.push(!!ok);
    c.log(`${ok ? "PASS" : "FAIL"} ${name}`, JSON.stringify(info ?? null));
  };
  await page.waitForFunction(() => window.__game?.run?.state === "play" && __game.heroSource, null, { timeout: 90000 });
  const rules = await c.ev(async () => {
    const { CombatWorld, makeEntity, Stats, STATUS } = await import("/src/core/combat.js");
    const { makeItem, ITEMS, RARITY } = await import("/src/core/items.js");
    const { newProfile, saveProfile, loadProfile } = await import("/src/core/profile.js");
    const L = await import("/src/game/loot.js"), F = await import("/src/game/cave/facilities.js");
    const { FORGE } = await import("/src/data/recipes.js");
    const { WEAPON_EFFECTS, weaponAffixText } = await import("/src/data/items.js");
    const { installWeaponEffects } = await import("/src/game/skills/weapon_effects.js");
    const { installReactions, applyElemStatus } = await import("/src/game/skills/statuses.js");
    const { TRIGGERS } = await import("/src/game/skills/xinfa.js");
    const { QingyaCtrl } = await import("/src/game/enemies/bosses/qingya.js");
    const { Enemy } = await import("/src/game/enemies/enemy.js");
    const T = __game.THREE, out = [];
    const ck = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
    const effectIds = Object.keys(WEAPON_EFFECTS);
    const affix = (effect) => ({ stat: "special", type: "flag", value: WEAPON_EFFECTS[effect].name, effect });
    const bases = { sword: "sword_qingfeng", robe: "robe_bu", jade: "jade_qing", artifact: Object.keys(ITEMS).find((id) => ITEMS[id].cat === "artifact") };
    let matrices = 0, candidates = 0, invalid = [];
    for (let rarity = 0; rarity < RARITY.length; rarity++) for (const slot of Object.keys(bases)) {
      const seen = new Set(), legal = slot === "sword" && rarity >= 3;
      for (let i = 0; i < 11; i++) {
        const list = L.rollAffixes(slot, rarity, 1, () => (i + 0.5) / 11);
        const special = list.filter((a) => a.stat === "special");
        if (special.length !== (rarity >= 3 ? 1 : 0) || list.filter((a) => a.stat !== "special").length !== RARITY[rarity].affixes) invalid.push({ slot, rarity, list });
        for (const a of special) { seen.add(a.effect || a.xinfa); if (a.effect && !legal) invalid.push({ slot, rarity, a }); }
        candidates += special.length;
      }
      if (legal && (seen.size !== 11 || !effectIds.every((id) => seen.has(id)))) invalid.push({ slot, rarity, seen: [...seen] });
      if (!legal && rarity >= 3 && seen.size !== 8) invalid.push({ slot, rarity, seen: [...seen] });
      for (const id of effectIds) {
        const item = makeItem(bases[slot], { rarity, affixes: [affix(id)] });
        const active = L.gearStats(item).some((m) => m.stat === "wx_" + id && m.value > 0);
        if (active !== legal) invalid.push({ slot, rarity, active, id });
      }
      matrices++;
    }
    ck("品质×部位：普通数量不变，合法剑11个等权候选，非剑旧8项，结算双门控", matrices === 20 && candidates > 0 && !invalid.length, { matrices, candidates, invalid });
    const promoted = L.rollAffixes("sword", 3, 1, () => 0.99, 1);
    ck("旧低品特殊重铸抬档仍按真实品级过滤", promoted.some((a) => a.xinfa) && !promoted.some((a) => a.effect), promoted);
    const generated = effectIds.map((id, i) => L.makeGear("sword_qingfeng", 3, 1, { rng: () => (8 + i + 0.5) / 11 }));
    ck("正式装备生成三种奇效且不伪装心法", generated.length === 3 && generated.every((it, i) => it.affixes.some((a) => a.effect === effectIds[i] && !a.xinfa)), generated.map((it) => it.affixes));
    const seeded = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const rng = seeded(417), random = Math.random;
    const p = newProfile(97);
    p.realm = { stage: 1, layer: 7 };
    F.caveState(p).facilities.forge = 3;
    const give = (id, n, rarity = 0) => p.storage.add(makeItem(id, { n, rarity, identified: true }));
    let craftSeen = new Set(), identifySeen = new Set(), reforgeSeen = new Set(), lowBad = 0, failed = [];
    try {
      Math.random = rng; // 只覆盖同步规则测试，离开立即恢复，不跨 await / 游戏帧。
      for (const id of ["spirit_stone", "wolf_fang", "gu_fen", "dan_sui", "ling_yu", "tiejing_shi"]) give(id, 1000000, id === "tiejing_shi" ? 3 : 0);
      const rec = FORGE.find((r) => r.id === "sword");
      if (!rec) throw new Error("正式炼器法剑配方缺失");
      for (let i = 0; i < 160; i++) {
        const crafted = F.forgeCraft(p, rec);
        if (!crafted.ok || crafted.item?.rarity !== 3) failed.push(crafted);
        for (const a of crafted.item?.affixes || []) if (a.effect) craftSeen.add(a.effect);
        const unknown = makeItem("sword_qingfeng", { rarity: 3, identified: false, affixes: [] });
        F.identifyItem(unknown);
        for (const a of unknown.affixes) if (a.effect) identifySeen.add(a.effect);
      }
      const old = () => ({ stat: "special", type: "flag", value: "暴击引雷", xinfa: "crit_thunder" });
      for (const rarity of [1, 2, 3]) {
        const it = makeItem("sword_qingfeng", { rarity, identified: true, affixes: [old()] });
        for (let i = 0; i < 120; i++) {
          const r = F.reforgeRoll(p, it, 0);
          if (!r.ok) { failed.push(r); break; }
          if (rarity < 3 && r.neo.effect) lowBad++;
          if (rarity === 3 && r.neo.effect) reforgeSeen.add(r.neo.effect);
          if (!F.reforgeApply(it, 0, r.neo)) failed.push("接受重铸失败");
        }
      }
    } finally { Math.random = random; }
    ck("炼器/鉴定补生成/特殊重铸均实得三种奇效，低品旧特殊不越级", !failed.length && !lowBad && [craftSeen, identifySeen, reforgeSeen].every((s) => s.size === 3), { craft: [...craftSeen], identify: [...identifySeen], reforge: [...reforgeSeen], lowBad, failed });
    const oldItem = makeItem("robe_bu", { rarity: 3, identified: false, affixes: [{ stat: "special", type: "flag", value: "暴击引雷", xinfa: "crit_thunder" }] });
    const before = JSON.stringify(oldItem.affixes);
    F.identifyItem(oldItem);
    p.equip.sword = generated[1]; p.equip.robe = oldItem;
    const key = "moxian.save.97", saved = localStorage.getItem(key);
    try {
      saveProfile(p);
      const loaded = loadProfile(97);
      ck("真实存取档保留effect/旧雷引；鉴定不重掷旧词条", before === JSON.stringify(oldItem.affixes) && JSON.stringify(loaded.equip) === JSON.stringify(p.equip) && L.gearStats(loaded.equip.sword).some((m) => m.stat === "wx_weapon_poison") && L.gearStats(loaded.equip.robe).some((m) => m.stat === "gx_crit_thunder"), loaded.equip);
    } finally { saved === null ? localStorage.removeItem(key) : localStorage.setItem(key, saved); }
    ck("统一奇效文案包含真实触发与数值", effectIds.every((id) => weaponAffixText(affix(id)).includes("直接暴击造成气血伤害")) && weaponAffixText(affix("weapon_thunder")).includes("0.25秒"), effectIds.map((id) => weaponAffixText(affix(id))));

    // 隔离真实战斗核心，按玩法dt推进，避免高帧率/低帧率和世界其他敌人干扰精确断言。
    const w = new CombatWorld(), hero = w.add(makeEntity({ team: "player", stats: new Stats({ hp: 100000, crit: 0, spell: 20, critDmg: 1 }) }));
    const damage = [], vfx = { bursts: 0, burst() { this.bursts++; }, ring() {} };
    const sys = { hero, ctx: { world: w, vfx }, fx: { lightning() { sys.lightning++; }, popText() {}, vineAt() {} }, stats: { reactions: {} }, lightning: 0 };
    installReactions(sys);
    const off = installWeaponEffects(sys);
    w.events.on("damage", (info) => damage.push({ target: info.target.id, amount: info.amount, crit: info.crit, tags: [...info.tags] }));
    const dummy = (hp = 100000) => w.add(makeEntity({ stats: new Stats({ hp, mpRegen: 0 }) }));
    const equip = (id) => {
      hero.stats.removeSource("equip");
      if (id) hero.stats.addAll(L.gearStats(makeItem("sword_qingfeng", { rarity: 3, affixes: [affix(id)] })), "equip");
    };
    const hit = (t, spec = {}) => w.dealDamage(hero, t, { base: 240, crit: true, tags: ["melee", "basic"], ...spec });
    const procN = (t) => damage.filter((d) => d.target === t.id && d.tags.includes("weapon_proc")).length;
    const clear = (t) => { for (const id of [...t.statuses.keys()]) w.removeStatus(t, id); };
    let exclusions = [];
    for (const id of effectIds) {
      equip(id);
      for (const tags of [["spell"], ["basic", "dot"], ["basic", "reaction"], ["basic", "thunder"], ["basic", "xinfa"], ["basic", "weapon_proc"], ["artifact"]]) {
        const t = dummy(), observed = [];
        const stopObserve = w.events.on("damage", (info) => { if (info.target === t) observed.push(info); });
        let original;
        try { original = hit(t, { tags }); } finally { stopObserve(); }
        // 注入的原始命中也可能带weapon_proc；只按返回事件的对象身份剔除它。
        // 其他实际产生的事件一律计入，包括同标签的递归伤害，不靠标签隐藏真实追加。
        const extra = observed.filter((info) => info !== original);
        if (!original || !observed.includes(original) || t.statuses.size || extra.length) exclusions.push({ id, tags, observed: observed.length, extra: extra.map((info) => ({ amount: info.amount, tags: [...info.tags] })), statuses: [...t.statuses.keys()] });
      }
      const noncrit = dummy(); hit(noncrit, { crit: false, noCrit: true });
      const dead = dummy(1); hit(dead);
      const shield = dummy(); const stop = w.events.on("beforeDamage", (i) => { if (i.target === shield) i.amount = 0; }); hit(shield); stop();
      const immune = dummy(); const cancel = w.events.on("beforeDamage", (i) => { if (i.target === immune) i.cancel = true; }); hit(immune); cancel();
      if ([noncrit, dead, shield, immune].some((t) => t.statuses.size || procN(t))) exclusions.push({ id, kind: "非暴击/致死/盾/无敌" });
    }
    ck("非武器/非暴击/DOT/反应/追加/盾/致死/无敌均不触发", !exclusions.length, exclusions);
    ck("蓄势斩旧DOT注册已删除", !STATUS.ink_mark, Object.keys(STATUS));
    equip("weapon_poison");
    const poison = dummy(), first = hit(poison), pool = poison.statuses.get("weapon_poison")?.data.pool;
    w.step(0.5);
    const firstTick = damage.filter((d) => d.target === poison.id && d.tags.includes("poison"));
    const second = hit(poison, { base: 120 });
    const refreshed = poison.statuses.get("weapon_poison"), refreshOk = refreshed.stacks === 1 && refreshed.t === 0 && refreshed.data.pool === second.amount * 0.25 && refreshed.data.acc === 0;
    equip(null);
    const offTarget = dummy(); hit(offTarget);
    const tick0 = procN(poison);
    for (let i = 0; i < 61; i++) w.step(0.05);
    ck("中毒25%基础池/半秒跳/单层替换刷新；卸下后旧毒结束，新命中无毒", pool === first.amount * 0.25 && firstTick.length === 1 && refreshOk && procN(poison) - tick0 === 6 && !poison.statuses.has("weapon_poison") && !offTarget.statuses.size, { pool, firstTick, refreshOk, ticksAfterRefresh: procN(poison) - tick0, remains: poison.statuses.size });
    equip("weapon_burn");
    const burn = dummy();
    hero.stats.setBase("fire", 40);
    for (let i = 0; i < 7; i++) hit(burn);
    const bs = burn.statuses.get("burn"), burnOk = bs?.stacks === 5 && Math.abs(bs.dur - 5.6) < 1e-8;
    const beforeBurn = burn.hp; w.step(0.5);
    ck("灼烧沿用5层上限、火行时长和真实跳伤", burnOk && burn.hp < beforeBurn, { stacks: bs?.stacks, dur: bs?.dur, loss: beforeBurn - burn.hp });
    w.dealDamage(hero, burn, { base: 1, element: "earth", noCrit: true, tags: ["spell"] });
    ck("武器灼烧仍可参与熔岩反应", sys.stats.reactions["熔岩"] === 1 && !burn.statuses.has("burn"), sys.stats.reactions);
    equip(null);
    const spellBurn = dummy(); applyElemStatus(w, hero, spellBurn, { id: "burn", stacks: 3, dur: 5 });
    ck("原法术灼烧无需武器奇效仍能施加", spellBurn.statuses.get("burn")?.stacks === 3);
    clear(burn); clear(spellBurn); hero.stats.setBase("fire", 0);

    equip("weapon_thunder");
    const thunder = dummy(); hit(thunder);
    const extra = damage.filter((d) => d.target === thunder.id && d.tags.includes("weapon_proc"));
    const stun = thunder.statuses.get("stun");
    const thunderOk = extra.length === 1 && extra[0].amount === 27 && !extra[0].crit && stun?.dur === 0.5 && stun.data.tag === "weapon_proc";
    hit(thunder); const immediately = procN(thunder);
    w.step(0.25); hit(thunder); const afterQuarter = procN(thunder), tQuarter = stun.t;
    w.step(0.3); hit(thunder); const blocked = !thunder.statuses.has("stun");
    w.step(8); hit(thunder);
    ck("金伤15+法力×0.6/不暴击/0.25秒伤害间隔/0.5秒麻痹/同目标8秒", thunderOk && immediately === 1 && afterQuarter === 2 && tQuarter === 0.25 && blocked && thunder.statuses.has("stun"), { extra, immediately, afterQuarter, tQuarter, blocked });
    w.step(0.3);
    const killedByThunder = dummy(250); hit(killedByThunder);
    ck("雷伤致死后不再施加麻痹", !killedByThunder.alive && !killedByThunder.statuses.has("stun"), { hp: killedByThunder.hp, procs: procN(killedByThunder) });
    w.step(0.3);
    const merge = dummy(); w.applyStatus(merge, "stun", { dur: 1.2, data: { tag: "charge", _allow: true, _poised: true } }); merge.statuses.get("stun").t = 1.1; hit(merge);
    ck("旧长眩晕只保留剩余时间，麻痹不继承charge/旧放行", merge.statuses.get("stun")?.dur === 0.5 && merge.statuses.get("stun").data.tag === "weapon_proc" && !merge.statuses.get("stun").data._allow, merge.statuses.get("stun")?.data);
    w.step(0.3);
    const boss = dummy(); let ccCalls = 0, permit = false;
    const owner = { def: { ccMode: "poise" }, entity: boss, pos: boss.pos, state: "windup", atk: { channel: false }, cool: {}, kv: new T.Vector3(), vel: new T.Vector3(), flinchCd: 0, animate() {}, updatePhases() {}, finish() {}, endAttack() { this.atk = null; } };
    owner.ctrl = { onCC(id, dur, info) { ccCalls++; return permit ? "allow" : QingyaCtrl.prototype.onCC.call({ e: owner }, id, dur, info); } };
    boss.owner = owner;
    w.applyStatus(boss, "stun", { dur: 0.5, data: { tag: "charge", _allow: true, _poised: true } });
    const oldStun = boss.statuses.get("stun"); oldStun.t = 0.4;
    hit(boss);
    const refused = ccCalls === 1 && boss.statuses.get("stun") === oldStun && oldStun.t === 0.4 && oldStun.data.tag === "charge";
    w.removeStatus(boss, "stun"); w.step(0.3); hit(boss);
    const refusedEmpty = ccCalls === 2 && !boss.statuses.has("stun");
    permit = true; w.step(0.3); hit(boss);
    const accepted = ccCalls === 3 && boss.statuses.has("stun");
    Enemy.prototype.update.call(owner, 0.01, hero);
    ck("青牙真实裁决拒绝麻痹不借旧charge放行/不留新stun/不记8秒CD；成功只裁决一次", refused && refusedEmpty && accepted && ccCalls === 3 && boss.statuses.get("stun")?.data._poised && boss.statuses.get("stun")?.data._allow, { refused, refusedEmpty, accepted, ccCalls });
    w.step(0.3);
    const offOld = TRIGGERS.critThunder(sys), both = dummy(); hit(both);
    const bothHits = damage.filter((d) => d.target === both.id && d.tags.includes("thunder"));
    ck("旧雷引与新武器雷独立各触发一次、无递归", bothHits.length === 2 && bothHits.filter((d) => d.tags.includes("xinfa")).length === 1 && sys.lightning === 1, bothHits);
    offOld(); off();
    ck("新雷击使用burst而非旧lightning", vfx.bursts > 0 && sys.lightning === 1, { bursts: vfx.bursts, oldLightning: sys.lightning });
    return out;
  });
  for (const r of rules) check(r.name, r.ok, r.detail);

  // 真实左右键路径：SkillSystem只注册一次、真实装备同步、横扫/剑气/余波都能施毒。
  await page.mouse.move(640, 220);
  await c.ev(async () => {
    const G = __game, P = G.player, h = P.entity, S = G.ctx.skills;
    const { makeItem } = await import("/src/core/items.js");
    G.run.clearEnemies(); G.ctx.enemies.auto = false; P.debug.god = true;
    window.__wa = { targets: [], rows: [], charges: 0, saved: { equip: { ...G.profile.equip }, build: { ...G.profile.build, xinfa: [...G.profile.build.xinfa] }, realm: { ...G.profile.realm } } };
    const A = __wa;
    G.profile.realm = { stage: 2, layer: 1 };
    G.profile.equip = { sword: makeItem("sword_qingfeng", { rarity: 3, identified: true, affixes: [{ stat: "special", type: "flag", value: "中毒", effect: "weapon_poison" }] }), robe: null, jade: null, artifact: null };
    G.profile.build.xinfa = [];
    G.ctx.applyProfileStats(G.profile);
    S.setLoadout({ artifact: { id: "none", level: 1 }, xinfa: [] });
    h.stats.addAll([{ stat: "crit", type: "flat", value: 2 }, { stat: "mom_wave", type: "flat", value: 1 }], "weaponScenario");
    A.listeners = G.world.events.m.get("damage").length;
    for (let i = 0; i < 4; i++) G.ctx.applyProfileStats(G.profile);
    A.listenersAfter = G.world.events.m.get("damage").length;
    A.offDamage = G.world.events.on("damage", (info) => {
      if (info.attacker !== h || !A.targets.includes(info.target)) return;
      A.rows.push({ id: info.target.id, tags: [...info.tags], crit: info.crit, amount: info.amount, poison: info.target.statuses.has("weapon_poison") });
    });
    A.offCharge = G.world.events.on("player:charge", () => A.charges++);
    A.reset = (momentum) => {
      for (const e of A.targets) { for (const id of [...e.statuses.keys()]) G.world.removeStatus(e, id); e.alive = false; G.world.remove(e); }
      A.targets = []; A.rows = [];
      const d = P.aimDir(new G.THREE.Vector3());
      for (const dist of [2, momentum === 50 ? 3.6 : 7.3]) {
        const e = G.world.add({ id: 970000 + Math.random(), team: "enemy", pos: P.pos.clone().addScaledVector(d, dist), radius: 0.5, height: 1.5, alive: true, statuses: new Map(), tags: new Set(), hp: 1e7, owner: { flash() {} } });
        e.stats.setBase("hp", 1e7); A.targets.push(e);
      }
      P.momentum = momentum;
    };
    A.reset(0);
  });
  try {
    const once = await c.ev(() => ({ before: __wa.listeners, after: __wa.listenersAfter, marker: __game.player.entity.stats.get("wx_weapon_poison") }));
    check("重复同步装备不重复注册奇效监听", once.before === once.after && once.marker > 0, once);
    await page.mouse.down({ button: "left" });
    try { await page.waitForFunction(() => __wa.rows.some((r) => r.tags.includes("basic") && r.poison), null, { timeout: 12000 }); }
    finally { await page.mouse.up({ button: "left" }); }
    check("真实左键普攻暴击施毒", await c.ev(() => __wa.rows.some((r) => r.tags.includes("basic") && r.crit && r.poison)), await c.ev(() => __wa.rows));
    for (const momentum of [50, 100]) {
      await page.waitForFunction(() => __game.player.state === "move" && !__game.player.waves.length, null, { timeout: 15000 });
      await c.ev((m) => __wa.reset(m), momentum);
      await page.mouse.click(640, 220, { button: "right" });
      await page.waitForFunction(() => __wa.rows.some((r) => r.tags.includes("aftershock")), null, { timeout: 15000 });
      const rows = await c.ev(() => __wa.rows);
      const direct = rows.filter((r) => r.tags.includes("charge") && !r.tags.includes("dot"));
      const parts = [direct.some((r) => !r.tags.includes("wave") && !r.tags.includes("aftershock") && r.poison), direct.some((r) => r.tags.includes("wave") && !r.tags.includes("aftershock") && r.poison), direct.some((r) => r.tags.includes("aftershock") && r.poison)];
      check(`真实右键${momentum}势横扫/剑气/余波均可触发武器中毒`, direct.length >= 3 && parts.every(Boolean), { parts, direct });
    }
    const unequip = await c.ev(() => {
      const G = __game, h = G.player.entity;
      G.profile.equip.sword = null; G.ctx.applyProfileStats(G.profile);
      __wa.reset(0);
      G.world.dealDamage(h, __wa.targets[0], { base: 100, crit: true, tags: ["melee", "basic"] });
      return { marker: h.stats.get("wx_weapon_poison"), poison: __wa.targets[0].statuses.has("weapon_poison") };
    });
    check("真实卸装同步后不再施加奇效", unequip.marker === 0 && !unequip.poison, unequip);
  } finally {
    await c.ev(() => {
      const G = __game, A = __wa;
      A.offDamage(); A.offCharge();
      G.player.entity.stats.removeSource("weaponScenario");
      for (const e of A.targets) { for (const id of [...e.statuses.keys()]) G.world.removeStatus(e, id); e.alive = false; G.world.remove(e); }
      Object.assign(G.profile, A.saved); G.ctx.applyProfileStats(G.profile);
      delete window.__wa;
    });
  }
  c.log(`SUMMARY ${results.filter(Boolean).length}/${results.length}`);
  if (results.some((ok) => !ok)) throw new Error("武器奇效专项存在失败断言");
}
