// 施法瞄准（战斗操作体验）：按技能键先显示地面虚影预览（射程、轨迹、范围），确认后再释放。
//   Q / E / R  法术    T  阵盘    V  法宝主动
//   确认：左键，或再按一次同一个键（法宝：再按 V）    取消：右键 / Esc    换别的技能键：直接切换预览
//   不在瞄准时，右键 = 蓄势斩（player.tryCharge）：只认点在游戏画面上的右键；储物袋 / 搜取窗口 / 天机镜 / 暂停打开时右键归界面。
//   气势不足时光标旁提示"势未成"。
//   瞄准时主角照常走动，普通攻击暂停（左键被这里截下来，不会传给输入模块）。
//   设置"快速施法"（getSetting("quickCast")）打开时：按键立即在鼠标处释放，预览只闪一下。
//   护体类（土遁护体、紫金葫芦）没有落点，直接释放。
// 释放仍走 SkillSystem.castSpell / useArtifact / placeFormation（消耗、冷却、动作都不变），只是把确认时的落点作为 aimOverride 传入。
import * as THREE from "three";
import { TargetFx } from "../../fx/target_fx.js";
import { getSetting } from "./settings.js";
import { mountCursor } from "../../ui/cursor.js";

const SLOT_KEYS = ["KeyQ", "KeyE", "KeyR"];
const SLOT_NAMES = ["Q", "E", "R"];
const ARTIFACT_RANGE = 16; // 与 SkillSystem.useArtifact 的 aim(16) 一致
const FORMATION_RANGE = 12; // 与 placeFormation 的 aim(12) 一致
// 预览用的五行色（《UI 风格指南》§8.2：比界面点色再淡一档）；无属性（聚灵阵）用泥金
const ELEM = { metal: 0xa8862f, wood: 0x3f9a6e, water: 0x2f7fa8, fire: 0xc0392b, earth: 0x9a6a32 };
const colorOf = (el) => ELEM[el] ?? 0xb8923a;
const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Targeting {
  constructor(sys) {
    this.sys = sys;
    this.ctx = sys.ctx;
    this.fx = new TargetFx(sys.ctx.scene, sys.ctx.renderer);
    this.cursor = mountCursor(sys.ctx);
    this.active = null; // { kind: "spell" | "artifact" | "formation", i, key, shape, … }
    this.point = new THREE.Vector3();
    this.valid = !0;
    this.reason = "";
    this.stats = { begun: 0, confirmed: 0, canceled: 0, quick: 0 };
    this._swallowUp = !1;
    this._real = new Set(); // 本帧真实按下的键（区分 input.tap 模拟按键）
    this._rightUi = !1; // 本帧的真实右键点在界面上（不是游戏画面）
    this._onDown = (e) => this.onMouseDown(e);
    this._onUp = (e) => this.onMouseUp(e);
    this._onKey = (e) => this.onKeyDown(e);
    // 捕获阶段：先于输入模块（冒泡阶段）拿到点击，瞄准中吞掉左右键
    addEventListener("mousedown", this._onDown, { capture: !0 });
    addEventListener("mouseup", this._onUp, { capture: !0 });
    addEventListener("keydown", this._onKey, { capture: !0 });
    window.__targeting = this;
  }
  get aiming() {
    return !!this.active;
  }

  // ---------------- 技能 → 预览形状 ----------------
  spec(kind, i) {
    const sys = this.sys;
    if (kind === "spell") {
      const sp = sys.spellAt(i);
      if (!sp) return null;
      const e = sp.effect, key = SLOT_NAMES[i];
      const base = { kind, i, key, name: sp.name, cost: sp.cost, element: sp.element, color: colorOf(sp.element), range: sp.range || e.range || 0 };
      switch (e.type) {
        case "projectile":
          return { ...base, shape: "line", count: e.count || 1, spread: e.spread || 0, width: Math.max(0.5, e.radius * 1.4), pierce: !!e.pierce, explode: e.explode ? e.explode.radius : 0, range: e.range };
        case "cone":
          return { ...base, shape: "cone", range: e.range, angle: e.angle };
        case "zone":
        case "slam":
          return { ...base, shape: "area", radius: e.radius };
        case "chain":
          return { ...base, shape: "chain", range: e.range, jumpRange: e.jumpRange };
        // 功法体系 v2：藤引（藤索直线）、地行术（遁地直线，落点即鼠标处，最远 range）；凝锋 / 止水 / 火鸦是自身施放（self，按下即放）
        case "grapple":
          return { ...base, shape: "line", count: 1, spread: 0, width: Math.max(0.5, e.radius * 1.4), pierce: !1, explode: 0, range: e.range };
        case "blink":
          return { ...base, shape: "line", count: 1, spread: 0, width: 1.2, pierce: !0, explode: e.radius, range: e.range };
        default:
          return { ...base, shape: "self" };
      }
    }
    if (kind === "artifact") {
      const a = sys.artifactDef;
      if (!a || !sys.artifact) return null;
      const self = a.id === "gourd" || !(a.active.radius > 0);
      return { kind, key: "artifact", name: a.name, cost: a.active.cost, element: a.element, color: colorOf(a.element), range: ARTIFACT_RANGE, shape: self ? "self" : "area", radius: a.active.radius };
    }
    if (kind === "formation") {
      const f = sys.formationDef;
      if (!f) return null;
      return { kind, key: "formation", name: f.name, cost: f.cost, element: f.element, color: colorOf(f.element), range: FORMATION_RANGE, shape: "area", radius: f.radius };
    }
    return null;
  }
  // 能否开始瞄准（锁定 / 冷却 / 真气不足：沿用技能栏的提示）
  gate(s) {
    const sys = this.sys, h = sys.hero;
    if (!h || !h.alive) return !1;
    if (s.kind === "spell" && sys.slotLocked(s.i)) return sys.ui.flash(s.key, sys.ui.lockText ? sys.ui.lockText(s.i) : sys.unlockText(s.i)), !1;
    if ((sys.cd[s.key] || 0) > 0) return sys.ui.flash(s.key, "冷却中"), this.cursor.say("冷却中", "bad"), !1;
    if (h.mp < s.cost) return sys.stats.mpDenied++, sys.ui.flash(s.key, "真气不足"), this.cursor.say("真气不足", "bad"), !1;
    return !0;
  }

  // ---------------- 按键 ----------------
  // synthetic：不是玩家真按的键（input.tap / 直接置 rightPressed，测试与自动演示用）→ 直接释放，保持旧行为
  press(kind, i, synthetic = !1) {
    const a = this.active;
    if (a && a.kind === kind && a.i === i) return this.confirm();
    const s = this.spec(kind, i);
    if (!s) return !1;
    if (!this.gate(s)) return !1;
    if (s.shape === "self") return this.cancel(!0), this.execute(s, null);
    if (synthetic) return this.cancel(!0), this.execute(s, null);
    if (getSetting("quickCast")) {
      this.cancel(!0);
      this.stats.quick++;
      this.active = s;
      this.update(0);
      this.active = null;
      this.fx.flash();
      return this.execute(s, null);
    }
    return this.begin(s);
  }
  begin(s) {
    this.active = s;
    this.stats.begun++;
    // 正按着左键普攻时进入瞄准：先松开普攻
    this.ctx.input.mouse.left = !1;
    this.fx.flashT = 0;
    this.update(0);
    this.ctx.world.events.emit("target:begin", { kind: s.kind, key: s.key, shape: s.shape });
    return !0;
  }
  confirm() {
    const s = this.active;
    if (!s) return !1;
    this.update(0);
    if (!this.valid) {
      this.cursor.say(this.reason || "无法施放", "bad");
      if (this.reason === "冷却中" || this.reason === "真气不足") this.sys.ui.flash(s.key, this.reason);
      return !1;
    }
    const p = this.point.clone();
    this.active = null;
    this.fx.hide();
    const ok = this.execute(s, p);
    if (ok) this.stats.confirmed++;
    this.ctx.world.events.emit("target:confirm", { kind: s.kind, key: s.key, point: p, ok });
    return ok;
  }
  cancel(silent = !1) {
    if (!this.active) return !1;
    const s = this.active;
    this.active = null;
    this.fx.hide();
    if (!silent) {
      this.stats.canceled++;
      this.ctx.world.events.emit("target:cancel", { kind: s.kind, key: s.key });
    }
    return !0;
  }
  // 按落点释放：point 为 null 时用当前鼠标（或测试设置的 aimOverride）
  execute(s, point) {
    const sys = this.sys, prev = sys.aimOverride;
    if (point) sys.aimOverride = point;
    try {
      if (s.kind === "spell") return sys.castSpell(s.i);
      if (s.kind === "artifact") return sys.useArtifact();
      if (s.kind === "formation") return sys.placeFormation();
    } finally {
      sys.aimOverride = prev;
    }
    return !1;
  }

  // ---------------- 原生事件（捕获阶段） ----------------
  inGame(e) {
    const c = this.ctx.renderer && this.ctx.renderer.domElement;
    const t = e.target;
    return t === c || t === document.body || t === document.documentElement || (t && t.dataset && t.dataset.cursorPass != null);
  }
  onMouseDown(e) {
    if (e.button === 2) this._real.add("Mouse2"), (this._rightUi = !this.inGame(e));
    if (!this.active) return;
    if (!this.inGame(e)) return; // 点在界面上：交给界面
    if (e.button === 0) {
      e.stopPropagation();
      this._swallowUp = !0;
      this.confirm();
    } else if (e.button === 2) {
      // 瞄准中右键只取消瞄准（法宝也一样，确认改用左键 / 再按 V），不触发蓄势斩
      e.stopPropagation();
      this.cancel();
    }
  }
  onMouseUp(e) {
    if (e.button === 0 && this._swallowUp) {
      this._swallowUp = !1;
      this.ctx.input.mouse.left = !1;
    }
  }
  onKeyDown(e) {
    if (!e.repeat) this._real.add(e.code);
    if (e.code === "Escape" && this.active) {
      e.stopPropagation();
      e.preventDefault();
      this.cancel();
    }
  }

  // ---------------- 每帧 ----------------
  // 替代原来的"按键即释放"
  handleInput() {
    const inp = this.ctx.input, h = this.sys.hero;
    if (!h || !h.alive) return this._real.clear(), this.cancel(!0);
    const real = this._real, fake = (k) => !real.has(k);
    SLOT_KEYS.forEach((k, i) => inp.pressed(k) && this.press("spell", i, fake(k)));
    if (inp.pressed("KeyV")) this.press("artifact", undefined, fake("KeyV"));
    if (inp.pressed("KeyT")) this.press("formation", undefined, fake("KeyT"));
    // 右键（不在瞄准中）：蓄势斩
    if (inp.mouse.rightPressed && !this.active && !(real.has("Mouse2") && this._rightUi) && !this.uiOpen()) this.charge();
    // 测试 / 手柄：模拟按键 Escape
    if (inp.pressed("Escape")) this.cancel();
    real.clear();
  }
  // 右键归界面的情形：储物袋、搜取窗口、天机镜手卷、暂停菜单
  uiOpen() {
    const b = document.body.classList;
    if (b.contains("mk-bag-open") || b.contains("mk-map-open") || b.contains("mk-paused")) return !0;
    const run = this.ctx.flow && this.ctx.flow.run;
    return !!(run && run.containers && run.containers.openC);
  }
  charge() {
    const p = this.ctx.player;
    if (!p || typeof p.tryCharge !== "function") return !1;
    const ok = p.tryCharge();
    if (!ok && p.state !== "dead") this.cursor.say("势未成", "bad");
    return ok;
  }
  update(dt) {
    this.fx.update(dt);
    const s = this.active, sys = this.sys, h = sys.hero;
    if (s && (!h || !h.alive || !this.spec(s.kind, s.i))) this.cancel(!0);
    if (!this.active) {
      this.cursor.aim(null);
      return;
    }
    const H = this.ctx.terrain.height;
    const cast = sys.aim(s.range);
    const o = cast.origin, dir = cast.dir;
    this.point.copy(cast.point);
    // 可施放？
    let reason = "";
    if ((sys.cd[s.key] || 0) > 0) reason = "冷却中";
    else if (h.mp < s.cost) reason = "真气不足";
    else if (s.shape === "area" && !(this.point.y > -0.8)) reason = "无法落在此处";
    this.valid = !reason;
    this.reason = reason;
    const fx = this.fx;
    fx.hide();
    fx.flashT = 0;
    fx.style(s.color, !this.valid);
    fx.showRange(H, o, s.range);
    if (s.shape === "line") this.drawLines(s, o, dir, H);
    else if (s.shape === "cone") fx.showCone(H, o, dir, s.range, s.angle);
    else if (s.shape === "area") {
      fx.showDisc(H, this.point, s.radius);
      fx.showMark(H, this.point, 0.28);
    } else if (s.shape === "chain") this.drawChain(s, o, dir, H);
    // 鼠标在射程外：落点被拉回射程边上，鼠标处画一个小虚圈提示
    const m = sys.aimOverride || this.ctx.input.aim;
    const over = Math.hypot(m.x - o.x, m.z - o.z) > s.range + 0.3;
    this.cursor.aim({ element: s.element, color: s.color, bad: !this.valid, label: reason || (s.cost ? `${s.name} · ${s.cost}` : s.name), over });
  }
  // 轨迹：与 updateProjectiles 一致——从身前 0.6 米出发，高度为施法者 +1；遇到高出 0.8 米的地形停下；不穿透的止于第一个敌人
  drawLines(s, o, dir, H) {
    const w = this.ctx.world, src = this.sys.hero, flyY = o.y + 1.0;
    const n = Math.min(5, s.count);
    let endFirst = null;
    for (let k = 0; k < n; k++) {
      const off = n > 1 ? (k / (n - 1) - 0.5) * 2 * s.spread : 0;
      _d.copy(dir).applyAxisAngle(Y, off);
      const pts = [];
      let x = o.x + _d.x * 0.6, z = o.z + _d.z * 0.6, t = 0;
      const step = 0.4;
      pts.push([x, z]);
      let stop = !1;
      while (t < s.range - 0.6 && !stop) {
        const st = Math.min(step, s.range - 0.6 - t);
        x += _d.x * st;
        z += _d.z * st;
        t += st;
        if (H(x, z) > flyY - 0.2) stop = !0;
        else if (!s.pierce) {
          _v.set(x, 0, z);
          if (w.query(_v, s.width * 0.5, (e) => e.team !== src.team && e.team !== "neutral").length) stop = !0;
        }
        pts.push([x, z]);
      }
      this.fx.showLine(k, H, pts, s.width);
      if (k === (n - 1) >> 1) endFirst = _v.set(x, H(x, z), z).clone();
    }
    if (endFirst) {
      if (s.explode) this.fx.showEnd(H, endFirst, s.explode);
      else this.fx.showMark(H, endFirst, Math.max(0.35, s.width * 0.6));
    }
  }
  // 连锁：与 EFFECTS.chain 一致——鼠标 3 米内最近的敌人，其次面前最近；画首个目标和跳跃半径
  drawChain(s, o, dir, H) {
    const w = this.ctx.world, src = this.sys.hero, f = (e) => e.team !== src.team && e.team !== "neutral";
    const near = (list, p) => {
      let b = null, bd = Infinity;
      for (const e of list) {
        const d = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
        if (d < bd) (bd = d), (b = e);
      }
      return b;
    };
    const t = near(w.query(this.point, 3, f), this.point) || near(w.queryArc(o, dir, s.range, 0.6, f), o);
    this.target = t || null;
    if (t) {
      this.fx.showLine(0, H, [[o.x + dir.x * 0.6, o.z + dir.z * 0.6], ...seg(o, t.pos)], 0.42);
      this.fx.showDisc(H, t.pos, (t.radius || 0.5) + 0.45);
      this.fx.showJump(H, t.pos, s.jumpRange);
    } else {
      this.fx.showMark(H, this.point, 0.9);
    }
  }
  dispose() {
    removeEventListener("mousedown", this._onDown, { capture: !0 });
    removeEventListener("mouseup", this._onUp, { capture: !0 });
    removeEventListener("keydown", this._onKey, { capture: !0 });
    this.fx.dispose();
  }
}

function seg(a, b) {
  const pts = [], n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
  for (let i = 1; i <= n; i++) pts.push([a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n]);
  return pts;
}
