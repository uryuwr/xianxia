// 敌人弹道（藤妖吐籽、心魔剑气）：贴地飞行的墨球，碰到主角结算伤害，飞出射程或撞上高地即消散。
// 由 EnemyDirector 持有：fire(enemy, attack, atk) 发射，update(dt) 每帧推进，clear() 清空。
import * as THREE from "three";
import { height } from "../../world/terrain.js";
import { INKC } from "../../fx/vfx.js";

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Projectiles {
  constructor(ctx, director) {
    this.ctx = ctx;
    this.dir = director;
    this.list = [];
    this.geo = new THREE.IcosahedronGeometry(1, 1);
    this.root = new THREE.Group();
    this.root.name = "enemy-projectiles";
    ctx.scene.add(this.root);
  }

  fire(enemy, a, k) {
    const n = a.count || 1, spread = ((a.spread || 0) * Math.PI) / 180;
    const col = a.telegraphColor ?? INKC.ink;
    for (let i = 0; i < n; i++) {
      const ang = n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0;
      const d = k.aim.clone().applyAxisAngle(UP, ang);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: !0, opacity: 0.92, depthWrite: !1 });
      const core = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: INKC.ink }));
      const glow = new THREE.Mesh(this.geo, mat);
      core.scale.setScalar(a.radius * 0.45);
      glow.scale.setScalar(a.radius * 0.8);
      const g = new THREE.Group();
      g.add(glow, core);
      const p = enemy.pos;
      g.position.set(p.x + d.x * (enemy.def.radius + 0.3), height(p.x, p.z) + 1.0, p.z + d.z * (enemy.def.radius + 0.3));
      g.renderOrder = 25;
      this.root.add(g);
      this.list.push({ g, mat, d, speed: a.speed, left: a.range, r: a.radius, src: enemy.entity, a, t: 0, trail: 0, col });
    }
  }

  update(dt) {
    const hero = this.dir.hero;
    const vfx = this.ctx.vfx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const step = p.speed * dt;
      p.t += dt;
      p.left -= step;
      const g = p.g.position;
      g.x += p.d.x * step;
      g.z += p.d.z * step;
      const gh = height(g.x, g.z);
      g.y += (gh + 1.0 - g.y) * Math.min(1, dt * 10);
      p.g.rotation.y += dt * 6;
      if ((p.trail -= dt) <= 0) {
        p.trail = 0.05;
        vfx.burst(_v.set(g.x, g.y - 0.8, g.z), { color: p.col, count: 1, speed: 0.3, size: p.r * 0.5, up: 0.4, y: 0.8, dur: 0.4 });
      }
      let done = p.left <= 0 || gh > g.y + 0.2;
      if (!done && hero && hero.alive) {
        const dx = hero.pos.x - g.x, dz = hero.pos.z - g.z;
        if (dx * dx + dz * dz < (p.r + hero.radius) ** 2 && Math.abs(hero.pos.y + 0.9 - g.y) < 1.6) {
          const a = p.a;
          const info = this.ctx.world.dealDamage(p.src, hero, {
            base: a.damage.base,
            scale: { atk: a.damage.atk },
            element: a.element,
            knock: a.knock,
            dir: p.d.clone(),
            tags: ["ranged", "enemy", a.id],
            pos: hero.pos,
          });
          if (info) vfx.burst(hero.pos, { color: p.col, count: 10, speed: 3, size: 0.14, up: 2, y: 1 });
          done = !0;
        }
      }
      if (done) {
        vfx.burst(g, { color: p.col, count: 6, speed: 2, size: 0.14, up: 1.5, y: 0 });
        this.remove(i);
      }
    }
  }

  remove(i) {
    const p = this.list[i];
    this.root.remove(p.g);
    p.mat.dispose();
    p.g.children[1].material.dispose();
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}
