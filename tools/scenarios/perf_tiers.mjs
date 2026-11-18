// 画质档位 GPU 对照（同一会话、同一画面、交替多轮，排除集显频率波动）：orig（优化前配置）/ high / medium / low。
// 用法：IGPU=1 DPR=1.25 W=1536 H=864 node tools/run.mjs perf_tiers "scene=run&region=r2&slot=3"
//   每个位置（入口开阔地、植被最密处、战斗中）每档背靠背渲染 30 帧取 GPU 计时中位数，3 轮取中位数。结果写 work/perf/tiers_<region>.json
import fs from "node:fs";

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await c.wait(1500);
  const orig = fs.readFileSync("work/perf_backup/ink_frag_orig.glsl", "utf8");
  await c.ev(async (orig) => {
    const { NOISE } = await import("/src/render/glsl.js");
    const G = __game, R = G.renderer, gl = R.getContext(), ink = G.ink, m = ink.mat;
    const optFS = m.fragmentShader, origFS = orig.replace("//NOISE", NOISE);
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    G.player.debug.god = !0;
    window.__tier = async (t) => {
      G.setQuality(t === "orig" ? "high" : t);
      m.fragmentShader = t === "orig" ? origFS : optFS;
      m.needsUpdate = !0;
      if (t === "orig") R.setPixelRatio(Math.min(devicePixelRatio, 2)), dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 300));
    };
    window.__bench = async () => {
      const t = ink.mat.uniforms.uTime.value;
      for (let i = 0; i < 6; i++) ink.render(G.scene, G.camera, t);
      gl.finish();
      const qs = [], t0 = performance.now();
      for (let i = 0; i < 30; i++) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        ink.render(G.scene, G.camera, t);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(q);
      }
      gl.finish();
      const wall = (performance.now() - t0) / 30;
      for (let k = 0; k < 40 && !gl.getQueryParameter(qs[29], gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 25));
      const v = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((x, y) => x - y);
      qs.forEach((q) => gl.deleteQuery(q));
      return { gpu: v[15], wall, calls: R.info.render.calls };
    };
  }, orig);
  const spots = {};
  spots.open = await c.ev(() => __game.run.map.points.entries[0].toArray());
  spots.veg = await c.ev(() => {
    const G = __game, T = G.THREE, m = new T.Matrix4(), v = new T.Vector3(), cnt = new Map();
    G.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.visible) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        const k = Math.floor(v.x / 12) + "," + Math.floor(v.z / 12);
        cnt.set(k, (cnt.get(k) || 0) + 1);
      }
    });
    for (const [k] of [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      const [i, j] = k.split(",").map(Number);
      for (let t = 0; t < 40; t++) {
        const x = (i + ((t * 0.37) % 1)) * 12, z = (j + ((t * 0.61) % 1)) * 12;
        const h = G.ctx.terrain.height(x, z);
        if (h > -0.5 && G.player.canStand(x, z, h)) return [x, h, z];
      }
    }
    return null;
  });
  const out = { gpu: await c.ev(() => { const gl = __game.renderer.getContext(), d = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); }), dpr: await c.ev(() => devicePixelRatio), spots: {} };
  const TIERS = ["orig", "high", "medium", "low"];
  for (const [name, p] of Object.entries(spots)) {
    if (!p) continue;
    await c.ev(([x, z]) => (__game.player.spawn(x, z), __game.rig.update(1, !0)), [p[0], p[2]]);
    if (name === "combat") continue;
    await c.wait(600);
    await c.ev(() => (__game.flow.paused = !0));
    const res = Object.fromEntries(TIERS.map((t) => [t, []]));
    for (let round = 0; round < 3; round++)
      for (const t of TIERS) {
        await c.ev((t) => __tier(t), t);
        res[t].push(await c.ev(() => __bench()));
      }
    await c.ev(() => (__game.flow.paused = !1));
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    out.spots[name] = Object.fromEntries(TIERS.map((t) => [t, { gpu: +med(res[t].map((r) => r.gpu)).toFixed(2), wall: +med(res[t].map((r) => r.wall)).toFixed(2), calls: res[t][0].calls }]));
    c.log(`TIERS ${name}: ${JSON.stringify(out.spots[name])}`);
    await c.shot(`${name}_${process.env.TAG || ""}`);
  }
  // 战斗：刷 8 只怪围住主角，放一轮技能后静止对比（特效多、透明物多）
  await c.ev(([x, z]) => (__game.player.spawn(x, z), __game.rig.update(1, !0)), [spots.open[0], spots.open[2]]);
  await c.ev(() => {
    const E = __game.ctx.enemies, S = __game.ctx.skills;
    for (const e of [...E.spawnPack(4, !1), ...E.spawnPack(4, !0)]) e.setAggro && e.setAggro("wave");
    S.debugAction("power");
  });
  await c.wait(1500);
  await c.ev(() => {
    const S = __game.ctx.skills, h = S.hero;
    h.mp = h.stats.get("mp");
    S.cd = {};
    const t = __game.ctx.enemies.list.find((e) => e.alive);
    S.aimOverride = t ? t.pos.clone() : null;
    S.castSpell(0), S.castSpell(1), S.castSpell(2), S.placeFormation();
  });
  await c.wait(500);
  await c.ev(() => (__game.flow.paused = !0));
  const res = Object.fromEntries(TIERS.map((t) => [t, []]));
  for (let round = 0; round < 3; round++)
    for (const t of TIERS) {
      await c.ev((t) => __tier(t), t);
      res[t].push(await c.ev(() => __bench()));
    }
  await c.ev(() => (__game.flow.paused = !1));
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  out.spots.combat = Object.fromEntries(TIERS.map((t) => [t, { gpu: +med(res[t].map((r) => r.gpu)).toFixed(2), wall: +med(res[t].map((r) => r.wall)).toFixed(2), calls: res[t][0].calls }]));
  c.log(`TIERS combat: ${JSON.stringify(out.spots.combat)}`);
  await c.shot(`combat_${process.env.TAG || ""}`);
  const region = await c.ev(() => __game.run.region);
  fs.mkdirSync("work/perf", { recursive: !0 });
  fs.writeFileSync(`work/perf/tiers_${region}${process.env.TAG ? "_" + process.env.TAG : ""}.json`, JSON.stringify(out, null, 1));
  c.log("errors in page:", await c.ev(() => window.__errors.length));
}
