// 出行区域配置（模块 A：流程用到的部分——风险、天时、撤离、妖潮；地图本身由关卡模块提供）。
// 数值依据《最小闭环设计》§4.2、§5、§6、§7。
export const REGIONS = {
  tutorial: {
    id: "tutorial", name: "溪边", level: 1, risk: "none", riskText: "",
    phases: [9999, 9999, 9999], // 教学局没有天时压力
    extractBase: 0, nightWaveEvery: 0, packs: 0,
  },
  r1: {
    id: "r1", name: "青岚山外", level: 1, risk: "low", realm: "练气 1–4",
    riskText: "身陨：储物袋保留一半；装备与丹药无损",
    phases: [270, 540, 720], // 晨→午、午→暮、暮→夜 的秒数（玩法评审 G9：暮推迟到第 9 分钟，正常节奏的局基本在白天结束）
    extractBase: 8, ruinChannel: 6, fakeRuins: 0, ruins: [1, 1],
    nightWaveEvery: 60, packs: 5, // packs：兜底组数；关卡给 points.spawnPacks 时以关卡为准
    keepBag: 0.5, loseConsumables: !1, gearRisk: 0,
  },
  r2: {
    id: "r2", name: "竹海·溪谷", level: 5, risk: "high", realm: "练气 5–9",
    riskText: "身陨：储物袋保留四分之一，其余与消耗品遗落；随机 1 件未认主装备遗落（下一局可取回）",
    phases: [300, 540, 720],
    extractBase: 8, ruinChannel: 6, fakeRuins: 1, ruins: [1, 2],
    nightWaveEvery: 60, packs: 7, // 同上（关卡 r2 给 11 组）
    keepBag: 0.25, loseConsumables: !0, gearRisk: 1, // 数值评审：身陨保留 25%（关键物品、锦囊另计）
    bossGate: { boss: "bilin", realm: [1, 8], text: "碧鳞潭禁制：练气八层方可入内" },
  },
};

// 天时 = 灵潮推运（玩法评审 G9）：越晚越危险，回报倍率 tide 也越高（掉落数量、感悟；品质由掉落模块读 opts.tide）
export const PHASES = [
  { id: "dawn", name: "晨", channelMul: 1, buff: 0, tide: 1 },
  { id: "noon", name: "午", channelMul: 1, buff: 0, tide: 1.2 },
  { id: "dusk", name: "暮", channelMul: 1.5, buff: 0.2, tide: 1.5 },
  { id: "night", name: "夜", channelMul: 2, buff: 0.35, tide: 2 },
];

// 新手引导节奏（玩法评审 G6 §5）：第 n 局（教学局 = 1）才出现的功能
export const INTRO_AT = { pills: 2, pouch: 3, talisman: 3, identify: 3, quests: 5, r2: 6 };
export const runIndex = (p) => (p.flags && p.flags.unlockAll ? 99 : (p.stats.runs || 0) + (p.flags && p.flags.tutorialDone ? 2 : 1));

// 撤离读条（秒）
export const EXTRACT = {
  gate: 8, // 古传送阵
  ruin: 6, // 残阵
  talisman: 12, // 遁地符（受击打断）
  boss: 3,
  cave: 0, // 教学局：破洞府
  radius: 3.2, // 阵的范围：离开则读条暂停
  attract: 30, // 读条开始时吸引附近妖兽的范围
};

// 身陨取回比例
export const LOST_BAG = { gear: 1, rest: 0.6 };
// 区域二装备风险：按品质加权
export const GEAR_RISK = { slots: ["sword", "robe", "jade"], weight: [1, 2, 3, 4, 4] };
// 斩妖感悟（击杀立刻获得的修为；内容模块的数值优先）
export const INSIGHT = { mob: 3, elite: 15, boss: 60 };
