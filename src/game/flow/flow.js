// 场景流程（模块 A）：开始界面 → 开场 → 洞府 → 出行准备 → 出行局 → 结算 → 洞府。
//   ctx.flow.go(name, data)   切换场景（ctx 常驻，不重建渲染器与战斗世界）
//   ctx.profile               当前存档；ctx.save() 保存（进入洞府、出行前、结算后、突破后）
//   ctx.ui                    界面组件（src/ui/kit.js）
// 事件（ctx.world.events）：flow:enter {name, data}、run:start {region, run}、run:end {result, run}
//
// 场景对象：{ live 是否运行战斗与主角, hud 是否显示战斗界面, enter(data), exit(next), update(dt, raw) }
import { kit } from "../../ui/kit.js";
import { newProfile, saveProfile, loadProfile, listSaves } from "../../core/profile.js";
import { applyUnlocks } from "../progression.js";
import { makeItem } from "../../core/items.js";
import { normBuild, syncNewLearned } from "../../ui/loadout.js";
import { checkAbandonedRun, applyHeroStats } from "../run/run.js";
import { ensureFlowItems } from "../run/flow_items.js";
import { showBackdrop } from "../run/map.js";
import { titleScene } from "../../ui/screens/title.js";
import { introScene } from "../../ui/screens/intro.js";
import { caveScene } from "../../ui/screens/cave.js";
import { prepScene } from "../../ui/screens/prep.js";
import { runScene } from "../../ui/screens/run.js";
import { resultScene } from "../../ui/screens/result.js";
import { DebugPanel } from "../../ui/screens/debug.js";

const SETTINGS_KEY = "moxian.settings";
export const DEFAULT_SETTINGS = { look: "tint", dmgNumbers: !0, shake: 1, hints: !0 };

export class Flow {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.flow = this;
    ctx.ui = kit;
    ctx.save = () => this.save();
    ctx.applyProfileStats = (p = this.profile) => p && applyHeroStats(ctx, p); // 境界属性 + 装备 + 已学功法（洞府模块调用）
    this.profile = null;
    this.name = null;
    this.scene = null;
    this.seq = 0;
    const saved = readJSON(SETTINGS_KEY);
    this.settings = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) this.settings[k] = k in saved ? saved[k] : DEFAULT_SETTINGS[k];
    this.scenes = {
      title: titleScene(this),
      intro: introScene(this),
      cave: caveScene(this),
      prep: prepScene(this),
      run: runScene(this),
      result: resultScene(this),
      sandbox: sandboxScene(this),
    };
    this.debug = new DebugPanel(this);
    ensureFlowItems();
    // 震屏强度
    const rig = ctx.rig, shake = rig.shake.bind(rig);
    rig.shake = (a) => shake(a * this.settings.shake);
    this.applySettings();
  }

  get live() {
    return !this.paused && !!(this.scene && this.scene.live);
  }
  get run() {
    return this.scenes.run.run || null;
  }

  async go(name, data = {}) {
    const next = this.scenes[name];
    if (!next) throw new Error("未知场景 " + name);
    const seq = ++this.seq;
    this.paused = !1;
    const prev = this.scene;
    if (prev && prev.exit) await prev.exit(name);
    if (seq !== this.seq) return; // 期间又切了场景
    this.name = name;
    this.scene = next;
    document.body.classList.toggle("mk-in-run", !!next.hud);
    document.body.dataset.scene = name;
    const toasts = document.querySelector(".mk-toasts");
    if (toasts) toasts.innerHTML = ""; // 上一场景的提示不带进下一场景
    this.ctx.world.events.emit("flow:enter", { name, data });
    await next.enter(data);
    return next;
  }
  update(dt, raw) {
    if (this.profile && this.name !== "title") this.profile.playTime += raw;
    if (this.scene && this.scene.update) this.scene.update(dt, raw);
    this.debug.update();
  }

  // ---------------- 存档 ----------------
  newGame(slot) {
    const p = newProfile(slot);
    p.flags.buildV2 = !0; // 新存档：装配 v2 规则，从不自动补栏
    applyUnlocks(p);
    this.profile = this.ctx.profile = p;
    this.save();
    return p;
  }
  // 读档：顺带处理"上次局内关闭页面"（按身陨结算，第一次豁免）
  loadGame(slot) {
    ensureFlowItems();
    const p = loadProfile(slot);
    if (!p) return null;
    applyUnlocks(p);
    this.profile = this.ctx.profile = p;
    migrateBuild(p);
    const ab = checkAbandonedRun(p);
    if (ab) {
      this.ctx.world.events.emit("run:end", { result: "abandon", run: null, abandon: ab });
      this.save();
    }
    return { profile: p, abandoned: ab };
  }
  // 跳过序章（新卷时询问 / 暂停菜单）：结果与通关一致——佩锈剑、回春丹 ×1、tutorialDone，直接回府觉醒；不给金符与战利品
  skipPrologue() {
    const P = this.profile;
    if (!P) return;
    ensureFlowItems();
    if (!P.equip.sword) P.equip.sword = makeItem("rust_sword");
    P.storage.add(makeItem("huichun_dan", { n: 1 }));
    P.flags.tutorialDone = !0;
    P.flags.prologueSkipped = !0;
    this.save();
    return this.go("cave", { from: "skip" });
  }
  // 本机是否有存档通关过序章（新卷时才询问是否跳过）
  anyPrologueDone() {
    for (const s of [1, 2, 3])
      try {
        const p = JSON.parse(localStorage.getItem("moxian.save." + s));
        if (p && p.flags && p.flags.tutorialDone) return !0;
      } catch {}
    return !1;
  }
  latestSlot() {
    const s = listSaves().filter((x) => !x.empty && !x.broken);
    s.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return s[0] ? s[0].slot : null;
  }
  save() {
    if (!this.profile) return 0;
    return saveProfile(this.profile);
  }

  // ---------------- 设置 ----------------
  applySettings() {
    const s = this.settings, g = window.__game;
    if (g && g.setInk) {
      g.setInk(s.look === "real" ? 0 : 1);
      g.setTint(s.look === "ink" ? 0 : 1);
    }
    document.body.classList.toggle("mk-no-dmg", !s.dmgNumbers);
    // 与瞄准模块（src/game/targeting/settings.js）共用同一个键：合并写入，不覆盖它的字段
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readJSON(SETTINGS_KEY), ...s }));
    } catch {}
  }

  // 菜单场景的背景：样张地图上慢慢转动的远景
  backdrop(view = "title") {
    const ctx = this.ctx, rig = ctx.rig;
    showBackdrop(ctx);
    ctx.player.root.visible = !1; // 界面里不放 3D 主角（用 2D 立绘）
    const V = BACKDROPS[view] || BACKDROPS.title;
    rig.follow = !1;
    rig.target.set(...V.target);
    rig.dist = V.dist;
    rig.pitch = (V.pitch * Math.PI) / 180;
    rig.yaw = V.yaw;
    rig.yawOff = 0;
    this.drift = V.drift || 0;
    this.driftT = 0;
    rig.update(1, !0);
  }
  driftCamera(raw) {
    if (!this.drift) return;
    this.driftT += raw;
    this.ctx.rig.yawOff = Math.sin(this.driftT * 0.05) * this.drift;
  }
}

const BACKDROPS = {
  title: { target: [-2, 3, -8], dist: 46, pitch: 28, yaw: 0.35, drift: 0.35 },
  menu: { target: [4, 3, -4], dist: 38, pitch: 36, yaw: -0.2, drift: 0.2 },
  cave: { target: [-5.5, 3.5, 16.5], dist: 18, pitch: 38, yaw: 0.15, drift: 0.1 },
};

// 旧的战斗沙盒（测试与调试用）：样张地图 + 自动刷怪
function sandboxScene(flow) {
  const ctx = flow.ctx;
  return {
    live: !0,
    hud: !0,
    enter() {
      showBackdrop(ctx);
      ctx.player.root.visible = !0;
      ctx.player.deadT = 0;
      ctx.enemies.auto = !0;
      ctx.rig.set("play", !0);
    },
    exit() {
      ctx.enemies.auto = !1;
    },
  };
}

function migrateBuild(p) {
  if (p.flags.buildV2) return;
  const b = normBuild(p), L = p.flags.learned || {};
  const n = p.unlocks.spellSlots ?? 1;
  const pool = (L.spells || []).filter((id) => !b.spells.includes(id));
  for (let i = 0; i < n; i++) if (!b.spells[i]) b.spells[i] = pool.shift() || null;
  if (!b.xinfa.some(Boolean)) (L.xinfa || []).slice(0, p.unlocks.xinfaSlots || 0).forEach((id, i) => (b.xinfa[i] = id));
  syncNewLearned(p); // 记下"已见过"的功法与栏数
  p.flags.buildV2 = !0;
}

function readJSON(k) {
  try {
    return JSON.parse(localStorage.getItem(k)) || {};
  } catch {
    return {};
  }
}
