// 材料"何处可得"（模块 C · 丹器房 v2）：从掉落表、采集表、遗府 / Boss 首杀奖励、药园种子里反查一件材料的来处。
// 只读数据、只用于显示；规则仍在 src/data/loot.js（rollLoot）。洞府组若想把它挪进 facilities.js（sourcesOf），直接搬过去即可。
//   sourcesOf(id) → ["青岚山外 · 采集 / 宝箱（常见）", "山神庙石傀掉落", …]（最多 4 条，按可靠程度排序）
import { REGION_LOOT, CORE_OF, RUINS, BOSSES, GATHER } from "../../data/loot.js";
import { ENEMY_TYPES } from "../../data/enemies.js";
import { ITEMS } from "../../core/items.js";
import { SOURCE_NOTE } from "../../game/cave/facilities.js";

const REGION = { r1: "青岚山外", r2: "竹海·溪谷", tutorial: "序章" };
const GATHER_NAME = { tiejing: "矿脉采集", lingtu: "灵土坡采集", heshouwu: "灵光点", qingling: "采集青灵草", ninglu: "采集凝露花", hanlu: "采集寒露草", ziteng: "采集紫藤", chiyan: "采集赤炎果", lingbang: "溪中灵蚌", water_jade: "瀑布下灵光点", zhuxin: "竹海灵光点", wolfking_bone: "狼窝灵光点", furnace_part: "灵光点（一次）", zhenpan: "灵光点（一次）" };
const mobName = (k) => (ENEMY_TYPES[k] && ENEMY_TYPES[k].name) || { wolf_grey: "灰毛狼妖", golem: "石傀", bat: "蝠妖", vine: "藤妖" }[k] || k;

const cache = new Map();
export function sourcesOf(id) {
  if (cache.has(id)) return cache.get(id);
  const out = [];
  const add = (s) => s && !out.includes(s) && out.push(s);
  const d = ITEMS[id] || {};
  if (d.name && SOURCE_NOTE[d.name]) add(SOURCE_NOTE[d.name]);
  // Boss 首杀 / 遗府首探：必得
  for (const b of Object.values(BOSSES)) if (b.first.some((e) => e.item === id)) add(`${REGION[b.region] || ""} · ${b.name}首杀必得`);
  for (const r of Object.values(RUINS)) if (r.first.some((e) => e.item === id)) add(`${REGION[r.region] || ""} · ${r.name}（首探必得）`);
  // 妖兽专属材料
  for (const [reg, L] of Object.entries(REGION_LOOT)) {
    if (reg === "tutorial") continue;
    const mobs = Object.entries(L.mobMats || {}).filter(([, ids]) => ids.includes(id)).map(([k]) => mobName(k));
    if (mobs.length) add(`${REGION[reg]} · ${[...new Set(mobs)].slice(0, 2).join(" / ")}掉落`);
  }
  // 精英妖丹
  const elites = Object.entries(CORE_OF).filter(([k, v]) => v === id && !REGION[k]).map(([k]) => mobName(k));
  if (elites.length) add(`精英：${[...new Set(elites)].slice(0, 2).join(" / ")}`);
  // 采集点
  for (const [k, v] of Object.entries(GATHER)) {
    if (!GATHER_NAME[k]) continue;
    const hit = Array.isArray(v) ? v.some((e) => e.item === id) : Object.values(v).some((list) => list.some(([t]) => (GATHER[t] || []).some((e) => e.item === id)));
    if (hit) {
      const regs = Array.isArray(v) ? [] : Object.keys(v).filter((r) => r !== "tutorial");
      add(`${regs.length ? regs.map((r) => REGION[r]).join("、") + " · " : ""}${GATHER_NAME[k]}`);
    }
  }
  // 区域材料池（采集 / 宝箱 / 精英）
  for (const [reg, L] of Object.entries(REGION_LOOT)) {
    if (reg === "tutorial") continue;
    if ((L.common || []).some(([t]) => t === id)) add(`${REGION[reg]} · 小怪 / 宝箱（常见）`);
    else if ((L.rare || []).some(([t]) => t === id)) add(`${REGION[reg]} · 精英 / 宝箱（少见）`);
    if ((L.glow || []).some(([t]) => t === id)) add(`${REGION[reg]} · 灵光宝箱`);
  }
  // 药园：灵草可种
  if (Object.values(ITEMS).some((x) => x.seed && (x.seed.herb === d.name || x.seed.herb === id))) add("洞府药园 · 移栽种子");
  if (!out.length && d.desc) add(d.desc);
  const r = out.slice(0, 4);
  cache.set(id, r);
  return r;
}
