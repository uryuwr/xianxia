// 关卡标记物：古传送阵、残阵、破洞府、遗府入口、Boss 场地、宝箱、采集点（灵草 / 矿）、灵光点、山神庙、跳点。
// 颜色约束：环境全用墨色；只有玩法相关的东西点色——阵纹石青、宝物金、封印朱砂、灵草石绿、矿铁青。
// 采集点 / 灵光点的表现规范见 docs/ui/v2/灵草采集_v1.md（UI 设计）。
import * as THREE from "three";
import { toon, U } from "../render/materials.js";
import { rng, NOISE } from "../render/glsl.js";
import { ITEMS } from "../core/items.js";
import { rarityTint } from "../fx/rarity_tint.js";
import { mergeGeos, rockGeo } from "./vegetation.js";
import { lantern, stele, pavilion } from "./props.js";

export const ACCENT = { blue: 0x2f86c8, gold: 0xe0a83a, red: 0xc23a2b, green: 0x3fb08a, iron: 0x7f9bb0, purple: 0x8a5ac0, white: 0xe8f4f8 };
const R = rng(4242);
const tr = (g, x, y, z, ry = 0, s = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s)));
const stoneMat = () => toon({ color: 0xa8a59b, tri: !0, brushK: 0.6, brushScale: 0.6 });
const mesh = (geo, mat, cast = !0) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = !0;
  return m;
};

// 竖向柔光柱（加色），颜色可调；uK 控制亮度（揭示 / 关闭时渐变）
function glowColumn(color, h = 3, w = 1.2, k = 1) {
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(color) }, uK: { value: k } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, position.y, 0.0, 1.0); mv.x += position.x; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime, uK; uniform vec3 uColor; varying vec2 vUv;
      void main(){ vec2 q = (vUv - vec2(0.5, 0.2)) * vec2(2.0, 1.0); float a = pow(max(0.0, 1.0 - length(q)), 2.0) * (0.8 + 0.2 * sin(uTime * 2.0 + vUv.y * 6.0)); gl_FragColor = vec4(uColor * a * 1.3 * uK, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2 - 0.1, 0), mat);
  m.renderOrder = 8;
  m.userData.glow = mat;
  return m;
}
// 地面阵纹：同心圆 + 八卦短划 + 缓慢旋转的符文环（石青）
function runeDisc(radius, color, k = 1) {
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(color) }, uK: { value: k }, uBroken: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime, uK, uBroken; uniform vec3 uColor; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float ring = smoothstep(0.025, 0.0, abs(r - 0.96)) + smoothstep(0.02, 0.0, abs(r - 0.78)) + 0.6 * smoothstep(0.015, 0.0, abs(r - 0.42));
        float ar = a + uTime * 0.25;
        float seg = step(0.5, fract(ar * 12.0 / 6.2832)) * smoothstep(0.04, 0.0, abs(r - 0.87)) * 1.2;
        float tri = smoothstep(0.02, 0.0, abs(fract((a - uTime * 0.1) * 8.0 / 6.2832) - 0.5) * r * 0.5) * step(0.45, r) * step(r, 0.76) * 0.5;
        float v = ring + seg + tri;
        float br = step(uBroken, hash(floor(vec2(a * 6.0, r * 6.0))));
        v *= mix(1.0, br * 0.8, step(0.01, uBroken));
        float pulse = 0.75 + 0.25 * sin(uTime * 1.6 - r * 4.0);
        gl_FragColor = vec4(uColor * v * pulse * uK * step(r, 1.0), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), mat);
  m.position.y = 0.06;
  m.renderOrder = 7;
  m.userData.glow = mat;
  return m;
}

// ---------------- 撤离点 ----------------
// 古传送阵：圆形石台 + 八根短石柱 + 石青阵纹
export function gateMarker(radius = 3.2) {
  const g = new THREE.Group();
  const stone = stoneMat();
  const parts = [new THREE.CylinderGeometry(radius + 0.4, radius + 0.7, 0.35, 32).translate(0, 0.0, 0), new THREE.CylinderGeometry(radius - 0.2, radius, 0.18, 32).translate(0, 0.2, 0)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const h = 1.2 + (k % 2) * 0.5;
    parts.push(tr(new THREE.BoxGeometry(0.42, h, 0.42).translate(0, h / 2, 0), Math.cos(a) * (radius + 0.2), 0.1, Math.sin(a) * (radius + 0.2), -a));
    parts.push(tr(new THREE.BoxGeometry(0.56, 0.14, 0.56).translate(0, h + 0.07, 0), Math.cos(a) * (radius + 0.2), 0.1, Math.sin(a) * (radius + 0.2), -a));
  }
  g.add(mesh(mergeGeos(parts), stone));
  const disc = runeDisc(radius, ACCENT.blue, 1);
  disc.position.y = 0.32;
  g.add(disc);
  // 柱顶的石青灵光
  const crystals = [];
  for (let k = 0; k < 8; k += 2) {
    const a = (k / 8) * Math.PI * 2;
    crystals.push(new THREE.OctahedronGeometry(0.16).translate(Math.cos(a) * (radius + 0.2), 1.75 + 0.25, Math.sin(a) * (radius + 0.2)));
  }
  g.add(mesh(mergeGeos(crystals), toon({ color: ACCENT.blue, emissive: ACCENT.blue, emissiveIntensity: 0.8 }), !1));
  const col = glowColumn(ACCENT.blue, 5, 2.2, 0.6);
  g.add(col);
  g.userData.glows = [disc.userData.glow, col.userData.glow];
  g.userData.collide = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.userData.collide.push([Math.cos(a) * (radius + 0.2), Math.sin(a) * (radius + 0.2), 0.35]);
  }
  return g;
}
// 残阵：半埋的破石台、倒伏的石柱、断续的阵纹。未明时灰白；靠近后真阵转石青、伪阵裂出朱砂
export function ruinMarker(radius = 3.2, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed * 977);
  const stone = toon({ color: 0x9a978c, tri: !0, brushK: 0.75, brushScale: 0.6 });
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.3;
    if (r() < 0.25) continue;
    const slab = new THREE.BoxGeometry(1.9, 0.22, 1.1);
    slab.rotateZ((r() - 0.5) * 0.2);
    parts.push(tr(slab, Math.cos(a) * radius * 0.7, 0.02 + r() * 0.08, Math.sin(a) * radius * 0.7, -a + Math.PI / 2));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const fallen = r() < 0.6;
    const h = fallen ? 1.4 : 0.6 + r() * 0.9;
    const p = new THREE.BoxGeometry(0.4, h, 0.4).translate(0, h / 2, 0);
    if (fallen) p.rotateZ(Math.PI / 2 - 0.1).translate(0, 0.2, 0);
    parts.push(tr(p, Math.cos(a) * (radius + 0.3), 0, Math.sin(a) * (radius + 0.3), r() * 3));
  }
  g.add(mesh(mergeGeos(parts), stone));
  const disc = runeDisc(radius, 0x9aa0a0, 0.35);
  disc.userData.glow.uniforms.uBroken.value = 0.45;
  g.add(disc);
  const col = glowColumn(0xb8c0c0, 3.5, 1.6, 0.25);
  g.add(col);
  g.userData.glows = [disc.userData.glow, col.userData.glow];
  g.userData.state = "unknown";
  // reveal("real" | "fake" | "unknown" | "off")
  g.userData.reveal = (state) => {
    g.userData.state = state;
    const c = state === "real" ? ACCENT.blue : state === "fake" ? ACCENT.red : 0x9aa0a0;
    const k = state === "real" ? 0.9 : state === "fake" ? 0.6 : state === "off" ? 0 : 0.35;
    disc.userData.glow.uniforms.uColor.value.set(c);
    disc.userData.glow.uniforms.uK.value = k;
    disc.userData.glow.uniforms.uBroken.value = state === "fake" ? 0.7 : state === "real" ? 0.15 : 0.45;
    col.userData.glow.uniforms.uColor.value.set(c);
    col.userData.glow.uniforms.uK.value = k * 0.6;
  };
  return g;
}
// 破洞府：崖脚的洞口——山石拱圈、黑洞、倒下的木门、门前一盏点亮的旧灯（金）
export function caveMarker() {
  const g = new THREE.Group();
  const rock = toon({ color: 0x7c776c, tri: !0, brushK: 0.8, brushScale: 0.5 });
  const arch = [];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI;
    const s = 0.75 + R() * 0.35;
    const geo = rockGeo(k * 3.1 + 1, 1).scale(s, s * 1.1, s * 0.9);
    arch.push(tr(geo, Math.cos(a) * 2.1, Math.sin(a) * 2.6 + 0.2, -1.4 + R() * 0.3, R() * 3));
  }
  arch.push(tr(rockGeo(17, 1).scale(2.6, 1.0, 1.6), 0, 3.0, -1.9, 0.3));
  g.add(mesh(mergeGeos(arch), rock));
  // 洞口：竖直的墨色半椭圆
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24, 0, Math.PI).scale(1, 1.35, 1).translate(0, 0.05, -1.75), new THREE.MeshBasicMaterial({ color: 0x0b0d0e }));
  g.add(hole);
  const wood = toon({ color: 0x4a3c30, tri: !0, brushK: 0.5, brushScale: 1.2 });
  const door = [];
  for (let k = 0; k < 4; k++) door.push(new THREE.BoxGeometry(0.3, 1.9, 0.08).translate(-0.45 + k * 0.32, 0.95, 0));
  door.push(new THREE.BoxGeometry(1.3, 0.12, 0.1).translate(0, 1.5, 0.05), new THREE.BoxGeometry(1.3, 0.12, 0.1).translate(0, 0.4, 0.05));
  const dm = mesh(mergeGeos(door), wood);
  dm.rotation.set(-1.25, 0.4, 0);
  dm.position.set(1.2, 0.18, 0.2);
  g.add(dm);
  const lamp = lantern(-2.6, 0.6, [], 0);
  lamp.scale.setScalar(0.8);
  g.add(lamp);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6).translate(-2.6, 1.07, 0.6), toon({ color: ACCENT.gold, emissive: ACCENT.gold, emissiveIntensity: 1.2 }));
  g.add(flame);
  // 灵光从洞里透出：放在洞口一侧的灯旁，不遮住黑洞
  const col = glowColumn(ACCENT.gold, 3.2, 1.4, 0.6);
  col.position.set(-2.6, 0.2, 0.6);
  g.add(col);
  g.userData.glows = [col.userData.glow];
  g.userData.collide = [[-2.6, 0.6, 0.3], [-2.0, -1.4, 0.7], [2.0, -1.4, 0.7]];
  return g;
}

// ---------------- 遗府入口（封印石门） ----------------
// style "cellar"：地上的石板门 + 朱砂封条；"cliff"：崖壁上的石门，门楣剑纹
export function denMarker(style = "cliff") {
  const g = new THREE.Group();
  const stone = toon({ color: 0x8e8b82, tri: !0, brushK: 0.7, brushScale: 0.7 });
  const red = toon({ color: ACCENT.red, emissive: 0x6a120c, emissiveIntensity: 0.7 });
  if (style === "cellar") {
    const parts = [new THREE.BoxGeometry(3.0, 0.3, 2.4).translate(0, 0.1, 0), new THREE.BoxGeometry(2.2, 0.16, 1.7).translate(0, 0.33, 0)];
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.3, 0.9, 0.3).translate(sx * 1.35, 0.45, -1.05));
    g.add(mesh(mergeGeos(parts), stone));
    const seal = [new THREE.BoxGeometry(2.3, 0.02, 0.24).rotateY(0.6).translate(0, 0.42, 0), new THREE.BoxGeometry(2.3, 0.02, 0.24).rotateY(-0.6).translate(0, 0.42, 0)];
    g.add(mesh(mergeGeos(seal), red, !1));
    g.userData.collide = [[0, 0, 1.2]];
  } else {
    const parts = [];
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.6, 3.6, 0.6).translate(sx * 1.6, 1.8, 0));
    parts.push(new THREE.BoxGeometry(4.4, 0.5, 0.8).translate(0, 3.85, 0), new THREE.BoxGeometry(3.6, 0.3, 0.6).translate(0, 4.25, 0));
    parts.push(new THREE.BoxGeometry(2.6, 3.4, 0.3).translate(0, 1.7, -0.15));
    g.add(mesh(mergeGeos(parts), stone));
    // 门上的剑纹与朱砂封条
    const sword = [new THREE.BoxGeometry(0.08, 2.0, 0.04).translate(0, 1.9, 0.03), new THREE.BoxGeometry(0.5, 0.08, 0.04).translate(0, 1.15, 0.03)];
    g.add(mesh(mergeGeos(sword), toon({ color: 0x2c3a44, emissive: 0x2a5a80, emissiveIntensity: 0.5 }), !1));
    const seal = [new THREE.BoxGeometry(0.22, 2.8, 0.03).rotateZ(0.5).translate(0, 1.7, 0.05), new THREE.BoxGeometry(0.22, 2.8, 0.03).rotateZ(-0.5).translate(0, 1.7, 0.05)];
    g.add(mesh(mergeGeos(seal), red, !1));
    g.userData.collide = [[-1.6, 0, 0.45], [1.6, 0, 0.45], [0, -0.2, 0.9]];
  }
  const col = glowColumn(ACCENT.red, 3.5, 2.2, 0.35);
  g.add(col);
  g.userData.glows = [col.userData.glow];
  return g;
}

// ---------------- Boss 场地：一圈立石 + 兽骨 ----------------
export function arenaMarker(rx, rz, ground, cx, cz, gap = 0.18, avoid = []) {
  const R = rng(Math.round(cx * 31 + cz * 17) >>> 0);
  const g = new THREE.Group();
  const stone = toon({ color: 0x77736a, tri: !0, brushK: 0.8, brushScale: 0.5 });
  const parts = [];
  const n = Math.max(8, Math.round(((rx + rz) * Math.PI) / 7));
  const collide = [];
  for (let k = 0; k < n; k++) {
    if (R() < gap) continue;
    const a = (k / n) * Math.PI * 2 + (R() - 0.5) * 0.15;
    const x = cx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
    if (avoid.some(([ax, az, ar]) => (ax - x) ** 2 + (az - z) ** 2 < (ar + 0.8) ** 2)) continue;
    const h = 1.6 + R() * 2.2;
    const geo = rockGeo(k * 1.7 + 3, 1).scale(0.55, h * 0.6, 0.45);
    geo.rotateZ((R() - 0.5) * 0.25);
    parts.push(tr(geo, x - cx, ground(x, z) + h * 0.35, z - cz, -a));
    collide.push([x - cx, z - cz, 0.5]);
  }
  g.add(mesh(mergeGeos(parts), stone));
  g.userData.collide = collide;
  return g;
}
// 兽骨：几根弯骨 + 一个头骨轮廓（墨色）
export function bones() {
  const mat = toon({ color: 0xd8d2c0, tri: !0, brushK: 0.4, brushScale: 1.2 });
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = R() * 6.28;
    const pts = [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.35, 0.35, 0.1), new THREE.Vector3(0.75, 0.05, 0.05)];
    parts.push(tr(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.045, 4, !1), (R() - 0.5) * 1.4, 0, (R() - 0.5) * 1.4, a));
  }
  parts.push(new THREE.SphereGeometry(0.28, 8, 6).scale(1, 0.75, 1.4).translate(0.4, 0.2, -0.5));
  return mesh(mergeGeos(parts), mat);
}

// ---------------- 宝箱 ----------------
// 设计见 docs/ui/v2/灵草采集_v1.md §宝箱。三档一眼可分（去饱和也能分：靠箍色深浅 + 光柱有无 + 双圈）：
//   normal 普通：赭墨木箱 + 铁箍，脚下一圈凡品色，无光
//   glow   灵光：焦墨漆箱 + 泥金包角箍，宝品色双圈 + 光柱 + 微粒
//   night  夜明：黛青漆箱 + 月白箍（入夜仍亮），仙品色圆相 + 光柱 + 微粒
// 箱盖挂在后沿的转轴上（userData.lid），开箱动画转它；o.opened 直接做成"已开启"的样子（盖掀开、无光、无圈）；
// o.bare 不加圆相 / 光柱；o.dim 压暗（开箱动画用 bare + dim，盖子由动画掀开）。
const CHEST_STYLE = {
  normal: { wood: 0x5c4a3a, trim: 0x2c2f31, trimE: 0x000000, trimK: 0, tier: "chest" },
  glow: { wood: 0x3a2e28, trim: 0xc09a40, trimE: 0x6a4a10, trimK: 0.55, tier: "glow", caps: !0 },
  night: { wood: 0x2c3842, trim: 0xb4d4e2, trimE: 0x2a6a90, trimK: 0.7, tier: "night", caps: !0 },
};
export function chestMarker(tier = "normal", o = {}) {
  const g = new THREE.Group();
  const S = CHEST_STYLE[tier] || CHEST_STYLE.normal;
  const W = 1.0, H = 0.5, D = 0.66, LR = D / 2;
  const dull = o.opened || o.dim; // 已开启：木色压暗、箍不再发光
  const wood = toon({ color: dull ? dim(S.wood) : S.wood, tri: !0, brushK: 0.4, brushScale: 1.4 });
  const trimMat = toon({ color: dull ? dim(S.trim) : S.trim, emissive: dull ? 0 : S.trimE, emissiveIntensity: dull ? 0 : S.trimK });
  // 箱身 + 底座
  g.add(mesh(mergeGeos([new THREE.BoxGeometry(W, H, D).translate(0, H / 2 + 0.06, 0), new THREE.BoxGeometry(W + 0.1, 0.08, D + 0.1).translate(0, 0.04, 0)]), wood));
  // 箱内（开盖后看见的黑）
  g.add(mesh(new THREE.BoxGeometry(W - 0.1, 0.02, D - 0.1).translate(0, H + 0.055, 0), new THREE.MeshBasicMaterial({ color: 0x0b0d0e }), !1));
  const trims = [];
  for (const sx of [-0.4, 0.4]) trims.push(new THREE.BoxGeometry(0.08, H + 0.02, D + 0.02).translate(sx, H / 2 + 0.06, 0));
  trims.push(new THREE.BoxGeometry(0.17, 0.2, 0.05).translate(0, H - 0.04, D / 2 + 0.02)); // 锁扣
  if (S.caps) for (const sx of [-1, 1]) for (const sz of [-1, 1]) trims.push(new THREE.BoxGeometry(0.14, 0.14, 0.14).translate(sx * (W / 2 - 0.04), 0.13, sz * (D / 2 - 0.04)));
  g.add(mesh(mergeGeos(trims), trimMat));
  // 箱盖：半圆拱，挂在后沿转轴上
  const pivot = new THREE.Group();
  pivot.position.set(0, H + 0.06, -D / 2);
  const lid = new THREE.CylinderGeometry(LR, LR, W, 10, 1, !1, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, LR);
  pivot.add(mesh(lid, wood));
  const lt = [];
  for (const sx of [-0.4, 0.4]) lt.push(new THREE.TorusGeometry(LR + 0.01, 0.035, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(sx, 0, LR));
  lt.push(new THREE.BoxGeometry(0.15, 0.12, 0.05).translate(0, 0.04, D + 0.01));
  pivot.add(mesh(mergeGeos(lt), trimMat));
  g.add(pivot);
  g.userData.lid = pivot;
  g.userData.glows = [];
  if (o.opened) pivot.rotation.x = -1.95;
  else if (!o.bare) decorateGather(g, S.tier, CHEST_Q[tier] ?? 0);
  g.userData.collide = [[0, 0, 0.55]];
  return g;
}
const dim = (c) => new THREE.Color(c).multiplyScalar(0.62).getHex();

// ---------------- 亭中供案（搜取容器，docs/ui/v2/搜取_v1.md §10） ----------------
// 亭子中央一张矮供案，案上一只三足香炉、三炷香，香头一点暗红；炉口缓缓升起几缕淡灰"香烟"（复用灵气微粒，颜色取纸灰）。
// 与宝箱同一层级：toon 着色 + 后期墨线，脚下一圈凡品色淡墨圆相（开之前不剧透）。
export function altarMarker() {
  const g = new THREE.Group();
  const wood = toon({ color: 0x4a3c32, tri: !0, brushK: 0.45, brushScale: 1.3 });
  const bronze = toon({ color: 0x5c5a4a, tri: !0, brushK: 0.5, brushScale: 1.6 });
  const parts = [new THREE.BoxGeometry(1.1, 0.07, 0.6).translate(0, 0.52, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.07, 0.5, 0.07).translate(sx * 0.48, 0.25, sz * 0.24));
  parts.push(new THREE.BoxGeometry(1.0, 0.05, 0.05).translate(0, 0.12, 0.24), new THREE.BoxGeometry(1.0, 0.05, 0.05).translate(0, 0.12, -0.24));
  g.add(mesh(mergeGeos(parts), wood));
  // 三足香炉
  const pot = [new THREE.CylinderGeometry(0.17, 0.13, 0.16, 10).translate(0, 0.68, 0), new THREE.TorusGeometry(0.17, 0.02, 4, 12).rotateX(Math.PI / 2).translate(0, 0.76, 0)];
  for (let k = 0; k < 3; k++) pot.push(new THREE.CylinderGeometry(0.018, 0.012, 0.1, 4).translate(Math.cos((k * 2 * Math.PI) / 3) * 0.1, 0.59, Math.sin((k * 2 * Math.PI) / 3) * 0.1));
  for (const sx of [-1, 1]) pot.push(new THREE.TorusGeometry(0.04, 0.012, 4, 8).translate(sx * 0.19, 0.76, 0));
  g.add(mesh(mergeGeos(pot), bronze));
  const sticks = [];
  for (let k = -1; k <= 1; k++) sticks.push(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 3).rotateZ(k * 0.12).translate(k * 0.04, 0.9, 0));
  g.add(mesh(mergeGeos(sticks), toon({ color: 0x8a5a34 }), !1));
  const ember = [];
  for (let k = -1; k <= 1; k++) ember.push(new THREE.SphereGeometry(0.014, 5, 4).translate(k * 0.06, 1.06, 0));
  g.add(mesh(mergeGeos(ember), toon({ color: 0xc8402a, emissive: 0xc8402a, emissiveIntensity: 0.9 }), !1));
  // 两只供盘
  const dish = toon({ color: 0xd8d2c0, tri: !0, brushK: 0.4 });
  for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.04, 10).translate(sx * 0.36, 0.58, 0.02), dish, !1));
  g.userData.glows = [];
  decorateGather(g, "chest", 0);
  // 香烟：淡灰、慢、细（灵气微粒的另一组参数）
  const smoke = spiritMotes(6, 0x9a968c, 0.05, 1.4, 0.45);
  smoke.position.y = 0.85;
  g.add(smoke);
  g.userData.glows.push(smoke.userData.glow);
  g.userData.collide = [[0, 0, 0.55]];
  return g;
}

// ---------------- 采集点（灵草 / 矿脉）与灵光点 ----------------
// 设计：docs/ui/v2/灵草采集_v1.md。三层表现，层层都可以单独关掉：
//   ① 写意植株：toon 着色 + 后期墨线，叶片是两头尖的柳叶形（不再用自发光的"荧光绿"平面——后期会把高饱和色原样保留，显得像塑料）
//   ② 脚下一笔圆相（风格指南 §6.1"可交互物脚下的淡墨圈"）：起笔重、收笔飞白、留缺口；白天是墨线 + 纸色外晕，入夜转成灯色线
//      （关卡的 setTimeOfDay 会把 userData.glows 的 uK 在夜里放大到 ~1.7，圆相据此切换）；靠近可交互时 uFocus → 1：墨变浓、圈收紧
//   ③ 灵气微粒：加色小点缓缓上升，品阶越高越多
// 颜色只有一套品质（src/core/items.js RARITY）：圈色 / 光柱 / 微粒都取"该点产出物的品质"（src/fx/rarity_tint.js 降饱和 / 压暗 / 提亮）。
// 形制（大小、微粒多少、有无光柱、双圈）按点的种类区分，不是品级，也不在界面上显示名字：
//   herb 灵草丛 · bush 灌木 / 藤（赤炎果、紫藤）· root 块根（何首乌，带短光柱）· ore 矿脉 · glow 灵光点（双圈 + 高光柱）
//   chest 普通宝箱 · night 夜明宝箱（光柱）；灵光宝箱用 glow 形制
// 宝箱的圈色按该档宝箱常见的最高品质：普通 = 凡品、灵光 = 宝品、夜明 = 仙品（开箱前不剧透具体内容）
export const GATHER_TIER = {
  herb: { motes: 7, r: 0.95, mh: 1.2 },
  bush: { motes: 10, r: 1.05, mh: 1.4 },
  root: { motes: 16, r: 1.3, mh: 1.8, column: !0 },
  ore: { motes: 4, r: 1.25, mh: 1.0 },
  glow: { motes: 24, r: 1.7, mh: 2.6, column: !0, double: !0 },
  chest: { motes: 0, r: 1.05, mh: 1 },
  night: { motes: 12, r: 1.3, mh: 1.8, column: !0 },
};
export function gatherTier(kind, cat) {
  if (cat === "glow") return "glow";
  if (cat === "ore" || kind === "ore" || kind === "tiejing" || kind === "lingtu") return "ore";
  if (kind === "heshouwu") return "root";
  if (kind === "ziteng" || kind === "chiyan") return "bush";
  return "herb";
}
// 采集点 / 灵光点 → 主要产出物（取它的品质）
const KIND_ITEM = { qingling: "qingling_cao", ninglu: "ninglu_hua", hanlu: "hanlu_cao", ziteng: "zi_teng", chiyan: "chiyan_guo", heshouwu: "heshouwu", tiejing: "tiejing_shi", lingtu: "ling_tu", ore: "tiejing_shi", herb: "qingling_cao", wolfking_bone: "wolfking_bone", lingbang: "lingbang_zhu", furnace_part: "furnace_part", water_jade: "water_jade", zhuxin: "zhuxin", zhenpan: "zhenpan_sword" };
export function gatherRarity(kind, cat) {
  const d = ITEMS[KIND_ITEM[kind]];
  return d ? d.rarity || 0 : cat === "glow" ? 1 : 0;
}
const CHEST_Q = { normal: 0, glow: 2, night: 3 };

// 脚下一笔圆相（贴地的着色器平面）。uDraw 0→1 控制画出多少（采下时用来"一笔收拢"），uAlpha 整体淡出
export function inkEnso(radius, q = 0, seed = 0, double = !1) {
  const T = rarityTint(q);
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    depthTest: !1, // 贴地圆相不被坡地 / 河岸吃掉（淡、先画，压在脚上也不碍事）
    uniforms: {
      uTime: U.uTime,
      uK: { value: 1 },
      uFocus: { value: 0 },
      uDraw: { value: 1 },
      uAlpha: { value: 1 },
      uSeed: { value: seed },
      uDouble: { value: double ? 1 : 0 },
      uInk: { value: new THREE.Color(T.ink) },
      uCol: { value: new THREE.Color(T.ring) },
      uLight: { value: new THREE.Color(T.light) },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uK, uFocus, uDraw, uAlpha, uSeed, uDouble; uniform vec3 uInk, uCol, uLight; varying vec2 vUv;
      ${NOISE}
      // 一笔：从 rot 处起笔，绕 (1-gap) 圈；w0 起笔宽、w1 收笔宽；返回墨量，halo 返回外晕范围
      float brush(vec2 p, float rr, float gap, float rot, float w0, float w1, out float halo){
        float r = length(p), a = atan(p.y, p.x);
        float s = fract(a / 6.2831853 + 0.5 + rot);
        float u = (s - gap) / (1.0 - gap);
        float on = step(0.0, u) * step(u, uDraw);
        float rad = rr + 0.022 * sin(a * 3.0 + uSeed * 7.0) + 0.01 * sin(a * 7.0 + uSeed * 3.0);
        float w = mix(w0, w1, smoothstep(0.0, 1.0, u)) * (1.0 + 0.7 * smoothstep(0.07, 0.0, u)) * (1.0 + 0.4 * clamp((uK - 1.0) / 0.65, 0.0, 1.0));   // 起笔顿；入夜笔更粗
        float d = abs(r - rad);
        float n = vnoise(vec2(u * 70.0 + uSeed * 13.0, (r - rad) / max(w, 1e-3) * 2.4));             // 飞白：沿笔向的丝
        float th = mix(-0.3, 0.62, u * u);
        float dry = smoothstep(th, th + 0.18, n);
        halo = smoothstep(w + 0.13, w, d) * on;
        return smoothstep(w, w * 0.5, d) * on * dry;
      }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float night = clamp((uK - 1.0) / 0.65, 0.0, 1.0);
        float foc = uFocus;
        float breath = 0.74 + 0.26 * sin(uTime * 2.6 + uSeed * 6.0);   // 呼吸 2.4s 左右
        float rr = 0.8 - 0.05 * foc;
        float h1, h2 = 0.0;
        float s = brush(p, rr, 0.11, uSeed, 0.1, 0.032, h1);
        if (uDouble > 0.5) s = max(s, 0.85 * brush(p, 0.6, 0.38, uSeed + 0.5 + uTime * 0.035, 0.06, 0.022, h2));
        float h = max(h1, h2);
        // 圈内一团同色淡晕
        float wash = smoothstep(rr + 0.05, 0.05, r) * (0.1 + 0.1 * foc) * uDraw;
        vec3 lineC = mix(mix(uInk, uCol, 0.5), uLight, night);
        vec3 haloC = mix(vec3(0.965, 0.945, 0.9), uCol, night);
        float aH = h * (0.34 + 0.3 * foc) * (1.0 - 0.55 * night) * (1.0 - s);
        float aL = s * (0.62 + 0.38 * foc + 0.2 * night);
        // 前乘叠加：外晕 → 淡晕 → 墨线
        vec3 C = haloC * aH; float A = aH;
        C = uCol * wash + C * (1.0 - wash); A = wash + A * (1.0 - wash);
        C = lineC * aL + C * (1.0 - aL); A = aL + A * (1.0 - aL);
        vec3 col = C / max(A, 1e-3);
        gl_FragColor = vec4(col, A * mix(breath, 1.0, foc) * uAlpha);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), mat);
  m.position.y = 0.1;
  m.renderOrder = 7;
  m.userData.glow = mat;
  return m;
}

// 灵气微粒：一组缓缓上升、绕根部轻转的加色小点（着色器里算位置，CPU 不更新）
export function spiritMotes(n, color, radius = 0.5, height = 1.2, size = 0.55) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = R();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uK: { value: 1 }, uFocus: { value: 0 }, uColor: { value: new THREE.Color(color) }, uR: { value: radius }, uH: { value: height }, uSize: { value: size } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime, uR, uH, uSize, uFocus, uK; varying float vA;
      void main(){
        float ph = fract(uTime * (0.1 + 0.12 * aSeed.x) * (1.0 + 0.6 * uFocus) + aSeed.y);
        float ang = aSeed.z * 6.2832 + uTime * 0.35 * (aSeed.w - 0.5);
        float rad = uR * (0.2 + 0.8 * aSeed.w) * (1.0 - 0.55 * ph);
        vec3 p = vec3(cos(ang) * rad + 0.07 * sin(uTime * 1.7 + aSeed.x * 9.0), 0.12 + ph * uH, sin(ang) * rad);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = sin(ph * 3.14159);
        gl_PointSize = uSize * (0.6 + 0.5 * aSeed.x) * (300.0 / max(1.0, -mv.z)) * (0.6 + 0.4 * vA) * (0.75 + 0.35 * uK);   // 入夜微粒更大
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uK, uFocus; varying float vA;
      void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; float a = (1.0 - d); a *= a;
        gl_FragColor = vec4(uColor * a * vA * (0.5 + 0.5 * uK) * (1.0 + 0.5 * uFocus), 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = !1;
  pts.renderOrder = 9;
  pts.userData.glow = mat;
  return pts;
}

// 柳叶形叶片：两头尖、中间宽，沿长度向外弯，中脉略折（toon 下有明暗两面）
function leafGeo(len, wid, bend = 0.3, lean = 0.3) {
  const g = new THREE.PlaneGeometry(wid, len, 2, 6).translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len, x = p.getX(i);
    const f = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, t) * 1.05))), 0.75);
    p.setX(i, x * f);
    p.setZ(i, bend * t * t - Math.abs(x * f) * 0.35);
  }
  g.rotateX(lean);
  g.computeVertexNormals();
  return g;
}
// 一丛叶：n 片，朝外均匀分布
function leafTuft(n, len, wid, bend, lean, jitter = 0.25) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const l = len * (0.78 + R() * 0.35);
    out.push(leafGeo(l, wid * (0.85 + R() * 0.3), bend * (0.8 + R() * 0.4), lean + (R() - 0.5) * jitter).rotateY((k / n) * Math.PI * 2 + R() * 0.5));
  }
  return out;
}
const budMat = (c, e = 0.7) => toon({ color: c, emissive: c, emissiveIntensity: e });

const HERB_STYLE = {
  qingling: { leaf: 0x6aa878 }, // 青灵草：一丛修长的柳叶 + 三枚玉色灵芽
  ninglu: { leaf: 0x78a892, flower: 0xf1f3ec, dew: 0xa8e4f4 }, // 凝露花：矮叶 + 三朵白花，花心一滴露
  hanlu: { leaf: 0x86b4b8, frost: 0xeaf6fa }, // 寒露草：霜青细叶，叶尖凝霜
  ziteng: { leaf: 0x56805a, vine: 0x7a5c98 }, // 紫藤：缠在枯桩上的紫藤
  chiyan: { leaf: 0x5f8f56, fruit: 0xc8402a }, // 赤炎果：红果小灌木
  heshouwu: { leaf: 0x5a7a4e, root: 0x8a5a34 }, // 何首乌：露出地面的人形块根
};

export function gatherMarker(kind, cat = "herb") {
  const g = new THREE.Group();
  const tier = gatherTier(kind, cat);
  const T = GATHER_TIER[tier];
  g.userData.glows = [];
  if (tier === "ore") {
    const rock = toon({ color: 0x6e7072, tri: !0, brushK: 0.75, brushScale: 0.8 });
    const geo = mergeGeos([rockGeo(5.5, 1).scale(0.9, 0.7, 0.8), tr(rockGeo(8.1, 1).scale(0.55, 0.5, 0.5), 0.7, 0, 0.3, 1)]);
    g.add(mesh(geo, rock));
    // 矿脉：石缝里斜出的几簇灰青晶（低饱和，不自发强光；墨线由后期勾出）
    const xs = [];
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + R() * 0.6, cx = Math.cos(a) * 0.55, cz = Math.sin(a) * 0.5, cy = 0.35 + R() * 0.25;
      for (let j = 0; j < 3; j++) {
        const h = 0.22 + R() * 0.2;
        const c = new THREE.CylinderGeometry(0, 0.06 + R() * 0.03, h, 5).translate(0, h / 2, 0);
        c.rotateZ((R() - 0.5) * 0.9).rotateX((R() - 0.5) * 0.9);
        xs.push(c.translate(cx + (R() - 0.5) * 0.12, cy, cz + (R() - 0.5) * 0.12));
      }
    }
    g.add(mesh(mergeGeos(xs), toon({ color: 0x9fb4c2, emissive: 0x2a4a60, emissiveIntensity: 0.45 }), !1));
    g.userData.collide = [[0, 0, 0.8]];
  } else {
    const st = HERB_STYLE[kind] || HERB_STYLE.qingling;
    const leafMat = toon({ color: st.leaf, side: THREE.DoubleSide, wind: [0.08, 0.9] });
    const leaves = [];
    const deco = [];
    if (kind === "heshouwu") {
      const root = toon({ color: st.root, tri: !0, brushK: 0.5, brushScale: 2 });
      const parts = [new THREE.SphereGeometry(0.34, 10, 8).scale(1, 0.8, 0.9).translate(0, 0.15, 0), new THREE.SphereGeometry(0.21, 8, 6).translate(0.27, 0.34, 0.1)];
      for (let k = 0; k < 5; k++) parts.push(new THREE.CylinderGeometry(0.05, 0.015, 0.7, 4).rotateZ(0.9 + k * 0.35).rotateY(k * 1.3).translate(0, 0.05, 0));
      g.add(mesh(mergeGeos(parts), root));
      // 藤叶：心形小叶沿两根细藤向上
      for (let k = 0; k < 9; k++) leaves.push(leafGeo(0.26, 0.24, 0.12, 1.0).rotateY(k * 2.4).translate(Math.cos(k * 2.4) * 0.12, 0.4 + k * 0.06, Math.sin(k * 2.4) * 0.12));
      deco.push([0xf2e6c4, [0, 0.95, 0], 0.06]);
    } else if (kind === "ziteng") {
      const stump = toon({ color: 0x4e4236, tri: !0, brushK: 0.6, brushScale: 1.5 });
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.4, 0.95, 7).translate(0, 0.47, 0), stump));
      const pts = [];
      for (let k = 0; k <= 26; k++) pts.push(new THREE.Vector3(Math.cos(k * 0.8) * 0.36, 0.05 + k * 0.042, Math.sin(k * 0.8) * 0.36));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 52, 0.045, 5, !1), toon({ color: st.vine, emissive: 0x2a1640, emissiveIntensity: 0.3 })));
      for (let k = 0; k < 10; k++) leaves.push(leafGeo(0.24, 0.12, 0.1, 1.1).rotateY(k * 2.4).translate(Math.cos(k * 0.8 * 2.6) * 0.4, 0.25 + k * 0.09, Math.sin(k * 0.8 * 2.6) * 0.4));
      // 垂下的紫花串
      for (let k = 0; k < 3; k++) deco.push([0xb79ad8, [Math.cos(k * 2.1) * 0.42, 0.75 + k * 0.12, Math.sin(k * 2.1) * 0.42], 0.06]);
    } else if (kind === "chiyan") {
      leaves.push(...leafTuft(11, 0.8, 0.2, 0.4, 0.5));
      for (let k = 0; k < 6; k++) {
        const a = R() * 6.28, r = 0.18 + R() * 0.22;
        deco.push([st.fruit, [Math.cos(a) * r, 0.5 + R() * 0.3, Math.sin(a) * r], 0.08]);
      }
    } else if (kind === "ninglu") {
      leaves.push(...leafTuft(7, 0.55, 0.2, 0.28, 0.75));
      const petals = [];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 6.28 + 0.4, r = k ? 0.17 : 0.02, y = 0.62 + k * 0.08;
        const cup = new THREE.ConeGeometry(0.13, 0.1, 6, 1, !0).rotateX(Math.PI).translate(Math.cos(a) * r, y + 0.04, Math.sin(a) * r);
        petals.push(cup, new THREE.CylinderGeometry(0.012, 0.016, y, 4).translate(Math.cos(a) * r * 0.6, y / 2, Math.sin(a) * r * 0.6));
        deco.push([st.dew, [Math.cos(a) * r, y + 0.03, Math.sin(a) * r], 0.035]);
      }
      g.add(mesh(mergeGeos(petals), toon({ color: st.flower, emissive: 0xd8e6ee, emissiveIntensity: 0.25, side: THREE.DoubleSide }), !1));
    } else if (kind === "hanlu") {
      leaves.push(...leafTuft(10, 0.72, 0.1, 0.3, 0.35));
      for (let k = 0; k < 6; k++) {
        const a = R() * 6.28, r = 0.2 + R() * 0.2;
        deco.push([st.frost, [Math.cos(a) * r, 0.55 + R() * 0.2, Math.sin(a) * r], 0.035]);
      }
    } else {
      // 青灵草
      leaves.push(...leafTuft(8, 0.85, 0.15, 0.38, 0.3));
      const stalks = [];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 6.28, r = 0.06, h = 0.78 + k * 0.08;
        stalks.push(new THREE.CylinderGeometry(0.01, 0.016, h, 4).rotateZ((R() - 0.5) * 0.25).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r));
        deco.push([0xe2f4dc, [Math.cos(a) * r, h + 0.02, Math.sin(a) * r], 0.05]);
      }
      g.add(mesh(mergeGeos(stalks), toon({ color: 0x4d7a52 }), !1));
    }
    if (leaves.length) g.add(mesh(mergeGeos(leaves), leafMat, !1));
    // 灵芽 / 花心露 / 果 / 霜：小而亮的点（低饱和、带一点自发光，夜里仍看得见）
    const byColor = new Map();
    for (const [c, p, s] of deco) {
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c).push(new THREE.IcosahedronGeometry(s, 0).translate(p[0], p[1], p[2]));
    }
    for (const [c, list] of byColor) g.add(mesh(mergeGeos(list), budMat(c, c === 0xc8402a ? 0.35 : 0.65), !1));
  }
  decorateGather(g, tier, gatherRarity(kind, cat));
  return g;
}

// 圆相 + 微粒 + （块根 / 灵光 / 夜明）光柱；颜色 = 品质 q；登记到 userData.glows（入夜放大）与 userData.gather（靠近时聚焦）
function decorateGather(g, tier, q = 0) {
  const T = GATHER_TIER[tier], C = rarityTint(q);
  const enso = inkEnso(T.r, q, R(), T.double);
  const motes = T.motes ? spiritMotes(T.motes, C.light, T.r * 0.55, T.mh, tier === "glow" ? 0.7 : 0.55) : null;
  g.add(enso);
  g.userData.glows.push(enso.userData.glow);
  if (motes) g.add(motes), g.userData.glows.push(motes.userData.glow);
  let col = null;
  if (T.column) {
    col = glowColumn(C.column, tier === "glow" ? 5.5 : 3.2, tier === "glow" ? 1.5 : 1.0, tier === "glow" ? 0.85 : tier === "night" ? 0.45 : 0.55);
    g.add(col);
    g.userData.glows.push(col.userData.glow);
  }
  g.userData.gather = {
    tier,
    q,
    focus: 0,
    // k 0~1：靠近可交互时由界面层（src/ui/gather_ui.js）逐帧设置
    setFocus(k) {
      if (Math.abs(k - this.focus) < 1e-3) return;
      this.focus = k;
      enso.userData.glow.uniforms.uFocus.value = k;
      if (motes) motes.userData.glow.uniforms.uFocus.value = k;
    },
  };
}

// ---------------- 灵光点（大件宝物） ----------------
// 宝物本身保留各自的色（骨白、珠青、玉青……）；"灵光点"靠形制（双圈 + 高光柱 + 大量微粒）一眼认出，颜色按宝物品质（RARITY）
const GLOW_STYLE = {
  wolfking_bone: 0xf0e2b8,
  lingbang: 0x9fe6ff,
  furnace_part: ACCENT.gold,
  water_jade: 0x7fe0e8,
  zhuxin: 0x9ff0a0,
  zhenpan: ACCENT.blue,
};
export function glowMarker(kind) {
  const g = new THREE.Group();
  const c = GLOW_STYLE[kind] ?? ACCENT.gold;
  if (kind === "wolfking_bone") {
    const b2 = bones();
    b2.rotation.y = 2.1;
    b2.position.set(0.6, 0, 0.3);
    g.add(bones(), b2);
  }
  else if (kind === "lingbang") {
    const shell = toon({ color: 0xc8c4b8, tri: !0, brushK: 0.4, brushScale: 2 });
    const top = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.8);
    g.add(mesh(mergeGeos([top.clone().translate(0, 0.1, 0), top.clone().rotateX(-0.9).translate(0, 0.15, -0.3)]), shell));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 0.22, 0), toon({ color: 0xffffff, emissive: c, emissiveIntensity: 1 }), !1));
  } else if (kind === "furnace_part") {
    const bronze = toon({ color: 0x6a5a3a, tri: !0, brushK: 0.6, brushScale: 1.4, emissive: 0x2a2008, emissiveIntensity: 0.4 });
    g.add(mesh(mergeGeos([new THREE.CylinderGeometry(0.5, 0.42, 0.55, 10, 1, !0, 0, Math.PI * 1.3).translate(0, 0.35, 0).rotateZ(0.3), new THREE.CylinderGeometry(0.06, 0.04, 0.5, 5).translate(0.6, 0.2, 0.2).rotateZ(1.2)]), bronze));
  } else if (kind === "water_jade") {
    g.add(mesh(new THREE.DodecahedronGeometry(0.4, 0).scale(1, 1.3, 0.8).translate(0, 0.45, 0), toon({ color: 0x8fd8d0, emissive: 0x2a8a90, emissiveIntensity: 0.8 })));
  } else if (kind === "zhuxin") {
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.9, 8).translate(0, 0.45, 0), toon({ color: 0x9fd88a, emissive: 0x3a8a3a, emissiveIntensity: 0.8, bamboo: !0 })));
  } else if (kind === "zhenpan") {
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 8).translate(0, 0.5, 0).rotateX(0.25), toon({ color: 0x5a6a7a, emissive: 0x1a4a80, emissiveIntensity: 0.8 })));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3).translate(0, 0.22, 0), stoneMat()));
  }
  g.userData.glows = [];
  decorateGather(g, "glow", gatherRarity(kind, "glow"));
  g.userData.collide = [[0, 0, 0.5]];
  return g;
}

// ---------------- 景物 ----------------
// 山神庙：石台基、三面墙、歇山小顶、神龛石像
export function temple() {
  const g = new THREE.Group();
  const stone = toon({ color: 0xa6a49b, tri: !0, brushK: 0.5, brushScale: 0.5, fade: !0 });
  const wall = toon({ color: 0xc8c2b2, tri: !0, brushK: 0.45, brushScale: 0.8, fade: !0 });
  const wood = toon({ color: 0x3e3833, fade: !0 });
  const roofMat = toon({ color: 0x45484a, side: THREE.DoubleSide, fade: !0 });
  g.add(mesh(mergeGeos([new THREE.BoxGeometry(6.4, 0.5, 5.2).translate(0, 0.25, 0), new THREE.BoxGeometry(2.4, 0.25, 1.0).translate(0, 0.12, 3.0)]), stone));
  const walls = [new THREE.BoxGeometry(5.4, 2.8, 0.3).translate(0, 1.9, -2.1), new THREE.BoxGeometry(0.3, 2.8, 4.2).translate(-2.55, 1.9, 0), new THREE.BoxGeometry(0.3, 2.8, 4.2).translate(2.55, 1.9, 0)];
  g.add(mesh(mergeGeos(walls), wall));
  const posts = [];
  for (const sx of [-1, 1]) posts.push(new THREE.CylinderGeometry(0.14, 0.15, 2.8, 8).translate(sx * 2.0, 1.9, 2.0));
  posts.push(new THREE.BoxGeometry(5.6, 0.25, 0.25).translate(0, 3.3, 2.0));
  g.add(mesh(mergeGeos(posts), wood));
  // 屋顶：两坡 + 起翘
  const roof = new THREE.PlaneGeometry(7.4, 3.6, 16, 4);
  const p = roof.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = (y + 1.8) / 3.6;
    p.setZ(i, -0.25 * Math.sin(u * Math.PI) + 0.5 * Math.pow(Math.abs(x) / 3.7, 6) * (1 - u));
  }
  roof.computeVertexNormals();
  const r1 = roof.clone().rotateX(-Math.PI / 2 + 0.55).translate(0, 4.3, 1.45);
  const r2 = roof.clone().rotateX(-Math.PI / 2 - 0.55).rotateY(Math.PI).translate(0, 4.3, -1.45);
  g.add(mesh(mergeGeos([r1, r2]), roofMat));
  g.add(mesh(new THREE.BoxGeometry(7.6, 0.3, 0.3).translate(0, 5.15, 0), wood));
  // 神龛与石像
  g.add(mesh(mergeGeos([new THREE.BoxGeometry(1.6, 0.9, 0.9).translate(0, 0.95, -1.4), new THREE.CylinderGeometry(0.32, 0.42, 1.1, 8).translate(0, 1.95, -1.4), new THREE.SphereGeometry(0.28, 8, 6).translate(0, 2.7, -1.4)]), stone));
  g.userData.collide = [[0, -2.1, 1.2], [-2.55, 0, 1.0], [2.55, 0, 1.0], [-2.55, -1.6, 0.8], [2.55, -1.6, 0.8], [-1.6, -2.1, 0.9], [1.6, -2.1, 0.9], [-2.0, 2.0, 0.25], [2.0, 2.0, 0.25], [0, -1.4, 0.9]];
  return g;
}
export { lantern, stele, pavilion };

// 跳点：崖边两块平顶石、一道朱砂刻痕（提示"可跳"）
export function jumpMarker() {
  const g = new THREE.Group();
  const stone = toon({ color: 0x9a978c, tri: !0, brushK: 0.6, brushScale: 0.8 });
  g.add(mesh(mergeGeos([new THREE.CylinderGeometry(0.7, 0.8, 0.25, 7).translate(0, 0.05, 0)]), stone));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.02, 0.1).translate(0, 0.19, 0), toon({ color: ACCENT.red, emissive: 0x6a120c, emissiveIntensity: 0.6 }), !1));
  return g;
}

// 卧石：Boss 场里挡直线冲撞的大石（碰撞半径 r）
export function boulder(r = 1.2, seed = 1) {
  const g = new THREE.Group();
  const geo = rockGeo((seed % 97) * 0.37 + 2, 2).scale(r * 1.05, r * 0.75, r * 0.9);
  g.add(mesh(geo, toon({ color: 0x86837a, tri: !0, brushK: 0.8, brushScale: 0.45 })));
  g.userData.collide = [[0, 0, r]];
  return g;
}
// 五行坛：方形石台 + 中间的五行石（点色：金白、木绿、水青、火朱、土黄），读条点亮
const EL_COLOR = { metal: 0xe8e4d0, wood: 0x4fbf7a, water: 0x4aa8e0, fire: 0xe0502a, earth: 0xc8a050 };
export function shrine(el = "water") {
  const g = new THREE.Group();
  const c = EL_COLOR[el] ?? ACCENT.gold;
  const parts = [new THREE.BoxGeometry(2.4, 0.3, 2.4).translate(0, 0.15, 0), new THREE.BoxGeometry(1.7, 0.25, 1.7).translate(0, 0.42, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.22, 0.9, 0.22).translate(sx * 1.0, 0.75, sz * 1.0));
  g.add(mesh(mergeGeos(parts), stoneMat()));
  g.add(mesh(new THREE.OctahedronGeometry(0.32).scale(1, 1.5, 1).translate(0, 1.05, 0), toon({ color: c, emissive: c, emissiveIntensity: 0.6 }), !1));
  const disc = runeDisc(1.3, c, 0.5);
  disc.position.y = 0.56;
  g.add(disc);
  const col = glowColumn(c, 3, 1.2, 0.5);
  g.add(col);
  g.userData.glows = [disc.userData.glow, col.userData.glow];
  g.userData.collide = [[0, 0, 0.85]];
  return g;
}

// 墨雾围栏（教学局边界）：沿多边形一圈竖立的墨色雾幕，底浓上淡、缓慢翻涌
export function fogWall(poly, ground, opts = {}) {
  const pts = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 1.8));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      pts.push([x, ground(x, z), z]);
    }
  }
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uOn: { value: opts.on ?? 1 }, uK: { value: opts.k ?? 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime, uOn; varying vec2 vUv; varying vec4 vS;
      void main(){
        vUv = uv; vS = aSeed;
        vec3 c = instanceMatrix[3].xyz;
        c.y += mix(-3.5, 1.6, uOn) + sin(uTime * 0.3 + aSeed.x * 6.28) * 0.3; // uOn 0 → 1：墨雾从地里升起
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(6.5, 5.5) * (0.8 + aSeed.y * 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOn, uK; varying vec2 vUv; varying vec4 vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv - 0.5;
        float body = smoothstep(0.5, 0.05, length(p * vec2(1.0, 1.3)));
        float k = n(vUv * vec2(4.0, 3.0) + vS.zw * 10.0 + vec2(uTime * 0.05, -uTime * 0.08)) * 0.6 + n(vUv * 9.0 + vS.xy * 7.0 - uTime * 0.1) * 0.4;
        float a = body * smoothstep(0.3, 0.7, k) * mix(0.85, 0.35, vUv.y);
        gl_FragColor = vec4(vec3(0.14, 0.15, 0.16), min(1.0, a * 1.25) * uOn * uK);
      }`,
  });
  const LAYERS = 3;
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, pts.length * LAYERS);
  const seeds = new Float32Array(m.count * 4);
  const M4 = new THREE.Matrix4();
  pts.forEach(([x, y, z], i) => {
    for (let k = 0; k < LAYERS; k++) {
      m.setMatrixAt(i * LAYERS + k, M4.makeTranslation(x + (R() - 0.5) * 1.5, y + k * 1.6, z + (R() - 0.5) * 1.5));
      for (let c = 0; c < 4; c++) seeds[(i * LAYERS + k) * 4 + c] = R();
    }
  });
  m.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  m.frustumCulled = !1;
  m.renderOrder = 6;
  m.name = "fog-wall";
  m.userData.uOn = mat.uniforms.uOn;
  return m;
}

// ================= 青牙狼谷场景件（boss_青牙_v2 §3.1 / §9.3）=================
// 先用低面数的程序化造型；美术管线出正式模型后，在 PROP_MODELS 里登记 glb 路径即可替换
// （swapPropModel 加载成功就换掉程序化的子网格，失败或没登记就保留程序化造型）。
// 美术管线约定（2026-11-17）：assets/models/props/<id>.glb，原点在底面中心、+Y 向上、单位米、正面朝 +Z；每个状态一个文件
//   wolf_king_rock 狼王石 · fang_pillar / fang_pillar_broken 狼牙石柱完好 / 残桩 · wolf_totem / wolf_totem_fallen 狼骨图腾 · wolf_rock 狼岩 · mist_gate 墨雾门石桩
// 用 import.meta.glob 在构建时列出实际存在的文件：有文件就加载，没有就用程序化造型，不会产生 404
const _globbed = (() => {
  try {
    return import.meta.glob("/assets/models/props/*.glb", { query: "?url", import: "default", eager: !0 });
  } catch {
    return {}; // Node 里（离线工具）没有 import.meta.glob
  }
})();
export const PROP_MODELS = Object.fromEntries(Object.entries(_globbed).map(([k, url]) => [k.split("/").pop().replace(/\.glb$/, ""), url]));
// 模型里的材质只用于预览：按名称前缀换成项目的 toon 材质
export const PROP_MATS = {
  rock_ink: () => toon({ color: 0x6e675c, tri: !0, brushK: 0.85, brushScale: 0.45 }),
  rock_pale: () => toon({ color: 0xa8a59b, tri: !0, brushK: 0.6, brushScale: 0.6 }),
  bone: () => toon({ color: 0xd8d2c0, tri: !0, brushK: 0.5 }),
  cloth_banner: () => toon({ color: 0x8a7a68, side: THREE.DoubleSide }),
  straw: () => toon({ color: 0x857a5c, tri: !0, brushK: 0.8, brushScale: 1.6 }),
  rope: () => toon({ color: 0x6b5a44 }),
  totem_glow: () => new THREE.MeshBasicMaterial({ color: 0x1d3c3a }),
};
const _gltf = new Map();
const _propMatCache = {};
// 按 id 加载场景件的 glb（缓存）；没有文件时得到 null
export function loadPropScene(key) {
  const url = PROP_MODELS[key];
  if (!url) return Promise.resolve(null);
  if (!_gltf.has(url))
    _gltf.set(
      url,
      import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) => new Promise((res) => new GLTFLoader().load(url, (g) => res(g.scene), void 0, () => res(null)))),
    );
  return _gltf.get(url);
}
// 共享材质（按名称前缀）；青焰部件每次新建一份（图腾 setLit 要单独改色）
export const propMat = (k) => (k === "totem_glow" ? PROP_MATS[k]() : (_propMatCache[k] ||= PROP_MATS[k]()));
export function swapPropModel(group, key) {
  if (!PROP_MODELS[key]) return Promise.resolve(!1);
  return loadPropScene(key).then((sc) => {
    if (!sc) return !1;
    const keep = group.children.filter((c) => c.userData.keep);
    group.clear();
    keep.forEach((c) => group.add(c));
    const m = sc.clone(!0);
    const glows = [];
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = !0;
      const name = (o.material && o.material.name) || "";
      const k = Object.keys(PROP_MATS).find((p) => name.startsWith(p));
      if (k) o.material = k === "totem_glow" ? PROP_MATS[k]() : (_propMatCache[k] ||= PROP_MATS[k]()); // 共享材质；青焰部件每个图腾单独一份（setLit 改色）
      if (k === "totem_glow") (o.castShadow = !1), glows.push(o);
    });
    group.add(m);
    group.userData.glowMeshes = glows; // 图腾"青焰亮起"：setLit 把这些部件调亮
    return !0;
  });
}
const wolfStoneMat = () => toon({ color: 0x8c877c, tri: !0, brushK: 0.85, brushScale: 0.45 });
// 狼王石：皴法大石，碰撞半径 r，高约 2.5 米，不可攀
export function wolfRock(r = 2.2, h = 2.5) {
  const g = new THREE.Group();
  const geo = rockGeo(7.3, 2).scale(r * 1.05, h / 1.6, r * 0.95).translate(0, h * 0.35, 0);
  g.add(mesh(geo, wolfStoneMat()));
  // 顶上的爪痕：三道浅色细条
  const marks = [];
  for (let k = 0; k < 3; k++) marks.push(new THREE.BoxGeometry(0.06, 0.03, 0.9).translate((k - 1) * 0.25, h * 0.98, 0).rotateY(0.4));
  g.add(mesh(mergeGeos(marks), toon({ color: 0xd8d2c0 }), !1));
  g.userData.collide = [[0, 0, r]];
  g.name = "wolf_king_rock";
  swapPropModel(g, "wolf_king_rock");
  return g;
}
// 狼岩：谷里散布的中型石（半径 1.0–1.4）
export function wolfStone(r = 1.2, seed = 1) {
  const g = new THREE.Group();
  g.add(mesh(rockGeo((seed % 97) * 0.41 + 3, 2).scale(r * 1.05, r * 0.8, r * 0.95), wolfStoneMat()));
  g.userData.collide = [[0, 0, r]];
  g.name = "wolf_rock";
  swapPropModel(g, "wolf_rock");
  return g;
}
// 墨雾门的实体部分：两根歪斜石桩 + 横绳 + 骨符，门洞沿本地 X、面朝 +Z（雾是 fogWall）
export function mistGatePosts(w = 4) {
  const g = new THREE.Group();
  const parts = [];
  for (const s of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.18, 0.26, 2.6, 6).rotateZ(s * 0.08).translate((s * w) / 2, 1.3, 0));
  g.add(mesh(mergeGeos(parts), wolfStoneMat()));
  const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-w / 2, 2.3, 0), new THREE.Vector3(0, 1.95, 0), new THREE.Vector3(w / 2, 2.3, 0)]), 12, 0.04, 4, !1);
  g.add(mesh(rope, toon({ color: 0x6b5a44 }), !1));
  const charms = [];
  for (let k = -1; k <= 1; k++) charms.push(new THREE.BoxGeometry(0.16, 0.42, 0.03).translate(k * 0.9, 1.8 - Math.abs(k) * 0.12, 0));
  g.add(mesh(mergeGeos(charms), toon({ color: 0xd8d2c0 }), !1));
  g.userData.collide = [[-w / 2, 0, 0.3], [w / 2, 0, 0.3]];
  g.name = "mist_gate";
  swapPropModel(g, "mist_gate");
  return g;
}
// 狼牙石柱：上尖下粗的弯牙形石柱（高约 3.4 米）；break() 后换成可走的残桩
export function fangPillar(r = 1.2, seed = 1) {
  const g = new THREE.Group();
  const whole = new THREE.Group(), stump = new THREE.Group();
  const geo = new THREE.ConeGeometry(r, 3.4, 7, 4).translate(0, 1.7, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / 3.4;
    p.setX(i, p.getX(i) + k * k * 0.5); // 牙尖向一侧弯
    p.setZ(i, p.getZ(i) * (0.85 + 0.15 * Math.sin(seed * 3.1 + i)));
  }
  geo.computeVertexNormals();
  whole.add(mesh(geo, wolfStoneMat()));
  const sg = new THREE.CylinderGeometry(r * 0.75, r, 0.55, 7).translate(0, 0.27, 0);
  stump.add(mesh(sg, wolfStoneMat()));
  const chips = [];
  for (let k = 0; k < 4; k++) chips.push(rockGeo(seed * 5 + k, 1).scale(0.35, 0.22, 0.3).translate(Math.cos(k * 1.7) * (r + 0.4), 0.1, Math.sin(k * 1.7) * (r + 0.4)));
  stump.add(mesh(mergeGeos(chips), wolfStoneMat()));
  stump.visible = !1;
  g.add(whole, stump);
  whole.userData.keep = !1;
  g.userData.collide = [[0, 0, r]];
  g.userData.setBroken = (on) => ((whole.visible = !on), (stump.visible = !!on));
  g.name = "fang_pillar";
  swapPropModel(whole, "fang_pillar");
  swapPropModel(stump, "fang_pillar_broken");
  return g;
}
// 狼骨图腾：骨杆 + 兽骨 + 破布幡；setLit(on) 亮青焰描边（召狼提示），fall() 倒地
export function wolfTotem(seed = 1) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const bone = toon({ color: 0xd8d2c0, tri: !0, brushK: 0.5 });
  const parts = [new THREE.CylinderGeometry(0.09, 0.13, 3.2, 6).translate(0, 1.6, 0), new THREE.BoxGeometry(1.4, 0.1, 0.1).translate(0, 2.7, 0)];
  body.add(mesh(mergeGeos(parts), toon({ color: 0x4a3f35 })));
  body.add(mesh(new THREE.DodecahedronGeometry(0.32, 0).scale(1, 0.8, 1.3).translate(0, 3.35, 0.05), bone));
  const ribs = [];
  for (let k = 0; k < 3; k++) ribs.push(new THREE.TorusGeometry(0.28 - k * 0.04, 0.03, 4, 8, Math.PI).rotateY(Math.PI / 2).translate(0, 2.2 - k * 0.22, 0));
  body.add(mesh(mergeGeos(ribs), bone));
  const cloth = new THREE.PlaneGeometry(0.9, 1.3, 3, 4).translate(0, -0.65, 0);
  const cp = cloth.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getY(i) * 3 + seed) * 0.08 + (cp.getY(i) < -1.0 ? (i % 2) * 0.1 : 0));
  cloth.computeVertexNormals();
  const flag = mesh(cloth, toon({ color: 0x6b4b3a, side: THREE.DoubleSide }), !1);
  flag.position.set(0.45, 2.65, 0);
  body.add(flag);
  // 青焰描边：外扩的背面壳（加色），setLit 时显隐
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 3.6, 8).translate(0, 1.8, 0),
    new THREE.MeshBasicMaterial({ color: 0x5fd7c8, transparent: !0, opacity: 0.32, side: THREE.BackSide, depthWrite: !1, blending: THREE.AdditiveBlending }),
  );
  glow.visible = !1;
  glow.userData.keep = !0;
  body.add(glow);
  const fallen = new THREE.Group();
  fallen.visible = !1;
  g.add(body, fallen);
  g.userData.collide = [[0, 0, 0.6]];
  const lit = new THREE.Color(0x5fd7c8), dim = new THREE.Color(0x1d3c3a);
  g.userData.setLit = (on) => {
    glow.visible = !!on && !(body.userData.glowMeshes && body.userData.glowMeshes.length);
    for (const o of body.userData.glowMeshes || []) o.material.color.copy(on ? lit : dim);
  };
  g.userData.fall = () => {
    glow.visible = !1;
    if (PROP_MODELS.wolf_totem_fallen) (body.visible = !1), (fallen.visible = !0);
    else (body.rotation.z = -1.35), (body.position.y = 0.15); // 没有倒地模型时：整根放倒
  };
  g.name = "wolf_totem";
  swapPropModel(body, "wolf_totem");
  swapPropModel(fallen, "wolf_totem_fallen");
  return g;
}
