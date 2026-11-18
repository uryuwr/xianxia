// 青牙 v2 首领界面草图：三个方向共用的状态数据与渲染（普通 <script>，file:// 下不能用 ES 模块）
// 状态写在 hash：#s=p1|howl|p2|exec|banner|intro|final
(function () {
  const ELHEX = { wood: "#3f9a6e", earth: "#9a6a32", metal: "#9a7d34" };
  const EL = { wood: ["木", "var(--wood)"], earth: ["土", "var(--earth)"], metal: ["金", "var(--metal)"] };
  // 青牙在底图里的屏幕位置（bg_valley.png，1280×720）
  const Q = { top: [646, 118], head: [775, 292], back: [654, 168], feet: [648, 248] };
  const S = {
    p1: { phase: 1, hp: 1, lag: 1, sh: { el: "wood", k: 0.62 }, poise: 0.34, note: "一阶段 · 木盾 62% · 狼威 34（护盾在时狼威获取 ×0.6）" },
    howl: { phase: 1, hp: 0.78, lag: 0.84, sh: null, poise: 0.55, chan: { g: "嚎", k: 0.62, t: "召狼长嚎 · 可打断" }, note: "一阶段 · 木盾已破 · 召狼长嚎读条 62%（剑气斩三道 / 满势斩可断）" },
    p2: { phase: 2, hp: 0.38, lag: 0.43, sh: { el: "earth", k: 0.25 }, poise: 0.78, fall: !0, night: !0, weak: !0, note: "二阶段 · 土盾 25% · 狼威 78 回落中 · 背甲裂（月光下 ×1.6）" },
    exec: { phase: 2, hp: 0.31, lag: 0.31, sh: null, poise: 1, broken: !0, night: !0, weak: !0, prompt: { k: 0.55, why: "威折 · 背甲可斩" }, note: "二阶段 · 威折倒地 4 秒 · F 威折处决" },
    banner: { phase: 2, hp: 0.5, lag: 0.5, sh: { el: "earth", k: 1 }, poise: 0, night: 0.5, banner: !0, note: "转阶段横幅（墨云遮月过程中）" },
    intro: { phase: 1, hp: 1, lag: 1, sh: { el: "wood", k: 1 }, poise: 0, intro: !0, note: "入场题签：第 N 次 · 上回削至 X%" },
    final: { final: !0, note: "终结处决：留白 · 一笔 · 斩 · 朱印" },
  };
  const h = (tag, cls, html, style) => {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    if (style) d.setAttribute("style", style);
    return d;
  };
  const pc = (p) => (p >= 1 ? "var(--zhu)" : p > 0.7 ? "#7a2a1e" : p > 0.4 ? "#3a3d42" : "#7d8086");

  // ---- 共用部件 ----
  function hpBar(st, w, hgt) {
    const b = h("div", "bar", "<i class='bg'></i><i class='lag'></i><i class='fill'></i>", `width:${w}px;height:${hgt}px;--v:${st.hp};--lag:${st.lag}`);
    return b;
  }
  function shBar(st, w, hgt) {
    if (!st.sh) return null;
    return h("div", "bar shbar", "<i class='bg'></i><i class='fill'></i>", `width:${w}px;height:${hgt}px;--v:${st.sh.k};--shc:${EL[st.sh.el][1]}`);
  }
  function poiseBar(st, w, hgt) {
    return h("div", "poise" + (st.fall ? " fall" : "") + (st.broken ? " broken" : ""), "<i></i>", `width:${w}px;height:${hgt}px;--p:${st.poise};--pc:${pc(st.poise)}`);
  }
  function eseal(st, size = 24) {
    if (!st.sh) return null;
    return h("span", "eseal", EL[st.sh.el][0], `width:${size}px;height:${size}px;--shc:${EL[st.sh.el][1]}`);
  }
  function seal(text, size, fs) {
    return h("span", "seal", text, `width:${size}px;height:${size}px;font-size:${fs}px`);
  }
  function chan(st, x, y) {
    if (!st.chan) return null;
    return h("div", "chan", `<b>${st.chan.g}</b><small>${st.chan.t}</small>`, `left:${x}px;top:${y}px;--k:${st.chan.k}`);
  }

  // ---- 世界层 ----
  function world(root, st) {
    root.appendChild(h("div", "world"));
    if (st.night) {
      root.appendChild(h("div", st.night === 0.5 ? "night2" : "night"));
      if (st.night === !0) {
        root.appendChild(h("div", "moon", null, "left:300px;top:380px;width:250px;height:150px"));
        root.appendChild(h("div", "moon", null, "left:800px;top:180px;width:250px;height:150px"));
      }
    }
    if (st.weak) {
      const [x, y] = Q.back;
      root.insertAdjacentHTML("beforeend", `<svg class="crack" viewBox="0 0 1280 720"><path d="M${x - 2} ${y - 26} l4 9 l-5 8 l6 10 l-3 9 l4 12" stroke-width="3.2"/><path d="M${x + 1} ${y - 9} l7 -3 M${x - 1} ${y + 7} l-7 2" stroke-width="1.8"/></svg>`);
      root.appendChild(h("div", "lbl", "背甲裂 · 背击 ×1.35 / 月下 ×1.6", `position:absolute;left:${x + 18}px;top:${y - 28}px;color:#1f5a48`));
    }
  }

  // ---- 方向 A：卷首横轴（屏幕顶部正中） ----
  function dirA(root, st) {
    root.appendChild(h("div", "tidemask"));
    const W = 470, x0 = 470, y0 = 6;
    const box = h("div", "abs", null, `left:${x0}px;top:${y0}px;width:${W + 34}px`);
    const head = h("div", null, null, "display:flex;align-items:baseline;gap:10px;height:34px");
    head.appendChild(h("span", "glyph", "青牙", "font:32px var(--f-splash);letter-spacing:.1em"));
    head.appendChild(h("span", "lbl", "狼谷之主"));
    head.appendChild(h("span", "lbl", "练气?", "color:#c9786a"));
    head.appendChild(h("span", null, null, "flex:1"));
    head.appendChild(h("span", "lbl", st.phase === 2 ? "二 · 啸月" : "一 · 守谷", "font:16px var(--f-display);color:" + (st.phase === 2 ? "var(--zhu)" : "var(--ink-nong)")));
    box.appendChild(head);
    const row = h("div", null, null, "position:relative;display:flex;align-items:center;gap:8px");
    const es = eseal(st);
    row.appendChild(es || h("span", null, null, "width:24px"));
    const col = h("div", null, null, `position:relative;width:${W}px`);
    const sb = shBar(st, W, 8);
    if (sb) (sb.style.marginBottom = "-2px"), col.appendChild(sb);
    else col.appendChild(h("div", null, null, "height:6px"));
    col.appendChild(hpBar(st, W, 18));
    col.appendChild(h("i", "tick", null, `left:${W / 2 - 1}px;top:2px;height:26px`));
    col.appendChild(h("span", "glyph", "二", `position:absolute;left:${W / 2 + 4}px;top:-18px;font-size:15px;color:var(--zhu)`));
    const pr = h("div", null, null, "display:flex;align-items:center;gap:6px;margin-top:4px");
    pr.appendChild(h("span", "glyph", "威", "font-size:15px;color:var(--ink-nong)"));
    pr.appendChild(poiseBar(st, W - 22, 9));
    col.appendChild(pr);
    if (st.broken) col.appendChild(Object.assign(seal("折", 30, 20), { style: `position:absolute;left:${W / 2 - 4}px;top:22px;width:30px;height:30px;font-size:20px` }));
    row.appendChild(col);
    box.appendChild(row);
    root.appendChild(box);
    const c = chan(st, x0 + W + 40, y0 + 34);
    if (c) root.appendChild(c);
  }

  // ---- 方向 B：题跋落款（底部，技能栏之上） ----
  function dirB(root, st) {
    const W = 470, x0 = 420, y0 = 536;
    root.appendChild(h("div", null, null, `position:absolute;left:${x0 - 90}px;top:${y0 - 20}px;width:${W + 220}px;height:96px;background:radial-gradient(ellipse at 50% 55%, rgba(236,230,214,.9) 45%, rgba(236,230,214,0) 72%)`));
    const name = h("div", "abs", null, `left:${x0 - 62}px;top:${y0 - 8}px;display:flex;gap:4px;align-items:flex-start`);
    name.appendChild(h("div", "glyph", "青牙", "writing-mode:vertical-rl;font:30px var(--f-splash);letter-spacing:.05em;line-height:1"));
    name.appendChild(Object.assign(seal("狼谷<br>之主", 30, 11), {}));
    root.appendChild(name);
    const col = h("div", "abs", null, `left:${x0}px;top:${y0}px;width:${W}px`);
    const top = h("div", null, null, "display:flex;align-items:baseline;gap:8px;height:20px;padding-left:14px");
    top.appendChild(h("span", "lbl", "练气?", "color:#c9786a"));
    top.appendChild(h("span", "lbl", st.phase === 2 ? "二 · 啸月" : "一 · 守谷"));
    top.appendChild(h("span", null, null, "flex:1"));
    const es = eseal(st, 20);
    if (es) top.appendChild(es);
    col.appendChild(top);
    const sb = shBar(st, W, 7);
    if (sb) (sb.style.marginTop = "2px"), col.appendChild(sb);
    else col.appendChild(h("div", null, null, "height:9px"));
    const hb = hpBar(st, W, 16);
    col.appendChild(hb);
    col.appendChild(h("i", "tick", null, `left:${W / 2 - 1}px;top:24px;height:22px`));
    const pr = h("div", null, null, "display:flex;align-items:center;gap:6px;margin-top:3px");
    pr.appendChild(h("span", "glyph", "威", "font-size:14px"));
    pr.appendChild(poiseBar(st, W - 20, 8));
    col.appendChild(pr);
    if (st.broken) col.appendChild(Object.assign(seal("折", 26, 18), { style: `position:absolute;left:${W / 2 - 4}px;top:40px;width:26px;height:26px;font-size:18px` }));
    root.appendChild(col);
    const c = chan(st, x0 + W + 18, y0 + 14);
    if (c) root.appendChild(c);
  }

  // ---- 方向 C：空间型（气血 = 头顶一弯月牙笔；狼威 = 脚下裂纹圆相） ----
  function dirC(root, st) {
    const [hx, hy] = Q.top, [fx, fy] = Q.feet;
    const cx = hx, cy = hy + 70, R = 84, a0 = 200, a1 = 340;
    const P = (a, r = R) => [cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r];
    const arc = (k, r) => { const a = a0 + (a1 - a0) * k, [x1, y1] = P(a0, r), [x2, y2] = P(a, r); return `M${x1} ${y1} A${r} ${r} 0 ${a - a0 > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
    let svg = `<svg class="abs" style="left:0;top:0" width="1280" height="720" viewBox="0 0 1280 720">`;
    svg += `<path d="${arc(1, R)}" stroke="rgba(21,24,27,.18)" stroke-width="11" fill="none" stroke-linecap="round"/>`;
    svg += `<path d="${arc(st.lag, R)}" stroke="rgba(184,41,26,.38)" stroke-width="11" fill="none" stroke-linecap="round"/>`;
    svg += `<path d="${arc(st.hp, R)}" stroke="#15181b" stroke-width="11" fill="none" stroke-linecap="round"/>`;
    if (st.sh) svg += `<path d="${arc(st.sh.k, R + 10)}" stroke="${ELHEX[st.sh.el]}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    { const [tx, ty] = P(270, R - 9), [tx2, ty2] = P(270, R + 9); svg += `<path d="M${tx} ${ty} L${tx2} ${ty2}" stroke="#b8291a" stroke-width="3"/>`; }
    // 脚下狼威：一圈圆相，裂纹条数随狼威增加
    const rx = 96, ry = 58, n = Math.round(st.poise * 10);
    svg += `<ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(21,24,27,.25)" stroke-width="4"/>`;
    svg += `<ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${ry}" pathLength="100" fill="none" stroke="${st.broken ? "#b8291a" : pc(st.poise)}" stroke-width="5" stroke-dasharray="${st.poise * 100} 100" stroke-dashoffset="25" ${st.fall ? 'opacity=".55"' : ""}/>`;
    for (let i = 0; i < n; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3, x = fx + Math.cos(a) * rx, y = fy + Math.sin(a) * ry;
      svg += `<path d="M${x} ${y} l${Math.cos(a) * 14} ${Math.sin(a) * 9} l${Math.cos(a + 0.6) * 8} ${Math.sin(a + 0.6) * 6}" stroke="${st.broken ? "#b8291a" : "#15181b"}" stroke-width="2" fill="none"/>`;
    }
    svg += "</svg>";
    root.insertAdjacentHTML("beforeend", svg);
    const [nx, ny] = P(270, R + 12);
    const nm = h("div", "abs", null, `left:${nx}px;top:${ny - 10}px;transform:translate(-50%,-100%);display:flex;gap:6px;align-items:baseline;white-space:nowrap`);
    nm.appendChild(h("span", "glyph", "青牙", "font:22px var(--f-splash)"));
    nm.appendChild(h("span", "lbl", "练气? · " + (st.phase === 2 ? "啸月" : "守谷"), "color:var(--zhu)"));
    const es = eseal(st, 20);
    if (es) nm.appendChild(es);
    root.appendChild(nm);
    if (st.broken) root.appendChild(Object.assign(seal("折", 34, 22), { style: `position:absolute;left:${fx - 17}px;top:${fy + ry - 17}px;width:34px;height:34px;font-size:22px` }));
    const c = chan(st, fx - 150, fy + ry + 8);
    if (c) root.appendChild(c);
    // 屏幕边缘的兜底：右缘一道细竖笔（气血），防止首领出画面时看不到
    const edge = h("div", "abs", null, "right:8px;top:250px;width:8px;height:240px;background:rgba(21,24,27,.15);border-radius:4px;overflow:hidden");
    edge.appendChild(h("i", null, null, `position:absolute;left:0;right:0;bottom:0;height:${st.hp * 100}%;background:#15181b`));
    root.appendChild(edge);
  }

  // ---- 共用叠加：处决提示 / 横幅 / 题签 / 终结 ----
  function overlays(root, st, dir) {
    if (st.prompt) {
      const [x, y] = Q.head;
      const p = h("div", "prompt", `<div class="ring" style="--k:${st.prompt.k}"><span class="key">F</span></div><div class="verb">斩</div><div class="why">${st.prompt.why}</div>`, (dir === "c" ? `left:${Q.feet[0] + 150}px;top:${Q.feet[1] + 40}px` : `left:${x}px;top:${y}px`));
      root.appendChild(p);
    }
    if (st.banner) root.appendChild(h("div", "banner", `<div class="big">二</div><div class="v">啸月</div><div class="s">墨云遮月 · 骨甲崩裂</div>`));
    if (st.intro) {
      root.appendChild(h("div", "intro", `<div class="n">青牙</div><div class="t">狼谷之主 · <b>练气?</b></div><div class="h">第 3 次 · 上回削至 41% · 曾入二阶段 <span class="poise bestbar" style="--p:.59;--pc:#3a3d42"><i></i></span></div>`));
    }
  }
  function final(root) {
    root.appendChild(h("div", "world"));
    const f = h("div", "final abs", null, "inset:0");
    f.appendChild(h("div", "paper"));
    f.appendChild(h("div", "figs"));
    f.appendChild(h("div", "stroke"));
    f.appendChild(h("div", "zhan", "斩"));
    const y = seal("青牙<br>伏诛", 132, 34);
    y.classList.add("yin");
    f.appendChild(y);
    f.appendChild(h("div", "cap", "终结处决 1.6 秒处的定格：画面褪成留白，只剩青牙与林墨的墨线；一笔横斩之后落「斩」，朱印盖下，随后青牙沿笔痕化墨"));
    root.appendChild(f);
  }

  window.BossUI = {
    S,
    mount(dir) {
      const root = document.getElementById("stage");
      const draw = () => {
        const m = /s=(\w+)/.exec(location.hash || "");
        const st = S[(m && m[1]) || "p2"] || S.p2;
        root.innerHTML = "";
        if (st.final) final(root);
        else {
          world(root, st);
          if (!st.intro) (dir === "a" ? dirA : dir === "b" ? dirB : dirC)(root, st);
          else dirA(root, st);
          overlays(root, st, dir);
        }
        root.appendChild(h("div", "note", `方向 ${dir.toUpperCase()} · ${st.note} · 底图为游戏内狼谷实景（凡人测试档）`));
      };
      addEventListener("hashchange", draw);
      draw();
      document.fonts.ready.then(() => (window.__ready = !0));
    },
  };
})();
