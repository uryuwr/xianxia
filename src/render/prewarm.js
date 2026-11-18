// 着色器预热：进出行局时（加载画面盖着）把关卡与常用特效的材质提前编译并实际画一次，去掉第一次出招 / 放技能 / 敌人预警时的
// 编译卡顿（集显上每个着色器首次使用 50–170ms）。配合 src/render/perf.js 的 keepPrograms：编译过的程序整局常驻。
//   prewarm(ctx, ink) → Promise
// 做法：在镜头前临时摆出各模块的特效网格（平时隐藏的池化网格临时显示），先 renderer.compile 让驱动并行编译，
// 等编译就绪后按水墨管线完整渲染一帧（程序首次使用、阴影深度材质、ANGLE 按顶点格式生成的着色器变体都在这一帧完成）。
// 加载画面盖住画布，这一帧玩家看不到；渲染完立刻移走临时网格，用各模块接口生成的特效设为已结束，下一帧渲染前由各模块回收。
// 只影响编译时机，不改画面与玩法。
// 首领战（青牙 v2，boss_青牙_v2 §10.2 第 6 项）：关卡有 points.boss 时，在首领点位临时摆一只"纯外观"的首领（不挂控制器、不进敌人列表、
// 不进战斗世界），一二阶段外观（骨甲 / 裂板 / 眼焰）、五行描边壳、脚下阵纹、死亡化墨（半透明变体）全部显示；狼谷环境（月光斑 / 光柱 / 光尘、
// 墨雾门、谷沿雾、暗幕）临时显示；再把镜头 + 投影灯移到狼谷，按跟随视角与处决镜头（低机位 4 个朝向）各真画一帧——
// 首次进谷 / 处决镜头压低时，程序编译、纹理上传、ANGLE 按顶点格式生成着色器都已在加载画面里做完（2026-11 实测：现有材质与狼共用程序，
// 这一段是"保证覆盖"——首领材质 / 环境件以后改了参数也不会在战斗里首次编译）。另外把场景里所有贴图提前上传（initTexture）。
import * as THREE from "three";
import { qiMesh, talismanMesh, swordMesh, formationMesh, vineMesh, rockMesh, sealMesh, orbMesh } from "../fx/skill_fx.js";
import { Enemy } from "../game/enemies/enemy.js";
import { ENEMY_TYPES } from "../data/enemies.js";
import { bossLook } from "../fx/boss_look.js";
import { activeLevel } from "../world/terrain.js";

export async function prewarm(ctx, ink) {
  const R = ctx.renderer, scene = ctx.scene, cam = ctx.camera;
  if (!R || !scene || !cam || !R.compile) return 0;
  const t0 = performance.now();
  // 镜头前 8 米处（各特效摆成一排，都在视锥内）
  cam.updateMatrixWorld();
  const fwd = cam.getWorldDirection(new THREE.Vector3());
  const at = cam.position.clone().addScaledVector(fwd, 8);
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
  const p = (k) => at.clone().addScaledVector(side, k * 0.6);
  const dir = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  const temp = new THREE.Group();
  temp.name = "prewarm";
  const later = []; // 渲染后执行的收尾
  const tryDo = (fn) => {
    try {
      fn();
    } catch (e) {
      console.warn("[prewarm]", e && e.message);
    }
  };
  const put = (o, k) => (o.position.copy(p(k)), temp.add(o));
  // ---- 构筑特效（skill_fx 的外观构造函数）----
  tryDo(() => [qiMesh(0xd2321e), talismanMesh("火"), swordMesh(), formationMesh("聚", 0xe0b45a, 1), vineMesh(1), rockMesh(0.4), sealMesh(0.6), orbMesh(0x3fae7a)].forEach((o, i) => put(o, i - 4)));
  // 与拾取物 / 护盾 / 弹道 / 品质光柱同参数的材质
  tryDo(() => {
    const tex = new THREE.CanvasTexture(document.createElement("canvas"));
    const g = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    put(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: !0, depthWrite: !1 })), 5);
    put(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: !0, opacity: 0.3, depthWrite: !1 })), 6);
    put(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: !0, opacity: 0.2, depthWrite: !1, side: THREE.DoubleSide })), 7);
    put(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: !0, depthWrite: !1, blending: THREE.AdditiveBlending })), 8);
    put(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x15181b })), 9);
  });
  // ---- 各模块接口生成的特效（渲染后立即结束）----
  const V = ctx.vfx;
  if (V)
    tryDo(() => {
      V.burst(p(0), { count: 2, dur: 0.05 }); // 化墨 / 处决墨点（实例化池）
      const its = [V.ring(p(-3), 1), V.ring(p(-1), 1, { fill: 1 }), V.arc(p(1), dir, 1.5, 1.2), V.pillar(p(3))];
      later.push(() => its.forEach((it) => it && (it.t = it.dur)));
    });
  const EF = ctx.enemies && ctx.enemies.fx;
  if (EF)
    tryDo(() => {
      const its = [EF.sector(p(-2), dir, 1.5, 1, 0.5), EF.line(p(2), dir, 2, 1, 0.5)];
      later.push(() => its.forEach((it) => it && ((it.done = !0), (it.mesh.material.uniforms.uAlpha.value = 0))));
    });
  const PF = ctx.player && ctx.player.fx;
  if (PF && PF.stroke)
    tryDo(() => {
      const n = PF.strokes.length;
      PF.stroke(p(-2), p(2));
      later.push(() => PF.strokes.slice(n).forEach((s) => (s.t = s.dur)));
    });
  const RS = ctx.flow && ctx.flow.scenes && ctx.flow.scenes.run;
  const GF = RS && RS.hudUI && RS.hudUI.gather && RS.hudUI.gather.fx;
  if (GF && GF.pluck)
    tryDo(() => {
      const n = GF.items.length;
      GF.pluck(p(0), "herb");
      later.push(() => GF.items.slice(n).forEach((it) => (it.t = it.dur)));
    });
  if (ctx.skills && ctx.skills.fx && ctx.skills.fx.lightning)
    tryDo(() => {
      const it = ctx.skills.fx.lightning(p(-3), p(3));
      later.push(() => it && (it.t = it.dur));
    });
  // ---- 平时隐藏的池化网格（刀光、剑气，不做视锥裁剪）与施法预览叠加层：临时显示 ----
  const shown = [];
  const show = (o) => o && o.isObject3D && !o.visible && ((o.visible = !0), shown.push(o));
  if (PF) for (const s of [...(PF.slashes || []), ...(PF.waves || [])]) show(s.m);
  const TF = ctx.skills && ctx.skills.targeting && ctx.skills.targeting.fx;
  if (TF && TF.all) for (const o of TF.all) show(o.mesh);
  // 敌人倒地化墨 / 留尸时材质改成半透明（three 的"不透明"是着色器变体）：每种在场的敌人临时切成半透明画一次
  const transp = [];
  const seenType = new Set();
  for (const e of (ctx.enemies && ctx.enemies.list) || []) {
    if (!e.mats || seenType.has(e.type)) continue;
    seenType.add(e.type);
    show(e.root);
    for (const m of e.mats) if (!m.transparent) (m.transparent = !0), (m.needsUpdate = !0), transp.push(m);
  }
  // ---- 首领战：纯外观的临时首领 + 狼谷环境件（见文件头）----
  // ?prewarmBoss=0：跳过这一段（性能 A/B 对照用，tools/scenarios/perf_probe.mjs STAGES=boss）
  const skipBoss = typeof location !== "undefined" && /[?&]prewarmBoss=0/.test(location.search);
  const L = !skipBoss && activeLevel(), bp = L && L.points && L.points.boss, BA = L && L.bossArena;
  const E = ctx.enemies;
  let boss = null, look = null, bossTransp = [], nTex = 0, arenaMs = 0;
  const arenaAt = bp && bp.pos ? new THREE.Vector3(bp.pos.x, 0, bp.pos.z) : null;
  if (arenaAt && E && E.templates) {
    const type = bp.type || bp.id;
    const def = ENEMY_TYPES[type];
    if (def && E.templates[type])
      tryDo(() => {
        boss = new Enemy(E, type, { ...def, controller: null, shieldPhases: null, shield: null }, E.templates[type], arenaAt, { region: def.region, level: 1, noLoot: !0 });
        ctx.world.remove(boss.entity); // 只要外观：不参与战斗、不进敌人列表
        if (ctx.shields) (ctx.shields.drop(boss.entity), (boss.entity.shield = null)); // world.add 的 spawn 事件会给首领发护盾
        arenaAt.y = boss.pos.y;
        look = bossLook(boss);
        look.setPhase(2, !0);
        look.shield("wood");
        look.update(0); // 建出描边壳 / 阵纹的显示状态
        boss.root.traverse((o) => !o.visible && show(o)); // 一阶段骨甲 + 二阶段裂板 / 眼焰 + 描边壳 + 阵纹同时显示
        bossTransp = boss.mats.filter((m) => !m.transparent);
      });
  }
  if (BA) {
    tryDo(() => {
      const spots = BA.moonSpots ? BA.moonSpots(0) : [];
      (BA.moon || []).forEach((mp, i) => {
        if (spots[i]) mp.mesh.position.set(spots[i].x, arenaAt ? arenaAt.y : mp.mesh.position.y, spots[i].z);
        show(mp.mesh);
      });
      for (const g of Object.values(BA.gateObjs || {})) show(g.object);
    });
  }
  // 场景里所有贴图提前上传（不在镜头里的物体平时要到第一次画它时才上传，大贴图在集显上能卡几十毫秒）
  tryDo(() => {
    if (!R.initTexture || skipBoss) return;
    const texs = new Set();
    const add = (t) => t && t.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture && t.image && texs.add(t);
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k in m) if (m[k] && m[k].isTexture) add(m[k]);
        if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k] && m.uniforms[k].value);
      }
    });
    for (const t of texs) R.initTexture(t);
    nTex = texs.size;
  });
  scene.add(temp);

  // 1) 并行编译（KHR_parallel_shader_compile），等就绪：主场景按水墨渲染目标（缓存键与渲染目标有关），预览叠加层按屏幕
  const prevRT = R.getRenderTarget();
  const mats = new Set();
  try {
    R.setRenderTarget(ink ? ink.rt : null);
    for (const m of R.compile(scene, cam)) mats.add(m);
    if (TF && TF.overlay && TF.root.parent === TF.overlay) {
      R.setRenderTarget(null);
      for (const m of R.compile(TF.overlay, cam, scene)) mats.add(m);
    }
  } catch (e) {
    console.warn("[prewarm] compile", e && e.message);
  }
  R.setRenderTarget(prevRT);
  // 等待期间主循环暂停 3D 渲染（否则主循环那一帧会同步编译，抵消并行编译），也不让敌人的画面外剔除把临时显示的又藏起来
  const hold = ctx.hold3d;
  ctx.hold3d = !0;
  for (let k = 0; k < 300 && mats.size; k++) {
    for (const m of mats) {
      const pg = R.properties.get(m).currentProgram;
      if (!pg || pg.isReady()) mats.delete(m);
    }
    if (mats.size) await new Promise((r) => setTimeout(r, 10));
  }
  ctx.hold3d = hold;
  for (const o of shown) o.visible = !0;
  // 2) 完整画一帧（看不到：加载画面盖着）
  try {
    if (ink) ink.render(scene, cam, 0);
    else R.render(scene, cam);
    R.getContext().finish();
  } catch (e) {
    console.warn("[prewarm] render", e && e.message);
  }
  // 3) 狼谷：镜头 + 投影灯移过去，跟随视角画一帧（首领材质不透明），再按处决镜头（低机位、4 个朝向，首领切半透明 = 化墨变体）各画一帧
  if (arenaAt)
    tryDo(() => {
      const ta = performance.now();
      const cp = cam.position.clone(), cq = cam.quaternion.clone();
      const pl = ctx.player && ctx.player.pos;
      let sun = null;
      scene.traverseVisible((o) => !sun && o.isDirectionalLight && o.castShadow && (sun = o));
      const sp = sun && sun.position.clone(), st = sun && sun.target.position.clone();
      if (sun) {
        const d = new THREE.Vector3().subVectors(arenaAt, sun.target.position);
        sun.position.add(d);
        sun.target.position.add(d);
        sun.target.updateMatrixWorld();
        sun.updateMatrixWorld();
      }
      const draw = () => {
        for (const o of shown) o.visible = !0;
        cam.updateMatrixWorld();
        if (ink) ink.render(scene, cam, 0);
        else R.render(scene, cam);
      };
      // 跟随视角：保持当前镜头相对主角的偏移
      if (pl) cam.position.copy(arenaAt).add(new THREE.Vector3().subVectors(cp, pl));
      draw();
      for (const m of bossTransp) (m.transparent = !0), (m.needsUpdate = !0);
      const tgt = arenaAt.clone().setY(arenaAt.y + 1.6);
      for (let k = 0; k < 4; k++) {
        const yaw = (k * Math.PI) / 2, pit = (25 * Math.PI) / 180, dist = 10;
        cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pit) * dist, tgt.y + Math.sin(pit) * dist, tgt.z + Math.cos(yaw) * Math.cos(pit) * dist);
        cam.lookAt(tgt);
        draw();
      }
      R.getContext().finish();
      cam.position.copy(cp);
      cam.quaternion.copy(cq);
      cam.updateMatrixWorld();
      if (sun) (sun.position.copy(sp), sun.target.position.copy(st), sun.target.updateMatrixWorld(), sun.updateMatrixWorld());
      arenaMs = performance.now() - ta;
    });
  for (const o of shown) o.visible = !1;
  for (const m of transp) (m.transparent = !1), (m.needsUpdate = !0);
  if (boss)
    tryDo(() => {
      look && look.dispose();
      boss.dispose(); // 移出场景、释放材质（程序由 keepPrograms 保活）
    });
  scene.remove(temp);
  later.forEach((f) => tryDo(f));
  // 临时网格的材质释放（程序由 keepPrograms 保活）；贴图是各模块缓存的，不释放
  temp.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
  const ms = performance.now() - t0;
  const arena = boss || BA ? `, boss ${boss ? boss.type : "-"} moon ${BA ? (BA.moon || []).length : 0} gates ${BA ? Object.keys(BA.gateObjs || {}).length : 0} arena ${arenaMs.toFixed(0)}ms` : "";
  console.log(`[prewarm] ${ms.toFixed(0)}ms, programs ${R.info.programs ? R.info.programs.length : "?"}, textures ${nTex}${arena}`);
  return ms;
}
