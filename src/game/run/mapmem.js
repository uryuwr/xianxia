// 天机镜的记忆（模块 A）：本局看见过 / 做过的东西，供地图与铜镜绘制（src/ui/screens/mirror_map.js）。
//   妖群（看见过未清 → "妖"/"精"+护盾五行；清掉 → "斩"）、首领、宝箱、采集物、灵光点、遗府、奇遇、委托遗物、行迹、玩家插的墨点。
// 跨局记忆（天机镜即林墨的手机，设定上"记得"）：固定地标（古传送阵、遗府、首领场地、地名）一旦发现写进 profile.map[region].seen，
// 以后每局开局就以淡墨显示"旧日所见"；随机位置的东西（宝箱、灵草、精英）只在本局显示。
import * as THREE from "three";

const SEE = 24; // 看见的距离（米）
const PIN_MAX = 3;

export class MapModel {
  constructor(run) {
    this.run = run;
    this.ctx = run.ctx;
    this.groups = new Map(); // 妖群：key → { pos, members:Set, elite, shield, name, boss, cleared, patrol, dir }
    this.things = new Map(); // 交互物：mark → { kind, pos, label, tier, glow, done }
    this.trail = [];
    this.pins = [];
    this.fakes = []; // 触发过的假阵（已从撤离点里移除）
    const P = run.profile, mem = (P.map[run.region] = P.map[run.region] || { extracts: [] });
    this.seen = mem.seen = mem.seen || { dens: [], boss: !1, landmarks: [] };
    this.old = { dens: new Set(this.seen.dens), boss: this.seen.boss, landmarks: new Set(this.seen.landmarks), gates: new Set(mem.extracts || []) }; // 开局时就记得的
    this.now = { dens: new Set(), boss: !1, landmarks: new Set() }; // 本局亲眼所见
    this.t = 0;
    this.encs = new Map(); // 奇遇（读模块 E 的 quests.mapPoints()）：遇到过的
    this.ver = 0; // 有变化就 +1，地图按需重画
  }
  get points() {
    return this.run.map.points;
  }
  update(dt) {
    if ((this.t -= dt) > 0) return;
    this.t = 0.3;
    const r = this.run, p = this.ctx.player.pos, E = this.ctx.enemies;
    // 行迹
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.z) > 2) {
      this.trail.push([p.x, p.z]);
      if (this.trail.length > 1500) this.trail.shift();
    }
    // 妖群
    for (const e of E.list) {
      if (!e.alive || !e.entity) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      const key = e.pack != null ? "p" + e.pack : "e" + e.entity.id;
      let g = this.groups.get(key);
      if (!g && d > SEE) continue;
      if (!g) this.groups.set(key, (g = { key, pos: e.pos.clone(), members: new Set(), elite: !1, shield: null, name: "", boss: !1, cleared: !1, patrol: !1, dir: null })), this.ver++;
      g.members.add(e);
      if (d <= SEE) {
        const tags = e.entity.tags;
        if (tags.has("elite") || tags.has("boss")) (g.elite = !0), (g.name = e.entity.name || g.name);
        if (tags.has("boss")) g.boss = !0;
        const sh = e.entity.shield;
        if (sh) g.shield = sh.hp > 0 ? sh.element : null;
        if ((r.patrols || []).some((q) => q.e === e)) {
          g.patrol = !0;
          g.dir = e.pos.clone().sub(g.pos).setY(0);
        }
      }
    }
    for (const g of this.groups.values()) {
      const alive = [...g.members].filter((e) => e.alive);
      const near = alive.filter((e) => Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= SEE);
      if (near.length) {
        const c = new THREE.Vector3();
        for (const e of near) c.add(e.pos);
        g.pos.copy(c.multiplyScalar(1 / near.length));
      }
      if (!alive.length && !g.cleared) (g.cleared = !0), this.ver++;
      // 清掉的妖群：脚下遗骸（搜取容器）的状态 none | unsearched | searched | empty
      if (g.cleared && r.containers) {
        let loot = "none";
        for (const s of r.containers.all()) {
          if (s.kind !== "corpse" || Math.hypot(s.pos.x - g.pos.x, s.pos.z - g.pos.z) > 7) continue;
          const v = s.empty ? "empty" : s.searched ? "searched" : "unsearched";
          if (loot === "none" || v === "unsearched" || (v === "searched" && loot === "empty")) loot = v;
        }
        if (loot !== g.loot) (g.loot = loot), this.ver++;
      }
      if (g.shield && alive.every((e) => !e.entity.shield || e.entity.shield.hp <= 0)) g.shield = null;
    }
    // 交互物：看见过的记下；从 run.marks 消失 = 开过 / 采过
    const live = new Set(r.marks);
    for (const m of r.marks) {
      if (!["chest", "gather"].includes(m.kind) || this.things.has(m)) continue;
      if (Math.hypot(m.pos.x - p.x, m.pos.z - p.z) <= SEE) this.things.set(m, { kind: m.kind, pos: m.pos.clone(), label: m.label, tier: m.tier, glow: !!m.glow, ore: m.gatherKind === "ore" || (m.point && m.point.cat === "ore"), done: !1 }), this.ver++;
    }
    for (const [m, t] of this.things) {
      // 宝箱：开过之后是搜取容器（docs/ui/v2/搜取_v1.md §5）——未搜 / 已搜 / 取空；采集物：标记消失 = 采过
      let st = live.has(m) ? "closed" : "empty";
      if (m.container && r.containers) {
        const s = r.containers.status(m.container);
        st = s.empty ? "empty" : s.searched ? "searched" : "opened";
      }
      if (st !== t.state) (t.state = st), (t.done = st === "empty"), this.ver++;
    }
    // 奇遇
    const Q = r.quests;
    let ep = [];
    try {
      ep = (Q && Q.mapPoints && Q.mapPoints()) || [];
    } catch (e) {}
    for (const q of ep) {
      if (!q || !q.pos) continue;
      const key = q.type + "@" + Math.round(q.pos.x) + "," + Math.round(q.pos.z);
      const had = this.encs.get(key);
      if (!had && Math.hypot(q.pos.x - p.x, q.pos.z - p.z) > SEE) continue;
      if (!had || had.done !== q.done) this.ver++;
      this.encs.set(key, { ...q, pos: q.pos.clone ? q.pos.clone() : q.pos });
    }
    // 遗府 / 地窖、首领场地、地名
    const pts = this.points;
    for (const d of pts.ruins || []) if (!this.now.dens.has(d.id) && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < 26) this.now.dens.add(d.id), this.addSeen("dens", d.id);
    if (pts.boss && pts.boss.pos && !this.now.boss && Math.hypot(pts.boss.pos.x - p.x, pts.boss.pos.z - p.z) < 40) (this.now.boss = !0), (this.seen.boss = !0);
    const Ex = r.explored;
    for (const l of pts.landmarks || []) {
      if (this.now.landmarks.has(l.name) || !Ex) continue;
      const gx = Math.floor(((l.pos.x - Ex.b.x0) / (Ex.b.x1 - Ex.b.x0)) * Ex.w), gy = Math.floor(((l.pos.z - Ex.b.z0) / (Ex.b.z1 - Ex.b.z0)) * Ex.h);
      if (Ex.cells[gy * Ex.w + gx]) this.now.landmarks.add(l.name), this.addSeen("landmarks", l.name);
    }
  }
  addSeen(k, v) {
    if (!this.seen[k].includes(v)) this.seen[k].push(v);
  }
  // 假阵被揭穿（run.startExtract 里从撤离点列表移除前调用）
  fake(x) {
    this.fakes.push({ pos: x.pos.clone(), name: x.name });
  }
  // 首领是否已斩
  bossDead() {
    for (const g of this.groups.values()) if (g.boss && g.cleared) return !0;
    return !1;
  }
  // 玩家插的墨点：最多 3 个（多了顶掉最早的）；点在已有墨点上 = 拔掉
  togglePin(x, z, near = 3) {
    const i = this.pins.findIndex((q) => Math.hypot(q.x - x, q.z - z) < near);
    if (i >= 0) return this.pins.splice(i, 1), this.ver++, !1;
    this.ver++;
    this.pins.push({ x, z });
    if (this.pins.length > PIN_MAX) this.pins.shift();
    return !0;
  }
}
