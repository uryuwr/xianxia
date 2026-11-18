// 成长数值表（内容模块 D）：依据《最小闭环设计》§10.2（修为与属性）、§12（丹药限制）、§13（解锁节奏）。
// 接口见 src/game/progression.js。key 形如 "stage:layer"：0:0 凡人，1:1~1:9 练气一~九层，2:1 筑基一层。
//
//   xp[key]        该层升到下一层所需修为（练气 1→筑基 共 4370；凡人 → 练气一层由开场剧情直接给）
//   growth[key]    该层主角基础属性（hp mp atk spell def crit critDmg move mpRegen；aspd 攻速、dashMax 闪身充能数、dashCd 闪身冷却秒）
//                  攻速 / 闪身见 docs/战斗_气势与身法_v1.md：aspd 练气一层 0.65 → 每层 +0.039 → 筑基一层 1.00（2026-11-17 用户：初始攻速再降）；闪身练气六层起 2 次
//   breakReq[key]  突破需要的仓库物品；trial[key] 突破时的试炼（"xinmo" 心魔：主角属性 ×0.8，气血 3000，见 enemies.js xinmo）
//   unlocks        栏位解锁：[[境界, 值], …]，取不晚于当前境界的最后一个
//   containers     储物袋 / 贴身锦囊的格数上限（境界只是"可升级"的门槛，实际升级靠炼器鼎，见 recipes.js FORGE）
//   grants         到达该境界时自动获得的东西（心法 / 法术），由洞府模块在突破后发放
//   pillCap        每个丹药栏可带的枚数（炼器鼎扩容 +1，最多 5）；juqiPerLayer 每个小境界最多服用聚气丹数
const order = ["0:0", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7", "1:8", "1:9", "2:1"];
const xpList = [10, 100, 150, 220, 300, 400, 520, 660, 820, 1200]; // 0:0→1:1 … 1:9→2:1
const xp = {};
order.slice(0, -1).forEach((k, i) => (xp[k] = xpList[i]));
const next = {};
order.slice(0, -1).forEach((k, i) => {
  const [s, l] = order[i + 1].split(":").map(Number);
  next[k] = { stage: s, layer: l };
});

// 真气与炼化增益 v1：真气不再自动回复（mpRegen 由战斗开发归零），真气上限 练气一层 120、每层 +12、筑基 360（原 100 / +15 / 360；局内捡到的回气丹当局可用后回调）
// §10.2：练气一层 hp200 mp100 atk20 spell20 def5；每层 +30 / +15 / +4 / +4 / +2；筑基一层 720 / 360 / 84 / 84 / 36
// 攻速（战斗 · 气势与身法 v1.4）：练气 L 层 = 0.65 + 0.35 × (L − 1) / 9，筑基一层 1.00；凡人 0.6（v1 是 0.80 起步，用户反馈练气四层仍嫌快）
const aspdOf = (L) => Math.round((0.65 + (0.35 * (L - 1)) / 9) * 1000) / 1000;
const growth = {};
order.forEach((k) => {
  const [s, l] = k.split(":").map(Number);
  if (s === 0) growth[k] = { hp: 160, mp: 80, atk: 16, spell: 16, def: 3, crit: 0.1, critDmg: 1.6, move: 6, mpRegen: 0, aspd: 0.6, dashMax: 1, dashCd: 2.75 };
  else if (s === 1) {
    const n = l - 1;
    growth[k] = { hp: 200 + 30 * n, mp: 120 + 12 * n, atk: 20 + 4 * n, spell: 20 + 4 * n, def: 5 + 2 * n, crit: 0.1, critDmg: 1.6, move: 6, mpRegen: 0, hpRegen: 1 + 0.25 * n, aspd: aspdOf(l), dashMax: l >= 6 ? 2 : 1, dashCd: 2.75 };
  } else growth[k] = { hp: 720, mp: 360, atk: 84, spell: 84, def: 36, crit: 0.12, critDmg: 1.7, move: 6.5, mpRegen: 0, hpRegen: 3.5, aspd: aspdOf(10), dashMax: 2, dashCd: 2.5 };
});

// 神识 sense（搜取 v1，docs/ui/v2/搜取_v1.md）：探查时长 × 100/(100+神识)；≥40 时墨封下隐约透出品质色
for (const k of order) {
  const [s, l] = k.split(":").map(Number);
  growth[k].sense = s === 0 ? 0 : s === 1 ? 8 * (l - 1) : 100;
}

export const PROGRESSION = {
  order,
  // 神识看境界（敌人血条）：同一大境界里，神识 ≥（敌人层 − 自己层）× perLayer 才看得清；差一个大境界一律看不清（"???"）
  senseView: { perLayer: 16 },
  stages: { 1: { name: "练气" }, 2: { name: "筑基" } },
  xp,
  next,
  growth,
  baseStats: { move: 6, crit: 0.1, critDmg: 1.6, mpRegen: 0, aspd: 0.65, dashMax: 1, dashCd: 2.75 },
  breakReq: { "1:9": [{ id: "zhuji_dan", n: 1 }] }, // 练气九层 → 筑基：筑基丹
  trial: { "1:9": "xinmo" }, // 突破时的心魔试炼
  // 栏位解锁（§12、§13）：[[境界, 值], …]
  unlocks: {
    spellSlots: [["0:0", 0], ["1:1", 1], ["1:3", 2], ["1:7", 3]], // 评审 G1：第 2 栏练气三层（缠藤诀 · 山神庙，青牙之前），第 3 栏练气七层（寒冰锥 · 剑修遗府，碧鳞之前）
    pillSlots: [["0:0", 1], ["1:2", 2], ["1:5", 3], ["2:1", 4]],
    robeSlot: [["0:0", !1], ["1:3", !0]], // 练气三层可穿法衣（第一件来自山神庙器方）
    xinfaSlots: [["0:0", 0], ["1:4", 1], ["1:8", 2]],
    jadeSlot: [["0:0", !1], ["1:5", !0]],
    doubleJump: [["0:0", !1], ["1:5", !0]],
    artifactSlot: [["0:0", !1], ["1:7", !0]], // 练气七层（青冥飞剑在剑修遗府）
    formationSlot: [["0:0", !1], ["1:7", !0]], // 练气七层（阵盘·剑阵）
    swordFly: [["0:0", !1], ["2:1", !0]], // 御剑
    region2: [["0:0", !1], ["1:5", !0]], // 可前往竹海·溪谷
    bagMax: [["0:0", 16], ["1:3", 24], ["1:7", 32]], // 储物袋可升级到的格数
    pouchMax: [["0:0", 1], ["1:4", 2]], // 贴身锦囊可升级到的格数（3 格来自碧鳞首杀乾坤锦囊）
  },
  containers: { bag: [16, 24, 32], pouch: [1, 2, 3] },
  // 装备栏开启时的基础款：{ item, rarity, equip }——仓库和身上都没有这一栏的东西才送（每栏每个存档至多一次，profile.flags.slotGift），equip: 直接穿上；
  //   旧存档已过该层、栏位空着的进洞府补发一次（facilities.js grantSlotItem / fillSlotGifts）。法宝 / 阵盘栏的基础款待战斗设计（功法体系 v2）
  grants: {
    "1:1": [{ spell: "sword_qi" }],
    "1:3": [{ item: "robe_cu", rarity: 0, equip: !0 }], // 法衣栏开启：粗布衣（弱于山神庙器方的布法衣）
    "1:4": [{ xinfa: "sharp" }], // 自动领悟《锋锐》（原为斩敌回气；用户要求击杀不给回复）
    "1:5": [{ item: "jade_su", rarity: 0, equip: !0 }], // 玉佩栏开启：素玉坠（弱于青玉佩）
    "2:1": [{ spell: "earth_shield" }], // 筑基奖励：土遁护体（第 3 法术栏练气七层已开，这里只是额外奖励）
  },
  pillCap: { base: 3, max: 5 },
  juqiPerLayer: 3,
  // 敌人强度对照（§10.3，供关卡 / 平衡参考）：区域等级 → 普通怪气血 / 攻击区间
  // 难度复核 v1（docs/review/numeric/难度曲线复核_v1.md）：普通 = 竹林狼妖 / 蝠妖按等级缩放后的气血；精英不含护盾（护盾 = 0.3 × 气血）
  enemyCurve: { r1: { level: [1, 4], hp: [140, 203], atk: [10, 13.6], elite: [825, 1500], boss: 3000 }, r2: { level: [5, 9], hp: [360, 576], atk: [18, 26.6], elite: [1500, 4250], boss: 12000 } },
  phaseMul: { dusk: 1.2, night: 1.35 }, // 暮 / 夜 敌人属性倍率
  // 小境界内的常驻加成（真气与炼化增益 v1）：当前层修为进度 p（0–1）时，额外获得"本层 → 下一层"属性增量的 p × progressBonus
  //   只作用于随层数线性增长的属性（hp mp atk spell def hpRegen）；练气九层按练气每层的固定增量算（不按筑基跃升）；筑基一层没有
  progressBonus: 0.4, // 0.4 而不是 0.5：突破那一下仍保留 ≥ 60% 的属性跳变（突破要有"大跳"的感觉），中段进度也看得见
};
