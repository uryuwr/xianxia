// 委托与奇遇（模块 E）可运行测试：委托生成（3 个、不全同类、固定、随境界缩放）→ 出行准备显示 → 接委托出行 →
// 模拟击杀 / 采集推进进度 → 白鹭奇遇（模型与动画、F 交互、对话、选项结算）→ 灵狐带路 → 撤离交付奖励 →
// 第二局白鹭求助（她出手、清完给奖励）→ 身陨不交付。
// 用法：node tools/run.mjs loop_quests "scene=cave&slot=3"
const ok = (cond, msg, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  if (!cond) process.exitCode = 1;
  return cond;
};

export default async function (page, c) {
  // 截图只是留档：机器忙时超时不算失败
  const shot = (n) => c.shot(n).catch((e) => console.log("shot skipped", n, String(e).slice(0, 80)));
  const waitFor = async (fn, arg, timeout = 15000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 100 });
      return !0;
    } catch {
      return !1;
    }
  };
  await waitFor(() => window.__game && __game.flow && __game.flow.name === "cave", null, 60000);
  // 兄弟模块并行改代码时 Vite 会整页刷新：测试期间拦掉页面导航（ERR_ABORTED 不替换当前文档）
  await page.route("**/*", (route) => (route.request().isNavigationRequest() ? route.abort("aborted") : route.continue()));
  // 全新存档：练气一层，已过教学局 6 局（第 8 局，委托与奇遇都已解锁）
  await c.ev(() => {
    const P = __game.flow.newGame(3) || __game.profile;
    P.flags.tutorialDone = !0;
    P.stats.runs = 6;
    P.realm = { stage: 1, layer: 1 };
    window.__T = {};
  });

  // ---------- 1. 委托生成 ----------
  const off = await c.ev(async () => {
    const { Quests } = await import("/src/game/quests/index.js");
    const { QUEST_TEMPLATES } = await import("/src/data/quests.js");
    const P = __game.profile;
    const Q = new Quests(__game.ctx);
    const a = Q.offers(P), b = new Quests(__game.ctx).offers(P);
    P.stats.runs = 7;
    const nxt = Q.offers(P);
    P.stats.runs = 6;
    // 境界缩放：同一模板、同一随机数，九层的数量更多
    const T = QUEST_TEMPLATES.find((t) => t.id === "hunt");
    const lo = Q.instantiate(T, { ...P, realm: { stage: 1, layer: 1 } }, () => 0.5, 8, 0).objective.n;
    const hi = Q.instantiate(T, { ...P, realm: { stage: 1, layer: 9 } }, () => 0.5, 8, 0).objective.n;
    // 多个局号下检查"不会全是同一类"
    let allSame = 0;
    for (let k = 0; k < 30; k++) {
      P.stats.runs = 6 + k;
      const o = Q.offers(P);
      if (new Set(o.map((x) => x.group)).size < 2) allSame++;
    }
    P.stats.runs = 6;
    return {
      n: a.length, ids: a.map((x) => x.id), same: JSON.stringify(a.map((x) => x.id)) === JSON.stringify(b.map((x) => x.id)),
      differ: JSON.stringify(a.map((x) => x.tpl)) !== JSON.stringify(nxt.map((x) => x.tpl)) || a[0].id !== nxt[0].id,
      groups: [...new Set(a.map((x) => x.group))], lo, hi, allSame, sample: a.map((x) => `${x.title}：${x.desc} 【${x.rewardText}】`),
    };
  });
  ok(off.n === 3, "offers() returns 3 commissions", off.sample);
  ok(off.same, "offers deterministic for same profile + run count");
  ok(off.differ, "offers change with run count");
  ok(off.allSame === 0 && off.groups.length >= 2, "offers never all the same type (30 run counts)", { groups: off.groups, allSame: off.allSame });
  ok(off.hi > off.lo, "commission size scales with realm", { layer1: off.lo, layer9: off.hi });
  // 奇遇抽取：灵田单独掷（第 3 局起，区域一 20% / 区域二 25%），不占对话奇遇 0–2 个的名额
  const roll = await c.ev(async () => {
    const { Quests } = await import("/src/game/quests/index.js");
    const Q = new Quests(__game.ctx), P = { flags: { bailu: { met: 1 } }, stats: {} };
    const stat = (no, region) => {
      let lt = 0, dlg = 0, maxDlg = 0, bad = 0;
      for (let s = 0; s < 2000; s++) {
        const ids = Q.rollEncounters(P, no, region, s * 7919 + 13);
        const d = ids.filter((k) => k !== "lingtian").length;
        lt += ids.includes("lingtian") ? 1 : 0;
        dlg += d;
        maxDlg = Math.max(maxDlg, d);
        if (ids.filter((k) => k === "lingtian").length > 1) bad++;
      }
      return { lt: lt / 2000, dlgAvg: dlg / 2000, maxDlg, bad };
    };
    return { r1_2: stat(2, "r1"), r1_3: stat(3, "r1"), r2_8: stat(8, "r2"), r1_8: stat(8, "r1") };
  });
  ok(roll.r1_2.lt === 0 && roll.r1_3.dlgAvg === 0, "lingtian from run 3; dialogue encounters not before run 6", roll);
  ok(Math.abs(roll.r1_3.lt - 0.2) < 0.04 && Math.abs(roll.r2_8.lt - 0.25) < 0.04, "lingtian chance r1 20% / r2 25%", { r1: roll.r1_3.lt, r2: roll.r2_8.lt });
  ok(roll.r1_8.maxDlg <= 2 && roll.r1_8.bad === 0 && roll.r1_8.dlgAvg > 0.8, "lingtian does not take a 0–2 dialogue slot", roll.r1_8);

  // ---------- 2. 出行准备界面显示委托 ----------
  await c.ev(() => { __game.flow.go("prep"); });
  await page.locator('.mk-prep [data-prep-tab="quests"]').click();
  const shown = await waitFor(() => document.querySelectorAll(".mk-layer-prep [data-quest], .mk-layer-prep .quest").length === 3, null, 8000);
  ok(shown, "prep screen lists 3 offers");
  await c.wait(300);
  await shot("prep");

  // ---------- 3. 接委托出行（强制两个奇遇：白鹭 + 灵狐）----------
  await c.ev(async () => {
    const { getQuests } = await import("/src/game/flow/quests.js");
    const { QUEST_TEMPLATES } = await import("/src/data/quests.js");
    const Q = getQuests(__game.ctx);
    const P = __game.profile;
    const T = (id) => QUEST_TEMPLATES.find((t) => t.id === id);
    const hunt = Q.instantiate(T("hunt"), P, () => 0.5, 8, 0);
    const carry = Q.instantiate(T("carry"), P, () => 0.5, 8, 1);
    carry.objective.v = 20;
    Q.accept([hunt, carry]);
    Q.debug.encounters = ["bailu", "fox"];
    window.__T.need = hunt.objective.n;
    __game.flow.go("run", { region: "r1", quests: !0 });
  });
  ok(await waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play", null, 40000), "run started with quests");
  const st = await c.ev(() => {
    const r = __game.run, Q = r.quests;
    const pts = r.map.points.encounters || [];
    return {
      has: !!Q, n: Q && Q.active.length, encs: Q && Q.encs.map((e) => e.id), prog: Q && Q.progress(), hooked: !!r.__questsHooked, nPts: pts.length,
      onTagged: Q && Q.encs.map((e) => pts.some((p) => Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < 3.5 && (p.types || []).includes(e.id))),
    };
  });
  ok(st.has && st.n === 2, "run carries 2 accepted commissions", st.prog);
  ok(st.encs && st.encs.length === 2, "2 encounters placed at level points", st.encs);
  ok(st.hooked, "quests auto-update hooked onto run.update");
  if (st.nPts) ok(st.onTagged.every(Boolean), "encounters placed on level encounter points with matching types", { encs: st.encs, onTagged: st.onTagged });
  else console.log("SKIP level has no points.encounters");

  // ---------- 4. 击杀推进进度 ----------
  const killed = await c.ev(async (need) => {
    const ctx = __game.ctx, E = ctx.enemies, p = ctx.player.pos;
    let n = 0;
    for (let i = 0; i < need; i++) {
      const e = E.spawn("wolf", p.clone().add(new ctx.THREE.Vector3(30 + i, 0, 30)), { region: "r1" });
      if (!e) continue;
      ctx.world.dealDamage(null, e.entity, { base: 1e7, noCrit: !0, test: !0 });
      n++;
    }
    await new Promise((r) => setTimeout(r, 300));
    return { n, prog: __game.run.quests.progress() };
  }, (await c.ev(() => __T.need)));
  ok(killed.n > 0 && killed.prog[0].done, "kill events complete hunt commission", killed.prog);
  // 采集事件
  const gp = await c.ev(async () => {
    const Q = __game.run.quests;
    const { makeItem } = await import("/src/core/items.js");
    const before = Q.onGather({ items: [makeItem("ninglu_hua", { n: 2 })] });
    return !0;
  });
  ok(gp, "gather:done handler runs");

  // ---------- 5. 白鹭奇遇 ----------
  await page.waitForFunction(() => __game.run.quests.encs[0].vis.ready, null, { timeout: 15000 }).catch(() => {});
  const bl = await c.ev(() => {
    const enc = __game.run.quests.encs.find((e) => e.id === "bailu"), v = enc.vis;
    const a = v.actions;
    return { src: v.source, acts: Object.keys(a).sort(), pos: [enc.pos.x, enc.pos.z], playing: v.cur && v.cur.getClip().name };
  });
  ok(bl.src === "bailu.glb", "bailu.glb loaded", bl.src);
  ok(["idle", "run", "talk", "wave"].every((k) => bl.acts.includes(k)), "bailu has idle/run/talk/wave", bl.acts);
  // 走过去：远处先招手
  await c.ev(([x, z]) => {
    __game.run.quests.encs.find((e) => e.id === "bailu").noticed = !1; // 入口可能就在附近：重新触发"发现"
    __game.player.spawn(x + 8, z + 8);
  }, bl.pos);
  await c.wait(600);
  const wav = await c.ev(() => {
    const v = __game.run.quests.encs.find((e) => e.id === "bailu").vis;
    const enc = __game.run.quests.encs.find((e) => e.id === "bailu");
    return { clip: v.cur && v.cur.getClip().name, t: v.cur && v.cur.time, noticed: enc.noticed, left: v.onceLeft, d: Math.hypot(enc.pos.x - __game.player.pos.x, enc.pos.z - __game.player.pos.z), st: enc.state };
  });
  ok(wav.clip === "wave", "bailu waves when player approaches", wav);
  await c.ev(([x, z]) => __game.player.spawn(x + 0.9, z + 0.4), bl.pos);
  await c.wait(400);
  const hint = await c.ev(() => __game.run.hint);
  ok(/白鹭/.test(hint || ""), "F hint shows near bailu", hint);
  await c.wait(500);
  await shot("bailu_near");
  await c.ev(() => __game.ctx.input.tap("KeyF"));
  ok(await waitFor(() => !!document.querySelector(".qd-wrap"), null, 3000), "F opens ink dialogue box");
  const paused = await c.ev(() => __game.ctx.world.timeScale);
  ok(paused === 0, "world paused while talking", paused);
  await c.wait(1500);
  await shot("dialog_lines");
  // 空格逐句推进到选项
  for (let k = 0; k < 8 && !(await c.ev(() => document.querySelectorAll(".qd-c").length)); k++) await page.keyboard.press("Space"), await c.wait(250);
  const choices = await c.ev(() => [...document.querySelectorAll(".qd-c")].map((e) => e.textContent + (e.classList.contains("off") ? "[off]" : "")));
  ok(choices.length === 3, "first-meeting dialogue offers 3 choices", choices);
  const talkClip = await c.ev(() => __game.run.quests.encs.find((e) => e.id === "bailu").vis.cur.getClip().name);
  ok(talkClip === "talk", "bailu plays talk while in dialogue", talkClip);
  await shot("dialog_choices");
  // 数字键 1 不应触发丹药（被对话框截获）
  const pot0 = await c.ev(() => __game.ctx.skills.potions.map((p) => p && p.count));
  await page.keyboard.press("Digit1");
  await c.wait(300);
  const pot1 = await c.ev(() => __game.ctx.skills.potions.map((p) => p && p.count));
  ok(JSON.stringify(pot0) === JSON.stringify(pot1), "choice key does not trigger potion", { pot0, pot1 });
  for (let k = 0; k < 6 && (await c.ev(() => !!document.querySelector(".qd-wrap"))); k++) await page.keyboard.press("Space"), await c.wait(250);
  const after = await c.ev(() => ({ open: !!document.querySelector(".qd-wrap"), b: __game.profile.flags.bailu, ts: __game.ctx.world.timeScale, notes: __game.run.quests.notes, known: __game.run.extracts.filter((x) => x.known).length }));
  ok(!after.open && after.ts > 0, "dialogue closes and world resumes", after);
  ok(after.b && after.b.stage === 1 && after.b.favour === 1 && after.b.met === 1, "choice resolves: bailu stage 1, favour +1", after.b);

  // ---------- 6. 灵狐：喂丹 → 带路 → 藏宝 ----------
  const fox = await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    __game.run.bag.add(makeItem("huichun_dan", { n: 1 }));
    const enc = __game.run.quests.encs.find((e) => e.id === "fox");
    __game.player.spawn(enc.pos.x + 0.9, enc.pos.z + 0.4);
    window.__T.drops = 0;
    __game.ctx.world.events.on("loot:drop", (e) => e.source === "encounter" && (window.__T.drops += e.items.length));
    return [enc.pos.x, enc.pos.z];
  });
  await c.wait(400);
  await c.ev(() => __game.ctx.input.tap("KeyF"));
  await waitFor(() => !!document.querySelector(".qd-wrap"), null, 3000);
  for (let k = 0; k < 6 && !(await c.ev(() => document.querySelectorAll(".qd-c").length)); k++) await page.keyboard.press("Space"), await c.wait(200);
  const fc = await c.ev(() => [...document.querySelectorAll(".qd-c")].map((e) => e.classList.contains("off")));
  ok(fc.length === 3 && fc[0] === !1, "fox: pill option enabled when carrying 回春丹", fc);
  await page.keyboard.press("Digit1");
  for (let k = 0; k < 6 && (await c.ev(() => !!document.querySelector(".qd-wrap"))); k++) await page.keyboard.press("Space"), await c.wait(200);
  const fo0 = await c.ev(() => ({ pill: __game.run.bag.count("huichun_dan"), fortune: __game.profile.stats.fortune }));
  ok(fo0.pill === 0 && fo0.fortune >= 8, "fox: pill consumed, fortune +8", fo0);
  ok(await waitFor(() => __T.drops > 0, null, 8000), "fox leads to a hidden cache (loot dropped)");
  await shot("fox_lead");

  // ---------- 7. 撤离 → 交付奖励 ----------
  const sett = await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const r = __game.run, P = __game.profile;
    r.bag.add(makeItem("ling_yu", { n: 5 }));
    r.quests.update(0.016);
    const b0 = [P.storage.count("spirit_stone"), P.xp, P.stats.fortune || 0, P.storage.items.length];
    const gate = r.extracts.find((x) => x.kind === "gate") || r.extracts[0];
    const res = r.finish("extract", gate);
    const d = [P.storage.count("spirit_stone") - b0[0], P.xp - b0[1], (P.stats.fortune || 0) - b0[2]];
    // 期望：每个委托的主奖励（修为 / 机缘 / 灵石）都到账
    const want = res.quests.rewards.filter((x) => x.xp || x.fortune || x.id === "spirit_stone").length;
    return { q: res.quests, d, want };
  });
  ok(sett.q && sett.q.list.length === 2 && sett.q.list.every((x) => x.done), "extract: both commissions delivered", sett.q && sett.q.list);
  ok(sett.q && sett.want >= 2 && sett.d.some((x) => x > 0), "rewards applied to profile (stones / xp / fortune)", { delta: sett.d, rewards: sett.q && sett.q.rewards.map((x) => x.id ? x.id + "×" + x.n : JSON.stringify(x)), notes: sett.q && sett.q.notes });
  ok(await waitFor(() => __game.flow.name === "result", null, 6000), "result screen after extraction");
  await c.wait(800);
  await shot("result");

  // ---------- 8. 第二局：白鹭求助（她出手）+ 身陨不交付 ----------
  await c.ev(async () => {
    const { getQuests } = await import("/src/game/flow/quests.js");
    const { QUEST_TEMPLATES } = await import("/src/data/quests.js");
    const Q = getQuests(__game.ctx), P = __game.profile;
    const hunt = Q.instantiate(QUEST_TEMPLATES.find((t) => t.id === "hunt"), P, () => 0, 9, 0);
    hunt.objective.n = 1;
    const relic = Q.instantiate(QUEST_TEMPLATES.find((t) => t.id === "retrieve"), P, () => 0, 9, 1);
    Q.accept([hunt, relic]);
    Q.debug.encounters = ["bailu"];
    await __game.flow.go("run", { region: "r1", quests: !0 });
  });
  ok(await waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play" && __game.run.quests && __game.run.quests.encs.length === 1, null, 40000), "second run started");
  const rel = await c.ev(() => {
    const Q = __game.run.quests, q = Q.active.find((x) => x.objective.type === "retrieve"), rs = __game.run.map.points.relics || [];
    return { has: !!(q && q.target), place: q && q.place, onRelic: !!(q && q.target && rs.some((p) => Math.hypot(p.pos.x - q.target.pos.x, p.pos.z - q.target.pos.z) < 0.01)), n: rs.length, prog: Q.progress() };
  });
  if (rel.n) ok(rel.has && rel.onRelic && !!rel.place, "relic commission uses level relic point (points.relics)", rel);
  else console.log("SKIP level has no points.relics");
  await c.ev(() => {
    const enc = __game.run.quests.encs[0];
    __game.player.spawn(enc.pos.x + 0.9, enc.pos.z + 0.4);
  });
  await c.wait(500);
  await c.ev(() => __game.run.quests.open(__game.run.quests.encs[0]));
  for (let k = 0; k < 8 && !(await c.ev(() => document.querySelectorAll(".qd-c").length)); k++) await page.keyboard.press("Space"), await c.wait(200);
  const hn = await c.ev(() => __game.run.quests.encs[0].node);
  ok(hn === "help", "second meeting continues bailu's thread (help node)", hn);
  await page.keyboard.press("Digit1");
  for (let k = 0; k < 6 && (await c.ev(() => !!document.querySelector(".qd-wrap"))); k++) await page.keyboard.press("Space"), await c.wait(200);
  ok(await waitFor(() => __game.run.quests.help && __game.run.quests.help.ents.length > 0, null, 5000), "help: enemy pack spawned");
  await c.ev(() => {
    window.__T.allyHits = 0;
    __game.ctx.world.events.on("damage", (i) => i.spec && i.spec.tags && i.spec.tags.includes("bailu") && window.__T.allyHits++);
    // 测试隔离：主角不受伤
    __game.ctx.player.entity.hp = 1e6;
  });
  // 等白鹭出手（拉近距离）
  await c.ev(() => {
    const h = __game.run.quests.help;
    __game.player.spawn(h.at.x + 3, h.at.z + 3);
  });
  ok(await waitFor(() => __T.allyHits > 0, null, 15000), "bailu fights alongside (ally damage)", await c.ev(() => __T.allyHits));
  await shot("bailu_help");
  await c.ev(() => {
    const h = __game.run.quests.help;
    // 精英有护盾：连打几下
    for (let k = 0; k < 12; k++) for (const e of h.ents) e.alive && __game.ctx.world.dealDamage(null, e.entity, { base: 1e7, noCrit: !0, test: !0 });
  });
  ok(await waitFor(() => !__game.run.quests.help && __game.profile.flags.bailu.stage === 2, null, 6000), "help cleared → bailu stage 2, reward given", await c.ev(() => __game.profile.flags.bailu));
  // 身陨
  const death = await c.ev(async () => {
    const r = __game.run, P = __game.profile;
    const stones0 = P.storage.count("spirit_stone");
    const prog = r.quests.progress();
    const res = r.finish("death");
    return { prog, q: res.quests, delta: P.storage.count("spirit_stone") - stones0 };
  });
  ok(death.prog[0].done && death.q && death.q.rewards.length === 0 && death.q.list[0].done === !1, "death: completed commission not delivered", death.q);
  ok(await waitFor(() => __game.flow.name === "result", null, 6000), "result screen after death");

  // ---------- 9. 第三局：奇遇·灵田（强制出现，采完全部灵草）----------
  await c.ev(async () => {
    const { getQuests } = await import("/src/game/flow/quests.js");
    const { QUEST_TEMPLATES } = await import("/src/data/quests.js");
    const Q = getQuests(__game.ctx), P = __game.profile;
    const g = Q.instantiate(QUEST_TEMPLATES.find((t) => t.id === "gather"), P, () => 0, 10, 0);
    g.objective.n = 3;
    Q.accept([g]);
    Q.debug.encounters = ["lingtian"];
    await __game.flow.go("run", { region: "r1", quests: !0 });
  });
  ok(await waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play" && __game.run.quests && __game.run.quests.encs.length === 1, null, 40000), "third run started (lingtian forced)");
  const lt = await c.ev(() => {
    const r = __game.run, Q = r.quests, enc = Q.encs[0], f = enc.field;
    const T = __game.ctx.terrain;
    // 测试：灵草苗加成拉满、第 2 株时妖兽来袭
    enc.def = { ...enc.def, seedBonus: 1 };
    f.ambushAt = 2;
    __game.ctx.player.entity.hp = 1e6;
    window.__T.lt = { gather: 0, seed: 0, done: 0, ambush: 0, drops: 0 };
    const ev = __game.ctx.world.events;
    ev.on("lingtian:gather", () => __T.lt.gather++);
    ev.on("lingtian:seed", () => __T.lt.seed++);
    ev.on("lingtian:done", () => __T.lt.done++);
    ev.on("lingtian:ambush", () => __T.lt.ambush++);
    ev.on("gather:done", (e) => (__T.lt.drops += (e.items || []).length));
    __T.lt.grade = [];
    ev.on("lingtian:gather", (e) => __T.lt.grade.push(e.items.filter((it) => !/^seed_/.test(it.id)).every((it) => (it.rarity || 0) === e.q)));
    return {
      n: f.plants.length, kinds: f.plants.map((p) => p.kind), center: [enc.pos.x, enc.pos.z], tagged: enc.tagged,
      labels: f.plants.map((p) => p.mark.label), herbs: f.plants.map((p) => p.herb), qs: f.plants.map((p) => p.q),
      marks: f.plants.every((p) => p.mark && r.marks.includes(p.mark) && p.mark.kind === "gather"),
      stand: f.plants.every((p) => !T.canStand || T.canStand(p.pos.x, p.pos.z, p.pos.y, 0.3)),
      look: f.plants.every((p) => p.mark.group && p.mark.group.children.length > 0),
      map: Q.mapPoints(),
    };
  });
  ok(lt.n >= 5 && lt.n <= 9, "lingtian: 5–9 herbs laid out", { n: lt.n, kinds: lt.kinds, tagged: lt.tagged });
  ok(lt.marks && lt.look, "lingtian: each herb is a run gather mark with gatherMarker look");
  ok(lt.kinds.every((k) => /^lt_\w+_q[0-4]$/.test(k)) && lt.herbs.every((h) => ["qingling", "ninglu", "hanlu", "ziteng", "chiyan"].includes(h)) && lt.labels.every((l) => !/^灵草/.test(l)), "lingtian: lt_<herb>_q<grade> parsed (herb id, label, grade)", { kinds: lt.kinds, labels: lt.labels });
  ok(lt.stand, "lingtian: every herb on standable ground");
  ok(lt.map.length === 1 && lt.map[0].glyph === "缘" && lt.map[0].kind === "encounter", "map point exposed as 缘", lt.map);
  // 远看：走到 7 米外（灵田在画面里），触发心声
  await c.ev(([x, z]) => __game.player.spawn(x - 4, z + 5.5), lt.center);
  ok(await waitFor(() => !!document.querySelector(".qd-thought"), null, 3000), "approach → inner thought shown", await c.ev(() => (document.querySelector(".qd-thought") || {}).textContent));
  await c.wait(500);
  await shot("lingtian_far");
  // 逐株采集（F，走 run 的采集分支）
  for (let i = 0; i < lt.n; i++) {
    const at = await c.ev((i) => {
      const p = __game.run.quests.encs[0].field.plants[i];
      __game.player.spawn(p.pos.x + 0.3, p.pos.z + 0.2);
      return !p.taken;
    }, i);
    if (!at) continue;
    await c.wait(250);
    await c.ev(() => __game.ctx.input.tap("KeyF"));
    await waitFor((i) => __game.run.quests.encs[0].field.plants[i].taken, i, 3000);
    if (i === 1) await c.wait(400), await shot("lingtian_gather");
  }
  const lr = await c.ev(() => ({ T: __T.lt, enc: __game.run.quests.encs[0].state, taken: __game.run.quests.encs[0].field.taken, prog: __game.run.quests.progress(), left: __game.run.marks.filter((m) => m.lingtian).length }));
  ok(lr.taken === lt.n && lr.T.gather === lt.n && lr.left === 0, "all lingtian herbs gathered via F", lr);
  ok(lr.T.drops > 0, "gather drops from gather_<kind> table", lr.T);
  // 采集所得直接进储物袋（袋满才落地，2026-11-17 用户）：灵田里不该留下地上的东西
  const lg = await c.ev(([x, z]) => ({ ground: __game.run.pickups.list.filter((p) => Math.hypot(p.x - x, p.z - z) < 8).length, full: __game.run.bag.free <= 0, herbs: __game.run.bag.items.filter((i) => /_cao|_hua|_teng|_guo|^seed_/.test(i.id)).length }), lt.center);
  ok((lg.ground === 0 || lg.full) && lg.herbs > 0, "lingtian: herbs and seedlings go straight into the bag (nothing left on the ground)", lg);
  ok(lr.T.seed >= lt.n, "lingtian seed events (table + bonus seedlings)", lr.T);
  ok(lr.T.grade.length === lt.n && lr.T.grade.every(Boolean), "lingtian herbs drop at the plant's grade", lr.T.grade);
  ok(lr.T.ambush === 1, "ambush spawned at Nth herb", lr.T);
  ok(lr.T.done === 1 && lr.enc === "done", "lingtian done event, encounter finished", lr.T);
  ok(lr.prog[0].done, "采药 commission counts lingtian gathers", lr.prog);
  const errs = await c.ev(() => window.__errors.length);
  ok(errs === 0, "no page errors", await c.ev(() => window.__errors.slice(0, 5)));
}
