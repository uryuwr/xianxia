// 静室草图的"组件"——三个方向共用同一套：属性卷（StatSheet）、随身功法栏 + 功法匣（沿用 LoadoutUI 的行为）、行囊（PackUI，丹药按品质分格）、随身法器（GearSlots）。
// 落地时对应：src/ui/stat_sheet.js（新）、src/ui/loadout.js（已有）、src/ui/pack.js（新，从 prep.js 抽出）、src/ui/gear_slots.js（新，从 prep.js / 仓库详情抽出）。
// 只给 docs/ui/v2/静室/*.html 用，不是游戏代码。依赖 LD / LO（../loadout_v2/data.js）与 CF（./common.js）。
(function () {
  const { EL, RAR } = LD;
  const els = (el) => `<span class="els" style="--c:${EL[el].c}">${EL[el].n}</span>`;
  const ut = (k, i) => LO.unlockText(k, i).replace(/ /g, "");

  // ================= 属性卷 =================
  // o: { bar: 宽度 | 0, rows: 只显示这些键, legend, compact }
  function statsHTML(o = {}) {
    const sel = W.statSel;
    let h = "";
    for (const g of CF.GROUPS) {
      const rows = g.rows.filter((r) => (!o.rows || o.rows.includes(r.k)) && CF.shown(r.k));
      if (!rows.length) continue;
      if (!o.noGroup) h += `<div class="cf-gh">${g.g}</div>`;
      for (const r of rows) {
        const s = CF.stat(r.k), v = CF.roundOf(r.k, s.final);
        const tmp = s.list.some((p) => p.temp && !p.off);
        h += `<div class="cf-st ${sel === r.k ? "on" : ""}" data-stat="${r.k}" data-pop><span class="n">${r.n}</span><span class="v ${tmp ? "tmp" : ""}">${CF.fmt(r.k, v)}${r.u ? `<small>${r.u}</small>` : ""}</span>${o.bar !== 0 ? CF.barHTML(r.k, o.bar || 64) : ""}<span class="ss">${CF.srcSeals(r.k)}</span></div>`;
      }
    }
    return `<div class="cf-stats">${h}</div>`;
  }
  const legendHTML = () => `<div class="cf-legend">${Object.entries(CF.GRP).map(([g, x]) => `<span><i class="cf-src g-${g}">${g}</i>${x.n}${g === "局" ? "（炼化 · 丹药）" : ""}</span>`).join("")}</div>`;
  const modeHTML = () => `<span class="cf-mode"><a data-mode="cave" class="${CF.ST.mode === "cave" ? "on" : ""}">洞府中</a><a data-mode="run" class="${CF.ST.mode === "run" ? "on" : ""}">按出行计</a></span>`;
  const xpHTML = (w = 200) => `<span class="cf-xp" style="width:${w}px;--p:${Math.round((CF.REALM.xp / CF.REALM.need) * 100)}%"></span>`;

  // ================= 随身法器 =================
  function gearRowHTML(slot, o = {}) {
    const g = CF.eq(slot);
    const t = g ? `<b style="color:${CF.RQ[g.q].t}">${g.name}</b><span>${CF.SLOTN[slot]} · ${CF.RQ[g.q].n}${g.bound ? " · 认主" : ""}${g.sp ? ` · <span class="sp">「${g.sp.text}」</span>` : ""}</span>` : `<b class="ink-dim">（空）</b><span>${CF.SLOTN[slot]}</span>`;
    const tag = g ? CF.tagHTML(g.id, g.q, { size: o.size || 52, e: "sword robe jade".split(" ").indexOf(slot) }) : `<span class="sk is-empty" style="--s:${o.size || 52}px"><b>${CF.SLOTN[slot][1]}</b></span>`;
    return `<div class="cf-gear ${W.gearSel === slot ? "on" : ""} ${o.cls || ""}" data-gear="${slot}" data-pop>${o.right ? `<div class="t" style="text-align:right">${t}</div>${tag}` : `${tag}<div class="t">${t}</div>`}</div>`;
  }

  // ================= 随身功法栏（同 LoadoutUI.slotsEl） =================
  function slotHTML(kind, i, key, size = 54) {
    const ok = LO.unlocked(kind, i);
    const id = ok ? LO.get(kind, i) : null;
    const d = id && LO.defOf(kind, id);
    const g = kind === "xinfa" && id && LO.gearOf(id);
    const name = d ? (kind === "xinfa" ? `《${d.name}》` : d.name) : "";
    const cap = !ok ? ut(kind, i).replace("层解锁", "层<br>解锁") : d ? name : `<span class="dim">空</span>`;
    return `<div class="slot ${ok ? "" : "is-locked"}" data-slot-kind="${kind}" data-slot-i="${i}" data-id="${id || ""}">
      <span class="key">${key}</span>${LO.tokenHTML(kind, id, { size, glyph: ok ? "" : "锁", cls: (g ? "is-gray " : "") + ["e1", "e2", "e3"][i % 3] })}
      ${g ? `<span class="dup ink-seal" style="--s:16px;--seal-rot:6deg" title="同名不叠加">叠</span>` : ""}
      <span class="cap ${ok ? "" : "lock"}">${cap}</span></div>`;
  }
  function barHTML(o = {}) {
    const s = o.size || 54;
    return `<div class="grp">${[0, 1, 2].map((i) => slotHTML("spell", i, "QER"[i], s)).join("")}</div>` +
      `<div class="grp">${slotHTML("formation", 0, "T", s)}${slotHTML("artifact", 0, "V", s)}</div>` +
      `<div class="grp">${slotHTML("xinfa", 0, "心法", s)}${slotHTML("xinfa", 1, "心法", s)}</div>`;
  }
  function bindBar(root) { root.querySelectorAll(".slot").forEach((el) => el.dataset.id && LO.attachTip(el, el.dataset.slotKind, el.dataset.id)); }

  // ================= 功法匣（同 LoadoutUI.boxEl；未领悟的补"来源一行"，细节由战斗设计的来源指引面板给） =================
  const TABS = [["spell", "法术"], ["xinfa", "心法"], ["artifact", "法宝"], ["formation", "阵盘"]];
  function atLabel(kind, e) {
    if (e.at < 0 || !LO.unlocked(kind, e.at)) return "";
    if (kind === "spell") return `<span class="at on">${"QER"[e.at]} 栏</span>`;
    if (kind === "xinfa") return `<span class="at on">心法${"一二"[e.at]}</span>`;
    if (kind === "formation") return `<span class="at on">T</span>`;
    return `<span class="at on">V</span>`;
  }
  function srcLine(d) {
    const pg = d.page ? `<span class="cf-page">${Array.from({ length: d.page[1] }, (_, i) => `<i class="${i < d.page[0] ? "on" : ""}"></i>`).join("")}</span>` : "";
    return `<span class="cf-src-line">${pg}未领悟 · ${d.src.replace(/^残页 \d\/\d · /, "")} <a data-srcmore="${d.name}">何处得 ›</a></span>`;
  }
  function line(kind, e) {
    const d = e.def;
    if (kind === "spell") return e.have ? `${els(d.el)}${EL[d.el].n} · ${d.role} · 冷却 ${d.cd} 秒 · 真气 ${d.cost}` : srcLine(d);
    if (kind === "formation") return e.have ? `${d.el ? els(d.el) + EL[d.el].n + " · " : "无五行 · "}冷却 ${d.cd} 秒 · ${d.dur} 秒` : srcLine(d);
    if (kind === "artifact") return `<span style="color:${RAR[d.rarity].t}">${RAR[d.rarity].n}</span> · 祭炼 ${d.level + (d.bonus || 0)} 重${d.native ? " · 本命" : ""}${e.have ? "" : " · 未得"}`;
    if (e.gear) return `${e.gear.slot}《${e.gear.name}》词条已提供 · 同名不叠加`;
    return e.have ? d.desc : srcLine(d);
  }
  function boxHTML(tab, o = {}) {
    const list = LO.pool(tab);
    const cnt = (k) => LO.pool(k).filter((e) => e.have).length;
    let rows = list, extra = "";
    if (tab === "xinfa") {
      rows = list.filter((e) => e.have || e.gear);
      const no = list.filter((e) => !e.have && !e.gear && !e.def.retired);
      extra = `<div class="more">未得 ${no.length} 本：${no.map((e) => "《" + e.def.name + "》").join("")} <a class="cf-src-line" data-srcmore="心法"><span style="color:#816a31;border-bottom:1px dotted">何处得 ›</span></a></div>`;
    }
    const dense = o.dense || rows.length > 5;
    const tabs = `<div class="ink-tabs">${TABS.map(([k, n]) => `<span class="ink-tab ${tab === k ? "on" : ""}" data-tab="${k}">${n}<small>${cnt(k)}</small></span>`).join("")}</div>`;
    const gl = tab === "xinfa" ? `<div class="gearl">身上：${LD.GEAR.map((g) => (g.affix ? `${g.name}<b>「${g.affix.text}」</b>` : g.name)).join(" · ")}</div>` : "";
    const body = rows.map((e) => {
      const cls = [!e.have && !e.gear ? "ghost" : "", e.gear ? "gear" : "", dense ? "dense" : ""].join(" ");
      const tok = LO.tokenHTML(tab, e.id, { size: dense ? 40 : 44, ghost: !e.have && !e.gear, cls: e.gear ? "is-gray" : "" });
      return `<div class="it ${cls}" ${e.have || e.gear ? `data-src-kind="${tab}" data-src-id="${e.id}"` : ""} data-tip="${e.id}">${tok}<div class="tx"><div class="n">${tab === "xinfa" ? "《" + e.def.name + "》" : e.def.name}</div><div class="l">${line(tab, e)}</div></div>${atLabel(tab, e)}</div>`;
    }).join("");
    return { tabs, gl, body: `<div class="list ${o.cols ? "cols" : ""}">${body}</div>${extra}` };
  }
  function bindBox(root, tab) { root.querySelectorAll("[data-tip]").forEach((el) => LO.attachTip(el, tab, el.dataset.tip)); }

  // ================= 行囊（丹药按品质分格 · 出发前服用 · 符箓 · 锦囊） =================
  function pillHTML(id) {
    const P = CF.PILL[id], have = CF.PK.have[id] || {}, take = CF.PK.take[id] || {};
    const n = CF.takeN(id), cap = P.pre ? 1 : CF.PK.pillCap;
    const qs = Object.keys(have).map(Number).sort();
    return `<div class="cf-pill"><div class="ph"><b>${P.name}</b><span>${P.d}${P.key ? ` · 局内 ${P.key}` : ""}</span><span class="cnt ${n >= cap ? "full" : ""}">${n}/${cap}</span></div>
      <div class="qs">${qs.map((q) => {
        const t = take[q] || 0, hv = have[q];
        return `<div class="cf-q">${CF.tagHTML(id, q, { size: W.ps || 34, cls: t ? "" : "zero", n: t ? "×" + t : null, e: q })}<span class="qn"><a data-pill="${id}:${q}:-1" class="${t ? "" : "dis"}">－</a><b style="color:${CF.RQ[q].t}">${CF.RQ[q].s}</b>${t}/${hv}<a data-pill="${id}:${q}:1">＋</a></span></div>`;
      }).join("")}</div></div>`;
  }
  function packHTML(o = {}) {
    const PK = CF.PK;
    const pills = Object.keys(CF.PILL).filter((id) => !CF.PILL[id].pre);
    const pre = Object.keys(CF.PILL).filter((id) => CF.PILL[id].pre);
    const fus = PK.fu.map(([id, name, have, d]) => {
      const t = PK.fuTake[id] || 0;
      return `<div class="cf-q">${CF.tagHTML(id, 0, { size: W.ps || 34, cls: t ? "" : "zero", n: t ? "×" + t : null })}<span class="qn"><a data-fu="${id}:-1" class="${t ? "" : "dis"}">－</a>${t}/${have}<a data-fu="${id}:1">＋</a></span><span class="qn" style="color:var(--ink-dan)">${name}</span></div>`;
    }).join("");
    const pouch = `<div class="cf-pouch">${PK.pouch.items.map((it) => CF.tagHTML(it.id, it.q, { size: 38 })).join("")}${Array.from({ length: PK.pouch.cap - PK.pouch.items.length }, () => `<span class="em">囊</span>`).join("")}<span class="cf-sub" style="margin:0">贴身锦囊 · 身陨不失</span></div>`;
    return `<div class="cf-sub"><b>丹药囊</b> · ${CF.pillKinds()}/${PK.pillSlots} 种 · 每种 ${PK.pillCap} 枚 · 按品质分格</div>
      <div class="cf-pills">${pills.map(pillHTML).join("")}</div>
      <div class="cf-sub"><b>出发前服用</b> · 入图即服，持续本局</div>
      <div class="cf-pills">${pre.map(pillHTML).join("")}</div>
      ${o.noFu ? "" : `<div class="cf-sub"><b>符箓</b> · 每种至多 3 张</div><div class="cf-fus">${fus}</div>`}
      ${o.noPouch ? "" : `${pouch}`}`;
  }

  // ================= 交互（委托在 document 上） =================
  document.addEventListener("click", (ev) => {
    const p = ev.target.closest("[data-pill]");
    if (p) { const [id, q, d] = p.dataset.pill.split(":"); CF.pillStep(id, +q, +d); return; }
    const f = ev.target.closest("[data-fu]");
    if (f) { const [id, d] = f.dataset.fu.split(":"); CF.fuStep(id, +d); return; }
    const m = ev.target.closest("[data-mode]");
    if (m) { CF.ST.mode = m.dataset.mode; CF.emit(); return; }
    const sm = ev.target.closest("[data-srcmore]");
    if (sm) { LO.toast(`何处得：打开"功法来源"指引（战斗设计 · 功法体系 v2 出面板）`, "gold"); return; }
    const st = ev.target.closest("[data-stat]");
    if (st) {
      const k = st.dataset.stat;
      if (W.statSel === k) { W.statSel = null; CF.closePop(); return W.render(); }
      const idx = [...document.querySelectorAll(`[data-stat="${k}"]`)].indexOf(st);
      W.statSel = k; W.gearSel = null;
      W.render();
      const row = document.querySelectorAll(`[data-stat="${k}"]`)[Math.max(0, idx)], el = (row && row.querySelector("[data-anchor]")) || row;
      CF.openPop(el, CF.detailHTML(k), "stat:" + k, W.statSide || "right");
      return;
    }
    const g = ev.target.closest("[data-gear]");
    if (g) {
      const s = g.dataset.gear;
      if (W.gearSel === s) { W.gearSel = null; CF.closePop(); return W.render(); }
      W.gearSel = s; W.statSel = null;
      W.render();
      const el = document.querySelector(`[data-gear="${s}"]`);
      CF.openPop(el, CF.gearHTML(s), "gear:" + s, W.gearSide || "right");
    }
  });
  // 变化后：浮签内容跟着变（换装 → 属性明细同步）
  CF.reopen = (key) => {
    const [t, k] = key.split(":");
    CF.updatePop(t === "stat" ? CF.detailHTML(k) : CF.gearHTML(k));
  };
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".cf-pop") && !ev.target.closest("[data-pop]") && (W.statSel || W.gearSel)) { W.statSel = W.gearSel = null; W.render(); }
  });

  // 截图定状态：#stat=atk / #gear=sword
  function applyHash() {
    const H = CF.H;
    setTimeout(() => {
      if (H.stat) document.querySelector(`[data-stat="${H.stat}"]`)?.click();
      if (H.gear) document.querySelector(`[data-gear="${H.gear}"]`)?.click();
    }, 60);
  }

  const W = { statsHTML, legendHTML, modeHTML, xpHTML, gearRowHTML, slotHTML, barHTML, bindBar, boxHTML, bindBox, packHTML, TABS, statSel: null, gearSel: null, statSide: "right", gearSide: "right", render: () => {}, applyHash };
  window.W = W;
})();
