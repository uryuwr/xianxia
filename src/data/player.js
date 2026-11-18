// 主角数据表：属性、身法、普攻招式。所有手感参数集中在这里调（设计文档 6.1：动作节奏写在数据里）。
// 时间单位为秒（攻速 aspd=1 时）；攻速提高时，招式时长与各时间点按比例缩短（动作播放速度同步加快）。
// 攻速 aspd 随修为成长（src/data/progression.js growth：练气一层 0.65 → 筑基一层 1.00），这里的 stats 等于练气一层（旧沙盒用）。
// 设计说明：docs/战斗_气势与身法_v1.md（闪身冷却、攻速成长、气势与蓄势斩）。
const DEG = Math.PI / 180;

export const PLAYER = {
  leap: { reach: 2.4, height: 2.2, dur: 0.6 }, // 跃涧（关卡 jumps 两端之间）：起跳判定半径、弧高、时长
  // 御剑（筑基解锁 unlocks.swordFly）：在深水边 / 崖边朝对岸按 Space，踏剑掠过（消耗一次闪身充能）
  //   reach 最远 12 米；落点须可站立（不是深水、不在碰撞体里），且比起点高不超过 maxUp 米；speed 飞行速度（米/秒），height 弧高
  swordFly: { reach: 12, min: 2.5, step: 0.35, maxUp: 4.5, speed: 13, minDur: 0.45, height: 1.6, hintEvery: 4 },
  // 基础属性（属性名见 src/core/combat.js）
  stats: { hp: 200, mp: 100, atk: 20, spell: 20, def: 5, move: 6, crit: 0.1, critDmg: 1.6, mpRegen: 0, hpRegen: 1, aspd: 0.65 }, // 真气不自动回复（用户要求）：只有丹药、紫金葫芦、聚灵阵等构筑手段回气
  spawn: [-5.5, 16.5],
  radius: 0.4, // 受击与碰撞半径（与模型无关）
  height: 1.75,
  accel: 45, // 起步加速度（米/秒²），越大越"跟手"
  decel: 60,
  turnSpeed: 16, // 转身速度
  stepUp: 0.55, // 能走上的高差
  stepDown: 0.9, // 能走下的高差（更高就是悬崖，不会自己走下去）
  // 闪身：有冷却，不能无限用。充能数 / 冷却也是属性（dashMax / dashCd，境界成长见 progression.js growth），
  // 心法《流云》、词条"闪身冷却"（dashCdr）、特殊词条"流云身法"可以加充能 / 减冷却。
  dash: {
    charges: 1, // 初始充能（练气一~五层 1 次，练气六层起 2 次）
    maxCharges: 3, // 充能上限（境界 + 心法 + 词条叠加后封顶）
    recharge: 2.75, // 每次充能恢复时间（秒，逐个恢复）
    minRecharge: 1.2, // 冷却缩减后的下限
    cdrCap: 0.4, // 闪身冷却缩减上限
    perfectRefund: 0.6, // 完美闪身：立即返还 60% 冷却（2.75 秒 → 约 1.1 秒后可再闪）
    dist: 5,
    dur: 0.18,
    iframePad: 0.1, // 闪身结束后额外的无敌时间
    anim: "dodge",
    perfectSlow: 0.3, // 完美闪身：慢动作倍率
    perfectSlowDur: 0.4, // 慢动作持续（真实时间）
    perfectBonus: 0.5, // 完美闪身后下一次攻击伤害 +50%
    perfectWindow: 1.5, // 加成保留时长
  },
  hurt: { invuln: 0.4, flinch: 0.16 }, // 受击后短暂无敌；受击硬直很短（不魂系）
  respawnDelay: 2,
  assist: { cone: 45 * DEG, range: 4 }, // 普攻自动吸附：朝鼠标方向 ±45°、4 米内最近的敌人
  comboReset: 0.35, // 一段招式结束后多久没接下一段就回到第一段
};

// 气势（势）：普攻命中积攒；≥ minCharge 后按右键主动放"蓄势斩"（半势按比例，满势完整演出），放出后清零。
//   gain        每段命中获得的气势（一次挥砍只算一次）；多命中每多一个目标 +perTarget，最多 +perTargetMax
//   crit        该次挥砍有暴击时额外获得；perfect 完美闪身获得；hurt 受击扣除（未满时；势成时不扣）
//   v1.3：气势**不随时间流失**（未满也不衰减）——在小怪身上攒的势可以带到精英 / 首领那里放；出局（撤离 / 身陨）、回洞府时清零
//   满 100 = "势成"：锁定，受击不扣，一直保留到玩家放出为止
//   心法 / 词条：momGain 气势获取 +%（flat 记数，0.3 = +30%）；chargeDmg 蓄势斩伤害 +%
export const MOMENTUM = {
  max: 100,
  minCharge: 50,
  gain: [8, 10, 15],
  perTarget: 2,
  perTargetMax: 6,
  crit: 4,
  perfect: 25,
  hurt: 4,
  // 攒势加强（数值复核 v1.2：精英战大部分时间在打护盾、放不出几刀）
  eliteMul: 0.8, // 普攻命中精英 / 首领时气势获取 ×0.8（打在护盾上也照常获取，不打折）。青牙 v2 §6.2：蓄势斩打首领占 37–56% 超标，单刀伤害（用户 v1.3 拍板）不动、只降频：1.25 → 0.8
  shieldBreak: 5, // 破盾瞬间 +5 气势（"破盾 → 蓄势斩"连段奖励；不受气势获取加成）。青牙 v2 §6.2 降频：15 → 5
};

// 普攻三段。字段：
//   anim       动画名（hero.glb）
//   dur        招式总时长
//   hitTime    出伤时间点
//   queueFrom  从此刻起可以预输入下一段
//   cancelFrom 从此刻起可以接下一段 / 取消为施法（闪身任何时候都能取消）
//   radius / halfAngle  扇形判定（米 / 弧度）
//   scale      伤害 = atk × scale
//   knock      击退（米）
//   step       出招时向前踏步的距离（米，前方贴脸有敌人时不踏）
//   hitStop    命中顿帧（秒）
//   shake      命中镜头震动
//   arc        刀光：{ color, reverse, angle }
export const MOVES = [
  { anim: "slash1", dur: 0.42, hitTime: 0.19, queueFrom: 0.06, cancelFrom: 0.27, radius: 2.6, halfAngle: 70 * DEG, scale: 1.0, knock: 0.6, step: 0.45, hitStop: 0.045, shake: 0.1, arc: { color: "ink", reverse: !1, angle: 2.4 } },
  { anim: "slash2", dur: 0.42, hitTime: 0.18, queueFrom: 0.06, cancelFrom: 0.26, radius: 2.6, halfAngle: 70 * DEG, scale: 1.0, knock: 0.6, step: 0.45, hitStop: 0.045, shake: 0.1, arc: { color: "ink", reverse: !0, angle: 2.4 } },
  { anim: "slash3", dur: 0.5, hitTime: 0.25, queueFrom: 0.08, cancelFrom: 0.36, radius: 2.9, halfAngle: 80 * DEG, scale: 1.6, knock: 2.2, step: 0.9, hitStop: 0.08, shake: 0.28, arc: { color: "red", reverse: !1, angle: 2.8 } },
];

// 蓄势斩（右键主动释放，独立招式，不在普攻连段里）：字段同 MOVES，另有
//   base / scale 伤害 = base + atk × scale（v1.3 起带固定值，与法术同构：满势横扫 + 剑气打同一目标 ≈ 同境界剑气斩三道全中的 1.8 倍，
//              半势 50 ≈ 0.95 倍；标定见 tools/scenarios/num_charge.mjs）
//   wave       月牙剑气：向前推进 range 米，speed 米/秒，半宽 width 米，伤害 atk × scale，每个敌人只中一次
//   shieldMul  对五行护盾的额外倍率（普攻无属性只有 0.25，蓄势斩 ×2.5 ≈ 0.63；附灵克制时 ≈ 2.2，与克制法术相当）
//   punch      镜头推近（比例）；slowmo 出伤瞬间的短暂慢动作（倍率, 真实秒）——只有满势有
//   aftershock 心法《余波》：剑气尽头再炸一圈（半径 / 倍率 / 延迟）
//   partial    半势（50 ≤ 气势 < 100）：t = (气势 − 50) / 50；伤害 × (dmg[0] + dmg[1]·t)、扇形半径 × (radius[0] + radius[1]·t)、
//              剑气距离 × (wave[0] + wave[1]·t)；顿帧 / 震屏较轻，没有慢动作、镜头推近和"斩"字
//   shieldCut  剑意破盾（v1.3，核心身份）：命中带护盾的敌人时，不看五行克制，直接削去护盾上限的 elite / boss 比例（首领按每段护盾），
//              再按普通倍率结算；半势按 气势 / 100 缩放；每次蓄势斩对每个敌人只削一次
//   stagger    控制（v1.3）：满势命中 小怪眩晕 mob 秒、精英 elite 秒（打断蓄力）、首领 boss 秒（打断预警招式，同一首领 bossIcd 秒内只打断一次）；
//              半势只让小怪眩晕 halfMob 秒，精英 / 首领不打断
export const CHARGE = {
  anim: "slash3", dur: 0.82, hitTime: 0.36, queueFrom: 0.5, cancelFrom: 0.58,
  radius: 3.8, halfAngle: 105 * DEG, base: 75, scale: 3.45, knock: 3.2, step: 1.4, hitStop: 0.14, shake: 0.55, punch: 0.1, slowmo: [0.35, 0.12],
  shieldMul: 2.5,
  wave: { range: 7.5, speed: 18, width: 1.3, base: 40, scale: 1.88, knock: 1.4, shieldMul: 1.5 },
  aftershock: { radius: 2.8, scale: 0.9, delay: 0.12 },
  arc: { color: "red", reverse: !1, angle: 3.6 },
  partial: { dmg: [0.52, 0.32], radius: [0.8, 0.15], wave: [0.5, 0.3], hitStop: 0.07, shake: 0.3 },
  shieldCut: { elite: 0.35, boss: 0.2 },
  stagger: { mob: 1.2, elite: 0.8, boss: 0.5, bossIcd: 8, halfMob: 0.5 },
  buffer: 0.35, // 普攻前半段 / 施法中按右键：缓存这么久（出招中按攻速缩放，即 aspd=1 时的秒数），到可取消时立即放出
  vulnBonus: 0.15, // 蓄势斩（横扫 / 剑气 / 余波）命中处于破盾易伤中的敌人：伤害 +15%（独立乘区，与《连环》《蓄势》等叠加；从 20% 回调）
};
// 普攻流心法的数值（src/data/items.js XINFA 里的 mods 只是开关 / 数值载体，效果在 src/game/player.js 结算）
export const MOM_XINFA = {
  hasteAspd: 0.15, // 《满势》：势成（气势满）时攻速 +15%（势成会一直保留到放出，所以比原来的 20% 低）
  hasteMove: 0.1, // 《满势》：势成时移速 +10%
  chainPer: 0.04, // 《连环》：每层普攻伤害 +4%
  chainMax: 5, // 最多 5 层（+20%）
  chainDur: 3, // 层数保留 3 秒（命中刷新）
  chainCharge: 0.1, // 蓄势斩消耗全部层数，每层再 +10%
};

// 施法手势（供法术 / 法宝 / 阵法调用 player.cast(kind, dur)）
export const CASTS = {
  point: { anim: "cast_point", dur: 0.38 },
  sweep: { anim: "cast_sweep", dur: 0.45 },
  raise: { anim: "cast_raise", dur: 0.55 },
};
