// 施法预览的地面虚影（依《UI 风格指南》§8.2）：射程圈、飞行轨迹、扇形、落点范围、连锁目标。
// - 每条边都是"深色线 + 外侧一圈纸色"的双层结构，纸白地面和焦墨上都清楚；边缘用噪声做毛边、起笔收笔。
// - 五行色低饱和；不可施放时一律淡墨（不用红色，红色留给敌人和危险）。
// - 所有形状都是贴地网格：每帧按地形高度重新采样顶点，台地、坡面上也不会穿模或悬空。
// - 画在水墨后处理之后（不被描黑边、不被纸纹吃掉）：包一层 renderer.render，在水墨全屏合成那一次之后再画预览场景；
//   遮挡用水墨渲染目标的深度图手动比较（主角、树木挡在预览前面时预览被挡住）。
//   拿不到水墨管线时（例如其他场景直接渲染）自动退回为挂在主场景里。
import * as THREE from "three";

const LIFT = 0.07;
const INK = new THREE.Color(0x15181b);
const PAPER = new THREE.Color(0xf5f0e3);
const DIM = new THREE.Color(0x8a857a); // 淡墨（不可施放）

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const COMMON = /* glsl */ `
uniform vec3 uColor, uInk, uPaper, uDim; uniform float uTime, uAlpha, uBad;
uniform sampler2D tDepth; uniform float uUseDepth, uNear, uFar; uniform vec2 uRes;
varying vec2 vUv;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
// 被场景里更近的东西挡住 → 丢弃
void occl(){
  if (uUseDepth < 0.5) return;
  float d = texture2D(tDepth, gl_FragCoord.xy / uRes).r;
  if (d < 0.99999 && linZ(d) < linZ(gl_FragCoord.z) - 0.25) discard;
}
vec3 tint(){ return mix(uColor, uDim, uBad); }
// 深色线（五行色压一点墨）+ 外侧纸色：line、halo 为两层的覆盖度
vec4 layered(vec3 fillC, float fillA, float line, float halo, float lineA){
  vec3 lc = mix(tint(), uInk, 0.35 + 0.25 * uBad);
  vec4 c = vec4(fillC, fillA);
  c = mix(c, vec4(uPaper, 0.7), halo * (1.0 - line));
  c = mix(c, vec4(lc, lineA), line);
  return c;
}
void outC(vec4 c){ gl_FragColor = vec4(c.rgb, c.a * uAlpha); }
`;
const TAIL = /* glsl */ `#include <colorspace_fragment>`;

// 落点圆相：内 α .08 → 边缘 .32 的墨晕；一笔圆相（起笔收笔、留缺口）α .85；中心一点。uR = 半径（米）
const DISC_FRAG = COMMON + /* glsl */ `
uniform float uR, uDot;
void main(){
  occl();
  vec2 p = vUv; float r = length(p); float a = atan(p.y, p.x);
  float px = 0.035 / max(uR, 0.3) * 3.0;                 // 线宽单位（约 0.1 米）
  float rough = (vn(a * 7.0 + 3.0) - 0.5) * 0.035 + (vn(a * 23.0) - 0.5) * 0.015;
  if (r > 1.0 + px * 3.0) discard;
  // 圆相：从 a0 起笔、绕一圈、留约 30° 缺口；笔压两头轻中间重
  float a0 = 2.2;
  float t = fract((a - a0) / 6.2831853);
  float gap = 0.085;
  float press = smoothstep(0.0, 0.08, t) * smoothstep(1.0 - gap, 0.8 - gap, t);
  float wLine = px * (0.6 + 1.0 * press);
  float dr = abs(r - 0.97 - rough);
  float dry = mix(1.0, 0.55 + 0.45 * step(0.32, vn(a * 18.0 + r * 9.0)), 1.0 - press); // 收笔飞白
  float line = smoothstep(wLine, wLine * 0.5, dr) * step(0.02, press) * dry;
  float halo = smoothstep(wLine + px * 1.6, wLine + px * 0.4, dr) * step(0.02, press);
  // 不可施放：边改虚线 + 一道斜笔
  float dash = step(0.45, fract(a * 6.0));
  line *= mix(1.0, dash, uBad);
  halo *= mix(1.0, dash, uBad);
  float slash = uBad * smoothstep(px * 1.1, px * 0.4, abs(p.x * 0.7071 - p.y * 0.7071)) * step(r, 0.62);
  float inside = step(r, 0.97 + rough);
  float fillA = mix(mix(0.08, 0.32, smoothstep(0.0, 1.0, r * r)), 0.08, uBad) * inside;
  float dot_ = smoothstep(uDot, uDot * 0.6, r * uR) * (1.0 - uBad);
  vec4 c = layered(tint(), fillA, max(max(line, slash), dot_), halo, mix(0.85, 0.55, uBad));
  outC(c);
  ${TAIL}
}`;

// 扇形：vUv.x 半径 0..1，vUv.y 角度 -1..1；根部 α .3 → 外缘 .06；毛边描线 α .75 + 纸色外描
const CONE_FRAG = COMMON + /* glsl */ `
uniform float uR, uAng;
void main(){
  occl();
  float r = vUv.x, a = vUv.y;
  float px = 0.05 / max(uR, 0.5);
  float side = (1.0 - abs(a)) * uAng * 0.5 * r;   // 到侧边的弧长距离（半径单位）
  float rim = 1.0 - r;
  float d = min(side, rim) + (vn(a * 9.0 + r * 11.0) - 0.5) * px;
  float line = smoothstep(px * 1.3, px * 0.5, d) * step(0.04, r);
  float halo = smoothstep(px * 3.0, px * 1.4, d);
  float fillA = mix(mix(0.3, 0.06, r), 0.08, uBad);
  outC(layered(tint(), fillA, line, halo, 0.75));
  ${TAIL}
}`;

// 轨迹：vUv.x 沿路径（米），vUv.y 横跨 0..1。同色宽带 α .28（起点圆头）+ 点状虚笔（点 : 空 = 1 : 2）+ 终点一笔箭头 α .9
const STRIP_FRAG = COMMON + /* glsl */ `
uniform float uLen, uW;
void main(){
  occl();
  float s = vUv.x, w = abs(vUv.y - 0.5) * 2.0;            // w 0 中线 → 1 边
  float half_ = uW * 0.5;
  float toEnd = uLen - s;
  // 箭头：终点前 aL 米的三角形 + 纸色外描
  float aL = min(1.3, uLen * 0.3);
  float inArrow = step(toEnd, aL);
  float tri = toEnd / aL;                                  // 0 尖 → 1 底
  float da = (w - tri) * half_;                            // 到箭头斜边的距离（米，负 = 里面）
  float arrow = inArrow * smoothstep(0.03, -0.03, da);
  float arrowHalo = inArrow * smoothstep(0.12, 0.02, da);
  // 宽带（箭头之前），起点圆头
  float sb = max(0.0, half_ - s);
  float cap = 1.0 - step(half_, sqrt(sb * sb + (w * half_) * (w * half_))) * step(s, half_);
  float band = (1.0 - inArrow) * cap * smoothstep(1.0, 0.86, w);
  float edge = (1.0 - inArrow) * cap * smoothstep(0.06, 0.0, abs(w - 0.9) - 0.04) * (0.7 + 0.3 * vn(s * 4.0));
  // 点状虚笔（圆点，间距 0.9 米），向前流动
  float ph = fract((s - uTime * 2.6) / 0.9) - 0.5;
  float rd = min(0.13, half_ * 0.4);
  float dots = (1.0 - inArrow) * smoothstep(rd, rd * 0.7, length(vec2(ph * 0.9, w * half_))) * step(0.5, s);
  vec3 c0 = tint();
  vec4 c = vec4(c0, band * mix(0.28, 0.08, uBad));
  c = mix(c, vec4(uPaper, 0.6), edge * 0.6);
  c = mix(c, vec4(uPaper, 0.75), arrowHalo * (1.0 - arrow));
  vec3 lc = mix(c0, uInk, 0.3 + 0.25 * uBad);
  c = mix(c, vec4(lc, 0.85), dots);
  c = mix(c, vec4(lc, 0.9), arrow);
  outC(c);
  ${TAIL}
}`;

// 圆环（射程圈、连锁跳跃半径）：淡墨虚圆 α .45，外面一圈纸色描边 α .7；uTintRing=1 时用五行色
const RING_FRAG = COMMON + /* glsl */ `
uniform float uTintRing;
void main(){
  occl();
  float s = vUv.x, w = abs(vUv.y - 0.5) * 2.0;
  float dash = step(0.42, fract((s + uTime * 0.3) / 1.1));
  float cw = mix(0.4, 0.62, uTintRing);                  // 连锁跳跃圈：更粗、更浓
  float core = smoothstep(cw, cw - 0.2, w) * dash * (0.75 + 0.25 * vn(s * 2.3));
  float halo = smoothstep(1.0, 0.8, w) * dash;
  vec3 lc = mix(uInk, mix(tint(), uInk, 0.4), uTintRing);
  vec4 c = vec4(uPaper, 0.7 * halo);
  c = mix(c, vec4(lc, mix(0.45, 0.85, uTintRing)), core);
  outC(c);
  ${TAIL}
}`;

function mat(frag, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    transparent: !0,
    depthWrite: !1,
    depthTest: !1,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color() }, uInk: { value: INK }, uPaper: { value: PAPER }, uDim: { value: DIM },
      uTime: { value: 0 }, uAlpha: { value: 1 }, uBad: { value: 0 },
      tDepth: { value: null }, uUseDepth: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uRes: { value: new THREE.Vector2(1, 1) },
      ...extra,
    },
  });
}

// 极坐标网格（圆 / 扇形共用）：R 圈 × S 段，顶点每帧贴地
class PolarDecal {
  constructor(frag, R = 10, S = 56, sector = !1) {
    this.R = R;
    this.S = S;
    this.sector = sector;
    const n = (R + 1) * (S + 1);
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= R; i++)
      for (let j = 0; j <= S; j++) {
        const k = i * (S + 1) + j;
        if (sector) (uv[k * 2] = i / R), (uv[k * 2 + 1] = (j / S) * 2 - 1);
        if (i < R && j < S) idx.push(k, k + S + 1, k + 1, k + 1, k + S + 1, k + S + 2);
      }
    this.uv = uv;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mat = mat(frag, sector ? { uR: { value: 1 }, uAng: { value: 1 } } : { uR: { value: 1 }, uDot: { value: 0.12 } });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = !1;
    this.mesh.renderOrder = 22;
    this.mesh.visible = !1;
  }
  // 圆：中心 c、半径 r；扇形：中心 c、朝向 dir、半径 r、全角 angle。圆的外圈多留 6% 给纸色外描
  set(H, c, r, dir = null, angle = Math.PI * 2) {
    const { R, S, pos, uv } = this;
    const base = dir ? Math.atan2(dir.z, dir.x) : 0;
    const ext = this.sector ? 1 : 1.06;
    for (let i = 0; i <= R; i++) {
      const rr = (i / R) * r * ext;
      for (let j = 0; j <= S; j++) {
        const k = i * (S + 1) + j;
        const a = this.sector ? base + ((j / S) * 2 - 1) * angle * 0.5 : (j / S) * Math.PI * 2;
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        pos[k * 3] = x;
        pos[k * 3 + 1] = H(x, z) + LIFT;
        pos[k * 3 + 2] = z;
        if (!this.sector) (uv[k * 2] = Math.cos(a) * (i / R) * ext), (uv[k * 2 + 1] = Math.sin(a) * (i / R) * ext);
      }
    }
    const u = this.mat.uniforms;
    u.uR.value = r;
    if (this.sector) u.uAng.value = angle;
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = !0;
    if (!this.sector) g.attributes.uv.needsUpdate = !0;
    this.mesh.visible = !0;
  }
}

// 带状网格：沿一条折线铺一条贴地的笔触带
class Strip {
  constructor(frag, maxPts = 160, extra = {}) {
    this.max = maxPts;
    this.pos = new Float32Array(maxPts * 2 * 3);
    this.uvs = new Float32Array(maxPts * 2 * 2);
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mat = mat(frag, extra);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = !1;
    this.mesh.renderOrder = 23;
    this.mesh.visible = !1;
  }
  // pts: [[x, z], …]，width：米
  set(H, pts, width) {
    const n = Math.min(pts.length, this.max);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let tx = q[0] - o[0], tz = q[1] - o[1];
      const tl = Math.hypot(tx, tz) || 1;
      (tx /= tl), (tz /= tl);
      if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (const side of [0, 1]) {
        const k = i * 2 + side, w = (side ? 0.5 : -0.5) * width;
        const x = p[0] - tz * w, z = p[1] + tx * w;
        this.pos[k * 3] = x;
        this.pos[k * 3 + 1] = H(x, z) + LIFT + 0.01;
        this.pos[k * 3 + 2] = z;
        this.uvs[k * 2] = s;
        this.uvs[k * 2 + 1] = side;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    g.attributes.position.needsUpdate = !0;
    g.attributes.uv.needsUpdate = !0;
    const u = this.mat.uniforms;
    if (u.uLen) u.uLen.value = s;
    if (u.uW) u.uW.value = width;
    this.mesh.visible = n > 1;
    return s;
  }
}

// ---- 水墨之后的叠加层：包一层 renderer.render（每个渲染器只包一次） ----
// 识别水墨管线的两次调用：① 把主场景渲染进带深度图的渲染目标 ② 往屏幕画全屏合成（一个 Mesh、目标为空）。
// 在 ② 之后用 ① 的镜头再画叠加场景；深度图交给预览着色器做遮挡。
const OVERLAYS = new Set();
function hookRenderer(renderer) {
  if (renderer.__overlayHook) return renderer.__overlayHook;
  const orig = renderer.render.bind(renderer);
  const hook = { depth: null, camera: null, res: [1, 1], last: 0, busy: !1 };
  renderer.render = function (scene, camera) {
    const rt = renderer.getRenderTarget();
    if (rt && rt.depthTexture && scene.isScene) (hook.depth = rt.depthTexture), (hook.camera = camera), (hook.res = [rt.width, rt.height]);
    orig(scene, camera);
    if (!rt && !scene.isScene && hook.camera && !hook.busy && OVERLAYS.size) {
      hook.busy = !0;
      const ac = renderer.autoClear;
      renderer.autoClear = !1;
      try {
        for (const o of OVERLAYS) o.drawOverlay(renderer, hook);
      } finally {
        renderer.autoClear = ac;
        hook.busy = !1;
      }
      hook.last = performance.now();
    }
  };
  renderer.__overlayHook = hook;
  return hook;
}

export class TargetFx {
  constructor(scene, renderer) {
    this.mainScene = scene;
    this.overlay = new THREE.Scene();
    this.root = new THREE.Group();
    this.root.name = "targeting";
    this.hook = renderer ? hookRenderer(renderer) : null;
    this.overlay.add(this.root);
    if (this.hook) OVERLAYS.add(this);
    else scene.add(this.root);
    this.range = new Strip(RING_FRAG, 130, { uTintRing: { value: 0 } });
    this.disc = new PolarDecal(DISC_FRAG, 10, 64);
    this.endDisc = new PolarDecal(DISC_FRAG, 6, 48); // 轨迹末端的爆炸范围
    this.cone = new PolarDecal(CONE_FRAG, 10, 28, !0);
    this.lines = [0, 1, 2, 3, 4].map(() => new Strip(STRIP_FRAG, 90, { uLen: { value: 1 }, uW: { value: 1 } }));
    this.jump = new Strip(RING_FRAG, 90, { uTintRing: { value: 1 } });
    this.mark = new PolarDecal(DISC_FRAG, 3, 32); // 落点 / 连锁首个目标
    this.all = [this.range, this.disc, this.endDisc, this.cone, ...this.lines, this.jump, this.mark];
    for (const o of this.all) this.root.add(o.mesh);
    this.flashT = 0;
    this._t0 = performance.now();
  }
  get anyVisible() {
    return this.all.some((o) => o.mesh.visible);
  }
  // 叠加层绘制（由渲染钩子在水墨合成之后调用）
  drawOverlay(renderer, hook) {
    if (this.root.parent !== this.overlay || !this.anyVisible) return;
    const cam = hook.camera;
    for (const o of this.all) {
      const u = o.mat.uniforms;
      u.tDepth.value = hook.depth;
      u.uUseDepth.value = hook.depth ? 1 : 0;
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uRes.value.set(hook.res[0], hook.res[1]);
    }
    renderer.render(this.overlay, cam);
  }
  // 统一设置颜色与状态（bad = 不可施放：冷却、真气不足、落点无效 → 淡墨）
  style(color, bad, alpha = 1) {
    for (const o of this.all) {
      o.mat.uniforms.uColor.value.set(color);
      o.mat.uniforms.uBad.value = bad ? 1 : 0;
      o.mat.uniforms.uAlpha.value = alpha;
    }
  }
  hide() {
    for (const o of this.all) o.mesh.visible = !1;
  }
  circlePts(c, r, n = 96) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r]);
    }
    return pts;
  }
  showRange(H, c, r) {
    this.range.set(H, this.circlePts(c, r, 128), 0.2);
  }
  showDisc(H, c, r) {
    this.disc.set(H, c, r);
  }
  showEnd(H, c, r) {
    this.endDisc.set(H, c, r);
  }
  showCone(H, c, dir, r, angle) {
    this.cone.set(H, c, r, dir, angle);
  }
  showLine(i, H, pts, width) {
    return this.lines[i].set(H, pts, width);
  }
  showJump(H, c, r) {
    this.jump.set(H, this.circlePts(c, r, 80), 0.26);
  }
  showMark(H, c, r = 0.45) {
    this.mark.set(H, c, r);
  }
  update(dt) {
    for (const o of this.all) o.mat.uniforms.uTime.value += dt;
    // 叠加层失效（没有水墨管线的场景）→ 退回主场景里画
    if (this.hook) {
      const stale = performance.now() - Math.max(this.hook.last, this._t0) > 600;
      const want = stale ? this.mainScene : this.overlay;
      if (this.root.parent !== want) {
        want.add(this.root);
        for (const o of this.all) {
          if (stale) o.mat.uniforms.uUseDepth.value = 0;
          o.mat.depthTest = stale; // 主场景里靠深度测试遮挡；叠加层里靠深度图
        }
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.3);
      for (const o of this.all) o.mat.uniforms.uAlpha.value = k;
      if (this.flashT <= 0) this.hide();
    }
  }
  // 快速施法：预览闪一下后淡出
  flash() {
    this.flashT = 0.3;
  }
  dispose() {
    OVERLAYS.delete(this);
    for (const o of this.all) {
      o.mesh.geometry.dispose();
      o.mat.dispose();
    }
    this.root.parent && this.root.parent.remove(this.root);
  }
}
