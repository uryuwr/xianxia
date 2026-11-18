// 首领战流程（模块 A，docs/design/boss_青牙_v2.md §10.2 第 7 项）：狼骨门提示、入场 boss:intro、墨雾门读条撤出、首领不吃天时、bossLog 存档、首次演出标记。
// 战斗控制器还在做：处决 / 击败 / 转阶段用模拟事件（§10.1 约定）。主策的 boss_qingya 场景建好后，存档断言并过去。
// 用法：node tools/run.mjs boss_flow "scene=run&region=r1&slot=5"
const ok = (v, name, extra) => console.log(`${v ? "PASS" : "FAIL"} ${name}${extra !== undefined ? " " + JSON.stringify(extra).slice(0, 500) : ""}`);

export default async function (page, c) {
  const waitFor = async (fn, arg, ms = 8000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout: ms });
      return !0;
    } catch {
      return !1;
    }
  };
  ok(await waitFor(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, 90000), "r1 run ready");
  await waitFor(() => { const l = document.querySelector(".mk-layer-loading"); return !l || l.classList.contains("hidden"); }, null, 20000);
  await c.wait(800);
  await c.ev(() => {
    __game.debug.realm(1, 2);
    __game.player.debug.god = !0;
    const P = __game.profile;
    delete P.flags.boss_qingya;
    delete P.flags.bossIntro_qingya;
    if (P.stats.bossLog) delete P.stats.bossLog.qingya;
    window.__bev = [];
    for (const k of ["boss:intro", "boss:retreat"]) __game.world.events.on(k, (d) => window.__bev.push({ k, first: d.first, tries: d.tries, best: d.best, cause: d.cause }));
  });
  const tp = (x, z) => c.ev(([x, z]) => __game.player.spawn(x, z), [x, z]);
  const pts = await c.ev(() => {
    const p = __game.run.map.points, b = p.boss, g = p.bossGate, m = b.gates[0];
    const mp = Array.isArray(m.pos) ? m.pos : [m.pos.x, m.pos.z];
    return { boss: [b.pos.x, b.pos.z], trig: b.trigger, gate: [g.pos.x, g.pos.z], gr: g.r, mist: mp };
  });

  // 1 狼骨门提示：{realm} 换成境界标签（首领未生成：按 ENEMY_TYPES.qingya.realm + 神识规则），第二行 sub
  await tp(pts.gate[0], pts.gate[1]);
  ok(await waitFor(() => /此去/.test((document.querySelector(".mk-gatehint.on") || {}).textContent || ""), null, 3000), "gate hint shows near 狼骨门");
  const h1 = await c.ev(() => {
    const B = __game.run.boss, e = B.e;
    B.e = null; // 首领还没生成时的换算（ENEMY_TYPES.qingya.realm + 神识规则）
    const pre = B.realmText("qingya");
    B.e = e;
    return { t: document.querySelector(".mk-gatehint").firstChild.textContent, sub: (document.querySelector(".mk-gatehint small") || {}).textContent, pre };
  });
  ok(h1.pre === "练气?" && h1.t === "此去：狼王青牙 · 练气? · 宜练气六层以上" && h1.sub === "谷中可读条穿雾而退", "练二：{realm} → 练气?（神识不够）+ sub line", h1);
  await c.shot("gate_l2");
  // 斩过之后看得清
  await tp(pts.gate[0], pts.gate[1] + pts.gr + 8);
  await c.wait(300);
  await c.ev(() => (__game.profile.flags.boss_qingya = !0));
  await tp(pts.gate[0], pts.gate[1]);
  ok(await waitFor(() => /练气七层/.test((document.querySelector(".mk-gatehint.on") || {}).textContent || ""), null, 3000), "after first kill: {realm} → 练气七层", await c.ev(() => document.querySelector(".mk-gatehint").textContent));
  await c.ev(() => delete __game.profile.flags.boss_qingya);

  // 2 首领生成（入夜也不吃天时属性）
  await c.ev(() => (__game.run.t = __game.run.R.phases[2] + 1));
  await c.wait(300);
  await tp(pts.boss[0] + 15, pts.boss[1]);
  ok(await waitFor(() => __game.run.boss.e && __game.run.boss.e.alive, null, 10000), "boss spawned near its pit");
  const ph = await c.ev(() => {
    const e = __game.run.boss.e, w = __game.ctx.enemies.spawn("wolf", __game.player.pos.clone().add(new __game.THREE.Vector3(30, 0, 0)));
    if (w) __game.run.buffEnemy(w);
    return { phase: __game.run.phase, boss: e.entity.stats.mods.filter((m) => m.source === "phase").length, wolf: w ? w.entity.stats.mods.filter((m) => m.source === "phase").length : -1 };
  });
  ok(ph.phase === 3 && ph.boss === 0 && ph.wolf > 0, "boss ignores 天时 stat buffs (wolves still get them)", ph);
  ok(await c.ev(() => !__game.run.boss.fight && !window.__bev.length), "no intro before entering the trigger circle");

  // 3 入场：进 trigger 圈 → boss:intro（首次）
  await tp(pts.boss[0] + pts.trig - 2, pts.boss[1]);
  ok(await waitFor(() => window.__bev.some((e) => e.k === "boss:intro"), null, 3000), "entering trigger circle → boss:intro");
  const in1 = await c.ev(() => ({ ev: window.__bev.find((e) => e.k === "boss:intro"), flag: __game.profile.flags.bossIntro_qingya, log: __game.profile.stats.bossLog.qingya }));
  ok(in1.ev.first === !0 && in1.ev.tries === 1 && in1.ev.cause === "enter" && in1.flag === 1 && in1.log.tries === 1, "first intro: first=true, tries=1, 首次演出标记已写", in1);

  // 4 墨雾门：松开即停、受击打断、按满 1.5 秒穿雾而出
  await c.ev(() => {
    const e = __game.run.boss.e;
    e.entity.hp = e.entity.stats.get("hp") * 0.6;
    __game.world.events.emit("boss:phase", { boss: e, phase: 2 });
  });
  await tp(pts.mist[0], pts.mist[1]);
  ok(await waitFor(() => /穿雾/.test(__game.run.hint || ""), null, 3000), "near 墨雾门: hint 按住 F · 穿雾而退", await c.ev(() => __game.run.hint));
  await page.keyboard.down("KeyF");
  await c.wait(600);
  const mid = await c.ev(() => ({ kind: __game.run.channel && __game.run.channel.kind, t: __game.run.channel && __game.run.channel.t, ring: document.querySelector(".mk-chan").classList.contains("on") }));
  await page.keyboard.up("KeyF");
  await c.wait(200);
  ok(mid.kind === "mist" && mid.t > 0.3 && mid.ring && !(await c.ev(() => __game.run.channel)) && !(await c.ev(() => window.__bev.some((e) => e.k === "boss:retreat"))), "hold F channels (ring shown); releasing F stops it", mid);
  await page.keyboard.down("KeyF");
  await c.wait(400);
  const hit = await c.ev(() => {
    const t0 = __game.run.channel ? __game.run.channel.t : -1;
    __game.world.events.emit("damage", { target: __game.player.entity, amount: 5, attacker: __game.run.boss.e.entity });
    return { t0, after: __game.run.channel ? __game.run.channel.t : null };
  });
  ok(hit.t0 > 0.2 && hit.after === null, "a hit interrupts the 穿雾 channel (progress lost; still holding F starts over)", hit);
  await page.keyboard.up("KeyF");
  await c.wait(150);
  await page.keyboard.down("KeyF");
  await c.wait(1900);
  await page.keyboard.up("KeyF");
  const rt = await c.ev(([mx, mz, bx, bz]) => {
    const e = __game.run.boss.e, p = __game.player.pos;
    return { ev: window.__bev.some((x) => x.k === "boss:retreat"), hp: e.entity.hp / e.entity.stats.get("hp"), out: Math.hypot(p.x - bx, p.z - bz) > Math.hypot(mx - bx, mz - bz) + 2, fight: !!__game.run.boss.fight, log: __game.profile.stats.bossLog.qingya };
  }, [pts.mist[0], pts.mist[1], pts.boss[0], pts.boss[1]]);
  ok(rt.ev && rt.hp >= 0.999 && rt.out && !rt.fight, "1.5 s hold → boss:retreat, player outside the mist gate, boss back to full hp", rt);
  const L1 = rt.log;
  ok(L1.retreats === 1 && L1.best && L1.best.phase === 2 && Math.abs(L1.best.hpLeft - 0.6) < 0.02 && L1.best.realm === "1:2" && L1.log.length === 1 && L1.log[0].result === "retreat", "bossLog after retreat: retreats 1, best { phase 2, hpLeft 0.6 }, log entry", L1);
  await c.shot("mist_out");

  // 5 再进：第二次（短版）+ 处决 + 击败（模拟控制器事件）
  await tp(pts.boss[0] + pts.trig - 2, pts.boss[1]);
  ok(await waitFor(() => window.__bev.filter((e) => e.k === "boss:intro").length === 2, null, 3000), "second intro");
  const in2 = await c.ev(() => window.__bev.filter((e) => e.k === "boss:intro")[1]);
  ok(in2.first === !1 && in2.tries === 2 && in2.best && in2.best.phase === 2, "second intro: first=false, tries=2, carries best", in2);
  // 控制器直接发 boss:intro（被打开战）时不重复计数
  await c.ev(() => __game.world.events.emit("boss:intro", { boss: __game.run.boss.e, cause: "hit" }));
  ok(await c.ev(() => __game.profile.stats.bossLog.qingya.tries === 2), "external boss:intro during a fight is not double-counted");
  await c.ev(() => {
    const e = __game.run.boss.e;
    __game.world.events.emit("boss:execute", { boss: e, kind: "break", dmg: 100 });
    __game.world.events.emit("boss:execute", { boss: e, kind: "final", dmg: 100 });
  });
  // 留在狼谷里（青牙控制器：主角离谷 = 撤退回满，会先把这一场记成撤退）
  await tp(pts.boss[0] + 6, pts.boss[1]);
  await c.wait(200);
  await c.ev(() => __game.world.events.emit("boss:defeated", { boss: __game.run.boss.e, executed: !0 }));
  const L2 = await c.ev(() => ({ L: __game.profile.stats.bossLog.qingya, f: __game.profile.flags }));
  ok(L2.L.kills === 1 && L2.L.firstKill && L2.L.firstKill.realm === "1:2" && L2.L.firstKill.sec >= 0 && L2.L.fastest === L2.L.firstKill.sec && L2.L.best.hpLeft === 0 && L2.L.execs.break === 1 && L2.L.execs.final === 1 && L2.f.bossExec_qingya_final === 1 && L2.L.log.length === 2 && L2.L.log[1].result === "kill", "kill: kills 1, firstKill, fastest, best only improves, execs + 处决首次标记", L2.L);

  // 6 身陨计入 deaths；log 只留最近 10 次；结算后存档里有 bossLog
  await c.ev(() => {
    const L = __game.profile.stats.bossLog.qingya;
    for (let k = 0; k < 9; k++) L.log.push({ run: 0, realm: "1:1", result: "retreat", phase: 1, hpLeft: 1, sec: 1 });
  });
  await tp(pts.boss[0] + pts.trig - 2, pts.boss[1]);
  ok(await waitFor(() => !!__game.run.boss.fight, null, 3000), "third fight starts");
  await c.ev(() => __game.debug.die());
  ok(await waitFor(() => __game.flow.name === "result", null, 10000), "death → result");
  const L3 = await c.ev(() => {
    const L = __game.profile.stats.bossLog.qingya;
    const saved = Object.keys(localStorage).map((k) => localStorage.getItem(k)).find((v) => v && v.includes('"bossLog"'));
    return { deaths: L.deaths, tries: L.tries, n: L.log.length, last: L.log[L.log.length - 1], best: L.best, saved: !!saved };
  });
  ok(L3.deaths === 1 && L3.tries === 3 && L3.n === 10 && L3.last.result === "death" && L3.best.hpLeft === 0 && L3.saved, "death: deaths 1, log capped at 10, best kept, saved to storage", L3);
  ok(!(await c.ev(() => (window.__errors || []).length)), "no errors", await c.ev(() => window.__errors));
}
