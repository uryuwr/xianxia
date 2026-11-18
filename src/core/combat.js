// 战斗核心（三方共用的契约，修改需同步各模块）：
//   - Stats：属性与加成（基础值 + 固定加成 → 百分比加成 → 独立乘区）
//   - CombatWorld：实体注册、范围查询、伤害结算、状态效果、事件
// 主角、敌人、法术/法宝/阵法都只通过这里互相影响，不直接调用彼此的内部实现。
import * as THREE from "three";

// ---------------- 事件 ----------------
export class Events {
  constructor() {
    this.m = new Map();
  }
  on(name, fn) {
    if (!this.m.has(name)) this.m.set(name, []);
    this.m.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const l = this.m.get(name);
    if (l) l.splice(l.indexOf(fn) >>> 0, 1);
  }
  emit(name, data) {
    const l = this.m.get(name);
    if (!l) return;
    for (const fn of l.slice())
      try {
        fn(data);
      } catch (e) {
        console.error(`[events] ${name}`, e);
      }
  }
}

// ---------------- 属性 ----------------
// 属性名（统一使用）：
//   hp 气血上限  mp 真气上限  hpRegen mpRegen 每秒回复
//   atk 攻击（普攻、法宝的物理部分）  spell 法力（法术、阵法）  def 防御
//   crit 暴击率(0~1)  critDmg 暴击伤害倍率(默认 1.5)  aspd 攻速倍率  cdr 冷却缩减(0~0.6)  move 移速(米/秒)
//   metal wood water fire earth 五行强度（状态效果强度、反应伤害加成，默认 0）
//   res_metal … res_earth 五行抗性(0~1)
//   dmg 总伤害加成（独立乘区由 more 修正提供）
export const STAT_DEFAULTS = {
  hp: 100, mp: 100, hpRegen: 0, mpRegen: 4, atk: 10, spell: 10, def: 0,
  crit: 0.05, critDmg: 1.5, aspd: 1, cdr: 0, move: 6, dmg: 0,
  metal: 0, wood: 0, water: 0, fire: 0, earth: 0,
  res_metal: 0, res_wood: 0, res_water: 0, res_fire: 0, res_earth: 0,
};

// 加成：{ stat, type: "flat" | "pct" | "more", value, source }
//   最终值 = (基础 + Σflat) × (1 + Σpct) × Π(1 + more)
export class Stats {
  constructor(base = {}) {
    this.base = { ...STAT_DEFAULTS, ...base };
    this.mods = [];
    this._cache = new Map();
  }
  add(mod) {
    this.mods.push(mod);
    this._cache.clear();
    return mod;
  }
  addAll(mods, source) {
    for (const m of mods) this.add({ ...m, source });
  }
  removeSource(source) {
    this.mods = this.mods.filter((m) => m.source !== source);
    this._cache.clear();
  }
  setBase(stat, v) {
    this.base[stat] = v;
    this._cache.clear();
  }
  get(stat) {
    if (this._cache.has(stat)) return this._cache.get(stat);
    let flat = this.base[stat] ?? 0, pct = 0, more = 1;
    for (const m of this.mods) {
      if (m.stat !== stat) continue;
      if (m.type === "pct") pct += m.value;
      else if (m.type === "more") more *= 1 + m.value;
      else flat += m.value;
    }
    const v = flat * (1 + pct) * more;
    this._cache.set(stat, v);
    return v;
  }
}

// ---------------- 实体接口 ----------------
// 任何可被攻击 / 能攻击的东西都实现：
//   id, team ("player" | "enemy"), pos: Vector3（脚底）, radius（受击半径，米）, height
//   stats: Stats, hp, mp（可选）, alive
//   statuses: Map<id, {id, t, dur, stacks, src, data}>
//   onHit?(info)       受击回调：击退、硬直、受击闪白（info 见 dealDamage 返回值）
//   onDeath?(info)     死亡回调
//   tags?: Set<string> （"elite"、"boss"、"flying" …）
let nextId = 1;
export function makeEntity(fields) {
  return {
    id: nextId++,
    team: "enemy",
    pos: new THREE.Vector3(),
    radius: 0.5,
    height: 1.6,
    alive: !0,
    statuses: new Map(),
    tags: new Set(),
    ...fields,
  };
}

// ---------------- 状态效果注册表 ----------------
// STATUS[id] = { maxStacks, onApply(world, e, s), onTick(world, e, s, dt), onExpire(world, e, s), mods?(s) → 属性加成数组 }
// 由技能模块（五行状态与反应）填充
export const STATUS = {};

// ---------------- 战斗世界 ----------------
const _v = new THREE.Vector3();
export class CombatWorld {
  constructor() {
    this.entities = [];
    this.events = new Events();
    this.time = 0;
    this.timeScale = 1; // 慢动作
    this._stop = 0; // 顿帧
  }
  add(e) {
    if (!e.stats) e.stats = new Stats();
    if (e.hp == null) e.hp = e.stats.get("hp");
    if (e.mp == null) e.mp = e.stats.get("mp");
    this.entities.push(e);
    this.events.emit("spawn", { entity: e });
    return e;
  }
  remove(e) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
  }
  get player() {
    return this.entities.find((e) => e.team === "player");
  }
  // 圆形范围查询（水平距离，计入目标受击半径）
  query(center, radius, filter) {
    const out = [];
    for (const e of this.entities) {
      if (!e.alive || (filter && !filter(e))) continue;
      const dx = e.pos.x - center.x, dz = e.pos.z - center.z;
      if (dx * dx + dz * dz <= (radius + e.radius) ** 2) out.push(e);
    }
    return out;
  }
  // 扇形查询：朝 dir（水平单位向量）方向、半角 halfAngle（弧度）
  queryArc(center, dir, radius, halfAngle, filter) {
    const cosA = Math.cos(halfAngle);
    return this.query(center, radius, filter).filter((e) => {
      _v.set(e.pos.x - center.x, 0, e.pos.z - center.z);
      const d = _v.length();
      if (d < e.radius + 0.3) return !0;
      return (_v.x * dir.x + _v.z * dir.z) / d >= cosA - e.radius / d;
    });
  }
  enemiesOf(team) {
    return (e) => e.team !== team;
  }

  // 伤害结算：
  //   spec = { base, scale?: {atk?, spell?}, element?: "metal"|..., tags?: [], crit?: bool 强制, noCrit?, knock?: 米, pos?: 受击点, canFlinch? }
  //   伤害 = (base + atk×scale.atk + spell×scale.spell) × (1 + dmg) × 暴击 × 五行抗性 × 防御减免 × 受害方易伤
  // 返回 info = { attacker, target, amount, crit, element, tags, killed, pos, dir, knock }
  dealDamage(attacker, target, spec) {
    if (!target || !target.alive) return null;
    const as = attacker && attacker.stats;
    const sc = spec.scale || {};
    let dmg = (spec.base || 0) + (as ? as.get("atk") * (sc.atk || 0) + as.get("spell") * (sc.spell || 0) : 0);
    if (as) dmg *= 1 + as.get("dmg");
    let crit = !!spec.crit;
    if (!crit && !spec.noCrit && as) crit = Math.random() < as.get("crit");
    if (crit) dmg *= as ? as.get("critDmg") : 1.5;
    const el = spec.element;
    if (el) dmg *= 1 - Math.min(0.9, target.stats.get("res_" + el));
    const def = target.stats.get("def");
    dmg *= 100 / (100 + Math.max(0, def));
    dmg *= 1 + (target.stats.get("vuln") || 0); // 易伤（破甲等状态提供）
    // 事件可修改伤害（心法、反应），在扣血前
    const info = {
      attacker, target, amount: Math.max(1, Math.round(dmg)), crit, element: el || null, tags: spec.tags || [],
      killed: !1, pos: spec.pos || target.pos, dir: spec.dir || null, knock: spec.knock || 0, spec,
    };
    this.events.emit("beforeDamage", info);
    if (info.cancel) return null;
    target.hp -= info.amount;
    if (target.onHit) target.onHit(info);
    this.events.emit("damage", info);
    if (target.hp <= 0 && target.alive) {
      target.hp = 0;
      target.alive = !1;
      info.killed = !0;
      if (target.onDeath) target.onDeath(info);
      this.events.emit("kill", info);
    }
    return info;
  }
  heal(target, amount, src) {
    if (!target.alive) return 0;
    const max = target.stats.get("hp");
    const v = Math.min(amount, max - target.hp);
    target.hp += v;
    if (v > 0) this.events.emit("heal", { target, amount: v, src });
    return v;
  }

  // 状态效果：opts = { dur, stacks, src, data }
  applyStatus(target, id, opts = {}) {
    const def = STATUS[id];
    if (!def || !target.alive) return null;
    let s = target.statuses.get(id);
    if (s) {
      s.stacks = Math.min(def.maxStacks || 1, s.stacks + (opts.stacks || 1));
      s.t = 0;
      s.dur = Math.max(s.dur, opts.dur ?? s.dur);
      if (opts.data) Object.assign(s.data, opts.data);
    } else {
      s = { id, t: 0, dur: opts.dur ?? def.dur ?? 3, stacks: Math.min(def.maxStacks || 1, opts.stacks || 1), src: opts.src || null, data: { ...(opts.data || {}) } };
      target.statuses.set(id, s);
      if (def.onApply) def.onApply(this, target, s);
    }
    this._syncStatusMods(target, s, def);
    this.events.emit("status", { target, status: s });
    return s;
  }
  removeStatus(target, id) {
    const s = target.statuses.get(id);
    if (!s) return;
    target.statuses.delete(id);
    target.stats.removeSource("status:" + id);
    const def = STATUS[id];
    if (def && def.onExpire) def.onExpire(this, target, s);
  }
  _syncStatusMods(target, s, def) {
    target.stats.removeSource("status:" + s.id);
    if (def.mods) target.stats.addAll(def.mods(s), "status:" + s.id);
  }

  // 顿帧（秒）与慢动作
  hitStop(sec) {
    this._stop = Math.max(this._stop, sec);
  }
  // 每帧：返回经过顿帧 / 慢动作缩放后的玩法 dt
  step(rawDt) {
    let dt = rawDt * this.timeScale;
    if (this._stop > 0) {
      this._stop -= rawDt;
      dt *= 0.04;
    }
    this.time += dt;
    for (const e of this.entities.slice()) {
      if (!e.alive) continue;
      for (const s of [...e.statuses.values()]) {
        const def = STATUS[s.id];
        s.t += dt;
        if (def && def.onTick) def.onTick(this, e, s, dt);
        if (s.t >= s.dur) this.removeStatus(e, s.id);
      }
      if (e.stats) {
        const hr = e.stats.get("hpRegen"), mr = e.stats.get("mpRegen");
        if (hr) e.hp = Math.min(e.stats.get("hp"), e.hp + hr * dt);
        if (mr && e.mp != null) e.mp = Math.min(e.stats.get("mp"), e.mp + mr * dt);
      }
    }
    return dt;
  }
}
