// 精细化小样 v1 · 页面主程序。打包：node tools/art_refine_v1/build.mjs → docs/art/精细化小样_v1/index.html（file:// 可直接打开）。
// 渲染设置与游戏一致（src/main.js）：无抗锯齿画布 + 水墨后期 RT（4×MSAA、半浮点）、PCFSoft 阴影 4096、日光 (-26,40,-14) 2.0、半球光 0.85、宣纸底色。
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { U, TEX } from "../../../src/render/materials.js";
import { bakeAll, brushTextures } from "../../../src/render/bake.js";
import { InkPipeline } from "../../../src/render/ink.js";
import { buildLegacyEnv, legacyLook, LEGACY } from "./legacy.js";
import { HERO, BOSS, groundH } from "./layout.js";
import { Looks, initShared } from "./shading.js";
import { bakeNoise, BAKE_STATS } from "./texbake.js";
import { buildTemple } from "./temple.js";
import { buildEnv } from "./env.js";
import heroGlb from "../../../assets/models/hero.glb";
import bossGlb from "../../../assets/models/qingya.glb";
import * as CHARS from "virtual:chars";

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const state = { ver: "new", shade: "B", lod: "full", cam: "game", anim: "idle", post: "ink", size: "720", pr: "1.5" };
for (const kv of location.hash.slice(1).split("&")) {
  const [k, v] = kv.split("=");
  if (k && v != null && k in state) state[k] = decodeURIComponent(v);
}
const orbitHash = /(?:^|[#&])o=([-\d.,]+)/.exec(location.hash);

// ---------------- 渲染器（同游戏） ----------------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !1, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, +state.pr));
renderer.shadowMap.enabled = !0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = !1;
Object.assign(TEX, bakeAll(renderer));
const brush = brushTextures();
const ink = new InkPipeline(renderer);
// C 模式：后期取色前做曝光 + ACES 色调映射（uTone = 0 时原样，A / B 与游戏后期逐像素一致）
ink.mat.uniforms.uTone = { value: 0 };
ink.mat.fragmentShader = ink.mat.fragmentShader
  .replace("varying vec2 vUv;", "varying vec2 vUv;\nuniform float uTone;\nvec3 jxTone(vec3 c){ if (uTone <= 0.0) return c; c *= uTone; return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }")
  .replace("vec3 col = toSRGB(texture2D(tColor, vUv).rgb);", "vec3 col = toSRGB(jxTone(texture2D(tColor, vUv).rgb));");
ink.mat.needsUpdate = !0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece6d6);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
const sunDir = new THREE.Vector3(-26, 40, -14).normalize();
sun.castShadow = !0;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -38;
sc.right = sc.top = 38;
sc.near = 1;
sc.far = 160;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
const hemi = new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85);
scene.add(sun, sun.target, hemi);

// C 模式的环境光照：程序化天穹（上亮下暗的宣纸色）→ PMREM，只在进场时生成一次
function makeEnv() {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 sky = mix(vec3(0.78, 0.77, 0.72), vec3(0.62, 0.68, 0.74), smoothstep(0.0, 0.9, y)); vec3 gnd = vec3(0.30, 0.29, 0.26); vec3 c = mix(gnd, sky, smoothstep(-0.12, 0.05, y)); vec3 sd = normalize(vec3(-26.0, 40.0, -14.0)); c += vec3(1.6, 1.5, 1.3) * pow(max(dot(normalize(vP), sd), 0.0), 64.0); gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0);
  pm.dispose();
  geo.dispose();
  mat.dispose();
  return rt.texture;
}
const envTex = makeEnv();

// ---------------- 场景内容 ----------------
const noiseTex = bakeNoise(renderer);
initShared(noiseTex);
const looks = new Looks();
looks.mode = state.shade;
const legacyEnv = buildLegacyEnv(brush);
const t0 = performance.now();
const newTemple = buildTemple(renderer, looks);
const newEnv = buildEnv(renderer, looks);
const buildMs = performance.now() - t0;
const groups = { legacyEnv, newTemple, newEnv };
scene.add(legacyEnv, newTemple, newEnv);

// ---- 角色 ----
const loader = new GLTFLoader();
const parse = (u8) => new Promise((res, rej) => loader.parse(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), "", res, rej));
const chars = { old: {}, new: {} };
function placeChar(root, P, scale) {
  root.position.set(P.x, groundH(P.x, P.z), P.z);
  root.rotation.y = P.yaw;
  root.scale.setScalar(scale);
  scene.add(root);
}
// 动作：待机循环；攻击 = 攻击段依次播放、段间回待机 0.5 秒，循环
function animator(root, clips, attackNames) {
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  for (const c of clips) act[c.name.toLowerCase()] = mixer.clipAction(c);
  const seq = attackNames.filter((n) => act[n]);
  let mode = "idle", cur = null, k = 0, wait = 0;
  const play = (name, once) => {
    const a = act[name] || act.idle;
    if (!a) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !0;
    a.enabled = !0;
    a.play();
    if (cur && cur !== a) a.crossFadeFrom(cur, 0.12, !1);
    cur = a;
  };
  mixer.addEventListener("finished", () => {
    if (mode !== "attack") return;
    play("idle");
    wait = 0.5;
  });
  play("idle");
  return {
    mixer,
    setMode(m) {
      mode = m;
      k = 0;
      wait = 0.2;
      play("idle");
    },
    update(dt) {
      if (mode === "attack" && wait > 0 && (wait -= dt) <= 0) play(seq[k++ % seq.length] || "idle", !0);
      mixer.update(dt);
    },
  };
}
const animators = [];
async function loadChars() {
  const [hg, bg] = await Promise.all([parse(heroGlb), parse(bossGlb)]);
  // 现状
  const h0 = legacyLook(hg, LEGACY.HERO_PAL, "robe_white", 0.018, { side: THREE.DoubleSide });
  const b0 = legacyLook(bg, LEGACY.BOSS_PAL, "fur_ink", 0.016, { hide: ["qingya_crack", "qingya_eyefire"] });
  placeChar(h0, HERO, 1);
  placeChar(b0, BOSS, 2.2);
  chars.old = { hero: h0, boss: b0, hg, bg };
  animators.push((chars.old.ha = animator(h0, hg.animations, ["slash1", "slash2", "slash3"])), (chars.old.ba = animator(b0, bg.animations, ["attack_bite", "attack_claw"])));
  // 精细版（art-char 交付；哪个没到就用现状模型占位）
  if (CHARS.C) {
    const S = CHARS.C.SCALE || { hero: 1, qingya: 2.2 };
    const CL = CHARS.C.CLIPS || {};
    if (CHARS.heroV2) {
      const hn = await parse(CHARS.heroV2);
      const h1 = hn.scene;
      CHARS.C.applyCharLook(h1, state.shade, { renderer, kind: "hero" });
      placeChar(h1, HERO, S.hero ?? 1);
      chars.new.hero = h1;
      const atk = (CL.hero || []).filter((n) => n !== "idle");
      animators.push((chars.new.ha = animator(h1, hn.animations, atk.length ? ["slash1", "slash2", "slash3"].filter((n) => hn.animations.some((c) => c.name === n)) : ["slash1"])));
    }
    if (CHARS.bossV2) {
      const bn = await parse(CHARS.bossV2);
      const b1 = bn.scene;
      CHARS.C.applyCharLook(b1, state.shade, { renderer, kind: "qingya" });
      // 一阶段：隐藏裂缝 / 眼焰子网格（连描边壳）
      b1.traverse((o) => {
        if (o.isMesh && !o.userData.isOutline && /crack|eyefire/i.test(o.name)) {
          o.visible = !1;
          if (o.userData.outline) o.userData.outline.visible = !1;
        }
      });
      placeChar(b1, BOSS, S.qingya ?? 2.2);
      chars.new.boss = b1;
      animators.push((chars.new.ba = animator(b1, bn.animations, ["attack_bite", "attack_claw"])));
    }
  }
}

// 角色脚下接触影（精细版）：一张径向渐变的墨晕，跟随角色根节点；2 个 draw call
const blobMat = new THREE.ShaderMaterial({
  transparent: !0,
  depthWrite: !1,
  uniforms: {},
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.42; gl_FragColor = vec4(0.12, 0.12, 0.11, a); }`,
});
const blobs = [];
for (const [P, r] of [[HERO, 0.7], [BOSS, 2.6]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2.6).rotateX(-Math.PI / 2), blobMat);
  m.position.set(P.x, groundH(P.x, P.z) + 0.03, P.z);
  m.rotation.y = P.yaw;
  m.renderOrder = 2;
  m.userData.blob = !0;
  scene.add(m);
  blobs.push(m);
}

// ---------------- 镜头 ----------------
const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 1200);
const target = new THREE.Vector3(HERO.x, groundH(HERO.x, HERO.z) + 0.9, HERO.z); // 游戏：跟随主角，注视点 = 脚底 + 0.9
const orbit = new OrbitControls(cam, canvas);
orbit.enableDamping = !0;
orbit.target.set(1.5, 2.2, -0.5);
orbit.minDistance = 3;
orbit.maxDistance = 60;
orbit.maxPolarAngle = 88 * DEG;
const orbitPose = orbitHash ? orbitHash[1].split(",").map(Number) : [-7.5, 4.6, 8.5, 0.8, 2.0, -3.2];
function setGameCam() {
  const dist = 30, pitch = 45 * DEG, yaw = 0, c = Math.cos(pitch);
  cam.position.set(target.x + Math.sin(yaw) * c * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * c * dist);
  cam.lookAt(target);
}
function applyCam() {
  orbit.enabled = state.cam === "orbit";
  if (state.cam === "game") setGameCam();
  else {
    cam.position.set(orbitPose[0], orbitPose[1], orbitPose[2]);
    if (orbitPose.length >= 6) orbit.target.set(orbitPose[3], orbitPose[4], orbitPose[5]);
    orbit.update();
  }
}
// 阴影跟随注视点（游戏：跟随主角，按阴影贴图像素取整防闪烁）
function updateShadow() {
  const f = state.cam === "game" ? target : orbit.target;
  const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
  sun.target.position.set(Math.round(f.x / texel) * texel, Math.round(f.y), Math.round(f.z / texel) * texel);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 80);
  sun.target.updateMatrixWorld();
}

// ---------------- 状态切换 ----------------
const NOTES = {
  old: "<span class='kai'>现状</span>游戏里现在的样子：程序化方盒拼接的山神庙、二十面体山石、十字插片草；角色是 hero.glb / qingya.glb + PALETTE 纯色 toon。着色固定为 A。",
  A: "<span class='kai'>A 现行 toon</span>游戏现有的 3 阶色阶（70 / 165 / 255）+ 水墨后期，只换几何与反照率贴图。最省：不用法线 / AO，暗部是一整块平涂。",
  B: "<span class='kai'>B 水墨写意</span>同一色阶，但法线贴图让色阶沿瓦缝、石纹断开（像皴擦），AO 压住接缝与接地处，暗部叠披麻皴笔、缝隙勾淡墨。比 A 多 2 次采样 + 1 次三向投影。",
  C: "<span class='kai'>C 写实 PBR</span>MeshStandardMaterial（粗糙度 / 法线 / AO / 环境光照）+ 后期色调映射，再过水墨后期。体积感最强，但水墨的平涂感最弱，片元成本最高。",
};
function setVis() {
  const isNew = state.ver === "new";
  legacyEnv.visible = !isNew;
  newTemple.visible = newEnv.visible = isNew;
  const hasNewChars = !!(chars.new.hero && chars.new.boss);
  for (const k of ["hero", "boss"]) {
    if (chars.old[k]) chars.old[k].visible = !isNew || !chars.new[k];
    if (chars.new[k]) chars.new[k].visible = isNew;
  }
  for (const b of blobs) b.visible = isNew;
  // 精细度：全量 / 游戏预算（隐藏近景细节件、草与碎石实例减半）
  const budget = state.lod === "budget";
  for (const r of [newTemple, newEnv])
    r.traverse((o) => {
      if (o.userData.detail) o.visible = !budget;
      if (o.userData.budget) o.count = budget ? Math.floor(o.instanceMatrix.count * o.userData.budget) : o.instanceMatrix.count;
    });
  const shade = isNew ? state.shade : "A";
  looks.setMode(shade);
  const pbr = shade === "C" && isNew;
  scene.environment = pbr ? envTex : null;
  hemi.intensity = pbr ? 0.3 : 0.85; // C：环境贴图承担天光，半球光只留一点，否则暗部被双重补光洗白
  ink.mat.uniforms.uTone.value = pbr ? 0.62 : 0;
  ink.mat.uniforms.uInk.value = state.post === "ink" ? 1 : 0;
  if (CHARS.C) {
    if (chars.new.hero) CHARS.C.applyCharLook(chars.new.hero, shade, { renderer, kind: "hero" });
    if (chars.new.boss) CHARS.C.applyCharLook(chars.new.boss, shade, { renderer, kind: "qingya" });
  }
  for (const a of animators) a.setMode(state.anim);
  $("note").innerHTML = isNew ? NOTES[state.shade] + (hasNewChars ? "" : chars.new.boss || chars.new.hero ? `（精细版${chars.new.hero ? "青牙" : "林墨"}未到，暂用现状模型占位）` : "（精细版角色未到，暂用现状模型占位）") : NOTES.old;
  $("tag").innerHTML = (isNew ? "精细版 · " + { A: "A 现行 toon", B: "B 水墨写意", C: "C 写实 PBR" }[state.shade] : "现状") + `<small>${state.cam === "game" ? "游戏镜头 45° · 距 30 米 · 视角 30°" : "近景环绕"}</small>`;
  $("hint").textContent = state.cam === "orbit" ? "左键拖拽环绕 · 右键平移 · 滚轮缩放" : "";
  document.querySelectorAll(".seg").forEach((s) => s.querySelectorAll("a").forEach((a) => a.classList.toggle("on", state[s.dataset.k] === a.dataset.v)));
  for (const k of ["shade", "lod"]) document.querySelector(`.seg[data-k="${k}"]`).querySelectorAll("a").forEach((a) => a.classList.toggle("dis", !isNew));
  statsDirty = !0;
  benchSoon();
}
function setSize() {
  const st = $("stage");
  st.classList.toggle("full", state.size === "full");
  const w = st.clientWidth, h = st.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, +state.pr));
  renderer.setSize(w, h, !1);
  ink.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  statsDirty = !0;
}
document.querySelectorAll(".seg").forEach((s) =>
  s.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    state[s.dataset.k] = a.dataset.v;
    if (s.dataset.k === "cam") applyCam();
    if (s.dataset.k === "size" || s.dataset.k === "pr") setSize();
    setVis();
    history.replaceState(null, "", "#" + Object.entries(state).map(([k, v]) => k + "=" + v).join("&"));
  }),
);
document.querySelector("[data-act=bench]").addEventListener("click", () => bench());
document.querySelector("[data-act=unfull]").addEventListener("click", () => {
  state.size = "720";
  setSize();
  setVis();
});
addEventListener("keydown", (e) => e.key === "Escape" && state.size === "full" && ((state.size = "720"), setSize(), setVis()));
addEventListener("resize", () => state.size === "full" && setSize());

// ---------------- 实测统计 ----------------
const gl = renderer.getContext();
const tq = gl.getExtension("EXT_disjoint_timer_query_webgl2");
const queries = [], qPool = [];
let gpuMs = 0, gpuN = 0, gpuShow = null;
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
$("gpuname").textContent = "显卡：" + String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/ANGLE \((.*)\)/, "$1") + (tq ? "" : "（无 GPU 计时扩展：GPU 毫秒不可用）");
let statsDirty = !0;
const texBytes = (t) => {
  const im = t.image || {};
  const w = im.width || 0, h = im.height || 0;
  const bpp = t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : t.format === THREE.RedFormat ? 1 : 4;
  return w * h * bpp * (t.generateMipmaps || t.mipmaps?.length || t.minFilter === THREE.LinearMipmapLinearFilter ? 4 / 3 : 1);
};
const TEX_KEYS = ["map", "normalMap", "aoMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "gradientMap"];
function groupStats(root, seen) {
  let tris = 0, meshes = 0, inst = 0, cast = 0, tex = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const c = o.isInstancedMesh ? o.count : 1;
    tris += n * c;
    meshes++;
    inst += c;
    if (o.castShadow) cast++;
    for (const m of [].concat(o.material)) {
      const list = TEX_KEYS.map((k) => m[k]).filter(Boolean);
      if (m.userData.look && m.defines && m.defines.JX_BRUSH !== undefined) list.push(TEX.cunfa);
      if (m.defines && (m.defines.JX_TRI !== undefined || m.defines.JX_TERRAIN !== undefined)) list.push(TEX.cunfa), m.defines.JX_TERRAIN !== undefined && list.push(TEX.ground); // 游戏 toon 的皴法 / 点苔贴图
      if (m.userData.inkU) for (const k of ["tInk", "tAlb"]) m.userData.inkU[k].value && list.push(m.userData.inkU[k].value);
      for (const t of list) if (!seen.has(t)) seen.add(t), (tex += texBytes(t));
    }
  });
  return { tris, meshes, inst, cast, tex };
}
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n)));
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
let totalTexBytes = 0;
function refreshStats() {
  statsDirty = !1;
  const seen = new Set();
  const isNew = state.ver === "new";
  const rows = isNew
    ? [["建筑（山神庙）", newTemple], ["环境（地面 / 石 / 植被）", newEnv]]
    : [["建筑 + 环境（现状）", legacyEnv]];
  const chHero = isNew && chars.new.hero ? chars.new.hero : chars.old.hero, chBoss = isNew && chars.new.boss ? chars.new.boss : chars.old.boss;
  if (chHero) rows.push(["主角 林墨", chHero]);
  if (chBoss) rows.push(["首领 青牙", chBoss]);
  let html = "", T = { tris: 0, meshes: 0, inst: 0, cast: 0, tex: 0 };
  for (const [name, g] of rows) {
    const s = groupStats(g, seen);
    for (const k in T) T[k] += s[k];
    html += `<tr><td>${name}</td><td>${fmt(s.tris)}</td><td>${s.meshes} / ${fmt(s.inst)}</td><td>${s.cast}</td><td>${mb(s.tex)}</td></tr>`;
  }
  // 共享：噪声 / 纸纹 / 色阶
  html += `<tr class="sum"><td>合计（一遍）</td><td>${fmt(T.tris)}</td><td>${T.meshes} / ${fmt(T.inst)}</td><td>${T.cast}</td><td>${mb(T.tex)}</td></tr>`;
  $("rows").innerHTML = html;
  totalTexBytes = T.tex;
  $("vram").textContent = mb(T.tex);
  $("tris").textContent = fmt(T.tris);
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0, cpuAcc = 0, callsShow = 0;
let ready = !1;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, clock.getDelta());
  U.uTime.value += dt;
  for (const a of animators) a.update(dt);
  if (state.cam === "orbit") orbit.update();
  updateShadow();
  U.uPlayer.value.set(HERO.x, groundH(HERO.x, HERO.z), HERO.z);
  U.uCam.value.copy(cam.position);
  // GPU 计时
  let q = null;
  if (tq && queries.length < 6 && !benchBusy) {
    q = qPool.pop() || gl.createQuery(); // 查询对象池：不每帧新建 WebGL 对象
    gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
  }
  const c0 = performance.now();
  renderer.info.reset();
  ink.render(scene, cam, U.uTime.value);
  cpuAcc += performance.now() - c0;
  callsShow = renderer.info.render.calls;
  if (q) gl.endQuery(tq.TIME_ELAPSED_EXT), queries.push(q);
  for (let i = 0; i < queries.length; i++) {
    const qq = queries[i];
    if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) break;
    if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) (gpuMs += gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6), gpuN++;
    qPool.push(qq);
    queries.shift();
    i--;
  }
  fpsN++;
  fpsT += dt;
  if (fpsT >= 0.5) {
    $("fps").textContent = Math.round(fpsN / fpsT);
    $("cpu").textContent = (cpuAcc / fpsN).toFixed(1);
    if (gpuN) (gpuShow = gpuMs / gpuN), ($("gpu").textContent = gpuShow.toFixed(1));
    $("calls").textContent = callsShow;
    window.__demo.fps = fpsN / fpsT;
    window.__demo.gpu = gpuShow;
    window.__demo.calls = callsShow;
    window.__demo.cpu = cpuAcc / fpsN;
    fpsT = fpsN = cpuAcc = gpuMs = gpuN = 0;
  }
  if (statsDirty && ready) refreshStats();
}

// GPU 基准：同一画面背靠背渲染 N 帧、每帧一个计时查询，取中位数（帧循环里的计时在低负载时会因降频偏大）
let benchBusy = !1;
async function bench(n = 30) {
  while (benchBusy) await new Promise((r) => setTimeout(r, 50));
  benchBusy = !0;
  const qs = [];
  for (let i = 0; tq && i < n; i++) {
    const q = gl.createQuery();
    gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
    ink.render(scene, cam, U.uTime.value);
    gl.endQuery(tq.TIME_ELAPSED_EXT);
    qs.push(q);
  }
  const out = [];
  const t0 = performance.now();
  while (qs.length && performance.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 16));
    while (qs.length && gl.getQueryParameter(qs[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = qs.shift();
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
  }
  if (!out.length) {
    // 计时查询拿不到（集显上常见 GPU_DISJOINT）→ 退回墙钟：背靠背画 n 帧 + readPixels 1 像素同步，含 CPU 提交
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const w0 = performance.now();
    for (let i = 0; i < n; i++) ink.render(scene, cam, U.uTime.value);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out.push((performance.now() - w0) / n);
    window.__demo.benchWall = !0;
  }
  benchBusy = !1;
  if (!out.length) return null;
  out.sort((a, b) => a - b);
  const med = out[out.length >> 1];
  $("bench").textContent = med.toFixed(2);
  window.__demo.benchMs = med;
  return med;
}
let benchT = 0;
const benchSoon = () => {
  clearTimeout(benchT);
  benchT = setTimeout(() => ready && bench(), 900);
};

// 分构件统计（写说明文档用）：按网格名汇总三角面 / 实例 / 投影
function parts(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const gg = o.geometry, n = (gg.index ? gg.index.count : gg.attributes.position.count) / 3, c = o.isInstancedMesh ? o.count : 1;
    out.push({ name: o.name || o.material?.name || "?", tris: Math.round(n * c), perInst: Math.round(n), inst: c, cast: !!o.castShadow, mat: o.material?.name });
  });
  return out;
}
// 消融（测分项成本）：hide(正则) 隐藏名字匹配的网格；shadows(false) 关日光投影
function hide(re) {
  const r = new RegExp(re);
  let n = 0;
  for (const root of [newTemple, newEnv]) root.traverse((o) => o.isMesh && r.test(o.name) && ((o.visible = !1), n++));
  return n;
}
window.__demo = { hide, shadows: (on) => (sun.castShadow = on), parts: () => ({ temple: parts(newTemple), env: parts(newEnv), templeStats: newTemple.userData.stats, envStats: newEnv.userData.stats, bake: BAKE_STATS.list }), bench, state, set(o) { Object.assign(state, o); if ("cam" in o || "o" in o) applyCam(); if ("size" in o || "pr" in o) setSize(); setVis(); }, buildMs, bake: BAKE_STATS, ready: !1 };

(async () => {
  await loadChars();
  setSize();
  applyCam();
  // 预热：三种着色各真画一帧（加载层盖着），之后切换不再编译（docs/性能优化_v1.md §7.1）
  const keep = { ...state };
  for (const v of ["old", "new"])
    for (const s of ["A", "B", "C"]) {
      Object.assign(state, { ver: v, shade: s });
      setVis();
      updateShadow();
      ink.render(scene, cam, 0);
    }
  Object.assign(state, keep);
  setVis();
  ready = !0;
  statsDirty = !0;
  $("loading").style.display = "none";
  window.__demo.ready = !0;
  window.__demo.programs = renderer.info.programs.length;
  frame();
})().catch((e) => {
  $("loading").textContent = "出错：" + e.message;
  console.error(e);
});
