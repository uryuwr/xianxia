// 内观阁宿主：懒加载后复用出行准备的同一个构建器，不复制行囊 / 装备 / 功法逻辑。
// 洞府保管锁定与 hold3d；本宿主仅保管共享页与 Esc。打开时创建，关闭即 dispose。
import { makePrep } from "../screens/prep.js";
import { kit } from "../kit.js";

export class LoadoutHall {
  constructor(ui, o = {}) {
    this.ui = ui;
    this.o = o;
    this.alive = !0;
    const ctx = ui.cave.ctx, tab = o.sel?.tab || o.tab;
    // 独立洞府调试页没有流程状态机，只适配共享页需要的存档接口。
    const flow = ctx.flow || {
      get profile() { return ui.cave.p; },
      save: () => ui.cave.save(),
      driftCamera() {},
    };
    this.prep = makePrep(ctx, {
      flow,
      inner: !0,
      tab: ["spell", "xinfa", "formation", "artifact"].includes(tab) ? tab : undefined,
      onClose: () => this.close(),
      onStudy: () => {
        // 仓库属于洞府：先释放内观阁的锁定与 hold3d，再打开真实 scroll 分类。
        this.close();
        ui.cave.open("storage", "scroll");
      },
      onDepart: () => {
        this.close();
        ui.cave.depart();
      },
    });
  }
  async open() {
    kit.css("inner-hall", ".mk-inner-hall { animation: mkInnerIn .48s var(--ease-ink) both; } @keyframes mkInnerIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } } @media (prefers-reduced-motion: reduce) { .mk-inner-hall { animation:none; } }");
    await this.prep.enter();
    if (!this.alive) return;
    // 共享页在稳定 layer 上维护唯一 Esc 栈；属性明细等在它之上。
    this.prep.layer?.classList.add("mk-inner-hall");
    const stat = this.o.sel?.stat;
    if (stat) this.prep.openStats(stat);
  }
  render() {
    if (this.alive) this.prep.render();
  }
  close() {
    if (!this.alive) return;
    this.ui.close();
    this.o.onClose?.();
  }
  dispose() {
    if (!this.alive) return;
    this.alive = !1;
    this.prep.layer?.classList.remove("mk-inner-hall");
    this.prep.exit(); // 共享页统一保存预案、取消异步并 applyProfileStats。
    if (!this.ui.cave.ctx.applyProfileStats) this.ui.cave.applyStats();
  }
}
