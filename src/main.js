// 墨途：渲染器、战斗世界与共享上下文常驻；画面由场景流程（src/game/flow/flow.js）切换：
//   开始界面 → 开场 → 洞府 → 出行准备 → 出行局 → 结算 → 洞府。
// 共享上下文 ctx 把场景、战斗世界、输入、特效交给各模块；模块之间只通过 ctx.world（战斗核心）互相影响。
// 启动参数：?scene=title（默认）| sandbox（旧的战斗沙盒，自动化测试不带参数时默认进沙盒，保持旧测试可用）| cave | prep | run
//          &slot=1~3（配合 cave / prep / run 载入或新建存档）&region=r1|r2|tutorial
import * as THREE from "three";
import { bakeAll, brushTextures } from "./render/bake.js";
import { TEX, U } from "./render/materials.js";
import { InkPipeline } from "./render/ink.js";
import { keepPrograms } from "./render/perf.js";
import { Quality } from "./render/quality.js";
import { Player } from "./game/player.js";
import { CameraRig } from "./game/camera.js";
import * as terrain from "./world/terrain.js";
import { CombatWorld } from "./core/combat.js";
import { Input } from "./core/input.js";
import { VFX } from "./fx/vfx.js";
import { Feedback } from "./game/feedback.js";
import { EnemyDirector } from "./game/enemies/index.js";
import { SkillSystem } from "./game/skills/index.js";
import { Shields } from "./game/shields.js";
import { Flow } from "./game/flow/flow.js";
import { showBackdrop, sampleProps } from "./game/run/map.js";

window.__errors = [];
addEventListener("error", (e) => window.__errors.push(String(e.message)));
addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason && (e.reason.stack || e.reason))));

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !1, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
keepPrograms(renderer); // 特效材质反复创建 / 释放时不重新编译着色器（集显上每次 50–150ms 的卡顿）

// GPU 烘焙贴图（皴法、点苔）与 Canvas 笔触贴图
Object.assign(TEX, bakeAll(renderer));
const brush = brushTextures();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece6d6);

// 光：低角度的左后方日光（让朝向镜头的崖壁落在暗部，台地顶面明亮），加天光
const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
sun.position.set(-26, 40, -14);
sun.target.position.set(0, 0, -2);
sun.castShadow = !0;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -40;
sc.right = 40;
sc.top = 40;
sc.bottom = -40;
sc.near = 1;
sc.far = 140;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85));

const colliders = [];

// ---- 共享上下文 ----
const ctx = { THREE, scene, renderer, colliders, terrain, brush, sun, world: new CombatWorld(), input: new Input(canvas), vfx: new VFX(scene) };
// 美术样张地图：标题 / 菜单背景，以及关卡模块未就绪时的出行地图（src/game/run/map.js）
const sample = showBackdrop(ctx);
const props = sample.props;
ctx.player = new Player(ctx);
const player = ctx.player;
const rig = (ctx.rig = new CameraRig(player));
ctx.camera = rig.cam;
ctx.vfx.camera = rig.cam;
ctx.shields = new Shields(ctx); // 先于敌人创建，才能收到精英出场事件
ctx.enemies = new EnemyDirector(ctx);
ctx.skills = new SkillSystem(ctx);
ctx.feedback = new Feedback(ctx);
ctx.enemies.auto = !1; // 刷怪由出行局控制（沙盒场景会打开）
const ink = (ctx.ink = new InkPipeline(renderer));

function resize() {
  renderer.setSize(innerWidth, innerHeight, !1);
  rig.cam.aspect = innerWidth / innerHeight;
  rig.cam.updateProjectionMatrix();
  ink.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();
// 画质档位（设置 → 画质）：分辨率、MSAA、阴影尺寸、植被密度、墨线采样数；自动档按帧时降档（src/render/quality.js）
const quality = (ctx.quality = new Quality({ renderer, scene, ink, resize }));
quality.apply();
ctx.world.events.on("run:start", () => quality.sync());

const game = (window.__game = {
  THREE,
  ctx,
  world: ctx.world,
  scene,
  renderer,
  camera: rig.cam,
  rig,
  player,
  ink,
  props,
  frameMs: 0,
  setView: (name) => rig.set(name, !0),
  setInk: (v) => (ink.mat.uniforms.uInk.value = v),
  setTint: (v) => (ink.mat.uniforms.uTint.value = v),
});

// ---- 场景流程 ----
const flow = new Flow(ctx);
game.flow = flow;
{
  // 场景切换完成后按画质档位同步新场景的灯光阴影 / 植被
  const go = flow.go.bind(flow);
  flow.go = async (...a) => {
    const r = await go(...a);
    quality.sync();
    return r;
  };
}
game.setQuality = (m) => quality.set(m);
Object.defineProperty(game, "quality", { get: () => ({ mode: quality.mode, tier: quality.tier, pixelRatio: renderer.getPixelRatio(), auto: quality.lastAuto }), configurable: !0 });
Object.defineProperty(game, "profile", { get: () => flow.profile, configurable: !0 });
game.run = null;
const qs = new URLSearchParams(location.search);
const first = qs.get("scene") || (navigator.webdriver ? "sandbox" : "title");
(async () => {
  try {
    if (["cave", "prep", "run"].includes(first)) {
      const slot = Number(qs.get("slot") || 1);
      if (!flow.loadGame(slot)) flow.newGame(slot);
      if (first !== "run") flow.profile.flags.tutorialDone = !0;
      await flow.go(first, { region: qs.get("region") || "r1" });
      // 宣传片 / 试玩调试入口（?preset=T1..T4&boss=qingya&hud=0|boss&seed=N，src/dev/promo.js）：只在带这些参数时加载
      if (first === "run" && ["preset", "boss", "hud", "seed"].some((k) => qs.has(k))) import("./dev/promo.js").then((m) => m.install(game, qs)).catch((e) => console.error("[promo]", e));
    } else await flow.go(first);
  } catch (e) {
    console.error("[flow] 启动场景失败", e);
    window.__errors.push(String(e && e.stack));
  }
})();

player.load().then((src) => {
  game.heroSource = src;
  console.log("[player] " + src);
});

const clock = new THREE.Clock();
let acc = 0, n = 0;
renderer.setAnimationLoop(() => {
  const raw = Math.min(clock.getDelta(), 0.05);
  const t0 = performance.now();
  U.uTime.value += raw;
  ctx.input.update(rig.cam, player.pos.y);
  const dt = ctx.world.step(raw); // 玩法时间：受顿帧 / 慢动作影响
  if (flow.live) {
    player.update(dt);
    ctx.enemies.update(dt);
    ctx.skills.update(dt);
    ctx.shields.update(dt);
  }
  ctx.vfx.update(dt);
  ctx.feedback.update(dt, raw);
  flow.update(dt, raw);
  rig.update(raw);
  U.uPlayer.value.copy(player.pos);
  U.uCam.value.copy(rig.cam.position);
  const sp = sampleProps();
  if (sp) for (const o of sp.userData.interact) o.userData.kind === "herb" && (o.children[1].material.uniforms.uTime.value = U.uTime.value);
  if (!ctx.hold3d) ink.render(scene, rig.cam, U.uTime.value); // 洞府全屏设施页盖住画面时暂停 3D 渲染（模块 C 设置 ctx.hold3d）
  quality.frame(raw, flow.live && !ctx.hold3d);
  ctx.input.endFrame();
  acc += performance.now() - t0;
  if (++n === 30) (game.frameMs = acc / n), (acc = 0), (n = 0);
  window.__ready = !0;
});
