// 首领界面文案（首领条、横幅、读条、处决提示、朱印、战报共用；不含任何依赖，洞府天机镜也能轻量引用）
// 首领文案（以后碧鳞按同一结构加）。战斗中不写"第几阶段"（用户 2026-11-17：阶段靠首领外观 / 护盾 / 环境变化让玩家自己判断）
export const BOSS_TEXT = {
  qingya: {
    name: "青牙", title: "狼谷之主", seal: "青牙伏诛",
    chan: { summon_howl: { g: "嚎", n: "召狼长嚎 · 可打断" }, moon_howl: { g: "啸", n: "啸月 · 可打断" } },
    why: { break: "威折 · 背甲可斩", final: "气竭 · 终结" },
    hint: { poise: "折其威，可斩" }, // 首次挑战入场题签下的一句（控制器 boss:introStart.hint，只出一次）
    near: "近前按 F", // 处决提示下面一行
    // 首次挑战时入场题签多一行（boss:introStart.hint 优先）
    hint: { poise: "折其威，可斩" },
    // 狼威大额来源（boss:poiseGain.kind，n ≥ 8）条尾浮的小字；普攻 / 法术 / 小额不出字
    gain: { interrupt: "断", crash: "撞", perfect: "闪", read: "闪", totem: "腾", freeze: "冻", root: "缠", shieldBreak: "破", charge: "斩", reaction: "生" },
  },
};
