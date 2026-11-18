// 几何体小工具（精细化小样 v1）：自由网格构建器、倒角方块、按法线的"米"制盒投影 UV、截面扫掠、合并。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 自由网格：vert(p, n, u, v) → 序号；tri / quad 按逆时针（从法线一侧看）
export class GB {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.i = [];
    this.extra = null; // { name: [values…], size }
  }
  vert(p, n, u = 0, v = 0) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) {
    this.i.push(a, b, c);
  }
  quad(a, b, c, d) {
    this.i.push(a, b, c, a, c, d);
  }
  get count() {
    return this.p.length / 3;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    return g;
  }
}

// 按面法线选投影平面的"米"制 UV（需先 toNonIndexed 或本身是平面法线）；off = [u, v] 随机偏移，让每块石头取到不同的纹理区域
export function boxUV(g, off = [0, 0], scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) (u = p.getX(i)), (v = p.getZ(i));
    else if (ax >= az) (u = p.getZ(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getY(i));
    uv[i * 2] = u * scale + off[0];
    uv[i * 2 + 1] = v * scale + off[1];
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// 倒角方块（中心在原点，尺寸 sx, sy, sz，倒角 c）：26 个面，平面法线，44 个三角面
export function chamferBox(sx, sy, sz, c = 0.02) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  c = Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45);
  const gb = new GB();
  // 每个顶点 = 某个角的三个倒角点之一；逐面构建（每面独立顶点，平面法线）
  const P = (sx_, sy_, sz_, ax) => {
    // ax：该点在哪条轴上内缩（0/1/2）
    const x = sx_ * (ax === 0 ? hx : hx - c), y = sy_ * (ax === 1 ? hy : hy - c), z = sz_ * (ax === 2 ? hz : hz - c);
    return V(x, y, z);
  };
  const face = (pts) => {
    // 凸体：法线朝外（与面中心同向），否则翻转顶点顺序
    const ctr = V();
    for (const p of pts) ctr.add(p);
    let n = V().subVectors(pts[1], pts[0]).cross(V().subVectors(pts[2], pts[0])).normalize();
    if (n.dot(ctr) < 0) (pts = pts.slice().reverse()), n.negate();
    const ids = pts.map((p) => gb.vert(p, n));
    for (let k = 1; k < ids.length - 1; k++) gb.tri(ids[0], ids[k], ids[k + 1]);
  };
  const S = [-1, 1];
  // 六个主面
  for (const s of S) {
    face(s > 0 ? [P(1, -1, -1, 0), P(1, 1, -1, 0), P(1, 1, 1, 0), P(1, -1, 1, 0)] : [P(-1, -1, 1, 0), P(-1, 1, 1, 0), P(-1, 1, -1, 0), P(-1, -1, -1, 0)]);
    face(s > 0 ? [P(-1, 1, -1, 1), P(-1, 1, 1, 1), P(1, 1, 1, 1), P(1, 1, -1, 1)] : [P(-1, -1, 1, 1), P(-1, -1, -1, 1), P(1, -1, -1, 1), P(1, -1, 1, 1)]);
    face(s > 0 ? [P(-1, -1, 1, 2), P(1, -1, 1, 2), P(1, 1, 1, 2), P(-1, 1, 1, 2)] : [P(1, -1, -1, 2), P(-1, -1, -1, 2), P(-1, 1, -1, 2), P(1, 1, -1, 2)]);
  }
  // 12 条棱的倒角面
  for (const a of S)
    for (const b of S) {
      // 平行于 z 的棱（x = a, y = b）
      let q = [P(a, b, -1, 0), P(a, b, 1, 0), P(a, b, 1, 1), P(a, b, -1, 1)];
      if (a * b < 0) q.reverse();
      face(q);
      // 平行于 x 的棱（y = a, z = b）
      q = [P(-1, a, b, 1), P(1, a, b, 1), P(1, a, b, 2), P(-1, a, b, 2)];
      if (a * b < 0) q.reverse();
      face(q);
      // 平行于 y 的棱（x = a, z = b）
      q = [P(a, -1, b, 0), P(a, 1, b, 0), P(a, 1, b, 2), P(a, -1, b, 2)];
      if (a * b > 0) q.reverse();
      face(q);
    }
  // 8 个角三角
  for (const a of S)
    for (const b of S)
      for (const d of S) {
        const t = [P(a, b, d, 0), P(a, b, d, 1), P(a, b, d, 2)];
        if (a * b * d < 0) t.reverse();
        face(t);
      }
  return gb.geometry();
}

// 截面沿路径扫掠：path = Vector3[]，profile = [[横, 竖], …]（截面平面内，竖 = 路径的"上"方向）；返回带"米"制 UV 的网格
export function sweep(path, profile, opts = {}) {
  const up0 = opts.up || V(0, 1, 0);
  const gb = new GB();
  const rows = [];
  let along = 0;
  const T = V(), S = V(), Uu = V();
  // 截面形心：法线一律朝外
  let cx = 0, cy = 0;
  for (const [a, b] of profile) (cx += a), (cy += b);
  cx /= profile.length;
  cy /= profile.length;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    S.crossVectors(T, up0).normalize();
    if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
    Uu.crossVectors(S, T).normalize();
    if (i) along += p.distanceTo(path[i - 1]);
    const sc = opts.scale ? opts.scale(i / (path.length - 1)) : 1;
    const row = [];
    let acc = 0;
    for (let k = 0; k < profile.length; k++) {
      const [px, py] = profile[k];
      if (k) acc += Math.hypot(px - profile[k - 1][0], py - profile[k - 1][1]) * sc;
      const pos = V().copy(p).addScaledVector(S, px * sc).addScaledVector(Uu, py * sc);
      // 截面法线：相邻截面点差的垂线
      const q0 = profile[Math.max(0, k - 1)], q1 = profile[Math.min(profile.length - 1, k + 1)];
      let dx = q1[0] - q0[0], dy = q1[1] - q0[1];
      if (dy * (px - cx) - dx * (py - cy) < 0) (dx = -dx), (dy = -dy);
      const n = V().addScaledVector(S, dy).addScaledVector(Uu, -dx).normalize();
      row.push(gb.vert(pos, n, acc, along));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++)
    for (let k = 0; k < profile.length - 1; k++) gb.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]);
  // 端盖（截面多边形扇形，近似）
  if (opts.caps) {
    for (const [ri, sgn] of [[0, -1], [rows.length - 1, 1]]) {
      const i0 = rows[ri];
      const pa = path[ri], pb = path[ri ? ri - 1 : 1];
      const n = V().subVectors(pa, pb).normalize();
      const ids = i0.map((id) => gb.vert(V(gb.p[id * 3], gb.p[id * 3 + 1], gb.p[id * 3 + 2]), n, gb.p[id * 3], gb.p[id * 3 + 1]));
      for (let k = 1; k < ids.length - 1; k++) sgn > 0 ? gb.tri(ids[0], ids[k + 1], ids[k]) : gb.tri(ids[0], ids[k], ids[k + 1]);
    }
  }
  return orientTris(gb.geometry());
}

// 让每个三角形的绕序与顶点法线一致（正面朝法线方向）；适用于带 index 的几何体
export function orientTris(g) {
  const p = g.attributes.position, n = g.attributes.normal, I = g.index.array;
  const a = V(), b = V(), c = V(), e1 = V(), e2 = V(), nn = V();
  for (let t = 0; t < I.length; t += 3) {
    a.fromBufferAttribute(p, I[t]);
    b.fromBufferAttribute(p, I[t + 1]);
    c.fromBufferAttribute(p, I[t + 2]);
    e1.subVectors(b, a).cross(e2.subVectors(c, a));
    nn.fromBufferAttribute(n, I[t]).add(V().fromBufferAttribute(n, I[t + 1])).add(V().fromBufferAttribute(n, I[t + 2]));
    if (e1.dot(nn) < 0) {
      const k = I[t + 1];
      I[t + 1] = I[t + 2];
      I[t + 2] = k;
    }
  }
  return g;
}

// 合并（自动去 index、补缺失属性），返回单个几何体
export function merge(list) {
  const prep = list.map((g) => {
    let h = g.index ? g.toNonIndexed() : g;
    if (!h.attributes.uv) h.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2));
    for (const k of Object.keys(h.attributes)) if (!["position", "normal", "uv", "aAO", "color"].includes(k)) h.deleteAttribute(k);
    return h;
  });
  const keys = ["aAO", "color"];
  for (const k of keys) {
    if (prep.some((g) => g.attributes[k])) {
      for (const g of prep)
        if (!g.attributes[k]) {
          const n = k === "color" ? 3 : 1;
          g.setAttribute(k, new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * n).fill(1), n));
        }
    }
  }
  return mergeGeometries(prep, !1);
}

// 给几何体加常量 / 函数的顶点 AO（aAO 属性，B / C 模式的接触 AO）
export function setAO(g, fn) {
  const p = g.attributes.position;
  const a = new Float32Array(p.count);
  const v = V();
  for (let i = 0; i < p.count; i++) a[i] = typeof fn === "function" ? fn(v.fromBufferAttribute(p, i), i) : fn;
  g.setAttribute("aAO", new THREE.BufferAttribute(a, 1));
  return g;
}

// 圆柱 UV 换成米（u 绕周长、v 沿高）
export function cylUVm(g, r, h) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h);
  return g;
}

// 草丛（几何草叶，非插片）：n 片叶，每片 3 段渐窄的弯条；顶点色根部深、叶尖浅；法线朝上偏外（水墨里读作一团而不是一堆碎片）
export function grassClump(n = 9, h = 0.5, seed = 1, spread = 0.12) {
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = [], nor = [], col = [], uv = [], idx = [];
  for (let b = 0; b < n; b++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * spread;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const lean = 0.25 + R() * 0.6, la = a + (R() - 0.5) * 1.2;
    const hh = h * (0.55 + 0.6 * R()), w = 0.018 + R() * 0.014;
    const dx = Math.cos(la), dz = Math.sin(la);
    const px = -dz, pz = dx; // 叶宽方向
    const base = pos.length / 3;
    const SEG = 3;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const y = hh * t, off = lean * hh * t * t;
      const ww = w * (1 - t * 0.92);
      const cx = bx + dx * off, cz = bz + dz * off;
      const shade = 0.35 + 0.65 * t;
      for (const sgn of [-1, 1]) {
        pos.push(cx + px * ww * sgn, y, cz + pz * ww * sgn);
        const nx = dx * 0.35, nz = dz * 0.35;
        const l = Math.hypot(nx, 1, nz);
        nor.push(nx / l, 1 / l, nz / l);
        col.push(shade, shade, shade);
        uv.push(sgn * 0.5 + 0.5, t);
      }
      if (k) {
        const i = base + k * 2;
        idx.push(i - 2, i - 1, i + 1, i - 2, i + 1, i);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
