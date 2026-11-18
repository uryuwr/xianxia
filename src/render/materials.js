// 卡通水墨材质：以 MeshToonMaterial 为底（自带分阶光照与阴影），通过 onBeforeCompile 注入：
//   JX_TERRAIN  地形：平台顶面点苔 / 崖壁皴法 / 崖沿浓墨（aRim）
//   JX_TRI      三向投影皴法（山石、石灯等）
//   JX_WIND     风吹摆动（竹、松、草）
//   JX_FADE     遮挡主角时镂空（树冠、屋檐），镂空边缘由后期墨线勾出
//   JX_BAMBOO   竹节
import * as THREE from "three";

export const U = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3(0, 0, 0) },
  uCam: { value: new THREE.Vector3(0, 30, 30) },
};
export const TEX = { cunfa: null, ground: null };

let gradient = null;
// 三阶明暗：暗部 / 中间调 / 亮部
export function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([70, 165, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uWindAmp, uWindH;
varying vec3 vJxW;
varying vec3 vJxN;
varying float vJxLY;
#ifdef JX_TERRAIN
attribute float aRim;
varying float vJxRim;
#endif
`;
const VERT_BODY = /* glsl */ `
#include <begin_vertex>
{
  vec4 jxBase = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
  jxBase = instanceMatrix * jxBase;
  #endif
  jxBase = modelMatrix * jxBase;
  vJxLY = position.y;
  #ifdef JX_WIND
  #ifdef JX_WIND_CONST
  float k = uWindAmp;
  #else
  float k = pow(clamp(position.y / uWindH, 0.0, 1.5), 1.6) * uWindAmp;
  #endif
  float ph = jxBase.x * 0.31 + jxBase.z * 0.23;
  transformed.x += (sin(uTime * 1.1 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7) * 0.3) * k;
  transformed.z += sin(uTime * 0.9 + ph * 1.3) * 0.5 * k;
  #endif
  vec4 jxW = vec4(transformed, 1.0);
  vec3 jxN = objectNormal;
  #ifdef USE_INSTANCING
  jxW = instanceMatrix * jxW;
  jxN = mat3(instanceMatrix) * jxN;
  #endif
  vJxW = (modelMatrix * jxW).xyz;
  vJxN = normalize(mat3(modelMatrix) * jxN);
  #ifdef JX_TERRAIN
  vJxRim = aRim;
  #endif
}
`;
const FRAG_HEAD = /* glsl */ `
uniform float uTime;
uniform vec3 uPlayer, uCam;
uniform sampler2D uCunfa, uGround;
uniform vec3 uTopColor, uFaceColor, uMossColor;
uniform float uBrushK, uBrushScale;
varying vec3 vJxW;
varying vec3 vJxN;
varying float vJxLY;
#ifdef JX_TERRAIN
varying float vJxRim;
#endif
float jxBayer(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  float b = mod(q.x * 2.0 + q.y * 3.0, 4.0) * 4.0 + mod(q.x + q.y * 2.0, 4.0);
  return (b + 0.5) / 16.0;
}
// 片元是否挡在镜头与主角之间：到"主角—镜头"连线的距离
float jxOcc(vec3 w){
  vec3 a = uPlayer + vec3(0.0, 0.9, 0.0);
  vec3 ab = uCam - a;
  float t = dot(w - a, ab) / dot(ab, ab);
  if (t < 0.02) return 0.0;
  float d = length(w - (a + ab * clamp(t, 0.0, 1.0)));
  float r = mix(1.4, 3.2, clamp(t * 5.0, 0.0, 1.0));
  return 1.0 - smoothstep(r * 0.75, r, d);
}
vec3 jxTri(sampler2D tex, vec3 w, vec3 n, float s){
  vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
  return texture2D(tex, w.zy * s).rgb * b.x + texture2D(tex, w.xz * s).rgb * b.y + texture2D(tex, w.xy * s).rgb * b.z;
}
`;
const FRAG_CLIP = /* glsl */ `
#include <clipping_planes_fragment>
#ifdef JX_FADE
{
  // 硬切一个干净的洞：抖动镂空会被水墨后期的深度描边描成一团黑色噪点
  if (jxOcc(vJxW) > 0.5) discard;
}
#endif
`;
const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
#ifdef JX_TERRAIN
{
  vec3 n = normalize(vJxN);
  float steep = smoothstep(0.42, 0.78, 1.0 - n.y);
  vec2 side = abs(n.x) > abs(n.z) ? vJxW.zy : vJxW.xy;
  vec4 cf = texture2D(uCunfa, side * vec2(0.16, 0.11));
  vec4 cf2 = texture2D(uCunfa, vJxW.xz * 0.09 + 0.37);
  vec4 gd = texture2D(uGround, vJxW.xz * 0.11);
  vec4 big = texture2D(uGround, vJxW.xz * 0.018 + 0.21);
  float wash = smoothstep(0.3, 0.75, big.g * 0.65 + gd.g * 0.35);
  vec3 top = uTopColor * (0.74 + 0.34 * wash);
  top = mix(top, uMossColor, smoothstep(0.42, 0.75, big.b) * 0.55);
  top *= 1.0 - gd.r * 0.55;
  top *= 1.0 - cf2.r * 0.18 * smoothstep(0.1, 0.4, 1.0 - n.y);
  vec3 face = uFaceColor * (0.8 + 0.35 * cf.g) * (1.0 - cf.r * 0.8);
  // 崖下渐深：越低越重墨，与后期的低处留白形成"上浓下淡"的层次
  face *= mix(0.75, 1.0, smoothstep(-6.0, 4.0, vJxW.y));
  vec3 c = mix(top, face, steep);
  c *= 1.0 - vJxRim * 0.88;
  diffuseColor.rgb = c;
}
#endif
#ifdef JX_TRI
{
  vec3 cf = jxTri(uCunfa, vJxW, normalize(vJxN), uBrushScale);
  diffuseColor.rgb *= (1.0 - cf.r * uBrushK) * (0.88 + 0.24 * cf.g);
}
#endif
#ifdef JX_BAMBOO
{
  float seg = fract(vJxLY / 0.42);
  diffuseColor.rgb *= 1.0 - 0.75 * smoothstep(0.9, 0.97, seg) * smoothstep(1.0, 0.97, seg);
  diffuseColor.rgb *= 0.85 + 0.3 * smoothstep(0.0, 0.5, seg);
}
#endif
`;

// opts: { color, terrain, tri, brushK, brushScale, wind:[amp,h], windConst, fade, bamboo, map, alphaTest, side, vertexColors, emissive, emissiveIntensity }
export function toon(opts = {}) {
  const m = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    gradientMap: toonGradient(),
    map: opts.map || null,
    alphaTest: opts.alphaTest || 0,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
  });
  const defs = {};
  if (opts.terrain) defs.JX_TERRAIN = "";
  if (opts.tri) defs.JX_TRI = "";
  if (opts.wind) defs.JX_WIND = "";
  if (opts.windConst) defs.JX_WIND_CONST = "";
  if (opts.fade) defs.JX_FADE = "";
  if (opts.bamboo) defs.JX_BAMBOO = "";
  m.defines = { ...(m.defines || {}), ...defs };
  const local = {
    uWindAmp: { value: opts.wind ? opts.wind[0] : 0 },
    uWindH: { value: opts.wind ? opts.wind[1] : 1 },
    uTopColor: { value: new THREE.Color(opts.topColor ?? 0xd8d6c8) },
    uFaceColor: { value: new THREE.Color(opts.faceColor ?? 0x6f726c) },
    uMossColor: { value: new THREE.Color(opts.mossColor ?? 0xa8b09a) },
    uBrushK: { value: opts.brushK ?? 0.6 },
    uBrushScale: { value: opts.brushScale ?? 0.35 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, local, { uCunfa: { value: TEX.cunfa }, uGround: { value: TEX.ground } });
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace("#include <begin_vertex>", VERT_BODY);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace("#include <clipping_planes_fragment>", FRAG_CLIP).replace("#include <color_fragment>", FRAG_COLOR);
  };
  m.customProgramCacheKey = () => "jx|" + Object.keys(defs).join(",");
  m.userData.jx = local;
  return m;
}

// 透明裁切贴图的阴影深度材质（叶片、草丛投影形状正确）
export function cutoutDepth(map, alphaTest = 0.5) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
}

// 角色描边：反向外扩外壳（在蒙皮之前沿法线外扩，蒙皮后仍贴合）
export function outlineMaterial(width = 0.022, color = 0x101214) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOW = { value: width };
    sh.vertexShader = "uniform float uOW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * uOW;");
  };
  m.customProgramCacheKey = () => "jx-outline";
  return m;
}
