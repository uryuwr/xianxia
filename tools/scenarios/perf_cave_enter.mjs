// 洞府首入性能（模块 C）：从出行准备切到洞府，记录 6 秒内的帧间隔、长任务，再测第一次打开灵泉 / 仓库页。node tools/run.mjs perf_cave_enter "scene=prep&slot=3"
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.flow && __game.flow.name === "prep", null, { timeout: 120000 });
  await c.wait(3000);
  const r = await c.ev(async () => {
    const frames = [], lt = [];
    let last = performance.now(), run = !0;
    const big = []; const tick = (t) => { frames.push(t - last); if (t - last > 50) big.push([Math.round(t - last), Math.round(t - T0)]); last = t; if (run) requestAnimationFrame(tick); }; let T0 = performance.now(); window.__T0 = () => T0;
    requestAnimationFrame(tick);
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(Math.round(e.duration))));
    po.observe({ type: "longtask", buffered: !1 });
    await new Promise((r) => setTimeout(r, 300));
    T0 = performance.now(); const t0 = T0;
    window.__caveProfile = 1; __game.flow.go("cave");
    const s0 = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 6000));
    run = !1; po.disconnect();
    const over = frames.filter((x) => x > 50).map(Math.round);
    return { sync: Math.round(s0), n: frames.length, over50: over, maxFrame: Math.round(Math.max(...frames)), longtasks: lt, big, active: !!(window.__cave && window.__cave.active) };
  });
  console.log("CAVE_ENTER", JSON.stringify(r));
  await c.shot("enter");
  // 首次打开灵泉页
  await c.wait(1500);
  const o = await c.ev(async () => {
    const frames = []; let last = performance.now(), run = !0;
    const tick = (t) => { frames.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 300));
    frames.length = 0;
    window.__cave.open("spring");
    await new Promise((r) => setTimeout(r, 1500));
    window.__cave.ui.close();
    await new Promise((r) => setTimeout(r, 300));
    window.__cave.open("storage");
    await new Promise((r) => setTimeout(r, 1500));
    run = !1;
    return frames.filter((x) => x > 50).map(Math.round);
  });
  console.log("FIRST_OPEN over50", JSON.stringify(o));
}
