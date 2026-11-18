// 储物袋（共享契约）：按"格数"计容量的背包，物品占 1 / 2 / 4 格，可堆叠物品按堆占格。
// 用于：局内储物袋、贴身锦囊（maxItemSize = 1）、洞府仓库（capacity = Infinity）。
import { sizeOf, valueOf, canStack, defOf } from "./items.js";

export class Bag {
  constructor(capacity = 16, { maxItemSize = 4, name = "储物袋" } = {}) {
    this.capacity = capacity;
    this.maxItemSize = maxItemSize;
    this.name = name;
    this.items = [];
    this.listeners = new Set();
  }
  get used() {
    return this.items.reduce((s, it) => s + sizeOf(it), 0);
  }
  get free() {
    return this.capacity - this.used;
  }
  get value() {
    return this.items.reduce((s, it) => s + valueOf(it), 0);
  }
  // 能否放入（先尝试堆叠到已有物品上）
  // 可堆叠物品先填满已有的同类堆（45 + 10 → 50 + 5），放不下的余数才另占一格
  canAdd(inst) {
    if (sizeOf(inst) > this.maxItemSize) return !1;
    if (this._stackRoom(inst) >= inst.n) return !0;
    return sizeOf(inst) <= this.free;
  }
  _stackRoom(inst) {
    const max = (defOf(inst) || {}).stack || 1;
    let room = 0;
    for (const it of this.items) if (canStack(it, inst)) room += Math.max(0, max - it.n);
    return room;
  }
  _stackTarget(inst) {
    const max = (defOf(inst) || {}).stack || 1;
    return this.items.find((it) => canStack(it, inst) && it.n + inst.n <= max);
  }
  // 放入；返回 true 表示成功（失败时不改动）
  // 部分并入已有堆时，余数以新 uid 另占一格；传入的 inst 本身不改（调用方拿它显示"拾得 ×N"）
  add(inst) {
    if (!this.canAdd(inst)) return !1;
    const t = this._stackTarget(inst);
    if (t) t.n += inst.n;
    else if (!this._stackRoom(inst)) this.items.push(inst);
    else {
      const max = (defOf(inst) || {}).stack || 1;
      let left = inst.n;
      for (const it of this.items) {
        if (left <= 0) break;
        if (!canStack(it, inst) || it.n >= max) continue;
        const k = Math.min(left, max - it.n);
        it.n += k;
        left -= k;
      }
      if (left > 0) this.items.push({ ...inst, uid: inst.uid + "_" + Date.now().toString(36), n: left });
    }
    this._emit("add", inst);
    return !0;
  }
  // 把同类可堆叠的零散堆合并（旧存档里已经拆开的灵石等）；返回是否有变化
  compact() {
    const out = [];
    let changed = !1;
    for (const it of this.items) {
      const max = (defOf(it) || {}).stack || 1;
      if (max <= 1 || !it.identified || (it.affixes && it.affixes.length)) {
        out.push(it);
        continue;
      }
      let left = it.n;
      for (const o of out) {
        if (left <= 0) break;
        if (!canStack(o, it) || o.n >= max) continue;
        const k = Math.min(left, max - o.n);
        o.n += k;
        left -= k;
      }
      if (left === it.n) out.push(it);
      else if (((changed = !0), left > 0)) out.push(((it.n = left), it));
    }
    if (changed) (this.items = out), this._emit("compact", null);
    return changed;
  }
  remove(uid, n) {
    const i = this.items.findIndex((it) => it.uid === uid);
    if (i < 0) return null;
    const it = this.items[i];
    if (n && n < it.n) {
      it.n -= n;
      const part = { ...it, uid: it.uid + "_" + Date.now().toString(36), n };
      this._emit("remove", part);
      return part;
    }
    this.items.splice(i, 1);
    this._emit("remove", it);
    return it;
  }
  clear() {
    const all = this.items;
    this.items = [];
    this._emit("clear", all);
    return all;
  }
  count(id) {
    return this.items.filter((it) => it.id === id).reduce((s, it) => s + it.n, 0);
  }
  // 按 id 消耗若干（炼丹、炼器扣材料用）；不足时不扣，返回 false
  consume(id, n) {
    if (this.count(id) < n) return !1;
    for (const it of [...this.items]) {
      if (it.id !== id || n <= 0) continue;
      const k = Math.min(n, it.n);
      this.remove(it.uid, k < it.n ? k : undefined);
      n -= k;
    }
    return !0;
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit(type, item) {
    for (const fn of this.listeners) fn(type, item, this);
  }
  toJSON() {
    return { capacity: Number.isFinite(this.capacity) ? this.capacity : -1, maxItemSize: this.maxItemSize, name: this.name, items: this.items };
  }
  static from(j) {
    const b = new Bag(j.capacity == null ? 16 : j.capacity < 0 ? Infinity : j.capacity, { maxItemSize: j.maxItemSize ?? 4, name: j.name });
    b.items = j.items || [];
    try {
      b.compact(); // 旧存档里被拆成几格的同类堆（灵石、残页等）读档时合并
    } catch (e) {
      console.warn("[bag] compact", e);
    }
    return b;
  }
}
