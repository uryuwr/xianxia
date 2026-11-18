// 每局装备掉落期望（按境界、按栏位）：用真实 rollLoot 统计，比较栏位门控（GEAR_SLOT_GATE）开 / 关。
//   node tools/loot_slot_stats.mjs [每个来源的抽样次数，默认 20000]
// 单局模型取数值策划 params.py 的 ECON_ECO（怪物生态 v1 + 区域规划 v2）：
//   r1：低阶 8.3 / 标准 16.8 只、精英 2.5、普通宝箱 7.2、灵光宝箱 0.8、亭子 3、异种 0.31、夜明宝箱 0.1
//   r2：低阶 8.5 / 标准 18.9 只、精英 3.2、普通宝箱 8.1、灵光宝箱 0.65、亭子 3、异种 0.30、夜明宝箱 0.1
// 首领 / 遗府首通是一次性的，不计入"每局"。
import { rollLoot } from "../src/game/loot.js";
import { GEAR_SLOT_GATE } from "../src/data/loot.js";
import { ITEMS } from "../src/core/items.js";
import { applyUnlocks } from "../src/game/progression.js";

const N = Number(process.argv[2] || 20000);
const RUN = {
  r1: { mob_low: 8.3, mob: 16.8, elite: 2.5, chest_normal: 7.2, chest_glow: 0.8, pavilion: 3, rare_variant: 0.31, chest_night: 0.1 },
  r2: { mob_low: 8.5, mob: 18.9, elite: 3.2, chest_normal: 8.1, chest_glow: 0.65, pavilion: 3, rare_variant: 0.3, chest_night: 0.1 },
};
const REALMS = { r1: [1, 2, 3, 4, 5, 6], r2: [5, 6, 7, 8, 9] };
const SLOTS = ["sword", "robe", "jade", "artifact"];

function perRun(region, layer) {
  const out = Object.fromEntries(SLOTS.map((s) => [s, 0]));
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  for (const [src, k] of Object.entries(RUN[region])) {
    const cnt = Object.fromEntries(SLOTS.map((s) => [s, 0]));
    for (let i = 0; i < N; i++) {
      const P = { realm: { stage: 1, layer }, unlocks: {}, flags: {}, stats: { fortune: 0, pity: { mobNoGear: 0 } } };
      applyUnlocks(P);
      for (const it of rollLoot(src, { region, profile: P, rng })) {
        const d = ITEMS[it.id];
        if (!d || !["gear", "artifact"].includes(d.cat)) continue;
        cnt[d.cat === "artifact" ? "artifact" : d.slot]++;
      }
    }
    for (const s of SLOTS) out[s] += (cnt[s] / N) * k;
  }
  return out;
}

const saved = GEAR_SLOT_GATE.away;
const rows = [];
for (const region of ["r1", "r2"])
  for (const L of REALMS[region]) {
    GEAR_SLOT_GATE.away = [];
    const a = perRun(region, L);
    GEAR_SLOT_GATE.away = saved;
    const b = perRun(region, L);
    rows.push({ region, L, a, b });
  }
const f = (x) => x.toFixed(2).padStart(5);
console.log(`GEAR_SLOT_GATE.away = ${JSON.stringify(saved)}；每来源抽样 ${N}`);
console.log("区域 境界   | 改前：剑   法衣  玉佩  法宝  合计 | 改后：剑   法衣  玉佩  法宝  合计");
for (const { region, L, a, b } of rows) {
  const sa = SLOTS.reduce((s, k) => s + a[k], 0), sb = SLOTS.reduce((s, k) => s + b[k], 0);
  console.log(`${region}   练${L}层 |      ${SLOTS.map((k) => f(a[k])).join(" ")} ${f(sa)} |      ${SLOTS.map((k) => f(b[k])).join(" ")} ${f(sb)}`);
}
