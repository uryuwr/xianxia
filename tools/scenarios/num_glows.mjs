// 灵光点 + 灵土采集点候选校验（经济复核 v1 / 药园与重铸 v1）：r1 / r2 的 points.glows.from 每个候选点——可站、不在碰撞体里、从入口可达（与 loop_levels 同规则）、
// 所在分区的风险、有无守卫；再按关卡的抽取规则（打乱后取前 pick 个）模拟 20000 局，统计每种灵物每局出现的概率。
// 运行：node tools/run.mjs num_glows
const ok = (cond, msg, extra) => console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
export default async function (page, c) {
  await page.waitForFunction(() => window.__ready === true && window.__game && window.__game.loadLevel, null, { timeout: 120000 });
  await c.wait(1000);
  for (const id of ["r1", "r2"]) {
    const r = await c.ev(async (id) => {
      const def = (await import(`/src/data/levels/${id}.js`)).default;
      const lv = await window.__game.loadLevel(id, 7);
      const G = def.points.glows;
      const inPoly = (x, z, poly) => {
        let o = !1;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) o = !o;
        }
        return o;
      };
      const LT = (def.points.gathers || []).find((g) => g.kind === "lingtu");
      const extra = LT ? LT.from.map((pos) => ({ kind: "lingtu(采集)", pos, gather: !0 })) : [];
      const cands = [...G.from, ...extra].map((g) => {
        const [x, z] = g.pos, h = lv.height(x, z);
        const walk = h > -0.8 && [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([dx, dz]) => Math.abs(lv.height(x + dx, z + dz) - h) <= 0.55);
        // 灵光点自己的景物（放在点上，圆心离点 < 0.6 米）不算，与 loop_levels 排除 own colliders 一致
        const inCol = lv.colliders.some((cc) => Math.hypot(x - cc.x, z - cc.z) >= 0.6 && (x - cc.x) ** 2 + (z - cc.z) ** 2 < (cc.r + 0.32) ** 2);
        const reachJ = lv.reachable(x, z, !0, 1.2), reach = lv.reachable(x, z, !1, 1.2);
        const zone = (def.zones || []).find((q) => inPoly(x, z, q.poly));
        return { gather: !!g.gather, kind: g.kind, pos: g.pos, guard: g.guard || null, zone: zone ? zone.name : "-", risk: zone ? zone.risk : 0, walk, inCol, reach, reachJ };
      });
      // 抽取概率
      const N = 20000, cnt = {};
      for (let k = 0; k < N; k++) {
        const a = [...G.from];
        for (let i = a.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          [a[i], a[j]] = [a[j], a[i]];
        }
        const kinds = new Set(a.slice(0, G.pick).map((g) => g.kind));
        for (const kd of kinds) cnt[kd] = (cnt[kd] || 0) + 1;
      }
      const prob = Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, Math.round((v / N) * 100)]));
      return { pick: G.pick, n: G.from.length, cands, prob };
    }, id);
    console.log(`\n== ${id}：每局从 ${r.n} 个候选里抽 ${r.pick} 个；每种灵物每局出现概率（%）`, JSON.stringify(r.prob));
    for (const q of r.cands) console.log(`  ${q.kind.padEnd(14)} [${q.pos}] ${q.zone}（风险 ${q.risk}）守卫 ${q.guard || "无"} 可站 ${q.walk} 碰撞 ${q.inCol} 可达 ${q.reach}/${q.reachJ}`);
    for (const q of r.cands) ok(q.walk && !q.inCol && q.reachJ, `${id} ${q.kind} [${q.pos}] 可站、不在碰撞体里、可达`);
    for (const q of r.cands.filter((q) => !q.gather)) ok(q.guard || q.risk >= 3, `${id} ${q.kind} [${q.pos}] 有守卫或在风险 ≥ 3 的分区（${q.zone} ${q.risk}）`);
    for (const [k, p] of Object.entries(r.prob)) ok(p >= 35 && p <= 70, `${id} ${k} 每局出现概率 ${p}% 在 35–70% 内`);
  }
  const errs = await c.ev(() => window.__errors || []);
  ok(!errs.length, "no page errors", errs.slice(0, 3));
}
