// 储物袋 / 仓库 操作卡顿测量（性能工程）：
//   node tools/run.mjs perf_bag "scene=run&region=r1&slot=4"
// 局内储物袋（侧挂纸笺）塞满（含未鉴定、多品级、锦囊、护身格、脚下物品）后，用 page.mouse 真实地做每种操作各 N 次；
// 再测搜取窗口取物 / F 全取、拾取入袋那一帧；最后进洞府调试页，仓库（博古架）放 ~120 件，测点选 / 分页 / 拖拽调序 / 装备 / 卸下 / 批量化灵选取 / 归置。
//
// 口径（每次操作 = 从输入事件到"下一帧画完"的主线程忙碌时间，扣掉游戏本来每帧就要做的事）：
//   · 输入任务：window 捕获阶段记 t0，MessageChannel 回调记结束（事件分发 + 微任务）；与帧重叠的部分扣掉
//   · 帧：主循环 JS（包住 ctx.input.update → input.endFrame）+ 样式 / 布局 / 绘制（本探针的 rAF 回调 → 紧随其后的 MessageChannel 回调）
//   · 每帧忙碌 = 主循环 + 样式布局绘制 + 归到这一帧之前的输入任务；操作耗时 = 窗口内最忙那一帧 − 空闲帧忙碌中位数（基线）
//   · 不用 rAF 间隔 / Event Timing duration：无头 Chromium 帧间隔锁 ~31ms，会把垂直同步的等待算进去
// 预算（docs/性能优化_v1.md §7、docs/knowledge/性能工程/方法论.md §1）：60 帧 = 16.7ms/帧；目标机是普通笔记本（CPU 约为本机 i7-10700K 的一半）
//   → 默认 CPU=2（CDP 降速一倍）下：单次操作 p95 ≤ 16ms（这一帧最多多掉 1 帧）、max ≤ 33ms（最多掉 2 帧，远低于 50ms 长任务线）；
//     拖拽中每帧（连续操作，和主循环 8ms 预算同帧）p95 ≤ 4ms、max ≤ 8ms；打开纸笺（Tab，一次性整页构建）p95 ≤ 33ms。
// 环境变量：CPU=1|2|4（默认 2）、N=每种操作次数（默认 8）、TAG=结果名（work/perf/bag_<TAG>.json）、PROFILE=1（每组操作 CDP CPU 采样，按函数自身耗时排行）
//          ONLY=run|cave（只测一边）
import fs from "node:fs";

const ok = (cond, msg, extra) => (console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : "")), cond);
const CPU = Number(process.env.CPU ?? 2), N = Number(process.env.N || 8), TAG = process.env.TAG || "cur", PROF = !!process.env.PROFILE, ONLY = process.env.ONLY || "";
const B_OP = { p95: 16, max: 33 }, B_MOVE = { p95: 4, max: 8 }, B_OPEN = { p95: 33, max: 50 };

const VITE_CLIENT_STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); s.setAttribute("data-vite-dev-id", id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

// ---------------- 页面内探针 ----------------
function installProbe(where) {
  const ctx = where === "cave" ? window.__cdev.ctx : window.__game.ctx;
  const now = () => performance.now();
  const post = (cb) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => cb();
    ch.port2.postMessage(0);
  };
  const M = (window.__pb = { rec: !1, frames: [], tasks: [], last: null, now });
  const inp = ctx.input, iu = inp.update, ie = inp.endFrame;
  let cur = null;
  inp.update = function (...a) {
    cur = { t0: now() };
    return iu.apply(this, a);
  };
  inp.endFrame = function (...a) {
    const r = ie.apply(this, a);
    if (cur) (cur.loop = now() - cur.t0), (M.last = cur), (cur = null);
    return r;
  };
  // 本探针的 rAF 在主循环之后注册 → 每帧排在主循环之后；回调里投递的消息在本帧样式 / 布局 / 绘制之后才执行
  const tick = () => {
    const tr = now(), f = M.last;
    M.last = null;
    post(() => {
      const e = now();
      if (M.rec) M.frames.push({ t0: f ? f.t0 : tr, loop: f ? f.loop : 0, tr, render: e - tr, end: e });
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  let open = null;
  for (const ty of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "contextmenu", "pointermove", "mousemove", "keydown", "keyup", "dragstart", "dragenter", "dragover", "dragleave", "drop", "dragend"])
    addEventListener(
      ty,
      () => {
        if (!M.rec || open) return;
        open = { ty, t: now() };
        post(() => (M.tasks.push({ ty: open.ty, t: open.t, end: now() }), (open = null)));
      },
      !0,
    );
  // 程序触发的操作（拾取入袋等没有输入事件的）：同步部分自己计时
  M.run = (fn) => {
    const t = now();
    try {
      return fn();
    } finally {
      M.tasks.push({ ty: "eval", t, end: now() });
    }
  };
  M.xy = (sel) => {
    const e = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  return !0;
}

// ---------------- 统计 ----------------
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const r1 = (x) => Math.round(x * 10) / 10;
function analyze(M, a, b, base) {
  const frames = M.frames.filter((f) => f.end > a && f.t0 < b);
  const tasks = M.tasks.filter((t) => t.t >= a && t.t < b);
  const hd = (t) => {
    let d = t.end - t.t;
    if (t.ty !== "eval") for (const f of M.frames) { const o = Math.min(t.end, f.end) - Math.max(t.t, f.t0); if (o > 0) d -= o; }
    return Math.max(0, d);
  };
  const busy = frames.map((f) => f.loop + f.render), extra = frames.map(() => 0);
  let orphan = 0, handlers = 0;
  for (const t of tasks) {
    const d = hd(t);
    handlers += d;
    const i = frames.findIndex((f) => f.t0 >= t.t - 0.01);
    if (i < 0) orphan += d;
    else extra[i] += d;
  }
  let worst = orphan, wi = -1;
  for (let i = 0; i < frames.length; i++) if (busy[i] + extra[i] - base > worst) (worst = busy[i] + extra[i] - base), (wi = i);
  const wf = frames[wi];
  return { cost: Math.max(0, worst), handlers, render: wf ? wf.render : 0, loop: wf ? wf.loop : 0, nTasks: tasks.length, nFrames: frames.length, perFrame: frames.map((f, i) => Math.max(0, busy[i] + extra[i] - base)) };
}

export default async function (page, c) {
  const cdp = await page.context().newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const out = { cpu: CPU, n: N, tag: TAG, at: new Date().toISOString(), ops: {} };
  const results = out.ops;
  let base = 0;
  // 采样
  const prof = async (on, name) => {
    if (!PROF) return;
    if (on) return void (await cdp.send("Profiler.enable"), await cdp.send("Profiler.setSamplingInterval", { interval: 100 }), await cdp.send("Profiler.start"));
    const { profile } = await cdp.send("Profiler.stop");
    const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const tot = dt.reduce((x, y) => x + y, 0);
    for (let i = 0; i < profile.samples.length; i++) {
      const cf = byId.get(profile.samples[i]).callFrame;
      const k = `${cf.functionName || "(anon)"} ${(cf.url || "").replace(/^.*\/(src|node_modules)\//, "$1/").replace(/\?.*$/, "")}:${cf.lineNumber + 1}`;
      self.set(k, (self.get(k) || 0) + (dt[i] || 0));
    }
    const top = [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 18).map(([k, v]) => `${((v / 1000)).toFixed(1)}ms ${k}`);
    c.log(`PROFILE ${name} (total ${(tot / 1000).toFixed(0)}ms, idle ${(((self.get("(idle) :0") || 0) / tot) * 100).toFixed(0)}%):\n    ` + top.join("\n    "));
  };
  const rec = (on) => c.ev((on) => ((__pb.rec = on), on && ((__pb.frames = []), (__pb.tasks = []))), on);
  const baseline = async (ms = 1500) => {
    await rec(!0);
    await c.wait(ms);
    const fr = await c.ev(() => __pb.frames.map((f) => f.loop + f.render));
    await rec(!1);
    base = pct(fr, 0.5);
    return { base: r1(base), p95: r1(pct(fr, 0.95)), frames: fr.length };
  };
  // 一种操作做 n 次：prep（不计时，返回坐标等）→ act（计时窗口）→ after（不计时，复原）
  const group = async (key, label, n, { prep, act, after, settle = 180, budget = B_OP, perFrame = !1 }) => {
    const list = [], frames = [];
    await prof(!0);
    for (let i = 0; i < n; i++) {
      const arg = prep ? await prep(i) : null;
      if (prep && arg == null) {
        c.log(`  WARN ${label} #${i}: 准备失败，跳过`);
        continue;
      }
      await c.wait(90);
      await rec(!0);
      const a = await c.ev(() => performance.now());
      const win = await act(arg, i);
      await c.wait(settle);
      const b = await c.ev(() => performance.now());
      const M = await c.ev(() => ({ frames: __pb.frames, tasks: __pb.tasks }));
      await rec(!1);
      const wa = win && win.a != null ? win.a : a, wb = win && win.b != null ? win.b : b;
      const r = analyze(M, wa, wb, base);
      list.push(r);
      if (perFrame) frames.push(...r.perFrame);
      if (after) await after(arg, i);
    }
    await prof(!1, label);
    const costs = list.map((r) => r.cost), src = perFrame ? frames : costs;
    const s = { n: list.length, p50: r1(pct(src, 0.5)), p95: r1(pct(src, 0.95)), max: r1(Math.max(0, ...src)), handlers: r1(pct(list.map((r) => r.handlers), 0.5)), render: r1(pct(list.map((r) => r.render), 0.5)), worst: list.map((r) => r1(r.cost)) };
    results[key] = { label, ...s };
    c.log(`OP ${key.padEnd(18)} ${label}: n ${s.n} p50 ${s.p50} p95 ${s.p95} max ${s.max} ms（输入任务中位 ${s.handlers}、样式布局绘制中位 ${s.render}）${perFrame ? "［每帧］" : ""}`);
    ok(s.n > 0 && s.p95 <= budget.p95 && s.max <= budget.max, `${label}：p95 ${s.p95}ms ≤ ${budget.p95}、max ${s.max}ms ≤ ${budget.max}`, { p50: s.p50, n: s.n });
    return s;
  };
  // 拖拽：down → 移过去（计每帧）→ up（计放下那一帧）
  const drag = async (from, to, keyMove) => {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + 8, from[1] + 6, { steps: 2 });
    const a = await c.ev(() => performance.now());
    await page.mouse.move(...to, { steps: 10 });
    const m = await c.ev(() => performance.now());
    if (keyMove) keyMove.push([a, m]);
    await c.wait(40);
    const u = await c.ev(() => performance.now());
    await page.mouse.up();
    return { a: u };
  };

  // =====================================================================
  //                          一、局内储物袋
  // =====================================================================
  if (ONLY !== "cave") {
    await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready, null, { timeout: 120000 });
    await page.mouse.move(300, 560);
    await c.wait(1200);
    await c.ev(async () => {
      const G = (window.__bt = {});
      const r = __game.run;
      G.items = await import("/src/core/items.js");
      G.loot = await import("/src/game/loot.js");
      for (const k of ["gather", "tide", "move", "pills", "talisman", "channel", "bagfull", "unid", "pouch", "lingzhi", "pillBag", "identify"]) r.profile.flags["hint_" + k] = 1;
      G.calm = () => {
        r.clearEnemies();
        r.nextWave = 1e9;
        r.hintT = 99;
        const h = __game.player.entity;
        h.hp = h.stats.get("hp");
        document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
      };
      G.calm();
      const mk = (G.mk = (id, o = {}) => G.items.makeItem(id, o));
      const gear = (G.gear = (id, q, lv, o = {}) => G.loot.makeGear(id, q, lv, { identified: !0, ...o }));
      r.bag.capacity = 32;
      r.bag.clear();
      const list = [
        mk("zhuxin", { rarity: 3 }), gear("sword_qingfeng", 2, 3), gear("robe_lingsi", 1, 2), gear("jade_shuiling", 2, 2, { identified: !1 }), gear("sword_qingfeng", 3, 4, { identified: !1 }),
        mk("spirit_stone", { n: 22 }), mk("qingling_cao", { n: 8 }), mk("ninglu_hua", { n: 5 }), mk("chiyan_guo", { n: 3, rarity: 1 }), mk("hanlu_cao", { n: 4 }),
        mk("tiejing_shi", { n: 3 }), mk("wolf_fang", { n: 6 }), mk("wolf_core", { n: 2, rarity: 1 }), mk("ling_yu", { n: 4, rarity: 1 }), mk("seed_qingling", { n: 2 }),
        mk("huichun_dan", { n: 9 }), mk("bat_wing", { n: 2 }), mk("fu_fire", { n: 2 }), mk("wolf_core", { n: 1, rarity: 2 }), mk("zhuxin", { rarity: 4 }),
      ];
      for (const it of list) r.bag.add(it);
      for (let k = 0; k < 40 && r.bag.free > 3; k++) r.bag.add(mk("spirit_orb_shard", { rarity: k % 3 }));
      r.pouch.capacity = 4;
      r.pouch.clear();
      r.pouch.add(mk("lingbang_zhu", { rarity: 2 }));
      r.keyItems.length = 0;
      r.keyItems.push(mk("bilin_core", { rarity: 3 }), mk("danfang_zhuji", { rarity: 2 }));
      const P = r.profile;
      P.equip.sword = gear("rust_sword", 0, 1);
      P.equip.robe = gear("robe_bu", 0, 2);
      P.equip.jade = gear("jade_qing", 1, 2);
      r.applyEquip();
      // 脚下两件（不会被自动捡回）
      for (const it of [mk("wolf_hide", { n: 1 }), mk("tiejing_shi", { n: 2, rarity: 1 })]) r.pickups.drop(__game.player.pos, it, 0.6).age = -1e9;
      r.emit("bag");
      // 小工具
      const tokOf = (it) => it && document.querySelector(`.mk-bagui .mk-tok[data-uid="${it.uid}"]`);
      G.tok = (pred, where = ".bv-grid") => {
        const it = r.bag.items.find(pred);
        const e = it && document.querySelector(`.mk-bagui ${where} .mk-tok[data-uid="${it.uid}"]`);
        return e ? __pb.xy(e) : null;
      };
      G.tokOf = (it) => (tokOf(it) ? __pb.xy(tokOf(it)) : null);
      G.slotOf = (it) => { const d = G.items.defOf(it) || {}; return d.slot || (d.gear && d.gear.slot); };
      G.room = (k) => {
        const J = ["spirit_orb_shard", "bat_wing", "wolf_fang", "qingling_cao", "ling_yu", "wolf_core", "tiejing_shi", "hanlu_cao", "ninglu_hua", "chiyan_guo", "seed_qingling"];
        for (let j = 0; j < 60 && r.bag.free < k; j++) { const x = r.bag.items.findLast((i) => J.includes(i.id)); if (!x) break; r.bag.remove(x.uid); }
      };
      G.keep = () => {
        // 复原：袋子保持"差 3 格满"，地上只留最初两件
        for (const p of [...r.pickups.list]) if (p.age > -1e8) r.pickups.remove(p);
        while (r.bag.free > 3) r.bag.add(mk("spirit_orb_shard", { rarity: (Math.random() * 3) | 0 }));
        while (r.bag.free < 3) { const j = r.bag.items.findLast((i) => i.id === "spirit_orb_shard"); if (!j) break; r.bag.remove(j.uid); }
        G.calm();
      };
      G.keep();
    });
    await c.ev(installProbe, "run");
    await page.keyboard.press("Tab");
    await c.wait(600);
    const st = await c.ev(() => ({ open: __bt && !document.querySelector(".mk-layer-bag").classList.contains("hidden"), toks: document.querySelectorAll(".mk-bagui .mk-tok").length, used: __game.run.bag.used, cap: __game.run.bag.capacity, unid: document.querySelectorAll(".mk-bagui .bv-grid .is-unid").length, ground: document.querySelectorAll(".mk-bagui .bv-ground .mk-tok").length }));
    ok(st.open && st.toks >= 24 && st.unid >= 2 && st.ground >= 1, "测量场景：纸笺打开、袋子近满（含未鉴定、多品级、锦囊、护身格、脚下）", st);
    c.log("BASE run(纸笺开着) " + JSON.stringify(await baseline()));

    // 1. 点选
    await group("select", "局内·点选", N, {
      prep: (i) => c.ev((i) => { const L = __game.run.bag.items; return __bt.tokOf(L[(i * 5 + 2) % L.length]); }, i),
      act: (xy) => page.mouse.click(...xy),
    });
    // 2. 双击装备（衣：两件来回换）
    await group("dbl_equip", "局内·双击装备", N, {
      prep: () => c.ev(() => __bt.tok((it) => __bt.slotOf(it) === "robe" && it.identified !== !1)),
      act: (xy) => page.mouse.dblclick(...xy),
      after: () => c.ev(() => __bt.keep()),
    });
    // 3. 双击服用（回春丹；每次先清冷却、掉点血）
    await group("dbl_use", "局内·双击服用", N, {
      prep: () => c.ev(() => {
        const r = __game.run, S = __game.ctx.skills;
        if (S && S.cd) S.cd.pot1 = 0;
        const h = __game.player.entity;
        h.hp = Math.max(1, h.hp * 0.6);
        if (r.bag.count("huichun_dan") < 2) r.bag.add(__bt.mk("huichun_dan", { n: 6 }));
        return __bt.tok((it) => it.id === "huichun_dan");
      }),
      act: (xy) => page.mouse.dblclick(...xy),
      after: () => c.ev(() => __bt.keep()),
    });
    // 4. 双击拾取（脚下）
    await group("dbl_pick", "局内·双击拾取", N, {
      prep: async () => {
        await c.ev(() => {
          const r = __game.run;
          r.pickups.drop(__game.player.pos, __bt.mk("wolf_fang", { n: 1, rarity: 1 }), 0.5).age = -99;
        });
        await c.wait(650); // 纸笺每 0.5 秒看一次脚下
        return c.ev(() => {
          const e = [...document.querySelectorAll(".mk-bagui .bv-ground .mk-tok")].find((t) => t._inst && t._inst.id === "wolf_fang");
          return e ? __pb.xy(e) : null;
        });
      },
      act: (xy) => page.mouse.dblclick(...xy),
      after: () => c.ev(() => __bt.keep()),
    });
    // 5. 双击取出（锦囊）
    await group("dbl_pouch", "局内·双击取出（锦囊）", N, {
      prep: async () => {
        await c.ev(() => {
          const r = __game.run;
          if (r.pouch.items.length < 2) r.pouch.add(__bt.mk("ling_yu", { n: 1, rarity: 2 }));
        });
        await c.wait(80);
        return c.ev(() => { const it = __game.run.pouch.items[__game.run.pouch.items.length - 1]; return __bt.tokOf(it); });
      },
      act: (xy) => page.mouse.dblclick(...xy),
      after: () => c.ev(() => __bt.keep()),
    });
    // 6. 右键丢弃
    // 丢弃对象：一件凡品（品级 ≥ 灵 / 宝会弹确认）
    const junk = async () => {
      await c.ev(() => (__bt.room(2), __game.run.bag.add(__bt.mk("bat_wing", { n: 1, rarity: 0 }))));
      await c.wait(80);
      return c.ev(() => __bt.tok((it) => it.id === "bat_wing" && !it.rarity));
    };
    await group("rclick_drop", "局内·右键丢弃", N, {
      prep: junk,
      act: (xy) => page.mouse.click(...xy, { button: "right" }),
      after: () => c.ev(() => __bt.keep()),
    });
    // 7. 拖拽整理（拖到别的物品前）
    const moves = [];
    await group("drag_sort", "局内·拖拽整理", N, {
      prep: (i) => c.ev((i) => { const L = __game.run.bag.items; return [__bt.tokOf(L[L.length - 1 - (i % 4)]), __bt.tokOf(L[1 + (i % 5)])]; }, i),
      act: ([a, b]) => drag(a, b, moves),
    });
    // 8. 拖拽换装（拖到装备位）
    await group("drag_equip", "局内·拖拽换装", N, {
      prep: () => c.ev(() => { const a = __bt.tok((it) => __bt.slotOf(it) === "sword" && it.identified !== !1), b = __pb.xy('.mk-bagui .bv-slot[data-drop="equip:sword"]'); return a && b ? [a, b] : null; }),
      act: ([a, b]) => drag(a, b, moves),
      after: () => c.ev(() => __bt.keep()),
    });
    // 9. 拖出纸笺丢弃
    await group("drag_out", "局内·拖出丢弃", N, {
      prep: async () => { const a = await junk(); return a ? [a, [260, 380]] : null; },
      act: ([a, b]) => drag(a, b, moves),
      after: () => c.ev(() => __bt.keep()),
    });
    // 10. 拖入锦囊（放下那一帧）+ 1 秒后收进锦囊那一帧
    await group("drag_pouch", "局内·拖入锦囊", Math.min(N, 6), {
      prep: async () => {
        await c.ev(() => { const r = __game.run; for (const it of r.pouch.items.slice(1)) r.pouch.remove(it.uid); __bt.room(2); r.bag.add(__bt.mk("bat_wing", { n: 1, rarity: 0 })); });
        await c.wait(80);
        const r = await c.ev(() => { const a = __bt.tok((it) => it.id === "bat_wing" && !it.rarity), b = __pb.xy(".mk-bagui .bv-safe .pouch"); return a && b ? [a, b] : { a, b, pouch: __game.run.pouch.items.length, wc: __game.run.bag.items.filter((i) => i.id === "wolf_core").map((i) => i.rarity), free: __game.run.bag.free }; });
        if (!Array.isArray(r)) return void c.log("  WARN 拖入锦囊准备 " + JSON.stringify(r));
        return r;
      },
      act: ([a, b]) => drag(a, b, moves),
      settle: 1500,
      after: () => c.ev(() => __bt.keep()),
    });
    // 拖拽中每帧
    {
      const M2 = [];
      // 再拖几次只为量"拖着走"的每帧开销
      for (let i = 0; i < N; i++) {
        const [a, b] = await c.ev((i) => { const L = __game.run.bag.items; return [__bt.tokOf(L[(i * 3) % L.length]), __bt.tokOf(L[(i * 7 + 4) % L.length])]; }, i);
        await page.mouse.move(...a);
        await page.mouse.down();
        await page.mouse.move(a[0] + 8, a[1] + 6, { steps: 2 });
        await c.wait(60);
        await rec(!0);
        const t0 = await c.ev(() => performance.now());
        // 来回划过整张纸笺（跨过格子、装备位、锦囊）
        await page.mouse.move(b[0], b[1], { steps: 12 });
        await page.mouse.move(a[0] - 120, a[1] + 200, { steps: 12 });
        await page.mouse.move(b[0], b[1], { steps: 12 });
        const t1 = await c.ev(() => performance.now());
        const M = await c.ev(() => ({ frames: __pb.frames, tasks: __pb.tasks }));
        await rec(!1);
        M2.push(...analyze(M, t0, t1, base).perFrame);
        await page.keyboard.press("Escape").catch(() => {});
        await page.mouse.move(a[0], a[1]);
        await page.mouse.up();
        await c.wait(120);
        await c.ev(() => __bt.keep());
        // Esc 可能合上了纸笺：重新打开
        if (await c.ev(() => document.querySelector(".mk-layer-bag").classList.contains("hidden"))) await page.keyboard.press("Tab"), await c.wait(300);
      }
      const s = { n: M2.length, p50: r1(pct(M2, 0.5)), p95: r1(pct(M2, 0.95)), max: r1(Math.max(0, ...M2)) };
      results.drag_move = { label: "局内·拖拽中（每帧）", ...s };
      c.log(`OP drag_move          局内·拖拽中（每帧）: frames ${s.n} p50 ${s.p50} p95 ${s.p95} max ${s.max} ms`);
      ok(s.n > 10 && s.p95 <= B_MOVE.p95 && s.max <= B_MOVE.max, `局内·拖拽中每帧：p95 ${s.p95}ms ≤ ${B_MOVE.p95}、max ${s.max}ms ≤ ${B_MOVE.max}`, { p50: s.p50, frames: s.n });
    }
    // 11. Tab 打开纸笺（整页构建）
    await group("tab_open", "局内·Tab 打开纸笺", N, {
      prep: async () => {
        if (!(await c.ev(() => document.querySelector(".mk-layer-bag").classList.contains("hidden")))) await page.keyboard.press("Tab");
        await c.wait(120);
        return 1;
      },
      act: () => page.keyboard.press("Tab"),
      budget: B_OPEN,
    });

    // ---------------- 搜取窗口取物 / 拾取入袋 ----------------
    const stash = (n) => c.ev((n) => {
      const r = __game.run, C = r.containers, mk = __bt.mk;
      if (C.openC) C.close("test");
      const ids = ["wolf_fang", "qingling_cao", "tiejing_shi", "ling_yu", "wolf_core", "bat_wing", "hanlu_cao", "chiyan_guo"];
      const items = Array.from({ length: n }, (_, k) => mk(ids[k % ids.length], { n: 1, rarity: k % 4 }));
      const p = __game.player.pos.clone();
      p.x += 0.8;
      const cc = (__bt.cc = C.create({ kind: "cache", pos: p, items, label: "遗物" }));
      C.open(cc);
      for (let i = 0; i < cc.slots.length; i++) { const s = cc.slots[i]; (s.state = "shown"), (s.need = s.t = 0), C.emit("reveal", { c: cc, i, slot: s, inst: s.inst, rarity: s.inst.rarity || 0 }); }
      return cc.slots.length;
    }, n);
    const roomFor = (k) => c.ev((k) => {
      __bt.room(k);
      __bt.calm();
    }, k);
    const bagOpen = async (on) => {
      const isOn = await c.ev(() => !document.querySelector(".mk-layer-bag").classList.contains("hidden"));
      if (isOn !== on) await page.keyboard.press("Tab"), await c.wait(200);
    };
    for (const withBag of [!1, !0]) {
      const sfx = withBag ? "（纸笺开着）" : "";
      await bagOpen(withBag);
      await roomFor(12);
      await stash(8);
      await c.wait(500);
      let k = 0;
      await group("loot_take" + (withBag ? "_bag" : ""), "搜取·点格取物" + sfx, 6, {
        prep: () => c.ev((k) => { const e = document.querySelector(`.mk-loot .lw-cell[data-i="${k}"]`); if (!e) return null; const xy = __pb.xy(e); const hit = document.elementFromPoint(...xy); return hit && e.contains(hit) ? xy : null; }, k++),
        act: (xy) => page.mouse.click(...xy),
      });
      await roomFor(12);
      await group("loot_all" + (withBag ? "_bag" : ""), "搜取·F 全取" + sfx, 4, {
        prep: async () => { await roomFor(10); await stash(8); await c.wait(400); return 1; },
        act: () => page.keyboard.press("f"),
        after: () => c.ev(() => __bt.keep()),
      });
      // 按 F 取地上物品那一帧（run.takeGround → collect：逐件入袋 → onPickup：飞入动效、拾得列表、提示、纸笺刷新）
      await group("pickup" + (withBag ? "_bag" : ""), "F 取地上物品（3 件）" + sfx, N, {
        prep: async (i) => {
          await roomFor(6);
          await c.ev((i) => {
            const r = __game.run, C = r.containers;
            if (C.openC) C.close("test");
            for (const cc of [...C.list]) if (cc.kind === "cache") C.remove(cc);
            for (const p of [...r.pickups.list]) r.pickups.remove(p);
            const ids = ["wolf_fang", "qingling_cao", "ling_yu", "wolf_core", "tiejing_shi"];
            for (let k = 0; k < 3; k++) r.pickups.drop(__game.player.pos, __bt.mk(ids[(i + k) % ids.length], { n: 1, rarity: (i + k) % 4 }), 0.4);
            __bt.g0 = r.pickups.list.length;
          }, i);
          await c.wait(350);
          return 1;
        },
        act: () => page.keyboard.press("f"),
        after: async () => {
          const left = await c.ev(() => __game.run.pickups.list.length);
          if (left) c.log("  WARN F 后地上还剩 " + left + " 件（交互目标不是地上物品？）" + JSON.stringify(await c.ev(() => { const r = __game.run, m = r.nearestMark && r.nearestMark(); return { st: r.state, m: m && m.kind, lab: m && m.label, open: !!r.containers.openC, free: r.bag.free, near: r.pickups.near(__game.player.pos).length }; })));
          await c.ev(() => __bt.keep());
        },
      });
      // 采集直接入袋那一帧（gather:done → run.onGathered → collect；GatherUI 拔草 / 盖印 / 飞入）
      await group("gather" + (withBag ? "_bag" : ""), "采集入袋" + sfx, N, {
        prep: async () => (await roomFor(6), 1),
        act: async (_, i) => {
          const a = await c.ev(() => performance.now());
          await c.ev((i) => __pb.run(() => {
            const p = __game.player.pos.clone();
            p.x += 1;
            __game.ctx.world.events.emit("gather:done", { pos: p, items: [{ id: ["qingling_cao", "ninglu_hua", "hanlu_cao"][i % 3], n: 2, rarity: i % 3 }], kind: "herb" });
          }), i);
          return { a };
        },
        after: () => c.ev(() => __bt.keep()),
      });
    }
    await bagOpen(!1);
  }

  // =====================================================================
  //                          二、洞府仓库（博古架）
  // =====================================================================
  if (ONLY !== "run") {
    await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: VITE_CLIENT_STUB }));
    const base0 = page.url().replace(/\/(\?.*)?$/, "").replace(/\/src\/.*$/, "");
    await page.goto(`${base0}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active && !document.querySelector(".cv-loading"), null, { timeout: 120000 });
    await c.wait(800);
    const nItems = await c.ev(async () => {
      const cv = window.__cave, p = cv.p;
      const I = await import("/src/core/items.js"), L = await import("/src/game/loot.js");
      window.__ct = { I, L };
      const ids = Object.keys(I.ITEMS).filter((id) => { const d = I.ITEMS[id]; return d && !["quest", "stone"].includes(d.cat); });
      const gearIds = ids.filter((id) => I.ITEMS[id].cat === "gear");
      let k = 0;
      for (const id of ids) { if (p.storage.items.length >= 120) break; const d = I.ITEMS[id]; try { const it = d.cat === "gear" ? L.makeGear(id, k % 5, 1 + (k % 4), { identified: k % 3 !== 0 }) : I.makeItem(id, { n: 1 + (k % 4), rarity: k % 5 }); p.storage.add(it); } catch {} k++; }
      for (let j = 0; p.storage.items.length < 120 && j < 200; j++) { const id = gearIds[j % gearIds.length]; try { p.storage.add(L.makeGear(id, j % 5, 1 + (j % 3), { identified: j % 2 === 0 })); } catch {} }
      cv.changed({ silent: !0 });
      return p.storage.items.length;
    });
    await c.ev(installProbe, "cave");
    await c.ev(() => window.__cave.open("storage"));
    await page.waitForSelector(".cv-page[data-id=storage]");
    await c.wait(900);
    const st2 = await c.ev(() => ({ toks: document.querySelectorAll(".cv-page .bg-grid .mk-tok").length, hold: !!window.__cdev.ctx.hold3d }));
    ok(st2.toks >= 100, "测量场景：仓库博古架上架 ≥100 件", { items: nItems, ...st2 });
    c.log("BASE cave(仓库开着) " + JSON.stringify(await baseline()));
    const ctok = (pred) => c.ev((src) => {
      const f = new Function("it", "d", "return " + src);
      const e = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok")].find((t) => f(t._inst, window.__ct.I.defOf(t._inst) || {}));
      if (!e) return null;
      e.scrollIntoView({ block: "nearest" });
      return __pb.xy(e);
    }, pred);
    await group("cv_select", "仓库·点选", N, {
      prep: (i) => c.ev((i) => { const L = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok")]; const e = L[(i * 7 + 3) % Math.min(L.length, 30)]; return e ? __pb.xy(e) : null; }, i),
      act: (xy) => page.mouse.click(...xy),
    });
    const tabs = ["gear", "mat", "pill", "scroll", "all"];
    await group("cv_tab", "仓库·切分类页签", N, {
      prep: (i) => c.ev((k) => __pb.xy(`.cv-page .bg-plaque .ink-tab[data-tab="${k}"]`), tabs[i % tabs.length]),
      act: (xy) => page.mouse.click(...xy),
    });
    await c.ev(() => { const ui = window.__cave.ui; ui.tab = "all"; ui.render(); });
    await c.wait(300);
    await group("cv_drag", "仓库·拖拽调序", Math.min(N, 6), {
      prep: async (i) => {
        const a = await c.ev((i) => { const L = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok")]; return __pb.xy(L[8 + i]); }, i);
        const b = await c.ev((i) => { const L = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok")]; return __pb.xy(L[1 + (i % 3)]); }, i);
        return a && b ? [a, b] : null;
      },
      act: ([a, b]) => drag(a, b),
      settle: 250,
    });
    await group("cv_equip", "仓库·装备", Math.min(N, 6), {
      prep: async () => {
        const xy = await ctok("d.cat === 'gear' && it.identified !== false");
        if (!xy) return null;
        await page.mouse.click(...xy);
        await c.wait(150);
        return c.ev(() => __pb.xy('.cv-page .st-detail [data-act="equip"]'));
      },
      act: (xy) => page.mouse.click(...xy),
    });
    await group("cv_unequip", "仓库·卸下", Math.min(N, 4), {
      prep: async () => {
        const xy = await c.ev(() => { const k = Object.keys(window.__cave.p.equip).find((s) => window.__cave.p.equip[s]); return k ? __pb.xy(`.cv-page .equip [data-slot="${k}"]`) : null; });
        if (!xy) return null;
        await page.mouse.click(...xy);
        await c.wait(150);
        return c.ev(() => __pb.xy('.cv-page .st-detail [data-act="unequip"]'));
      },
      act: (xy) => page.mouse.click(...xy),
    });
    // 批量化灵：逐个点选
    await c.ev(() => document.querySelector('.cv-page [data-act="multi"]').click());
    await c.wait(200);
    await group("cv_multi", "仓库·批量化灵点选", N, {
      prep: (i) => c.ev((i) => { const L = [...document.querySelectorAll(".cv-page .bg-grid .mk-tok:not(.is-disabled)")]; return L[i] ? __pb.xy(L[i]) : null; }, i),
      act: (xy) => page.mouse.click(...xy),
    });
    await c.ev(() => document.querySelector('.cv-page [data-act="multi"]').click());
    await c.wait(200);
    await group("cv_tidy", "仓库·归置（R）", Math.min(N, 4), {
      act: () => page.keyboard.press("r"),
      settle: 300,
      budget: B_OPEN,
    });
  }

  fs.mkdirSync("work/perf", { recursive: !0 });
  const f = `work/perf/bag_${TAG}.json`;
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
  c.log("saved " + f);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
}
