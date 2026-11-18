// 单个敌人：外观（模型 + 墨线描边）+ 战斗实体 + AI 状态机。
// 状态：idle 游荡 → chase 追击（绕圈压迫 / 轮流上前）→ windup 预警 → strike 出招 → recover 收招破绽 → chase …
//       flinch 受击硬直（轻型敌人在预警 / 出招时被打会中断）、return 回巢（脱战：免伤、回血）、dead 死亡（倒地后墨色消散）
// 仇恨：只有主角进入视野（够得着的前提下）或受到攻击才进入仇恨，并只带起 1–2 只同组同伴——可以逐个拉怪；
//       追出巢太远 / 太久没接触 / 到不了主角（高台、崖顶）就回巢（或先撤开到主角够不着的地方），回巢途中免伤并回血。
// 寻路：直线走不通时沿粗网格流场绕坡道（nav.js）；到不了就用远程招式 / 嚎叫，然后撤开脱战，绝不站着挨打。
//
// 首领控制器钩子（def.controller(enemy) → ctrl，青牙 / 碧鳞重做用；所有钩子都可选）：
//   ctrl.update(dt)                      每帧（死亡后不再调用）
//   ctrl.pickAttack(ready[], dist) → a   选招：ready 为当前可用（冷却好、距离合适）的招式，返回其一 / null（null = 这帧不出招）/ undefined（走默认）
//   ctrl.onStartAttack(a, combo) / ctrl.onStrike(a) / ctrl.onEndAttack(a, interrupted) → true 时不走默认的喘息计数
//   ctrl.onHit(info) → true 吞掉默认的受击硬直 / 打断；ctrl.onDeath(info)
//   ctrl.onLungeBlocked(collider)       冲扑被碰撞体（树石柱）挡住
//   ctrl.onCC(id, dur, { src, tag })    def.ccMode === "poise" 时，眩晕 / 冰冻先问控制器：返回 "allow" 照常眩晕，否则不打断出招、由控制器折算失衡值；
//                                       tag = 状态 data.tag（施加方自定，如 "charge"）| "shieldBreak"（刚破盾）| "status"
//   ctrl.onChannelHit(info, a) → true    读条型前摇挨打时由控制器判定是否打断（如打断值累计）；没有控制器时按 channelBreak 标签
//   ctrl.onChannelBreak(a, info)        读条型前摇被打断
//   ctrl.onBeforeDamage(info)           伤害结算前（排在护盾吸收之后），可改 info.amount / info.cancel（如气竭：致死时压到 hp−1 并倒地）
// 招式新字段：channel（读条型前摇：被带 channelBreak 里任一标签的伤害命中就中断，发 enemy:interrupt）、
//             rear（只在主角位于背后 ±60° 时可选）、at: "behind"（落点在主角身后 behindDist 米，配合 hide + teleport 即潜影现身）
// 状态：setState("down", 秒)（倒地，可被处决：不出招、不移动）/ setState("cinematic", 秒)（演出：不出招、免伤，mixer 照常）
// 所有数值与节奏读数据表（data/enemies.js），伤害走战斗核心 world.dealDamage。
import * as THREE from "three";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { makeEntity, Stats, STATUS } from "../../core/combat.js";
import { toon, outlineMaterial } from "../../render/materials.js";
import { height, moveScale } from "../../world/terrain.js";
import { INKC } from "../../fx/vfx.js";
import { ENCOUNTER } from "../../data/enemies.js";

// 材质：按 Blender 材质名（前缀）映射到卡通水墨材质。墨黑身体，朱红 / 灵光眼睛，骨白爪牙；各模型的材质名见 blender/README.md
const PALETTE = {
  // 狼妖
  fur_ink: { color: 0x1d2124 },
  fur_light: { color: 0x575c61 },
  eye_red: { color: 0xff2a14, emissive: 0xd01a08, emissiveIntensity: 1.8 },
  claw: { color: 0xe9e3d2 },
  aura_purple: { color: 0x7b4fa8, emissive: 0x4a2a70, emissiveIntensity: 1 },
  // 石傀
  stone_dark: { color: 0x3b3c3e },
  stone_light: { color: 0x7d786c },
  rune_glow: { color: 0xffb648, emissive: 0xff8a1a, emissiveIntensity: 1.6 },
  moss: { color: 0x4d7a3c },
  // 蝠妖
  wing_membrane: { color: 0x43334a },
  // 低阶怪：山鼠妖 / 鸦妖 / 蛛妖 / 竹叶青 / 寒蟾（前缀匹配：长名在前）
  fur_brown: { color: 0x5c4532 },
  feather_light: { color: 0x34363c },
  feather: { color: 0x0e0f12 },
  beak: { color: 0xc89a3a },
  carapace: { color: 0x17151b },
  silk: { color: 0xe4ded0 },
  snake_green: { color: 0x2f6a2c },
  snake_belly: { color: 0xc9cc8a },
  toad_skin: { color: 0x2a3a46 },
  toad_belly: { color: 0x9aa49e },
  wart: { color: 0xdfeaf2 },
  eye_ice: { color: 0x9ae6ff, emissive: 0x4ac8ff, emissiveIntensity: 1.4 },
  // 藤妖
  bark: { color: 0x3a2d22 },
  vine_green: { color: 0x2c5a34 },
  leaf_green: { color: 0x5f9a48 },
  eye_glow: { color: 0xe4f87a, emissive: 0xb8e040, emissiveIntensity: 1.6 },
  flower_red: { color: 0xc8382a, emissive: 0x6a1408, emissiveIntensity: 0.6 },
  // 碧鳞水蟒
  scale_dark: { color: 0x163330 },
  scale_jade: { color: 0x2f8f78 },
  belly: { color: 0xc4c6aa },
  eye_gold: { color: 0xffc848, emissive: 0xffa020, emissiveIntensity: 1.8 },
  // 青牙 v2（assets/models/qingya.glb，blender/build_qingya.py）：墨青毛带一点自发光托底——toon 暗面只有 27% 亮度，纯墨色会压成一块黑团
  fur_qing: { color: 0x4f5f59, emissive: 0x1a2622, emissiveIntensity: 1 },
  fur_belly: { color: 0x7a8883, emissive: 0x1a2220, emissiveIntensity: 1 },
  fang_jade: { color: 0x8affd2, emissive: 0x2fd890, emissiveIntensity: 1.1 },
  bone_armor: { color: 0xdedbcd },
  eye_jade: { color: 0xa8ffe0, emissive: 0x3dffb4, emissiveIntensity: 2.2 },
  crack_glow: { color: 0x8affd0, emissive: 0x2fe8a0, emissiveIntensity: 1.6 },
  eye_fire: { color: 0xd2fff0, emissive: 0x6affc8, emissiveIntensity: 2.4 },
  // 心魔（主角模型 hero.glb 的材质，换成墨色倒影；朱砂发带 / 剑穗保留为亮色）
  robe_white: { color: 0x2a2d33 },
  robe_inner: { color: 0x15171a },
  sash_dark: { color: 0x0e0f11 },
  skin: { color: 0x8f8a86 },
  hair_black: { color: 0x0b0c0d },
  ribbon_red: { color: 0xd2321e, emissive: 0x8a1408, emissiveIntensity: 1.2 },
  boots_black: { color: 0x0e0f11 },
  sword_steel: { color: 0x3a3e46, emissive: 0x401010, emissiveIntensity: 0.5 },
  sword_hilt: { color: 0x15171a },
  tassel_red: { color: 0xd2321e, emissive: 0x8a1408, emissiveIntensity: 1.2 },
};

// 仇恨与脱战的默认值（数据表可用同名字段覆盖：sightRange / pullAllies / leashRange / leashTime）。按 普通 / 精英 / Boss 取值
export const AI = {
  sightRange: { normal: 9, elite: 10, boss: 18 }, // 视野：主角进入这个距离（且够得着）才惊动
  pullAllies: { normal: 1, elite: 2, boss: 0 }, // 被惊动时顺带叫醒的同组同伴数
  pullRadius: 10,
  leashRange: { normal: 24, elite: 30, boss: 34 }, // 离巢超过这个距离就回巢
  leashTime: { normal: 8, elite: 10, boss: 16 }, // 这么多秒没接触（够不着主角）就回巢
  returnRegen: 0.08, // 回巢途中每秒回复最大气血的比例
  arriveHeal: 0.3, // 回到巢里再回复的比例
  returnSpeed: 1.25,
  unreachGiveUp: 0.6, // 到不了主角多久后撤开（有远程招式的会先打远程）
  fleeDist: 16, // 撤开到离主角多远
  regroup: 4, // 撤开后歇多久回原来的巢
  ignoreAfter: 6, // 撤开 / 回巢后多少秒内不被视线惊动（受击仍会）
  meleeDy: 1.8, // 高差超过这个，近战招式打不到
  stuck: 1.0, // 卡住多久就改走寻路
};

// 精英 / 首领的出招节奏（输出窗口）：数据表招式可用 big: true 标大招，recoverBig / recoverSmall 覆盖后摇
//   大招收招后摇 big（期间不出招、不转身）；小招后摇 small；大招落空（一段都没打中）再踉跄 miss 秒
//   连续出 chain 招后进入"喘息"winded 秒（低头喘气、墨气外散、头顶淡金"隙"字）——最大的输出窗口
//   破盾眩晕 breakStun 秒（数据表 breakStun 可覆盖）
export const RHYTHM = {
  big: { elite: 1.2, boss: 1.4 },
  small: 0.5,
  miss: 0.5,
  chain: { elite: [2, 2], boss: [2, 3] },
  winded: { elite: 1.5, boss: 2.25 },
  breakStun: { elite: 3, boss: 2.5 },
};

const _haloMats = new Map();
let _haloGeo = null;
const haloGeo = () => _haloGeo || (_haloGeo = new THREE.RingGeometry(0.32, 0.4, 32).rotateX(-Math.PI / 2));
function haloMat(color) {
  if (!_haloMats.has(color)) _haloMats.set(color, new THREE.MeshBasicMaterial({ color, transparent: !0, opacity: 0.5, depthWrite: !1, side: THREE.DoubleSide }));
  return _haloMats.get(color);
}

// 按等级缩放数据表数值（相对 def.level）；心魔按主角属性生成
export function scaledStats(def, level, hero) {
  const s = { ...def.stats };
  const d = (level ?? def.level ?? 1) - (def.level ?? 1);
  if (d) {
    const k = ENCOUNTER.scale;
    s.hp = Math.round(s.hp * Math.max(0.4, 1 + k.hp * d));
    s.atk = Math.round(s.atk * Math.max(0.5, 1 + k.atk * d) * 10) / 10;
    if (s.def) s.def = Math.round(s.def * Math.max(0.5, 1 + k.def * d));
  }
  if (def.mirrorHero && hero && hero.stats) for (const k of ["atk", "spell", "def", "crit", "critDmg"]) s[k] = Math.round(hero.stats.get(k) * def.mirrorHero * 100) / 100;
  return s;
}
const outlineMat = outlineMaterial(0.016);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

// 能否站上 (x, z)：台地之内、不爬陡崖、不跳崖、不穿树石（与主角规则一致）
export function walkable(x, z, fromH, colliders, r = 0.35) {
  const h = height(x, z);
  if (h < -0.8) return !1;
  if (h - fromH > 0.55 || fromH - h > 0.9) return !1;
  for (const c of colliders || []) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) return !1;
  return !0;
}

export class Enemy {
  constructor(director, type, def, template, pos, opts = {}) {
    const ctx = director.ctx;
    this.dir = director;
    this.ctx = ctx;
    this.type = type;
    this.def = def;
    this.pack = opts.pack ?? null;
    this.region = opts.region ?? director.region ?? def.region;
    this.level = opts.level ?? def.level ?? 1;
    this.noLoot = !!opts.noLoot;
    this.forceShield = opts.shield ?? null; // 关卡指定的护盾五行（points.elites[i].shield，可为数组）
    this.adds = opts.adds || null; // 召唤点（青牙的狼窝 points.boss.adds）
    this.root = new THREE.Group();
    this.root.name = "enemy-" + type;
    this.root.position.set(pos.x, height(pos.x, pos.z), pos.z);
    ctx.scene.add(this.root);

    // ---- 外观 ----
    const model = skClone(template.scene);
    model.scale.setScalar(def.scale);
    this.mats = [];
    const byName = {};
    const tint = def.tint || {};
    model.traverse((o) => {
      if (!o.isMesh) return;
      const key = Object.keys(PALETTE).find((k) => o.material && (o.material.name || "").toLowerCase().startsWith(k)) || "fur_ink";
      if (!byName[key]) {
        const p = { ...PALETTE[key] };
        if (tint[key] != null) (p.color = tint[key]), p.emissive != null && (p.emissive = tint[key]);
        const m = toon(p);
        m.name = key; // 外观辅助（src/fx/boss_look.js）按名字找材质
        m.userData.baseEmissive = m.emissive.clone();
        m.userData.baseEI = m.emissiveIntensity;
        byName[key] = m;
        this.mats.push(m);
      }
      o.material = byName[key];
      o.castShadow = !0;
      o.frustumCulled = !1;
    });
    // 墨线描边壳
    const list = [];
    model.traverse((o) => o.isMesh && list.push(o));
    for (const m of list) {
      const ol = m.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, outlineMat) : new THREE.Mesh(m.geometry, outlineMat);
      if (m.isSkinnedMesh) ol.bind(m.skeleton, m.bindMatrix);
      ol.position.copy(m.position);
      ol.quaternion.copy(m.quaternion);
      ol.scale.copy(m.scale);
      ol.frustumCulled = !1;
      m.parent.add(ol);
    }
    this.model = model;
    this.root.add(model);
    // 异种：头顶一圈淡淡的异色光环（几何与材质按颜色共享）
    if (def.halo != null) {
      const m = new THREE.Mesh(haloGeo(), haloMat(def.halo));
      m.position.y = def.height * 1.02;
      m.scale.setScalar(def.scale);
      m.renderOrder = 25;
      this.halo = m;
      this.root.add(m);
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of template.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.cur = null;
    this.play("idle", 0);

    // ---- 战斗实体（坐标与模型根节点共用） ----
    this.entity = ctx.world.add(
      makeEntity({
        team: "enemy",
        kind: type,
        name: def.name,
        pos: this.root.position,
        radius: def.radius,
        height: def.height,
        stats: new Stats(scaledStats(def, this.level, ctx.world.player)),
        level: this.level,
        shieldFrac: def.shieldFrac,
        owner: this,
        tags: new Set(def.tags || []),
      }),
    );
    this.entity.onHit = (info) => this.onHit(info);
    this.entity.onDeath = (info) => this.onDeath(info);
    this.phaseIdx = 0;
    this.submerged = !1; // 潜水中（不可被攻击，见 index.js）
    this.setupShield();
    this.ctrl = typeof def.controller === "function" ? def.controller(this) : null;

    // ---- AI 状态 ----
    this.state = "idle";
    this.t = 0;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.wantYaw = this.yaw;
    this.sep = new THREE.Vector3(); // 与同伴的分离力（由总管每帧计算）
    this.home = this.root.position.clone();
    this.wanderT = Math.random() * 2;
    this.wanderTo = null;
    this.aggro = !1;
    this.rank = def.boss || (def.tags || []).includes("boss") ? "boss" : (def.tags || []).includes("elite") ? "elite" : "normal";
    this.hunter = !1; // 夜潮 / 召唤：没有巢，不按离巢距离脱战
    this.contactT = 0;
    this.unreachT = 0;
    this.ignoreT = 0;
    this.route = "direct";
    this.routeT = 0;
    this.forcePathT = 0;
    this.stuckT = 0;
    this.lastPos = this.root.position.clone();
    this.reach = Math.max(...def.attacks.map((a) => a.maxDist || 3));
    // 追击恢复只认伤害招式；嚎叫等辅助范围不能维持接触或压住卡住检测。
    this.damageReach = Math.max(0, ...def.attacks.filter((a) => a.damage).map((a) => a.maxDist || 3));
    this.chain = 0;
    this.chainNeed = this.rollChain();
    this.hasRanged = def.attacks.some((a) => a.shape === "projectile" || a.at === "target");
    this.cool = {};
    for (const a of def.attacks) this.cool[a.id] = 0.6 + Math.random() * 1.4;
    this.orbitA = Math.random() * Math.PI * 2;
    this.orbitR = def.orbit[0] + Math.random() * (def.orbit[1] - def.orbit[0]);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.kv = new THREE.Vector3(); // 击退速度
    this.vel = new THREE.Vector3();
    this.atk = null; // 当前招式 { a, zone, tele, combo, t }
    this.flashT = 0;
    this.flinchCd = 0;
    this.buffT = 0;
    this.deadT = 0;
    this.removed = !1;
    this.auraT = 0;
  }

  get pos() {
    return this.root.position;
  }

  // 护盾：固定五行（只在本区域生效，其他区域沿用随机）/ 多段护盾的第一层；没写的精英保持 shields.js 的随机护盾
  setupShield() {
    const sh = this.ctx.shields, d = this.def;
    if (!sh) return;
    let el = null;
    const pick = (v) => (Array.isArray(v) ? v[(Math.random() * v.length) | 0] : v);
    if (d.shieldPhases) el = d.shieldPhases[0].el;
    else if (this.forceShield && this.entity.tags.has("elite")) el = pick(this.forceShield);
    else if (d.shield && (!this.region || this.region === d.region)) el = pick(d.shield);
    if (!el) return;
    sh.drop(this.entity);
    this.entity.shield = null;
    sh.give(this.entity, el);
  }
  // 多段护盾：当前无盾且气血降到下一段阈值 → 换上下一层（Boss 怒吼一下）
  updatePhases() {
    const ph = this.def.shieldPhases, e = this.entity;
    if (!ph || this.phaseIdx >= ph.length - 1 || !this.ctx.shields) return;
    const nx = ph[this.phaseIdx + 1];
    if ((e.shield && e.shield.hp > 0) || e.hp > e.stats.get("hp") * nx.at) return;
    this.phaseIdx++;
    this.ctx.shields.give(e, nx.el);
    this.ctx.vfx.ring(this.pos, 6, { color: this.def.auraColor ?? INKC.purple, dur: 0.8, width: 0.08 });
    this.ctx.vfx.burst(this.pos, { color: this.def.auraColor ?? INKC.purple, count: 30, speed: 6, size: 0.26, up: 5, y: 1.5 });
    this.ctx.world.events.emit("enemy:phase", { enemy: e, phase: this.phaseIdx, element: nx.el });
    if (this.def.phaseAnim && !this.attacking && this.actions[this.def.phaseAnim]) {
      this.state = "flinch";
      this.t = this.actions[this.def.phaseAnim].getClip().duration;
      this.play(this.def.phaseAnim, 0.1, !0);
    }
  }
  get alive() {
    return this.entity.alive;
  }

  play(name, fade = 0.15, once = !1) {
    const a = this.actions[name];
    if (!a) return null;
    if (a === this.cur) return a;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = 1;
    a.enabled = !0;
    if (this.cur && fade > 0) a.crossFadeFrom(this.cur, fade, !1);
    a.play();
    this.cur = a;
    return a;
  }

  // 受击闪白（主角的打击反馈模块约定调用 owner.flash()）
  // 打击反馈模块会传入伤害信息对象，也可直接传秒数
  flash(arg) {
    const dur = typeof arg === "number" ? arg : arg && arg.crit ? 0.13 : 0.09;
    this.flashUntil = Math.max(this.flashUntil || 0, performance.now() + dur * 1000); // 按真实时间计（不受顿帧影响）
    this.flashT = 1;
    for (const m of this.mats) (m.emissive.copy(WHITE), (m.emissiveIntensity = 0.55));
  }

  // ---------------- 每帧 ----------------
  update(dt, hero) {
    if (this.flashT > 0 && performance.now() >= this.flashUntil && !(this.flashT = 0)) for (const m of this.mats) (m.emissive.copy(m.userData.baseEmissive), (m.emissiveIntensity = m.userData.baseEI));
    if (this.state === "dead") return this.updateDead(dt);
    this.animate(dt);
    const e = this.entity;
    const st = e.statuses;
    const stunned = st.has("stun") || st.has("freeze");
    const rooted = stunned || st.has("root");
    const move = rooted ? 0 : e.stats.get("move") * (e.tags.has("flying") ? 1 : moveScale(this.pos.x, this.pos.z)); // 涉水减速（飞行的不受影响）
    for (const k in this.cool) this.cool[k] -= dt;
    this.flinchCd -= dt;
    if (this.buffT > 0 && (this.buffT -= dt) <= 0) e.stats.removeSource("howl");
    if (this.def.auraColor) this.aura(dt);
    if (this.halo) (this.halo.rotation.y += dt * 0.8), (this.halo.position.y = this.def.height * 1.02 + 0.05 * Math.sin(performance.now() / 500));
    this.updatePhases();

    // 击退（任何状态都生效）
    if (this.kv.lengthSq() > 0.01) {
      this.moveBy(this.kv.x * dt, this.kv.z * dt);
      this.kv.multiplyScalar(Math.exp(-dt * 7));
    }
    this.vel.set(0, 0, 0);
    const hp = hero && hero.alive ? hero.pos : null;

    let poised = !1;
    if (stunned && this.def.ccMode === "poise" && this.ctrl) {
      // 首领：眩晕 / 冰冻先交给控制器（每种状态只问一次）；返回 "allow" 照常眩晕，否则移除并由控制器折算失衡值
      //   info.tag：状态 data.tag（如 player.js 满势斩打断传 "charge"）> 刚破盾（"shieldBreak"）> "status"
      let allow = !1;
      for (const id of ["stun", "freeze"]) {
        const s0 = st.get(id);
        if (!s0) continue;
        if (!s0.data._poised) {
          s0.data._poised = !0;
          const tag = s0.data.tag || (this.brokeAt && performance.now() - this.brokeAt < 250 ? "shieldBreak" : "status");
          const r = this.ctrl.onCC ? this.ctrl.onCC(id, s0.dur, { src: s0.src, tag }) : null;
          if (r === "allow") s0.data._allow = !0;
          else this.ctx.world.removeStatus(e, id);
        }
        if (s0.data._allow && st.has(id)) allow = !0;
      }
      poised = !allow;
    }
    if (stunned && !poised) {
      // 眩晕 / 冰冻：中断出招、原地不动
      if (this.atk) this.endAttack(!0);
      if (this.cur) this.cur.timeScale = st.has("freeze") ? 0 : 0.3;
      if (this.state !== "return") this.state = this.aggro ? "chase" : "idle";
      if (this.ctrl && this.ctrl.update) this.ctrl.update(dt); // 眩晕期间控制器的计时照走（处决演出、气竭等待等）
      return this.finish(dt);
    } else if (this.cur && this.cur.timeScale === 0) this.cur.timeScale = 1;

    switch (this.state) {
      case "idle":
        this.updateIdle(dt, hp, move);
        break;
      case "chase":
        this.updateChase(dt, hp, move);
        break;
      case "windup":
      case "strike":
      case "recover":
        this.updateAttack(dt, hp, move);
        break;
      case "return":
        this.updateReturn(dt, hp, move);
        break;
      case "winded":
        this.updateWinded(dt);
        break;
      case "down":
      case "cinematic":
        this.t -= dt;
        if (this.t <= 0) (this.state = this.aggro ? "chase" : "idle"), this.play("idle", 0.2);
        break;
      case "flinch":
        this.t -= dt;
        if (this.t <= 0) (this.state = "chase"), this.play("run", 0.12);
        break;
    }
    if (this.ctrl && this.ctrl.update) this.ctrl.update(dt);
    // 追击 / 游荡 / 回巢：叠加分离力（不扎堆），再移动
    if (this.state === "chase" || this.state === "idle" || this.state === "return") {
      this.vel.addScaledVector(this.sep, move * 0.9);
      const sp = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(move, 0.01) * 1.05;
      if (sp > cap) this.vel.multiplyScalar(cap / sp);
      if (sp > 0.05) this.moveBy(this.vel.x * dt, this.vel.z * dt);
    }
    return this.finish(dt);
  }

  finish(dt) {
    const p = this.root.position;
    const gh = height(p.x, p.z);
    p.y += (gh - p.y) * Math.min(1, dt * 14);
    // 朝向
    {
      const d = Math.atan2(Math.sin(this.wantYaw - this.yaw), Math.cos(this.wantYaw - this.yaw));
      this.yaw += d * Math.min(1, dt * (this.state === "windup" ? 14 : 9));
    }
    this.root.rotation.y = this.yaw;
    // 移动动画
    if (this.state === "chase" || this.state === "idle" || this.state === "return") {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.4) {
        const a = this.play("run", 0.18);
        if (a) a.timeScale = THREE.MathUtils.clamp(sp / (this.def.runRef ?? 5.2 * this.def.scale), 0.45, 1.6);
      } else this.play("idle", 0.25);
    }
  }

  updateIdle(dt, hp, move) {
    if (this.ignoreT > 0) this.ignoreT -= dt;
    // 撤开歇够了：回原来的巢
    //   主角还守在巢附近的高处（够不着）就继续等，免得回去又被点射
    if (this.regroupT > 0 && (this.regroupT -= dt) <= 0 && Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > 2) {
      const camping = hp && Math.hypot(hp.x - this.home.x, hp.z - this.home.z) < AI.fleeDist && !this.canReach(hp);
      if (camping) this.regroupT = 2;
      else return this.goHome("regroup");
    }
    // 视线惊动：进入视野且够得着（站在够不着的高台上不会惊动）
    if (hp && this.ignoreT <= 0 && _v.subVectors(hp, this.pos).setY(0).length() < this.cfg("sightRange") && this.canReach(hp)) return this.setAggro("sight");
    // 撤离后的休整（包括堵巢续等）不沿用或生成巢边闲逛目标；到时仍由上面正常回巢。
    if (this.regroupT > 0) return;
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
      this.wanderTo = Math.random() < 0.5 ? null : new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
    }
    if (this.wanderTo) this.steerTo(this.wanderTo, move * 0.3, dt, 0.4);
  }

  cfg(k) {
    const v = this.def[k];
    if (v != null) return v;
    if (k === "sightRange" && this.rank === "boss") return this.def.aggroRange ?? AI.sightRange.boss;
    return AI[k][this.rank];
  }
  // 进入仇恨。src："sight" 视线 / "hit" 受击 / "pull" 被同伴带起（不再连锁）/ "wave" 夜潮、召唤（猎手，不回巢）
  setAggro(src) {
    if (this.aggro || this.state === "dead") return;
    if (src === "wave") this.hunter = !0;
    this.aggro = !0;
    if (this.state === "idle" || this.state === "return") this.state = "chase";
    this.contactT = 0;
    this.unreachT = 0;
    this.routeT = 0;
    this.howled = !1;
    if (src === "pull" || src === "wave") return;
    // 只带起少量同组同伴（最近的 1–2 只），不整组扑上来
    const n = this.cfg("pullAllies");
    if (!n || this.pack == null) return;
    const mates = this.dir.list
      .filter((o) => o !== this && o.alive && !o.aggro && o.pack === this.pack && o.state !== "return" && o.pos.distanceTo(this.pos) < AI.pullRadius)
      .sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))
      .slice(0, n);
    for (const o of mates) o.setAggro("pull");
  }

  // 够得着主角吗：飞行的总能；直线能走过去；或者流场里有路
  canReach(hp) {
    if (this.entity.tags.has("flying")) return !0;
    const nav = this.dir.nav;
    if (!nav) return !0;
    if (Math.abs(hp.y - this.pos.y) < 1.2 && nav.lineClear(this.pos, hp)) return !0;
    return nav.reachable(this.pos, nav.flow(hp));
  }
  // 路线：direct 直线 / path 沿流场绕路 / none 到不了
  planRoute(hp) {
    if (this.entity.tags.has("flying") || !this.dir.nav) return "direct";
    const nav = this.dir.nav, dy = Math.abs(hp.y - this.pos.y);
    const d = Math.hypot(hp.x - this.pos.x, hp.z - this.pos.z);
    if (this.forcePathT <= 0 && dy < 1.2 && (d < 2.5 || nav.lineClear(this.pos, hp))) return "direct";
    this.flowRef = nav.flow(hp);
    return nav.reachable(this.pos, this.flowRef) ? "path" : "none";
  }

  rollChain() {
    const c = RHYTHM.chain[this.rank];
    return c ? c[0] + Math.floor(Math.random() * (c[1] - c[0] + 1)) : 99;
  }
  recoverTime(a) {
    if (this.rank === "normal") return a.recover;
    return a.big ? a.recoverBig ?? RHYTHM.big[this.rank] : a.recoverSmall ?? RHYTHM.small;
  }
  // 喘息：低头喘气、墨气外散、头顶淡金"隙"——不出招、不追击、受击不打断
  wind() {
    this.chain = 0;
    this.chainNeed = this.rollChain();
    this.state = "winded";
    this.t = this.def.winded ?? RHYTHM.winded[this.rank];
    this.windT = 0;
    const act = this.play("idle", 0.2);
    if (act) act.timeScale = 0.45;
    this.dir.bars.hint(this, "隙", this.t);
    this.ctx.world.events.emit("enemy:winded", { enemy: this.entity, dur: this.t });
  }
  // 境界 { stage, layer }：数据表 realm 优先；心魔同主角；否则按等级换算（精英再高一层）
  realm() {
    const d = this.def;
    if (d.mirrorHero) {
      const p = this.ctx.profile;
      return p && p.realm ? { ...p.realm } : { stage: 1, layer: 9 };
    }
    if (d.realm) {
      const [stage, layer] = String(d.realm).split(":").map(Number);
      return { stage, layer };
    }
    const L = this.level || 1; // 精英的 +1 已算进等级（levelFor）
    return L <= 9 ? { stage: 1, layer: Math.max(1, L) } : { stage: 2, layer: L - 9 };
  }

  // 头部大致位置（"隙"字、喘息墨气从这里冒出）
  headPos(out = new THREE.Vector3()) {
    if (this.headBone === undefined) {
      this.headBone = null;
      this.model.traverse((o) => o.isBone && o.name === "head" && (this.headBone = o));
    }
    if (this.headBone) return this.headBone.getWorldPosition(out).add(_v.set(0, 0.25 * this.def.scale, 0));
    const r = this.def.radius * 1.3;
    return out.set(this.pos.x + Math.sin(this.yaw) * r, this.pos.y + this.def.height * 0.72, this.pos.z + Math.cos(this.yaw) * r);
  }
  updateWinded(dt) {
    this.t -= dt;
    // 喘气：身体随呼吸起伏，头顶一缕缕墨气往上散
    this.model.position.y = -0.04 * this.def.scale * (1 + Math.sin(this.t * 7));
    if ((this.windT -= dt) <= 0) {
      this.windT = 0.22;
      const s = this.def.scale;
      this.headPos(_w);
      this.ctx.vfx.burst(_w, { color: 0x6a6f76, count: 3, speed: 0.3, size: 0.07 * (1 + s * 0.4), up: 1.8, y: 0, dur: 1.1 });
    }
    if (this.t <= 0) this.model.position.y = 0;
    if (this.t <= 0) {
      this.state = "chase";
      if (this.cur) this.cur.timeScale = 1;
    }
  }

  waypoint(dt) {
    const nav = this.dir.nav;
    this.wpT = (this.wpT || 0) - dt;
    if (this.wp && this.wpT > 0 && Math.hypot(this.wp.x - this.pos.x, this.wp.z - this.pos.z) > 0.45) return this.wp;
    const nx = nav.next(this.pos, this.flowRef, this.wpV || (this.wpV = new THREE.Vector3()));
    this.wpFrom = (this.wpFrom || new THREE.Vector3()).copy(this.pos);
    this.wp = nx;
    this.wpT = 1.6;
    return nx;
  }

  // 追击与动作边界共用距离脱战条件；猎手豁免，沿流场绕路仍保留原放宽系数。
  beyondLeash() {
    return !this.hunter && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > this.cfg("leashRange") * (this.route === "path" ? 1.6 : 1);
  }

  // 回巢（脱战）：免伤（见 index.js）、回血，回到巢后一段时间内不被视线惊动
  goHome(reason = "leash") {
    if (this.atk) this.endAttack(!0);
    this.aggro = !1;
    this.state = "return";
    this.t = 0;
    this.stuckT = 0;
    this.dir.releaseToken(this);
    this.ignoreT = AI.ignoreAfter;
    this.ctx.world.events.emit("enemy:leash", { enemy: this.entity, reason });
  }
  // 到不了主角：先撤到主角够不着的地方（离主角 fleeDist 米外、可站立），在那里歇 regroup 秒再回原来的巢（守场的精英不会丢了场地）
  flee(hp) {
    const away = _w.subVectors(this.pos, hp).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    away.normalize();
    const base = Math.atan2(away.x, away.z), nav = this.dir.nav;
    const need = Math.max(4, AI.fleeDist - Math.hypot(this.pos.x - hp.x, this.pos.z - hp.z));
    // 先找走得到的点；都不行就退而求其次（只要可站），回巢逻辑自己会绕路 / 卡住就遁走
    for (const strict of [!0, !1])
      for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2])
        for (const r of [need, need * 0.7, need * 0.45]) {
          const x = this.pos.x + Math.sin(base + da) * r, z = this.pos.z + Math.cos(base + da) * r;
          const h = height(x, z);
          if (h < -0.8 || Math.hypot(x - hp.x, z - hp.z) < 9 || (nav && !nav.cell(nav.idx(x), nav.idx(z)).ok)) continue;
          if (strict && nav && !nav.lineClear(this.pos, _v.set(x, h, z)) && !(nav.canReach ? nav.canReach(this.pos, _v) : nav.reachable(this.pos, nav.flow(_v)))) continue;
          this.retreat = new THREE.Vector3(x, h, z);
          return this.goHome("unreachable");
        }
    this.goHome("unreachable");
  }
  updateReturn(dt, hp, move) {
    const e = this.entity, max = e.stats.get("hp");
    e.hp = Math.min(max, e.hp + max * AI.returnRegen * dt);
    this.t += dt;
    const dest = this.retreat || this.home;
    const d = Math.hypot(dest.x - this.pos.x, dest.z - this.pos.z);
    if (d < 1.2 || this.t > 25) {
      if (d >= 1.2) this.root.position.set(dest.x, height(dest.x, dest.z), dest.z); // 实在回不去：遁回去
      e.hp = Math.min(max, e.hp + max * AI.arriveHeal);
      this.state = "idle";
      this.wanderT = 1.5;
      if (this.retreat) (this.retreat = null), (this.regroupT = AI.regroup), (this.wanderTo = null);
      return;
    }
    const nav = this.dir.nav;
    let to = dest;
    if (nav && !this.entity.tags.has("flying") && !nav.lineClear(this.pos, dest)) to = nav.next(this.pos, nav.flow(dest), _w) || dest;
    // 回巢卡住：标记不通的边；连续卡 3 秒就遁回巢里
    if ((this.rtT = (this.rtT || 0) + dt) >= 0.5) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      this.lastPos.copy(this.pos);
      this.rtT = 0;
      this.stuckT = moved < 0.15 ? this.stuckT + 0.5 : 0;
      if (this.stuckT >= 1 && nav && to !== dest) nav.block(this.pos, to);
      if (this.stuckT >= 3) this.t = 99;
    }
    this.steerTo(to, move * AI.returnSpeed, dt, 0.2);
  }

  updateChase(dt, hp, move) {
    if (!hp) return this.goHome("heroGone");
    const toH = _v.subVectors(hp, this.pos).setY(0);
    const dist = toH.length();
    const dy = hp.y - this.pos.y;
    const heroR = this.dir.hero ? this.dir.hero.radius : 0.4;
    // 脱战：离巢太远 / 太久没接触
    // 绕路途中（流场在缩短）算作仍在接触，离巢距离也放宽
    const pathing = this.route === "path";
    this.contactT += pathing ? dt * 0.25 : dt;
    if (dist < this.damageReach + 2.5 && Math.abs(dy) < AI.meleeDy) this.contactT = 0;
    if (this.beyondLeash()) return this.goHome("leash");
    if (this.contactT > this.cfg("leashTime")) return this.goHome("timeout");
    // 路线（0.4 秒重算一次）与卡住检测
    this.forcePathT -= dt;
    if ((this.routeT -= dt) <= 0) {
      this.routeT = 0.4;
      this.route = this.planRoute(hp);
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      const wantMove = dist > this.damageReach && this.state === "chase" && move > 0;
      this.stuckT = moved < 0.12 && wantMove ? this.stuckT + 0.4 : 0;
      if (this.stuckT >= AI.stuck && this.route === "direct") (this.forcePathT = 2.5), (this.stuckT = 0);
      this.lastPos.copy(this.pos);
    }
    const unreachable = this.route === "none";
    this.unreachT = unreachable ? this.unreachT + dt : 0;
    // 到不了：有远程招式就在远处打，否则（嚎叫之后）撤开脱战
    if (unreachable && this.unreachT > AI.unreachGiveUp && !(this.hasRanged && dist < this.reach + 2)) {
      const howl = this.def.attacks.find((a) => a.buff && this.cool[a.id] <= 0);
      if (howl && !this.howled) return (this.howled = !0), this.startAttack(howl, hp);
      return this.flee(hp);
    }
    // 选一个可用的招式（距离合适、冷却完毕、同伴条件满足；高差太大时近战打不到就不出）
    let ready = null;
    const avail = this.ctrl && this.ctrl.pickAttack ? [] : null;
    for (const a of this.def.attacks) {
      if (this.cool[a.id] > 0) continue;
      if (a.rear && !this.heroBehind(hp)) continue;
      const ranged = a.shape === "projectile" || a.at === "target" || a.at === "behind" || a.buff;
      if (!ranged && (Math.abs(dy) > AI.meleeDy || unreachable)) continue;
      if (a.needAllies && this.dir.alliesNear(this, a.buff ? a.buff.radius : 10) < a.needAllies) continue;
      if (a.below && this.entity.hp > this.entity.stats.get("hp") * a.below) continue;
      ready = ready || a;
      if (avail) {
        if (dist >= a.minDist && dist <= a.maxDist + heroR) avail.push(a);
        continue;
      }
      if (dist >= a.minDist && dist <= a.maxDist + heroR && (a.buff || this.dir.requestToken(this))) return this.startAttack(a, hp);
    }
    if (avail && avail.length) {
      const pick = this.ctrl.pickAttack(avail, dist);
      if (pick === undefined) {
        for (const a of avail) if (a.buff || this.dir.requestToken(this)) return this.startAttack(a, hp);
      } else if (pick && (pick.buff || this.dir.requestToken(this))) return this.startAttack(pick, hp);
    }
    // 绕路：沿流场走向坡道（这一步走不动就把这条边标成不通，下次重算绕开）
    // 走格子中心的路点：到了（0.45 米内）或超时才取下一个，避免在格子边界上来回抖
    if (this.route === "path" && this.flowRef) {
      const wp = this.waypoint(dt);
      if (wp) {
        if (this.stuckT >= 0.4) this.dir.nav.block(this.wpFrom || this.pos, wp), (this.stuckT = 0), (this.routeT = 0), (this.wp = null);
        else return void this.steerTo(wp, move, dt, 0.05);
      }
    }
    if (unreachable) {
      // 等待撤离 / 远程：退到射程边缘，不贴在崖下
      const want = Math.max(this.def.orbit[0], Math.min(this.reach * 0.8, 9));
      if (dist < want) this.steerTo(_w.set(this.pos.x - toH.x, 0, this.pos.z - toH.z), move, dt, 0.1);
      this.wantYaw = Math.atan2(toH.x, toH.z);
      return;
    }
    // 移动：有招可出且轮得到 → 上前；否则在中距离绕圈压迫
    this.strafeT -= dt;
    if (this.strafeT <= 0) (this.strafeT = 1.5 + Math.random() * 2.5), Math.random() < 0.4 && (this.strafe *= -1);
    let want;
    if (ready && !ready.buff && this.dir.canAttack(this)) {
      want = THREE.MathUtils.clamp(ready.maxDist * 0.75, ready.minDist + 0.3, 99);
      this.orbitA = Math.atan2(this.pos.x - hp.x, this.pos.z - hp.z);
    } else {
      want = this.orbitR;
      this.orbitA += this.strafe * dt * (move / Math.max(2, dist)) * 0.7;
    }
    if (dist > this.def.orbit[1] + 3) want = this.def.orbit[1];
    const tx = hp.x + Math.sin(this.orbitA) * want, tz = hp.z + Math.cos(this.orbitA) * want;
    const k = dist > want + 4 ? 1 : 0.85;
    this.steerTo(_w.set(tx, 0, tz), move * k, dt, 0.25);
    this.wantYaw = dist < 7 ? Math.atan2(toH.x, toH.z) : this.wantYaw;
  }

  steerTo(target, speed, dt, stopR) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < stopR || speed <= 0) return;
    const s = Math.min(speed, d / Math.max(dt, 1e-3));
    this.vel.x += (dx / d) * s;
    this.vel.z += (dz / d) * s;
    this.wantYaw = Math.atan2(dx, dz);
  }

  // 移动并处理碰撞：先整步，不行则沿轴滑动
  // 飞行的（蝠妖）越过高差与树石，只避开水面 / 深渊
  moveBy(dx, dz) {
    const p = this.pos, from = height(p.x, p.z), cs = this.ctx.colliders, r = this.def.radius * 0.7;
    // 已经陷在碰撞体里（刷在树边、被击退进去）时只检查高差，先让它走出来
    const inside = !walkable(p.x, p.z, from, cs, r);
    const ok = this.entity.tags.has("flying") ? (x, z) => height(x, z) > -0.8 : inside ? (x, z) => walkable(x, z, from, null, r) : (x, z) => walkable(x, z, from, cs, r);
    if (ok(p.x + dx, p.z + dz)) (p.x += dx), (p.z += dz);
    else if (ok(p.x + dx, p.z)) p.x += dx;
    else if (ok(p.x, p.z + dz)) p.z += dz;
    else return !1;
    return !0;
  }

  // ---------------- 出招 ----------------
  startAttack(a, hp, combo = 0) {
    this.state = "windup";
    this.t = 0;
    const aim = _v.subVectors(hp, this.pos).setY(0);
    if (aim.lengthSq() < 1e-4) aim.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    aim.normalize();
    const windup = combo > 0 ? a.comboWindup || a.windup : a.windup;
    this.atk = { a, combo, windup, aim: aim.clone(), origin: this.pos.clone(), tele: null, hit: !1, centers: null };
    if (combo === 0) this.comboHit = !1;
    if (a.at === "target") this.atk.centers = this.targetCenters(a, hp);
    else if (a.at === "behind") {
      // 主角身后落点（潜影现身）：主角朝向取其相对自己的方向
      const back = _w.subVectors(hp, this.pos).setY(0).normalize().multiplyScalar(a.behindDist ?? 2.5);
      const x = hp.x + back.x, z = hp.z + back.z;
      this.atk.centers = [new THREE.Vector3(x, height(x, z), z)];
    }
    this.atk.channel = !!a.channel;
    this.wantYaw = Math.atan2(aim.x, aim.z);
    this.makeTelegraph();
    if (a.hide) this.submerged = !0;
    const anim = a.anims ? a.anims[combo % a.anims.length] : a.anim;
    if (combo > 0 && this.cur === this.actions[anim]) this.cur = null; // 同一动画的连段：重新播放
    const act = this.play(anim, 0.1, !0);
    if (act) act.timeScale = a.animHit / windup; // 放慢蓄势，正好在预警结束时出手
    this.ctx.world.events.emit("enemy:telegraph", { enemy: this.entity, attack: a.id, dur: windup, channel: !!a.channel });
    if (this.ctrl && this.ctrl.onStartAttack) this.ctrl.onStartAttack(a, combo);
  }

  // 主角是否在背后（±60° 的背向扇区）
  heroBehind(hp) {
    const dx = hp.x - this.pos.x, dz = hp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d < -0.5;
  }
  // 外部（首领控制器）切状态：down 倒地 / cinematic 演出 / chase 等
  setState(name, dur = 0) {
    if (this.state === "dead") return;
    if (this.atk) this.endAttack(!0);
    this.state = name;
    this.t = dur;
    if (name === "down") this.play(this.actions.down ? "down" : "hit", 0.08, !0);
  }

  // 落点圈：第一个在主角脚下，其余在 spread 范围内散开
  targetCenters(a, hp) {
    const out = [new THREE.Vector3(hp.x, height(hp.x, hp.z), hp.z)];
    for (let i = 1; i < (a.multi || 1); i++) {
      for (let k = 0; k < 12; k++) {
        const ang = Math.random() * Math.PI * 2, r = a.radius * 1.2 + Math.random() * (a.spread || 3);
        const x = hp.x + Math.sin(ang) * r, z = hp.z + Math.cos(ang) * r;
        if (k < 11 && out.some((c) => Math.hypot(c.x - x, c.z - z) < a.radius * 1.5)) continue;
        out.push(new THREE.Vector3(x, height(x, z), z));
        break;
      }
    }
    return out;
  }

  makeTelegraph() {
    const k = this.atk, a = k.a, fx = this.dir.fx, o = k.origin;
    if (k.tele) k.tele.cancel();
    if (k.centers) {
      const rings = k.centers.map((c) => this.ctx.vfx.ring(c, a.radius, { fill: 1, warn: !0, dur: k.windup, color: a.telegraphColor ?? INKC.red }));
      k.tele = { cancel: () => rings.forEach((it) => (it.t = it.dur)), rings, ring: !0 };
    } else if (a.shape === "projectile") k.tele = fx.line(o, k.aim, a.range, Math.max(0.3, a.radius * 1.4), k.windup, a.telegraphColor);
    else if (a.shape === "line") k.tele = fx.line(o, k.aim, a.length, a.width, k.windup, a.telegraphColor);
    else if (a.shape === "arc") k.tele = fx.sector(o, k.aim, a.radius, (a.angle * Math.PI) / 180, k.windup, a.telegraphColor);
    else {
      const it = this.ctx.vfx.ring(o, a.radius, { fill: 1, warn: !0, dur: k.windup, color: a.telegraphColor ?? INKC.red });
      k.tele = { cancel: () => (it.t = it.dur), mesh: it.mesh, ring: !0 };
    }
  }

  updateAttack(dt, hp, move) {
    const k = this.atk, a = k.a;
    this.t += dt;
    if (this.state === "windup") {
      // 前段持续转向主角（预警跟着转），之后锁定方向，留给主角闪避的余地
      if (hp && k.centers && k.centers.length === 1 && this.t < k.windup * (a.track ?? 0.5)) {
        // 落点圈前段跟着主角走
        const c = k.centers[0];
        c.lerp(_w.set(hp.x, height(hp.x, hp.z), hp.z), Math.min(1, dt * 8));
        const m = k.tele.rings[0].mesh;
        if (m) m.position.set(c.x, c.y + 0.06, c.z);
      } else if (hp && !k.centers && this.t < k.windup * (a.track ?? 0.5) && a.shape !== "circle") {
        const aim = _v.subVectors(hp, this.pos).setY(0);
        if (aim.lengthSq() > 1e-4) {
          aim.normalize();
          k.aim.lerp(aim, Math.min(1, dt * 10)).normalize();
          this.wantYaw = Math.atan2(k.aim.x, k.aim.z);
          k.origin.copy(this.pos);
          if (k.tele && k.tele.mesh && !k.tele.ring) {
            k.tele.mesh.position.set(k.origin.x, k.origin.y + 0.12, k.origin.z);
            k.tele.mesh.rotation.y = Math.atan2(k.aim.x, k.aim.z) + (a.shape === "arc" ? Math.PI : 0);
          }
        }
      }
      if (this.t >= k.windup) return this.strike();
    } else if (this.state === "strike") {
      // 冲扑位移
      if (a.lunge > 0 && move > 0) {
        const sp = a.lunge / a.active;
        if (!this.moveBy(k.aim.x * sp * dt, k.aim.z * sp * dt)) {
          this.t = Math.max(this.t, a.active);
          if (this.ctrl && this.ctrl.onLungeBlocked && !k.blocked) {
            k.blocked = !0;
            let best = null, bd = 1e9;
            for (const c of this.ctx.colliders || []) {
              const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z) - c.r;
              if (d < bd) (bd = d), (best = c);
            }
            this.ctrl.onLungeBlocked(bd < 2.5 ? best : null);
            // 撞柱可能同步威折并清掉攻击；不能用旧 k 把 down 等新状态覆写成 recover。
            if (this.atk !== k || this.state !== "strike") return;
          }
        }
      }
      // 出招期间主角冲进冲扑路径也算命中（每招只伤一次）
      if (!k.hit && a.damage && a.shape !== "projectile" && hp && this.inZone(hp)) {
        this.hitHero();
        if (this.atk !== k || this.state !== "strike") return;
      }
      if (this.t >= a.active) {
        this.state = "recover";
        this.t = 0;
        // 大招落空（整个连段一下都没打中）：踉跄一下，奖励会躲的人
        const last = k.combo + 1 >= (a.combo || 1);
        if (last && this.rank !== "normal" && a.big && a.damage && a.shape !== "projectile" && !this.comboHit) {
          k.missT = RHYTHM.miss;
          this.play("hit", 0.08, !0);
          this.ctx.world.events.emit("enemy:whiff", { enemy: this.entity, attack: a.id });
        }
      }
    } else if (this.state === "recover") {
      const last = k.combo + 1 >= (a.combo || 1);
      if (this.t >= (last ? this.recoverTime(a) + (k.missT || 0) : a.recover * 0.35)) {
        if (k.combo + 1 < (a.combo || 1) && hp) {
          // 已启动的一段照常完成；越界时不再续段，专用控制器仍自行管理场地。
          if (!this.ctrl && this.beyondLeash()) return this.goHome("leash");
          return this.startAttack(a, hp, k.combo + 1);
        }
        this.endAttack();
      }
    }
  }

  strike() {
    const k = this.atk, a = k.a;
    this.state = "strike";
    this.t = 0;
    if (this.cur) this.cur.timeScale = 1;
    if (a.strikeAnim) this.play(a.strikeAnim, 0.05, !0);
    if (a.teleport && k.centers) {
      // 潜水突袭：从落点破水而出
      const c = k.centers[0];
      this.root.position.set(c.x, height(c.x, c.z), c.z);
      k.origin.copy(this.root.position);
      this.ctx.vfx.burst(c, { color: this.def.auraColor ?? INKC.blue, count: 40, speed: 7, size: 0.3, up: 7, y: 0.2 });
    }
    if (a.hide) this.submerged = !1;
    this.ctx.world.events.emit("enemy:strike", { enemy: this.entity, attack: a.id });
    if (this.atk !== k || this.state !== "strike") return;
    if (this.ctrl && this.ctrl.onStrike) {
      this.ctrl.onStrike(a);
      if (this.atk !== k || this.state !== "strike") return;
    }
    if (a.summon) {
      this.summon(a.summon);
      if (this.atk !== k || this.state !== "strike") return;
    }
    if (a.buff) return this.howl();
    if (a.shape === "projectile") return this.dir.proj.fire(this, a, k);
    if (k.centers && !a.teleport) for (const c of k.centers) this.ctx.vfx.pillar(c, { color: a.telegraphColor ?? INKC.blue, radius: a.radius * 0.6, height: 4, dur: 0.5 });
    const hp = this.dir.hero && this.dir.hero.alive ? this.dir.hero.pos : null;
    if (a.damage && hp && this.inZone(hp)) this.hitHero();
  }

  // 主角是否在本招的危险区内（区域在预警锁定时确定）
  inZone(p) {
    const k = this.atk, a = k.a, o = k.origin, hr = this.dir.hero ? this.dir.hero.radius : 0.4;
    if (k.centers) return k.centers.some((c) => Math.abs(p.y - c.y) < 2.2 && Math.hypot(p.x - c.x, p.z - c.z) <= a.radius + hr);
    const dx = p.x - o.x, dz = p.z - o.z;
    if (Math.abs(p.y - o.y) > 2.2) return !1;
    if (a.shape === "line") {
      const along = dx * k.aim.x + dz * k.aim.z, side = Math.abs(dx * k.aim.z - dz * k.aim.x);
      return along >= -hr && along <= a.length + hr && side <= a.width / 2 + hr;
    }
    const d = Math.hypot(dx, dz);
    if (a.shape === "arc") {
      if (d > a.radius + hr) return !1;
      if (d < hr + 0.3) return !0;
      const cosA = (dx * k.aim.x + dz * k.aim.z) / d;
      return Math.acos(THREE.MathUtils.clamp(cosA, -1, 1)) <= (a.angle * Math.PI) / 360 + Math.atan(hr / d);
    }
    return d <= a.radius + hr;
  }

  hitHero() {
    const k = this.atk, a = k.a, hero = this.dir.hero;
    k.hit = !0;
    this.comboHit = !0;
    this.contactT = 0;
    const info = this.ctx.world.dealDamage(this.entity, hero, {
      base: a.damage.base,
      scale: { atk: a.damage.atk },
      knock: a.knock,
      element: a.element,
      dir: k.centers ? _w.subVectors(hero.pos, k.centers[0]).setY(0).normalize().clone() : k.aim.clone(),
      tags: ["melee", "enemy", a.id],
      pos: hero.pos,
    });
    // beforeDamage / 反击事件也能威折、转演出或替换招式；已结算伤害不回滚，旧招不再追加效果。
    if (this.atk !== k || this.state !== "strike") return;
    if (info) this.ctx.vfx.burst(hero.pos, { color: INKC.red, count: 8, speed: 3, size: 0.12, up: 2, y: 1 });
    if (info && a.status && STATUS[a.status.id]) this.ctx.world.applyStatus(hero, a.status.id, { dur: a.status.dur, src: this.entity });
  }

  // 召唤同族（青牙嚎叫召狼）：同时存活不超过 max；召来的不掉落
  // 召唤同族（青牙嚎叫召狼）：同时存活不超过 max；召来的不掉落。
  // 有召唤点（关卡 boss.adds 狼窝）时从离自己 30 米内的狼窝里轮流冲出，否则在身后刷出
  summon(s) {
    const mine = this.dir.list.filter((o) => o.alive && o.summoner === this).length;
    const n = Math.min(s.n, (s.max ?? 99) - mine);
    const dens = (this.adds || []).filter((p) => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 30);
    for (let i = 0; i < n; i++) {
      if (dens.length) {
        const p = dens[(this.addIdx = ((this.addIdx ?? -1) + 1) % dens.length)];
        const x = p.x + (Math.random() - 0.5) * 1.5, z = p.z + (Math.random() - 0.5) * 1.5;
        const e = this.dir.spawn(s.type, new THREE.Vector3(x, height(x, z), z), { aggro: !0, pack: this.pack, region: this.region, noLoot: !0 });
        if (e) {
          e.summoner = this;
          this.ctx.vfx.burst(e.pos, { color: this.def.auraColor ?? INKC.ink, count: 16, speed: 3, size: 0.22, up: 3, y: 0.4 });
          continue;
        }
      }
      const ang = this.yaw + Math.PI + (i - (n - 1) / 2) * 0.9;
      for (let k = 0; k < 8; k++) {
        const r = 3.5 + k * 0.5;
        const x = this.pos.x + Math.sin(ang + k * 0.4) * r, z = this.pos.z + Math.cos(ang + k * 0.4) * r;
        if (!walkable(x, z, height(x, z), this.ctx.colliders, 0.5)) continue;
        const e = this.dir.spawn(s.type, new THREE.Vector3(x, height(x, z), z), { aggro: !0, pack: this.pack, region: this.region, noLoot: !0 });
        if (e) e.summoner = this;
        break;
      }
    }
  }

  howl() {
    let woke = 0;
    const a = this.atk.a, b = a.buff, w = this.ctx.world;
    this.ctx.vfx.ring(this.pos, b.radius, { color: a.telegraphColor ?? INKC.purple, dur: 0.7, width: 0.04 });
    this.ctx.vfx.burst(this.pos, { color: INKC.purple, count: 24, speed: 4, size: 0.2, up: 4, y: 1.6 });
    for (const o of this.dir.list) {
      if (!o.alive || o.pos.distanceTo(this.pos) > b.radius) continue;
      if (!o.aggro && o !== this) {
        if (++woke > 2) continue; // 嚎叫只多叫醒两只（其余没被惊动的不受影响）
        o.setAggro("pull");
      }
      o.entity.stats.removeSource("howl");
      o.entity.stats.addAll(b.mods, "howl");
      o.buffT = b.dur;
    }
    w.events.emit("enemy:buff", { enemy: this.entity, id: a.id, dur: b.dur });
  }

  endAttack(interrupted = !1) {
    const k = this.atk;
    if (!k) return;
    if (k.tele) k.tele.cancel();
    this.cool[k.a.id] = k.a.cooldown * (interrupted ? 0.5 : 1) * (0.85 + Math.random() * 0.3);
    this.atk = null;
    this.submerged = !1;
    this.dir.releaseToken(this);
    if (this.state !== "dead") this.state = "chase";
    // 精英 / 首领连续出招后喘息（控制器返回 true 时由它接管）
    if (this.ctrl && this.ctrl.onEndAttack && this.ctrl.onEndAttack(k.a, interrupted)) return;
    // 整招已完成并清理，越界先回巢，不额外进入喘息；取消路径与专用控制器不变。
    if (!interrupted && !this.ctrl && this.state === "chase" && this.beyondLeash()) return this.goHome("leash");
    if (!interrupted && this.rank !== "normal" && this.state === "chase" && ++this.chain >= this.chainNeed) this.wind();
  }

  get attacking() {
    return this.state === "windup" || this.state === "strike" || this.state === "recover";
  }

  // ---------------- 受击与死亡 ----------------
  onHit(info) {
    if (!this.alive) return;
    this.setAggro("hit");
    this.contactT = 0;
    this.ignoreT = 0;
    this.dir.bars.touch(this);
    const resist = this.def.knockResist || 0;
    const dir = info.dir ? _v.copy(info.dir).setY(0) : info.attacker ? _v.subVectors(this.pos, info.attacker.pos).setY(0) : _v.set(0, 0, 0);
    if (dir.lengthSq() > 1e-6) dir.normalize();
    const knock = (info.knock || 0) * (1 - resist);
    if (knock > 0) this.kv.addScaledVector(dir, knock * 6);
    // 读条型前摇：被指定标签的伤害打断
    const k = this.atk;
    if (k && k.channel && this.state === "windup") {
      const brk = k.a.channelBreak || ["spell", "charge"];
      const byCtrl = this.ctrl && this.ctrl.onChannelHit;
      if (byCtrl ? this.ctrl.onChannelHit(info, k.a) : (info.tags || []).some((t) => brk.includes(t))) {
        this.ctx.world.events.emit("enemy:interrupt", { enemy: this.entity, attack: k.a.id, by: info.tags });
        if (this.ctrl && this.ctrl.onChannelBreak) this.ctrl.onChannelBreak(k.a, info);
        this.endAttack(!0);
        this.state = "flinch";
        this.t = 0.6;
        this.play("hit", 0.05, !0);
        return;
      }
    }
    if (this.ctrl && this.ctrl.onHit && this.ctrl.onHit(info)) return;
    const armored = this.def.superArmor && (this.attacking || this.flinchCd > 0);
    if (armored || this.state === "winded" || this.state === "down" || this.state === "cinematic") return;
    // 轻型敌人：任何受击都会打断预警 / 出招；硬直有 0.9 秒间隔（连续远程点射不能把它钉在原地）；首领只在空闲时小幅踉跄，间隔更长
    if (this.atk) this.endAttack(!0);
    if (this.flinchCd > 0) return;
    this.state = "flinch";
    this.t = this.def.superArmor ? 0.18 : 0.3;
    this.flinchCd = this.def.superArmor ? 2.5 : 0.9;
    this.play("hit", 0.05, !0);
  }

  onDeath(info) {
    if (this.ctrl && this.ctrl.onDeath) this.ctrl.onDeath(info);
    if (this.atk) this.endAttack(!0);
    this.submerged = !1;
    this.state = "dead";
    this.deadT = 0;
    this.entity.stats.removeSource("howl");
    this.play("die", 0.08, !0);
    this.dir.bars.remove(this);
    this.dir.onEnemyDeath(this, info);
  }

  // 动画 LOD（纯表现，AI 与出招计时不依赖动画）：画面外（含影子余量）的敌人不画、不推进骨骼动画，
  // 时间累计起来，回到画面时一次补上（循环动作看不出差别）。整局全图的敌人原来每帧都画（frustumCulled 关着）、都算骨骼。
  animate(dt) {
    const vis = this.dir.inView ? this.dir.inView(this.pos, 3 + 6 * (this.def.scale || 1)) : !0;
    if (this.root.visible !== vis) this.root.visible = vis;
    this.animAcc = (this.animAcc || 0) + dt;
    if (!vis) return void (this.animAcc = Math.min(this.animAcc, 2));
    this.mixer.update(this.animAcc);
    this.animAcc = 0;
  }

  updateDead(dt) {
    this.deadT += dt;
    const vis = this.dir.inView ? this.dir.inView(this.pos, 3 + 6 * (this.def.scale || 1)) : !0;
    if (this.root.visible !== vis) this.root.visible = vis;
    this.mixer.update(dt + (this.animAcc || 0)); // 倒地动作照常推进（留尸的姿势要定在倒地那一帧）
    this.animAcc = 0;
    // 留尸（有掉落时由搜取容器 src/game/run/containers.js 设置）：不化墨，倒地定格后把身体交给容器
    if (this.keepBody) return void (this.deadT > 1.3 && this.dispose());
    // 倒地后化为墨散去
    if (this.deadT > 0.9) {
      const k = Math.min(1, (this.deadT - 0.9) / 0.6);
      for (const m of this.mats) (m.transparent = !0), (m.opacity = 1 - k);
      this.model.position.y = -k * 0.3;
      if (!this._burst) {
        this._burst = !0;
        this.ctx.vfx.burst(this.pos, { color: INKC.ink, count: 18 * this.def.scale, speed: 2.5, size: 0.24 * this.def.scale, up: 1.2, y: 0.5, dur: 0.9 });
      }
      if (k >= 1) this.dispose();
    }
  }

  aura(dt) {
    this.auraT -= dt;
    if (this.auraT > 0) return;
    this.auraT = 0.09;
    const s = this.def.scale;
    const p = _w.set(this.pos.x + (Math.random() - 0.5) * 0.8 * s, this.pos.y + 0.6 * s, this.pos.z + (Math.random() - 0.5) * 0.8 * s);
    this.ctx.vfx.burst(p, { color: this.def.auraColor ?? INKC.purple, count: 2, speed: 0.4, size: 0.16, up: 2.2, y: 0.3, dur: 0.7 });
  }

  dispose() {
    if (this.removed) return;
    this.removed = !0;
    this.dir.releaseToken(this);
    // 留尸：身体（root、材质）归容器管理，姿势定格（不 stopAllAction，否则骨骼会回到绑定姿势）
    if (!this.keepBody) {
      this.ctx.scene.remove(this.root);
      for (const m of this.mats) m.dispose();
      this.mixer.stopAllAction();
    }
    this.ctx.world.remove(this.entity);
  }
}
