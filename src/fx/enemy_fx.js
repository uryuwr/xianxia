// 敌人专用特效：危险区预警（扇形 / 直线，由内向外填满）、掉落灵珠。
// 圆形预警直接用共用特效 vfx.ring(…, { fill: 1, warn: !0 })。
import * as THREE from "three";
import { INKC, deepRim } from "./vfx.js";
import { height } from "../world/terrain.js";

const ZHU = 0xb8291a; // 预警朱（风格指南 --zhu）；旧的 INKC.red #d2321e 一律换成它；外缘按 deepRim 压深

// vW：世界坐标（斜皴线按世界尺度画，不随屏幕游动）
const VERT = /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// 柔边与抗锯齿：所有边缘都用 smoothstep，宽度加上 fwidth（约 1.5 像素），几何边界处透明度归零，不再有硬 discard / step 锯齿；
// 笔触毛糙用沿边方向缓变的值噪声（不再是 floor 出来的方格 / 台阶）
// UI 体检 v1（风格指南 §8.2"每条边都是深色线 + 外侧一圈纸色"，草图 docs/ui/v3/体检_v1/e_shijie.html）：
//   外缘 = 7.5px 纸色笔带里压一道 3.2px 朱线（线宽按屏幕像素，fwidth 换算）；已涨部分 = 朱色斜皴线（α .55 + 底 .14），未涨 = 朱 α .07
const NOISE = /* glsl */ `
float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(hh(i), hh(i + 1.0), t); }
const vec3 PAPER = vec3(0.961, 0.941, 0.890);
vec4 over(vec4 t, vec4 b){ float A = t.a + b.a * (1.0 - t.a); return vec4((t.rgb * t.a + b.rgb * b.a * (1.0 - t.a)) / max(A, 1e-4), A); }
// 斜皴线：世界坐标里 35° 斜向、间距 0.3 米、占三成
float hatch(vec2 w){ float u = (w.x * 0.819 + w.y * 0.574) / 0.3; float f = abs(fract(u) - 0.5); float fw = fwidth(u); return 1.0 - smoothstep(0.15 - fw, 0.15 + fw, f); }
// d = 到外缘的屏幕像素距离（内侧为正）→ 纸色笔带 / 朱线 / 填充 合成
vec4 warnInk(float d, float filled, vec2 w, vec3 col, vec3 rim){
  float aP = (1.0 - smoothstep(7.0, 8.0, d)) * 0.85;
  float aR = 1.0 - smoothstep(1.2, 2.0, abs(d - 3.75));
  float aF = mix(0.07, max(0.14, hatch(w) * 0.55), filled);
  vec4 o = over(vec4(PAPER, aP), vec4(col, aF));
  o = over(vec4(rim, aR), o);
  o.a *= smoothstep(-0.75, 0.75, d);
  return o;
}
`;

// 扇形：uv 中心 (0.5, 0.5)，朝 +v 方向；半角 uHalf
const SECTOR_FRAG = /* glsl */ `
uniform vec3 uColor, uRim; uniform float uK, uHalf, uAlpha;
varying vec2 vUv; varying vec3 vW;
${NOISE}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.x, p.y);
  float pr = fwidth(r) + 1e-5;                              // 半径方向一像素
  float side = (uHalf - abs(a)) * r;                        // 到两条侧边的距离（同 uv 尺度）
  float ps = fwidth(side) + 1e-5;
  float rough = (vn(a * 16.0 + 3.1) - 0.5) * 0.022;         // 外缘笔触：沿弧缓变
  float d = min((0.985 + rough - r) / pr, side / ps);       // 到外缘的像素距离
  if (d < -1.0) discard;
  float filled = smoothstep(uK + 0.012 + pr, uK - 0.012 - pr, r); // 由内向外填满，前沿柔和
  vec4 o = warnInk(d, filled, vW.xz, uColor, uRim);
  float al = o.a * uAlpha;
  if (al < 0.003) discard;
  gl_FragColor = vec4(o.rgb, al);
}`;

// 直线冲扑：uv.y 从起点 0 到终点 1（起点不描边，接在敌人脚下）
const LINE_FRAG = /* glsl */ `
uniform vec3 uColor, uRim; uniform float uK, uAlpha;
varying vec2 vUv; varying vec3 vW;
${NOISE}
void main(){
  float side = abs(vUv.x - 0.5) * 2.0;
  float px = fwidth(side) + 1e-5, py = fwidth(vUv.y) + 1e-5;
  float rough = (vn(vUv.y * 14.0 + 1.7) - 0.5) * 0.05;
  float d = min((0.97 + rough - side) / px, (1.0 - vUv.y) / py - 1.0);
  if (d < -1.0) discard;
  float filled = smoothstep(uK + 0.01 + py, uK - 0.01 - py, vUv.y);
  vec4 o = warnInk(d, filled, vW.xz, uColor, uRim);
  // 箭头般的笔触纹：提示冲扑方向（只在已涨部分）
  float chev = (1.0 - smoothstep(0.0, 0.08 + py * 4.0, abs(fract(vUv.y * 4.0 - side * 0.5 - uK * 2.0) - 0.5) - 0.38)) * 0.22 * filled;
  o = over(vec4(uColor, chev), o);
  float al = o.a * smoothstep(0.0, py * 2.0, vUv.y) * uAlpha;
  if (al < 0.003) discard;
  gl_FragColor = vec4(o.rgb, al);
}`;

// 预警贴地：网格细分，每帧把顶点贴到地面高度（坡地 / 岸边不再被地形埋掉一半）
const planeGeo = () => new THREE.PlaneGeometry(1, 1, 20, 20).rotateX(-Math.PI / 2);
// 直线用：原点在起点、沿 +Z 延伸（uv.y 从起点 0 到终点 1）
const lineGeo = () => new THREE.PlaneGeometry(1, 1, 4, 20).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const _p = new THREE.Vector3();
function drape(mesh) {
  const pos = mesh.geometry.attributes.position, base = mesh.userData.base;
  mesh.updateMatrixWorld();
  const m = mesh.matrixWorld, y0 = mesh.position.y;
  for (let i = 0; i < pos.count; i++) {
    _p.set(base[i * 3], 0, base[i * 3 + 2]).applyMatrix4(m);
    pos.setY(i, Math.max(height(_p.x, _p.z), y0 - 0.6) + 0.1 - y0); // 河道等凹处不往下贴（会被水面盖住）
  }
  pos.needsUpdate = !0;
  mesh.geometry.computeBoundingSphere();
}
function draped(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.userData.base = Float32Array.from(geo.attributes.position.array);
  m.frustumCulled = !1;
  return m;
}

export class EnemyFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = "enemy-fx";
    ctx.scene.add(this.root);
    this.items = [];
    this.orbs = [];
    this.orbGeo = new THREE.IcosahedronGeometry(0.16, 1);
  }
  _mat(frag, color) {
    const col = new THREE.Color(color == null || color === INKC.red ? ZHU : color);
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: frag,
      transparent: !0,
      depthWrite: !1,
      side: THREE.DoubleSide,
      polygonOffset: !0,
      polygonOffsetFactor: -4,
      uniforms: { uColor: { value: col }, uRim: { value: deepRim(col) }, uK: { value: 0 }, uHalf: { value: 1 }, uAlpha: { value: 1 } },
    });
  }
  // 扇形预警：pos 中心，dir 朝向（水平单位向量），radius 半径，angle 全角（弧度），dur 预警时长
  sector(pos, dir, radius, angle, dur, color) {
    const mat = this._mat(SECTOR_FRAG, color);
    mat.uniforms.uHalf.value = angle / 2;
    const m = draped(planeGeo(), mat);
    m.scale.set(radius * 2, 1, radius * 2);
    m.position.set(pos.x, pos.y + 0.12, pos.z);
    m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; // uv 的 +v 对应局部 -Z
    m.renderOrder = 24;
    return this._add(m, dur);
  }
  // 直线预警：从 pos 沿 dir 延伸 length，宽 width
  line(pos, dir, length, width, dur, color) {
    const mat = this._mat(LINE_FRAG, color);
    const m = draped(lineGeo(), mat);
    m.scale.set(width, 1, length);
    m.position.set(pos.x, pos.y + 0.12, pos.z);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.renderOrder = 24;
    return this._add(m, dur);
  }
  _add(mesh, dur) {
    this.root.add(mesh);
    drape(mesh);
    const it = { mesh, t: 0, dur, hold: 0.12, done: !1, cancel: () => (it.done = !0) };
    this.items.push(it);
    return it;
  }
  // 掉落灵珠：飘浮片刻后飞向主角被吸收
  orb(pos, color = INKC.green) {
    const m = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.set(pos.x, pos.y + 0.6, pos.z);
    this.root.add(m);
    this.orbs.push({ m, t: 0, v: new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2), base: pos.y });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const u = it.mesh.material.uniforms;
      u.uK.value = Math.min(1, it.t / it.dur);
      if (it.mesh.userData.base) drape(it.mesh); // 预警会跟着敌人转向 / 移动，每帧重新贴地
      // 预警结束后短暂停留（出招那一下），然后淡出
      const over = it.t - it.dur;
      u.uAlpha.value = it.done ? Math.max(0, u.uAlpha.value - dt * 8) : over > 0 ? Math.max(0, 1 - over / it.hold) : 1;
      if ((it.done && u.uAlpha.value <= 0) || over > it.hold) {
        this.root.remove(it.mesh);
        it.mesh.material.dispose();
        it.mesh.geometry.dispose();
        this.items.splice(i, 1);
      }
    }
    const hero = this.ctx.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      if (o.t < 0.6) {
        o.v.y -= 9 * dt;
        o.m.position.addScaledVector(o.v, dt);
        o.m.position.y = Math.max(o.m.position.y, o.base + 0.35);
      } else if (hero) {
        const to = new THREE.Vector3(hero.pos.x, hero.pos.y + 1, hero.pos.z).sub(o.m.position);
        const d = to.length();
        const range = o.t > 1.6 ? 1e9 : 4;
        if (d < range) o.m.position.addScaledVector(to.normalize(), Math.min(d, dt * (6 + o.t * 10)));
        else o.m.position.y = o.base + 0.55 + Math.sin(o.t * 4) * 0.08;
        if (d < 0.45) {
          this.root.remove(o.m);
          o.m.material.dispose();
          this.orbs.splice(i, 1);
          this.ctx.world.events.emit("loot:pickup", { pos: o.m.position.clone() });
          continue;
        }
      }
      o.m.rotation.y += dt * 3;
    }
  }
}
