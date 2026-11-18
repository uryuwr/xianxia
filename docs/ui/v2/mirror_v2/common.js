// 天机镜 v2 示意图 · 公用渲染（只给 docs/ui/v2/mirror_v2/*.html 用，不是游戏代码）
// 三个方向共用同一套"应用"内容块（mj-*），各自决定外框与布局。
// 状态写在地址栏 hash 里，方便截图与 index.html 切换：#p=qi7|zj&app=home|realm|album|trail|msg|map&tab=list|total&open=1:5&mem=1:3&t=21:40
(function () {
  const D = window.MJD;
  const $ = (s, r = document) => r.querySelector(s);
  const PROG = { qi7: "1:7", zj: "2:1" };

  const S = { p: "qi7", app: "home", tab: "list", open: null, mem: null, mtab: "msg", t: null };
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    for (const k of Object.keys(S)) if (h.has(k)) S[k] = h.get(k);
  }
  function writeHash() {
    const h = new URLSearchParams();
    for (const [k, v] of Object.entries(S)) if (v != null && v !== "") h.set(k, v);
    try { history.replaceState(null, "", "#" + h.toString()); } catch (e) {}
  }
  const prog = () => PROG[S.p] || "1:7";
  const zhuji = () => prog() === "2:1";
  const litKeys = () => D.ORDER.slice(1, D.ORDER.indexOf(prog()) + 1);

  // ---- 时辰（真实钟点 → 时辰；示意图可用 &t=21:40 固定） ----
  const ZHI = "子丑寅卯辰巳午未申酉戌亥";
  function shichen() {
    let h, m;
    if (S.t) [h, m] = S.t.split(":").map(Number);
    else ((h = new Date().getHours()), (m = new Date().getMinutes()));
    const i = Math.floor(((h + 1) % 24) / 2);
    return { zhi: ZHI[i] + "时", sub: (h % 2 === 1 ? "初" : "正") + "一二三四"[Math.min(3, Math.floor(m / 15))] + "刻" };
  }

  // ---- 状态栏：时辰 · 镜钮（= 摄像头）· 信号 · 修为（= 电量） ----
  function statusBar() {
    const sc = shichen();
    const now = D.NOW[prog()];
    const pct = Math.round((now.xp / now.need) * 100);
    const sig = zhuji()
      ? `<span class="sig on" title="墨州 · 一格"><i class="on"></i><i></i><i></i><i></i></span><span class="carrier">墨州</span>`
      : `<span class="nosvc">无服务</span>`;
    return `<div class="mj-sb"><span class="tm">${sc.zhi}<small>${sc.sub}</small></span><span class="knob" aria-hidden="true"></span>
      <span class="r">${sig}<span class="bat" title="修为 ${now.xp} / ${now.need}"><b style="width:${pct}%"></b></span><span class="pct">${pct}%</span></span></div>`;
  }

  // ---- 应用 ----
  const APPS = [
    { id: "realm", g: "境", n: "境界录", c: "var(--nijin)" },
    { id: "album", g: "忆", n: "相册", c: "var(--shiqing)" },
    { id: "trail", g: "迹", n: "行迹", c: "var(--zhe)" },
    { id: "map", g: "舆", n: "舆图", c: "var(--dai)" },
  ];
  const DOCK = [
    { id: "msg", g: "讯", n: "消息", mtab: "msg" },
    { id: "msg", g: "拨", n: "拨号", mtab: "dial" },
  ];
  function appIcon(a, extra = "") {
    const on = S.app === a.id && (!a.mtab || S.mtab === a.mtab);
    const off = a.mtab && !zhuji();
    const badge = a.id === "realm" && S.p === "qi7" ? '<s class="dot" title="新记一条"></s>' : a.id === "msg" && zhuji() && a.mtab === "msg" ? '<s class="dot"></s>' : "";
    return `<button class="mj-app ${on ? "on" : ""} ${off ? "off" : ""} ${extra}" data-app="${a.id}" ${a.mtab ? `data-mtab="${a.mtab}"` : ""} style="--ac:${a.c || "var(--zhu)"}"><span class="ic"><b>${a.g}</b>${badge}</span><span class="nm">${off ? "无服务" : a.n}</span></button>`;
  }
  function home({ clock = !0 } = {}) {
    const sc = shichen();
    const now = D.NOW[prog()];
    const note = S.p === "qi7"
      ? `<div class="mj-note" data-app="realm"><span class="ink-seal gold" style="--s:20px">录</span><span>境界录 · 新记一条：<b>练气七层</b></span></div>`
      : `<div class="mj-note clue" data-app="msg" data-mtab="msg"><span class="ink-seal blue" style="--s:20px">讯</span><span>消息 · 发送中……　<b>黑风岭</b>有一个蓝点</span></div>`;
    return `<div class="mj-home">
      <div class="mj-wall">${D.WALL}</div>
      ${clock ? `<div class="mj-clock"><b>${sc.zhi}</b><span>${sc.sub} · 入画第 ${now.day} 日</span></div>` : ""}
      ${note}
      <div class="mj-grid">${APPS.map((a) => appIcon(a)).join("")}</div>
      <div class="mj-dock">${DOCK.map((a) => appIcon(a)).join("")}</div>
    </div>`;
  }
  function appHead(title, { tabs = "", back = !0 } = {}) {
    return `<div class="mj-ahead">${back ? `<button class="mj-back" data-app="home" title="返回（Esc）">‹</button>` : ""}<span class="t">${title}</span>${tabs}</div>`;
  }
  function tabs(list, cur, attr) {
    return `<span class="mj-tabs">${list.map(([v, n]) => `<button class="${cur === v ? "on" : ""}" data-${attr}="${v}">${n}</button>`).join('<i>·</i>')}</span>`;
  }

  // ---- 境界录 ----
  const seal = (txt, cls = "", s = 18) => `<span class="ink-seal ${cls}" style="--s:${s}px">${txt}</span>`;
  function chipsOf(e, max = 99) {
    const main = e.stats.filter((r) => ["hp", "mp", "atk", "spell", "def", "aspd", "sense", "dashMax", "crit"].includes(r.k)).slice(0, max);
    return main.map((r) => `<span class="ch">${r.n}<b>${D.fmtD(r, r.d)}</b></span>`).join("");
  }
  function gainsOf(e) {
    const u = e.unlocks.map((x) => `<span class="gn ${x.rg ? "rg" : ""}">${seal(x.rg ? "途" : x.ab ? "能" : "解", x.rg ? "blue" : x.ab ? "green" : "ink")}${x.t}${x.v ? " " + x.v : ""}</span>`);
    const g = e.grants.map((x) => `<span class="gn">${seal(x.kind === "xinfa" ? "悟" : "习", "gold")}${x.kind === "xinfa" ? "心法《" + x.name + "》" : "《" + x.name + "》"}</span>`);
    return [...u, ...g].join("");
  }
  function pending() {
    const i = D.ORDER.indexOf(prog());
    const nk = D.ORDER[i + 1];
    const now = D.NOW[prog()];
    if (!nk) return `<div class="mj-pend"><span class="t">下一境 · 筑基二层</span><span class="m">此后的成长尚未写入成长表 · 修为 ${now.xp} / ${now.need}</span></div>`;
    const u = (D.UNL[nk] || []).map((x) => x.t + (x.v ? " " + x.v : "")).join("、") || "属性";
    return `<div class="mj-pend"><span class="t">下一层 · ${D.name(nk)}</span><span class="m">修为 ${now.xp} / ${now.need} · 将得：${u} · 记忆一段</span></div>`;
  }
  // 条目抬头（列表里的一行）
  function entryHead(e, { chips = 6 } = {}) {
    return `<div class="mj-eh">
      <div class="r1"><span class="to">${e.toShort}</span><span class="fr">${e.fromName} →</span><span class="when">${e.run ? `第 ${e.run} 次出行归来` : "序章"} · 入画第 ${e.day} 日 · ${e.hour}</span></div>
      <div class="r2">${chipsOf(e, chips)}</div>
      ${e.unlocks.length || e.grants.length ? `<div class="r3">${gainsOf(e)}</div>` : ""}
    </div>`;
  }
  // 条目展开：属性前后、解锁、领悟、记忆、玄机子
  function entryBody(e, { mem = !0, xjz = !0, cols = !1 } = {}) {
    const rows = e.stats.map((r) => `<div class="mj-sr"><span class="k">${r.n}</span><span class="a">${D.fmt(r, r.a)}</span><span class="ar">→</span><span class="b">${D.fmt(r, r.b)}${r.u ? `<small>${r.u}</small>` : ""}</span><span class="d ${r.lower ? (r.d < 0 ? "up" : "dn") : r.d > 0 ? "up" : "dn"}">${D.fmtD(r, r.d)}</span></div>`).join("");
    const cost = [`修为 ${e.xp}`, e.src && "多出自 " + e.src, e.trial && `${e.trial.name} · 第 ${e.trial.tries} 次方破`].filter(Boolean).join(" · ");
    const left = `<div class="mj-blk"><div class="h">属性</div>${rows}<div class="cost">耗 ${cost}</div></div>`;
    const right = `${e.unlocks.length || e.grants.length ? `<div class="mj-blk"><div class="h">所得</div><div class="gains">${gainsOf(e)}</div></div>` : `<div class="mj-blk"><div class="h">所得</div><div class="none">这一层只长了修为——九层圆满，下一步便是心魔劫。</div></div>`}
      ${mem && e.mem ? `<div class="mj-blk"><div class="h">那一夜亮起的</div><button class="mj-memc ${e.mem.clue ? "clue" : ""}" data-mem="${e.memKey}">${D.doodle(e.memKey)}<span><b>${e.mem.title}</b><em>${e.mem.lines[0]}</em></span></button></div>` : ""}
      ${xjz ? `<div class="mj-xjz"><span class="who">玄机子</span>“${e.xjz}”</div>` : ""}`;
    return cols ? `<div class="mj-eb cols"><div>${left}</div><div>${right}</div></div>` : `<div class="mj-eb">${left}${right}</div>`;
  }
  function realmList({ inline = !0, chips = 6 } = {}) {
    const H = D.history(prog());
    return `<div class="mj-tl">${pending()}${H.map((e) => {
      const open = S.open === e.to;
      return `<div class="mj-e ${open ? "open" : ""} ${e.to === "2:1" ? "gold" : ""}" data-open="${e.to}"><i class="nd"></i>${entryHead(e, { chips })}${inline && open ? entryBody(e, { cols: inline === "cols" }) : ""}</div>`;
    }).join("")}<div class="mj-tl-end">入画第 1 日 · 溪边醒来</div></div>`;
  }
  function totals({ cols = !1, part = "all" } = {}) {
    const T = D.totals(prog());
    const H = D.history(prog());
    const now = D.NOW[prog()];
    const rows = T.rows.map((r) => {
      const grow = r.lower ? r.a / r.b : r.b / r.a;
      const share = r.lower ? r.b / r.a : Math.max(0.04, Math.min(1, r.a / r.b));
      return `<div class="mj-tr"><span class="k">${r.n}</span><span class="a">${D.fmt(r, r.a)}</span><span class="ar">→</span><span class="b">${D.fmt(r, r.b)}${r.u ? `<small>${r.u}</small>` : ""}</span>
        <span class="mtr" title="墨 = 练气一层时，泥金 = 此后所得"><i style="--s:${(share * 100).toFixed(1)}%"></i></span><span class="d up">${D.fmtD(r, r.d)}</span><span class="x">${r.a > 0 && isFinite(grow) && grow >= 1.1 ? "×" + grow.toFixed(1) : ""}</span></div>`;
    }).join("");
    const gains = T.unlocks.map((u) => `<span class="gn ${u.rg ? "rg" : ""}">${seal(u.rg ? "途" : u.ab ? "能" : "解", u.rg ? "blue" : u.ab ? "green" : "ink")}${u.t}${u.v ? " " + u.v : ""}</span>`).join("");
    const learned = T.learned.map((g) => `<span class="gn">${seal(g.kind === "xinfa" ? "悟" : "习", "gold")}${g.kind === "xinfa" ? "心法《" + g.name + "》" : "《" + g.name + "》"}</span>`).join("");
    const lit = litKeys().length;
    const hero = `<div class="mj-hero"><span class="fr">练气一层</span><span class="ar">→</span><span class="to">${D.name(prog())}</span>
      <span class="m">突破 ${H.length - 1} 次 · 出行 ${D.TRAIL[prog()].runs} 次 · 入画 ${now.day} 日</span></div>`;
    const A = `<div class="mj-blk"><div class="h">属性 · 自练气一层起</div>${rows}</div>`;
    const B = `<div class="mj-blk"><div class="h">栏位与身法</div><div class="gains">${gains}</div></div>
      <div class="mj-blk"><div class="h">所学</div><div class="gains">${learned}</div></div>
      <div class="mj-blk"><div class="h">记忆</div><div class="mj-memdots">${D.ORDER.slice(1).map((k) => `<button class="${litKeys().includes(k) ? "lit" : ""}" ${litKeys().includes(k) ? `data-mem="${k}"` : ""} title="${litKeys().includes(k) ? D.MEM[k].title : D.name(k) + "亮起"}"></button>`).join("")}<span>${lit} / 10 段</span></div></div>`;
    if (part === "stats") return `<div class="mj-total">${hero}${A}</div>`;
    if (part === "gains") return `<div class="mj-total">${B}</div>`;
    return `<div class="mj-total">${hero}${cols ? `<div class="cols"><div>${A}</div><div>${B}</div></div>` : A + B}</div>`;
  }

  // ---- 相册 ----
  function album() {
    const lit = litKeys();
    return `<div class="mj-album"><div class="mj-alb-h">现代 · ${lit.length} / 10</div><div class="grid">${D.ORDER.slice(1).map((k) => {
      const on = lit.includes(k);
      return `<button class="ph ${on ? "lit" : "dark"} ${S.mem === k ? "on" : ""} ${D.MEM[k].clue ? "clue" : ""}" ${on ? `data-mem="${k}"` : ""}>${D.doodle(k)}<span class="cap">${on ? D.MEM[k].title : D.name(k) + "亮起"}</span></button>`;
    }).join("")}</div></div>`;
  }
  function memView(k) {
    const m = D.MEM[k];
    if (!m) return "";
    const e = D.history(prog()).find((x) => x.to === k);
    return `<div class="mj-mem ${m.clue ? "clue" : ""}"><div class="pic">${D.doodle(k)}</div><div class="t">${m.title}</div>
      ${m.lines.map((l) => `<p>${l}</p>`).join("")}<div class="m">亮于 ${D.name(k)} · ${e && e.run ? "第 " + e.run + " 次出行归来" : "序章"} · ${e ? e.hour : ""}</div></div>`;
  }

  // ---- 行迹 ----
  function trail() {
    const T = D.TRAIL[prog()];
    const R = D.RARITY[T.bestItem.rarity];
    return `<div class="mj-trail">
      <div class="big"><span><b>${T.runs}</b>出行</span><span><b>${T.extracted}</b>撤离</span><span><b class="zhu">${T.deaths}</b>身陨</span><span><b>${T.kills}</b>斩妖</span></div>
      <div class="rows">
        <div class="mj-row"><span class="k">带回最多的一次</span><span class="v"><b class="gold">${T.bestHaul.value.toLocaleString()}</b> 估价 · ${T.bestHaul.items} 件<small>第 ${T.bestHaul.run} 次 · ${T.bestHaul.region}</small></span></div>
        <div class="mj-row"><span class="k">最好的一件</span><span class="v"><b style="color:${R.color}">${T.bestItem.name}</b> ${seal(R.name[0], "", 18).replace('style="', `style="--seal-color:${R.color};`)}<small>第 ${T.bestItem.run} 次 · ${T.bestItem.region}</small></span></div>
        <div class="mj-row"><span class="k">斩首领</span><span class="v">${T.bosses.map((b) => `${b.n} ×${b.c}`).join("　")}</span></div>
        <div class="mj-row"><span class="k">采药 · 开箱</span><span class="v">${T.herbs} 株 · ${T.chests} 只</span></div>
        <div class="mj-row"><span class="k">遗落的储物袋</span><span class="v">取回 ${T.lostBagBack} 次</span></div>
        <div class="mj-row"><span class="k">头一回身陨</span><span class="v">第 ${T.firstDeath.run} 次 · ${T.firstDeath.by}<small>${T.firstDeath.region}</small></span></div>
      </div></div>`;
  }

  // ---- 消息 / 拨号 ----
  function msg() {
    const z = zhuji();
    if (S.mtab === "dial") {
      return `<div class="mj-msg dial">
        <div class="calls"><div class="mj-row"><span class="k">妈</span><span class="v miss">未接 ×3<small>那晚 · 凌晨</small></span></div><div class="mj-row"><span class="k">爸</span><span class="v">已拨<small>上周日</small></span></div><div class="mj-row"><span class="k">组长</span><span class="v miss">未接<small>那晚</small></span></div></div>
        <div class="dialbtn ${z ? "" : "off"}">${z ? "拨不通——只能留言" : "无服务"}</div>
        <div class="hint">${z ? "筑基之后，镜里能发出去的只有文字。" : "镜中无讯。"}</div></div>`;
    }
    const old = `<div class="day">那晚 · 凌晨两点十七分</div><div class="bb in">墨啊，周末回家吃饭不？</div><div class="bb in">早点睡，别老熬。</div>`;
    if (!z)
      return `<div class="mj-msg"><div class="who">妈</div><div class="th">${old}</div><div class="inp off"><span>无服务</span></div></div>`;
    return `<div class="mj-msg"><div class="who">妈</div><div class="th">${old}<div class="day">入画第 27 日 · 卯时</div>
      <div class="bb out">妈，我很好。<span class="st">发送中<i>.</i><i>.</i><i>.</i></span></div>
      <div class="clue"><div class="map"><span class="n">黑风岭</span><i class="me"></i><i class="him"></i></div><div class="tx">裂纹连成一幅地图：留白之外，北方黑风岭，一个和他一样的蓝点。</div><button class="ink-btn sm" data-app="map">在舆图上标出</button></div>
      <div class="unk"><span class="nm">未知 · 黑风岭</span><span class="typing"><i></i><i></i><i></i></span></div></div>
      <div class="inp"><span>（再写一句……）</span></div></div>`;
  }
  function mapApp() {
    const z = zhuji();
    return `<div class="mj-map"><div class="lst">
      <div class="mj-row"><span class="k">溪边</span><span class="v">已着墨</span></div>
      <div class="mj-row"><span class="k">青岚山外</span><span class="v">已着墨 · 古阵 3</span></div>
      <div class="mj-row"><span class="k">竹海 · 溪谷</span><span class="v">着墨六成 · 古阵 2</span></div>
      <div class="mj-row ${z ? "clue" : "dim"}"><span class="k">${z ? "黑风岭" : "北方 · 留白"}</span><span class="v">${z ? "一个蓝点 · 下一章" : "未至"}</span></div></div>
      <div class="hint">出行时按 M，镜面直接展开为舆图手卷。</div></div>`;
  }

  // ---- 交互 ----
  let renderFn = null;
  function set(patch) {
    Object.assign(S, patch);
    writeHash();
    renderFn && renderFn(S);
    window.inkui && inkui.decorate();
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-app],[data-open],[data-tab],[data-mem],[data-p],[data-mtab],[data-close]");
    if (!t) return;
    ev.preventDefault();
    if (t.dataset.p) return set({ p: t.dataset.p, open: null, mem: null });
    if (t.dataset.close != null) return set({ app: "home", open: null, mem: null });
    if (t.dataset.mem) return set({ mem: S.mem === t.dataset.mem && S.app === "album" ? S.mem : t.dataset.mem, app: S.app === "realm" && window.MJ_MEM_IN_REALM ? "realm" : "album" });
    if (t.dataset.open) return set({ open: S.open === t.dataset.open && !window.MJ_KEEP_OPEN ? null : t.dataset.open });
    if (t.dataset.tab) return set({ tab: t.dataset.tab });
    if (t.dataset.app) {
      if (t.dataset.mtab && !zhuji() && t.dataset.app === "msg" && !t.classList.contains("mj-note")) return set({ app: "msg", mtab: t.dataset.mtab });
      return set({ app: t.dataset.app, mtab: t.dataset.mtab || S.mtab, mem: t.dataset.app === "album" ? S.mem : null });
    }
    if (t.dataset.mtab) return set({ mtab: t.dataset.mtab });
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") set(S.mem && S.app === "album" ? { mem: null } : { app: "home", open: null, mem: null });
  });
  addEventListener("hashchange", () => (readHash(), renderFn && renderFn(S), window.inkui && inkui.decorate()));

  // 示意图角标：切换进度
  function progSwitch(label) {
    return `<div class="mj-proto">${label} · 示意进度 <button data-p="qi7" class="${S.p === "qi7" ? "on" : ""}">练气七层</button><button data-p="zj" class="${S.p === "zj" ? "on" : ""}">筑基一层</button></div>`;
  }

  function start(fn) {
    readHash();
    renderFn = fn;
    fn(S);
    window.inkui && inkui.decorate();
    document.fonts.ready.then(() => setTimeout(() => (window.__ready = !0), 200));
  }
  window.MV = { S, set, start, prog, zhuji, litKeys, statusBar, home, appHead, tabs, realmList, entryHead, entryBody, totals, album, memView, trail, msg, mapApp, progSwitch, APPS, shichen, $, D };
})();
