// 地形入口（门面）：玩法代码统一从这里取地面高度。
//   height(x, z)        当前关卡的"可站立高度"（含桥面）；没有激活关卡时用美术样张的旧地形
//   ground(x, z)        当前关卡的"地表高度"（不含桥面，放置物件用）
//   slope(x, z)         坡度
//   canStand(x, z, fromY) 与主角 / 敌人一致的行走规则（台地之外、陡崖、碰撞体）
//   moveScale(x, z)     移动速度系数（浅滩渡口涉水 ×0.7），主角 / 敌人移动时乘上即可
//   isDeepWater(x, z)   深水（河 / 池，不含桥、踏石、渡口）——不可站；御剑飞行用
//   setActiveLevel(level) 由关卡系统调用（见 level.js 的 activate）
// 旧接口（LEVELS / STREAM / PATH / streamInfo / pathDist / buildTerrain）仍指向美术样张，供旧场景使用。
import * as sample from "./sample.js";

let active = null;
export function setActiveLevel(level) {
  active = level || null;
}
export function activeLevel() {
  return active;
}
export function height(x, z) {
  return active ? active.height(x, z) : sample.height(x, z);
}
export function ground(x, z) {
  return active ? active.ground(x, z) : sample.height(x, z);
}
export function slope(x, z) {
  if (active) return active.slope(x, z);
  return sample.slope(x, z);
}
// 移动速度系数（涉水减速等）：没有关卡或关卡不提供时为 1
export function moveScale(x, z) {
  return active && active.moveScale ? active.moveScale(x, z) : 1;
}
// 深水（河 / 池）：不可站，筑基后御剑可以飞过；没有关卡时为 false
export function isDeepWater(x, z) {
  return !!(active && active.isDeepWater && active.isDeepWater(x, z));
}
export const STEP_UP = 0.55; // 能走上的高差（与 src/data/player.js 一致）
export const STEP_DOWN = 0.9; // 能走下的高差
export function canStand(x, z, fromY, r = 0.32, colliders = active ? active.colliders : null) {
  const h = height(x, z);
  if (h < -0.8) return !1;
  if (h - fromY > STEP_UP || fromY - h > STEP_DOWN) return !1;
  if (colliders) for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return !1;
  return !0;
}

// ---- 旧接口（美术样张）----
export const LEVELS = sample.LEVELS;
export const SIZE = sample.SIZE;
export const STREAM = sample.STREAM;
export const PATH = sample.PATH;
export const streamInfo = sample.streamInfo;
export const pathDist = sample.pathDist;
export const buildTerrain = sample.buildTerrain;

// 调试入口：window.__game.loadLevel(id, seed)、URL ?level=r1&seed=7（主流程接管后由它提供正式入口）
if (typeof window !== "undefined") setTimeout(() => import("./debug.js").then((m) => m.installDebug()).catch((e) => console.error("[level] debug", e)), 0);
