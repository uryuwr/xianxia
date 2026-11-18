// 关卡建造耗时分解
export default async function (page, c) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.waitForFunction(() => window.__ready === true && window.__game && window.__game.loadLevel, null, { timeout: 120000 });
      for (const id of ["r1", "r2", "r1", "r2"]) c.log(id, JSON.stringify(await c.ev(async (id) => { const lv = await window.__game.loadLevel(id, 3); return { ms: Math.round(lv.buildMs), t: lv.stats.timing }; }, id)));
      return;
    } catch (e) {
      if (!/context was destroyed|navigation/i.test(String(e))) throw e;
      await c.wait(2000);
    }
  }
}
