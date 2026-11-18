// 场地布局（现状版与精细版共用，保证对比同机位同位置）。坐标：米，+z 朝镜头（游戏镜头 yaw 0 在 +z 方向俯看 −z）。
import { fbm, smooth } from "../../../src/render/glsl.js";

export const SITE = 34; // 地面边长
export const TEMPLE = { x: 0, z: -4.6 }; // 山神庙中心（台基中心），正面朝 +z
export const HERO = { x: 0.6, z: 0.6, yaw: Math.PI * 0.42 }; // 庙前石径上，侧身对着青牙
export const BOSS = { x: 7.4, z: 4.0, yaw: -Math.PI * 0.6 };
export const LANTERNS = [[-2.4, 0.9], [2.4, 0.9]];
export const ROCKS = [
  // x, z, 尺度, 种子, 高宽比, 朝向
  [-8.6, -0.6, 1.9, 1, 0.85, 0.4],
  [-7.0, 1.4, 1.0, 2, 0.7, 1.9],
  [-11.2, 7.4, 1.5, 3, 0.75, 2.6],
  [10.6, -1.8, 1.6, 4, 0.9, 5.1],
  [4.8, 11.5, 0.8, 5, 0.6, 0.8],
];
export const BAMBOO = { x: -11.5, z: -9.5, r: 4.2 };
export const PINE = { x: 8.2, z: -9.6 };
export const TREE = { x: -12.6, z: 3.2 };

// 石径中线：从台阶前（z≈1.3）向南延伸到场地边
export function pathX(z) {
  return 0.25 * Math.sin(z * 0.23 + 0.4) + (z > 8 ? (z - 8) * 0.12 : 0);
}
export function pathDist(x, z) {
  if (z < -0.4) return 99;
  return Math.abs(x - pathX(z));
}
// 台基占地（含散水）
export function templeDist(x, z) {
  const dx = Math.max(0, Math.abs(x - TEMPLE.x) - 4.9), dz = Math.max(0, Math.abs(z - TEMPLE.z) - 3.6);
  return Math.hypot(dx, dz);
}
// 地面高度：庙基与石径附近压平，远处缓起伏（≤ 0.45 米）
export function groundH(x, z) {
  const n = (fbm(x * 0.07 + 3.1, z * 0.07 - 1.7, 4) - 0.5) * 1.1 + (fbm(x * 0.3, z * 0.3, 2) - 0.5) * 0.12;
  const flat = smooth(1.5, 6.0, templeDist(x, z)) * smooth(1.2, 3.5, pathDist(x, z));
  const rise = smooth(8, 17, -z + x * 0.2) * 0.6; // 庙后略高（背山）
  return n * flat * 0.6 + rise * flat - 0.02;
}
