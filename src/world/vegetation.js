// 植被：竹林、迎客松、草丛、山石。全部实例化绘制，笔触贴图来自 bake.js 的 Canvas 绘制。
import * as THREE from "three";
import { toon, cutoutDepth } from "../render/materials.js";
import { height, slope, streamInfo, pathDist, LEVELS } from "./terrain.js";
import { rng, fbm, vnoise } from "../render/glsl.js";

const R = rng(20261116);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const INK = 0x2b302c;

// 能否在 (x,z) 种东西：在台地上、坡度小、离溪流和石径有距离
export function groundOk(x, z, { stream = 2.4, path = 1.6, maxSlope = 0.35 } = {}) {
  const h = height(x, z);
  if (h < -0.6) return !1;
  if (slope(x, z) > maxSlope) return !1;
  if (streamInfo(x, z)[0] < stream) return !1;
  if (pathDist(x, z) < path) return !1;
  return !0;
}
function scatter(n, cx, cz, rad, opts, tries = 30) {
  const out = [];
  for (let k = 0; k < n * tries && out.length < n; k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rad;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (groundOk(x, z, opts)) out.push([x, z]);
  }
  return out;
}

// ---- 竹林 ----
function bamboo(tex, spots, colliders) {
  const group = new THREE.Group();
  const H = 7;
  const culmGeo = new THREE.CylinderGeometry(0.05, 0.065, H, 6, 14).translate(0, H / 2, 0);
  const culmMat = toon({ color: 0x6f9a62, bamboo: !0, wind: [0.45, H], fade: !0 });
  const culms = [];
  for (const [cx, cz, rad, n] of spots) for (const p of scatter(n, cx, cz, rad, { stream: 2.0, path: 1.4, maxSlope: 0.5 }, 40)) culms.push(p);
  const cm = new THREE.InstancedMesh(culmGeo, culmMat, culms.length);
  const leafGeo = upNormals(new THREE.PlaneGeometry(1.5, 1.2).translate(0, -0.35, 0));
  const leafMat = toon({ color: 0x4f8a58, map: tex, alphaTest: 0.45, side: THREE.DoubleSide, wind: [0.22, 1], windConst: !0, fade: !0 });
  const leaves = [];
  culms.forEach(([x, z], i) => {
    const s = 0.75 + R() * 0.45;
    const lean = [(R() - 0.5) * 0.12, (R() - 0.5) * 0.12];
    tmpE.set(lean[0], 0, lean[1]);
    tmpQ.setFromEuler(tmpE);
    const y = height(x, z) - 0.1;
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, s, 1));
    cm.setMatrixAt(i, tmpM);
    cm.setColorAt(i, new THREE.Color().setScalar(0.7 + R() * 0.75));
    colliders.push({ x, z, r: 0.18 });
    const top = H * s;
    const nl = 7 + Math.floor(R() * 5);
    for (let k = 0; k < nl; k++) {
      const hy = top * (0.45 + 0.55 * R());
      const a = R() * Math.PI * 2, r = 0.25 + R() * 0.55;
      const px = x + Math.sin(lean[1]) * hy * -1 + Math.cos(a) * r, pz = z + Math.sin(lean[0]) * hy + Math.sin(a) * r;
      leaves.push([px, y + hy, pz, a, 0.8 + R() * 0.5]);
    }
  });
  cm.castShadow = cm.receiveShadow = !0;
  const lm = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
  leaves.forEach(([x, y, z, a, s], i) => {
    tmpE.set((R() - 0.5) * 0.9, a, (R() - 0.5) * 0.9);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s, s, s));
    lm.setMatrixAt(i, tmpM);
  });
  lm.castShadow = !0;
  lm.receiveShadow = !0;
  lm.customDepthMaterial = cutoutDepth(tex, 0.45);
  group.add(cm, lm);
  group.userData.count = culms.length;
  return group;
}

// ---- 迎客松：弯曲的主干、近乎水平分层伸出的枝条、枝端扁平的松针团 ----
function pines(tex, list, colliders) {
  const group = new THREE.Group();
  const barkMat = toon({ color: 0x5e4c3c, tri: !0, brushK: 0.7, brushScale: 0.9, wind: [0.06, 8], fade: !0 });
  const padMat = toon({ color: 0x55785f, map: tex, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 1], windConst: !0, fade: !0 });
  const pads = [];
  const geos = [];
  for (const [x, z, hgt, lean, seed] of list) {
    const r = rng(seed);
    const y0 = height(x, z) - 0.2;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push(new THREE.Vector3(x + Math.sin(u * 2.4 + seed) * 0.5 + lean[0] * u * u * hgt, y0 + u * hgt, z + Math.cos(u * 2.0 + seed) * 0.4 + lean[1] * u * u * hgt));
    }
    const trunk = new THREE.CatmullRomCurve3(pts);
    geos.push(new THREE.TubeGeometry(trunk, 24, 0.28, 7, !1));
    // 根部隆起
    geos.push(new THREE.CylinderGeometry(0.3, 0.55, 0.6, 7).translate(x, y0 + 0.25, z));
    colliders.push({ x, z, r: 0.45 });
    const nb = 5 + Math.floor(r() * 3);
    for (let b = 0; b < nb; b++) {
      const u = 0.42 + (b / nb) * 0.55;
      const base = trunk.getPoint(u);
      const a = r() * Math.PI * 2 + b * 2.1;
      const len = (1.6 + r() * 2.0) * (1.15 - u * 0.5);
      const mid = base.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.5, 0.25 + r() * 0.3, Math.sin(a) * len * 0.5));
      const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.1 + r() * 0.4, Math.sin(a) * len));
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, mid, tip]), 8, 0.09 * (1.3 - u * 0.6), 5, !1));
      // 枝端松针团：几张水平的笔触卡片叠成一片"云"
      const np = 3 + Math.floor(r() * 3);
      for (let k = 0; k < np; k++) {
        const t = 0.45 + (k / np) * 0.6;
        const p = new THREE.CatmullRomCurve3([base, mid, tip]).getPoint(Math.min(1, t));
        pads.push([p.x + (r() - 0.5) * 0.6, p.y + 0.12 + r() * 0.15, p.z + (r() - 0.5) * 0.6, 1.4 + r() * 1.0, r() * 6.28]);
      }
    }
    const top = trunk.getPoint(1);
    for (let k = 0; k < 4; k++) pads.push([top.x + (r() - 0.5) * 0.8, top.y + 0.1 + k * 0.12, top.z + (r() - 0.5) * 0.8, 1.6 - k * 0.25, r() * 6.28]);
  }
  const bark = new THREE.Mesh(mergeGeos(geos), barkMat);
  bark.castShadow = bark.receiveShadow = !0;
  const padGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pm = new THREE.InstancedMesh(padGeo, padMat, pads.length * 2);
  pads.forEach(([x, y, z, s, a], i) => {
    for (let k = 0; k < 2; k++) {
      tmpE.set((R() - 0.5) * 0.35, a + k * 0.8, (R() - 0.5) * 0.35);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(x, y + k * 0.06, z), tmpQ, tmpS.set(s * (1 - k * 0.2), 1, s * 0.7 * (1 - k * 0.2)));
      pm.setMatrixAt(i * 2 + k, tmpM);
    }
  });
  pm.castShadow = !0;
  pm.receiveShadow = !0;
  pm.customDepthMaterial = cutoutDepth(tex, 0.4);
  group.add(bark, pm);
  return group;
}

// ---- 草丛：十字交叉的笔触卡片 ----
function grass(tex, n) {
  const g1 = new THREE.PlaneGeometry(0.7, 0.55).translate(0, 0.27, 0);
  const g2 = g1.clone().rotateY(Math.PI / 2);
  const geo = mergeGeos([g1, g2]);
  upNormals(geo); // 卡片法线朝上：草丛按地面受光，不会侧面发黑
  const mat = toon({ color: 0xffffff, map: tex, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 0.55] });
  const spots = [];
  for (let k = 0; spots.length < n && k < n * 20; k++) {
    const x = (R() - 0.5) * 58, z = (R() - 0.5) * 56 - 3;
    // 成片分布：噪声高处更密
    if (fbm(x * 0.09, z * 0.09) < 0.55 + R() * 0.12) continue;
    if (groundOk(x, z, { stream: 1.5, path: 1.0, maxSlope: 0.3 })) spots.push([x, z]);
  }
  const m = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach(([x, z], i) => {
    tmpE.set(0, R() * 6.28, 0);
    tmpQ.setFromEuler(tmpE);
    const s = 0.8 + R() * 0.8;
    tmpM.compose(tmpP.set(x, height(x, z) - 0.03, z), tmpQ, tmpS.set(s, s * (0.8 + R() * 0.5), s));
    m.setMatrixAt(i, tmpM);
  });
  m.receiveShadow = !0;
  return m;
}

// ---- 山石：噪声扰动的二十面体，表面三向投影皴法 ----
export function rockGeo(seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 0.75 + 0.45 * vnoise(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3) + 0.18 * vnoise(v.x * 4 - seed, v.y * 4 + v.z * 3);
    // 平顶、层理：顶部压平，侧面横向层叠
    let y = v.y * n;
    y = Math.min(y, 0.55 + 0.1 * vnoise(v.x * 3, v.z * 3 + seed));
    y = Math.round(y * 6) / 6 * 0.35 + y * 0.65;
    p.setXYZ(i, v.x * n, Math.max(y, -0.35), v.z * n);
  }
  g.computeVertexNormals();
  return g;
}
function rocks(colliders) {
  const group = new THREE.Group();
  const mat = toon({ color: 0x8c8a7e, tri: !0, brushK: 0.75, brushScale: 0.45 });
  const variants = [rockGeo(1.3), rockGeo(4.7), rockGeo(9.1)];
  const items = [[], [], []];
  const add = (x, z, s, sy, v, col) => {
    items[v].push([x, height(x, z) - 0.15 * s, z, s, sy, R() * 6.28]);
    if (col) colliders.push({ x, z, r: s * 0.85 });
  };
  // 散落的大石
  for (const [x, z, s] of [[-17, 10, 1.6], [6, 15, 1.2], [15, 4, 1.4], [-20, -12, 1.8], [18, -16, 1.5], [-9, -26, 1.3], [12.5, -9.8, 1.0], [-6, 4.5, 0.9], [22, 9, 1.1], [-24, 4, 1.3], [3, -24, 1.2], [19, -26, 1.6]]) add(x, z, s, 0.7 + R() * 0.4, Math.floor(R() * 3), !0);
  // 小石
  for (let k = 0; k < 36; k++) {
    const x = (R() - 0.5) * 54, z = (R() - 0.5) * 52 - 3;
    if (!groundOk(x, z, { stream: 1.6, path: 1.2, maxSlope: 0.6 })) continue;
    add(x, z, 0.25 + R() * 0.4, 0.6 + R() * 0.5, Math.floor(R() * 3), !1);
  }
  // 溪中踏石
  for (const [x, z] of [[1.6, 8.8], [-1.3, 13], [-3.1, 17.2], [6.2, -2.4]]) add(x, z, 0.45, 0.45, 2, !1);
  items.forEach((list, v) => {
    const m = new THREE.InstancedMesh(variants[v], mat, list.length);
    list.forEach(([x, y, z, s, sy, a], i) => {
      tmpE.set(0, a, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s, s * sy, s * (0.8 + R() * 0.3)));
      m.setMatrixAt(i, tmpM);
    });
    m.castShadow = m.receiveShadow = !0;
    group.add(m);
  });
  return group;
}

function upNormals(g) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
export function mergeGeos(list) {
  // 简单合并（同属性集）：转非索引后拼接
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

export function buildVegetation(tex, colliders) {
  const group = new THREE.Group();
  group.name = "vegetation";
  const bam = bamboo(
    tex.bamboo,
    [
      [-20, -5, 5.5, 70],
      [-24, 12, 3.5, 22],
      [18, 11, 3.2, 26],
      [16, -24, 3.0, 18],
    ],
    colliders,
  );
  const pn = pines(
    tex.pine,
    [
      [-9, -18.5, 6.5, [0.15, 0.05], 3],
      [14, -20, 7.5, [-0.1, 0.12], 7],
      [21.5, -2.5, 6, [0.25, 0.1], 11],
      [-21, 17, 5.5, [-0.2, 0.25], 13],
      [23.6, 15.5, 5.0, [0.55, 0.3], 17], // 崖边探身而出的迎客松
      [-26, -12, 6, [-0.3, -0.05], 19],
    ],
    colliders,
  );
  group.add(bam, pn, grass(tex.grass, 900), rocks(colliders));
  return group;
}
