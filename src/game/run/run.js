// 出行局（模块 A）：一次"搜打撤"。
//   入图（随机入口）→ 天时推进（晨午暮夜，入夜妖潮）→ 搜（采集 / 开箱 / 拾取）、打（击杀得感悟修为）→ 撤（撤离点读条）→ 结算
// 依据《最小闭环设计》§4–§7。数值在 ./regions.js。
import * as THREE from "three";
import { Bag } from "../../core/bag.js";
import { makeItem, defOf, valueOf, ITEMS } from "../../core/items.js";
import { addXp, heroStats, slotOpen } from "../progression.js";
import { pageHint } from "../gongfa.js"; // 残页提示（功法 / 丹方残页同一句式："丹方残页 2/5 · 集齐后到洞府仓库研读（得…）"）
import { REGIONS, PHASES, EXTRACT, INSIGHT, INTRO_AT, runIndex } from "./regions.js";
import { Pickups, toInstances, PICK_R, groundName } from "./pickups.js";
import { Containers } from "./containers.js"; // 搜取容器：留尸、宝箱格子（docs/ui/v2/搜取_v1.md）
import { Prologue } from "./prologue.js";
import { MapModel } from "./mapmem.js";
import { loadRunMap } from "./map.js";
import { settleExtract, settleDeath, retrieveLostBag, isKey } from "./settle.js";
import { ensureFlowItems } from "./flow_items.js";
import { INKC } from "../../fx/vfx.js";
import { ELEM_COLOR } from "../../fx/skill_fx.js";
import { REFINE } from "../../data/recipes.js";
import { SPELLS } from "../../data/skills.js";
import { BossFlow, MIST } from "./bossflow.js"; // 首领战流程：关口提示、入场、墨雾门撤出、bossLog（boss_青牙_v2 §10.2-7）
import { fallbackGatherObject, fallbackChestObject } from "../../fx/gather_fx.js";
import { canStand } from "../../world/terrain.js";

// 内容模块（D）的掉落 / 感悟 / 装备属性；不存在时用兜底
export const LOOT = Object.values(import.meta.glob("../loot.js", { eager: !0 }))[0] || {};
// 首杀必得、但物品表里没带 key 标签的东西（见 Run.secureFirstKill）
const FIRST_KILL_KEEP = new Set(["qingya_fang"]);

// 装备生效的全部属性（D 的 gearStats 按等级与品质计算；兜底用 def.base + 词条）
export function gearMods(g) {
  if (LOOT.gearStats) return LOOT.gearStats(g).filter((m) => m.type !== "flag");
  const d = defOf(g) || {};
  return [...(d.base || []), ...(g.affixes || [])].filter((m) => m.type !== "flag");
}
function fallbackLoot(source, o = {}) {
  const lv = o.level || 1, out = [];
  const add = (id, n = 1, rarity = 0) => ITEMS[id] && out.push(makeItem(id, { n, rarity, level: lv }));
  if (source.startsWith("gather")) add(source.includes("ore") ? "spirit_stone" : "qingling_cao", 1 + ((Math.random() * 2) | 0));
  else if (source === "mob") Math.random() < 0.6 && add("spirit_stone", 1 + ((Math.random() * 3) | 0)), Math.random() < 0.5 && add("wolf_fang");
  else if (source === "elite") add("wolf_core"), add("spirit_stone", 6 + ((Math.random() * 5) | 0));
  else if (source.startsWith("chest")) {
    add("spirit_stone", 5 + ((Math.random() * 10) | 0));
    if (source !== "chest_normal") add("spirit_orb_shard", 1, source === "chest_night" ? 3 : 2);
    else if (Math.random() < 0.3) add("huichun_dan");
  }
  return out;
}

export class Run {
  // opts: { carried: [物品实例]（带出去的丹药符箓）, protect: [uid]（护器符保护的装备）, seed }
  constructor(ctx, profile, region, opts = {}) {
    ensureFlowItems();
    this.ctx = ctx;
    this.profile = profile;
    this.region = region;
    this.R = REGIONS[region] || REGIONS.r1;
    this.bag = new Bag(profile.bagCapacity || 16, { name: "储物袋" });
    this.pouch = profile.pouch;
    this.keyItems = []; // 护身格：关键物品不占储物袋，身陨不失（玩法评审 G3）
    this.quests = opts.quests || null; // 委托（模块 E）
    this.no = runIndex(profile); // 第几局（教学局 = 1），决定引导节奏
    this.carried = opts.carried || [];
    this.protect = opts.protect || [];
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.t = 0;
    this.phase = 0;
    this.state = "loading"; // loading | play | channel | dead | done
    this.kills = 0;
    this.elites = 0;
    this.insight = 0;
    this.firsts = [];
    this.channel = null;
    this.nextWave = 0;
    this.offs = [];
    this.marks = []; // 地上的交互物（宝箱、采集点）
    this.explored = null;
    this.result = null;
    this.listeners = new Set();
  }

  // ---------------- 开局 ----------------
  async start() {
    const ctx = this.ctx, P = this.profile;
    this.rollLoot = (src, o = {}) => {
      ensureFlowItems();
      try {
        if (LOOT.rollLoot) return LOOT.rollLoot(src, { region: this.region, level: this.R.level, profile: this.profile, tide: this.tide, ...o });
      } catch (e) {
        console.error("[run] rollLoot 失败", src, e);
      }
      return fallbackLoot(src, { level: this.R.level, ...o });
    };
    this.map = await loadRunMap(ctx, this.region, this.seed);
    this.pickups = new Pickups(ctx, this);
    this.containers = new Containers(this);
    const pts = this.map.points;
    // 入口：随机一个
    const entry = (pts.entries.length ? pts.entries[(Math.random() * pts.entries.length) | 0] : new THREE.Vector3()).clone();
    if (this.region === "tutorial" && pts.entries[0]) entry.copy(pts.entries[0]);
    const pl = ctx.player;
    pl.spawn(entry.x, entry.z);
    pl.root.visible = !0;
    this.applyProfileToHero();
    // 撤离点：常驻古传送阵——首次只显示离入口最近的一个；已发现过的保持点亮
    const mapMem = (P.map[this.region] = P.map[this.region] || { extracts: [], inked: null });
    this.extracts = pts.extracts.map((x) => ({ ...x, pos: x.pos.clone(), known: x.known || mapMem.extracts.includes(x.id), confirmed: x.kind === "gate" || x.kind === "cave" || x.kind === "boss", used: !1 }));
    const gates = this.extracts.filter((x) => x.kind === "gate");
    if (gates.length && !gates.some((g) => g.known)) {
      gates.sort((a, b) => a.pos.distanceTo(entry) - b.pos.distanceTo(entry));
      gates[0].known = !0;
    }
    this.buildMarks();
    // 敌人：本局只用流程控制的刷怪
    const E = ctx.enemies;
    this.clearEnemies();
    E.auto = !1;
    if (this.region === "tutorial") {
      // 序章：由关卡的 steps 驱动（src/game/run/prologue.js）；没有步骤数据时只放一把锈剑
      this.pro = new Prologue(this);
      if (this.pro.active) this.pro.start();
      else (this.pro = null), this.containers.stash(entry, [makeItem("rust_sword")], { label: "锈剑", glyph: "剑" });
    }
    else await this.spawnInitial();
    // 遗落储物袋
    if (P.lostBag && P.lostBag.region === this.region && P.lostBag.pos) {
      const p = new THREE.Vector3(...P.lostBag.pos);
      this.lostBagMark = this.addMark({ kind: "lostbag", pos: p, label: "遗落的储物袋", glyph: "袋", color: INKC.red });
    }
    // 事件
    const ev = ctx.world.events;
    this.offs.push(
      ev.on("kill", (i) => this.onKill(i)),
      ev.on("enemy:killed", (e) => this.onEnemyKilled(e)),
      ev.on("damage", (i) => this.onDamage(i)),
      ev.on("loot:drop", (e) => e && e.items && e.items.length && this.containers.fromDrop(e)), // 敌人掉落 → 留尸（容器）；奇遇 / 委托 → 地上
      ev.on("gather:done", (e) => this.onGathered(e)), // 采到的直接进储物袋，放不下的才落地（之后按 F 取）
    );
    this.boss = new BossFlow(this);
    // 探索记录（天机镜着墨）
    const b = this.map.bounds;
    this.explored = { b, w: 64, h: 48, cells: new Uint8Array(64 * 48), t: 0 };
    if (Array.isArray(mapMem.inked) && mapMem.inked.length === 64 * 48) this.explored.cells.set(mapMem.inked);
    this.explored.stamp = 1;
    this.mapModel = new MapModel(this);
    this.on((t) => t === "chest" && this.stat("chests")); // 天机镜的记忆（看见过的妖群、宝箱、采集物、遗府、行迹、墨点；固定地标跨局保留）
    this.nextWave = this.R.phases[2] + (this.R.nightWaveEvery || 60);
    this.state = "play";
    this.saveMarker();
    this.bag.on(() => (this.markerDirty = !0)); // 中途关闭页面的记录：下一帧再写、每秒至多一次（取物那一帧不做 JSON + localStorage）
    ctx.world.events.emit("run:start", { region: this.region, run: this });
    if (this.quests && this.quests.start) {
      // E 直接读 run.map.points.encounters（按 types 放奇遇）与 points.relics（遗物藏点）
      try {
        this.quests.start(this);
      } catch (e) {
        console.error("[run] 委托 start 失败", e);
      }
    }
    this.startHints();
    if (this.region !== "tutorial" && P.lostBag && P.lostBag.region === this.region) this.toast("天机镜标出了你上次遗落的储物袋", "warn");
    return this;
  }

  // 主角属性：境界基础 + 装备
  applyProfileToHero() {
    const ctx = this.ctx, P = this.profile, h = ctx.player.entity;
    applyHeroStats(ctx, P);
    // 出发前服用的丹药（PILL_RULES.preRun）：护脉丹 use.dmgTaken → 本局受到伤害 ×(1 + dmgTaken)（走"易伤"乘区，负数即减伤）
    h.stats.removeSource("preRun");
    const pre = this.carried.find((i) => i.n > 0 && ((defOf(i) || {}).use || {}).dmgTaken);
    if (pre) {
      const d = defOf(pre);
      h.stats.add({ stat: "vuln", type: "flat", value: d.use.dmgTaken, source: "preRun" });
      if (--pre.n <= 0) this.carried.splice(this.carried.indexOf(pre), 1);
      setTimeout(() => this.toast(`服下${d.name} · 本局受到伤害 ${Math.round(d.use.dmgTaken * 100)}%`, "gold", 2.5), 1800);
    }
    this.applyBuffs();
    // 滴血认主的气血惩罚：只作用于下一局（模块 C 写 flags.bloodDebuff，流程应用后清除）
    h.stats.removeSource("blood");
    if (P.flags.bloodDebuff > 0) {
      h.stats.add({ stat: "hp", type: "pct", value: -P.flags.bloodDebuff, source: "blood" });
      this.toast(`滴血认主未复，本局气血上限 −${Math.round(P.flags.bloodDebuff * 100)}%`, "warn", 3);
      delete P.flags.bloodDebuff;
    }
    h.alive = !0;
    h.hp = h.stats.get("hp");
    h.mp = h.stats.get("mp");
    ctx.player.deadT = 0;
    if (ctx.player.state === "dead") ctx.player.respawn && ctx.player.respawn();
    const S = ctx.skills;
    if (S) {
      // 丹药囊：带出去的丹药映射到快捷栏（1 回气丹 / 2 回春丹）
      if (S.potions) {
        const cnt = (id) => this.carried.filter((it) => it.id === id).reduce((s, it) => s + it.n, 0);
        const map = [["huiqi_dan", 0], ["huichun_dan", 1]];
        for (const [id, i] of map) if (S.potions[i]) S.potions[i].count = cnt(id);
        this.potionStart = map.map(([id, i]) => [id, S.potions[i] ? S.potions[i].count : 0]);
        this.pillKinds = new Set(map.filter(([id, i]) => S.potions[i] && S.potions[i].count > 0).map(([id]) => id)); // 丹药囊里已有的种类
        S.ui && S.ui.refresh && S.ui.refresh();
      }
      S.cd = {};
    }
  }

  applyEquip() {
    applyEquipStats(this.ctx.player.entity, this.profile);
  }
  // 局内捡到的丹药放进丹药囊（教学局用）
  potionSlot(id) {
    const S = this.ctx.skills, i = { huiqi_dan: 0, huichun_dan: 1 }[id];
    return i !== undefined && S && S.potions && S.potions[i] ? S.potions[i] : null;
  }
  addCarriedPill(inst) {
    const S = this.ctx.skills;
    if (!this.potionSlot(inst.id)) return !1;
    this.carried.push(inst);
    this.potionSlot(inst.id).count += inst.n;
    if (this.potionStart) this.potionStart.find((x) => x[0] === inst.id)[1] += inst.n;
    S.ui && S.ui.refresh && S.ui.refresh();
    return !0;
  }

  // 局内捡到的丹药 / 符箓直接进快捷栏（found：身陨时按储物袋的规矩算，见 settle.js）
  //   丹药：丹药囊里已有这一种 → 加进那一栏（可超过出行前的携带上限）；新种类 → 有空栏才放进去，否则留在储物袋里（双击服用）
  //   符箓：遁地符进 G，五行符进 3（4 换一种）
  // 返回提示文字（"按 1 服用"）；没放进快捷栏返回 null
  stowConsumable(inst) {
    const d = defOf(inst) || {}, u = d.use || {};
    if (d.cat === "pill" && this.potionSlot(inst.id)) {
      const kinds = this.pillKinds || (this.pillKinds = new Set());
      if (!kinds.has(inst.id) && kinds.size >= (this.profile.unlocks.pillSlots || 1) && this.region !== "tutorial") return null;
      if (!this.bag.consume(inst.id, inst.n)) return null;
      kinds.add(inst.id);
      this.addCarriedPill({ ...inst, found: 1 });
      return `按 ${inst.id === "huichun_dan" ? "2" : "1"} 服用`;
    }
    if (d.cat === "talisman" && (u.element || u.extract)) {
      if (!this.bag.consume(inst.id, inst.n)) return null;
      this.carried.push({ ...inst, found: 1 });
      if (!u.element) return "按 G 遁地";
      this.fuSel = inst.id;
      this.emit("fu", inst);
      return "按 3 掷出";
    }
    return null;
  }
  // 储物袋里双击：回气 / 回春丹当场服用（与快捷栏同一冷却），符箓放进快捷格；返回是否用掉
  useItem(inst) {
    if ((this.state !== "play" && this.state !== "channel") || !inst) return !1;
    const d = defOf(inst) || {}, S = this.ctx.skills, u = d.use || {};
    if (d.cat === "talisman") {
      const how = this.stowConsumable(inst);
      if (how) this.toast(`${d.name}放进快捷格 · ${how}`, "gold", 2), this.emit("bag");
      return !!how;
    }
    if (d.cat !== "pill") return !1;
    const i = { huiqi_dan: 0, huichun_dan: 1 }[inst.id], po = i !== undefined && S && S.potions ? S.potions[i] : null;
    if (!po) return this.toast(u.sense || u.dmgTaken ? `${d.name}要在出行前服用` : `${d.name}回洞府再用`, "warn", 2), !1;
    if ((S.cd["pot" + i] || 0) > 0) return this.toast("丹药冷却中", "warn", 1.2), !1;
    if (!this.ctx.player.entity.alive || !this.bag.consume(inst.id, 1)) return !1;
    po.count++; // 借快捷栏服下（count 先加后减，不动出行时带的那几枚）
    if (!S.usePotion(i)) return (po.count--), !1;
    this.emit("bag");
    return !0;
  }
  // 炼化增益（灵泉"灵气充盈"；模块 C 写 profile.buffs = [{ id, tier: 1–5, remain: 秒, mods? }]，mods 缺省按 REFINE.buff.tiers[tier-1]）
  //   出行局里生效，只在局内计时；到时移除并从存档里删掉
  applyBuffs() {
    const P = this.profile, h = this.ctx.player.entity;
    for (const x of this.buffs || []) h.stats.removeSource(x.src);
    this.buffs = [];
    const list = Array.isArray(P.buffs) ? P.buffs : P.buffs ? Object.values(P.buffs) : [];
    for (const b of list) {
      if (!b || !(b.remain > 0)) continue;
      const mods = buffMods(b), src = "buff:" + (b.id || "lingqi");
      if (!mods.length) continue;
      h.stats.removeSource(src);
      for (const m of mods) h.stats.add({ stat: m.stat, type: m.type, value: m.value, source: src });
      this.buffs.push({ b, src, mods, name: buffName(b), label: (buffTier(b) || {}).label || "" });
    }
  }
  tickBuffs(dt) {
    for (let k = this.buffs.length - 1; k >= 0; k--) {
      const x = this.buffs[k];
      if ((x.b.remain -= dt) > 0) continue;
      const h = this.ctx.player.entity, P = this.profile;
      h.stats.removeSource(x.src);
      h.hp = Math.min(h.hp, h.stats.get("hp"));
      this.buffs.splice(k, 1);
      if (Array.isArray(P.buffs)) P.buffs.splice(P.buffs.indexOf(x.b), 1);
      else if (P.buffs) for (const key in P.buffs) if (P.buffs[key] === x.b) delete P.buffs[key];
      this.toast(`${x.name}已散`, "", 2);
      this.emit("buff");
    }
  }

  // 本局用掉的丹药从 carried 里扣掉
  syncPotions() {
    const S = this.ctx.skills;
    if (!S || !S.potions || !this.potionStart) return;
    for (const [id, i] of [["huiqi_dan", 0], ["huichun_dan", 1]]) {
      const start = (this.potionStart.find((x) => x[0] === id) || [0, 0])[1];
      let used = Math.max(0, start - (S.potions[i] ? S.potions[i].count : start));
      // 服用顺序：先低品（同种丹药药效不分品级，好的留着带回）；同品级先用局内捡到的
      for (const it of [...this.carried].sort((a, b) => (a.rarity || 0) - (b.rarity || 0) || (b.found | 0) - (a.found | 0))) {
        if (it.id !== id || used <= 0) continue;
        const k = Math.min(used, it.n);
        it.n -= k;
        used -= k;
      }
    }
    this.carried = this.carried.filter((it) => it.n > 0);
    this.potionStart = null;
  }

  clearEnemies() {
    const E = this.ctx.enemies;
    for (const e of [...E.list]) {
      E.bars && E.bars.remove(e);
      this.ctx.shields && this.ctx.shields.drop && this.ctx.shields.drop(e.entity);
      e.dispose && e.dispose();
    }
    E.list.length = 0;
    E.tokens && E.tokens.clear();
  }

  async spawnInitial() {
    const E = this.ctx.enemies;
    for (let k = 0; k < 60 && !E.ready; k++) await new Promise((r) => setTimeout(r, 100));
    // 开局组数：关卡给的 points.spawnPacks（区域规划 v2：r1 9 组、r2 11 组）优先，没有时用 regions.js 的 packs
    const spawns = this.map.points.spawns.slice(0, this.map.points.spawnPacks ?? this.R.packs ?? 5);
    this.packCount = spawns.length;
    spawns.forEach((s) => E.spawnPack(s.pack || 3, !!s.elite, s.pos.clone(), s.mobs ? { types: s.mobs } : {}));
    const pts = this.map.points;
    // 守宝精英：精英点 + 有守卫的灵光点
    for (const e of pts.elites || []) E.spawnPack(e.pack || 2, !0, e.pos.clone(), e.types ? { types: e.types } : {});
    for (const g of pts.glows || []) if (g.guard === "elite") E.spawnPack(2, !0, g.pos.clone());
    if (!(pts.elites || []).length && spawns.length) E.spawnPack(3, !0, spawns[spawns.length - 1].pos.clone());
    for (const e of E.list) this.buffEnemy(e);
  }

  // 暮夜：妖兽属性提升
  buffEnemy(e) {
    const b = PHASES[this.phase].buff;
    if (!b || !e.entity || (e.def && e.def.boss)) return; // 首领不吃天时属性（"狼王只认月相"，boss_青牙_v2 §2）
    e.entity.stats.add({ stat: "atk", type: "pct", value: b, source: "phase" });
    e.entity.stats.add({ stat: "hp", type: "pct", value: b, source: "phase" });
    e.entity.hp = e.entity.stats.get("hp");
  }

  // ---------------- 教学局 ----------------
  // ---------------- 交互物：宝箱、采集点、遗落储物袋 ----------------
  buildMarks() {
    const pts = this.map.points;
    {
      for (const c of pts.chests) this.addMark({ kind: "chest", pos: c.pos, point: c, tier: c.tier || "normal", label: c.tier === "glow" ? "灵光宝箱" : "宝箱", glyph: "箱", color: c.tier === "glow" ? INKC.gold : INKC.ink, object: c.object });
      for (const g of pts.gathers) {
        const ore = g.cat === "ore" || g.kind === "ore";
        const label = g.label || (ore ? "矿脉" : "灵草");
        this.addMark({ kind: "gather", pos: g.pos, point: g, gatherKind: g.kind || (ore ? "ore" : "herb"), label, glyph: label[0], color: ore ? 0x8a7a60 : INKC.green, object: g.object });
      }
      // 灵光点：高价值采集（常有精英看守）
      for (const g of pts.glows || []) this.addMark({ kind: "gather", glow: !0, pos: g.pos, point: g, gatherKind: g.kind || "glow", label: (g.label || "灵光") + "（灵光）", glyph: "光", color: INKC.gold, object: g.object });
    }
    for (const x of this.extracts) x.mark = this.addMark({ kind: "extract", pos: x.pos, ext: x, label: x.name, glyph: x.kind === "cave" ? "府" : "阵", color: x.kind === "cave" ? INKC.gold : INKC.blue, ring: x.kind !== "cave" });
  }
  addMark(m) {
    const T = this.ctx.THREE;
    const g = new T.Group();
    g.position.copy(m.pos);
    if (!m.object) {
      // 宝箱 / 采集点：与关卡同一套外观（UI 设计，src/fx/gather_fx.js）
      if (m.kind === "chest") fallbackChestObject(m, g);
      if (m.kind === "gather") fallbackGatherObject(m, g);
      if (m.kind === "lostbag") {
        const s = new T.Mesh(new T.SphereGeometry(0.22, 10, 8).translate(0, 0.3, 0), new T.MeshBasicMaterial({ color: m.color, transparent: !0, opacity: 0.85 }));
        g.add(s);
      }
    }
    if (m.ring) {
      const ring = new T.Mesh(new T.RingGeometry(EXTRACT.radius - 0.18, EXTRACT.radius, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: m.color, transparent: !0, opacity: 0.45, depthWrite: !1, side: T.DoubleSide }));
      ring.position.y = 0.08;
      g.add(ring);
      m.ringMesh = ring;
    }
    if (m.kind === "extract" && m.ext.kind === "cave") {
      const beam = new T.Mesh(new T.CylinderGeometry(0.4, 0.9, 6, 12, 1, !0).translate(0, 3, 0), new T.MeshBasicMaterial({ color: INKC.gold, transparent: !0, opacity: 0.25, depthWrite: !1, side: T.DoubleSide }));
      g.add(beam);
    }
    this.ctx.scene.add(g);
    m.group = g;
    this.marks.push(m);
    return m;
  }
  removeMark(m) {
    this.ctx.scene.remove(m.group);
    m.group.traverse((o) => o.geometry && o.geometry.dispose());
    this.marks.splice(this.marks.indexOf(m), 1);
  }
  nearestMark(maxD = 2.2, filter) {
    const hp = this.ctx.player.pos;
    // 撤离阵按"进了阵圈"算距离（减 EXTRACT.radius − 1）；但紧挨着（NEAR_R 内）的尸体 / 宝箱 / 地上物品优先，
    // 否则落在阵圈里的东西永远按不到（首领尸体与 Boss 出口重叠，首杀掉落搜不了，2026-11-17 用户报"青牙之牙"）
    const NEAR_R = PICK_R;
    let best = null, bd = maxD, near = null, nd = NEAR_R;
    for (const m of this.marks) {
      if (filter && !filter(m)) continue;
      // 开过且已取空的宝箱不再可交互（否则 F 提示一直留着）
      if (m.container && this.containers && this.containers.status(m.container).empty) continue;
      const raw = Math.hypot(m.pos.x - hp.x, m.pos.z - hp.z), ex = m.kind === "extract" && m.ext.kind !== "cave";
      const d = raw - (ex ? EXTRACT.radius - 1 : 0);
      if (d < bd) (bd = d), (best = m);
      if (!ex && m.kind !== "extract" && raw < nd) (nd = raw), (near = m);
    }
    // 地上的物品（按 F 取，不自动拾取）：PICK_R 米内与其它交互物一起比距离；提示写最近那件，身边多件时加"等 N 件"
    const L = this.pickups ? this.pickups.list : null;
    if (L && L.length) {
      let bp = null, pd = PICK_R + 1e-6, n = 0;
      for (const p of L) {
        const d = Math.hypot(p.x - hp.x, p.z - hp.z);
        if (d > PICK_R) continue;
        n++;
        if (d < pd && (!filter || filter(p.mark))) (pd = d), (bp = p);
      }
      if (bp) {
        const pm = bp.mark;
        if (pm.n !== n) (pm.n = n), (pm.label = groundName(bp.inst) + (n > 1 ? `（等 ${n} 件）` : ""));
        if (pd < bd) (bd = pd), (best = pm);
        if (pd < nd) (nd = pd), (near = pm);
      }
    }
    if (near && best && best.kind === "extract") best = near;
    return best;
  }
  async interact(m) {
    const lv = this.R.level;
    if (m.kind === "pickup") return this.takeGround();
    if (m.onInteract) return m.onInteract(m, this); // 奇遇等外部标记（模块 E）
    if (m.kind === "chest") {
      this.containers.openChest(m); // 开箱 = 打开格子窗（掷掉落、藏关卡模型、发 chest 事件都在 containers.js）
    } else if (m.kind === "gather") {
      // 当前天时一并传给掉落模块（GARDEN.herbTideShift：暮 / 夜采到的灵草品质更高）：phase = dawn | noon | dusk | night，tod = 0 晨 → 1 夜
      const tod = { phase: (PHASES[this.phase] || PHASES[0]).id, tod: this.phase / 3 };
      let items = this.rollLoot("gather_" + (m.gatherKind || "herb"), { region: this.region, level: lv, ...tod });
      if (!items.length && m.glow) items = this.rollLoot("gather_glow", { region: this.region, level: lv, ...tod });
      this.ctx.world.events.emit("gather:done", { pos: m.pos.clone(), items, kind: m.gatherKind });
      this.stat("herbs");
      this.removeMark(m); // 采集动效由 src/fx/gather_fx.js 负责
    } else if (m.kind === "lostbag") {
      const r = retrieveLostBag(this.profile);
      let overflow = [];
      for (const it of r.got) if (!this.bag.add(it)) overflow.push(it);
      if (overflow.length) this.pickups.dropMany(m.pos, overflow, 1);
      this.removeMark(m);
      this.lostBagMark = null;
      this.toast(`取回遗落的储物袋：${r.got.length} 件` + (r.gone.length ? `，${r.gone.length} 件已散失` : ""), "gold", 3.5);
      this.retrieved = r;
      this.stat("lostBagBack");
    } else if (m.kind === "extract") this.startExtract(m.ext);
  }

  // ---------------- 撤离 ----------------
  channelTime(kind) {
    const base = kind === "gate" ? EXTRACT.gate : kind === "ruin" || kind === "fake" ? EXTRACT.ruin : kind === "talisman" ? EXTRACT.talisman : kind === "boss" ? EXTRACT.boss : 0;
    const mul = kind === "boss" || kind === "cave" ? 1 : PHASES[this.phaseAt(this.t)].channelMul;
    const red = Math.min(0.6, this.ctx.player.entity.stats.get("extractSpeed") || 0); // 装备词条：撤离读条 −X%
    return base * mul * (1 - red);
  }
  startExtract(x) {
    if (this.state !== "play") return;
    if (x.kind === "fake") {
      x.known = x.confirmed = !0;
      if (this.mapModel) this.mapModel.fake(x);
      this.toast("假阵！妖兽伏击！", "warn", 3);
      this.ctx.enemies.spawnPack(4, !1, x.pos);
      this.removeMark(x.mark);
      this.extracts.splice(this.extracts.indexOf(x), 1);
      return;
    }
    if (x.used) return;
    if (x.locked) return this.toast("洞口被藤蔓封住——先解决守在门口的狼头目", "warn", 2.5);
    const need = x.kind === "cave" && x.channel != null ? x.channel : this.channelTime(x.kind);
    if (need <= 0) return this.extract(x);
    this.channel = { ext: x, kind: x.kind, t: 0, need, pos: x.pos.clone(), mobile: x.kind !== "talisman" };
    if (this.pro) this.pro.onChannel();
    this.state = "channel";
    // 读条吸引附近妖兽，并按天时追加一波
    for (const e of this.ctx.enemies.list) if (e.alive && e.pos.distanceTo(this.ctx.player.pos) < EXTRACT.attract) e.setAggro && e.setAggro();
    if (this.phase >= 2) this.spawnWave(this.phase >= 3 ? 5 : 3, this.phase >= 3);
    this.toast(`${x.name || "撤离"} · 读条 ${need.toFixed(0)} 秒` + (x.kind === "talisman" ? "（受击打断）" : "（离开阵圈暂停）"), "", 2.5);
    this.emit("channel");
  }
  startMist(g) {
    if (this.state !== "play") return;
    this.channel = { kind: "mist", gate: g, t: 0, need: MIST.hold, pos: this.ctx.player.pos.clone(), inside: !0 };
    this.state = "channel";
    this.emit("channel");
  }
  useTalisman() {
    if (this.state !== "play") return !1;
    const it = this.carried.find((i) => i.id === "dundi_fu" && i.n > 0) || this.pouch.items.find((i) => i.id === "dundi_fu");
    if (!it) return this.toast("没有遁地符", "warn"), !1;
    it.n -= 1;
    if (it.n <= 0) {
      const i = this.carried.indexOf(it);
      if (i >= 0) this.carried.splice(i, 1);
      else this.pouch.remove(it.uid);
    }
    const x = { id: "talisman", kind: "talisman", name: "遁地符", pos: this.ctx.player.pos.clone() };
    this.startExtract(x);
    return !0;
  }
  cancelChannel(reason) {
    if (!this.channel) return;
    this.channel = null;
    this.state = "play";
    if (reason) this.toast(reason, "warn");
    this.emit("channel");
  }
  extract(x) {
    if (this.state === "done" || this.state === "dead") return;
    this.state = "done";
    this.channel = null;
    if (x && x.ext !== undefined) x = x.ext;
    this.ctx.vfx.pillar(this.ctx.player.pos, { color: INKC.gold, radius: 1.2, height: 8, dur: 1.2 });
    this.finish("extract", x);
  }

  // ---------------- 战斗事件 ----------------
  onKill(info) {
    const t = info.target;
    if (!t) return;
    if (t === this.ctx.player.entity) return this.die();
    if (t.team !== "enemy") return;
    this.kills++;
    const elite = t.tags && (t.tags.has("elite") || t.tags.has("boss"));
    if (elite) this.elites++;
    const boss = t.tags && t.tags.has("boss");
    // 敌人模块没发 enemy:killed（带 xp）时的兜底感悟
    if (!this.xpSeen || !this.xpSeen.has(t)) {
      const n = boss ? INSIGHT.boss : elite ? INSIGHT.elite : INSIGHT.mob * (1 + 0.15 * (this.R.level - 1));
      this.insight += addXp(this.profile, n * this.tide, "kill");
    }
    if (boss) {
      const x = { id: "boss_exit", kind: "boss", name: "Boss 出口", pos: this.bossExitPos(t.pos), known: !0, confirmed: !0 };
      this.extracts.push(x);
      x.mark = this.addMark({ kind: "extract", pos: x.pos, ext: x, label: x.name, glyph: "阵", color: INKC.gold, ring: !0 });
    }
  }
  // Boss 出口：离尸体 6 米（阵圈 3.2 米不罩住尸体，尸体能按 F 搜），优先朝主角那一侧、找可站的平地；找不到才放在原地
  bossExitPos(at) {
    const hp = this.ctx.player.pos, y0 = this.map.height(at.x, at.z), R = 6;
    const a0 = Math.atan2(hp.z - at.z, hp.x - at.x);
    for (let k = 0; k < 16; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const x = at.x + Math.cos(a) * R, z = at.z + Math.sin(a) * R, y = this.map.height(x, z);
      if (Math.abs(y - y0) < 1.2 && y > -0.5 && canStand(x, z, y, 0.6)) return new THREE.Vector3(x, y, z);
    }
    return at.clone();
  }
  // 斩妖感悟（敌人模块算好的 xp，按灵潮倍率）
  // 行迹统计：profile.stats[k] += n
  stat(k, n = 1) {
    const S = this.profile.stats;
    S[k] = (S[k] || 0) + n;
  }
  onEnemyKilled(e) {
    if (e && e.boss) {
      const B = (this.profile.stats.bosses = this.profile.stats.bosses || {});
      B[e.boss] = (B[e.boss] || 0) + 1;
    }
    if (!e || !e.enemy) return;
    (this.xpSeen = this.xpSeen || new WeakSet()).add(e.enemy);
    if (e.xp > 0) this.insight += addXp(this.profile, e.xp * this.tide, "kill");
    if (e.boss && e.first) this.firsts.push(e.enemy.name || e.type);
  }
  onDamage(info) {
    // 记下最后伤到林墨的东西（第一次身陨写进行迹）
    if (info.target === this.ctx.player.entity && info.amount > 0 && info.attacker) this.lastHitBy = info.attacker.name || info.attacker.kind || "妖兽";
    // 遁地符读条受击打断
    if (this.channel && (this.channel.kind === "talisman" || this.channel.kind === "mist") && info.target === this.ctx.player.entity && info.amount > 0) this.cancelChannel(this.channel.kind === "mist" ? "穿雾被打断" : "遁地符被打断");
  }
  die() {
    if (this.state === "dead" || this.state === "done") return;
    if (this.boss) this.boss.end("death");
    // 序章狼头目之前身陨：本小节开头满血重来（步骤引擎负责复位）
    if (this.pro && this.pro.onDeath()) {
      this.state = "dead";
      this.channel = null;
      this.ctx.player.deadT = -1e9;
      return;
    }
    this.state = "dead";
    this.channel = null;
    this.deathPos = this.ctx.player.pos.clone();
    this.ctx.player.deadT = -1e9; // 出行局里身陨不原地复活，由流程结算后回洞府
    setTimeout(() => this.finish("death"), 1800);
  }

  // 结算（撤离成功 / 身陨）：写入存档，返回给结算界面的数据
  finish(kind, ext) {
    if (this.result) return this.result;
    if (this.boss) this.boss.end(kind === "death" ? "death" : "leave"); // 首领战中途用遁地符等离开
    this.syncPotions();
    const P = this.profile;
    const carriedLeft = this.carried.map((it) => ({ ...it }));
    let r;
    if (this.region === "tutorial" && kind === "death") {
      r = settleDeath(P, { ...this, region: "tutorial" });
      r.rescued = !0;
    } else r = kind === "extract" ? settleExtract(P, this) : settleDeath(P, this);
    // 天机镜：记住发现的撤离点与着墨
    const mem = (P.map[this.region] = P.map[this.region] || { extracts: [] });
    mem.extracts = [...new Set([...(mem.extracts || []), ...this.extracts.filter((x) => x.known && (x.kind === "gate")).map((x) => x.id)])];
    if (this.explored) mem.inked = Array.from(this.explored.cells);
    P.stats.runs = (P.stats.runs || 0) + (this.region === "tutorial" ? 0 : 1);
    P.stats.kills = (P.stats.kills || 0) + this.kills;
    if (kind === "extract") P.stats.extracted = (P.stats.extracted || 0) + 1;
    else P.stats.deaths = (P.stats.deaths || 0) + 1;
    // 行迹：最满的一次、带回过的最好一件、第一次身陨
    if (kind === "extract" && this.region !== "tutorial") {
      const kept = r.kept || [], value = kept.reduce((a, it) => a + valueOf(it), 0);
      if (!P.stats.bestHaul || value > P.stats.bestHaul.value) P.stats.bestHaul = { run: P.stats.runs, region: this.region, value, items: kept.length };
      for (const it of kept) {
        const b = P.stats.bestItem, q = it.rarity || 0, v = valueOf(it);
        if (!b || q > b.rarity || (q === b.rarity && v > (b.value || 0))) P.stats.bestItem = { id: it.id, name: (defOf(it) || {}).name || it.id, rarity: q, value: v, run: P.stats.runs, region: this.region };
      }
    }
    if (kind !== "extract" && !P.stats.firstDeath) P.stats.firstDeath = { run: P.stats.runs, by: this.lastHitBy || "不明", region: this.region };
    if (this.region === "tutorial") P.flags.tutorialDone = !0;
    this.result = { ...r, region: this.region, regionName: this.R.name, time: this.t, kills: this.kills, elites: this.elites, insight: Math.round(this.insight), via: ext ? ext.name || ext.kind : null, firsts: this.firsts, retrieved: this.retrieved || null, tide: this.tide, phase: this.phase, carriedLeft };
    if (this.quests && this.quests.settle) {
      try {
        this.result.quests = this.quests.settle(this, this.result) || null;
      } catch (e) {
        console.error("[run] 委托 settle 失败", e);
      }
    }
    this.clearMarker();
    this.ctx.world.events.emit("run:end", { result: kind, run: this });
    this.emit("end");
    return this.result;
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    if (this.state === "loading" || this.state === "done") return;
    const ctx = this.ctx, inp = ctx.input;
    this.t += dt;
    // 天时
    const ph = this.R.phases;
    const phase = this.phaseAt(this.t);
    if (phase !== this.phase) {
      this.phase = phase;
      this.toast(["", "日已正午，巡游精英出没", "日暮西山，妖兽躁动", "入夜！妖潮将至"][phase], phase >= 2 ? "warn" : "", 3);
      if (phase === 3 && this.region !== "tutorial") this.spawnNightChest();
      if (phase >= 1 && this.region !== "tutorial") this.spawnPatrols();
      this.emit("phase");
    }
    const k = Math.min(1, this.t / (ph[2] + 60));
    this.map.setTimeOfDay(k);
    if (this.timeOfDay) this.timeOfDay(this.phase, this.t);
    // 妖潮
    if (this.phase === 3 && this.R.nightWaveEvery && this.t >= this.nextWave && this.state !== "dead") {
      this.nextWave = this.t + this.R.nightWaveEvery;
      this.spawnWave(4 + ((Math.random() * 3) | 0), Math.random() < 0.35);
      this.toast("妖潮来袭！", "warn");
    }
    if (this.buffs && this.buffs.length && (this.state === "play" || this.state === "channel")) this.tickBuffs(dt);
    this.map.update(dt);
    this.pickups.update(dt);
    if ((this.markerT = (this.markerT || 0) - dt) <= 0 && this.markerDirty) (this.markerDirty = !1), (this.markerT = 1), this.saveMarker();
    this.containers.update(dt);
    if (this.quests && this.quests.update) {
      try {
        this.quests.update(dt);
      } catch (e) {
        console.error("[run] 委托 update 失败", e);
        this.quests = null;
      }
    }
    // 交互（F）、遁地符（G）
    if (this.state === "play" && inp) {
      const mg = this.boss.mistNear();
      if (mg) {
        this.hint = "按住 F · 穿雾而退（受击打断）";
        if (inp.down("KeyF")) this.startMist(mg);
      } else {
        const m = this.nearestMark();
        this.hint = m ? (m.kind === "extract" ? `F · ${m.ext.confirmed || m.ext.kind !== "ruin" ? m.label : "未明残阵"}${m.ext.kind === "cave" ? "（撤离）" : "（开始撤离）"}` : `F · ${m.label}`) : "";
        if (m && inp.pressed("KeyF")) this.interact(m);
      }
      if (inp.pressed("KeyG")) this.useTalisman();
      if (inp.pressed("Digit3")) this.useElementFu();
      if (inp.pressed("Digit4")) this.cycleElementFu();
    } else this.hint = "";
    if ((this.hintT = (this.hintT || 0) - dt) <= 0) (this.hintT = 0.5), this.checkHints();
    // 排队的提示（首杀必得等）：首领处决演出期间通知被收起，演出结束再弹
    if (this.lateToasts && this.lateToasts.length && !(typeof document !== "undefined" && document.body.classList.contains("mk-bossexec"))) for (const a of this.lateToasts.splice(0)) this.toast(...a);
    this.bossGate(dt);
    this.bossGateHint();
    this.bossSpawn();
    this.boss.update(dt);
    if (this.pro) this.pro.update(dt);
    this.updatePatrols(dt);
    if (this.mapModel) this.mapModel.update(dt);
    // 残阵：靠近 30 米确认真假
    for (const x of this.extracts) {
      const d = x.pos.distanceTo(ctx.player.pos);
      if (d < 30 && !x.known) x.known = !0;
      if (x.kind === "gate" && d < 18) x.known = !0;
    }
    // 读条
    if (this.channel && this.channel.kind === "mist") {
      // 墨雾门：按住 F 才走条，松开即停；首领战结束（被斩）也停
      const c = this.channel;
      if (!inp || !inp.down("KeyF") || !this.boss.fight) this.cancelChannel();
      else if ((c.t += dt) >= c.need) {
        this.channel = null;
        this.state = "play";
        this.boss.retreat(c.gate);
        this.emit("channel");
      }
    } else if (this.channel) {
      const c = this.channel, hp = ctx.player.pos;
      const inside = c.kind === "talisman" ? !0 : Math.hypot(hp.x - c.pos.x, hp.z - c.pos.z) <= EXTRACT.radius;
      c.inside = inside;
      if (inside) c.t += dt;
      if (c.ext && c.ext.mark && c.ext.mark.ringMesh) c.ext.mark.ringMesh.material.opacity = 0.45 + 0.4 * Math.sin(this.t * 10);
      if (c.t >= c.need) this.extract(c.ext || c);
    }
    // 天机镜着墨
    const E = this.explored;
    if (E && (E.t -= dt) <= 0) {
      E.t = 0.25;
      const p = ctx.player.pos, b = E.b, r = 14;
      for (let gy = 0; gy < E.h; gy++)
        for (let gx = 0; gx < E.w; gx++) {
          const x = b.x0 + ((gx + 0.5) / E.w) * (b.x1 - b.x0), z = b.z0 + ((gy + 0.5) / E.h) * (b.z1 - b.z0);
          if ((x - p.x) ** 2 + (z - p.z) ** 2 < r * r && !E.cells[gy * E.w + gx]) (E.cells[gy * E.w + gx] = 1), (E.stamp = (E.stamp || 0) + 1);
        }
    }
    for (const m of this.marks) if (m.kind === "gather" || m.kind === "lostbag") m.group.children[0] && (m.group.children[0].position.y = 0.05 * Math.sin(this.t * 3));
  }

  spawnWave(n, elite) {
    const E = this.ctx.enemies, hp = this.ctx.player.pos;
    const a = Math.random() * Math.PI * 2;
    let c = hp.clone().add(new THREE.Vector3(Math.cos(a) * 16, 0, Math.sin(a) * 16));
    const from = (this.map.points.night || []).filter((q) => q.pos.distanceTo(hp) > 14).sort((x, y) => x.pos.distanceTo(hp) - y.pos.distanceTo(hp))[0];
    if (from && from.pos.distanceTo(hp) < 70) c = from.pos.clone().lerp(hp, Math.max(0, 1 - 30 / from.pos.distanceTo(hp)));
    const out = E.spawnPack(n, elite, c) || [];
    for (const e of out) this.buffEnemy(e), e.setAggro && e.setAggro();
    return out;
  }
  spawnPatrols() {
    if (this.patrols) return;
    const E = this.ctx.enemies;
    this.patrols = [];
    for (const pt of this.map.points.patrols || []) {
      if (!pt.path || pt.path.length < 2) continue;
      const out = E.spawnPack(1, !0, pt.path[0].clone()) || [];
      for (const e of out) this.buffEnemy(e), this.patrols.push({ e, path: pt.path, loop: pt.loop !== !1, i: 1, dir: 1, at: pt.path[0].clone() });
    }
  }
  updatePatrols(dt) {
    for (const p of this.patrols || []) {
      const e = p.e;
      if (!e.alive || e.aggro || !e.home) continue;
      const to = p.path[p.i], d = p.at.distanceTo(to);
      if (d < 0.5) {
        if (p.loop) p.i = (p.i + 1) % p.path.length;
        else if (p.i + p.dir < 0 || p.i + p.dir >= p.path.length) (p.dir *= -1), (p.i += p.dir);
        else p.i += p.dir;
        continue;
      }
      p.at.addScaledVector(to.clone().sub(p.at).normalize(), Math.min(d, 1.6 * dt));
      e.home.copy(p.at);
      if (e.pos.distanceTo(p.at) > 6) e.wanderTo = p.at.clone();
    }
  }
  spawnNightChest() {
    const hp = this.ctx.player.pos;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 10;
      const x = hp.x + Math.cos(a) * r, z = hp.z + Math.sin(a) * r;
      const y = this.map.height(x, z);
      if (y < -0.5) continue;
      this.addMark({ kind: "chest", pos: new THREE.Vector3(x, y, z), tier: "night", label: "夜明宝箱", glyph: "箱", color: INKC.gold });
      this.toast("夜明宝箱现世", "gold");
      return;
    }
  }

  phaseAt(t) {
    const ph = this.R.phases;
    return t < ph[0] ? 0 : t < ph[1] ? 1 : t < ph[2] ? 2 : 3;
  }

  // ---------------- 灵潮（天时回报倍率） ----------------
  get tide() {
    return this.region === "tutorial" ? 1 : PHASES[this.phase].tide || 1;
  }
  // 可堆叠物品的数量按灵潮倍率放大（随机取整）；品质由掉落模块读 rollLoot 的 opts.tide
  applyTide(insts) {
    const k = this.tide;
    if (k <= 1) return insts;
    for (const it of insts) {
      const d = defOf(it) || {};
      if ((d.stack || 1) <= 1 || isKey(it)) continue;
      const v = it.n * k;
      it.n = Math.min(d.stack, Math.floor(v) + (Math.random() < v % 1 ? 1 : 0));
    }
    return insts;
  }

  // ---------------- 引导（玩法评审 G6 §5：每局最多 3–4 个新概念，一次只教一件事） ----------------
  hintOnce(id, text, dur = 4.5) {
    const P = this.profile, st = this.ctx.flow && this.ctx.flow.settings;
    if ((st && st.hints === !1) || P.flags["hint_" + id]) return !1;
    P.flags["hint_" + id] = 1;
    this.toast(text, "", dur);
    return !0;
  }
  startHints() {
    const n = this.no;
    if (this.region === "tutorial") {
      if (!this.pro) this.hintOnce("move", "WASD 移动 · 左键出剑 · 空格闪身", 6);
    }
    else if (n >= INTRO_AT.talisman && this.talismanCount() > 0) this.hintOnce("talisman", "遁地符：按 G 原地读条遁回洞府（受击打断）", 5);
    else if (n >= INTRO_AT.pills && this.carried.some((i) => (defOf(i) || {}).cat === "pill")) this.hintOnce("pills", "丹药：按 1 回气丹、2 回春丹", 5);
    else this.hintOnce("tide", "天时条：越晚灵潮越旺，掉落与感悟越多——妖兽也越凶", 5);
  }
  checkHints() {
    const pl = this.ctx.player.pos;
    if (this.region === "tutorial") return; // 序章的提示由步骤引擎给出
    const near = (k, r) => this.marks.some((m) => m.kind === k && Math.hypot(m.pos.x - pl.x, m.pos.z - pl.z) < r);
    if (near("gather", 4)) this.hintOnce("gather", "灵草、矿脉：靠近按 F 采集，采到的直接收进储物袋");
    if (this.pickups.list.length && this.pickups.near(pl, 4).length) this.hintOnce("pickF", "地上的东西不会自动拾取：走近按 F 取（一次取走身边所有）");
    if (this.extracts.some((x) => x.kind !== "cave" && x.known && x.pos.distanceTo(pl) < 8)) this.hintOnce("channel", "走进阵圈按 F 开始撤离读条；离开阵圈读条暂停，妖兽会被吸引过来");
  }
  bossSpawn() {
    const bp = this.map.points.boss, E = this.ctx.enemies;
    if (this.bossSpawned || !bp || !bp.pos || this.region === "tutorial" || !E.ready || !E.spawnBoss) return;
    if (this.ctx.player.pos.distanceTo(bp.pos) > (bp.spawnRadius || 40) || this.gateBlocked()) return;
    this.bossSpawned = !0;
    const b = E.spawnBoss(bp.pos.clone(), bp.type);
    if (b) this.boss.e = b;
    if (b) this.buffEnemy(b), this.toast(`${(b.def && b.def.name) || "妖王"}${E.realmLabel ? " · " + E.realmLabel(b).text : ""} 现身！`, "warn", 3);
  }
  gateBlocked() {
    const G = this.R.bossGate, P = this.profile, r = P.realm;
    return !!(G && !P.flags.unlockAll && r.stage * 10 + r.layer < G.realm[0] * 10 + G.realm[1]);
  }
  // 首领关口（关卡 points.bossGates：r1 狼骨门、r2 碧鳞门）：走进 r 米时提示"此去：…"（HUD 天时条下方一行小字，不挡视野）；离开 r + 4 米后再走近会再提示
  bossGateHint() {
    const G = this.map.points.bossGates;
    if (!G || !G.length) return;
    const pl = this.ctx.player.pos;
    for (const g of G) {
      const d = Math.hypot(pl.x - g.pos.x, pl.z - g.pos.z), r = g.r || 8;
      if (!g.near && d < r) {
        g.near = !0;
        this.emit("gateHint", this.boss.gateHint(g)); // { text（{realm} 已换成境界标签）, sub }
      } else if (g.near && d > r + 4) g.near = !1;
    }
  }
  // Boss 场地的境界禁制（数值评审：碧鳞练气八层可挑战）：境界不够时挡在场外
  bossGate(dt) {
    const G = this.R.bossGate, bp = this.map.points.boss;
    if (!G || !bp || !bp.pos) return;
    if (!this.gateBlocked()) return;
    const pl = this.ctx.player.pos, R = bp.radius || bp.gate || 16;
    const dx = pl.x - bp.pos.x, dz = pl.z - bp.pos.z, d = Math.hypot(dx, dz);
    this.gateT = (this.gateT || 0) - dt;
    if (d >= R || d < 1e-3) return;
    pl.x = bp.pos.x + (dx / d) * R;
    pl.z = bp.pos.z + (dz / d) * R;
    pl.y = this.map.height(pl.x, pl.z);
    if (this.gateT <= 0) (this.gateT = 3), this.toast(G.text, "warn", 2.5);
  }
  // 五行符（数值评审 G10）：在准星方向 range 米内炸开半径 radius 的五行爆发；3 使用，4 换一种
  elementFus() {
    const kinds = [];
    for (const it of this.carried) {
      const u = (defOf(it) || {}).use;
      if (u && u.element && it.n > 0 && !kinds.includes(it.id)) kinds.push(it.id);
    }
    return kinds;
  }
  cycleElementFu() {
    const k = this.elementFus();
    if (!k.length) return;
    this.fuSel = k[(k.indexOf(this.fuSel) + 1) % k.length];
    this.toast(`五行符：${(defOf({ id: this.fuSel }) || {}).name}（按 3 使用）`, "", 1.5);
  }
  useElementFu() {
    if (this.state !== "play" && this.state !== "channel") return !1;
    const kinds = this.elementFus();
    if (!kinds.length) return this.toast("行囊里没有五行符", "warn"), !1;
    if (!kinds.includes(this.fuSel)) this.fuSel = kinds[0];
    const it = this.carried.find((i) => i.id === this.fuSel && i.n > 0);
    const u = (defOf(it) || {}).use;
    const ctx = this.ctx, hero = ctx.player.entity, from = ctx.player.pos;
    const aim = ctx.input && ctx.input.aim ? ctx.input.aim : from.clone().add(ctx.player.facing || new THREE.Vector3(0, 0, -1));
    const dir = new THREE.Vector3(aim.x - from.x, 0, aim.z - from.z);
    const d = Math.min(u.range || 6, dir.length());
    if (dir.lengthSq() > 1e-6) dir.normalize();
    const p = from.clone().addScaledVector(dir, d);
    p.y = this.map.height(p.x, p.z);
    const R = u.radius || 3.5, col = ELEM_COLOR[u.element] || INKC.ink;
    ctx.vfx.ring(p, R, { color: col, dur: 0.5, width: 0.1 });
    ctx.vfx.burst(p, { color: col, count: 24, speed: 4, up: 3, size: 0.2 });
    let hits = 0;
    for (const e of ctx.enemies.list) {
      if (!e.alive || !e.entity || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > R + (e.entity.radius || 0.5)) continue;
      const dmg = u.damage || {};
      if (ctx.world.dealDamage(hero, e.entity, { base: dmg.base || 0, scale: dmg.scale || {}, element: u.element, shieldMul: u.shieldMul, tags: ["talisman"], pos: e.pos, dir: e.pos.clone().sub(p).setY(0).normalize(), knock: 0.6 })) hits++;
    }
    it.n -= 1;
    if (it.n <= 0) this.carried.splice(this.carried.indexOf(it), 1);
    ctx.rig && ctx.rig.shake(0.15);
    this.emit("bag");
    return hits;
  }
  talismanCount() {
    return this.carried.filter((i) => i.id === "dundi_fu").reduce((s, i) => s + i.n, 0) + this.pouch.count("dundi_fu");
  }

  // ---------------- 拾取 / 入袋 ----------------
  // 收进储物袋（关键物品进护身格）：按 F 取地上的东西（src: "ground"）、采集直接入袋（src: "gather"）都走这里。
  //   返回 { got, left }，left = 储物袋放不下的（调用方决定留在原地 / 落地）。
  //   一批只发一次 "bag"（储物袋 / HUD 只刷新一次）；通用的"拾得 / 采得…"并成一条提示。
  collect(insts, o = {}) {
    const got = [], left = [];
    for (const it of insts) (isKey(it) ? (this.keyItems.push(it), !0) : this.bag.add(it)) ? got.push(it) : left.push(it);
    if (got.length) this.pickBatch(() => got.forEach((it) => this.onPickup(it)), o);
    return { got, left };
  }
  // 一批拾取（collect、搜取窗"全取"）：期间 onPickup 不逐件发 "bag"、不逐件弹"拾得"，结束时各一次
  pickBatch(fn, o = {}) {
    if (this.batch) return fn();
    const B = (this.batch = { bag: !1, plain: [], note: !1 });
    let ret;
    try {
      ret = fn();
    } finally {
      this.batch = null;
    }
    const P = B.plain, rare = P.some((it) => (it.rarity || 0) >= 2);
    const list = (xs) => xs.slice(0, 3).map(groundName).join("、") + (xs.length > 3 ? ` 等 ${xs.length} 件` : "");
    if (o.src === "gather" && P.length) this.toast(`采得 ${list(P)}`, rare ? "gold" : "", 1.8);
    else if (o.src !== "gather" && B.note) this.toast(`拾得 ${list(P)}`, rare ? "gold" : "");
    if (B.pages) for (const id of B.pages) {
      const ph = pageHint(this.profile, id, [...this.bag.items, ...this.keyItems]);
      if (ph) this.toast(ph.text, ph.ready ? "gold" : "", 2.5);
    }
    if (B.bag) this.emit("bag");
    return ret;
  }
  // 首领首杀必得物（青牙之牙、带 key 标签的碧鳞内丹 / 筑基丹方 / 乾坤锦囊、首杀功法完本）：击杀那一刻直接收进护身格（身陨不失）。
  //   首杀标记在死亡时就写了，之后只按重复击杀掉落——这些东西要是留在尸体里没搜到 / 袋满 / 身陨，就永久错过（2026-11-17 用户报"青牙之牙"）。
  //   返回其余物品（照常进首领尸体）。提示排到处决演出之后（演出期间通知被收起）。
  secureFirstKill(items, bossName = "首领") {
    const must = (it) => isKey(it) || FIRST_KILL_KEEP.has(it.id) || /^scroll_.+_book$/.test(it.id);
    const got = items.filter(must);
    if (!got.length) return items;
    for (const it of got) this.keyItems.push(it), this.emit("pickup", it);
    const names = got.map((it) => (defOf(it) || {}).name || it.id).join("、");
    (this.lateToasts ||= []).push([`首杀${bossName}必得：${names} 已收入护身格（身陨不失）`, "gold", 5]);
    this.bagChanged();
    return items.filter((it) => !must(it));
  }
  // 按 F 取地上的东西：身边 PICK_R 米内全部；放不下的留在原地，给满袋提示
  takeGround() {
    const r = this.pickups.takeNear(this.ctx.player.pos);
    if (r.left.length) this.onBagFull(r.left[0], r.left.length);
    return r;
  }
  // 采集完成：按 F 采本身就是一次主动操作 → 采到的直接进储物袋；放不下的才落地（之后按 F 取）
  //   e.got / e.left 留给 GatherUI：入袋的从草丛飞进储物袋，落地的播抛落
  onGathered(e) {
    if (!e || !e.items) return;
    const { got, left } = this.collect(this.applyTide(toInstances(e.items, this.R)), { src: "gather" });
    if (left.length) this.pickups.dropMany(e.pos, left, 0.6), this.onBagFull(left[0], left.length);
    e.got = got;
    e.left = left;
  }
  bagChanged() {
    if (this.batch) this.batch.bag = !0;
    else this.emit("bag");
  }
  onPickup(inst) {
    const d = defOf(inst) || {};
    this.emit("pickup", inst);
    // 教学局：捡到锈剑直接佩上
    if (this.region === "tutorial" && d.cat === "gear" && d.slot && !this.profile.equip[d.slot] && slotOpen(this.profile, d.slot)) {
      this.bag.remove(inst.uid);
      this.profile.equip[d.slot] = inst;
      this.applyEquip();
      this.toast(`佩上 ${d.name}`, "gold");
      this.bagChanged();
      return;
    }
    // 丹药 / 符箓：直接进快捷栏（stowConsumable）；丹药囊没有空栏的新种类留在储物袋里，双击服用
    if ((d.cat === "pill" || d.cat === "talisman") && !isKey(inst)) {
      const how = this.stowConsumable(inst);
      if (how) {
        this.toast(`拾得 ${d.name} ×${inst.n} · ${how}`, "gold", this.region === "tutorial" ? 3 : 2);
        this.bagChanged();
        return;
      }
      if (d.cat === "pill" && this.potionSlot(inst.id)) this.hintOnce("pillBag", `丹药囊没有空栏：${d.name}留在储物袋里，打开储物袋双击服用`, 4);
    }
    const rare = (inst.rarity || 0) >= 2;
    if (isKey(inst)) return this.toast(`拾得 ${d.name} · 关键物品收入护身格（身陨不失）`, "gold", 3), this.bagChanged();
    if (inst.identified === !1 && this.no >= INTRO_AT.identify) this.hintOnce("unid", "未鉴定的宝物：带回去，结算时当场揭晓");
    // 残页：拾得时直接报进度（数已含刚入袋的这张），代替通用"拾得"
    const ph = inst.identified !== !1 && pageHint(this.profile, inst.id, [...this.bag.items, ...this.keyItems]);
    if (ph) {
      if (this.batch) (this.batch.pages = this.batch.pages || new Set()).add(inst.id), this.batch.plain.push(inst); // 一批里同种残页只报一次（批末）
      else this.toast(ph.text, ph.ready ? "gold" : "", 2.5);
      return this.bagChanged();
    }
    const note = rare || d.cat === "gear" || d.cat === "artifact" || d.cat === "scroll";
    if (this.batch) this.batch.plain.push(inst), note && (this.batch.note = !0); // 批量：结束时并成一条
    else if (note) this.toast(`拾得 ${inst.identified === !1 ? "未鉴定的" : ""}${d.name}${inst.n > 1 ? " ×" + inst.n : ""}`, rare ? "gold" : "");
    this.bagChanged();
  }
  onBagFull(inst, n = 1) {
    const d = defOf(inst) || {};
    this.toast(`储物袋已满（${this.bag.used}/${this.bag.capacity} 格）· ${d.name}${n > 1 ? ` 等 ${n} 件` : ""} 放不下 · 按 Tab 取舍`, "warn", 2.5);
    this.bagFullCount = (this.bagFullCount || 0) + 1;
    this.hintOnce("bagfull", "储物袋满了：按 Tab 打开，丢掉不值钱的，再走近按 F 取", 5);
    this.emit("bagfull", inst);
  }
  // 丢到脚下（不会被自动捡回：地上的东西一律按 F 取）
  dropFromBag(uid) {
    const it = this.bag.remove(uid);
    if (it) this.pickups.drop(this.ctx.player.pos, it, 0.8);
    return it;
  }

  // ---------------- 中途关闭页面的记录 ----------------
  saveMarker() {
    if (this.region === "tutorial" || this.result) return;
    try {
      localStorage.setItem("moxian.run." + this.profile.slot, JSON.stringify({ region: this.region, at: Date.now(), bag: this.bag.items, carried: this.carried, keys: this.keyItems, pos: this.ctx.player.pos.toArray() }));
    } catch {}
  }
  clearMarker() {
    localStorage.removeItem("moxian.run." + this.profile.slot);
  }

  // ---------------- 工具 ----------------
  get value() {
    return this.bag.value;
  }
  toast(text, kind = "", dur) {
    if (text && this.ctx.ui && this.ctx.ui.toast) this.ctx.ui.toast(text, { kind, dur });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(type, data) {
    for (const fn of this.listeners) fn(type, data, this);
  }
  dispose() {
    if (this.boss) this.boss.dispose();
    this.ctx.player.entity && this.ctx.player.entity.stats.removeSource("preRun"); // 出发前服用的丹药只管这一局
    for (const x of this.buffs || []) this.ctx.player.entity && this.ctx.player.entity.stats.removeSource(x.src); // 炼化增益：剩余时长留在存档里，下一局接着计
    this.buffs = [];
    if (this.pro) this.pro.dispose(), (this.pro = null);
    if (this.quests) {
      try {
        this.quests.dispose && this.quests.dispose();
      } catch (e) {
        console.error("[run] 委托 dispose 失败", e);
      }
      this.quests = null;
    }
    for (const off of this.offs) off();
    this.offs = [];
    for (const m of [...this.marks]) this.removeMark(m);
    this.pickups && this.pickups.dispose();
    this.containers && this.containers.dispose();
    this.clearEnemies();
    this.map && this.map.dispose && this.map.kind === "level" && this.map.dispose();
    this.listeners.clear();
  }
}

// ---------------- 主角：境界属性 + 装备 + 构筑（出行局与洞府共用：ctx.applyProfileStats） ----------------
export function applyEquipStats(h, P) {
  h.stats.removeSource("equip");
  for (const slot of ["sword", "robe", "jade"]) if (P.equip[slot] && slotOpen(P, slot)) h.stats.addAll(gearMods(P.equip[slot]), "equip"); // 未解锁的栏位不生效（旧存档进洞府时退回仓库）
}
// 局内装配 = 出行准备里定下的 profile.build（装配 v2：空栏就是空栏，不再按已学会的顺序补位；补位只在领悟 / 开栏那一刻做一次，见 src/ui/loadout.js syncNewLearned）
export function loadoutOf(P) {
  const slots = P.unlocks.spellSlots ?? 1;
  const b = P.build || {};
  const learned = P.flags?.learned?.spells;
  // 生效法术须有定义、已学会、已装配且已开栏；只过滤运行时构筑，不改存档或补空栏。
  const spells = [0, 1, 2].map((i) => {
    const id = b.spells?.[i];
    return i < slots && typeof id === "string" && Object.hasOwn(SPELLS, id) && Array.isArray(learned) && learned.includes(id) ? id : null;
  });
  const xs = (b.xinfa || []).slice(0, P.unlocks.xinfaSlots || 0).filter(Boolean);
  const art = P.equip.artifact, artId = art && (defOf(art) || {}).artifactId;
  return {
    realm: slots >= 3 ? "zhuji" : slots >= 2 ? "lianqi5" : "lianqi1",
    spells,
    artifact: { id: slotOpen(P, "artifact") && artId ? artId : null, level: (art && (art.level || 1) + ((defOf(art) || {}).bonusLevel || 0)) || 1 },
    formation: P.unlocks.formationSlot ? P.build.formation : null,
    xinfa: xs,
  };
}
// 炼化增益的属性：b.mods（Stats 格式）> b.effects（数组同 mods；或 { vuln: -0.04, hp: 0.03 }：vuln 为 flat，其余为 pct）> REFINE.buff.tiers[tier-1].mods
const BUFF_TIERS = () => (REFINE.buff && REFINE.buff.tiers) || [];
function buffTier(b) {
  const T = BUFF_TIERS();
  return typeof b.tier === "number" ? T[Math.max(0, Math.min(T.length - 1, b.tier - 1))] : T.find((t) => t.label === b.tier);
}
export function buffMods(b) {
  if (Array.isArray(b.mods)) return b.mods;
  if (Array.isArray(b.effects)) return b.effects;
  if (b.effects && typeof b.effects === "object") return Object.entries(b.effects).map(([stat, value]) => ({ stat, type: stat === "vuln" ? "flat" : "pct", value }));
  const t = buffTier(b);
  return (t && t.mods) || [];
}
export function buffName(b) {
  const t = buffTier(b);
  return b.name || `${(REFINE.buff && REFINE.buff.name) || "灵气充盈"}${t ? "·" + t.label : ""}`;
}
const MOD_NAME = { vuln: "受到伤害", hp: "气血上限", atk: "攻击", mp: "真气上限", spell: "法力", def: "防御", move: "身法", crit: "会心" };
export function buffText(b) {
  return buffMods(b).map((m) => `${MOD_NAME[m.stat] || m.stat} ${m.value < 0 ? "−" : "+"}${m.type === "pct" || m.stat === "vuln" || Math.abs(m.value) < 1 ? Math.round(Math.abs(m.value) * 100) + "%" : Math.abs(m.value)}`).join(" · ");
}

export function applyHeroStats(ctx, P) {
  const h = ctx.player.entity;
  const base = heroStats(P);
  for (const [k, v] of Object.entries(base)) h.stats.setBase(k, v);
  applyEquipStats(h, P);
  const S = ctx.skills;
  if (S) {
    const lo = loadoutOf(P);
    if (S.setRealm) S.setRealm(lo.realm);
    S.setLoadout && S.setLoadout({ spells: lo.spells, artifact: lo.artifact, formation: lo.formation, xinfa: lo.xinfa });
  }
  h.hp = Math.min(h.hp, h.stats.get("hp"));
  h.mp = Math.min(h.mp, h.stats.get("mp"));
  return h;
}

// 中途关闭页面：载入存档时检查并按身陨结算（首次豁免）
export function checkAbandonedRun(profile) {
  const key = "moxian.run." + profile.slot;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  localStorage.removeItem(key);
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  ensureFlowItems();
  const bag = new Bag(Infinity);
  bag.items = m.bag || [];
  const fake = { region: m.region, bag, carried: m.carried || [], keyItems: m.keys || [], protect: [], deathPos: m.pos ? new THREE.Vector3(...m.pos) : null };
  if (!profile.flags.reloadExempted) {
    profile.flags.reloadExempted = !0;
    for (const it of [...bag.clear(), ...fake.carried, ...fake.keyItems]) profile.storage.add(it);
    return { exempt: !0, region: m.region };
  }
  const r = settleDeath(profile, fake);
  profile.stats.deaths = (profile.stats.deaths || 0) + 1;
  return { exempt: !1, region: m.region, result: r };
}
