// 角色 / 首领精细化对比页（美术管线自用截图页；正式小样页面由 art-env 负责）
//   vite 下打开：/docs/art/精细化小样_v1/char_preview/index.html?kind=qingya&view=game&clip=idle&t=0.6
//   参数：kind=hero|qingya  view=game|close|front|side|back|head  clip=动画名  t=秒  set=lAvAvBvC（逐个：l 旧模型 / v 精细版，后跟模式）
//         p2=1 青牙二阶段外观  ink=0 关水墨后期  yaw=模型朝向（弧度）
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TEX, toon } from "../../../../src/render/materials.js";
import { bakeAll } from "../../../../src/render/bake.js";
import { InkPipeline } from "../../../../src/render/ink.js";
import { applyCharLook, SCALE, charStats } from "../assets/char_mats.js";

const Q = new URLSearchParams(location.search);
const KIND = Q.get("kind") || "hero";
const VIEW = Q.get("view") || "game";
const CLIP = Q.get("clip") || "idle";
const T = +(Q.get("t") || 0.5);
const SET = (Q.get("set") || "lAvAvBvC").match(/[lv][ABC]/g);
const P2 = Q.get("p2") === "1";
const INK = Q.get("ink") !== "0";
const YAW = Q.has("yaw") ? +Q.get("yaw") : VIEW === "front" ? 0 : VIEW === "side" ? Math.PI / 2 : VIEW === "back" ? Math.PI : 0.55;

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !1, preserveDrawingBuffer: !0 });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = !0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Object.assign(TEX, bakeAll(renderer));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xece6d6);
const sun = new THREE.DirectionalLight(0xfff6e8, 2.0);
sun.position.set(-26, 40, -14);
sun.target.position.set(0, 0, -2);
sun.castShadow = !0;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xf2efe6, 0x5a5d5a, 0.85));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), toon({ color: 0xd8d2c0 }));
ground.receiveShadow = !0;
scene.add(ground);
const ink = new InkPipeline(renderer);

const LABEL = { lA: "现状（游戏 A）", vA: "精细版 · A 3 阶 toon", vB: "精细版 · B 水墨写意", vC: "精细版 · C 写实 PBR" };
const URL = {
  l: { hero: "/assets/models/hero.glb", qingya: "/assets/models/qingya.glb" },
  v: { hero: "/docs/art/精细化小样_v1/assets/hero_v2.glb", qingya: "/docs/art/精细化小样_v1/assets/qingya_v2.glb" },
};

const loader = new GLTFLoader();
const load = (u) => new Promise((res, rej) => loader.load(encodeURI(u) + "?v=" + Date.now(), res, undefined, rej));

async function main() {
  const S = SCALE[KIND];
  const n = SET.length;
  const close = VIEW !== "game";
  const sp = KIND === "hero" ? (close ? 6 : 2.2) : close ? 14 : 8.5;
  const items = [];
  for (let i = 0; i < n; i++) {
    const [src, mode] = SET[i];
    const g = await load(URL[src][KIND]);
    const root = g.scene;
    root.scale.setScalar(S);
    root.rotation.y = YAW;
    let x = (i - (n - 1) / 2) * sp, z = 0;
    if (KIND === "qingya" && !close && n > 2) {
      x = ((i % 2) - 0.5) * sp;
      z = (Math.floor(i / 2) - 0.5) * 7;
    }
    root.position.set(x, 0, z);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const nm = o.name + "|" + (o.parent ? o.parent.name : "");
      const isCrack = /qingya_crack|qingya_eyefire/.test(nm);
      const isArmor = /qingya_armor/.test(nm);
      if (isCrack) o.visible = P2;
      if (isArmor) o.visible = !P2;
    });
    applyCharLook(root, mode, { kind: KIND, legacy: src === "l" });
    // 描边壳跟随本体显隐
    root.traverse((o) => {
      if (o.isMesh && o.userData.outline) o.userData.outline.visible = o.visible;
    });
    scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const clip = CLIP === "none" ? null : g.animations.find((c) => c.name === CLIP) || g.animations.find((c) => c.name === "idle");
    if (clip) {
      const a = mixer.clipAction(clip);
      a.play();
      mixer.setTime(Math.min(T, clip.duration - 0.001));
    }
    root.updateMatrixWorld(!0);
    items.push({ root, key: src + mode, stats: charStats(root), clips: g.animations.map((c) => c.name) });
  }
  const W = innerWidth, H = innerHeight;
  const lab = document.getElementById("labels");
  const addLabel = (txt, x, y) => {
    const el = document.createElement("div");
    el.textContent = txt;
    el.style.left = x + "px";
    el.style.top = y + "px";
    lab.appendChild(el);
  };
  if (VIEW === "game") {
    renderer.setSize(W, H, !1);
    ink.setSize(W, H);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.3, 500);
    const box = new THREE.Box3();
    for (const it of items) box.expandByObject(it.root);
    const c = box.getCenter(new THREE.Vector3());
    const tgt = new THREE.Vector3(c.x, 0.9, c.z);
    const d = 30, p = (45 * Math.PI) / 180;
    cam.position.set(tgt.x, tgt.y + Math.sin(p) * d, tgt.z + Math.cos(p) * d);
    cam.lookAt(tgt);
    cam.updateMatrixWorld();
    if (INK) ink.render(scene, cam, 1.0);
    else renderer.render(scene, cam);
    for (const it of items) {
      const b = new THREE.Box3().setFromObject(it.root);
      const q = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2).project(cam);
      addLabel(`${LABEL[it.key]} · ${it.stats.tris} 面`, ((q.x + 1) / 2) * W, Math.min(H - 28, ((1 - q.y) / 2) * H + 8));
    }
  } else {
    // 分格：每个模型一格、各自的镜头（同一距离，大小可比），逐格过水墨后期再拼到 2D 画布
    const cols = +(Q.get("cols") || (KIND === "qingya" && n === 4 ? 2 : n));
    const rows = Math.ceil(n / cols);
    const tw = Math.floor(W / cols), th = Math.floor(H / rows);
    renderer.setSize(tw, th, !1);
    ink.setSize(tw, th);
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    out.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
    document.body.insertBefore(out, lab);
    const g2 = out.getContext("2d");
    let maxS = new THREE.Vector3();
    const boxes = items.map((it) => new THREE.Box3().setFromObject(it.root));
    for (const b of boxes) maxS.max(b.getSize(new THREE.Vector3()));
    const cam = new THREE.PerspectiveCamera(30, tw / th, 0.05, 500);
    const tf = 2 * Math.tan((15 * Math.PI) / 180);
    let fit = Math.max(Math.max(maxS.x, maxS.z) / (tw / th), maxS.y) / tf * 1.15;
    const el = VIEW === "close" ? 0.42 : VIEW === "head" ? 0.12 : 0.04;
    for (let i = 0; i < n; i++) {
      items.forEach((it, j) => (it.root.visible = j === i));
      const b = boxes[i];
      const c = b.getCenter(new THREE.Vector3());
      let d = fit;
      if (VIEW === "head") {
        const headY = (KIND === "hero" ? 1.6 : 1.2) * SCALE[KIND];
        const fwd = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW)).multiplyScalar(KIND === "hero" ? 0 : 1.1 * SCALE[KIND]);
        c.set(items[i].root.position.x, headY, items[i].root.position.z).add(fwd);
        d = (KIND === "hero" ? 0.42 : 1.4 * SCALE[KIND]) / tf * 1.3;
      }
      cam.position.set(c.x, c.y + Math.sin(el) * d, c.z + Math.cos(el) * d);
      cam.lookAt(c);
      cam.updateMatrixWorld();
      if (INK) ink.render(scene, cam, 1.0);
      else renderer.render(scene, cam);
      const x0 = (i % cols) * tw, y0 = Math.floor(i / cols) * th;
      g2.drawImage(renderer.domElement, x0, y0, tw, th);
      addLabel(`${LABEL[items[i].key]} · ${items[i].stats.tris} 面`, x0 + tw / 2, y0 + th - 30);
    }
    canvas.style.display = "none";
  }
  document.getElementById("title").textContent = `${KIND === "hero" ? "主角 林墨" : "首领 青牙"}${P2 ? "（二阶段）" : ""} · ${VIEW === "game" ? "游戏镜头（45° 俯视，距 30 米）" : VIEW} · 动作 ${CLIP} @ ${T}s${INK ? " · 水墨后期" : ""}`;
  window.__info = items.map((it) => ({ key: it.key, ...it.stats, clips: it.clips.length }));
  window.__ready = !0;
}
main().catch((e) => {
  window.__err = String(e && (e.stack || e));
  window.__ready = !0;
});
