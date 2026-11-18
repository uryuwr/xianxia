// 出行局界面（模块 A）：版式依据 docs/ui/v2/hud 与风格指南 §5.16。
//   上中：天时四字刻度 + 一笔细条 + 朱砂水滴指针，灵潮倍率、妖潮倒计时
//   右上：灵值（泥金大数）+ 储物袋占格 / 未鉴定；铜镜天机镜（以林墨为中心），下方最近撤离点方位
//   主角脚下：撤离读条圆相（朱）+ 竖排"撤离中"与倒计时
//   左下：拾取流（越旧越淡）；右下：境界 + 修为细条 + 本局感悟；右侧：委托进度
//   M：展开手卷式天机镜（整张地图）
// 性能：数值不变不写 DOM；进度只改 CSS 变量；不用 SVG 滤镜。
import * as THREE from "three";
import { kit } from "../kit.js";
import { PHASES } from "../../game/run/regions.js";
import { LOOT, buffText } from "../../game/run/run.js";
import { COPY } from "../copy.js";
import { MirrorMap } from "./mirror_map.js";
import { realmName, xpNeed } from "../../game/progression.js";
import { defOf, valueOf } from "../../core/items.js";
import { GatherUI } from "../gather_ui.js"; // 采集 / 开箱 / 交互提示的表现（UI 设计）
import { BossUI } from "../boss/boss_ui.js"; // 首领条 / 狼威 / 处决提示与演出叠加层（UI 设计，boss_青牙_v2 §8）

const CSS = `
.mk-layer-runhud, .mk-layer-runhud * { pointer-events: none; }
.mk-layer-runhud .mk-val .mk-q { pointer-events: auto; }
/* 首领关口提示：天时条下方一行小字，4 秒淡出（不用横幅，不挡视野） */
.mk-gatehint { position: absolute; left: 50%; top: 78px; transform: translateX(-50%); text-align: center; font: 17px var(--f-kai); color: var(--zhu); letter-spacing: .12em; white-space: nowrap; text-shadow: 0 0 4px var(--paper-hi), 0 0 8px var(--paper-hi); opacity: 0; }
.mk-gatehint small { display: block; margin-top: 2px; font: 13px var(--f-kai); color: var(--ink-zhong); letter-spacing: .1em; }
.mk-gatehint.on { animation: mkGateHint 4s ease both; }
@keyframes mkGateHint { 0% { opacity: 0; } 8% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
.mk-tod { position: absolute; left: 50%; top: 10px; width: 340px; margin-left: -170px; text-align: center; }
.mk-tod .ticks { display: flex; justify-content: space-between; font: 15px var(--f-display); color: var(--ink-zhong); padding: 0 2px; }
.mk-tod .ticks span.on { color: var(--ink); font-size: 19px; }
.mk-tod .ticks span.night.on { color: var(--zhu); }
.mk-tod .track { position: relative; margin: 2px 0 4px; }
.mk-tod .drop { position: absolute; top: -7px; width: 12px; height: 18px; margin-left: -6px; background: var(--zhu); border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; box-shadow: 0 0 0 2px rgba(245,240,227,.8); }
.mk-tod .sub { font: 13px var(--f-ui); color: var(--ink-nong); text-shadow: 0 0 2px var(--paper-hi), 0 0 4px var(--paper-hi), 0 0 8px rgba(245,240,227,.9); }
.mk-tod .sub b { color: var(--zhu); font-weight: 700; } .mk-tod .sub .tide { color: #6e5214; font-weight: 700; }
.mk-val { position: absolute; right: 200px; top: 14px; display: flex; gap: 8px; align-items: flex-start; text-align: right; }
.mk-val .lbl { writing-mode: vertical-rl; font: 15px var(--f-display); color: var(--ink-nong); letter-spacing: .2em; }
.mk-val .n { font: 400 40px var(--f-splash); color: #6e5214; line-height: 1; text-shadow: 0 0 6px rgba(245,240,227,.95), 0 0 12px rgba(245,240,227,.8); }
.mk-val .s { font: 13px var(--f-ui); color: var(--ink-nong); margin-top: 4px; text-shadow: 0 0 2px var(--paper-hi), 0 0 4px var(--paper-hi), 0 0 8px rgba(245,240,227,.9); }
.mk-val .s .u { color: var(--shiqing); font-weight: 700; } .mk-val .s .full { color: var(--zhu); font-weight: 700; }
.mk-mirror-w { position: absolute; right: 24px; top: 22px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.mk-mirror-w canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
.mk-mirror-w .cap { font: 13px var(--f-ui); color: var(--ink-nong); text-shadow: 0 0 2px var(--paper-hi), 0 0 4px var(--paper-hi), 0 0 8px rgba(245,240,227,.9); white-space: nowrap; }
.mk-mirror-w .cap b { color: var(--zhu); font-family: var(--f-display); font-weight: 400; font-size: 15px; }
.mk-quests { position: absolute; right: 24px; top: 236px; width: 220px; text-align: right; font: 14px/1.6 var(--f-kai); color: var(--ink-nong); }
.mk-quests .ok { color: var(--shilv); text-decoration: line-through; }
.mk-quests .fo { font: 13px var(--f-ui); color: var(--ink-nong); text-shadow: 0 0 2px var(--paper-hi), 0 0 4px var(--paper-hi), 0 0 8px rgba(245,240,227,.9); }
.mk-chan { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; }
.mk-chan.on { display: block; }
.mk-chan .ink-ring { position: absolute; left: -62px; top: -86px; width: 124px; height: 124px; --rc: var(--zhu); }
.mk-chan.tal .ink-ring { --rc: #9a7526; }
.mk-chan .lbl { position: absolute; left: 70px; top: -78px; display: flex; gap: 8px; align-items: flex-start; white-space: nowrap; }
.mk-chan .lbl .v { writing-mode: vertical-rl; font: 22px var(--f-display); letter-spacing: .1em; color: var(--ink); text-shadow: 0 0 6px var(--paper-hi), 0 0 3px var(--paper-hi); }
.mk-chan .lbl .t { font: 400 28px var(--f-splash); color: var(--zhu); text-shadow: 0 0 6px var(--paper-hi); }
.mk-chan .lbl .t small { font: 12px var(--f-ui); }
.mk-chan .lbl .r { font: 12px/1.6 var(--f-ui); color: var(--ink-zhong); text-shadow: 0 0 3px var(--paper-hi), 0 0 3px var(--paper-hi); margin-top: 4px; }
.mk-chan.out .lbl .r { color: var(--zhu); font-weight: 700; }
.mk-feed { position: absolute; left: 28px; bottom: 40px; display: flex; flex-direction: column; gap: 8px; }
.mk-feed .f { display: flex; align-items: center; gap: 10px; font: 15px var(--f-display); color: var(--ink-nong); text-shadow: 0 0 4px var(--paper-hi), 0 0 4px var(--paper-hi); transition: opacity .4s; }
.mk-feed .f .ink-slot { --z: 30px; }
.mk-feed .f small { font: 12px var(--f-ui); color: #8a6a22; font-weight: 700; }
.mk-realm { position: absolute; right: 28px; bottom: 28px; width: 230px; text-align: right; }
.mk-realm .r { display: flex; justify-content: space-between; align-items: baseline; font: 20px var(--f-display); color: var(--ink-nong); text-shadow: 0 0 6px var(--paper-hi); }
.mk-realm .r small { font: 12px var(--f-ui); color: var(--ink-nong); }
.mk-realm .ink-bar { margin: 4px 0 2px; }
.mk-realm .n { font: 12px var(--f-ui); color: #6e5214; font-weight: 700; text-shadow: 0 0 2px var(--paper-hi), 0 0 4px var(--paper-hi), 0 0 8px rgba(245,240,227,.9); }
/* UI 体检 v1 · 小字底衬「字随墨晕」（docs/ui/v3/体检_v1/d_dichen.html）：每组一团更厚的墨晕；镜下方位、机缘各自一团小墨晕；小字 ≥ 12–13px、浓墨；泥金字用 #6e5214 */
.mk-tod.ink-wash, .mk-val.ink-wash, .mk-realm.ink-wash { --wash-color: rgba(240, 234, 220, .93); }
.mk-tod.ink-wash::before { inset: -46% -22% -60%; }
.mk-val.ink-wash::before { inset: -40% -40% -50%; }
.mk-realm.ink-wash::before { inset: -55% -42% -75% -24%; }
.mk-mirror-w .cap, .mk-quests .fo { position: relative; isolation: isolate; padding: 2px 10px; }
.mk-mirror-w .cap { margin: 0 -10px; } /* 内边距不撑宽这一列，铜镜不挪位 */
.mk-mirror-w .cap::before, .mk-quests .fo::before { content: ""; position: absolute; inset: -10px -26px -12px; z-index: -1; background: rgba(240, 234, 220, .92);
  -webkit-mask: var(--ink-wash-2) 0 0 / 100% 100% no-repeat; mask: var(--ink-wash-2) 0 0 / 100% 100% no-repeat; }
.mk-hint { position: absolute; left: 50%; bottom: 118px; transform: translateX(-50%); }
.mk-hint:empty { display: none; }
/* 炼化增益：气血条右侧一枚小印 + 剩余时间；悬停浮出效果 */
.mk-layer-runhud .mk-buffs { position: fixed; z-index: 21; display: flex; gap: 8px; }
.mk-layer-runhud .mk-buffs .b { position: relative; display: flex; align-items: center; gap: 4px; pointer-events: auto; cursor: help; font: 13px var(--f-ui); color: var(--ink-nong); text-shadow: 0 0 6px rgba(236,230,214,.9); }
.mk-buffs .b i { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font: normal 14px var(--f-display); color: #f5f0e3; background: var(--shilv, #3f7a5c); -webkit-mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq) 0 0 / 100% 100% no-repeat; transform: rotate(-5deg); }
.mk-buffs .b b { font: normal 15px var(--f-display); color: var(--shilv, #3f7a5c); margin-right: 2px; }
.mk-buffs .b.low { color: var(--zhu); }
.mk-buffs .b::after { content: attr(data-tip); position: absolute; left: -6px; top: calc(100% + 6px); width: 220px; padding: 8px 12px 9px; font: 13px/1.6 var(--f-kai); color: var(--ink); white-space: pre-line; text-shadow: none; background: var(--paper-hi); box-shadow: 0 4px 12px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; opacity: 0; transition: opacity .15s; pointer-events: none; }
.mk-buffs .b:hover::after { opacity: 1; }
`;
const DIRS = ["东", "东南", "南", "西南", "西", "西北", "北", "东北"];
const _v = new THREE.Vector3();

export class RunHud {
  constructor(ctx, run) {
    kit.css("runhud", CSS);
    this.ctx = ctx;
    this.run = run;
    this.L = kit.layer("runhud", 22);
    kit.clear("runhud");
    kit.show("runhud", !0);
    const L = this.L;
    L.innerHTML = `
      <div class="mk-tod ink-wash"><div class="ticks">${PHASES.map((p, i) => `<span class="${i === 3 ? "night" : ""}">${p.name}</span>`).join("")}</div>
        <div class="track"><div class="ink-bar thin" style="--v:0"><i></i></div><i class="drop"></i></div><div class="sub"></div></div>
      <div class="mk-val ink-wash"><div class="lbl">估价<span class="mk-q" data-tip="${COPY.lingzhi}">？</span></div><div><div class="n ink-num">0</div><div class="s"></div></div></div>
      <div class="mk-mirror-w"><div class="hud-mirror"><div class="map"></div><div class="knob"></div><canvas width="300" height="300"></canvas></div><div class="cap"></div></div>
      <div class="mk-quests"></div>
      <div class="mk-chan"><div class="ink-ring" style="--v:0"></div><div class="lbl"><div class="v">撤离中</div><div><div class="t"></div><div class="r"></div></div></div></div>
      <div class="mk-feed"></div>
      <div class="mk-realm ink-wash"><div class="r"><span></span><small></small></div><div class="ink-bar xp thin"><i></i></div><div class="n"></div></div>
      <div class="mk-hint"></div>
      <div class="mk-buffs"></div>
      <div class="mk-gatehint"></div>
      `;
    this.q = (s) => L.querySelector(s);
    this.cache = {};
    this.ticks = [...L.querySelectorAll(".mk-tod .ticks span")];
    this.cv = this.q(".mk-mirror-w canvas");
    this.g = this.cv.getContext("2d");
    this.mapT = 0;
    this.feed = [];
    this.mm = new MirrorMap(ctx, run); // 天机镜 v2：山水底图（进关卡渲染一次）+ 图标；铜镜与手卷共用
    this.onKey = (e) => {
      if (e.code === "KeyM" && !e.repeat && !document.body.classList.contains("mk-paused")) this.toggleMap();
    };
    addEventListener("keydown", this.onKey);
    this.offRun = run.on((t, d) => (t === "pickup" ? this.pushFeed(d) : t === "gateHint" ? this.gateHint(d) : null));
    this.gather = new GatherUI(ctx, run);
    this.boss = new BossUI(ctx, run);
  }
  toggleMap(on = !this.big) {
    this.big = on;
    this.mm.toggle(on);
  }
  set(sel, html) {
    if (this.cache[sel] === html) return;
    this.cache[sel] = html;
    this.q(sel).innerHTML = html;
  }
  setVar(sel, name, v) {
    const k = sel + name, s = v.toFixed(3);
    if (this.cache[k] === s) return;
    this.cache[k] = s;
    this.q(sel).style.setProperty(name, s);
  }
  // 炼化增益小印：增益变化或整秒变化时才写 DOM；位置贴着左上角气血条（#hud）右侧
  updateBuffs() {
    const B = this.run.buffs || [];
    let sec = 0;
    for (const x of B) sec += Math.ceil(x.b.remain);
    if (this.cache.buffN === B.length && this.cache.buffS === sec) return;
    const box = this.q(".mk-buffs");
    if (this.cache.buffN !== B.length) {
      this.cache.buffN = B.length;
      box.innerHTML = B.map((x) => `<div class="b" data-tip="${x.name}\n${buffText(x.b)}\n只在出行局里计时"><i>灵</i><b>${x.label}</b><span></span></div>`).join("");
      const hp = document.querySelector("#hud .row.hp");
      const r = hp ? hp.getBoundingClientRect() : null;
      box.style.left = (r ? r.right + 8 : 330) + "px";
      box.style.top = (r ? r.top + r.height / 2 - 12 : 18) + "px";
    }
    this.cache.buffS = sec;
    const els = box.children;
    for (let k = 0; k < B.length; k++) {
      const t = Math.max(0, Math.ceil(B[k].b.remain)), el = els[k];
      el.lastChild.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      el.classList.toggle("low", t <= 30);
    }
  }
  // 首领关口提示：{ text, sub }（或纯文字）
  gateHint(h) {
    const el = this.q(".mk-gatehint"), o = typeof h === "string" ? { text: h } : h || {};
    el.textContent = o.text || "";
    if (o.sub) el.appendChild(kit.el("small", "", o.sub));
    el.classList.remove("on");
    void el.offsetWidth; // 重新播放淡出
    el.classList.add("on");
  }
  pushFeed(inst) {
    if (!inst) return;
    const d = defOf(inst) || {};
    this.feed.unshift({ inst, name: inst.identified === !1 ? `未鉴定的${d.name}` : d.name, n: inst.n, v: valueOf(inst), t: 0 });
    this.feed.length = Math.min(this.feed.length, 4);
    this.feedDirty = !0; // 一次取一堆时逐件 pickup：只记数据，下一帧 update 里重建一次
    this.feedT = 6;
  }
  renderFeed() {
    this.feedDirty = !1;
    const box = this.q(".mk-feed");
    box.innerHTML = "";
    this.feed.forEach((f, i) => {
      const row = kit.el("div", "f");
      row.appendChild(kit.itemCell(f.inst, { size: "sm" }));
      row.appendChild(kit.el("span", "", `${f.name}${f.n > 1 ? " ×" + f.n : ""} <small>+${f.v}</small>`));
      row.style.opacity = [1, 0.65, 0.4, 0.25][i];
      box.appendChild(row);
    });
  }
  update(dt) {
    const r = this.run;
    if (!r || r.state === "loading") return;
    // 天时
    const ph = r.R.phases, tut = r.region === "tutorial";
    const total = ph[2] + 240;
    this.setVar(".mk-tod .ink-bar", "--v", tut ? 0 : Math.min(1, r.t / total));
    if (this.cache.phase !== r.phase) {
      this.cache.phase = r.phase;
      this.ticks.forEach((s, i) => s.classList.toggle("on", i === r.phase));
    }
    const dropX = (tut ? 0 : Math.min(1, r.t / total)) * 340;
    if (Math.abs((this.cache.dropX || -9) - dropX) > 0.5) (this.cache.dropX = dropX), (this.q(".mk-tod .drop").style.left = dropX + "px");
    const P = PHASES[r.phase];
    const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
    let sub;
    if (tut) sub = "往破洞府去";
    else if (r.phase < 2) sub = `${PHASES[r.phase + 1].name}至还有 ${mmss(ph[r.phase] - r.t)}`;
    else if (r.phase === 2) sub = `入夜还有 <b>${mmss(ph[2] - r.t)}</b> · 妖潮将起`;
    else sub = `<b>妖潮 ${mmss(r.nextWave - r.t)}</b>`;
    if (!tut) sub += ` · <span class="tide">灵潮 ×${(P.tide || 1).toFixed(1)}</span>${P.channelMul > 1 ? ` · 读条 ×${P.channelMul}` : ""}`;
    this.set(".mk-tod .sub", sub);
    // 灵值与占格
    const b = r.bag;
    this.set(".mk-val .n", b.value.toLocaleString());
    // 灵值第一次有数时说明一次（每个存档一次；也可随时悬停"？"）
    if (b.value > 0 && !this.lzTold) {
      this.lzTold = !0;
      if (r.hintOnce && r.hintOnce("lingzhi", COPY.lingzhi, 6)) {
        const qq = this.q(".mk-val .mk-q");
        qq.classList.add("show");
        setTimeout(() => qq.classList.remove("show"), 6000);
      }
    }
    const unid = b.items.filter((i) => i.identified === !1).length;
    const fu = r.talismanCount ? r.talismanCount() : 0;
    const ek = r.elementFus ? r.elementFus() : [];
    const sel = ek.includes(r.fuSel) ? r.fuSel : ek[0];
    const efu = sel ? ` · ${(defOf({ id: sel }) || {}).name} ${r.carried.filter((i) => i.id === sel).reduce((a, i) => a + i.n, 0)}（3${ek.length > 1 ? " · 4 换" : ""}）` : "";
    this.set(".mk-val .s", `储物袋 <span class="${b.free <= 0 ? "full" : ""}">${b.used} / ${b.capacity}</span>${unid ? ` · <span class="u">未鉴定 ${unid}</span>` : ""}${fu ? ` · 遁地符 ${fu}（G）` : ""}${efu}`);
    // 读条圆相：跟着主角脚下
    const c = r.channel, ch = this.q(".mk-chan");
    if (!!c !== this.cache.chan) (this.cache.chan = !!c), ch.classList.toggle("on", !!c);
    if (c) {
      ch.classList.toggle("out", !c.inside);
      ch.classList.toggle("tal", c.kind === "talisman" || c.kind === "mist");
      _v.copy(this.ctx.player.pos).project(this.ctx.camera);
      ch.style.transform = `translate(${((_v.x + 1) / 2) * innerWidth}px, ${((1 - _v.y) / 2) * innerHeight}px)`;
      this.setVar(".mk-chan .ink-ring", "--v", Math.min(1, c.t / c.need));
      this.set(".mk-chan .t", `${Math.max(0, c.need - c.t).toFixed(1)}<small> 息</small>`);
      this.set(".mk-chan .r", c.kind === "mist" ? "穿雾而退 · 松开即停<br>受击打断" : c.kind === "talisman" ? "遁地符 · 受击打断" : c.inside ? "阵内守住 · 离阵即停<br>妖兽被引来" : "已离阵 · 读条暂停");
    }
    this.updateBuffs();
    this.boss.update(dt);
    this.gather.update(dt); // 交互物的 F 提示改为贴在物件上方（gather_ui），这里只留非交互物的提示
    this.set(".mk-hint", r.hint && !this.gather.anchored ? `<span class="ink-toast">${r.hint}</span>` : b.free <= 0 && r.bagFullCount ? `<span class="ink-toast zhu">储物袋已满 · Tab 取舍</span>` : "");
    // 拾取流：有新条目时重建一次；淡出
    if (this.feedDirty) this.renderFeed();
    if (this.feedT > 0 && (this.feedT -= dt) <= 0) (this.feed.length = 0), (this.q(".mk-feed").innerHTML = "");
    // 天机镜、境界、委托（低频）
    if ((this.mapT -= dt) <= 0) {
      this.mapT = 0.15;
      this.mm.mirrorCv = this.cv;
      this.mm.refresh(); // 按需重画（签名不变就跳过）
      this.set(".mk-mirror-w .cap", this.nearestExtractText());
    }
    if ((this.slowT = (this.slowT || 0) - dt) <= 0) {
      this.slowT = 0.5;
      const Pf = r.profile, need = xpNeed(Pf);
      this.set(".mk-realm .r", `<span>${realmName(Pf)}</span><small>${Math.floor(Pf.xp)} / ${need === Infinity ? "—" : need}</small>`);
      this.setVar(".mk-realm .ink-bar", "--v", need === Infinity ? 1 : Math.min(1, Pf.xp / need));
      const bank = Pf.stats && Pf.stats.xpBank;
      this.set(".mk-realm .n", Pf.xp >= need && bank > 0 ? `修为圆满 · 溢出存储 ${Math.round(bank)}/600` : `本局感悟 +${Math.round(r.insight)} · 已入修为`);
      let qs = [];
      try {
        qs = (r.quests && r.quests.progress && r.quests.progress()) || [];
      } catch (e) {}
      let html = qs.map((q) => `<div class="${q.done ? "ok" : ""}">${q.text || q.id}</div>`).join("");
      if (LOOT.getFortune && !tut) {
        const fo = LOOT.getFortune(Pf) || {};
        html += `<div class="fo">机缘 ${Math.round(fo.value || 0)} / ${fo.max || "?"}</div>`;
      }
      this.set(".mk-quests", html);
    }
  }
  nearestExtractText() {
    const r = this.run, p = this.ctx.player.pos;
    let best = null, bd = 1e9;
    for (const x of r.extracts) {
      if (!x.known || x.used) continue;
      const d = Math.hypot(x.pos.x - p.x, x.pos.z - p.z);
      if (d < bd) (bd = d), (best = x);
    }
    if (!best) return "撤离点未明";
    const a = Math.atan2(best.pos.z - p.z, best.pos.x - p.x); // 地图 +x 东、+z 南
    const dir = DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    const name = best.kind === "ruin" && !best.confirmed ? "未明残阵" : best.name || "撤离点";
    return `${name} · <b>${dir} ${Math.round(bd / 3.3)} 丈</b>`;
  }

  dispose() {
    this.mm && this.mm.dispose();
    removeEventListener("keydown", this.onKey);
    document.body.classList.remove("mk-map-open");
    this.offRun && this.offRun();
    this.gather && this.gather.dispose();
    this.boss && this.boss.dispose();
    kit.clear("runhud");
    kit.show("runhud", !1);
  }
}
