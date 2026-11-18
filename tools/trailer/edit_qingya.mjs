// 青牙 v2 首领宣传片剪辑表（node tools/trailer/build.mjs --edit=qingya）。格式同 edit.mjs；新增 grid 段（2×2 分屏，labels 为四格题签）。
// 分镜与验收点对照：docs/promo/青牙_v2_分镜.md。规则：不配音、字幕只在纸边字幕带、阶段变化不加横幅（靠外观 / 护盾 / 环境）、实机录制。
export const FULL = {
  name: "墨途_青牙_v2_粗剪",
  outDir: "release",
  fadeIn: 1.0,
  segs: [
    // ① 狼谷环境
    { key: "valley", clip: "q01_valley", at: 0, from: 0.6, to: null, toAt: "rock", toOff: 0.9, note: "① 无 HUD 空镜：谷上空摇下 → 北图腾、狼牙石柱、墨色谷地 → 狼王石上打盹的青牙" },
    // ④ 第 1 次（练二）
    { key: "first_intro", clip: "q02_first", at: 0, from: 0.2, to: null, toAt: "fight", toOff: 0.2, note: "④① 练二走进谷：完整入场（狼嚎、墨雾封门、题签「初见」+「折其威，可斩」）" },
    { key: "first_pack", clip: "q02_first", at: "howl", from: -0.2, to: null, toAt: "pack", toOff: 1.5, note: "② 长嚎没打断：图腾亮起，群狼出窝合围" },
    { key: "first_dead", clip: "q02_first", at: "rend", from: -0.3, to: null, toAt: "dead", toOff: 1.6, note: "④ 裂风三扑连中 → 身陨" },
    // ② 攻防交互（练四）
    { key: "howl", clip: "q04_howl", at: "howl", from: -0.5, to: null, toAt: "interrupt", toOff: 1.7, note: "② 练四：长嚎读条中剑气斩三道 →「断」、朱环、踉跄（一只狼都不出）" },
    { key: "crash", clip: "q03_crash", at: "rend", from: -1.2, to: null, toAt: "charge", toOff: 1.5, note: "②① 站到狼牙石柱后 → 裂风三扑撞柱、石碎、撞晕 → 满势蓄势斩" },
    // ①④ 打到二阶段
    { key: "phase", clip: "q05_phase", at: "cast", from: -0.6, to: null, toAt: "p2", toOff: 1.2, note: "①④ 剑气斩（金克木）破木盾 → 转阶段：遮月、骨甲崩裂、眼燃青焰、墨雾变浓、土盾重生（无横幅）" },
    // ② 二阶段交互（练七）
    { key: "vine", clip: "q06_p2", at: "vine", from: -1.5, to: 1.1, note: "② 练七：缠藤诀（木克土）破土盾" },
    { key: "moon", clip: "q06_p2", at: "moonGo", from: 0, to: null, toAt: "denied", toOff: 1.0, note: "②① 站进月光 → 影袭落空（月下无影）" },
    { key: "frost", clip: "q06_p2", at: "howl", from: -0.5, to: null, toAt: "execEnd", toOff: 0.6, note: "②③ 寒冰锥断啸月 → 威折倒地 → F 威折处决（跃背、插甲、朱「斩」）" },
    // ③ 终结处决（首斩完整版）
    { key: "final", clip: "q07_final", at: "charge", from: -0.6, to: null, toAt: "defeated", toOff: 2.2, note: "③④ 满势斩打到气竭 → F 终结处决：留白、一笔横斩、「斩」、朱印「青牙伏诛」、化墨 → 感悟" },
    // ④ 筑基轻松通关
    { key: "easy", clip: "q08_easy", at: 0, from: 0, to: null, toAt: "charge", toOff: 1.2, note: "④ 筑基入场：题签「第 9 次 · 上回已斩」，青牙伏低畏缩 → 一刀" },
    { key: "easy2", clip: "q08_easy", at: "p2", from: 0, to: null, toAt: "defeated", toOff: 1.0, note: "④ 短版终结处决（2 秒）" },
    // ④ 成长对比：同一招裂风三扑，四档四结局
    {
      key: "grid", dur: 4.8, note: "④ 分屏：同一招裂风三扑——练二倒地 / 练四闪开 / 练七引撞柱 / 筑基硬吃反手一刀",
      grid: [
        { clip: "qg1_t1", at: "rend", from: -0.4 },
        { clip: "qg2_t2", at: "rend", from: -0.4 },
        { clip: "qg3_t3", at: "rend", from: -0.6 },
        { clip: "qg4_t4", at: "rend", from: -0.4 },
      ],
      labels: [
        { t: "第 1 次 · 练气二层", r: "三扑倒地" },
        { t: "第 4 次 · 练气四层", r: "闪开三扑" },
        { t: "第 6 次 · 练气七层", r: "引它撞柱" },
        { t: "第 9 次 · 筑基", r: "硬吃，反手一刀" },
      ],
    },
  ],
  end: { freeze: 4.5, title: "墨途", slogan: "狼谷之主 · 青牙", tag: "读招 · 破势 · 处决", seal: "伏诛", demo: "实机演示 · 画面均为游戏实时录制" },
  subs: [
    { seg: "valley", off: 2.6, text: "北岭狼谷，狼王青牙守在石前。" },
    { seg: "first_pack", off: 0.2, text: "第一次：长嚎没断，群狼合围。" },
    { seg: "first_dead", off: 1.0, text: "三扑之后，人就躺下了。" },
    { seg: "howl", off: 0.2, text: "长嚎要读条——一道剑气，断。" },
    { seg: "crash", off: 1.9, text: "引它撞柱，再补满势一刀。" },
    { seg: "phase", off: 3.2, text: "墨云遮月，骨甲崩裂——它认真了。" },
    { seg: "vine", off: 0.1, text: "五行相克：土盾，用木来破。" },
    { seg: "moon", off: 1.8, text: "月下无影，它扑了个空。" },
    { seg: "frost", off: 2.2, text: "寒冰锥断啸月——折其威，可斩。" },
    { seg: "final", off: 0.0, text: "第六次，斩。" },
    { seg: "easy", off: 0.6, text: "筑基再来，它先低了头。" },
    { seg: "grid", off: 0.1, text: "同一招，四个境界，四个结局。" },
  ],
  cards: [{ seg: "valley", off: 0.1, dur: 2.1, html: "狼谷<i>·</i>青牙", seal: "首领" }],
  sfx: [
    { seg: "howl", at: "interrupt", off: 0, file: "stamp", gain: 0.5 },
    { seg: "crash", at: "crash", off: 0, file: "boom", gain: 0.55 },
    { seg: "crash", at: "charge", off: -0.15, file: "slash", gain: 0.7 },
    { seg: "phase", at: "phase", off: 0, file: "break", gain: 0.6 },
    { seg: "vine", at: "vine", off: 0, file: "break", gain: 0.55 },
    { seg: "frost", at: "interrupt", off: 0, file: "stamp", gain: 0.5 },
    { seg: "frost", at: "exec", off: 0.9, file: "slash", gain: 0.7 },
    { seg: "final", at: "final", off: 1.2, file: "slash", gain: 0.85 },
    { seg: "final", at: "final", off: 1.9, file: "stamp", gain: 0.6 },
    { seg: "easy2", at: "final", off: 0.35, file: "slash", gain: 0.7 },
  ],
  cardStamp: 0.35,
  // 配乐段落（music.py）：开场空镜 → 初见（古筝轻鼓）→ 身陨后古琴 → 攻防太鼓 → 二阶段重鼓 → 终结一斩 → 分屏处一声磬
  music: { title: ["valley", 0.5], world: "first_intro", cave: ["first_dead", "dead", 0.3], battle: "howl", boss: "phase", kill: ["final", "final", 1.2], outro: "grid" },
};
export const SHORT = null;
