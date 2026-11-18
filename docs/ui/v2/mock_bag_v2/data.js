// 储物袋 v2 示意图共用数据：同一份"局中实况"，各方向都画它（便于横向比较）
// 品级 q：0 凡品 1 灵品 2 宝品 3 仙品 4 极品（src/core/items.js RARITY）；sz 占格 1 / 2 / 4
import { fillIcons } from "./icons/inkicons.js";
export const RARITY = [
  { name: "凡品", color: "#6a6760" }, { name: "灵品", color: "#3fae7a" }, { name: "宝品", color: "#2f7fa8" }, { name: "仙品", color: "#c9a040" }, { name: "极品", color: "#d2321e" },
];
// 储物袋 24 / 24 格（满）
export const BAG = [
  { id: "zhuxin", name: "千年竹心", q: 3, sz: 4, val: 1120, isNew: 1 },
  { id: "sword_qingfeng", name: "青锋剑", q: 2, sz: 2, val: 180, lv: 3, sel: 1 },
  { id: "robe_lingsi", name: "灵丝法衣", q: 1, sz: 2, val: 114 },
  { id: "jade_shuiling", name: "水灵佩", q: 2, sz: 2, val: 450, unid: 1 },
  { id: "spirit_stone", name: "灵石", q: 0, sz: 1, n: 22, val: 22 },
  { id: "qingling_cao", name: "青灵草", q: 0, sz: 1, n: 8, val: 32 },
  { id: "ninglu_hua", name: "凝露花", q: 0, sz: 1, n: 5, val: 25 },
  { id: "chiyan_guo", name: "赤炎果", q: 1, sz: 1, n: 3, val: 198 },
  { id: "hanlu_cao", name: "寒露草", q: 0, sz: 1, n: 4, val: 48 },
  { id: "tiejing_shi", name: "铁精石", q: 0, sz: 1, n: 3, val: 18 },
  { id: "wolf_fang", name: "狼妖牙", q: 0, sz: 1, n: 6, val: 30 },
  { id: "wolf_core", name: "狼妖内丹", q: 1, sz: 1, n: 2, val: 180 },
  { id: "ling_yu", name: "灵玉", q: 1, sz: 1, n: 4, val: 300 },
  { id: "seed_qingling", name: "青灵草苗", q: 0, sz: 1, n: 2, val: 12 },
  { id: "huichun_dan", name: "回春丹", q: 0, sz: 1, n: 3, val: 36 },
  { id: "huiqi_dan", name: "回气丹", q: 0, sz: 1, n: 2, val: 24 },
  { id: "dundi_fu", name: "遁地符", q: 0, sz: 1, n: 1, val: 15 },
  { id: "fu_fire", name: "火符", q: 0, sz: 1, n: 2, val: 20, isNew: 1 },
];
// 贴身锦囊 2 格（身陨不失）
export const POUCH = { cap: 2, items: [{ id: "art_qiankun", name: "乾坤镜", q: 4, sz: 2, val: 600 }] };
// 护身格（关键物品，不占格、身陨不失）
export const KEY = [
  { id: "bilin_core", name: "碧鳞内丹", q: 3, sz: 2, val: 600 },
  { id: "danfang_zhuji", name: "丹方《筑基丹》", q: 2, sz: 1, val: 400 },
];
// 随身装备
export const WORN = {
  sword: { id: "rust_sword", name: "锈剑", q: 0, slot: "剑", lv: 1 },
  robe: { id: "robe_bu", name: "布法衣", q: 0, slot: "衣", lv: 2 },
  jade: { id: "jade_qing", name: "青玉佩", q: 1, slot: "佩", lv: 2 },
  artifact: { id: "art_flying_sword", name: "青冥飞剑", q: 2, slot: "宝", lv: 2 },
};
// 行囊（丹药符箓快捷栏 1 / 2 / 3）
export const BELT = [
  { id: "huichun_dan", name: "回春丹", q: 0, n: 3, key: "1" },
  { id: "huiqi_dan", name: "回气丹", q: 0, n: 2, key: "2" },
  { id: "dundi_fu", name: "遁地符", q: 0, n: 1, key: "3" },
];
// 脚下放不下的
export const GROUND = [{ id: "wolfking_core", name: "狼王内丹", q: 2, sz: 2, val: 480 }];
export const SUM = { value: 2_612, stones: 22, used: 24, cap: 24, lose: 2_090, keepPct: 20 };
// 选中物品详情：青锋剑（宝品 Lv3）对比身上锈剑
export const SEL = {
  id: "sword_qingfeng", name: "青锋剑", q: 2, sz: 2, lv: 3, cat: "法剑", val: 180,
  desc: "青岚山外剑冢所出，剑身有一线青芒。",
  stats: [["攻击", "+13", "+4", "+9", "up"], ["会心", "+3%", "—", "+3%", "up"]],
  affix: ["剑气斩伤害 +8%", "(宝品第二条词条)"],
  vs: "锈剑",
};

const sizeWH = (sz) => (sz >= 4 ? [2, 2] : sz >= 2 ? [2, 1] : [1, 1]);
// 首次适配摆放（大件先放）；返回 [{it, c, r, w, h}]
export function pack(items, cols, rows) {
  const occ = Array.from({ length: rows }, () => Array(cols).fill(0)), out = [];
  const order = items.map((it, i) => [it, i]).sort((a, b) => b[0].sz - a[0].sz || a[1] - b[1]);
  for (const [it] of order) {
    const [w, h] = sizeWH(it.sz);
    let done = false;
    for (let r = 0; r < rows && !done; r++) for (let c = 0; c + w <= cols && !done; c++) {
      if (r + h > rows) continue;
      let ok = true;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (occ[r + y][c + x]) ok = false;
      if (!ok) continue;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) occ[r + y][c + x] = 1;
      out.push({ it, c: c + 1, r: r + 1, w, h });
      done = true;
    }
    if (!done) console.log("放不下", it.name);
  }
  return out;
}
// 一个物品签的 HTML
export function tok(it, { c = 1, r = 1, w, h, cls = "" } = {}) {
  const [W, H] = w ? [w, h] : sizeWH(it.sz || 1);
  return `<div class="tok q${it.q || 0}${it.sel ? " is-sel" : ""}${it.isNew ? " is-new" : ""}${it.unid ? " is-unid" : ""} ${cls}" style="--c:${c};--r:${r};--w:${W};--h:${H}" data-icon="${it.id}" data-box="${W}x${H}" title="${it.name}">${it.unid ? '<i class="unid"></i>' : ""}${it.n > 1 ? `<em>${it.n}</em>` : ""}${it.q >= 3 ? `<i class="cs">${RARITY[it.q].name[0]}</i>` : ""}${it.isNew ? "<s></s>" : ""}</div>`;
}
// 在 el 里画一个 cols×rows 的格子 + 物品
export function grid(el, items, cols, rows, opt = {}) {
  el.classList.add("bgrid");
  el.style.setProperty("--cols", cols);
  el.style.setProperty("--rows", rows);
  let h = "";
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) h += `<i class="cellmark" style="--c:${c};--r:${r}"></i>`;
  for (const p of opt.placed || pack(items, cols, rows)) h += tok(p.it, p);
  el.innerHTML = h;
}
// 页面画完后调用：把 data-icon 换成图标（默认用 a' 位图纸性渲染），然后通知截图
export function done(mode = "c") {
  fillIcons(document, mode, 2);
  window.__ready = true;
}
