// 首领界面（UI 设计，boss_青牙_v2 §8 方向 A + 狼威条、§7 处决叠加层、天机镜战报）的可运行测试 + 截图。
//   node tools/run.mjs boss_ui "scene=run&region=r1&slot=5"
// A 段：真实青牙控制器（src/game/enemies/bosses/qingya.js）+ 真实流程（bossflow.js）：入场（boss:intro → boss:introStart）、一阶段威折（无处决提示）、
//       转阶段（无文字、无盾 → 土盾）、二阶段狼威回落、威折 → F 斩 → 威折处决（朱"斩"卡 boss:executeHit）、气竭 → F → 终结处决完整版、击败收起。
// B 段：模拟首领（假 enemy + window.__bv）覆盖真实战斗里不好稳定复现的状态：静止 0 写入、读条 / 打断、终结短版、ink.setPaperFade、
//       威折出伤事件丢失时的兜底、每帧写入频率。
// C 段：天机镜战报。截图 work/shots/boss_ui_<名>.png。
const ok = (v, name, extra) => console.log(`${v ? "PASS" : "FAIL"} ${name}${extra !== undefined ? " " + JSON.stringify(extra).slice(0, 400) : ""}`);
const VITE_CLIENT_STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); s.setAttribute("data-vite-dev-id", id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

export default async function (page, c) {
  const waitFor = async (fn, arg, ms = 8000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
      return !0;
    } catch {
      return !1;
    }
  };
  ok(await waitFor(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, 120000), "r1 run ready");
  await page.mouse.move(980, 560);
  ok(await c.ev(() => !!(__game.ctx.bossUI && __game.flow.scenes.run.hudUI.boss === __game.ctx.bossUI)), "BossUI 已由 RunHud 挂上（ctx.bossUI）");
  // 存档：前两次挑战（第 3 次进谷 → "第 3 次 · 上回削至 41%"），练气二层（看不清青牙 → "练气?"）；页面工具
  await c.ev(() => {
    const G = __game, w = G.world, E = G.ctx.enemies, P = G.profile;
    G.debug.realm(1, 2);
    G.player.debug.god = !0;
    delete P.flags.boss_qingya;
    delete P.flags.bossExec_qingya_final;
    delete P.flags.bossExec_qingya_break;
    delete P.flags.bossHint_qingya_poise; // 首次挑战的"折其威，可斩"
    P.flags.bossIntro_qingya = 1;
    P.stats.bossLog = P.stats.bossLog || {};
    P.stats.bossLog.qingya = { tries: 2, kills: 0, retreats: 1, deaths: 1, firstKill: null, best: { phase: 2, hpLeft: 0.41, realm: "1:3" }, fastest: null, execs: { break: 0, final: 0 },
      log: [{ run: 3, realm: "1:2", result: "death", phase: 1, hpLeft: 0.82, sec: 95 }, { run: 5, realm: "1:3", result: "retreat", phase: 2, hpLeft: 0.41, sec: 212 }] };
    G.run.nextWave = 1e9;
    const B = (window.__bt = { evs: [] });
    for (const n of ["boss:poiseGain", "boss:poiseNear", "boss:intro", "boss:introStart", "boss:phase", "boss:break", "boss:execPrompt", "boss:execute", "boss:executeHit", "boss:execEnd", "boss:defeated"])
      w.events.on(n, (d) => B.evs.push({ n, t: performance.now(), d: d ? { kind: d.kind, n: d.n, hint: d.hint, dur: d.dur, short: d.short, first: d.first, tries: d.tries, on: d.on, phase: d.phase, last: d.last } : null }));
    B.ev = (n) => B.evs.filter((x) => x.n === n);
    B.q = () => E.list.find((e) => e.type === "qingya" && e.alive);
    B.clearSt = (q) => { for (const id of [...q.entity.statuses.keys()]) w.removeStatus(q.entity, id); };
    B.hit = (base) => w.dealDamage(G.player.entity, B.q().entity, { base, noCrit: !0 });
    B.calm = () => {
      const q = B.q();
      for (const x of [...E.list]) if (x !== q && x !== B.fake) (E.bars.remove(x), x.dispose && x.dispose(), E.list.splice(E.list.indexOf(x), 1));
      if (q) E.bars.remove(q);
      G.player.entity.hp = G.player.entity.stats.get("hp");
      document.querySelectorAll(".mk-toasts > *").forEach((x) => x.remove());
      G.run.hint = "";
    };
    B.cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : null; };
    B.var = (sel, n) => { const el = document.querySelector(sel); return el ? el.style.getPropertyValue(n) : null; };
    B.has = (sel, cls) => { const el = document.querySelector(sel); return !!el && el.classList.contains(cls); };
    B.q3 = (v) => String(Math.round(Math.max(0, Math.min(1, v)) * 200) / 200);
    B.text = () => document.querySelector(".mk-layer-boss").innerText.replace(/\s+/g, "");
    // 头顶锚点的期望位置（与 BossUI._place 同一规则：头太靠上时压到首领条下方）
    B.head = (e) => {
      const v = e.headPos(new G.THREE.Vector3()).project(G.ctx.camera), s = Math.min(innerWidth / 1280, innerHeight / 720);
      const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(document.querySelector(".bx-prompt").style.transform) || [];
      return { dx: Math.abs(+m[1] - Math.max(60, Math.min(innerWidth - 60, ((v.x + 1) / 2) * innerWidth))), dy: Math.abs(+m[2] - Math.max(272 * s, ((1 - v.y) / 2) * innerHeight - 6)) };
    };
    B.mut = 0;
    new MutationObserver((l) => (B.mut += l.length)).observe(document.querySelector(".mk-layer-boss"), { attributes: !0, childList: !0, subtree: !0, characterData: !0 });
  });
  const shot = async (name) => {
    await c.ev(() => __bt.calm());
    await c.shot(name);
  };
  const EL = await c.ev(async () => (await import("/src/ui/loadout.js")).EL);
  const pts = await c.ev(() => {
    const b = __game.run.map.points.boss;
    return { x: b.pos.x, z: b.pos.z };
  });
  const tp = (x, z) => c.ev(([x, z]) => __game.player.spawn(x, z), [x, z]);

  // ================= A. 真实控制器 =================
  await tp(38, -26); // 谷里、触发圈外：首领生成、沉睡
  ok(await waitFor(() => !!__bt.q() && !!__bt.q().ctrl && __bt.q().ctrl.mode === "asleep", null, 20000), "青牙已生成（真实控制器，沉睡）");
  await c.wait(800);
  // ---------- A1 入场：流程 boss:intro + 控制器 boss:introStart（全字段）----------
  await tp(pts.x, pts.z + 6.5);
  ok(await waitFor(() => __bt.ev("boss:introStart").length > 0, null, 5000), "进圈 → boss:intro + boss:introStart", await c.ev(() => __bt.evs.map((x) => x.n)));
  await c.wait(1500);
  const it = await c.ev(() => ({
    intro: __bt.ev("boss:introStart")[0].d,
    plays: __game.ctx.bossUI.stats.intros,
    bar: __bt.has(".bx-bar", "on"), fight: document.body.classList.contains("mk-bossfight"), tod: __bt.cs(".mk-layer-runhud .mk-tod", "opacity"),
    card: document.querySelector(".bx-intro").textContent.replace(/\s+/g, " "), cardOp: +__bt.cs(".bx-intro", "opacity"),
    hint: document.querySelector(".bx-intro .k").textContent, hintEv: __bt.ev("boss:introStart")[0].d.hint,
    name: document.querySelector(".bx-head .nm").textContent, rl: document.querySelector(".bx-head .rl").textContent,
  }));
  ok(it.plays === 1, "两条入场事件只播一次", it.plays);
  ok(it.bar && it.fight && +it.tod < 0.05, "首领条出现、天时条收起", it);
  ok(/第 3 次 · 上回削至 41%/.test(it.card) && /狼谷之主 · 练气\?/.test(it.card) && it.cardOp > 0.5, "入场题签：第 N 次 · 上回削至 X%（introStart.last）+ 境界标签", it.card);
  ok(it.name === "青牙" && it.rl === "练气?", "名牌 · 境界（练气二层看不清）", it);
  ok(it.hintEv === "折其威，可斩" && it.hint === "折其威，可斩", "首次挑战：题签下多一行 折其威，可斩", { ev: it.hintEv, card: it.hint });
  await shot("intro");
  // ---------- A2 一阶段：首领条读真实 view ----------
  ok(await waitFor(() => __bt.q().ctrl.mode === "fight", null, 6000), "入场结束 → fight");
  await c.wait(300);
  const a2 = await c.ev(() => {
    const v = __bt.q().ctrl.view();
    return { want: __bt.q3(v.hp / v.hpMax), v: __bt.var(".bx-hp", "--v"), shv: __bt.q3(v.shield.hp / v.shield.max), s: __bt.var(".bx-sh", "--s"), shc: document.querySelector(".bx-bar").style.getPropertyValue("--shc"), el: document.querySelector(".bx-eseal").textContent, head: document.querySelector(".bx-head").textContent.replace(/\s+/g, "") };
  });
  ok(a2.v === a2.want && a2.s === a2.shv && a2.shc === EL.wood.c && a2.el === "木" && a2.head === "青牙狼谷之主练气?", "一阶段：气血 / 木盾（技能栏五行色）读自 ctrl.view()；条上没有阶段字", a2);
  // ---------- 狼威可读性：大额上涨亮一截 + 条尾来源小字；小额只长不出字；过 75% 泛朱呼吸 ----------
  await waitFor(() => +getComputedStyle(document.querySelector(".bx-intro")).opacity < 0.05, null, 4000); // 题签淡出后再测 / 截
  const g1 = await c.ev(async () => {
    const C = __bt.q().ctrl, n0 = __bt.ev("boss:poiseGain").length;
    C.poise = 10;
    C.addPoise(30, "crash");
    await new Promise((r) => setTimeout(r, 200));
    const out = { ev: __bt.ev("boss:poiseGain").slice(n0).map((x) => x.d), pg: document.querySelector(".bx-pg").textContent, pgOp: +__bt.cs(".bx-pg", "opacity"), gn: __bt.has(".bx-po .gn", "go"), gnOp: +__bt.cs(".bx-po .gn", "opacity"), pa: __bt.var(".bx-po .gn", "--pa"), pb: __bt.var(".bx-po .gn", "--pb") };
    return out;
  });
  ok(g1.ev.length === 1 && g1.ev[0].kind === "crash" && g1.ev[0].n >= 8 && g1.pg === "撞" && g1.pgOp > 0.5 && g1.gn && g1.gnOp > 0.5 && +g1.pb > +g1.pa, "撞柱 +30：新涨那段先亮 + 条尾浮撞", g1);
  await shot("poise_gain");
  await c.wait(900);
  const g2 = await c.ev(async () => {
    const C = __bt.q().ctrl, U = __game.ctx.bossUI, last = U.lastGain;
    C.addPoise(1.5, "basic");
    await new Promise((r) => setTimeout(r, 60));
    return { same: U.lastGain === last, pgOp: +__bt.cs(".bx-pg", "opacity"), gnOp: +__bt.cs(".bx-po .gn", "opacity") };
  });
  ok(g2.same && g2.pgOp < 0.05 && g2.gnOp < 0.05, "普攻小额：墨痕正常长，不亮、不出字", g2);
  const g3 = await c.ev(async () => {
    const C = __bt.q().ctrl;
    C.addPoise(C.poiseMax * 0.8 - C.poise, "interrupt");
    await new Promise((r) => setTimeout(r, 700));
    return { near: __bt.has(".bx-po", "near"), ev: __bt.ev("boss:poiseNear").slice(-1)[0], anim: getComputedStyle(document.querySelector(".bx-po > i"), "::before").animationName, pg: document.querySelector(".bx-pg").textContent };
  });
  ok(g3.near && g3.ev && g3.ev.d.on && g3.anim === "bxNear" && g3.pg === "断", "过 75%：poiseNear on → 狼威泛朱呼吸；打断出断", g3);
  await shot("poise_near");
  // 一阶段威折：断开 + 折，但没有处决提示
  await c.ev(() => {
    const q = __bt.q(), C = q.ctrl;
    C.poise = C.poiseMax - 1;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
  });
  await c.wait(250);
  const a2b = await c.ev(() => ({ broken: __bt.q().ctrl.broken, brk: __bt.has(".bx-po", "brk"), zhe: __bt.has(".bx-bar", "brk"), zheAnim: __bt.cs(".bx-zhe", "animationName"), zheW: parseFloat(__bt.cs(".bx-zhe", "width")), zheOp: +__bt.cs(".bx-zhe", "opacity"), near: __bt.has(".bx-po", "near"), prompt: __bt.has(".bx-prompt", "on") }));
  ok(a2b.broken && a2b.brk && a2b.zhe && !a2b.prompt, "一阶段威折：狼威断开 + 折，无处决提示", a2b);
  ok(a2b.zheAnim === "bxStampBig" && a2b.zheW >= 38 && a2b.zheOp > 0.9 && !a2b.near, "折印放大盖下（40px）、轻震；威折时 near 呼吸收起", a2b);
  await c.wait(1500);
  ok(await c.ev(() => __bt.q().ctrl.broken && +__bt.cs(".bx-zhe", "opacity") > 0.9), "倒地期间折印一直在");
  await waitFor(() => +getComputedStyle(document.querySelector(".bx-intro")).opacity < 0.05, null, 4000); // 题签淡出后再截
  await shot("p1");
  // ---------- A3 转阶段：只有黑边、没有文字；转阶段期间无盾 → 土盾 ----------
  const txt0 = await c.ev(() => __bt.text());
  await c.ev(() => {
    const q = __bt.q();
    if (q.ctrl.broken) q.ctrl.endBreak();
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __bt.clearSt(q);
    q.entity.hp = q.entity.stats.get("hp") * 0.49;
  });
  ok(await waitFor(() => __bt.q().ctrl.mode === "transition", null, 4000), "转阶段开始（真实控制器）");
  await c.wait(1200);
  const a3 = await c.ev(() => ({ lb: __bt.has(".mk-layer-boss", "lb"), sh: __bt.has(".bx-bar", "sh"), banner: !!document.querySelector(".bx-banner"), txt: __bt.text(), ph: __bt.ev("boss:phase").slice(-1)[0].d }));
  ok(a3.lb && !a3.sh && a3.ph.dur === 3.6, "转阶段：演出黑边；无盾时护盾一笔收起", a3);
  ok(!a3.banner && !/二|啸月|阶段/.test(a3.txt), "转阶段不弹横幅、不出现阶段文字", { txt: a3.txt, txt0 });
  await c.shot("transition");
  ok(await waitFor(() => __bt.q().ctrl.mode === "fight", null, 6000), "转阶段结束 → fight");
  await c.wait(400);
  const a3b = await c.ev(() => ({ sh: __bt.has(".bx-bar", "sh"), shc: document.querySelector(".bx-bar").style.getPropertyValue("--shc"), el: document.querySelector(".bx-eseal").textContent, lb: __bt.has(".mk-layer-boss", "lb"), txt: __bt.text() }));
  ok(a3b.sh && a3b.shc === EL.earth.c && a3b.el === "土" && !a3b.lb && !/二|啸月|阶段/.test(a3b.txt), "二阶段：土盾一笔、黑边退出，仍无阶段字", a3b);
  await shot("phase2");
  // 二阶段狼威回落
  await c.ev(() => {
    const C = __bt.q().ctrl;
    C.poise = 78;
    C.lastGain = C.time - 10;
  });
  await c.wait(250);
  const a3c = await c.ev(() => ({ fall: __bt.has(".bx-po", "fall"), p: +__bt.var(".bx-po", "--p") }));
  ok(a3c.fall && a3c.p > 0.6 && a3c.p <= 0.78, "二阶段：狼威回落变淡", a3c);
  await shot("p2");
  // ---------- A4 二阶段威折 → F 斩 → 威折处决 ----------
  await c.ev(() => {
    const q = __bt.q(), C = q.ctrl, P = __game.player;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    C.moonCd = 999;
    q.state = "chase";
    __bt.clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __bt.clearSt(q);
    q.entity.stats.removeSource("shieldBreak");
    P.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
    C.poise = C.poiseMax - 1;
    __game.world.events.emit("player:perfectDodge", { attacker: q.entity });
  });
  await c.wait(400);
  const a4 = await c.ev(() => {
    const q = __bt.q(), v = q.ctrl.view();
    return { down: v.down, on: __bt.has(".bx-prompt", "on"), why: document.querySelector(".bx-prompt .why").textContent, go: document.querySelector(".bx-prompt .go").textContent, pulse: getComputedStyle(document.querySelector(".bx-prompt .key")).animationName, keyW: parseFloat(getComputedStyle(document.querySelector(".bx-prompt .key")).width), k: +__bt.var(".bx-prompt .ring", "--k"), want: v.downLeft / v.downDur, ...__bt.head(q) };
  });
  ok(a4.down === "break" && a4.on && a4.why === "威折 · 背甲可斩" && Math.abs(a4.k - a4.want) < 0.05, "二阶段威折：F 斩提示 + 圆相 = downLeft / downDur", a4);
  ok(a4.go === "近前按 F" && a4.pulse === "bxPulse" && a4.keyW >= 46, "F 斩：印更大（48px）、节奏脉动、下面一行 近前按 F", a4);
  ok(a4.dx < 6 && a4.dy < 6, // 首领在动（呼吸 / 伏地起伏），读位置与写位置差一帧
    "F 斩锚在青牙头顶（头太靠上时压到首领条下方）", a4);
  await shot("break_prompt");
  await page.keyboard.press("KeyF");
  ok(await waitFor(() => __bt.ev("boss:execute").length > 0, null, 3000), "F → boss:execute（威折）");
  await c.wait(350);
  const a4b = await c.ev(() => ({ cls: document.querySelector(".bx-exec").className, z: +__bt.cs(".bx-exec .rzhan", "opacity"), prompt: __bt.has(".bx-prompt", "on"), bar: +__bt.cs(".bx-bar", "opacity") }));
  ok(/on break/.test(a4b.cls) && !/hit/.test(a4b.cls) && a4b.z < 0.05 && !a4b.prompt, "出伤前：叠加层就位、朱斩未出、提示收起", a4b);
  ok(await waitFor(() => __bt.ev("boss:executeHit").length > 0, null, 3000), "boss:executeHit（剑插入出伤）");
  await c.wait(200);
  const a4c = await c.ev(() => ({ cls: document.querySelector(".bx-exec").className, z: +__bt.cs(".bx-exec .rzhan", "opacity"), dt: __bt.ev("boss:executeHit")[0].t - __bt.ev("boss:execute")[0].t }));
  ok(/hit/.test(a4c.cls) && a4c.z > 0.9, "出伤那一刻朱色斩一笔扫出（卡 boss:executeHit）", a4c);
  await c.shot("break_exec");
  ok(await waitFor(() => __bt.ev("boss:execEnd").length > 0, null, 4000), "威折处决结束 boss:execEnd");
  await c.wait(600);
  const a4d = await c.ev(() => ({ cls: document.querySelector(".bx-exec").className, bar: +__bt.cs(".bx-bar", "opacity") }));
  ok(a4d.cls === "bx-exec" && a4d.bar > 0.9, "execEnd：叠加层收掉、首领条回来", a4d);
  // ---------- A5 气竭 → 终结处决（首次完整 4 秒） ----------
  await c.ev(() => {
    const q = __bt.q(), C = q.ctrl;
    q.atk && q.endAttack(!0);
    C.moonLeap = null;
    C.moonCd = 999;
    q.state = "chase";
    __bt.clearSt(q);
    if (q.entity.shield && q.entity.shield.hp > 0) __game.ctx.shields.breakShield(q.entity);
    __bt.clearSt(q);
    q.entity.stats.removeSource("shieldBreak");
    __bt.hit(q.entity.hp * 3 + 2000);
  });
  await c.wait(300);
  await c.ev(() => {
    const q = __bt.q();
    __game.player.spawn(q.pos.x, q.pos.z + q.entity.radius + 1.2);
  });
  await c.wait(300);
  const a5 = await c.ev(() => ({ mode: __bt.q().ctrl.mode, on: __bt.has(".bx-prompt", "on"), why: document.querySelector(".bx-prompt .why").textContent }));
  ok(a5.mode === "final" && a5.on && a5.why === "气竭 · 终结", "气竭：终结提示", a5);
  await shot("final_prompt");
  const nEx = await c.ev(() => __bt.ev("boss:execute").length);
  await page.keyboard.press("KeyF");
  ok(await waitFor((n) => __bt.ev("boss:execute").length > n, nEx, 3000), "F → boss:execute（终结）");
  const fe = await c.ev(() => __bt.ev("boss:execute").slice(-1)[0]);
  ok(fe.d.kind === "final" && fe.d.dur === 4 && !fe.d.short, "首次终结：完整 4 秒", fe.d);
  await c.wait(Math.max(0, 1000 - 60));
  const f1 = await c.ev(() => ({ paper: +__bt.cs(".bx-exec .paper", "opacity"), disp: __bt.cs(".bx-exec .paper", "display"), stroke: +__bt.cs(".bx-exec .stroke", "opacity"), zhan: +__bt.cs(".bx-exec .zhan", "opacity"), lb: __bt.has(".mk-layer-boss", "lb"), ink: typeof __game.ctx.ink.setPaperFade }));
  ok((f1.ink === "function" ? f1.disp === "none" : f1.paper > 0.5) && f1.stroke < 0.1 && f1.zhan < 0.1 && !f1.lb, "终结 1.0 秒：留白已起（纸层或 ink.setPaperFade）、一笔未落、无黑边", f1);
  await c.shot("final_paper");
  await c.ev((t0) => new Promise((r) => setTimeout(r, Math.max(0, t0 + 2250 - performance.now()))), fe.t);
  const f2 = await c.ev(() => ({ stroke: +__bt.cs(".bx-exec .stroke", "opacity"), zhan: +__bt.cs(".bx-exec .zhan", "opacity"), yin: +__bt.cs(".bx-exec .yin", "opacity"), seal: document.querySelector(".bx-exec .yin").textContent, quiet: document.body.classList.contains("mk-bossexec") }));
  ok(f2.stroke > 0.9 && f2.zhan > 0.8 && f2.yin > 0.9 && f2.seal === "青牙伏诛" && f2.quiet, "终结 2.2 秒：一笔 · 斩 · 朱印青牙伏诛；通知 / 提示条收起", f2);
  await c.shot("final");
  ok(await waitFor(() => __bt.ev("boss:defeated").length > 0, null, 6000), "boss:defeated");
  await c.wait(3500);
  const df = await c.ev(() => ({ exec: document.querySelector(".bx-exec").className, bar: __bt.has(".bx-bar", "on"), fight: document.body.classList.contains("mk-bossfight"), quiet: document.body.classList.contains("mk-bossexec"), tod: getComputedStyle(document.querySelector(".mk-layer-runhud .mk-tod")).opacity }));
  ok(df.exec === "bx-exec" && !df.bar && !df.fight && !df.quiet, "击败后：叠加层收掉、首领条收起、天时条回来", df);

  // ================= B. 模拟首领（稳定复现的状态） =================
  await tp(pts.x - 10, pts.z + 8); // 离开首领出口（免得"撤 · Boss 出口"提示进截图）
  await c.wait(400);
  await c.ev(() => {
    const G = __game, p = G.player.pos;
    const pos = new G.THREE.Vector3(p.x, p.y, p.z - 5);
    window.__bv = { phase: 1, mode: "fight", hp: 15000, hpMax: 15000, shield: { el: "wood", hp: 930, max: 1500 }, poise: 34, poiseMax: 100, poiseFalling: !1, broken: !1, down: null, downLeft: 0, downDur: 0, channel: null };
    __bt.fake = { alive: !0, def: { boss: "qingya" }, pos, headPos: (v) => v.set(pos.x, pos.y + 3.2, pos.z), ctrl: { view: () => window.__bv } };
    __bt.emit = (k, d) => G.world.events.emit(k, { id: "qingya", enemy: __bt.fake, ...d });
    __bt.set = (o) => Object.assign(window.__bv, o);
    __bt.emit("boss:introStart", { first: !1, tries: 4, last: { phase: 2, hpLeft: 0 }, dur: 1.2, short: !0 });
  });
  const S = (o) => c.ev((o) => __bt.set(o), o);
  const emit = (k, d = {}) => c.ev(([k, d]) => __bt.emit(k, d), [k, d]);
  await c.wait(1500);
  ok(await c.ev(() => /上回已斩/.test(document.querySelector(".bx-intro").textContent)), "题签：上一次斩下 → 上回已斩");
  ok(await c.ev(() => document.querySelector(".bx-intro .k").textContent === "" && getComputedStyle(document.querySelector(".bx-intro .k")).display === "none" && __game.profile.flags.bossHint_qingya_poise === 1), "提示只出一次：之后的入场没有 折其威，可斩");
  await c.wait(2500);
  const w0 = await c.ev(() => ({ w: __game.ctx.bossUI.stats.writes, m: __bt.mut, f: __game.ctx.bossUI.stats.frames }));
  await c.wait(2000);
  const w1 = await c.ev(() => ({ w: __game.ctx.bossUI.stats.writes, m: __bt.mut, f: __game.ctx.bossUI.stats.frames }));
  ok(w1.w - w0.w === 0 && w1.m - w0.m === 0 && w1.f - w0.f > 20, "数值不变时 2 秒内 0 次 DOM 写入", { writes: w1.w - w0.w, mutations: w1.m - w0.m, frames: w1.f - w0.f });
  // 读条 / 打断
  await S({ hp: 11700, shield: null, poise: 55, channel: { id: "summon_howl", k: 0.62, brk: 0.4 } });
  await c.wait(400);
  const ch = await c.ev(() => ({ on: __bt.has(".bx-chan", "on"), g: document.querySelector(".bx-chan .rg b").textContent, n: document.querySelector(".bx-chan .n").textContent, k: __bt.var(".bx-chan .rg", "--k"), b: __bt.var(".bx-chan .bk", "--b"), sh: __bt.has(".bx-bar", "sh") }));
  ok(ch.on && ch.g === "嚎" && ch.n === "召狼长嚎 · 可打断" && ch.k === "0.62" && ch.b === "0.4" && !ch.sh, "读条：嚎 + 圆相进度 + 打断值一笔", ch);
  await shot("howl");
  await emit("boss:interrupt", { attack: "summon_howl", by: "charge" });
  await S({ channel: null, poise: 90 });
  await c.wait(260);
  const cut = await c.ev(() => ({ on: __bt.has(".bx-chan", "on"), cut: __bt.has(".bx-chan", "cut") }));
  ok(cut.on && cut.cut, "被打断：转朱、钤断、抖动，保留约 1 秒", cut);
  await shot("howl_cut");
  await c.wait(1000);
  ok(await c.ev(() => !__bt.has(".bx-chan", "on")), "打断后读条收起");
  await S({ channel: { id: "moon_howl", k: 0.3, brk: 0 }, phase: 2 });
  await c.wait(200);
  ok(await c.ev(() => document.querySelector(".bx-chan .rg b").textContent === "啸"), "啸月读条：啸");
  await S({ channel: null });
  // 威折处决：executeHit 丢失时 0.95 秒兜底
  await S({ broken: !0, down: "break", downDur: 4, downLeft: 3 });
  await emit("boss:execute", { kind: "break", dmg: 1, dur: 2.4 });
  await c.wait(1150);
  ok(await c.ev(() => /hit/.test(document.querySelector(".bx-exec").className) && +__bt.cs(".bx-exec .rzhan", "opacity") > 0.5), "没收到 boss:executeHit 时 0.95 秒兜底出朱斩");
  await emit("boss:execEnd", { kind: "break" });
  await S({ broken: !1, down: null });
  // 终结短版 2 秒（0.35 出伤）
  const tS = await c.ev(() => (__bt.emit("boss:execute", { kind: "final", dmg: 1, dur: 2, short: !0 }), performance.now()));
  await c.ev((t0) => new Promise((r) => setTimeout(r, Math.max(0, t0 + 1330 - performance.now()))), tS);
  const fs = await c.ev(() => ({ cls: document.querySelector(".bx-exec").className, paper: +__bt.cs(".bx-exec .paper", "opacity"), fade: __game.ctx.ink.paperFade, stroke: +__bt.cs(".bx-exec .stroke", "opacity"), zhan: +__bt.cs(".bx-exec .zhan", "opacity"), yin: +__bt.cs(".bx-exec .yin", "opacity") }));
  // 留白：有 ink.setPaperFade 时走水墨后期参数（inkfade，纸层 DOM 不显示），否则纸层 DOM
  ok(/short/.test(fs.cls) && (/inkfade/.test(fs.cls) ? fs.fade > 0.6 : fs.paper > 0.6) && fs.stroke > 0.9 && fs.zhan > 0.8 && fs.yin > 0.9, "终结短版：0.35 一笔，随后斩与朱印", fs);
  await c.shot("final_short");
  await c.wait(1500);
  ok(await c.ev(() => document.querySelector(".bx-exec").className === "bx-exec"), "没收到 execEnd 也会在 dur 后自动收掉");
  // ink.setPaperFade
  const pf = await c.ev(async () => {
    const ink = __game.ctx.ink, had = ink.setPaperFade, seen = [];
    ink.setPaperFade = (v) => seen.push(v);
    __bt.emit("boss:execute", { kind: "final", dmg: 1, dur: 4, short: !1 });
    await new Promise((r) => setTimeout(r, 1500));
    const disp = getComputedStyle(document.querySelector(".bx-exec .paper")).display;
    __bt.emit("boss:execEnd", { kind: "final" });
    await new Promise((r) => setTimeout(r, 100));
    if (had) ink.setPaperFade = had;
    else delete ink.setPaperFade;
    return { disp, max: Math.max(...seen), last: seen[seen.length - 1], n: seen.length };
  });
  ok(pf.disp === "none" && pf.max >= 0.8 && pf.last === 0 && pf.n < 120, "ink.setPaperFade 存在时：后期参数代替纸层（只在变化时调用），结束归零", pf);
  // 每帧写入频率
  await S({ hp: 6000, phase: 2, shield: { el: "earth", hp: 900, max: 1500 } });
  const perf = await c.ev(async () => {
    const U = __game.ctx.bossUI, st = U.stats;
    const w0 = st.writes, f0 = st.frames, ms0 = st.ms, m0 = __bt.mut, t0 = performance.now();
    let k = 0;
    await new Promise((res) => {
      const tick = () => {
        k++;
        __bv.poise = (k * 0.37) % 100;
        __bv.hp = 6000 - k * 3;
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else res();
      };
      tick();
    });
    const sec = (performance.now() - t0) / 1000, f = st.frames - f0;
    return { sec: +sec.toFixed(2), frames: f, writesPerSec: +((st.writes - w0) / sec).toFixed(1), mutationsPerSec: +((__bt.mut - m0) / sec).toFixed(1), writesPerFrame: +((st.writes - w0) / f).toFixed(2), msPerFrame: +((st.ms - ms0) / f).toFixed(4) };
  });
  c.log("PERF", JSON.stringify(perf));
  ok(perf.writesPerFrame <= 3 && perf.msPerFrame < 0.3, "数值每帧在变时：每帧 ≤ 3 次写入、update < 0.3ms（性能规范 §7）", perf);
  await emit("boss:defeated", { executed: !0 });
  await c.wait(1500);
  ok(await c.ev(() => !__bt.has(".bx-bar", "on") && !document.body.classList.contains("mk-bossfight")), "boss:defeated 后 1.2 秒收起");

  // ================= C. 天机镜 · 战报 =================
  await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: VITE_CLIENT_STUB }));
  const base = page.url().replace(/\?.*$/, "").replace(/\/$/, "");
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  ok(await waitFor(() => window.__ready === true && window.__cave && window.__cave.active, null, 120000), "洞府调试页就绪");
  await c.wait(1200);
  await c.ev(() => {
    const p = window.__cave.p;
    p.stats.bossLog = p.stats.bossLog || {};
    const R = (run, realm, result, phase, hpLeft, sec) => ({ run, realm, result, phase, hpLeft, sec });
    p.stats.bossLog.qingya = {
      tries: 9, kills: 2, retreats: 3, deaths: 4, firstKill: { run: 14, realm: "1:6", sec: 252 }, best: { phase: 2, hpLeft: 0, realm: "1:6" }, fastest: 198, execs: { break: 3, final: 2 },
      log: [R(3, "1:2", "death", 1, 0.82, 95), R(5, "1:3", "retreat", 2, 0.41, 212), R(7, "1:3", "death", 1, 0.63, 140), R(8, "1:4", "death", 2, 0.47, 188), R(10, "1:4", "retreat", 2, 0.33, 240),
        R(11, "1:5", "death", 2, 0.22, 230), R(12, "1:5", "retreat", 2, 0.12, 266), R(13, "1:6", "death", 2, 0.06, 281), R(14, "1:6", "kill", 2, 0, 252), R(16, "1:7", "kill", 2, 0, 198)],
    };
  });
  await c.ev(() => void window.__cave.openMirror({ app: "boss" })); // openMirror 的 Promise 合上才 resolve，不能 await
  ok(await waitFor(() => document.querySelector(".mv2 .bxr"), null, 8000), "天机镜打开到战报应用");
  await c.wait(700);
  const mr = await c.ev(() => ({
    rows: document.querySelectorAll(".mv2 .bxr-row").length,
    kills: document.querySelectorAll(".mv2 .bxr-row.kill").length,
    head: document.querySelector(".mv2 .bxr-hero .st").textContent.replace(/\s+/g, " "),
    big: document.querySelector(".mv2 .bxr-big").textContent.replace(/\s+/g, ""),
    ex: [...document.querySelectorAll(".mv2 .bxr .mj-row")].map((r) => r.textContent.replace(/\s+/g, "")).join("|"),
    cols: document.querySelectorAll(".mv2 .bxr-chart .c").length,
    sum: (document.querySelector(".mv2 .bxr-sum") || {}).textContent,
  }));
  ok(mr.rows === 10 && mr.kills === 2 && /首斩于练气六层 · 第 14 次出行 · 用时 4:12/.test(mr.head), "战报：近十次 + 首斩境界与用时", mr);
  ok(mr.big === "9挑战2斩3撤4陨" && /威折×3·终结×2/.test(mr.ex) && /最快斩3:18/.test(mr.ex), "战报：尝试次数 / 处决次数 / 最快", mr);
  ok(mr.cols === 10 && /青牙 · 第 9 次 · 首斩于练气六层/.test(mr.sum || ""), "镜外浮签：成长图 10 笔 + 一句总结", mr.sum);
  await page.mouse.move(1240, 700);
  await c.shot("mirror_report");
  await c.ev(() => window.__cave.ui.mirror.set({ app: "home" }));
  await c.wait(200);
  ok(await c.ev(() => !!document.querySelector('.mv2 .mj-app[data-app="boss"]')), "主屏有战报图标");
  await c.shot("mirror_home");
  await c.ev(() => {
    delete window.__cave.p.stats.bossLog.qingya;
    window.__cave.ui.mirror.set({ app: "boss" });
  });
  await c.wait(200);
  ok(await c.ev(() => /尚未交手/.test(document.querySelector(".mv2 .bxr").textContent)), "没有记录时：尚未交手");
}
