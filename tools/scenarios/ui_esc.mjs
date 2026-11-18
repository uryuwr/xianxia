// 界面 Esc 遍历：逐个打开游戏里的界面 / 面板 / 弹层，按真实 Esc，断言"只关最上面一层、底下一层还在、没有误弹 Esc 菜单、没有页面错误"。
// 用法：node tools/run.mjs ui_esc "scene=title"（约 2–3 分钟）
// 顺序：标题（设置 / 卷宗 / 画外记 / 删除确认）→ 洞府（Esc 菜单、各设施页、升阶弹层、确认框、天机镜各应用、功法匣、心魔劫前装配）
//      → 出行准备（返回、功法选中、确认框）→ 出行局（暂停 / 设置 / 回主页确认、储物袋、舆图、搜取窗、奇遇对话、F8 调试、构筑面板、瞄准）→ 结算页。
// 每个界面一行 PASS / FAIL（带界面名）。不可中断的状态（炉火读条、突破 / 心魔演出、首领处决）不在这里测，见 docs/knowledge/玩法系统/本项目约定.md「Esc 规则」。

export default async function (page, c) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e).slice(0, 200)));
  let e0 = 0;
  const T = (name, cond, info) => {
    const newErr = errs.slice(e0);
    const okk = !!cond && !newErr.length;
    console.log((okk ? "PASS " : "FAIL ") + name + (okk ? "" : " " + JSON.stringify({ info, errors: newErr })));
    e0 = errs.length;
    return okk;
  };
  const waitFor = async (fn, arg, timeout = 15000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 100 });
      return !0;
    } catch {
      return !1;
    }
  };
  const esc = async (ms = 350) => {
    await page.keyboard.press("Escape");
    await c.wait(ms);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // 当前各层的可见状态
  const S = () =>
    ev(() => {
      const f = __game.flow, R = f.scenes.run, cv = window.__cave;
      const layerOn = (n) => {
        const l = document.querySelector(".mk-layer-" + n);
        return !!l && !l.classList.contains("hidden") && l.children.length > 0;
      };
      const mir = cv && cv.ui && cv.ui.mirror;
      return {
        scene: f.name,
        paused: !!f.paused,
        pause: layerOn("pause") && !!document.querySelector(".mk-layer-pause .mk-pause"),
        pauseSet: !!document.querySelector(".mk-layer-pause .mk-sub"),
        modal: !!document.querySelector(".mk-modal"),
        cvModal: !!document.querySelector(".cv-modal"),
        ws2Modal: !!document.querySelector(".ws2-modal"),
        ldPop: layerOn("loadout") && !!document.querySelector(".mk-ld-pop"),
        inner: !!cv?.ui.inner?.alive && !!document.querySelector(".mk-inner"),
        innerSel: !!cv?.ui.inner?.prep.lo?.sel,
        titleMenu: !!document.querySelector(".mk-layer-title .mk-title .menu"),
        titleSub: !!document.querySelector(".mk-layer-title .mk-sub"),
        slots: !!document.querySelector(".mk-layer-title .mk-slots"),
        cvCur: cv && cv.ui ? cv.ui.cur : null,
        mirror: !!(mir && mir.alive),
        mirApp: mir && mir.alive ? mir.S.app : null,
        mirMem: mir && mir.alive ? !!mir.S.mem : null,
        prep: f.name === "prep" && layerOn("prep"),
        prepSel: f.name === "prep" && f.scenes.prep.lo ? !!f.scenes.prep.lo.sel : null,
        bag: !!(R.bagUI && R.bagUI.open),
        map: !!(R.hudUI && R.hudUI.big),
        loot: !!(__game.run && __game.run.containers && __game.run.containers.openC),
        dlg: !!document.querySelector(".qd-wrap"),
        debug: !!(__game.debug && __game.debug.open),
        build: !!(window.__skills && window.__skills.panel && window.__skills.panel.open),
        aiming: !!(window.__targeting && window.__targeting.aiming),
      };
    });

  // ================= 1. 标题 =================
  await waitFor(() => window.__game && __game.flow && __game.flow.name === "title" && document.querySelector(".mk-layer-title .menu"), null, 60000);
  await c.wait(300);
  let s;
  await esc();
  s = await S();
  T("标题主菜单：Esc 不出错、不弹菜单", s.titleMenu && !s.pause && !s.modal, s);

  for (const [id, nm] of [["settings", "设置"], ["slots", "卷宗"], ["about", "画外记"]]) {
    await page.click(`.mk-layer-title [data-id=${id}]`);
    await c.wait(250);
    // 焦点停在面板里的按钮上（鼠标点过选项后的常态），Esc 也要收到
    await ev(() => {
      const b = document.querySelector(".mk-layer-title .mk-sub .ink-btn, .mk-layer-title .mk-slots .ink-btn");
      b && b.focus();
    });
    const before = await S();
    await esc();
    s = await S();
    T(`标题 › ${nm}：Esc 回主菜单`, (before.titleSub || before.slots) && s.titleMenu && !s.titleSub && !s.slots, { before, s });
    if (!s.titleMenu) await ev(() => __game.flow.scenes.title.menu());
  }
  // 卷宗 › 删除确认框（kit.confirm）
  await ev(() => {
    __game.flow.newGame(2);
    __game.flow.scenes.title.slots();
  });
  await c.wait(250);
  await page.click(".mk-layer-title .mk-slots .ink-row button.mk-red");
  await c.wait(250);
  const mBefore = (await S()).modal;
  await esc();
  s = await S();
  const kept = await ev(() => !!localStorage.getItem("moxian.save.2"));
  T("标题 › 卷宗 › 删除确认框：Esc 取消（存档还在、卷宗页还在）", mBefore && !s.modal && s.slots && kept, { mBefore, s, kept });
  if (s.modal) await ev(() => document.querySelectorAll(".mk-modal").forEach((m) => m.remove()));
  await esc();
  s = await S();
  T("标题 › 卷宗（确认框关后）：再 Esc 回主菜单", s.titleMenu && !s.slots, s);

  // ================= 2. 洞府 =================
  await ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const f = __game.flow;
    const P = f.newGame(3);
    P.flags.tutorialDone = !0;
    P.stats.runs = 8;
    P.realm = { stage: 1, layer: 4 };
    for (const [id, n] of [["spirit_stone", 200], ["huichun_dan", 3], ["huiqi_dan", 3], ["dundi_fu", 2]]) P.storage.add(makeItem(id, { n }));
    f.save();
    f.go("cave", { from: "load" });
  });
  const inCave = await waitFor(() => window.__cave && __cave.active && !document.querySelector(".cv-loading") && __game.flow.name === "cave", null, 150000);
  await c.wait(1500);
  await waitFor(() => !__cave.locked, null, 15000);
  T("进入洞府", inCave, await S());
  const cvReset = () =>
    ev(() => {
      document.querySelectorAll(".cv-modal,.ws2-modal,.mk-modal").forEach((m) => m.remove());
      const ld = document.querySelector(".mk-ld-pop [data-id=ld-done]");
      if (ld) ld.click();
      if (__cave.ui.mirror && __cave.ui.mirror.alive) __cave.ui.mirror.close();
      __cave.ui.close();
      const pz = __game.flow.scenes.cave.pause;
      if (pz && pz.open) pz.toggle(!1);
    });

  // 2.1 洞府主界面：Esc 菜单
  await esc();
  s = await S();
  T("洞府主界面：Esc 打开 Esc 菜单（暂停）", s.pause && s.scene === "cave", s);
  if (s.pause) {
    await page.click(".mk-layer-pause [data-id=settings]");
    await c.wait(250);
    await esc();
    s = await S();
    T("洞府 › Esc 菜单 › 设置：Esc 回 Esc 菜单", s.pause && !s.pauseSet, s);
    await esc();
    s = await S();
    T("洞府 › Esc 菜单：再 Esc 关闭", !s.pause && !s.paused, s);
  } else {
    T("洞府 › Esc 菜单 › 设置：Esc 回 Esc 菜单", !1, "没有 Esc 菜单");
    T("洞府 › Esc 菜单：再 Esc 关闭", !1, "没有 Esc 菜单");
  }
  await cvReset();

  // 2.2 设施页
  for (const [id, tab, nm] of [
    ["spring", null, "灵泉（炼化 / 突破）"],
    ["storage", null, "仓库博古架"],
    ["workshop", "alchemy", "丹器房 · 炼丹"],
    ["workshop", "forge", "丹器房 · 炼器"],
    ["forge", "reforge", "丹器房 · 炼器 · 重铸"],
    ["forge", "bind", "丹器房 · 炼器 · 认主"],
    ["garden", null, "药园（独立建筑）"],
  ]) {
    await ev(([id, tab]) => __cave.open(id, tab), [id, tab]);
    await c.wait(500);
    const b = await S();
    await esc();
    s = await S();
    T(`洞府 › ${nm}：Esc 回洞府`, b.cvCur && !s.cvCur && !s.pause && s.scene === "cave", { before: b.cvCur, s });
    await cvReset();
    await c.wait(150);
  }

  // 2.3 升阶弹层（facModal）叠在丹器房上
  await ev(() => __cave.open("workshop", "forge"));
  await c.wait(400);
  await ev(async () => {
    const m = await import("/src/ui/cave/workshop_v2.js");
    m.facModal(__cave.ui, "forge");
  });
  await c.wait(300);
  let b = await S();
  await esc();
  s = await S();
  T("洞府 › 丹器房 › 升阶弹层：Esc 只关弹层", b.ws2Modal && !s.ws2Modal && s.cvCur === "workshop" && !s.pause, { b, s });
  await esc();
  s = await S();
  T("洞府 › 丹器房（弹层关后）：再 Esc 回洞府", !s.cvCur && !s.pause, s);
  await cvReset();

  // 2.4 确认框（cv-modal）叠在仓库上
  await ev(() => __cave.open("storage"));
  await c.wait(400);
  await ev(() => {
    window.__cf = "pending";
    __cave.ui.confirm("化灵", "测试确认框", { ok: "化灵" }).then((v) => (window.__cf = v));
  });
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  let cf = await ev(() => window.__cf);
  T("洞府 › 仓库 › 确认框：Esc 取消、仓库还在", b.cvModal && !s.cvModal && cf === !1 && s.cvCur === "storage" && !s.pause, { b, s, cf });
  await ev(() => document.querySelectorAll(".cv-modal").forEach((m) => m.remove())); // 只清残留确认框，仓库页留着
  await esc();
  s = await S();
  T("洞府 › 仓库（确认框关后）：再 Esc 回洞府", !s.cvCur && !s.pause, s);
  await cvReset();

  // 2.5 天机镜（各应用 → 主屏 → 合上）
  await ev(() => void __cave.openMirror());
  await waitFor(() => __cave.ui.mirror && __cave.ui.mirror.alive, null, 15000);
  await c.wait(700);
  for (const [app, nm] of [["realm", "境界录"], ["album", "相册"], ["trail", "行迹"], ["map", "舆图"], ["boss", "战报"]]) {
    await ev((app) => __cave.ui.mirror && __cave.ui.mirror.alive && __cave.ui.mirror.set({ app }), app);
    await c.wait(250);
    b = await S();
    await esc();
    s = await S();
    T(`洞府 › 天机镜 › ${nm}：Esc 回主屏`, b.mirApp === app && s.mirror && s.mirApp === "home" && !s.pause, { b: b.mirApp, s });
  }
  await esc(500);
  s = await S();
  T("洞府 › 天机镜主屏：Esc 合上", !s.mirror && !s.pause && s.scene === "cave", s);
  await c.wait(400);
  await cvReset();
  await waitFor(() => !__cave.locked, null, 5000);

  // 2.6 功法入口共用内观阁：第一次 Esc 取消装配选中，第二次关阁。
  const openInner = async (from = "study") => {
    await ev((from) => { void __cave.openLoadout({ from, tab: "spell" }); }, from);
    await page.waitForSelector('.mk-inner .mk-ld-slot[data-slot-kind="spell"][data-slot-i="0"]');
  };
  await openInner();
  b = await S();
  await esc();
  s = await S();
  T("洞府 › 内观阁：Esc 关闭并恢复人物", b.inner && !s.inner && !s.cvCur && !s.pause && await ev(() => !__cave.locked && !__game.ctx.hold3d), { b, s });
  await cvReset();
  await openInner();
  await page.click('.mk-inner .mk-ld-slot[data-slot-kind="spell"][data-slot-i="0"]');
  b = await S();
  await esc();
  s = await S();
  T("洞府 › 内观阁（有选中）：Esc 先取消选中、阁仍在", b.innerSel && !s.innerSel && s.inner && !s.pause, { b, s });
  await esc();
  s = await S();
  T("洞府 › 内观阁（取消选中后）：再 Esc 关闭", !s.inner && !s.cvCur && !s.pause, s);
  await cvReset();

  // 2.7 心魔劫前“调整功法”取消原确认，再打开内观阁，不留下待触发的渡劫。
  await ev(() => __cave.open("spring"));
  await c.wait(400);
  await ev(() => {
    window.__cf = "pending";
    __cave.ui.confirm("心魔劫", "测试：渡劫前", { ok: "渡劫", seal: !0, extra: { label: "调整功法", id: "trial-loadout", onClick: () => __cave.openLoadout({ from: "trial" }) } }).then((v) => (window.__cf = v));
  });
  await c.wait(300);
  await page.click(".cv-modal [data-act=trial-loadout]", { timeout: 3000 }).catch(async (e) => {
    c.log("WARN 调整功法 点击失败，改用 DOM click：" + String(e.message).split("\n")[0]);
    await ev(() => document.querySelector(".cv-modal [data-act=trial-loadout]").click());
  });
  await page.waitForSelector(".mk-inner");
  b = await S();
  cf = await ev(() => window.__cf);
  T("洞府 › 心魔劫确认框 › 调整功法：取消原确认后开阁", b.inner && !b.cvModal && cf === !1 && !b.pause, { b, cf });
  await esc();
  s = await S();
  T("洞府 › 渡劫前内观阁：Esc 回洞府，不触发渡劫或旧确认", !s.inner && !s.cvModal && !s.cvCur && !s.pause && await ev(() => !__cave.trial && window.__cf === false), s);
  await cvReset();

  // 2.8 心魔劫（洞府里的战斗）：Esc 呼出暂停菜单、再 Esc 关
  await ev(() => {
    __game.player.debug && (__game.player.debug.god = !0);
    window.__trialP = __cave.runTrial();
  });
  const inTrial = await waitFor(() => !!__cave.trial, null, 8000);
  await c.wait(1200);
  await esc();
  s = await S();
  T("心魔劫：Esc 呼出暂停菜单", inTrial && s.pause && s.paused, { inTrial, s });
  await esc();
  s = await S();
  T("心魔劫 › 暂停菜单：再 Esc 关闭", !s.pause && !s.paused, s);
  await cvReset();
  await ev(async () => {
    __cave.trial && __cave.trial.abort();
    await window.__trialP;
  });
  await c.wait(400);

  // ================= 3. 出行准备 =================
  const toPrep = async () => {
    await ev(() => __game.flow.go("prep"));
    return waitFor(() => __game.flow.name === "prep" && document.querySelector(".mk-layer-prep [data-id=back]"), null, 20000);
  };
  await toPrep();
  await c.wait(300);
  await esc(800);
  await waitFor(() => __game.flow.name === "cave", null, 8000);
  s = await S();
  T("出行准备：Esc 回洞府", s.scene === "cave" && !s.pause, s);
  await waitFor(() => window.__cave && __cave.active && !document.querySelector(".cv-loading"), null, 30000);
  await c.wait(500);

  await toPrep();
  await page.locator('.mk-prep [data-prep-tab="gongfa"]').click();
  await ev(() => {
    const lo = __game.flow.scenes.prep.lo;
    lo.sel = { src: "slot", kind: "spell", i: 0 };
    lo.render();
  });
  await c.wait(200);
  await esc();
  s = await S();
  T("出行准备 › 功法匣（有选中）：Esc 只取消选中", s.prep && s.prepSel === !1, s);
  await ev(() => {
    window.__cf = "pending";
    __game.ctx.ui.confirm("测试", "出行准备里的确认框").then((v) => (window.__cf = v));
  });
  await c.wait(250);
  b = await S();
  await esc();
  s = await S();
  cf = await ev(() => window.__cf);
  T("出行准备 › 确认框：Esc 取消、出行准备还在", b.modal && !s.modal && cf === !1 && s.prep, { b: b.modal, s, cf });
  await ev(() => document.querySelectorAll(".mk-modal").forEach((m) => m.remove()));

  // ================= 4. 出行局 =================
  await ev(() => __game.flow.go("run", { region: "r1" }));
  const inRun = await waitFor(() => __game.flow.name === "run" && __game.run && __game.flow.scenes.run.pause && __game.flow.scenes.run.hudUI && document.querySelector(".mk-layer-loading").classList.contains("hidden"), null, 150000);
  await c.wait(1500);
  T("进入出行局", inRun, await S());
  const R = (fn) => ev(fn);
  const runReset = () =>
    R(() => {
      const r = __game.flow.scenes.run;
      document.querySelectorAll(".mk-modal").forEach((m) => m.remove());
      if (r.pause.open) r.pause.toggle(!1);
      if (r.bagUI.open) r.bagUI.toggle(!1);
      if (r.hudUI.big) r.hudUI.toggleMap(!1);
      if (__game.debug.open) __game.debug.toggle(!1);
      if (window.__skills && __skills.panel.open) __skills.panel.toggle(!1);
      if (window.__targeting) __targeting.cancel(!0);
    });

  await esc();
  s = await S();
  T("出行局：Esc 打开暂停菜单", s.pause && s.paused, s);
  await esc();
  s = await S();
  T("出行局 › 暂停菜单：Esc 继续", !s.pause && !s.paused, s);
  await runReset();

  await esc();
  await page.click(".mk-layer-pause [data-id=settings]");
  await c.wait(250);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 暂停 › 设置：Esc 回暂停菜单", b.pauseSet && s.pause && !s.pauseSet, { b: b.pauseSet, s });
  await runReset();

  await esc();
  await page.click(".mk-layer-pause [data-id=totitle]");
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 暂停 › 回到主页确认框：Esc 取消、暂停菜单还在", b.modal && !s.modal && s.pause && s.scene === "run", { b: b.modal, s });
  await esc();
  s = await S();
  T("出行局 › 暂停（确认框关后）：再 Esc 继续", !s.pause && !s.paused && s.scene === "run", s);
  await runReset();

  await page.keyboard.press("Tab");
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 储物袋（Tab）：Esc 合上、不弹暂停", b.bag && !s.bag && !s.pause, { b: b.bag, s });
  await runReset();

  await page.keyboard.press("KeyM");
  await c.wait(400);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 舆图手卷（M）：Esc 合上、不弹暂停", b.map && !s.map && !s.pause, { b: b.map, s });
  await runReset();

  // 储物袋 + 舆图同时开：一次只关一层
  await page.keyboard.press("Tab");
  await c.wait(200);
  await page.keyboard.press("KeyM");
  await c.wait(300);
  b = await S();
  await esc();
  const s1 = await S();
  await esc();
  s = await S();
  T("出行局 › 储物袋 + 舆图：Esc 逐层关闭、不弹暂停", b.bag && b.map && (s1.bag !== s1.map) && !s.bag && !s.map && !s.pause, { b, s1, s });
  await runReset();

  // 搜取窗
  const lootOk = await R(() => {
    const r = __game.run, C = r.containers;
    let cc = C.list.find((q) => q.slots && q.slots.length);
    if (!cc) {
      const m = r.marks.find((q) => q.kind === "chest" && !q.altar);
      if (m) {
        __game.player.spawn ? __game.player.spawn(m.pos.x + 1, m.pos.z) : __game.player.pos.set(m.pos.x + 1, m.pos.y, m.pos.z);
        r.interact && r.interact(m);
      }
      cc = C.openC;
    } else C.open(cc);
    return !!C.openC;
  });
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 搜取窗：Esc 收起、不弹暂停", lootOk && b.loot && !s.loot && !s.pause, { lootOk, b: b.loot, s });
  await runReset();

  // 奇遇对话（无选项：Esc 跳过并离开；有选项：Esc 不关、也不弹暂停）
  await R(() => {
    window.__dc = 0;
    const Q = __game.flow.scenes.run.quests;
    Q.dialog.open({ glyph: "试", name: "测试", title: "", me: "林墨", lines: [{ who: "", text: "一句测试旁白。" }, { who: "白鹭", text: "第二句。" }], choices: [], onClose: () => (window.__dc = 1) });
  });
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  let dc = await ev(() => window.__dc);
  T("出行局 › 奇遇对话（无选项）：Esc 跳过并离开、不弹暂停", b.dlg && !s.dlg && dc === 1 && !s.pause, { b: b.dlg, s, dc });
  await R(() => {
    window.__dch = -1;
    const Q = __game.flow.scenes.run.quests;
    Q.dialog.open({ glyph: "试", name: "测试", title: "", me: "林墨", lines: [{ who: "白鹭", text: "选一个。" }], choices: [{ text: "甲" }, { text: "乙" }], onChoose: (i) => (window.__dch = i), onClose: () => {} });
  });
  await c.wait(600);
  await esc();
  s = await S();
  T("出行局 › 奇遇对话（有选项）：Esc 不关（须选择）、不弹暂停", s.dlg && !s.pause, s);
  await page.keyboard.press("Digit1");
  await c.wait(200);
  s = await S();
  dc = await ev(() => window.__dch);
  T("出行局 › 奇遇对话（有选项）：数字键选择后关闭", !s.dlg && dc === 0, { s, dc });
  await runReset();

  // F8 调试面板
  await page.keyboard.press("F8");
  await c.wait(200);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › F8 调试面板：Esc 关闭、不弹暂停", b.debug && !s.debug && !s.pause, { b: b.debug, s });
  await runReset();

  // ` 构筑面板（战斗调试）
  await page.keyboard.press("Backquote");
  await c.wait(300);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 构筑面板（`）：Esc 关闭、不弹暂停", b.build && !s.build && !s.pause, { b: b.build, s });
  await runReset();

  // 法术瞄准
  await R(() => {
    const S = window.__skills;
    S.setLoadout({ spells: ["fire_talisman", "sword_qi", "vine"] }); // 练气四层只开 Q / E 两栏：放在 Q
    S.cd = {};
    S.hero.mp = S.hero.stats.get("mp");
  });
  await page.mouse.move(640, 300);
  await page.keyboard.press("KeyQ");
  await c.wait(200);
  b = await S();
  await esc();
  s = await S();
  T("出行局 › 法术瞄准：Esc 取消瞄准、不弹暂停", b.aiming && !s.aiming && !s.pause, { b: b.aiming, s });
  await runReset();

  // 首领战：入场演出中 Esc 不响应（例外）；开打后 Esc 呼出暂停菜单、再 Esc 关
  const bossOk = await (async () => {
    const pts = await R(() => {
      __game.player.debug && (__game.player.debug.god = !0);
      const b = __game.run.map.points.boss;
      if (!b) return null;
      __game.run.t = __game.run.R.phases[2] + 1;
      return { x: b.pos.x, z: b.pos.z, trig: b.trigger || 10 };
    });
    if (!pts) return null;
    await R(() => document.querySelectorAll(".mk-modal").forEach((m) => m.remove()));
    await ev(([x, z]) => __game.player.spawn(x, z), [pts.x + 15, pts.z]);
    if (!(await waitFor(() => __game.run.boss && __game.run.boss.e && __game.run.boss.e.alive, null, 10000))) return null;
    await ev(([x, z]) => __game.player.spawn(x, z), [pts.x + pts.trig - 2, pts.z]);
    await waitFor(() => __game.run.boss.e.ctrl && __game.run.boss.e.ctrl.mode === "intro", null, 4000);
    return pts;
  })();
  if (bossOk) {
    const m0 = await ev(() => __game.run.boss.e.ctrl.mode);
    await esc();
    s = await S();
    T("首领战 · 入场演出中：Esc 不呼出菜单（演出不可打断，例外）", m0 === "intro" && !s.pause && !s.paused, { m0, s });
    await runReset();
    const fight = await waitFor(() => __game.run.boss.e.ctrl.mode === "fight", null, 12000);
    await esc();
    s = await S();
    T("首领战（开打后）：Esc 呼出暂停菜单", fight && s.pause && s.paused, { fight, s });
    await esc();
    s = await S();
    T("首领战 › 暂停菜单：再 Esc 关闭", !s.pause && !s.paused, s);
    await runReset();
  } else T("首领战：找不到首领点位 / 首领没刷出", !1, null);

  // ================= 5. 结算页 =================
  await R(() => __game.debug.extract());
  const inRes = await waitFor(() => __game.flow.name === "result" && document.querySelector(".mk-layer-result:not(.hidden)"), null, 30000);
  await c.wait(800);
  await esc();
  s = await S();
  T("结算页：Esc 呼出 Esc 菜单（不跳走）", inRes && s.scene === "result" && s.pause, s);
  await esc();
  s = await S();
  T("结算页 › Esc 菜单：再 Esc 关闭、结算页还在", s.scene === "result" && !s.pause, s);
  await ev(() => {
    const pz = __game.flow.scenes.result.pause;
    pz && pz.open && pz.toggle(!1);
  });

  // ================= 6. 区域二、序章（空场景 Esc → 暂停 → Esc 关）=================
  for (const [region, nm] of [["r2", "区域二"], ["tutorial", "序章 / 教学局"]]) {
    await ev((region) => __game.flow.go("run", { region }), region);
    const ok = await waitFor(() => __game.flow.name === "run" && __game.run && __game.flow.scenes.run.pause && __game.flow.scenes.run.hudUI && document.querySelector(".mk-layer-loading").classList.contains("hidden"), null, 150000);
    await c.wait(1500);
    await R(() => document.querySelectorAll(".qd-wrap").forEach((d) => d.remove()));
    await esc();
    s = await S();
    T(`${nm}：Esc 呼出暂停菜单`, ok && s.pause && s.paused, s);
    await esc();
    s = await S();
    T(`${nm} › 暂停菜单：再 Esc 关闭`, !s.pause && !s.paused, s);
    await runReset();
  }

  console.log("UI_ESC pageerrors", errs.length, JSON.stringify(errs.slice(0, 5)));
}
