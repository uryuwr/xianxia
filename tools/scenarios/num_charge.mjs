// 蓄势斩标定（战斗策划）：各境界剑气斩（三道全中）、寒冰锥的单次伤害 vs 满势 / 半势蓄势斩（横扫 + 剑气打同一木桩）。
// 用法：node tools/run.mjs num_charge "scene=run&region=r1"
// 木桩无防御、无抗性、不暴击；剑气斩的破甲会让后两道吃到易伤（与实战一致）。每项之间清掉木桩上的状态。
const PRE = [
  { id: "练一", realm: [1, 1], gear: { sword: ["rust_sword", 1, 0] } },
  { id: "练四", realm: [1, 4], gear: { sword: ["sword_qingfeng", 3, 1] } },
  { id: "练五", realm: [1, 5], gear: { sword: ["sword_qingfeng", 4, 1] } },
  { id: "练八", realm: [1, 8], gear: { sword: ["sword_zhuying", 8, 2] } },
  { id: "练九", realm: [1, 9], gear: { sword: ["sword_zhuying", 9, 2] } },
  { id: "筑一", realm: [2, 1], gear: { sword: ["sword_zhuying", 10, 2] } },
];
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 90000 });
  await c.wait(800);
  const rows = await c.ev(async (PRE) => {
    const G = __game, P = G.player, w = G.world, T = G.THREE, S = G.ctx.skills, h = P.entity;
    const { makeItem } = await import("/src/core/items.js");
    const { applyUnlocks } = await import("/src/game/progression.js");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    G.run.clearEnemies && G.run.clearEnemies();
    G.ctx.enemies.auto = !1;
    P.debug.god = !0;
    h.stats.add({ stat: "crit", type: "more", value: -1, source: "cal" });
    let dm = null, nid = 880000;
    const dummy = (dist) => {
      if (dm) (dm.alive = !1), w.remove(dm);
      const d = P.aimDir(new T.Vector3());
      dm = w.add({ id: ++nid, team: "enemy", pos: new T.Vector3(P.pos.x + d.x * dist, P.pos.y, P.pos.z + d.z * dist), radius: 0.5, height: 1.5, alive: !0, statuses: new Map(), tags: new Set(), owner: { flash() {} } });
      dm.stats.setBase("hp", 1e7);
      dm.hp = 1e7;
      return dm;
    };
    const sum = async (fn, ms) => {
      let s = 0;
      const off = w.events.on("damage", (i) => i.attacker === h && i.target === dm && !i.tags.includes("dot") && (s += i.amount)); // 不含墨痕持续伤害
      await fn();
      await sleep(ms);
      off();
      return s;
    };
    const out = [];
    for (const pre of PRE) {
      const p = G.profile;
      p.realm = { stage: pre.realm[0], layer: pre.realm[1] };
      applyUnlocks(p);
      p.equip = { sword: null, robe: null, jade: null, artifact: null };
      for (const [slot, [id, level, rarity]] of Object.entries(pre.gear)) p.equip[slot] = makeItem(id, { level, rarity, identified: !0 });
      p.build.spells = ["sword_qi", "frost", null];
      p.build.xinfa = [];
      G.ctx.applyProfileStats(p);
      S.setRealm("zhuji");
      S.setLoadout({ spells: ["sword_qi", "frost", "vine"], xinfa: [] });
      h.mp = 9999;
      const row = { id: pre.id, atk: Math.round(h.stats.get("atk")), spell: Math.round(h.stats.get("spell")) };
      // 剑气斩
      dummy(5);
      S.cd = {};
      S.aimOverride = dm.pos.clone();
      row.qi3 = await sum(async () => S.castSpell(0), 1500);
      S.aimOverride = null;
      // 寒冰锥
      dummy(5);
      S.cd = {};
      S.aimOverride = dm.pos.clone();
      row.frost = await sum(async () => S.castSpell(1), 1500);
      S.aimOverride = null;
      // 蓄势斩（满 / 半）
      for (const [k, m] of [["full", 100], ["half", 50]]) {
        dummy(2);
        await sleep(300);
        while (P.state !== "move") await sleep(30);
        P.momentum = m;
        row[k] = await sum(async () => P.tryCharge(), 1600);
      }
      // 剑气单打一个 / 横扫单打一个
      row.fullK = +(row.full / row.qi3).toFixed(2);
      row.halfK = +(row.half / row.qi3).toFixed(2);
      out.push(row);
    }
    h.stats.removeSource("cal");
    return out;
  }, PRE);
  console.log("境界  atk  spell  剑气斩×3  寒冰锥  满势斩  半势斩  满/剑气  半/剑气");
  for (const r of rows) console.log(`${r.id}  ${r.atk}  ${r.spell}  ${r.qi3}  ${r.frost}  ${r.full}  ${r.half}  ${r.fullK}  ${r.halfK}`);
  console.log("JSON " + JSON.stringify(rows));
}
