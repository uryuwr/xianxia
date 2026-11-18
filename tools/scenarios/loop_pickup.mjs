// 地上物品按 F 取 / 采集直接入袋（用户 2026-11-17："掉落、丢弃的物品不要自动拾取，也要按 F 自取"）
//   node tools/run.mjs loop_pickup "scene=run&region=r1&slot=6"
// 检查：走近不自动拾取；F 提示 = "取 + 名称"（品级色、宝品以上带品级印、多件"等 N 件"）；按 F 一次取走 1.6 米内全部、范围外不动；
//      袋满：能放的放、放不下的留在原地并提示；丢弃后站在上面不会被捡回、按 F 取回；
//      采集（关卡里出现的每种采集点 + 灵光点 + 灵田）直接进储物袋、不落地；袋满时才落地（抛落动效）、之后按 F 取；
//      教学局：地上的锈剑按 F 取 → 自动佩上、序章"拾得"记一笔，采灵草直接入袋；取物那一帧耗时（记录，不作断言）；页面无报错。
const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await page.mouse.move(980, 560);
  await c.wait(1200);
  const setup = async () =>
    c.ev(async () => {
      const G = (window.__pk = {});
      const r = __game.run;
      G.items = await import("/src/core/items.js");
      G.tint = await import("/src/fx/rarity_tint.js");
      for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch", "pickF", "lingzhi"]) r.profile.flags["hint_" + k] = 1;
      G.mk = (id, o = {}) => G.items.makeItem(id, o);
      G.calm = () => {
        r.clearEnemies();
        r.nextWave = 1e9;
        r.hintT = 99;
        const h = __game.player.entity;
        h.hp = h.stats.get("hp");
        document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
      };
      G.toasts = () => [...document.querySelectorAll(".mk-toasts .ink-toast")].map((e) => e.textContent).join(" | ");
      G.ground = (x, z, R = 3) => r.pickups.list.filter((p) => Math.hypot(p.x - x, p.z - z) < R);
      // 离所有交互物远的一块平地
      G.spot = () => {
        const b = r.map.bounds, H = (x, z) => r.map.height(x, z);
        let best = null, bs = -1;
        for (let x = b.x0 * 0.7; x <= b.x1 * 0.7; x += 4)
          for (let z = b.z0 * 0.7; z <= b.z1 * 0.7; z += 4) {
            const h0 = H(x, z);
            if (h0 < -0.4) continue;
            let flat = 0;
            for (let dx = -4; dx <= 4; dx += 2) for (let dz = -4; dz <= 4; dz += 2) flat += Math.abs(H(x + dx, z + dz) - h0) < 0.5 ? 1 : 0;
            const md = Math.min(30, ...r.marks.map((m) => Math.hypot(m.pos.x - x, m.pos.z - z)));
            const sc = flat * 2 + md;
            if (sc > bs) (bs = sc), (best = [x, z]);
          }
        return best;
      };
      G.home = G.spot();
      G.goHome = () => (__game.player.spawn(G.home[0], G.home[1]), G.calm());
      G.goHome();
      r.bag.clear();
      r.emit("bag");
      return G.home;
    });
  await setup();
  await c.wait(400);
  const calm = () => c.ev(() => __pk.calm());
  const shot = async (n) => (await calm(), c.shot(n));

  // ---------------- 1. 掉在地上：走近不自动拾取 ----------------
  await c.ev(() => {
    const r = __game.run, [x, z] = __pk.home, T = __game.THREE;
    const at = (dx, dz) => new T.Vector3(x + dx, r.map.height(x + dx, z + dz), z + dz);
    __pk.drops = [
      r.pickups.drop(at(1.0, 0), __pk.mk("spirit_stone", { n: 3 }), 0),
      r.pickups.drop(at(1.3, 0.5), __pk.mk("wolf_fang", { n: 2 }), 0),
      r.pickups.drop(at(0.9, -0.6), __pk.mk("spirit_orb_shard", { rarity: 2 }), 0),
    ].map((p) => p.inst.uid);
  });
  await c.wait(300);
  // 直接站到宝品碎玉上（最近的是它），再等 1.5 秒
  await c.ev(() => {
    const p = __game.run.pickups.list.find((q) => q.inst.id === "spirit_orb_shard");
    __game.player.spawn(p.x + 0.05, p.z + 0.05);
  });
  await c.wait(1500);
  const s1 = await c.ev(() => ({ bag: __game.run.bag.items.length, ground: __game.run.pickups.list.length, hint: __game.run.hint }));
  ok(s1.bag === 0 && s1.ground === 3, "走近 / 站在物品上不会自动拾取", s1);

  // ---------------- 2. 交互提示："F · 取 名称"，品级色 + 品级印，多件"等 N 件" ----------------
  const s2 = await c.ev(() => {
    const gp = document.querySelector(".mk-layer-gather .mk-gp"), q = 2;
    const want = __pk.tint.css(__pk.tint.rarityTint(q).text);
    return {
      on: gp.classList.contains("on"), verb: gp.querySelector(".verb").textContent, nm: gp.querySelector(".nm").textContent, sub: gp.querySelector(".sub").textContent,
      tag: gp.querySelector(".tag").textContent, qname: __pk.items.RARITY[q].name, color: gp.style.getPropertyValue("--gp-c").trim(), want, cls: gp.className, hint: __game.run.hint,
      mark: (__game.run.nearestMark() || {}).kind,
    };
  });
  ok(s2.on && s2.verb === "取" && /灵光碎玉|碎玉/.test(s2.nm) && s2.mark === "pickup", "提示：F · 取 + 物品名", s2);
  ok(s2.color === s2.want && s2.tag === s2.qname, "提示名称按 RARITY 品级着色，宝品带品级印", { color: s2.color, want: s2.want, tag: s2.tag });
  ok(/等 3 件/.test(s2.sub), "身边多件：提示写\"等 N 件\"", s2.sub);
  await c.shot("prompt");

  // ---------------- 3. 范围外的不取；按 F 一次取走范围内全部 ----------------
  await c.ev(() => {
    const r = __game.run, [x, z] = __pk.home, T = __game.THREE;
    __pk.far = r.pickups.drop(new T.Vector3(x + 5, r.map.height(x + 5, z), z), __pk.mk("tiejing_shi", { n: 1 }), 0).inst.uid;
    __pk.calm();
  });
  const t0 = await c.ev(() => {
    window.__pkFrames = [];
    let last = performance.now();
    const loop = (t) => {
      window.__pkFrames.push(t - last);
      last = t;
      if (window.__pkFrames.length < 40) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return performance.now();
  });
  await page.keyboard.press("KeyF");
  await c.wait(800);
  const s3 = await c.ev((uids) => {
    const r = __game.run, inBag = (u) => r.bag.items.some((i) => i.uid === u) || r.bag.items.some((i) => i.id === "spirit_stone");
    return {
      got: uids.filter((u) => r.bag.items.some((i) => i.uid === u)).length, stone: r.bag.count("spirit_stone"),
      ground: r.pickups.list.map((p) => p.inst.id), far: r.pickups.list.some((p) => p.inst.uid === __pk.far), toast: __pk.toasts(),
      fly: __game.ctx.gatherUI.stats.fly, maxFrame: Math.round(Math.max(...window.__pkFrames)), frames: window.__pkFrames.length,
    };
  }, await c.ev(() => __pk.drops));
  ok(s3.stone === 3 && s3.got >= 2 && s3.ground.length === 1 && s3.far, "按 F 一次取走 1.6 米内全部；范围外的留在地上", s3);
  ok(/拾得/.test(s3.toast) && s3.fly >= 1, "取物反馈：\"拾得…\"（含宝品）+ 飞入储物袋", { toast: s3.toast, fly: s3.fly });
  console.log("PICKUP_FRAME (按 F 取 3 件，取物后 40 帧内最长帧 ms)", JSON.stringify({ maxFrame: s3.maxFrame, frames: s3.frames }));
  // 同步耗时：一次取 8 件
  const perf = await c.ev(() => {
    const r = __game.run, p = __game.player.pos;
    r.bag.clear();
    for (let i = 0; i < 8; i++) r.pickups.drop(p, __pk.mk(i % 2 ? "wolf_fang" : "qingling_cao", { n: 1, rarity: i % 3 }), 0.5);
    const t = performance.now();
    const res = r.takeGround();
    return { ms: +(performance.now() - t).toFixed(2), got: res.got.length };
  });
  console.log("PICKUP_SYNC (takeGround 8 件同步耗时 ms)", JSON.stringify(perf));
  ok(perf.got === 8, "takeGround 一次取 8 件", perf);

  // ---------------- 4. 袋满：能放的放，放不下的留在原地并提示 ----------------
  await c.ev(() => {
    const r = __game.run;
    r.pickups.list.slice().forEach((p) => r.pickups.remove(p));
    r.bag.clear();
    // 塞到只剩 1 格（1 格、不可堆叠的物品；没有就用满堆的狼妖牙）
    const D = Object.values(__pk.items.ITEMS).find((d) => (d.size || 1) === 1 && (d.stack || 1) === 1 && d.cat !== "gear" && d.cat !== "pill" && d.cat !== "talisman" && !d.key && d.cat !== "quest");
    const one = () => (D ? __pk.mk(D.id) : __pk.mk("wolf_fang", { n: (__pk.items.defOf({ id: "wolf_fang" }) || {}).stack || 10 }));
    for (let k = 0; k < 80 && r.bag.free > 1; k++) if (!r.bag.add(one())) break;
    __pk.free0 = r.bag.free;
    __pk.bagFull0 = r.bagFullCount || 0;
    const p = __game.player.pos;
    __pk.small = r.pickups.drop(p, one(), 0.3).inst.uid; // 1 格：放得下
    r.pickups.drop(p, __pk.mk("rust_sword"), 0.3); // 2 格：放不下
    r.emit("bag");
    __pk.calm();
  });
  await c.wait(300);
  await page.keyboard.press("KeyF");
  await c.wait(400);
  const s4 = await c.ev(() => ({ free0: __pk.free0, free: __game.run.bag.free, small: __game.run.pickups.list.some((p) => p.inst.uid === __pk.small), ground: __game.run.pickups.list.map((p) => p.inst.id), full: (__game.run.bagFullCount || 0) - __pk.bagFull0, toast: __pk.toasts() }));
  ok(s4.free0 === 1 && s4.free === 0 && !s4.small && s4.ground.length === 1 && s4.ground[0] === "rust_sword", "袋满：放得下的取走、放不下的留在原地", s4);
  ok(s4.full >= 1 && /储物袋已满/.test(s4.toast) && /放不下/.test(s4.toast) && !/可弃|腾格/.test(s4.toast), "袋满提示（沿用现有满袋提示，不做可弃建议）", s4.toast);
  await c.shot("bagfull");

  // ---------------- 5. 丢弃：站在上面不会被捡回，按 F 取回 ----------------
  await c.ev(() => {
    const r = __game.run;
    r.pickups.list.slice().forEach((p) => r.pickups.remove(p));
    r.bag.clear();
    const it = __pk.mk("wolf_fang", { n: 1 });
    r.bag.add(it);
    __pk.dropUid = it.uid;
    r.dropFromBag(it.uid);
    const p = r.pickups.list.find((q) => q.inst.uid === it.uid);
    __game.player.spawn(p.x, p.z);
    __pk.calm();
  });
  await c.wait(2500);
  const s5 = await c.ev(() => ({ inBag: __game.run.bag.items.some((i) => i.uid === __pk.dropUid), ground: __game.run.pickups.list.some((p) => p.inst.uid === __pk.dropUid), hint: __game.run.hint }));
  ok(!s5.inBag && s5.ground && /^F · /.test(s5.hint), "丢弃后站在上面 2.5 秒也不会被捡回，显示 F 提示", s5);
  await page.keyboard.press("KeyF");
  await c.wait(300);
  const s5b = await c.ev(() => ({ inBag: __game.run.bag.items.some((i) => i.uid === __pk.dropUid), ground: __game.run.pickups.list.length }));
  ok(s5b.inBag && s5b.ground === 0, "丢弃的东西按 F 取回", s5b);

  // ---------------- 6. 采集：每种采集点（+ 灵光 + 灵田）直接入袋，不落地 ----------------
  const kinds = await c.ev(async () => {
    const r = __game.run, seen = new Map();
    for (const m of r.marks) if (m.kind === "gather") {
      const k = (m.glow ? "glow:" : "") + (m.gatherKind || "herb");
      if (!seen.has(k)) seen.set(k, m);
    }
    // 灵田：同 lingtian.js 的标记（gatherKind = lt_<草>_q<品级>，掉落档 gather_lt_*）
    const { gatherMarker } = await import("/src/world/markers.js");
    const [x, z] = __pk.home, T = __game.THREE;
    const obj = gatherMarker("qingling", "herb");
    const m = r.addMark({ kind: "gather", pos: new T.Vector3(x - 3, r.map.height(x - 3, z), z), gatherKind: "lt_qingling_q1", herb: "qingling", rarity: 1, label: "灵·青灵草（灵田）", glyph: "青", object: obj, point: { object: obj, cat: "herb", kind: "qingling" } });
    m.group.add(obj);
    m.fxObject = obj;
    seen.set("lingtian", m);
    __pk.gm = seen;
    return [...seen.keys()];
  });
  c.log("gather kinds", JSON.stringify(kinds));
  const rows = [];
  let first = !0;
  for (const k of kinds) {
    await c.ev((k) => {
      const r = __game.run, m = __pk.gm.get(k);
      r.pickups.list.slice().forEach((p) => r.pickups.remove(p));
      r.bag.clear();
      r.emit("bag");
      __game.player.spawn(m.pos.x + 0.9, m.pos.z + 0.4);
      __pk.calm();
      __pk.fly0 = __game.ctx.gatherUI.stats.fly;
      __pk.key0 = r.keyItems.length;
      __pk.car0 = r.carried.length;
    }, k);
    await c.wait(350);
    if (first) {
      // 第一种用真实按键
      await page.keyboard.press("KeyF");
      await c.wait(250);
      first = !1;
    }
    const row = await c.ev((k) => {
      const r = __game.run, m = __pk.gm.get(k);
      if (r.marks.includes(m)) r.interact(m);
      return {
        k, taken: !r.marks.includes(m), bag: r.bag.items.reduce((a, i) => a + i.n, 0) + r.keyItems.length - __pk.key0 + r.carried.length - __pk.car0, ids: r.bag.items.map((i) => i.id).slice(0, 4),
        ground: __pk.ground(m.pos.x, m.pos.z).length, toast: __pk.toasts(), fly: __game.ctx.gatherUI.stats.fly - __pk.fly0,
      };
    }, k);
    rows.push(row);
    if (k === kinds[0]) await c.wait(120), await c.shot("gather_direct");
  }
  for (const row of rows) ok(row.taken && row.bag > 0 && row.ground === 0 && /采得|拾得|护身格/.test(row.toast), `采集 ${row.k}：直接进储物袋（"采得…"），不落地`, row);
  ok(rows.some((r) => r.k.startsWith("glow:")) && rows.some((r) => r.k === "lingtian") && rows.length >= 3, "采集种类覆盖：普通采集点 / 灵光点 / 灵田", rows.map((r) => r.k));
  ok(rows.some((r) => r.fly >= 1), "采集入袋：物品从草丛飞进储物袋", rows.map((r) => r.fly));

  // ---------------- 7. 采集时袋满：放不下的才落地（抛落），之后按 F 取 ----------------
  const s7 = await c.ev(async () => {
    const r = __game.run, m = r.marks.find((q) => q.kind === "gather" && !q.glow);
    if (!m) return { none: !0 };
    r.pickups.list.slice().forEach((p) => r.pickups.remove(p));
    r.bag.clear();
    for (let k = 0; k < 80 && r.bag.free > 0; k++) if (!r.bag.add(__pk.mk("wolf_fang", { n: 10 }))) break; // 塞满（满堆，采到的东西叠不进去）
    __game.player.spawn(m.pos.x + 0.9, m.pos.z + 0.4);
    __pk.calm();
    __pk.m7 = m;
    const arcs0 = __game.ctx.gatherUI.stats.arcs, full0 = r.bagFullCount || 0, bag0 = r.bag.items.map((i) => i.uid + ":" + i.n).join();
    r.interact(m);
    await new Promise((res) => setTimeout(res, 300));
    return {
      free: r.bag.free, ground: __pk.ground(m.pos.x, m.pos.z).length, arcs: __game.ctx.gatherUI.stats.arcs - arcs0, full: (r.bagFullCount || 0) - full0,
      bagSame: bag0 === r.bag.items.map((i) => i.uid + ":" + i.n).join(), toast: __pk.toasts(),
    };
  });
  // 掉落里若有能叠进已有格子的（灵石之类）会进袋：只要求"有放不下的落地"
  ok(s7.none || (s7.ground >= 1 && s7.arcs >= 1 && s7.full >= 1 && /储物袋已满/.test(s7.toast)), "采集时袋满：放不下的落地（抛落）+ 满袋提示", s7);
  if (!s7.none) {
    await c.wait(600);
    const s7b = await c.ev(() => {
      const r = __game.run, m = __pk.m7;
      const p = __pk.ground(m.pos.x, m.pos.z)[0];
      r.bag.clear();
      r.emit("bag");
      __game.player.spawn(p.x, p.z);
      __pk.calm();
      return __pk.ground(m.pos.x, m.pos.z).length;
    });
    await c.wait(300);
    await page.keyboard.press("KeyF");
    await c.wait(300);
    const s7c = await c.ev(() => ({ ground: __pk.ground(__pk.m7.pos.x, __pk.m7.pos.z, 4).length, bag: __game.run.bag.items.length }));
    ok(s7c.bag >= 1 && s7c.ground < s7b, "袋空出来后按 F 取回采集落地的东西", { before: s7b, ...s7c });
  }
  let errs = await c.ev(() => window.__errors || []);

  // ---------------- 8. 教学局：地上的锈剑按 F 取 → 自动佩上；采灵草直接入袋 ----------------
  const base = new URL(page.url()).origin;
  await page.goto(`${base}/?scene=run&region=tutorial&slot=7`, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.run.pro && __game.run.pro.started, null, { timeout: 90000 });
  await c.wait(1000);
  const t1 = await c.ev(async () => {
    const r = __game.run, { makeItem } = await import("/src/core/items.js");
    // 新存档的序章：锈剑还没佩上。在开阔处放一柄地上的锈剑
    const p = __game.player.pos.clone();
    r.clearEnemies();
    window.__sw = r.pickups.drop(p, makeItem("rust_sword"), 0.3).inst.uid;
    document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    return { equip0: !!r.profile.equip.sword };
  });
  await c.wait(1500);
  const t2 = await c.ev(() => ({ equip: !!__game.run.profile.equip.sword, ground: __game.run.pickups.list.some((p) => p.inst.uid === window.__sw), mark: (__game.run.nearestMark() || {}).kind }));
  ok(!t1.equip0 && !t2.equip && t2.ground && t2.mark === "pickup", "教学局：地上的锈剑不会自动拾取，显示 F 取", { ...t1, ...t2 });
  await page.keyboard.press("KeyF");
  await c.wait(400);
  const t3 = await c.ev(() => {
    const r = __game.run, toasts = [...document.querySelectorAll(".mk-toasts .ink-toast")].map((e) => e.textContent).join(" | ");
    return { equip: r.profile.equip.sword && r.profile.equip.sword.uid === window.__sw, inBag: r.bag.items.some((i) => i.uid === window.__sw), fact: r.pro.f.pickup.has("rust_sword"), toast: toasts };
  });
  ok(t3.equip && !t3.inBag && t3.fact && /佩上/.test(t3.toast), "教学局：按 F 取锈剑 → 自动佩上，序章记下\"拾得\"", t3);
  const t4 = await c.ev(() => {
    const r = __game.run, m = r.marks.find((q) => q.kind === "gather");
    if (!m) return { none: !0 };
    r.clearEnemies();
    __game.player.spawn(m.pos.x + 0.9, m.pos.z + 0.4);
    const n0 = r.bag.items.reduce((a, i) => a + i.n, 0);
    r.interact(m);
    return { got: r.bag.items.reduce((a, i) => a + i.n, 0) - n0, ground: r.pickups.list.filter((p) => Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < 3).length, gathered: r.pro.f.gather.length };
  });
  ok(t4.none || (t4.got > 0 && t4.ground === 0 && t4.gathered >= 1), "教学局：采灵草直接入袋，序章记下\"采集\"", t4);
  errs = [...errs, ...(await c.ev(() => window.__errors || []))];
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
