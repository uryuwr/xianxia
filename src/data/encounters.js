// 奇遇（模块 E）：每局 1–2 个，落在关卡里的灵光点 / 遗府 / 灵草点 / 妖群点附近（玩法评审 G8）。
// 解释见 src/game/quests/index.js（效果）与 src/ui/quests/dialog.js（水墨对话框）。
//
// 奇遇字段：name 名称、glyph 印章字、visual 场景表现（"bailu" 白鹭模型 | "fox" | "remains" | "rain"）、weight(P) 抽取权重、
//   start(P) → 起始节点 id、nodes 对话节点
// 节点：lines [[说话人, 文本], …]（"{me}" 为主角名；说话人 "" 为旁白，"{me}" 为主角，主角的心里话用括号）
//   choices [{ text, need?, effects?, reply?, next? }]
//     need   { item, n } 储物袋或丹药栏里有 | { stones } 储物袋里的灵石 | { favour } 白鹭好感
//     effects 选中后执行：
//       { item, n } 给物品（落在奇遇处，按拾取规则进储物袋）    { loot: 来源 id } 按掉落表给一份
//       { consume: { item, n } } 扣物品（先扣储物袋，再扣丹药栏） { pay: n } 扣储物袋里的灵石
//       { xp: "enc", k } 修为（ENCOUNTER_RULES.reward.xp 按区域 × k）   { fortune: "enc", k } 机缘值（D 的 FORTUNE.add.encounter × k；也可写负数）
//       { baopin: 概率 } 按概率给一件宝品装备   { favour } 白鹭好感   { bailu: 阶段 } 白鹭剧情推进到该阶段（只进不退）
//       { heal: 1 } 回满气血真气   { spawn: n, elite? } 惊动一群妖物（延迟 delay 秒）
//       { help: n, elite? } 白鹭请你一起清掉一群妖物（她会出手），清完给 reward 效果
//       { meditate: 秒, xp } 原地吐纳读条（离开圈子就中断）  { lead: 来源 id } 灵狐带路，片刻后在不远处给一份掉落
//       { reveal: 1 } 点亮最近一处未知的撤离点   { flag: 键 } 记一个剧情旗标   { note: 文本 } 结算时的一句记录
//     reply  选中后对方的回话（之后关闭，或进入 next 节点）
import { GATHER } from "./loot.js";

export const ENCOUNTER_RULES = {
  minRun: 6, // 第 6 局起出现（评审 G8）
  perRun: [0.25, 0.5, 0.25], // 每局 0 / 1 / 2 个的权重（数值评审：0–2 个）；从未遇过奇遇时至少 1 个（白鹭初遇）
  reward: { xp: { r1: 20, r2: 40 }, fortune: 5, baopin: 0.25 }, // 数值评审 G8：每个奇遇的期望奖励
  minFromEntry: 22, // 离入口至少这么远
  minApart: 26,
  minFromExtract: 8,
  talkRadius: 2.6,
  noticeRadius: 14,
};

const B = (P) => (P.flags.bailu ||= { stage: 0, favour: 0, met: 0 });

export const ENCOUNTERS = {
  // ======================= 散修白鹭：跨局的故事线 =======================
  bailu: {
    name: "白鹭", title: "散修", glyph: "鹭", visual: "bailu",
    weight: (P) => (B(P).stage < 3 ? 4 : 2),
    start(P) {
      const b = B(P);
      if (b.stage <= 0) return "meet";
      if (b.stage === 1) return "help";
      if (b.stage === 2) return "story";
      if (b.favour >= 6 && !b.gift) return "gift";
      return "again";
    },
    nodes: {
      meet: {
        lines: [
          ["", "灵光旁坐着一名月白衣衫的女子，背负长剑，正一枚一枚地数灵石。数到一半，她头也不抬地开口。"],
          ["白鹭", "站住。再往前一步，我就当你是来抢钱的。"],
          ["{me}", "（这位姐姐背着剑数钱的样子，像极了前世月底对账的财务……先别乱说话。）"],
          ["白鹭", "……你这身傻气，倒不像妖物假扮的。报上名来。"],
        ],
        choices: [
          {
            text: "「在下{me}，路过此地，不敢打扰。」",
            effects: [{ favour: 1 }, { bailu: 1 }, { reveal: 1 }, { xp: "enc" }, { note: "初遇散修白鹭，她指了一条出路" }],
            reply: [["白鹭", "{me}？名字倒雅。我叫白鹭，四海为家的散修。前面妖气重，你要走，往那边——那儿有一座古传送阵还亮着。"]],
          },
          {
            text: "「你袖口有血——我这儿有一枚回春丹。」",
            need: { item: "huichun_dan", n: 1 },
            effects: [{ consume: { item: "huichun_dan", n: 1 } }, { favour: 2 }, { bailu: 1 }, { item: "danfang_page", n: 2 }, { fortune: "enc" }, { note: "初遇白鹭，赠她一枚回春丹" }],
            reply: [
              ["白鹭", "……萍水相逢就送丹药，你是真傻还是装傻？"],
              ["白鹭", "罢了，这个人情我记下。这两页丹方我看不懂，留着也是垫桌脚，拿去。"],
            ],
          },
          {
            text: "（手按剑柄）「你又是何人？」",
            effects: [{ bailu: 1 }, { note: "初遇散修白鹭，彼此都留了个心眼" }],
            reply: [["白鹭", "呵，反应倒快。放心，我对你那点家当没兴趣——至少今天没有。后会有期。"]],
          },
        ],
      },
      help: {
        lines: [
          ["白鹭", "又是你。来得正好。"],
          ["白鹭", "前头那窝妖物抢了我的剑穗——别笑，那是师父留下的。帮我一把，好处少不了你的。"],
          ["{me}", "（剑穗被抢……妖怪的审美还挺讲究。）"],
        ],
        choices: [
          {
            text: "「义不容辞。」（与白鹭一同清剿一群妖物）",
            effects: [{ help: 4, elite: !0, reward: [{ favour: 2 }, { bailu: 2 }, { xp: "enc" }, { fortune: "enc" }, { baopin: 0.25 }, { note: "与白鹭并肩夺回剑穗" }] }],
            reply: [["白鹭", "好！你左我右，别被咬了屁股。"]],
          },
          {
            text: "「先谈谈买卖？」",
            next: "trade",
          },
          {
            text: "「我只想安安静静地搜刮……」",
            effects: [{ note: "婉拒了白鹭的求助" }],
            reply: [["白鹭", "……行吧，各有各的道。下回见了，可别装不认识我。"]],
          },
        ],
      },
      story: {
        lines: [
          ["", "白鹭倚着一株老松，把夺回来的石青剑穗系回剑首，系了三遍才系好。"],
          ["白鹭", "我出身青岚剑派。十年前一夜之间，山门没了，只剩我和这把剑。"],
          ["白鹭", "听说竹海深处有一座剑修遗府，我师父……也许就在那里坐化。你若路过，替我看一眼。"],
          ["{me}", "（原来她数灵石数得那么认真，是在攒去遗府的盘缠。）"],
        ],
        choices: [
          {
            text: "「我替你留意。若有你师门的东西，原样带给你。」",
            effects: [{ favour: 2 }, { bailu: 3 }, { item: "huqi_fu", n: 1 }, { fortune: "enc" }, { note: "白鹭讲起了青岚剑派的往事" }],
            reply: [["白鹭", "……多谢。这道护器符你拿着，下遗府时用得上。"]],
          },
          {
            text: "「节哀。山门没了，人还在，路就还在。」",
            effects: [{ favour: 1 }, { bailu: 3 }, { xp: "enc", k: 1.5 }, { note: "与白鹭聊起了「道」" }],
            reply: [["白鹭", "说得轻巧……不过，听着不坏。你这人，修为不怎么样，道心倒挺稳。"]],
          },
        ],
      },
      gift: {
        lines: [
          ["白鹭", "{me}，你又来蹭我的灵光了。"],
          ["白鹭", "这些日子承你照应。我没什么好东西，这个给你——别多想，只是我用不上。"],
        ],
        choices: [
          {
            text: "「那我就不客气了。」",
            effects: [{ item: "huqi_fu", n: 2 }, { fortune: "enc", k: 2 }, { flag: "bailu.gift" }, { note: "白鹭赠了两道护器符，还有一句「保重」" }],
            reply: [["白鹭", "保重。……我是说，保重你的储物袋，别又死在路上让我捡。"]],
          },
        ],
      },
      again: {
        lines: [["白鹭", "哟，又见面了。今天想做买卖，还是想听我骂妖怪？"]],
        choices: [
          { text: "「做买卖。」", next: "trade" },
          {
            text: "「一起清一窝妖物？」",
            effects: [{ help: 5, elite: !0, reward: [{ favour: 1 }, { xp: "enc" }, { fortune: "enc" }, { baopin: 0.25 }, { note: "又与白鹭并肩清了一窝妖物" }] }],
            reply: [["白鹭", "正合我意。"]],
          },
          {
            text: "「打个招呼就走。」",
            effects: [{ fortune: "enc", k: 0.6 }],
            reply: [["白鹭", "走吧走吧。路上看着点脚下，这山里的坑比妖怪多。"]],
          },
        ],
      },
      trade: {
        lines: [["白鹭", "我手里有两枚回春丹，三十灵石，童叟无欺——好吧，对你二十五。"]],
        choices: [
          {
            text: "付 25 灵石，买两枚回春丹",
            need: { stones: 25 },
            effects: [{ pay: 25 }, { item: "huichun_dan", n: 2 }, { favour: 1 }],
            reply: [["白鹭", "爽快。丹是我自己炼的，吃不死人。大概。"]],
          },
          {
            text: "「太贵了，下回吧。」",
            reply: [["白鹭", "抠门。"]],
          },
        ],
      },
    },
  },

  // ======================= 受伤的灵狐 =======================
  fox: {
    name: "受伤的灵狐", glyph: "狐", visual: "fox",
    weight: () => 3,
    start: () => "meet",
    nodes: {
      meet: {
        lines: [
          ["", "草丛里蜷着一只白狐，后腿被生锈的兽夹咬住，灵气正一丝丝外泄。"],
          ["{me}", "（它看我的眼神，跟前世楼下那只总来蹭饭的猫一模一样。）"],
        ],
        choices: [
          {
            text: "喂它一枚回春丹，再拆了兽夹",
            need: { item: "huichun_dan", n: 1 },
            effects: [{ consume: { item: "huichun_dan", n: 1 } }, { lead: "chest_normal", baopin: 0.4 }, { fortune: "enc", k: 1.6 }, { note: "救下一只灵狐，它带你找到一处藏宝" }],
            reply: [["", "白狐舔了舔伤口，冲你叫了一声，一瘸一拐地往林子里跑，走几步就回头看你——像是要你跟上。"]],
          },
          {
            text: "拆了兽夹，放它走",
            effects: [{ fortune: "enc" }, { note: "放走了一只灵狐" }],
            reply: [["", "白狐愣了一下，一溜烟钻进了草丛。你总觉得，这山里有什么东西记住了你。"]],
          },
          {
            text: "（灵狐浑身是宝……）",
            effects: [{ item: "wolf_hide", n: 2 }, { item: "lingbang_zhu", n: 1 }, { fortune: -15 }, { spawn: 4, delay: 1.5 }, { note: "取了灵狐的皮毛——林中传来凄厉狐鸣" }],
            reply: [["", "得手的一刻，林中传来一声凄厉的狐鸣，四下的妖物都被惊动了。"], ["{me}", "（……因果这东西，来得真快。）"]],
          },
        ],
      },
    },
  },

  // ======================= 前辈遗蜕 =======================
  remains: {
    name: "前辈遗蜕", glyph: "蜕", visual: "remains",
    weight: () => 2,
    start: () => "meet",
    nodes: {
      meet: {
        lines: [
          ["", "石龛里盘坐着一具遗蜕，衣袂如新，膝上横着一柄锈剑。石壁上刻着一行字：「有缘者取之，无缘者勿扰。」"],
          ["{me}", "（这算有缘还是无缘？系统也不给个提示……哦，这个世界没有系统。）"],
        ],
        choices: [
          {
            text: "叩拜三下，再取遗物",
            effects: [{ loot: "chest_normal" }, { xp: "enc" }, { baopin: 0.25 }, { note: "拜过前辈遗蜕，取了遗物" }],
            reply: [["", "你叩首三下。遗蜕膝上的锈剑轻轻一颤，剑下压着的布包滑了出来。"]],
          },
          {
            text: "掩埋遗骨，不取一物",
            effects: [{ xp: "enc", k: 2 }, { fortune: "enc", k: 2 }, { note: "掩埋前辈遗骨，心境澄明" }],
            reply: [["", "黄土盖上的一刻，一缕清气没入你的眉心。前辈一生所悟，散作点滴感悟。"]],
          },
          {
            text: "「前辈莫怪，晚辈手头紧。」（搜身）",
            effects: [{ loot: "chest_normal" }, { baopin: 0.5 }, { spawn: 3, elite: !0, delay: 1.2 }, { note: "搜了前辈遗蜕——怨气化作了妖物" }],
            reply: [["", "你刚摸到储物袋，遗蜕里便升起一缕黑气，化作几道妖影扑了出来。"]],
          },
        ],
      },
    },
  },

  // ======================= 灵田：一片野生灵草（无对话，走近有心声；F 逐株采集，走 run 的采集流程与 gather_<kind> 掉落表）=======================
  // 数值：docs/review/numeric/药园与重铸_v1.md。字段沿用委托奇遇组的实现，新增 chance / separate / minRun（见下）：
  //   chance      每局出现概率（按区域）；separate 为真时单独掷、不占每局 0–2 个奇遇名额（抽对话奇遇时请跳过它）；
  //               暂未实现 separate 时按 weight 占名额（兜底）；minRun 第几局起（教学局 = 1），每局至多 1 片
  //   count 株数；kinds 每株的掉落档（loot.js GATHER.lingtian：品质比普通采集点高一档、掉种子概率 +15%，由 recipes.js GARDEN 生成），
  //   所以 seedBonus 置 0（加成已在档里）；ambush 妖兽来袭（chance 概率，at 第几株时 [min, max]，n 只数，elite 是否带精英）
  lingtian: {
    name: "灵田", glyph: "缘", visual: "lingtian", field: !0,
    types: ["lingtian"], altTypes: ["rain", "fox"], // 关卡奇遇点的适配顺序（没有专门标 lingtian 的点时挑开阔的 rain / fox 点）
    chance: { r1: 0.2, r2: 0.25 },
    separate: !0,
    minRun: 3,
    weight: () => 2,
    count: [5, 8],
    radius: 4.2, // 灵草散布半径（米）
    kinds: { r1: GATHER.lingtian.r1, r2: GATHER.lingtian.r2 },
    seedBonus: 0,
    ambush: { chance: 0.4, at: [3, 5], n: 3, elite: !1 },
    thought: "（好一片灵田……这里灵气竟如此浓郁。）",
    ambushText: "灵气惊动了林中的妖兽！",
    done: [{ xp: "enc" }, { fortune: "enc", k: 0.5 }, { note: "采尽了一片野生灵田" }],
  },

  // ======================= 灵雨 =======================
  rain: {
    name: "灵雨", glyph: "雨", visual: "rain",
    weight: () => 2,
    start: () => "meet",
    nodes: {
      meet: {
        lines: [["", "天色骤暗，一片灵雨只落在这方圆数丈之内，雨丝里浮着细碎的金光。"], ["{me}", "（局部降雨，精准到这个程度……天道的天气预报比前世准多了。）"]],
        choices: [
          {
            text: "就地盘膝，吐纳灵雨（在雨中静坐 8 息）",
            effects: [{ meditate: 8, k: 2 }, { fortune: "enc" }, { spawn: 3, delay: 3 }],
            reply: [["", "灵气顺着雨丝涌入经脉——但这股灵气，妖物也闻得到。"]],
          },
          {
            text: "取出玉瓶，接一瓶雨水",
            effects: [{ item: "ninglu_hua", n: 2, region: "r1" }, { item: "hanlu_cao", n: 2, region: "r2" }, { heal: 1 }, { note: "接了一瓶灵雨" }],
            reply: [["", "雨水在瓶中打着旋，竟凝出几株带露的灵草。顺手洗了把脸，浑身一轻。"]],
          },
          {
            text: "不贪，离开",
            effects: [{ fortune: "enc", k: 0.4 }],
            reply: [["{me}", "（下雨天不打伞会感冒——前世血的教训。）"]],
          },
        ],
      },
    },
  },
};
