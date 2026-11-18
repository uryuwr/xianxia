// 炼器 v2 示意图公用数据与逻辑（只给 docs/ui/v2/forge_v2/*.html 用，不是游戏代码）
// 数据照抄 src/data/recipes.js（FORGE / REFORGE / FACILITIES.forge）、src/data/items_db.js、src/data/loot.js（AFFIXES、来源）、
// src/game/loot.js（gearBase：品质每档 +15%；rollAffixes：词条数 灵1 宝2 仙3+心法）、src/game/cave/facilities.js（forgeCraft 品质规则）。
// 普通脚本（不是 ES module），file:// 直接打开就能用；依赖 inkicons.classic.js。
(function () {
  const RAR = [
    { id: 0, name: "凡品", s: "凡", color: "#6a6760" },
    { id: 1, name: "灵品", s: "灵", color: "#3fae7a" },
    { id: 2, name: "宝品", s: "宝", color: "#2f7fa8" },
    { id: 3, name: "仙品", s: "仙", color: "#c9a040" },
    { id: 4, name: "极品", s: "极", color: "#d2321e" },
  ];
  const STAT = { atk: "攻击", spell: "法力", crit: "暴击率", hp: "气血", def: "防御", mpRegen: "真气回复", cdr: "冷却缩减", metal: "金行", wood: "木行", water: "水行", fire: "火行", earth: "土行", extractTime: "撤离读条", bagCells: "储物袋格", mp: "真气", sense: "神识", aspd: "攻速", momGain: "气势获取", chargeDmg: "蓄势斩伤害", dashCdr: "闪身冷却缩减" };
  const PCT = new Set(["spell", "crit", "cdr", "extractTime", "aspd", "momGain", "chargeDmg", "dashCdr"]);
  const EL = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };

  // 物品：名 / 代表字 / 何处可得（来自 loot.js 的区域材料池、妖兽掉落、灵光点、宝箱）
  const ITEM = {
    spirit_stone: { name: "灵石", g: "石", src: ["出行带回；仓库化灵"] },
    tiejing_shi: { name: "铁精石", g: "铁", src: ["青岚山外 · 矿脉采集（常见）", "山神庙石傀掉落"] },
    wolf_fang: { name: "狼妖牙", g: "牙", src: ["青岚山外 · 狼妖 / 灰狼掉落", "狼窝首领首杀必得 3–4"] },
    wolf_hide: { name: "狼皮", g: "皮", src: ["青岚山外 · 狼妖掉落", "竹海·溪谷 · 狼妖掉落"] },
    ling_yu: { name: "灵玉", g: "玉", src: ["青岚山外 · 灵光点（每处 2–3 块）"] },
    wolf_core: { name: "狼妖内丹", g: "丹", src: ["青岚山外 · 精英狼妖"] },
    ling_tu: { name: "灵土", g: "土", src: ["青岚山外 · 土色发亮的灵土坡", "宝箱里也常见"] },
    qingling_cao: { name: "青灵草", g: "青", src: ["两区采集点；药园"] },
    ninglu_hua: { name: "凝露花", g: "露", src: ["青岚山外 · 采集；药园"] },
    chiyan_guo: { name: "赤炎果", g: "果", src: ["竹海·溪谷 · 采集；药园"] },
    lingbang_zhu: { name: "灵蚌珠", g: "珠", src: ["青岚山外 · 溪中灵蚌、灵光点"] },
    stone_heart: { name: "石傀心", g: "核", src: ["山神庙 · 石傀掉落"] },
    bat_wing: { name: "蝠翼", g: "翼", src: ["竹海·溪谷 · 蝠妖掉落（练气五层可往）"] },
    vine_heart: { name: "藤心", g: "心", src: ["竹海·溪谷 · 藤妖掉落"] },
    ling_si: { name: "灵丝", g: "丝", src: ["竹海·溪谷 · 藤妖掉落、采集"] },
    zi_teng: { name: "紫藤", g: "藤", src: ["竹海·溪谷 · 采集；药园"] },
    water_jade: { name: "水灵玉", g: "玉", src: ["竹海·溪谷 · 瀑布下灵光点"] },
    bat_core: { name: "蝠妖内丹", g: "丹", src: ["竹海·溪谷 · 精英蝠妖"] },
    python_skin: { name: "蟒皮", g: "蟒", src: ["竹海·溪谷 · 水蟒蜕皮"] },
    jinnang_qiankun: { name: "乾坤锦囊", g: "囊", src: ["碧鳞水蟒首杀必得"] },
    qifang_robe: { name: "器方《法衣》", g: "器", src: ["青岚山外 · 山神庙地窖（首探必得）"] },
    // 成品
    sword_qingfeng: { name: "青锋剑", g: "剑", slot: "sword", stat: [["atk", 2.5, 6]], desc: "青岚山外剑冢所出，剑身有一线青芒。" },
    sword_zhuying: { name: "竹影剑", g: "剑", slot: "sword", stat: [["atk", 2.5, 8], ["crit", 0, 0.02]], desc: "竹海深处的竹精铁所铸，剑影如竹。" },
    robe_bu: { name: "布法衣", g: "衣", slot: "robe", stat: [["hp", 12, 20], ["def", 1, 3]], desc: "麻布上绣了避尘纹，聊胜于无。" },
    robe_lingsi: { name: "灵丝法衣", g: "衣", slot: "robe", stat: [["hp", 12, 30], ["def", 1, 4]], desc: "藤妖灵丝织就，轻若无物。" },
    jade_qing: { name: "青玉佩", g: "佩", slot: "jade", stat: [["mp", 6, 10]], desc: "一块青玉，养气宁神。" },
    jade_shuiling: { name: "水灵佩", g: "佩", slot: "jade", stat: [["mp", 6, 15], ["mpRegen", 0, 0.5]], desc: "瀑下水灵玉所琢，真气生生不息。" },
    dundi_fu: { name: "遁地符", g: "遁", desc: "撕开即遁入地下，脱离缠斗。" },
    fu_metal: { name: "金符", g: "金", desc: "破金盾；对木属妖兽伤害加成。" },
    fu_wood: { name: "木符", g: "木", desc: "破木盾；对土属妖兽伤害加成。" },
    fu_water: { name: "水符", g: "水", desc: "破水盾；对火属妖兽伤害加成。" },
    fu_fire: { name: "火符", g: "火", desc: "破火盾；对金属妖兽伤害加成。" },
    fu_earth: { name: "土符", g: "土", desc: "破土盾；对水属妖兽伤害加成。" },
    huqi_fu: { name: "护器符", g: "护", desc: "身陨时护住一件未认主的法器不落。" },
  };

  // 器方（照 recipes.js FORGE）
  const RECIPES = [
    { id: "sword", kind: "gear", out: "sword_qingfeng", inputs: { tiejing_shi: 3, wolf_fang: 2 }, stones: 20 },
    { id: "robe", kind: "gear", out: "robe_bu", inputs: { wolf_hide: 3, qingling_cao: 2 }, stones: 20, recipe: "qifang_robe" },
    { id: "jade", kind: "gear", out: "jade_qing", inputs: { ling_yu: 2, wolf_core: 1 }, stones: 40, realm: 5 },
    { id: "sword2", kind: "gear", out: "sword_zhuying", inputs: { tiejing_shi: 4, bat_wing: 2, vine_heart: 1 }, stones: 60, realm: 5 },
    { id: "robe2", kind: "gear", out: "robe_lingsi", inputs: { bat_wing: 3, zi_teng: 1, ling_si: 2 }, stones: 60, recipe: "qifang_robe", realm: 5 },
    { id: "jade2", kind: "gear", out: "jade_shuiling", inputs: { water_jade: 1, bat_core: 1 }, stones: 80, realm: 5 },
    { id: "dundi", kind: "item", out: "dundi_fu", n: 2, inputs: { ninglu_hua: 1 }, stones: 10 },
    { id: "fu_metal", kind: "item", out: "fu_metal", n: 3, inputs: { tiejing_shi: 1, ninglu_hua: 1 }, stones: 10 },
    { id: "fu_wood", kind: "item", out: "fu_wood", n: 3, inputs: { qingling_cao: 2, ninglu_hua: 1 }, stones: 10 },
    { id: "fu_water", kind: "item", out: "fu_water", n: 3, inputs: { ninglu_hua: 2 }, stones: 10 },
    { id: "fu_fire", kind: "item", out: "fu_fire", n: 3, inputs: { chiyan_guo: 1, ninglu_hua: 1 }, stones: 10 },
    { id: "fu_earth", kind: "item", out: "fu_earth", n: 3, inputs: { ling_tu: 2, ninglu_hua: 1 }, stones: 10 },
    { id: "huqi", kind: "item", out: "huqi_fu", n: 1, inputs: { wolf_hide: 2 }, stones: 25, flag: "region2" },
    { id: "bag24", kind: "upgrade", name: "兽皮储物袋", icon: "bag_hide", target: "bag", value: 24, needs: 16, inputs: { wolf_hide: 6, ling_tu: 2 }, stones: 80, realm: 3 },
    { id: "bag32", kind: "upgrade", name: "蟒皮乾坤袋", icon: "bag_python", target: "bag", value: 32, needs: 24, inputs: { python_skin: 2, ling_si: 4 }, stones: 150, realm: 7 },
    { id: "pouch2", kind: "upgrade", name: "灵蚌锦囊", icon: "pouch_bang", target: "pouch", value: 2, needs: 1, inputs: { wolf_hide: 2, lingbang_zhu: 1 }, stones: 60, realm: 4 },
    { id: "pouch3", kind: "upgrade", name: "乾坤锦囊", icon: "jinnang_qiankun", target: "pouch", value: 3, needs: 2, inputs: { jinnang_qiankun: 1 }, stones: 0 },
    { id: "pill_cap", kind: "upgrade", name: "丹药囊扩容", icon: "pill_bag", target: "pillCap", value: 1, inputs: { wolf_hide: 4 }, stones: 80, max: 2 },
    { id: "imbue_metal", kind: "imbue", el: "metal", inputs: { tiejing_shi: 4, wolf_fang: 2 }, stones: 60 },
    { id: "imbue_wood", kind: "imbue", el: "wood", inputs: { qingling_cao: 5, wolf_core: 1 }, stones: 60 },
    { id: "imbue_water", kind: "imbue", el: "water", inputs: { ninglu_hua: 5, lingbang_zhu: 1 }, stones: 60 },
    { id: "imbue_fire", kind: "imbue", el: "fire", inputs: { chiyan_guo: 3, bat_core: 1 }, stones: 80 },
    { id: "imbue_earth", kind: "imbue", el: "earth", inputs: { ling_tu: 4, stone_heart: 2 }, stones: 60 },
  ];
  const CATS = [["gear", "装备"], ["item", "符箓"], ["upgrade", "扩容"], ["imbue", "附灵"], ["reforge", "重铸"], ["bind", "认主"]];
  const IMBUE_DESC = { metal: "普攻带金气：破甲", wood: "普攻带木气：缠缚", water: "普攻带水气：迟滞", fire: "普攻带火气：灼烧", earth: "普攻带土气：震退" };

  // 炼器鼎升级（FACILITIES.forge）与各阶效果（facilities.js：品质下限 = 鼎阶 − 1；认主要二阶；极品重铸要二阶）
  const FORGE_FAC = {
    lv: ["未修复", "一阶", "二阶"],
    cost: [{ stones: 60, items: { furnace_part: 1 } }, { stones: 180, items: { bat_wing: 6, water_jade: 1 }, relocate: !0 }],
    effect: [
      null,
      ["炼器、符箓、扩容、附灵、重铸（灵 / 宝 / 仙品）", "炼成品质下限：凡品"],
      ["炼成品质下限：灵品（凡品主材也出灵品）", "解锁 · 滴血认主", "解锁 · 极品装备重铸"],
    ],
  };
  // 重铸（REFORGE）
  const REFORGE = { stones: [null, 30, 80, 200, 500], items: [null, { tiejing_shi: 1 }, { tiejing_shi: 2, ling_yu: 1 }, { ling_yu: 2, stone_heart: 1 }, { ling_yu: 3, water_jade: 1 }], growth: 1.15, maxMul: 4, specialMul: 2 };
  // 词条池（loot.js AFFIXES：[属性, 类型, 三档值, 适用部位, 受区域系数]）
  const AFFIXES = [
    ["atk", "flat", [3, 6, 10], ["sword", "jade"], 1], ["spell", "pct", [0.06, 0.1, 0.15], ["sword", "jade"], 0], ["hp", "flat", [30, 60, 100], ["robe", "jade"], 1],
    ["def", "flat", [4, 8, 12], ["robe"], 1], ["crit", "flat", [0.03, 0.05, 0.08], ["sword", "jade"], 0], ["cdr", "flat", [0.04, 0.06, 0.1], ["jade"], 0],
    ["element", "flat", [10, 20, 35], ["sword", "robe", "jade"], 0], ["mpRegen", "flat", [1, 2, 3], ["robe", "jade"], 0], ["extractTime", "pct", [-0.1, -0.15, -0.25], ["robe"], 0],
    ["bagCells", "flat", [2, 3, 4], ["jade"], 0], ["aspd", "pct", [0.04, 0.06, 0.09], ["sword", "jade"], 0], ["momGain", "flat", [0.1, 0.15, 0.22], ["sword"], 0],
    ["chargeDmg", "flat", [0.1, 0.16, 0.25], ["sword", "jade"], 0], ["dashCdr", "flat", [0.06, 0.1, 0.15], ["robe", "jade"], 0], ["sense", "flat", [8, 12, 20], ["jade"], 0],
  ];
  const SPECIAL = ["闪身留剑影", "暴击引雷", "锋锐", "金刚体", "满势疾攻", "蓄势斩余波", "蓄势斩回锋", "流云身法"];

  // ---------------- 示意存档（练气五层、仍在青岚山外、炼器鼎一阶、灵石 260） ----------------
  function fresh() {
    return {
      realm: 5, realmName: "练气五层", level: 5, region: "r1", forgeLv: 1, relocated: !1,
      bag: 16, pouch: 1, pillCap: 3, pillUps: 0,
      recipesKnown: {}, flags: {},
      // 库存：每种材料按品级 [凡, 灵, 宝, 仙, 极] 记数
      stock: {
        spirit_stone: [260], tiejing_shi: [2, 3, 1, 0, 0], wolf_fang: [3], wolf_hide: [5], ling_yu: [1, 0, 0, 0, 0], wolf_core: [2], ling_tu: [3],
        qingling_cao: [6, 2], ninglu_hua: [4, 1], chiyan_guo: [0], lingbang_zhu: [0, 1], stone_heart: [1],
        bat_wing: [0], vine_heart: [0], ling_si: [0], zi_teng: [0], water_jade: [0], bat_core: [0], python_skin: [0], jinnang_qiankun: [0],
        dundi_fu: [2], fu_metal: [0], fu_wood: [3], fu_water: [0], fu_fire: [0], fu_earth: [0], huqi_fu: [0],
      },
      // 装备（身上 + 仓库）
      gear: [
        { uid: "g1", id: "sword_qingfeng", rarity: 2, level: 5, worn: !0, reforged: 1, bound: !1, affixes: [{ stat: "spell", v: 0.114 }, { stat: "fire", v: 23 }, { stat: "imbue", el: "fire" }] },
        { uid: "g2", id: "robe_bu", rarity: 1, level: 4, worn: !0, reforged: 0, affixes: [{ stat: "hp", v: 34 }] },
        { uid: "g3", id: "jade_qing", rarity: 1, level: 5, worn: !0, reforged: 0, affixes: [{ stat: "sense", v: 9 }] },
        { uid: "g4", id: "sword_qingfeng", rarity: 1, level: 3, worn: !1, reforged: 0, affixes: [{ stat: "crit", v: 0.032 }] },
        { uid: "g5", id: "robe_bu", rarity: 3, level: 5, worn: !1, reforged: 3, affixes: [{ stat: "def", v: 13 }, { stat: "hp", v: 98 }, { stat: "extractTime", v: -0.22 }, { special: "金刚体" }] },
      ],
      pins: {},
    };
  }
  let S = fresh();

  const has = (id, r) => { const a = S.stock[id] || [0]; return r == null ? a.reduce((x, y) => x + (y || 0), 0) : a[r] || 0; };
  const take = (id, n, r) => {
    const a = (S.stock[id] ||= [0, 0, 0, 0, 0]);
    if (r != null) return void (a[r] = (a[r] || 0) - n);
    for (let q = 4; q >= 0 && n > 0; q--) { const t = Math.min(a[q] || 0, n); a[q] = (a[q] || 0) - t; n -= t; }
  };
  const give = (id, n, r = 0) => { const a = (S.stock[id] ||= [0, 0, 0, 0, 0]); a[r] = (a[r] || 0) + n; };
  const name = (id) => (ITEM[id] || {}).name || id;
  const rname = (r) => (r.kind === "gear" || r.kind === "item" ? name(r.out) : r.kind === "imbue" ? "附灵 · " + EL[r.el] : r.name);
  const icon = (r) => (r.kind === "gear" || r.kind === "item" ? r.out : r.kind === "imbue" ? "fu_" + r.el : r.icon);
  const mainOf = (r) => Object.keys(r.inputs || {})[0];

  // 每条器方的状态：ok / 锁定原因 / 缺的材料
  function check(r, opt = {}) {
    const lock = (why, how) => ({ ok: !1, lock: !0, why, how });
    if (S.forgeLv < 1) return lock("炼器鼎尚未修复", "区域一灵光点里找炼器鼎残件");
    if (r.recipe && !S.recipesKnown[r.recipe]) return lock("尚无器方", ITEM[r.recipe].src[0] + " · " + name(r.recipe));
    if (r.realm && S.realm < r.realm) return lock("境界不足", `需练气${"〇一二三四五六七八九"[r.realm]}层`);
    if (r.flag === "region2" && !S.flags.region2) return lock("尚未解锁", "进入竹海·溪谷后解锁");
    if (r.kind === "upgrade") {
      const cur = r.target === "bag" ? S.bag : r.target === "pouch" ? S.pouch : null;
      if (cur != null && cur >= r.value) return { ok: !1, done: !0, why: "已拥有" };
      if (cur != null && r.needs && cur < r.needs) return lock(r.target === "bag" ? "需先炼成上一级储物袋" : "需先炼成上一级锦囊", "");
      if (r.target === "pillCap" && S.pillUps >= r.max) return { ok: !1, done: !0, why: "已达上限" };
    }
    const lack = [];
    for (const [id, n] of Object.entries(r.inputs || {})) {
      const mq = opt.q != null && id === mainOf(r) && r.kind === "gear" ? opt.q : null;
      const h = has(id, mq);
      if (h < n) lack.push({ id, need: n, have: h, q: mq });
    }
    if (has("spirit_stone") < r.stones) lack.push({ id: "spirit_stone", need: r.stones, have: has("spirit_stone") });
    if (lack.length) return { ok: !1, why: "材料不足", lack };
    return { ok: !0 };
  }
  // 材料行（给 UI 用）
  function inputs(r, q) {
    const out = Object.entries(r.inputs || {}).map(([id, n], i) => {
      const mq = i === 0 && r.kind === "gear" ? q : null;
      return { id, name: name(id), need: n, have: has(id, mq), main: i === 0 && r.kind === "gear", q: mq, src: (ITEM[id] || {}).src || [] };
    });
    if (r.stones) out.push({ id: "spirit_stone", name: "灵石", need: r.stones, have: has("spirit_stone"), stone: !0, src: [] });
    return out;
  }

  // ---------------- 装备：品质范围与属性预览（facilities.js forgeCraft + loot.js gearBase / rollAffixes） ----------------
  // 主材品质定上限，炼器鼎阶定下限（鼎阶 − 1），25% 再升一品；炼器最高出仙品
  function dist(mainQ) {
    const floor = S.forgeLv - 1;
    const base = Math.max(floor, Math.min(3, mainQ));
    const up = Math.min(3, base + 1);
    const d = [0, 0, 0, 0, 0];
    if (up === base) d[base] = 1;
    else (d[base] = 0.75), (d[up] = 0.25);
    return d;
  }
  function baseStats(id, level, rarity) {
    return (ITEM[id].stat || []).map(([stat, per, v0]) => {
      let v = (v0 + per * (level - 1)) * (1 + 0.15 * rarity);
      v = Math.abs(v0) < 1 && per < 1 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
      return { stat, v };
    });
  }
  const affixN = (r) => [0, 1, 2, 3, 3][r];
  function fmt(stat, v) {
    if (stat === "imbue") return "";
    const pct = PCT.has(stat) || (Math.abs(v) < 1 && v !== 0);
    const s = pct ? (Math.round(v * 1000) / 10).toString() + "%" : Math.round(v * 10) / 10;
    return (v >= 0 ? "+" : "") + s;
  }
  function affixLabel(a) {
    if (a.special) return { k: "◆ 心法", v: a.special, sp: !0 };
    if (a.stat === "imbue") return { k: "附灵", v: EL[a.el], lock: !0 };
    return { k: STAT[a.stat] || a.stat, v: fmt(a.stat, a.v) };
  }
  // 身上同部位的装备（比较用）
  const worn = (slot) => S.gear.find((g) => g.worn && ITEM[g.id].slot === slot);

  function rollAffix(slot, rarity, level, exclude) {
    const coef = level >= 10 ? 2.4 : level >= 5 ? 1.6 : 1, tier = Math.max(0, Math.min(2, rarity - 1));
    const pool = AFFIXES.filter((a) => a[3].includes(slot) && !exclude.has(a[0]));
    const [stat, , vals, , scale] = pool[Math.floor(Math.random() * pool.length)];
    let v = vals[tier] * (0.85 + Math.random() * 0.3) * (scale ? coef : 1);
    v = Math.abs(vals[tier]) < 1 ? Math.round(v * 1000) / 1000 : Math.max(1, Math.round(v));
    if (stat === "element") { const els = Object.keys(EL).filter((e) => !exclude.has(e)); return { stat: els[Math.floor(Math.random() * els.length)], v }; }
    return { stat, v };
  }
  // 炼制（装备）：按品质分布掷一次
  function craft(r, q) {
    const c = check(r, { q });
    if (!c.ok) return { ok: !1, why: c.why };
    const main = mainOf(r);
    for (const [id, n] of Object.entries(r.inputs)) take(id, n, id === main && r.kind === "gear" ? q : null);
    take("spirit_stone", r.stones);
    if (r.kind === "gear") {
      const d = dist(q);
      let x = Math.random(), rar = 0;
      for (let i = 0; i < 5; i++) if ((x -= d[i]) < 0) { rar = i; break; }
      const slot = ITEM[r.out].slot, ex = new Set(), aff = [];
      for (let i = 0; i < affixN(rar); i++) { const a = rollAffix(slot, rar, S.level, ex); ex.add(a.stat); aff.push(a); }
      if (rar >= 3) aff.push({ special: SPECIAL[Math.floor(Math.random() * SPECIAL.length)] });
      const g = { uid: "n" + Date.now(), id: r.out, rarity: rar, level: S.level, worn: !1, reforged: 0, affixes: aff, fresh: !0 };
      S.gear.push(g);
      return { ok: !0, gear: g, rarity: rar, up: rar > Math.max(S.forgeLv - 1, Math.min(3, q)) };
    }
    if (r.kind === "item") return give(r.out, r.n), { ok: !0, item: r.out, n: r.n, rarity: 0 };
    if (r.kind === "upgrade") {
      if (r.target === "bag") S.bag = r.value; else if (r.target === "pouch") S.pouch = r.value; else (S.pillCap += 1), S.pillUps++;
      return { ok: !0, upgrade: r.target, rarity: 0 };
    }
    if (r.kind === "imbue") {
      const sw = S.gear.find((g) => g.worn && ITEM[g.id].slot === "sword");
      const old = sw.affixes.find((a) => a.stat === "imbue");
      sw.affixes = sw.affixes.filter((a) => a.stat !== "imbue");
      sw.affixes.push({ stat: "imbue", el: r.el });
      return { ok: !0, imbue: r.el, old: old && old.el, rarity: sw.rarity };
    }
  }
  // 升级说明（扩容）
  function upgradeLine(r) {
    if (r.target === "bag") return { from: S.bag, to: r.value, unit: "格", what: "储物袋" };
    if (r.target === "pouch") return { from: S.pouch, to: r.value, unit: "格", what: "贴身锦囊" };
    return { from: S.pillCap, to: S.pillCap + 1, unit: "枚 / 栏", what: "丹药囊", extra: `已扩 ${S.pillUps} / ${r.max}` };
  }

  // ---------------- 重铸 ----------------
  const reforgeables = () => S.gear.filter((g) => g.rarity >= 1 && g.affixes.some((a) => a.stat !== "imbue" || !0));
  function reforgeCost(g, a) {
    let st = REFORGE.stones[g.rarity] * Math.min(Math.pow(REFORGE.growth, g.reforged || 0), REFORGE.maxMul);
    if (a && a.special) st *= REFORGE.specialMul;
    return { stones: Math.ceil(st), items: Object.entries(REFORGE.items[g.rarity] || {}).map(([id, n]) => ({ id, name: name(id), n, have: has(id) })) };
  }
  function canReforge(g, idx) {
    if (g.rarity >= 4 && S.forgeLv < 2) return { ok: !1, why: "极品重铸要二阶炼器鼎" };
    const a = g.affixes[idx];
    if (!a) return { ok: !1, why: "先点选一条词条" };
    if (a.stat === "imbue") return { ok: !1, why: "附灵词条请走「附灵」" };
    const c = reforgeCost(g, a);
    if (has("spirit_stone") < c.stones) return { ok: !1, why: `灵石不足（需 ${c.stones}）`, c };
    const l = c.items.find((x) => x.have < x.n);
    if (l) return { ok: !1, why: `${l.name}不足（需 ${l.n}）`, c };
    return { ok: !0, c };
  }
  function reforgeRoll(g, idx) {
    const k = canReforge(g, idx);
    if (!k.ok) return k;
    take("spirit_stone", k.c.stones);
    for (const x of k.c.items) take(x.id, x.n);
    g.reforged = (g.reforged || 0) + 1;
    const old = g.affixes[idx];
    let neo;
    if (old.special) { const pool = SPECIAL.filter((s) => s !== old.special); neo = { special: pool[Math.floor(Math.random() * pool.length)] }; }
    else neo = rollAffix(ITEM[g.id].slot, g.rarity, g.level, new Set(g.affixes.map((a) => a.stat).filter(Boolean)));
    return { ok: !0, old, neo, cost: k.c };
  }
  // 该部位、该品级的词条池（"可能掷出"提示用）
  function affixPool(g, idx) {
    const a = g.affixes[idx];
    if (!a) return [];
    if (a.special) return SPECIAL.filter((s) => s !== a.special);
    const ex = new Set(g.affixes.map((x) => x.stat).filter(Boolean));
    const tier = Math.max(0, Math.min(2, g.rarity - 1)), coef = g.level >= 10 ? 2.4 : g.level >= 5 ? 1.6 : 1;
    return AFFIXES.filter((x) => x[3].includes(ITEM[g.id].slot) && !ex.has(x[0])).map((x) => {
      const v0 = x[2][tier] * (x[4] ? coef : 1);
      const lab = x[0] === "element" ? "五行亲和" : STAT[x[0]];
      return lab + " " + fmt(x[0], v0 * 0.85).replace("+", "") + "–" + fmt(x[0], v0 * 1.15).replace("+", "").replace("-", "");
    });
  }

  // ---------------- 图标 ----------------
  const cache = {};
  function iconURL(id, box = "1x1") {
    const k = id + "@" + box;
    if (cache[k]) return cache[k];
    const [w, h] = box.split("x").map(Number);
    try {
      return (cache[k] = window.InkIcons.renderCanvas(id, 128 * w, 128 * h, 1.5).toDataURL());
    } catch (e) {
      return (cache[k] = "");
    }
  }
  // 物品签 HTML
  function tok(id, o = {}) {
    const q = o.q ?? 0, s = o.s || 56;
    const url = iconURL(id, o.box);
    const img = url ? `<img class="ico" src="${url}" alt="${name(id)}">` : `<b style="font:${Math.round(s * 0.42)}px var(--f-display);color:var(--ink-nong)">${(ITEM[id] || {}).g || "?"}</b>`;
    const cs = q >= 3 ? `<i class="cs">${RAR[q].s}</i>` : "";
    return `<span class="tk q${q} ${o.cls || ""} e${(o.e || (id.length % 3)) + 1}" style="--s:${s}px" title="${name(id)}">${img}${o.n != null ? `<em>${o.n}</em>` : ""}${cs}</span>`;
  }

  // ---------------- 盖印动效：在 host 的 (x, y) 处溅墨 + 落印 + 品质晕开 ----------------
  function stamp(host, x, y, o = {}) {
    let L = host.querySelector(":scope > .stamp-layer");
    if (!L) host.insertAdjacentHTML("beforeend", '<div class="stamp-layer"></div>'), (L = host.querySelector(":scope > .stamp-layer"));
    L.innerHTML = "";
    const q = o.q ?? 0;
    L.insertAdjacentHTML("beforeend", `<i class="splat" style="left:${x}px;top:${y}px"></i>`);
    if (o.bloom !== !1) L.insertAdjacentHTML("beforeend", `<i class="bloom q${q}" style="left:${x}px;top:${y}px;animation-delay:.2s"></i>`);
    const sealCls = { 0: "ink", 1: "green", 2: "blue", 3: "gold", 4: "" }[q];
    L.insertAdjacentHTML("beforeend", `<span class="seal ink-seal two ${o.sealCls ?? sealCls}" style="left:${x}px;top:${y}px;--s:${o.size || 96}px;font-size:${Math.round((o.size || 96) * 0.34)}px">${o.text || "炼成"}</span>`);
    host.classList.remove("fx-shake"), void host.offsetWidth, host.classList.add("fx-shake");
    requestAnimationFrame(() => (document.scrollingElement.scrollTop = 0, document.scrollingElement.scrollLeft = 0));
    clearTimeout(L._t);
    if (o.keep !== !0) L._t = setTimeout(() => (L.innerHTML = ""), o.ms || 2600);
  }
  // 印章按钮按下
  function press(btn) {
    btn.classList.add("pressing");
    setTimeout(() => btn.classList.remove("pressing"), 140);
  }

  window.FG = {
    RAR, STAT, EL, ITEM, RECIPES, CATS, IMBUE_DESC, FORGE_FAC, REFORGE,
    get S() { return S; },
    reset() { S = fresh(); },
    has, take, give, name, rname, icon, mainOf, check, inputs, dist, baseStats, affixN, fmt, affixLabel, worn, craft, upgradeLine,
    reforgeables, reforgeCost, canReforge, reforgeRoll, affixPool,
    iconURL, tok, stamp, press,
    // 示意开关：补齐材料 / 已搬迁到溪谷 / 得到器方（方便看各种状态）
    cheat(k) {
      if (k === "mats") for (const id of Object.keys(ITEM)) if (!ITEM[id].slot && !/^fu_|dundi|huqi/.test(id)) give(id, id === "spirit_stone" ? 800 : 8, id === "spirit_stone" ? 0 : 1);
      if (k === "move") (S.relocated = !0), (S.region = "r2"), (S.flags.region2 = !0);
      if (k === "recipe") S.recipesKnown.qifang_robe = !0;
    },
    upgradeForge() {
      const c = FORGE_FAC.cost[S.forgeLv];
      if (!c) return { ok: !1, why: "已是最高阶" };
      if (c.relocate && !S.relocated) return { ok: !1, why: "需先搬迁到竹海·溪谷灵脉" };
      if (has("spirit_stone") < c.stones) return { ok: !1, why: "灵石不足" };
      for (const [id, n] of Object.entries(c.items)) if (has(id) < n) return { ok: !1, why: name(id) + "不足" };
      take("spirit_stone", c.stones);
      for (const [id, n] of Object.entries(c.items)) take(id, n);
      S.forgeLv++;
      return { ok: !0 };
    },
  };
  // 示意图截图就绪信号（shoot.mjs 等它）
  window.__ready = !1;
})();
