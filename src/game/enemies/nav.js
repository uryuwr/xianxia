// 敌人寻路（粗网格流场）：解决"卡地形高打低"——主角站在高台 / 崖边时，敌人沿可走的坡道绕上去；真的到不了就交给 AI 撤离。
//   NavGrid(ctx)：世界按 CELL 米划格，格子信息（高度、是否被碰撞体占住）与相邻格能否走过去（逐 0.2 米采样，规则同 walkable：
//   上坡一步 ≤ 0.5 米、下坡 ≤ 0.85 米、高度 < −0.8 为水 / 深渊）懒计算并缓存（关卡静态，换关卡自动清空）。
//   flow(target)：以目标所在格为源做反向 BFS（最多 RADIUS 格、MAX_NODES 个节点），得到"到目标的步数"表；同一目标格复用到边变化（block / 换关卡）为止。
//   next(pos, flow)：返回下一步该去的格子中心（Vector3）；返回 null 表示从这里到不了目标。
//   reachable(pos, flow)：是否在流场里。lineClear(a, b)：两点之间能否直线走过去（不用寻路）。
import * as THREE from "three";
import { height, activeLevel } from "../../world/terrain.js";

export const NAV = { cell: 1.5, radius: 48, maxNodes: 9000, reuse: 0.6, sample: 0.2, up: 0.5, down: 0.85, clear: 0.45 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const K = (i, j) => (i + 32768) * 65536 + (j + 32768);
const EMPTY = [];
// BFS 队列（节点数 ≤ maxNodes + 8，复用）
const QI = new Int32Array(NAV.maxNodes + 16), QJ = new Int32Array(NAV.maxNodes + 16);

export class NavGrid {
  constructor(ctx) {
    this.ctx = ctx;
    this.cells = new Map();
    this.edges = new Map();
    this.flows = new Map(); // 目标格 key → { d: Map, t }
    this.level = null;
    this.cols = null;
    this.time = 0;
  }
  sync() {
    const L = activeLevel(), cs = this.ctx.colliders;
    // 碰撞体数组原地增减时（长度变了）重建分桶，cell() 查桶才能看到新加的碰撞体（与原来逐个遍历时一致）；缓存的格子 / 边照旧保留
    if (L === this.level && cs === this.cols && cs && this.colsN !== cs.length) this.rebucket();
    if (L !== this.level || cs !== this.cols) {
      this.level = L;
      this.cols = cs;
      this.cells.clear();
      this.edges.clear();
      this.flows.clear();
      this.rebucket();
    }
  }
  rebucket() {
    const cs = this.cols;
    this.colsN = cs ? cs.length : 0;
    {
      // 碰撞体按 4 米分桶，查线段附近的树石用
      this.buckets = new Map();
      for (const o of cs || []) {
        const r = o.r + NAV.clear;
        for (let i = Math.floor((o.x - r) / 4); i <= Math.floor((o.x + r) / 4); i++)
          for (let j = Math.floor((o.z - r) / 4); j <= Math.floor((o.z + r) / 4); j++) {
            const k = K(i, j);
            if (!this.buckets.has(k)) this.buckets.set(k, []);
            this.buckets.get(k).push(o);
          }
      }
    }
  }
  // 进关卡时（加载画面盖着）把关卡范围内所有格子与相邻边一次算好（结果与运行中按需计算完全相同，只是提前算），
  // 战斗中第一次在新区域寻路不再卡 10–25ms。每 budget 毫秒让出一次主线程。
  async prebuild(b, budget = 30) {
    if (!b) return 0;
    this.sync();
    const lv = this.level, t0 = performance.now();
    const i0 = this.idx(b.x0), i1 = this.idx(b.x1), j0 = this.idx(b.z0), j1 = this.idx(b.z1);
    let t = t0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        this.cell(i, j);
        for (let d = 0; d < 8; d++) this.step(i, j, d);
      }
      if (performance.now() - t > budget) {
        await new Promise((r) => setTimeout(r, 0));
        this.sync();
        if (this.level !== lv) return -1; // 期间换了关卡
        t = performance.now();
      }
    }
    return performance.now() - t0;
  }
  // 线段 (x0,z0)-(x1,z1) 是否擦到碰撞体（跨桶时同一碰撞体可能查两次，结果相同，不用去重——省掉每次 new Set）
  segHits(x0, z0, x1, z1) {
    for (let i = Math.floor(Math.min(x0, x1) / 4); i <= Math.floor(Math.max(x0, x1) / 4); i++)
      for (let j = Math.floor(Math.min(z0, z1) / 4); j <= Math.floor(Math.max(z0, z1) / 4); j++)
        for (const o of this.buckets.get(K(i, j)) || EMPTY) {
          const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((o.x - x0) * dx + (o.z - z0) * dz) / L2));
          if ((x0 + dx * t - o.x) ** 2 + (z0 + dz * t - o.z) ** 2 < (o.r + NAV.clear) ** 2) return !0;
        }
    return !1;
  }
  // 敌人沿这条边走不动（网格与实际碰撞不一致）：把边标记为不通，清掉流场让它重算
  block(a, b) {
    const i = this.idx(a.x), j = this.idx(a.z), di = Math.sign(this.idx(b.x) - i), dj = Math.sign(this.idx(b.z) - j);
    const d = DIRS.findIndex(([x, z]) => x === di && z === dj);
    if (d < 0) return;
    this.edges.set(K(i, j) * 8 + d, !1);
    this.flows.clear();
  }
  idx(v) {
    return Math.floor(v / NAV.cell);
  }
  center(i, j, out = new THREE.Vector3()) {
    const x = (i + 0.5) * NAV.cell, z = (j + 0.5) * NAV.cell;
    return out.set(x, height(x, z), z);
  }
  cell(i, j) {
    const k = K(i, j);
    let c = this.cells.get(k);
    if (c) return c;
    const x = (i + 0.5) * NAV.cell, z = (j + 0.5) * NAV.cell, h = height(x, z);
    let ok = h > -0.8;
    // 碰撞体按 4 米分桶（sync 时建好，桶覆盖"半径 + clear"的外接方框）：只查格心所在的桶，结果与逐个遍历相同
    if (ok && this.cols)
      for (const o of this.buckets ? this.buckets.get(K(Math.floor(x / 4), Math.floor(z / 4))) || EMPTY : this.cols)
        if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + NAV.clear) ** 2) {
          ok = !1;
          break;
        }
    c = { h, ok };
    this.cells.set(k, c);
    return c;
  }
  // 从格 (i, j) 沿方向 d 走到相邻格；anyDest：目标格被占也算（流场的源格，主角可能贴着树站）
  step(i, j, d, anyDest = !1) {
    const k = K(i, j) * 8 + d;
    let v = anyDest ? undefined : this.edges.get(k);
    if (v !== undefined) return v;
    const [di, dj] = DIRS[d];
    const b = this.cell(i + di, j + dj);
    const x0 = (i + 0.5) * NAV.cell, z0 = (j + 0.5) * NAV.cell, x1 = (i + di + 0.5) * NAV.cell, z1 = (j + dj + 0.5) * NAV.cell;
    // 起点格本身被树石占住（贴着树）时不查线段碰撞，让它能走出来
    v = (anyDest || b.ok) && segOk(x0, z0, x1, z1) && (anyDest || !this.cell(i, j).ok || !this.segHits(x0, z0, x1, z1));
    if (v && di && dj) v = this.cell(i + di, j).ok && this.cell(i, j + dj).ok; // 斜走不切角
    if (!anyDest) this.edges.set(k, v);
    return v;
  }
  // 以 target 为源的流场（反向 BFS：记录"从这一格出发要几步到目标"）
  flow(target) {
    this.sync();
    const tk = K(this.idx(target.x), this.idx(target.z));
    const old = this.flows.get(tk);
    // 流场只取决于目标格与边的通断（边只在 block() / 换关卡时变，那时会清空 flows），所以一直复用到被清空为止，
    // 不再每 0.6 秒按时间过期重算（结果完全相同，省掉主角站着不动时的重复 BFS）
    if (old) return old;
    return this.bfs(target, -1).f;
  }
  // 反向 BFS；stopKey ≥ 0 时一旦把该格放进表就提前停下（只回答"能不能到"，不缓存半张表）
  bfs(target, stopKey) {
    const ti = this.idx(target.x), tj = this.idx(target.z), tk = K(ti, tj);
    const d = new Map([[tk, 0]]);
    if (tk === stopKey) return { hit: !0, f: null };
    // 队列用两段扁平数组（不为每个节点分配 [i, j]）；遍历顺序与原来相同
    const qi = QI, qj = QJ;
    qi[0] = ti;
    qj[0] = tj;
    let qn = 1;
    for (let h = 0; h < qn && d.size < NAV.maxNodes; h++) {
      const i = qi[h], j = qj[h], n = d.get(K(i, j));
      for (let s = 0; s < 8; s++) {
        const ni = i - DIRS[s][0], nj = j - DIRS[s][1]; // 邻格 n 经方向 s 走到 (i, j)
        if (Math.abs(ni - ti) > NAV.radius || Math.abs(nj - tj) > NAV.radius) continue;
        const nk = K(ni, nj);
        if (d.has(nk) || !this.step(ni, nj, s, h === 0)) continue;
        d.set(nk, n + (s < 4 ? 1 : 1.4));
        if (nk === stopKey) return { hit: !0, f: null };
        qi[qn] = ni;
        qj[qn++] = nj;
      }
    }
    const f = { d, t: this.time, ti, tj };
    this.flows.set(tk, f);
    if (this.flows.size > 24) this.flows.delete(this.flows.keys().next().value);
    return { hit: !1, f };
  }
  // 从 pos 能否走到 target：等价于 reachable(pos, flow(target))，但没有现成流场时 BFS 一碰到 pos 所在格就停（撤离选点要试很多候选点）
  canReach(pos, target) {
    this.sync();
    const pk = K(this.idx(pos.x), this.idx(pos.z));
    const old = this.flows.get(K(this.idx(target.x), this.idx(target.z)));
    if (old) return old.d.has(pk);
    const r = this.bfs(target, pk);
    return r.hit || r.f.d.has(pk);
  }
  reachable(pos, f) {
    return f.d.has(K(this.idx(pos.x), this.idx(pos.z)));
  }
  next(pos, f, out = new THREE.Vector3()) {
    const i = this.idx(pos.x), j = this.idx(pos.z), here = f.d.get(K(i, j));
    if (here === undefined) return null;
    if (here === 0) return null;
    let best = -1, bd = here;
    for (let s = 0; s < 8; s++) {
      const v = f.d.get(K(i + DIRS[s][0], j + DIRS[s][1]));
      if (v !== undefined && v < bd && this.step(i, j, s)) (bd = v), (best = s);
    }
    if (best < 0) return null;
    return this.center(i + DIRS[best][0], j + DIRS[best][1], out);
  }
  // 直线可走：沿线逐段检查高差，并看经过的格子没被碰撞体占住
  lineClear(a, b) {
    this.sync();
    if (!segOk(a.x, a.z, b.x, b.z) || this.segHits(a.x, a.z, b.x, b.z)) return !1;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / NAV.cell);
    for (let k = 1; k < n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
      if (!this.cell(this.idx(x), this.idx(z)).ok) return !1;
    }
    return !0;
  }
  update(dt) {
    this.time += dt;
  }
}

function segOk(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / NAV.sample));
  let prev = height(x0, z0);
  if (prev < -0.8) return !1;
  for (let k = 1; k <= n; k++) {
    const h = height(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n);
    if (h < -0.8 || h - prev > NAV.up || prev - h > NAV.down) return !1;
    prev = h;
  }
  return !0;
}
