// 录制用"虚拟时钟"（作为 Playwright initScript 注入，先于游戏脚本执行；不改 src/ 下的任何代码）。
// 两种模式：
//   real  正常运行：performance.now / rAF / 定时器都跟真实时间走（加载、布置场景时用）
//   step  逐帧推进：时间冻结，只有录制脚本调用 __vt.step(ms) 时才前进 ms 毫秒——依次触发到期的定时器、跑一帧 rAF
//         （游戏主循环在这里渲染）、把所有 CSS 动画 / 过渡对齐到虚拟时间。之后截图就是严格等间隔的一帧。
// 这样不论截图多慢，成片都是稳定 30fps；慢动作 = 每帧推进更短的时间（游戏本身的画面，不是后期插帧）。
(() => {
  if (window.__vt) return;
  const RP = performance.now.bind(performance);
  const RD = Date.now.bind(Date);
  const rRAF = window.requestAnimationFrame.bind(window);
  const rST = window.setTimeout.bind(window);
  const rCT = window.clearTimeout.bind(window);
  const dateBase = RD() - RP();
  let stepping = !1, off = 0, vnow = 0;
  const now = () => (stepping ? vnow : RP() + off);
  performance.now = now;
  Date.now = () => Math.floor(dateBase + now());

  // ---- rAF ----
  let rafId = 0, pumpArmed = !1;
  const rafQ = new Map();
  const runRaf = () => {
    const q = [...rafQ];
    rafQ.clear();
    const t = now();
    for (const [, cb] of q)
      try {
        cb(t);
      } catch (e) {
        console.error("[vt raf]", e && e.stack);
      }
  };
  const pump = () => {
    pumpArmed = !1;
    if (!stepping) runRaf();
  };
  const armPump = () => {
    if (!pumpArmed && !stepping) (pumpArmed = !0), rRAF(pump);
  };
  window.requestAnimationFrame = (cb) => {
    const id = ++rafId;
    rafQ.set(id, cb);
    armPump();
    return id;
  };
  window.cancelAnimationFrame = (id) => rafQ.delete(id);

  // ---- 定时器（始终按虚拟时间排序）----
  let tid = 0, realT = 0;
  const timers = new Map();
  const add = (cb, ms, args, iv) => {
    const id = ++tid;
    ms = Math.max(0, Number(ms) || 0);
    timers.set(id, { due: now() + ms, cb, args, iv: iv ? Math.max(1, ms) : 0, seq: id });
    armReal();
    return id;
  };
  const earliest = (limit) => {
    let best = null, bid = 0;
    for (const [id, t] of timers) if (t.due <= limit && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) (best = t), (bid = id);
    return best ? [bid, best] : null;
  };
  const fire = (id, t) => {
    if (t.iv) (t.due += t.iv), (t.seq = ++tid);
    else timers.delete(id);
    try {
      typeof t.cb === "function" && t.cb(...(t.args || []));
    } catch (e) {
      console.error("[vt timer]", e && e.stack);
    }
  };
  function armReal() {
    if (stepping) return;
    rCT(realT);
    let min = Infinity;
    for (const t of timers.values()) min = Math.min(min, t.due);
    if (min === Infinity) return;
    realT = rST(() => {
      if (stepping) return;
      const e = earliest(now());
      if (e) fire(e[0], e[1]);
      armReal();
    }, Math.max(0, min - now()));
  }
  window.setTimeout = (cb, ms, ...args) => add(cb, ms, args, !1);
  window.setInterval = (cb, ms, ...args) => add(cb, ms, args, !0);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);

  // 宏任务间隙：让 Promise 链跑完
  const flush = () =>
    new Promise((r) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => r();
      ch.port2.postMessage(0);
    });

  // ---- CSS 动画 / 过渡 / WAAPI ----
  let A = new WeakMap();
  const syncAnims = () => {
    for (const a of document.getAnimations()) {
      let s = A.get(a);
      if (!s) {
        const ct = a.currentTime == null ? 0 : Number(a.currentTime);
        s = { start: vnow - ct / (a.playbackRate || 1), done: a.playState === "finished" };
        A.set(a, s);
        if (!s.done && a.playState !== "paused") a.pause();
        else if (a.playState === "paused") s.user = !0; // 游戏自己暂停的动画不碰
      }
      if (s.done || s.user) continue;
      const t = (vnow - s.start) * (a.playbackRate || 1);
      let end = Infinity;
      try {
        end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      } catch {}
      if (Number.isFinite(end) && t >= end) {
        s.done = !0;
        try {
          a.finish();
        } catch {}
        continue;
      }
      try {
        a.currentTime = Math.max(0, t);
      } catch {}
    }
  };

  window.__vt = {
    get stepping() {
      return stepping;
    },
    now,
    // 进入逐帧模式
    begin() {
      if (stepping) return vnow;
      vnow = RP() + off;
      stepping = !0;
      A = new WeakMap();
      rCT(realT);
      syncAnims();
      return vnow;
    },
    // 回到实时模式
    end() {
      if (!stepping) return;
      syncAnims();
      for (const a of document.getAnimations()) {
        const s = A.get(a);
        if (s && !s.done && !s.user && a.playState === "paused") a.play();
      }
      off = vnow - RP();
      stepping = !1;
      armReal();
      if (rafQ.size) armPump();
    },
    // 推进 ms 毫秒并跑一帧
    async step(ms = 1000 / 30) {
      if (!stepping) this.begin();
      const target = vnow + ms;
      for (let guard = 0; guard < 500; guard++) {
        const e = earliest(target);
        if (!e) break;
        vnow = Math.max(vnow, e[1].due);
        fire(e[0], e[1]);
        await flush();
      }
      vnow = target;
      await flush();
      runRaf();
      await flush();
      syncAnims();
      return vnow;
    },
    // root 里还有多少个没播完的有限时长动画 / 过渡（界面"稳定"检测用）
    busy(sel) {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return -1;
      let n = 0;
      for (const a of document.getAnimations()) {
        const t = a.effect && a.effect.target;
        if (!t || !(root === t || root.contains(t))) continue;
        let end = Infinity;
        try {
          end = a.effect.getComputedTiming().endTime;
        } catch {}
        if (!Number.isFinite(end)) continue;
        const s = A.get(a);
        if (s ? !s.done : a.playState === "running") n++;
      }
      return n;
    },
    // 所有动画从头开始（字卡渲染用：字体加载完再从 0 播）
    restartAnims() {
      for (const a of document.getAnimations()) {
        A.set(a, { start: vnow, done: !1 });
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
      }
    },
    // 推进但不截图时用（例如等加载）：n 帧
    async skip(n, ms = 1000 / 30) {
      for (let i = 0; i < n; i++) await this.step(ms);
    },
  };
})();
