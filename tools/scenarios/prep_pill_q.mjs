// 出行准备 · 丹药按品级带（2026-11-17 玩法系统）：node tools/run.mjs prep_pill_q "scene=cave&slot=3"
// 覆盖：同一种丹药有几个品级就出几格（data-q、品级名、RARITY 圆相类）；默认先带低品；"每种 N 枚"按种类（各品级合计）算；
//      出发前服用的丹药同样分品级、合计 1 枚；启程后 run.carried 的品级与所选一致；局内先吃低品（撤离后仓库里留下的是好的）。
// 截图：work/shots/prep_pill_q_after.png、prep_pill_q_after_pack.png（改前对照 work/shots/prep_pillq_before*.png）
const ok = (cond, msg, extra) => {
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
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
  await waitFor(() => window.__game && __game.flow && __game.flow.name === "cave", null, 60000);
  await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const P = __game.flow.newGame(3) || __game.profile;
    P.flags.tutorialDone = !0;
    P.stats.runs = 8;
    P.realm = { stage: 1, layer: 3 };
    P.unlocks.pillSlots = 2;
    P.pack = null; // 从未保存才默认；{} 的保留另由 gongfa_hint 覆盖。
    for (const [id, n, rarity] of [["huichun_dan", 2, 0], ["huichun_dan", 1, 1], ["huichun_dan", 2, 2], ["huiqi_dan", 3, 0], ["dundi_fu", 3, 0], ["fu_metal", 2, 0], ["humai_dan", 1, 0], ["humai_dan", 1, 2], ["ningshen_dan", 1, 1]]) P.storage.add(makeItem(id, { n, rarity }));
    __game.flow.go("prep");
  });
  ok(await waitFor(() => document.querySelector('.mk-prep [data-item="huichun_dan"]'), null, 10000), "prep opened");
  await c.wait(500);
  const cells = () => c.ev(() => {
    const S = __game.flow.scenes.prep, out = [];
    S.packSub = "all"; S.pages.pack = 0; S.setTab("pack"); S.render();
    for (let page = 0; page < 30; page++) {
      for (const w of S.root.querySelectorAll(".pack [data-item][data-q]")) {
        const slot = w.querySelector(".ink-slot");
        out.push({ id:w.dataset.item,q:+w.dataset.q,cap:slot.querySelector(".cap")?.textContent || "",cls:[...slot.classList].find(x=>/^q-/.test(x)) });
      }
      const next=S.root.querySelector('[data-id="pack-next"]');
      if(next.disabled||next.classList.contains("is-disabled")) break;
      next.click();
    }
    return out;
  });
  const st = () => c.ev(() => { const S = __game.flow.scenes ? __game.flow.scenes.prep : null; const s = (S && S.state) || (__game.flow.cur && __game.flow.cur.state); return s ? { take: s.take, q: s.q } : null; });
  const C0 = await cells();
  const hc = C0.filter((x) => x.id === "huichun_dan");
  const RN = await c.ev(async () => (await import("/src/core/items.js")).RARITY.map((r) => r.name[0]));
  ok(hc.length === 3 && hc.map((x) => x.q).join() === "0,1,2", "回春丹三个品级 → 三格（低品在前）", hc);
  ok(hc.every((x) => x.cap.includes(RN[x.q] + " ")) && hc.map((x) => x.cls).join() === "q-fan,q-ling,q-bao", "每格写品级名、圆相按 RARITY 着色", hc.map((x) => x.cap + "/" + x.cls));
  const hq = C0.filter((x) => x.id === "huiqi_dan");
  ok(hq.length === 1 && hq[0].cap.startsWith("回气丹 "), "回气丹只有一个品级 → 仍是一格、不写品级", hq);
  const hm = C0.filter((x) => x.id === "humai_dan");
  ok(hm.length === 2, "出发前服用（护脉丹）两个品级 → 两格", hm);
  const s0 = await st();
  ok(s0 && s0.take.huichun_dan === 3 && JSON.stringify(s0.q.huichun_dan) === JSON.stringify({ 0: 2, 1: 1 }), "默认带满 3 枚、先带低品（凡 2 + 灵 1）", s0 && s0.q.huichun_dan);

  const btn = (id,q,t) => c.ev(([id,q,t])=>{
    const S=__game.flow.scenes.prep; S.packSub="all"; S.pages.pack=0; S.setTab("pack"); S.render();
    for(let i=0;i<30;i++) {
      const b=[...S.root.querySelectorAll(`[data-item="${id}"][data-q="${q}"] .ink-btn`)].find(x=>x.textContent.includes(t));
      if(b) { if(b.disabled||b.classList.contains("is-disabled"))return "disabled"; b.click();return "ok"; }
      const next=S.root.querySelector('[data-id="pack-next"]');if(next.disabled||next.classList.contains("is-disabled"))break;next.click();
    }
    return "none";
  },[id,q,t]);
  // 已满 3 枚：再加宝品 → 提示"每种最多 3 枚（各品级合计）"，不变
  await btn("huichun_dan", 2, "＋");
  await c.wait(150);
  const s1 = await st(), note = await c.ev(() => (document.querySelector(".mk-prep .mk-ld-note") || {}).textContent || "");
  ok(s1.take.huichun_dan === 3 && !s1.q.huichun_dan[2] && /最多带 3 枚/.test(note), "每种上限按种类（各品级合计）：满了加不进", { q: s1.q.huichun_dan, note });
  // 换品级：凡 −1，宝 +1 → 凡 1 / 灵 1 / 宝 1
  await btn("huichun_dan", 0, "－");
  await c.wait(100);
  await btn("huichun_dan", 2, "＋");
  await c.wait(150);
  const s2 = await st();
  ok(JSON.stringify(s2.q.huichun_dan) === JSON.stringify({ 0: 1, 1: 1, 2: 1 }) && s2.take.huichun_dan === 3, "按品级选：凡 1 · 灵 1 · 宝 1", s2.q.huichun_dan);
  const capTxt = await c.ev(() => document.querySelector('.mk-prep [data-item="huichun_dan"][data-q="2"] .cap').textContent);
  ok(/1\/2/.test(capTxt), "格子写 带/有（宝品 1/2）", capTxt);
  // 出发前服用：护脉丹带宝品 1 枚；再加凡品 → 合计上限 1
  await btn("humai_dan", 2, "＋");
  await c.wait(100);
  await btn("humai_dan", 0, "＋");
  await c.wait(150);
  const s3 = await st();
  ok(JSON.stringify(s3.q.humai_dan) === JSON.stringify({ 2: 1 }), "出发前服用的丹药也按品级选、合计 1 枚", s3.q.humai_dan);
  await c.wait(2600); // 提示条淡去再截图
  await c.shot("after");
  const crop = await c.ev(() => { const b = document.querySelector(".mk-prep .work").getBoundingClientRect(); return { x: b.left - 8, y: b.top - 8, width: b.width + 16, height: b.height + 16 }; });
  await c.shot("after_pack", { clip: crop });
  await c.ev(() => document.querySelector('.mk-prep [data-id="pack-next"]').click());
  await c.wait(150);
  await c.shot("after_pack_nextpage", { clip: crop });

  // 启程 → 局内 carried 的品级
  await c.ev(() => document.querySelector('.mk-prep [data-id="depart"]').click());
  ok(await waitFor(() => __game.flow.name === "run" && __game.run && __game.run.state === "play", null, 120000), "prep depart → r1 run");
  await c.wait(600);
  const run0 = await c.ev(() => ({
    hc: __game.run.carried.filter((i) => i.id === "huichun_dan").map((i) => [i.rarity || 0, i.n]),
    hm: __game.run.carried.filter((i) => i.id === "humai_dan").length,
    slot: __game.ctx.skills.potions[1].count,
    vuln: __game.player.entity.stats.get("vuln"),
    store: __game.profile.storage.items.filter((i) => i.id === "huichun_dan" || i.id === "humai_dan").map((i) => [i.id, i.rarity || 0, i.n]),
  }));
  ok(JSON.stringify(run0.hc) === "[[0,1],[1,1],[2,1]]" && run0.slot === 3, "局内带出的回春丹品级 = 所选（凡 1 · 灵 1 · 宝 1），快捷栏 2 共 3 枚", run0);
  ok(run0.hm === 0 && run0.vuln < 0 && run0.store.some(([id, r, n]) => id === "humai_dan" && r === 0 && n === 1), "护脉丹宝品入图即服、凡品留在仓库", run0.store);
  // 服一枚回春丹 → 撤离：吃掉的是凡品，灵 / 宝带回
  await c.ev(() => { __game.player.entity.hp = 10; __game.ctx.skills.cd = {}; __game.ctx.skills.usePotion(1); });
  await c.wait(200);
  await c.ev(() => __game.debug.extract());
  ok(await waitFor(() => __game.flow.name === "result", null, 30000), "extract → result");
  const after = await c.ev(() => {
    const m = {};
    for (const i of __game.profile.storage.items) if (i.id === "huichun_dan") m[i.rarity || 0] = (m[i.rarity || 0] || 0) + i.n;
    return m;
  });
  ok(JSON.stringify(after) === JSON.stringify({ 0: 1, 1: 1, 2: 2 }), "局内先吃低品：凡 2→1，灵 1、宝 2 都在", after);
}
