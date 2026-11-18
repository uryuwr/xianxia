// 洞府场景（模块 C）：崖下的一方小院。后有峭壁与洞口，前临云海，出行台伸出崖外。
// 破洞府（设施多为 0 级）杂草丛生、屋顶塌漏、石径残缺；设施修缮后院子随之整洁、石灯点亮。
// 搬迁到竹海·溪谷（region "r2"）后换成竹林环绕、一条溪水从崖上落下的版本，设施位置不变。
//
// 对外：new CaveScene({ region, brush })
//   .root                      场景根节点（加到 ctx.scene）
//   .height / ground / slope   行走高度（与关卡接口一致，可直接交给 terrain.setActiveLevel）
//   .colliders                 [{x, z, r}]
//   .stations                  { id: { pos: Vector3, r 交互半径, tagY 名牌高度, stand: [x, z] 主角操作站位, face } }
//   .refresh(state)            state = { levels: { spring: 1, … }, tier 0..1 修缮度, plots 地块数, garden: [null | { herb, ripe, k, stage, rarity }] }
//   .update(dt, playerPos)
//   .fx.meditate(pos, dur, color) / .fx.surge(pos, color) / .fx.puff(pos)   洞府专用的小演出
//   .wisp                      玄机子（一缕墨魂）：wisp.follow(pos) / wisp.goHome()
//   .setMirror({ unread, gold }) / .mirrorFlash() / .mirrorScreen(camera) → { x, y, r }   天机镜台（石案上的铜镜 = 林墨的手机）：
//                              镜面竖屏平时呼吸、每 20–40 秒亮一下；有未读时 6–8 秒一次并亮朱点；筑基后泥金色
import * as THREE from "three";
import { toon, cutoutDepth, U } from "../render/materials.js";
import { brushTextures } from "../render/bake.js";
import { fbm, smooth, clamp, lerp, rng, vnoise } from "../render/glsl.js";
import { mergeGeos, rockGeo } from "./vegetation.js";
import { buildSky } from "./sky.js";
import { gatherMarker, spiritMotes } from "./markers.js";
import { RARITY } from "../core/items.js";

// 药园作物：灵草名 → 采集点造型；品质色一律取 RARITY（凡品色太灰，成熟光用淡青）
const HERB_KIND = { "青灵草": "qingling", "凝露花": "ninglu", "寒露草": "hanlu", "紫藤": "ziteng", "赤炎果": "chiyan", "千年何首乌": "heshouwu" };
const qColor = (r) => (r > 0 && RARITY[r] ? new THREE.Color(RARITY[r].color).getHex() : 0xbff0c8);
// 复用：每种灵草只建一次造型（成熟版 / 去掉圆相微粒的生长版），之后 clone（共享几何体与材质）
const CROP_TPL = new Map();
function cropTemplate(kind, full) {
  const key = kind + (full ? ":full" : ":bare");
  if (!CROP_TPL.has(key)) {
    const m = gatherMarker(kind, "herb");
    // 紫藤：采集点的造型是"缠在粗枯桩上"，种在畦里像一只紫桶——换成一根细竹竿，藤叶收拢到竿上
    if (kind === "ziteng") {
      for (const ch of [...m.children]) {
        const gp = ch.geometry && ch.geometry.parameters;
        if (ch.geometry && ch.geometry.type === "CylinderGeometry" && gp && gp.radiusBottom >= 0.3) m.remove(ch);
        else if (ch.isMesh && ch.geometry && !ch.geometry.type.includes("Ring") && ch.geometry.type !== "PlaneGeometry" && !(ch.material && ch.material.isShaderMaterial)) ch.geometry = ch.geometry.clone().scale(0.42, 1, 0.42);
      }
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.25, 5).translate(0, 0.62, 0), toon({ color: 0x8a9a62, bamboo: !0 }));
      stake.castShadow = !0;
      m.add(stake);
    }
    if (!full) {
      const glows = m.userData.glows || [];
      for (const ch of [...m.children]) if (glows.includes(ch.material) || (ch.userData && glows.includes(ch.userData.glow))) m.remove(ch);
    }
    CROP_TPL.set(key, m);
  }
  return CROP_TPL.get(key).clone();
}
const MOTES_TPL = new Map();
function cropMotes(r) {
  if (!MOTES_TPL.has(r)) MOTES_TPL.set(r, spiritMotes(10 + 4 * r, qColor(r), 0.8, 1.6 + 0.3 * r, 0.6));
  return MOTES_TPL.get(r).clone();
}

const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _S = new THREE.Vector3(), _P = new THREE.Vector3();
const place = (g, x, y, z, ry = 0, s = 1) => g.applyMatrix4(_M.compose(_P.set(x, y, z), _Q.setFromEuler(_E.set(0, ry, 0)), _S.set(s, s, s)));

// ---------------- 设施模型与站点位置 ----------------
// 模型：院子里的每件东西（按设施等级换模型）；天机镜台（原鉴宝台，模型 id 仍为 appraise）、蒲团、药园为场景陈设（玩法评审 G5：鉴定挪到结算页，参悟并入仓库，药园自动收获）
export const CAVE_MODELS = {
  spring: [-7.5, -6],
  study: [0, -9.2],
  furnace: [5.9, -5.9],
  forge: [10.6, -4.6],
  appraise: [-9.2, -0.9],
  garden: [-10.2, 3.3],
  storage: [-13.4, -4.2],
  depart: [0, 11.2],
  loadout: [12.2, 1.2],
};
// 可交互站点（5 个设施 + 天机镜台 + 内观阁）：at 名牌与交互中心，r 交互半径，stand 打开面板时主角走到的位置
export const CAVE_STATIONS = {
  spring: { at: [-7.5, -6], r: 3.4, tagY: 2.6, stand: [-7.2, -3.6] },
  workshop: { at: [8.2, -5.6], r: 3.8, tagY: 4.6, stand: [8.2, -3.0] },
  garden: { at: [-10.2, 3.3], r: 3.6, tagY: 1.6, stand: [-7.0, 3.9] },
  storage: { at: [-13.4, -4.2], r: 3.0, tagY: 3.6, stand: [-11.4, -2.8] },
  depart: { at: [0, 11.2], r: 2.6, tagY: 6.4, stand: [0, 10.6] },
  mirror: { at: [-9.2, -0.9], r: 2.2, tagY: 2.3, stand: [-8.6, 0.5] },
  loadout: { at: [12.0, 1.0], r: 3.0, tagY: 4.2, stand: [10.2, 0.8] },
};
export const CAVE_SPAWN = [0, 5.2];
// 药园地块（相对药园中心）
// 顺序：1 块在中；2 块向左；4 块成 2×2；6 块成 3×2；8 块（搬迁后）再往前一排
const PLOTS = [[0, 0.9], [-2.2, 0.9], [0, -1.3], [-2.2, -1.3], [2.2, 0.9], [2.2, -1.3], [0, 3.1], [-2.2, 3.1]];

// ---------------- 地形 ----------------
const cliffZ = (x) => -11.6 + 0.017 * x * x + 1.2 * Math.sin(x * 0.23 + 0.6) + (fbm(x * 0.12, 4.2) - 0.5) * 2.4;
export function caveHeight(x, z, region = "r1") {
  let h = (fbm(x * 0.22 + 3, z * 0.22) - 0.5) * 0.32;
  // 后崖：峭壁 + 崖顶起伏
  const cz = cliffZ(x);
  const wall = smooth(cz + 0.4, cz - 2.4, z);
  h += wall * (10.5 + (fbm(x * 0.18, z * 0.18 + 9) - 0.5) * 5);
  // 洞口前的一小块台基（参悟蒲团）
  h += 0.18 * (1 - smooth(1.2, 1.8, Math.hypot(x / 1.3, (z + 9.2) / 0.8)));
  // 溪谷版：左侧一道溪水自崖上落下，在院中刻出浅槽
  if (region === "r2") {
    const sx = -3.6 + Math.sin(z * 0.35) * 0.9 - (z + 10) * 0.25;
    if (z > cz - 1) h -= 0.42 * (1 - smooth(0.5, 1.3, Math.abs(x - sx))) * smooth(cz - 1, cz + 1.5, z) * (1 - smooth(6, 9, z));
  }
  // 前与两侧：陡落进云海；出行台向外伸出一截
  const r = Math.hypot(x / 20.5, Math.max(0, z - 0.5) / 11.2);
  const lobe = Math.hypot(x / 3.2, (z - 11.2) / 2.9);
  const rr = Math.min(r, lobe * 0.97) + (fbm(x * 0.35, z * 0.35) - 0.5) * 0.06;
  const fall = smooth(0.93, 1.08, rr) * (1 - wall);
  return lerp(h, -30 - fbm(x * 0.1, z * 0.1) * 8, fall);
}

// 地形网格（崖沿描墨同 sample.js）
// grid：CaveScene 的高度缓存网格，采样点与网格顶点一一对应（x −33…33、z −25…21、0.25 米），直接复用，不再重算 fbm
function terrainMesh(H, region, grid) {
  const g = terrainGeo(H, grid);
  terrainNormals(g);
  return terrainFinish(g, region);
}
// 分三步（分帧构建时各占一帧）：平面 + 高度 → 法线 → 崖沿描墨与材质
function terrainGeo(H, grid) {
  const SX = 66, SZ = 46, RX = 264, RZ = 184, CZ = -2;
  const geo = new THREE.PlaneGeometry(SX, SZ, RX, RZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, CZ);
  const pos = geo.attributes.position, n = pos.count;
  const Y = grid && grid.a.length === n ? grid.a : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (Y !== grid?.a) Y[i] = H(pos.getX(i), pos.getZ(i));
    pos.setY(i, Y[i]);
  }
  geo.userData.Y = Y;
  return geo;
}
// 法线：直接按高度网格做中心差分（比 computeVertexNormals 遍历 9.7 万个三角形快得多）
function terrainNormals(geo) {
  const RX = 264, RZ = 184, W = RX + 1, Y = geo.userData.Y, st = 0.25;
  const nrm = new Float32Array(Y.length * 3);
  for (let iz = 0; iz <= RZ; iz++)
    for (let ix = 0; ix <= RX; ix++) {
      const i = iz * W + ix;
      const xl = Y[iz * W + (ix > 0 ? ix - 1 : ix)], xr = Y[iz * W + (ix < RX ? ix + 1 : ix)];
      const zu = Y[(iz > 0 ? iz - 1 : iz) * W + ix], zd = Y[(iz < RZ ? iz + 1 : iz) * W + ix];
      const dx = (xr - xl) / ((ix > 0 && ix < RX ? 2 : 1) * st), dz = (zd - zu) / ((iz > 0 && iz < RZ ? 2 : 1) * st);
      const l = Math.sqrt(dx * dx + 1 + dz * dz);
      nrm[i * 3] = -dx / l;
      nrm[i * 3 + 1] = 1 / l;
      nrm[i * 3 + 2] = -dz / l;
    }
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
}
function terrainFinish(geo, region) {
  const RX = 264, RZ = 184, Y = geo.userData.Y, n = Y.length;
  const W = RX + 1, nrm = geo.attributes.normal.array, rim = new Float32Array(n);
  // 崖沿：与前后左右 2、3 格的最大落差（不分配临时数组）
  for (let iz = 0; iz <= RZ; iz++)
    for (let ix = 0; ix <= RX; ix++) {
      const i = iz * W + ix, h = Y[i];
      let drop = 0;
      for (let d = 2; d <= 3; d++) {
        const xl = ix - d < 0 ? 0 : ix - d, xr = ix + d > RX ? RX : ix + d, zu = iz - d < 0 ? 0 : iz - d, zd = iz + d > RZ ? RZ : iz + d;
        const a1 = h - Y[iz * W + xl], a2 = h - Y[iz * W + xr], a3 = h - Y[zu * W + ix], a4 = h - Y[zd * W + ix];
        drop = Math.max(drop, a1, a2, a3, a4);
      }
      rim[i] = drop > 0.9 ? smooth(0.9, 2.2, drop) * smooth(0.55, 0.85, nrm[i * 3 + 1]) : 0;
    }
  geo.setAttribute("aRim", new THREE.BufferAttribute(rim, 1));
  const mat = region === "r2"
    ? toon({ terrain: !0, topColor: 0xcdd2bd, faceColor: 0x5f6a5e, mossColor: 0x84b47c })
    : toon({ terrain: !0, topColor: 0xd4d0bc, faceColor: 0x6e675c, mossColor: 0x9cbb86 });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = m.castShadow = !0;
  m.name = "cave-terrain";
  return m;
}

// ---------------- 材质 ----------------
function mats() {
  return {
    stone: toon({ color: 0xa9a69c, tri: !0, brushK: 0.55, brushScale: 0.55, fade: !0 }),
    stoneDark: toon({ color: 0x77766e, tri: !0, brushK: 0.7, brushScale: 0.6, fade: !0 }),
    rock: toon({ color: 0x8c8a7e, tri: !0, brushK: 0.75, brushScale: 0.45 }),
    wood: toon({ color: 0x4a3f35, tri: !0, brushK: 0.4, brushScale: 1.2, fade: !0 }),
    woodDark: toon({ color: 0x2f2a25, fade: !0 }),
    thatch: toon({ color: 0x6b6252, tri: !0, brushK: 0.8, brushScale: 1.4, side: THREE.DoubleSide, fade: !0 }),
    tile: toon({ color: 0x45494a, tri: !0, brushK: 0.5, brushScale: 1.6, side: THREE.DoubleSide, fade: !0 }),
    bronze: toon({ color: 0x5d5a4c, tri: !0, brushK: 0.6, brushScale: 0.9, fade: !0 }),
    bronzeHi: toon({ color: 0x6f5d38, tri: !0, brushK: 0.45, brushScale: 0.9, emissive: 0x2a1c06, fade: !0 }),
    gold: toon({ color: 0xd8a640, emissive: 0x6a4a10, emissiveIntensity: 0.6 }),
    soil: toon({ color: 0x5a4d3e, tri: !0, brushK: 0.6, brushScale: 0.9 }),
    straw: toon({ color: 0x9a8a62, tri: !0, brushK: 0.5, brushScale: 2.0 }),
    cloth: toon({ color: 0xb8301c }),
    paper: toon({ color: 0xe8e0c8 }),
    black: new THREE.MeshBasicMaterial({ color: 0x0f1113 }),
    jade: toon({ color: 0xbcd8cc, emissive: 0x1f4a3c, emissiveIntensity: 0.5 }),
  };
}
const shade = (o) => (o.traverse((c) => c.isMesh && !c.userData.noShadow && (c.castShadow = c.receiveShadow = !0)), o);
function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = !0;
  return m;
}
function lathe(profile, seg = 20) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
// 天机镜台镜面上的竖屏：0.26 × 0.46 的圆角矩形（内切于半径 0.36 的铜镜），全场共用一份
let _mirrorScrGeo = null;
function mirrorScreenGeo() {
  if (_mirrorScrGeo) return _mirrorScrGeo;
  const w = 0.13, h = 0.23, r = 0.05, s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return (_mirrorScrGeo = new THREE.ShapeGeometry(s, 4));
}
// 发光点（灯火、炉火、灵光）：加法混合的软圆
let glowTex = null;
function glowSprite(color, size, opacity = 1) {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: !0, opacity, depthWrite: !1, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.renderOrder = 20;
  return s;
}
// 墨团贴图（玄机子、墨烟）
let inkTex = null;
function inkBlot() {
  if (inkTex) return inkTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const R = rng(5);
  for (let k = 0; k < 40; k++) {
    const a = R() * 6.28, r = R() * 26, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, s = 10 + R() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(18,20,22,${0.18 + R() * 0.2})`);
    gr.addColorStop(1, "rgba(18,20,22,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  inkTex = new THREE.CanvasTexture(c);
  return inkTex;
}

// ---------------- 各设施的模型（按等级） ----------------
const BUILD = {
  // 灵泉：一圈山石围着一汪泉水；二级换成白玉围栏，三级泉面生雾、灵光浮起
  spring(lv, M, S) {
    const g = new THREE.Group();
    const R = rng(11);
    const rocks = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + R() * 0.2, rad = 1.95 + R() * 0.25;
      const s = 0.38 + R() * 0.28;
      rocks.push(place(rockGeo(k * 1.7 + 3, 1).scale(s, s * 0.8, s), Math.cos(a) * rad, -0.05, Math.sin(a) * rad, R() * 6));
    }
    // 后方一块大石，泉眼从石下涌出
    rocks.push(place(rockGeo(8.8, 2).scale(1.1, 1.3, 0.9), 0.4, 0.1, -2.3, 0.4));
    g.add(mesh(mergeGeos(rocks), M.rock));
    if (lv >= 2) {
      const rail = mesh(new THREE.TorusGeometry(1.75, 0.09, 6, 40).rotateX(Math.PI / 2).translate(0, 0.18, 0), M.jade);
      g.add(rail);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.78, 40).rotateX(-Math.PI / 2), S.waterMat(lv));
    water.position.y = 0.04;
    water.renderOrder = 2;
    g.add(water);
    if (lv >= 3) {
      for (let k = 0; k < 5; k++) {
        const s = glowSprite(0x9fe0d0, 0.5 + R() * 0.4, 0.55);
        s.position.set((R() - 0.5) * 2.2, 0.4 + R() * 0.9, (R() - 0.5) * 2.2);
        s.userData.float = R() * 6;
        g.add(s);
      }
    }
    g.userData.colliders = [{ x: 0, z: 0, r: 1.7 }, { x: 0.4, z: -2.3, r: 1.0 }];
    return g;
  },
  // 参悟蒲团：洞口前的草编蒲团、一只小香炉、一缕香烟
  study(lv, M) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.18, 18).translate(0, 0.09, 0), M.straw));
    g.add(mesh(lathe([[0.01, 0], [0.22, 0.02], [0.26, 0.16], [0.2, 0.26], [0.24, 0.3], [0.01, 0.3]], 12).translate(0.95, 0.02, -0.35), M.bronze));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5).translate(-0.4, 0.5, -1.0), M.wood)); // 低案
    for (const sx of [-1, 0.2]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.46, 0.4).translate(sx * 0.55 - 0.4 + (sx > 0 ? 0.4 : 0), 0.23, -1.0), M.wood));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32).translate(-0.6, 0.6, -1.0), M.paper)); // 一卷残卷
    g.userData.smoke = [0.95, 0.35, -0.35];
    g.userData.colliders = [{ x: -0.4, z: -1.0, r: 0.6 }];
    return g;
  },
  // 内观阁：朝西敞开的半轩，剑架 / 衣桁 / 功法匣对应共用备战界面。
  // 同材质合批，沿用洞府预热材质；没有新灯光、逐帧动画或贴图绘制。
  loadout(lv, M) {
    const g = new THREE.Group(), wood = [], dark = [], paper = [], cloth = [];
    const box = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.2, 2.8).translate(0, 0.04, 0), M.stone));
    box(wood, 3.2, 2.35, 0.14, 0, 1.3, -1.25);
    box(wood, 0.14, lv >= 2 ? 2.35 : 1.0, 2.5, -1.55, lv >= 2 ? 1.3 : 0.63, 0);
    box(wood, 0.14, 2.35, 2.5, 1.55, 1.3, 0);
    for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) box(dark, 0.16, 2.65, 0.16, x, 1.42, z);
    box(dark, 3.35, 0.16, 0.2, 0, 2.62, 1.2);
    box(dark, 3.7, 0.16, 0.22, 0, 3.38, 0);
    const roof = [];
    for (const s of [-1, 1]) roof.push(new THREE.BoxGeometry(3.75, 0.12, 1.9).rotateX(s * 0.42).translate(0, 3.03, s * 0.82));
    g.add(mesh(mergeGeos(roof), lv >= 2 ? M.tile : M.thatch));
    // 剑架、横剑与朱穗
    for (const x of [-1.05, -0.35]) box(dark, 0.07, 1.35, 0.09, x, 0.82, -0.62);
    box(wood, 1.0, 0.07, 0.08, -0.7, 1.21, -0.59);
    box(paper, 1.0, 0.06, 0.07, -0.7, 1.32, -0.56);
    box(dark, 0.25, 0.09, 0.09, -1.28, 1.32, -0.56);
    box(cloth, 0.04, 0.32, 0.04, -1.36, 1.12, -0.56);
    // 衣桁：纸色法衣，低饱和红腰带（不是品级编码）
    for (const x of [0.46, 1.24]) box(wood, 0.06, 1.65, 0.08, x, 0.98, -0.6);
    box(wood, 1.0, 0.07, 0.08, 0.85, 1.8, -0.6);
    box(paper, 0.48, 0.88, 0.1, 0.85, 1.28, -0.56);
    box(paper, 0.88, 0.25, 0.1, 0.85, 1.65, -0.56);
    box(cloth, 0.5, 0.07, 0.12, 0.85, 1.19, -0.55);
    // 低案与半开的功法匣
    box(wood, 1.05, 0.08, 0.55, 0, 0.56, 0.35);
    for (const x of [-0.4, 0.4]) box(wood, 0.07, 0.39, 0.42, x, 0.33, 0.35);
    box(dark, 0.48, 0.12, 0.32, 0, 0.66, 0.35);
    dark.push(new THREE.BoxGeometry(0.48, 0.04, 0.32).rotateX(-0.45).translate(0, 0.8, 0.29));
    box(paper, 0.34, 0.03, 0.22, 0, 0.73, 0.37);
    g.add(mesh(mergeGeos(wood), M.wood), mesh(mergeGeos(dark), M.woodDark), mesh(mergeGeos(paper), M.paper), mesh(mergeGeos(cloth), M.cloth));
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 12).translate(0, 0.2, 0.98), M.straw));
    const glow = glowSprite(0xd8c896, 0.45, 0.5);
    glow.position.set(0, 0.77, 0.45);
    glow.visible = !1;
    g.add(glow);
    g.userData.innerGlow = glow;
    g.rotation.y = -Math.PI / 2; // 局部正面 +Z 转向院子（西）
    // 碰撞用旋转后的偏移，站位 x=10.2 留在敞口外，不堵石径。
    g.userData.colliders = [{ x: 0.55, z: -0.7, r: 0.82 }, { x: 0.55, z: 0.7, r: 0.82 }];
    return g;
  },
  // 炼丹炉：三足圆炉。0 级倾倒在地、炉盖滚在一旁；1 级扶正；2 级铜炉金箍、炉下生火
  furnace(lv, M) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const mat = lv >= 2 ? M.bronzeHi : M.bronze;
    body.add(mesh(lathe([[0.01, 0.45], [0.55, 0.5], [0.85, 0.8], [0.92, 1.15], [0.8, 1.5], [0.62, 1.62], [0.66, 1.7], [0.01, 1.7]]), mat));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      body.add(mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.62, 6).translate(Math.cos(a) * 0.55, 0.3, Math.sin(a) * 0.55), mat));
    }
    for (const s of [-1, 1]) body.add(mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 10).translate(s * 0.92, 1.55, 0).rotateY(0), mat));
    const lid = new THREE.Group();
    lid.add(mesh(lathe([[0.01, 0], [0.7, 0], [0.55, 0.25], [0.2, 0.38], [0.12, 0.55], [0.01, 0.6]], 16), mat));
    if (lv >= 2) {
      body.add(mesh(new THREE.TorusGeometry(0.9, 0.04, 5, 32).rotateX(Math.PI / 2).translate(0, 1.15, 0), M.gold));
      body.add(mesh(new THREE.TorusGeometry(0.66, 0.035, 5, 28).rotateX(Math.PI / 2).translate(0, 1.66, 0), M.gold));
    }
    if (lv <= 0) {
      body.rotation.set(0, 0.6, 1.35);
      body.position.set(0.2, 0.75, 0);
      lid.position.set(-1.3, 0.05, 0.7);
      lid.rotation.set(0.5, 0, 2.6);
      g.add(body, lid);
      // 碎砖
      const R = rng(4);
      const bricks = [];
      for (let k = 0; k < 7; k++) bricks.push(place(new THREE.BoxGeometry(0.34, 0.14, 0.2), (R() - 0.5) * 2.4, 0.07, (R() - 0.5) * 2, R() * 3));
      g.add(mesh(mergeGeos(bricks), M.stoneDark));
    } else {
      lid.position.y = 1.7;
      g.add(body, lid);
      g.add(mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 8).translate(0, 0.0, 0), M.stone)); // 炉台
      body.position.y = 0.15;
      lid.position.y = 1.85;
      g.userData.fire = [0, 0.55, 0];
      g.userData.smoke = [0, 2.6, 0];
    }
    g.userData.colliders = [{ x: 0, z: 0, r: 1.1 }];
    return g;
  },
  // 天机镜台（原鉴宝台）：石案、铜镜、一盏小灯。铜镜就是林墨的手机：镜面上一块竖屏（不投影、不进阴影 pass），
  // 平时呼吸、偶尔亮屏（CaveScene._mirrorTick），右上一个朱点（未读），一团加法微光（亮屏时才显示）
  appraise(lv, M) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.16, 1.0).translate(0, 0.92, 0), M.stone));
    for (const sx of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.34, 0.86, 0.8).translate(sx, 0.43, 0), M.stoneDark));
    const mirror = new THREE.Group();
    mirror.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 24).rotateX(Math.PI / 2), M.bronzeHi));
    mirror.add(mesh(new THREE.TorusGeometry(0.36, 0.035, 5, 24), M.gold));
    const scr = new THREE.Mesh(mirrorScreenGeo(), new THREE.MeshBasicMaterial({ color: 0xcfe9ee, transparent: !0, opacity: 0.1, depthWrite: !1 }));
    scr.position.z = 0.03;
    scr.renderOrder = 4;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), new THREE.MeshBasicMaterial({ color: 0xb8291a, transparent: !0, opacity: 0.95, depthWrite: !1 }));
    dot.position.set(0.095, 0.19, 0.036);
    dot.renderOrder = 5;
    dot.visible = !1;
    for (const m of [scr, dot]) m.userData.noShadow = !0;
    const halo = glowSprite(0x9fd8e6, 1.2, 0);
    halo.position.z = 0.12;
    halo.visible = !1;
    mirror.add(scr, dot, halo);
    mirror.position.set(-0.35, 1.48, -0.15);
    mirror.rotation.y = 0.25;
    g.userData.mirror = { scr, dot, halo, o: -1 };
    g.add(mirror, mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12).translate(-0.35, 1.08, -0.15), M.wood));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.04, 0.38).translate(0.45, 1.02, 0.1), M.paper));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6).translate(0.75, 1.15, -0.25), M.woodDark));
    g.userData.lamp = [0.75, 1.38, -0.25];
    g.userData.colliders = [{ x: 0, z: 0, r: 1.05 }];
    return g;
  },
  // 炼器鼎：方鼎四足双耳。0 级碎成几块散在地上；2 级铜色金纹、鼎内生光
  forge(lv, M) {
    const g = new THREE.Group();
    const mat = lv >= 2 ? M.bronzeHi : M.bronze;
    const parts = [];
    const bodyG = new THREE.BoxGeometry(1.5, 1.0, 1.2);
    const p = bodyG.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) (p.setX(i, p.getX(i) * 1.1), p.setZ(i, p.getZ(i) * 1.1));
    bodyG.computeVertexNormals();
    if (lv <= 0) {
      const R = rng(9);
      g.add(mesh(place(bodyG.clone().scale(1, 0.55, 1), 0, 0.28, 0, 0.3).rotateZ(0.25), mat));
      for (let k = 0; k < 4; k++) parts.push(place(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6).rotateZ(Math.PI / 2), (R() - 0.5) * 3, 0.12, (R() - 0.5) * 2.4, R() * 3));
      parts.push(place(new THREE.BoxGeometry(0.8, 0.12, 0.6), 1.3, 0.06, 0.8, 0.7), place(new THREE.BoxGeometry(0.6, 0.1, 0.5), -1.2, 0.05, -0.6, 2.1));
      g.add(mesh(mergeGeos(parts), mat));
    } else {
      g.add(mesh(new THREE.BoxGeometry(2.3, 0.28, 2.0).translate(0, 0.14, 0), M.stone));
      g.add(mesh(bodyG.clone().translate(0, 1.3, 0), mat));
      for (const sx of [-0.55, 0.55]) for (const sz of [-0.42, 0.42]) parts.push(new THREE.CylinderGeometry(0.11, 0.13, 0.6, 6).translate(sx, 0.55, sz));
      for (const sx of [-0.55, 0.55]) parts.push(new THREE.TorusGeometry(0.22, 0.06, 5, 10, Math.PI).translate(sx, 1.82, 0));
      g.add(mesh(mergeGeos(parts), mat));
      if (lv >= 2) {
        g.add(mesh(new THREE.BoxGeometry(1.68, 0.06, 1.34).translate(0, 1.55, 0), M.gold));
        g.userData.fire = [0, 1.9, 0];
      }
    }
    g.userData.colliders = [{ x: 0, z: 0, r: 1.15 }];
    return g;
  },
  // 药园 v2：开局 1 块地（断篱、荒土），扩建后按地块数开出带田埂的畦（2 / 4 / 6 块，搬迁后再多 2 块）；等级越高灵土越润、隐隐泛青
  garden(lv, M, S, plots) {
    const g = new THREE.Group();
    const R = rng(21);
    const n = Math.max(1, plots);
    const broken = lv <= 0;
    const P = PLOTS.slice(0, n);
    // 竹篱：围住已开的地块，朝院子一侧（+x）留门
    const x0 = Math.min(...P.map((q) => q[0])) - 1.35, x1 = Math.max(...P.map((q) => q[0])) + 1.35;
    const z0 = Math.min(...P.map((q) => q[1])) - 1.35, z1 = Math.max(...P.map((q) => q[1])) + 1.35;
    const fence = [];
    const post = (x, z) => {
      if (broken && R() < 0.4) return;
      fence.push(place(new THREE.CylinderGeometry(0.04, 0.05, 0.72 + R() * 0.14, 5).translate(0, 0.36, 0), x, 0, z, 0).rotateZ(broken ? (R() - 0.5) * 0.5 : 0));
    };
    for (let x = x0; x <= x1 + 1e-3; x += 0.42) post(x, z0), post(x, z1);
    for (let z = z0 + 0.42; z < z1 - 0.2; z += 0.42) post(x0, z), Math.abs(z - (z0 + z1) / 2) > 0.7 && post(x1, z);
    if (!broken)
      fence.push(
        new THREE.BoxGeometry(x1 - x0, 0.05, 0.05).translate((x0 + x1) / 2, 0.55, z0), new THREE.BoxGeometry(x1 - x0, 0.05, 0.05).translate((x0 + x1) / 2, 0.55, z1),
        new THREE.BoxGeometry(0.05, 0.05, z1 - z0).translate(x0, 0.55, (z0 + z1) / 2),
      );
    if (fence.length) g.add(mesh(mergeGeos(fence), toon({ color: 0x6f8a58, bamboo: !0 })));
    // 灵土：等级越高越润（略带青金的自发光）
    const soilC = [0x5e5140, 0x4f4436, 0x4a4234, 0x463f30][Math.min(3, lv)];
    const soil = toon({ color: soilC, tri: !0, brushK: 0.55, brushScale: 0.9, emissive: [0x000000, 0x18200c, 0x1e2a10, 0x2a2a0e][Math.min(3, lv)], emissiveIntensity: 0.6 });
    const ridge = toon({ color: 0x8a7a5e, tri: !0, brushK: 0.5, brushScale: 0.8 });
    for (const [px, pz] of P) {
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.16, 1.7).translate(px, 0.05, pz), soil));
      // 田埂：畦四周略高的一圈土埂
      const rd = [
        new THREE.BoxGeometry(2.0, 0.2, 0.16).translate(px, 0.08, pz - 0.92), new THREE.BoxGeometry(2.0, 0.2, 0.16).translate(px, 0.08, pz + 0.92),
        new THREE.BoxGeometry(0.16, 0.2, 1.7).translate(px - 0.92, 0.08, pz), new THREE.BoxGeometry(0.16, 0.2, 1.7).translate(px + 0.92, 0.08, pz),
      ];
      g.add(mesh(mergeGeos(rd), ridge));
      // 垄沟
      const rows = [];
      for (let r = 0; r < 3; r++) rows.push(new THREE.BoxGeometry(1.45, 0.07, 0.2).translate(px, 0.15, pz - 0.5 + r * 0.5));
      g.add(mesh(mergeGeos(rows), soil));
      if (broken) for (let k = 0; k < 5; k++) g.add(mesh(new THREE.ConeGeometry(0.05, 0.3 + R() * 0.2, 4).translate(px + (R() - 0.5) * 1.4, 0.25, pz + (R() - 0.5) * 1.4), toon({ color: 0x7a8a5a })));
    }
    // 地头一只木桶、一把锄头
    if (!broken) {
      g.add(mesh(lathe([[0.01, 0], [0.26, 0], [0.3, 0.45], [0.27, 0.5], [0.01, 0.5]], 10).translate(x1 + 0.35, 0, z0 + 0.4), M.wood));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 4).rotateZ(0.5).translate(x1 + 0.3, 0.55, z0 + 1.0), M.woodDark));
    }
    g.userData.plots = P;
    g.userData.colliders = [];
    return g;
  },
  // 仓库：靠崖的木棚，棚下陶瓮与木箱
  storage(lv, M) {
    const g = new THREE.Group();
    const posts = [];
    for (const [x, z, h] of [[-1.5, -1.1, 2.6], [1.5, -1.1, 2.6], [-1.5, 1.1, 2.1], [1.5, 1.1, 2.1]]) posts.push(new THREE.CylinderGeometry(0.1, 0.12, h, 6).translate(x, h / 2, z));
    posts.push(new THREE.BoxGeometry(3.3, 1.6, 0.12).translate(0, 0.8, -1.15)); // 后墙板
    g.add(mesh(mergeGeos(posts), M.wood));
    const roof = mesh(new THREE.BoxGeometry(3.9, 0.12, 3.0).translate(0, 0, 0), M.thatch);
    roof.position.set(0, 2.45, 0);
    roof.rotation.x = 0.2;
    g.add(roof);
    const jars = [];
    for (const [x, z, s] of [[-0.9, -0.5, 1], [-0.3, -0.6, 0.8], [0.9, 0.5, 0.7]]) jars.push(place(lathe([[0.01, 0], [0.28, 0.02], [0.4, 0.35], [0.36, 0.62], [0.2, 0.75], [0.22, 0.82], [0.01, 0.82]], 12).scale(s, s, s), x, 0, z));
    g.add(mesh(mergeGeos(jars), M.stoneDark));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6).translate(0.6, 0.25, -0.5), M.woodDark));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5).translate(0.55, 0.7, -0.5), M.wood));
    g.userData.colliders = [{ x: 0, z: -0.3, r: 1.5 }];
    return g;
  },
  // 出行台：崖外伸出的圆形石台，前立一座石牌坊
  depart(lv, M) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.5, 28).translate(0, -0.05, 0), M.stone));
    g.add(mesh(new THREE.TorusGeometry(2.3, 0.08, 5, 40).rotateX(Math.PI / 2).translate(0, 0.21, 0), M.stoneDark));
    // 台面刻一道八卦纹（浅墨环）
    g.add(mesh(new THREE.RingGeometry(0.9, 1.0, 32).rotateX(-Math.PI / 2).translate(0, 0.22, 0), M.stoneDark));
    const gate = [];
    for (const sx of [-2.0, 2.0]) gate.push(new THREE.BoxGeometry(0.34, 3.2, 0.34).translate(sx, 1.6, -2.4), new THREE.BoxGeometry(0.6, 0.3, 0.6).translate(sx, 0.15, -2.4));
    gate.push(new THREE.BoxGeometry(5.0, 0.28, 0.42).translate(0, 3.25, -2.4), new THREE.BoxGeometry(4.4, 0.18, 0.3).translate(0, 2.75, -2.4));
    g.add(mesh(mergeGeos(gate), M.stoneDark));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.42, 0.06).translate(0, 3.0, -2.2), M.paper));
    g.userData.colliders = [{ x: -2.0, z: -2.4, r: 0.35 }, { x: 2.0, z: -2.4, r: 0.35 }];
    return g;
  },
};

// 破屋 / 丹房：炼丹炉后面的屋子。修缮度低时茅草顶塌漏、一面墙倒了一半
function hut(M, repair) {
  const g = new THREE.Group();
  const R = rng(3);
  const W = 5.4, D = 3.6, Hh = 2.5;
  const walls = [];
  walls.push(new THREE.BoxGeometry(W, Hh, 0.2).translate(0, Hh / 2, -D / 2));
  const sideH = repair < 0.35 ? 1.2 : Hh;
  walls.push(new THREE.BoxGeometry(0.2, sideH, D).translate(-W / 2, sideH / 2, 0), new THREE.BoxGeometry(0.2, Hh, D).translate(W / 2, Hh / 2, 0));
  walls.push(new THREE.BoxGeometry(1.6, Hh, 0.2).translate(-W / 2 + 0.8, Hh / 2, D / 2), new THREE.BoxGeometry(1.6, Hh, 0.2).translate(W / 2 - 0.8, Hh / 2, D / 2));
  walls.push(new THREE.BoxGeometry(W - 3.2, 0.5, 0.2).translate(0, Hh - 0.25, D / 2));
  g.add(mesh(mergeGeos(walls), toon({ color: 0xbdb5a0, tri: !0, brushK: 0.55, brushScale: 0.8, fade: !0 })));
  const beams = [];
  for (const sx of [-W / 2, W / 2]) for (const sz of [-D / 2, D / 2]) beams.push(new THREE.BoxGeometry(0.26, Hh + 0.1, 0.26).translate(sx, Hh / 2, sz));
  g.add(mesh(mergeGeos(beams), M.woodDark));
  // 屋顶：两坡，由一片片瓦 / 草排拼成，修缮度低时缺片
  const tiled = repair >= 0.6;
  const pieces = [];
  const nx = 9, nz = 4, slopeA = 0.5, half = D / 2 + 0.6;
  for (const side of [-1, 1])
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        if (R() < (1 - repair) * 0.4 && k < nz - 1) continue;
        const u = (k + 0.5) / nz;
        const z = side * (u * half), y = Hh + 1.3 - u * half * Math.tan(slopeA);
        const tile = new THREE.BoxGeometry((W + 1.2) / nx + 0.04, 0.12, half / nz + 0.12);
        tile.rotateX(side * slopeA).translate(-W / 2 - 0.6 + ((i + 0.5) * (W + 1.2)) / nx, y + (R() - 0.5) * 0.05, z);
        pieces.push(tile);
      }
  g.add(mesh(mergeGeos(pieces), tiled ? M.tile : M.thatch));
  g.add(mesh(new THREE.BoxGeometry(W + 1.4, 0.2, 0.24).translate(0, Hh + 1.32, 0), M.woodDark));
  if (repair >= 0.6) for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.12, 0.6, 5).rotateZ(sx * 1.1).translate(sx * (W / 2 + 0.75), Hh + 1.45, 0), M.woodDark));
  // 门洞里的暗
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.0).translate(0, 1.0, D / 2 - 0.08), M.black);
  g.add(door);
  shade(g);
  return g;
}

// 洞口：峭壁上的一个暗拱，石沿
function caveMouth(M) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.7, 0);
  shape.lineTo(-1.6, 1.9);
  shape.quadraticCurveTo(-1.2, 3.3, 0, 3.4);
  shape.quadraticCurveTo(1.3, 3.3, 1.65, 1.8);
  shape.lineTo(1.75, 0);
  const dark = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), M.black);
  g.add(dark);
  const rimPts = [];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI * (k / 16);
    rimPts.push(place(rockGeo(k * 2.3, 1).scale(0.45, 0.4, 0.4), -Math.cos(a) * 1.9, Math.sin(a) * 3.5, 0.15, k));
  }
  g.add(mesh(mergeGeos(rimPts), M.rock));
  return g;
}

// 松树（与 vegetation.js 同法：弯干、平展枝、扁平松针团）
function pine(tex, x, y0, z, hgt, lean, seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const geos = [];
  const pts = [];
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    pts.push(new THREE.Vector3(Math.sin(u * 2.4 + seed) * 0.5 + lean[0] * u * u * hgt, u * hgt, Math.cos(u * 2.0 + seed) * 0.4 + lean[1] * u * u * hgt));
  }
  const trunk = new THREE.CatmullRomCurve3(pts);
  geos.push(new THREE.TubeGeometry(trunk, 24, 0.28, 7, !1), new THREE.CylinderGeometry(0.3, 0.55, 0.6, 7).translate(0, 0.25, 0));
  const pads = [];
  for (let b = 0; b < 6; b++) {
    const u = 0.42 + (b / 6) * 0.55, base = trunk.getPoint(u), a = r() * 6.28 + b * 2.1, len = (1.6 + r() * 2) * (1.15 - u * 0.5);
    const mid = base.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.5, 0.3, Math.sin(a) * len * 0.5));
    const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.2 + r() * 0.3, Math.sin(a) * len));
    const c = new THREE.CatmullRomCurve3([base, mid, tip]);
    geos.push(new THREE.TubeGeometry(c, 8, 0.09 * (1.3 - u * 0.6), 5, !1));
    for (let k = 0; k < 4; k++) {
      const p = c.getPoint(Math.min(1, 0.45 + k * 0.17));
      pads.push([p.x + (r() - 0.5) * 0.6, p.y + 0.12, p.z + (r() - 0.5) * 0.6, 1.4 + r(), r() * 6.28]);
    }
  }
  const top = trunk.getPoint(1);
  for (let k = 0; k < 4; k++) pads.push([top.x + (r() - 0.5) * 0.8, top.y + 0.1 + k * 0.12, top.z + (r() - 0.5) * 0.8, 1.6 - k * 0.25, r() * 6.28]);
  g.add(mesh(mergeGeos(geos), toon({ color: 0x5e4c3c, tri: !0, brushK: 0.7, brushScale: 0.9, wind: [0.06, 8], fade: !0 })));
  const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), toon({ color: 0x2f5e46, map: tex, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 1], windConst: !0, fade: !0 }), pads.length * 2);
  pads.forEach(([px, py, pz, s, a], i) => {
    for (let k = 0; k < 2; k++) {
      _E.set((r() - 0.5) * 0.35, a + k * 0.8, (r() - 0.5) * 0.35);
      pm.setMatrixAt(i * 2 + k, _M.compose(_P.set(px, py + k * 0.06, pz), _Q.setFromEuler(_E), _S.set(s * (1 - k * 0.2), 1, s * 0.7 * (1 - k * 0.2))));
    }
  });
  pm.castShadow = pm.receiveShadow = !0;
  pm.customDepthMaterial = cutoutDepth(tex, 0.4);
  g.add(pm);
  g.position.set(x, y0 - 0.2, z);
  return g;
}

// ---------------- 场景 ----------------
// 构建：new CaveScene(opts) 同步建完；new CaveScene({ ..., defer: true }) + await scene.buildAsync(nextFrame) 分帧建
//（第一次进洞府时用，每步 ≤ 十几毫秒，配合加载遮罩，不出长帧）
export class CaveScene {
  constructor({ region = "r1", brush = null, defer = !1 } = {}) {
    this.region = region;
    this.brush = brush || brushTextures();
    this.root = new THREE.Group();
    this.root.name = "cave";
    this.M = mats();
    this.colliders = [];
    this.static = [];
    this.H = (x, z) => caveHeight(x, z, region);
    if (defer) return;
    this._grid = this._bake();
    this._init();
    for (const f of this._parts()) f();
    this._finish();
  }
  async buildAsync(next) {
    // 高度网格按行分批
    const x0 = -33, z0 = -25, step = 0.25, nx = 265, nz = 185, a = new Float32Array(nx * nz);
    for (let j0 = 0; j0 < nz; j0 += 14) {
      const t0 = performance.now();
      for (let j = j0; j < Math.min(nz, j0 + 14); j++) for (let i = 0; i < nx; i++) a[j * nx + i] = this.H(x0 + i * step, z0 + j * step);
      if (typeof window !== "undefined" && window.__caveProfile && j0 === 0) console.log("[cave-t] grid chunk " + Math.round(performance.now() - t0));
      await next();
    }
    this._grid = { x0, z0, step, nx, nz, a };
    this._init();
    const T = [];
    for (const f of this._parts()) {
      const t0 = performance.now();
      f();
      T.push(Math.round(performance.now() - t0));
      await next();
    }
    if (typeof window !== "undefined" && window.__caveProfile) console.log("[cave-t] parts " + T.join(","));
    this._finish();
    return this;
  }
  _init() {
    this.stations = {};
    for (const [id, s] of Object.entries(CAVE_STATIONS)) {
      const [x, z] = s.at;
      this.stations[id] = { id, pos: new THREE.Vector3(x, this.H(x, z), z), r: s.r, tagY: s.tagY, stand: s.stand };
    }
    this.models = {};
    for (const [id, [x, z]] of Object.entries(CAVE_MODELS)) this.models[id] = new THREE.Vector3(x, this.H(x, z), z);
    this.groups = {};
    this.levels = {};
    this.time = 0;
    this._waterMats = [];
  }
  _finish() {
    this.fx = new CaveFX(this);
    this.wisp = new Wisp(this);
    this.root.add(this.wisp.group);
  }
  _bake() {
    const x0 = -33, z0 = -25, step = 0.25, nx = 265, nz = 185;
    const a = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) a[j * nx + i] = this.H(x0 + i * step, z0 + j * step);
    return { x0, z0, step, nx, nz, a };
  }
  height(x, z) {
    const G = this._grid;
    const fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    if (fx < 0 || fz < 0 || fx >= G.nx - 1 || fz >= G.nz - 1) return -30;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, a = G.a, n = G.nx;
    const h0 = a[j * n + i] * (1 - u) + a[j * n + i + 1] * u, h1 = a[(j + 1) * n + i] * (1 - u) + a[(j + 1) * n + i + 1] * u;
    let h = h0 * (1 - v) + h1 * v;
    // 出行台石面
    const d = this.models && this.models.depart;
    if (d && Math.hypot(x - d.x, z - d.z) < 2.3) h = Math.max(h, d.y + 0.2);
    return h;
  }
  ground(x, z) {
    return this.height(x, z);
  }
  slope(x, z) {
    const e = 0.35;
    return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
  }
  // 与 terrain.canStand 一致的行走规则
  canStand(x, z, fromY, r = 0.32) {
    const h = this.height(x, z);
    if (h < -0.8) return !1;
    if (h - fromY > 0.55 || fromY - h > 0.9) return !1;
    for (const c of this.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return !1;
    return !0;
  }

  // 场景的各部分（分帧构建时每部分之间让一帧）
  _parts() {
    const M = this.M, root = this.root, H = this.H;
    return [
      () => (this._tg = terrainGeo(H, this._grid)),
      () => terrainNormals(this._tg),
      () => (root.add(terrainFinish(this._tg, this.region)), (this._tg = null)),
      () => (root.add(caveMouthAt(M, H)), (this.hutAt = [7.6, -9.3]), this._rocks()),
      () => this._trees(),
      () => this.region === "r2" && root.add(this._stream()),
      () => ((this.pathMesh = this._paths()), root.add(this.pathMesh)),
      () => ((this.weeds = this._weeds()), root.add(this.weeds)),
      () => ((this.rubble = this._rubble()), root.add(this.rubble), (this.lanterns = this._lanterns()), root.add(this.lanterns)),
      () => ((this.sky = buildSky()), (this.sky.name = "cave-sky"), root.add(this.sky)),
    ];
  }
  _rocks() {
    const M = this.M, root = this.root, H = this.H;
    // 崖顶与院角的山石
    const R = rng(this.region === "r2" ? 61 : 41);
    const rockList = [];
    for (let k = 0; k < 26; k++) {
      const x = -30 + k * 2.4 + (R() - 0.5) * 2, z = cliffZ(x) - 3.2 - R() * 3;
      rockList.push([x, H(x, z) - 0.6, z, 1.4 + R() * 1.6, 0.6 + R() * 0.5]);
    }
    for (const [x, z, s] of [[-17.5, 1.5, 1.3], [16.5, 3.5, 1.1], [-3.5, 8.2, 0.7], [14.8, -6.2, 1.2], [-16, -7.5, 1.0], [5.2, 6.6, 0.6], [-11.8, 8.4, 0.8]]) {
      rockList.push([x, H(x, z) - 0.15 * s, z, s, 0.7 + R() * 0.3]);
      this.colliders.push({ x, z, r: s * 0.8 });
    }
    const vars = [rockGeo(1.3), rockGeo(4.7), rockGeo(9.1)];
    const per = [[], [], []];
    rockList.forEach((r, i) => per[i % 3].push(r));
    per.forEach((list, v) => {
      const m = new THREE.InstancedMesh(vars[v], M.rock, list.length);
      list.forEach(([x, y, z, s, sy], i) => m.setMatrixAt(i, _M.compose(_P.set(x, y, z), _Q.setFromEuler(_E.set(0, R() * 6, 0)), _S.set(s, s * sy, s))));
      m.castShadow = m.receiveShadow = !0;
      root.add(m);
    });
  }
  _trees() {
    const root = this.root, H = this.H;
    // 树：区域一两棵迎客松；溪谷版是两侧竹林
    if (this.region === "r2") root.add(this._bamboo());
    else {
      for (const [x, z, h, lean, seed] of [[-16.2, -2.2, 8.5, [0.18, 0.1], 3.3], [15.6, 6.4, 6.5, [-0.25, 0.05], 7.1], [13.5, -9.6, 7.5, [-0.1, 0.12], 5.5]]) {
        root.add(pine(this.brush.pine, x, H(x, z), z, h, lean, seed));
        this.colliders.push({ x, z, r: 0.5 });
      }
    }
  }
  _paths() {
    const lines = [
      [[0, 4.8], [0, 8.4], [0, 9.6]],
      [[0, 4.8], [0.3, 1.5], [0, -2.5], [0, -7.6]],
      [[0.2, 0], [-3.5, -1.6], [-6.4, -2.8]],
      [[0.2, 0.4], [2.6, 1.2], [4.2, 1.6]],
      [[0, -3.2], [3.5, -3.8], [6.2, -4.2]],
      [[4.4, 1.7], [7.5, 1.0], [10, 0.6]],
      [[0.3, 2.2], [-3.5, 3.2], [-6.6, 3.6]],
      [[-3.5, -1.6], [-8.5, -2.4], [-11, -2.6]],
    ];
    const R = rng(12), slabs = [];
    for (const l of lines) {
      const curve = new THREE.CatmullRomCurve3(l.map(([x, z]) => new THREE.Vector3(x, 0, z)));
      const len = curve.getLength();
      for (let d = 0; d < len; d += 0.82) {
        const p = curve.getPointAt(d / len), t = curve.getTangentAt(d / len);
        for (const side of [-0.4, 0.4]) {
          const x = p.x - t.z * side + (R() - 0.5) * 0.2, z = p.z + t.x * side + (R() - 0.5) * 0.2;
          slabs.push([x, this.height(x, z), z, Math.atan2(t.x, t.z) + (R() - 0.5) * 0.3, R()]);
        }
      }
    }
    // 打乱：count 越小越残缺
    slabs.sort((a, b) => a[4] - b[4]);
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.76, 0.12, 0.6), toon({ color: 0xc9c6bb, tri: !0, brushK: 0.35, brushScale: 0.6 }), slabs.length);
    slabs.forEach(([x, y, z, a], i) => m.setMatrixAt(i, _M.compose(_P.set(x, y + 0.03, z), _Q.setFromEuler(_E.set((R() - 0.5) * 0.06, a, (R() - 0.5) * 0.06)), _S.set(0.8 + R() * 0.4, 1, 0.8 + R() * 0.4))));
    m.receiveShadow = !0;
    m.userData.max = slabs.length;
    return m;
  }
  _weeds() {
    const tex = this.brush.grass;
    const g1 = new THREE.PlaneGeometry(0.8, 0.65).translate(0, 0.31, 0);
    const geo = mergeGeos([g1, g1.clone().rotateY(Math.PI / 2)]);
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const R = rng(7), spots = [];
    for (let k = 0; spots.length < 420 && k < 20000; k++) {
      const x = (R() - 0.5) * 42, z = (R() - 0.5) * 26 - 1;
      const h = this.height(x, z);
      if (h < -0.4 || h > 0.6 || this.slope(x, z) > 0.3) continue;
      if (Math.hypot(x - CAVE_SPAWN[0], z - CAVE_SPAWN[1]) < 1.5) continue;
      // 杂草沿院边、设施周围更密；中央石径少
      const dens = fbm(x * 0.12 + 5, z * 0.12) + (Math.abs(x) < 1.3 ? -0.3 : 0);
      if (dens < 0.5 + R() * 0.15) continue;
      spots.push([x, h, z, R()]);
    }
    spots.sort((a, b) => a[3] - b[3]);
    const m = new THREE.InstancedMesh(geo, toon({ color: 0xb4bea4, map: tex, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 0.6] }), spots.length);
    spots.forEach(([x, y, z], i) => {
      const s = 0.5 + R() * 0.55;
      m.setMatrixAt(i, _M.compose(_P.set(x, y - 0.03, z), _Q.setFromEuler(_E.set(0, R() * 6.28, 0)), _S.set(s, s * (0.8 + R() * 0.6), s)));
    });
    m.receiveShadow = !0;
    m.userData.max = spots.length;
    return m;
  }
  _rubble() {
    const R = rng(17), list = [];
    for (let k = 0; k < 60; k++) {
      const x = (R() - 0.5) * 34, z = (R() - 0.5) * 20 - 2;
      const h = this.height(x, z);
      if (h < -0.3 || h > 0.6 || Math.abs(x) < 1.0) continue;
      list.push([x, h, z]);
    }
    const geo = mergeGeos([new THREE.BoxGeometry(0.4, 0.14, 0.24), new THREE.BoxGeometry(0.22, 0.1, 0.3).translate(0.25, 0, 0.1)]);
    const m = new THREE.InstancedMesh(geo, this.M.stoneDark, list.length);
    list.forEach(([x, y, z], i) => m.setMatrixAt(i, _M.compose(_P.set(x, y + 0.05, z), _Q.setFromEuler(_E.set((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5)), _S.set(1, 1, 1))));
    m.castShadow = m.receiveShadow = !0;
    m.userData.max = list.length;
    return m;
  }
  _lanterns() {
    const g = new THREE.Group();
    for (const [x, z] of [[-1.4, 7.8], [1.4, 7.8], [-1.4, -6.2], [1.4, -6.2], [-5.2, 0.4], [6.2, 2.4]]) {
      const y = this.height(x, z);
      const parts = [
        new THREE.BoxGeometry(0.5, 0.14, 0.5).translate(0, 0.07, 0),
        new THREE.CylinderGeometry(0.1, 0.14, 0.8, 6).translate(0, 0.54, 0),
        new THREE.BoxGeometry(0.44, 0.1, 0.44).translate(0, 0.98, 0),
        new THREE.BoxGeometry(0.3, 0.3, 0.3).translate(0, 1.18, 0),
        new THREE.ConeGeometry(0.4, 0.3, 4).rotateY(Math.PI / 4).translate(0, 1.48, 0),
      ];
      const l = new THREE.Group();
      l.add(mesh(mergeGeos(parts), this.M.stone));
      const glow = glowSprite(0xffc070, 0.9, 0.85);
      glow.position.y = 1.18;
      l.add(glow);
      l.userData.glow = glow;
      l.position.set(x, y, z);
      l.userData.col = { x, z, r: 0.3 };
      g.add(l);
    }
    return g;
  }
  _bamboo() {
    const g = new THREE.Group();
    const tex = this.brush.bamboo, H0 = 7;
    const R = rng(88), culms = [];
    const spots = [[-17, -4, 4, 26], [-15, 5, 3, 14], [16.5, -5, 3.6, 22], [16, 5, 3, 14], [-9, -12.5, 3, 10], [11, -12, 3, 10]];
    for (const [cx, cz, rad, n] of spots)
      for (let k = 0, c = 0; c < n && k < n * 30; k++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const h = this.height(x, z);
        if (h < -0.5 || this.slope(x, z) > 0.6) continue;
        let near = !1;
        for (const [id, [mx, mz]] of Object.entries(CAVE_MODELS)) if (Math.hypot(x - mx, z - mz) < (id === "garden" ? 4.8 : 3.2)) near = !0;
        if (near) continue;
        culms.push([x, h, z]);
        c++;
      }
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.065, H0, 6, 14).translate(0, H0 / 2, 0), toon({ color: 0x6f9a62, bamboo: !0, wind: [0.45, H0], fade: !0 }), culms.length);
    const leaves = [];
    culms.forEach(([x, y, z], i) => {
      const s = 0.75 + R() * 0.45;
      cm.setMatrixAt(i, _M.compose(_P.set(x, y - 0.1, z), _Q.setFromEuler(_E.set((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12)), _S.set(1, s, 1)));
      cm.setColorAt(i, new THREE.Color().setScalar(0.7 + R() * 0.75));
      this.colliders.push({ x, z, r: 0.18 });
      for (let k = 0; k < 9; k++) {
        const hy = H0 * s * (0.45 + 0.55 * R()), a = R() * 6.28, r = 0.25 + R() * 0.55;
        leaves.push([x + Math.cos(a) * r, y + hy, z + Math.sin(a) * r, a, 0.8 + R() * 0.5]);
      }
    });
    cm.castShadow = cm.receiveShadow = !0;
    const lg = new THREE.PlaneGeometry(1.5, 1.2).translate(0, -0.35, 0);
    const nn = lg.attributes.normal;
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    const lm = new THREE.InstancedMesh(lg, toon({ color: 0x4f8a58, map: tex, alphaTest: 0.45, side: THREE.DoubleSide, wind: [0.22, 1], windConst: !0, fade: !0 }), leaves.length);
    leaves.forEach(([x, y, z, a, s], i) => lm.setMatrixAt(i, _M.compose(_P.set(x, y, z), _Q.setFromEuler(_E.set((R() - 0.5) * 0.9, a, (R() - 0.5) * 0.9)), _S.set(s, s, s))));
    lm.castShadow = lm.receiveShadow = !0;
    lm.customDepthMaterial = cutoutDepth(tex, 0.45);
    g.add(cm, lm);
    return g;
  }
  // 溪谷版的溪水：崖上一道细瀑，院中一条浅溪流向崖外
  _stream() {
    const g = new THREE.Group();
    const pts = [];
    for (let z = cliffZ(-3.6) - 0.6; z < 9.5; z += 0.5) {
      const x = -3.6 + Math.sin(z * 0.35) * 0.9 - (z + 10) * 0.25;
      pts.push(new THREE.Vector3(x, this.height(x, z) + 0.1, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const n = 120, pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
      for (const s of [-1, 1]) {
        const x = p.x - t.z * s * 0.75, z = p.z + t.x * s * 0.75;
        pos.push(x, Math.max(this.height(x, z), p.y - 0.12) + 0.06, z);
        uv.push((s + 1) / 2, i / n * 12);
      }
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = this.waterMat(2, !0);
    g.add(new THREE.Mesh(geo, mat));
    // 崖上细瀑
    const cz = cliffZ(-3.6);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 10, 1, 8).translate(0, 5, 0), this.waterMat(2, !0));
    fall.position.set(-3.6 - (cz + 10) * 0.25 + Math.sin(cz * 0.35) * 0.9, 0, cz - 1.4);
    fall.rotation.x = -0.18;
    g.add(fall);
    return g;
  }
  waterMat(lv, flow = !1) {
    const m = new THREE.ShaderMaterial({
      transparent: !0,
      depthWrite: !1,
      uniforms: { uTime: U.uTime, uLv: { value: lv }, uFlow: { value: flow ? 1 : 0 }, uGlow: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uLv, uFlow, uGlow; varying vec2 vUv; varying vec3 vW;
        void main(){
          vec3 deep = mix(vec3(0.42,0.55,0.55), vec3(0.45,0.70,0.66), clamp((uLv-1.0)*0.5,0.0,1.0));
          vec3 pale = vec3(0.86,0.92,0.88);
          float r = length(vUv - 0.5) * 2.0;
          float ring = uFlow > 0.5 ? smoothstep(0.6, 1.0, sin(vUv.y * 9.0 - uTime * 4.0) * 0.5 + 0.5) * 0.35
                                   : smoothstep(0.82, 1.0, sin(r * 18.0 - uTime * 1.6) * 0.5 + 0.5) * (1.0 - r) * 0.6;
          float edge = uFlow > 0.5 ? smoothstep(0.0, 0.25, min(vUv.x, 1.0 - vUv.x)) : 1.0 - smoothstep(0.75, 1.0, r);
          vec3 c = mix(deep, pale, 0.35 + ring + 0.25 * r * (1.0 - uFlow));
          c += vec3(0.25, 0.4, 0.35) * uGlow;
          gl_FragColor = vec4(c, (0.82 + 0.1 * uLv / 3.0) * (uFlow > 0.5 ? edge : 1.0));
        }`,
    });
    this._waterMats.push(m);
    return m;
  }

  // 按存档刷新：设施模型、修缮度外观、药园作物
  refresh(state) {
    const levels = state.levels || {};
    const tier = clamp(state.tier ?? 0, 0, 1);
    for (const id of Object.keys(CAVE_MODELS)) {
      const lv = id === "loadout" ? (tier >= 0.6 ? 2 : 1) : levels[id] ?? 1;
      const plots = id === "garden" ? state.plots ?? 0 : 0;
      const key = lv + ":" + plots;
      if (this.levels[id] === key) continue;
      this.levels[id] = key;
      if (this.groups[id]) this.root.remove(this.groups[id]);
      const at = this.models[id];
      const g = BUILD[id](lv, this.M, this, plots);
      g.position.copy(at);
      shade(g);
      this.groups[id] = g;
      this.root.add(g);
      g.userData.cols = (g.userData.colliders || []).map((c) => ({ x: c.x + at.x, z: c.z + at.z, r: c.r }));
    }
    // 破屋
    const hk = tier >= 0.6 ? 2 : tier >= 0.35 ? 1 : 0;
    if (this._hutKey !== hk) {
      this._hutKey = hk;
      if (this.hut) this.root.remove(this.hut);
      this.hut = hut(this.M, [0.15, 0.45, 0.8][hk]);
      const [x, z] = this.hutAt;
      this.hut.position.set(x, this.H(x, z), z);
      this.root.add(this.hut);
    }
    // 修缮度：杂草、碎石、石径完整度、石灯
    const overgrow = 1 - tier;
    this.weeds.count = Math.round(this.weeds.userData.max * (0.25 + 0.75 * overgrow));
    this.rubble.count = Math.round(this.rubble.userData.max * overgrow * overgrow);
    this.pathMesh.count = Math.round(this.pathMesh.userData.max * (0.55 + 0.45 * tier));
    this.lanterns.children.forEach((l, i) => {
      l.visible = tier >= 0.15 + i * 0.1;
      l.userData.glow.visible = tier >= 0.55;
    });
    // 碰撞体：固定物 + 设施 + 可见的石灯 + 破屋
    const cols = this.colliders.filter((c) => !c.dyn);
    for (const g of Object.values(this.groups)) for (const c of g.userData.cols || []) cols.push({ ...c, dyn: !0 });
    for (const l of this.lanterns.children) if (l.visible) cols.push({ ...l.userData.col, dyn: !0 });
    const [hx, hz] = this.hutAt;
    for (const dx of [-2.2, -0.8, 0.8, 2.2]) cols.push({ x: hx + dx, z: hz - 0.6, r: 1.2, dyn: !0 });
    this.colliders.length = 0;
    this.colliders.push(...cols);
    // 药园作物
    this._crops(state.garden || []);
    this._boxes();
  }
  // 预热用：把第一次出现才会编译的东西（各种灵草的成熟 / 生长造型、灵气微粒、品质微光、演出用的墨团）摆一份
  prewarmExtras() {
    const g = new THREE.Group();
    g.name = "cave-prewarm";
    let k = 0;
    for (const kind of new Set(Object.values(HERB_KIND)))
      for (const full of [!0, !1]) {
        const m = cropTemplate(kind, full);
        m.position.set(this.models.garden.x + (k % 4) * 0.6, this.models.garden.y, this.models.garden.z + Math.floor(k / 4) * 0.6);
        g.add(m);
        k++;
      }
    for (let r = 0; r < 5; r++) {
      const mo = cropMotes(r);
      mo.position.copy(this.models.garden);
      g.add(mo);
      const gl = glowSprite(qColor(r), 1, 0.3);
      gl.position.copy(this.models.garden);
      g.add(gl);
    }
    const ink = new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.5 }));
    ink.position.copy(this.models.spring);
    g.add(ink);
    return g;
  }
  // 每个站点的悬停包围盒（世界坐标，每件东西一个盒子，不合并——药园与丹房相隔整个院子）：丹器房 = 丹炉 + 炼器鼎 + 屋子 + 药园
  _boxes() {
    const parts = { spring: ["spring"], workshop: ["furnace", "forge", "hut"], garden: ["garden"], storage: ["storage"], depart: ["depart"], mirror: ["appraise"], loadout: ["loadout"] };
    this.stationBoxes = {};
    for (const [id, list] of Object.entries(parts)) {
      const boxes = [];
      for (const k of list) {
        const g = k === "hut" ? this.hut : this.groups[k];
        if (!g) continue;
        g.updateMatrixWorld(!0);
        const b = new THREE.Box3().setFromObject(g);
        if (!b.isEmpty()) boxes.push(b.expandByScalar(0.25));
      }
      this.stationBoxes[id] = boxes;
    }
  }
  // 药园作物：复用采集点的灵草造型（markers.js 的 gatherMarker），按生长阶段缩放：
  //   0 发芽 / 1 抽叶 / 2 成株（去掉圆相与微粒）→ 3 成熟（保留圆相、灵气微粒，加一团光）；年份越高越大、带品质色微光
  _crops(list) {
    const g = this.groups.garden;
    if (!g) return;
    const key = JSON.stringify([list, g.uuid]);
    if (this._cropKey === key) return;
    this._cropKey = key;
    if (this.cropGroup) g.remove(this.cropGroup);
    const cg = (this.cropGroup = new THREE.Group());
    cg.name = "crops";
    const plots = g.userData.plots || [];
    plots.forEach(([px, pz], i) => {
      const c = list[i];
      if (!c) return;
      const kind = HERB_KIND[c.herb] || "qingling";
      const r = c.rarity || 0;
      const ys = 1 + 0.1 * r; // 高年份略大，不夸张
      const sc = [0.32, 0.55, 0.8, 1][c.stage ?? (c.ripe ? 3 : 1)] * ys;
      const plant = (full) => cropTemplate(kind, full);
      const spots = c.stage >= 2 || c.ripe ? [[0, 0]] : [[-0.4, -0.35], [0.4, -0.35], [0, 0.4]];
      spots.forEach(([dx, dz], j) => {
        const m = plant(c.ripe && j === 0);
        m.scale.setScalar(sc);
        m.position.set(px + dx, 0.12, pz + dz);
        m.rotation.y = i * 1.7 + j * 2.1;
        cg.add(m);
      });
      if (c.ripe || r >= 1) {
        const glow = glowSprite(qColor(r), (1.2 + 0.35 * r) * (c.ripe ? 1.4 : 1), c.ripe ? 0.4 + 0.08 * r : 0.18 + 0.05 * r);
        glow.position.set(px, 0.55 * sc + 0.2, pz);
        cg.add(glow);
      }
      if (c.ripe) {
        const motes = cropMotes(r); // 粒子数上限：每块熟地 10 + 4×品质 粒，最多 8 块
        motes.position.set(px, 0.1, pz);
        cg.add(motes);
      }
    });
    g.add(cg);
  }

  update(dt, playerPos) {
    this.time += dt;
    const t = this.time;
    for (const g of Object.values(this.groups))
      g.traverse((o) => {
        if (o.isSprite && o.userData.float != null) o.position.y = 0.5 + 0.35 * Math.sin(t * 0.8 + o.userData.float);
      });
    for (const l of this.lanterns.children) if (l.userData.glow.visible) l.userData.glow.material.opacity = 0.75 + 0.15 * Math.sin(t * 3 + l.position.x);
    this.fx.update(dt);
    this.wisp.update(dt, playerPos);
    this._mirrorTick(dt);
  }
  // ---------------- 天机镜台 ----------------
  // 每帧只改两三个材质的 opacity（uniform），不建对象
  _mirrorTick(dt) {
    const g = this.groups.appraise, m = g && g.userData.mirror;
    if (!m) return;
    const st = this._mir || (this._mir = { t: 0, next: 6 + Math.random() * 8, f: -1, unread: !1, gold: !1 });
    st.t += dt;
    let o = 0.11 + 0.05 * Math.sin(this.time * 1.5708), k = 0; // 呼吸：周期 4 秒
    if (st.f < 0 && st.t >= st.next) st.f = 0;
    if (st.f >= 0) {
      const f = (st.f += dt);
      k = f < 0.15 ? f / 0.15 : f < 1.35 ? 1 : f < 2.15 ? 1 - (f - 1.35) / 0.8 : -1;
      if (k < 0) (k = 0), (st.f = -1), (st.t = 0), (st.next = st.unread ? 6 + Math.random() * 2 : 20 + Math.random() * 20);
      o = Math.max(o, 0.6 * k);
    }
    if (Math.abs(o - m.o) > 0.004) (m.scr.material.opacity = o), (m.o = o);
    const hv = k > 0.02;
    if (m.halo.visible !== hv) m.halo.visible = hv;
    if (hv) m.halo.material.opacity = 0.55 * k;
    if (m.dot.visible !== st.unread) m.dot.visible = st.unread;
  }
  // 存档变化后：{ unread 有未读（快闪 + 朱点）, gold 筑基后换泥金色 }
  setMirror({ unread = !1, gold = !1 } = {}) {
    const st = this._mir || (this._mir = { t: 0, next: 6 + Math.random() * 8, f: -1, unread: !1, gold: !1 });
    if (st.unread !== unread) (st.unread = unread), unread && (st.next = Math.min(st.next, 2));
    const m = this.groups.appraise && this.groups.appraise.userData.mirror;
    if (m && (st.gold !== gold || m.gold == null)) {
      st.gold = m.gold = gold;
      m.scr.material.color.setHex(gold ? 0xf0d9a0 : 0xcfe9ee);
      m.halo.material.color.setHex(gold ? 0xe0b45a : 0x9fd8e6);
    }
  }
  // 立刻亮一下屏（打开 / 合上天机镜时）
  mirrorFlash() {
    const st = this._mir || (this._mir = { t: 0, next: 10, f: -1, unread: !1, gold: !1 });
    st.f = 0;
  }
  // 镜面竖屏在屏幕上的位置（像素）与铜镜半径（像素），界面从这里放大 / 缩回
  mirrorScreen(camera) {
    const m = this.groups.appraise && this.groups.appraise.userData.mirror;
    if (!m || !camera) return null;
    m.scr.updateWorldMatrix(!0, !1);
    const c = m.scr.getWorldPosition(new THREE.Vector3());
    const e = c.clone().add(new THREE.Vector3(0.36, 0, 0)).project(camera);
    c.project(camera);
    const W = innerWidth, H = innerHeight;
    const x = (c.x * 0.5 + 0.5) * W, y = (-c.y * 0.5 + 0.5) * H;
    return { x, y, r: Math.max(6, Math.hypot((e.x * 0.5 + 0.5) * W - x, (-e.y * 0.5 + 0.5) * H - y)) };
  }
  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

function caveMouthAt(M, H) {
  const x = 0, cz = cliffZ(x);
  const g = caveMouth(M);
  g.position.set(x, H(x, cz + 0.6) - 0.05, cz - 0.15);
  g.rotation.x = -0.12;
  return g;
}

// ---------------- 演出 ----------------
class CaveFX {
  constructor(scene) {
    this.s = scene;
    this.root = new THREE.Group();
    scene.root.add(this.root);
    this.items = [];
    this.smokeT = 0;
    this.fires = [];
  }
  // 打坐炼化：灵气（墨点 + 灵光）从四周旋入主角
  meditate(pos, dur = 3, color = 0x7fd0c0) {
    const n = 46;
    const group = new THREE.Group();
    const parts = [];
    for (let k = 0; k < n; k++) {
      const s = k % 3 === 0 ? glowSprite(color, 0.45, 0.8) : new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.8 }));
      if (k % 3) s.scale.setScalar(0.35 + Math.random() * 0.3);
      parts.push({ s, a: Math.random() * 6.28, r: 3 + Math.random() * 3, y: 0.2 + Math.random() * 2.4, d: Math.random() * dur * 0.7 });
      group.add(s);
    }
    this.root.add(group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: !0, opacity: 0.5, depthWrite: !1 }));
    ring.position.set(pos.x, pos.y + 0.05, pos.z);
    this.root.add(ring);
    this.items.push({
      t: 0, dur, update: (it, k) => {
        for (const p of parts) {
          const u = clamp((it.t - p.d) / (dur * 0.35), 0, 1);
          const a = p.a + u * 4, r = p.r * (1 - u);
          p.s.position.set(pos.x + Math.cos(a) * r, pos.y + lerp(p.y, 1.1, u), pos.z + Math.sin(a) * r);
          p.s.material.opacity = u <= 0 ? 0 : u >= 1 ? 0 : 0.85 * Math.sin(u * Math.PI) + 0.1;
          if (u >= 1) (p.d = it.t + Math.random() * 0.3), (p.a = Math.random() * 6.28);
        }
        ring.scale.setScalar(1 + 0.15 * Math.sin(it.t * 5));
        ring.material.opacity = 0.5 * (1 - Math.max(0, k - 0.85) / 0.15);
      },
      end: () => this.root.remove(group, ring),
    });
  }
  // 采收：灵草处化作一团墨点（带品级色），沿弧线飞进仓库
  harvestFly(from, to, color = "#3fae7a") {
    const c = new THREE.Color(color).getHex();
    const parts = [];
    for (let k = 0; k < 18; k++) {
      const s = k % 3 ? new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.9 })) : glowSprite(c, 0.8, 0.95);
      if (k % 3) s.scale.setScalar(0.5 + Math.random() * 0.35);
      parts.push({ s, d: Math.random() * 0.25, j: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2) });
      this.root.add(s);
    }
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y += 4;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.items.push({
      t: 0, dur: 1.3, update: (it) => {
        for (const p of parts) {
          const u = clamp((it.t - p.d) / 0.95, 0, 1), e = u * u * (3 - 2 * u);
          a.lerpVectors(from, mid, e).add(b.copy(p.j).multiplyScalar(1 - e));
          p.s.position.lerpVectors(a, b.lerpVectors(mid, to, e), e);
          p.s.material.opacity = u >= 1 ? 0 : 0.9 * (1 - e * 0.6);
        }
      },
      end: () => parts.forEach((p) => this.root.remove(p.s)),
    });
  }
  // 灵光冲起（仙品以上鉴定、突破、出丹）
  surge(pos, color = 0xe0b45a, h = 9) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, h, 20, 1, !0).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color, transparent: !0, opacity: 0.55, depthWrite: !1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.copy(pos);
    this.root.add(m);
    const glow = glowSprite(color, 4, 1);
    glow.position.set(pos.x, pos.y + 1.4, pos.z);
    this.root.add(glow);
    this.items.push({
      t: 0, dur: 1.6, update: (it, k) => {
        m.material.opacity = 0.55 * (1 - k);
        m.scale.set(1 + k * 1.5, 1, 1 + k * 1.5);
        glow.material.opacity = 1 - k;
        glow.scale.setScalar(4 + k * 6);
      },
      end: () => this.root.remove(m, glow),
    });
  }
  // 一团墨烟（设施修好、出炉）
  puff(pos, n = 10) {
    const list = [];
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.7 }));
      s.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.5 + Math.random(), pos.z + (Math.random() - 0.5));
      s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2);
      s.scale.setScalar(0.8);
      list.push(s);
      this.root.add(s);
    }
    this.items.push({
      t: 0, dur: 1.4, update: (it, k) => {
        for (const s of list) {
          s.position.addScaledVector(s.userData.v, 0.016);
          s.scale.setScalar(0.8 + k * 2);
          s.material.opacity = 0.7 * (1 - k);
        }
      },
      end: () => list.forEach((s) => this.root.remove(s)),
    });
  }
  // 炉火：key 设施 id，强度 0..1（炼丹时随火候变化）
  fire(id, k) {
    const g = this.s.groups[id];
    if (!g || !g.userData.fire) return;
    if (!g.userData.fireSprite) {
      const f = glowSprite(0xff8a3a, 1.6, 0);
      f.position.set(...g.userData.fire);
      g.add(f);
      g.userData.fireSprite = f;
    }
    g.userData.fireK = k;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update(it, k);
      if (k >= 1) (it.end && it.end(), this.items.splice(i, 1));
    }
    // 香烟、炉烟、炉火
    this.smokeT += dt;
    for (const [id, g] of Object.entries(this.s.groups)) {
      const f = g.userData.fireSprite;
      if (f) {
        const k = g.userData.fireK ?? (id === "furnace" || id === "forge" ? 0.35 : 0);
        f.material.opacity = k * (0.8 + 0.2 * Math.sin(this.smokeT * 13 + Math.sin(this.smokeT * 7)));
        f.scale.setScalar(1.2 + k * 1.4);
      } else if (g.userData.fire) this.fire(id, 0.35);
    }
    if (this.smokeT > 0.5) {
      this.smokeT = 0;
      for (const g of Object.values(this.s.groups)) {
        if (!g.userData.smoke) continue;
        const [x, y, z] = g.userData.smoke;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.25 }));
        sp.position.set(g.position.x + x, g.position.y + y, g.position.z + z);
        sp.scale.setScalar(0.35);
        this.root.add(sp);
        const drift = Math.random() - 0.5;
        this.items.push({
          t: 0, dur: 4, update: (it, k) => {
            sp.position.y += 0.012;
            sp.position.x += 0.004 * Math.sin(it.t * 2 + drift * 6);
            sp.scale.setScalar(0.35 + k * 1.4);
            sp.material.opacity = 0.25 * (1 - k);
          },
          end: () => this.root.remove(sp),
        });
      }
    }
  }
}

// ---------------- 玄机子：一缕会说话的墨魂 ----------------
class Wisp {
  constructor(scene) {
    this.s = scene;
    this.group = new THREE.Group();
    this.group.name = "xuanjizi";
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.95 }));
    this.core.scale.setScalar(0.9);
    this.eye = glowSprite(0xbfe8ff, 0.45, 0.9);
    this.group.add(this.core, this.eye);
    this.trail = [];
    for (let k = 0; k < 9; k++) {
      const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: inkBlot(), transparent: !0, depthWrite: !1, opacity: 0.5 * (1 - k / 9) }));
      t.scale.setScalar(0.7 * (1 - k / 11));
      this.trail.push({ s: t, p: new THREE.Vector3() });
      this.s.root.add(t);
    }
    const st = scene.models.study;
    this.home = new THREE.Vector3(st.x - 1.6, st.y + 2.4, st.z + 0.4);
    this.pos = this.home.clone();
    this.target = this.home.clone();
    this.mode = "home";
    this.t = 0;
    this.hist = [];
  }
  follow() {
    this.mode = "follow";
  }
  goHome() {
    this.mode = "home";
  }
  at(v) {
    this.mode = "point";
    this.target.copy(v);
  }
  update(dt, pp) {
    this.t += dt;
    if (this.mode === "follow" && pp) this.target.set(pp.x - 1.3, pp.y + 2.3, pp.z + 0.6);
    else if (this.mode === "home") this.target.copy(this.home);
    this.pos.lerp(this.target, 1 - Math.exp(-dt * 2.2));
    const bob = Math.sin(this.t * 1.7) * 0.18;
    this.group.position.set(this.pos.x + Math.sin(this.t * 0.9) * 0.15, this.pos.y + bob, this.pos.z);
    this.core.material.rotation = Math.sin(this.t * 0.6) * 0.4;
    this.core.scale.setScalar(0.9 + 0.08 * Math.sin(this.t * 3));
    this.eye.position.set(0.08, 0.06, 0.05);
    this.eye.material.opacity = 0.7 + 0.25 * Math.sin(this.t * 2.3);
    this.hist.unshift(this.group.position.clone());
    if (this.hist.length > 40) this.hist.pop();
    this.trail.forEach((tr, k) => {
      const p = this.hist[Math.min(this.hist.length - 1, (k + 1) * 4)] || this.group.position;
      tr.s.position.set(p.x, p.y - 0.05 * k, p.z);
    });
  }
}
