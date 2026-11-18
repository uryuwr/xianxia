// 精英分布统计：r1 / r2 各开 N 局（随机种子），统计开局精英、加上午时巡游、再加一波夜潮后的精英数量，
// 以及精英之间的最小距离、首领场地 30 米内的精英数。
// 运行：node tools/run.mjs elite_dist scene=run    （环境变量 N 控制每区局数，默认 6）
export default async function (page, c) {
  await page.routeWebSocket(/./, () => {});
  const base = new URL(page.url()).origin;
  const N = Number(process.env.N || 6);
  const all = {};
  for (const [region, slot] of [["r1", 2], ["r2", 3]]) {
    all[region] = [];
    for (let k = 0; k < N; k++) {
      await page.goto(`${base}/?scene=run&region=${region}&slot=${slot}`, { waitUntil: "commit", timeout: 90000 });
      await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 90000 });
      await c.wait(2500);
      const r = await c.ev(async () => {
        const run = __game.run, E = __game.ctx.enemies, P = run.map.points;
        const boss = P.boss && P.boss.pos;
        const stat = () => {
          const els = E.list.filter((e) => e.alive && e.entity.tags.has("elite") && !e.entity.tags.has("boss"));
          let minD = Infinity;
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) minD = Math.min(minD, els[i].pos.distanceTo(els[j].pos));
          const nearBoss = boss ? els.filter((e) => Math.hypot(e.pos.x - boss.x, e.pos.z - boss.z) < 30).length : 0;
          return { n: els.length, minD: Number.isFinite(minD) ? +minD.toFixed(1) : null, nearBoss };
        };
        const start = stat();
        run.spawnPatrols && run.spawnPatrols();
        const patrol = stat();
        run.spawnWave && run.spawnWave(5, !0);
        const night = stat();
        return { seed: run.seed, start, patrol, night };
      });
      all[region].push(r);
      c.log(region, JSON.stringify(r));
    }
  }
  const sum = (list, key) => {
    const ns = list.map((x) => x[key].n), ds = list.map((x) => x[key].minD).filter((x) => x != null), nb = list.map((x) => x[key].nearBoss);
    return { n: `${Math.min(...ns)}–${Math.max(...ns)}（均 ${(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)}）`, minD: ds.length ? Math.min(...ds) : null, nearBossMax: Math.max(...nb) };
  };
  for (const region of Object.keys(all)) c.log("SUMMARY " + region, JSON.stringify({ 开局: sum(all[region], "start"), 加巡游: sum(all[region], "patrol"), 加夜潮: sum(all[region], "night") }));
}
