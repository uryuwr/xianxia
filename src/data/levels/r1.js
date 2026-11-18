// 区域一 · 青岚山外 v2（220×160 米，练气 1–4，低风险）。区域规划 v2：docs/review/level/区域规划_v2.md。
// 坐标：x 向右，z 向镜头（画面下方）；越往画面上方（-z）地势越高。
// 地形：南侧溪畔低地 L0（入口、浅区）→ 中部台地 L1（3.6 米：山神庙 / 乱石岗）→ 北侧北岭 L2（7.8 米，横贯东西的山脊）；
//       东北的台地里陷下一处狼谷（首领青牙）。狼谷只从北岭经"狼骨门"（狼谷北阶）下去；北岭只从最西边的西岭石阶上去——
//       所以从入口到青牙要走"溪畔 → 竹林 → 台地 → 西岭 → 北岭 → 狼骨门"，路上经过 4 个分区。
// hardCliffs：崖边在碰撞上是硬台阶，只有坡道 / 石阶能上下；deepWater：溪与池是深水，只能走桥 / 踏石 / 渡口。
// zones：分区（realm 推荐境界层数、baseLevel 敌人基准等级、danger 风险 1–5），敌人模块 levelFor 读它。
// 每局随机：入口、残阵、宝箱、采集点、灵光点、精英、异种、亭子、刷怪顺序都从候选点按种子抽取（见 src/world/level.js）。
export default {
  id: "r1",
  name: "青岚山外",
  size: [220, 160],
  realm: "练气 1–4",
  risk: "low",
  detail: 0.32,
  palette: { top: 0xd4d0bc, face: 0x6e675c, moss: 0x9cbb86 },
  boundary: [[-104, -74], [-60, -77], [0, -75], [60, -77], [100, -72], [106, -30], [106, 20], [103, 60], [88, 75], [40, 77], [-20, 77], [-70, 77], [-100, 72], [-106, 30], [-106, -20]],
  hardCliffs: !0,
  deepWater: !0,
  terraces: [
    {
      name: "台地",
      h: 3.6,
      poly: [[-130, -2], [-90, -2], [-62, 4], [-48, 0], [-34, -3], [-20, 4], [-6, 2], [8, 8], [22, 5], [38, 9], [54, 4], [66, 8], [90, 6], [130, 10], [130, -100], [-130, -100]],
    },
    // 北岭：原松岭与北脊连成一道横贯东西的山脊（只从西岭石阶上来，东头经狼骨门下狼谷）
    {
      name: "北岭",
      h: 7.8,
      poly: [[-130, -24], [-66, -28], [-54, -36], [-46, -48], [-20, -50], [0, -44], [0, -40], [14, -36], [26, -42], [40, -44], [58, -40], [70, -34], [90, -30], [130, -28], [130, -100], [-130, -100]],
    },
  ],
  pits: [{ name: "狼谷", h: 0.6, poly: [[30, -8], [46, -6], [62, -12], [68, -24], [64, -34], [50, -37], [36, -32], [28, -20]] }],
  hills: [
    { x: 40, z: 34, r: 11, h: 1.3 },
    { x: -30, z: 42, r: 9, h: 0.9 },
    { x: -36, z: -18, r: 9, h: 0.8 },
    { x: -62, z: -46, r: 10, h: 1.4 },
    { x: 38, z: -52, r: 10, h: 1.2 },
    { x: -90, z: 52, r: 12, h: 1.2 },
    { x: -56, z: 66, r: 10, h: 0.8 },
    { x: 30, z: 64, r: 12, h: 1 },
    { x: 80, z: 44, r: 12, h: 1.4 },
    { x: -92, z: -12, r: 8, h: 0.8 },
  ],
  crags: [
    { x: -10, z: -28, rx: 5, rz: 4, h: 9 },
    { x: 72, z: -46, rx: 6, rz: 5, h: 8 },
    { x: -70, z: 2, rx: 4, rz: 3.5, h: 6 },
    // 乱石岗（东台地）：一簇低矮乱石，石傀、蛛妖、鸦妖的栖息地
    { x: 84, z: -12, rx: 3, rz: 2.5, h: 5 },
    { x: 96, z: -4, rx: 2.5, rz: 2, h: 4.5 },
    { x: 78, z: -22, rx: 2.2, rz: 2, h: 4.5 },
    { x: 98, z: -18, rx: 3, rz: 2.5, h: 5 },
    // 狼谷北阶两侧的崖石：石阶穿过谷北那条台地窄带，两侧用崖石夹住——狼谷只能从北岭下来，不能从台地横插进石阶
    { x: 52.8, z: -38.5, rx: 2.7, rz: 2.4, h: 6 },
    { x: 60.8, z: -37.5, rx: 2.7, rz: 2.4, h: 6 },
    // 西岸孤石（溪畔西）：鸦妖落脚处、远处的锚
    { x: -98, z: 46, rx: 3, rz: 3, h: 6 },
  ],
  ramps: [
    { name: "竹径坡", a: [-56, 13], b: [-56, -7], width: 4.5 },
    { name: "溪畔石阶", a: [14, 19], b: [16, -2], width: 3, steps: !0 },
    { name: "东坡", a: [86, 16], b: [86, -2], width: 5 },
    // 上北岭的唯一石阶（最西边）
    { name: "西岭石阶", a: [-96, -14], b: [-96, -36], width: 3, steps: !0 },
    // 北岭 → 狼谷（狼骨门）：进狼谷的唯一路
    { name: "狼谷北阶", a: [56, -29], b: [58, -49], width: 3, steps: !0 },
  ],
  rivers: [
    {
      name: "青岚溪",
      width: 3.6,
      depth: 1.1,
      bank: 0.8,
      fords: [{ at: [-2.4, 12], r: 3, name: "溪畔渡口" }, { at: [-13.1, 70], r: 3, name: "溪口渡" }],
      path: [[12, -70], [14, -52], [12, -40], [8, -30], [4, -18], [2, -6], [0, 6], [-4, 16], [-8, 28], [-6, 38], [-10, 48], [-12, 64], [-15, 80], [-17, 96]],
    },
  ],
  lakes: [{ name: "灵蚌池", x: -16, z: 24, rx: 6.5, rz: 4.5, level: -0.25, depth: 1.5 }],
  bridges: [
    { name: "溪畔石桥", a: [-14, 42.5], b: [-1, 40.5], width: 2.6, arch: 0.8, style: "stone" },
    { name: "台地木桥", a: [-3, -12], b: [9, -12.5], width: 2.2, arch: 0.3, style: "wood" },
    { name: "瀑下踏石", a: [4.2, -31.6], b: [11.8, -28.4], width: 1.6, style: "stones" },
    { name: "北脊木桥", a: [8.5, -51.2], b: [19.5, -50.4], width: 2.2, arch: 0.4, style: "wood" },
  ],
  paths: [
    [[-1, 40.5], [10, 38], [24, 44], [34, 50]],
    [[10, 38], [14, 28], [14, 19]],
    [[16, -2], [18, -10], [20, -18]],
    [[-14, 42.5], [-28, 38], [-44, 26], [-56, 13]],
    [[-56, -7], [-48, -14], [-36, -18], [-20, -14], [-3, -12]],
    [[9, -12.5], [18, -10]],
    [[-96, 66], [-80, 56], [-60, 44], [-44, 26]],
    [[-66, 72], [-50, 60], [-28, 50], [-14, 42.5]],
    [[-56, -7], [-76, -10], [-96, -14]],
    [[-96, -36], [-80, -46], [-60, -54], [-30, -58], [0, -56], [8.5, -51.2]],
    [[19.5, -50.4], [36, -52], [58, -49]],
    [[34, 50], [60, 40], [86, 16]],
    [[86, -2], [80, -10], [60, -2], [40, 0]],
  ],
  veg: {
    bamboo: [
      { name: "竹径", poly: [[-76, 8], [-40, 6], [-34, 22], [-44, 38], [-72, 38]], density: 4.2 },
      { name: "台地竹林", circle: [-62, -14, 9], density: 2.6 },
      { name: "西岸竹丛", circle: [-96, 28, 8], density: 2.8 },
      { circle: [30, 26, 6], density: 2.2 },
      { circle: [-4, -40, 7], density: 2 },
      { circle: [66, -2, 6], density: 2.4 },
      { circle: [70, 64, 6], density: 2.2 },
    ],
    pines: [
      [-66, -36, 7, [0.2, 0.05]],
      [-58, -50, 7.5, [-0.1, 0.1]],
      [-74, -44, 6, [0.25, 0.1]],
      [-52, -30, 5.5, [0.3, 0.2]],
      [-40, -50, 6.5, [-0.2, 0.15]],
      [-76, -22, 5, [0.5, 0.2]],
      [30, -50, 7, [0.1, 0.1]],
      [46, -48, 6, [-0.2, 0.2]],
      [8, -46, 6.5, [0.2, 0.1]],
      [64, -40, 5.5, [0.35, 0.3]],
      [-24, -8, 6, [0.15, 0.1]],
      [40, 10, 5.5, [0.4, 0.3]],
      [58, 46, 5, [0.3, 0.25]],
      [-60, 48, 5, [-0.3, 0.3]],
      [-100, -52, 6.5, [0.2, 0.1]],
      [-20, -64, 7, [-0.2, 0.2]],
      [90, -54, 6, [0.25, 0.15]],
      [88, 62, 6, [0.2, 0.25]],
      [-84, 70, 5.5, [-0.25, 0.3]],
    ],
    trees: { n: 70, avoid: 3 },
    grass: 9000,
    rocks: { big: 52, small: 250 },
    clearings: [
      [-48, -8, 7], [-20, -38, 7], [36, -30, 8], [50, -22, 13], [44, -48, 7], [-56, -32, 6], [-58, -2, 6],
      [-64, 22, 6], [-70, 30, 4], [-96, 28, 3], [-60, -58, 6], [10, -60, 6], [80, -46, 6], [57, -50, 6], [-30, -62, 5],
    ],
  },
  props: [
    { type: "temple", pos: [-36, -19], ry: 0.25, name: "山神庙" },
    { type: "lantern", pos: [-7.5, 10.5] },
    { type: "lantern", pos: [2.8, 13.5] },
    { type: "lantern", pos: [-17.5, 68.5] },
    { type: "lantern", pos: [-9, 71.5] },
    { type: "lantern", pos: [-32, -12] },
    { type: "lantern", pos: [-40, -12] },
    { type: "stele", pos: [-50, -12], ry: 0.4 },
    { type: "lantern", pos: [10, 22] },
    { type: "lantern", pos: [19, 22] },
    { type: "stele", pos: [26, -26], ry: -0.3 },
    { type: "bones", pos: [62, -27] },
    { type: "bones", pos: [44, -30] },
    { type: "lantern", pos: [-26, 48] },
    { type: "lantern", pos: [40, -55] },
    { type: "bones", pos: [30, -14] },
    { type: "bones", pos: [24, -18] },
    // 青牙谷的卧石已换成 points.boss.pillars（狼牙石柱，level.js 构建）；谷边几块狼岩（离谷心 ≥ 12 米，不挡冲扑路线）
    { type: "wolf_rock", pos: [32, -25], r: 1.3 },
    { type: "wolf_rock", pos: [66, -27], r: 1.1 },
    { type: "wolf_rock", pos: [42, -31.5], r: 1.0 },
    // 狼骨门（北岭 → 狼谷北阶顶）：两堆狼骨夹着一块界碑，走近提示"此去：狼王青牙"
    { type: "bones", pos: [54.5, -51.5] },
    { type: "bones", pos: [61.5, -51] },
    { type: "stele", pos: [52.5, -49.5], ry: 0.5, name: "狼骨门界碑" },
    // 西岭石阶口的界碑：上去就是北岭（练气四层）
    { type: "stele", pos: [-100, -12], ry: -0.2, name: "西岭界碑" },
  ],
  // ---- 区域规划 v2：分区（由浅到深）----
  // realm 推荐境界层数 [最低, 最高]；baseLevel 敌人基准等级（数值策划定）；danger 风险 1–5（= 旧 risk）
  zones: [
    { id: "xipan", name: "溪畔", realm: [1, 2], baseLevel: 1, danger: 1, risk: 1, poly: [[-110, 40], [-40, 40], [-30, 32], [-10, 32], [-4, 50], [-12, 80], [-110, 80]] },
    {
      id: "zhulin", name: "竹林 · 狼踪", realm: [2, 3], baseLevel: 2, danger: 2, risk: 2,
      poly: [[-110, -2], [-90, -2], [-62, 4], [-48, 0], [-34, -3], [-20, 4], [-6, 2], [-2, 8], [-8, 30], [-10, 32], [-30, 32], [-40, 40], [-110, 40]],
    },
    {
      id: "donglu", name: "东麓", realm: [2, 3], baseLevel: 2, danger: 2, risk: 2,
      poly: [[-2, 8], [8, 8], [22, 5], [38, 9], [54, 4], [66, 8], [90, 6], [110, 10], [110, 80], [-12, 80], [-4, 50], [-10, 32], [-8, 30]],
    },
    {
      id: "miao", name: "山神庙", realm: [3, 4], baseLevel: 3, danger: 3, risk: 3,
      poly: [[-110, -2], [-90, -2], [-62, 4], [-48, 0], [-34, -3], [-20, 4], [-6, 2], [8, 8], [22, 5], [28, 4], [28, -40], [14, -36], [0, -40], [0, -44], [-20, -50], [-46, -48], [-54, -36], [-66, -28], [-110, -24]],
    },
    {
      id: "luanshi", name: "乱石岗", realm: [3, 4], baseLevel: 3, danger: 3, risk: 3,
      poly: [[28, 4], [38, 9], [54, 4], [66, 8], [90, 6], [110, 10], [110, -28], [90, -30], [70, -34], [58, -40], [40, -44], [28, -40]],
    },
    {
      id: "beiling", name: "北岭", realm: [4, 4], baseLevel: 4, danger: 4, risk: 4,
      poly: [[-110, -24], [-66, -28], [-54, -36], [-46, -48], [-20, -50], [0, -44], [0, -40], [14, -36], [26, -42], [40, -44], [58, -40], [70, -34], [90, -30], [110, -28], [110, -80], [-110, -80]],
    },
    { id: "langgu", name: "青牙狼谷", realm: [4, 4], baseLevel: 4, danger: 5, risk: 5, boss: !0, poly: [[30, -8], [46, -6], [62, -12], [68, -24], [64, -34], [50, -37], [36, -32], [28, -20]] },
  ],
  // 建议流程开局刷的组数（地图扩大后 5 组不够铺满各分区）；level.points.spawnPacks
  spawnPlan: { packs: 9 },
  points: {
    // 入口只在最浅的溪畔（西南），离溪畔石桥古阵 ≤ 30 秒
    entries: [[-96, 66], [-66, 72], [-36, 70]],
    gates: [{ id: "r1_gate_bridge", name: "溪畔石桥·古传送阵", pos: [-22, 45] }, { id: "r1_gate_north", name: "狼谷北·古传送阵", pos: [36, -52] }],
    ruins: { pick: 1, fake: 0, from: [[-58, -2], [6, -24], [-30, -44], [72, -10], [-68, -52], [50, 14], [-96, 10], [92, 40]] },
    chests: {
      pick: 8,
      glow: 2,
      glowFrom: [[60, -20], [30, -58], [-66, -40], [56, -56], [92, -14], [-80, -58]],
      from: [
        [-80, 62], [-50, 52], [-28, 64], [-40, 30], [-46, 8], [-92, 20], [-70, 30], [8, 46], [52, 42], [30, 30], [70, 62], [96, 30],
        [-30, -30], [-12, -44], [6, -22], [-56, -22], [-90, -8], [66, 2], [40, -2], [100, -6],
      ],
    },
    gathers: [
      {
        kind: "qingling", label: "青灵草", cat: "herb", pick: 6,
        from: [[-30, 30], [-52, 38], [20, 30], [44, 44], [-20, -6], [-44, -30], [10, -30], [60, 10], [-66, 16], [20, -14], [-84, 40], [-60, 58], [70, 52], [-100, -6]],
      },
      { kind: "ninglu", label: "凝露花", cat: "herb", pick: 4, from: [[-20, 28], [2, 22], [-3, -2], [7, -34], [-14, 52], [-10, 18], [8, -48], [-2, 34], [-20, 62], [-22, 72]] },
      { kind: "tiejing", label: "铁精石", cat: "ore", pick: 3, from: [[-15, -24], [63, -29], [-44, 3], [36, 11], [-66, -24], [66, -44], [30, -36], [88, -8], [-98, 40]] },
      { kind: "lingtu", label: "灵土", cat: "ore", pick: 2, from: [[-24, -14], [40, 6], [-60, 20], [16, -30], [-46, -36], [-84, 58]] },
    ],
    // 灵光点：每种 2 个候选、每局抽 2 个；都在风险 ≥ 3 的分区，或有精英守着
    glows: {
      pick: 2,
      from: [
        { kind: "wolfking_bone", label: "狼王遗骨", pos: [36, -30], guard: "elite" },
        { kind: "wolfking_bone", label: "狼王遗骨", pos: [-10, -60], guard: "elite" },
        { kind: "lingbang", label: "灵蚌", pos: [-17, 30], guard: "elite" },
        { kind: "lingbang", label: "灵蚌", pos: [4, -36] },
        { kind: "furnace_part", label: "炼器鼎残件", pos: [-46, -26], guard: "elite" },
        { kind: "furnace_part", label: "炼器鼎残件", pos: [-26, -32], guard: "elite" },
      ],
    },
    // 精英：每局 3 只；level.js 抽取时保证相距 ≥ 25 米、离青牙 ≥ 30 米；溪畔（练气一至二层）不放精英
    elites: {
      pick: 3,
      minGap: 25,
      bossClear: 30,
      from: [[-80, 20], [60, 48], [-48, -8], [-20, -38], [88, -10], [-60, -58], [10, -60], [80, -46], [30, 30]],
    },
    dens: [{ id: "r1_cellar", name: "山神庙地窖", pos: [-29, -24], ry: 0.25 }],
    // 青牙狼谷 v2（与战斗设计 docs/design/boss_青牙_v2.md §3.1 共同约定；场景件 fang_pillar / wolf_totem / wolf_rock / mist_gate 待实现）
    boss: {
      id: "qingya", name: "青牙", pos: [50, -22], arena: 13, trigger: 10, exit: [46, -17],
      perch: [50, -25], perchR: 2.2,
      pillars: [{ id: "fang_1", pos: [50, -14], r: 1.2 }, { id: "fang_2", pos: [42.4, -19.5], r: 1.2 }, { id: "fang_3", pos: [45.3, -28.5], r: 1.2 }, { id: "fang_4", pos: [54.7, -28.5], r: 1.2 }, { id: "fang_5", pos: [57.6, -19.5], r: 1.2 }],
      totems: [{ id: "totem_w", pos: [40.5, -14.5], den: [37, -11] }, { id: "totem_e", pos: [60.5, -17], den: [63, -15] }, { id: "totem_n", pos: [60, -31], den: [63, -34] }],
      gates: [{ id: "mist_n", pos: [57.2, -36.5], ry: Math.atan2(2, -20), w: 3 }], // 北阶宽 3 米（美术管线反馈：w 4 时右石桩埋进崖壁）
      moonPaths: [[[40, -22], [43, -14], [50, -10], [57, -13]], [[60, -22], [57, -30], [50, -33], [43, -30]]],
      // 御剑围栏：开战后落点必须在这个多边形里（= 狼谷 pit）
      fence: [[30, -8], [46, -6], [62, -12], [68, -24], [64, -34], [50, -37], [36, -32], [28, -20]],
      adds: [[37, -11], [63, -15], [63, -34]],
    },
    // 首领门提示（boss_青牙_v2 §2.2）：{realm} 由流程用 enemies.realmLabel(boss) 替换（看不清时"练气?"，练气五层起或首杀后"练气七层"）；sub 是第二行小字
    bossGate: { pos: [57, -50], r: 8, zone: "beiling", boss: "qingya", text: "此去：狼王青牙 · {realm} · 宜练气六层以上", sub: "谷中可读条穿雾而退" },
    // 异种（每局 0–1 只，敌人模块按 sign 选种类：scorch → 赤狼）；只放在中区、深区；地上会有焦土 / 白霜等暗示
    rares: {
      pick: [0, 1],
      chance: 0.35,
      from: [
        { pos: [84, -16], sign: "scorch", note: "乱石岗焦土" },
        { pos: [-30, -62], sign: "frost", note: "北岭白霜" },
        { pos: [-86, 12], sign: "scorch", note: "竹林火烧迹" },
        { pos: [70, 58], sign: "bones", note: "东麓狼骨堆" },
      ],
    },
    // 刷怪点（区域规划 v2）：zone、habitat（nest 巢 / burrow 洞 / grass 草 / water 水边 / ruin 废墟 / rock 乱石）、tier（low / mid / high）
    //   没写 mobs 的由敌人模块按 habitat + tier 选（低阶：rat 山鼠妖 burrow/grass、crow 鸦妖 nest/rock/ruin、spider 蛛妖 ruin/rock）
    spawns: [
      // 溪畔（练气一至二层）：以低阶为主
      { pos: [-88, 54], pack: 4, zone: "xipan", habitat: "burrow", tier: "low", mobs: ["rat"] },
      { pos: [-60, 62], pack: 4, zone: "xipan", habitat: "grass", tier: "low", mobs: ["rat"] },
      { pos: [-24, 58], pack: 3, zone: "xipan", habitat: "grass", tier: "low" },
      { pos: [-46, 48], pack: 2, zone: "xipan", habitat: "grass", tier: "mid", mobs: ["wolf"] },
      // 竹林 · 狼踪（二至三层）
      { pos: [-90, 26], pack: 3, zone: "zhulin", habitat: "burrow", tier: "low", mobs: ["rat"] },
      { pos: [-64, 22], pack: 3, zone: "zhulin", habitat: "nest", tier: "mid", mobs: ["wolf", "wolf_grey"] },
      { pos: [-72, 8], pack: 3, zone: "zhulin", habitat: "rock", tier: "low", mobs: ["crow"] },
      { pos: [-40, 16], pack: 3, zone: "zhulin", habitat: "grass", tier: "mid" },
      { pos: [-98, 6], pack: 3, zone: "zhulin", habitat: "grass", tier: "mid", mobs: ["wolf_grey", "wolf"] },
      // 东麓（二至三层，过溪）
      { pos: [8, 40], pack: 3, zone: "donglu", habitat: "grass", tier: "low", mobs: ["rat"] },
      { pos: [30, 60], pack: 3, zone: "donglu", habitat: "burrow", tier: "low" },
      { pos: [52, 30], pack: 3, zone: "donglu", habitat: "grass", tier: "mid", mobs: ["wolf"] },
      { pos: [80, 52], pack: 3, zone: "donglu", habitat: "nest", tier: "low", mobs: ["crow"] },
      { pos: [96, 22], pack: 3, zone: "donglu", habitat: "grass", tier: "mid", mobs: ["wolf", "wolf_grey"] },
      // 山神庙（三至四层）
      { pos: [-36, -10], pack: 4, zone: "miao", habitat: "ruin", tier: "mid", mobs: ["golem", "wolf_grey"] },
      { pos: [-70, -14], pack: 3, zone: "miao", habitat: "nest", tier: "mid", mobs: ["wolf_grey"] },
      { pos: [-16, -36], pack: 4, zone: "miao", habitat: "rock", tier: "low", mobs: ["spider"] },
      { pos: [8, -22], pack: 3, zone: "miao", habitat: "grass", tier: "mid", mobs: ["wolf"] },
      { pos: [-88, -18], pack: 3, zone: "miao", habitat: "rock", tier: "low", mobs: ["spider"] },
      // 乱石岗（三至四层）
      { pos: [84, -8], pack: 4, zone: "luanshi", habitat: "rock", tier: "mid", mobs: ["golem", "wolf_grey"] },
      { pos: [100, -24], pack: 3, zone: "luanshi", habitat: "rock", tier: "low", mobs: ["spider"] },
      { pos: [30, 2], pack: 3, zone: "luanshi", habitat: "grass", tier: "mid", mobs: ["wolf"] },
      // 北岭（四层）
      { pos: [-80, -50], pack: 4, zone: "beiling", habitat: "rock", tier: "high", mobs: ["wolf_grey", "golem"] },
      { pos: [-40, -62], pack: 4, zone: "beiling", habitat: "nest", tier: "high", mobs: ["wolf", "wolf_grey"] },
      { pos: [0, -58], pack: 3, zone: "beiling", habitat: "rock", tier: "high", mobs: ["wolf_grey"] },
      { pos: [30, -62], pack: 4, zone: "beiling", habitat: "rock", tier: "high", mobs: ["golem", "wolf_grey"] },
      { pos: [84, -50], pack: 4, zone: "beiling", habitat: "nest", tier: "high", mobs: ["wolf_grey", "wolf"] },
      // 青牙狼谷不放刷怪点：首领场 30 米内不刷怪（狼由狼窝 adds 召出；玩家可以趁青牙沉睡先砍狼骨图腾）
    ],
    encounters: [
      { id: "e_temple_path", pos: [-44, -6], types: ["bailu", "fox"] },
      { id: "e_falls", pos: [-2, -30], types: ["remains", "fox"] },
      { id: "e_songling", pos: [-72, -48], types: ["remains"] },
      { id: "e_east_grove", pos: [34, 22], types: ["fox", "rain"] },
      { id: "e_pool_meadow", pos: [-32, 30], types: ["rain", "bailu"] },
      { id: "e_ridge", pos: [46, -58], types: ["bailu", "remains"] },
      { id: "e_east_rim", pos: [74, -14], types: ["fox", "rain"] },
      { id: "e_west_reed", pos: [-92, 40], types: ["fox", "rain"] },
      { id: "e_donglu_s", pos: [64, 66], types: ["bailu", "rain"] },
    ],
    // 亭子容器（搜取模块读 points.pavilions）：候选全部建亭，每局启用 2–4 个
    pavilions: {
      pick: [2, 4],
      from: [
        { id: "p_donglu", name: "东麓凉亭", pos: [36, 32], ry: 0.2 },
        { id: "p_xipan", name: "溪畔望亭", pos: [-34, 48], ry: -0.15 },
        { id: "p_zhujing", name: "竹径亭", pos: [-72, -8], ry: 0.4 },
        { id: "p_songling", name: "松岭亭", pos: [-68, -40], ry: 0.1 },
        { id: "p_pubu", name: "瀑上亭", pos: [4, -48], ry: -0.3 },
        { id: "p_xikou", name: "溪口亭", pos: [-78, 64], ry: 0.25 },
        { id: "p_dongnan", name: "东麓南亭", pos: [96, 44], ry: -0.3 },
      ],
    },
    // 功法残碑（功法体系 v2）：每局启用 1–2 块，必出 1 页本区域功法残页（SOURCES.stele）；都在风险 ≥ 2、离入口 ≥ 15 秒的分区
    steles: {
      pick: [1, 2],
      from: [
        { id: "s_miao", name: "山神庙残碑", pos: [-24, -26], ry: 0.4, zone: "miao" },
        { id: "s_luanshi", name: "乱石岗石刻", pos: [66, -2], ry: -0.3, zone: "luanshi" },
        { id: "s_beiling", name: "北岭断碑", pos: [-56, -60], ry: 0.2, zone: "beiling" },
        { id: "s_donglu", name: "东麓石刻", pos: [72, 44], ry: 0.6, zone: "donglu" },
      ],
    },
    relics: [{ pos: [-70, -34], place: "西岭断碑" }, { pos: [-24, -46], place: "瀑下石龛" }, { pos: [66, -44], place: "狼谷北崖" }, { pos: [-8, -16], place: "台地木桥下" }],
  },
  tutorialLayout: {
    entries: [[8, 47]],
    steps: [
      { id: "wake", pos: [8, 47], note: "溪边醒来：移动" },
      { id: "sword", pos: [3, 43], note: "锈剑：拾取" },
      { id: "bridge", pos: [-8, 41.5], note: "过石桥" },
      { id: "wolves", pos: [-30, 30], note: "两只落单狼妖：普攻 / 闪身" },
      { id: "wolf_last", pos: [-36, 16], note: "最后一只：读条前清场" },
      { id: "cave", pos: [-27, 6], note: "破洞府：撤离" },
    ],
    bounds: [[-46, 0], [-12, 0], [16, 30], [18, 54], [-46, 54]],
    extracts: [{ id: "cave", kind: "cave", name: "破洞府", pos: [-27, 6], ry: 0 }],
    gathers: [{ kind: "qingling", label: "青灵草", cat: "herb", pos: [-22, 34] }],
    chests: [],
    spawns: [{ pos: [-30, 30], pack: 2, mobs: ["wolf"] }, { pos: [-36, 16], pack: 1, mobs: ["wolf"] }],
  },
  views: {
    overview: { target: [0, 0, 0], dist: 270, pitch: 55, yaw: 0 },
    river_s: { target: [-5, 0, 26], dist: 95, pitch: 82, yaw: 0 },
    river_n: { target: [10, 4, -38], dist: 95, pitch: 82, yaw: 0 },
    gate_bridge: { target: [-14, 0, 42], dist: 30, pitch: 42, yaw: 0.2 },
    falls: { target: [6, 3, 4], dist: 30, pitch: 36, yaw: 0.35 },
    temple: { target: [-34, 4, -18], dist: 28, pitch: 42, yaw: -0.2 },
    valley: { target: [50, 1, -22], dist: 44, pitch: 50, yaw: 0 },
    valley_top: { target: [50, 1, -23], dist: 58, pitch: 68, yaw: 0.15 },
    wolf_gate: { target: [57, 8, -48], dist: 30, pitch: 45, yaw: 0.3 },
    bamboo: { target: [-54, 1, 26], dist: 26, pitch: 40, yaw: -0.3 },
    cave: { target: [-27, 1, 5], dist: 22, pitch: 36, yaw: 0.1 },
  },
  landmarks: [
    { id: "temple", name: "山神庙飞檐", pos: [-36, -19], note: "红漆飞檐 + 两盏石灯，台地西侧的锚" },
    { id: "falls", name: "青岚瀑", pos: [11, -37], note: "北岭落到台地的白练，溪流的源头" },
    { id: "bridge", name: "溪畔石桥", pos: [-8, 41.5], note: "拱桥 + 石灯：第一处撤离点" },
    { id: "pavilion", name: "东麓凉亭", pos: [36, 32], note: "东半边的锚" },
    { id: "wolf_gate", name: "狼骨门", pos: [57, -50], note: "北岭东头两堆狼骨 + 界碑：此去青牙" },
    { id: "luanshi", name: "乱石岗", pos: [88, -12], note: "东台地上的一簇乱石，俯瞰狼谷" },
    { id: "west_stair", name: "西岭石阶", pos: [-96, -25], note: "上北岭的唯一石阶" },
    { id: "ford", name: "溪口渡", pos: [-13, 70], note: "两盏石灯夹着的浅滩" },
  ],
  night: [{ pos: [-104, 40] }, { pos: [-60, 76] }, { pos: [40, 76] }, { pos: [104, 30] }, { pos: [104, -20] }, { pos: [60, -74] }, { pos: [-40, -74] }, { pos: [-104, -50] }],
  patrols: [
    { id: "p_east", name: "乱石岗巡游", path: [[40, 0], [66, 0], [90, -2], [92, -22]], loop: !1 },
    { id: "p_temple", name: "庙前巡游", path: [[-56, -4], [-40, -10], [-24, -14], [-18, -30], [-40, -30]], loop: !0 },
    { id: "p_ridge", name: "北岭巡游", path: [[-60, -56], [-20, -58], [10, -56], [40, -58]], loop: !1 },
    { id: "p_west", name: "竹林巡游", path: [[-96, 20], [-70, 26], [-50, 30], [-70, 12]], loop: !0 },
  ],
};
