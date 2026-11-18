// 敌人境界显示：练气三层的主角看 练气一层的狼（准确）/ 练气五层的头目（神识不够 → "练气?"，够 → 准确）/ 碧鳞（筑基 → "???"），各截一张血条图。
// 运行：node tools/run.mjs realm_view
export default async function (page, c) {
  await page.routeWebSocket(/.*/, () => {});
  await page.reload();
  await page.waitForFunction(() => window.__enemies && window.__enemies.ready, null, { timeout: 180000 });
  const R = [];
  const check = (name, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + name, info === undefined ? "" : JSON.stringify(info));
  };
  await c.ev(() => {
    const D = window.__enemies, ctx = D.ctx;
    D.auto = !1;
    for (const e of [...D.list]) e.dispose();
    D.list.length = 0;
    window.__savedProfile = ctx.profile;
    ctx.profile = { ...(ctx.profile || {}), realm: { stage: 1, layer: 3 }, flags: (ctx.profile && ctx.profile.flags) || {}, stats: (ctx.profile && ctx.profile.stats) || {} };
    ctx.world.events.on("beforeDamage", (i) => i.target.team === "enemy" && !(i.spec && i.spec.test) && (i.cancel = !0));
    if (ctx.rig) ctx.rig.dist = 14;
  });
  const show = async (type, level, sense, name) => {
    const r = await c.ev(async ([type, level, sense]) => {
      const D = window.__enemies, h = D.hero, V = h.pos.constructor;
      for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
      D.list.length = 0;
      h.stats.setBase("sense", sense);
      if (D.ctx.rig) D.ctx.rig.dist = type === "bilin" ? 26 : 14;
      const e = D.spawn(type, new V(h.pos.x + (type === "bilin" ? 7 : 3.5), h.pos.y, h.pos.z + (type === "bilin" ? -6 : 0)), { region: type === "bilin" ? "r2" : "r1", level });
      for (const k in e.cool) e.cool[k] = 99;
      e.state = "idle";
      D.bars.touch(e);
      await new Promise((r) => setTimeout(r, 700));
      const b = D.bars.bars.get(e);
      return { label: D.realmLabel(e), dom: b && b.d.querySelector(".name").textContent, cls: b && b.rl.className, realm: e.realm() };
    }, [type, level, sense]);
    await c.shot(name);
    return r;
  };
  const a = await show("wolf", 1, 16, "wolf_l1");
  check("练气三层看练气一层的狼：准确境界", a.label.text === "练气一层" && a.dom.includes("练气一层"), a);
  const b = await show("wolf_elite", 5, 16, "elite_unclear");
  check("看练气五层的头目，神识 16 不够（需 32）：练气?", b.label.text === "练气?" && b.cls.includes("warn") && b.dom.includes("狼妖头目"), b);
  const b2 = await show("wolf_elite", 5, 40, "elite_clear");
  check("神识 40 够：练气五层", b2.label.text === "练气五层", b2);
  const d = await show("bilin", 9, 100, "bilin_unknown");
  check("看碧鳞（筑基一层）：???（朱色）", d.label.text === "???" && d.cls.includes("danger"), d);
  await c.ev(() => {
    const D = window.__enemies;
    for (const e of [...D.list]) (D.bars.remove(e), D.ctx.shields && D.ctx.shields.drop(e.entity), e.dispose());
    D.list.length = 0;
    D.ctx.profile = window.__savedProfile;
  });
  const errs = await c.ev(() => (window.__errors || []).length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
