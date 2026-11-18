// 关卡网格：分块地形、溪流 / 瀑布水带、深潭水面、桥。
// 地形按 32 米分块（视锥裁剪），网格顶点就是高度场的格点；每个格子的对角线顺着高差小的方向切，崖线不出锯齿。
import * as THREE from "three";
import { toon, U } from "../render/materials.js";
import { NOISE, smooth, clamp } from "../render/glsl.js";
import { WATER_VERT, WATER_FRAG } from "./water.js";
import { mergeGeos } from "./vegetation.js";

const CH = 64; // 每块的格数（0.5 米格 → 32 米）
// 崖沿采样：0.75 米和 1.1 米两圈、每圈 16 个方向（近似各向同性，斜向崖线不出锯齿）
const RIM_TAPS = [];
const RIM_QUICK = [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3], [2, 0], [-2, 0], [0, 2], [0, -2]];
for (const r of [3, 4.4]) for (let k = 0; k < 16; k++) RIM_TAPS.push([Math.round(Math.cos((k / 16) * Math.PI * 2) * r), Math.round(Math.sin((k / 16) * Math.PI * 2) * r)]);

// ---------------- 地形 ----------------
// 渲染网格比碰撞网格细一倍（0.25 米）：在高度场上做 Catmull-Rom 双三次插值（夹在相邻四点的高低之间，不过冲），
// 崖线的折角因此圆顺，不出台阶状锯齿；碰撞仍用 0.5 米的高度场。
function upsample(hf, k = 2) {
  const { nx, nz, groundG: G } = hf;
  const rx = (nx - 1) * k + 1, rz = (nz - 1) * k + 1;
  const out = new Float32Array(rx * rz);
  const at = (ix, iz) => G[clamp(iz, 0, nz - 1) * nx + clamp(ix, 0, nx - 1)];
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const col = new Float32Array(4);
  for (let jz = 0; jz < rz; jz++) {
    const iz = Math.min(nz - 2, Math.floor(jz / k)), tz = jz / k - iz;
    for (let jx = 0; jx < rx; jx++) {
      const ix = Math.min(nx - 2, Math.floor(jx / k)), tx = jx / k - ix;
      if (tx === 0 && tz === 0) {
        out[jz * rx + jx] = at(ix, iz);
        continue;
      }
      for (let m = -1; m <= 2; m++) col[m + 1] = cr(at(ix - 1, iz + m), at(ix, iz + m), at(ix + 1, iz + m), at(ix + 2, iz + m), tx);
      let h = cr(col[0], col[1], col[2], col[3], tz);
      const a = at(ix, iz), b = at(ix + 1, iz), c = at(ix, iz + 1), d = at(ix + 1, iz + 1);
      h = clamp(h, Math.min(a, b, c, d), Math.max(a, b, c, d));
      out[jz * rx + jx] = h;
    }
  }
  return { H: out, rx, rz, cell: hf.cell / k };
}

export function buildTerrainChunks(hf, palette = {}) {
  const group = new THREE.Group();
  group.name = "terrain";
  const mat = toon({ terrain: !0, topColor: palette.top ?? 0xd4d0bc, faceColor: palette.face ?? 0x6e675c, mossColor: palette.moss ?? 0x9cbb86 });
  // 顶点数据只与高度场有关：算一次缓存在高度场上，重建关卡时只重新上传
  for (const c of (hf._chunks ||= terrainData(hf))) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(c.pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(c.nor, 3));
    geo.setAttribute("aRim", new THREE.BufferAttribute(c.rim, 1));
    geo.setIndex(new THREE.BufferAttribute(c.idx, 1));
    geo.boundingSphere = c.sphere.clone();
    geo.boundingBox = c.box.clone();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = !0;
    m.name = "terrain-chunk";
    group.add(m);
  }
  return group;
}
function terrainData(hf) {
  const chunks = [];
  const { H: G, rx: nx, rz: nz, cell } = upsample(hf, 2);
  const CHR = CH * 2;
  const at = (ix, iz) => G[clamp(iz, 0, nz - 1) * nx + clamp(ix, 0, nx - 1)];
  for (let cz = 0; cz < nz - 1; cz += CHR)
    for (let cx = 0; cx < nx - 1; cx += CHR) {
      const ex = Math.min(nx - 1, cx + CHR), ez = Math.min(nz - 1, cz + CHR);
      const w = ex - cx + 1, d = ez - cz + 1;
      let hmax = -1e9;
      for (let iz = cz; iz <= ez; iz += 2) for (let ix = cx; ix <= ex; ix += 2) hmax = Math.max(hmax, at(ix, iz));
      if (hmax < -22) continue; // 整块都在云海里
      const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), rim = new Float32Array(w * d);
      let k = 0;
      for (let iz = cz; iz <= ez; iz++)
        for (let ix = cx; ix <= ex; ix++, k++) {
          const h = at(ix, iz);
          pos[k * 3] = hf.x0 + ix * cell;
          pos[k * 3 + 1] = h;
          pos[k * 3 + 2] = hf.z0 + iz * cell;
          const gx = (at(ix + 1, iz) - at(ix - 1, iz)) / (2 * cell), gz = (at(ix, iz + 1) - at(ix, iz - 1)) / (2 * cell);
          const l = Math.hypot(gx, 1, gz);
          nor[k * 3] = -gx / l;
          nor[k * 3 + 1] = 1 / l;
          nor[k * 3 + 2] = -gz / l;
          // 崖沿：自身平坦、0.5~1 米内有大落差 → 浓墨勾边
          let drop = 0;
          for (const [ox, oz] of RIM_QUICK) drop = Math.max(drop, Math.abs(h - at(ix + ox, iz + oz)));
          if (drop > 0.6) {
            drop = 0;
            for (const [ox, oz] of RIM_TAPS) drop = Math.max(drop, h - at(ix + ox, iz + oz));
          } else drop = 0;
          rim[k] = smooth(0.9, 2.2, drop) * smooth(0.55, 0.85, 1 / l);
        }
      const idx = new Uint32Array((w - 1) * (d - 1) * 6);
      let q = 0;
      for (let iz = 0; iz < d - 1; iz++)
        for (let ix = 0; ix < w - 1; ix++) {
          const a = iz * w + ix, b = a + 1, c = a + w, e = c + 1;
          // 沿高差较小的对角线切分
          if (Math.abs(pos[a * 3 + 1] - pos[e * 3 + 1]) <= Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) idx.set([a, c, e, a, e, b], q);
          else idx.set([a, c, b, b, c, e], q);
          q += 6;
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      chunks.push({ pos, nor, rim, idx, sphere: geo.boundingSphere, box: geo.boundingBox });
    }
  return chunks;
}

// ---------------- 水 ----------------
// 关卡的水用同一套"宣纸上的水"着色，加一个随天时变化的亮度 uLight
const RIVER_FRAG = WATER_FRAG.replace("uniform float uTime;", "uniform float uTime;\nuniform vec3 uLight;").replace("gl_FragColor = vec4(c, 1.0);", "gl_FragColor = vec4(c * uLight, 1.0);");
const LAKE_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LAKE_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uLight; uniform vec2 uC, uR;
varying vec3 vW;
${NOISE}
void main(){
  vec2 p = vW.xz;
  float r = length((p - uC) / uR);
  vec3 c = vec3(0.22, 0.38, 0.48) * (0.82 + 0.3 * vnoise(p * 0.08 + uTime * 0.02));
  c = mix(c, vec3(0.12, 0.22, 0.3), smoothstep(0.75, 0.0, r) * 0.45);       // 潭心更深
  // 涟漪：缓慢扩散的同心墨线 + 风纹
  float ring = fract(r * 7.0 - uTime * 0.08 + vnoise(p * 0.15) * 0.6);
  float ripple = smoothstep(0.06, 0.0, abs(ring - 0.5) - 0.44) * smoothstep(0.3, 0.7, vnoise(p * 0.21 + uTime * 0.05));
  c = mix(c, vec3(0.85, 0.92, 0.95), ripple * 0.55);
  float wind = smoothstep(0.62, 0.8, fbm(vec2(p.x * 0.12 + uTime * 0.05, p.y * 0.5)));
  c = mix(c, vec3(0.75, 0.86, 0.9), wind * 0.3);
  gl_FragColor = vec4(c * uLight, 1.0);
}`;

export function buildWaterLevel(hf, uLight) {
  const group = new THREE.Group();
  group.name = "water";
  const foams = [];
  const riverMat = new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: RIVER_FRAG, uniforms: { uTime: U.uTime, uLight }, side: THREE.DoubleSide });
  const lakeAt = (x, z) => hf.lakes.find((L) => Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz) < 0.95);
  for (const r of hf.rivers) {
    const pts = r.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, !1, "centripetal");
    const len = curve.getLength(), ds = 0.25, N = Math.ceil(len / ds);
    const sp = curve.getSpacedPoints(N);
    const widthAt = (p) => {
      // 最近的路径点的宽度
      let best = 1e9, w = r.width;
      for (const q of r.path) {
        const d = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2;
        if (d < best) (best = d), (w = q[2] ?? r.width);
      }
      return w;
    };
    const surf = Math.min(r.depth * 0.62, r.depth - 0.22);
    const ys = [];
    let y = 0, vy = 0;
    for (let i = 0; i <= N; i++) {
      const g = hf.ground(sp[i].x, sp[i].z) + surf;
      if (i === 0) y = g;
      else {
        vy += 3.0 * ds;
        const free = y - vy * ds;
        if (free <= g) (y = g), (vy = 0.05);
        else y = free;
      }
      ys.push(y);
    }
    const pos = [], uv = [], steep = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = sp[i], t = curve.getTangentAt(Math.min(1, i / N));
      const nx = -t.z, nz = t.x;
      const dy = i > 0 ? (ys[i - 1] - ys[i]) / ds : 0;
      let st = Math.min(1, dy / 2.5);
      if (r.rapids) for (const [z0, z1] of r.rapids) if (p.z > z0 && p.z < z1) st = Math.max(st, 0.62 * smooth(z0, z0 + 4, p.z) * (1 - smooth(z1 - 4, z1, p.z)));
      const w = widthAt(p) / 2 + 0.35;
      for (const s of [-1, 1]) {
        pos.push(p.x + nx * w * s, ys[i], p.z + nz * w * s);
        uv.push(s < 0 ? 0 : 1, i * ds);
        steep.push(st);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      // 瀑布落点：由陡转平
      if (i > 2 && st < 0.2 && (ys[i - 2] - ys[i]) / (2 * ds) > 1.2) {
        const L = lakeAt(p.x, p.z);
        const f = new THREE.Vector3(p.x, L ? L.level + 0.1 : ys[i] + 0.1, p.z);
        if (!foams.some((o) => o.distanceTo(f) < 4)) foams.push(f);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("aSteep", new THREE.Float32BufferAttribute(steep, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, riverMat);
    mesh.name = "river";
    mesh.receiveShadow = !0;
    group.add(mesh);
  }
  for (const L of hf.lakes) {
    const geo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
    geo.scale(L.rx * 1.12, 1, L.rz * 1.12);
    geo.translate(L.x, L.level, L.z);
    const mat = new THREE.ShaderMaterial({
      vertexShader: LAKE_VERT,
      fragmentShader: LAKE_FRAG,
      uniforms: { uTime: U.uTime, uLight, uC: { value: new THREE.Vector2(L.x, L.z) }, uR: { value: new THREE.Vector2(L.rx, L.rz) } },
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = "lake";
    m.receiveShadow = !0;
    group.add(m);
  }
  if (foams.length) group.add(mist(foams));
  group.userData.falls = foams;
  return group;
}

// 瀑布落点的水雾
function mist(foams) {
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; varying float vA; varying vec2 vUv;
      void main(){
        vUv = uv;
        float t = fract(uTime * (0.25 + aSeed.w * 0.2) + aSeed.x);
        vec3 c = instanceMatrix[3].xyz + vec3((aSeed.y - 0.5) * 3.0, t * 1.8, (aSeed.z - 0.5) * 3.0 + 0.8);
        float s = 1.0 + t * 2.0;
        vA = sin(t * 3.14159) * 0.32;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.98), vA * smoothstep(1.0, 0.2, d)); }`,
  });
  const per = 9;
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, foams.length * per);
  const seeds = new Float32Array(m.count * 4);
  const M = new THREE.Matrix4();
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  foams.forEach((p, i) => {
    for (let k = 0; k < per; k++) {
      m.setMatrixAt(i * per + k, M.makeTranslation(p.x, p.y, p.z));
      for (let c = 0; c < 4; c++) seeds[(i * per + k) * 4 + c] = r();
    }
  });
  m.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  m.frustumCulled = !1;
  m.renderOrder = 5;
  m.name = "falls-mist";
  return m;
}

// ---------------- 桥 ----------------
// 石拱桥：桥身截面沿桥轴扫掠，两端厚、中间薄（拱）；两侧矮栏。木桥：木板 + 立柱 + 绳栏。
export function buildBridges(hf) {
  const group = new THREE.Group();
  group.name = "bridges";
  const stone = toon({ color: 0xb4b0a4, tri: !0, brushK: 0.55, brushScale: 0.5 });
  const wood = toon({ color: 0x5c4b3b, tri: !0, brushK: 0.4, brushScale: 1.2 });
  const rope = toon({ color: 0x3a332c });
  for (const b of hf.bridges) {
    const ax = b.a[0], az = b.a[1], bx = b.b[0], bz = b.b[1];
    const len = Math.hypot(bx - ax, bz - az), dirx = (bx - ax) / len, dirz = (bz - az) / len;
    const px = -dirz, pz = dirx; // 桥面横向
    const deck = (t) => b.ha + (b.hb - b.ha) * t + (b.arch ?? 0.6) * Math.sin(Math.PI * t) + 0.15;
    const half = b.width / 2;
    const N = Math.max(8, Math.ceil(len / 0.5));
    const ext = 1.2; // 桥头伸进岸里
    const T = (k) => -ext / len + (k / N) * (1 + (2 * ext) / len);
    if (b.style === "stones") {
      // 踏石：一串压扁的多边形石块，石面贴近水面；只在这里做外观，可站区域由 heightfield 的 b.stones 决定
      const geos = [];
      for (const st of b.stones || []) {
        const g = new THREE.CylinderGeometry(st.r * 0.92, st.r * 1.05, 0.9, 7, 1);
        g.rotateY(st.x * 1.7 + st.z);
        g.scale(1, 1, 0.82 + 0.18 * Math.abs(Math.sin(st.x * 3.1)));
        g.translate(st.x, st.y - 0.45, st.z);
        geos.push(g);
      }
      if (geos.length) {
        const m = new THREE.Mesh(mergeGeos(geos), stone);
        m.castShadow = m.receiveShadow = !0;
        group.add(m);
      }
      continue;
    }
    if (b.style === "wood") {
      const geos = [];
      for (let d = -ext; d < len + ext; d += 0.42) {
        const t = d / len, y = deck(clamp(t, 0, 1));
        const g = new THREE.BoxGeometry(b.width, 0.1, 0.36);
        g.rotateY(Math.atan2(dirx, dirz));
        g.rotateX(0);
        g.translate(ax + dirx * d, y - 0.05, az + dirz * d);
        geos.push(g);
      }
      const posts = [], ropes = [];
      for (let d = 0; d <= len + 0.01; d += len / Math.max(2, Math.round(len / 2.2))) {
        const y = deck(d / len);
        for (const s of [-1, 1]) posts.push(new THREE.CylinderGeometry(0.06, 0.07, 1.2, 5).translate(ax + dirx * d + px * half * s, y + 0.45, az + dirz * d + pz * half * s));
      }
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          pts.push(new THREE.Vector3(ax + dirx * len * t + px * half * s, deck(t) + 0.95 - 0.12 * Math.sin(Math.PI * t * 4) ** 2, az + dirz * len * t + pz * half * s));
        }
        ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.025, 4, !1));
      }
      const m1 = new THREE.Mesh(mergeGeos(geos), wood), m2 = new THREE.Mesh(mergeGeos(posts), wood), m3 = new THREE.Mesh(mergeGeos(ropes), rope);
      for (const m of [m1, m2, m3]) (m.castShadow = m.receiveShadow = !0), group.add(m);
      continue;
    }
    // 石拱桥：截面四角（上左、上右、下右、下左）沿桥轴扫掠
    const pos = [], idx = [];
    for (let k = 0; k <= N; k++) {
      const t = T(k), tc = clamp(t, 0, 1);
      const cx = ax + dirx * len * t, cz = az + dirz * len * t, y = deck(tc);
      const th = 0.45 + 1.6 * (1 - Math.sin(Math.PI * tc)) ** 1.5; // 两端厚，中间薄
      const hw = half + 0.25;
      pos.push(cx - px * hw, y, cz - pz * hw, cx + px * hw, y, cz + pz * hw, cx + px * hw, y - th, cz + pz * hw, cx - px * hw, y - th, cz - pz * hw);
      if (k > 0) {
        const a = (k - 1) * 4, c = k * 4;
        for (let f = 0; f < 4; f++) {
          const f2 = (f + 1) % 4;
          idx.push(a + f, a + f2, c + f, a + f2, c + f2, c + f);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const body = g.toNonIndexed();
    body.computeVertexNormals();
    // 矮栏：两侧连续的石条 + 望柱
    const rails = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < N; k++) {
        const t0 = clamp(k / N, 0, 1), t1 = clamp((k + 1) / N, 0, 1);
        const x0 = ax + dirx * len * t0 + px * (half + 0.1) * s, z0 = az + dirz * len * t0 + pz * (half + 0.1) * s;
        const x1 = ax + dirx * len * t1 + px * (half + 0.1) * s, z1 = az + dirz * len * t1 + pz * (half + 0.1) * s;
        const y0 = deck(t0), y1 = deck(t1);
        const l = Math.hypot(x1 - x0, z1 - z0);
        const rg = new THREE.BoxGeometry(0.2, 0.42, l * 1.04);
        rg.rotateX(-Math.atan2(y1 - y0, l));
        rg.rotateY(Math.atan2(dirx, dirz));
        rg.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.21, (z0 + z1) / 2);
        rails.push(rg);
      }
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const x = ax + dirx * len * t + px * (half + 0.1) * s, z = az + dirz * len * t + pz * (half + 0.1) * s;
        rails.push(new THREE.BoxGeometry(0.26, 0.75, 0.26).translate(x, deck(t) + 0.37, z));
      }
    }
    const m1 = new THREE.Mesh(body, stone), m2 = new THREE.Mesh(mergeGeos(rails), stone);
    for (const m of [m1, m2]) (m.castShadow = m.receiveShadow = !0), group.add(m);
  }
  return group;
}

// 断桥：断涧两岸残留的桥头与垂下的木板（只是景）
export function brokenBridge(hf, a, b) {
  const g = new THREE.Group();
  const wood = toon({ color: 0x4e4034, tri: !0, brushK: 0.4, brushScale: 1.2 });
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  const geos = [];
  for (const [p, sgn] of [[a, 1], [b, -1]]) {
    const y = hf.ground(p[0], p[1]);
    for (let k = 0; k < 5; k++) {
      const d = k * 0.42 * sgn;
      const droop = k > 2 ? (k - 2) * 0.35 : 0;
      const pl = new THREE.BoxGeometry(2.2, 0.09, 0.34);
      pl.rotateX(k > 2 ? sgn * 0.5 : 0);
      pl.rotateY(Math.atan2(dx, dz));
      pl.translate(p[0] + dx * d, y + 0.05 - droop, p[1] + dz * d);
      geos.push(pl);
    }
    for (const s of [-1, 1]) geos.push(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5).translate(p[0] - dz * 1.1 * s, y + 0.6, p[1] + dx * 1.1 * s));
    // 垂下的木板
    for (let k = 0; k < 3; k++) geos.push(new THREE.BoxGeometry(0.34, 1.2, 0.08).translate(p[0] + dx * (2.2 * sgn) + (k - 1) * 0.5 * -dz, y - 1.4 - k * 0.3, p[1] + dz * (2.2 * sgn) + (k - 1) * 0.5 * dx));
  }
  const m = new THREE.Mesh(mergeGeos(geos), wood);
  m.castShadow = m.receiveShadow = !0;
  g.add(m);
  return g;
}
