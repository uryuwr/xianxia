// 宣传片镜头表：每个镜头 { name, open: 浏览器上下文选项, run(R) }。
// 原则：画面全部是游戏实时渲染；调试接口只用来布置（刷怪、给物品、改境界、跳天时、无敌），画面里不出现调试界面；
//       操作一律用真实键鼠事件（R.key / R.click / R.mdown …），鼠标轨迹逐帧平滑，像真人在玩。
// R.mark(k) 记下片段内的时间点（秒），合成脚本据此对齐字卡、音效。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------- 按键方案（tools/trailer/controls.json，环境变量 TRAILER_CHARGE / TRAILER_ARTIFACT 可临时覆盖）----------------
const CTRL = (() => {
  let c = { charge: "detect", artifact: "detect" };
  try {
    c = { ...c, ...JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "controls.json"), "utf8")) };
  } catch {}
  if (process.env.TRAILER_CHARGE) c.charge = process.env.TRAILER_CHARGE;
  if (process.env.TRAILER_ARTIFACT) c.artifact = process.env.TRAILER_ARTIFACT;
  return c;
})();

// detect：看游戏里有没有 player.tryCharge（右键蓄势斩的新版本）——有就是"右键蓄势斩 + V 法宝"，没有就是旧方案
async function ctrl(R) {
  if (CTRL.charge !== "detect" && CTRL.artifact !== "detect") return CTRL;
  const neo = await R.ev(() => typeof window.__game.player.tryCharge === "function");
  return { charge: CTRL.charge === "detect" ? (neo ? "right" : "auto") : CTRL.charge, artifact: CTRL.artifact === "detect" ? (neo ? "KeyV" : "right") : CTRL.artifact };
}

// 法宝：右键或某个键
async function castArtifact(R) {
  const C = await ctrl(R);
  if (C.artifact === "right") {
    await R.mdown("right");
    await R.frames(2);
    await R.mup("right");
  } else await R.key(C.artifact, 2);
  // 新方案下法宝可能也先出瞄准预览：左键确认
  await R.sec(0.35);
  if (await R.ev(() => !!(window.__targeting && __targeting.active))) {
    await R.mdown();
    await R.frames(2);
    await R.mup();
  }
}

// 连招接蓄势斩：auto = 按住左键等它自己接出；right = 按住左键打满三段，再按右键主动释放
async function comboCharge(R, { track = null, maxSec = 5 } = {}) {
  const C = await ctrl(R);
  if (C.charge === "right") {
    await R.ev(() => (window.__ev.attack = []));
    await holdAttack(R, () => window.__ev.attack.filter((s) => s >= 3).length > 0, { track, maxSec });
    if (process.env.TRAILER_DEBUG) console.log("[comboCharge]", JSON.stringify(await R.ev(() => ({ a: __ev.attack, st: __game.player.state, combo: __game.player.combo, mom: __game.player.momentum, d: window.__boss ? __boss.pos.distanceTo(__game.player.pos) : -1 }))));
    await R.sec(0.15, track);
    await R.mdown("right");
    for (let i = 0; i < 60; i++) {
      await R.frame(track);
      if (await R.ev(() => window.__ev.charge > 0)) break;
    }
    await R.mup("right");
  } else await holdAttack(R, () => window.__ev.charge > 0, { track, maxSec });
}

// ---------------- 通用 ----------------
const runReady = (R) =>
  R.until(() => window.__game && __game.run && __game.run.state === "play" && __game.ctx.enemies.ready && __game.heroSource && document.querySelector(".mk-layer-loading")?.classList.contains("hidden") !== !1, null, { timeout: 180000 });
const caveReady = (R) => R.until(() => window.__game?.flow?.name === "cave" && window.__cave?.active && !document.querySelector(".cv-loading") && __game.heroSource, null, { timeout: 180000 });

// 关掉调试 / 测试残留：F8 面板、提示；主角无敌（录制不能死）
async function clean(R, { god = !0 } = {}) {
  await R.ev((god) => {
    const G = window.__game;
    try {
      G.debug && G.debug.toggle && G.debug.open && G.debug.toggle(!1);
    } catch {}
    document.querySelectorAll(".mk-layer-debug, .jx-panel").forEach((e) => (e.style.display = "none"));
    document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    if (god) G.player.debug.god = !0;
  }, god);
}

// 局内：把存档调成"打过几局"的样子（境界、法术、青锋剑、飞剑），就地生效
async function buildHero(R, { stage = 1, layer = 6, spells = ["sword_qi", "frost", "vine"], imbue = null, rarity = 3, artifact = !0 } = {}) {
  await R.ev(
    async ([stage, layer, spells, imbue, rarity, artifact]) => {
      const G = window.__game, P = G.profile;
      const { makeItem } = await import("/src/core/items.js");
      const { makeGear } = await import("/src/game/loot.js");
      G.debug.realm(stage, layer);
      P.flags.tutorialDone = !0;
      P.stats.runs = Math.max(P.stats.runs || 0, 6);
      P.build.spells = spells.slice();
      P.unlocks.spellSlots = Math.max(P.unlocks.spellSlots || 1, spells.length);
      const sw = makeGear("sword_qingfeng", rarity, Math.max(1, layer), { identified: !0 });
      if (imbue) {
        sw.affixes = (sw.affixes || []).filter((a) => !/^imbue_/.test(a.stat));
        sw.affixes.push({ stat: "imbue_" + imbue, type: "flat", value: 1 });
      }
      P.equip.sword = sw;
      if (artifact) {
        P.unlocks.artifactSlot = !0;
        P.equip.artifact = makeItem("art_flying_sword", { identified: !0 });
      }
      G.ctx.applyProfileStats(P);
      const h = G.player.entity;
      h.hp = h.stats.get("hp");
      h.mp = h.stats.get("mp");
      h.stats.add({ stat: "mpRegen", type: "flat", value: 60, source: "trailer" });
      if (G.run && G.run.applyProfileToHero) try { G.run.applyProfileToHero(); } catch {}
      return G.ctx.skills.loadout || null;
    },
    [stage, layer, spells, imbue, rarity, artifact],
  );
}

// 局内准备：进 r1/r2、无敌、清场、停刷怪与夜潮、提示关掉
async function startRun(R, { region = "r1", hero = {}, clear = !0 } = {}) {
  await R.go(`scene=run&slot=1&region=${region}`);
  await runReady(R);
  await R.real(800);
  await buildHero(R, hero);
  await clean(R);
  await R.ev((clear) => {
    const G = window.__game, r = G.run;
    if (clear) r.clearEnemies && r.clearEnemies();
    G.ctx.enemies.auto = !1;
    r.nextWave = 1e9;
    r.bossSpawned = !0; // Boss 由镜头自己放
    window.__ev = { attack: [], charge: 0, broke: 0, killed: [], cast: [] };
    const w = G.world.events;
    w.on("player:attack", (e) => __ev.attack.push(e.step));
    w.on("player:charge", () => __ev.charge++);
    w.on("shield:break", () => __ev.broke++);
    w.on("enemy:killed", (e) => __ev.killed.push(e.type));
  }, clear);
}

// 把主角放到 (x, z)，镜头立刻跟上
async function place(R, x, z, view = "play", { dist = null, yaw = null } = {}) {
  await R.ev(([x, z, view, dist, yaw]) => {
    const G = window.__game;
    G.player.spawn(x, z);
    G.rig.set(view, !0);
    if (dist != null) G.rig.dist = dist;
    if (yaw != null) G.rig.yaw = yaw;
    G.rig.update(1, !0);
  }, [x, z, view, dist, yaw]);
}

// 相对主角刷怪；返回在 __sp 里的编号
async function spawn(R, type, dx, dz, opts = {}) {
  return R.ev(([type, dx, dz, opts]) => {
    const G = window.__game, T = G.THREE, P = G.player, h = G.ctx.terrain.height;
    const x = P.pos.x + dx, z = P.pos.z + dz;
    const e = G.ctx.enemies.spawn(type, new T.Vector3(x, h(x, z), z), { aggro: !0, ...opts });
    window.__sp = window.__sp || [];
    __sp.push(e);
    return __sp.length - 1;
  }, [type, dx, dz, opts]);
}

// 世界坐标 → 屏幕
const projJS = `(v)=>{const G=window.__game;v=v.clone();v.project(G.camera);return {x:((v.x+1)/2)*innerWidth,y:((1-v.y)/2)*innerHeight};}`;

// 鼠标每帧追着最近的活敌人（或 __sp[i]）
function trackEnemy(R, { idx = null, lerp = 0.35, dy = 0.6, type = null } = {}) {
  return async () => {
    const p = await R.ev(([idx, dy, type, projJS]) => {
      const G = window.__game, proj = eval(projJS), P = G.player.pos;
      let best = null;
      if (idx != null) best = window.__sp && __sp[idx];
      if (!best || !best.alive) {
        let bd = 1e9;
        for (const e of G.ctx.enemies.list) {
          if (!e.alive || (type && e.type !== type)) continue;
          const d = e.pos.distanceTo(P);
          if (d < bd) (bd = d), (best = e);
        }
      }
      if (!best || !best.alive) return null;
      const v = best.pos.clone();
      v.y += dy;
      return proj(v);
    }, [idx, dy, type, projJS]);
    if (!p) return;
    await R.moveRaw(R.mouse.x + (p.x - R.mouse.x) * lerp, R.mouse.y + (p.y - R.mouse.y) * lerp);
  };
}

// 用 WASD 走到 (x, z)：每帧按镜头朝向换算成 8 个方向的按键（真实键盘事件）；鼠标在前方引路
async function walkTo(R, x, z, { maxSec = 8, r = 0.8, each = null, mouse = !0 } = {}) {
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.has(k)) (await R.up(k), held.delete(k));
    for (const k of want) if (!held.has(k)) (await R.down(k), held.add(k));
  };
  for (let i = 0; i < maxSec * 30; i++) {
    const s = await R.ev(([x, z, projJS]) => {
      const G = window.__game, P = G.player, proj = eval(projJS);
      const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
      const c = Math.cos(P.camYaw), s = Math.sin(P.camYaw);
      const ix = dx * c - dz * s, iz = dx * s + dz * c;
      const ahead = P.pos.clone();
      ahead.x += (dx / (d || 1)) * 3;
      ahead.z += (dz / (d || 1)) * 3;
      ahead.y += 0.5;
      return { d, ix, iz, m: proj(ahead) };
    }, [x, z, projJS]);
    if (s.d < r) break;
    const a = Math.atan2(s.iz, s.ix);
    const oct = Math.round(a / (Math.PI / 4));
    const want = new Set();
    const dirs = { 0: ["KeyD"], 1: ["KeyD", "KeyS"], 2: ["KeyS"], 3: ["KeyA", "KeyS"], 4: ["KeyA"], "-4": ["KeyA"], "-3": ["KeyA", "KeyW"], "-2": ["KeyW"], "-1": ["KeyD", "KeyW"] };
    for (const k of dirs[oct]) want.add(k);
    await setKeys(want);
    if (mouse) await R.moveRaw(R.mouse.x + (s.m.x - R.mouse.x) * 0.15, R.mouse.y + (s.m.y - R.mouse.y) * 0.15);
    await R.frame(each);
  }
  await setKeys(new Set());
}

// 按住左键连招，直到 until(ev) 为真或超时
async function holdAttack(R, until, { maxSec = 6, track = null } = {}) {
  await R.mdown();
  for (let i = 0; i < maxSec * 30; i++) {
    await R.frame(track);
    if (await R.ev(until)) break;
  }
  await R.mup();
}

// 界面进场动画放完、数据填好：至少 min 秒，并且 root 里的有限动画全部结束后再稳 0.3 秒（录制规则：UI 段从这里开始取）
async function settle(R, sel, { min = 1.5, max = 6, each = null } = {}) {
  let quiet = 0;
  for (let i = 0; i < max * 30; i++) {
    await R.frame(each);
    const n = await R.ev((sel) => window.__vt.busy(sel), sel);
    quiet = n === 0 ? quiet + 1 : 0;
    if (i + 1 >= min * 30 && quiet >= 9) return !0;
  }
  console.log("[trailer] ⚠ 界面未稳定", sel);
  return !1;
}

// ---------------- 镜头 ----------------
export const SHOTS = [
  // ======== 开场 ========
  {
    // 标题：开始界面（墨途书法字 + 慢转的山水远景），合成时从黑屏起墨
    name: "s01_title",
    open: { settings: { hints: !1 } },
    async run(R) {
      await R.go("scene=title");
      await R.until(() => document.querySelector(".mk-layer-title .word"), null);
      await R.real(2500);
      await R.moveRaw(1000, 630);
      await R.begin();
      R.clip("s01_title");
      await R.sec(1.4);
      const b = await R.boxOf('.mk-layer-title [data-id="new"]');
      if (b) await R.mouseTo(b.x + 10, b.y, 34);
      await R.sec(0.6);
    },
  },
  {
    // 序章溪边：林墨持锈剑，三段连招砍狼，气势蓄满接蓄势斩（月牙剑气）
    name: "s02_fight",
    open: { settings: { hints: !1 } },
    async run(R) {
      await R.go("scene=run&slot=1&region=tutorial");
      await runReady(R);
      await R.real(1200);
      await clean(R);
      await R.ev(() => {
        const G = window.__game, r = G.run, P = G.player;
        const s = r.pro.steps.find((q) => q.id === "sword");
        r.containers.lootNow(r.containers.near(s.pos, 8));
        P.spawn(-14, 46.5);
        G.rig.set("closeup", !0);
        G.rig.dist = 14;
        G.rig.update(1, !0);
      });
      await R.moveRaw(500, 370);
      await R.begin();
      await R.skip(45);
      await R.ev(() => {
        const G = window.__game, T = G.THREE, E = G.ctx.enemies, P = G.player, h = G.ctx.terrain.height;
        document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
        const at = (x, z) => new T.Vector3(x, h(x, z), z);
        for (const [dx, dz, t] of [[-6.5, 0.6, "wolf"], [-7.5, -1.4, "wolf_grey"], [-8.2, 2.2, "wolf_grey"]]) E.spawn(t, at(P.pos.x + dx, P.pos.z + dz), { aggro: !0 });
        P.momentum = 70;
        P.momT = 0;
        window.__ev = { attack: [], charge: 0 };
        G.world.events.on("player:attack", (e) => __ev.attack.push(e.step));
        G.world.events.on("player:charge", () => __ev.charge++);
        // 前三段打不死（血量下限 30，伤害数字是真实结算的），留给蓄势斩收割
        G.world.events.on("damage", (i) => {
          if (i.attacker !== P.entity) return;
          if (!__ev.charge && i.target.hp < 30) i.target.hp = 30;
        });
      });
      R.clip("s02_fight");
      const track = trackEnemy(R);
      await R.sec(0.8, track);
      R.mark("swing");
      await comboCharge(R, { track });
      R.mark("charge");
      await R.sec(1.8);
    },
  },

  // ======== 世界与搜打撤 ========
  {
    // 迎客松下 → 竹林
    name: "s03_walk",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, -61, 45, "play", { dist: 22 });
      await R.begin();
      await R.skip(20);
      R.clip("s03_walk");
      await walkTo(R, -49, 31, { maxSec: 3.4 });
      await R.sec(0.2);
    },
  },
  {
    // 溪桥：过石桥
    name: "s03b_bridge",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, -17, 43, "play", { dist: 22 });
      await R.begin();
      await R.skip(20);
      R.clip("s03b_bridge");
      await walkTo(R, 0, 40.5, { maxSec: 3.2 });
    },
  },
  {
    // 天机镜（M）：卷轴地图，走过的地方着墨揭示
    name: "s04_map",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, -8, 41.5);
      // 先抹掉已探索，录制时逐步着墨
      await R.ev(() => {
        const E = __game.run.explored;
        window.__mapFill = [];
        for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) if (E.cells[y * E.w + x]) __mapFill.push(y * E.w + x);
        E.cells.fill(0);
        E.stamp++;
        // 沿着"走过的路线"由近及远着墨：西入口 → 竹林 → 溪桥 → 台地
        const pts = [[-62, 46], [-56, 34], [-50, 26], [-40, 32], [-30, 40], [-20, 44], [-8, 41.5], [2, 38], [8, 30], [14, 24], [22, 30], [30, 40]];
        const bx = __game.run.explored;
        window.__mapPath = pts;
      });
      await R.begin();
      await R.skip(10);
      R.clip("s04_map");
      await R.sec(0.4);
      await R.key("KeyM");
      R.mark("open");
      await settle(R, ".mk-layer-bigmap", { min: 0.6, max: 3 });
      R.mark("ready");
      // 逐帧把路线附近的格子"着墨"
      const N = 75;
      for (let i = 0; i < N; i++) {
        await R.ev(([i, N]) => {
          const r = __game.run, E = r.explored, pts = __mapPath;
          const k = (i / N) * (pts.length - 1), j = Math.floor(k), f = k - j;
          const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
          const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
          const B = E.b;
          const cx = Math.floor(((x - B.x0) / (B.x1 - B.x0)) * E.w), cy = Math.floor(((z - B.z0) / (B.z1 - B.z0)) * E.h);
          const rad = 5;
          for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
            if (dx * dx + dy * dy > rad * rad) continue;
            const X = cx + dx, Y = cy + dy;
            if (X >= 0 && Y >= 0 && X < E.w && Y < E.h) E.cells[Y * E.w + X] = 1;
          }
          E.stamp++;
          r.mapModel && (r.mapModel.t = 0);
          const mm = __game.flow.scenes.run.hudUI.mm;
          mm && mm.drawBig && mm.drawBig();
        }, [i, N]);
        await R.frame();
      }
      await R.sec(0.8);
      await R.key("KeyM");
      await R.sec(0.3);
    },
  },
  {
    // 斩妖留尸 → F 搜取：墨封宣纸格，神识一笔圆相逐格揭示，仙品顿笔泛金
    name: "s05_loot",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, 8, 34, "closeup", { dist: 16 });
      await R.ev(async () => {
        const G = window.__game, r = G.run;
        r.senseOverride = 0;
        const { makeItem } = await import("/src/core/items.js");
        window.__lootItems = () => [makeItem("spirit_stone", { n: 18 }), makeItem("wolf_fang", { n: 2 }), makeItem("lingbang_zhu", { rarity: 2 }), makeItem("zhuxin", { rarity: 3 })];
        G.world.events.on("enemy:killed", (e) => {
          const en = G.ctx.enemies.list.find((q) => q.entity === e.enemy);
          if (en && !window.__corpse) window.__corpse = r.containers.corpse(en, __lootItems(), en.pos);
        });
      });
      const wi = await spawn(R, "wolf", 4.5, -2.2, { noLoot: !0 });
      await R.ev((wi) => (__sp[wi].noLoot = !0), wi);
      await R.begin();
      await R.skip(6);
      R.clip("s05_loot");
      const track = trackEnemy(R, { idx: wi });
      await R.sec(0.5, track);
      await holdAttack(R, () => !!window.__corpse, { track, maxSec: 5 });
      R.mark("kill");
      await R.sec(0.6);
      const cp = await R.ev(() => ({ x: __corpse.pos.x, z: __corpse.pos.z }));
      await walkTo(R, cp.x - 0.9, cp.z + 0.5, { maxSec: 2, r: 0.5 });
      await R.sec(0.15);
      await R.key("KeyF");
      R.mark("open");
      // 等最后一格（仙品）揭示
      for (let i = 0; i < 200; i++) {
        await R.frame();
        const done = await R.ev(() => {
          const c = __game.run.containers.openC;
          return !c || c.slots.every((s) => s.state !== "hidden" && s.state !== "search");
        });
        if (done) break;
      }
      R.mark("xian");
      await R.sec(1.2);
      await R.key("KeyF");
      await R.sec(0.6);
    },
  },
  {
    // 开箱
    name: "s06_chest",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      const m = await R.ev(async () => {
        const G = window.__game, r = G.run, P = G.player.pos;
        r.senseOverride = 20;
        const { makeItem } = await import("/src/core/items.js");
        const o = r.rollLoot;
        r.rollLoot = (s, x) => (String(s).startsWith("chest") ? [makeItem("huichun_dan", { n: 2 }), makeItem("tiejing_shi", { n: 3, rarity: 1 }), makeItem("water_jade", { rarity: 3 })] : o(s, x));
        const cs = r.marks.filter((m) => m.kind === "chest");
        cs.sort((a, b) => (b.tier === "glow") - (a.tier === "glow"));
        const c = cs[0];
        return c && { x: c.pos.x, z: c.pos.z, tier: c.tier };
      });
      if (!m) throw new Error("没有宝箱");
      await place(R, m.x + 3.2, m.z + 2.2, "closeup", { dist: 15 });
      await R.begin();
      await R.skip(10);
      R.clip("s06_chest");
      await walkTo(R, m.x + 1.3, m.z + 0.9, { maxSec: 1.5, r: 0.4 });
      await R.sec(0.1);
      await R.key("KeyF");
      R.mark("open");
      await R.sec(2.6);
      await R.key("KeyF");
      await R.sec(0.5);
    },
  },
  {
    // 储物袋（Tab）：右侧纸笺，格子按占格摆放
    name: "s07_bag",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, -30, 40);
      await R.ev(async () => {
        const r = __game.run;
        const { makeItem } = await import("/src/core/items.js");
        for (const [id, o] of [["zhuxin", { rarity: 3 }], ["water_jade", { rarity: 2 }], ["lingbang_zhu", { rarity: 2 }], ["wolf_fang", { n: 4 }], ["wolf_hide", { n: 2 }], ["qingling_cao", { n: 5, rarity: 1 }], ["hanlu_cao", { n: 2, rarity: 2 }], ["tiejing_shi", { n: 3 }], ["spirit_stone", { n: 46 }], ["huichun_dan", { n: 2 }], ["wolf_core", { rarity: 1 }]])
          r.bag.add(makeItem(id, o));
        r.emit && r.emit("bag");
      });
      await R.begin();
      await R.skip(8);
      R.clip("s07_bag");
      await R.sec(0.3);
      await R.key("Tab");
      R.mark("open");
      await settle(R, ".mk-layer-bag", { min: 0.6, max: 3 });
      R.mark("ready");
      // 鼠标扫过几件物品
      const toks = await R.ev(() => [...document.querySelectorAll(".mk-bagui .mk-tok")].slice(0, 6).map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }));
      for (const t of toks.slice(0, 3)) {
        await R.mouseTo(t.x, t.y, 10);
        await R.sec(0.5);
      }
      await R.key("Tab");
      await R.sec(0.3);
    },
  },
  {
    // 天时：晨 → 夜，灵潮倍率上升；入夜妖潮来袭
    name: "s08_night",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      await place(R, -26, 38, "play", { dist: 34 });
      await R.ev(() => (__game.run.t = 60));
      await R.begin();
      await R.skip(10);
      R.clip("s08_night");
      // 4 秒里天时从晨走到夜（主角原地警戒，鼠标慢慢扫）
      const N = 120;
      for (let i = 0; i < N; i++) {
        await R.ev(([i, N]) => {
          const r = __game.run, k = (i + 1) / N;
          r.t = 60 + (r.R.phases[2] + 70 - 60) * (k * k * (3 - 2 * k));
        }, [i, N]);
        if (i % 4 === 0) await R.moveRaw(600 + 200 * Math.sin(i / 20), 350 + 50 * Math.cos(i / 25));
        await R.frame();
      }
      R.mark("night");
      // 妖潮（游戏自己的 spawnWave：吐字"妖潮来袭！"）；出生点挪近一些，镜头里看得见扑过来
      await R.ev(() => {
        const G = window.__game, r = G.run, E = G.ctx.enemies, P = G.player, V = G.THREE.Vector3;
        r.spawnWave = (n, elite) => {
          const out = E.spawnPack(Math.max(4, n), elite, P.pos.clone().add(new V(11, 0, -6))) || [];
          for (const e of out) r.buffEnemy && r.buffEnemy(e), e.setAggro && e.setAggro();
          return out;
        };
        r.nextWave = r.t;
      });
      await R.sec(2.4, trackEnemy(R, { lerp: 0.12 }));
    },
  },
  {
    // 读条撤离：古传送阵，读条结束金光拔地，结算手卷
    name: "s09_extract",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1" });
      const g = await R.ev(async () => {
        const r = __game.run;
        const { makeItem } = await import("/src/core/items.js");
        for (const [id, o] of [["zhuxin", { rarity: 3 }], ["lingbang_zhu", { rarity: 2 }], ["wolf_fang", { n: 4 }], ["spirit_stone", { n: 60 }], ["qingling_cao", { n: 5, rarity: 1 }]]) r.bag.add(makeItem(id, o));
        r.bag.add({ ...makeItem("sword_zhuying", { rarity: 3 }), identified: !1 });
        r.emit && r.emit("bag");
        r.t = r.R.phases[1] + 20; // 暮
        const x = r.extracts.find((x) => x.kind === "gate" && x.pos.x < 0) || r.extracts.find((x) => x.kind === "gate");
        return { x: x.pos.x, z: x.pos.z };
      });
      await place(R, g.x + 4, g.z + 1.5, "closeup", { dist: 18 });
      await R.begin();
      await R.skip(10);
      R.clip("s09_extract");
      await walkTo(R, g.x, g.z, { maxSec: 1.5, r: 0.5 });
      await R.key("KeyF");
      R.mark("channel");
      await R.ev(() => {
        const r = __game.run;
        if (r.channel) r.channel.need = 3.2;
        r.clearEnemies && r.clearEnemies();
      });
      for (let i = 0; i < 150; i++) {
        await R.frame();
        if (await R.ev(() => __game.flow.name === "result")) break;
      }
      R.mark("result");
      await R.moveRaw(1240, 700); // 鼠标挪开，别挡账目、别弹物品浮签
      await settle(R, ".mk-layer-result", { min: 1.5, max: 8 });
      R.mark("resultReady");
      await R.sec(3.6);
    },
  },

  // ======== 洞府与成长 ========
  ...caveShots(),

  // ======== 战斗高潮 ========
  {
    // 精英五行护盾：法术瞄准预览（射程 / 轨迹），以克制法术破盾，"破盾"大字；附灵火剑连斩
    name: "s17_shield",
    open: { settings: { hints: !1 } },
    async run(R) {
      await startRun(R, { region: "r1", hero: { stage: 1, layer: 8, imbue: "fire", spells: ["sword_qi", "frost", "vine"] } });
      await place(R, 4, 37, "closeup", { dist: 17 });
      const ei = await spawn(R, "wolf_elite", 6.5, -1.5, { shield: "wood" });
      await R.ev((ei) => {
        const G = window.__game, e = __sp[ei];
        if (e.entity.shield) e.entity.shield.hp = Math.min(e.entity.shield.hp, 40);
        e.entity.stats.setBase("hp", 700);
        e.entity.hp = 700;
        G.world.applyStatus(e.entity, "stun", { dur: 1.6 }); // 先站定亮出护盾
        // 蓄势斩之前血量不低于 10%（只抬血，不造假伤害），蓄势斩的真实伤害收尾
        G.world.events.on("damage", (i) => {
          if (i.target === e.entity && !__ev.charge && e.entity.hp < 70) e.entity.hp = 70;
        });
      }, ei);
      await R.begin();
      await R.skip(4);
      R.clip("s17_shield");
      const track = trackEnemy(R, { idx: ei, lerp: 0.3 });
      await R.sec(0.7, track);
      await R.key("KeyQ"); // 剑气斩：先出预览（射程、轨迹）
      R.mark("aim");
      await R.sec(0.9, track);
      await R.mdown();
      await R.frames(2);
      await R.mup();
      R.mark("cast");
      for (let i = 0; i < 45; i++) {
        await R.frame(track);
        if (await R.ev(() => __ev.broke > 0)) break;
      }
      if (!(await R.ev(() => __ev.broke > 0))) await R.ev((ei) => __game.ctx.shields.breakShield(__sp[ei].entity), ei);
      R.mark("break");
      await R.sec(0.5, track);
      // 火剑连斩眩晕中的精英，气势满接蓄势斩
      await R.ev(() => ((__game.player.momentum = 72), (__game.player.momT = 0)));
      const near = await R.ev((ei) => __sp[ei].pos.distanceTo(__game.player.pos), ei);
      if (near > 3) {
        const p = await R.ev((ei) => ({ x: __sp[ei].pos.x, z: __sp[ei].pos.z }), ei);
        const me = await R.ev(() => ({ x: __game.player.pos.x, z: __game.player.pos.z }));
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        await walkTo(R, p.x - ((p.x - me.x) / d) * 2.2, p.z - ((p.z - me.z) / d) * 2.2, { maxSec: 1.2, r: 0.4 });
      }
      await comboCharge(R, { track, maxSec: 4 });
      R.mark("charge");
      await R.sec(1.6);
    },
  },
  {
    // Boss 青牙：多段护盾，最后一击蓄势斩，命中时慢动作 + "斩"
    name: "s18_boss",
    open: { settings: { hints: !1 } },
    timeout: 400,
    async run(R) {
      await startRun(R, { region: "r1", hero: { stage: 2, layer: 1, imbue: "fire", spells: ["sword_qi", "frost", "vine"] } });
      await place(R, 44, -19, "closeup", { dist: 21 });
      const bi = await R.ev(() => {
        const G = window.__game, r = G.run, T = G.THREE, h = G.ctx.terrain.height;
        const x = 50.5, z = -23;
        const b = G.ctx.enemies.spawnBoss(new T.Vector3(x, h(x, z), z), "qingya");
        r.buffEnemy && r.buffEnemy(b);
        b.setAggro && b.setAggro("wave");
        window.__sp = window.__sp || [];
        __sp.push(b);
        window.__boss = b;
        if (b.def && b.def.attacks) for (const a of b.def.attacks) a.summon && (a.summon.n = 0); // 不召唤小狼，画面干净
        const e = b.entity;
        if (e.shield) e.shield.hp = Math.min(e.shield.hp, 60);
        // 血量下限：按分镜推进（第一段 56%、第二段 30%、收尾 2%），蓄势斩之前打不死（在扣血前改伤害）
        window.__bossFloor = 0.56;
        G.world.events.on("damage", (i) => {
          const f = e.stats.get("hp") * __bossFloor;
          if (i.target === e && !__ev.charge && e.hp < f) e.hp = f; // 只抬血，伤害数字照常是真实结算
        });
        return __sp.length - 1;
      });
      const breakNow = async (n, maxF) => {
        for (let i = 0; i < maxF; i++) {
          await R.frame(track);
          if (await R.ev((n) => __ev.broke >= n, n)) return;
        }
        await R.ev(() => __boss.entity.shield && __boss.entity.shield.hp > 0 && __game.ctx.shields.breakShield(__boss.entity));
      };
      const approach = async (dist = 2.6) => {
        const s = await R.ev(() => ({ b: { x: __boss.pos.x, z: __boss.pos.z }, p: { x: __game.player.pos.x, z: __game.player.pos.z } }));
        const d = Math.hypot(s.b.x - s.p.x, s.b.z - s.p.z);
        if (d > dist + 0.6) await walkTo(R, s.b.x - ((s.b.x - s.p.x) / d) * dist, s.b.z - ((s.b.z - s.p.z) / d) * dist, { maxSec: 1.4, r: 0.5 });
      };
      const track = trackEnemy(R, { idx: bi, lerp: 0.3, dy: 1.0 });
      await R.begin();
      await R.skip(4);
      R.clip("s18_boss");
      await R.sec(1.1, track);
      // 第一层木盾：剑气斩（金克木）
      await R.key("KeyQ");
      R.mark("aim1");
      await R.sec(0.6, track);
      await R.mdown();
      await R.frames(2);
      await R.mup();
      await breakNow(1, 40);
      R.mark("break1");
      await R.sec(0.4, track);
      // 砍到半血 → 第二层土盾
      await approach();
      await R.ev(() => {
        const e = __boss.entity;
        window.__bossFloor = 0.3;
        e.hp = e.stats.get("hp") * 0.53;
      });
      await holdAttack(R, () => !!(__boss.entity.shield && __boss.entity.shield.hp > 0), { track, maxSec: 2.2 });
      await R.ev(() => {
        const e = __boss.entity;
        if (e.shield) e.shield.hp = Math.min(e.shield.hp, 50);
      });
      R.mark("phase2");
      await R.sec(0.5, track);
      // 缠藤诀（木克土）
      await R.key("KeyR");
      R.mark("aim2");
      await R.sec(0.6, track);
      await R.mdown();
      await R.frames(2);
      await R.mup();
      await breakNow(2, 50);
      R.mark("break2");
      await R.sec(0.3, track);
      // 法宝：飞剑
      await castArtifact(R);
      R.mark("artifact");
      await R.sec(0.9, track);
      if (process.env.TRAILER_DEBUG) console.log("[boss]", JSON.stringify(await R.ev(() => ({ alive: __boss.alive, hp: __boss.entity.hp, max: __boss.entity.stats.get("hp"), st: __boss.state, sh: __boss.entity.shield && __boss.entity.shield.hp }))));
      // 收尾：气势满，近身三段 + 蓄势斩，命中时慢动作
      await R.ev(() => {
        const G = window.__game, P = G.player, e = __boss.entity;
        if (e.shield && e.shield.hp > 0) G.ctx.shields.breakShield(e);
        e.hp = e.stats.get("hp") * 0.04;
        P.momentum = 100;
        P.momT = 0;
        window.__bossFloor = 0.02;
      });
      await approach(2.2);
      if (process.env.TRAILER_DEBUG) console.log("[boss2]", JSON.stringify(await R.ev(() => ({ alive: __boss.alive, hp: __boss.entity.hp, st: __boss.state }))));
      await comboCharge(R, { track, maxSec: 4 });
      if (process.env.TRAILER_DEBUG) console.log("[boss3]", JSON.stringify(await R.ev(() => ({ alive: __boss.alive, hp: __boss.entity.hp, st: __boss.state, ch: __ev.charge }))));
      R.mark("charge");
      // 慢动作：每帧只推进 1/3 的游戏时间（游戏本身逐帧渲染，不是后期插帧）
      const dt0 = R.dt;
      R.dt = dt0 / 2; // 游戏满势蓄势斩自带慢动作与推镜，这里再放慢一半
      await R.sec(0.35);
      // 等蓄势斩的真实伤害把青牙打倒；没倒就继续左键补刀
      for (let i = 0; i < 20 && (await R.ev(() => __boss.alive)); i++) await R.frame();
      if (await R.ev(() => __boss.alive)) await holdAttack(R, () => !__boss.alive, { track, maxSec: 3 });
      R.mark("kill");
      await R.sec(1.2);
      R.dt = dt0;
      await R.sec(1.4);
      R.mark("end");
    },
  },
];

// ---------------- 洞府 ----------------
function caveShots() {
  // 洞府存档：练气四层差一点圆满、设施修好、材料齐、新手提示已看过
  const setup = async (R, { xp = 240 } = {}) => {
    await R.go("scene=cave&slot=1");
    await caveReady(R);
    await R.real(1200);
    await R.ev(async (xp) => {
      const g = window.__game, P = g.profile, cv = window.__cave, F = cv.F;
      const { makeItem } = await import("/src/core/items.js");
      const { makeGear } = await import("/src/game/loot.js");
      g.debug.realm(1, 4);
      P.xp = xp;
      try {
        delete P.stats.breakHistory;
        F.ensureBreakHistory && F.ensureBreakHistory(P);
      } catch {}
      P.stats.runs = 6;
      P.flags.caveTips = Object.fromEntries(["enter", "spring", "workshop", "storage", "depart", "mirror", "economy", "gardenIntro", "breakReady", "garden"].map((k) => [k, !0]));
      Object.assign(F.caveState(P).facilities, { spring: 2, furnace: 2, forge: 2, garden: 1 });
      const give = (id, n = 1, r = 0) => g.debug.give(id, n, r);
      give("spirit_stone", 900);
      give("qingling_cao", 6, 2);
      give("ninglu_hua", 4, 1);
      give("tiejing_shi", 3, 3);
      give("wolf_fang", 4);
      give("chiyan_guo", 3);
      give("bat_core", 1);
      give("ling_yu", 3);
      give("stone_heart", 2);
      P.equip.sword = makeGear("sword_qingfeng", 3, 4, { identified: !0 });
      cv.changed({ stats: !0 });
      cv.ui && cv.ui.speech && cv.ui.speech.clear && cv.ui.speech.clear();
      g.flow.save();
    }, xp);
    await R.real(600);
    await clean(R);
  };
  return [
    {
      // 洞府小院：今日可办，点一下走过去
      name: "s10_cave",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.moveRaw(870, 470);
        await R.begin();
        await R.skip(10);
        R.clip("s10_cave");
        await R.sec(0.8);
        const row = await R.ev(() => {
          const rows = [...document.querySelectorAll(".cv-today .ink-row")];
          const r = rows.find((x) => /灵泉|炼化/.test(x.textContent)) || rows[0];
          if (!r) return null;
          const b = r.getBoundingClientRect();
          return { x: b.x + b.width * 0.4, y: b.y + b.height / 2 };
        });
        if (row) {
          await R.mouseTo(row.x, row.y, 22);
          await R.sec(0.3);
          await R.click(null, null, { hold: 2 });
          R.mark("click");
        }
        await R.sec(3.0);
      },
    },
    {
      // 灵泉炼化 → 突破 → 境界
      name: "s11_break",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.begin();
        await R.skip(6);
        R.clip("s11_break");
        await R.key("KeyC");
        R.mark("page");
        await settle(R, ".cv-page[data-id=spring]", { min: 1.5, max: 4 });
        R.mark("pageReady");
        await R.clickSel(".cv-page[data-id=spring] [data-act=refine]", { move: 16 });
        R.mark("refine");
        for (let i = 0; i < 150; i++) {
          await R.frame();
          if (await R.ev(() => !!document.querySelector("[data-act=break]:not(.is-disabled)"))) break;
        }
        await R.sec(0.3);
        await R.clickSel("[data-act=break]:not(.is-disabled)", { move: 14 });
        R.mark("break");
        await R.sec(5.2);
        const ok = await R.ev(() => !!document.querySelector("[data-act=break-done]"));
        if (ok) await R.clickSel("[data-act=break-done]", { move: 12 });
        await R.sec(0.6);
      },
    },
    {
      // 天机镜：圆镜里的手机，境界录
      name: "s12_mirror",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R, { xp: 299 });
        // 先在后台突破一次，让镜子里有新的一条境界录
        await R.ev(async () => {
          window.__cave.p.xp = 300;
        });
        await R.real(300);
        await R.ev(async () => {
          try {
            const r = window.__cave.breakthrough();
            r && r.catch && r.catch(() => {});
          } catch (e) {
            console.log("[trailer] break", e && e.message);
          }
        });
        await R.real(2500);
        await R.ev(() => document.querySelector("[data-act=break-done]")?.click());
        await R.real(1500);
        await R.begin();
        await R.skip(6);
        R.clip("s12_mirror");
        await R.sec(0.3);
        await R.key("KeyM");
        R.mark("open");
        await settle(R, ".mv2", { min: 1.5, max: 5 });
        R.mark("ready");
        const e = await R.boxOf(".mv2 .mj-e");
        if (e) {
          await R.mouseTo(e.x, e.y, 12);
          await R.click(null, null);
        }
        await R.sec(1.6);
        const mem = await R.boxOf(".mv2 .mj-memc");
        if (mem) {
          await R.mouseTo(mem.x, mem.y, 12);
          await R.click(null, null);
          await R.sec(2.0);
        }
        await R.key("KeyM");
        await R.sec(0.4);
      },
    },
    {
      // 丹器房 · 炼器：青铜方鼎，仙品青锋剑
      name: "s13_forge",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.ev(() => window.__cave.open("workshop", "forge"));
        await R.real(1500);
        await R.begin();
        await R.skip(6);
        R.clip("s13_forge");
        await R.sec(0.4);
        const row = await R.boxOf(".ws2-list .ws2-row[data-rec=sword]");
        if (row) await R.click(row.x, row.y, { move: 14 });
        await R.sec(0.5);
        const q = await R.boxOf(".ws2-qpick > div[data-q='3']");
        if (q) await R.click(q.x, q.y, { move: 12 });
        await R.sec(0.5);
        await R.clickSel("[data-act=craft-sword]", { move: 14 });
        R.mark("craft");
        await R.sec(1.0);
        await settle(R, ".cv-page[data-id=workshop]", { min: 1.5, max: 5 });
        R.mark("result");
        await R.sec(2.2);
        const ok = await R.boxOf("[data-act=forge-ok]");
        if (ok) await R.click(ok.x, ok.y, { move: 12 });
        await R.sec(0.4);
      },
    },
    {
      // 丹器房 · 炼丹：八卦炉守火候
      name: "s14_alchemy",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.ev(() => {
          window.__cave.debug.alchemyTime = 5;
          window.__cave.open("workshop", "alchemy");
        });
        await R.real(1500);
        await R.begin();
        await R.skip(6);
        R.clip("s14_alchemy");
        await R.sec(0.3);
        const row = await R.boxOf(".ws2-row[data-rec=huichun]");
        if (row) await R.click(row.x, row.y, { move: 12 });
        await R.sec(0.4);
        await R.clickSel("[data-act=brew]", { move: 12 });
        R.mark("brew");
        let held = !1;
        for (let i = 0; i < 300; i++) {
          const s = await R.ev(() => {
            const f = window.__cave.ui.fire;
            return f ? { t: f.g.temp, v: f.g.vel, c: f.g.center } : null;
          });
          if (!s) break;
          const want = s.t + s.v * 0.35 < s.c;
          if (want !== held) (want ? await R.down("Space") : await R.up("Space"), (held = want));
          await R.frame();
        }
        if (held) await R.up("Space");
        R.mark("done");
        await R.sec(2.4);
      },
    },
    {
      // 重铸词条：旧 → 新，揭示
      name: "s15_reforge",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.ev(() => window.__cave.open("forge", "reforge"));
        await R.real(1500);
        await R.begin();
        await R.skip(6);
        R.clip("s15_reforge");
        await R.sec(0.3);
        const a = await R.boxOf(".rf-list .ink-row[data-aff]:not(.off)");
        if (a) await R.click(a.x, a.y, { move: 12 });
        await R.sec(0.4);
        await R.clickSel("[data-act=reforge]", { move: 12 });
        R.mark("reforge");
        await R.sec(2.2);
        const ok = await R.boxOf("[data-act=rf-accept]");
        if (ok) await R.click(ok.x, ok.y, { move: 12 });
        await R.sec(0.6);
      },
    },
    {
      // 五行附灵：火，回到院子挥剑看剑光变色
      name: "s16_imbue",
      open: { settings: { hints: !1 } },
      async run(R) {
        await setup(R);
        await R.ev(() => window.__cave.open("forge", "imbue"));
        await R.real(1500);
        await R.begin();
        await R.skip(6);
        R.clip("s16_imbue");
        await R.sec(0.3);
        const row = await R.boxOf(".ws2-row[data-rec=imbue_fire]");
        if (row) await R.click(row.x, row.y, { move: 12 });
        await R.sec(0.4);
        await R.clickSel("[data-act=craft-imbue_fire]", { move: 12 });
        R.mark("imbue");
        await R.sec(2.6);
      },
    },
  ];
}

// 给其他镜头表（shots_qingya.mjs）复用的工具
export { ctrl, castArtifact, comboCharge, runReady, caveReady, clean, place, spawn, projJS, trackEnemy, walkTo, holdAttack, settle };
