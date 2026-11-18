// 搜取（留尸 / 宝箱容器 / 墨封宣纸格）的可运行测试 + 截图。
//   node tools/run.mjs loop_loot "scene=run&region=r1&slot=4"
// 检查：击杀留尸（有掉落才留、无掉落化墨散去）；F 打开；格子依次探查、揭示；品质颜色；神识缩短探查时长、≥40 预感透色；
//      关窗进度保留、再开从断点继续；受击 / 走动收起；点取、F 全取；储物袋满时物品留在容器；宝箱同理（开箱 = 打开格子窗）；
//      取空后空尸变淡、到时消散；页面无报错。
const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await page.mouse.move(980, 560); // 鼠标放在空地上（别悬停到 HUD 上弹说明）
  await c.wait(1500);
  await c.ev(async () => {
    const G = (window.__lt = { log: [] });
    const r = __game.run;
    G.items = await import("/src/core/items.js");
    G.C = await import("/src/game/run/containers.js");
    for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch"]) r.profile.flags["hint_" + k] = 1;
    r.containers.on((t, d) => t !== "progress" && G.log.push({ t, i: d && d.i, reason: d && d.reason, id: d && d.c && d.c.id, q: d && d.rarity, resume: d && d.resume, at: performance.now() }));
    G.calm = () => {
      r.clearEnemies();
      r.nextWave = 1e9;
      r.hintT = 99;
      const h = __game.player.entity;
      h.hp = h.stats.get("hp");
      document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    };
    G.spot = () => {
      // 一块开阔的平地（离标记物远）
      const b = r.map.bounds, H = (x, z) => r.map.height(x, z);
      let best = null, bs = -1;
      for (let x = b.x0 * 0.7; x <= b.x1 * 0.7; x += 4)
        for (let z = b.z0 * 0.7; z <= b.z1 * 0.7; z += 4) {
          const h0 = H(x, z);
          if (h0 < -0.4) continue;
          let flat = 0;
          for (let dx = -6; dx <= 6; dx += 2) for (let dz = -4; dz <= 4; dz += 2) flat += Math.abs(H(x + dx, z + dz) - h0) < 0.5 && !__game.ctx.colliders.some((q) => q.r > 0.4 && (q.x - x - dx) ** 2 + (q.z - z - dz) ** 2 < (q.r + 0.6) ** 2) ? 1 : 0;
          const md = Math.min(30, ...r.marks.map((m) => Math.hypot(m.pos.x - x, m.pos.z - z)));
          const sc = flat * 2 + md;
          if (sc > bs) (bs = sc), (best = [x, z]);
        }
      return best;
    };
    G.home = G.spot();
    __game.player.spawn(G.home[0], G.home[1]);
    G.calm();
    G.mk = (id, o = {}) => G.items.makeItem(id, o);
    G.kill = (e) => __game.ctx.world.dealDamage(__game.player.entity, e.entity, { base: 99999, scale: {}, tags: ["test"], pos: e.pos, dir: new __game.THREE.Vector3(1, 0, 0) });
  });
  const calm = () => c.ev(() => __lt.calm());
  const shot = async (n) => (await c.ev(() => document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove())), c.shot(n));

  // ---------------- 1. 击杀留尸 ----------------
  const k = await c.ev(async () => {
    const r = __game.run, E = __game.ctx.enemies, [x, z] = __lt.home;
    const P = (dx, dz) => new __game.THREE.Vector3(x + dx, r.map.height(x + dx, z + dz), z + dz);
    // 一只不掉落（noLoot）→ 不留尸；再杀几只直到有掉落
    const bare = E.spawnPack(1, !1, P(-3, 2), { types: ["wolf"] })[0];
    bare.noLoot = !0;
    __lt.kill(bare);
    __lt.bare = bare;
    let tries = 0;
    while (!r.containers.list.some((q) => q.kind === "corpse") && tries++ < 12) {
      const e = E.spawnPack(1, !1, P(2.5, 0.5), { types: ["wolf"] })[0];
      for (const q of E.list) q !== e && q.alive && q.dispose && 0;
      __lt.kill(e);
    }
    const cc = r.containers.list.find((q) => q.kind === "corpse");
    __lt.corpse = cc;
    return { tries, corpse: !!cc, slots: cc ? cc.slots.length : 0, keep: cc ? !!cc.enemy.keepBody : null, mark: cc ? r.marks.includes(cc.mark) && cc.mark.kind : null, bareKeep: !!bare.keepBody };
  });
  ok(k.corpse && k.slots > 0 && k.keep && k.mark === "loot" && !k.bareKeep, "击杀：有掉落 → 留尸成容器（loot 标记，身体保留）；无掉落的不留", k);
  await c.wait(2200);
  const k2 = await c.ev(() => {
    const cc = __lt.corpse;
    let meshes = 0, cast = 0, drawn = 0;
    cc.body && cc.body.traverse((o) => o.isMesh && (meshes++, o.castShadow && cast++, o.visible && drawn++));
    return { adopted: !!cc.body, inScene: !!(cc.body && cc.body.parent), bareGone: __lt.bare.removed && !__lt.bare.root.parent, ground: __game.run.pickups.list.length, meshes, cast, drawn };
  });
  ok(k2.adopted && k2.inScene && k2.bareGone, "尸身交给容器、定格在场景里；无掉落的尸体化墨散去；掉落不再抛到地上", k2);
  ok(k2.cast === 0 && k2.drawn > 0 && k2.drawn <= k2.meshes / 2, "尸身不投影、墨线壳不画（draw call 减半）", k2);

  // ---------------- 2. F 打开、依次探查 ----------------
  await c.ev(() => {
    const cc = __lt.corpse;
    __game.player.spawn(cc.pos.x + 1.2, cc.pos.z + 0.4);
    __lt.calm();
  });
  await c.wait(400);
  await c.ev(() => (__lt.log.length = 0));
  await page.keyboard.press("f");
  await c.wait(150);
  const o = await c.ev(() => ({ open: __game.run.containers.openC === __lt.corpse, dom: document.querySelectorAll(".mk-loot .lw-cell").length, n: __lt.corpse.slots.length, prompt: document.querySelector(".mk-gp").classList.contains("on") }));
  if (!o.open) c.log("WARN F 没有打开容器");
  ok(o.open && o.dom === o.n && !o.prompt, "F 打开搜取窗：格子数 = 物品数，F 提示收起", o);
  await c.wait(400 + 900 * o.n);
  const seq = await c.ev(() => {
    const L = __lt.log.filter((e) => e.t === "searchStart" || e.t === "reveal").map((e) => e.t[0] + e.i);
    return { L, revealed: __lt.corpse.slots.filter((s) => s.state === "shown").length };
  });
  const order = seq.L.every((x, i, a) => (x[0] === "s" ? i === 0 || a[i - 1] === "r" + (+x.slice(1) - 1) || a[i - 1].slice(1) === String(+x.slice(1) - 1) : a[i - 1] === "s" + x.slice(1)));
  ok(seq.revealed === o.n && order, "格子按顺序逐个探查、揭示", seq);
  await shot("corpse_revealed");
  // ---------------- 3. F 全取 ----------------
  const b0 = await c.ev(() => __game.run.bag.used);
  await page.keyboard.press("f");
  await c.wait(300);
  const t = await c.ev(() => {
    const cc = __lt.corpse, r = __game.run;
    return { taken: cc.slots.filter((s) => s.state === "taken").length, n: cc.slots.length, empty: cc.emptyAt != null, mark: r.marks.includes(cc.mark), open: !!r.containers.openC, bag: r.bag.used, opacity: cc.mats ? +cc.mats[0].opacity.toFixed(2) : null };
  });
  ok(t.taken === t.n && t.empty && !t.mark && !t.open && t.bag >= b0 && t.opacity <= 0.45, "F 全取：全部进储物袋 → 容器取空、标记移除、窗口收起、尸身开始化墨", t);
  await c.wait(1500);
  const gone = await c.ev(() => ({ gone: !__game.run.containers.list.includes(__lt.corpse), body: !!(__lt.corpse.body && __lt.corpse.body.parent) }));
  ok(gone.gone && !gone.body, "尸体取空后约 1.2 秒化墨散去，容器释放", gone);

  // ---------------- 4. 品质颜色、神识、截图 ----------------
  const mkCache = (sense) =>
    c.ev((sense) => {
      const r = __game.run, [x, z] = __lt.home;
      r.senseOverride = sense;
      if (__lt.cache && r.containers.list.includes(__lt.cache)) r.containers.remove(__lt.cache);
      __lt.log.length = 0; // 只看这个容器的事件
      const p = new __game.THREE.Vector3(x - 1, r.map.height(x - 1, z + 1), z + 1);
      const items = [__lt.mk("spirit_stone", { n: 12 }), __lt.mk("ninglu_hua", { n: 3, rarity: 1 }), __lt.mk("lingbang_zhu", { rarity: 2 }), __lt.mk("hanlu_cao", { n: 2, rarity: 3 }), __lt.mk("water_jade", { rarity: 2 }), __lt.mk("tiejing_shi", { n: 2 }), __lt.mk("jade_qing", { rarity: 2, identified: !1 })];
      const cc = r.containers.create({ kind: "corpse", pos: p, items, label: "狼妖首领遗骸", glyph: "骸" });
      __lt.cache = cc;
      __game.player.spawn(p.x + 1.3, p.z + 0.5);
      __lt.calm();
      r.containers.open(cc);
      return cc.slots.length;
    }, sense);
  await mkCache(0);
  // 探查中：笔走到一半（第 2 格，宝品 0.8 秒）
  await page.waitForFunction(() => {
    const e = document.querySelector('.mk-loot .lw-cell[data-i="2"]');
    return e && e.classList.contains("is-search") && +e.style.getPropertyValue("--v") >= 0.45;
  }, null, { timeout: 5000, polling: 16 });
  await shot("search_half");
  const col = await c.ev(() => {
    const e = document.querySelector('.mk-loot .lw-cell[data-i="2"]');
    return { search: e.classList.contains("is-search"), v: +e.style.getPropertyValue("--v"), sense: document.querySelector(".mk-loot .hd .sense b").textContent };
  });
  ok(col.v > 0.4 && col.sense === "0", "探查中：神识一笔绕行（--v 进度），右上神识小印", col);
  // 宝品揭示的瞬间（第 2 格：灵蚌珠）
  await page.waitForFunction(() => __lt.log.some((e) => e.t === "reveal" && e.i === 2), null, { timeout: 8000 });
  await c.wait(90);
  await shot("reveal_bao");
  // 仙品揭示的瞬间（第 3 格：寒露草 仙品）
  await page.waitForFunction(() => __lt.log.some((e) => e.t === "reveal" && e.i === 3), null, { timeout: 8000 });
  await c.wait(120);
  await shot("reveal_xian");
  await page.waitForFunction(() => __lt.cache.slots.every((s) => s.state === "shown"), null, { timeout: 12000 });
  await c.wait(500);
  await shot("all_revealed");
  const q = await c.ev(() => {
    const out = {}, R = __lt.items.RARITY;
    const rgb = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;
    document.querySelectorAll(".mk-loot .lw-cell").forEach((e) => {
      const t = e.querySelector(".mk-tok"), qq = +e.dataset.q;
      out[e.dataset.i] = { q: qq, unid: e.classList.contains("unid"), unk: +getComputedStyle(e.querySelector(".unk")).opacity, ring: getComputedStyle(t.querySelector(".ring")).backgroundColor, want: rgb(R[qq].color), sealed: t.classList.contains("is-sealed"), sil: t.classList.contains("is-sil"), ico: !!t.querySelector(".mk-ico") };
    });
    return out;
  });
  const okq = Object.values(q).every((x) => x.ring === x.want && !x.sealed && x.ico && (x.unid ? x.sil : !x.sil));
  const un = Object.values(q).find((x) => x.unid);
  ok(un && un.sil && un.unk > 0.5, "未鉴定：揭示后保持墨拓剪影 + ？", un);
  ok(q[0].q === 0 && q[1].q === 1 && q[2].q === 2 && q[3].q === 3 && okq, "揭示后：物品签图标、圆相按 RARITY 着色", q);
  const st2 = await c.ev(() => ({ ...__game.ctx.gatherUI.loot.stats }));
  ok(st2.form >= 5 && st2.reveal >= 5, "两段揭示：先露形（墨封化开、剪影）再显色", st2);
  // 探查时长：神识 0 时宝品约 0.8s
  const dur = await c.ev(() => {
    const L = __lt.log, s = L.find((e) => e.t === "searchStart" && e.i === 2), r = L.find((e) => e.t === "reveal" && e.i === 2);
    return s && r ? +((r.at - s.at) / 1000).toFixed(2) : null;
  });
  ok(dur > 0.6 && dur < 1.1, "神识 0：宝品探查约 0.8 秒", dur);
  // 点取一件
  const one = await c.ev(() => {
    const e = document.querySelector('.mk-loot .lw-cell[data-i="2"]'), before = __game.run.bag.count("lingbang_zhu");
    e.click();
    return { got: __game.run.bag.count("lingbang_zhu") - before, taken: e.classList.contains("is-taken") };
  });
  ok(one.got === 1 && one.taken, "点格子取一件", one);
  await c.ev(() => __game.run.containers.close("esc"));
  await c.wait(300);

  // 高神识：预感透色 + 更快
  await c.ev(() => (__lt.log.length = 0));
  await mkCache(100);
  await c.wait(260);
  const om = await c.ev(() => {
    const e = [...document.querySelectorAll(".mk-loot .lw-cell")].find((q) => q.classList.contains("omen"));
    return { omen: e ? +e.style.getPropertyValue("--omen") : 0, cls: e ? e.className : "", sense: document.querySelector(".mk-loot .hd .sense b").textContent };
  });
  await shot("omen_sense100");
  ok(om.omen > 0.3 && om.sense === "100", "神识 100：墨封下隐约浮现剪影轮廓（预感）", om);
  await page.waitForFunction(() => __lt.log.some((e) => e.t === "reveal" && e.i === 2), null, { timeout: 8000 });
  const dur2 = await c.ev(() => {
    const L = __lt.log, s = L.find((e) => e.t === "searchStart" && e.i === 2), r = L.find((e) => e.t === "reveal" && e.i === 2);
    return +((r.at - s.at) / 1000).toFixed(2);
  });
  ok(dur2 < 0.6, "神识 100：宝品探查时长减半（0.8 × 100/200）", dur2);

  // ---------------- 5. 关窗保留进度 / 受击 / 走动收起 ----------------
  const br = await c.ev(async () => {
    const r = __game.run, cc = __lt.cache;
    r.senseOverride = 0;
    // 让第 3 格（仙品 1.2s）转到一半时收起
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        const s = cc.slots[3];
        if ((s.state === "search" && s.t > s.need * 0.3) || performance.now() - t0 > 6000) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });
    r.containers.close("esc");
    const s = cc.slots[3];
    return { state: s.state, t: +s.t.toFixed(2), need: +s.need.toFixed(2) };
  });
  ok(br.state === "search" && br.t > 0 && br.t < br.need, "关窗：当前格进度保留", br);
  await c.wait(400);
  await c.ev(() => (__lt.log.length = 0, __game.run.containers.open(__lt.cache)));
  await c.wait(500);
  const rs = await c.ev(() => ({ first: __lt.log.find((e) => e.t === "searchStart"), shownKept: __lt.cache.slots.slice(0, 3).filter((s) => s.state === "shown" || s.state === "taken").length }));
  ok(rs.first && rs.first.i === 3 && rs.first.resume && rs.shownKept === 3, "再打开：已揭示的仍可见，从断点继续", rs);
  // 受击收起
  const hit = await c.ev(() => {
    const r = __game.run, E = __game.ctx.enemies, p = __game.player.pos;
    const e = E.spawnPack(1, !1, p.clone().add(new __game.THREE.Vector3(2, 0, 0)), { types: ["wolf"] })[0];
    __game.ctx.world.dealDamage(e.entity, __game.player.entity, { base: 5, scale: {}, pos: p, dir: new __game.THREE.Vector3(-1, 0, 0) });
    const out = { open: !!r.containers.openC, reason: (__lt.log.find((q) => q.t === "close") || {}).reason, interrupt: __lt.log.some((q) => q.t === "interrupt") };
    __lt.calm();
    return out;
  });
  await c.wait(150);
  await shot("hit_interrupt");
  ok(!hit.open && hit.reason === "hit" && hit.interrupt, "受击：搜取中断、窗口收起", hit);
  // 走动收起
  await c.ev(() => __game.run.containers.open(__lt.cache));
  await c.wait(400);
  const mv = await c.ev(() => {
    const p = __game.player.pos;
    __game.player.spawn(p.x + 1, p.z);
    return null;
  });
  await c.wait(150);
  const mv2 = await c.ev(() => ({ open: !!__game.run.containers.openC, reason: [...__lt.log].reverse().find((q) => q.t === "close").reason }));
  ok(!mv2.open && mv2.reason === "move", "走动：窗口收起", mv2);
  // Esc 收起且不打开暂停菜单
  await c.ev(() => {
    const cc = __lt.cache;
    __game.player.spawn(cc.pos.x + 1.3, cc.pos.z + 0.5);
  });
  await c.wait(300);
  await c.ev(() => __game.run.containers.open(__lt.cache));
  await c.wait(200);
  await page.keyboard.press("Escape");
  await c.wait(200);
  const esc = await c.ev(() => ({ open: !!__game.run.containers.openC, paused: document.body.classList.contains("mk-paused") || !!(__game.flow.scenes.run.pause && __game.flow.scenes.run.pause.open) }));
  ok(!esc.open && !esc.paused, "Esc 收起窗口（不弹暂停菜单）", esc);

  // ---------------- 6. 储物袋满：物品留在容器 ----------------
  const full = await c.ev(async () => {
    const r = __game.run, cc = __lt.cache;
    while (cc.slots.some((s) => s.state !== "shown" && s.state !== "taken")) for (const s of cc.slots) if (s.state !== "taken") (s.state = "shown"), (s.t = s.need = 0.1);
    const junk = [];
    while (r.bag.free > 0) {
      const j = __lt.mk("rust_sword");
      if (!r.bag.add(j)) break;
      junk.push(j);
    }
    r.containers.open(cc);
    const left = cc.slots.filter((s) => s.state === "shown").length;
    const n = r.containers.takeAll(cc);
    const out = { left, took: n, still: cc.slots.filter((s) => s.state === "shown").length, open: !!r.containers.openC, marked: r.marks.includes(cc.mark), bagFree: r.bag.free };
    await new Promise((res) => setTimeout(res, 120));
    out.msg = (document.querySelector(".mk-loot .nm") || {}).textContent;
    for (const j of junk) r.bag.remove(j.uid);
    r.containers.close("esc");
    return out;
  });
  ok(full.still > 0 && full.marked && /放不下/.test(full.msg || ""), "储物袋满：取不下的留在容器里并提示", full);
  await c.wait(1600);
  const keep = await c.ev(() => ({ inList: __game.run.containers.list.includes(__lt.cache), empty: __lt.cache.emptyAt != null }));
  ok(keep.inList && !keep.empty, "没取空（储物袋满）的尸体继续保留", keep);

  // ---------------- 7. 宝箱 ----------------
  await c.ev(() => {
    const r = __game.run, hp = __game.player.pos;
    const m = r.marks.filter((q) => q.kind === "chest" && !q.altar).sort((a, b) => (b.tier === "glow") - (a.tier === "glow") || a.pos.distanceTo(hp) - b.pos.distanceTo(hp))[0];
    __lt.chest = m;
    __game.player.spawn(m.pos.x + 1.3, m.pos.z + 0.8);
    __lt.calm();
    r.senseOverride = 45;
    r.bag.clear(); // 前面几节塞满过储物袋：清空，保证宝箱能取空
    __lt.log.length = 0;
  });
  await c.wait(700);
  await page.keyboard.press("f");
  await c.wait(150);
  const ch = await c.ev(() => {
    const r = __game.run, m = __lt.chest, cc = m.container;
    return { opened: !!cc, open: r.containers.openC === cc, slots: cc ? cc.slots.length : 0, mark: r.marks.includes(m), verb: m.verb, dropped: r.pickups.list.filter((p) => Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < 3).length, tier: m.tier };
  });
  ok(ch.opened && ch.open && ch.slots > 0 && ch.mark && ch.verb === "搜" && ch.dropped === 0, "宝箱：开箱 = 打开格子窗，东西不再抛到地上", ch);
  await c.wait(700);
  await shot("chest_window");
  await page.waitForFunction(() => __lt.chest.container.slots.every((s) => s.state !== "hidden" && s.state !== "search"), null, { timeout: 15000 });
  await c.wait(400);
  await shot("chest_revealed");
  await page.keyboard.press("f");
  await c.wait(300);
  const ch2 = await c.ev(() => ({ empty: __lt.chest.container.emptyAt != null, mark: __game.run.marks.includes(__lt.chest), opened: !!__game.ctx.gatherUI && __game.ctx.gatherUI.fx.opened.length }));
  ok(ch2.empty && !ch2.mark && ch2.opened > 0, "宝箱取空：标记移除，箱子保持已开启", ch2);

  // ---------------- 8. 宝箱取空后不消失（保持已开启） ----------------
  await c.wait(1500);
  const chk = await c.ev(() => ({ inList: __game.run.containers.list.includes(__lt.chest.container), ghost: __game.ctx.gatherUI.fx.opened.some((b) => b.parent) }));
  ok(chk.inList && chk.ghost, "宝箱取空后保持已开启（不化墨）", chk);

  // ---------------- 8b. 亭中供案 ----------------
  const al = await c.ev(() => {
    const r = __game.run, m = r.marks.find((q) => q.altar);
    if (!m) return { none: !0 };
    __lt.altar = m;
    r.senseOverride = 0;
    __game.player.spawn(m.pos.x + 1.6, m.pos.z + 1.2);
    __lt.calm();
    return { label: m.label, verb: m.verb, model: !!(m.fxObject && m.fxObject.parent), altars: r.marks.filter((q) => q.altar).length, points: (r.map.points.pavilions || []).length };
  });
  ok(!al.none && al.label === "亭中供案" && al.verb === "搜" && al.model, "亭中供案：亭心供案模型 + 交互标记", al);
  ok(!al.none && al.points >= 2 && al.points <= 4 && al.altars === al.points, "供案数 = 关卡本局启用的亭子（2–4 个）", al);
  if (!al.none) {
    await c.wait(900);
    await shot("altar");
    const pr = await c.ev(() => { const gp = document.querySelector(".mk-gp"); return { on: gp.classList.contains("on"), verb: gp.querySelector(".verb").textContent, nm: gp.querySelector(".nm").textContent }; });
    ok(pr.on && pr.verb === "搜" && pr.nm === "亭中供案", "供案 F 提示：搜 · 亭中供案", pr);
    await page.keyboard.press("f");
    await c.wait(1300);
    await shot("altar_window");
    const aw = await c.ev(() => {
      const r = __game.run, m = __lt.altar, cc = m.container;
      return { source: cc && cc.source, opened: !!cc, altar: cc && cc.altar, open: r.containers.openC === cc, slots: cc ? cc.slots.length : 0, title: (document.querySelector(".mk-loot .hd .t") || {}).textContent, modelKept: m.fxObject.visible };
    });
    ok(aw.source === "pavilion", "供案用 pavilion 掉落表", aw.source);
    ok(aw.opened && aw.altar && aw.open && aw.slots > 0 && /亭中供案/.test(aw.title || "") && aw.modelKept, "供案：F 打开墨封宣纸格，供案本身留在亭中", aw);
    await c.ev(() => __game.run.containers.close("esc"));
  }

  // ---------------- 9. 读取接口 ----------------
  const st = await c.ev(() => {
    const C = __game.run.containers;
    return { all: C.all().map((q) => ({ kind: q.kind, searched: q.searched, empty: q.empty, total: q.total })), near: !!C.near(__game.player.pos, 50) };
  });
  ok(Array.isArray(st.all) && st.near, "读取接口 all() / status() / near()", st.all.slice(0, 4));

  // ---------------- 10. 序章：锈剑在容器里，搜出来才算拾得并佩上 ----------------
  let errs = await c.ev(() => window.__errors || []);
  const base = new URL(page.url()).origin;
  await page.goto(`${base}/?scene=run&region=tutorial&slot=5`, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.run.pro && __game.run.pro.started, null, { timeout: 90000 });
  await c.wait(800);
  const pro = await c.ev(async () => {
    const r = __game.run, C = r.containers;
    const sw = C.list.find((q) => q.slots.some((s) => s.inst.id === "rust_sword"));
    const before = { equip: !!(r.profile.equip.sword), ground: r.pickups.list.some((p) => p.inst.id === "rust_sword") };
    if (sw) {
      __game.player.spawn(sw.pos.x + 1, sw.pos.z);
      C.open(sw);
      await new Promise((res) => setTimeout(res, 900));
      C.takeAll(sw);
      await new Promise((res) => setTimeout(res, 400));
    }
    const step = r.pro.steps.find((q) => q.id === "sword");
    return { container: !!sw, label: sw && sw.label, before, equip: r.profile.equip.sword && r.profile.equip.sword.id, stepDone: !!(step && step.done) || r.pro.f.pickup.has("rust_sword") };
  });
  ok(pro.container && !pro.before.ground && pro.equip === "rust_sword" && pro.stepDone, "序章：锈剑放在容器里（不在地上），搜出取走 → 佩上、步骤完成", pro);
  errs = [...errs, ...(await c.ev(() => window.__errors || []))];
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
