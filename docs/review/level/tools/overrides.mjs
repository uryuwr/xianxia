// 关卡评审定稿 = 关卡开发的 src/data/levels/<id>.js + 下面这些改动（"以数据表达的 diff"）。
// tools/make_proposed.mjs 读最新的关卡数据、套用这里的改动，生成 proposed/<id>.js（可直接替换 src/data/levels/<id>.js）。
// 关卡开发改了地形以后重跑一次即可；点位是否仍然可站 / 可达由 tools/analyze.py 校验。
// 理由与编号见 docs/review/level/关卡评审与方案_v1.md。
const byName = (list, name) => list.find((x) => x.name === name);

export const OVERRIDES = {
  r1(d) {
    d.hardCliffs = !0; // P0-1：崖边取硬台阶（heightfield 补丁 proposed/heightfield_hardCliffs.diff）
    // P2：西入口接竹径、北脊石阶顶接狼谷北古阵
    d.paths.push([[-60, 44], [-52, 30], [-44, 26]], [[22, -47], [30, -52], [36, -52]]);
    // P1-1：竹径南缘收到 z 38，给西入口留空地
    const zj = byName(d.veg.bamboo, "竹径");
    if (zj) zj.poly = [[-76, 8], [-40, 6], [-34, 22], [-44, 38], [-72, 38]];
    // P2：战斗空地（植被让开的圆 [x, z, r]）
    d.veg.clearings = [[-48, -8, 7], [-20, -38, 7], [36, -30, 8], [50, -22, 13], [44, -48, 7], [-56, -32, 6], [-58, -2, 6]];
    // 地标 / 危险预告 / Boss 场卧石（boulder 为新 prop：碰撞半径 r）
    d.props.push(
      { type: "lantern", pos: [-26, 48] },
      { type: "lantern", pos: [40, -55] },
      { type: "bones", pos: [30, -14] },
      { type: "bones", pos: [24, -18] },
      { type: "boulder", pos: [44, -16], r: 1.4 },
      { type: "boulder", pos: [57, -18], r: 1.4 },
      { type: "boulder", pos: [56, -28], r: 1.4 },
      { type: "boulder", pos: [43, -27], r: 1.4 },
      { type: "boulder", pos: [50, -14], r: 1.1 },
    );
    d.zones = [
      { id: "xipan", name: "溪畔", risk: 1, poly: [[-80, 6], [-48, 4], [-20, 7], [8, 11], [38, 12], [80, 10], [80, 60], [-80, 60]] },
      { id: "zhujing", name: "竹径台地", risk: 2, poly: [[-80, 6], [-48, 4], [-20, 7], [-20, -8], [-50, -6], [-80, -12]] },
      { id: "dongpo", name: "东坡台地", risk: 2, poly: [[8, 11], [38, 12], [80, 10], [80, -30], [70, -30], [66, -8], [46, -4], [28, -10], [8, -6]] },
      { id: "miao", name: "山神庙", risk: 3, poly: [[-80, -12], [-50, -6], [-20, -8], [-20, -36], [-46, -40], [-56, -34], [-80, -26]] },
      { id: "pubu", name: "台地北 · 瀑下", risk: 3, poly: [[-20, -8], [8, -6], [28, -10], [26, -40], [0, -40], [-20, -36]] },
      { id: "songling", name: "松岭", risk: 3, poly: [[-80, -26], [-56, -34], [-46, -40], [-44, -60], [-80, -60]] },
      { id: "beiji", name: "北脊", risk: 4, poly: [[-44, -60], [-44, -46], [0, -40], [26, -42], [50, -40], [80, -30], [80, -60]] },
      { id: "langgu", name: "狼谷", risk: 5, poly: [[30, -8], [46, -6], [62, -12], [68, -24], [64, -34], [50, -37], [36, -32], [28, -20]] },
    ];
    d.landmarks = [
      { id: "temple", name: "山神庙飞檐", pos: [-36, -19], note: "红漆飞檐 + 两盏石灯，西北方向的锚" },
      { id: "falls", name: "青岚瀑", pos: [11, -37], note: "北脊落到台地的白练，溪流的源头" },
      { id: "bridge", name: "溪畔石桥", pos: [-8, 41.5], note: "拱桥 + 石灯：第一处撤离点" },
      { id: "pavilion", name: "东麓凉亭", pos: [36, 32], note: "东半边的锚" },
      { id: "valley", name: "狼谷白骨", pos: [44, -24], note: "谷口白骨 = 危险预告；谷底是青牙" },
    ];
    d.night = [{ pos: [-74, 30] }, { pos: [0, 54] }, { pos: [72, 30] }, { pos: [74, -24] }, { pos: [20, -54] }, { pos: [-72, -40] }];
    d.patrols = [
      { id: "p_east", name: "东坡巡游", path: [[46, 2], [62, -2], [60, 14], [40, 16]], loop: !0 },
      { id: "p_temple", name: "庙前巡游", path: [[-56, -4], [-40, -10], [-24, -14], [-18, -30], [-40, -30]], loop: !0 },
      { id: "p_ridge", name: "北脊巡游", path: [[10, -48], [30, -50], [50, -46], [64, -40]], loop: !1 },
    ];
    const P = d.points;
    P.entries = [[-60, 44], [28, 51], [64, 38]]; // P1-1：全部在南缘风险 1 区
    byName(P.gates, "狼谷北·古传送阵").pos = [36, -52]; // 北脊小丘，不再贴着 Boss
    P.ruins = { pick: 1, fake: 0, from: [[-58, -2], [6, -24], [-30, -44], [72, -10], [-68, -52], [50, 14]] };
    P.chests = {
      pick: 6,
      glow: 1,
      glowFrom: [[60, -20], [30, -52], [-66, -40], [56, -52]], // P1-2：灵光宝箱只刷在风险 ≥ 3
      from: [[-40, 30], [8, 46], [52, 42], [-34, 50], [-46, 8], [30, 30], [66, 2], [40, -2], [-30, -30], [-12, -44], [6, -22], [-56, -22]],
    };
    const nl = P.gathers.find((g) => g.kind === "ninglu");
    if (nl) (nl.pick = 4), (nl.from = [[-20, 28], [2, 22], [-3, -2], [7, -34], [-14, 52], [-10, 18], [8, -48], [-2, 34]]); // P1-7
    P.glows.from = [
      { kind: "wolfking_bone", label: "狼王遗骨", pos: [36, -30], guard: "elite" }, // 挪出青牙场
      { kind: "lingbang", label: "灵蚌", pos: [-11, 23] },
      { kind: "furnace_part", label: "炼器鼎残件", pos: [-46, -26], guard: "elite" },
    ];
    P.elites = { pick: 2, from: [[28, -16], [-56, -32], [-20, -38], [44, -48], [-48, -8]] }; // 风险 1 区不放精英
    P.boss.adds = [[38, -12], [62, -16], [58, -32]];
    // P1-3：每组带 zone，组的大小随风险 3 → 5
    P.spawns = [
      { pos: [-50, 32], pack: 3, zone: "xipan", mobs: ["wolf"] },
      { pos: [24, 24], pack: 3, zone: "xipan", mobs: ["wolf"] },
      { pos: [48, 28], pack: 3, zone: "xipan", mobs: ["wolf"] },
      { pos: [-34, 10], pack: 3, zone: "xipan", mobs: ["wolf"] },
      { pos: [62, -4], pack: 3, zone: "dongpo", mobs: ["wolf", "wolf_grey"] },
      { pos: [-66, -14], pack: 3, zone: "zhujing", mobs: ["wolf", "wolf_grey"] },
      { pos: [-36, -10], pack: 4, zone: "miao", mobs: ["golem", "wolf_grey"] },
      { pos: [-16, -36], pack: 4, zone: "pubu", mobs: ["wolf", "wolf_grey"] },
      { pos: [8, -22], pack: 4, zone: "pubu", mobs: ["wolf", "wolf_grey"] },
      { pos: [-62, -44], pack: 4, zone: "songling", mobs: ["wolf_grey"] },
      { pos: [20, -54], pack: 4, zone: "beiji", mobs: ["wolf_grey"] },
      { pos: [60, -46], pack: 4, zone: "beiji", mobs: ["wolf_grey"] },
      { pos: [40, -12], pack: 5, zone: "langgu", mobs: ["wolf", "wolf_grey"] },
      { pos: [60, -30], pack: 5, zone: "langgu", mobs: ["wolf_grey"] },
    ];
    // 奇遇候选：bailu 路口 / 高处 | fox 林边离路 6–10 米 | remains 偏僻崖角 | rain 草多的开阔地
    P.encounters = [
      { id: "e_temple_path", pos: [-44, -6], types: ["bailu", "fox"] },
      { id: "e_falls", pos: [-2, -30], types: ["remains", "fox"] },
      { id: "e_songling", pos: [-72, -48], types: ["remains"] },
      { id: "e_east_grove", pos: [34, 22], types: ["fox", "rain"] },
      { id: "e_pool_meadow", pos: [-32, 30], types: ["rain", "bailu"] },
      { id: "e_ridge", pos: [46, -50], types: ["bailu", "remains"] },
      { id: "e_east_rim", pos: [70, -14], types: ["fox", "rain"] },
    ];
    P.relics = [{ pos: [-70, -34], place: "松岭断碑" }, { pos: [-24, -46], place: "瀑下石龛" }, { pos: [64, -38], place: "狼谷北崖" }, { pos: [-8, -16], place: "台地木桥下" }];
    // P0-3：教学局沿溪向西北一条线；steps 由流程按 id 读取；bounds 外墨雾 + 空气墙
    d.tutorialLayout = {
      entries: [[8, 47]],
      steps: [
        { id: "wake", pos: [8, 47], note: "溪边醒来：移动" },
        { id: "sword", pos: [3, 43], note: "锈剑：拾取" },
        { id: "bridge", pos: [-8, 41.5], note: "过石桥（古阵封着：撤离点长这样）" },
        { id: "wolves", pos: [-30, 30], note: "两只落单狼妖：普攻 / 闪身" },
        { id: "wolf_last", pos: [-36, 16], note: "最后一只：读条前清场" },
        { id: "cave", pos: [-27, 6], note: "破洞府：撤离" },
      ],
      bounds: [[-46, 0], [-12, 0], [16, 30], [18, 54], [-46, 54]],
      extracts: [{ id: "cave", kind: "cave", name: "破洞府", pos: [-27, 6], ry: 0 }],
      gathers: [{ kind: "qingling", label: "青灵草", cat: "herb", pos: [-22, 34] }],
      chests: [],
      spawns: [{ pos: [-30, 30], pack: 2, mobs: ["wolf"] }, { pos: [-36, 16], pack: 1, mobs: ["wolf"] }],
    };
  },

  r2(d) {
    d.hardCliffs = !0; // P0-1
    d.crags.push({ x: -3.5, z: -68.5, rx: 2.2, rz: 1.8, h: 5 }); // P0-2：封住瀑布缺口（北脊能走下遗府石台）
    // P1-4：潭口石梁，碧鳞场连成马蹄形
    d.bridges.push({ name: "潭口石梁", a: [-10, -33], b: [8, -35], width: 3.2, arch: 0.3, style: "stone" });
    // P1-5：断涧在 z −46…−38 收窄成 3.4 米，作第二个跳点
    const g = byName(d.gorges, "断涧");
    if (g) {
      const i = g.path.findIndex((p) => p[1] > -50);
      g.path.splice(i, 0, [55, -46, 3.4], [55, -38, 3.4]);
    }
    d.points.jumps.push({ id: "gorge_n", name: "断涧北口", from: [51.2, -42], to: [58.8, -42], need: "doubleJump" });
    d.paths.push([[-78, -6], [-60, -24], [-44, -40], [-34, -32]], [[-50, 46], [-62, 20], [-56, -4], [-60, -24]], [[-10, -33], [-14, -40]], [[8, -35], [12, -30]], [[51, -42], [40, -36], [34, -28]]);
    d.veg.clearings = [[-76, -8, 9], [-60, -24, 8], [-44, -40, 8], [-80, -40, 7], [-60, -50, 7], [-50, 0, 8], [-62, 20, 6], [-84, 10, 7], [-60, 40, 8], [-80, 60, 7], [-98, 40, 7], [-92, -52, 7], [-36, -60, 7]];
    d.props.push(
      { type: "stele", pos: [-44, -40], ry: 0.6, scale: 3.2, name: "剑碑" }, // 西半张图唯一的锚，高过竹梢
      { type: "lantern", pos: [-24, 64] },
      { type: "lantern", pos: [98, -30] },
      { type: "shrine", pos: [-17, -44], el: "water", name: "水坛" },
      { type: "shrine", pos: [18, -50], el: "metal", name: "金坛" },
      { type: "shrine", pos: [-1, -34], el: "wood", name: "木坛（石梁中段）" },
    );
    d.zones = [
      { id: "dukou", name: "溪口芦荡", risk: 2, poly: [[-30, 40], [30, 40], [30, 76], [-30, 76]] },
      { id: "zhuhai_s", name: "竹海南", risk: 2, poly: [[-110, 76], [-30, 76], [-30, 40], [-24, 20], [-110, 20]] },
      { id: "xigu", name: "溪谷中段", risk: 3, poly: [[-24, 40], [30, 40], [26, 0], [24, -26], [-24, -26], [-28, 0], [-24, 20]] },
      { id: "dongtai", name: "东台", risk: 3, poly: [[30, 40], [56, 30], [56, -24], [26, -24], [26, 0]] },
      { id: "dongtai_s", name: "东台南", risk: 2, poly: [[30, 40], [56, 30], [66, 30], [100, 34], [106, 76], [30, 76]] },
      { id: "zhuhai_n", name: "竹海深处", risk: 4, poly: [[-110, 20], [-24, 20], [-28, 0], [-24, -26], [-30, -40], [-24, -66], [-110, -66]] },
      { id: "shentan", name: "深潭瀑布", risk: 5, poly: [[-24, -26], [26, -26], [30, -40], [24, -70], [-24, -70], [-30, -40]] },
      { id: "dongtai_n", name: "东台北", risk: 4, poly: [[26, -24], [56, -24], [56, -76], [44, -76], [24, -66], [30, -40]] },
      { id: "duanjian", name: "断涧东", risk: 4, poly: [[58, 28], [106, 28], [106, -76], [58, -76]] },
    ];
    d.landmarks = [
      { id: "peak", name: "孤峰", pos: [91, -58], note: "15 米石柱，全图最高；结局御剑之处" },
      { id: "falls", name: "碧水瀑", pos: [0, -68], note: "北脊落进深潭的白练 + 水雾：Boss 与遗府" },
      { id: "stele", name: "剑碑", pos: [-44, -40], note: "竹海正中高出竹梢的石剑：西半张图唯一的锚" },
      { id: "bridge", name: "石拱桥", pos: [4, 46], note: "南岸过河处，第一处撤离点在桥西" },
      { id: "broken", name: "断桥", pos: [56, 7], note: "断涧上的残桥：告诉玩家「对岸能去，但要跳」" },
    ];
    d.night = [{ pos: [-100, 50] }, { pos: [0, 72] }, { pos: [56, 72] }, { pos: [-100, -40] }, { pos: [-40, -74] }, { pos: [40, -74] }, { pos: [102, -50] }];
    d.patrols = [
      { id: "p_bamboo", name: "竹海巡游", path: [[-76, -8], [-60, -24], [-44, -40], [-60, -50], [-80, -40]], loop: !0 },
      { id: "p_valley", name: "溪谷巡游", path: [[-14, 10], [-6, 30], [-6, 44], [14, 46], [10, 26], [16, 0]], loop: !1 },
      { id: "p_east", name: "东台巡游", path: [[34, -28], [44, -10], [44, 10], [40, 30]], loop: !1 },
    ];
    const P = d.points;
    byName(P.gates, "断涧东·古传送阵").pos = [100, -24]; // P1-5：挪上东岭（高处、最暴露）
    P.ruins.fakeFrom = [[-60, -50], [40, -44], [-6, 18], [-100, -44]]; // P1-6：假阵只从中段抽
    P.chests = {
      pick: 8,
      glow: 2,
      glowFrom: [[-40, -10], [-76, -46], [40, -60], [68, -40], [90, -60], [14, -20]],
      from: [[-90, 50], [-56, 20], [-100, -54], [-12, 60], [16, 34], [-16, 10], [42, 14], [50, 68], [100, -20], [70, 20], [-46, 64], [-90, -10], [96, 40]],
    };
    const hl = P.gathers.find((x) => x.kind === "hanlu");
    if (hl) (hl.pick = 5), hl.from.push([-18, -54]); // P1-7
    for (const gl of P.glows.from) {
      if (gl.kind === "water_jade") gl.guard = "boss_wake";
      if (gl.kind === "zhuxin") gl.guard = "elite";
      if (gl.kind === "zhenpan") gl.first = !0;
    }
    // P1-8：第三分量 { shield } 限定护盾五行；z > 20 的南半区只用土盾（第 5 局还没有寒冰锥）
    P.elites.from = P.elites.from.map(([x, z]) => [x, z, { shield: z > 20 ? ["earth"] : ["fire", "earth"] }]);
    P.boss.shrines = [[-17, -44], [18, -50], [-1, -34]];
    P.spawns = [
      { pos: [-60, 40], pack: 3, zone: "zhuhai_s", mobs: ["bat"] },
      { pos: [6, 62], pack: 3, zone: "dukou", mobs: ["bat"] },
      { pos: [44, 44], pack: 3, zone: "dongtai_s", mobs: ["bat"] },
      { pos: [84, 50], pack: 3, zone: "dongtai_s", mobs: ["bat"] },
      { pos: [-84, 10], pack: 4, zone: "zhuhai_n", mobs: ["vine", "bat", "bat"] },
      { pos: [-4, 30], pack: 4, zone: "xigu", mobs: ["vine", "bat", "bat"] },
      { pos: [16, -10], pack: 4, zone: "xigu", mobs: ["vine", "bat", "bat"] },
      { pos: [42, -6], pack: 4, zone: "dongtai", mobs: ["wolf", "wolf", "vine"] },
      { pos: [-46, -10], pack: 4, zone: "zhuhai_n", mobs: ["vine", "bat", "bat"] },
      { pos: [-70, -40], pack: 5, zone: "zhuhai_n", mobs: ["wolf", "wolf", "vine"] },
      { pos: [-98, -40], pack: 5, zone: "zhuhai_n", mobs: ["vine", "bat", "bat"] },
      { pos: [-36, -60], pack: 5, zone: "zhuhai_n", mobs: ["vine", "bat", "bat"] },
      { pos: [46, -50], pack: 5, zone: "dongtai_n", mobs: ["wolf", "wolf", "vine"] },
      { pos: [70, -20], pack: 5, zone: "duanjian", mobs: ["wolf", "wolf", "vine"] },
      { pos: [92, -20], pack: 5, zone: "duanjian", mobs: ["wolf", "wolf", "vine"] },
      { pos: [-12, -40], pack: 4, zone: "shentan", mobs: ["bat"] },
    ];
    P.encounters = [
      { id: "e_bamboo_w", pos: [-60, -24], types: ["fox", "rain"] },
      { id: "e_upper", pos: [-96, -30], types: ["remains"] },
      { id: "e_pool", pos: [-56, 6], types: ["rain", "bailu"] },
      { id: "e_valley", pos: [-14, 0], types: ["bailu", "fox"] },
      { id: "e_pavilion", pos: [40, 22], types: ["bailu", "rain"] },
      { id: "e_gorge_e", pos: [96, -8], types: ["remains", "fox"] },
      { id: "e_bank", pos: [-16, 34], types: ["fox"] },
      { id: "e_east_n", pos: [36, -60], types: ["remains", "bailu"] },
    ];
    P.relics = [{ pos: [-92, -60], place: "竹海上台石龛" }, { pos: [-30, -56], place: "剑碑北" }, { pos: [62, -66], place: "断涧北口" }, { pos: [102, 4], place: "东岭断崖" }];
  },
};
