// GPU 程序化贴图烘焙（精细化小样 v1）。
// 一个"配方"= 一段 GLSL 场函数 field(uv) → vec4(高度 h[米], m1, m2, m3)（必须可平铺）+ 一段着色函数。
// 第 1 遍：场函数写进半浮点 RT；第 2 遍：三次全屏绘制共用一个收尾着色器，得到
//   albedo（sRGB，含缝隙积灰 / 凸边磨亮）、normal（切线空间，Sobel，按"米 / 像素"物理缩放）、
//   orm（R = AO（高度场地平线 AO × 配方 AO）、G = 粗糙度、B = 墨线遮罩（B 模式用：缝隙 / 裂纹勾墨）、A = 1）。
// 只在进场时烘一次（docs/性能优化_v1.md §7.6：离屏渲染只做一次）。
// 思路参考：听雨园 src/materials/baker.js（MIT © 2026 Wode44398）的"配方 → 高度场 → 法线 / 地平线 AO / 缝隙"两段式；
//   代码为本项目重写（WebGL2 + three r180 ShaderMaterial，没有 MRT / 整数打包）。
import * as THREE from "three";
import { NOISE } from "../../../src/render/glsl.js";

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 可平铺的噪声工具（周期 per，单位：格）
export const TLIB = /* glsl */ `
${NOISE}
vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
vec3 hex(float h){ return srgb(vec3(floor(h / 65536.0), mod(floor(h / 256.0), 256.0), mod(h, 256.0)) / 255.0); }
float hT(vec2 i, vec2 per){ return hash12(mod(i, per)); }
vec2 h2T(vec2 i, vec2 per){ return hash22(mod(i, per)); }
// Voronoi：x = F1, y = F2, z = 胞元 id 哈希, w = 第二个哈希
vec4 voroT(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 c1 = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + h2T(i + o, per) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; c1 = mod(i + o, per); } else if (d < d2) d2 = d;
  }
  return vec4(sqrt(d1), sqrt(d2), hash12(c1 + 0.37), hash12(c1 * 1.7 + 5.1));
}
float fbmT6(vec2 p, vec2 per){ float a = 0.5, s = 0.0; for (int k = 0; k < 6; k++){ s += a * vnoiseT(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s / 0.984; }
float ridgeT(vec2 p, vec2 per){ return 1.0 - abs(vnoiseT(p, per) * 2.0 - 1.0); }
`;

const FIELD_HEAD = /* glsl */ `precision highp float;\nvarying vec2 vUv;\nuniform float uSeed;\n${TLIB}\n`;

const FINAL = /* glsl */ `
uniform sampler2D tF;
uniform vec2 uTexel;     // 1 / 像素数
uniform float uMPT;      // 米 / 像素
uniform int uMode;       // 0 albedo, 1 normal, 2 orm
uniform float uNrm, uAOR, uAOK, uCavR;
float H(vec2 uv){ return texture2D(tF, uv).r; }
vec4 Fv(vec2 uv){ return texture2D(tF, uv); }
void main(){
  vec2 uv = vUv;
  vec4 F = Fv(uv);
  float h0 = F.r;
  if (uMode == 1) {
    vec2 e = uTexel;
    float tl = H(uv + vec2(-e.x, e.y)), t = H(uv + vec2(0.0, e.y)), tr = H(uv + vec2(e.x, e.y));
    float l = H(uv - vec2(e.x, 0.0)), r = H(uv + vec2(e.x, 0.0));
    float bl = H(uv - e), b = H(uv - vec2(0.0, e.y)), br = H(uv + vec2(e.x, -e.y));
    float dx = ((tr + 2.0 * r + br) - (tl + 2.0 * l + bl)) / (8.0 * uMPT);
    float dy = ((tl + 2.0 * t + tr) - (bl + 2.0 * b + br)) / (8.0 * uMPT);
    vec3 n = normalize(vec3(-dx * uNrm, -dy * uNrm, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
    return;
  }
  // 地平线 AO（两圈 8 方向）+ 缝隙（与一圈均值比较）
  float occ = 0.0, mean = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3;
    vec2 d = vec2(cos(a), sin(a));
    vec2 rr = d * uAOR / uMPT * uTexel;
    float s1 = (H(uv + rr * 0.4) - h0) / (uAOR * 0.4), s2 = (H(uv + rr) - h0) / uAOR;
    float sl = max(s1, s2);
    occ += sl > 0.0 ? sl / sqrt(1.0 + sl * sl) : 0.0;
    mean += H(uv + d * uCavR / uMPT * uTexel);
  }
  occ /= 8.0; mean /= 8.0;
  float cav = clamp((h0 - mean) / max(uCavR, 1e-5) * 4.0, -1.0, 1.0); // > 0 凸棱，< 0 凹缝
  float ao = clamp(1.0 - occ * uAOK, 0.0, 1.0);
  if (uMode == 0) {
    vec3 c = albedo(F, cav, ao, uv);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  } else {
    gl_FragColor = vec4(ao * recipeAO(F, cav), clamp(rough(F, cav), 0.04, 1.0), clamp(inkLine(F, cav, ao), 0.0, 1.0), 1.0);
  }
}`;

let _geo = null;
const _cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function tri() {
  if (!_geo) {
    _geo = new THREE.BufferGeometry();
    _geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    _geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  }
  return _geo;
}
function draw(renderer, mat, rt) {
  const m = new THREE.Mesh(tri(), mat);
  m.frustumCulled = false;
  renderer.setRenderTarget(rt);
  renderer.render(m, _cam);
}

export const BAKE_STATS = { bytes: 0, list: [] };

// R = { name, size, meters（贴图对应的世界尺寸，米）, field（GLSL：vec4 field(vec2 uv)）, shade（GLSL：albedo / rough / inkLine / recipeAO）,
//       nrm（法线强度，默认 1）, aoR（米）, aoK, cavR（米）, seed }
const hx = (s) => s.replace(/HX\(0x([0-9a-fA-F]{6})\)/g, (m, h) => "hex(" + parseInt(h, 16) + ".0)");
export function bakeRecipe(renderer, R) {
  const N = R.size || 512;
  const prev = renderer.getRenderTarget();
  const fRT = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  const fMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FIELD_HEAD + hx(R.field) + "\nvoid main(){ gl_FragColor = field(vUv); }", uniforms: { uSeed: { value: R.seed ?? 1 } }, depthTest: false, depthWrite: false });
  draw(renderer, fMat, fRT);
  const fin = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FIELD_HEAD + hx(R.shade) + FINAL,
    uniforms: {
      tF: { value: fRT.texture },
      uTexel: { value: new THREE.Vector2(1 / N, 1 / N) },
      uMPT: { value: R.meters / N },
      uMode: { value: 0 },
      uNrm: { value: R.nrm ?? 1 },
      uAOR: { value: R.aoR ?? R.meters * 0.02 },
      uAOK: { value: R.aoK ?? 1.2 },
      uCavR: { value: R.cavR ?? R.meters * 0.004 },
      uSeed: { value: R.seed ?? 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const out = {};
  for (const [k, mode] of [["albedo", 0], ["normal", 1], ["orm", 2]]) {
    const rt = new THREE.WebGLRenderTarget(N, N, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
      colorSpace: mode === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    });
    rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    fin.uniforms.uMode.value = mode;
    draw(renderer, fin, rt);
    rt.texture.repeat.set(1 / R.meters, 1 / R.meters); // 几何体 UV 以米为单位
    rt.texture.name = R.name + "_" + k;
    out[k] = rt.texture;
    out[k + "RT"] = rt;
  }
  renderer.setRenderTarget(prev);
  fMat.dispose();
  fin.dispose();
  fRT.dispose();
  const bytes = N * N * 4 * 3 * 4 / 3;
  BAKE_STATS.bytes += bytes;
  BAKE_STATS.list.push([R.name, N, bytes]);
  out.bytes = bytes;
  out.meters = R.meters;
  out.name = R.name;
  return out;
}

// 共享的世界空间噪声（风化：苔 / 雨痕 / 泥溅用）：r、g 两档 fbm，b 变化，a 竖向拉长的雨痕噪声
export function bakeNoise(renderer) {
  const N = 256;
  const rt = new THREE.WebGLRenderTarget(N, N, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FIELD_HEAD + `void main(){
      vec2 p = vUv;
      float a = fbmT(p * 4.0, vec2(4.0));
      float b = fbmT(p * 9.0 + 3.1, vec2(9.0));
      float c = vnoiseT(p * 23.0, vec2(23.0));
      float s = fbmT(vec2(p.x * 24.0, p.y * 3.0), vec2(24.0, 3.0));
      gl_FragColor = vec4(a, b, c, s);
    }`,
    uniforms: { uSeed: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  });
  const prev = renderer.getRenderTarget();
  draw(renderer, mat, rt);
  renderer.setRenderTarget(prev);
  mat.dispose();
  BAKE_STATS.bytes += N * N * 4 * 4 / 3;
  BAKE_STATS.list.push(["noise", N, N * N * 4 * 4 / 3]);
  return rt.texture;
}

// Canvas 贴图（叶片等带透明的笔触）也计入显存统计
export function canvasTex(w, h, draw, name) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.name = name || "canvas";
  BAKE_STATS.bytes += w * h * 4 * 4 / 3;
  BAKE_STATS.list.push([t.name, w, w * h * 4 * 4 / 3]);
  return t;
}
