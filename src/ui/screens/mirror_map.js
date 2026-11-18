// 天机镜 · 地图 v2（模块 A）：一幅展开的手卷山水。
//   底图：进关卡时用正交俯视相机把关卡离屏渲染一次（简化：不走水墨后期），再在 canvas 上做一道"水墨化"——去饱和、乘宣纸色；
//         没去过的地方是留白宣纸，去过的地方墨色晕开显出山水（沿用"着墨"格子，柔边）。右上铜镜复用同一张底图。
//   图标：canvas 绘制（不每帧建 DOM），剪影意象图标（地图图标 v1 甲，docs/ui/v2/png/map_icons_compare.png）从小图集 drawImage 取图
//         （src/ui/icons.js iconForMap / atlasImage("map")；图集加载前退回文字印章）——主角朱箭头与本局行迹、撤离点、妖群（妖 / 精 + 护盾五行 → 斩）、首领、宝箱、采集物、
//         遗府、委托遗物（朱旗）、奇遇（缘）、遗落储物袋、玩家墨点；入夜画妖潮来向；地名竖排小楷。
//   交互：滚轮缩放、拖拽平移（默认以主角为中心）、悬停看名称与状态、右键插 / 拔墨点（最多 3 个，铜镜同步）、图例可收起。
import { GongfaMap } from "../gongfa_map.js";
import * as THREE from "three";
import { kit } from "../kit.js";
import { PHASES } from "../../game/run/regions.js";
import { RARITY } from "../../core/items.js";
import { iconForMap, mapIconStyle, atlasImage } from "../icons.js";
// 品级颜色一律读 RARITY（凡品 / 灵品 / 宝品 / 仙品 / 极品）：宝箱 普通 = 凡、夜明 = 宝、灵光 = 仙；采集 矿 = 凡、草 = 灵、灵光 = 仙
const Q_CHEST = { normal: 0, night: 2, glow: 3 };
const qc = (i) => RARITY[i].color;

const PAPER = [239, 233, 216];
const C = { ink: "#22272b", dan: "rgba(21,24,27,.42)", qing: "rgba(21,24,27,.22)", zhu: "#b8291a", gold: "#a8822c", blue: "#2f7fa8", green: "#3f8a5a", moon: "#8fa3ad", paper: "#f3eee1" };
const EL = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };
// 图例（剪影意象图标）
const LEGEND = [["gate", "古传送阵"], ["ruin", "残阵"], ["mob", "妖群"], ["elite", "精英"], ["boss", "首领"], ["tick", "已清 · 已采"], ["chest", "宝箱"], ["herb", "采集"], ["glow", "灵光点"], ["den", "遗府"], ["flag", "委托"], ["yuan", "奇遇"], ["lostbag", "遗落"], ["tide", "妖潮"], ["pin", "墨点"]];
const CSS = `
.mk-layer-bigmap { pointer-events: none; }
body.mk-map-open .mk-toasts { top: 74px; transform: translateX(-50%) scale(.85); } /* 手卷打开时提示挪到卷首留白处 */
.mk-bigmap2 { position: absolute; left: 50%; top: 50%; width: 980px; height: 580px; transform: translate(-50%, -50%) scale(var(--mk-scale, 1)); pointer-events: auto; }
.mk-bigmap2 .scroll { position: absolute; inset: 0; background: var(--ink-tex-paper), var(--ink-tex-fiber), var(--paper-hi); background-blend-mode: multiply; box-shadow: 0 10px 24px rgba(40,32,20,.35); }
.mk-bigmap2 .rod { position: absolute; top: -10px; bottom: -10px; width: 14px; border-radius: 6px; background: linear-gradient(90deg, #2b1d12, #6b4a2c 40%, #3a2a1c 70%, #22170e); box-shadow: 0 3px 6px rgba(0,0,0,.35); }
.mk-bigmap2 .rod.l { left: -10px; } .mk-bigmap2 .rod.r { right: -10px; }
.mk-bigmap2 canvas { position: absolute; left: 22px; top: 18px; width: 850px; height: 520px; cursor: grab; }
.mk-bigmap2 canvas.drag { cursor: grabbing; }
.mk-bigmap2 .nm { position: absolute; right: 30px; top: 26px; writing-mode: vertical-rl; font-size: 52px; color: var(--ink); }
.mk-bigmap2 .tod { position: absolute; right: 26px; top: 300px; writing-mode: vertical-rl; font: 15px var(--f-display); color: var(--ink-zhong); letter-spacing: .15em; }
.mk-bigmap2 .tod b { color: var(--zhu); font-weight: 400; }
.mk-bigmap2 .legend { position: absolute; left: 26px; bottom: 6px; font: 12px var(--f-kai); color: var(--ink-zhong); white-space: nowrap; }
.mk-bigmap2 .legend .t { cursor: pointer; color: var(--ink-nong); margin-right: 10px; }
.mk-bigmap2 .legend.off .items { display: none !important; }
.mk-bigmap2 .legend .li { display: inline-block; width: 16px; height: 16px; margin: 0 1px 0 6px; vertical-align: -4px; background-repeat: no-repeat; filter: drop-shadow(0 0 1px #f3eee1); }
.mk-bigmap2 .legend i { font-style: normal; display: inline-block; min-width: 16px; padding: 0 3px; margin: 0 2px 0 8px; text-align: center; font: 12px var(--f-display); border-radius: 2px; }
.mk-bigmap2 .help { position: absolute; left: 30px; top: 2px; font: 11px var(--f-ui); color: var(--ink-dan); }
.mk-bigmap2 .tipbox { position: absolute; left: 0; top: 0; padding: 5px 10px 6px; font: 13px var(--f-kai); color: var(--ink); background: var(--paper-hi); box-shadow: 0 3px 10px rgba(40,32,20,.25), 0 0 0 1px rgba(21,24,27,.12); border-radius: 3px; pointer-events: none; white-space: pre-line; max-width: 340px; max-height: 360px; overflow: hidden; display: none; }
`;

// 进关卡时渲染一次的山水底图（Canvas）
export function renderBase(ctx, map, b, W = 1024) {
  const { renderer, scene } = ctx;
  const w = b.x1 - b.x0, h = b.z1 - b.z0, H = Math.max(64, Math.round((W * h) / w));
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 800);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  cam.position.set(cx, 400, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 0, cz);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  // 只要地形与景物：主角、妖兽、掉落、天空、雾都先藏起来
  const hidden = [];
  const hide = (o) => o && o.visible && (hidden.push(o), (o.visible = !1));
  hide(ctx.player.root);
  for (const e of ctx.enemies.list) hide(e.root);
  for (const o of scene.children) if (["sky", "pickups", "markers", "fog-wall", "falls-mist", "gather-fx", "containers"].includes(o.name)) hide(o);
  scene.traverse((o) => {
    if (["sky", "markers", "fog-wall", "falls-mist"].includes(o.name)) hide(o);
    // 植被里不投影的小件 = 草丛、灌木、碎石（满屏碎点很脏）；竹、树冠、大石保留
    // （低画质关掉了植被投影：按原本是否投影 userData.vegCast 判断，见 src/render/quality.js）
    if (o.isMesh && !o.castShadow && !o.userData.vegCast && o.parent && o.parent.name === "vegetation") hide(o);
  });
  for (const m of map.run ? map.run.marks || [] : []) hide(m.group);
  const fog = scene.fog, bg = scene.background;
  scene.fog = null;
  scene.background = null;
  const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0); // 地图外留透明，后面做成柔边宣纸
  const rt = new THREE.WebGLRenderTarget(W, H, { format: THREE.RGBAFormat });
  const buf = new Uint8Array(W * H * 4);
  const prevRT = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(clear, clearA);
    rt.dispose();
    scene.fog = fog;
    scene.background = bg;
    for (const o of hidden) o.visible = !0;
  }
  // 水墨化：伽马、去饱和、乘宣纸色（崖壁暗处成墨，水面保留一点花青）
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d"), img = g.createImageData(W, H), d = img.data;
  // 先算亮度，用于勾勒：亮度变化大的地方（崖线、岸线、林缘）压一道淡墨，像皴笔勾出的轮廓
  const lum = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4; // 读出来是自下而上
      lum[y * W + x] = 0.3 * Math.pow(buf[si] / 255, 1 / 2.2) + 0.59 * Math.pow(buf[si + 1] / 255, 1 / 2.2) + 0.11 * Math.pow(buf[si + 2] / 255, 1 / 2.2);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4, i = y * W + x;
      let r = Math.pow(buf[si] / 255, 1 / 2.2), gg = Math.pow(buf[si + 1] / 255, 1 / 2.2), bb = Math.pow(buf[si + 2] / 255, 1 / 2.2);
      const L = lum[i];
      const water = bb > r + 0.06 && bb > gg;
      const sat = water ? 0.65 : 0.38; // 水面多留些花青
      r = L + (r - L) * sat;
      gg = L + (gg - L) * sat;
      bb = L + (bb - L) * sat;
      // 对比：浅处更白（留白），深处更墨
      // 低对比、偏亮：浅处几乎就是纸色（留白），深处只到淡墨
      const curve = (v) => Math.min(1, 0.25 + 0.85 * Math.pow(Math.max(0, v), 0.8));
      const e = x > 0 && x < W - 1 && y > 0 && y < H - 1 ? Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + W] - lum[i - W]) : 0;
      const edge = 1 - Math.min(0.32, e * 1.3); // 崖线、岸线一道淡墨
      const k = 0.62;
      d[di] = PAPER[0] * (1 - k + k * curve(r)) * edge;
      d[di + 1] = PAPER[1] * (1 - k + k * curve(gg)) * edge;
      d[di + 2] = PAPER[2] * (1 - k + k * curve(bb)) * edge;
      d[di + 3] = buf[si + 3]; // 地图外（没画到东西）透明
    }
  g.putImageData(img, 0, 0);
  return cv;
}

// 底图的覆盖范围（不透明处）做成柔边蒙版
function softAlpha(base, blur) {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const g = c.getContext("2d");
  g.filter = `blur(${blur}px)`;
  g.drawImage(base, blur, blur, base.width - 2 * blur, base.height - 2 * blur);
  return c;
}

export class MirrorMap {
  constructor(ctx, run) {
    kit.css("mirrormap", CSS);
    this.ctx = ctx;
    this.run = run;
    this.model = run.mapModel;
    this.gongfa = new GongfaMap(run);
    this.E = run.explored;
    this.b = this.E ? this.E.b : run.map.bounds;
    try {
      this.base = renderBase(ctx, { ...run.map, run }, this.b);
    } catch (e) {
      console.error("[map] 底图渲染失败，改用留白", e);
      this.base = null;
    }
    this.rev = document.createElement("canvas"); // 着墨后的底图（只在去过的地方显出山水）
    this.rev.width = this.base ? this.base.width : 512;
    this.rev.height = this.base ? this.base.height : 384;
    this.mask = document.createElement("canvas");
    this.revStamp = -1;
    this.open = !1;
    this.zoom = 1;
    this.center = null;
    this.icons = [];
    this.atlas = null;
    // 地图图标图集：只加载一次；加载完成后让大地图与铜镜各重画一次
    atlasImage("map").then((im) => ((this.atlas = im), (this.lastMirror = this.lastBig = null), this.mirrorCv && this.refresh()), () => {});
    this.buildDom();
  }
  // ---------------- 着墨揭示 ----------------
  updateReveal() {
    const E = this.E;
    if (!E || this.revStamp === E.stamp) return;
    this.revStamp = E.stamp;
    const m = this.mask;
    if (m.width !== E.w) (m.width = E.w), (m.height = E.h);
    const mg = m.getContext("2d"), img = mg.createImageData(E.w, E.h);
    for (let i = 0; i < E.cells.length; i++) if (E.cells[i]) img.data[i * 4 + 3] = 255;
    mg.putImageData(img, 0, 0);
    const R = this.rev, g = R.getContext("2d"), blur = Math.round(R.width / E.w);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, R.width, R.height);
    // 着墨格子：先缩进半格再晕开，四面都是柔边（画布边缘外按透明处理）
    g.filter = `blur(${blur * 1.4}px)`;
    g.drawImage(m, blur, blur, R.width - 2 * blur, R.height - 2 * blur);
    g.filter = "none";
    if (this.base) {
      if (!this.baseMask) this.baseMask = softAlpha(this.base, blur);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(this.baseMask, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.drawImage(this.base, 0, 0);
    } else {
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "rgba(92,100,92,.45)";
      g.fillRect(0, 0, R.width, R.height);
    }
    g.globalCompositeOperation = "source-over";
  }

  // ---------------- DOM（只建一次） ----------------
  buildDom() {
    const L = (this.L = kit.layer("bigmap", 26));
    kit.clear("bigmap");
    kit.show("bigmap", !1);
    const root = kit.el("div", "mk-bigmap2");
    root.innerHTML = `<div class="scroll"></div><i class="rod l"></i><i class="rod r"></i><canvas width="1700" height="1040"></canvas>
      <div class="nm ink-splash"></div><div class="tod"></div>
      <div class="legend"><span class="t">图例 ▾</span><span class="items mk-legend-icons">${LEGEND.map(([k, n]) => `<b class="li" style='${mapIconStyle(k)}'></b>${n}`).join(" ")}</span><span class="items mk-legend-text" style="display:none"><i style="color:#fff;background:${C.zhu}">撤</i>撤离 <i style="color:#fff;background:${C.gold}">阵</i>古传送阵 <i style="color:#fff;background:#5a6066">残</i>残阵
        <i style="color:${C.dan}">妖</i>妖群 <i style="color:#fff;background:${C.zhu}">精</i>精英 <i style="color:${C.ink}">斩</i>已清 <i style="color:${C.ink}">箱</i>宝箱 <i style="color:${C.green}">草</i>采集 <i style="color:#fff;background:${C.ink}">府</i>遗府
        <i style="color:${C.zhu}">旗</i>委托 <i style="color:${C.blue}">缘</i>奇遇 <i style="color:#fff;background:${C.zhu}">袋</i>遗落 <i style="color:${C.ink}">●</i>墨点</span></div>
      <div class="help">滚轮缩放 · 拖拽平移 · 右键插 / 拔墨点 · M 合上</div><div class="tipbox"></div>`;
    L.appendChild(root);
    this.root = root;
    this.cv = root.querySelector("canvas");
    this.tip = root.querySelector(".tipbox");
    root.querySelector(".nm").textContent = this.run.R.name;
    const leg = root.querySelector(".legend");
    leg.querySelector(".t").addEventListener("click", () => leg.classList.toggle("off"));
    const stop = (e) => e.stopPropagation();
    for (const ev of ["mousedown", "mouseup", "wheel", "contextmenu", "pointerdown"]) root.addEventListener(ev, stop);
    const cv = this.cv;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const before = this.screenToWorld(e);
      this.zoom = Math.max(0.6, Math.min(5, this.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      const after = this.screenToWorld(e);
      this.center.x += before.x - after.x;
      this.center.z += before.z - after.z;
      this.drawBig();
    }, { passive: !1 });
    cv.addEventListener("mousedown", (e) => {
      if (e.button === 0) (this.drag = { x: e.clientX, y: e.clientY, cx: this.center.x, cz: this.center.z }), cv.classList.add("drag");
      if (e.button === 2) {
        const w = this.screenToWorld(e);
        this.model.togglePin(w.x, w.z, 6 / this.zoom);
        this.drawBig();
      }
    });
    addEventListener("mouseup", (this._up = () => ((this.drag = null), cv.classList.remove("drag"))));
    cv.addEventListener("mousemove", (e) => {
      if (this.drag) {
        const s = this.scale();
        this.center.x = this.drag.cx - (e.clientX - this.drag.x) / s / this.cssK();
        this.center.z = this.drag.cz - (e.clientY - this.drag.y) / s / this.cssK();
        this.drawBig();
      } else this.hover(e);
    });
    cv.addEventListener("mouseleave", () => (this.tip.style.display = "none"));
  }
  cssK() {
    return this.cv.width / this.cv.getBoundingClientRect().width; // canvas 像素 / 屏幕像素
  }
  scale() {
    const b = this.b, W = this.cv.width, H = this.cv.height;
    return Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0)) * this.zoom;
  }
  screenToWorld(e) {
    const r = this.cv.getBoundingClientRect(), k = this.cssK(), s = this.scale();
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    return { x: this.center.x + (px - this.cv.width / 2) / s, z: this.center.z + (py - this.cv.height / 2) / s };
  }
  toggle(on = !this.open) {
    this.open = on;
    kit.show("bigmap", on);
    document.body.classList.toggle("mk-map-open", on);
    if (on) {
      const p = this.ctx.player.pos;
      this.center = { x: p.x, z: p.z }; // 默认以主角为中心
      this.zoom = 1.6;
      this.gongfa.invalidate();
      this.drawBig();
    } else this.tip.style.display = "none";
  }
  hover(e) {
    const r = this.cv.getBoundingClientRect(), k = this.cssK();
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    let best = null, bd = 22;
    for (const ic of this.icons) {
      const d = ic.gongfa && px >= ic.x0 && px <= ic.x0 + ic.w && py >= ic.y0 && py <= ic.y0 + ic.h ? 0 : Math.hypot(ic.x - px, ic.y - py);
      if (d < bd) (bd = d), (best = ic);
    }
    const t = this.tip;
    if (!best) return (t.style.display = "none");
    t.textContent = best.tip;
    t.style.display = "block";
    t.style.transform = `translate(${(e.clientX - this.root.getBoundingClientRect().left) / (this.root.getBoundingClientRect().width / 980) + 14}px, ${(e.clientY - this.root.getBoundingClientRect().top) / (this.root.getBoundingClientRect().height / 580) + 10}px)`;
  }

  // ---------------- 绘制 ----------------
  // 大地图（手卷）
  sig(extra) {
    const r = this.run, p = this.ctx.player.pos, f = this.ctx.player.facing || { x: 0, z: 0 };
    return [Math.round(p.x * 2), Math.round(p.z * 2), Math.round(Math.atan2(f.z, f.x) * 8), this.model.ver, this.E && this.E.stamp, r.phase, r.channel ? Math.floor(performance.now() / 120) : 0, r.extracts.length, !!r.lostBagMark, extra].join("|");
  }
  // 节流调用：签名不变就不重画（底图只在进关卡时渲染一次；着墨揭示只在新格子着墨时重合成）
  refresh() {
    const s = this.sig("m");
    if (s !== this.lastMirror) (this.lastMirror = s), this.drawMirror(this.mirrorCv);
    if (this.open) {
      const b = this.sig(`${this.gongfa.ver}|${this.run.profile.flags.gongfaMapTag}|${this.zoom}|${this.center && this.center.x}|${this.center && this.center.z}`);
      if (b !== this.lastBig) (this.lastBig = b), this.drawBig();
    }
  }
  drawBig() {
    if (!this.open) return;
    this.updateReveal();
    const cv = this.cv, g = cv.getContext("2d"), W = cv.width, H = cv.height, s = this.scale();
    const X = (x) => W / 2 + (x - this.center.x) * s, Z = (z) => H / 2 + (z - this.center.z) * s;
    g.clearRect(0, 0, W, H);
    const b = this.b;
    g.imageSmoothingEnabled = !0;
    g.drawImage(this.rev, X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    this.icons = [];
    this.drawIcons(g, X, Z, s, !0);
    this.gongfa.draw(g, X, Z, this.icons);
    const r = this.run, P = PHASES[r.phase] || PHASES[0];
    const tod = r.region === "tutorial" ? "序章" : `${P.name} · 灵潮 <b>×${(P.tide || 1).toFixed(1)}</b>`;
    if (this._tod !== tod) (this._tod = tod), (this.root.querySelector(".tod").innerHTML = tod); // 只在变化时改 DOM
  }
  // 铜镜（以主角为中心，半径约 45 米）
  drawMirror(cv) {
    this.updateReveal();
    const g = cv.getContext("2d"), W = cv.width, H = cv.height, p = this.ctx.player.pos, s = W / 90;
    const X = (x) => W / 2 + (x - p.x) * s, Z = (z) => H / 2 + (z - p.z) * s;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#f2ecdd";
    g.fillRect(0, 0, W, H);
    const b = this.b;
    g.drawImage(this.rev, X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    this.drawIcons(g, X, Z, s, !1);
  }

  drawIcons(g, X, Z, s, big) {
    const r = this.run, M = this.model, pts = r.map.points, k = big ? 1.7 : 1.25;
    const icon = (x, z, tip) => big && this.icons.push({ x: X(x), y: Z(z), tip });
    const seal = (x, z, ch, bg, size = 26, fg = "#f5f0e3", alpha = 1) => {
      size *= k;
      g.save();
      g.globalAlpha = alpha;
      g.translate(X(x), Z(z));
      g.rotate(-0.06);
      // 纸色外晕：压在底图上更清楚
      g.fillStyle = "rgba(245,240,227,.92)";
      g.shadowColor = "rgba(245,240,227,1)";
      g.shadowBlur = size * 0.45;
      g.beginPath();
      g.roundRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6, 6);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(-size / 2, -size / 2, size, size, 4);
      g.fill();
      g.fillStyle = fg;
      g.font = `${Math.round(size * (ch.length > 1 ? 0.4 : 0.64))}px MaShanZheng, ${kit.KAI}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (ch.length > 1) (g.fillText(ch[0], 0, -size * 0.2), g.fillText(ch[1], 0, size * 0.22));
      else g.fillText(ch, 0, 1);
      g.restore();
    };
    const word = (x, z, ch, color, size = 22, alpha = 1) => {
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.font = `${Math.round(size * k)}px MaShanZheng, ${kit.KAI}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(243,238,225,1)";
      g.shadowBlur = 6;
      g.fillText(ch, X(x), Z(z));
      g.fillText(ch, X(x), Z(z)); // 两遍：纸色外晕更实
      g.restore();
    };
    // 图集图标：kind / state 见 icons.js iconForMap；o.alpha 额外透明度、o.over 覆盖叠加（null = 不叠）、o.rot 旋转
    const A = this.atlas;
    const mi = (kind, state, x, z, size, o = {}) => {
      if (!A) return !1;
      const ic = iconForMap(kind, state);
      if (!ic) return !1;
      const sz = size * k, cx = X(x), cy = Z(z), a0 = o.alpha ?? 1;
      g.save();
      g.globalAlpha = a0 * ic.alpha;
      g.shadowColor = "rgba(243,238,225,1)"; // 纸色外晕：压在墨色底图上也清楚
      g.shadowBlur = Math.max(3, sz * 0.16);
      if (o.rot != null) {
        g.translate(cx, cy);
        g.rotate(o.rot);
        g.drawImage(A, ic.x, ic.y, ic.w, ic.h, -sz / 2, -sz / 2, sz, sz);
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else g.drawImage(A, ic.x, ic.y, ic.w, ic.h, cx - sz / 2, cy - sz / 2, sz, sz);
      const ov = o.over !== undefined ? o.over && iconForMap(o.over) : ic.over;
      if (ov) {
        g.globalAlpha = a0;
        const os = sz * 0.62;
        g.drawImage(A, ov.x, ov.y, ov.w, ov.h, cx + sz * 0.12, cy + sz * 0.02, os, os);
      }
      g.restore();
      return !0;
    };
    const tick = (x, z, off = 12) => {
      g.save();
      g.strokeStyle = C.green;
      g.lineWidth = 2.4;
      g.beginPath();
      const cx = X(x) + off * k, cy = Z(z) - off * k;
      g.moveTo(cx - 5, cy);
      g.lineTo(cx - 1, cy + 4);
      g.lineTo(cx + 7, cy - 6);
      g.stroke();
      g.restore();
    };
    // 地名（竖排小楷）：本局着墨到或旧日所见
    if (big)
      for (const l of pts.landmarks || []) {
        const seen = M.now.landmarks.has(l.name), old = M.old.landmarks.has(l.name);
        if (!seen && !old) continue;
        g.save();
        g.globalAlpha = seen ? 0.9 : 0.45;
        g.fillStyle = C.ink;
        const fs = Math.round(19 * k);
        g.font = `${fs}px MaShanZheng, ${kit.KAI}`;
        g.textAlign = "center";
        g.textBaseline = "top";
        g.shadowColor = "rgba(243,238,225,1)";
        g.shadowBlur = 8;
        const chars = [...l.name.replace(/[·・].*$/, "")];
        const x0 = X(l.pos.x) + 30, y0 = Z(l.pos.z) - (chars.length * fs * 1.05) / 2;
        for (let pass = 0; pass < 2; pass++) chars.forEach((ch, i) => g.fillText(ch, x0, y0 + i * fs * 1.05));
        g.restore();
      }
    // 本局行迹（淡墨虚线）
    if (big && M.trail.length > 1) {
      g.save();
      g.strokeStyle = "rgba(21,24,27,.35)";
      g.lineWidth = 2;
      g.setLineDash([5, 7]);
      g.beginPath();
      M.trail.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.lineTo(X(this.ctx.player.pos.x), Z(this.ctx.player.pos.z));
      g.stroke();
      g.restore();
    }
    // 采集物 / 宝箱 / 奇遇（只在大地图；铜镜里只画宝箱）
    for (const t of M.things.values()) {
      const a = t.done ? 0.35 : 1;
      if (t.kind === "chest") {
        const col = qc(Q_CHEST[t.tier] ?? 0);
        const st = t.state || "closed";
        const kind = t.tier === "night" ? "chest_night" : t.tier === "glow" ? "chest_glow" : "chest";
        if (!mi(kind, st === "closed" ? null : st, t.pos.x, t.pos.z, 22)) {
          word(t.pos.x, t.pos.z, "箱", col, 20, st === "empty" ? 0.35 : st === "closed" ? 1 : 0.7);
          if (st === "empty") tick(t.pos.x, t.pos.z, 10);
        }
        icon(t.pos.x, t.pos.z, `${t.label}${{ closed: "", opened: " · 已开 · 未搜", searched: " · 已搜", empty: " · 取空" }[st]}`);
      } else if (big && t.kind === "gather") {
        const ch = t.glow ? "灵" : /矿|石|精/.test(t.label) ? "矿" : "草";
        const kind = t.glow ? "glow" : /土|壤/.test(t.label) ? "soil" : ch === "矿" ? "ore" : "herb";
        if (!mi(kind, t.done ? "done" : null, t.pos.x, t.pos.z, 20)) word(t.pos.x, t.pos.z, ch, qc(t.glow ? 3 : t.ore || ch === "矿" ? 0 : 1), 18, t.done ? 0.3 : 0.9);
        icon(t.pos.x, t.pos.z, `${t.label}${t.done ? " · 已采" : ""}`);
      }
    }
    // 奇遇（模块 E 的 quests.mapPoints()；遇到过的）
    if (big)
      for (const q of M.encs.values()) {
        if (!mi("yuan", q.done ? "done" : null, q.pos.x, q.pos.z, 22)) word(q.pos.x, q.pos.z, q.glyph || "缘", C.blue, 20, q.done ? 0.45 : 1);
        icon(q.pos.x, q.pos.z, `${q.label || "奇遇"}${q.done ? " · 已了" : ""}`);
      }
    // 遗府 / 地窖
    for (const d of pts.ruins || []) {
      const now = M.now.dens.has(d.id), old = M.old.dens.has(d.id);
      if (!now && !old) continue;
      const cleared = r.profile.flags && (r.profile.flags["den_" + d.id] || r.profile.flags[d.id + "_cleared"]);
      if (!mi("den", null, d.pos.x, d.pos.z, 24, { alpha: now ? 0.95 : 0.45, over: cleared ? "tick" : null })) {
        seal(d.pos.x, d.pos.z, "府", C.ink, 24, "#f5f0e3", now ? 0.9 : 0.4);
        if (cleared) tick(d.pos.x, d.pos.z);
      }
      icon(d.pos.x, d.pos.z, `${d.name || "遗府"}${now ? "" : " · 旧日所见"}${cleared ? " · 已首通" : ""}`);
    }
    // 首领
    const bp = pts.boss;
    if (bp && bp.pos && (M.now.boss || M.old.boss)) {
      const dead = M.bossDead();
      if (!mi(dead ? "boss_dead" : "boss", dead ? "slain" : null, bp.pos.x, bp.pos.z, 34, { alpha: M.now.boss ? 1 : 0.5 })) {
        seal(bp.pos.x, bp.pos.z, (bp.name || "妖王").slice(0, 2), dead ? C.ink : C.zhu, 34, "#f5f0e3", M.now.boss ? 1 : 0.45);
        if (dead) word(bp.pos.x + 14 / s, bp.pos.z + 14 / s, "斩", C.ink, 20);
      }
      icon(bp.pos.x, bp.pos.z, `${bp.name || "首领"}${dead ? " · 已斩" : M.now.boss ? "" : " · 旧日所见"}`);
    }
    // 妖群
    for (const gp of M.groups.values()) {
      if (gp.boss) continue;
      if (gp.cleared) {
        const gone = !gp.loot || gp.loot === "none" || gp.loot === "empty"; // 遗骸取空才打勾
        if (!mi(gp.elite ? "elite" : "mob", "cleared", gp.pos.x, gp.pos.z, gp.elite ? 24 : 20, { over: gone ? "tick" : null })) {
          word(gp.pos.x, gp.pos.z, "斩", C.dan, gp.elite ? 22 : 18, 0.8);
          if (gone) tick(gp.pos.x, gp.pos.z, 10);
        }
        icon(gp.pos.x, gp.pos.z, `${gp.name || "妖群"} · 已清${{ unsearched: " · 遗骸未搜", searched: " · 遗骸已搜", empty: " · 遗骸取空" }[gp.loot] || ""}`);
        continue;
      }
      if (gp.elite) {
        // 先画护盾五行环，再画妖面
        if (gp.shield && A) mi("shield_" + gp.shield, null, gp.pos.x, gp.pos.z, 34);
        if (!mi("elite", null, gp.pos.x, gp.pos.z, 24)) {
          seal(gp.pos.x, gp.pos.z, "精", C.zhu, 22);
          if (gp.shield) word(gp.pos.x, gp.pos.z + 18 / s, EL[gp.shield] || "", C.zhu, 13);
        }
        if (gp.patrol && gp.dir && gp.dir.lengthSq() > 0.01) {
          const d = gp.dir.clone().normalize();
          g.save();
          g.strokeStyle = C.zhu;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(X(gp.pos.x) + d.x * 14, Z(gp.pos.z) + d.z * 14);
          g.lineTo(X(gp.pos.x) + d.x * 28, Z(gp.pos.z) + d.z * 28);
          g.stroke();
          g.restore();
        }
      } else if (!mi("mob", null, gp.pos.x, gp.pos.z, 20)) word(gp.pos.x, gp.pos.z, "妖", C.dan, 18);
      icon(gp.pos.x, gp.pos.z, `${gp.name || "妖群"}${gp.shield ? ` · ${EL[gp.shield]}盾` : ""}${gp.patrol ? " · 巡游（最后所见）" : ""} · 未清`);
    }
    // 委托遗物（朱旗）
    const Q = r.quests;
    for (const q of (Q && Q.active) || []) {
      if (!q.target || q.got) continue;
      const x = X(q.target.pos.x), y = Z(q.target.pos.z);
      if (mi("flag", null, q.target.pos.x, q.target.pos.z, 22)) {
        icon(q.target.pos.x, q.target.pos.z, `委托 · ${q.title || q.name || ""}`);
        continue;
      }
      g.save();
      g.strokeStyle = C.ink;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, y + 9);
      g.lineTo(x, y - 12);
      g.stroke();
      g.fillStyle = C.zhu;
      g.beginPath();
      g.moveTo(x, y - 12);
      g.lineTo(x + 13, y - 8);
      g.lineTo(x, y - 3);
      g.fill();
      g.restore();
      icon(q.target.pos.x, q.target.pos.z, `委托 · ${q.title || q.name || ""}`);
    }
    // 撤离点
    const blink = r.channel ? 0.55 + 0.45 * Math.sin(performance.now() / 120) : 1;
    for (const x of r.extracts) {
      if (!x.known) continue;
      const old = x.kind === "gate" && M.old.gates.has(x.id) && Math.hypot(x.pos.x - this.ctx.player.pos.x, x.pos.z - this.ctx.player.pos.z) > 18 && !x.seenNow;
      if (!old) x.seenNow = !0;
      const a = (r.channel && r.channel.ext === x ? blink : 1) * (old ? 0.45 : 1);
      if (mi(x.kind === "gate" ? "gate" : x.kind === "cave" ? "cave" : x.kind === "boss" ? "boss_exit" : x.confirmed ? "ruin_true" : "ruin", null, x.pos.x, x.pos.z, 28, { alpha: a }));
      else if (x.kind === "gate") seal(x.pos.x, x.pos.z, "阵", C.gold, 26, "#f5f0e3", a);
      else if (x.kind === "cave") seal(x.pos.x, x.pos.z, "府", C.gold, 26, "#f5f0e3", a);
      else if (x.kind === "boss") seal(x.pos.x, x.pos.z, "出", C.gold, 26, "#f5f0e3", a);
      else {
        seal(x.pos.x, x.pos.z, "残", "#5a6066", 24, "#f5f0e3", a);
        word(x.pos.x, x.pos.z + 19 / s, x.confirmed ? "真" : "？", x.confirmed ? C.blue : C.ink, 13);
      }
      icon(x.pos.x, x.pos.z, `${x.kind === "ruin" ? (x.confirmed ? "残阵 · 真" : "未明残阵") : x.name || "撤离点"}${x.locked ? " · 封着" : ""}${old ? " · 旧日所见" : ""}${r.channel && r.channel.ext === x ? " · 读条中" : ""}`);
    }
    for (const f of M.fakes) {
      if (!mi("ruin_fake", null, f.pos.x, f.pos.z, 26, { alpha: 0.6 })) {
        seal(f.pos.x, f.pos.z, "残", "#5a6066", 24, "#f5f0e3", 0.5);
        word(f.pos.x, f.pos.z + 19 / s, "假", C.zhu, 13);
      }
      icon(f.pos.x, f.pos.z, "残阵 · 假阵");
    }
    // 遗落储物袋
    if (r.lostBagMark) {
      if (!mi("lostbag", null, r.lostBagMark.pos.x, r.lostBagMark.pos.z, 24)) seal(r.lostBagMark.pos.x, r.lostBagMark.pos.z, "袋", C.zhu, 24);
      icon(r.lostBagMark.pos.x, r.lostBagMark.pos.z, "遗落的储物袋");
    }
    // 入夜：妖潮来向（离主角最近、14 米外的潮点）画一笔朱箭头与"潮"
    if (r.phase === 3 && r.region !== "tutorial") {
      const hp = this.ctx.player.pos;
      const from = (pts.night || []).filter((q) => q.pos.distanceTo(hp) > 14).sort((a, b) => a.pos.distanceTo(hp) - b.pos.distanceTo(hp))[0];
      if (from) {
        const dx = hp.x - from.pos.x, dz = hp.z - from.pos.z, L = Math.hypot(dx, dz) || 1;
        const x0 = X(from.pos.x), y0 = Z(from.pos.z), x1 = x0 + (dx / L) * 46, y1 = y0 + (dz / L) * 46;
        g.save();
        g.strokeStyle = C.zhu;
        g.fillStyle = C.zhu;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        const a = Math.atan2(y1 - y0, x1 - x0);
        g.beginPath();
        g.moveTo(x1 + Math.cos(a) * 10, y1 + Math.sin(a) * 10);
        g.lineTo(x1 + Math.cos(a + 2.4) * 10, y1 + Math.sin(a + 2.4) * 10);
        g.lineTo(x1 + Math.cos(a - 2.4) * 10, y1 + Math.sin(a - 2.4) * 10);
        g.fill();
        g.restore();
        if (!mi("tide", null, from.pos.x, from.pos.z - 18 / s, 24)) word(from.pos.x, from.pos.z - 16 / s, "潮", C.zhu, 22);
        icon(from.pos.x, from.pos.z, "妖潮来向");
      }
    }
    // 玩家墨点
    M.pins.forEach((q, i) => {
      g.save();
      g.fillStyle = C.ink;
      g.beginPath();
      g.arc(X(q.x), Z(q.z), 6.5 * k, 0, 7);
      g.fill();
      g.fillStyle = "#f5f0e3";
      g.font = `bold ${Math.round(9 * k)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(i + 1), X(q.x), Z(q.z) + 0.5);
      g.restore();
      icon(q.x, q.z, `墨点 ${i + 1}（右键拔掉）`);
    });
    // 林墨：朱色箭头
    const p = this.ctx.player.pos, f = this.ctx.player.facing || { x: 0, z: -1 };
    if (mi("player", null, p.x, p.z, big ? 24 : 26, { rot: Math.atan2(f.z, f.x) + Math.PI / 2 })) return; // 图标朝上（-z），转到面朝方向
    g.save();
    g.translate(X(p.x), Z(p.z));
    g.rotate(Math.atan2(f.z, f.x));
    g.fillStyle = "#c0301c";
    const kk = big ? 1.4 : 1.6;
    g.beginPath();
    g.moveTo(12 * kk, 0);
    g.lineTo(-8 * kk, 8 * kk);
    g.lineTo(-3 * kk, 0);
    g.lineTo(-8 * kk, -8 * kk);
    g.closePath();
    g.fill();
    g.restore();
  }
  dispose() {
    this.gongfa.dispose();
    removeEventListener("mouseup", this._up);
    document.body.classList.remove("mk-map-open");
    kit.clear("bigmap");
    kit.show("bigmap", !1);
  }
}
