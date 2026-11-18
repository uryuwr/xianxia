// 洞府法术权限：真实标题续卷 → loadGame → cave；不打开设施、不手动 applyStats / setLoadout。
// 主线程串行运行：node tools/run.mjs cave_spell_permissions "scene=title"
// 每个冷启动用例先存 fixture 再整页重载，避免 newGame / 开设施顺手同步技能掩盖问题。
export default async function (page, c) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  const T = (name, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(detail)}`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const all = ["sword_qi", "fire_talisman", "frost"];
  const cases = [
    { name: "已开三栏但未学 E/R", layer: 7, learned: ["sword_qi"], build: all, want: ["sword_qi", null, null] },
    { name: "已学已装已开三栏", layer: 7, learned: all, build: all, want: all },
    { name: "非法 ID 即使在 learned 中", layer: 7, learned: ["sword_qi", "missing_spell_fixture", "frost"], build: ["sword_qi", "missing_spell_fixture", "frost"], want: ["sword_qi", null, "frost"] },
    { name: "已学已装但 E/R 未开栏", layer: 1, learned: all, build: all, want: ["sword_qi", null, null] },
    { name: "已学但卸下 E，R 不左移", layer: 7, learned: all, build: ["sword_qi", null, "frost"], want: ["sword_qi", null, "frost"] },
  ];
  const title = () => page.waitForFunction(() => window.__ready && window.__game?.flow.name === "title" && document.querySelector('.mk-layer-title [data-id="continue"]'), null, { timeout: 180000 });
  // 仅构造磁盘存档，不把 fixture 塞进当前 flow，也不调用任何运行时技能配置入口。
  const seed = (spec, slot = 3) => c.ev(async ({ spec, slot }) => {
    const { newProfile, saveProfile } = await import("/src/core/profile.js");
    const { applyUnlocks } = await import("/src/game/progression.js");
    const { syncNewLearned } = await import("/src/ui/loadout.js");
    const p = newProfile(slot);
    p.realm = { stage: 1, layer: spec.layer };
    p.flags = {
      tutorialDone: true, awakened: true, buildV2: true,
      learned: { spells: [...spec.learned], xinfa: [], formations: [] },
      caveTips: { enter: true },
    };
    applyUnlocks(p);
    // 表示这些功法 / 栏位早已见过；否则洞府的合法“首次领悟补栏”会掩盖主动卸下的空栏。
    syncNewLearned(p);
    p.build.spells = [...spec.build];
    saveProfile(p);
    localStorage.removeItem("moxian.run." + slot);
  }, { spec, slot });
  const observe = () => c.ev(async () => {
    const { setSetting } = await import("/src/game/targeting/settings.js");
    setSetting("quickCast", false);
    if (window.__spellPermissionProbe) return;
    const probe = window.__spellPermissionProbe = { loads: [], opens: [], casts: [], begins: [], entered: 0 };
    const flow = __game.flow, load = flow.loadGame;
    flow.loadGame = function (slot) {
      probe.loads.push({ slot, scene: this.name });
      return load.call(this, slot);
    };
    __game.world.events.on("cave:enter", () => probe.entered++);
    __game.world.events.on("cave:open", (e) => probe.opens.push(e.station));
    __game.world.events.on("skill:cast", (e) => probe.casts.push(e.spell.id));
    __game.world.events.on("target:begin", (e) => probe.begins.push(e.key));
  });
  const snap = () => c.ev(() => {
    const s = __game.ctx.skills, p = __game.profile, t = s.targeting, probe = window.__spellPermissionProbe;
    return {
      scene: __game.flow.name, live: __game.flow.live, slot: p?.slot,
      learned: p?.flags.learned.spells, build: p?.build.spells, slots: s.slots,
      spells: [...s.loadout.spells], aiming: t.aiming, active: t.active?.key || null,
      mp: s.hero.mp, spent: s.stats.mpSpent, denied: s.stats.mpDenied,
      cd: ["Q", "E", "R"].map((k) => s.cd[k] || 0),
      cdMax: ["Q", "E", "R"].map((k) => s.cdMax[k] || 0),
      casts: [...probe.casts], begins: [...probe.begins], loads: [...probe.loads], opens: [...probe.opens],
      cur: window.__cave?.ui.cur || null,
    };
  });
  const enter = async (spec, { cold = false, slot = 3 } = {}) => {
    await c.ev(() => __game.flow.go("title"));
    await seed(spec, slot);
    if (cold) {
      const url = new URL(page.url());
      url.search = "?scene=title";
      await page.goto(url.href);
      await title();
      const boot = await c.ev(async () => {
        const { DEFAULT_LOADOUT } = await import("/src/data/items.js");
        return { profile: __game.flow.profile, spells: __game.ctx.skills.loadout.spells, defaults: DEFAULT_LOADOUT.spells, cave: !!window.__cave };
      });
      T(`${spec.name}：确为标题冷启动，未先进入洞府或改沙盒默认`, boot.profile === null && !boot.cave && same(boot.spells, boot.defaults), boot);
    }
    await observe();
    const entered = await c.ev(() => window.__spellPermissionProbe.entered);
    if (cold) await page.locator('.mk-layer-title [data-id="continue"]').click();
    else {
      await page.locator('.mk-layer-title [data-id="slots"]').click();
      await page.locator(".mk-layer-title .mk-slots .ink-row").nth(slot - 1).getByRole("button", { name: "载入", exact: true }).click();
    }
    await page.waitForFunction((n) => window.__spellPermissionProbe.entered > n && __game.flow.name === "cave" && window.__cave?.active && !document.querySelector(".cv-loading"), entered, { timeout: 180000 });
    const s = await snap(), last = s.loads.at(-1);
    T(`${spec.name}：标题 loadGame → 洞府，不打开设施`, last?.scene === "title" && last.slot === slot && s.slot === slot && s.live && s.opens.length === 0 && !s.cur, s);
    T(`${spec.name}：三槽有效构筑且不改装配/习得`, s.spells.length === 3 && same(s.spells, spec.want) && same(s.build, spec.build) && same(s.learned, spec.learned), s);
  };
  // 等真实主循环消费按键，不用 input.tap（它会绕过预览直接释放）。
  const press = async (key) => {
    await page.keyboard.down(key);
    await c.ev(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.up(key);
    await c.ev(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const readyInput = async () => {
    await page.waitForFunction(() => __game.flow.live && __game.player.state === "move", null, { timeout: 15000 });
    await c.ev(() => {
      const s = __game.ctx.skills;
      s.targeting.cancel(true);
      s.hero.mp = s.hero.stats.get("mp");
      // 权限断言不能靠缺蓝或上一个用例留下的冷却“碰巧拒绝”。只清资源，不改有效构筑。
      for (const key of ["Q", "E", "R"]) s.cd[key] = s.cdMax[key] = 0;
      document.activeElement?.blur();
    });
  };
  const blocked = async (name, i) => {
    const key = ["q", "e", "r"][i];
    await readyInput();
    const b = await snap();
    await press(key);
    const preview = await snap();
    T(`${name} ${key.toUpperCase()}：不产生预览`, !preview.aiming && same(preview.begins, b.begins), { b, preview });
    await press(key);
    const direct = await c.ev((i) => __game.ctx.skills.castSpell(i), i);
    const a = await snap();
    T(`${name} ${key.toUpperCase()}：真实按键与直接施放均拒绝，不耗蓝/不进冷却`, direct === false && !a.aiming && a.mp === b.mp && a.spent === b.spent && a.denied === b.denied && same(a.casts, b.casts) && same(a.cd, b.cd) && same(a.cdMax, b.cdMax), { b, a, direct });
  };
  const usable = async (name, i, id) => {
    const key = ["q", "e", "r"][i];
    await readyInput();
    const cost = await c.ev(async (id) => (await import("/src/data/skills.js")).SPELLS[id].cost, id);
    const b = await snap();
    await press(key);
    const preview = await snap();
    T(`${name} ${key.toUpperCase()}：合法法术可预览，预览不扣蓝`, preview.active === key.toUpperCase() && preview.begins.length === b.begins.length + 1 && preview.mp === b.mp && preview.spent === b.spent && preview.casts.length === b.casts.length, { b, preview });
    await press(key);
    const a = await snap();
    T(`${name} ${key.toUpperCase()}：确认可施放，按定义耗蓝并进入冷却`, !a.aiming && a.casts.length === b.casts.length + 1 && a.casts.at(-1) === id && Math.abs(a.mp - (b.mp - cost)) < 1e-6 && a.spent - b.spent === cost && a.cd[i] > 0 && a.cdMax[i] > 0, { b, a, cost });
  };

  if (!(await c.ev(() => window.__game?.flow.name === "title"))) {
    const url = new URL(page.url());
    url.search = "?scene=title";
    await page.goto(url.href);
  }
  await title();
  for (const spec of cases) {
    await enter(spec, { cold: true });
    // 每个拒绝用例均以合法 Q 作输入正对照，避免“洞府把全部法术禁了”也算通过。
    for (let i = 0; i < 3; i++) {
      if (spec.want[i]) await usable(spec.name, i, spec.want[i]);
      else await blocked(spec.name, i);
    }
  }

  // 同一 SkillSystem 实例跨卷复用：高档 → 低档 → 高档，不能残留上一卷权限。
  await c.ev(() => { window.__samePermissionSkills = __game.ctx.skills; });
  const high = { ...cases[1], name: "同会话高档" }, low = { ...cases[3], name: "同会话低档" };
  for (const [spec, slot] of [[high, 1], [low, 2], [high, 1]]) {
    await enter(spec, { slot });
    T(`${spec.name}：未重建技能系统`, await c.ev(() => window.__samePermissionSkills === __game.ctx.skills));
    for (const i of [1, 2]) {
      if (spec.want[i]) await usable(spec.name, i, spec.want[i]);
      else await blocked(spec.name, i);
    }
  }

  // 边界契约直接测共享 loadoutOf，避免非法原型名让其它 UI 的显示逻辑干扰权限断言。
  const edges = await c.ev(async () => {
    const { loadoutOf } = await import("/src/game/run/run.js");
    const p = JSON.parse(JSON.stringify(__game.profile));
    p.unlocks.spellSlots = 3;
    p.build.spells = ["constructor", "toString", "__proto__"];
    p.flags.learned.spells = [...p.build.spells];
    const before = JSON.stringify(p), invalid = loadoutOf(p).spells;
    const unchanged = before === JSON.stringify(p);
    p.build.spells = ["sword_qi", "fire_talisman", "frost"];
    delete p.flags.learned;
    const missing = loadoutOf(p).spells;
    return { invalid, unchanged, missing, learnedStillMissing: !("learned" in p.flags) };
  });
  T("共享入口：原型属性不当法术定义，不修改传入存档", same(edges.invalid, [null, null, null]) && edges.unchanged, edges);
  T("共享入口：缺失 learned 不生效、不补 learned", same(edges.missing, [null, null, null]) && edges.learnedStillMissing, edges);
  const end = await snap();
  T("续卷与施法检查全程无设施打开、无页面运行错误", end.opens.length === 0 && !end.cur && errors.length === 0, { opens: end.opens, cur: end.cur, errors });

  // 洞府再出行仍走同一有效构筑，不被备战页面或 run 初始化补回非法 E/R。
  await enter(cases[0], { slot: 3 });
  await c.ev(() => { __game.flow.go("prep"); });
  await page.waitForSelector('.mk-prep [data-id="depart"]');
  await page.locator('.mk-prep [data-id="depart"]').click();
  await page.waitForFunction(() => __game.flow.name === "run" && __game.run?.state === "play", null, { timeout: 180000 });
  const run = await snap();
  T("洞府再出行：仍只启用已学法术，不补回非法 E/R", same(run.spells, cases[0].want) && same(run.learned, cases[0].learned), run);
  T("出行切换无页面运行错误", errors.length === 0, errors);
}
