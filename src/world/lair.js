// 首领巢穴的环境层（青牙狼谷 v2 · 专属环境）：环境叙事散件、遮月的谷内压暗、谷内低雾、谷沿柔雾带、月光斑。
// 规范：散件没有碰撞体（贴地、≤ 0.35 米高，不挡走位和冲撞路线）；透明面片一律不写深度、不投影（docs/性能优化_v1.md §7）；
// 所有动态量走共享 uniform（uVeil、uTime），每帧不 new 对象。
import * as THREE from "three";
import { toon, U } from "../render/materials.js";
import { rng } from "../render/glsl.js";
import { mergeGeos, rockGeo } from "./vegetation.js";
import { PROP_MODELS, loadPropScene, propMat } from "./markers.js";

const tr = (g, x, y, z, ry = 0, rx = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(s, s, s)));
const inPoly = (x, z, poly) => {
  let c = !1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
};
const centroid = (poly) => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);

// ---------------- 散件几何（全部合并成几个网格） ----------------
function boneGeo(R, len = 0.7) {
  const pts = [new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(len * 0.45, 0.12 + R() * 0.08, 0.05), new THREE.Vector3(len, 0.04, 0)];
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 5, 0.035 + R() * 0.015, 4, !1);
  const knob = (x) => new THREE.SphereGeometry(0.06, 5, 4).translate(x, 0.04, 0);
  return mergeGeos([g, knob(0), knob(len)]);
}
function skullGeo(R) {
  // 狼颅：拉长的颅骨 + 吻部 + 两个墨色眼窝（眼窝在另一个网格里）
  const cran = new THREE.SphereGeometry(0.22, 7, 5).scale(1, 0.75, 1.15).translate(0, 0.16, 0);
  const snout = new THREE.CylinderGeometry(0.07, 0.12, 0.38, 6).rotateX(Math.PI / 2).translate(0, 0.1, 0.3);
  const jaw = new THREE.BoxGeometry(0.16, 0.04, 0.3).translate(0, 0.03, 0.22);
  return mergeGeos([cran, snout, jaw]);
}
function antlerGeo(R) {
  const parts = [];
  const main = [new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0.35, 0.12, 0.1), new THREE.Vector3(0.75, 0.08, 0.3), new THREE.Vector3(1.0, 0.05, 0.25)];
  parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(main), 8, 0.045, 4, !1));
  for (const t of [0.3, 0.55, 0.8]) {
    const p = new THREE.CatmullRomCurve3(main).getPoint(t);
    parts.push(new THREE.CylinderGeometry(0.015, 0.03, 0.32, 4).translate(0, 0.16, 0).rotateZ(-0.9 + R() * 0.4).translate(p.x, p.y, p.z));
  }
  return mergeGeos(parts);
}
function strawGeo(R, r = 1.6) {
  // 狼窝草垫：压扁的不规则草饼 + 几根散草
  const pad = new THREE.CylinderGeometry(r, r * 1.1, 0.12, 12, 1).translate(0, 0.06, 0);
  const p = pad.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), w = 0.9 + 0.08 * Math.sin(a * 3 + 1.3) + 0.06 * Math.sin(a * 7 + R());
    p.setX(i, x * w);
    p.setZ(i, z * w);
  }
  const stalks = [];
  for (let k = 0; k < 14; k++) {
    const a = R() * 6.28, d = r * (0.8 + R() * 0.5);
    stalks.push(new THREE.BoxGeometry(0.5 + R() * 0.4, 0.02, 0.03).translate(0, 0.08, 0).rotateY(a + 1.2).translate(Math.cos(a) * d, 0, Math.sin(a) * d));
  }
  pad.computeVertexNormals();
  return mergeGeos([pad, ...stalks]);
}

// 贴地墨渍 / 爪痕 / 血迹：一张共用的程序化贴图（4 格图集），平铺在地面
let decalTex = null;
function decalAtlas() {
  if (decalTex || typeof document === "undefined") return decalTex;
  const S = 128, cv = document.createElement("canvas");
  cv.width = S * 2;
  cv.height = S * 2;
  const g = cv.getContext("2d");
  const R = rng(77);
  // 0：三道爪痕
  g.save();
  g.translate(S * 0.5, S * 0.5);
  g.rotate(-0.5);
  for (let k = -1; k <= 1; k++) {
    g.beginPath();
    g.moveTo(-44, k * 13 - 4);
    g.quadraticCurveTo(0, k * 13 + 6, 46, k * 13 - 2);
    g.lineWidth = 6 - Math.abs(k);
    g.strokeStyle = "rgba(20,18,16,0.95)";
    g.lineCap = "round";
    g.stroke();
  }
  g.restore();
  // 1：干涸的血迹（赭红晕开）
  for (let k = 0; k < 9; k++) {
    const x = S * 1.5 + (R() - 0.5) * 60, y = S * 0.5 + (R() - 0.5) * 50, r = 10 + R() * 26;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, "rgba(70,22,16,0.85)");
    gr.addColorStop(1, "rgba(70,22,16,0)");
    g.fillStyle = gr;
    g.fillRect(S, 0, S, S);
  }
  // 2：墨渍（焦墨晕染）
  for (let k = 0; k < 12; k++) {
    const x = S * 0.5 + (R() - 0.5) * 70, y = S * 1.5 + (R() - 0.5) * 70, r = 8 + R() * 30;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, "rgba(18,18,20,0.8)");
    gr.addColorStop(1, "rgba(18,18,20,0)");
    g.fillStyle = gr;
    g.fillRect(0, S, S, S);
  }
  // 3：拖痕（一道长的淡墨刷痕）
  g.save();
  g.translate(S * 1.5, S * 1.5);
  g.rotate(0.3);
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.moveTo(-56, (R() - 0.5) * 18);
    g.lineTo(56, (R() - 0.5) * 18);
    g.lineWidth = 2 + R() * 4;
    g.strokeStyle = `rgba(30,26,22,${0.25 + R() * 0.3})`;
    g.stroke();
  }
  g.restore();
  decalTex = new THREE.CanvasTexture(cv);
  decalTex.colorSpace = THREE.SRGBColorSpace;
  return decalTex;
}
function decalQuad(x, y, z, size, cell, ry, vertical = !1) {
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.attributes.uv, cx = cell % 2, cy = 1 - Math.floor(cell / 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 2, (cy + uv.getY(i)) / 2);
  if (!vertical) g.rotateX(-Math.PI / 2);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/**
 * 巢穴散件。B = points.boss 原始数据（数组坐标），ground(x, z) 地面高度。
 * 规则：3D 散件只放在"不挡冲撞路线"的位置——狼王石脚下 2.4–4 米、狼窝 2.5 米内、离首领中心 ≥ 10 米的谷边；
 *       贴花（爪痕 / 血迹 / 墨渍 / 拖痕）随意。全部没有碰撞体。
 */
export function lairDressing(B, ground) {
  const R = rng(9137);
  const group = new THREE.Group();
  group.name = "lair_dressing";
  const fence = B.fence, [cx, cz] = B.pos;
  const bones = [], skulls = [], sockets = [], antlers = [], straw = [], decals = [];
  const pillarFree = (x, z) => (B.pillars || []).every((p) => Math.hypot(p.pos[0] - x, p.pos[1] - z) > (p.r ?? 1.2) + 0.8);
  // 摆放记录（美术管线的 glb 散件用）：glb 原点在底面中心，程序化骨头 / 鹿角的原点在一端——记录"中心"的世界位置
  const placed = { bones: [], skulls: [], antlers: [], straw: [] };
  const KIND = new Map([[bones, "bones"], [skulls, "skulls"], [antlers, "antlers"], [straw, "straw"]]);
  const put = (list, geo, x, z, ry, s = 1, dy = 0, glb = null, off = [0, 0]) => {
    list.push(tr(geo, x, ground(x, z) + dy, z, ry, 0, s));
    const c = Math.cos(ry), sn = Math.sin(ry), ox = (off[0] * c + off[1] * sn) * s, oz = (-off[0] * sn + off[1] * c) * s;
    placed[KIND.get(list)].push({ glb, x: x + ox, z: z + oz, ry, s });
  };
  const boneKey = (len) => (len > 0.9 ? "bone_long" : len > 0.62 ? "bone_mid" : len > 0.52 ? "bone_rib" : "bone_short");
  const putBone = (x, z, ry, len, dy = 0) => put(bones, boneGeo(R, len), x, z, ry, 1, dy, boneKey(len), [len / 2, 0]);
  const putSkull = (x, z, ry, s = 1) => put(skulls, skullGeo(R), x, z, ry, s, 0, "wolf_skull");
  const putAntler = (x, z, ry) => put(antlers, antlerGeo(R), x, z, ry, 1, 0, "antler", [0.5, 0.15]);
  // 狼王石：王座下的骨堆（一圈骨头 + 三颗狼颅朝外）
  if (B.perch) {
    const [px, pz] = B.perch, pr = (B.perchR ?? 2.2) + 0.2;
    for (let k = 0; k < 22; k++) {
      const a = R() * 6.28, d = pr + R() * 1.6;
      putBone(px + Math.cos(a) * d, pz + Math.sin(a) * d, R() * 6.28, 0.5 + R() * 0.5, -0.02);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 6.28 + 0.4, d = pr + 0.6;
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      putSkull(x, z, Math.atan2(x - px, z - pz), 0.9 + R() * 0.3);
    }
    for (let k = 0; k < 3; k++) decals.push(decalQuad(px + (R() - 0.5) * 4, ground(px, pz) + 0.03 + k * 0.004, pz + (R() - 0.5) * 4, 2.6 + R(), k === 0 ? 1 : 2, R() * 6.28));
  }
  // 狼窝：草垫 + 骨头 + 狼颅 / 鹿角；窝口一片拖痕
  (B.totems || []).forEach((t, i) => {
    if (!t.den) return;
    const [dx, dz] = t.den;
    const sr = 1.5 + R() * 0.3;
    put(straw, strawGeo(R, sr), dx, dz, R() * 6.28, 1, -0.02, "straw_nest");
    placed.straw[placed.straw.length - 1].s = (sr * 2) / 3.36; // glb 草垫直径约 3.36 米
    for (let k = 0; k < 6; k++) {
      const a = R() * 6.28, d = 1.4 + R() * 1.1;
      putBone(dx + Math.cos(a) * d, dz + Math.sin(a) * d, R() * 6.28, 0.4 + R() * 0.4);
    }
    if (i === 1) putAntler(dx + 1.6, dz - 0.6, R() * 6.28);
    else putSkull(dx + 1.6, dz - 0.6, R() * 6.28);
    decals.push(decalQuad((dx + cx) / 2, ground(dx, dz) + 0.035, (dz + cz) / 2, 4.5, 3, Math.atan2(cx - dx, cz - dz)));
  });
  // 谷边散骨（离中心 ≥ 10 米）与两副被啃过的鹿角
  for (let k = 0, n = 0; k < 400 && n < 26; k++) {
    const x = cx + (R() - 0.5) * 40, z = cz + (R() - 0.5) * 34;
    if (!inPoly(x, z, fence) || Math.hypot(x - cx, z - cz) < 10 || !pillarFree(x, z)) continue;
    if (n % 9 === 4) putAntler(x, z, R() * 6.28);
    else if (n % 7 === 3) putSkull(x, z, R() * 6.28);
    else putBone(x, z, R() * 6.28, 0.4 + R() * 0.5);
    n++;
  }
  // 地上的爪痕、墨渍、干血：中场也可以有（贴地）
  for (let k = 0, n = 0; k < 300 && n < 16; k++) {
    const x = cx + (R() - 0.5) * 34, z = cz + (R() - 0.5) * 28;
    if (!inPoly(x, z, fence)) continue;
    decals.push(decalQuad(x, ground(x, z) + 0.03 + n * 0.002, z, 1.6 + R() * 1.6, n % 3 === 0 ? 0 : n % 3 === 1 ? 2 : 1, R() * 6.28));
    n++;
  }
  // 谷壁爪痕：沿谷边每隔几米、贴着崖面朝谷心的竖向爪痕
  const C = centroid(fence);
  for (let i = 0; i < fence.length; i++) {
    const a = fence[i], b = fence[(i + 1) % fence.length];
    for (const t of [0.35, 0.7]) {
      if (R() < 0.35) continue;
      let x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const ix = C[0] - x, iz = C[1] - z, l = Math.hypot(ix, iz);
      x += (ix / l) * 0.9;
      z += (iz / l) * 0.9;
      decals.push(decalQuad(x, ground(x, z) + 1.4 + R() * 0.8, z, 1.3 + R() * 0.5, 0, Math.atan2(ix, iz), !0));
    }
  }
  const mat = (c) => toon({ color: c, tri: !0, brushK: 0.45, brushScale: 1.1 });
  const meshes = {};
  const add = (key, list, m, cast = !1) => {
    if (!list.length) return;
    const o = new THREE.Mesh(mergeGeos(list), m);
    o.castShadow = cast;
    o.receiveShadow = !0;
    group.add(o);
    meshes[key] = o;
  };
  add("bones", bones, mat(0xd6cfbc));
  add("skulls", skulls, mat(0xe2dccb), !0);
  add("antlers", antlers, mat(0xb8a98c));
  add("straw", straw, toon({ color: 0x857a5c, tri: !0, brushK: 0.8, brushScale: 1.6 }));
  // 美术管线的散件 glb：某类用到的 glb 都在时，把这类的程序化网格换成"glb 按摆放记录烘焙合并"的网格（每种材质一个网格）
  for (const key of Object.keys(placed)) {
    const list = placed[key];
    const need = [...new Set(list.map((q) => q.glb))];
    if (!list.length || !need.every((k) => PROP_MODELS[k])) continue;
    Promise.all(need.map((k) => loadPropScene(k))).then((scenes) => {
      if (scenes.some((x) => !x) || !meshes[key] || !meshes[key].parent) return;
      const byKey = Object.fromEntries(need.map((k, i) => [k, scenes[i]]));
      const parts = {}; // 材质 → [geo]
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
      for (const q of list) {
        const sc = byKey[q.glb];
        sc.updateMatrixWorld(!0);
        M.compose(V.set(q.x, ground(q.x, q.z) - 0.01, q.z), Q.setFromEuler(E.set(0, q.ry, 0)), S.set(q.s, q.s, q.s));
        sc.traverse((o) => {
          if (!o.isMesh) return;
          const name = (o.material && o.material.name) || "bone";
          const mk = name.startsWith("rock_ink") ? "eye" : name.startsWith("straw") ? "straw" : "bone";
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", o.geometry.attributes.position.clone());
          if (o.geometry.attributes.normal) g.setAttribute("normal", o.geometry.attributes.normal.clone());
          if (o.geometry.index) g.setIndex(o.geometry.index.clone());
          g.applyMatrix4(o.matrixWorld).applyMatrix4(M);
          (parts[mk] ||= []).push(g);
        });
      }
      group.remove(meshes[key]);
      meshes[key].geometry.dispose();
      for (const [mk, geos] of Object.entries(parts)) {
        const o = new THREE.Mesh(mergeGeos(geos), mk === "eye" ? new THREE.MeshBasicMaterial({ color: 0x15181b }) : propMat(mk));
        o.castShadow = key === "skulls";
        o.receiveShadow = !0;
        o.name = "lair_glb:" + key + ":" + mk;
        group.add(o);
      }
    });
  }
  // 狼颅的墨色眼窝：每颗颅骨前两个小黑球（跟颅骨同一变换太繁琐，直接用颅骨顶点位置近似：省略，靠描边已经够读）
  if (decals.length) {
    const tex = decalAtlas();
    const m = new THREE.Mesh(mergeGeos(decals), new THREE.MeshBasicMaterial({ map: tex, transparent: !0, depthWrite: !1, polygonOffset: !0, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.renderOrder = 2;
    m.name = "lair_decals";
    group.add(m);
  }
  return group;
}

// ---------------- 遮月：谷内压暗 + 谷内低雾 ----------------
// 一张贴着谷底的"暗幕"（按 fence 多边形三角化、逐顶点贴地），uVeil 0 → 1 时把谷压暗偏冷青；谷外不受影响
export function veilShade(poly, ground, uVeil, sd) {
  // 1 米网格铺满谷地外扩 4 米的范围：每个顶点贴地（崖壁也一起压暗），按到谷沿的有向距离 sd(x, z)（谷内为负）做软边——
  // 谷内满强度，谷沿外 2.5 米淡出到 0，不会出现多边形的硬边
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4, z0 = Math.min(...zs) - 4, z1 = Math.max(...zs) + 4;
  const nx = Math.ceil(x1 - x0) + 1, nz = Math.ceil(z1 - z0) + 1;
  const pos = new Float32Array(nx * nz * 3), mask = new Float32Array(nx * nz), edge = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + i, z = z0 + j, d = sd(x, z);
      pos.set([x, ground(x, z) + 0.08, z], k * 3);
      mask[k] = 1 - Math.min(1, Math.max(0, (d + 1) / 3.5));
      edge[k] = Math.min(1, Math.max(0, 1 - -d / 6)); // 离谷沿 6 米内 → 1，谷心 → 0
    }
  const idx = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (mask[a] + mask[b] + mask[c] + mask[d] > 0) idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aMask", new THREE.BufferAttribute(mask, 1));
  geo.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    side: THREE.DoubleSide, // ShapeGeometry 从 XY 平面翻到 XZ 后三角形朝下，单面会被剔除
    uniforms: { uVeil, uTime: U.uTime },
    vertexShader: /* glsl */ `attribute float aEdge, aMask; varying float vE, vM; varying vec2 vP; void main(){ vE = aEdge; vM = aMask; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uVeil, uTime; varying float vE, vM; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        // 云影：两层慢速移动的噪声；谷边更暗（向内收拢的压迫感）
        float cloud = n(vP * 0.08 + vec2(uTime * 0.05, -uTime * 0.03)) * 0.6 + n(vP * 0.2 - uTime * 0.04) * 0.4;
        float a = uVeil * vM * (0.62 + 0.2 * vE + 0.12 * cloud);
        gl_FragColor = vec4(mix(vec3(1.0), vec3(0.17, 0.25, 0.32), clamp(a, 0.0, 1.0)), 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4;
  m.name = "veil_shade";
  m.frustumCulled = !1;
  return m;
}

// ---------------- 柔雾带（替代"粗黑描边"式的谷沿墨雾） ----------------
// 沿多边形摆一圈大而淡的雾团：雾团中心在谷沿外侧、向外淡出；uCurl 0 → 1 时整体往谷心卷进 curl 米、变浓
export function mistBand(poly, ground, uniforms, opts = {}) {
  const C = centroid(poly);
  const R = rng(311);
  const pts = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / (opts.step ?? 2.4)));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const ix = C[0] - x, iz = C[1] - z, l = Math.hypot(ix, iz) || 1;
      for (let j = 0; j < (opts.layers ?? 2); j++) {
        const out = (opts.out ?? 2.5) * (0.3 + R()); // 雾团中心在谷沿外侧
        pts.push([x - (ix / l) * out, ground(x, z), z - (iz / l) * out, ix / l, iz / l, R(), R(), R()]);
      }
    }
  }
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const aPos = new Float32Array(pts.length * 3), aIn = new Float32Array(pts.length * 2), aSeed = new Float32Array(pts.length * 3);
  pts.forEach((q, i) => {
    aPos.set([q[0], q[1], q[2]], i * 3);
    aIn.set([q[3], q[4]], i * 2);
    aSeed.set([q[5], q[6], q[7]], i * 3);
  });
  geo.setAttribute("aPos", new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute("aIn", new THREE.InstancedBufferAttribute(aIn, 2));
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(aSeed, 3));
  geo.instanceCount = pts.length;
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    uniforms: { uTime: U.uTime, uOn: uniforms.uOn, uCurl: uniforms.uCurl, uCurlDist: { value: opts.curl ?? 3.5 }, uSize: { value: opts.size ?? 7.5 }, uAlpha: { value: opts.alpha ?? 0.32 }, uColor: { value: new THREE.Color(opts.color ?? 0x8a9298) }, uColor2: { value: new THREE.Color(opts.color2 ?? opts.color ?? 0x8a9298) } },
    vertexShader: /* glsl */ `attribute vec3 aPos, aSeed; attribute vec2 aIn; uniform float uTime, uOn, uCurl, uCurlDist, uSize; varying vec2 vUv; varying vec3 vS;
      void main(){
        vUv = uv; vS = aSeed;
        vec3 c = aPos;
        c.xz += aIn * (uCurl * uCurlDist * (0.6 + aSeed.x * 0.8) + sin(uTime * 0.25 + aSeed.y * 6.28) * 0.6);
        c.y += mix(-2.5, 0.9 + aSeed.z * 0.8, uOn);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(uSize * 1.3, uSize * 0.7) * (0.7 + aSeed.x * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform float uTime, uOn, uCurl, uAlpha; uniform vec3 uColor, uColor2; varying vec2 vUv; varying vec3 vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv - 0.5;
        float body = smoothstep(0.5, 0.0, length(p * vec2(1.0, 1.6)));      // 很软的椭圆团，没有硬边
        float k = n(vUv * 3.0 + vS.xy * 9.0 + vec2(uTime * 0.04, -uTime * 0.03)) * 0.7 + n(vUv * 7.0 - uTime * 0.05) * 0.3;
        float a = body * body * smoothstep(0.25, 0.75, k) * uAlpha * uOn * (1.0 + uCurl * 0.8);
        gl_FragColor = vec4(mix(uColor, uColor2, uCurl), a); // 平时是宣纸色的雾气（把崖沿的墨线晕开），雾浓时转成墨雾
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = !1;
  m.renderOrder = 6;
  m.name = "mist_band";
  return m;
}

// ---------------- 月光斑：冷色柔边的地面提亮 + 淡光柱 + 飘浮微尘 ----------------
export function moonSpot(r, uniforms) {
  const g = new THREE.Group();
  g.name = "moon_spot";
  const common = { transparent: !0, depthWrite: !1, blending: THREE.AdditiveBlending };
  // 地面：径向柔边 + 斑驳（云影透下来的月光不是均匀的）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(r * 1.25, 40).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: !0,
      depthWrite: !1, // 普通混合：在压暗的谷底上"挖"出一片冷青的月光，而不是加色发白
      uniforms: { uK: uniforms.uK, uTime: U.uTime },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uK, uTime; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          float d = length(vP) / ${(r * 1.25).toFixed(2)};
          float core = smoothstep(1.0, 0.2, d);
          float mottle = 0.75 + 0.25 * n(vP * 0.9 + uTime * 0.06);
          gl_FragColor = vec4(0.60, 0.78, 0.90, core * mottle * 0.45 * uK);
        }`,
    }),
  );
  ground.position.y = 0.07;
  ground.renderOrder = 5;
  // 光柱：上细下粗的开口圆台，竖向淡出、边缘淡出
  const H = 10;
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.95, H, 24, 1, !0).translate(0, H / 2, 0),
    new THREE.ShaderMaterial({
      ...common,
      side: THREE.DoubleSide,
      uniforms: { uK: uniforms.uK, uTime: U.uTime },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uK, uTime; varying vec2 vUv; varying vec3 vN, vV;
        void main(){
          float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);         // 边缘淡出：正对镜头的面几乎透明
          float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
          float streak = 0.75 + 0.25 * sin(vUv.x * 40.0 + uTime * 0.6);
          gl_FragColor = vec4(vec3(0.20, 0.32, 0.42) * (1.0 - rim) * fade * streak * 0.22 * uK, 1.0);
        }`,
    }),
  );
  col.renderOrder = 7;
  // 微尘：40 粒，在光柱里缓慢上浮、明灭
  const N = 40, P = new Float32Array(N * 3), S = new Float32Array(N);
  const R = rng(5150);
  for (let i = 0; i < N; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * r * 0.8;
    P.set([Math.cos(a) * d, R() * 6, Math.sin(a) * d], i * 3);
    S[i] = R();
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(P, 3));
  pg.setAttribute("aS", new THREE.BufferAttribute(S, 1));
  const dust = new THREE.Points(
    pg,
    new THREE.ShaderMaterial({
      ...common,
      uniforms: { uK: uniforms.uK, uTime: U.uTime },
      vertexShader: /* glsl */ `attribute float aS; uniform float uTime; varying float vA;
        void main(){
          vec3 p = position; p.y = mod(p.y + uTime * (0.25 + aS * 0.3), 6.0) + 0.2; p.x += sin(uTime * 0.5 + aS * 20.0) * 0.25;
          vA = (0.5 + 0.5 * sin(uTime * (1.0 + aS * 2.0) + aS * 30.0)) * smoothstep(6.2, 3.0, p.y);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.0 + aS * 2.5) * (110.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform float uK; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.55, 0.72, 0.85) * smoothstep(0.5, 0.0, d) * vA * 0.8 * uK, 1.0); }`,
    }),
  );
  dust.renderOrder = 8;
  dust.frustumCulled = !1;
  g.add(ground, col, dust);
  for (const o of g.children) o.castShadow = o.receiveShadow = !1;
  return g;
}

// 谷内低雾：在谷底随机撒一些贴地的淡雾团（遮月后才显出）
export function pitMist(poly, ground, uniforms, n = 28) {
  const R = rng(733);
  const C = centroid(poly);
  const pts = [];
  for (let k = 0; k < 400 && pts.length < n; k++) {
    const x = C[0] + (R() - 0.5) * 44, z = C[1] + (R() - 0.5) * 36;
    if (inPoly(x, z, poly)) pts.push([x, z]);
  }
  // 复用柔雾带的着色器：把每个点当成一段长度为 0 的"边"
  return mistBand(
    pts.flatMap(([x, z]) => [[x, z]]),
    ground,
    { uOn: uniforms.uOn, uCurl: { value: 0 } },
    { step: 99, layers: 1, out: 0, size: 6, alpha: 0.3, color: 0x16222a },
  );
}
