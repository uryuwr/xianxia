// 画面一致性：同一帧分别用优化后的水墨后期与原始着色器（work/perf_backup/ink_frag_orig.glsl）渲染，逐像素比较。
// 用法：node tools/run.mjs perf_parity "scene=run&region=r2&slot=3"
import fs from "node:fs";
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 120000 });
  await c.wait(1500);
  const orig = fs.readFileSync("work/perf_backup/ink_frag_orig.glsl", "utf8");
  const r = await c.ev(async (orig) => {
    const G = __game, R = G.renderer, gl = R.getContext(), ink = G.ink;
    const { NOISE } = await import("/src/render/glsl.js");
    G.flow.paused = !0;
    await new Promise((r) => setTimeout(r, 200));
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const grab = () => {
      ink.render(G.scene, G.camera, 12.5);
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const a = grab();
    const m = ink.mat, fs0 = m.fragmentShader;
    m.fragmentShader = orig.replace("//NOISE", NOISE);
    m.needsUpdate = !0;
    const b = grab();
    // 同一会话 A/B 计时：背靠背渲染 30 帧，计时查询取中位数（原始 / 优化 交替两轮）
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const bench = async () => {
      for (let i = 0; i < 6; i++) ink.render(G.scene, G.camera, 12.5);
      gl.finish();
      const qs = [];
      for (let i = 0; i < 30; i++) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        ink.render(G.scene, G.camera, 12.5);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(q);
      }
      gl.finish();
      for (let k = 0; k < 40 && !gl.getQueryParameter(qs[29], gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 25));
      const v = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((x, y) => x - y);
      return +v[15].toFixed(2);
    };
    const T = { orig: [], opt: [] };
    if (ext)
      for (let round = 0; round < 2; round++) {
        T.orig.push(await bench());
        m.fragmentShader = fs0;
        m.needsUpdate = !0;
        T.opt.push(await bench());
        m.fragmentShader = orig.replace("//NOISE", NOISE);
        m.needsUpdate = !0;
      }
    m.fragmentShader = fs0;
    m.needsUpdate = !0;
    G.flow.paused = !1;
    window.__parityT = T;
    let max = 0, n2 = 0, n4 = 0, sum = 0;
    for (let i = 0; i < a.length; i += 4)
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a[i + k] - b[i + k]);
        sum += d;
        if (d > max) max = d;
        if (d > 2) n2++;
        if (d > 4) n4++;
      }
    return { gpuMs: window.__parityT, W, H, max, mean: +(sum / (W * H * 3)).toFixed(4), over2: n2, over4: n4, total: W * H * 3 };
  }, orig);
  c.log(JSON.stringify(r));
  c.log((r.max <= 8 && r.over4 < r.total * 0.001 ? "PASS" : "FAIL") + " ink parity (max diff / pixels over 4)");
  // 画面外敌人剔除（Enemy.animate）：全部强制显示 vs 剔除后，同一帧逐像素比较（影子余量够不够）
  const r2 = await c.ev(async () => {
    const G = __game, R = G.renderer, gl = R.getContext(), ink = G.ink, E = G.ctx.enemies;
    G.flow.paused = !0;
    await new Promise((r) => setTimeout(r, 200));
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const grab = () => {
      ink.render(G.scene, G.camera, 12.5);
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const culled = E.list.filter((e) => !e.root.visible).length;
    const a = grab();
    const hid = E.list.filter((e) => !e.root.visible);
    hid.forEach((e) => (e.root.visible = !0));
    const b = grab();
    hid.forEach((e) => (e.root.visible = !1));
    G.flow.paused = !1;
    let max = 0, n4 = 0;
    for (let i = 0; i < a.length; i += 4)
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a[i + k] - b[i + k]);
        if (d > max) max = d;
        if (d > 4) n4++;
      }
    return { enemies: E.list.length, culled, max, over4: n4 };
  });
  c.log(JSON.stringify(r2));
  c.log((r2.over4 === 0 ? "PASS" : "FAIL") + " off-screen enemy culling is invisible");
}
