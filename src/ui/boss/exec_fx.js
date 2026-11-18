// 处决演出的 2D 叠加层（UI 设计，boss_青牙_v2 §7）：镜头 / 慢动作 / 无敌由战斗设计的 execution.js + rig.cine 负责，这里只画字、笔、印、留白。
//   威折处决（2.4 秒）：出伤那一刻（boss:executeHit，约 0.9 秒；没收到就按 0.9 兜底）朱色"斩"一笔扫出（0.25 秒），0.7 秒后淡出
//   终结处决（完整 4.0 秒）：0.3–1.2 留白 → 1.2 一笔浓墨横贯全屏（0.18 秒）→ 0.25 秒纯白 → 1.6 大"斩" → 1.9 朱印"青牙伏诛" → 2.4 起退
//            短版 2.0 秒：0.35 出伤，整条时间轴平移（CSS 变量 --o = -0.85s）
//   留白：ctx.ink.setPaperFade 存在时用水墨后期的参数（同一 pass，不加层），否则用一层纸色 DOM（青牙与林墨处留洞）。
// 性能：元素各一个、复用；全部是 CSS 关键帧（真实时间，不受慢动作 / 顿帧影响），每次处决只切一次类名；每帧只在 inkfade 模式下写一个后期参数。
import * as THREE from "three";

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// 终结处决的留白曲线（完整版时间轴，秒）：0.3–1.2 升到 0.85，2.4–3.6 退回 0
const FADE = [[0, 0], [0.3, 0], [1.2, 0.85], [2.4, 0.85], [3.6, 0]];
function fadeAt(t) {
  if (t <= FADE[0][0]) return FADE[0][1];
  for (let i = 1; i < FADE.length; i++) if (t <= FADE[i][0]) {
    const [t0, v0] = FADE[i - 1], [t1, v1] = FADE[i];
    return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return 0;
}

export class ExecFx {
  constructor(ctx, layer, stats) {
    this.ctx = ctx;
    this.stats = stats || { writes: 0 };
    const d = (this.root = document.createElement("div"));
    d.className = "bx-exec";
    d.innerHTML = `<div class="paper"></div><div class="flash"></div>
      <div class="bx-stage"><div class="rzhan wipe"><b>斩</b></div><div class="stroke wipe"><i></i></div><div class="zhan">斩</div>
        <span class="ink-seal four yin"></span></div>`;
    layer.appendChild(d);
    this.paper = d.querySelector(".paper");
    this.stage = d.querySelector(".bx-stage");
    this.yin = d.querySelector(".yin");
    this.on = !1;
    this.kind = null;
  }
  // kind: "break" | "final"；o: { dur, short, enemy, seal }
  play(kind, o = {}) {
    this.stop();
    const d = this.root, ink = this.ctx.ink;
    this.kind = kind;
    this.on = !0;
    this.t0 = performance.now();
    this.short = !!o.short;
    this.inkFade = kind === "final" && !!(ink && typeof ink.setPaperFade === "function");
    this.lastFade = -1;
    if (kind === "final") {
      const seal = o.seal || "青牙伏诛";
      this.yin.innerHTML = [...seal].map((c) => `<span>${c}</span>`).join("");
      if (!this.inkFade) this._hole(o.enemy);
      else if (ink.setPaperFocus) ink.setPaperFocus(o.enemy, this.ctx.player); // 后期留白的"洞"：首领与林墨（世界空间，随位置走）
    }
    d.className = "bx-exec"; // 清掉上一次的类，重播关键帧
    void d.offsetWidth;
    d.className = `bx-exec on ${kind}${this.short ? " short" : ""}${this.inkFade ? " inkfade" : ""}`;
    this.stage.classList.toggle("shake", kind === "final");
    document.body.classList.add("mk-bossexec"); // 处决期间收起通知 / 提示条（boss.css）
    this.stats.writes += 2;
    // 兜底：没收到 boss:execEnd 也会在 dur 之后收掉
    const dur = o.dur || (kind === "final" ? (this.short ? 2 : 4) : 2.4);
    this.endT = setTimeout(() => this.stop(), (dur + 0.4) * 1000);
    if (kind === "break") this.hitT = setTimeout(() => this.hit(), 950); // 兜底：没收到 boss:executeHit
  }
  // 出伤那一刻（boss:executeHit）：威折处决的朱色"斩"
  hit() {
    clearTimeout(this.hitT);
    if (!this.on || this.kind !== "break" || this.root.classList.contains("hit")) return;
    this.root.classList.add("hit");
    this.stats.writes++;
  }
  // 纸色层上给青牙与林墨留一个洞（屏幕坐标，处决开始时算一次）
  _hole(enemy) {
    const cam = this.ctx.camera, pl = this.ctx.player;
    if (!cam) return;
    const W = innerWidth, H = innerHeight;
    const pts = [];
    if (enemy && enemy.pos) pts.push((enemy.headPos ? enemy.headPos(_a) : _a.copy(enemy.pos)).project(cam).clone(), _b.copy(enemy.pos).project(cam).clone());
    if (pl && pl.pos) pts.push(_b.copy(pl.pos).project(cam).clone(), _b.set(pl.pos.x, pl.pos.y + 1.8, pl.pos.z).project(cam).clone());
    if (!pts.length) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) {
      const x = ((p.x + 1) / 2) * W, y = ((1 - p.y) / 2) * H;
      x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
    }
    const s = this.paper.style;
    s.setProperty("--hx", ((x0 + x1) / 2).toFixed(0) + "px");
    s.setProperty("--hy", ((y0 + y1) / 2).toFixed(0) + "px");
    s.setProperty("--hw", Math.max(120, (x1 - x0) * 0.75 + 90).toFixed(0) + "px");
    s.setProperty("--hh", Math.max(170, (y1 - y0) * 0.75 + 110).toFixed(0) + "px");
    this.stats.writes += 4;
  }
  update() {
    if (!this.on || !this.inkFade) return;
    const t = (performance.now() - this.t0) / 1000 + (this.short ? 0.85 : 0);
    let v = fadeAt(t);
    if (this.short && t > 2.1) v = Math.max(0, 0.85 * (1 - (t - 2.1) / 0.7));
    v = Math.round(v * 200) / 200;
    if (v === this.lastFade) return;
    this.lastFade = v;
    this.ctx.ink.setPaperFade(v);
  }
  stop() {
    clearTimeout(this.endT);
    clearTimeout(this.hitT);
    if (!this.on) return;
    this.on = !1;
    this.root.className = "bx-exec";
    document.body.classList.remove("mk-bossexec");
    this.stats.writes++;
    if (this.inkFade && this.ctx.ink && this.ctx.ink.setPaperFade) (this.ctx.ink.setPaperFade(0), this.ctx.ink.setPaperFocus && this.ctx.ink.setPaperFocus());
    this.inkFade = !1;
  }
}
