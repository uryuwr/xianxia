// 气势（势）HUD：左上气血 / 真气下面的一笔墨痕 + 主角脚下的一圈墨韵（满势时）。设计见 docs/战斗_气势与身法_v1.md。
//   - 墨痕：按 player.momentum / momentumMax 露出（只改 CSS 变量 --v）；中间一道淡墨刻度 = 50（可放）；≥ 50 墨痕尾端泛淡金；
//     满 = 势成：墨转泥金、泛金晕，钤一方小朱印"势成"（UI 体检 v1：条身不再转朱，朱只留给气血与危险）（势成锁定，不流失，直到右键放出）
//   - 气势不足时按右键：墨痕抖一下、泛朱（光标旁"势未成"由 targeting 模块的光标提示）
//   - 《连环》层数：墨痕右侧一排朱点
//   - 脚下墨韵：满势时在主角脚下画一笔泥金圆相（3D，贴地、缓慢转动、呼吸），蓄势斩放出后收起
//   - 蓄势斩出伤：墨痕"泼墨"一闪，主角上方落一个朱色"斩"字
// 由 src/ui/hud.js 创建（挂在 #hud 里，随 #hud 一起只在出行局显示）。读 ctx.player，订阅 ctx.world.events。
import * as THREE from "three";

const CSS = `
#hud .mom { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; }
#hud .mom .lbl { width: 2.4em; font-size: 20px; font-weight: 900; letter-spacing: .1em; text-shadow: 0 0 4px rgba(245,240,227,.95), 0 0 8px rgba(245,240,227,.8); }
/* UI 体检 v1 方向甲：气势 = 墨、比气血 / 真气细一档（11px），满势转泥金（朱只留给气血与危险） */
#hud .mom .mb { position: relative; width: 240px; height: 11px; transition: filter .3s; }
#hud .mom .mb::before, #hud .mom .mb > i { content: ""; position: absolute; inset: 0;
  -webkit-mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
#hud .mom .mb::before { background: rgba(21,24,27,.17); }
#hud .mom .mb > i { --v: 0; background: linear-gradient(90deg, #2b2e31, #15181b 80%); clip-path: inset(0 calc((1 - var(--v)) * 100%) 0 0); transition: clip-path .12s linear, background .25s; }
#hud .mom.full .mb { filter: drop-shadow(0 0 4px rgba(224,180,90,.95)) drop-shadow(0 0 9px rgba(224,180,90,.55)); animation: momGlow 1.1s ease-in-out infinite; }
#hud .mom.full .mb > i { background: linear-gradient(90deg, #2b2e31, #6e5214 45%, #b8923a); }
#hud .mom .seal { position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font: 15px var(--f-display, "STKaiti", "KaiTi", serif); color: #f5f0e3;
  opacity: 0; transform: scale(1.6) rotate(-14deg); transition: opacity .18s, transform .22s cubic-bezier(.3,1.6,.5,1); }
#hud .mom .seal::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #b8291a;
  -webkit-mask: var(--ink-seal-sq, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
#hud .mom .seal { isolation: isolate; }
#hud .mom.full .seal { opacity: 1; transform: scale(1) rotate(-6deg); }
#hud .mom .chain { display: flex; gap: 3px; min-width: 0; }
#hud .mom .chain b { width: 6px; height: 6px; border-radius: 50%; background: #b8291a; box-shadow: 0 0 0 1.5px rgba(236,230,214,.8); }
#hud .mom.spent .mb { animation: momSpent .45s ease-out; }
#hud .mom .mb > b { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: rgba(21,24,27,.35); border-radius: 1px; }
#hud .mom.ready:not(.full) .mb > i { background: linear-gradient(90deg, #2b2e31, #15181b 55%, #8a6a22); }
#hud .mom.deny .mb { animation: momDeny .32s ease-out; }
#hud .mom.deny .mb > i { background: linear-gradient(90deg, #6a2a20, #b8291a); }
#hud .mom .seal { width: 30px; height: 22px; font-size: 13px; letter-spacing: -1px; }
@keyframes momDeny { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 60% { transform: translateX(4px); } }
@keyframes momGlow { 50% { filter: drop-shadow(0 0 6px rgba(224,180,90,1)) drop-shadow(0 0 14px rgba(210,50,30,.45)); } }
@keyframes momSpent { 0% { filter: drop-shadow(0 0 10px rgba(210,50,30,1)); transform: scaleY(1.8); } 100% { filter: none; transform: none; } }
#mom-pop { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 40; font: 400 76px "ZhiMangXing", "MaShanZheng", "STKaiti", "KaiTi", serif; color: #b8291a;
  text-shadow: 0 0 4px #f4f1e8, 0 0 14px rgba(244,241,232,.9); opacity: 0; will-change: transform, opacity; }
`;

// 脚下墨韵：一笔不闭合的泥金圆相（起笔重、收笔出锋、带飞白）
const RING_FRAG = /* glsl */ `
uniform float uT, uA; uniform vec3 uColor;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float a = atan(p.y, p.x) / 6.28318 + 0.5;               // 0..1 沿圆周
  float u = fract(a + uT * 0.12);                           // 缓慢转动
  if (u > 0.9) discard;                                     // 留缺口
  float w = mix(0.11, 0.025, u / 0.9);                      // 起笔重、收笔细
  float band = smoothstep(w, w * 0.4, abs(r - 0.86));
  float dry = step(0.3, h(vec2(floor(u * 60.0), floor(r * 24.0))));
  float al = band * mix(0.45, 1.0, dry) * uA;
  if (al < 0.02) discard;
  gl_FragColor = vec4(uColor, al);
}`;
const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

let styled = !1;
const _v = new THREE.Vector3();

export class MomentumUI {
  constructor(ctx, hudEl) {
    this.ctx = ctx;
    if (!styled) {
      styled = !0;
      const st = document.createElement("style");
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const row = (this.el = document.createElement("div"));
    row.className = "row mom";
    row.innerHTML = `<span class="lbl">气势</span><div class="mb"><i></i><b></b></div><span class="seal">势成</span><span class="chain"></span>`;
    const dash = hudEl.querySelector(".dash");
    hudEl.insertBefore(row, dash || null);
    this.fill = row.querySelector(".mb > i");
    this.chainEl = row.querySelector(".chain");
    this.pop = document.createElement("div");
    this.pop.id = "mom-pop";
    this.pop.textContent = "斩";
    document.body.appendChild(this.pop);
    this.last = {};
    this.t = 0;
    // 脚下墨韵
    const mat = (this.ringMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: RING_FRAG, transparent: !0, depthWrite: !1,
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uColor: { value: new THREE.Color(0xc99a3a) } },
    }));
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), mat);
    this.ring.renderOrder = 23;
    this.ring.visible = !1;
    ctx.scene.add(this.ring);
    this.ringA = 0;
    ctx.world.events.on("player:charge", (e) => this.onCharge(e));
    ctx.world.events.on("player:chargeDenied", () => {
      const el = this.el;
      el.classList.remove("deny");
      void el.offsetWidth;
      el.classList.add("deny");
      clearTimeout(this._denyTO);
      this._denyTO = setTimeout(() => el.classList.remove("deny"), 380);
    });
  }
  onCharge(e) {
    const el = this.el;
    el.classList.remove("spent");
    void el.offsetWidth;
    el.classList.add("spent");
    if (e && e.full === !1) return; // 半势：没有"斩"字
    // 主角上方落一个朱色"斩"字（屏幕投影，不进 3D）
    const p = this.ctx.player, cam = this.ctx.camera;
    if (!p || !cam) return;
    _v.set(p.pos.x + p.facing.x * 1.6, p.pos.y + 2.3, p.pos.z + p.facing.z * 1.6).project(cam);
    const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
    const s = this.pop.style;
    s.transition = "none";
    s.opacity = "1";
    s.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1.5) rotate(-8deg)`;
    void this.pop.offsetWidth;
    s.transition = "transform .55s cubic-bezier(.2,.9,.3,1), opacity .55s ease-in .2s";
    s.transform = `translate(${x}px, ${y - 36}px) translate(-50%, -50%) scale(1) rotate(-4deg)`;
    s.opacity = "0";
  }
  update() {
    const p = this.ctx.player;
    if (!p || p.momentum === undefined) return;
    const dt = 1 / 60;
    this.t += dt;
    const v = Math.max(0, Math.min(1, p.momentum / (p.momentumMax || 100)));
    const vk = Math.round(v * 200) / 200;
    if (this.last.v !== vk) (this.last.v = vk), this.fill.style.setProperty("--v", vk.toFixed(3));
    const full = !!p.momentumFull, ready = v >= 0.5;
    if (this.last.ready !== ready) (this.last.ready = ready), this.el.classList.toggle("ready", ready);
    if (this.last.full !== full) (this.last.full = full), this.el.classList.toggle("full", full);
    const ch = p.chainStacks || 0;
    if (this.last.ch !== ch) (this.last.ch = ch), (this.chainEl.innerHTML = "<b></b>".repeat(ch));
    // 脚下墨韵：满势渐显，放出后渐隐
    const want = full && p.state !== "dead" && document.body.classList.contains("mk-in-run") ? 1 : 0;
    this.ringA += (want - this.ringA) * (want ? 0.12 : 0.25);
    const on = this.ringA > 0.02;
    this.ring.visible = on;
    if (on) {
      this.ring.position.set(p.pos.x, p.pos.y + 0.07, p.pos.z);
      this.ringMat.uniforms.uT.value = this.t;
      this.ringMat.uniforms.uA.value = this.ringA * (0.75 + 0.25 * Math.sin(this.t * 5));
      this.ring.scale.setScalar(1 + 0.04 * Math.sin(this.t * 5));
    }
  }
}
