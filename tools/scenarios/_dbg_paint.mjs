// 性能工程临时调试：点选 vs 空闲 的各阶段耗时差（用完删除）
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await c.wait(1000);
  await c.ev((css) => { const st = document.createElement("style"); st.id = "pbx"; st.textContent = css; document.head.appendChild(st); }, process.env.CSS || "");
  await c.ev(async () => {
    const r = __game.run, I = await import("/src/core/items.js"), L = await import("/src/game/loot.js");
    r.clearEnemies(); r.nextWave = 1e9; r.bag.capacity = 32;
    const ids = ["wolf_fang", "qingling_cao", "ling_yu", "wolf_core", "tiejing_shi", "bat_wing", "hanlu_cao", "chiyan_guo"];
    for (let k = 0; k < 26; k++) r.bag.add(I.makeItem(ids[k % 8], { n: 1 + (k % 3), rarity: k % 5 }));
    r.bag.add(L.makeGear("sword_qingfeng", 3, 4, { identified: !1 }));
  });
  const browser = page.context().browser();
  const prof = async (fn) => {
    await browser.startTracing(page, { categories: ["devtools.timeline", "blink", "cc", "disabled-by-default-devtools.timeline"] });
    await fn();
    const buf = await browser.stopTracing();
    const raw = JSON.parse(buf.toString()), T = raw.traceEvents || raw;
    const thr = new Map();
    for (const e of T) if (e.ph === "M" && e.name === "thread_name") thr.set(e.pid + ":" + e.tid, e.args.name);
    const m = new Map();
    for (const e of T) if (e.ph === "X" && e.dur) { const tn = (thr.get(e.pid + ":" + e.tid) || "?").replace(/\d+/g, ""); if (!/CrRendererMain/.test(tn)) continue; m.set(e.name, (m.get(e.name) || 0) + e.dur / 1000); }
    return m;
  };
  await page.keyboard.press("Tab");
  await c.wait(900);
  await page.mouse.move(200, 300);
  const xy = await c.ev(() => [...document.querySelectorAll(".mk-bagui .bv-grid .mk-tok")].slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const B = () => "__game.flow.scenes.run.bagUI";
  await page.mouse.click(...xy[1]);
  await c.wait(500);
  await page.mouse.move(150, 300);
  const modes = {
    idle: () => {},
    toks: () => document.querySelectorAll(".mk-bagui .bv-grid .mk-tok").forEach((t, i) => i < 2 && t.classList.toggle("is-sel")),
    tipSame: () => { const u = __game.flow.scenes.run.bagUI; u.tipSig = null; u.syncTip(); },
    tipAnim: () => { const u = __game.flow.scenes.run.bagUI; u.tipSig = null; u.tipUid = null; u.syncTip(); },
  };
  const res = {};
  const blank = await c.ev(() => { const r = document.querySelector(".mk-bagui .bv-keys").getBoundingClientRect(); return [r.right - 6, r.bottom + 4]; });
  res.idle = await prof(async () => { for (let i = 0; i < 4; i++) { await page.mouse.move(150 + i, 300); await c.wait(330); } });
  res.clickBlank = await prof(async () => { for (let i = 0; i < 4; i++) { await page.mouse.click(blank[0], blank[1] - i); await c.wait(330); } });
  res.clickTok = await prof(async () => { for (let i = 0; i < 4; i++) { await page.mouse.click(...xy[2 + i]); await c.wait(330); } });
  await c.ev(() => { const s = document.createElement("style"); s.textContent = "#ink-cursor { display: none !important; }"; document.head.appendChild(s); });
  res.tokNoCursor = await prof(async () => { for (let i = 0; i < 4; i++) { await page.mouse.click(...xy[2 + (i % 3)]); await c.wait(330); } });
  const modes = res;
  const keys = ["LocalFrameView::UpdateStyleAndLayout", "UpdateLayoutTree", "Layout", "LocalFrameView::RunPaintLifecyclePhase", "Paint", "Layerize", "PrePaint", "FireAnimationFrame"];
  for (const k of Object.keys(modes)) console.log("MODE " + k.padEnd(8) + keys.map((n) => n.replace("LocalFrameView::", "") + " " + (((res[k].get(n) || 0) - (res.idle.get(n) || 0)) / 4).toFixed(1)).join(" | "));
}
