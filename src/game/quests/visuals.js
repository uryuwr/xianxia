// 奇遇的场景表现（模块 E）：散修白鹭（assets/models/bailu.glb）、受伤灵狐、前辈遗蜕、灵雨，以及委托遗物的光柱。
// 每个表现：{ root, update(rdt), talk(on), face(pos, rdt), play(name), moveTo(pos, speed), moving, dispose() }
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetURL } from "../../core/assets.js";
import { toon, outlineMaterial } from "../../render/materials.js";
import { makeLingtianVisual } from "./lingtian.js";

// 白鹭的材质：按 Blender 材质名映射（月白 + 石青）
const BAILU_PALETTE = {
  bl_moon: { color: 0xdfe8ea },
  bl_inner: { color: 0xb3c1c6 },
  bl_qing: { color: 0x2b6a86 },
  bl_qing_dark: { color: 0x1d3c4c },
  bl_skin: { color: 0xe6d6c2 },
  bl_hair: { color: 0x1b1d1f },
  bl_ribbon: { color: 0x2f7fa8, emissive: 0x0a2a3a, emissiveIntensity: 0.6 },
  bl_boots: { color: 0x202224 },
  bl_silver: { color: 0xd8dde0 },
  bl_hilt: { color: 0x3a3430 },
  bl_scabbard: { color: 0x1f3440 },
};
const matCache = {};
function mat(key, pal = BAILU_PALETTE) {
  const k = (key || "").replace(/\.\d+$/, "");
  const name = pal[k] ? k : "bl_moon";
  return (matCache[name] ||= toon({ ...pal[name], side: THREE.DoubleSide }));
}
const flat = (color, o = {}) => (matCache["c" + color + JSON.stringify(o)] ||= toon({ color, ...o }));

function addOutlines(root, w = 0.018) {
  const list = [];
  root.traverse((o) => o.isMesh && !o.userData.isOutline && !o.userData.noOutline && list.push(o));
  const om = outlineMaterial(w);
  for (const m of list) {
    let o;
    if (m.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(m.geometry, om);
      o.bind(m.skeleton, m.bindMatrix);
    } else o = new THREE.Mesh(m.geometry, om);
    o.position.copy(m.position);
    o.quaternion.copy(m.quaternion);
    o.scale.copy(m.scale);
    o.userData.isOutline = !0;
    o.frustumCulled = !1;
    m.parent.add(o);
  }
}

// 头顶的印章字（远远就能看到"这里有事"）
function sealSprite(glyph, color = "#b8301c") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(10, 10, 108, 108, 12);
  g.fill();
  g.strokeStyle = "rgba(244,236,220,.8)";
  g.lineWidth = 5;
  g.strokeRect(20, 20, 88, 88);
  g.fillStyle = "#f4ecdc";
  g.font = '900 70px "KaiTi","STKaiti",serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(glyph, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: !0, depthWrite: !1 }));
  s.scale.set(0.55, 0.55, 1);
  s.userData.noOutline = !0;
  return s;
}

// ---------------- 白鹭 ----------------
// 每个实例单独解析一次（文件走浏览器缓存；一局最多一个白鹭，不必克隆骨骼）
export function loadBailuAsset(url = "/assets/models/bailu.glb") {
  return new GLTFLoader().loadAsync(assetURL(url)).catch((e) => {
    console.warn("[quests] bailu.glb 加载失败，使用替身", e);
    return null;
  });
}

function bailuPlaceholder() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.0, 10, 1, !0).translate(0, 0.5, 0), mat("bl_moon")));
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8).translate(0, 1.15, 0), mat("bl_moon")));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10).translate(0, 1.57, 0), mat("bl_skin")));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 1.6, 0.01), mat("bl_hair")));
  return g;
}

export function makeBailu(ctx) {
  const root = new THREE.Group();
  const v = {
    kind: "bailu", root, actions: {}, mixer: null, cur: null, model: null, ready: !1, talking: !1, moving: !1, target: null, speed: 4,
    play(name, fade = 0.25, once = !1) {
      const a = this.actions[name];
      if (!a) return !1;
      if (a === this.cur && !once) return !0;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      a.clampWhenFinished = once;
      a.fadeIn(fade).play();
      if (this.cur && this.cur !== a) this.cur.fadeOut(fade);
      this.cur = a;
      if (once) this.onceLeft = a.getClip().duration * (name === "wave" ? 2 : 1); // 按动画时间计（首帧编译着色器的卡顿不吃掉动作）
      return !0;
    },
    update(rdt) {
      if (this.mixer) this.mixer.update(rdt);
      if (this.moving && this.target) {
        const d = new THREE.Vector3().subVectors(this.target, root.position).setY(0);
        const L = d.length();
        if (L < 0.15) {
          this.moving = !1;
          this.play(this.talking ? "talk" : "idle");
        } else {
          const step = Math.min(L, this.speed * rdt);
          root.position.addScaledVector(d.normalize(), step);
          if (this.height) root.position.y = this.height(root.position.x, root.position.z);
          this.yawTo(Math.atan2(d.x, d.z), rdt, 12);
          this.play("run", 0.15);
        }
      } else if (this.onceLeft > 0 && (this.onceLeft -= rdt) <= 0) {
        this.play(this.talking ? "talk" : "idle");
      }
      if (this.seal) this.seal.position.y = 2.15 + 0.06 * Math.sin(performance.now() / 500);
    },
    yawTo(yaw, rdt, k = 6) {
      let dy = yaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * Math.min(1, k * rdt);
    },
    face(p, rdt) {
      this.yawTo(Math.atan2(p.x - root.position.x, p.z - root.position.z), rdt);
    },
    talk(on) {
      this.talking = on;
      if (!this.moving) this.play(on ? "talk" : "idle");
    },
    moveTo(p, speed = 4) {
      this.target = p.clone();
      this.speed = speed;
      this.moving = !0;
    },
    dispose() {
      ctx.scene.remove(root);
      if (this.mixer) this.mixer.stopAllAction();
    },
  };
  loadBailuAsset().then((gltf) => {
    let model;
    if (gltf) {
      model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.material = mat(o.material && o.material.name);
          o.castShadow = !0;
          o.frustumCulled = !1;
        }
      });
      v.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) v.actions[clip.name.toLowerCase()] = v.mixer.clipAction(clip);
      v.source = "bailu.glb";
    } else {
      model = bailuPlaceholder();
      v.source = "placeholder";
    }
    model.scale.setScalar(0.95);
    addOutlines(model);
    root.add(model);
    v.model = model;
    v.ready = !0;
    v.play("idle", 0);
  });
  return v;
}

// ---------------- 受伤的灵狐（程序化低模）----------------
export function makeFox(ctx) {
  const root = new THREE.Group();
  const white = flat(0xf1ede4), ink = flat(0x1b1d1f), red = flat(0xd2321e);
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), white);
  torso.scale.set(0.8, 0.75, 1.5);
  torso.position.set(0, 0.25, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), white);
  head.position.set(0, 0.38, 0.32);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8).rotateX(Math.PI / 2), white);
  snout.position.set(0, 0.35, 0.47);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), ink);
  nose.position.set(0, 0.36, 0.56);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), white);
    e.position.set(0.07 * s, 0.52, 0.28);
    e.rotation.z = -0.25 * s;
    return e;
  });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 10).rotateX(-Math.PI / 2 - 0.5), white);
  tail.position.set(0, 0.32, -0.42);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), ink);
  tip.position.set(0, 0.45, -0.66);
  const legs = [[-0.09, 0.15], [0.09, 0.15], [-0.09, -0.17], [0.09, -0.17]].map(([x, z]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.2, 6).translate(0, 0.1, 0), white);
    l.position.set(x, 0, z);
    return l;
  });
  // 兽夹 + 血迹
  const trap = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 10).rotateX(Math.PI / 2), flat(0x5a5048));
  trap.position.set(0.09, 0.03, -0.17);
  const blood = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10).rotateX(-Math.PI / 2), red);
  blood.position.set(0.12, 0.012, -0.22);
  blood.userData.noOutline = !0;
  body.add(torso, head, snout, nose, ...ears, tail, tip, ...legs);
  root.add(body, trap, blood);
  addOutlines(body, 0.012);
  let t = 0;
  const v = {
    kind: "fox", root, moving: !1, target: null, speed: 3.2, hurt: !0,
    update(rdt) {
      t += rdt;
      if (this.moving && this.target) {
        const d = new THREE.Vector3().subVectors(this.target, root.position).setY(0);
        const L = d.length();
        if (L < 0.2) (this.moving = !1), this.onArrive && this.onArrive();
        else {
          root.position.addScaledVector(d.normalize(), Math.min(L, this.speed * rdt));
          if (this.height) root.position.y = this.height(root.position.x, root.position.z);
          root.rotation.y = Math.atan2(d.x, d.z);
          body.position.y = 0.05 * Math.abs(Math.sin(t * 12));
        }
      } else {
        body.scale.y = 1 + 0.03 * Math.sin(t * (this.hurt ? 5 : 2.5));
        tail.rotation.y = 0.2 * Math.sin(t * 1.7);
      }
      if (this.seal) this.seal.position.y = 1.15 + 0.05 * Math.sin(t * 2);
    },
    face(p, rdt) {
      if (this.moving) return;
      const yaw = Math.atan2(p.x - root.position.x, p.z - root.position.z);
      let dy = Math.atan2(Math.sin(yaw - root.rotation.y), Math.cos(yaw - root.rotation.y));
      root.rotation.y += dy * Math.min(1, 3 * rdt);
    },
    talk() {},
    healed() {
      this.hurt = !1;
      trap.visible = !1;
    },
    moveTo(p, speed = 3.2) {
      this.target = p.clone();
      this.speed = speed;
      this.moving = !0;
    },
    dispose() {
      ctx.scene.remove(root);
    },
  };
  return v;
}

// ---------------- 前辈遗蜕：石龛里盘坐的遗骨，膝上横剑 ----------------
export function makeRemains(ctx) {
  const root = new THREE.Group();
  const stone = flat(0x8d8a80), robe = flat(0x9a9384), bone = flat(0xe8e0cc), rust = flat(0x6a4a32), ink = flat(0x2a2c2e);
  const niche = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 0.3).translate(0, 0.95, -0.55), stone);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 1.1).translate(0, 1.95, -0.2), stone);
  const sides = [-1, 1].map((s) => new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.85, 0.9).translate(0.78 * s, 0.92, -0.2), stone));
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.9).translate(0, 0.09, -0.15), stone);
  niche.add(back, roof, ...sides, base);
  const fig = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.22, 12).translate(0, 0.29, 0), robe);
  legs.scale.z = 0.7;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.6, 10).translate(0, 0.68, -0.05), robe);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bone);
  skull.position.set(0, 1.08, -0.02);
  skull.rotation.x = 0.35;
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), ink);
    e.position.set(0.045 * s, 1.09, 0.1);
    return e;
  });
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.025, 0.06).translate(0, 0.43, 0.2), rust);
  sword.rotation.y = 0.12;
  fig.add(legs, torso, skull, ...eyes, sword);
  fig.position.z = -0.1;
  root.add(niche, fig);
  addOutlines(root, 0.014);
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe0b45a, transparent: !0, opacity: 0.35, depthWrite: !1 }));
  glow.position.y = 0.04;
  glow.userData.noOutline = !0;
  root.add(glow);
  let t = 0;
  return {
    kind: "remains", root,
    update(rdt) {
      t += rdt;
      glow.material.opacity = 0.2 + 0.15 * Math.sin(t * 2);
      if (this.seal) this.seal.position.y = 2.45 + 0.05 * Math.sin(t * 2);
    },
    face() {},
    talk() {},
    settle() {
      glow.visible = !1;
    },
    dispose() {
      ctx.scene.remove(root);
    },
  };
}

// ---------------- 灵雨：一圈落下的金色雨丝 ----------------
export function makeRain(ctx, radius = 4) {
  const root = new THREE.Group();
  const N = 140, H = 7;
  const pos = new Float32Array(N * 6), seeds = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    seeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: Math.random() * H, s: 6 + Math.random() * 3 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9b06a, transparent: !0, opacity: 0.7, depthWrite: !1 }));
  lines.frustumCulled = !1;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f8fa8, transparent: !0, opacity: 0.45, depthWrite: !1, side: THREE.DoubleSide }));
  ring.position.y = 0.06;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f8fa8, transparent: !0, opacity: 0.12, depthWrite: !1 }));
  pool.position.y = 0.05;
  const cloud = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.15, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3c3e, transparent: !0, opacity: 0.28, depthWrite: !1 }));
  cloud.position.y = H;
  root.add(lines, ring, pool, cloud);
  let t = 0;
  return {
    kind: "rain", root, radius, intensity: 1,
    update(rdt) {
      t += rdt;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        s.y -= s.s * rdt * this.intensity;
        if (s.y < 0) s.y += H;
        const o = i * 6;
        pos[o] = pos[o + 3] = s.x;
        pos[o + 2] = pos[o + 5] = s.z;
        pos[o + 1] = s.y;
        pos[o + 4] = s.y + 0.45;
      }
      geo.attributes.position.needsUpdate = !0;
      lines.material.opacity = 0.7 * this.intensity;
      cloud.material.opacity = 0.28 * this.intensity;
      ring.material.opacity = (0.35 + 0.15 * Math.sin(t * 3)) * this.intensity;
      if (this.seal) this.seal.position.y = 2.4 + 0.05 * Math.sin(t * 2);
    },
    face() {},
    talk() {},
    dispose() {
      ctx.scene.remove(root);
      geo.dispose();
    },
  };
}

// ---------------- 委托遗物所在：一道淡金光柱 ----------------
export function makeBeacon(ctx, glyph = "委") {
  const root = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 7, 12, 1, !0).translate(0, 3.5, 0), new THREE.MeshBasicMaterial({ color: 0xe0b45a, transparent: !0, opacity: 0.22, depthWrite: !1, side: THREE.DoubleSide }));
  const seal = sealSprite(glyph, "#a07a2a");
  seal.position.y = 1.6;
  root.add(beam, seal);
  let t = 0;
  return {
    kind: "beacon", root,
    update(rdt) {
      t += rdt;
      beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 2.5);
      seal.position.y = 1.6 + 0.08 * Math.sin(t * 2);
    },
    dispose() {
      ctx.scene.remove(root);
    },
  };
}

export function makeVisual(kind, ctx, glyph) {
  const v = kind === "bailu" ? makeBailu(ctx) : kind === "fox" ? makeFox(ctx) : kind === "remains" ? makeRemains(ctx) : kind === "rain" ? makeRain(ctx) : kind === "lingtian" ? makeLingtianVisual(ctx) : makeRemains(ctx);
  if (glyph) {
    v.seal = sealSprite(glyph);
    v.root.add(v.seal);
  }
  ctx.scene.add(v.root);
  return v;
}
