// 关卡快速看图：LV=r2 SEED=7 VIEWS=r2_gorge,r2_peak,at:10/20 TOD=0.33 node tools/run.mjs lv_view
// 其他模块改文件时 Vite 会整页刷新：遇到刷新就等页面重新就绪后重做
export default async function (page, c) {
  const id = process.env.LV || "r1", seed = Number(process.env.SEED || 7), tod = Number(process.env.TOD ?? 0.33);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.waitForFunction(() => window.__ready === true && window.__game && window.__game.loadLevel, null, { timeout: 120000 });
      await c.ev(({ id, seed }) => window.__game.loadLevel(id, seed), { id, seed });
      await c.ev((t) => window.__game.setTimeOfDay(t), tod);
      if (process.env.INK === "0") await c.ev(() => window.__game.setInk(0));
      if (process.env.WIRE) await c.ev(() => window.__game.level.root.traverse((o) => o.name === "terrain-chunk" && (o.material.wireframe = !0)));
      await c.wait(800);
      const views = (process.env.VIEWS || "level_overview,play").split(",");
      for (const v of views) {
        if (v.startsWith("at:")) {
          const [x, z] = v.slice(3).split("/").map(Number);
          await c.ev(([x, z]) => { const g = window.__game; g.player.spawn(x, z); g.setView("play"); }, [x, z]);
        } else await c.ev((v) => window.__game.setView(v), v);
        await c.wait(600);
        await c.shot(id + "_" + v.replace(/[:/]/g, "_"));
      }
      return;
    } catch (e) {
      if (!/context was destroyed|navigation|loadLevel is not a function|Target closed/i.test(String(e))) throw e;
      c.log("页面被刷新，重试", attempt + 1);
      await c.wait(1500);
    }
  }
}
