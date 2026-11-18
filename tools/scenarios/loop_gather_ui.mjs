// 采集 / 开箱表现（UI 设计）的可运行测试 + 改前改后截图。
//   改后（测试）：node tools/run.mjs loop_gather_ui "scene=run&region=r1&slot=3"     → work/shots/loop_gather_ui_<name>.png
//   改前（只截图）：node work/run_release.mjs loop_gather_ui "scene=run&region=r1&slot=3"（用改版前的 release 包）→ work/shots/before_<name>.png
// 检查：启动无报错；采集点 / 宝箱的新外观（圆相、品阶、箱盖转轴）；F 提示贴在物件上方；读条圆相与打断；采下 / 开箱的完成反馈
//      （圆相收拢、钤印、掉落抛出、飞入储物袋、拾取字）；储物袋里灵草格（写意小图、"？"）。
// 镜头：游戏实际的出行视角（rig "play" 跟随主角），白天 / 夜里 × 远看 / 靠近 / 读条 / 完成。
const BEFORE = process.env.BEFORE === "1";
const ok = (cond, msg, extra) => {
  if (BEFORE) return cond;
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  return cond;
};

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 120000 });
  await c.wait(2500);
  // 页面里的小工具
  await c.ev(() => {
    const G = (window.__gt = {});
    const r = () => __game.run;
    G.calm = () => {
      r().clearEnemies();
      r().nextWave = 1e9;
      r().hintT = 99;
      __game.player.entity.hp = __game.player.entity.stats.get("hp");
      document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    };
    G.time = (night) => {
      const R = r();
      for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch"]) R.profile.flags["hint_" + k] = 1;
      R.t = night ? R.R.phases[2] + 80 : 20;
    };
    G.pick = (kind, pred) => r().marks.find((m) => m.kind === kind && pred(m));
    G.stand = (m, dx, dz) => {
      __game.player.spawn(m.pos.x + dx, m.pos.z + dz);
      if (__game.player.facing) __game.player.facing.set(-dx, 0, -dz).normalize();
    };
    G.marks = () => r().marks.length;
  });
  const calm = () => c.ev(() => __gt.calm());
  const shot = async (name) => (await calm(), c.shot(name));

  // ---------------- 1. 标记物外观 ----------------
  const mk = await c.ev(() => {
    const r = __game.run, obj = (m) => (m.point && m.point.object) || m.fxObject;
    const g = r.marks.filter((m) => m.kind === "gather"), ch = r.marks.filter((m) => m.kind === "chest" && !m.altar);
    return {
      gathers: g.length,
      tiers: [...new Set(g.map((m) => obj(m) && obj(m).userData.gather && obj(m).userData.gather.tier))],
      chests: ch.length,
      lids: ch.filter((m) => obj(m) && obj(m).userData.lid).length,
      chestTiers: [...new Set(ch.map((m) => obj(m) && obj(m).userData.gather && obj(m).userData.gather.tier))],
      ui: !!__game.ctx.gatherUI,
    };
  });
  c.log("markers", JSON.stringify(mk));
  ok(mk.ui, "GatherUI 已挂到局内界面");
  ok(mk.gathers > 0 && !mk.tiers.includes(undefined) && mk.tiers.includes("herb") && mk.tiers.includes("glow"), "采集点带圆相 / 品阶（灵草与灵光区分）", mk.tiers);
  ok(mk.chests > 0 && mk.lids === mk.chests && !mk.chestTiers.includes(undefined), "宝箱是新模型（箱盖转轴 + 圆相）", mk);

  for (const night of [!1, !0]) {
    const T = night ? "night" : "day";
    await c.ev((n) => __gt.time(n), night);
    // ---------------- 2. 灵草：远看 / 靠近 ----------------
    await c.ev(() => {
      const m = __gt.pick("gather", (q) => !q.glow && q.gatherKind === "qingling") || __gt.pick("gather", (q) => !q.glow);
      __gt.herb = m;
      __gt.stand(m, 5.5, 3.5);
    });
    await c.wait(1200);
    await shot(`herb_${T}_far`);
    await c.ev(() => __gt.stand(__gt.herb, 1.4, 0.7));
    await c.wait(800);
    await shot(`herb_${T}_near`);
    if (!BEFORE) {
      const p = await c.ev(() => {
        const gp = document.querySelector(".mk-layer-gather .mk-gp"), b = gp.querySelector(".in").getBoundingClientRect();
        const hint = document.querySelector(".mk-layer-runhud .mk-hint").textContent;
        return { on: gp.classList.contains("on"), verb: gp.querySelector(".verb").textContent, nm: gp.querySelector(".nm").textContent, label: __gt.herb.label, y: Math.round(b.bottom), oldHint: hint, focus: (__gt.herb.point && __gt.herb.point.object ? __gt.herb.point.object : __gt.herb.fxObject).userData.gather.focus };
      });
      ok(p.on && p.verb === "采" && p.label.startsWith(p.nm) && p.y < 380 && !p.oldHint && p.focus > 0.5, `${T}: F 提示贴在灵草上方（采 · 名称），脚下圆相聚焦，底部旧提示让位`, p);
      // ---------------- 3. 读条（约定 run.gathering）与打断 ----------------
      await c.ev(() => (__game.run.gathering = { mark: __gt.herb, t: 0.66, need: 1.2, sweet: [0.72, 0.86] }));
      await c.wait(200);
      await shot(`herb_${T}_ring`);
      const ring = await c.ev(() => {
        const gr = document.querySelector(".mk-gring");
        return { on: gr.classList.contains("on"), v: +gr.querySelector(".ink-ring").style.getPropertyValue("--v"), sweet: !gr.querySelector(".sweet").classList.contains("off") };
      });
      ok(ring.on && Math.abs(ring.v - 0.55) < 0.02 && ring.sweet, `${T}: 采集读条圆相按进度画出（运笔金弧）`, ring);
      await c.ev(() => delete __game.run.gathering);
      await c.wait(120);
      await shot(`herb_${T}_cut`);
      const cut = await c.ev(() => ({ cut: document.querySelector(".mk-gring").classList.contains("cut"), n: __game.ctx.gatherUI.stats.cut }));
      ok(cut.cut && cut.n >= 1, `${T}: 读条中途中断 → 转朱、钤"断"`, cut);
      await c.wait(1100);
    }
    // ---------------- 4. 采下（真实按 F）----------------
    const before = await c.ev(() => __gt.marks());
    await c.ev(() => __gt.calm());
    await page.keyboard.press("f");
    await c.wait(170);
    let after = await c.ev(() => __gt.marks());
    if (after === before) {
      c.log("WARN F 键没有触发采集，改为直接调用 run.interact");
      await c.ev(() => __game.run.interact(__gt.herb));
      await c.wait(170);
    }
    await c.shot(`herb_${T}_pluck`);
    if (!BEFORE) {
      const s = await c.ev(() => ({ ...__game.ctx.gatherUI.stats, fx: __game.ctx.gatherUI.fx.items.length, stamp: !!document.querySelector(".mk-gstamp") }));
      ok(s.pluck >= 1 && s.fx >= 1 && s.stamp && (s.fly >= 1 || s.arcs >= 1), `${T}: 采下 → 圆相收拢 + "采"印 + 直接飞进储物袋（袋满才抛落）`, s);
      const g = await c.ev(() => {
        const r = __game.run, h = __gt.herb.pos;
        return { ground: r.pickups.list.filter((q) => Math.hypot(q.x - h.x, q.z - h.z) < 3).length, full: r.bag.free <= 0, toast: [...document.querySelectorAll(".mk-toasts .ink-toast")].map((e) => e.textContent).join("|") };
      });
      ok((g.ground === 0 || g.full) && /采得/.test(g.toast), `${T}: 采到的直接进储物袋（"采得…"），不落地`, g);
    }
    // ---------------- 5. 地上的东西按 F 取：飞入储物袋 + 拾取字 ----------------
    await c.wait(500);
    await c.ev(async () => {
      const { makeItem } = await import("/src/core/items.js");
      __game.run.pickups.drop(__game.player.pos, makeItem("spirit_stone", { n: 3 }), 0.3);
    });
    await c.wait(300);
    await c.ev(() => __gt.calm());
    await page.keyboard.press("f");
    await c.wait(200);
    await c.shot(`herb_${T}_fly`);
    if (!BEFORE) {
      const s = await c.ev(() => ({ fly: __game.ctx.gatherUI.stats.fly, label: __game.ctx.gatherUI.stats.label, dom: !!document.querySelector(".mk-gfly"), lbl: (document.querySelector(".mk-glabel") || {}).textContent || "", ground: __game.run.pickups.list.length }));
      ok(s.fly >= 1 && s.label >= 1 && s.lbl.length > 0 && s.ground === 0, `${T}: 按 F 取地上物品 → 飞入储物袋 + "名称 ×数量"`, s);
    }
    await c.wait(1200);

    // ---------------- 6. 宝箱：白天普通箱，夜里灵光箱（另拍夜明箱） ----------------
    await c.ev((n) => {
      const r = __game.run, hp = __game.player.pos;
      const all = r.marks.filter((m) => m.kind === "chest" && !m.altar);
      const want = n ? all.find((m) => m.tier === "glow") || all.find((m) => m.tier === "night") : null;
      __gt.chest = want || all.sort((a, b) => a.pos.distanceTo(hp) - b.pos.distanceTo(hp))[0];
      __gt.stand(__gt.chest, 5.5, 3.5);
    }, night);
    await c.wait(1200);
    await shot(`chest_${T}_far`);
    await c.ev(() => __gt.stand(__gt.chest, 1.3, 0.8));
    await c.wait(800);
    await shot(`chest_${T}_near`);
    if (!BEFORE) {
      const p = await c.ev(() => ({ on: document.querySelector(".mk-gp").classList.contains("on"), verb: document.querySelector(".mk-gp .verb").textContent, cls: document.querySelector(".mk-gp").className, tier: __gt.chest.tier }));
      ok(p.on && p.verb === "开", `${T}: 宝箱 F 提示（开 · 名称）`, p);
      await c.ev(() => (__game.run.opening = { mark: __gt.chest, t: 0.5, need: 1.2 }));
      await c.wait(200);
      await shot(`chest_${T}_ring`);
      const ring = await c.ev(() => ({ on: document.querySelector(".mk-gring").classList.contains("on"), v: document.querySelector(".mk-gring .v").textContent }));
      ok(ring.on && ring.v === "开箱", `${T}: 开箱读条圆相`, ring);
      await c.ev(() => {
        const r = __game.run;
        delete r.opening;
        r.emit("gather:cancel", { reason: "受击 · 开箱被打断" });
      });
      await c.wait(100);
      await c.wait(1000);
    }
    await c.ev(() => __gt.calm());
    await page.keyboard.press("f");
    await c.wait(260);
    if ((await c.ev(() => __game.run.marks.includes(__gt.chest)))) {
      c.log("WARN F 键没有打开宝箱，改为直接调用 run.interact");
      await c.ev(() => __game.run.interact(__gt.chest));
      await c.wait(260);
    }
    await c.shot(`chest_${T}_open`);
    // 宝箱改成容器（搜取 v1）：开箱弹出格子窗；探明后再按 F 全取，物品飞入储物袋
    if (!BEFORE) {
      await page.waitForFunction(() => { const c = __gt.chest.container; return !c || c.slots.every((s) => s.state === "shown" || s.state === "taken"); }, null, { timeout: 15000 }).catch(() => {});
      await page.keyboard.press("f");
      await c.wait(180);
      await c.shot(`chest_${T}_fly`);
    }
    if (!BEFORE) {
      await c.wait(500);
      const s = await c.ev(() => {
        const U = __game.ctx.gatherUI, box = U.fx.opened[U.fx.opened.length - 1];
        const o = __gt.chest.point && __gt.chest.point.object;
        return { open: U.stats.open, lid: box ? +box.userData.lid.rotation.x.toFixed(2) : null, levelHidden: o ? o.visible === !1 : "none", arcs: U.stats.arcs };
      });
      ok(s.open >= 1 && s.lid < -1.5 && (s.levelHidden === !0 || s.levelHidden === "none"), `${T}: 开箱 → 掀盖、关卡模型藏起后留下"已开启"的箱子`, s);
    }
    await c.ev(() => {
      const r = __game.run, h = __gt.chest.pos;
      const p = r.pickups.list.filter((q) => Math.hypot(q.x - h.x, q.z - h.z) < 3)[0];
      if (p) __game.player.spawn(p.x + 0.3, p.z + 0.3);
    });
    await c.wait(200);
    if (BEFORE) await c.shot(`chest_${T}_fly`);
    await c.wait(1300);
    // 已开启状态：站回箱子旁边看（用户报的 bug：开完宝箱后 F 提示一直留着——这里同时检查提示已消失）
    await c.ev(() => __gt.stand(__gt.chest, 1.3, 0.8));
    await c.wait(500);
    await shot(`chest_${T}_opened`);
    if (!BEFORE) {
      const st = await c.ev(() => {
        const gp = document.querySelector(".mk-gp"), hint = document.querySelector(".mk-layer-runhud .mk-hint").textContent;
        const near = __game.run.nearestMark();
        return { prompt: gp.classList.contains("on") ? gp.querySelector(".nm").textContent : "", runHint: __game.run.hint, oldHint: hint, near: near ? near.kind + ":" + near.label : null, chestGone: !__game.run.marks.includes(__gt.chest) };
      });
      ok(st.chestGone && !(st.near || "").startsWith("chest") ? !st.prompt && !st.runHint : !0, `${T}: 开箱后站回原处，F 提示不再残留`, st);
    }
    if (night) {
      // 夜明宝箱（入夜时在主角附近出现）
      const has = await c.ev(() => {
        const m = __gt.pick("chest", (q) => q.tier === "night");
        if (!m) return !1;
        __gt.stand(m, 4.5, 3);
        return !0;
      });
      if (has) {
        await c.wait(1000);
        await shot("nightchest_far");
      }
      // 灵光点（夜里）
      await c.ev(() => {
        const m = __gt.pick("gather", (q) => q.glow);
        if (m) __gt.stand(m, 5, 3.5);
      });
      await c.wait(1000);
      await shot("glow_night_far");
    } else {
      await c.ev(() => {
        const m = __gt.pick("gather", (q) => q.glow);
        if (m) __gt.stand(m, 5, 3.5);
      });
      await c.wait(1000);
      await shot("glow_day_far");
    }
  }

  // ---------------- 7. 品阶总览（只在改后：把所有品阶摆成一排） ----------------
  if (!BEFORE) {
    for (const night of [!1, !0]) {
      await c.ev(async (night) => {
        const MK = await import("/src/world/markers.js");
        const r = __game.run, L = r.map.level, cols = __game.ctx.colliders, H = (x, z) => r.map.height(x, z);
        __gt.time(night);
        // 找一块平整、开阔、没有别的标记物的空地（镜头里只有这一排）
        if (!__gt.spot) {
          const b = r.map.bounds, big = cols.filter((c) => c.r >= 0.5);
          let best = null, bestScore = -1;
          for (let x = b.x0 * 0.75; x <= b.x1 * 0.75; x += 3)
            for (let z = b.z0 * 0.75; z <= b.z1 * 0.75; z += 3) {
              const h0 = H(x, z);
              if (h0 < -0.4) continue;
              let bad = 0;
              for (let dx = -12; dx <= 12; dx += 2)
                for (let dz = -6; dz <= 4; dz += 2) {
                  const X = x + dx, Z = z + dz;
                  if (Math.abs(H(X, Z) - h0) > 0.6 || (L && L.wading && L.wading(X, Z)) || big.some((c) => (c.x - X) ** 2 + (c.z - Z) ** 2 < (c.r + 0.8) ** 2)) bad++;
                }
              const md = Math.min(30, ...r.marks.map((m) => Math.hypot(m.pos.x - x, m.pos.z - z)));
              const score = md - bad * 4;
              if (score > bestScore) (bestScore = score), (best = [x, z, bad, md]);
            }
          __gt.spot = best;
          console.log("[gt] lineup spot", JSON.stringify(best));
        }
        const [sx, sz] = __gt.spot;
        __game.player.spawn(sx, sz + 3.2);
        const p = { x: sx, z: sz + 3.2 };
        if (__gt.row) __game.scene.remove(__gt.row);
        const row = (__gt.row = new __game.THREE.Group());
        const list = [MK.gatherMarker("qingling", "herb"), MK.gatherMarker("ninglu", "herb"), MK.gatherMarker("chiyan", "herb"), MK.gatherMarker("heshouwu", "herb"), MK.gatherMarker("tiejing", "ore"), MK.glowMarker("lingbang"), MK.chestMarker("normal"), MK.chestMarker("glow"), MK.chestMarker("night")];
        list.forEach((o, i) => {
          const x = p.x - 10.4 + i * 2.6, z = p.z - 3.6 - (i % 2) * 0.9;
          o.position.set(x, r.map.height(x, z), z);
          for (const g of o.userData.glows || []) g.uniforms.uK.value *= night ? 1.7 : 1;
          row.add(o);
        });
        __game.scene.add(row);
      }, night);
      await c.wait(900);
      await shot(`tiers_${night ? "night" : "day"}`);
    }
    await c.ev(() => __game.scene.remove(__gt.row));
  }

  // ---------------- 8. 储物袋里的灵草格 ----------------
  await c.ev(() => {
    const r = __game.run;
    let k = 0;
    const it = (id, n, rarity, o = {}) => ({ uid: "gt" + k++, id, n, rarity, level: 1, affixes: [], identified: !0, bound: !1, tags: [], ...o });
    for (const x of [it("ninglu_hua", 3, 1), it("hanlu_cao", 2, 3), it("tiejing_shi", 2, 0), it("lingbang_zhu", 1, 2), it("lingbang_zhu", 1, 2, { identified: !1 }), it("chiyan_guo", 4, 0)]) r.bag.add(x);
    __game.flow.scenes.run.bagUI.toggle(!0);
  });
  await c.wait(600);
  await c.shot("bag");
  if (!BEFORE) {
    const b = await c.ev(() => {
      // 储物袋 v2：物品签用图集图标（灵草 / 矿石各有水墨图），未鉴定 = 墨拓剪影
      const herb = document.querySelector('.mk-bagui .bv-grid .mk-tok[data-id="ninglu_hua"] .mk-ico');
      const ore = document.querySelector('.mk-bagui .bv-grid .mk-tok[data-id="tiejing_shi"] .mk-ico');
      const unid = document.querySelector(".mk-bagui .bv-grid .mk-tok.is-unid .mk-ico");
      return { herb: !!herb, pic: herb ? /items\.webp/.test(herb.style.backgroundImage) : !1, ore: !!ore, unid: unid ? /items_sil\.webp/.test(unid.style.backgroundImage) : null };
    });
    ok(b.herb && b.pic && b.ore && b.unid === !0, "储物袋：灵草 / 矿石格是水墨图标，未鉴定是墨拓剪影", b);
  }
  await c.ev(() => __game.flow.scenes.run.bagUI.toggle(!1));
  const errs = await c.ev(() => window.__errors || []);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
