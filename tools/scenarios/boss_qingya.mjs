// 青牙 v2 可运行测试（docs/design/boss_青牙_v2.md §11）：沉睡 / 图腾 / 入场 / 召狼按图腾 / 读条打断 / 撞柱 / 狼威（获取、回落、威折）/
// 硬控折算 / v1.3 满势斩接管 / 撤退回满 / 短版入场 / 转阶段 / 二阶段招式 / 背甲弱点 / 月下无影 / 威折处决 / 终结处决（完整、自动短版）/
// 御剑围栏 / 存档（流程组 bossflow）。全部读运行时；时间用玩法时间。
// 用法：node tools/run.mjs boss_qingya "scene=run&region=r1&slot=8"
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.routeWebSocket(/./, () => {});
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 150000 });
  await c.wait(1000);
  const ev = (f, a) => c.ev(f, a);
  const waitFor = async (fn, arg, ms = 8000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
      return !0;
    } catch {
      return !1;
    }
  };

  // ---- 准备：清场、主角无敌、事件记录、工具 ----
  await ev(() => {
    const G = __game, w = G.world, P = G.player, E = __enemies;
    E.auto = !1;
    for (const e of [...E.list]) if (e.type !== "qingya") (e.entity.alive = !1), w.remove(e.entity), e.dispose();
    E.list = E.list.filter((e) => e.type === "qingya");
    P.debug.god = !0;
    window.__B = { evs: [], tele: [] };
    for (const n of ["boss:poiseGain", "boss:poiseNear", "boss:intro", "boss:introStart", "boss:phase", "boss:poise", "boss:break", "boss:interrupt", "boss:crash", "boss:totem", "boss:execPrompt", "boss:execute", "boss:execEnd", "boss:retreat", "boss:defeated", "boss:moonDenied", "player:swordFlyDenied", "enemy:interrupt"])
      w.events.on(n, (d) => __B.evs.push({ n, t: w.time, d: d ? { kind: d.kind, dur: d.dur, short: d.short, first: d.first, left: d.left, attack: d.attack, phase: d.phase, on: d.on, tries: d.tries, reason: d.reason, cause: d.cause, v: d.v, n: d.n, hint: d.hint } : null }));
    w.events.on("enemy:telegraph", (d) => d.enemy && d.enemy.kind === "qingya" && __B.tele.push(d.attack));
    window.__q = () => E.list.find((e) => e.type === "qingya" && e.alive);
    window.__evs = (n) => __B.evs.filter((x) => x.n === n);
    window.__still = (on) => {
      // 让青牙站住不动（down 状态不出招、不移动；我们自己的测试态）
      const q = __q();
      if (q.atk) q.endAttack(!0);
      q.ctrl.moonLeap = null;
      q.ctrl.moonCd = 999;
      if (on) (q.state = "down"), (q.t = 999);
      else (q.state = "chase"), (q.t = 0);
    };
    window.__hit = (base, opts = {}) => w.dealDamage(P.entity, __q().entity, { base, noCrit: !0, ...opts });
    // 清状态要走 removeStatus（直接 clear 会留下 status:* 的属性修正，比如眩晕的移速 −100%）
    window.__clearSt = (q) => { for (const id of [...q.entity.statuses.keys()]) w.removeStatus(q.entity, id); };
  });
  // 走到谷里（离出生点约 12.6 米，在 10 米触发圈外）→ 首领生成、沉睡
  await ev(() => __game.player.spawn(38, -26));
  const spawned = await waitFor(() => !!window.__q && !!__q() && !!__q().ctrl, null, 20000);
  check("boss spawned with controller", spawned);
  if (!spawned) return c.log("SUMMARY " + R.filter(Boolean).length + "/" + R.length);
  await c.wait(1500);
  let s = await ev(() => {
    const q = __q(), C = q.ctrl;
    return { mode: C.mode, aggro: q.aggro, pillars: (C.arena && C.arena.pillars || []).length, totems: C.totems.length, stub: !!C.stub, realm: q.def.realm, hp: q.entity.stats.get("hp"), sh: q.entity.shield && q.entity.shield.element };
  });
  check("asleep: not aggro outside trigger", s.mode === "asleep" && !s.aggro, s);
  check("arena: 5 pillars, 3 totems", s.pillars === 5 && s.totems === 3, s);
  check("data: realm 1:7, hp 15000, wood shield", s.realm === "1:7" && s.hp === 15000 && s.sh === "wood", s);
  await c.shot("asleep");

  // ---- 图腾：砍倒西图腾 → 惊醒（入场仪式，首次 4 秒）----
  s = await ev(() => {
    const C = __q().ctrl, t = C.totems.find((x) => x.id === "totem_w");
    const a = __game.world.dealDamage(__game.player.entity, t.ent, { base: 50, noCrit: !0, element: "fire" });
    return { dmg: a && a.amount, alive: t.alive };
  });
  check("totem takes fire x2", s.dmg === 100 && s.alive, s);
  s = await ev(() => {
    __game.world.dealDamage(__game.player.entity, __q().ctrl.totems.find((x) => x.id === "totem_w").ent, { base: 999, noCrit: !0 });
    return { mode: __q().ctrl.mode, totem: __evs("boss:totem").map((x) => x.d.left), intro: __evs("boss:introStart").map((x) => x.d), hero: __game.player.state };
  });
  check("totem fall → boss:totem left=2 → intro (first, 4.0s)", s.totem[0] === 2 && s.mode === "intro" && s.intro[0] && s.intro[0].first && s.intro[0].dur === 4, s);
  check("intro locks hero (cine)", s.hero === "cine", s.hero);
  check("first challenge: intro carries hint 折其威，可斩 (once)", s.intro[0] && s.intro[0].hint === "折其威，可斩", s.intro[0]);
  await c.shot("intro");
  await waitFor(() => __q().ctrl.mode === "fight", null, 9000);
  s = await ev(() => {
    const q = __q(), C = q.ctrl;
    return { mode: C.mode, gate: C.arena.gates.isOn("mist_n"), fence: !!__game.ctx.flyFence, state: q.state, t: q.t, hero: __game.player.state };
  });
  check("after intro: fight, gates on, fly fence on", s.mode === "fight" && s.gate !== !1 && s.fence, s);
  check("wake opening: flinch ~1.2s, hero free", s.state === "flinch" && s.t > 0.5 && s.hero !== "cine", s);

  // ---- 群狼（没打断的代价）：跃至包围位、分散、扛打；狼窝出口与包围位的寻路自检 ----
  await ev(() => {
    window.__clearPack = () => {
      const q = __q();
      for (const o of [...__enemies.list]) if (o.summoner === q) (o.entity.alive = !1), __game.world.remove(o.entity), o.dispose();
    };
    window.__randPit = () => {
      const C = __q().ctrl, T = __game.THREE, cs = __game.ctx.colliders, floor = __game.ctx.level ? 0 : 0;
      for (let k = 0; k < 200; k++) {
        const x = 30 + Math.random() * 36, z = -36 + Math.random() * 29;
        if (!C.inPit({ x, z })) continue;
        if (cs.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1)) continue;
        return new T.Vector3(x, 0, z);
      }
      return new T.Vector3(50, 0, -16);
    };
  });
  const arr = [];
  for (let k = 0; k < 4; k++) {
    await ev(() => {
      const q = __q(), P = __game.player, p = __randPit();
      __clearPack();
      P.spawn(p.x, p.z);
      __still(!0);
      window.__packN = q.ctrl.spawnPack(q.def.attacks.find((x) => x.id === "summon_howl"));
      window.__packT0 = q.ctrl.time;
    });
    await waitFor(() => __q().ctrl.time - __packT0 > 2.2, null, 8000);
    if (k === 0) await c.shot("pack");
    arr.push(await ev(() => {
      const q = __q(), P = __game.player;
      const ws = __enemies.list.filter((o) => o.alive && o.summoner === q);
      const L = (o) => (o.ctrl && o.ctrl.landPos) || o.pos; // 落地时的包围位（落地后它们会继续逼近 / 绕圈）
      const d = ws.map((o) => +Math.hypot(L(o).x - P.pos.x, L(o).z - P.pos.z).toFixed(1));
      const ang = ws.map((o) => Math.atan2(L(o).x - P.pos.x, L(o).z - P.pos.z));
      let gap = 9;
      for (let i = 0; i < ang.length; i++) for (let j = i + 1; j < ang.length; j++) gap = Math.min(gap, Math.abs(Math.atan2(Math.sin(ang[i] - ang[j]), Math.cos(ang[i] - ang[j]))));
      const landed = ws.filter((o) => o.ctrl && o.ctrl.arrivedAt != null).length;
      return { n: __packN, d, gap: +(gap * 57.3).toFixed(0), landed };
    }));
  }
  check("uninterrupted howl: wolves leap to hero (≤5.5m within 2.2s), spread ≥45°", arr.every((r) => r.n >= 2 && r.landed === r.n && r.d.every((x) => x <= 5.5) && r.gap >= 45), arr);
  s = await ev(() => {
    const q = __q(), P = __game.player, w = __game.world;
    const o = __enemies.list.find((x) => x.alive && x.summoner === q);
    const hp0 = o.entity.hp;
    let hits = 0;
    while (o.alive && hits < 20) (w.dealDamage(P.entity, o.entity, { base: 0, scale: { atk: 1.0 }, noCrit: !0, tags: ["melee", "basic", "step0"] }), hits++);
    return { hits, hp0, atk: P.entity.stats.get("atk"), lv: o.level, name: o.def.name };
  });
  check("pack wolf takes ≥4 basic hits to die (provisional, numeric to confirm)", s.hits >= 4, s);
  s = await ev(() => {
    const q = __q(), C = q.ctrl, nav = __enemies.nav;
    let ok = 0, tot = 0, stuck = [];
    for (let k = 0; k < 20; k++) {
      const p = __randPit();
      p.y = 0;
      for (const t of C.totems) {
        if (!t.den) continue;
        const ex = C.denExit(t);
        tot++;
        const reach = nav.lineClear(ex, p) || nav.canReach(ex, p);
        if (reach) ok++;
        else stuck.push([t.id, +p.x.toFixed(1), +p.z.toFixed(1)]);
      }
      for (const sl of C.packSlots(3, p)) {
        tot++;
        if (C.inPit(sl.p) && (nav.lineClear(sl.p, p) || nav.canReach(sl.p, p))) ok++;
        else stuck.push(["slot", +sl.p.x.toFixed(1), +sl.p.z.toFixed(1)]);
      }
    }
    return { rate: +(ok / tot).toFixed(3), tot, stuck: stuck.slice(0, 6), nStuck: stuck.length };
  });
  check("nav self-check: den exits & surround slots reach hero (20 random spots)", s.rate >= 0.97, s);
  await ev(() => (__clearPack(), __still(!1)));

  // ---- 召狼按图腾 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, E = __enemies, a = q.def.attacks.find((x) => x.id === "summon_howl");
    const n0 = E.list.filter((o) => o.alive && o.summoner === q).length;
    C.onStrike(a);
    const n1 = E.list.filter((o) => o.alive && o.summoner === q).length;
    for (const o of [...E.list]) if (o.summoner === q) (o.entity.alive = !1), __game.world.remove(o.entity), o.dispose();
    for (const t of C.totems) if (t.alive) __game.world.dealDamage(__game.player.entity, t.ent, { base: 999, noCrit: !0 });
    C.onStrike(a);
    const n2 = E.list.filter((o) => o.alive && o.summoner === q).length;
    return { n0, n1, n2, left: C.totems.filter((t) => t.alive).length };
  });
  check("summon: 2 wolves from 2 standing dens; none after all totems fall (孤嚎)", s.n1 - s.n0 === 2 && s.n2 === 0 && s.left === 0, s);

  // ---- 读条打断：长嚎 1.6 秒，剑气斩三道（金、无标签）= 1.02 ----
  await ev(() => {
    const q = __q();
    q.ctrl.poise = 0;
    q.ctrl.broken = !1;
    q.state = "chase";
    q.startAttack(q.def.attacks.find((x) => x.id === "summon_howl"), __game.player.pos);
  });
  await c.wait(200);
  s = await ev(() => {
    const q = __q(), C = q.ctrl, v0 = C.poise, pre = C.view().channel;
    for (let i = 0; i < 3; i++) __hit(5, { element: "metal" });
    return { v0, v1: C.poise, ints: __evs("boss:interrupt").length, state: q.state, pre };
  });
  await c.wait(150);
  const st2 = await ev(() => ({ state: __q().state, t: __q().t }));
  check("channel view: id summon_howl, k>0", s.pre && s.pre.id === "summon_howl" && s.pre.k > 0, s.pre);
  check("3 sword-qi blades interrupt howl → +45 狼威 (not shield-reduced)", s.ints === 1 && Math.abs(s.v1 - s.v0 - 45 - 2 * 3 * 0.6) < 1.5, s);
  check("interrupted howl → stagger ~2.5s", st2.state === "flinch" && st2.t > 1.7, st2);

  // ---- v1.3 满势斩：读条中一刀 = 1.0 打断值 ----
  await waitFor(() => __q().state !== "flinch", null, 4000);
  await ev(() => {
    const q = __q();
    q.state = "chase";
    q.cool.summon_howl = 0;
    q.startAttack(q.def.attacks.find((x) => x.id === "summon_howl"), __game.player.pos);
    __game.player.momentum = 100;
  });
  await c.wait(150);
  s = await ev(() => {
    const P = __game.player, n0 = __evs("boss:interrupt").length;
    P._chargeId = (P._chargeId || 0) + 1;
    P.momentum = 0;
    __hit(10, { tags: ["melee", "basic", "charge"] });
    __hit(10, { tags: ["melee", "basic", "charge", "wave"] }); // 同一刀的剑气：不重复计
    return { ints: __evs("boss:interrupt").length - n0 };
  });
  check("full charge = 1.0 → interrupts howl (once per slash)", s.ints === 1, s);
  // 非读条招：满势斩打断预警（tag charge 放行眩晕）
  await waitFor(() => __q().state !== "flinch", null, 4000);
  s = await ev(() => {
    const q = __q(), w = __game.world;
    q.state = "chase";
    q.startAttack(q.def.attacks.find((x) => x.id === "sweep"), __game.player.pos);
    w.applyStatus(q.entity, "stun", { dur: 0.5, src: __game.player.entity, data: { tag: "charge", full: !0 } });
    return 1;
  });
  await c.wait(200);
  s = await ev(() => ({ atk: !!__q().atk, stun: __q().entity.statuses.has("stun") }));
  check("charge stun (v1.3) interrupts non-channel windup", !s.atk, s);
  await c.wait(600);

  // ---- 硬控折算：冻结不打断出招，+25 × 护盾 0.6 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, w = __game.world;
    if (C.broken) C.endBreak();
    __clearSt(q);
    q.state = "chase";
    C.poise = 30;
    C.breaks = 0;
    C.lastGain = C.time;
    const v0 = C.poise;
    q.startAttack(q.def.attacks.find((x) => x.id === "sweep"), __game.player.pos);
    w.applyStatus(q.entity, "stun", { dur: 1.4, data: { freeze: !0 } });
    return { v0, v1: C.poise, sh: !!(q.entity.shield && q.entity.shield.hp > 0) };
  });
  await c.wait(250);
  const fz = await ev(() => ({ atk: !!__q().atk, stun: __q().entity.statuses.has("stun") }));
  check("freeze → poise +25×0.6 (shield up), attack not interrupted", Math.abs(s.v1 - s.v0 - 15) < 0.5 && fz.atk && !fz.stun, { s, fz });
  await waitFor(() => !__q().atk, null, 4000);

  // ---- 狼威：完美闪身 +12（护盾不打折）、3 秒后回落、回落速度 × 气血 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, w = __game.world;
    if (C.broken) C.endBreak();
    C.breaks = 0;
    C.poise = 20;
    const v0 = C.poise;
    w.events.emit("player:perfectDodge", { attacker: q.entity });
    return { add: C.poise - v0 };
  });
  check("perfect dodge +12 (not shield-reduced)", Math.abs(s.add - 12) < 0.01, s);
  const rate = async (hpFrac) => {
    try {
      const setup = await ev((f) => {
        const q = __q(), C = q.ctrl, ent = q.entity;
        if (!ent.alive || C.mode !== "fight" || C.phase !== 1 || C.broken || C.moonLeap || ["dead", "return", "cinematic"].includes(q.state))
          return { valid: false, reason: "decay window precondition", state: q.state, mode: C.mode, phase: C.phase, broken: C.broken, moonLeap: !!C.moonLeap };
        // down 只停主动动作；Enemy.update 仍调用 ctrl.update，狼威衰减和玩法时间照走。
        window.__decayMeasure = { hp: ent.hp, moonCd: C.moonCd, moonLeap: C.moonLeap, state: q.state, stateT: q.t };
        __still(!0); // 结束已有攻击，避免测量期间随机撞柱/出伤混入狼威增益。
        ent.hp = ent.stats.get("hp") * f;
        C.poise = 60;
        C.lastGain = C.time - 10;
        Object.assign(__decayMeasure, { p: C.poise, t: C.time, phase: C.phase, gain0: __evs("boss:poiseGain").length, errors0: (__errors || []).length });
        return { valid: true };
      }, hpFrac);
      if (!setup.valid) return { ...setup, rate: null, dt: 0, gains: [] };
      const advanced = await waitFor(() => __q().ctrl.time - __decayMeasure.t >= 0.8, null, 8000);
      return await ev(({ advanced, hpFrac }) => {
        const q = __q(), C = q.ctrl, m = __decayMeasure, dt = C.time - m.t;
        const gains = __evs("boss:poiseGain").slice(m.gain0);
        const valid = advanced && dt > 0 && C.mode === "fight" && !C.broken && C.phase === m.phase &&
          q.state === "down" && !q.atk && gains.length === 0 && (__errors || []).length === m.errors0 &&
          Math.abs(q.entity.hp / q.entity.stats.get("hp") - hpFrac) < 1e-6;
        return { valid, advanced, dt, rate: dt > 0 ? (m.p - C.poise) / dt : null,
          p0: m.p, p1: C.poise, gains, state: q.state, atk: !!q.atk, mode: C.mode, broken: C.broken, phase: C.phase };
      }, { advanced, hpFrac });
    } finally {
      await ev(() => {
        const m = window.__decayMeasure;
        if (!m) return;
        const q = __q(), C = q.ctrl;
        // 只释放本窗口持有的长 down；异常转阶段/威折/死亡的新状态不能被 finally 覆写。
        if (q.state === "down" && q.t > 990 && !q.atk && C.mode === "fight" && !C.broken && C.phase === m.phase) {
          q.state = m.state === "down" ? "down" : "chase";
          q.t = m.state === "down" ? m.stateT : 0;
        }
        q.entity.hp = m.hp;
        if (C.moonCd === 999) C.moonCd = m.moonCd;
        if (!C.moonLeap) C.moonLeap = m.moonLeap;
        delete window.__decayMeasure;
      });
    }
  };
  const fullWindow = await rate(1), halfWindow = await rate(0.5);
  const rFull = fullWindow.rate, rHalf = halfWindow.rate;
  check("poise decays; at 50% hp decay = 0.7× full", fullWindow.valid && halfWindow.valid && rFull > 6 && Math.abs(rHalf / rFull - 0.7) < 0.08, { rFull, rHalf, fullWindow, halfWindow });
  await ev(() => (__q().entity.hp = __q().entity.stats.get("hp")));
  // 威折（一阶段：3.5 秒、易伤 +30%，无处决提示）
  s = await ev(() => {
    const q = __q(), C = q.ctrl;
    q.atk && q.endAttack(!0);
    C.poise = 99;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
    return { broken: C.broken, state: q.state, dur: C.downDur, vuln: q.entity.stats.get("vuln"), prompt: __evs("boss:execPrompt").length, max: C.poiseMax };
  });
  await c.wait(120);
  await c.shot("break");
  check("P1 break: down 3.5s, vuln +0.3, no exec prompt", s.broken && s.state === "down" && s.dur === 3.5 && Math.abs(s.vuln - 0.3) < 0.01 && s.prompt === 0, s);
  await waitFor(() => !__q().ctrl.broken, null, 6000);
  s = await ev(() => ({ max: __q().ctrl.poiseMax, vuln: __q().entity.stats.get("vuln"), breaks: __q().ctrl.breaks }));
  check("after break: threshold 125, vuln removed", Math.abs(s.max - 125) < 0.01 && s.vuln < 0.01, s);

  // ---- 撞柱：主角站在石柱后，青牙裂风三扑撞上 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player, T = __game.THREE;
    const p = C.arena.pillars.find((x) => x.alive && x.id === "fang_3");
    const center = new T.Vector3(50, 0, -22);
    const dir = new T.Vector3().subVectors(p.pos, center).setY(0).normalize();
    // 青牙在柱子靠场心一侧 3.2 米，主角在柱子另一侧 2.2 米
    const bp = p.pos.clone().addScaledVector(dir, -(p.r + 2.0));
    q.root.position.set(bp.x, q.root.position.y, bp.z);
    P.spawn(p.pos.x + dir.x * (p.r + 1.2), p.pos.z + dir.z * (p.r + 1.2));
    __clearSt(q);
    q.state = "chase";
    C.poise = 0;
    const sh = q.entity.shield;
    window.__sh0 = sh ? sh.hp : 0;
    q.startAttack(q.def.attacks.find((x) => x.id === "rend"), P.pos);
    return { pillar: p.id };
  });
  const crashed = await waitFor(() => __evs("boss:crash").length > 0, null, 4000);
  s = await ev(() => {
    const q = __q(), C = q.ctrl, p = C.arena.pillars.find((x) => x.id === "fang_3");
    const st = q.entity.statuses.get("stun");
    return { alive: p.alive, col: __game.ctx.colliders.includes(p.col), stun: st ? st.dur : 0, poise: C.poise, sh: q.entity.shield ? q.entity.shield.hp : 0, sh0: __sh0, max: q.entity.shield ? q.entity.shield.max : 0 };
  });
  check("rend into pillar → boss:crash, pillar broken & collider removed", crashed && !s.alive && !s.col, s);
  check("crash → stun 1.8s, +40 狼威, shield −35%", s.stun >= 1.7 && Math.abs(s.poise - 40) < 3 && Math.abs(s.sh0 - s.sh - Math.round(s.max * 0.35)) <= 2, s);
  await c.shot("crash");
  s = await ev(() => {
    const g = __evs("boss:poiseGain"), by = {};
    for (const x of g) by[x.d.kind] = Math.max(by[x.d.kind] || 0, x.d.n);
    return by;
  });
  // 撞晕窗口：普攻 ×0.6（骨甲顶住）、蓄势斩 ×1.4、法术 ×1.3
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player, ent = q.entity;
    const sh = ent.shield;
    if (sh && sh.hp > 0) __game.ctx.shields.breakShield(ent);
    __clearSt(q);
    ent.stats.removeSource("shieldBreak");
    const hp0 = ent.hp;
    const hit = (tags, el) => { const a = __game.world.dealDamage(P.entity, ent, { base: 100, noCrit: !0, tags, element: el }); return a ? a.amount : 0; };
    C.crashT = 0;
    const b0 = hit(["melee", "basic"]), c0 = hit(["melee", "basic", "charge"]), s0 = hit([], "metal");
    C.crashT = 1;
    const b1 = hit(["melee", "basic"]), c1 = hit(["melee", "basic", "charge"]), s1 = hit([], "metal");
    C.crashT = 0;
    ent.hp = hp0;
    return { b: +(b1 / b0).toFixed(2), c: +(c1 / c0).toFixed(2), sp: +(s1 / s0).toFixed(2) };
  });
  check("crash window: basic ×0.6, charge ×1.4, spell ×1.3", Math.abs(s.b - 0.6) < 0.03 && Math.abs(s.c - 1.4) < 0.03 && Math.abs(s.sp - 1.3) < 0.03, s);
  s = await ev(() => {
    const g = __evs("boss:poiseGain"), by = {};
    for (const x of g) by[x.d.kind] = Math.max(by[x.d.kind] || 0, x.d.n);
    return by;
  });
  check("poise feedback events per source: interrupt / charge / totem / freeze / perfect / crash", ["interrupt", "totem", "freeze", "perfect", "crash"].every((k) => s[k] > 0) && Math.abs(s.interrupt - 45) < 0.6 && Math.abs(s.crash - 40) < 0.6, s);
  // 快折了的预兆：涨过 75% 发 near on（只一次）
  s = await ev(() => {
    const q = __q(), C = q.ctrl;
    __clearSt(q);
    C.poise = C.poiseMax * 0.7;
    const n0 = __evs("boss:poiseNear").length;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
    const near = __evs("boss:poiseNear").slice(n0);
    C.lastGain = C.time + 5; // 截图期间不回落
    return { near: near.map((x) => x.d.on), cur: C.near, broken: C.broken };
  });
  await c.wait(900);
  await c.shot("poise_near");
  await ev(() => ((__q().ctrl.poise = 0), (__q().ctrl.lastGain = __q().ctrl.time)));
  check("near-full omen: poiseNear on once past 75%", s.near.length >= 1 && s.near[0] === !0 && s.near.filter((x) => x).length === 1, s);
  await c.wait(400);
  s = await ev(() => ({ near: __q().ctrl.near, last: __evs("boss:poiseNear").slice(-1)[0].d.on }));
  check("omen clears when poise falls below 60%", !s.near && s.last === !1, s);
  await c.wait(2700);

  // ---- 撤退：主角出谷 → 首领回巢回满，门关，围栏撤 ----
  await ev(() => {
    const q = __q();
    q.entity.hp = q.entity.stats.get("hp") * 0.6;
    __game.player.spawn(58, -44);
  });
  await c.wait(600);
  s = await ev(() => {
    const q = __q(), C = q.ctrl;
    return { ret: __evs("boss:retreat").length, mode: C.mode, hp: q.entity.hp / q.entity.stats.get("hp"), gate: C.arena.gates.isOn("mist_n"), fence: !!__game.ctx.flyFence, state: q.state };
  });
  check("leave pit → boss:retreat, full hp, gates off, fence off", s.ret >= 1 && s.hp > 0.999 && !s.gate && !s.fence && (s.mode === "reset" || s.mode === "asleep"), s);
  await waitFor(() => __q().ctrl.mode === "asleep", null, 30000);

  // ---- 再入谷：短版入场 1.2 秒（流程组计第 2 次）----
  await ev(() => __game.player.spawn(50, -15));
  await waitFor(() => __q().ctrl.mode === "intro", null, 5000);
  s = await ev(() => __evs("boss:introStart").slice(-1)[0].d);
  check("second intro is short (1.2s)", s && s.short && s.dur === 1.2, s);
  check("hint not repeated on second intro", s && !s.hint, s && s.hint);
  await waitFor(() => __q().ctrl.mode === "fight", null, 4000);
  s = await ev(() => {
    const L = __game.profile.stats.bossLog && __game.profile.stats.bossLog.qingya;
    return L ? { tries: L.tries, retreats: L.retreats } : null;
  });
  check("save (bossflow): tries 2, retreats 1", s && s.tries === 2 && s.retreats >= 1, s);

  // ---- 御剑围栏（筑基存档才有御剑）----
  s = await ev(() => {
    const G = __game, P = G.player, T = G.THREE;
    G.profile.unlocks.swordFly = !0;
    P.spawn(31, -20);
    P.dashCharges = 2;
    const ok = P.trySwordFly(new T.Vector3(-1, 0, 0));
    return { ok, denied: __evs("player:swordFlyDenied").map((x) => x.d.reason) };
  });
  check("sword fly fenced during fight (墨雾封谷)", !s.ok && s.denied.includes("fence"), s);
  await ev(() => (__game.profile.unlocks.swordFly = !1));

  // ---- 转阶段：破木盾、气血压到 49% ----
  await ev(() => {
    const q = __q();
    __game.player.spawn(50, -15);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __clearSt(q);
    q.entity.hp = q.entity.stats.get("hp") * 0.49;
  });
  const tr = await waitFor(() => __q().ctrl.mode === "transition", null, 4000);
  s = await ev(() => {
    const q = __q(), ph = __evs("boss:phase").slice(-1)[0];
    const a = __hit(100);
    return { ph: ph && ph.d, dmg: a ? a.amount : 0, sh: q.entity.shield && q.entity.shield.element };
  });
  check("transition: boss:phase dur 3.6, invulnerable, old shield gone", tr && s.ph && s.ph.phase === 2 && s.ph.dur === 3.6 && !s.sh && !s.dmg, s);
  await c.wait(1800);
  await c.shot("transition");
  await waitFor(() => __q().ctrl.mode === "fight", null, 5000);
  s = await ev(() => {
    const C = __q().ctrl;
    __q().entity.stats.removeSource("howl"); // 召狼长嚎 / 月华的移速加成不算
    __q().entity.stats.removeSource("qyMoon");
    return { phase: C.phase, veil: C.veil, spots: C.moonSpots().length, move: +__q().entity.stats.get("move").toFixed(2), st: [...__q().entity.statuses.keys()], qs: __q().state, sh: __q().entity.shield && __q().entity.shield.element, look: !!C.look };
  });
  check("phase 2: moon veil 1, 2 moon spots, move +15%, earth shield reborn", s.phase === 2 && s.veil >= 0.99 && s.spots === 2 && Math.abs(s.move - 5.4 * 1.15) < 0.05 && s.sh === "earth", s);

  // ---- 背甲弱点：正面 vs 背后，月光里 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player, ent = q.entity;
    if (ent.shield && ent.shield.hp > 0) __game.ctx.shields.breakShield(ent);
    __clearSt(q);
    ent.stats.removeSource("shieldBreak");
    __still(!0);
    q.yaw = 0;
    q.root.rotation.y = 0;
    // 把青牙放到不在月光里的地方
    const spots = C.moonSpots();
    let pos = null;
    for (const [x, z] of [[50, -22], [47, -24], [53, -21], [50, -26]]) if (!spots.some((s) => Math.hypot(s.x - x, s.z - z) < 4.2)) (pos = [x, z]);
    q.root.position.set(pos[0], q.root.position.y, pos[1]);
    const hp0 = ent.hp;
    P.spawn(pos[0], pos[1] + 3); // 面向 +z：正前方
    const f = __hit(100);
    P.spawn(pos[0], pos[1] - 3); // 背后
    const b = __hit(100);
    // 月光里
    const sp = spots[0];
    q.root.position.set(sp.x, q.root.position.y, sp.z);
    P.spawn(sp.x, sp.z - 3);
    const m = __hit(100);
    ent.hp = hp0;
    return { f: f && f.amount, b: b && b.amount, m: m && m.amount, inMoon: C.inMoon(q.pos) };
  });
  check("weak point: back ×1.35, in moonlight ×1.6", s.f > 0 && Math.abs(s.b / s.f - 1.35) < 0.03 && Math.abs(s.m / s.f - 1.6) < 0.03, s);

  // ---- 月下无影：主角站在月光里，影袭不从身后现身 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player;
    const sp = C.moonSpots()[0];
    P.spawn(sp.x, sp.z);
    __still(!1);
    q.root.position.set(sp.x + 8, q.root.position.y, sp.z);
    q.startAttack(q.def.attacks.find((x) => x.id === "shadow"), P.pos);
    return { inMoon: C.inMoon(P.pos) };
  });
  await waitFor(() => __evs("boss:moonDenied").length > 0 || !__q().atk, null, 4000);
  s = await ev(() => {
    const q = __q(), P = __game.player;
    return { denied: __evs("boss:moonDenied").length, d: Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) };
  });
  check("moonlight: shadow strike lands away from hero", s.denied >= 1 && s.d > 4, s);
  await waitFor(() => !__q().atk, null, 4000);

  // ---- 二阶段招式：60 秒内（主角无敌、偶尔绕到背后）----
  await ev(() => {
    __B.tele = [];
    const q = __q();
    q.ctrl.moonCd = 1;
    __still(!1);
    q.ctrl.moonCd = 1;
    __game.player.spawn(50, -16);
  });
  for (let i = 0; i < 45; i++) {
    await c.wait(2000);
    const seen = await ev((i) => {
      const q = __q(), P = __game.player;
      // 轮流：绕到它背后（回首咬要主角在背后累计 1.2 秒）/ 退到 8 米外（影袭最短 3 米）/ 原地
      if (q && !q.atk && q.ctrl.mode === "fight") {
        if (i % 3 === 0) P.spawn(q.pos.x - Math.sin(q.yaw) * 2.6, q.pos.z - Math.cos(q.yaw) * 2.6);
        else if (i % 3 === 1) P.spawn(50 + (q.pos.x < 50 ? 6 : -6), -22 + (q.pos.z < -22 ? 6 : -6));
      }
      return [...new Set(__B.tele)];
    }, i);
    if (["rend2", "sweep2", "bite_double", "turn_bite", "shadow", "moon_howl"].every((x) => seen.includes(x))) break;
  }
  s = await ev(() => [...new Set(__B.tele)]);
  const p2 = ["bite_double", "turn_bite", "shadow", "moon_howl"];
  check("phase-2 moves seen (双噬 / 回首咬 / 影袭 / 啸月)", p2.every((x) => s.includes(x)), s);
  check("no phase-1 moves in phase 2", !s.some((x) => ["summon_howl", "rend", "sweep", "bite"].includes(x)), s);
  await c.shot("phase2");

  // ---- 威折处决（二阶段）：F → 2.4 秒，12% 最大气血 + 4 攻，不致死 ----
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    q.state = "chase";
    __clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __clearSt(q);
    q.entity.stats.removeSource("shieldBreak");
    q.entity.hp = q.entity.stats.get("hp") * 0.4;
    P.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
    C.poise = C.poiseMax - 1;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
    const pr = __evs("boss:execPrompt").slice(-1)[0];
    window.__hp0 = q.entity.hp;
    return { broken: C.broken, prompt: pr && pr.d, atk: P.entity.stats.get("atk"), max: q.entity.stats.get("hp") };
  });
  check("P2 break → exec prompt (break)", s.broken && s.prompt && s.prompt.kind === "break" && s.prompt.on, s);
  const atk = s.atk, maxHp = s.max;
  await c.wait(700);
  await c.shot("exec_prompt");
  await c.wait(150);
  await page.keyboard.press("KeyF");
  const ex = await waitFor(() => __evs("boss:execute").length > 0, null, 3000);
  s = await ev(() => ({ e: __evs("boss:execute")[0].d, hero: __game.player.state }));
  check("F → boss:execute break, dur 2.4, hero cine", ex && s.e.kind === "break" && s.e.dur === 2.4 && s.hero === "cine", s);
  await c.wait(1000);
  await c.shot("exec_break");
  await waitFor(() => __evs("boss:execEnd").length > 0, null, 5000);
  await c.wait(700);
  s = await ev(() => {
    const q = __q();
    return { lost: __hp0 - q.entity.hp, alive: q.alive, ts: __game.world.timeScale, cine: __game.ctx.rig.cineActive, hero: __game.player.state, mode: q.ctrl.mode };
  });
  const want = Math.round(maxHp * 0.12 + atk * 4);
  check("break execution damage = 12% max + 4 atk (± vuln), boss alive", s.alive && s.lost >= want * 0.98 && s.lost <= want * 1.32 + 2, { ...s, want });
  check("after execution: timeScale 1, camera released, hero free", s.ts === 1 && !s.cine && s.hero !== "cine", s);

  // ---- 终结处决：气血归零 → 伏地不死 → F 完整版 4 秒 ----
  await waitFor(() => !__q().ctrl.broken, null, 3000);
  s = await ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    C.moonCd = 999;
    q.state = "chase";
    __clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __clearSt(q);
    q.entity.stats.removeSource("shieldBreak");
    const hp0 = q.entity.hp, a = __hit(q.entity.hp * 3 + 2000);
    return { hp0, amt: a && a.amount, mode: C.mode, st: q.state, sh: q.entity.shield && q.entity.shield.hp, after: q.entity.hp };
  });
  c.log("lethal", JSON.stringify(s));
  await c.wait(200);
  s = await ev(() => {
    const q = __q(), C = q.ctrl;
    const pr = __evs("boss:execPrompt").filter((x) => x.d.kind === "final").slice(-1)[0];
    __game.player.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
    return { alive: q.alive, hp: q.entity.hp, mode: C.mode, prompt: pr && pr.d };
  });
  check("lethal hit → 气竭 (hp 1, final, prompt)", s.alive && s.hp === 1 && s.mode === "final" && s.prompt && s.prompt.on, s);
  await c.wait(200);
  await page.keyboard.press("KeyF");
  await waitFor(() => __evs("boss:execute").some((x) => x.d.kind === "final"), null, 3000);
  s = await ev(() => __evs("boss:execute").filter((x) => x.d.kind === "final")[0].d);
  check("final execution first time: 4.0s full", s && s.dur === 4 && !s.short, s);
  await c.wait(1400);
  await c.shot("exec_final");
  await waitFor(() => __evs("boss:defeated").length > 0, null, 6000);
  await waitFor(() => !!(__game.ctx.feedback.lastGain && __game.ctx.feedback.lastGain.boss), null, 6000);
  await c.wait(350);
  await c.shot("insight");
  await c.wait(1500);
  s = await ev(() => {
    const L = __game.profile.stats.bossLog && __game.profile.stats.bossLog.qingya;
    return { cine: __game.ctx.rig.cineActive, hero: __game.player.state, defeated: __evs("boss:defeated").length, exit: (__game.run.extracts || []).some((x) => x.id === "boss_exit"), gate: false, kills: L && L.kills, exec: L && L.execs, flag: !!__game.profile.flags.boss_qingya, ts: __game.world.timeScale };
  });
  check("boss defeated by execution → exit, kill logged, flag set", s.defeated >= 1 && s.exit && s.kills === 1 && s.flag, s);
  check("final execution completes after death: timeScale 1, camera released, hero free", s.ts === 1 && !s.cine && s.hero !== "cine", s);
  s = await ev(() => __game.ctx.feedback.lastGain || null);
  check("kill → 感悟 +N floats over the boss", s && s.boss && s.n > 0, s);

  // ---- 自动短版：再刷一只，气竭后 6 秒不按 F ----
  s = await ev(() => {
    const E = __enemies, T = __game.THREE;
    __game.player.spawn(50, -15);
    const e = E.spawn("qingya", new T.Vector3(50, 0, -22), {});
    return !!(e && e.ctrl);
  });
  await waitFor(() => !!__q() && __q().ctrl && __q().ctrl.mode === "fight", null, 9000);
  s = await ev(() => {
    const q = __q();
    if (!q) return { none: 1 };
    q.ctrl.startIntro && q.ctrl.mode === "asleep" && q.ctrl.startIntro("hit");
    return { mode: q.ctrl.mode };
  });
  await waitFor(() => __q() && __q().ctrl.mode === "fight", null, 6000);
  // 一阶段不能一刀跳过：先打一刀巨伤 → 停在 50% 并转阶段
  s = await ev(() => {
    const q = __q();
    __clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __clearSt(q);
    __hit(1e6);
    return { hp: q.entity.hp / q.entity.stats.get("hp"), alive: q.alive };
  });
  await waitFor(() => __q() && __q().ctrl.mode === "transition", null, 3000);
  const trMode = await ev(() => __q().ctrl.mode);
  check("phase 1 can't be skipped: huge hit stops at 50% → transition", s.alive && Math.abs(s.hp - 0.5) < 0.001 && (trMode === "transition" || __q), { ...s, trMode });
  await waitFor(() => __q() && __q().ctrl.mode === "fight", null, 6000);
  const n0 = await ev(() => __evs("boss:execute").length);
  await ev(() => {
    const q = __q();
    q.atk && q.endAttack(!0);
    q.ctrl.moonLeap = null;
    q.ctrl.moonCd = 999;
    q.state = "chase";
    __clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __clearSt(q);
    const a = __hit(q.entity.hp * 3 + 2000);
    window.__dbgHit = { amt: a && a.amount, mode: q.ctrl.mode, st: q.state, sh: q.entity.shield && q.entity.shield.hp, ph: q.ctrl.phase };
    // 站远一点（不在处决距离内、但仍在谷里）
    const dx = 50 - q.pos.x, dz = -22 - q.pos.z, d = Math.hypot(dx, dz) || 1;
    __game.player.spawn(q.pos.x + (dx / d) * 6, q.pos.z + (dz / d) * 6);
  });
  c.log("second boss", JSON.stringify(await ev(() => ({ mode: __q() && __q().ctrl.mode, hp: __q() && __q().entity.hp, hit: window.__dbgHit }))));
  const auto = await waitFor((n) => __evs("boss:execute").length > n, n0, 9000);
  s = await ev(() => ({ ...__evs("boss:execute").slice(-1)[0].d, all: __evs("boss:execute").map((x) => [x.d.kind, x.d.dur, x.t]) }));
  check("no F for 6s → auto short final (2.0s)", auto && s.kind === "final" && s.short && s.dur === 2, s);
  await waitFor(() => !__q(), null, 6000);

  // ---- 精英击杀也浮出感悟 ----
  s = await ev(() => {
    const E = __enemies, T = __game.THREE, P = __game.player;
    const e = E.spawn("wolf_elite", new T.Vector3(P.pos.x + 3, 0, P.pos.z), { forceElite: !0 });
    if (!e) return { none: 1 };
    e.entity.tags.add("elite");
    if (e.entity.shield) __game.ctx.shields.breakShield(e.entity);
    window.__fbBefore = __game.ctx.feedback.lastGain && __game.ctx.feedback.lastGain.at;
    __game.world.dealDamage(P.entity, e.entity, { base: 1e6, noCrit: !0 });
    return { alive: e.alive };
  });
  await waitFor(() => __game.ctx.feedback.lastGain && __game.ctx.feedback.lastGain.at !== __fbBefore, null, 3000);
  s = await ev(() => __game.ctx.feedback.lastGain);
  check("elite kill → 感悟 +N float", s && !s.boss && s.n > 0, s);
  // ---- 结算页写清感悟：身陨也不失、修为 a → b ----
  await ev(() => (__game.player.debug.god = !1, __game.debug && __game.debug.die ? __game.debug.die() : __game.run.die()));
  const res = await waitFor(() => !!document.querySelector(".mk-result .seg1 .xp .n2"), null, 15000);
  s = await ev(() => [...document.querySelectorAll(".mk-result .seg1 .xp .n")].map((x) => x.textContent));
  check("result: 本局感悟 +N · 斩妖即入修为，身陨不失 / 修为 a → b", res && /本局感悟 \+\d+ · 斩妖即入修为，身陨不失/.test(s[0] || "") && /修为|圆满|已满/.test(s[1] || ""), s);
  await c.wait(1500);
  await c.shot("result_death");
  const errs = await ev(() => window.__errors || []);
  check("no page errors", !errs.length, errs.slice(0, 3));
  c.log("SUMMARY " + R.filter(Boolean).length + "/" + R.length);
}
