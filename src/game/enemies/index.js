// 敌人总管：加载模型、刷怪（遭遇编排，按区域组成怪群）、攻击令牌（同一时间最多几只出招）、分离（不扎堆）、掉落、血条、弹道。
// 接口：new EnemyDirector(ctx)；update(dt)；spawn(type, pos, opts) → Enemy；spawnPack(n, withElite, center, opts)；spawnBoss(pos, type?)
//       setRegion(region)（也会在 "run:start" 事件时自动切换）；list；ready（模型加载完成）
//   spawnPack opts：{ region, types（指定类型，循环填满 n 只）, shield（精英护盾五行） }
//     center 落在当前关卡的刷怪点（points.spawns[i].pos 3 米内）时自动用该点的 mobs；withElite 时精英用最近的 points.elites[i].shield
//   populate(points?)：按关卡 points.spawns（mobs）与 points.elites（shield）刷满全图（流程模块可直接调用）
//   spawnBoss(pos, type?)：自动读当前关卡 points.boss —— 青牙从 adds 狼窝召狼，碧鳞与 shrines 五行坛联动（见 shrines.js）
//   spawn opts：{ region, level（默认按主角层数夹在区域等级区间内；Boss / 心魔固定）, aggro, pack, yaw, noLoot }
// 仇恨 / 脱战 / 寻路：见 enemy.js 开头与 AI 常量、nav.js；回巢途中免伤（下面的 beforeDamage）；Boss 不占攻击令牌
// 死亡掉落：rollLoot(敌人对应来源, { region, level, enemy, boss, profile })，发出 loot:drop { pos, items, source, type, xp, lootSource }
//   Boss 首杀写 profile.flags["boss_" + id] = true（之后按重复击杀掉落）
// 测试 / 调试：window.__game.spawn(type, n)、window.__enemies；按 P 刷一群
import * as THREE from "three";
import { assetURL } from "../../core/assets.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ENEMY_TYPES, ENCOUNTER } from "../../data/enemies.js";
import "./bosses/index.js"; // 首领控制器注册（青牙 v2，战斗设计）
import { Enemy, walkable, RHYTHM } from "./enemy.js";
import { Projectiles } from "./projectiles.js";
import { EnemyFX } from "../../fx/enemy_fx.js";
import { HpBars } from "./hpbars.js";
import { height, activeLevel } from "../../world/terrain.js";
import { BossShrines } from "./shrines.js";
import { NavGrid } from "./nav.js";
import { INKC } from "../../fx/vfx.js";
import { rollLoot, xpForKill, enemyLootSource } from "../loot.js";
import { PROGRESSION } from "../../data/progression.js";

const STAGE_NAME = { 0: "凡人", 1: "练气", 2: "筑基" };
const NUM = "一二三四五六七八九十";

const models = new Map(); // url → Promise<gltf>
// 视锥（性能：画面外的敌人不画、不推进骨骼动画，见 Enemy.animate）
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();

export class EnemyDirector {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.tokens = new Set();
    this.fx = new EnemyFX(ctx);
    this.bars = new HpBars(ctx);
    this.proj = new Projectiles(ctx, this);
    this.nav = new NavGrid(ctx); // 粗网格流场寻路（绕坡道上高台）
    this.templates = {};
    this.ready = !1;
    this.auto = !0; // 原型：自动一波波刷怪
    this.packNo = 0;
    this.packId = 0;
    this.clearT = 1.5; // 开场稍等再来第一波
    this.region = "r1";
    const ev = ctx.world.events;
    ev.on("run:start", (e) => {
      if (e && e.region) this.setRegion(e.region);
      setTimeout(() => this.spawnRares(), 0); // 开局刷怪之后：异种（每局 0–1 只）
    });
    // 潜水中的敌人不可被攻击（排到最前面，先于其他 beforeDamage 监听；护盾吸收仍会先扣盾——见报告）
    const sub = (info) => {
      const o = info.target && info.target.owner;
      if (o && (o.submerged || o.state === "return" || o.state === "cinematic")) (info.cancel = !0), (info.amount = 0); // 潜水 / 回巢（脱战）/ 演出中免伤
    };
    ev.on("beforeDamage", sub);
    // 首领控制器的伤害前回调：注册在护盾之后（护盾先吸收，控制器看到的是实际要扣血的量）
    ev.on("beforeDamage", (info) => {
      const o = info.target && info.target.owner;
      if (o && o.ctrl && o.ctrl.onBeforeDamage && !info.cancel) o.ctrl.onBeforeDamage(info);
    });
    const bl = ev.m && ev.m.get("beforeDamage");
    if (bl) bl.unshift(bl.splice(bl.indexOf(sub), 1)[0]);
    // 破盾眩晕：精英 3 秒、首领每段 2.5 秒（shields.js 先给 2.5 秒，这里按敌人取长的那个）
    ev.on("shield:break", (e) => {
      const o = e && e.target && e.target.owner;
      if (o) o.brokeAt = performance.now(); // 控制器 onCC 用来区分"破盾眩晕"
      if (!o || !o.def || o.rank === "normal") return;
      const dur = o.def.breakStun ?? RHYTHM.breakStun[o.rank];
      if (dur) ctx.world.applyStatus(e.target, "stun", { dur, src: ctx.world.player });
    });
    this.load().catch((e) => console.error("[enemies] 模型加载失败", e));
    window.__enemies = this;
  }

  async load() {
    const loader = new GLTFLoader();
    for (const [type, def] of Object.entries(ENEMY_TYPES)) {
      if (!models.has(def.model)) models.set(def.model, loader.loadAsync(assetURL(def.model)));
      try {
        this.templates[type] = await models.get(def.model);
      } catch (e) {
        console.warn("[enemies] 模型缺失", type, def.model, e);
      }
    }
    this.ready = !0;
    console.log("[enemies] ready:", Object.keys(this.templates).join(", "));
  }

  get hero() {
    return this.ctx.world.player;
  }

  setRegion(region) {
    this.region = region;
  }
  // 当前区域：有激活关卡时以关卡为准（run:start 在开局刷怪之后才发），否则用 setRegion 的值
  curRegion() {
    const L = activeLevel(), id = L && L.def && L.def.id;
    return id && ENCOUNTER.levels[id] ? id : this.region;
  }

  // ---------------- 精英规则（每局上限 / 间距 / 首领场地） ----------------
  eliteBook() {
    const L = activeLevel();
    if (!this.book || this.book.level !== L) this.book = { level: L, spawned: 0, patrol: 0, log: [] };
    return this.book;
  }
  // 返回拦下的原因（"cap" | "gap" | "boss"）或 null
  eliteBlocked(pos, region, kind) {
    const R = ENCOUNTER.eliteRules, cap = R && R.cap[region];
    if (!cap || !activeLevel()) return null; // 只在区域一 / 二的关卡里生效（序章、沙盒不限）
    const bk = this.eliteBook();
    if (kind === "patrol" ? bk.patrol >= ((R.patrolCap || {})[region] ?? cap) : bk.spawned >= cap) return "cap";
    if (this.list.some((o) => o.alive && o.rank === "elite" && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < R.minGap)) return "gap";
    const bp = (this.levelPoints() || {}).boss;
    const bpos = bp && bp.pos;
    if (bpos && Math.hypot(bpos.x - pos.x, bpos.z - pos.z) < R.bossClear) return "boss";
    if (this.list.some((o) => o.alive && o.rank === "boss" && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < R.bossClear)) return "boss";
    return null;
  }

  // ---------------- 境界标签（血条） ----------------
  // { text, cls }：敌人大境界高于主角 → "???"（danger）；同大境界、层数更高且神识不够 → "练气?"（warn）；否则准确境界
  realmLabel(e) {
    const r = e.realm(), p = this.ctx.profile, me = (p && p.realm) || { stage: 1, layer: 1 };
    const exact = r.stage === 0 ? "凡人" : STAGE_NAME[r.stage] + (NUM[r.layer - 1] || r.layer) + "层";
    // 斩过的首领：永远看得清
    if (e.def.boss && p && p.flags && p.flags["boss_" + e.def.boss]) return { text: exact, cls: "", exact };
    if (r.stage > me.stage) return { text: "???", cls: "danger", exact };
    if (r.stage === me.stage && r.layer > me.layer) {
      const sense = this.hero && this.hero.stats ? this.hero.stats.get("sense") : 0;
      const need = (r.layer - me.layer) * ((PROGRESSION.senseView && PROGRESSION.senseView.perLayer) || 16);
      if (sense < need) return { text: STAGE_NAME[r.stage] + "?", cls: "warn", exact };
    }
    return { text: exact, cls: "", exact };
  }

  // 刷怪等级：主角层数（筑基算 10）夹在区域等级区间内；Boss / 心魔用数据表等级
  // 等级：首领 / 心魔 / 异种固定；有分区（关卡 zoneAt）时 = 分区基准等级（刷怪点 baseLevel 优先）+ clamp(主角层数 − 分区最低层, 0, 1)；
  //       没有分区（沙盒 / 旧关卡）时按区域等级区间夹主角层数。精英再 +1
  levelFor(type, region, pos, o = {}) {
    const def = ENEMY_TYPES[type];
    if (def.boss || def.mirrorHero) return def.level;
    if (def.fixedLevel) return def.fixedLevel;
    const p = this.ctx.profile;
    const me = p && p.realm ? (p.realm.stage >= 2 ? 10 : p.realm.layer || 1) : null;
    const elite = def.tier === "elite" ? 1 : 0;
    const L = activeLevel(), z = pos && L && L.zoneAt ? L.zoneAt(pos.x, pos.z) : null;
    const base = o.baseLevel ?? (z && z.baseLevel);
    if (base != null) {
      const lo = z && z.realm ? z.realm[0] : base;
      return base + (me == null ? 0 : Math.max(0, Math.min(1, me - lo))) + (o.levelBonus || 0) + elite;
    }
    const [lo, hi] = ENCOUNTER.levels[region] || [def.level, def.level];
    return Math.max(lo, Math.min(hi, me ?? lo)) + (o.levelBonus || 0) + elite;
  }

  // 刷怪点（没写 mobs 时）按栖息地 × 档次选种类
  habitatTypes(sp, n, region) {
    const H = (ENCOUNTER.habitats || {})[region];
    if (!H || !sp || !sp.habitat) return null;
    const pick = (l) => l[(Math.random() * l.length) | 0];
    const low = H.low[sp.habitat] || [], std = H.std[sp.habitat] || [];
    if (sp.tier === "low" && low.length) return Array.from({ length: n }, () => pick(low));
    if (!std.length) return low.length ? Array.from({ length: n }, () => pick(low)) : null;
    const out = Array.from({ length: n }, () => pick(std));
    if (sp.tier !== "high" && low.length && n >= 3) for (let i = 0; i < Math.min(2, n - 2); i++) out[n - 1 - i] = pick(low);
    return out;
  }

  // 异种：每局 0–1 只，只在关卡给的异种点（points.rares：数组，或 { pick, chance, from }）出现，按 sign 选种类
  spawnRares(points = this.levelPoints()) {
    const R = points && points.rares, region = this.curRegion();
    if (!R || this.rareDone === activeLevel()) return null;
    this.rareDone = activeLevel();
    let list = Array.isArray(R) ? R : R.from || [];
    if (!Array.isArray(R)) {
      const max = R.pick ? R.pick[1] ?? 1 : 1;
      if (Math.random() >= (R.chance ?? 1) || max <= 0 || !list.length) return null;
      list = [list[(Math.random() * list.length) | 0]];
    }
    const pt = list[0];
    if (!pt) return null;
    const map = (ENCOUNTER.rares || {})[region] || {};
    const type = map[pt.sign] || Object.values(map)[0];
    if (!type || !ENEMY_TYPES[type]) return null;
    const pos = pt.pos && pt.pos.isVector3 ? pt.pos : new THREE.Vector3(pt.pos[0], 0, pt.pos[1]);
    pos.y = height(pos.x, pos.z);
    const e = this.spawn(type, pos, { region });
    if (e) this.ctx.world.events.emit("enemy:rare", { enemy: e.entity, type, pos: e.pos.clone() });
    return e;
  }

  // ---------------- 刷怪 ----------------
  spawn(type, pos, opts = {}) {
    let def = ENEMY_TYPES[type];
    if (!def || !this.templates[type]) return null;
    const region = opts.region ?? this.curRegion() ?? def.region;
    // 精英：每局上限、间距、首领场地（被拦下的换成同族普通怪）
    if ((def.tags || []).includes("elite") && !(def.tags || []).includes("boss") && !opts.forceElite) {
      const why = this.eliteBlocked(pos, region, opts.eliteKind);
      const bk = activeLevel() ? this.eliteBook() : null;
      if (why) {
        if (bk) bk.log.push({ type, why, pos: [Math.round(pos.x), Math.round(pos.z)] });
        type = (ENCOUNTER.eliteRules.fallback || {})[type] || "wolf";
        def = ENEMY_TYPES[type];
        if (!this.templates[type]) return null;
        opts = { ...opts, shield: null };
      } else if (bk && ENCOUNTER.eliteRules.cap[region]) opts.eliteKind === "patrol" ? bk.patrol++ : bk.spawned++;
    }
    const e = new Enemy(this, type, def, this.templates[type], pos, { ...opts, region, level: opts.level ?? this.levelFor(type, region, pos, opts) });
    this.list.push(e);
    this.ctx.vfx.burst(e.pos, { color: def.auraColor ?? INKC.ink, count: 10, speed: 2, size: 0.2, up: 2, y: 0.3 });
    if (opts.aggro) e.setAggro("wave");
    return e;
  }

  // 本区域的一群怪：按 ENCOUNTER.packs 抽一种组成，循环填满 n 只；withElite 时第一只换成本区域精英
  packTypes(n, withElite, region) {
    const comps = ENCOUNTER.packs[region] || ENCOUNTER.packs.r1;
    const tot = comps.reduce((s, c) => s + c[1], 0);
    let r = Math.random() * tot, comp = comps[0][0];
    for (const c of comps) if ((r -= c[1]) < 0) {
      comp = c[0];
      break;
    }
    const types = Array.from({ length: n }, (_, i) => comp[i % comp.length]);
    if (withElite) {
      const el = ENCOUNTER.elites[region] || ENCOUNTER.elites.r1;
      types[0] = el[(Math.random() * el.length) | 0];
    }
    return types;
  }

  // 在主角（或 center）周围一侧刷一群：同一高度层、可站立、不在树石里
  spawnPack(n = 5, withElite = !1, center, opts = {}) {
    const hero = this.hero;
    const c = center || (hero ? hero.pos : new THREE.Vector3(-5.5, 0, 16.5));
    const ch = height(c.x, c.z);
    const [r0, r1] = ENCOUNTER.spawnRadius;
    const id = ++this.packId;
    const out = [];
    const base = Math.random() * Math.PI * 2;
    const region = opts.region ?? this.curRegion();
    const pts = center && this.levelPoints();
    const near = (list, r) => (list || []).find((p) => p.pos && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < r);
    const sp = pts && !opts.types ? near(pts.spawns, 3) : null;
    // 普通刷怪点不自动带精英：精英只来自 points.elites、灵光守卫、巡游、夜潮（且受每局规则约束）
    if (withElite && pts && near(pts.spawns, 3) && !near(pts.elites, 6)) withElite = !1;
    const mobs = opts.types || (sp && sp.mobs && sp.mobs.filter((t) => ENEMY_TYPES[t])) || (sp && this.habitatTypes(sp, n, region));
    const types = mobs && mobs.length ? Array.from({ length: n }, (_, i) => mobs[i % mobs.length]) : this.packTypes(n, withElite, region);
    if (withElite && mobs && mobs.length) {
      const el = ENCOUNTER.elites[region] || ENCOUNTER.elites.r1;
      types[0] = el[(Math.random() * el.length) | 0];
    }
    const ep = withElite && pts ? near(pts.elites, 6) : null;
    // 午时巡游（巡游路线起点）：精英另计上限
    const eliteKind = withElite && pts && (pts.patrols || []).some((q) => q.path && q.path[0] && Math.hypot(q.path[0].x - c.x, q.path[0].z - c.z) < 3) ? "patrol" : null;
    const shield = opts.shield ?? (ep && ep.shield) ?? null;
    for (const type of types) {
      for (let k = 0; k < 40; k++) {
        const a = base + (Math.random() - 0.5) * (1.4 + k * 0.16), r = (center ? 0.3 : 1) * (r0 + Math.random() * (r1 - r0)) + (center ? 1.5 : 0) - Math.min(6, k * 0.15);
        const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        const h = height(x, z);
        if (Math.abs(h - ch) > 1.2 || !walkable(x, z, h, this.ctx.colliders, 0.6)) continue;
        if (out.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 1.4)) continue;
        const e = this.spawn(type, new THREE.Vector3(x, h, z), { pack: id, region, shield, eliteKind, yaw: Math.atan2(c.x - x, c.z - z), baseLevel: sp && sp.baseLevel, levelBonus: sp && sp.tier === "high" ? 1 : 0 });
        if (e) out.push(e);
        break;
      }
    }
    return out;
  }

  levelPoints() {
    const L = activeLevel();
    return (L && L.points) || null;
  }

  // 按关卡刷满全图：每个刷怪点一群（mobs），每个精英点一只本区域精英（带关卡指定的护盾五行）
  populate(points = this.levelPoints(), o = {}) {
    if (!points) return [];
    const out = [];
    for (const s of (points.spawns || []).slice(0, o.packs ?? 99)) out.push(...this.spawnPack(s.pack || 3, !1, s.pos, { types: s.mobs }));
    const els = ENCOUNTER.elites[this.region] || ENCOUNTER.elites.r1;
    for (const p of points.elites || []) {
      const e = this.spawn(els[(Math.random() * els.length) | 0], p.pos, { shield: p.shield || null });
      if (e) out.push(e);
    }
    return out;
  }

  // 区域 Boss（关卡的 points.boss）：不主动刷新，进入范围才被惊动。
  // 青牙：召狼从 boss.adds（狼窝）冲出；碧鳞：五行坛（points.shrines 带五行，或 boss.shrines 只有位置）与护盾段落联动
  spawnBoss(pos, type) {
    const bp = (this.levelPoints() || {}).boss || null;
    type = type || (bp && ENEMY_TYPES[bp.id] && bp.id) || ENCOUNTER.bosses[this.region] || "qingya";
    const e = this.spawn(type, pos, { region: ENEMY_TYPES[type].region, yaw: Math.random() * Math.PI * 2, adds: bp && bp.adds && bp.adds.length ? bp.adds : null });
    if (e && ENEMY_TYPES[type].shrines) {
      const P = this.levelPoints() || {};
      const list = P.shrines && P.shrines.length ? P.shrines : ((bp && bp.shrines) || []).map((p) => ({ pos: p }));
      if (list.length) this.shrines = new BossShrines(this.ctx, e, list);
    }
    return e;
  }

  // ---------------- 攻击令牌：同时出招的上限 ----------------
  // 首领不占令牌；有首领在战斗时，小怪同时出招最多 1 只
  canAttack(e) {
    if (e.entity.tags.has("boss")) return !0;
    const bossFight = this.list.some((o) => o.alive && o.aggro && o.entity.tags.has("boss"));
    return this.tokens.has(e) || this.tokens.size < (bossFight ? 1 : ENCOUNTER.maxAttackers);
  }
  requestToken(e) {
    if (e.entity.tags.has("boss")) return !0; // Boss 不占令牌
    if (!this.canAttack(e)) return !1;
    this.tokens.add(e);
    return !0;
  }
  releaseToken(e) {
    this.tokens.delete(e);
  }
  alliesNear(e, r) {
    let n = 0;
    for (const o of this.list) if (o !== e && o.alive && o.pos.distanceTo(e.pos) < r) n++;
    return n;
  }

  // ---------------- 死亡与掉落 ----------------
  onEnemyDeath(e, info) {
    this.releaseToken(e);
    const def = e.def, p = this.ctx.profile;
    const pos = e.pos.clone();
    this.ctx.vfx.burst(pos, { color: INKC.ink, count: 26 * def.scale, speed: 5, size: 0.22, up: 3, y: 0.8 });
    this.ctx.vfx.burst(pos, { color: INKC.red, count: 6, speed: 3, size: 0.12, up: 2, y: 0.8 });
    const src = enemyLootSource(e.type, p);
    const first = src === "boss_first";
    let items = [];
    if (!e.noLoot && src !== "none") {
      try {
        items = rollLoot(src, { region: e.region in ENCOUNTER.levels ? e.region : def.region, level: e.level, enemy: e.type, boss: def.boss, profile: p });
      } catch (err) {
        console.error("[enemies] rollLoot 失败", err);
      }
    }
    if (def.boss && p) (p.flags ||= {})["boss_" + def.boss] = !0;
    const xp = e.noLoot ? 0 : def.insight ?? xpForKill(e.type, e.region, { first, profile: p });
    this.ctx.world.events.emit("enemy:killed", { enemy: e.entity, type: e.type, region: e.region, level: e.level, xp, boss: def.boss || null, first });
    if (items.length) this.ctx.world.events.emit("loot:drop", { pos, items, source: e.entity, type: e.type, xp, lootSource: src });
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const g = window.__game;
    if (g && !g.spawn) g.spawn = (type = "wolf", n = 1) => (n > 1 && type === "wolf" ? this.spawnPack(n) : Array.from({ length: n }, () => this.spawnPack(1, !1, null, { types: [type] })[0]));
    if (this.ctx.input && this.ctx.input.pressed("KeyP") && this.ready) this.spawnPack(ENCOUNTER.packMin + Math.floor(Math.random() * 3), (this.packNo + 1) % ENCOUNTER.eliteEvery === 0), this.packNo++;
    if (this.ready && this.auto) this.encounter(dt);

    const hero = this.hero;
    const L = this.list;
    // 分离：同伴之间互相推开，避免扎堆（按受击半径）
    for (const a of L) a.sep.set(0, 0, 0);
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz, rr = (a.def.radius + b.def.radius) * 1.6;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), k = (rr - d) / rr / d;
        a.sep.x -= dx * k;
        a.sep.z -= dz * k;
        b.sep.x += dx * k;
        b.sep.z += dz * k;
      }
      // 也别贴在主角身上
      if (hero && hero.alive) {
        const dx = a.pos.x - hero.pos.x, dz = a.pos.z - hero.pos.z, d = Math.hypot(dx, dz), rr = a.def.radius + hero.radius + 0.3;
        if (d < rr && d > 1e-4) (a.sep.x += (dx / d) * (rr - d) * 2), (a.sep.z += (dz / d) * (rr - d) * 2);
      }
    }
    this.updateView();
    for (const e of L) e.update(dt, hero);
    for (let i = L.length - 1; i >= 0; i--) if (L[i].removed) L.splice(i, 1);
    this.nav.update(dt);
    this.proj.update(dt);
    if (this.shrines) {
      this.shrines.update(dt, hero);
      if (this.shrines.done) this.shrines = null;
    }
    this.fx.update(dt);
    this.bars.update(dt, L);
  }

  // 本帧的镜头视锥（镜头在敌人之后更新，用的是上一帧的镜头，所以 inView 的球留足余量）
  updateView() {
    const cam = this.ctx.camera;
    this.viewOK = !!cam;
    if (!cam) return;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
  }
  // 位置 p 处、半径 r 的东西（含它投在地上的影子）是否可能出现在画面里
  inView(p, r) {
    if (!this.viewOK) return !0;
    _sph.center.set(p.x, p.y + 1, p.z);
    _sph.radius = r;
    return _frustum.intersectsSphere(_sph);
  }

  // 原型遭遇：一波清完（或只剩尸体）后等几秒刷下一波；每第 3 波带首领
  encounter(dt) {
    const alive = this.list.some((e) => e.alive);
    if (alive) return void (this.clearT = Math.max(this.clearT, 0));
    this.clearT -= dt;
    if (this.clearT > 0) return;
    this.clearT = ENCOUNTER.respawnDelay;
    this.packNo++;
    const n = ENCOUNTER.packMin + Math.floor(Math.random() * (ENCOUNTER.packMax - ENCOUNTER.packMin + 1));
    this.spawnPack(n, this.packNo % ENCOUNTER.eliteEvery === 0);
  }
}
