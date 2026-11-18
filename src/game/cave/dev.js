// 洞府调试页（模块 C）：不依赖流程模块，单独搭一个最小的 ctx 跑洞府。/src/game/cave/dev.html?preset=rich
// preset：fresh 刚进洞府（练气一层，破洞府）/ rich 满仓材料（练气四层）/ r9 练气九层 + 筑基丹（测心魔劫）
import * as THREE from "three";
import { bakeAll, brushTextures } from "../../render/bake.js";
import { TEX, U } from "../../render/materials.js";
import { InkPipeline } from "../../render/ink.js";
import * as terrain from "../../world/terrain.js";
import { Player } from "../player.js";
import { CameraRig } from "../camera.js";
import { CombatWorld } from "../../core/combat.js";
import { Input } from "../../core/input.js";
import { VFX } from "../../fx/vfx.js";
import { Feedback } from "../feedback.js";
import { newProfile } from "../../core/profile.js";
import { makeItem, ITEMS } from "../../core/items.js";
import { applyUnlocks } from "../progression.js";
import { Cave } from "./index.js";
import { ensureCaveItems, itemId } from "./data.js";

window.__errors = [];
addEventListener("error", (e) => window.__errors.push(String(e.message)));
addEventListener("unhandledrejection", (e) => window.__errors.push(String(e.reason && (e.reason.stack || e.reason))));

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !1, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = !0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Object.assign(TEX, bakeAll(renderer));
const brush = brushTextures();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece6d6);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
sun.position.set(-26, 40, -14);
sun.target.position.set(0, 0, -2);
sun.castShadow = !0;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85));

const ctx = { THREE, scene, renderer, colliders: [], terrain, brush, world: new CombatWorld(), input: new Input(canvas), vfx: new VFX(scene) };
ctx.player = new Player(ctx);
const rig = (ctx.rig = new CameraRig(ctx.player));
ctx.camera = rig.cam;
ctx.vfx.camera = rig.cam;
ctx.feedback = new Feedback(ctx);
const ink = new InkPipeline(renderer);

// ---- 测试存档 ----
ensureCaveItems();
const preset = new URLSearchParams(location.search).get("preset") || "rich";
function give(p, name, n = 1, o = {}) {
  const id = itemId(name);
  if (!ITEMS[id]) return console.warn("[cave-dev] 无此物品", name);
  p.storage.add(makeItem(id, { n, ...o }));
}
function testProfile(kind) {
  const p = newProfile(9);
  p.realm = { stage: 1, layer: 1 };
  p.flags.caveTips = kind === "fresh" ? {} : { enter: !0 };
  give(p, "灵石", 40);
  if (kind === "fresh") return applyUnlocks(p), p;
  p.realm = kind === "r9" ? { stage: 1, layer: 9 } : { stage: 1, layer: 4 };
  p.stats.runs = 3;
  for (const [n, k] of [["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["灵石", 50], ["青灵草", 12], ["凝露花", 10], ["铁精石", 18], ["狼妖牙", 6], ["狼皮", 12], ["灵丝", 6], ["灵土", 10], ["紫藤", 2], ["赤炎果", 4], ["灵玉", 3], ["狼妖内丹", 3], ["蝠妖内丹", 1], ["炼器鼎残件", 1], ["骨粉", 6], ["妖丹碎片", 6]]) give(p, n, k); // 骨粉：回春丹辅材；妖丹碎片：重铸材料（怪物生态 v1 起）
  give(p, "狼王遗骨", 1);
  give(p, "青灵草苗", 2);
  give(p, "赤炎果苗", 1);
  give(p, "紫藤苗", 1, { rarity: 2 }); // 百年 · 宝品
  give(p, "聚气丹", 2, { rarity: 1 });
  give(p, "回春丹", 3);
  give(p, "青锋剑", 1, { rarity: 2 }); // 宝品：未鉴定
  give(p, "布法衣", 1, { rarity: 1, affixes: [{ stat: "hp", type: "flat", value: 30 }] });
  give(p, "《缠藤诀》", 1, { identified: !0 });
  give(p, "丹方《聚气丹》", 1);
  if (kind === "r9") {
    p.xp = 1400;
    give(p, "筑基丹", 1, { rarity: 1 });
  }
  applyUnlocks(p);
  return p;
}
ctx.profile = testProfile(preset);
ctx.save = () => localStorage.setItem("moxian.cave.dev", JSON.stringify(ctx.profile).length);

const cave = (ctx.cave = new Cave(ctx));
window.__cdev = { ctx, cave, testProfile, give };

function resize() {
  renderer.setSize(innerWidth, innerHeight, !1);
  rig.cam.aspect = innerWidth / innerHeight;
  rig.cam.updateProjectionMatrix();
  ink.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

ctx.player.load().then(() => {
  cave.enter();
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const raw = Math.min(clock.getDelta(), 0.05);
    U.uTime.value += raw;
    ctx.input.update(rig.cam, ctx.player.pos.y);
    const dt = ctx.world.step(raw);
    cave.update(dt);
    ctx.player.update(dt);
    ctx.vfx.update(dt);
    ctx.feedback.update(dt, raw);
    rig.update(raw);
    U.uPlayer.value.copy(ctx.player.pos);
    U.uCam.value.copy(rig.cam.position);
    if (!ctx.hold3d) ink.render(scene, rig.cam, U.uTime.value);
    ctx.input.endFrame();
    if (++frames > 5) window.__ready = !0;
  });
});
