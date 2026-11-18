// 迎客松"甲 · 墨团"落地后的最终截图：区域一游玩视角（高 / 低档）。标题背景另用 scene=title 跑本场景。
// 用法：node tools/run.mjs pine_final "scene=run&region=r1&slot=6"；node tools/run.mjs pine_final "scene=title"
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && window.__ready, null, { timeout: 120000 });
  if (!(await c.ev(() => /scene=run/.test(location.search)))) {
    await c.wait(2500);
    await c.shot("title");
    return;
  }
  await page.waitForFunction(() => __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 120000 });
  await c.ev(() => {
    const G = __game;
    G.run.clearEnemies();
    G.ctx.enemies.auto = !1;
    G.player.debug.god = !0;
    G.player.spawn(-62, -40);
    G.rig.update(1, !0);
    document.querySelectorAll(".ink-toast,.mk-toast").forEach((n) => n.remove());
  });
  await c.wait(1500);
  await c.shot("r1_high");
  await c.ev(() => __game.setQuality("low"));
  await c.wait(1000);
  await c.shot("r1_low");
  await c.ev(() => __game.setQuality("auto"));
}
