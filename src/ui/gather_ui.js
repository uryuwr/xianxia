// 采集 / 开箱的界面表现（UI 设计，docs/ui/v2/灵草采集_v1.md）。由 RunHud 创建，挂在 "gather" 界面层（z 23，压在局内 HUD 之上）。
//   ① 交互提示：所有交互物（灵草、矿脉、灵光、宝箱、撤离点、遗落储物袋、奇遇）共用——贴在物件上方的"F 印 + 动词 + 名称"，
//      名称按品阶 / 种类着色、下面一笔同色短划；物件脚下的圆相同时"聚焦"（墨变浓、圈收紧）。文字仍取 run.hint（流程模块 A 的文案）。
//   ② 读条：一笔圆相按进度画出（运笔时机 = 一段泥金弧），被打断时转朱、抖两下、钤"断"。
//      约定（给流程模块 A，采集 / 开箱目前是即时的，见玩法评审 G12）：run.gathering = { mark, t, need, sweet?: [a, b] }
//      （或 run.channel.kind === "gather" / "chest" 且带 mark）；读条中途 run.gathering 消失而 mark 仍在 → 视为打断；
//      也可 run.emit("gather:cancel", { reason })。即时采集 / 开箱则只播 ③。
//   ③ 完成：采下 = 脚下圆相一笔收拢 + 钤一方"采"印；开箱 = 掀盖、墨气涌出、按掉落最高品质着色的光，箱子留在原地（已开启）；
//      掉落字牌从草丛 / 箱口抛到落点；拾取时物品圆相沿弧线飞入右上"储物袋"计数（身后一串墨点、计数一跳），原处浮起按品质着色的"名称 ×数量"。
// 只读 run 的状态、订阅事件，不改任何玩法逻辑与数值。
import "./gather.css";
import * as THREE from "three";
import { kit } from "./kit.js";
import { RARITY, defOf } from "../core/items.js";
import { GatherFX, tierOfMark, rarityOfMark } from "../fx/gather_fx.js";
import { RARITY as RQ } from "../core/items.js";
import { rarityTint, css, rgba } from "../fx/rarity_tint.js";
import { LootWindow } from "./loot_window.js"; // 搜取窗口（墨封宣纸格）
import { itemTag } from "./icons.js";

const VERB = { gather: "采", chest: "开", extract: "撤", lostbag: "取", encounter: "探", loot: "搜", pickup: "取" };
const RISE = { gather: 1.25, chest: 1.15, extract: 2.4, lostbag: 0.9, encounter: 1.9, loot: 1.0, pickup: 1.05 };
const _v = new THREE.Vector3();

// 物品格里的写意小图（2–4 笔，品类色，压在字后面）：灵草一枝、矿石三棱、灵物一圈光
const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${body}</svg>`)}")`;
const PICS = {
  "--g-herb": svg(
    `<g fill='rgba(63,154,110,.34)'><path d='M30 61C32 45 30 28 36 8C34 28 35 45 33 61Z'/><path d='M31.5 41C20 38 12 29 8 17C18 22 27 29 31.5 41Z'/><path d='M33 30C42 25 50 19 56 9C47 12 39 18 33 30Z'/><path d='M32.5 51C41 49 48 45 53 38C44 39 37 43 32.5 51Z'/></g>`,
  ),
  "--g-ore": svg(`<g fill='rgba(58,74,82,.3)'><path d='M21 55L28 18L35 55Z'/><path d='M33 56L43 28L47 56Z'/><path d='M12 56L17 37L24 56Z'/><path d='M6 56C22 52 42 54 59 55L59 59C42 58 22 57 6 60Z'/></g>`),
  "--g-treasure": svg(
    `<g fill='none' stroke='rgba(184,146,58,.38)' stroke-linecap='round'><path d='M47 17C38 9 22 10 15 21C8 33 14 49 28 53C40 56 52 48 53 36' stroke-width='5'/></g><g fill='rgba(184,146,58,.36)'><circle cx='50' cy='12' r='2.6'/><circle cx='56' cy='22' r='1.8'/><circle cx='12' cy='50' r='2'/></g>`,
  ),
};
let varsDone = !1;
// 品质相关的颜色全部从 RARITY 生成（src/fx/rarity_tint.js），不写死：拾取字、搜取格子的圆相 / 晕 / 字、墨封预感
export function ensureGatherStyles() {
  if (varsDone) return;
  varsDone = !0;
  kit.css("gather-pics", `:root { ${Object.entries(PICS).map(([k, v]) => `${k}: ${v};`).join(" ")} }`);
  const rules = RQ.map((R, q) => {
    const T = rarityTint(q);
    return [
      `.mk-glabel.q${q} { color: ${q ? css(T.text) : "var(--ink-nong)"}; }`,
      `.mk-glabel.q${q}::after { background: ${css(T.ring)}; }`,
    ].join(" ");
  });
  // 仙品泛金 / 极品朱金：取仙品、极品的 RARITY 色
  const X = rarityTint(3), J = rarityTint(4);
  rules.push(`:root { --flash3: ${rgba(X.light, 0.75)}; --flash4: ${rgba(J.base, 0.6)}; --spark3: ${css(X.base)}; --spark4: ${css(J.base)}; }`);
  kit.css("rarity-colors", rules.join(" "));
}
ensureGatherStyles();

export class GatherUI {
  constructor(ctx, run) {
    ensureGatherStyles();
    this.ctx = ctx;
    this.run = run;
    this.L = kit.layer("gather", 23);
    kit.clear("gather");
    kit.show("gather", !0);
    this.L.innerHTML = `
      <div class="mk-gp"><div class="in ink-wash"><span class="key">F</span><span class="verb"></span><span class="nm"></span><span class="sub"></span><span class="tag"></span></div></div>
      <div class="mk-gring"><div class="ink-ring" style="--v:0"></div><i class="sweet off"></i><span class="brk ink-seal round">断</span><div class="lbl"><span class="v">采集</span><span class="t"></span></div><span class="r"></span></div>`;
    this.gp = this.L.querySelector(".mk-gp");
    this.gr = this.L.querySelector(".mk-gring");
    this.fx = new GatherFX(ctx);
    this.born = new WeakSet(); // 采集 / 开箱掉出来的物品实例：拾取时飞入储物袋
    this.seen = new WeakSet(); // 已经见过的地上字牌
    this.where = new WeakMap(); // 物品实例 → 字牌最后的世界坐标
    this.chests = new Set();
    this.openedMarks = new WeakSet();
    this.focus = null;
    this.fading = new Set();
    this.anchored = !1;
    this.labelN = 0;
    this.labelT = 0;
    this.stats = { prompt: 0, ring: 0, cut: 0, pluck: 0, open: 0, arcs: 0, fly: 0, label: 0 };
    this.offs = [
      run.on((t, d) => (t === "pickup" ? this.onPickup(d) : t === "chest" ? this.openChest(d) : t === "gather:cancel" ? this.interrupt(d && d.reason) : null)),
      ctx.world.events.on("gather:done", (e) => this.onGather(e)),
    ];
    for (const m of run.marks) if (m.kind === "chest") this.chests.add(m);
    this.loot = new LootWindow(ctx, run, this);
    ctx.gatherUI = this;
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const r = this.run, ctx = this.ctx;
    if (!r || r.state === "loading") return;
    this.chestWatch();
    // 新落地的字牌：记位置
    for (const p of r.pickups ? r.pickups.list : []) {
      if (!this.seen.has(p)) this.seen.add(p);
      const w = this.where.get(p.inst) || new THREE.Vector3();
      w.copy(p.sprite.position);
      this.where.set(p.inst, w);
    }
    this.fx.update(dt);
    this.loot.update(dt);
    this.nightK();
    this.prompt(dt);
    this.ring();
    if ((this.labelT -= dt) <= 0) this.labelN = 0;
  }
  // 关卡外（样张地图 / 夜明宝箱）的标记物不受关卡天时管理：按天时自己调灵光强度
  nightK() {
    const r = this.run, ph = r.R && r.R.phases;
    if (!ph) return;
    const tod = Math.min(1, r.t / (ph[2] + 60)), k = 1 + Math.max(0, tod - 0.55) * 1.6;
    if (Math.abs((this.lastK || 0) - k) < 0.01) return;
    this.lastK = k;
    for (const m of r.marks) if (m.fxObject) for (const g of m.fxObject.userData.glows || []) g.uniforms.uK.value = (g.userData.baseK ??= g.uniforms.uK.value) * k;
  }
  objOf(m) {
    return (m && ((m.point && m.point.object) || m.fxObject)) || null;
  }
  // 交互提示
  prompt(dt) {
    const r = this.run;
    let m = null;
    const busy = !!this.ch || this.gr.classList.contains("cut") || !!(r.containers && r.containers.openC); // 读条中 / 刚被打断 / 搜取窗开着：提示先收起
    if (!busy && r.state === "play" && r.hint && r.hint.startsWith("F · ") && !document.body.classList.contains("mk-paused") && !document.body.classList.contains("mk-bag-open")) m = r.nearestMark();
    this.anchored = !!m || busy;
    // 脚下圆相聚焦（淡入淡出）
    const o = m && this.objOf(m);
    const fo = o && o.userData.gather ? o.userData.gather : null;
    if (fo !== this.focus) {
      if (this.focus) this.fading.add(this.focus);
      this.focus = fo;
      if (fo) this.fading.delete(fo);
    }
    if (fo) fo.setFocus(Math.min(1, fo.focus + dt * 6));
    for (const f of this.fading) {
      f.setFocus(Math.max(0, f.focus - dt * 4));
      if (f.focus <= 0) this.fading.delete(f);
    }
    const gp = this.gp;
    if (!m) {
      // 没有目标就收起（开箱 / 采完后标记已移除，不能残留）；清掉 key，下次出现重新扫入下划笔
      if (this.pkey) (this.pm = this.pkey = null), gp.classList.remove("on");
      return;
    }
    this.pm = m;
    const key = m.kind + "|" + r.hint + (m.kind === "pickup" ? "|" + m.q : "");
    if (key !== this.pkey) {
      this.pkey = key;
      const tier = tierOfMark(m), q = m.kind === "pickup" ? m.q | 0 : rarityOfMark(m), T = q != null ? rarityTint(q) : null; // 地上物品（run 的伪标记）按物品品级
      let name = r.hint.slice(4), sub = "", tag = "";
      const par = /^(.*?)（(.+)）$/.exec(name);
      if (par) (name = par[1]), (sub = par[2]);
      // 品质只用 RARITY 的名称与颜色：灵光点标"灵光"（地点类型），产出宝品及以上的采集点标品质名
      const seal = (t, cls) => `<span class="ink-seal ${cls}" style="--seal-color:${css(T.ring)}">${t}</span>`;
      if (sub === "灵光") (tag = T ? seal("灵光", "two") : ""), (sub = "");
      else if ((m.kind === "gather" || m.kind === "pickup") && q >= 2) tag = seal(RQ[q].name, "two");
      const k = m.kind === "chest" ? "chest" : m.kind === "extract" && m.ext && m.ext.kind === "cave" ? "cave" : m.kind;
      gp.className = `mk-gp k-${k}${tier && m.kind === "gather" ? " t-" + tier : ""}`;
      if (T && (m.kind === "gather" || m.kind === "chest" || m.kind === "pickup")) gp.style.setProperty("--gp-c", q ? css(T.text) : "var(--ink-nong)"), gp.style.setProperty("--gp-key", q >= 2 ? css(T.ring) : "");
      else gp.style.removeProperty("--gp-c"), gp.style.removeProperty("--gp-key");
      const $ = (sel) => gp.querySelector(sel);
      $(".verb").textContent = m.verb || VERB[m.kind] || "察";
      $(".nm").textContent = name;
      $(".sub").textContent = sub;
      $(".tag").innerHTML = tag;
      this.stats.prompt++;
      void gp.offsetWidth; // 重新触发下划笔的扫入
      gp.classList.add("on");
    }
    const h = m.kind === "gather" && m.glow ? 1.9 : RISE[m.kind] || 1.5;
    const at = this.screen(m.pos, h);
    if (!at) return gp.classList.remove("on");
    gp.classList.add("on");
    gp.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
  }
  screen(pos, h = 0) {
    _v.set(pos.x, pos.y + h, pos.z).project(this.ctx.camera);
    if (_v.z > 1) return null;
    return { x: ((_v.x + 1) / 2) * innerWidth, y: ((1 - _v.y) / 2) * innerHeight };
  }
  // 读条（运笔圆相）
  ring() {
    const r = this.run, gr = this.gr;
    const c = r.channel;
    const g = r.gathering || r.opening || (c && (c.kind === "gather" || c.kind === "chest") ? c : null);
    if (g) {
      const mk = g.mark || g.m || null;
      if (this.ch !== g) {
        this.ch = g;
        this.chMark = mk;
        this.stats.ring++;
        gr.classList.remove("cut", "fade");
        gr.querySelector(".v").textContent = mk && mk.kind === "chest" ? "开箱" : "采集";
      }
      const at = this.screen(mk ? mk.pos : this.ctx.player.pos, 0.5);
      gr.classList.add("on");
      if (at) gr.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      const v = Math.min(1, (g.t || 0) / (g.need || 1));
      gr.querySelector(".ink-ring").style.setProperty("--v", v.toFixed(3));
      const sw = gr.querySelector(".sweet");
      if (g.sweet) sw.classList.remove("off"), sw.style.setProperty("--a", g.sweet[0]), sw.style.setProperty("--b", g.sweet[1]);
      else sw.classList.add("off");
      gr.querySelector(".t").innerHTML = `${Math.max(0, (g.need || 0) - (g.t || 0)).toFixed(1)}<small> 息</small>`;
      gr.querySelector(".r").textContent = g.sweet ? "笔锋过金处松手 · 得完整品" : "受击或走开即断";
      return;
    }
    if (this.ch) {
      const mk = this.chMark;
      const ended = !mk || !r.marks.includes(mk) || this.ch.done;
      this.ch = null;
      if (!ended && r.state !== "done" && r.state !== "dead") this.interrupt();
      else if (!gr.classList.contains("cut")) gr.classList.remove("on");
    }
  }
  interrupt(reason) {
    const gr = this.gr;
    this.stats.cut++;
    gr.classList.remove("fade");
    gr.classList.add("on", "cut");
    gr.querySelector(".t").textContent = "";
    gr.querySelector(".r").textContent = reason || "采集被打断 · 再按 F 重来";
    void gr.offsetWidth;
    gr.classList.add("fade");
    clearTimeout(this.cutT);
    this.cutT = setTimeout(() => gr.classList.remove("on", "cut", "fade"), 950);
  }

  // ---------------- 完成 ----------------
  onGather(e) {
    if (!e || !e.pos) return;
    const r = this.run;
    // 采集事件发出时标记还在（run.interact 之后才移除）
    let m = null, bd = 2.6;
    for (const q of r.marks) {
      if (q.kind !== "gather") continue;
      const d = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z);
      if (d < bd) (bd = d), (m = q);
    }
    const tier = tierOfMark(m) || "herb", q = rarityOfMark(m) || 0;
    this.fx.pluck(e.pos, tier, q);
    this.stamp(e.pos, "采", q);
    this.stats.pluck++;
    this.claimDrops(e.pos, new THREE.Vector3(e.pos.x, e.pos.y + 0.6, e.pos.z)); // 只有储物袋放不下、真正落地的（e.left）才在地上
    // 直接收进储物袋的（流程组 run.onGathered 写 e.got）：从草丛飞进右上储物袋计数（"采得…"由 run.toast 给）
    const at = e.got && e.got.length ? this.screen(e.pos, 0.6) : null;
    if (at) e.got.forEach((inst, i) => this.fly(inst, at.x + i * 10, at.y));
  }
  // 宝箱：run 发出 "chest"（开箱时，掉落已落地）；兜底：标记从 run.marks 里消失也算被打开（run.interact 是同步的）
  chestWatch() {
    const r = this.run;
    for (const m of r.marks) if (m.kind === "chest" && !this.chests.has(m)) this.chests.add(m);
    for (const m of this.chests) {
      if (r.marks.includes(m)) continue;
      this.chests.delete(m);
      if (r.state === "done" || r.state === "dead") continue;
      this.openChest(m);
    }
  }
  openChest(m) {
    const r = this.run;
    if (!m || m.kind !== "chest" || this.openedMarks.has(m)) return;
    this.openedMarks.add(m);
    if (m.altar || m.stele) return void (this.fx.pluck(m.pos, "chest", 0), this.stamp(m.pos, m.stele ? "拓" : "启", 0, 1.1)); // 亭中供案 / 功法残碑：不换成开盖的箱子
    {
      const near = (r.pickups ? r.pickups.list : []).filter((p) => !this.seen.has(p) && Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < 3);
      const best = near.reduce((a, p) => Math.max(a, p.inst.rarity || 0), 0);
      const box = this.fx.openChest(m, best);
      this.stamp(m.pos, "启", best, 1.2);
      this.stats.open++;
      this.claimDrops(m.pos, new THREE.Vector3(box.position.x, box.position.y + 0.75, box.position.z));
    }
  }
  claimDrops(pos, from) {
    let i = 0;
    for (const p of this.run.pickups ? this.run.pickups.list : []) {
      if (this.seen.has(p) || Math.hypot(p.x - pos.x, p.z - pos.z) > 3) continue;
      this.seen.add(p);
      this.born.add(p.inst);
      this.fx.arc(p, from, i++ * 0.06);
      this.stats.arcs++;
    }
  }
  stamp(pos, ch, q = 0, h = 0.9) {
    const at = this.screen(pos, h);
    if (!at) return;
    const e = kit.el("div", "mk-gstamp", `<span class="ink-seal round" style="--seal-color:${css(rarityTint(q).ring)}">${ch}</span>`);
    e.style.transform = `translate(${at.x}px, ${at.y}px)`;
    this.L.appendChild(e);
    setTimeout(() => e.remove(), 1200);
  }
  onPickup(inst) {
    // 从地上取走的（按 F；不只是采集 / 开箱抛出来的）：原处浮名 + 飞进储物袋
    if (!inst || !(this.born.has(inst) || this.where.has(inst))) return;
    const w = this.where.get(inst);
    const at = w ? this.screen(w, 0) : this.screen(this.ctx.player.pos, 1.2);
    if (!at) return;
    this.label(inst, at.x, at.y - 14);
    this.fly(inst, at.x, at.y);
  }
  label(inst, x, y) {
    const d = defOf(inst) || {}, q = Math.min(4, inst.rarity || 0);
    const name = inst.identified === !1 ? `未鉴定的${d.name || ""}` : d.name || inst.id;
    const e = kit.el("div", `mk-glabel q${q}`, `${name}${inst.n > 1 ? `<small>×${inst.n}</small>` : ""}`);
    if (q >= 3) e.dataset.q = RARITY[q].name[0];
    e.style.left = x + "px";
    e.style.top = y - this.labelN * 26 + "px";
    this.labelN++;
    this.labelT = 0.5;
    this.L.appendChild(e);
    this.stats.label++;
    setTimeout(() => e.remove(), 1700);
  }
  fly(inst, x0, y0) {
    if ((this.flying || 0) >= 6) return; // 同时最多 6 个飞行格（全取一大堆时不堆 DOM）
    this.flying = (this.flying || 0) + 1;
    // 飞入目标（右上储物袋计数）的位置：0.5 秒内复用，一次取一堆时不逐件强制排版
    const now = performance.now();
    if (!this.tgtAt || now - this.tgtAt > 500) {
      this.tgtAt = now;
      this.tgtXY = [innerWidth - 260, 44];
      const tgt = document.querySelector(".mk-layer-runhud .mk-val .s");
      const b = tgt && tgt.getBoundingClientRect();
      if (b && b.width) this.tgtXY = [b.left + Math.min(40, b.width * 0.3), b.top + b.height / 2];
    }
    const [x1, y1] = this.tgtXY;
    const w = kit.el("div", "mk-gfly");
    const cell = itemTag(inst, { size: 46, box: "1x1", title: "" }); // 飞出去的就是搜取格 / 储物袋里的同一张物品签
    w.appendChild(cell);
    this.L.appendChild(w);
    const cx = x0 + (x1 - x0) * 0.25, cy = Math.min(y0, y1) - 90;
    const pt = (t) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1];
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const N = 16, dur = 720, frames = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = pt(ease(t));
      frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${(1.15 - 0.6 * t).toFixed(3)})`, opacity: t > 0.88 ? (1 - t) / 0.12 : 1 });
    }
    const q = Math.min(4, inst.rarity || 0), col = q ? RARITY[q].color : "rgba(21,24,27,.75)";
    for (let j = 1; j <= 6; j++) {
      const t = j / 7, [x, y] = pt(ease(t));
      const dot = kit.el("i", "mk-gdot");
      dot.style.left = x + "px";
      dot.style.top = y + "px";
      dot.style.setProperty("--gd-c", col);
      dot.style.animationDelay = (t * dur) / 1000 + "s";
      this.L.appendChild(dot);
      setTimeout(() => dot.remove(), dur + 1000);
    }
    this.stats.fly++;
    const done = () => {
      this.flying--;
      w.remove();
      const v = document.querySelector(".mk-layer-runhud .mk-val");
      if (v) {
        v.classList.remove("mk-gpulse");
        void v.offsetWidth;
        v.classList.add("mk-gpulse");
        clearTimeout(this.pulseT);
        this.pulseT = setTimeout(() => v.classList.remove("mk-gpulse"), 450);
      }
    };
    if (w.animate) w.animate(frames, { duration: dur, easing: "linear", fill: "forwards" }).onfinish = done;
    else setTimeout(done, dur);
  }

  dispose() {
    for (const off of this.offs) off && off();
    this.offs = [];
    for (const f of [...this.fading, this.focus]) f && f.setFocus(0);
    clearTimeout(this.cutT);
    this.fx.dispose();
    this.loot.dispose();
    kit.clear("gather");
    kit.show("gather", !1);
    if (this.ctx.gatherUI === this) this.ctx.gatherUI = null;
  }
}
