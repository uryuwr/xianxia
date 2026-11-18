// 出行局场景（模块 A）：建 Run、局内界面（天时、天机镜、储物袋）、结束后转结算。
import { kit } from "../kit.js";
import { Run } from "../../game/run/run.js";
import { RunHud } from "./runhud.js";
import { BagUI } from "../bagui.js";
import { PauseMenu } from "./pause.js";
import { PrologueUI } from "./prologue_ui.js";
import { getQuests, questsReady, resetQuests } from "../../game/flow/quests.js";
import { prewarm } from "../../render/prewarm.js";

export function runScene(flow) {
  const ctx = flow.ctx;
  const S = {
    live: !0,
    hud: !0,
    run: null,
    async enter(data = {}) {
      const P = flow.profile;
      const region = data.region || "r1";
      const L = kit.layer("loading", 80);
      kit.clear("loading");
      kit.show("loading", !0);
      L.appendChild(kit.el("div", "mk-loading mk-paperbg", `<div>入图 · ${region === "tutorial" ? "溪边" : region === "r2" ? "竹海·溪谷" : "青岚山外"}</div>`));
      kit.css("loading", `.mk-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 400 64px var(--f-splash); letter-spacing: .2em; color: var(--ink); }`);
      ctx.player.root.visible = !0;
      // 先让加载画面真正画出来再开始建关卡（建关卡是同步的大块计算，不让出一帧的话画面会停在上一个界面上）
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      await questsReady;
      const quests = region !== "tutorial" ? getQuests(ctx) : null; // 委托（出行准备里接的）与奇遇（第 6 局起）
      const run = (S.run = new Run(ctx, P, region, { carried: data.carried, protect: data.protect, seed: data.seed, quests }));
      window.__game.run = run;
      try {
        await run.start();
      } catch (e) {
        console.error("[flow] 出行局启动失败", e);
        kit.toast("入图失败：" + e.message, { kind: "warn", dur: 4 });
      }
      ctx.rig.set("play", !0);
      S.hudUI = new RunHud(ctx, run);
      S.bagUI = new BagUI(ctx, run);
      S.proUI = new PrologueUI(ctx, run, flow);
      S.pause = new PauseMenu(flow, S);
      // 加载画面还盖着：预编译关卡与常用特效的着色器、预算整张关卡的寻路网格（性能优化，见 docs/性能优化_v1.md）
      try {
        const nav = ctx.enemies && ctx.enemies.nav;
        if (nav && nav.prebuild && run.map) await nav.prebuild(run.map.bounds);
        await prewarm(ctx, ctx.ink);
      } catch (e) {
        console.warn("[flow] 预热失败", e);
      }
      kit.show("loading", !1);
      S.onEsc = (e) => {
        if (e.code !== "Escape" || e.repeat || flow.name !== "run") return;
        e.preventDefault();
        // 确认框、暂停菜单、F8 调试、功法匣弹层在 src/ui/esc.js 的弹层栈里先处理，到不了这里
        if (document.querySelector(".mk-modal")) return;
        if (S.pause.open) return S.pause.toggle(!1);
        if (S.bagUI && S.bagUI.open) return S.bagUI.toggle(!1);
        if (S.hudUI && S.hudUI.big) return S.hudUI.toggleMap(!1);
        const bp = ctx.skills && ctx.skills.panel; // 构筑面板（` 键，战斗调试）
        if (bp && bp.open) return bp.toggle(!1);
        if (S.run && S.run.state === "done") return;
        // 首领入场 / 转阶段 / 处决演出不可打断：Esc 不呼出菜单
        const bc = S.run && S.run.boss && S.run.boss.e && S.run.boss.e.ctrl;
        if ((bc && ["intro", "transition", "exec"].includes(bc.mode)) || document.body.classList.contains("mk-bossexec")) return;
        S.pause.toggle(!0);
      };
      addEventListener("keydown", S.onEsc);
      S.quests = quests;
      run.on((type) => {
        if (type === "end") setTimeout(() => flow.name === "run" && S.run === run && flow.go("result", { result: run.result, region }), run.result.result === "extract" ? 900 : 300);
      });
    },
    update(dt) {
      const r = S.run;
      if (!r || flow.paused) return;
      r.update(dt);
      S.hudUI && S.hudUI.update(dt);
      S.bagUI && S.bagUI.update(dt);
      S.proUI && S.proUI.update(dt);
    },
    exit() {
      if (S.onEsc) removeEventListener("keydown", S.onEsc), (S.onEsc = null);
      S.pause && S.pause.dispose();
      S.proUI && S.proUI.dispose(), (S.proUI = null);
      S.hudUI && S.hudUI.dispose();
      S.bagUI && S.bagUI.dispose();
      S.hudUI = S.bagUI = null;
      if (S.run) S.run.dispose();
      S.run = null;
      resetQuests(); // 委托实例一局一个（下次出行准备重新生成）
      window.__game.run = null;
      ctx.player.deadT = 0;
      if (ctx.player.state === "dead") ctx.player.respawn();
    },
  };
  return S;
}
