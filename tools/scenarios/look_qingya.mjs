// 青牙 v2 外观的游戏内截图（美术管线）：与竹林狼并排的 45° 游戏视角；一阶段 / 一阶段 + 木盾描边壳 / 二阶段（裂缝、眼焰）+ 土盾 / 近景。
// 用法：node tools/run.mjs look_qingya "scene=run&region=r1&slot=8"
// 不依赖青牙控制器：生成时临时摘掉 controller，外观由 src/fx/boss_look.js 直接驱动。数据表还没切到新模型时，运行时临时切（只影响本次页面）。
export default async function (page, c) {
  await page.routeWebSocket(/./, () => {});
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 150000 });
  await c.wait(800);
  const info = await c.ev(async () => {
    const G = __game, w = G.world, P = G.player, D = __enemies;
    D.auto = !1;
    for (const e of [...D.list]) (e.entity.alive = !1), w.remove(e.entity), D.bars && D.bars.remove(e), e.dispose();
    D.list.length = 0;
    P.debug.god = !0;
    const { ENEMY_TYPES } = await import("/src/data/enemies.js");
    const q = ENEMY_TYPES.qingya;
    const switched = q.model !== "/assets/models/qingya.glb";
    if (switched) {
      Object.assign(q, { model: "/assets/models/qingya.glb", scale: 2.2, radius: 1.3, height: 3.1, tint: { fur_light: 0xa9c7b8 }, shieldLook: "outline" });
      await D.load();
    }
    const ctrl = q.controller;
    q.controller = null;
    P.spawn(50, -19.5);
    await new Promise((r) => setTimeout(r, 600));
    const V = P.pos.constructor;
    const qy = D.spawn("qingya", new V(45, 0, -18.5), { region: "r1", yaw: 0.9 });
    const wf = D.spawn("wolf", new V(55, 0, -18.5), { region: "r1", yaw: -0.9 });
    q.controller = ctrl;
    for (const e of [qy, wf]) (e.ignoreT = 1e9), (e.wanderT = 1e9), (e.aggro = !1);
    const { bossLook } = await import("/src/fx/boss_look.js");
    const look = bossLook(qy);
    window.__look = look;
    window.__qy = qy;
    window.__wf = wf;
    let last = performance.now();
    const tick = () => {
      const t = performance.now();
      look.update((t - last) / 1000);
      last = t;
      for (const e of D.list) if (e !== qy && e !== wf && e.alive) (e.entity.alive = !1), w.remove(e.entity), D.bars && D.bars.remove(e), e.dispose(); // 关卡按点位生成的首领不要
      D.list = D.list.filter((e) => e === qy || e === wf);
      for (const e of [qy, wf]) (e.ignoreT = 1e9), (e.wanderT = 1e9), (e.aggro = !1), (e.yaw = e.wantYaw = e === qy ? 0.9 : -0.9);
      requestAnimationFrame(tick);
    };
    tick();
    if (D.ctx.rig) D.ctx.rig.dist = 16;
    return { switched, qyH: qy.pos.y, wfH: wf.pos.y, shield: qy.entity.shield && qy.entity.shield.element, sphere: !!(qy.entity.shield && qy.entity.shield.mesh), nodes: ["qingya_armor", "qingya_crack", "qingya_eyefire"].map((n) => !!qy.model.getObjectByName(n)) };
  });
  c.log(JSON.stringify(info));
  c.log((info.nodes.every(Boolean) ? "PASS" : "FAIL") + " glb has armor / crack / eyefire nodes");
  c.log((!info.sphere ? "PASS" : "FAIL") + " boss shield has no sphere (shieldLook outline)");
  // 1) 一阶段 + 木盾（开局自带）
  await c.wait(1500);
  await c.shot("p1_wood");
  // 2) 一阶段无盾
  await c.ev(() => __look.shield(null));
  await c.wait(300);
  await c.shot("p1");
  // 3) 二阶段：骨甲崩裂 → 裂缝 + 眼焰，月光下裂缝最亮，土盾
  await c.ev(() => (__look.armorBurst(), __look.crackGlow(1)));
  await c.wait(1200);
  await c.shot("p2_moon");
  await c.ev(() => __look.shield("earth"));
  await c.wait(400);
  await c.shot("p2_earth");
  await c.ev(() => (__look.shield(null), __look.crackGlow(0.35)));
  // 4) 近景（镜头拉近）
  await c.ev(() => (__game.player.spawn(49.5, -18.5), __enemies.ctx.rig && (__enemies.ctx.rig.dist = 10)));
  await c.wait(800);
  await c.shot("p2_close");
  const st = await c.ev(() => {
    const vis = (n) => {
      let v = !1;
      __qy.model.getObjectByName(n).traverse((m) => m.isMesh && m.visible && (v = !0));
      return v;
    };
    return { armor: vis("qingya_armor"), crack: vis("qingya_crack"), fire: vis("qingya_eyefire"), phase: __look.phase };
  });
  c.log((st.phase === 2 && !st.armor && st.crack && st.fire ? "PASS" : "FAIL") + " phase 2 visibility " + JSON.stringify(st));
  // 5) 狼谷环境件（assets/models/props/*.glb，关卡 markers.js 按 id 自动替换）：全景；一根石柱碎裂、一根图腾倒下、其余图腾亮青焰
  const pr = await c.ev(async () => {
    const sc = __enemies.ctx.scene, found = {};
    sc.traverse((o) => o.name && o.userData.collide && /^(wolf_king_rock|fang_pillar|wolf_totem|wolf_rock|mist_gate)$/.test(o.name) && (found[o.name] = (found[o.name] || []).concat(o)));
    const P = found.fang_pillar || [], T = found.wolf_totem || [];
    P[0] && P[0].userData.setBroken && P[0].userData.setBroken(!0);
    T[0] && T[0].userData.fall && T[0].userData.fall();
    for (const t of T.slice(1)) t.userData.setLit && t.userData.setLit(!0);
    __qy.visible = !0;
    __game.player.spawn(50, -21);
    __enemies.ctx.rig && (__enemies.ctx.rig.dist = 34);
    const glb = (o) => {
      let n = 0;
      o.traverse((m) => m.isMesh && m.material && /^(rock_|bone|cloth_|rope|totem_)/.test(m.material.name || "") && n++);
      return n;
    };
    return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]));
  });
  c.log("props " + JSON.stringify(pr));
  await c.wait(1500);
  await c.shot("valley");
  await c.ev(() => (__game.player.spawn(56.2, -35.2), __enemies.ctx.rig && (__enemies.ctx.rig.dist = 16)));
  await c.wait(1200);
  await c.shot("valley_gate");
  const errs = await c.ev(() => (window.__errors || []).length);
  c.log((errs === 0 ? "PASS" : "FAIL") + " no runtime errors " + errs);
}
