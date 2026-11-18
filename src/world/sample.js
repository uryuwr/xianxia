// 美术样张的原始地形（旧版，保留给尚未切换到关卡系统的场景使用）：青岚山的一块山腰台地。
// 三层台地（L0 前 / L1 中 / L2 后，越往画面深处越高），台地之间是崖壁；
// 左侧一段缓坡连接 L0 与 L1，中间一段石阶连接 L1 与 L2；
// 整块台地四周陡落进崖下云海（留白）；一条溪流自后山流下，在两道崖口形成瀑布。
// 高度在 CPU 上计算（供角色碰撞），网格据此生成，着色在 GPU 上完成（见 materials.js 的 JX_TERRAIN）。
import * as THREE from "three";
import { fbm, smooth, clamp, lerp } from "../render/glsl.js";
import { toon } from "../render/materials.js";

export const LEVELS = [0, 3.2, 7.0];
export const SIZE = 72; // 地形网格边长（米）
const RES = 288; // 网格分段数（0.25 米一格）

// 溪流路径（xz），自后向前
export const STREAM = [
  [5, -34], [6, -27], [7.5, -20], [9, -15], [9.6, -11.5], [9.2, -8], [7, -4], [5.2, -0.5], [4.4, 2.5],
  [2.6, 7], [0, 11], [-2.5, 15], [-3.6, 19], [-4.2, 24], [-4.6, 30],
];
// 石径路径：从起点经缓坡、石阶上到后山
export const PATH = [
  [-5, 17], [-8.5, 12], [-12, 7], [-13.4, 3.5], [-13.2, -1.5], [-11, -5.2], [-6.5, -7.2], [-3, -8.6],
  [-3, -11.2], [-3, -14], [-3, -16.8], [-1.5, -19.5], [-4, -22.5],
];

// 台地分界线：z 小于分界线的一侧属于更高的一层
const b1 = (x) => 1.2 + 2.3 * Math.sin(x * 0.13 + 0.4) + (fbm(x * 0.09, 3.1) - 0.5) * 3.5;
const b2 = (x) => -10.5 + 2.0 * Math.sin(x * 0.17 + 2.0) + (fbm(x * 0.08, 8.7) - 0.5) * 3.2;

function distPoly(x, z, poly) {
  let best = 1e9, along = 0, acc = 0, bestAlong = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) (best = d), (bestAlong = acc + t * l);
    acc += l;
  }
  along = bestAlong;
  return [best, along];
}

// 不含溪流河槽的台地高度
function baseHeight(x, z) {
  // L0→L1：左侧 x≈-13 处是缓坡，其余是崖
  const ramp = 1 - smooth(2.6, 4.6, Math.abs(x + 13.3));
  const w1 = lerp(0.8, 10, ramp);
  let f1 = clamp((b1(x) - z) / w1 + 0.5, 0, 1);
  f1 = lerp(f1 * f1 * (3 - 2 * f1), f1, ramp);
  // L1→L2：x≈-3 处是石阶，其余是崖
  const stair = 1 - smooth(1.5, 2.4, Math.abs(x + 3));
  const w2 = lerp(0.8, 7.5, stair);
  let f2 = clamp((b2(x) - z) / w2 + 0.5, 0, 1);
  const f2s = f2 * f2 * (3 - 2 * f2);
  const steps = 9;
  f2 = lerp(f2s, Math.min(1, Math.floor(f2 * steps + 0.35) / steps), stair);
  let h = LEVELS[0] + (LEVELS[1] - LEVELS[0]) * f1 + (LEVELS[2] - LEVELS[1]) * f2;
  // 后山：左后方隆起一座不可攀的峭壁
  const crag = Math.hypot((x + 20) / 9, (z + 25) / 6.5) + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.5;
  h += 6.5 * (1 - smooth(0.7, 0.95, crag));
  // 台地顶面的细微起伏（石阶处不加）
  h += (fbm(x * 0.22 + 4, z * 0.22) - 0.5) * 0.45 * (1 - stair);
  // 台地外缘：四周陡落进云海
  const ex = x / 28, ez = (z + 4) / 27.5;
  const r = Math.hypot(ex, ez) * (1 + (fbm(Math.atan2(ez, ex) * 2.0 + 7, 1.3) - 0.5) * 0.22);
  const fall = smooth(0.92, 1.1, r + (fbm(x * 0.35, z * 0.35) - 0.5) * 0.05);
  h = lerp(h, -30 - fbm(x * 0.1, z * 0.1) * 8, fall);
  return h;
}

// 溪流：河槽比两岸低 0.55 米
function carve(x, z) {
  const [d] = distPoly(x, z, STREAM);
  return 0.55 * (1 - smooth(0.7, 1.8, d));
}

export function height(x, z) {
  return baseHeight(x, z) - carve(x, z);
}
export function streamInfo(x, z) {
  return distPoly(x, z, STREAM);
}
export function pathDist(x, z) {
  return distPoly(x, z, PATH)[0];
}

// 地面坡度（用于判断能否行走、植被分布）
export function slope(x, z) {
  const e = 0.35;
  const dx = height(x + e, z) - height(x - e, z), dz = height(x, z + e) - height(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const n = pos.count;
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    H[i] = height(x, z);
    pos.setY(i, H[i]);
  }
  geo.computeVertexNormals();
  // 崖沿：平坦处、但附近有大落差 → 浓墨勾边
  const rim = new Float32Array(n);
  const W = RES + 1;
  const at = (ix, iz) => H[clamp(iz, 0, RES) * W + clamp(ix, 0, RES)];
  const nrm = geo.attributes.normal;
  for (let iz = 0; iz <= RES; iz++)
    for (let ix = 0; ix <= RES; ix++) {
      const i = iz * W + ix, h = H[i];
      let drop = 0;
      for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) drop = Math.max(drop, h - at(ix + ox, iz + oz));
      rim[i] = smooth(0.9, 2.2, drop) * smooth(0.55, 0.85, nrm.getY(i));
    }
  geo.setAttribute("aRim", new THREE.BufferAttribute(rim, 1));
  const mat = toon({ terrain: true, topColor: 0xd4d0bc, faceColor: 0x6e675c, mossColor: 0x9cbb86 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "terrain";
  return mesh;
}
