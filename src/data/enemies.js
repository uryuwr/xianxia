// 敌人数据表（玩法数值与动作节奏都在这里，模型只是外观——见设计文档 6.1；数值依据《最小闭环设计》§9、§10.3）
//
// 字段：
//   name 显示名 / model 模型文件 / scale 模型缩放 / tint 材质调色（{ 材质名: 颜色 }）/ auraColor 妖气粒子颜色（有则常驻妖气）
//   region 所属区域 / level 数据表数值对应的等级（刷怪时按实际等级缩放：气血 +27% / 级，攻击 +12% / 级）
//   insight 斩妖感悟（不填按区域：区域一 3、区域二 8；精英 ×8；Boss 见 data/loot.js BOSSES）
//   shieldFrac 护盾量占最大气血的比例（不填用 shields.js 的 SHIELD_TUNE.frac）
//   boss Boss id（掉落 / 首杀判定，见 data/loot.js BOSSES）/ lootSource 强制掉落来源
//   shield 固定护盾五行（数组 = 随机其一）/ shieldPhases 多段护盾 [{ at: 气血比例, el: 五行 }]：气血降到 at 以下且当前无盾时换上下一层
//   shrines Boss 战启用关卡的五行坛（读条点亮 → 普攻附带该五行，克制当前护盾的坛有光柱提示）
//   realm 境界 "stage:layer"（不填按等级换算：1~9 级 = 练气 N 层，10 级起 = 筑基；精英再高一层；mirrorHero 与主角同境界）
//   tier "low" 低阶 | "std" 标准 | "elite" 精英 | "rare" 异种 | "boss" 首领（不写按 tags 推断，见文件末尾）
//   fixedLevel 等级固定（异种），不随分区 / 主角境界变化
//   halo 头顶异色光环颜色（异种）；nameColor 血条名字颜色（异种用品级色）
//   mirrorHero 按主角属性生成（心魔：攻防 = 主角 × 该值）
//   stats: 气血 hp、攻击 atk、防御 def、移速 move（米/秒）、五行抗性 res_* …（见 core/combat.js STAT_DEFAULTS）
//   radius 受击半径（米）/ height 身高（血条位置）/ aggroRange 发现距离 / orbit 绕圈半径 [最小, 最大]
//   superArmor 出招时不会被打断 / knockResist 击退抗性（0~1）
//   attacks: 招式列表（AI 按距离与冷却挑选）
//     anim 动画名（anims: [...] 连段每段换动画）/ animHit 动画中"出伤"那一刻的秒数（蓄力时放慢播放，使其正好在预警结束时出手）
//     strikeAnim 出招瞬间改播的动画（如水蟒"潜水"预警后"破水而出"）
//     minDist / maxDist 适用距离（米，到主角中心）
//     windup 预警时长 / active 出招时长 / recover 收招时长（可被反击的破绽）/ cooldown 冷却
//     shape 危险区域："arc" 扇形（radius, angle 度）| "line" 直线冲扑（length, width）| "circle" 圆（radius）
//           | "projectile" 弹道（speed, radius, range, count, spread 度；预警为一道细线）
//     at "target" 圆形落在主角位置（预警前段跟随主角，track 比例）；multi 同时落几个圈，spread 散布半径
//     teleport 出招瞬间移动到落点（潜水突袭）；hide 预警期间潜入地下（不可被攻击）
//     lunge 出招时向前冲的距离（米）/ track 预警前段持续转向主角的比例（0~1，之后锁定方向）
//     damage { base, atk } 伤害 = base + 攻击 × atk / element 伤害五行 / knock 击退（米）/ status { id, dur } 命中附加状态
//     combo 连续出招次数（每段都重新预警、重新瞄准）/ comboWindup 后续段的预警时长
//     buff 增益（嚎叫）：{ radius, dur, mods: [{stat, type, value}] }，对范围内同族生效
//     summon 召唤 { type, n, max }（max：同时存活上限）
//     big 大招（精英 / 首领）：收招后摇按 enemy.js RHYTHM.big（recoverBig 可覆盖），落空再踉跄；其余为小招（RHYTHM.small / recoverSmall）
//     needAllies 至少有几个同伴在附近才使用 / telegraphColor 预警颜色 / below 气血比例低于该值才会使用
export const ENEMY_TYPES = {
  // =============================== 区域一 · 青岚山外（练气 1–4） ===============================
  wolf: {
    name: "竹林狼妖",
    model: "/assets/models/wolf.glb",
    scale: 1.0,
    region: "r1", level: 1,
    stats: { hp: 140, atk: 10, def: 0, move: 5.2, crit: 0, res_wood: 0.2, res_fire: -0.2 },
    radius: 0.5,
    height: 1.5,
    aggroRange: 15,
    orbit: [3.4, 5.0],
    superArmor: !0, // 难度复核：标准狼出招不被打断（要靠闪身穿插）；灰狼仍是一碰就断的杂兵
    knockResist: 0,
    tags: ["beast", "wood"],
    attacks: [
      {
        id: "bite", anim: "attack_bite", animHit: 0.32, minDist: 1.2, maxDist: 4.2,
        windup: 0.62, active: 0.2, recover: 0.55, cooldown: 2.4,
        shape: "line", length: 3.4, width: 1.1, lunge: 2.4, track: 0.5,
        damage: { base: 8, atk: 1.0 }, knock: 1.2,
      },
      {
        id: "claw", anim: "attack_claw", animHit: 0.28, minDist: 0, maxDist: 2.2,
        windup: 0.48, active: 0.12, recover: 0.45, cooldown: 1.8,
        shape: "arc", radius: 2.1, angle: 110, lunge: 0.4, track: 0.6,
        damage: { base: 6, atk: 0.8 }, knock: 0.8,
      },
    ],
  },
  wolf_grey: {
    name: "灰毛狼妖",
    model: "/assets/models/wolf.glb",
    scale: 0.85,
    tint: { fur_ink: 0x44484b, fur_light: 0x9a9c9a },
    region: "r1", level: 1,
    stats: { hp: 90, atk: 8, def: 0, move: 6.6, crit: 0, res_wood: 0.1 },
    radius: 0.42,
    height: 1.3,
    aggroRange: 17,
    orbit: [3.0, 4.6],
    knockResist: 0,
    tags: ["beast", "wood"],
    attacks: [
      {
        id: "bite", anim: "attack_bite", animHit: 0.32, minDist: 1.0, maxDist: 3.8,
        windup: 0.48, active: 0.18, recover: 0.45, cooldown: 1.9,
        shape: "line", length: 3.0, width: 1.0, lunge: 2.2, track: 0.55,
        damage: { base: 6, atk: 1.0 }, knock: 0.9,
      },
      {
        id: "claw", anim: "attack_claw", animHit: 0.28, minDist: 0, maxDist: 2.0,
        windup: 0.4, active: 0.12, recover: 0.4, cooldown: 1.6,
        shape: "arc", radius: 1.9, angle: 100, lunge: 0.4, track: 0.6,
        damage: { base: 5, atk: 0.7 }, knock: 0.6,
      },
    ],
  },
  golem: {
    name: "山神庙石傀",
    model: "/assets/models/golem.glb",
    scale: 1.0,
    region: "r1", level: 2,
    stats: { hp: 225, atk: 13, def: 28, move: 3.0, crit: 0, res_earth: 0.35, res_metal: 0.2, res_wood: -0.25 },
    radius: 0.8,
    height: 2.3,
    aggroRange: 11,
    orbit: [2.4, 3.6],
    superArmor: !0, // 硬壳：出招不被打断
    knockResist: 0.75,
    tags: ["construct", "earth"],
    attacks: [
      {
        id: "slam", anim: "attack_slam", animHit: 0.55, minDist: 0, maxDist: 2.8,
        windup: 1.0, active: 0.2, recover: 1.0, cooldown: 4.2,
        shape: "circle", radius: 2.7, lunge: 0, track: 0,
        damage: { base: 14, atk: 1.2 }, element: "earth", knock: 2.6, telegraphColor: 0xa5743a,
      },
      {
        id: "swipe", anim: "attack_swipe", animHit: 0.35, minDist: 0, maxDist: 2.6,
        windup: 0.72, active: 0.16, recover: 0.7, cooldown: 2.6,
        shape: "arc", radius: 2.5, angle: 150, lunge: 0.6, track: 0.6,
        damage: { base: 10, atk: 1.0 }, knock: 1.8,
      },
    ],
  },
  wolf_elite: {
    name: "狼妖头目",
    model: "/assets/models/wolf.glb",
    scale: 1.5,
    tint: { fur_light: 0x6c4a8e, eye_red: 0xff3a1e },
    auraColor: 0x7b4fa8,
    region: "r1", level: 4, // 难度复核：数据表按 4 级写（练气一层 ≈ 825 气血、四层 1500），跟上区域一里主角的成长
    shield: "wood", // §9.1 精英 · 木盾（区域二用 wolf_elite_r2）
    shieldFrac: 0.3, // 难度复核：护盾 0.4 → 0.3（无克制时破盾不再拖太久）
    stats: { hp: 1500, atk: 20, def: 26, move: 4.8, crit: 0, res_wood: 0.3, res_fire: -0.1 },
    radius: 0.8,
    height: 2.3,
    aggroRange: 18,
    orbit: [4.2, 6.0],
    superArmor: !0,
    knockResist: 0.8,
    tags: ["beast", "wood", "elite"],
    attacks: [
      {
        id: "howl", anim: "howl", animHit: 0.3, minDist: 0, maxDist: 14,
        windup: 0.35, active: 0.6, recover: 0.4, cooldown: 14,
        shape: "circle", radius: 10, lunge: 0, track: 0, needAllies: 2, telegraphColor: 0x7b4fa8,
        buff: { radius: 10, dur: 6, mods: [{ stat: "move", type: "pct", value: 0.35 }, { stat: "atk", type: "pct", value: 0.3 }] },
      },
      {
        id: "lunge3", big: !0, anim: "attack_bite", animHit: 0.32, minDist: 2.0, maxDist: 7.5,
        windup: 0.75, comboWindup: 0.42, active: 0.22, recover: 0.9, cooldown: 7,
        shape: "line", length: 5.0, width: 1.6, lunge: 4.0, track: 0.55, combo: 3,
        damage: { base: 8, atk: 1.0 }, knock: 2.0, // 难度复核：14 → 8（闪身只有 1 次充能，三连扑每段不能太疼）
      },
      {
        id: "bite", big: !0, anim: "attack_bite", animHit: 0.32, minDist: 1.4, maxDist: 4.8,
        windup: 0.7, active: 0.2, recover: 0.6, cooldown: 3.2,
        shape: "line", length: 4.2, width: 1.5, lunge: 2.8, track: 0.5,
        damage: { base: 16, atk: 1.0 }, knock: 1.8,
      },
      {
        id: "claw", anim: "attack_claw", animHit: 0.28, minDist: 0, maxDist: 3.0,
        windup: 0.55, active: 0.14, recover: 0.5, cooldown: 2.4,
        shape: "arc", radius: 3.1, angle: 140, lunge: 0.5, track: 0.6,
        damage: { base: 12, atk: 0.9 }, knock: 1.5,
      },
    ],
  },
  // Boss 青牙（狼王）：体型 2.3 倍、青白长鬃；扑咬连击、横扫、嚎叫召狼；木 → 土两段护盾
  qingya: {
    realm: "1:7", // 境界（血条显示；首斩档位练六七层，见 docs/design/boss_青牙_v2.md §2.2）
    name: "青牙",
    model: "/assets/models/qingya.glb", // 美术管线 blender/build_qingya.py（狼王：骨板甲、青獠牙；二阶段外观由 src/fx/boss_look.js 切换）
    scale: 2.2, // 新造型肩宽胸厚：2.2 时肩高 2.75 米、体长约 6.8 米（美术管线）
    tint: { fur_light: 0xa9c7b8 }, // 主毛 fur_qing 是青牙专用材质（带自发光托底，见 enemy.js PALETTE）
    auraColor: 0x3fae7a,
    region: "r1", level: 4,
    boss: "qingya",
    shieldPhases: [{ at: 1.0, el: "wood" }, { at: 0.5, el: "earth" }],
    shieldFrac: 0.1, // 每段护盾 = 最大气血 × 0.1（各 1500）；青牙 v2（守谷之王，宜练六七层斩）：数值策划首轮值，首战实测后再调
    stats: { hp: 15000, atk: 40, def: 25, move: 5.4, crit: 0, res_wood: 0.3, res_fire: -0.1 },
    radius: 1.3,
    height: 3.1,
    aggroRange: 24,
    orbit: [5.0, 7.5],
    superArmor: !0,
    knockResist: 0.95,
    tags: ["beast", "wood", "elite", "boss"],
    // 青牙 v2（docs/design/boss_青牙_v2.md §4；控制器 src/game/enemies/bosses/qingya.js 由 bosses/index.js 在运行时挂到 controller 上）
    //   phase：哪一阶段可用（控制器 pickAttack 过滤）；channel：读条型前摇（打断值见 src/data/bosses/qingya.js）；
    //   ctrlOnly：只由控制器主动发起（啸月：先跃入月光再读条）；召狼由控制器按图腾结算（不写 summon）
    sightRange: 0, // 沉睡：不按视线惊动，由控制器触发入场（进 10 米圈 / 被打 / 砍倒图腾）
    ccMode: "poise", // 眩晕 / 冻结不打断出招，折算成狼威（破盾、撞柱眩晕放行）
    shieldLook: "outline", // 护盾用五行描边壳 + 脚下阵纹，不建半透明大球（美术管线 shields.js）
    attacks: [
      // ---------- 一阶段「守谷」 ----------
      {
        id: "summon_howl", phase: 1, channel: !0, big: !0, anim: "howl", animHit: 0.3, minDist: 0, maxDist: 30,
        windup: 1.6, active: 0.8, recover: 0.6, cooldown: 20,
        shape: "circle", radius: 12, lunge: 0, track: 0, telegraphColor: 0x3fae7a,
        buff: { radius: 12, dur: 7, mods: [{ stat: "move", type: "pct", value: 0.3 }, { stat: "atk", type: "pct", value: 0.25 }] },
      },
      {
        id: "rend", phase: 1, big: !0, anim: "attack_bite", animHit: 0.32, minDist: 2.5, maxDist: 10,
        windup: 0.85, comboWindup: 0.5, active: 0.26, recover: 1.1, cooldown: 6.5,
        shape: "line", length: 6.5, width: 2.4, lunge: 5.5, track: 0.55, combo: 3,
        damage: { base: 18, atk: 1.0 }, knock: 2.4,
      },
      {
        id: "sweep", phase: 1, big: !0, anim: "attack_claw", animHit: 0.28, minDist: 0, maxDist: 4.5,
        windup: 0.7, active: 0.16, recover: 0.8, cooldown: 3.2,
        shape: "arc", radius: 4.4, angle: 170, lunge: 0.8, track: 0.6,
        damage: { base: 16, atk: 1.0 }, knock: 2.2,
      },
      {
        id: "bite", phase: 1, big: !0, anim: "attack_bite", animHit: 0.32, minDist: 1.6, maxDist: 6.0,
        windup: 0.75, active: 0.22, recover: 0.7, cooldown: 3.0,
        shape: "line", length: 5.4, width: 2.0, lunge: 3.6, track: 0.5,
        damage: { base: 20, atk: 1.1 }, knock: 2.0,
      },
      // ---------- 二阶段「啸月」（连段预警 ×0.85、移速 +15% 由控制器加） ----------
      {
        id: "rend2", phase: 2, big: !0, anim: "attack_bite", animHit: 0.32, minDist: 2.5, maxDist: 10,
        windup: 0.75, comboWindup: 0.42, active: 0.26, recover: 1.1, cooldown: 6,
        shape: "line", length: 6.5, width: 2.4, lunge: 5.5, track: 0.55, combo: 3,
        damage: { base: 18, atk: 1.0 }, knock: 2.4,
      },
      {
        id: "sweep2", phase: 2, big: !0, anim: "attack_claw", animHit: 0.28, minDist: 0, maxDist: 4.5,
        windup: 0.6, active: 0.16, recover: 0.8, cooldown: 3.0,
        shape: "arc", radius: 4.4, angle: 170, lunge: 0.8, track: 0.6,
        damage: { base: 16, atk: 1.0 }, knock: 2.2,
      },
      {
        // 青焰双噬：第二口前多停 0.25 秒（全场唯一的延迟招，comboWindup 0.65 = 0.40 + 0.25）
        id: "bite_double", phase: 2, big: !0, anims: ["bite_double_a", "bite_double_b"], anim: "bite_double_a", animHit: 0.3, minDist: 1.6, maxDist: 6.5,
        windup: 0.65, comboWindup: 0.65, active: 0.22, recover: 0.7, cooldown: 4.0, combo: 2,
        shape: "line", length: 5.4, width: 2.0, lunge: 4.0, track: 0.5,
        damage: { base: 20, atk: 1.1 }, knock: 2.0, telegraphColor: 0x2f8f78,
      },
      {
        // 回首咬：只在主角于背后累计 1.2 秒后出（控制器判定），尾巴竖起预警
        id: "turn_bite", phase: 2, rear: !0, big: !0, anim: "turn_bite", animHit: 0.4, minDist: 0, maxDist: 4.5,
        windup: 0.55, active: 0.18, recover: 1.0, cooldown: 5,
        shape: "arc", radius: 3.6, angle: 180, lunge: 0.4, track: 0.3,
        damage: { base: 18, atk: 1.0 }, knock: 2.4,
      },
      {
        // 影袭：化墨潜入（不可选中）→ 主角身后落点预警 → 破墨而出；月下无影（控制器处理）
        id: "shadow", phase: 2, big: !0, anim: "sink", strikeAnim: "emerge", animHit: 0.8, minDist: 3, maxDist: 16,
        windup: 1.8, active: 0.3, recover: 1.2, cooldown: 14,
        shape: "circle", at: "behind", behindDist: 2.5, radius: 2.6, track: 0, hide: !0, teleport: !0,
        damage: { base: 22, atk: 1.1 }, knock: 2.6, telegraphColor: 0x2f8f78,
      },
      {
        // 啸月：控制器先让它跃入最近的月光斑，再读条 2.2 秒；读完冲击波 + 召狼 + 月华
        id: "moon_howl", phase: 2, ctrlOnly: !0, channel: !0, big: !0, anim: "howl_moon", animHit: 2.2, minDist: 0, maxDist: 30,
        windup: 2.2, active: 0.4, recover: 0.8, cooldown: 24,
        shape: "circle", radius: 8, lunge: 0, track: 0,
        damage: { base: 26, atk: 1.0 }, knock: 3, telegraphColor: 0x6fd6b4,
      },
    ],
  },

  // =============================== 区域二 · 竹海·溪谷（练气 5–9） ===============================
  bat: {
    name: "蝠妖",
    model: "/assets/models/bat.glb",
    scale: 1.0,
    region: "r2", level: 5,
    stats: { hp: 360, atk: 18, def: 6, move: 6.4, crit: 0, res_water: 0.2, res_metal: -0.2 },
    radius: 0.6,
    height: 2.5,
    aggroRange: 18,
    orbit: [4.5, 6.5],
    superArmor: !0,
    knockResist: 0.2,
    tags: ["beast", "flying", "water"],
    attacks: [
      {
        id: "swoop", anim: "attack_swoop", animHit: 0.4, minDist: 2.5, maxDist: 8.5,
        windup: 0.8, active: 0.3, recover: 0.7, cooldown: 3.4,
        shape: "line", length: 7.5, width: 1.4, lunge: 6.5, track: 0.6,
        damage: { base: 14, atk: 1.0 }, knock: 1.4,
      },
      {
        id: "nip", anim: "attack_bite", animHit: 0.25, minDist: 0, maxDist: 2.3,
        windup: 0.45, active: 0.12, recover: 0.45, cooldown: 1.8,
        shape: "arc", radius: 2.1, angle: 100, lunge: 0.5, track: 0.6,
        damage: { base: 10, atk: 0.8 }, knock: 0.6,
      },
    ],
  },
  vine: {
    name: "藤妖",
    model: "/assets/models/vine.glb",
    scale: 1.0,
    region: "r2", level: 5,
    stats: { hp: 440, atk: 20, def: 10, move: 2.6, crit: 0, res_wood: 0.3, res_water: 0.2, res_fire: -0.3, res_metal: -0.1 },
    radius: 0.7,
    height: 2.2,
    aggroRange: 16,
    orbit: [7.5, 10.5], // 远程：保持距离
    superArmor: !0,
    knockResist: 0.4,
    tags: ["plant", "wood"],
    attacks: [
      {
        id: "spit", anim: "attack_spit", animHit: 0.45, minDist: 3.5, maxDist: 15,
        windup: 0.9, active: 0.2, recover: 0.6, cooldown: 2.6,
        shape: "projectile", speed: 11, radius: 0.45, range: 17, count: 1, track: 0.7,
        damage: { base: 12, atk: 1.0 }, element: "wood", knock: 0.8, telegraphColor: 0x3fae7a,
      },
      {
        id: "thorns", anim: "attack_cast", animHit: 0.5, minDist: 0, maxDist: 12,
        windup: 1.2, active: 0.3, recover: 0.7, cooldown: 6.5,
        shape: "circle", at: "target", radius: 2.2, track: 0.55,
        damage: { base: 16, atk: 1.1 }, element: "wood", knock: 0.4, status: { id: "root", dur: 0.8 }, telegraphColor: 0x3fae7a,
      },
      {
        id: "lash", anim: "attack_lash", animHit: 0.32, minDist: 0, maxDist: 3.2,
        windup: 0.6, active: 0.14, recover: 0.5, cooldown: 2.2,
        shape: "arc", radius: 3.2, angle: 120, lunge: 0, track: 0.6,
        damage: { base: 12, atk: 0.9 }, knock: 1.6,
      },
    ],
  },
  vine_elite: {
    name: "千年藤妖",
    model: "/assets/models/vine.glb",
    scale: 1.4,
    tint: { leaf_green: 0x8a5a9a, flower_red: 0xff5a2a, eye_glow: 0xff7a3a },
    auraColor: 0x7b4fa8,
    region: "r2", level: 9, // 难度复核：数据表按 9 级写（6 级 → 9 级、数值同步上调），等级缩放的绝对斜率更陡——练气五层 1700，八层 3600（跟上剑修遗府之后的输出跃升）
    shield: ["fire", "earth"], // §9.2 藤妖 · 火 / 土盾
    shieldFrac: 0.3,
    stats: { hp: 4250, atk: 63, def: 29, move: 2.8, crit: 0, res_wood: 0.35, res_water: 0.2, res_fire: -0.2 },
    radius: 1.0,
    height: 3.0,
    aggroRange: 18,
    orbit: [7.0, 10.0],
    superArmor: !0,
    knockResist: 0.85,
    tags: ["plant", "wood", "elite"],
    attacks: [
      {
        id: "spit3", big: !0, anim: "attack_spit", animHit: 0.45, minDist: 3.5, maxDist: 16,
        windup: 1.0, active: 0.2, recover: 0.7, cooldown: 3.2,
        shape: "projectile", speed: 10, radius: 0.55, range: 18, count: 3, spread: 22, track: 0.7,
        damage: { base: 14, atk: 1.0 }, element: "wood", knock: 1.0, telegraphColor: 0x3fae7a,
      },
      {
        id: "thorns3", big: !0, anim: "attack_cast", animHit: 0.5, minDist: 0, maxDist: 14,
        windup: 1.3, active: 0.3, recover: 0.9, cooldown: 7,
        shape: "circle", at: "target", multi: 3, spread: 3.2, radius: 2.4, track: 0.5,
        damage: { base: 18, atk: 1.1 }, element: "wood", knock: 0.5, status: { id: "root", dur: 1.0 }, telegraphColor: 0x3fae7a,
      },
      {
        id: "lash", anim: "attack_lash", animHit: 0.32, minDist: 0, maxDist: 4.2,
        windup: 0.65, active: 0.16, recover: 0.6, cooldown: 2.4,
        shape: "arc", radius: 4.2, angle: 140, lunge: 0, track: 0.6,
        damage: { base: 16, atk: 1.0 }, knock: 2.0,
      },
    ],
  },
  // Boss 碧鳞水蟒：潜水突袭（落点预警后破水而出）、水柱（多圈）、甩尾（大扇形）、扑咬；火 → 土 → 木三段护盾
  bilin: {
    realm: "2:1", // 境界（血条显示）
    name: "碧鳞水蟒",
    model: "/assets/models/serpent.glb",
    scale: 1.0,
    region: "r2", level: 9,
    boss: "bilin",
    auraColor: 0x3f8fa8,
    shieldPhases: [{ at: 1.0, el: "fire" }, { at: 0.66, el: "earth" }, { at: 0.33, el: "wood" }],
    shrines: !0, // 与关卡五行坛联动（src/game/enemies/shrines.js）
    shieldFrac: 0.2, // 难度复核：0.25 → 0.2，护盾量挪进本体
    stats: { hp: 12000, atk: 60, def: 40, move: 4.2, crit: 0, res_water: 0.4, res_fire: 0.1, res_earth: -0.15 },
    radius: 1.6,
    height: 3.6,
    aggroRange: 26,
    orbit: [6.0, 9.0],
    superArmor: !0,
    knockResist: 1,
    tags: ["beast", "water", "elite", "boss"],
    phaseAnim: "roar",
    attacks: [
      {
        id: "dive", big: !0, anim: "dive", strikeAnim: "emerge", animHit: 0.9, minDist: 5, maxDist: 22,
        windup: 1.7, active: 0.35, recover: 1.2, cooldown: 11,
        shape: "circle", at: "target", radius: 3.4, track: 0.7, teleport: !0, hide: !0,
        damage: { base: 34, atk: 1.2 }, element: "water", knock: 3.2, telegraphColor: 0x3f8fa8,
      },
      {
        id: "spout", big: !0, anim: "attack_spout", animHit: 0.6, minDist: 0, maxDist: 18,
        windup: 1.3, active: 0.4, recover: 0.9, cooldown: 8,
        shape: "circle", at: "target", multi: 4, spread: 4.5, radius: 2.3, track: 0.4,
        damage: { base: 28, atk: 1.0 }, element: "water", knock: 2.0, telegraphColor: 0x3f8fa8,
      },
      {
        id: "tail", big: !0, anim: "attack_tail", animHit: 0.45, minDist: 0, maxDist: 6.5,
        windup: 0.9, active: 0.2, recover: 1.0, cooldown: 5,
        shape: "arc", radius: 6.5, angle: 200, lunge: 0, track: 0.5,
        damage: { base: 30, atk: 1.0 }, knock: 3.0,
      },
      {
        id: "bite", big: !0, anim: "attack_bite", animHit: 0.4, minDist: 2, maxDist: 8,
        windup: 0.75, active: 0.22, recover: 0.8, cooldown: 3.2,
        shape: "line", length: 7.5, width: 2.2, lunge: 4.5, track: 0.55,
        damage: { base: 30, atk: 1.2 }, knock: 2.4,
      },
    ],
  },

  // =============================== 突破试炼 ===============================
  // 心魔：主角的墨色倒影（属性 = 主角 × 0.8，气血 3000），只在突破筑基时出现（洞府模块调用 spawn("xinmo", pos)）
  xinmo: {
    name: "心魔",
    model: "/assets/models/hero.glb",
    scale: 1.0,
    region: "trial", level: 9,
    mirrorHero: 0.8,
    lootSource: "none",
    insight: 0,
    shield: null,
    auraColor: 0xd2321e,
    stats: { hp: 3000, atk: 40, def: 16, move: 5.6, crit: 0.1, critDmg: 1.6 },
    radius: 0.45,
    height: 1.85,
    aggroRange: 40,
    orbit: [3.5, 5.5],
    superArmor: !0,
    knockResist: 0.6,
    tags: ["demon", "elite", "boss", "noShield"],
    attacks: [
      {
        id: "slash3", big: !0, anims: ["slash1", "slash2", "slash3"], anim: "slash1", animHit: 0.22, minDist: 0, maxDist: 3.0,
        windup: 0.55, comboWindup: 0.32, active: 0.14, recover: 0.6, cooldown: 3.0, combo: 3,
        shape: "arc", radius: 2.8, angle: 140, lunge: 1.2, track: 0.6,
        damage: { base: 10, atk: 0.7 }, knock: 1.2, telegraphColor: 0xd2321e,
      },
      {
        id: "sword_qi", anim: "cast_point", animHit: 0.25, minDist: 3, maxDist: 14,
        windup: 0.7, active: 0.2, recover: 0.6, cooldown: 4.0,
        shape: "projectile", speed: 16, radius: 0.6, range: 16, count: 3, spread: 18, track: 0.7,
        damage: { base: 12, atk: 0.8 }, element: "metal", knock: 1.0, telegraphColor: 0xd2321e,
      },
      {
        id: "dash", big: !0, anim: "slash3", animHit: 0.26, minDist: 3, maxDist: 9,
        windup: 0.75, active: 0.22, recover: 0.8, cooldown: 6,
        shape: "line", length: 8, width: 1.6, lunge: 7, track: 0.55,
        damage: { base: 20, atk: 1.0 }, knock: 2.0, telegraphColor: 0xd2321e,
      },
    ],
  },
};

// 区域二的狼妖头目：招式、外观同区域一，数据表按 9 级写（气血 / 攻防的等级缩放斜率更陡：练气五层 ≈ 1500，八层 ≈ 3200）；
// 护盾不固定（区域二精英点给火 / 土，巡游随机）。掉落内丹见 loot.js CORE_OF.wolf_elite_r2
ENEMY_TYPES.wolf_elite_r2 = {
  ...ENEMY_TYPES.wolf_elite,
  name: "灰鬃头目",
  region: "r2", level: 9,
  shield: null,
  stats: { ...ENEMY_TYPES.wolf_elite.stats, hp: 3750, atk: 46, def: 38 },
};

// =============================== 低阶怪（区域规划 v2 · 怪物生态 v1）：日常材料的主要来源 ===============================
// 数值由数值策划给定（docs/review/numeric/怪物生态_v1.md）；同级一击约占主角气血 4–7%
ENEMY_TYPES.rat = {
  name: "山鼠妖", model: "/assets/models/rat.glb", scale: 1.25, runRef: 6.5,
  region: "r1", level: 1, tier: "low", lootSource: "mob_low",
  stats: { hp: 60, atk: 6, def: 0, move: 6.8, crit: 0, res_earth: 0.1 },
  radius: 0.4, height: 0.8, orbit: [2.4, 3.6], knockResist: 0,
  tags: ["beast", "earth"],
  attacks: [
    { id: "bite", anim: "attack_bite", animHit: 0.25, minDist: 0.8, maxDist: 3.2, windup: 0.45, active: 0.16, recover: 0.4, cooldown: 1.6,
      shape: "line", length: 2.6, width: 0.8, lunge: 1.8, track: 0.55, damage: { base: 5, atk: 0.9 }, knock: 0.5 },
    { id: "nip", anim: "attack_bite", animHit: 0.25, minDist: 0, maxDist: 1.6, windup: 0.38, active: 0.1, recover: 0.35, cooldown: 1.3,
      shape: "arc", radius: 1.5, angle: 90, lunge: 0.3, track: 0.6, damage: { base: 4, atk: 0.7 }, knock: 0.3 },
  ],
};
ENEMY_TYPES.crow = {
  name: "鸦妖", model: "/assets/models/crow.glb", scale: 1.0, runRef: 6,
  region: "r1", level: 1, tier: "low", lootSource: "mob_low",
  stats: { hp: 55, atk: 7, def: 0, move: 6.2, crit: 0, res_metal: -0.2 },
  radius: 0.5, height: 2.3, orbit: [4.5, 6.5], knockResist: 0.1,
  tags: ["beast", "flying", "metal"],
  attacks: [
    { id: "swoop", anim: "attack_swoop", animHit: 0.4, minDist: 2.5, maxDist: 7.5, windup: 0.7, active: 0.28, recover: 0.6, cooldown: 3.2,
      shape: "line", length: 6.5, width: 1.2, lunge: 5.5, track: 0.6, damage: { base: 6, atk: 1.0 }, knock: 0.8 },
    { id: "peck", anim: "attack_bite", animHit: 0.25, minDist: 0, maxDist: 2.0, windup: 0.42, active: 0.1, recover: 0.4, cooldown: 1.8,
      shape: "arc", radius: 1.8, angle: 90, lunge: 0.4, track: 0.6, damage: { base: 4, atk: 0.8 }, knock: 0.4 },
  ],
};
ENEMY_TYPES.spider = {
  name: "蛛妖", model: "/assets/models/spider.glb", scale: 1.0, runRef: 4,
  region: "r1", level: 1, tier: "low", lootSource: "mob_low",
  stats: { hp: 80, atk: 7, def: 2, move: 4.0, crit: 0, res_wood: 0.15, res_fire: -0.25 },
  radius: 0.6, height: 1.0, orbit: [6, 9], knockResist: 0.2,
  tags: ["beast", "wood"],
  attacks: [
    { id: "web", anim: "attack_spit", animHit: 0.45, minDist: 3, maxDist: 12, windup: 0.8, active: 0.2, recover: 0.6, cooldown: 3.0,
      shape: "projectile", speed: 9, radius: 0.4, range: 13, count: 1, track: 0.7, damage: { base: 5, atk: 0.8 }, element: "wood", knock: 0.2,
      status: { id: "chill", dur: 1.5 }, telegraphColor: 0xd8d4c4 },
    { id: "bite", anim: "attack_bite", animHit: 0.25, minDist: 0, maxDist: 2.0, windup: 0.45, active: 0.12, recover: 0.45, cooldown: 1.8,
      shape: "arc", radius: 1.8, angle: 100, lunge: 0.4, track: 0.6, damage: { base: 5, atk: 0.8 }, knock: 0.4 },
  ],
};
ENEMY_TYPES.snake = {
  name: "竹叶青", model: "/assets/models/snake.glb", scale: 1.4, runRef: 5.5,
  region: "r2", level: 5, tier: "low", lootSource: "mob_low",
  stats: { hp: 200, atk: 14, def: 4, move: 5.6, crit: 0, res_wood: 0.2, res_metal: -0.2 },
  radius: 0.5, height: 0.9, orbit: [3, 4.5], knockResist: 0.1,
  tags: ["beast", "wood"],
  attacks: [
    { id: "strike", anim: "attack_bite", animHit: 0.3, minDist: 1, maxDist: 4.2, windup: 0.55, active: 0.18, recover: 0.5, cooldown: 2.0,
      shape: "line", length: 3.6, width: 0.9, lunge: 2.8, track: 0.55, damage: { base: 8, atk: 1.0 }, knock: 0.6, status: { id: "chill", dur: 1 } },
  ],
};
ENEMY_TYPES.toad = {
  name: "寒蟾", model: "/assets/models/toad.glb", scale: 1.15, runRef: 3,
  region: "r2", level: 5, tier: "low", lootSource: "mob_low",
  stats: { hp: 240, atk: 13, def: 6, move: 3.0, crit: 0, res_water: 0.35, res_earth: -0.2 },
  radius: 0.75, height: 1.1, orbit: [3, 5], superArmor: !0, knockResist: 0.6,
  tags: ["beast", "water"],
  attacks: [
    { id: "breath", anim: "attack_breath", animHit: 0.5, minDist: 0, maxDist: 4.2, windup: 0.9, active: 0.4, recover: 0.7, cooldown: 4.5,
      shape: "arc", radius: 4.2, angle: 70, lunge: 0, track: 0.5, damage: { base: 8, atk: 0.9 }, element: "water", knock: 0.4,
      status: { id: "chill", dur: 1.5 }, telegraphColor: 0x6ab8d8 },
    { id: "slam", anim: "attack_slam", animHit: 0.48, minDist: 0, maxDist: 2.6, windup: 0.8, active: 0.2, recover: 0.8, cooldown: 5,
      shape: "circle", radius: 2.6, lunge: 0, track: 0, damage: { base: 10, atk: 1.0 }, knock: 2.0, telegraphColor: 0x6ab8d8 },
  ],
};

// =============== 异种（每局 0–1 只，只在关卡的异种点 points.rares 出现）：模型同原种、稀有染色、境界明显更高、带小特性 ===============
ENEMY_TYPES.chilang = {
  ...ENEMY_TYPES.wolf,
  name: "赤·竹林狼妖", scale: 1.3, runRef: 6.5,
  tint: { fur_ink: 0x7a1a10, fur_light: 0xf09a3a, eye_red: 0xffe060 },
  auraColor: 0xff6a2a, halo: 0xff8a3a, nameColor: "#c9a040",
  region: "r1", level: 8, fixedLevel: 8, tier: "rare", lootSource: "rare_variant", insight: 10,
  stats: { hp: 860, atk: 29, def: 15, move: 6.2, crit: 0.05, res_fire: 0.4, res_water: -0.2 },
  radius: 0.65, height: 1.9, orbit: [3.6, 5.2], superArmor: !0, knockResist: 0.7,
  tags: ["beast", "fire", "rare"],
  // 小特性：咬中附带灼烧
  attacks: ENEMY_TYPES.wolf_elite.attacks.filter((a) => a.id !== "howl").map((a) => ({ ...a, big: a.id === "lunge3" || a.id === "bite", element: "fire", status: { id: "burn", dur: 3 }, telegraphColor: 0xd2321e })),
};
ENEMY_TYPES.xuanlin_bat = {
  ...ENEMY_TYPES.bat,
  name: "玄·鳞蝠", scale: 1.45,
  tint: { fur_ink: 0x0e0b14, wing_membrane: 0x5a4416, eye_red: 0xb8f0ff },
  auraColor: 0x7aa8c8, halo: 0x9ac8e8, nameColor: "#c9a040",
  region: "r2", level: 10, fixedLevel: 10, tier: "rare", lootSource: "rare_variant", insight: 30,
  stats: { hp: 1575, atk: 46, def: 18, move: 6.6, crit: 0.05, res_water: 0.4, res_metal: -0.15 },
  radius: 0.8, height: 3.0, orbit: [5, 7], superArmor: !0, knockResist: 0.7,
  tags: ["beast", "flying", "water", "rare"],
  // 小特性：双段俯冲，命中带寒意减速
  attacks: [
    { ...ENEMY_TYPES.bat.attacks[0], id: "swoop2", big: !0, combo: 2, comboWindup: 0.5, status: { id: "chill", dur: 2 }, element: "water", telegraphColor: 0x3f8fa8 },
    { ...ENEMY_TYPES.bat.attacks[1], status: { id: "chill", dur: 1 } },
  ],
};

// tier 推断（数值 / 掉落按 tier 区分）
for (const d of Object.values(ENEMY_TYPES)) {
  const tg = d.tags || [];
  d.tier ??= tg.includes("boss") ? "boss" : tg.includes("elite") ? "elite" : tg.includes("rare") ? "rare" : "std";
}

// 遭遇编排：一群怪的组成（按区域，权重抽一种）；精英按区域抽
export const ENCOUNTER = {
  // 每局精英规则：开局 / 守卫 / 夜潮共用上限 cap，午时巡游另计 patrolCap；两只精英最小间距、首领场地半径内不刷精英；被拦下的精英换成同族普通怪
  eliteRules: { cap: { r1: 3, r2: 4 }, patrolCap: { r1: 1, r2: 2 }, minGap: 25, bossClear: 30, fallback: { wolf_elite: "wolf", wolf_elite_r2: "wolf", vine_elite: "vine" } },
  packMin: 4,
  packMax: 6,
  eliteEvery: 3,
  respawnDelay: 4,
  spawnRadius: [10, 14],
  maxAttackers: 1, // 同一时间最多几只在出招（难度复核：2 → 1——单只更难（霸体），群殴更弱；Boss 不受限）
  packs: {
    tutorial: [[["wolf"], 1]],
    r1: [[["wolf"], 5], [["wolf", "wolf_grey"], 4], [["golem", "wolf_grey", "wolf_grey"], 2]],
    r2: [[["bat"], 3], [["vine", "bat", "bat"], 4], [["wolf", "wolf", "vine"], 3]],
  },
  elites: { tutorial: ["wolf_elite"], r1: ["wolf_elite"], r2: ["wolf_elite_r2", "vine_elite"] },
  bosses: { r1: "qingya", r2: "bilin" },
  // 区域等级区间：刷怪等级 = 主角层数夹在区间内
  levels: { tutorial: [1, 1], r1: [1, 4], r2: [5, 9], trial: [9, 9] },
  // 刷怪点没写 mobs 时按 栖息地 habitat × 档次 tier 选种类（关卡的 spawns[i].habitat / tier）：
  //   low 只出低阶怪；mid 出标准怪并混 1–2 只同栖息地的低阶怪；high 只出标准怪、等级 +1
  habitats: {
    r1: {
      low: { burrow: ["rat"], grass: ["rat"], nest: ["crow"], rock: ["crow", "spider"], ruin: ["spider", "crow"], water: ["rat"] },
      std: { grass: ["wolf", "wolf_grey"], nest: ["wolf", "wolf_grey"], burrow: ["wolf_grey"], ruin: ["golem", "wolf_grey"], rock: ["golem", "wolf_grey"], water: ["wolf"] },
    },
    r2: {
      low: { grass: ["snake"], water: ["snake", "toad"], rock: ["toad"], nest: ["snake"], burrow: ["snake"], ruin: ["toad"] },
      std: { grass: ["vine", "wolf"], water: ["vine", "bat"], rock: ["bat"], nest: ["bat"], ruin: ["vine"], burrow: ["wolf"] },
    },
  },
  // 异种点 sign → 异种（每局 0–1 只）
  rares: { r1: { scorch: "chilang", frost: "chilang", bloom: "chilang", bones: "chilang", mist: "chilang" }, r2: { mist: "xuanlin_bat", bones: "xuanlin_bat", frost: "xuanlin_bat", scorch: "xuanlin_bat", bloom: "xuanlin_bat" } },
  // 等级缩放（相对数据表 level）：气血 / 攻击每级倍率
  scale: { hp: 0.15, atk: 0.12, def: 0.08 },
};
