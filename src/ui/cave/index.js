// 洞府界面（模块 C）：洞府画面上的界面（挂签、左侧题名与资源、今日可办、出行印）+ 全屏设施页。
//   const ui = new CaveUI(cave)；ui.mount() / ui.unmount()
//   ui.open(stationId, tab) / ui.close() / ui.render()   设施页
//   ui.update(camera, nearId)                           每帧：挂签位置、交互提示
//   ui.refreshHud()                                     存档变化后刷新
import { caveStyle, ART } from "./style.js";
import { el, btn, paper, Tags, Say, toast, confirm } from "./widgets.js";
import { PANELS } from "./panels.js";
import * as F from "../../game/cave/facilities.js";
import { STATIONS, itemName } from "../../game/cave/data.js";
import { defOf } from "../../core/items.js";
import { xpNeed } from "../../game/progression.js";
import { innerTodo } from "../../game/inner_rules.js";
import * as THREE from "three";

// 天机镜 v2：懒加载（第一次打开时才加载脚本与样式；界面在打开时构建、合上即移除）
let mirrorMod = null;
const loadMirror = () => (mirrorMod = mirrorMod || import("./mirror_v2.js"));
let innerMod = null;
const loadInner = () => (innerMod = innerMod || import("./loadout_hall.js").catch((e) => { innerMod = null; throw e; }));
let gardenMod = null;
const loadGarden = () => (gardenMod = gardenMod || import("./garden_v2.js").catch((e) => { gardenMod = null; throw e; }));

const _v = new THREE.Vector3();
const NUM = (n) => n.toLocaleString("en-US");
const JIE = ["", "一阶", "二阶", "三阶"];

export class CaveUI {
  constructor(cave) {
    this.cave = cave;
    this.sel = {};
    this.cur = null;
    this.tab = null;
  }
  get p() {
    return this.cave.p;
  }
  mount() {
    this.ready = caveStyle();
    // 书法字体按需加载：先把设施页用到的两套字体载入，免得第一次打开时排版两遍
    if (document.fonts && document.fonts.load) for (const f of ['40px "MaShanZheng"', '58px "ZhiMangXing"']) document.fonts.load(f, "灵泉炼化境界突破丹器房仓库出行").catch(() => {});
    this.root = el("div", "cv-root");
    document.body.appendChild(this.root);
    this.tags = new Tags(this.root, (id) => this.cave.goTo(id));
    this.hud = el("div", "cv-box");
    this.root.appendChild(this.hud);
    this.speech = new Say(this.root);
    this._key = (e) => {
      if (this.root.querySelector(".cv-modal,.cv-break,.cv-wipe")) return;
      if (e.code === "Escape" && this.cur) this.fire && this.fire.leave ? this.fire.leave(() => this.close()) : !this.fire && this.close(); // 开炉中 Esc：问一句再离炉
      else if (!this.cur && !this.cave.trial && !this.cave.locked) {
        if (e.code === "KeyC") this.cave.open("spring");
        else if (e.code === "KeyM" && !e.repeat) this.showMirrors();
      }
    };
    addEventListener("keydown", this._key);
    this._resize = () => this.root && this.root.style.setProperty("--k", Math.min(innerWidth / 1280, innerHeight / 720).toFixed(4));
    addEventListener("resize", this._resize);
    this._resize();
    this.tags.k = Math.min(innerWidth / 1280, innerHeight / 720);
    this.refreshHud();
  }
  unmount() {
    this.close();
    removeEventListener("keydown", this._key);
    removeEventListener("resize", this._resize);
    if (this.mirror && this.mirror.alive) this.mirror.close();
    this.speech && this.speech.clear();
    this.root && this.root.remove();
    this.root = null;
  }
  hidden(on) {
    this.root && this.root.classList.toggle("hidden", on);
  }
  toast(t, kind, dur, icon, action) {
    return this.root && toast(this.root, t, kind, dur, icon, action);
  }
  confirm(title, text, o) {
    return confirm(this.root, title, text, o);
  }
  say(lines, who) {
    this.speech.say(lines, who);
  }
  busy(on) {
    if (this.page) this.page.classList.toggle("cv-busy", on);
  }

  // ---------------- 洞府画面上的界面（cave.png） ----------------
  refreshHud() {
    if (!this.root) return;
    const p = this.p;
    const c = F.caveState(p);
    const tier = F.caveTier(p);
    const jie = tier < 0.34 ? 1 : tier < 0.75 ? 2 : 3;
    const name = c.region !== "r1" ? "竹溪洞府" : tier < 0.2 ? "破洞府" : "青岚洞府";
    const need = xpNeed(p);
    const cnt = (pred) => p.storage.items.filter((it) => pred(defOf(it) || {})).reduce((n, it) => n + (it.n || 1), 0);
    const mats = cnt((d) => ["herb", "ore", "beast", "core", "treasure"].includes(d.cat));
    const pills = cnt((d) => d.cat === "pill");
    const h = this.hud;
    h.innerHTML = "";
    const side = el("div", "abs cv-side");
    side.innerHTML = `<div class="t ink-splash">${name}</div><div class="ink-tiba">${c.region !== "r1" ? "竹声满院 · 溪月照人" : "山不在高 · 有灵则名"}<span class="ink-seal two" style="--s:30px">${JIE[jie]}</span></div>`;
    h.appendChild(side);
    const res = el("div", "abs cv-res");
    res.innerHTML = `<div class="c"><span class="ink-seal round gold" style="--s:26px;font-size:12px">石</span><span class="n">${NUM(p.storage.count(F.STONE()))}<small>灵石</small></span></div>
      <div class="c"><span class="ink-seal round green" style="--s:26px;font-size:12px">材</span><span class="n">${NUM(mats)}<small>灵材</small></span></div>
      <div class="c"><span class="ink-seal round blue" style="--s:26px;font-size:12px">丹</span><span class="n">${NUM(pills)}<small>丹药</small></span></div>
      <div class="c"><span class="ink-seal round" style="--s:26px;font-size:12px">修</span><span class="n">${NUM(p.xp)}<small>/ ${NUM(need)}</small></span></div>`;
    h.appendChild(res);
    // 今日可办
    const td = F.todos(p), inner = innerTodo(p);
    // 为内观阁留一个可见待办；不把有东西可装的空栏埋在四条截断之外。
    if (inner) td.splice(Math.min(3, td.length), 0, { ...inner, fac: "loadout", go: { fac: "loadout", tab: inner.tab } });
    const glow = this.cave.scene?.groups.loadout?.userData.innerGlow;
    if (glow) glow.visible = !!inner;
    const today = paper("abs cv-today alt");
    today.insertAdjacentHTML("beforeend", `<div class="ink-h">今日可办<small>点一下直达</small></div>`);
    const cols = el("div", "cols ink-list");
    if (!td.length) today.appendChild(el("div", "none", "诸事已毕，可以出行了。"));
    for (const t of td.slice(0, 4)) {
      const [k, v] = t.text.includes("：") ? t.text.split("：") : [STATIONS[t.fac].short, t.text];
      const r = el("div", "ink-row" + (t.hot ? " hot" : ""), `<span class="k">${k}</span><span class="v">${v}</span>`);
      r.dataset.fac = t.fac;
      r.addEventListener("click", () => this.cave.goTo(t.go ? t.go.fac : t.fac, t.go || {}));
      cols.appendChild(r);
    }
    today.appendChild(cols);
    h.appendChild(today);
    // 右下：境界、内观阁、天机镜、出行；C 继续属于灵泉，不新增抢占快捷键。
    const go = el("div", "abs cv-go");
    go.appendChild(btn("境界", () => this.cave.open("spring"), { key: "C", id: "hud-realm" }));
    go.appendChild(btn("内观阁", () => this.cave.open("loadout"), { id: "hud-loadout" }));
    go.appendChild(btn("天机镜", () => this.showMirrors(), { key: "M", id: "hud-mirror" }));
    go.appendChild(btn("出行", () => this.cave.goTo("depart"), { seal: !0, id: "hud-depart" }));
    h.appendChild(go);
    this.hint = el("div", "abs cv-hint off");
    h.appendChild(this.hint);
    for (const e of h.children) {
      e.addEventListener("mousedown", (ev) => ev.stopPropagation());
      // 鼠标在界面上时不判定建筑悬停
      e.addEventListener("mouseenter", () => (this.cave.overUi = !0));
      e.addEventListener("mouseleave", () => (this.cave.overUi = !1));
    }
    // 挂签
    const ups = (ids) => ids.some((id) => F.upgradeInfo(p, id).ok);
    const brew = F.recipes().alchemy.filter((r) => F.alchemyCanStart(p, r).ok);
    const b = F.breakInfo(p);
    const un = F.unidentified(p).length;
    const study = F.studyList(p).filter((e) => e.ready && !e.learned);
    const tag = {
      spring: {
        name: "灵泉", lv: JIE[F.facLevel(p, "spring")],
        hint: p.xp >= need ? (b.ok ? "修为圆满 · <b>可突破</b>" : "修为圆满 · 缺" + b.need.filter((x) => x.type === "item").map((x) => x.name).join("、")) : p.storage.count(F.STONE()) || F.refinables(p).length ? `距下一层 <b>${need - p.xp}</b> 修为` : "",
        dot: (p.xp >= need && b.ok) || (p.xp < need && (p.storage.count(F.STONE()) > 0 || F.refinables(p).length > 0)),
      },
      workshop: {
        name: "丹器房", lv: F.facLevel(p, "furnace") ? "丹炉" + JIE[F.facLevel(p, "furnace")] : "丹炉 · " + F.facLockText("furnace"),
        hint: brew.length ? `${brew[0].name} <b>可炼</b>` : ups(["furnace", "forge"]) ? "<b>可修缮</b>" : "",
        dot: brew.length > 0 || ups(["furnace", "forge"]),
      },
      garden: {
        name: "药园", lv: `${F.gardenPlots(p).length} 块地`,
        hint: F.ripePlots(p).length ? `<b>${F.ripePlots(p).length}</b> 株可采收` : ups(["garden"]) ? "<b>可扩建</b>" : F.gardenPlots(p).some((x) => !x) && F.seeds(p).length ? "空地 · 可移栽" : "移栽灵草 · 随出行生长",
        dot: !1,
      },
      storage: {
        name: "仓库", lv: "",
        hint: un ? `未鉴定 <b>${un}</b>` : study.length ? `${study[0].name} · <b>可悟</b>` : "",
        dot: un > 0 || study.length > 0,
      },
      depart: { name: "出行台", lv: "", hint: "", dot: !1 },
      loadout: { name: "内观阁", lv: "", hint: inner ? "有空栏 · 可装配功法" : "内观己身 · 整装备战", dot: !1 },
      mirror: (() => {
        const mu = F.mirrorUnread(p);
        return { name: "天机镜", lv: "", hint: mu.msg ? "<b>有一条消息</b>" : mu.realm ? "<b>新记一条</b>" : "", dot: !1 };
      })(),
    };
    // 建筑上不常驻文字、不放红点：挂签只在悬停 / 靠近时淡入，待办统一在"今日可办"
    for (const id of Object.keys(STATIONS)) this.tags.set(id, { ...tag[id], dot: !1 });
    void itemName;
  }
  // 每帧
  update(camera, near, hover) {
    if (!this.root) return;
    const W = innerWidth, H = innerHeight;
    this.tags.k = Math.min(W / 1280, H / 720);
    const hide = !!this.cur || !!this.cave.trial || !!(this.mirror && this.mirror.alive);
    for (const [id, s] of Object.entries(this.cave.scene.stations)) {
      _v.set(s.pos.x, s.pos.y + s.tagY, s.pos.z).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && !hide && (near === id || hover === id);
      this.tags.place(id, (_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, vis, near === id);
    }
    this.hud.style.display = hide ? "none" : "";
    const show = near && !hide && !this.cave.locked;
    if (show) {
      const S = STATIONS[near];
      const html = `<b>F</b>${S.name}<small>${S.key}</small>`;
      if (this.hint.innerHTML !== html) this.hint.innerHTML = html;
    }
    this.hint.classList.toggle("off", !show);
  }

  // ---------------- 全屏设施页 ----------------
  open(id, tab) {
    if (id === "workshop" && tab === "garden") (id = "garden"), (tab = null);
    if (!PANELS[id]) return;
    if (this.cur === "garden" && id !== "garden") this.disposeGarden();
    if (this.cur !== id) this.sel = {};
    this.cur = id;
    this.tab = tab || (PANELS[id].tabs ? PANELS[id].tabs[0][0] : null);
    this.root.classList.add("paging");
    this.render();
  }
  close() {
    if (!this.cur) return;
    this.disposeGarden();
    const inner = this.inner;
    this.inner = null;
    this._innerToken = null; // 关闭发生在 import / enter 未完成时，迟到的结果不再挂载
    if (inner) inner.dispose();
    this.fire = null;
    this.cur = null;
    if (this.page) this.page.remove();
    this.page = null;
    this.root.classList.remove("paging");
    this.refreshHud();
    this.cave.onPanelClosed();
  }
  render() {
    if (!this.root || !this.cur) return;
    if (this.cur === "loadout") return this.inner?.render();
    if (this.cur === "garden") return this.renderGarden();
    const id = this.cur;
    const keep = this.page && this.page.dataset.id === id;
    const old = this.page;
    const pg = (this.page = el("div", "cv-page" + (keep ? " keep" : "")));
    pg.dataset.id = id;
    const box = el("div", "cv-box");
    pg.appendChild(box);
    pg.addEventListener("mousedown", (e) => e.stopPropagation());
    pg.addEventListener("wheel", (e) => e.stopPropagation());
    PANELS[id].render(this, box);
    if (old) old.replaceWith(pg);
    else this.root.appendChild(pg);
  }
  // 药园按需加载，等待期间也只保留一个页面；迟到的 import 不可复活已关闭设施。
  renderGarden() {
    if (this.gardenView) return this.gardenView.render();
    if (this._gardenToken) return;
    const token = (this._gardenToken = {}), root = this.root;
    const old = this.page, pg = (this.page = el("div", "cv-page"));
    pg.dataset.id = "garden";
    const box = el("div", "cv-box");
    pg.appendChild(box);
    pg.addEventListener("mousedown", (e) => e.stopPropagation());
    pg.addEventListener("wheel", (e) => e.stopPropagation());
    if (old) old.replaceWith(pg); else root.appendChild(pg);
    loadGarden().then((mod) => {
      if (this._gardenToken !== token || this.root !== root || this.cur !== "garden" || this.page !== pg) return;
      this.gardenView = new mod.GardenV2(this, box);
      PANELS.garden.render(this, box);
      if (this._gardenFlash) this.gardenView.flash(this._gardenFlash);
      this._gardenFlash = null;
    }).catch((e) => {
      if (this._gardenToken !== token) return;
      this.disposeGarden();
      this.close();
      this.toast("药园暂未载入，请重新打开。", "zhu");
      console.error("[cave] 药园载入失败", e);
    });
  }
  disposeGarden() {
    this._gardenToken = null;
    this._gardenFlash = null;
    this.gardenView?.dispose();
    this.gardenView = null;
  }
  // 页面公用：左上标题 + 一笔 + 阶印 + 标签页
  head(box, title, seal, tabs) {
    const h = el("div", "abs pg-head", `<span class="ink-title">${title}</span><div class="ink-rule" style="width:140px"></div>${seal ? `<span class="ink-seal two" style="--s:30px">${seal}</span>` : ""}`);
    if (tabs) {
      const t = el("div", "ink-tabs");
      for (const [k, n, locked] of tabs) {
        const e = el("span", "ink-tab" + (this.tab === k ? " on" : "") + (locked ? " locked" : ""), n);
        e.dataset.tab = k;
        e.addEventListener("click", () => {
          if (this.fire) return this.toast("炉火正旺，离不得人", "zhu");
          this.tab = k;
          this.sel = {};
          this.render();
        });
        t.appendChild(e);
      }
      h.appendChild(t);
    }
    box.appendChild(h);
    return h;
  }
  // 页面公用：右下"回洞府 Esc" + 朱印
  go(box, seal, onSeal, o = {}) {
    const g = el("div", "abs pg-go");
    if (o.extra) for (const e of [].concat(o.extra)) g.appendChild(e);
    g.appendChild(btn("回洞府", () => this.close(), { key: "Esc", id: "close" }));
    if (seal) g.appendChild(btn(seal, onSeal, { seal: !0, disabled: o.disabled, id: o.id }));
    box.appendChild(g);
    return g;
  }
  // 三张设施页各在屏幕上"画"一帧（几乎透明、不可点），让遮罩、纸纹、立绘、字形完成首次栅格化；
  // 第一次进洞府时在加载遮罩下做（每帧一张），之后打开页面就不卡第一帧
  prewarm() {
    return this.prewarmPages();
  }
  prewarmPages() {
    if (!this.root) return Promise.resolve();
    if (this._warm) return this._warm;
    const ids = ["spring", "workshop", "storage"];
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    this._warm = (async () => {
      await this.ready;
      // 先把立绘 / 插画各画一帧（大图的首次上传分到不同帧），再画整页
      for (const url of Object.values(ART)) {
        if (!this.root || !url) continue;
        const im = el("div", "");
        im.style.cssText = `position:absolute;left:0;top:0;width:600px;height:1000px;opacity:.002;pointer-events:none;background:url('${url}') 0 0/100% 100% no-repeat`;
        this.root.appendChild(im);
        await frame();
        await frame();
        im.remove();
      }
      for (const id of ids) {
        if (!this.root) return;
        const fake = Object.create(this, { sel: { value: {}, writable: !0 }, tab: { value: PANELS[id].tabs ? PANELS[id].tabs[0][0] : null, writable: !0 } });
        const pg = el("div", "cv-page keep");
        pg.style.cssText = "opacity:.002;pointer-events:none";
        const box = el("div", "cv-box");
        pg.appendChild(box);
        try {
          PANELS[id].render(fake, box);
        } catch (e) {
          console.warn("[cave] 预热失败", id, e);
        }
        // 大页面分两次画：先只画左半（立绘、墨晕），下一轮再画全页
        const halves = [...pg.querySelectorAll(".album .page")];
        if (halves.length > 1) {
          halves[1].style.visibility = "hidden";
          this.root.appendChild(pg);
          await frame();
          await frame();
          halves[1].style.visibility = "";
        } else this.root.appendChild(pg);
        if (window.__caveProfile) console.log("[cave-t] page " + id + " @" + Math.round(performance.now() - (window.__T0 ? window.__T0() : 0)));
        await frame();
        await frame();
        pg.remove();
      }
    })();
    return this._warm;
  }
  // 3D 位置上浮起一行字（采收"名称 ×数量"），1.4 秒淡出
  floatAt(pos, html, color) {
    if (!this.root) return;
    const cam = this.cave.ctx.camera || (this.cave.ctx.rig && this.cave.ctx.rig.cam);
    _v.copy(pos).project(cam);
    const e = el("div", "cv-float", html);
    e.style.left = ((_v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + "px";
    e.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + "px";
    if (color) e.style.color = color;
    this.root.appendChild(e);
    setTimeout(() => e.remove(), 1500);
  }
  // 让页面上的某个按钮闪两下（从"今日可办"跳过来时指明要点哪里）
  flash(act) {
    if (this.cur === "garden") {
      if (this.gardenView) this.gardenView.flash(act);
      else this._gardenFlash = act;
      return;
    }
    requestAnimationFrame(() => {
      const e = this.page && this.page.querySelector(`[data-act="${act}"]`);
      if (!e) return;
      e.classList.remove("cv-flash");
      void e.offsetWidth;
      e.classList.add("cv-flash");
      if (e.scrollIntoView) e.scrollIntoView({ block: "nearest" });
    });
  }
  // 加载遮罩：第一次进洞府 / 搬迁时，场景在后面分帧构建
  loading(on) {
    if (!this.root) return;
    let v = this.root.querySelector(".cv-loading");
    if (on) {
      if (!v) (v = el("div", "cv-loading", `<div class="ink-splash">洞府</div><div class="ink-note">墨迹未干……</div>`)), this.root.appendChild(v);
      v.classList.remove("out");
    } else if (v) {
      v.classList.add("out");
      setTimeout(() => v.remove(), 350);
    }
  }
  // 与出行准备共用构建器；这里只保管挂载与取消 token，不复制备战逻辑。
  async openInner(o = {}) {
    if (this.cur === "garden") this.disposeGarden();
    const token = (this._innerToken = {}), root = this.root;
    this.cur = "loadout";
    this.tab = o.tab || "stat";
    root.classList.add("paging");
    let mod;
    try { mod = await loadInner(); }
    catch (e) {
      if (this._innerToken !== token) return null;
      throw e;
    }
    if (!this.root || this.root !== root || this._innerToken !== token || this.cur !== "loadout") return null;
    const hall = (this.inner = new mod.LoadoutHall(this, o));
    await hall.open();
    if (this._innerToken !== token || this.inner !== hall) return null;
    return hall;
  }
  // 天机镜：按 M、右下“天机镜”按钮、灵泉页的“天机镜 · 已亮 N 段”都走这里（由洞府统一处理锁定、镜台闪光、已读）
  showMirrors(o) {
    return this.cave.openMirror(o);
  }
  // 洞府调用：懒加载天机镜界面并打开；返回 MirrorV2 实例（.done 在合上后 resolve）
  async openMirror(o = {}) {
    const mod = await loadMirror();
    if (!this.root) return null;
    this.mirror = new mod.MirrorV2(this, o);
    return this.mirror;
  }
}
