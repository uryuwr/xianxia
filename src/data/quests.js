// 出行委托（模块 E）：出行准备时给 3 个委托，接 1–2 个；只在撤离成功时交付奖励（玩法评审 G7）。
// 解释与运行时见 src/game/quests/index.js。
//
// 模板字段：
//   id, group 类别（"combat" 斩妖 | "gather" 采集 / 寻物 | "route" 路线 / 撤离）——同一批委托不会全是同一类
//   title / desc  文案，{n} {v} {pct} {name} {boss} 由参数替换
//   objective     { type, ... } 见下
//   params        参数取值范围 [min, max]（按境界 layer 0~9 线性插值，再在区间内随机）
//   reward        主奖励按数值评审（QUEST_RULES.reward）：每个委托抽一种——修为 50% / 机缘 25% / 灵石 25%（同一委托固定）；
//                 模板里只写附带的小物件 { items: [{ id, n } | { pool, n }], favour 白鹭好感, primary 指定主奖励类型 }，pool 按本局区域取材料
//   req(profile)  可选：出现条件；region 可选：只在该区域有效（"r2"），默认任意区域
//
// objective.type：
//   kill          击杀 n 只（filter："any" 普通妖物 | "elite" 精英 | kinds 指定种类前缀）
//   boss_nopill   不服丹药击败本区域首领（开局到击杀之间丹药栏数量不能减少）
//   gather        采集 n 次（gather:done）；items 指定时只数这些灵草的株数
//   retrieve      走到某个遗府 / 灵光点取得委托遗物，带着它撤离
//   carry         撤离时储物袋灵值 ≥ v（竹海·溪谷 ×3）
//   explore       天机镜本局新着墨 ≥ pct%
//   night         入夜（第四时段）后撤离
//   via_ruin      从残阵撤离

export const QUEST_TEMPLATES = [
  // ---------------- 斩妖 ----------------
  {
    id: "hunt", group: "combat", title: "斩妖除害", desc: "山脚猎户托付：斩杀妖物 {n} 只。",
    objective: { type: "kill", filter: "any" }, params: { n: [8, 14] },
    reward: { items: [{ pool: "common", n: 2 }] },
  },
  {
    id: "hunt_wolf", group: "combat", title: "猎狼", desc: "药铺高价收狼牙：斩杀狼妖 {n} 只（狼妖头目也算）。",
    objective: { type: "kill", kinds: ["wolf"] }, params: { n: [5, 8] },
    reward: { items: [{ id: "wolf_fang", n: 3 }] },
  },
  {
    id: "hunt_vine", group: "combat", region: "r2", title: "伐藤", desc: "溪谷村落苦藤妖久矣：斩杀藤妖 {n} 只。", req: (P) => !!(P.unlocks && P.unlocks.region2),
    objective: { type: "kill", kinds: ["vine"] }, params: { n: [4, 7] },
    reward: { items: [{ id: "vine_heart", n: 2 }] },
  },
  {
    id: "elite", group: "combat", title: "擒贼擒王", desc: "斩杀妖群头目 {n} 只。",
    objective: { type: "kill", filter: "elite" }, params: { n: [1, 2] },
    reward: { items: [{ pool: "core", n: 1 }] },
  },
  {
    id: "boss_nopill", group: "combat", title: "不假外物", desc: "不服丹药，击败本区域首领（{boss}）。", req: (P) => (P.realm && P.realm.stage >= 1 && P.realm.layer >= 3) || (P.realm && P.realm.stage >= 2),
    objective: { type: "boss_nopill" }, params: {},
    reward: { items: [{ id: "danfang_page", n: 2 }] },
  },
  // ---------------- 采集 / 寻物 ----------------
  {
    id: "gather", group: "gather", title: "采药", desc: "替山下药铺采集灵草 / 矿石 {n} 处。",
    objective: { type: "gather" }, params: { n: [3, 5] },
    reward: { items: [{ id: "danfang_page", n: 1 }] },
  },
  {
    id: "gather_dew", group: "gather", title: "晨露", desc: "采得凝露花或寒露草 {n} 株（清晨开得最多）。",
    objective: { type: "gather", items: ["ninglu_hua", "hanlu_cao"] }, params: { n: [2, 4] },
    reward: { items: [{ pool: "seed", n: 1 }] },
  },
  {
    id: "retrieve", group: "gather", title: "故人遗物", desc: "一位老散修托你寻回他遗落在{place}的「{relic}」，带着它撤离即可。",
    objective: { type: "retrieve" }, params: {},
    reward: { items: [{ id: "danfang_page", n: 1 }] },
  },
  // ---------------- 路线 / 撤离 ----------------
  {
    id: "carry", group: "route", title: "满载而归", desc: "撤离时储物袋灵值不少于 {v}（竹海·溪谷 ×3）。",
    objective: { type: "carry" }, params: { v: [120, 260] },
    reward: {},
  },
  {
    id: "explore", group: "route", title: "踏勘山川", desc: "本局让天机镜再着墨 {pct}%。",
    objective: { type: "explore" }, params: { pct: [10, 18] },
    reward: {},
  },
  {
    id: "night", group: "route", title: "夜行人", desc: "入夜之后再撤离（夜里妖潮更凶，宝箱更好）。",
    objective: { type: "night" }, params: {},
    reward: {},
  },
  {
    id: "via_ruin", group: "route", title: "借阵而出", desc: "从残阵撤离（先走近确认残阵真假）。",
    objective: { type: "via_ruin" }, params: {},
    reward: { items: [{ id: "dundi_fu", n: 1 }] },
  },
  // ---------------- 白鹭所托（初遇白鹭之后出现）----------------
  {
    id: "bailu_errand", group: "combat", title: "白鹭所托", desc: "白鹭托你：「替我教训一只妖群头目，回头请你喝酒——灵泉水也算酒。」",
    req: (P) => !!(P.flags && P.flags.bailu && P.flags.bailu.stage >= 1), weight: 2,
    objective: { type: "kill", filter: "elite" }, params: { n: [1, 1] },
    reward: { items: [{ id: "huqi_fu", n: 1 }], favour: 2 },
  },
];

// 按区域取的材料池（奖励里的 { pool }）
export const REWARD_POOLS = {
  common: { r1: ["qingling_cao", "tiejing_shi", "wolf_hide", "ling_tu"], r2: ["hanlu_cao", "bat_wing", "ling_si", "vine_heart"] },
  core: { r1: ["wolf_core"], r2: ["vine_core", "bat_core"] },
  seed: { r1: ["seed_qingling", "seed_ninglu"], r2: ["seed_hanlu", "seed_ziteng"] },
};

// 寻物委托的遗物：剧情物品，占 1 格、无灵值；结算时由委托收走
export const QUEST_ITEMS = [
  { id: "q_relic_pipe", name: "旧烟杆", glyph: "杆", cat: "quest", quest: !0, size: 1, value: 0, desc: "老散修的烟杆，杆身刻着「莫问」二字。委托物，撤离后交还。" },
  { id: "q_relic_jade", name: "半块玉牌", glyph: "牌", cat: "quest", quest: !0, size: 1, value: 0, desc: "断成两截的宗门玉牌。委托物，撤离后交还。" },
  { id: "q_relic_letter", name: "未寄出的信", glyph: "信", cat: "quest", quest: !0, size: 1, value: 0, desc: "信封上写着「吾妻亲启」。委托物，撤离后交还。" },
];
export const RELIC_PLACES = { ruins: "遗府", glows: "灵光点", chests: "旧宝箱旁", spawns: "妖物出没处" };

// 数值评审 G7（docs/review/numeric/numeric_proposal.json）：第 5 局起，3 选 1–2；只在撤离成功时发奖
export const QUEST_RULES = {
  fromRun: 5,
  offerCount: 3,
  maxAccept: 2,
  retrieveRadius: 3,
  reward: { mix: { xp: 0.5, fortune: 0.25, stones: 0.25 }, xp: { r1: 40, r2: 100 }, fortune: 12, stones: { r1: 30, r2: 60 } },
};
