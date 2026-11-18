// 溪流与瀑布：沿溪流路径生成一条水带。
// 水面在台地上平铺，遇到崖口时水流先平飞再下坠（抛物线），自然挂成瀑布帘；
// 着色是"宣纸上的水"：浅淡的底色 + 随流动的墨线波纹，瀑布处是竖向的白练与淡墨水痕。
import * as THREE from "three";
import { STREAM, height } from "./terrain.js";
import { U } from "../render/materials.js";
import { NOISE } from "../render/glsl.js";

export const WATER_VERT = /* glsl */ `
attribute float aSteep;
varying vec2 vUv;
varying float vSteep;
varying vec3 vW;
void main(){
  vUv = uv; vSteep = aSteep;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const WATER_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSteep;
varying vec3 vW;
${NOISE}
void main(){
  float across = abs(vUv.x - 0.5) * 2.0;
  float flow = vUv.y;
  // 平缓水面：顺流的墨线波纹（断续的短弧）
  vec2 q = vec2(vUv.x * 5.0, flow * 0.9 - uTime * 0.55);
  // 平行于水流的波纹线，随流向起伏、断续
  float wave = vUv.x * 7.0 + sin(flow * 1.7 - uTime * 2.2 + vUv.x * 2.0) * 0.35 + sin(flow * 0.6 - uTime * 0.9) * 0.25;
  float lines = smoothstep(0.12, 0.0, abs(fract(wave) - 0.5) - 0.36) * smoothstep(0.35, 0.65, vnoise(vec2(vUv.x * 7.0, flow * 0.7 - uTime * 1.4)));
  vec3 c = vec3(0.26, 0.42, 0.52) * (0.85 + 0.3 * vnoise(q * 0.5));   // 花青
  c = mix(c, vec3(0.86, 0.93, 0.96), lines * 0.8);
  float lines2 = smoothstep(0.04, 0.0, abs(fract(vnoise(q * vec2(1.3, 2.9) + 3.0) * 2.0 - flow * 0.1) - 0.5) - 0.45);
  c = mix(c, vec3(0.1, 0.17, 0.22), lines2 * 0.35);
  // 岸边浓墨
  c *= 1.0 - smoothstep(0.7, 1.0, across) * 0.55;
  // 瀑布：竖向白练，流速快
  float fall = smoothstep(0.35, 0.8, vSteep);
  vec2 fq = vec2(vUv.x * 11.0, vW.y * 0.7 + uTime * 2.6);
  float streak = vnoise(fq * vec2(1.0, 0.35)) * 0.6 + vnoise(fq * vec2(2.3, 0.6) + 9.0) * 0.4;
  vec3 fc = mix(vec3(0.95, 0.98, 1.0), vec3(0.3, 0.44, 0.52), smoothstep(0.5, 0.8, streak) * 0.85);
  fc *= 1.0 - smoothstep(0.6, 1.0, across) * 0.4;
  c = mix(c, fc, fall);
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildWater() {
  const group = new THREE.Group();
  group.name = "water";
  const curve = new THREE.CatmullRomCurve3(STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z)), !1, "centripetal");
  const len = curve.getLength();
  const ds = 0.2;
  const N = Math.ceil(len / ds);
  const pts = curve.getSpacedPoints(N);
  // 水面高度：贴着河槽，遇崖口时按抛物线下坠
  const ys = [];
  let y = height(pts[0].x, pts[0].z) + 0.28, vy = 0;
  for (let i = 0; i <= N; i++) {
    const g = height(pts[i].x, pts[i].z) + 0.28;
    if (i === 0) ys.push(y);
    else {
      vy += 3.0 * ds;
      const free = y - vy * ds;
      if (free <= g) (y = g), (vy = 0.05);
      else y = free;
      ys.push(y);
    }
  }
  const pos = [], uv = [], steep = [], idx = [];
  const foam = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i], t = curve.getTangentAt(Math.min(1, i / N));
    const nx = -t.z, nz = t.x;
    const dy = i > 0 ? (ys[i - 1] - ys[i]) / ds : 0;
    const st = Math.min(1, dy / 2.5);
    const w = 1.15 + 0.25 * Math.sin(i * 0.05);
    for (const s of [-1, 1]) {
      pos.push(p.x + nx * w * s, ys[i], p.z + nz * w * s);
      uv.push(s < 0 ? 0 : 1, i * ds);
      steep.push(st);
    }
    if (i > 0 && i < N) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // 瀑布落点：由陡转平
    if (i > 2 && st < 0.2 && (ys[i - 2] - ys[i]) / (2 * ds) > 1.2 && (!foam.length || foam[foam.length - 1].distanceTo(p.clone().setY(ys[i])) > 4)) foam.push(new THREE.Vector3(p.x, ys[i] + 0.1, p.z));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("aSteep", new THREE.Float32BufferAttribute(steep, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: { uTime: U.uTime }, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "stream";
  group.add(mesh);

  // 瀑布落点的水雾：柔和的白色团块，缓慢翻涌
  const mistMat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; varying float vA; varying vec2 vUv;
      void main(){
        vUv = uv;
        float t = fract(uTime * (0.25 + aSeed.w * 0.2) + aSeed.x);
        vec3 c = instanceMatrix[3].xyz + vec3((aSeed.y - 0.5) * 2.4, t * 1.4, (aSeed.z - 0.5) * 2.4 + 0.8);
        float s = 0.9 + t * 1.6;
        vA = sin(t * 3.14159) * 0.3;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.98), vA * smoothstep(1.0, 0.2, d)); }`,
  });
  const per = 7;
  const mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mistMat, Math.max(1, foam.length * per));
  const seeds = new Float32Array(mist.count * 4);
  const m = new THREE.Matrix4();
  foam.forEach((p, i) => {
    for (let k = 0; k < per; k++) {
      m.makeTranslation(p.x, p.y, p.z);
      mist.setMatrixAt(i * per + k, m);
      for (let c = 0; c < 4; c++) seeds[(i * per + k) * 4 + c] = Math.random();
    }
  });
  mist.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  mist.frustumCulled = !1;
  mist.renderOrder = 5;
  group.add(mist);
  group.userData.falls = foam;
  return group;
}
