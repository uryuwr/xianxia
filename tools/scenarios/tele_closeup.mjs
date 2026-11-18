// 敌人预警着色器近景检查（柔边 / 抗锯齿）：青牙横扫扇形、直线扑咬、石傀砸地圈，各拍一张近景，并同时拍游戏常用距离一张。
// 运行：node tools/run.mjs tele_closeup
export default async function (page, c) {
  await page.routeWebSocket(/.*/, () => {});
  await page.reload();
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready, null, { timeout: 180000 });
  await c.ev(() => {
    const D = window.__enemies;
    D.auto = !1;
    for (const e of [...D.list]) e.dispose();
    D.list.length = 0;
    D.tokens.clear();
    // 测试期间敌人只受测试伤害（主角自动攻击会打断预警）
    D.ctx.world.events.on("beforeDamage", (i) => i.target.team === "enemy" && !(i.spec && i.spec.test) && (i.cancel = !0));
  });
  const shot = async (type, atk, dist, camDist, name) => {
    await c.ev(async ([type, atk, dist, camDist]) => {
      const D = window.__enemies, h = D.hero, V = h.pos.constructor, rig = D.ctx.rig;
      for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
      D.list.length = 0;
      D.tokens.clear();
      h.hp = 1e6;
      if (rig) rig.dist = camDist;
      const e = D.spawn(type, new V(h.pos.x + dist, h.pos.y, h.pos.z), { region: "r1" });
      D.ctx.shields && D.ctx.shields.drop(e.entity);
      e.entity.shield = null;
      e.phaseIdx = 99;
      for (const k in e.cool) e.cool[k] = 99;
      await new Promise((r) => setTimeout(r, 400));
      const a = e.def.attacks.find((x) => x.id === atk);
      e.startAttack(a, h.pos);
      await new Promise((r) => setTimeout(r, a.windup * 650));
      return { state: e.state, atk: e.atk && e.atk.a.id, tele: !!(e.atk && e.atk.tele), d: +e.pos.distanceTo(h.pos).toFixed(1), items: D.fx.items.length };
    }, [type, atk, dist, camDist]).then((r) => c.log(name, JSON.stringify(r)));
    await c.shot(name);
  };
  await shot("qingya", "sweep", 5, 11, "qingya_sector_close");
  await shot("qingya", "sweep", 5, 30, "qingya_sector_game");
  await shot("qingya", "bite", 6, 12, "qingya_line_close");
  await shot("golem", "slam", 2.5, 11, "golem_ring_close");
  // 首领喘息（输出窗口）：低头、墨气外散、头顶淡金"隙"
  await c.ev(async () => {
    const D = window.__enemies, h = D.hero, V = h.pos.constructor, rig = D.ctx.rig;
    for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
    D.list.length = 0;
    if (rig) rig.dist = 16;
    const e = D.spawn("qingya", new V(h.pos.x + 3.5, h.pos.y, h.pos.z - 1), { region: "r1" });
    e.yaw = e.wantYaw = Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
    D.ctx.shields && D.ctx.shields.drop(e.entity);
    e.entity.shield = null;
    e.phaseIdx = 99;
    for (const k in e.cool) e.cool[k] = 99;
    await new Promise((r) => setTimeout(r, 300));
    e.wind();
    await new Promise((r) => setTimeout(r, 900));
    const g = document.querySelector(".jx-gap");
    return g ? { text: g.textContent, op: g.style.opacity, left: g.style.left, top: g.style.top, state: e.state } : { none: 1, state: e.state };
  }).then((r) => c.log("winded", JSON.stringify(r)));
  await c.shot("qingya_winded");
  await c.ev(() => window.__enemies.ctx.rig && (window.__enemies.ctx.rig.dist = 30));
  const errs = await c.ev(() => (window.__errors || []).length);
  c.log((errs === 0 ? "PASS" : "FAIL") + " no runtime errors " + errs);
}
