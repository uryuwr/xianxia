// 关卡模块（B）可运行测试：建 r1 / r2 / 教学局；点位检查（可站、不在碰撞体里、从入口可达）；
// 反复建拆不泄漏；天时 0→1；帧时间；各区域总览 / 游玩视角 × 昼 / 夜截图。
// 其他模块改文件时 Vite 会整页刷新：遇到刷新就等页面重新就绪后整段重做
export default async function (page, c) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.waitForFunction(() => window.__ready === true && window.__game && window.__game.loadLevel, null, { timeout: 120000 });
      return await body(page, c);
    } catch (e) {
      if (!/context was destroyed|navigation|loadLevel is not a function|Target closed/i.test(String(e))) throw e;
      c.log("页面被刷新，重试", attempt + 1);
      await c.wait(2000);
    }
  }
  throw new Error("页面反复刷新，放弃");
}
async function body(page, c) {
  await c.wait(1500);
  const has = await c.ev(() => !!(window.__game && window.__game.loadLevel));
  if (!has) throw new Error("__game.loadLevel 不存在");
  const mem = () => c.ev(() => { const i = window.__game.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, progs: i.programs ? i.programs.length : 0 }; });
  c.log("mem(start)", JSON.stringify(await mem()));
  const report = {};
  for (const id of ["r1", "r2", "tutorial"]) {
    const info = await c.ev(async (id) => {
      const g = window.__game;
      const lv = await g.loadLevel(id, 7);
      const P = lv.points;
      const all = [];
      const add = (kind, p, extra) => p && all.push({ kind, x: p.pos ? p.pos.x : p.x, z: p.pos ? p.pos.z : p.z, own: p.object ? p.object.userData.colliders || [] : [], ...extra });
      P.entries.forEach((p) => add("entry", p));
      P.extracts.forEach((p) => add("extract:" + p.kind, p));
      P.chests.forEach((p) => add("chest:" + p.tier, p));
      P.gathers.forEach((p) => add("gather:" + p.kind, p));
      P.glows.forEach((p) => add("glow:" + p.kind, p));
      P.elites.forEach((p) => add("elite", p));
      P.ruins.forEach((p) => add("den:" + p.id, p, { need: p.need }));
      P.spawns.forEach((p) => add("spawn", p));
      (P.pavilions || []).forEach((p) => add("pavilion:" + p.id, p));
      (P.steles || []).forEach((p) => add("stele:" + p.id, p));
      if (P.boss) add("boss", P.boss), P.boss.exit && add("boss-exit", { pos: P.boss.exit }), (P.boss.adds || []).forEach((p) => add("boss-add", { pos: p }));
      (P.steps || []).forEach((p) => add("step:" + p.id, p));
      (P.encounters || []).forEach((p) => add("encounter", p));
      (P.relics || []).forEach((p) => add("relic", p));
      (P.shrines || []).forEach((p) => add("shrine:" + p.el, p));
      const bad = [];
      for (const q of all) {
        const h = lv.height(q.x, q.z);
        const walk = h > -0.8 && [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dz]) => Math.abs(lv.height(q.x + dx, q.z + dz) - h) <= 0.55);
        const inCol = lv.colliders.some((cc) => !q.own.includes(cc) && (q.x - cc.x) ** 2 + (q.z - cc.z) ** 2 < (cc.r + 0.32) ** 2);
        const rr = 1.2 + Math.max(0, ...q.own.filter((cc) => Math.hypot(cc.x - q.x, cc.z - q.z) < 2).map((cc) => cc.r + 0.4 + Math.hypot(cc.x - q.x, cc.z - q.z)));
        const reach = lv.reachable(q.x, q.z, !1, rr), reachJ = lv.reachable(q.x, q.z, !0, rr);
        if (!walk || inCol || !reachJ) bad.push({ kind: q.kind, x: +q.x.toFixed(1), z: +q.z.toFixed(1), h: +h.toFixed(2), walk, inCol, reachJ });
        q.reach = reach;
        q.reachJ = reachJ;
      }
      const jumpOnly = all.filter((q) => !q.reach && q.reachJ).map((q) => q.kind);
      // 需要二段跳的点（遗府）不带二段跳必须到不了
      const gateBreak = all.filter((q) => q.need && q.reach).map((q) => q.kind);
      // 教学局：墨雾围栏之外不可站
      const fence = P.bounds ? [[40, 30], [-74, 40], [0, -10]].map(([x, z]) => lv.canStand(x, z, lv.height(x, z))) : null;
      // 深水：河道折线点（离桥 / 渡口 5 米以外）应是深水、不可站；桥 / 踏石中点可站；渡口可涉水；御剑（fly）可越过深水
      const D = lv.def, near = (x, z, list, r) => list.some(([a, b]) => Math.hypot(a - x, b - z) < r);
      const crossings = [...(D.bridges || []).map((b) => [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2]), ...(D.rivers || []).flatMap((r) => (r.fords || []).map((f) => f.at))];
      const rp = (D.rivers || []).flatMap((r) => r.path).filter(([x, z]) => Math.abs(x) < D.size[0] / 2 - 4 && Math.abs(z) < D.size[1] / 2 - 4 && !near(x, z, crossings, 5));
      const deepHits = rp.filter(([x, z]) => lv.isDeepWater && lv.isDeepWater(x, z) && !lv.canStand(x, z, lv.ground(x, z)));
      const water = {
        deep: deepHits.length + "/" + rp.length,
        bridges: (D.bridges || []).map((b) => b.name + ":" + (lv.height((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2) > -0.8 ? "ok" : "X")).join(","),
        fords: (D.rivers || []).flatMap((r) => r.fords || []).map((f) => (f.name || "渡口") + ":" + (lv.isFord(f.at[0], f.at[1]) && lv.height(f.at[0], f.at[1]) > -0.8 && lv.moveScale(f.at[0], f.at[1]) < 1 ? "ok" : "X")).join(","),
        fly: rp.length ? lv.canStand(rp[0][0], rp[0][1], 0, 0.32, { fly: !0 }) : null,
        pavilions: (P.pavilions || []).length + "/" + ((D.points && D.points.pavilions && D.points.pavilions.from) || []).length,
      };
      const spawnRisk = P.spawns.slice(0, 6).map((q) => q.risk ?? "-").join(",");
      // 主角从入口走两秒
      const p = g.player, e = lv.entry;
      p.spawn(e.x, e.z);
      const start = p.pos.clone();
      p.forceMove = [0, -1];
      await new Promise((r) => setTimeout(r, 1500));
      p.forceMove = null;
      const moved = +p.pos.distanceTo(start).toFixed(2), dy = +(p.pos.y - lv.height(p.pos.x, p.pos.z)).toFixed(2);
      return {
        buildMs: Math.round(lv.buildMs), hfMs: Math.round(lv.stats.heightfieldMs), stats: lv.stats,
        counts: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, Array.isArray(v) ? v.length : v ? 1 : 0])),
        extracts: P.extracts.map((x) => x.kind + ":" + x.id), gathers: P.gathers.map((x) => x.kind).join(","), glows: P.glows.map((x) => x.kind).join(","),
        bad, jumpOnly, gateBreak, fence, water, spawnRisk, moved, dy, entry: [+e.x.toFixed(1), +e.z.toFixed(1)],
        extra: { steps: (P.steps || []).length, encounters: (P.encounters || []).length, relics: (P.relics || []).length, patrols: (P.patrols || []).length, night: (P.night || []).length, shrines: (P.shrines || []).length, zones: (P.zones || []).length, elitesShield: P.elites.map((q) => (q.shield || []).join("/") || "-").join(","), chestTiers: P.chests.map((q) => q.tier[0] + (q.risk ?? "")).join(","), ruins: P.extracts.filter((x) => x.unknown).map((x) => x.kind + "@" + x.risk).join(",") },
      };
    }, id);
    report[id] = info;
    c.log(id, JSON.stringify(info));
  }
  // 反复建拆：内存不涨
  const memA = [];
  for (let k = 0; k < 3; k++) {
    for (const id of ["r1", "r2"]) {
      await c.ev((id) => window.__game.loadLevel(id, 11), id);
      await c.wait(250);
    }
    memA.push(await mem());
  }
  c.log("mem(rebuild×3, after r2 each)", JSON.stringify(memA));
  await c.ev(() => window.__game.unloadLevel());
  await c.wait(200);
  c.log("mem(unloaded)", JSON.stringify(await mem()));

  // 截图 + 帧时间
  const gpu = () => c.ev(() => { const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4); g.rig.update(0.016); const t0 = performance.now(); for (let k = 0; k < 30; k++) { g.ink.render(g.scene, g.camera, k * 0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t0) / 30).toFixed(2); });
  const fps = () => c.ev(() => new Promise((r) => { let k = 0; const t0 = performance.now(); const f = () => (++k, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(+(k / 2).toFixed(1))); requestAnimationFrame(f); }));
  const perf = {};
  for (const id of ["r1", "r2"]) {
    await c.ev((id) => window.__game.loadLevel(id, 7), id);
    await c.wait(800);
    await c.ev(() => window.__game.setView("level_overview"));
    await c.wait(500);
    await c.shot(id + "_overview_day");
    await c.ev(() => window.__game.setTimeOfDay(1));
    await c.wait(300);
    await c.shot(id + "_overview_night");
    await c.ev(() => window.__game.setTimeOfDay(0.33));
    await c.ev(() => window.__game.setView("play"));
    await c.wait(600);
    await c.shot(id + "_play_day");
    const draw = await c.ev(() => { const r = window.__game.renderer; r.info.autoReset = !1; r.info.reset(); window.__game.ink.render(window.__game.scene, window.__game.camera, 0); const o = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.info.autoReset = !0; return o; });
    perf[id] = { gpuMs: await gpu(), fps: await fps(), cpuMs: +(await c.ev(() => window.__game.frameMs)).toFixed(2), ...draw };
    for (const t of [0, 0.66, 1]) {
      await c.ev((t) => window.__game.setTimeOfDay(t), t);
      await c.wait(250);
      await c.shot(id + "_play_t" + Math.round(t * 100));
    }
    await c.ev(() => window.__game.setTimeOfDay(0.33));
    const views = (await c.ev(() => window.__game.levelViews)) || [];
    for (const v of views) {
      if (v.endsWith("overview")) continue;
      await c.ev((v) => window.__game.setView(v), v);
      await c.wait(450);
      await c.shot(v);
    }
  }
  // ---- 青牙狼谷场景件（boss_青牙_v2 §10.2 第 2 项）：石柱撞碎 / 图腾倒下移除碰撞体、墨雾门加碰撞体、inPit、遮月与月光斑 ----
  {
    const arena = await c.ev(async () => {
      const g = window.__game, lv = (window.__arenaLv = await g.loadLevel("r1", 7)), A = lv.bossArena, cols = g.ctx.colliders;
      if (!A) return { ok: !1, why: "no bossArena" };
      const has = (id) => cols.some((q) => q.id === id);
      const before = { pillars: A.pillars.length, totems: A.totems.length, rock: !!A.rock, f1: has("fang_1"), t1: has("totem_w"), perch: has("perch") };
      const f1 = A.pillars.find((q) => q.id === "fang_1");
      const broke = f1.break(), again = f1.break();
      const t1 = A.totems[0];
      t1.setLit(!0);
      const fell = t1.fall();
      A.gates.setOn("all", !0);
      const gateCols = cols.filter((q) => q.id === "mist_n").length, rimCols = cols.filter((q) => q.id === "rim").length;
      const blocked = !lv.canStand(57.2, -36.5, lv.height(57.2, -36.5));
      lv.setMoonVeil(1);
      const spots = lv.moonSpots(0), spots5 = lv.moonSpots(5);
      const pit = [lv.inPit("狼谷", 50, -22), lv.inPit("狼谷", 50, 10), A.inPit(44, -20)];
      return {
        ok: !0, before, broke, again, f1Gone: !has("fang_1"), f1Alive: f1.alive, fell, t1Gone: !has("totem_w"), gateCols, rimCols, blocked,
        spots: spots.map((q) => [+q.x.toFixed(1), +q.z.toFixed(1), q.r]), moved: +Math.hypot(spots5[0].x - spots[0].x, spots5[0].z - spots[0].z).toFixed(2), pit,
      };
    });
    c.log("arena", JSON.stringify(arena));
    // 截图 1：一阶段（重新建关卡：石柱、图腾完好，门和雾关着）
    await c.ev(async () => { window.__arenaLv = await window.__game.loadLevel("r1", 7); });
    await c.wait(1200);
    await c.ev(() => window.__game.setView("r1_valley_top"));
    await c.wait(800);
    await c.shot("r1_valley_arena");
    // 截图 2：同机位遮月（二阶段：墨雾门 + 谷沿雾带开、雾浓 1、遮月 1、一根石柱已碎、一根图腾已倒）
    await c.ev(() => {
      const lv = window.__arenaLv, A = lv.bossArena;
      A.gates.setOn("all", !0);
      A.gates.setThick(1);
      lv.setMoonVeil(1);
      A.pillars[0].break();
      A.totems[0].fall();
      for (let k = 0; k < 10; k++) lv.update(0.4);
    });
    await c.ev(() => window.__game.setView("r1_valley_top"));
    await c.wait(900);
    await c.shot("r1_valley_arena_veil");
    // 截图 3：游戏视角，青牙在场（一阶段）；截图 4：同一视角遮月
    await c.ev(() => { const lv = window.__arenaLv; lv.setMoonVeil(0); lv.bossArena.gates.setOn("all", !1); lv.bossArena.gates.setThick(0); for (let k = 0; k < 6; k++) lv.update(0.4); });
    const boss = await c.ev(async () => {
      const g = window.__game, E = g.ctx.enemies;
      for (let k = 0; k < 80 && !E.ready; k++) await new Promise((r) => setTimeout(r, 100));
      const lv = window.__arenaLv;
      const bp = lv.points.boss.pos;
      const e = E.spawnBoss && E.spawnBoss(new g.ctx.THREE.Vector3(bp.x, bp.y, bp.z));
      g.player.spawn(51, -11);
      g.setView("play");
      return { ok: !!e, type: e && e.type, alive: e && e.alive };
    });
    c.log("boss", JSON.stringify(boss));
    await c.wait(2500);
    await c.shot("r1_valley_play_boss");
    await c.ev(() => { const lv = window.__arenaLv; lv.bossArena.gates.setOn("all", !0); lv.bossArena.gates.setThick(1); lv.setMoonVeil(1); for (let k = 0; k < 8; k++) lv.update(0.4); });
    await c.wait(1200);
    await c.shot("r1_valley_play_boss_veil");
    await c.ev(() => { const lv = window.__arenaLv; lv.setMoonVeil(0); lv.bossArena.gates.setOn("all", !1); lv.bossArena.gates.setThick(0); });
  }
  await c.ev(() => window.__game.loadLevel("tutorial", 1));
  await c.wait(600);
  await c.ev(() => window.__game.setView("tutorial_cave"));
  await c.wait(450);
  await c.shot("tutorial_cave");
  await c.ev(() => window.__game.setView("play"));
  await c.wait(450);
  await c.shot("tutorial_start");
  c.log("perf", JSON.stringify(perf));
  c.log("gpu", await c.ev(() => { const gl = window.__game.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; }));
}
