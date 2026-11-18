// 开始界面（模块 A）：续卷 / 新卷 / 卷宗 / 设置 / 画外记。版式依据 docs/ui/v2/start（左侧留白一列菜单，右侧竖排行书"墨途"+ 朱印），
// 背景是慢慢转动的青岚山实景，左侧淡入成纸面留白。
import { kit } from "../kit.js";
import { setEscIdle } from "../esc.js";
import { listSaves, deleteSave } from "../../core/profile.js";
import { MODES, TIERS } from "../../render/quality.js";
const TGT = Object.values(import.meta.glob("../../game/targeting/settings.js", { eager: !0 }))[0] || null;

const CSS = `
.mk-title { position: absolute; inset: 0; pointer-events: none; }
.mk-title .veil { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(236,230,214,.96) 0%, rgba(236,230,214,.86) 26%, rgba(236,230,214,0) 52%),
  radial-gradient(ellipse 75% 70% at 60% 50%, transparent 55%, rgba(150,125,85,.28) 100%); }
.mk-title .brand { position: absolute; left: 112px; top: 120px; display: flex; align-items: center; gap: 14px; }
.mk-title .brand .ink-rule { width: 160px; }
.mk-title .brand span { font: 15px var(--f-kai); color: var(--ink-zhong); letter-spacing: .5em; }
.mk-title .menu { position: absolute; left: 110px; top: 200px; display: flex; flex-direction: column; gap: 18px; pointer-events: auto; align-items: flex-start; }
.mk-title .menu .ink-btn { font-size: 30px; padding-left: 4px; }
.mk-title .menu .ink-btn.cont { font-size: 38px; color: var(--ink); }
.mk-title .menu .row { display: flex; align-items: center; gap: 18px; }
.mk-title .save { display: flex; flex-direction: column; gap: 3px; }
.mk-title .save .a { font: 16px var(--f-display); color: var(--ink-nong); letter-spacing: .1em; }
.mk-title .save .b { font: 12px var(--f-ui); color: var(--ink-dan); }
.mk-title .name { position: absolute; right: 88px; top: 70px; display: flex; flex-direction: row-reverse; gap: 22px; align-items: flex-start; }
.mk-title .name .word { writing-mode: vertical-rl; font-size: 150px; color: var(--ink); text-shadow: 0 0 30px rgba(245,240,227,.9), 0 0 60px rgba(245,240,227,.6); }
.mk-title .name .side { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 28px; }
.mk-title .name .ink-tiba { font-size: 17px; color: var(--ink-nong); letter-spacing: .35em; text-shadow: 0 0 8px rgba(245,240,227,.9); }
.mk-title .foot { position: absolute; left: 112px; bottom: 40px; font: 12px var(--f-ui); color: var(--ink-dan); letter-spacing: .08em; }
.mk-sub { position: absolute; left: 90px; top: 150px; width: 560px; pointer-events: auto; }
.mk-slots { display: flex; flex-direction: column; }
.mk-slots .ink-row { align-items: center; padding: 10px 2px; }
.mk-slots .no { font: 34px var(--f-display); width: 1.3em; text-align: center; }
.mk-slots .info { flex: 1; font: 16px/1.5 var(--f-kai); }
.mk-opt { display: flex; align-items: center; gap: 6px; margin: 8px 0; }
.mk-opt > span:first-child { width: 6em; font: 16px var(--f-kai); color: var(--ink-zhong); }
.mk-opt .ink-btn.on { color: var(--ink); }
.mk-opt .ink-btn.on::after { transform: scaleX(1); background: var(--zhu); opacity: .85; }
`;

export function fmtTime(sec = 0) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} 时 ${m % 60} 分` : `${m} 分`;
}
export function realmText(r) {
  if (!r || !r.stage) return "凡人";
  return (r.stage === 2 ? "筑基" : "练气") + ("一二三四五六七八九"[r.layer - 1] || r.layer) + "层";
}
const NUM = "一二三";

export function titleScene(flow) {
  let L = null;
  const S = {
    live: !1,
    hud: !1,
    enter() {
      kit.css("title", CSS);
      flow.backdrop("title");
      L = kit.layer("title", 40);
      kit.show("title", !0);
      S.menu();
      // 卷宗 / 设置 / 画外记：Esc = 返回主菜单（src/ui/esc.js）；主菜单本身就是菜单，Esc 不做事
      S.offEsc = setEscIdle(() => flow.name === "title" && S.view !== "menu" && (S.menu(), !0));
    },
    exit() {
      S.offEsc && S.offEsc(), (S.offEsc = null);
      kit.clear("title");
      kit.show("title", !1);
    },
    update(dt, raw) {
      flow.driftCamera(raw);
    },
    frame(withName = !0) {
      kit.clear("title");
      const root = kit.el("div", "mk-title");
      root.appendChild(kit.el("div", "veil"));
      if (withName) {
        const nm = kit.el("div", "name", `<div class="word ink-splash">墨途</div>`);
        const side = kit.el("div", "side", `<div class="ink-tiba">画中一梦 · 山河留白</div>`);
        side.appendChild(kit.seal("林墨", { cls: "two", size: 46 }));
        nm.appendChild(side);
        root.appendChild(nm);
      }
      root.appendChild(kit.el("div", "foot", "墨途 · 第一版闭环 v0.1 · F8 调试"));
      L.appendChild(root);
      return root;
    },
    menu() {
      S.view = "menu";
      const root = S.frame();
      root.insertAdjacentHTML("beforeend", `<div class="brand"><div class="ink-rule"></div><span>青岚山外</span></div>`);
      const menu = kit.el("div", "menu");
      const latest = flow.latestSlot();
      const info = latest && listSaves().find((s) => s.slot === latest);
      const row = kit.el("div", "row");
      const cont = kit.button("续卷", () => S.continue(latest), { disabled: !latest, id: "continue" });
      cont.classList.add("cont");
      row.appendChild(cont);
      if (info) row.appendChild(kit.el("div", "save", `<span class="a">${realmText(info.realm)} · 出行 ${info.runs || 0} 次</span><span class="b">第${NUM[latest - 1]}卷 · ${fmtTime(info.playTime)} · ${info.savedAt ? new Date(info.savedAt).toLocaleDateString() : ""}</span>`));
      menu.append(row, kit.button("新卷", () => S.newGame(), { id: "new" }), kit.button("卷宗", () => S.slots(), { id: "slots" }), kit.button("设置", () => S.settings(), { id: "settings" }), kit.button("画外记", () => S.about(), { id: "about" }));
      root.appendChild(menu);
    },
    async continue(slot) {
      if (!slot) return;
      const r = flow.loadGame(slot);
      if (!r) return kit.toast("存档损坏", { kind: "warn" });
      if (r.abandoned) {
        const a = r.abandoned;
        if (a.exempt) await kit.prompt("上次出行中途离开", "上次出行时合上了画卷。按规矩应以「身陨」论处——这一次，玄机子替你担下了。储物袋里的东西已收进仓库。<br><span class='mk-dim'>（下次中途离开将按身陨结算）</span>", [{ label: "知道了", value: 1, primary: !0 }]);
        else await kit.prompt("中途离开 · 按身陨结算", `上次出行时合上了画卷，按「身陨」结算：失去 ${a.result.lost.length} 件物品${a.result.gearLost ? "（含法器）" : ""}。`, [{ label: "知道了", value: 1, primary: !0 }]);
      }
      if (!r.profile.flags.tutorialDone) return flow.go("intro");
      flow.go("cave", { from: "load" });
    },
    async newGame() {
      const saves = listSaves();
      let slot = (saves.find((s) => s.empty) || {}).slot;
      if (!slot) {
        slot = await kit.prompt("新卷", "三卷都已写满，覆盖哪一卷？", [...saves.map((s) => ({ label: `第${NUM[s.slot - 1]}卷 · ${realmText(s.realm)}`, value: s.slot, red: !0 })), { label: "算了", value: 0 }]);
        if (!slot) return;
      }
      // 本机已有存档通关过序章：问一句是否跳过（默认不跳）
      const skip = flow.anyPrologueDone() && (await kit.prompt("序章", "本机已有通关序章的卷宗。这一卷要跳过序章吗？<br><span class='mk-dim'>跳过：佩上锈剑、带 1 枚回春丹，直接回府。</span>", [{ label: "跳过序章", value: !0 }, { label: "不跳过", value: !1, primary: !0 }]));
      flow.newGame(slot);
      if (skip) return flow.skipPrologue();
      flow.go("intro");
    },
    slots() {
      S.view = "slots";
      const root = S.frame();
      const p = kit.panel("卷宗 <small>三个存档位</small>", { cls: "mk-sub" });
      const list = kit.el("div", "mk-slots ink-list");
      for (const s of listSaves()) {
        const row = kit.el("div", "ink-row");
        row.appendChild(kit.el("div", "no", NUM[s.slot - 1]));
        row.appendChild(kit.el("div", "info", s.empty ? "<span class='mk-dim'>空白</span>" : s.broken ? "<span class='mk-red'>存档损坏</span>" : `${realmText(s.realm)} · 出行 ${s.runs || 0} 次 · ${fmtTime(s.playTime)}<br><span class="ink-note">${s.savedAt ? new Date(s.savedAt).toLocaleString() : ""}</span>`));
        if (!s.empty) {
          row.appendChild(kit.button("载入", () => S.continue(s.slot), { small: !0, disabled: s.broken }));
          row.appendChild(
            kit.button("删除", async () => {
              if (await kit.confirm("删除卷宗", `确定删除第${NUM[s.slot - 1]}卷？此操作不可恢复。`, { ok: "删除" })) deleteSave(s.slot), localStorage.removeItem("moxian.run." + s.slot), S.slots();
            }, { small: !0, red: !0 }),
          );
        } else row.appendChild(kit.button("新卷", () => (flow.newGame(s.slot), flow.go("intro")), { small: !0 }));
        list.appendChild(row);
      }
      p.body.append(list, kit.button("返回", () => S.menu()));
      root.appendChild(p.root);
    },
    settings() {
      S.view = "settings";
      const root = S.frame();
      root.appendChild(settingsPanel(flow, () => S.menu()).root);
    },
    about() {
      S.view = "about";
      const root = S.frame();
      const p = kit.panel("画外记", { cls: "mk-sub" });
      p.body.innerHTML = `<p class="mk-tip" style="font-size:16px">墨途 · 第一版闭环（v0.1）<br>加班夜在博物馆避雨的林墨，被一幅古画吸了进去，醒来已在墨州青岚山外。<br>
        以 Three.js 实时渲染淡彩水墨；美术资源由代码在 GPU 上生成；书法字体：马善政楷书、志莽行书（SIL OFL）。<br><br>WASD 移动 · 空格闪身 · 左键出剑 · 右键蓄势斩 · Q/E/R 法术 · T 阵盘 · V 法宝 · F 交互 · G 遁地符 · Tab 储物袋 · M 天机镜</p>`;
      p.body.appendChild(kit.button("返回", () => S.menu()));
      root.appendChild(p.root);
    },
  };
  return S;
}

export function settingsPanel(flow, back) {
  kit.css("title", CSS);
  const s = flow.settings;
  const p = kit.panel("设置", { cls: "mk-sub" });
  const opt = (label, values, key, get = () => s[key], set = (v) => ((s[key] = v), flow.applySettings())) => {
    const row = kit.el("div", "mk-opt");
    row.dataset.key = key;
    row.appendChild(kit.el("span", "", label));
    for (const [v, name] of values) {
      const b = kit.button(name, () => {
        set(v);
        for (const x of row.querySelectorAll(".ink-btn")) x.classList.toggle("on", x === b);
      }, { small: !0 });
      b.dataset.value = String(v);
      if (get() === v) b.classList.add("on");
      row.appendChild(b);
    }
    p.body.appendChild(row);
  };
  opt("画面", [["ink", "水墨"], ["tint", "淡彩"], ["real", "写实"]], "look");
  opt("伤害数字", [[!0, "显示"], [!1, "隐藏"]], "dmgNumbers");
  opt("震屏", [[0, "关"], [0.5, "弱"], [1, "标准"]], "shake");
  opt("教学提示", [[!0, "开"], [!1, "关"]], "hints"); // 关掉只隐藏对白条里的提示；标题、目标卷轴、墨箭保留
  if (TGT && TGT.getSetting) opt("快速施法", [[!1, "先瞄准"], [!0, "按键即放"]], "quickCast", () => !!TGT.getSetting("quickCast"), (v) => TGT.setSetting("quickCast", v));
  const Q = flow.ctx.quality;
  if (Q) {
    // 画质（src/render/quality.js）：自动档显示当前实际档位
    const qText = () => (Q.mode === "auto" ? `画质自动：当前「${TIERS[Q.tier].name}」，帧率不足时自动降一档。` : "画质 高：原画质；中：降分辨率与阴影；低：再降分辨率、关植被投影。");
    const qTip = kit.el("div", "mk-tip mk-dim", qText());
    opt("画质", MODES, "quality", () => Q.mode, (v) => (Q.set(v), (qTip.textContent = qText())));
    p.body.appendChild(qTip);
  }
  p.body.appendChild(kit.el("div", "mk-tip mk-dim", "暂无声音选项。"));
  p.body.appendChild(kit.button("返回", back, { id: "back" }));
  return p;
}
