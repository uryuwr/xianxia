// 写意留白 v1 · 头部 / 衣袍的"减笔"外观（美术管线 art-char，2026-11-18）
//   不跑 Blender：只换 hero_v2.glb 的脸 / 衣袍材质，外加一顶斗笠幂篱（程序化几何，挂在 head 骨上）。
//   V0 现状 v2（画上去的五官，对照）；V1 两笔眉眼；V2 无五官留白；V3 泼墨写意（V2 + 衣袍水墨晕染、飞白、毛边）；V4 斗笠幂篱遮面。
//   脸部笔触：tools/icons/inkicons.js 的位图毛笔（提按、出锋、飞白、洇）画在一张"脸部正面投影"贴图上，着色器按绑定姿势的物体坐标投影取样。
import * as THREE from "three";
import { toonGradient } from "../../../src/render/materials.js";
import { TEMPLATES, renderCanvas } from "../../icons/inkicons.js";

// ---------------- 脸部正面投影（glTF 物体坐标，面朝 +Z、Y 向上；眼在 y 1.60、x ±0.034）----------------
const FACE = { x0: -0.1, y0: 1.5, size: 0.2 }; // 贴图覆盖 x ∈ [-0.1, 0.1]、y ∈ [1.5, 1.7]
const PX = 512;
const fx = (x) => PX / 2 + (x / FACE.size) * PX;
const fy = (y) => PX / 2 - ((y - (FACE.y0 + FACE.size / 2)) / FACE.size) * PX;
const P = (x, y) => [fx(x), fy(y)];

// V1：两道眉（起笔顿、收笔出锋，外端略扬）+ 两点眼（一笔短横，两头尖）
TEMPLATES.xy_face_v1 = () => {
  const ops = [];
  for (const s of [1, -1]) {
    ops.push({ s: [P(0.011 * s, 1.621), P(0.031 * s, 1.627), P(0.054 * s, 1.632)], w: 13, c: "#15181b", op: 0.95, press: 1.35, head: 0.12, taper: 0.45, tail: 0.06, dry: 0.35, rough: 0.12, seed: s > 0 ? 11 : 17 });
    ops.push({ s: [P(0.023 * s, 1.5985), P(0.034 * s, 1.5995), P(0.045 * s, 1.5975)], w: 7.5, c: "#15181b", op: 0.92, both: 0.5, tail: 0.1, dry: 0.15, rough: 0.08, seed: s > 0 ? 23 : 29 });
  }
  return ops;
};

const _decals = {};
function faceDecal(v) {
  if (_decals[v] !== undefined) return _decals[v];
  let tex = null;
  if (v === "V1") {
    const cv = renderCanvas(["xy_face_v1", {}], PX, PX, 1, { grain: true });
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  }
  return (_decals[v] = tex);
}

let _grad = {};
function grad(lo) {
  if (!_grad[lo]) {
    const g = new THREE.DataTexture(new Uint8Array([lo, 255]), 2, 1, THREE.RedFormat);
    g.minFilter = g.magFilter = THREE.NearestFilter;
    g.generateMipmaps = !1;
    g.needsUpdate = !0;
    _grad[lo] = g;
  }
  return _grad[lo];
}

const POS_VERT = (sh) =>
  sh.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vJxP;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvJxP = position;");

// 脸：纸白淡赭，几乎不分明暗（两阶 222 / 255），V1 叠笔触贴图
const _faceMats = {};
const FACE_COLOR = 0xf1e5cf;
let FIT = null; // 脸面拟合系数（flatPositions 算出，黑瞳面也按它拉平）
function faceMaterial(v) {
  if (_faceMats[v]) return _faceMats[v];
  const decal = faceDecal(v);
  const m = new THREE.MeshBasicMaterial({ color: FACE_COLOR, side: THREE.DoubleSide });
  const U = { tDecal: { value: decal }, uHasDecal: { value: decal ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = POS_VERT(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vJxP;\nuniform sampler2D tDecal;\nuniform float uHasDecal;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // 颈、耳后、脸侧略带一点赭色（没骨淡彩的"晕"），脸前留白
  float front = smoothstep(0.0, 0.08, vJxP.z) * (1.0 - 0.5 * smoothstep(0.03, 0.075, abs(vJxP.x)));
  diffuseColor.rgb = mix(vec3(0.78, 0.66, 0.53), diffuseColor.rgb, 0.45 + 0.55 * front);
  if (uHasDecal > 0.5 && vJxP.y > 1.45) {
    vec2 uv = vec2((vJxP.x - (${FACE.x0.toFixed(3)})) / ${FACE.size.toFixed(3)}, (vJxP.y - ${FACE.y0.toFixed(3)}) / ${FACE.size.toFixed(3)});
    vec4 d = texture2D(tDecal, uv);
    float k = d.a * smoothstep(0.04, 0.075, vJxP.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, k);
  }
}`,
      );
  };
  m.customProgramCacheKey = () => "xy-face";
  m.name = "skin";
  return (_faceMats[v] = m);
}

// ---------------- 泼墨衣袍：大块浓淡晕染 + 飞白 + 轮廓处积墨 + 毛边 ----------------
const NOISE = /* glsl */ `
float jxH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float jxN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(jxH(i), jxH(i + vec3(1,0,0)), f.x), mix(jxH(i + vec3(0,1,0)), jxH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(jxH(i + vec3(0,0,1)), jxH(i + vec3(1,0,1)), f.x), mix(jxH(i + vec3(0,1,1)), jxH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float jxF(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * jxN(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;
const _wash = {};
// kind: robe（外袍）/ inner（中衣）/ sash（腰封、靴）
function washMaterial(kind) {
  if (_wash[kind]) return _wash[kind];
  const amt = { robe: 0.9, inner: 0.55, sash: 1.0 }[kind];
  const base = { robe: 0.0, inner: 0.05, sash: 0.75 }[kind];
  const m = new THREE.MeshToonMaterial({ color: 0xf3eee2, gradientMap: grad(200), side: THREE.DoubleSide });
  const U = { uAmt: { value: amt }, uBase: { value: base } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = POS_VERT(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vJxP;\nuniform float uAmt, uBase;\n" + NOISE)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  vec3 P = vJxP;
  float n1 = jxF(P * vec3(3.2, 1.1, 3.2));                       // 大块晕染（竖向拉长 = 顺衣纹）
  float n2 = jxF(P * vec3(7.0, 2.2, 7.0) + 5.0);                  // 浓淡
  float rim = 1.0 - abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0)));
  // 上浅下浓：肩背留白、腰下大块积墨；外轮廓处墨更重
  float body = smoothstep(0.42, 0.56, n1 + 0.16 + 0.3 * (1.0 - smoothstep(0.35, 1.25, P.y)) - 0.24 * smoothstep(1.0, 1.38, P.y));
  float dark = clamp(max(uBase, body + pow(rim, 2.0) * 0.7), 0.0, 1.0);
  float dry = smoothstep(0.56, 0.74, jxF(vec3(P.x * 24.0, P.y * 2.5, P.z * 24.0)));   // 飞白：顺笔方向的断续留白
  dark *= 1.0 - dry * 0.35 * smoothstep(0.25, 0.8, dark);
  vec3 inkc = mix(vec3(0.16, 0.16, 0.16), vec3(0.025, 0.028, 0.032), smoothstep(0.38, 0.62, n2));
  diffuseColor.rgb = mix(vec3(0.955, 0.94, 0.9), inkc, dark * uAmt);
  if (rim > 0.78 && jxF(P * 38.0) > 0.56 + 0.2 * (1.0 - rim)) discard;   // 毛边：轮廓处不收干净
}`,
      );
  };
  m.customProgramCacheKey = () => "xy-wash";
  m.name = "wash_" + kind;
  return (_wash[kind] = m);
}

// 留白各版的白袍：两阶平涂（暗面 80%），不读法线 / 墨贴图，袍子是一整块干净的纸白
const _cloth = {};
function clothMaterial(color) {
  if (!_cloth[color]) {
    _cloth[color] = new THREE.MeshToonMaterial({ color, gradientMap: grad(205), side: THREE.DoubleSide });
    _cloth[color].name = "cloth";
  }
  return _cloth[color];
}

// ---------------- 斗笠 + 幂篱 ----------------
function strawTex() {
  const c = document.createElement("canvas");
  c.width = 512, c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#cdb88a";
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 160; i++) {
    const x = (i / 160) * 512 + Math.random() * 2;
    g.strokeStyle = `rgba(70,55,30,${0.18 + Math.random() * 0.22})`;
    g.lineWidth = 0.8 + Math.random() * 1.2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() - 0.5) * 3, 128);
    g.stroke();
  }
  for (let j = 0; j < 7; j++) {
    g.strokeStyle = "rgba(60,45,25,0.35)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 14 + j * 16);
    g.lineTo(512, 14 + j * 16);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function veilTex() {
  const c = document.createElement("canvas");
  c.width = 512, c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "rgba(242,238,228,0.97)");
  gr.addColorStop(0.62, "rgba(240,236,226,0.93)");
  gr.addColorStop(0.86, "rgba(236,232,222,0.72)");
  gr.addColorStop(1, "rgba(232,228,218,0.5)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) { // 纱的竖褶
    const x = (i / 26) * 512 + Math.random() * 8;
    g.strokeStyle = "rgba(96,96,92,0.22)";
    g.lineWidth = 2 + Math.random() * 4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 6, 90, x - 6, 170, x + (Math.random() - 0.5) * 10, 256);
    g.stroke();
  }
  g.fillStyle = "rgba(40,42,44,0.35)"; // 纱边一道淡墨
  g.fillRect(0, 250, 512, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function makeHat() {
  const g = new THREE.Group();
  g.name = "xy_hat";
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(0.006 + 0.33 * t, 0.165 * (1 - t) - 0.012 * Math.sin(Math.PI * t))); // 微凹的锥面
  }
  prof.push(new THREE.Vector2(0.338, -0.006));
  const hat = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshToonMaterial({ map: strawTex(), gradientMap: toonGradient(), side: THREE.DoubleSide }));
  hat.castShadow = !0;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshToonMaterial({ color: 0x2d3033, gradientMap: toonGradient() }));
  knob.position.y = 0.168;
  const vg = new THREE.CylinderGeometry(0.318, 0.33, 0.25, 64, 6, !0);
  {
    const pa = vg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(z, x), h = 0.5 - y / 0.25; // 0 顶 → 1 底
      const r = 1 + h * (0.04 * Math.sin(a * 9) + 0.025 * Math.sin(a * 23 + 1.3));   // 纱的波褶，越往下越明显
      pa.setXYZ(i, x * r, y - h * 0.02 * Math.sin(a * 5 + 0.7), z * r);
    }
    vg.computeVertexNormals();
  }
  const veil = new THREE.Mesh(
    vg,
    new THREE.MeshToonMaterial({ map: veilTex(), gradientMap: grad(215), transparent: !0, depthWrite: !1, side: THREE.DoubleSide }),
  );
  veil.position.y = -0.125;
  veil.renderOrder = 3;
  g.add(hat, knob, veil);
  g.userData.veil = veil;
  return g;
}

// ---------------- 脸面抹平（JS 里改绑定姿势的顶点，不跑 Blender）----------------
// 对脸前方、去掉眼 / 鼻 / 嘴区域的顶点做最小二乘曲面 z = a + b·x² + c·y' + d·y'² + e·x²y'（y' = y − 1.58），
// 再把眼窝、鼻、唇区域的顶点拉到这张曲面上（鼻梁留 4 mm 的暗示）。眼窝 / 唇缝不再有凹凸，水墨后期的折角描边就不会把它们描成"五官"。
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function flatPositions(geo) {
  if (geo.userData.xyFlat) return geo.userData.xyFlat;
  const pa = geo.attributes.position;
  const out = pa.clone();
  const feat = (x, y) => {
    const ax = Math.abs(x);
    const eye = smooth01(0.03, 0.018, Math.hypot((ax - 0.034) / 1.0, (y - 1.6) / 0.7)) ;
    const nm = smooth01(0.03, 0.018, ax) * smooth01(1.495, 1.51, y) * smooth01(1.6, 1.585, y);
    return Math.max(eye, nm);
  };
  // 最小二乘（5 个未知数，正规方程）
  const A = Array.from({ length: 5 }, () => new Float64Array(5)), B = new Float64Array(5);
  let n = 0;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    if (z < 0.05 || y < 1.47 || y > 1.66 || Math.abs(x) > 0.065 || feat(x, y) > 0.01) continue;
    const yp = y - 1.58, f = [1, x * x, yp, yp * yp, x * x * yp];
    for (let r = 0; r < 5; r++) {
      B[r] += f[r] * z;
      for (let c = 0; c < 5; c++) A[r][c] += f[r] * f[c];
    }
    n++;
  }
  // 高斯消元
  const M = A.map((row, r) => [...row, B[r]]);
  for (let c = 0; c < 5; c++) {
    let piv = c;
    for (let r = c + 1; r < 5; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 5; r++) {
      if (r === c || !M[c][c]) continue;
      const k = M[r][c] / M[c][c];
      for (let q = c; q < 6; q++) M[r][q] -= k * M[c][q];
    }
  }
  const co = M.map((row, r) => row[5] / (row[r] || 1));
  FIT = co;
  const fit = (x, y) => { const yp = y - 1.58; return co[0] + co[1] * x * x + co[2] * yp + co[3] * yp * yp + co[4] * x * x * yp; };
  let moved = 0;
  const na = geo.attributes.normal, nout = na.clone();
  const nv = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    if (z < 0.03 || y < 1.47 || y > 1.66) continue;
    const w = feat(x, y);
    if (w <= 0) continue;
    const bridge = 0.003 * smooth01(1.54, 1.585, y) * smooth01(0.012, 0, Math.abs(x));
    out.setZ(i, z + (fit(x, y) + bridge - z) * w);
    const yp = y - 1.58, dzdx = 2 * co[1] * x + 2 * co[4] * x * yp, dzdy = co[2] + 2 * co[3] * yp + co[4] * x * x;
    nv.set(-dzdx, -dzdy, 1).normalize();
    const o = new THREE.Vector3(na.getX(i), na.getY(i), na.getZ(i));
    o.lerp(nv, w).normalize();
    nout.setXYZ(i, o.x, o.y, o.z);
    moved++;
  }
  geo.userData.xyOrig = pa;
  geo.userData.xyFlat = out;
  geo.userData.xyNOrig = na;
  geo.userData.xyNFlat = nout;
  console.log("[xieyi] face flatten: fit on", n, "verts, moved", moved, "coef", co.map((c) => c.toFixed(4)).join(" "));
  return out;
}

// hero_v2 的黑瞳面分在 hair_black 图元里（A 模式要黑瞳）：留白各版把它们拉到脸面上、着色器里涂成脸色
const inEye = (x, y, z) => z > 0.06 && y > 1.57 && y < 1.63 && Math.abs(Math.abs(x) - 0.034) < 0.02;
function flatPupils(geo, v) {
  if (!geo.userData.xyP) {
    const pa = geo.attributes.position, out = pa.clone();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      if (!inEye(x, y, z) || !FIT) continue;
      const yp = y - 1.58;
      out.setZ(i, FIT[0] + FIT[1] * x * x + FIT[2] * yp + FIT[3] * yp * yp + FIT[4] * x * x * yp);
    }
    geo.userData.xyP = { orig: pa, flat: out };
  }
  geo.setAttribute("position", v === "V0" ? geo.userData.xyP.orig : geo.userData.xyP.flat);
}
let _hair = null;
function hairMaterial() {
  if (_hair) return _hair;
  const m = new THREE.MeshToonMaterial({ color: 0x1b1d1f, gradientMap: toonGradient(), side: THREE.DoubleSide });
  const fc = new THREE.Color(FACE_COLOR);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFace = { value: new THREE.Vector3(fc.r, fc.g, fc.b) };
    sh.vertexShader = POS_VERT(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vJxP;\nuniform vec3 uFace;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
  if (vJxP.z > 0.06 && vJxP.y > 1.57 && vJxP.y < 1.63 && abs(abs(vJxP.x) - 0.034) < 0.02) gl_FragColor = vec4(uFace, 1.0);`);
  };
  m.customProgramCacheKey = () => "xy-hair";
  m.name = "hair_black";
  return (_hair = m);
}

// ---------------- 应用变体 ----------------
const ROBE = /^(robe_white)/i, INNER = /^(robe_inner)/i, SASH = /^(sash_dark|boots_black)/i, SKIN = /^skin/i;
export const VARIANTS = {
  V0: { name: "V0 现状 v2", note: "对照：五官用笔触画上去（剑眉、眼线 + 墨瞳、一笔淡朱嘴）。近看是一张「程序画的脸」，用户反馈像铅笔随手画。" },
  V1: { name: "V1 两笔眉眼", note: "只留两道眉、两点眼（一笔短横），无鼻无嘴；脸是一块纸白淡赭。减笔人物画里最常见的「开脸」：眉眼定神，其余交给留白。" },
  V2: { name: "V2 无五官留白", note: "脸上一笔不画，只是一块淡赭纸白；靠发髻、朱砂发带、剑与白袍的剪影认人。游戏 45° 镜头下脸本就只有十几像素。" },
  V3: { name: "V3 泼墨写意", note: "V2 的脸 + 衣袍改成大块水墨晕染：浓淡渐变、顺衣纹的飞白、轮廓处积墨、边缘不收干净（毛边）。取梁楷《泼墨仙人图》一类减笔人物画的意趣：形不全而神全。" },
  V4: { name: "V4 斗笠幂篱", note: "另一种「不画脸」：斗笠压到眉际、垂一圈薄纱遮面，脸只隐约可见。道具本身成了认人的标志（江湖散修）。" },
};
export function applyVariant(root, v, C) {
  C.applyCharLook(root, v === "V0" ? "B" : "A", { kind: "hero" }); // 留白各版：衣袍用平涂（A），不要法线贴图带来的碎色块
  const st = root.userData.charLook;
  if (!root.userData.xyHat) {
    const head = root.getObjectByName("head");
    const hat = makeHat();
    if (head) {
      root.updateMatrixWorld(!0);
      // 模型空间里的目标位置：帽沿在眉际上方、略前倾，挂到 head 骨上随头动
      const want = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.705, 0.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0)), new THREE.Vector3(1, 1, 1));
      const local = head.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(want);
      local.decompose(hat.position, hat.quaternion, hat.scale);
      head.add(hat);
    }
    root.userData.xyHat = hat;
  }
  root.userData.xyHat.visible = v === "V4";
  // 先拉平脸（得到拟合曲面），再处理黑瞳所在的 hair_black 图元
  for (const [mesh, src] of st.orig) if (SKIN.test(src.name || "")) flatPositions(mesh.geometry);
  for (const [mesh, src] of st.orig) if (/^hair_black/i.test(src.name || "")) flatPupils(mesh.geometry, v);
  for (const [mesh, src] of st.orig) {
    const n = src.name || "";
    if (SKIN.test(n)) {
      const g = mesh.geometry;
      const flat = flatPositions(g);
      g.setAttribute("position", v === "V0" ? g.userData.xyOrig : flat);
      g.setAttribute("normal", v === "V0" ? g.userData.xyNOrig : g.userData.xyNFlat);
      if (v !== "V0") mesh.material = faceMaterial(v === "V1" ? "V1" : "V2");
    }
    if (v === "V1" || v === "V2" || v === "V4") {
      if (ROBE.test(n)) mesh.material = clothMaterial(0xf2efe6);
      else if (INNER.test(n)) mesh.material = clothMaterial(0xcfccc2);
    }
    if (v === "V3") {
      if (ROBE.test(n)) mesh.material = washMaterial("robe");
      else if (INNER.test(n)) mesh.material = washMaterial("inner");
      else if (SASH.test(n)) mesh.material = washMaterial("sash");
    }
    if (/^hair_black/i.test(n) && v !== "V0") mesh.material = hairMaterial();
    const ol = mesh.userData.outline;
    if (ol) ol.visible = !(v === "V3" && (ROBE.test(n) || INNER.test(n) || SASH.test(n))); // 泼墨：衣袍不要整齐的描边壳，轮廓交给积墨与毛边
  }
}
// 预热：把各变体的材质都在场景里画一帧
export function allVariantMaterials() {
  return [hairMaterial(), faceMaterial("V1"), faceMaterial("V2"), washMaterial("robe"), washMaterial("inner"), washMaterial("sash"), clothMaterial(0xf2efe6), clothMaterial(0xcfccc2)];
}
