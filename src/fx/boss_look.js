// 首领外观辅助（美术管线）：青牙 v2 的二阶段切换、骨甲崩裂、裂缝发光、眼中青焰、五行描边壳护盾 + 脚下五行阵纹。
// 设计：docs/design/boss_青牙_v2.md §9.1、§4.3、§5.3、§5.4。模型 assets/models/qingya.glb（blender/build_qingya.py）。
//
// 用法（青牙控制器 src/game/enemies/bosses/qingya.js）：
//   const look = bossLook(enemy)   构造时一次：一阶段外观（隐藏裂缝、眼焰）
//   look.update(dt)                每帧：护盾描边 / 阵纹跟随 entity.shield，眼焰闪动；死亡后自动收起特效
//   look.setPhase(1 | 2[, instant]) 立刻切外观（二阶段：骨甲隐藏，裂开的骨板 + 青光裂缝 + 眼焰显示；毛色 0.9 秒内压暗泛青，instant 则立刻）
//   look.armorBurst()              转阶段 1.6 秒那一刻调：骨片 + 墨点 + 青光飞散（vfx.burst 池），然后 setPhase(2)；
//                                  配合动画 armor_burst（0.5 秒炸开）
//   look.crackGlow(k)              0..1：裂缝亮度（平时 0.35，月光里 1）
//   护盾：无盾 → 有盾的那一刻，描边壳 0.45 秒内"长出来"并冲过头再回落、阵纹放大落定（换盾重生的信号）
//   look.shield(el | null)         手动指定护盾外观（不调用时每帧从 entity.shield 自动读）；el = metal|wood|water|fire|earth
//   look.dispose()                 onDeath / 回巢重置
// 模型节点（glTF 节点名）：qingya（本体）、qingya_armor（一阶段骨甲）、qingya_crack（二阶段裂板 + 裂缝）、qingya_eyefire（二阶段眼焰火芯）
//
// 性能（docs/性能优化_v1.md §7）：
//   - 五行描边壳用 materials.js 的 outlineMaterial（程序缓存键 "jx-outline"，与普通墨线描边共用同一个着色器程序，只是颜色 / 粗细 uniform 不同）
//     → 不新增着色器；五种颜色各一份材质，模块级共享。只给本体的 fur_ink / fur_light 和骨甲加壳（剪影主体），每个首领 ≤ 4 次额外绘制。
//   - 阵纹贴花、眼焰火苗：纯特效面片，depthWrite=false、不投影、四边 alpha 为 0 的 Canvas 贴图；几何体 / 材质 / 贴图模块级共享，不每帧 new。
//   - 需要预热的新材质：bossLookPrewarm() 返回的临时网格（阵纹 MeshBasicMaterial+map+透明、眼焰 SpriteMaterial+map+透明）。
import * as THREE from "three";
import { outlineMaterial } from "../render/materials.js";
import { EL_COLOR } from "../game/shields.js";
import { INKC } from "./vfx.js";

const SHELL_W = 0.034; // 模型单位（青牙 scale 2.6 → 约 9 厘米宽的五行色描边，压在 0.016 的墨线外面）
const CRACK_EI = 1.6; // crack_glow 的满亮自发光（与 enemy.js PALETTE 一致）
const BONE = 0xd9d6c8;

const _shell = {};
function shellMat(el) {
  if (!_shell[el]) {
    const m = outlineMaterial(SHELL_W, EL_COLOR[el] ?? 0xffffff);
    const ob = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => (ob(sh, r), (m.userData.sh = sh));
    m.customProgramCacheKey = () => "jx-outline"; // 与普通描边共用程序
    _shell[el] = m;
  }
  return _shell[el];
}

// ---- 共享贴图：阵纹（白色，材质 color 着色）、火苗（竖长、四边透明）----
let _sigilTex = null, _flameTex = null, _sigilGeo = null, _sigilMat = null, _flameMat = null;
function sigilTex() {
  if (_sigilTex) return _sigilTex;
  const N = 256, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d"), C = N / 2;
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  const ring = (r, w, a, gaps) => {
    g.globalAlpha = a;
    g.lineWidth = w;
    const n = 48;
    for (let i = 0; i < n; i++) {
      if (gaps && i % 12 === 11) continue; // 笔断意连
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1.15) / n) * Math.PI * 2;
      g.lineWidth = w * (0.7 + 0.3 * Math.sin(i * 1.7));
      g.beginPath();
      g.arc(C, C, r + Math.sin(i * 2.3) * 1.2, a0, a1);
      g.stroke();
    }
  };
  ring(C * 0.86, 7, 0.95, !0);
  ring(C * 0.74, 2.5, 0.7, !1);
  ring(C * 0.42, 3, 0.55, !0);
  // 五行五方：每方一组三爻短笔（像卦象），中间断开的是阴爻
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(C + Math.cos(a) * C * 0.58, C + Math.sin(a) * C * 0.58);
    g.rotate(a + Math.PI / 2);
    g.globalAlpha = 0.85;
    for (let j = 0; j < 3; j++) {
      g.lineWidth = 5;
      const y = (j - 1) * 10, broken = (k + j) % 2;
      g.beginPath();
      if (broken) g.moveTo(-16, y), g.lineTo(-4, y), g.moveTo(4, y), g.lineTo(16, y);
      else g.moveTo(-16, y), g.lineTo(16, y);
      g.stroke();
    }
    g.restore();
  }
  // 外缘柔化：径向 alpha 渐隐到 0（四边透明）
  g.globalCompositeOperation = "destination-in";
  g.globalAlpha = 1;
  const rg = g.createRadialGradient(C, C, C * 0.3, C, C, C);
  rg.addColorStop(0, "rgba(0,0,0,0.6)");
  rg.addColorStop(0.75, "rgba(0,0,0,1)");
  rg.addColorStop(0.97, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, N, N);
  _sigilTex = new THREE.CanvasTexture(c);
  _sigilTex.colorSpace = THREE.SRGBColorSpace;
  return _sigilTex;
}
function flameTex() {
  if (_flameTex) return _flameTex;
  const W = 64, H = 128, c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  // 火舌：底部（贴眼睛）最亮，向上收尖、渐隐；四边 alpha 为 0
  for (let i = 0; i < 3; i++) {
    const w = [0.42, 0.3, 0.16][i] * W, a = [0.35, 0.6, 1][i];
    const grd = g.createLinearGradient(0, H, 0, 0);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.12, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.55, `rgba(255,255,255,${a * 0.6})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(W / 2 - w, H * 0.9);
    g.quadraticCurveTo(W / 2 - w * 0.9, H * 0.4, W / 2 + w * 0.2, H * 0.04);
    g.quadraticCurveTo(W / 2 + w * 0.5, H * 0.5, W / 2 + w, H * 0.9);
    g.quadraticCurveTo(W / 2, H * 0.98, W / 2 - w, H * 0.9);
    g.fill();
  }
  _flameTex = new THREE.CanvasTexture(c);
  _flameTex.colorSpace = THREE.SRGBColorSpace;
  return _flameTex;
}
function sigilGeo() {
  return _sigilGeo || (_sigilGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
}
function sigilMat() {
  return _sigilMat || (_sigilMat = new THREE.MeshBasicMaterial({ map: sigilTex(), color: 0xffffff, transparent: !0, opacity: 0.75, depthWrite: !1 }));
}
function flameMat() {
  return (
    _flameMat ||
    (_flameMat = new THREE.SpriteMaterial({ map: flameTex(), color: 0x3fe6aa, transparent: !0, opacity: 0.9, depthWrite: !1 })) // 普通混合：加法在宣纸色背景上会洗白看不见
  );
}

// 预热用：返回临时网格（调用方摆进镜头画一帧后移除即可；材质是共享的，不要 dispose）
export function bossLookPrewarm() {
  const d = new THREE.Mesh(sigilGeo(), sigilMat());
  const f = new THREE.Sprite(flameMat());
  return [d, f];
}

// 二阶段毛色目标（墨青）：fur_qing 主毛、fur_light 长鬃、fur_belly 淡腹
const FUR_P2 = {
  fur_qing: { color: 0x2c403b, emissive: 0x0d2622 },
  fur_light: { color: 0x74ab98, emissive: 0x0c2a22 },
  fur_belly: { color: 0x4c665e, emissive: 0x10261f },
};
const FUR_T = 0.9; // 换色用时（秒）
const SHELL_IN = 0.45; // 无盾 → 有盾：描边壳"长出来"并亮一下的时长
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function bossLook(enemy) {
  const model = enemy.model, root = enemy.root, ctx = enemy.ctx;
  const node = (n) => model.getObjectByName(n);
  // 按节点收集几何体：描边壳和本体共用几何体，所以按几何体切显隐能连壳一起切
  const geosOf = (n) => {
    const s = new Set(), o = node(n);
    o && o.traverse((m) => m.isMesh && s.add(m.geometry));
    return s;
  };
  const G = { armor: geosOf("qingya_armor"), crack: geosOf("qingya_crack"), fire: geosOf("qingya_eyefire") };
  const meshes = [];
  model.traverse((m) => m.isMesh && meshes.push(m));
  const setVis = (set, on) => {
    for (const m of meshes) if (set.has(m.geometry)) m.visible = on;
  };
  // 裂缝材质（enemy.js 给 toon 材质写了 name = PALETTE 键）
  const crackMats = new Set();
  for (const m of meshes) if (G.crack.has(m.geometry) && m.material && m.material.name === "crack_glow") crackMats.add(m.material);
  // 二阶段毛色：整体压暗、泛青（保留自发光托底，不压成黑团）。每只敌人的材质是自己的一份，可以直接改
  const furMats = [];
  for (const m of enemy.mats || []) {
    const to = FUR_P2[m.name];
    if (!to) continue;
    furMats.push({ m, c0: m.color.clone(), e0: m.emissive.clone(), c1: new THREE.Color(to.color), e1: new THREE.Color(to.emissive ?? 0) });
  }

  // ---- 五行描边壳：本体 fur_ink / fur_light、一二阶段骨甲各一层 ----
  const shells = [];
  for (const m of meshes) {
    if (!m.isSkinnedMesh || m.material === undefined || m.material.side === THREE.BackSide) continue; // 跳过墨线描边壳
    const nm = m.material.name;
    const isBody = (nm === "fur_ink" || nm === "fur_light") && !G.armor.has(m.geometry) && !G.crack.has(m.geometry);
    const isPlate = nm === "bone_armor" && (G.armor.has(m.geometry) || G.crack.has(m.geometry));
    if (!isBody && !isPlate) continue;
    const sm = new THREE.SkinnedMesh(m.geometry, shellMat("wood"));
    sm.bind(m.skeleton, m.bindMatrix);
    sm.position.copy(m.position);
    sm.quaternion.copy(m.quaternion);
    sm.scale.copy(m.scale);
    sm.frustumCulled = !1;
    sm.castShadow = !1;
    sm.visible = !1;
    sm.userData.src = m;
    m.parent.add(sm);
    shells.push(sm);
  }
  // ---- 脚下五行阵纹（贴地面片，挂在根节点上，世界单位）----
  const sigil = new THREE.Mesh(sigilGeo(), sigilMat());
  const R = 3.4 * ((enemy.def.scale || 2.6) / 2.6);
  sigil.scale.set(R * 2, 1, R * 2);
  sigil.position.y = 0.06;
  sigil.renderOrder = 24;
  sigil.castShadow = sigil.receiveShadow = !1;
  sigil.visible = !1;
  root.add(sigil);
  // ---- 眼中青焰：两枚加法火苗精灵，挂在 head 骨上（不加灯）----
  const head = node("head");
  const flames = [];
  if (head) {
    // 眼睛在模型空间（glTF：+Y 上、面向 +Z）的位置 → head 骨的绑定空间
    const sk = meshes.find((m) => m.isSkinnedMesh)?.skeleton;
    const bi = sk ? sk.bones.indexOf(head) : -1;
    for (const s of [1, -1]) {
      const f = new THREE.Sprite(flameMat());
      _v.set(0.12 * s, 1.27, 1.13);
      if (bi >= 0) _v.applyMatrix4(sk.boneInverses[bi]);
      f.position.copy(_v);
      f.center.set(0.5, 0.08); // 底部贴着眼睛，向上升
      f.scale.set(0.2, 0.44, 1);
      f.renderOrder = 26;
      f.visible = !1;
      head.add(f);
      flames.push(f);
    }
  }

  let phase = 1, glow = 0.35, manualEl, curEl = null, t = Math.random() * 10, disposed = !1;
  let furK = 0, furTo = 0, inT = 9; // 毛色插值 0 → 1；护盾出现计时
  const applyFur = (k) => {
    for (const f of furMats) {
      f.m.color.copy(f.c0).lerp(f.c1, k);
      const e = f.m.userData.baseEmissive || f.m.emissive;
      e.copy(f.e0).lerp(f.e1, k);
      if (!(enemy.flashT > 0)) f.m.emissive.copy(e);
    }
  };
  const look = {
    get phase() {
      return phase;
    },
    setPhase(p, instant) {
      phase = p;
      furTo = p >= 2 ? 1 : 0;
      if (instant || p < 2) applyFur((furK = furTo));
      setVis(G.armor, p < 2);
      setVis(G.crack, p >= 2);
      setVis(G.fire, p >= 2);
      curEl = undefined; // 下一帧按新的显隐重刷护盾描边壳
      for (const f of flames) f.visible = p >= 2;
      look.crackGlow(glow);
    },
    armorBurst() {
      const V = ctx.vfx;
      if (V) {
        for (const b of ["hips", "spine", "chest"]) {
          const o = node(b);
          if (!o) continue;
          o.getWorldPosition(_v);
          const p = { x: _v.x, y: _v.y - 0.2, z: _v.z };
          V.burst(p, { color: BONE, count: 14, speed: 6, size: 0.34, up: 6, y: 0, dur: 0.9 });
          V.burst(p, { color: INKC.ink, count: 16, speed: 4, size: 0.3, up: 4, y: 0, dur: 1.1 });
          V.burst(p, { color: 0x7dffd0, count: 8, speed: 3, size: 0.2, up: 5, y: 0, dur: 0.7 });
        }
      }
      look.setPhase(2);
    },
    crackGlow(k) {
      glow = Math.max(0, Math.min(1, k));
      for (const m of crackMats) {
        m.userData.baseEI = CRACK_EI * (0.35 + 0.9 * glow);
        if (!(enemy.flashT > 0)) m.emissiveIntensity = m.userData.baseEI;
      }
    },
    shield(el) {
      manualEl = el;
    },
    update(dt) {
      if (disposed) return;
      t += dt;
      const dead = !enemy.alive;
      const sh = enemy.entity && enemy.entity.shield;
      const el = dead ? null : manualEl !== undefined ? manualEl : sh && sh.hp > 0 ? sh.element : null;
      if (el !== curEl) {
        if (el && !curEl) inT = 0; // 无盾 → 有盾：0.45 秒内描边壳从无到有、冲过头再回落，阵纹放大落定
        curEl = el;
        for (const s of shells) {
          s.visible = !!el && s.userData.src.visible;
          if (el) s.material = shellMat(el);
        }
        sigil.visible = !!el;
        if (el) sigilMat().color.setHex(EL_COLOR[el] ?? 0xffffff);
      }
      if (el) {
        const m = shellMat(el), u = m.userData.sh;
        inT += dt;
        const k = Math.min(1, inT / SHELL_IN), pop = k < 1 ? k + 1.1 * Math.sin(k * Math.PI) : 1;
        if (u) u.uniforms.uOW.value = SHELL_W * pop * (0.85 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3.2))) * (sh && sh.max ? 0.6 + 0.4 * (sh.hp / sh.max) : 1);
        sigil.scale.set(R * 2 * (0.6 + 0.4 * pop), 1, R * 2 * (0.6 + 0.4 * pop));
        sigil.rotation.y = t * 0.25;
        sigilMat().opacity = 0.55 + 0.2 * Math.sin(t * 2.1);
      }
      if (furK !== furTo) applyFur((furK = furTo > furK ? Math.min(furTo, furK + dt / FUR_T) : Math.max(furTo, furK - dt / FUR_T)));
      if (phase >= 2 && flames.length) {
        const fm = flameMat();
        fm.opacity = dead ? Math.max(0, fm.opacity - dt * 2) : 0.75 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5.3);
        for (let i = 0; i < flames.length; i++) flames[i].scale.y = 0.44 * (0.85 + 0.2 * Math.sin(t * (13 + i * 4) + i));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = !0;
      for (const s of shells) s.parent && s.parent.remove(s);
      for (const f of flames) f.parent && f.parent.remove(f);
      sigil.parent && sigil.parent.remove(sigil);
      // 材质 / 几何体 / 贴图是模块级共享的，不释放（性能规范：常驻、不重复编译）
    },
  };
  look.setPhase(1);
  return look;
}
