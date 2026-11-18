// 剑类特效近景检查（透明面片 / 影子是否有方框）：法宝青冥飞剑环绕、御剑脚下的墨剑、手中剑（静止 / 附灵）。
// 用法：node tools/run.mjs look_swords "scene=run&region=r1"   截图：work/shots/look_swords_*.png
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 90000 });
  await c.wait(1000);
  const tag = process.env.TAG || "";
  const around = async (w = 420, h = 360, dy = 1) => {
    const p = await c.ev((dy) => {
      const v = __game.player.pos.clone();
      v.y += dy;
      v.project(__game.camera);
      return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
    }, dy);
    return { x: Math.max(0, Math.round(p[0] - w / 2)), y: Math.max(0, Math.round(p[1] - h / 2)), width: w, height: h };
  };
  // 近景、开阔处
  const info = await c.ev(() => {
    const G = __game, P = G.player, S = G.ctx.skills;
    G.run.clearEnemies && G.run.clearEnemies();
    G.ctx.enemies.auto = !1;
    P.debug.god = !0;
    P.facing.set(0.35, 0, 1).normalize();
    P.yaw = Math.atan2(P.facing.x, P.facing.z);
    G.rig.dist = 12;
    G.rig.update(1, !0);
    // 法宝：青冥飞剑（祭炼 5 重，4 把）
    S.setLoadout({ artifact: { id: "flying_sword", level: 5 } });
    const sw = S.artifact && S.artifact.swords ? S.artifact.swords.map((s) => s.mesh) : [];
    const meshes = [];
    for (const g of sw) g.traverse((o) => o.isMesh && meshes.push({ cast: o.castShadow, depthWrite: o.material.depthWrite, transparent: o.material.transparent, geo: o.geometry.type }));
    return { swords: sw.length, meshes: meshes.slice(0, 5) };
  });
  console.log("flying swords", JSON.stringify(info));
  await c.wait(1500);
  await c.shot(`orbit${tag}`, { clip: await around(460, 380, 0.8) });
  // 手中剑：附灵（木）
  await c.ev(() => __game.player.entity.stats.add({ stat: "imbue_wood", type: "flat", value: 1, source: "look" }));
  await c.wait(800);
  await c.shot(`hand_imbue${tag}`, { clip: await around(320, 320, 0.8) });
  await c.ev(() => {
    const G = __game, P = G.player;
    P.entity.stats.removeSource("look");
    G.ctx.skills.setLoadout({ artifact: { id: "flying_sword", level: 0 } });
    G.ctx.skills.setLoadout({ artifact: { id: null, level: 1 } });
  });
  await c.wait(600);
  await c.shot(`hand_plain${tag}`, { clip: await around(320, 320, 0.8) });
  // 御剑：直接触发一次飞行（不依赖地形），飞到一半截图
  await c.ev(() => {
    const G = __game, P = G.player, T = G.THREE;
    const dir = P.facing.clone();
    const to = P.pos.clone().addScaledVector(dir, 8);
    P.leap = { from: P.pos.clone(), to, h: 1.6, dur: 1.6, ghostT: 0, sword: !0, dir };
    P.setState("leap", 1.6);
  });
  await c.wait(600);
  await c.shot(`ride${tag}`, { clip: await around(420, 360, 0.6) });
  await c.wait(1400);
}
