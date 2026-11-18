// 整合：跃涧（关卡 jumps）、涉水减速、入夜纸色压暗 / 回洞府还原
// 用法：node tools/run.mjs integ_leap "scene=cave&slot=7"
const ok = (cond, msg, extra) => console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));

export default async function (page, c) {
  const waitFor = async (fn, arg, timeout = 30000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 100 });
      return !0;
    } catch {
      return !1;
    }
  };
  // 正常入口前提：flow.name / __ready 都早于异步 enter 收尾，不能据此提前切场。
  // 这里只等待与诊断，不取消旧 enter，也不修复生产 Flow/Cave 的早退竞态。
  const setupState = ({ scene, region, details = false }) => {
    const g = window.__game, flow = g?.flow, ctx = g?.ctx, cave = window.__cave;
    const pl = g?.player, run = g?.run, map = run?.map;
    const level = ctx?.terrain.activeLevel();
    const root = cave?.ui.root, roots = [...document.querySelectorAll(".cv-root")];
    const loading = document.querySelector(".mk-layer-loading");
    const heroReady = !!pl && pl === ctx?.player && pl.ctx === ctx &&
      !!pl.model && pl.model.parent === pl.root && pl.root.parent === ctx.scene &&
      !!g.heroSource && g.heroSource === pl.source;
    const sceneMatches = flow?.name === scene && flow.scene === flow.scenes[scene];
    const caveReady = !!cave?.active && !!root?.isConnected && roots.length === 1 &&
      roots[0] === root && !root.querySelector(".cv-loading") && level === cave.scene;
    const runReady = !!run && flow?.scene?.run === run && run.region === region &&
      run.state === "play" && map?.kind === "level" && map.def.id === region &&
      map.level?.def.id === region && level === map.level && map.root.parent === ctx?.scene &&
      !!loading?.classList.contains("hidden") && !cave?.active && roots.length === 0 &&
      pl?.colliders === ctx?.colliders;
    const ready = window.__ready === true && sceneMatches && heroReady &&
      (scene === "cave" ? caveReady : runReady);
    if (!details) return ready;
    return {
      ready, expected: { scene, region }, flow: flow?.name, bodyScene: document.body.dataset.scene,
      sceneMatches, hold3d: ctx?.hold3d,
      cave: { active: cave?.active, roots: roots.length, currentConnected: !!root?.isConnected,
        currentOnly: roots.length === 1 && roots[0] === root, loading: !!root?.querySelector(".cv-loading"),
        terrainMatches: !!cave?.scene && level === cave.scene },
      run: { region: run?.region, state: run?.state, current: !!run && flow?.scene?.run === run,
        kind: map?.kind, mapId: map?.def?.id, levelId: map?.level?.def?.id,
        root: map?.root?.name, rootAttached: !!map?.root && map.root.parent === ctx?.scene,
        terrainMatches: !!map?.level && level === map.level, loadingHidden: !!loading?.classList.contains("hidden") },
      terrain: { id: level?.def?.id, region: level?.region, root: level?.root?.name },
      player: { ready: heroReady, source: pl?.source, heroSource: g?.heroSource,
        state: pl?.state, pos: pl?.pos?.toArray(), spawnAt: pl?.spawnAt,
        runColliders: !!pl && pl.colliders === ctx?.colliders },
    };
  };
  const requireSetup = async (scene, region, label, timeout) => {
    const ready = await waitFor(setupState, { scene, region }, timeout);
    const state = await c.ev(setupState, { scene, region, details: true });
    console.log("LEAP_SETUP " + JSON.stringify(state));
    ok(ready && state.ready, label);
    if (!ready || !state.ready) throw new Error(label + "：场景加载/身份前提未满足，停止跃涧测试");
  };
  await page.routeWebSocket(/./, () => {});
  await page.reload({ waitUntil: "commit", timeout: 90000 });
  await requireSetup("cave", null, "boots to cave", 90000);

  // ---- 区域二：未解锁二段跳 → 不跃；解锁后跃过断涧 ----
  await c.ev(() => {
    const P = __game.flow.profile;
    P.realm = { stage: 1, layer: 4 };
    __game.flow.debug && __game.flow.debug.realm ? 0 : 0;
    P.unlocks.doubleJump = !1;
    P.unlocks.region2 = !0;
    __game.flow.go("run", { region: "r2" });
  });
  await requireSetup("run", "r2", "r2 run starts", 30000);
  const J = await c.ev(() => {
    const j = __game.run.map.points.jumps || (__game.run.map.level && __game.run.map.level.points.jumps);
    return j && j.map((q) => ({ id: q.id, from: [q.from.x, q.from.z], to: [q.to.x, q.to.z], need: q.need }));
  });
  ok(J && J.length >= 1, "r2 has jump points", J);
  const g = J.find((q) => q.id === "gorge") || J[0];
  const tryJump = () =>
    c.ev((g) => {
      const pl = __game.player;
      pl.spawn(g.from[0], g.from[1]);
      const dx = g.to[0] - g.from[0], dz = g.to[1] - g.from[1], L = Math.hypot(dx, dz);
      pl.facing.set(dx / L, 0, dz / L);
      pl.setState("move");
      return pl.tryLeap(null);
    }, g);
  ok((await tryJump()) === !1, "locked: no leap without doubleJump");
  await c.ev(() => (__game.flow.profile.unlocks.doubleJump = !0));
  ok((await tryJump()) === !0, "unlocked: leap starts");
  await c.wait(150);
  const mid = await c.ev(() => ({ st: __game.player.state, y: __game.player.pos.y }));
  ok(mid.st === "leap", "player in leap state mid-air", mid);
  await c.shot("leap_mid");
  await c.wait(900);
  const end = await c.ev((g) => ({ st: __game.player.state, d: Math.hypot(__game.player.pos.x - g.to[0], __game.player.pos.z - g.to[1]) }), g);
  ok(end.st === "move" && end.d < 0.6, "landed on far side", end);

  // ---- 入夜：纸色压暗 ----
  const paper0 = await c.ev(() => __game.ink.mat.uniforms.uPaper.value.x);
  await c.ev(() => (__game.run.t = __game.run.R.phases[2] + 30));
  await c.wait(1500);
  const paperN = await c.ev(() => __game.ink.mat.uniforms.uPaper.value.x);
  ok(paperN < paper0 - 0.1, "night darkens paper", { paper0, paperN });
  await c.shot("night");

  // ---- 回洞府：纸色还原 ----
  await c.ev(() => __game.flow.go("cave"));
  await waitFor(() => __game.flow.name === "cave");
  await c.wait(800);
  const paperC = await c.ev(() => __game.ink.mat.uniforms.uPaper.value.x);
  ok(Math.abs(paperC - 0.925) < 0.01, "paper restored in cave", paperC);

  // ---- 区域一浅溪涉水减速 ----
  await c.ev(() => __game.flow.go("run", { region: "r1" }));
  ok(await waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play"), "r1 run starts");
  const wade = await c.ev(async () => {
    const { moveScale } = await import("/src/world/terrain.js");
    for (let x = -78; x < 78; x += 2) for (let z = -58; z < 58; z += 2) if (moveScale(x, z) < 1) return { x, z, k: moveScale(x, z) };
    return null;
  });
  ok(wade && wade.k < 1, "r1 has wading water", wade);
  console.log("errors in page:", JSON.stringify(await c.ev(() => window.__errors || [])));
}
