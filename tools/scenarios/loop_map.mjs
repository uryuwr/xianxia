// 天机镜 · 地图 v2：底图、图标（妖群 → 斩、宝箱、采集）、右键墨点、悬停、探索过半、入夜妖潮、跨局地标。
// 用法：node tools/run.mjs loop_map "scene=run&region=r1&slot=2"
const ok = (cond, msg, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  if (!cond) process.exitCode = 1;
  return cond;
};
export default async function (page, c) {
  await page.routeWebSocket(/./, () => {});
  const url = page.url();
  await page.reload({ waitUntil: "commit", timeout: 90000 });
  const play = () => page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.flow.scenes.run.hudUI, null, { timeout: 90000 });
  await play();
  await c.wait(800);
  const mm = () => "window.__game.flow.scenes.run.hudUI.mm";
  const icons = () => c.ev(() => {
    const m = window.__game.flow.scenes.run.hudUI.mm;
    m.drawBig();
    return m.icons.map((i) => i.tip);
  });
  await c.ev(() => (__game.player.debug.god = !0));
  // 开局
  await page.keyboard.press("KeyM");
  await c.wait(500);
  ok(await c.ev(() => !document.querySelector(".mk-layer-bigmap").classList.contains("hidden") && !!window.__game.flow.scenes.run.hudUI.mm.base), "M opens map; base rendered once");
  await c.shot("start");
  await page.keyboard.press("KeyM");
  // 看见一群妖 → "妖 · 未清"；打掉 → "已清"
  await c.ev(() => {
    const p = __game.player.pos.clone().add(new __game.THREE.Vector3(6, 0, 4));
    window.__pack = __game.ctx.enemies.spawnPack(3, !1, p, { types: ["wolf"] });
  });
  await c.wait(900);
  await page.keyboard.press("KeyM");
  await c.wait(300);
  let tips = await icons();
  ok(tips.some((t) => /未清/.test(t)), "seen enemy group shows 未清", tips.slice(0, 10));
  await c.ev(() => {
    for (const e of window.__pack) if (e.alive) __game.world.dealDamage(__game.player.entity, e.entity, { base: 1e6, noCrit: !0 });
  });
  await c.wait(800);
  tips = await icons();
  ok(tips.some((t) => /已清/.test(t)), "cleared group → 斩 (已清)");
  // 品级颜色读 RARITY
  ok(await c.ev(() => {
    const src = String(window.__game.flow.scenes.run.hudUI.mm.drawIcons);
    return /qc\(/.test(src) && !/C\.moon/.test(src);
  }), "chest / gather colours come from RARITY");
  // 奇遇：读 quests.mapPoints()
  const enc = await c.ev(() => {
    const r = __game.run, Q = r.quests;
    if (!Q || !Q.mapPoints) return { skip: !0 };
    const p = __game.player.pos.clone().add(new __game.THREE.Vector3(3, 0, 0));
    const orig = Q.mapPoints.bind(Q);
    Q.mapPoints = () => [...orig(), { kind: "encounter", type: "test", glyph: "缘", label: "测试奇遇", pos: p, done: !1 }];
    r.mapModel.t = 0;
    return { skip: !1 };
  });
  if (!enc.skip) {
    await c.wait(500);
    tips = await icons();
    ok(tips.includes("测试奇遇"), "encounters read from quests.mapPoints()");
  }
  // 右键墨点（真实鼠标）+ 铜镜同步
  const box = await page.locator(".mk-bigmap2 canvas").boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.42, { button: "right" });
  await c.wait(200);
  ok(await c.ev(() => __game.run.mapModel.pins.length === 1), "right-click places an ink pin");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.42, { button: "right" });
  await c.wait(200);
  ok(await c.ev(() => __game.run.mapModel.pins.length === 0), "right-click on the pin removes it");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.42, { button: "right" });
  // 悬停
  const gp = await c.ev(() => {
    const m = window.__game.flow.scenes.run.hudUI.mm, ic = m.icons.find((i) => /已清/.test(i.tip)), r = m.cv.getBoundingClientRect(), k = m.cssK();
    return ic && [r.left + ic.x / k, r.top + ic.y / k];
  });
  if (gp) await page.mouse.move(gp[0], gp[1]), await c.wait(200);
  ok(!!gp && (await c.ev(() => /已清/.test(document.querySelector(".mk-bigmap2 .tipbox").textContent))), "hover shows name + state");
  // 滚轮缩放
  const z0 = await c.ev(() => window.__game.flow.scenes.run.hudUI.mm.zoom);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await c.wait(200);
  ok((await c.ev(() => window.__game.flow.scenes.run.hudUI.mm.zoom)) > z0, "wheel zooms the map");
  // 探索过半
  await c.ev(() => {
    const E = __game.run.explored;
    for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w / 2; x++) E.cells[y * E.w + x] = 1;
    E.stamp++;
    __game.run.mapModel.t = 0;
    const m = window.__game.flow.scenes.run.hudUI.mm;
    m.zoom = 1;
    m.center = { x: (m.b.x0 + m.b.x1) / 2, z: (m.b.z0 + m.b.z1) / 2 };
  });
  await c.wait(700);
  await icons();
  await page.mouse.move(5, 5);
  await c.shot("half");
  // 地图图标 v1（剪影意象，docs/ui/v2/png/map_icons_compare.png 甲）：图集已加载、图例是图标
  const mi = await c.ev(() => {
    const m = window.__game.flow.scenes.run.hudUI.mm, lis = [...document.querySelectorAll(".mk-bigmap2 .legend .li")];
    return { atlas: !!(m.atlas && m.atlas.naturalWidth), legend: lis.length, legendImg: lis.every((e) => /items_map\.webp/.test(e.style.backgroundImage)), src: /mi\("gate"|iconForMap/.test(String(m.drawIcons)) };
  });
  ok(mi.atlas && mi.legend >= 12 && mi.legendImg && mi.src, "map icons: atlas drawImage + legend icons", mi);
  ok(await c.ev(() => __game.run.mapModel.now.landmarks.size > 0), "landmarks revealed once inked", await c.ev(() => [...__game.run.mapModel.now.landmarks]));
  // 入夜
  await c.ev(() => (__game.run.t = __game.run.R.phases[2] + 3));
  await c.wait(500);
  tips = await icons();
  ok(tips.includes("妖潮来向") && /夜/.test(await c.ev(() => document.querySelector(".mk-bigmap2 .tod").textContent)), "night: 妖潮来向 + 夜 label");
  await c.shot("night");
  await page.keyboard.press("KeyM");
  await c.wait(400);
  {
    const r = await c.ev(() => { const cv = window.__game.flow.scenes.run.hudUI.mm.mirrorCv, b = cv.getBoundingClientRect(); return { x: b.left - 10, y: b.top - 10, w: b.width + 20, h: b.height + 40 }; });
    await c.shot("mirror", { clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h } });
  }
  ok(await c.ev(() => __game.run.mapModel.pins.length === 1), "pin kept for the mirror (同步铜镜)");
  // 跨局：地名写进存档，下一局开局就记得
  await c.ev(() => {
    __game.debug.extract();
  });
  await page.waitForFunction(() => __game.flow.name === "result", null, { timeout: 15000 });
  await c.ev(() => __game.flow.go("run", { region: "r1" }));
  await page.waitForFunction(() => __game.run && __game.run.state === "play", null, { timeout: 60000 });
  ok(await c.ev(() => __game.run.mapModel.old.landmarks.size > 0), "cross-run: landmarks remembered as 旧日所见", await c.ev(() => [...__game.run.mapModel.old.landmarks]));
  const errs = await c.ev(() => window.__errors);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
