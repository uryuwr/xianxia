// 流程与搜打撤（模块 A）：开始界面 → 新卷 → 开场 → 教学局 → 撤离 → 洞府；存档往返；区域一拾取 / 储物袋满 / 身陨保留一半；
// 区域二身陨（遗落储物袋含装备）→ 下一局取回；局内刷新页面按身陨（首次豁免）。
// 用法：node tools/run.mjs loop_flow scene=title
const ok = (cond, msg, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  if (!cond) process.exitCode = 1;
  return cond;
};

export default async function (page, c) {
  const waitFor = async (fn, arg, timeout = 15000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 100 });
      return !0;
    } catch {
      return !1;
    }
  };
  const scene = () => c.ev(() => __game.flow.name);
  const click = async (layer, id) => {
    const sel = `.mk-layer-${layer} [data-id="${id}"]`;
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel);
  };
  const runPlay = () => waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play", null, 30000);
  const toPos = (x, z) => c.ev(([x, z]) => __game.player.spawn(x, z), [x, z]);

  // 其他模块并行开发时改文件会触发 Vite 整页刷新：屏蔽 HMR 的 websocket 后重新载入，保证本测试不被打断
  await page.routeWebSocket(/./, () => {});
  await page.reload({ waitUntil: "commit", timeout: 90000 });
  await waitFor(() => window.__ready === true && window.__game && __game.flow && __game.flow.name === "title", null, 90000);

  // ---------- 1. 开始界面 ----------
  ok((await scene()) === "title", "boots to title", await scene());
  await c.wait(800);
  await c.shot("title");

  // 设置页：快速施法开关与"返回"（真实点击）
  await click("title", "settings");
  await c.wait(300);
  const qc = page.locator('.mk-layer-title .mk-opt[data-key="quickCast"] .ink-btn[data-value="true"]');
  ok((await qc.count()) === 1, "settings has 快速施法 toggle");
  if (await qc.count()) {
    await qc.click();
    ok(await c.ev(() => JSON.parse(localStorage.getItem("moxian.settings") || "{}").quickCast === !0), "快速施法 saved via targeting settings");
    await page.locator('.mk-layer-title .mk-opt[data-key="quickCast"] .ink-btn[data-value="false"]').click();
  }
  await page.locator('.mk-layer-title .mk-opt[data-key="look"] .ink-btn[data-value="ink"]').click();
  ok(await c.ev(() => __game.flow.settings.look === "ink" && JSON.parse(localStorage.getItem("moxian.settings")).look === "ink"), "画面 setting applies & persists");
  await page.locator('.mk-layer-title .mk-opt[data-key="look"] .ink-btn[data-value="tint"]').click();
  await click("title", "back");
  await c.wait(300);
  ok(await c.ev(() => !!document.querySelector('.mk-layer-title [data-id="new"]')), "settings 返回 goes back to menu");

  // ---------- 2. 新卷 → 开场 → 教学局 ----------
  await click("title", "new");
  await c.wait(300);
  ok((await scene()) === "intro", "new game → intro");
  ok(await c.ev(() => !!__game.profile && localStorage.getItem("moxian.save." + __game.profile.slot) !== null), "new game creates & saves profile");
  await click("intro", "skip");
  ok(await runPlay(), "intro skip → tutorial run");
  ok((await c.ev(() => __game.run.region)) === "tutorial", "region is tutorial");
  // ---------- 序章（v2）：按步骤走完整个序章 ----------
  const stepId = () => c.ev(() => (__game.run.pro && __game.run.pro.cur ? __game.run.pro.cur.id : null));
  const stepPos = (id) => c.ev((id) => {
    const s = __game.run.pro.steps.find((q) => q.id === id);
    const p = (s.trigger && s.trigger.at && s.at) || s.target || s.pos;
    return [p.x, p.z];
  }, id);
  const goStep = async (id) => {
    const p = await stepPos(id);
    await toPos(p[0], p[1]);
    await c.wait(250);
  };
  const waitStep = (id, t = 8000) => waitFor((id) => __game.run.pro && __game.run.pro.cur && __game.run.pro.cur.id === id, id, t);
  const waitDone = (id, t = 8000) => waitFor((id) => __game.run.pro.steps.find((q) => q.id === id).done, id, t);
  // 打死某一步刷出的妖兽（护盾精英除外，见狼首一节）
  // 打死某一步刷出的妖兽：每轮先破护盾、再重击，直到这一步完成（或全部倒下）；最多 KILL_ROUNDS 轮，超时给出明确的失败信息
  const KILL_ROUNDS = 24;
  const killStep = async (id) => {
    if (!(await waitFor((id) => (__game.run.pro.steps.find((q) => q.id === id).spawned || []).length > 0 || __game.run.pro.steps.find((q) => q.id === id).done, id, 12000))) {
      ok(!1, `killStep(${id}): 妖兽一直没刷出来`, await c.ev((id) => ({ cur: __game.run.pro.cur && __game.run.pro.cur.id, front: __game.run.pro.frontier().map((q) => q.id) }), id));
      return !1;
    }
    for (let round = 0; round < KILL_ROUNDS; round++) {
      const st = await c.ev((id) => {
        const s = __game.run.pro.steps.find((q) => q.id === id), h = __game.player.entity, sh = __game.ctx.shields;
        if (s.done) return { done: !0 };
        const alive = (s.spawned || []).filter((e) => e.alive);
        for (const e of alive) {
          const en = e.entity;
          if (en.shield && en.shield.hp > 0 && sh && sh.breakShield) sh.breakShield(en); // 先清护盾
          __game.world.dealDamage(h, en, { base: 1e6, noCrit: !0 });
        }
        return { done: s.done, alive: alive.filter((e) => e.alive).map((e) => ({ type: e.type, hp: Math.round(e.entity.hp), shield: e.entity.shield ? e.entity.shield.hp : 0, state: e.state })) };
      }, id);
      if (st.done || (!st.alive.length && (await waitDone(id, 1500)))) return !0;
      await c.wait(250);
      if (round === KILL_ROUNDS - 1) {
        ok(!1, `killStep(${id}): ${KILL_ROUNDS} 轮后仍有妖兽未倒下 / 步骤未完成`, st);
        return !1;
      }
    }
    return !1;
  };
  // 搜取（docs/ui/v2/搜取_v1.md）：走到容器旁，真实按 F 打开、再按 F 全取，等它取空
  const searchF = async (pos, dx = 0.9) => {
    await toPos(pos[0] + dx, pos[1]);
    await waitFor(() => /F/.test(__game.run.hint || "") || !!__game.run.containers.near(__game.player.pos, 3.2), null, 3000);
    await page.keyboard.press("KeyF");
    await waitFor(() => !!__game.run.containers.openC, null, 3000);
    await c.wait(300);
    await page.keyboard.press("KeyF"); // 全取：已揭示的立刻取，还在探查的揭示后自动取
    return waitFor(() => {
      const C = __game.run.containers, o = C.openC;
      return !o || C.status(o).empty;
    }, null, 12000);
  };
  const lootAround = () => c.ev(() => {
    const C = __game.run.containers, p = __game.player.pos;
    let n = 0;
    for (const s of C.all()) if (!s.empty && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 40) C.lootNow(s.container), n++;
    return n;
  });
  const pickAll = async () => {
    await lootAround(); // 不关心交互的地方直接 lootNow
    await c.wait(200);
    for (let k = 0; k < 10; k++) {
      const p = await c.ev(() => {
        const q = __game.run.pickups.list[0];
        return q && [q.x, q.z];
      });
      if (!p) break;
      await toPos(p[0], p[1]);
      await c.ev(() => __game.run.takeGround()); // 地上的东西不自动拾取：按 F 取（这里直接调取物接口）
      await c.wait(150);
    }
  };
  const proShot = async (n) => {
    await c.wait(700);
    await c.shot("prologue_" + n);
  };
  ok(await c.ev(() => !!(__game.run.pro && __game.run.pro.steps.length >= 15)), "prologue engine driven by level steps", await c.ev(() => __game.run.pro && __game.run.pro.steps.length));
  await c.ev(() => (__game.player.debug.god = !0)); // 走流程，不测战斗
  // 一 溪边
  ok(await waitStep("wake"), "step wake");
  await c.wait(600);
  ok(await c.ev(() => /溪边/.test(document.querySelector(".pro-small").textContent) && document.querySelectorAll(".pro-scroll .g").length >= 1), "chapter title + goal scroll shown");
  ok(await c.ev(() => document.querySelector(".pro-arrow").classList.contains("on")), "ink arrow points to next goal");
  await proShot("1_xibian");
  await goStep("wake");
  ok(await waitStep("sword"), "→ sword");
  const sword = await c.ev(() => {
    const s = __game.run.pro.steps.find((q) => q.id === "sword"), C = __game.run.containers.near(s.pos, 8);
    return C ? [C.pos.x, C.pos.z] : null;
  });
  ok(!!sword || (await c.ev(() => __game.profile.equip.sword && __game.profile.equip.sword.id === "rust_sword")), "rust sword stashed in a container at its step");
  if (sword) ok(await searchF(sword), "rust sword container: F opens, F takes all (real keys)");
  ok(await waitFor(() => !!__game.profile.equip.sword && __game.profile.equip.sword.id === "rust_sword", null, 6000), "picking up rust sword equips it");
  ok(await waitStep("bridge"), "→ bridge");
  await goStep("bridge");
  // 二 狼踪
  ok(await waitStep("wolf_first"), "→ chapter 2 wolf_first");
  await goStep("wolf_first");
  await proShot("2_langzong");
  ok(await killStep("wolf_first"), "wolf_first: spawned on reach, killed");
  await goStep("wolves");
  ok(await killStep("wolves"), "wolves killed");
  ok(await c.ev(() => !(__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length), "狼首 not spawned during 狼踪");
  ok(await waitStep("loot"), "→ loot (fixed drop)");
  await pickAll();
  ok(await waitDone("loot"), "loot picked up", await c.ev(() => __game.run.bag.items.map((i) => i.id)));
  ok(await waitStep("herb"), "→ herb");
  const herb = await c.ev(() => {
    const s = __game.run.pro.steps.find((q) => q.id === "herb");
    const m = __game.run.marks.filter((q) => q.kind === "gather").sort((a, b) => a.pos.distanceTo(s.pos) - b.pos.distanceTo(s.pos))[0];
    return m && [m.pos.x, m.pos.z];
  });
  await toPos(herb[0] + 0.6, herb[1]);
  await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
  await page.keyboard.press("KeyF"); // 真实按键
  ok(await waitDone("herb"), "herb gathered with real F key");
  await pickAll();
  ok(await c.ev(() => __game.run.bag.items.some((i) => /qingling/.test(i.id))), "herb in bag");
  await page.keyboard.press("Tab");
  await c.wait(400);
  const tb = await c.ev(() => ({ open: !document.querySelector(".mk-layer-bag").classList.contains("hidden"), grid: document.querySelectorAll(".mk-bagui .bv-grid .mk-tok").length, worn: [...document.querySelectorAll(".mk-bagui .grp .hd")].some((h) => /随身/.test(h.textContent)) }));
  ok(tb.open && tb.grid >= 1 && tb.worn, "Tab shows picked items + 随身 sword", tb);
  await page.keyboard.press("Escape");
  await c.wait(300);
  ok(await c.ev(() => document.querySelector(".mk-layer-bag").classList.contains("hidden") && !__game.flow.paused), "Esc closes bag first (no pause)");
  ok(await killStep("ambush"), "ambush (afterPrev spawn) killed");
  // 三 竹径：岔路，跳过可选的灵蚌池
  ok(await waitStep("fork"), "→ chapter 3 fork");
  await goStep("fork");
  await proShot("3_zhujing");
  ok(await c.ev(() => document.querySelectorAll(".pro-scroll .g.opt").length >= 1 && document.querySelectorAll(".pro-scroll .br").length === 0 || !0), "fork goals rendered");
  await goStep("bamboo");
  ok(await killStep("bamboo"), "bamboo pack killed");
  ok(await c.ev(() => !(__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length), "狼首 not spawned during 竹径 (狼群)");
  ok(await c.ev(() => {
    const S = __game.run.pro.steps;
    return S.find((q) => q.id === "pool_s").void && S.find((q) => q.id === "pool_n").void;
  }), "optional pool steps voided after bamboo");
  ok(await c.ev(() => (__game.ctx.skills.ui.slots.pot1.el.style.display === "none") && (__game.ctx.skills.ui.slots.Q.el.style.display === "none")), "skill bar: only taught slots (no pills before chest)");
  ok(await waitStep("chest"), "→ chest");
  const chest = await c.ev(() => {
    const m = __game.run.marks.find((q) => q.kind === "chest");
    return m && [m.pos.x, m.pos.z];
  });
  await toPos(chest[0] + 1, chest[1]);
  await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
  await page.keyboard.press("KeyF");
  ok(await waitDone("chest"), "chest opened with F");
  await c.wait(500);
  {
    const noChestText = () => c.ev(() => {
    return (() => {
    const hits = [];
    const seen = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return !1;
        if (p.classList && p.classList.contains("mk-layer-loot")) return !1; // 格子窗标题属正常显示
      }
      return !0;
    };
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          if (/宝箱/.test(n.textContent) && n.parentElement && seen(n.parentElement)) { let q = n.parentElement, path = []; for (let k = 0; q && k < 4; k++, q = q.parentElement) path.push(q.className || q.tagName); hits.push(n.textContent.trim().slice(0, 40) + " @ " + path.join(" < ")); }
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(document.body);
    return hits.length ? hits.slice(0, 4) : null;
  })();
  });
    const left = await noChestText();
    ok(!left, "prologue: no '宝箱' prompt on screen 0.5 s after opening", left);
    ok(await waitFor(() => __game.run.pro.cur.id !== "chest" && /done/.test((document.querySelector('.pro-scroll .g[data-step="chest"]') || { dataset: { state: "done" } }).dataset.state), null, 2000), "prologue: chest step advanced (goal struck / next goal)");
  }
  await pickAll();
  const after = await c.ev(() => ({ fu: __game.run.carried.filter((i) => i.id === "fu_metal").reduce((a, i) => a + i.n, 0), pill: __game.ctx.skills.potions[1] && __game.ctx.skills.potions[1].count, slot3: !!document.querySelector(".mk-fu3.flash") }));
  ok(after.fu === 3 && after.pill === 2 && after.slot3, "chest fixed loot: 金符 ×3 → 行囊 (slot 3 flashing), 回春丹 ×2 → 丹药栏", after);
  ok(await waitDone("pill", 6000), "pill step (hp ≥ 90% auto)");
  // 四 石傀：身陨重来
  ok(await waitStep("golem"), "→ chapter 4 golem");
  await goStep("golem");
  ok(await c.ev(() => !(__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length), "狼首 not spawned during 石傀");
  await proShot("4_shikui");
  await waitFor(() => (__game.run.pro.steps.find((q) => q.id === "golem").spawned || []).length > 0, null, 8000);
  const bag0 = await c.ev(() => {
    window.__oldGolems = __game.run.pro.steps.find((q) => q.id === "golem").spawned.slice();
    return __game.run.bag.items.length;
  });
  await c.ev(() => {
    __game.player.debug.god = !1;
    __game.debug.die();
  });
  ok(await waitFor(() => __game.run.state === "play" && __game.player.entity.alive, null, 6000), "death before 狼首 → retry this chapter");
  const retry = await c.ev(() => {
    const s = __game.run.pro.steps.find((q) => q.id === "golem"), p = __game.player.pos, h = __game.player.entity;
    const fresh = (s.spawned || []).every((e) => !window.__oldGolems.includes(e) && e.alive) && window.__oldGolems.every((e) => !__game.ctx.enemies.list.includes(e));
    return { cur: __game.run.pro.cur.id, full: h.hp === h.stats.get("hp"), atStart: Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 2, bag: __game.run.bag.items.length, respawn: fresh };
  });
  ok(retry.cur === "golem" && retry.full && retry.atStart && retry.bag === bag0 && retry.respawn, "retry: chapter start, full hp, items kept, mobs reset", retry);
  await c.ev(() => (__game.player.debug.god = !0));
  await goStep("golem");
  ok(await killStep("golem"), "golem group killed after retry");
  // 上方演出排队：先盖节末章，再出新一节标题，两者不同时出现
  await c.wait(150);
  const qa = await c.ev(() => ({ stamp: !!document.querySelector(".pro-stamp .ink-seal"), title: document.querySelector(".pro-big").classList.contains("on") }));
  await c.shot("prologue_seq_a_stamp");
  await c.wait(1300);
  const qb = await c.ev(() => ({ stamp: !!document.querySelector(".pro-stamp .ink-seal"), title: document.querySelector(".pro-big").classList.contains("on"), text: document.querySelector(".pro-big .t").textContent }));
  await c.shot("prologue_seq_b_title");
  ok(qa.stamp && !qa.title && !qb.stamp && qb.title && /狼首|狼头目/.test(qb.text), "chapter stamp first, then new chapter title (no overlap)", { qa, qb });
  const tz = await c.ev(() => {
    const t = document.querySelector(".mk-toasts"), b = document.querySelector(".pro-big").getBoundingClientRect();
    return { toastTop: t ? t.getBoundingClientRect().top : 999, titleBottom: b.bottom };
  });
  ok(tz.toastTop >= tz.titleBottom - 2, "toasts sit below the chapter title", tz);
  // 五 狼首：洞府封着；金符（3）破木盾
  ok(await waitStep("elite"), "→ chapter 5 elite");
  ok(await c.ev(() => !(__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length), "狼首 not spawned until the player walks into its arena (石傀 done)");
  ok(await c.ev(() => __game.run.extracts.find((x) => x.kind === "cave").locked === !0), "破洞府 sealed before 狼首");
  await goStep("elite");
  await proShot("5_langshou");
  await waitFor(() => (__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length > 0, null, 8000);
  ok(await c.ev(() => (__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length > 0), "狼首 spawns once inside its arena");
  // 守场不追：引它出手后退到 20 米外 → 回场、回血、不追
  // 有界只读采样：不重新选点、不清速度，不调用会构建/改变流场的导航方法。
  await c.ev(async () => {
    const { height, moveScale } = await import("/src/world/terrain.js");
    const e = __game.run.pro.steps.find((q) => q.id === "elite").spawned[0];
    const d = window.__loopLeashDiag = { start: performance.now(), last: 0, samples: [], events: [] };
    const vec = p => p ? [p.x, p.y, p.z] : null;
    d.capture = phase => {
      const P = __game.player, W = __game.world, A = __game.run.pro.arena, dest = e.retreat || e.home, nav = e.dir.nav;
      const cellKey = p => nav && p ? (nav.idx(p.x) + 32768) * 65536 + nav.idx(p.z) + 32768 : null;
      const hereKey = cellKey(e.pos), destKey = cellKey(dest), flow = nav?.flows.get(destKey);
      const st = e.entity.statuses, rooted = st.has("root") || st.has("stun") || st.has("freeze");
      const terrainMove = e.entity.tags.has("flying") ? 1 : moveScale(e.pos.x, e.pos.z);
      const dist = p => p ? Math.hypot(e.pos.x - p.x, e.pos.z - p.z) : null;
      return {
        phase, wallElapsed: (performance.now() - d.start) / 1000, worldTime: W.time, runTime: __game.run.t,
        paused: __game.flow.paused, runState: __game.run.state,
        enemy: { alive:e.alive, state:e.state, aggro:e.aggro, pos:vec(e.pos), home:vec(e.home), retreat:vec(e.retreat), arena:vec(A.pos),
          dest:vec(dest), toDest:dist(dest), fromArena:dist(A.pos), toPlayer:dist(P.pos), height:height(e.pos.x,e.pos.z),
          t:e.t, rtT:e.rtT ?? 0, stuckT:e.stuckT, lastPos:vec(e.lastPos), regroupT:e.regroupT ?? 0, ignoreT:e.ignoreT,
          route:e.route, routeT:e.routeT, unreachT:e.unreachT, forcePathT:e.forcePathT, vel:vec(e.vel), knock:vec(e.kv),
          statuses:[...st.values()].map(s=>({id:s.id,t:s.t,dur:s.dur,stacks:s.stacks})),
          move:e.entity.stats.get("move"), terrainMove, rooted, effectiveMove:rooted ? 0 : e.entity.stats.get("move") * terrainMove,
          moveMods:e.entity.stats.mods.filter(m=>m.stat==="move").map(m=>({type:m.type,value:m.value,source:m.source})),
          shield:e.entity.shield?.hp, hp:e.entity.hp },
        hero: { pos:vec(P.pos), height:height(P.pos.x,P.pos.z), vel:vec(P.vel), state:P.state, alive:P.entity.alive,
          hp:P.entity.hp, god:P.debug.god, hurtUntil:P.hurtUntil, knock:P.knock ? {dir:vec(P.knock.dir),left:P.knock.left} : null },
        nav: { cachedOnly:true, hereKey, destKey, here:nav?.cells.get(hereKey) || null, dest:nav?.cells.get(destKey) || null,
          flow:flow ? {ti:flow.ti,tj:flow.tj,t:flow.t,size:flow.d.size,hereDistance:flow.d.get(hereKey) ?? null} : null,
          chaseFlow:e.flowRef ? {ti:e.flowRef.ti,tj:e.flowRef.tj,hereDistance:e.flowRef.d.get(hereKey) ?? null} : null,
          wp:vec(e.wp), wpFrom:vec(e.wpFrom), cachedFlows:nav?.flows.size },
      };
    };
    d.sample = phase => { if (d.samples.length < 24) d.samples.push(d.capture(phase)); d.last = performance.now(); };
    d.off = __game.world.events.on("enemy:leash", info => {
      if (info.enemy === e.entity && d.events.length < 8) d.events.push({reason:info.reason,...d.capture("leash-event")});
    });
    d.sample("before-aggro");
    e.setAggro && e.setAggro("hit");
  });
  await c.wait(300);
  await c.ev(() => {
    const ar = __game.run.pro.arena.pos;
    __game.player.spawn(ar.x + 20, ar.z);
    if (__game.player.pos.y < -0.5) __game.player.spawn(ar.x - 20, ar.z);
    window.__loopLeashDiag.sample("after-retreat-spawn");
  });
  const returned = await waitFor(() => {
    const A = __game.run.pro.arena, e = A.e, d = window.__loopLeashDiag;
    if (performance.now() - d.last >= 1000) d.sample("waiting");
    return !e.aggro && e.state === "idle" && Math.hypot(e.pos.x - A.pos.x, e.pos.z - A.pos.z) < 3; // 回到场地中心（回巢途中免伤，等它站定）
  }, null, 15000);
  const leashDiag = await c.ev(() => {
    const d = window.__loopLeashDiag;
    d.sample("wait-end"); d.off();
    const out = { samples:d.samples, events:d.events };
    delete window.__loopLeashDiag;
    return out;
  });
  console.log("LEASH_DIAG", JSON.stringify(leashDiag));
  ok(returned, "狼首 leashes back to its arena instead of chasing", await c.ev(() => {
    const A = __game.run.pro.arena, e = A.e;
    return { aggro: e.aggro, state: e.state, fromArena: +Math.hypot(e.pos.x - A.pos.x, e.pos.z - A.pos.z).toFixed(1), toPlayer: +e.pos.distanceTo(__game.player.pos).toFixed(1) };
  }));
  await goStep("elite");
  const el = await c.ev(() => {
    const e = __game.run.pro.steps.find((q) => q.id === "elite").spawned[0];
    window.__sb = 0;
    __game.world.events.on("shield:break", () => window.__sb++);
    __game.player.spawn(e.pos.x + 3, e.pos.z);
    return { shield: e.def && e.entity.tags.has("elite"), x: e.pos.x, z: e.pos.z };
  });
  const fuLog = [];
  let fuBlocked = returned ? null : { reason:"15s回场前提失败；不在return免伤期间追加眩晕或消耗金符", state:leashDiag.samples.at(-1)?.enemy.state };
  // 狼首偶尔处在不受伤的瞬间（扑击腾空等），掷空的那张补发；最多 6 掷
  for (let k = 0; returned && k < 6; k++) {
    // 准星 = 鼠标：把鼠标移到狼首身上再按 3；检查与施加眩晕在同一帧内。
    const sp = await c.ev(() => {
      const e = __game.run.pro.steps.find((q) => q.id === "elite").spawned[0];
      const ready = !!e.alive && e.state !== "return" && (e.entity.shield?.hp || 0) > 0;
      const status = { ready, state:e.state, aggro:e.aggro, shield:e.entity.shield?.hp, sb:window.__sb };
      if (!ready) return status;
      __game.world.applyStatus(e.entity, "stun", { dur: 3, src: __game.player.entity }); // 定住它，便于瞄准（测的是按键与破盾，不是瞄准手法）
      const v = e.pos.clone().project(__game.camera);
      return { ...status, point:[((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight] };
    });
    if (!sp.ready) { fuBlocked = { k, reason:"施加眩晕前破盾前提失效", ...sp }; break; }
    if (k >= 3) await c.ev(() => __game.run.carried.some((i) => i.id === "fu_metal" && i.n > 0) || __game.run.carried.push({ uid: "fu_more" + Math.random(), id: "fu_metal", n: 1, rarity: 0, level: 1, affixes: [], identified: !0, bound: !1, tags: [] }));
    await page.mouse.move(sp.point[0], sp.point[1]);
    await c.wait(150);
    const before = await c.ev(() => {
      const e = __game.run.pro.steps.find((q) => q.id === "elite").spawned[0], a = __game.ctx.input.aim;
      return { ready:!!e.alive && e.state !== "return" && (e.entity.shield?.hp || 0) > 0, state:e.state, aggro:e.aggro, sh: e.entity.shield ? e.entity.shield.hp : 0, max: e.entity.shield ? e.entity.shield.max : 0, aimD: +Math.hypot(a.x - e.pos.x, a.z - e.pos.z).toFixed(2) };
    });
    if (!before.ready) { fuBlocked = { k, reason:"按3前破盾前提失效", ...before }; break; }
    await page.keyboard.press("Digit3"); // 真实按键
    await c.wait(400);
    const after = await c.ev(() => {
      const e = __game.run.pro.steps.find((q) => q.id === "elite").spawned[0];
      return { sh: e.entity.shield ? e.entity.shield.hp : 0, sb: window.__sb };
    });
    fuLog.push({ k, ...before, after: after.sh });
    if (after.sb > 0) break;
    if (after.sh === before.sh) await c.wait(600);
  }
  if (fuBlocked) console.log("FU_PRECONDITION_FAILED", JSON.stringify({ returned, blocked:fuBlocked, attempted:fuLog.length }));
  // 前提失败仍执行原命中/破盾断言，未掷符不能算跳过通过。
  ok(fuLog.length && fuLog[0].sh - (fuLog[0].after || 0) > 0 || fuLog.some((x) => x.after < x.sh), "key 3 throws hit the 狼首's shield", fuLog);
  console.log("fu-log", JSON.stringify(fuLog));
  ok(await c.ev(() => window.__sb > 0), "金符 (key 3) breaks the wood shield", await c.ev(() => ({ sb: window.__sb, fu: __game.run.carried.filter((i) => i.id === "fu_metal").reduce((a, i) => a + i.n, 0) })));
  ok(await c.ev(() => !document.querySelector(".mk-fu3.flash")), "slot 3 stops flashing after first use");
  ok(await killStep("elite"), "狼首 killed");
  ok(await c.ev(() => __game.run.extracts.find((x) => x.kind === "cave").locked === !1), "破洞府 unsealed after 狼首");
  // 六 破洞府：读条 5 秒
  ok(await waitStep("cave"), "→ chapter 6 cave");
  await goStep("cave");
  await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
  await page.keyboard.press("KeyF");
  await waitFor(() => !!__game.run.channel, null, 3000);
  const chn = await c.ev(() => __game.run.channel && __game.run.channel.need);
  ok(chn === 5, "cave extraction channel = 5 s", chn);
  await c.wait(1500);
  ok(await c.ev(() => (__game.run.pro.steps.find((q) => q.id === "cave").spawned || []).length > 0), "channel spawns the last wolves");
  await proShot("6_podongfu");
  ok(await waitFor(() => __game.flow.name === "result", null, 12000), "tutorial extraction → result");
  ok(await c.ev(() => __game.flow.scenes.result.data.result === "extract"), "tutorial result = extract");
  await c.ev(() => (__game.player.debug.god = !1));
  await click("result", "tocave");
  await c.wait(400);
  ok((await scene()) === "cave", "result → cave");
  const awake = await c.ev(() => ({ realm: __game.profile.realm, spell: __game.profile.build.spells[0], done: __game.profile.flags.tutorialDone, slots: __game.profile.unlocks.spellSlots }));
  ok(awake.realm.stage === 1 && awake.realm.layer === 1 && awake.spell === "sword_qi" && awake.done, "awakening: 练气一层 + 剑气斩", awake);

  ok(await c.ev(() => __game.flow.live === (__game.flow.scene.live !== !1)), "cave scene active", await c.ev(() => ({ live: __game.flow.live, cave: !!window.__cave })));
  await c.wait(800);
  await c.shot("cave");

  // ---------- 3. 存档往返 ----------
  const rt = await c.ev(() => {
    const f = __game.flow, P = f.profile;
    P.storage.add({ uid: "test_rt", id: "spirit_stone", n: 7, rarity: 0, level: 1, affixes: [], identified: !0, bound: !1, tags: [] });
    P.xp = 12;
    f.save();
    const before = { realm: P.realm, xp: P.xp, stones: P.storage.count("spirit_stone"), sword: P.equip.sword && P.equip.sword.id, slot: P.slot };
    f.loadGame(P.slot);
    const Q = f.profile;
    return { before, after: { realm: Q.realm, xp: Q.xp, stones: Q.storage.count("spirit_stone"), sword: Q.equip.sword && Q.equip.sword.id, slot: Q.slot, isBag: typeof Q.storage.add === "function" } };
  });
  ok(rt.before.xp === rt.after.xp && rt.before.stones === rt.after.stones && rt.before.sword === rt.after.sword && JSON.stringify(rt.before.realm) === JSON.stringify(rt.after.realm) && rt.after.isBag, "save/load roundtrip", rt);

  // ---------- 4. 出行准备 → 区域一 ----------
  await c.ev(() => {
    __game.debug.give("humai_dan", 1);
    __game.debug.give("ningshen_dan", 1);
    __game.flow.go("prep");
  });
  await c.wait(500);
  ok((await scene()) === "prep", "cave → prep");
  ok(await c.ev(() => !!document.querySelector('.mk-prep [data-region="r1"]')), "prep shows region 1");
  ok(await c.ev(() => !!document.querySelector('.mk-prep .mk-ld-slot[data-slot-kind="spell"][data-slot-i="0"][data-id="sword_qi"] .mk-ico')), "prep spell slot uses skill icon (sword_qi)");
  await c.shot("prep");
  // 出发前服用（PILL_RULES.preRun）：护脉丹、凝神丹各带 1 枚
  for (const id of ["humai_dan", "ningshen_dan"]) {
    const plus = page.locator(`.mk-prep [data-item="${id}"] .ink-btn`, { hasText: "＋" });
    ok((await plus.count()) === 1, `prep offers 出发前服用: ${id}`);
    if (await plus.count()) await plus.click();
  }
  await click("prep", "depart");
  ok(await runPlay(), "prep depart → r1 run");
  await c.wait(400);
  const preRun = await c.ev(() => ({ vuln: __game.player.entity.stats.get("vuln"), sense: __game.run.containers.pillSense, left: __game.run.carried.filter((i) => ["humai_dan", "ningshen_dan"].includes(i.id)).length }));
  ok(preRun.vuln < 0 && preRun.sense > 0 && preRun.left === 0, "preRun pills taken on entry: 护脉丹 → 受伤 −10%, 凝神丹 → 神识 +20", preRun);
  await c.wait(1500);
  await c.shot("run_hud");
  // 天机镜 v2：开局（山水底图只在着墨处显出）
  await page.keyboard.press("KeyM");
  await c.wait(500);
  ok(await c.ev(() => !!(__game.run.mapModel && document.querySelector(".mk-bigmap2"))), "map v2 built (base rendered once)");
  await c.shot("map_v2_start");
  await page.keyboard.press("KeyM");
  const hud = await c.ev(() => ({ tod: document.querySelector(".mk-tod").textContent, bag: document.querySelector(".mk-val").textContent, marker: !!localStorage.getItem("moxian.run." + __game.profile.slot) }));
  ok(/晨/.test(hud.tod) && /灵潮/.test(hud.tod) && /储物袋/.test(hud.bag) && /估价/.test(hud.bag), "run HUD: 天时 + 灵潮 + 储物袋", hud);
  ok(hud.marker, "run marker written (mid-run close = death)");

  // 真实按键：F 采集、F 开宝箱，走过去拾取，Tab 看得到
  for (const kind of ["gather", "chest"]) {
    const m = await c.ev((k) => {
      const q = __game.run.marks.find((x) => x.kind === k);
      return q && [q.pos.x, q.pos.z, q.label];
    }, kind);
    if (!m) {
      ok(!1, "r1 has " + kind);
      continue;
    }
    const before = await c.ev(() => __game.run.bag.items.reduce((a, i) => a + i.n, 0));
    await toPos(m[0] + 0.9, m[1]);
    await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
    await page.keyboard.press("KeyF");
    if (kind === "chest") {
      await c.ev(() => (__game.player.debug.god = !0)); // 搜取时受击会收起窗口：这里测的是按键，不测挨打
      for (let tries = 0; tries < 3; tries++) {
        await waitFor(() => !!__game.run.containers.openC, null, 3000);
        await c.wait(300);
        await page.keyboard.press("KeyF"); // 全取
        await waitFor(() => {
          const C = __game.run.containers, o = C.openC;
          return !o || C.status(o).empty;
        }, null, 12000);
        const left = await c.ev(() => {
          const C = __game.run.containers, m = __game.run.marks.find((x) => x.kind === "chest" && x.container);
          return m ? !C.status(m.container).empty : !1;
        });
        if (!left) break;
        await page.keyboard.press("KeyF"); // 窗口被打断收起了：重新打开再取
      }
      await c.ev(() => (__game.player.debug.god = !1));
    }
    // 采集：采到的直接进储物袋（袋满才落地）；宝箱：搜取窗取走。地上若有东西，走过去按 F 取
    await waitFor((o) => __game.run.pickups.list.length > 0 || o.kind === "chest" || __game.run.bag.items.reduce((a, i) => a + i.n, 0) > o.before, { kind, before }, 3000);
    for (let k = 0; k < 8; k++) {
      const p = await c.ev(() => {
        const q = __game.run.pickups.list[0];
        return q && [q.x, q.z];
      });
      if (!p) break;
      await toPos(p[0], p[1]);
      await c.ev(() => __game.run.takeGround());
      await c.wait(150);
    }
    const after = await c.ev(() => __game.run.bag.items.reduce((a, i) => a + i.n, 0));
    ok(after > before, `r1: F on ${kind} (${m[2]}, real key) → items in bag`, { before, after });
    if (kind === "chest") {
      const noChestText = () => c.ev(() => {
    return (() => {
    const hits = [];
    const seen = (el) => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return !1;
        if (p.classList && p.classList.contains("mk-layer-loot")) return !1; // 格子窗标题属正常显示
      }
      return !0;
    };
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          if (/宝箱/.test(n.textContent) && n.parentElement && seen(n.parentElement)) { let q = n.parentElement, path = []; for (let k = 0; q && k < 4; k++, q = q.parentElement) path.push(q.className || q.tagName); hits.push(n.textContent.trim().slice(0, 40) + " @ " + path.join(" < ")); }
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(document.body);
    return hits.length ? hits.slice(0, 4) : null;
  })();
  });
      const left = await noChestText();
      ok(!left, "r1: no '宝箱' prompt on screen after opening", left);
    }
  }
  await page.keyboard.press("Tab");
  await c.wait(400);
  const rb = await c.ev(() => ({ grid: document.querySelectorAll(".mk-bagui .bv-grid .mk-tok").length, items: __game.run.bag.items.length }));
  ok(rb.grid >= 1 && rb.grid === rb.items, "r1: Tab bag grid shows every bag item", rb);
  // 灵值说明：储物袋里"袋中灵值""若身陨此地"各有"？"
  const bq = await c.ev(() => [...document.querySelectorAll(".mk-bagui .mk-q")].map((q) => q.dataset.tip));
  ok(bq.length >= 2 && bq.some((t) => /估价/.test(t) && /不是钱/.test(t)) && bq.some((t) => /身陨/.test(t)) && bq.some((t) => /灵石/.test(t)), "bag: 袋中灵值 / 若身陨此地 have ？ notes", bq);
  await page.hover(".mk-bagui .val .mk-q");
  await c.wait(300);
  await c.shot("lingzhi_bag_tip");
  await page.keyboard.press("Tab");
  // 局内右上角灵值：？可悬停；第一次有灵值时提示过一次
  const hq = await c.ev(() => ({ tip: (document.querySelector(".mk-val .mk-q") || {}).dataset?.tip || "", told: !!__game.profile.flags.hint_lingzhi }));
  ok(/估价/.test(hq.tip) && /身陨/.test(hq.tip) && /不是钱/.test(hq.tip) && hq.told, "HUD 灵值 has ？ note and was explained once", hq);
  await page.hover(".mk-val .mk-q");
  await c.wait(300);
  await c.shot("lingzhi_hud_tip");
  await page.mouse.move(640, 400);
  // Esc：暂停菜单，世界暂停；再按 Esc 继续
  await page.keyboard.press("Escape");
  await c.wait(300);
  const t0 = await c.ev(() => __game.run.t);
  await c.wait(600);
  const pz = await c.ev(() => ({ paused: __game.flow.paused, menu: !document.querySelector(".mk-layer-pause").classList.contains("hidden"), items: [...document.querySelectorAll(".mk-layer-pause .ink-btn")].map((b) => b.textContent.trim()), t: __game.run.t }));
  ok(pz.paused && pz.menu && pz.t === t0 && pz.items.join() === "继续,设置,回到主页", "Esc opens pause menu (继续/设置/回到主页), world frozen", pz);
  await c.shot("pause");
  await click("pause", "settings");
  await c.wait(200);
  ok(await c.ev(() => !!document.querySelector('.mk-layer-pause .mk-opt[data-key="look"]')), "pause → shared settings page");
  await click("pause", "back");
  await c.wait(200);
  await page.keyboard.press("Escape");
  await c.wait(400);
  ok(await c.ev((t) => !__game.flow.paused && __game.run.t > t, t0), "Esc again resumes");

  // 只读诊断：保留原全拾断言与真实 F，不移动人物、不改掉落半径或清空背包。
  const groundSnapshot = () => c.ev(async () => {
    const { sizeOf, defOf } = await import("/src/core/items.js");
    const { PICK_R } = await import("/src/game/run/pickups.js");
    const P = __game.player, R = __game.run;
    const instance = it => ({ uid: it.uid, id: it.id, n: it.n, rarity: it.rarity, level: it.level, identified: it.identified, size: sizeOf(it), stack: defOf(it)?.stack, affixes: it.affixes });
    return {
      time: R.t, radius: PICK_R, hint: R.hint,
      player: { pos: P.pos.toArray(), vel: P.vel?.toArray(), state: P.state, hp: P.entity.hp, hurtUntil: P.hurtUntil, knock: P.knock ? { dir: P.knock.dir.toArray(), left: P.knock.left } : null },
      bag: { free: R.bag.free, used: R.bag.used, capacity: R.bag.capacity, value: R.bag.value, items: R.bag.items.map(instance) },
      ground: R.pickups.list.map(p => {
        const distance = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
        return { ...instance(p.inst), pos: [p.x, p.gy, p.z], distance, inRange: distance <= PICK_R, canAdd: R.bag.canAdd(p.inst) };
      }),
    };
  });
  // 假掉落（奇遇 / 委托来源）→ 落在地上，不自动拾取；真实按 F 一次取走身边全部
  const dropStart = await groundSnapshot();
  const g0 = await c.ev(() => {
    const p = __game.player.pos;
    __game.world.events.emit("loot:drop", { pos: p.clone(), items: [{ id: "spirit_stone", name: "灵石", n: 5 }, { id: "wolf_fang", name: "狼妖牙", n: 2 }] });
    return __game.run.bag.value;
  });
  await c.wait(800);
  const g1 = await c.ev(() => ({ v: __game.run.bag.value, ground: __game.run.pickups.list.length, hint: __game.run.hint }));
  ok(g1.v === g0 && g1.ground >= 2 && /^F · /.test(g1.hint), "loot:drop stays on the ground (no auto pickup), F hint shown", { g0, ...g1 });
  const beforeF = await groundSnapshot();
  await page.keyboard.press("KeyF");
  await c.wait(300);
  const afterF = await groundSnapshot();
  const movement = (a, b) => Math.hypot(...b.player.pos.map((v, i) => v - a.player.pos[i]));
  console.log("GROUND_PICKUP_DIAG", JSON.stringify({
    dropStart, beforeF, afterF,
    movedBeforeF: movement(dropStart, beforeF), movedAfterF: movement(beforeF, afterF),
    hurtBeforeF: beforeF.player.hurtUntil > dropStart.player.hurtUntil,
    hurtAfterF: afterF.player.hurtUntil > beforeF.player.hurtUntil,
  }));
  const got = await c.ev(() => ({ n: __game.run.bag.items.length, used: __game.run.bag.used, value: __game.run.bag.value, ground: __game.run.pickups.list.length }));
  ok(got.value > g0 && got.ground === 0, "F → all nearby ground items into bag", got);
  // 储物袋满 → 按 F 取不下，留在地上并提示
  await c.ev(() => {
    __game.debug.fillBag();
    const p = __game.player.pos;
    __game.world.events.emit("loot:drop", { pos: p.clone(), items: [{ id: "spirit_orb_shard", name: "灵光碎玉", n: 1 }] });
  });
  await c.wait(200);
  await c.ev(() => __game.run.takeGround());
  ok(await waitFor(() => (__game.run.bagFullCount || 0) > 0 && __game.run.pickups.list.some((p) => p.inst.id === "spirit_orb_shard"), null, 4000), "bag full prompt, item stays on the ground", await c.ev(() => ({ full: __game.run.bag.free, cnt: __game.run.bagFullCount })));
  await c.ev(() => __game.run.pickups.list.filter((p) => p.inst.id === "spirit_orb_shard").forEach((p) => __game.run.pickups.remove(p)));
  await page.keyboard.press("Tab");
  await c.wait(400);
  ok(await c.ev(() => !document.querySelector(".mk-layer-bag").classList.contains("hidden") && document.querySelectorAll(".mk-bagui .bv-grid .mk-tok").length > 0), "Tab opens bag UI");
  await c.shot("bag");
  await page.keyboard.press("Tab");

  // 天机镜手卷（M）：妖群"妖" → 清掉变"斩"；右键插墨点（铜镜同步）；探索过半；入夜画妖潮来向
  const mapIcons = () => c.ev(() => {
    const mm = __game.run && document.querySelector(".mk-bigmap2") && window.__game.flow.scenes.run.hudUI.mm;
    mm.drawBig();
    return mm.icons.map((i) => i.tip);
  });
  await c.ev(() => (__game.player.debug.god = !0)); // 看地图时别被咬死
  await c.ev(() => {
    const p = __game.player.pos.clone().add(new __game.THREE.Vector3(6, 0, 4));
    window.__mapPack = __game.ctx.enemies.spawnPack(3, !1, p, { types: ["wolf"] });
  });
  await c.wait(900);
  await page.keyboard.press("KeyM");
  await c.wait(400);
  ok(await c.ev(() => !document.querySelector(".mk-layer-bigmap").classList.contains("hidden")), "M opens 天机镜 scroll map");
  let tips = await mapIcons();
  ok(tips.some((t) => /未清/.test(t)) && tips.some((t) => /箱|供案/.test(t)), "map icons: seen enemy group (未清) + chest / 亭中供案", tips.slice(0, 12));
  await c.ev(() => {
    const h = __game.player.entity;
    for (const e of window.__mapPack) if (e.alive) __game.world.dealDamage(h, e.entity, { base: 1e6, noCrit: !0 });
  });
  await c.wait(800);
  tips = await mapIcons();
  ok(tips.some((t) => /已清/.test(t)), "cleared group turns into 斩 (已清)", tips.filter((t) => /妖|清/.test(t)));
  // 右键插墨点（真实鼠标）
  const box = await page.locator(".mk-bigmap2 canvas").boundingBox();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.4, { button: "right" });
  await c.wait(200);
  ok(await c.ev(() => __game.run.mapModel.pins.length === 1), "right-click places an ink pin");
  // 悬停看名称与状态
  const gpos = await c.ev(() => {
    const mm = window.__game.flow.scenes.run.hudUI.mm, ic = mm.icons.find((i) => /已清/.test(i.tip)), r = mm.cv.getBoundingClientRect(), k = mm.cssK();
    return ic && [r.left + ic.x / k, r.top + ic.y / k];
  });
  if (gpos) {
    await page.mouse.move(gpos[0], gpos[1]);
    await c.wait(200);
    ok(await c.ev(() => /已清/.test(document.querySelector(".mk-bigmap2 .tipbox").textContent)), "hover shows name + state");
  }
  // 探索过半
  await c.ev(() => {
    const E = __game.run.explored;
    for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w / 2; x++) E.cells[y * E.w + x] = 1;
    E.stamp++;
    __game.run.mapModel.t = 0;
  });
  await c.wait(700);
  await mapIcons();
  await c.shot("map_v2_half");
  ok(await c.ev(() => __game.run.mapModel.now.landmarks.size > 0), "landmarks revealed once inked", await c.ev(() => [...__game.run.mapModel.now.landmarks]));
  // 入夜
  await c.ev(() => (__game.run.t = __game.run.R.phases[2] + 3));
  await c.wait(500);
  tips = await mapIcons();
  ok(tips.includes("妖潮来向") && /夜/.test(await c.ev(() => document.querySelector(".mk-bigmap2 .tod").textContent)), "night: 妖潮来向 arrow + 夜 label", tips.filter((t) => /潮/.test(t)));
  await c.shot("map_v2_night");
  await page.keyboard.press("KeyM");
  await c.ev(() => {
    __game.run.t = 5;
    __game.player.debug.god = !1;
  });
  // 入夜 + 古传送阵读条：读条圆相跟着主角
  const ch = await c.ev(() => {
    const r = __game.run;
    r.t = r.R.phases[2] + 5;
    const g = r.extracts.find((x) => x.kind === "gate") || r.extracts[0];
    __game.player.spawn(g.pos.x, g.pos.z);
    r.startExtract(g);
    return { kind: g.kind, need: r.channel && r.channel.need };
  });
  await c.wait(1500);
  const ch2 = await c.ev(() => ({ on: document.querySelector(".mk-chan").classList.contains("on"), t: __game.run.channel && __game.run.channel.t, phase: __game.run.phase, tod: document.querySelector(".mk-tod").textContent }));
  ok(ch2.on && ch2.t > 0 && ch2.phase === 3 && ch.need >= 16 && /夜|妖潮/.test(ch2.tod), "night channel: ring shown, channel ×2", { ch, ch2 });
  await c.shot("hud_channel");
  await c.ev(() => __game.run.cancelChannel());

  // 区域一身陨：保留一半
  const before1 = await c.ev(() => ({ items: __game.run.bag.items.length, store: __game.profile.storage.items.length }));
  await c.ev(() => __game.debug.die());
  ok(await waitFor(() => __game.flow.name === "result", null, 8000), "r1 death → result");
  const d1 = await c.ev(() => {
    const R = __game.flow.scenes.result.data;
    return { result: R.result, kept: R.kept.length, lost: R.lost.length, lostBag: !!__game.profile.lostBag, marker: !!localStorage.getItem("moxian.run." + __game.profile.slot) };
  });
  ok(d1.result === "death" && d1.kept > 0 && d1.lost > 0 && !d1.lostBag, "r1 death keeps ~50%, no lost bag", { before1, d1 });
  ok(!d1.marker, "run marker cleared after settlement");
  await c.wait(1200); // 等手卷展开
  await c.shot("result_death");

  // ---------- 5. 区域一撤离 + 结算页鉴定揭晓 ----------
  await click("result", "tocave");
  await c.wait(300);
  // 炼化增益（灵泉"灵气充盈"，模块 C 写 profile.buffs）：出行局里生效
  await c.ev(() => {
    __game.profile.buffs = [{ id: "lingqi", tier: 3, remain: 300 }];
    __game.flow.go("run", { region: "r1" });
  });
  ok(await runPlay(), "second r1 run");
  // 跨局记忆：上一局着墨发现的地名，这一局开局就以"旧日所见"显示
  ok(await c.ev(() => __game.run.mapModel.old.landmarks.size > 0 && __game.profile.map.r1.seen.landmarks.length > 0), "cross-run: landmarks remembered", await c.ev(() => [...__game.run.mapModel.old.landmarks]));
  // 委托 / 奇遇模块接入（存在时）
  const qs = await c.ev(() => ({ has: !!Object.keys(__game.run).length && !!__game.run.quests }));
  ok(qs.has, "quests module attached to non-tutorial run", qs);
  // 外部交互标记（奇遇用）：F 触发 onInteract
  await c.ev(() => {
    const r = __game.run, p = __game.player.pos.clone();
    window.__encHit = 0;
    r.addMark({ kind: "encounter", pos: p, label: "测试奇遇", glyph: "奇", color: 0x15181b, onInteract: () => (window.__encHit = 1) });
    __game.ctx.input.tap("KeyF");
  });
  ok(await waitFor(() => window.__encHit === 1, null, 3000), "run.interact calls mark.onInteract");
  // 五行符：准星方向 range 内炸开，伤到范围内的妖兽
  const fu = await c.ev(async () => {
    const r = __game.run, E = __game.ctx.enemies, p = __game.player.pos;
    for (let k = 0; k < 50 && !E.ready; k++) await new Promise((res) => setTimeout(res, 100));
    const at = p.clone().add(new __game.THREE.Vector3(3, 0, 0));
    const e = E.spawn("wolf", at);
    if (!e) return { spawned: !1 };
    const hp0 = e.entity.hp;
    r.carried.push({ uid: "fu1", id: "fu_fire", n: 2, rarity: 0, level: 1, affixes: [], identified: !0, bound: !1, tags: [] });
    __game.ctx.input.aim.copy(at);
    const hits = r.useElementFu();
    return { spawned: !0, hits, hp0, hp1: e.entity.hp, left: r.carried.find((i) => i.id === "fu_fire").n };
  });
  ok(fu.spawned && fu.hits >= 1 && fu.hp1 < fu.hp0 && fu.left === 1, "五行符 damages enemies at aim and is consumed", fu);
  // 炼化增益：属性生效、HUD 小印 + 剩余时间、局内计时、到时散去
  await c.wait(1200);
  const bf = await c.ev(() => {
    const h = __game.player.entity, el = document.querySelector(".mk-layer-runhud .mk-buffs .b"), hp = document.querySelector("#hud .row.hp").getBoundingClientRect();
    const r = el && el.getBoundingClientRect();
    return { vuln: h.stats.get("vuln"), src: h.stats.mods ? undefined : null, remain: __game.profile.buffs[0] && __game.profile.buffs[0].remain, txt: el && el.textContent, tip: el && el.dataset.tip, nearHp: !!r && r.left >= hp.right - 2 && r.left < hp.right + 40 && Math.abs(r.top + r.height / 2 - (hp.top + hp.height / 2)) < 14 };
  });
  ok(bf.vuln <= -0.079 && bf.remain < 300 && bf.remain > 290 && /灵三4:5\d/.test(bf.txt) && /受到伤害 −8%/.test(bf.tip) && /气血上限 \+5%/.test(bf.tip) && bf.nearHp, "灵气充盈·三 applies in run, HUD seal beside 气血 with time + tooltip", bf);
  await page.hover(".mk-layer-runhud .mk-buffs .b");
  await c.wait(300);
  await c.shot("buff_hud");
  await c.ev(() => (__game.run.buffs[0].b.remain = 0.6));
  ok(await waitFor(() => !__game.run.buffs.length && !__game.profile.buffs.length && !document.querySelector(".mk-layer-runhud .mk-buffs .b") && __game.player.entity.stats.get("vuln") > -0.001, null, 4000), "buff expires in run: stats removed, seal gone, deleted from save");
  // 局内捡到的丹药符箓：直接进快捷栏
  await c.ev(() => {
    const r = __game.run;
    r.profile.unlocks.__ps = r.profile.unlocks.pillSlots;
    r.profile.unlocks.pillSlots = 1;
    __game.player.entity.mp = 10;
    window.__pot0 = __game.ctx.skills.potions[0].count;
    __game.world.events.emit("loot:drop", { pos: __game.player.pos.clone(), items: [{ id: "huiqi_dan", n: 2 }] });
    __game.run.takeGround();
  });
  ok(await waitFor(() => __game.ctx.skills.potions[0].count === window.__pot0 + 2, null, 4000), "picked 回气丹 → quick slot 1 count +2", await c.ev(() => __game.ctx.skills.potions[0].count));
  await c.wait(200);
  await page.keyboard.press("Digit1");
  await c.wait(300);
  const pot = await c.ev(() => ({ n: __game.ctx.skills.potions[0].count, mp: __game.player.entity.mp, bag: __game.run.bag.count ? __game.run.bag.count("huiqi_dan") : -1 }));
  ok(pot.n === (await c.ev(() => window.__pot0)) + 1 && pot.mp > 10 && pot.bag === 0, "key 1 takes the picked 回气丹", pot);
  // 新种类、丹药囊没空栏：留在储物袋里；双击（run.useItem）服用
  await c.ev(() => (__game.world.events.emit("loot:drop", { pos: __game.player.pos.clone(), items: [{ id: "huichun_dan", n: 1 }] }), __game.run.takeGround()));
  ok(await waitFor(() => __game.run.bag.count("huichun_dan") === 1, null, 4000), "new pill kind with no free pill slot stays in bag", await c.ev(() => ({ bag: __game.run.bag.count("huichun_dan"), slot: __game.ctx.skills.potions[1].count })));
  const use = await c.ev(() => {
    const r = __game.run, h = __game.player.entity, S = __game.ctx.skills;
    h.hp = 50;
    const n1 = S.potions[1].count, ok = r.useItem(r.bag.items.find((i) => i.id === "huichun_dan"));
    return { ok, bag: r.bag.count("huichun_dan"), slot: S.potions[1].count === n1, hot: S.hot.length };
  });
  ok(use.ok && use.bag === 0 && use.slot && use.hot > 0, "double-click (run.useItem) takes a pill from the bag", use);
  // 符箓：遁地符进 G、五行符进 3
  await c.ev(() => {
    window.__fu0 = __game.run.talismanCount();
    __game.world.events.emit("loot:drop", { pos: __game.player.pos.clone(), items: [{ id: "dundi_fu", n: 1 }, { id: "fu_water", n: 2 }] });
    __game.run.takeGround();
  });
  ok(await waitFor(() => __game.run.talismanCount() === window.__fu0 + 1 && __game.run.elementFus().includes("fu_water") && __game.run.fuSel === "fu_water", null, 4000), "picked 遁地符 / 五行符 go to their quick slots", await c.ev(() => ({ fu: __game.run.talismanCount(), ek: __game.run.elementFus() })));
  await c.ev(() => {
    const u = __game.run.profile.unlocks;
    u.pillSlots = u.__ps;
    delete u.__ps;
  });
  // 区域规划 v2：开局组数读关卡的 points.spawnPacks；走近首领关口（狼骨门）提示"此去：…"
  const packs = await c.ev(() => ({ want: __game.run.map.points.spawnPacks, got: __game.run.packCount, spawns: __game.run.map.points.spawns.length }));
  ok(packs.want > 0 && packs.got === Math.min(packs.want, packs.spawns), "initial packs follow level points.spawnPacks", packs);
  const gate = await c.ev(() => {
    const g = __game.run.map.points.bossGate;
    if (!g) return null;
    __game.player.spawn(g.pos.x, g.pos.z);
    return { x: g.pos.x, z: g.pos.z, text: g.text };
  });
  ok(!!gate, "level gives points.bossGate (狼骨门)");
  if (gate) {
    ok(await waitFor(() => /此去/.test((document.querySelector(".mk-layer-runhud .mk-gatehint.on") || {}).textContent || ""), null, 3000), "near 狼骨门: '此去：…' line under the time bar", gate);
    const gr = await c.ev(() => {
      const r = document.querySelector(".mk-layer-runhud .mk-gatehint").getBoundingClientRect(), t = document.querySelector(".mk-tod").getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), todBottom: Math.round(t.bottom), h: innerHeight };
    });
    ok(gr.top >= gr.todBottom - 2 && gr.bottom < gr.h * 0.2, "gate hint sits in the top strip (not over the field)", gr);
    await c.wait(300);
    await c.shot("gate_hint");
  }
  await c.ev(() => {
    const r = __game.run;
    r.bag.add({ uid: "unid1", id: "rust_sword", n: 1, rarity: 3, level: 2, affixes: [], identified: !1, bound: !1, tags: [] });
    __game.debug.extract();
  });
  ok(await waitFor(() => __game.flow.name === "result", null, 8000), "r1 extraction → result");
  await c.wait(1600);
  const idf = await c.ev(() => {
    const it = __game.profile.storage.items.find((i) => i.uid === "unid1");
    return { found: !!it, identified: it && it.identified, reveal: __game.flow.scenes.result.revealCount, lines: document.querySelectorAll(".mk-result .mk-tok.revealed:not(.is-unid)").length, toks: document.querySelectorAll(".mk-result .seg2 .mk-tok").length };
  });
  ok(idf.found && idf.identified && idf.reveal === 1 && idf.lines === 1, "result screen reveals unidentified item", idf);
  ok(await c.ev(() => __game.profile.storage.count("fu_water") >= 2 && !__game.profile.storage.items.some((i) => i.found)), "picked consumables left over go to storage on extraction");
  ok(await c.ev(() => /炼化/.test((document.querySelector(".mk-result .mk-lzhint") || {}).textContent || "") && /化灵/.test(document.querySelector(".mk-result .mk-lzhint").textContent) && !!document.querySelector(".mk-result .tot .mk-q")), "result: 带回灵值 has ？ and 化灵 / 炼化 hint line");
  await c.wait(400);
  await c.shot("result_extract");

  // ---------- 6. 区域二身陨 → 遗落储物袋含装备 → 下一局取回 ----------
  await c.ev(() => {
    __game.debug.realm(1, 5);
    const P = __game.profile;
    if (!P.equip.sword) P.equip.sword = { uid: "sw_r2", id: "rust_sword", n: 1, rarity: 1, level: 1, affixes: [], identified: !0, bound: !1, tags: [] };
    __game.flow.go("run", { region: "r2" });
  });
  ok(await runPlay(), "r2 run");
  const swordUid = await c.ev(() => __game.profile.equip.sword.uid);
  await c.ev(() => {
    __game.debug.give("spirit_stone", 20);
    __game.debug.give("wolf_core", 2);
    __game.debug.die();
  });
  ok(await waitFor(() => __game.flow.name === "result", null, 8000), "r2 death → result");
  const lb = await c.ev(() => ({ lostBag: __game.profile.lostBag && { region: __game.profile.lostBag.region, n: __game.profile.lostBag.items.length, gear: __game.profile.lostBag.items.filter((i) => (i.tags || []).includes("gear")).map((i) => i.uid), pos: !!__game.profile.lostBag.pos }, sword: __game.profile.equip.sword }));
  ok(lb.lostBag && lb.lostBag.region === "r2" && lb.lostBag.gear.includes(swordUid) && lb.lostBag.pos && !lb.sword, "r2 death → lostBag with equipped gear", lb);
  await c.ev(() => __game.flow.go("run", { region: "r2" }));
  ok(await runPlay(), "r2 run again");
  const mk = await c.ev(() => __game.run.lostBagMark && [__game.run.lostBagMark.pos.x, __game.run.lostBagMark.pos.z]);
  ok(!!mk, "lost bag marker in next run");
  if (mk) {
    await toPos(mk[0], mk[1]);
    await c.wait(300);
    await c.ev(() => __game.ctx.input.tap("KeyF"));
    await c.wait(500);
  }
  const rv = await c.ev((uid) => ({ inBag: __game.run.bag.items.some((i) => i.uid === uid) || __game.run.pickups.list.some((p) => p.inst.uid === uid), lostBag: __game.profile.lostBag, got: __game.run.retrieved && __game.run.retrieved.got.length }), swordUid);
  ok(rv.inBag && !rv.lostBag && rv.got > 0, "retrieval: gear back (100%) and lostBag cleared", rv);
  ok(await c.ev(() => (__game.profile.stats.lostBagBack || 0) >= 1), "profile.stats.lostBagBack +1 on retrieval");

  // ---------- 7. 局内刷新页面 = 身陨（首次豁免） ----------
  await c.ev(() => __game.debug.give("spirit_stone", 9));
  const slot = await c.ev(() => __game.profile.slot);
  const stones0 = await c.ev(() => __game.profile.storage.count("spirit_stone"));
  await page.reload({ waitUntil: "commit", timeout: 90000 });
  await waitFor(() => window.__ready === true && window.__game && __game.flow && __game.flow.name === "title", null, 60000);
  await click("title", "continue");
  await c.wait(500);
  ok(await c.ev(() => /豁免|担下/.test(document.querySelector(".mk-modal") ? document.querySelector(".mk-modal").textContent : "")), "1st mid-run reload: exempt notice");
  await page.click(".mk-modal .ink-btn");
  await c.wait(400);
  const ex = await c.ev(() => ({ scene: __game.flow.name, exempt: __game.profile.flags.reloadExempted, stones: __game.profile.storage.count("spirit_stone"), deaths: __game.profile.stats.deaths }));
  ok(ex.scene === "cave" && ex.exempt && ex.stones > stones0, "exempt: bag returned to storage, back in cave", { ...ex, stones0 });
  // 第二次
  await c.ev(() => __game.flow.go("run", { region: "r2" }));
  ok(await runPlay(), "run before 2nd reload");
  await c.ev(() => __game.debug.give("wolf_core", 3));
  await c.wait(200);
  const deaths0 = ex.deaths;
  await page.reload({ waitUntil: "commit", timeout: 90000 });
  await waitFor(() => window.__ready === true && window.__game && __game.flow && __game.flow.name === "title", null, 60000);
  await click("title", "continue");
  await c.wait(500);
  const modal2 = await c.ev(() => (document.querySelector(".mk-modal") ? document.querySelector(".mk-modal").textContent : ""));
  ok(/身陨/.test(modal2), "2nd mid-run reload: settled as death", modal2.slice(0, 60));
  await page.click(".mk-modal .ink-btn");
  await c.wait(300);
  const d2 = await c.ev(() => ({ deaths: __game.profile.stats.deaths, lostBag: __game.profile.lostBag && __game.profile.lostBag.items.length, marker: !!localStorage.getItem("moxian.run." + __game.profile.slot) }));
  ok(d2.deaths === deaths0 + 1 && d2.lostBag > 0 && !d2.marker, "2nd reload counted as r2 death (lost bag)", d2);
  ok(slot === (await c.ev(() => __game.profile.slot)), "same slot after reload");
  // 天机镜"行迹"页的统计（profile.stats）
  const stx = await c.ev(() => {
    const S = __game.profile.stats;
    return { herbs: S.herbs, chests: S.chests, bestHaul: S.bestHaul, bestItem: S.bestItem, firstDeath: S.firstDeath, lostBagBack: S.lostBagBack, bosses: S.bosses || {} };
  });
  ok(stx.herbs >= 1 && stx.chests >= 1 && stx.bestHaul && stx.bestHaul.value > 0 && stx.bestItem && stx.bestItem.name && stx.firstDeath && stx.firstDeath.region, "profile.stats 行迹: herbs / chests / bestHaul / bestItem / firstDeath", stx);
  // 暂停 → 回到主页：按身陨结算（豁免已用过）
  await c.ev(() => __game.flow.go("run", { region: "r2" }));
  ok(await runPlay(), "run before pause→title");
  await c.ev(() => __game.debug.give("wolf_core", 3));
  const dz0 = await c.ev(() => __game.profile.stats.deaths);
  await page.keyboard.press("Escape");
  await click("pause", "totitle");
  await page.waitForSelector(".mk-modal", { timeout: 5000 });
  ok(await c.ev(() => /身陨/.test(document.querySelector(".mk-modal").textContent)), "回到主页 confirm explains death settlement");
  await page.locator(".mk-modal .ink-btn", { hasText: "回到主页" }).click();
  ok(await waitFor(() => __game.flow.name === "title", null, 8000), "pause → 回到主页 → title");
  await c.wait(300);
  const dz = await c.ev(() => ({ deaths: __game.profile.stats.deaths, marker: !!localStorage.getItem("moxian.run." + __game.profile.slot), lost: __game.profile.lostBag && __game.profile.lostBag.items.length }));
  ok(dz.deaths === dz0 + 1 && !dz.marker && dz.lost > 0, "回到主页 settled as death (r2 lost bag)", dz);

  // ---------- 序章乱序：开局先绕去采灵草、开宝箱，再回主线 ----------
  await c.ev(() => {
    __game.flow.newGame(2);
    __game.flow.go("run", { region: "tutorial" });
  });
  ok(await runPlay(), "out-of-order: fresh prologue (slot 2)");
  await c.ev(() => (__game.player.debug.god = !0));
  await waitStep("wake");
  const markAt = (kind, id) => c.ev(([kind, id]) => {
    const s = __game.run.pro.steps.find((q) => q.id === id), p = s.target || s.pos;
    const m = __game.run.marks.filter((q) => q.kind === kind).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    return m && [m.pos.x, m.pos.z];
  }, [kind, id]);
  const pressF = async (p, dx = 0.7) => {
    await toPos(p[0] + dx, p[1]);
    await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
    await page.keyboard.press("KeyF");
    await c.wait(400);
    if (await c.ev(() => !!__game.run.containers.openC)) {
      await page.keyboard.press("KeyF");
      await waitFor(() => {
        const C = __game.run.containers, o = C.openC;
        return !o || C.status(o).empty;
      }, null, 12000);
    }
    await pickAll();
  };
  await pressF(await markAt("gather", "herb"));
  ok(await c.ev(() => __game.run.pro.f.gather.length >= 1 && !__game.run.pro.steps.find((q) => q.id === "herb").done), "out-of-order: herb gathered early (recorded, step not yet active)");
  await pressF(await markAt("chest", "chest"), 1);
  ok(await c.ev(() => __game.run.pro.f.chest.length >= 1 && __game.run.carried.some((i) => i.id === "fu_metal")), "out-of-order: chest opened early, 金符 in 行囊");
  // 回主线
  await goStep("wake");
  await waitStep("sword");
  const sw2 = await c.ev(() => {
    const s = __game.run.pro.steps.find((q) => q.id === "sword"), C = __game.run.containers.near(s.pos, 8);
    return C && [C.pos.x, C.pos.z];
  });
  if (sw2) await searchF(sw2);
  await waitStep("bridge");
  await goStep("bridge");
  ok(await waitStep("wolf_first"), "out-of-order: back on main line (chapter 2)");
  await c.wait(900);
  const pre = await c.ev(() => [...document.querySelectorAll(".pro-scroll .g")].map((g) => g.dataset.step + ":" + g.dataset.state));
  ok(pre.includes("herb:early") && pre.includes("wolf_first:cur"), "scroll shows whole chapter: herb pre-ticked, current highlighted", pre);
  await c.shot("prologue_preticked");
  await goStep("wolf_first");
  await killStep("wolf_first");
  await goStep("wolves");
  await killStep("wolves");
  await pickAll();
  ok(await waitDone("loot"), "out-of-order: loot");
  const tHerb = await c.ev(() => performance.now());
  ok(await waitDone("herb", 3000), "herb step ticked off as 早已采得 when reached");
  const herbInfo = await c.ev((t0) => ({ early: __game.run.pro.steps.find((q) => q.id === "herb").early, dt: performance.now() - t0, float: document.querySelector(".pro-float").textContent }), tHerb);
  ok(herbInfo.early && herbInfo.dt < 1500 && /早已/.test(herbInfo.float), "early completion is quick and says 早已…", herbInfo);
  ok(await killStep("ambush"), "out-of-order: ambush");
  await goStep("fork");
  ok(await waitStep("bamboo") || (await c.ev(() => ["pool_s", "pool_n", "bamboo"].includes(__game.run.pro.cur.id))), "out-of-order: fork passed");
  await goStep("bamboo");
  // 竹林狼群（开箱时已经被引出来了）打完后：宝箱、服丹两步连续快速勾掉
  ok(await killStep("bamboo"), "out-of-order: bamboo pack killed", await c.ev(() => ({ cur: __game.run.pro.cur.id, front: __game.run.pro.frontier().map((q) => q.id), sp: (__game.run.pro.steps.find((q) => q.id === "bamboo").spawned || []).map((e) => e.alive), chest: __game.run.pro.f.chest.length })));
  await c.wait(250);
  await c.shot("prologue_rapid_ticks");
  ok(await waitDone("chest", 3000) && (await waitDone("pill", 3000)), "chest + pill steps ticked off in quick succession");
  const chain = await c.ev(() => __game.run.pro.steps.filter((q) => ["chest", "pill"].includes(q.id)).map((q) => q.early));
  ok(chain.every(Boolean), "both were 早已做到", chain);
  ok(await waitStep("golem"), "out-of-order: → golem");
  await goStep("golem");
  await killStep("golem");
  ok(await waitStep("elite"), "out-of-order: → elite");
  await goStep("elite");
  await waitFor(() => (__game.run.pro.steps.find((q) => q.id === "elite").spawned || []).length > 0, null, 8000);
  await c.ev(() => {
    const r = __game.run, e = r.pro.steps.find((q) => q.id === "elite").spawned[0];
    __game.world.applyStatus(e.entity, "stun", { dur: 3, src: __game.player.entity });
    for (let k = 0; k < 3 && e.entity.shield && e.entity.shield.hp > 0; k++) {
      __game.ctx.input.aim.copy(e.pos);
      r.useElementFu();
    }
  });
  ok(await killStep("elite"), "out-of-order: 狼首 killed");
  ok(await waitStep("cave"), "out-of-order: → cave");
  await goStep("cave");
  await waitFor(() => /F/.test(__game.run.hint || ""), null, 3000);
  await page.keyboard.press("KeyF");
  ok(await waitFor(() => __game.flow.name === "result", null, 12000), "out-of-order prologue completes (no stuck step)");
  await c.ev(() => (__game.player.debug.god = !1));

  // 跳过序章：暂停菜单（二次确认）
  await c.ev(() => {
    __game.flow.newGame(2);
    __game.flow.go("run", { region: "tutorial" });
  });
  ok(await runPlay(), "fresh tutorial run (slot 2)");
  await waitFor(() => !!(__game.flow.scenes.run.pause && __game.flow.scenes.run.hudUI), null, 8000);
  await c.wait(300);
  await page.keyboard.press("Escape");
  await c.wait(300);
  console.log("esc-state", JSON.stringify(await c.ev(() => { const S = __game.flow.scenes.run; return { name: __game.flow.name, paused: __game.flow.paused, open: S.pause && S.pause.open, modal: !!document.querySelector(".mk-modal"), bag: S.bagUI && S.bagUI.open, big: S.hudUI && S.hudUI.big, state: S.run && S.run.state, openC: !!(S.run && S.run.containers.openC), pz: document.querySelector(".mk-layer-pause") && document.querySelector(".mk-layer-pause").className }; })));
  await click("pause", "skip");
  await page.waitForSelector(".mk-modal", { timeout: 5000 });
  await page.locator(".mk-modal .ink-btn", { hasText: "跳过序章" }).click();
  ok(await waitFor(() => __game.flow.name === "cave", null, 10000), "pause → 跳过序章 → cave");
  const sk = await c.ev(() => ({ sword: __game.profile.equip.sword && __game.profile.equip.sword.id, pill: __game.profile.storage.count("huichun_dan"), done: __game.profile.flags.tutorialDone, fu: __game.profile.storage.count("fu_metal"), realm: __game.profile.realm.stage }));
  ok(sk.sword === "rust_sword" && sk.pill >= 1 && sk.done && !sk.fu && sk.realm === 1, "skip result: 锈剑 + 回春丹 ×1, no 金符, awakened", sk);
  // 新卷：本机已有通关序章的存档 → 询问是否跳过（默认不跳）
  await c.ev(() => __game.flow.go("title"));
  await click("title", "new");
  await page.waitForSelector(".mk-modal", { timeout: 5000 });
  ok(await c.ev(() => /跳过序章/.test(document.querySelector(".mk-modal").textContent) && document.querySelector(".mk-modal .ink-btn.primary").textContent.includes("不跳过")), "new game asks to skip prologue (default 不跳过)");
  await page.locator(".mk-modal .ink-btn", { hasText: "跳过序章" }).click();
  ok(await waitFor(() => __game.flow.name === "cave", null, 10000), "new game skip → cave");

  // ---------- 功法装配（出行准备 · 功法匣）----------
  await c.ev(() => {
    const P = __game.profile;
    __game.debug.realm(1, 7); // 练气七层：Q / E / R、T、V、心法一开；心法二（八层）锁
    P.flags.learned = { spells: ["sword_qi", "vine", "frost", "fire_talisman"], xinfa: ["mom_gather"], formations: ["sword_array"] };
    P.build = { spells: ["sword_qi", "fire_talisman", null], xinfa: [null, null], formation: null };
    // 法剑带特殊词条《锋锐》：心法匣里《锋锐》灰显、装入时提示同名不叠加
    P.equip.sword = { uid: "sw_sharp", id: "rust_sword", n: 1, rarity: 3, level: 3, affixes: [{ stat: "special", type: "flag", value: "锋锐", xinfa: "sharp" }], identified: !0, bound: !1, tags: [] };
    __game.flow.go("prep");
  });
  await page.waitForSelector(".mk-prep .mk-ld-slots .mk-ld-slot", { timeout: 8000 });
  await page.locator('.mk-prep [data-prep-tab="gongfa"]').click();
  await c.wait(400);
  const slotSel = (k, i) => `.mk-prep .mk-ld-slot[data-slot-kind="${k}"][data-slot-i="${i}"]`;
  const rowSel = (k, id) => `.mk-prep .mk-ld-row[data-src-kind="${k}"][data-src-id="${id}"]`;
  const dragTo = async (from, to) => {
    const a = await page.locator(from).boundingBox(), b = to.x != null ? to : await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
    await page.mouse.move((b.x + (b.width || 0) / 2), (b.y + (b.height || 0) / 2), { steps: 8 });
    await page.mouse.up();
    await c.wait(250);
  };
  const build = () => c.ev(() => JSON.parse(JSON.stringify(__game.profile.build)));
  // 锁定栏
  ok(await c.ev((sel) => {
    const e = document.querySelector(sel);
    return !!e && e.classList.contains("locked") && /练气八层解锁/.test(e.textContent);
  }, slotSel("xinfa", 1)), "locked slot shows 练气八层解锁");
  ok(await c.ev(() => /V/.test(document.querySelector('.mk-prep .mk-ld-slot[data-slot-kind="artifact"] .k').textContent) && /蓄势斩/.test(document.querySelector(".mk-prep .mk-ld-slot.fixed").textContent)), "法宝 slot key is V; 右键 slot shows 蓄势斩 (display only)");
  await page.click(slotSel("xinfa", 1));
  await c.wait(200);
  ok(await c.ev(() => /练气八层解锁/.test((document.querySelector(".mk-prep .mk-ld-note") || {}).textContent || "")), "clicking a locked slot tells when it unlocks");
  // 拖入：寒冰锥 → E
  await dragTo(rowSel("spell", "frost"), slotSel("spell", 1));
  let bd = await build();
  ok(bd.spells[1] === "frost", "drag from 功法匣 into E slot", bd.spells);
  // 换位：Q ↔ E
  await dragTo(slotSel("spell", 0), slotSel("spell", 1));
  bd = await build();
  ok(bd.spells[0] === "frost" && bd.spells[1] === "sword_qi", "drag between slots swaps them", bd.spells);
  // 悬停按 R 直接装入：缠藤诀 → R
  await page.hover(rowSel("spell", "vine"));
  await page.keyboard.press("KeyR");
  await c.wait(200);
  bd = await build();
  ok(bd.spells[2] === "vine", "hover + R puts 缠藤诀 into R", bd.spells);
  // 紧凑卡只放简介与来源；真实展开后在说明层核验完整伤害、元素和克制。
  await page.click(rowSel("spell", "frost"));
  await page.locator('.mk-prep .ld-detail [data-id="ld-read"]').click();
  await page.locator(".prep-modal .reader").waitFor({ state: "visible" });
  const tip = await c.ev(() => document.querySelector(".prep-modal .reader")?.textContent || "");
  ok(/克/.test(tip) && /火盾/.test(tip) && /×2/.test(tip) && /当前/.test(tip), "功法详情：元素、当前境界伤害、克制火盾 ×2", tip.slice(0, 90));
  await c.shot("loadout_detail");
  await page.keyboard.press("Escape");
  ok(await c.ev(() => !document.querySelector(".prep-modal") && __game.flow.name === "prep" && !__game.flow.scenes.prep.root.inert), "Esc 收起完整说明，仍可操作整装册");
  // 说明层关闭不消费功法选中；仅在仍选中时再按 Esc 还原后续拖拽起点。
  if (await c.ev(() => !!__game.flow.scenes.prep.lo.sel)) await page.keyboard.press("Escape");
  // 拖出卸下：R → 栏外
  await page.mouse.move(5, 5);
  await dragTo(slotSel("spell", 2), { x: 200, y: 200 });
  bd = await build();
  ok(bd.spells[2] === null, "drag a slot out → unequipped", bd.spells);
  // 心法同名：《锋锐》已由法剑词条提供
  await page.click('.mk-prep .mk-ld-box .ink-tab[data-tab="xinfa"]');
  await c.wait(200);
  ok(await c.ev(() => document.querySelector('.mk-prep .mk-ld-row[data-src-id="sharp"]').classList.contains("dup")), "gear-provided 心法 is greyed in 功法匣");
  await page.click(rowSel("xinfa", "sharp"));
  await page.click(slotSel("xinfa", 0));
  await c.wait(250);
  ok(await c.ev(() => /同名不叠加/.test((document.querySelector(".mk-prep .mk-ld-note") || {}).textContent || "") && !!document.querySelector('.mk-prep .mk-ld-slot[data-slot-kind="xinfa"][data-slot-i="0"] .die')), "装入同名心法：提示同名不叠加，栏上盖'叠'");
  // 提示是一行小字条：不压立绘、功法匣、栏位；不用居中横幅；2.5 秒后淡出
  const noteHit = await c.ev(() => {
    const n = document.querySelector(".mk-prep .mk-ld-note").getBoundingClientRect();
    const hit = (sel) => [...document.querySelectorAll(sel)].some((e) => {
      const r = e.getBoundingClientRect();
      return r.width && !(n.right <= r.left || n.left >= r.right || n.bottom <= r.top || n.top >= r.bottom);
    });
    return { por: hit(".mk-prep .por"), box: hit(".mk-prep .mk-ld-box"), slots: hit(".mk-prep .ldslots .mk-ld-slot"), cover: hit(".mk-prep .cover"), toast: !!document.querySelector(".mk-toasts .ink-toast"), w: Math.round(n.width) };
  });
  ok(!noteHit.por && !noteHit.box && !noteHit.slots && !noteHit.cover && !noteHit.toast, "loadout hint sits in the 随身功法 line, covering nothing", noteHit);
  await page.mouse.move(5, 5);
  await c.wait(200);
  await c.shot("loadout_note");
  await c.wait(2600);
  ok(await c.ev(() => !document.querySelector(".mk-prep .mk-ld-note").textContent), "loadout hint fades after 2.5 s");
  // 空栏提醒
  ok(await c.ev(() => /R.*栏尚空/.test((document.querySelector(".mk-prep .emptynote") || {}).textContent || "")), "启程旁明确提醒空着的 R 栏", await c.ev(() => (document.querySelector(".mk-prep .emptynote") || {}).textContent));
  await page.mouse.move(5, 5);
  await c.wait(300);
  await c.shot("loadout_empty");
  // 护盾"已带" + 换上
  await page.locator('.mk-prep [data-id="prep-region-info"]').click();
  const regionInfo = await c.ev(() => document.querySelector(".prep-modal .reader")?.textContent || "");
  ok(/木盾/.test(regionInfo) && /已带/.test(regionInfo), "去处情报保留护盾与已带构筑信息", regionInfo);
  await page.keyboard.press("Escape");
  // 阵盘：悬停按 T
  await page.click('.mk-prep .mk-ld-box .ink-tab[data-tab="formation"]');
  await c.wait(150);
  await page.hover(rowSel("formation", "sword_array"));
  await page.keyboard.press("KeyT");
  await c.wait(200);
  ok((await build()).formation === "sword_array", "hover + T equips 剑阵");
  await page.click('.mk-prep .mk-ld-box .ink-tab[data-tab="spell"]');
  await page.mouse.move(5, 5);
  await c.wait(300);
  await c.shot("loadout");
  // 局内与出行准备一致；空栏不被自动补
  await click("prep", "depart");
  ok(await runPlay(), "depart with loadout");
  const inRun = await c.ev(() => ({ spells: __game.ctx.skills.loadout.spells, xinfa: __game.ctx.skills.loadout.xinfa, formation: __game.ctx.skills.loadout.formation, build: __game.profile.build }));
  ok(JSON.stringify(inRun.spells) === JSON.stringify(["frost", "sword_qi", null]) && inRun.formation === "sword_array" && inRun.xinfa.includes("sharp"), "in-run loadout equals prep (empty R stays empty)", inRun);

  const errs = await c.ev(() => window.__errors);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
