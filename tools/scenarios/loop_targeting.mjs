// 施法瞄准与墨笔光标（模块 F）：预览 → 确认 / 取消、射程截断、快速施法、光标状态。
// 用法：node tools/run.mjs loop_targeting
let R = [], OUT = [];
const ok = (cond, msg, extra) => {
  R.push(!!cond);
  OUT.push((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  return cond;
};

// 开发时其他模块改文件会让 Vite 整页刷新：检测到刷新就重跑（最多 3 次）
export default async function (page, c) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    R = [];
    OUT = [];
    let err = null;
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
      await c.ev(() => (window.__tgMark = !0));
      await body(page, c);
    } catch (e) {
      err = e;
    }
    const same = await c.ev(() => !!window.__tgMark).catch(() => !1);
    if (same || attempt === 3) {
      console.log(OUT.join("\n"));
      if (err) throw err;
      console.log(`\n${R.filter(Boolean).length}/${R.length} passed` + (attempt > 1 ? ` (attempt ${attempt})` : ""));
      if (R.some((x) => !x)) process.exitCode = 1;
      return;
    }
    console.log(`[page reloaded during test (HMR), retry ${attempt + 1}]`);
    await c.wait(3000);
  }
}

async function body(page, c) {
  await c.wait(1500);
  const boot = await c.ev(() => ({ skills: !!window.__skills, tg: !!window.__targeting, cur: !!document.getElementById("ink-cursor") }));
  ok(boot.skills && boot.tg && boot.cur, "boot: skill system + targeting + ink cursor", boot);

  // 世界坐标 → 屏幕坐标
  await c.ev(() => {
    const S = window.__skills, T = S.ctx.THREE;
    window.__scr = (x, y, z) => {
      const v = new T.Vector3(x, y, z).project(S.ctx.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    };
    window.__hero = () => S.hero.pos;
    localStorage.removeItem("moxian.settings");
    S.debugAction("power");
    S.debugAction("power");
  });
  // 鼠标移到主角相对 (dx, dz) 处的地面
  const aimAt = async (dx, dz) => {
    const p = await c.ev(([dx, dz]) => {
      const h = window.__hero();
      return window.__scr(h.x + dx, h.y, h.z + dz);
    }, [dx, dz]);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await c.wait(80);
    return p;
  };
  // 屏幕内、距主角超过 minD 米的地面点（沿水平方向找）
  const aimFar = async (minD = 17) => {
    const r = await c.ev((minD) => {
      const h = window.__hero();
      for (const [ux, uz] of [[-1, 0], [1, 0], [-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]])
        for (let d = 30; d >= minD; d -= 1) {
          const p = window.__scr(h.x + ux * d, h.y, h.z + uz * d);
          if (p.x > 20 && p.x < innerWidth - 20 && p.y > 20 && p.y < innerHeight - 140) return { ...p, d };
        }
      return null;
    }, minD);
    await page.mouse.move(r.x, r.y, { steps: 2 });
    await c.wait(80);
    return r;
  };
  const reset = (spells, extra = {}) =>
    c.ev(([spells, extra]) => {
      const S = window.__skills, h = S.hero;
      window.__targeting.cancel(!0);
      if (spells) S.setLoadout({ spells, ...extra });
      S.cd = {};
      h.mp = h.stats.get("mp");
    }, [spells, extra]);
  const state = () =>
    c.ev(() => {
      const S = window.__skills, T = window.__targeting, h = S.hero;
      return {
        aiming: T.aiming, key: T.active && T.active.key, shape: T.active && T.active.shape, mp: Math.round(h.mp), casts: { ...S.stats.casts },
        point: T.point && [+T.point.x.toFixed(2), +T.point.z.toFixed(2)], dist: +Math.hypot(T.point.x - h.pos.x, T.point.z - h.pos.z).toFixed(2),
        cursor: window.__cursor && window.__cursor.state, left: S.ctx.input.mouse.left, valid: T.valid, reason: T.reason,
      };
    });
  const castsOf = (s, id) => s.casts[id] || 0;

  // 靶子：主角前方（画面上方）
  await c.ev(() => {
    const S = window.__skills, h = S.hero;
    window.__D = [S.spawnDummy({ x: h.pos.x + 1.2, z: h.pos.z - 7 }, { hp: 1e7 }), S.spawnDummy({ x: h.pos.x - 2.5, z: h.pos.z - 9 }, { hp: 1e7 }), S.spawnDummy({ x: h.pos.x + 3.5, z: h.pos.z - 10.5 }, { hp: 1e7 })];
  });
  await reset(["vine", "sword_qi", "fire_talisman"]);
  await aimAt(4, 4); // 空地
  await c.wait(200);

  // ---- 光标 ----
  const cur = await c.ev(() => ({ canvas: getComputedStyle(document.getElementById("view")).cursor, body: getComputedStyle(document.body).cursor, el: !!document.getElementById("ink-cursor"), st: window.__cursor.state }));
  ok(cur.el && cur.canvas === "none" && cur.body === "none", "system cursor hidden, ink cursor mounted", cur);
  ok(cur.st === "default", "cursor default over empty ground", cur.st);
  await c.shot("cursor_default", { clip: await clipAround(c, page) });
  // 悬停敌人
  const dp = await c.ev(() => {
    const d = window.__D[0];
    return window.__scr(d.pos.x, d.pos.y + (d.height || 1.6) * 0.5, d.pos.z);
  });
  await page.mouse.move(dp.x, dp.y, { steps: 3 });
  await c.wait(150);
  ok((await state()).cursor === "enemy", "cursor turns to enemy reticle over an enemy", (await state()).cursor);
  await c.shot("cursor_enemy", { clip: await clipAround(c, page) });
  // 界面
  const ui = await c.ev(() => {
    const el = document.createElement("button");
    el.id = "__tbtn";
    el.textContent = "测试";
    el.style.cssText = "position:fixed;left:40px;top:40px;width:90px;height:36px;z-index:50";
    document.body.appendChild(el);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.className };
  });
  if (ui) {
    await page.mouse.move(ui.x, ui.y, { steps: 2 });
    await c.wait(120);
    const st = (await state()).cursor;
    ok(st === "ui", "cursor over a button shows ui state", { st });
    await c.shot("cursor_ui", { clip: await clipAround(c, page) });
    await c.ev(() => document.getElementById("__tbtn").remove());
  }
  // 强制状态接口
  await aimAt(4, 4);
  const forced = await c.ev(() => {
    window.__cursor.setState("interact");
    return window.__cursor.state;
  });
  await c.shot("cursor_interact", { clip: await clipAround(c, page) });
  await c.ev(() => window.__cursor.setState(null));
  ok(forced === "interact", "cursor.setState(name) forces a state", forced);

  // ---- 1. 轨迹预览（剑气斩 三道扇形） ----
  await reset();
  await page.mouse.move(dp.x, dp.y, { steps: 2 });
  await c.wait(80);
  const s0 = await state();
  await page.keyboard.press("KeyE");
  await c.wait(200);
  let s = await state();
  ok(s.aiming && s.key === "E" && s.shape === "line", "E (sword_qi) enters aiming with trajectory preview", s);
  ok(s.mp === s0.mp && castsOf(s, "sword_qi") === castsOf(s0, "sword_qi"), "preview spends no mp and casts nothing", { mp0: s0.mp, mp: s.mp });
  ok(s.cursor === "aim", "cursor shows aiming crosshair", s.cursor);
  await c.shot("preview_fan");
  // 左键确认：按住时不应触发普攻
  await page.mouse.down();
  await c.wait(60);
  const held = await state();
  await page.mouse.up();
  await c.wait(400);
  s = await state();
  ok(!s.aiming && castsOf(s, "sword_qi") === castsOf(s0, "sword_qi") + 1 && s.mp < s0.mp, "left click confirms and casts", s);
  ok(held.left === !1, "confirm click is swallowed (no basic attack)", held.left);

  // ---- 2. 区域预览：射程截断 ----
  await reset();
  const far = await aimFar(); // 远超 14 米
  await page.keyboard.press("KeyQ");
  await c.wait(200);
  s = await state();
  ok(s.aiming && s.shape === "area" && Math.abs(s.dist - 14) < 0.3, "zone preview clamps to max range (14)", { ...s, mouseDist: far.d });
  await c.shot("preview_zone_clamped");
  const zonesBefore = await c.ev(() => window.__skills.zones.length);
  await page.mouse.click(far.x, far.y);
  await c.wait(500);
  const z = await c.ev(() => {
    const S = window.__skills, zz = S.zones[S.zones.length - 1], h = S.hero;
    return { n: S.zones.length, d: zz ? +Math.hypot(zz.pos.x - h.pos.x, zz.pos.z - h.pos.z).toFixed(2) : -1 };
  });
  ok(z.n === zonesBefore + 1 && Math.abs(z.d - 14) < 0.6, "confirm casts zone at the clamped point", z);

  // ---- 3. 右键取消（不消耗） ----
  await reset();
  await aimAt(0, -8);
  const s3 = await state();
  await page.keyboard.press("KeyR");
  await c.wait(150);
  s = await state();
  ok(s.aiming && s.key === "R", "R (fire talisman) previews", s);
  await c.shot("preview_explode");
  await page.mouse.click(s.point ? (await aimAt(0, -8)).x : 0, (await aimAt(0, -8)).y, { button: "right" });
  await c.wait(200);
  s = await state();
  const art = await c.ev(() => window.__skills.cd.artifact || 0);
  ok(!s.aiming && s.mp === s3.mp && castsOf(s, "fire_talisman") === castsOf(s3, "fire_talisman") && art === 0, "right click cancels: no cost, no artifact", { s, art });
  // Esc 取消
  await page.keyboard.press("KeyR");
  await c.wait(100);
  await page.keyboard.press("Escape");
  await c.wait(100);
  ok(!(await state()).aiming, "Esc cancels aiming");
  // 切换：Q → E
  await page.keyboard.press("KeyQ");
  await c.wait(80);
  await page.keyboard.press("KeyE");
  await c.wait(80);
  s = await state();
  ok(s.aiming && s.key === "E", "another skill key switches the preview", s.key);
  // 同键确认
  const s4 = await state();
  await page.keyboard.press("KeyE");
  await c.wait(300);
  s = await state();
  ok(!s.aiming && castsOf(s, "sword_qi") === castsOf(s4, "sword_qi") + 1, "pressing the same key again confirms", s);

  // ---- 4. 不可施放：真气不足时灰色 + 点击不释放 ----
  await reset();
  await aimAt(2, -9);
  await page.keyboard.press("KeyQ");
  await c.wait(120);
  await c.ev(() => (window.__skills.hero.mp = 5));
  await c.wait(200);
  s = await state();
  ok(s.aiming && !s.valid && s.reason === "真气不足" && s.cursor === "invalid", "insufficient mp while aiming → grey preview + invalid cursor", s);
  await c.shot("preview_invalid");
  const s5 = await state();
  await page.mouse.click((await aimAt(2, -9)).x, (await aimAt(2, -9)).y);
  await c.wait(150);
  s = await state();
  ok(s.aiming && castsOf(s, "vine") === castsOf(s5, "vine"), "click on invalid preview does not cast", s);
  await reset();
  // 冷却中按键：不进入瞄准
  await c.ev(() => (window.__skills.cd.Q = 5));
  await page.keyboard.press("KeyQ");
  await c.wait(80);
  ok(!(await state()).aiming, "skill on cooldown does not enter aiming");
  await reset();

  // ---- 5. 阵盘 T ----
  await aimAt(-3, -6);
  await page.keyboard.press("KeyT");
  await c.wait(200);
  s = await state();
  const hasF = await c.ev(() => !!window.__skills.formationDef);
  if (hasF) {
    ok(s.aiming && s.key === "formation" && s.shape === "area", "T previews formation area", s);
    await c.shot("preview_formation");
    const f0 = await c.ev(() => window.__skills.formations.length);
    await page.mouse.click((await aimAt(-3, -6)).x, (await aimAt(-3, -6)).y);
    await c.wait(200);
    ok((await c.ev(() => window.__skills.formations.length)) === f0 + 1, "formation placed on confirm");
  }

  // ---- 6. 法宝（V → 再按 V / 左键确认；瞄准中右键只取消）。2026-11 起右键改为蓄势斩，法宝改用 V ----
  await reset(null, {});
  await c.ev(() => window.__skills.setLoadout({ artifact: { ...window.__skills.loadout.artifact, id: "seal" } }));
  await reset();
  await page.mouse.move((await aimAt(1, -8)).x, (await aimAt(1, -8)).y);
  const a0 = await c.ev(() => window.__skills.stats.casts.seal || 0);
  await page.keyboard.press("KeyV");
  await c.wait(150);
  s = await state();
  ok(s.aiming && s.key === "artifact" && s.shape === "area", "V previews artifact (seal)", s);
  await c.shot("preview_artifact_seal");
  // 瞄准中右键：只取消，不放蓄势斩（即使气势已满）
  await c.ev(() => ((__game.player.momentum = 100), (window.__chg = 0), __game.world.events.on("player:charge", () => window.__chg++)));
  await page.mouse.click((await aimAt(1, -8)).x, (await aimAt(1, -8)).y, { button: "right" });
  await c.wait(200);
  s = await state();
  const chg = await c.ev(() => ({ n: window.__chg, m: __game.player.momentum, state: __game.player.state }));
  ok(!s.aiming && (s.casts.seal || 0) === a0 && chg.n === 0 && chg.m === 100, "right click while aiming artifact only cancels (no charge slash)", { s, chg });
  await page.keyboard.press("KeyV");
  await c.wait(150);
  await page.keyboard.press("KeyV");
  await c.wait(250);
  s = await state();
  ok(!s.aiming && (s.casts.seal || 0) === a0 + 1, "second V confirms artifact", s);
  // 不在瞄准时右键 = 蓄势斩，不是法宝
  await page.waitForFunction(() => __game.player.state === "move", null, { timeout: 5000 }).catch(() => {});
  await c.ev(() => (__game.player.momentum = 100));
  await page.mouse.click((await aimAt(1, -8)).x, (await aimAt(1, -8)).y, { button: "right" });
  await page.waitForFunction(() => window.__chg > 0, null, { timeout: 5000 }).catch(() => {});
  s = await state();
  const chg2 = await c.ev(() => ({ n: window.__chg, m: __game.player.momentum }));
  ok(!s.aiming && chg2.n === 1 && chg2.m === 0 && (s.casts.seal || 0) === a0 + 1, "right click (not aiming) = charge slash, not artifact", { chg2, casts: s.casts.seal });
  await c.wait(600);

  // ---- 7. 连锁（掌心雷） ----
  await c.ev(async () => {
    const m = await import("/src/data/skills.js");
    window.__arch = [];
    for (const k of ["thunder", "rock"]) if (!m.SPELLS[k] && m.SPELL_ARCHIVE[k]) (m.SPELLS[k] = m.SPELL_ARCHIVE[k]), window.__arch.push(k);
    window.__restoreArch = () => window.__arch.forEach((k) => delete m.SPELLS[k]);
  });
  await reset(["thunder", "frost", "rock"]);
  await c.wait(1500); // 等镇山印的特效散去
  await page.mouse.move(dp.x, dp.y, { steps: 2 });
  await c.wait(100);
  await page.keyboard.press("KeyQ");
  await c.wait(200);
  s = await state();
  await c.shot("cursor_aim", { clip: await clipAround(c, page) });
  const tgt = await c.ev(() => !!window.__targeting.target);
  ok(s.aiming && s.shape === "chain" && tgt, "chain preview highlights first target", { s, tgt });
  await c.shot("preview_chain");
  await page.keyboard.press("KeyE");
  await c.wait(200);
  await c.shot("preview_frost");
  await page.keyboard.press("KeyR");
  await c.wait(200);
  ok((await state()).shape === "area", "slam (rock) previews an area");
  await c.shot("preview_slam");
  await page.keyboard.press("Escape");
  await c.ev(() => window.__restoreArch());

  // ---- 8. 自身类：土遁护体直接释放 ----
  await reset(["earth_shield", "frost", "vine"]);
  await page.keyboard.press("KeyQ");
  await c.wait(300);
  s = await state();
  ok(!s.aiming && (s.casts.earth_shield || 0) >= 1, "self buff (earth_shield) casts instantly", s);

  // ---- 9. 快速施法 ----
  await reset(["vine", "sword_qi", "fire_talisman"]);
  await c.ev(() => localStorage.setItem("moxian.settings", JSON.stringify({ quickCast: !0 })));
  await aimFar();
  const q0 = await state();
  await page.keyboard.press("KeyQ");
  await c.wait(400);
  s = await state();
  const qz = await c.ev(() => {
    const S = window.__skills, zz = S.zones[S.zones.length - 1], h = S.hero;
    return zz ? +Math.hypot(zz.pos.x - h.pos.x, zz.pos.z - h.pos.z).toFixed(2) : -1;
  });
  ok(!s.aiming && castsOf(s, "vine") === castsOf(q0, "vine") + 1 && Math.abs(qz - 14) < 0.6, "quick-cast casts immediately at (clamped) cursor", { s, qz });
  await c.ev(() => localStorage.removeItem("moxian.settings"));

  // ---- 10. 黄昏下的预览可读性（有天时接口时） ----
  await reset(["vine", "sword_qi", "fire_talisman"]);
  const tod = await c.ev(() => {
    const g = window.__game, lv = g && (g.level || (g.run && g.run.level));
    if (lv && typeof lv.setTimeOfDay === "function") return lv.setTimeOfDay(0.7), !0;
    return !1;
  });
  if (tod) {
    await aimAt(2, -9);
    await page.keyboard.press("KeyQ");
    await c.wait(250);
    await c.shot("preview_zone_dusk");
    await page.keyboard.press("Escape");
  }

  // 性能：瞄准时每帧无新增 DOM 节点
  await page.keyboard.press("KeyE");
  await c.wait(250);
  const muts = await c.ev(async () => {
    let n = 0;
    const mo = new MutationObserver((l) => (n += l.filter((m) => m.type === "childList" || m.attributeName !== "style").length));
    mo.observe(document.getElementById("ink-cursor"), { subtree: !0, childList: !0, attributes: !0, characterData: !0 });
    await new Promise((r) => setTimeout(r, 600));
    mo.disconnect();
    return n;
  });
  ok(muts <= 2, "aiming: cursor DOM is not rebuilt per frame", muts);
  await page.keyboard.press("Escape");
}

async function clipAround(c, page) {
  const p = await c.ev(() => ({ x: window.__cursor.x, y: window.__cursor.y }));
  return { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 60), width: 160, height: 120 };
}
