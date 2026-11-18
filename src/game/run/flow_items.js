// 流程模块用到的物品（兜底定义）：只有在内容模块的 items_db 里不存在同 id 物品时才注册，
// 内容模块的正式定义永远优先。约定的 id 见报告。
import { ITEMS, registerItems } from "../../core/items.js";

export const FLOW_ITEMS = [
  { id: "spirit_stone", name: "灵石", glyph: "灵", cat: "stone", size: 1, stack: 999, value: 1, desc: "修炼与炼器的根本" },
  { id: "dundi_fu", name: "遁地符", glyph: "遁", cat: "talisman", size: 1, stack: 5, value: 20, use: { extract: 12 }, desc: "捏碎后读条 12 秒遁回洞府，受击打断" },
  { id: "huqi_fu", name: "护器符", glyph: "护", cat: "talisman", size: 1, stack: 5, value: 30, desc: "本局保护一件装备，身陨不遗落" },
  { id: "rust_sword", name: "锈剑", glyph: "剑", cat: "gear", slot: "sword", size: 2, value: 4, base: [{ stat: "atk", type: "flat", value: 4 }], desc: "溪边捡到的一柄锈剑" },
  { id: "qingling_cao", name: "青灵草", glyph: "草", cat: "herb", size: 1, stack: 10, value: 3, desc: "最常见的灵草" },
  { id: "huichun_dan", name: "回春丹", glyph: "春", cat: "pill", size: 1, stack: 5, value: 12, use: { hp: 80 }, desc: "回复气血" },
  { id: "huiqi_dan", name: "回气丹", glyph: "气", cat: "pill", size: 1, stack: 5, value: 12, use: { mp: 50 }, desc: "回复真气" },
  { id: "wolf_fang", name: "狼妖牙", glyph: "牙", cat: "beast", size: 1, stack: 10, value: 4 },
  { id: "wolf_core", name: "狼妖内丹", glyph: "丹", cat: "core", size: 1, stack: 5, value: 30 },
  { id: "spirit_orb_shard", name: "灵光碎玉", glyph: "玉", cat: "treasure", size: 2, value: 60, desc: "灵光点里的宝物" },
];

export function ensureFlowItems() {
  registerItems(FLOW_ITEMS.filter((d) => !ITEMS[d.id]));
}

// 未知 id（例如旧的掉落表）临时补一个定义，避免拾取报错
export function ensureItemDef(id, name) {
  if (!ITEMS[id]) registerItems([{ id, name: name || id, glyph: (name || id)[0], cat: "beast", size: 1, stack: 10, value: 3 }]);
}
