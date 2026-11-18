// 五行护盾（v0.3 技能调整 ④：敌人逼你换手）
// 精英与首领出场时带一层五行护盾：护盾存在时本体不受伤害；
// 只有"克制"的五行能高效破盾（×3），其他五行只有 ×0.25，普攻等无属性伤害只有 ×0.15。
// 破盾后敌人眩晕并易伤一段时间——带什么法术出门、何时切换，取决于遇到的敌人。
//   五行相克：金克木、木克土、土克水、水克火、火克金
import * as THREE from "three";
import { INKC } from "../fx/vfx.js";

export const COUNTER = { wood: "metal", earth: "wood", water: "earth", fire: "water", metal: "fire" }; // 护盾五行 → 克制它的五行
export const EL_NAME = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };
export const EL_COLOR = { metal: 0xe8d9a0, wood: 0x3fae7a, water: 0x3f8fa8, fire: 0xd2321e, earth: 0xa5743a };

export const SHIELD_TUNE = {
  // 数值评审 v1（docs/review/numeric）：克制不再是唯一解，破盾时间更平滑
  frac: 0.4, // 护盾量 = 最大气血 × frac（敌人可用 shieldFrac 覆盖，如多段护盾的 Boss 每段 0.25）
  counter: 2, // 克制五行对护盾的倍率
  other: 0.2, // 其他五行
  physical: 0.25, // 无属性（普攻、法宝物理部分）
  imbue: 0.35, // 法剑附灵：普攻中带克制五行的比例
  breakStun: 2.5, // 破盾眩晕（秒）
  breakVuln: 0.3, // 破盾后易伤
  breakVulnDur: 6,
};

const _v = new THREE.Vector3();

export class Shields {
  constructor(ctx) {
    this.ctx = ctx;
    const ev = ctx.world.events;
    this.list = new Set();
    ev.on("spawn", ({ entity: e }) => {
      if (e.team === "enemy" && (e.tags.has("elite") || e.tags.has("boss")) && !e.tags.has("noShield")) this.give(e);
    });
    ev.on("beforeDamage", (info) => this.absorb(info));
    ev.on("kill", ({ target }) => this.drop(target));
  }
  // 给敌人一层护盾；element 不指定时随机
  give(e, element) {
    const els = Object.keys(COUNTER);
    const el = element || els[(Math.random() * els.length) | 0];
    const frac = e.shieldFrac ?? (e.owner && e.owner.def && e.owner.def.shieldFrac) ?? SHIELD_TUNE.frac;
    const max = Math.round(e.stats.get("hp") * frac);
    e.shield = { element: el, hp: max, max };
    this.list.add(e);
    // 首领（def.shieldLook === "outline"，如青牙 v2）不用半透明大球：外观由 src/fx/boss_look.js 画成五行色描边壳 + 脚下阵纹
    if (e.owner && e.owner.def && e.owner.def.shieldLook === "outline") return e.shield;
    // 外观：带五行颜色的墨圈护罩
    const r = Math.max(0.9, e.radius * 1.6), h = e.height || 1.4;
    const mat = new THREE.MeshBasicMaterial({ color: EL_COLOR[el], transparent: !0, opacity: 0.22, depthWrite: !1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    mesh.scale.set(r, h * 0.75, r);
    mesh.renderOrder = 26;
    this.ctx.scene.add(mesh);
    e.shield.mesh = mesh;
    return e.shield;
  }
  absorb(info) {
    const e = info.target, sh = e && e.shield;
    if (info.cancel || !sh || sh.hp <= 0) return; // 已被取消的伤害（如碧鳞潜水无敌）不打护盾
    const el = info.element;
    const T = SHIELD_TUNE, ctr = el === COUNTER[sh.element];
    let k = !el ? T.physical : ctr ? T.counter : T.other;
    // 附灵普攻：一部分按所附五行结算，其余按无属性
    if (el && info.tags && info.tags.includes("imbue")) k = T.physical * (1 - T.imbue) + (ctr ? T.counter : T.other) * T.imbue;
    // 五行符等可自带护盾倍率
    if (info.spec && info.spec.shieldMul != null) k *= info.spec.shieldMul;
    const dmg = Math.max(1, Math.round(info.amount * k));
    sh.hp -= dmg;
    info.shieldHit = { dmg, counter: ctr, element: sh.element };
    info.amount = 0; // 护盾存在时本体不掉血
    info.knock = 0;
    if (sh.hp <= 0) this.breakShield(e);
  }
  breakShield(e) {
    const sh = e.shield, w = this.ctx.world, vfx = this.ctx.vfx;
    sh.hp = 0;
    this.removeMesh(sh);
    w.applyStatus(e, "stun", { dur: SHIELD_TUNE.breakStun, src: w.player });
    e.stats.add({ stat: "vuln", type: "flat", value: SHIELD_TUNE.breakVuln, source: "shieldBreak" });
    e._vulnT = SHIELD_TUNE.breakVulnDur;
    vfx.burst(e.pos, { color: EL_COLOR[sh.element], count: 40, speed: 7, size: 0.28, up: 5 });
    vfx.ring(e.pos, 3, { color: EL_COLOR[sh.element], dur: 0.6, width: 0.1 });
    w.hitStop(0.1);
    this.ctx.rig && this.ctx.rig.shake && this.ctx.rig.shake(0.5);
    w.events.emit("shield:break", { target: e, element: sh.element });
    this.pop(e, "破盾");
  }
  removeMesh(sh) {
    if (!sh.mesh) return;
    this.ctx.scene.remove(sh.mesh);
    sh.mesh.geometry.dispose();
    sh.mesh.material.dispose();
    sh.mesh = null;
  }
  drop(e) {
    if (e.shield) this.removeMesh(e.shield);
    this.list.delete(e);
  }
  // 屏幕上的书法提示字
  pop(e, text) {
    const cam = this.ctx.camera;
    if (!cam) return;
    _v.set(e.pos.x, e.pos.y + (e.height || 1.4) + 0.6, e.pos.z).project(cam);
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `position:fixed;left:${(_v.x * 0.5 + 0.5) * innerWidth}px;top:${(-_v.y * 0.5 + 0.5) * innerHeight}px;transform:translate(-50%,-50%);font:900 40px "STKaiti","KaiTi","楷体",serif;color:#d2321e;text-shadow:0 0 3px #f4f1e8,0 0 10px #f4f1e8;pointer-events:none;z-index:40;transition:transform .7s ease-out,opacity .7s ease-in;`;
    document.body.appendChild(d);
    requestAnimationFrame(() => ((d.style.transform = "translate(-50%,-140%) scale(1.15)"), (d.style.opacity = "0")));
    setTimeout(() => d.remove(), 800);
  }
  update(dt) {
    const t = performance.now() / 1000;
    for (const e of this.list) {
      if (!e.alive) {
        this.drop(e);
        continue;
      }
      if (e._vulnT > 0 && (e._vulnT -= dt) <= 0) e.stats.removeSource("shieldBreak");
      const sh = e.shield;
      if (sh.mesh) {
        sh.mesh.position.set(e.pos.x, e.pos.y + (e.height || 1.4) * 0.5, e.pos.z);
        sh.mesh.material.opacity = 0.14 + 0.1 * (sh.hp / sh.max) + 0.04 * Math.sin(t * 4);
      }
      if (!sh.mesh && e._vulnT <= 0) this.list.delete(e);
    }
  }
}
