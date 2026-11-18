// 战利品容器（搜取，模块：UI 设计主导 / 流程接线）：参考搜打撤游戏的"搜尸 / 开箱"——击杀留尸、宝箱开箱，都不再把东西抛到地上，
// 而是变成一个"容器"：按 F 打开格子窗，格子依次"探查"（按品质计时），揭示后可逐个取或全取。设计说明 docs/ui/v2/搜取_v1.md。
//
// 数据：container = { id, kind: "corpse"|"chest"|"cache", pos, label, glyph, tier, slots: [slot], mark, enemy, body, born, emptyAt, fadeAt }
//       slot = { inst, size, state: "hidden"|"search"|"shown"|"taken", t, need }
// 事件（Containers.on(fn) → fn(type, data)）：给界面层订阅，界面只读这些，不改状态
//   add {c} / remove {c}                     容器出现 / 消散
//   open {c} / close {c, reason}             窗口打开 / 收起（reason: "esc"|"move"|"hit"|"far"|"state"|"empty"|"switch"）
//   按键：F 打开；窗口开着时 F = 全取；Esc 收起（src/ui/loot_window.js 处理 Esc）
//   searchStart {c, i, slot, need, resume}   第 i 格开始（或继续）探查
//   progress {c, i, slot, v}                 探查进度 0~1（每帧）
//   reveal {c, i, slot, inst, rarity}        第 i 格揭示
//   take {c, i, inst} / full {c, i, inst}    取走 / 储物袋放不下（物品留在容器里）
//   interrupt {c, reason}                    被打断（受击 / 移动），随后会有 close
//   empty {c}                                取空
// 规则：
//   - 探查只在窗口打开时进行；关掉后进度（含当前格已转的部分）保留，下次从断点继续
//   - 世界不暂停；受击（伤害 > 0）或移动立即收起；离开 3.2 米、局面不是 play 也收起
//   - 取物沿用拾取规则：关键物品进护身格；灵石等可堆叠物品按储物袋堆叠；放不下就留在容器里并提示
//   - 尸体：有掉落才留（loot:drop 带 source 实体）；取空后立刻化墨散去（约 1.2 秒）；没取空的一直留着；本局最多约 30 具，超出时最早的空尸先散
//   - 宝箱：开箱即打开格子窗（灵光 / 夜明箱格子更多由掉落表决定）；取空后标记移除，箱子保持"已开启"
//   - 奇遇 / 委托给的东西（loot:drop 不带敌人实体）落在地上（是选择的结果，不是搜刮），走近按 F 取（pickups.js）
import * as THREE from "three";
import { sizeOf, defOf } from "../../core/items.js";
import { toInstances } from "./pickups.js";
import { isKey } from "./settle.js";
import { inkEnso, altarMarker } from "../../world/markers.js";
import * as LOOT_DATA from "../../data/loot.js";

// 探查时长（秒，按品质 凡 / 灵 / 宝 / 仙 / 极）× 100 / (100 + 神识)
// 神识 sense：境界（progression growth：练气一层 0、每层 +8、筑基 100）+ 玉佩词条 + 心法《灵台》+30 + 凝神丹本局 +20
export const SEARCH = {
  perRarity: [0.35, 0.5, 0.8, 1.2, 1.8],
  gap: 0.12, // 格与格之间的停顿
  startDelay: 0.18, // 打开后第一格开始前的停顿
  moveTol: 0.35, // 打开后移动超过这个距离就收起（米）
  moveGrace: 0.2, // 打开后这段时间内的减速滑步不算移动
  maxDist: 3.2,
  corpseFade: 0.15, // 尸体取空后多久开始化墨（用户：探查完、取空就消失；只停一瞬让取物的飞行先起）
  maxCorpses: 30,
  fadeDur: 1.2,
  foreseeAt: 40, // 神识到这个值，墨封下开始隐约透出品质色（预感）
  foreseeFull: 120, // 到这个值透色最明显
  stat(run, k) {
    const st = run.ctx.player && run.ctx.player.entity && run.ctx.player.entity.stats;
    return st && st.get ? st.get(k) || 0 : 0;
  },
  sense(run) {
    if (run.senseOverride != null) return run.senseOverride; // 测试 / 调试
    return Math.max(0, this.stat(run, "sense") + ((run.containers && run.containers.pillSense) || 0));
  },
  need(inst, run) {
    const q = Math.max(0, Math.min(4, inst.rarity || 0));
    return (this.perRarity[q] * 100) / (100 + this.sense(run));
  },
  // 预感强度 0~1（界面据此给墨封透一点品质色）
  foresee(run) {
    const s = this.sense(run);
    return s < this.foreseeAt ? 0 : Math.min(1, 0.25 + (0.75 * (s - this.foreseeAt)) / (this.foreseeFull - this.foreseeAt));
  },
};

const BODY_INK = 0x5b6064, BODY_EMPTY = 0x9a9890;
const noop = () => {};
let seq = 0;

export class Containers {
  constructor(run) {
    this.run = run;
    this.ctx = run.ctx;
    this.list = [];
    this.openC = null;
    this.listeners = new Set();
    this.root = new THREE.Group();
    this.root.name = "containers";
    this.ctx.scene.add(this.root);
    this.offs = [this.ctx.world.events.on("damage", (i) => this.onDamage(i))];
    // 凝神丹（出行前服用）：带进来的第一枚在入图时服下，本局神识 +20
    this.pillSense = 0;
    const pill = (run.carried || []).find((i) => i.n > 0 && ((defOf(i) || {}).use || {}).sense);
    if (pill) {
      this.pillSense = defOf(pill).use.sense;
      if (--pill.n <= 0) run.carried.splice(run.carried.indexOf(pill), 1);
      setTimeout(() => run.toast && run.toast(`服下${defOf(pill).name} · 本局神识 +${this.pillSense}`, "gold", 2.5), 1200);
    }
    this.placeAltars();
    this.placeSteles();
  }

  // ---------------- 亭中供案 ----------------
  // 关卡给 points.pavilions（[{ pos, kind: "pavilion" }]）时用它，每局按种子随机启用 2–4 个；还没有时用关卡道具里的亭子（亭心）。
  // 标记沿用宝箱（kind "chest" + altar）：F 开 = 掷 pavilion 掉落（还没有掉落表时用 chest_normal）并打开格子窗；地图上暂用宝箱图标
  placeAltars() {
    const run = this.run, map = run.map, L = map && map.level;
    // 关卡已经按种子挑好了本局启用的 2–4 个（pos.y = 亭基石面）——全部用上，不再二次抽取
    const given = ((map && map.points && map.points.pavilions) || []).map((q) => ({ x: q.pos.x, z: q.pos.z, y: q.pos.y, ry: q.ry || 0 }));
    let pts = given;
    if (!pts.length && L && L.def) for (const p of L.def.props || []) if (p.type === "pavilion" && p.pos) pts.push({ x: p.pos[0], z: p.pos[1], ry: p.ry || 0 });
    if (!pts.length) return;
    let want = pts.length;
    if (!given.length) {
      // 兜底（关卡还没给 points.pavilions）：从道具亭子里按种子挑 2–4 个
      let sd = (run.seed >>> 0) || 1;
      const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = pts.length - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        [pts[i], pts[j]] = [pts[j], pts[i]];
      }
      want = Math.min(pts.length, 2 + ((rnd() * 3) | 0));
    }
    for (const q of pts.slice(0, want)) {
      const ground = map.height(q.x, q.z);
      const pos = new THREE.Vector3(q.x, q.y != null ? q.y : ground + 0.4, q.z); // 亭子石台高 0.4
      const m = { kind: "chest", altar: !0, tier: "normal", pos, label: "亭中供案", glyph: "案", verb: "搜", color: 0x15181b };
      const g = run.addMark(m).group;
      const obj = altarMarker();
      obj.rotation.y = q.ry || 0;
      obj.scale.setScalar(1.25); // 亭顶会挡掉一部分，45° 俯视下放大一点才认得出
      g.add(new THREE.Object3D(), obj); // 先放一个空节点：run.update 只让 children[0] 浮动
      m.fxObject = obj;
    }
  }
  // 功法残碑（功法体系 v2，战斗设计 × 关卡设计）：关卡 points.steles 是本局启用的 1–2 块（石碑景物关卡已建）；
  //   标记沿用宝箱容器（kind "chest" + stele：不藏关卡模型、不算亭中供案），F 拓碑 = 掷 stele_<分区> 掉落（必出 1 页本区域功法残页）
  placeSteles() {
    const run = this.run, map = run.map;
    for (const q of (map && map.points && map.points.steles) || []) {
      const S = LOOT_DATA.SOURCES || {};
      const src = S["stele_" + q.zone] ? "stele_" + q.zone : S.stele ? "stele" : "chest_normal";
      run.addMark({ kind: "chest", stele: !0, tier: "normal", pos: q.pos.clone(), label: q.name || "残碑", glyph: "碑", verb: "拓", color: 0x15181b, lootSrc: src });
    }
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(type, data) {
    for (const fn of this.listeners) {
      try {
        fn(type, data, this);
      } catch (e) {
        console.error("[containers] listener", type, e);
      }
    }
  }

  // ---------------- 创建 ----------------
  create(o) {
    const run = this.run;
    const c = {
      id: "c" + seq++,
      kind: o.kind || "cache",
      pos: o.pos.clone(),
      label: o.label || "遗物",
      glyph: o.glyph || "物",
      tier: o.tier || null,
      slots: [],
      enemy: o.enemy || null,
      body: null,
      born: run.t,
      emptyAt: null,
      fadeAt: null,
      wait: SEARCH.startDelay,
    };
    for (const inst of o.items || []) this.addSlot(c, inst);
    c.mark = o.mark || run.addMark({ kind: "loot", pos: c.pos, label: c.label, glyph: c.glyph, verb: "搜", container: c, onInteract: () => this.toggle(c) });
    c.mark.container = c;
    if (c.kind === "corpse") this.trimCorpses();
    this.list.push(c);
    this.emit("add", { c });
    return c;
  }
  addSlot(c, inst) {
    const s = { inst, size: sizeOf(inst), state: "hidden", t: 0, need: 0 };
    c.slots.push(s);
    if (c.emptyAt != null) this.revive(c);
    return s;
  }
  // 敌人掉落（loot:drop）：有敌人实体 → 留尸做容器；其他来源（奇遇 / 委托）→ 落在地上，走近按 F 取（不自动拾取，2026-11-17 用户）
  fromDrop(e) {
    const run = this.run;
    let items = run.applyTide(toInstances(e.items, run.R));
    // 首领首杀：必得物击杀时直接进护身格（run.secureFirstKill），其余照常进尸体
    if (e.lootSource === "boss_first" && run.secureFirstKill) {
      const enemy0 = e.source && this.ctx.enemies.list.find((q) => q.entity === e.source);
      items = run.secureFirstKill(items, (enemy0 && enemy0.def && enemy0.def.name) || "首领");
    }
    if (!items.length) return null;
    const enemy = e.source && e.source.team === "enemy" ? this.ctx.enemies.list.find((q) => q.entity === e.source) : null;
    if (!enemy) {
      run.pickups.dropMany(e.pos, items);
      return null;
    }
    return this.corpse(enemy, items, e.pos);
  }
  corpse(enemy, items, pos) {
    const d = enemy.def || {};
    enemy.keepBody = !0; // enemy.js：倒地后不化墨，身体交给容器
    const boss = d.boss || (enemy.entity && enemy.entity.tags && enemy.entity.tags.has("boss"));
    const elite = enemy.entity && enemy.entity.tags && enemy.entity.tags.has("elite");
    const c = this.create({ kind: "corpse", pos: (pos || enemy.pos).clone(), items, label: (d.name || "妖兽") + "遗骸", glyph: "骸", tier: boss ? "boss" : elite ? "elite" : "mob", enemy });
    c.ring = inkEnso(boss ? 1.6 : elite ? 1.2 : 0.9, 0, Math.random()); // 凡品淡墨圈：搜之前不剧透品质
    c.ring.position.copy(c.pos);
    c.ring.position.y += 0.1;
    this.root.add(c.ring);
    return c;
  }
  // 把一批物品放进 pos 附近的容器：附近有没取空的尸体 / 遗物就追加，刚倒下的敌人就留尸，否则放一个遗物包（序章固定掉落等）
  stash(pos, items, o = {}) {
    if (!items || !items.length) return null;
    const near = this.list.find((c) => c.kind !== "chest" && c.emptyAt == null && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 2.5);
    if (near) {
      for (const it of items) this.addSlot(near, it);
      this.emit("add", { c: near });
      return near;
    }
    const E = this.ctx.enemies;
    const dead = E && E.list.find((e) => e.state === "dead" && !e.removed && !e.keepBody && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 3);
    if (dead) return this.corpse(dead, items, dead.pos);
    const c = this.create({ kind: "cache", pos, items, label: o.label || "遗物", glyph: o.glyph || "物" });
    c.body = bundle(o.glyph === "剑");
    c.body.position.copy(c.pos);
    this.root.add(c.body);
    return c;
  }
  // 宝箱：第一次 F = 开箱（掷掉落、藏起关卡模型、发 chest 事件）并打开格子窗；之后 F = 开 / 关窗
  openChest(m) {
    const run = this.run;
    let c = m.container;
    if (!c) {
      const src = m.lootSrc || (m.altar ? (LOOT_DATA.SOURCES && LOOT_DATA.SOURCES.pavilion ? "pavilion" : "chest_normal") : m.tier === "glow" ? "chest_glow" : m.tier === "night" ? "chest_night" : "chest_normal");
      const raw = (run.pro && run.pro.chestLoot(m.pos)) || run.rollLoot(src, { region: run.region, level: run.R.level }); // 序章宝箱给固定内容
      const items = run.applyTide(toInstances(raw, run.R));
      c = this.create({ kind: "chest", pos: m.pos, items, label: m.label, glyph: m.glyph || "箱", tier: m.tier || "normal", mark: m });
      c.altar = !!m.altar;
      c.source = src; // 掉落来源（读取 / 测试用）
      m.verb = "搜";
      if (m.point && run.map.consume) run.map.consume(m.point); // 关卡里的箱子模型藏起来（开启后的样子由 gather_fx 接管）
      if (m.fxObject && !m.altar) m.fxObject.visible = !1; // 供案留着（只是圈和香烟收起）
      if (m.altar && m.fxObject) for (const o of m.fxObject.children) if (o.userData.glow) o.visible = !1;
      run.emit("chest", m);
      if (!items.length) {
        run.toast(`${m.label}里空空如也`, "", 2);
        this.markEmpty(c);
        return c;
      }
    }
    this.toggle(c);
    return c;
  }

  // ---------------- 窗口 ----------------
  // F：没开 → 打开；开着 → 全取（还在探查的格子揭示后自动取）。关窗用 Esc / 走开 / 受击
  toggle(c) {
    if (this.openC === c) this.takeAll(c);
    else this.open(c);
  }
  open(c) {
    if (!c || c.emptyAt != null) return;
    if (this.openC) this.close("switch");
    this.openC = c;
    c.openT = 0;
    c.openPos = this.ctx.player.pos.clone();
    c.autoTake = !1;
    c.announce = !0; // 打开后第一格（含断点续探）重新发 searchStart
    c.wait = Math.max(c.wait || 0, SEARCH.startDelay);
    this.emit("open", { c });
  }
  close(reason = "toggle") {
    const c = this.openC;
    if (!c) return;
    this.openC = null;
    c.autoTake = !1;
    this.emit("close", { c, reason });
  }
  interrupt(reason) {
    const c = this.openC;
    if (!c) return;
    this.emit("interrupt", { c, reason });
    this.close(reason);
  }
  onDamage(info) {
    if (this.openC && info && info.target === (this.ctx.player && this.ctx.player.entity) && info.amount > 0) this.interrupt("hit");
  }

  // ---------------- 取物 ----------------
  take(c, i) {
    const s = c && c.slots[i];
    if (!s || s.state !== "shown") return !1;
    const run = this.run, inst = s.inst;
    const ok = isKey(inst) ? (run.keyItems.push(inst), !0) : run.bag.add(inst);
    if (!ok) {
      run.onBagFull(inst);
      this.emit("full", { c, i, inst });
      return !1;
    }
    s.state = "taken";
    run.onPickup(inst);
    this.emit("take", { c, i, inst });
    if (c.slots.every((q) => q.state === "taken")) this.markEmpty(c);
    return !0;
  }
  // 全取：拿走所有已揭示的；还在探查的格子揭示后自动取（窗口开着时）
  takeAll(c = this.openC) {
    if (!c) return 0;
    let n = 0;
    c.autoTake = !0;
    const all = () => {
      for (let i = 0; i < c.slots.length; i++) if (c.slots[i].state === "shown" && this.take(c, i)) n++;
    };
    this.run.pickBatch ? this.run.pickBatch(all) : all(); // 一批只刷新一次储物袋 / HUD
    return n;
  }
  markEmpty(c) {
    if (c.emptyAt != null) return;
    c.emptyAt = this.run.t;
    // 尸体 / 遗物包：取空立刻化墨散去（约 1.2 秒，墨烟同前）并释放容器；宝箱保持"已开启"不消失。
    // 没取空的（储物袋满放不下）一直保留，直到取空或被上限规则清掉
    c.fadeAt = c.kind === "corpse" ? c.emptyAt + SEARCH.corpseFade : c.kind === "cache" ? c.emptyAt + 0.6 : null;
    if (this.openC === c) this.close("empty");
    if (c.mark && this.run.marks.includes(c.mark)) this.run.removeMark(c.mark);
    if (c.ring) c.ring.visible = !1;
    this.paintBody(c);
    this.emit("empty", { c });
  }
  // 追加了物品的空容器：重新可搜
  revive(c) {
    c.emptyAt = c.fadeAt = null;
    if (c.mark && !this.run.marks.includes(c.mark)) {
      c.mark = this.run.addMark({ kind: "loot", pos: c.pos, label: c.label, glyph: c.glyph, verb: "搜", container: c, onInteract: () => this.toggle(c) });
      c.mark.container = c;
    }
    if (c.ring) c.ring.visible = !0;
    this.paintBody(c);
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const run = this.run, pl = this.ctx.player.pos;
    const c = this.openC;
    if (c) {
      c.openT += dt;
      if (c.openT < SEARCH.moveGrace) c.openPos.copy(pl);
      if (run.state !== "play") this.close("state");
      else if (Math.hypot(pl.x - c.openPos.x, pl.z - c.openPos.z) > SEARCH.moveTol) this.interrupt("move");
      else if (Math.hypot(pl.x - c.pos.x, pl.z - c.pos.z) > SEARCH.maxDist) this.close("far");
      else this.search(c, dt);
    }
    // 尸体：接管身体、空尸淡出（倒序遍历：fade 可能移除自己；不每帧拷贝数组）
    // 画面外（含影子余量）的尸体不画（性能：每局最多约 30 具，原来全图的都画、都进阴影）
    const E = this.ctx.enemies, cull = E && E.inView;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const q = this.list[k];
      if (q.enemy && !q.body && q.enemy.removed) this.adopt(q);
      if (cull && q.kind === "corpse" && q.body) {
        const vis = E.inView(q.pos, 9);
        if (q.body.visible !== vis) q.body.visible = vis;
      }
      if (q.fadeAt != null && run.t >= q.fadeAt) this.fade(q, dt);
    }
  }
  search(c, dt) {
    if ((c.wait -= dt) > 0) return;
    let i = -1;
    for (let k = 0; k < c.slots.length; k++) if (c.slots[k].state === "hidden" || c.slots[k].state === "search") (i = k), (k = c.slots.length);
    if (i < 0) return;
    const s = c.slots[i];
    if (s.state === "hidden" || !s.started || c.announce) {
      const resume = s.state === "search" && s.t > 0;
      c.announce = !1;
      s.state = "search";
      s.started = !0;
      s.need = SEARCH.need(s.inst, this.run);
      this.emit("searchStart", { c, i, slot: s, need: s.need, resume });
    }
    s.t = Math.min(s.need, s.t + dt);
    // 每帧的进度事件复用同一个对象（监听者不要保存它）
    const P = (this._prog ||= {});
    P.c = c;
    P.i = i;
    P.slot = s;
    P.v = s.need > 0 ? s.t / s.need : 1;
    this.emit("progress", P);
    if (s.t >= s.need) {
      s.state = "shown";
      c.wait = SEARCH.gap;
      this.emit("reveal", { c, i, slot: s, inst: s.inst, rarity: s.inst.rarity || 0 });
      if (c.autoTake) this.take(c, i);
      // 心法《灵台》：一定概率顺带探明下一格
      const echo = SEARCH.stat(this.run, "senseEcho");
      const j = c.slots.findIndex((q) => q.state === "hidden");
      if (echo > 0 && j >= 0 && Math.random() < echo) {
        const n = c.slots[j];
        n.state = "shown";
        n.t = n.need = SEARCH.need(n.inst, this.run);
        this.emit("reveal", { c, i: j, slot: n, inst: n.inst, rarity: n.inst.rarity || 0, echo: !0 });
        if (c.autoTake) this.take(c, j);
      }
    }
  }
  // 敌人身体交给容器：定格在倒地姿势，染成淡墨剪影
  adopt(c) {
    const e = c.enemy;
    c.body = e.root;
    c.mats = e.mats;
    if (c.body && !c.body.parent) this.ctx.scene.add(c.body);
    this.paintBody(c);
    // 性能：尸身不再动——骨骼只算最后一次，矩阵冻结（30 具尸体也不占每帧的骨骼 / 矩阵更新）
    if (c.body) {
      c.body.updateMatrixWorld(!0);
      const seen = new Set();
      c.body.traverse((o) => {
        o.matrixAutoUpdate = !1;
        o.matrixWorldAutoUpdate = !1;
        // 淡墨剪影：不投影（不进阴影 pass）；墨线壳不画（轮廓交给水墨后期的深度描边），每具尸体的 draw call 减半
        if (o.isMesh) (o.castShadow = !1), c.mats && !c.mats.includes(o.material) && (o.visible = !1);
        const sk = o.isSkinnedMesh && o.skeleton;
        if (sk && !seen.has(sk)) seen.add(sk), sk.update(), (sk.update = noop);
      });
    }
  }
  paintBody(c) {
    if (!c.mats) return;
    const empty = c.emptyAt != null;
    for (const m of c.mats) {
      m.color && m.color.set(empty ? BODY_EMPTY : BODY_INK);
      if (m.emissive) m.emissive.set(0), (m.emissiveIntensity = 0), m.userData && (m.userData.baseEmissive = m.emissive.clone(), (m.userData.baseEI = 0));
      m.transparent = !0;
      m.opacity = empty ? 0.45 : 0.85;
      m.needsUpdate = !0;
    }
  }
  fade(c, dt) {
    c.fadeT = (c.fadeT || 0) + dt;
    const k = Math.min(1, c.fadeT / SEARCH.fadeDur);
    if (!c.fadeBurst && c.body) {
      c.fadeBurst = !0;
      this.ctx.vfx && this.ctx.vfx.burst(c.pos, { color: 0x15181b, count: 16, speed: 2, size: 0.22, up: 1.2, y: 0.4, dur: 0.9 });
      c.body.traverse((o) => o.isMesh && c.mats && !c.mats.includes(o.material) && (o.visible = !1)); // 墨线壳先收
    }
    if (c.mats) for (const m of c.mats) m.opacity = 0.45 * (1 - k);
    else if (c.body) c.body.scale.setScalar(Math.max(0.01, 1 - k)), c.body.updateMatrix(), c.body.updateMatrixWorld(!0);
    if (k >= 1) this.remove(c);
  }
  remove(c) {
    if (this.openC === c) this.close("state");
    // 还没交接的身体：已移除就先接管再一起清掉；没移除就还给敌人自己按常规化墨
    if (!c.body && c.enemy) c.enemy.removed ? this.adopt(c) : (c.enemy.keepBody = !1);
    if (c.mark && this.run.marks.includes(c.mark)) this.run.removeMark(c.mark);
    if (c.body) {
      c.body.parent && c.body.parent.remove(c.body);
      if (c.mats) for (const m of c.mats) m.dispose();
      else c.body.traverse((o) => (o.geometry && o.geometry.dispose(), o.material && o.material.dispose && o.material.dispose()));
    }
    if (c.ring) this.root.remove(c.ring), c.ring.geometry.dispose(), c.ring.material.dispose();
    this.list.splice(this.list.indexOf(c), 1);
    this.emit("remove", { c });
  }
  // ---------------- 读取（地图 / 测试 / 其他模块用；只读） ----------------
  // 一个容器的状态：未搜 = 一格都没揭示；已搜 = 有格子揭示过；取空 = empty
  status(c) {
    let hidden = 0, shown = 0, taken = 0;
    for (const s of c.slots) s.state === "taken" ? taken++ : s.state === "shown" ? shown++ : hidden++;
    return { id: c.id, kind: c.kind, label: c.label, pos: c.pos, total: c.slots.length, hidden, shown, taken, searched: shown + taken > 0, empty: c.emptyAt != null, open: this.openC === c, container: c };
  }
  all() {
    return this.list.map((c) => this.status(c));
  }
  near(pos, r = 2.5) {
    let best = null, bd = r;
    for (const c of this.list) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < bd) (bd = d), (best = c);
    }
    return best;
  }
  // 测试 / 调试：立刻揭示全部并取走（走正常的 take：关键物品进护身格、发 pickup 事件、放不下就留着）
  lootNow(c) {
    if (!c) return 0;
    for (let i = 0; i < c.slots.length; i++) {
      const s = c.slots[i];
      if (s.state === "hidden" || s.state === "search") (s.state = "shown"), (s.need = s.t = 0), this.emit("reveal", { c, i, slot: s, inst: s.inst, rarity: s.inst.rarity || 0 });
    }
    let n = 0;
    for (let i = 0; i < c.slots.length; i++) if (c.slots[i].state === "shown" && this.take(c, i)) n++;
    return n;
  }

  // 尸体上限：超出时最早的空尸立刻开始消散
  trimCorpses() {
    const corpses = this.list.filter((c) => c.kind === "corpse" && !c.fadeT);
    let over = corpses.length + 1 - SEARCH.maxCorpses;
    for (const c of corpses.filter((q) => q.emptyAt != null).sort((a, b) => a.emptyAt - b.emptyAt)) {
      if (over-- <= 0) break;
      c.fadeAt = this.run.t;
    }
  }
  dispose() {
    for (const off of this.offs) off();
    this.offs = [];
    this.close("state");
    for (const c of [...this.list]) this.remove(c);
    this.ctx.scene.remove(this.root);
    this.listeners.clear();
  }
}

// 遗物包：一团墨色布包 + 一个结（序章固定掉落、找不到尸体时）；剑则是一柄斜插的锈剑
function bundle(sword) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: sword ? 0x6a5a4a : 0x4a443c });
  if (sword) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.02).translate(0, 0.45, 0).rotateZ(0.5), mat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05).translate(-0.17, 0.3, 0).rotateZ(0.5), mat));
  } else {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6).scale(1, 0.6, 0.9).translate(0, 0.16, 0), mat));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4).translate(0, 0.34, 0), mat));
  }
  return g;
}
