// 洞府闭环测试（模块 C）：node tools/run.mjs loop_cave
// 在调试页 /src/game/cave/dev.html 上用测试存档跑：各站点能打开、炼化 → 修为 → 突破升层、鉴定、炼丹火候出丹、
// 炼器（装备、储物袋扩容）、药园移栽与手动采收、装备、化灵、参悟、练气九层 + 筑基丹 → 心魔劫 → 筑基一层、搬迁。
const results = [];
function check(name, ok, info = "") {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? "✔" : "✘"} ${name}${info ? "  " + info : ""}`);
}

// 其他模块在并行开发时改动文件会触发 Vite 整页刷新，测试中途的状态就丢了。
// 测试页把 Vite 客户端换成不连热更新的替身（只保留样式注入），页面只在本测试主动跳转时重载。
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
  const go = async (preset) => {
    await page.goto(`${base}/src/game/cave/dev.html?preset=${preset}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    // 第一次进洞府：场景在加载遮罩下分帧构建、预热，遮罩揭开才算进来了
    await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active && !document.querySelector(".cv-loading"), null, { timeout: 120000 });
    await c.wait(600);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const click = async (sel) => {
    await page.click(sel);
    await c.wait(150);
  };
  const P = () => ev(() => {
    const p = window.__cave.p;
    return { realm: p.realm.stage + ":" + p.realm.layer, xp: p.xp, stones: window.__cave.p.storage.count("spirit_stone"), fac: { ...p.cave.facilities }, bag: p.bagCapacity, pouch: p.pouch.capacity, region: p.cave.region };
  });

  // ---------- 1. 破洞府（fresh） ----------
  await go("fresh");
  await c.wait(1200);
  await c.shot("cave_fresh");
  check("进入洞府：药园独立，含内观阁共 7 个挂签", await ev(() => document.querySelectorAll(".cv-tag").length === 7 && !!document.querySelector('.cv-tag[data-st="loadout"]') && !!document.querySelector('.cv-tag[data-st="garden"]')));
  check("玄机子开场引导", await ev(() => window.__cave.ui.speech.shown > 0 && window.__cave.p.flags.caveTips.enter));

  // ---------- 2. 满仓存档 ----------
  await go("rich");
  // 多放几种可炼化的妖丹 / 灵物（10 种），检验灵泉那一排能完整看到
  await ev(() => {
    const g = window.__cdev.give, p = window.__cave.p;
    for (const n of ["狼王内丹", "石傀灵核", "藤妖内丹", "灵蚌珠", "水灵玉", "千年竹心", "千年何首乌"]) g(p, n, 1);
    g(p, "水灵玉", 1, { rarity: 2 }); // 宝品灵物：炼化 ×1.3
    window.__cave.changed({ silent: !0 });
  });
  await c.wait(800);
  await c.shot("cave_rich");
  // ---------- 挂签：默认隐藏，悬停 / 靠近时淡入；"今日可办"点一下走过去并打开 ----------
  await c.wait(400);
  check("挂签默认不可见", (await ev(() => document.querySelectorAll(".cv-tag.show").length)) === 0);
  await c.shot("tags_idle");
  const wsPt = await ev(() => {
    const cv = window.__cave, b = cv.scene.stationBoxes.workshop[0], cam = cv.ctx.camera; // 丹炉
    const v = b.getCenter(new cv.ctx.THREE.Vector3()).project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(wsPt.x, wsPt.y);
  await c.wait(500);
  check("悬停丹器房 → 挂签淡入", await ev(() => window.__cave.hover === "workshop" && document.querySelector('.cv-tag[data-st="workshop"]').classList.contains("show")), JSON.stringify(wsPt));
  await c.shot("tags_hover");
  await page.mouse.move(1260, 60);
  await c.wait(300);
  const nearOk = await ev(async () => {
    const cv = window.__cave, P = cv.ctx.player, s = cv.scene.stations.storage;
    P.pos.set(s.stand[0], cv.scene.height(s.stand[0], s.stand[1]), s.stand[1]);
    for (let k = 0; k < 15 && !(cv.near === "storage" && document.querySelector('.cv-tag[data-st="storage"]').classList.contains("show")); k++) await new Promise((r) => setTimeout(r, 100));
    const ok = cv.near === "storage" && document.querySelector('.cv-tag[data-st="storage"]').classList.contains("show") && document.querySelectorAll(".cv-tag.show").length === 1;
    if (!ok) console.log("near-dbg", cv.near, cv.hover, [...document.querySelectorAll(".cv-tag.show")].map((t) => t.dataset.st).join(","), P.pos.x.toFixed(2), P.pos.z.toFixed(2));
    P.pos.set(0, cv.scene.height(0, 5.2), 5.2);
    await new Promise((r) => setTimeout(r, 400));
    return ok;
  });
  check("靠近仓库 → 只有仓库挂签可见", nearOk);
  // 点击当前可见的炼丹待办；修为解锁后“材料已齐”可能排在升级项之前。
  const todo = await ev(() => {
    const rows = document.querySelectorAll(".cv-today .ink-row");
    const visible = window.__cave.F.todos(window.__cave.p).slice(0, rows.length);
    const index = visible.findIndex((t) => t.go.fac === "furnace");
    return index >= 0 ? { index, flash: visible[index].go.flash } : null;
  });
  check("今日可办中有可点击的炼丹事项", !!todo && todo.index >= 0);
  if (!todo || todo.index < 0) throw new Error("炼丹待办未出现在可见列表，检查 rich 夹具与待办排序");
  await ev((i) => document.querySelectorAll(".cv-today .ink-row")[i].click(), todo.index);
  await c.wait(700);
  check("点可办项 → 开始走路", await ev(() => !!window.__cave.walk && window.__cave.walk.fac === "furnace" && !window.__cave.ui.cur), "");
  await c.shot("todo_walking");
  await page.waitForSelector(".cv-page[data-id=workshop]", { timeout: 8000 });
  await c.wait(400);
  check("到达后打开对应页面并指明按钮", await ev((flash) => window.__cave.ui.tab === "alchemy" && !!document.querySelector(`[data-act="${flash}"].cv-flash`), todo.flash));
  await c.shot("todo_arrived");
  await click("[data-act=close]");
  // 走路可被移动键打断
  await ev(() => {
    const r = [...document.querySelectorAll(".cv-today .ink-row")].find((x) => x.dataset.fac === "storage" || x.dataset.fac === "spring");
    r.click();
  });
  await c.wait(300);
  await page.keyboard.down("KeyW");
  await c.wait(250);
  await page.keyboard.up("KeyW");
  await c.wait(1500);
  check("走路途中按移动键 → 打断，不开页面", await ev(() => !window.__cave.walk && !window.__cave.ui.cur));
  // 走到灵泉（点名牌 → 自动走过去 → 打开）
  await ev(() => window.__cave.goTo("spring"));
  await page.waitForSelector(".cv-page[data-id=spring]", { timeout: 8000 });
  await c.wait(900);
  check("灵泉面板（走过去后打开）", true);
  // 灵值 / 灵石 / 化灵引导：第一次打开灵泉时出现
  check("玄机子经济引导出现", await ev(() => !!document.querySelector(".cv-guide") && window.__cave.p.flags.caveTips.economy === !0));
  await c.shot("guide");
  // 灵泉对比：直接炼化 vs 化灵再炼化，数字与公式一致；更划算的一边标"宜"
  const cmp = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p;
    const per = F.stonesToXp(p, 1);
    return [...document.querySelectorAll(".cv-page .chip.cmp")].map((ch) => {
      const it = p.storage.items.find((x) => x.uid === ch.dataset.uid);
      const d = F.refineValue(p, it), s = F.huaLingStones(it), v = s * per;
      const best = v > d ? "hualing" : "refine";
      const txt = ch.textContent;
      const yiOn = ch.querySelector(best === "refine" ? "small.r .cv-yi" : "small.h .cv-yi");
      return { name: it.id, d, s, v, ok: +ch.dataset.direct === d && +ch.dataset.stones === s && +ch.dataset.via === v && txt.includes("+" + d) && txt.includes(s + "石≈" + v) && !!yiOn };
    });
  });
  check("灵泉对比数字与公式一致（含「宜」标记）", cmp.length > 0 && cmp.every((x) => x.ok), JSON.stringify(cmp.map((x) => `${x.name}:炼${x.d}/化${x.s}石≈${x.v}`)));
  check("化灵再炼化 ≤ 直接炼化（灵物）", cmp.every((x) => x.v <= x.d), "");
  // 灵物炼化按品质加成：修为 = xp × 数量 × treasureRarity[品质]（独立按数值表重算）
  const tr = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p;
    const it = p.storage.items.find((x) => x.id === "water_jade" && x.rarity === 2);
    const ch = document.querySelector(`.cv-page .chip.cmp[data-uid="${it.uid}"]`);
    return { rarity: it.rarity, n: it.n, xp: F.defOf(it).xp, direct: ch && +ch.dataset.direct, f: F.refineValue(p, it), mul: F.treasureMul(it) };
  });
  check("灵物炼化乘品质系数（宝品水灵玉 ×1.3）", tr.mul === [1, 1, 1.3, 1.7, 2.2][tr.rarity] && tr.direct === tr.f && tr.direct === Math.round(tr.xp * tr.n * tr.mul), JSON.stringify(tr));
  await click("[data-act=guide-ok]");
  await c.shot("spring");
  // 物品多时：右箭头出现，点到底后最后一件完整可见
  const sc = await ev(async () => {
    const box = document.querySelector(".cv-page .refine .chips"), r = document.querySelector("[data-act=chips-r]");
    const n = box.querySelectorAll(".chip").length, overflow = box.scrollWidth > box.clientWidth + 2, rOn = r.classList.contains("on");
    for (let k = 0; k < 6 && r.classList.contains("on"); k++) (r.click(), await new Promise((s) => setTimeout(s, 450)));
    const last = box.querySelector(".chip:last-child").getBoundingClientRect(), bb = box.getBoundingClientRect();
    return { n, overflow, rOn, lOn: document.querySelector("[data-act=chips-l]").classList.contains("on"), lastIn: last.right <= bb.right + 1 && last.left >= bb.left - 1 };
  });
  check("灵泉物品多时可横向滚动、最后一件完整可见", sc.n >= 8 && (!sc.overflow || (sc.rOn && sc.lOn && sc.lastIn)), JSON.stringify(sc));
  await c.shot("spring_many");
  // 灵气充盈：预览档位与公式一致
  const pv = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, el = document.querySelector(".cv-page .refine .buffpv");
    const need = p.xp + F.xpRoom(p), g = Math.min(cv.ui.refineGain, F.xpRoom(p));
    // 独立按表重算：比例 = 本次修为 ÷ 本层所需，取不超过它的最高一档
    let want = 0;
    F.LINGQI.tiers.forEach((t, i) => g / need >= t.ratio && (want = i + 1));
    return { tier: +el.dataset.tier, want, text: el.textContent, lb: !!document.querySelector(".cv-page .lp-foot .lb") };
  });
  check("灵泉页预览灵气充盈档位（与公式一致）+ 修为加成说明", pv.tier === pv.want && pv.text.includes("灵气充盈") && pv.lb, JSON.stringify(pv));
  await c.shot("buff_preview");
  // 炼化：灵石 + 一件灵物
  let before = await P();
  await ev(() => (window.__cave.fast = !0));
  await ev(() => {
    const r = document.querySelector(".cv-page .chip[data-uid]");
    r && r.click();
  });
  await click("[data-act=refine]");
  await page.waitForFunction((x) => window.__cave.p.xp > x, before.xp, { timeout: 8000 });
  await c.wait(250);
  await c.shot("buff_fx");
  const bf = await ev(() => { const cv = window.__cave, b = cv.F.currentBuff(cv.p); return { b, fx: !!document.querySelector(".cv-buff-fx"), dur: b && cv.F.LINGQI.tiers[b.tier - 1].sec }; });
  check("炼化后得灵气充盈（profile.buffs：id / tier 1–5 / remain / mods；演出）", bf.b && bf.b.id === "lingqi" && bf.b.tier >= 1 && bf.b.remain === bf.dur && Array.isArray(bf.b.mods) && bf.fx, JSON.stringify(bf));
  // 不叠加：低档炼化保留高档，时长取两者较大值
  const bf2 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, b = F.currentBuff(p), t0 = b.tier;
    b.remain = 10;
    F.applyLingqi(p, Math.ceil(F.LINGQI.tiers[0].ratio * 100), 100); // 一档
    return { t0, t1: b.tier, remain: b.remain, want: Math.max(10, F.LINGQI.tiers[0].sec), n: p.buffs.length };
  });
  check("灵气充盈不叠加：保留高档、时长取较大值", bf2.t1 === bf2.t0 && bf2.remain === bf2.want && bf2.n === 1, JSON.stringify(bf2));
  let after = await P();
  check("炼化：灵石 / 灵物 → 修为", after.xp > before.xp, `${before.xp} → ${after.xp}，灵石 ${before.stones} → ${after.stones}`);
  // 若修为未满，再炼一次（灵石足够）
  for (let k = 0; k < 4; k++) {
    if (await ev(() => !!document.querySelector("[data-act=break]:not(.is-disabled)"))) break;
    if (!(await ev(() => !!document.querySelector("[data-act=refine]")))) break;
    await click("[data-act=refine]");
    await c.wait(900);
  }
  before = await P();
  check("修为圆满 → 可突破", await ev(() => !!document.querySelector("[data-act=break]:not(.is-disabled)")), `修为 ${before.xp}`);
  await click("[data-act=break]");
  await page.waitForSelector(".cv-break", { timeout: 5000 });
  await c.wait(3200);
  await c.shot("break_layer");
  after = await P();
  check("小境界突破：升层 + 天机镜记忆", after.realm !== before.realm && (await ev(() => !!document.querySelector(".cv-mirror"))), `${before.realm} → ${after.realm}`);
  // 本层修为进度加成：修为过半时 heroStats 高于基础；突破史差值 = 两层基础属性之差
  const pb = await ev(() => {
    const F = window.__cave.F, r = { stage: 1, layer: 3 }, need = 220;
    const half = { realm: r, xp: need * 0.75 }, base = F.heroStats(half, { base: !0 }), cur = F.heroStats(half);
    return { up: cur.hp > base.hp && cur.atk >= base.atk, lb: F.layerBonus({ realm: r, xp: need * 0.75 }) };
  });
  check("修为过半时属性高于本层基础（常驻小加成）", pb.up && Object.keys(pb.lb).length > 0, JSON.stringify(pb.lb));
  const bh = await ev(() => {
    const cv = window.__cave, F = cv.F, H = cv.p.stats.breakHistory, e = H[H.length - 1];
    const want = F.statDiff(F.heroStatsAt(e.from), F.heroStatsAt(e.to));
    const legacy = H.filter((x) => x.legacy);
    const fieldsOk = e.day === cv.p.stats.runs + 1 && cv.p.stats.day === e.day && e.playTime === cv.p.playTime && e.xp > 0 && e.trial === null && e.base && e.base.hp === F.heroStatsAt(e.to).hp;
    return { n: H.length, legacy: legacy.length, legacyOk: legacy.every((x) => x.run === null && x.note === "旧事" && x.day === null && x.base), last: e, ok: fieldsOk && JSON.stringify(e.stats) === JSON.stringify(want) && e.run === cv.p.stats.runs && e.memory === "1:5" && e.to.layer === 5 };
  });
  check("突破史：旧存档补全（旧事）+ 本次突破一条，属性差值正确", bh.legacy === 3 && bh.legacyOk && bh.n === 4 && bh.ok, JSON.stringify({ n: bh.n, legacy: bh.legacy, stats: bh.last.stats, unlocks: bh.last.unlocks }));
  await click("[data-act=break-done]");
  await c.wait(300);

  // ---------- 3. 仓库：鉴定、装备、参悟、化灵、锦囊 ----------
  await ev(() => window.__cave.open("storage"));
  await page.waitForSelector(".cv-page[data-id=storage]");
  await c.wait(500);
  await c.shot("storage");
  check("仓库博古架：每件一个龛，龛大小 = 占格，灵石不上架", await ev(() => {
    const toks = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok")], n = window.__cave.p.storage.items.filter((x) => x.id !== "spirit_stone").length; // 灵石不上架
    return toks.length === n && document.querySelectorAll(".cv-page .bg-grid .niche").length === n && toks.every((t) => t._box === ({ 1: "1x1", 2: "2x1", 4: "2x2" }[window.__cave.F.defOf(t._inst).size || 1] || "1x1"));
  }));
  check("经济引导只出现一次（再开仓库不再出现）", await ev(() => !document.querySelector(".cv-guide")));
  // 单件化灵：按钮显示得灵石数，小字折算修为
  const hl1 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p;
    const it = p.storage.items.find((x) => x.id === "wolf_hide") || p.storage.items.find((x) => F.canHuaLing(x));
    document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${it.uid}"]`).click();
    const b = document.querySelector("[data-act=hualing1]"), n = document.querySelector(".cv-hl-note");
    const s = F.huaLingStones(it);
    return { s, btn: b && b.textContent, xp: n && +n.dataset.xp, want: F.stonesToXp(p, s), stoneIcon: !!(b && b.querySelector(".cv-st")) };
  });
  check("单件化灵显示得灵石与折算修为", hl1.btn && hl1.btn.includes(String(hl1.s)) && hl1.stoneIcon && hl1.xp === hl1.want, JSON.stringify(hl1));
  await c.wait(300);
  await c.shot("hualing_single");
  const unid = await ev(() => window.__cave.p.storage.items.find((i) => i.identified === !1)?.uid);
  await ev((u) => document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${u}"]`).click(), unid);
  await c.wait(200);
  await click("[data-act=identify]");
  check("鉴定未鉴定之物", await ev((u) => window.__cave.p.storage.items.find((i) => i.uid === u)?.identified === !0, unid));
  await c.shot("identify");
  await click("[data-act=equip]");
  check("装备法剑", await ev(() => !!window.__cave.p.equip.sword));
  // 参悟功法
  const scroll = await ev(() => window.__cave.p.storage.items.find((i) => (window.__cave.p.storage && i.id === "scroll_vine") || i.id.includes("vine"))?.uid);
  if (scroll) {
    await ev((u) => document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${u}"]`).click(), scroll);
    await click("[data-act=study]");
    await c.wait(300);
    await c.shot("study_toast");
    check("参悟提示带技能图标", await ev(() => !!document.querySelector(".cv-toasts .cv-toast-ico .mk-ico")));
    // 参悟后：新功法自动进空栏；提示上的"去装配"打开功法匣
    const ld = await ev(() => ({ btn: !!document.querySelector(".cv-toasts [data-act=go-loadout]"), inBuild: JSON.stringify(window.__cave.p.build).includes("vine") }));
    await c.shot("study_loadout_btn");
    await ev(() => document.querySelector(".cv-toasts [data-act=go-loadout]").click());
    await page.waitForSelector(".mk-inner");
    const ldOpen = await ev(() => !!__cave.ui.inner?.alive && __cave.ui.cur === "loadout");
    await c.shot("study_loadout_open");
    await page.locator('.mk-inner [data-id="back"]').click();
    await page.waitForFunction(() => !__cave.ui.cur && !__cave.locked);
    check("参悟后：功法进空栏、\"去装配\"打开内观阁", ld.btn && ld.inBuild && ldOpen, JSON.stringify({ ...ld, ldOpen }));
    check("参悟功法残卷", await ev(() => (window.__cave.p.flags.learned.spells || []).length > 0), JSON.stringify(await ev(() => window.__cave.p.flags.learned)));
    await ev(() => __cave.open("storage"));
    await page.waitForSelector(".cv-page .bg-grid");
  }
  // 锦囊
  const jn = await ev(() => window.__cave.p.storage.items.find((i) => i.id === "jinnang_lingsi")?.uid);
  if (jn) {
    await ev((u) => document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${u}"]`).click(), jn);
    await click("[data-act=use]");
    check("灵丝锦囊：贴身锦囊 → 2 格", (await P()).pouch === 2);
  }
  // 化灵：批量选两件草药
  before = await P();
  await click("[data-act=multi]");
  await ev(() => {
    const ids = window.__cave.p.storage.items.filter((i) => ["huichun_dan"].includes(i.id)).map((i) => i.uid);
    for (const u of ids.slice(0, 1)) document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${u}"]`).click();
  });
  await c.wait(200);
  // 批量化灵跳过关键物品（千年何首乌）并提示
  const key = await ev(async () => {
    const cv = window.__cave, F = cv.F, p = cv.p;
    const it = p.storage.items.find((x) => x.id === "heshouwu");
    const before = cv.ui.sel.picks.size;
    document.querySelector(`.cv-page .bg-grid .mk-tok[data-uid="${it.uid}"]`).click();
    await new Promise((r) => setTimeout(r, 150));
    const toast = [...document.querySelectorAll(".cv-toasts .ink-toast")].map((t) => t.textContent).join("|");
    return { stones: F.huaLingStones(it), can: F.canHuaLing(it), picked: cv.ui.sel.picks.has(it.uid), same: cv.ui.sel.picks.size === before, toast };
  });
  check("批量化灵跳过关键物品并提示", key.stones === 0 && !key.can && !key.picked && key.same && key.toast.includes("不可化灵"), JSON.stringify(key));
  const hlm = await ev(() => {
    const cv = window.__cave, F = cv.F;
    const picks = [...cv.ui.sel.picks];
    const n = document.querySelector(".cv-page .hl-n");
    return { want: F.huaLingValue(cv.p, picks), got: n && +n.textContent, icon: !!document.querySelector(".cv-page .bg-cap .cv-st") };
  });
  check("批量化灵显示得灵石数", hlm.want > 0 && hlm.got === hlm.want && hlm.icon, JSON.stringify(hlm));
  await c.shot("hualing");
  await click("[data-act=hualing]");
  after = await P();
  check("化灵 → 灵石入库", after.stones > before.stones, `${before.stones} → ${after.stones}`);
  await click("[data-act=close]");

  // ---------- 4. 丹器房：丹炉 / 炼器鼎按修为已解锁、炼丹火候、炼器、储物袋扩容、药园 ----------
  await ev(() => window.__cave.open("workshop"));
  await page.waitForSelector(".cv-page[data-id=workshop]");
  await c.wait(400);
  await c.shot("workshop_broken");
  check("练四旧存档进洞府：丹炉按修为已复燃（不用材料修复）", (await P()).fac.furnace === 1);
  await c.wait(300);
  await c.shot("alchemy");
  before = await ev(() => window.__cave.p.storage.count("huichun_dan"));
  await ev(() => {
    window.__cave.debug.alchemyTime = 4;
    window.__cave.debug.alchemyAuto = !0;
    document.querySelector(".cv-page [data-rec=huichun]")?.click();
  });
  await c.wait(200);
  await click("[data-act=brew]");
  await c.wait(1800);
  await c.shot("alchemy_fire");
  await page.waitForFunction(() => !window.__cave.ui.fire, null, { timeout: 12000 });
  const brew = await ev(() => window.__cave.ui.lastBrew);
  after = await ev(() => window.__cave.p.storage.count("huichun_dan"));
  check("火候小游戏完成 → 出丹", after > before && brew && brew.grade >= 0, `品质 ${brew && brew.grade}，回春丹 ${before} → ${after}`);
  await c.wait(300);
  await c.shot("alchemy_done");
  // 指定火候：温度固定在 0 → 废丹
  await ev(() => {
    window.__cave.debug.alchemyAuto = !1;
    window.__cave.debug.alchemyTemp = 0.02;
  });
  if (await ev(() => !!document.querySelector("[data-act=brew]:not(.is-disabled)"))) {
    await click("[data-act=brew]");
    await page.waitForFunction(() => !window.__cave.ui.fire, null, { timeout: 12000 });
    check("火候全偏 → 废丹", (await ev(() => window.__cave.ui.lastBrew.grade)) === -1);
  }
  await ev(() => (window.__cave.debug.alchemyTemp = null));
  // 炼器
  await ev(() => document.querySelector(".cv-page .ink-tab[data-tab=forge]").click());
  await c.wait(200);
  check("练四旧存档进洞府：炼器鼎按修为已可用（不用材料修复）", (await P()).fac.forge === 1);
  await c.wait(200);
  await c.shot("forge");
  before = await ev(() => window.__cave.p.storage.items.filter((i) => ["sword_qingfeng", "fajian"].includes(i.id)).length);
  await click("[data-act=craft-sword]");
  after = await ev(() => window.__cave.p.storage.items.filter((i) => ["sword_qingfeng", "fajian"].includes(i.id)).length);
  check("炼器：法剑", after > before);
  // 炼器品级只看主材料（第一项）：凡品铁精石 + 极品狼妖牙 → 至多灵品（炼器鼎一阶下限凡品，25% 再升一品）
  const fm = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, g = window.__cdev.give, r = F.recipes().forge.find((x) => x.id === "sword");
    const out = [];
    for (let k = 0; k < 6; k++) {
      g(p, "铁精石", 3, { rarity: 0 }); g(p, "狼妖牙", 2, { rarity: 4 }); g(p, "灵石", 50);
      const res = F.forgeCraft(p, r);
      if (res.ok) out.push(res.item.rarity || 0);
    }
    // 炼丹带宽 × herbBand[投入灵草最高品级]
    const al = F.recipes().alchemy.find((x) => x.id === "huichun");
    const b0 = F.alchemyBand(p, al, 0), b2 = F.alchemyBand(p, al, 2);
    return { out, band: +(b2 / b0).toFixed(3), want: F.RULES.herbBand[2] };
  });
  check("炼器品级只看主材料；炼丹带宽 × herbBand", fm.out.length === 6 && fm.out.every((r) => r <= 1) && fm.band === fm.want, JSON.stringify(fm));
  await ev(() => document.querySelector(".cv-page .ink-vtab[data-cat=upgrade]").click());
  await c.wait(200);
  await ev(() => document.querySelector(".cv-page [data-rec=bag24]")?.click());
  await c.wait(200);
  await c.shot("forge_upgrade");
  await click("[data-act=craft-bag24]");
  check("储物袋扩容 16 → 24", (await P()).bag === 24);
  // ---------- 重铸词条 ----------
  await ev(() => document.querySelector(".cv-page .ink-vtab[data-cat=reforge]").click());
  await c.wait(200);
  const rf0 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, sw = p.equip.sword, g = window.__cdev.give;
    g(p, "铁精石", 6); g(p, "灵玉", 4); g(p, "石傀心", 2); // 重铸另付的材料（REFORGE.items[品级]）
    document.querySelector(`.cv-page [data-rec="${sw.uid}"]`)?.click();
    return { uid: sw.uid, aff: JSON.stringify(sw.affixes), n: sw.affixes.length, stones: p.storage.count("spirit_stone"), cost: F.reforgeCost(sw, sw.affixes.find((a) => !a.base && F.affixReforgeable(a))) };
  });
  await c.wait(150);
  // 选这把剑上第一条可重铸的普通词条
  const idx = await ev(() => {
    const cv = window.__cave, F = cv.F, sw = cv.p.equip.sword, S = cv.ui.sel;
    S.rf = sw.uid;
    S.rfIdx = sw.affixes.findIndex((a) => F.affixReforgeable(a) && !F.isSpecialAffix(a));
    cv.ui.render();
    return S.rfIdx;
  });
  const rfDbg = await ev((i) => { const cv = window.__cave, S = cv.ui.sel; return { i, rf: S.rf === cv.p.equip.sword.uid, why: cv.F.canReforge(cv.p, cv.p.equip.sword, i).why || "ok", btn: document.querySelector("[data-act=reforge]").className }; }, idx);
  if (rfDbg.btn.includes("is-disabled")) console.log("reforge disabled", JSON.stringify(rfDbg), await ev(() => JSON.stringify(window.__cave.p.equip.sword)));
  await click("[data-act=reforge]");
  await page.waitForSelector(".rf-reveal", { timeout: 5000 });
  await c.wait(1300);
  await c.shot("reforge_reveal");
  const rf1 = await ev((idx) => {
    const cv = window.__cave, p = cv.p, sw = p.equip.sword, R = cv.ui.reforge;
    const others = sw.affixes.filter((a) => !a.base).map((a) => (a.stat === "special" ? "special:" + a.value : a.stat)); // 含被重铸的这条
    return { stones: p.storage.count("spirit_stone"), reforged: sw.reforged, neo: R && R.neo, dup: R && others.includes(R.neo.stat === "special" ? "special:" + R.neo.value : R.neo.stat), unchanged: JSON.stringify(sw.affixes) };
  }, idx);
  check("重铸：付灵石、次数 +1、新词条不与已有属性重复、不掷出附灵", rf1.stones === rf0.stones - rf0.cost.stones && rf1.reforged === 1 && rf1.neo && !String(rf1.neo.stat).startsWith("imbue_") && !rf1.dup && rf1.unchanged === rf0.aff, JSON.stringify({ cost: rf0.cost, neo: rf1.neo }));
  await click("[data-act=rf-accept]");
  const rf2 = await ev((idx) => {
    const cv = window.__cave, sw = cv.p.equip.sword;
    const R = cv.F.RULES.reforge;
    return { aff: sw.affixes[idx], cost: cv.F.reforgeCost(sw).stones, base: R.stones[sw.rarity || 0], g: R.growth, max: R.maxMul };
  }, idx);
  check("接受新词条 → 替换；下次价格 ×1.15（上限 ×4）", JSON.stringify(rf2.aff) === JSON.stringify(rf1.neo) && rf2.cost === Math.ceil(rf2.base * Math.min(rf2.g, rf2.max)), JSON.stringify(rf2));
  // 规则：凡品不能重铸、附灵不能重铸、心法类只换心法且 ×2、价格封顶 ×4
  const rules = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, sw = p.equip.sword;
    const fan = { id: sw.id, rarity: 0, affixes: [{ stat: "atk", type: "flat", value: 3 }], identified: !0 };
    const imb = { ...sw, affixes: [{ stat: "imbue_fire", type: "flat", value: 1 }] };
    const sp = { ...sw, rarity: 3, reforged: 0, affixes: [{ stat: "atk", type: "flat", value: 5 }, { stat: "special", type: "flag", value: "锋锐", xinfa: "sharp" }] };
    const cap = { ...sw, reforged: 40 };
    const R = F.RULES.reforge;
    return {
      fan: F.canReforge(p, fan, 0).ok, imbue: F.affixReforgeable(imb.affixes[0]),
      spCost: F.reforgeCost(sp, sp.affixes[1]).stones, spWant: Math.ceil(R.stones[3] * (R.special.costMul || 1)),
      capCost: F.reforgeCost(cap).stones, capWant: Math.ceil(R.stones[sw.rarity] * R.maxMul),
    };
  });
  check("重铸规则：凡品 / 附灵不可，心法 ×2，封顶 ×4", !rules.fan && !rules.imbue && rules.spCost === rules.spWant && rules.capCost === rules.capWant, JSON.stringify(rules));
  await ev((i) => document.querySelector(`.cv-page .rf-list .ink-row[data-aff="${i}"]`).click(), idx);
  await c.wait(150);
  const keepBefore = await ev(() => JSON.stringify(window.__cave.p.equip.sword.affixes));
  await click("[data-act=reforge]");
  await page.waitForSelector("[data-act=rf-keep]", { timeout: 5000 });
  await c.wait(1300);
  await click("[data-act=rf-keep]");
  check("保留原词条 → 词条不变、花费不退", await ev((k) => JSON.stringify(window.__cave.p.equip.sword.affixes) === k && window.__cave.p.equip.sword.reforged === 2, keepBefore));

  // ---------- 药园 v2：开局 1 块地、种植、出行后成长、升级提速、年份 = 品质 ----------
  await ev(() => window.__cave.open("garden"));
  await page.waitForSelector('.gy2-sheet [data-act="plant"]');
  await c.wait(300);
  const g0 = await ev(() => ({ lv: window.__cave.p.cave.facilities.garden, plots: window.__cave.F.gardenPlots(window.__cave.p).length, dom: document.querySelectorAll(".cv-page .gy2-plot").length, guide: !!document.querySelector(".cv-guide[data-guide=gardenIntro]") }));
  check("药园开局 1 块地（0 级可用）+ 灵土引导", g0.lv === 0 && g0.plots === 1 && g0.dom === 1 && g0.guide, JSON.stringify(g0));
  await click("[data-act=guide-ok]");
  await page.locator('.gy2-plot[data-plot="0"]').click();
  await c.wait(150);
  // 移栽宝品（百年）种子：真实点年份、分页和草苗，而非绕过新界面。
  const gardenSeed = await ev(() => window.__cave.p.storage.items.find((x) => x.id === "seed_ziteng" && x.rarity === 2).uid);
  await page.locator('[data-year="2"]').click();
  while (!(await page.locator(`[data-seed="${gardenSeed}"]`).count())) {
    if (await page.locator('[data-seed-page="next"]').isDisabled()) throw new Error("药园百年紫藤苗未出现在分页中");
    await page.locator('[data-seed-page="next"]').click();
  }
  await page.locator(`[data-seed="${gardenSeed}"]`).click();
  await page.locator('[data-act="plant"]').click();
  await c.wait(200);
  const g1 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, pl = p.cave.garden[0], st = F.plotState(p, pl), G = F.RULES.garden;
    return { rarity: pl.rarity, need: st.need, want: Math.ceil((pl.runs * G.yearRuns[2]) / G.growth[0]), label: document.querySelector(".cv-page .gy2-plot small").textContent };
  });
  check("年份种子：百年 · 宝品，所需出行 = ceil(基础 × 年份倍率 ÷ 生长)", g1.rarity === 2 && g1.need === g1.want && g1.label.includes("百年 · 宝品"), JSON.stringify(g1));
  await c.shot("garden");
  // 出行一次：长了一截但未熟
  await ev(() => {
    const cv = window.__cave;
    cv.ui.close();
    cv.p.stats.runs += 1;
    cv.changed();
  });
  const g2 = await ev(() => window.__cave.F.plotState(window.__cave.p, window.__cave.p.cave.garden[0]));
  check("出行后成长（阶段推进、剩余次数 −1）", g2.passed === 1 && g2.left === g1.need - 1, JSON.stringify({ stage: g2.stage, left: g2.left }));
  // 3D：开局 1 块地
  await ev(() => (window.__cave.ui.speech.clear(), (window.__cave.focus = { pos: window.__cave.scene.models.garden, center: !0, dist: 20 })));
  await c.wait(1800);
  await c.shot("garden3d_start");
  // 扩建：生长变快
  await ev(() => {
    const g = window.__cdev.give, p = window.__cave.p;
    g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50); g(p, "灵石", 50);
    g(p, "灵土", 20);
    window.__cave.focus = null;
    window.__cave.open("garden");
  });
  await c.wait(300);
  await click("[data-act=up-garden]");
  await page.locator('[data-act="up-garden-go"]').click();
  const g3 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, st = F.plotState(p, p.cave.garden[0]), G = F.RULES.garden;
    return { lv: p.cave.facilities.garden, plots: F.gardenPlots(p).length, need: st.need, want: Math.ceil((st.runs * G.yearRuns[2]) / G.growth[1]) };
  });
  check("扩建药园：地块增加、生长提速", g3.lv === 1 && g3.plots === 2 && g3.need === g3.want && g3.need <= g1.need, JSON.stringify(g3));
  // 再升一级（三阶要搬迁后才能升）；空地上施灵土移栽
  await c.wait(150);
  await click("[data-act=up-garden]");
  await page.locator('[data-act="up-garden-go"]').click();
  const g4 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, gv = window.__cdev.give;
    gv(p, "赤炎果苗", 1, { rarity: 3 });
    gv(p, "青灵草苗", 1, { rarity: 0 });
    const plots = F.gardenPlots(p), G = F.RULES.garden;
    const seed = p.storage.items.find((x) => x.id === "seed_chiyan" && x.rarity === 3);
    const lt0 = p.storage.count("ling_tu"), fc = F.fertCost(p, seed);
    const i1 = plots.findIndex((x) => !x);
    F.plant(p, i1, seed.uid, !0); // 仙品（三百年）种子 + 施灵土
    const st = F.plotState(p, p.cave.garden[i1]);
    const want = Math.ceil((st.runs * G.yearRuns[3]) / G.growth[2] / G.fertilize.mul);
    const i2 = F.gardenPlots(p).findIndex((x) => !x);
    const s0 = p.storage.items.find((x) => x.id === "seed_qingling" && (x.rarity || 0) === 0);
    if (i2 >= 0 && s0) F.plant(p, i2, s0.uid);
    p.stats.runs += 1; // 凡品青灵草一回就熟：画面上有成熟发光的
    cv.ui.close();
    cv.changed();
    return { lv: p.cave.facilities.garden, plots: F.gardenPlots(p).length, fert: { used: lt0 - p.storage.count("ling_tu"), n: fc.n, need: st.need, want }, planted: p.cave.garden.filter(Boolean).length };
  });
  check("药园二阶 3 块地；施灵土按年份扣量、生长 ×1.5", g4.lv === 2 && g4.plots === 3 && g4.planted === 3 && g4.fert.used === g4.fert.n && g4.fert.need === g4.fert.want, JSON.stringify(g4));
  await ev(() => (window.__cave.ui.speech.clear(), (window.__cave.focus = { pos: window.__cave.scene.models.garden, center: !0, dist: 20 })));
  await c.wait(1800);
  await c.shot("garden3d_mid");
  await ev(() => (window.__cave.focus = null));
  // ---------- 药园采收：成熟留在地里（身陨 / 撤离回府都一样），进园点"采收"才收 ----------
  const back = async (kind) =>
    ev(async (kind) => {
      const cv = window.__cave, p = cv.p, F = cv.F;
      const ripe0 = F.ripePlots(p).length;
      const herbs0 = p.storage.items.filter((x) => F.defOf(x).cat === "herb").reduce((n, x) => n + x.n, 0);
      cv.exit();
      if (kind === "death") p.stats.deaths = (p.stats.deaths || 0) + 1;
      else p.stats.extracted = (p.stats.extracted || 0) + 1;
      await cv.enter();
      await new Promise((r) => setTimeout(r, 600));
      const herbs1 = p.storage.items.filter((x) => F.defOf(x).cat === "herb").reduce((n, x) => n + x.n, 0);
      const todo = [...document.querySelectorAll(".cv-today .ink-row")].some((r) => r.textContent.includes("可采收"));
      return { ripe0, ripe1: F.ripePlots(p).length, sameStorage: herbs0 === herbs1, todo, said: !!document.querySelector(".cv-say") && document.querySelector(".cv-say").textContent.includes("药园有灵草熟了") };
    }, kind);
  const hd = await back("death");
  check("身陨回府：灵草仍在地里且已成熟，未自动入库；今日可办有采收项；玄机子提一句", hd.ripe0 > 0 && hd.ripe1 === hd.ripe0 && hd.sameStorage && hd.todo && hd.said, JSON.stringify(hd));
  await ev(() => (window.__cave.ui.speech.clear(), (window.__cave.focus = { pos: window.__cave.scene.models.garden, center: !0, dist: 16 })));
  await c.wait(1600);
  await c.shot("garden_ripe");
  await ev(() => (window.__cave.focus = null));
  // 走到药园按 F 打开，再在页内采收
  const hv0 = await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F, P = cv.ctx.player;
    P.pos.set(-7.0, cv.scene.height(-7.0, 3.9), 3.9);
    return F.ripePlots(p).map((i) => { const s = F.plotState(p, p.cave.garden[i]); return { i, herb: s.herb, r: s.rarity }; });
  });
  await c.wait(500);
  const hintOk = await ev(() => window.__cave.near === "garden" && document.querySelector(".cv-hint").textContent.includes("药园"));
  await ev(() => (window.__cave.focus = { pos: window.__cave.scene.models.garden, center: !0, dist: 16 }));
  await c.wait(1200);
  await page.keyboard.press("KeyF");
  await page.waitForSelector('.cv-page[data-id="garden"] [data-act="harvest-all"]', { timeout: 5000 });
  check("成熟时 F 打开独立药园，不自动采收", await ev((n) => window.__cave.ui.cur === "garden" && window.__cave.F.ripePlots(window.__cave.p).length === n, hv0.length));
  await click('.cv-page[data-id="garden"] [data-act="harvest-all"]');
  await c.wait(420);
  await c.shot("harvest_moment");
  await ev(() => (window.__cave.focus = null));
  const hv = await ev((hv0) => {
    const cv = window.__cave, p = cv.p, F = cv.F;
    const cleared = hv0.every((x) => !p.cave.garden[x.i]);
    const got = hv0.map((x) => p.storage.items.some((it) => F.defOf(it).name === x.herb && Math.abs((it.rarity || 0) - x.r) <= 1));
    return { cleared, got, floats: document.querySelectorAll(".cv-float").length };
  }, hv0);
  check("进园手动采收：进仓库（品质 = 种子品级 ±1）、地块清空、浮字", hintOk && hv0.length > 0 && hv.cleared && hv.got.every(Boolean) && hv.floats > 0, JSON.stringify({ hintOk, hv0, hv }));
  await page.locator('[data-act="garden-modal-close"]').click();
  await click('[data-act="close"]');
  // 撤离回府：同样留在地里；在药园页"采收"
  await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F, g = window.__cdev.give;
    g(p, "青灵草苗", 1, { rarity: 0 });
    const i = F.gardenPlots(p).findIndex((x) => !x);
    F.plant(p, i, p.storage.items.find((x) => x.id === "seed_qingling" && !(x.rarity || 0)).uid);
    p.stats.runs += 1;
    cv.changed();
  });
  const he = await back("extract");
  check("撤离回府：同样留在地里等采收", he.ripe0 > 0 && he.ripe1 === he.ripe0 && he.sameStorage && he.todo, JSON.stringify(he));
  await ev(() => window.__cave.open("garden"));
  await page.waitForSelector(".cv-page [data-act=harvest-all]", { timeout: 5000 });
  await c.wait(400);
  check("药园页：成熟地块显示\"已成熟 · 可采收\"", await ev(() => document.querySelector(".cv-page .gy2-plots").textContent.includes("已成熟 · 可采收")));
  await c.shot("garden_page_ripe");
  await click("[data-act=harvest-all]");
  check("药园页一键采收 → 地块清空", await ev(() => window.__cave.F.ripePlots(window.__cave.p).length === 0));
  await page.locator('[data-act="garden-modal-close"]').click();
  await click("[data-act=close]");
  await c.wait(800);
  await c.shot("cave_repaired");

  // ---------- 5. 出行台：搬迁 ----------
  await ev(() => {
    const p = window.__cave.p;
    p.realm = { stage: 1, layer: 5 };
    window.__cave.open("depart");
  });
  await page.waitForSelector(".cv-page[data-id=depart]");
  await c.wait(300);
  await c.shot("depart");
  await click("[data-act=relocate]");
  await click(".cv-modal [data-act=ok]");
  await c.wait(3200);
  after = await P();
  check("打包搬迁 → 溪谷灵脉", after.region === "r2" && after.fac.spring === 3, `region ${after.region} 灵泉 ${after.fac.spring}`);
  // 药园升满（三阶要搬迁后）：4 块 + 搬迁 1 块，种满不同年份
  const g5 = await ev(() => {
    const cv = window.__cave, F = cv.F, p = cv.p, gv = window.__cdev.give;
    for (let k = 0; k < 6; k++) gv(p, "灵石", 50);
    gv(p, "灵土", 12); gv(p, "寒露草", 4);
    const ok = F.upgrade(p, "garden");
    for (const [n, r] of [["凝露花苗", 1], ["寒露草苗", 2], ["紫藤苗", 4], ["青灵草苗", 0]]) gv(p, n, 1, { rarity: r });
    F.gardenPlots(p).forEach((pl, i) => {
      if (pl) return;
      const s = F.seeds(p)[0];
      if (s) F.plant(p, i, s.uid);
    });
    p.stats.runs += 1;
    cv.changed();
    return { ok, lv: p.cave.facilities.garden, plots: F.gardenPlots(p).length, planted: p.cave.garden.filter(Boolean).length, want: F.RULES.garden.plots[3] + F.RULES.garden.relocate };
  });
  check("药园升满（搬迁后三阶）：地块 = plots[3] + 搬迁 1", g5.ok && g5.lv === 3 && g5.plots === g5.want && g5.planted === g5.plots, JSON.stringify(g5));
  await ev(() => (window.__cave.ui.speech.clear(), (window.__cave.focus = { pos: window.__cave.scene.models.garden, center: !0, dist: 20 })));
  await c.wait(1800);
  await c.shot("garden3d_full");
  await ev(() => (window.__cave.focus = null));
  await c.wait(800);
  await c.shot("cave_r2");

  // ---------- 6. 练气九层 + 筑基丹 → 心魔劫 → 筑基 ----------
  await go("r9");
  await ev(() => window.__cave.open("spring"));
  await page.waitForSelector("[data-act=break]:not(.is-disabled)", { timeout: 5000 });
  await c.wait(900);
  await c.shot("spring_r9");
  await ev(() => (window.__cave.debug.xinmoHp = 600));
  await click("[data-act=break]");
  // 调整功法取消本次待渡劫确认；关阁后需回灵泉重新确认，不能留下过期渡劫。
  await page.waitForSelector(".cv-modal [data-act=trial-loadout]", { timeout: 5000 });
  await c.shot("trial_confirm");
  await click(".cv-modal [data-act=trial-loadout]");
  await page.waitForSelector(".mk-inner");
  const tl = await ev(() => !!__cave.ui.inner?.alive && !document.querySelector(".cv-modal") && !__cave.trial);
  await c.shot("trial_loadout");
  await page.locator('.mk-inner [data-id="back"]').click();
  await page.waitForFunction(() => !__cave.ui.cur && !__cave.locked);
  check("心魔劫前调整功法取消旧确认，关阁不自动开劫", tl && (await ev(() => !document.querySelector(".mk-inner,.cv-modal") && !__cave.trial)));
  await ev(() => __cave.open("spring"));
  await click("[data-act=break]");
  await page.waitForSelector(".cv-modal [data-act=ok]");
  await click(".cv-modal [data-act=ok]");
  await page.waitForFunction(() => !!window.__cave.trial && !!window.__cave.trial.e, null, { timeout: 5000 });
  check("心魔劫开始（倒影出场）", true);
  await c.wait(2500);
  await c.shot("xinmo");
  // 让主角对着倒影砍：每 0.4 秒朝向倒影按一次左键
  const t0 = Date.now();
  while (Date.now() - t0 < 40000 && (await ev(() => !!window.__cave.trial))) {
    await ev(() => {
      const cv = window.__cave, pl = cv.ctx.player, e = cv.trial && cv.trial.e;
      if (!e) return;
      pl.debug.god = !0;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      pl.facing.set(dx / d, 0, dz / d);
      cv.ctx.input.aim.set(e.pos.x, e.pos.y, e.pos.z);
      if (d > 2) pl.pos.set(pl.pos.x + (dx / d) * 0.5, pl.pos.y, pl.pos.z + (dz / d) * 0.5);
      if (pl.state === "move") pl.startAttack ? pl.startAttack() : (cv.ctx.input.mouse.leftPressed = !0);
    });
    await c.wait(250);
  }
  await page.waitForSelector(".cv-break", { timeout: 8000 });
  await c.wait(4500);
  await c.shot("break_zhuji");
  after = await P();
  const zj = await ev(() => { const H = window.__cave.p.stats.breakHistory, e = H[H.length - 1]; return { n: H.length, to: e.to, hp: e.stats.hp, grants: e.grants.length, mem: e.memory, trial: e.trial, xp: e.xp, base: !!e.base }; });
  check("筑基写入突破史（心魔劫一次通过、消耗修为、属性快照）", zj.to.stage === 2 && zj.hp > 0 && zj.mem === "2:1" && zj.n === 9 && zj.trial && zj.trial.id === "xinmo" && zj.trial.tries === 1 && zj.xp > 0 && zj.base, JSON.stringify(zj));
  check("心魔劫胜 → 筑基一层", after.realm === "2:1", `realm ${after.realm}，天机镜 ${JSON.stringify(await ev(() => window.__cave.p.flags.memories))}`);
  await click("[data-act=break-done]");

  const errs = await ev(() => window.__errors);
  check("无脚本错误", !errs.length, JSON.stringify(errs).slice(0, 400));
  const bad = results.filter((r) => !r.ok);
  console.log(`\n洞府测试：${results.length - bad.length}/${results.length} 通过`);
  if (bad.length) throw new Error("失败：" + bad.map((r) => r.name).join("；"));
}
