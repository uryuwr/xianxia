// 主角的身法特效：闪身残影（冻结当下姿势的墨色分身）、贴地的一笔墨痕、普攻刀光（池化）、蓄势斩的月牙剑气（池化）。
// 附灵五行（法剑词条 imbue_<五行> / 碧鳞五行坛）：刀光与剑气保留墨色笔触为底，外缘一圈五行色；第三段与蓄势斩的笔芯用五行深色。
// 池化：刀光 8 个、剑气 2 个、贴地墨痕 6 个网格常驻场景，几何体按招式缓存，出招时只改 uniform，不再 new 材质 / 几何体。
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { swordMesh } from "./skill_fx.js";

// 五行配色（取自 shields.js EL_COLOR / feedback.js；金色在纸面上太浅，外缘改用泥金）：rim 外缘、deep 笔芯深调、css 界面用
export const ELEM_LOOK = {
  metal: { rim: 0xd9b45e, deep: 0x5e4a1c, css: "#b8923a", name: "金" },
  wood: { rim: 0x3fae7a, deep: 0x1d4a33, css: "#3f9a6e", name: "木" },
  water: { rim: 0x3f8fa8, deep: 0x163d52, css: "#2f7fa8", name: "水" },
  fire: { rim: 0xd2321e, deep: 0x5a160d, css: "#b8291a", name: "火" },
  earth: { rim: 0xa5743a, deep: 0x46301a, css: "#9a6a32", name: "土" },
};

const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x1a1d20, transparent: !0, opacity: 0.45, depthWrite: !1 });

const STROKE_FRAG = /* glsl */ `
uniform float uT; uniform vec3 uColor;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(hh(i), hh(i + 1.0), t); }
// 飞白：沿笔势方向的细丝（横向细分、纵向缓变），柔边，不再是方格
float feibai(float across, float along, float k){ return smoothstep(k - 0.12, k + 0.12, vn(across * 15.0 + 2.7) * 0.65 + vn(along * 5.0 + across * 4.0) * 0.35); }
void main(){
  float along = vUv.x, across = abs(vUv.y - 0.5) * 2.0;
  float taper = (0.25 + 0.75 * along) * (1.0 - uT);          // 起笔细、收笔粗，随时间变细
  float dry = feibai(vUv.y, along, 0.3);
  float a = smoothstep(taper, taper - 0.3, across) * mix(0.45, 1.0, dry) * (1.0 - uT) * 0.75;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;
const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// 普攻刀光：一笔弧形墨迹（笔锋扫过、两头尖、飞白）；uRimK > 0 时外缘一圈五行色（uRim），笔芯仍是 uColor
const SLASH_FRAG = /* glsl */ `
uniform vec3 uColor, uRim; uniform float uT, uRimK;
varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.7) * 437.5); }
float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(hh(i), hh(i + 1.0), t); }
// 飞白：沿笔势方向的细丝（横向细分、纵向缓变），柔边，不再是方格
float feibai(float across, float along, float k){ return smoothstep(k - 0.12, k + 0.12, vn(across * 15.0 + 2.7) * 0.65 + vn(along * 5.0 + across * 4.0) * 0.35); }
void main(){
  float head = uT * 1.6;
  if (vUv.x > head) discard;
  float age = head - vUv.x;
  float taper = sin(vUv.x * 3.14159) * (1.0 - age * 0.9);
  float w = abs(vUv.y - 0.5) * 2.0;
  float dry = feibai(vUv.y, vUv.x, 0.25);
  float a = smoothstep(taper, taper - 0.25, w) * mix(0.55, 1.0, dry) * (1.0 - smoothstep(0.6, 1.0, uT));
  if (a < 0.02) discard;
  float e = clamp(w / max(taper, 0.05), 0.0, 1.0);                               // 0 笔芯 → 1 笔缘
  float rim = (smoothstep(0.2, 0.7, e) * step(0.5, vUv.y) * 0.9 + 0.18) * uRimK; // 外缘着色，整体再淡淡一层
  gl_FragColor = vec4(mix(uColor, uRim, rim), a);
}`;
// 刀光几何体：以 +z 为正前方的弧（按 半径 / 弧度 / 笔宽 / 方向 缓存，网格旋转到出招方向）
const slashGeos = new Map();
function slashGeo(radius, angle, width, reverse) {
  const key = radius.toFixed(2) + "|" + angle.toFixed(2) + "|" + width.toFixed(2) + "|" + (reverse ? 1 : 0);
  let g = slashGeos.get(key);
  if (g) return g;
  const seg = 24, pts = [], uvs = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = (reverse ? 1 : -1) * (u - 0.5) * angle;
    for (const [k, r] of [[0, radius - width], [1, radius]]) {
      pts.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      uvs.push(u, k);
    }
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  slashGeos.set(key, g);
  return g;
}

// 蓄势斩的月牙剑气：一笔弯月形墨迹（中间厚、两头出锋、带飞白），朝前推进、渐淡；附灵时外缘五行色
const WAVE_FRAG = /* glsl */ `
uniform float uT, uRimK; uniform vec3 uColor, uRim;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float hh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), t = fract(x); t = t * t * (3.0 - 2.0 * t); return mix(hh(i), hh(i + 1.0), t); }
// 飞白：沿笔势方向的细丝（横向细分、纵向缓变），柔边，不再是方格
float feibai(float across, float along, float k){ return smoothstep(k - 0.12, k + 0.12, vn(across * 15.0 + 2.7) * 0.65 + vn(along * 5.0 + across * 4.0) * 0.35); }
void main(){
  float along = vUv.x, across = vUv.y;                       // across 0 = 内缘, 1 = 外缘
  float thick = sin(along * 3.14159);                         // 两头尖
  float inner = 1.0 - thick * 0.95;
  float a = smoothstep(inner - 0.08, inner + 0.05, across) * smoothstep(1.0, 0.86, across);
  float dry = feibai(across, along + uT * 0.6, 0.28);
  a *= mix(0.4, 1.0, dry) * (1.0 - smoothstep(0.7, 1.0, uT));
  if (a < 0.02) discard;
  vec3 c = mix(uColor, vec3(0.08), across * 0.35);
  c = mix(c, uRim, smoothstep(0.55, 0.95, across) * uRimK);  // 外缘五行色
  gl_FragColor = vec4(c, a * 0.92);
}`;
function crescentGeo(radius = 2.2, angle = 2.2, width = 1.1, seg = 28) {
  const pts = [], uvs = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = (u - 0.5) * angle;
    for (const [k, r] of [[0, radius - width], [1, radius]]) {
      pts.push(Math.sin(a) * r, 0, Math.cos(a) * r - radius + width * 0.5);
      uvs.push(u, k);
    }
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

export class PlayerFX {
  constructor(scene) {
    this.scene = scene;
    this.ghosts = [];
    this.strokes = [];
    this._seq = 0;
    this.stats = { slashes: 0, waves: 0, slashMats: 0, waveMats: 0 }; // 测试用计数（材质数应恒定）
    // 刀光池
    this.slashes = [];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: SLASH_FRAG, transparent: !0, depthWrite: !1, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uT: { value: 0 }, uRimK: { value: 0 } },
      });
      const m = new THREE.Mesh(slashGeo(2.2, 2.4, 0.36, !1), mat);
      m.renderOrder = 25;
      m.visible = !1;
      m.frustumCulled = !1;
      scene.add(m);
      this.slashes.push({ m, mat, t: 1, dur: 1, seq: 0 });
      this.stats.slashMats++;
    }
    // 剑气池
    this.waveGeo = crescentGeo();
    this.waves = [];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: WAVE_FRAG, transparent: !0, depthWrite: !1, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uRimK: { value: 0 } },
      });
      const m = new THREE.Mesh(this.waveGeo, mat);
      m.renderOrder = 27;
      m.visible = !1;
      m.frustumCulled = !1;
      scene.add(m);
      this.waves.push({ m, mat, busy: !1, fade: 0, t: 0, seq: 0 });
      this.stats.waveMats++;
    }
    // 贴地墨痕池（闪身 / 纵跃）：6 个网格常驻，共用一个单位长度的平面（按长度缩放 x），出招时只改位置 / uniform
    this.strokeGeo = new THREE.PlaneGeometry(1, 0.75).rotateX(-Math.PI / 2);
    this.strokePool = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: STROKE_FRAG, transparent: !0, depthWrite: !1, uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color() } } });
      const m = new THREE.Mesh(this.strokeGeo, mat);
      m.renderOrder = 24;
      m.visible = !1;
      scene.add(m);
      this.strokePool.push({ m, t: 1, dur: 0.5, seq: 0 });
    }
    // 御剑（筑基）：脚下一柄实体长剑（与青冥飞剑同一套网格，不带柔光；实体网格投影，形状就是剑），常驻一个，飞行时才显示
    //   不用透明面片：面片会被水墨描边描出方框、投出方形影子（docs/knowledge/战斗设计/坑.md）
    {
      const g = new THREE.Group();
      const sw = swordMesh({ glow: !1, color: 0xd8dde0, emissive: 0x1d2a33 });
      sw.rotation.x = Math.PI / 2; // 剑身原本沿 +y：放平，剑尖朝 +z
      sw.position.set(0, 0.08, -0.9);
      sw.scale.setScalar(2.2);
      g.add(sw);
      g.visible = !1;
      scene.add(g);
      this.rideM = g;
    }
  }
  // 御剑：on 时把脚下的剑放到 pos（剑尖朝 dir）；k = 飞行进度（落地前缩小收起）
  ride(on, pos, dir, k = 0) {
    const m = this.rideM;
    m.visible = !!on;
    if (!on) return;
    m.position.set(pos.x, pos.y - 0.02, pos.z);
    m.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    m.scale.setScalar(k > 0.8 ? Math.max(0.05, 1 - (k - 0.8) * 5) : 1);
  }
  // 模型加载后准备残影池（克隆带骨骼的模型，材质换成半透明墨色）
  init(model) {
    for (let i = 0; i < 4; i++) {
      const g = cloneSkinned(model);
      g.traverse((o) => {
        if (o.isMesh) {
          if (o.userData.isOutline) o.visible = !1;
          else (o.material = GHOST_MAT.clone()), (o.castShadow = !1), (o.receiveShadow = !1);
        }
      });
      g.visible = !1;
      const bones = [];
      g.traverse((o) => o.isBone && bones.push(o));
      this.scene.add(g);
      this.ghosts.push({ g, bones, t: 1, dur: 0.35 });
    }
    this.srcBones = [];
    model.traverse((o) => o.isBone && this.srcBones.push(o));
  }
  // 在主角当前位置、当前姿势留下一个残影
  ghost(root) {
    const gh = this.ghosts.find((x) => x.t >= x.dur) || this.ghosts[0];
    if (!gh) return;
    root.updateMatrixWorld(!0);
    gh.g.position.copy(root.position);
    gh.g.quaternion.copy(root.quaternion);
    gh.g.scale.copy(root.scale);
    const n = Math.min(gh.bones.length, this.srcBones.length);
    for (let i = 0; i < n; i++) {
      gh.bones[i].position.copy(this.srcBones[i].position);
      gh.bones[i].quaternion.copy(this.srcBones[i].quaternion);
      gh.bones[i].scale.copy(this.srcBones[i].scale);
    }
    gh.g.visible = !0;
    gh.t = 0;
  }
  // 贴地墨痕：从 a 到 b 的一笔
  stroke(a, b, color = 0x15181b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    // 池化：取空闲的，都在用就复用最早的那个
    const s = this.strokePool.find((x) => x.t >= x.dur) || this.strokePool.reduce((p, q) => (p.seq < q.seq ? p : q));
    const m = s.m;
    m.scale.set(len, 1, 1);
    m.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.08, (a.z + b.z) / 2);
    m.rotation.set(0, -Math.atan2(dz, dx), 0);
    m.material.uniforms.uT.value = 0;
    m.material.uniforms.uColor.value.set(color);
    m.visible = !0;
    s.t = 0;
    s.seq = ++this._seq;
    if (!this.strokes.includes(s)) this.strokes.push(s);
  }
  // 刀光（池化，接口同 vfx.arc）：o = { color 笔芯, rim 五行外缘（不传 = 纯墨）, reverse, width, dur, y }
  slash(pos, dir, radius, angle, o = {}) {
    const it = this.slashes.find((x) => x.t >= x.dur) || this.slashes.reduce((a, b) => (a.seq < b.seq ? a : b));
    it.m.geometry = slashGeo(radius, angle, o.width ?? 0.35, !!o.reverse);
    it.m.position.set(pos.x, pos.y + (o.y ?? 0.9), pos.z);
    it.m.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    it.mat.uniforms.uColor.value.set(o.color ?? 0x15181b);
    it.mat.uniforms.uRim.value.set(o.rim ?? 0x15181b);
    it.mat.uniforms.uRimK.value = o.rim != null ? 1 : 0;
    it.mat.uniforms.uT.value = 0;
    it.t = 0;
    it.dur = o.dur ?? 0.28;
    it.seq = ++this._seq;
    it.m.visible = !0;
    this.stats.slashes++;
    this.lastSlash = { color: o.color ?? 0x15181b, rim: o.rim ?? null };
    return it;
  }
  // 月牙剑气（池化）：返回 { set(pos, k) 每帧移动（k = 已飞行比例）, end() 结束淡出 }。由 player.js 按剑气的判定位置驱动
  // color 笔芯，rim 五行外缘（null = 无）；池里两个都在用时复用最早的那个
  wave(pos, dir, color = 0xd2321e, rim = null) {
    const it = this.waves.find((x) => !x.busy && !x.fade) || this.waves.reduce((a, b) => (a.seq < b.seq ? a : b));
    const { m, mat } = it;
    it.busy = !0;
    it.fade = 0;
    it.t = 0;
    it.seq = ++this._seq;
    m.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    m.position.set(pos.x, pos.y + 0.9, pos.z);
    m.scale.setScalar(1);
    mat.uniforms.uColor.value.set(color);
    mat.uniforms.uRim.value.set(rim ?? color);
    mat.uniforms.uRimK.value = rim != null ? 1 : 0;
    mat.uniforms.uT.value = 0;
    m.visible = !0;
    this.stats.waves++;
    const seq = it.seq;
    return {
      set: (p, k) => {
        if (it.seq !== seq) return; // 已被新的剑气占用
        m.position.set(p.x, p.y + 0.9, p.z);
        m.scale.setScalar(1 + k * 0.45); // 越飞越开
        mat.uniforms.uT.value = Math.max(0, k - 0.3) * 0.5;
      },
      end: () => {
        if (it.seq !== seq) return;
        it.busy = !1;
        it.fade = 0.2;
        it.t = 0;
      },
    };
  }
  update(dt) {
    for (const gh of this.ghosts) {
      if (gh.t >= gh.dur) continue;
      gh.t += dt;
      const k = Math.min(1, gh.t / gh.dur);
      gh.g.traverse((o) => o.isMesh && o.material.opacity !== void 0 && (o.material.opacity = 0.45 * (1 - k)));
      if (k >= 1) gh.g.visible = !1;
    }
    for (const it of this.slashes) {
      if (it.t >= it.dur) continue;
      it.t += dt;
      it.mat.uniforms.uT.value = Math.min(1, it.t / it.dur);
      if (it.t >= it.dur) it.m.visible = !1;
    }
    for (const it of this.waves) {
      if (!it.fade) continue;
      it.t += dt;
      it.mat.uniforms.uT.value = Math.min(1, 0.35 + (it.t / it.fade) * 0.65);
      if (it.t >= it.fade) (it.fade = 0), (it.m.visible = !1);
    }
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      s.t += dt;
      s.m.material.uniforms.uT.value = Math.min(1, s.t / s.dur);
      if (s.t >= s.dur) {
        s.m.visible = !1;
        this.strokes.splice(i, 1);
      }
    }
  }
}
