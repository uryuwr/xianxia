// 共用特效（水墨风）：预警圈、刀光弧、墨点飞溅、光柱。所有模块通过这里画特效，保证风格统一。
// 接口（稳定）：
//   vfx.ring(pos, radius, { color, dur, fill, width, warn })  地面圆环 / 预警圈（fill>0 时为逐渐填满的预警；warn = 敌方攻击预警：纸色外描 + 朱线 + 斜皴）
//   vfx.arc(pos, dir, radius, angle, { color, dur, width, y }) 刀光：一笔弧形墨迹
//   vfx.burst(pos, { color, count, speed, size, dur, up })    墨点 / 灵光飞溅
//   vfx.pillar(pos, { color, radius, height, dur })            光柱（法术落点、拾取）
// 颜色：墨 0x15181b、朱砂 0xd2321e、石青 0x3f8fa8、石绿 0x3fae7a、金 0xe0b45a、紫 0x7b4fa8
import * as THREE from "three";
import { height } from "../world/terrain.js";

export const INKC = { ink: 0x15181b, red: 0xd2321e, blue: 0x3f8fa8, green: 0x3fae7a, gold: 0xe0b45a, purple: 0x7b4fa8, white: 0xf4f1e8 };

// 敌方攻击预警的外缘"深色线"（UI 体检 v1）：数据给的五行预警色（土 #a5743a、木 #3fae7a 等）比朱浅，外缘按相对亮度压到不高于朱（同色相、更深），填充仍用原色
const LZ = 0.1185; // 朱 #b8291a 的相对亮度（three 的 Color 存线性值）
export const deepRim = (c) => {
  const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return L > LZ ? c.clone().multiplyScalar(LZ / L) : c.clone();
};
// 敌方圆形预警贴地（同 enemy_fx.js 的 drape）：平面圈在坡地上外缘会被地形吃掉（细外缘线尤其明显），按顶点贴到地面高度；
// 几何体走对象池（细分平面，用完归还），每帧只改顶点 y，不新建对象
const _dp = new THREE.Vector3();
function drapeRing(mesh, radius) {
  const pos = mesh.geometry.attributes.position, base = mesh.geometry.userData.base, x0 = mesh.position.x, y0 = mesh.position.y, z0 = mesh.position.z;
  for (let i = 0; i < pos.count; i++) {
    _dp.set(x0 + base[i * 3] * radius, 0, z0 + base[i * 3 + 2] * radius);
    pos.setY(i, (Math.max(height(_dp.x, _dp.z), y0 - 0.6) + 0.1 - y0) / radius);
  }
  pos.needsUpdate = !0;
}

// uWarn = 1：敌方攻击预警（UI 体检 v1，风格指南 §8.2 双层结构）——外缘 7.5px 纸色笔带里压 3.2px 朱线（屏幕像素），已涨部分朱色斜皴线；
//   同一个着色器、只多两个 uniform（uWarn、uR = 半径米数），不产生新变体；神龛读条、法术 / 法宝落点（uWarn = 0）外观不变
const RING_FRAG = /* glsl */ `
uniform vec3 uColor, uRim; uniform float uT, uFill, uWidth, uAlpha, uWarn, uR;
varying vec2 vUv;
float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(hh(i), hh(i + 1.0), t); }
const vec3 PAPER = vec3(0.961, 0.941, 0.890);
vec4 over(vec4 t, vec4 b){ float A = t.a + b.a * (1.0 - t.a); return vec4((t.rgb * t.a + b.rgb * b.a * (1.0 - t.a)) / max(A, 1e-4), A); }
float hatch(vec2 w){ float u = (w.x * 0.819 + w.y * 0.574) / 0.3; float f = abs(fract(u) - 0.5); float fw = fwidth(u); return 1.0 - smoothstep(0.15 - fw, 0.15 + fw, f); }
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float aw = fwidth(r) * 1.5 + 1e-4;                                // 抗锯齿：约 1.5 像素的柔边
  float a = atan(p.y, p.x);
  float rough = (vn(a * 9.0 + 4.0 + uWidth * 50.0) - 0.5) * 0.04;     // 笔触边缘的毛糙（沿圆周缓变，不是方格）
  if (uWarn > 0.5) {
    float pr = fwidth(r) + 1e-5;
    float d = (0.985 + rough * 0.5 - r) / pr;                        // 到外缘的像素距离（内侧为正）
    if (d < -1.0) discard;
    float filled = smoothstep(uT + 0.012 + pr, uT - 0.012 - pr, r);
    float aP = (1.0 - smoothstep(7.0, 8.0, d)) * 0.85;
    float aR = 1.0 - smoothstep(1.2, 2.0, abs(d - 3.75));
    vec4 o = over(vec4(PAPER, aP), vec4(uColor, mix(0.07, max(0.14, hatch(p * uR) * 0.55), filled)));
    o = over(vec4(uRim, aR), o);
    float wa = o.a * smoothstep(-0.75, 0.75, d) * uAlpha;
    if (wa < 0.01) discard;
    gl_FragColor = vec4(o.rgb, wa);
    return;
  }
  float m = smoothstep(1.0, 1.0 - aw * 2.0, r);                      // 网格边界处淡出
  float rim = 1.0 - smoothstep(uWidth, uWidth + 0.03 + aw, abs(r - (1.0 - uWidth) + rough));
  float fill = uFill > 0.0 ? smoothstep(uT + 0.012 + aw, uT - 0.012 - aw, r) * 0.35 : 0.0; // 预警：由内向外填满
  float body = uFill > 0.0 ? 0.12 * smoothstep(1.0 - uWidth + rough + aw, 1.0 - uWidth + rough - aw, r) : 0.0;
  float al = max(rim, max(fill, body)) * m * uAlpha;
  if (al < 0.01) discard;
  gl_FragColor = vec4(uColor, al);
}`;
const BASIC_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const ARC_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uT;
varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.7) * 437.5); }
void main(){
  // vUv.x 沿弧（0 起笔 → 1 收笔），vUv.y 横跨笔画
  float head = uT * 1.6;                                    // 笔锋扫过
  if (vUv.x > head) discard;
  float age = head - vUv.x;
  float taper = sin(vUv.x * 3.14159) * (1.0 - age * 0.9);   // 两头尖、扫过后变细
  float w = abs(vUv.y - 0.5) * 2.0;
  float dry = step(0.25, h(floor(vUv.y * 9.0) + floor(vUv.x * 30.0) * 0.1)); // 飞白
  float a = smoothstep(taper, taper - 0.25, w) * mix(0.55, 1.0, dry) * (1.0 - smoothstep(0.6, 1.0, uT));
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "vfx";
    scene.add(this.root);
    this.items = [];
    this.ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.warnGeos = []; // 敌方圆形预警的贴地细分平面（对象池）
    // 墨点：实例化的小圆片（面向镜头）
    this.dotMax = 600;
    const dg = new THREE.CircleGeometry(0.5, 8);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ transparent: !0, depthWrite: !1, vertexColors: !1 }), this.dotMax);
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.dotMax * 3), 3);
    this.dots.count = 0;
    this.dots.frustumCulled = !1;
    this.dots.renderOrder = 30;
    this.root.add(this.dots);
    this.dotData = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.camera = null;
  }
  _add(mesh, dur, update) {
    mesh.renderOrder = 25;
    this.root.add(mesh);
    const it = { mesh, t: 0, dur, update };
    this.items.push(it);
    return it;
  }
  ring(pos, radius, o = {}) {
    const col = new THREE.Color(o.warn && (o.color == null || o.color === INKC.red) ? 0xb8291a : o.color ?? INKC.red);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BASIC_VERT, fragmentShader: RING_FRAG, transparent: !0, depthWrite: !1,
      uniforms: {
        uColor: { value: col }, uRim: { value: o.warn ? deepRim(col) : col }, // 预警默认朱（风格指南 --zhu）；外缘压深（deepRim）
        uT: { value: 0 }, uFill: { value: o.fill || 0 }, uWidth: { value: o.width ?? 0.06 }, uAlpha: { value: 1 }, uWarn: { value: o.warn ? 1 : 0 }, uR: { value: radius },
      },
    });
    const wg = o.warn ? this.warnGeos.pop() || this._warnGeo() : null;
    const m = new THREE.Mesh(wg || this.ringGeo, mat);
    m.position.set(pos.x, pos.y + 0.06, pos.z);
    m.scale.setScalar(radius);
    if (wg) (m.frustumCulled = !1), drapeRing(m, radius);
    const dur = o.dur ?? 0.8;
    const it = this._add(m, dur, (it, k) => {
      mat.uniforms.uT.value = k;
      mat.uniforms.uAlpha.value = o.fill ? 1 - Math.max(0, k - 0.95) * 20 : 1 - k;
      if (!o.fill && o.grow !== !1) m.scale.setScalar(radius * (0.85 + 0.15 * k));
      if (wg) drapeRing(m, radius); // 圈会跟着主角挪（enemy.js 落点圈前段跟随），每帧重新贴地
    });
    if (wg) it.onEnd = () => this.warnGeos.push(wg);
    return it;
  }
  _warnGeo() {
    const g = new THREE.PlaneGeometry(2, 2, 16, 16).rotateX(-Math.PI / 2);
    g.userData.base = Float32Array.from(g.attributes.position.array);
    return g;
  }
  arc(pos, dir, radius, angle, o = {}) {
    const seg = 24, w = o.width ?? 0.35;
    const pts = [], uvs = [], idx = [];
    const base = Math.atan2(dir.x, dir.z);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = base + (o.reverse ? 1 : -1) * (u - 0.5) * angle;
      for (const [k, r] of [[0, radius - w], [1, radius]]) {
        pts.push(Math.sin(a) * r, 0, Math.cos(a) * r);
        uvs.push(u, k);
      }
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BASIC_VERT, fragmentShader: ARC_FRAG, transparent: !0, depthWrite: !1, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(o.color ?? INKC.ink) }, uT: { value: 0 } },
    });
    const m = new THREE.Mesh(g, mat);
    m.position.set(pos.x, pos.y + (o.y ?? 0.9), pos.z);
    if (o.tilt) m.rotation.z = o.tilt;
    const it = this._add(m, o.dur ?? 0.28, (it, k) => (mat.uniforms.uT.value = k));
    it.onEnd = () => g.dispose();
    return it;
  }
  burst(pos, o = {}) {
    const n = o.count ?? 14, c = this._c.set(o.color ?? INKC.ink);
    for (let i = 0; i < n && this.dotData.length < this.dotMax; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 5) * (0.4 + Math.random() * 0.8);
      this.dotData.push({
        p: new THREE.Vector3(pos.x, pos.y + (o.y ?? 0.8), pos.z),
        v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * sp),
        s: (o.size ?? 0.18) * (0.5 + Math.random()), t: 0, dur: (o.dur ?? 0.6) * (0.6 + Math.random() * 0.6), r: c.r, g: c.g, b: c.b,
      });
    }
  }
  pillar(pos, o = {}) {
    const g = new THREE.CylinderGeometry(o.radius ?? 0.5, o.radius ?? 0.5, o.height ?? 6, 16, 1, !0).translate(0, (o.height ?? 6) / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: o.color ?? INKC.gold, transparent: !0, opacity: 0.6, depthWrite: !1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.position.copy(pos);
    return this._add(m, o.dur ?? 0.6, (it, k) => {
      mat.opacity = 0.6 * (1 - k);
      m.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
    });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update && it.update(it, k);
      if (k >= 1) {
        this.root.remove(it.mesh);
        it.mesh.material.dispose();
        it.onEnd && it.onEnd();
        this.items.splice(i, 1);
      }
    }
    // 墨点
    const cam = this.camera;
    if (cam) this._q.copy(cam.quaternion);
    let n = 0;
    for (let i = this.dotData.length - 1; i >= 0; i--) {
      const d = this.dotData[i];
      d.t += dt;
      if (d.t >= d.dur) {
        this.dotData.splice(i, 1);
        continue;
      }
      d.v.y -= 9 * dt;
      d.v.multiplyScalar(1 - dt * 2);
      d.p.addScaledVector(d.v, dt);
      const k = 1 - d.t / d.dur;
      this._m.compose(d.p, this._q, this._s.setScalar(d.s * (0.4 + 0.6 * k)));
      this.dots.setMatrixAt(n, this._m);
      this.dots.instanceColor.setXYZ(n, d.r, d.g, d.b);
      n++;
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = !0;
    this.dots.instanceColor.needsUpdate = !0;
  }
}
