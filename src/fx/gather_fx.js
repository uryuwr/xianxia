// 采集 / 开箱的世界内表现（UI 设计，见 docs/ui/v2/灵草采集_v1.md）：
//   GatherFX.pluck(pos, tier)        采下：脚下圆相一笔收拢（0.32s 画满）→ 墨晕外扩淡出；灵气微粒上扬、几点墨
//   GatherFX.openChest(m, rarity)    开箱：在原处放一只"已开启"的箱子（关卡模型已被 level.consume 藏起），盖子 0.5s 掀开，
//                                    墨气从箱口涌出，按掉落最高品质着色的光柱与圆相；之后一直停在原地（已开启状态，不再有光和圈）
//   GatherFX.arc(pickup, from)       掉落物飞出：地上字牌从箱口 / 草丛抛物线落到它的落点（只改贴图位置，拾取判定仍按落点）
//   lootGlyphTex(glyph, color, rarity)   地上战利品的字牌贴图：一笔圆相 + 同色淡晕 + 楷书字，纸色外描（白天、夜里都清楚）
//   fallbackGatherObject(m) / fallbackChestObject(m)   关卡没给模型时（样张地图、夜明宝箱）的外观：与关卡同一套 markers
// 只改表现：不碰掉落、读条、按键。
import * as THREE from "three";
import { inkEnso, gatherMarker, glowMarker, chestMarker, gatherTier, gatherRarity, GATHER_TIER } from "../world/markers.js";
import { rarityTint } from "./rarity_tint.js";
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export class GatherFX {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = "gather-fx";
    ctx.scene.add(this.root);
    this.items = [];
    this.lids = [];
    this.arcs = [];
    this.opened = [];
  }
  // 圆相从池里取（按品质分池，用完放回，不每次新建几何体 / 材质）
  ensoFor(r, q) {
    const pool = (this.pool ||= new Map());
    const list = pool.get(q) || pool.set(q, []).get(q);
    const m = list.pop() || inkEnso(1, q, Math.random());
    m.scale.setScalar(r);
    m.userData.q = q;
    m.userData.r = r;
    return m;
  }
  pluck(pos, tier = "herb", q = 0) {
    const T = GATHER_TIER[tier] || GATHER_TIER.herb, C = rarityTint(q);
    const m = this.ensoFor(T.r * 1.05, q);
    const u = m.material.uniforms;
    u.uFocus.value = 1;
    u.uDraw.value = 0;
    u.uAlpha.value = 1;
    m.position.set(pos.x, pos.y + 0.12, pos.z);
    this.root.add(m);
    this.items.push({ m, t: 0, dur: 0.95 });
    const vfx = this.ctx.vfx;
    if (vfx) {
      // 灵气：浅色微粒向上散；墨：几点焦墨落下
      vfx.burst(pos, { color: C.light, count: tier === "glow" ? 26 : 14, speed: 1.4, up: 4.2, size: 0.12, y: 0.5, dur: 0.9 });
      vfx.burst(pos, { color: 0x15181b, count: 6, speed: 2.2, up: 1.6, size: 0.1, y: 0.3, dur: 0.5 });
    }
    return m;
  }
  openChest(m, rarity = 0) {
    const tier = m.tier || "normal";
    const src = (m.point && m.point.object) || m.fxObject;
    const box = chestMarker(tier, { bare: !0, dim: !0 });
    if (src && src.isObject3D) {
      src.updateWorldMatrix(!0, !1);
      src.matrixWorld.decompose(box.position, box.quaternion, box.scale);
    } else {
      box.position.copy(m.pos);
      box.rotation.y = Math.random() * 6.28;
    }
    this.root.add(box);
    this.opened.push(box);
    this.lids.push({ box, t: 0, dur: 0.5, q: Math.min(4, rarity | 0) });
    const q = Math.min(4, rarity | 0), vfx = this.ctx.vfx, p = box.position, C = rarityTint(q);
    this.pluck(p, "chest", q);
    if (vfx) {
      // 墨气：一团焦墨慢慢涌出、上浮；再按品质（RARITY）一束光
      vfx.burst(p, { color: 0x15181b, count: 18, speed: 0.7, up: 3.2, size: 0.24, y: 0.7, dur: 1.1 });
      vfx.burst(p, { color: C.light, count: 10 + q * 6, speed: 1.2, up: 4.5, size: 0.13, y: 0.8, dur: 1.0 });
      vfx.pillar(p, { color: C.column, radius: 0.38 + q * 0.06, height: 3 + q, dur: 0.75 + q * 0.12 });
    }
    return box;
  }
  // 字牌从 from（世界坐标）抛到落点；pickups.update 每帧会重设 y，所以本函数要在它之后调用（GatherUI.update 在 run.update 之后）
  arc(p, from, delay = 0) {
    if (!p || !p.sprite) return;
    const s = p.sprite;
    this.arcs.push({ p, s, from: from.clone(), to: s.position.clone(), t: -delay, dur: 0.42 + Math.random() * 0.12 });
    s.position.copy(from);
    s.scale.multiplyScalar(0.999);
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const u = it.m.material.uniforms;
      const k = it.t / it.dur;
      u.uDraw.value = Math.min(1, it.t / 0.32);
      const fade = Math.max(0, (it.t - 0.4) / (it.dur - 0.4));
      u.uAlpha.value = 1 - fade * fade;
      it.m.scale.setScalar(it.m.userData.r * (1 + 0.18 * fade));
      if (k >= 1) {
        this.root.remove(it.m);
        this.pool.get(it.m.userData.q).push(it.m); // 放回池里
        this.items.splice(i, 1);
      }
    }
    for (let i = this.lids.length - 1; i >= 0; i--) {
      const L = this.lids[i];
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      L.box.userData.lid.rotation.x = -1.95 * easeOutBack(k);
      const hop = L.t < 0.16 ? Math.sin((L.t / 0.16) * Math.PI) : 0;
      L.box.scale.set(1 + hop * 0.04, 1 + hop * 0.08, 1 + hop * 0.04);
      if (k >= 1) this.lids.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const A = this.arcs[i];
      A.t += dt;
      if (!A.s.parent) {
        this.arcs.splice(i, 1);
        continue;
      }
      const k = Math.max(0, Math.min(1, A.t / A.dur));
      // pickups.update 已按落点重设了 y（含浮动），这里在它之上叠加抛物线
      const bob = A.s.position.y - A.p.gy - 0.55;
      A.s.position.set(A.from.x + (A.to.x - A.from.x) * k, A.from.y + (A.p.gy + 0.55 - A.from.y) * k + 1.3 * Math.sin(k * Math.PI) + bob * k, A.from.z + (A.to.z - A.from.z) * k);
      if (k >= 1) this.arcs.splice(i, 1);
    }
  }
  dispose() {
    for (const it of this.items) it.m.geometry.dispose(), it.m.material.dispose();
    for (const list of (this.pool || new Map()).values()) for (const m of list) m.geometry.dispose(), m.material.dispose();
    this.items.length = this.lids.length = this.arcs.length = 0;
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    this.opened.length = 0;
    this.ctx.scene.remove(this.root);
  }
}

// ---------------- 地上战利品字牌 ----------------
const texCache = new Map();
const FONT = '"MaShanZheng","STKaiti","KaiTi","楷体",serif';
// 一笔圆相（canvas）：沿圆周画很多短弧，宽度起笔重、收笔细，尾段飞白
export function ensoPath(g, cx, cy, r, color, w0, w1, gap = 0.12, seed = 1) {
  const n = 90, start = -Math.PI * 0.62 + seed;
  g.strokeStyle = color;
  g.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (u > 1 - gap) break;
    if (u > 0.7 && Math.sin(i * 12.9898 + seed * 78.2) > 0.55 - (u - 0.7)) continue; // 飞白
    const a0 = start + u * Math.PI * 2, a1 = start + ((i + 1.4) / n) * Math.PI * 2;
    const rr = r * (1 + 0.025 * Math.sin(a0 * 3 + seed));
    g.lineWidth = (w0 + (w1 - w0) * Math.pow(u, 0.8)) * (u < 0.05 ? 1.35 : 1);
    g.beginPath();
    g.arc(cx, cy, rr, a0, a1);
    g.stroke();
  }
}
function drawGlyph(c, glyph, color, rarity) {
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  const ring = rarity > 0 ? color : "#2a2e31";
  // 品质淡晕（凡品用很淡的纸色）
  const grd = g.createRadialGradient(64, 66, 4, 64, 66, 58);
  grd.addColorStop(0, rarity > 0 ? hexA(color, 0.42) : "rgba(245,240,227,.75)");
  grd.addColorStop(0.62, rarity > 0 ? hexA(color, 0.16) : "rgba(236,230,214,.45)");
  grd.addColorStop(1, "rgba(236,230,214,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 66, 58, 0, 7);
  g.fill();
  // 圆相：先一道纸色外描，再一笔墨（或品质色）
  ensoPath(g, 64, 64, 42, "rgba(245,240,227,.95)", 14, 7, 0.12, 0.7);
  ensoPath(g, 64, 64, 42, ring, 9, 3, 0.12, 0.7);
  // 字：纸色描边 + 焦墨
  g.font = `400 58px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(245,240,227,.95)";
  g.strokeText(glyph, 64, 68);
  g.fillStyle = rarity > 0 ? darken(color) : "#15181b";
  g.fillText(glyph, 64, 68);
}
let fontWait = !1;
export function lootGlyphTex(glyph, color, rarity = 0) {
  const k = glyph + "|" + color + "|" + rarity;
  if (texCache.has(k)) return texCache.get(k).t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  drawGlyph(c, glyph, color, rarity);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, { t, c, glyph, color, rarity });
  // 书法字体可能还没载入：载入后原地重画
  if (!fontWait && document.fonts && document.fonts.status !== "loaded") {
    fontWait = !0;
    document.fonts.ready.then(() => {
      fontWait = !1;
      for (const e of texCache.values()) drawGlyph(e.c, e.glyph, e.color, e.rarity), (e.t.needsUpdate = !0);
    });
  }
  return t;
}
function hexA(hex, a) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function darken(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const f = (v) => Math.round(v * 0.68);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------- 关卡没给模型时的外观（样张地图、夜明宝箱） ----------------
// run.addMark 调用，直接加进标记的 group；先放一个空节点（run.update 会让 children[0] 上下浮动，圆相不该跟着浮）
export function fallbackGatherObject(m, g) {
  const kind = m.gatherKind || "herb";
  const obj = m.glow ? glowMarker(kind) : gatherMarker(kind, kind === "ore" ? "ore" : "herb");
  obj.rotation.y = Math.random() * 6.28;
  g.add(new THREE.Object3D(), obj);
  m.fxObject = obj;
  return obj;
}
export function fallbackChestObject(m, g) {
  const obj = chestMarker(m.tier === "glow" || m.tier === "night" ? m.tier : "normal");
  obj.rotation.y = Math.random() * 6.28;
  g.add(obj);
  m.fxObject = obj;
  return obj;
}
// 交互物的品质（RARITY 下标）：采集点按产出物、宝箱按档位；其他交互物没有品质（null）
export function rarityOfMark(m) {
  if (!m) return null;
  const o = (m.point && m.point.object) || m.fxObject;
  if (o && o.userData.gather) return o.userData.gather.q ?? 0;
  if (m.kind === "gather") return gatherRarity(m.gatherKind, m.glow ? "glow" : m.point && m.point.cat);
  return null;
}
export function tierOfMark(m) {
  if (!m) return null;
  const o = (m.point && m.point.object) || m.fxObject;
  if (o && o.userData.gather) return o.userData.gather.tier;
  if (m.kind !== "gather") return null;
  return m.glow ? "glow" : gatherTier(m.gatherKind, m.point && m.point.cat);
}
