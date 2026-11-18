// Esc 菜单（模块 A）：出行局（暂停）、洞府、心魔劫、结算页没有界面开着时按 Esc 打开，世界暂停。只有 继续 / 设置 / 回到主页——局内回洞府必须自己找撤离点。
// 开着时在 src/ui/esc.js 弹层栈顶：Esc 在设置页 = 回菜单，在菜单 = 继续；其它按键截住（不在菜单后面开储物袋 / 天机镜）。
// "回到主页"按身陨结算（与中途关闭页面同一规则，第一次豁免），确认框写明代价。
import { kit } from "../kit.js";
import { pushEsc } from "../esc.js";
import { settingsPanel } from "./title.js";
import { REGIONS } from "../../game/run/regions.js";
import { checkAbandonedRun } from "../../game/run/run.js";

const CSS = `
.mk-pause { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 75% at 50% 50%, rgba(236,230,214,.78), rgba(215,205,180,.92)); }
.mk-pause .mk-panel.menu { left: 460px; top: 200px; width: 360px; } /* 面板进场动画会改 transform，定位只用 left / top */
.mk-pause .menu .acts { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 6px; }
.mk-pause .menu .acts .ink-btn { font-size: 26px; }
.mk-pause .word { left: 850px; top: 170px; writing-mode: vertical-rl; font-size: 84px; color: var(--ink); opacity: .85; }
.mk-pause .mk-sub { left: 360px; top: 130px; }
`;

export class PauseMenu {
  constructor(flow, scene) {
    this.flow = flow;
    this.scene = scene;
    this.open = !1;
    kit.css("pause", CSS);
  }
  toggle(on = !this.open) {
    this.open = on;
    this.flow.paused = on;
    if (on && !this.popEsc) this.popEsc = pushEsc(() => (this.view === "settings" ? this.menu() : this.toggle(!1)), { block: !0 });
    if (!on && this.popEsc) this.popEsc(), (this.popEsc = null);
    const L = kit.layer("pause", 72);
    kit.clear("pause");
    kit.show("pause", on);
    document.body.classList.toggle("mk-paused", on);
    if (on) this.menu();
  }
  frame() {
    kit.clear("pause");
    const root = kit.el("div", "mk-pause");
    root.addEventListener("mousedown", (e) => e.stopPropagation());
    const stage = kit.el("div", "mk-stage");
    root.appendChild(stage);
    kit.layer("pause").appendChild(root);
    return stage;
  }
  menu() {
    this.view = "menu";
    const stage = this.frame();
    stage.appendChild(kit.el("div", "word ink-splash", "暂歇"));
    const p = kit.panel("暂停 <small>Esc 继续</small>", { cls: "menu" });
    const acts = kit.el("div", "acts");
    acts.append(
      kit.button("继续", () => this.toggle(!1), { id: "resume" }),
      kit.button("设置", () => this.settings(), { id: "settings" }),
      ...(this.scene.run && this.scene.run.region === "tutorial" ? [kit.button("跳过序章", () => this.skip(), { id: "skip" })] : []),
      kit.button("回到主页", () => this.toTitle(), { id: "totitle", red: !0 }),
    );
    p.body.appendChild(acts);
    if (this.scene.run) p.body.appendChild(kit.el("div", "mk-tip mk-dim", "回洞府须自行赶到撤离点。"));
    stage.appendChild(p.root);
  }
  settings() {
    this.view = "settings";
    const stage = this.frame();
    stage.appendChild(settingsPanel(this.flow, () => this.menu()).root);
  }
  async skip() {
    const ok = await kit.confirm("跳过序章", "直接回府：佩上锈剑、带 1 枚回春丹，与通关序章一致。<br><span class='mk-dim'>序章里拾到的东西与金符不保留。</span>", { ok: "跳过序章", cancel: "再想想" });
    if (!ok) return;
    this.toggle(!1);
    this.flow.skipPrologue();
  }
  async toTitle() {
    const flow = this.flow, run = this.scene.run, P = flow.profile;
    if (!run) return this.toggle(!1), flow.go("title"); // 洞府 / 结算页的 Esc 菜单：直接回主页
    const tut = run.region === "tutorial";
    const R = REGIONS[run.region] || {};
    const text = tut
      ? "教学局中途离开不会损失任何东西，下次续卷会从溪边重新开始。"
      : `出行途中离开，按「身陨」结算：${R.riskText}。` + (P.flags.reloadExempted ? "" : "<br><span class='mk-gold'>第一次中途离开由玄机子担下，这次不受损失（只豁免一次）。</span>");
    if (!(await kit.confirm("回到主页", text, { ok: "回到主页", cancel: "再想想" }))) return;
    if (!tut) {
      run.syncPotions();
      run.saveMarker(!0);
    }
    this.toggle(!1);
    await flow.go("title");
    // 与中途关闭页面同一规则：按身陨结算（首次豁免），立即写入存档
    const ab = tut ? null : checkAbandonedRun(P);
    if (ab) {
      flow.ctx.world.events.emit("run:end", { result: "abandon", run: null, abandon: ab });
      kit.toast(ab.exempt ? "中途离开：玄机子担下了，这次不受损失" : `中途离开按身陨结算：失去 ${ab.result.lost.length} 件`, { kind: ab.exempt ? "gold" : "warn", dur: 3.5 });
    }
    flow.save();
    flow.scenes.title.menu();
  }
  dispose() {
    if (this.open) this.toggle(!1);
  }
}
