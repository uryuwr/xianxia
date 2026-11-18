// 狼谷群狼（青牙召狼长嚎 / 啸月没被打断时）：从狼窝出生 → 下蹲 → 跃至主角周围的包围位（越过石柱，不走寻路）→ 按角色施压。
//   角色：harrier 扑咬逼走位；blocker 守在主角背离青牙一侧（卡退路），贴近才出爪；interrupter 主角施法 / 蓄势斩 / 读条时抢先扑咬。
//   节奏：青牙在预警 / 出招时，群狼不起手（错开节奏）；只有 interrupter 在主角读条 / 施法时例外。
//   狼威链接：所属狼窝的图腾倒下 → 失魂（攻击 / 移速下降、墨色变淡）。
// 由青牙控制器（qingya.js）生成并设置 ctrl.boss / ctrl.totem / ctrl.role / ctrl.leapTo(...)。
import * as THREE from "three";
import { QINGYA as Q } from "../../../data/bosses/qingya.js";
import { height } from "../../../world/terrain.js";
import { INKC } from "../../../fx/vfx.js";

export class PackWolfCtrl {
  constructor(enemy) {
    this.e = enemy;
    this.ctx = enemy.ctx;
    this.boss = null;
    this.totem = null;
    this.role = "harrier";
    this.slotA = 0; // 包围位的世界角（绕主角）
    this.leap = null;
    this.weak = !1;
    this.arrivedAt = null;
    this.t = 0;
  }
  // 出窝：下蹲 crouch 秒 → 弧线跃到 to（总时长 dur）
  leapTo(to, dur) {
    const e = this.e;
    this.leap = { from: e.pos.clone(), to: to.clone(), t: 0, crouch: Q.pack.leap.crouch, dur };
    e.state = "down"; // 不出招、不走 AI（照常受伤）；不用 setState 以免播倒地动画
    e.t = dur + 0.1;
    e.play("idle", 0.1);
  }
  update(dt) {
    const e = this.e, P = this.ctx.player;
    this.t += dt;
    if (this.leap) {
      const L = this.leap;
      L.t += dt;
      e.t = Math.max(e.t, 0.2);
      if (L.t >= L.crouch) {
        if (!L.jumped) (L.jumped = !0), e.play("attack_bite", 0.05, !0), this.ctx.vfx && this.ctx.vfx.burst(e.pos, { color: INKC.ink, count: 10, speed: 3, up: 2, y: 0.3 });
        const k = Math.min(1, (L.t - L.crouch) / Math.max(0.1, L.dur - L.crouch));
        e.root.position.lerpVectors(L.from, L.to, k);
        e.root.position.y = L.from.y + (L.to.y - L.from.y) * k + Q.pack.leap.h * 4 * k * (1 - k);
        e.wantYaw = Math.atan2(L.to.x - L.from.x, L.to.z - L.from.z);
        if (k >= 1) {
          this.leap = null;
          this.arrivedAt = this.t;
          this.landPos = e.pos.clone();
          e.state = "chase";
          e.t = 0;
          if (this.ctx.vfx) this.ctx.vfx.ring(e.pos, 1.4, { color: INKC.ink, dur: 0.4, width: 0.06 });
          this.ctx.world.events.emit("boss:packLand", { enemy: e, role: this.role });
        }
      }
      return;
    }
    // 守住包围位：每帧把绕圈角拉回自己的位（卡退路的那只守在主角背离青牙一侧）
    if (P && P.pos && e.state === "chase") {
      let a = this.slotA;
      if (this.role === "blocker" && this.boss && this.boss.alive) a = Math.atan2(P.pos.x - this.boss.pos.x, P.pos.z - this.boss.pos.z);
      e.orbitA = a;
      e.orbitR = Math.max(e.def.orbit[0], 3.0);
    }
    // 狼威链接：图腾倒下 → 失魂
    if (!this.weak && this.totem && !this.totem.alive) {
      this.weak = !0;
      const W = Q.pack.weak;
      e.entity.stats.addAll([{ stat: "atk", type: "pct", value: W.atk }, { stat: "move", type: "pct", value: W.move }], "qyLost");
      if (this.ctx.vfx) this.ctx.vfx.burst(e.pos, { color: 0x8a8d90, count: 12, speed: 2, up: 2, y: 0.8 });
    }
  }
  heroBusy() {
    const P = this.ctx.player, r = this.ctx.flow && this.ctx.flow.run;
    if (!P) return !1;
    return P.state === "cast" || (P.state === "attack" && P.combo === 3) || (r && r.channel) || P.chargeBuf > 0;
  }
  pickAttack(avail, dist) {
    if (this.leap) return null;
    const b = this.boss;
    const bossBusy = b && b.alive && (b.state === "windup" || b.state === "strike");
    if (this.role === "interrupter" && this.heroBusy()) return avail.find((a) => a.id === "bite") || avail[0] || null;
    if (bossBusy) return null; // 和青牙错开节奏
    if (this.role === "blocker") return dist < 2.4 ? avail.find((a) => a.id === "claw") || null : null;
    return avail.find((a) => a.id === "bite") || avail[0] || null;
  }
}
export const packWolfController = (e) => new PackWolfCtrl(e);
