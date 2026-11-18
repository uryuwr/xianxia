// 开场（模块 A）：几张水墨字卡讲清穿越背景，可跳过；结束后进入教学局。
import { kit } from "../kit.js";

const CARDS = [
  { t: "雨夜 · 博物馆", s: "加班到深夜，你躲进博物馆的古画展厅避雨。展柜里，是刚出土的《万象山河图》残卷。" },
  { t: "画卷", s: "手机亮起的一瞬，画上的墨活了过来——漫出画框，吞没了灯光、雨声，和你。" },
  { t: "天机镜", s: "醒来时，裂屏的手机变成了一面古镜——它记得你走过的每一寸山水。" },
  { t: "玄机子", s: "「小子，你身上有股怪味……罢了，先活下去。往溪边那处破洞府去。」" },
  { t: "墨州 · 青岚山外", s: "", big: !0 },
];

const CSS = `
.mk-intro { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 48%, transparent 55%, rgba(120,100,70,.22) 100%), var(--ink-tex-paper), var(--ink-tex-fiber), var(--paper); background-blend-mode: normal, multiply, multiply, normal; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.mk-intro .card { max-width: 720px; text-align: center; animation: mkIn 1.1s ease both; }
.mk-intro .card h1 { font: 400 64px var(--f-splash); letter-spacing: .12em; margin: 0 0 26px; color: var(--ink); }
.mk-intro .card.big h1 { font-size: 110px; }
.mk-intro .card p { font: 22px/1.9 var(--f-kai); color: var(--ink-nong); margin: 0; }
.mk-intro .skip { position: absolute; right: 26px; bottom: 20px; }
.mk-intro .pg { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); font: 12px var(--f-ui); color: var(--ink-dan); }
@keyframes mkIn { 0% { opacity: 0; filter: blur(6px); transform: scale(.985); } 100% { opacity: 1; filter: none; transform: none; } }
`;

export function introScene(flow) {
  let L, i = 0, onKey;
  const S = {
    live: !1,
    hud: !1,
    enter() {
      kit.css("intro", CSS);
      L = kit.layer("intro", 45);
      kit.show("intro", !0);
      i = 0;
      S.draw();
      onKey = (e) => {
        if (e.code === "Escape") S.done();
        else if (e.code === "Space" || e.code === "Enter") S.next();
      };
      addEventListener("keydown", onKey);
    },
    exit() {
      removeEventListener("keydown", onKey);
      kit.clear("intro");
      kit.show("intro", !1);
    },
    draw() {
      kit.clear("intro");
      const c = CARDS[i];
      const root = kit.el("div", "mk-intro");
      root.appendChild(kit.el("div", "card" + (c.big ? " big" : ""), `<h1>${c.t}</h1>${c.s ? `<p>${c.s}</p>` : ""}`));
      root.appendChild(kit.el("div", "pg", `${i + 1} / ${CARDS.length} · 点击继续`));
      const skip = kit.button("跳过", () => S.done(), { small: !0, id: "skip" });
      skip.classList.add("skip");
      root.appendChild(skip);
      root.addEventListener("click", () => S.next());
      root.addEventListener("mousedown", (e) => e.stopPropagation());
      L.appendChild(root);
    },
    next() {
      if (++i >= CARDS.length) return S.done();
      S.draw();
    },
    done() {
      if (flow.name !== "intro") return;
      flow.go("run", { region: "tutorial" });
    },
  };
  return S;
}
