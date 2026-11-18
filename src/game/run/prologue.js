// 序章（教学局 v2）步骤引擎（模块 A）：按关卡数据 tutorialLayout.steps 推进（docs/review/level/序章设计_v2.md §6 F1–F10）。
// 判定方式：从开局就累计"事实"（拾取、采集、开箱、服丹、完美闪避、击杀、掷符、破盾、打开储物袋、连招、闪身、走到过的地点……），
// 每一步的完成条件是对事实的查询——玩家提前做到的事，到了这一步立刻以"早已做到"的方式勾掉（不再重复教学长提示），
// 连续多步都已满足时快速依次勾掉。
//   顺序：按 seq 推进（忽略 legacy）；optional 可跳过（下一个非可选步完成时作废）
//   刷怪：when "reach" 走近 r 米就刷（不管当前在哪一步）| "afterPrev" 上一步完成时 | "channel" 读条开始时
//   硬门槛：狼头目死前破洞府封着；撤离读条 5 秒（run.js）
//   身陨：狼头目之前 → 本小节开头满血重来，东西保留；狼头目及以后 → 剧情救援
// 表现在 src/ui/screens/prologue_ui.js，通过 run.emit("pro", …) 通知。
import * as THREE from "three";
import { makeItem, ITEMS, defOf } from "../../core/items.js";
import { INKC } from "../../fx/vfx.js";
import { inkEnso } from "../../world/markers.js";

const v3 = (p) => (!p ? null : p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1]));
const RESCUE_FROM = "elite";
// 狼头目场地：走进 trigger 米才刷；仇恨 sight 米；离场地中心 leash 米回场；场地边界一圈淡墨（radius 米）
export const ARENA = { trigger: 12, sight: 8, leash: 14, leashTime: 6, radius: 10 }; // 这一步（狼头目）及以后身陨走剧情救援
const EARLY_GAP = 0.38; // 提前完成的步骤依次勾掉的间隔（秒）
const NEAR = 8; // 采集 / 开箱事件算到哪一步：离该步位置 NEAR 米内
// 教的概念 → 玩家已经自己做过的事实（做过就不再弹这条教学提示）
const TAUGHT = {
  dodge: (f) => f.perfectDodge > 0,
  bag: (f) => f.bagOpen > 0,
  gather: (f) => f.gather.length > 0,
  chest: (f) => f.chest.length > 0,
  pill: (f) => f.pillUse > 0,
  attack: (f) => f.combo > 0,
  shield: (f) => f.shieldBreak > 0,
};
// 早已做到时飘出的小字
const EARLY_TEXT = { gather: "早已采得 ✓", chest: "早已开过 ✓", pickup: "早已拾得 ✓", kill: "早已击退 ✓", reach: "早已到过 ✓", pill: "早已服过 ✓", shieldBreak: "早已破盾 ✓" };

export class Prologue {
  constructor(run) {
    this.run = run;
    const ctx = run.ctx;
    this.ctx = ctx;
    const pts = run.map.points;
    this.steps = (pts.steps || [])
      .filter((s) => !s.legacy && s.seq != null)
      .sort((a, b) => a.seq - b.seq)
      .map((s) => ({ ...s, doneText: s.done || "", pos: v3(s.pos), target: v3(s.target), at: s.trigger && s.trigger.at ? v3(s.trigger.at) : null, done: !1, void: !1, early: !1, spawned: null, lootUids: null }));
    for (const s of this.steps) s.pos.y = run.map.height(s.pos.x, s.pos.z);
    this.idx = 0;
    this.caveOpen = !this.steps.some((s) => s.gate === "cave");
    this.offs = [];
    this.chapter = null;
    this.pills = !1; // 丹药栏是否已出现（开箱之后）
    const TL = (run.map.def && run.map.def.tutorialLayout) || {};
    this.hpMul = TL.hpMul || null; // 旧占位字段
    this.enemyMul = TL.enemyMul || null; // 数值复核：{ mob: { hp, dmg }, elite: { hp, dmg } }
    this.t = 0;
    // 事实（从开局累计）
    this.f = { pickup: new Map(), uids: new Set(), gather: [], chest: [], kills: new Map(), pillUse: 0, perfectDodge: 0, shieldBreak: 0, bagOpen: 0, combo: 0, dash: 0, talisman: 0, visited: new Set() };
  }
  get active() {
    return this.steps.length > 0;
  }
  get cur() {
    return this.steps[this.idx] || null;
  }
  // 当前前沿：从 idx 起到第一个非可选步（含）
  frontier() {
    const out = [];
    for (let i = this.idx; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.done || s.void) continue;
      out.push(s);
      if (!s.optional) break;
    }
    return out;
  }
  chapterSteps(ch = this.chapter) {
    return this.steps.filter((s) => s.chapter === ch);
  }
  emit(type, data) {
    this.run.emit("pro", { type, ...data, pro: this });
  }

  start() {
    const ev = this.ctx.world.events, run = this.run, f = this.f;
    this.offs.push(
      ev.on("kill", (i) => {
        const t = i && i.target;
        if (!t || t.team !== "enemy") return;
        this.lastKillPos = t.pos.clone();
        f.kills.set(t.kind, (f.kills.get(t.kind) || 0) + 1);
      }),
      ev.on("gather:done", (e) => e && e.pos && f.gather.push({ pos: e.pos.clone(), kind: e.kind })),
      ev.on("player:perfectDodge", () => (f.perfectDodge++, this.emit("special", { kind: "dodge", text: "完美闪避！" }))),
      ev.on("player:attack", (e) => e && e.step >= 3 && f.combo++),
      ev.on("player:dash", () => f.dash++),
      ev.on("shield:break", (e) => {
        f.shieldBreak++;
        if (e && e.target) this.ctx.vfx.burst(e.target.pos, { color: INKC.ink, count: 30, speed: 6, up: 3, size: 0.22 });
        this.emit("special", { kind: "shield", text: "破盾！趁它眩晕全力出剑" });
      }),
      run.on((t, d) => {
        if (t === "pickup" && d) f.pickup.set(d.id, (f.pickup.get(d.id) || 0) + d.n), f.uids.add(d.uid);
        if (t === "chest" && d) f.chest.push(d.pos.clone());
      }),
    );
    // 守关场地（狼头目）：一圈淡墨圆相作边界
    this.rings = [];
    for (const g of this.steps.filter((q) => q.gate || (q.spawn && q.spawn.elite))) {
      try {
        const m = inkEnso(ARENA.radius, 0, 7);
        m.position.set(g.pos.x, this.run.map.height(g.pos.x, g.pos.z) + 0.1, g.pos.z);
        if (m.userData.glow && m.userData.glow.uniforms.uAlpha) m.userData.glow.uniforms.uAlpha.value = 0.55;
        this.ctx.scene.add(m);
        this.rings.push(m);
        g.arenaR = ARENA.radius;
      } catch (e) {
        console.warn("[prologue] 场地圆相失败", e);
      }
    }
    // 破洞府：狼头目死前封住（关卡数据 extracts[].sealed）
    for (const x of run.extracts) if (x.sealed) x.locked = !this.caveOpen;
    this.potPrev = this.potSum();
    this.fuPrev = this.fuSum();
    this.started = !1; // 第一步在第一帧进入（界面此时已经建好，能收到标题、提示）
  }
  potSum() {
    const S = this.ctx.skills;
    return S && S.potions ? S.potions.reduce((a, p) => a + (p ? p.count : 0), 0) : 0;
  }
  fuSum() {
    return this.run.carried.filter((i) => ((defOf(i) || {}).use || {}).element).reduce((a, i) => a + i.n, 0);
  }

  // ---------------- 条件：对事实的查询 ----------------
  met(s) {
    const tr = s.trigger || {}, f = this.f, near = (list, p) => list.filter((q) => (q.pos || q).distanceTo(p) < NEAR).length;
    switch (tr.type) {
      case "reach":
        return f.visited.has(s.id);
      case "pickup":
        if (tr.item) return (f.pickup.get(tr.item) || 0) > 0;
        return !!(s.lootUids && s.lootUids.some((u) => f.uids.has(u)));
      case "kill":
        return !!(s.spawned && s.spawned.length && s.spawned.every((e) => !e.alive));
      case "gather":
        return near(f.gather, s.target || s.pos) >= (tr.n || 1);
      case "chest":
        return near(f.chest, s.target || s.pos) > 0;
      case "pill": {
        const h = this.ctx.player.entity;
        return f.pillUse > 0 || (tr.orHpAbove != null && h.hp >= h.stats.get("hp") * tr.orHpAbove);
      }
      case "shieldBreak":
        return f.shieldBreak > 0;
      default:
        return !1; // extract：由撤离结束
    }
  }

  // 进入某一步：已满足 → "早已做到"，稍后快速勾掉、不播教学；否则播标题、提示、旁白
  enter(s) {
    if (!s) return;
    if (s.chapter !== this.chapter) {
      const prev = this.chapter;
      this.chapter = s.chapter;
      this.emit("chapter", { chapter: s.chapter, prev });
    }
    if (s.spawn && s.spawn.when === "afterPrev") this.spawn(s);
    if (this.met(s)) {
      s.early = !0;
      s.earlyAt = this.t + EARLY_GAP;
      this.emit("step", { step: s, early: !0 });
      return;
    }
    this.emit("step", { step: s });
    const taught = s.teach && TAUGHT[s.teach] && TAUGHT[s.teach](this.f);
    if (s.hint && !taught) this.emit("hint", { text: s.hint });
    for (const line of s.say || []) this.emit("say", { text: line });
  }
  lootItems(list) {
    const out = [];
    for (const l of list || []) {
      if (l.stones) out.push(makeItem("spirit_stone", { n: l.stones }));
      else if (l.id && ITEMS[l.id]) out.push(makeItem(l.id, { n: l.n || 1 }));
    }
    return out;
  }
  // 固定掉落（锈剑、狼妖掉落）：剑一开局就放在溪边；狼妖掉落在那一组狼被打完时落在最后倒下的位置
  dropLoot(s) {
    if (!s.loot || s.lootUids || (s.trigger && s.trigger.type === "chest")) return;
    const items = this.lootItems(s.loot);
    s.lootUids = items.map((i) => i.uid);
    // 搜取：固定掉落放进容器（狼妖掉落 → 最后倒下那只的尸身；锈剑 → 溪边的剑），F 搜、取出才算拾得
    const sword = s.id === "sword";
    this.run.containers.stash(sword ? s.pos : this.lastKillPos || s.pos, items, sword ? { label: "溪边的锈剑", glyph: "剑" } : { label: "狼妖遗骸", glyph: "骸" });
  }
  // 序章宝箱：给固定内容（F4）
  chestLoot(pos) {
    let s = null, bd = Infinity;
    for (const q of this.steps) {
      if (!q.trigger || q.trigger.type !== "chest") continue;
      const d = (q.target || q.pos).distanceTo(pos);
      if (d < bd) (bd = d), (s = q);
    }
    this.pills = !0;
    return s && s.loot ? this.lootItems(s.loot) : null;
  }

  chapterIdx(ch) {
    if (!this._chs) this._chs = [...new Set(this.steps.map((q) => q.chapter))];
    return this._chs.indexOf(ch);
  }
  spawnAllowed(s) {
    const cur = this.cur;
    if (!cur) return !1;
    if (s.gate || (s.spawn && s.spawn.elite)) return this.frontier().includes(s);
    return this.chapterIdx(s.chapter) <= this.chapterIdx(cur.chapter) + 1;
  }
  spawn(s) {
    if (s.spawned) return s.spawned;
    const E = this.ctx.enemies, sp = s.spawn;
    if (!E.ready) return null;
    const at = v3(sp.at) || s.pos.clone();
    at.y = this.run.map.height(at.x, at.z);
    const mobs = sp.mobs || ["wolf"];
    const out = E.spawnPack(mobs.length, !!sp.elite, at, { types: mobs, shield: sp.shield || null, region: "tutorial" }) || [];
    for (const e of out) {
      // 序章倍率：步骤自带 hpMul 优先，其次关卡的 enemyMul（按普通 / 精英区分）
      const isElite = e.entity && e.entity.tags && (e.entity.tags.has("elite") || e.entity.tags.has("boss"));
      const em = this.enemyMul && this.enemyMul[isElite ? "elite" : "mob"];
      const mul = sp.hpMul || (em && em.hp) || (sp.elite && this.hpMul) || null;
      if (mul && e.entity) {
        e.entity.stats.add({ stat: "hp", type: "more", value: mul - 1, source: "prologue" });
        e.entity.hp = e.entity.stats.get("hp");
        // 护盾在出场时按原气血生成，这里同比缩放
        const sh = e.entity.shield;
        if (sh && sh.max) (sh.max = Math.round(sh.max * mul)), (sh.hp = Math.min(sh.hp, sh.max));
      }
      if (em && em.dmg && e.entity) e.entity.stats.add({ stat: "atk", type: "more", value: em.dmg - 1, source: "prologue" });
      if ((s.gate || sp.elite) && e.def) {
        // 守场：在场地中心静立 / 巡踱，仇恨约 8 米，离场地中心约 14 米就回场回血（敌人模块的 sightRange / leashRange）
        e.def = Object.assign(Object.create(e.def), { sightRange: ARENA.sight, leashRange: ARENA.leash, leashTime: ARENA.leashTime });
        if (e.home) e.home.copy(at);
        this.arena = { pos: at.clone(), e, entered: !1 };
        continue;
      }
      if (sp.aggro && e.setAggro) e.setAggro();
    }
    s.spawned = out;
    return out;
  }

  complete(s) {
    if (s.done) return;
    s.done = !0;
    // 非可选步完成：它之前没做的可选步作废
    if (!s.optional) for (let i = this.idx; i < this.steps.indexOf(s); i++) if (!this.steps[i].done) this.steps[i].void = !0;
    if (s.gate === "cave") this.openCave();
    // 打完一组狼：紧随的拾取步的固定掉落落地
    const nx = this.steps[this.steps.indexOf(s) + 1];
    if (nx && nx.trigger && nx.trigger.type === "pickup" && !nx.trigger.item) this.dropLoot(nx);
    const tr = (s.trigger || {}).type;
    const early = tr === "pill" && !this.f.pillUse ? "气血充盈 ✓" : EARLY_TEXT[tr] || "早已做到 ✓";
    const text = s.early ? (s.goal || "").replace(/^（可选）/, "").slice(0, 10) + " · " + early : s.doneText;
    this.emit("done", { step: s, text, early: s.early });
    const before = this.chapter;
    while (this.idx < this.steps.length && (this.steps[this.idx].done || this.steps[this.idx].void)) this.idx++;
    const next = this.cur;
    if (!next || next.chapter !== before) this.emit("chapterDone", { chapter: before });
    if (next && next !== this.entered) {
      this.entered = next;
      this.enter(next);
    }
  }
  openCave() {
    this.caveOpen = !0;
    const run = this.run;
    for (const x of run.extracts) if (x.sealed) x.locked = !1;
    const cave = run.extracts.find((x) => x.kind === "cave");
    if (cave) {
      this.ctx.vfx.burst(cave.pos, { color: INKC.green, count: 26, speed: 4, up: 4, size: 0.2 });
      this.camPush = { t: 0, pos: cave.pos.clone() };
    }
    this.emit("special", { kind: "vines", text: "洞口的藤蔓松开了" });
  }
  onChannel() {
    for (const s of this.frontier()) if (s.spawn && s.spawn.when === "channel") this.spawn(s);
  }

  update(dt) {
    this.t += dt;
    const pl = this.ctx.player.pos, f = this.f;
    if (!this.started) {
      this.started = !0;
      const sw = this.steps.find((s) => s.id === "sword");
      if (sw) this.dropLoot(sw);
      this.entered = this.cur;
      this.enter(this.cur);
    }
    // 事实：走到过的地点、服丹、掷符、打开储物袋
    for (const s of this.steps) {
      const tr = s.trigger || {};
      if (tr.type === "reach" && !f.visited.has(s.id)) {
        const at = s.at || s.pos;
        if (Math.hypot(pl.x - at.x, pl.z - at.z) < (tr.r || 3)) f.visited.add(s.id);
      }
      // 刷怪：走近就刷，但受小节顺序约束——只有当前小节或下一小节的战斗能被走近触发；
      // 守关的（狼头目这类 gate / 精英）必须轮到它（在前沿里）才刷，且要走进场地
      if (s.spawn && s.spawn.when === "reach" && !s.spawned && !s.done && !s.void && this.spawnAllowed(s)) {
        const at = v3(s.spawn.at) || s.pos;
        const r = s.gate || s.spawn.elite ? Math.min(s.spawn.r || 12, ARENA.trigger) : s.spawn.r || 12;
        if (Math.hypot(pl.x - at.x, pl.z - at.z) < r) this.spawn(s);
      }
    }
    const ps = this.potSum(), fs = this.fuSum();
    if (ps < this.potPrev) f.pillUse++;
    if (fs < this.fuPrev) f.talisman++;
    this.potPrev = ps;
    this.fuPrev = fs;
    if (document.body.classList.contains("mk-bag-open")) f.bagOpen = 1;
    // 前沿里的步骤：满足就完成（提前满足的按间隔依次勾掉）
    for (const s of this.frontier()) {
      if (s.spawn && s.spawn.when === "afterPrev" && !s.spawned && s === this.cur) this.spawn(s);
      if (s.early && this.t < s.earlyAt) break; // 一次只勾一条，留出间隔
      if (this.met(s)) {
        this.complete(s);
        break;
      }
    }
    // 第一次走进守关场地：横幅
    for (const g of this.steps) {
      if (!g.arenaR || g.arenaIn || !this.frontier().includes(g)) continue;
      if (Math.hypot(pl.x - g.pos.x, pl.z - g.pos.z) < g.arenaR) {
        g.arenaIn = !0;
        this.emit("special", { kind: "shield", text: "狼妖头目 · 守在洞口" });
      }
    }
    // 藤蔓松开：镜头轻推向洞口约 1 秒
    const cp = this.camPush;
    if (cp) {
      cp.t += dt;
      const rig = this.ctx.rig, k = Math.sin(Math.min(1, cp.t / 1.1) * Math.PI) * 0.45;
      if (rig) rig.target.lerp(cp.pos, k * 0.2);
      if (cp.t >= 1.1) this.camPush = null;
    }
  }

  // 身陨（F7）：狼头目之前 → 本小节开头满血重来，已拾取的东西保留；狼头目及以后 → 返回 false，沿用剧情救援
  onDeath() {
    const cur = this.cur;
    const rescueAt = this.steps.findIndex((s) => s.id === RESCUE_FROM);
    if (!cur || (rescueAt >= 0 && this.idx >= rescueAt)) return !1;
    const ch = cur.chapter, first = this.steps.findIndex((s) => s.chapter === ch);
    // 本小节：刷出来的妖兽清掉，战斗步骤重来（其他步骤的事实还在，到时会被快速勾掉）
    for (let i = first; i < this.steps.length && this.steps[i].chapter === ch; i++) {
      const s = this.steps[i];
      for (const e of s.spawned || []) if (e.alive) this.despawn(e);
      if (s.trigger && s.trigger.type === "kill") (s.done = !1), (s.spawned = null), (s.early = !1);
      if (!s.done) s.void = !1;
    }
    this.idx = first;
    while (this.idx < this.steps.length && this.steps[this.idx].done) this.idx++;
    const at = this.steps[first].pos;
    const P = this.ctx.player;
    setTimeout(() => {
      P.spawn(at.x, at.z);
      if (P.state === "dead") P.respawn();
      const h = P.entity;
      h.alive = !0;
      h.hp = h.stats.get("hp");
      h.mp = h.stats.get("mp");
      P.deadT = 0;
      this.run.state = "play";
      this.entered = this.cur;
      this.emit("retry", { chapter: ch });
      this.enter(this.cur);
    }, 1400);
    return !0;
  }
  despawn(e) {
    const E = this.ctx.enemies;
    E.bars && E.bars.remove(e);
    this.ctx.shields && this.ctx.shields.drop && this.ctx.shields.drop(e.entity);
    if (e.entity) e.entity.alive = !1;
    e.dispose && e.dispose();
    const i = E.list.indexOf(e);
    if (i >= 0) E.list.splice(i, 1);
    E.tokens && E.tokens.delete(e);
  }
  // 目标卷轴：本小节的全部目标及状态（done 已完成 / early 早已做到 / cur 当前 / next 未到 / void 作废）
  goals() {
    const F = this.frontier();
    return this.chapterSteps().map((s) => ({
      step: s,
      text: s.goal || "",
      optional: !!s.optional,
      branch: s.branch || null,
      state: s.void ? "void" : s.done ? (s.early ? "early" : "done") : F.includes(s) ? (this.met(s) ? "early" : "cur") : this.met(s) ? "early" : "next",
    }));
  }
  // 墨箭指向：前沿第一个非可选步（宝箱步用 target）
  arrowTarget() {
    const F = this.frontier();
    const s = F.find((q) => !q.optional) || F[0];
    return s ? s.target || s.at || s.pos : null;
  }
  dispose() {
    for (const m of this.rings || []) this.ctx.scene.remove(m), m.geometry.dispose(), m.material.dispose();
    this.rings = [];
    for (const off of this.offs) off();
    this.offs = [];
  }
}
