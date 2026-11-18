// 敌人"卡地形高打低"验证：主角站在区域一的崖顶，对崖下的狼持续放技能；狼必须绕坡道上来，或者撤开脱战，不能原地挨打。
// 运行：node tools/run.mjs enemy_cliff "scene=run&region=r1"
export default async function (page, c) {
  await page.routeWebSocket(/.*/, () => {});
  await page.reload();
  await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 180000 });
  const R = [];
  const check = (name, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + name, info === undefined ? "" : JSON.stringify(info));
  };
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready && window.__game && window.__game.run, null, { timeout: 120000 });
  await c.wait(2500);
  // 找崖：崖顶 T 可站，3.5–7 米外的崖下 B 低 2.5 米以上；按"流场里能不能从 B 走到 T"分成可绕路 / 到不了两类
  const found = await c.ev(async () => {
    const { height, activeLevel } = await import("/src/world/terrain.js");
    const D = window.__enemies, nav = D.nav, V = D.hero.pos.constructor;
    const L = activeLevel();
    const out = { path: null, none: null, level: L && L.def && L.def.id };
    const ok = (x, z) => nav.cell(nav.idx(x), nav.idx(z)).ok && height(x, z) > -0.5;
    const flat = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => Math.abs(height(x + a, z + b) - height(x, z)) < 0.35);
    for (let x = -76; x <= 76 && !(out.path && out.none); x += 2)
      for (let z = -56; z <= 56 && !(out.path && out.none); z += 2) {
        if (!ok(x, z) || !flat(x, z)) continue;
        const ht = height(x, z);
        for (let a = 0; a < 8; a++) {
          const r = 4.5, bx = x + Math.sin(a * 0.785) * r, bz = z + Math.cos(a * 0.785) * r;
          if (!ok(bx, bz) || !flat(bx, bz) || ht - height(bx, bz) < 2.5) continue;
          const T = new V(x, ht, z), B = new V(bx, height(bx, bz), bz);
          const f = nav.flow(T);
          const kind = nav.reachable(B, f) ? "path" : "none";
          if (!out[kind]) out[kind] = { T: [x, ht, z], B: [bx, B.y, bz], steps: f.d.get && kind === "path" ? Math.round(f.d.get((nav.idx(bx) + 32768) * 65536 + (nav.idx(bz) + 32768))) : null };
          break;
        }
      }
    return out;
  });
  c.log("cliffs", JSON.stringify(found));
  check("found a cliff in r1", found.path || found.none, found.level);

  const trial = async (name, spot) => {
    const res = await c.ev(async (spot) => {
      const D = window.__enemies, h = D.hero, w = D.ctx.world, V = h.pos.constructor;
      D.auto = !1;
      for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
      D.list.length = 0;
      D.tokens.clear();
      const g = window.__game;
      if (g.run) g.run.spawnWave = () => [];
      h.hp = 1e6;
      h.pos.set(...spot.T);
      const wolf = D.spawn("wolf", new V(...spot.B), { region: "r1" });
      wolf.yaw = Math.atan2(h.pos.x - wolf.pos.x, h.pos.z - wolf.pos.z);
      let landed = 0;
      const offDamage = w.events.on("damage", (i) => i.target === wolf.entity && landed++);
      const log = [], regroup = [];
      let prev = wolf.pos.clone(), standHits = 0, reached = !1, maxD = 0;
      try {
      for (let k = 0; k < 40; k++) {
        h.pos.set(...spot.T);
        h.hp = 1e6;
        const l0 = landed;
        const resting = wolf.state === "idle" && wolf.regroupT > 0;
        const rest = resting ? { at: k * 0.5, pos: wolf.pos.toArray(), regroupT: wolf.regroupT, wanderTo: wolf.wanderTo?.toArray() || null } : null;
        const inRange = Math.hypot(wolf.pos.x - h.pos.x, wolf.pos.z - h.pos.z) <= 14; // 技能射程 14 米
        if (wolf.alive && inRange) w.dealDamage(h, wolf.entity, { test: !0, base: 3, element: "metal", noCrit: !0 }); // 崖上放技能
        await new Promise((r) => setTimeout(r, 500));
        if (!wolf.alive) break;
        const d = Math.hypot(wolf.pos.x - h.pos.x, wolf.pos.z - h.pos.z), dy = h.pos.y - wolf.pos.y, moved = wolf.pos.distanceTo(prev);
        prev.copy(wolf.pos);
        if (d < 3.2 && Math.abs(dy) < 1.5) reached = !0;
        maxD = Math.max(maxD, d);
        const atk = wolf.state === "windup" || wolf.state === "strike" || wolf.state === "recover";
        if (landed > l0 && moved < 0.2 && !atk && !reached) standHits++;
        if (rest) regroup.push({ ...rest, after: wolf.pos.toArray(), distance: d, moved, hits: landed - l0, stateAfter: wolf.state, regroupAfter: wolf.regroupT });
        log.push(`${wolf.state}:${d.toFixed(1)}/${dy.toFixed(1)}/${Math.round(wolf.entity.hp)}`);
      }
      return { maxHp: Math.round(wolf.entity.stats.get("hp")), reached, standHits, landed, maxD: +maxD.toFixed(1), final: log[log.length - 1], hp: Math.round(wolf.entity.hp), log: log.join(" "), regroup };
      } finally { offDamage(); }
    }, spot);
    return res;
  };

  if (found.path) {
    const r = await trial("path", found.path);
    await c.shot("path_end");
    check("cliff with a ramp: wolf walks around and reaches the hero, never stands still taking hits", r.reached && r.standHits <= 2, r);
  }
  if (found.none) {
    const r = await trial("none", found.none);
    await c.shot("none_end");
    check("unreachable cliff: wolf retreats (evading) instead of standing under the cliff", !r.reached && r.standHits <= 2 && r.maxD >= 10 && r.hp >= r.maxHp * 0.7, r);
    const rest0 = r.regroup[0]?.pos;
    check("regroup while hero camps: no home wandering or renewed hits", r.regroup.length >= 4 && r.regroup.every((s) =>
      !s.wanderTo && s.hits === 0 && s.distance > 14 && s.stateAfter === "idle" &&
      Math.hypot(s.after[0] - rest0[0], s.after[2] - rest0[2]) < 0.2), r.regroup);
    // 真正解除堵巢，不改狼的计时/状态：等休整自然结束并观察正常回巢事件与抵达。
    const home = await c.ev(async () => {
      const { height } = await import("/src/world/terrain.js");
      const D = window.__enemies, h = D.hero, wolf = D.list.find((e) => e.alive && e.type === "wolf");
      if (!wolf) return { missing: true };
      const far = new h.pos.constructor(wolf.home.x < 0 ? 70 : -70, 0, wolf.home.z < 0 ? 50 : -50);
      far.y = height(far.x, far.z);
      const start = { pos: wolf.pos.toArray(), home: wolf.home.toArray(), regroupT: wolf.regroupT, state: wolf.state };
      const reasons = [], samples = [];
      const off = D.ctx.world.events.on("enemy:leash", (e) => { if (e.enemy === wolf.entity) reasons.push(e.reason); });
      try {
        const until = performance.now() + 20000;
        let arrived = false;
        while (performance.now() < until) {
          h.pos.copy(far); h.hp = 1e6;
          await new Promise((resolve) => setTimeout(resolve, 250));
          const d = Math.hypot(wolf.home.x - wolf.pos.x, wolf.home.z - wolf.pos.z);
          samples.push({ state: wolf.state, regroupT: wolf.regroupT, homeDistance: d, pos: wolf.pos.toArray() });
          if (reasons.includes("regroup") && wolf.state === "idle" && d < 1.2) { arrived = true; break; }
        }
        return { start, heroMovedTo: far.toArray(), reasons, arrived, samples };
      } finally { off(); }
    });
    check("regroup ends after hero leaves: wolf returns to its original home", home.arrived && home.reasons.includes("regroup"), home);
    await c.shot("none_home");
  }
  const errs = await c.ev(() => (window.__errors || []).length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
