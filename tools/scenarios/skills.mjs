// 构筑系统可运行测试：法术、状态、相生反应、阵法、法宝、心法、丹药、拾取、构筑面板。
// 用法：node tools/run.mjs skills
export default async function (page, c) {
  const R = [];
  const check = (name, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + name, info === undefined ? "" : JSON.stringify(info));
  };
  await c.wait(1500);
  const boot = await c.ev(() => ({ skills: !!window.__skills, bar: document.querySelectorAll(".jx-slot").length, hero: !!(window.__skills && window.__skills.hero) }));
  check("boot: skill system + skill bar", boot.skills && boot.hero && boot.bar >= 7, boot);

  // 靶子：主角正前方（画面上方）
  await c.ev(() => {
    const S = window.__skills, h = S.hero, w = S.ctx.world;
    // 关掉沙盒自动刷怪并清场：狼群会打断施法、打死主角，干扰冷却与状态检查
    const em = S.ctx.enemies;
    if (em) (em.auto = !1), em.list.forEach((e) => e.entity && e.entity.alive && (e.entity.shield && (e.entity.shield.hp = 0), w.dealDamage(null, e.entity, { base: 1e9, noCrit: !0 })));
    // 测试靶子血量极高，避免中途被打死重生成新实体
    window.__D = [S.spawnDummy({ x: h.pos.x, z: h.pos.z - 6 }, { hp: 1e7 }), S.spawnDummy({ x: h.pos.x - 1.6, z: h.pos.z - 7 }, { hp: 1e7 }), S.spawnDummy({ x: h.pos.x + 1.6, z: h.pos.z - 7 }, { hp: 1e7, respawn: !1 })];
    S.aimOverride = window.__D[0].pos.clone();
    window.__log = [];
    w.events.on("damage", (i) => window.__log.push({ t: i.target.id, a: i.amount, el: i.element, tags: i.tags.slice(), crit: i.crit }));
    S.debugAction("power");
  });
  await c.wait(300);

  // ---- 每个法术 ----
  const spells = ["sword_qi", "fire_talisman", "frost", "vine", "earth_shield"]; // v0.3 精简后的技能池
  const expectStatus = { sword_qi: "armor_break", fire_talisman: "burn", frost: "chill", vine: "root" };
  for (const id of spells) {
    await c.ev((id) => {
      const S = window.__skills, h = S.hero;
      for (const d of window.__D) for (const k of [...d.statuses.keys()]) S.ctx.world.removeStatus(d, k);
      S.setLoadout({ spells: [id, "fire_talisman", "frost"] });
      S.cd = {};
      h.mp = h.stats.get("mp");
      window.__log.length = 0;
      window.__mp0 = S.stats.mpSpent;
      S.ctx.input.tap("KeyQ");
    }, id);
    await c.wait(id === "vine" ? 1100 : 650);
    if (["fire_talisman", "frost", "vine"].includes(id)) await c.shot("spell_" + id);
    const r = await c.ev((id) => {
      const S = window.__skills, h = S.hero;
      return {
        mpUsed: Math.round(S.stats.mpSpent - window.__mp0), cd: +(S.cd.Q || 0).toFixed(2), hits: window.__log.length,
        status: window.__D.map((d) => [...d.statuses.keys()]).flat(), shield: Math.round(S.shield.amount), casts: S.stats.casts[id] || 0,
      };
    }, id);
    const dmgOk = id === "earth_shield" ? r.shield > 0 : r.hits > 0;
    check(`spell ${id}: cast, mp, cooldown, effect`, r.casts === 1 && r.mpUsed > 0 && r.cd > 0 && dmgOk, r);
    if (expectStatus[id]) check(`spell ${id}: applies ${expectStatus[id]}`, r.status.includes(expectStatus[id]) || (id === "frost" && r.status.includes("stun")), r.status);
  }

  // ---- 真气不足 ----
  const nomp = await c.ev(() => {
    const S = window.__skills;
    S.cd = {};
    S.hero.mp = 0;
    const before = S.stats.mpDenied;
    S.castSpell(0);
    return { denied: S.stats.mpDenied - before, msg: document.querySelector(".jx-barmsg").textContent };
  });
  check("mp shortage is refused with feedback", nomp.denied === 1 && /真气不足/.test(nomp.msg), nomp);
  await c.ev(() => (window.__skills.hero.mp = window.__skills.hero.stats.get("mp")));

  // ---- 五行相生反应（预置状态 + 另一行伤害）----
  const reactions = [["root", "fire", "爆燃"], ["burn", "earth", "熔岩"], ["stun", "metal", "碎甲"], ["armor_break", "water", "冰裂"], ["chill", "wood", "藤蔓"]];
  for (const [st, el, name] of reactions) {
    const r = await c.ev(([st, el, name]) => {
      const S = window.__skills, w = S.ctx.world, d = window.__D[0];
      for (const x of window.__D) for (const k of [...x.statuses.keys()]) w.removeStatus(x, k);
      w.time += 1; // 越过同一目标的反应间隔
      const before = S.stats.reactions[name] || 0;
      w.applyStatus(d, st, { stacks: st === "armor_break" ? 3 : 1, dur: 3, src: S.hero, data: { str: 1, dps: 5 } });
      w.dealDamage(S.hero, d, { base: 10, element: el });
      return { n: (S.stats.reactions[name] || 0) - before, others: window.__D.slice(1).map((x) => [...x.statuses.keys()]) };
    }, [st, el, name]);
    check(`reaction ${name} (${st} + ${el})`, r.n === 1 && (name !== "藤蔓" || r.others.flat().includes("root")), r);
    if (name === "爆燃") await c.shot("reaction_baoran");
  }
  // 冻结：寒冷叠满 3 层
  const frz = await c.ev(() => {
    const S = window.__skills, w = S.ctx.world, d = window.__D[1];
    for (const k of [...d.statuses.keys()]) w.removeStatus(d, k);
    w.applyStatus(d, "chill", { stacks: 2, src: S.hero, data: { str: 1 } });
    w.applyStatus(d, "chill", { stacks: 1, src: S.hero, data: { str: 1 } });
    return [...d.statuses.keys()];
  });
  check("chill x3 freezes (stun)", frz.includes("stun") && !frz.includes("chill"), frz);
  // 灼烧持续伤害
  const dot = await c.ev(async () => {
    const S = window.__skills, w = S.ctx.world, d = window.__D[2];
    window.__log.length = 0;
    w.applyStatus(d, "burn", { stacks: 3, dur: 3, src: S.hero, data: { str: 1, dps: 8 } });
    await new Promise((r) => setTimeout(r, 1300));
    return window.__log.filter((x) => x.tags.includes("burn")).length;
  });
  check("burn ticks damage over time", dot >= 2, dot);
  // 实战连招：缠藤 → 火符 = 爆燃
  const combo = await c.ev(async () => {
    const S = window.__skills, h = S.hero;
    for (const x of window.__D) for (const k of [...x.statuses.keys()]) S.ctx.world.removeStatus(x, k);
    S.ctx.world.time += 1;
    const before = S.stats.reactions["爆燃"] || 0;
    S.setLoadout({ spells: ["vine", "fire_talisman", "frost"] });
    S.cd = {};
    h.mp = h.stats.get("mp");
    S.castSpell(0);
    await new Promise((r) => setTimeout(r, 700));
    S.castSpell(1);
    await new Promise((r) => setTimeout(r, 700));
    return (S.stats.reactions["爆燃"] || 0) - before;
  });
  check("real combo: 缠藤诀 then 火符 → 爆燃", combo >= 1, combo);

  // ---- 阵法 ----
  for (const fm of ["sword_array", "fire_array"]) {
    const r = await c.ev(async (fm) => {
      const S = window.__skills, h = S.hero;
      S.setLoadout({ formation: fm });
      S.cd = {};
      h.mp = h.stats.get("mp");
      S.aimOverride = window.__D[0].pos.clone();
      window.__log.length = 0;
      S.ctx.input.tap("KeyT");
      await new Promise((r) => setTimeout(r, 2200));
      return { n: S.formations.length, hits: window.__log.filter((x) => x.tags.includes("formation")).length, cd: S.cd.formation > 0 };
    }, fm);
    check(`formation ${fm}: placed & ticks`, r.n >= 1 && r.hits >= 2 && r.cd, r);
    await c.shot("formation_" + fm);
  }
  const spirit = await c.ev(async () => {
    const S = window.__skills, h = S.hero;
    S.setLoadout({ formation: "spirit_array" });
    S.cd = {};
    h.mp = h.stats.get("mp");
    const cdr0 = h.stats.get("cdr"), mr0 = h.stats.get("mpRegen");
    S.aimOverride = h.pos.clone();
    S.ctx.input.tap("KeyT");
    await new Promise((r) => setTimeout(r, 500));
    return { cdr0, cdr1: h.stats.get("cdr"), mr0, mr1: h.stats.get("mpRegen"), max: S.formations.length, speed: S.cdSpeedBonus };
  });
  check("formation spirit_array: aura buffs hero inside; max 2 formations", spirit.cdr1 > spirit.cdr0 && spirit.mr1 > spirit.mr0 && spirit.max === 2 && spirit.speed > 0, spirit);

  // ---- 法宝 ----
  const sword = await c.ev(async () => {
    const S = window.__skills;
    S.setLoadout({ artifact: { id: "flying_sword", level: 3 } });
    S.aimOverride = window.__D[0].pos.clone();
    window.__log.length = 0;
    await new Promise((r) => setTimeout(r, 2500));
    const orbit = window.__log.filter((x) => x.tags.includes("sword")).length;
    S.cd = {};
    S.hero.mp = S.hero.stats.get("mp");
    window.__log.length = 0;
    S.ctx.input.tap("KeyV"); // 法宝：V（右键改为蓄势斩）
    await new Promise((r) => setTimeout(r, 900));
    return { swords: S.artifact.swords.length, orbit, volley: window.__log.filter((x) => x.tags.includes("sword")).length, cd: S.cd.artifact > 0 };
  });
  check("artifact 青冥飞剑: 3 swords at 祭炼3, orbit auto-hits, V volley", sword.swords === 3 && sword.orbit >= 1 && sword.volley >= 1 && sword.cd, sword);
  await c.shot("artifact_sword");
  for (const id of ["seal", "gourd"]) {
    const r = await c.ev(async (id) => {
      const S = window.__skills, h = S.hero;
      const def0 = h.stats.get("def"), mp0 = h.stats.get("mp");
      S.setLoadout({ artifact: { id, level: 2 } });
      const def1 = h.stats.get("def"), mp1 = h.stats.get("mp");
      S.cd = {};
      h.mp = h.stats.get("mp");
      h.hp = h.stats.get("hp") * 0.5;
      const hp0 = h.hp;
      // 葫芦需要敌人在 6 米内
      if (id === "gourd") for (const [i, d] of window.__D.entries()) d.pos.set(h.pos.x + (i - 1) * 2, d.pos.y, h.pos.z - 4);
      window.__log.length = 0;
      S.ctx.input.tap("KeyV"); // 法宝：V（右键改为蓄势斩）
      await new Promise((r) => setTimeout(r, id === "seal" ? 900 : 1700));
      return { def0, def1, mp0, mp1, hits: window.__log.filter((x) => x.tags.includes("artifact")).length, stun: window.__D.some((d) => d.statuses.has("stun")), healed: Math.round(h.hp - hp0) };
    }, id);
    if (id === "seal") check("artifact 镇山印: passive def, slam stuns", r.def1 > r.def0 && r.hits >= 1 && r.stun, r);
    else check("artifact 紫金葫芦: passive mp, drain heals", r.mp1 > r.mp0 && r.hits >= 3 && r.healed > 0, r);
    await c.shot("artifact_" + id);
  }

  // ---- 心法 ----
  const xf = await c.ev(async () => {
    const S = window.__skills, h = S.hero, w = S.ctx.world;
    const hp0 = h.stats.get("hp"), fire0 = h.stats.get("fire");
    S.setLoadout({ xinfa: ["kill_mp", "vajra", "fire_root", "crit_thunder", "sharp"] });
    const hp1 = h.stats.get("hp"), fire1 = h.stats.get("fire");
    // 雷引：强制暴击
    window.__log.length = 0;
    w.dealDamage(h, window.__D[1], { base: 5, crit: !0 });
    const thunder = window.__log.filter((x) => x.tags.includes("thunder")).length;
    // 斩敌回气（已废弃：用户要求击杀不回真气，应当不回）
    h.mp = 0;
    const d = window.__D[2];
    w.dealDamage(h, d, { base: 1e9 });
    const mp = h.mp;
    S.setLoadout({ xinfa: ["kill_mp"] });
    return { hp0, hp1, fire0, fire1, thunder, mp: Math.round(mp), back: h.stats.get("hp") === hp0 };
  });
  check("心法: mods apply & remove, 雷引 on crit, 斩敌回气已废弃（击杀不回真气）", xf.hp1 > xf.hp0 && xf.fire1 > xf.fire0 && xf.thunder === 1 && xf.mp === 0 && xf.back, xf);

  // ---- 剑影（模拟闪身事件）----
  const shadow = await c.ev(async () => {
    const S = window.__skills, h = S.hero, w = S.ctx.world;
    S.setLoadout({ xinfa: ["dash_shadow"] });
    window.__D[1].pos.set(h.pos.x + 1, window.__D[1].pos.y, h.pos.z);
    window.__log.length = 0;
    w.events.emit("player:dash", { from: h.pos.clone() });
    await new Promise((r) => setTimeout(r, 900));
    S.setLoadout({ xinfa: ["kill_mp"] });
    return window.__log.filter((x) => x.tags.includes("xinfa")).length;
  });
  check("心法 剑影: dash leaves exploding sword shadow", shadow >= 1, shadow);

  // ---- 丹药与拾取 ----
  const pot = await c.ev(async () => {
    const S = window.__skills, h = S.hero;
    h.mp = 0;
    S.ctx.input.tap("Digit1");
    await new Promise((r) => setTimeout(r, 200));
    const mp1 = h.mp;
    h.mp = 0;
    const orbs0 = S.orbs.length;
    // 回气光球已取消（真气不随拾取回复）；回血光球仍可拾取
    S.ctx.world.events.emit("loot:drop", { pos: h.pos.clone().add(new S.ctx.THREE.Vector3(1.5, 0, 0)), kind: "mp", value: 10 });
    const mpOrbs = S.orbs.length - orbs0;
    h.hp = Math.max(1, h.hp - 30);
    const hp0 = h.hp;
    S.ctx.world.events.emit("loot:drop", { pos: h.pos.clone().add(new S.ctx.THREE.Vector3(1.5, 0, 0)), kind: "hp", value: 8 });
    await new Promise((r) => setTimeout(r, 1500));
    return { mp1: Math.round(mp1), count: S.potions[0].count, mpOrbs, orbs: S.orbs.length - orbs0, mp2: Math.round(h.mp), healed: Math.round(h.hp - hp0) };
  });
  check("potion 回气丹 restores mp; 回气光球已取消、回血光球可拾取", pot.mp1 >= 40 && pot.count === 4 && pot.mpOrbs === 0 && pot.orbs <= 0 && pot.healed >= 1, pot);

  // ---- 构筑面板与修为加成 ----
  await page.keyboard.press("Backquote");
  await c.wait(300);
  const panel = await c.ev(() => {
    const S = window.__skills, h = S.hero;
    const atk0 = h.stats.get("atk");
    S.debugAction("power");
    return { open: document.querySelector(".jx-panel").classList.contains("on"), selects: document.querySelectorAll(".jx-panel select").length, atk0, atk1: h.stats.get("atk") };
  });
  check("build panel opens; +10 power raises stats", panel.open && panel.selects >= 5 && panel.atk1 > panel.atk0, panel);
  await c.shot("panel");
  await page.keyboard.press("Backquote");

  const errs = await c.ev(() => window.__errors.length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
