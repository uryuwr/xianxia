// 天机镜 v2 示意图 · 假数据（只给 docs/ui/v2/mirror_v2/*.html 用，不是游戏代码）
// 属性：照抄 src/data/progression.js 的成长公式；解锁：照抄 PROGRESSION.unlocks / grants；记忆与玄机子台词：照抄 src/game/cave/story.js。
// 出行次数、入画日数、时辰、行迹统计是编的。
(function () {
  const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const ORDER = ["0:0", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7", "1:8", "1:9", "2:1"];
  const XP = [10, 100, 150, 220, 300, 400, 520, 660, 820, 1200]; // 该层 → 下一层所需修为
  const name = (k) => {
    const [s, l] = k.split(":").map(Number);
    return s === 0 ? "凡人" : (s === 1 ? "练气" : "筑基") + CN[l] + "层";
  };
  const short = (from, to) => (from[0] === to[0] && to[0] !== "0" ? CN[+to.split(":")[1]] + "层" : name(to));

  // ---- 成长表（progression.js growth） ----
  const aspdOf = (L) => Math.round((0.8 + (0.35 * (L - 1)) / 9) * 1000) / 1000;
  const G = {};
  for (const k of ORDER) {
    const [s, l] = k.split(":").map(Number);
    if (s === 0) G[k] = { hp: 160, mp: 80, atk: 16, spell: 16, def: 3, crit: 0.1, critDmg: 1.6, move: 6, mpRegen: 4, hpRegen: 0, aspd: 0.75, dashMax: 1, dashCd: 2.75, sense: 0 };
    else if (s === 1) {
      const n = l - 1;
      G[k] = { hp: 200 + 30 * n, mp: 100 + 15 * n, atk: 20 + 4 * n, spell: 20 + 4 * n, def: 5 + 2 * n, crit: 0.1, critDmg: 1.6, move: 6, mpRegen: 4, hpRegen: 1 + 0.25 * n, aspd: aspdOf(l), dashMax: l >= 6 ? 2 : 1, dashCd: 2.75, sense: 8 * n };
    } else G[k] = { hp: 720, mp: 360, atk: 84, spell: 84, def: 36, crit: 0.12, critDmg: 1.7, move: 6.5, mpRegen: 7, hpRegen: 3.5, aspd: aspdOf(10), dashMax: 2, dashCd: 2.5, sense: 100 };
  }
  // 展示顺序与格式（lower：数值越小越好）
  const STATS = [
    { k: "hp", n: "气血" }, { k: "mp", n: "真气" }, { k: "atk", n: "攻击" }, { k: "spell", n: "法力" }, { k: "def", n: "防御" },
    { k: "aspd", n: "攻速", f: (v) => v.toFixed(2) }, { k: "sense", n: "神识" },
    { k: "dashMax", n: "闪身", u: "次" }, { k: "dashCd", n: "闪身冷却", u: "秒", lower: !0, f: (v) => v.toFixed(2) },
    { k: "hpRegen", n: "回血", u: "/秒", f: (v) => (Math.round(v * 100) / 100).toString() }, { k: "mpRegen", n: "回气", u: "/秒" },
    { k: "crit", n: "会心", f: (v) => Math.round(v * 100) + "%" }, { k: "critDmg", n: "会心伤害", f: (v) => Math.round(v * 100) + "%" },
    { k: "move", n: "身法" },
  ];
  const fmt = (s, v) => (s.f ? s.f(v) : String(Math.round(v * 100) / 100));
  const fmtD = (s, d) => {
    const a = Math.abs(d);
    const t = s.f ? s.f(a) : String(Math.round(a * 100) / 100);
    return (d > 0 ? "+" : "−") + t.replace(/^0\./, ".");
  };

  // ---- 解锁（progression.js unlocks / grants，到达该境界时新得的） ----
  const UNL = {
    "1:1": [{ t: "法术栏", v: "×1" }],
    "1:2": [{ t: "丹药栏", v: "×2" }],
    "1:3": [{ t: "法术栏", v: "×2" }, { t: "法衣栏" }, { t: "储物袋", v: "可扩至 24 格" }],
    "1:4": [{ t: "心法栏", v: "×1" }, { t: "贴身锦囊", v: "可扩至 2 格" }],
    "1:5": [{ t: "丹药栏", v: "×3" }, { t: "玉佩栏" }, { t: "二段跳", ab: !0 }, { t: "竹海 · 溪谷", rg: !0 }],
    "1:6": [{ t: "闪身", v: "2 次", ab: !0 }],
    "1:7": [{ t: "法术栏", v: "×3" }, { t: "法宝栏" }, { t: "阵法栏" }, { t: "储物袋", v: "可扩至 32 格" }],
    "1:8": [{ t: "心法栏", v: "×2" }],
    "1:9": [],
    "2:1": [{ t: "丹药栏", v: "×4" }, { t: "御剑", ab: !0 }, { t: "黑风岭", v: "线索", rg: !0 }],
  };
  const GRANT = {
    "1:1": [{ kind: "spell", name: "剑气斩", glyph: "剑" }],
    "1:4": [{ kind: "xinfa", name: "锋锐", glyph: "锐" }],
    "2:1": [{ kind: "spell", name: "土遁护体", glyph: "盾" }],
  };

  // ---- 记忆（story.js MEMORIES） ----
  const MEM = {
    "1:1": { title: "锁屏", lines: ["裂屏亮了一角：凌晨两点十七分，四十三条未读。", "最上面一条是妈：“墨啊，周末回家吃饭不？”"] },
    "1:2": { title: "十号线", lines: ["一张拍糊了的照片：地铁车窗里，倒映着一张疲惫的脸。", "他差点没认出那是自己。"] },
    "1:3": { title: "日程", lines: ["日程提醒浮了上来：“周五 18:00 交方案终稿”。", "他头一回觉得，这行字也挺亲切。"] },
    "1:4": { title: "早餐摊", lines: ["十秒的视频：楼下早餐摊的老板娘喊，“老样子，加个蛋！”", "豆浆的热气在裂屏里冒了很久。"] },
    "1:5": { title: "工位", lines: ["相册里的工位：一盆绿萝，半杯冷掉的咖啡。", "便利贴上是他自己的字：“别忘了给爸买降压药。”"] },
    "1:6": { title: "七秒", lines: ["天机镜自己放了一段语音，是母亲：“……下雨记得带伞，别老加班。”", "只有七秒。他放了十一遍。"] },
    "1:7": { title: "偏离路线", lines: ["地图亮了：一个蓝点在博物馆的位置闪烁，旁边写着“您已偏离路线”。", "他笑出了声——确实偏得有点远。"] },
    "1:8": { title: "展讯", lines: ["那晚的展讯截图：“《万象山河图》残卷首展，原作北段佚失。”", "北段……他抬头，望向画卷的北方。"] },
    "1:9": { title: "墨字", lines: ["屏幕上浮出一行不属于手机的字，像毛笔写成：", "“画中人欲归，须补全山河。”墨迹未干。"] },
    "2:1": { title: "拨出", clue: !0, lines: ["输入框第一次亮起。他打了又删，最后只留下四个字：“妈，我很好。”——发送中……", "裂纹连成一幅地图：留白之外，北方黑风岭的位置，一个和他一样的蓝点正在闪烁。", "画的那一头，还有人拿着天机镜。"] },
  };
  const XJZ = {
    "1:1": "引气入体。从今往后，你便是练气修士了。", "1:2": "气海初成，不错不错。比老夫当年慢了三天。", "1:3": "又进一层。你那会亮的镜子，又亮了？",
    "1:4": "灵根驳杂，进境倒是不慢——怪哉，怪哉。", "1:5": "练气五层。溪谷那条灵脉，你可以去见见世面了。", "1:6": "镜子里那位妇人……是你娘吧。",
    "1:7": "老夫活了三百年，头一回见人对着镜子傻笑。", "1:8": "北边？先把筑基丹炼出来再说。", "1:9": "九层圆满。再往前一步，便是心魔劫。", "2:1": "筑基了。……好小子，老夫没看错人。",
  };
  // 林墨的回嘴（方向 C 修行圈用，示意文案，需文案确认）
  const REPLY = { "1:2": "那您当年用了几天？", "1:7": "……被您看见了。" };

  // ---- 每次突破的"时间"（编的）：第几次出行之后、入画第几日、时辰 ----
  const RUN = { "1:1": 0, "1:2": 2, "1:3": 4, "1:4": 6, "1:5": 8, "1:6": 11, "1:7": 14, "1:8": 17, "1:9": 21, "2:1": 26 };
  const HOUR = { "1:1": "寅时", "1:2": "酉时", "1:3": "戌时", "1:4": "亥时", "1:5": "子时", "1:6": "酉时", "1:7": "戌时", "1:8": "亥时", "1:9": "子时", "2:1": "卯时" };
  const SRC = { "1:1": "开场 · 玄机子渡气", "1:5": "狼王内丹 ×1、灵石 260", "1:7": "青牙妖丹 ×1、灵石 410", "2:1": "筑基丹 ×1" };

  function history(prog) {
    const out = [];
    for (let i = 1; i < ORDER.length; i++) {
      const to = ORDER[i], from = ORDER[i - 1];
      if (ORDER.indexOf(to) > ORDER.indexOf(prog)) break;
      const stats = [];
      for (const s of STATS) {
        const d = G[to][s.k] - G[from][s.k];
        if (Math.abs(d) > 1e-6) stats.push({ ...s, a: G[from][s.k], b: G[to][s.k], d });
      }
      out.push({
        from, to, fromName: name(from), toName: name(to), toShort: short(from, to),
        run: RUN[to], day: RUN[to] + 1, hour: HOUR[to], xp: XP[i - 1], src: SRC[to] || "",
        trial: to === "2:1" ? { name: "心魔劫", tries: 2 } : null,
        stats, unlocks: UNL[to] || [], grants: GRANT[to] || [], memKey: to, mem: MEM[to], xjz: XJZ[to], reply: REPLY[to],
      });
    }
    return out.reverse(); // 最新在上
  }

  // 累计：练气一层 → 当前
  function totals(prog) {
    const a = G["1:1"], b = G[prog];
    const rows = STATS.map((s) => ({ ...s, a: a[s.k], b: b[s.k], d: b[s.k] - a[s.k] })).filter((r) => Math.abs(r.d) > 1e-6);
    const unl = [];
    for (const k of ORDER.slice(1)) {
      if (ORDER.indexOf(k) > ORDER.indexOf(prog)) break;
      for (const u of UNL[k] || []) unl.push({ ...u, at: k });
    }
    // 合并同名栏位，只留最后一次（×3 覆盖 ×2）
    const last = {};
    for (const u of unl) last[u.t] = u;
    const learned = [];
    for (const k of ORDER.slice(1)) if (ORDER.indexOf(k) <= ORDER.indexOf(prog)) for (const g of GRANT[k] || []) learned.push({ ...g, at: k });
    return { rows, unlocks: Object.values(last), learned };
  }

  // 行迹统计（编的；两档进度各一套）
  const TRAIL = {
    "1:7": { runs: 14, extracted: 10, deaths: 4, kills: 231, herbs: 58, chests: 37, lostBagBack: 1,
      bestHaul: { run: 12, region: "竹海 · 溪谷", value: 1286, items: 11 }, bestItem: { name: "青冥飞剑", rarity: 2, run: 13, region: "竹海 · 溪谷 · 剑修遗府" },
      bosses: [{ n: "青牙", c: 3 }], firstDeath: { run: 1, by: "竹林狼妖 ×4", region: "青岚山外" }, far: "竹海 · 溪谷" },
    "2:1": { runs: 26, extracted: 19, deaths: 7, kills: 486, herbs: 131, chests: 82, lostBagBack: 2,
      bestHaul: { run: 23, region: "竹海 · 溪谷", value: 3412, items: 14 }, bestItem: { name: "乾坤镜", rarity: 4, run: 24, region: "竹海 · 溪谷 · 夜" },
      bosses: [{ n: "青牙", c: 5 }, { n: "碧鳞", c: 2 }], firstDeath: { run: 1, by: "竹林狼妖 ×4", region: "青岚山外" }, far: "竹海 · 溪谷" },
  };
  const NOW = { "1:7": { xp: 412, need: 660, day: 15 }, "2:1": { xp: 140, need: 1500, day: 27 } };

  // 品级颜色：严格按 src/core/items.js RARITY
  const RARITY = [{ name: "凡品", color: "#6a6760" }, { name: "灵品", color: "#3fae7a" }, { name: "宝品", color: "#2f7fa8" }, { name: "仙品", color: "#c9a040" }, { name: "极品", color: "#d2321e" }];

  // ---- 记忆"照片"：几笔水墨速写（SVG，viewBox 0 0 120 90） ----
  const S = 'fill="none" stroke="#15181b" stroke-linecap="round" stroke-linejoin="round"';
  const W = 'fill="rgba(21,24,27,.12)" stroke="none"';
  const B = "#2f7fa8";
  const DOODLE = {
    "1:1": `<rect x="38" y="8" width="44" height="76" rx="7" ${S} stroke-width="2.6" opacity=".8"/><path d="M66 10 L60 30 L70 42 L54 58 L60 82" ${S} stroke-width="1" opacity=".55"/><path d="M60 30 L46 36" ${S} stroke-width=".8" opacity=".45"/><text x="60" y="34" text-anchor="middle" font-size="12" font-family="Microsoft YaHei" fill="#15181b" opacity=".75">2:17</text><circle cx="60" cy="48" r="5" fill="${B}" opacity=".35"/><rect x="44" y="56" width="32" height="5" rx="2.5" ${W}/><rect x="44" y="64" width="24" height="5" rx="2.5" ${W}/>`,
    "1:2": `<rect x="10" y="14" width="100" height="58" rx="10" ${S} stroke-width="2.4" opacity=".75"/><path d="M60 14 V72" ${S} stroke-width="1.6" opacity=".5"/><ellipse cx="38" cy="42" rx="11" ry="14" ${W}/><path d="M28 64 Q38 52 48 64" ${S} stroke-width="1.6" opacity=".4"/><path d="M68 30 H104 M72 40 H100 M66 52 H96" ${S} stroke-width="1" opacity=".3"/><path d="M4 82 H116" ${S} stroke-width="2" opacity=".5"/>`,
    "1:3": `<rect x="22" y="14" width="76" height="64" rx="4" ${S} stroke-width="2.2" opacity=".75"/><path d="M22 28 H98" ${S} stroke-width="2" opacity=".6"/><path d="M41 28 V78 M60 28 V78 M79 28 V78 M22 45 H98 M22 62 H98" ${S} stroke-width=".9" opacity=".3"/><circle cx="88" cy="54" r="9" fill="none" stroke="#b8291a" stroke-width="2" opacity=".8"/><path d="M38 8 V20 M82 8 V20" ${S} stroke-width="2.4" opacity=".7"/>`,
    "1:4": `<path d="M24 50 Q60 92 96 50 Z" ${W}/><path d="M22 50 H98 M26 52 Q60 92 94 52" ${S} stroke-width="2.6" opacity=".8"/><path d="M46 42 Q40 32 48 24 Q54 16 48 8 M62 40 Q56 30 64 22 Q70 14 64 6 M78 42 Q72 32 80 24" ${S} stroke-width="1.4" opacity=".4"/><path d="M40 84 H80" ${S} stroke-width="2" opacity=".5"/>`,
    "1:5": `<rect x="30" y="12" width="60" height="40" rx="3" ${S} stroke-width="2.4" opacity=".75"/><path d="M60 52 V62 M46 64 H74" ${S} stroke-width="2" opacity=".6"/><path d="M8 76 H112" ${S} stroke-width="2.2" opacity=".6"/><path d="M98 74 V60 M98 60 Q88 50 92 40 M98 60 Q108 50 104 40 M98 64 Q86 62 84 54" ${S} stroke-width="1.6" stroke="#3f9a6e" opacity=".85"/><path d="M14 74 V62 H28 V74" ${S} stroke-width="1.8" opacity=".6"/><rect x="64" y="22" width="18" height="16" fill="#e6c94a" opacity=".55" transform="rotate(-6 73 30)"/>`,
    "1:6": `<path d="M14 45 H24 M30 45 V34 M36 45 V24 M42 45 V38 M48 45 V18 M54 45 V30 M60 45 V12 M66 45 V28 M72 45 V36 M78 45 V22 M84 45 V40 M90 45 V32 M96 45 H106" ${S} stroke-width="3" opacity=".7"/><path d="M30 45 V56 M36 45 V66 M42 45 V52 M48 45 V72 M54 45 V60 M60 45 V78 M66 45 V62 M72 45 V54 M78 45 V68 M84 45 V50 M90 45 V58" ${S} stroke-width="3" opacity=".35"/><text x="60" y="88" text-anchor="middle" font-size="9" font-family="Microsoft YaHei" fill="#15181b" opacity=".55">0:07</text>`,
    "1:7": `<path d="M8 80 Q30 70 34 52 T60 34 T96 14" ${S} stroke-width="2.4" opacity=".55" stroke-dasharray="1 6"/><path d="M8 60 Q40 64 60 50 T112 40" ${S} stroke-width="1" opacity=".25"/><path d="M8 30 Q50 40 70 20" ${S} stroke-width="1" opacity=".25"/><circle cx="60" cy="34" r="9" fill="${B}" opacity=".2"/><circle cx="60" cy="34" r="4" fill="${B}" opacity=".9"/><path d="M96 14 m-6 0 a6 6 0 1 1 12 0 q0 6 -6 12 q-6 -6 -6 -12" fill="#b8291a" opacity=".7"/>`,
    "1:8": `<path d="M6 22 H92 L88 30 L94 38 L88 48 L94 58 L90 68 H6 Z" ${W}/><path d="M6 20 V70" ${S} stroke-width="3" opacity=".7"/><path d="M12 62 L26 40 L34 52 L46 30 L58 54 L66 44 L80 62" ${S} stroke-width="1.8" opacity=".6"/><path d="M92 22 L88 30 L94 38 L88 48 L94 58 L90 68" ${S} stroke-width="1" opacity=".5"/><text x="104" y="48" text-anchor="middle" font-size="16" font-family="KaiTi" fill="#15181b" opacity=".35">北</text>`,
    "1:9": `<text x="60" y="68" text-anchor="middle" font-size="64" font-family="ZhiMangXing, MaShanZheng, KaiTi" fill="#15181b" opacity=".82">归</text><path d="M20 80 Q60 74 100 82" ${S} stroke-width="1.2" opacity=".3"/>`,
    "2:1": `<path d="M18 18 H86 Q94 18 94 26 V50 Q94 58 86 58 H40 L28 70 V58 H26 Q18 58 18 50 Z" ${W}/><text x="56" y="43" text-anchor="middle" font-size="13" font-family="KaiTi" fill="#15181b" opacity=".8">妈，我很好。</text><circle cx="100" cy="74" r="9" fill="${B}" opacity=".2"/><circle cx="100" cy="74" r="4" fill="${B}" opacity=".9"/><path d="M8 84 Q40 76 70 82" ${S} stroke-width="1" opacity=".3"/>`,
  };
  const doodle = (k, cls = "") => `<svg class="mj-doodle ${cls}" viewBox="0 0 120 90" aria-hidden="true"><g filter="url(#ink-rough)">${DOODLE[k] || ""}</g></svg>`;

  // 壁纸：穿越前那晚的城市（淡墨远楼 + 雨 + 博物馆屋檐）
  const WALL = `<svg class="mj-wall-svg" viewBox="0 0 300 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dfdc"/><stop offset=".55" stop-color="#ece6d6"/><stop offset="1" stop-color="#e4dcc8"/></linearGradient>
<filter id="wblur"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
<rect width="300" height="520" fill="url(#wsky)"/>
<g fill="rgba(21,24,27,.10)" filter="url(#wblur)"><rect x="8" y="250" width="34" height="190"/><rect x="48" y="210" width="28" height="230"/><rect x="82" y="270" width="40" height="170"/><rect x="190" y="230" width="30" height="210"/><rect x="226" y="190" width="36" height="250"/><rect x="266" y="260" width="30" height="180"/></g>
<g fill="rgba(21,24,27,.2)" filter="url(#wblur)"><rect x="20" y="300" width="26" height="140"/><rect x="236" y="280" width="24" height="160"/></g>
<path d="M98 360 Q150 336 202 360 L196 364 Q150 346 104 364 Z" fill="rgba(21,24,27,.55)"/><rect x="112" y="364" width="76" height="80" fill="rgba(21,24,27,.18)"/><path d="M122 370 V440 M138 370 V440 M162 370 V440 M178 370 V440" stroke="rgba(21,24,27,.3)" stroke-width="3"/>
<rect x="0" y="440" width="300" height="80" fill="rgba(21,24,27,.08)"/><path d="M0 446 Q150 438 300 448" stroke="rgba(21,24,27,.25)" stroke-width="1.2" fill="none"/>
<g stroke="rgba(47,127,168,.22)" stroke-width="1"><path d="M30 40 l-6 18 M70 90 l-6 18 M120 30 l-6 18 M170 120 l-6 18 M220 60 l-6 18 M260 140 l-6 18 M40 170 l-6 18 M110 200 l-6 18 M200 180 l-6 18 M280 30 l-6 18 M150 70 l-6 18 M90 150 l-6 18 M240 230 l-6 18 M20 230 l-6 18"/></g>
<circle cx="150" cy="392" r="2.2" fill="#e8c76a" opacity=".8"/></svg>`;

  // 裂纹（与游戏 cv-mirror 的裂纹同一走向）
  const CRACK = `<svg class="mj-crack" viewBox="0 0 220 430" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(21,24,27,.22)" stroke-width="1"><path d="M150 0 L138 70 L160 118 L120 170 L132 230 L96 300"/><path d="M138 70 L90 96 L60 92"/><path d="M160 118 L214 140"/><path d="M120 170 L70 186 L30 230"/><path d="M132 230 L190 262 L220 250"/><path d="M96 300 L110 360 L84 430"/></g><g fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".8" transform="translate(1,1)"><path d="M150 0 L138 70 L160 118 L120 170 L132 230 L96 300"/><path d="M138 70 L90 96 L60 92"/></g></svg>`;

  window.MJD = { ORDER, CN, name, G, STATS, fmt, fmtD, UNL, GRANT, MEM, XJZ, REPLY, history, totals, TRAIL, NOW, RARITY, doodle, WALL, CRACK };
})();
