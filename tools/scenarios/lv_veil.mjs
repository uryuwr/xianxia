// 狼谷遮月调试：只开暗幕 / 只开低雾 / 全开，分别截图（关卡岗位调试用）
export default async function (page, c) {
  await page.waitForFunction(() => window.__ready === true && window.__game && window.__game.loadLevel, null, { timeout: 120000 });
  await c.wait(1500);
  const info = await c.ev(async () => {
    const g = window.__game, lv = (window.__lv = await g.loadLevel("r1", 7));
    const names = [];
    lv.root.traverse((o) => ["veil_shade", "mist_band", "moon_spot", "lair_decals"].includes(o.name) && names.push(o.name + ":" + o.visible));
    return { names, hasArena: !!lv.bossArena };
  });
  c.log("info", JSON.stringify(info));
  await c.wait(800);
  await c.ev(() => window.__game.setView("r1_valley_top"));
  await c.wait(600);
  await c.shot("veil_0");
  for (const [tag, fn] of [
    ["veil_shade_only", "shade"],
    ["veil_all", "all"],
  ]) {
    await c.ev((fn) => {
      const lv = window.__lv;
      lv.root.traverse((o) => {
        if (o.name === "mist_band" || o.name === "moon_spot") o.userData._vis ??= !0;
      });
      lv.setMoonVeil(1);
      if (fn === "shade") lv.root.traverse((o) => (o.name === "mist_band" || o.name === "moon_spot") && (o.visible = !1));
      else lv.root.traverse((o) => o.name === "mist_band" && (o.visible = !0));
      for (let k = 0; k < 6; k++) lv.update(0.4);
      if (fn === "shade") lv.root.traverse((o) => (o.name === "mist_band" || o.name === "moon_spot") && (o.visible = !1));
    }, fn);
    await c.ev(() => window.__game.setView("r1_valley_top"));
    await c.wait(700);
    await c.shot(tag);
  }
}
