// 天机镜 v2（方案 A 圆镜 · 镜中屏）回归：node tools/run.mjs loop_mirror_v2
// 覆盖：3D 天机镜台（镜面竖屏、呼吸、未读朱点、筑基泥金）、三种打开方式（M / 走近按 F / 点击镜台自动走过去）、
//      今日可办的"天机镜"一行、境界录（历次：选中一条看详情浮签、旧事；总览）、相册（亮 / 暗、看一张）、行迹、
//      筑基前消息与拨号"无服务"、筑基后消息（发送中、回家线索、在舆图上标出）、已读后朱点与待办消失、合上后解锁。
// 截图：work/shots/loop_mirror_v2_{home,realm,total,album,msg_zhuji}.png
const results = [];
function check(name, ok, info = "") {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? "  " + info : ""}`);
}
const VITE_CLIENT_STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); s.setAttribute("data-vite-dev-id", id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

export default async function (page, c) {
  await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: VITE_CLIENT_STUB }));
  const base = page.url().replace(/\/(\?.*)?$/, "");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active, null, { timeout: 120000 });
  await c.wait(1200);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = async (sel) => {
    await page.click(sel);
    await c.wait(220);
  };
  const isOpen = () => ev(() => !!document.querySelector(".mv2") && !!(window.__cave.ui.mirror && window.__cave.ui.mirror.alive));
  const waitOpen = async () => {
    await page.waitForSelector(".mv2 .mv2-screen .mj-sb", { timeout: 8000 });
    await c.wait(600); // 进场动画
  };
  const waitClosed = async () => {
    await page.waitForFunction(() => !document.querySelector(".mv2") && !window.__cave._mirrorOpen, null, { timeout: 5000 });
    await c.wait(150);
  };
  const app = () => ev(() => window.__cave.ui.mirror && window.__cave.ui.mirror.S.app);

  // ---------- 1. 3D 天机镜台 ----------
  const m3 = await ev(async () => {
    const cv = window.__cave, sc = cv.scene, m = sc.groups.appraise && sc.groups.appraise.userData.mirror;
    if (!m) return { ok: !1 };
    const o = [];
    for (let k = 0; k < 8; k++) (o.push(m.scr.material.opacity), await new Promise((r) => setTimeout(r, 250)));
    return { ok: !0, station: !!sc.stations.mirror, box: (sc.stationBoxes.mirror || []).length, min: Math.min(...o), max: Math.max(...o), dot: m.dot.visible, shadow: m.scr.castShadow, tags: document.querySelectorAll(".cv-tag").length, tagMirror: !!document.querySelector('.cv-tag[data-st="mirror"]') };
  });
  check("3D 天机镜台：镜面竖屏 + 站点 + 悬停盒 + 挂签（含独立药园共 7 个）", m3.ok && m3.station && m3.box >= 1 && m3.tags === 7 && m3.tagMirror && !m3.shadow, JSON.stringify(m3));
  check("镜面呼吸：opacity 在变化", m3.max - m3.min > 0.01, `${m3.min.toFixed(3)} ~ ${m3.max.toFixed(3)}`);
  check("旧存档（只有旧事）没有未读：不亮朱点", !m3.dot);
  const fl = await ev(async () => {
    const sc = window.__cave.scene, m = sc.groups.appraise.userData.mirror;
    sc.mirrorFlash();
    await new Promise((r) => setTimeout(r, 450));
    return { o: m.scr.material.opacity, halo: m.halo.visible };
  });
  check("镜台亮屏：opacity 升到 ~0.6、微光出现", fl.o > 0.4 && fl.halo, JSON.stringify(fl));

  // ---------- 2. 打开方式一：按 M ----------
  await page.mouse.move(1260, 40);
  await page.keyboard.press("KeyM");
  await waitOpen();
  const o1 = await ev(() => ({ locked: window.__cave.locked, hud: getComputedStyle(window.__cave.ui.hud).display, nosvc: (document.querySelector(".mv2 .mj-sb .nosvc") || {}).textContent, from: getComputedStyle(document.querySelector(".mv2")).getPropertyValue("--dx") }));
  check("按 M 打开天机镜：主角锁定、洞府界面收起", (await isOpen()) && o1.locked && o1.hud === "none", JSON.stringify(o1));
  check("进场起点取自 3D 镜台的屏幕位置", !!o1.from && o1.from !== "0px", o1.from);
  check("筑基前状态栏：无服务", o1.nosvc === "无服务");
  check("默认主屏（无未读）", (await app()) === "home" && (await ev(() => document.querySelectorAll(".mv2 .mj-grid .mj-app").length)) === 5); // 境 忆 迹 舆 + 战报（首领界面 2026-11-17）
  await c.shot("home");
  await page.keyboard.press("KeyM");
  await waitClosed();
  check("再按 M 合上：界面移除、主角解锁", !(await isOpen()) && !(await ev(() => window.__cave.locked)));

  // ---------- 3. 打开方式二：走近按 F ----------
  const nearOk = await ev(async () => {
    const cv = window.__cave, P = cv.ctx.player, s = cv.scene.stations.mirror;
    P.pos.set(s.stand[0], cv.scene.height(s.stand[0], s.stand[1]), s.stand[1]);
    for (let k = 0; k < 20 && cv.near !== "mirror"; k++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    return { near: cv.near, tag: document.querySelector('.cv-tag[data-st="mirror"]').classList.contains("show"), hint: document.querySelector(".cv-hint") && document.querySelector(".cv-hint").textContent };
  });
  check("走近镜台：挂签与 F 提示出现", nearOk.near === "mirror" && nearOk.tag && /天机镜台/.test(nearOk.hint || ""), JSON.stringify(nearOk));
  check("第一次走近：玄机子说镜台的话", await ev(() => window.__cave.p.flags.caveTips.mirror === !0));
  await page.keyboard.press("KeyF");
  await waitOpen();
  check("按 F 打开天机镜", await isOpen());
  await page.keyboard.press("Escape"); // 主屏上 Esc = 合上
  await waitClosed();
  check("主屏上 Esc 合上", !(await isOpen()));

  // ---------- 4. 突破 → 未读 ----------
  await ev(async () => {
    const cv = window.__cave, p = cv.p;
    p.xp = cv.F.xpRoom(p) + p.xp;
    cv.breakthrough();
  });
  await page.waitForSelector("[data-act=break-done]", { timeout: 10000 });
  await c.wait(1700);
  await page.click("[data-act=break-done]");
  await c.wait(600);
  const un = await ev(() => {
    const cv = window.__cave, m = cv.scene.groups.appraise.userData.mirror;
    return { un: cv.F.mirrorUnread(cv.p), dot: m.dot.visible, row: [...document.querySelectorAll(".cv-today .ink-row")].map((r) => r.textContent).find((t) => t.includes("天机镜")) || null };
  });
  check("突破后：天机镜有未读（镜台朱点 + 今日可办一行）", un.un.realm === "1:5" && un.dot && !!un.row, JSON.stringify(un));

  // ---------- 5. 打开方式三：点击镜台（自动走过去）----------
  await ev(() => {
    const cv = window.__cave, P = cv.ctx.player;
    P.pos.set(0, cv.scene.height(0, 5.2), 5.2);
  });
  await c.wait(700);
  const pt = await ev(() => {
    const cv = window.__cave, b = cv.scene.stationBoxes.mirror[0], cam = cv.ctx.camera;
    const v = b.getCenter(new cv.ctx.THREE.Vector3()).project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(pt.x, pt.y);
  await c.wait(400);
  const hov = await ev(() => window.__cave.hover);
  await page.mouse.down();
  await c.wait(60);
  await page.mouse.up();
  await c.wait(300);
  const walking = await ev(() => window.__cave.walk && window.__cave.walk.id);
  check("点击镜台 → 自动走过去", hov === "mirror" && walking === "mirror", JSON.stringify({ pt, hov, walking }));
  await waitOpen();
  const o3 = await ev(() => {
    const cv = window.__cave, M = cv.ui.mirror, s = cv.scene.stations.mirror, P = cv.ctx.player;
    return { app: M.S.app, open: M.S.open, slip: (document.querySelector(".mv2 .slip[data-slip=entry]") || {}).dataset, d: Math.hypot(P.pos.x - s.stand[0], P.pos.z - s.stand[1]) };
  });
  check("走到后打开：有新突破 → 停在境界录并选中最新一条", o3.app === "realm" && o3.open === "1:5" && o3.slip && o3.slip.key === "1:5" && o3.d < 0.6, JSON.stringify(o3));

  // ---------- 6. 境界录 ----------
  const r1 = await ev(() => {
    const q = (s) => document.querySelector(".mv2 " + s);
    const rows = [...document.querySelectorAll(".mv2 .slip .mj-sr")].map((r) => r.querySelector(".k").textContent + ":" + r.querySelector(".a").textContent + "→" + r.querySelector(".b").textContent.replace(/[^\d.%]/g, "") + r.querySelector(".d").textContent);
    return {
      entries: document.querySelectorAll(".mv2 .mj-e").length, sel: (q(".mj-e.sel") || {}).dataset && q(".mj-e.sel").dataset.open, pend: !!q(".mj-pend"),
      rows, when: (q(".slip .when") || {}).textContent, gains: document.querySelectorAll(".mv2 .slip .gn").length, mem: !!q(".slip .mj-memc[data-mem='1:5']"), xjz: (q(".slip .mj-xjz") || {}).textContent,
      badge: !!q(".mj-app .dot"),
    };
  });
  check("境界录：下一层预告 + 4 条记录（3 条旧事 + 本次），最新选中", r1.pend && r1.entries === 4 && r1.sel === "1:5", JSON.stringify({ n: r1.entries, sel: r1.sel }));
  check("详情浮签：属性前→后与差值（气血 290→320 +30）", r1.rows.some((t) => t.startsWith("气血:290→320+30")), r1.rows.slice(0, 4).join(" | "));
  check("详情浮签：所得（丹药栏 ×3 / 玉佩栏 / 二段跳 / 竹海·溪谷）+ 那一夜的记忆 + 玄机子", r1.gains >= 4 && r1.mem && /溪谷那条灵脉/.test(r1.xjz || ""), JSON.stringify({ g: r1.gains, mem: r1.mem }));
  check("时间：第 N 次出行归来 · 入画第 N 日（缺数据显示 —）· 时辰", /第 3 次出行归来/.test(r1.when || "") && /入画第 (—|\d+) 日/.test(r1.when || "") && /时/.test(r1.when || ""), r1.when);
  await c.shot("realm");
  await click(".mv2 .mj-e[data-open='1:3']");
  const r2 = await ev(() => ({ key: document.querySelector(".mv2 .slip").dataset.key, when: document.querySelector(".mv2 .slip .when").textContent, sel: document.querySelector(".mv2 .mj-e.sel").dataset.open }));
  check("点另一条（旧事）→ 浮签换成那一条，时间写'旧事'", r2.key === "1:3" && r2.sel === "1:3" && /旧事/.test(r2.when), JSON.stringify(r2));
  // 总览
  await click(".mv2 [data-tab=total]");
  const t1 = await ev(() => ({
    rows: [...document.querySelectorAll(".mv2 .mj-tr")].map((r) => r.querySelector(".k").textContent + r.querySelector(".d").textContent),
    hero: (document.querySelector(".mv2 .mj-hero") || {}).textContent, slip: document.querySelector(".mv2 .slip") && document.querySelector(".mv2 .slip").dataset.slip,
    gains: document.querySelectorAll(".mv2 .slip .gn").length, dots: document.querySelectorAll(".mv2 .slip .mj-memdots button.lit").length,
  }));
  check("总览：练气一层 → 练气五层，气血 +120 等累计", t1.rows.includes("气血+120") && t1.rows.length >= 7 && /练气五层/.test(t1.hero || ""), t1.rows.join(" "));
  check("总览浮签：栏位与身法、所学、记忆点", t1.slip === "gains" && t1.gains >= 5 && t1.dots >= 1, JSON.stringify({ g: t1.gains, d: t1.dots }));
  await c.shot("total");

  // ---------- 7. 相册 ----------
  await click(".mv2 .mj-back");
  await click(".mv2 .mj-app[data-app=album]");
  const a1 = await ev(() => ({ lit: document.querySelectorAll(".mv2 .ph.lit").length, dark: document.querySelectorAll(".mv2 .ph.dark").length, mem: (() => { const p = window.__cave.p, O = ["1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7", "1:8", "1:9", "2:1"], cur = O.indexOf(p.realm.stage + ":" + p.realm.layer); return new Set([...p.flags.memories, ...p.stats.breakHistory.map((e) => e.memory).filter(Boolean), ...O.slice(0, cur + 1)]).size; })() }));
  check("相册：亮起的照片 = 已亮记忆（含旧事补记、不高于当前境界）数，其余模糊", a1.lit === a1.mem && a1.lit + a1.dark === 10, JSON.stringify(a1));
  const firstLit = await ev(() => document.querySelector(".mv2 .ph.lit").dataset.mem);
  await click(`.mv2 .ph[data-mem='${firstLit}']`);
  const a2 = await ev(() => ({ slip: document.querySelector(".mv2 .slip").dataset, t: (document.querySelector(".mv2 .slip .mj-mem .t") || {}).textContent, on: !!document.querySelector(".mv2 .ph.on") }));
  check("点一张照片 → 浮签显示那段记忆", a2.slip.slip === "mem" && a2.slip.key === firstLit && !!a2.t && a2.on, JSON.stringify(a2));
  await c.shot("album");
  await page.keyboard.press("Escape"); // 先关照片
  await page.keyboard.press("Escape"); // 回主屏
  await c.wait(200);
  check("Esc：相册 → 主屏", (await app()) === "home" && (await isOpen()));

  // ---------- 8. 行迹 ----------
  await click(".mv2 .mj-app[data-app=trail]");
  const tr = await ev(() => ({ big: [...document.querySelectorAll(".mv2 .mj-trail .big b")].map((b) => b.textContent), v: [...document.querySelectorAll(".mv2 .mj-trail .mj-row .v")].map((b) => b.textContent) }));
  check("行迹：出行次数来自存档，新字段缺失显示 —", tr.big[0] === "3" && tr.v.some((t) => t.includes("—")), JSON.stringify(tr));

  // ---------- 9. 筑基前：消息 / 拨号无服务 ----------
  await click(".mv2 .mj-back");
  const dock = await ev(() => [...document.querySelectorAll(".mv2 .mj-dock .mj-app")].map((b) => b.className.includes("off") + ":" + b.textContent));
  await click(".mv2 .mj-dock .mj-app[data-mtab=msg]");
  const ms = await ev(() => ({ inp: (document.querySelector(".mv2 .mj-msg .inp.off") || {}).textContent, out: !!document.querySelector(".mv2 .bb.out") }));
  await click(".mv2 [data-mtab=dial]");
  const dl = await ev(() => (document.querySelector(".mv2 .dialbtn.off") || {}).textContent);
  check("筑基前：消息 / 拨号图标暗、输入框与拨号都是'无服务'", dock.every((t) => t.startsWith("true")) && /无服务/.test(ms.inp || "") && !ms.out && dl === "无服务", JSON.stringify({ dock, ms, dl }));
  await click(".mv2 .keys [data-act=close]");
  await waitClosed();
  const rd = await ev(() => {
    const cv = window.__cave;
    return { un: cv.F.mirrorUnread(cv.p), dot: cv.scene.groups.appraise.userData.mirror.dot.visible, row: [...document.querySelectorAll(".cv-today .ink-row")].some((r) => r.textContent.includes("天机镜")), locked: cv.locked };
  });
  check("看过境界录后：未读、朱点、今日可办那一行都消失；合上后解锁", !rd.un.any && !rd.dot && !rd.row && !rd.locked, JSON.stringify(rd));

  // ---------- 10. 筑基后：消息 ----------
  await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F;
    const from = { stage: 1, layer: 9 }, to = { stage: 2, layer: 1 };
    p.realm = { ...from };
    const before = F.heroStatsAt(from);
    p.realm = { ...to };
    F.applyUnlocks ? F.applyUnlocks(p) : 0;
    p.flags.memories = ["1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7", "1:8", "1:9", "2:1"];
    F.recordBreak(p, { from, to, before, unlocks: [{ key: "pillSlots", value: 4 }, { key: "swordFly", value: !0 }], grants: [{ kind: "spells", id: "earth_shield", name: "土遁护体" }], memory: "2:1" });
    cv.changed({ silent: !0 });
  });
  await c.wait(400);
  const zj = await ev(() => {
    const cv = window.__cave, m = cv.scene.groups.appraise.userData.mirror;
    return { un: cv.F.mirrorUnread(cv.p), gold: m.scr.material.color.getHexString() };
  });
  check("筑基后：未读消息 + 镜台换泥金色", zj.un.msg && zj.gold === "f0d9a0", JSON.stringify(zj));
  await page.mouse.move(1260, 40);
  await page.keyboard.press("KeyM");
  await waitOpen();
  const mz = await ev(() => ({
    app: window.__cave.ui.mirror.S.app, gold: document.querySelector(".mv2").classList.contains("gold"), carrier: !!document.querySelector(".mv2 .mj-sb .carrier"),
    out: (document.querySelector(".mv2 .bb.out") || {}).textContent, clue: !!document.querySelector(".mv2 .mj-msg .clue .map"), unk: !!document.querySelector(".mv2 .mj-msg .unk"),
  }));
  check("筑基后按 M：直接停在消息，'妈，我很好。'发送中、黑风岭线索、墨州一格", mz.app === "msg" && mz.gold && mz.carrier && /妈，我很好。/.test(mz.out || "") && /发送中/.test(mz.out || "") && mz.clue && mz.unk, JSON.stringify(mz));
  await c.shot("msg_zhuji");
  await click(".mv2 [data-act=mark]");
  check("在舆图上标出 → 记下线索", await ev(() => !!window.__cave.p.flags.mirrorClue && !!document.querySelector(".mv2 .clue .done")));
  await click(".mv2 .mj-back");
  await click(".mv2 .mj-app[data-app=realm]");
  await click(".mv2 [data-tab=list]"); // 境界录记得上次停在"总览"
  const z2 = await ev(() => ({ first: document.querySelector(".mv2 .mj-e").dataset.open, gold: document.querySelector(".mv2 .mj-e").classList.contains("gold"), slipSeal: !!document.querySelector(".mv2 .slip .ink-seal.gold"), rows: document.querySelectorAll(".mv2 .slip .mj-sr").length }));
  check("筑基那一条在最上、泥金，浮签有筑基印与属性", z2.first === "2:1" && z2.gold && z2.slipSeal && z2.rows >= 8, JSON.stringify(z2));
  await page.keyboard.press("KeyM");
  await waitClosed();
  check("筑基后看过消息：未读清空", await ev(() => !window.__cave.F.mirrorUnread(window.__cave.p).any));

  // ---------- 11. 灵泉页里的"天机镜"按钮也打开同一个界面 ----------
  await ev(() => window.__cave.open("spring"));
  await page.waitForSelector(".cv-page[data-id=spring] [data-act=mirrors]", { timeout: 5000 });
  await c.wait(300);
  await page.click(".cv-page[data-id=spring] [data-act=mirrors]");
  await waitOpen();
  check("灵泉页的'天机镜'按钮 → 关掉灵泉页、打开天机镜", (await isOpen()) && (await ev(() => !window.__cave.ui.cur)));
  await page.keyboard.press("KeyM");
  await waitClosed();

  // ---------- 12. 性能（docs/性能优化_v1.md §7）：镜台每帧开销、打开时构建耗时与之后 1.5 秒内最长帧 ----------
  const pf = await ev(async () => {
    const cv = window.__cave, sc = cv.scene;
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) sc._mirrorTick(0.016);
    const tick = (performance.now() - t0) / 2000;
    const frames = [];
    let last = performance.now(), run = !0;
    const loop = () => { const n = performance.now(); frames.push(n - last); last = n; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const t1 = performance.now();
    const p = cv.openMirror();
    while (!(cv.ui.mirror && cv.ui.mirror.alive)) await new Promise((r) => setTimeout(r, 5));
    const build = performance.now() - t1;
    await new Promise((r) => setTimeout(r, 1500));
    run = !1;
    cv.ui.mirror.close();
    await p;
    return { tick, build, maxFrame: Math.max(...frames.slice(1)), nodes: 0 };
  });
  check("性能：镜台每帧 < 0.02ms；打开构建 < 80ms", pf.tick < 0.02 && pf.build < 80, JSON.stringify({ tick: pf.tick.toFixed(4) + "ms", build: pf.build.toFixed(1) + "ms", maxFrame: pf.maxFrame.toFixed(1) + "ms" }));

  const errs = [...errors, ...(await ev(() => window.__errors || []))];
  check("没有页面报错", errs.length === 0, errs.slice(0, 3).join(" | "));
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} 通过`);
  for (const r of bad) console.log("FAIL " + r.name + "  " + r.info);
}
