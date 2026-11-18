// 剪辑表（分镜、字幕、字卡、音效、配乐段落）。时间都相对片段里的标记（录制时 R.mark 记下的秒数），重录后自动对齐。
//   seg:   { key, clip, at: 标记名或 0, from, to | toAt+toOff }   → 截取 clip 的 [at+from, at+to]
//   subs:  { seg, off, text }      字幕从该段开始后 off 秒出现；"/" 换行（每行 ≤ 16 字，最多两行）
//          停留时长按规则自动算：max(2.5, 1.0 + 字数 × 0.25) 秒；与上一条至少隔 0.3 秒（不足会报警）
//   cards: { seg, off, dur, html, seal }  大字卡（≥ 1.8 秒），和字幕错开
//   sfx:   { seg, at, off, file, gain }   合成音效，at 是该片段里的标记
//   music: 段落起点 { title, world, cave, battle, boss, kill: [seg, 标记], outro: "@end" }
//   end:   片尾定格 { freeze, title, slogan, tag, seal, demo }
// 规则（用户要求）：不配音，只有字幕 + 配乐；画面节奏跟着字幕走——字幕没读完不切下一个关键镜头；
//                   UI 段从界面进场动画结束、数据填好之后开始取（录制脚本里的 *Ready 标记）。

export const SUB_RULE = { base: 1.0, perChar: 0.25, min: 2.5, gap: 0.3, maxLine: 16, maxLines: 2, cardMin: 1.8 };

export const FULL = {
  name: "墨途_宣传_v1",
  fadeIn: 1.0,
  segs: [
    { key: "title", clip: "s01_title", at: 0, from: 0, to: 2.8, note: "黑屏起墨 → 开始界面「墨途」" },
    { key: "fight", clip: "s02_fight", at: "charge", from: -2.5, to: 1.6, note: "序章溪边：锈剑三段连招砍狼，气势满右键放蓄势斩（月牙剑气 +「斩」）" },
    { key: "walk", clip: "s03_walk", at: 0, from: 0.1, to: 3.2, note: "迎客松下穿进竹林（WASD 实操）" },
    { key: "bridge", clip: "s03b_bridge", at: 0, from: 0.3, to: 3.0, note: "过溪畔石桥，古传送阵在左" },
    { key: "map", clip: "s04_map", at: "ready", from: -0.1, to: 2.6, note: "按 M 展开天机镜手卷地图，走过的路着墨" },
    { key: "loot", clip: "s05_loot", at: "kill", from: -0.8, to: null, toAt: "xian", toOff: 1.6, note: "斩狼留尸 → F 搜取：墨封格神识逐格揭示，仙品「千年竹心」泛金" },
    { key: "chest", clip: "s06_chest", at: "open", from: -0.5, to: 2.3, note: "开灵光宝箱" },
    { key: "bag", clip: "s07_bag", at: "ready", from: -0.1, to: 1.9, note: "Tab 储物袋纸笺：占格、灵值" },
    { key: "night", clip: "s08_night", at: "night", from: -3.2, to: 2.3, note: "天时晨 → 夜，灵潮倍率涨到 ×2，入夜妖潮来袭" },
    { key: "extract", clip: "s09_extract", at: "channel", from: -0.6, to: 2.4, note: "古传送阵读条撤离" },
    { key: "result", clip: "s09_extract", at: "resultReady", from: 0, to: 3.4, note: "结算手卷「满载而归」（展开完、账目填好后才取）" },
    { key: "cave", clip: "s10_cave", at: "click", from: -1.3, to: 2.6, note: "洞府小院，点「今日可办」自动走过去" },
    { key: "refine", clip: "s11_break", at: "pageReady", from: 0, to: null, toAt: "refine", toOff: 1.6, note: "灵泉 · 境界页，点炼化" },
    { key: "break", clip: "s11_break", at: "break", from: 0.3, to: 4.6, note: "突破：练气五层，天机镜里亮起记忆「工位」" },
    { key: "mirror", clip: "s12_mirror", at: "ready", from: 0, to: 5.0, note: "天机镜（圆镜里的手机）境界录 → 记忆" },
    { key: "forge", clip: "s13_forge", at: "craft", from: -1.1, to: null, toAt: "result", toOff: 1.6, note: "丹器房 · 青铜方鼎炼器，仙品青锋剑泛金" },
    { key: "alchemy", clip: "s14_alchemy", at: "brew", from: -0.2, to: 1.8, note: "八卦炉开炉，守火候" },
    { key: "alchemy2", clip: "s14_alchemy", at: "done", from: -0.3, to: 1.6, note: "出丹盖印" },
    { key: "reforge", clip: "s15_reforge", at: "reforge", from: -0.3, to: 2.1, note: "重铸词条：旧 → 新揭示" },
    { key: "imbue", clip: "s16_imbue", at: "imbue", from: -0.3, to: 2.0, note: "五行附灵 · 火" },
    { key: "shield", clip: "s17_shield", at: "aim", from: -0.5, to: null, toAt: "charge", toOff: 1.3, note: "精英木盾：Q 剑气斩预览（射程 / 轨迹）→ 破盾 → 火剑连斩 + 蓄势斩" },
    { key: "boss", clip: "s18_boss", at: 0, from: 0.3, to: null, toAt: "end", toOff: 0, note: "青牙：剑气破木盾、缠藤破土盾、飞剑，最后蓄势斩慢动作「斩」" },
  ],
  end: { freeze: 5.0, title: "墨途", slogan: "画中一梦 · 山河留白", tag: "斜俯视水墨仙侠 · 单机搜打撤", seal: "实机", demo: "实机演示 · 画面均为游戏实时录制" },
  subs: [
    { seg: "fight", off: 0.3, text: "一觉醒来，进了一幅未干的水墨画。" },
    { seg: "bridge", off: 0.8, text: "画里有妖有宝，天黑前得回家。" },
    { seg: "loot", off: 2.2, text: "神识逐格揭开，顿笔泛金是仙品。" },
    { seg: "night", off: 0.3, text: "越晚灵潮越旺，入夜妖潮将至。" },
    { seg: "extract", off: 0.6, text: "贪多少看你——活着撤出去才算数。" },
    { seg: "cave", off: 2.4, text: "灵泉炼化，破境突破。" },
    { seg: "mirror", off: 0.3, text: "天机镜：我那部碎了屏的手机。" },
    { seg: "forge", off: 0.9, text: "鼎中炼器，炉前守火。" },
    { seg: "reforge", off: 0.2, text: "重铸词条，五行附灵。" },
    { seg: "boss", off: 2.3, text: "青牙？比周五的甲方好对付。" },
  ],
  cards: [
    { seg: "walk", off: 1.6, dur: 2.0, html: "搜<i>·</i>打<i>·</i>撤", seal: "实机" },
    { seg: "loot", off: 0.1, dur: 1.8, html: "神识探宝", seal: "仙品" },
    { seg: "cave", off: 0.1, dur: 2.0, html: "洞府<i>·</i>成长", seal: "破境" },
    { seg: "shield", off: 0.1, dur: 1.9, html: "五行破盾", seal: "相克" },
    { seg: "boss", off: 0.1, dur: 1.9, html: "一剑斩青牙", seal: "首领" },
  ],
  sfx: [
    { seg: "fight", at: "swing", off: 0.35, file: "swish", gain: 0.35 },
    { seg: "fight", at: "swing", off: 0.95, file: "swish", gain: 0.35 },
    { seg: "fight", at: "swing", off: 1.55, file: "swish", gain: 0.4 },
    { seg: "fight", at: "charge", off: -0.15, file: "slash", gain: 0.7 },
    { seg: "loot", at: "xian", off: -0.05, file: "stamp", gain: 0.45 },
    { seg: "extract", at: "channel", off: 0, file: "stamp", gain: 0.3 },
    { seg: "break", at: "break", off: 0.3, file: "boom", gain: 0.4 },
    { seg: "forge", at: "craft", off: 0.35, file: "stamp", gain: 0.5 },
    { seg: "alchemy2", at: "done", off: 0.1, file: "stamp", gain: 0.45 },
    { seg: "imbue", at: "imbue", off: 0.35, file: "stamp", gain: 0.45 },
    { seg: "shield", at: "break", off: 0, file: "break", gain: 0.6 },
    { seg: "shield", at: "charge", off: -0.15, file: "slash", gain: 0.6 },
    { seg: "boss", at: "break1", off: 0, file: "break", gain: 0.6 },
    { seg: "boss", at: "break2", off: 0, file: "break", gain: 0.6 },
    { seg: "boss", at: "charge", off: -0.15, file: "slash", gain: 0.8 },
    { seg: "boss", at: "kill", off: 0, file: "boom", gain: 0.8 },
  ],
  cardStamp: 0.35, // 每张字卡盖印时一声"盖印"
  music: { title: ["title", 0.9], world: "walk", cave: "cave", battle: "shield", boss: "boss", kill: ["boss", "kill"], outro: "@end" },
};

// 15 秒短版：开场一剑、仙品出世、入夜、破盾、斩青牙、片尾
export const SHORT = {
  name: "墨途_宣传_15s",
  fadeIn: 0.4,
  segs: [
    { key: "fight", clip: "s02_fight", at: "charge", from: -1.4, to: 1.0 },
    { key: "loot", clip: "s05_loot", at: "xian", from: -1.6, to: 0.8 },
    { key: "night", clip: "s08_night", at: "night", from: -1.2, to: 0.6 },
    { key: "shield", clip: "s17_shield", at: "break", from: -0.9, to: 0.8 },
    { key: "boss", clip: "s18_boss", at: "charge", from: -0.8, to: null, toAt: "end", toOff: -0.9 },
  ],
  end: { freeze: 3.0, title: "墨途", slogan: "画中一梦 · 山河留白", tag: "斜俯视水墨仙侠 · 单机搜打撤", seal: "实机", demo: "实机演示" },
  subs: [
    { seg: "fight", off: 0.2, text: "斩妖，探宝，入夜前撤出去。" },
    { seg: "night", off: 0.6, text: "五行破盾——一剑，斩青牙。" },
  ],
  cards: [],
  sfx: [
    { seg: "fight", at: "charge", off: -0.15, file: "slash", gain: 0.7 },
    { seg: "loot", at: "xian", off: -0.05, file: "stamp", gain: 0.45 },
    { seg: "shield", at: "break", off: 0, file: "break", gain: 0.6 },
    { seg: "boss", at: "charge", off: -0.15, file: "slash", gain: 0.8 },
    { seg: "boss", at: "kill", off: 0, file: "boom", gain: 0.8 },
  ],
  music: { title: ["fight", 0.0], world: "fight", cave: "night", battle: "night", boss: "shield", kill: ["boss", "kill"], outro: "@end" },
};
