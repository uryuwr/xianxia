// 青牙 v2 宣传片的脚本化操作（录制 shots_qingya.mjs 和测试 tools/scenarios/promo_qingya.mjs 共用）。
// 主角操作一律走真实键鼠（WASD / 左键 / 右键 / Q E R / 空格 / F）；首领"出哪一招"和场面布置用调试接口（画面外或片段开始前）。
// R 只需要：ev / frame / frames / sec / key / down / up / mdown / mup / moveRaw / mouse / mark（录制用 lib.mjs 的 Rec，测试用实时适配器）。
import { walkTo, trackEnemy } from "./shots.mjs";

// ---------- 进场：走 src/dev/promo.js 的 URL 入口（和用户在浏览器里用的是同一条路）----------
export const QUERY = (o = {}) => {
  const q = new URLSearchParams({ scene: "run", region: "r1", slot: "7", boss: "qingya", hud: "1", seed: "7", ...o });
  return q.toString();
};
export async function enter(R, opts = {}) {
  await R.go(QUERY(opts));
  await R.until(() => window.__promo && window.__promo.ready, null, { timeout: 180000 });
  await R.ev(() => {
    const G = window.__game, w = G.world;
    try {
      G.debug && G.debug.toggle && G.debug.open && G.debug.toggle(!1);
    } catch {}
    document.querySelectorAll(".mk-layer-debug, .jx-panel").forEach((e) => (e.style.display = "none"));
    document.querySelectorAll(".mk-toasts > *").forEach((e) => e.remove());
    window.__QE = [];
    for (const n of ["boss:introStart", "boss:phase", "boss:break", "boss:interrupt", "boss:crash", "boss:totem", "boss:execPrompt", "boss:execute", "boss:execEnd", "boss:defeated", "boss:moonDenied", "boss:poiseGain", "shield:break", "player:charge", "player:perfectDodge", "player:dash"])
      w.events.on(n, (d) => __QE.push({ n, t: w.time, kind: d && d.kind, on: d && d.on }));
    w.events.on("damage", (i) => i && i.qyWeak && __QE.push({ n: "weak", t: w.time }));
    w.events.on("damage", (i) => i && i.target === G.player.entity && i.amount > 0 && __QE.push({ n: "heroHit", t: w.time, amt: i.amount }));
    window.__q = () => window.__promo.boss();
    window.__qn = (n) => __QE.filter((x) => x.n === n).length;
    window.__ev = window.__ev || { attack: [], charge: 0, broke: 0, killed: [] };
    w.events.on("player:attack", (e) => __ev.attack.push(e.step));
    w.events.on("player:charge", () => __ev.charge++);
  });
}
export const qn = (R, n) => R.ev((n) => window.__qn(n), n);
export const aim = (R, o = {}) => trackEnemy(R, { type: "qingya", dy: 1.0, lerp: 0.35, ...o });

// 等到条件成立（逐帧推进；each 每帧调）
export async function waitUntil(R, fn, arg, { maxSec = 6, each = null } = {}) {
  for (let i = 0; i < maxSec * 30; i++) {
    if (await R.ev(fn, arg)) return !0;
    await R.frame(each);
  }
  return !1;
}

// ---------- 首领控制（布置用）----------
// hold：首领照常追，但不出招（选招返回 null），也不自己跳去月光读啸月
export async function bossHold(R, on = !0) {
  await R.ev((on) => {
    const q = __q();
    if (!q) return;
    const C = q.ctrl;
    if (!C.__promo) {
      const o = C.pickAttack.bind(C);
      C.pickAttack = (av, d) => (window.__qyHold ? null : o(av, d));
      C.__promo = 1;
    }
    window.__qyHold = on;
    if (on) C.moonCd = Math.max(C.moonCd || 0, 999);
    else if (C.moonCd > 900) C.moonCd = 12;
  }, on);
}
// freeze：首领原地站住（敌人模块的 cinematic 态：不移动、不转身、不出招，播 idle）；off 恢复追击
export async function bossFreeze(R, on = !0) {
  await R.ev((on) => {
    const q = __q();
    if (!q) return;
    // cinematic 态下敌人模块仍会转身对着主角：包一层 update，冻结期间把朝向锁回去
    if (!q.__promoYaw) {
      const o = q.update.bind(q);
      q.update = (dt, hero) => {
        const r = o(dt, hero);
        if (q.__lockYaw != null && q.state === "cinematic") (q.yaw = q.__lockYaw), (q.root.rotation.y = q.__lockYaw);
        return r;
      };
      q.__promoYaw = 1;
    }
    q.__lockYaw = on ? q.yaw : null;
    if (on) {
      if (q.atk) q.endAttack(!0);
      q.state = "cinematic";
      q.t = 999;
      q.play && q.play("idle", 0.25);
    } else if (q.state === "cinematic") (q.state = "chase"), (q.t = 0), q.play && q.play("run", 0.2);
  }, on);
}
// 让首领出指定招（等它空下来：开战中、没在出招、没倒地、没被眩晕、不在踉跄 / 喘息）
export async function bossDo(R, id, { each = null, maxSec = 6 } = {}) {
  await bossFreeze(R, !1);
  const ok = await waitUntil(R, () => {
    const q = __q();
    return q && q.ctrl.mode === "fight" && !q.atk && !q.ctrl.broken && !q.ctrl.moonLeap && !q.entity.statuses.has("stun") && ["chase", "idle"].includes(q.state);
  }, null, { maxSec, each });
  return ok && R.ev((id) => {
    const q = __q(), a = q.def.attacks.find((x) => x.id === id);
    if (!a) return !1;
    q.cool && (q.cool[id] = 0);
    q.state = "chase";
    q.startAttack(a, __game.player.pos);
    return !0;
  }, id);
}
// 布置首领：hp（比例）、shield（护盾剩余点数，0 = 打破）、poise、pos [x,z]、face（朝向主角）、phase2（直接跳进二阶段，跳过转阶段帧）
export async function stage(R, o = {}) {
  await R.ev((o) => {
    const G = window.__game, q = __q(), C = q.ctrl, e = q.entity;
    const clr = () => { for (const id of [...e.statuses.keys()]) G.world.removeStatus(e, id); };
    if (o.pos) q.root.position.set(o.pos[0], q.root.position.y, o.pos[1]);
    if (o.hero) G.player.spawn(o.hero[0], o.hero[1]), G.rig.update(1, !0);
    if (o.shield != null && e.shield) {
      if (o.shield <= 0) e.shield.hp > 0 && G.ctx.shields.breakShield(e), clr(), e.stats.removeSource("shieldBreak");
      else e.shield.hp = Math.min(e.shield.max, o.shield);
    }
    if (o.hp != null) e.hp = Math.max(1, e.stats.get("hp") * o.hp);
    if (o.poise != null) (C.poise = o.poise), (C.lastGain = C.time), C.emitPoise && C.emitPoise(!0);
    if (o.clear) clr();
    if (o.face) {
      const P = G.player.pos;
      q.yaw = Math.atan2(P.x - q.pos.x, P.z - q.pos.z);
      q.root.rotation.y = q.yaw;
    }
    if (o.yaw != null) (q.yaw = o.yaw), (q.root.rotation.y = o.yaw);
    if (o.cd) for (const k of Object.keys(q.cool || {})) q.cool[k] = Math.max(q.cool[k], o.cd);
  }, o);
  if (o.phase2) {
    await R.ev(() => {
      const G = window.__game, e = __q().entity;
      if (e.shield && e.shield.hp > 0) G.ctx.shields.breakShield(e);
      e.hp = e.stats.get("hp") * 0.49;
    });
    await R.skip(150); // 转阶段 3.6 秒 + 余量（不录）
    if (o.hp != null) await R.ev((hp) => (__q().entity.hp = __q().entity.stats.get("hp") * hp), o.hp);
  }
}
// 血量下限：真实伤害照常结算，只是不让它掉到 frac 以下（坑 #1：不改伤害值，只抬血）。frac = 0 关掉
export async function floor(R, frac) {
  await R.ev((frac) => {
    const G = window.__game, q = __q();
    window.__qyFloor = frac;
    if (!window.__qyFloorOn) {
      window.__qyFloorOn = 1;
      G.world.events.on("damage", (i) => {
        const q = __q();
        if (!q || i.target !== q.entity || !window.__qyFloor) return;
        const f = q.entity.stats.get("hp") * window.__qyFloor;
        if (q.entity.hp < f) q.entity.hp = f;
      });
    }
  }, frac);
}
export const god = (R, on = !0) => R.ev((on) => (__game.player.debug.god = on), on);
export const momentum = (R, v = 100) => R.ev((v) => ((__game.player.momentum = v), (__game.player.momT = 0)), v);

// ---------- 镜头 ----------
// 镜头路径：keys = [{ t: 秒, target: [x,y,z], dist, pitch(度), yaw(弧度) }, …]，逐帧插值（smoothstep）写进 rig.cine；结束后 release 秒缓回跟随
export async function camPath(R, keys, { release = null, each = null } = {}) {
  const dur = keys[keys.length - 1].t, n = Math.round(dur * 30);
  for (let i = 0; i <= n; i++) {
    const t = i / 30;
    let k = 0;
    while (k < keys.length - 2 && t > keys[k + 1].t) k++;
    const a = keys[k], b = keys[k + 1] || a, u = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1, s = u * u * (3 - 2 * u);
    const L = (x, y) => x + (y - x) * s;
    const shot = { target: a.target.map((v, j) => L(v, b.target[j])), dist: L(a.dist, b.dist), pitch: L(a.pitch, b.pitch), yaw: L(a.yaw, b.yaw), blend: 0.05 };
    await R.ev((shot) => {
      const rig = __game.rig;
      rig.cine(shot);
      if (rig._cine) rig._cine.w = 1;
    }, shot);
    await R.frame(each);
  }
  if (release != null) await R.ev((r) => __game.rig.cine(null, r), release);
}
// 固定机位：shot 持续到 release
export const camHold = (R, shot) => R.ev((s) => __game.rig.cine({ blend: 0.6, ...s }), shot);
export const camRelease = (R, out = 0.6) => R.ev((o) => __game.rig.cine(null, o), out);

// ---------- 主角操作（真实键鼠）----------
// 法术：按键出瞄准预览 → 鼠标对着青牙几帧 → 左键确认
export async function cast(R, key, { each = null, aimFrames = 8 } = {}) {
  each = each || aim(R);
  await R.key(key, 2);
  await R.frames(aimFrames, each);
  if (await R.ev(() => !!(window.__targeting && __targeting.active))) {
    await R.mdown();
    await R.frames(2, each);
    await R.mup();
  }
}
// 蓄势斩（右键；气势 ≥ 50）
export async function charge(R, { each = null } = {}) {
  each = each || aim(R);
  const n0 = await R.ev(() => __ev.charge);
  await R.mdown("right");
  for (let i = 0; i < 40; i++) {
    await R.frame(each);
    if (await R.ev((n0) => __ev.charge > n0, n0)) break;
  }
  await R.mup("right");
}
// 闪身：按住方向键 + 空格
export async function dodge(R, dirKey = "KeyA", { each = null } = {}) {
  await R.down(dirKey);
  await R.frame(each);
  await R.key("Space", 2);
  await R.frames(6, each);
  await R.up(dirKey);
}
// 左键连段，直到 until 为真或超时
export async function attack(R, { until = null, arg = null, maxSec = 2, each = null } = {}) {
  each = each || aim(R);
  await R.mdown();
  for (let i = 0; i < maxSec * 30; i++) {
    await R.frame(each);
    if (until && (await R.ev(until, arg))) break;
  }
  await R.mup();
}
// 从谷里（at=pit，38,-26）走进 10 米触发圈：入场仪式开始时主角被锁定（cine），提前松键
export async function walkToBoss(R, { to = [41.6, -23.8], maxSec = 5 } = {}) {
  await walkTo(R, to[0], to[1], { maxSec, r: 0.5, mouse: !1 });
}
// 走到首领身边 dist 米（面对它的那一侧）
export async function approach(R, dist = 2.6, { maxSec = 3 } = {}) {
  const s = await R.ev(() => ({ b: { x: __q().pos.x, z: __q().pos.z }, p: { x: __game.player.pos.x, z: __game.player.pos.z }, r: __q().entity.radius }));
  const d = Math.hypot(s.b.x - s.p.x, s.b.z - s.p.z), want = dist + s.r;
  if (d > want + 0.5) await walkTo(R, s.b.x - ((s.b.x - s.p.x) / d) * want, s.b.z - ((s.b.z - s.p.z) / d) * want, { maxSec, r: 0.5, each: aim(R) });
}

// ① 打断读条：首领出长嚎（或啸月），主角用 by（"KeyQ" 剑气斩 / "KeyR" 寒冰锥 / "charge" 满势蓄势斩）打断
export async function interruptHowl(R, { id = "summon_howl", by = "KeyQ", wait = 0.45 } = {}) {
  const each = aim(R);
  const n0 = await qn(R, "boss:interrupt");
  await bossDo(R, id, { each });
  R.mark && R.mark("howl");
  await R.sec(wait, each);
  if (by === "charge") await charge(R, { each });
  else await cast(R, by, { each });
  const ok = await waitUntil(R, (n0) => __qn("boss:interrupt") > n0, n0, { maxSec: 2, each });
  R.mark && R.mark("interrupt");
  return ok;
}
// 布置：把首领放到某根石柱靠场心一侧 gap 米处（引撞柱的起手位置；画面外做）
export async function nearPillar(R, pid, { gap = 3.0, hero = null } = {}) {
  return R.ev(([pid, gap, hero]) => {
    const q = __q(), C = q.ctrl, p = (C.arena.pillars || []).find((x) => x.alive && (!pid || x.id === pid));
    if (!p) return null;
    const cx = 50 - p.pos.x, cz = -22 - p.pos.z, d = Math.hypot(cx, cz) || 1;
    const bx = p.pos.x + (cx / d) * (p.r + gap), bz = p.pos.z + (cz / d) * (p.r + gap);
    q.root.position.set(bx, q.root.position.y, bz);
    q.yaw = Math.atan2(p.pos.x - bx, p.pos.z - bz);
    q.root.rotation.y = q.yaw;
    // 主角放在石柱侧面（垂直方向 hero 米），之后自己走到柱后
    if (hero != null) {
      const px = -cz / d, pz = cx / d;
      __game.player.spawn(p.pos.x + px * hero - (cx / d) * 1.0, p.pos.z + pz * hero - (cz / d) * 1.0);
      __game.rig.update(1, !0);
    }
    return { id: p.id, x: p.pos.x, z: p.pos.z };
  }, [pid, gap, hero]);
}
// ② 引撞柱：主角走到石柱背后（和首领隔柱相对），首领出裂风三扑撞上去
export async function lurePillar(R, { pillar = null, attackId = null, back = 1.4 } = {}) {
  const each = aim(R);
  await bossFreeze(R, !0);
  const p = await R.ev((pid) => {
    const q = __q(), C = q.ctrl, ps = (C.arena && C.arena.pillars || []).filter((x) => x.alive);
    const pp = pid ? ps.find((x) => x.id === pid) : ps.sort((a, b) => a.pos.distanceTo(q.pos) - b.pos.distanceTo(q.pos))[0];
    if (!pp) return null;
    const dx = pp.pos.x - q.pos.x, dz = pp.pos.z - q.pos.z, d = Math.hypot(dx, dz) || 1;
    return { id: pp.id, x: pp.pos.x + (dx / d) * (pp.r + 1.0), z: pp.pos.z + (dz / d) * (pp.r + 1.0), r: pp.r };
  }, pillar);
  if (!p) return !1;
  await walkTo(R, p.x, p.z, { maxSec: 4, r: 0.45, each });
  const n0 = await qn(R, "boss:crash");
  const phase = await R.ev(() => __q().ctrl.phase);
  await bossHold(R, !1);
  await bossDo(R, attackId || (phase === 2 ? "rend2" : "rend"), { each });
  R.mark && R.mark("rend");
  const ok = await waitUntil(R, (n0) => __qn("boss:crash") > n0, n0, { maxSec: 3.5, each });
  R.mark && R.mark("crash");
  return ok;
}
// ③ 绕背：走到青牙背后 2.4 米，左键打背甲（飘"裂"）
export async function flankBack(R, { hits = 3, maxSec = 3, behind = 2.4, freeze = !1 } = {}) {
  const each = aim(R);
  if (freeze) await bossFreeze(R, !0);
  // 两段走：先绕到首领身侧（离主角近的那一侧），再到背后——直线会被它的身体挡住
  const t = await R.ev((b) => {
    const q = __q(), P = __game.player.pos, fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), R0 = b + q.entity.radius;
    const rx = fz, rz = -fx, side = (P.x - q.pos.x) * rx + (P.z - q.pos.z) * rz >= 0 ? 1 : -1;
    return { sx: q.pos.x + rx * side * R0 - fx * 0.6, sz: q.pos.z + rz * side * R0 - fz * 0.6, x: q.pos.x - fx * R0, z: q.pos.z - fz * R0 };
  }, behind);
  await walkTo(R, t.sx, t.sz, { maxSec: 2, r: 0.7, each });
  await walkTo(R, t.x, t.z, { maxSec: 2, r: 0.5, each });
  R.mark && R.mark("back");
  const n0 = await qn(R, "weak");
  await attack(R, { until: ([n0, k]) => __qn("weak") >= n0 + k, arg: [n0, hits], maxSec, each });
  return (await qn(R, "weak")) - n0;
}
// ④ 站月光：走进最近的月光斑，首领出影袭 → 月下无影，落空
export async function standMoon(R, { doShadow = !0 } = {}) {
  const each = aim(R);
  const sp = await R.ev(() => {
    const C = __q().ctrl, P = __game.player.pos;
    const s = C.moonSpots().slice().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    return s ? { x: s.x, z: s.z } : null;
  });
  if (!sp) return !1;
  await walkTo(R, sp.x, sp.z, { maxSec: 4, r: 0.8, each });
  R.mark && R.mark("moon");
  if (!doShadow) return !0;
  const n0 = await qn(R, "boss:moonDenied");
  await bossDo(R, "shadow", { each });
  R.mark && R.mark("shadow");
  const ok = await waitUntil(R, (n0) => __qn("boss:moonDenied") > n0, n0, { maxSec: 3, each });
  // 跟着月光斑漂一点（站稳在光里）
  return ok;
}
// 走进处决圈、主角能动时按 F；没触发就再按（最多 4 次）
async function pressExec(R) {
  const n0 = await qn(R, "boss:execute");
  for (let k = 0; k < 4; k++) {
    await approach(R, 1.4, { maxSec: 1.5 });
    await waitUntil(R, () => __q() && __q().ctrl.canExecute(__game.player.pos) && !["cine", "attack", "dash", "cast", "hit"].includes(__game.player.state), null, { maxSec: 1.5, each: aim(R) });
    await R.key("KeyF", 3);
    if (await waitUntil(R, (n0) => __qn("boss:execute") > n0, n0, { maxSec: 0.6 })) return !0;
  }
  return !1;
}
// ⑤ 威折处决：等威折（二阶段才有处决提示）→ 走进朱环 → F
export async function breakExec(R, { maxSec = 5 } = {}) {
  const each = aim(R);
  const ok = await waitUntil(R, () => __q() && __q().ctrl.broken && __q().ctrl.downKind === "break", null, { maxSec, each });
  if (!ok) return !1;
  R.mark && R.mark("broken");
  await pressExec(R);
  R.mark && R.mark("exec");
  await waitUntil(R, () => __QE.some((x) => x.n === "boss:execEnd" && x.kind === "break"), null, { maxSec: 4 });
  R.mark && R.mark("execEnd");
  return !0;
}
// ⑥ 终结处决：气竭伏地 → 走近 → F（首次 4 秒完整版）
export async function finalExec(R, { maxSec = 4 } = {}) {
  const ok = await waitUntil(R, () => __q() && __q().ctrl.mode === "final", null, { maxSec, each: aim(R) });
  if (!ok) return !1;
  R.mark && R.mark("winded");
  await R.sec(0.4);
  await pressExec(R);
  R.mark && R.mark("final");
  await waitUntil(R, () => __qn("boss:defeated") > 0, null, { maxSec: 6 });
  R.mark && R.mark("defeated");
  return !0;
}
