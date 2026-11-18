// 阵法：T 键在鼠标处布阵，最多同时 2 个（超出时最早的消散）。
//   strike 周期斩击阵内若干敌人 / field 阵内所有敌人周期附加状态 / aura 主角在阵内获得属性加成与冷却加速
import * as THREE from "three";
import { formationMesh, ELEM_COLOR } from "../../fx/skill_fx.js";
import { strike } from "./effects.js";

export const MAX_FORMATIONS = 2;
let uid = 1;

export function placeFormation(sys, def, point) {
  const mesh = formationMesh(def.glyph, ELEM_COLOR[def.element] ?? ELEM_COLOR.null, def.radius);
  mesh.position.copy(point);
  mesh.position.y += 0.07;
  sys.fx.root.add(mesh);
  const f = { id: uid++, def, pos: point.clone(), t: 0, tickT: 0.3, mesh, src: sys.hero };
  sys.formations.push(f);
  while (sys.formations.length > MAX_FORMATIONS) removeFormation(sys, sys.formations[0]);
  sys.ctx.vfx.ring(point, def.radius, { color: ELEM_COLOR[def.element] ?? ELEM_COLOR.null, dur: 0.6, width: 0.1 });
  sys.ctx.vfx.pillar(point, { color: ELEM_COLOR[def.element] ?? ELEM_COLOR.null, radius: def.radius * 0.9, height: 3, dur: 0.5 });
  return f;
}
export function removeFormation(sys, f) {
  const i = sys.formations.indexOf(f);
  if (i >= 0) sys.formations.splice(i, 1);
  sys.fx.root.remove(f.mesh);
  f.mesh.geometry.dispose();
  f.mesh.material.dispose();
  sys.hero.stats.removeSource("formation:" + f.id);
}

export function updateFormations(sys, dt) {
  const w = sys.ctx.world, hero = sys.hero;
  sys.cdSpeedBonus = 0;
  for (const f of sys.formations.slice()) {
    const d = f.def;
    f.t += dt;
    f.tickT -= dt;
    // 阵图：渐显、缓慢旋转、临终渐隐
    const fade = Math.min(1, f.t * 3) * Math.min(1, (d.dur - f.t) * 2);
    f.mesh.material.opacity = 0.85 * fade;
    f.mesh.rotation.y += dt * 0.25;
    if (d.kind === "strike" && f.tickT <= 0) {
      f.tickT = d.tick;
      const list = w.query(f.pos, d.radius, (e) => e.team !== hero.team).sort(() => Math.random() - 0.5).slice(0, d.targets);
      for (const t of list) {
        strike(sys, f.src, t, d, d.element, d.status, { tags: ["formation"] });
        sys.ctx.vfx.arc(t.pos, new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), 1.0, 1.8, { color: ELEM_COLOR.metal, dur: 0.24, width: 0.22, y: (t.height || 1.6) * 0.5 });
      }
    } else if (d.kind === "field" && f.tickT <= 0) {
      f.tickT = d.tick;
      for (const t of w.query(f.pos, d.radius, (e) => e.team !== hero.team)) strike(sys, f.src, t, d, d.element, d.status, { tags: ["formation", "dot"] });
      sys.ctx.vfx.burst(f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * d.radius, 0, (Math.random() - 0.5) * d.radius)), { color: ELEM_COLOR.fire, count: 6, speed: 1, up: 3, size: 0.18, y: 0.1 });
    } else if (d.kind === "aura") {
      const inside = (hero.pos.x - f.pos.x) ** 2 + (hero.pos.z - f.pos.z) ** 2 <= d.radius ** 2;
      const src = "formation:" + f.id;
      const has = hero.stats.mods.some((m) => m.source === src);
      if (inside && !has) hero.stats.addAll(d.mods, src);
      else if (!inside && has) hero.stats.removeSource(src);
      if (inside) {
        sys.cdSpeedBonus = Math.max(sys.cdSpeedBonus, d.cdSpeed || 0);
        if (f.tickT <= 0) (f.tickT = 0.3), sys.ctx.vfx.burst(hero.pos, { color: 0xe0b45a, count: 2, speed: 0.6, up: 2.5, size: 0.12, y: 0.3 });
      }
    }
    if (f.t >= d.dur) removeFormation(sys, f);
  }
}
