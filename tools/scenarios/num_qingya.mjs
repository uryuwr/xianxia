// 青牙 v2 成长档位实测（docs/design/boss_青牙_v2.md §6.3、§10.2 第 8 项）：在狼谷里打真正的青牙（控制器、石柱、图腾、月光、处决全在）。
// 每次试验重新载入页面（石柱撞断、图腾倒下不能复位），主角不无敌（致命一击记为"阵亡"并停止），带回春丹 3、回气丹（练二起 3）、开场满势。
// 用法：
//   node tools/run.mjs num_qingya "scene=run&region=r1&levels=2,3&bots=masher,dodger,skilled&trials=2&tag=a"
//   variant=stats：属性与装备照常，但锁在 T1 工具箱（只有剑气斩、无心法、无法宝、1 次闪身）——用于"数值 / 解锁 / 操作"三分归因
// 机器人：
//   masher（莽）：按住左键追着打，法术冷却好就放，满势右键；从不闪避；不会处决（6 秒后自动短版）
//   dodger（闪）：同上 + 七成预警在出手前闪开 + 威折倒地时按 F 处决
//   skilled（熟）：同上（九成、卡在出手前 0.1 秒闪）+ 读条打断（满势斩 / 剑气斩 / 寒冰锥）+ 站柱后引冲撞柱 + 二阶段绕背 + 站月光 + 留寒冰锥打啸月
// 结果：work/num_qingya_<tag>.json；控制台逐次输出。
import fs from "node:fs";
import path from "node:path";

function preset(L, variant, wr) {
  const zj = L >= 10, lay = zj ? 9 : L;
  const gear = lay <= 4
    ? { sword: lay <= 1 ? ["rust_sword", 1, 0] : ["sword_qingfeng", lay, lay >= 3 ? 1 : 0], ...(lay >= 3 ? { robe: ["robe_bu", lay, lay >= 4 ? 1 : 0] } : {}) }
    : { sword: ["sword_zhuying", lay, lay >= 7 ? 2 : 1], robe: ["robe_lingsi", lay, lay >= 7 ? 2 : 1], jade: ["jade_shuiling", lay, lay >= 8 ? 1 : 0] };
  const full = { spells: ["sword_qi", ...(lay >= 3 ? ["vine"] : []), ...(lay >= 7 ? ["frost"] : [])], xinfa: lay >= 4 ? ["sharp"] : [], artifact: lay >= 7 ? "art_flying_sword" : null, dash: null };
  const t1 = { spells: ["sword_qi"], xinfa: [], artifact: null, dash: 1 };
  // wr：武器品级（0 凡 / 1 灵 / 2 宝 / 3 仙）→ 剑用 makeGear 按掉落规则生成（带随机词条，仙品带特殊词条），等级 = 层数
  const sw = wr == null ? null : { id: gear.sword[0] === "rust_sword" ? "sword_qingfeng" : gear.sword[0], level: lay, rarity: wr };
  return { L, wr, label: (zj ? "筑基" : `练气${"一二三四五六七八九"[L - 1]}层`) + (wr == null ? "" : "·" + "凡灵宝仙"[wr] + "剑") + (variant === "stats" ? "·只有数值" : ""), realm: zj ? [2, 1] : [1, L], gear, sw, ...(variant === "stats" ? t1 : full) };
}

export default async function (page, c) {
  const url = new URL(page.url());
  const base = url.origin, q = url.searchParams;
  const levels = (q.get("levels") || "2,3,4,5,6,7,9,10").split(",").map(Number);
  const bots = (q.get("bots") || "masher,dodger,skilled").split(",");
  const trials = Number(q.get("trials") || 2), timeout = Number(q.get("timeout") || 240), variant = q.get("variant") || "full";
  const wrs = q.get("wr") ? q.get("wr").split(",").map(Number) : [null];
  const intr = q.get("intr") || "bot"; // bot：熟才打断；always：所有机器人都打断读条；never：谁都不打断
  const rows = [];
  for (const L of levels)
   for (const wr of wrs)
    for (const bot of bots)
      for (let k = 0; k < trials; k++) {
        await page.evaluate(() => localStorage.clear());
        await page.goto(`${base}/?scene=run&region=r1&slot=7`, { waitUntil: "commit", timeout: 90000 });
        await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 150000 });
        await c.wait(800);
        let r;
        try {
          r = await c.ev(runTrial, { pre: preset(L, variant, wr), bot, timeout, intr });
        } catch (e) {
          r = { error: String(e).slice(0, 300) };
        }
        r = { L, wr, intr, bot, variant, k, ...r };
        rows.push(r);
        const pc = (v) => (v == null ? "-" : Math.round(v * 100) + "%");
        console.log(
          `${(r.label || L + "").padEnd(14)} ${bot.padEnd(7)} #${k} ${r.error ? "ERR " + r.error : `${r.result.padEnd(4)} ${r.sec}s 青牙剩 ${pc(r.bossLeft)} 阶段 ${r.phase} 掉血 ${pc(r.lost)} 丹 ${r.pots} | 斩占 ${pc(r.share.charge)} 窗口 ${pc(r.window)} | 威折 ${r.n.break} 撞柱 ${r.n.crash} 打断 ${r.n.interrupt} 处决 ${r.n.exec} 背击 ${r.n.weak} | 群狼 ${r.pack.spawned} 杀 ${r.pack.killed} 每只普攻 ${r.pack.hitsPerKill ?? "-"} 狼伤占 ${pc(r.pack.takenShare)}`}`,
        );
        const f = path.join(process.cwd(), "work", `num_qingya_${q.get("tag") || "x"}.json`);
        fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
      }
  // 汇总
  const groups = {};
  for (const r of rows) if (!r.error) (groups[`${r.L}|${r.wr ?? "-"}|${r.bot}`] ||= []).push(r);
  console.log("\n== 汇总（档位 × 机器人）");
  for (const [key, rs] of Object.entries(groups)) {
    const avg = (f) => Math.round((rs.reduce((s, x) => s + f(x), 0) / rs.length) * 100) / 100;
    console.log(`${key.padEnd(14)} 胜 ${Math.round((rs.filter((x) => x.result === "win").length / rs.length) * 100)}% 亡 ${Math.round((rs.filter((x) => x.result === "dead").length / rs.length) * 100)}% 用时 ${avg((x) => x.sec)}s 削 ${Math.round(avg((x) => 1 - x.bossLeft) * 100)}% 到二阶段 ${Math.round((rs.filter((x) => x.phase >= 2).length / rs.length) * 100)}% 掉血 ${Math.round(avg((x) => x.lost) * 100)}% 斩占 ${Math.round(avg((x) => x.share.charge) * 100)}% 窗口 ${Math.round(avg((x) => x.window) * 100)}% 打断 ${avg((x) => x.n.interrupt)} 群狼 ${avg((x) => x.pack.spawned)} 狼伤占 ${Math.round(avg((x) => x.pack.takenShare) * 100)}%`);
  }
  const errs = await c.ev(() => window.__errors || []);
  console.log((errs.length ? "FAIL " : "PASS ") + "no page errors " + JSON.stringify(errs.slice(0, 3)));
}

// ---------------- 页面内：一次试验 ----------------
async function runTrial({ pre, bot, timeout, intr }) {
  const G = window.__game, w = G.world, E = G.ctx.enemies, P = G.player, H = P.entity, S = G.ctx.skills, inp = G.ctx.input, run = G.run;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (v) => Math.round(v * 100) / 100;
  const V3 = G.THREE.Vector3;
  // ---- 存档：境界、装备、法术、心法、法宝 ----
  const { makeItem } = await import("/src/core/items.js");
  const { applyUnlocks } = await import("/src/game/progression.js");
  const p = G.profile;
  p.realm = { stage: pre.realm[0], layer: pre.realm[1] };
  applyUnlocks(p);
  p.equip = { sword: null, robe: null, jade: null, artifact: null };
  for (const [slot, [id, level, rarity]] of Object.entries(pre.gear)) p.equip[slot] = makeItem(id, { level, rarity, identified: !0 });
  if (pre.sw) {
    const { makeGear } = await import("/src/game/loot.js");
    p.equip.sword = makeGear(pre.sw.id, pre.sw.rarity, pre.sw.level, { region: "r1", identified: !0 });
  }
  if (pre.artifact) p.equip.artifact = makeItem(pre.artifact, { identified: !0 });
  p.build.spells = [0, 1, 2].map((i) => pre.spells[i] || null);
  p.build.xinfa = [...pre.xinfa];
  (p.flags.learned ||= {}).spells = [...pre.spells];
  p.flags.learned.xinfa = [...pre.xinfa];
  G.ctx.applyProfileStats(p);
  if (pre.dash) (P.dashMax = pre.dash), (P.dashCharges = Math.min(P.dashCharges, pre.dash));
  P.debug.god = !1;
  const hmax = H.stats.get("hp");
  H.alive = !0;
  H.hp = hmax;
  H.mp = H.stats.get("mp");
  if (S.potions) {
    if (S.potions[0]) S.potions[0].count = pre.L >= 2 ? 3 : 0; // 回气丹（练二起两个丹药栏）
    if (S.potions[1]) S.potions[1].count = 3; // 回春丹
  }
  // ---- 清场：只留青牙；天时停在清晨（不刷巡游 / 夜潮） ----
  E.auto = !1;
  const calm = () => run && ((run.t = 5), (run.tutorialWolf = null));
  calm();
  for (const e of [...E.list]) if (e.type !== "qingya") (e.entity.alive = !1), w.remove(e.entity), e.dispose();
  E.list = E.list.filter((e) => e.type === "qingya");
  // ---- 进谷：走到触发圈外，等首领生成 ----
  P.spawn(38, -26);
  let qy = null;
  for (let i = 0; i < 200 && !qy; i++) {
    calm();
    await sleep(100);
    qy = E.list.find((e) => e.type === "qingya" && e.alive && e.ctrl);
  }
  if (!qy) return { error: "boss not spawned" };
  const C = qy.ctrl, B = qy.entity;
  P.momentum = P.momentumMax || 100; // 开场满势（"在狼群上攒满再进谷"是常态，§5.6）
  // ---- 统计 ----
  const st = { crashDmg: {}, dmg: { basic: 0, charge: 0, spell: 0, art: 0, exec: 0, other: 0 }, taken: 0, minHp: hmax, died: !1, pots: 0, mpPots: 0, n: { break: 0, crash: 0, interrupt: 0, exec: 0, weak: 0, charge: 0, dash: 0 }, safeT: 0, fightT: 0, retreat: !1 };
  const pk = { spawned: 0, killed: 0, hits: new Map(), killHits: [], taken: 0, seen: new Set() };
  const offs = [];
  const on = (n, f) => offs.push(w.events.on(n, f));
  on("damage", (i) => {
    if (i.target === B && i.attacker === H) {
      const d = i.amount + ((i.shieldHit && i.shieldHit.dmg) || 0), t = i.tags || [];
      if (i.qyWeak) st.n.weak++;
      if (C.crashT > 0) {
        const k = t.includes("execute") ? "exec" : t.includes("charge") ? "charge" : t.includes("basic") ? "basic" : "spell";
        st.crashDmg[k] = (st.crashDmg[k] || 0) + d;
      }
      if (t.includes("execute")) st.dmg.exec += d;
      else if (t.includes("charge")) st.dmg.charge += d;
      else if (t.includes("basic")) st.dmg.basic += d;
      else if (t.includes("artifact")) st.dmg.art += d;
      else if (t.includes("dot") || t.includes("ink")) st.dmg.other += d;
      else st.dmg.spell += d;
    }
    if (i.target === H) {
      st.taken += i.amount;
      st.minHp = Math.min(st.minHp, H.hp);
      const src = E.list.find((o) => o.entity === i.attacker);
      if (src && src.type === "qingya_wolf") pk.taken += i.amount;
    }
    if (i.attacker === H && i.target !== B) {
      const o = E.list.find((x) => x.entity === i.target);
      if (o && o.type === "qingya_wolf" && (i.tags || []).includes("basic")) pk.hits.set(o, (pk.hits.get(o) || 0) + 1);
    }
  });
  on("beforeDamage", (i) => {
    if (i.target === H && !i.cancel && i.amount >= H.hp) (i.cancel = !0), (st.died = !0), (st.minHp = 0);
  });
  on("boss:break", () => st.n.break++);
  on("boss:crash", () => st.n.crash++);
  on("boss:interrupt", () => st.n.interrupt++);
  on("boss:executeHit", () => st.n.exec++);
  on("boss:retreat", () => (st.retreat = !0));
  on("player:charge", () => st.n.charge++);
  // 闪避：看到青牙的预警，按机器人的概率在出手前闪开
  const dodgeP = bot === "skilled" ? 0.9 : bot === "dodger" ? 0.7 : 0;
  let dashAt = null, dashFrom = null, luring = null;
  on("enemy:telegraph", (x) => {
    if (!dodgeP || x.enemy !== B || dashAt != null) return;
    const k = qy.atk;
    if (k && k.channel) return; // 读条招不用闪
    // 熟：正在柱后引冲，且这一招是直线冲扑 → 不闪，让它撞柱
    if (bot === "skilled" && luring && k && k.a && k.a.shape === "line") return;
    if (Math.hypot(qy.pos.x - P.pos.x, qy.pos.z - P.pos.z) > 9 || Math.random() > dodgeP) return;
    dashAt = w.time + Math.max(0.05, x.dur - (bot === "skilled" ? 0.1 : 0.14));
    dashFrom = qy.pos.clone();
  });
  const S_ = (id) => S.loadout.spells.indexOf(id);
  const ready = (i) => {
    const sp = S.spellAt(i);
    return sp && !S.slotLocked(i) && !((S.cd[["Q", "E", "R"][i]] || 0) > 0) && H.mp >= sp.cost ? sp : null;
  };
  const cast = (i, at) => {
    if (!ready(i)) return !1;
    S.aimOverride = at.clone();
    const ok = S.castSpell(i);
    S.aimOverride = null;
    return ok;
  };
  const canAct = () => P.state === "move" || (P.state === "attack" && P.stateT >= P.moveTimes().cancelFrom);
  const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const moveTo = (pt, dt) => {
    const dx = pt.x - P.pos.x, dz = pt.z - P.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.3 || P.state !== "move") return l;
    const sp = Math.min(l, H.stats.get("move") * dt);
    const nx = P.pos.x + (dx / l) * sp, nz = P.pos.z + (dz / l) * sp;
    if (!C.inPit({ x: nx, z: nz })) return l;
    P.tryMove((dx / l) * sp, (dz / l) * sp);
    P.faceDir(new V3(dx, 0, dz));
    return l;
  };
  let raw = 0, done = !1, lureT = 0, lureCd = 0, phase = 1;
  const step0 = w.step;
  const tick = (dt) => {
    calm();
    if (!qy.alive || C.mode === "dead" || st.died || st.retreat || raw > timeout) return void (done = !0);
    if (C.mode === "fight" || C.mode === "final") st.fightT += dt;
    for (const o of E.list) if (o.type === "qingya_wolf" && !pk.seen.has(o)) pk.seen.add(o), pk.spawned++;
    for (const o of pk.seen) if (!o.alive && !o._numDead) (o._numDead = 1), pk.killed++, pk.hits.has(o) && pk.killHits.push(pk.hits.get(o));
    phase = C.phase;
    inp.mouse.left = !1;
    // 丹药
    if (S.potions && S.potions[1] && S.potions[1].count > 0 && H.hp < hmax * 0.35 && !(S.hot && S.hot.length) && S.usePotion(1)) st.pots++;
    const minCost = Math.min(...S.loadout.spells.filter(Boolean).map((id) => (S.spellAt(S_(id)) || { cost: 99 }).cost));
    if (S.potions && S.potions[0] && S.potions[0].count > 0 && H.mp < minCost && S.usePotion(0)) st.mpPots++;
    if (C.mode === "intro" || C.mode === "transition" || C.mode === "exec" || P.state === "cine") return;
    // 目标：青牙；身边 2.5 米内有召来的狼时先清狼（莽 / 闪也会顺手打近处的）
    let tg = qy;
    const adds = E.list.filter((o) => o !== qy && o.alive && o.entity && dist2D(o.pos, P.pos) < 2.5);
    if (adds.length && !(C.broken || C.mode === "final")) tg = adds[0];
    const hpos = P.pos, bd = dist2D(qy.pos, hpos) - qy.def.radius;
    // 首领可输出窗口：青牙不在预警 / 出招中、没潜行，且在近战距离内
    if (C.mode === "fight" && !["windup", "strike"].includes(qy.state) && !qy.submerged && bd <= 2.5) st.safeT += dt;
    // 闪身
    if (dashAt != null && w.time >= dashAt) {
      dashAt = null;
      const src = dashFrom || qy.pos, dx = hpos.x - src.x, dz = hpos.z - src.z, l = Math.hypot(dx, dz) || 1;
      for (const sd of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        const dir = new V3((-dz / l) * sd + (dx / l) * 0.3, 0, (dx / l) * sd + (dz / l) * 0.3).normalize();
        if (C.inPit({ x: hpos.x + dir.x * 5, z: hpos.z + dir.z * 5 }) && P.startDash(dir)) {
          st.n.dash++;
          break;
        }
      }
      return;
    }
    // 处决：威折倒地（二阶段）/ 气竭伏地 → 走近按 F（莽不会）
    if (bot !== "masher" && ((C.broken && C.downKind === "break") || C.mode === "final")) {
      if (C.canExecute(hpos)) C.fReq = !0;
      else moveTo(qy.pos, dt);
      return;
    }
    const aim = (o) => inp.aim.set(o.pos.x, hpos.y, o.pos.z);
    // ---- 熟：读条打断 ----
    const doIntr = intr === "always" || (intr !== "never" && bot === "skilled");
    if (doIntr && qy.state === "windup" && qy.atk && qy.atk.channel) {
      aim(qy);
      if (bd < 2.6 && P.momentum >= 50 && canAct() && P.tryCharge()) return;
      if (canAct()) {
        const fi = S_("frost"), qi = S_("sword_qi");
        if (qy.atk.a.id === "moon_howl" && fi >= 0 && cast(fi, qy.pos)) return;
        if (qi >= 0 && cast(qi, qy.pos)) return;
        if (fi >= 0 && cast(fi, qy.pos)) return;
      }
      if (bd > 1.9) moveTo(qy.pos, dt);
      else inp.mouse.left = !0;
      return;
    }
    const down = C.broken || ["flinch", "winded", "recover", "down"].includes(qy.state) || qy.entity.statuses.has("stun");
    // ---- 熟：站柱后引冲（青牙在追、没出招、自己没被包围） ----
    if (bot === "skilled") {
      lureCd -= dt;
      // 引冲中、青牙起手 / 正在冲直线扑咬 → 站在柱后不动（等它撞上），不追不砍
      if (luring && !down && ["windup", "strike"].includes(qy.state) && qy.atk && qy.atk.a && qy.atk.a.shape === "line") {
        moveTo(luring, dt);
        P.faceDir(new V3(qy.pos.x - hpos.x, 0, qy.pos.z - hpos.z));
        return;
      }
      const pills = ((C.arena && C.arena.pillars) || []).filter((q) => q.alive);
      if (!down && qy.state === "chase" && pills.length && lureCd <= 0 && !adds.length) {
        let best = null, bdd = 1e9;
        for (const pl of pills) {
          const ox = pl.pos.x - qy.pos.x, oz = pl.pos.z - qy.pos.z, ol = Math.hypot(ox, oz) || 1;
          if (ol < 3 || ol > 8) continue; // 冲扑 5.5 米：青牙离柱太远撞不到
          const pt = new V3(pl.pos.x + (ox / ol) * (pl.r + 1.4), hpos.y, pl.pos.z + (oz / ol) * (pl.r + 1.4));
          if (!C.inPit(pt)) continue;
          const d = dist2D(pt, hpos);
          if (d < bdd && d < 14) (bdd = d), (best = pt);
        }
        if (best) {
          luring = best;
          lureT += dt;
          if (lureT > 9) (lureT = 0), (lureCd = 10), (luring = null);
          else {
            moveTo(best, dt);
            P.faceDir(new V3(qy.pos.x - hpos.x, 0, qy.pos.z - hpos.z));
            return;
          }
        }
      } else if (down) (luring = null), (lureT = 0);
      // ---- 熟：二阶段绕背（青牙倒地 / 硬直 / 喘息 / 收招时） ----
      if (phase === 2 && down && tg === qy) {
        const back = new V3(qy.pos.x - Math.sin(qy.yaw) * (qy.def.radius + 1.2), hpos.y, qy.pos.z - Math.cos(qy.yaw) * (qy.def.radius + 1.2));
        if (C.inPit(back) && dist2D(back, hpos) > 1.0 && P.state === "move") {
          moveTo(back, dt);
          return;
        }
      }
      // ---- 熟：二阶段站月光（青牙在追、自己不在月光里） ----
      if (phase === 2 && !down && qy.state === "chase") {
        const spots = C.moonSpots();
        if (spots.length && !C.inMoon(hpos)) {
          let s0 = null, sd = 1e9;
          for (const s of spots) {
            const d = Math.hypot(s.x - hpos.x, s.z - hpos.z);
            if (d < sd && d < 10) (sd = d), (s0 = s);
          }
          if (s0) {
            moveTo(new V3(s0.x, hpos.y, s0.z), dt);
            return;
          }
        }
      }
    }
    // ---- 通用：满势右键、法术、追着砍 ----
    aim(tg);
    const td = dist2D(tg.pos, hpos) - tg.def.radius;
    if (P.momentumFull && td < 2.7 && canAct() && !(P.chargeBuf > 0) && !(P.state === "attack" && P.combo === 3)) P.tryCharge();
    if (canAct() && tg === qy) {
      const sh = B.shield && B.shield.hp > 0 ? B.shield.element : null;
      const qi = S_("sword_qi"), vi = S_("vine"), fi = S_("frost");
      // 熟：寒冰锥留给啸月（二阶段至少留一发的蓝）；其余机器人冷却好就放
      const keepFrost = bot === "skilled" && phase === 2 && fi >= 0 && H.mp < (S.spellAt(fi).cost * 2);
      const order = bot === "skilled"
        ? [sh === "wood" ? qi : -1, sh === "earth" ? vi : -1, !keepFrost ? fi : -1, !sh ? qi : -1].filter((i) => i >= 0)
        : [0, 1, 2];
      for (const i of order) if (cast(i, qy.pos)) break;
    }
    if (td < 1.9 && !tg.submerged) inp.mouse.left = !0;
    else moveTo(tg.pos, dt);
  };
  w.step = function (r) {
    raw += r;
    try {
      tick(r);
    } catch (e) {
      console.error("[num_qingya] tick", e);
      done = !0;
    }
    return step0.call(this, r);
  };
  // 走进触发圈 → 入场仪式（tick 里会追过去）
  while (!done) await sleep(100);
  w.step = step0;
  inp.mouse.left = !1;
  S.aimOverride = null;
  for (const off of offs) off();
  const tot = Object.values(st.dmg).reduce((a, b) => a + b, 0) || 1;
  const maxHp = B.stats.get("hp");
  const won = !qy.alive || C.mode === "dead";
  return {
    label: pre.label, result: won ? "win" : st.died ? "dead" : st.retreat ? "out" : "time", sec: r2(raw), fightSec: r2(st.fightT),
    bossLeft: won ? 0 : r2(Math.max(0, B.hp) / maxHp), phase: won ? 2 : C.phase, lost: st.died ? 1 : r2(st.taken / hmax), minHp: r2(st.minHp / hmax),
    pots: st.pots, mpPots: st.mpPots, n: st.n, window: st.fightT ? r2(st.safeT / st.fightT) : null,
    share: Object.fromEntries(Object.entries(st.dmg).map(([k, v]) => [k, r2(v / tot)])), dmg: st.dmg,
    crashDmg: Object.fromEntries(Object.entries(st.crashDmg).map(([k, v]) => [k, Math.round(v)])),
    pack: { spawned: pk.spawned, killed: pk.killed, hitsPerKill: pk.killHits.length ? r2(pk.killHits.reduce((a, b) => a + b, 0) / pk.killHits.length) : null, killHits: pk.killHits, takenShare: st.taken ? r2(pk.taken / st.taken) : 0, taken: Math.round(pk.taken) },
    sword: p.equip.sword && { id: p.equip.sword.id, r: p.equip.sword.rarity, lv: p.equip.sword.level, aff: (p.equip.sword.affixes || []).map((a) => a.stat + ":" + a.value) },
    hero: { hp: hmax, atk: r2(H.stats.get("atk")), aspd: r2(H.stats.get("aspd")), mp: Math.round(H.stats.get("mp")), dash: P.dashMax, spells: pre.spells },
  };
}
