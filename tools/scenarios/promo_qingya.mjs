// 青牙 v2 宣传片拍摄工具的可运行测试（宣传视频岗；docs/promo/青牙_v2_分镜.md）：
//   · 调试入口 src/dev/promo.js：?preset=T1..T4&boss=qingya&tries=N&hud=0|boss&seed=N 能按档位进场、写战报、隐藏 HUD、固定种子
//   · 脚本化主角操作 tools/trailer/qingya_act.mjs（真实键鼠）：入场、引撞柱、打断长嚎、转阶段（剑气斩破木盾）、站月光、绕背、
//     寒冰锥打断啸月、缠藤破土盾、威折处决、终结处决、筑基畏缩入场——每一项都检查游戏真的发了对应事件
// 用法：node tools/run.mjs promo_qingya "scene=run&region=r1&slot=7"（约 4 分钟；只读运行时，不录像）
import * as A from "../trailer/qingya_act.mjs";

export default async function (page, c) {
  const res = [];
  const check = (n, ok, info) => {
    res.push(!!ok);
    c.log((ok ? "PASS " : "FAIL ") + n, info !== undefined ? JSON.stringify(info) : "");
  };
  await page.routeWebSocket(/./, () => {});
  const base = new URL(page.url()).origin + "/";
  // 实时适配器：和录制用的 Rec 同一组方法，只是按真实时间走
  const R = {
    page,
    mouse: { x: 640, y: 360 },
    marks: {},
    ev: (f, a) => page.evaluate(f, a),
    async frame(each) {
      // 按 33 ms 节拍补齐（页面调用本身有开销，不补齐的话"等 0.45 秒"会拖成 1 秒多）
      const now = Date.now(), wait = Math.max(1, 33 - (now - (R._t || 0)));
      await page.waitForTimeout(wait);
      R._t = Date.now();
      if (each) await each();
    },
    async frames(n, each) {
      for (let i = 0; i < n; i++) await R.frame(each && (() => each(i)));
    },
    sec: (s, each) => R.frames(Math.round(s * 30), each),
    skip: (n) => page.waitForTimeout(n * 33),
    async key(code, hold = 2) {
      await page.keyboard.down(code);
      await R.frames(hold);
      await page.keyboard.up(code);
    },
    down: (k) => page.keyboard.down(k),
    up: (k) => page.keyboard.up(k),
    mdown: (b = "left") => page.mouse.down({ button: b }),
    mup: (b = "left") => page.mouse.up({ button: b }),
    async moveRaw(x, y) {
      R.mouse = { x, y };
      await page.mouse.move(x, y);
    },
    async go(q) {
      await page.evaluate(() => localStorage.clear()).catch(() => {});
      await page.goto(base + "?" + q, { waitUntil: "commit", timeout: 90000 });
      await page.waitForFunction(() => window.__ready === !0 || window.__fatal, null, { timeout: 180000 });
    },
    until: (fn, arg, { timeout = 60000 } = {}) => page.waitForFunction(fn, arg, { timeout, polling: 100 }),
    mark: (k) => (R.marks[k] = Date.now()),
  };
  const ev = R.ev;

  // ======== T1 初见被虐：练二，第 1 次 ========
  await A.enter(R, { preset: "T1", tries: "1", at: "pit" });
  let s = await ev(() => {
    const G = __game, p = G.profile, h = G.player.entity, q = __q();
    return { label: __promo.preset && __promo.preset.label, realm: p.realm, spells: p.build.spells.filter(Boolean), hp: Math.round(h.stats.get("hp")), boss: !!q, mode: q && q.ctrl.mode, adds: G.ctx.enemies.list.filter((e) => e.alive && e.type !== "qingya").length };
  });
  check("T1 preset: 练气二层, sword_qi only, boss asleep, valley clear", s.label === "练气二层" && s.realm.layer === 2 && s.spells.join() === "sword_qi" && s.boss && s.mode === "asleep" && s.adds === 0, s);
  // 固定种子
  s = await ev(() => {
    __promo.seed(7);
    const a = [Math.random(), Math.random(), Math.random()];
    __promo.seed(7);
    const b = [Math.random(), Math.random(), Math.random()];
    return { a, b };
  });
  check("seed: same sequence after reseed", s.a.join() === s.b.join() && s.a[0] !== s.a[1], s);
  // 隐藏 HUD
  s = await ev(() => {
    const vis = (sel) => {
      const e = document.querySelector(sel);
      return e ? getComputedStyle(e).visibility : "none";
    };
    __promo.hud("0");
    const h0 = { hud: vis(".mk-layer-runhud"), boss: vis(".mk-layer-boss"), view: vis("#view") };
    __promo.hud("boss");
    const hb = { hud: vis(".mk-layer-runhud"), boss: vis(".mk-layer-boss") };
    __promo.hud("1");
    const h1 = { hud: vis(".mk-layer-runhud") };
    return { h0, hb, h1 };
  });
  check("hud=0 hides HUD, keeps canvas; hud=boss keeps boss layer; hud=1 restores", s.h0.hud === "hidden" && s.h0.view === "visible" && s.hb.hud === "hidden" && s.hb.boss !== "hidden" && s.h1.hud === "visible", s);
  await ev(() => __promo.hud("0"));
  await c.shot("t1_nohud");
  await ev(() => __promo.hud("1"));
  // 真实按键走进触发圈 → 完整入场（初见 + 一句提示）
  await A.walkToBoss(R);
  const intro = await A.waitUntil(R, () => __qn("boss:introStart") > 0, null, { maxSec: 6 });
  await R.sec(1.6);
  s = await ev(() => ({ h: (document.querySelector(".bx-intro .h") || {}).textContent, k: (document.querySelector(".bx-intro .k") || {}).textContent }));
  check("T1 walk in → full intro 题签 初见 + hint", intro && /初见/.test(s.h || ""), s);
  await c.shot("t1_intro");
  await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 6 });
  // 被三扑连中（主角不无敌）
  await A.god(R, !1);
  await A.bossDo(R, "rend");
  await A.waitUntil(R, () => __qn("heroHit") >= 2, null, { maxSec: 4 });
  s = await ev(() => ({ hits: __qn("heroHit"), hp: Math.round(__game.player.entity.hp), max: Math.round(__game.player.entity.stats.get("hp")) }));
  check("T1: rend lands on hero (hp drops)", s.hits >= 2 && s.hp < s.max, s);

  // ======== T2 打到二阶段：练四，第 4 次（上回削至 62%）========
  await A.enter(R, { preset: "T2", tries: "4", last: "0.62", god: "1", at: "fight" });
  await R.sec(0.5);
  s = await ev(() => ({ h: (document.querySelector(".bx-intro .h") || {}).textContent, label: __promo.preset.label, mode: __q().ctrl.mode }));
  check("T2 at=fight: short intro 题签 第 4 次 · 上回削至 62%", /第 4 次/.test(s.h || "") && /62%/.test(s.h || "") && s.label === "练气四层", s);
  await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 4 });
  await A.bossHold(R, !0);
  // 打断长嚎（剑气斩，近身正面）
  await A.approach(R, 3.2);
  let ok = await A.interruptHowl(R, { by: "KeyQ" });
  check("interrupt howl with 剑气斩 (Q) → boss:interrupt", ok, await ev(() => __QE.filter((x) => /interrupt|poiseGain/.test(x.n)).slice(-3)));
  await R.sec(2.2);
  // 引撞柱
  await A.stage(R, { clear: !0, poise: 0 });
  await A.bossHold(R, !0);
  await A.nearPillar(R, "fang_3", { gap: 3.0, hero: 3.5 });
  ok = await A.lurePillar(R, { pillar: "fang_3" });
  check("lure pillar: walk behind pillar → rend → boss:crash", ok, await ev(() => ({ crash: __qn("boss:crash"), st: __q().state })));
  await c.shot("t2_crash");
  await R.sec(2.8);
  // 转阶段：木盾剩一点、气血 50%，剑气斩（金克木）破盾 → 转阶段
  await A.bossHold(R, !0);
  await A.stage(R, { hp: 0.5, shield: 60, clear: !0 });
  await A.approach(R, 3.0);
  await A.cast(R, "KeyQ");
  ok = await A.waitUntil(R, () => __qn("boss:phase") > 0, null, { maxSec: 3 });
  check("剑气斩 breaks wood shield at 50% → boss:phase (transition)", ok, await ev(() => ({ br: __qn("shield:break"), ph: __q().ctrl.phase, mode: __q().ctrl.mode })));
  await R.sec(1.8);
  await c.shot("t2_transition");
  await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 4 });
  s = await ev(() => ({ veil: __q().ctrl.veil, sh: __q().entity.shield && __q().entity.shield.element }));
  check("phase 2: moon veil + earth shield", s.veil > 0.9 && s.sh === "earth", s);

  // ======== T3 打死：练七，第 6 次 ========
  await A.enter(R, { preset: "T3", tries: "6", last: "0.31", lastPhase: "2", god: "1", mp: "1", at: "fight" });
  await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 6 });
  s = await ev(() => ({ label: __promo.preset.label, spells: __game.profile.build.spells.filter(Boolean), art: !!__game.profile.equip.artifact }));
  check("T3 preset: 练气七层, 剑气斩 + 缠藤 + 寒冰锥, 飞剑", s.label === "练气七层" && s.spells.join() === "sword_qi,vine,frost" && s.art, s);
  await A.bossHold(R, !0);
  await A.stage(R, { phase2: !0, hp: 0.45 });
  s = await ev(() => ({ ph: __q().ctrl.phase, mode: __q().ctrl.mode }));
  check("stage phase2 (skip transition frames)", s.ph === 2 && s.mode === "fight", s);
  // 缠藤（木克土）破土盾
  await A.stage(R, { shield: 80, clear: !0 });
  await A.approach(R, 3.0);
  const br0 = await A.qn(R, "shield:break");
  await A.cast(R, "KeyE");
  ok = await A.waitUntil(R, (n) => __qn("shield:break") > n, br0, { maxSec: 3 });
  check("缠藤 (E) breaks earth shield", ok, await ev(() => __q().entity.shield && __q().entity.shield.hp));
  // 破盾 +30 狼威可能直接打出威折：等它起身、狼威清零再拍下一段
  await A.waitUntil(R, () => !__q().ctrl.broken && __q().state !== "down", null, { maxSec: 8 });
  await A.stage(R, { clear: !0, poise: 0 });
  await R.sec(1.0);
  // 站月光：影袭落空
  await A.bossHold(R, !0);
  ok = await A.standMoon(R);
  check("stand in moonlight → shadow strike denied (boss:moonDenied)", ok, await ev(() => ({ n: __qn("boss:moonDenied"), inMoon: __q().ctrl.inMoon(__game.player.pos), st: __q().state, atk: __q().atk && __q().atk.a && __q().atk.a.id })));
  await c.shot("t3_moon");
  await R.sec(1.2);
  // 绕背打裂缝
  await A.bossHold(R, !0);
  await A.stage(R, { clear: !0, pos: [46, -15], hero: [46, -11], face: !0 });
  const w = await A.flankBack(R, { hits: 2, freeze: !0 });
  check("flank: hits on back armor (qyWeak, 裂)", w >= 1, { w });
  await A.bossFreeze(R, !1);
  await R.sec(1.0);
  // 寒冰锥打断啸月
  await A.stage(R, { clear: !0, poise: 55 });
  await A.approach(R, 4.0);
  ok = await A.interruptHowl(R, { id: "moon_howl", by: "KeyR", wait: 0.6 });
  check("寒冰锥 (R) interrupts 啸月 → boss:interrupt", ok, await ev(() => ({ brk: __q().ctrl.broken, st: __q().state })));
  await R.sec(1.0);
  await A.waitUntil(R, () => !__q().ctrl.broken && __q().state !== "down", null, { maxSec: 8 });
  await R.sec(0.5);
  // 威折处决：狼威快满，满势蓄势斩补满 → 威折 → F
  await A.bossHold(R, !0);
  await A.stage(R, { clear: !0, poise: 120, shield: 0 });
  await A.approach(R, 2.0);
  await A.momentum(R, 100);
  await A.charge(R);
  ok = await A.breakExec(R);
  check("full charge fills poise → 威折 → F → 威折处决 (boss:execute break)", ok && (await ev(() => __QE.some((x) => x.n === "boss:execute" && x.kind === "break"))), await ev(() => __QE.filter((x) => /break|exec/.test(x.n)).map((x) => x.n + ":" + (x.kind || ""))));
  await R.sec(0.8);
  // 终结处决：压到 3%，连段打到气竭 → F
  await A.stage(R, { hp: 0.03, shield: 0, clear: !0 });
  await A.approach(R, 1.8);
  await A.attack(R, { until: () => __q().ctrl.mode === "final", maxSec: 4 });
  ok = await A.finalExec(R);
  s = await ev(() => ({ fin: __QE.filter((x) => x.n === "boss:execute" && x.kind === "final").length, def: __qn("boss:defeated") }));
  check("气竭 → F → 终结处决 → boss:defeated", ok && s.fin >= 1 && s.def >= 1, s);
  await R.sec(1.5);
  await c.shot("t3_after_final");

  // ======== T4 轻松通关：筑基，第 9 次（上回已斩）→ 入场畏缩 ========
  await A.enter(R, { preset: "T4", tries: "9", last: "0", lastPhase: "2", god: "1", at: "fight" });
  await R.sec(0.3);
  s = await ev(() => ({ label: __promo.preset.label, cower: __q().ctrl.cower, h: (document.querySelector(".bx-intro .h") || {}).textContent, intro: __QE.filter((x) => x.n === "boss:introStart").length }));
  check("T4 筑基: intro with cower, 题签 上回已斩", s.label === "筑基" && s.cower && /上回已斩/.test(s.h || ""), s);
  await R.sec(0.8);
  await c.shot("t4_cower");

  const errs = await ev(() => window.__errors || []);
  check("no page errors", !errs.length, errs.slice(0, 3));
  c.log("SUMMARY " + res.filter(Boolean).length + "/" + res.length);
}
