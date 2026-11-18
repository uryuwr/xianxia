// 奇遇对话框（模块 E）：宣纸底、墨框、朱砂印章；逐字显示，数字键 / 点击选择，空格 / 回车 / F 继续。
// 打开期间截获按键（捕获阶段），避免数字键触发丹药、WASD 走动；松键事件照常放行。
//   const d = new Dialog();
//   d.open({ glyph, name, title, lines: [{ who, text }], choices: [{ text, disabled, reason }], onChoose(i), onClose() })
//   d.advance() / d.choose(i) / d.close() / d.isOpen
const CSS = `
.qd-wrap { position: fixed; left: 50%; bottom: 92px; transform: translateX(-50%); width: min(820px, 92vw); z-index: 70; pointer-events: auto;
  font-family: var(--kai, "KaiTi", "STKaiti", serif); color: #15181b; user-select: none; animation: qd-in .22s ease-out; }
@keyframes qd-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
.qd-box { position: relative; display: flex; gap: 18px; padding: 18px 26px 16px 18px; background: linear-gradient(180deg, rgba(246,241,229,.97), rgba(236,228,208,.97));
  border: 2px solid #15181b; border-radius: 3px; box-shadow: 0 0 0 5px rgba(241,235,220,.75), 0 0 0 6px rgba(21,24,27,.55), 0 10px 30px rgba(0,0,0,.28); }
.qd-box:before { content: ""; position: absolute; inset: 6px; border: 1px solid rgba(21,24,27,.25); pointer-events: none; }
.qd-seal { flex: 0 0 64px; height: 64px; margin-top: 4px; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 900; color: #f4ecdc;
  background: #b8301c; border-radius: 4px; box-shadow: inset 0 0 0 3px #b8301c, inset 0 0 0 5px rgba(244,236,220,.7); transform: rotate(-3deg); }
.qd-seal.narr { background: #3a3c3e; box-shadow: inset 0 0 0 3px #3a3c3e, inset 0 0 0 5px rgba(244,236,220,.5); }
.qd-main { flex: 1; min-width: 0; }
.qd-who { font-size: 21px; font-weight: 900; letter-spacing: .12em; margin-bottom: 4px; }
.qd-who small { font-size: 14px; font-weight: 400; color: #6a6760; margin-left: 8px; letter-spacing: .05em; }
.qd-text { font-size: 19px; line-height: 1.65; min-height: 3.3em; white-space: pre-wrap; }
.qd-text.inner { color: #3a3c3e; font-style: italic; }
.qd-more { position: absolute; right: 16px; bottom: 8px; font-size: 13px; color: #6a6760; animation: qd-blink 1.1s infinite; }
@keyframes qd-blink { 50% { opacity: .25; } }
.qd-choices { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.qd-c { display: flex; gap: 10px; align-items: baseline; padding: 6px 12px; border: 1px solid rgba(21,24,27,.35); background: rgba(255,252,244,.6); cursor: pointer;
  font-size: 18px; transition: background .12s, border-color .12s; }
.qd-c:hover, .qd-c.hl { background: rgba(21,24,27,.9); color: #f4ecdc; border-color: #15181b; }
.qd-c b { font-weight: 900; color: #b8301c; min-width: 1.2em; }
.qd-c:hover b, .qd-c.hl b { color: #e0b45a; }
.qd-c.off { opacity: .45; cursor: not-allowed; background: transparent; color: #15181b; }
.qd-c.off:hover b { color: #b8301c; }
.qd-c i { font-style: normal; font-size: 14px; color: #8a4a3a; margin-left: auto; }
`;
const NUM = "一二三四五六";

export class Dialog {
  constructor() {
    this.root = null;
    this.state = null;
    this._key = (e) => this.onKey(e);
  }
  get isOpen() {
    return !!this.state;
  }
  ensureDom() {
    if (this.root) return;
    if (!document.getElementById("qd-css")) {
      const st = document.createElement("style");
      st.id = "qd-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const w = (this.root = document.createElement("div"));
    w.className = "qd-wrap";
    w.innerHTML = `<div class="qd-box"><div class="qd-seal"></div><div class="qd-main"><div class="qd-who"></div><div class="qd-text"></div><div class="qd-choices"></div></div><div class="qd-more">空格 · 继续</div></div>`;
    // 不让点击落到画布上（画布的鼠标按下会出招）
    for (const ev of ["mousedown", "pointerdown", "contextmenu", "wheel"]) w.addEventListener(ev, (e) => e.stopPropagation());
    w.addEventListener("click", (e) => {
      if (!e.target.closest(".qd-c")) this.advance();
    });
    this.$ = (s) => w.querySelector(s);
  }
  open(o) {
    this.ensureDom();
    if (!this.root.parentNode) document.body.appendChild(this.root);
    if (!this.state) addEventListener("keydown", this._key, !0);
    this.state = { ...o, i: 0, typed: 0, timer: null, picked: !1 };
    this.showLine();
  }
  showLine() {
    const s = this.state;
    const L = s.lines[s.i] || { who: "", text: "" };
    const narr = !L.who;
    const seal = this.$(".qd-seal");
    seal.textContent = narr ? "墨" : L.who === s.me ? s.me[0] || "我" : s.glyph || L.who[0];
    seal.classList.toggle("narr", narr || L.who === s.me);
    this.$(".qd-who").innerHTML = narr ? `<small>${s.name || ""}</small>` : `${L.who}${L.who !== s.me && s.title ? `<small>${s.title}</small>` : ""}`;
    const tx = this.$(".qd-text");
    tx.classList.toggle("inner", L.who === s.me && /^（/.test(L.text));
    tx.textContent = "";
    this.$(".qd-choices").innerHTML = "";
    this.$(".qd-more").style.display = "none";
    clearInterval(s.timer);
    s.typed = 0;
    s.full = L.text;
    s.timer = setInterval(() => {
      s.typed += 2;
      tx.textContent = s.full.slice(0, s.typed);
      if (s.typed >= s.full.length) this.finishLine();
    }, 32);
  }
  finishLine() {
    const s = this.state;
    if (!s) return;
    clearInterval(s.timer);
    s.timer = null;
    s.typed = s.full.length;
    this.$(".qd-text").textContent = s.full;
    const last = s.i >= s.lines.length - 1;
    if (last && s.choices && s.choices.length) this.showChoices();
    else this.$(".qd-more").style.display = "";
    this.$(".qd-more").textContent = last && !(s.choices && s.choices.length) ? "空格 · 离开" : "空格 · 继续";
  }
  showChoices() {
    const s = this.state, box = this.$(".qd-choices");
    box.innerHTML = "";
    s.choices.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = "qd-c" + (c.disabled ? " off" : "");
      el.innerHTML = `<b>${NUM[i]}</b><span>${c.text}</span>${c.disabled && c.reason ? `<i>${c.reason}</i>` : ""}`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.choose(i);
      });
      box.appendChild(el);
    });
    s.showing = !0;
  }
  // 空格 / 点击：先补全当前句，再进入下一句；最后一句且没有选项时关闭
  advance() {
    const s = this.state;
    if (!s) return;
    if (s.timer) return this.finishLine();
    if (s.i < s.lines.length - 1) {
      s.i++;
      return this.showLine();
    }
    if (s.choices && s.choices.length) return;
    this.close(!0);
  }
  choose(i) {
    const s = this.state;
    if (!s || s.picked) return !1;
    if (s.i < s.lines.length - 1 || s.timer) {
      // 跳过剩余台词直接到选项
      s.i = s.lines.length - 1;
      this.showLine();
      this.finishLine();
    }
    const c = s.choices && s.choices[i];
    if (!c || c.disabled) return !1;
    s.picked = !0;
    const cb = s.onChoose;
    this.close(!1);
    cb && cb(i);
    return !0;
  }
  close(fire = !0) {
    const s = this.state;
    if (!s) return;
    clearInterval(s.timer);
    this.state = null;
    removeEventListener("keydown", this._key, !0);
    if (this.root && this.root.parentNode) this.root.remove();
    if (fire && s.onClose) s.onClose();
  }
  onKey(e) {
    if (!this.state) return;
    const c = e.code;
    const m = /^(Digit|Numpad)([1-6])$/.exec(c);
    if (m) this.choose(+m[2] - 1);
    else if (c === "Space" || c === "Enter" || c === "KeyF" || c === "NumpadEnter") this.advance();
    else if (c === "Escape" && !e.repeat && !(this.state.choices && this.state.choices.length)) this.close(!0); // 没有选项：Esc 跳过余下台词并离开（与空格读完一致）；有选项须选择
    else if (/^F\d+$/.test(c)) return; // F1~F12 放行；Tab / Esc 等一律截住，免得打开背包、暂停
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  dispose() {
    this.close(!1);
    this.root = null;
  }
}

// 主角心声：画面中上方一行淡墨小字，几秒后淡出（不暂停、不截按键）
const THOUGHT_CSS = `
.qd-thought { position: fixed; left: 50%; top: 22%; transform: translateX(-50%); z-index: 65; pointer-events: none; max-width: 70vw; text-align: center;
  font-family: var(--kai, "KaiTi", "STKaiti", serif); font-size: 22px; color: #1b1d1f; letter-spacing: .08em; padding: 8px 22px;
  background: radial-gradient(ellipse at center, rgba(241,235,220,.92) 0%, rgba(241,235,220,.75) 55%, rgba(241,235,220,0) 100%);
  animation: qd-th 3.6s ease-in-out forwards; }
.qd-thought b { font-size: 15px; color: #6a6760; font-weight: 400; margin-right: 10px; }
@keyframes qd-th { 0% { opacity: 0; transform: translate(-50%, 8px); } 12% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -6px); } }
`;
export function showThought(text, who = "") {
  if (!text) return null;
  if (!document.getElementById("qd-th-css")) {
    const st = document.createElement("style");
    st.id = "qd-th-css";
    st.textContent = THOUGHT_CSS;
    document.head.appendChild(st);
  }
  for (const old of document.querySelectorAll(".qd-thought")) old.remove();
  const el = document.createElement("div");
  el.className = "qd-thought";
  el.innerHTML = `${who ? `<b>${who}</b>` : ""}${text}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3700);
  return el;
}
