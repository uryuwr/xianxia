// 洞府全屏演出（模块 C）：突破漩涡 + 天机镜记忆碎片、心魔劫界面、搬迁卷轴、墨涌。
import { el, btn, paper } from "./widgets.js";
import { skillIconEl } from "../icons.js";

export const UNLOCK_NAME = {
  spellSlots: "法术栏", pillSlots: "丹药栏", robeSlot: "法衣栏", xinfaSlots: "心法栏", jadeSlot: "玉佩栏",
  doubleJump: "二段跳", artifactSlot: "法宝栏", formationSlot: "阵法栏", swordFly: "御剑", sword_fly: "御剑",
  region2: "竹海 · 溪谷", region3: "黑风岭", pillCap: "丹药囊", bagCapacity: "储物袋", furnace: "丹炉已复燃", forge: "炼器鼎已可用",
};
export function unlockText(u) {
  if (u.text) return u.text;
  const n = UNLOCK_NAME[u.key] || u.key;
  return typeof u.value === "number" ? `${n} ×${u.value}` : n;
}

// 天机镜屏幕上的裂纹
const CRACK = `<svg class="crack" viewBox="0 0 220 430" preserveAspectRatio="none"><g fill="none" stroke="rgba(220,240,245,.55)" stroke-width="1.2">
<path d="M150 0 L138 70 L160 118 L120 170 L132 230 L96 300"/><path d="M138 70 L90 96 L60 92"/><path d="M160 118 L214 140"/><path d="M120 170 L70 186 L30 230"/><path d="M132 230 L190 262 L220 250"/><path d="M96 300 L110 360 L84 430"/></g></svg>`;

export function mirrorCard(mem, { delay = 0.9 } = {}) {
  const m = el("div", "cv-mirror" + (mem.clue ? " clue" : ""));
  m.innerHTML = `<div class="scr">${CRACK}<div class="ttl">天 机 镜</div><div class="big">${mem.title}</div>${mem.lines
    .map((l, i) => `<div class="ln" style="animation-delay:${delay + i * 1.3}s">${l}</div>`)
    .join("")}</div>`;
  return m;
}

// 突破演出：{ from, to, unlocks: [{key, value}], memory, xjz, gold } → Promise（点"收功"结束）
export function breakFx(root, o) {
  return new Promise((res) => {
    const b = el("div", "cv-break");
    b.innerHTML = `<div class="vortex ${o.gold ? "gold" : ""}"></div><div class="core"></div>`;
    const main = el("div", "main");
    main.innerHTML = `<div class="from">${o.from}</div><div class="to ink-splash fx-stamp">${o.to}</div>`;
    const unl = el("div", "unl");
    (o.unlocks || []).forEach((u, i) => {
      const d = el("div", "", `<span class="ink-seal ${o.gold ? "gold" : ""}" style="--s:30px">${u.item ? "得" : "解"}</span>${unlockText(u)}`);
      // 法术栏 / 心法栏：放一个空圆相；习得的法术 / 心法：技能图标
      if (u.key === "spellSlots" || u.key === "xinfaSlots") d.insertAdjacentHTML("afterbegin", `<span class="cv-enso-empty"></span>`);
      else if (u.key === "learn" && u.id && !u.item) {
        const ic = skillIconEl(u.id);
        if (ic) {
          const w = el("span", "cv-skill-ico");
          w.appendChild(ic);
          d.prepend(w);
        }
      }
      d.style.animationDelay = 1.0 + i * 0.35 + "s";
      unl.appendChild(d);
    });
    main.appendChild(unl);
    const t0 = 1.2 + (o.unlocks || []).length * 0.35;
    if (o.xjz) {
      const x = el("div", "xjz", `玄机子：“${o.xjz}”`);
      x.style.animationDelay = t0 + 0.4 + "s";
      main.appendChild(x);
    }
    const go = el("div", "go");
    go.style.animationDelay = t0 + 1.0 + "s";
    go.appendChild(btn("收功", () => (b.remove(), res()), { id: "break-done", key: "Enter" }));
    main.appendChild(go);
    b.appendChild(main);
    if (o.memory) b.appendChild(mirrorCard(o.memory, { delay: 1.3 }));
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    const key = (e) => {
      if (e.code === "Enter" || e.code === "Escape") (removeEventListener("keydown", key), b.isConnected && (b.remove(), res()));
    };
    setTimeout(() => addEventListener("keydown", key), 1500);
    root.appendChild(b);
  });
}

// 已亮起的记忆一览（原 mirrorList）已由天机镜 v2 的相册取代：src/ui/cave/mirror_v2.js（CaveUI.showMirrors → Cave.openMirror）

// 灵气充盈：一笔石青圆相涌开，中间"灵气充盈"大字 + 档位印，下面一行效果；1.9 秒散去
export function buffFx(root, name, effects, up = !0) {
  const [t, tier] = name.split(" · ");
  const b = el("div", "cv-buff-fx", `<i class="ring"></i><div class="t ink-splash">${t}</div><span class="ink-seal blue two fx-stamp" style="--s:52px;font-size:18px">${tier || ""}</span><div class="e">${effects}${up ? "" : "　· 时长刷新"}</div>`);
  root.appendChild(b);
  setTimeout(() => b.remove(), 1950);
  return b;
}
export function surge(root, rarity) {
  const s = el("div", "cv-surge" + (rarity >= 4 ? " ji" : ""));
  root.appendChild(s);
  setTimeout(() => s.remove(), 1500);
}
export function banner(root, text) {
  const s = el("div", "cv-banner", text);
  root.appendChild(s);
  setTimeout(() => s.remove(), 2300);
}
export function wipe(root, text, mid) {
  return new Promise((res) => {
    const w = el("div", "cv-wipe", `<div class="ink-splash">${text}</div>`);
    root.appendChild(w);
    setTimeout(() => mid && mid(), 1100);
    setTimeout(() => (w.remove(), res()), 2650);
  });
}

// 心魔劫：顶部气血条 + 画面四周墨晕
export class TrialHud {
  constructor(root) {
    this.v = el("div", "cv-vignette");
    this.box = el("div", "cv-trial", `<div class="ttl">心 魔</div><div class="ink-bar hp thick" style="--v:1"><i></i></div><div class="sub">它会你会的一切。看清它的起手，再出剑。</div>`);
    root.append(this.v, this.box);
    this.bar = this.box.querySelector(".ink-bar");
  }
  set(hp, max) {
    this.bar.style.setProperty("--v", Math.max(0, hp / max).toFixed(3));
  }
  remove() {
    this.v.remove();
    this.box.remove();
  }
}
export { paper };
