// 主角：白衣散修。优先加载 Blender 导出的 assets/models/hero.glb，没有则用简易替身。
//
// 操作（输入来自 ctx.input）：WASD 八方向移动（相对镜头）、鼠标瞄准、左键普攻三连（按住连续出招）、空格闪身。
// 右键：蓄势斩（气势 ≥ 50 可放，半势按比例，满势"势成"完整演出；由 src/game/targeting 判断右键是不是在游戏画面上、是否在瞄准中）。
// 招式与身法参数全部在 src/data/player.js（MOVES / CHARGE / MOMENTUM / PLAYER.dash）；设计说明 docs/战斗_气势与身法_v1.md。
//
// ---- 给法术 / 法宝 / 阵法模块用的接口 ----
//   player.entity              战斗实体（team "player"，stats / hp / mp 都在这里）
//   player.pos                 脚底位置（Vector3，与 entity.pos 是同一个对象）
//   player.facing              当前朝向（水平单位向量，只读）
//   player.aimDir(out?)        → 水平单位向量，从主角指向鼠标落点（鼠标在脚下时退回到 facing）
//   player.aimPoint            鼠标在地面上的落点（Vector3，只读）
//   player.cast(kind, dur?)    施法手势：kind = "point"（单手前刺，投射类）| "sweep"（横扫，扇形类）| "raise"（擎剑，布阵 / 召唤 / 增益）
//                              立即转向瞄准方向、播放对应动作、在 dur 秒内锁定移动；返回 true 表示允许施放。
//                              闪身中、死亡、普攻前半段（cancelFrom 之前）返回 false。dur 缺省用 CASTS 表里的时长。
//   player.busy                是否处于招式 / 闪身 / 施法 / 受击 / 死亡中（不能自由移动）
//   player.state               "move" | "attack" | "dash" | "cast" | "hit" | "dead"
//   player.dashCharges / dashMax 闪身充能（dashMax 来自属性 dashMax：境界 + 心法 / 词条）
//   player.dashCdK              正在恢复的那次充能的进度 0~1（充满时为 1，HUD 墨晕扫过用）
//   player.dashRecharge()       当前每次充能的恢复时间（秒，属性 dashCd × (1 − dashCdr)）
//   player.momentum / momentumMax / momentumFull   气势（普攻命中积攒；满 = 势成，锁定不流失）
//   player.momentumReady        气势 ≥ 50，可以放蓄势斩
//   player.tryCharge()          右键：放蓄势斩（气势不足返回 false 并发 player:chargeDenied；出招中先缓存，到可取消时放出）
//   player.addMomentum(n)       增加气势（受"气势获取"加成）
//   player.chainStacks          心法《连环》层数
//   player.debug.god           无敌开关（测试用）
// ---- 事件（ctx.world.events）----
//   "player:attack"        { step, hits, charge? }  普攻出伤时（蓄势斩 step = 4、charge = true）
//   "player:charge"        { hits, wave, full, momentum }  蓄势斩出伤（wave：月牙剑气对象；full：满势）
//   "player:chargeDenied"  { momentum }          气势不足 50 时按了右键
//   "player:chargeReady"   {}                    气势刚满
//   "player:dashDenied"    {}                    闪身冷却中按了闪身
//   "player:swordFly"      { from, to }          御剑掠过深水 / 崖（筑基）
//   "player:swordFlyDenied" { reason }           筑基前在深水边按闪身 / 往水里走（"水深难渡"提示）
//   "player:dash"          { from, to }
//   "player:perfectDodge"  { attacker }
//   "player:cast"          { kind }
//   "player:respawn"       {}
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toon, outlineMaterial } from "../render/materials.js";
import { height, moveScale, activeLevel, isDeepWater } from "../world/terrain.js";
import { assetURL, isEmbedded } from "../core/assets.js";
import { makeEntity, Stats } from "../core/combat.js";
import { PLAYER, MOVES, CASTS, CHARGE, MOMENTUM, MOM_XINFA } from "../data/player.js";
import { INKC } from "../fx/vfx.js";
import { PlayerFX, ELEM_LOOK } from "../fx/player_fx.js";

// 角色材质：按 Blender 里的材质名映射到卡通水墨材质。白衣、黑发、墨色靴，朱砂红发带与剑穗是全身唯一的亮色
const PALETTE = {
  robe_white: { color: 0xf2efe6 },
  robe_inner: { color: 0xc9c6bc },
  sash_dark: { color: 0x2d3033 },
  skin: { color: 0xe6d6c2 },
  hair_black: { color: 0x1b1d1f },
  ribbon_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 },
  boots_black: { color: 0x202224 },
  sword_steel: { color: 0xd8dde0 },
  sword_hilt: { color: 0x3a3430 },
  tassel_red: { color: 0xd2321e, emissive: 0x5a0d05, emissiveIntensity: 0.6 },
};
const matCache = {};
function heroMat(name) {
  const key = Object.keys(PALETTE).find((k) => name && name.toLowerCase().startsWith(k)) || "robe_white";
  return (matCache[key] = matCache[key] || toon({ ...PALETTE[key], side: THREE.DoubleSide }));
}

function placeholder() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10).translate(0, 0.78, 0), heroMat("robe_white"));
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10, 1, !0).translate(0, 0.45, 0), heroMat("robe_white"));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10).translate(0, 1.55, 0), heroMat("skin"));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.58, -0.01), heroMat("hair_black"));
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.55).translate(0, -0.27, 0), heroMat("ribbon_red"));
  ribbon.position.set(0.03, 1.72, -0.1);
  ribbon.rotation.x = 0.4;
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.95, 0.012).translate(0, 0.5, 0), heroMat("sword_steel"));
  sword.position.set(0.32, 0.95, 0.05);
  sword.rotation.set(0.5, 0, 2.6);
  for (const m of [body, robe, head, hair, ribbon, sword]) (m.castShadow = !0), g.add(m);
  return g;
}

// 给每个网格加一层反向外扩的墨色描边壳（蒙皮网格共享骨骼）
function addOutlines(root) {
  const list = [];
  root.traverse((o) => o.isMesh && !o.userData.isOutline && list.push(o));
  const om = outlineMaterial(0.018);
  for (const m of list) {
    let o;
    if (m.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(m.geometry, om);
      o.bind(m.skeleton, m.bindMatrix);
    } else o = new THREE.Mesh(m.geometry, om);
    o.position.copy(m.position);
    o.quaternion.copy(m.quaternion);
    o.scale.copy(m.scale);
    o.userData.isOutline = !0;
    o.frustumCulled = !1;
    m.parent.add(o);
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _fd = new THREE.Vector3();
const CHARGE_STEP = MOVES.length; // 蓄势斩用的招式序号（不在普攻连段里，右键单独放出）
const now = () => performance.now() / 1000;

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.colliders = ctx.colliders;
    this.root = new THREE.Group();
    this.root.name = "player";
    ctx.scene.add(this.root);
    this.pos = this.root.position;
    this.yaw = 0;
    this.camYaw = 0; // 由镜头写入
    this.vel = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.aimPoint = ctx.input ? ctx.input.aim : new THREE.Vector3();
    this.mixer = null;
    this.actions = {};
    this.cur = null;
    this.model = null;
    this.fx = new PlayerFX(ctx.scene);
    this.debug = { god: !1 };

    this.state = "move";
    this.stateT = 0; // 当前状态已进行的时间
    this.stateDur = 0;
    this.combo = 0; // 当前 / 上一段普攻序号 0..2
    this.comboIdle = 9; // 距离上一段普攻结束的时间
    this.queued = !1;
    this.hitDone = !1;
    this.dashMax = PLAYER.dash.charges;
    this.dashCharges = this.dashMax;
    this.dashRegen = 0;
    this._dashStat = this.dashMax; // 上次从属性读到的充能数（直接改 dashMax 的测试覆盖会保留到属性变化为止）
    this._denyT = 0;
    // 气势与蓄势斩
    this.momentum = 0;
    this.momT = 9; // 距离上次获得气势的时间
    this.chainStacks = 0; // 心法《连环》
    this.chainT = 0;
    this.chargeBuf = 0; // 右键缓存（出招 / 施法 / 闪身中按下，到可取消时放出）
    this.chargeM = 0; // 本次蓄势斩起手时的气势
    this.waves = []; // 飞行中的月牙剑气
    this.later = []; // 延时效果（余波）
    this._haste = !1;
    // 附灵（法剑词条 / 碧鳞五行坛）：this.imbue = { el, src: "sword" | "shrine", left, dur } | null，每帧刷新
    this.imbue = null;
    this.shrineUntil = 0;
    this.shrineDur = 15;
    this._imbK = 0;
    this._imbCol = new THREE.Color();
    this._elemPopT = 0;
    this.dash = null;
    this.invulnUntil = 0; // 闪身无敌（真实时间）
    this.hurtUntil = 0; // 受击后无敌
    this.perfectUntil = 0; // 完美闪身加成有效期
    this.slowUntil = 0;
    this.deadT = 0;
    this.knock = null;

    this.spawn(...PLAYER.spawn);
    // 战斗实体（与 this.pos 共用同一个坐标对象）
    this.entity = ctx.world.add(
      makeEntity({ team: "player", pos: this.pos, radius: PLAYER.radius, height: PLAYER.height, stats: new Stats({ ...PLAYER.stats, dashMax: PLAYER.dash.charges, dashCd: PLAYER.dash.recharge }), owner: this }),
    );

    const ev = ctx.world.events;
    // 无敌帧：闪身 / 受击后 / 无敌开关 时取消伤害；闪身中被取消即"完美闪身"
    ev.on("beforeDamage", (info) => {
      if (info.target !== this.entity) return;
      const t = now();
      if (this.debug.god || this.state === "dead") return void (info.cancel = !0);
      if (t < this.invulnUntil) {
        info.cancel = !0;
        if (this.dash && !this.dash.perfect) this.perfectDodge(info.attacker);
        return;
      }
      if (t < this.hurtUntil) info.cancel = !0;
    });
    ev.on("damage", (info) => info.target === this.entity && this.onHurt(info));
    ev.on("kill", (info) => info.target === this.entity && this.onDeath());
    ev.on("shield:break", () => this.addMomentum(MOMENTUM.shieldBreak, !0)); // 破盾加气势（"破盾 → 蓄势斩"连段奖励）
    // 气势不随时间流失；出局（撤离 / 身陨 / 放弃）与新一局开始时清零
    const reset = () => ((this.momentum = 0), (this.chainStacks = 0), (this.chargeBuf = 0));
    ev.on("run:start", reset);
    ev.on("run:end", reset);
    ev.on("boss:shrine", (e) => ((this.shrineDur = (e && e.dur) || 15), (this.shrineUntil = ctx.world.time + this.shrineDur)));
  }

  spawn(x, z) {
    this.spawnAt = [x, z];
    this.pos.set(x, height(x, z), z);
  }

  async load(url = "/assets/models/hero.glb") {
    let model = null;
    try {
      const head = isEmbedded(url) ? null : await fetch(url, { method: "HEAD" });
      if (!head || (head.ok && (head.headers.get("content-type") || "").indexOf("html") < 0)) {
        const gltf = await new GLTFLoader().loadAsync(assetURL(url));
        model = gltf.scene;
        model.traverse((o) => {
          if (o.isMesh) {
            o.material = heroMat(o.material && o.material.name);
            o.castShadow = !0;
            o.receiveShadow = !0;
            o.frustumCulled = !1;
          }
        });
        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model);
          for (const clip of gltf.animations) this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
        }
        this.source = "hero.glb";
      }
    } catch (err) {
      console.warn("[player] hero.glb 加载失败，使用替身", err);
    }
    if (!model) {
      model = placeholder();
      this.source = "placeholder";
    }
    addOutlines(model);
    this.model = model;
    this.root.add(model);
    if (this.mixer) this.fx.init(model);
    // 附灵时变色的部位：剑身（五行色流光）与剑穗（换成五行色）。材质按名字共享，记下原色
    this.swordBone = model.getObjectByName("sword") || null; // 剑骨骼：附灵时从剑上飘出五行色微光
    this.imbueMats = ["sword_steel", "tassel_red"].map((k) => matCache[k]).filter(Boolean).map((m) => ({ m, color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity }));
    this.play("idle", 0);
    return this.source;
  }

  // ---------------- 动画 ----------------
  play(name, fade = 0.15, once = !1, dur = 0) {
    const a = this.actions[name];
    if (!a) return !1;
    if (a === this.cur && !once) return !0;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    // 指定时长时调整播放速度，让动作与招式时长一致（攻速提升时动作也变快）
    a.timeScale = dur > 0 ? a.getClip().duration / dur : 1;
    a.enabled = !0;
    a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, !1);
    a.play();
    this.cur = a;
    return !0;
  }

  // ---------------- 对外接口 ----------------
  get busy() {
    return this.state !== "move";
  }
  aimDir(out = new THREE.Vector3()) {
    out.set(this.aimPoint.x - this.pos.x, 0, this.aimPoint.z - this.pos.z);
    const l = out.length();
    return l > 0.25 ? out.multiplyScalar(1 / l) : out.copy(this.facing);
  }
  faceDir(d, instant = !0) {
    if (d.lengthSq() < 1e-6) return;
    this.facing.set(d.x, 0, d.z).normalize();
    if (instant) this.yaw = Math.atan2(this.facing.x, this.facing.z);
  }
  cast(kind, dur) {
    const c = CASTS[kind];
    if (!c || this.state === "dead" || this.state === "dash" || this.state === "leap") return !1;
    if (this.state === "attack" && this.stateT < this.moveTimes().cancelFrom) return !1;
    const d = dur ?? c.dur;
    this.faceDir(this.aimDir(_a));
    this.setState("cast", d);
    this.vel.set(0, 0, 0);
    this.play(c.anim, 0.08, !0, Math.max(d, 0.25));
    this.ctx.world.events.emit("player:cast", { kind });
    return !0;
  }

  // ---------------- 状态 ----------------
  setState(s, dur = 0) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
  }
  // 演出（首领入场 / 处决，src/game/execution.js）：dur 秒内不接受输入、无敌；anim 可选（缺动画时不播）
  cinematic(dur, anim = null, animDur = 0) {
    if (this.state === "dead") return !1;
    this.root.visible = !0; // 地行术遁地中被演出打断
    this.dash = null;
    this.leap = null;
    this.knock = null;
    this.queued = !1;
    this.chargeBuf = 0;
    this.vel.set(0, 0, 0);
    this.invulnUntil = Math.max(this.invulnUntil, now() + dur);
    this.setState("cine", dur);
    if (anim) this.play(anim, 0.08, !0, animDur);
    else this.play("idle", 0.2);
    return !0;
  }
  endCinematic() {
    if (this.state === "cine") this.setState("move");
  }
  aspd() {
    return Math.max(0.3, this.entity.stats.get("aspd"));
  }
  // 当前招式（0~2 普攻三段，3 蓄势斩）
  move() {
    return this.combo === CHARGE_STEP ? CHARGE : MOVES[this.combo];
  }
  // 当前招式按攻速缩放后的时间点
  moveTimes() {
    const m = this.move(), k = 1 / this.aspd();
    return { dur: m.dur * k, hitTime: m.hitTime * k, queueFrom: m.queueFrom * k, cancelFrom: m.cancelFrom * k };
  }

  startAttack() {
    const chain = this.state === "attack" || this.comboIdle < PLAYER.comboReset;
    // 三段循环；蓄势斩之后从第一段重新开始（蓄势斩只由右键放出，不会自动接）
    this.combo = chain && this.combo < MOVES.length - 1 ? this.combo + 1 : 0;
    const m = this.move();
    const tm = this.moveTimes();
    this.faceDir(this.aimDir(_a));
    this.assist();
    this.setState("attack", tm.dur);
    this.queued = !1;
    this.hitDone = !1;
    this.play(m.anim, 0.06, !0, tm.dur);
  }

  // ---------------- 蓄势斩（右键） ----------------
  get momentumReady() {
    return this.momentum >= MOMENTUM.minCharge - 1e-6;
  }
  // 右键：气势 ≥ 50 → 放出（出招 / 施法 / 闪身中先缓存 CHARGE.buffer 秒）；不足 → 不出招，发 player:chargeDenied
  tryCharge() {
    if (this.state === "dead") return !1;
    if (!this.momentumReady) {
      this.ctx.world.events.emit("player:chargeDenied", { momentum: this.momentum });
      return !1;
    }
    if (this.state === "attack" && this.combo === CHARGE_STEP) return !0; // 已经在放
    this.chargeBuf = CHARGE.buffer;
    if (this.canStartCharge()) this.startCharge();
    return !0;
  }
  canStartCharge() {
    if (this.state === "move" || this.state === "hit") return !0;
    if (this.state === "attack") return this.combo !== CHARGE_STEP && this.hitDone && this.stateT >= this.moveTimes().cancelFrom;
    return !1; // 闪身 / 跃涧 / 施法中：等结束
  }
  startCharge() {
    this.chargeBuf = 0;
    this.chargeM = this.momentum;
    this.combo = CHARGE_STEP;
    const tm = this.moveTimes();
    this.faceDir(this.aimDir(_a));
    this.assist();
    this.setState("attack", tm.dur);
    this.queued = !1;
    this.hitDone = !1;
    this.play(CHARGE.anim, 0.06, !0, tm.dur);
    this.chargeWindup(tm);
  }

  // ---------------- 气势 ----------------
  get momentumMax() {
    return MOMENTUM.max;
  }
  get momentumFull() {
    return this.momentum >= MOMENTUM.max - 1e-6;
  }
  // raw：不吃"气势获取"加成（破盾奖励）
  addMomentum(n, raw = !1) {
    if (!(n > 0) || this.state === "dead") return 0;
    const was = this.momentumFull, before = this.momentum;
    this.momentum = Math.min(MOMENTUM.max, this.momentum + n * (raw ? 1 : 1 + Math.max(0, this.entity.stats.get("momGain"))));
    this.momT = 0;
    if (!was && this.momentumFull) {
      const v = this.ctx.vfx;
      if (v) (v.ring(this.pos, 1.3, { color: INKC.gold, dur: 0.45, width: 0.08 }), v.burst(this.pos, { color: INKC.gold, count: 10, speed: 2.5, up: 4, y: 1.2 }));
      this.ctx.world.events.emit("player:chargeReady", {});
    }
    return this.momentum - before;
  }
  // 注意：伤害加成不能写成 Stats 的 { stat: "dmg", type: "more" }——dmg 基础值是 0，"more" 乘 0 等于没加（v1.2 复核时发现）。
  // 普攻 / 蓄势斩的各项加成（完美闪身、连环、蓄势斩伤害、破盾易伤）一律直接乘进 spec.scale（独立乘区）。
  // 蓄势斩起手：金墨聚于剑身（半势只有一半的墨点、没有残影）
  chargeWindup(tm) {
    const v = this.ctx.vfx, full = this.chargeM >= MOMENTUM.max - 1e-6;
    if (v) {
      v.ring(this.pos, full ? 2.0 : 1.6, { color: INKC.gold, dur: tm.hitTime, width: 0.07 });
      v.burst(this.pos, { color: INKC.gold, count: full ? 12 : 6, speed: 1.6, up: 5, y: 1.3, size: 0.14 });
    }
    if (full) this.fx.ghost(this.root);
    this.ctx.rig && this.ctx.rig.shake(full ? 0.08 : 0.04);
  }
  // 自动吸附：瞄准方向 ±cone 内、range 内最近的敌人
  assist() {
    const w = this.ctx.world, A = PLAYER.assist;
    let best = null, bd = 1e9;
    for (const e of w.entities) {
      if (!e.alive || e.team === "player") continue;
      _b.set(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z);
      const d = _b.length();
      if (d > A.range + e.radius || d < 0.01) continue;
      if (_b.dot(this.facing) / d < Math.cos(A.cone)) continue;
      if (d < bd) (bd = d), (best = _b.clone().multiplyScalar(1 / d));
    }
    if (best) this.faceDir(best);
    return best;
  }
  // 法剑附灵（装备词条 imbue_<五行>）：普攻带该五行，对护盾按 SHIELD_TUNE.imbue 的比例结算
  imbueElement() {
    const st = this.entity.stats;
    // 碧鳞五行坛给的临时附灵优先于法剑本身的附灵
    const sh = st.mods.find((m) => m.source === "shrine" && String(m.stat).startsWith("imbue_") && m.value > 0);
    if (sh) return sh.stat.slice(6);
    for (const el of ["metal", "wood", "water", "fire", "earth"]) if (st.get("imbue_" + el) > 0) return el;
    return null;
  }
  doHit() {
    if (this.combo === CHARGE_STEP) return this.doCharge();
    const m = MOVES[this.combo], w = this.ctx.world, st = this.entity.stats;
    this.hitDone = !0;
    this.assist();
    const targets = w.queryArc(this.pos, this.facing, m.radius, m.halfAngle, w.enemiesOf("player"));
    const bonus = now() < this.perfectUntil;
    let hits = 0, crit = !1, big = !1;
    const imbue = this.imbueElement();
    const chainOn = st.get("mom_chain") > 0;
    // 独立乘区：完美闪身后的下一击 ×1.5、《连环》每层 +4%
    const mul = (bonus ? 1 + PLAYER.dash.perfectBonus : 1) * (chainOn ? 1 + MOM_XINFA.chainPer * this.chainStacks : 1);
    for (const t of targets) {
      const dir = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
      const info = w.dealDamage(this.entity, t, { scale: { atk: m.scale * mul }, knock: m.knock, dir, element: imbue || undefined, tags: imbue ? ["melee", "basic", "imbue", "step" + (this.combo + 1)] : ["melee", "basic", "step" + (this.combo + 1)] });
      if (info) (hits++, (crit = crit || info.crit), (big = big || (!!t.tags && (t.tags.has("elite") || t.tags.has("boss")))));
    }
    // 气势：每次挥砍只结算一次（段数基础 + 多目标 + 暴击）；打中精英 / 首领 × MOMENTUM.eliteMul（打在护盾上照常获取）
    if (hits) {
      const M = MOMENTUM;
      this.addMomentum((M.gain[this.combo] + Math.min(M.perTargetMax, M.perTarget * (hits - 1)) + (crit ? M.crit : 0)) * (big ? M.eliteMul : 1));
      if (chainOn) (this.chainStacks = Math.min(MOM_XINFA.chainMax, this.chainStacks + 1)), (this.chainT = MOM_XINFA.chainDur);
    }
    if (bonus && hits) this.perfectUntil = 0;
    // 刀光（池化）：墨色笔触为底；附灵时外缘五行色，第三段（原朱色）笔芯改为五行深调
    const red = m.arc.color === "red", L = imbue && ELEM_LOOK[imbue];
    this.fx.slash(this.pos, this.facing, m.radius * 0.85, m.arc.angle, { color: red ? (L ? L.deep : INKC.red) : INKC.ink, rim: L ? L.rim : null, reverse: m.arc.reverse, dur: 0.26, width: red ? 0.5 : 0.36 });
    if (L && hits) this.imbueHitFx(targets, L);
    if (hits) {
      w.hitStop(m.hitStop);
      this.ctx.rig && this.ctx.rig.shake(m.shake);
    }
    w.events.emit("player:attack", { step: this.combo + 1, hits });
  }

  // 蓄势斩：大范围横扫 + 向前推进的月牙剑气；消耗全部气势。半势（50~99）按比例缩小伤害 / 范围 / 剑气距离，演出从简
  doCharge() {
    const C = CHARGE, w = this.ctx.world, st = this.entity.stats;
    const M = this.chargeM || this.momentum, full = M >= MOMENTUM.max - 1e-6, PT = C.partial;
    const t = Math.max(0, Math.min(1, (M - MOMENTUM.minCharge) / (MOMENTUM.max - MOMENTUM.minCharge)));
    const dk = full ? 1 : PT.dmg[0] + PT.dmg[1] * t, rk = full ? 1 : PT.radius[0] + PT.radius[1] * t, wk = full ? 1 : PT.wave[0] + PT.wave[1] * t;
    const radius = C.radius * rk;
    this.hitDone = !0;
    this.assist();
    const targets = w.queryArc(this.pos, this.facing, radius, C.halfAngle, w.enemiesOf("player"));
    const imbue = this.imbueElement();
    const perfect = now() < this.perfectUntil;
    const chain = st.get("mom_chain") > 0 ? this.chainStacks : 0;
    // 伤害加成（独立乘区，剑气与余波沿用同一份）：半势比例 × 蓄势斩伤害（词条 / 《蓄势》）× 完美闪身 × 《连环》层数
    const k = dk * (1 + Math.max(0, st.get("chargeDmg"))) * (perfect ? 1 + PLAYER.dash.perfectBonus : 1) * (chain ? 1 + (MOM_XINFA.chainPer + MOM_XINFA.chainCharge) * chain : 1);
    const tags = ["melee", "basic", "charge", ...(imbue ? ["imbue"] : [])];
    // 先清零气势：本刀剑意破盾时的"破盾 +气势"留给下一刀
    this.momentum = 0;
    this.momT = 0;
    this.chainStacks = 0;
    // 本次蓄势斩的共享上下文：剑意破盾 / 控制对每个敌人只结算一次（横扫、剑气、余波共用）
    const cc = { full, M, cut: new Set(), stag: new Set(), id: (this._chargeId = (this._chargeId || 0) + 1) };
    let hits = 0;
    for (const t of targets) {
      const dir = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
      if (this.chargeHit(t, { base: C.base * k, scale: { atk: C.scale * k }, knock: C.knock * (full ? 1 : 0.7), dir, element: imbue || undefined, shieldMul: C.shieldMul, tags }, cc)) hits++;
    }
    if (perfect && hits) this.perfectUntil = 0;
    // 月牙剑气（池化）：未附灵朱红；附灵时笔芯五行深调、外缘五行色
    const L = imbue && ELEM_LOOK[imbue];
    const col = L ? L.rim : INKC.red, core = L ? L.deep : INKC.red;
    const wave = { from: this.pos.clone(), dir: this.facing.clone(), dist: 0, range: C.wave.range * wk, k, full, cc, hit: new Set(), hits: 0, imbue, tags: [...tags, "wave"], color: col, mesh: this.fx.wave(this.pos, this.facing, core, L ? L.rim : null) };
    this.waves.push(wave);
    // 刀光：一道朱红（附灵：五行深调 + 五行外缘）大弧 + 一道淡墨外弧
    this.fx.slash(this.pos, this.facing, radius * 0.9, C.arc.angle, { color: core, rim: L ? L.rim : null, dur: 0.34, width: full ? 0.75 : 0.55 });
    if (full) this.fx.slash(this.pos, this.facing, radius * 1.02, C.arc.angle * 0.9, { color: INKC.ink, rim: L ? L.rim : null, reverse: !0, dur: 0.4, width: 0.3, y: 1.1 });
    const v = this.ctx.vfx;
    if (v) {
      v.ring(this.pos, radius, { color: INKC.ink, dur: 0.4, width: 0.025 });
      v.burst(this.pos.clone().addScaledVector(this.facing, 1.6), { color: L ? L.rim : INKC.gold, count: full ? 18 : 9, speed: 6, up: 3 });
    }
    if (L && hits) this.imbueHitFx(targets, L);
    // 演出：满势有顿帧 + 慢动作 + 镜头推近（"斩"字由 HUD 按 full 画）；半势只有轻顿帧和轻震屏
    const rig = this.ctx.rig;
    if (rig) (rig.shake((full ? C.shake : PT.shake) * (hits ? 1 : 0.5)), full && rig.kick && rig.kick(C.punch));
    if (hits) {
      w.hitStop(full ? C.hitStop : PT.hitStop);
      if (full) (this.slowUntil = now() + C.slowmo[1]), (w.timeScale = C.slowmo[0]);
      if (st.get("mom_return") > 0 && this.dashCharges < this.dashMax) this.dashCharges++; // 心法《回锋》
    }
    this.lastCharge = { hits, targets: targets.length, t: w.time, full, momentum: M, k: dk, mul: k, radius, range: wave.range };
    w.events.emit("player:attack", { step: CHARGE_STEP + 1, hits, charge: !0, full });
    w.events.emit("player:charge", { hits, wave, full, momentum: M });
  }
  // 蓄势斩的一次出伤（横扫 / 剑气 / 余波共用）：
  //   ① 剑意破盾：带护盾的敌人先按护盾上限削去一截（不看五行；精英 35% / 首领每段 20%；半势 × 气势/100；每刀每敌一次）
  //   ② 结算伤害：目标处于破盾易伤（shields.js 的 _vulnT）时再 ×(1 + CHARGE.vulnBonus)（独立乘区，标签加 "vulnBonus"）
  //   ③ 控制：满势 小怪眩晕 / 精英打断 / 首领打断（8 秒一次）；半势只让小怪短暂硬直
  chargeHit(t, spec, cc) {
    const w = this.ctx.world;
    if (!t || !t.alive) return null;
    const boss = !!(t.tags && t.tags.has("boss")), elite = !!(t.tags && t.tags.has("elite"));
    const sh = t.shield;
    if (cc && sh && sh.hp > 0 && !cc.cut.has(t)) {
      cc.cut.add(t);
      // 凝锋诀（功法体系 v2）：intentCut 状态加成剑意削盾比例（基础 0，flat 记百分比）
      const ic = 1 + Math.max(0, this.entity.stats.get("intentCut") || 0);
      const cut = Math.max(1, Math.round(sh.max * (boss ? CHARGE.shieldCut.boss : CHARGE.shieldCut.elite) * ic * (cc.full ? 1 : cc.M / MOMENTUM.max)));
      sh.hp -= cut;
      const fb = this.ctx.feedback;
      if (fb && fb.number) fb.number(t, "剑意 " + cut, "", 1.35, "#15181b");
      this.ctx.vfx && this.ctx.vfx.ring(t.pos, (t.radius || 0.5) * 1.8 + 0.4, { color: INKC.ink, dur: 0.35, width: 0.1 });
      const broke = sh.hp <= 0;
      if (broke && this.ctx.shields) this.ctx.shields.breakShield(t);
      w.events.emit("player:swordIntent", { target: t, cut, broke });
    }
    const vb = t._vulnT > 0;
    const info = w.dealDamage(this.entity, t, vb ? { ...spec, base: (spec.base || 0) * (1 + CHARGE.vulnBonus), scale: { atk: spec.scale.atk * (1 + CHARGE.vulnBonus) }, tags: [...spec.tags, "vulnBonus"] } : spec);
    if (!info || !cc) return info;
    if (t.alive && !cc.stag.has(t)) {
      cc.stag.add(t);
      this.stagger(t, cc.full, boss, elite);
    }
    return info;
  }
  // 控制：用"眩晕"状态（敌人模块会中断出招、原地不动）
  stagger(t, full, boss, elite) {
    const S = CHARGE.stagger, w = this.ctx.world;
    let dur = 0;
    if (!full) dur = boss || elite ? 0 : S.halfMob;
    else if (boss) {
      if (w.time - (t._chargeStunT ?? -99) >= S.bossIcd) (dur = S.boss), (t._chargeStunT = w.time);
    } else dur = elite ? S.elite : S.mob;
    if (dur > 0) {
      w.applyStatus(t, "stun", { dur, src: this.entity, data: { tag: "charge", full } }); // tag：首领控制器据此区分"蓄势斩打断"和其他眩晕
      w.events.emit("player:stagger", { target: t, dur, full, kind: boss ? "boss" : elite ? "elite" : "mob" });
    }
  }
  // 月牙剑气：向前推进，沿途每个敌人只中一次；到尽头若有《余波》再炸一圈
  updateWaves(dt) {
    const W = CHARGE.wave, w = this.ctx.world;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const s = this.waves[i];
      s.dist += Math.min(W.speed * dt, s.range - s.dist);
      const p = _c.copy(s.from).addScaledVector(s.dir, s.dist);
      p.y = height(p.x, p.z);
      for (const e of w.query(p, W.width, w.enemiesOf("player"))) {
        if (s.hit.has(e)) continue;
        s.hit.add(e);
        if (this.chargeHit(e, { base: W.base * s.k, scale: { atk: W.scale * s.k }, knock: W.knock, dir: s.dir, element: s.imbue || undefined, shieldMul: W.shieldMul, tags: s.tags }, s.cc)) {
          s.hits++;
          this.ctx.vfx && this.ctx.vfx.burst(e.pos, { color: s.color, count: 8, speed: 4 });
        }
      }
      s.mesh && s.mesh.set(p, s.dist / W.range);
      if (s.dist >= s.range - 1e-6) {
        this.waves.splice(i, 1);
        s.mesh && s.mesh.end();
        this.fx.stroke(s.from, p.clone(), s.color);
        if (this.entity.stats.get("mom_wave") > 0) {
          const at = p.clone();
          this.later.push({ t: CHARGE.aftershock.delay, fn: () => this.aftershock(at, s) });
        }
      }
    }
    for (let i = this.later.length - 1; i >= 0; i--) if ((this.later[i].t -= dt) <= 0) this.later.splice(i, 1)[0].fn();
  }
  // 心法《余波》：剑气尽头炸开一圈
  aftershock(at, s) {
    const A = CHARGE.aftershock, w = this.ctx.world, v = this.ctx.vfx;
    let n = 0;
    for (const e of w.query(at, A.radius, w.enemiesOf("player"))) if (this.chargeHit(e, { scale: { atk: A.scale * s.k }, knock: 1, dir: s.dir, element: s.imbue || undefined, tags: [...s.tags, "aftershock"] }, s.cc)) n++;
    if (v) (v.ring(at, A.radius, { color: s.color, dur: 0.45, width: 0.12 }), v.burst(at, { color: INKC.ink, count: 16, speed: 6, up: 4 }));
    this.fx.slash(at, s.dir, A.radius * 0.8, 5.5, { color: s.imbue ? ELEM_LOOK[s.imbue].deep : s.color, rim: s.imbue ? s.color : null, dur: 0.3, width: 0.4, y: 0.5 });
    if (n) this.ctx.rig && this.ctx.rig.shake(0.2);
    w.events.emit("player:aftershock", { hits: n, pos: at });
  }

  // ---------------- 附灵表现 ----------------
  // 命中特效：五行色墨点 + 少量墨点（池化的 vfx.burst 实例，不新建材质）
  imbueHitFx(targets, L) {
    const v = this.ctx.vfx;
    if (!v) return;
    for (const t of targets) {
      if (!t.pos) continue;
      v.burst(t.pos, { color: L.rim, count: 7, speed: 4.5, size: 0.16, up: 3.5 });
      v.burst(t.pos, { color: INKC.ink, count: 3, speed: 3.5, size: 0.14 });
    }
  }
  // 每帧：当前附灵（坛 > 剑）、坛附灵剩余时间、剑身 / 剑穗着色；坛附灵结束时发 player:imbueEnd（HUD 淡出提示）
  updateImbue(dt) {
    const st = this.entity.stats, w = this.ctx.world;
    let el = null, src = null;
    const sh = st.mods.find((m) => m.source === "shrine" && String(m.stat).startsWith("imbue_") && m.value > 0);
    if (sh) (el = sh.stat.slice(6)), (src = "shrine");
    else for (const e of ["metal", "wood", "water", "fire", "earth"]) if (st.get("imbue_" + e) > 0) ((el = e), (src = "sword"));
    if (el && !ELEM_LOOK[el]) el = null;
    const prev = this.imbue;
    const left = src === "shrine" ? Math.max(0, this.shrineUntil - w.time) : null;
    this.imbue = el ? { el, src, left, dur: src === "shrine" ? this.shrineDur : null } : null;
    if (prev && prev.src === "shrine" && (!el || src !== "shrine")) w.events.emit("player:imbueEnd", { el: prev.el, src: "shrine", next: el });
    if ((prev && prev.el) !== el || (prev && prev.src) !== src) w.events.emit("player:imbue", { el, src });
    // 剑身流光：目标强度 1；坛附灵最后 3 秒闪烁着变淡
    let k = el ? 1 : 0;
    if (el && src === "shrine" && left < 3) k = (left / 3) * (0.55 + 0.45 * Math.abs(Math.sin(w.time * 9)));
    this._imbK += (k - this._imbK) * Math.min(1, dt * 6);
    if (el) this._imbCol.setHex(ELEM_LOOK[el].rim);
    const K = this._imbK < 0.01 ? 0 : this._imbK;
    // 剑上飘起的五行微光（池化墨点，约每 0.2 秒一粒；静止时也看得出）
    if (K > 0.3 && this.swordBone && this.ctx.vfx && (this._moteT = (this._moteT || 0) - dt) <= 0) {
      this._moteT = 0.2 / K;
      const b = this.swordBone.getWorldPosition(_b);
      this.ctx.vfx.burst(b, { color: this._imbCol.getHex(), count: 1, speed: 0.5, up: 2.6, size: 0.11, dur: 0.75, y: 0.05 + Math.random() * 0.35 });
    }
    if (!this.imbueMats || (K === 0 && this._imbApplied === 0)) return;
    this._imbApplied = K;
    const pulse = 0.75 + 0.25 * Math.sin(w.time * 4);
    for (const o of this.imbueMats) {
      if (o.m === matCache.sword_steel) {
        o.m.emissive.copy(o.emissive).lerp(this._imbCol, K * 0.75 * pulse);
        o.m.color.copy(o.color).lerp(this._imbCol, K * 0.45);
      } else {
        o.m.color.copy(o.color).lerp(this._imbCol, K);
        o.m.emissive.copy(o.emissive).lerp(this._imbCol, K * 0.6);
      }
    }
  }

  // ---------------- 闪身冷却 ----------------
  dashRecharge() {
    const D = PLAYER.dash, st = this.entity.stats;
    return Math.max(D.minRecharge, (st.get("dashCd") || D.recharge) * (1 - Math.min(D.cdrCap, Math.max(0, st.get("dashCdr")))));
  }
  get dashCdK() {
    return this.dashCharges >= this.dashMax ? 1 : Math.min(1, this.dashRegen / this.dashRecharge());
  }
  // 充能数跟随属性（境界、心法《流云》、特殊词条）；新增的充能立即可用
  refreshDash() {
    const m = Math.max(1, Math.min(PLAYER.dash.maxCharges, Math.round(this.entity.stats.get("dashMax") || 1)));
    if (m === this._dashStat) return;
    const add = m - this._dashStat;
    this._dashStat = m;
    this.dashMax = m;
    this.dashCharges = Math.max(0, Math.min(m, this.dashCharges + Math.max(0, add)));
  }
  // 冷却回填 sec 秒（完美闪身返还）
  refundDash(sec) {
    const R = this.dashRecharge();
    if (this.dashCharges >= this.dashMax) return;
    this.dashRegen += sec;
    while (this.dashRegen >= R && this.dashCharges < this.dashMax) (this.dashRegen -= R), this.dashCharges++;
    if (this.dashCharges >= this.dashMax) this.dashRegen = 0;
  }
  denyDash() {
    if (this._denyT > now()) return;
    this._denyT = now() + 0.25;
    this.ctx.world.events.emit("player:dashDenied", {});
  }

  // 跃涧：站在关卡 jumps 的一端、朝向对岸按闪身键，跃到另一端（need 对应的解锁未达成时提示并退回普通闪身）
  tryLeap(want) {
    const lv = activeLevel(), js = lv && lv.points && lv.points.jumps;
    if (!js || !js.length || this.state === "dead") return !1;
    const dir = want && want.lengthSq() ? want : this.facing;
    for (const j of js)
      for (const [a, b] of [[j.from, j.to], [j.to, j.from]]) {
        if (Math.hypot(this.pos.x - a.x, this.pos.z - a.z) > PLAYER.leap.reach) continue;
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        if ((dir.x * dx + dir.z * dz) / len < 0.4) continue;
        const p = this.ctx.profile, ok = !j.need || !p || !p.unlocks || p.unlocks[j.need];
        if (!ok) {
          const run = this.ctx.flow && this.ctx.flow.run;
          if (run && run.toast && !(this._leapHintT > now())) (this._leapHintT = now() + 4), run.toast(`${j.name || "此处"}太宽，需练气五层二段跳才跃得过去`, "warn", 2.5);
          return !1;
        }
        const to = new THREE.Vector3(b.x, height(b.x, b.z), b.z);
        this.faceDir(new THREE.Vector3(dx, 0, dz).normalize());
        this.leap = { from: this.pos.clone(), to, h: PLAYER.leap.height + Math.max(0, to.y - this.pos.y) * 0.5, dur: PLAYER.leap.dur, ghostT: 0 };
        this.invulnUntil = now() + PLAYER.leap.dur;
        this.knock = null;
        this.queued = !1;
        this.setState("leap", PLAYER.leap.dur);
        this.play(PLAYER.dash.anim, 0.04, !0, PLAYER.leap.dur + 0.1);
        this.ctx.world.events.emit("player:leap", { jump: j, from: this.leap.from, to });
        return !0;
      }
    return !1;
  }
  // ---------------- 御剑（筑基） ----------------
  // 落点可站立：不是深水、不在台地之外、不在碰撞体里
  flyStand(x, z) {
    if (isDeepWater(x, z)) return !1;
    const h = height(x, z);
    if (h < -0.8) return !1;
    for (const c of this.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + PLAYER.radius) ** 2) return !1;
    return !0;
  }
  // 在深水边 / 崖边朝对岸按 Space：闪身路线上走不过去（深水、陡崖）且 reach 内有可站的落点 → 踏剑掠过
  trySwordFly(want) {
    if (this.state === "dead") return !1;
    const F = PLAYER.swordFly, dir = _fd.copy(want && want.lengthSq() ? want : this.facing).setY(0).normalize();
    // 闪身路线上有没有阻碍（深水 / 走不上去的高坡 / 走不下去的崖）
    let blockAt = 0, water = !1, prev = height(this.pos.x, this.pos.z);
    for (let d = 0.5; d <= PLAYER.dash.dist + 0.01; d += F.step) {
      const x = this.pos.x + dir.x * d, z = this.pos.z + dir.z * d;
      if (isDeepWater(x, z)) (blockAt = d), (water = !0);
      else {
        const h = height(x, z);
        if (h < -0.8 || h - prev > PLAYER.stepUp || prev - h > PLAYER.stepDown) blockAt = d;
        else prev = h;
      }
      if (blockAt) break;
    }
    if (!blockAt) return !1;
    // 岸边常是一道小坎，后面才是深水：阻碍之后 2.5 米内有深水也算"水边"
    if (!water) for (let d = blockAt; d <= blockAt + 2.5 && !water; d += F.step) water = isDeepWater(this.pos.x + dir.x * d, this.pos.z + dir.z * d);
    const p = this.ctx.profile, ok = !p || !p.unlocks || p.unlocks.swordFly;
    if (!ok) {
      if (water) this.swordFlyHint();
      return !1;
    }
    if (this.dashCharges <= 0) return !1;
    // 落点：阻碍之后、reach 之内第一处连续 0.7 米可站的地方
    let land = null, fenced = !1;
    for (let d = Math.max(F.min, blockAt + 0.4); d <= F.reach; d += F.step) {
      const x = this.pos.x + dir.x * d, z = this.pos.z + dir.z * d;
      const x2 = this.pos.x + dir.x * (d + 0.7), z2 = this.pos.z + dir.z * (d + 0.7);
      if (!this.flyStand(x, z) || !this.flyStand(x2, z2)) continue;
      if (this.ctx.flyFence && !this.ctx.flyFence(x, z)) {
        fenced = !0;
        continue;
      }
      const h = height(x, z);
      if (h - this.pos.y > F.maxUp) continue;
      land = new THREE.Vector3(x, h, z);
      break;
    }
    if (!land) {
      // 首领战的御剑围栏（ctx.flyFence，青牙：狼谷 pit）：落点都在围栏外 → 提示"墨雾封谷"
      if (fenced && !(this._fenceHintT > now())) {
        this._fenceHintT = now() + 2;
        const run = this.ctx.flow && this.ctx.flow.run;
        if (run && run.toast) run.toast("墨雾封谷", "warn", 2);
        this.ctx.world.events.emit("player:swordFlyDenied", { reason: "fence" });
      }
      return !1;
    }
    this.dashCharges--;
    const dist = Math.hypot(land.x - this.pos.x, land.z - this.pos.z), dur = Math.max(F.minDur, dist / F.speed);
    this.faceDir(dir);
    this.leap = { from: this.pos.clone(), to: land, h: F.height + Math.max(0, land.y - this.pos.y) * 0.6, dur, ghostT: 0, sword: !0, dir: dir.clone() };
    this.invulnUntil = now() + dur;
    this.knock = null;
    this.queued = !1;
    this.setState("leap", dur);
    this.play(PLAYER.dash.anim, 0.04, !0, dur + 0.1);
    const v = this.ctx.vfx;
    if (v) (v.ring(this.pos, 1.2, { color: INKC.ink, dur: 0.35, width: 0.08 }), v.burst(this.pos, { color: INKC.ink, count: 10, speed: 3, up: 2, y: 0.2 }));
    this.ctx.world.events.emit("player:swordFly", { from: this.leap.from, to: land, water });
    return !0;
  }
  // 筑基前在深水边："水深难渡，需御剑（筑基）"（限频）
  swordFlyHint() {
    if (this._flyHintT > now()) return;
    this._flyHintT = now() + PLAYER.swordFly.hintEvery;
    const run = this.ctx.flow && this.ctx.flow.run;
    if (run && run.toast) run.toast("水深难渡，需御剑（筑基）", "warn", 2.5);
    this.ctx.world.events.emit("player:swordFlyDenied", { reason: "realm" });
  }
  startDash(dir) {
    const D = PLAYER.dash;
    if (this.dashCharges <= 0 || this.state === "dead") return !1;
    this.dashCharges--;
    if (dir.lengthSq() < 1e-6) dir.copy(this.facing);
    dir.y = 0;
    dir.normalize();
    this.faceDir(dir);
    const from = this.pos.clone();
    this.dash = { dir: dir.clone(), from, speed: D.dist / D.dur, ghostT: 0, perfect: !1 };
    this.invulnUntil = now() + D.dur + D.iframePad;
    this.setState("dash", D.dur);
    this.queued = !1;
    this.play(D.anim, 0.04, !0, D.dur + 0.12);
    this.fx.ghost(this.root);
    this.ctx.world.events.emit("player:dash", { from, to: from.clone().addScaledVector(dir, D.dist) });
    return !0;
  }
  // 法术位移（功法体系 v2：藤引、地行术；docs/design/功法体系_v2.md）：借用闪身状态，沿地面以 dist / dur 的速度移动
  //   崖壁、深水、碰撞体照挡（同闪身走 tryMove，不越过关卡门槛）；不耗闪身充能、不触发完美闪身（dash.perfect 预置为 true）
  //   o = { iframe 全程无敌, hide 遁地时隐去身形, kind 事件里的来源, onEnd 结束回调（落点破土等） }
  skillMove(dir, dist, dur, o = {}) {
    if (this.state === "dead" || this.state === "cine" || !(dist > 0.05) || !(dur > 0)) return !1;
    const d = _a.copy(dir).setY(0);
    if (d.lengthSq() < 1e-6) return !1;
    d.normalize();
    this.faceDir(d);
    const from = this.pos.clone();
    this.dash = { dir: d.clone(), from, speed: dist / dur, ghostT: 0, perfect: !0, skill: o.kind || "skill", hide: !!o.hide, onEnd: o.onEnd || null };
    if (o.iframe) this.invulnUntil = Math.max(this.invulnUntil, now() + dur + 0.1);
    this.setState("dash", dur);
    this.queued = !1;
    if (o.hide) this.root.visible = !1;
    else this.play(PLAYER.dash.anim, 0.04, !0, dur + 0.12);
    this.ctx.world.events.emit("player:skillMove", { kind: this.dash.skill, from, dist });
    return !0;
  }
  perfectDodge(attacker) {
    const D = PLAYER.dash;
    this.dash.perfect = !0;
    this.perfectUntil = now() + D.perfectWindow;
    this.slowUntil = now() + D.perfectSlowDur;
    this.ctx.world.timeScale = D.perfectSlow;
    this.refundDash(D.perfectRefund * this.dashRecharge()); // 奖励技巧：返还部分冷却
    this.addMomentum(MOMENTUM.perfect);
    const v = this.ctx.vfx;
    if (v) (v.ring(this.pos, 2.2, { color: INKC.gold, dur: 0.5, width: 0.05 }), v.burst(this.pos, { color: INKC.gold, count: 16, speed: 4 }));
    this.ctx.world.events.emit("player:perfectDodge", { attacker });
  }
  onHurt(info) {
    this.hurtUntil = now() + PLAYER.hurt.invuln;
    if (!this.entity.alive) return;
    if (info.amount > 0 && !this.momentumFull) this.momentum = Math.max(0, this.momentum - MOMENTUM.hurt); // 受击扣气势（势成时不扣）
    this.ctx.rig && this.ctx.rig.shake(0.22);
    // 受击硬直只打断移动（不打断出招、施法），且很短
    if (this.state === "move") {
      this.setState("hit", PLAYER.hurt.flinch);
      this.play("hit", 0.05, !0, 0.3);
    }
    if (info.knock && info.dir) this.knock = { dir: info.dir.clone().setY(0).normalize(), left: Math.min(1.2, info.knock * 0.5) };
  }
  onDeath() {
    this.root.visible = !0;
    this.setState("dead");
    this.deadT = 0;
    this.dash = null;
    this.knock = null;
    this.vel.set(0, 0, 0);
    this.momentum = 0;
    this.chainStacks = 0;
    this.chargeBuf = 0;
    this.play("die", 0.1, !0);
  }
  respawn() {
    const e = this.entity;
    this.spawn(...this.spawnAt);
    e.alive = !0;
    e.hp = e.stats.get("hp");
    e.mp = e.stats.get("mp");
    for (const id of [...e.statuses.keys()]) this.ctx.world.removeStatus(e, id);
    this.dashCharges = this.dashMax;
    this.dashRegen = 0;
    this.momentum = 0;
    this.chainStacks = 0;
    this.hurtUntil = now() + 1.5;
    this.setState("move");
    this.play("idle", 0.2);
    this.ctx.world.events.emit("player:respawn", {});
  }

  // ---------------- 移动与地形 ----------------
  canStand(x, z, from) {
    const h = height(x, z);
    if (h < -0.8) return !1; // 台地之外
    if (h - from > PLAYER.stepUp || from - h > PLAYER.stepDown) return !1; // 崖壁走不上去，也不从崖边走下
    for (const c of this.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + PLAYER.radius - 0.08) ** 2) return !1;
    return !0;
  }
  tryMove(dx, dz) {
    const from = height(this.pos.x, this.pos.z);
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.canStand(nx, nz, from)) return void ((this.pos.x = nx), (this.pos.z = nz));
    // 被深水挡住（主动走过去时）：筑基前提示需御剑
    if (this.state === "move" && isDeepWater(nx + dx * 4, nz + dz * 4) && !(this.ctx.profile && this.ctx.profile.unlocks && this.ctx.profile.unlocks.swordFly)) this.swordFlyHint();
    if (this.canStand(nx, this.pos.z, from)) return void (this.pos.x = nx);
    if (this.canStand(this.pos.x, nz, from)) this.pos.z = nz;
  }
  // 输入方向（相对镜头）
  inputDir(out) {
    const inp = this.ctx.input;
    let ix = inp ? (inp.down("KeyD") ? 1 : 0) - (inp.down("KeyA") ? 1 : 0) : 0;
    let iz = inp ? (inp.down("KeyS") ? 1 : 0) - (inp.down("KeyW") ? 1 : 0) : 0;
    if (this.forceMove) (ix = this.forceMove[0]), (iz = this.forceMove[1]);
    const len = Math.hypot(ix, iz);
    if (!len) return out.set(0, 0, 0);
    const c = Math.cos(this.camYaw), s = Math.sin(this.camYaw);
    return out.set((ix * c + iz * s) / len, 0, (-ix * s + iz * c) / len);
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const inp = this.ctx.input, t = now();
    if (this.slowUntil && t >= this.slowUntil) (this.slowUntil = 0), (this.ctx.world.timeScale = 1);
    this.stateT += dt;
    this.comboIdle += dt;
    // 闪身充能（逐个恢复）
    this.refreshDash();
    if (this.dashCharges < this.dashMax) {
      this.dashRegen += dt;
      const R = this.dashRecharge();
      if (this.dashRegen >= R) (this.dashRegen -= R), this.dashCharges++;
      if (this.dashCharges >= this.dashMax) this.dashRegen = 0;
    } else this.dashRegen = 0;
    // 连环层数到时清空；《满势》在势成时加速
    this.momT += dt;
    // （v1.3：气势不随时间流失，未满也不衰减；出局 / 新一局开始时清零，见构造函数里的 run:start / run:end）
    if (this.chainStacks && (this.chainT -= dt) <= 0) this.chainStacks = 0;
    const haste = this.momentumFull && this.state !== "dead" && this.entity.stats.get("mom_haste") > 0;
    if (haste !== this._haste) {
      this._haste = haste;
      const st = this.entity.stats;
      st.removeSource("momHaste");
      if (haste) st.addAll([{ stat: "aspd", type: "pct", value: MOM_XINFA.hasteAspd }, { stat: "move", type: "pct", value: MOM_XINFA.hasteMove }], "momHaste");
    }
    if (this.waves.length || this.later.length) this.updateWaves(dt);

    const want = this.inputDir(_a);

    if (this.state === "dead") {
      this.deadT += dt;
      if (this.deadT >= PLAYER.respawnDelay) this.respawn();
    } else if (inp && this.state !== "cine") {
      // 闪身：任何时候（除死亡、演出）都能取消当前动作
      if (inp.pressed("Space") && this.state !== "dash" && this.state !== "leap" && !this.tryLeap(want) && !this.trySwordFly(want) && !this.startDash(want.lengthSq() ? want.clone() : this.facing.clone())) this.denyDash();
      // 普攻：按住左键连续出招；招式中按下则预输入
      const atk = inp.mouse.left || inp.mouse.leftPressed;
      // 右键蓄势斩的缓存：到可取消时立即放出（右键本身由 targeting 模块转给 tryCharge）
      if (this.chargeBuf > 0) {
        if (!this.momentumReady) this.chargeBuf = 0;
        else if (this.canStartCharge()) this.startCharge();
        else this.chargeBuf -= this.state === "attack" ? dt * this.aspd() : dt * 0.3; // 出招中按攻速缩放（攻速低时招式长，缓存同比变长，保证撑到可取消）；施法 / 闪身 / 跃涧中约 1.2 秒，落地即放
      }
      if (this.state === "move" || this.state === "hit") {
        if (atk) this.startAttack();
      } else if (this.state === "attack") {
        if (atk && this.stateT >= this.moveTimes().queueFrom) this.queued = !0;
      }
    }

    switch (this.state) {
      case "move": {
        const sp = this.entity.stats.get("move") * moveScale(this.pos.x, this.pos.z); // 浅溪涉水减速
        const k = want.lengthSq() ? PLAYER.accel : PLAYER.decel;
        _b.copy(want).multiplyScalar(sp).sub(this.vel);
        const l = _b.length(), mx = k * dt;
        if (l > mx) _b.multiplyScalar(mx / l);
        this.vel.add(_b);
        if (this.vel.lengthSq() > 1e-4) this.tryMove(this.vel.x * dt, this.vel.z * dt);
        if (want.lengthSq()) {
          this.facing.copy(want);
          const d = Math.atan2(want.x, want.z) - this.yaw;
          this.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * PLAYER.turnSpeed);
        }
        const moving = this.vel.length() > 0.6;
        if (!this.cur || this.cur === this.actions.idle || this.cur === this.actions.run || !this.cur.isRunning()) this.play(moving ? "run" : "idle");
        if (this.actions.run) this.actions.run.timeScale = Math.max(0.6, this.vel.length() / 6);
        break;
      }
      case "attack": {
        const m = this.move(), tm = this.moveTimes();
        // 出招前半段向前踏步（贴脸有敌人时不踏）
        if (this.stateT < tm.hitTime && m.step > 0) {
          const close = this.ctx.world.queryArc(this.pos, this.facing, 1.1, 0.6, this.ctx.world.enemiesOf("player")).length;
          if (!close) this.tryMove(this.facing.x * (m.step / tm.hitTime) * dt, this.facing.z * (m.step / tm.hitTime) * dt);
        }
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 12));
        if (!this.hitDone && this.stateT >= tm.hitTime) this.doHit();
        if (this.queued && this.hitDone && this.stateT >= tm.cancelFrom) this.startAttack();
        else if (this.stateT >= tm.dur) {
          this.setState("move");
          this.comboIdle = 0;
        }
        break;
      }
      case "dash": {
        const d = this.dash;
        this.tryMove(d.dir.x * d.speed * dt, d.dir.z * d.speed * dt);
        d.ghostT += dt;
        if (d.ghostT > 0.07 && !d.hide) (d.ghostT = 0), this.fx.ghost(this.root);
        if (this.stateT >= this.stateDur) {
          if (d.skill) {
            // 法术位移结束（地行术破土、藤引落地）：不画闪身墨痕，交给法术自己的落点效果
            this.root.visible = !0;
            this.dash = null;
            this.setState("move");
            if (d.onEnd) d.onEnd();
            if (inp && inp.mouse.left) this.startAttack();
            break;
          }
          this.fx.stroke(d.from, this.pos);
          this.vel.copy(d.dir).multiplyScalar(this.entity.stats.get("move") * 0.8);
          this.dash = null;
          this.setState("move");
          // 闪身结束时如果按着左键，立刻接普攻
          if (inp && inp.mouse.left) this.startAttack();
        }
        break;
      }
      case "leap": {
        const L = this.leap, k = Math.min(1, this.stateT / L.dur);
        this.pos.x = L.from.x + (L.to.x - L.from.x) * k;
        this.pos.z = L.from.z + (L.to.z - L.from.z) * k;
        this.pos.y = L.from.y + (L.to.y - L.from.y) * k + L.h * 4 * k * (1 - k);
        L.ghostT += dt;
        if (L.sword) {
          // 御剑：脚下墨剑 + 身后一路墨点拖尾（池化墨点）
          this.fx.ride(k < 1, this.pos, L.dir, k);
          if (L.ghostT > 0.05) (L.ghostT = 0), this.ctx.vfx && this.ctx.vfx.burst(this.pos, { color: INKC.ink, count: 3, speed: 0.8, up: 0.4, size: 0.16, dur: 0.6, y: 0 });
        } else if (L.ghostT > 0.08) (L.ghostT = 0), this.fx.ghost(this.root);
        if (k >= 1) {
          this.fx.stroke(L.from, this.pos);
          if (L.sword) {
            this.fx.ride(!1);
            const v = this.ctx.vfx;
            if (v) (v.ring(this.pos, 1.8, { color: INKC.ink, dur: 0.45, width: 0.06 }), v.burst(this.pos, { color: INKC.ink, count: 18, speed: 5, up: 2.5, y: 0.2 }));
            this.ctx.rig && this.ctx.rig.shake(0.12);
          }
          this.leap = null;
          this.vel.set(0, 0, 0);
          this.setState("move");
        }
        break;
      }
      case "cine": {
        // 演出（首领入场 / 处决）：不接受输入，位置由演出脚本直接写 pos / yaw
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 14));
        if (this.stateT >= this.stateDur) this.setState("move");
        break;
      }
      case "cast":
      case "hit": {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 14));
        if (this.stateT >= this.stateDur) this.setState("move");
        break;
      }
    }
    // 受击击退
    if (this.knock && this.state !== "dash" && this.state !== "leap" && this.state !== "dead") {
      const step = Math.min(this.knock.left, 8 * dt);
      this.tryMove(this.knock.dir.x * step, this.knock.dir.z * step);
      this.knock.left -= step;
      if (this.knock.left <= 0) this.knock = null;
    }
    // 攻击、施法、闪身时快速转向
    if (this.state === "attack" || this.state === "cast" || this.state === "dash") {
      const d = Math.atan2(this.facing.x, this.facing.z) - this.yaw;
      this.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 30);
    }

    const gh = height(this.pos.x, this.pos.z);
    if (this.state !== "leap") this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 14);
    this.root.rotation.y = this.yaw;
    if (this.mixer) this.mixer.update(dt);
    else if (this.model) this.model.position.y = this.state === "move" && this.vel.length() > 0.6 ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
    this.updateImbue(dt);
    this.fx.update(dt);
  }
}
