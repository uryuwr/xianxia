// 数值实测（难度曲线复核）：按真实存档状态刷出各类敌人，用主角真实的普攻 / 法术去打，记录 TTK 与承伤。
// 用法：
//   node tools/run.mjs num_ttk "scene=run&region=tutorial"   序章：凡人 + 锈剑，按序章 v2 的 6 场战斗连续打（气血不回满，带金符 / 回春丹）
//   node tools/run.mjs num_ttk "scene=run&region=r1"         区域一：练气一 / 三 / 四层（+ 青牙），然后切到区域二：练气五 / 六 / 八层（+ 碧鳞）、九层心魔试炼
//   node tools/run.mjs num_ttk "scene=run&region=r2"         只测区域二
//   加 &quick=1 跳过 Boss 实战（只测静态数值）
// 测量方法（全部来自运行时，不手算）：
//   静态：world.dealDamage 逐段打一只冻结的敌人（不暴击），读出每段伤害；再按运行时的暴击率 / 暴伤抽样 2000 次，得到"平均几段打死"
//         敌人每个招式用 dealDamage 打主角一下，读出每下伤害与占主角气血的比例
//   实战：挂一个机器人，按住左键追着打（法宝自动攻击照常）。
//         单怪：主角无敌，只用普攻；精英 / Boss：普攻 + 法术冷却好就放；
//         成群：主角不无敌，两种机器人各打一次——"莽"（从不闪避）与"闪"（看到近身预警 70% 概率在出手前闪开）；
//         快死时记为"会阵亡"并停止（不触发身陨结算）
//   序章：读 src/data/levels/tutorial.js 的 tutorialLayout.enemyMul（序章敌人倍率），在刷出的怪上按约定施加（见报告 §5），
//         连续打 7 组怪，组间按 25 秒走路回血；开箱后才有回春丹 ×2（气血 < 35% 时吃）与金符 ×3（精英有盾时掷）
// 结果：控制台表格 + work/num_ttk_<region>.json（报告 docs/review/numeric/难度曲线复核_v1.md 引用）
import fs from "node:fs";
import path from "node:path";

// 序章 v2（src/data/levels/tutorial.js steps 的刷怪顺序）
const PROLOGUE = [
  { id: "wolf_first", mobs: ["wolf"] },
  { id: "wolves", mobs: ["wolf", "wolf"] },
  { id: "ambush", mobs: ["wolf_grey", "wolf_grey"] },
  { id: "bamboo", mobs: ["wolf", "wolf", "wolf_grey"], chestAfter: !0 },
  { id: "golem", mobs: ["golem", "wolf_grey", "wolf_grey"] },
  { id: "elite", mobs: ["wolf_elite"], shield: "wood" },
  { id: "cave", mobs: ["wolf_grey", "wolf_grey"] },
];

// Q（剑气斩）次数：一组小怪 / 一只精英（自带护盾）/ 青牙（木 → 土两段盾）各要放几次 Q 才打死（冷却清零；两次之间清掉破甲与破盾易伤，模拟 8 秒冷却）
const Q_R1 = { group: ["wolf", "wolf", "wolf_grey", "wolf_grey"], elite: "wolf_elite", boss: "qingya" };
const Q_R2 = { group: ["vine", "bat", "bat", "bat"], elite: "vine_elite", elite2: "wolf_elite_r2", boss: "qingya" };

// 存档预设：境界、装备（[底材, 等级, 品质]，不带随机词条 = 保守）、法术、心法、法宝
const PRESETS = {
  tutorial: [
    { id: "T0", label: "序章 凡人+锈剑", realm: [0, 0], gear: { sword: ["rust_sword", 1, 0] }, spells: [], xinfa: [], mobs: ["wolf", "wolf_grey", "golem"], elites: ["wolf_elite"], packs: [], prologue: PROLOGUE },
  ],
  r1: [
    { id: "R1-L1", label: "区域一 第2局 练气一层+锈剑", realm: [1, 1], gear: { sword: ["rust_sword", 1, 0] }, spells: ["sword_qi"], xinfa: [],
      mobs: ["wolf", "wolf_grey", "golem"], elites: ["wolf_elite"], packs: [["wolf", "wolf", "wolf_grey", "wolf_grey"], ["wolf_elite", "wolf", "wolf"]], q: Q_R1 },
    { id: "R1-L3", label: "区域一 练气三层+灵品青锋剑", realm: [1, 3], gear: { sword: ["sword_qingfeng", 2, 1], robe: ["robe_bu", 2, 0] }, spells: ["sword_qi", "vine"], xinfa: [],
      mobs: ["wolf", "wolf_grey", "golem"], elites: ["wolf_elite"], packs: [["golem", "wolf_grey", "wolf_grey", "wolf"], ["wolf_elite", "wolf", "wolf"]], q: Q_R1 },
    { id: "R1-L4", label: "区域一 练气四层（青牙前）", realm: [1, 4], gear: { sword: ["sword_qingfeng", 3, 1], robe: ["robe_bu", 3, 1] }, spells: ["sword_qi", "vine"], xinfa: ["sharp"],
      mobs: ["wolf", "wolf_grey", "golem"], elites: ["wolf_elite"], packs: [["wolf", "wolf", "wolf", "wolf_grey", "wolf_grey"], ["wolf_elite", "wolf", "wolf"]], boss: "qingya" },
  ],
  r2: [
    { id: "R2-L5", label: "区域二 首探 练气五层", realm: [1, 5], gear: { sword: ["sword_qingfeng", 4, 1], robe: ["robe_bu", 4, 1], jade: ["jade_qing", 4, 0] }, spells: ["sword_qi", "vine"], xinfa: ["sharp"],
      mobs: ["bat", "vine", "wolf"], elites: ["wolf_elite_r2", "vine_elite"], packs: [["vine", "bat", "bat", "bat"], ["vine_elite", "bat", "bat"]], q: Q_R2 },
    { id: "R2-L6", label: "区域二 练气六层+灵品竹影剑", realm: [1, 6], gear: { sword: ["sword_zhuying", 6, 1], robe: ["robe_lingsi", 6, 1], jade: ["jade_shuiling", 6, 0] }, spells: ["sword_qi", "vine"], xinfa: ["sharp"],
      mobs: ["bat", "vine", "wolf"], elites: ["wolf_elite_r2", "vine_elite"], packs: [["wolf", "wolf", "vine", "wolf"], ["vine_elite", "bat", "bat"]] },
    { id: "R2-L7", label: "区域二 练气七层（只测 Q 次数）", realm: [1, 7], gear: { sword: ["sword_zhuying", 7, 1], robe: ["robe_lingsi", 7, 1], jade: ["jade_shuiling", 7, 0] }, spells: ["sword_qi", "vine", "frost"], xinfa: ["sharp"],
      mobs: [], elites: [], packs: [], q: Q_R2 },
    { id: "R2-L8", label: "区域二 练气八层+宝品+飞剑（碧鳞前）", realm: [1, 8], gear: { sword: ["sword_zhuying", 8, 2], robe: ["robe_lingsi", 8, 2], jade: ["jade_shuiling", 8, 1] }, artifact: "art_flying_sword",
      spells: ["sword_qi", "vine", "frost"], xinfa: ["sharp"],
      mobs: ["bat", "vine", "wolf"], elites: ["wolf_elite_r2", "vine_elite"], packs: [["vine", "bat", "bat", "bat", "bat"], ["vine_elite", "vine", "bat"]], boss: "bilin" },
    { id: "R2-L9", label: "练气九层（心魔试炼，洞府 XinmoTrial）", realm: [1, 9], gear: { sword: ["sword_zhuying", 9, 2], robe: ["robe_lingsi", 9, 2], jade: ["jade_shuiling", 9, 1] }, artifact: "art_flying_sword",
      spells: ["sword_qi", "vine", "frost"], xinfa: ["sharp"], mobs: ["bat"], elites: [], packs: [], boss: "xinmo_trial" },
  ],
};

// 目标区间（本次复核定的，见报告 §3）
const TARGET = {
  // 单怪：平均普攻段数（运行时每段伤害 + 运行时暴击率抽样）
  hits: {
    "T0:wolf": [2, 3.5],
    "R1-L1:wolf": [4.5, 6.2], "R1-L1:wolf_grey": [3, 4.5], "R1-L1:golem": [7, 11],
    "R1-L3:wolf": [4, 6], "R1-L4:wolf": [3.5, 5.5], "R1-L4:golem": [5, 9],
    "R2-L5:bat": [4.5, 6.5], "R2-L5:vine": [5, 8], "R2-L5:wolf": [2.5, 4.5],
    "R2-L6:bat": [4, 6.5], "R2-L8:bat": [3.5, 5.5], "R2-L8:vine": [4, 7],
  },
  // 成群掉血比例（"莽"机器人：从不闪避；"闪"：七成预警会闪）
  pack: { masher: { normal: [0.03, 0.6], elite: [0.25, 1.01] }, dodger: { normal: [0, 0.35], elite: [0, 0.75] } },
  // 精英（普攻 + 法术）击杀秒数
  eliteSec: [7, 25],
  // 序章：莽机器人（带丹药、金符）全程不阵亡，狼首一战掉血 ≥ 35%
  prologue: { eliteLostMin: 0.3 },
};

// 首领成长曲线的存档档位：按层数给"正常进度"的装备、法术、心法（L = 10 表示筑基一层）
function curvePreset(L) {
  const zj = L >= 10, lay = zj ? 9 : L;
  const gear = lay <= 4
    ? { sword: lay <= 1 ? ["rust_sword", 1, 0] : ["sword_qingfeng", lay, lay >= 3 ? 1 : 0], ...(lay >= 3 ? { robe: ["robe_bu", lay, lay >= 4 ? 1 : 0] } : {}) }
    : { sword: ["sword_zhuying", lay, lay >= 7 ? 2 : 1], robe: ["robe_lingsi", lay, lay >= 7 ? 2 : 1], jade: ["jade_shuiling", lay, lay >= 8 ? 1 : 0] };
  const spells = ["sword_qi", ...(lay >= 3 ? ["vine"] : []), ...(lay >= 7 ? ["frost"] : []), ...(zj ? [] : [])];
  return {
    id: "C-L" + L, label: zj ? "筑基一层" : `练气${"一二三四五六七八九"[L - 1]}层`, realm: zj ? [2, 1] : [1, L], gear,
    artifact: lay >= 7 ? "art_flying_sword" : undefined, spells, xinfa: lay >= 4 ? ["sharp"] : [], mobs: [], elites: [], packs: [],
  };
}

// 构筑与成长 v1（数值策划 2026-11-18）：按流派配装的首领持续输出。curve=qingya&build=base,jian,fa,shen,bao,shou
//   只在页面内存里改数据（新心法《凝神》、葫芦去掉被动回气、聚灵阵改"灵池"），不改 src/。法宝等级 = 祭炼重数（修 bug 后的口径）。
//   框架 v0.1 的栏位：心法练二 1 栏 / 练八 2 栏、法宝练六、阵法练七。新机制（雷痕、五雷令、定风珠、拂柳、凌波、不动、轮转）测不了，另做解析估算。
function buildPreset(b, L) {
  const p = curvePreset(L), lay = L >= 10 ? 9 : L;
  const x2 = L >= 8, art = L >= 6, form = L >= 7, sp3 = L >= 7;
  const artLv = L >= 10 ? 3 : L >= 8 ? 2 : 1; // 本命祭炼：练六 1 重、练八 2 重、筑基 3 重（03 文档 §2.3 的正常节奏）
  const zh = L >= 10 ? 3 : L >= 7 ? 2 : 1; // 核心法术的重
  const unlocks = { xinfaSlots: L >= 8 ? 2 : L >= 2 ? 1 : 0, artifactSlot: art, formationSlot: form, spellSlots: L >= 7 ? 3 : L >= 3 ? 2 : 1 };
  const B = {
    base: { ...p, unlocks: { ...unlocks, artifactSlot: lay >= 7, xinfaSlots: lay >= 8 ? 2 : lay >= 4 ? 1 : 0 } },
    jian: { spells: ["sword_qi", "ningfeng", ...(sp3 ? ["frost"] : [])], xinfa: ["mom_gather", ...(x2 ? ["mom_chain"] : [])], artifact: art ? "art_flying_sword" : undefined, formation: form ? "sword_array" : undefined, zhong: { ningfeng: zh } },
    fa: { spells: L >= 7 ? ["sword_qi", "fire_talisman", "frost"] : ["sword_qi", "rock"], xinfa: ["ningshen", ...(x2 ? ["fire_root"] : [])], artifact: art ? "art_qiankun" : undefined, formation: form ? "spirit_array" : undefined, zhong: L >= 7 ? { frost: zh, fire_talisman: zh } : { rock: zh } },
    shen: { spells: ["sword_qi", "zhishui", ...(sp3 ? ["earth_walk"] : [])], xinfa: ["dash_flow", ...(x2 ? ["mom_return"] : [])], artifact: art ? "art_seal" : undefined, formation: form ? "sword_array" : undefined, zhong: { zhishui: zh } },
    bao: { spells: ["sword_qi", "thunder", ...(sp3 ? ["frost"] : [])], xinfa: ["sharp", ...(x2 ? ["crit_thunder"] : [])], artifact: art ? "art_flying_sword" : undefined, formation: form ? "sword_array" : undefined, zhong: { thunder: zh } },
    shou: { spells: ["sword_qi", "earth_shield", ...(sp3 ? ["rock"] : [])], xinfa: ["vajra"], artifact: art ? "art_seal" : undefined, formation: form ? "sword_array" : undefined, zhong: { earth_shield: zh } },
  }[b];
  if (!B) throw new Error("unknown build " + b);
  if (b === "base") return { ...B, id: `base-L${L}`, label: `现状 ${p.label}`, build: b };
  return { ...p, ...B, id: `${b}-L${L}`, label: `${b} ${p.label}`, build: b, unlocks, artLevel: artLv, mpPills: L >= 5 ? 3 : 0 };
}

const ok = (cond, msg, extra) => console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));

export default async function (page, c) {
  const url = new URL(page.url());
  const base = url.origin;
  const region0 = url.searchParams.get("region") || "r1";
  const quick = url.searchParams.get("quick") === "1";
  const plan = region0 === "tutorial" ? ["tutorial"] : region0 === "r2" ? ["r2"] : url.searchParams.get("only") === "1" ? ["r1"] : ["r1", "r2"];
  const out = { at: new Date().toISOString(), regions: {} };
  // 首领成长曲线：curve=qingya|bilin → 练二 … 筑基各档，"莽"（不闪）与"闪"各打 trials 次（主角不无敌，带回春丹 3 枚）
  // 构筑与成长 v1：流派配装（build=base,jian,fa,shen,bao,shou&levels=3,6,9,10），本体输出 + 五行破盾，见页面内 buildCurve
  if (url.searchParams.get("bcurve") === "1") {
    if (url.searchParams.get("slot") == null) await page.goto(`${base}/?scene=run&region=${region0}&slot=3`, { waitUntil: "commit", timeout: 90000 });
    await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 120000 });
    await c.wait(1500);
    await install(page, {});
    const levels = (url.searchParams.get("levels") || "3,6,9,10").split(",").map(Number);
    const builds = (url.searchParams.get("build") || "base,jian,fa,shen,bao,shou").split(",");
    const rows = [];
    const f = path.join(process.cwd(), "work", `num_ttk_build${url.searchParams.get("tag") ? "_" + url.searchParams.get("tag") : ""}.json`);
    for (const b of builds) for (const L of levels) {
      const pre = buildPreset(b, L);
      const r = await c.ev((a) => window.__T.buildCurve(a), { pre, bodySec: Number(url.searchParams.get("sec") || 45), shieldHp: Number(url.searchParams.get("shieldHp") || (L >= 9 ? 2400 : 1500)), shieldEls: (url.searchParams.get("els") || "wood,earth,water,fire,metal").split(","), shieldTimeout: Number(url.searchParams.get("stimeout") || 40) });
      rows.push(r);
      const m = r.body.mp || {};
      console.log(`${pre.label.padEnd(16)} atk ${r.hero.atk} 法力 ${r.hero.spell} mp ${r.hero.mp} 暴击 ${r.hero.crit}×${r.hero.critDmg} 攻速 ${r.hero.aspd} 假人防 ${r.def} | 本体 DPS ${r.body.dps}（普攻 ${r.body.dmg.basic} 法术等 ${r.body.dmg.spell} 法宝 ${r.body.dmg.art} 斩 ${r.body.dmg.charge}，斩 ${r.body.charges} 次）真气 耗 ${m.spent} 回 ${m.gain} 施法 ${m.casts} 缺蓝 ${m.denied} 丹 ${m.pills} | 破盾秒 ${Object.entries(r.shields).map(([k, v]) => k + " " + v).join(" ")}`);
      fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
    }
    console.log("saved", f);
    const errs = await c.ev(() => window.__errors || []);
    ok(!errs.length, "no page errors", errs.slice(0, 3));
    return;
  }
  const curve = url.searchParams.get("curve");
  if (curve) {
    if (url.searchParams.get("slot") == null) await page.goto(`${base}/?scene=run&region=${region0}&slot=2`, { waitUntil: "commit", timeout: 90000 });
    await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 120000 });
    await c.wait(1500);
    await install(page, { tokens: url.searchParams.get("tokens"), armor: url.searchParams.get("armor") });
    const levels = (url.searchParams.get("levels") || "2,3,4,5,6,7,9,10").split(",").map(Number);
    const builds = (url.searchParams.get("build") || "").split(",").filter(Boolean);
    const bots = (url.searchParams.get("bots") || "masher,dodger").split(",");
    const rows = [];
    for (const b of builds.length ? builds : [null]) for (const L of levels) {
      const pre = b ? buildPreset(b, L) : curvePreset(L);
      const r = await c.ev((a) => window.__T.bossCurve(a), { pre, boss: curve, bots, trials: Number(url.searchParams.get("trials") || 2), timeout: Number(url.searchParams.get("timeout") || 180), god: url.searchParams.get("god") === "1", bossHp: Number(url.searchParams.get("bossHp") || 0) });
      rows.push(r);
      const fmt = (b) => `${b.bot} 胜 ${pc(b.winRate)} 亡 ${pc(b.deathRate)} 用时 ${b.sec}s 掉血 ${pc(b.lost)} 首领剩 ${pc(b.bossLeft)} 阶段 ${b.phase} DPS ${b.dps} 斩占 ${pc(b.chargeShare)}` + (b.mp ? ` 真气 耗${b.mp.spent} 回${b.mp.gain} 施法${b.mp.casts} 缺蓝${b.mp.denied} 丹${b.mp.pills} 法术占${pc(b.mp.spellShare)} 法宝占${pc(b.mp.artShare)}` : "");
      console.log(`${pre.label.padEnd(18)} hp ${r.hero.hp} atk ${r.hero.atk} 法力 ${r.hero.spell} mp ${r.hero.mp} 暴击 ${r.hero.crit}×${r.hero.critDmg} 攻速 ${r.hero.aspd} | ${r.bots.map(fmt).join("  |  ")}`);
    }
    const f = path.join(process.cwd(), "work", `num_ttk_curve_${curve}${url.searchParams.get("tag") ? "_" + url.searchParams.get("tag") : ""}.json`);
    fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), boss: curve, rows }, null, 1));
    console.log("saved", f);
    const errs = await c.ev(() => window.__errors || []);
    ok(!errs.length, "no page errors", errs.slice(0, 3));
    return;
  }
  for (const [i, region] of plan.entries()) {
    if (i > 0 || url.searchParams.get("slot") == null) {
      await page.goto(`${base}/?scene=run&region=${region}&slot=${region === "tutorial" ? 1 : region === "r1" ? 2 : 3}`, { waitUntil: "commit", timeout: 90000 });
    }
    await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && window.__enemies && __enemies.ready, null, { timeout: 120000 });
    await c.wait(1500);
    await install(page, { tokens: url.searchParams.get("tokens"), armor: url.searchParams.get("armor"), fc: url.searchParams.get("fc") === "1", aspd0: Number(url.searchParams.get("aspd0") || 0.8), aspd1: Number(url.searchParams.get("aspd1") || 0), xinmoHp: url.searchParams.get("xinmoHp") });
    const R = (out.regions[region] = []);
    const only = (url.searchParams.get("pre") || "").split(",").filter(Boolean);
    for (const pre of PRESETS[region].filter((p) => !only.length || only.includes(p.id))) {
      const r = await c.ev((p) => window.__T.preset(p), { ...pre, quick, elitesOnly: url.searchParams.get("elitesOnly") === "1", trials: Number(url.searchParams.get("trials") || 3) });
      R.push(r);
      printPreset(r);
      checkPreset(r);
    }
  }
  const errs = await c.ev(() => window.__errors || []);
  ok(!errs.length, "no page errors", errs.slice(0, 3));
  const f = path.join(process.cwd(), "work", `num_ttk_${region0}${url.searchParams.get("tag") ? "_" + url.searchParams.get("tag") : ""}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: !0 });
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
  console.log("saved", f);
}

const pc = (v) => (v * 100).toFixed(0) + "%";
function printPreset(r) {
  const h = r.hero;
  console.log(`\n=== ${r.id} ${r.label} ===`);
  console.log(`主角 hp ${h.hp} atk ${h.atk} spell ${h.spell} def ${h.def} 暴击 ${h.crit}×${h.critDmg} 回血 ${h.hpRegen}/s mp ${h.mp} 攻速 ${h.aspd} 闪身 ${h.dash[0]}次/${h.dash[1]}s 法术 ${r.spells.join(",") || "-"}${r.mul ? " 序章倍率 " + JSON.stringify(r.mul) : ""}`);
  for (const m of r.mobs) {
    const s = m.static;
    console.log(
      `  ${m.type.padEnd(10)} Lv${s.level} hp ${s.hp}${s.shield ? `(+盾${s.shield.el} ${s.shield.hp})` : ""} atk ${s.atk} def ${s.def} | 普攻每段 ${s.steps.join("/")} 一套 ${s.combo} | 平均 ${s.hitsMean} 段 = ${(s.hitsMean / 3).toFixed(2)} 套（不暴击 ${s.hitsNoCrit}，≤3 段的概率 ${pc(s.p3)}）`,
    );
    if (m.live) console.log(`             实战(只普攻): ${m.live.map((t) => `${t.hits}段/${t.sec}s${t.killed ? "" : "×"}`).join("  ")}  → 平均 ${m.liveSec}s`);
    if (m.kit) console.log(`             实战(普攻+法术): ${m.kit.sec}s  普攻${m.kit.basic} 法术${m.kit.spell} 法宝${m.kit.art}${m.kit.killed ? "" : " 未打死"}`);
    console.log(`             它打主角: ${s.hits.map((a) => `${a.id} ${a.dmg}(${pc(a.pct)}${a.combo > 1 ? "×" + a.combo : ""})`).join("  ")}  → 平均扛 ${s.hitsToDie} 下`);
    if (s.spells && s.spells.length) console.log(`             法术: ${s.spells.map((x) => `${x.id} ${x.dmg}(${pc(x.pctHp)})`).join("  ")}`);
  }
  for (const p of r.packs)
    console.log(`  群 [${p.types.join(",")}] ${p.bot} ${p.sec}s 掉血 ${pc(p.lost)}（${p.trials.map((t) => (t.died ? "★" : pc(t.lost))).join("/")}）最低 ${pc(p.minPct)} 被打 ${p.takenHits} 下 闪 ${p.dashes}${p.died ? " 阵亡率 " + pc(p.died) : ""}${p.cleared ? "" : " 未清完"}`);
  if (r.prologue)
    for (const bot of Object.keys(r.prologue)) {
      const B = r.prologue[bot];
      for (const P of B.runs) {
        console.log(`  序章(${bot}): ${P.fights.map((f) => `${f.id} ${f.sec}s 掉${pc(f.lost)}→剩${pc(f.endPct)}${f.pots ? " 丹" + f.pots : ""}${f.fus ? " 符" + f.fus : ""}${f.died ? "★阵亡" : ""}`).join(" | ")}`);
        console.log(`        合计 ${P.sec}s，吃丹 ${P.pots}，掷符 ${P.fus}${P.died ? "，★阵亡于 " + P.diedAt : "，通过"}`);
      }
      console.log(`  序章(${bot}) ${B.runs.length} 次：阵亡率 ${pc(B.deathRate)}，狼首一战平均掉血 ${pc(B.eliteLost)}`);
    }
  if (r.momentum)
    for (const [type, row] of Object.entries(r.momentum))
      console.log(`  势成 ${type.padEnd(13)} ` + Object.entries(row).map(([k, v]) => `${k} ${v.sec}s（${v.trials.map((t) => `${t.sec}s/斩${t.charges}/占${Math.round((t.chargeShare || 0) * 100)}%${t.safeShare != null ? "/窗口" + Math.round(t.safeShare * 100) + "%（不论远近 " + Math.round(t.looseShare * 100) + "%）" : ""}${t.killed ? "" : "×"}`).join(" ")}）`).join("  |  "));
  if (r.shieldTest) console.log("  破盾 " + Object.entries(r.shieldTest).map(([k, v]) => `${k} ${v.breakAt}s（全程 ${v.sec}s）`).join("  |  "));
  if (r.q) console.log(`  Q 次数：${Object.entries(r.q).map(([k, v]) => `${k} ${v.casts}${v.killed ? "" : "+"}次${v.shield ? "(" + v.shield + "盾)" : ""}${v.marks && v.marks.length ? "[" + v.marks.join(" ") + "]" : ""}`).join("  ")}  （每次 Q 平均 ${Object.values(r.q).map((v) => v.perCast).join("/")}）`);
  if (r.boss) {
    const b = r.boss;
    console.log(`  Boss ${b.type} hp ${b.static.hp} 盾 ${(b.static.shield && b.static.shield.hp) || 0} | 普攻一套 ${b.static.combo} | 招式 ${b.static.hits.map((a) => `${a.id} ${a.dmg}(${pc(a.pct)}${a.combo > 1 ? "×" + a.combo : ""})`).join(" ")}`);
    if (b.kit) console.log(`       实战(普攻+法术，主角无敌): ${b.kit.sec}s${b.kit.killed ? "" : " 未打死（剩 " + b.kit.left + "）"} 它出手 ${b.kit.tries} 次，单下 ${b.kit.perHit.join("/")}`);
  }
}

function checkPreset(r) {
  for (const m of r.mobs) {
    const t = TARGET.hits[`${r.id}:${m.type}`];
    if (t) ok(m.static.hitsMean >= t[0] && m.static.hitsMean <= t[1], `${r.id} ${m.type} 平均 ${m.static.hitsMean} 段在目标 ${t[0]}–${t[1]} 内`);
    if (m.kit && r.id !== "T0") ok(m.kit.killed && m.kit.sec >= TARGET.eliteSec[0] && m.kit.sec <= TARGET.eliteSec[1], `${r.id} ${m.type} 精英 ${m.kit.sec}s 在目标 ${TARGET.eliteSec.join("–")}s 内`);
  }
  for (const p of r.packs) {
    const t = TARGET.pack[p.bot][p.elite ? "elite" : "normal"];
    const lost = p.died ? 1 : p.lost;
    ok(lost >= t[0] && lost <= t[1], `${r.id} 群 [${p.types.join(",")}] ${p.bot} 掉血 ${pc(lost)} 在目标 ${pc(t[0])}–${pc(t[1])} 内`);
  }
  if (r.prologue) {
    const M = r.prologue.masher, D = r.prologue.dodger;
    ok(M.deathRate <= 0.34 && D.deathRate === 0, `序章 大概率能过：莽机器人阵亡率 ${pc(M.deathRate)} ≤ 34%，闪避机器人 0%`, { m: M.runs.map((x) => x.diedAt), d: D.runs.map((x) => x.diedAt) });
    ok(M.eliteLost >= TARGET.prologue.eliteLostMin, `序章 狼首有压迫感：莽机器人这一战平均掉血 ${pc(M.eliteLost)} ≥ ${pc(TARGET.prologue.eliteLostMin)}`);
    const fus = M.runs.map((x) => (x.fights.find((f) => f.id === "elite") || {}).fus || 0);
    ok(Math.min(...fus) >= 2, `序章 狼首：金符被用来破盾（每次掷 ${fus.join("/")} 张）`);
  }
}

// ---------------- 页面内工具 ----------------
async function install(page, ov = {}) {
  await page.evaluate(async (ov) => {
    const G = window.__game, w = G.world, E = G.ctx.enemies, P = G.player, H = P.entity, S = G.ctx.skills, inp = G.ctx.input;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const r2 = (v) => Math.round(v * 100) / 100;
    let MOVES = null, makeItem = null, applyUnlocks = null;
    const calm = () => {
      const r = G.run;
      if (r) (r.t = 5), (r.tutorialWolf = null);
      if (G.flow) G.flow.paused = !1;
    };
    const clear = () => {
      for (const e of [...E.list]) {
        E.bars && E.bars.remove(e);
        G.ctx.shields && G.ctx.shields.drop && G.ctx.shields.drop(e.entity);
        e.dispose();
      }
      E.list.length = 0;
      E.tokens.clear();
      for (const id of [...H.statuses.keys()]) w.removeStatus(H, id);
      S.hot && (S.hot.length = 0);
      if (typeof home === "function" && !clear.keepPos) home();
    };
    const full = () => ((H.alive = !0), (H.hp = H.stats.get("hp")), (H.mp = H.stats.get("mp")));
    const fwd = () => {
      const f = P.facing.clone().setY(0);
      return f.lengthSq() > 0.01 ? f.normalize() : new G.THREE.Vector3(1, 0, 0);
    };
    const at = (d, ang = 0) => {
      const f = fwd(), c = Math.cos(ang), s = Math.sin(ang);
      return new G.THREE.Vector3(P.pos.x + (f.x * c - f.z * s) * d, P.pos.y, P.pos.z + (f.x * s + f.z * c) * d);
    };
    // 序章倍率（tutorialLayout.enemyMul）：{ mob: { hp, dmg }, elite: { hp, dmg } }
    //   hp：气血上限与当前护盾同乘；dmg：敌人"总伤害"属性 dmg += (dmg − 1)，即它造成的每一下伤害 × dmg
    let MUL = null;
    const applyMul = (e) => {
      if (!MUL) return;
      const m = e.entity.tags.has("elite") ? MUL.elite || MUL.mob : MUL.mob;
      if (!m) return;
      const ent = e.entity;
      if (m.hp != null && m.hp !== 1) {
        ent.stats.add({ stat: "hp", type: "more", value: m.hp - 1, source: "levelMul" });
        ent.hp = ent.stats.get("hp");
        if (ent.shield) (ent.shield.hp = Math.round(ent.shield.hp * m.hp)), (ent.shield.max = Math.round(ent.shield.max * m.hp));
      }
      if (m.dmg != null && m.dmg !== 1) ent.stats.add({ stat: "dmg", type: "flat", value: m.dmg - 1, source: "levelMul" });
    };
    const spawn = (type, pos, region, o = {}) => {
      // forceElite：敌人模块的精英规则（每局上限、间距、首领场地）会把测试里反复刷的精英换成普通怪；测试要的就是精英本身
      const e = E.spawn(type, pos, { region, noLoot: !0, forceElite: !0, ...o });
      if (!e) throw new Error("spawn failed " + type);
      applyMul(e);
      return e;
    };

    // 流程组的序章步骤引擎（run.pro）会对测试里的击杀 / 位置做反应（推进步骤、刷怪、开洞府），测试期间让它停下
    function freezePro() {
      const pro = G.run && G.run.pro;
      if (!pro || pro.__frozen) return;
      for (const off of pro.offs || []) try { off(); } catch {}
      pro.offs = [];
      pro.update = () => {};
      pro.__frozen = !0;
    }
    // 构筑与成长 v1：框架 v0.1 的新 / 改数据，只改页面内存（战斗设计 02 草案）
    let buildDataDone = !1;
    async function buildData() {
      if (buildDataDone) return;
      buildDataDone = !0;
      const I = await import("/src/data/items.js"), K = await import("/src/data/skills.js");
      I.XINFA.ningshen ||= { id: "ningshen", name: "凝神", glyph: "神", desc: "真气上限 +25%", mods: [{ stat: "mp", type: "pct", value: 0.25 }] };
      I.ARTIFACTS.gourd.passive = (L) => [{ stat: "mp", type: "flat", value: 20 * L }]; // 去掉被动回气（违反"不自动回复"）
      Object.assign(K.FORMATIONS.spirit_array, { cost: 0, cd: 24, dur: 10, mods: [{ stat: "mpRegen", type: "flat", value: 4.5 }], cdSpeed: 0.5 }); // 灵池：10 秒 × 4.5 = 45 封顶
    }
    async function setup(pre) {
      freezePro();
      ({ MOVES } = await import("/src/data/player.js"));
      ({ makeItem } = await import("/src/core/items.js"));
      ({ applyUnlocks } = await import("/src/game/progression.js"));
      const p = G.profile;
      p.realm = { stage: pre.realm[0], layer: pre.realm[1] };
      applyUnlocks(p);
      if (pre.build && pre.build !== "base") await buildData();
      if (pre.unlocks) Object.assign(p.unlocks, pre.unlocks);
      p.equip = { sword: null, robe: null, jade: null, artifact: null };
      for (const [slot, [id, level, rarity]] of Object.entries(pre.gear)) p.equip[slot] = makeItem(id, { level, rarity, identified: !0 });
      if (pre.artifact) {
        p.equip.artifact = makeItem(pre.artifact, { identified: !0 });
        if (pre.artLevel) p.equip.artifact.level = pre.artLevel - (({ art_qiankun: 2, art_chixiao: 2 })[pre.artifact] || 0); // 等级 = 祭炼重数（极品 bonusLevel 2 扣掉）
      }
      p.build.spells = [0, 1, 2].map((i) => pre.spells[i] || null);
      p.build.xinfa = [...pre.xinfa];
      p.build.formation = pre.formation || null;
      (p.flags.learned ||= {}).spells = [...pre.spells];
      p.flags.learned.xinfa = [...pre.xinfa];
      p.flags.learned.formations = pre.formation ? [pre.formation] : [];
      (p.flags.gongfa ||= {}).zhong = { ...(pre.zhong || {}) };
      if (S.potions && S.potions[0]) S.potions[0].count = pre.mpPills || 0;
      G.ctx.applyProfileStats(p);
      const aspd = window.__fcAspd();
      P.debug.god = !1;
      full();
      const st = H.stats;
      return { hp: Math.round(st.get("hp")), atk: r2(st.get("atk")), spell: r2(st.get("spell")), def: r2(st.get("def")), crit: r2(st.get("crit")), critDmg: r2(st.get("critDmg")), hpRegen: r2(st.get("hpRegen")), mp: Math.round(st.get("mp")), aspd, dash: [P.dashMax, PD.PLAYER.dash.recharge] };
    }

    // 静态：冻结敌人，逐段 dealDamage；敌人每招打主角一下；法术真实施放
    async function measureStatic(type, region, spells, o = {}) {
      clear();
      calm();
      full();
      const e = spawn(type, at(3.2), region, o);
      e.update = () => {};
      await sleep(50);
      const ent = e.entity, st = ent.stats;
      const res = { type, level: e.level, hp: Math.round(st.get("hp")), atk: r2(st.get("atk")), def: r2(st.get("def")), shield: ent.shield ? { el: ent.shield.element, hp: ent.shield.hp } : null };
      if (ent.shield) G.ctx.shields.drop(ent), (ent.shield = null);
      const hp0 = ent.hp;
      res.steps = MOVES.map((m) => {
        ent.hp = 1e7;
        const info = w.dealDamage(H, ent, { scale: { atk: m.scale }, noCrit: !0, tags: ["test"] });
        return info ? info.amount : 0;
      });
      ent.hp = hp0;
      res.combo = res.steps.reduce((a, b) => a + b, 0);
      const cr = H.stats.get("crit"), cd = H.stats.get("critDmg");
      let n0 = 0;
      for (let s = 0; s < res.hp && n0 < 999; ) s += res.steps[n0 % 3], n0++;
      res.hitsNoCrit = n0;
      let tot = 0, le3 = 0;
      const N = 2000;
      for (let k = 0; k < N; k++) {
        let s = 0, n = 0;
        while (s < res.hp && n < 999) s += Math.round(res.steps[n % 3] * (Math.random() < cr ? cd : 1)), n++;
        tot += n;
        if (n <= 3) le3++;
      }
      res.hitsMean = r2(tot / N);
      res.p3 = r2(le3 / N);
      // 敌人打主角（不暴击、不算霸体与连段）
      const hmax = H.stats.get("hp");
      res.hits = [];
      for (const a of e.def.attacks) {
        if (!a.damage) continue;
        P.hurtUntil = 0;
        P.invulnUntil = 0;
        const h0 = H.hp;
        H.hp = 1e7;
        const info = w.dealDamage(ent, H, { base: a.damage.base, scale: { atk: a.damage.atk }, element: a.element, noCrit: !0, tags: ["test"] });
        H.hp = h0;
        const dmg = info ? info.amount : 0;
        res.hits.push({ id: a.id, dmg, pct: r2((dmg / hmax) * 100) / 100, combo: a.combo || 1 });
      }
      P.hurtUntil = 0;
      full();
      const avg = res.hits.length ? res.hits.reduce((s, a) => s + a.dmg, 0) / res.hits.length : 1;
      res.hitsToDie = Math.ceil(hmax / Math.max(1, avg));
      // 法术：真实施放（冷却清零、真气补满），收集窗口内主角对它的非普攻、非法宝伤害
      res.spells = [];
      for (let i = 0; i < (spells || []).length; i++) {
        const sp = S.spellAt(i);
        if (!sp) continue;
        for (const id of [...ent.statuses.keys()]) w.removeStatus(ent, id);
        ent.hp = 1e7;
        S.cd = {};
        full();
        P.setState("move");
        S.aimOverride = e.pos.clone();
        let dmg = 0;
        const off = w.events.on("damage", (x) => x.attacker === H && x.target === ent && !(x.tags || []).includes("artifact") && !(x.tags || []).includes("basic") && (dmg += x.amount));
        const castOk = S.castSpell(i);
        await sleep(sp.effect.type === "zone" ? (sp.effect.dur + 0.8) * 1000 : 1400);
        off();
        S.aimOverride = null;
        res.spells.push({ id: sp.id, dmg, castOk, pctHp: r2(dmg / res.hp) });
      }
      ent.hp = hp0;
      clear();
      return res;
    }

    // 实战机器人：按住左键追着打。
    //   mode "basic" 只普攻 / "kit" 普攻 + 法术；bot "masher" 从不闪避 / "dodger" 近身预警 70% 概率在出手前闪开
    //   fu：精英有盾时掷五行符（run.useElementFu）；pots：气血 < 35% 吃回春丹；keepHp：不回满（序章连续战）
    // charge：势成（满势）时右键放蓄势斩（v1.1 起蓄势斩改为右键主动释放，默认开）；preMom：开场就是满势（"在小怪身上攒满再进精英战"）
    async function fight(targets, { mode = "basic", bot = "masher", god = !0, timeout = 30, fu = !1, pots = !1, keepHp = !1, extra = null, charge = !0, preMom = !1, useArt = !1, useForm = !1 } = {}) {
      calm();
      if (!keepHp) full();
      H.mp = H.stats.get("mp");
      P.debug.god = god;
      P.setState("move");
      P.dashCharges = P.dashMax;
      S.cd = {};
      P.momentum = preMom ? P.momentumMax || 100 : 0;
      let charges = 0, chargeDmg = 0, firstChargeAt = null, totalDmg = 0, shieldBreakAt = null, safeT = 0, looseT = 0, bossT = 0;
      const offCh = w.events.on("player:charge", () => (charges++, (firstChargeAt ??= raw)));
      // 伤害统计含打在护盾上的部分（shieldHit.dmg）：蓄势斩占比 = chargeDmg / totalDmg
      const offC = w.events.on("damage", (i) => {
        if (i.attacker !== H || !set.has(i.target)) return;
        const d = i.amount + ((i.shieldHit && i.shieldHit.dmg) || 0);
        totalDmg += d;
        if ((i.tags || []).includes("charge")) chargeDmg += d;
      });
      const offS = w.events.on("shield:break", (x) => set.has(x.target) && shieldBreakAt == null && (shieldBreakAt = raw - (first ?? 0)));
      let raw = 0, done = !1, first = null, fuCd = 0, dashAt = null, dashFrom = null;
      const hmax = H.stats.get("hp"), hp0 = H.hp;
      const set = new Set(targets.map((e) => e.entity));
      const log = { basic: 0, basicHits: 0, spell: 0, art: 0, taken: 0, takenHits: 0, minHp: H.hp, died: !1, byType: {}, tries: [], pots: 0, fus: 0, dashes: 0, mpPills: 0, mpGain: 0, intTries: 0 };
      let lastMp = H.mp;
      const mpSpent0 = S.stats.mpSpent || 0, casts0 = Object.values(S.stats.casts || {}).reduce((a, b) => a + b, 0), denied0 = S.stats.mpDenied || 0;
      const off1 = w.events.on("damage", (i) => {
        if (i.attacker === H && set.has(i.target)) {
          const t = i.tags || [];
          if (first == null) first = raw;
          if (t.includes("basic")) (log.basic += i.amount), log.basicHits++;
          else if (t.includes("artifact")) log.art += i.amount;
          else log.spell += i.amount;
        }
        if (i.target === H) {
          log.taken += i.amount;
          log.takenHits++;
          const k = (i.attacker && i.attacker.kind) || "?";
          log.byType[k] = (log.byType[k] || 0) + i.amount;
          log.minHp = Math.min(log.minHp, H.hp);
        }
      });
      const off2 = w.events.on("beforeDamage", (i) => {
        if (i.target !== H) return;
        if (set.has(i.attacker) && log.tries.length < 200) log.tries.push(i.amount);
        // 不让主角真的死（会触发身陨结算、切场景）：致命一击取消并记"会阵亡"
        if (!i.cancel && i.amount >= H.hp) (i.cancel = !0), (log.died = !0), (log.minHp = 0);
      });
      const off3 = w.events.on("enemy:telegraph", (x) => {
        if ((bot !== "dodger" && bot !== "skilled") || !set.has(x.enemy) || dashAt != null) return;
        const d = Math.hypot(x.enemy.pos.x - P.pos.x, x.enemy.pos.z - P.pos.z);
        if (d > (bot === "skilled" ? 9 : 7) || Math.random() > (bot === "skilled" ? 0.9 : 0.7)) return;
        dashAt = w.time + Math.max(0.05, x.dur - 0.14);
        dashFrom = x.enemy;
      });
      const step0 = w.step;
      const tick = (r) => {
        calm();
        // 首领输出窗口：首领不在预警 / 出招（windup / strike）、没潜水时，算"可以放心输出"的时间
        for (const e of targets) if (e.alive && e.entity && e.entity.tags.has("boss") && e.state) {
          bossT += r;
          // 只算"够得着"的时间：首领在近战距离内（受击半径 + 2.5 米）
          const near = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - e.def.radius <= 2.5;
          if (!["windup", "strike"].includes(e.state) && !e.submerged && near) safeT += r;
          if (!["windup", "strike"].includes(e.state) && !e.submerged) looseT += r;
        }
        if (extra && extra.tick) extra.tick(r);
        const alive = targets.filter((e) => e.alive);
        if (!alive.length || raw > timeout || log.died) return void (done = !0);
        let tg = null, bd = 1e9;
        for (const e of alive) {
          const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - e.def.radius;
          if (d < bd) (bd = d), (tg = e);
        }
        inp.aim.set(tg.pos.x, P.pos.y, tg.pos.z);
        if (dashAt != null && w.time >= dashAt) {
          const src = dashFrom && dashFrom.pos ? dashFrom.pos : tg.pos;
          const dx = P.pos.x - src.x, dz = P.pos.z - src.z, l = Math.hypot(dx, dz) || 1, sd = Math.random() < 0.5 ? 1 : -1;
          if (P.startDash(new G.THREE.Vector3((-dz / l) * sd + (dx / l) * 0.4, 0, (dx / l) * sd + (dz / l) * 0.4))) log.dashes++;
          dashAt = null;
        }
        if (pots && S.potions && S.potions[1] && S.potions[1].count > 0 && H.hp < hmax * 0.35 && !(S.hot && S.hot.length) && S.usePotion(1)) log.pots++;
        fuCd -= r;
        const big = alive.find((e) => e.entity.shield && e.entity.shield.hp > 0);
        if (fu && big && fuCd <= 0 && G.run && G.run.elementFus().length && Math.hypot(big.pos.x - P.pos.x, big.pos.z - P.pos.z) < 6 && (P.state === "move" || P.state === "attack")) {
          inp.aim.set(big.pos.x, P.pos.y, big.pos.z);
          if (G.run.useElementFu() !== !1) log.fus++;
          fuCd = 0.7;
        }
        const reach = 1.9;
        // "熟"机器人（05 青牙实测）：首领读条（channel）时用打断值最高的法术打断，没有就满 / 半势斩；二阶段不在出招时绕到背后（背击 ×1.35）
        let rearGo = null;
        if (bot === "skilled" && tg.atk && tg.atk.a && tg.atk.a.channel && tg.state === "windup" && (P.state === "move" || (P.state === "attack" && P.stateT >= P.moveTimes().cancelFrom))) {
          let best = -1, bi = -1;
          for (let i = 0; i < 3; i++) {
            const sp = S.spellAt(i);
            if (!sp || S.slotLocked(i) || (S.cd[["Q", "E", "R"][i]] || 0) > 0 || H.mp < sp.cost) continue;
            const v = (sp.boss && sp.boss.chan) || (sp.effect.type === "projectile" ? 0.35 : 0.2);
            if (v > best) (best = v), (bi = i);
          }
          if (bi >= 0) {
            S.aimOverride = tg.pos.clone();
            if (S.castSpell(bi)) log.intTries++;
          } else if (P.momentum >= 50 && P.tryCharge) (P.tryCharge(), log.intTries++);
        }
        if (bot === "skilled" && tg.ctrl && tg.ctrl.phase === 2 && !["windup", "strike"].includes(tg.state) && tg.heroBehind && !tg.heroBehind(P.pos) && bd < 4)
          rearGo = new G.THREE.Vector3(tg.pos.x - Math.sin(tg.yaw) * (tg.def.radius + 1.4), P.pos.y, tg.pos.z - Math.cos(tg.yaw) * (tg.def.radius + 1.4));
        if (rearGo && P.state === "move") {
          const dx = rearGo.x - P.pos.x, dz = rearGo.z - P.pos.z, l = Math.hypot(dx, dz) || 1, sp = H.stats.get("move") * r;
          if (l > 0.4) P.tryMove((dx / l) * sp, (dz / l) * sp);
        }
        // 处决：首领威折倒地 / 终结时按 F（控制器读 fReq）
        if (tg.ctrl && (tg.ctrl.downKind === "break" || tg.ctrl.mode === "final")) tg.ctrl.fReq = !0;
        // 右键与真人一样走 tryCharge 的缓存（按住左键连段时，出招中按下、到可取消时放出）；次数按 player:charge 事件计
        // （战斗策划 2026-11-17：原来要求 canStartCharge() 为真才按，而连段时每到可取消那一帧主角就接了下一段，机器人永远按不出来）
        if (charge && P.tryCharge && P.momentumFull && bd < reach + 0.8 && !tg.submerged && !(P.chargeBuf > 0) && !(P.state === "attack" && P.combo === 3)) P.tryCharge();
        inp.mouse.left = bd < reach && !tg.submerged && P.state !== "dash";
        if (bd >= reach - 0.3 && P.state === "move") {
          const dx = tg.pos.x - P.pos.x, dz = tg.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1, sp = H.stats.get("move") * r;
          P.tryMove((dx / l) * sp, (dz / l) * sp);
          P.faceDir(new G.THREE.Vector3(dx, 0, dz));
        }
        if (mode === "kit" && (P.state === "move" || (P.state === "attack" && P.stateT >= P.moveTimes().cancelFrom))) {
          for (let i = 0; i < 3; i++) {
            const sp = S.spellAt(i);
            if (!sp || S.slotLocked(i) || (S.cd[["Q", "E", "R"][i]] || 0) > 0 || H.mp < sp.cost) continue;
            const el = alive.find((e) => e.entity.tags.has("elite") || e.entity.tags.has("xinmo")) || tg;
            S.aimOverride = sp.effect.type === "shield" || sp.effect.type === "buff" || sp.effect.type === "counter" || sp.effect.type === "summon" ? P.pos.clone() : el.pos.clone();
            if (S.castSpell(i)) break;
          }
          // 构筑与成长 v1：法宝 V、阵法 T（冷却好、真气够就用；聚灵阵布在脚下，其余布在目标处）
          if (useArt && S.artifact && S.artifactDef && !(S.cd.artifact > 0) && H.mp >= S.artifactDef.active.cost && bd < 5) {
            S.aimOverride = tg.pos.clone();
            S.useArtifact();
          }
          if (useForm && S.formationDef && !(S.cd.formation > 0) && H.mp >= S.formationDef.cost) {
            S.aimOverride = S.formationDef.kind === "aura" ? P.pos.clone() : tg.pos.clone();
            S.placeFormation();
          }
        }
        // 回气丹：真气不够放最便宜的法术时吃（丹药冷却 4 秒）
        if (mode === "kit" && S.potions && S.potions[0] && S.potions[0].count > 0 && !(S.cd.pot0 > 0)) {
          const cheap = Math.min(...[0, 1, 2].map((i) => (S.spellAt(i) && !S.slotLocked(i) ? S.spellAt(i).cost : 1e9)));
          if (cheap < 1e9 && H.mp < cheap && S.usePotion(0)) log.mpPills++;
        }
        if (H.mp > lastMp) log.mpGain += H.mp - lastMp;
        lastMp = H.mp;
      };
      w.step = function (r) {
        raw += r;
        try {
          tick(r);
        } catch (e) {
          console.error("[num_ttk] tick", e);
          done = !0;
        }
        return step0.call(this, r);
      };
      while (!done) await sleep(50);
      w.step = step0;
      inp.mouse.left = !1;
      S.aimOverride = null;
      off1();
      off2();
      off3();
      offC();
      offCh();
      offS();
      P.debug.god = !1;
      const res = {
        sec: r2(raw - (first ?? 0)), total: r2(raw), killed: targets.every((e) => !e.alive), hits: log.basicHits,
        basic: log.basic, spell: log.spell, art: log.art, taken: log.taken, takenHits: log.takenHits,
        lost: r2(log.taken / hmax), minPct: r2(log.minHp / hmax), endPct: r2((log.died ? 0 : H.hp) / hmax), startPct: r2(hp0 / hmax), died: log.died, byType: log.byType,
        charges, chargeDmg, totalDmg, chargeShare: totalDmg ? r2(chargeDmg / totalDmg) : 0, shieldBreakAt: shieldBreakAt == null ? null : r2(shieldBreakAt),
        safeShare: bossT ? r2(safeT / bossT) : null, looseShare: bossT ? r2(looseT / bossT) : null, firstChargeAt: firstChargeAt == null ? null : r2(firstChargeAt),
        tries: log.tries.length, perHit: [...new Set(log.tries)].sort((a, b) => a - b).slice(0, 8), pots: log.pots, fus: log.fus, dashes: log.dashes,
        intTries: log.intTries,
        mp: { spent: Math.round((S.stats.mpSpent || 0) - mpSpent0), gain: Math.round(log.mpGain), casts: Object.values(S.stats.casts || {}).reduce((a, b) => a + b, 0) - casts0, denied: (S.stats.mpDenied || 0) - denied0, pills: log.mpPills, mp0: Math.round(H.stats.get("mp")) },
        left: targets.filter((e) => e.alive).map((e) => Math.round(e.entity.hp + ((e.entity.shield && e.entity.shield.hp) || 0))),
      };
      if (!keepHp) full();
      return res;
    }

    async function liveSingle(type, region, mode, trials, timeout) {
      const out = [];
      for (let k = 0; k < trials; k++) {
        clear();
        full();
        const e = spawn(type, at(2.6), region);
        e.setAggro();
        await sleep(100);
        out.push(await fight([e], { mode, god: !0, timeout }));
        await sleep(150);
      }
      clear();
      return out;
    }

    const place = (types, region, o = {}) => types.map((t, i) => spawn(t, at(5.5 + (i % 2), (i / Math.max(1, types.length)) * Math.PI * 1.2 - 0.6), region, o));
    async function pack(types, region, mode, bot) {
      clear();
      full();
      const list = place(types, region);
      for (const e of list) e.setAggro();
      await sleep(100);
      const r = await fight(list, { mode, bot, god: !1, timeout: 60 });
      clear();
      return { types, bot, elite: list.some((e) => e.entity.tags.has("elite")), cleared: r.killed, ...r };
    }

    // 序章连续战：气血带到下一组（组间走路 gap 秒按 hpRegen 回血）；开箱后有回春丹 ×2、金符 ×3
    async function prologue(fights, bot, gap = 25) {
      clear();
      full();
      const run = G.run;
      freezePro();
      run.carried = (run.carried || []).filter((i) => !String(i.id).startsWith("fu_"));
      if (S.potions && S.potions[1]) S.potions[1].count = 0;
      const out = { fights: [], sec: 0, pots: 0, fus: 0, died: !1, diedAt: null };
      let chest = !1;
      for (const f of fights) {
        H.hp = Math.min(H.stats.get("hp"), H.hp + gap * H.stats.get("hpRegen"));
        const list = place(f.mobs, "tutorial", f.shield ? { shield: f.shield } : {});
        for (const e of list) e.setAggro();
        await sleep(100);
        const r = await fight(list, { mode: "basic", bot, god: !1, timeout: 120, keepHp: !0, fu: chest, pots: chest });
        out.fights.push({ scene: G.flow && G.flow.name, state: run.state, id: f.id, sec: r.sec, lost: r.lost, endPct: r.endPct, minPct: r.minPct, pots: r.pots, fus: r.fus, died: r.died, takenHits: r.takenHits, killed: r.killed });
        out.sec = r2(out.sec + r.sec);
        out.pots += r.pots;
        out.fus += r.fus;
        clear();
        if (r.died) {
          out.died = !0;
          out.diedAt = f.id;
          break;
        }
        if (f.chestAfter) {
          chest = !0;
          run.carried.push(makeItem("fu_metal", { n: 3 }));
          if (S.potions && S.potions[1]) S.potions[1].count = 2;
        }
      }
      run.carried = run.carried.filter((i) => !String(i.id).startsWith("fu_"));
      full();
      return out;
    }

    // 洞府心魔试炼（src/game/cave/xinmo.js），在出行地图上原样实例化
    async function xinmoTrial() {
      clear();
      full();
      const { XinmoTrial, XINMO } = await import("/src/game/cave/xinmo.js");
      const T = new XinmoTrial(G.ctx, { center: P.pos.clone(), hp: ov.xinmoHp ? Number(ov.xinmoHp) : undefined });
      T.start();
      const wrap = { get alive() { return !!(T.e && T.e.alive) && !T.done; }, get pos() { return T.root.position; }, def: { radius: 0.45 }, get entity() { return T.e; }, submerged: !1 };
      const st = T.e.stats;
      const stat = { type: "xinmo_trial", level: 9, hp: Math.round(st.get("hp")), atk: r2(st.get("atk")), def: r2(st.get("def")), shield: null, combo: 0, hits: [] };
      const ms = MOVES.map((m) => {
        const h0 = T.e.hp;
        T.e.hp = 1e7;
        const info = w.dealDamage(H, T.e, { scale: { atk: m.scale }, noCrit: !0, tags: ["test"] });
        T.e.hp = h0;
        return info ? info.amount : 0;
      });
      stat.combo = ms.reduce((a, b) => a + b, 0);
      const hmax = H.stats.get("hp");
      for (const c of XINMO.combo) {
        P.hurtUntil = 0;
        const h0 = H.hp;
        H.hp = 1e7;
        const info = w.dealDamage(T.e, H, { scale: { atk: c.scale }, noCrit: !0, tags: ["test"] });
        H.hp = h0;
        stat.hits.push({ id: c.anim, dmg: info ? info.amount : 0, pct: r2(((info ? info.amount : 0) / hmax) * 100) / 100, combo: 1 });
      }
      P.hurtUntil = 0;
      full();
      const k = await fight([wrap], { mode: "kit", god: !0, timeout: 150, extra: { tick: (dt) => T.update(dt * w.timeScale) } });
      try {
        T.abort && T.abort();
      } catch {}
      return { type: "xinmo_trial", static: stat, kit: { sec: k.sec, killed: k.killed, left: k.left, basic: k.basic, spell: k.spell, art: k.art, tries: k.tries, perHit: k.perHit } };
    }

    // Q 次数：冻结目标（Boss 只跑换盾逻辑），反复放 Q；两次之间清状态与破盾易伤
    async function qcount(types, region, o = {}) {
      clear();
      full();
      const c0 = at(6);
      const list = types.map((t, i) => {
        const a = (i / types.length) * Math.PI * 2, rr = types.length > 1 ? 1.1 : 0;
        const e = spawn(t, new G.THREE.Vector3(c0.x + Math.cos(a) * rr, c0.y, c0.z + Math.sin(a) * rr), region);
        e.update = o.phases ? () => e.updatePhases() : () => {};
        return e;
      });
      await sleep(60);
      const shield = list.map((e) => e.entity.shield && e.entity.shield.element).filter(Boolean).join(",");
      let casts = 0, dealt = 0;
      const off = w.events.on("damage", (x) => x.attacker === H && list.some((e) => e.entity === x.target) && !(x.tags || []).includes("artifact") && (dealt += x.amount));
      const shield0 = list.reduce((s, e) => s + ((e.entity.shield && e.entity.shield.hp) || 0), 0);
      const marks = [];
      let lastEl = list[0].entity.shield && list[0].entity.shield.hp > 0 ? list[0].entity.shield.element : null;
      while (list.some((e) => e.alive) && casts < 40) {
        const sh = list[0].entity.shield, el = sh && sh.hp > 0 ? sh.element : null;
        if (el !== lastEl) marks.push(`${casts}:${lastEl || "本体"}→${el || "本体"}`), (lastEl = el);
        for (const e of list) {
          for (const id of [...e.entity.statuses.keys()]) w.removeStatus(e.entity, id);
          e.entity.stats.removeSource("shieldBreak");
        }
        S.cd = {};
        full();
        P.setState("move");
        const tg = list.find((e) => e.alive);
        S.aimOverride = (types.length > 1 ? c0 : tg.pos).clone();
        if (S.castSpell(0)) casts++;
        await sleep(900);
        if (o.phases) await sleep(200);
      }
      off();
      S.aimOverride = null;
      const shield1 = list.reduce((s, e) => s + ((e.entity.shield && e.entity.shield.hp) || 0), 0);
      const killed = list.every((e) => !e.alive);
      clear();
      return { casts, killed, shield, marks, perCast: Math.round(dealt / Math.max(1, casts)), shieldTaken: shield0 - shield1, hpLeft: list.map((e) => Math.round(e.entity.hp)) };
    }

    // 试验用的运行时覆盖（不改文件）：tokens=同时出招上限，armor=逗号分隔的敌人类型改为霸体
    // fc=1：测试里临时改攻速曲线（默认旧曲线 练气一层 0.8 → 筑基 1.15；aspd0 / aspd1 可改）与闪身 1 次充能、2.75 秒恢复
    const PD = await import("/src/data/player.js");
    if (ov.fc) {
      PD.PLAYER.dash.charges = 1;
      PD.PLAYER.dash.recharge = 2.75;
      P.dashMax = 1;
      P.dashCharges = Math.min(P.dashCharges, 1);
    }
    window.__fcAspd = () => {
      H.stats.removeSource("fc");
      if (!ov.fc) return Math.round(H.stats.get("aspd") * 100) / 100;
      const p = G.profile, L = p.realm.stage >= 2 ? 10 : Math.max(1, p.realm.layer || 1);
      const a0 = ov.aspd0 || 0.8, a1 = ov.aspd1 || a0 + 0.35; // aspd0 / aspd1：试别的攻速曲线（练一 / 筑基），默认 = 旧曲线 0.8 → 1.15
      const a = a0 + ((a1 - a0) * (L - 1)) / 9;
      H.stats.add({ stat: "aspd", type: "more", value: a / H.stats.get("aspd") - 1, source: "fc" });
      return Math.round(H.stats.get("aspd") * 100) / 100;
    };
    const ED = await import("/src/data/enemies.js");
    if (ov.tokens) ED.ENCOUNTER.maxAttackers = Number(ov.tokens);
    for (const t of (ov.armor || "").split(",").filter(Boolean)) ED.ENEMY_TYPES[t].superArmor = !0;
    // 场地：在入口附近找一块平地（半径 7 米内都能站），每次刷怪前主角回到这里、朝 +x
    const { walkable } = await import("/src/game/enemies/enemy.js");
    const { height } = await import("/src/world/terrain.js");
    const e0 = (G.run && G.run.map.points.entries && G.run.map.points.entries[0]) || P.pos;
    let HOME = null;
    for (let r = 0; r < 60 && !HOME; r += 2)
      for (let k = 0; k < Math.max(1, r * 2) && !HOME; k++) {
        const a = (k / Math.max(1, r * 2)) * Math.PI * 2, x = e0.x + Math.cos(a) * r, z = e0.z + Math.sin(a) * r, h0 = height(x, z);
        let good = walkable(x, z, h0, G.ctx.colliders, 0.6);
        for (const rr of [2, 4, 6, 7.5]) for (let j = 0; j < 16 && good; j++) {
          const b = (j / 16) * Math.PI * 2, xx = x + Math.cos(b) * rr, zz = z + Math.sin(b) * rr;
          if (Math.abs(height(xx, zz) - h0) > 0.35 || !walkable(xx, zz, h0, G.ctx.colliders, 0.7)) good = !1;
        }
        if (good) HOME = { x, z };
      }
    if (!HOME) HOME = { x: e0.x, z: e0.z };
    const home = () => {
      P.spawn(HOME.x, HOME.z);
      P.facing.set(1, 0, 0);
      P.yaw = Math.PI / 2;
      P.vel && P.vel.set(0, 0, 0);
      P.knock = null;
    };
    // 首领成长曲线：同一档位下"莽"/"闪"各打 trials 次；主角不无敌（致命一击记为阵亡并停止），带回春丹 3 枚、满真气、开场满势
    // god / bossHp：测"持续输出"——主角无敌、首领气血放大到 bossHp（护盾同比例），打满 timeout 秒，DPS = 总伤害（含打盾）÷ 秒
    async function bossCurve({ pre, boss, trials, timeout, god = !1, bossHp = 0, bots: botList = ["masher", "dodger"] }) {
      const hero = await setup(pre);
      const bots = [];
      for (const bot of botList) {
        const rs = [];
        for (let k = 0; k < trials; k++) {
          clear();
          full();
          if (S.potions && S.potions[1]) S.potions[1].count = 3;
          if (S.potions && S.potions[0]) S.potions[0].count = pre.mpPills || 0;
          const e = spawn(boss, at(6), G.run ? G.run.region : "r1");
          if (bossHp) {
            const ent0 = e.entity, k = bossHp / ent0.stats.get("hp");
            ent0.stats.add({ stat: "hp", type: "more", value: k - 1, source: "test" });
            ent0.hp = ent0.stats.get("hp");
            if (ent0.shield) (ent0.shield.hp = Math.round(ent0.shield.hp * k)), (ent0.shield.max = Math.round(ent0.shield.max * k));
          }
          e.setAggro();
          await sleep(100);
          const f = await fight([e], { mode: "kit", bot, god, timeout, pots: !0, preMom: !0, useArt: !!pre.artifact, useForm: !!pre.formation });
          const ent = e.entity, maxHp = ent.stats.get("hp");
          rs.push({ won: f.killed, died: f.died, sec: f.sec, lost: f.died ? 1 : f.lost, bossLeft: f.killed ? 0 : r2(Math.max(0, ent.hp) / maxHp), phase: (e.phaseIdx || 0) + 1, pots: f.pots, charges: f.charges,
            maxHp: Math.round(maxHp), dps: f.total ? Math.round(f.totalDmg / f.total) : 0, safeShare: f.safeShare, tries: f.tries, mp: f.mp, dmg: { basic: f.basic, spell: f.spell, art: f.art, charge: f.chargeDmg, total: f.totalDmg } });
          clear();
        }
        const avg = (k) => r2(rs.reduce((s2, x) => s2 + x[k], 0) / rs.length);
        const mpAvg = (k) => Math.round(rs.reduce((s2, x) => s2 + (x.mp ? x.mp[k] : 0), 0) / rs.length);
        const shr = (k) => r2(rs.reduce((s2, x) => s2 + (x.dmg.total ? x.dmg[k] / x.dmg.total : 0), 0) / rs.length);
        bots.push({ mp: { spent: mpAvg("spent"), gain: mpAvg("gain"), casts: mpAvg("casts"), denied: mpAvg("denied"), pills: mpAvg("pills"), spellShare: shr("spell"), artShare: shr("art") }, dps: Math.round(rs.reduce((s2, x) => s2 + x.dps, 0) / rs.length), chargeShare: r2(rs.reduce((s2, x) => s2 + (x.dmg.total ? x.dmg.charge / x.dmg.total : 0), 0) / rs.length), bot, winRate: rs.filter((x) => x.won).length / rs.length, deathRate: rs.filter((x) => x.died).length / rs.length, sec: avg("sec"), lost: avg("lost"), bossLeft: avg("bossLeft"), phase: Math.max(...rs.map((x) => x.phase)), trials: rs });
      }
      return { id: pre.id, label: pre.label, hero, bots };
    }

    // 构筑与成长 v1：流派配装的"本体持续输出 + 各五行破盾"——假人 = 区域二狼首（精英、会出手），首领 AI（青牙 v2 的睡眠 / 场地）不介入
    //   本体：去掉护盾、气血放大到 bodyHp，主角无敌打满 bodySec 秒 → bodyDps（含法术 / 法宝 / 阵 / 蓄势斩，真气按实耗，回气丹按 pre.mpPills）
    //   破盾：五行各给一层 shieldHp 的护盾、本体只剩 1 点，主角从满势 / 满真气开打，计破盾秒数
    async function buildCurve({ pre, dummy = "wolf_elite_r2", bodyHp = 60000, bodySec = 45, shieldHp = 2000, shieldEls = ["wood", "earth", "water", "fire", "metal"], shieldTimeout = 40 }) {
      const hero = await setup(pre);
      const mk = () => {
        clear();
        full();
        if (S.potions && S.potions[1]) S.potions[1].count = 3;
        if (S.potions && S.potions[0]) S.potions[0].count = pre.mpPills || 0;
        const e = spawn(dummy, at(4), G.run ? G.run.region : "r2");
        G.ctx.shields && G.ctx.shields.drop(e.entity);
        e.entity.shield = null;
        e.entity.tags.add("boss"); // 按首领规则结算（剑意削盾 0.2、蓄势斩硬直 0.5 秒）
        e.setAggro();
        return e;
      };
      // 本体
      let e = mk();
      const ent0 = e.entity, k = bodyHp / ent0.stats.get("hp");
      ent0.stats.add({ stat: "hp", type: "more", value: k - 1, source: "test" });
      ent0.hp = ent0.stats.get("hp");
      const def = r2(ent0.stats.get("def"));
      await sleep(100);
      const f = await fight([e], { mode: "kit", bot: "masher", god: !0, timeout: bodySec, pots: !0, preMom: !0, useArt: !!pre.artifact, useForm: !!pre.formation });
      const body = { dps: f.total ? Math.round(f.totalDmg / f.total) : 0, sec: f.total, charges: f.charges, chargeShare: f.chargeShare, dmg: { basic: f.basic, spell: f.spell, art: f.art, charge: f.chargeDmg, total: f.totalDmg }, mp: f.mp };
      clear();
      // 破盾
      const shields = {};
      for (const el of shieldEls) {
        e = mk();
        const ent = e.entity;
        G.ctx.shields.give(ent, el);
        ent.shield.hp = ent.shield.max = shieldHp;
        ent.hp = 1;
        await sleep(100);
        const g = await fight([e], { mode: "kit", bot: "masher", god: !0, timeout: shieldTimeout, pots: !0, preMom: !1, useArt: !!pre.artifact, useForm: !!pre.formation });
        shields[el] = g.shieldBreakAt == null ? null : r2(g.shieldBreakAt);
        clear();
      }
      return { id: pre.id, label: pre.label, hero, dummy, def, body, shields, shieldHp };
    }
    window.__T = {
      bossCurve,
      buildCurve,
      async preset(pre) {
        const region = G.run ? G.run.region : "r1";
        MUL = null;
        if (pre.prologue) {
          const lv = (await import("/src/data/levels/tutorial.js")).default;
          MUL = (lv.tutorialLayout && lv.tutorialLayout.enemyMul) || null;
        }
        const hero = await setup(pre);
        const r = { id: pre.id, label: pre.label, region, hero, spells: pre.spells, mul: MUL, mobs: [], packs: [] };
        if (pre.elitesOnly) {
          // 势成复核：精英 / Boss 在"开场 0 势、满势再放"与"开场就满势"两种条件下各打 trials 次（主角无敌，普攻 + 法术 + 蓄势斩）
          r.momentum = {};
          const list = [...pre.elites.map((t) => [t, region]), ...(pre.boss && pre.boss !== "xinmo_trial" ? [[pre.boss, region]] : [])];
          for (const [type, reg] of list) {
            const row = {};
            for (const [tag, preMom] of [["开场 0 势", !1], ["开场满势", !0]]) {
              const rs = [];
              for (let k = 0; k < (pre.trials || 3); k++) {
                clear();
                full();
                const e = spawn(type, at(type === pre.boss ? 4 : 2.6), reg);
                e.setAggro();
                await sleep(100);
                const f = await fight([e], { mode: "kit", god: !0, timeout: 150, preMom });
                rs.push({ sec: f.sec, killed: f.killed, charges: f.charges, chargeDmg: f.chargeDmg, chargeShare: f.chargeShare, safeShare: f.safeShare, looseShare: f.looseShare, shieldBreakAt: f.shieldBreakAt, firstChargeAt: f.firstChargeAt });
              }
              row[tag] = { sec: r2(rs.reduce((s2, x) => s2 + x.sec, 0) / rs.length), trials: rs };
            }
            r.momentum[type] = row;
          }
          // 破盾：同一只精英强制成"有克制"（剑气斩金克木盾）/"无克制"（水盾：主角没有土系法术、也没附灵）两种护盾，记破盾秒数；
          // 两种开场（0 势 / 满势）各测，满势开场是气势不流失后的常态
          const et = pre.elites[0];
          if (et) {
            r.shieldTest = {};
            for (const [tag, el] of [["有克制（木盾 / 剑气斩）", "wood"], ["无克制（水盾）", "water"]])
              for (const [mtag, preMom] of [["0 势", !1], ["满势", !0]]) {
                const rs = [];
                for (let k = 0; k < (pre.trials || 3); k++) {
                  clear();
                  full();
                  const e = spawn(et, at(2.6), region, { shield: el });
                  e.setAggro();
                  await sleep(100);
                  const f = await fight([e], { mode: "kit", god: !0, timeout: 120, preMom });
                  rs.push({ breakAt: f.shieldBreakAt, sec: f.sec, chargeShare: f.chargeShare });
                }
                const b = rs.filter((x) => x.breakAt != null);
                r.shieldTest[`${tag}·${mtag}`] = { breakAt: b.length ? r2(b.reduce((s2, x) => s2 + x.breakAt, 0) / b.length) : null, sec: r2(rs.reduce((s2, x) => s2 + x.sec, 0) / rs.length), trials: rs };
              }
          }
          clear();
          return r;
        }
        for (const type of [...pre.mobs, ...pre.elites]) {
          const elite = pre.elites.includes(type);
          const m = { type, static: await measureStatic(type, region, pre.spells, elite && pre.prologue ? { shield: "wood" } : {}) };
          if (!elite) {
            m.live = (await liveSingle(type, region, "basic", 3, 20)).map((t) => ({ hits: t.hits, sec: t.sec, killed: t.killed }));
            m.liveSec = r2(m.live.reduce((s, t) => s + t.sec, 0) / m.live.length);
          } else if (!pre.prologue) {
            const k = (await liveSingle(type, region, "kit", 1, 60))[0];
            m.kit = { sec: k.sec, basic: k.basic, spell: k.spell, art: k.art, killed: k.killed, hits: k.hits };
          }
          r.mobs.push(m);
        }
        // 成群：每种机器人打 2 次取平均（单次波动很大）
        for (const t of pre.packs)
          for (const bot of ["masher", "dodger"]) {
            const rs = [];
            for (let k = 0; k < 2; k++) rs.push(await pack(t, region, pre.spells.length ? "kit" : "basic", bot));
            const avg = (f) => r2(rs.reduce((s, x) => s + x[f], 0) / rs.length);
            r.packs.push({ ...rs[0], trials: rs.map((x) => ({ sec: x.sec, lost: x.lost, died: x.died })), sec: avg("sec"), lost: r2(rs.reduce((s, x) => s + (x.died ? 1 : x.lost), 0) / rs.length), minPct: avg("minPct"), takenHits: avg("takenHits"), dashes: avg("dashes"), died: rs.filter((x) => x.died).length / rs.length, cleared: rs.every((x) => x.cleared) });
          }
        if (pre.q) {
          r.q = {};
          r.q.group = await qcount(pre.q.group, region);
          r.q[pre.q.elite] = await qcount([pre.q.elite], region);
          if (pre.q.elite2) r.q[pre.q.elite2] = await qcount([pre.q.elite2], region);
          r.q.qingya = await qcount([pre.q.boss], "r1", { phases: !0 });
        }
        // 序章：莽 3 次、闪 2 次
        if (pre.prologue) {
          r.prologue = {};
          for (const [bot, n] of [["masher", 3], ["dodger", 2]]) {
            const rs = [];
            for (let k = 0; k < n; k++) rs.push(await prologue(pre.prologue, bot));
            r.prologue[bot] = { ...rs[0], runs: rs, deathRate: rs.filter((x) => x.died).length / n, eliteLost: r2(rs.reduce((s, x) => s + ((x.fights.find((f) => f.id === "elite") || {}).lost ?? 1), 0) / n) };
          }
        }
        if (pre.boss === "xinmo_trial") r.boss = pre.quick ? null : await xinmoTrial();
        else if (pre.boss) {
          const b = { type: pre.boss, static: await measureStatic(pre.boss, region, []) };
          if (!pre.quick) {
            clear();
            full();
            const e = spawn(pre.boss, at(4), region);
            e.setAggro();
            await sleep(100);
            const k = await fight([e], { mode: "kit", god: !0, timeout: 150 });
            b.kit = { sec: k.sec, killed: k.killed, left: k.left, basic: k.basic, spell: k.spell, art: k.art, tries: k.tries, perHit: k.perHit };
          }
          r.boss = b;
        }
        clear();
        MUL = null;
        return r;
      },
    };
  }, ov);
}
