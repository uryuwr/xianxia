// 地上战利品的贴图（储物袋 v2）：一笔圆相 + 品质淡晕 + 物品水墨图标（取自物品图集，src/ui/icons.js iconFor 的坐标）。
// 未鉴定 = 墨拓剪影。贴图按"图标 × 品级 × 剪影"缓存，同类掉落共用一张；图集首次加载完成前先画圆相，加载后原地补画图标（只此一次）。
import * as THREE from "three";
import { RARITY } from "../core/items.js";
import { iconFor, atlasImage } from "../ui/icons.js";
import { ensoPath } from "./gather_fx.js";

const cache = new Map();
const hexA = (hex, a) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function drawBase(g, q) {
  const color = RARITY[q].color, ring = q > 0 ? color : "#2a2e31";
  g.clearRect(0, 0, 128, 128);
  const grd = g.createRadialGradient(64, 66, 4, 64, 66, 58);
  grd.addColorStop(0, q > 0 ? hexA(color, 0.42) : "rgba(245,240,227,.8)");
  grd.addColorStop(0.62, q > 0 ? hexA(color, 0.16) : "rgba(236,230,214,.5)");
  grd.addColorStop(1, "rgba(236,230,214,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 66, 58, 0, 7);
  g.fill();
  ensoPath(g, 64, 64, 46, "rgba(245,240,227,.95)", 13, 6, 0.12, 0.7);
  ensoPath(g, 64, 64, 46, ring, 8, 3, 0.12, 0.7);
}
function drawIcon(g, img, r) {
  const s = 76 / Math.max(r.w, r.h), w = r.w * s, h = r.h * s;
  g.save();
  g.shadowColor = "rgba(245,240,227,.95)"; // 纸色外晕：白天、夜里都清楚
  g.shadowBlur = 6;
  g.drawImage(img, r.x, r.y, r.w, r.h, 64 - w / 2, 64 - h / 2, w, h);
  g.restore();
}
export function lootIconTex(inst) {
  const q = Math.max(0, Math.min(4, inst.rarity || 0)), sil = inst.identified === !1;
  const r = iconFor(inst, { sil });
  const key = r.key + "|" + (sil ? 1 : 0) + "|" + q;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  drawBase(g, q);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  atlasImage(sil).then((img) => {
    drawIcon(g, img, r);
    t.needsUpdate = !0;
  }, () => {});
  return t;
}
