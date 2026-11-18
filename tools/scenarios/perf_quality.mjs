// 画质档位可运行测试：设置页有"画质"四个选项、切档生效（像素比 / MSAA / 阴影尺寸 / 植被密度 / 墨线采样）、设置合并写入 moxian.settings、
// 自动档在帧率不足时降档（测试里打开 __autoQualityTest，无头浏览器帧间隔约 31ms，会一路降到低）。
// 用法：node tools/run.mjs perf_quality "scene=run&region=r2&slot=3"
export default async function (page, c) {
  const R = [];
  const ok = (cond, name, info) => {
    R.push(!!cond);
    c.log((cond ? "PASS " : "FAIL ") + name, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 120000 });
  await c.wait(800);
  const snap = () =>
    c.ev(() => {
      const G = __game, sun = (() => { let L = null; G.scene.traverseVisible((o) => o.isDirectionalLight && o.castShadow && !L && (L = o)); return L; })();
      let thin = 0, thinFull = 0, vegCast = 0, vegCastOn = 0;
      G.scene.traverse((o) => {
        if (!o.isInstancedMesh) return;
        if (o.userData.thin) (thin += o.count), (thinFull += o.userData.thin);
        if (o.userData.vegCast) vegCast++, o.castShadow && vegCastOn++;
      });
      return { q: G.quality, pr: G.renderer.getPixelRatio(), msaa: G.ink.rt.samples, shadow: sun && sun.shadow.mapSize.x, taps: G.ink.mat.defines.TAPS, thin: thinFull ? +(thin / thinFull).toFixed(2) : null, vegCast: vegCast ? vegCastOn / vegCast : null, saved: JSON.parse(localStorage.getItem("moxian.settings") || "{}") };
    });
  const s0 = await snap();
  ok(s0.q && ["high", "medium", "low"].includes(s0.q.tier), "quality module mounted, auto picks a tier", s0.q);
  for (const t of ["low", "medium", "high"]) {
    await c.ev((t) => __game.setQuality(t), t);
    await c.wait(300);
    const s = await snap();
    const want = { high: { msaa: 4, shadow: 4096, taps: 8, thin: 1, vegCast: 1 }, medium: { msaa: 2, shadow: 2048, taps: 8, thin: 0.7, vegCast: 1 }, low: { msaa: 0, shadow: 1024, taps: 4, thin: 0.45, vegCast: 0 } }[t];
    ok(s.q.tier === t && s.msaa === want.msaa && s.shadow === want.shadow && s.taps === want.taps && Math.abs(s.thin - want.thin) < 0.02 && s.vegCast === want.vegCast && s.saved.quality === t, `tier ${t} applied & saved`, s);
  }
  const errs = await c.ev(() => window.__errors.length);
  ok(errs === 0, "no page errors after switching tiers", errs);
  // 设置页：Esc → 设置 → 画质
  await c.ev(() => __game.flow.scenes.run.pause.toggle(!0));
  await c.wait(300);
  await c.ev(() => __game.flow.scenes.run.pause.settings());
  await c.wait(400);
  const row = await c.ev(() => [...document.querySelectorAll('.mk-opt[data-key="quality"] .ink-btn')].map((b) => b.dataset.value + (b.classList.contains("on") ? "*" : "")));
  ok(row.length === 4 && row.includes("high*"), "settings page has 画质 自动/高/中/低, current marked", row);
  await page.locator('.mk-opt[data-key="quality"] .ink-btn[data-value="medium"]').click();
  await c.wait(300);
  const s1 = await snap();
  ok(s1.q.mode === "medium" && s1.q.tier === "medium" && s1.saved.quality === "medium" && "look" in s1.saved, "clicking 中 switches & merges into moxian.settings", { q: s1.q, saved: s1.saved });
  await page.locator('.mk-opt[data-key="quality"] .ink-btn[data-value="auto"]').click();
  await c.wait(200);
  await c.ev(() => __game.flow.scenes.run.pause.toggle(!1));
  // 自动降档：无头浏览器帧间隔约 31ms（< 50 帧）→ 每 ~3 秒冷却 + 90 帧统计后降一档
  await c.ev(() => (window.__autoQualityTest = !0));
  const t0 = Date.now();
  let s2;
  while (Date.now() - t0 < 25000) {
    await c.wait(1000);
    s2 = await snap();
    if (s2.q.tier === "low") break;
  }
  ok(s2.q.mode === "auto" && s2.q.tier === "low" && s2.q.auto, "auto mode steps down when frame time > 20ms", s2.q);
  await c.ev(() => ((window.__autoQualityTest = !1), __game.setQuality("auto")));
  await c.shot("auto_low");
  ok((await c.ev(() => window.__errors.length)) === 0, "no page errors");
}
