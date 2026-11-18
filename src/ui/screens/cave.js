// 洞府场景（模块 A 的接入层 + 占位界面）。
// 洞府模块（C）存在时：src/game/cave/index.js 导出 class Cave(ctx)，流程调用
//   cave.enter({ profile, flow, from, result }) / cave.exit() / cave.update(dt, raw)；cave.live 为真时流程照常更新主角（在洞府里走动）。
// 不存在时显示占位洞府：出行台、灵泉炼化、仓库、突破。
// 剧情：教学局后第一次回府 → 引气入体（练气一层）、学剑气斩（玩法评审 G6：遁地符推到第 3 局再给）。
import { kit } from "../kit.js";
import { setEscIdle } from "../esc.js";
import { PauseMenu } from "./pause.js";
import { defOf, valueOf, makeItem } from "../../core/items.js";
import { realmName, xpNeed, addXp, canBreak, breakthrough, applyUnlocks } from "../../game/progression.js";
import { INTRO_AT, runIndex } from "../../game/run/regions.js";
import { ensureFlowItems } from "../../game/run/flow_items.js";
import { settingsPanel } from "./title.js";
import { hideSample } from "../../game/run/map.js";
import { COPY } from "../copy.js";
import { syncNewLearned } from "../loadout.js";
import { SPELLS, FORMATIONS } from "../../data/skills.js";
import { XINFA } from "../../data/items.js";

// 懒加载：洞府模块出错时不拖垮启动，退回占位洞府
const caveLoad = Object.values(import.meta.glob("../../game/cave/index.js"))[0];
const facLoad = Object.values(import.meta.glob("../../game/cave/facilities.js"))[0];
let CaveMod = null, FAC = {};
const caveReady = Promise.all([
  caveLoad && caveLoad().then((m) => (CaveMod = m)).catch((e) => console.error("[flow] 洞府模块加载失败，改用占位洞府", e)),
  facLoad && facLoad().then((m) => (FAC = m)).catch(() => {}),
]);

const CSS = `
.mk-cave { position: absolute; left: 40px; top: 6vh; width: 540px; max-height: 88vh; overflow: auto; }
.mk-cave .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 12px 0; }
.mk-cave .ink-bar { margin: 6px 0 4px; }
.mk-cave .mk-cells { max-height: 270px; overflow: auto; padding: 4px; }
`;

// 进入洞府时按进度发放的剧情物品与能力
export function caveStory(profile) {
  ensureFlowItems();
  const P = profile, out = [];
  if (P.flags.tutorialDone && !P.flags.awakened) {
    P.flags.awakened = !0;
    P.flags.justAwakened = !0; // 洞府模块可据此播放玄机子讲解（播完自行清掉）
    if (P.realm.stage === 0) {
      P.realm = { stage: 1, layer: 1 };
      P.xp = 0;
    }
    applyUnlocks(P);
    if (!P.build.spells[0]) P.build.spells[0] = "sword_qi";
    const Lr = (P.flags.learned = P.flags.learned || { spells: [], xinfa: [] });
    Lr.spells = Lr.spells || [];
    if (!Lr.spells.includes("sword_qi")) Lr.spells.push("sword_qi"); // 剑气斩记为已领悟（功法匣里才能装卸）
    // 锈剑：没佩戴就佩上
    if (!P.equip.sword) {
      const s = P.storage.items.find((it) => it.id === "rust_sword");
      if (s) P.equip.sword = P.storage.remove(s.uid);
    }
    out.push("引气入体 · 练气一层", "学会「剑气斩」（Q）", COPY.awaken);
  }
  if (P.flags.awakened && runIndex(P) >= INTRO_AT.talisman && !P.flags.gotDundi) {
    P.flags.gotDundi = !0;
    P.storage.add(makeItem("dundi_fu", { n: 2 }));
    out.push("玄机子赠「遁地符」×2（按 G 随处遁回洞府）");
  }
  return out;
}

export function caveScene(flow) {
  const ctx = flow.ctx;
  let L, cave = null;
  const S = {
    live: !1,
    hud: !1,
    async enter(data = {}) {
      const P = flow.profile;
      // 洞府里没有任何界面开着（走动中、心魔劫战斗中）按 Esc → Esc 菜单；开着的设施页 / 天机镜 / 弹层各自处理 Esc（src/ui/esc.js）
      S.pause = S.pause || new PauseMenu(flow, { run: null });
      S.offEsc = setEscIdle(() => !S.busy() && (S.pause.toggle(!0), !0));
      const story = caveStory(P);
      // 新领悟的功法 / 新开的栏：第一次见到时放进空栏（之后玩家在出行准备里自己定，不再自动补）
      for (const id of syncNewLearned(P)) story.push(`「${(SPELLS[id] || XINFA[id] || FORMATIONS[id] || { name: id }).name}」已放进随身功法栏（出行准备里可更换）`);
      flow.save(); // 进入洞府保存
      await caveReady;
      if (CaveMod && CaveMod.Cave) {
        try {
          cave = cave || new CaveMod.Cave(ctx);
          S.live = cave.live !== !1; // 洞府里林墨可以走动
          document.body.classList.toggle("mk-in-run", !!cave.hud);
          hideSample();
          ctx.player.root.visible = !0;
          await cave.enter({ profile: P, flow, from: data.from, result: data.result, story });
          if (data.station) cave.open(data.station, data.tab, data.options || {});
          return;
        } catch (e) {
          console.error("[flow] 洞府模块出错，改用占位洞府", e);
          cave = null;
        }
      }
      S.live = !1;
      kit.css("cave", CSS);
      flow.backdrop("cave");
      L = kit.layer("cave", 41);
      kit.show("cave", !0);
      S.render();
      for (const s of story) kit.toast(s, { kind: "gold", dur: 3.5 });
    },
    exit() {
      S.offEsc && S.offEsc(), (S.offEsc = null);
      S.pause && S.pause.dispose();
      if (cave) return cave.exit && cave.exit();
      kit.clear("cave");
      kit.show("cave", !1);
    },
    // 有界面占着 Esc：设施页、天机镜、确认框 / 升阶弹层、突破与搬迁演出、加载遮罩、功法匣、kit 弹框
    busy() {
      if (flow.name !== "cave" || document.querySelector(".mk-modal, .mk-ld-pop, .qd-wrap")) return !0;
      if (!cave) return !1;
      const ui = cave.ui;
      return !cave.active || cave.locked || !!cave._mirrorOpen || !!(ui && (ui.cur || (ui.mirror && ui.mirror.alive) || (ui.root && ui.root.querySelector(".cv-modal, .cv-break, .cv-wipe, .cv-loading, .ws2-modal"))));
    },
    update(dt, raw) {
      if (flow.paused) return; // Esc 菜单开着：洞府（含心魔劫）整体停住，F / C / M 也不响应
      if (cave) return cave.update && cave.update(dt, raw);
      flow.driftCamera(raw);
    },
    render(view = "main") {
      const P = flow.profile;
      kit.clear("cave");
      const need = xpNeed(P);
      const p = kit.panel(`破洞府 <small>${realmName(P)}</small>`, { cls: "mk-cave" });
      const b = p.body;
      b.appendChild(kit.el("div", "ink-label", `修为 ${Math.floor(P.xp)} / ${need === Infinity ? "—" : need}`));
      b.appendChild(kit.bar(need === Infinity ? 1 : P.xp / need, "xp"));
      const stones = P.storage.count("spirit_stone");
      const acts = kit.el("div", "acts");
      acts.append(
        kit.button("出行台", () => flow.go("prep"), { primary: !0, small: !0, id: "prep" }),
        kit.button(`灵泉炼化 · 灵石 ${stones}`, () => S.refine(), { small: !0, id: "refine", disabled: !stones || P.xp >= need }),
      );
      const cb = canBreak(P);
      if (P.xp >= need && need !== Infinity) acts.appendChild(kit.button("突破", () => S.breakthrough(), { seal: !0, small: !0, id: "break", disabled: !cb.ok }));
      acts.append(kit.button("仓库", () => S.render(view === "store" ? "main" : "store"), { small: !0, id: "store" }), kit.button("设置", () => S.settings(), { small: !0 }), kit.button("收卷", () => flow.go("title"), { small: !0, id: "totitle" }));
      b.appendChild(acts);
      if (P.xp >= need && !cb.ok) b.appendChild(kit.el("div", "mk-tip mk-red", "突破所需：" + cb.need.filter((n) => n.type === "item").map((n) => `${(defOf({ id: n.id }) || { name: n.id }).name}×${n.n}`).join("、")));
      if (view === "store") {
        b.appendChild(kit.el("h3", "", `仓库 <small class="mk-dim">${P.storage.items.length} 件 · 估价 ${P.storage.value} · 灵石 ${P.storage.count("spirit_stone")}</small>`));
        const cells = kit.el("div", "mk-cells");
        for (const it of P.storage.items) cells.appendChild(kit.itemCell(it, { onClick: () => S.equip(it) }));
        b.appendChild(cells);
        b.appendChild(kit.el("div", "mk-tip", "点装备即可佩戴。"));
      }
      b.appendChild(kit.el("div", "mk-tip mk-dim", "（占位洞府：洞府模块完成后替换）"));
      L.appendChild(p.root);
    },
    refine() {
      const P = flow.profile;
      let gain;
      if (FAC.refine && FAC.stoneCap) gain = FAC.refine(P, FAC.stoneCap(P));
      else {
        const n = Math.min(P.storage.count("spirit_stone"), Math.ceil(xpNeed(P) - P.xp));
        P.storage.consume("spirit_stone", n);
        gain = addXp(P, n, "refine");
      }
      kit.toast(`炼化得修为 +${Math.round(gain)}`, { kind: "gold" });
      flow.save();
      S.render();
    },
    breakthrough() {
      const P = flow.profile;
      const before = realmName(P);
      const un = breakthrough(P);
      flow.save(); // 突破后保存
      kit.toast(`${before} → ${realmName(P)}`, { kind: "gold", dur: 3 });
      for (const u of un) kit.toast(`解锁：${u.key}`, { dur: 3 });
      S.render();
    },
    equip(it) {
      const P = flow.profile, d = defOf(it) || {};
      if (!d.slot || !(d.slot in P.equip)) return;
      const cur = P.equip[d.slot];
      P.equip[d.slot] = P.storage.remove(it.uid);
      if (cur) P.storage.add(cur);
      kit.toast(`佩上 ${d.name}`);
      S.render("store");
    },
    settings() {
      kit.clear("cave");
      const p = settingsPanel(flow, () => S.render());
      L.appendChild(p.root);
    },
  };
  return S;
}
