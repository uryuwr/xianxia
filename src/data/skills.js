// 法术与阵法数据表。新增内容只需在这里加一条，效果类型由 src/game/skills/effects.js 执行。
//
// 法术字段：
//   id, name, glyph（技能栏上的大字）, element（metal 金 / wood 木 / water 水 / fire 火 / earth 土）
//   cost 真气, cd 冷却秒, castKind 施法手势（"point" 指 / "sweep" 挥 / "raise" 举）, castTime 前摇秒, range 最大施法距离
//   desc 描述
//   effect: { type, ...参数 }   支持的 type：
//     projectile  飞行物：count, spread（弧度）, speed, range, radius, pierce, base, scale{atk,spell}, look（外观 "qi" 剑气 / "talisman" 符纸）, explode?{radius, base, scale}
//     cone        扇形：range, angle（全角弧度）, base, scale
//     zone        地面区域：radius, dur, tick, base, scale（每跳伤害）
//     slam        延迟落点重击：delay, radius, base, scale
//     chain       连锁闪电：range, jumps, jumpRange, base, scale, falloff
//     shield      护体：absorb, absorbScale{spell}, dur
//     （功法体系 v2 新增，执行器同在 effects.js）
//     chain.antiAir { mul, stun }  对飞行敌人（tags 含 flying）伤害 ×mul 并眩晕 stun 秒（"打落"）
//     buff        自身增益：momentum 立得气势（raw）, status 主角身上的状态 id, dur
//     grapple     藤索：speed, range, radius, base, scale；命中第一个敌人 → 主角被拉到它身前 stop 米（pullDur 秒，无敌），+momentum 气势
//     counter     反击架势：window 秒内第一次受击被化去 → 扇形 radius / angle（全角弧度）的反击，base, scale，+momentum 气势
//     summon      召唤绕身的火鸦：count 只，每只 strikes 次，life 秒，interval 两次出击间隔，seek 索敌半径，speed, radius, base, scale
//     blink       遁地位移：range, dur（期间无敌、沿地面走，崖 / 深水 / 碰撞体照挡），落点 radius 的破土伤害 base, scale，非精英眩晕 stun 秒
//   status: { id, stacks, dur }  命中附带的五行状态（strength 随施法者对应五行属性增长）
//   role 定位（技能栏提示）：每个法术只承担一种职责，避免同质化
//   boss: { poise, chan }  首领控制器（青牙）每次命中给的狼威 / 读条打断值；不填则按五行旧规则（剑气斩 / 火符 / 寒冰锥 / 缠藤）
//
// 真气与炼化增益 v1（docs/review/numeric/真气与炼化增益_v1.md）：真气不再自动回复，耗蓝 剑气斩 20 / 火符 28 / 寒冰锥 30 / 缠藤诀 30 / 土遁 34
// 设计约定（v0.3）：法术是"决策型"技能——冷却 8～18 秒、一次释放扭转局面；日常输出交给普攻与法宝。
// 法术栏按境界解锁（REALMS）。功法体系 v2：12 门，五行 × 定位不重复（每门一个"动词"），见 docs/design/功法体系_v2.md。
export const SPELLS = {
  sword_qi: {
    id: "sword_qi", name: "剑气斩", glyph: "剑", element: "metal", role: "破防", cost: 20, cd: 8, castKind: "sweep", castTime: 0.12, range: 14,
    desc: "挥出三道扇形剑气，穿透敌人，叠加两层破甲（受到伤害增加）",
    effect: { type: "projectile", look: "qi", count: 3, spread: 0.16, speed: 24, range: 14, radius: 0.6, pierce: !0, base: 16, scale: { atk: 0.5, spell: 0.6 } }, // 难度复核：扇面收窄（单体三道都中）、单道伤害降低并随剑走（atk）
    status: { id: "armor_break", stacks: 2, dur: 6 },
  },
  fire_talisman: {
    id: "fire_talisman", name: "火符", glyph: "火", element: "fire", role: "群伤", cost: 28, cd: 10, castKind: "point", castTime: 0.15, range: 16,
    desc: "掷出一张火符，命中后大范围爆炸，附带灼烧",
    effect: { type: "projectile", look: "talisman", count: 1, spread: 0, speed: 17, range: 16, radius: 0.5, pierce: !1, base: 10, scale: { spell: 0.5 },
      explode: { radius: 3.6, base: 60, scale: { spell: 3.0 } } },
    status: { id: "burn", stacks: 3, dur: 5 },
  },
  frost: {
    id: "frost", name: "寒冰锥", glyph: "冰", element: "water", role: "单体爆发", cost: 30, cd: 12, castKind: "point", castTime: 0.2, range: 16,
    desc: "凝出一枚冰锥疾射而出，对首个命中的敌人造成重创并直接冻结",
    effect: { type: "projectile", look: "qi", count: 1, spread: 0, speed: 30, range: 16, radius: 0.7, pierce: !1, base: 120, scale: { spell: 6.0 } },
    status: { id: "chill", stacks: 3, dur: 4 },
  },
  vine: {
    id: "vine", name: "缠藤诀", glyph: "藤", element: "wood", role: "群控", cost: 30, cd: 14, castKind: "point", castTime: 0.2, range: 14,
    desc: "在指定处生出大片藤蔓，缠绕区域内所有敌人，使其无法移动",
    effect: { type: "zone", radius: 4.2, dur: 4, tick: 0.5, base: 7, scale: { spell: 0.5 } }, // 数值评审：土盾阶段需能用木削盾；难度复核：10+0.7 → 7+0.5（不再一片藤就清掉一群）
    status: { id: "root", stacks: 1, dur: 3.5 },
  },
  earth_shield: {
    id: "earth_shield", name: "土遁护体", glyph: "盾", element: "earth", role: "保命", cost: 34, cd: 18, castKind: "raise", castTime: 0.15, range: 0,
    desc: "岩甲护体，吸收大量伤害",
    effect: { type: "shield", absorb: 120, absorbScale: { spell: 6 }, dur: 8 },
  },

  // ================= 功法体系 v2（docs/design/功法体系_v2.md，2026-11-17）：每门一个"动词"，不做数值变体 =================
  // 数值为战斗设计草案，**待数值复核**（数值策划 aa9fca92484839fa1）。boss = 首领控制器读的 { poise 狼威 / 次命中, chan 读条打断值 / 次命中 }。
  thunder: {
    id: "thunder", name: "掌心雷", glyph: "雷", element: "metal", role: "对空", cost: 22, cd: 9, castKind: "point", castTime: 0.12, range: 12,
    desc: "掌心雷在敌人之间跳跃，自动索敌；击中飞行的妖物伤害更重，并把它打落在地",
    effect: { type: "chain", range: 12, jumps: 3, jumpRange: 5, base: 22, scale: { spell: 0.9 }, falloff: 0.8, antiAir: { mul: 1.5, stun: 0.8 } },
    status: { id: "armor_break", stacks: 1, dur: 5 },
    boss: { poise: 2, chan: 0.25 },
  },
  ningfeng: {
    id: "ningfeng", name: "凝锋诀", glyph: "锋", element: "metal", role: "蓄势", cost: 24, cd: 16, castKind: "raise", castTime: 0.15, range: 0,
    desc: "以真气养剑：立得气势，片刻之内蓄势斩的剑意更利，削盾更深",
    effect: { type: "buff", momentum: 35, status: "ningfeng", dur: 8 }, // 剑意削盾 × (1 + 0.5)，见 src/game/player.js chargeHit 的 intentCut
  },
  vine_pull: {
    id: "vine_pull", name: "藤引", glyph: "引", element: "wood", role: "突进", cost: 18, cd: 7, castKind: "point", castTime: 0.1, range: 11,
    desc: "掷出青藤缠住敌人，借藤一荡贴到它身前；落空则藤自收回",
    effect: { type: "grapple", speed: 34, range: 11, radius: 0.6, base: 14, scale: { spell: 0.4 }, stop: 1.4, pullDur: 0.18, momentum: 8 },
    status: { id: "root", stacks: 1, dur: 1.0 },
    boss: { poise: 4, chan: 0.3 },
  },
  zhishui: {
    id: "zhishui", name: "止水诀", glyph: "止", element: "water", role: "反击", cost: 20, cd: 10, castKind: "raise", castTime: 0, range: 0,
    desc: "心如止水：片刻之内化去下一次攻击，并以水浪反卷来敌",
    effect: { type: "counter", window: 0.6, radius: 4.5, angle: 1.75, base: 30, scale: { spell: 2.2 }, momentum: 25 },
    status: { id: "chill", stacks: 2, dur: 4 },
    boss: { poise: 6, chan: 0.5 }, // 反击成立另按"读招完美闪身"给狼威（src/game/enemies/bosses/qingya.js 监听 player:counter）
  },
  fire_crow: {
    id: "fire_crow", name: "火鸦", glyph: "鸦", element: "fire", role: "召唤", cost: 30, cd: 14, castKind: "raise", castTime: 0.2, range: 0,
    desc: "放出三只火鸦绕身盘旋，自行扑向附近的敌人",
    effect: { type: "summon", count: 3, strikes: 2, life: 6, interval: 0.9, seek: 10, speed: 14, radius: 0.6, base: 15, scale: { spell: 0.75 } }, // 6 击合计 ≈ 寒冰锥 0.75 倍（自动、分散在 6 秒）
    status: { id: "burn", stacks: 1, dur: 4 },
    boss: { poise: 2, chan: 0.15 },
  },
  rock: {
    id: "rock", name: "落石诀", glyph: "岩", element: "earth", role: "打断", cost: 24, cd: 12, castKind: "raise", castTime: 0.2, range: 14,
    desc: "召巨石砸落指定处，眩晕敌人；落得准，可以砸断妖物的读条",
    effect: { type: "slam", delay: 0.45, radius: 2.6, base: 36, scale: { spell: 1.6 } },
    status: { id: "stun", stacks: 1, dur: 1.0 },
    boss: { poise: 18, chan: 1.2 },
  },
  earth_walk: {
    id: "earth_walk", name: "地行术", glyph: "遁", element: "earth", role: "位移", cost: 16, cd: 9, castKind: "point", castTime: 0.05, range: 9,
    desc: "遁入地中疾行，在落点破土而出，震晕身旁的妖物；崖壁、深水与山石仍会挡路",
    effect: { type: "blink", range: 9, dur: 0.32, radius: 2.2, base: 12, scale: { spell: 0.6 }, stun: 0.5 },
    boss: { poise: 3, chan: 0.3 },
  },
};

// 功法体系 v2（docs/design/功法体系_v2.md）：原先封存的落石诀、掌心雷改了定位后进了技能池；封存区留空（tools/scenarios/loop_targeting 仍会读它）
export const SPELL_ARCHIVE = {};

// 境界决定法术栏数量：练气初期 1 个，练气五层 2 个，筑基 3 个
export const REALMS = [
  { id: "lianqi1", name: "练气·一层", slots: 1 },
  { id: "lianqi5", name: "练气·五层", slots: 2 },
  { id: "zhuji", name: "筑基", slots: 3 },
];

// 阵法（T 键在鼠标处布阵，最多同时 2 个）
//   kind: "strike" 周期斩击 / "field" 区域状态 / "aura" 主角在阵内获得加成
export const FORMATIONS = {
  sword_array: {
    id: "sword_array", name: "剑阵", glyph: "剑", element: "metal", cost: 30, cd: 16, radius: 4, dur: 10, kind: "strike",
    desc: "阵中剑光周期斩击阵内敌人，附带破甲",
    tick: 0.6, targets: 2, base: 10, scale: { spell: 0.6 }, status: { id: "armor_break", stacks: 1, dur: 4 },
  },
  fire_array: {
    id: "fire_array", name: "火阵", glyph: "焱", element: "fire", cost: 30, cd: 16, radius: 3.5, dur: 8, kind: "field",
    desc: "烈焰灼烧阵内所有敌人",
    tick: 0.5, base: 3, scale: { spell: 0.15 }, status: { id: "burn", stacks: 1, dur: 3 },
  },
  spirit_array: {
    id: "spirit_array", name: "聚灵阵", glyph: "灵", element: null, cost: 20, cd: 20, radius: 3.5, dur: 12, kind: "aura",
    desc: "身处阵中时，真气回复大增，冷却加快",
    mods: [{ stat: "mpRegen", type: "flat", value: 15 }, { stat: "cdr", type: "flat", value: 0.2 }], cdSpeed: 0.5,
  },
};
