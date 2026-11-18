// 关卡植被：竹海 / 竹丛、迎客松、杂树、草丛、山石。
// 全部实例化，按 48 米分块（视锥裁剪；草与小石离主角远时隐藏）。分布用固定种子（与每局种子无关，同一关卡长得一样）。
import * as THREE from "three";
import { toon, cutoutDepth } from "../render/materials.js";
import { rng, fbm, vnoise } from "../render/glsl.js";
import { rockGeo, mergeGeos } from "./vegetation.js";
import { inPoly } from "./heightfield.js";

const TILE = 48;
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();

function upNormals(g) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// 按分块收集实例矩阵，最后每块一个 InstancedMesh
class Tiles {
  constructor(hf) {
    this.hf = hf;
    this.map = new Map();
  }
  add(x, z, m, color) {
    const k = Math.floor((x - this.hf.x0) / TILE) + "," + Math.floor((z - this.hf.z0) / TILE);
    let t = this.map.get(k);
    if (!t) this.map.set(k, (t = { m: [], c: [], cx: 0, cz: 0, n: 0 }));
    t.m.push(m.clone());
    if (color) t.c.push(color);
    t.cx += x;
    t.cz += z;
    t.n++;
  }
  build(geo, mat, opts = {}) {
    const out = [];
    for (const t of this.map.values()) {
      const im = new THREE.InstancedMesh(geo, mat, t.m.length);
      t.m.forEach((m, i) => im.setMatrixAt(i, m));
      if (t.c.length) t.c.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = !!opts.cast;
      im.receiveShadow = !0;
      if (opts.depth) im.customDepthMaterial = opts.depth;
      im.computeBoundingSphere();
      im.userData.center = [t.cx / t.n, t.cz / t.n];
      if (opts.lod) im.userData.lod = opts.lod;
      // 画质档位（src/render/quality.js）：thin = 可按密度抽稀的纯装饰实例（无碰撞体）；vegCast = 植被投影（低画质关掉）
      if (opts.thin) im.userData.thin = t.m.length;
      if (opts.cast) im.userData.vegCast = !0;
      out.push(im);
    }
    return out;
  }
}

// clearings：[[x, z, r]] 林中空地——不长竹、树和大石（草和小石照长）
export function buildLevelVegetation(hf, def, tex, colliders, reserved, clearings = []) {
  const R = rng(((def.id || "lv").split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) + 101);
  const veg = def.veg || {};
  const group = new THREE.Group();
  group.name = "vegetation";
  const stats = {};
  const near = (x, z, r) => reserved.some(([px, pz, pr = 2.4]) => (px - x) ** 2 + (pz - z) ** 2 < (pr + r) ** 2);
  const inClearing = (x, z, r) => clearings.some(([cx, cz, cr]) => (cx - x) ** 2 + (cz - z) ** 2 < (cr + r) ** 2);
  const used = []; // 已占用的大件（树、竹丛、大石）
  const free = (x, z, r) => !used.some(([ux, uz, ur]) => (ux - x) ** 2 + (uz - z) ** 2 < (ur + r) ** 2);
  const ok = (x, z, { water = 1.6, path = 1.6, slope = 0.4, minH = -0.5 } = {}) => {
    const h = hf.walk(x, z);
    if (h < minH || Math.abs(h - hf.ground(x, z)) > 0.05) return !1; // 桥面上不长
    if (hf.slope(x, z) > slope) return !1;
    if (hf.riverDist(x, z) < water) return !1;
    if (hf.pathDist(x, z) < path) return !1;
    return !0;
  };
  const inZone = (z0, x, z) => (z0.poly ? inPoly(x, z, z0.poly) : Math.hypot(x - z0.circle[0], z - z0.circle[1]) < z0.circle[2]);
  const zoneBB = (z0) => {
    if (z0.circle) return [z0.circle[0] - z0.circle[2], z0.circle[1] - z0.circle[2], z0.circle[0] + z0.circle[2], z0.circle[1] + z0.circle[2]];
    const xs = z0.poly.map((p) => p[0]), zs = z0.poly.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  };
  const bambooZones = veg.bamboo || [];
  const inBamboo = (x, z) => bambooZones.some((b) => inZone(b, x, z));

  // ---- 竹：成丛 ----
  {
    const H = 7.5;
    const culmGeo = new THREE.CylinderGeometry(0.055, 0.07, H, 6, 14).translate(0, H / 2, 0);
    const culmMat = toon({ color: 0x6f9a62, bamboo: !0, wind: [0.45, H], fade: !0 });
    const leafGeo = upNormals(new THREE.PlaneGeometry(1.5, 1.2).translate(0, -0.35, 0));
    const leafMat = toon({ color: 0x4f8a58, map: tex.bamboo, alphaTest: 0.45, side: THREE.DoubleSide, wind: [0.22, 1], windConst: !0, fade: !0 });
    const culms = new Tiles(hf), leaves = new Tiles(hf);
    let nc = 0, nclump = 0;
    for (const zn of bambooZones) {
      const [x0, z0, x1, z1] = zoneBB(zn);
      const sp = Math.sqrt(100 / zn.density);
      for (let z = z0; z <= z1; z += sp)
        for (let x = x0; x <= x1; x += sp) {
          const cx = x + (R() - 0.5) * sp * 0.9, cz = z + (R() - 0.5) * sp * 0.9;
          // 密度随噪声起伏：竹海里留出林间空地
          if (fbm(cx * 0.05 + 9, cz * 0.05, 3) < 0.36) continue;
          if (!inZone(zn, cx, cz) || !ok(cx, cz, { water: 1.8, path: 1.9, slope: 0.5 }) || near(cx, cz, 1.2) || inClearing(cx, cz, 0.6) || !free(cx, cz, 0.6)) continue;
          const n = 3 + Math.floor(R() * 5);
          const y0 = hf.ground(cx, cz) - 0.1;
          for (let k = 0; k < n; k++) {
            const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.55;
            const x2 = cx + Math.cos(a) * r, z2 = cz + Math.sin(a) * r;
            const s = 0.7 + R() * 0.5;
            const lean = [(R() - 0.5) * 0.16 + (x2 - cx) * 0.12, (R() - 0.5) * 0.16 + (z2 - cz) * 0.12];
            E.set(lean[1], 0, -lean[0]);
            Q.setFromEuler(E);
            culms.add(x2, z2, M.compose(P.set(x2, y0, z2), Q, S.set(1, s, 1)), new THREE.Color().setScalar(0.7 + R() * 0.75));
            nc++;
            const top = H * s, nl = 6 + Math.floor(R() * 4);
            for (let j = 0; j < nl; j++) {
              const hy = top * (0.45 + 0.55 * R());
              const a2 = R() * Math.PI * 2, r2 = 0.25 + R() * 0.6;
              const lx = x2 + lean[0] * hy + Math.cos(a2) * r2, lz = z2 + lean[1] * hy + Math.sin(a2) * r2;
              E.set((R() - 0.5) * 0.9, a2, (R() - 0.5) * 0.9);
              Q.setFromEuler(E);
              const ls = 0.8 + R() * 0.5;
              leaves.add(lx, lz, M.compose(P.set(lx, y0 + hy, lz), Q, S.set(ls, ls, ls)));
            }
          }
          colliders.push({ x: cx, z: cz, r: 0.55 });
          used.push([cx, cz, 0.8]);
          nclump++;
        }
    }
    for (const m of culms.build(culmGeo, culmMat, { cast: !0 })) group.add(m);
    for (const m of leaves.build(leafGeo, leafMat, { cast: !0, thin: !0, depth: cutoutDepth(tex.bamboo, 0.45) })) group.add(m);
    stats.bamboo = nc;
    stats.bambooClumps = nclump;
  }

  // ---- 迎客松 ----
  {
    const barkMat = toon({ color: 0x5e4c3c, tri: !0, brushK: 0.7, brushScale: 0.9, wind: [0.06, 8], fade: !0 });
    const padMat = toon({ color: 0x55785f, map: tex.pine, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 1], windConst: !0, fade: !0 });
    const pads = new Tiles(hf);
    const barkByTile = new Map();
    let n = 0;
    for (const [px0, pz0, hgt, lean] of veg.pines || []) {
      // 落在不可种的地方就就近挪
      let x = px0, z = pz0;
      for (let k = 0; k < 30 && !(ok(x, z, { path: 1.2, slope: 0.6 }) && !near(x, z, 0.8)); k++) (x = px0 + (R() - 0.5) * k * 0.6), (z = pz0 + (R() - 0.5) * k * 0.6);
      const r = rng(Math.round(px0 * 13 + pz0 * 7) >>> 0);
      const y0 = hf.ground(x, z) - 0.2;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        pts.push(new THREE.Vector3(x + Math.sin(u * 2.4 + px0) * 0.5 + lean[0] * u * u * hgt, y0 + u * hgt, z + Math.cos(u * 2.0 + pz0) * 0.4 + lean[1] * u * u * hgt));
      }
      const trunk = new THREE.CatmullRomCurve3(pts);
      const key = Math.floor((x - hf.x0) / TILE) + "," + Math.floor((z - hf.z0) / TILE);
      if (!barkByTile.has(key)) barkByTile.set(key, []);
      const geos = barkByTile.get(key);
      geos.push(new THREE.TubeGeometry(trunk, 20, 0.28, 7, !1), new THREE.CylinderGeometry(0.3, 0.55, 0.6, 7).translate(x, y0 + 0.25, z));
      colliders.push({ x, z, r: 0.45 });
      used.push([x, z, 1.2]);
      const nb = 5 + Math.floor(r() * 3);
      for (let b = 0; b < nb; b++) {
        const u = 0.42 + (b / nb) * 0.55;
        const base = trunk.getPoint(u);
        const a = r() * Math.PI * 2 + b * 2.1;
        const len = (1.6 + r() * 2.0) * (1.15 - u * 0.5);
        const mid = base.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.5, 0.25 + r() * 0.3, Math.sin(a) * len * 0.5));
        const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.1 + r() * 0.4, Math.sin(a) * len));
        const br = new THREE.CatmullRomCurve3([base, mid, tip]);
        geos.push(new THREE.TubeGeometry(br, 6, 0.09 * (1.3 - u * 0.6), 5, !1));
        const np = 3 + Math.floor(r() * 3);
        for (let k = 0; k < np; k++) {
          const p = br.getPoint(Math.min(1, 0.45 + (k / np) * 0.6));
          addPad(pads, p.x + (r() - 0.5) * 0.6, p.y + 0.12 + r() * 0.15, p.z + (r() - 0.5) * 0.6, 1.4 + r() * 1.0, r() * 6.28, R);
        }
      }
      const top = trunk.getPoint(1);
      for (let k = 0; k < 4; k++) addPad(pads, top.x + (r() - 0.5) * 0.8, top.y + 0.1 + k * 0.12, top.z + (r() - 0.5) * 0.8, 1.6 - k * 0.25, r() * 6.28, R);
      n++;
    }
    for (const geos of barkByTile.values()) {
      const m = new THREE.Mesh(mergeGeos(geos), barkMat);
      m.castShadow = m.receiveShadow = !0;
      group.add(m);
    }
    for (const m of pads.build(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), padMat, { cast: !0, depth: cutoutDepth(tex.pine, 0.4) })) group.add(m);
    stats.pines = n;
  }

  // ---- 杂树：短干 + 几团圆冠（点叶法） ----
  {
    const tv = veg.trees || { n: 0 };
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.4, 6).translate(0, 1.2, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    {
      const p = crownGeo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 0.85 + 0.3 * vnoise(v.x * 2.1 + 3, v.z * 2.1 + v.y);
        p.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
      }
      crownGeo.computeVertexNormals();
    }
    const trunkMat = toon({ color: 0x4a3e34, tri: !0, brushK: 0.6, brushScale: 1.0, fade: !0 });
    const crownMat = toon({ color: 0xffffff, tri: !0, brushK: 0.9, brushScale: 0.8, wind: [0.08, 3], fade: !0 });
    const trunks = new Tiles(hf), crowns = new Tiles(hf);
    let n = 0;
    for (let k = 0; k < tv.n * 40 && n < tv.n; k++) {
      const x = hf.x0 + R() * hf.W, z = hf.z0 + R() * hf.D;
      if (fbm(x * 0.03 + 2, z * 0.03 - 5, 3) < 0.5) continue; // 成片
      if (inBamboo(x, z) || !ok(x, z, { water: 2.5, path: 2.4, slope: 0.35 }) || near(x, z, 1.5) || inClearing(x, z, 1.5) || !free(x, z, tv.avoid || 3)) continue;
      const y = hf.ground(x, z) - 0.15, s = 0.8 + R() * 0.6;
      E.set((R() - 0.5) * 0.15, R() * 6.28, (R() - 0.5) * 0.15);
      Q.setFromEuler(E);
      trunks.add(x, z, M.compose(P.set(x, y, z), Q, S.set(s, s, s)));
      const nc = 3 + Math.floor(R() * 3);
      for (let j = 0; j < nc; j++) {
        const a = R() * 6.28, r = j === 0 ? 0 : 0.7 + R() * 0.5;
        const cs = (j === 0 ? 1.5 : 1.0 + R() * 0.4) * s;
        E.set(0, R() * 6.28, 0);
        Q.setFromEuler(E);
        const c = new THREE.Color().setHSL(0.25 + R() * 0.08, 0.16 + R() * 0.14, 0.2 + R() * 0.12);
        crowns.add(x, z, M.compose(P.set(x + Math.cos(a) * r * s, y + (2.4 + R() * 0.8 + (j ? -0.3 : 0.4)) * s, z + Math.sin(a) * r * s), Q, S.set(cs, cs, cs)), c);
      }
      colliders.push({ x, z, r: 0.35 * s });
      used.push([x, z, 2.2 * s]);
      n++;
    }
    for (const m of trunks.build(trunkGeo, trunkMat, { cast: !0 })) group.add(m);
    for (const m of crowns.build(crownGeo, crownMat, { cast: !0 })) group.add(m);
    stats.trees = n;
  }

  // ---- 山石 ----
  {
    const rv = veg.rocks || { big: 0, small: 0 };
    const mat = toon({ color: 0x8c8a7e, tri: !0, brushK: 0.75, brushScale: 0.45 });
    const variants = [rockGeo(1.3), rockGeo(4.7), rockGeo(9.1)];
    const big = [new Tiles(hf), new Tiles(hf), new Tiles(hf)], small = [new Tiles(hf), new Tiles(hf), new Tiles(hf)];
    let nb = 0, ns = 0;
    const place = (tiles, x, z, s, sy) => {
      E.set(0, R() * 6.28, 0);
      Q.setFromEuler(E);
      tiles[Math.floor(R() * 3)].add(x, z, M.compose(P.set(x, hf.ground(x, z) - 0.15 * s, z), Q, S.set(s, s * sy, s * (0.8 + R() * 0.3))));
    };
    for (let k = 0; k < rv.big * 60 && nb < rv.big; k++) {
      const x = hf.x0 + R() * hf.W, z = hf.z0 + R() * hf.D;
      // 大石多在崖脚
      const cliff = hf.slope(x + 1.5, z) > 1.2 || hf.slope(x - 1.5, z) > 1.2 || hf.slope(x, z + 1.5) > 1.2 || hf.slope(x, z - 1.5) > 1.2;
      if (!cliff && R() < 0.7) continue;
      if (!ok(x, z, { water: 0.8, path: 2.2, slope: 0.5 }) || near(x, z, 2) || inClearing(x, z, 1) || !free(x, z, 1.8)) continue;
      const s = 0.9 + R() * 1.0;
      place(big, x, z, s, 0.7 + R() * 0.4);
      colliders.push({ x, z, r: s * 0.85 });
      used.push([x, z, s]);
      nb++;
    }
    for (let k = 0; k < rv.small * 30 && ns < rv.small; k++) {
      const x = hf.x0 + R() * hf.W, z = hf.z0 + R() * hf.D;
      if (!ok(x, z, { water: -0.5, path: 1.0, slope: 0.7 }) || near(x, z, 0.5)) continue;
      // 大空地（首领场等，半径 ≥ 10）里也不放小石：免得和场景件（石柱）混在一起读不清
      if (clearings.some(([cx, cz, cr]) => cr >= 10 && (cx - x) ** 2 + (cz - z) ** 2 < cr * cr)) continue;
      place(small, x, z, 0.22 + R() * 0.4, 0.6 + R() * 0.5);
      ns++;
    }
    // 急流：河心露出水面的乱石
    for (const r of hf.rivers)
      for (const [z0, z1] of r.rapids || [])
        for (const p of r.path) {
          if (p[1] < z0 || p[1] > z1 || R() < 0.35) continue;
          const w = (p[2] ?? r.width) / 2;
          for (let k = 0; k < 2; k++) {
            const x = p[0] + (R() - 0.5) * w * 1.6, z = p[1] + (R() - 0.5) * 1.5;
            const s = 0.55 + R() * 0.6;
            E.set(0, R() * 6.28, 0);
            Q.setFromEuler(E);
            big[Math.floor(R() * 3)].add(x, z, M.compose(P.set(x, hf.ground(x, z) + r.depth * 0.62 - 0.3, z), Q, S.set(s, s * 0.8, s)));
            nb++;
          }
        }
    big.forEach((t, v) => t.build(variants[v], mat, { cast: !0 }).forEach((m) => group.add(m)));
    small.forEach((t, v) => t.build(variants[v], mat, { cast: !1, lod: 70, thin: !0 }).forEach((m) => group.add(m)));
    stats.rocks = nb + ns;
  }

  // ---- 草丛 ----
  {
    const g1 = new THREE.PlaneGeometry(0.7, 0.55).translate(0, 0.27, 0);
    const geo = upNormals(mergeGeos([g1, g1.clone().rotateY(Math.PI / 2)]));
    const mat = toon({ color: 0xffffff, map: tex.grass, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 0.55] });
    const tiles = new Tiles(hf);
    const want = veg.grass ?? 3000;
    let n = 0;
    for (let k = 0; k < want * 12 && n < want; k++) {
      const x = hf.x0 + R() * hf.W, z = hf.z0 + R() * hf.D;
      if (fbm(x * 0.09, z * 0.09) < 0.52 + R() * 0.12) continue;
      if (!ok(x, z, { water: 0.6, path: 0.9, slope: 0.32 })) continue;
      E.set(0, R() * 6.28, 0);
      Q.setFromEuler(E);
      const s = 0.8 + R() * 0.8;
      tiles.add(x, z, M.compose(P.set(x, hf.ground(x, z) - 0.03, z), Q, S.set(s, s * (0.8 + R() * 0.5), s)));
      n++;
    }
    for (const m of tiles.build(geo, mat, { cast: !1, lod: 75, thin: !0 })) group.add(m);
    stats.grass = n;
  }
  group.userData.stats = stats;
  return group;
}

function addPad(tiles, x, y, z, s, a, R) {
  for (let k = 0; k < 2; k++) {
    E.set((R() - 0.5) * 0.35, a + k * 0.8, (R() - 0.5) * 0.35);
    Q.setFromEuler(E);
    tiles.add(x, z, M.compose(P.set(x, y + k * 0.06, z), Q, S.set(s * (1 - k * 0.2), 1, s * 0.7 * (1 - k * 0.2))));
  }
}
