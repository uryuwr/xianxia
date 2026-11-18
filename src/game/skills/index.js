// 构筑系统：法术（Q/E/R）、法宝（V）、阵法（T）、心法（被动）、丹药（1/2）、五行状态与相生反应、灵气拾取。
// 内容全部来自数据表：src/data/skills.js（法术、阵法）、src/data/items.js（法宝、心法、丹药、默认配置）。
// 与其他模块的关系：只通过 ctx.world（战斗核心）结算伤害与状态；主角若提供 player.cast(kind, dur) 则由它播放施法动作。
import * as THREE from "three";
import { SPELLS, FORMATIONS, REALMS } from "../../data/skills.js";
import { ARTIFACTS, XINFA, POTIONS, DEFAULT_LOADOUT } from "../../data/items.js";
import { makeEntity, Stats } from "../../core/combat.js";
import { SkillFx, orbMesh, vineMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { toon } from "../../render/materials.js";
import { installReactions, statusParticles } from "./statuses.js";
import { EFFECTS, updateProjectiles, updateZones } from "./effects.js";
import { EFFECTS_V2, installV2, updateV2 } from "./effects_v2.js";
import { zhongOf, ZHONG } from "../gongfa.js";

Object.assign(EFFECTS, EFFECTS_V2); // 功法体系 v2：凝锋诀 buff、藤引 grapple、止水诀 counter、火鸦 summon、地行术 blink
import { createArtifact } from "./artifacts.js";
import { placeFormation, updateFormations, removeFormation } from "./formations.js";
import { TRIGGERS } from "./xinfa.js";
import { installWeaponEffects } from "./weapon_effects.js";
import { SkillBar } from "../../ui/skillbar.js";
import { BuildPanel } from "../../ui/buildpanel.js";
import { Targeting } from "../targeting/index.js";

const SLOT_KEYS = ["KeyQ", "KeyE", "KeyR"];
const SLOT_NAMES = ["Q", "E", "R"];

export class SkillSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.fx = new SkillFx(ctx.scene, ctx.camera);
    this.fx.vineAt = (pos, r, dur) => {
      const m = vineMesh(r);
      m.position.copy(pos).setY(pos.y + 0.09);
      this.fx.add(m, dur, (it, k) => (m.material.opacity = Math.min(1, it.t * 5) * (1 - Math.max(0, k - 0.8) / 0.2) * 0.9));
    };
    this.loadout = { spells: [...DEFAULT_LOADOUT.spells], artifact: { ...DEFAULT_LOADOUT.artifact }, formation: DEFAULT_LOADOUT.formation, xinfa: [...DEFAULT_LOADOUT.xinfa] };
    this.realm = DEFAULT_LOADOUT.realm || "zhuji";
    this.cd = {};
    this.cdMax = {};
    this.cdSpeedBonus = 0;
    this.projectiles = [];
    this.zones = [];
    this.formations = [];
    this.timers = [];
    this.orbs = [];
    this.dummies = [];
    this.shield = { amount: 0, max: 1, t: 0 };
    this.hot = []; // 持续回复
    this.potions = POTIONS.map((p) => (p ? { def: p, count: p.count } : null));
    this.artifact = null;
    this.xinfaUnsub = {};
    this.powerLevel = 0;
    this.aimOverride = null; // 测试用：固定瞄准点
    this.stats = { casts: {}, reactions: {}, mpDenied: 0, mpSpent: 0 };
    this._shake = 0;
    this._dir = new THREE.Vector3();

    installReactions(this);
    this.weaponEffectsUnsub = installWeaponEffects(this); // 生命周期仅安装一次，装备属性同步后立即按新标记生效
    installV2(this); // 止水诀的受击钩子（要排在护体吸收之前：先化去，护体不掉）
    // 护体：吸收主角受到的伤害
    ctx.world.events.on("beforeDamage", (info) => {
      if (info.target !== this.hero || this.shield.amount <= 0) return;
      const a = Math.min(this.shield.amount, info.amount);
      this.shield.amount -= a;
      info.amount -= a;
      if (info.amount <= 0) info.cancel = !0;
      ctx.vfx.burst(this.hero.pos, { color: ELEM_COLOR.earth, count: 4, speed: 2, up: 1, size: 0.14 });
    });
    // 掉落的灵气：走过去拾取（只是回气血 / 真气的灵光；物品由出行局的地上战利品处理，带物品的掉落只有部分附带灵光）
    ctx.world.events.on("loot:drop", (ev) => {
      // 只有显式带 kind 的掉落才出回血 / 回气光球（用户要求：击杀敌人不给回复）
      if (!ev || !ev.pos || !ev.kind || ev.kind === "mp") return; // 真气不随拾取回复（只有丹药 / 紫金葫芦 / 聚灵阵）
      this.spawnOrb(ev.pos, ev.kind || (Math.random() < 0.6 ? "mp" : "hp"), ev.value);
    });

    this.ui = new SkillBar(this);
    this.panel = new BuildPanel(this);
    this.targeting = new Targeting(this); // 施法瞄准：先预览，确认后释放
    this.applyLoadout();
    window.__skills = this;
  }

  // ---------------- 访问器 ----------------
  get hero() {
    return this.ctx.player && this.ctx.player.entity;
  }
  spellAt(i) {
    return SPELLS[this.loadout.spells[i]] || null;
  }
  // 当前境界解锁的法术栏数量
  get slots() {
    return (REALMS.find((r) => r.id === this.realm) || REALMS[REALMS.length - 1]).slots;
  }
  slotLocked(i) {
    return i >= this.slots;
  }
  unlockText(i) {
    const r = REALMS.find((x) => x.slots > i);
    return r ? r.name + "解锁" : "";
  }
  setRealm(id) {
    this.realm = id;
    this.ui && this.ui.refresh && this.ui.refresh();
  }
  get artifactDef() {
    return ARTIFACTS[this.loadout.artifact.id] || null;
  }
  get formationDef() {
    return FORMATIONS[this.loadout.formation] || null;
  }

  // ---------------- 配置 ----------------
  setLoadout(patch) {
    Object.assign(this.loadout, patch);
    this.applyLoadout();
  }
  applyLoadout() {
    const h = this.hero;
    if (!h) return;
    const ratioHp = h.hp / h.stats.get("hp"), ratioMp = h.mp / h.stats.get("mp");
    // 法宝：被动属性 + 主动实例
    h.stats.removeSource("artifact");
    if (this.artifact) this.artifact.dispose();
    this.artifact = null;
    const a = this.artifactDef;
    if (a) {
      h.stats.addAll(a.passive(this.loadout.artifact.level), "artifact");
      this.artifact = createArtifact(this, a, this.loadout.artifact.level);
    }
    // 心法：属性 + 触发器。生效集合 = 心法栏 ∪ 装备特殊词条（标记属性 gx_<id>）；同名只算一次，不叠加
    const gear = this.gearXinfa();
    this._gearKey = gear.join(",");
    for (const id of Object.keys(XINFA)) {
      const on = this.loadout.xinfa.includes(id) || gear.includes(id);
      h.stats.removeSource("xinfa:" + id);
      if (this.xinfaUnsub[id] && !on) this.xinfaUnsub[id](), delete this.xinfaUnsub[id];
      if (!on) continue;
      const x = XINFA[id];
      if (x.mods) h.stats.addAll(x.mods, "xinfa:" + id);
      if (x.trigger && !this.xinfaUnsub[id]) this.xinfaUnsub[id] = TRIGGERS[x.trigger](this);
    }
    h.hp = Math.min(h.stats.get("hp"), Math.max(1, ratioHp * h.stats.get("hp")));
    h.mp = Math.min(h.stats.get("mp"), ratioMp * h.stats.get("mp"));
    this.ui && this.ui.refresh();
  }

  // 装备特殊词条带来的心法 id（gearStats 产出的标记属性 gx_<id>，见 src/game/loot.js）
  gearXinfa() {
    const h = this.hero;
    if (!h) return [];
    return Object.keys(XINFA).filter((id) => XINFA[id].affix && h.stats.get("gx_" + id) > 0);
  }
  // 当前生效的心法（心法栏 + 装备特殊词条，去重）
  activeXinfa() {
    return [...new Set([...this.loadout.xinfa, ...this.gearXinfa()])];
  }

  // ---------------- 瞄准 ----------------
  aim(range) {
    const h = this.hero, p = this.ctx.player;
    const origin = h.pos.clone();
    let point = (this.aimOverride || this.ctx.input.aim).clone();
    const dir = this._dir.set(point.x - origin.x, 0, point.z - origin.z);
    if (dir.lengthSq() < 0.01) {
      if (p && typeof p.aimDir === "function") p.aimDir(dir);
      else dir.set(Math.sin(p.yaw || 0), 0, Math.cos(p.yaw || 0));
    }
    dir.y = 0;
    dir.normalize();
    const d = Math.hypot(point.x - origin.x, point.z - origin.z);
    if (range && d > range) point.copy(origin).addScaledVector(dir, range);
    point.y = this.ctx.terrain.height(point.x, point.z);
    return { src: h, origin, dir: dir.clone(), point };
  }
  dirTo(a, b) {
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  }
  // 交给主角播放施法动作；主角不允许（例如正在闪身）则取消
  playerCast(kind, dur) {
    const p = this.ctx.player;
    if (p && typeof p.cast === "function") return p.cast(kind, dur) !== !1;
    return !0;
  }
  cdFor(base) {
    return base * (1 - Math.min(0.6, this.hero.stats.get("cdr")));
  }
  // 功法"重"（功法体系 v2，src/game/gongfa.js）：二重伤害 +、三重冷却 −；没有存档（旧沙盒）时一律一重
  zhong(id) {
    return zhongOf(this.ctx.profile, id);
  }
  zhongDmg(id) {
    return this.zhong(id) >= 2 ? 1 + ZHONG[2].dmg : 1;
  }
  startCd(key, base) {
    this.cd[key] = this.cdMax[key] = this.cdFor(base);
  }
  later(delay, fn) {
    this.timers.push({ t: delay, fn });
  }
  shake(v) {
    const rig = this.ctx.rig, fb = this.ctx.feedback;
    if (fb && typeof fb.shake === "function") fb.shake(v);
    else if (rig) this._shake = Math.max(this._shake, v);
  }

  // ---------------- 施放 ----------------
  castSpell(i) {
    const h = this.hero, sp = this.spellAt(i), key = SLOT_NAMES[i];
    if (!h || !h.alive || !sp) return !1;
    if (this.slotLocked(i)) return this.ui.flash(key, this.unlockText(i)), !1;
    if ((this.cd[key] || 0) > 0) return this.ui.flash(key, "冷却中"), !1;
    if (h.mp < sp.cost) return this.stats.mpDenied++, this.ui.flash(key, "真气不足"), !1;
    if (!this.playerCast(sp.castKind, sp.castTime)) return !1;
    h.mp -= sp.cost;
    this.stats.mpSpent += sp.cost;
    this.startCd(key, sp.cd * (this.zhong(sp.id) >= 3 ? 1 - ZHONG[3].cdr : 1));
    const cast = this.aim(sp.range);
    if (this.ctx.player && sp.effect.type !== "shield") this.ctx.player.yaw = Math.atan2(cast.dir.x, cast.dir.z);
    this.stats.casts[sp.id] = (this.stats.casts[sp.id] || 0) + 1;
    this.ctx.world.events.emit("skill:cast", { spell: sp, cast });
    this.later(sp.castTime || 0, () => {
      cast.origin.copy(h.pos);
      EFFECTS[sp.effect.type](this, sp, cast);
    });
    return !0;
  }
  useArtifact() {
    const h = this.hero, a = this.artifactDef;
    if (!h || !h.alive || !a || !this.artifact) return !1;
    if ((this.cd.artifact || 0) > 0) return this.ui.flash("artifact", "冷却中"), !1;
    if (h.mp < a.active.cost) return this.stats.mpDenied++, this.ui.flash("artifact", "真气不足"), !1;
    if (!this.playerCast("raise", 0.15)) return !1;
    const cast = this.aim(16);
    if (!this.artifact.active(cast)) return !1;
    h.mp -= a.active.cost;
    this.startCd("artifact", a.active.cd);
    this.stats.casts[a.id] = (this.stats.casts[a.id] || 0) + 1;
    this.ctx.world.events.emit("skill:artifact", { artifact: a, cast });
    return !0;
  }
  placeFormation() {
    const h = this.hero, f = this.formationDef;
    if (!h || !h.alive || !f) return !1;
    if ((this.cd.formation || 0) > 0) return this.ui.flash("formation", "冷却中"), !1;
    if (h.mp < f.cost) return this.stats.mpDenied++, this.ui.flash("formation", "真气不足"), !1;
    if (!this.playerCast("raise", 0.2)) return !1;
    const cast = this.aim(12);
    h.mp -= f.cost;
    this.startCd("formation", f.cd);
    placeFormation(this, f, cast.point);
    this.stats.casts[f.id] = (this.stats.casts[f.id] || 0) + 1;
    this.ctx.world.events.emit("skill:formation", { formation: f, pos: cast.point });
    return !0;
  }
  usePotion(i) {
    const po = this.potions[i], h = this.hero, key = "pot" + i;
    if (!po || !h || !h.alive) return !1;
    if (po.count <= 0) return this.ui.flash(key, "丹药已用尽"), !1;
    if ((this.cd[key] || 0) > 0) return this.ui.flash(key, "冷却中"), !1;
    po.count--;
    this.cd[key] = this.cdMax[key] = po.def.cd;
    if (po.def.mp) h.mp = Math.min(h.stats.get("mp"), h.mp + po.def.mp);
    if (po.def.hot) this.hot.push({ left: po.def.hotDur, rate: po.def.hot / po.def.hotDur });
    this.ctx.vfx.burst(h.pos, { color: po.def.mp ? ELEM_COLOR.water : ELEM_COLOR.wood, count: 12, speed: 1.5, up: 4, size: 0.16 });
    return !0;
  }

  // ---------------- 灵气球 ----------------
  spawnOrb(pos, kind = "mp", value) {
    const m = orbMesh(kind === "hp" ? 0x3fae7a : 0x3f8fa8);
    m.position.copy(pos);
    m.position.y = this.ctx.terrain.height(pos.x, pos.z) + 0.5;
    this.fx.root.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
    this.orbs.push({ mesh: m, kind, value: value ?? (kind === "hp" ? 8 : 10), t: 0, v });
  }
  updateOrbs(dt) {
    const h = this.hero;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i], p = o.mesh.position;
      o.t += dt;
      const gy = this.ctx.terrain.height(p.x, p.z) + 0.5;
      if (o.t < 0.5) {
        o.v.y -= 14 * dt;
        p.addScaledVector(o.v, dt);
        if (p.y < gy) p.y = gy;
      } else p.y = gy + Math.sin(o.t * 4) * 0.12;
      if (!h || !h.alive) continue;
      const dx = h.pos.x - p.x, dz = h.pos.z - p.z, d = Math.hypot(dx, dz);
      if (o.t > 0.4 && d < 3.5) (p.x += (dx / d) * Math.min(d, 10 * dt)), (p.z += (dz / d) * Math.min(d, 10 * dt));
      if (d < 0.7 || o.t > 30) {
        if (d < 0.7) {
          if (o.kind === "hp") this.ctx.world.heal(h, o.value, "orb");
          else h.mp = Math.min(h.stats.get("mp"), h.mp + o.value);
          this.ctx.vfx.burst(h.pos, { color: o.kind === "hp" ? 0x3fae7a : 0x3f8fa8, count: 6, speed: 1, up: 3, size: 0.12 });
        }
        this.fx.root.remove(o.mesh);
        this.orbs.splice(i, 1);
      }
    }
  }

  // ---------------- 木桩（调试 / 测试用的靶子） ----------------
  spawnDummy(pos, opts = {}) {
    const H = this.ctx.terrain.height;
    const p = new THREE.Vector3(pos.x, H(pos.x, pos.z), pos.z);
    const grp = new THREE.Group();
    const wood = toon({ color: 0x7a5a3c });
    const straw = toon({ color: 0xc8b27a });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.7, 8).translate(0, 0.85, 0), wood);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6).rotateZ(Math.PI / 2).translate(0, 1.2, 0), wood);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.7, 8).translate(0, 1.05, 0), straw);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.62, 0), straw);
    for (const m of [post, arm, body, head]) (m.castShadow = !0), grp.add(m);
    grp.position.copy(p);
    this.ctx.scene.add(grp);
    const e = makeEntity({
      team: "enemy", pos: p, radius: 0.45, height: 1.8, stats: new Stats({ hp: opts.hp || 600, def: 0, move: 0, atk: 0 }),
      tags: new Set(["dummy"]), mesh: grp, lastHit: 0, shakeT: 0,
    });
    e.onHit = () => ((e.lastHit = this.ctx.world.time), (e.shakeT = 0.25));
    e.onDeath = () => {
      grp.rotation.z = 1.2;
      this.later(1.5, () => {
        this.ctx.scene.remove(grp);
        this.ctx.world.remove(e);
        this.dummies.splice(this.dummies.indexOf(e), 1);
        if (opts.respawn !== !1) this.spawnDummy(pos, opts);
      });
      this.ctx.world.events.emit("loot:drop", { pos: e.pos.clone() });
    };
    this.ctx.world.add(e);
    this.dummies.push(e);
    return e;
  }
  updateDummies(dt) {
    for (const e of this.dummies) {
      if (!e.alive) continue;
      // 被吸走 / 推走时位置随实体
      e.mesh.position.set(e.pos.x, this.ctx.terrain.height(e.pos.x, e.pos.z), e.pos.z);
      e.pos.y = e.mesh.position.y;
      e.shakeT = Math.max(0, e.shakeT - dt);
      e.mesh.rotation.z = Math.sin(e.shakeT * 40) * e.shakeT * 0.5;
      const frozen = e.statuses.has("stun") || e.statuses.has("root");
      e.mesh.rotation.x = frozen ? Math.sin(this.ctx.world.time * 30) * 0.02 : 0;
      if (this.ctx.world.time - e.lastHit > 4) e.hp = e.stats.get("hp");
    }
  }

  // ---------------- 调试 ----------------
  debugAction(act) {
    const h = this.hero;
    if (!h) return;
    if (act === "power") {
      this.powerLevel += 10;
      h.stats.removeSource("debug:power");
      const L = this.powerLevel;
      h.stats.addAll([
        { stat: "atk", type: "flat", value: 4 * L }, { stat: "spell", type: "flat", value: 4 * L }, { stat: "hp", type: "flat", value: 20 * L },
        { stat: "mp", type: "flat", value: 5 * L }, { stat: "mpRegen", type: "flat", value: 0.3 * L }, { stat: "def", type: "flat", value: 2 * L },
      ], "debug:power");
    } else if (act === "unpower") {
      this.powerLevel = 0;
      h.stats.removeSource("debug:power");
    } else if (act === "dummy") {
      const c = h.pos;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        this.spawnDummy({ x: c.x + Math.cos(a) * 4, z: c.z + Math.sin(a) * 4 });
      }
    } else if (act === "full") {
      h.hp = h.stats.get("hp");
      h.mp = h.stats.get("mp");
      this.potions.forEach((p) => p && (p.count = p.def.count));
    } else if (act === "cd") this.cd = {};
    h.hp = Math.min(h.hp, h.stats.get("hp"));
    h.mp = Math.min(h.mp, h.stats.get("mp"));
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const h = this.hero, inp = this.ctx.input;
    if (!h) return;
    // 装备变化（换上 / 卸下带特殊词条的装备）后重新套用心法
    if ((this._gxT = (this._gxT || 0) - dt) <= 0) {
      this._gxT = 0.2;
      if (this.gearXinfa().join(",") !== (this._gearKey ?? "")) this.applyLoadout();
    }
    if (inp.pressed("Backquote")) this.panel.toggle();
    if (h.alive) {
      this.targeting.handleInput(); // Q/E/R、V 法宝、T 阵盘：进入瞄准 / 确认；右键蓄势斩（见 src/game/targeting）
      if (inp.pressed("Digit1")) this.usePotion(0);
      if (inp.pressed("Digit2")) this.usePotion(1);
    }
    // 冷却（聚灵阵内加速）
    const rate = 1 + this.cdSpeedBonus;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt * (k.startsWith("pot") ? 1 : rate));
    // 定时器
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if ((t.t -= dt) <= 0) {
        this.timers.splice(i, 1);
        try {
          t.fn();
        } catch (e) {
          console.error("[skills] timer", e);
        }
      }
    }
    // 持续回复、护体
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const o = this.hot[i], s = Math.min(dt, o.left);
      this.ctx.world.heal(h, o.rate * s, "pill");
      if ((o.left -= dt) <= 0) this.hot.splice(i, 1);
    }
    if (this.shield.amount > 0 && (this.shield.t -= dt) <= 0) this.shield.amount = 0;

    updateProjectiles(this, dt);
    updateZones(this, dt);
    updateV2(this, dt);
    updateFormations(this, dt);
    this.artifact && this.artifact.update(dt);
    statusParticles(this, dt);
    this.updateOrbs(dt);
    this.updateDummies(dt);
    this.fx.camera = this.ctx.camera;
    this.fx.update(dt);
    this.targeting.update(dt);
    this.ui.update(dt);
    this.panel.update(dt);
    // 没有反馈模块时的简易镜头震动
    if (this._shake > 0 && this.ctx.camera) {
      const s = this._shake;
      this.ctx.camera.position.x += (Math.random() - 0.5) * s * 0.4;
      this.ctx.camera.position.y += (Math.random() - 0.5) * s * 0.4;
      this._shake = Math.max(0, s - dt * 2.5);
    }
  }
}

export { removeFormation };
