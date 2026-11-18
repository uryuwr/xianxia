// v0.3 技能调整的可运行测试：境界栏位、冷却、五行护盾、右键手势不离开页面
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => (R.push(!!ok), c.log((ok ? "PASS " : "FAIL ") + n, info ? JSON.stringify(info) : ""));
  await c.wait(2500);
  // 清掉自动刷的狼群，避免干扰
  await c.ev(() => { const E = window.__enemies; if (E) { E.auto = !1; for (const e of [...E.list]) e.entity.alive && __game.world.dealDamage(null, e.entity, { base: 1e6, noCrit: !0 }); } });
  await c.wait(800);

  // ① 境界栏位
  const r1 = await c.ev(() => {
    const S = __game.ctx.skills;
    S.setRealm("lianqi1");
    const out = { slots1: S.slots, castLocked: S.castSpell(1) };
    S.setRealm("lianqi5");
    out.slots5 = S.slots;
    S.setRealm("zhuji");
    out.slots9 = S.slots;
    out.lockedUi = document.querySelectorAll(".jx-slot.locked").length;
    return out;
  });
  check("realm gates spell slots 1→2→3, locked slot refuses cast", r1.slots1 === 1 && r1.slots5 === 2 && r1.slots9 === 3 && r1.castLocked === !1 && r1.lockedUi === 0, r1);

  // ② 冷却 8～18 秒、技能池 5 个且五行不重复
  const r2 = await c.ev(() => {
    const ids = ["sword_qi", "fire_talisman", "frost", "vine", "earth_shield"];
    const S = __game.ctx.skills;
    S.setLoadout({ spells: ids.slice(0, 3) });
    const cds = ids.map((id) => { S.setLoadout({ spells: [id, null, null] }); const sp = S.spellAt(0); return [sp.cd, sp.element, sp.role]; });
    return { cds };
  });
  const els = new Set(r2.cds.map((x) => x[1]));
  check("5 spells, cd 8–18 s, one per element, each has a role", r2.cds.every((x) => x[0] >= 8 && x[0] <= 18 && x[2]) && els.size === 5, r2);

  // ④ 五行护盾
  const r4 = await c.ev(() => {
    const G = __game, w = G.world, p = G.player;
    const e = G.ctx.enemies.spawn("wolf_elite", { x: p.pos.x + 4, y: p.pos.y, z: p.pos.z });
    const ent = e.entity;
    // 固定为火盾：水克火
    G.ctx.shields.drop(ent);
    G.ctx.shields.give(ent, "fire");
    const hp0 = ent.hp, sh0 = ent.shield.hp;
    w.dealDamage(p.entity, ent, { base: 100, noCrit: !0 }); // 无属性
    const shPhys = sh0 - ent.shield.hp, hpAfterPhys = ent.hp;
    const s1 = ent.shield.hp;
    w.dealDamage(p.entity, ent, { base: 100, element: "metal", noCrit: !0 }); // 非克制
    const shOther = s1 - ent.shield.hp;
    const s2 = ent.shield.hp;
    w.dealDamage(p.entity, ent, { base: 100, element: "water", noCrit: !0 }); // 克制
    const shCounter = s2 - ent.shield.hp;
    let n = 0;
    while (ent.shield.hp > 0 && n++ < 50) w.dealDamage(p.entity, ent, { base: 200, element: "water", noCrit: !0 });
    const broke = ent.shield.hp <= 0, stunned = ent.statuses.has("stun"), vuln = ent.stats.get("vuln");
    const hp1 = ent.hp;
    w.dealDamage(p.entity, ent, { base: 100, noCrit: !0 });
    return { hp0, hpAfterPhys, shPhys, shOther, shCounter, broke, stunned, vuln, bodyDmgAfterBreak: hp1 - ent.hp, bar: !!document.querySelector(".jx-ebar.shielded") || broke };
  });
  check("shield blocks body damage", r4.hpAfterPhys === r4.hp0, r4);
  check("counter element ×2, others weak (数值评审：其他五行 0.2 < 无属性 0.25)", r4.shCounter > r4.shOther * 6 && r4.shPhys > r4.shOther, r4);
  check("break → stun + vuln, body takes damage", r4.broke && r4.stunned && r4.vuln > 0.2 && r4.bodyDmgAfterBreak > 0, r4);
  await c.shot("shield");

  // 右键手势：模拟浏览器后退，页面仍留在游戏
  const href0 = await c.ev(() => location.href);
  await c.ev(() => history.back());
  await c.wait(600);
  const r5 = await c.ev(() => ({ href: location.href, alive: !!window.__game }));
  check("gesture back stays on the game page", r5.href === href0 && r5.alive, r5);
  const errs = await c.ev(() => window.__errors.length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
