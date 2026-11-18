// 炼丹火候小游戏（逻辑，模块 C）：按住鼠标 / 空格加火，松开降温；目标火候带缓缓游走。
// 结束时按"在带内的时间比例"评品：<40% 废丹，40–60 凡品，60–80 灵品，80–95 宝品，≥95 仙品（§11.5；叫法同 RARITY）。
//   const g = new FireGame({ time, band })
//   g.update(dt, heating) 每帧；g.done、g.ratio、g.grade、g.temp（0..1）、g.center（带中心）、g.band（带宽）
//   g.autopilot = true（调试：火候自动跟带）
import { gradeOf } from "./facilities.js";

export class FireGame {
  constructor({ time = 18, band = 0.2, seed = Math.random() * 100 } = {}) {
    this.time = time;
    this.band = Math.min(0.42, band);
    this.seed = seed;
    this.t = 0;
    this.temp = 0.12;
    this.vel = 0;
    this.inBand = 0;
    this.done = !1;
    this.autopilot = !1;
    this.center = this.centerAt(0);
  }
  // 火候带中心：开局在中段，随后缓慢游走，越到后段越活跃
  centerAt(t) {
    const s = this.seed, k = Math.min(1, t / this.time);
    return 0.5 + (0.16 + 0.08 * k) * Math.sin(t * 0.42 + s) + (0.05 + 0.05 * k) * Math.sin(t * 1.27 + s * 2.3);
  }
  get ratio() {
    return this.t > 0 ? this.inBand / this.t : 0;
  }
  get grade() {
    return gradeOf(this.ratio);
  }
  get inside() {
    return Math.abs(this.temp - this.center) <= this.band / 2;
  }
  update(dt, heating) {
    if (this.done) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.center = this.centerAt(this.t);
    if (this.autopilot) heating = this.temp + this.vel * 0.35 < this.center;
    // 火有惯性：加火时升温加速，撤火后余温还会再冲一下
    this.vel += (heating ? 1.15 : -0.95) * dt;
    this.vel *= Math.exp(-dt * 2.2);
    this.temp += this.vel * dt * 1.6;
    if (this.temp < 0) (this.temp = 0), (this.vel = Math.max(0, this.vel));
    if (this.temp > 1) (this.temp = 1), (this.vel = Math.min(0, this.vel));
    if (this.inside) this.inBand += dt;
    if (this.t >= this.time) this.done = !0;
  }
}
