// 现状版：直接调用游戏现有的生成函数与材质（src/world/markers.js temple、props.js lantern、vegetation.js rockGeo，
// level_veg.js 的竹 / 松 / 杂树 / 草写法与参数原样搬过来），角色用 assets/models/hero.glb / qingya.glb + 游戏 PALETTE。
import * as THREE from "three";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { toon, outlineMaterial, cutoutDepth } from "../../../src/render/materials.js";
import { rng, fbm, vnoise } from "../../../src/render/glsl.js";
import { temple } from "../../../src/world/markers.js";
import { lantern } from "../../../src/world/props.js";
import { rockGeo, mergeGeos } from "../../../src/world/vegetation.js";
import { SITE, TEMPLE, LANTERNS, ROCKS, BAMBOO, PINE, TREE, groundH, pathX, pathDist, templeDist } from "./layout.js";

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
function upNormals(g) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
function inst(geo, mat, list, colors) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((mm, i) => m.setMatrixAt(i, mm));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.computeBoundingSphere();
  return m;
}

export function groundGeo(cell = 0.5, extra) {
  const n = Math.round(64 / cell);
  const g = new THREE.PlaneGeometry(64, 64, n, n).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  if (extra) extra(g);
  return g;
}

export function buildLegacyEnv(brush) {
  const R = rng(101);
  const g = new THREE.Group();
  g.name = "legacy-env";
  // 地面：关卡地形材质（JX_TERRAIN：点苔 / 晕染），r1 默认配色
  const gg = groundGeo(0.5, (geo) => geo.setAttribute("aRim", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1)));
  const ground = new THREE.Mesh(gg, toon({ terrain: !0, topColor: 0xd4d0bc, faceColor: 0x6e675c, mossColor: 0x9cbb86 }));
  ground.receiveShadow = !0;
  ground.castShadow = !0;
  g.add(ground);
  // 山神庙（游戏原件）
  const t = temple();
  t.position.set(TEMPLE.x, 0, TEMPLE.z);
  g.add(t);
  t.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = !0));
  // 石灯
  for (const [x, z] of LANTERNS) g.add(lantern(x, z, [], groundH(x, z)));
  // 石径（props.js stonePath 写法）
  {
    const slabs = [];
    for (let z = 1.6; z < 17; z += 0.85)
      for (const side of [-0.42, 0.42]) {
        if (R() < 0.12) continue;
        const x = pathX(z) + side + (R() - 0.5) * 0.2, zz = z + (R() - 0.5) * 0.2;
        E.set((R() - 0.5) * 0.06, (R() - 0.5) * 0.3, (R() - 0.5) * 0.06);
        Q.setFromEuler(E);
        slabs.push(M.compose(P.set(x, groundH(x, zz) + 0.02, zz), Q, S.set(0.8 + R() * 0.4, 1, 0.8 + R() * 0.4)).clone());
      }
    const m = inst(new THREE.BoxGeometry(0.78, 0.12, 0.62), toon({ color: 0xc9c6bb, tri: !0, brushK: 0.35, brushScale: 0.6 }), slabs);
    m.receiveShadow = !0;
    g.add(m);
  }
  // 山石
  {
    const mat = toon({ color: 0x8c8a7e, tri: !0, brushK: 0.75, brushScale: 0.45 });
    const variants = [rockGeo(1.3), rockGeo(4.7), rockGeo(9.1)];
    for (const [x, z, s, seed, sy, a] of ROCKS) {
      const m = new THREE.Mesh(variants[seed % 3], mat);
      m.position.set(x, groundH(x, z) - 0.15 * s, z);
      m.rotation.y = a;
      m.scale.set(s, s * sy, s * 0.9);
      m.castShadow = m.receiveShadow = !0;
      g.add(m);
    }
  }
  // 竹丛（level_veg 竹）
  {
    const H = 7.5;
    const culmGeo = new THREE.CylinderGeometry(0.055, 0.07, H, 6, 14).translate(0, H / 2, 0);
    const culmMat = toon({ color: 0x6f9a62, bamboo: !0, wind: [0.45, H], fade: !0 });
    const leafGeo = upNormals(new THREE.PlaneGeometry(1.5, 1.2).translate(0, -0.35, 0));
    const leafMat = toon({ color: 0x4f8a58, map: brush.bamboo, alphaTest: 0.45, side: THREE.DoubleSide, wind: [0.22, 1], windConst: !0, fade: !0 });
    const culms = [], cc = [], leaves = [];
    for (let c = 0; c < 6; c++) {
      const cx = BAMBOO.x + (R() - 0.5) * BAMBOO.r * 1.4, cz = BAMBOO.z + (R() - 0.5) * BAMBOO.r * 1.4;
      const n = 3 + Math.floor(R() * 5);
      const y0 = groundH(cx, cz) - 0.1;
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.55;
        const x2 = cx + Math.cos(a) * r, z2 = cz + Math.sin(a) * r;
        const s = 0.7 + R() * 0.5;
        const lean = [(R() - 0.5) * 0.16 + (x2 - cx) * 0.12, (R() - 0.5) * 0.16 + (z2 - cz) * 0.12];
        E.set(lean[1], 0, -lean[0]);
        Q.setFromEuler(E);
        culms.push(M.compose(P.set(x2, y0, z2), Q, S.set(1, s, 1)).clone());
        cc.push(new THREE.Color().setScalar(0.7 + R() * 0.75));
        const top = H * s, nl = 6 + Math.floor(R() * 4);
        for (let j = 0; j < nl; j++) {
          const hy = top * (0.45 + 0.55 * R());
          const a2 = R() * Math.PI * 2, r2 = 0.25 + R() * 0.6;
          const lx = x2 + lean[0] * hy + Math.cos(a2) * r2, lz = z2 + lean[1] * hy + Math.sin(a2) * r2;
          E.set((R() - 0.5) * 0.9, a2, (R() - 0.5) * 0.9);
          Q.setFromEuler(E);
          const ls = 0.8 + R() * 0.5;
          leaves.push(M.compose(P.set(lx, y0 + hy, lz), Q, S.set(ls, ls, ls)).clone());
        }
      }
    }
    const cm = inst(culmGeo, culmMat, culms, cc);
    const lm = inst(leafGeo, leafMat, leaves);
    cm.castShadow = lm.castShadow = !0;
    lm.customDepthMaterial = cutoutDepth(brush.bamboo, 0.45);
    g.add(cm, lm);
  }
  // 迎客松（level_veg 松）
  {
    const barkMat = toon({ color: 0x5e4c3c, tri: !0, brushK: 0.7, brushScale: 0.9, wind: [0.06, 8], fade: !0 });
    const padMat = toon({ color: 0x55785f, map: brush.pine, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 1], windConst: !0, fade: !0 });
    const pads = [];
    const addPad = (x, y, z, s, a) => {
      for (let k = 0; k < 2; k++) {
        E.set((R() - 0.5) * 0.35, a + k * 0.8, (R() - 0.5) * 0.35);
        Q.setFromEuler(E);
        pads.push(M.compose(P.set(x, y + k * 0.06, z), Q, S.set(s * (1 - k * 0.2), 1, s * 0.7 * (1 - k * 0.2))).clone());
      }
    };
    const x = PINE.x, z = PINE.z, hgt = 7.5, lean = [-0.12, 0.05], px0 = x, pz0 = z;
    const r = rng(77);
    const y0 = groundH(x, z) - 0.2;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push(new THREE.Vector3(x + Math.sin(u * 2.4 + px0) * 0.5 + lean[0] * u * u * hgt, y0 + u * hgt, z + Math.cos(u * 2.0 + pz0) * 0.4 + lean[1] * u * u * hgt));
    }
    const trunk = new THREE.CatmullRomCurve3(pts);
    const geos = [new THREE.TubeGeometry(trunk, 20, 0.28, 7, !1), new THREE.CylinderGeometry(0.3, 0.55, 0.6, 7).translate(x, y0 + 0.25, z)];
    const nb = 6;
    for (let b = 0; b < nb; b++) {
      const u = 0.42 + (b / nb) * 0.55;
      const base = trunk.getPoint(u);
      const a = r() * Math.PI * 2 + b * 2.1;
      const len = (1.6 + r() * 2.0) * (1.15 - u * 0.5);
      const mid = base.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.5, 0.25 + r() * 0.3, Math.sin(a) * len * 0.5));
      const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.1 + r() * 0.4, Math.sin(a) * len));
      const br = new THREE.CatmullRomCurve3([base, mid, tip]);
      geos.push(new THREE.TubeGeometry(br, 6, 0.09 * (1.3 - u * 0.6), 5, !1));
      const np = 3 + Math.floor(r() * 3);
      for (let k = 0; k < np; k++) {
        const p = br.getPoint(Math.min(1, 0.45 + (k / np) * 0.6));
        addPad(p.x + (r() - 0.5) * 0.6, p.y + 0.12 + r() * 0.15, p.z + (r() - 0.5) * 0.6, 1.4 + r() * 1.0, r() * 6.28);
      }
    }
    const top = trunk.getPoint(1);
    for (let k = 0; k < 4; k++) addPad(top.x + (r() - 0.5) * 0.8, top.y + 0.1 + k * 0.12, top.z + (r() - 0.5) * 0.8, 1.6 - k * 0.25, r() * 6.28);
    const bark = new THREE.Mesh(mergeGeos(geos), barkMat);
    bark.castShadow = bark.receiveShadow = !0;
    const pm = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), padMat, pads);
    pm.castShadow = !0;
    pm.customDepthMaterial = cutoutDepth(brush.pine, 0.4);
    g.add(bark, pm);
  }
  // 杂树（level_veg 杂树：短干 + 几团圆冠）
  {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.4, 6).translate(0, 1.2, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    {
      const p = crownGeo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 0.85 + 0.3 * vnoise(v.x * 2.1 + 3, v.z * 2.1 + v.y);
        p.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
      }
      crownGeo.computeVertexNormals();
    }
    const trunkMat = toon({ color: 0x4a3e34, tri: !0, brushK: 0.6, brushScale: 1.0, fade: !0 });
    const crownMat = toon({ color: 0xffffff, tri: !0, brushK: 0.9, brushScale: 0.8, wind: [0.08, 3], fade: !0 });
    const x = TREE.x, z = TREE.z, y = groundH(x, z) - 0.15, s = 1.35;
    const tm = new THREE.Mesh(trunkGeo, trunkMat);
    tm.position.set(x, y, z);
    tm.scale.setScalar(s);
    const crowns = [], cols = [];
    for (let j = 0; j < 5; j++) {
      const a = R() * 6.28, r = j === 0 ? 0 : 0.7 + R() * 0.5;
      const cs = (j === 0 ? 1.5 : 1.0 + R() * 0.4) * s;
      E.set(0, R() * 6.28, 0);
      Q.setFromEuler(E);
      cols.push(new THREE.Color().setHSL(0.25 + R() * 0.08, 0.16 + R() * 0.14, 0.2 + R() * 0.12));
      crowns.push(M.compose(P.set(x + Math.cos(a) * r * s, y + (2.4 + R() * 0.8 + (j ? -0.3 : 0.4)) * s, z + Math.sin(a) * r * s), Q, S.set(cs, cs, cs)).clone());
    }
    const cm = inst(crownGeo, crownMat, crowns, cols);
    tm.castShadow = cm.castShadow = !0;
    g.add(tm, cm);
  }
  // 草丛（level_veg 草：十字插片 + Canvas 笔触贴图）
  {
    const g1 = new THREE.PlaneGeometry(0.7, 0.55).translate(0, 0.27, 0);
    const geo = upNormals(mergeGeos([g1, g1.clone().rotateY(Math.PI / 2)]));
    const mat = toon({ color: 0xffffff, map: brush.grass, alphaTest: 0.4, side: THREE.DoubleSide, wind: [0.12, 0.55] });
    const list = [];
    for (let k = 0; k < 9000 && list.length < 420; k++) {
      const x = (R() - 0.5) * SITE, z = (R() - 0.5) * SITE;
      if (fbm(x * 0.09, z * 0.09) < 0.52 + R() * 0.12) continue;
      if (pathDist(x, z) < 0.9 || templeDist(x, z) < 0.6) continue;
      E.set(0, R() * 6.28, 0);
      Q.setFromEuler(E);
      const s = 0.8 + R() * 0.8;
      list.push(M.compose(P.set(x, groundH(x, z) - 0.03, z), Q, S.set(s, s * (0.8 + R() * 0.5), s)).clone());
    }
    g.add(inst(geo, mat, list));
  }
  return g;
}

// ---- 现状角色：游戏 PALETTE（src/game/player.js / enemies/enemy.js 原值）----
const HERO_PAL = {
  robe_white: { color: 0xf2efe6 }, robe_inner: { color: 0xc9c6bc }, sash_dark: { color: 0x2d3033 }, skin: { color: 0xe6d6c2 },
  hair_black: { color: 0x1b1d1f }, ribbon_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 }, boots_black: { color: 0x202224 },
  sword_steel: { color: 0xd8dde0 }, sword_hilt: { color: 0x3a3430 }, tassel_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 },
};
const BOSS_PAL = {
  fur_qing: { color: 0x4f5f59, emissive: 0x1a2622, emissiveIntensity: 1 }, fur_belly: { color: 0x7a8883, emissive: 0x1a2220, emissiveIntensity: 1 },
  fur_light: { color: 0xa9c7b8 }, // 数据表 tint
  fang_jade: { color: 0x8affd2, emissive: 0x2fd890, emissiveIntensity: 1.1 }, bone_armor: { color: 0xdedbcd },
  eye_jade: { color: 0xa8ffe0, emissive: 0x3dffb4, emissiveIntensity: 2.2 }, crack_glow: { color: 0x8affd0, emissive: 0x2fe8a0, emissiveIntensity: 1.6 },
  eye_fire: { color: 0xd2fff0, emissive: 0x6affc8, emissiveIntensity: 2.4 }, fur_ink: { color: 0x1d2124 },
};
// 游戏同款：按材质名前缀取 PALETTE → toon；每个网格加反向外壳描边（主角 0.018，敌人 0.016）
export function legacyLook(gltf, pal, fallback, ow, opts = {}) {
  const model = skClone(gltf.scene);
  const cache = {};
  const om = outlineMaterial(ow);
  const list = [];
  model.traverse((o) => o.isMesh && list.push(o));
  for (const o of list) {
    const key = Object.keys(pal).find((k) => (o.material.name || "").toLowerCase().startsWith(k)) || fallback;
    o.material = cache[key] ||= toon({ ...pal[key], side: opts.side ?? THREE.FrontSide });
    o.castShadow = o.receiveShadow = !0;
    o.frustumCulled = !1;
    const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, om) : new THREE.Mesh(o.geometry, om);
    if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
    ol.position.copy(o.position);
    ol.quaternion.copy(o.quaternion);
    ol.scale.copy(o.scale);
    ol.frustumCulled = !1;
    ol.userData.isOutline = !0;
    o.parent.add(ol);
    if (opts.hide && opts.hide.some((h) => o.name.startsWith(h))) o.visible = ol.visible = !1;
  }
  return model;
}
export const LEGACY = { HERO_PAL, BOSS_PAL };
