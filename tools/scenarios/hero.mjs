// 主角可运行测试：移动、闪身（充能 / 冷却 / 无敌帧 / 完美闪身）、普攻三连命中、施法接口、伤害数字、死亡与重生。
// 2026-11 战斗 · 气势与身法 v1：闪身改为 1 次充能、2.75 秒冷却（练气一层），冷却中再按被拒；三连按"出到第三段"等待（攻速 0.8），
// 命中数允许 ≥1（沙盒会自动刷怪，旁边的狼也会被扫到）。
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.waitForFunction(() => window.__game && window.__game.heroSource, null, { timeout: 60000 });
  const boot = await c.ev(() => ({ src: __game.heroSource, acts: Object.keys(__game.player.actions), err: window.__errors.length }));
  check("hero.glb loaded with cast/hit/die", boot.src === "hero.glb" && ["cast_point", "cast_sweep", "cast_raise", "hit", "die", "slash3", "dodge"].every((a) => boot.acts.includes(a)), boot);

  // 1) WASD 移动
  const p0 = await c.ev(() => __game.player.pos.toArray());
  await page.keyboard.down("KeyW");
  await c.wait(700);
  await page.keyboard.up("KeyW");
  await c.wait(200);
  const p1 = await c.ev(() => __game.player.pos.toArray());
  const mv = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  check("WASD moves", mv > 2, { mv: +mv.toFixed(2) });

  // 2) 闪身：位移约 5 米、消耗一次充能
  const d0 = await c.ev(() => ({ p: __game.player.pos.toArray(), ch: __game.player.dashCharges }));
  await page.keyboard.down("KeyS");
  await page.keyboard.press("Space");
  await c.wait(60);
  const ch1 = await c.ev(() => __game.player.dashCharges);
  await c.wait(300);
  await page.keyboard.up("KeyS");
  const d1 = await c.ev(() => __game.player.pos.toArray());
  const dd = Math.hypot(d1[0] - d0.p[0], d1[2] - d0.p[2]);
  check("dash moves ~5m and uses a charge", dd > 3.5 && ch1 === d0.ch - 1, { dd: +dd.toFixed(2), before: d0.ch, after: ch1 });
  // 冷却中再按闪身：被拒（不消耗、不位移）
  const dn = await c.ev(() => ({ p: __game.player.pos.toArray(), st: __game.player.state }));
  await page.keyboard.press("Space");
  await c.wait(120);
  const dn2 = await c.ev(() => ({ p: __game.player.pos.toArray(), st: __game.player.state, ch: __game.player.dashCharges }));
  check("dash refused while on cooldown", dn2.st !== "dash" && dn2.ch === 0 && Math.hypot(dn2.p[0] - dn.p[0], dn2.p[2] - dn.p[2]) < 0.6, dn2);
  await page.waitForFunction(() => __game.player.dashCharges === __game.player.dashMax, null, { timeout: 8000 }).catch(() => {});
  const rc = await c.ev(() => ({ ch: __game.player.dashCharges, max: __game.player.dashMax, rech: __game.player.dashRecharge() }));
  check("dash charge recharges (cooldown 2.75s)", rc.ch === rc.max && rc.max === 1 && Math.abs(rc.rech - 2.75) < 1e-6, rc);

  // 测试用木桩（敌方实体，带受击闪白回调）
  await c.ev(() => {
    const T = __game.THREE, w = __game.world, P = __game.player;
    window.__flash = 0;
    window.__ev = { attack: [], perfect: 0, respawn: 0, dash: 0 };
    w.events.on("player:attack", (e) => __ev.attack.push(e));
    w.events.on("player:perfectDodge", () => __ev.perfect++);
    w.events.on("player:respawn", () => __ev.respawn++);
    w.events.on("player:dash", () => __ev.dash++);
    const e = w.add({ id: 99001, team: "enemy", pos: new T.Vector3(P.pos.x, P.pos.y, P.pos.z - 2.2), radius: 0.5, height: 1.5, alive: !0, statuses: new Map(), tags: new Set(), owner: { flash: () => __flash++ } });
    e.stats.setBase("hp", 5000);
    e.hp = 5000;
    window.__dummy = e;
  });

  // 3) 无敌帧：闪身中受到攻击 → 伤害被取消，触发完美闪身（慢动作）
  const inv = await c.ev(async () => {
    const P = __game.player, w = __game.world, hp0 = P.entity.hp;
    P.dashCharges = P.dashMax;
    P.startDash(new __game.THREE.Vector3(1, 0, 0));
    const r = w.dealDamage(__dummy, P.entity, { base: 40, noCrit: !0 });
    return { cancelled: r === null, hp0, hp1: P.entity.hp, slow: w.timeScale, perfect: __ev.perfect };
  });
  check("i-frames cancel damage → perfect dodge slow-mo", inv.cancelled && inv.hp0 === inv.hp1 && inv.perfect === 1 && inv.slow < 1, inv);
  await c.wait(900);
  check("slow-mo restores", (await c.ev(() => __game.world.timeScale)) === 1);

  // 4) 普攻三连：木桩摆在主角正前方，鼠标指向木桩，按住左键
  await c.ev(() => {
    const P = __game.player;
    __dummy.pos.set(P.pos.x, P.pos.y, P.pos.z - 2.0);
  });
  await c.wait(150);
  const scr = await c.ev(() => {
    const v = __dummy.pos.clone();
    v.y += 0.8;
    v.project(__game.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  });
  await page.mouse.move(scr[0], scr[1]);
  const hpA = await c.ev(() => ((__game.player.momentum = 0), __dummy.hp));
  await page.mouse.down();
  for (const s of [1, 2, 3]) {
    await page.waitForFunction((n) => __ev.attack.some((a) => a.step === n), s, { timeout: 5000 }).catch(() => {});
    await c.shot("combo" + s);
  }
  const nums = await c.ev(() => document.querySelectorAll("#dmg b").length);
  await page.mouse.up();
  await c.wait(800);
  const atk = await c.ev(() => ({ hp: __dummy.hp, steps: __ev.attack.map((a) => a.step + ":" + a.hits), flash: __flash }));
  check("3-hit combo damages dummy (steps 1→2→3, all hit)", atk.hp < hpA && [1, 2, 3].every((s) => atk.steps.some((x) => x.startsWith(s + ":") && +x.split(":")[1] >= 1)), { hpA, ...atk });
  check("enemy hit flash via owner.flash()", atk.flash >= 3, atk.flash);
  check("damage numbers in DOM", nums > 0, nums);

  // 5) 施法接口
  await c.wait(300);
  const cast = await c.ev(() => {
    const P = __game.player;
    const ok = P.cast("point");
    return { ok, state: P.state, anim: P.cur && P.cur.getClip().name, busy: P.busy };
  });
  check("cast('point') allowed, plays cast_point, locks movement", cast.ok && cast.state === "cast" && cast.anim === "cast_point" && cast.busy, cast);
  await c.wait(150);
  await c.shot("cast_point");
  const blocked = await c.ev(() => {
    const P = __game.player;
    P.dashCharges = P.dashMax;
    P.startDash(new __game.THREE.Vector3(0, 0, 1));
    return P.cast("raise");
  });
  check("cast refused while dashing", blocked === !1);
  await c.wait(600);
  const sweepOk = await c.ev(() => __game.player.cast("sweep") && __game.player.cur.getClip().name);
  check("cast('sweep') plays cast_sweep", sweepOk === "cast_sweep", sweepOk);
  await c.wait(700);

  // 6) 受伤与死亡 → 2 秒后重生
  const hurt = await c.ev(() => {
    const P = __game.player, w = __game.world;
    P.hurtUntil = 0; // 沙盒里的狼可能刚咬过（受击无敌中），先清掉
    const h0 = P.entity.hp;
    w.dealDamage(__dummy, P.entity, { base: 30, noCrit: !0 });
    const h1 = P.entity.hp;
    const again = w.dealDamage(__dummy, P.entity, { base: 30, noCrit: !0 }); // 受击后短暂无敌
    return { h0, h1, again: again === null, vig: +getComputedStyle(document.getElementById("hurtvig")).opacity };
  });
  check("hurt takes damage, then brief invuln", hurt.h1 < hurt.h0 && hurt.again, hurt);
  await c.wait(600);
  const dead = await c.ev(() => {
    const P = __game.player;
    // 沙盒里的狼可能刚咬过主角：先清掉受击 / 闪身无敌，再给致命一击
    P.hurtUntil = 0;
    P.invulnUntil = 0;
    __game.world.dealDamage(__dummy, P.entity, { base: 99999, noCrit: !0 });
    return { alive: P.entity.alive, state: P.state };
  });
  await c.wait(700);
  await c.shot("die");
  check("lethal damage → dead", !dead.alive && dead.state === "dead", dead);
  await c.wait(1800);
  const rs = await c.ev(() => ({ alive: __game.player.entity.alive, hp: __game.player.entity.hp, max: __game.player.entity.stats.get("hp"), state: __game.player.state, ev: __ev.respawn }));
  check("respawn after ~2s with full hp", rs.alive && rs.hp === rs.max && rs.state === "move" && rs.ev === 1, rs);

  // HUD
  const hud = await c.ev(() => ({ hp: document.querySelector("#hud .hp .val").textContent, dots: document.querySelectorAll("#hud .dash i").length, max: __game.player.dashMax, mom: !!document.querySelector("#hud .mom .mb") }));
  check("HUD shows hp / dash dots / momentum stroke", /\d+ \/ \d+/.test(hud.hp) && hud.dots === hud.max && hud.mom, hud);
  await c.shot("hud");
  const errs = await c.ev(() => window.__errors.length);
  check("no runtime errors", errs === 0, errs);
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
