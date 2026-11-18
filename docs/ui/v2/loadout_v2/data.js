// 装配 v2 示意图公用数据与逻辑（只给 docs/ui/v2/loadout_v2/*.html 用，不是游戏代码）
// 数据照抄：src/data/skills.js（SPELLS / FORMATIONS）、src/data/items.js（ARTIFACTS / XINFA）、src/data/progression.js（unlocks / growth）、
//          src/data/enemies.js + src/data/levels/r1.js、r2.js（精英 / 首领护盾）、src/game/shields.js（SHIELD_TUNE）、src/core/items.js（RARITY）。
// 普通脚本（不是 ES module），file:// 直接打开就能用；依赖 icons.js（window.LD_ICONS）。
//
// ── 接口（各方向页面共用）────────────────────────────────────────────
//   LD.*                     静态数据（SPELLS / FORMATIONS / ARTIFACTS / XINFA / EL / RAR / REGIONS / GEAR …）
//   LO.S                     当前装配 { layer, region, spells[3], xinfa[2], artifact(uid|null), formation(id|null) }
//   LO.on(fn)                订阅变化（place / clear / setLayer / setRegion 后调用 fn(S)）
//   LO.slotCount(kind)       已解锁栏数：kind = "spell" | "xinfa" | "artifact" | "formation"
//   LO.unlocked(kind, i) / LO.unlockText(kind, i) → "练气七层解锁"
//   LO.place(kind, i, id)    放入（同类已在别栏则两栏互换）→ { ok, msg }；LO.clear(kind, i)；LO.swap(kind, i, j)
//   LO.pool(kind)            可装配列表 [{ id, def, have, src, at(栏位下标或 -1), gear(提供该心法的装备名或 null) }]
//   LO.coverage(regionId)    本去处护盾覆盖 [{ el, who, counter, by:[已带的克制法术/阵], ok }]
//   LO.tipHTML(kind, id)     悬停详情（纸笺内容）；LO.attachTip(el, kind, id) 绑定悬停
//   LO.tokenHTML(kind, id, o) 圆相技能签（图标 + 五行 / 品级色圆相）；o: { size, sel, ghost, cap, key }
//   LO.iconStyle(key)        图集背景样式
//   LO.dnd(root)             拖拽 / 点选：源 [data-src-kind][data-src-id]，栏位 [data-slot-kind][data-slot-i]
//                            点选：先点源（或栏位）再点栏位（或源）；悬停法术按 Q/E/R、阵盘按 T 直接装入；把栏里的拖出去 = 卸下
//   LO.toast(msg, tone)      屏幕下方一条墨笔通知（tone: "" | "zhu" | "gold"）
//   LO.mockBar(el)           左下"示意开关"：境界 / 去处 / 重置；同样支持 #layer=8&region=r1 初始状态
(function () {
  // ---------------- 五行 ----------------
  // 颜色与 HUD 技能栏圆相一致（src/ui/skillbar.js：.hud-skill.metal 等；淡晕 ELEM_WASH）
  const EL = {
    metal: { n: "金", c: "#9a7d34", w: "rgba(168,134,47,.24)", st: "破甲" },
    wood: { n: "木", c: "#3f9a6e", w: "rgba(63,154,110,.22)", st: "缠绕" },
    water: { n: "水", c: "#2f7fa8", w: "rgba(47,127,168,.22)", st: "寒冷" },
    fire: { n: "火", c: "#b8291a", w: "rgba(192,57,43,.2)", st: "灼烧" },
    earth: { n: "土", c: "#9a6a32", w: "rgba(154,106,50,.22)", st: "震晕" },
  };
  const BEATS = { metal: "wood", wood: "earth", earth: "water", water: "fire", fire: "metal" }; // X 克 Y
  const COUNTER = Object.fromEntries(Object.entries(BEATS).map(([a, b]) => [b, a])); // 护盾 Y ← 用 X 破
  const SHIELD = { counter: 2, other: 0.2, physical: 0.25 }; // src/game/shields.js SHIELD_TUNE

  // ---------------- 品级（src/core/items.js RARITY） ----------------
  const RAR = [
    { n: "凡品", s: "凡", c: "#6a6760", t: "#3b3a36" },
    { n: "灵品", s: "灵", c: "#3fae7a", t: "#2c7d57" },
    { n: "宝品", s: "宝", c: "#2f7fa8", t: "#245f7f" },
    { n: "仙品", s: "仙", c: "#c9a040", t: "#8a6a22" },
    { n: "极品", s: "极", c: "#d2321e", t: "#b8291a" },
  ];

  // ---------------- 法术（src/data/skills.js SPELLS） ----------------
  const SPELLS = {
    sword_qi: { id: "sword_qi", name: "剑气斩", glyph: "剑", el: "metal", role: "破防", cost: 18, cd: 8, cast: 0.12, range: 14, desc: "挥出三道扇形剑气，穿透敌人，叠加两层破甲（受到伤害增加）", status: "破甲 2 层 · 6 秒", src: "玄机子所授（练气一层）",
      dmg: (h) => `三道剑气，每道 <b>${r(16 + 0.5 * h.atk + 0.6 * h.spell)}</b>（穿透）` },
    fire_talisman: { id: "fire_talisman", name: "火符", glyph: "火", el: "fire", role: "群伤", cost: 24, cd: 10, cast: 0.15, range: 16, desc: "掷出一张火符，命中后大范围爆炸，附带灼烧", status: "灼烧 3 层 · 5 秒", src: "《火符》残卷三页参悟",
      dmg: (h) => `命中 ${r(10 + 0.5 * h.spell)} · 爆炸 <b>${r(60 + 3 * h.spell)}</b>（半径 3.6）` },
    frost: { id: "frost", name: "寒冰锥", glyph: "冰", el: "water", role: "单体爆发", cost: 26, cd: 12, cast: 0.2, range: 16, desc: "凝出一枚冰锥疾射而出，对首个命中的敌人造成重创并直接冻结", status: "寒冷 3 层 · 4 秒", src: "剑修遗府所藏",
      dmg: (h) => `单体 <b>${r(120 + 6 * h.spell)}</b>` },
    vine: { id: "vine", name: "缠藤诀", glyph: "藤", el: "wood", role: "群控", cost: 28, cd: 14, cast: 0.2, range: 14, desc: "在指定处生出大片藤蔓，缠绕区域内所有敌人，使其无法移动", status: "缠绕 3.5 秒", src: "山神庙地窖所藏",
      dmg: (h) => `每 0.5 秒 <b>${r(7 + 0.5 * h.spell)}</b> × 8 跳（半径 4.2）` },
    earth_shield: { id: "earth_shield", name: "土遁护体", glyph: "盾", el: "earth", role: "保命", cost: 30, cd: 18, cast: 0.15, range: 0, desc: "岩甲护体，吸收大量伤害", status: "护体 8 秒", src: "筑基时领悟",
      dmg: (h) => `吸收 <b>${r(120 + 6 * h.spell)}</b> 伤害 · 8 秒`, noHit: !0 },
  };
  // ---------------- 阵盘（FORMATIONS） ----------------
  const FORMATIONS = {
    sword_array: { id: "sword_array", name: "剑阵", glyph: "剑", el: "metal", cost: 30, cd: 16, radius: 4, dur: 10, desc: "阵中剑光周期斩击阵内敌人，附带破甲", status: "破甲 1 层", src: "阵盘·剑阵（竹海·溪谷灵光点）", item: "zhenpan_sword",
      dmg: (h) => `每 0.6 秒斩 2 个敌人，各 <b>${r(10 + 0.6 * h.spell)}</b> · 10 秒` },
    fire_array: { id: "fire_array", name: "火阵", glyph: "焱", el: "fire", cost: 30, cd: 16, radius: 3.5, dur: 8, desc: "烈焰灼烧阵内所有敌人", status: "灼烧 1 层", src: "未得（阵盘·火阵）",
      dmg: (h) => `每 0.5 秒 <b>${r(3 + 0.15 * h.spell)}</b> · 8 秒` },
    spirit_array: { id: "spirit_array", name: "聚灵阵", glyph: "灵", el: null, cost: 20, cd: 20, radius: 3.5, dur: 12, desc: "身处阵中时，真气回复大增，冷却加快", status: "", src: "未得（阵盘·聚灵）",
      dmg: () => `阵内真气回复 +15/秒 · 冷却缩减 +20% · 12 秒`, noHit: !0 },
  };
  // ---------------- 法宝（ARTIFACTS + 储物里的法宝实例） ----------------
  const ART = {
    flying_sword: { name: "青冥飞剑", el: "metal", desc: "飞剑环身，自动斩击近处敌人；右键令诸剑齐发，斩向鼠标处",
      pas: (L) => `攻击 +${5 * L} · 飞剑 ${2 + (L >= 3) + (L >= 5)} 柄`, act: (L, h) => `右键：真气 20 · 冷却 6 秒 · 诸剑齐发 ${r((25 + h.atk) * lvm(L))}` },
    seal: { name: "镇山印", el: "earth", desc: "右键祭出镇山印砸向鼠标处，震晕敌人；被动提升防御与气血",
      pas: (L) => `防御 +${10 * L} · 气血 +${20 * L}`, act: (L, h) => `右键：真气 25 · 冷却 8 秒 · 砸地 ${r((50 + 1.5 * h.spell) * lvm(L))}，震晕 1.5 秒` },
    gourd: { name: "紫金葫芦", el: "water", desc: "右键打开葫芦，吸取周围敌人精血，回复气血与真气；被动提升真气",
      pas: (L) => `真气 +${20 * L} · 真气回复 +${L}`, act: (L, h) => `右键：冷却 10 秒 · 吸取 1.5 秒，每跳 ${r((10 + 0.6 * h.spell) * lvm(L))}` },
  };
  const ARTIFACTS = [
    { uid: "a1", id: "art_flying_sword", art: "flying_sword", name: "青冥飞剑", rarity: 2, level: 2, native: !0, have: !0, src: "剑修遗府 · 本命法宝，永不遗落" },
    { uid: "a2", id: "art_seal", art: "seal", name: "镇山印", rarity: 3, level: 1, have: !0, src: "碧鳞水蟒仙品掉落" },
    { uid: "a3", id: "art_qiankun", art: "gourd", name: "乾坤镜", rarity: 4, level: 1, bonus: 2, have: !1, src: "未得 · 极品法器" },
  ];
  // ---------------- 心法（XINFA） ----------------
  const XINFA = {
    sharp: { name: "锋锐", glyph: "锐", desc: "暴击率 +15%，暴击伤害 +30%", affix: !0, src: "练气四层自动领悟" },
    mom_gather: { name: "蓄势", glyph: "蓄", desc: "普攻积攒气势 +30%；蓄势斩伤害 +10%", src: "心法残卷（青岚山外）" },
    mom_chain: { name: "连环", glyph: "环", desc: "普攻每段命中叠一层连环（3 秒，至多 5 层），每层普攻伤害 +4%；蓄势斩耗尽层数，每层再 +10%", src: "心法残卷（青岚山外）" },
    lingtai: { name: "灵台", glyph: "台", desc: "神识 +30；探查完成时有一成机会顺带探明下一格", src: "竹海·溪谷宝箱" },
    dash_shadow: { name: "剑影", glyph: "影", desc: "闪身时留下剑影，片刻后爆开伤敌", affix: !0, src: "精英掉落" },
    vajra: { name: "金刚体", glyph: "刚", desc: "防御 +20，气血上限 +25%", affix: !0, src: "精英掉落" },
    dash_flow: { name: "流云", glyph: "云", desc: "闪身充能 +1，闪身冷却 -10%", affix: !0, src: "心法残卷" },
    crit_thunder: { name: "雷引", glyph: "引", desc: "暴击时引落天雷，追加金属性伤害", affix: !0, src: "未得" },
    mom_haste: { name: "满势", glyph: "满", desc: "气势满时攻速 +20%、移速 +10%", affix: !0, src: "未得" },
    mom_wave: { name: "余波", glyph: "波", desc: "蓄势斩的月牙剑气行至尽头再炸开一圈余波（半径 2.8 米，0.9 倍攻击）", affix: !0, src: "未得" },
    mom_return: { name: "回锋", glyph: "锋", desc: "蓄势斩命中敌人时返还 1 次闪身充能", affix: !0, src: "未得" },
    kill_mp: { name: "斩敌回气", glyph: "气", desc: "每斩杀一名敌人，回复 6 点真气", src: "未得" },
  };
  // 已领悟（profile.flags.learned）
  const LEARNED = {
    spell: ["sword_qi", "vine", "fire_talisman", "frost"],
    xinfa: ["sharp", "mom_gather", "mom_chain", "lingtai", "dash_shadow", "dash_flow"],
    formation: ["sword_array"],
  };
  // 身上装备（特殊词条 = 心法，docs/战斗_气势与身法_v1.md §3.7）
  const GEAR = [
    { slot: "法剑", id: "sword_qingfeng", name: "青锋剑", rarity: 3, affix: { xinfa: "sharp", text: "锋锐" } },
    { slot: "法衣", id: "robe_lingsi", name: "灵丝道袍", rarity: 1 },
    { slot: "玉佩", id: "jade_shuiling", name: "水灵佩", rarity: 3, affix: { xinfa: "dash_flow", text: "流云身法" } },
  ];

  // ---------------- 境界与栏位（src/data/progression.js unlocks） ----------------
  const NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const UNLOCK = {
    spell: [[1, 1], [3, 2], [7, 3]],
    xinfa: [[4, 1], [8, 2]],
    artifact: [[7, 1]],
    formation: [[7, 1]],
    pill: [[1, 1], [2, 2], [5, 3]],
  };
  const MAXN = { spell: 3, xinfa: 2, artifact: 1, formation: 1, pill: 3 };
  const layerName = (L) => (L >= 10 ? "筑基一层" : "练气" + NUM[L] + "层");
  const hero = (L) => ({ atk: 20 + 4 * (L - 1), spell: 20 + 4 * (L - 1), mp: 100 + 15 * (L - 1), hp: 200 + 30 * (L - 1) });

  // ---------------- 去处与常见护盾 ----------------
  // r1：精英狼妖头目木盾（enemies.js wolf_elite）；首领青牙 木 → 土 两段
  // r2：精英点 7 处取 3（levels/r2.js elites）：北 / 中 5 处火或土（随机其一），南半 2 处只有土；千年藤妖火 / 土；首领碧鳞 火 → 土 → 木
  const REGIONS = {
    r1: {
      id: "r1", name: "青岚山外", jing: "一境", realm: "练气 1–4",
      groups: [
        { tag: "精英", who: "狼妖头目", where: "精英 · 台地与北脊", els: ["wood"], share: "精英皆木盾" },
        { tag: "青牙", who: "青牙（狼王）", where: "首领 · 狼谷", els: ["wood", "earth"], phases: !0, share: "木 → 土 两段" },
      ],
      advice: [
        { el: "metal", text: "精英多木盾 → 宜带金行", spells: ["sword_qi"] },
        { el: "wood", text: "青牙后半换土盾 → 再备一手木行", spells: ["vine"] },
      ],
      line: "精英多木盾 → 宜带金行；青牙后半土盾 → 备木行",
    },
    r2: {
      id: "r2", name: "竹海·溪谷", jing: "二境", realm: "练气 5–9",
      groups: [
        { tag: "南半", who: "狼妖头目 · 千年藤妖", where: "南半 · 竹海南、东台南", els: ["earth"], share: "只出土盾" },
        { tag: "北半", who: "狼妖头目 · 千年藤妖", where: "北半 · 竹海北、东台北", els: ["fire", "earth"], share: "火、土各半" },
        { tag: "碧鳞", who: "碧鳞水蟒", where: "首领 · 碧水潭（练气八层可入）", els: ["fire", "earth", "wood"], phases: !0, share: "火 → 土 → 木 三段" },
      ],
      advice: [
        { el: "wood", text: "南半多土盾 → 宜带木行", spells: ["vine"] },
        { el: "water", text: "北半火盾占一半 → 宜带水行", spells: ["frost"] },
        { el: "metal", text: "碧鳞末段木盾 → 金行收尾", spells: ["sword_qi"] },
      ],
      line: "南半多土盾 → 宜带木行；北半火、土各半 → 水 + 木",
      mix: { earth: 0.64, fire: 0.36 }, // 7 处精英点：(5×½ + 2) / 7 ≈ 64% 土
    },
  };

  const r = (x) => Math.round(x);
  const lvm = (L) => 1 + 0.25 * (L - 1);
  const NAME = { spell: "法术", xinfa: "心法", artifact: "法宝", formation: "阵盘" };
  const KEY = { spell: ["Q", "E", "R"], xinfa: ["心法一", "心法二"], artifact: ["右键"], formation: ["T"] };

  window.LD = { EL, BEATS, COUNTER, SHIELD, RAR, SPELLS, FORMATIONS, ART, ARTIFACTS, XINFA, LEARNED, GEAR, UNLOCK, MAXN, REGIONS, NAME, KEY, layerName, hero, NUM };

  // ======================= 状态与逻辑 =======================
  const DEF = { layer: 7, region: "r2", spells: ["sword_qi", "fire_talisman", "vine"], xinfa: ["mom_gather", null], artifact: "a1", formation: "sword_array" };
  const S = JSON.parse(JSON.stringify(DEF));
  // 初始状态可由 hash 指定：#layer=8&region=r1&spells=frost,vine,sword_qi
  for (const kv of location.hash.slice(1).split("&")) {
    const [k, v] = kv.split("=");
    if (k === "layer") S.layer = +v;
    else if (k === "region" && REGIONS[v]) S.region = v;
    else if (k === "spells") S.spells = v.split(",").map((x) => (SPELLS[x] ? x : null)).concat([null, null, null]).slice(0, 3);
    else if (k === "xinfa") S.xinfa = v.split(",").map((x) => (XINFA[x] ? x : null)).concat([null, null]).slice(0, 2);
  }
  const subs = [];
  const emit = () => (subs.forEach((f) => f(S)), setHeld(held));
  const arr = (kind) => (kind === "spell" ? S.spells : kind === "xinfa" ? S.xinfa : null);

  function slotCount(kind) {
    let n = 0;
    for (const [L, v] of UNLOCK[kind] || []) if (S.layer >= L) n = v;
    return n;
  }
  const unlocked = (kind, i = 0) => i < slotCount(kind);
  function unlockText(kind, i = 0) {
    const e = (UNLOCK[kind] || []).find(([, v]) => v > i);
    return e ? layerName(e[0]) + "解锁" : "";
  }
  const gearOf = (xid) => GEAR.find((g) => g.affix && g.affix.xinfa === xid) || null;
  const defOf = (kind, id) => (kind === "spell" ? SPELLS[id] : kind === "xinfa" ? XINFA[id] : kind === "formation" ? FORMATIONS[id] : ARTIFACTS.find((a) => a.uid === id));
  function at(kind, id) {
    if (kind === "artifact") return S.artifact === id ? 0 : -1;
    if (kind === "formation") return S.formation === id ? 0 : -1;
    const i = arr(kind).indexOf(id);
    return i >= 0 && unlocked(kind, i) ? i : -1; // 未解锁栏里的值保留但不算"已装"
  }
  function get(kind, i) {
    if (kind === "artifact") return S.artifact;
    if (kind === "formation") return S.formation;
    return arr(kind)[i];
  }
  function have(kind, id) {
    if (kind === "artifact") return !!(defOf(kind, id) || {}).have;
    return LEARNED[kind].includes(id);
  }

  function place(kind, i, id) {
    const d = defOf(kind, id);
    if (!d) return { ok: !1 };
    if (!unlocked(kind, i)) return fail(`此栏${unlockText(kind, i)}`);
    if (!have(kind, id)) return fail(`尚未${kind === "artifact" ? "得到" : "领悟"}「${d.name}」`);
    if (kind === "artifact") S.artifact = id;
    else if (kind === "formation") S.formation = id;
    else {
      const a = arr(kind), j = a.indexOf(id), old = a[i];
      if (j === i) return { ok: !0 };
      a[i] = id;
      if (j >= 0) a[j] = old; // 同类已在别栏：互换
    }
    let msg = "";
    if (kind === "xinfa" && gearOf(id)) {
      const g = gearOf(id);
      msg = `同名不叠加：${g.slot}《${g.name}》已带「${g.affix.text}」，这一栏等于空着`;
      toast(msg, "zhu");
    }
    emit();
    return { ok: !0, msg };
  }
  function fail(msg) {
    toast(msg, "zhu");
    return { ok: !1, msg };
  }
  function clear(kind, i) {
    if (kind === "artifact") S.artifact = null;
    else if (kind === "formation") S.formation = null;
    else arr(kind)[i] = null;
    emit();
  }
  function swap(kind, i, j) {
    const a = arr(kind);
    if (!a || !unlocked(kind, i) || !unlocked(kind, j)) return;
    [a[i], a[j]] = [a[j], a[i]];
    emit();
  }
  function pool(kind) {
    if (kind === "artifact") return ARTIFACTS.map((a) => ({ id: a.uid, def: a, have: a.have, src: a.src, at: at(kind, a.uid), gear: null }));
    const D = kind === "spell" ? SPELLS : kind === "xinfa" ? XINFA : FORMATIONS;
    const ids = Object.keys(D).sort((a, b) => have(kind, b) - have(kind, a));
    return ids.map((id) => ({ id, def: D[id], have: have(kind, id), src: D[id].src, at: at(kind, id), gear: kind === "xinfa" ? gearOf(id) : null }));
  }
  // 护盾覆盖：每种护盾，看带着的法术 / 阵盘里有没有克它的
  function coverage(regionId = S.region) {
    const R = REGIONS[regionId], seen = new Map();
    for (const g of R.groups) for (const e of g.els) if (!seen.has(e)) seen.set(e, g.who);
    const carried = S.spells.filter((x, i) => x && unlocked("spell", i)).map((x) => ({ id: x, el: SPELLS[x].el, name: SPELLS[x].name, noHit: SPELLS[x].noHit }));
    if (S.formation && unlocked("formation")) { const f = FORMATIONS[S.formation]; if (f.el) carried.push({ id: f.id, el: f.el, name: f.name }); }
    return [...seen.keys()].map((el) => {
      const c = COUNTER[el];
      const by = carried.filter((x) => x.el === c && !x.noHit).map((x) => x.name);
      return { el, who: seen.get(el), counter: c, by, ok: by.length > 0 };
    });
  }

  // ---------------- 图标与签 ----------------
  const pct = (a, b) => (b ? (a / b) * 100 : 0).toFixed(4) + "%";
  function iconStyle(key) {
    const I = window.LD_ICONS, rc = I && I.rects[key];
    if (!rc) return "";
    return `background-image:url('${I.url}');background-size:${pct(I.W, rc[2])} ${pct(I.H, rc[3])};background-position:${pct(rc[0], I.W - rc[2])} ${pct(rc[1], I.H - rc[3])}`;
  }
  const ARTKEY = { flying_sword: "sk:art_flying_sword", seal: "sk:art_seal", gourd: "sk:art_gourd" };
  function iconKey(kind, id) {
    if (kind === "artifact") { const a = defOf(kind, id); return a ? ARTKEY[a.art] : ""; }
    return "sk:" + id;
  }
  // 签的颜色：法术 / 阵盘 = 五行色（与 HUD 技能栏圆相一致）；法宝 = 品级色（RARITY）；心法 = 浓墨
  function colorOf(kind, id) {
    const d = defOf(kind, id);
    if (!d) return { c: "rgba(21,24,27,.3)", w: "transparent" };
    if (kind === "spell" || kind === "formation") return d.el ? { c: EL[d.el].c, w: EL[d.el].w } : { c: "#b8923a", w: "rgba(184,146,58,.2)" };
    if (kind === "artifact") return { c: RAR[d.rarity].c, w: RAR[d.rarity].c + "33" };
    return { c: "rgba(21,24,27,.72)", w: "rgba(21,24,27,.07)" };
  }
  function tokenHTML(kind, id, o = {}) {
    const d = id && defOf(kind, id);
    const { c, w } = colorOf(kind, id);
    const cls = ["sk", o.cls || "", o.sel ? "is-sel" : "", o.ghost ? "is-ghost" : "", !d ? "is-empty" : ""].join(" ");
    const ico = d ? `<span class="ico" style="${iconStyle(iconKey(kind, id))}"></span>` : `<b>${o.glyph || ""}</b>`;
    const lv = kind === "artifact" && d ? `<i class="lv">${d.level + (d.bonus || 0)}</i>` : "";
    const cs = kind === "artifact" && d && d.rarity >= 3 ? `<i class="cs" style="background:${RAR[d.rarity].c}">${RAR[d.rarity].s}</i>` : "";
    return `<span class="${cls}" style="--s:${o.size || 56}px;--el:${c};--elw:${w}">${ico}${lv}${cs}${o.key ? `<i class="k">${o.key}</i>` : ""}</span>`;
  }

  // ---------------- 悬停详情 ----------------
  function shieldLine(el, noHit) {
    if (!el) return `<div class="tp-sh"><span class="ink-dim">无五行 · 不破盾</span></div>`;
    if (noHit) return `<div class="tp-sh"><span class="ink-dim">不造成伤害 · 不破盾</span></div>`;
    const t = BEATS[el];
    return `<div class="tp-sh">克 <span class="shd" style="--c:${EL[t].c}">${EL[t].n}盾</span> <b>×${SHIELD.counter}</b><span class="ink-dim"> · 其他盾 ×${SHIELD.other} · 普攻 ×${SHIELD.physical}</span></div>`;
  }
  function regionLine(el, noHit) {
    const R = REGIONS[S.region];
    if (!el || noHit) return "";
    const t = BEATS[el], hit = R.groups.filter((g) => g.els.includes(t));
    if (!hit.length) return `<div class="tp-rg">${R.name}：此处少见${EL[t].n}盾</div>`;
    return `<div class="tp-rg ok">${R.name}：${hit.map((g) => g.tag).join("、")}有${EL[t].n}盾 · 用得上</div>`;
  }
  function tipHTML(kind, id) {
    const d = defOf(kind, id), h = hero(S.layer);
    if (!d) return "";
    const head = (name, sub, tok) => `<div class="tp-hd">${tok}<div><div class="tp-n">${name}</div><div class="tp-sub">${sub}</div></div></div>`;
    if (kind === "spell") {
      const e = EL[d.el];
      return head(d.name, `<span class="els" style="--c:${e.c}">${e.n}</span> ${e.n}行 · ${d.role}`, tokenHTML(kind, id, { size: 48 })) +
        `<div class="tp-kv"><span>真气</span><b>${d.cost}</b><span>冷却</span><b>${d.cd} 秒</b><span>前摇</span><b>${d.cast} 秒</b><span>距离</span><b>${d.range ? d.range + " 丈" : "自身"}</b></div>` +
        `<div class="tp-dmg"><span class="ink-dim">${layerName(S.layer)} · 法力 ${h.spell}</span><br>${d.dmg(h)}</div>` +
        (d.status ? `<div class="tp-st">附带 · ${d.status}</div>` : "") + shieldLine(d.el, d.noHit) + regionLine(d.el, d.noHit) +
        `<div class="tp-d">${d.desc}</div>` + (have(kind, id) ? "" : `<div class="tp-src">${d.src}</div>`);
    }
    if (kind === "formation") {
      const e = d.el ? EL[d.el] : null;
      return head(d.name, `${e ? `<span class="els" style="--c:${e.c}">${e.n}</span> ${e.n}行 · ` : ""}阵盘 · T 在鼠标处布阵`, tokenHTML(kind, id, { size: 48 })) +
        `<div class="tp-kv"><span>真气</span><b>${d.cost}</b><span>冷却</span><b>${d.cd} 秒</b><span>半径</span><b>${d.radius} 丈</b><span>持续</span><b>${d.dur} 秒</b></div>` +
        `<div class="tp-dmg"><span class="ink-dim">${layerName(S.layer)} · 法力 ${h.spell}</span><br>${d.dmg(h)}</div>` +
        (d.status ? `<div class="tp-st">附带 · ${d.status}</div>` : "") + shieldLine(d.el, d.noHit) + regionLine(d.el, d.noHit) +
        `<div class="tp-d">${d.desc}</div>` + (have(kind, id) ? "" : `<div class="tp-src">${d.src}</div>`);
    }
    if (kind === "artifact") {
      const A = ART[d.art], R = RAR[d.rarity], L = d.level + (d.bonus || 0), e = EL[A.el];
      return head(`<span style="color:${R.t}">${d.name}</span>`, `${R.n} · 法宝 · 祭炼 ${L} 级${d.native ? " · 本命" : ""}`, tokenHTML(kind, id, { size: 48 })) +
        `<div class="tp-row"><span class="k">被动</span>${A.pas(L)}</div><div class="tp-row"><span class="k">主动</span>${A.act(L, h)}</div>` +
        shieldLine(A.el, !1).replace("tp-sh", "tp-sh small") + `<div class="tp-d">${A.desc}</div>` + `<div class="tp-src">${d.src}</div>`;
    }
    // 心法
    const g = gearOf(id);
    return head(`《${d.name}》`, `心法 · 被动${d.affix ? " · 可为仙品词条" : ""}`, tokenHTML(kind, id, { size: 48 })) +
      `<div class="tp-d" style="color:var(--ink-nong)">${d.desc}</div>` +
      (g ? `<div class="tp-gear"><span class="gs">${g.slot}《${g.name}》词条「${g.affix.text}」已提供</span><br>同名不叠加：心法栏再装一次也只算一次。把这一栏让给别的心法更划算。</div>` : "") +
      `<div class="tp-src">${have(kind, id) ? "已领悟 · " : ""}${d.src}</div>`;
  }
  let tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "ld-tip ink-paper slip";
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(el, kind, id) {
    const t = ensureTip();
    t.innerHTML = tipHTML(kind, id);
    window.inkui && inkui.decorate(t.parentNode);
    t.classList.add("on");
    const b = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    let x = b.right + 14, y = b.top + b.height / 2 - th / 2;
    if (x + tw > 1270) x = b.left - tw - 14;
    if (x < 6) x = Math.min(1270 - tw, b.left), y = b.top - th - 12;
    y = Math.max(8, Math.min(712 - th, y));
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  const hideTip = () => tipEl && tipEl.classList.remove("on");
  function attachTip(el, kind, id) {
    if (!id) return;
    el.addEventListener("mouseenter", () => !drag && showTip(el, kind, id));
    el.addEventListener("mouseleave", hideTip);
  }

  // ---------------- 拖拽 / 点选 ----------------
  let drag = null, held = null, hover = null;
  const HELD = "ld-held";
  function setHeld(h) {
    held = h;
    document.body.classList.toggle(HELD, !!h);
    document.querySelectorAll("[data-slot-kind]").forEach((t) => t.classList.toggle("can-drop", !!h && t.dataset.slotKind === h.kind && unlocked(h.kind, +t.dataset.slotI || 0)));
    document.querySelectorAll("[data-src-id]").forEach((t) => t.classList.toggle("is-held", !!h && h.src && t.dataset.srcKind === h.kind && t.dataset.srcId === h.id));
    document.querySelectorAll("[data-slot-kind]").forEach((t) => t.classList.toggle("is-held", !!h && h.slot != null && t.dataset.slotKind === h.kind && +t.dataset.slotI === h.slot));
  }
  function dnd(root = document) {
    root.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const s = ev.target.closest("[data-src-id],[data-slot-kind]");
      if (!s) return;
      const isSlot = s.hasAttribute("data-slot-kind");
      const kind = isSlot ? s.dataset.slotKind : s.dataset.srcKind;
      const i = isSlot ? +s.dataset.slotI || 0 : null;
      const id = isSlot ? get(kind, i) : s.dataset.srcId;
      drag = { kind, id, fromSlot: i, el: s, x0: ev.clientX, y0: ev.clientY, moved: !1, ghost: null };
    });
    window.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
      if (!drag.id) return;
      if (!drag.moved) {
        drag.moved = !0;
        hideTip();
        drag.ghost = document.createElement("div");
        drag.ghost.className = "ld-ghost";
        drag.ghost.innerHTML = tokenHTML(drag.kind, drag.id, { size: 60 });
        document.body.appendChild(drag.ghost);
        setHeld({ kind: drag.kind, id: drag.id });
        document.body.classList.add("ld-dragging");
      }
      drag.ghost.style.transform = `translate(${ev.clientX - 30}px, ${ev.clientY - 30}px)`;
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = t && t.closest("[data-slot-kind]");
      document.querySelectorAll(".drop-on").forEach((x) => x.classList.remove("drop-on"));
      if (slot && slot.dataset.slotKind === drag.kind) slot.classList.add("drop-on");
    });
    window.addEventListener("pointerup", (ev) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      document.body.classList.remove("ld-dragging");
      document.querySelectorAll(".drop-on").forEach((x) => x.classList.remove("drop-on"));
      if (d.ghost) d.ghost.remove();
      if (d.moved) {
        setHeld(null);
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        const slot = t && t.closest("[data-slot-kind]");
        if (slot && slot.dataset.slotKind === d.kind) {
          const j = +slot.dataset.slotI || 0;
          if (d.fromSlot != null && (d.kind === "spell" || d.kind === "xinfa")) {
            if (!unlocked(d.kind, j)) return void fail(`此栏${unlockText(d.kind, j)}`);
            swap(d.kind, d.fromSlot, j);
          } else place(d.kind, j, d.id);
        } else if (d.fromSlot != null) {
          clear(d.kind, d.fromSlot); // 拖出栏外 = 卸下
          toast(`卸下「${defOf(d.kind, d.id).name}」`);
        }
        return;
      }
      clickOn(d);
    });
    // 悬停法术按 Q / E / R、阵盘按 T：直接装入
    root.addEventListener("pointerover", (ev) => {
      const s = ev.target.closest("[data-src-id]");
      hover = s ? { kind: s.dataset.srcKind, id: s.dataset.srcId } : null;
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.code === "Escape") return setHeld(null);
      if (!hover) return;
      const k = { KeyQ: 0, KeyE: 1, KeyR: 2 }[ev.code];
      if (hover.kind === "spell" && k != null) place("spell", k, hover.id);
      if (hover.kind === "formation" && ev.code === "KeyT") place("formation", 0, hover.id);
    });
  }
  function clickOn(d) {
    if (d.fromSlot == null) {
      // 点了源
      if (held && held.slot != null && held.kind === d.kind) { const h = held; setHeld(null); return void place(d.kind, h.slot, d.id); }
      if (held && held.src && held.id === d.id) return setHeld(null);
      // 只有一个空栏时直接装进去
      return setHeld({ kind: d.kind, id: d.id, src: !0 });
    }
    // 点了栏位
    if (!unlocked(d.kind, d.fromSlot)) return void fail(`此栏${unlockText(d.kind, d.fromSlot)}`);
    if (held && held.kind === d.kind) {
      const h = held;
      setHeld(null);
      if (h.src) return void place(d.kind, d.fromSlot, h.id);
      if (h.slot != null && h.slot !== d.fromSlot) return void swap(d.kind, h.slot, d.fromSlot);
      return;
    }
    setHeld({ kind: d.kind, slot: d.fromSlot });
  }

  // ---------------- 通知 ----------------
  let toastT = 0;
  function toast(msg, tone = "") {
    let t = document.querySelector(".ld-toast");
    if (!t) (t = document.createElement("div")), (t.className = "ld-toast"), document.body.appendChild(t);
    t.className = "ld-toast on " + tone;
    t.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ---------------- 示意开关 ----------------
  function mockBar(el) {
    const draw = () => {
      el.innerHTML = `<span>示意开关</span>` +
        [2, 4, 7, 8].map((L) => `<a data-l="${L}" class="${S.layer === L ? "on" : ""}">${layerName(L).replace("练气", "")}</a>`).join("") +
        `<i>·</i>` + Object.values(REGIONS).map((R) => `<a data-r="${R.id}" class="${S.region === R.id ? "on" : ""}">${R.name}</a>`).join("") +
        `<i>·</i><a data-reset>重置</a>`;
    };
    el.classList.add("ld-mock");
    el.addEventListener("click", (ev) => {
      const a = ev.target.closest("a");
      if (!a) return;
      if (a.dataset.l) S.layer = +a.dataset.l;
      if (a.dataset.r) S.region = a.dataset.r;
      if (a.hasAttribute("data-reset")) Object.assign(S, JSON.parse(JSON.stringify(DEF)));
      setHeld(null);
      emit();
    });
    subs.push(draw);
    draw();
  }

  // 等字体与图集加载完再截图（shoot.mjs 读 window.__ready）
  function ready() {
    const im = new Image();
    const done = () => document.fonts.ready.then(() => setTimeout(() => (window.__ready = !0), 120));
    im.onload = im.onerror = done;
    im.src = window.LD_ICONS ? LD_ICONS.url : "";
  }

  window.LO = {
    S, DEF, on: (fn) => subs.push(fn), emit, slotCount, unlocked, unlockText, place, clear, swap, pool, coverage, get, have, defOf, gearOf,
    tipHTML, attachTip, showTip, hideTip, tokenHTML, iconStyle, iconKey, colorOf, dnd, setHeld, toast, mockBar, ready,
    get held() { return held; },
  };
})();
