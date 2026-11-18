// 品质色（全游戏只有一套：src/core/items.js 的 RARITY 凡 / 灵 / 宝 / 仙 / 极）。这里只做"从 RARITY 推导"——降饱和、压暗、提亮，
// 不另起名字、不写死色值。世界里的圆相 / 光柱 / 微粒、搜取格子的晕色、提示名称色都从这里取。
import { RARITY } from "../core/items.js";

const INK = 0x15181b, GREY = 0x8a877e;
const num = (c) => (typeof c === "number" ? c : parseInt(String(c).replace("#", ""), 16));
const ch = (n, s) => (n >> s) & 255;
export function mix(a, b, k) {
  const f = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
export const qOf = (q) => Math.max(0, Math.min(RARITY.length - 1, q | 0));
export const rarityHex = (q) => num(RARITY[qOf(q)].color);
export const rarityName = (q) => RARITY[qOf(q)].name;
// ring 降饱和的主色；ink 压暗（白天的墨线、文字）；light 提亮（夜里的灯色、微粒）；column 光柱
export function rarityTint(q) {
  const base = rarityHex(q), ring = mix(base, GREY, 0.25);
  return { base, ring, ink: mix(ring, INK, 0.45), text: mix(base, INK, 0.32), light: mix(ring, 0xffffff, 0.62), column: mix(ring, 0xffffff, 0.3) };
}
// 纸面上可读的品级字色（物品名称、浮字）：品级色向墨色压深四成——仍是同一套 RARITY，只是保证与宣纸底的对比度
export function inkReadable(q) {
  return css(mix(rarityHex(q), INK, 0.4));
}
export const css = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0");
export const rgba = (n, a) => `rgba(${ch(n, 16)},${ch(n, 8)},${ch(n, 0)},${a})`;
