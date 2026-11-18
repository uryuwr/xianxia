// 构筑系统的专用特效与外观：剑气、符纸、飞剑、阵图、落石、镇山印、闪电、护体、藤蔓、灵气球、反应字。
// 通用的预警圈、墨点、光柱仍使用共用的 src/fx/vfx.js。
import * as THREE from "three";
import { toon } from "../render/materials.js";

// 五行配色（与 vfx.INKC 一致的克制色）
export const ELEM_COLOR = { metal: 0xb08a38, wood: 0x3fae7a, water: 0x3f8fa8, fire: 0xd2321e, earth: 0x9a7448, null: 0xe0b45a };
export const ELEM_NAME = { metal: "金", wood: "木", water: "水", fire: "火", earth: "土" };
const KAI = '"STKaiti","KaiTi","楷体","Kaiti SC","PingFang SC",serif';

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- 贴图（首次使用时生成，之后缓存） ----------
const TEX = {};
// 剑气：一笔月牙形的墨痕，带飞白
function qiTex() {
  return (TEX.qi ||= canvasTex(256, 128, (g, w, h) => {
    const r = rng(7);
    g.translate(w / 2, h * 1.05);
    for (let k = 0; k < 90; k++) {
      const t = k / 89, a = -1.15 + t * 2.3;
      const thick = Math.sin(t * Math.PI) * 26 + 2;
      const rad = h * 0.9;
      g.strokeStyle = `rgba(255,255,255,${0.55 + 0.45 * r()})`;
      g.lineWidth = 2.2;
      for (let j = 0; j < 7; j++) {
        if (r() < 0.18) continue; // 飞白
        const o = (j / 6 - 0.5) * thick;
        g.beginPath();
        g.arc(0, 0, rad + o, -Math.PI / 2 + a, -Math.PI / 2 + a + 0.03);
        g.stroke();
      }
    }
  }));
}
// 符纸：黄纸朱砂
function talismanTex(char) {
  return (TEX["tal_" + char] ||= canvasTex(96, 192, (g, w, h) => {
    g.fillStyle = "#e6c46a";
    g.fillRect(4, 4, w - 8, h - 8);
    g.strokeStyle = "#a8261a";
    g.lineWidth = 4;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#a8261a";
    g.font = `900 30px ${KAI}`;
    g.textAlign = "center";
    g.fillText("敕", w / 2, 46);
    g.font = `900 52px ${KAI}`;
    g.fillText(char, w / 2, 112);
    g.lineWidth = 3;
    g.beginPath();
    let y = 128;
    g.moveTo(w / 2, y);
    for (let k = 0; k < 5; k++) g.quadraticCurveTo(w / 2 + (k % 2 ? -14 : 14), y + 6, w / 2, (y += 11));
    g.stroke();
  }));
}
// 阵图：外圈、八卦、符文、中心大字（白色，材质着色）
function formationTex(glyph) {
  return (TEX["fm_" + glyph] ||= canvasTex(512, 512, (g, w) => {
    const r = rng(glyph.charCodeAt(0));
    g.translate(w / 2, w / 2);
    g.strokeStyle = g.fillStyle = "#fff";
    const ring = (rad, lw, rough = 0.6) => {
      g.lineWidth = lw;
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const a = (k / 120) * Math.PI * 2, rr = rad + (r() - 0.5) * rough * 2;
        k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.stroke();
    };
    ring(244, 9, 1.4);
    ring(226, 2.5);
    ring(150, 4);
    ring(70, 3);
    // 八卦
    const gua = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];
    gua.forEach((gg, k) => {
      g.save();
      g.rotate((k / 8) * Math.PI * 2);
      gg.forEach((yang, l) => {
        const y = -165 - l * 16;
        if (yang) g.fillRect(-34, y, 68, 9);
        else g.fillRect(-34, y, 28, 9), g.fillRect(6, y, 28, 9);
      });
      g.restore();
    });
    // 外圈符文
    g.font = `700 22px ${KAI}`;
    g.textAlign = "center";
    const runes = "乾坤震巽坎离艮兑金木水火土天地人日月星风雷";
    for (let k = 0; k < 24; k++) {
      g.save();
      g.rotate((k / 24) * Math.PI * 2);
      g.fillText(runes[k % runes.length], 0, -206);
      g.restore();
    }
    g.font = `900 92px ${KAI}`;
    g.textBaseline = "middle";
    g.fillText(glyph, 0, 6);
  }));
}
// 藤蔓：几笔弯曲的藤与叶
function vineTex() {
  return (TEX.vine ||= canvasTex(256, 256, (g, w) => {
    const r = rng(3);
    g.translate(w / 2, w / 2);
    g.strokeStyle = g.fillStyle = "#fff";
    g.lineCap = "round";
    for (let k = 0; k < 9; k++) {
      let a = r() * Math.PI * 2, x = 0, y = 0, rad = 0;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, 0);
      for (let s = 0; s < 14; s++) {
        a += (r() - 0.5) * 0.9;
        rad += 8;
        x = Math.cos(a) * rad;
        y = Math.sin(a) * rad;
        g.lineTo(x, y);
        g.lineWidth = 6 - s * 0.35;
      }
      g.stroke();
      for (let s = 0; s < 3; s++) {
        g.save();
        g.translate(Math.cos(a) * (rad - s * 25), Math.sin(a) * (rad - s * 25));
        g.rotate(r() * 6.28);
        g.beginPath();
        g.ellipse(0, 0, 10, 4, 0, 0, 7);
        g.fill();
        g.restore();
      }
    }
  }));
}
function sealTex() {
  return (TEX.seal ||= canvasTex(256, 256, (g, w) => {
    g.fillStyle = "#b02a1c";
    g.fillRect(0, 0, w, w);
    g.fillStyle = "#f2e4c8";
    g.font = `900 92px ${KAI}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("镇", w * 0.3, w * 0.3);
    g.fillText("山", w * 0.7, w * 0.3);
    g.fillText("宝", w * 0.3, w * 0.72);
    g.fillText("印", w * 0.7, w * 0.72);
    g.strokeStyle = "#f2e4c8";
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, w - 28);
  }));
}

// ---------- 外观构造 ----------
const FLAT_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
export function qiMesh(color, size = 1) {
  const g = new THREE.PlaneGeometry(1.6 * size, 0.8 * size).rotateX(-Math.PI / 2).rotateY(Math.PI);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: qiTex(), color, transparent: !0, depthWrite: !1, side: THREE.DoubleSide }));
  m.renderOrder = 26;
  return m;
}
export function talismanMesh(char = "火") {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.64), new THREE.MeshBasicMaterial({ map: talismanTex(char), side: THREE.DoubleSide }));
  return m;
}
let swordGeo = null, glowTex = null;
// 剑身灵光的贴图：竖长的椭圆柔光（四边透明到 0）。原来是纯色矩形面片 → 水墨后期描出一圈方框，且投出方形影子
function swordGlowTex() {
  if (glowTex) return glowTex;
  const cv = document.createElement("canvas");
  cv.width = 32;
  cv.height = 128;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(16, 64, 0, 16, 64, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.setTransform(1, 0, 0, 4, 0, -192); // 纵向拉长成椭圆
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 128);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}
// 飞剑 / 剑影：实体剑身（投影）+ 柔光（不投影、不写深度、加法混合、四边透明）
//   透明面片规则（见 docs/knowledge/战斗设计/坑.md）：特效面片 depthWrite = false、castShadow = false、贴图四边 alpha 到 0；需要投影的只给实体网格
export function swordMesh(o = {}) {
  if (!swordGeo) {
    const blade = new THREE.CylinderGeometry(0.005, 0.035, 0.85, 4).translate(0, 0.52, 0).scale(1, 1, 0.25);
    const guard = new THREE.BoxGeometry(0.16, 0.03, 0.05).translate(0, 0.1, 0);
    const hilt = new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6).translate(0, -0.02, 0);
    const glow = new THREE.PlaneGeometry(0.26, 1.1).translate(0, 0.5, 0);
    swordGeo = { blade, guard, hilt, glow };
  }
  const grp = new THREE.Group();
  const steel = toon({ color: o.color ?? 0xdde4e8, emissive: o.emissive ?? 0x2a6a80, emissiveIntensity: 0.6 });
  const dark = toon({ color: 0x2a2624 });
  const solid = [new THREE.Mesh(swordGeo.blade, steel), new THREE.Mesh(swordGeo.guard, dark), new THREE.Mesh(swordGeo.hilt, dark)];
  for (const m of solid) (m.castShadow = !0), grp.add(m);
  if (o.glow !== !1) {
    const glow = new THREE.Mesh(swordGeo.glow, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, map: swordGlowTex(), transparent: !0, opacity: 0.35, depthWrite: !1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    glow.castShadow = !1;
    glow.receiveShadow = !1;
    glow.renderOrder = 25;
    grp.add(glow);
    grp.userData.glow = glow;
  }
  return grp;
}
export function formationMesh(glyph, color, radius) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: formationTex(glyph), color, transparent: !0, depthWrite: !1, opacity: 0 }));
  m.renderOrder = 22;
  return m;
}
export function vineMesh(radius) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.2, radius * 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: vineTex(), color: ELEM_COLOR.wood, transparent: !0, depthWrite: !1, opacity: 0 }));
  m.renderOrder = 23;
  return m;
}
export function rockMesh(size) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position;
  const r = rng(11);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.75 + r() * 0.4), p.getZ(i) * (0.8 + r() * 0.4));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon({ color: 0x8c8a7e, tri: !0, brushK: 0.8, brushScale: 0.5 }));
  m.castShadow = !0;
  return m;
}
export function sealMesh(size) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.55, size), toon({ color: 0xb8a070 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 10, 8), toon({ color: 0xb8a070 }));
  knob.position.y = size * 0.42;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.96, size * 0.96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: sealTex() }));
  face.position.y = -size * 0.276;
  grp.add(body, knob, face);
  grp.traverse((o) => o.isMesh && (o.castShadow = !0));
  return grp;
}
export function orbMesh(color) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color })));
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: !0, opacity: 0.25, depthWrite: !1, blending: THREE.AdditiveBlending })));
  return grp;
}

// ---------- 带寿命的特效 ----------
export class SkillFx {
  constructor(scene, camera) {
    this.root = new THREE.Group();
    this.root.name = "skill-fx";
    scene.add(this.root);
    this.items = [];
    this.camera = camera;
    this.layer = document.createElement("div");
    this.layer.className = "jx-reactions";
    document.body.appendChild(this.layer);
    const st = document.createElement("style");
    st.textContent = `
.jx-reactions { position: fixed; inset: 0; pointer-events: none; z-index: 20; overflow: hidden; }
.jx-react { position: absolute; transform: translate(-50%, -50%); font: 900 34px ${KAI}; letter-spacing: .08em; white-space: nowrap;
  text-shadow: 0 0 2px #f4efe2, 0 0 6px #f4efe2, 0 0 14px rgba(244,239,226,.8); animation: jxReact 1.1s ease-out forwards; }
.jx-react small { display: block; font-size: 14px; text-align: center; letter-spacing: .3em; opacity: .8; }
@keyframes jxReact { 0% { opacity: 0; transform: translate(-50%, -30%) scale(1.6); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -110%) scale(.95); } }`;
    document.head.appendChild(st);
    this._v = new THREE.Vector3();
  }
  add(obj, dur, update, onEnd) {
    this.root.add(obj);
    const it = { obj, t: 0, dur, update, onEnd };
    this.items.push(it);
    return it;
  }
  // 闪电：折线，从 a 到 b
  lightning(a, b, color = 0xbfe8ff, width = 0.08) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7));
      pts.push(p);
    }
    // 用细长方块串成折线（WebGL 线宽固定为 1，不够醒目）
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: !0, depthWrite: !1, blending: THREE.AdditiveBlending });
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !0, depthWrite: !1 });
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[i + 1], len = p0.distanceTo(p1);
      for (const [m, w] of [[mat, width * 2.5], [core, width * 0.6]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), m);
        seg.position.lerpVectors(p0, p1, 0.5);
        seg.lookAt(p1);
        grp.add(seg);
      }
    }
    return this.add(grp, 0.22, (it, k) => ((mat.opacity = 1 - k), (core.opacity = 1 - k)), () => grp.traverse((o) => o.geometry && o.geometry.dispose()));
  }
  // 反应字：屏幕上弹出书法字
  popText(text, sub, worldPos, color) {
    if (!this.camera) return;
    const v = this._v.copy(worldPos);
    v.y += 2.2;
    v.project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement("div");
    el.className = "jx-react";
    el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + "px";
    el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + "px";
    el.style.color = "#" + new THREE.Color(color).getHexString();
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update && it.update(it, k, dt);
      if (k >= 1) {
        this.root.remove(it.obj);
        it.onEnd && it.onEnd();
        this.items.splice(i, 1);
      }
    }
  }
}

export { FLAT_UP };
