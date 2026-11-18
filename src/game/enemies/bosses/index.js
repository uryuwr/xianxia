// 首领控制器注册：运行时挂到 ENEMY_TYPES[id].controller（不写进数据表，免得 Node 下 import 数据表时拖进 three / 游戏代码）。
// 由 src/game/enemies/index.js 顶部 import 一次。
import { ENEMY_TYPES } from "../../../data/enemies.js";
import { qingyaController } from "./qingya.js";
import { packWolfController } from "./qingya_pack.js";
import { QINGYA } from "../../../data/bosses/qingya.js";

if (ENEMY_TYPES.qingya) ENEMY_TYPES.qingya.controller = qingyaController;

// 狼谷群狼：外形与招式复用竹林狼；数值 / 等级见 src/data/bosses/qingya.js QINGYA.pack
if (ENEMY_TYPES.wolf && !ENEMY_TYPES.qingya_wolf)
  ENEMY_TYPES.qingya_wolf = {
    ...ENEMY_TYPES.wolf,
    name: "狼谷群狼",
    level: 4,
    stats: { ...QINGYA.pack.stats },
    orbit: [3.0, 4.2],
    aggroRange: 30,
    tags: ["beast", "wood", "summon"],
    insight: 0,
    lootSource: "none",
    controller: packWolfController,
  };
