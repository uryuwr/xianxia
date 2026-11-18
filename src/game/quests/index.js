// 出行委托与奇遇（模块 E）。数据：src/data/quests.js（委托模板）、src/data/encounters.js（奇遇与对话）。
//
//   const Q = new Quests(ctx)
//   Q.offers(profile)        → 3 个委托 [{ id, title, desc, region, reward, rewardText, objective }]（同一局号 + 存档固定；不会全是同一类）
//   Q.accept(ids)            接 1–2 个（id 或 offer 对象）
//   Q.start(run)             出行局开始：订阅 kill / gather:done，放置委托遗物与 1–2 个奇遇（第 6 局起）
//   Q.progress()             → [{ id, text, done }]（HUD 用）
//   Q.update(dt)             每帧；没有外部调用时自动挂在 run.update 后面
//   Q.settle(run, result)    结算：result 为 "extract" | "death" 或 run.result；撤离成功才交付奖励，并直接写入存档
//                            → { list: [{ id, text, done, reward }], rewards: [物品实例 | { xp } | { fortune } | { favour }], notes: [...], applied: true }
//   Q.dispose()
// 白鹭的好感与剧情阶段存在 profile.flags.bailu = { stage, favour, met, gift }。
import * as THREE from "three";
import { QUEST_TEMPLATES, REWARD_POOLS, QUEST_ITEMS, QUEST_RULES } from "../../data/quests.js";
import { ENCOUNTERS, ENCOUNTER_RULES } from "../../data/encounters.js";
import { ITEMS, makeItem, registerItems } from "../../core/items.js";
import { addXp } from "../progression.js";
import { Dialog } from "../../ui/quests/dialog.js";
import { makeVisual, makeBeacon } from "./visuals.js";
import { layoutField, setupField, onFieldGather } from "./lingtian.js";
import { showThought } from "../../ui/quests/dialog.js";

// 兄弟模块：存在才用
const LOOT = Object.values(import.meta.glob("../loot.js", { eager: !0 }))[0] || {};
const REG = Object.values(import.meta.glob("../run/regions.js", { eager: !0 }))[0] || {};
const LOOTDATA = Object.values(import.meta.glob("../../data/loot.js", { eager: !0 }))[0] || {};
const fortuneOf = (src, dflt) => (LOOTDATA.FORTUNE && LOOTDATA.FORTUNE.add && LOOTDATA.FORTUNE.add[src]) || dflt;
const QR = QUEST_RULES.reward, ER = ENCOUNTER_RULES.reward;
const regionKey = (r) => (r === "r2" ? "r2" : "r1");

const runIndexOf = (P) => (REG.runIndex ? REG.runIndex(P) : (P.stats.runs || 0) + (P.flags && P.flags.tutorialDone ? 2 : 1));

function hash(...a) {
  let h = 2166136261;
  for (const x of a) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619));
  }
  return h >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickWeighted(list, w, r) {
  const ws = list.map(w), tot = ws.reduce((s, x) => s + x, 0);
  let x = r() * tot;
  for (let i = 0; i < list.length; i++) if ((x -= ws[i]) < 0) return list[i];
  return list[list.length - 1];
}
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const itemName = (id) => (ITEMS[id] && ITEMS[id].name) || id;

let itemsRegistered = !1;
function ensureItems() {
  if (itemsRegistered) return;
  registerItems(QUEST_ITEMS.filter((d) => !ITEMS[d.id]));
  itemsRegistered = !0;
}
const RELIC_IDS = QUEST_ITEMS.map((d) => d.id);

export class Quests {
  constructor(ctx) {
    this.ctx = ctx;
    this.accepted = [];
    this.active = [];
    this.encs = [];
    this.notes = [];
    this.offs = [];
    this.timers = [];
    this.run = null;
    this.dialog = new Dialog();
    this.debug = {}; // 测试用：{ encounters: ["bailu"], minRun: 0 }
    ensureItems();
  }

  // =============================== 委托 ===============================
  offers(profile, o = {}) {
    const P = profile;
    const no = runIndexOf(P);
    const key = [P.slot, P.created, no].join("|");
    if (this._offers && this._offers.key === key && !o.fresh) return this._offers.list;
    const r = mulberry(hash("offers", P.created || 0, P.slot || 1, no));
    const pool = QUEST_TEMPLATES.filter((t) => {
      try {
        return !t.req || t.req(P);
      } catch {
        return !1;
      }
    });
    const groups = {};
    for (const t of pool) (groups[t.group] ||= []).push(t);
    const picks = [];
    for (const g of shuffle(Object.keys(groups).sort(), r)) {
      if (picks.length >= QUEST_RULES.offerCount) break;
      picks.push(pickWeighted(groups[g], (t) => t.weight || 1, r));
    }
    // 类别不够时从剩下的模板里补（仍然不会三个都同一类：至少有两类）
    const rest = shuffle(pool.filter((t) => !picks.includes(t)), r);
    while (picks.length < QUEST_RULES.offerCount && rest.length) picks.push(rest.shift());
    const list = picks.map((t, i) => this.instantiate(t, P, r, no, i));
    this._offers = { key, list };
    return list;
  }
  instantiate(t, P, r, no, i) {
    const layer = P.realm ? (P.realm.stage >= 2 ? 10 : P.realm.layer || 0) : 0;
    const f = Math.min(1, layer / 9);
    const p = {};
    for (const [k, [a, b]] of Object.entries(t.params || {})) p[k] = Math.round(a + (b - a) * (0.6 * f + 0.4 * r()));
    if (t.objective.type === "retrieve") {
      const d = QUEST_ITEMS[Math.floor(r() * QUEST_ITEMS.length)];
      p.relicId = d.id;
      p.relic = d.name;
      p.place = "遗府或灵光点";
    }
    p.boss = "青牙 / 碧鳞水蟒";
    // 主奖励：修为 50% / 机缘 25% / 灵石 25%（数值评审 G7）
    const primary = t.reward.primary || pickWeighted(Object.keys(QR.mix), (k) => QR.mix[k], r);
    const reward = { ...t.reward, primary };
    return {
      id: `${t.id}#${no}.${i}`,
      tpl: t.id,
      group: t.group,
      title: t.title,
      name: t.title,
      desc: fill(t.desc, p),
      text: fill(t.desc, p),
      region: t.region || "any",
      objective: { ...t.objective, ...p },
      reward,
      rewardText: rewardText(reward, null),
    };
  }
  accept(ids) {
    const list = (this._offers && this._offers.list) || [];
    // id 从本次 offers 里找；也可以直接传 offer 对象
    this.accepted = (Array.isArray(ids) ? ids : [ids])
      .map((x) => (x && typeof x === "object" ? x : list.find((q) => q.id === x)))
      .filter(Boolean)
      .slice(0, QUEST_RULES.maxAccept);
    return this.accepted;
  }

  // =============================== 出行局 ===============================
  start(run, o = {}) {
    this.end();
    ensureItems();
    const ctx = this.ctx, P = run.profile;
    this.run = run;
    this.P = P;
    this.t = 0;
    this.notes = [];
    this.timers = [];
    this.help = null;
    this.medit = null;
    this.lastBagValue = 0;
    this.hasRelic = !1;
    this.lastChannelKind = null;
    this.pillUsed = !1;
    this.selfPills = 0;
    this.potPrev = this.potSum();
    this.active = this.accepted.map((q) => ({ ...q, objective: { ...q.objective }, count: 0, got: !1, bossKilled: !1, here: q.region === "any" || q.region === run.region }));
    const ev = ctx.world.events;
    this.offs.push(ev.on("kill", (i) => this.onKill(i)), ev.on("gather:done", (e) => this.onGather(e)));
    this.exploreBase = this.inkedFrac();
    // 委托遗物：落在某个遗府 / 灵光点
    const pts = (run.map && run.map.points) || {};
    const r = mulberry(hash("quest", run.seed || 0));
    for (const q of this.active) {
      if (q.objective.type !== "retrieve" || !q.here) continue;
      // 关卡给了遗物藏点（points.relics，带 place 地名）就用它，否则从遗府 / 灵光点 / 宝箱点附近挑
      const relics = (pts.relics || []).filter((x) => x && x.pos);
      const cand = relics.length ? relics : [...(pts.ruins || []), ...(pts.glows || []), ...(pts.chests || [])].map((x) => ({ pos: x.pos || x })).filter((x) => x.pos);
      const far = cand.filter((x) => dist2(x.pos, ctx.player.pos) > 25);
      const at = (far.length ? far : cand)[Math.floor(r() * (far.length || cand.length))];
      if (!at) continue;
      const pos = this.ground(relics.length ? at.pos.clone() : at.pos.clone().add(new THREE.Vector3(1.6, 0, 1.6)));
      if (at.place) (q.place = at.place), this.toast(`「${q.objective.relic || "遗物"}」应在${at.place}一带`, "", 3);
      const b = makeBeacon(ctx);
      b.root.position.copy(pos);
      ctx.scene.add(b.root);
      q.target = { pos, beacon: b };
    }
    this.placeEncounters(o);
    this.hookRun(run);
    return this;
  }
  hookRun(run) {
    if (run.__questsHooked) return;
    const up = run.update, dis = run.dispose;
    run.update = (dt) => {
      up.call(run, dt);
      if (!this.external && this.run === run) this.update(dt, !0);
    };
    run.dispose = () => {
      if (this.run === run) this.end();
      run.update = up;
      run.dispose = dis;
      run.__questsHooked = !1;
      return dis.call(run);
    };
    run.__questsHooked = !0;
    this.unhook = () => {
      if (run.update !== up) run.update = up;
      run.__questsHooked = !1;
    };
  }

  // ---------------- 事件 ----------------
  onKill(info) {
    const t = info && info.target;
    if (!t || t.team !== "enemy") return;
    const tags = t.tags || new Set();
    const has = (k) => (tags.has ? tags.has(k) : tags.includes && tags.includes(k));
    const elite = has("elite") || has("boss"), boss = has("boss");
    for (const q of this.active) {
      if (!q.here) continue;
      const ob = q.objective;
      if (ob.type === "kill") {
        if (ob.filter === "elite" && !elite) continue;
        if (ob.kinds && !ob.kinds.some((k) => (t.kind || "").startsWith(k))) continue;
        if (ob.filter === "any" && boss) continue;
        q.count++;
      } else if (ob.type === "boss_nopill" && boss) {
        q.bossKilled = !0;
        q.bossClean = !this.pillUsed;
      }
    }
  }
  onGather(e) {
    if (!e) return;
    for (const enc of this.encs) if (enc.field) onFieldGather(this, enc, e);
    for (const q of this.active) {
      if (!q.here || q.objective.type !== "gather") continue;
      const ids = q.objective.items;
      if (ids) q.count += (e.items || []).filter((it) => ids.includes(it.id)).reduce((s, it) => s + (it.n || 1), 0);
      else q.count++;
    }
  }

  // ---------------- 工具 ----------------
  potSum() {
    const S = this.ctx.skills;
    return S && S.potions ? S.potions.reduce((s, p) => s + ((p && p.count) || 0), 0) : 0;
  }
  inkedFrac() {
    const E = this.run && this.run.explored;
    if (!E || !E.cells) return 0;
    let n = 0;
    for (const c of E.cells) n += c ? 1 : 0;
    return n / E.cells.length;
  }
  height(x, z) {
    const run = this.run, T = this.ctx.terrain;
    if (run && run.map && run.map.height) return run.map.height(x, z);
    return T && T.height ? T.height(x, z) : 0;
  }
  ground(p) {
    p.y = this.height(p.x, p.z);
    return p;
  }
  toast(text, kind = "", dur) {
    const run = this.run;
    if (run && run.toast) run.toast(text, kind, dur);
    else if (this.ctx.ui && this.ctx.ui.toast) this.ctx.ui.toast(text, { kind, dur });
    (this.log ||= []).push(text);
  }
  bailu() {
    const f = (this.P.flags ||= {});
    return (f.bailu ||= { stage: 0, favour: 0, met: 0 });
  }

  // =============================== 奇遇 ===============================
  // 本局出哪些奇遇（只定种类，不定位置）；同一局号 + 种子结果固定
  rollEncounters(P, no, region, seed) {
    const minRun = this.debug.minRun ?? ENCOUNTER_RULES.minRun;
    const r = mulberry(hash("encroll", seed, no));
    const ids = [];
    const met = !!(P.flags && P.flags.bailu && P.flags.bailu.met);
    // 对话类奇遇：第 6 局起每局 0–2 个（数值评审 G8）；从没遇过奇遇时至少 1 个（白鹭的初遇）。separate 的（灵田）不在这里抽
    if (no >= minRun) {
      let want = pickWeighted([0, 1, 2], (k) => ENCOUNTER_RULES.perRun[k], r);
      if (!met) want = Math.max(1, want);
      const left = Object.keys(ENCOUNTERS).filter((k) => !ENCOUNTERS[k].separate);
      if (want && !met && left.includes("bailu")) ids.push("bailu"), left.splice(left.indexOf("bailu"), 1);
      while (ids.length < want && left.length) {
        const id = pickWeighted(left, (k) => Math.max(0.01, ENCOUNTERS[k].weight ? ENCOUNTERS[k].weight(P) : 1), r);
        ids.push(id);
        left.splice(left.indexOf(id), 1);
      }
    }
    // 单独掷的奇遇（灵田）：按区域概率，自己的起始局，不占上面的名额
    for (const [k, d] of Object.entries(ENCOUNTERS)) {
      if (!d.separate || no < (d.minRun ?? minRun)) continue;
      const ch = typeof d.chance === "number" ? d.chance : (d.chance && (d.chance[region] ?? d.chance.r1)) || 0;
      if (r() < ch) ids.push(k);
    }
    return ids;
  }
  placeEncounters(o = {}) {
    const run = this.run, P = this.P, ctx = this.ctx;
    const no = run.no ?? runIndexOf(P);
    const forced = o.encounters || this.debug.encounters;
    if (!forced && run.region === "tutorial") return;
    const r = mulberry(hash("enc", run.seed || 0, no));
    const pts = (run.map && run.map.points) || {};
    const entry = ctx.player.pos.clone();
    const exts = (run.extracts || pts.extracts || []).map((x) => x.pos).filter(Boolean);
    let ids = forced ? [...forced] : this.rollEncounters(P, no, run.region, run.seed || 0);
    if (!ids.length) return;
    // 落点：优先关卡的奇遇点（points.encounters，types 标明适合哪些奇遇，原位放置）；
    // 没有匹配的点再从灵光点 / 遗府 / 灵草 / 妖群 / 宝箱点附近挑（偏开 2.5 米）
    const tagged = shuffle((pts.encounters || []).filter((x) => x && x.pos).map((x) => ({ pos: x.pos.clone(), types: x.types || [], exact: !0 })), r);
    const generic = shuffle([...(pts.glows || []), ...(pts.ruins || []), ...(pts.gathers || []), ...(pts.spawns || []), ...(pts.chests || [])].map((x) => ({ pos: (x.pos || x).clone() })), r);
    const spots = [];
    const fits = (c, relax) =>
      dist2(c.pos, entry) >= ENCOUNTER_RULES.minFromEntry * relax &&
      !exts.some((e) => dist2(e, c.pos) < ENCOUNTER_RULES.minFromExtract * relax) &&
      !spots.some((s) => s && dist2(s.pos, c.pos) < ENCOUNTER_RULES.minApart * relax);
    const pick = (list, relaxes, ok) => {
      for (const relax of relaxes) for (const c of list) if (!spots.includes(c) && fits(c, relax) && (!ok || ok(c))) return c;
      return null;
    };
    const layouts = [];
    for (const id of ids) {
      const def = ENCOUNTERS[id] || {};
      const types = def.types || [id];
      const own = tagged.filter((c) => types.some((t) => c.types.includes(t)));
      if (def.field) {
        // 灵田：要能在这个点周围摆下足够多的灵草；先专门的点，再开阔的 rain / fox 点，最后灵光点等
        const alt = tagged.filter((c) => !own.includes(c) && (def.altTypes || []).some((t) => c.types.includes(t)));
        const ok = (c) => !!(c.layout = layoutField(ctx, run, c.pos, def, r));
        const sp = pick(own, [1, 0.5, 0.2, 0], ok) || pick(alt, [1, 0.5, 0.2, 0], ok) || pick(generic.map((g) => ({ ...g, exact: !0 })), [1, 0.5, 0.2], ok) || null;
        spots.push(sp);
        layouts.push(sp && sp.layout);
        continue;
      }
      spots.push(pick(own, [1, 0.5, 0.2, 0]) || pick(generic, [1, 0.5, 0.2]) || null);
      layouts.push(null);
    }
    if (o.at)
      o.at.forEach((p, i) => {
        const def = ENCOUNTERS[ids[i]] || {};
        const c = { pos: p.clone(), exact: !0 };
        if (def.field) c.layout = layouts[i] = layoutField(ctx, run, c.pos, def, r);
        spots[i] = def.field && !c.layout ? null : c;
      });
    ids = ids.filter((_, i) => spots[i]);
    const used = spots.filter(Boolean);
    ids.forEach((id, i) => {
      const def = ENCOUNTERS[id];
      if (!def) return;
      const a = r() * Math.PI * 2, sp = used[i];
      const pos = this.ground(sp.exact ? sp.pos.clone() : sp.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5)));
      // 别和宝箱 / 灵草等交互物挤在一起（F 只认最近的标记）；灵田的布局已经避开了
      if (!def.field) for (const m of run.marks || []) {
        if (!m.pos || dist2(m.pos, pos) >= 3.2) continue;
        const d = new THREE.Vector3(pos.x - m.pos.x, 0, pos.z - m.pos.z);
        if (d.lengthSq() < 1e-4) d.set(Math.cos(a), 0, Math.sin(a));
        this.ground(pos.copy(m.pos).addScaledVector(d.normalize(), 3.4));
      }
      const vis = makeVisual(def.visual, ctx, def.glyph);
      vis.root.position.copy(pos);
      vis.root.rotation.y = r() * Math.PI * 2;
      vis.height = (x, z) => this.height(x, z);
      const enc = { id, def, pos, vis, state: "ready", noticed: !1, tagged: !!(sp.types && (def.types || [id]).some((t) => sp.types.includes(t))), kind: "encounter", glyph: "缘" };
      if (def.field) {
        enc.field = setupField(this, enc, sp.layout, r);
        enc.state = "field";
        this.encs.push(enc);
        return;
      }
      if (run.addMark) {
        try {
          enc.mark = run.addMark({ kind: "encounter", pos: pos.clone(), label: `${def.name}（奇遇）`, glyph: def.glyph, color: 0xb8301c, encounter: enc, onInteract: () => this.open(enc) });
        } catch (e) {
          console.warn("[quests] addMark 失败", e);
        }
      }
      this.encs.push(enc);
    });
  }
  // 打开奇遇对话
  open(enc) {
    if (!enc || enc.state !== "ready" || this.dialog.isOpen) return !1;
    enc.state = "talk";
    this.pause(!0);
    enc.vis.talk(!0);
    if (enc.id === "bailu") this.bailu().met++;
    this.runNode(enc, enc.def.start(this.P));
    return !0;
  }
  sub(s) {
    return (s || "").replace(/\{me\}/g, this.P.name || "林墨");
  }
  needCheck(need) {
    if (!need) return { ok: !0 };
    if (need.item) {
      const have = this.countItem(need.item);
      return { ok: have >= (need.n || 1), reason: `缺少${itemName(need.item)}` };
    }
    if (need.stones) return { ok: this.run.bag && this.run.bag.count("spirit_stone") >= need.stones, reason: "储物袋里灵石不够" };
    if (need.favour) return { ok: this.bailu().favour >= need.favour, reason: "交情不够" };
    return { ok: !0 };
  }
  countItem(id) {
    const run = this.run, S = this.ctx.skills;
    let n = run.bag ? run.bag.count(id) : 0;
    const i = { huiqi_dan: 0, huichun_dan: 1 }[id];
    if (i !== undefined && S && S.potions && S.potions[i]) n += S.potions[i].count || 0;
    return n;
  }
  consumeItem(id, n = 1) {
    const run = this.run, S = this.ctx.skills;
    if (run.bag && run.bag.count(id) >= n) return run.bag.consume(id, n);
    const i = { huiqi_dan: 0, huichun_dan: 1 }[id];
    const po = i !== undefined && S && S.potions && S.potions[i];
    if (po && po.count >= n) {
      po.count -= n;
      this.potPrev -= n; // 送出去的丹药不算"服丹"
      S.ui && S.ui.refresh && S.ui.refresh();
      return !0;
    }
    return !1;
  }
  runNode(enc, nodeId) {
    const node = enc.def.nodes[nodeId];
    if (!node) return this.finishTalk(enc);
    enc.node = nodeId;
    const lines = node.lines.map(([who, text]) => ({ who: this.sub(who), text: this.sub(text) }));
    const choices = (node.choices || []).map((c) => {
      const chk = this.needCheck(c.need);
      return { text: this.sub(c.text), disabled: !chk.ok, reason: chk.ok ? "" : chk.reason };
    });
    this.dialog.open({
      glyph: enc.def.glyph, name: enc.def.name, title: enc.def.title || "", me: this.P.name || "林墨", lines, choices,
      onChoose: (i) => this.pick(enc, node, i),
      onClose: () => this.finishTalk(enc),
    });
  }
  pick(enc, node, i) {
    const c = node.choices[i];
    (enc.picks ||= []).push(i);
    this.applyEffects(enc, c.effects || []);
    const then = () => (c.next ? this.runNode(enc, c.next) : this.finishTalk(enc));
    if (c.reply && c.reply.length) {
      this.dialog.open({
        glyph: enc.def.glyph, name: enc.def.name, title: enc.def.title || "", me: this.P.name || "林墨",
        lines: c.reply.map(([who, text]) => ({ who: this.sub(who), text: this.sub(text) })), choices: [],
        onClose: then,
      });
    } else then();
  }
  finishTalk(enc) {
    if (enc.state !== "talk") return;
    this.pause(!1);
    enc.vis.talk(!1);
    enc.state = "done";
    if (enc.vis.seal) enc.vis.seal.visible = !1;
    if (enc.mark && this.run && this.run.marks && this.run.marks.includes(enc.mark)) {
      // 交互标记撤掉，表现留在原地
      try {
        this.run.removeMark(enc.mark);
      } catch {}
      enc.mark = null;
    }
    if (enc.def.visual === "remains" && enc.vis.settle) enc.vis.settle();
  }
  pause(on) {
    const w = this.ctx.world;
    if (on) {
      if (this.paused) return;
      this.paused = { ts: w.timeScale };
      w.timeScale = 0;
    } else if (this.paused) {
      w.timeScale = this.paused.ts || 1;
      this.paused = null;
    }
  }

  // ---------------- 效果 ----------------
  applyEffects(enc, list) {
    const run = this.run, P = this.P, ctx = this.ctx;
    const rk = regionKey(run.region);
    for (const e of list) {
      if (e.region && e.region !== run.region) continue;
      if (e.item) {
        if (ITEMS[e.item]) this.give(enc.pos, [makeItem(e.item, { n: e.n || 1 })]);
      } else if (e.loot) this.give(enc.pos, this.roll(e.loot));
      else if (e.consume) this.consumeItem(e.consume.item, e.consume.n || 1);
      else if (e.pay) run.bag && run.bag.consume("spirit_stone", e.pay);
      else if (e.xp) {
        const got = addXp(P, Math.round((e.xp === "enc" ? ER.xp[rk] : e.xp) * (e.k || 1)), "encounter");
        run.insight = (run.insight || 0) + got;
        if (got > 0) this.toast(`感悟 +${got}`, "gold");
      } else if (e.fortune) this.bumpFortune(Math.round((e.fortune === "enc" ? fortuneOf("encounter", ER.fortune) : e.fortune) * (e.k || 1)));
      else if (e.lead) this.startLead(enc, e.lead, e.baopin || 0);
      else if (e.baopin) {
        // 宝品装备（数值评审 G8：每个奇遇 25%）
        const g = this.baopin(e.baopin);
        if (g) this.give(enc.pos, [g]);
      }
      else if (e.favour) {
        this.bailu().favour += e.favour;
        this.toast(`白鹭好感 ${e.favour > 0 ? "+" : ""}${e.favour}`, "gold");
      } else if (e.bailu) this.bailu().stage = Math.max(this.bailu().stage, e.bailu);
      else if (e.flag) {
        const [a, b] = e.flag.split(".");
        if (b) ((P.flags[a] ||= {})[b] = !0);
        else P.flags[a] = !0;
      } else if (e.heal) {
        const h = ctx.player && ctx.player.entity;
        if (h && h.stats) (h.hp = h.stats.get("hp")), (h.mp = h.stats.get("mp"));
      } else if (e.spawn) this.timers.push({ t: e.delay || 0, fn: () => this.spawn(enc.pos, e.spawn, !!e.elite) });
      else if (e.help) this.startHelp(enc, e);
      else if (e.meditate) this.medit = { enc, pos: enc.pos.clone(), r: (enc.vis.radius || 4) + 0.3, t: 0, need: e.meditate, k: e.k || 1 };
      else if (e.reveal) this.reveal(enc.pos);
      if (e.note) this.notes.push(e.note);
    }
  }
  roll(src) {
    const run = this.run;
    try {
      if (run.rollLoot) return run.rollLoot(src) || [];
      if (LOOT.rollLoot) return LOOT.rollLoot(src, { region: run.region, level: run.R && run.R.level, profile: this.P }) || [];
    } catch (e) {
      console.error("[quests] rollLoot 失败", src, e);
    }
    return [makeItem("spirit_stone", { n: 10 })];
  }
  // 给物品：交给流程模块的拾取（loot:drop），没有拾取系统时直接放进储物袋
  give(pos, items) {
    if (!items || !items.length) return;
    const run = this.run;
    this.ctx.vfx && this.ctx.vfx.burst && this.ctx.vfx.burst(pos, { color: 0xe0b45a, count: 14, speed: 2.5, up: 3.5, size: 0.16 });
    if (run.pickups) this.ctx.world.events.emit("loot:drop", { pos: pos.clone(), items, source: "encounter" });
    else for (const it of items) run.bag && run.bag.add(it);
    (this.given ||= []).push(...items);
  }
  bumpFortune(n) {
    const S = (this.P.stats ||= {});
    if (n > 0 && LOOT.addFortune) LOOT.addFortune(this.P, n);
    else {
      const max = (LOOT.getFortune && LOOT.getFortune(this.P).max) || 100;
      S.fortune = Math.max(0, Math.min(max, (S.fortune || 0) + n));
    }
    this.toast(`机缘 ${n > 0 ? "+" : ""}${n}`, n > 0 ? "gold" : "warn");
  }
  spawn(pos, n, elite) {
    const E = this.ctx.enemies, run = this.run;
    if (!E || !E.spawnPack) return [];
    const list = E.spawnPack(n, elite, pos) || [];
    for (const e of list) {
      e.setAggro && e.setAggro();
      run && run.buffEnemy && run.buffEnemy(e);
    }
    return list;
  }
  reveal(pos) {
    const xs = (this.run.extracts || []).filter((x) => !x.known && x.kind !== "fake");
    xs.sort((a, b) => dist2(a.pos, pos) - dist2(b.pos, pos));
    const x = xs[0];
    if (x) {
      x.known = !0;
      this.toast(`天机镜上亮起一处${x.name || "撤离点"}`, "gold", 3);
    }
  }
  // 白鹭求助：在她前方刷一群，她一起打；清完给奖励
  startHelp(enc, e) {
    const pl = this.ctx.player.pos;
    const dir = new THREE.Vector3().subVectors(enc.pos, pl).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
    dir.normalize();
    const at = this.ground(enc.pos.clone().addScaledVector(dir, 7));
    this.help = { enc, t: 0, ents: [], reward: e.reward || [], at, n: e.help, elite: !!e.elite, spawned: !1, cd: 1.2 };
  }
  updateHelp(dt, rdt) {
    const h = this.help, v = h.enc.vis;
    h.t += dt;
    if (!h.spawned && h.t > 0.6) {
      h.spawned = !0;
      h.ents = this.spawn(h.at, h.n, h.elite);
      if (!h.ents.length) return this.finishHelp(!0);
    }
    if (!h.spawned) return;
    const alive = h.ents.filter((e) => e.alive);
    if (!alive.length) return this.finishHelp(!0);
    if (h.t > 120) return this.finishHelp(!1);
    if (dt <= 0) return;
    // 白鹭：走向最近的妖物，近身挥剑
    const me = v.root.position;
    alive.sort((a, b) => dist2(a.pos, me) - dist2(b.pos, me));
    const tg = alive[0], d = dist2(tg.pos, me);
    if (d > 2.2) {
      if (!v.moving || !v.target || dist2(v.target, tg.pos) > 1) v.moveTo(tg.pos, 5);
    } else {
      v.moving = !1;
      v.face(tg.pos, 1);
      if ((h.cd -= dt) <= 0) {
        h.cd = 1.3;
        v.play("wave", 0.1, !0);
        const dirv = new THREE.Vector3().subVectors(tg.pos, me).setY(0).normalize();
        this.ctx.vfx && this.ctx.vfx.arc && this.ctx.vfx.arc(me.clone().setY(me.y + 1), dirv, 2.4, Math.PI * 0.7, { color: 0x2f7fa8, dur: 0.3 });
        const ent = tg.entity || tg;
        if (ent && ent.stats) this.ctx.world.dealDamage(null, ent, { base: Math.max(12, ent.stats.get("hp") * 0.16), noCrit: !0, tags: ["ally", "bailu"], pos: tg.pos.clone() });
      }
    }
  }
  finishHelp(ok) {
    const h = this.help;
    this.help = null;
    const v = h.enc.vis;
    v.moving = !1;
    v.play("idle");
    if (ok) {
      this.toast("白鹭：「漂亮！这份情我记下了。」", "gold", 3);
      this.applyEffects({ ...h.enc, pos: v.root.position.clone() }, h.reward);
    } else {
      this.toast("白鹭：「……算了，改日再说。」", "", 2.5);
      this.notes.push("没能帮白鹭夺回剑穗");
    }
  }
  // 灵狐带路：跑到不远处，在那儿给一份掉落
  baopin(p) {
    const run = this.run;
    if (!(Math.random() < p) || !LOOT.makeGear) return null;
    try {
      return LOOT.makeGear(null, 2, (run.R && run.R.level) || 1, { region: run.region });
    } catch (err) {
      console.warn("[quests] makeGear 失败", err);
      return null;
    }
  }
  startLead(enc, src, bp = 0) {
    const v = enc.vis;
    v.healed && v.healed();
    const pl = this.ctx.player.pos;
    const dir = new THREE.Vector3().subVectors(enc.pos, pl).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
    const to = this.ground(enc.pos.clone().addScaledVector(dir, 8));
    this.timers.push({
      t: 0.8,
      fn: () => {
        v.moveTo(to, 3.2);
        v.onArrive = () => {
          const g = this.baopin(bp);
          this.give(to, [...this.roll(src), ...(g ? [g] : [])]);
          this.toast("灵狐在一处石缝前停下，回头看了你一眼，钻进了林子。", "gold", 3);
          this.timers.push({ t: 1.2, fn: () => (v.root.visible = !1) });
        };
      },
    });
  }
  updateMeditate(dt) {
    const m = this.medit, run = this.run;
    const d = dist2(this.ctx.player.pos, m.pos);
    if (d > m.r) {
      this.medit = null;
      this.toast("离开了灵雨，吐纳中断", "warn");
      if (m.enc.vis.intensity !== undefined) m.enc.vis.intensity = 0.4;
      return;
    }
    m.t += dt;
    if (run) run.hint = `吐纳灵雨 · ${Math.max(0, m.need - m.t).toFixed(1)} 息（离开雨圈会中断）`;
    if (m.t >= m.need) {
      this.medit = null;
      this.applyEffects(m.enc, [{ xp: "enc", k: m.k }, { heal: 1 }, { note: "在灵雨中吐纳，修为精进" }]);
      if (m.enc.vis.intensity !== undefined) m.enc.vis.intensity = 0.4;
    }
  }

  // =============================== 每帧 ===============================
  update(dt = 0, fromHook = !1) {
    if (!fromHook) this.external = !0;
    const now = performance.now() / 1000;
    const rdt = Math.min(0.1, this._last ? now - this._last : 0);
    this._last = now;
    const run = this.run;
    if (!run) return;
    this.t += dt;
    const ctx = this.ctx, pl = ctx.player.pos;
    // 快照：储物袋灵值、遗物、撤离方式、丹药
    if (run.bag && run.state !== "done" && !run.result) {
      this.lastBagValue = run.bag.value;
      this.hasRelic = RELIC_IDS.some((id) => run.bag.count(id) > 0 || (run.keyItems || []).some((k) => k.id === id));
    }
    if (run.channel && run.channel.ext) this.lastChannelKind = run.channel.ext.kind;
    const ps = this.potSum();
    if (ps < this.potPrev) this.pillUsed = !0;
    this.potPrev = ps;
    // 委托遗物
    for (const q of this.active) {
      if (!q.target) continue;
      q.target.beacon.update(rdt);
      if (!q.got && dist2(pl, q.target.pos) < QUEST_RULES.retrieveRadius) {
        q.got = !0;
        const id = q.objective.relicId || RELIC_IDS[0];
        this.give(q.target.pos, [makeItem(id)]);
        this.toast(`找到了「${itemName(id)}」——带着它撤离即可交付委托`, "gold", 3);
        q.target.beacon.root.visible = !1;
      }
    }
    // 奇遇
    for (const enc of this.encs) {
      enc.vis.update(rdt);
      const d = dist2(pl, enc.vis.root.position);
      if (enc.field) {
        // 灵田：走近时冒一句心声；采集走 run 的采集标记
        if (!enc.noticed && d < ENCOUNTER_RULES.noticeRadius) {
          enc.noticed = !0;
          showThought(this.sub(enc.def.thought || ""), this.P.name || "林墨");
          (this.log ||= []).push(enc.def.thought);
        }
        continue;
      }
      if (enc.state === "ready") {
        if (!enc.noticed && d < ENCOUNTER_RULES.noticeRadius) {
          enc.noticed = !0;
          if (enc.id === "bailu") enc.vis.play && enc.vis.play("wave", 0.2, !0);
          this.toast(enc.id === "bailu" ? "前方似乎有人" : `前方：${enc.def.name}`, "", 2);
        }
        if (d < 9) enc.vis.face(pl, rdt);
        const near = enc.mark && run.nearestMark ? run.nearestMark() === enc.mark : d < ENCOUNTER_RULES.talkRadius;
        if (near) {
          if (!enc.mark && run.state === "play") run.hint = `F · ${enc.def.name}（奇遇）`;
          if (ctx.input && ctx.input.pressed && ctx.input.pressed("KeyF")) this.open(enc);
        }
      } else if (enc.state === "talk") enc.vis.face(pl, rdt);
    }
    if (this.help) this.updateHelp(dt, rdt);
    if (this.medit) this.updateMeditate(dt);
    // 延迟效果按玩法时间计（对话期间暂停）
    for (const tm of [...this.timers]) {
      if ((tm.t -= dt) <= 0) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.fn();
      }
    }
  }

  // =============================== HUD ===============================
  progress() {
    const run = this.run;
    return this.active.map((q) => {
      const ob = q.objective;
      if (!q.here) return { id: q.id, text: `${q.title}（不在此地）`, done: !1 };
      let s = "", done = !1;
      switch (ob.type) {
        case "kill":
        case "gather":
          done = q.count >= ob.n;
          s = `${Math.min(q.count, ob.n)}/${ob.n}`;
          break;
        case "boss_nopill":
          done = q.bossKilled && q.bossClean;
          s = done ? "已斩" : this.pillUsed ? "已服丹 · 失败" : "未斩";
          break;
        case "retrieve":
          done = q.got && this.hasRelic;
          s = !q.got ? `前往${q.place || "光柱处"}` : this.hasRelic ? "已取得 · 撤离交付" : "遗物不在袋中";
          break;
        case "carry": {
          const need = this.carryNeed(q);
          done = this.lastBagValue >= need;
          s = `灵值 ${this.lastBagValue}/${need}`;
          break;
        }
        case "explore": {
          const got = Math.round((this.inkedFrac() - this.exploreBase) * 100);
          done = got >= ob.pct;
          s = `着墨 +${Math.max(0, got)}%/${ob.pct}%`;
          break;
        }
        case "night":
          done = run && run.phase >= 3;
          s = done ? "已入夜 · 撤离即可" : "待入夜";
          break;
        case "via_ruin":
          s = "从残阵撤离";
          break;
      }
      return { id: q.id, text: `${q.title} ${s}`, done };
    });
  }
  // 天机镜（地图 v2）读：奇遇点一律标"缘"
  mapPoints() {
    return this.encs.map((e) => ({ kind: "encounter", type: e.id, glyph: "缘", label: e.def.name, pos: e.pos, done: e.state === "done" }));
  }
  carryNeed(q) {
    return q.objective.v * (this.run && this.run.region === "r2" ? 3 : 1);
  }

  // =============================== 结算 ===============================
  isDone(q, run, result, ok) {
    const ob = q.objective;
    if (!q.here) return !1;
    switch (ob.type) {
      case "kill":
      case "gather":
        return q.count >= ob.n;
      case "boss_nopill":
        return q.bossKilled && q.bossClean;
      case "retrieve":
        return q.got && (this.hasRelic || (ok && RELIC_IDS.some((id) => this.P.storage && this.P.storage.count(id) > 0)));
      case "carry":
        return Math.max(this.lastBagValue, (result && result.value) || 0) >= this.carryNeed(q);
      case "explore":
        return (this.inkedFrac() - this.exploreBase) * 100 >= ob.pct;
      case "night":
        return ((result && result.phase) ?? run.phase) >= 3;
      case "via_ruin":
        return this.lastChannelKind === "ruin" || !!(result && result.via && /残阵/.test(result.via));
    }
    return !1;
  }
  rewardsOf(q, region) {
    const R = q.reward || {}, rk = regionKey(region), out = [];
    const r = mulberry(hash("reward", q.id));
    if (R.primary === "stones") {
      let n = QR.stones[rk];
      const st = (ITEMS.spirit_stone && ITEMS.spirit_stone.stack) || 50;
      while (n > 0) out.push(makeItem("spirit_stone", { n: Math.min(st, n) })), (n -= st);
    } else if (R.primary === "xp") out.push({ xp: QR.xp[rk] });
    else if (R.primary === "fortune") out.push({ fortune: fortuneOf("quest", QR.fortune) });
    for (const it of R.items || []) {
      const pool = it.pool ? (REWARD_POOLS[it.pool] || {})[region] || (REWARD_POOLS[it.pool] || {}).r1 || [] : null;
      const id = pool ? pool[Math.floor(r() * pool.length)] : it.id;
      if (id && ITEMS[id]) out.push(makeItem(id, { n: it.n || 1 }));
    }
    if (R.favour) out.push({ favour: R.favour });
    return out;
  }
  settle(run, result) {
    run = run || this.run;
    const kind = typeof result === "string" ? result : (result && (result.result || result.kind)) || "death";
    const ok = kind === "extract";
    const P = (run && run.profile) || this.P;
    if (!this.P) this.P = P;
    const list = [], rewards = [];
    for (const q of this.active) {
      const done = this.isDone(q, run, typeof result === "object" ? result : null, ok);
      if (ok && done) {
        const rw = this.rewardsOf(q, run.region);
        rewards.push(...rw);
        list.push({ id: q.id, text: q.title, done: !0, reward: rewardText(q.reward, run.region) });
      } else {
        list.push({ id: q.id, text: q.title + (!q.here ? "（不在此地）" : ok ? "（未完成）" : done ? "（身陨，未能交付）" : "（未完成）"), done: !1 });
      }
    }
    // 委托遗物交还：从仓库 / 储物袋里收走
    for (const id of RELIC_IDS) {
      if (P.storage && P.storage.count(id)) P.storage.consume(id, P.storage.count(id));
      if (run.bag && run.bag.count(id)) run.bag.consume(id, run.bag.count(id));
    }
    if (ok) this.applyRewards(P, rewards);
    const nDone = list.filter((x) => x.done).length;
    if (nDone) P.stats.questsDone = (P.stats.questsDone || 0) + nDone;
    const notes = [...this.notes];
    if (!ok && this.active.length) notes.push("身陨，委托未能交付");
    if (ok && run.region === "r2" && nDone) notes.push("竹海·溪谷的委托报酬更丰厚");
    const res = { list, rewards, notes, applied: !0 };
    this.lastSettle = res;
    this.accepted = [];
    this._offers = null;
    this.end();
    return res;
  }
  // 把奖励写进存档：物品进仓库，修为 / 机缘 / 白鹭好感直接加
  applyRewards(P, rewards) {
    for (const r of rewards) {
      if (r.uid) P.storage.add(r);
      else if (r.xp) addXp(P, r.xp, "quest");
      else if (r.fortune) {
        if (LOOT.addFortune) LOOT.addFortune(P, r.fortune);
        else {
          const S = (P.stats ||= {});
          S.fortune = Math.min(100, (S.fortune || 0) + r.fortune);
        }
      } else if (r.favour) ((P.flags ||= {}).bailu ||= { stage: 0, favour: 0, met: 0 }).favour += r.favour;
    }
  }

  // =============================== 清理 ===============================
  end() {
    for (const off of this.offs) off && off();
    this.offs = [];
    if (this.dialog.isOpen) this.dialog.close(!1);
    this.pause(!1);
    for (const enc of this.encs) {
      if (enc.mark && this.run && this.run.marks && this.run.marks.includes(enc.mark)) {
        try {
          this.run.removeMark(enc.mark);
        } catch {}
      }
      if (enc.field && this.run && this.run.marks)
        for (const p of enc.field.plants) if (p.mark && this.run.marks.includes(p.mark)) this.run.removeMark(p.mark);
      enc.vis.dispose();
    }
    this.encs = [];
    for (const q of this.active) if (q.target) q.target.beacon.dispose();
    this.help = this.medit = null;
    this.timers = [];
    if (this.unhook) this.unhook(), (this.unhook = null);
    this.external = !1;
    this.run = null;
  }
  dispose() {
    this.end();
    this.dialog.dispose();
  }
}

// region 为 null 时两个区域都写出来（出行准备时还没选区域）
export function rewardText(R, region = null) {
  if (!R) return "";
  const out = [];
  const both = (tab, name) => (region ? `${name} ${tab[regionKey(region)]}` : `${name} ${tab.r1}（竹海 ${tab.r2}）`);
  if (R.primary === "xp") out.push(both(QR.xp, "修为"));
  else if (R.primary === "stones") out.push(both(QR.stones, "灵石"));
  else if (R.primary === "fortune") out.push(`机缘 +${fortuneOf("quest", QR.fortune)}`);
  for (const it of R.items || []) out.push(it.pool ? `${{ common: "材料", core: "妖丹", seed: "灵草苗" }[it.pool] || "材料"} ×${it.n || 1}` : `${itemName(it.id)} ×${it.n || 1}`);
  if (R.favour) out.push(`白鹭好感 +${R.favour}`);
  return out.join(" · ");
}
