// 青牙狼谷场景件的"桩"（关卡设计的正式实现落地前使用）：接口与 activeLevel().bossArena 约定一致（docs/design/boss_青牙_v2.md §10.2 第 2 项）。
//   pillars: [{ id, pos, r, col, alive, break() }]   狼牙石柱：碰撞体推进 ctx.colliders，break 时移除并换残桩
//   totems:  [{ id, pos, den, col, alive, setLit(on), fall() }]
//   gates:   { setOn(id | "all", on) }                墨雾门（桩：一片半透明墨面 + 3 个碰撞圆）
//   setMoonVeil(t)（0–1）、moonSpots(t秒) → [{ x, z, r }]、inPit(x, z)、update(t秒)
// 桩只用常见材质组合（toon / MeshBasicMaterial 透明不写深度），不加灯；正式场景件来了以后这个文件可以删掉。
import * as THREE from "three";
import { toon } from "../../../render/materials.js";
import { height } from "../../../world/terrain.js";

const v3 = (p) => (p && p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1]));
export function pointInPoly(x, z, poly) {
  let inside = !1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class QingyaArenaStub {
  constructor(ctx, bp) {
    this.ctx = ctx;
    this.stub = !0;
    this.root = new THREE.Group();
    this.root.name = "qingya-arena-stub";
    ctx.scene.add(this.root);
    const cols = ctx.colliders || [];
    this.cols = cols;
    const stone = toon({ color: 0x6e6a62 }), bone = toon({ color: 0xd9d2bf }), rubble = toon({ color: 0x55524c });
    this.mats = [stone, bone, rubble];
    const pillarGeo = new THREE.CylinderGeometry(1, 1.15, 3.4, 9), stumpGeo = new THREE.CylinderGeometry(1.05, 1.2, 0.6, 9);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.6, 6), barGeo = new THREE.BoxGeometry(1.3, 0.12, 0.12), skullGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.geos = [pillarGeo, stumpGeo, poleGeo, barGeo, skullGeo];
    const ground = (p) => (p.y = height(p.x, p.z), p);
    this.pillars = (bp.pillars || []).map((q) => {
      const pos = ground(v3(q.pos)), r = q.r || 1.2;
      const m = new THREE.Mesh(pillarGeo, stone);
      m.scale.set(r, 1, r);
      m.position.set(pos.x, pos.y + 1.7, pos.z);
      m.castShadow = !0;
      this.root.add(m);
      const col = { x: pos.x, z: pos.z, r, id: q.id, qyPillar: !0 };
      cols.push(col);
      const P = {
        id: q.id, pos, r, col, alive: !0, mesh: m,
        break: () => {
          if (!P.alive) return;
          P.alive = !1;
          const i = cols.indexOf(col);
          if (i >= 0) cols.splice(i, 1);
          m.geometry = stumpGeo;
          m.material = rubble;
          m.position.y = pos.y + 0.3;
        },
      };
      col.pillar = P;
      return P;
    });
    this.totems = (bp.totems || []).map((q) => {
      const pos = ground(v3(q.pos));
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, bone), bar = new THREE.Mesh(barGeo, bone), skull = new THREE.Mesh(skullGeo, bone);
      pole.position.y = 1.3;
      bar.position.y = 2.1;
      skull.position.y = 2.55;
      g.add(pole, bar, skull);
      g.position.copy(pos);
      this.root.add(g);
      const col = { x: pos.x, z: pos.z, r: 0.45, id: q.id, qyTotem: !0 };
      cols.push(col);
      const T = {
        id: q.id, pos, den: ground(v3(q.den || q.pos)), col, alive: !0, group: g, lit: !1,
        setLit: (on) => {
          T.lit = !!on;
          skull.scale.setScalar(on ? 1.35 : 1);
        },
        fall: () => {
          if (!T.alive) return;
          T.alive = !1;
          const i = cols.indexOf(col);
          if (i >= 0) cols.splice(i, 1);
          g.rotation.z = 1.35;
          g.position.y = pos.y + 0.15;
        },
      };
      return T;
    });
    // 墨雾门：半透明墨面 + 碰撞圆（开着时挡路）
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x1b1d20, transparent: !0, opacity: 0.55, depthWrite: !1, side: THREE.DoubleSide });
    this.mats.push(fogMat);
    this.gateList = (bp.gates || []).filter((q) => q.pos).map((q) => {
      const pos = ground(v3(q.pos)), w = q.w || 4, ry = q.ry || 0;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 1, 3.2), fogMat);
      this.geos.push(m.geometry);
      // 面朝石阶方向（ry 是沿石阶的朝向），墨面横跨石阶
      m.rotation.y = ry;
      m.position.set(pos.x, pos.y + 1.6, pos.z);
      m.visible = !1;
      m.renderOrder = 24;
      m.userData.noShadow = !0;
      this.root.add(m);
      const ax = Math.cos(ry), az = -Math.sin(ry);
      const cs = [-1, 0, 1].map((k) => ({ x: pos.x + ax * k * (w / 3), z: pos.z + az * k * (w / 3), r: w / 4 + 0.3, id: q.id, qyGate: !0 }));
      return { id: q.id, pos, mesh: m, cs, on: !1 };
    });
    this.gates = {
      setOn: (id, on) => {
        for (const g of this.gateList) {
          if (id !== "all" && g.id !== id) continue;
          if (g.on === !!on) continue;
          g.on = !!on;
          g.mesh.visible = g.on;
          for (const c of g.cs) {
            const i = cols.indexOf(c);
            if (on && i < 0) cols.push(c);
            if (!on && i >= 0) cols.splice(i, 1);
          }
        }
      },
      isOn: (id) => this.gateList.some((g) => (id === "all" || g.id === id) && g.on),
    };
    // 月光斑：两片透明贴地圆片（二阶段遮月后出现）
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe6f2ec, transparent: !0, opacity: 0, depthWrite: !1 });
    this.mats.push(moonMat);
    this.moonMat = moonMat;
    const disc = new THREE.CircleGeometry(1, 28);
    this.geos.push(disc);
    this.moonPaths = (bp.moonPaths || []).map((path) => path.map((p) => [p[0], p[1]]));
    this.moonR = 3.5;
    this.moonMeshes = this.moonPaths.map(() => {
      const m = new THREE.Mesh(disc, moonMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(this.moonR);
      m.renderOrder = 23;
      m.userData.noShadow = !0;
      m.visible = !1;
      this.root.add(m);
      return m;
    });
    this.fence = bp.fence || null;
    this.veil = 0;
    this._spots = this.moonPaths.map(() => ({ x: 0, z: 0, r: this.moonR }));
  }
  inPit(x, z) {
    return this.fence ? pointInPoly(x, z, this.fence) : !0;
  }
  setMoonVeil(t) {
    this.veil = Math.max(0, Math.min(1, t));
    const on = this.veil > 0.02;
    for (const m of this.moonMeshes) m.visible = on;
    this.moonMat.opacity = 0.32 * this.veil;
  }
  // 月光斑沿路径往返漂移（0.6 米/秒）
  moonSpots(t) {
    const sp = 0.6;
    this.moonPaths.forEach((path, i) => {
      let L = 0;
      for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      let s = (t * sp + i * L * 0.5) % (2 * L);
      if (s > L) s = 2 * L - s;
      let x = path[0][0], z = path[0][1];
      for (let k = 1; k < path.length; k++) {
        const d = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
        if (s <= d) {
          const f = d ? s / d : 0;
          x = path[k - 1][0] + (path[k][0] - path[k - 1][0]) * f;
          z = path[k - 1][1] + (path[k][1] - path[k - 1][1]) * f;
          break;
        }
        s -= d;
        x = path[k][0];
        z = path[k][1];
      }
      this._spots[i].x = x;
      this._spots[i].z = z;
    });
    return this.veil > 0.5 ? this._spots : [];
  }
  update(t) {
    if (this.veil <= 0.02) return;
    this.moonSpots(t);
    this.moonMeshes.forEach((m, i) => {
      const s = this._spots[i];
      m.position.set(s.x, height(s.x, s.z) + 0.07, s.z);
    });
  }
  dispose() {
    for (const p of this.pillars) p.alive && p.break();
    for (const t of this.totems) {
      const i = this.cols.indexOf(t.col);
      if (i >= 0) this.cols.splice(i, 1);
    }
    this.gates.setOn("all", !1);
    this.ctx.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
