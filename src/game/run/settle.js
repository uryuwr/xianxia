// 结算规则（纯函数，便于测试）：撤离成功 / 身陨时，储物袋、锦囊、装备、消耗品各自去哪里。
// 依据《最小闭环设计》§5.1–5.4。
import { REGIONS, LOST_BAG, GEAR_RISK } from "./regions.js";
import { defOf, valueOf } from "../../core/items.js";

const isConsumable = (it) => ["pill", "talisman"].includes((defOf(it) || {}).cat);
// 关键物品（突破材料、遗府首通秘宝、剧情物品；玩法评审 G3）：任何区域身陨都不损失，也不进遗落储物袋
export const isKey = (it) => ((defOf(it) || {}).tags || []).includes("key") || (it.tags || []).includes("key") || (defOf(it) || {}).cat === "quest";
// 护身格里的关键物品一律入库
function keepKeys(profile, run, out) {
  for (const it of (run.keyItems || []).splice(0)) profile.storage.add(it), out.push(it);
}

// 撤离成功：储物袋全部入库
export function settleExtract(profile, run) {
  const items = run.bag.clear();
  for (const it of items) profile.storage.add(it);
  keepKeys(profile, run, items);
  // 带出去没用完的消耗品回库（含局内捡到放进快捷栏的）
  for (const it of run.carried.splice(0)) delete it.found, profile.storage.add(it);
  return { result: "extract", kept: items, lost: [], value: items.reduce((s, it) => s + valueOf(it), 0) };
}

// 身陨：rng 可注入（测试用）
export function settleDeath(profile, run, rng = Math.random) {
  const R = REGIONS[run.region] || REGIONS.r1;
  const out = { result: "death", kept: [], lost: [], gearLost: null, lostBag: null };
  keepKeys(profile, run, out.kept);
  const bagItems = [];
  for (const it of run.bag.clear()) isKey(it) ? (profile.storage.add(it), out.kept.push(it)) : bagItems.push(it);
  // 局内捡到、放进快捷栏的丹药符箓（found）：身陨时按储物袋的规矩算
  if (run.carried.some((it) => it.found)) {
    for (const it of run.carried) if (it.found) delete it.found, bagItems.push(it);
    run.carried = run.carried.filter((it) => !bagItems.includes(it));
  }
  if (R.risk === "none") {
    for (const it of bagItems) profile.storage.add(it), out.kept.push(it);
    for (const it of run.carried.splice(0)) profile.storage.add(it);
    return out;
  }
  // 储物袋按灵值从高到低逐件保留 keepBag 比例（区域一 50%，区域二 25%；堆叠物品按数量）
  const lost = [];
  const sorted = [...bagItems].sort((a, b) => valueOf(b) - valueOf(a));
  let acc = 1 - (R.keepBag || 0);
  for (const it of sorted) {
    if (!(R.keepBag > 0)) lost.push(it);
    else if (it.n > 1) {
      const k = Math.round(it.n * R.keepBag);
      if (k > 0) {
        const part = { ...it, n: k };
        profile.storage.add(part), out.kept.push(part);
      }
      if (it.n - k > 0) lost.push({ ...it, uid: it.uid + "_l", n: it.n - k });
    } else if ((acc += R.keepBag) >= 1 - 1e-9) (acc -= 1), profile.storage.add(it), out.kept.push(it);
    else lost.push(it);
  }
  // 低风险区域：其余直接散失，消耗品与装备无损
  if (!R.loseConsumables && !R.gearRisk) {
    for (const it of run.carried.splice(0)) profile.storage.add(it);
    out.lost = lost;
    return out;
  }
  // 高风险区域：其余与消耗品留在遗落储物袋；随机 1 件未受保护的装备遗落
  if (R.loseConsumables) lost.push(...run.carried.splice(0));
  else for (const it of run.carried.splice(0)) profile.storage.add(it);
  const protectedUid = new Set([profile.nativeArtifact, ...(run.protect || [])].filter(Boolean));
  const cands = [];
  for (const slot of GEAR_RISK.slots) {
    const g = profile.equip[slot];
    if (!g || g.bound || protectedUid.has(g.uid)) continue;
    cands.push({ slot, g, w: GEAR_RISK.weight[g.rarity || 0] || 1 });
  }
  for (let n = 0; n < R.gearRisk && cands.length; n++) {
    let r = rng() * cands.reduce((s, c) => s + c.w, 0), pick = cands[0];
    for (const c of cands) if ((r -= c.w) <= 0) (pick = c), (r = Infinity);
    cands.splice(cands.indexOf(pick), 1);
    profile.equip[pick.slot] = null;
    lost.push({ ...pick.g, tags: [...(pick.g.tags || []), "gear"] });
    out.gearLost = pick.g;
  }
  out.lost = lost;
  // 旧的遗落储物袋（没取回）在这次身陨后消失
  profile.lostBag = lost.length ? { region: run.region, pos: run.deathPos ? [run.deathPos.x, run.deathPos.y, run.deathPos.z] : null, items: lost } : null;
  out.lostBag = profile.lostBag;
  return out;
}

// 取回遗落储物袋：装备 100%，其余 60%（按件 / 按堆叠数量）
export function retrieveLostBag(profile, rng = Math.random) {
  const lb = profile.lostBag;
  if (!lb) return { got: [], gone: [] };
  const got = [], gone = [];
  for (const it of lb.items) {
    const isGear = (it.tags || []).includes("gear") || ["gear", "artifact"].includes((defOf(it) || {}).cat);
    if (isGear || LOST_BAG.rest >= 1) got.push(it);
    else if (it.n > 1) {
      const k = Math.max(1, Math.round(it.n * LOST_BAG.rest));
      got.push({ ...it, n: k });
      if (it.n - k > 0) gone.push({ ...it, uid: it.uid + "_g", n: it.n - k });
    } else if (rng() < LOST_BAG.rest) got.push(it);
    else gone.push(it);
  }
  profile.lostBag = null;
  return { got, gone };
}

export { isConsumable };
