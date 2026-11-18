// 首领首杀掉落（用户 2026-11-17：首杀青牙后没拿到"青牙之牙"）
//   node tools/run.mjs loop_boss_loot "scene=run&region=r1&slot=7"
// 检查：真打死青牙（控制器 allowDeath）→ 首杀标记；首杀必得物（青牙之牙、带 key 标签的、功法完本）击杀时直接进护身格并提示；
//      其余掉落在尸体容器里；Boss 出口不压在尸体上；站在尸体旁按 F 打开的是尸体（不是撤离阵）；
//      身陨（区域一保留一半）后青牙之牙仍入库；页面无报错。
const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await c.wait(1000);
  const waitFor = async (fn, arg, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await c.ev(fn, arg)) return !0;
      await c.wait(150);
    }
    return !1;
  };
  // 新存档、没斩过青牙；走到首领场地触发刷出
  const pre = await c.ev(() => {
    const r = __game.run, P = r.profile, bp = r.map.points.boss;
    delete P.flags.boss_qingya;
    __game.player.debug.god = !0;
    for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch", "pickF", "lingzhi"]) P.flags["hint_" + k] = 1;
    r.bag.clear();
    __game.player.spawn(bp.pos.x + 6, bp.pos.z + 6);
    window.__q = () => __game.ctx.enemies.list.find((e) => e.def && e.def.boss === "qingya");
    return { boss: !!bp, flag: !!P.flags.boss_qingya };
  });
  ok(pre.boss && !pre.flag, "r1 首领场地存在，存档未斩青牙", pre);
  ok(await waitFor(() => !!(window.__q() && window.__q().ctrl), null, 30000), "青牙刷出");
  // 打死（终结处决之外的路径：控制器 allowDeath 后一击毙命，掉落链路一致）
  const kill = await c.ev(() => {
    const q = window.__q(), r = __game.run;
    window.__drops = [];
    __game.world.events.on("loot:drop", (e) => window.__drops.push({ src: e.lootSource, items: e.items.map((i) => i.id) }));
    q.ctrl.allowDeath = !0;
    q.ctrl.phase = 2;
    __game.player.spawn(q.pos.x + 2.5, q.pos.z);
    // 与 core/combat.js dealDamage 的死亡分支一致（睡眠 / 护盾 / 一阶段保底都绕开，只测掉落链路）
    const t = q.entity, info = { attacker: __game.player.entity, target: t, amount: 1e6, crit: !1, element: null, tags: ["execute"], killed: !0, pos: q.pos, dir: null, knock: 0, spec: {} };
    t.hp = 0;
    t.alive = !1;
    if (t.onDeath) t.onDeath(info);
    __game.world.events.emit("kill", info);
    return { alive: q.alive };
  });
  ok(await waitFor(() => !window.__q() || !window.__q().alive, null, 6000), "青牙被斩", kill);
  await c.wait(1500);
  const after = await c.ev(() => {
    const r = __game.run, C = r.containers, q = __game.ctx.enemies.list.find((e) => e.def && e.def.boss === "qingya");
    const corpse = C.all().map((s) => s.container).find((x) => x.kind === "corpse" && x.tier === "boss");
    const exit = r.extracts.find((x) => x.kind === "boss");
    return {
      flag: !!r.profile.flags.boss_qingya, drops: window.__drops,
      keys: r.keyItems.map((i) => i.id), corpse: corpse ? corpse.slots.map((s) => s.inst.id) : null,
      exitD: corpse && exit ? +Math.hypot(exit.pos.x - corpse.pos.x, exit.pos.z - corpse.pos.z).toFixed(2) : null,
      cpos: corpse && [corpse.pos.x, corpse.pos.z],
    };
  });
  c.log("after kill", JSON.stringify(after));
  const fang = (a) => a.includes("qingya_fang");
  ok(after.flag && after.drops.length === 1 && after.drops[0].src === "boss_first" && fang(after.drops[0].items), "首杀：标记写入，掉落表里有青牙之牙", after.drops);
  ok(fang(after.keys) && after.keys.some((id) => /^scroll_.*_book$/.test(id)), "首杀必得物（青牙之牙、功法完本）击杀时直接进护身格", after.keys);
  ok(!!after.corpse && after.corpse.length > 0 && !fang(after.corpse), "其余掉落留在首领尸体里（青牙之牙不在尸体里）", after.corpse);
  ok(after.exitD != null && after.exitD >= 4.5, "Boss 出口不压在尸体上（≥ 4.5 米）", after.exitD);
  // 首杀提示（处决演出期间通知被收起，演出后要能看到）
  ok(await waitFor(() => [...document.querySelectorAll(".mk-toasts .ink-toast")].some((e) => /青牙之牙/.test(e.textContent) && /护身格/.test(e.textContent)), null, 8000), "提示：青牙之牙收入护身格（身陨不失）");
  // 站在尸体旁按 F：打开的是尸体
  if (after.cpos) {
    await c.ev(([x, z]) => {
      __game.player.spawn(x + 0.9, z + 0.3);
      document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    }, after.cpos);
    await c.wait(400);
    const nm = await c.ev(() => {
      const m = __game.run.nearestMark();
      return { kind: m && m.kind, label: m && m.label, hint: __game.run.hint };
    });
    ok(nm.kind === "loot", "站在首领尸体旁：最近的交互是尸体（不是 Boss 出口）", nm);
    await page.keyboard.press("KeyF");
    await c.wait(400);
    const st = await c.ev(() => ({ open: !!__game.run.containers.openC, channel: __game.run.state }));
    ok(st.open && st.channel === "play", "按 F 打开尸体搜取窗，没有开始撤离读条", st);
    await c.shot("corpse_open");
    await page.keyboard.press("Escape");
  }
  // 身陨（区域一）：护身格里的青牙之牙照样入库
  const d0 = await c.ev(() => __game.profile.storage.count("qingya_fang"));
  await c.ev(() => __game.run.die());
  ok(await waitFor(() => !!__game.run.result, null, 6000), "身陨结算");
  const d1 = await c.ev(() => ({ store: __game.profile.storage.count("qingya_fang"), kept: (__game.run.result.kept || []).map((i) => i.id) }));
  ok(d1.store === d0 + 1, "身陨后青牙之牙仍入库（仓库 +1）", { before: d0, ...d1 });
  const errs = await c.ev(() => window.__errors || []);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
