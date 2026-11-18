// 青牙 v2 的机制调参表（战斗设计 + 数值策划共管；设计说明 docs/design/boss_青牙_v2.md）。
// 招式（前摇 / 判定 / 后摇）在 src/data/enemies.js 的 qingya 条目；这里是控制器（src/game/enemies/bosses/qingya.js）读的机制数。
// 单位：秒、米；狼威为 0–100 的"点"。
export const QINGYA = {
  // ---- 入场 / 沉睡（§3.1、§3.2） ----
  trigger: 10, // 进这个圈（离首领出生点）、打到它、或砍倒任一图腾 → 入场仪式
  intro: { full: 4.0, short: 1.2, wake: 1.2 }, // 首次完整 / 之后短版；仪式后落地起身的固定破绽（不出招）
  // ---- 狼威（失衡条，§5.1） ----
  poise: {
    max: 100,
    growth: 1.25, // 第 n 次威折后阈值 × 1.25^n
    holdDelay: 3, // 多久没涨开始回落
    decay: 8, // 每秒回落 × (0.4 + 0.6 × 气血比)
    decayFloor: 0.4,
    shieldMul: 0.6, // 护盾在时的获取倍率（打断 / 撞柱 / 完美闪身不打折）
    nearOn: 0.75, nearOff: 0.6, // 快折了的预兆（喘息墨气、滴朱、微颤）：涨过 75% 开、跌回 60% 关
    down: { 1: 3.5, 2: 4.0 }, // 威折倒地时长
    vuln: 0.3, // 倒地易伤
    src: {
      basic: 1.5, // 普攻一段（二阶段背击 ×2）
      charge: 20, // 满势蓄势斩（半势 × 气势/100；同一刀只算一次）
      qi: 2, // 法术单道（剑气斩每道）
      spell: 4, // 其他法术一次命中
      minor: 1, // 法宝 / 阵法 / 五行符等每次命中
      perfect: 12, // 完美闪身
      read: 20, // 读招类完美闪身（双噬第二口、回首咬、影袭现身）
      interrupt: { summon_howl: 45, moon_howl: 55 }, // 打断收益加码（2026-11-17：让"打断 vs 不打断"差别明显）
      crash: 40, // 撞柱
      shieldBreak: 30,
      freeze: 25, // 冻结折算
      root: 10, // 缠绕
      reaction: 15, // 五行反应
      totem: 15, // 图腾倒下（青牙悲嚎）
    },
  },
  // ---- 读条打断（§5.2）：阈值与各手段的打断值 ----
  channel: {
    need: { summon_howl: 1.0, moon_howl: 1.5 },
    val: { basic: 0.12, qi: 0.34, fire: 0.5, frost: 1.0, chargeFull: 1.0, chargeHalf: 0.6, freeze: 0.5, formation: 0.15, artifact: 0.15, seal: 1.5, talisman: 0.5, reaction: 0.3, other: 0.2 },
    stagger: 2.5, // 召狼长嚎被打断后踉跄
  },
  // ---- 环境 ----
  // 撞柱（2026-11-17 调整：用户反馈"撞柱后用很快的普攻偷输出"）：撞晕窗口 2.5 → 1.8 秒；窗口里普攻被骨甲顶住（伤害 ×0.6，但狼威 ×2），
  //   满势 / 半势蓄势斩 ×1.4、法术 ×1.3——奖励"撞柱 → 蓄势斩 / 法术 → 压满狼威 → 处决"，而不是普攻堆刀
  crash: { stun: 1.8, shieldCut: 0.35, basicMul: 0.6, basicPoise: 2, chargeMul: 1.4, spellMul: 1.3 },
  totem: { hp: 120, fireMul: 2, wail: 1.0 }, // 图腾气血、火伤倍率（写成 res_fire = −1）、倒下时青牙悲嚎
  moon: { r: 3.5, weakMul: 1.6 }, // 月光斑半径；首领在月光里时背击倍率
  // ---- 二阶段 ----
  phase2: {
    transition: 3.6, // 转阶段演出（无敌）
    beats: { leap: 0.4, veil: 1.0, burstAnim: 1.1, burst: 1.6, howl: 2.2, echo1: 2.55, echo2: 2.9, moon: 2.8 }, // armor_burst 动画 1.1 起播、0.5 秒处炸开 = 1.6 调 look.armorBurst()
    moveMul: 0.15, // 移速 +15%
    winded: 1.8, // 喘息缩短
    knock: 3, // 转阶段把主角震退
    moonHowlFirst: 6, // 转阶段后多久第一次啸月
    moonHowlCd: 24,
    moonBuff: { dur: 10, atk: 0.2, move: 0.15 }, // 啸月读完：月华
  },
  weak: { mul: 1.35, cone: 0.5 }, // 背击：背后 ±60°（cos < −0.5）
  rearNeed: 1.2, // 主角在背后累计多久才会回首咬
  // ---- 召狼（用户 2026-11-17：没打断的代价要实打实——群狼跃下包围、和青牙错开节奏施压）----
  summon: { type: "qingya_wolf", perDen: 1, moonExtra: 1, max: 4 },
  // 狼谷群狼（运行时注册为 ENEMY_TYPES.qingya_wolf，外形复用竹林狼）：等级 = 主角层数（筑基 10），夹在 [minLv, maxLv]
  //   数值按 level 4 写，按敌人通用缩放（气血 +15% / 级、攻击 +12% / 级）；待数值策划复测四档后定稿
  pack: {
    level: [2, 10],
    stats: { hp: 420, atk: 16, def: 8, move: 5.6, crit: 0, res_wood: 0.2, res_fire: -0.2 },
    exitIn: 2.5, // 狼窝出生点往谷心挪多少米（狼窝贴着崖壁，原地出生会落在崖上 / 碰撞体边缘卡住）
    leap: { crouch: 0.3, min: 1.2, max: 1.8, speed: 16, h: 2.2 }, // 出窝下蹲 → 跃至包围位（越过石柱 / 狼岩，不走寻路）：总计 1.5–2.1 秒到位
    slotR: [3.0, 4.4], // 包围位离主角的距离
    slotGap: 1.0, // 包围位之间最小角距（弧度，约 57°）
    roles: ["harrier", "blocker", "interrupter", "harrier"], // 扑咬逼走位 / 卡退路（守在主角背离青牙一侧）/ 专打读条与蓄势
    weak: { atk: -0.35, move: -0.25 }, // 所属狼窝的图腾倒下：失魂
    interruptMom: 15, // 打断召狼长嚎 / 啸月：主角 +15 气势（断其嚎，得其势）
  },
  // ---- 硬控（§5.1、§7.3） ----
  root: { mul: 0.5, dr: 10 }, // 缠绕时长 × 0.5；10 秒内再缠再减半
  // ---- 处决（§7） ----
  exec: {
    range: 2.8,
    break: { dur: 2.4, frac: 0.12, atk: 4, hit: 0.9 }, // 威折处决：12% 最大气血 + 4 × 攻击，不致死
    final: { dur: 4.0, short: 2.0, hit: 1.2, hitShort: 0.35, wait: 6 }, // 出伤对齐主角 execute_draw 的出刃帧 // 气竭伏地最多等 6 秒，不按 F 自动短版
  },
};
