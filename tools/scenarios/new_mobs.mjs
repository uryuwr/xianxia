// 新低阶怪与异种的游戏内截图：每种刷在主角旁边、出一招（看预警），截一张。
// 运行：node tools/run.mjs new_mobs
export default async function (page, c) {
  await page.routeWebSocket(/.*/, () => {});
  await page.reload();
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready, null, { timeout: 180000 });
  await c.ev(() => {
    const D = window.__enemies;
    D.auto = !1;
    for (const e of [...D.list]) e.dispose();
    D.list.length = 0;
    D.ctx.world.events.on("beforeDamage", (i) => i.target.team === "enemy" && !(i.spec && i.spec.test) && (i.cancel = !0));
  });
  const list = [["rat", "bite", 3, 3], ["crow", "swoop", 5, 3], ["spider", "web", 6, 3], ["snake", "strike", 3.5, 3], ["toad", "breath", 3.5, 3], ["chilang", "lunge3", 4.5, 3], ["xuanlin_bat", "swoop2", 5, 3]];
  const R = [];
  for (const [type, atk, dist, n] of list) {
    const r = await c.ev(async ([type, atk, dist, n]) => {
      const D = window.__enemies, h = D.hero, V = h.pos.constructor;
      for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
      D.list.length = 0;
      h.hp = 1e6;
      if (D.ctx.rig) D.ctx.rig.dist = type === "crow" || type === "xuanlin_bat" ? 20 : 14;
      const { ENEMY_TYPES } = await import("/src/data/enemies.js");
      const region = ENEMY_TYPES[type].region;
      D.setRegion(region);
      const out = [];
      const fly = type === "crow" || type === "xuanlin_bat";
      const main = D.spawn(type, new V(h.pos.x - dist * (fly ? 0.9 : 0.5), h.pos.y, h.pos.z - (fly ? 0.3 : 0.85) * dist), { region });
      out.push(main);
      for (const e of out) for (const k in e.cool) e.cool[k] = 99;
      D.bars.touch(main);
      await new Promise((r) => setTimeout(r, 500));
      const a = main.def.attacks.find((x) => x.id === atk);
      main.startAttack(a, h.pos);
      await new Promise((r) => setTimeout(r, a.windup * 700));
      return { type, level: main.level, realm: D.realmLabel(main).exact, name: main.def.name, state: main.state };
    }, [type, atk, dist, n]);
    R.push(r);
    await c.shot(type);
  }
  c.log(JSON.stringify(R));
  const errs = await c.ev(() => (window.__errors || []).length);
  c.log((errs === 0 ? "PASS" : "FAIL") + " no runtime errors " + errs);
}
