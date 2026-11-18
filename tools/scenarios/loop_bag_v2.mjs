// 储物袋 v2（方向四 · 侧挂纸笺）+ 物品图标图集 的可运行测试与截图。
//   node tools/run.mjs loop_bag_v2 "scene=run&region=r1&slot=4"
// 检查：图集加载、每件物品都有图标（无单字）；未鉴定 = 墨拓剪影；品级色取 RARITY；格子数 = 物品数；占格条；选中对比；装备换下；
//      拖拽整理；入锦囊；右键丢弃；袋满 + 脚下"放不下（需 N 格）"；敌近朱印；世界不暂停；页面无报错。
// 截图：normal / select_compare / full / enemy / icons_overview
const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
  await page.mouse.move(300, 560);
  await c.wait(1200);
  await c.ev(async () => {
    const G = (window.__bt = {});
    const r = __game.run;
    G.items = await import("/src/core/items.js");
    G.loot = await import("/src/game/loot.js");
    for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch", "lingzhi"]) r.profile.flags["hint_" + k] = 1;
    G.calm = () => {
      r.clearEnemies();
      r.nextWave = 1e9;
      r.hintT = 99;
      const h = __game.player.entity;
      h.hp = h.stats.get("hp");
      document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    };
    G.calm();
    const mk = (id, o = {}) => G.items.makeItem(id, o);
    r.bag.capacity = 24;
    r.bag.clear();
    const gear = (id, q, lv, o = {}) => G.loot.makeGear(id, q, lv, { identified: !0, ...o });
    const list = [
      mk("zhuxin", { rarity: 3 }), gear("sword_qingfeng", 2, 3), gear("robe_lingsi", 1, 2), gear("jade_shuiling", 2, 2, { identified: !1 }),
      mk("spirit_stone", { n: 22 }), mk("qingling_cao", { n: 8 }), mk("ninglu_hua", { n: 5 }), mk("chiyan_guo", { n: 3, rarity: 1 }), mk("hanlu_cao", { n: 4 }),
      mk("tiejing_shi", { n: 3 }), mk("wolf_fang", { n: 6 }), mk("wolf_core", { n: 2, rarity: 1 }), mk("ling_yu", { n: 4, rarity: 1 }), mk("seed_qingling", { n: 2 }),
      mk("huichun_dan", { n: 3 }), mk("bat_wing", { n: 2 }), mk("fu_fire", { n: 2 }),
    ];
    for (const it of list) r.bag.add(it);
    G.sword = list[1];
    r.pouch.capacity = 2;
    r.pouch.clear();
    r.pouch.add(mk("lingbang_zhu", { rarity: 2 }));
    r.keyItems.length = 0;
    r.keyItems.push(mk("bilin_core", { rarity: 3 }), mk("danfang_zhuji", { rarity: 2 }));
    const P = r.profile;
    P.equip.sword = gear("rust_sword", 0, 1);
    P.equip.robe = gear("robe_bu", 0, 2);
    P.equip.jade = gear("jade_qing", 1, 2);
    r.applyEquip();
    r.emit("bag");
  });

  // ---------------- 1. 打开：正常态 ----------------
  await page.keyboard.press("Tab");
  await c.wait(500);
  const n1 = await c.ev(() => {
    const toks = [...document.querySelectorAll(".mk-bagui .bv-grid .mk-tok")];
    const ico = toks.map((t) => t.querySelector(".mk-ico"));
    const unid = document.querySelector(`.mk-bagui .bv-grid .mk-tok.is-unid .mk-ico`);
    return {
      open: !document.querySelector(".mk-layer-bag").classList.contains("hidden"),
      toks: toks.length, items: __game.run.bag.items.length,
      allIcons: ico.every((i) => i && /items(_sil)?\.webp/.test(i.style.backgroundImage)),
      noGlyph: toks.every((t) => !t.querySelector("b")),
      unidSil: !!unid && /items_sil\.webp/.test(unid.style.backgroundImage),
      ringQ3: getComputedStyle(document.querySelector(".mk-bagui .bv-grid .mk-tok.q3 > .ring")).backgroundColor,
      worn: [...document.querySelectorAll(".mk-bagui .grp .hd")].some((h) => /随身/.test(h.textContent)),
      pouch: !!document.querySelector(".mk-bagui .bv-safe .pouch .mk-tok"), amulet: document.querySelectorAll(".mk-bagui .bv-safe .amulet .mk-tok").length,
      notes: [...document.querySelectorAll(".mk-bagui .mk-q")].length,
      paused: __game.flow.paused,
    };
  });
  ok(n1.open && n1.toks === n1.items && n1.toks > 10, "Tab：纸笺打开，每件物品一个物品签", n1);
  ok(n1.allIcons && n1.noGlyph, "物品签全是图集图标，没有单字", n1);
  ok(n1.unidSil, "未鉴定物品 = 墨拓剪影", n1);
  ok(n1.ringQ3 === "rgb(201, 160, 64)", "仙品圆相 = RARITY 仙品色 #c9a040", n1.ringQ3);
  ok(n1.worn && n1.pouch && n1.amulet === 2 && n1.notes >= 3, "随身 / 贴身锦囊 / 护身格 / ？注释都在", n1);
  const t0 = await c.ev(() => __game.run.t);
  await c.wait(400);
  ok(await c.ev((t) => !__game.flow.paused && __game.run.t > t, t0), "开袋时世界不暂停");
  const vis = await c.ev(() => {
    const s = document.querySelector(".mk-bagui .bv-strip").getBoundingClientRect();
    return { left: Math.round(s.left), right: Math.round(s.right), w: innerWidth };
  });
  ok(vis.left > vis.w * 0.6, "纸笺只占画面右侧，主角（画面中央）不被遮挡", vis);
  await c.shot("normal");

  // ---------------- 2. 选中对比 ----------------
  await c.ev(() => document.querySelector(`.mk-bagui .bv-grid .mk-tok[data-uid="${__bt.sword.uid}"]`).click());
  await c.wait(300);
  const cmp = await c.ev(() => {
    const t = document.querySelector(".mk-bagui .bv-tip");
    const r = t && t.getBoundingClientRect();
    return { tip: !!t, name: t && t.querySelector(".nm").textContent, rows: t ? t.querySelectorAll(".bv-cmp tr").length : 0, up: t ? t.querySelectorAll(".bv-cmp .up").length : 0, vs: t && (t.querySelector(".bv-cmp th:nth-child(3)") || {}).textContent, bottom: r && Math.round(r.bottom), h: innerHeight, btns: t ? [...t.querySelectorAll(".ink-btn")].map((b) => b.textContent.trim()) : [] };
  });
  ok(cmp.tip && /青锋剑/.test(cmp.name) && cmp.rows >= 2 && cmp.up >= 1 && /锈剑/.test(cmp.vs), "选中青锋剑：浮签与身上锈剑对比（▲）", cmp);
  ok(cmp.bottom < cmp.h * 0.48, "浮签在主角头顶上方，不压主角", cmp);
  await c.shot("select_compare");
  await c.ev(() => document.querySelector('.mk-bagui .bv-tip [data-id="equip"]').click());
  await c.wait(300);
  const eq = await c.ev(() => ({ sword: __game.run.profile.equip.sword && __game.run.profile.equip.sword.id, rustInBag: __game.run.bag.items.some((i) => i.id === "rust_sword") }));
  ok(eq.sword === "sword_qingfeng" && eq.rustInBag, "装备：青锋剑上身，锈剑回袋", eq);

  // ---------------- 3. 拖拽整理 ----------------
  const dragRes = await (async () => {
    const pos = await c.ev(() => {
      const L = __game.run.bag.items, a = L.find((i) => i.id === "wolf_fang"), b = L.find((i) => i.id === "spirit_stone");
      const ra = document.querySelector(`.mk-bagui .bv-grid .mk-tok[data-uid="${a.uid}"]`).getBoundingClientRect(), rb = document.querySelector(`.mk-bagui .bv-grid .mk-tok[data-uid="${b.uid}"]`).getBoundingClientRect();
      return { a: [ra.x + ra.width / 2, ra.y + ra.height / 2], b: [rb.x + rb.width / 2, rb.y + rb.height / 2], before: L.indexOf(a) > L.indexOf(b) };
    });
    await page.mouse.move(...pos.a);
    await page.mouse.down();
    await page.mouse.move(pos.a[0] + 10, pos.a[1] + 6, { steps: 3 });
    await page.mouse.move(...pos.b, { steps: 6 });
    await page.mouse.up();
    await c.wait(200);
    return c.ev((was) => {
      const L = __game.run.bag.items;
      return { was, now: L.findIndex((i) => i.id === "wolf_fang") < L.findIndex((i) => i.id === "spirit_stone") };
    }, pos.before);
  })();
  ok(dragRes.was && dragRes.now, "拖拽：狼妖牙拖到灵石前面，顺序跟着变", dragRes);

  // ---------------- 4. 入锦囊（1 秒）----------------
  await c.ev(() => {
    const it = __game.run.bag.items.find((i) => i.id === "ling_yu");
    document.querySelector(`.mk-bagui .bv-grid .mk-tok[data-uid="${it.uid}"]`).click();
  });
  await c.wait(200);
  await c.ev(() => document.querySelector('.mk-bagui .bv-tip [data-id="topouch"]').click());
  await c.wait(1400);
  ok(await c.ev(() => __game.run.pouch.items.some((i) => i.id === "ling_yu") && !__game.run.bag.items.some((i) => i.id === "ling_yu")), "入锦囊：1 秒后灵玉进贴身锦囊");

  // ---------------- 5. 右键丢弃 ----------------
  const dr = await c.ev(async () => {
    const it = __game.run.bag.items.find((i) => i.id === "tiejing_shi");
    const el = document.querySelector(`.mk-bagui .bv-grid .mk-tok[data-uid="${it.uid}"]`);
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: !0, cancelable: !0 }));
    await new Promise((r) => setTimeout(r, 200));
    return { gone: !__game.run.bag.items.includes(it), ground: __game.run.pickups.list.some((p) => p.inst === it) };
  });
  ok(dr.gone && dr.ground, "右键丢弃：落在脚下", dr);

  // ---------------- 6. 袋满 + 脚下放不下 ----------------
  await c.ev(() => {
    const r = __game.run, mk = __bt.items.makeItem;
    for (let k = 0; k < 40 && r.bag.free > 0; k++) r.bag.add(mk("spirit_orb_shard", { rarity: k % 3 })) || r.bag.add(mk("wolf_fang", { rarity: (k % 3) + 1 }));
    r.pickups.list.filter((p) => p.inst.id === "tiejing_shi").forEach((p) => r.pickups.remove(p));
    const p = r.pickups.drop(__game.player.pos, mk("wolfking_core", { rarity: 2 }), 0.6);
    p.age = -99;
    r.emit("bag");
  });
  await c.wait(900);
  const fl = await c.ev(() => ({ free: __game.run.bag.free, seal: /满载/.test(document.querySelector(".mk-bagui .bv-hd").textContent), txt: (document.querySelector(".mk-bagui .bv-ground .txt") || {}).textContent || "", nofit: !!document.querySelector(".mk-bagui .bv-ground .mk-tok.is-nofit"), banner: [...document.querySelectorAll(".mk-toasts .ink-toast")].map((e) => e.textContent) }));
  ok(fl.free <= 0 && fl.seal && /放不下/.test(fl.txt) && /需 \d 格/.test(fl.txt) && fl.nofit, "袋满：满载印 + 脚下\"放不下（需 N 格）\"", fl);
  ok(!/可弃|腾格/.test(await c.ev(() => document.querySelector(".mk-bagui").textContent)), "纯手动取舍：没有\"可弃\"建议、没有一键腾格");
  await c.ev(() => document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove()));
  await c.shot("full");

  // ---------------- 7. 敌近 ----------------
  await c.ev(() => {
    const p = __game.player.pos, E = __game.ctx.enemies, T = __game.THREE, r = __game.run;
    let e = null;
    for (const [dx, dz] of [[-9, 5], [-7, -6], [8, 6], [6, -8], [-5, 3], [4, 4]]) {
      e = (E.spawnPack(1, !1, new T.Vector3(p.x + dx, r.map.height(p.x + dx, p.z + dz), p.z + dz), { types: ["wolf"] }) || [])[0];
      if (e) break;
    }
    e.setAggro("wave");
    __bt.wolf = e;
  });
  await c.wait(700);
  const wn = await c.ev(() => {
    const w = document.querySelector(".mk-bagui .bv-warn");
    return { on: w && w.classList.contains("on"), txt: w && w.textContent };
  });
  ok(wn.on && /丈/.test(wn.txt), "敌近：纸笺左沿朱印\"妖\" + 方位距离", wn);
  await c.ev(() => document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove()));
  await c.shot("enemy");
  await c.ev(() => __bt.calm());

  // ---------------- 8. 合上 ----------------
  await page.keyboard.press("Tab");
  await c.wait(300);
  ok(await c.ev(() => document.querySelector(".mk-layer-bag").classList.contains("hidden") && !document.body.classList.contains("mk-bag-open")), "Tab 合上");

  // ---------------- 9. 图标总览（全物品：彩图 + 墨拓剪影）----------------
  const ov = await c.ev(async () => {
    const I = await import("/src/ui/icons.js"), { ITEMS, RARITY } = __bt.items;
    const box = document.createElement("div");
    box.id = "icon-ov";
    box.style.cssText = "position:fixed;inset:0;z-index:200;background:#ece6d6;padding:8px 10px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px 2px;overflow:hidden;font:10px var(--f-ui)";
    let fb = 0;
    const ids = Object.keys(ITEMS);
    ids.forEach((id, k) => {
      const d = ITEMS[id], w = document.createElement("div");
      w.style.cssText = "display:flex;flex-direction:column;align-items:center;width:" + (d.size === 2 ? 128 : 80) + "px";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:2px";
      const inst = { uid: "ov" + k, id, n: 1, rarity: k % 5, identified: !0, affixes: [] };
      row.appendChild(I.itemTag(inst, { size: 44, box: d.size === 2 ? "2x1" : "1x1", gap: 2 }));
      row.appendChild(I.itemTag({ ...inst, identified: !1, rarity: 0 }, { size: 30, box: "1x1" }));
      w.appendChild(row);
      const cap = document.createElement("span");
      cap.textContent = d.name.slice(0, 6);
      cap.style.cssText = "color:#555;white-space:nowrap";
      w.appendChild(cap);
      box.appendChild(w);
      if (I.iconFor(id).fallback) fb++;
    });
    document.body.appendChild(box);
    await new Promise((r) => setTimeout(r, 600));
    return { n: ids.length, fallback: fb, unknown: I.iconFor("__no_such_item").key };
  });
  ok(ov.n > 60 && ov.fallback === 0, "图集覆盖全部已注册物品", ov);
  ok(ov.unknown === "_generic", "未知物品按兜底图标，不报错", ov);
  await c.shot("icons_overview");
  await c.ev(() => document.getElementById("icon-ov").remove());
  const errs = await c.ev(() => window.__errors || []);
  ok(!errs.length, "no page errors", errs.slice(0, 5));
}
