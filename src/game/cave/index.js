// 洞府（模块 C）：主角回府后的家。走到站点按 F（或点名牌）打开设施面板。
//   const cave = new Cave(ctx)；cave.enter() / cave.exit() / cave.update(dt)（每帧，在 ctx.input.endFrame 之前）
// 用到的 ctx：scene, player, rig, input, world, vfx, terrain, enemies?, profile, save?, flow?, applyProfileStats?
// 站点：灵泉 spring / 丹器房 workshop / 仓库 storage / 出行台 depart / 天机镜 mirror / 内观阁 loadout。
// 发出的事件（ctx.world.events）：cave:enter、cave:exit、cave:breakthrough {from, to, unlocks}、cave:alchemy、cave:forge、cave:learn、cave:relocate、cave:depart
import * as THREE from "three";
import { saveProfile } from "../../core/profile.js";
import { RARITY } from "../../core/items.js";
import { inkReadable } from "../../fx/rarity_tint.js";
import { realmName, heroStats, canBreak, xpNeed } from "../progression.js";
import { CaveScene, CAVE_SPAWN } from "../../world/cave_scene.js";
import { CaveUI } from "../../ui/cave/index.js";
import { breakFx, TrialHud, banner, wipe } from "../../ui/cave/overlays.js";
import * as F from "./facilities.js";
import { ensureCaveItems, GARDEN_PLOTS, STATIONS, itemName } from "./data.js";
import { MEMORIES, XJZ_BREAK, XJZ_TIPS } from "./story.js";
import { XinmoTrial } from "./xinmo.js";
import { syncNewLearned } from "../../ui/loadout.js";

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// 设施 id → 所在站点
const FAC_STATION = { spring: "spring", furnace: "workshop", forge: "workshop", garden: "garden", workshop: "workshop", storage: "storage", depart: "depart", appraise: "storage", study: "storage", loadout: "loadout" };
const FAC_TAB = { furnace: "alchemy", forge: "forge" };
// 有的设施不在站点正前方：药园在院子西侧，走到药园门口
const FAC_STAND = { garden: [-7.0, 3.9] };
const FORGE_SUB = ["gear", "item", "upgrade", "imbue", "reforge", "bind"];
const _ray = new THREE.Raycaster(), _hit = new THREE.Vector3();
const BASE_DIST = 36;
const YARD = new THREE.Vector3(0, 0.5, -1.5); // 院心：镜头注视点在主角与院心之间

export class Cave {
  constructor(ctx) {
    this.ctx = ctx;
    ensureCaveItems();
    this.ui = new CaveUI(this);
    this.scene = null;
    this.active = !1;
    this.locked = !1;
    this.trial = null;
    this.walk = null;
    this.focus = null;
    this.fast = !1;
    this.debug = {};
    this.F = F; // 调试 / 测试用：设施规则
    this.near = null;
    if (typeof window !== "undefined") window.__cave = this;
  }
  get p() {
    return this.ctx.profile;
  }
  save() {
    if (this.ctx.save) return this.ctx.save();
    if (this.p) saveProfile(this.p);
  }
  emit(name, data = {}) {
    this.ctx.world && this.ctx.world.events.emit(name, data);
  }

  // ---------------- 进出 ----------------
  // 进洞府（异步）：数据先就绪（药园状态、突破史补全），场景在加载遮罩下分帧构建、预热着色器，然后揭开遮罩
  async enter() {
    const { ctx } = this;
    const p = this.p;
    if (!p) throw new Error("Cave.enter：ctx.profile 为空");
    F.caveState(p);
    F.ensureBreakHistory(p); // 旧存档补全突破史
    const lockedBack = F.fixLockedEquip(p); // 旧存档：未解锁的栏位却装着东西（局内储物袋曾不查解锁）→ 退回仓库，下面提示一次
    const gifts = F.fillSlotGifts(p); // 旧存档：已过解锁层、栏位一直空着 → 补发一次基础款
    const facUp = F.unlockFacilities(p); // 旧存档：已过练二 / 练三，丹炉 / 炼器鼎按修为补到 1 阶并补送配方
    if (lockedBack.length || gifts.length || facUp.length) this.save();
    // 在建场景让出执行前同步当前存档，不能沿用冷启动或上一卷的默认技能。
    this.applyStats();
    F.syncDay(p);
    const ripeN = F.ripePlots(p).length; // 成熟的灵草留在地里，等玩家采收
    let _m = performance.now();
    this.ui.mount();
    if (window.__caveProfile) console.log("[cave-t] mount " + Math.round(performance.now() - _m));
    const first = !this.scene || this.scene.region !== F.caveState(p).region;
    if (first) (this.ui.loading(!0), (ctx.hold3d = !0));
    await this._buildScene();
    // 行走：把洞府当作当前关卡交给地形门面
    this.prevLevel = ctx.terrain && ctx.terrain.activeLevel ? ctx.terrain.activeLevel() : null;
    if (ctx.terrain && ctx.terrain.setActiveLevel) ctx.terrain.setActiveLevel(this.scene);
    const P = ctx.player;
    this.prevColliders = P.colliders;
    P.colliders = this.scene.colliders;
    P.spawn(...CAVE_SPAWN);
    P.yaw = Math.PI;
    P.vel && P.vel.set(0, 0, 0);
    if (P.entity) (P.entity.alive = !0), (P.entity.hp = P.entity.stats.get("hp")), (P.entity.mp = P.entity.stats.get("mp"));
    if (P.state === "dead" && P.respawn) P.respawn();
    if (ctx.enemies) (this.prevAuto = ctx.enemies.auto), (ctx.enemies.auto = !1);
    if (ctx.rig) {
      ctx.rig.set("play", !0);
      ctx.rig.follow = !1;
      ctx.rig.dist = BASE_DIST;
      ctx.rig.target.set(P.pos.x * 0.6 + YARD.x * 0.4, P.pos.y * 0.6 + YARD.y * 0.4 + 0.6, P.pos.z * 0.6 + YARD.z * 0.4);
      ctx.rig.update(1, !0);
    }
    this.active = !0;
    let _t = performance.now();
    this.changed({ silent: !0 });
    if (window.__caveProfile) console.log("[cave-t] changed " + Math.round(performance.now() - _t));
    if (first) {
      _t = performance.now();
      await this._prewarm();
      if (!window.__caveNoPagePrewarm) await this.ui.prewarmPages(); // 设施页首次栅格化也在遮罩下做
      // 揭开遮罩前先完整画一帧水墨；预热期间已打开的有效内观阁仍持有暂停权。
      if (!(this.active && this.ui.cur === "loadout" && this.ui.inner?.alive)) ctx.hold3d = !1;
      if (window.__caveProfile) console.log("[cave-t] first3d @" + Math.round(performance.now() - (window.__T0 ? window.__T0() : 0)));
      await nextFrame();
      await nextFrame();
      if (window.__caveProfile) console.log("[cave-t] prewarm " + Math.round(performance.now() - _t) + " reveal@" + Math.round(performance.now() - (window.__T0 ? window.__T0() : 0)));
      if (!(this.active && this.ui.cur === "loadout" && this.ui.inner?.alive)) ctx.hold3d = !1;
      this.ui.loading(!1);
    }
    this.tip("enter");
    if (lockedBack.length) this.ui.toast(lockedBack.map(({ slot, it }) => `${F.slotLockText(slot)}：${itemName(it.id)} 已收回仓库`).join("；"), "zhu", 6);
    if (gifts.length) this.ui.toast(`栏位已开：得 ${gifts.map((g) => g.name + (g.equipped ? "（已穿上）" : "（在仓库）")).join("、")}`, "gold", 6);
    if (facUp.length) this.ui.toast(facUp.map((u) => u.text + (u.recipes.length ? "，得" + u.recipes.map((g) => `${g.book}《${g.name}》`).join("、") : "")).join("；"), "gold", 6);
    // 回府时药园有熟了的：玄机子提一句（同一次回府只说一次；洞府场景里说，不压结算页）
    if (ripeN) this.ui.say(["药园有灵草熟了，去采了吧。"]);
    if (p.xp >= F.xpRoom(p) + p.xp && canBreak(p).ok) this.tip("breakReady");
    this.emit("cave:enter", { region: F.caveState(p).region });
  }
  exit() {
    if (!this.active) return;
    const { ctx } = this;
    this.ui.close();
    this.ui.unmount();
    this._unlock();
    if (this.trial) this.trial.abort();
    if (this.scene) ctx.scene.remove(this.scene.root);
    if (ctx.terrain && ctx.terrain.setActiveLevel) ctx.terrain.setActiveLevel(this.prevLevel || null);
    ctx.player.colliders = this.prevColliders || ctx.player.colliders;
    if (ctx.enemies && this.prevAuto != null) ctx.enemies.auto = this.prevAuto;
    if (ctx.rig) (ctx.rig.follow = !0), ctx.rig.set("play", !0);
    this.active = !1;
    clearTimeout(this._holdT);
    ctx.hold3d = !1;
    this.ui.loading && this.ui.loading(!1);
    this.emit("cave:exit", {});
  }
  async _buildScene() {
    const { ctx } = this;
    const region = F.caveState(this.p).region;
    if (this.scene && this.scene.region === region) {
      if (!this.scene.root.parent) ctx.scene.add(this.scene.root);
      return;
    }
    if (this.scene) (ctx.scene.remove(this.scene.root), this.scene.dispose());
    // 分帧构建：每步之间让出一帧（遮罩盖着），不出长帧
    const sc = new CaveScene({ region, brush: ctx.brush, defer: !0 });
    await sc.buildAsync(nextFrame);
    this.scene = sc;
    // 主场景里已有天空（可见）就不再叠一层
    const other = ctx.scene.children.find((o) => o.name === "sky" && o.visible);
    if (other) this.scene.sky.visible = !1;
    ctx.scene.add(this.scene.root);
  }
  // 着色器预热：洞府的材质（含药园成熟灵草、灵气微粒这类第一次出现才编译的）在遮罩下编译并画一帧
  async _prewarm() {
    const { ctx } = this;
    if (!ctx.renderer || !ctx.renderer.compile) return;
    const extra = this.scene.prewarmExtras();
    this.scene.root.add(extra);
    // 只做并行编译并等程序就绪（KHR_parallel_shader_compile），不像出行局的 prewarm 那样再整帧渲染 + gl.finish（那一帧本身就是长帧）
    const R = ctx.renderer, cam = ctx.camera || (ctx.rig && ctx.rig.cam);
    try {
      var prev = R.getRenderTarget();
      R.setRenderTarget(ctx.ink ? ctx.ink.rt : null);
      const mats = new Set(R.compile(ctx.scene, cam));
      R.setRenderTarget(prev);
      for (let k = 0; k < 300 && mats.size; k++) {
        for (const m of mats) {
          const pg = R.properties.get(m).currentProgram;
          if (!pg || pg.isReady()) mats.delete(m);
        }
        if (mats.size) await new Promise((r) => setTimeout(r, 10));
      }
      // 分帧上传几何体 / 贴图：每帧只画场景的一部分（不画阴影），第一帧正式渲染就不用一次传完
      // 画进水墨管线自己的渲染目标：与正式渲染同一套着色器变体（换别的目标会编译出另一套），遮罩盖着看不到
      const rt = ctx.ink ? ctx.ink.rt : (this._rt = this._rt || new THREE.WebGLRenderTarget(4, 4));
      const auto = R.shadowMap.autoUpdate;
      // 画整个场景（灯光、雾与正式渲染一致，着色器变体相同），但洞府里只让这一部分可见
      const parts = [...this.scene.root.children], vis = parts.map((o) => o.visible);
      for (const part of parts) {
        const t0 = performance.now();
        parts.forEach((o) => (o.visible = o === part));
        R.shadowMap.autoUpdate = !1;
        R.setRenderTarget(rt);
        R.render(ctx.scene, cam);
        R.setRenderTarget(prev);
        R.shadowMap.autoUpdate = auto;
        parts.forEach((o, i) => (o.visible = vis[i]));
        if (window.__caveProfile && performance.now() - t0 > 8) console.log("[cave-t] upload " + part.name + " " + Math.round(performance.now() - t0));
        await nextFrame();
      }
      // 阴影贴图先画一遍
      const t1 = performance.now();
      R.setRenderTarget(rt);
      R.render(ctx.scene, cam);
      R.setRenderTarget(prev);
      if (window.__caveProfile) console.log("[cave-t] shadow " + Math.round(performance.now() - t1));
      await nextFrame();
    } catch (e) {
      console.warn("[cave] 预热失败", e);
    }
    this.scene.root.remove(extra);
  }
  sceneState() {
    const p = this.p;
    const lv = (id) => F.facLevel(p, id);
    const plots = F.gardenPlots(p);
    return {
      tier: F.caveTier(p),
      plots: plots.length,
      levels: { spring: lv("spring"), furnace: lv("furnace"), forge: lv("forge"), garden: lv("garden") },
      garden: plots.map((pl) => {
        const s = F.plotState(p, pl);
        return s ? { herb: s.herb, ripe: s.ripe, k: s.k, stage: s.stage, rarity: s.rarity } : null;
      }),
    };
  }
  // 存档变化后：保存、刷新场景外观、刷新界面
  changed(o = {}) {
    if (!this.active) return;
    this.save();
    this.scene.refresh(this.sceneState());
    this.scene.setMirror && this.scene.setMirror({ unread: F.mirrorUnread(this.p).any, gold: this.p.realm.stage >= 2 });
    this.ui.refreshHud();
    if (o.stats) this.applyStats();
    if (this.ui.cur && !o.silent) this.ui.render();
  }
  // 境界、装备 → 主角属性：流程模块提供 ctx.applyProfileStats 时用它；否则按境界基础属性 + 装备词条简单套用
  applyStats() {
    const { ctx } = this;
    if (ctx.applyProfileStats) return ctx.applyProfileStats(this.p);
    const e = ctx.player.entity;
    if (!e) return;
    const hs = heroStats(this.p);
    for (const k of ["hp", "mp", "atk", "spell", "def", "crit", "critDmg", "mpRegen"]) if (hs[k] != null) e.stats.setBase(k, hs[k]);
    e.stats.removeSource("equip");
    for (const it of Object.values(this.p.equip || {})) {
      if (!it) continue;
      e.stats.addAll(F.gearMods(it), "equip");
    }
    e.hp = e.stats.get("hp");
    e.mp = e.stats.get("mp");
  }

  // ---------------- 交互 ----------------
  tip(key) {
    const p = this.p;
    const seen = (p.flags.caveTips = p.flags.caveTips || {});
    if (seen[key] || !XJZ_TIPS[key]) return;
    seen[key] = !0;
    this.ui.say(XJZ_TIPS[key]);
    this.scene && this.scene.wisp.follow();
    clearTimeout(this._wispT);
    this._wispT = setTimeout(() => this.scene && this.scene.wisp.goHome(), 9000);
  }
  // 走到站点再打开（名牌、待办点击）
  // o = { tab, sel, flash }（来自"今日可办"的一行）：走到后打开页面、切标签、选中、让相关按钮闪一下
  goTo(id, o = {}) {
    if (this.trial || this.locked) return;
    if (FAC_STATION[id] === "workshop" && o.tab === "garden") (id = "garden"), (o = { ...o, tab: undefined });
    const st = FAC_STATION[id] || id;
    const s = this.scene.stations[st];
    if (!s) return;
    if (this.ui.cur) this.ui.close();
    this.walk = { id: st, tab: o.tab || FAC_TAB[id], sel: o.sel, flash: o.flash, fac: id, to: new THREE.Vector2(...(FAC_STAND[id] || s.stand)), t: 0 };
    this.emit("cave:walk", { station: st, fac: id });
  }
  // 稳定接口：open(站点或设施 id, 标签, { sel, flash })。丹器房的标签 alchemy / forge，药园为独立站点；
  // 炼器的子类（gear item upgrade imbue reforge bind）也可直接当标签传，例如 open("forge", "reforge")
  open(id, tab, o = {}) {
    if (FAC_STATION[id] === "workshop" && tab === "garden") (id = "garden"), (tab = undefined);
    const st = FAC_STATION[id] || id;
    if (st === "mirror") return this.openMirror({ face: !0 });
    if (st === "loadout") return this.openLoadout({ ...o, tab: tab || o.tab });
    if (this.ui.cur === "loadout") this.ui.close();
    if (st === "workshop" && FORGE_SUB.includes(tab)) (o = { ...o, sel: { ...(o.sel || {}), cat: tab } }), (tab = "forge");
    const s = this.scene.stations[st];
    if (!s) return;
    this.walk = null;
    const P = this.ctx.player;
    P.forceMove = null;
    // 面朝设施
    P.yaw = Math.atan2(s.pos.x - P.pos.x, s.pos.z - P.pos.z);
    P.facing && P.facing.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    this._lock();
    this.focus = s;
    this.ui.open(st, tab || FAC_TAB[id]);
    if (o.sel) (Object.assign(this.ui.sel, o.sel), this.ui.render());
    if (o.flash) this.ui.flash(o.flash);
    // 全屏设施页淡入完成后暂停 3D 渲染（页面后面只透出一层静止的画面）；关页时恢复
    clearTimeout(this._holdT);
    this._holdT = setTimeout(() => this.ui.cur && (this.ctx.hold3d = !0), 320);
    this.tip(st);
    this.emit("cave:open", { station: st });
  }
  onPanelClosed() {
    clearTimeout(this._holdT);
    this.ctx.hold3d = !1;
    this._unlock();
    this.focus = null;
  }
  // 天机镜（UI 设计师 · 天机镜 v2）：走到镜台按 F / 点镜台（自动走过去）/ 洞府任何地方按 M，打开的都是同一个界面。
  // o = { face 面朝镜台, app 打开哪个应用 }；返回 Promise（合上后 resolve）。界面从镜台在屏幕上的位置放大，合上时缩回去
  async openMirror(o = {}) {
    if (!this.active || this.trial || this._mirrorOpen) return;
    if (this.ui.cur) this.ui.close();
    this.walk = null;
    const P = this.ctx.player;
    P.forceMove = null;
    const s = this.scene.stations.mirror;
    if (o.face && s) {
      P.yaw = Math.atan2(s.pos.x - P.pos.x, s.pos.z - P.pos.z);
      P.facing && P.facing.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    }
    this._mirrorOpen = !0;
    this._lock();
    this.scene.mirrorFlash && this.scene.mirrorFlash();
    const from = this.scene.mirrorScreen ? this.scene.mirrorScreen(this.ctx.camera || (this.ctx.rig && this.ctx.rig.cam)) : null;
    this.emit("cave:mirror", { open: !0 });
    let m = null;
    try {
      m = await this.ui.openMirror({ from, app: o.app });
    } catch (e) {
      console.error("[cave] 天机镜打开失败", e);
    }
    if (m) {
      // 进场动画走完后暂停 3D 渲染（镜子后面只透出一层静止的画面）；合上时恢复
      clearTimeout(this._holdT);
      this._holdT = setTimeout(() => m.alive && (this.ctx.hold3d = !0), 480);
      m.onClosing = () => {
        clearTimeout(this._holdT);
        this.ctx.hold3d = !1;
        this.scene.mirrorFlash && this.scene.mirrorFlash();
      };
      await m.done;
    }
    this._mirrorOpen = !1;
    this._unlock();
    this.emit("cave:mirror", { open: !1 });
    this.changed({ silent: !0 }); // 已读状态 → 今日可办、镜台朱点、挂签
  }
  // 面板打开时主角不响应操作（不改 Player：换一个没有输入的 ctx 视图）
  _lock() {
    const P = this.ctx.player;
    if (this.locked) return;
    this.locked = !0;
    this._ctx = P.ctx;
    P.ctx = Object.create(this.ctx, { input: { value: null } });
    P.vel && P.vel.set(0, 0, 0);
  }
  _unlock() {
    const P = this.ctx.player;
    if (!this.locked) return;
    this.locked = !1;
    P.ctx = this._ctx || this.ctx;
  }

  update(dt) {
    if (!this.active || !this.scene) return;
    const { ctx } = this;
    const P = ctx.player;
    this.scene.update(dt, P.pos);
    // 自动走到站点
    if (this.walk) {
      const w = this.walk;
      w.t += dt;
      const dx = w.to.x - P.pos.x, dz = w.to.y - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35 || w.t > 3.2) {
        if (d >= 0.35) P.pos.set(w.to.x, this.scene.height(w.to.x, w.to.y), w.to.y);
        P.forceMove = null;
        this.open(w.id, w.tab, w);
      } else {
        const c = Math.cos(P.camYaw || 0), s = Math.sin(P.camYaw || 0);
        const x = dx / d, z = dz / d;
        P.forceMove = [x * c - z * s, x * s + z * c];
        // 按任意移动键打断
        if (ctx.input && ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].some((k) => ctx.input.down(k))) (this.walk = null), (P.forceMove = null), this.emit("cave:walk-cancel", {});
      }
    }
    // 最近的站点
    let near = null, best = 1e9;
    for (const [id, s] of Object.entries(this.scene.stations)) {
      const d = Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z);
      if (d < s.r && d < best) (best = d), (near = id);
    }
    this.near = this.trial ? null : near;
    if (this.near && this.near !== this._lastNear) this.tip(this.near);
    this._lastNear = this.near;
    // 药园与其他站点一致：F 打开管理页，成熟作物在页内手动采收。
    if (this.near && !this.ui.cur && !this.locked && !this.walk && ctx.input && ctx.input.pressed("KeyF")) this.open(this.near);
    // 鼠标悬停在建筑（包围盒）上：显示挂签；点一下走过去
    this.hover = null;
    const cam = ctx.camera || (ctx.rig && ctx.rig.cam);
    if (cam && ctx.input && !this.ui.cur && !this.trial && !this.overUi) {
      _ray.setFromCamera(ctx.input.mouse.ndc, cam);
      let best = 1e9;
      for (const [id, boxes] of Object.entries(this.scene.stationBoxes || {}))
        for (const box of boxes)
          if (_ray.ray.intersectBox(box, _hit)) {
            const d = _hit.distanceTo(_ray.ray.origin);
            if (d < best) (best = d), (this.hover = id);
          }
      if (this.hover && ctx.input.mouse.leftPressed && !this.locked && !this.walk) this.goTo(this.hover);
    }
    const cv = ctx.renderer && ctx.renderer.domElement;
    if (cv && cv._cvHover !== this.hover) (cv.style.cursor = this.hover ? "pointer" : ""), (cv._cvHover = this.hover);
    // 镜头：打开面板时把设施放在画面左半边
    const rig = ctx.rig;
    if (rig) {
      if (this.focus) {
        rig.follow = !1;
        const s = this.focus, k = 1 - Math.exp(-dt * 4);
        const tx = s.pos.x + (s.center ? 0 : 4.2), ty = s.pos.y + 1.2, tz = s.pos.z + (s.center ? 0.5 : 1.0);
        rig.target.x += (tx - rig.target.x) * k;
        rig.target.y += (ty - rig.target.y) * k;
        rig.target.z += (tz - rig.target.z) * k;
        rig.dist += ((s.dist || 16) - rig.dist) * k;
      } else if (this.trial) {
        if (!rig.follow) rig.follow = !0;
        rig.dist += (26 - rig.dist) * (1 - Math.exp(-dt * 3));
      } else {
        rig.follow = !1;
        const k = 1 - Math.exp(-dt * 4);
        rig.target.x += (P.pos.x * 0.6 + YARD.x * 0.4 - rig.target.x) * k;
        rig.target.y += (P.pos.y * 0.6 + YARD.y * 0.4 + 0.6 - rig.target.y) * k;
        rig.target.z += (P.pos.z * 0.6 + YARD.z * 0.4 - rig.target.z) * k;
        rig.dist += (BASE_DIST - rig.dist) * (1 - Math.exp(-dt * 3));
      }
    }
    // 心魔劫
    if (this.trial) {
      this.trial.update(dt);
      this.trialHud && this.trialHud.set(this.trial.hp, this.trial.max);
    }
    this.ui.update(ctx.camera || (rig && rig.cam), this.near, this.hover);
  }

  // 采收药园：灵草拔起化作墨点飞进仓库，按品级着色的"名称 ×数量"浮字；额外得到的种子单独一行
  harvestGarden(only = null) {
    const p = this.p;
    const res = F.harvestPlots(p, only);
    if (!res.length) return this.ui.toast("还没有熟的灵草", "zhu"), [];
    const g = this.scene.groups.garden, plots = (g && g.userData.plots) || [];
    const to = this.scene.models.storage;
    res.forEach((r, k) => {
      const [px, pz] = plots[r.plot] || [0, 0];
      const from = new THREE.Vector3(g.position.x + px, g.position.y + 0.6, g.position.z + pz);
      const q = r.herb.rarity || 0, col = RARITY[q].color;
      this.scene.fx.harvestFly(from, to, col);
      // 浮字用纸面可读的品级字色（从 RARITY 推导，与储物袋物品名同一个函数）
      setTimeout(() => this.ui.floatAt(from, `${itemName(r.herb.id)} ×${r.herb.n}`, inkReadable(q)), k * 140);
      if (r.seed) setTimeout(() => this.ui.toast(`另得种子：${F.seedName(r.seed)}`, "gold", 3), 400 + k * 140);
    });
    this.changed();
    this.emit("cave:harvest", { plots: res.map((r) => r.plot), items: res.flatMap((r) => [r.herb, r.seed].filter(Boolean)) });
    return res;
  }

  // 参悟后的“去装配”与心魔前的“调整功法”统一进入内观阁，不另开一套装配弹层。
  async openLoadout(o = {}) {
    if (!this.active || this.trial || this._mirrorOpen || this.ui.cur === "loadout") return;
    if (this.ui.fire || this.ui.root?.querySelector(".cv-break,.cv-wipe")) return;
    const modal = this.ui.root?.querySelector(".cv-modal");
    if (modal) {
      if (o.from !== "trial") return;
      // 先取消待发起的心魔劫（走原确认框收尾，释放 Esc 栈），调整完再回灵泉渡劫。
      modal.querySelector('[data-act="cancel"]')?.click();
    }
    if (this.ui.cur) this.ui.close();
    this.walk = null;
    const P = this.ctx.player, s = this.scene.stations.loadout;
    P.forceMove = null;
    if (s) {
      P.yaw = Math.atan2(s.pos.x - P.pos.x, s.pos.z - P.pos.z);
      P.facing && P.facing.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    }
    this._lock();
    this.focus = s;
    this.emit("cave:open", { station: "loadout" });
    try {
      const hall = await this.ui.openInner(o);
      if (hall && this.active && this.ui.inner === hall) {
        clearTimeout(this._holdT);
        this._holdT = setTimeout(() => this.ui.inner === hall && hall.alive && (this.ctx.hold3d = !0), 480);
      }
      return hall;
    } catch (e) {
      console.error("[cave] 内观阁打开失败", e);
      if (this.ui.cur === "loadout") this.ui.close();
      if (this.active) this.ui.toast("内观阁尚未展开，请再试一次", "zhu");
      return null;
    }
  }

  // ---------------- 演出 ----------------
  meditate(dur = 3) {
    const P = this.ctx.player;
    P.play && P.play("cast_raise", 0.25, !0, Math.min(1.2, dur));
    this.scene.fx.meditate(P.pos, dur);
    return new Promise((res) =>
      setTimeout(() => {
        P.play && P.play("idle", 0.4);
        res();
      }, dur * 1000),
    );
  }
  fxMeditate(dur = 1.5) {
    this.scene.fx.meditate(this.ctx.player.pos, dur);
  }
  fxPuff(model) {
    const g = this.scene.groups[model];
    if (g) this.scene.fx.puff(g.position);
  }
  fxSurge(model, color) {
    const g = this.scene.groups[model];
    if (g) this.scene.fx.surge(g.position, color);
  }
  fireK(k) {
    this.scene.fx.fire("furnace", k == null ? 0.35 : k);
  }

  // ---------------- 突破 ----------------
  async breakthrough() {
    const p = this.p;
    const b = canBreak(p);
    if (!b.ok) return this.ui.toast("尚不能突破", "zhu");
    const fromKey = p.realm.stage + ":" + p.realm.layer;
    const from = realmName(p);
    const fromR = { ...p.realm }, beforeStats = heroStats(p), spent = xpNeed(p);
    if (b.trial) {
      const ok = await this.ui.confirm("心魔劫", "服下筑基丹，引药力冲关。心魔会化作你的模样拦在前面——胜了，便是筑基修士；败了，筑基丹不失，改日再来。", {
        ok: "渡劫", seal: !0, extra: { label: "调整功法", id: "trial-loadout", onClick: () => this.openLoadout({ from: "trial" }) },
      });
      if (!ok) return;
      const win = await this.runTrial();
      if (!win) {
        F.trialFailed(p, fromKey);
        this.save();
        this.ui.say(["心魔未破。不急，筑基丹还在，养好了再来。"]);
        return;
      }
    }
    // 破境
    this.ui.close();
    const unlocks = F.doBreakthrough(p);
    const grants = F.grantRealm(p);
    for (const u of unlocks) if (u.recipes) grants.push(...u.recipes); // 丹炉 / 炼器鼎解锁送的配方
    const learnedG = grants.filter((g) => g.kind !== "item" && g.kind !== "recipe"); // 赠送的基础款（kind "item"）不算领悟
    if (learnedG.length) syncNewLearned(p); // 突破领悟的功法也先放进空栏
    const toKey = p.realm.stage + ":" + p.realm.layer;
    const to = realmName(p);
    const mem = MEMORIES[toKey];
    const lit = (p.flags.memories = p.flags.memories || []);
    if (mem && !lit.includes(toKey)) lit.push(toKey);
    F.recordBreak(p, { from: fromR, to: { ...p.realm }, before: beforeStats, unlocks, grants, memory: mem ? toKey : null, xp: spent, trial: b.trial });
    this.applyStats();
    this.save();
    const P = this.ctx.player;
    this.scene.fx.surge(P.pos, p.realm.stage >= 2 ? 0xe0b45a : 0x7fd0c0, p.realm.stage >= 2 ? 16 : 9);
    this.ctx.rig && this.ctx.rig.shake(0.4);
    this.emit("cave:breakthrough", { from: fromKey, to: toKey, unlocks, grants });
    const shown = [...unlocks, ...grants.map((g) => ({ key: "learn", id: g.id, item: g.kind === "item", value: g.name, text: g.kind === "item" ? `${g.name}${g.equipped ? "（已穿上）" : "（在仓库）"}` : g.kind === "recipe" ? `得${g.book}《${g.name}》` : (g.kind === "xinfa" ? "领悟心法 · " : "习得 · ") + g.name }))];
    await breakFx(this.ui.root, { from, to, unlocks: shown, memory: mem, xjz: XJZ_BREAK[toKey], gold: p.realm.stage >= 2 });
    this.changed({ stats: !0 });
    if (learnedG.length) this.ui.toast(`新领悟：${learnedG.map((g) => g.name).join("、")}`, "gold", 6, null, { label: "去装配", id: "go-loadout", onClick: () => this.openLoadout({ from: "study", tab: learnedG[0].kind === "xinfa" ? "xinfa" : learnedG[0].kind === "formations" ? "formation" : "spell" }) });
  }
  async runTrial() {
    const { ctx } = this;
    this.ui.close();
    this._unlock();
    const P = ctx.player;
    const center = new THREE.Vector3(0, 0, 1.2);
    P.pos.set(0, this.scene.height(0, 3.6), 3.6);
    P.yaw = Math.PI;
    this.ui.speech.clear();
    banner(this.ui.root, "心魔劫");
    document.body.classList.add("mk-in-run");
    this.trialHud = new TrialHud(this.ui.root);
    this.ui.tags.hide(!0);
    const t = (this.trial = new XinmoTrial(ctx, { center, hp: this.debug.xinmoHp }));
    const win = await t.start();
    this.trial = null;
    document.body.classList.remove("mk-in-run");
    this.trialHud.remove();
    this.trialHud = null;
    this.ui.tags.hide(!1);
    if (P.state === "dead" && P.respawn) P.respawn();
    if (P.entity) (P.entity.hp = P.entity.stats.get("hp")), (P.entity.alive = !0);
    return win;
  }

  // ---------------- 出行与搬迁 ----------------
  depart() {
    this.ui.close();
    this.emit("cave:depart", {});
    if (this.ctx.flow && this.ctx.flow.go) this.ctx.flow.go("prep");
    else this.ui.toast("（出行准备由流程模块接管）", "");
  }
  async relocate() {
    const p = this.p;
    const c = F.canRelocate(p);
    if (!c.ok) return this.ui.toast(c.why, "zhu");
    const ok = await this.ui.confirm("打包搬迁", "把整座洞府收进储物袋，搬去竹海·溪谷灵脉。灵泉、药园里的苗、仓库，一样不落。", { ok: "搬迁", seal: !0 });
    if (!ok) return;
    this.tip("relocate");
    this.ui.close();
    let built;
    await wipe(this.ui.root, "竹海 · 溪谷", () => {
      F.relocate(p, "r2");
      this.ctx.hold3d = !0;
      built = this._buildScene().then(async () => {
        if (this.ctx.terrain && this.ctx.terrain.setActiveLevel) this.ctx.terrain.setActiveLevel(this.scene);
        this.ctx.player.colliders = this.scene.colliders;
        this.ctx.player.spawn(...CAVE_SPAWN);
        this.scene.levels = {};
        this.changed({ silent: !0 });
        this.ctx.rig && this.ctx.rig.update(1, !0);
        await this._prewarm();
        this.ctx.hold3d = !1;
      });
    });
    await built;
    this.emit("cave:relocate", { region: "r2" });
    this.tip("relocated");
  }
}
export { STATIONS, GARDEN_PLOTS };
