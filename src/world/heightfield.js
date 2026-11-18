// 数据驱动的高度场：由关卡定义（台地多边形、谷地、坡道 / 石阶、溪流 / 断涧、深潭、山丘、峭壁、边界）生成。
// 高度在 CPU 上按 0.5 米网格计算一次；碰撞、植被、网格都从网格读取。
// 线状要素（河、断涧、石径）按线段光栅化进距离网格，避免逐点遍历整条折线。
//
// 查询：
//   ground(x, z)  地表高度（双线性）
//   walk(x, z)    可站立高度：含桥面；"保崖插值"——格子四角高差超过 0.9 米时取最近点，
//                 让崖壁在碰撞上是一道真正的台阶（逐帧步进时走不上也走不下），与帧率无关
//   slope(x, z)   坡度
//   riverDist / pathDist  到水边 / 石径的距离（植被、物件避让）
//
// 关卡定义里与高度相关的字段（单位：米；多边形为 [[x, z], …]）：
//   size: [宽, 深]（可玩范围），margin（网格外扩，默认 14），cell（默认 0.5），base（默认 0），detail（细微起伏幅度，默认 0.35）
//   boundary   陆地外轮廓；之外陡落进云海
//   terraces   [{ poly, h, w?（崖壁过渡宽，默认 1.4）, rough?（崖线起伏，默认 1.2）, sharp?（不平滑折角） }] 台地（取最大，可嵌套）；多边形默认按弧线平滑
//   pits       [{ poly, h, w?, rough? }] 谷地（取最小：在台地里挖出低谷，四周成崖）
//   ramps      [{ a: 低端, b: 高端, width, steps?（数字或 true=自动） }] 跨过崖壁的缓坡 / 石阶
//   hills      [{ x, z, r, h }] 圆丘；crags [{ x, z, rx, rz, h }] 不可攀的峭壁
//   rivers     [{ path, width, depth, bank? }] 河槽（沿地形下切；跨过崖线处自然成瀑布）；path 点可带第三分量 = 该处宽度
//   gorges     [{ path, width, floor? }] 断涧（深切陡壁，掉不下去也走不过去）
//   lakes      [{ x, z, rx, rz, level（水面高度）, depth, bank?, shallow? }] 深潭 / 池
//   deepWater  true：河与池都是不可通行的深水（只能走桥 / 踏石 / 渡口）；河上的 fords 是浅滩渡口（可涉水，减速）
//              rivers[i].fords: [{ at: [x, z], r（半径，默认 3）, depth（渡口处水深，默认 0.35） }]
//              bridges[i].style: "stones" 踏石（一串扁石，桥面贴水，石间可走）
//   bridges    [{ a, b, width, arch? }] 桥面（只影响可站立高度）
//   hardCliffs true：碰撞网格里台地 / 谷地的崖边是硬台阶（只有坡道 / 石阶能上下）；渲染网格仍是平滑的崖面
//   paths      [[x, z], …][] 石径（植被让开）
import { fbm, vnoise, smooth, clamp, lerp } from "../render/glsl.js";

export const DEEP_Y = -40; // 深水格的可站立高度（低于 -0.8 即不可站）

// ---- 几何工具 ----
export function prepPoly(poly) {
  const n = poly.length;
  const xs = new Float64Array(n), zs = new Float64Array(n);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  poly.forEach(([x, z], i) => {
    xs[i] = x;
    zs[i] = z;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  });
  return { xs, zs, n, bb: [x0, z0, x1, z1] };
}
// 有向距离：多边形内为负
export function sdPoly(x, z, P) {
  const { xs, zs, n } = P;
  let d = 1e18, inside = !1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = xs[j], az = zs[j], bx = xs[i], bz = zs[i];
    const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
    const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1);
    const dx = wx - ex * t, dz = wz - ez * t;
    d = Math.min(d, dx * dx + dz * dz);
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -Math.sqrt(d) : Math.sqrt(d);
}
export function inPoly(x, z, poly) {
  let inside = !1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
// 到折线的距离与沿线长度
export function distLine(x, z, path) {
  let best = 1e18, acc = 0, along = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez, l = Math.sqrt(l2);
    const t = clamp(((x - ax) * ex + (z - az) * ez) / l2, 0, 1);
    const dx = ax + ex * t - x, dz = az + ez * t - z, d = dx * dx + dz * dz;
    if (d < best) (best = d), (along = acc + t * l);
    acc += l;
  }
  return [Math.sqrt(best), along];
}
// 把粗折线细分成平滑曲线（Catmull-Rom），每段约 step 米
export function smoothPath(path, step = 2) {
  if (path.length < 3) return path;
  const out = [];
  const P = (i) => path[Math.max(0, Math.min(path.length - 1, i))];
  const dims = path[0].length;
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
      if (dims > 2) q.push(p1[2] + (p2[2] - p1[2]) * t); // 第三分量（宽度）线性插值
      out.push(q);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}
// 闭合多边形的平滑（Catmull-Rom，首尾相接）：折线顶点变成自然的弧线，崖线不再是锯齿
export function smoothPoly(poly, step = 2) {
  const n = poly.length, out = [];
  const P = (i) => poly[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
export function segInfo(x, z, a, b) {
  const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez, l = Math.sqrt(l2);
  const t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2;
  const px = a[0] + ex * t - x, pz = a[1] + ez * t - z;
  return { t, perp: Math.hypot(px, pz), len: l };
}

export class Heightfield {
  constructor(def) {
    this.def = def;
    // 网格比地图大一圈（margin），让海岸线可以自由向外起伏而不被网格边界切直
    const margin = def.margin ?? 14;
    const W = def.size[0] + margin * 2, D = def.size[1] + margin * 2;
    this.cell = def.cell || 0.5;
    this.W = W;
    this.D = D;
    this.x0 = -W / 2;
    this.z0 = -D / 2;
    this.nx = Math.round(W / this.cell) + 1;
    this.nz = Math.round(D / this.cell) + 1;
    const t0 = performance.now();
    this._prep();
    const N = this.nx * this.nz;
    this.groundG = new Float32Array(N);
    this.riverDG = new Float32Array(N).fill(1e4); // 到水边的距离（水里为负；含断涧）
    this.waterDG = new Float32Array(N).fill(1e4); // 只算河与池：到水边的距离（水里为负）
    this.fordG = new Uint8Array(N); // 浅滩渡口
    this.bridgeG = new Uint8Array(N); // 桥 / 踏石桥面
    this.pathDG = new Float32Array(N).fill(1e4);
    // 台地 / 谷地多边形先光栅化成有向距离网格（只在崖线附近算精确距离），避免逐格遍历多边形的每条边
    for (const t of [...this.T, ...this.Pits]) t.sdG = this._sdGrid(t.P, t.w + t.rough * 1.3 + 1);
    // hardCliffs：碰撞网格的崖边取硬台阶（没有中间高度，只有坡道 / 石阶能上下）；渲染网格仍用平滑过渡
    this.hard = !!def.hardCliffs;
    const hardG = this.hard ? new Float32Array(N) : null;
    for (let iz = 0, i = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++, i++) {
        this.groundG[i] = this.base(this.x0 + ix * this.cell, this.z0 + iz * this.cell, !1, i);
        if (hardG) hardG[i] = this._hh;
      }
    for (const t of [...this.T, ...this.Pits]) delete t.sdG;
    const grids = hardG ? [this.groundG, hardG] : [this.groundG];
    this._carve(grids);
    this._edge(grids);
    this.walkG = hardG || this.groundG.slice();
    this._bridges();
    this._deep();
    this.buildMs = performance.now() - t0;
  }
  _prep() {
    const d = this.def;
    this.b0 = d.base ?? 0;
    const tp = (t) => ({ ...t, P: prepPoly(t.sharp ? t.poly : smoothPoly(t.poly, 2.5)), w: t.w ?? 1.4, rough: t.rough ?? 1.2 });
    this.T = (d.terraces || []).map(tp).sort((a, b) => a.h - b.h);
    this.Pits = (d.pits || []).map(tp);
    this.B = d.boundary ? prepPoly(smoothPoly(d.boundary, 3)) : null;
    this.rivers = (d.rivers || []).map((r) => ({ ...r, path: smoothPath(r.path, 1.5), bank: r.bank ?? 0.8, fords: (r.fords || []).map((f) => ({ r: 3, depth: 0.35, ...f })) }));
    this.gorges = (d.gorges || []).map((g) => ({ ...g, path: smoothPath(g.path, 1.5) }));
    this.lakes = d.lakes || [];
    this.paths = (d.paths || []).map((p) => smoothPath(p, 1.5));
    // 坡道两端的高度（不含坡道自身）；steps: true → 每级不超过 0.4 米
    this.ramps = (d.ramps || []).map((r) => {
      const ha = this.base(r.a[0], r.a[1], !0), hb = this.base(r.b[0], r.b[1], !0);
      const steps = r.steps === !0 ? Math.ceil(Math.abs(hb - ha) / 0.4) : r.steps || 0;
      return { ...r, ha, hb, steps };
    });
  }
  // 台地 / 谷地 / 丘 / 峭壁 / 坡道 / 细节起伏（不含河、湖、边界）
  // 多边形的有向距离网格：扫描线填内外，崖线 margin 米内按线段光栅化求精确距离
  _sdGrid(P, margin) {
    const { nx, nz, cell, x0, z0 } = this;
    const G = new Float32Array(nx * nz).fill(1e4);
    const { xs, zs, n } = P;
    const cross = [];
    for (let iz = 0; iz < nz; iz++) {
      const z = z0 + iz * cell;
      cross.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) if (zs[j] > z !== zs[i] > z) cross.push(((xs[i] - xs[j]) * (z - zs[j])) / (zs[i] - zs[j]) + xs[j]);
      cross.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const a = Math.max(0, Math.ceil((cross[k] - x0) / cell)), b = Math.min(nx - 1, Math.floor((cross[k + 1] - x0) / cell));
        for (let ix = a; ix <= b; ix++) G[iz * nx + ix] = -1e4;
      }
    }
    const path = [];
    for (let i = 0; i <= n; i++) path.push([xs[i % n], zs[i % n]]);
    this._raster(path, margin, (i, d) => {
      const v = G[i] < 0 ? -d : d;
      if (Math.abs(v) < Math.abs(G[i])) G[i] = v;
    });
    return G;
  }
  // 返回平滑高度；hardCliffs 时同时算出硬台阶版本放在 this._hh
  base(x, z, noRamp = !1, gi = -1) {
    const b0 = this.b0, hard = this.hard;
    let h = b0, hh = b0;
    let en = null; // 崖线起伏噪声：只在崖线附近才算
    let edgeLin = 0; // edge() 的线性值（硬台阶按 0.5 切）
    const edge = (t) => {
      const [bx0, bz0, bx1, bz1] = t.P.bb, m = t.w + t.rough * 1.3;
      edgeLin = 0;
      if (x < bx0 - m || x > bx1 + m || z < bz0 - m || z > bz1 + m) return 0;
      const sd = gi >= 0 && t.sdG ? t.sdG[gi] : sdPoly(x, z, t.P);
      if (sd < -m - 0.5) return (edgeLin = 1);
      if (sd > m + 0.5) return 0;
      en ??= (fbm(x * 0.06 + 3.1, z * 0.06 - 1.7, 3) - 0.5) * 2 + (vnoise(x * 0.3, z * 0.3) - 0.5) * 0.18;
      const f = clamp(0.5 - (sd + en * t.rough) / t.w, 0, 1);
      edgeLin = f;
      return f * f * (3 - 2 * f);
    };
    for (const t of this.T) {
      const f = edge(t);
      if (f > 0) h = Math.max(h, b0 + (t.h - b0) * f);
      if (hard && edgeLin >= 0.5) hh = Math.max(hh, t.h);
    }
    for (const t of this.Pits) {
      const f = edge(t);
      if (f > 0) h = lerp(h, Math.min(h, t.h), f);
      if (hard && edgeLin >= 0.5) hh = Math.min(hh, t.h);
    }
    let add = 0;
    for (const k of this.def.hills || []) {
      const r = Math.hypot(x - k.x, z - k.z) / k.r;
      if (r < 1) add += k.h * (1 - r * r) * (1 - r * r);
    }
    for (const c of this.def.crags || []) {
      const dx = (x - c.x) / c.rx, dz = (z - c.z) / c.rz;
      if (dx * dx + dz * dz > 2) continue;
      const r = Math.hypot(dx, dz) + (fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5;
      const k = 1 - smooth(0.7, 0.95, r);
      add += c.h * k;
    }
    h += add;
    hh += add;
    let rampMask = 0;
    if (!noRamp)
      for (const r of this.ramps) {
        const s = segInfo(x, z, r.a, r.b);
        const half = r.width / 2;
        if (s.perp > half + 0.6 || s.t < -0.1 || s.t > 1.1) continue;
        let t = clamp(s.t, 0, 1);
        if (r.steps) t = Math.min(1, Math.floor(t * r.steps + 0.5) / r.steps);
        const hr = lerp(r.ha, r.hb, t);
        const m = (1 - smooth(half - 0.25, half + 0.35, s.perp)) * smooth(-0.1, 0.02, s.t) * (1 - smooth(0.98, 1.1, s.t));
        h = lerp(h, hr, m);
        hh = lerp(hh, hr, m);
        rampMask = Math.max(rampMask, m);
      }
    const det = (fbm(x * 0.22 + 4, z * 0.22, 3) - 0.5) * (this.def.detail ?? 0.35) * (1 - rampMask);
    this._hh = hh + det;
    return h + det;
  }
  // 线段光栅化：对线段附近 margin 内的格子回调 fn(i, d, x, z)
  _raster(path, margin, fn) {
    const c = this.cell;
    for (let s = 0; s < path.length - 1; s++) {
      const a = path[s], b = path[s + 1];
      const ix0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - margin - this.x0) / c)), ix1 = Math.min(this.nx - 1, Math.ceil((Math.max(a[0], b[0]) + margin - this.x0) / c));
      const iz0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - margin - this.z0) / c)), iz1 = Math.min(this.nz - 1, Math.ceil((Math.max(a[1], b[1]) + margin - this.z0) / c));
      const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      for (let iz = iz0; iz <= iz1; iz++)
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = this.x0 + ix * c, z = this.z0 + iz * c;
          const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1);
          const d = Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z);
          if (d <= margin) fn(iz * this.nx + ix, d, x, z, a.length > 2 ? a[2] + (b[2] - a[2]) * t : undefined);
        }
    }
  }
  _carve(grids) {
    const N = this.nx * this.nz;
    // 河槽：同一格取最深的下切
    const cut = new Float32Array(N);
    for (const r of this.rivers) {
      const maxW = Math.max(r.width, ...r.path.map((p) => p[2] || 0));
      this._raster(r.path, maxW / 2 + r.bank + 0.5, (i, d, x, z, w) => {
        const half = (w ?? r.width) / 2;
        let c = r.depth * (1 - smooth(half - 0.3, half + r.bank, d));
        // 浅滩渡口：圈内河床抬高到浅水（可涉水），圈边平滑过渡
        for (const f of r.fords) {
          const fd = Math.hypot(x - f.at[0], z - f.at[1]);
          if (fd < f.r + 1.5) {
            const k = 1 - smooth(f.r - 0.5, f.r + 1.5, fd);
            c = lerp(c, Math.min(c, f.depth), k);
            if (fd < f.r && d - half < 0) this.fordG[i] = 1;
          }
        }
        cut[i] = Math.max(cut[i], c);
        this.riverDG[i] = Math.min(this.riverDG[i], d - half);
        this.waterDG[i] = Math.min(this.waterDG[i], d - half);
      });
    }
    for (const G of grids) for (let i = 0; i < N; i++) G[i] -= cut[i];
    // 断涧：先求每格到断涧边的最近距离，再统一下切（多段线段重叠处不会重复下切出缺口）
    if (this.gorges.length) {
      const gd = new Float32Array(N).fill(1e4), gf = new Float32Array(N);
      for (const g of this.gorges) {
        const maxW = Math.max(g.width, ...g.path.map((p) => p[2] || 0));
        this._raster(g.path, maxW / 2 + 1.2, (i, d, x, z, w) => {
          const e = d - (w ?? g.width) / 2;
          if (e < gd[i]) (gd[i] = e), (gf[i] = g.floor ?? -7);
        });
      }
      for (let i = 0; i < N; i++) {
        if (gd[i] > 1.0) continue;
        const x = this.x0 + (i % this.nx) * this.cell, z = this.z0 + Math.floor(i / this.nx) * this.cell;
        const k = 1 - smooth(-0.9, 0.7 + (vnoise(x * 0.5, z * 0.5) - 0.5) * 0.4, gd[i]);
        const fl = gf[i] + (vnoise(x * 0.3, z * 0.3) - 0.5) * 1.5;
        for (const G of grids) G[i] = lerp(G[i], Math.min(G[i], fl), k);
        this.riverDG[i] = Math.min(this.riverDG[i], gd[i]);
      }
    }
    // 深潭 / 池
    for (const L of this.lakes) {
      const m = 1.25;
      const ix0 = Math.max(0, Math.floor((L.x - L.rx * m - this.x0) / this.cell)), ix1 = Math.min(this.nx - 1, Math.ceil((L.x + L.rx * m - this.x0) / this.cell));
      const iz0 = Math.max(0, Math.floor((L.z - L.rz * m - this.z0) / this.cell)), iz1 = Math.min(this.nz - 1, Math.ceil((L.z + L.rz * m - this.z0) / this.cell));
      for (let iz = iz0; iz <= iz1; iz++)
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = this.x0 + ix * this.cell, z = this.z0 + iz * this.cell, i = iz * this.nx + ix;
          const r = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz) + (fbm(x * 0.15, z * 0.15, 3) - 0.5) * 0.12;
          const k = 1 - smooth(0.82, 1.0 + (L.bank ?? 0.06), r);
          if (k > 0) for (const G of grids) G[i] = lerp(G[i], Math.min(G[i], L.level - L.depth * (0.35 + 0.65 * (1 - smooth(0, 0.85, r)))), k);
          this.riverDG[i] = Math.min(this.riverDG[i], (r - 0.9) * Math.min(L.rx, L.rz));
          if (!L.shallow) this.waterDG[i] = Math.min(this.waterDG[i], (r - 0.9) * Math.min(L.rx, L.rz));
        }
    }
    // 石径、坡道、桥头：植被与山石让开
    const lanes = [...this.paths, ...this.ramps.map((r) => [r.a, r.b]), ...(this.def.bridges || []).map((b) => [b.a, b.b])];
    for (const p of lanes) this._raster(p, 6, (i, d) => (this.pathDG[i] = Math.min(this.pathDG[i], d)));
  }
  // 陆地边界：陡落进云海
  _edge(grids) {
    if (!this.B) return;
    const sdG = this._sdGrid(this.B, 16);
    for (let iz = 0; iz < this.nz; iz++)
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * this.cell, z = this.z0 + iz * this.cell, i = iz * this.nx + ix;
        if (sdG[i] < -15) continue;
        const d = sdG[i] + (fbm(x * 0.025 + 5, z * 0.025, 3) - 0.5) * 14 - 3 + (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 3 + (vnoise(x * 0.4, z * 0.4) - 0.5) * 0.6;
        const fall = smooth(-0.3, 0.6, d);
        if (fall > 0) {
          const low = -30 - fbm(x * 0.1, z * 0.1, 2) * 8;
          for (const G of grids) G[i] = lerp(G[i], low, fall);
        }
      }
  }
  _bridges() {
    this.bridges = (this.def.bridges || []).map((b) => ({ ...b, ha: this.ground(b.a[0], b.a[1]), hb: this.ground(b.b[0], b.b[1]) }));
    for (const b of this.bridges) {
      const { ha, hb } = b;
      const half = b.width / 2;
      if (b.style === "stones") {
        // 踏石：沿线每 b.step 米一块扁石（半径 b.stone），石面比两岸略低、贴着水面；石与石的间隙小于一步，可以连续走过
        const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), n = Math.max(2, Math.round(len / (b.step ?? 1.25)));
        b.stones = [];
        for (let k = 0; k <= n; k++) {
          const t = k / n, j = k > 0 && k < n ? (vnoise(k * 3.1, len) - 0.5) * 0.5 : 0;
          const sx = lerp(b.a[0], b.b[0], t) - ((b.b[1] - b.a[1]) / len) * j, sz = lerp(b.a[1], b.b[1], t) + ((b.b[0] - b.a[0]) / len) * j;
          const y = lerp(ha, hb, t) - 0.12;
          const rr = (b.stone ?? 0.8) * (0.9 + vnoise(k * 7.7, 1.3) * 0.25);
          b.stones.push({ x: sx, z: sz, y, r: rr });
          this._raster([[sx, sz], [sx, sz + 1e-3]], rr, (i) => {
            this.walkG[i] = Math.max(this.walkG[i], y);
            this.bridgeG[i] = 1;
          });
        }
        continue;
      }
      this._raster([b.a, b.b], half, (i, d, x, z) => {
        const s = segInfo(x, z, b.a, b.b);
        if (s.t < 0 || s.t > 1) return;
        this.walkG[i] = Math.max(this.walkG[i], b.deckAt ? b.deckAt(s.t) : lerp(ha, hb, s.t) + (b.arch ?? 0.6) * Math.sin(Math.PI * s.t) + 0.15);
        this.bridgeG[i] = 1;
      });
    }
  }
  // 深水：河 / 池里、不在桥 / 踏石上、不在渡口 → 碰撞上视为崖外（walk = DEEP），主角 / 敌人 / 可达性泛洪都走不进去
  _deep() {
    const N = this.nx * this.nz;
    this.deepG = new Uint8Array(N);
    if (this.def.deepWater === !1) return;
    for (let i = 0; i < N; i++)
      if (this.waterDG[i] < -0.1 && !this.fordG[i] && !this.bridgeG[i] && this.walkG[i] > -20) {
        this.deepG[i] = 1;
        this.walkG[i] = DEEP_Y;
      }
  }
  deep(x, z) {
    return this._near(this.deepG, x, z) === 1;
  }
  ford(x, z) {
    return this._near(this.fordG, x, z) === 1;
  }
  _sample(G, x, z, keepCliff) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx > this.nx - 1 || fz > this.nz - 1) return -40;
    const ix = Math.min(this.nx - 2, Math.floor(fx)), iz = Math.min(this.nz - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz, n = this.nx, i = iz * n + ix;
    const a = G[i], b = G[i + 1], c = G[i + n], d = G[i + n + 1];
    if (keepCliff) {
      const mx = Math.max(a, b, c, d), mn = Math.min(a, b, c, d);
      if (mx - mn > 0.9) return tz < 0.5 ? (tx < 0.5 ? a : b) : tx < 0.5 ? c : d;
    }
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  _near(G, x, z) {
    const ix = clamp(Math.round((x - this.x0) / this.cell), 0, this.nx - 1), iz = clamp(Math.round((z - this.z0) / this.cell), 0, this.nz - 1);
    return G[iz * this.nx + ix];
  }
  ground(x, z) {
    return this._sample(this.groundG, x, z, !1);
  }
  walk(x, z) {
    return this._sample(this.walkG, x, z, !0);
  }
  slope(x, z) {
    const e = 0.5;
    const dx = this.ground(x + e, z) - this.ground(x - e, z), dz = this.ground(x, z + e) - this.ground(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
  riverDist(x, z) {
    return this._near(this.riverDG, x, z);
  }
  pathDist(x, z) {
    return this._near(this.pathDG, x, z);
  }
}
