// 写意留白 v1 · 页面主程序。打包：node tools/xieyi_v1/build.mjs → docs/art/写意留白_v1/index.html（file:// 可直接打开）
// 场景沿用总小样（tools/art_refine_v1）的山神庙 B 水墨场景与游戏渲染设置；角色 = hero_v2.glb，只换脸 / 衣袍材质。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { U, TEX } from "../../../src/render/materials.js";
import { bakeAll } from "../../../src/render/bake.js";
import { InkPipeline } from "../../../src/render/ink.js";
import { HERO, groundH } from "../../art_refine_v1/src/layout.js";
import { Looks, initShared } from "../../art_refine_v1/src/shading.js";
import { bakeNoise } from "../../art_refine_v1/src/texbake.js";
import { buildTemple } from "../../art_refine_v1/src/temple.js";
import { buildEnv } from "../../art_refine_v1/src/env.js";
import * as C from "../../../docs/art/精细化小样_v1/assets/char_mats.js";
import heroGlb from "../../../docs/art/精细化小样_v1/assets/hero_v2.glb";
import { VARIANTS, applyVariant, allVariantMaterials } from "./xieyi.js";

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const state = { v: "V1", view: "bust", anim: "idle", post: "ink", t: "" };
for (const kv of location.hash.slice(1).split("&")) {
  const [k, val] = kv.split("=");
  if (k && val != null && k in state) state[k] = decodeURIComponent(val);
}

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !1, powerPreference: "high-performance", preserveDrawingBuffer: !0 });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Object.assign(TEX, bakeAll(renderer));
const ink = new InkPipeline(renderer);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece6d6);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
const sunDir = new THREE.Vector3(-26, 40, -14).normalize();
sun.castShadow = !0;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85));

initShared(bakeNoise(renderer));
const looks = new Looks();
looks.mode = "B";
scene.add(buildTemple(renderer, looks), buildEnv(renderer, looks));
looks.setMode("B");

// ---- 主角 ----
const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) => loader.parse(heroGlb.buffer.slice(heroGlb.byteOffset, heroGlb.byteOffset + heroGlb.byteLength), "", res, rej));
const hero = gltf.scene;
hero.position.set(HERO.x, groundH(HERO.x, HERO.z), HERO.z);
hero.rotation.y = HERO.yaw;
scene.add(hero);
hero.updateMatrixWorld(!0);
applyVariant(hero, "V0", C); // 先建好描边壳 / 斗笠
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 1.8).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({ transparent: !0, depthWrite: !1, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.12, 0.12, 0.11, (1.0 - smoothstep(0.15, 1.0, r)) * 0.42); }` }),
);
blob.position.set(HERO.x, groundH(HERO.x, HERO.z) + 0.03, HERO.z);
blob.rotation.y = HERO.yaw;
scene.add(blob);

const mixer = new THREE.AnimationMixer(hero);
const act = {};
for (const c of gltf.animations) act[c.name] = mixer.clipAction(c);
const SEQ = ["slash1", "slash2", "slash3"];
let cur = null, k = 0, wait = 0;
function play(name, once) {
  const a = act[name] || act.idle;
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = !0;
  a.play();
  if (cur && cur !== a) a.crossFadeFrom(cur, 0.12, !1);
  cur = a;
}
mixer.addEventListener("finished", () => {
  if (state.anim === "slash") play("idle"), (wait = 0.35);
});

// ---- 镜头 ----
const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 1200);
const headBone = hero.getObjectByName("head");
const _v = new THREE.Vector3();
function placeCam() {
  const base = new THREE.Vector3(HERO.x, groundH(HERO.x, HERO.z), HERO.z);
  if (state.view === "game") {
    const tgt = base.clone().add(new THREE.Vector3(0, 0.9, 0)), d = 30, p = 45 * DEG;
    cam.position.set(tgt.x, tgt.y + Math.sin(p) * d, tgt.z + Math.cos(p) * d);
    cam.lookAt(tgt);
    return;
  }
  // 近景：从主角正面偏 30° 看（主角朝向 = HERO.yaw）
  const yaw = HERO.yaw - 0.6;
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  let tgt, d, el;
  if (state.view === "bust") {
    headBone.getWorldPosition(_v);
    tgt = _v.clone().add(new THREE.Vector3(0, -0.06, 0));
    d = 1.55;
    el = 0.1;
  } else {
    tgt = base.clone().add(new THREE.Vector3(0, 0.95, 0));
    d = 5.6;
    el = 0.12;
  }
  cam.position.copy(tgt).addScaledVector(dir, d * Math.cos(el)).add(new THREE.Vector3(0, d * Math.sin(el), 0));
  cam.lookAt(tgt);
}
function updateShadow() {
  const f = new THREE.Vector3(HERO.x, 1, HERO.z);
  sun.target.position.copy(f);
  sun.position.copy(f).addScaledVector(sunDir, 80);
  sun.target.updateMatrixWorld();
}

// ---- 界面 ----
function setVis() {
  applyVariant(hero, state.v, C);
  $("note").innerHTML = `<span class="kai">${VARIANTS[state.v].name}</span>${VARIANTS[state.v].note}`;
  $("tag").innerHTML = VARIANTS[state.v].name + `<small>${{ bust: "近景 · 头肩", full: "近景 · 全身", game: "游戏镜头 45° · 距 30 米 · 视角 30°" }[state.view]}</small>`;
  document.querySelectorAll(".seg").forEach((s) => s.querySelectorAll("a").forEach((a) => a.classList.toggle("on", state[s.dataset.k] === a.dataset.v)));
}
function setAnim() {
  k = 0;
  wait = state.anim === "slash" ? 0.3 : 0;
  play("idle");
}
document.querySelectorAll(".seg").forEach((s) =>
  s.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    state[s.dataset.k] = a.dataset.v;
    if (s.dataset.k === "anim") setAnim();
    setVis();
    history.replaceState(null, "", "#" + ["v", "view", "anim", "post"].map((q) => q + "=" + state[q]).join("&"));
  }),
);
function setSize() {
  const st = $("stage");
  renderer.setSize(st.clientWidth, st.clientHeight, !1);
  ink.setSize(st.clientWidth, st.clientHeight);
  cam.aspect = st.clientWidth / st.clientHeight;
  cam.updateProjectionMatrix();
}

const clock = new THREE.Clock();
function render() {
  placeCam();
  if (state.post === "ink") ink.render(scene, cam, U.uTime.value);
  else renderer.render(scene, cam);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  U.uTime.value += dt;
  if (state.t === "") {
    if (state.anim === "slash" && wait > 0 && (wait -= dt) <= 0) play(SEQ[k++ % SEQ.length], !0);
    mixer.update(dt);
  }
  render();
}

setSize();
updateShadow();
setAnim();
// 截图用：#t=秒 固定动作时间（待机 = idle 的 t 秒；挥砍 = slash1 的 t 秒）
if (state.t !== "") {
  mixer.stopAllAction();
  const a = act[state.anim === "slash" ? "slash1" : "idle"];
  a.reset().play();
  mixer.setTime(+state.t);
}
// 预热：每个变体真画一帧
const keep = state.v;
for (const v of Object.keys(VARIANTS)) {
  state.v = v;
  setVis();
  render();
}
state.v = keep;
setVis();
allVariantMaterials();
$("loading").style.display = "none";
window.__xy = { ready: !0, state, set(o) { Object.assign(state, o); setVis(); }, dbg() { const out = []; hero.traverse((o) => { if (o.isMesh) out.push([o.name, o.type, o.material && o.material.name, o.geometry.index ? o.geometry.index.count : -1, o.userData.isOutline ? 1 : 0, o.visible]); }); return out; } };
frame();
