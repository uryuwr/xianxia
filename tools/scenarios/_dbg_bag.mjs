// A/B：同一会话交替（性能工程临时调试，用完删除）
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await c.wait(1000);
  await c.ev(async () => {
    const r = __game.run, I = await import("/src/core/items.js"), L = await import("/src/game/loot.js");
    r.clearEnemies(); r.nextWave = 1e9;
    r.bag.capacity = 32;
    const ids = ["wolf_fang", "qingling_cao", "ling_yu", "wolf_core", "tiejing_shi", "bat_wing", "hanlu_cao", "chiyan_guo"];
    for (let k = 0; k < 26; k++) r.bag.add(I.makeItem(ids[k % 8], { n: 1 + (k % 3), rarity: k % 5 }));
    r.bag.add(L.makeGear("sword_qingfeng", 3, 4, { identified: !1 }));
    const st = document.createElement("style"); st.id = "pbx"; document.head.appendChild(st);
  });
  await page.keyboard.press("Tab");
  await c.wait(800);
  const xy = await c.ev(() => [...document.querySelectorAll(".mk-bagui .bv-grid .mk-tok")].slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const AB = (process.env.AB || "").split("|");
  const browser = page.context().browser();
  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "gpu"] });
  const marks = [];
  for (let i = 0; i < 16; i++) {
    const mode = i % 2;
    await c.ev((css) => (document.getElementById("pbx").textContent = css), AB[mode] || "");
    await c.wait(400);
    const t0 = await c.ev(() => performance.timeOrigin + performance.now());
    if (process.env.NOCLICK && (mode === 0 || process.env.NOCLICK === "2")) await page.mouse.move(200 + (i % 5) * 10, 300); else await page.mouse.click(...xy[i % xy.length]);
    await c.wait(300);
    const t1 = await c.ev(() => performance.timeOrigin + performance.now());
    marks.push({ mode, t0, t1 });
  }
  const buf = await browser.stopTracing();
  const raw = JSON.parse(buf.toString()), T = raw.traceEvents || raw;
  const thr = new Map();
  for (const e of T) if (e.ph === "M" && e.name === "thread_name") thr.set(e.pid + ":" + e.tid, e.args.name);
  // trace ts (us, monotonic) ↔ page time：用 navigationStart 对齐不可靠，改用第一条 click 的 EventDispatch 近似 → 直接用相对：按 RunTask 的分布切窗
  const clicks = T.filter((e) => e.name === "EventDispatch" && e.args && e.args.data && (e.args.data.type === "click" || (process.env.NOCLICK && e.args.data.type === "mousemove"))).map((e) => e.ts).sort((a, b) => a - b);
  // 每个窗口只取第一条事件
  for (let i = clicks.length - 1; i > 0; i--) if (clicks[i] - clicks[i - 1] < 200000) clicks.splice(i, 1);
  const sum = (from, to, pred) => T.reduce((s, e) => (e.ph === "X" && e.ts >= from && e.ts < to && pred(e) ? s + e.dur / 1000 : s), 0);
  const res = [[], []];
  clicks.forEach((ts, i) => {
    const to = ts + 300000;
    const m = marks[i] ? marks[i].mode : 0;
    res[m].push({
      raster: sum(ts, to, (e) => /DoEndRasterCHROMIUM$|DoRasterCHROMIUM$/.test(e.name)),
      wait: sum(ts, to, (e) => e.name === "LayerTreeHost::WaitForCommitCompletion"),
      paint: sum(ts, to, (e) => e.name === "LocalFrameView::RunPaintLifecyclePhase"),
      style: sum(ts, to, (e) => e.name === "LocalFrameView::RunStyleAndLayoutLifecyclePhases"),
    });
  });
  const med = (a, k) => { const s = a.map((x) => x[k]).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)].toFixed(1) : "-"; };
  for (const m of [0, 1]) console.log(`MODE ${m} [${AB[m] || "(none)"}] n ${res[m].length}  raster ${med(res[m], "raster")}  commitWait ${med(res[m], "wait")}  paint ${med(res[m], "paint")}  styleLayout ${med(res[m], "style")}`);
}
