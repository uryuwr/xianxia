// 技能栏（屏幕下方居中）：法术 Q / E / R、蓄势斩 右键（"势"格）、法宝 V、阵法 T、丹药 1 / 2、遁地符 G（出行局里才显示）。
// "势"格：圆相外再一圈气势环（--mv）；≥ 50 淡金"可放"，满 = 势成泛金；气势不足时按右键，格子抖一下。
// 水墨样式（《UI 风格指南》§5.16 与 docs/ui/v2/hud.html）：墨晕底衬上一排圆相技能格 + 意象图标（技能图标 v1 · 甲"意象写意"，
// docs/ui/v2/png/skill_icons_compare.png；图集见 src/ui/icons.js iconForSkill），五行色只做格心的一团淡彩；丹药 / 符箓用物品图标；
// 没有图标的技能退回单字；
// 冷却是扫过的淡墨扇形 + 秒数；真气不足时圆相退淡、真气数转朱；未解锁的栏写"锁"并在下面注明"练气三层解锁"。
// 形状与颜色变量来自 src/ui/ink/（strokes.css 的圆相 mask、ink-ui.css 的 .hud-skill / .ink-wash / .ink-bar）。
import "./ink/strokes.css";
import "./ink/fonts.css";
import "./ink/ink-ui.css";
import { PROGRESSION } from "../data/progression.js";
import { ensureStyle as ensureIconStyle, iconStyle, skillIconStyle } from "./icons.js";
const POT_ITEM = { mp_pill: "huiqi_dan", hp_pill: "huichun_dan" };

const ELEM_CLASS = ["metal", "wood", "water", "fire", "earth"];
// 格心淡彩（低饱和、低透明）
const ELEM_WASH = { metal: "rgba(168,134,47,.24)", wood: "rgba(63,154,110,.22)", water: "rgba(47,127,168,.22)", fire: "rgba(192,57,43,.2)", earth: "rgba(154,106,50,.22)", none: "rgba(184,146,58,.2)" };
const NUM = "一二三四五六七八九十";

const CSS = `
.jx-bar { position: fixed; left: 50%; bottom: 4px; transform: translateX(-50%); display: flex; align-items: flex-end; gap: 14px; padding: 14px 28px 34px;
  z-index: 15; pointer-events: none; user-select: none; --wash-color: rgba(240, 234, 220, .93); } /* 墨晕 .8 → .93：UI 体检 v1「字随墨晕」 */
.jx-bar > .gap { width: 10px; }
.jx-bar > .base { position: absolute; left: 14px; right: 14px; bottom: 30px; height: 8px; background: var(--ink-qing);
  -webkit-mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin) 0 0 / 100% 100% no-repeat; }
.jx-slot.hud-skill { pointer-events: auto; transition: transform .12s; }
.jx-slot.hud-skill.hide { display: none; }
/* 格心：纸色晕 + 一团五行淡彩 */
.jx-slot.hud-skill::before { inset: 6%; background: radial-gradient(circle at 50% 46%, var(--elw, transparent) 0 34%, transparent 62%),
  radial-gradient(circle, rgba(245, 240, 227, .92) 40%, rgba(245, 240, 227, 0) 72%); }
.jx-slot.hud-skill:nth-of-type(3n + 1)::after { -webkit-mask-image: var(--ink-enso-1); mask-image: var(--ink-enso-1); }
.jx-slot.hud-skill:nth-of-type(3n + 3)::after { -webkit-mask-image: var(--ink-enso-3); mask-image: var(--ink-enso-3); }
.jx-slot.hud-skill.none { --el: var(--nijin); }
.jx-slot.hud-skill > .g { position: relative; line-height: 1; transition: color .2s; }
.jx-slot.hud-skill > .k { z-index: 2; }
/* 图标：占圆相内径约 70%，压在格心淡彩之上、冷却墨扇之下；按键角标、秒数、真气数都在其上 */
.jx-slot.hud-skill > .mk-ico { --ih: 66%; z-index: 0; transition: opacity .2s; }
.jx-slot.hud-skill > .mk-ico.off { display: none; }
.jx-slot.hud-skill.nomp > .mk-ico { opacity: .4; filter: grayscale(.7); }
.jx-slot.hud-skill.empty > .mk-ico { display: none; }
/* 冷却：淡墨扇形扫过（边缘晕开），中间秒数 */
.jx-slot.hud-skill > .cd { inset: 12%; z-index: 1; background: conic-gradient(rgba(21, 24, 27, .64) 0 calc(var(--cd, 0) * 360deg - 8deg), rgba(21, 24, 27, .34) calc(var(--cd, 0) * 360deg), transparent 0);
  -webkit-mask: radial-gradient(circle, #000 52%, rgba(0, 0, 0, .55) 66%, transparent 74%); mask: radial-gradient(circle, #000 52%, rgba(0, 0, 0, .55) 66%, transparent 74%); }
.jx-slot.hud-skill > .t { z-index: 2; text-shadow: 0 0 4px rgba(21, 24, 27, .85), 0 0 2px rgba(21, 24, 27, .9); }
.jx-slot.hud-skill > .c { z-index: 2; }
.jx-slot.hud-skill.sm > .c { color: var(--ink-nong); }
.jx-slot.hud-skill > .ct { position: absolute; left: 50%; top: calc(100% + 2px); transform: translateX(-50%); white-space: nowrap; text-align: center;
  font: 13px/14px var(--f-kai, "KaiTi", "STKaiti", serif); color: var(--ink-nong); text-shadow: 0 0 3px var(--paper-hi), 0 0 3px var(--paper-hi), 0 0 6px var(--paper-hi); }
.jx-slot.hud-skill > .ct small { display: block; font-size: 12px; color: var(--ink-nong); } /* 11px 淡墨 → 12px 浓墨（UI 体检 v1） */
.jx-slot.hud-skill > .ct:empty { display: none; }
/* 真气不足 / 丹药用尽：圆相退淡、字退淡、真气数转朱 */
.jx-slot.hud-skill.nomp::after { opacity: .32; }
.jx-slot.hud-skill.nomp > .g { color: var(--ink-dan); }
.jx-slot.hud-skill.nomp > .c { color: var(--zhu); }
.jx-slot.hud-skill.empty::after { opacity: .22; }
.jx-slot.hud-skill.locked > .g { font-size: .78em; }
.jx-slot.hud-skill.ready { animation: jxReady .42s var(--ease-ink, ease-out); }
.jx-slot.hud-skill.deny { animation: jxDeny .3s; }
@keyframes jxReady { 0% { transform: scale(1); } 35% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes jxDeny { 0%, 100% { translate: 0; } 25% { translate: -4px; } 75% { translate: 4px; } }
.jx-barmsg { position: fixed; left: 50%; bottom: 112px; transform: translateX(-50%); font: 22px var(--f-display); letter-spacing: .12em; color: var(--ink-nong);
  text-shadow: 0 0 4px var(--paper-hi), 0 0 10px var(--paper-hi), 0 0 2px var(--paper-hi); opacity: 0; transition: opacity .15s; z-index: 15; pointer-events: none; }
.jx-barmsg.on { opacity: 1; }
.jx-shield.ink-bar { position: fixed; left: 50%; bottom: 104px; width: 240px; margin-left: -120px; --bc: var(--zhe); z-index: 15; opacity: 0; transition: opacity .2s; pointer-events: none; }
.jx-shield.ink-bar.on { opacity: 1; }
/* "势"格：外圈气势环（一笔圆相按 --mv 画出），可放淡金、势成泛金 */
.jx-slot.hud-skill.mom > .mr { position: absolute; inset: -7px; z-index: -1; pointer-events: none; opacity: .9;
  background: conic-gradient(var(--mc, rgba(21, 24, 27, .45)) calc(var(--mv, 0) * 360deg), rgba(21, 24, 27, .1) 0);
  -webkit-mask: var(--ink-enso-full) 0 0 / 100% 100% no-repeat; mask: var(--ink-enso-full) 0 0 / 100% 100% no-repeat; }
.jx-slot.hud-skill.mom { --el: var(--ink-zhong); }
.jx-slot.hud-skill.mom.half { --mc: rgba(201, 160, 64, .5); --el: rgba(184, 146, 58, .5); }
.jx-slot.hud-skill.mom.full { --mc: #c99a3a; --el: var(--nijin); }
.jx-slot.hud-skill.mom.full > .mr { inset: -9px; animation: jxMomGlow 1.2s ease-in-out infinite alternate; }
.jx-slot.hud-skill.mom.full::before { background: radial-gradient(circle at 50% 46%, rgba(217, 180, 94, .55) 0 40%, transparent 66%), radial-gradient(circle, rgba(245, 240, 227, .92) 40%, rgba(245, 240, 227, 0) 72%); }
.jx-slot.hud-skill.mom.full > .c { color: var(--zhu); font-weight: 700; }
.jx-slot.hud-skill.mom:not(.half):not(.full) > .mk-ico { opacity: .45; filter: grayscale(.8); }
.jx-slot.hud-skill.mom > .c { color: #8a6a22; }
@keyframes jxMomGlow { from { opacity: .7; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .jx-slot.hud-skill.ready, .jx-slot.hud-skill.deny { animation: none; } }
`;

export class SkillBar {
  constructor(sys) {
    this.sys = sys;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement("div");
    this.el.className = "jx-bar ink-wash";
    document.body.appendChild(this.el);
    this.msg = document.createElement("div");
    this.msg.className = "jx-barmsg";
    document.body.appendChild(this.msg);
    this.shield = document.createElement("div");
    this.shield.className = "jx-shield ink-bar thin";
    this.shield.innerHTML = "<i></i>";
    document.body.appendChild(this.shield);
    this.slots = {};
    ensureIconStyle();
    this.msgT = 0;
    this._shieldV = -1;
    this.build();
    // 气势不足时按右键：势格抖一下
    sys.ctx.world.events.on("player:chargeDenied", () => this.flash("charge"));
  }
  mk(key, label, small) {
    const d = document.createElement("div");
    d.className = "jx-slot hud-skill" + (small ? " sm" : "");
    d.innerHTML = `<span class="mk-ico off"></span><span class="g"></span><span class="cd"></span><span class="t"></span><span class="k">${label}</span><span class="c"></span><span class="ct"></span>`;
    d.addEventListener("mousedown", (e) => e.stopPropagation());
    this.el.appendChild(d);
    const s = { el: d, ico: d.querySelector(".mk-ico"), g: d.querySelector(".g"), cd: d.querySelector(".cd"), t: d.querySelector(".t"), c: d.querySelector(".c"), ct: d.querySelector(".ct"), last: { p: -1, t: "", nomp: null, n: null } };
    this.slots[key] = s;
    return s;
  }
  gap() {
    this.el.appendChild(Object.assign(document.createElement("span"), { className: "gap" }));
  }
  build() {
    this.el.innerHTML = '<span class="base"></span>';
    this.slots = {};
    this.mk("Q", "Q");
    this.mk("E", "E");
    this.mk("R", "R");
    this.gap();
    const m = this.mk("charge", "右键");
    m.el.classList.add("mom");
    m.mr = Object.assign(document.createElement("span"), { className: "mr" });
    m.el.appendChild(m.mr);
    this.mk("artifact", "V");
    this.mk("formation", "T");
    this.gap();
    this.mk("pot0", "1", !0);
    this.mk("pot1", "2", !0);
    this.mk("talisman", "G", !0);
    this.refresh();
  }
  // ---- 解锁说明：有存档时按成长表（练气三层…），没有时退回构筑系统的境界说明 ----
  get profile() {
    const c = this.sys.ctx;
    return (c.flow && c.flow.profile) || (window.__game && window.__game.profile) || null;
  }
  realmText(key) {
    const [st, ly] = key.split(":").map(Number);
    const name = (PROGRESSION.stages[st] || {}).name;
    return name ? `${name}${NUM[ly - 1] || ly}层` : "";
  }
  // 第 i 个法术栏 / "artifactSlot" / "formationSlot" 在哪个境界解锁
  unlockAt(what, i = 0) {
    const list = PROGRESSION.unlocks[what === "spell" ? "spellSlots" : what];
    if (!list) return "";
    const hit = list.find(([, v]) => (what === "spell" ? v > i : v === !0));
    return hit ? this.realmText(hit[0]) : "";
  }
  lockText(i) {
    if (this.profile) {
      const r = this.unlockAt("spell", i);
      if (r) return r + "解锁";
    }
    return this.sys.unlockText(i);
  }
  setElem(slot, element) {
    const el = slot.el, e = ELEM_CLASS.includes(element) ? element : element === undefined ? "" : "none";
    if (slot.elem === e) return;
    if (slot.elem) el.classList.remove(slot.elem);
    if (e) el.classList.add(e);
    el.style.setProperty("--elw", e ? ELEM_WASH[e] : "transparent");
    slot.elem = e;
  }
  // 锁定说明：两行（"练气三层" / "解锁"），避免相邻两格的字挤在一起
  setLocked(slot, text) {
    slot.el.classList.toggle("locked", !!text);
    const m = text && /^(.+?)(解锁)$/.exec(text);
    slot.ct.innerHTML = !text ? "" : m ? `${m[1]}<small>${m[2]}</small>` : text;
  }
  // 圆相里的图标：有图标就画图标（单字清空），没有就退回单字；只在变化时写 DOM
  setIcon(slot, style, glyph) {
    if (slot.icoStyle !== style) {
      if (style) slot.ico.setAttribute("style", style);
      slot.ico.classList.toggle("off", !style);
      slot.icoStyle = style;
    }
    const g = style ? "" : glyph || "";
    if (slot.glyph !== g) (slot.g.textContent = g), (slot.glyph = g);
  }
  // 配置变化时刷新图标、描述、颜色
  refresh() {
    const s = this.sys, P = this.profile;
    for (const [k, i] of [["Q", 0], ["E", 1], ["R", 2]]) {
      const lock = s.slotLocked && s.slotLocked(i);
      const sp = lock ? null : s.spellAt(i), el = this.slots[k];
      this.setLocked(el, lock ? this.lockText(i) : "");
      this.setIcon(el, lock || !sp ? "" : skillIconStyle(sp.id), lock ? "锁" : sp ? sp.glyph : "");
      el.c.textContent = sp ? sp.cost : "";
      el.el.classList.toggle("empty", !sp && !lock);
      this.setElem(el, sp ? sp.element : undefined);
      el.el.title = lock ? this.lockText(i) : sp ? `${sp.name} · ${sp.role || ""}（真气 ${sp.cost}，冷却 ${sp.cd} 秒）\n${sp.desc}` : "空";
    }
    const sc = this.slots.charge;
    this.setIcon(sc, skillIconStyle("charge"), "势");
    sc.el.title = [
      "右键 · 蓄势斩：气势 ≥ 50 可放（按气势比例），满 = 势成",
      "· 伤害约为同境界剑气斩三道全中的 1.8 倍（半势约 1 倍）",
      "· 剑意破盾：不看五行，直接削去护盾上限 35%（首领每段 20%）",
      "· 满势击倒小怪、打断精英蓄力与首领预警；招式本身不附带持续伤害",
      "· 气势不随时间流失，可在小怪身上攒好带去打精英 / 首领；放出后清零",
    ].join("\n");
    const a = s.artifactDef, sa = this.slots.artifact;
    const aLock = !a && P && P.unlocks && !P.unlocks.artifactSlot ? this.unlockAt("artifactSlot") : "";
    this.setLocked(sa, aLock && aLock + "解锁");
    this.setIcon(sa, a ? skillIconStyle(a.id) : "", a ? a.glyph : aLock ? "锁" : "");
    sa.c.textContent = a && a.active.cost ? a.active.cost : "";
    sa.el.classList.toggle("empty", !a && !aLock);
    this.setElem(sa, a ? a.element || null : undefined);
    sa.el.title = a ? `${a.name}（祭炼 ${s.loadout.artifact.level} 重）\n${a.desc}` : aLock ? aLock + "解锁" : "空";
    const f = s.formationDef, sf = this.slots.formation;
    const fLock = !f && P && P.unlocks && !P.unlocks.formationSlot ? this.unlockAt("formationSlot") : "";
    this.setLocked(sf, fLock && fLock + "解锁");
    this.setIcon(sf, f ? skillIconStyle(f.id) : "", f ? f.glyph : fLock ? "锁" : "");
    sf.c.textContent = f ? f.cost : "";
    sf.el.classList.toggle("empty", !f && !fLock);
    this.setElem(sf, f ? f.element || null : undefined);
    sf.el.title = f ? `${f.name}（真气 ${f.cost}，冷却 ${f.cd} 秒）\n${f.desc}` : fLock ? fLock + "解锁" : "空";
    s.potions.forEach((p, i) => {
      const el = this.slots["pot" + i];
      if (!el) return;
      this.setIcon(el, p && POT_ITEM[p.def.id] ? iconStyle(POT_ITEM[p.def.id]) : "", p ? p.def.glyph : "");
      el.el.classList.toggle("empty", !p);
      el.el.title = p ? p.def.name : "空";
      this.setElem(el, p ? p.def.element || (/气|灵/.test(p.def.glyph) ? "water" : "wood") : undefined);
    });
    const tl = this.slots.talisman;
    this.setIcon(tl, iconStyle("dundi_fu"), "符");
    tl.el.title = "遁地符：按 G 原地读条遁回洞府（受击打断）";
    this.setElem(tl, "earth");
  }
  flash(key, text) {
    const el = this.slots[key];
    if (el) {
      el.el.classList.remove("deny");
      void el.el.offsetWidth;
      el.el.classList.add("deny");
    }
    if (text) {
      this.msg.textContent = text;
      this.msg.classList.add("on");
      this.msgT = 1.0;
    }
  }
  update(dt) {
    const s = this.sys, hero = s.hero;
    if (!hero) return;
    const set = (key, p, t, nomp) => {
      const el = this.slots[key];
      if (!el) return;
      const L = el.last;
      const pr = Math.round(p * 100) / 100;
      if (pr !== L.p) {
        if (L.p > 0 && pr === 0) {
          el.el.classList.remove("ready");
          void el.el.offsetWidth;
          el.el.classList.add("ready");
        }
        el.cd.style.setProperty("--cd", pr);
        L.p = pr;
      }
      if (t !== L.t) (el.t.textContent = t), (L.t = t);
      if (nomp !== L.nomp) el.el.classList.toggle("nomp", !!nomp), (L.nomp = nomp);
    };
    const count = (el, n) => {
      if (el && el.last.n !== n) (el.c.textContent = n == null ? "" : "×" + n), (el.last.n = n);
    };
    const cdView = (key) => {
      const c = s.cd[key] || 0, m = s.cdMax[key] || 1;
      return [c > 0 ? c / m : 0, c > 0 ? (c >= 1 ? Math.ceil(c) : c.toFixed(1)) : ""];
    };
    ["Q", "E", "R"].forEach((k, i) => {
      const sp = s.spellAt(i);
      const [p, t] = cdView(k);
      set(k, p, t, sp && !s.slotLocked(i) && hero.mp < sp.cost);
    });
    // "势"格：外圈气势环（变化 ≥ 0.5% 才写）、可放 / 势成状态、角标写气势数
    {
      const pl = s.ctx.player, sc = this.slots.charge, L = sc.last;
      const mv = pl && pl.momentum != null ? Math.round((pl.momentum / (pl.momentumMax || 100)) * 200) / 200 : 0;
      if (L.mv !== mv) {
        sc.el.style.setProperty("--mv", mv);
        L.mv = mv;
        const st = mv >= 1 ? 2 : mv >= 0.5 ? 1 : 0;
        if (L.ms !== st) {
          sc.el.classList.toggle("half", st === 1);
          sc.el.classList.toggle("full", st === 2);
          if (st > (L.ms ?? 0)) (sc.el.classList.remove("ready"), void sc.el.offsetWidth, sc.el.classList.add("ready"));
          L.ms = st;
        }
        const txt = st === 2 ? "势成" : String(Math.floor(mv * 100));
        if (L.mt !== txt) (sc.c.textContent = txt), (L.mt = txt);
      }
    }
    const a = s.artifactDef;
    {
      const [p, t] = cdView("artifact");
      set("artifact", p, t, a && hero.mp < a.active.cost);
    }
    const f = s.formationDef;
    {
      const [p, t] = cdView("formation");
      set("formation", p, t, f && hero.mp < f.cost);
    }
    s.potions.forEach((po, i) => {
      if (!po) return;
      const [p, t] = cdView("pot" + i);
      set("pot" + i, p, t, po.count <= 0);
      count(this.slots["pot" + i], po.count);
    });
    // 遁地符：只在出行局里显示
    const run = (window.__game && window.__game.run) || null;
    const tl = this.slots.talisman;
    const hasRun = !!(run && typeof run.talismanCount === "function");
    if (tl.last.show !== hasRun) tl.el.classList.toggle("hide", !hasRun), (tl.last.show = hasRun);
    if (hasRun) {
      const n = run.talismanCount();
      count(tl, n);
      set("talisman", 0, "", n <= 0);
    }
    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.msg.classList.remove("on");
    const sh = s.shield;
    const v = sh.amount > 0 ? Math.round((sh.amount / sh.max) * 100) / 100 : 0;
    if (v !== this._shieldV) {
      this.shield.classList.toggle("on", v > 0);
      this.shield.style.setProperty("--v", v);
      this._shieldV = v;
    }
  }
}
