// 青牙 v2 宣传片镜头表（node tools/trailer/build.mjs --edit=qingya；分镜见 docs/promo/青牙_v2_分镜.md）。
// 每个镜头：走 src/dev/promo.js 的 URL 入口按档位进场 → 画面外布置（首领位置 / 血量 / 护盾 / 狼威，见 qingya_act.stage）→ 虚拟时钟逐帧录制，
// 主角操作全部是真实键鼠（qingya_act.mjs），首领"出哪一招"由调试接口指定，招式本身、命中、撞柱、打断、处决全是游戏真实结算。
// 档位：T1 练二（初见被虐）/ T2 练四（打到二阶段）/ T3 练七（打死）/ T4 筑基（轻松通关），与数值策划 num_qingya.mjs preset(L) 同步。
import * as A from "./qingya_act.mjs";

// 跟拍机位：closeup 拉远到 dist（青牙体型大，14 米太近）
const view = (R, dist = 20, pitch = null) =>
  R.ev(([d, p]) => {
    const G = window.__game;
    G.rig.set("closeup", !0);
    G.rig.dist = d;
    if (p != null) G.rig.pitch = (p * Math.PI) / 180;
    G.rig.update(1, !0);
  }, [dist, pitch]);
// 进场 + 等开战（at=fight：直接开战，tries>1 是 1.2 秒短版入场）
async function fightReady(R, o) {
  await A.enter(R, { at: "fight", god: "1", ...o });
  await A.waitUntil(R, () => __q() && __q().ctrl.mode === "fight", null, { maxSec: 8 });
  await A.bossHold(R, !0);
  await R.ev(() => document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove()));
  await R.real(2200); // 等入场题签退场
}
// 空地站位（镜头在南边往北看：主角在南、首领在北，中间和镜头前都没有石柱）
const BOSS = [51.5, -21.8], HERO = [52.6, -16.8];
// 每帧检查：朝主角的直线冲扑到点前 0.14 秒按方向键 + 空格闪开（"会闪"的练四）
function dodger(R, keys = ["KeyA", "KeyD"]) {
  let k = 0;
  return async () => {
    const go = await R.ev(() => {
      const w = __game.world;
      if (!window.__dg) {
        window.__dg = { at: null };
        w.events.on("enemy:telegraph", (x) => {
          const q = __q();
          if (!q || x.enemy !== q.entity || (q.atk && q.atk.channel)) return;
          __dg.at = w.time + Math.max(0.05, x.dur - 0.14);
        });
      }
      if (__dg.at != null && w.time >= __dg.at) return (__dg.at = null), !0;
      return !1;
    });
    if (go) {
      const key = keys[k++ % keys.length];
      await R.down(key);
      await R.key("Space", 2);
      await R.up(key);
    }
  };
}

export const SHOTS = [
  // ① 狼谷空镜：无 HUD，镜头从谷上空摇下，经北图腾、狼牙石柱，落到狼王石上打盹的青牙
  {
    name: "q01_valley",
    open: { settings: { hints: !1 } },
    async run(R) {
      await A.enter(R, { preset: "T1", at: "gate", hud: "0", god: "1" });
      await A.waitUntil(R, () => !!__q(), null, { maxSec: 10 });
      await R.real(600);
      await R.begin();
      await R.skip(10);
      R.clip("q01_valley");
      await A.camPath(R, [
        { t: 0, target: [53, 0, -27], dist: 62, pitch: 58, yaw: 0.25 },
        { t: 3.2, target: [59, 1, -30], dist: 30, pitch: 40, yaw: 0.45 },
        { t: 6.0, target: [48, 1, -20], dist: 24, pitch: 36, yaw: 0.05 },
        { t: 9.0, target: [50, 1.8, -24.5], dist: 15, pitch: 30, yaw: -0.15 },
      ]);
      R.mark("rock");
      await R.sec(1.2);
      R.mark("end");
    },
  },
  // ④ 第 1 次（练二）：走进谷 → 完整入场（初见、"折其威，可斩"）→ 长嚎没断，群狼合围 → 裂风三扑 → 身陨
  {
    name: "q02_first",
    open: { settings: { hints: !1 } },
    timeout: 420,
    async run(R) {
      await A.enter(R, { preset: "T1", tries: "1", at: "pit", god: "0" });
      await view(R, 20);
      await R.real(400);
      await R.begin();
      await R.skip(6);
      R.clip("q02_first");
      await R.sec(0.4);
      await A.walkToBoss(R);
      R.mark("intro");
      await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 7 });
      R.mark("fight");
      await A.bossHold(R, !0);
      const each = A.aim(R);
      await A.approach(R, 3.0);
      // 练二只会砍：左键砍着，长嚎读完 → 群狼
      await R.mdown();
      await A.bossDo(R, "summon_howl", { each });
      R.mark("howl");
      await A.waitUntil(R, () => !__q().atk, null, { maxSec: 3, each });
      R.mark("pack");
      await R.sec(1.6, each);
      await R.mup();
      // 裂风三扑，直到倒下
      for (let i = 0; i < 6 && !(await R.ev(() => !__game.player.entity.alive || __game.player.state === "dead")); i++) {
        await A.bossDo(R, i % 2 ? "sweep" : "rend", { each, maxSec: 4 });
        if (i === 0) R.mark("rend");
        await A.waitUntil(R, () => !__q().atk || __game.player.state === "dead", null, { maxSec: 3, each });
        await R.sec(0.3, each);
      }
      R.mark("dead");
      await R.sec(2.4);
      R.mark("end");
    },
  },
  // ② 引撞柱 → 满势斩（练四，第 3 次）
  {
    name: "q03_crash",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T2", tries: "3", last: "0.78" });
      await A.nearPillar(R, "fang_3", { gap: 3.0, hero: 4.0 });
      await A.stage(R, { poise: 10, clear: !0 });
      await A.momentum(R, 100);
      await view(R, 19);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("q03_crash");
      await R.sec(0.3);
      await A.lurePillar(R, { pillar: "fang_3" });
      await R.sec(0.25, A.aim(R));
      await A.approach(R, 1.6, { maxSec: 1 });
      await A.charge(R);
      R.mark("charge");
      await R.sec(2.0, A.aim(R));
      R.mark("end");
    },
  },
  // ② 打断长嚎（练四）：剑气斩三道 → "断"
  {
    name: "q04_howl",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T2", tries: "3", last: "0.78" });
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, clear: !0, poise: 20 });
      await view(R, 19);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("q04_howl");
      await R.sec(0.4, A.aim(R));
      await A.interruptHowl(R, { by: "KeyQ", wait: 0.55 });
      await R.sec(2.4, A.aim(R));
      R.mark("end");
    },
  },
  // ①④ 打到二阶段（练四，第 4 次）：剑气斩（金克木）破木盾 → 转阶段全程（遮月、骨甲崩裂、墨雾变浓、土盾重生）——没有横幅
  {
    name: "q05_phase",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T2", tries: "4", last: "0.62" });
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, hp: 0.5, shield: 70, clear: !0, poise: 30 });
      await view(R, 21);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("q05_phase");
      await R.sec(0.5, A.aim(R));
      await A.cast(R, "KeyQ");
      R.mark("cast");
      await A.waitUntil(R, () => __qn("boss:phase") > 0, null, { maxSec: 3, each: A.aim(R) });
      R.mark("phase");
      await R.sec(4.2);
      R.mark("p2");
      await R.sec(2.0, A.aim(R));
      R.mark("end");
    },
  },
  // ② 二阶段攻防（练七，第 6 次）：缠藤（木克土）破土盾 → 站进月光，影袭落空 → 寒冰锥断啸月 → 威折 → ③ 威折处决
  {
    name: "q06_p2",
    open: { settings: { hints: !1 } },
    timeout: 420,
    async run(R) {
      await fightReady(R, { preset: "T3", tries: "6", last: "0.31", lastPhase: "2", mp: "1" });
      await A.stage(R, { phase2: !0, hp: 0.42 });
      await A.bossHold(R, !0);
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, shield: 140, clear: !0, poise: 0 });
      await view(R, 20);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("q06_p2");
      await R.sec(0.4, A.aim(R));
      const b0 = await A.qn(R, "shield:break");
      await A.cast(R, "KeyE");
      await A.waitUntil(R, (n) => __qn("shield:break") > n, b0, { maxSec: 3, each: A.aim(R) });
      R.mark("vine");
      await R.sec(1.6, A.aim(R));
      await A.waitUntil(R, () => !__q().ctrl.broken && __q().state !== "down", null, { maxSec: 6, each: A.aim(R) });
      R.mark("moonGo");
      await A.standMoon(R);
      R.mark("denied");
      await R.sec(1.4, A.aim(R));
      // 画面外（剪辑在此切开）：狼威垫到 60，主角回到首领面前
      await A.waitUntil(R, () => !__q().atk, null, { maxSec: 3 });
      await A.stage(R, { clear: !0, poise: 60, cd: 3 });
      await A.approach(R, 3.6);
      R.mark("howlGo");
      await A.interruptHowl(R, { id: "moon_howl", by: "KeyR", wait: 0.7 });
      await R.sec(0.4, A.aim(R));
      await A.breakExec(R);
      await R.sec(1.6, A.aim(R));
      R.mark("end");
    },
  },
  // ③ 终结处决（练七，首斩：完整 4 秒）：连段 + 满势斩打到气竭 → F → 留白、一笔、"斩"、朱印"青牙伏诛"、化墨 → 感悟
  {
    name: "q07_final",
    open: { settings: { hints: !1 } },
    timeout: 400,
    async run(R) {
      await fightReady(R, { preset: "T3", tries: "6", last: "0.31", lastPhase: "2", mp: "1" });
      await A.stage(R, { phase2: !0, hp: 0.05 });
      await A.bossHold(R, !0);
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, shield: 0, clear: !0, poise: 0 });
      await A.momentum(R, 100);
      await view(R, 18);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("q07_final");
      await R.sec(0.3, A.aim(R));
      await A.approach(R, 1.6, { maxSec: 1 });
      await A.charge(R);
      R.mark("charge");
      await A.attack(R, { until: () => __q().ctrl.mode === "final", maxSec: 4 });
      await A.finalExec(R);
      await R.sec(2.6);
      R.mark("end");
    },
  },
  // ④ 筑基（第 9 次，上回已斩）：入场青牙伏低畏缩 → 一刀一刀压着打 → 短版终结处决
  {
    name: "q08_easy",
    open: { settings: { hints: !1 } },
    timeout: 400,
    async run(R) {
      await A.enter(R, { preset: "T4", tries: "9", last: "0", lastPhase: "2", at: "pit", god: "1", mp: "1" });
      await view(R, 20);
      await A.momentum(R, 100);
      await R.real(400);
      await R.begin();
      await R.skip(6);
      R.clip("q08_easy");
      await R.sec(0.3);
      await A.walkToBoss(R);
      R.mark("intro");
      await A.waitUntil(R, () => __q().ctrl.mode === "fight", null, { maxSec: 5 });
      await A.bossHold(R, !0);
      R.mark("fight");
      await A.approach(R, 2.0);
      await A.charge(R);
      R.mark("charge");
      await A.attack(R, { maxSec: 1.2 });
      await A.cast(R, "KeyQ");
      await A.bossDo(R, "rend", { each: A.aim(R) });
      R.mark("rend");
      await A.attack(R, { maxSec: 2.2 });
      R.mark("cut");
      // 画面外：直接压到二阶段末尾
      await A.stage(R, { phase2: !0, hp: 0.04 });
      await A.bossHold(R, !0);
      await A.stage(R, { shield: 0, clear: !0, face: !0 });
      await A.momentum(R, 100);
      R.mark("p2");
      await A.approach(R, 1.6, { maxSec: 1.5 });
      await A.charge(R);
      await A.attack(R, { until: () => __q().ctrl.mode === "final", maxSec: 4 });
      await A.finalExec(R);
      await R.sec(2.0);
      R.mark("end");
    },
  },
  // ④ 成长对比分屏素材：同一招裂风三扑，四个档位四个结局
  {
    name: "qg1_t1",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T1", tries: "2", last: "0.93", god: "0" });
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, clear: !0 });
      await R.ev(() => (__game.player.entity.hp = __game.player.entity.stats.get("hp") * 0.55));
      await view(R, 18);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("qg1_t1");
      await R.sec(0.3, A.aim(R));
      await A.bossDo(R, "rend");
      R.mark("rend");
      await R.mdown();
      await A.waitUntil(R, () => !__q().atk || __game.player.state === "dead", null, { maxSec: 4, each: A.aim(R) });
      await R.mup();
      await R.sec(2.2);
      R.mark("end");
    },
  },
  {
    name: "qg2_t2",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T2", tries: "4", last: "0.62" });
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, clear: !0 });
      await view(R, 18);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("qg2_t2");
      await R.sec(0.3, A.aim(R));
      const dg = dodger(R);
      const aim = A.aim(R);
      const each = async () => (await dg(), await aim());
      await A.bossDo(R, "rend", { each });
      R.mark("rend");
      await A.waitUntil(R, () => !__q().atk, null, { maxSec: 4, each });
      await A.attack(R, { maxSec: 1.4 });
      await R.sec(1.0, aim);
      R.mark("end");
    },
  },
  {
    name: "qg3_t3",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T3", tries: "6", last: "0.31", lastPhase: "2" });
      await A.nearPillar(R, "fang_2", { gap: 3.0, hero: 4.0 });
      await A.stage(R, { clear: !0, poise: 10 });
      await A.momentum(R, 100);
      await view(R, 18);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("qg3_t3");
      await R.sec(0.2);
      await A.lurePillar(R, { pillar: "fang_2" });
      await R.sec(0.2, A.aim(R));
      await A.approach(R, 1.6, { maxSec: 1 });
      await A.charge(R);
      await R.sec(1.6, A.aim(R));
      R.mark("end");
    },
  },
  {
    name: "qg4_t4",
    open: { settings: { hints: !1 } },
    async run(R) {
      await fightReady(R, { preset: "T4", tries: "9", last: "0", lastPhase: "2", god: "0" });
      await A.stage(R, { pos: BOSS, hero: HERO, face: !0, clear: !0 });
      await A.momentum(R, 100);
      await view(R, 18);
      await R.real(200);
      await R.begin();
      await R.skip(4);
      R.clip("qg4_t4");
      await R.sec(0.3, A.aim(R));
      await A.bossDo(R, "rend");
      R.mark("rend");
      await R.mdown();
      await A.waitUntil(R, () => !__q().atk, null, { maxSec: 4, each: A.aim(R) });
      await R.mup();
      await A.approach(R, 1.6, { maxSec: 1 });
      await A.charge(R);
      await R.sec(1.6, A.aim(R));
      R.mark("end");
    },
  },
];
