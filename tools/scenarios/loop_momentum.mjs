// 气势与身法（战斗 · 气势与身法 v1）可运行测试：闪身冷却、攻速随境界、气势积攒 / 衰减 / 受击扣除、蓄势斩（伤害 / 范围 / 剑气 / 破盾）、
// 普攻流心法与词条、HUD（气势墨痕、闪身墨点冷却扫过）。
// 2026-11-17 起蓄势斩改为右键主动释放（≥50 可放、按比例；满 = 势成锁定不流失），不再在三段之后自动接出；法宝改 V。
// 用法：node tools/run.mjs loop_momentum "scene=run&region=r1"
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 90000 });
  await c.wait(800);

  // ---- 准备：清掉本局的敌人、主角无敌、鼠标指向主角北侧；工具函数 ----
  await page.mouse.move(640, 250);
  await c.wait(200);
  await c.ev(() => {
    const G = __game, P = G.player, w = G.world, T = G.THREE;
    G.run.clearEnemies && G.run.clearEnemies();
    G.ctx.enemies.auto = !1;
    P.debug.god = !0;
    window.__ev = { attack: [], charge: [], denied: 0, dash: 0, after: [], dmg: [] };
    w.events.on("player:attack", (e) => __ev.attack.push({ ...e, t: w.time }));
    w.events.on("player:charge", (e) => __ev.charge.push({ hits: e.hits, t: w.time, mom: P.momentum, full: e.full, from: e.momentum }));
    w.events.on("player:chargeDenied", () => __ev.denied2 = (__ev.denied2 || 0) + 1);
    w.events.on("player:dashDenied", () => __ev.denied++);
    w.events.on("player:dash", () => __ev.dash++);
    w.events.on("player:aftershock", (e) => __ev.after.push(e.hits));
    w.events.on("damage", (i) => i.attacker === P.entity && __ev.dmg.push({ id: i.target.id, amount: i.amount, crit: i.crit, tags: i.tags.slice(), shield: i.shieldHit ? i.shieldHit.dmg : 0 }));
    window.__dummies = [];
    let nid = 990000;
    // 木桩：沿瞄准方向 dist 米（side 为横向偏移）
    window.__mk = (dist, side = 0, hp = 1e6) => {
      const d = P.aimDir(new T.Vector3()), sx = -d.z, sz = d.x;
      const e = w.add({ id: ++nid, team: "enemy", pos: new T.Vector3(P.pos.x + d.x * dist + sx * side, P.pos.y, P.pos.z + d.z * dist + sz * side), radius: 0.5, height: 1.5, alive: !0, statuses: new Map(), tags: new Set(), owner: { flash() {} } });
      e.stats.setBase("hp", hp);
      e.hp = hp;
      __dummies.push(e);
      return e.id;
    };
    window.__clearAll = () => {
      const E = G.ctx.enemies;
      for (const e of [...E.list]) (e.entity.alive = !1), w.remove(e.entity), e.dispose && e.dispose();
      E.list.length = 0;
      __clearDummies();
    };
    window.__clearDummies = () => {
      for (const e of __dummies) (e.alive = !1), w.remove(e);
      __dummies = [];
    };
    window.__realm = (stage, layer, xinfa = []) => {
      const p = G.profile;
      p.realm = { stage, layer };
      p.build.xinfa = xinfa.slice();
      p.unlocks.xinfaSlots = 2;
      G.ctx.applyProfileStats(p);
      P.update(0);
      return { aspd: +P.entity.stats.get("aspd").toFixed(3), dashMax: P.dashMax, rech: +P.dashRecharge().toFixed(3) };
    };
    // 关闭暴击，便于比较伤害
    window.__noCrit = (on) => (P.entity.stats.removeSource("testNoCrit"), on && P.entity.stats.add({ stat: "crit", type: "more", value: -1, source: "testNoCrit" }));
    window.__hold = (on) => (G.ctx.input.mouse.left = on);
    // 右键（模拟按下，走 targeting 模块的真实分支）：等到蓄势斩出伤或超时
    window.__rclick = async (timeout = 4000) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let t0 = performance.now();
      while (P.state !== "move" && performance.now() - t0 < 3000) await sleep(16);
      const n = __ev.charge.length;
      G.ctx.input.mouse.rightPressed = !0;
      t0 = performance.now();
      while (__ev.charge.length === n && performance.now() - t0 < timeout) await sleep(8);
      return __ev.charge.length > n;
    };
    // 从第一段开始按住左键，直到 until() 为真后松开（无头浏览器帧率低，用玩法时间，不用真实时间）
    window.__combo = async (until, timeout = 8000) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let t0 = performance.now();
      while (P.state !== "move" && performance.now() - t0 < 3000) await sleep(16);
      P.comboIdle = 9;
      P.queued = !1;
      __hold(!0);
      t0 = performance.now();
      while (!until() && performance.now() - t0 < timeout) await sleep(8);
      __hold(!1);
      return until();
    };
  });
  const errs0 = await c.ev(() => window.__errors.length);
  check("boot run scene without errors", errs0 === 0, errs0);

  // ======== 1) 闪身冷却 ========
  const r11 = await c.ev(() => __realm(1, 1));
  check("练气一层：闪身 1 次充能、冷却 2.75 秒、攻速 0.65", r11.dashMax === 1 && Math.abs(r11.rech - 2.75) < 1e-6 && Math.abs(r11.aspd - 0.65) < 1e-6, r11);
  const hudDots = await c.ev(() => document.querySelectorAll("#hud .dash i").length);
  check("HUD 闪身墨点数 = 充能数", hudDots === 1, hudDots);
  await c.ev(() => ((__game.player.dashCharges = __game.player.dashMax), (__game.player.dashRegen = 0)));
  const p0 = await c.ev(() => __game.player.pos.toArray());
  await page.keyboard.press("Space");
  await c.wait(350);
  const a1 = await c.ev(() => ({ p: __game.player.pos.toArray(), ch: __game.player.dashCharges, dash: __ev.dash }));
  const moved1 = Math.hypot(a1.p[0] - p0[0], a1.p[2] - p0[2]);
  check("第一次闪身：发生位移（地形可能挡住一部分）、用掉唯一一次充能", moved1 > 1.5 && a1.ch === 0 && a1.dash === 1, { moved1: +moved1.toFixed(2), ch: a1.ch });
  await c.wait(150);
  const k1 = await c.ev(() => ({ k: __game.player.dashCdK, css: document.querySelector("#hud .dash i").style.getPropertyValue("--k") }));
  await page.keyboard.press("Space");
  await c.wait(300);
  const a2 = await c.ev(() => ({ p: __game.player.pos.toArray(), ch: __game.player.dashCharges, dash: __ev.dash, denied: __ev.denied, state: __game.player.state }));
  const moved2 = Math.hypot(a2.p[0] - a1.p[0], a2.p[2] - a1.p[2]);
  check("冷却中第二次闪身被拒（不位移、发出 dashDenied）", a2.dash === 1 && a2.denied >= 1 && moved2 < 0.5 && a2.state !== "dash", { moved2: +moved2.toFixed(2), ...a2 });
  check("HUD 闪身墨点显示冷却进度（墨晕扫过 --k）", k1.k > 0.05 && k1.k < 0.6 && +k1.css > 0 && +k1.css < 1, k1);
  await c.shot("dash_cd_hud", { clip: { x: 0, y: 0, width: 420, height: 170 } });
  await c.wait(2300);
  const a3 = await c.ev(() => __game.player.dashCharges);
  check("约 2.75 秒后充能恢复", a3 === 1, a3);
  // 完美闪身：返还 60% 冷却
  const pf = await c.ev(() => {
    const P = __game.player, w = __game.world, T = __game.THREE;
    const id = __mk(3);
    const dm = __dummies.find((e) => e.id === id);
    P.debug.god = !1;
    P.startDash(new T.Vector3(1, 0, 0));
    const r = w.dealDamage(dm, P.entity, { base: 30, noCrit: !0 });
    P.debug.god = !0;
    return { cancelled: r === null, regen: +P.dashRegen.toFixed(3), ch: P.dashCharges, mom: Math.round(P.momentum) };
  });
  check("完美闪身返还 60% 冷却（约 1.65 秒）并获得气势 25", pf.cancelled && pf.ch === 0 && Math.abs(pf.regen - 1.65) < 0.05 && pf.mom === 25, pf);
  // 无头浏览器帧率低，用玩法时间量：从完美闪身到充能恢复约 1.1 秒
  const pt0 = await c.ev(() => __game.world.time);
  await page.waitForFunction(() => __game.player.dashCharges === 1, null, { timeout: 8000 }).catch(() => {});
  const pdt = await c.ev((t0) => ({ ch: __game.player.dashCharges, dt: +(__game.world.time - t0).toFixed(2) }), pt0);
  check("完美闪身后约 1.1 秒即可再闪（玩法时间）", pdt.ch === 1 && pdt.dt < 1.4, pdt);
  await c.ev(() => __clearDummies());

  // ======== 2) 境界成长：第二次充能、攻速 ========
  const r16 = await c.ev(() => __realm(1, 6));
  check("练气六层：闪身 2 次充能（境界解锁）", r16.dashMax === 2 && (await c.ev(() => __game.player.dashCharges)) === 2, r16);
  const rflow = await c.ev(() => __realm(1, 6, ["dash_flow"]));
  check("心法《流云》：充能 +1、冷却 -10%", rflow.dashMax === 3 && Math.abs(rflow.rech - 2.475) < 0.01, rflow);
  const r21 = await c.ev(() => __realm(2, 1));
  check("筑基一层：攻速 1.00、闪身 2 次 / 2.5 秒", Math.abs(r21.aspd - 1.0) < 1e-6 && r21.dashMax === 2 && Math.abs(r21.rech - 2.5) < 1e-6, r21);

  // 一套三连的时长：练气一层 vs 筑基一层（真实按住左键）
  async function comboTime(stage, layer) {
    await c.ev(([s, l]) => {
      __realm(s, l);
      __clearDummies();
      __mk(1.8);
      __ev.attack = [];
      __game.player.momentum = 0;
    }, [stage, layer]);
    await c.wait(250);
    const t0 = 0;
    const info = await c.ev(async () => {
      await __combo(() => __ev.attack.some((a) => a.step === 2));
      const t1 = performance.now();
      while (!__ev.attack.some((a) => a.step === 3) && performance.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 8));
      const P = __game.player, a = __ev.attack;
      const f1 = a.find((x) => x.step === 1), f3 = a.find((x) => x.step === 3);
      return { t13: f1 && f3 ? (f3.t - f1.t) * 1000 : -1, raw: a.map((x) => [x.step, x.hits, Math.round(x.t * 1000)]), ts: P.cur ? +P.cur.timeScale.toFixed(3) : 0, clip: P.cur ? +P.cur.getClip().duration.toFixed(3) : 0, steps: a.map((x) => x.step + ":" + x.hits), mt: P.moveTimes() };
    });
    await c.wait(700);
    return { ...info, t0 };
  }
  const cA = await comboTime(1, 1);
  const cB = await comboTime(2, 1);
  check("练气一层一套连招明显慢于筑基一层（攻速 0.80 vs 1.15，第一段→第三段出伤的玩法时间）", cB.t13 > 0 && cA.t13 > cB.t13 * 1.3, { lianqi1: Math.round(cA.t13), zhuji1: Math.round(cB.t13), rawA: cA.raw, rawB: cB.raw });
  check("招式动画播放速度跟随攻速", cB.ts > cA.ts * 1.3, { lianqi1: cA.ts, zhuji1: cB.ts });

  // ======== 3) 气势积攒、衰减、受击扣除 ========
  await c.ev(() => {
    __realm(1, 1);
    __clearDummies();
    __mk(1.8);
    __noCrit(!0);
    __ev.attack = [];
    __game.player.momentum = 0;
  });
  await c.wait(200);
  const g1 = await c.ev(async () => {
    await __combo(() => __ev.attack.some((a) => a.step === 2)); // 第二段出伤时松开：第三段已预输入，不会再接第一段
    const t1 = performance.now();
    while (!__ev.attack.some((a) => a.step === 3) && performance.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 8));
    return { mom: +__game.player.momentum.toFixed(2), steps: __ev.attack.map((a) => a.step + ":" + a.hits) };
  });
  check("普攻三段命中积攒气势 8 + 10 + 15 = 33", Math.abs(g1.mom - 33) < 0.01, g1);
  const hud1 = await c.ev(() => ({ v: +document.querySelector("#hud .mom .mb > i").style.getPropertyValue("--v"), full: document.querySelector("#hud .mom").classList.contains("full") }));
  check("HUD 气势墨痕按比例露出", Math.abs(hud1.v - 0.33) < 0.02 && !hud1.full, hud1);
  // v1.3：气势不随时间流失（未满也不衰减）
  await page.waitForFunction(() => __game.player.momT > 8, null, { timeout: 30000 });
  const dec = await c.ev(() => ({ mom: +__game.player.momentum.toFixed(2), momT: +__game.player.momT.toFixed(1) }));
  check("未满：停手 8 秒（玩法时间）气势不流失", dec.mom === 33, dec);
  const hurt = await c.ev(() => {
    const P = __game.player, w = __game.world;
    P.momentum = 50;
    P.momT = 0;
    P.debug.god = !1;
    P.hurtUntil = 0;
    P.invulnUntil = 0;
    w.dealDamage(__dummies[0], P.entity, { base: 5, noCrit: !0 });
    P.debug.god = !0;
    P.entity.hp = P.entity.stats.get("hp");
    return +P.momentum.toFixed(2);
  });
  check("受击扣除气势 4（未满时）", Math.abs(hurt - 46) < 0.01, hurt);
  const hurtFull = await c.ev(() => {
    const P = __game.player, w = __game.world;
    P.momentum = 100;
    P.debug.god = !1;
    P.hurtUntil = 0;
    P.invulnUntil = 0;
    w.dealDamage(__dummies[0], P.entity, { base: 5, noCrit: !0 });
    P.debug.god = !0;
    P.entity.hp = P.entity.stats.get("hp");
    return P.momentum;
  });
  check("势成（满）时受击不扣气势", hurtFull === 100, hurtFull);

  // ======== 4) 蓄势斩：右键主动释放 ========
  // (a) 按住左键连段打满气势：不会自动出蓄势斩
  const auto = await c.ev(async () => {
    __clearDummies();
    __mk(1.8);
    __ev.attack = [];
    __ev.charge = [];
    __game.player.momentum = 70;
    await __combo(() => __ev.attack.filter((a) => a.step === 3).length >= 3, 15000);
    await new Promise((r) => setTimeout(r, 900));
    return { steps: __ev.attack.map((a) => a.step + (a.charge ? "*" : "")), charges: __ev.charge.length, mom: __game.player.momentum, full: __game.player.momentumFull };
  });
  check("按住左键连段打满气势：不自动出蓄势斩（只有 1→2→3 循环）", auto.full && auto.charges === 0 && auto.steps.every((x) => ["1", "2", "3"].includes(x)) && auto.steps.length >= 9, auto);
  await c.shot("momentum_full_hud", { clip: { x: 0, y: 0, width: 420, height: 170 } });
  const fullHud = await c.ev(() => ({ full: document.querySelector("#hud .mom").classList.contains("full"), seal: document.querySelector("#hud .mom .seal").textContent, op: getComputedStyle(document.querySelector("#hud .mom .seal")).opacity }));
  check("势成：墨痕转朱泛金、钤'势成'朱印", fullHud.full && fullHud.seal === "势成", fullHud);
  await c.shot("momentum_full_scene");
  // (b) 势成后 10 秒（玩法时间）不流失
  await c.ev(() => (__game.player.momT = 0));
  await page.waitForFunction(() => __game.player.momT > 10.2, null, { timeout: 40000 });
  const hold = await c.ev(() => ({ mom: __game.player.momentum, momT: +__game.player.momT.toFixed(1) }));
  check("势成后停手 10 秒气势不流失", hold.mom === 100, hold);
  // (c) 气势 < 50 按右键：不出招，"势未成"提示（光标旁 + HUD 抖动）
  const deny = await c.ev(async () => {
    const P = __game.player;
    P.momentum = 40;
    P.momT = 0;
    const n = __ev.charge.length, d0 = __ev.denied2 || 0;
    const row = document.querySelector("#hud .mom");
    let hudDeny = !1;
    const mo = new MutationObserver(() => row.classList.contains("deny") && (hudDeny = !0));
    mo.observe(row, { attributes: !0 });
    const ok = await __rclick(800);
    mo.disconnect();
    return { ok, charges: __ev.charge.length - n, denied: (__ev.denied2 || 0) - d0, state: P.state, mom: P.momentum, hudDeny };
  });
  check("气势 < 50 按右键：不出招、发 chargeDenied、HUD 气势条抖动", !deny.ok && deny.charges === 0 && deny.denied === 1 && deny.mom === 40 && deny.hudDeny, deny);
  // (d) 满势：右键释放（真实鼠标右键点在画面上），伤害 / 范围 / 剑气；释放后清零
  await c.ev(() => {
    __clearDummies();
    window.__near = __mk(2.0);
    window.__far = __mk(6.6);
    __ev.attack = [];
    __ev.dmg = [];
    __ev.charge = [];
    __game.player.momentum = 100;
  });
  // 先打一套记录普通第三段
  await c.ev(async () => {
    await __combo(() => __ev.attack.some((a) => a.step === 2));
    const t1 = performance.now();
    while (!__ev.attack.some((a) => a.step === 3) && performance.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 8));
  });
  await page.waitForFunction(() => __game.player.state === "move", null, { timeout: 5000 });
  await c.ev(() => (__game.player.momentum = 100));
  const rp = await c.ev(() => {
    const v = __game.player.pos.clone().addScaledVector(__game.player.aimDir(), 3);
    v.project(__game.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  });
  await c.ev(() => {
    window.__dbg = [];
    const P = __game.player, o = P.tryCharge.bind(P);
    P.tryCharge = () => { const r = o(); __dbg.push("try:" + r + ":" + P.state + ":" + P.momentum); return r; };
  });
  await page.mouse.click(rp[0], rp[1], { button: "right" });
  await page.waitForFunction(() => __ev.charge.length > 0, null, { timeout: 6000 }).catch(async () => console.log("FAIL right click debug", JSON.stringify(await c.ev(() => ({ dbg: __dbg, st: __game.player.state, mom: __game.player.momentum, el: document.elementFromPoint(...arguments) && 0 })))));
  await c.wait(40);
  await c.shot("charge_full");
  await c.wait(110);
  await c.shot("charge_full_wave");
  await c.wait(900);
  const ch = await c.ev(() => {
    const d = __ev.dmg;
    const near = d.filter((x) => x.id === __near), far = d.filter((x) => x.id === __far);
    const s3 = near.find((x) => x.tags.includes("step3")), cs = near.find((x) => x.tags.includes("charge") && !x.tags.includes("wave"));
    return {
      steps: __ev.attack.map((a) => a.step + ":" + a.hits + (a.charge ? "*" : "")),
      step3: s3 && s3.amount, charge: cs && cs.amount,
      farByNormal: far.filter((x) => !x.tags.includes("charge")).length, farByWave: far.filter((x) => x.tags.includes("wave")).length,
      mom: __ev.charge[0] && __ev.charge[0].mom, full: __ev.charge[0] && __ev.charge[0].full, last: __game.player.lastCharge,
    };
  });
  check("真实右键（不在瞄准中）放出满势蓄势斩", ch.full === !0 && ch.steps.some((x) => x.startsWith("4:") && x.endsWith("*")), ch.steps);
  check("蓄势斩横扫远大于普通第三段（75 + 3.45 × 攻击 vs 1.6 × 攻击）", ch.charge > ch.step3 * 3, { step3: ch.step3, charge: ch.charge });
  check("满势月牙剑气打到 6.6 米外的木桩（普通三段够不到）", ch.farByWave === 1 && ch.farByNormal === 0, ch);
  check("右键释放后气势清零", ch.mom === 0, ch.mom);
  // (e) 半势（50）：伤害约为满势的 55–60%，范围 / 剑气更短，没有慢动作
  const half = await c.ev(async () => {
    __clearDummies();
    const id = __mk(2.0);
    __ev.dmg = [];
    __ev.charge = [];
    const P = __game.player;
    P.momentum = 50;
    const ts = [];
    const ok = await __rclick();
    const t0 = performance.now();
    while (performance.now() - t0 < 120) ts.push(__game.world.timeScale), await new Promise((r) => setTimeout(r, 10));
    const cs = __ev.dmg.find((x) => x.id === id && x.tags.includes("charge") && !x.tags.includes("wave"));
    return { ok, amount: cs && cs.amount, full: __ev.charge[0] && __ev.charge[0].full, last: P.lastCharge, mom: P.momentum, minTs: Math.min(...ts) };
  });
  check("半势（50）也能放，放出后气势清零", half.ok && half.full === !1 && half.mom === 0, half);
  check("半势（50）伤害约为满势的 52%（≈ 同境界剑气斩一次）", half.amount / ch.charge >= 0.48 && half.amount / ch.charge <= 0.57, { half: half.amount, full: ch.charge, ratio: +(half.amount / ch.charge).toFixed(3) });
  check("半势：范围、剑气距离按比例缩小，没有慢动作", half.last.radius < ch.last.radius && half.last.range < ch.last.range && half.minTs === 1, { half: half.last, full: ch.last, minTs: half.minTs });
  // 半势 vs 满势的截图（同一位置、同一木桩）
  for (const [m, name] of [[60, "charge_half"], [100, "charge_full_cmp"]]) {
    await page.waitForFunction(() => __game.player.state === "move", null, { timeout: 5000 });
    await c.ev(async (m) => {
      __clearDummies();
      __mk(2.0);
      __mk(5.0);
      __ev.charge = [];
      __game.player.momentum = m;
      __game.ctx.input.mouse.rightPressed = !0;
    }, m);
    await page.waitForFunction(() => __ev.charge.length > 0, null, { timeout: 6000 });
    await c.wait(150);
    await c.shot(name);
    await c.wait(1000);
  }
  // (f) 出招中按右键：缓存到可取消时放出
  const buf = await c.ev(async () => {
    const P = __game.player;
    __clearDummies();
    __mk(1.8);
    __ev.attack = [];
    __ev.charge = [];
    P.momentum = 80;
    __hold(!0);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let t0 = performance.now();
    while (!(P.state === "attack" && P.combo === 0) && performance.now() - t0 < 3000) await sleep(5);
    __hold(!1);
    __game.ctx.input.mouse.rightPressed = !0; // 第一段前半段按下
    t0 = performance.now();
    while (!__ev.charge.length && performance.now() - t0 < 3000) await sleep(8);
    return { steps: __ev.attack.map((a) => a.step + (a.charge ? "*" : "")), charges: __ev.charge.length };
  });
  check("普攻前半段按右键：缓存，第一段出伤后立即接蓄势斩", buf.charges === 1 && buf.steps[0] === "1" && buf.steps[1] === "4*", buf);
  await c.wait(800);

  // 破盾：蓄势斩对护盾的倍率
  const sh = await c.ev(async () => {
    __clearDummies();
    const id = __mk(2.0, 0, 5000);
    const e = __dummies.find((x) => x.id === id);
    __game.ctx.shields.give(e, "wood");
    e.shield.hp = e.shield.max = 99999;
    __ev.dmg = [];
    __ev.attack = [];
    __game.player.momentum = 70;
    await __combo(() => __ev.attack.some((a) => a.step === 1));
    await new Promise((r) => setTimeout(r, 600));
    __game.player.momentum = 100;
    await __rclick();
    const d = __ev.dmg.filter((x) => x.id === id);
    const s1 = d.find((x) => x.tags.includes("step1")), cs = d.find((x) => x.tags.includes("charge") && !x.tags.includes("wave"));
    return { s1: s1 && s1.shield, charge: cs && cs.shield };
  });
  check("蓄势斩打护盾：每次伤害约为普攻第一段的 6 倍（2.4 × 2.5 盾倍率）", sh.charge > sh.s1 * 4.5, sh);
  await c.wait(800);

  // ======== 4b) v1.3：伤害对标法术、剑意破盾、控制、墨痕、出局清零 ========
  // 满势一刀（横扫 + 剑气打同一目标，不含墨痕）≈ 同境界剑气斩三道全中的 1.6–2 倍；半势 ≈ 0.9–1 倍
  const vsSpell = await c.ev(async () => {
    const G = __game, P = G.player, S = G.ctx.skills, w = G.world;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    __realm(1, 1);
    __noCrit(!0);
    S.setRealm("zhuji");
    S.setLoadout({ spells: ["sword_qi", "frost", "vine"] });
    P.entity.mp = 999;
    const sum = async (dist, fn, ms) => {
      __clearDummies();
      const id = __mk(dist);
      let n = 0;
      const off = w.events.on("damage", (i) => i.attacker === P.entity && i.target.id === id && !i.tags.includes("dot") && (n += i.amount));
      await fn(__dummies[0]);
      await sleep(ms);
      off();
      return n;
    };
    const qi = await sum(5, async (d) => ((S.cd = {}), (S.aimOverride = d.pos.clone()), S.castSpell(0)), 1500);
    S.aimOverride = null;
    await sleep(300);
    const full = await sum(2, async () => ((P.momentum = 100), await __rclick()), 1500);
    const half = await sum(2, async () => ((P.momentum = 50), await __rclick()), 1500);
    __noCrit(!1);
    return { qi, full, half, fullK: +(full / qi).toFixed(2), halfK: +(half / qi).toFixed(2) };
  });
  check("满势一刀 ≈ 同境界剑气斩三道全中的 1.6–2 倍", vsSpell.fullK >= 1.6 && vsSpell.fullK <= 2.05, vsSpell);
  check("半势一刀 ≈ 剑气斩的 0.9–1 倍", vsSpell.halfK >= 0.88 && vsSpell.halfK <= 1.05, vsSpell);
  // 剑意破盾：不看五行（附灵与否都一样），精英削护盾上限 35%、首领每段 20%、半势 × 气势/100
  const cutT = await c.ev(async () => {
    const G = __game, P = G.player;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const one = async (tag, el, m) => {
      __clearDummies();
      const id = __mk(2.0, 0, 1e6);
      const e = __dummies[0];
      e.tags.add(tag);
      G.ctx.shields.give(e, el);
      e.shield.max = e.shield.hp = 10000;
      let cut = null;
      const off = G.world.events.on("player:swordIntent", (x) => x.target === e && (cut = x.cut));
      P.momentum = m;
      await __rclick();
      await sleep(150);
      off();
      return cut;
    };
    return { eliteMetal: await one("elite", "metal", 100), eliteWood: await one("elite", "wood", 100), boss: await one("boss", "earth", 100), half: await one("elite", "fire", 50) };
  });
  check("剑意破盾：精英削护盾上限 35%（五行无关），首领 20%，半势按比例", cutT.eliteMetal === 3500 && cutT.eliteWood === 3500 && cutT.boss === 2000 && cutT.half === 1750, cutT);
  // 满势斩破盾截图：真实精英（木盾）贴脸，满势右键
  await c.ev(async () => {
    const G = __game, P = G.player, E = G.ctx.enemies;
    __clearDummies();
    for (const e of [...E.list]) (e.entity.alive = !1), e.dispose && e.dispose();
    E.list.length = 0;
    const d = P.aimDir(new G.THREE.Vector3());
    const e = E.spawn("wolf_elite", P.pos.clone().addScaledVector(d, 2.2), { region: "r1" });
    window.__elite = e;
    await new Promise((r) => setTimeout(r, 400));
    e.entity.stats.setBase("hp", 1e5);
    e.entity.hp = 1e5;
    if (!(e.entity.shield && e.entity.shield.hp > 0)) G.ctx.shields.give(e.entity, "metal"); // 金盾：没带克制（火）也能被剑意削穿
    e.entity.shield.max = 2000;
    e.entity.shield.hp = 600; // 只剩三成：剑意一刀（35%）削穿
    P.momentum = 100;
    window.__brk = 0;
    G.world.events.on("shield:break", () => __brk++);
    void __rclick();
  });
  await page.waitForFunction(() => __ev.charge.length && __brk > 0, null, { timeout: 8000 }).catch(() => {});
  await c.wait(40);
  await c.shot("charge_break_shield");
  const brk = await c.ev(() => ({ brk: __brk, shield: __elite.entity.shield && __elite.entity.shield.hp, mom: __game.player.momentum }));
  check("满势斩剑意破盾：精英护盾被削穿，破盾奖励的气势留给下一刀", brk.brk >= 1 && brk.shield <= 0 && brk.mom >= 5, brk); // 青牙 v2 §6.2：破盾 +15 → +5
  await c.wait(900);
  // 控制：满势击倒小怪 1.2 秒；精英打断蓄力 0.8 秒；首领 0.5 秒且 8 秒内只打断一次；半势只让小怪短暂硬直
  const ctl = await c.ev(async () => {
    const G = __game, P = G.player, E = G.ctx.enemies, w = G.world;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clearE = () => {
      for (const e of [...E.list]) (e.entity.alive = !1), e.dispose && e.dispose();
      E.list.length = 0;
      __clearDummies();
    };
    const d = P.aimDir(new G.THREE.Vector3());
    const stun = (e) => ((e.entity || e).statuses.get("stun") || {}).dur || 0;
    const out = {};
    const settle = async () => {
      // 等上一刀的剑气 / 余波飞完，避免打到下一个测试目标
      const t0 = performance.now();
      while ((P.waves.length || P.later.length || P.state !== "move") && performance.now() - t0 < 4000) await sleep(30);
    };
    // 小怪（高血量木桩，没有精英 / 首领标签）
    clearE();
    __mk(2.0, 0, 1e6);
    __mk(2.4, 0.8, 1e6);
    const st0 = [];
    const off = w.events.on("player:stagger", (x) => st0.push(x.kind + ":" + x.dur));
    P.momentum = 100;
    out.r1 = await __rclick();
    out.mobFull = __dummies.map(stun);
    out.tag = ((__dummies[0].statuses.get("stun") || {}).data || {}).tag;
    out.events = st0.slice();
    await settle();
    // 半势小怪
    clearE();
    __mk(2.0, 0, 1e6);
    P.momentum = 50;
    await __rclick();
    out.mobHalf = stun(__dummies[0]);
    await settle();
    // 精英：蓄力中被打断
    clearE();
    const el = E.spawn("wolf_elite", P.pos.clone().addScaledVector(d, 2.2), { region: "r1" });
    await sleep(300);
    el.entity.stats.setBase("hp", 1e5);
    el.entity.hp = 1e5;
    el.entity.tags.add("elite"); // 直接 spawn 的不一定带精英标签（关卡 / 成群刷怪时才加）
    if (el.entity.shield) el.entity.shield.hp = el.entity.shield.max = 1e6; // 不让盾破（破盾自带 2.5 秒眩晕）
    el.setAggro && el.setAggro();
    el.startAttack(el.def.attacks[0], P.pos);
    const before = el.state;
    P.momentum = 100;
    await __rclick();
    out.elite = { before, after: el.state, atk: !!el.atk, stun: stun(el), tags: [...el.entity.tags], ev: st0.slice(-3) };
    // 半势精英不打断
    await settle();
    w.removeStatus(el.entity, "stun");
    await sleep(100);
    el.startAttack(el.def.attacks[0], P.pos);
    P.momentum = 50;
    await __rclick();
    out.eliteHalf = { atk: !!el.atk || el.state !== "chase", stun: stun(el) };
    // 首领：0.5 秒，8 秒内第二刀不再打断
    await settle();
    clearE();
    const id = __mk(2.0, 0, 1e6);
    const b = __dummies[0];
    b.tags.add("boss");
    P.momentum = 100;
    await __rclick();
    const b1 = stun(b);
    await settle();
    w.removeStatus(b, "stun");
    P.momentum = 100;
    await __rclick();
    out.boss = { first: b1, second: stun(b) };
    off();
    clearE();
    return out;
  });
  check("满势：小怪击倒 1.2 秒（眩晕带 data.tag = \"charge\"，供首领控制器区分）", ctl.mobFull.every((x) => x === 1.2) && ctl.tag === "charge", ctl);
  check("半势：小怪硬直 0.5 秒", ctl.mobHalf === 0.5, ctl.mobHalf);
  check("满势：精英打断蓄力、硬直 0.8 秒", ctl.elite.before === "windup" && !ctl.elite.atk && ctl.elite.stun === 0.8, ctl.elite);
  check("满势：首领硬直 0.5 秒，8 秒内只打断一次", ctl.boss.first === 0.5 && ctl.boss.second === 0, ctl.boss);
  // 击倒小怪的截图
  await c.ev(async () => {
    const G = __game, P = G.player, E = G.ctx.enemies;
    for (const e of [...E.list]) (e.entity.alive = !1), e.dispose && e.dispose();
    E.list.length = 0;
    const d = P.aimDir(new G.THREE.Vector3()), sx = -d.z, sz = d.x;
    for (const [f, s2] of [[2.0, 0], [2.4, 1.2], [2.4, -1.2], [3.2, 0.5]]) {
      const e = E.spawn("wolf", P.pos.clone().add(new G.THREE.Vector3(d.x * f + sx * s2, 0, d.z * f + sz * s2)), { region: "r1" });
      e.entity.stats.setBase("hp", 5000);
      e.entity.hp = 5000; // 截图用：挨一刀不死，看得到击倒
    }
    await new Promise((r) => setTimeout(r, 500));
    P.momentum = 100;
    __ev.charge = [];
    void __rclick();
  });
  await page.waitForFunction(() => __ev.charge.length > 0, null, { timeout: 8000 }).catch(() => {});
  await c.wait(180);
  await c.shot("charge_knockdown");
  await c.wait(800);
  // 蓄势斩没有固有DOT：半势/满势都覆盖横扫、剑气、余波，观察满3.6秒玩法时间。
  const noDot = await c.ev(async () => {
    const G = __game, P = G.player, w = G.world;
    __clearAll();
    __noCrit(!0);
    P.entity.stats.add({ stat: "mom_wave", type: "flat", value: 1, source: "testNoChargeDot" });
    const out = [];
    try {
      for (const momentum of [50, 100]) {
        __clearDummies();
        __mk(2.0, 0, 1e6);
        __mk(momentum === 100 ? 7.3 : 3.6, 0, 1e6);
        const ids = new Set(__dummies.map((e) => e.id));
        const row = { momentum, hit: 0, dot: 0, parts: [], elapsed: 0, started: false };
        const off = w.events.on("damage", (i) => {
          if (i.attacker !== P.entity || !ids.has(i.target.id)) return;
          if (i.tags.includes("dot")) row.dot += i.amount;
          else if (i.tags.includes("charge")) {
            row.hit += i.amount;
            const part = i.tags.includes("aftershock") ? "aftershock" : i.tags.includes("wave") ? "wave" : "sweep";
            if (!row.parts.includes(part)) row.parts.push(part);
          }
        });
        try {
          P.momentum = momentum;
          row.started = await __rclick();
          const t0 = w.time, deadline = performance.now() + 25000;
          while (w.time - t0 < 3.6 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 30));
          row.elapsed = w.time - t0;
          row.ink = __dummies.some((e) => e.statuses.has("ink_mark"));
          out.push(row);
        } finally { off(); }
      }
    } finally {
      P.entity.stats.removeSource("testNoChargeDot");
      __noCrit(!1);
      __clearDummies();
    }
    return out;
  });
  for (const row of noDot) check(`${row.momentum}势：横扫/剑气/余波出伤后无固有持续伤害`, row.started && row.hit > 0 && row.parts.length === 3 && row.elapsed >= 3.6 && row.dot === 0 && !row.ink, row);
  // 出局清零（run:end）
  const rs = await c.ev(() => {
    const P = __game.player;
    P.momentum = 80;
    __game.world.events.emit("run:end", { result: "test", run: null });
    return P.momentum;
  });
  check("出局（run:end）时气势清零", rs === 0, rs);
  await c.wait(600);

  // ======== 5) 普攻流心法 ========
  const x1 = await c.ev(async () => {
    const P = __game.player, w = __game.world;
    __realm(1, 4, ["mom_gather", "mom_chain"]);
    __clearAll();
    __noCrit(!0); // 暴击会额外 +4 气势
    const id = __mk(1.8);
    P.momentum = 0;
    __ev.attack = [];
    await __combo(() => __ev.attack.length > 0);
    __noCrit(!1);
    return { mom: +P.momentum.toFixed(2), chain: P.chainStacks, gain: P.entity.stats.get("momGain") };
  });
  check("心法《蓄势》：气势获取 +30%（第一段 8 → 10.4）", Math.abs(x1.mom - 10.4) < 0.01, x1);
  check("心法《连环》：命中叠层", x1.chain === 1, x1);
  await c.wait(700);
  const x2 = await c.ev(async () => {
    const P = __game.player;
    __realm(1, 8, ["mom_return", "mom_wave"]);
    __clearDummies();
    __mk(2.0);
    __mk(7.6); // 剑气尽头（7.5 米）附近：只吃剑气与余波
    P.dashCharges = 0;
    P.dashRegen = 0;
    P.momentum = 100;
    __ev.attack = [];
    __ev.after = [];
    await __rclick();
    const ch = P.dashCharges;
    await new Promise((r) => setTimeout(r, 900));
    return { dashAfterCharge: ch, after: __ev.after.slice() };
  });
  check("心法《回锋》：蓄势斩命中返还 1 次闪身充能", x2.dashAfterCharge === 1, x2);
  check("心法《余波》：剑气尽头炸开余波并命中", x2.after.length === 1 && x2.after[0] >= 1, x2.after);
  const x3 = await c.ev(() => {
    const P = __game.player;
    __realm(1, 8, ["mom_haste"]);
    const a0 = P.entity.stats.get("aspd");
    P.momentum = 100;
    P.momT = 0;
    P.update(0.001);
    const a1 = P.entity.stats.get("aspd");
    P.momentum = 0;
    P.update(0.001);
    return { a0: +a0.toFixed(3), a1: +a1.toFixed(3), a2: +P.entity.stats.get("aspd").toFixed(3) };
  });
  check("心法《满势》：势成时攻速 +15%，放出后恢复", Math.abs(x3.a1 / x3.a0 - 1.15) < 0.01 && x3.a2 === x3.a0, x3);

  // ======== 5b) 攒势加强（v1.2）：精英 / 首领气势加成、护盾不打折、破盾加气势、蓄势斩打破盾易伤加伤（数值读 src/data/player.js） ========
  const v12 = await c.ev(async () => {
    const G = __game, P = G.player, w = G.world;
    const D = await import("/src/data/player.js");
    const K = { eliteMul: D.MOMENTUM.eliteMul, shieldBreak: D.MOMENTUM.shieldBreak, vulnBonus: D.CHARGE.vulnBonus };
    __realm(1, 1);
    __noCrit(!0);
    const one = async (setup) => {
      __clearDummies();
      const id = __mk(1.8);
      const e = __dummies.find((x) => x.id === id);
      setup && setup(e);
      P.momentum = 0;
      P.combo = 0;
      P.faceDir(P.aimDir());
      P.doHit();
      return +P.momentum.toFixed(2);
    };
    const plain = await one();
    const elite = await one((e) => e.tags.add("elite"));
    const boss = await one((e) => e.tags.add("boss"));
    const shielded = await one((e) => (e.tags.add("elite"), G.ctx.shields.give(e, "metal"), (e.shield.hp = e.shield.max = 99999)));
    // 破盾 +20（不吃气势获取加成）
    __clearDummies();
    const id = __mk(1.8);
    const e = __dummies.find((x) => x.id === id);
    G.ctx.shields.give(e, "wood");
    P.momentum = 10;
    G.ctx.shields.breakShield(e);
    const afterBreak = +P.momentum.toFixed(2);
    e.statuses.clear && G.world.removeStatus(e, "stun");
    // 蓄势斩：同一木桩，有 / 无破盾易伤计时（只设 _vulnT，不加易伤属性，单看蓄势斩的 +20%）
    const charge = async (vuln) => {
      __clearDummies();
      const id2 = __mk(2.0);
      const d = __dummies.find((x) => x.id === id2);
      if (vuln) d._vulnT = 6;
      __ev.dmg = [];
      P.momentum = 100;
      await __rclick();
      const h = __ev.dmg.find((x) => x.id === id2 && x.tags.includes("charge") && !x.tags.includes("wave"));
      return h ? { amount: h.amount, tag: h.tags.includes("vulnBonus") } : null;
    };
    await new Promise((r) => setTimeout(r, 300));
    const c0 = await charge(!1);
    await new Promise((r) => setTimeout(r, 900));
    const c1 = await charge(!0);
    __noCrit(!1);
    return { K, plain, elite, boss, shielded, afterBreak, c0, c1 };
  });
  const EM = 8 * v12.K.eliteMul;
  check(`攒势：普攻命中精英 / 首领气势 ×${v12.K.eliteMul}（第一段 8 → ${EM}）`, v12.K.eliteMul > 0 && v12.plain === 8 && v12.elite === EM && v12.boss === EM, v12);
  check("攒势：打在护盾上照常获取，不打折", v12.shielded === EM, v12);
  check(`攒势：破盾瞬间 +${v12.K.shieldBreak} 气势`, v12.K.shieldBreak > 0 && v12.afterBreak === 10 + v12.K.shieldBreak, v12.afterBreak);
  check(`蓄势斩命中破盾易伤中的敌人 +${Math.round(v12.K.vulnBonus * 100)}%（带 vulnBonus 标签）`, v12.c0 && v12.c1 && v12.c1.tag && !v12.c0.tag && Math.abs(v12.c1.amount / v12.c0.amount - (1 + v12.K.vulnBonus)) < 0.06, { c0: v12.c0, c1: v12.c1 });
  // 伤害加成真的生效（v1.2 复核发现原来的 Stats "dmg more" 写法乘 0 等于没加）：完美闪身下一击 ×1.5、《连环》每层 +4%
  const mulChk = await c.ev(async () => {
    const G = __game, P = G.player;
    __realm(1, 1);
    __noCrit(!0);
    const hit = (setup) => {
      __clearDummies();
      const id = __mk(1.8);
      __ev.dmg = [];
      setup && setup();
      P.combo = 0;
      P.faceDir(P.aimDir());
      P.doHit();
      const h = __ev.dmg.find((x) => x.id === id);
      return h && h.amount;
    };
    const plain = hit();
    const perfect = hit(() => (P.perfectUntil = performance.now() / 1000 + 1.5));
    __realm(1, 4, ["mom_chain"]);
    const plain4 = hit(() => (P.chainStacks = 0));
    const chain5 = hit(() => ((P.chainStacks = 5), (P.chainT = 3)));
    __realm(1, 1);
    __noCrit(!1);
    return { plain, perfect, plain4, chain5 };
  });
  check("伤害加成生效：完美闪身后下一击 ×1.5", Math.abs(mulChk.perfect / mulChk.plain - 1.5) < 0.06, mulChk);
  check("伤害加成生效：《连环》5 层普攻 ×1.2", Math.abs(mulChk.chain5 / mulChk.plain4 - 1.2) < 0.06, mulChk);
  await c.wait(800);

  // ======== 6) 装备词条 / 特殊词条 / 掉落 ========
  const loot = await c.ev(async () => {
    const L = await import("/src/game/loot.js");
    const D = await import("/src/data/loot.js");
    const I = await import("/src/core/items.js");
    const st = L.gearStats({ id: "sword_qingfeng", level: 3, rarity: 3, affixes: [{ stat: "momGain", type: "flat", value: 0.15 }, { stat: "special", type: "flag", value: "蓄势斩回锋", xinfa: "mom_return" }] });
    const special = st.some((m) => m.stat === "gx_mom_return" && m.value === 1);
    const gain = st.some((m) => m.stat === "momGain");
    // 随机词条池里能出新词条
    const seen = new Set();
    for (let i = 0; i < 400; i++) for (const a of L.rollAffixes("sword", 3, 3)) seen.add(a.stat === "special" ? "special:" + a.xinfa : a.stat);
    const scrolls = ["xinfa_mom_gather", "xinfa_mom_chain", "xinfa_mom_haste", "xinfa_mom_wave", "xinfa_mom_return", "xinfa_dash_flow"];
    const defs = scrolls.every((id) => I.ITEMS[id] && I.ITEMS[id].kind === "xinfa");
    const src = JSON.stringify(D.SOURCES);
    const dropped = scrolls.every((id) => src.includes(id));
    return { special, gain, aff: ["aspd", "momGain", "chargeDmg"].filter((s) => seen.has(s)), specials: [...seen].filter((s) => s.startsWith("special:mom") || s === "special:dash_flow"), defs, dropped };
  });
  check("特殊词条（如'蓄势斩回锋'）产出心法标记 gx_<id>", loot.special && loot.gain, loot);
  check("法剑随机词条可出 攻速 / 气势获取 / 蓄势斩伤害", loot.aff.length === 3, loot.aff);
  check("仙品特殊词条可出普攻流效果", loot.specials.length >= 3, loot.specials);
  check("六本心法卷轴已登记并进入掉落表", loot.defs && loot.dropped, loot);
  const aff = await c.ev(() => {
    const P = __game.player;
    __realm(1, 1);
    P.entity.stats.add({ stat: "momGain", type: "flat", value: 0.15, source: "testAffix" });
    P.momentum = 0;
    P.addMomentum(10);
    P.entity.stats.removeSource("testAffix");
    return +P.momentum.toFixed(2);
  });
  check("词条'气势获取 +15%'生效", Math.abs(aff - 11.5) < 0.01, aff);

  // ======== 7) 装备特殊词条 = 装备了对应心法（原有四个 + 新增），与心法栏同名不叠加 ========
  const gx = await c.ev(async () => {
    const G = __game, P = G.player, S = G.ctx.skills, h = P.entity, p = G.profile, w = G.world, T = G.THREE;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const savedEquip = { ...p.equip };
    const sp = (id) => ({ stat: "special", type: "flag", value: id, xinfa: id });
    const equip = (slot, specials) => (p.equip[slot] = specials ? { id: slot === "sword" ? "sword_qingfeng" : slot === "robe" ? "robe_bu" : "jade_qing", uid: "t" + slot, level: 1, rarity: 3, affixes: specials.map(sp) } : null);
    const out = {};
    // 练气三层（心法栏强制 0）：法剑带 金刚体 + 暴击引雷，法衣带 闪身留剑影
    //   2026-11-17 起未解锁栏位的装备不生效（run.js gearMods 按 slotOpen），法衣栏练三才开，所以这里用练三
    __realm(1, 3);
    p.unlocks.xinfaSlots = 0;
    p.unlocks.robeSlot = !0; // __realm 只改境界，不发栏位解锁
    equip("sword", ["vajra", "crit_thunder"]);
    equip("robe", ["dash_shadow"]);
    G.ctx.applyProfileStats(p);
    out.active = S.activeXinfa().sort();
    const vm = h.stats.mods.filter((m) => m.source === "xinfa:vajra");
    out.vajra = { hp: (vm.find((m) => m.stat === "hp") || {}).value, def: (vm.find((m) => m.stat === "def") || {}).value, n: vm.length };
    out.triggers = Object.keys(S.xinfaUnsub).sort();
    // 雷引：强制暴击 → 追加带 thunder 标签的伤害
    __clearDummies();
    const id = __mk(2.5);
    const dm = __dummies.find((e) => e.id === id);
    const th0 = __ev.dmg.filter((x) => x.tags.includes("thunder")).length;
    w.dealDamage(h, dm, { base: 10, crit: !0, tags: ["test"] });
    await sleep(100);
    out.thunder = __ev.dmg.filter((x) => x.tags.includes("thunder")).length - th0;
    // 剑影：闪身留下剑影，0.6 秒后爆开（打在原地的木桩上）
    __clearDummies();
    const id2 = __mk(0.6);
    P.dashCharges = P.dashMax;
    P.startDash(new T.Vector3(1, 0, 0));
    await sleep(1600);
    out.shadow = __ev.dmg.filter((x) => x.id === id2 && x.tags.includes("xinfa")).length;
    // 锋锐：练气四层自动领悟、放在心法栏里；法剑再带"锋锐" → 只算一次
    __noCrit(!1);
    equip("sword", null);
    equip("robe", null);
    out.sharpNone = __realm(1, 4, []) && +h.stats.get("crit").toFixed(3);
    __realm(1, 4, ["sharp"]);
    const c1 = h.stats.get("crit"), cd1 = h.stats.get("critDmg");
    equip("sword", ["sharp"]);
    equip("robe", ["sharp"]);
    G.ctx.applyProfileStats(p);
    out.sharp = { slot: +c1.toFixed(3), both: +h.stats.get("crit").toFixed(3), critDmgSlot: +cd1.toFixed(3), critDmgBoth: +h.stats.get("critDmg").toFixed(3), mods: h.stats.mods.filter((m) => m.source === "xinfa:sharp").length };
    // 心法栏空出来，只靠装备也有锋锐
    __realm(1, 4, []);
    out.sharpGearOnly = +h.stats.get("crit").toFixed(3);
    // 流云：心法栏 + 词条同名不叠加（练气一层 1 → 2，不是 3）
    __realm(1, 1, ["dash_flow"]);
    p.unlocks.xinfaSlots = 2;
    equip("sword", ["dash_flow"]);
    equip("robe", null);
    G.ctx.applyProfileStats(p);
    P.update(0);
    out.flow = P.dashMax;
    // 运行中直接卸下（不经过 applyProfileStats）：SkillSystem 0.2 秒内察觉并撤掉
    equip("sword", ["vajra"]);
    __realm(1, 1, []);
    const hpOn = h.stats.get("hp");
    h.stats.removeSource("equip");
    await sleep(500);
    out.unequip = { hpOn: Math.round(hpOn), hpOff: Math.round(h.stats.get("hp")), active: S.activeXinfa() };
    Object.assign(p.equip, savedEquip);
    p.equip.sword = savedEquip.sword || null;
    p.equip.robe = savedEquip.robe || null;
    __clearDummies();
    return out;
  });
  check("装备特殊词条并入心法：金刚体 / 雷引 / 剑影", ["crit_thunder", "dash_shadow", "vajra"].every((x) => gx.active.includes(x)), gx.active);
  check("词条《金刚体》：气血 +25%、防御 +20（按心法 mods 加一次）", gx.vajra.hp === 0.25 && gx.vajra.def === 20 && gx.vajra.n === 2, gx.vajra);
  check("词条《雷引》《剑影》装上触发器", gx.triggers.includes("crit_thunder") && gx.triggers.includes("dash_shadow"), gx.triggers);
  check("词条《雷引》：暴击引雷追加伤害", gx.thunder >= 1, gx.thunder);
  check("词条《剑影》：闪身留剑影爆开伤敌", gx.shadow >= 1, gx.shadow);
  check("锋锐：心法栏 + 两件装备同名只算一次（暴击率 +15% 而非 +45%）", Math.abs(gx.sharp.slot - gx.sharpNone - 0.15) < 1e-6 && gx.sharp.both === gx.sharp.slot && gx.sharp.critDmgBoth === gx.sharp.critDmgSlot && gx.sharp.mods === 2, gx.sharp);
  check("锋锐：心法栏空出后仅靠装备词条也生效", gx.sharpGearOnly === gx.sharp.slot, gx);
  check("流云：心法栏 + 词条同名不叠加（充能 2 而非 3）", gx.flow === 2, gx.flow);
  check("卸下装备后特殊词条效果自动撤掉", gx.unequip.hpOff < gx.unequip.hpOn && !gx.unequip.active.includes("vajra"), gx.unequip);

  // ======== 8) 附灵的视觉表现（刀光 / 剑气 / 命中 / 剑身 / 伤害数字 / HUD 五行印 / 坛附灵淡出） ========
  const LOOK = await c.ev(async () => (await import("/src/fx/player_fx.js")).ELEM_LOOK);
  const setImbue = (el) =>
    c.ev((el) => {
      const h = __game.player.entity;
      h.stats.removeSource("testImbue");
      if (el) h.stats.add({ stat: "imbue_" + el, type: "flat", value: 1, source: "testImbue" });
      __game.player.update(0.016);
    }, el);
  // 主角附近的裁切区域（截图用）
  const around = async (w = 520, hgt = 360) => {
    const p = await c.ev(() => {
      const v = __game.player.pos.clone();
      v.y += 1;
      v.project(__game.camera);
      return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
    });
    return { x: Math.max(0, Math.round(p[0] - w / 2)), y: Math.max(0, Math.round(p[1] - hgt / 2)), width: w, height: hgt };
  };
  // 打一套，在第三段（或蓄势斩）出伤后 40ms 截图
  const slashShot = async (name, charge) => {
    await c.ev((charge) => {
      __clearDummies();
      __mk(2.0);
      __ev.attack = [];
      __slashes = [];
      __game.player.momentum = charge ? 100 : 0;
      if (charge) void __rclick();
      else void __combo(() => __ev.attack.some((a) => a.step === 3));
    }, charge);
    await page.waitForFunction((charge) => __ev.attack.some((a) => (charge ? a.charge : a.step === 3)), charge, { timeout: 9000 });
    await c.wait(charge ? 60 : 90);
    await c.shot(name, { clip: await around() });
    await c.wait(900);
    return c.ev((charge) => ({ last: __slashes.find((x) => x.width === (charge ? 0.75 : 0.5)), pool: __game.player.fx.slashes.length, mats: __game.player.fx.stats.slashMats, waves: __game.player.fx.waves.length }), charge);
  };
  // 静止时的剑身（镜头拉近）
  const swordShot = async (name) => {
    await c.ev(() => {
      const P = __game.player;
      P.facing.set(0.35, 0, 1).normalize(); // 侧身朝向镜头，剑在身侧可见
      P.yaw = Math.atan2(P.facing.x, P.facing.z);
      __game.rig.dist = 11;
      __game.rig.update(1, !0);
    });
    await c.wait(500);
    await c.shot(name, { clip: await around(300, 300) });
    await c.ev(() => ((__game.rig.dist = 30), __game.rig.update(1, !0)));
  };
  await c.ev(() => {
    __noCrit(!1);
    __realm(1, 1);
    const fx = __game.player.fx, orig = fx.slash.bind(fx);
    window.__slashes = [];
    fx.slash = (pos, dir, r, a, o = {}) => (__slashes.push({ color: o.color ?? 0x15181b, rim: o.rim ?? null, width: o.width }), orig(pos, dir, r, a, o));
  });
  await setImbue(null);
  const plain = await slashShot("imbue_none_slash", !1);
  check("未附灵：第三段刀光为朱色笔芯、无五行外缘", plain.last.color === 0xd2321e && plain.last.rim === null, plain.last);
  await slashShot("imbue_none_charge", !0);
  await swordShot("imbue_none_sword");
  const hudNone = await c.ev(() => document.querySelector("#hud .imb").classList.contains("on"));
  check("未附灵：HUD 不显示五行印", !hudNone);
  for (const el of ["wood", "fire"]) {
    await setImbue(el);
    await c.wait(300);
    const st = await c.ev(() => {
      const P = __game.player, mats = P.imbueMats || [];
      const imb = document.querySelector("#hud .imb");
      return { imbue: P.imbue, sword: mats.map((o) => o.m.emissive.getHex()), tassel: mats.map((o) => o.m.color.getHex()), hud: imb.classList.contains("on"), hudEl: imb.dataset.el, seal: imb.querySelector(".se").textContent, cap: imb.querySelector(".cap").textContent, tip: imb.querySelector(".tip").textContent };
    });
    await c.wait(400);
    check(`附灵${LOOK[el].name}：player.imbue 与 HUD 五行印（${LOOK[el].name} · 剑附灵）`, st.imbue && st.imbue.el === el && st.imbue.src === "sword" && st.hud && st.hudEl === el && st.seal === LOOK[el].name && st.cap === "剑附灵", st);
    if (el === "wood") check("五行印悬停说明：木克土，对土盾 ×0.86（无附灵 ×0.25）", /木克土/.test(st.tip) && /×0\.86/.test(st.tip) && /×0\.25/.test(st.tip), st.tip);
    const sw = await c.ev(() => (__game.player.imbueMats || []).map((o) => [o.m.emissive.getHex(), o.m.color.getHex()]));
    check(`附灵${LOOK[el].name}：剑身流光 / 剑穗变色（静止时可见）`, sw.length >= 1 && sw.some(([e]) => e !== 0), sw);
    await swordShot(`imbue_${el}_sword`);
    const s3 = await slashShot(`imbue_${el}_slash`, !1);
    check(`附灵${LOOK[el].name}：第三段刀光笔芯五行深调 + 五行外缘（池化，8 个网格不增加）`, s3.last.color === LOOK[el].deep && s3.last.rim === LOOK[el].rim && s3.pool === 8 && s3.mats === 8, s3);
    const sc = await slashShot(`imbue_${el}_charge`, !0);
    check(`附灵${LOOK[el].name}：蓄势斩刀光笔芯五行深调 + 五行外缘（剑气池 2 个）`, sc.last.color === LOOK[el].deep && sc.last.rim === LOOK[el].rim && sc.waves === 2, sc);
  }
  // 命中：五行色墨点、伤害数字前缀五行字 + 描边、偶尔飘一个淡五行字；打护盾的提示保持原样
  const hit = await c.ev(async () => {
    const G = __game, P = G.player, w = G.world, v = G.ctx.vfx, F = G.ctx.feedback;
    __clearDummies();
    const id = __mk(2.0);
    const dm = __dummies.find((e) => e.id === id);
    v.dotData.length = 0;
    const rnd = Math.random;
    Math.random = () => 0.1; // 让"偶尔飘字"这次必出
    F._elemT = 0;
    P.combo = 0;
    P.faceDir(P.aimDir());
    P.doHit();
    Math.random = rnd;
    const col = new G.THREE.Color(0xd2321e);
    const dots = v.dotData.filter((d) => Math.abs(d.r - col.r) < 0.01 && Math.abs(d.g - col.g) < 0.01 && Math.abs(d.b - col.b) < 0.01).length;
    const nums = [...document.querySelectorAll("#dmg b")];
    const imbEl = nums.find((b) => b.classList.contains("imb"));
    const imb = imbEl && { text: imbEl.textContent, prefix: imbEl.querySelector("i") && imbEl.querySelector("i").textContent, ec: imbEl.style.getPropertyValue("--ec") };
    const elemEl = nums.find((b) => b.classList.contains("elem"));
    const elem = elemEl && elemEl.textContent;
    // 护盾提示
    G.ctx.shields.give(dm, "metal");
    dm.shield.hp = dm.shield.max = 99999;
    await new Promise((r) => setTimeout(r, 900));
    P.combo = 0;
    P.faceDir(P.aimDir());
    P.doHit();
    const sh = [...document.querySelectorAll("#dmg b")].map((b) => b.textContent).filter((t) => /^(克|盾) /.test(t));
    return { dots, imbText: imb && imb.text, prefix: imb && imb.prefix, ec: imb && imb.ec, elem, shield: sh };
  });
  check("附灵命中：五行色墨点飞溅", hit.dots >= 5, hit.dots);
  check("附灵命中：伤害数字前缀小五行字 + 五行色描边", hit.prefix === "火" && /^火\d+$/.test(hit.imbText) && !!hit.ec, hit);
  check("附灵命中：偶尔飘出一个淡五行字", hit.elem === "火", hit.elem);
  check("打护盾的克制 / 不克制提示保持原样（火克金 → '克 N'）", hit.shield.length >= 1 && hit.shield.every((t) => /^克 \d+$/.test(t)), hit.shield);
  // 五行坛：临时附灵优先于法剑；最后 3 秒闪烁；结束淡出提示
  const sr = await c.ev(async () => {
    const G = __game, P = G.player, h = P.entity, w = G.world;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ends = [];
    const off = w.events.on("player:imbueEnd", (e) => ends.push(e));
    h.stats.removeSource("testImbue");
    h.stats.add({ stat: "imbue_wood", type: "flat", value: 1, source: "testImbue" });
    h.stats.add({ stat: "imbue_fire", type: "flat", value: 1, source: "shrine" });
    w.events.emit("boss:shrine", { element: "fire", dur: 4 });
    await sleep(300);
    const imb = document.querySelector("#hud .imb");
    const a = { imbue: { ...P.imbue }, cls: imb.className, cap: imb.querySelector(".cap").textContent };
    const t0 = performance.now();
    while (!(P.imbue && P.imbue.left < 2.5) && performance.now() - t0 < 8000) await sleep(50);
    const b = { cls: imb.className, k: +imb.querySelector(".se").style.getPropertyValue("--k") };
    h.stats.removeSource("shrine"); // 由 shrines.js 在 15 秒到时移除；这里直接模拟
    await sleep(300);
    const c2 = { imbue: P.imbue && { ...P.imbue }, gone: document.querySelector("#hud .imb-gone").classList.contains("on"), ends: ends.length, el: imb.dataset.el };
    off();
    h.stats.removeSource("testImbue");
    return { a, b, c: c2 };
  });
  check("坛附灵优先于剑附灵，HUD 显示'坛 N 息'与剩余圆相", sr.a.imbue.el === "fire" && sr.a.imbue.src === "shrine" && /shrine/.test(sr.a.cls) && /^坛 \d 息$/.test(sr.a.cap), sr.a);
  check("坛附灵最后 3 秒：五行印闪烁、剑身流光变淡", /blink/.test(sr.b.cls) && sr.b.k < 0.75, sr.b);
  check("坛附灵结束：发 player:imbueEnd、飘'坛力散去'、回到剑附灵", sr.c.ends === 1 && sr.c.gone && sr.c.imbue && sr.c.imbue.el === "wood" && sr.c.imbue.src === "sword", sr.c);
  await c.wait(300);
  await setImbue(null);

  // ======== 9) 御剑（筑基）：深水边朝对岸按闪身 → 踏剑掠过；筑基前提示"水深难渡" ========
  const site = await c.ev(async () => {
    const T = await import("/src/world/terrain.js");
    const G = __game, P = G.player, L = T.activeLevel();
    if (!L || !L.isDeepWater) return null;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
    const ok = (x, z) => !T.isDeepWater(x, z) && T.height(x, z) > -0.8 && P.flyStand(x, z);
    const c0 = P.pos.clone();
    for (let r = 4; r < 160; r += 2)
      for (let a = 0; a < 64; a++) {
        const x = c0.x + Math.cos((a / 64) * 6.283) * r, z = c0.z + Math.sin((a / 64) * 6.283) * r;
        if (!T.isDeepWater(x, z)) continue;
        for (const [dx, dz] of dirs) {
          const ax = x - dx * 1.6, az = z - dz * 1.6;
          if (!ok(ax, az) || !ok(ax - dx * 0.8, az - dz * 0.8)) continue;
          // 对岸 12 米内要有落点
          let land = 0;
          for (let d = 2.5; d <= 11; d += 0.35) if (ok(ax + dx * d, az + dz * d) && ok(ax + dx * (d + 0.7), az + dz * (d + 0.7)) && T.height(ax + dx * d, az + dz * d) - T.height(ax, az) < 4) { land = d; break; }
          if (land) return { a: [ax, az], dir: [dx, dz], land };
        }
      }
    return null;
  });
  check("找到一处深水岸边（r1 关卡有深水河）", !!site, site);
  if (site) {
    // 筑基前：按闪身不能过河，提示"水深难渡，需御剑（筑基）"
    const pre = await c.ev(async (site) => {
      const G = __game, P = G.player, T = await import("/src/world/terrain.js");
      __clearAll();
      __realm(1, 9);
      G.profile.unlocks.swordFly = !1;
      P.pos.set(site.a[0], T.height(site.a[0], site.a[1]), site.a[1]);
      P.setState("move");
      P.dashCharges = P.dashMax;
      let denied = 0, flew = 0;
      const o1 = G.world.events.on("player:swordFlyDenied", () => denied++), o2 = G.world.events.on("player:swordFly", () => flew++);
      P._flyHintT = 0;
      const dir = new G.THREE.Vector3(site.dir[0], 0, site.dir[1]);
      const okFly = P.trySwordFly(dir);
      P.startDash(dir.clone());
      await new Promise((r) => setTimeout(r, 900));
      o1(), o2();
      return { okFly, denied, flew, deep: T.isDeepWater(P.pos.x, P.pos.z), toast: [...document.querySelectorAll(".mk-toasts *")].map((e) => e.textContent).join("|").slice(0, 120) };
    }, site);
    check("筑基前：深水边闪身过不去，提示'水深难渡，需御剑（筑基）'", !pre.okFly && pre.denied >= 1 && pre.flew === 0 && !pre.deep && /水深难渡/.test(pre.toast), pre);
    // 筑基：朝对岸按 Space → 御剑掠过
    await c.ev(async (site) => {
      const G = __game, P = G.player, T = await import("/src/world/terrain.js");
      __realm(2, 1);
      G.profile.unlocks.swordFly = !0;
      P.pos.set(site.a[0], T.height(site.a[0], site.a[1]), site.a[1]);
      P.setState("move");
      P.dashCharges = P.dashMax;
      P.facing.set(site.dir[0], 0, site.dir[1]);
      P.yaw = Math.atan2(site.dir[0], site.dir[1]);
      G.rig.update(1, !0);
      window.__fly = [];
      G.world.events.on("player:swordFly", (e) => __fly.push({ from: e.from.toArray(), to: e.to.toArray(), water: e.water }));
      // 方向键朝对岸 + Space（真实按键路径）
      P.forceMove = [0, 0];
    }, site);
    const key = await c.ev((site) => {
      // 把世界方向换算成相对镜头的 WASD：这里直接用 forceMove（输入方向）
      const P = __game.player, c = Math.cos(P.camYaw), s2 = Math.sin(P.camYaw), dx = site.dir[0], dz = site.dir[1];
      // inputDir: out = ((ix*c + iz*s), (-ix*s + iz*c)) → 反解 ix, iz
      const ix = dx * c - dz * s2, iz = dx * s2 + dz * c;
      P.forceMove = [ix, iz];
      return [ix, iz];
    }, site);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => __fly.length > 0, null, { timeout: 4000 }).catch(() => {});
    await c.wait(120);
    await c.shot("sword_fly");
    await page.waitForFunction(() => __game.player.state === "move", null, { timeout: 6000 }).catch(() => {});
    const fly = await c.ev(async () => {
      const P = __game.player, T = await import("/src/world/terrain.js");
      P.forceMove = null;
      return { n: __fly.length, f: __fly[0], pos: P.pos.toArray().map((v) => +v.toFixed(2)), deep: T.isDeepWater(P.pos.x, P.pos.z), stand: P.flyStand(P.pos.x, P.pos.z) };
    });
    const flown = fly.f ? Math.hypot(fly.f.to[0] - fly.f.from[0], fly.f.to[2] - fly.f.from[2]) : 0;
    check("筑基：深水边朝对岸按闪身 → 御剑掠过，落在可站立的对岸（≤ 12 米）", fly.n === 1 && fly.f.water && flown >= 2.5 && flown <= 12.5 && !fly.deep && fly.stand, { ...fly, flown: +flown.toFixed(2), key });
  }

  await c.ev(() => (__noCrit(!1), __clearDummies(), __realm(1, 1)));
  const errs = await c.ev(() => window.__errors.length);
  check("no runtime errors", errs === 0, await c.ev(() => window.__errors.slice(0, 3)));
  c.log(`SUMMARY ${R.filter(Boolean).length}/${R.length}`);
}
