// 关卡调试入口：
//   window.__game.loadLevel(id, seed)   载入关卡（"r1" | "r2" | "tutorial"），主角放到入口，镜头切到 play
//   window.__game.unloadLevel()
//   window.__game.level                 当前调试关卡
//   window.__game.setView("r1_falls")   各关卡的预设机位（见关卡数据 views，名字前缀为关卡 id；另有 level_overview）
//   window.__game.setTimeOfDay(t)
//   URL：?level=r1&seed=7&tod=0.8
// 只在调试时接管场景；主流程（模块 A）用 buildLevel / dispose 自己管理关卡。
import { buildLevel, loadLevelDef } from "./level.js";
import { VIEWS } from "../game/camera.js";

let current = null;
let hiddenLegacy = [];
const LEGACY = new Set(["terrain", "water", "vegetation", "props", "sky", "sample-map"]);

function game() {
  return typeof window !== "undefined" ? window.__game : null;
}
function ctxOf(g) {
  const c = g.ctx || {};
  return {
    ...c,
    scene: c.scene || g.scene,
    colliders: c.colliders,
    player: c.player || g.player,
    world: c.world || g.world,
    ink: g.ink,
    brush: c.brush,
  };
}

export async function loadLevel(id = "r1", seed = (Math.random() * 1e9) | 0) {
  const g = game();
  if (!g) throw new Error("window.__game 尚未就绪");
  unloadLevel();
  const ctx = ctxOf(g);
  // 旧的美术样张地图先藏起来
  for (const o of ctx.scene.children) if (LEGACY.has(o.name) && o.visible) (o.visible = !1), hiddenLegacy.push(o);
  const def = await loadLevelDef(id);
  const t0 = performance.now();
  const level = await buildLevel({ ...def, seed }, ctx);
  const ms = performance.now() - t0;
  current = level;
  g.level = level;
  // 机位：关卡数据里的 views → VIEWS["<id>_<name>"]；follow:false
  const prefix = def.id === "r1" && level.tutorial ? "tutorial" : def.id;
  for (const [k, v] of Object.entries(def.views || {})) VIEWS[`${prefix}_${k}`] = { follow: !1, ...v };
  VIEWS.level_overview = { follow: !1, ...(def.views && def.views.overview ? def.views.overview : { target: [0, 0, 0], dist: 220, pitch: 52, yaw: 0 }) };
  g.levelViews = Object.keys(def.views || {}).map((k) => `${prefix}_${k}`);
  const p = ctx.player;
  if (p && p.spawn) {
    const e = level.entry;
    p.spawn(e.x, e.z);
  }
  g.rig && g.rig.set && g.rig.set("play", !0);
  // 主循环里没有关卡 update 时，自己挂一个
  if (!g.__levelTick) {
    g.__levelTick = !0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (current && !current.disposed && !current.externalUpdate) current.update(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  console.log(`[level] ${id} seed=${seed} 建造 ${ms.toFixed(0)} ms（高度场 ${level.stats.heightfieldMs.toFixed(0)} ms），碰撞体 ${level.colliders.length}`);
  return level;
}
export function unloadLevel() {
  if (current) current.dispose();
  current = null;
  const g = game();
  if (g) g.level = null;
  for (const o of hiddenLegacy) o.visible = !0;
  hiddenLegacy = [];
}

export function installDebug() {
  const g = game();
  if (!g) {
    // 主程序还没建好 __game：稍后再试
    setTimeout(installDebug, 200);
    return;
  }
  if (g.loadLevel) return;
  g.loadLevel = loadLevel;
  g.unloadLevel = unloadLevel;
  g.setTimeOfDay = (t) => current && current.setTimeOfDay(t);
  const q = new URLSearchParams(location.search);
  const id = q.get("level");
  if (id) {
    const go = () =>
      loadLevel(id, q.has("seed") ? Number(q.get("seed")) : undefined)
        .then((lv) => q.has("tod") && lv.setTimeOfDay(Number(q.get("tod"))))
        .catch((e) => console.error("[level] 载入失败", e));
    // 等主循环跑起来（贴图烘焙完成）再载入
    const wait = () => (window.__ready ? go() : setTimeout(wait, 100));
    wait();
  }
}
