// 水墨后期：场景先渲染进带深度的渲染目标，再由一个全屏着色器完成：
//   1. 墨线：深度轮廓（剪影）+ 深度二阶差（折角），线宽与浓淡随低频噪声变化，模拟笔锋与飞白
//   2. 设色：亮度映射到"墨—宣纸"色阶；高饱和点色（朱砂、石绿、金）完整保留，其余按淡彩强度保留本色
//   3. 留白：按世界高度（崖下）与距离把画面晕成宣纸色
//   4. 宣纸：纸纹、纤维、边缘晕开的暗角
//   5. 演出参数（首领处决，boss_青牙_v2 §7）：留白 paperFade（除焦点外淡成宣纸色，焦点 = 首领与主角处两个世界空间圆柱）、
//      去饱和 desat（褪成纸上墨色）。同一个 pass；参数为 0 时走 uniform 分支跳过，没有额外开销。
import * as THREE from "three";
import { NOISE } from "./glsl.js";

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor, tDepth, tPaperA, tPaperB;
uniform vec2 uRes;
uniform float uNear, uFar, uTime, uInk, uTint, uFade, uDesat;
uniform vec4 uFocusA, uFocusB; // 留白焦点：xyz = 脚底世界坐标，w = 半径（0 = 不用）
uniform vec2 uFocusH;          // 焦点高度（A、B）
uniform mat4 uInvProj, uCamWorld;
varying vec2 vUv;
${NOISE}
uniform vec3 uPaper; // 纸色：天时入夜时由关卡压暗（level.setTimeOfDay）
#define PAPER uPaper
const vec3 INK = vec3(0.075, 0.085, 0.095);
float depthAt(vec2 uv){ return texture2D(tDepth, uv).r; }
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 viewPos(vec2 uv, float d){ vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
vec3 toSRGB(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
// 留白焦点：世界空间竖直圆柱（柔边），脚底 6–30 厘米以下不算（地面和影子照样淡掉）
float focusK(vec3 p, vec4 f, float h){
  if (f.w <= 0.0) return 0.0;
  float y = p.y - f.y;
  return (1.0 - smoothstep(0.72, 1.0, length(p.xz - f.xz) / f.w)) * smoothstep(0.06, 0.3, y) * (1.0 - smoothstep(h, h * 1.3, y));
}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 px = 1.0 / uRes;
  // 只与屏幕坐标有关的噪声（纸纹、笔锋、飞白、暗角）在尺寸变化时预烘焙进两张贴图（PAPER_BAKE），这里按像素取
  vec4 pa = texture2D(tPaperA, fc * px), pb = texture2D(tPaperB, fc * px);
  float d0 = depthAt(vUv);
  float z0 = linZ(d0);
  vec3 wp = (uCamWorld * vec4(viewPos(vUv, d0), 1.0)).xyz;
  bool sky = d0 > 0.99999;

  // ---- 设色 ----
  vec3 col = toSRGB(texture2D(tColor, vUv).rgb);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  // 点色（朱砂、石绿、金）完整保留色相；其余按淡彩强度保留本色（水的花青、草竹的石绿、树干的赭石）
  // 淡彩只作用于本身有颜色的物体（饱和度门限），宣纸般的地面保持纸色，不会整体泛黄
  float keep = max(smoothstep(0.32, 0.6, sat), mix(0.22, 0.85, uTint * smoothstep(0.14, 0.3, sat))) * smoothstep(0.05, 0.3, mx);
  float tl = smoothstep(0.03, 0.82, l);
  tl = mix(tl, floor(tl * 4.0 + 0.5) / 4.0, 0.22);                           // 轻微色阶分层
  float layer = pa.r;
  tl = clamp(tl + (layer - 0.5) * 0.16 * (1.0 - tl) * smoothstep(0.0, 0.25, tl), 0.0, 1.0);
  vec3 tone = mix(INK, PAPER, tl);
  vec3 hue = col / max(mx, 1e-3);
  vec3 c = mix(tone, tone * mix(vec3(1.0), hue * 1.15, 0.85) + (col - l) * 0.35, keep);

  // ---- 留白：崖下与远处晕成宣纸 ----
  float low = smoothstep(-1.5, -14.0, wp.y);
  float far = smoothstep(120.0, 420.0, z0);
  float drift = low > 0.0 && !sky ? fbm(wp.xz * 0.04 + vec2(uTime * 0.01, 0.0)) : 0.0; // 只有崖下的雾用得到
  float mist = sky ? 1.0 : clamp(max(low * (0.35 + 0.35 * drift), far * 0.85), 0.0, 0.96);
  c = mix(c, PAPER, mist);

  // ---- 留白（演出）：焦点之外淡成宣纸色，墨线减淡保留 ----
  float fade = 0.0;
  if (uFade > 0.0) {
    float keepF = sky ? 0.0 : max(focusK(wp, uFocusA, uFocusH.x), focusK(wp, uFocusB, uFocusH.y));
    fade = uFade * (1.0 - keepF);
    c = mix(c, PAPER, fade);
  }

  // ---- 墨线 ----
  float wob = 1.0;
  vec2 jit = (pa.gb - 0.5) * 1.6 * px;
  float w = 0.9 + 1.4 * pa.a;                                  // 笔锋粗细
  vec2 uv = vUv + jit;
  float zc = linZ(depthAt(uv));
  float sil = 0.0, zs = 0.0;
  vec2 dirs[8];
  dirs[0] = vec2(1, 0); dirs[1] = vec2(-1, 0); dirs[2] = vec2(0, 1); dirs[3] = vec2(0, -1);
  dirs[4] = vec2(0.7, 0.7); dirs[5] = vec2(-0.7, 0.7); dirs[6] = vec2(0.7, -0.7); dirs[7] = vec2(-0.7, -0.7);
  for (int k = 0; k < TAPS; k++){   // TAPS：8（含斜向）/ 4（低画质）
    float zn = linZ(depthAt(uv + dirs[k] * w * px));
    sil = max(sil, (zn - zc) / zc);
    if (k < 4) zs += zn;
  }
  float crease = abs(zs - 4.0 * zc) / zc;
  float edge = smoothstep(0.035, 0.11, sil) + 0.8 * smoothstep(0.012, 0.045, crease);
  float dry = pb.r;                                            // 飞白：线条断续
  edge = clamp(edge, 0.0, 1.0) * (0.55 + 0.45 * dry);
  edge *= 1.0 - smoothstep(55.0, 140.0, zc);
  edge *= 1.0 - mist * 0.85;
  edge *= 1.0 - fade * 0.6;
  if (sky) edge = 0.0;
  c = mix(c, INK, edge * 0.88);

  // ---- 去饱和（演出）：按亮度褪成纸色调的墨色 ----
  if (uDesat > 0.0) {
    float lc = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, PAPER * (lc / dot(PAPER, vec3(0.299, 0.587, 0.114))), uDesat);
  }

  // ---- 宣纸 ----
  c *= 0.9 + 0.15 * pb.g;                                      // 纸纹与纤维
  c = mix(c, c * vec3(0.78, 0.76, 0.72), pb.b);                // 暗角
  c = mix(col, c, uInk);
  gl_FragColor = vec4(c, 1.0);
}`;

// 纸纹预烘焙：与原来逐像素计算的公式完全相同，只在尺寸变化时算一次。
//   A = (色阶分层 layer, 墨线抖动 jit.x, jit.y, 笔锋粗细噪声)   B = (飞白 dry, 纸纹系数 (k − 0.9) / 0.15, 暗角 vig, 1)
const PAPER_BAKE = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uPart;
${NOISE}
void main(){
  vec2 fc = gl_FragCoord.xy, vUv = fc / uRes;
  if (uPart < 0.5) {
    float layer = vnoise(fc * 0.006 + 1.3) * 0.6 + vnoise(fc * 0.021) * 0.4;
    gl_FragColor = vec4(layer, vnoise(fc * 0.035), vnoise(fc * 0.035 + 7.7), vnoise(fc * 0.012 + 3.0));
  } else {
    float dry = smoothstep(0.18, 0.55, vnoise(fc * vec2(0.09, 0.05) + 11.0));
    float pn = vnoise(fc * 0.011) * 0.5 + vnoise(fc * 0.047) * 0.3 + vnoise(fc * 0.19) * 0.2;
    float fiber = smoothstep(0.86, 1.0, vnoise(vec2(fc.x * 0.018 + fc.y * 0.9, fc.y * 0.018 - fc.x * 0.3)));
    float k = 0.955 + 0.075 * pn - 0.035 * fiber;
    vec2 q = vUv * 2.0 - 1.0;
    float vig = smoothstep(0.65, 1.55, length(q * vec2(0.82, 1.0)) + (vnoise(vUv * 6.0) - 0.5) * 0.25);
    gl_FragColor = vec4(dry, (k - 0.9) / 0.15, vig, 1.0);
  }
}`;

export class InkPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.rt.depthTexture.type = THREE.FloatType;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const paperRT = (type) => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: !1, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: !1 });
    this.paper = [paperRT(THREE.FloatType), paperRT(THREE.UnsignedByteType)]; // A 含墨线抖动（影响描边位置，用 32 位浮点保证与逐像素计算逐像素一致），B 只是明暗系数（8 位足够）
    this.bakeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: PAPER_BAKE, uniforms: { uRes: { value: new THREE.Vector2() }, uPart: { value: 0 } }, depthTest: !1, depthWrite: !1 });
    this.paperDirty = !0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { TAPS: 8 },
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        tPaperA: { value: this.paper[0].texture },
        tPaperB: { value: this.paper[1].texture },
        uRes: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uTime: { value: 0 },
        uInk: { value: 1 },
        uTint: { value: 1 },
        uFade: { value: 0 },
        uDesat: { value: 0 },
        uFocusA: { value: new THREE.Vector4() },
        uFocusB: { value: new THREE.Vector4() },
        uFocusH: { value: new THREE.Vector2(1.8, 1.8) },
        uPaper: { value: new THREE.Vector3(0.925, 0.9, 0.835) },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
      },
      depthTest: !1,
      depthWrite: !1,
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.bakeQuad = new THREE.Mesh(geo, this.bakeMat);
    this.bakeQuad.frustumCulled = !1;
    this.quad.frustumCulled = !1;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.focus = [];
  }
  // ---- 演出参数（首领处决）----
  // setPaperFade(v)：0..1 留白程度（0 = 关）；setPaperFocus(...objs)：留白时保留原色的对象（≤ 2 个，有 pos 与 entity { radius, height }，
  //   如首领 Enemy 与主角 Player），每帧按它们当前位置更新焦点；不传 = 全屏留白。setDesat(v)：0..1 去饱和。
  setPaperFade(v) {
    this.mat.uniforms.uFade.value = Math.max(0, Math.min(1, +v || 0));
  }
  setPaperFocus(...objs) {
    this.focus = objs.filter((o) => o && o.pos).slice(0, 2);
  }
  setDesat(v) {
    this.mat.uniforms.uDesat.value = Math.max(0, Math.min(1, +v || 0));
  }
  get paperFade() {
    return this.mat.uniforms.uFade.value;
  }
  get desat() {
    return this.mat.uniforms.uDesat.value;
  }
  _syncFocus() {
    const u = this.mat.uniforms, F = this.focus;
    for (let i = 0; i < 2; i++) {
      const v = i ? u.uFocusB.value : u.uFocusA.value, o = F[i];
      if (!o) {
        v.w = 0;
        continue;
      }
      const e = o.entity || {}, r = e.radius || 0.4, h = e.height || 1.8;
      // 半径：碰撞半径 × 2.9（青牙 1.3 → 3.8 米，盖住约 6.8 米的体长；主角 0.4 → 1.2 米）；高度留 25% 余量（抬头、举剑）
      v.set(o.pos.x, o.pos.y, o.pos.z, Math.max(1.0, r * 2.9));
      u.uFocusH.value.setComponent(i, h * 1.25);
    }
  }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    const W = Math.round(w * pr), H = Math.round(h * pr);
    this.rt.setSize(W, H);
    this.mat.uniforms.uRes.value.set(W, H);
    for (const p of this.paper) p.setSize(W, H);
    this.bakeMat.uniforms.uRes.value.set(W, H);
    this.paperDirty = !0;
  }
  // 墨线采样数（画质档位）：8 = 含斜向，4 = 只取十字
  setTaps(n) {
    if (this.mat.defines.TAPS === n) return;
    this.mat.defines.TAPS = n;
    this.mat.needsUpdate = !0;
  }
  bakePaper() {
    const r = this.renderer;
    for (let i = 0; i < 2; i++) {
      this.bakeMat.uniforms.uPart.value = i;
      r.setRenderTarget(this.paper[i]);
      r.render(this.bakeQuad, this.cam);
    }
    r.setRenderTarget(null);
    this.paperDirty = !1;
  }
  render(scene, camera, time) {
    const r = this.renderer, u = this.mat.uniforms;
    if (this.paperDirty) this.bakePaper();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uTime.value = time;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    if (u.uFade.value > 0) this._syncFocus();
    r.render(this.quad, this.cam);
  }
}
