// 天地：崖下云海、云海中的远峰、台地边缘浮动的雾带、飘落的树叶。
// 云海与远峰大部分会被后期的"低处留白 / 远处淡墨"融进宣纸色，只留下若隐若现的墨痕。
import * as THREE from "three";
import { U, toon } from "../render/materials.js";
import { NOISE, rng, vnoise } from "../render/glsl.js";

const R = rng(77);

function cloudSea(uLight) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uLight: uLight || { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLight; varying vec3 vW;
      ${NOISE}
      void main(){
        vec2 p = vW.xz * 0.025 + vec2(uTime * 0.006, uTime * 0.002);
        float d = fbm(p + fbm(p * 0.6 + 3.0) * 0.8);
        float dS = fbm(p + vec2(0.04, -0.03) + fbm(p * 0.6 + 3.0) * 0.8);
        float puff = smoothstep(0.35, 0.75, d);
        float shade = clamp((dS - d) * 6.0 + 0.5, 0.0, 1.0);
        vec3 paper = vec3(0.94, 0.92, 0.86);
        vec3 c = mix(paper * 0.58, paper * 1.02, puff);
        c = mix(c, c * 0.7, (1.0 - shade) * puff * 0.8);
        gl_FragColor = vec4(c * uLight, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), mat);
  m.position.y = -18;
  m.name = "cloud-sea";
  return m;
}

// 远峰：车削出的柱状山体，噪声扰动出竖向的冲刷沟，平顶
function peakGeo(seed, r0, h) {
  const prof = [];
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    const r = r0 * (1 - Math.pow(u, 3.5) * 0.85) * (1 + 0.12 * Math.sin(u * 11 + seed));
    prof.push(new THREE.Vector2(Math.max(0.3, r), u * h));
  }
  prof.push(new THREE.Vector2(0.01, h));
  const g = new THREE.LatheGeometry(prof, 20);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const n = 1 + 0.35 * (vnoise(a * 2.5 + seed, v.y * 0.04) - 0.5) + 0.22 * (vnoise(a * 7 - seed, v.y * 0.15) - 0.5);
    p.setXYZ(i, v.x * n, v.y, v.z * n);
  }
  g.computeVertexNormals();
  return g;
}
function peaks(scale = 1) {
  const group = new THREE.Group();
  const mat = toon({ color: 0x5e625e, tri: !0, brushK: 0.8, brushScale: 0.05 });
  const list = [
    [-70, -95, 16, 72], [-25, -120, 22, 88], [35, -105, 14, 66], [85, -80, 20, 80], [120, -30, 18, 62],
    [-120, -40, 24, 76], [-95, 35, 16, 58], [105, 50, 14, 52], [10, -170, 30, 110], [-160, -130, 34, 120],
    [170, -140, 30, 100], [55, -55, 9, 46], [-55, -60, 10, 50],
  ];
  for (const [x, z, r0, h] of list) {
    const m = new THREE.Mesh(peakGeo(x * 0.13 + z * 0.07, r0, h), mat);
    m.position.set(x * scale, -70, z * scale);
    m.scale.setScalar(Math.sqrt(scale));
    group.add(m);
  }
  return group;
}

// 台地四周的雾带：大片柔和的半透明雾，缓慢飘移
function mistBanks({ rx = 27, rz = 26, cz = -4, n = 28 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: !0,
    depthWrite: !1,
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; varying vec2 vUv; varying float vA; varying vec2 vS;
      void main(){
        vUv = uv; vS = aSeed.xy;
        vec3 c = instanceMatrix[3].xyz;
        c.x += sin(uTime * 0.05 + aSeed.z * 6.28) * 4.0;
        c.z += cos(uTime * 0.04 + aSeed.w * 6.28) * 2.0;
        vA = 0.75 + 0.2 * sin(uTime * 0.2 + aSeed.x * 6.28);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(26.0, 9.0) * (0.8 + aSeed.y * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying float vA; varying vec2 vS;
      ${NOISE}
      void main(){
        vec2 p = vUv - 0.5;
        float body = smoothstep(0.5, 0.1, length(p * vec2(1.0, 1.6)));
        float n = fbm(vUv * vec2(3.0, 2.0) + vS * 10.0 + vec2(uTime * 0.02, 0.0));
        float a = body * smoothstep(0.3, 0.75, n) * vA;
        gl_FragColor = vec4(vec3(0.95, 0.93, 0.88), a);
      }`,
  });
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / Math.round(n * 0.64)) * Math.PI * 2 + R() * 0.3;
    pts.push([Math.cos(a) * (rx + R() * 6), -3 - R() * 7, Math.sin(a) * (rz + R() * 6) + cz]);
  }
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, pts.length);
  const seeds = new Float32Array(pts.length * 4);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, y, z], i) => {
    mesh.setMatrixAt(i, m4.makeTranslation(x, y, z));
    for (let c = 0; c < 4; c++) seeds[i * 4 + c] = R();
  });
  mesh.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  mesh.frustumCulled = !1;
  mesh.renderOrder = 6;
  return mesh;
}

// 飘落的树叶：围绕主角的一块空间里循环飘落
function fallingLeaves() {
  const n = 70;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uPlayer: U.uPlayer },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uPlayer; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 box = vec3(34.0, 12.0, 34.0);
        float t = uTime * (0.35 + aSeed.w * 0.3);
        vec3 p = aSeed.xyz * box;
        p.y = box.y - mod(t * 2.0 + aSeed.y * box.y, box.y);
        p.x += t * 0.8 + sin(t * 1.7 + aSeed.w * 30.0) * 1.2;
        p.z += cos(t * 1.3 + aSeed.x * 20.0) * 0.8;
        p.xz = mod(p.xz - uPlayer.xz + box.xz * 0.5, box.xz) - box.xz * 0.5 + uPlayer.xz;
        p.y += uPlayer.y - 1.0;
        float a = t * 3.0 + aSeed.x * 20.0;
        vec3 v = position * 0.16;
        v = vec3(v.x * cos(a) - v.y * sin(a), v.x * sin(a) * 0.6 + v.y * cos(a), v.x * sin(a) * 0.8);
        gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vec2 q = vUv - 0.5; if (length(q * vec2(1.0, 2.2)) > 0.5) discard; gl_FragColor = vec4(vec3(0.16, 0.18, 0.17), 1.0); }`,
  });
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const seeds = new Float32Array(n * 4);
  for (let k = 0; k < n * 4; k++) seeds[k] = R();
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = n;
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = !1;
  m.name = "leaves";
  return m;
}

// opts（关卡用）：{ rx, rz, cz, n } 雾带椭圆，peakScale 远峰外推倍数，uLight 天时亮度
export function buildSky(opts = {}) {
  const g = new THREE.Group();
  g.name = "sky";
  g.add(cloudSea(opts.uLight), peaks(opts.peakScale), mistBanks(opts.mist), fallingLeaves());
  return g;
}
