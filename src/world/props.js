// 场景小件：石径、石灯、石碑、山亭、宝箱、灵草。
// 颜色约束：环境全用墨色；只有玩法相关的东西点色——灵草石绿、宝箱金。
import * as THREE from "three";
import { toon } from "../render/materials.js";
import { height, PATH } from "./terrain.js";
import { mergeGeos } from "./vegetation.js";
import { rng } from "../render/glsl.js";

const R = rng(31);
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
const at = (g, x, y, z, ry = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));

// 石径：沿路径铺设的石板，石阶处随台阶起伏
function stonePath() {
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const len = curve.getLength();
  const slabs = [];
  for (let d = 0; d < len; d += 0.85) {
    const p = curve.getPointAt(d / len), t = curve.getTangentAt(d / len);
    for (const side of [-0.42, 0.42]) {
      if (R() < 0.12) continue;
      const x = p.x - t.z * side + (R() - 0.5) * 0.2, z = p.z + t.x * side + (R() - 0.5) * 0.2;
      slabs.push([x, height(x, z), z, Math.atan2(t.x, t.z) + (R() - 0.5) * 0.3]);
    }
  }
  const mat = toon({ color: 0xc9c6bb, tri: !0, brushK: 0.35, brushScale: 0.6 });
  const geo = new THREE.BoxGeometry(0.78, 0.12, 0.62);
  const m = new THREE.InstancedMesh(geo, mat, slabs.length);
  slabs.forEach(([x, y, z, a], i) => {
    E.set((R() - 0.5) * 0.06, a, (R() - 0.5) * 0.06);
    Q.setFromEuler(E);
    M.compose(P.set(x, y + 0.02, z), Q, S.set(0.8 + R() * 0.4, 1, 0.8 + R() * 0.4));
    m.setMatrixAt(i, M);
  });
  m.receiveShadow = !0;
  return m;
}

export function lantern(x, z, colliders, y = height(x, z)) {
  const g = [
    new THREE.BoxGeometry(0.6, 0.15, 0.6).translate(0, 0.075, 0),
    new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6).translate(0, 0.6, 0),
    new THREE.BoxGeometry(0.5, 0.1, 0.5).translate(0, 1.1, 0),
    new THREE.BoxGeometry(0.34, 0.34, 0.34).translate(0, 1.32, 0),
    new THREE.ConeGeometry(0.46, 0.32, 4).rotateY(Math.PI / 4).translate(0, 1.66, 0),
    new THREE.SphereGeometry(0.07, 6, 4).translate(0, 1.86, 0),
  ];
  const m = new THREE.Mesh(at(mergeGeos(g), x, y, z, R()), toon({ color: 0x9b9a92, tri: !0, brushK: 0.6, brushScale: 0.8, fade: !0 }));
  m.castShadow = m.receiveShadow = !0;
  colliders.push({ x, z, r: 0.35 });
  return m;
}

export function stele(x, z, ry, colliders, y = height(x, z)) {
  const g = mergeGeos([
    new THREE.BoxGeometry(1.4, 0.35, 0.7).translate(0, 0.17, 0),
    new THREE.BoxGeometry(0.95, 1.9, 0.24).translate(0, 1.3, 0),
    new THREE.CylinderGeometry(0.48, 0.48, 0.26, 12, 1, !1, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 2.25, 0),
  ]);
  const m = new THREE.Mesh(at(g, x, y, z, ry), toon({ color: 0x8d8c85, tri: !0, brushK: 0.7, brushScale: 0.7 }));
  m.castShadow = m.receiveShadow = !0;
  colliders.push({ x, z, r: 0.75 });
  return m;
}

// 山亭：四柱、攒尖顶、檐角起翘
export function pavilion(x, z, colliders, y = height(x, z), ry = 0.2) {
  const group = new THREE.Group();
  const stone = toon({ color: 0xa6a49b, tri: !0, brushK: 0.5, brushScale: 0.5, fade: !0 });
  const wood = toon({ color: 0x3e3833, fade: !0 });
  const roofMat = toon({ color: 0x4a4d4b, side: THREE.DoubleSide, fade: !0 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 4.4).translate(0, 0.2, 0), stone);
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push(new THREE.CylinderGeometry(0.13, 0.14, 2.7, 8).translate(sx * 1.7, 1.75, sz * 1.7));
  posts.push(new THREE.BoxGeometry(3.8, 0.22, 0.2).translate(0, 3.0, 1.7), new THREE.BoxGeometry(3.8, 0.22, 0.2).translate(0, 3.0, -1.7));
  posts.push(new THREE.BoxGeometry(0.2, 0.22, 3.8).translate(1.7, 3.0, 0), new THREE.BoxGeometry(0.2, 0.22, 3.8).translate(-1.7, 3.0, 0));
  const frame = new THREE.Mesh(mergeGeos(posts), wood);
  // 屋顶：四坡曲面，四角上翘
  const roof = new THREE.ConeGeometry(3.4, 2.0, 4, 6, !0).rotateY(Math.PI / 4);
  const p = roof.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const r = Math.hypot(v.x, v.z), u = (1 - (v.y + 1) / 2);
    const corner = Math.pow(Math.abs(Math.cos(Math.atan2(v.z, v.x) * 2)), 6);
    const sag = -0.3 * Math.sin(u * Math.PI); // 屋面下凹
    p.setY(i, v.y + sag + corner * u * u * 0.9);
    const k = 1 + corner * 0.08 * u;
    p.setX(i, v.x * k);
    p.setZ(i, v.z * k);
    void r;
  }
  roof.computeVertexNormals();
  roof.translate(0, 4.1, 0);
  const roofM = new THREE.Mesh(roof, roofMat);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 5.15, 0), wood);
  for (const m of [base, frame, roofM, finial]) (m.castShadow = m.receiveShadow = !0), group.add(m);
  group.position.set(x, y, z);
  group.rotation.y = ry;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = Math.cos(ry), s = Math.sin(ry);
    colliders.push({ x: x + sx * 1.7 * c + sz * 1.7 * s, z: z - sx * 1.7 * s + sz * 1.7 * c, r: 0.25 });
  }
  return group;
}

// 宝箱：墨色木箱 + 金色包角与锁扣（金是宝物的点色）
function chest(x, z, ry, colliders) {
  const y = height(x, z);
  const g = new THREE.Group();
  const wood = toon({ color: 0x3a302a });
  const gold = toon({ color: 0xe0a83a, emissive: 0x7a5410, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65).translate(0, 0.28, 0), wood);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 10, 1, !1, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.55, 0), wood);
  const trims = [];
  for (const sx of [-0.46, 0, 0.46]) trims.push(new THREE.BoxGeometry(0.08, 0.6, 0.68).translate(sx, 0.3, 0), new THREE.TorusGeometry(0.34, 0.035, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(sx, 0.55, 0));
  trims.push(new THREE.BoxGeometry(0.16, 0.2, 0.06).translate(0, 0.48, 0.34));
  const tm = new THREE.Mesh(mergeGeos(trims), gold);
  for (const m of [body, lid, tm]) (m.castShadow = m.receiveShadow = !0), g.add(m);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  colliders.push({ x, z, r: 0.6 });
  g.userData.kind = "chest";
  return g;
}

// 灵草：几片石绿色的弯叶 + 一缕上升的灵光，远看是一点亮色
function herb(x, z) {
  const y = height(x, z);
  const g = new THREE.Group();
  const leafMat = toon({ color: 0x3fb08a, emissive: 0x1f8a68, emissiveIntensity: 0.9, side: THREE.DoubleSide });
  const blades = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + R() * 0.4;
    const b = new THREE.PlaneGeometry(0.12, 0.6, 1, 4).translate(0, 0.3, 0);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      p.setZ(i, (yy * yy) * 0.9);
    }
    b.rotateY(a);
    blades.push(b);
  }
  const lm = new THREE.Mesh(mergeGeos(blades), leafMat);
  g.add(lm);
  // 灵光：竖向的柔光柱（加色）
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 2.2).translate(0, 1.0, 0),
    new THREE.ShaderMaterial({
      transparent: !0,
      depthWrite: !1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, position.y, 0.0, 1.0); mv.x += position.x; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying vec2 vUv; void main(){ vec2 q = (vUv - vec2(0.5, 0.25)) * vec2(2.0, 1.1); float a = pow(max(0.0, 1.0 - length(q)), 2.0); gl_FragColor = vec4(vec3(0.3, 0.95, 0.7) * a * 1.4, 1.0); }`,
    }),
  );
  glow.renderOrder = 8;
  g.add(glow);
  g.position.set(x, y, z);
  g.userData.kind = "herb";
  return g;
}

export function buildProps(colliders) {
  const group = new THREE.Group();
  group.name = "props";
  group.add(stonePath());
  group.add(lantern(-4.6, -17.6, colliders), lantern(-1.4, -17.4, colliders), lantern(-10.2, 8.8, colliders));
  group.add(stele(-12.6, 11.2, 0.6, colliders));
  group.add(pavilion(-1.8, -25.2, colliders));
  const interact = [];
  const c = chest(22.6, -6.4, -0.5, colliders);
  const herbs = [herb(12.2, -7.6), herb(-0.6, 9.2), herb(12.8, -24.5)];
  for (const o of [c, ...herbs]) (group.add(o), interact.push(o));
  group.userData.interact = interact;
  return group;
}
