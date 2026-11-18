// GPU 贴图烘焙：用全屏三角形把一段片元着色器渲染进渲染目标，生成可平铺的程序化贴图（不依赖任何图片文件）。
// 配方：
//   皴法 cunfa  —— 山石崖壁的披麻皴笔触（r = 墨色浓度，g = 淡墨晕染）
//   点苔 ground —— 台地地面的苔点、横点与淡墨晕染（r = 苔点，g = 晕染，b = 草色变化）
import * as THREE from "three";
import { NOISE } from "./glsl.js";

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function bake(renderer, frag, size = 512, uniforms = {}) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  });
  rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: "precision highp float;\nvarying vec2 vUv;\n" + NOISE + frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(mesh, cam);
  renderer.setRenderTarget(prev);
  geo.dispose();
  mat.dispose();
  return rt.texture;
}

// 披麻皴：成束的长线条，略带弯曲，笔锋两头收尖，带飞白（干笔断续）
const CUNFA = /* glsl */ `
uniform float uSeed;
void main(){
  const float N = 7.0;
  vec2 g = vUv * N;
  vec2 id = floor(g);
  float ink = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec2 tid = mod(cid, N);
    for (int s = 0; s < 3; s++) {
      float fs = float(s);
      vec2 h = hash22(tid * 1.31 + fs * 7.31 + uSeed);
      vec2 h2 = hash22(tid * 2.17 + fs * 3.11 + 11.0 + uSeed);
      vec2 c = cid + h;
      float ang = 1.25 + (h2.x - 0.5) * 0.8;
      vec2 dir = vec2(cos(ang), sin(ang)), nrm = vec2(-dir.y, dir.x);
      vec2 d = g - c;
      float t = dot(d, dir);
      float L = 0.55 + h2.y * 0.95;
      float off = dot(d, nrm) - sin(t * 2.6 + h.x * 20.0) * 0.07;
      float taper = clamp(1.0 - abs(t) / L, 0.0, 1.0);
      float w = (0.022 + 0.045 * h.y) * sqrt(taper);
      float body = smoothstep(w, w * 0.25, abs(off)) * step(abs(t), L);
      float dry = smoothstep(0.32, 0.62, vnoise(vec2(t * 9.0 + h.x * 40.0, off * 70.0 + fs)));
      ink = max(ink, body * (0.45 + 0.55 * dry) * (0.55 + 0.45 * h2.x));
    }
  }
  float wash = fbmT(vUv * 3.0, vec2(3.0));
  gl_FragColor = vec4(ink, wash, 0.0, 1.0);
}`;

// 点苔：稀疏的墨点与短横点，配淡墨晕染
const GROUND = /* glsl */ `
void main(){
  const float N = 9.0;
  vec2 g = vUv * N;
  vec2 id = floor(g);
  float dots = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec2 tid = mod(cid, N);
    vec2 h = hash22(tid + 3.7);
    if (h.y > 0.42) continue;
    vec2 h2 = hash22(tid * 1.9 + 9.1);
    vec2 d = g - (cid + h);
    d.x *= mix(1.0, 0.35, step(0.5, h2.x));          // 一半是横点
    float r = 0.05 + 0.07 * h2.y;
    dots = max(dots, smoothstep(r, r * 0.4, length(d)) * (0.5 + 0.5 * h2.y));
  }
  float wash = fbmT(vUv * 2.0, vec2(2.0));
  float tone = fbmT(vUv * 5.0 + 3.0, vec2(5.0));
  gl_FragColor = vec4(dots, wash, tone, 1.0);
}`;

export function bakeAll(renderer) {
  return {
    cunfa: bake(renderer, CUNFA, 1024, { uSeed: { value: 3.0 } }),
    ground: bake(renderer, GROUND, 512),
  };
}

// 画在 Canvas 上的笔触贴图（竹叶、松针、草丛、落叶）——运行时绘制，同样不依赖图片文件
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// 一片叶子：两端尖、中间饱满的笔触
function leaf(ctx, x, y, len, wid, ang, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.35, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.35, wid * 0.7, 0, 0);
  ctx.fill();
  ctx.restore();
}
export function brushTextures() {
  const R = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  // 竹叶簇：几片长叶从一点散开，叶尖下垂（"个"字、"介"字叶）
  const bamboo = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1e2a24";
    for (let g = 0; g < 4; g++) {
      const cx = w * (0.2 + 0.6 * R()), cy = h * (0.15 + 0.3 * R());
      const n = 3 + Math.floor(R() * 3);
      const base = Math.PI * (0.25 + 0.5 * R());
      for (let k = 0; k < n; k++) leaf(ctx, cx, cy, w * (0.3 + 0.18 * R()), w * 0.05, base + (k - n / 2) * 0.32 + (R() - 0.5) * 0.2, 0.75 + 0.25 * R());
    }
  });
  // 松针团（迎客松，用户选定"甲 · 墨团"，对比见 docs/ui/v2/png/pine_compare.png）：6 簇实心针团，外缘一圈针尖，
  // 簇与簇深浅不同（浓 / 中 / 淡），簇内左上略淡。笔色是灰阶，由材质颜色（level_veg.js 0x55785f）与光照定色——
  // 原来是近黑的笔色（#141c19），材质色乘上去仍是黑，在画面里成了一团墨窟窿。
  for (let i = 0; i < 742; i++) R(); // 原松针贴图消耗的随机数：照样跳过，后面草丛贴图保持不变
  const pine = canvasTex(256, 256, (ctx, w) => {
    let s = 11;
    const P = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 924; i++) P(); // 与对比图同一组随机数（选定的那一张）
    const tones = [120, 175, 225, 150, 205, 95];
    ctx.lineCap = "round";
    for (let c = 0; c < 6; c++) {
      const cx = w * (0.28 + 0.44 * P()), cy = w * (0.28 + 0.44 * P()), r = w * (0.13 + 0.07 * P());
      const tone = tones[c], hi = Math.min(255, tone + 40);
      const grd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      grd.addColorStop(0, `rgb(${hi},${hi},${hi})`);
      grd.addColorStop(1, `rgb(${tone},${tone},${tone})`);
      ctx.fillStyle = grd;
      ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.78, r * 0.62, P() * 3, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2 + P() * 0.15, l0 = r * 0.55, l1 = r * (0.95 + 0.25 * P());
        ctx.lineWidth = 2 + P() * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0 * 0.85);
        ctx.lineTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1 * 0.85);
        ctx.stroke();
      }
    }
  });
  // 草丛：几笔向上、略弯的细长笔触
  const grass = canvasTex(128, 128, (ctx, w, h) => {
    ctx.strokeStyle = "#7fae6a";
    ctx.lineCap = "round";
    for (let k = 0; k < 9; k++) {
      const x = w * (0.3 + 0.4 * R()), lean = (R() - 0.5) * w * 0.6;
      ctx.globalAlpha = 0.7 + 0.3 * R();
      ctx.lineWidth = 2 + R() * 3;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + lean * 0.3, h * 0.5, x + lean, h * (0.08 + 0.35 * R()));
      ctx.stroke();
    }
  });
  return { bamboo, pine, grass };
}
