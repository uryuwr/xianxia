// 体检_v1 草图组件（普通脚本，file:// 双击可开）。window.TJ：
//   TJ.scene({ bg, d, g, st, night })  一屏 1280×720 的 HTML（底图 + 其余 HUD + 气血组）
//   TJ.cell(opts, w, h, x, y)           从一屏里裁一个窗口（index 对比格）
//   TJ.mount(defaults)                  单方向页：读 hash（bg / st / g / night / d / shot），画一屏 + 可点的切换钮
// 方向 d：now 现状 · a 甲 朱墨两笔 · b 乙 印记 · c 丙 墨血转朱；小字底衬 g：now 现状 · wash 字随墨晕 · band 天头地脚
// 状态 st：full 满 · hit 受击（余迹）· low 残血 24%
(function () {
  const BG = { old: "img/bg_old.png", A: "img/bg_A.png", B: "img/bg_B.png", C: "img/bg_C.png" };
  const BGNAME = { old: "现状场景", A: "精细 A · toon", B: "精细 B · 水墨写意", C: "精细 C · 写实" };
  const DNAME = { now: "现状", a: "甲 · 朱墨两笔", b: "乙 · 印记", c: "丙 · 墨血转朱" };
  const GNAME = { now: "现状", wash: "一 · 字随墨晕", band: "二 · 天头地脚" };
  const ST = {
    full: { hp: 1, lag: 1, mp: 1, mom: 0.22, dk: [1, 1] },
    hit: { hp: 0.62, lag: 0.8, mp: 0.7, mom: 0.38, dk: [1, 0.45] },
    low: { hp: 0.24, lag: 0.31, mp: 0.4, mom: 0.6, dk: [0.3, 0] },
  };
  const HPM = 360, MPM = 130;
  const n = (v, m) => `${Math.ceil(v * m)} / ${m}`;
  const mix = (a, b, t) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(a.substr(i + 1, 2), 16) * (1 - t) + parseInt(b.substr(i + 1, 2), 16) * t).toString(16).padStart(2, "0")).join("");

  function dash(dk) {
    return `<div class="dash">${dk.map((k) => `<i class="${k < 1 ? "off" : ""}" style="--k:${k}"></i>`).join("")}</div>`;
  }
  function vitals(d, s) {
    if (d === "now")
      return `<div class="d-now">
  <div class="row hp"><span class="lbl">气血</span><div class="bar"><div class="bg"></div><div class="lag" style="transform:scaleX(${s.lag})"></div><div class="fill" data-m="气血条" data-k="bar" style="transform:scaleX(${s.hp})"></div></div><span class="val"><span data-m="气血数值">${n(s.hp, HPM)}</span></span></div>
  <div class="row mp"><span class="lbl">真气</span><div class="bar"><div class="bg"></div><div class="lag" style="transform:scaleX(${s.mp})"></div><div class="fill" data-m="真气条" data-k="bar" style="transform:scaleX(${s.mp})"></div></div><span class="val">${n(s.mp, MPM)}</span></div>
  <div class="mom"><span class="lbl">气势</span><div class="mb"><i data-m="气势条" data-k="bar" style="--v:${s.mom}"></i><b></b></div></div>
  ${dash(s.dk)}</div>`;
    const low = s.hp <= 0.3 ? " low" : "";
    const lbl = (t, cls) => (d === "b" ? `<span class="sl ${cls || ""}">${t}</span>` : `<span class="lbl">${t === "血" ? "气血" : t === "气" ? "真气" : "气势"}</span>`);
    let hpStyle = `--v:${s.hp};--lag:${s.lag}`;
    if (d === "c") {
      const t = s.hp >= 0.5 ? 0 : s.hp <= 0.3 ? 1 : (0.5 - s.hp) / 0.2;
      hpStyle += `;--hpc:${t >= 1 ? "linear-gradient(90deg,#9e2216,#b8291a 55%,#c22f1d)" : mix("#1a1c1e", "#b8291a", t)}`;
    }
    return `<div class="vt d-${d}${low}">
  <div class="row hp">${lbl("血", "hpseal")}<div class="ib hp" style="${hpStyle}"><b></b><i data-m="气血条" data-k="bar"></i></div><span class="val"><span data-m="气血数值">${n(s.hp, HPM)}</span></span></div>
  <div class="row mp">${lbl("气")}<div class="ib qi" style="--v:${s.mp}"><b></b><i data-m="真气条" data-k="bar"></i></div><span class="val">${n(s.mp, MPM)}</span></div>
  <div class="row momr">${lbl("势")}<div class="ib mom" style="--v:${s.mom}"><i data-m="气势条" data-k="bar"></i><u></u></div></div>
  ${dash(s.dk)}</div>`;
  }
  function slot(k, g, cls, ct, c) {
    return `<div class="hud-skill ${cls || ""}">${k ? `<span class="k">${k}</span>` : ""}<span class="g">${g}</span>${cls && cls.includes("mom") ? `<i class="mr" style="--mv:${0.38}"></i>` : ""}${c ? `<span class="c">${c}</span>` : ""}${ct ? `<div class="ct">${ct}</div>` : ""}</div>`;
  }
  function rest(g) {
    return `${g === "band" ? '<div class="band top"></div><div class="band bot"></div>' : ""}
  <div class="tod ink-wash"><div class="ticks"><span>晨</span><span class="on">午</span><span>暮</span><span class="night">夜</span></div>
    <div class="track"><div class="ink-bar thin" style="--v:.38"><i></i></div><i class="drop" style="left:38%"></i></div>
    <div class="sub"><span data-m="天时小字">午至还有 4:23 · </span><span class="tide" data-m="灵潮字">灵潮 ×1.0</span></div></div>
  <div class="gv ink-wash"><div class="lbl">估价</div><div><div class="n ink-num" data-m="估价大数">128</div><div class="s"><span data-m="储物袋小字">储物袋 6 / 16</span> · <span class="u">未鉴定 1</span></div></div></div>
  <div class="mw"><div class="hud-mirror"><div class="map"></div><div class="knob"></div></div><div class="cap"><span data-m="镜下方位">未明残阵 · </span><b data-m="镜下方位朱字">南 8 丈</b></div></div>
  <div class="qs"><div class="fo" data-m="机缘">机缘 12 / 100</div></div>
  <div class="sb ink-wash"><div class="base"></div>
    ${slot("Q", "斩", "metal")}
    ${slot("E", "锁", "locked", `练气三层<small data-m="技能解锁字">解锁</small>`)}
    ${slot("R", "锁", "locked", `练气七层<small>解锁</small>`)}
    ${slot("右键", "势", "mom none", "", "38")}
    ${slot("V", "锁", "locked", `练气七层<small>解锁</small>`)}
    <div class="gap"></div>
    ${slot("1", "丹", "sm water", "", "×2")}
    ${slot("2", "丹", "sm wood", "", "×1")}
    ${slot("G", "符", "sm earth", "", "×0")}
  </div>
  <div class="grl ink-wash"><div class="r"><span>凡人</span><small data-m="境界小字">6 / 10</small></div><div class="ink-bar xp thin" style="--v:.6"><i></i></div><div class="n" data-m="本局感悟">本局感悟 +6 · 已入修为</div></div>`;
  }
  function scene(o) {
    const s = ST[o.st || "hit"], d = o.d || "now", g = o.g || "now", bg = o.bg || "B";
    return `<div class="stage${o.night ? " night" : ""}" style="background-image:url(${BG[bg]})">
  ${s.hp <= 0.3 && d !== "now" ? '<div class="edge-zhu"></div>' : ""}
  <div class="g-${g}" style="position:absolute;inset:0">${rest(g)}</div>
  ${vitals(d, s)}
  ${o.label === false ? "" : `<div class="tag-bg">底图：${BGNAME[bg]}${o.night ? " · 夜（示意：压暗 45%）" : ""} · 气血组：${DNAME[d]} · 小字：${GNAME[g]} · ${o.st === "low" ? "残血" : o.st === "full" ? "满" : "受击"}</div>`}
</div>`;
  }
  function cell(o, w, h, x = 0, y = 0) {
    return `<div class="cell" style="width:${w}px;height:${h}px"><div style="position:absolute;left:${-x}px;top:${-y}px">${scene({ ...o, label: false })}</div></div>`;
  }
  function readHash() {
    const o = {};
    for (const kv of location.hash.slice(1).split("&")) if (kv) { const [k, v] = kv.split("="); o[k] = decodeURIComponent(v ?? "1"); }
    if (o.night) o.night = o.night !== "0";
    return o;
  }
  function mount(def) {
    const root = document.getElementById("root");
    const draw = () => {
      const o = { ...def, ...readHash() };
      root.innerHTML = scene(o) + (o.shot ? "" : ctl(o, def));
      root.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => {
        const cur = { ...readHash() }, [k, v] = b.dataset.set.split("=");
        cur[k] = v; delete cur.shot;
        try { location.hash = Object.entries(cur).map(([a, c]) => `${a}=${c === true ? 1 : c}`).join("&"); } catch (e) {}
      }));
    };
    addEventListener("hashchange", draw);
    draw();
    document.fonts.ready.then(() => setTimeout(() => (window.__ready = true), 150));
  }
  function ctl(o, def) {
    const btn = (k, v, t) => `<button data-set="${k}=${v}" class="${(k === "night" ? (o.night ? "1" : "0") : String(o[k] ?? "")) === String(v) ? "on" : ""}">${t}</button>`;
    const ds = def.lockD ? "" : Object.entries(DNAME).map(([k, t]) => btn("d", k, t)).join("");
    const gs = def.lockG ? "" : Object.entries(GNAME).map(([k, t]) => btn("g", k, t)).join("");
    return `<div style="position:absolute;left:1290px;top:0;width:220px" class="page"><div class="ctl" style="flex-direction:column">
      <b>底图</b>${Object.entries(BGNAME).map(([k, t]) => btn("bg", k, t)).join("")}${btn("night", 1, "夜（示意）")}${btn("night", 0, "白天")}
      <b>状态</b>${btn("st", "full", "满")}${btn("st", "hit", "受击（余迹）")}${btn("st", "low", "残血 24%")}
      ${ds ? "<b>气血组</b>" + ds : ""}${gs ? "<b>小字底衬</b>" + gs : ""}
      <a href="index.html">← 回总览</a></div></div>`;
  }
  window.TJ = { scene, cell, mount, BG, BGNAME, DNAME, GNAME, ST };
})();
