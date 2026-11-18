// 镜头：斜 45° 俯视的窄视角透视，平滑跟随主角。
// 滚轮拉近拉远；按住中键左右拖动可小幅旋转（默认朝向固定，保证构图与可读性）。
// 震屏：rig.shake(强度 0~1)，强度按平方衰减成位移抖动（打击、受击、爆炸用）。
import * as THREE from "three";

const DEG = Math.PI / 180;
const _ct = new THREE.Vector3();
export const VIEWS = {
  play: { follow: !0, dist: 30, pitch: 45, yaw: 0 },
  closeup: { follow: !0, dist: 13, pitch: 38, yaw: 0.15 },
  overview: { follow: !1, target: [0, 0, -6], dist: 110, pitch: 40, yaw: 0 },
  waterfall: { follow: !1, target: [8.5, 4.2, -8.5], dist: 24, pitch: 34, yaw: 0.45 },
  bamboo: { follow: !1, target: [-19, 3.6, -4], dist: 22, pitch: 40, yaw: -0.35 },
  pavilion: { follow: !1, target: [-3, 7.5, -21], dist: 26, pitch: 42, yaw: 0.25 },
  treasure: { follow: !1, target: [21, 3.4, -5], dist: 16, pitch: 40, yaw: -0.2 },
};

export class CameraRig {
  constructor(player) {
    this.player = player;
    this.cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 1200);
    this.target = new THREE.Vector3().copy(player.pos);
    this.dist = 30;
    this.pitch = 45 * DEG;
    this.yaw = 0;
    this.yawOff = 0;
    this.follow = !0;
    this.trauma = 0;
    this.shakeT = 0;
    this._off = new THREE.Vector3();
    this.set("play", !0);
    addEventListener("wheel", (e) => (this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.1), 10, 120)), { passive: !0 });
    let drag = !1, lx = 0;
    addEventListener("mousedown", (e) => e.button === 1 && ((drag = !0), (lx = e.clientX), e.preventDefault()));
    addEventListener("mouseup", (e) => e.button === 1 && (drag = !1));
    addEventListener("mousemove", (e) => {
      if (!drag) return;
      this.yawOff = THREE.MathUtils.clamp(this.yawOff - (e.clientX - lx) * 0.004, -0.6, 0.6);
      lx = e.clientX;
    });
  }
  set(name, snap = !1) {
    const v = VIEWS[name];
    if (!v) return !1;
    this.view = name;
    this.follow = v.follow;
    this.dist = v.dist;
    this.pitch = v.pitch * DEG;
    this.yaw = v.yaw;
    this.yawOff = 0;
    if (!v.follow) this.target.set(...v.target);
    if (snap || !v.follow) this.update(1, !0);
    return !0;
  }
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  // 演出镜头（首领入场 / 转阶段 / 处决，src/game/execution.js）：shot = { target: Vector3|[x,y,z], dist, pitch（度）, yaw（弧度，绝对）, blend（秒，缓入） }；
  //   cine(null) 缓出回到跟随镜头（blendOut 秒）。只改镜头参数，不画黑边（UI 画）；按真实时间插值，不受慢动作影响
  cine(shot, blendOut = 0.5) {
    if (!shot) {
      if (this._cine) this._cine.out = Math.max(0.05, blendOut);
      return;
    }
    const t = shot.target;
    const target = t && t.isVector3 ? t.clone() : new THREE.Vector3(...(t || [this.target.x, this.target.y, this.target.z]));
    const prev = this._cine;
    this._cine = { target, dist: shot.dist ?? this.dist, pitch: (shot.pitch ?? this.pitch / DEG) * DEG, yaw: shot.yaw ?? this.yaw + this.yawOff, blend: Math.max(0.05, shot.blend ?? 0.5), w: prev && !prev.out ? prev.w : 0, out: 0 };
  }
  get cineActive() {
    return !!this._cine;
  }
  // 镜头推近：amount 为距离缩短的比例（0.1 = 推近 10%），约 0.3 秒回弹（蓄势斩等重击用）
  kick(amount) {
    this.kickV = Math.min(0.25, Math.max(this.kickV || 0, amount));
  }
  update(dt, snap = !1) {
    if (this.follow) {
      const p = this.player.pos;
      const k = snap ? 1 : 1 - Math.exp(-dt * 5);
      this.target.x += (p.x - this.target.x) * k;
      this.target.z += (p.z - this.target.z) * k;
      this.target.y += (p.y + 0.9 - this.target.y) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    }
    let yaw = this.yaw + this.yawOff, pitch = this.pitch, baseDist = this.dist;
    const T = _ct.copy(this.target);
    const C = this._cine;
    if (C) {
      // 演出镜头：按真实时间缓入 / 缓出（smoothstep），与跟随镜头的参数插值
      const rdt = Math.min(0.1, (performance.now() - (this._cineAt || performance.now())) / 1000);
      C.w = C.out ? Math.max(0, C.w - rdt / C.out) : Math.min(1, C.w + rdt / C.blend);
      const w = C.w * C.w * (3 - 2 * C.w);
      T.lerp(C.target, w);
      baseDist += (C.dist - baseDist) * w;
      pitch += (C.pitch - pitch) * w;
      yaw += Math.atan2(Math.sin(C.yaw - yaw), Math.cos(C.yaw - yaw)) * w;
      if (C.out && C.w <= 0) this._cine = null;
    }
    this._cineAt = performance.now();
    const c = Math.cos(pitch);
    const kv = this.kickV || 0;
    if (kv > 0) this.kickV = Math.max(0, kv - dt * 0.4);
    const dist = baseDist * (1 - kv);
    this.cam.position.set(T.x + Math.sin(yaw) * c * dist, T.y + Math.sin(pitch) * dist, T.z + Math.cos(yaw) * c * dist);
    // 震屏：镜头与注视点一起平移，画面整体抖动而不改变角度
    this.shakeT += dt;
    const tr = this.trauma * this.trauma, amp = tr * this.dist * 0.012;
    const t = this.shakeT * 38;
    this._off.set(Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5, Math.sin(t * 1.7 + 1) * 0.6, Math.sin(t * 1.1 + 2) + Math.sin(t * 3.3) * 0.5).multiplyScalar(amp);
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
    this.cam.position.add(this._off);
    this.cam.lookAt(T.x + this._off.x, T.y + this._off.y, T.z + this._off.z);
    this.cam.updateMatrixWorld();
    this.player.camYaw = yaw;
  }
}
