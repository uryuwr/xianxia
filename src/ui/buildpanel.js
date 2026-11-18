// 构筑面板（` 键开关）：配置法术栏、法宝与祭炼等级、阵法、心法；调试按钮用于验证数值成长与流派组合。
import { SPELLS, FORMATIONS, REALMS } from "../data/skills.js";
import { ARTIFACTS, XINFA } from "../data/items.js";

const KAI = '"STKaiti","KaiTi","楷体","Kaiti SC","PingFang SC",serif';
const CSS = `
.jx-panel { position: fixed; right: 18px; top: 18px; width: 340px; max-height: calc(100vh - 140px); overflow: auto; z-index: 40;
  background: linear-gradient(#f6f1e4, #ebe2cc); border: 2px solid #1d1f22; border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
  font: 13px "PingFang SC", "Microsoft YaHei", sans-serif; color: #15181b; padding: 12px 14px; display: none; }
.jx-panel.on { display: block; }
.jx-panel h2 { margin: 0 0 6px; font: 900 22px ${KAI}; letter-spacing: .2em; }
.jx-panel h3 { margin: 12px 0 6px; font: 900 16px ${KAI}; border-bottom: 1px solid rgba(21,24,27,.25); padding-bottom: 2px; }
.jx-panel .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.jx-panel .row b { width: 44px; font-weight: 700; }
.jx-panel select { flex: 1; font: inherit; background: #fbf8f0; border: 1px solid #8a8780; border-radius: 3px; padding: 2px 4px; }
.jx-panel button { font: inherit; background: #fbf8f0; border: 1px solid #1d1f22; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
.jx-panel button.on { background: #1d1f22; color: #f6f1e4; }
.jx-panel .lv button { padding: 2px 7px; }
.jx-panel .xf { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.jx-panel .xf label { display: flex; gap: 4px; align-items: center; }
.jx-panel .dbg { display: flex; flex-wrap: wrap; gap: 6px; }
.jx-panel .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 12px; color: #3a3d40; }
.jx-panel .desc { font-size: 12px; color: #55585a; margin: 2px 0 4px 52px; }
.jx-panel .hint { font-size: 12px; color: #6a6d70; margin-top: 8px; }
`;

const STAT_LABEL = [
  ["hp", "气血上限"], ["mp", "真气上限"], ["atk", "攻击"], ["spell", "法力"], ["def", "防御"], ["crit", "暴击率", "%"], ["critDmg", "暴击伤害", "x"],
  ["cdr", "冷却缩减", "%"], ["mpRegen", "真气回复"], ["move", "移速"], ["metal", "金行"], ["wood", "木行"], ["water", "水行"], ["fire", "火行"], ["earth", "土行"],
];

export class BuildPanel {
  constructor(sys) {
    this.sys = sys;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement("div");
    this.el.className = "jx-panel";
    document.body.appendChild(this.el);
    for (const ev of ["mousedown", "mouseup", "click", "wheel"]) this.el.addEventListener(ev, (e) => e.stopPropagation());
    this.render();
    this.statT = 0;
  }
  get open() {
    return this.el.classList.contains("on");
  }
  toggle(v = !this.open) {
    this.el.classList.toggle("on", v);
    if (v) this.render();
  }
  render() {
    const s = this.sys, L = s.loadout;
    const opt = (tbl, sel) => Object.values(tbl).map((d) => `<option value="${d.id}" ${d.id === sel ? "selected" : ""}>${d.name}${d.element ? "（" + ({ metal: "金", wood: "木", water: "水", fire: "火", earth: "土" }[d.element]) + "）" : ""}</option>`).join("");
    const spellRows = ["Q", "E", "R"].map((k, i) => s.slotLocked(i) ? `<div class="row"><b>${k}</b><span class="desc">${s.unlockText(i)}</span></div>` : `<div class="row"><b>${k}</b><select data-spell="${i}"><option value="">（空）</option>${opt(SPELLS, L.spells[i])}</select></div><div class="desc">${s.spellAt(i) ? "【" + s.spellAt(i).role + "】" + s.spellAt(i).desc : ""}</div>`).join("");
    const realmRow = `<div class="row"><b>境界</b><select data-realm>${REALMS.map((r) => `<option value="${r.id}" ${r.id === s.realm ? "selected" : ""}>${r.name}（${r.slots} 个法术栏）</option>`).join("")}</select></div>`;
    const a = ARTIFACTS[L.artifact.id];
    const f = FORMATIONS[L.formation];
    this.el.innerHTML = `
      <h2>构筑</h2>
      <h3>法术</h3>${realmRow}${spellRows}
      <h3>法宝</h3>
      <div class="row"><b>V</b><select data-art>${opt(ARTIFACTS, L.artifact.id)}</select></div>
      <div class="desc">${a ? a.desc : ""}</div>
      <div class="row lv"><b>祭炼</b>${[1, 2, 3, 4, 5].map((n) => `<button data-lv="${n}" class="${n === L.artifact.level ? "on" : ""}">${n} 重</button>`).join("")}</div>
      <h3>阵法</h3>
      <div class="row"><b>T</b><select data-fm>${opt(FORMATIONS, L.formation)}</select></div>
      <div class="desc">${f ? f.desc : ""}</div>
      <h3>心法</h3>
      <div class="xf">${Object.values(XINFA).map((x) => `<label title="${x.desc}"><input type="checkbox" data-xf="${x.id}" ${L.xinfa.includes(x.id) ? "checked" : ""}>${x.name}</label>`).join("")}</div>
      <h3>调试</h3>
      <div class="dbg">
        <button data-act="power">修为 +10 级</button><button data-act="unpower">清除修为加成</button>
        <button data-act="dummy">放三个木桩</button><button data-act="full">回满</button><button data-act="cd">重置冷却</button>
      </div>
      <h3>属性</h3><div class="stats"></div>
      <div class="hint">\` 键开关面板 · Q/E/R 法术 · V 法宝 · 右键蓄势斩 · T 布阵 · 1/2 丹药</div>`;
    this.el.querySelectorAll("[data-spell]").forEach((el) => el.addEventListener("change", () => {
      const sp = [...s.loadout.spells];
      sp[+el.dataset.spell] = el.value || null;
      s.setLoadout({ spells: sp });
      this.render();
    }));
    this.el.querySelector("[data-realm]").addEventListener("change", (e) => (s.setRealm(e.target.value), this.render()));
    this.el.querySelector("[data-art]").addEventListener("change", (e) => (s.setLoadout({ artifact: { id: e.target.value, level: s.loadout.artifact.level } }), this.render()));
    this.el.querySelectorAll("[data-lv]").forEach((el) => el.addEventListener("click", () => (s.setLoadout({ artifact: { id: s.loadout.artifact.id, level: +el.dataset.lv } }), this.render())));
    this.el.querySelector("[data-fm]").addEventListener("change", (e) => (s.setLoadout({ formation: e.target.value }), this.render()));
    this.el.querySelectorAll("[data-xf]").forEach((el) => el.addEventListener("change", () => {
      const set = new Set(s.loadout.xinfa);
      el.checked ? set.add(el.dataset.xf) : set.delete(el.dataset.xf);
      s.setLoadout({ xinfa: [...set] });
    }));
    this.el.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", () => s.debugAction(el.dataset.act)));
    this.updateStats();
  }
  updateStats() {
    const h = this.sys.hero, box = this.el.querySelector(".stats");
    if (!h || !box) return;
    box.innerHTML = STAT_LABEL.map(([k, n, u]) => {
      const v = h.stats.get(k);
      const t = u === "%" ? (v * 100).toFixed(0) + "%" : u === "x" ? v.toFixed(2) + "x" : Math.round(v * 10) / 10;
      return `<span>${n}</span><span style="text-align:right">${t}</span>`;
    }).join("") + `<span>修为加成</span><span style="text-align:right">${this.sys.powerLevel} 级</span>`;
  }
  update(dt) {
    if (!this.open) return;
    if ((this.statT -= dt) <= 0) (this.statT = 0.3), this.updateStats();
  }
}
