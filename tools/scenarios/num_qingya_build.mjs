// 构筑与成长 v1 · 05 青牙实测（数值策划 2026-11-18）：00 总纲时间线下，五个流派 + 现状通用在 练四 / 五 / 六 / 七 打**真青牙**。
// 以 tools/scenarios/num_qingya.mjs（前任数值策划的真青牙试验，控制器 / 石柱 / 图腾 / 月光 / 处决 / 打断全在）为底，改了三处：
//   1. 配装：流派预设（qyPreset，见下）+ 数值套 set（orig = 03 原稿 / bal = 03 §4.4 平衡后，cur = 现行数据），全部只改页面内存，不动 src/
//   2. 同一页面连打 trials 次：每次结束把青牙移除、石柱 / 图腾复位（碰撞体加回）、run.bossSpawned 复位，主角走回谷口让关卡重新生成青牙
//   3. 加速：关掉 3D 渲染（ctx.hold3d），每 16 毫秒额外推进 turbo 步玩法时间（同 main.js 的更新顺序，秒数仍按玩法 dt 计）
// 机器人（同 num_qingya）：masher 莽 / dodger 闪 / skilled 熟（九成闪、读条打断、引冲撞柱、二阶段绕背、站月光）；
//   打断与法术顺序按流派泛化：读条时选打断值最高的手段（镇山印 1.5 > 落石诀 1.2 > 满势斩 / 寒冰锥 1.0 > 半势 0.6 > 火 0.5 > 剑气 0.34），
//   护盾在时先放克制五行的法术；法宝 V 冷却好就用（熟：镇山印留着打断），阵法 T 冷却好就布。
// 用法（仓库根目录）：
//   node tools/run.mjs num_qingya_build "scene=run&region=r1&slot=7&levels=4,5,6&build=base,jian,fa,shen,bao,shou&sets=bal,orig&bots=masher,dodger,skilled&trials=12&turbo=8&tag=a"
//   可选：noart=0（练六不测"无法宝"组）、timeout=240（玩法秒）、only=jian-L4|bal|dodger（只跑某些格，逗号分隔）
// 结果：work/num_qingya_build_<tag>.json（每格汇总 + 每次明细；已有的格跳过，可断点续跑）
import fs from "node:fs";
import path from "node:path";

const STAR = { jian: "ningfeng", fa: "rock", shen: "zhishui", bao: "thunder", shou: "earth_shield" };
const XINFA = { jian: "mom_gather", fa: "ningshen", shen: "dash_flow", bao: "sharp", shou: "vajra" };
const ART = { jian: "art_flying_sword", fa: "art_gourd_t", shen: "art_seal", bao: "art_flying_sword", shou: "art_seal" }; // 定风珠 / 五雷令未做：身法用镇山印、雷暴用飞剑代
const THIRD = { jian: "frost", fa: "fire_talisman", shen: "earth_walk", bao: "frost", shou: "rock" };
const CN = "一二三四五六七八九";
function qyPreset(b, L, withArt = !0) {
  const gear = L <= 4 ? { sword: ["sword_qingfeng", L, 1], robe: ["robe_bu", L, 1] } : { sword: ["sword_qingfeng", L, 1], robe: ["robe_bu", L, 1], jade: ["jade_qing", L, 1] };
  if (b === "base") {
    // 现状通用：现行栏位（心法练四送锋锐、法宝练七飞剑），法术 剑气斩 + 缠藤诀（练七 + 寒冰锥）
    return { id: `base-L${L}`, label: `现状通用 练${CN[L - 1]}`, build: b, L, realm: [1, L], gear, spells: ["sword_qi", "vine", ...(L >= 7 ? ["frost"] : [])], xinfa: L >= 4 ? ["sharp"] : [], artifact: L >= 7 ? "art_flying_sword" : null, artLevel: 1, formation: null, zhong: {}, mpPills: 3, unlocks: null };
  }
  const star = STAR[b], art = L >= 6 && withArt;
  return {
    id: `${b}-L${L}${L >= 6 && !withArt ? "-noart" : ""}`, label: `${b} 练${CN[L - 1]}${L >= 6 && !withArt ? "·无法宝" : ""}`, build: b, L, realm: [1, L], gear,
    spells: [star, "sword_qi", ...(L >= 7 ? [THIRD[b]] : [])], xinfa: [XINFA[b]], artifact: art ? ART[b] : null, artLevel: 1,
    formation: L >= 7 ? (b === "fa" ? "spirit_array" : "sword_array") : null, zhong: L >= 5 ? { [star]: 2 } : {}, mpPills: 3,
    unlocks: { xinfaSlots: 1, artifactSlot: L >= 6, formationSlot: L >= 7, spellSlots: L >= 7 ? 3 : 2 },
  };
}

export default async function (page, c) {
  const url = new URL(page.url());
  const base = url.origin, q = url.searchParams;
  const levels = (q.get("levels") || "4,5,6").split(",").map(Number);
  const builds = (q.get("build") || "base,jian,fa,shen,bao,shou").split(",");
  const sets = (q.get("sets") || "bal,orig").split(",");
  const bots = (q.get("bots") || "masher,dodger,skilled").split(",");
  const trials = Number(q.get("trials") || 12), timeout = Number(q.get("timeout") || 240), turbo = Number(q.get("turbo") || 8);
  const noart = q.get("noart") !== "0";
  const only = (q.get("only") || "").split(",").filter(Boolean);
  // tweak（敏感度，逗号分隔）：exec8 = 威折处决 12% → 8% 最大气血；poise125 = 狼威阈值 100 → 125；atk48 = 青牙攻击 40 → 48；hp18000；pots2 = 回春丹 3 → 2
  const tweak = q.get("tweak") || "";
  const f = path.join(process.cwd(), "work", `num_qingya_build_${q.get("tag") || "x"}.json`);
  const cells = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).cells || [] : [];
  const done = new Set(cells.map((x) => x.key));
  const pc = (v) => (v == null ? "-" : Math.round(v * 100) + "%");
  let loaded = !1;
  for (const L of levels)
    for (const b of builds)
      for (const withArt of L === 6 && b !== "base" && noart ? [!0, !1] : [!0])
        for (const set of b === "base" ? ["cur"] : sets)
          for (const bot of bots) {
            const pre = qyPreset(b, L, withArt);
            const key = `${pre.id}|${set}|${bot}${tweak ? "|" + tweak : ""}`;
            if (done.has(key) || (only.length && !only.includes(key))) continue;
            // 页面只在开头和出错后重新载入（场地、青牙每次试验在页面内复位）
            const load = async () => {
              await page.evaluate(() => localStorage.clear()).catch(() => {});
              await page.goto(`${base}/?scene=run&region=r1&slot=7`, { waitUntil: "commit", timeout: 90000 });
              await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 150000 });
              await c.wait(800);
              loaded = !0;
            };
            if (!loaded) await load();
            const t0 = Date.now(), rows = [];
            for (let k = 0; k < trials; k++) {
              let r;
              try {
                r = await c.ev(runTrial, { pre, set, bot, timeout, turbo, first: k === 0, tweak });
              } catch (e) {
                r = { error: String(e).slice(0, 300) };
              }
              rows.push(r);
              if (r.error) await load().catch(() => {});
            }
            const ok = rows.filter((x) => !x.error), n = ok.length || 1;
            const avg = (fn) => Math.round((ok.reduce((s, x) => s + fn(x), 0) / n) * 100) / 100;
            const sum = {
              n: ok.length, err: rows.length - ok.length, win: avg((x) => +(x.result === "win")), died: avg((x) => +(x.result === "dead")), p2: avg((x) => +(x.phase >= 2)),
              left: avg((x) => x.bossLeft), sec: avg((x) => x.sec), winSec: ok.some((x) => x.result === "win") ? Math.round(ok.filter((x) => x.result === "win").reduce((s, x) => s + x.sec, 0) / ok.filter((x) => x.result === "win").length) : null,
              lost: avg((x) => x.lost), pots: avg((x) => x.pots), execs: avg((x) => x.n.exec), breaks: avg((x) => x.n.break), interrupts: avg((x) => x.n.interrupt), crashes: avg((x) => x.n.crash),
              charge: avg((x) => x.share.charge), spell: avg((x) => x.share.spell), art: avg((x) => x.share.art), exec: avg((x) => x.share.exec), window: avg((x) => x.window || 0),
            };
            cells.push({ key, id: pre.id, build: b, L, withArt, set, bot, tweak, hero: ok[0] && ok[0].hero, summary: sum, rows, realSec: Math.round((Date.now() - t0) / 1000) });
            console.log(`${key.padEnd(30)} 胜 ${pc(sum.win)} 亡 ${pc(sum.died)} 二阶段 ${pc(sum.p2)} 剩血 ${pc(sum.left)} 用时 ${sum.sec}s（胜 ${sum.winSec ?? "-"}s）掉血 ${pc(sum.lost)} 丹 ${sum.pots} | 处决 ${sum.execs} 威折 ${sum.breaks} 打断 ${sum.interrupts} 撞柱 ${sum.crashes} | 斩 ${pc(sum.charge)} 法术 ${pc(sum.spell)} 法宝 ${pc(sum.art)} 处决 ${pc(sum.exec)} | ${sum.n} 次${sum.err ? " 错 " + sum.err : ""}，真实 ${Math.round((Date.now() - t0) / 1000)}s`);
            fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), cells }, null, 1));
          }
  console.log("saved", f);
  if (loaded) {
    const errs = await c.ev(() => window.__errors || []);
    console.log((errs.length ? "FAIL " : "PASS ") + "no page errors " + JSON.stringify(errs.slice(0, 3)));
  }
}

// ---------------- 页面内：一次试验 ----------------
async function runTrial({ pre, set, bot, timeout, turbo, first, tweak = "" }) {
  const G = window.__game, w = G.world, E = G.ctx.enemies, P = G.player, H = P.entity, S = G.ctx.skills, inp = G.ctx.input, run = G.run;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (v) => Math.round(v * 100) / 100;
  const V3 = G.THREE.Vector3;
  const QB = (window.__QB ||= {});
  // ---- 数值套（只改内存）----
  const I = await import("/src/data/items.js"), K = await import("/src/data/skills.js"), PD = await import("/src/data/player.js"), GF = await import("/src/data/gongfa.js"), CI = await import("/src/core/items.js");
  if (!CI.ITEMS.art_gourd_t) CI.registerItems([{ id: "art_gourd_t", name: "紫金葫芦（测试）", glyph: "葫", cat: "artifact", slot: "artifact", size: 2, value: 900, rarity: 3, artifact: "gourd", artifactId: "gourd" }]);
  if (!QB.bak) QB.bak = { gourdA: { ...I.ARTIFACTS.gourd.active }, gourdP: I.ARTIFACTS.gourd.passive, seal: { ...I.ARTIFACTS.seal.active }, chainPer: PD.MOM_XINFA.chainPer, gather: JSON.parse(JSON.stringify(I.XINFA.mom_gather.mods)), sharp: JSON.parse(JSON.stringify(I.XINFA.sharp.mods)), z2: GF.GONGFA.zhong[2].dmg, costs: Object.fromEntries(Object.entries(K.SPELLS).map(([k, v]) => [k, v.cost])), spirit: { ...K.FORMATIONS.spirit_array } };
  const B0 = QB.bak;
  I.ARTIFACTS.gourd.active = { ...B0.gourdA };
  I.ARTIFACTS.gourd.passive = B0.gourdP;
  Object.assign(I.ARTIFACTS.seal.active, B0.seal);
  PD.MOM_XINFA.chainPer = B0.chainPer;
  I.XINFA.mom_gather.mods = JSON.parse(JSON.stringify(B0.gather));
  I.XINFA.sharp.mods = JSON.parse(JSON.stringify(B0.sharp));
  GF.GONGFA.zhong[2].dmg = B0.z2;
  for (const [k, cst] of Object.entries(B0.costs)) K.SPELLS[k].cost = cst;
  Object.assign(K.FORMATIONS.spirit_array, B0.spirit);
  if (set !== "cur") {
    // 原稿与平衡后共有（02 草案）：葫芦去被动回气、凝神真气 +25%、灵池（每秒 3.6 × 10 秒 = 36）
    I.ARTIFACTS.gourd.passive = (L) => [{ stat: "mp", type: "flat", value: 20 * L }];
    I.XINFA.ningshen = { id: "ningshen", name: "凝神", glyph: "神", desc: "真气上限 +25%", mods: [{ stat: "mp", type: "pct", value: 0.25 }] };
    Object.assign(K.FORMATIONS.spirit_array, { cost: 0, cd: 24, dur: 10, mods: [{ stat: "mpRegen", type: "flat", value: 3.6 }], cdSpeed: 0.5 });
  }
  if (set === "bal") {
    I.ARTIFACTS.gourd.active = { ...B0.gourdA, base: B0.gourdA.base * 2.5, scale: { spell: B0.gourdA.scale.spell * 2.5 } };
    I.ARTIFACTS.gourd.passive = (L) => [{ stat: "mp", type: "flat", value: 20 * L }, { stat: "spell", type: "flat", value: 8 * L }];
    I.XINFA.ningshen.mods = [{ stat: "mp", type: "pct", value: 0.25 }, { stat: "spell", type: "pct", value: 0.15 }];
    I.ARTIFACTS.seal.active.base = 90;
    PD.MOM_XINFA.chainPer = 0.03;
    I.XINFA.mom_gather.mods = I.XINFA.mom_gather.mods.map((m) => (m.stat === "chargeDmg" ? { ...m, value: 0.05 } : m));
    I.XINFA.sharp.mods = I.XINFA.sharp.mods.map((m) => (m.stat === "critDmg" ? { ...m, value: 0.2 } : m));
    GF.GONGFA.zhong[2].dmg = 0.15;
    for (const [id, z] of Object.entries(pre.zhong || {})) if (z >= 2 && K.SPELLS[id]) K.SPELLS[id].cost = Math.round(B0.costs[id] * 0.85); // 二重耗蓝 −15%
  }
  const z0 = S.__zd0 || (S.__zd0 = S.zhongDmg.bind(S));
  S.zhongDmg = set === "bal" && pre.xinfa.includes("ningshen") ? (id) => z0(id) * 1.25 : z0; // 凝神"法术伤害 +25%"（独立乘区）
  // ---- 首领侧敏感度（只改内存）----
  const QD = await import("/src/data/bosses/qingya.js"), ED = await import("/src/data/enemies.js");
  const QQ = QD.QINGYA, QT = ED.ENEMY_TYPES.qingya;
  if (!QB.qbak) QB.qbak = { frac: QQ.exec.break.frac, pmax: QQ.poise.max, atk: QT.stats.atk, hp: QT.stats.hp, orbit: { ...I.ARTIFACTS.flying_sword.orbit }, vajra: JSON.parse(JSON.stringify(I.XINFA.vajra.mods)) };
  I.ARTIFACTS.flying_sword.orbit = { ...QB.qbak.orbit };
  I.XINFA.vajra.mods = JSON.parse(JSON.stringify(QB.qbak.vajra));
  QQ.exec.break.frac = QB.qbak.frac;
  QQ.poise.max = QB.qbak.pmax;
  QT.stats.atk = QB.qbak.atk;
  QT.stats.hp = QB.qbak.hp;
  let potN = 3;
  for (const t of tweak.split(",").filter(Boolean)) {
    const m = /^([a-z]+)(\d+)$/.exec(t);
    if (!m) continue;
    const v = Number(m[2]);
    if (m[1] === "exec") QQ.exec.break.frac = v / 100;
    else if (m[1] === "poise") QQ.poise.max = v;
    else if (m[1] === "atk") QT.stats.atk = v;
    else if (m[1] === "hp") QT.stats.hp = v;
    else if (m[1] === "pots") potN = v;
    else if (m[1] === "fsw") I.ARTIFACTS.flying_sword.orbit = { ...QB.qbak.orbit, base: QB.qbak.orbit.base * v / 100, scale: { atk: QB.qbak.orbit.scale.atk * v / 100 } };
    else if (m[1] === "vaj") I.XINFA.vajra.mods = [{ stat: "def", type: "flat", value: Math.round(v / 1.25) }, { stat: "hp", type: "pct", value: v / 100 }];
  }
  // ---- 存档 ----
  const { makeItem } = await import("/src/core/items.js");
  const { applyUnlocks } = await import("/src/game/progression.js");
  const p = G.profile;
  p.realm = { stage: pre.realm[0], layer: pre.realm[1] };
  applyUnlocks(p);
  if (pre.unlocks) Object.assign(p.unlocks, pre.unlocks);
  p.equip = { sword: null, robe: null, jade: null, artifact: null };
  for (const [slot, [id, level, rarity]] of Object.entries(pre.gear)) p.equip[slot] = makeItem(id, { level, rarity, identified: !0 });
  if (pre.artifact) p.equip.artifact = makeItem(pre.artifact, { identified: !0 }), (p.equip.artifact.level = pre.artLevel || 1);
  p.build.spells = [0, 1, 2].map((i) => pre.spells[i] || null);
  p.build.xinfa = [...pre.xinfa];
  p.build.formation = pre.formation || null;
  (p.flags.learned ||= {}).spells = [...pre.spells];
  p.flags.learned.xinfa = [...pre.xinfa];
  p.flags.learned.formations = pre.formation ? [pre.formation] : [];
  (p.flags.gongfa ||= {}).zhong = { ...(pre.zhong || {}) };
  G.ctx.applyProfileStats(p);
  P.debug.god = !1;
  const hmax = H.stats.get("hp");
  H.alive = !0;
  H.hp = hmax;
  H.mp = H.stats.get("mp");
  P.dashCharges = P.dashMax;
  if (S.potions) {
    if (S.potions[0]) S.potions[0].count = pre.mpPills ?? 3;
    if (S.potions[1]) S.potions[1].count = potN;
  }
  S.cd = {};
  // ---- 加速 ----
  // 游戏里有些计时按真实时间（performance.now：受击无敌 0.4 秒、完美闪身窗口、慢动作、处决演出）。加速时把 performance.now 换成
  // "虚拟时钟"——只随加速步进的玩法时间走；主循环的步进在加速期间被挡掉（返回 dt 0），玩法时间和虚拟时钟严格一致。
  // （第一版没做这一步：受击无敌按真实 0.4 秒 = 玩法 3.6 秒，莽机器人练四胜率从 0% 变成 92%。）
  if (!QB.clock) {
    const rn = performance.now.bind(performance);
    QB.clock = { rn, mode: "real", off: 0, vt: 0 };
    performance.now = () => (QB.clock.mode === "virt" ? QB.clock.vt : rn() + QB.clock.off);
  }
  const CK = QB.clock;
  clearInterval(QB.turboT);
  if (CK.mode === "virt") (CK.off = CK.vt - CK.rn()), (CK.mode = "real");
  QB.gate = turbo > 0;
  G.ctx.hold3d = turbo > 0;
  if (turbo > 0) {
    CK.vt = CK.rn() + CK.off;
    CK.mode = "virt";
    QB.turboT = setInterval(() => {
      QB.inTurbo = !0;
      try {
        for (let i = 0; i < turbo; i++) {
          const raw = 1 / 60;
          CK.vt += raw * 1000;
          const dt = w.step(raw);
          if (G.flow.live) (P.update(dt), E.update(dt), S.update(dt), G.ctx.shields.update(dt));
          G.ctx.vfx.update(dt);
          G.ctx.feedback.update(dt, raw);
          G.flow.update(dt, raw);
        }
      } finally {
        QB.inTurbo = !1;
      }
    }, 16);
  }
  // ---- 清场、复位上一只青牙与场地 ----
  E.auto = !1;
  const calm = () => run && ((run.t = 5), (run.tutorialWolf = null));
  calm();
  for (const e of [...E.list]) {
    if (e.ctrl && e.ctrl.cleanupFight) try { e.ctrl.cleanupFight(); } catch {}
    (e.entity.alive = !1), w.remove(e.entity), G.ctx.shields && G.ctx.shields.drop && G.ctx.shields.drop(e.entity), e.dispose();
  }
  E.list.length = 0;
  for (const id of [...H.statuses.keys()]) w.removeStatus(H, id);
  if (S.hot) S.hot.length = 0;
  const A = QB.arena, cols = G.ctx.colliders;
  if (A) {
    for (const pl of A.pillars || []) if (!pl.alive) { pl.alive = !0; if (pl.col && cols && !cols.includes(pl.col)) cols.push(pl.col); if (pl.object && pl.object.userData.setBroken) pl.object.userData.setBroken(!1); }
    for (const t of A.totems || []) if (!t.alive) { t.alive = !0; if (t.col && cols && !cols.includes(t.col)) cols.push(t.col); }
  }
  if (run) {
    run.bossSpawned = !1;
    if (run.boss) (run.boss.fight = null), (run.boss.e = null);
  }
  if (G.ctx.flyFence) G.ctx.flyFence = null;
  // ---- 进谷：走到触发圈外，等关卡生成青牙 ----
  P.spawn(38, -26);
  let qy = null;
  for (let i = 0; i < 300 && !qy; i++) {
    calm();
    await sleep(50);
    qy = E.list.find((e) => e.type === "qingya" && e.alive && e.ctrl);
  }
  if (!qy) return { error: "boss not spawned" };
  const C = qy.ctrl, B = qy.entity;
  QB.arena = C.arena || QB.arena;
  P.momentum = P.momentumMax || 100;
  // ---- 统计 ----
  const st = { dmg: { basic: 0, charge: 0, spell: 0, art: 0, exec: 0, other: 0 }, taken: 0, minHp: hmax, died: !1, pots: 0, mpPots: 0, n: { break: 0, crash: 0, interrupt: 0, exec: 0, weak: 0, charge: 0, dash: 0, art: 0 }, safeT: 0, fightT: 0, retreat: !1 };
  const offs = [];
  const on = (n, fn) => offs.push(w.events.on(n, fn));
  on("damage", (i) => {
    if (i.target === B && i.attacker === H) {
      const d = i.amount + ((i.shieldHit && i.shieldHit.dmg) || 0), t = i.tags || [];
      if (i.qyWeak) st.n.weak++;
      if (t.includes("execute")) st.dmg.exec += d;
      else if (t.includes("charge")) st.dmg.charge += d;
      else if (t.includes("basic")) st.dmg.basic += d;
      else if (t.includes("artifact")) st.dmg.art += d;
      else if (t.includes("dot") || t.includes("ink")) st.dmg.other += d;
      else st.dmg.spell += d;
    }
    if (i.target === H) (st.taken += i.amount), (st.minHp = Math.min(st.minHp, H.hp));
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
  const dodgeP = bot === "skilled" ? 0.9 : bot === "dodger" ? 0.7 : 0;
  let dashAt = null, dashFrom = null, luring = null;
  on("enemy:telegraph", (x) => {
    if (!dodgeP || x.enemy !== B || dashAt != null) return;
    const k = qy.atk;
    if (k && k.channel) return;
    if (bot === "skilled" && luring && k && k.a && k.a.shape === "line") return;
    if (Math.hypot(qy.pos.x - P.pos.x, qy.pos.z - P.pos.z) > 9 || Math.random() > dodgeP) return;
    dashAt = w.time + Math.max(0.05, x.dur - (bot === "skilled" ? 0.1 : 0.14));
    dashFrom = qy.pos.clone();
  });
  const COUNTER = { wood: "metal", earth: "wood", water: "earth", fire: "water", metal: "fire" };
  const CHV = { metal: 0.34, fire: 0.5, water: 1.0, wood: 0.2, earth: 0.2 };
  const ready = (i) => {
    const sp = S.spellAt(i);
    return sp && !S.slotLocked(i) && !((S.cd[["Q", "E", "R"][i]] || 0) > 0) && H.mp >= sp.cost ? sp : null;
  };
  const selfCast = (sp) => ["shield", "buff", "counter", "summon"].includes(sp.effect.type);
  const cast = (i, at) => {
    const sp = ready(i);
    if (!sp) return !1;
    S.aimOverride = selfCast(sp) ? P.pos.clone() : at.clone();
    const ok = S.castSpell(i);
    S.aimOverride = null;
    return ok;
  };
  const artReady = () => S.artifact && S.artifactDef && !(S.cd.artifact > 0) && H.mp >= S.artifactDef.active.cost;
  const useArt = (at) => {
    if (!artReady()) return !1;
    S.aimOverride = at.clone();
    const ok = S.useArtifact();
    S.aimOverride = null;
    if (ok) st.n.art++;
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
    phase = C.phase;
    inp.mouse.left = !1;
    if (S.potions && S.potions[1] && S.potions[1].count > 0 && H.hp < hmax * 0.35 && !(S.hot && S.hot.length) && S.usePotion(1)) st.pots++;
    const costs = [0, 1, 2].map((i) => S.spellAt(i)).filter(Boolean).map((sp) => sp.cost);
    if (S.potions && S.potions[0] && S.potions[0].count > 0 && costs.length && H.mp < Math.min(...costs) && S.usePotion(0)) st.mpPots++;
    if (C.mode === "intro" || C.mode === "transition" || C.mode === "exec" || P.state === "cine") return;
    let tg = qy;
    const adds = E.list.filter((o) => o !== qy && o.alive && o.entity && dist2D(o.pos, P.pos) < 2.5);
    if (adds.length && !(C.broken || C.mode === "final")) tg = adds[0];
    const hpos = P.pos, bd = dist2D(qy.pos, hpos) - qy.def.radius;
    if (C.mode === "fight" && !["windup", "strike"].includes(qy.state) && !qy.submerged && bd <= 2.5) st.safeT += dt;
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
    if (bot !== "masher" && ((C.broken && C.downKind === "break") || C.mode === "final")) {
      if (C.canExecute(hpos)) C.fReq = !0;
      else moveTo(qy.pos, dt);
      return;
    }
    const aim = (o) => inp.aim.set(o.pos.x, hpos.y, o.pos.z);
    // ---- 熟：读条打断（打断值最高的手段）----
    if (bot === "skilled" && qy.state === "windup" && qy.atk && qy.atk.channel) {
      aim(qy);
      if (canAct()) {
        const isSeal = S.artifactDef && S.artifactDef.id === "seal";
        if (isSeal && bd < 12 && useArt(qy.pos)) return; // 镇山印 1.5
        let bi = -1, bv = 0;
        for (let i = 0; i < 3; i++) {
          const sp = ready(i);
          if (!sp || selfCast(sp)) continue;
          const v = (sp.boss && sp.boss.chan) || CHV[sp.element] || 0.2;
          if (v > bv) (bv = v), (bi = i);
        }
        const chg = P.momentum >= 100 ? 1.0 : P.momentum >= 50 ? 0.6 : 0;
        if (chg >= bv && chg > 0 && bd < 2.6 && P.tryCharge()) return;
        if (bi >= 0 && cast(bi, qy.pos)) return;
      }
      if (bd > 1.9) moveTo(qy.pos, dt);
      else inp.mouse.left = !0;
      return;
    }
    const down = C.broken || ["flinch", "winded", "recover", "down"].includes(qy.state) || qy.entity.statuses.has("stun");
    if (bot === "skilled") {
      lureCd -= dt;
      if (luring && !down && ["windup", "strike"].includes(qy.state) && qy.atk && qy.atk.a && qy.atk.a.shape === "line") {
        moveTo(luring, dt);
        P.faceDir(new V3(qy.pos.x - hpos.x, 0, qy.pos.z - hpos.z));
        return;
      }
      const pills = ((C.arena && C.arena.pillars) || []).filter((x) => x.alive);
      if (!down && qy.state === "chase" && pills.length && lureCd <= 0 && !adds.length) {
        let best = null, bdd = 1e9;
        for (const pl of pills) {
          const ox = pl.pos.x - qy.pos.x, oz = pl.pos.z - qy.pos.z, ol = Math.hypot(ox, oz) || 1;
          if (ol < 3 || ol > 8) continue;
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
      if (phase === 2 && down && tg === qy) {
        const back = new V3(qy.pos.x - Math.sin(qy.yaw) * (qy.def.radius + 1.2), hpos.y, qy.pos.z - Math.cos(qy.yaw) * (qy.def.radius + 1.2));
        if (C.inPit(back) && dist2D(back, hpos) > 1.0 && P.state === "move") {
          moveTo(back, dt);
          return;
        }
      }
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
    // ---- 通用：满势右键、法术（护盾在时先放克制的）、法宝、阵法、追着砍 ----
    aim(tg);
    const td = dist2D(tg.pos, hpos) - tg.def.radius;
    if (P.momentumFull && td < 2.7 && canAct() && !(P.chargeBuf > 0) && !(P.state === "attack" && P.combo === 3)) P.tryCharge();
    if (canAct() && tg === qy) {
      const sh = B.shield && B.shield.hp > 0 ? B.shield.element : null;
      const idx = [0, 1, 2].filter((i) => S.spellAt(i));
      const order = bot === "skilled" && sh ? [...idx.filter((i) => S.spellAt(i).element === COUNTER[sh]), ...idx.filter((i) => S.spellAt(i).element !== COUNTER[sh])] : idx;
      let casted = !1;
      for (const i of order) if (cast(i, qy.pos)) { casted = !0; break; }
      // 法宝：熟留镇山印打断；其余冷却好就用（葫芦贴身吸）
      const isSeal = S.artifactDef && S.artifactDef.id === "seal";
      if (!casted && !(bot === "skilled" && isSeal) && bd < (S.artifactDef && S.artifactDef.id === "gourd" ? 5 : 10)) useArt(qy.pos);
      if (!casted && S.formationDef && !(S.cd.formation > 0) && H.mp >= S.formationDef.cost) {
        S.aimOverride = S.formationDef.kind === "aura" ? P.pos.clone() : qy.pos.clone();
        S.placeFormation();
        S.aimOverride = null;
      }
    }
    if (td < 1.9 && !tg.submerged) inp.mouse.left = !0;
    else moveTo(tg.pos, dt);
  };
  w.step = function (r) {
    if (QB.gate && !QB.inTurbo) return 0; // 加速期间挡掉主循环的步进
    raw += r;
    try {
      tick(r);
    } catch (e) {
      console.error("[num_qingya_build] tick", e);
      done = !0;
    }
    return step0.call(this, r);
  };
  while (!done) await sleep(50);
  w.step = step0;
  inp.mouse.left = !1;
  S.aimOverride = null;
  clearInterval(QB.turboT);
  QB.gate = !1;
  if (CK.mode === "virt") (CK.off = CK.vt - CK.rn()), (CK.mode = "real");
  G.ctx.hold3d = !1;
  for (const off of offs) off();
  const tot = Object.values(st.dmg).reduce((a, b) => a + b, 0) || 1;
  const maxHp = B.stats.get("hp");
  const won = !qy.alive || C.mode === "dead";
  return {
    result: won ? "win" : st.died ? "dead" : st.retreat ? "out" : "time", sec: r2(raw), fightSec: r2(st.fightT),
    bossLeft: won ? 0 : r2(Math.max(0, B.hp) / maxHp), phase: won ? 2 : C.phase, lost: st.died ? 1 : r2(st.taken / hmax), minHp: r2(st.minHp / hmax),
    pots: st.pots, mpPots: st.mpPots, n: st.n, window: st.fightT ? r2(st.safeT / st.fightT) : null,
    share: Object.fromEntries(Object.entries(st.dmg).map(([k, v]) => [k, r2(v / tot)])),
    hero: first ? { hp: hmax, atk: r2(H.stats.get("atk")), spell: r2(H.stats.get("spell")), crit: r2(H.stats.get("crit")), critDmg: r2(H.stats.get("critDmg")), aspd: r2(H.stats.get("aspd")), mp: Math.round(H.stats.get("mp")), dash: P.dashMax, def: r2(H.stats.get("def")), spells: pre.spells, xinfa: pre.xinfa, art: pre.artifact } : undefined,
  };
}
