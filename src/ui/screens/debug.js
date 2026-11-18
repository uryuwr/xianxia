// 调试面板（模块 A）：F8 打开。跳场景、发物品、加修为、立即撤离 / 身陨。也挂在 window.__game.debug。
import { kit } from "../kit.js";
import { pushEsc } from "../esc.js";
import { makeItem, ITEMS } from "../../core/items.js";
import { addXp, applyUnlocks } from "../../game/progression.js";
import { ensureFlowItems } from "../../game/run/flow_items.js";

export class DebugPanel {
  constructor(flow) {
    this.flow = flow;
    this.open = !1;
    addEventListener("keydown", (e) => e.code === "F8" && (e.preventDefault(), this.toggle()));
    const g = (window.__game = window.__game || {});
    g.debug = this;
  }
  toggle(on = !this.open) {
    this.open = on;
    const L = kit.layer("debug", 90);
    kit.clear("debug");
    kit.show("debug", on);
    // Esc 先关调试面板（src/ui/esc.js 弹层栈），不顺带弹出暂停
    if (on && !this.popEsc) this.popEsc = pushEsc(() => this.toggle(!1));
    if (!on && this.popEsc) this.popEsc(), (this.popEsc = null);
    if (!on) return;
    const p = kit.panel("调试 <small>F8</small>");
    p.root.style.cssText = "position:absolute;right:10px;bottom:10px;width:420px;font-size:14px;";
    const row = (label, btns) => {
      const r = kit.el("div", "mk-row");
      r.style.flexWrap = "wrap";
      r.appendChild(kit.el("span", "mk-dim", label));
      for (const [t, fn] of btns) r.appendChild(kit.button(t, () => (fn(), this.toggle(!0)), { small: !0 }));
      p.body.appendChild(r);
    };
    const f = this.flow;
    row("场景", [["标题", () => f.go("title")], ["洞府", () => this.needProfile() && f.go("cave")], ["准备", () => this.needProfile() && f.go("prep")], ["区域一", () => this.needProfile() && f.go("run", { region: "r1" })], ["区域二", () => this.needProfile() && f.go("run", { region: "r2" })], ["教学", () => this.needProfile() && f.go("run", { region: "tutorial" })], ["沙盒", () => f.go("sandbox")]]);
    row("物品", [["灵石×50", () => this.give("spirit_stone", 50)], ["回春丹×3", () => this.give("huichun_dan", 3)], ["回气丹×3", () => this.give("huiqi_dan", 3)], ["遁地符×2", () => this.give("dundi_fu", 2)], ["宝品碎玉", () => this.give("spirit_orb_shard", 1, 2)], ["填满储物袋", () => this.fillBag()]]);
    row("修为", [["+100", () => this.needProfile() && addXp(f.profile, 100)], ["练气五层", () => this.realm(1, 5)], ["解锁全部", () => this.needProfile() && ((f.profile.flags.unlockAll = !0), applyUnlocks(f.profile))]]);
    row("出行", [["立即撤离", () => this.extract()], ["身陨", () => this.die()], ["入夜", () => f.run && (f.run.t = f.run.R.phases[2] + 1)], ["存档", () => f.save()]]);
    L.appendChild(p.root);
  }
  needProfile() {
    if (!this.flow.profile) this.flow.newGame(3);
    return !0;
  }
  give(id, n = 1, rarity = 0) {
    ensureFlowItems();
    if (!ITEMS[id]) return kit.toast("没有物品 " + id, { kind: "warn" });
    const it = makeItem(id, { n, rarity });
    const r = this.flow.run;
    if (r && r.state !== "done") return r.bag.add(it) || r.pickups.drop(this.flow.ctx.player.pos, it, 1);
    this.needProfile();
    this.flow.profile.storage.add(it);
  }
  fillBag() {
    const r = this.flow.run;
    if (!r) return;
    for (let k = 0; k < 64 && r.bag.free > 0; k++) r.bag.add(makeItem("spirit_orb_shard", { rarity: 1 })) || r.bag.add(makeItem("wolf_fang", { rarity: k % 4 }));
  }
  realm(stage, layer) {
    this.needProfile();
    const P = this.flow.profile;
    P.realm = { stage, layer };
    P.xp = 0;
    P.flags.tutorialDone = P.flags.awakened = !0;
    applyUnlocks(P);
  }
  extract() {
    const r = this.flow.run;
    if (r && (r.state === "play" || r.state === "channel")) r.extract({ kind: "debug", name: "调试撤离" });
  }
  die() {
    const r = this.flow.run, h = this.flow.ctx.player.entity;
    if (!r) return;
    if (!h.alive) return;
    h.hp = 0;
    h.alive = !1;
    this.flow.ctx.world.events.emit("kill", { target: h, attacker: null, amount: 1e6, killed: !0 });
  }
  update() {}
}
