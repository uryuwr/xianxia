// 静室（备战建筑）草图公用：属性分项、随身法器、行囊（丹药按品质）——只给 docs/ui/v2/静室/*.html 用，不是游戏代码。
// 依赖：../loadout_v2/data.js（window.LD / window.LO：法术 / 心法 / 法宝 / 阵盘装配、拖拽、悬停详情）、./icons.js（图集坐标）。
//
// 数值照抄（2026-11-17 读码）：
//   境界     src/data/progression.js growth["1:7"]（练气七层），修为进度加成 progressBonus 0.4 × 60% 向八层插值（src/game/progression.js progressBonusStats）
//   装备     src/data/items_db.js 底材 gear.stat × 品质（+15%/品），词条取 loot.js AFFIXES 档位（src/game/loot.js gearBase / rollAffixes）
//   法宝     src/data/items.js ARTIFACTS.passive(L)（飞剑 攻击 +5L；镇山印 防御 +10L、气血 +20L；葫芦 真气 +20L）
//   心法     src/data/items.js XINFA.mods；生效集合 = 心法栏 ∪ 装备特殊词条，同名只算一次（src/game/skills/index.js applyLoadout）
//   炼化增益 src/data/recipes.js REFINE.buff.tiers（灵气充盈三档：受伤 −8%、气血 +5%；只在出行局内计时）
//   出发前   护脉丹 受伤 −10%（run.js preRun）、凝神丹 神识 +20（containers.pillSense，不进 Stats）
//   叠加     src/core/combat.js Stats.get：(基础 + Σ固定) × (1 + Σ百分比) × Π(1 + 独立乘区)
//   品级色   src/core/items.js RARITY + src/fx/rarity_tint.js inkReadable（node 导出，见下 RQ）
(function () {
  const { EL, RAR } = LD;
  // ---------------- 品级（RARITY 原色 c、inkReadable 字色 t；由 node 从真实模块导出，不手写） ----------------
  const RQ = [
    { n: "凡品", s: "凡", c: "#6a6760", t: "#484744" },
    { n: "灵品", s: "灵", c: "#3fae7a", t: "#2e7254" },
    { n: "宝品", s: "宝", c: "#2f7fa8", t: "#255670" },
    { n: "仙品", s: "仙", c: "#c9a040", t: "#816a31" },
    { n: "极品", s: "极", c: "#d2321e", t: "#86281d" },
  ];
  RAR.forEach((r, i) => (r.t = RQ[i].t)); // loadout_v2 草图里写死的旧字色改成 inkReadable
  const NUMC = "零一二三四五六七八九十";

  // ---------------- 属性行（分组；名称同 mirror_v2.js STATS / cave data.js STAT_NAME） ----------------
  const pctF = (v) => Math.round(v * 100) + "%";
  const GROUPS = [
    { g: "生死", rows: [
      { k: "hp", n: "气血" }, { k: "mp", n: "真气" }, { k: "def", n: "防御" },
      { k: "vuln", n: "受伤", f: (v) => (v ? (v < 0 ? "−" : "+") + Math.round(Math.abs(v) * 100) + "%" : "—"), lower: !0, opt: !0, sum: !0 },
      { k: "hpRegen", n: "回血", u: "/秒", f: (v) => v.toFixed(1) },
    ] },
    { g: "攻伐", rows: [
      { k: "atk", n: "攻击" }, { k: "spell", n: "法力" },
      { k: "crit", n: "会心", f: pctF }, { k: "critDmg", n: "会心伤害", f: pctF },
      { k: "aspd", n: "攻速", f: (v) => v.toFixed(2) }, { k: "cdr", n: "冷却缩减", f: pctF, opt: !0 },
      { k: "chargeDmg", n: "蓄势斩", f: (v) => "+" + pctF(v), opt: !0 },
    ] },
    { g: "身法", rows: [
      { k: "move", n: "身法", f: (v) => v.toFixed(1) }, { k: "dashMax", n: "闪身", u: "次" },
      { k: "dashCd", n: "闪身冷却", u: "秒", f: (v) => v.toFixed(2), lower: !0 },
    ] },
    { g: "灵觉", rows: [{ k: "sense", n: "神识", tip: "探查时长 ×100/(100+神识)；≥40 墨封下隐约见宝光" }] },
  ];
  const ROWS = Object.fromEntries(GROUPS.flatMap((g) => g.rows).map((r) => [r.k, r]));
  const MAIN = ["hp", "mp", "atk", "spell", "def", "crit"];

  // 来源大类：境（境界 + 修为进度）/ 器（三件法器 + 法宝）/ 心（心法，含装备词条）/ 局（本局临时：炼化增益、出发前丹药）
  const GRP = {
    境: { n: "境界", c: "rgba(21,24,27,.82)" },
    器: { n: "法器", c: "rgba(21,24,27,.48)" },
    心: { n: "心法", c: "rgba(21,24,27,.24)" },
    局: { n: "本局", c: "#b8923a" },
  };

  // ---------------- 主角（练气七层，修为 396 / 660） ----------------
  const REALM = { name: "练气七层", short: "七层", xp: 396, need: 660, next: "练气八层" };
  const BASE = { hp: 380, mp: 192, atk: 44, spell: 44, def: 17, crit: 0.1, critDmg: 1.6, move: 6, hpRegen: 2.5, aspd: 1.033, dashMax: 2, dashCd: 2.75, sense: 48 };
  const PROG = { hp: 7, mp: 3, atk: 1, spell: 1, sense: 2, aspd: 0.009 }; // 0.4 × 60% × (八层 − 七层)

  // ---------------- 法器（仓库 + 身上）：底材 × 品质已算好，词条按档位 ----------------
  const SLOTN = { sword: "法剑", robe: "法衣", jade: "玉佩" };
  const GEARS = [
    { uid: "g1", id: "sword_qingfeng", slot: "sword", name: "青锋剑", q: 3, lv: 5, bound: !0,
      base: [["atk", "flat", 23.2]], aff: [["atk", "flat", 10], ["spell", "pct", 0.15], ["crit", "flat", 0.08]], sp: { xinfa: "sharp", text: "锋锐" } },
    { uid: "g2", id: "sword_zhuying", slot: "sword", name: "竹影剑", q: 2, lv: 7,
      base: [["atk", "flat", 29.9], ["crit", "flat", 0.026]], aff: [["atk", "flat", 6], ["metal", "flat", 20]] },
    { uid: "g3", id: "rust_sword", slot: "sword", name: "锈剑", q: 0, lv: 1, base: [["atk", "flat", 4]], aff: [] },
    { uid: "g4", id: "robe_lingsi", slot: "robe", name: "灵丝法衣", q: 1, lv: 4, base: [["hp", "flat", 75.9], ["def", "flat", 8.7]], aff: [["hp", "flat", 30]] },
    { uid: "g5", id: "robe_lingsi", slot: "robe", name: "灵丝法衣", q: 2, lv: 6, base: [["hp", "flat", 117], ["def", "flat", 13]], aff: [["def", "flat", 8], ["extractTime", "pct", -0.15]] },
    { uid: "g6", id: "robe_bu", slot: "robe", name: "布法衣", q: 0, lv: 3, base: [["hp", "flat", 44], ["def", "flat", 5]], aff: [] },
    { uid: "g7", id: "jade_shuiling", slot: "jade", name: "水灵佩", q: 3, lv: 6,
      base: [["mp", "flat", 101.5]], aff: [["cdr", "flat", 0.1], ["hp", "flat", 100], ["bagCells", "flat", 4]], sp: { xinfa: "dash_flow", text: "流云" } },
    { uid: "g8", id: "jade_qing", slot: "jade", name: "青玉佩", q: 1, lv: 3, base: [["mp", "flat", 25.3]], aff: [["crit", "flat", 0.03]] },
  ];
  const EQ = { sword: "g1", robe: "g4", jade: "g7" };
  const gearBy = (uid) => GEARS.find((g) => g.uid === uid);
  const eq = (slot) => gearBy(EQ[slot]);
  const STATN = { atk: "攻击", spell: "法力", crit: "会心", critDmg: "会心伤害", hp: "气血", def: "防御", mp: "真气", cdr: "冷却缩减", metal: "金行", wood: "木行", water: "水行", fire: "火行", earth: "土行", extractTime: "撤离读条", bagCells: "储物袋格", sense: "神识", aspd: "攻速", dashCdr: "闪身冷却", dashMax: "闪身充能", vuln: "受伤", chargeDmg: "蓄势斩伤害" };
  const NONCOMBAT = ["extractTime", "bagCells", "metal", "wood", "water", "fire", "earth"];
  const modText = ([k, t, v]) => {
    const n = STATN[k] || k;
    if (t === "pct" || (Math.abs(v) < 1 && v !== 0)) return `${n} ${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`;
    return `${n} ${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 10) / 10}`;
  };
  // 装备特殊词条 → 心法（同步给 LD.GEAR，让 LO 的"同名不叠加"判定跟着换装走）
  function syncGear() {
    LD.GEAR.length = 0;
    for (const s of ["sword", "robe", "jade"]) {
      const g = eq(s);
      if (g) LD.GEAR.push({ slot: SLOTN[s], id: g.id, name: g.name, rarity: g.q, affix: g.sp ? { xinfa: g.sp.xinfa, text: g.sp.text } : null });
    }
  }
  syncGear();

  // ---------------- 心法加成（XINFA.mods 中能进属性卷的部分） ----------------
  const XM = {
    sharp: [["crit", "flat", 0.15], ["critDmg", "flat", 0.3]],
    vajra: [["def", "flat", 20], ["hp", "pct", 0.25]],
    dash_flow: [["dashMax", "flat", 1], ["dashCdr", "flat", 0.1]],
    lingtai: [["sense", "flat", 30]],
    fire_root: [["spell", "pct", 0.1]],
    mom_gather: [["chargeDmg", "flat", 0.1]],
  };
  // 法宝被动
  const ARTP = { flying_sword: (L) => [["atk", "flat", 5 * L]], seal: (L) => [["def", "flat", 10 * L], ["hp", "flat", 20 * L]], gourd: (L) => [["mp", "flat", 20 * L]] };

  // ---------------- 行囊（丹药按品质分格；品质名只用 RARITY） ----------------
  const PILL = {
    huichun_dan: { name: "回春丹", d: "3 秒内回复气血", key: "2" },
    huiqi_dan: { name: "回气丹", d: "回复 40 点真气", key: "1" },
    humai_dan: { name: "护脉丹", d: "本局受伤 −10%", pre: !0 },
    ningshen_dan: { name: "凝神丹", d: "本局神识 +20", pre: !0 },
  };
  const PK = {
    pillSlots: 3, pillCap: 3,
    have: { huichun_dan: { 0: 6, 1: 3, 2: 1 }, huiqi_dan: { 0: 4, 1: 2 }, humai_dan: { 1: 1, 2: 1 }, ningshen_dan: { 0: 2 } },
    take: { huichun_dan: { 1: 2, 2: 1 }, huiqi_dan: { 0: 3 }, humai_dan: { 1: 1 }, ningshen_dan: { 0: 1 } },
    fu: [["dundi_fu", "遁地符", 5, "局内 G"], ["fu_wood", "木符", 2, "破土盾"], ["fu_water", "水符", 1, "破火盾"], ["huqi_fu", "护器符", 1, "护一件法器"]],
    fuTake: { dundi_fu: 2, fu_wood: 2 },
    pouch: { cap: 2, items: [{ id: "water_jade", name: "水灵玉", q: 2 }] },
  };
  const takeN = (id) => Object.values(PK.take[id] || {}).reduce((a, b) => a + b, 0);
  const pillKinds = () => Object.keys(PILL).filter((id) => !PILL[id].pre && takeN(id) > 0).length;
  function pillStep(id, q, d) {
    const t = (PK.take[id] = PK.take[id] || {}), have = (PK.have[id] || {})[q] || 0, cur = t[q] || 0;
    if (d > 0) {
      if (cur >= have) return fail("仓库里只有 " + have + " 枚" + RQ[q].n + PILL[id].name);
      if (PILL[id].pre) { if (takeN(id) >= 1) return fail("出发前服用：每种只服 1 枚"); }
      else {
        if (takeN(id) >= PK.pillCap) return fail(`丹药囊每种只装 ${PK.pillCap} 枚`);
        if (!takeN(id) && pillKinds() >= PK.pillSlots) return fail(`丹药囊只能装 ${PK.pillSlots} 种`);
      }
    } else if (cur <= 0) return !1;
    t[q] = cur + d;
    emit();
    return !0;
  }
  function fuStep(id, d) {
    const f = PK.fu.find((x) => x[0] === id), cur = PK.fuTake[id] || 0;
    if (d > 0 && cur >= Math.min(3, f[2])) return fail(cur >= f[2] ? "仓库里没有更多了" : "每种符箓最多带 3 张");
    if (d < 0 && cur <= 0) return !1;
    PK.fuTake[id] = cur + d;
    emit();
    return !0;
  }
  function fail(msg) { LO.toast(msg, "zhu"); return !1; }

  // ---------------- 属性分项 ----------------
  const ST = { mode: "run" }; // "cave" 洞府中（不含本局临时）/ "run" 按出行计（含炼化增益与出发前丹药）
  function activeXinfa(over = {}) {
    const n = LO.slotCount("xinfa"), out = [];
    LO.S.xinfa.slice(0, n).forEach((id) => id && !out.find((x) => x.id === id) && out.push({ id, from: null }));
    for (const s of ["sword", "robe", "jade"]) {
      const g = over[s] !== undefined ? gearBy(over[s]) : eq(s);
      if (g && g.sp) {
        const hit = out.find((x) => x.id === g.sp.xinfa);
        if (hit) hit.dup = g.name; else out.push({ id: g.sp.xinfa, from: g.name });
      }
    }
    return out;
  }
  function artifactNow() {
    if (!LO.slotCount("artifact") || !LO.S.artifact) return null;
    return LD.ARTIFACTS.find((a) => a.uid === LO.S.artifact) || null;
  }
  function parts(over = {}) {
    const P = [], add = (k, t, v, src, grp, label, temp) => P.push({ k, t, v, src, grp, label, temp: !!temp });
    for (const [k, v] of Object.entries(BASE)) add(k, "base", v, "realm", "境", "境界 · " + REALM.name);
    for (const [k, v] of Object.entries(PROG)) add(k, "flat", v, "prog", "境", `修为进度 ${Math.round((REALM.xp / REALM.need) * 100)}%`);
    for (const s of ["sword", "robe", "jade"]) {
      const g = over[s] !== undefined ? gearBy(over[s]) : eq(s);
      if (!g) continue;
      for (const m of g.base) NONCOMBAT.includes(m[0]) || add(m[0], m[1], m[2], s, "器", `${SLOTN[s]} · ${g.name} 基础`);
      for (const m of g.aff) NONCOMBAT.includes(m[0]) || add(m[0], m[1], m[2], s, "器", `${SLOTN[s]} · ${g.name} 词条`);
    }
    const a = artifactNow();
    if (a) for (const m of ARTP[a.art](a.level + (a.bonus || 0))) add(m[0], m[1], m[2], "artifact", "器", `法宝 · ${a.name}（祭炼${NUMC[a.level + (a.bonus || 0)]}重${a.native ? " · 本命" : ""}）`);
    for (const x of activeXinfa(over)) for (const m of XM[x.id] || []) add(m[0], m[1], m[2], "xinfa:" + x.id, "心", `心法《${LD.XINFA[x.id].name}》${x.from ? "（" + x.from + "词条）" : ""}`);
    add("vuln", "flat", -0.08, "buff", "局", "炼化 · 灵气充盈三档（余 3 分 30 秒）", 1);
    add("hp", "pct", 0.05, "buff", "局", "炼化 · 灵气充盈三档（余 3 分 30 秒）", 1);
    if (takeN("humai_dan")) add("vuln", "flat", -0.1, "preRun", "局", "出发前 · 护脉丹", 1);
    if (takeN("ningshen_dan")) add("sense", "flat", 20, "preRun", "局", "出发前 · 凝神丹", 1);
    return P;
  }
  // 单项：{ final, sum0（基础 + 固定）, list: [{…part, c 贡献}] }
  function stat(k, o = {}) {
    const mode = o.mode || ST.mode;
    const all = parts(o.over).filter((p) => p.k === k || (k === "dashCd" && p.k === "dashCdr"));
    const on = all.filter((p) => mode === "run" || !p.temp);
    let base = 0, flat = 0, pct = 0, cdr = 0;
    for (const p of on) {
      if (p.k === "dashCdr") cdr += p.v;
      else if (p.t === "base") base += p.v;
      else if (p.t === "flat") flat += p.v;
      else if (p.t === "pct") pct += p.v;
    }
    const sum0 = base + flat;
    let final = sum0 * (1 + pct);
    if (k === "dashCd") final = sum0 * (1 - cdr);
    const list = all.map((p) => ({ ...p, off: !on.includes(p), c: p.k === "dashCdr" ? -sum0 * p.v : p.t === "pct" ? sum0 * p.v : p.v }));
    return { k, final, base, flat, pct, cdr, sum0, list };
  }
  const roundOf = (k, v) => (["hp", "mp", "atk", "spell", "def", "sense", "dashMax"].includes(k) ? Math.round(v) : v);
  function fmt(k, v) {
    const r = ROWS[k] || {};
    if (r.f) return r.f(v);
    return String(Math.round(v * 10) / 10);
  }
  function fmtD(k, d) {
    const r = ROWS[k] || {};
    const s = Math.abs(d);
    const t = r.f && k !== "vuln" && k !== "chargeDmg" ? r.f(s) : k === "vuln" || k === "chargeDmg" ? Math.round(s * 100) + "%" : String(Math.round(s * 10) / 10);
    return (d > 0 ? "+" : "−") + t;
  }
  const shown = (k) => {
    const r = ROWS[k];
    if (!r.opt) return !0;
    return stat(k, { mode: "run" }).list.length > 0;
  };

  // 一笔分段条：按来源大类，宽度 ∝ 贡献（取绝对值）；本局临时在洞府中为虚
  function barHTML(k, w = 64) {
    const s = stat(k), r = ROWS[k];
    if (r.lower && k !== "vuln") return `<span class="cf-bar none" style="width:${w}px"></span>`;
    const by = { 境: 0, 器: 0, 心: 0, 局: 0 }, off = { 局: 0 };
    for (const p of s.list) {
      if (p.k === "dashCdr") continue;
      if (p.off) off[p.grp] = (off[p.grp] || 0) + Math.abs(p.c);
      else by[p.grp] += Math.abs(p.c);
    }
    const tot = Object.values(by).reduce((a, b) => a + b, 0) + (off.局 || 0) || 1;
    const seg = Object.entries(by).filter(([, v]) => v > 0).map(([g, v]) => `<i style="flex:${v / tot};background:${GRP[g].c}"></i>`).join("");
    const o = off.局 ? `<i class="off" style="flex:${off.局 / tot}"></i>` : "";
    return `<span class="cf-bar" style="width:${w}px">${seg}${o}</span>`;
  }
  // 来源小印（这一项有哪些大类在加）
  function srcSeals(k) {
    const s = stat(k), gs = [...new Set(s.list.filter((p) => p.k !== "dashCdr" || 1).map((p) => p.grp))];
    return gs.map((g) => `<i class="cf-src g-${g}" title="${GRP[g].n}">${g}</i>`).join("");
  }
  // 明细浮签内容
  function detailHTML(k) {
    const s = stat(k), r = ROWS[k];
    const rows = s.list.map((p) => {
      const v = p.k === "dashCdr" ? `−${Math.round(p.v * 100)}% <small>（−${p.c.toFixed(2).replace("-", "")} 秒）</small>`
        : p.t === "pct" ? `+${Math.round(p.v * 100)}% <small>（${fmtD(k, p.c)}）</small>`
        : p.t === "base" ? fmt(k, p.v) : fmtD(k, p.c);
      return `<div class="dr ${p.off ? "off" : ""}"><i class="cf-src g-${p.grp}">${p.grp}</i><span class="dl">${p.label}${p.off ? "<em>出行时生效</em>" : ""}</span><b>${v}</b></div>`;
    }).join("");
    const fv = (v) => (r.f ? r.f(v) : String(Math.round(v * 10) / 10));
    const formula = k === "vuln" ? `受伤：同一乘区相加`
      : k === "dashCd" ? `${fv(s.base)} ×（1 − ${Math.round(s.cdr * 100)}%）`
      : s.pct ? `（${fv(s.base)} ${fmtD(k, s.flat)}）×（1 + ${Math.round(s.pct * 100)}%）` : `${fv(s.base)} ${s.flat ? fmtD(k, s.flat) : ""}`;
    return `<div class="dh"><span class="dn">${r.n}</span><span class="dv">${fmt(k, roundOf(k, s.final))}${r.u ? `<small>${r.u}</small>` : ""}</span><span class="dm">${ST.mode === "run" ? "按出行计" : "洞府中"}</span></div>
      ${r.tip ? `<div class="dt">${r.tip}</div>` : ""}
      <div class="dlist">${rows || `<div class="dr"><span class="dl">（无）</span></div>`}</div>
      <div class="df">${formula}${k === "atk" || k === "spell" ? "<br>未计：阵法、神龛附灵、满势等局内条件加成" : ""}</div>`;
  }

  // ---------------- 物品签（仿 src/ui/icons.js itemTag：一笔圆相品级色 + 图标 + 同色淡晕 + 仙 / 极角印） ----------------
  function tagHTML(id, q, o = {}) {
    const R = RQ[q || 0];
    const cs = q >= 3 ? `<i class="cs" style="background:${R.c}">${R.s}</i>` : "";
    const n = o.n != null ? `<i class="lv">${o.n}</i>` : "";
    return `<span class="sk ${o.cls || ""} e${(o.e || 0) % 3 + 1}" style="--s:${o.size || 52}px;--el:${R.c};--elw:${R.c}2e">${`<span class="ico" style="${LO.iconStyle(id)}"></span>`}${cs}${n}${o.key ? `<i class="k">${o.key}</i>` : ""}</span>`;
  }
  // 法器详情：基础 / 词条 / 特殊词条（= 心法）/ 可替换（与身上比 ▲▼）
  function gearHTML(slot) {
    const g = eq(slot);
    const cands = GEARS.filter((x) => x.slot === slot && x.uid !== EQ[slot]);
    const cmp = (x) => {
      const ds = MAIN.concat(["dashMax"]).map((k) => {
        const a = roundOf(k, stat(k).final), b = roundOf(k, stat(k, { over: { [slot]: x.uid } }).final);
        const d = b - a;
        return Math.abs(d) < 1e-6 ? "" : `<span class="${d > 0 ? "up" : "dn"}">${ROWS[k].n}${d > 0 ? "▲" : "▼"}${fmtD(k, d).slice(1)}</span>`;
      }).filter(Boolean);
      const xsp = x.sp ? `<span class="up">「${x.sp.text}」</span>` : "";
      const lose = g && g.sp && (!x.sp || x.sp.xinfa !== g.sp.xinfa) ? `<span class="dn">失「${g.sp.text}」</span>` : "";
      return ds.concat(xsp ? [xsp] : [], lose ? [lose] : []).join(" ") || "<span class='dim'>无变化</span>";
    };
    const head = g ? `<div class="gh">${tagHTML(g.id, g.q, { size: 56 })}<div><div class="gn" style="color:${RQ[g.q].t}">${g.name}</div><div class="gs">${SLOTN[slot]} · ${RQ[g.q].n} · ${g.lv} 级${g.bound ? " · 认主" : ""}</div></div></div>
      <div class="gl"><span class="k">基础</span>${g.base.map(modText).join(" · ")}</div>
      ${g.aff.length ? `<div class="gl"><span class="k">词条</span>${g.aff.map(modText).join(" · ")}</div>` : ""}
      ${g.sp ? `<div class="gl sp"><span class="k">特殊</span>「${g.sp.text}」= 心法《${LD.XINFA[g.sp.xinfa].name}》${LO.S.xinfa.includes(g.sp.xinfa) ? " · <span class='dn'>心法栏也装了，同名不叠加</span>" : ""}</div>` : ""}`
      : `<div class="gh"><div class="gn">（空）</div></div>`;
    return `${head}<div class="gc"><div class="gct">仓库里的${SLOTN[slot]} · 点一下换上</div>${cands.map((x) => `<div class="gcr" data-equip="${slot}:${x.uid}">${tagHTML(x.id, x.q, { size: 38 })}<div><div class="gcn" style="color:${RQ[x.q].t}">${x.name} <small>${RQ[x.q].s} · ${x.lv} 级</small></div><div class="gcd">${cmp(x)}</div></div></div>`).join("")}</div>`;
  }
  function equip(slot, uid) {
    EQ[slot] = uid;
    syncGear();
    const g = gearBy(uid);
    LO.toast(`${SLOTN[slot]}换上 ${g.name}`);
    emit();
  }

  // ---------------- 浮签（点开的明细，贴在触发元素旁；点空白处收起） ----------------
  let pop = null, popKey = "";
  function openPop(anchor, html, key, side = "right") {
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "cf-pop ink-tip";
      document.body.appendChild(pop);
      window.inkui && inkui.decorate(document);
    }
    pop.innerHTML = `<i class="ink-sheet" aria-hidden="true"></i>` + html;
    pop.classList.add("on");
    popKey = key;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let x = side === "left" ? r.left - w - 14 : r.right + 14, y = r.top - 10;
    if (x + w > 1272) x = r.left - w - 14;
    if (x < 8) x = r.right + 14;
    y = Math.max(8, Math.min(712 - h, y));
    pop.style.transform = `translate(${x}px, ${y}px) rotate(-.5deg)`;
  }
  function closePop() { if (pop) pop.classList.remove("on"); popKey = ""; document.querySelectorAll("[data-pop].on").forEach((x) => x.classList.remove("on")); }
  function updatePop(html) { if (pop && popKey) pop.innerHTML = `<i class="ink-sheet" aria-hidden="true"></i>` + html; }
  document.addEventListener("click", (ev) => {
    const e = ev.target.closest("[data-equip]");
    if (e) { const [s, u] = e.dataset.equip.split(":"); equip(s, u); return; }
    if (pop && !ev.target.closest(".cf-pop") && !ev.target.closest("[data-pop]")) closePop();
  });

  // ---------------- 变化订阅（LO 的装配变化也会触发） ----------------
  const subs = [];
  function emit() { subs.forEach((f) => f()); if (popKey && CF.reopen) CF.reopen(popKey); }
  LO.on(() => emit());

  // hash：#mode=cave&stat=atk&gear=sword&tab=xinfa&pane=pack …（截图定状态）
  const H = Object.fromEntries(location.hash.slice(1).split("&").filter(Boolean).map((kv) => kv.split("=")));
  if (H.mode) ST.mode = H.mode;

  // 功法 v2 示意：再加两个未领悟法术，演示"功法来源一行"（来源细节由战斗设计的指引面板给）
  LD.SPELLS.rock = { id: "rock", name: "落石诀", glyph: "石", el: "earth", role: "群控", cost: 26, cd: 12, cast: 0.3, range: 14, desc: "召落山石砸向指定处，震晕", status: "震晕 1 秒", src: "残页 1/3 · 青岚山外石傀", page: [1, 3], dmg: () => "（功法 v2 示意）" };
  LD.SPELLS.thunder = { id: "thunder", name: "引雷诀", glyph: "雷", el: "metal", role: "单体", cost: 30, cd: 14, cast: 0.3, range: 16, desc: "引一道天雷落于敌身", status: "", src: "残页 0/3 · 出处未明", page: [0, 3], dmg: () => "（功法 v2 示意）" };

  window.CF = { RQ, GROUPS, ROWS, GRP, REALM, MAIN, GEARS, EQ, SLOTN, eq, gearBy, PILL, PK, takeN, pillKinds, pillStep, fuStep, ST, stat, fmt, fmtD, roundOf, shown, barHTML, srcSeals, detailHTML, tagHTML, gearHTML, equip, openPop, closePop, updatePop, get popKey() { return popKey; }, on: (f) => subs.push(f), emit, H, activeXinfa, artifactNow, modText, reopen: null };
})();
