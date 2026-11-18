// 敌人血条：受伤后在头顶显示一道墨笔血条，数秒无伤害后淡出；精英常驻（交战中）。首领用顶部长卷（src/ui/boss/），这里不画。
// 样式按 UI 体检 v1 方向（敌墨我朱、纸色笔带衬底、精英朱"精"印、境界标签 重墨 / 赭 / 朱）。
// 屏幕投影的 DOM（轻量，不进 3D 场景）。
import * as THREE from "three";

const CSS = `
.jx-ebars { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: "STKaiti","KaiTi","楷体",serif; }
.jx-ebar { position: absolute; transform: translate(-50%, -100%); transition: opacity .35s; }
/* UI 体检 v1（docs/ui/v3/体检_v1/e_shijie.html，2026-11-18 用户定）：敌人的命用墨（与首领条一致），朱只留给"你的命"和危险——掉血余迹朱；
   一笔墨条（--ink-stroke-bar）+ 纸色笔带衬底（深色线 + 外侧一圈纸色的双层结构）；精英去掉紫色，条左一方朱"精"印；
   境界标签 平 / 高一层 / 高一境 = 重墨 / 赭 / 朱，名牌下一道纸色笔带 */
.jx-ebar .name { position: relative; isolation: isolate; padding: 0 6px; text-align: center; color: #15181b; font: 700 13px var(--f-kai, "KaiTi", "STKaiti", serif); letter-spacing: 1px;
  white-space: nowrap; margin-bottom: 2px; text-shadow: 0 0 2px #f5f0e3, 0 0 4px #f5f0e3, 0 0 7px rgba(245,240,227,.9); }
.jx-ebar .name::before { content: ""; position: absolute; inset: -4px -16px -3px; z-index: -1;
  background: radial-gradient(farthest-side, rgba(245,240,227,.86) 55%, rgba(245,240,227,.5) 80%, rgba(245,240,227,0)); } /* 名牌纸色晕：用无飞白的椭圆，境界字不落在笔尾的丝缕上 */
.jx-ebar.elite .name { font-size: 15px; letter-spacing: 2px; }
.jx-ebar .name .rl { margin-left: 3px; font-weight: 700; color: rgba(21,24,27,.72); }
.jx-ebar .name .rl.warn { color: #8a5a22; }
.jx-ebar .name .rl.danger { color: #b8291a; font-weight: 900; }
.jx-ebar .bg { position: relative; width: 58px; height: 9px; margin: 0 auto; isolation: isolate; }
.jx-ebar.elite .bg { width: 116px; height: 12px; }
.jx-ebar .bg::before { content: ""; position: absolute; inset: -4px -6px; z-index: -1; background: rgba(245,240,227,.88);
  -webkit-mask: var(--ink-stroke-band, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-band, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
.jx-ebar .bm { position: absolute; inset: 0; overflow: hidden; background: rgba(21,24,27,.18);
  -webkit-mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-bar, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
.jx-ebar .lag { position: absolute; inset: 0; background: rgba(184,41,26,.55); transform-origin: left; transition: transform .45s ease-out .12s; }
.jx-ebar .fill { position: absolute; inset: 0; background: linear-gradient(#2a2d31, #121417); transform-origin: left; transition: transform .08s; }
.jx-ebar .seal { display: none; position: absolute; left: -27px; top: 50%; margin-top: -10px; width: 20px; height: 20px; place-items: center; font: 13px var(--f-display, "KaiTi", serif); line-height: 1;
  color: #f5f0e3; background: #b8291a; transform: rotate(-5deg);
  -webkit-mask: var(--ink-seal-sq, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-seal-sq, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
.jx-ebar.elite .seal { display: grid; }
/* 五行护盾：气血条上方一笔细条（技能栏五行色）+ 右端五行字圆点（提示该用哪种五行破盾） */
.jx-ebar .sh { position: relative; width: 64px; height: 6px; margin: 0 auto 3px; display: none; }
.jx-ebar.elite .sh { width: 116px; }
.jx-ebar .sh::before { content: ""; position: absolute; inset: -2px -3px; background: rgba(245,240,227,.85);
  -webkit-mask: var(--ink-stroke-thin, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
.jx-ebar .sh .sm { position: absolute; inset: 0; overflow: hidden;
  -webkit-mask: var(--ink-stroke-thin, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; mask: var(--ink-stroke-thin, linear-gradient(#000, #000)) 0 0 / 100% 100% no-repeat; }
.jx-ebar .sh i { position: absolute; inset: 0; transform-origin: left; background: var(--shc, #b8923a); transition: transform .1s; }
.jx-ebar .el { display: none; position: absolute; right: -24px; top: -7px; width: 18px; height: 18px; border-radius: 50%; place-items: center; font: 12px var(--f-display, "KaiTi", serif); line-height: 1;
  color: #f5f0e3; background: var(--shc, #b8923a); box-shadow: 0 0 0 2px rgba(245,240,227,.9); }
.jx-ebar.shielded .sh { display: block; }
.jx-ebar.shielded .el { display: grid; }
.jx-gap { position: absolute; transform: translate(-50%, -100%); color: #d6ad48; font-size: 28px; font-weight: 900; opacity: 0;
  text-shadow: 0 0 4px rgba(244,241,232,.9), 0 0 9px rgba(244,241,232,.7); transition: opacity .25s; letter-spacing: 1px; }
`;
// 五行护盾色 = 技能栏五行色（src/ui/loadout.js 的 EL，UI 本项目约定；这里不 import 整个装配界面）
const SH_C = { metal: "#9a7d34", wood: "#3f9a6e", water: "#2f7fa8", fire: "#b8291a", earth: "#9a6a32" };

export class HpBars {
  constructor(ctx) {
    this.ctx = ctx;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement("div");
    this.el.className = "jx-ebars";
    document.body.appendChild(this.el);
    this.bars = new Map();
    this._v = new THREE.Vector3();
  }
  _make(e) {
    const d = document.createElement("div");
    const elite = e.entity.tags.has("elite");
    d.className = "jx-ebar" + (elite ? " elite" : "");
    // 名字 · 境界（看不清时显示"练气?"或"???"）
    const nc = e.def.nameColor ? ` style="color:${e.def.nameColor}"` : "";
    d.innerHTML = `<div class="name${elite ? "" : " small"}"${nc}>${e.def.name}<span class="rl"></span></div>` + `<div class="sh"><div class="sm"><i></i></div><div class="el"></div></div>` + `<div class="bg"><div class="bm"><div class="lag"></div><div class="fill"></div></div>${elite ? '<span class="seal">精</span>' : ""}</div>`;
    this.el.appendChild(d);
    const b = { d, fill: d.querySelector(".fill"), lag: d.querySelector(".lag"), sh: d.querySelector(".sh i"), el: d.querySelector(".el"), rl: d.querySelector(".rl"), rlT: 0, rlText: null, t: 0, elite, last: -1, lastSh: -1 };
    this.bars.set(e, b);
    return b;
  }
  // 输出窗口提示（喘息）：头顶一个淡金色的字，dur 秒后淡出
  hint(e, text = "隙", dur = 2) {
    this.hints ||= new Map();
    let h = this.hints.get(e);
    if (!h) {
      const d = document.createElement("div");
      d.className = "jx-gap";
      this.el.appendChild(d);
      h = { d, t: 0 };
      this.hints.set(e, h);
    }
    h.d.textContent = text;
    h.t = dur;
  }
  // 受伤时调用：显示血条
  touch(e) {
    if (e.ctrl && e.ctrl.view) return; // 首领有自己的顶部长卷血条（控制器的 view），不画头顶血条
    const b = this.bars.get(e) || this._make(e);
    b.t = 4;
  }
  remove(e) {
    const b = this.bars.get(e);
    if (!b) return;
    b.d.remove();
    this.bars.delete(e);
  }
  update(dt, list) {
    const cam = this.ctx.camera;
    if (this.hints)
      for (const [e, h] of this.hints) {
        h.t -= dt;
        if (h.t <= -0.3 || !e.alive) {
          h.d.remove();
          this.hints.delete(e);
          continue;
        }
        const v = (e.headPos ? e.headPos(this._v) : this._v.set(e.pos.x, e.pos.y + e.def.height * 0.8, e.pos.z)).project(cam);
        h.d.style.opacity = h.t > 0 && v.z < 1 ? 0.85 : 0;
        h.d.style.left = ((v.x * 0.5 + 0.5) * innerWidth + 18).toFixed(1) + "px"; // 头部右上方
        h.d.style.top = Math.max(48, (-v.y * 0.5 + 0.5) * innerHeight - 10).toFixed(1) + "px";
      }
    for (const e of list) if (e.alive && e.entity.tags.has("elite") && !this.bars.has(e) && e.aggro && !(e.ctrl && e.ctrl.view)) this.touch(e);
    for (const [e, b] of this.bars) {
      if (!e.alive) {
        this.remove(e);
        continue;
      }
      b.t -= dt;
      const show = b.elite ? e.aggro : b.t > 0;
      const v = this._v.set(e.pos.x, e.pos.y + e.def.height * (b.elite ? 1.05 : 1.0), e.pos.z).project(cam);
      const on = show && v.z < 1;
      b.d.style.opacity = on ? 1 : 0;
      if (!on) continue;
      b.d.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + "px";
      b.d.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + "px";
      // 境界（主角升层 / 神识变化后会变，0.5 秒刷新一次）
      if ((b.rlT -= dt) <= 0 && e.dir && e.dir.realmLabel) {
        b.rlT = 0.5;
        const L = e.dir.realmLabel(e), key = L.text + L.cls;
        if (key !== b.rlText) (b.rlText = key), (b.rl.textContent = " · " + L.text), (b.rl.className = "rl " + L.cls);
      }
      // 五行护盾：护盾条 + 护盾五行字（提示该用哪种五行破盾）
      const sh = e.entity.shield, shk = sh && sh.hp > 0 ? sh.hp / sh.max : -1;
      if (shk !== b.lastSh) {
        b.lastSh = shk;
        b.d.classList.toggle("shielded", shk > 0);
        if (shk > 0) {
          const C = SH_C[sh.element];
          const N = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" }[sh.element];
          b.d.style.setProperty("--shc", C);
          b.el.textContent = N;
          b.sh.style.transform = `scaleX(${shk})`;
        }
      }
      const k = Math.max(0, e.entity.hp / e.entity.stats.get("hp"));
      if (k !== b.last) {
        b.last = k;
        b.fill.style.transform = `scaleX(${k})`;
        b.lag.style.transform = `scaleX(${k})`;
      }
    }
  }
}
