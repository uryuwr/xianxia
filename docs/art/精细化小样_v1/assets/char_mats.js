// 墨途 · 精细化小样 v1：角色 / 首领的三种着色（美术管线 2026-11-18）
//   applyCharLook(root, mode, opts)   root = GLTF scene；mode = "A" | "B" | "C"
//     A  现行 3 阶 toon：材质名 → PALETTE 纯色（与 src/game/player.js / enemies/enemy.js 一致），不读贴图
//     B  水墨写意：3 阶 toon + 法线贴图 + 墨贴图（R 笔触墨、G 曲率、B AO）+ 固有色贴图按 uAlbK 混入 PALETTE 色
//     C  写实 PBR：glTF 原材质（baseColor / normal / ORM 图集），交给 ink.js 水墨后期
//   opts: { kind: "hero" | "qingya", legacy: 旧模型（只支持 A）, inkTex: 覆盖墨贴图 }
//   同一 root 重复调用复用缓存的材质；描边壳（outlineMaterial，主角 0.018、青牙 0.016，与游戏相同）只建一次。
// 贴图与 glTF 共用 uv0（glTF 约定 flipY = false）。
import * as THREE from "three";
import { toon, toonGradient, outlineMaterial } from "../../../../src/render/materials.js";
import heroInkUrl from "./hero_v2_ink.webp";
import qingyaInkUrl from "./qingya_v2_ink.webp";

export const SCALE = { hero: 1, qingya: 2.2 };
export const CLIPS = { hero: ["idle", "slash1"], qingya: ["idle", "attack_bite"] };
// 描边壳宽度：现状模型沿用游戏值；精细版细节多（鼻、唇、毛束凹缝），外扩 1.8 cm 的反向外壳会从凹处穿出成黑块，改细，剪影交给水墨后期的深度描边
export const OUTLINE = { hero: 0.018, qingya: 0.016 };
export const OUTLINE_V2 = { hero: 0.007, qingya: 0.011 };

// 与游戏 PALETTE 相同（player.js、enemy.js；青牙 fur_light 用数据表 tint 0xa9c7b8）
export const PALETTE = {
  hero: {
    robe_white: { color: 0xf2efe6 },
    robe_inner: { color: 0xc9c6bc },
    sash_dark: { color: 0x2d3033 },
    skin: { color: 0xe6d6c2 },
    hair_black: { color: 0x1b1d1f },
    ribbon_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 },
    boots_black: { color: 0x202224 },
    sword_steel: { color: 0xd8dde0 },
    sword_hilt: { color: 0x3a3430 },
    tassel_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 },
  },
  qingya: {
    fur_qing: { color: 0x4f5f59, emissive: 0x1a2622, emissiveIntensity: 1 },
    fur_belly: { color: 0x7a8883, emissive: 0x1a2220, emissiveIntensity: 1 },
    fur_light: { color: 0xa9c7b8 },
    fang_jade: { color: 0x8affd2, emissive: 0x2fd890, emissiveIntensity: 1.1 },
    bone_armor: { color: 0xdedbcd },
    eye_jade: { color: 0xa8ffe0, emissive: 0x3dffb4, emissiveIntensity: 2.2 },
    crack_glow: { color: 0x8affd0, emissive: 0x2fe8a0, emissiveIntensity: 1.6 },
    eye_fire: { color: 0xd2fff0, emissive: 0x6affc8, emissiveIntensity: 2.4 },
  },
};
// B 模式每个材质的参数：albK 固有色贴图混入比例，inkK 笔触墨浓度，cavK 曲率明暗，aoK AO 强度
const B_PARAMS = {
  hero: { _: { albK: 0.35, inkK: 0.35, cavK: 0.2, aoK: 0.25, nK: 0.45 }, skin: { albK: 0.85, inkK: 0.95, cavK: 0, aoK: 0 }, hair_black: { albK: 0.3, inkK: 0.3, cavK: 0.9, aoK: 0.3 } },
  qingya: { _: { albK: 0.55, inkK: 0.8, cavK: 0.6, aoK: 0.6 }, eye_jade: { albK: 0.6, inkK: 1, cavK: 0, aoK: 0 }, crack_glow: { albK: 0, inkK: 0, cavK: 0, aoK: 0 }, eye_fire: { albK: 0, inkK: 0, cavK: 0, aoK: 0 } },
};

let _faceGrad = null;
// 精细版主角的脸 / 手：只有"亮 / 中"两阶（暗面 75%），不出现把脸切成两半的硬明暗线（卡通人物脸的常规做法）
function faceGradient() {
  if (!_faceGrad) {
    _faceGrad = new THREE.DataTexture(new Uint8Array([190, 255]), 2, 1, THREE.RedFormat);
    _faceGrad.minFilter = _faceGrad.magFilter = THREE.NearestFilter;
    _faceGrad.generateMipmaps = false;
    _faceGrad.needsUpdate = true;
  }
  return _faceGrad;
}

const _inkTex = {};
function inkTexture(kind, url) {
  const key = url || kind;
  if (!_inkTex[key]) {
    const t = new THREE.TextureLoader().load(url || (kind === "hero" ? heroInkUrl : qingyaInkUrl));
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    _inkTex[key] = t;
  }
  return _inkTex[key];
}

function keyOf(pal, name) {
  name = (name || "").toLowerCase();
  return Object.keys(pal).find((k) => name.startsWith(k));
}

// B：toon + 法线 + 墨贴图。一个着色器程序（customProgramCacheKey 固定），参数全走 uniform
function inkToon(p, src, ink, prm, side) {
  const m = new THREE.MeshToonMaterial({
    color: p.color,
    gradientMap: toonGradient(),
    emissive: p.emissive ?? 0,
    emissiveIntensity: p.emissiveIntensity ?? 1,
    side,
    normalMap: src.normalMap || null,
    normalScale: (src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1)).multiplyScalar(prm.nK ?? 1),
  });
  const U = {
    tInk: { value: ink },
    tAlb: { value: src.map || null },
    uAlbK: { value: src.map ? prm.albK : 0 },
    uInkK: { value: prm.inkK },
    uCavK: { value: prm.cavK },
    uAoK: { value: prm.aoK },
  };
  m.userData.inkU = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vJxUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvJxUv = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tInk, tAlb; uniform float uAlbK, uInkK, uCavK, uAoK; varying vec2 vJxUv;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec3 jk = texture2D(tInk, vJxUv).rgb;
  if (uAlbK > 0.0) {
    vec3 al = texture2D(tAlb, vJxUv).rgb;          // sRGB 贴图，已由采样器解码到线性
    diffuseColor.rgb = mix(diffuseColor.rgb, al, uAlbK);
  }
  float cav = jk.g - 0.5;
  diffuseColor.rgb *= mix(1.0, 0.35 + 0.65 * jk.b, uAoK);                     // AO：压在固有色上（toon 只有直射分阶）
  diffuseColor.rgb *= 1.0 + clamp(cav * 2.0, 0.0, 1.0) * uCavK * 0.25;        // 凸棱提亮（毛梢、骨板边）
  diffuseColor.rgb *= 1.0 - clamp(-cav * 2.0, 0.0, 1.0) * uCavK * 0.55;       // 凹缝压暗
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.085, 0.095), clamp(jk.r * uInkK, 0.0, 1.0)); // 笔触墨
}`
      );
  };
  m.customProgramCacheKey = () => "jx-char-B";
  return m;
}

function addOutlines(root, width, skip) {
  const list = [];
  root.traverse((o) => o.isMesh && !o.userData.isOutline && !(skip && skip(o)) && list.push(o));
  const om = outlineMaterial(width);
  for (const m of list) {
    let o;
    if (m.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(m.geometry, om);
      o.bind(m.skeleton, m.bindMatrix);
    } else o = new THREE.Mesh(m.geometry, om);
    o.position.copy(m.position);
    o.quaternion.copy(m.quaternion);
    o.scale.copy(m.scale);
    o.userData.isOutline = !0;
    o.frustumCulled = !1;
    m.parent.add(o);
    m.userData.outline = o;
  }
}

export function applyCharLook(root, mode = "A", opts = {}) {
  const kind = opts.kind || (root.getObjectByName("qingya") || root.getObjectByName("qingya_v2") ? "qingya" : "hero");
  const pal = PALETTE[kind];
  let st = root.userData.charLook;
  if (!st) {
    st = root.userData.charLook = { kind, orig: new Map(), cache: { A: new Map(), B: new Map(), C: new Map() } };
    root.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline) {
        st.orig.set(o, o.material);
        o.castShadow = !0;
        o.frustumCulled = !1;
      }
    });
    // 精细版主角的脸 / 手不套反向外壳（鼻下、唇缝会穿出黑块）：轮廓交给水墨后期的深度描边（主管："描边只保留轮廓"）
    const skinSkip = !opts.legacy && kind === "hero" ? (o) => /^skin/i.test(o.material && o.material.name) : null;
    addOutlines(root, (opts.legacy ? OUTLINE : OUTLINE_V2)[kind], skinSkip);
  }
  if (opts.legacy && mode !== "A") mode = "A";
  const side = kind === "hero" ? THREE.DoubleSide : THREE.FrontSide;
  const ink = mode === "B" ? inkTexture(kind, opts.inkTex) : null;
  const cache = st.cache[mode];
  for (const [mesh, src] of st.orig) {
    let m = cache.get(src);
    if (!m) {
      const key = keyOf(pal, src.name) || Object.keys(pal)[0];
      const p = pal[key];
      if (mode === "A") {
        m = toon({ ...p, side });
        if (!opts.legacy && kind === "hero" && key === "skin") m.gradientMap = faceGradient();
      } else if (mode === "B") {
        const prm = { ...B_PARAMS[kind]._, ...(B_PARAMS[kind][key] || {}) };
        m = inkToon(p, src, ink, prm, side);
        if (kind === "hero" && key === "skin") m.gradientMap = faceGradient();
      } else {
        m = src;
        m.side = side;
        if (src.aoMap) src.aoMapIntensity = 0.6;
      }
      m.name = key;
      cache.set(src, m);
    }
    mesh.material = m;
  }
  return { kind, mode };
}

// 小样信息面板用：三角面 / 材质数 / 贴图尺寸
export function charStats(root) {
  let tris = 0;
  const texs = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    const m = o.userData && root.userData.charLook ? root.userData.charLook.orig.get(o) : o.material;
    for (const k of ["map", "normalMap", "aoMap", "roughnessMap"]) if (m && m[k] && m[k].image) texs.add(m[k].image.width + "×" + m[k].image.height);
  });
  return { tris: Math.round(tris), textures: [...texs] };
}
