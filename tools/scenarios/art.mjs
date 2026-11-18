// 美术样张截图：各预设机位 + 主角走动 + 写实/水墨对比 + 帧时间
export default async function (page, c) {
  await c.wait(2500);
  const info = await c.ev(() => ({ hero: window.__game.heroSource, ms: window.__game.frameMs }));
  c.log("info", JSON.stringify(info));
  c.log("gpu", await c.ev(() => { const gl = window.__game.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; }));
  for (const v of ["play", "overview", "closeup", "waterfall", "bamboo", "pavilion", "treasure"]) {
    await c.ev((v) => window.__game.setView(v), v);
    await c.wait(700);
    await c.shot(v);
  }
  // 主角走动：从起点沿石径往缓坡走
  await c.ev(() => window.__game.setView("play"));
  await c.ev(() => (window.__game.player.forceMove = [-1, -1]));
  await c.wait(1800);
  await c.shot("walk");
  const p = await c.ev(() => window.__game.player.pos.toArray().map((v) => +v.toFixed(2)));
  await c.ev(() => (window.__game.player.forceMove = null));
  c.log("walked to", JSON.stringify(p));
  // 遮挡：主角走进竹林深处，挡在镜头前的竹子应镂空
  await c.ev(() => { const g = window.__game; g.player.pos.set(-19.5, 0, -6.5); g.player.pos.y = 3.2; g.setView("closeup"); });
  await c.wait(900);
  await c.shot("occlude");
  // 出剑连段：连点三下左键
  await c.ev(() => { const g = window.__game; g.player.spawn(-5.5, 16.5); g.setView("closeup"); });
  await c.wait(600);
  for (let k = 0; k < 3; k++) { await page.mouse.click(640, 360); await c.wait(140); }
  await c.shot("slash");
  await c.wait(400);
  c.log("combo", JSON.stringify(await c.ev(() => ({ combo: window.__game.player.combo, cur: window.__game.player.cur && window.__game.player.cur.getClip().name }))));
  // 对比：关闭水墨后期
  await c.ev(() => window.__game.setInk(0));
  await c.wait(300);
  await c.shot("raw");
  await c.ev(() => window.__game.setInk(1));
  // 帧时间（CPU 侧，含提交）
  const fps = await c.ev(() => new Promise((r) => { let k = 0; const t0 = performance.now(); const f = () => (++k, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(+(k / 3).toFixed(1))); requestAnimationFrame(f); }));
  // GPU 帧时间：同步连续渲染 30 帧（每帧读回 1 像素强制等待 GPU 完成）
  const gpuMs = await c.ev(() => { const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4); g.setView("play"); g.rig.update(0.016); const t0 = performance.now(); for (let k = 0; k < 30; k++) { g.ink.render(g.scene, g.camera, k * 0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t0) / 30).toFixed(2); });
  c.log("anims", JSON.stringify(await c.ev(() => Object.keys(window.__game.player.actions))));
  c.log("gpuFrameMs(1280x720)", gpuMs);
  c.log("fps", fps, "cpuMs", await c.ev(() => window.__game.frameMs.toFixed(2)));
}
