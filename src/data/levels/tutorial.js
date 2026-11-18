// 序章（教学局 v2）：区域一西南角——溪边醒来 → 石桥 → 狼踪 → 竹径（岔路：灵蚌池小环）→ 石傀 → 狼头目 → 破洞府。
// 6–9 分钟，6 场战斗（单只 → 两只 → 灰狼伏击 → 三只混编 → 石傀混编 → 精英·木盾），依次教：
// 移动、拾取、普攻、闪身（完美闪避）、拾取进储物袋、采灵草、开宝箱、丹药、精英与护盾（金符·金克木）、撤离读条。
// 设计与理由：docs/review/level/序章设计_v2.md。地形与 r1 共用（同一个高度场），这里只覆盖教学布局、植被空地与少量景物。
//
// tutorialLayout.steps：流程按顺序推进（seq 递增；optional 的可跳过，branch 指出岔路）。每步字段：
//   id         唯一 id（流程按 id 取位置；"sword" / "wolves" / "wolf_last" / "cave" 兼容旧版 run.js）
//   chapter    序章小节标题（UI 显示"序章 · 二 狼踪"）
//   pos        [x, z] 该步的位置（目标卷轴的方向指示、到达判定都用它）
//   goal       目标卷轴上的一句话（墨笔）；hint 进入该步时的教学提示（一次性）；done 完成时的反馈
//   teach      教的概念 id（move / pickup / attack / dodge / bag / gather / chest / pill / shield / guard / extract）
//   trigger    完成条件 { type: "reach"(r 米内) | "pickup"(item) | "kill"(本步刷的怪全灭) | "gather"(n) | "chest" | "pill" | "shieldBreak" | "extract" }
//   spawn      进入该步时刷的怪 { mobs: [类型…], elite?: true, shield?: 五行, at?: [x, z], when?: "reach", r?: 触发半径, aggro?: true }
//              （类型只用 enemies.js 现有的 wolf / wolf_grey / golem / wolf_elite，数值不改）
//   loot       固定掉落 / 宝箱内容（不走随机掉落表）
//   gate       该步完成前封住的东西（"cave" = 破洞府被藤蔓封住，狼头目死后才开）
//   say        林墨的心里话（墨笔对白条，不暂停，每句约 2.5 秒）；spawn.when："reach" 走近 r 米 | "afterPrev" 上一步完成时 | "channel" 读条开始时
import r1 from "./r1.js";

const steps = [
  // ---------------- 一 · 溪边 ----------------
  { seq: 1, id: "wake", chapter: "序章 · 一 溪边", pos: [8, 47], teach: "move", goal: "沿溪往西，过石桥", hint: "WASD 移动 · 镜头固定，画面上方是北",
    say: ["（……水声。我不是在加班改方案吗？）", "（这山、这溪——像极了一幅没干透的水墨。）"], trigger: { type: "reach", r: 3, at: [3, 43] }, done: "" },
  { seq: 2, id: "sword", chapter: "序章 · 一 溪边", pos: [3, 43], teach: "pickup", goal: "取出溪边的锈剑", hint: "走近按 F 搜，墨封化开后点它（或再按 F 全取）；武器会直接佩上", trigger: { type: "pickup", item: "rust_sword" }, loot: [{ id: "rust_sword", n: 1 }], done: "佩上锈剑" },
  { seq: 3, id: "bridge", chapter: "序章 · 一 溪边", pos: [-8, 41.5], teach: "move", goal: "过石桥", hint: "跟着目标卷轴上的墨箭走：它总指向下一处要去的地方", trigger: { type: "reach", r: 4 }, done: "" },
  // ---------------- 二 · 狼踪 ----------------
  { seq: 4, id: "wolf_first", chapter: "序章 · 二 狼踪", pos: [-24, 48], teach: "attack", goal: "击退竹林狼妖", say: ["（狼？会说人话的那种我可不想遇上……）"], hint: "左键出剑：连按三下是一套连招", spawn: { mobs: ["wolf"], when: "reach", r: 14, aggro: !0 }, trigger: { type: "kill" }, done: "斩妖 ×1" },
  { seq: 5, id: "wolves", chapter: "序章 · 二 狼踪", pos: [-40, 39], teach: "dodge", goal: "击退两只狼妖", hint: "狼妖扑咬前会蓄力（地上一道墨线）——此时按空格闪身；贴着出招闪过去是「完美闪避」，下一剑更重", spawn: { mobs: ["wolf", "wolf"], when: "reach", r: 13, aggro: !0 }, trigger: { type: "kill" }, done: "完美闪避！" },
  { seq: 6, id: "loot", chapter: "序章 · 二 狼踪", pos: [-40, 39], teach: "bag", goal: "搜狼妖遗骸", hint: "妖兽倒下会留下遗骸：靠近按 F 搜，格子逐个探明后取出（再按 F 全取），收进储物袋；按 Tab 打开储物袋——每件东西占格子，袋子满了要取舍", loot: [{ id: "wolf_hide", n: 1 }, { stones: 3 }], trigger: { type: "pickup" }, done: "收入储物袋" },
  { seq: 7, id: "herb", chapter: "序章 · 二 狼踪", pos: [-37, 31], teach: "gather", goal: "采一株青灵草", hint: "灵草、矿脉：靠近按 F 采集（要站定片刻；挨打会被打断）", trigger: { type: "gather", n: 1 }, done: "采得青灵草" },
  { seq: 7.5, id: "ambush", chapter: "序章 · 二 狼踪", pos: [-44, 33], teach: "dodge", goal: "击退扑出来的灰狼", hint: "采集时留心四周——灰狼快而脆，闪身绕到侧面再砍", spawn: { mobs: ["wolf_grey", "wolf_grey"], at: [-48, 34], when: "afterPrev", aggro: !0 }, trigger: { type: "kill" }, done: "斩妖 ×2", say: ["（采个草都有埋伏，这地方不讲武德。）"] },
  // ---------------- 三 · 竹径（岔路） ----------------
  {
    seq: 8, id: "fork", chapter: "序章 · 三 竹径", pos: [-38, 24], teach: "move", goal: "进竹径；或先绕灵蚌池采药", hint: "路碑：西 · 竹径（有宝箱）　东 · 灵蚌池（灵草）", trigger: { type: "reach", r: 5 },
    branch: [{ to: "bamboo", label: "西 · 竹径" }, { to: "pool_s", label: "东 · 灵蚌池（可选）" }], done: "",
  },
  { seq: 9, id: "pool_s", chapter: "序章 · 三 竹径", pos: [-25, 32], optional: !0, teach: "gather", goal: "（可选）池南的灵草", hint: "", trigger: { type: "gather", n: 1 }, done: "采得青灵草" },
  { seq: 10, id: "pool_n", chapter: "序章 · 三 竹径", pos: [-14, 15], optional: !0, teach: "gather", goal: "（可选）池北的凝露花", hint: "支路上的东西不拿也能通关——但储物袋里的每一样，回府都能换成修为", trigger: { type: "gather", n: 1 }, done: "采得凝露花" },
  { seq: 11, id: "bamboo", chapter: "序章 · 三 竹径", pos: [-55, 25], teach: "attack", goal: "击退竹林里的狼群", hint: "被围时别站在中间：边退边打，先收拾冲在最前的那只。左上「气势」过半后按右键放蓄势斩，攒满（势成）威力最大", spawn: { mobs: ["wolf", "wolf", "wolf_grey"], when: "reach", r: 12, aggro: !0 }, trigger: { type: "kill" }, done: "斩妖 ×3" },
  { seq: 12, id: "chest", chapter: "序章 · 三 竹径", pos: [-62, 29.5], target: [-64, 31], teach: "chest", goal: "打开竹林里的木箱", hint: "宝箱：靠近按 F 开启", say: ["（箱底压着几张画着「金」字的黄符……符箓？真有这种东西？）"], loot: [{ id: "huichun_dan", n: 2 }, { id: "fu_metal", n: 3 }], trigger: { type: "chest" }, done: "得回春丹 ×2、金符 ×3" },
  { seq: 13, id: "pill", chapter: "序章 · 三 竹径", pos: [-62, 29.5], teach: "pill", goal: "气血不足时服一枚回春丹", hint: "丹药在丹药栏里：按 2 服回春丹（3 秒内回血）。丹药出门能带的数量有限", trigger: { type: "pill", orHpAbove: 0.9 }, done: "" },
  // ---------------- 四 · 石傀 ----------------
  { seq: 14, id: "golem", chapter: "序章 · 四 石傀", pos: [-60, 13], say: ["（石头……在动？）"], teach: "guard", goal: "击退石傀与灰狼", hint: "石傀有硬壳：出招打不断。等它砸完那一下，再绕到身后砍", spawn: { mobs: ["golem", "wolf_grey", "wolf_grey"], when: "reach", r: 13, aggro: !0 }, trigger: { type: "kill" }, done: "斩妖 ×3" },
  // ---------------- 五 · 狼头目 ----------------
  {
    seq: 15, id: "elite", chapter: "序章 · 五 狼头目", pos: [-34, 14], teach: "shield", goal: "击败狼妖头目", gate: "cave",
    say: ["（崖下那个洞口……被藤蔓封着。这头大狼守在门口，绕不过去了。）"],
    hint: "精英带着「木盾」：盾在时本体不掉血，剑砍上去收效甚微。五行相克，金克木——按 3 掷出金符破盾，破盾后它会眩晕、受伤加重",
    spawn: { mobs: ["wolf_elite"], elite: !0, shield: "wood", when: "reach", r: 15, aggro: !0 }, trigger: { type: "kill" }, done: "狼头目伏诛 · 洞口的藤蔓松开了",
    sub: [{ on: "shieldBreak", toast: "破盾！趁它眩晕全力出剑" }],
  },
  // ---------------- 六 · 破洞府 ----------------
  {
    seq: 16, id: "cave", chapter: "序章 · 六 破洞府", pos: [-27, 6], teach: "extract", goal: "进破洞府，读条撤离",
    hint: "撤离要读条：站在圈内按 F，离开圈子读条暂停。读条会引来附近的妖兽", spawn: { mobs: ["wolf_grey", "wolf_grey"], at: [-46, 10], when: "channel", aggro: !0 },
    trigger: { type: "extract" }, done: "回府", say: ["（洞里有张石床、一口枯井……先在这儿落脚吧。）"],
  },
  // 兼容旧版 run.js（按 id 取 "wolf_last"）：等同第一只狼的位置；新流程忽略 legacy
  { id: "wolf_last", legacy: !0, pos: [-24, 48] },
];

export default {
  ...r1,
  tutorial: !0,
  // 序章需要的少量景物：岔路路碑、狼头目的骨堆、破洞府前的藤蔓（封洞）和石灯
  props: [
    ...r1.props,
    { type: "stele", pos: [-36, 21], ry: 0.3, name: "路碑" },
    { type: "bones", pos: [-31, 11] },
    { type: "bones", pos: [-37, 9] },
    { type: "lantern", pos: [-23, 8] },
  ],
  veg: { ...r1.veg, clearings: [...(r1.veg.clearings || []), [-55, 26, 8], [-64, 31, 4], [-60, 13, 8], [-38, 24, 4], [-46, 34, 5]] },
  tutorialLayout: {
    title: "序章",
    // 序章敌人倍率（数值复核 docs/review/numeric/难度曲线复核_v1.md §5；流程组刷怪后施加，只作用于序章）：
    //   mob 普通怪 / elite 精英（tags 含 elite）；hp：气血上限 ×hp（stats 加 { stat:"hp", type:"more", value: hp−1 }，当前气血补满；已有护盾的 hp、max 同乘）
    //   dmg：它造成的每一下伤害 ×dmg（stats 加 { stat:"dmg", type:"flat", value: dmg−1 }，core/combat.js 的"总伤害"乘区）
    //   凡人（气血 160、攻击 16 + 锈剑 4）：普通狼 70 气血，3 段一套打死；狼头目 495 气血 + 149 木盾（金符每张约 80 盾伤，2 张破盾、第 3 张是余量）
    //   实测（tools/scenarios/num_ttk.mjs，区域 tutorial）：不闪避、带 2 回春丹 / 3 金符连打 7 组，阵亡 0/3，狼头目一战掉血约 1/3
    enemyMul: { mob: { hp: 0.5, dmg: 0.8 }, elite: { hp: 0.6, dmg: 0.9 } },
    entries: [[8, 47]],
    steps,
    // 墨雾围栏：溪流以西、台地崖下；竹径坡口用围栏封住（"倒伏巨竹"）
    bounds: [[-68, 6], [-20, 4], [-10, 10], [2, 22], [16, 32], [18, 54], [-66, 52], [-72, 30]],
    extracts: [{ id: "cave", kind: "cave", name: "破洞府", pos: [-27, 6], ry: 0, channel: 5, sealed: "elite" }],
    gathers: [
      { kind: "qingling", label: "青灵草", cat: "herb", pos: [-37, 31] },
      { kind: "qingling", label: "青灵草", cat: "herb", pos: [-25, 32] },
      { kind: "ninglu", label: "凝露花", cat: "herb", pos: [-14, 15] },
    ],
    chests: [{ pos: [-64, 31], tier: "normal" }],
    // 刷怪由 steps.spawn 控制；这里列出位置供植被避让与点位检查
    spawns: [
      { pos: [-24, 48], pack: 1, mobs: ["wolf"] },
      { pos: [-40, 39], pack: 2, mobs: ["wolf"] },
      { pos: [-55, 25], pack: 3, mobs: ["wolf", "wolf", "wolf_grey"] },
      { pos: [-48, 34], pack: 2, mobs: ["wolf_grey"] },
      { pos: [-60, 13], pack: 3, mobs: ["golem", "wolf_grey", "wolf_grey"] },
      { pos: [-34, 14], pack: 1, mobs: ["wolf_elite"], elite: !0, shield: "wood" },
      { pos: [-46, 10], pack: 2, mobs: ["wolf_grey"] },
    ],
  },
};
