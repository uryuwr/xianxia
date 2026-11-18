// 环境（精细版，纯程序）：地面（黄土 / 碎石 / 草地按顶点配比过渡 + 接触 AO）、石径、山石（层理 + 节理高度场）、
// 几何草丛、竹丛（竹节 / 竹枝 / "个"字叶）、松、杂树、石灯、碎石子。全部实例化或合并，风动在顶点着色器里。
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { bakeRecipe, canvasTex } from "./texbake.js";
import { GROUND, ROCK, STONE, BARK, BAMBOO as BAMBOO_R } from "./recipes.js";
import { GB, V, boxUV, chamferBox, sweep, merge, setAO, cylUVm, grassClump, orientTris } from "./geo.js";
import { rng, fbm, vnoise } from "../../../src/render/glsl.js";
import { TEMPLE, LANTERNS, ROCKS, BAMBOO, PINE, TREE, HERO, BOSS, groundH, pathX, pathDist, templeDist } from "./layout.js";

// ---- JS 三维值噪声（山石造型用） ----
function h3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => h3(ix + dx, iy + dy, iz + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm3(x, y, z, o = 4) {
  let a = 0.5, s = 0, t = 0;
  for (let k = 0; k < o; k++) {
    s += a * vn3(x, y, z);
    t += a;
    x = x * 2.03 + 1.7;
    y = y * 2.03 - 2.1;
    z = z * 2.03 + 0.6;
    a *= 0.5;
  }
  return s / t;
}
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 山石：二十面体细分 4 级（5120 面）→ 半径场（大形 fbm + 节理）→ 层理台阶 → 平顶 → 压扁；顶点 AO = 凹度 × 贴地
function rockGeo(seed, detail = 4) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = V();
  // 劈理面：8–11 个随机平面把圆团切成大块面（斧劈皴的"面"），朝上的一个面做成略斜的顶
  const r0 = rng(seed * 131 + 7);
  const planes = [];
  const np = 8 + Math.floor(r0() * 4);
  for (let k = 0; k < np; k++) {
    const a = r0() * Math.PI * 2, el = (r0() - 0.35) * 1.1;
    planes.push([V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize(), 0.62 + r0() * 0.3]);
  }
  planes.push([V((r0() - 0.5) * 0.5, 1, (r0() - 0.5) * 0.5).normalize(), 0.55 + r0() * 0.2]);
  const s = seed * 7.13;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 0.9 + 0.3 * fbm3(v.x * 1.2 + s, v.y * 1.2, v.z * 1.2 - s, 3);
    for (const [n, d] of planes) {
      const c = v.dot(n);
      if (c > 0.05) r = Math.min(r, d / c);
    }
    // 面上的起伏与层理（只轻轻扰动，保住大块面）
    r *= 1 + 0.035 * (fbm3(v.x * 5 + s, v.y * 5, v.z * 5, 2) - 0.5);
    let x = v.x * r, y = v.y * r, z = v.z * r;
    const k = 6.5, q = y * k + 0.5 * fbm3(x * 1.4, 0, z * 1.4 + s, 2);
    y += (Math.round(q) - q) * 0.018;
    p.setXYZ(i, x, Math.max(y, -0.35), z);
  }
  g.deleteAttribute("uv");
  const welded = weld(g);
  welded.computeVertexNormals();
  // 顶点 AO：与相邻均值比较的凹度 + 底部接地
  const pp = welded.attributes.position, idx = welded.index.array;
  const sum = new Float32Array(pp.count * 3), cnt = new Float32Array(pp.count);
  for (let t = 0; t < idx.length; t += 3)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        if (a === b) continue;
        const i = idx[t + a], j = idx[t + b];
        sum[i * 3] += pp.getX(j);
        sum[i * 3 + 1] += pp.getY(j);
        sum[i * 3 + 2] += pp.getZ(j);
        cnt[i]++;
      }
  const nn = welded.attributes.normal;
  setAO(welded, (vv, i) => {
    const mx = sum[i * 3] / cnt[i] - vv.x, my = sum[i * 3 + 1] / cnt[i] - vv.y, mz = sum[i * 3 + 2] / cnt[i] - vv.z;
    const conc = (mx * nn.getX(i) + my * nn.getY(i) + mz * nn.getZ(i)) * 40; // > 0 凹
    return Math.max(0.35, Math.min(1, 1 - conc * 0.6)) * (0.55 + 0.45 * sm(-0.35, 0.05, vv.y));
  });
  return welded;
}
function weld(g) {
  const p = g.attributes.position;
  const map = new Map(), idx = [], pos = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e4) + "," + Math.round(p.getY(i) * 1e4) + "," + Math.round(p.getZ(i) * 1e4);
    let j = map.get(k);
    if (j === undefined) map.set(k, (j = pos.length / 3)), pos.push(p.getX(i), p.getY(i), p.getZ(i));
    idx.push(j);
  }
  if (g.index) {
    const gi = g.index.array;
    const out = [];
    for (let t = 0; t < gi.length; t++) out.push(idx[gi[t]]);
    idx.length = 0;
    idx.push(...out);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  o.setIndex(idx);
  return o;
}

// 不等距地面网格：中心 34 米内 0.25 米一格，向外渐疏到 2 米（64 米见方，画面边缘不露底）
function axisSamples() {
  const xs = [0];
  let x = 0;
  while (x < 32) {
    const step = x < 15 ? 0.25 : Math.min(2, 0.25 + (x - 15) * 0.18);
    x += step;
    xs.push(Math.min(32, x));
  }
  return [...xs.slice(1).reverse().map((v) => -v), ...xs];
}

export function buildEnv(renderer, looks) {
  const R = rng(202);
  const g = new THREE.Group();
  g.name = "new-env";
  const T = {
    ground: bakeRecipe(renderer, GROUND),
    rock: bakeRecipe(renderer, ROCK),
    stone: looks.cache.get("stone") ? looks.cache.get("stone").A.userData.look.tex : bakeRecipe(renderer, STONE),
    bark: bakeRecipe(renderer, BARK),
    bamboo: bakeRecipe(renderer, BAMBOO_R),
  };
  const L = {
    ground: { key: "ground", tex: T.ground, ground: !0, vao: !0, nrm: 1.2, brushS: 0.25, brushK: 0.4, inkK: 0.3 },
    rock: { key: "rock", tex: T.rock, trip: 3.0, vao: !0, nrm: 1.3, weather: { moss: 0.3, dirt: 0.4, dirtY: 0.15 }, brushS: 0.45, brushK: 0.7, inkK: 0.4, aoK: 1 },
    slab: { key: "slab", tex: T.stone, uvOff: !0, vao: !0, color: 0xf0ede4 },
    lantern: { key: "lantern", tex: T.stone, vao: !0, weather: { moss: 0.6, streak: 0.6, dirt: 0.5, dirtY: 0 } },
    grass: { key: "grass", color: 0xffffff, vertexColors: !0, side: THREE.DoubleSide, wind: [0.07, 0.5] },
    bark: { key: "bark", tex: T.bark, vao: !0, weather: { moss: 0.5 }, wind: [0.03, 9] },
    culm: { key: "culm", tex: T.bamboo, wind: [0.35, 8], vao: !0 },
    bleaf: { key: "bleaf", color: 0xffffff, side: THREE.DoubleSide, wind: [0.12, 1], windConst: !0 },
    pine: null,
    tleaf: null,
    pebble: { key: "pebble", tex: T.rock, trip: 1.0, color: 0xd8d4c8 },
  };
  const add = (geo, look, o = {}) => {
    const m = o.inst || new THREE.Mesh(geo, null);
    looks.use(m, look);
    m.castShadow = o.cast ?? !0;
    m.receiveShadow = !0;
    if (o.name) m.name = o.name;
    g.add(m);
    return m;
  };
  const instM = (geo, mats, look, o = {}) => {
    const m = new THREE.InstancedMesh(geo, null, mats.length);
    mats.forEach((mm, i) => m.setMatrixAt(i, mm));
    if (o.colors) o.colors.forEach((c, i) => m.setColorAt(i, c));
    if (o.budget) m.userData.budget = o.budget; // 游戏预算档：实例数按比例截断（实例顺序本身是随机的，截断后仍均匀）
    if (o.uvOff) {
      const off = new Float32Array(mats.length * 2).map(() => R() * 4);
      geo.setAttribute("aUvOff", new THREE.InstancedBufferAttribute(off, 2));
    }
    m.computeBoundingSphere();
    return add(null, look, { ...o, inst: m });
  };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = V(), P = V();
  const mat4 = (x, y, z, rx, ry, rz, sx_, sy_, sz_) => M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx_, sy_ ?? sx_, sz_ ?? sx_)).clone();
  const stats = {};

  // ---- 遮挡体（地面接触 AO 用）----
  const occ = [];
  for (const [x, z, s] of ROCKS) occ.push({ x, z, r: s * 0.95, k: 0.6 });
  occ.push({ x: PINE.x, z: PINE.z, r: 0.45, k: 0.5 }, { x: TREE.x, z: TREE.z, r: 0.4, k: 0.5 });
  for (const [x, z] of LANTERNS) occ.push({ x, z, r: 0.35, k: 0.5 });

  // ===== 地面 =====
  {
    const xs = axisSamples();
    const n = xs.length;
    const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), spl = new Float32Array(n * n * 3), ao = new Float32Array(n * n);
    const TX = TEMPLE.x, TZ = TEMPLE.z;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = xs[i], z = xs[j], k = j * n + i;
        const y = groundH(x, z);
        pos.set([x, y, z], k * 3);
        uv.set([x, -z], k * 2);
        const td = templeDist(x, z), pd = pathDist(x, z);
        // 配比：草地按噪声成片；庙基周围一圈碎石散水；路上踩实无草
        let grass = sm(0.44, 0.6, fbm(x * 0.11 + 4, z * 0.11 - 2, 4) + 0.12 * (vnoise(x * 0.9, z * 0.9) - 0.5));
        let gravel = sm(0.5, 0.68, fbm(x * 0.2 - 7, z * 0.2 + 3, 3));
        const apron = 1 - sm(0.2, 1.6, td);
        gravel = Math.max(gravel, apron);
        grass *= sm(0.4, 2.2, td) * sm(0.7, 1.6, pd);
        for (const o of occ) {
          const d = Math.hypot(x - o.x, z - o.z) - o.r;
          gravel = Math.max(gravel, (1 - sm(0, 0.8, d)) * 0.8);
        }
        const path = 1 - sm(0.6, 1.3, pd);
        gravel *= 1 - path * 0.6;
        // 滴水线：檐口正下方的一圈湿痕（檐口平面 ≈ 台基外 0.5 米）
        const eave = Math.max(Math.abs(x - TX) - 5.2, Math.abs(z - TZ) - 3.76);
        const wet = Math.exp(-((eave - 0.0) ** 2) / 0.05) * 0.8 + path * 0.35;
        spl.set([gravel, grass, wet], k * 3);
        // 接触 AO：台基、檐下（天光被挡）、山石 / 树 / 石灯
        let a = 1;
        a *= 1 - 0.45 * Math.exp(-Math.max(0, td - 0.35) / 0.35);
        if (eave < 0 && td > 0.3) a *= 0.82;
        for (const o of occ) {
          const d = Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
          a *= 1 - o.k * Math.exp(-d / (0.25 + o.r * 0.35));
        }
        for (const [cx, cz] of BAMBOO_CLUMPS) a *= 1 - 0.4 * Math.exp(-Math.max(0, Math.hypot(x - cx, z - cz) - 0.5) / 0.6);
        ao[k] = Math.max(0.3, a);
      }
    const idx = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("aSplat", new THREE.BufferAttribute(spl, 3));
    geo.setAttribute("aAO", new THREE.BufferAttribute(ao, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = add(geo, L.ground, { cast: !1, name: "ground" });
    m.userData.grassAt = (x, z) => {
      // 双线性取草配比（种草用）
      const fi = xs.findIndex((v) => v >= x), fj = xs.findIndex((v) => v >= z);
      if (fi < 1 || fj < 1) return 0;
      return spl[(fj * n + fi) * 3 + 1];
    };
    g.userData.grassAt = m.userData.grassAt;
    g.userData.gravelAt = (x, z) => {
      const fi = xs.findIndex((v) => v >= x), fj = xs.findIndex((v) => v >= z);
      if (fi < 1 || fj < 1) return 0;
      return spl[(fj * n + fi) * 3];
    };
  }

  // ===== 石径：不规则石板（4 种形，实例化） =====
  {
    const variants = [];
    for (let v = 0; v < 4; v++) {
      const sh = new THREE.Shape();
      const nv = 11 + v * 2;
      const ax = 1.0 + R() * 0.35, az = 0.75 + R() * 0.2, ph = R() * 6.28;
      for (let k = 0; k < nv; k++) {
        const a = (k / nv) * Math.PI * 2 + (R() - 0.5) * 0.3;
        const r = 0.34 * (1 + 0.18 * Math.sin(a * 2 + ph) + 0.1 * Math.sin(a * 3 + ph * 2)) + (R() - 0.5) * 0.05;
        const px = Math.cos(a) * r * ax, pz = Math.sin(a) * r * az;
        k ? sh.lineTo(px, pz) : sh.moveTo(px, pz);
      }
      sh.closePath();
      const ge = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: !0, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 });
      ge.rotateX(-Math.PI / 2);
      const ng = boxUV(ge.toNonIndexed());
      ng.computeVertexNormals();
      variants.push(setAO(ng, (p) => 0.7 + 0.3 * sm(0.0, 0.12, p.y)));
    }
    const lists = [[], [], [], []];
    for (let z = -0.1; z < 18; z += 0.78 + R() * 0.12) {
      const cx = pathX(z);
      const cols = R() < 0.35 ? [0] : [-0.42, 0.42];
      for (const off of cols) {
        if (R() < 0.08) continue;
        const x = cx + off + (R() - 0.5) * 0.15, zz = z + (R() - 0.5) * 0.15;
        const s = cols.length === 1 ? 1.25 : 0.95 + R() * 0.15;
        lists[Math.floor(R() * 4)].push(mat4(x, groundH(x, zz) - 0.06, zz, (R() - 0.5) * 0.04, R() * 6.28, (R() - 0.5) * 0.04, s, 1, s));
      }
    }
    lists.forEach((l, v) => l.length && instM(variants[v], l, L.slab, { uvOff: !0, cast: !1 }));
    stats.slabs = lists.reduce((a, l) => a + l.length, 0);
  }

  // ===== 山石 =====
  {
    const geos = [];
    let tris = 0;
    for (const [x, z, s, seed, sy, a] of ROCKS) {
      const geo = rockGeo(seed);
      geo.scale(s, s * sy * 1.3, s * 0.9).rotateY(a).translate(x, groundH(x, z) - 0.2 * s, z);
      geos.push(toCreasedNormals(geo, (32 * Math.PI) / 180)); // 劈理面之间保留硬棱（斧劈皴的块面），面内平滑
    }
    const mg = merge(geos);
    add(mg, L.rock, { name: "rocks" });
    stats.rockTris = mg.attributes.position.count / 3;
    // 碎石子
    const pg = new THREE.IcosahedronGeometry(1, 0); // 20 面就够：碎石在 45° 镜头下只有几个像素
    {
      const p = pg.attributes.position, v = V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 0.8 + 0.4 * vn3(v.x * 2 + 3, v.y * 2, v.z * 2);
        p.setXYZ(i, v.x * k, Math.max(v.y * k * 0.6, -0.2), v.z * k);
      }
      pg.computeVertexNormals();
    }
    const pl = [];
    for (let k = 0; k < 2000 && pl.length < 260; k++) {
      const x = (R() - 0.5) * 30, z = (R() - 0.5) * 30;
      if (g.userData.gravelAt(x, z) < 0.55 + R() * 0.3 || pathDist(x, z) < 0.9 || templeDist(x, z) < 0.05) continue;
      const s = 0.04 + R() * R() * 0.14;
      pl.push(mat4(x, groundH(x, z), z, 0, R() * 6.28, 0, s, s, s * (0.7 + R() * 0.6)));
    }
    instM(pg, pl, L.pebble, { cast: !1, budget: 0.5, name: "pebbles" });
  }

  // ===== 草丛（几何草叶，实例化，风动） =====
  {
    const variants = [grassClump(10, 0.5, 1, 0.13), grassClump(14, 0.38, 2, 0.16), grassClump(7, 0.7, 3, 0.1)];
    const lists = [[], [], []], cols = [[], [], []];
    const c = new THREE.Color();
    let n = 0;
    for (let k = 0; k < 30000 && n < 1700; k++) {
      const x = (R() - 0.5) * 40, z = (R() - 0.5) * 38 - 1;
      const ga = g.userData.grassAt(x, z);
      if (ga < 0.25 + R() * 0.5) continue;
      if (Math.hypot(x - HERO.x, z - HERO.z) < 0.6 || Math.hypot(x - BOSS.x, z - BOSS.z) < 2.2) continue;
      const v = Math.floor(R() * 3);
      const s = (0.7 + R() * 0.7) * (0.6 + 0.5 * ga);
      lists[v].push(mat4(x, groundH(x, z) - 0.02, z, (R() - 0.5) * 0.15, R() * 6.28, (R() - 0.5) * 0.15, s, s * (0.8 + R() * 0.5), s));
      // 颜色：石绿 → 赭黄的变化（淡彩）
      c.setHSL(0.2 + R() * 0.08, 0.16 + R() * 0.12, 0.5 + R() * 0.14);
      cols[v].push(c.clone());
      n++;
    }
    // 山石脚下、庙基边缘的一圈密草
    for (const [x0, z0, s0] of ROCKS)
      for (let k = 0; k < 14; k++) {
        const a = R() * 6.28, r = s0 * (0.85 + R() * 0.35);
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        const s = 0.6 + R() * 0.5;
        lists[1].push(mat4(x, groundH(x, z) - 0.02, z, 0, R() * 6.28, 0, s));
        cols[1].push(c.setHSL(0.24 + R() * 0.06, 0.16, 0.42 + R() * 0.1).clone());
        n++;
      }
    lists.forEach((l, v) => instM(variants[v], l, L.grass, { colors: cols[v], cast: !1, budget: 0.5, name: "grass" }));
    stats.grass = n;
  }

  // ===== 竹丛 =====
  {
    const H = 8;
    // 竹竿：16 环 / 米的细分只在节附近（节处外凸 + 节下一圈白粉）
    const culm = (() => {
      const gb = new GB();
      const RAD = 8, NODE = 0.42;
      const ys = [];
      for (let y = 0; y <= H + 1e-6; y += NODE) ys.push(y, Math.min(H, y + 0.03), Math.min(H, y + 0.06));
      ys.sort((a, b) => a - b);
      const rows = [];
      for (const y of ys) {
        const t = y / H, f_ = (y % NODE) / NODE;
        const node = f_ < 0.02 || f_ > 0.98 ? 1.12 : f_ < 0.16 ? 1.04 : 1;
        const r = (0.055 - 0.03 * t) * node;
        const row = [];
        for (let i = 0; i <= RAD; i++) {
          const a = (i / RAD) * Math.PI * 2;
          row.push(gb.vert(V(Math.cos(a) * r, y, Math.sin(a) * r), V(Math.cos(a), 0, Math.sin(a)), a * 0.05, y));
        }
        rows.push(row);
      }
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < RAD; i++) gb.quad(rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]);
      const ge = orientTris(gb.geometry());
      return setAO(ge, (p) => 0.6 + 0.4 * sm(0, 1.2, p.y));
    })();
    // 竹叶：狭长披针形（中脉微折），两面
    const leafGeo = (() => {
      const gb = new GB();
      const Lh = 0.24, W = 0.028;
      const pts = [[0, 0], [W * 0.8, Lh * 0.25], [W, Lh * 0.5], [W * 0.6, Lh * 0.78], [0, Lh]];
      const up = V(0, 1, 0);
      const left = [], right = [], mid = [];
      for (const [w, l] of pts) {
        const sag = -0.05 * (l / Lh) ** 2;
        mid.push(gb.vert(V(0, sag + 0.006, l), up, 0.5, l / Lh));
        left.push(gb.vert(V(-w, sag, l), up, 0, l / Lh));
        right.push(gb.vert(V(w, sag, l), up, 1, l / Lh));
      }
      for (let k = 0; k < pts.length - 1; k++) {
        gb.quad(left[k], left[k + 1], mid[k + 1], mid[k]);
        gb.quad(mid[k], mid[k + 1], right[k + 1], right[k]);
      }
      return gb.geometry();
    })();
    const culms = [], cc = [], leaves = [], lc = [], twigs = [];
    const c = new THREE.Color();
    for (const [cx, cz, nC] of BAMBOO_CLUMPS) {
      for (let k = 0; k < nC; k++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * 0.7;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const s = 0.75 + R() * 0.35;
        const lean = [(R() - 0.5) * 0.12 + (x - cx) * 0.1, (R() - 0.5) * 0.12 + (z - cz) * 0.1 + 0.05];
        const y0 = groundH(x, z) - 0.05;
        culms.push(mat4(x, y0, z, lean[1], 0, -lean[0], 1, s, 1));
        cc.push(c.setHSL(0.27 + R() * 0.05, 0.3, 0.55 + R() * 0.2).clone());
        const top = H * s;
        // 枝叶：上半段每节一簇，"个"字 / "介"字三到五片
        for (let y = top * 0.42; y < top; y += 0.42 * s) {
          const ba = R() * 6.28;
          const bl = 0.3 + R() * 0.5 * (1 - y / top + 0.4);
          const bx = x + lean[0] * y + Math.cos(ba) * bl, bz = z + lean[1] * y + Math.sin(ba) * bl, by = y0 + y + 0.15;
          twigs.push(mat4((x + lean[0] * y + bx) / 2, y0 + y + 0.08, (z + lean[1] * y + bz) / 2, 0, -ba, 1.25, 0.01, bl, 0.01));
          const nl = 3 + Math.floor(R() * 3);
          for (let l = 0; l < nl; l++) {
            const la = ba + (l - nl / 2) * 0.55 + (R() - 0.5) * 0.3;
            const s2 = 0.85 + R() * 0.5;
            leaves.push(mat4(bx, by, bz, 0.5 + R() * 0.6, la + Math.PI / 2, (R() - 0.5) * 0.4, s2 * 1.6));
            lc.push(c.setHSL(0.3 + R() * 0.06, 0.18 + R() * 0.12, 0.32 + R() * 0.14).clone());
          }
        }
      }
    }
    instM(culm, culms, L.culm, { colors: cc, name: "culms" });
    instM(leafGeo, leaves, L.bleaf, { colors: lc, name: "bamboo-leaves" });
    instM(new THREE.CylinderGeometry(1, 1, 1, 4), twigs, L.culm, { cast: !1, name: "bamboo-twigs" }).userData.detail = !0;
    stats.culms = culms.length;
    stats.bambooLeaves = leaves.length;
  }

  // ===== 松（虬干 + 层片状针叶团）、杂树 =====
  {
    const needleTex = canvasTex(256, 256, (ctx, w) => {
      // 一团松针：从中心向外放射的细笔，外缘针尖，深浅两层
      ctx.clearRect(0, 0, w, w);
      ctx.lineCap = "round";
      for (const [r0, tone, n] of [[0.48, 150, 140], [0.36, 205, 90]]) {
        for (let k = 0; k < n; k++) {
          const a = R() * Math.PI * 2, l = w * r0 * (0.6 + 0.4 * R());
          ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
          ctx.lineWidth = 1.2 + R() * 1.4;
          ctx.beginPath();
          ctx.moveTo(w / 2 + Math.cos(a) * l * 0.25, w / 2 + Math.sin(a) * l * 0.18);
          ctx.lineTo(w / 2 + Math.cos(a) * l, w / 2 + Math.sin(a) * l * 0.72);
          ctx.stroke();
        }
      }
    }, "pine_needles");
    const leafTex = canvasTex(256, 256, (ctx, w) => {
      ctx.clearRect(0, 0, w, w);
      for (let k = 0; k < 46; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * w * 0.36;
        const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r;
        const t = 120 + R() * 110;
        ctx.fillStyle = `rgb(${t},${t},${t})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(R() * 6.28);
        ctx.beginPath();
        ctx.ellipse(0, 0, 14 + R() * 6, 6 + R() * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }, "tree_leaves");
    L.pine = { key: "pine", map: needleTex, color: 0x5f8466, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.06, 1], windConst: !0, noMaps: !0 };
    L.tleaf = { key: "tleaf", map: leafTex, color: 0x93a274, alphaTest: 0.45, side: THREE.DoubleSide, wind: [0.08, 1], windConst: !0, noMaps: !0 };
    const tube = (pts, r0, r1, seg = 8) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const path = curve.getPoints(Math.max(4, pts.length * 4));
      const prof = [];
      for (let k = 0; k <= seg; k++) prof.push([Math.cos((k / seg) * 6.283) * 1, Math.sin((k / seg) * 6.283) * 1]);
      return { geo: sweep(path, prof, { scale: (t) => r0 + (r1 - r0) * t, up: V(0.3, 0.1, 1).normalize() }), curve };
    };
    // 松：虬曲主干 + 平展的层枝；针叶团 = 3 层交错的横向卡片
    const bark = [], pads = [], padC = [];
    const c = new THREE.Color();
    {
      const r = rng(77), x = PINE.x, z = PINE.z, y0 = groundH(x, z) - 0.25;
      const pts = [];
      for (let k = 0; k <= 7; k++) {
        const u = k / 7;
        pts.push(V(x + Math.sin(u * 3.1) * 0.6 - u * u * 1.4, y0 + u * 8.2, z + Math.cos(u * 2.3) * 0.35 + u * 0.5));
      }
      const tr = tube(pts, 0.36, 0.12, 10);
      bark.push(tr.geo, new THREE.CylinderGeometry(0.32, 0.6, 0.7, 10).translate(x, y0 + 0.3, z));
      for (let b = 0; b < 8; b++) {
        const u = 0.38 + b * 0.075 + r() * 0.03;
        const base = tr.curve.getPoint(u);
        const a = b * 2.39 + r() * 0.6;
        const len = (2.0 + r() * 1.8) * (1.2 - u * 0.6);
        const bp = [base];
        for (let k = 1; k <= 4; k++) {
          const t = k / 4;
          bp.push(V(base.x + Math.cos(a) * len * t, base.y + Math.sin(t * 2.2) * 0.35 - t * t * 0.3, base.z + Math.sin(a) * len * t + Math.sin(t * 5 + b) * 0.15));
        }
        const br = tube(bp, 0.11 * (1.2 - u * 0.5), 0.03, 6);
        bark.push(br.geo);
        // 枝端与枝上的针叶团（云片状）
        for (let k = 0; k < 3; k++) {
          const p = br.curve.getPoint(0.45 + k * 0.27);
          const sz = (1.3 + r() * 0.7) * (k === 2 ? 1.15 : 0.85);
          for (let l = 0; l < 3; l++) {
            pads.push(mat4(p.x + (r() - 0.5) * 0.3, p.y + 0.1 + l * 0.11, p.z + (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3, sz * (1 - l * 0.22), 1, sz * 0.75 * (1 - l * 0.22)));
            padC.push(c.setHSL(0.36 + r() * 0.05, 0.18 + r() * 0.1, 0.28 + l * 0.08 + r() * 0.06).clone());
          }
        }
      }
      const top = tr.curve.getPoint(1);
      for (let l = 0; l < 4; l++) {
        pads.push(mat4(top.x, top.y + l * 0.13, top.z, 0, r() * 6.28, 0, 1.9 - l * 0.35, 1, 1.5 - l * 0.3));
        padC.push(c.setHSL(0.36, 0.2, 0.3 + l * 0.07).clone());
      }
    }
    // 杂树：Y 形分叉主干 → 三级枝 → 枝端叶团卡片
    const leafCards = [], leafC = [];
    {
      const r = rng(91), x = TREE.x, z = TREE.z, y0 = groundH(x, z) - 0.2;
      const grow = (p0, dir, len, rad, depth) => {
        const pts = [p0];
        for (let k = 1; k <= 3; k++) {
          const t = k / 3;
          pts.push(V().copy(p0).addScaledVector(dir, len * t).add(V((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25)));
        }
        const tb = tube(pts, rad, rad * 0.62, depth === 0 ? 10 : 6);
        bark.push(tb.geo);
        const end = pts[3];
        if (depth >= 2) {
          for (let k = 0; k < 5; k++) {
            const q = tb.curve.getPoint(0.4 + k * 0.15);
            leafCards.push(mat4(q.x + (r() - 0.5) * 0.8, q.y + (r() - 0.2) * 0.6, q.z + (r() - 0.5) * 0.8, r() * 6.28, r() * 6.28, r() * 6.28, 1.0 + r() * 0.6));
            leafC.push(c.setHSL(0.17 + r() * 0.08, 0.22 + r() * 0.15, 0.3 + r() * 0.15).clone());
          }
          return;
        }
        const nb = depth === 0 ? 3 : 3;
        for (let b = 0; b < nb; b++) {
          const a = (b / nb) * 6.28 + r() * 1.2;
          const nd = V(Math.cos(a) * 0.75, 0.75 + r() * 0.3, Math.sin(a) * 0.75).add(V().copy(dir).multiplyScalar(0.4)).normalize();
          grow(end, nd, len * (0.62 + r() * 0.15), rad * 0.6, depth + 1);
        }
      };
      grow(V(x, y0, z), V(0.08, 1, 0.05).normalize(), 2.6, 0.24, 0);
      bark.push(new THREE.CylinderGeometry(0.26, 0.42, 0.5, 10).translate(x, y0 + 0.22, z));
    }
    add(merge(bark.map((b) => setAO(b, (p) => 0.55 + 0.45 * sm(0, 1.5, p.y - groundH(p.x, p.z))))), L.bark, { name: "trees-bark" });
    instM(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pads, L.pine, { colors: padC, name: "pine-pads" });
    instM(new THREE.PlaneGeometry(1.4, 1.4), leafCards, L.tleaf, { colors: leafC, name: "tree-leaves" });
    stats.pinePads = pads.length;
    stats.leafCards = leafCards.length;
  }

  // ===== 石灯（须弥座 + 八角柱 + 灯室（四面开光）+ 攒尖顶 + 宝珠） =====
  {
    const parts = [];
    const lath = (pts, seg = 8) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    for (const [x, z] of LANTERNS) {
      const y = groundH(x, z) - 0.02, ry = R() * 0.1;
      const P = [];
      P.push(chamferBox(0.66, 0.14, 0.66, 0.03).translate(0, 0.07, 0));
      P.push(lath([[0.0, 0.14], [0.28, 0.14], [0.3, 0.2], [0.22, 0.26], [0.2, 0.32], [0.26, 0.36], [0.0, 0.36]], 8));
      P.push(lath([[0.0, 0.36], [0.12, 0.36], [0.11, 0.98], [0.0, 0.98]], 8));
      P.push(lath([[0.0, 0.98], [0.24, 0.98], [0.27, 1.04], [0.2, 1.08], [0.0, 1.08]], 8).rotateY(Math.PI / 8));
      // 灯室：四根小柱 + 中间暗心
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(chamferBox(0.06, 0.3, 0.06, 0.01).translate(a * 0.12, 1.23, b * 0.12));
      P.push(chamferBox(0.17, 0.26, 0.17, 0.01).translate(0, 1.23, 0));
      // 顶：攒尖、檐角微翘
      P.push(lath([[0.0, 1.38], [0.38, 1.38], [0.4, 1.42], [0.25, 1.5], [0.1, 1.66], [0.0, 1.72]], 4).rotateY(Math.PI / 4));
      P.push(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 1.78, 0));
      for (const q of P) parts.push(boxUV((q.index ? q.toNonIndexed() : q).rotateY(ry).translate(x, y, z), [R() * 3, R() * 3]));
    }
    const lg = merge(parts);
    lg.computeVertexNormals();
    add(setAO(lg, (p) => 0.55 + 0.45 * sm(0, 0.4, p.y) * (Math.abs(p.y - 1.23) < 0.12 ? 0.6 : 1)), L.lantern, { name: "lanterns" });
  }
  g.userData.stats = stats;
  return g;
}

// 竹丛中心（x, z, 竿数）
const BAMBOO_CLUMPS = [
  [BAMBOO.x - 1.2, BAMBOO.z + 0.6, 8],
  [BAMBOO.x + 1.8, BAMBOO.z - 0.8, 7],
  [BAMBOO.x - 2.6, BAMBOO.z - 2.2, 6],
  [BAMBOO.x + 0.4, BAMBOO.z + 3.0, 5],
  [BAMBOO.x + 3.6, BAMBOO.z + 1.8, 4],
];
