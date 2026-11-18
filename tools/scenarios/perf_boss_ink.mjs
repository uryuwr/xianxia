// 首领演出的水墨后期参数（性能工程，boss_青牙_v2 §10.2 第 6 项）：留白 paperFade + 焦点（首领 / 主角）、去饱和 desat。
//   1. 接口：ctx.ink.setPaperFade / setPaperFocus / setDesat 存在，默认 0
//   2. 参数为 0 时与改动前的着色器（work/perf_backup/ink_frag_pre_boss.glsl）逐像素一致
//   3. GPU 同会话 A/B（背靠背 30 帧中位数，交替 2 轮）：改动前 / 参数 0 / 留白 0.85 / 去饱和 0.45
//   4. 真实首领战：转阶段 → 威折处决（desat 升到 0.45、结束归 0）→ 终结处决（paperFade 升到 ≥ 0.8、焦点 = 首领 + 主角，结束归 0、焦点清空）
//   截图：work/shots/perf_boss_ink_<段>_<QUALITY>.png（静帧对比 + 转阶段 / 威折 / 终结的实战画面）
// 用法：node tools/run.mjs perf_boss_ink "scene=run&region=r1&slot=8"   （QUALITY=high|medium|low 先切画质；IGPU=1 看集显计时）
import fs from "node:fs";
export default async function (page, c) {
  const R = [];
  const check = (n, ok, info) => {
    R.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  const Q = process.env.QUALITY || "default";
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 150000 });
  if (process.env.QUALITY) await c.ev((q) => __game.setQuality && __game.setQuality(q), process.env.QUALITY);
  await c.wait(800);
  const waitFor = async (fn, arg, ms = 8000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
      return !0;
    } catch {
      return !1;
    }
  };

  // ---- 1. 接口 ----
  let s = await c.ev(() => {
    const ink = __game.ctx.ink, u = ink.mat.uniforms;
    return { fade: typeof ink.setPaperFade, focus: typeof ink.setPaperFocus, desat: typeof ink.setDesat, u: [u.uFade.value, u.uDesat.value], quality: __game.quality };
  });
  check("ink API: setPaperFade / setPaperFocus / setDesat, defaults 0", s.fade === "function" && s.focus === "function" && s.desat === "function" && s.u[0] === 0 && s.u[1] === 0, s);

  // ---- 进谷、生成首领（沉睡），主角站在首领前 ----
  await c.ev(() => {
    const G = __game, E = G.ctx.enemies;
    G.run.clearEnemies();
    E.auto = !1;
    G.player.debug.god = !0;
    G.profile.flags.unlockAll = !0;
    window.__q = () => E.list.find((e) => e.type === "qingya" && e.alive);
    window.__qClr = (q) => { for (const id of [...q.entity.statuses.keys()]) G.world.removeStatus(q.entity, id); };
    G.player.spawn(38, -26);
    G.rig.update(1, !0);
  });
  const spawned = await waitFor(() => !!window.__q && !!__q() && !!__q().ctrl, null, 15000);
  check("boss spawned", spawned);
  if (!spawned) return c.log("SUMMARY " + R.filter(Boolean).length + "/" + R.length);
  await c.ev(() => {
    const q = __q(), P = __game.player;
    P.spawn(q.pos.x, q.pos.z + q.entity.radius + 2.5);
    __game.rig.update(1, !0);
  });
  await waitFor(() => __q().ctrl.mode === "intro", null, 4000);
  await waitFor(() => __q().ctrl.mode === "fight", null, 9000);

  // ---- 2 + 3. 静帧：逐像素一致 + GPU A/B + 对比截图 ----
  const pre = fs.readFileSync("work/perf_backup/ink_frag_pre_boss.glsl", "utf8");
  s = await c.ev(async (pre) => {
    const G = __game, R = G.renderer, gl = R.getContext(), ink = G.ink, m = ink.mat, u = m.uniforms;
    const { NOISE } = await import("/src/render/glsl.js");
    G.flow.paused = !0;
    await new Promise((r) => setTimeout(r, 250));
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const grab = () => {
      ink.render(G.scene, G.camera, 12.5);
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const fsNew = m.fragmentShader, fsPre = pre.replace("//NOISE", NOISE);
    const setFs = (f) => ((m.fragmentShader = f), (m.needsUpdate = !0));
    const a = grab();
    setFs(fsPre);
    const b = grab();
    setFs(fsNew);
    let max = 0, n = 0;
    for (let i = 0; i < a.length; i += 4)
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a[i + k] - b[i + k]);
        if (d > max) max = d;
        if (d > 1) n++;
      }
    // 留白开着时：首领 / 主角处保留、其余淡成纸色（看焦点中心与画面角落的像素）
    const q = __q();
    ink.setPaperFocus(q, G.player);
    ink.setPaperFade(0.85);
    const f = grab();
    const at = (px, v) => {
      const p = v.clone().project(G.camera), x = Math.round(((p.x + 1) / 2) * (W - 1)), y = Math.round(((p.y + 1) / 2) * (H - 1)), i = (y * W + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const T = G.THREE, mid = new T.Vector3(q.pos.x, q.pos.y + 1.4, q.pos.z);
    const diff = (x, y) => Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
    const corner = (px) => [px[(8 * W + 8) * 4], px[(8 * W + 8) * 4 + 1], px[(8 * W + 8) * 4 + 2]];
    const holeKept = diff(at(f, mid), at(a, mid)), cornerFaded = diff(corner(f), corner(a));
    ink.setPaperFade(0);
    ink.setPaperFocus();
    // GPU A/B：同会话交替 2 轮，每轮背靠背 30 帧取中位数
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const bench = async () => {
      for (let i = 0; i < 6; i++) ink.render(G.scene, G.camera, 12.5);
      gl.finish();
      const qs = [];
      for (let i = 0; i < 30; i++) {
        const qq = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, qq);
        ink.render(G.scene, G.camera, 12.5);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(qq);
      }
      gl.finish();
      for (let k = 0; k < 40 && !gl.getQueryParameter(qs[29], gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 25));
      const v = qs.map((qq) => gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6).sort((x, y) => x - y);
      qs.forEach((qq) => gl.deleteQuery(qq));
      return +v[15].toFixed(2);
    };
    const B = { pre: [], zero: [], fade: [], desat: [] };
    if (ext)
      for (let r = 0; r < 2; r++) {
        setFs(fsPre);
        B.pre.push(await bench());
        setFs(fsNew);
        B.zero.push(await bench());
        ink.setPaperFocus(q, G.player);
        ink.setPaperFade(0.85);
        B.fade.push(await bench());
        ink.setPaperFade(0);
        ink.setPaperFocus();
        ink.setDesat(0.45);
        B.desat.push(await bench());
        ink.setDesat(0);
      }
    setFs(fsNew);
    ink.render(G.scene, G.camera, 12.5);
    G.flow.paused = !1;
    return { W, H, max, n, holeKept, cornerFaded, B, progs: R.info.programs.length };
  }, pre);
  check("params 0 = pre-change shader, pixel-identical (max diff ≤ 1/255)", s.max <= 1, { max: s.max, over1: s.n });
  check("paperFade 0.85: focus (boss) kept, rest faded to paper", s.holeKept < 40 && s.cornerFaded > 20, { holeKept: s.holeKept, cornerFaded: s.cornerFaded });
  const med = (v) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : null);
  c.log("GPU A/B ms (ink.render 整帧):", JSON.stringify({ pre: med(s.B.pre), zero: med(s.B.zero), fade: med(s.B.fade), desat: med(s.B.desat), raw: s.B }));
  // 静帧对比截图（暂停中切参数）
  for (const [name, f] of [["base", () => 0], ["fade", (ink, q, P) => (ink.setPaperFocus(q, P), ink.setPaperFade(0.85))], ["desat", (ink) => ink.setDesat(0.45)]]) {
    await c.ev((src) => {
      const ink = __game.ctx.ink;
      __game.flow.paused = !0;
      new Function("ink", "q", "P", "return (" + src + ")(ink, q, P)")(ink, __q(), __game.player);
    }, f.toString());
    await c.wait(250);
    await c.shot(`still_${name}_${Q}`);
    await c.ev(() => {
      const ink = __game.ctx.ink;
      ink.setPaperFade(0);
      ink.setPaperFocus();
      ink.setDesat(0);
      __game.flow.paused = !1;
    });
  }

  // ---- 4. 实战：转阶段 → 威折处决 → 终结处决（每帧记录后期参数）----
  await c.ev(() => {
    const ink = __game.ctx.ink, u = ink.mat.uniforms;
    window.__ink = { fade: 0, desat: 0, focusN: 0, log: [] };
    const tick = () => {
      const k = window.__ink;
      if (!k) return;
      k.fade = Math.max(k.fade, u.uFade.value);
      k.desat = Math.max(k.desat, u.uDesat.value);
      if (u.uFade.value > 0) k.focusN = Math.max(k.focusN, ink.focus.length);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const q = __q();
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __qClr(q);
    q.entity.hp = q.entity.stats.get("hp") * 0.49;
  });
  await waitFor(() => __q().ctrl.mode === "transition", null, 4000);
  await c.wait(2200);
  await c.shot(`transition_${Q}`);
  await waitFor(() => __q().ctrl.mode === "fight", null, 6000);
  await c.wait(600);
  await c.shot(`phase2_${Q}`);
  // 威折处决
  await c.ev(() => {
    const q = __q(), C = q.ctrl, P = __game.player;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    C.moonCd = 999;
    q.state = "chase";
    __qClr(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __qClr(q);
    q.entity.stats.removeSource("shieldBreak");
    q.entity.hp = q.entity.stats.get("hp") * 0.4;
    P.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
    C.poise = C.poiseMax - 1;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
    window.__execEnd = 0;
    __game.world.events.on("boss:execEnd", () => window.__execEnd++);
  });
  await c.wait(150);
  await c.ev(() => (__q().ctrl.fReq = !0));
  const exB = await waitFor(() => __q() && __q().ctrl.mode === "exec", null, 3000);
  await c.wait(1000);
  await c.shot(`exec_break_${Q}`);
  await waitFor(() => window.__execEnd > 0, null, 5000);
  await c.wait(100);
  s = await c.ev(() => ({ max: +__ink.desat.toFixed(3), after: __game.ctx.ink.mat.uniforms.uDesat.value, fadeMax: __ink.fade }));
  check("break execution: desat → 0.45, back to 0 after; no paper fade", exB && Math.abs(s.max - 0.45) < 0.02 && s.after === 0 && s.fadeMax === 0, s);
  // 终结处决
  await waitFor(() => !__q().ctrl.broken, null, 4000);
  await c.ev(() => {
    const q = __q(), C = q.ctrl;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    C.moonCd = 999;
    q.state = "chase";
    __qClr(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __qClr(q);
    q.entity.stats.removeSource("shieldBreak");
    __game.world.dealDamage(__game.player.entity, q.entity, { base: q.entity.hp * 3 + 2000, noCrit: !0 });
    window.__ink.fade = 0;
    window.__ink.desat = 0;
  });
  await c.wait(250);
  await c.ev(() => { const q = __q(); __game.player.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2); q.ctrl.fReq = !0; });
  await waitFor(() => window.__execEnd > 1 || (__q() && __q().ctrl.mode === "exec"), null, 3000);
  await c.wait(1700);
  await c.shot(`exec_final_${Q}`);
  await waitFor(() => window.__execEnd > 1, null, 6000);
  await c.wait(700);
  s = await c.ev(() => ({ max: +__ink.fade.toFixed(3), focusN: __ink.focusN, after: __game.ctx.ink.mat.uniforms.uFade.value, focusAfter: __game.ctx.ink.focus.length, desat: __game.ctx.ink.mat.uniforms.uDesat.value, errors: window.__errors.length }));
  check("final execution: paperFade ≥ 0.8 with 2 focus (boss + hero); back to 0, focus cleared", s.max >= 0.8 && s.focusN === 2 && s.after === 0 && s.focusAfter === 0 && s.desat === 0, s);
  check("no page errors", s.errors === 0, s.errors);
  await c.ev(() => (window.__ink = null));
  c.log("SUMMARY " + R.filter(Boolean).length + "/" + R.length);
}
