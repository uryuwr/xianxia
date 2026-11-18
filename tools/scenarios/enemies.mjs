// 敌人可运行测试：刷怪、逼近、预警后出招、危险区判定、受击打断、首领霸体、死亡掉落、截图。
// 运行：node tools/run.mjs enemies
export default async function (page, c) {
  const R = [];
  const check = (name, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + name, info === undefined ? "" : JSON.stringify(info));
  };
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready, null, { timeout: 60000 });
  check("model loaded", !0);
  // 准备：关闭自动刷怪、清场、主角血量拉满
  const clear = () =>
    c.ev(() => {
      const D = window.__enemies;
      for (const e of D.list) e.dispose();
      D.list.length = 0;
      D.tokens.clear();
    });
  await c.ev(() => {
    const D = window.__enemies;
    D.auto = !1;
    const h = D.hero;
    h.hp = 1e6;
    window.__log = { tele: [], strike: [], loot: [], dmg: [] };
    const ev = D.ctx.world.events;
    const t0 = performance.now();
    const attackState = (event) => {
      const e = D.list.find((q) => q.entity === event.enemy), k = e?.atk, P = D.ctx.player;
      return { attack: event.attack, state: e?.state, pos: e?.pos.toArray(), hero: h.pos.toArray(),
        origin: k?.origin.toArray(), aim: k?.aim.toArray(), inZone: !!k && e.inZone(h.pos),
        heroState: P.state, god: P.debug.god, alive: h.alive, hp: h.hp,
        invulnUntil: P.invulnUntil, hurtUntil: P.hurtUntil, now: performance.now() / 1000 };
    };
    ev.on("enemy:telegraph", (e) => window.__log.tele.push({ t: performance.now() - t0, id: e.enemy.id, dur: e.dur, ...attackState(e) }));
    ev.on("enemy:strike", (e) => window.__log.strike.push({ t: performance.now() - t0, id: e.enemy.id, ...attackState(e) }));
    ev.on("loot:drop", (e) => window.__log.loot.push(e.items));
    ev.on("damage", (e) => e.target === h && window.__log.dmg.push(e.amount));
    // 测试隔离：主角的普攻 / 法宝 / 法术（兄弟模块）可能自动伤到测试用的狼；只放行测试自己发出的伤害（spec.test）
    window.__shield = !0; // 整个测试期间：测试用的狼只受测试自己的伤害
    ev.on("beforeDamage", (i) => {
      if (window.__shield && i.target.team === "enemy" && !(i.spec && i.spec.test)) i.cancel = !0;
    });
  });
  await clear();

  // 1) 刷一群，看它们逼近
  // 仇恨改为"视野 / 受击才惊动"：这里直接让整群进入仇恨（等同夜潮），测逼近与出招
  const n = await c.ev(() => window.__enemies.spawnPack(5, !1, null, { types: ["wolf"] }).map((e) => e.setAggro("wave")).length);
  check("spawn pack of 5", n === 5, n);
  const d0 = await c.ev(() => {
    const D = window.__enemies, h = D.hero.pos;
    return D.list.map((e) => Math.hypot(e.pos.x - h.x, e.pos.z - h.z));
  });
  await c.wait(3500);
  const d1 = await c.ev(() => {
    const D = window.__enemies, h = D.hero.pos;
    return D.list.map((e) => +Math.hypot(e.pos.x - h.x, e.pos.z - h.z).toFixed(1));
  });
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  check("wolves approach hero", avg(d1) < avg(d0) - 3 && Math.min(...d1) < 6, { before: +avg(d0).toFixed(1), after: +avg(d1).toFixed(1), d1 });
  // 随机五狼的导航/接近已在原3.5秒窗口验完。起手距离并不等于锁定伤害区：
  // recheck11前三次自然bite出招inZone=false，不能用固定时间内必受伤来替代命中前提。
  // 仅在下一次正常AI预警锁定后，将主角一次性放到可站立的区内；不跟随、不调用攻击/伤害方法。
  // 原3秒窗口不延长，前提为空或区内仍未产生真实伤害均失败；局部包装与位置在finally恢复。
  let L, pack;
  try {
    await c.ev(async () => {
      const D = window.__enemies, P = D.ctx.player, h = D.hero;
      const { height } = await import("/src/world/terrain.js");
      const { walkable } = await import("/src/game/enemies/enemy.js");
      const S = window.__packSetup = { entry: null, hits: [], moves: 0, maxTokens: D.tokens.size,
        savedPos: h.pos.clone(), savedVel: P.vel.clone(), wrappers: [] };
      S.off = D.ctx.world.events.on("damage", i => {
        if (S.entry && i.target === h && i.attacker?.id === S.entry.id && i.amount > 0 && i.tags.includes(S.entry.attack))
          S.hits.push({ id: i.attacker.id, amount: i.amount, tags: i.tags });
      });
      for (const e of D.list) {
        const own = Object.hasOwn(e, "updateAttack"), original = e.updateAttack;
        const wrapped = function (...args) {
          const out = original.apply(this, args);
          S.maxTokens = Math.max(S.maxTokens, D.tokens.size);
          const k = this.atk, a = k?.a;
          if (S.entry || this.state !== "windup" || !a?.damage || a.shape !== "line" ||
              this.t < k.windup * (a.track ?? 0.5) || this.t >= k.windup) return out;
          for (const fraction of [0.8, 0.65, 0.5]) {
            const x = k.origin.x + k.aim.x * a.length * fraction;
            const z = k.origin.z + k.aim.z * a.length * fraction, y = height(x, z);
            if (Math.abs(y - k.origin.y) >= 2.2 || !walkable(x, z, y, D.ctx.colliders, h.radius)) continue;
            const before = h.pos.toArray();
            h.pos.set(x, y, z); // 唯一一次布置，之后完全交还正常主循环/击退/AI。
            S.moves++;
            S.entry = { id: this.entity.id, attack: a.id, state: this.state,
              t: this.t, windup: k.windup, track: a.track ?? 0.5, before, pos: h.pos.toArray(),
              origin: k.origin.toArray(), aim: k.aim.toArray(), inZone: this.inZone(h.pos),
              at: performance.now(), token: D.tokens.has(this) };
            break;
          }
          return out;
        };
        S.wrappers.push({ e, own, original, wrapped });
        e.updateAttack = wrapped;
      }
    });
    await c.wait(3000);
    await c.shot("pack");
    L = await c.ev(() => window.__log);
    pack = await c.ev(() => {
      const S = window.__packSetup;
      return { entry: S.entry, moves: S.moves, hits: S.hits, maxTokens: S.maxTokens };
    });
    check("telegraph before strike", L.tele.length > 0 && L.strike.length > 0 && L.strike.every((s) => L.tele.some((t) => t.id === s.id && t.t <= s.t - t.dur * 1000 * 0.85)), { tele: L.tele.length, strike: L.strike.length });
    const maxAtk = await c.ev(() => window.__enemies.tokens.size);
    check("attack tokens ≤ 2", maxAtk <= 2 && pack.maxTokens <= 2, { sampled: maxAtk, windowMax: pack.maxTokens });
    check("pack damage precondition: one placement inside naturally locked zone", pack.moves === 1 &&
      pack.entry?.inZone && pack.entry.token && pack.entry.t >= pack.entry.windup * pack.entry.track, pack);
    const heroInv = await c.ev(() => { const P = window.__game.player, t = performance.now() / 1000; return { state: P.state, god: P.debug.god, invuln: P.invulnUntil > t, hurt: P.hurtUntil > t, hp: Math.round(P.entity.hp), alive: P.entity.alive, strikes: window.__log.strike.length }; });
    check("hero took damage from pack", L.dmg.length > 0 && pack.hits.length > 0, { ...heroInv, controlledHits: pack.hits });
    c.log("PACK_DIAGNOSTIC", JSON.stringify({ tele: L.tele, strike: L.strike, damage: L.dmg, controlled: pack }));
  } finally {
    await c.ev(() => {
      const S = window.__packSetup;
      if (!S) return;
      S.off?.();
      for (const { e, own, original, wrapped } of S.wrappers) if (e.updateAttack === wrapped) {
        if (own) e.updateAttack = original; else delete e.updateAttack;
      }
      window.__enemies.hero.pos.copy(S.savedPos);
      window.__enemies.ctx.player.vel.copy(S.savedVel);
      delete window.__packSetup;
    });
  }
  await clear();

  await c.ev(() => (window.__shield = !0));
  // 2) 危险区判定：站在区内挨打；预警期间走出区域不挨打
  const zone = async (leave) =>
    c.ev(async (leave) => {
      const D = window.__enemies, h = D.hero;
      const e = D.spawnPack(1, !1, null, { types: ["wolf"] })[0];
      e.setAggro();
      for (const k in e.cool) e.cool[k] = 99;
      e.pos.set(h.pos.x + 2.6, h.pos.y, h.pos.z);
      const n0 = window.__log.dmg.length; // 按伤害事件计数（主角有气血回复，不能只看血量）
      e.startAttack(e.def.attacks[0], h.pos); // 冲扑撕咬（直线）
      await new Promise((r) => setTimeout(r, 200));
      const saved = h.pos.clone();
      if (leave) h.pos.z += 4.5; // 侧向闪出直线区域
      await new Promise((r) => setTimeout(r, 1100));
      const hit = window.__log.dmg.length - n0;
      if (leave) h.pos.copy(saved);
      return { hit, state: e.state };
    }, leave);
  const zin = await zone(!1);
  await clear();
  const zout = await zone(!0);
  check("hit when inside zone", zin.hit > 0, zin);
  check("no hit when hero leaves zone during windup", zout.hit === 0, zout);
  await clear();

  // 3) 受击打断：杂兵（灰狼）预警中被打 → 硬直、预警取消
  const fl = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world;
    const e = D.spawnPack(1, !1, null, { types: ["wolf_grey"] })[0];
    e.setAggro();
    e.pos.set(h.pos.x + 2.4, h.pos.y, h.pos.z);
    e.startAttack(e.def.attacks[1], h.pos);
    await new Promise((r) => setTimeout(r, 120));
    const before = e.state;
    w.dealDamage(h, e.entity, { test: !0, base: 5, knock: 1, dir: new w.player.pos.constructor(1, 0, 0) });
    return { before, after: e.state, atk: !!e.atk, tokens: D.tokens.size };
  });
  check("grey wolf flinches & windup interrupted", fl.before === "windup" && fl.after === "flinch" && !fl.atk && fl.tokens === 0, fl);
  await clear();

  // 3b) 标准狼（数值复核：霸体）：出招不可打断，但主角真实普攻照样掉它的血、照常积累气势
  const sw = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world, P = window.__game.player;
    const e = D.spawnPack(1, !1, null, { types: ["wolf"] })[0];
    e.setAggro();
    for (const k in e.cool) e.cool[k] = 99;
    e.pos.set(h.pos.x + 1.6, h.pos.y, h.pos.z);
    e.startAttack(e.def.attacks[1], h.pos);
    await new Promise((r) => setTimeout(r, 60));
    window.__shield = !1; // 放行主角的真实普攻
    const hp0 = e.entity.hp, m0 = P.momentum || 0, before = e.state;
    window.__game.ctx.input.aim.set(e.pos.x, h.pos.y, e.pos.z); // 朝狼出剑（startAttack 按瞄准点转身）
    P.setState("move");
    // 只认主角这一剑（沙盒默认带青冥飞剑，飞剑会先削掉狼的血，但飞剑不给气势）：等 player:attack 命中事件
    let swing = null;
    const off = w.events.on("player:attack", (a) => !swing && (swing = a));
    P.startAttack();
    let hit = !1, after = null;
    for (let k = 0; k < 120 && !hit; k++) {
      await new Promise((r) => setTimeout(r, 10));
      hit = !!swing && swing.hits > 0;
      if (hit) after = e.state;
    }
    off();
    window.__shield = !0;
    return { superArmor: !!e.def.superArmor, before, after, hpLost: Math.round(hp0 - e.entity.hp), momentum: [m0, P.momentum || 0] };
  });
  check("wolf (super armor) keeps attacking but takes damage & feeds momentum", sw.superArmor && sw.before === "windup" && sw.after !== "flinch" && sw.hpLost > 0 && sw.momentum[1] > sw.momentum[0], sw);
  await clear();

  // 4) 首领霸体：出招中被打不中断
  const sa = await c.ev(async () => {
    const D = window.__enemies, h = D.hero, w = D.ctx.world;
    const e = D.spawnPack(1, !0)[0];
    e.setAggro();
    e.pos.set(h.pos.x + 3, h.pos.y, h.pos.z);
    const claw = e.def.attacks.find((a) => a.id === "claw");
    e.startAttack(claw, h.pos);
    await new Promise((r) => setTimeout(r, 120));
    w.dealDamage(h, e.entity, { test: !0, base: 20, knock: 2, dir: new w.player.pos.constructor(1, 0, 0) });
    return { type: e.type, state: e.state, hp: e.entity.hp, scale: e.def.scale };
  });
  check("elite super armor during attack", sa.type === "wolf_elite" && sa.state === "windup", sa);
  await c.shot("elite");

  // 5) 死亡：实体移除、掉落事件
  const dead = await c.ev(async () => {
    const D = window.__enemies, w = D.ctx.world;
    const e = D.list.find((x) => x.type === "wolf_elite");
    const id = e.entity.id;
    if (e.entity.shield) (D.ctx.shields.drop(e.entity), (e.entity.shield = null)); // v0.3 起精英带五行护盾，这里只测死亡流程
    w.dealDamage(w.player, e.entity, { test: !0, base: 1e6, noCrit: !0 });
    const alive = e.alive;
    await new Promise((r) => setTimeout(r, 2200));
    return { alive, inWorld: w.entities.some((x) => x.id === id), inList: D.list.includes(e), loot: window.__log.loot.length };
  });
  check("death removes entity & emits loot:drop", !dead.alive && !dead.inWorld && !dead.inList && dead.loot > 0, dead);

  // 6) 嚎叫增益：首领嚎叫后同伴移速提升
  const howl = await c.ev(async () => {
    const D = window.__enemies, h = D.hero;
    const pack = D.spawnPack(4, !0);
    const el = pack.find((e) => e.type === "wolf_elite");
    for (const e of pack) e.setAggro();
    // 原随机群保留，另加明确的普通狼样本；与头目同点同高，短暂 down 隔离自主移动，不写任何增益。
    const tested = D.spawn("wolf", el.pos.clone(), { noLoot: true });
    if (!tested) throw new Error("howl fixture requires a normal wolf");
    tested.setAggro("pull");
    tested.setState("down", 2);
    pack.push(tested);
    const ws = [tested];
    // 只诊断本次实例：分别记录放置前、嚎叫当刻和等待后的真实范围/状态。
    const sample = () => pack.map((e) => ({
      id: e.entity.id, type: e.type, tested: ws.includes(e), inDirector: D.list.includes(e),
      pos: e.pos.toArray(), distance3D: e.pos.distanceTo(el.pos), heightDelta: e.pos.y - el.pos.y,
      alive: e.alive, entityAlive: e.entity.alive, hp: e.entity.hp,
      state: e.state, aggro: e.aggro, attack: e.atk?.a?.id || null,
      buffT: e.buffT, move: e.entity.stats.get("move"), baseMove: e.entity.stats.base.move,
      moveMods: e.entity.stats.mods.filter((m) => m.stat === "move").map((m) => ({
        stat: m.stat, type: m.type, value: m.value,
        source: typeof m.source === "object" ? String(m.source) : m.source,
      })),
    }));
    const spawned = sample();
    const m0 = ws.map((w) => w.entity.stats.get("move"));
    const before = sample(), strikes = [], originalHowl = el.howl;
    const ownHowl = Object.getOwnPropertyDescriptor(el, "howl");
    el.howl = function (...args) {
      const strike = { attack: this.atk?.a?.id, radius: this.atk?.a?.buff?.radius, before: sample() };
      strikes.push(strike);
      try { return originalHowl.apply(this, args); }
      finally { strike.after = sample(); }
    };
    try {
      el.startAttack(el.def.attacks.find((a) => a.id === "howl"), h.pos);
      await new Promise((r) => setTimeout(r, 700));
      return { m0, m1: ws.map((w) => +w.entity.stats.get("move").toFixed(2)), self: +el.entity.stats.get("move").toFixed(2), spawned, before, strikes, after: sample() };
    } finally {
      if (ownHowl) Object.defineProperty(el, "howl", ownHowl);
      else delete el.howl;
      tested.dispose();
      const index = D.list.indexOf(tested);
      if (index >= 0) D.list.splice(index, 1);
    }
  });
  check("howl buffs nearby wolves", howl.m0.length > 0 && howl.m1.every((m, i) => m > howl.m0[i] * 1.2) &&
    howl.strikes.some((s) => s.before.filter((e) => e.tested).length === howl.m0.length &&
      s.before.filter((e) => e.tested).every((e) => e.alive && e.entityAlive && e.distance3D <= s.radius) &&
      s.after.filter((e) => e.tested).every((e) => e.buffT > 0 && e.moveMods.some((m) => m.source === "howl"))), howl);
  await c.wait(1500);
  await c.shot("fight");
  await clear();

  // 6b) 追击恢复的固定位置 fixture：只模拟受阻，不声称复现真实碰撞物；loop_flow 保留端到端验证。
  const recovery = await c.ev(async () => {
    const { Enemy } = await import("/src/game/enemies/enemy.js");
    const { ENEMY_TYPES } = await import("/src/data/enemies.js");
    const { CombatWorld, makeEntity, Stats } = await import("/src/core/combat.js");
    const D = window.__enemies, world = new CombatWorld(), scene = new D.ctx.scene.constructor();
    const hero = world.add(makeEntity({ team: "player", pos: D.hero.pos.clone(), radius: 0.4, stats: new Stats({ hp: 10000, def: 0 }) }));
    const tele = () => ({ cancel() {}, mesh: null, t: 0, dur: 1 });
    // 独立 world / scene / director；不改全局 nav、共享定义或场上主角，仍调用真实 Enemy 构造与状态方法。
    const dir = Object.assign(Object.create(D), {
      ctx: { ...D.ctx, world, scene, shields: null, vfx: { ring: tele, burst() {} } },
      list: [], tokens: new Set(), fx: { line: tele, sector: tele },
      nav: { lineClear: () => true, flow: () => ({}), reachable: () => true,
        next: (_pos, _flow, out) => out.copy(hero.pos), block() {} },
    });
    if (dir.hero !== hero || dir.hero === D.hero) throw new Error("recovery fixture must use its own world player");
    const reasons = [], off = world.events.on("enemy:leash", ({ reason }) => reasons.push(reason));
    const make = (type, def = ENEMY_TYPES[type]) => {
      const e = new Enemy(dir, type, def, D.templates[type], hero.pos.clone().set(0, 0, 0), { noLoot: true });
      dir.list.push(e);
      return e;
    };
    try {
      const base = ENEMY_TYPES.wolf_elite, howl = base.attacks.find((a) => a.buff);
      const e = make("wolf_elite", { ...base, leashRange: 14, leashTime: 6 });
      const aux = make("wolf_elite", { ...base, attacks: [howl] });
      const reset = (dist) => {
        e.endAttack(true);
        Object.assign(e, { state: "chase", aggro: true, hunter: false, contactT: 0, stuckT: 0,
          route: "direct", routeT: 0, forcePathT: 0, unreachT: 0, strafeT: 99, strafe: 1, orbitA: Math.PI / 2, orbitR: 6 });
        e.home.copy(e.pos); e.home.x -= 9.38;
        e.lastPos.copy(e.pos);
        for (const a of e.def.attacks) e.cool[a.id] = 99;
        hero.pos.copy(e.pos); hero.pos.x += dist;
      };
      const step = (dt = 0.4) => {
        e.vel.set(0, 0, 0);
        e.updateChase(dt, hero.pos, e.entity.stats.get("move")); // 故意不执行位置积分：固定位置模拟受阻
        return { state: e.state, route: e.route, contact: e.contactT, stuck: e.stuckT,
          force: e.forcePathT, speed: e.vel.length(), pos: e.pos.toArray() };
      };
      reset(10.68);
      const stalled = [step(), step(), step(), step()];
      const contact = [9.99, 10, 10.01].map((dist) => {
        reset(dist); e.contactT = 2;
        return { dist, ...step() };
      });
      reset(10.68); e.contactT = 5.9;
      const timeout = step(0.2);
      // 真正命中且扣血后计时归零，回到范围外继续累积，而非保留旧计时或永远清零。
      reset(2);
      const attack = base.attacks.find((a) => a.id === "bite"), hp0 = hero.hp;
      e.entity.stats.setBase("crit", 0);
      e.contactT = 2;
      e.startAttack(attack, hero.pos); e.strike();
      const hit = { lost: hp0 - hero.hp, contact: e.contactT };
      e.endAttack(true);
      hero.pos.copy(e.pos); hero.pos.x += 10.68;
      hit.after = step();
      // 没有任何 damage 招式也须得到有限的 0，并可推进 chase。
      aux.state = "chase"; aux.aggro = true; aux.cool[howl.id] = 99;
      aux.updateChase(0.4, hero.pos, aux.entity.stats.get("move"));
      const noDamage = { reach: aux.damageReach, contact: aux.contactT, state: aux.state };
      // 原嚎叫选择范围、buff 半径与增幅均保留；两个同伴满足 needAllies，第三个在 buff 范围外。
      const near = make("wolf"), far = make("wolf");
      for (const [mate, distance] of [[aux, 2], [near, 9.99], [far, 10.01]]) {
        mate.pos.copy(e.pos); mate.pos.z += distance; mate.aggro = true;
      }
      reset(14 + hero.radius + 0.01); e.cool[howl.id] = 0;
      step();
      const outside = e.atk?.a.id || null;
      reset(14); e.cool[howl.id] = 0;
      const participants = [e, aux, near, far], m0 = participants.map((o) => o.entity.stats.get("move"));
      const a0 = participants.map((o) => o.entity.stats.get("atk"));
      step();
      const selected = e.atk?.a.id || null;
      if (e.atk) e.updateAttack(e.atk.windup, hero.pos, e.entity.stats.get("move"));
      const howlResult = { outside, selected, maxDist: howl.maxDist, radius: howl.buff.radius,
        m0, m1: participants.map((o) => o.entity.stats.get("move")), a0, a1: participants.map((o) => o.entity.stats.get("atk")),
        buffT: participants.map((o) => o.buffT) };
      return { reach: e.reach, damageReach: e.damageReach, stalled, contact, timeout, reasons, hit, noDamage, howl: howlResult };
    } finally {
      off();
      for (const e of dir.list) { e.endAttack(true); e.dispose(); }
      world.remove(hero);
    }
  });
  check("auxiliary range does not inflate damage reach", recovery.reach === 14 && recovery.damageReach === 7.5, recovery);
  check("stationary chase at 10.68 requests movement then forces path recovery",
    recovery.stalled.every((s) => s.speed > 0 && s.pos.every((v, i) => v === recovery.stalled[0].pos[i])) &&
    recovery.stalled[0].stuck > 0 && recovery.stalled[1].stuck > recovery.stalled[0].stuck &&
    recovery.stalled[2].force > 0 && recovery.stalled[3].route === "path", recovery.stalled);
  check("contact resets only inside damage reach plus margin",
    recovery.contact[0].contact === 0 && recovery.contact[1].contact > 2 && recovery.contact[2].contact > 2, recovery.contact);
  check("out-of-damage-range chase still times out without crossing leash14",
    recovery.timeout.state === "return" && recovery.reasons.length === 1 && recovery.reasons[0] === "timeout", { timeout: recovery.timeout, reasons: recovery.reasons });
  check("successful damage resets contact then out-of-range time resumes",
    recovery.hit.lost > 0 && recovery.hit.contact === 0 && Math.abs(recovery.hit.after.contact - 0.4) < 1e-9, recovery.hit);
  check("auxiliary-only attacks have finite zero damage reach",
    recovery.noDamage.reach === 0 && recovery.noDamage.contact > 0 && recovery.noDamage.state === "chase", recovery.noDamage);
  const rh = recovery.howl;
  check("howl keeps original activation range and nearby buff",
    rh.outside === null && rh.selected === "howl" && rh.maxDist === 14 && rh.radius === 10 &&
    rh.m1.slice(0, 3).every((m, i) => Math.abs(m / rh.m0[i] - 1.35) < 1e-9 &&
      Math.abs(rh.a1[i] / rh.a0[i] - 1.3) < 1e-9 && rh.buffT[i] === 6) &&
    rh.m1[3] === rh.m0[3] && rh.a1[3] === rh.a0[3] && rh.buffT[3] === 0, rh);

  // 6c) 动作边界脱战（独立于6b射程恢复）：只推进攻击状态，不模拟真实回巢导航/碰撞。
  const boundaries = await c.ev(async () => {
    const { Enemy } = await import("/src/game/enemies/enemy.js");
    const { ENEMY_TYPES } = await import("/src/data/enemies.js");
    const { CombatWorld, makeEntity, Stats } = await import("/src/core/combat.js");
    const D = window.__enemies, world = new CombatWorld(), scene = new D.ctx.scene.constructor();
    const hero = world.add(makeEntity({ team: "player", pos: D.hero.pos.clone(), radius: 0.4, stats: new Stats({ hp: 10000 }) }));
    const tele = () => ({ cancel() {}, mesh: null, t: 0, dur: 1 });
    const dir = Object.assign(Object.create(D), {
      ctx: { ...D.ctx, world, scene, shields: null, vfx: { ring: tele, burst() {} } },
      list: [], tokens: new Set(), fx: { line: tele, sector: tele }, bars: { hint() {} }, nav: null,
    });
    if (dir.hero !== hero || dir.hero === D.hero) throw new Error("action-boundary fixture requires its own world player");
    const events = [], off = world.events.on("enemy:leash", ({ enemy, reason }) => events.push({ id: enemy.id, reason }));
    const base = ENEMY_TYPES.wolf_elite, attack = base.attacks.find((a) => a.id === "lunge3");
    const run = ({ name, distance, route = "direct", hunter = false, final = false, controlled = false, handled = false, cancel = false, active = false, expected }) => {
      const hooks = [];
      // 控制器契约桩：分别覆盖回调放行(false)与自行接管(true)，不冒充青牙端到端测试。
      const def = { ...base, leashRange: 14, tags: controlled ? ["boss"] : base.tags,
        controller: controlled ? (enemy) => ({ onEndAttack(a, interrupted) {
          hooks.push({ attack: a.id, interrupted });
          if (handled) { enemy.state = "down"; return true; }
          return false;
        } }) : undefined };
      const e = new Enemy(dir, "wolf_elite", def, D.templates.wolf_elite, hero.pos.clone().set(0, 0, 0), { noLoot: true });
      dir.list.push(e);
      e.home.copy(e.pos); e.home.x -= distance;
      hero.pos.copy(e.pos); hero.pos.x += 2;
      Object.assign(e, { state: "chase", aggro: true, route, hunter, chain: 0, chainNeed: 1 });
      dir.tokens.add(e);
      e.startAttack(attack, hero.pos, final ? attack.combo - 1 : 0);
      const originalTele = e.atk.tele, originalCancel = originalTele.cancel;
      let cancelled = 0;
      originalTele.cancel = function (...args) { cancelled++; return originalCancel.apply(this, args); };
      const stages = [];
      try {
        if (cancel) e.endAttack(true);
        else {
          if (active) {
            e.updateAttack(e.atk.windup - 0.01, hero.pos, 0); stages.push(e.state);
            e.updateAttack(0.02, hero.pos, 0); stages.push(e.state);
            e.updateAttack(attack.active / 2, hero.pos, 0); stages.push(e.state);
            e.updateAttack(attack.active / 2 + 0.01, hero.pos, 0); stages.push(e.state);
            e.t = attack.recover * 0.35 - 0.01;
            e.updateAttack(0.005, hero.pos, 0); stages.push(e.state);
            e.updateAttack(0.01, hero.pos, 0);
          } else {
            e.state = "recover"; e.t = 99;
            e.updateAttack(0, hero.pos, 0);
          }
        }
        return { name, expected, state: e.state, combo: e.atk?.combo ?? null, atk: !!e.atk,
          token: dir.tokens.has(e), aggro: e.aggro, submerged: e.submerged, cancelled,
          reasons: events.filter((v) => v.id === e.entity.id).map((v) => v.reason), stages, hooks: hooks.slice() };
      } finally {
        originalTele.cancel = originalCancel;
        e.endAttack(true); e.dispose();
      }
    };
    try {
      return [
        run({ name: "inside leash keeps combo", distance: 13.99, expected: "windup" }),
        run({ name: "exact direct threshold keeps combo", distance: 14, expected: "windup" }),
        run({ name: "outside leash stops next combo and releases token", distance: 14.01, expected: "return" }),
        run({ name: "started segment and recovery finish before leash", distance: 14.01, active: true, expected: "return" }),
        run({ name: "inside leash keeps normal winded", distance: 14, final: true, expected: "winded" }),
        run({ name: "outside leash returns instead of winded", distance: 14.01, final: true, expected: "return" }),
        run({ name: "path threshold keeps combo", distance: 14 * 1.6, route: "path", expected: "windup" }),
        run({ name: "outside path threshold returns", distance: 14 * 1.6 + 0.01, route: "path", expected: "return" }),
        run({ name: "hunter keeps combo outside leash", distance: 100, hunter: true, expected: "windup" }),
        run({ name: "hunter keeps winded outside leash", distance: 100, hunter: true, final: true, expected: "winded" }),
        run({ name: "controlled boss keeps combo", distance: 100, controlled: true, expected: "windup" }),
        run({ name: "controlled boss callback false keeps winded", distance: 100, controlled: true, final: true, expected: "winded" }),
        run({ name: "controlled boss callback true retains state", distance: 100, controlled: true, handled: true, final: true, expected: "down" }),
        run({ name: "interrupted cleanup does not recurse into leash", distance: 100, cancel: true, expected: "chase" }),
      ];
    } finally {
      off();
      for (const e of dir.list) { e.endAttack(true); e.dispose(); }
      world.remove(hero);
    }
  });
  for (const row of boundaries) {
    const returning = row.expected === "return", continuing = row.expected === "windup";
    check("action-boundary: " + row.name,
      row.state === row.expected && (continuing ? row.atk && row.combo === 1 && row.token : !row.atk && !row.token && row.cancelled === 1) &&
      (returning ? !row.aggro && !row.submerged && row.reasons.length === 1 && row.reasons[0] === "leash" : row.aggro && row.reasons.length === 0) &&
      (!row.stages.length || row.stages.join(",") === "windup,strike,strike,recover,recover") &&
      (!row.name.includes("callback") || row.hooks.length === 1 && row.hooks[0].interrupted === false), row);
  }

  // 7) 压力：30 只
  const perf = await c.ev(async () => {
    const D = window.__enemies;
    for (let i = 0; i < 6; i++) D.spawnPack(5);
    await new Promise((r) => setTimeout(r, 3000));
    return { n: D.list.length, frameMs: +(window.__game.frameMs || 0).toFixed(1) };
  });
  check("30 wolves run", perf.n >= 25, perf);
  await c.shot("swarm");
  const errs = await c.ev(() => window.__errors.length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
