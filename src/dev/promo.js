// 宣传片 / 试玩用的调试入口（宣传视频岗，docs/promo/青牙_v2_分镜.md；青牙 v2 §10.2 第 9 项）。只在 URL 带参数时由 main.js 按需加载，不影响正常游戏。
//   ?scene=run&region=r1&slot=7&preset=T2&boss=qingya&hud=boss&seed=7&god=1
//   preset   档位：T1 初见被虐（练二）/ T2 打到二阶段（练四）/ T3 打死（练七）/ T4 轻松通关（筑基）；也可以写 L2…L9、L10（=筑基）或 C-L2
//            档位内容（境界、装备、法术、心法、法宝、闪身、丹药）与数值策划 tools/scenarios/num_qingya.mjs 的 preset(L) 一致，改档位时两边同步
//   boss=qingya  清场、停刷怪 / 夜潮，把林墨放到狼谷（at=gate 狼骨门坡顶 | pit 谷里触发圈外（默认）| fight 直接开战）
//   tries=N  第 N 次挑战（入场题签"第 N 次 · 上回削至 X%"）；last=0.52 上回剩血；lastPhase=2；best=2:0.41（阶段:剩血）。tries>1 时入场是短版
//   hud      1 全显示（默认）| boss 只留首领条 / 处决 / 飘字 | 0 全隐藏（处决的"斩"、朱印、留白照常显示）
//   seed=N   固定随机种子（替换 Math.random；首领出招等随机从这里开始可复现）
//   god=1 主角无敌；mom=1 开场满势；mp=1 真气自动回复（拍法术镜头用）
// 运行时接口 window.__promo：{ apply(preset), hud(mode), seed(n), boss(), place(x, z), log(o), presets, ready }
//   录制脚本（tools/trailer/shots_qingya.mjs）也直接 import 本文件，用同一套档位。

// 与 num_qingya.mjs preset(L) 同步（数值策划 2026-11-17：T1 练二 / T2 练四（可能改练五）/ T3 练七 / T4 筑基）
export function presetOf(L) {
  const zj = L >= 10, lay = zj ? 9 : L;
  const gear = lay <= 4
    ? { sword: lay <= 1 ? ["rust_sword", 1, 0] : ["sword_qingfeng", lay, lay >= 3 ? 1 : 0], ...(lay >= 3 ? { robe: ["robe_bu", lay, lay >= 4 ? 1 : 0] } : {}) }
    : { sword: ["sword_zhuying", lay, lay >= 7 ? 2 : 1], robe: ["robe_lingsi", lay, lay >= 7 ? 2 : 1], jade: ["jade_shuiling", lay, lay >= 8 ? 1 : 0] };
  return {
    L,
    label: zj ? "筑基" : `练气${"一二三四五六七八九"[L - 1]}层`,
    realm: zj ? [2, 1] : [1, L],
    gear,
    spells: ["sword_qi", ...(lay >= 3 ? ["vine"] : []), ...(lay >= 7 ? ["frost"] : [])],
    xinfa: lay >= 4 ? ["sharp"] : [],
    artifact: lay >= 7 ? "art_flying_sword" : null,
    pots: { mp: L >= 2 ? 3 : 0, hp: 3 },
  };
}
export const TIERS = { T1: 2, T2: 4, T3: 7, T4: 10 };
export const TIER_NAME = { T1: "初见被虐", T2: "打到二阶段", T3: "打死", T4: "轻松通关" };
export function levelOf(name) {
  if (name == null || name === "") return null;
  const s = String(name).toUpperCase();
  if (TIERS[s]) return TIERS[s];
  const m = s.match(/(\d+)\s*$/);
  return m ? Math.max(1, Math.min(10, Number(m[1]))) : null;
}
export const VALLEY = { gate: [57, -48], pit: [38, -26], fight: [46, -16], home: [50, -22] }; // fight 落点避开 1 号狼牙石柱 (50, −14)

// ---- 固定种子：mulberry32 ----
const RND0 = Math.random;
export function seed(n) {
  if (n == null || n === "") return (Math.random = RND0), null;
  let a = Number(n) >>> 0 || 1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return a;
}

// ---- 隐藏 HUD：visibility 可被子元素覆盖，所以处决演出层（.bx-exec，在首领图层里）能单独留下 ----
const HUD_CSS = `
html.promo-hud-0 body > :not(#view) { visibility: hidden !important; }
html.promo-hud-0 .bx-exec, html.promo-hud-0 .bx-exec * { visibility: visible !important; }
html.promo-hud-boss body > :not(#view):not(.mk-layer-boss):not(#dmg):not(.jx-reactions):not(.jx-ebars) { visibility: hidden !important; }
`;
export function hud(mode = "1") {
  mode = String(mode);
  if (!document.getElementById("promo-hud-css")) {
    const st = document.createElement("style");
    st.id = "promo-hud-css";
    st.textContent = HUD_CSS;
    document.head.appendChild(st);
  }
  const H = document.documentElement.classList;
  H.remove("promo-hud-0", "promo-hud-boss");
  if (mode === "0" || mode === "none") H.add("promo-hud-0");
  else if (mode === "boss") H.add("promo-hud-boss");
  return mode;
}

const G = () => window.__game;

// 档位：境界、装备、法术、心法、法宝、丹药；气血真气回满（与 num_qingya runTrial 的存档段相同）
export async function apply(name) {
  const L = typeof name === "number" ? name : levelOf(name);
  if (!L) return null;
  const pre = presetOf(L), g = G(), p = g.profile, P = g.player, H = P.entity, S = g.ctx.skills;
  const { makeItem } = await import("../core/items.js");
  const { applyUnlocks } = await import("../game/progression.js");
  p.realm = { stage: pre.realm[0], layer: pre.realm[1] };
  p.flags.tutorialDone = !0;
  p.stats.runs = Math.max(p.stats.runs || 0, 3);
  applyUnlocks(p);
  p.equip = { sword: null, robe: null, jade: null, artifact: null };
  for (const [slot, [id, level, rarity]] of Object.entries(pre.gear)) p.equip[slot] = makeItem(id, { level, rarity, identified: !0 });
  if (pre.artifact) p.equip.artifact = makeItem(pre.artifact, { identified: !0 });
  p.build.spells = [0, 1, 2].map((i) => pre.spells[i] || null);
  p.build.xinfa = [...pre.xinfa];
  (p.flags.learned ||= {}).spells = [...pre.spells];
  p.flags.learned.xinfa = [...pre.xinfa];
  g.ctx.applyProfileStats(p);
  if (g.run && g.run.applyProfileToHero) try { g.run.applyProfileToHero(); } catch {}
  H.alive = !0;
  H.hp = H.stats.get("hp");
  H.mp = H.stats.get("mp");
  if (S && S.potions) {
    if (S.potions[0]) S.potions[0].count = pre.pots.mp;
    if (S.potions[1]) S.potions[1].count = pre.pots.hp;
  }
  window.__promo && (window.__promo.preset = pre);
  return pre;
}

// 首领战报：第 N 次挑战（入场题签读 bossLog）
export function log({ tries = 1, last = null, lastPhase = 1, best = null } = {}) {
  const p = G().profile, S = (p.stats ||= {}), B = (S.bossLog ||= {});
  const L = (B.qingya = { tries: Math.max(0, tries - 1), kills: 0, retreats: 0, deaths: Math.max(0, tries - 1), firstKill: null, best: null, fastest: null, execs: { break: 0, final: 0 }, log: [] });
  if (tries > 1) {
    p.flags.bossIntro_qingya = 1;
    const hp = last == null ? 0.6 : Number(last);
    L.log.push({ run: tries - 1, realm: "1:1", result: hp <= 0 ? "kill" : "death", phase: Number(lastPhase) || 1, hpLeft: hp, sec: 60 });
    if (hp <= 0) (L.kills = 1), (L.firstKill = { run: tries - 1, realm: "1:7", sec: 150 }), (p.flags.boss_qingya = !0);
    if (best) {
      const [ph, left] = String(best).split(":").map(Number);
      L.best = { phase: ph || 1, hpLeft: left ?? hp, realm: "1:1" };
    } else L.best = { phase: Number(lastPhase) || 1, hpLeft: hp, realm: "1:1" };
  } else delete p.flags.bossIntro_qingya;
  return L;
}

// 清场、停刷怪 / 夜潮 / 天时推进（录制期间画面干净）
let calmT = 0;
export function calm(on = !0) {
  const g = G(), r = g.run, E = g.ctx.enemies;
  clearInterval(calmT);
  if (!on) return;
  E.auto = !1;
  if (r) r.nextWave = 1e9;
  const tick = () => {
    if (!r || r.state !== "play") return;
    r.t = Math.min(r.t, 5);
    r.tutorialWolf = null;
    r.nextWave = 1e9;
  };
  tick();
  calmT = setInterval(tick, 250);
}
export function clearAdds() {
  const g = G(), E = g.ctx.enemies, w = g.world;
  for (const e of [...E.list]) if (e.type !== "qingya") (e.entity.alive = !1), w.remove(e.entity), e.dispose();
  E.list = E.list.filter((e) => e.type === "qingya");
  document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
}
export function place(x, z, view = null) {
  const g = G();
  g.player.spawn(x, z);
  if (view) g.rig.set(view, !0);
  g.rig.update(1, !0);
}
export const boss = () => {
  const E = G().ctx.enemies;
  return E.list.find((e) => e.type === "qingya" && e.alive) || null;
};
// 等首领生成（关卡按距离刷出）
export async function waitBoss(ms = 20000) {
  const t0 = performance.now();
  for (;;) {
    const b = boss();
    if (b && b.ctrl) return b;
    if (performance.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// URL 参数入口（main.js 调）
export async function install(game, qs) {
  const api = (window.__promo = { apply, hud, seed, boss, place, log, calm, clearAdds, waitBoss, presets: { TIERS, TIER_NAME, presetOf }, ready: !1, preset: null });
  if (qs.has("hud")) hud(qs.get("hud"));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 1800 && !(game.run && game.run.state === "play" && game.ctx.enemies.ready && game.heroSource); i++) await sleep(100);
  await sleep(300);
  if (qs.has("preset")) await apply(qs.get("preset"));
  if (qs.get("god") === "1") game.player.debug.god = !0;
  if (qs.get("mp") === "1") game.player.entity.stats.add({ stat: "mpRegen", type: "flat", value: 60, source: "promo" });
  const b = qs.get("boss");
  if (b === "qingya") {
    calm(!0);
    clearAdds();
    if (qs.has("tries")) log({ tries: Number(qs.get("tries")), last: qs.get("last"), lastPhase: qs.get("lastPhase"), best: qs.get("best") });
    const at = qs.get("at") || "pit";
    const [x, z] = VALLEY[at] || VALLEY.pit;
    place(x, z, "play");
    if (qs.has("seed")) seed(qs.get("seed"));
    const q = await waitBoss();
    clearAdds();
    if (q && at === "fight" && q.ctrl.mode === "asleep") q.ctrl.startIntro("enter");
  } else if (qs.has("seed")) seed(qs.get("seed"));
  if (qs.get("mom") === "1") (game.player.momentum = game.player.momentumMax || 100), (game.player.momT = 0);
  api.ready = !0;
  console.log("[promo] ready", JSON.stringify({ preset: api.preset && api.preset.label, boss: b, hud: qs.get("hud") }));
  return api;
}
