// 行囊预案（内观阁 / 出行准备共用）：profile.pack = { v: 1, q: { id: { rarity: 枚数 } } }。
// 只是打算，不移出仓库；启程时按品质取出。库存由 clampPlan 截断，种类 / 每种 / 引导门槛由共用 prep 构建器校验。
import { RARITY } from "../core/items.js";
const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
const validId = (id) => id !== "__proto__" && id !== "constructor" && id !== "prototype";
const quality = (r) => /^\d+$/.test(r) && +r < RARITY.length;

export function readPlan(P) {
  const k = P && P.pack;
  // null = 从未保存过（用默认带法）；{} = 玩家明确不带，不能补默认。
  return record(k) && record(k.q) ? k.q : null;
}
export function writePlan(P, q) {
  const out = {};
  for (const [id, m] of Object.entries(record(q) ? q : {})) {
    if (!validId(id) || !record(m)) continue;
    const mm = {};
    for (const [r, n] of Object.entries(m)) if (quality(r) && count(n)) mm[+r] = count(n);
    if (Object.keys(mm).length) out[id] = mm;
  }
  P.pack = { v: 1, q: out };
  return out;
}
// have(id) → [[品级, 枚数]]。返回独立对象，不改写存档中的预案。
export function clampPlan(q, have) {
  const out = {};
  for (const [id, m] of Object.entries(record(q) ? q : {})) {
    if (!validId(id) || !record(m)) continue;
    const hv = new Map(have(id));
    for (const [r, n] of Object.entries(m)) {
      if (!quality(r)) continue;
      const k = Math.min(count(n), count(hv.get(+r)));
      if (k > 0) (out[id] = out[id] || {})[+r] = k;
    }
  }
  return out;
}
export const planTotal = (m) => Object.values(record(m) ? m : {}).reduce((a, b) => a + count(b), 0);
