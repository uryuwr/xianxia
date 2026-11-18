// 三种着色的材质工厂（精细化小样 v1）：同一套几何体与烘焙贴图，切换时只换 mesh.material（材质按 look × 模式缓存，切换不 new）。
//   A 现行 3 阶 toon：MeshToonMaterial（游戏同一张 70/165/255 渐变）+ 反照率贴图。无法线 / AO —— 等于"游戏现行管线 + 新几何 + 新贴图"。
//   B 水墨写意：A + 法线贴图（toon 色阶随法线细节断开 → 皴擦感）+ AO（贴图 AO × 顶点接触 AO）+ 暗部三向投影皴笔（游戏 TEX.cunfa）+ 缝隙勾墨（orm.b）。
//   C 写实 PBR：MeshStandardMaterial（反照率 / 法线 / ORM 粗糙度 / AO + 环境光照），仍走水墨后期（后期里做曝光与色调映射）。
// 共享注入（onBeforeCompile）：世界坐标 / 法线、风动、实例 UV 偏移、三向投影（山石）、地面配比（aSplat）、风化（苔 / 雨痕 / 泥溅）。
import * as THREE from "three";
import { toonGradient, U, TEX } from "../../../src/render/materials.js";

export const SH = {
  uTime: U.uTime,
  tJxNoise: { value: null },
  uJxBrush: { value: null },
  uMossCol: { value: new THREE.Color(0x8e9c78) },
  uDirtCol: { value: new THREE.Color(0xc9c0a8) },
  uGrassCol: { value: new THREE.Color(0xb3bb98) },
};

const VHEAD = /* glsl */ `
uniform float uTime, uWindAmp, uWindH;
varying vec3 vJxW, vJxN;
#ifdef JX_UVOFF
attribute vec2 aUvOff;
#endif
#ifdef JX_VAO
attribute float aAO;
varying float vJxAO;
#endif
#ifdef JX_GROUND
attribute vec3 aSplat;
varying vec3 vJxSplat;
#endif
`;
const VUV = /* glsl */ `
#include <uv_vertex>
#ifdef JX_UVOFF
  #ifdef USE_MAP
  vMapUv += aUvOff;
  #endif
  #ifdef USE_NORMALMAP
  vNormalMapUv += aUvOff;
  #endif
  #ifdef USE_AOMAP
  vAoMapUv += aUvOff;
  #endif
#endif
#ifdef JX_VAO
  vJxAO = aAO;
#endif
#ifdef JX_GROUND
  vJxSplat = aSplat;
#endif
`;
const VBODY = /* glsl */ `
#include <begin_vertex>
{
  vec4 jxBase = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
  jxBase = instanceMatrix * jxBase;
  #endif
  jxBase = modelMatrix * jxBase;
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
}
`;

const FHEAD = /* glsl */ `
uniform float uTime, uTripM, uMoss, uStreak, uDirt, uNS, uAOK, uBrushK, uBrushS, uInkK, uDirtY;
uniform sampler2D tJxNoise, uJxBrush;
uniform vec3 uMossCol, uDirtCol, uGrassCol;
varying vec3 vJxW, vJxN;
#ifdef JX_VAO
varying float vJxAO;
#endif
#ifdef JX_GROUND
varying vec3 vJxSplat;
#endif
vec3 jxB(vec3 n){ vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z); }
vec4 jxTri(sampler2D t, vec3 w, vec3 n, float m){
  vec3 b = jxB(n);
  return texture2D(t, w.zy * m) * b.x + texture2D(t, w.xz * m) * b.y + texture2D(t, w.xy * m) * b.z;
}
// 三向投影法线（Ben Golus "whiteout" 混合，世界空间）
vec3 jxTriN(sampler2D t, vec3 w, vec3 n, float m, float s){
  vec3 b = jxB(n);
  vec3 tx = texture2D(t, w.zy * m).xyz * 2.0 - 1.0; tx.xy *= s;
  vec3 ty = texture2D(t, w.xz * m).xyz * 2.0 - 1.0; ty.xy *= s;
  vec3 tz = texture2D(t, w.xy * m).xyz * 2.0 - 1.0; tz.xy *= s;
  vec3 nx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
  vec3 ny = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
  vec3 nz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(nx.zyx * b.x + ny.xzy * b.y + nz.xyz * b.z);
}
`;
const FMAP = /* glsl */ `
vec3 jxNW = normalize(vJxN);
#ifdef JX_TRIP
  #ifdef USE_MAP
  diffuseColor *= jxTri(map, vJxW, jxNW, uTripM);
  #endif
#else
  #include <map_fragment>
#endif
vec4 jxORM = vec4(1.0, 0.85, 0.0, 1.0);
#ifdef USE_AOMAP
  #ifdef JX_TRIP
  jxORM = jxTri(aoMap, vJxW, jxNW, uTripM);
  #else
  jxORM = texture2D(aoMap, vAoMapUv);
  #endif
#endif
float jxNS = 1.0;
#if defined( JX_WEATHER ) || defined( JX_GROUND )
vec4 jxNz = texture2D(tJxNoise, vJxW.xz * 0.045 + vJxW.y * 0.02);
#endif
#ifdef JX_GROUND
{
  // 碎石少的地方压掉一半碎石色、法线变平；草地处换成草色（草叶几何体另画）
  float gravel = vJxSplat.x, grass = vJxSplat.y;
  vec3 bare = uDirtCol * (0.82 + 0.36 * jxNz.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, bare, (1.0 - gravel) * 0.8);
  vec3 g = uGrassCol * (0.72 + 0.5 * jxNz.r) * (0.85 + 0.3 * jxNz.b);
  diffuseColor.rgb = mix(diffuseColor.rgb, g, grass * 0.85);
  diffuseColor.rgb *= 1.0 - vJxSplat.z * 0.25;    // 湿 / 踩实
  jxNS = mix(0.2, 1.0, gravel) * (1.0 - grass * 0.6);
}
#endif
#ifdef JX_WEATHER
{
  // 苔：朝上的面 + 噪声成片；雨痕：竖直面上竖向拉长的噪声；泥溅：贴地 0.6 米内
  float up = smoothstep(0.3, 0.85, jxNW.y);
  float moss = uMoss * up * smoothstep(0.5, 0.72, jxNz.r + jxNz.b * 0.25);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMossCol * (0.7 + 0.6 * jxNz.g), moss);
  float vert = 1.0 - abs(jxNW.y);
  vec2 sp = vec2(dot(vJxW.xz, normalize(vec2(jxNW.z, -jxNW.x) + 1e-4)) * 0.9, vJxW.y * 0.12);
  float streak = smoothstep(0.5, 0.8, texture2D(tJxNoise, sp).a);
  diffuseColor.rgb *= 1.0 - uStreak * vert * streak * 0.4;
  float gd = 1.0 - smoothstep(0.0, 0.7, vJxW.y - uDirtY);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * 0.8, uDirt * gd * (0.5 + 0.5 * jxNz.g));
}
#endif
`;
const FROUGH = /* glsl */ `float roughnessFactor = roughness * jxORM.g;`;
const FNORMAL = /* glsl */ `
#ifdef JX_TRIP
  #ifdef USE_NORMALMAP
  normal = normalize((viewMatrix * vec4(jxTriN(normalMap, vJxW, jxNW, uTripM, uNS), 0.0)).xyz);
  #endif
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * jxNS;
  normal = normalize( tbn * mapN );
#endif
`;
const FAO = /* glsl */ `
{
  float jxAO = 1.0;
  #ifdef USE_AOMAP
  jxAO = mix(1.0, jxORM.r, uAOK);
  #endif
  #ifdef JX_VAO
  jxAO *= vJxAO;
  #endif
  reflectedLight.indirectDiffuse *= jxAO;
  reflectedLight.directDiffuse *= mix(1.0, jxAO, 0.55);
  #if defined( USE_ENVMAP ) && defined( STANDARD )
  reflectedLight.indirectSpecular *= jxAO;
  #endif
}
`;
const FBRUSH = /* glsl */ `
#ifdef JX_BRUSH
{
  // 暗部皴笔：按受光程度（出射光 / 固有色亮度）在暗部叠三向投影的披麻皴；缝隙勾墨用 orm.b
  float base = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-3);
  float lit = dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / base;
  float dark = 1.0 - smoothstep(0.32, 0.75, lit);
  #ifdef JX_BRUSH_PLANAR
  vec4 cf = texture2D(uJxBrush, vJxW.xz * uBrushS);   // 近水平的大面（地面）：单次俯投影，省掉三向投影的 2 次采样
  #else
  vec4 cf = jxTri(uJxBrush, vJxW, jxNW, uBrushS);
  #endif
  outgoingLight *= 1.0 - dark * cf.r * uBrushK;
  outgoingLight *= 0.93 + 0.14 * cf.g;
  outgoingLight *= 1.0 - jxORM.b * uInkK;
}
#endif
#include <opaque_fragment>
`;

function inject(m, defs, local) {
  m.defines = { ...(m.defines || {}), ...defs };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, local, { uTime: SH.uTime, tJxNoise: SH.tJxNoise, uJxBrush: SH.uJxBrush, uMossCol: SH.uMossCol, uDirtCol: SH.uDirtCol, uGrassCol: SH.uGrassCol });
    sh.vertexShader = VHEAD + sh.vertexShader.replace("#include <uv_vertex>", VUV).replace("#include <begin_vertex>", VBODY);
    sh.fragmentShader = FHEAD + sh.fragmentShader
      .replace("#include <map_fragment>", FMAP)
      .replace("#include <roughnessmap_fragment>", FROUGH)
      .replace("#include <normal_fragment_maps>", FNORMAL)
      .replace("#include <aomap_fragment>", FAO)
      .replace("#include <opaque_fragment>", FBRUSH);
  };
  const key = "jxr|" + Object.keys(defs).sort().join(",");
  m.customProgramCacheKey = () => key;
}

// look：{ key, tex（bakeRecipe 结果）, map（自带贴图，如叶片）, color, alphaTest, side, vertexColors, trip（三向投影）, ground,
//         weather: { moss, streak, dirt, dirtY }, wind: [幅度, 高], windConst, uvOff, vao, nrm, aoK, brushK, brushS, inkK, envK, emissive, ei }
function build(look, mode) {
  const t = look.tex;
  const common = {
    color: look.color ?? 0xffffff,
    map: look.map || (t && t.albedo) || null,
    alphaTest: look.alphaTest || 0,
    side: look.side ?? THREE.FrontSide,
    vertexColors: !!look.vertexColors,
    emissive: look.emissive ?? 0x000000,
    emissiveIntensity: look.ei ?? 1,
  };
  let m;
  if (mode === "C") {
    m = new THREE.MeshStandardMaterial({ ...common, roughness: look.rough ?? 1, metalness: 0, envMapIntensity: (look.envK ?? 0.6) * 0.6 });
  } else {
    m = new THREE.MeshToonMaterial({ ...common, gradientMap: toonGradient() });
  }
  if (mode !== "A" && t && !look.noMaps) {
    m.normalMap = t.normal;
    m.normalScale = new THREE.Vector2(look.nrm ?? 1, look.nrm ?? 1);
    m.aoMap = t.orm;
  }
  const defs = {};
  if (look.weather) defs.JX_WEATHER = "";
  if (look.ground && mode === "B") defs.JX_BRUSH_PLANAR = "";
  if (look.trip) defs.JX_TRIP = "";
  if (look.ground) defs.JX_GROUND = "";
  if (look.wind) defs.JX_WIND = "";
  if (look.windConst) defs.JX_WIND_CONST = "";
  if (look.uvOff) defs.JX_UVOFF = "";
  if (look.vao && mode !== "A") defs.JX_VAO = "";
  if (mode === "B") defs.JX_BRUSH = "";
  const w = look.weather || {};
  const local = {
    uWindAmp: { value: look.wind ? look.wind[0] : 0 },
    uWindH: { value: look.wind ? look.wind[1] : 1 },
    uTripM: { value: look.trip ? 1 / look.trip : 1 },
    uMoss: { value: w.moss ?? 0 },
    uStreak: { value: w.streak ?? 0 },
    uDirt: { value: w.dirt ?? 0 },
    uDirtY: { value: w.dirtY ?? 0 },
    uNS: { value: look.nrm ?? 1 },
    uAOK: { value: look.aoK ?? 1 },
    uBrushK: { value: look.brushK ?? 0.55 },
    uBrushS: { value: look.brushS ?? 0.35 },
    uInkK: { value: look.inkK ?? 0.45 },
  };
  inject(m, defs, local);
  m.name = look.key + ":" + mode;
  m.userData.look = look;
  return m;
}

export class Looks {
  constructor() {
    this.cache = new Map();
    this.meshes = [];
    this.mode = "B";
  }
  mats(look) {
    let e = this.cache.get(look.key);
    if (!e) this.cache.set(look.key, (e = { A: build(look, "A"), B: build(look, "B"), C: build(look, "C") }));
    return e;
  }
  // 登记网格：之后 setMode 统一换材质
  use(mesh, look) {
    const e = this.mats(look);
    mesh.material = e[this.mode];
    mesh.userData.look = look.key;
    this.meshes.push(mesh);
    return mesh;
  }
  setMode(mode) {
    this.mode = mode;
    for (const m of this.meshes) m.material = this.cache.get(m.userData.look)[mode];
  }
  allMaterials() {
    const out = [];
    for (const e of this.cache.values()) out.push(e.A, e.B, e.C);
    return out;
  }
}

export function initShared(noiseTex) {
  SH.tJxNoise.value = noiseTex;
  SH.uJxBrush.value = TEX.cunfa;
}
