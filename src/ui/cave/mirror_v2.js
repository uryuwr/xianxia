// 天机镜 v2（方案 A：圆镜 · 镜中屏）——洞府里的天机镜：铜镜里嵌一块被水墨重画过的手机屏。
// 设计：docs/ui/v2/天机镜_v2_方案.md、示意图 docs/ui/v2/mirror_v2/a_yuanjing.html。
// 懒加载：本文件由 CaveUI.openMirror() 第一次打开时 import()；界面在 open 时才构建，合上即移除（性能规范 §7）。
//   const m = new MirrorV2(ui, { from: { x, y, r }（3D 镜台在屏幕上的位置，进出场从这里放大 / 缩回）, app?, open? })
//   m.done → Promise（合上后 resolve）；m.close()
// 应用：主屏 / 境界录（历次 · 总览）/ 相册 / 行迹 / 舆图 / 消息 · 拨号（筑基前"无服务"）。
// 数据：profile.stats.breakHistory（洞府组写入），缺的字段显示"—"；见方案 §4 的字段清单。
import "./mirror_v2.css";
import { PROGRESSION } from "../../data/progression.js";
import { SPELLS } from "../../data/skills.js";
import { XINFA } from "../../data/items.js";
import { RARITY, ITEMS } from "../../core/items.js";
import { applyUnlocks, xpNeed } from "../../game/progression.js";
import { MEMORIES, XJZ_BREAK } from "../../game/cave/story.js";
import * as F from "../../game/cave/facilities.js";
import { bossReport, bossSide } from "../boss/boss_report.js"; // 战报应用（UI 设计，boss_青牙_v2）

const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const NA = "—";
const rkOf = (r) => (typeof r === "string" ? r : r ? r.stage + ":" + r.layer : "");
const nameOf = (k) => {
  const [s, l] = k.split(":").map(Number);
  return s === 0 ? "凡人" : ((PROGRESSION.stages[s] && PROGRESSION.stages[s].name) || "") + (CN[l] || l) + "层";
};
const shortOf = (from, to) => (from[0] === to[0] && to[0] !== "0" ? (CN[+to.split(":")[1]] || "") + "层" : nameOf(to));
const MEM_KEYS = Object.keys(MEMORIES);

// ---------------- 属性 ----------------
const STATS = [
  { k: "hp", n: "气血" }, { k: "mp", n: "真气" }, { k: "atk", n: "攻击" }, { k: "spell", n: "法力" }, { k: "def", n: "防御" },
  { k: "aspd", n: "攻速", f: (v) => v.toFixed(2) }, { k: "sense", n: "神识" },
  { k: "dashMax", n: "闪身", u: "次" }, { k: "dashCd", n: "闪身冷却", u: "秒", lower: !0, f: (v) => v.toFixed(2) },
  { k: "hpRegen", n: "回血", u: "/秒" }, { k: "mpRegen", n: "回气", u: "/秒" },
  { k: "crit", n: "会心", f: (v) => Math.round(v * 100) + "%" }, { k: "critDmg", n: "会心伤害", f: (v) => Math.round(v * 100) + "%" },
  { k: "move", n: "身法" },
];
const CHIP_KEYS = ["hp", "mp", "atk", "spell", "def", "aspd", "sense", "dashMax", "crit"];
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (s, v) => (s.f ? s.f(v) : String(r2(v)));
const fmtD = (s, d) => (d > 0 ? "+" : "−") + (s.f ? s.f(Math.abs(d)) : String(r2(Math.abs(d)))).replace(/^0\./, ".");
const growth = (k) => PROGRESSION.growth[k] || {};

// ---------------- 解锁 / 所得 ----------------
// 显示名；kind：解（栏位）/ 能（身法）/ 途（去处）
const UNL = {
  spellSlots: ["法术栏", "n"], pillSlots: ["丹药栏", "n"], xinfaSlots: ["心法栏", "n"], pillCap: ["丹药囊", "n"],
  robeSlot: ["法衣栏"], jadeSlot: ["玉佩栏"], artifactSlot: ["法宝栏"], formationSlot: ["阵法栏"],
  doubleJump: ["二段跳", "", "ab"], swordFly: ["御剑", "", "ab"], sword_fly: ["御剑", "", "ab"],
  region2: ["竹海 · 溪谷", "", "rg"], region3: ["黑风岭", "", "rg"],
  bagMax: ["储物袋", "cap"], pouchMax: ["贴身锦囊", "cap"], bagCapacity: ["储物袋", "cap"],
  furnace: [F.FAC_UNLOCK_TEXT.furnace], forge: [F.FAC_UNLOCK_TEXT.forge], // 丹炉 / 炼器鼎按修为解锁
};
function unlockView(u) {
  if (u.value === !1 || u.value == null || u.value === 0) return null;
  const d = UNL[u.key] || [u.key];
  const v = d[1] === "n" && typeof u.value === "number" ? "×" + u.value : d[1] === "cap" && typeof u.value === "number" ? `可扩至 ${u.value} 格` : "";
  return { t: d[0], v, kind: d[2] || "" };
}
function grantName(g) {
  if (g.name && g.name !== g.id) return g.name;
  const t = g.kind === "spells" ? SPELLS : g.kind === "xinfa" ? XINFA : null;
  return (t && t[g.id] && t[g.id].name) || g.name || g.id;
}
const sealHtml = (txt, cls = "", s = 18) => `<span class="ink-seal ${cls}" style="--s:${s}px">${txt}</span>`;
function gainsHtml(unlocks, grants) {
  const u = unlocks.map((x) => `<span class="gn ${x.kind === "rg" ? "rg" : ""}">${sealHtml(x.kind === "rg" ? "途" : x.kind === "ab" ? "能" : "解", x.kind === "rg" ? "blue" : x.kind === "ab" ? "green" : "ink")}${x.t}${x.v ? " " + x.v : ""}</span>`);
  const g = grants.map((x) => x.kind === "recipe" ? `<span class="gn">${sealHtml("方", "gold")}${x.book || "配方"}《${x.name}》</span>` : x.kind === "item" ? `<span class="gn">${sealHtml("得", "gold")}${grantName(x)}</span>` : `<span class="gn">${sealHtml(x.kind === "xinfa" ? "悟" : "习", "gold")}${x.kind === "xinfa" ? "心法《" + grantName(x) + "》" : "《" + grantName(x) + "》"}</span>`); // kind "item"：栏位开启赠送的基础款
  return [...u, ...g].join("");
}

// ---------------- 时辰 ----------------
const ZHI = "子丑寅卯辰巳午未申酉戌亥";
function shichen(date) {
  const h = date.getHours(), m = date.getMinutes();
  return { zhi: ZHI[Math.floor(((h + 1) % 24) / 2)] + "时", sub: (h % 2 === 1 ? "初" : "正") + "一二三四"[Math.min(3, Math.floor(m / 15))] + "刻" };
}

// ---------------- 记忆速写 / 壁纸 / 裂纹（与示意图同一套） ----------------
const SK = 'fill="none" stroke="#15181b" stroke-linecap="round" stroke-linejoin="round"';
const WS = 'fill="rgba(21,24,27,.12)" stroke="none"';
const BL = "#2f7fa8";
const DOODLE = {
  "1:1": `<rect x="38" y="8" width="44" height="76" rx="7" ${SK} stroke-width="2.6" opacity=".8"/><path d="M66 10 L60 30 L70 42 L54 58 L60 82" ${SK} stroke-width="1" opacity=".55"/><text x="60" y="34" text-anchor="middle" font-size="12" font-family="Microsoft YaHei" fill="#15181b" opacity=".75">2:17</text><circle cx="60" cy="48" r="5" fill="${BL}" opacity=".35"/><rect x="44" y="56" width="32" height="5" rx="2.5" ${WS}/><rect x="44" y="64" width="24" height="5" rx="2.5" ${WS}/>`,
  "1:2": `<rect x="10" y="14" width="100" height="58" rx="10" ${SK} stroke-width="2.4" opacity=".75"/><path d="M60 14 V72" ${SK} stroke-width="1.6" opacity=".5"/><ellipse cx="38" cy="42" rx="11" ry="14" ${WS}/><path d="M28 64 Q38 52 48 64" ${SK} stroke-width="1.6" opacity=".4"/><path d="M68 30 H104 M72 40 H100 M66 52 H96" ${SK} stroke-width="1" opacity=".3"/><path d="M4 82 H116" ${SK} stroke-width="2" opacity=".5"/>`,
  "1:3": `<rect x="22" y="14" width="76" height="64" rx="4" ${SK} stroke-width="2.2" opacity=".75"/><path d="M22 28 H98" ${SK} stroke-width="2" opacity=".6"/><path d="M41 28 V78 M60 28 V78 M79 28 V78 M22 45 H98 M22 62 H98" ${SK} stroke-width=".9" opacity=".3"/><circle cx="88" cy="54" r="9" fill="none" stroke="#b8291a" stroke-width="2" opacity=".8"/><path d="M38 8 V20 M82 8 V20" ${SK} stroke-width="2.4" opacity=".7"/>`,
  "1:4": `<path d="M24 50 Q60 92 96 50 Z" ${WS}/><path d="M22 50 H98 M26 52 Q60 92 94 52" ${SK} stroke-width="2.6" opacity=".8"/><path d="M46 42 Q40 32 48 24 Q54 16 48 8 M62 40 Q56 30 64 22 Q70 14 64 6 M78 42 Q72 32 80 24" ${SK} stroke-width="1.4" opacity=".4"/><path d="M40 84 H80" ${SK} stroke-width="2" opacity=".5"/>`,
  "1:5": `<rect x="30" y="12" width="60" height="40" rx="3" ${SK} stroke-width="2.4" opacity=".75"/><path d="M60 52 V62 M46 64 H74" ${SK} stroke-width="2" opacity=".6"/><path d="M8 76 H112" ${SK} stroke-width="2.2" opacity=".6"/><path d="M98 74 V60 M98 60 Q88 50 92 40 M98 60 Q108 50 104 40 M98 64 Q86 62 84 54" ${SK} stroke-width="1.6" stroke="#3f9a6e" opacity=".85"/><path d="M14 74 V62 H28 V74" ${SK} stroke-width="1.8" opacity=".6"/><rect x="64" y="22" width="18" height="16" fill="#e6c94a" opacity=".55" transform="rotate(-6 73 30)"/>`,
  "1:6": `<path d="M14 45 H24 M30 45 V34 M36 45 V24 M42 45 V38 M48 45 V18 M54 45 V30 M60 45 V12 M66 45 V28 M72 45 V36 M78 45 V22 M84 45 V40 M90 45 V32 M96 45 H106" ${SK} stroke-width="3" opacity=".7"/><path d="M30 45 V56 M36 45 V66 M42 45 V52 M48 45 V72 M54 45 V60 M60 45 V78 M66 45 V62 M72 45 V54 M78 45 V68 M84 45 V50 M90 45 V58" ${SK} stroke-width="3" opacity=".35"/><text x="60" y="88" text-anchor="middle" font-size="9" font-family="Microsoft YaHei" fill="#15181b" opacity=".55">0:07</text>`,
  "1:7": `<path d="M8 80 Q30 70 34 52 T60 34 T96 14" ${SK} stroke-width="2.4" opacity=".55" stroke-dasharray="1 6"/><path d="M8 60 Q40 64 60 50 T112 40" ${SK} stroke-width="1" opacity=".25"/><path d="M8 30 Q50 40 70 20" ${SK} stroke-width="1" opacity=".25"/><circle cx="60" cy="34" r="9" fill="${BL}" opacity=".2"/><circle cx="60" cy="34" r="4" fill="${BL}" opacity=".9"/><path d="M96 14 m-6 0 a6 6 0 1 1 12 0 q0 6 -6 12 q-6 -6 -6 -12" fill="#b8291a" opacity=".7"/>`,
  "1:8": `<path d="M6 22 H92 L88 30 L94 38 L88 48 L94 58 L90 68 H6 Z" ${WS}/><path d="M6 20 V70" ${SK} stroke-width="3" opacity=".7"/><path d="M12 62 L26 40 L34 52 L46 30 L58 54 L66 44 L80 62" ${SK} stroke-width="1.8" opacity=".6"/><path d="M92 22 L88 30 L94 38 L88 48 L94 58 L90 68" ${SK} stroke-width="1" opacity=".5"/><text x="104" y="48" text-anchor="middle" font-size="16" font-family="KaiTi" fill="#15181b" opacity=".35">北</text>`,
  "1:9": `<text x="60" y="68" text-anchor="middle" font-size="64" font-family="ZhiMangXing, MaShanZheng, KaiTi" fill="#15181b" opacity=".82">归</text><path d="M20 80 Q60 74 100 82" ${SK} stroke-width="1.2" opacity=".3"/>`,
  "2:1": `<path d="M18 18 H86 Q94 18 94 26 V50 Q94 58 86 58 H40 L28 70 V58 H26 Q18 58 18 50 Z" ${WS}/><text x="56" y="43" text-anchor="middle" font-size="13" font-family="KaiTi" fill="#15181b" opacity=".8">妈，我很好。</text><circle cx="100" cy="74" r="9" fill="${BL}" opacity=".2"/><circle cx="100" cy="74" r="4" fill="${BL}" opacity=".9"/><path d="M8 84 Q40 76 70 82" ${SK} stroke-width="1" opacity=".3"/>`,
};
const doodle = (k) => `<svg class="mj-doodle" viewBox="0 0 120 90" aria-hidden="true">${DOODLE[k] || ""}</svg>`;
const WALL = `<svg viewBox="0 0 300 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="mv2sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dfdc"/><stop offset=".55" stop-color="#ece6d6"/><stop offset="1" stop-color="#e4dcc8"/></linearGradient></defs>
<rect width="300" height="520" fill="url(#mv2sky)"/>
<g fill="rgba(21,24,27,.09)"><rect x="8" y="250" width="34" height="190"/><rect x="48" y="210" width="28" height="230"/><rect x="82" y="270" width="40" height="170"/><rect x="190" y="230" width="30" height="210"/><rect x="226" y="190" width="36" height="250"/><rect x="266" y="260" width="30" height="180"/></g>
<g fill="rgba(21,24,27,.17)"><rect x="20" y="300" width="26" height="140"/><rect x="236" y="280" width="24" height="160"/></g>
<path d="M98 360 Q150 336 202 360 L196 364 Q150 346 104 364 Z" fill="rgba(21,24,27,.55)"/><rect x="112" y="364" width="76" height="80" fill="rgba(21,24,27,.18)"/><path d="M122 370 V440 M138 370 V440 M162 370 V440 M178 370 V440" stroke="rgba(21,24,27,.3)" stroke-width="3"/>
<rect x="0" y="440" width="300" height="80" fill="rgba(21,24,27,.08)"/><path d="M0 446 Q150 438 300 448" stroke="rgba(21,24,27,.25)" stroke-width="1.2" fill="none"/>
<g stroke="rgba(47,127,168,.22)" stroke-width="1"><path d="M30 40 l-6 18 M70 90 l-6 18 M120 30 l-6 18 M170 120 l-6 18 M220 60 l-6 18 M260 140 l-6 18 M40 170 l-6 18 M110 200 l-6 18 M200 180 l-6 18 M280 30 l-6 18 M150 70 l-6 18 M90 150 l-6 18 M240 230 l-6 18 M20 230 l-6 18"/></g>
<circle cx="150" cy="392" r="2.2" fill="#e8c76a" opacity=".8"/></svg>`;
const CRACK = `<svg class="mj-crack" viewBox="0 0 220 430" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(21,24,27,.22)" stroke-width="1"><path d="M150 0 L138 70 L160 118 L120 170 L132 230 L96 300"/><path d="M138 70 L90 96 L60 92"/><path d="M160 118 L214 140"/><path d="M120 170 L70 186 L30 230"/><path d="M132 230 L190 262 L220 250"/><path d="M96 300 L110 360 L84 430"/></g><g fill="none" stroke="rgba(255,255,255,.7)" stroke-width=".8" transform="translate(1,1)"><path d="M150 0 L138 70 L160 118 L120 170 L132 230 L96 300"/><path d="M138 70 L90 96 L60 92"/></g></svg>`;
const MING = [..."见日之光天下大明长毋相忘"].map((c, i, a) => `<span style="transform:rotate(${-150 + (300 / (a.length - 1)) * i}deg)">${c}</span>`).join("");

const APPS = [
  { id: "realm", g: "境", n: "境界录", c: "var(--nijin)" },
  { id: "album", g: "忆", n: "相册", c: "var(--shiqing)" },
  { id: "trail", g: "迹", n: "行迹", c: "var(--zhe)" },
  { id: "map", g: "舆", n: "舆图", c: "var(--dai)" },
  { id: "boss", g: "战", n: "战报", c: "var(--zhu)" },
];
const DOCK = [{ id: "msg", g: "讯", n: "消息", mtab: "msg" }, { id: "msg", g: "拨", n: "拨号", mtab: "dial" }];
const TITLE = { realm: "境界录", album: "相册", trail: "行迹", map: "舆图", boss: "战报" };

// 上次合上时停在哪个应用（本次会话内记住）
const last = { app: "home", tab: "list", mtab: "msg" };

export class MirrorV2 {
  constructor(ui, o = {}) {
    this.ui = ui;
    this.p = ui.p;
    const un = F.mirrorUnread ? F.mirrorUnread(this.p) : { realm: null, msg: !1 };
    // 默认停在哪：筑基后没读的消息 → 消息；有没看过的新突破 → 境界录并选中那一条；否则上次的应用
    const S = (this.S = { app: last.app, tab: last.tab, mtab: last.mtab, open: null, mem: null });
    if (o.app) S.app = o.app;
    else if (un.msg) Object.assign(S, { app: "msg", mtab: "msg" });
    else if (un.realm) Object.assign(S, { app: "realm", tab: "list", open: un.realm });
    if (o.open) S.open = o.open;
    this.done = new Promise((res) => (this._res = res));
    this.alive = !0;
    this._build(o.from);
  }
  get zhuji() {
    return this.p.realm.stage >= 2;
  }
  // ---------------- 构建 / 销毁 ----------------
  _build(from) {
    const k = Math.min(innerWidth / 1280, innerHeight / 720);
    const root = (this.root = document.createElement("div"));
    root.className = "mv2 in" + (this.zhuji ? " gold" : "");
    root.style.setProperty("--k", k.toFixed(4));
    // 进场起点：3D 镜台在屏幕上的位置 → 换算到 1280×720 设计稿坐标（镜心在 560,360，直径 700）
    if (from) {
      const bx = (from.x - innerWidth / 2) / k + 640, by = (from.y - innerHeight / 2) / k + 360;
      root.style.setProperty("--dx", (bx - 560).toFixed(1) + "px");
      root.style.setProperty("--dy", (by - 360).toFixed(1) + "px");
      root.style.setProperty("--s0", Math.max(0.03, Math.min(0.5, (2 * (from.r || 12)) / k / 700)).toFixed(3));
    }
    root.innerHTML = `<div class="mv2-veil" data-act="veil"></div><div class="mv2-box">
      <div class="abs ttl mv2-side"><div class="big">天机镜</div><div class="tiba">掌中一面镜　照见来处<br><span class="ink-seal two" style="--s:30px">林墨</span></div></div>
      <div class="abs keys mv2-side"><button class="ink-btn" data-act="close">合上</button><div><b>Esc</b>回主屏</div><div><b>M</b>合上</div></div>
      <div class="abs mv2-mirror"><i class="cord"></i><div class="rim"></div><div class="face"></div><div class="ming">${MING}</div><i class="scrglow"></i><i class="knob"></i>
        <div class="mv2-screen" data-scr></div></div>
      <div class="mv2-side" data-side></div></div>`;
    this.scr = root.querySelector("[data-scr]");
    this.side = root.querySelector("[data-side]");
    root.addEventListener("click", (e) => this._click(e));
    for (const ev of ["mousedown", "wheel", "pointerdown"]) root.addEventListener(ev, (e) => e.stopPropagation());
    this._key = (e) => {
      if (e.repeat) return;
      if (e.code === "KeyM") (e.preventDefault(), this.close());
      else if (e.code === "Escape") {
        e.preventDefault();
        if (this.S.app === "album" && this.S.mem) this.set({ mem: null });
        else if (this.S.app !== "home") this.set({ app: "home", open: null, mem: null });
        else this.close();
      }
    };
    addEventListener("keydown", this._key);
    (this.ui.root || document.body).appendChild(root);
    this.render();
    // 时辰：只在变化时写
    this._clock = setInterval(() => {
      const t = this.root && this.root.querySelector(".mj-sb .tm");
      const sc = shichen(new Date()), s = `${sc.zhi}<small>${sc.sub}</small>`;
      if (t && t.innerHTML !== s) t.innerHTML = s;
    }, 15000);
    this._inT = setTimeout(() => this.root && (this.root.classList.remove("in"), this.root.classList.add("shown")), 460);
  }
  close() {
    if (!this.alive) return;
    this.alive = !1;
    last.app = this.S.app === "album" && this.S.mem ? "album" : this.S.app;
    last.tab = this.S.tab;
    last.mtab = this.S.mtab;
    removeEventListener("keydown", this._key);
    clearInterval(this._clock);
    clearTimeout(this._inT);
    const r = this.root;
    r.classList.remove("in", "shown");
    r.classList.add("out");
    r.style.pointerEvents = "none";
    setTimeout(() => (r.remove(), this._res()), 300);
    this.onClosing && this.onClosing();
  }
  set(patch) {
    Object.assign(this.S, patch);
    this.render();
  }
  _click(e) {
    const t = e.target.closest("[data-act],[data-app],[data-open],[data-tab],[data-mem],[data-mtab],[data-boss]");
    if (!t) return;
    e.stopPropagation();
    const d = t.dataset, S = this.S;
    if (d.act === "close") return this.close();
    if (d.act === "veil") return; // 点镜外不合上，免得误触
    if (d.act === "home") return this.set({ app: "home", open: null, mem: null });
    if (d.act === "mark") return this._markClue(t);
    if (d.mem) return this.set({ app: "album", mem: d.mem });
    if (d.open) return this.set({ open: d.open });
    if (d.tab) return this.set({ tab: d.tab });
    if (d.boss) return this.set({ boss: d.boss });
    if (d.app) return this.set({ app: d.app, mtab: d.mtab || S.mtab, open: d.app === "realm" ? d.goto || null : null, mem: null });
    if (d.mtab) return this.set({ mtab: d.mtab });
  }
  _markClue(btn) {
    const f = (this.p.flags.mirrorClue = this.p.flags.mirrorClue || { region: "region3", at: Date.now() });
    void f;
    btn.outerHTML = `<span class="done">已记下：黑风岭，在北方留白之外。</span>`;
    this.ui.cave && this.ui.cave.save && this.ui.cave.save();
  }

  // ---------------- 数据 ----------------
  _hist() {
    const H = (this.p.stats && this.p.stats.breakHistory) || [];
    return H.map((e, i) => {
      const from = rkOf(e.from), to = rkOf(e.to);
      const g = growth(to);
      const stats = [];
      for (const s of STATS) {
        const d = e.stats && e.stats[s.k];
        if (typeof d !== "number" || Math.abs(d) < 1e-6) continue;
        const b = typeof g[s.k] === "number" ? g[s.k] : null;
        stats.push({ ...s, d, b, a: b == null ? null : b - d });
      }
      const at = e.at ? new Date(e.at) : null;
      return {
        i, from, to, fromName: nameOf(from), toName: nameOf(to), toShort: shortOf(from, to),
        legacy: !!e.legacy, run: e.run, day: e.day, hour: at ? shichen(at).zhi : null,
        xp: e.xp ?? PROGRESSION.xp[from], trial: e.trial || (PROGRESSION.trial && PROGRESSION.trial[from] ? { id: PROGRESSION.trial[from] } : null),
        stats, unlocks: (e.unlocks || []).map(unlockView).filter(Boolean), grants: e.grants || [],
        memKey: e.memory || null, mem: e.memory ? MEMORIES[e.memory] : null, xjz: XJZ_BREAK[to],
      };
    }).reverse(); // 最新在上
  }
  _lit() {
    // 亮起的记忆：profile.flags.memories ∪ 突破史里记着的 ∪ 不高于当前境界的（每升一层亮一段；旧存档、序章引气入体也算亮过）
    const s = new Set((this.p.flags && this.p.flags.memories) || []);
    for (const e of (this.p.stats && this.p.stats.breakHistory) || []) if (e.memory) s.add(e.memory);
    const cur = PROGRESSION.order.indexOf(rkOf(this.p.realm));
    return MEM_KEYS.filter((k) => s.has(k) || (cur >= 0 && PROGRESSION.order.indexOf(k) >= 0 && PROGRESSION.order.indexOf(k) <= cur));
  }
  _whenText(e, long) {
    if (e.legacy) return "旧事";
    const parts = [e.run === 0 ? "序章" : e.run != null ? `第 ${e.run} 次出行归来` : NA];
    if (long || e.day != null) parts.push(`入画第 ${e.day ?? NA} 日`);
    parts.push(e.hour || NA);
    return parts.join(" · ");
  }
  _unreadMark() {
    // 打开境界录 / 消息时记为已读（朱点、今日可办、3D 镜台的快闪都随之消失）
    const S = this.S, p = this.p;
    if (!F.markMirrorSeen) return;
    if (S.app === "realm") F.markMirrorSeen(p, "realm");
    if (S.app === "msg" && S.mtab === "msg" && this.zhuji) F.markMirrorSeen(p, "msg");
  }

  // ---------------- 渲染 ----------------
  render() {
    if (!this.root) return;
    const S = this.S;
    this._unreadMark();
    let body;
    if (S.app === "home") body = `<div class="body">${this._home()}</div>`;
    else {
      const title = S.app === "msg" ? (S.mtab === "dial" ? "拨号" : "消息") : TITLE[S.app];
      const tabs = S.app === "realm" ? this._tabs([["list", "历次"], ["total", "总览"]], S.tab, "tab") : S.app === "msg" ? this._tabs([["msg", "消息"], ["dial", "拨号"]], S.mtab, "mtab") : "";
      let c = "";
      if (S.app === "realm") c = S.tab === "total" ? this._totals("stats") : this._realmList();
      else if (S.app === "album") c = this._album();
      else if (S.app === "trail") c = this._trail();
      else if (S.app === "msg") c = this._msg();
      else if (S.app === "map") c = this._map();
      else if (S.app === "boss") c = bossReport(this.p, S);
      body = `<div class="mj-ahead"><button class="mj-back" data-act="home" title="返回（Esc）">‹</button><span class="t">${title}</span>${tabs}</div><div class="body ${S.app === "msg" ? "" : "mj-scroll"}">${c}</div>`;
    }
    this.scr.dataset.app = S.app;
    this.scr.innerHTML = `<div class="view">${this._statusBar()}${body}</div>${CRACK}<i class="homebar" data-act="home" title="主屏"></i>`;
    this.side.innerHTML = this._side();
  }
  _tabs(list, cur, attr) {
    return `<span class="mj-tabs">${list.map(([v, n]) => `<button class="${cur === v ? "on" : ""}" data-${attr}="${v}">${n}</button>`).join("<i>·</i>")}</span>`;
  }
  _statusBar() {
    const p = this.p, sc = shichen(new Date());
    const need = xpNeed(p);
    const pct = isFinite(need) && need > 0 ? Math.max(0, Math.min(100, Math.round((p.xp / need) * 100))) : null;
    const sig = this.zhuji ? `<span class="sig" title="墨州 · 一格"><i class="on"></i><i></i><i></i><i></i></span><span class="carrier">墨州</span>` : `<span class="nosvc">无服务</span>`;
    return `<div class="mj-sb"><span class="tm">${sc.zhi}<small>${sc.sub}</small></span>
      <span class="r">${sig}<span class="bat" title="修为 ${p.xp}${isFinite(need) ? " / " + need : ""}"><b style="width:${pct ?? 0}%"></b></span><span class="pct">${pct == null ? NA : pct + "%"}</span></span></div>`;
  }
  _appIcon(a) {
    const off = a.mtab && !this.zhuji;
    const un = F.mirrorUnread ? F.mirrorUnread(this.p) : {};
    const badge = (a.id === "realm" && un.realm) || (a.id === "msg" && a.mtab === "msg" && un.msg) ? '<s class="dot"></s>' : "";
    return `<button class="mj-app ${off ? "off" : ""}" data-app="${a.id}" ${a.mtab ? `data-mtab="${a.mtab}"` : ""} style="--ac:${a.c || "var(--zhu)"}"><span class="ic"><b>${a.g}</b>${badge}</span><span class="nm">${off ? "无服务" : a.n}</span></button>`;
  }
  _home() {
    const p = this.p, sc = shichen(new Date());
    const un = F.mirrorUnread ? F.mirrorUnread(p) : {};
    const day = p.stats && p.stats.day != null ? `入画第 ${p.stats.day} 日` : `出行 ${(p.stats && p.stats.runs) || 0} 次`;
    const note = un.msg
      ? `<button class="mj-note clue" data-app="msg" data-mtab="msg">${sealHtml("讯", "blue", 20)}<span>消息 · 发送中……　<b>黑风岭</b>有一个蓝点</span></button>`
      : un.realm
        ? `<button class="mj-note" data-app="realm" data-goto="${un.realm}">${sealHtml("录", "gold", 20)}<span>境界录 · 新记一条：<b>${nameOf(un.realm)}</b></span></button>`
        : "";
    return `<div class="mj-home"><div class="mj-wall">${WALL}</div>
      <div class="mj-clock"><b>${sc.zhi}</b><span>${sc.sub} · ${day}</span></div>${note}
      <div class="mj-grid">${APPS.map((a) => this._appIcon(a)).join("")}</div>
      <div class="mj-dock">${DOCK.map((a) => this._appIcon(a)).join("")}</div></div>`;
  }

  // 境界录 · 历次
  _pending() {
    const p = this.p, cur = rkOf(p.realm), nx = PROGRESSION.next && PROGRESSION.next[cur];
    const need = xpNeed(p);
    if (!nx) return `<div class="mj-pend"><span class="t">下一境 · ${NA}</span><span class="m">修为 ${p.xp}${isFinite(need) ? " / " + need : ""} · 此后的路，镜里还照不出来</span></div>`;
    const nk = nx.stage + ":" + nx.layer;
    const a = { realm: { ...p.realm }, unlocks: {} }, b = { realm: { ...nx }, unlocks: {} };
    applyUnlocks(a);
    applyUnlocks(b);
    const ul = Object.keys(b.unlocks).filter((k) => JSON.stringify(a.unlocks[k]) !== JSON.stringify(b.unlocks[k])).map((k) => unlockView({ key: k, value: b.unlocks[k] })).filter(Boolean);
    const gr = ((PROGRESSION.grants && PROGRESSION.grants[nk]) || []).length;
    const will = [...ul.map((x) => x.t + (x.v ? " " + x.v : "")), ...F.facUnlocksAt(nk).map((f) => f.text), gr ? "功法" : "", MEMORIES[nk] ? "记忆一段" : ""].filter(Boolean).join("、") || "属性";
    return `<div class="mj-pend"><span class="t">下一层 · ${nameOf(nk)}</span><span class="m">修为 ${p.xp} / ${need} · 将得：${will}</span></div>`;
  }
  _realmList() {
    const H = this._hist();
    if (!H.length) return `<div class="mj-tl">${this._pending()}<div class="mj-tl-end">还没有破过境。</div></div>`;
    const sel = this.S.open && H.some((e) => e.to === this.S.open) ? this.S.open : H[0].to;
    this.S.open = sel;
    return `<div class="mj-tl">${this._pending()}${H.map((e) => {
      const chips = e.stats.filter((r) => CHIP_KEYS.includes(r.k)).slice(0, 4).map((r) => `<span class="ch">${r.n}<b>${fmtD(r, r.d)}</b></span>`).join("");
      const gains = e.unlocks.length || e.grants.length ? `<div class="r3">${gainsHtml(e.unlocks, e.grants)}</div>` : "";
      return `<div class="mj-e ${e.to === sel ? "sel" : ""} ${e.to === "2:1" ? "gold" : ""} ${e.legacy ? "old" : ""}" data-open="${e.to}"><i class="nd"></i><div class="mj-eh">
        <div class="r1"><span class="to">${e.toShort}</span><span class="fr">${e.fromName} →</span><span class="when">${this._whenText(e)}</span></div>
        <div class="r2">${chips}</div>${gains}</div></div>`;
    }).join("")}<div class="mj-tl-end">那一夜，博物馆，雨。</div></div>`;
  }
  _entryBody(e) {
    const rows = e.stats.map((r) => `<div class="mj-sr"><span class="k">${r.n}</span><span class="a">${r.a == null ? NA : fmt(r, r.a)}</span><span class="ar">→</span><span class="b">${r.b == null ? NA : fmt(r, r.b)}${r.u ? `<small>${r.u}</small>` : ""}</span><span class="d ${r.lower ? (r.d < 0 ? "up" : "dn") : r.d > 0 ? "up" : "dn"}">${fmtD(r, r.d)}</span></div>`).join("");
    const cost = [`修为 ${e.xp ?? NA}`, e.trial && `心魔劫 · 第 ${e.trial.tries ?? NA} 次方破`].filter(Boolean).join(" · ");
    const gains = e.unlocks.length || e.grants.length ? `<div class="gains">${gainsHtml(e.unlocks, e.grants)}</div>` : `<div class="none">这一层只长了修为。</div>`;
    return `<div class="mj-eb"><div class="mj-blk"><div class="h">属性</div>${rows || `<div class="none">${NA}</div>`}<div class="cost">耗 ${cost}</div></div>
      <div class="mj-blk"><div class="h">所得</div>${gains}</div>
      ${e.mem ? `<div class="mj-blk"><div class="h">那一夜亮起的</div><button class="mj-memc ${e.mem.clue ? "clue" : ""}" data-mem="${e.memKey}">${doodle(e.memKey)}<span><b>${e.mem.title}</b><em>${e.mem.lines[0]}</em></span></button></div>` : ""}
      ${e.xjz ? `<div class="mj-xjz"><span class="who">玄机子</span>“${e.xjz}”</div>` : ""}</div>`;
  }
  // 境界录 · 总览（练气一层 → 当前；只算境界本身，不含装备与心法）
  _totals(part) {
    const p = this.p, cur = rkOf(p.realm);
    const a = growth("1:1"), b = growth(cur);
    const H = this._hist();
    if (part === "stats") {
      if (cur === "1:1" || p.realm.stage < 1) return `<div class="mj-total"><div class="mj-hero"><span class="to">${nameOf(cur)}</span><span class="m">还没有破过境，总览从练气一层算起。</span></div></div>`;
      const rows = STATS.filter((s) => typeof a[s.k] === "number" && typeof b[s.k] === "number" && Math.abs(b[s.k] - a[s.k]) > 1e-6).map((s) => {
        const x = a[s.k], y = b[s.k], d = y - x;
        const share = s.lower ? y / x : Math.max(0.04, Math.min(1, x / y));
        const mul = !s.lower && x > 0 ? y / x : 0;
        return `<div class="mj-tr"><span class="k">${s.n}</span><span class="a">${fmt(s, x)}</span><span class="ar">→</span><span class="b">${fmt(s, y)}${s.u ? `<small>${s.u}</small>` : ""}</span><span class="mtr" title="墨 = 练气一层时，泥金 = 此后所得"><i style="--s:${(share * 100).toFixed(1)}%"></i></span><span class="d up">${fmtD(s, d)}</span><span class="x">${mul >= 1.1 ? "×" + mul.toFixed(1) : ""}</span></div>`;
      }).join("");
      const n = H.filter((e) => e.from !== "0:0").length;
      return `<div class="mj-total"><div class="mj-hero"><span class="fr">练气一层</span><span class="ar">→</span><span class="to">${nameOf(cur)}</span><span class="m">突破 ${n} 次 · 出行 ${(p.stats && p.stats.runs) ?? NA} 次</span></div>
        <div class="mj-blk"><div class="h">属性 · 自练气一层起</div>${rows}</div></div>`;
    }
    // 所得（右侧浮签）：当前的栏位与身法、所学、记忆
    const U = p.unlocks || {};
    const order = ["spellSlots", "pillSlots", "xinfaSlots", "robeSlot", "jadeSlot", "artifactSlot", "formationSlot", "bagMax", "pouchMax", "doubleJump", "swordFly", "sword_fly", "region2", "region3"];
    const seen = new Set();
    const ul = order.filter((k) => k in U).map((k) => unlockView({ key: k, value: U[k] })).filter((x) => x && !seen.has(x.t) && seen.add(x.t));
    // 所学：profile.flags.learned ∪ 突破史里的领悟 / 习得
    const L = (p.flags && p.flags.learned) || {}, got = new Map();
    for (const kind of ["spells", "xinfa"]) for (const id of L[kind] || []) got.set(kind + ":" + id, { kind, id });
    for (const e of (p.stats && p.stats.breakHistory) || []) for (const g of e.grants || []) if (g.kind === "spells" || g.kind === "xinfa") got.set(g.kind + ":" + g.id, g);
    const learned = [...got.values()];
    const lit = this._lit();
    return `<div class="mj-total"><div class="mj-blk"><div class="h">栏位与身法</div><div class="gains">${gainsHtml(ul, []) || `<span class="none">${NA}</span>`}</div></div>
      <div class="mj-blk"><div class="h">所学</div><div class="gains">${gainsHtml([], learned) || `<span class="none">${NA}</span>`}</div></div>
      <div class="mj-blk"><div class="h">记忆</div><div class="mj-memdots">${MEM_KEYS.map((k) => `<button class="${lit.includes(k) ? "lit" : ""}" ${lit.includes(k) ? `data-mem="${k}"` : ""} title="${lit.includes(k) ? MEMORIES[k].title : nameOf(k) + "亮起"}"></button>`).join("")}<span>${lit.length} / ${MEM_KEYS.length} 段</span></div></div></div>`;
  }

  // 相册
  _album() {
    const lit = this._lit();
    return `<div class="mj-album"><div class="mj-alb-h">现代 · ${lit.length} / ${MEM_KEYS.length}</div><div class="grid">${MEM_KEYS.map((k) => {
      const on = lit.includes(k);
      return `<button class="ph ${on ? "lit" : "dark"} ${this.S.mem === k ? "on" : ""} ${MEMORIES[k].clue ? "clue" : ""}" ${on ? `data-mem="${k}"` : ""}>${doodle(k)}<span class="cap">${on ? MEMORIES[k].title : nameOf(k) + "亮起"}</span></button>`;
    }).join("")}</div></div>`;
  }
  _memView(k) {
    const m = MEMORIES[k];
    if (!m) return "";
    const e = this._hist().find((x) => x.memKey === k);
    const when = e ? `${nameOf(k)} · ${this._whenText(e)}` : nameOf(k);
    return `<div class="mj-mem ${m.clue ? "clue" : ""}"><div class="pic">${doodle(k)}</div><div class="t">${m.title}</div>${m.lines.map((l) => `<p>${l}</p>`).join("")}<div class="m">亮于 ${when}</div></div>`;
  }

  // 行迹（新增字段由洞府组 / 流程组写入；没有就显示"—"）
  _trail() {
    const T = (this.p.stats || {});
    const v = (x) => (x == null ? NA : x);
    const bh = T.bestHaul, bi = T.bestItem;
    const R = bi ? RARITY[bi.rarity || 0] : null;
    const biName = bi ? bi.name || (ITEMS[bi.id] && ITEMS[bi.id].name) || bi.id : null;
    const bosses = T.bosses && Object.keys(T.bosses).length ? Object.entries(T.bosses).map(([k, n]) => `${BOSS_NAME[k] || k} ×${n}`).join("　") : NA;
    const fd = T.firstDeath;
    return `<div class="mj-trail"><div class="big"><span><b>${v(T.runs)}</b>出行</span><span><b>${v(T.extracted)}</b>撤离</span><span><b class="zhu">${v(T.deaths)}</b>身陨</span><span><b>${v(T.kills)}</b>斩妖</span></div>
      <div class="rows">
        <div class="mj-row"><span class="k">带回最多的一次</span><span class="v">${bh ? `<b class="gold">${(bh.value || 0).toLocaleString("en-US")}</b> 估价${bh.items != null ? " · " + bh.items + " 件" : ""}<small>第 ${v(bh.run)} 次 · ${v(bh.region)}</small>` : NA}</span></div>
        <div class="mj-row"><span class="k">最好的一件</span><span class="v">${bi ? `<b style="color:${R.color}">${biName}</b> <span class="ink-seal" style="--s:18px;--seal-color:${R.color}">${R.name[0]}</span><small>第 ${v(bi.run)} 次 · ${v(bi.region)}</small>` : NA}</span></div>
        <div class="mj-row"><span class="k">斩首领</span><span class="v">${bosses}</span></div>
        <div class="mj-row"><span class="k">采药 · 开箱</span><span class="v">${v(T.herbs)} 株 · ${v(T.chests)} 只</span></div>
        <div class="mj-row"><span class="k">遗落的储物袋</span><span class="v">取回 ${v(T.lostBagBack)} 次</span></div>
        <div class="mj-row"><span class="k">头一回身陨</span><span class="v">${fd ? `第 ${v(fd.run)} 次 · ${v(fd.by)}<small>${v(fd.region)}</small>` : NA}</span></div>
      </div></div>`;
  }

  // 消息 / 拨号：筑基前无服务；筑基后"妈，我很好。"永远发送中，下面是回家的线索
  _msg() {
    const z = this.zhuji;
    if (this.S.mtab === "dial")
      return `<div class="mj-msg dial"><div class="calls"><div class="mj-row"><span class="k">妈</span><span class="v miss">未接 ×3<small>那晚 · 凌晨</small></span></div><div class="mj-row"><span class="k">爸</span><span class="v">已拨<small>上周日</small></span></div><div class="mj-row"><span class="k">组长</span><span class="v miss">未接<small>那晚</small></span></div></div>
        <div class="dialbtn ${z ? "" : "off"}">${z ? "拨不通" : "无服务"}</div><div class="hint">${z ? "筑基之后，镜里能发出去的只有文字。" : "镜中无讯。"}</div></div>`;
    const old = `<div class="day">那晚 · 凌晨两点十七分</div><div class="bb in">墨啊，周末回家吃饭不？</div><div class="bb in">早点睡，别老熬。</div>`;
    if (!z) return `<div class="mj-msg"><div class="who">妈</div><div class="th">${old}</div><div class="inp off"><span>无服务</span></div></div>`;
    const e = this._hist().find((x) => x.to === "2:1");
    const marked = this.p.flags && this.p.flags.mirrorClue;
    return `<div class="mj-msg"><div class="who">妈</div><div class="th">${old}<div class="day">${e ? this._whenText(e) : NA}</div>
      <div class="bb out">妈，我很好。<span class="st">发送中<i>.</i><i>.</i><i>.</i></span></div>
      <div class="clue"><div class="map"><span class="n">黑风岭</span><i class="me"></i><i class="him"></i></div><div class="tx">裂纹连成一幅地图：留白之外，北方黑风岭，一个和他一样的蓝点。</div>
        ${marked ? `<span class="done">已记下：黑风岭，在北方留白之外。</span>` : `<button class="ink-btn" data-act="mark">在舆图上标出</button>`}</div>
      <div class="unk"><span class="nm">未知 · 黑风岭</span><span class="typing"><i></i><i></i><i></i></span></div></div>
      <div class="inp"><span>（再写一句……）</span></div></div>`;
  }
  _map() {
    const p = this.p, U = p.unlocks || {}, z = this.zhuji, M = p.map || {};
    const seen = (r) => (M[r] ? "到过" : "未至");
    return `<div class="mj-map"><div class="lst">
      <div class="mj-row"><span class="k">青岚山外</span><span class="v">${seen("r1")}</span></div>
      <div class="mj-row ${U.region2 ? "" : "dim"}"><span class="k">竹海 · 溪谷</span><span class="v">${U.region2 ? seen("r2") : "练气五层可往"}</span></div>
      <div class="mj-row ${z ? "clue" : "dim"}"><span class="k">${z ? "黑风岭" : "北方 · 留白"}</span><span class="v">${z ? "一个蓝点 · 下一章" : "未至"}</span></div></div>
      <div class="hint">出行时按 M，镜面直接展开为舆图手卷。</div></div>`;
  }

  // 右侧浮签
  _side() {
    const S = this.S;
    const sheet = '<i class="ink-sheet" aria-hidden="true"></i>';
    if (S.app === "realm" && S.tab === "list") {
      const H = this._hist();
      const e = H.find((x) => x.to === S.open) || H[0];
      if (!e) return "";
      return `<section class="abs slip ink-paper" data-slip="entry" data-key="${e.to}">${sheet}<div class="sh"><span class="t">${e.toName}</span>${e.to === "2:1" ? '<span class="ink-seal gold two" style="--s:34px">筑基</span>' : ""}</div>
        <div class="when">${e.fromName} → ${e.toName} · ${this._whenText(e, !0)}</div>${this._entryBody(e)}</section>`;
    }
    if (S.app === "realm" && S.tab === "total") return `<section class="abs slip ink-paper" data-slip="gains">${sheet}<div class="sh"><span class="t">所得</span><span class="s">至今</span></div>${this._totals("gains")}</section>`;
    if (S.app === "album") {
      const k = S.mem || this._lit().slice(-1)[0];
      return k ? `<section class="abs slip ink-paper" data-slip="mem" data-key="${k}">${sheet}${this._memView(k)}</section>` : `<div class="abs empty-hint"><b>镜中尚暗</b>修为再进一层，它便会亮起来。</div>`;
    }
    if (S.app === "boss") return bossSide(this.p, S);
    if (S.app === "home") return `<div class="abs empty-hint"><b>镜中有屏</b>点一个应用。<br>境界录记着每一次破境；相册里是那边的日子。</div>`;
    return "";
  }
}
const BOSS_NAME = { qingya: "青牙", bilin: "碧鳞" };
