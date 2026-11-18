// 独立药园入口：node tools/run.mjs garden_station
// 保留原种收规则，覆盖空地/生长/成熟时 F、真实建筑点击、待办与旧入口兼容。
const check = (ok, name, info) => console.log(`${ok ? "PASS" : "FAIL"} ${name}${info === undefined ? "" : " " + JSON.stringify(info)}`);
export default async function (page, c) {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__ready && window.__cave?.active && !document.querySelector(".cv-loading"), null, { timeout: 120000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const waitOpen = async () => {
    await page.waitForSelector('.cv-page[data-id="garden"]');
    await c.wait(400);
    const guide = page.locator('.cv-page [data-act="guide-ok"]');
    if (await guide.count()) await guide.click();
  };
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !__cave.ui.cur && !__cave.locked && !__cave.ctx.hold3d);
  };
  const stand = async (id) => {
    await ev((id) => {
      const cv = __cave, s = cv.scene.stations[id];
      cv.ui.speech.clear();
      cv.ctx.player.pos.set(s.stand[0], cv.scene.height(...s.stand), s.stand[1]);
    }, id);
    await page.mouse.move(1200, 20);
    await page.waitForFunction((id) => __cave.near === id, id);
    await c.wait(200);
  };
  const before = await ev(() => {
    const cv = __cave;
    cv.p.cave.garden.fill(null);
    cv.p.cave.facilities.garden = 0;
    cv.changed();
    return { model: cv.scene.groups.garden.uuid, tags: document.querySelectorAll(".cv-tag").length, boxes: cv.scene.stationBoxes.garden?.length, position: cv.scene.models.garden.toArray() };
  });
  check(before.tags === 7 && before.boxes > 0, "药园有独立站点、挂签及点击包围盒，合计七站点", before);

  await stand("garden");
  check(await ev(() => document.querySelector(".cv-hint").textContent.includes("药园") && !document.querySelector(".cv-hint").textContent.includes("丹器房")), "空地靠近提示药园，不是丹器房");
  await page.keyboard.press("KeyF");
  await waitOpen();
  check(await ev(() => __cave.F.facLevel(__cave.p, "garden") === 0 && __cave.F.gardenPlots(__cave.p).length === 1 && document.querySelectorAll('.cv-page [data-act="close"]').length === 1), "零阶药园可直接打开，单地块、单返回入口");
  await c.shot("empty");
  await close();

  // 先以真实种植规则建立未成熟作物，不能靠改变渲染数据伪造状态。
  const planted = await ev(() => {
    const cv = __cave, p = cv.p, F = cv.F;
    __cdev.give(p, "青灵草苗", 1, { rarity: 2 });
    const seed = F.seeds(p).find((x) => x.id === "seed_qingling" && x.rarity === 2);
    const ok = F.plant(p, 0, seed.uid);
    cv.changed();
    return { ok, state: F.plotState(p, p.cave.garden[0]) };
  });
  check(planted.ok && !planted.state.ripe, "移栽沿用真实规则，作物尚未成熟", planted);
  await stand("garden");
  await page.keyboard.press("KeyF");
  await waitOpen();
  check(await ev(() => __cave.ui.cur === "garden" && !__cave.F.ripePlots(__cave.p).length), "生长中 F 同样打开药园");
  await close();

  const ripe = await ev(() => {
    const cv = __cave, p = cv.p, F = cv.F;
    p.stats.runs += F.plotState(p, p.cave.garden[0]).left;
    cv.changed();
    return { n: F.ripePlots(p).length, plant: JSON.stringify(p.cave.garden[0]), items: JSON.stringify(p.storage.items) };
  });
  await stand("garden");
  await page.keyboard.press("KeyF");
  await waitOpen();
  check(await ev((s) => __cave.F.ripePlots(__cave.p).length === s.n && JSON.stringify(__cave.p.cave.garden[0]) === s.plant && JSON.stringify(__cave.p.storage.items) === s.items, ripe), "成熟时 F 只开药园，不扣作物、不自动入库");
  await c.shot("ripe");
  await close();

  const todo = page.locator('.cv-today .ink-row[data-fac="garden"]').first();
  check((await todo.count()) === 1, "成熟待办属于独立药园");
  await todo.click();
  await waitOpen();
  check(await ev(() => __cave.ui.cur === "garden" && !!document.querySelector('[data-act="harvest-all"].cv-flash')), "点击成熟待办直达药园并标出采收");
  await page.locator('.cv-page[data-id="garden"] [data-act="harvest-all"]').click();
  check(await ev((items) => __cave.F.ripePlots(__cave.p).length === 0 && !__cave.p.cave.garden[0] && JSON.stringify(__cave.p.storage.items) !== items, ripe.items), "页面采收才清空地块并把产物入仓");
  check(await ev(() => document.querySelectorAll('.gy2-receipt-item').length > 0 && document.querySelector('.gy2-modal').textContent.includes('已收入仓库')), "真实采收展示非空入仓回执");
  await page.keyboard.press("Escape");
  check(await ev(() => __cave.ui.cur === 'garden' && !document.querySelector('.gy2-modal')), "第一次 Esc 只合上采收回执，药园仍打开");
  await close();

  // 靠近镜台仍应提示镜台，不被相邻药园抢占。
  await stand("mirror");
  check(await ev(() => __cave.near === "mirror" && document.querySelector(".cv-hint").textContent.includes("天机镜")), "邻近天机镜保持自己的交互优先级");

  // 真正移动鼠标到3D包围盒投影并点击，而不是直接调用 goTo 冒充建筑点击。
  await ev(() => { const cv = __cave; cv.ctx.player.pos.set(0, cv.scene.height(0, 5.2), 5.2); });
  await c.wait(1600);
  const point = await ev(() => {
    const cv = __cave, v = cv.scene.stationBoxes.garden[0].getCenter(new cv.ctx.THREE.Vector3());
    v.project(cv.ctx.camera || cv.ctx.rig.cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(point.x, point.y);
  await c.wait(300);
  check(await ev(() => __cave.hover === "garden"), "真实鼠标命中药园，不命中丹器房", point);
  await page.mouse.click(point.x, point.y);
  await waitOpen();
  check(await ev(() => __cave.ui.cur === "garden"), "点击药园建筑自动走近并打开药园");
  await close();

  await ev(() => __cave.open("workshop", "garden"));
  await waitOpen();
  check(await ev(() => __cave.ui.cur === "garden"), "旧 workshop/garden 深链接兼容重定向");
  await close();
  await ev(() => __cave.open("workshop", "alchemy"));
  await page.waitForSelector(".ws2-hdr");
  check(await ev(() => document.querySelectorAll(".ws2-hdr [data-tab]").length === 2 && !document.querySelector('.ws2-hdr [data-tab="garden"]')), "丹器房只保留炼丹、炼器");
  await close();
  check(await ev((s) => __cave.scene.groups.garden.uuid === s.model && JSON.stringify(__cave.scene.models.garden.toArray()) === JSON.stringify(s.position), before), "独立入口不重建或移动原药园模型");
  check(!errors.length, "无页面运行错误", errors);
}
